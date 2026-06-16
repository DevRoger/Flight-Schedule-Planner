// CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCJ4zqkQi5SAvyiheb9IzR1v_goGNCeZa0",
  authDomain: "aeroschedule-f367b.firebaseapp.com",
  projectId: "aeroschedule-f367b",
  storageBucket: "aeroschedule-f367b.firebasestorage.app",
  messagingSenderId: "1093597461614",
  appId: "1:1093597461614:web:c15bd3d9261d920c05ba7f",
  measurementId: "G-B06BJYJM0V",
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Bases de datos locales sincronizadas
let standsData = [];
let flightsData = [];

const airports = ["BCN", "EZE", "BOG", "XPL", "GYE"];

// === INICIALIZACIÓN DE LA APP ===
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").checked = true;
  }

  const selects = ["origin", "destination", "editOrigin", "editDestination"];
  selects.forEach((id) => {
    const sel = document.getElementById(id);
    airports.forEach(
      (ap) => (sel.innerHTML += `<option value="${ap}">${ap}</option>`),
    );
  });

  const today = new Date().toISOString().split("T")[0];
  const dateInputs = ["currentViewDate", "depDate", "arrDate"];
  dateInputs.forEach((id) => (document.getElementById(id).value = today));

  // === ESCUCHAS EN TIEMPO REAL (Firestore) ===
  db.collection("stands")
    .orderBy("order", "asc")
    .onSnapshot((snapshot) => {
      standsData = [];
      snapshot.forEach((doc) => standsData.push({ id: doc.id, ...doc.data() }));
      updateStandSelects();
      renderTimeline();
    });

  db.collection("flights").onSnapshot((snapshot) => {
    flightsData = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      flightsData.push({
        id: doc.id,
        ...data,
        departureObj: data.departureObj ? data.departureObj.toDate() : null,
        arrivalObj: data.arrivalObj ? data.arrivalObj.toDate() : null,
      });
    });
    renderTimeline();
  });

  updateZoom();
});

// === TEMA Y DISEÑO ===
function toggleTheme() {
  const isDark = document.getElementById("themeToggle").checked;
  if (isDark) {
    document.body.classList.add("dark-mode");
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark-mode");
    localStorage.setItem("theme", "light");
  }
}

function getContrastColor(hexcolor) {
  if (!hexcolor) return "#ffffff";
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#202124" : "#ffffff";
}

// === CONTROL DE ZOOM ===
function updateZoom() {
  const zoomLevel = document.getElementById("zoomSlider").value;
  const scrollArea = document.getElementById("timelineScrollArea");

  // Cambiamos el ancho del contenedor en porcentaje (100% a 600%)
  scrollArea.style.width = `${zoomLevel}%`;

  // === NUEVO: Recalcular micro-eventos en tiempo real al deslizar ===
  const blocks = document.querySelectorAll(".flight-block");
  blocks.forEach((block) => {
    // Leemos el ancho que tiene asignado y lo cruzamos con el nivel de zoom
    const widthPercent = parseFloat(block.style.width);
    const effectiveVisualPercent = widthPercent * (zoomLevel / 100);

    if (effectiveVisualPercent < 4) {
      block.classList.add("micro-event");
    } else {
      block.classList.remove("micro-event");
    }
  });
}

// === GESTIÓN DE STANDS EN FIRESTORE ===
function addStand() {
  const nameInput = document.getElementById("newStandName");
  const colorInput = document.getElementById("standColor");
  const name = nameInput.value.trim();

  if (!name) return;

  const order =
    standsData.length > 0
      ? standsData[standsData.length - 1].order + 1000
      : Date.now();

  db.collection("stands")
    .add({
      name: name,
      color: colorInput.value,
      order: order,
    })
    .then(() => {
      nameInput.value = "";
    })
    .catch((err) => alert("Error Firestore: " + err));
}

function deleteStand(standId) {
  if (!confirm("¿Eliminar stand y TODOS sus vuelos asociados?")) return;
  db.collection("stands").doc(standId).delete();
  flightsData.forEach((f) => {
    if (f.standId === standId) db.collection("flights").doc(f.id).delete();
  });
}

function updateStandSelects() {
  const selects = ["standSelect", "editStandSelect"];
  selects.forEach((id) => {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    standsData.forEach(
      (s) => (sel.innerHTML += `<option value="${s.id}">${s.name}</option>`),
    );
  });
}

// === NUEVO: EDICIÓN DE STANDS ===
function openEditStandDrawer(standId) {
  const stand = standsData.find((s) => s.id === standId);
  if (!stand) return;

  document.getElementById("editStandInternalId").value = stand.id;
  document.getElementById("editStandName").value = stand.name;
  document.getElementById("editStandColor").value = stand.color || "#e8f0fe";

  document.getElementById("drawerOverlay").classList.add("active");
  document.getElementById("editStandDrawer").classList.add("active");
}

function saveStandEdit() {
  const id = document.getElementById("editStandInternalId").value;
  const name = document.getElementById("editStandName").value.trim();
  const color = document.getElementById("editStandColor").value;

  if (!name) return alert("El nombre del stand no puede estar vacío.");

  db.collection("stands")
    .doc(id)
    .update({
      name: name,
      color: color,
    })
    .then(() => closeAllDrawers())
    .catch((err) => alert("Error al actualizar: " + err));
}

// === NAVEGACIÓN DEL MENÚ PRINCIPAL ===
function openNav() {
  document.getElementById("navOverlay").classList.add("active");
  document.getElementById("mainNav").classList.add("open");
}

function closeNav() {
  document.getElementById("navOverlay").classList.remove("active");
  document.getElementById("mainNav").classList.remove("open");
}

// === LÓGICA DE PESTAÑAS Y TIPOS DE EVENTO ===
let currentEventType = "flight"; // Por defecto

function setEventType(type) {
  currentEventType = type;

  // Actualizar UI de pestañas
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById("tab-" + type).classList.add("active");

  // Alternar campos del formulario
  const routeContainer = document.getElementById("routeContainer");
  const idLabel = document.getElementById("idLabel");
  const colorInput = document.getElementById("flightColor");
  const flightIdInput = document.getElementById("flightId");
  const submitBtn = document.getElementById("submitBtnText");
  const idInputWrapper = document.getElementById("idInputWrapper"); // <-- NUEVO

  if (type === "flight") {
    routeContainer.style.display = "flex";
    idInputWrapper.style.width = "120px"; // <-- Vuelve a ser pequeño
    idLabel.innerText = "ID, Ruta y Color";
    colorInput.value = "#0b57d0";
    flightIdInput.placeholder = "Ej: IB123";
    submitBtn.innerText = "Programar Vuelo";
  } else if (type === "maintenance") {
    routeContainer.style.display = "none";
    idInputWrapper.style.width = "280px"; // <-- Se expande para texto largo
    idLabel.innerText = "Tarea de Mantenimiento y Color";
    colorInput.value = "#ea8600";
    flightIdInput.placeholder = "Ej: Rev. Motor A";
    submitBtn.innerText = "Fijar Mantenimiento";
  } else if (type === "backup") {
    routeContainer.style.display = "none";
    idInputWrapper.style.width = "280px"; // <-- Se expande para texto largo
    idLabel.innerText = "Motivo de Reserva y Color";
    colorInput.value = "#5f6368";
    flightIdInput.placeholder = "Ej: A320 Standby";
    submitBtn.innerText = "Asignar Backup";
  }
}

// === GESTIÓN DE VUELOS EN FIRESTORE ===
function addFlight() {
  const data = {
    flightId: document.getElementById("flightId").value,
    depDate: document.getElementById("depDate").value,
    depTime: document.getElementById("depTime").value,
    arrDate: document.getElementById("arrDate").value,
    arrTime: document.getElementById("arrTime").value,
    standSelect: document.getElementById("standSelect").value,
    flightColor: document.getElementById("flightColor").value,
    // La ruta solo se captura si estamos en la pestaña Vuelo
    origin:
      currentEventType === "flight"
        ? document.getElementById("origin").value
        : "",
    destination:
      currentEventType === "flight"
        ? document.getElementById("destination").value
        : "",
    type: currentEventType, // GUARDAMOS EL TIPO EN FIREBASE
  };

  if (
    !data.flightId ||
    !data.depDate ||
    !data.depTime ||
    !data.arrDate ||
    !data.arrTime ||
    !data.standSelect
  )
    return alert("Completa los datos principales.");

  const departure = new Date(`${data.depDate}T${data.depTime}`);
  const arrival = new Date(`${data.arrDate}T${data.arrTime}`);

  if (arrival <= departure) return alert("Llegada posterior a salida.");

  const hasOverlap = flightsData.some(
    (f) =>
      f.standId === data.standSelect &&
      departure < f.arrivalObj &&
      arrival > f.departureObj,
  );
  if (hasOverlap) return alert("¡Conflicto! Stand ocupado en ese horario.");

  db.collection("flights")
    .add({
      flightNum: data.flightId,
      org: data.origin,
      dest: data.destination,
      depDate: data.depDate,
      depTime: data.depTime,
      arrDate: data.arrDate,
      arrTime: data.arrTime,
      standId: data.standSelect,
      color: data.flightColor,
      type: data.type, // Nuevo campo
      departureObj: firebase.firestore.Timestamp.fromDate(departure),
      arrivalObj: firebase.firestore.Timestamp.fromDate(arrival),
    })
    .then(() => {
      // Reseteo inteligente
      document.getElementById("flightId").value = "";
      document.getElementById("depTime").value = "";
      document.getElementById("arrTime").value = "";

      // Devolver el color por defecto según la pestaña activa
      setEventType(currentEventType);
    })
    .catch((err) => alert("Error al guardar: " + err));
}

function deleteFlight(flightId) {
  if (confirm("¿Eliminar este vuelo?"))
    db.collection("flights").doc(flightId).delete();
}

// === EDICIÓN DE VUELOS ===
function openEditDrawer(flightId) {
  const flight = flightsData.find((f) => f.id === flightId);
  if (!flight) return;

  // 1. Identificar tipo de evento y adaptar la interfaz del menú
  const eventType = flight.type || "flight";
  document.getElementById("editEventType").value = eventType;

  const editRouteContainer = document.getElementById("editRouteContainer");
  const editIdLabel = document.getElementById("editIdLabel");

  if (eventType === "flight") {
    editRouteContainer.style.display = "flex";
    editIdLabel.innerText = "ID, Ruta y Color";
  } else if (eventType === "maintenance") {
    editRouteContainer.style.display = "none";
    editIdLabel.innerText = "Tarea de Mantenimiento y Color";
  } else if (eventType === "backup") {
    editRouteContainer.style.display = "none";
    editIdLabel.innerText = "Motivo de Reserva y Color";
  }

  // 2. Cargar datos en los inputs
  const mapping = {
    editFlightInternalId: "id",
    editFlightId: "flightNum",
    editOrigin: "org",
    editDestination: "dest",
    editDepDate: "depDate",
    editDepTime: "depTime",
    editArrDate: "arrDate",
    editArrTime: "arrTime",
    editStandSelect: "standId",
    editFlightColor: "color",
  };

  for (const elId in mapping) {
    document.getElementById(elId).value =
      flight[mapping[elId]] || (elId === "editFlightColor" ? "#1a73e8" : "");
  }

  document.getElementById("drawerOverlay").classList.add("active");
  document.getElementById("editDrawer").classList.add("active");
}

function saveFlightEdit() {
  const fields = [
    "editFlightInternalId",
    "editFlightId",
    "editOrigin",
    "editDestination",
    "editDepDate",
    "editDepTime",
    "editArrDate",
    "editArrTime",
    "editStandSelect",
    "editFlightColor",
  ];
  const data = {};
  fields.forEach((f) => (data[f] = document.getElementById(f).value));

  // Saber de qué tipo es el evento para no borrar/guardar rutas equivocadas
  const eventType = document.getElementById("editEventType").value;
  const origin = eventType === "flight" ? data.editOrigin : "";
  const destination = eventType === "flight" ? data.editDestination : "";

  const departure = new Date(`${data.editDepDate}T${data.editDepTime}`);
  const arrival = new Date(`${data.editArrDate}T${data.editArrTime}`);

  if (arrival <= departure) return alert("Llegada posterior a salida.");

  const hasOverlap = flightsData.some(
    (f) =>
      f.id !== data.editFlightInternalId &&
      f.standId === data.editStandSelect &&
      departure < f.arrivalObj &&
      arrival > f.departureObj,
  );
  if (hasOverlap) return alert("¡Conflicto con otro evento en ese Stand!");

  // Guardar cambios en Firestore
  db.collection("flights")
    .doc(data.editFlightInternalId)
    .update({
      flightNum: data.editFlightId,
      org: origin, // Ruta filtrada por tipo
      dest: destination, // Ruta filtrada por tipo
      depDate: data.editDepDate,
      depTime: data.editDepTime,
      arrDate: data.editArrDate,
      arrTime: data.editArrTime,
      standId: data.editStandSelect,
      color: data.editFlightColor,
      departureObj: firebase.firestore.Timestamp.fromDate(departure),
      arrivalObj: firebase.firestore.Timestamp.fromDate(arrival),
    })
    .then(() => closeAllDrawers());
}

// === CIERRE DE PANELES GLOBAL ===
function closeAllDrawers() {
  document.getElementById("drawerOverlay").classList.remove("active");
  document.getElementById("editDrawer").classList.remove("active");
  document.getElementById("editStandDrawer").classList.remove("active");
}

// === CONTROL DE VISTAS ===
function changeViewDay(offset) {
  const scale = document.getElementById("timeScale").value;
  const dateInput = document.getElementById("currentViewDate");
  const currentDate = new Date(dateInput.value);

  if (scale === "day") {
    currentDate.setDate(currentDate.getDate() + offset);
  } else if (scale === "week") {
    currentDate.setDate(currentDate.getDate() + offset * 7);
  } else if (scale === "month") {
    currentDate.setMonth(currentDate.getMonth() + offset);
  }

  dateInput.value = currentDate.toISOString().split("T")[0];
  renderTimeline();

  const container = document.querySelector(".timeline-container");
  container.scrollLeft =
    offset > 0 ? 0 : container.scrollWidth - container.clientWidth;
}

// === RENDERIZADO PRINCIPAL ===
function renderTimeline() {
  const sidebar = document.getElementById("sidebar");
  const rowsContainer = document.getElementById("rowsContainer");
  const header = document.getElementById("timeHeader");
  const viewDateStr = document.getElementById("currentViewDate").value;
  const baseDate = new Date(`${viewDateStr}T00:00:00`);

  const scale = document.getElementById("timeScale").value;

  let viewStart, viewEnd, totalMinutes, slotCount;

  // 1. CALCULAR LOS LÍMITES DE LA VISTA Y MINUTOS TOTALES
  if (scale === "day") {
    viewStart = new Date(baseDate);
    viewStart.setHours(0, 0, 0, 0);
    viewEnd = new Date(baseDate);
    viewEnd.setHours(23, 59, 59, 999);
    totalMinutes = 24 * 60;
    slotCount = 24;
  } else if (scale === "week") {
    // Buscar el Lunes de esa semana
    viewStart = new Date(baseDate);
    const day = viewStart.getDay();
    const diff = viewStart.getDate() - day + (day === 0 ? -6 : 1);
    viewStart.setDate(diff);
    viewStart.setHours(0, 0, 0, 0);

    viewEnd = new Date(viewStart);
    viewEnd.setDate(viewStart.getDate() + 6);
    viewEnd.setHours(23, 59, 59, 999);
    totalMinutes = 7 * 24 * 60;
    slotCount = 7;
  } else if (scale === "month") {
    viewStart = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    viewEnd = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const daysInMonth = viewEnd.getDate();
    totalMinutes = daysInMonth * 24 * 60;
    slotCount = daysInMonth;
  }

  // 2. DIBUJAR CABECERAS DINÁMICAS (Y ajustar líneas del CSS)
  document.documentElement.style.setProperty(
    "--grid-size",
    `calc(100% / ${slotCount})`,
  );
  header.innerHTML = "";

  if (scale === "day") {
    for (let i = 0; i < 24; i++) {
      header.innerHTML += `<div class="time-slot">${i.toString().padStart(2, "0")}:00</div>`;
    }
  } else if (scale === "week") {
    const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(viewStart);
      d.setDate(d.getDate() + i);
      header.innerHTML += `<div class="time-slot" style="padding-top: 12px; font-size: 13px;"><b>${diasSemana[d.getDay()]}</b> ${d.getDate()}</div>`;
    }
  } else if (scale === "month") {
    for (let i = 1; i <= slotCount; i++) {
      header.innerHTML += `<div class="time-slot" style="padding-top: 12px;">${i}</div>`;
    }
  }

  sidebar.innerHTML = "";
  rowsContainer.innerHTML = "";
  let draggedStandId = null;

  // 3. RENDERIZAR STANDS
  standsData.forEach((stand) => {
    const standEl = document.createElement("div");
    standEl.className = "sidebar-item";
    standEl.style.backgroundColor = stand.color;
    standEl.style.color = getContrastColor(stand.color);
    standEl.draggable = true;
    standEl.dataset.id = stand.id;

    standEl.innerHTML = `
        <span>${stand.name}</span>
        <div class="stand-actions">
          <button class="action-stand edit-stand" onclick="openEditStandDrawer('${stand.id}')" style="color: inherit;">✎</button>
          <button class="action-stand delete-stand" onclick="deleteStand('${stand.id}')" style="color: inherit;">×</button>
        </div>
    `;

    // Lógica Drag and Drop para orden de Stands
    standEl.addEventListener("dragstart", () => {
      draggedStandId = stand.id;
      standEl.classList.add("dragging-stand");
    });
    standEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (stand.id !== draggedStandId) standEl.classList.add("drag-over-stand");
    });
    standEl.addEventListener("dragleave", () =>
      standEl.classList.remove("drag-over-stand"),
    );
    standEl.addEventListener("drop", (e) => {
      e.preventDefault();
      standEl.classList.remove("drag-over-stand");
      if (draggedStandId === null || draggedStandId === stand.id) return;

      const currentStand = standsData.find((s) => s.id === stand.id);
      const currentIndex = standsData.findIndex((s) => s.id === stand.id);
      let newOrder;
      if (currentIndex === 0) {
        newOrder = currentStand.order - 1000;
      } else {
        const previousStand = standsData[currentIndex - 1];
        newOrder = (previousStand.order + currentStand.order) / 2;
      }
      db.collection("stands").doc(draggedStandId).update({ order: newOrder });
    });
    standEl.addEventListener("dragend", () => {
      standEl.classList.remove("dragging-stand");
      draggedStandId = null;
    });

    sidebar.appendChild(standEl);

    // 4. FILA DE EVENTOS
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.dataset.standId = stand.id;

    rowEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      rowEl.classList.add("drag-over");
    });
    rowEl.addEventListener("dragleave", () =>
      rowEl.classList.remove("drag-over"),
    );
    rowEl.addEventListener("drop", (e) => {
      e.preventDefault();
      rowEl.classList.remove("drag-over");
      const flightId = e.dataTransfer.getData("text/plain");
      const draggedFlight = flightsData.find((f) => f.id === flightId);

      if (!draggedFlight || draggedFlight.standId === stand.id) return;
      const hasOverlap = flightsData.some(
        (f) =>
          f.id !== draggedFlight.id &&
          f.standId === stand.id &&
          draggedFlight.departureObj < f.arrivalObj &&
          draggedFlight.arrivalObj > f.departureObj,
      );
      if (hasOverlap) return alert("Conflicto: Stand ocupado.");
      db.collection("flights")
        .doc(draggedFlight.id)
        .update({ standId: stand.id });
    });

    // 5. CÁLCULO DE VUELOS UNIVERSAL
    const standFlights = flightsData.filter((f) => f.standId === stand.id);

    standFlights.forEach((flight) => {
      if (flight.arrivalObj < viewStart || flight.departureObj > viewEnd)
        return;

      const visibleStart =
        flight.departureObj < viewStart ? viewStart : flight.departureObj;
      const visibleEnd =
        flight.arrivalObj > viewEnd ? viewEnd : flight.arrivalObj;

      // Usamos el "timestamp" para calcular en cualquier escala (minutos relativos)
      const offsetMs = visibleStart.getTime() - viewStart.getTime();
      const offsetMin = offsetMs / (1000 * 60);

      const durationMs = visibleEnd.getTime() - visibleStart.getTime();
      const durationMin = durationMs / (1000 * 60);

      const flightBlock = document.createElement("div");
      flightBlock.className = "flight-block";

      const leftPercent = (offsetMin / totalMinutes) * 100;
      const widthPercent = (durationMin / totalMinutes) * 100;

      flightBlock.style.left = `${leftPercent}%`;
      flightBlock.style.width = `${widthPercent}%`;
      flightBlock.draggable = true;

      const zoomLevel = document.getElementById("zoomSlider").value;
      const effectiveVisualPercent = widthPercent * (zoomLevel / 100);

      if (effectiveVisualPercent < 4) {
        flightBlock.classList.add("micro-event");
      }

      const bgColor = flight.color || "#1a73e8";
      flightBlock.style.backgroundColor = bgColor;
      flightBlock.style.color = getContrastColor(bgColor);

      const eventType = flight.type || "flight";
      if (eventType === "maintenance")
        flightBlock.classList.add("type-maintenance");
      if (eventType === "backup") flightBlock.classList.add("type-backup");

      flightBlock.onclick = () => openEditDrawer(flight.id);

      flightBlock.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", flight.id);
        setTimeout(() => flightBlock.classList.add("dragging"), 0);
      });
      flightBlock.addEventListener("dragend", () =>
        flightBlock.classList.remove("dragging"),
      );

      const timeT = `${flight.departureObj < viewStart ? "◀ ... " : flight.depTime} - ${flight.arrivalObj > viewEnd ? " ... ▶" : flight.arrTime}`;

      let icon = "";
      let routeHtml = "";
      if (eventType === "maintenance") icon = "⚙️ ";
      else if (eventType === "backup") icon = "🛡️ ";
      else routeHtml = `<span>${flight.org} → ${flight.dest}</span>`;

      flightBlock.innerHTML = `
          <strong>${icon}${flight.flightNum}</strong>
          ${routeHtml}
          <span>${timeT}</span>
          <button class="del-flight" onclick="event.stopPropagation(); deleteFlight('${flight.id}')">×</button>
      `;
      rowEl.appendChild(flightBlock);
    });

    rowsContainer.appendChild(rowEl);
  });
}

// === AUTOCOMPLETADO DE RUTAS (INTELIGENTE CON COLOR) ===

// Extrae rutas únicas de los vuelos ya guardados en Firestore
function getUniqueRoutes() {
  const routes = {};
  flightsData.forEach((f) => {
    if (f.flightNum && f.org && f.dest) {
      // Guardamos la ruta y también el color. Si no tiene, asignamos el azul por defecto.
      routes[f.flightNum.toUpperCase()] = {
        org: f.org,
        dest: f.dest,
        color: f.color || "#1a73e8",
      };
    }
  });
  return routes;
}

// Muestra las sugerencias mientras el usuario escribe
function showSuggestions(value) {
  const container = document.getElementById("routeSuggestions");
  container.innerHTML = "";
  const val = value.trim().toUpperCase();

  if (!val) {
    container.classList.remove("active");
    return;
  }

  const routes = getUniqueRoutes();
  const matches = Object.keys(routes).filter((id) => id.includes(val));

  if (matches.length === 0) {
    container.classList.remove("active");
    return;
  }

  // Dibujar cada sugerencia
  matches.forEach((id) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";

    // Añadimos un pequeño círculo visual con el color del vuelo en la sugerencia
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${routes[id].color};"></div>
        <span class="suggestion-id">${id}</span>
      </div>
      <span>${routes[id].org} → ${routes[id].dest}</span>
    `;

    // Al hacer clic, autocompletar TODO (incluido el color)
    item.onclick = () => {
      document.getElementById("flightId").value = id;
      document.getElementById("origin").value = routes[id].org;
      document.getElementById("destination").value = routes[id].dest;

      // === NUEVO: Autocompletar el color ===
      document.getElementById("flightColor").value = routes[id].color;

      container.classList.remove("active");
    };

    container.appendChild(item);
  });

  container.classList.add("active");
}

// Cerrar sugerencias al hacer clic fuera
document.addEventListener("click", (e) => {
  if (
    !e.target.closest("#flightId") &&
    !e.target.closest("#routeSuggestions")
  ) {
    const container = document.getElementById("routeSuggestions");
    if (container) container.classList.remove("active");
  }
});

// === ELIMINAR EVENTO DESDE EL MENÚ DE EDICIÓN ===
function deleteEventFromDrawer() {
  const id = document.getElementById("editFlightInternalId").value;
  if (confirm("¿Estás seguro de que deseas eliminar este evento?")) {
    db.collection("flights")
      .doc(id)
      .delete()
      .then(() => {
        closeAllDrawers();
      });
  }
}
