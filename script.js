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

const airports = ["BCN", "EZE", "BOG", "XPL", "UIO"];

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

  const header = document.getElementById("timeHeader");
  for (let i = 0; i < 24; i++) {
    header.innerHTML += `<div class="time-slot">${i.toString().padStart(2, "0")}:00</div>`;
  }

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

// === GESTIÓN DE VUELOS EN FIRESTORE ===
function addFlight() {
  const fields = [
    "flightId",
    "origin",
    "destination",
    "depDate",
    "depTime",
    "arrDate",
    "arrTime",
    "standSelect",
    "flightColor",
  ];
  const data = {};
  fields.forEach((f) => (data[f] = document.getElementById(f).value));

  if (
    !data.flightId ||
    !data.depDate ||
    !data.depTime ||
    !data.arrDate ||
    !data.arrTime ||
    !data.standSelect
  )
    return alert("Completa los datos.");

  const departure = new Date(`${data.depDate}T${data.depTime}`);
  const arrival = new Date(`${data.arrDate}T${data.arrTime}`);

  if (arrival <= departure) return alert("Llegada posterior a salida.");

  const hasOverlap = flightsData.some(
    (f) =>
      f.standId === data.standSelect &&
      departure < f.arrivalObj &&
      arrival > f.departureObj,
  );
  if (hasOverlap) return alert("¡Conflicto! Stand ocupado.");

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
      departureObj: firebase.firestore.Timestamp.fromDate(departure),
      arrivalObj: firebase.firestore.Timestamp.fromDate(arrival),
    })
    .then(() => {
      document.getElementById("flightId").value = "";
      document.getElementById("depTime").value = "";
      document.getElementById("arrTime").value = "";
      document.getElementById("flightColor").value = "#1a73e8";

      const currentViewDate = document.getElementById("currentViewDate").value;
      document.getElementById("depDate").value = currentViewDate;
      document.getElementById("arrDate").value = currentViewDate;

      document.getElementById("origin").selectedIndex = 0;
      document.getElementById("destination").selectedIndex = 0;
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
  for (const elId in mapping)
    document.getElementById(elId).value =
      flight[mapping[elId]] || (elId === "editFlightColor" ? "#1a73e8" : "");

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
  if (hasOverlap) return alert("¡Conflicto con otro vuelo!");

  db.collection("flights")
    .doc(data.editFlightInternalId)
    .update({
      flightNum: data.editFlightId,
      org: data.editOrigin,
      dest: data.editDestination,
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
  const dateInput = document.getElementById("currentViewDate");
  const currentDate = new Date(dateInput.value);
  currentDate.setDate(currentDate.getDate() + offset);
  dateInput.value = currentDate.toISOString().split("T")[0];
  renderTimeline();

  const container = document.querySelector(".timeline-container");
  container.scrollLeft =
    offset === 1 ? 0 : container.scrollWidth - container.clientWidth;
}

// === RENDERIZADO PRINCIPAL ===
function renderTimeline() {
  const sidebar = document.getElementById("sidebar");
  const rowsContainer = document.getElementById("rowsContainer");
  const viewDateStr = document.getElementById("currentViewDate").value;
  const viewStart = new Date(`${viewDateStr}T00:00:00`);
  const viewEnd = new Date(`${viewDateStr}T23:59:59`);

  sidebar.innerHTML = "";
  rowsContainer.innerHTML = "";

  let draggedStandId = null;

  standsData.forEach((stand) => {
    // 1. RENDERIZAR SIDEBAR ITEM
    const standEl = document.createElement("div");
    standEl.className = "sidebar-item";
    standEl.style.backgroundColor = stand.color;

    // === NUEVO: CONTRASTE DINÁMICO EN EL TEXTO DEL STAND ===
    const standTextColor = getContrastColor(stand.color);
    standEl.style.color = standTextColor;

    standEl.draggable = true;
    standEl.dataset.id = stand.id;

    // Se han implementado botones unificados ("✎" para editar y "×" para borrar)
    // El color "inherit" hace que copien el color contrastado dinámico
    standEl.innerHTML = `
            <span>${stand.name}</span>
            <div class="stand-actions">
              <button class="action-stand edit-stand" onclick="openEditStandDrawer('${stand.id}')" style="color: inherit;">✎</button>
              <button class="action-stand delete-stand" onclick="deleteStand('${stand.id}')" style="color: inherit;">×</button>
            </div>
        `;

    standEl.addEventListener("dragstart", (e) => {
      draggedStandId = stand.id;
      standEl.classList.add("dragging-stand");
    });

    standEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (stand.id !== draggedStandId) standEl.classList.add("drag-over-stand");
    });

    standEl.addEventListener("dragleave", () => {
      standEl.classList.remove("drag-over-stand");
    });

    standEl.addEventListener("drop", (e) => {
      e.preventDefault();
      standEl.classList.remove("drag-over-stand");

      if (draggedStandId === null || draggedStandId === stand.id) return;

      const currentStand = standsData.find((s) => s.id === stand.id);
      const currentIndex = standsData.findIndex((s) => s.id === stand.id);

      let newOrder;
      const step = 1000;

      if (currentIndex === 0) {
        newOrder = currentStand.order - step;
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

    // 2. RENDERIZAR FILA DEL TIMELINE
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

    // 3. RENDERIZAR VUELOS DE ESTE STAND
    const standFlights = flightsData.filter((f) => f.standId === stand.id);

    standFlights.forEach((flight) => {
      if (flight.arrivalObj < viewStart || flight.departureObj > viewEnd)
        return;

      const visibleStart =
        flight.departureObj < viewStart ? viewStart : flight.departureObj;
      const visibleEnd =
        flight.arrivalObj > viewEnd ? viewEnd : flight.arrivalObj;

      const depMin = visibleStart.getHours() * 60 + visibleStart.getMinutes();
      const durationMin =
        visibleEnd.getHours() * 60 + visibleEnd.getMinutes() - depMin;

      const flightBlock = document.createElement("div");
      flightBlock.className = "flight-block";
      flightBlock.style.left = `${(depMin / 1440) * 100}%`;
      flightBlock.style.width = `${(durationMin / 1440) * 100}%`;
      flightBlock.draggable = true;

      const bgColor = flight.color || "#1a73e8";
      flightBlock.style.backgroundColor = bgColor;
      flightBlock.style.color = getContrastColor(bgColor);

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

      flightBlock.innerHTML = `
                <strong>${flight.flightNum}</strong>
                <span>${flight.org} → ${flight.dest}</span>
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
