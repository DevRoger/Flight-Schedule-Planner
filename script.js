// CONFIGURACIÓN DE FIREBASE (Copia tus credenciales reales aquí)
const firebaseConfig = {
  apiKey: "AIzaSyCJ4zqkQi5SAvyiheb9IzR1v_goGNCeZa0",
  authDomain: "aeroschedule-f367b.firebaseapp.com",
  projectId: "aeroschedule-f367b",
  storageBucket: "aeroschedule-f367b.firebasestorage.app",
  messagingSenderId: "1093597461614",
  appId: "1:1093597461614:web:c15bd3d9261d920c05ba7f",
  measurementId: "G-B06BJYJM0V",
};

// Inicializar Firebase y Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Listas locales sincronizadas con la nube
let standsData = [];
let flightsData = [];

const airports = ["BCN", "EZE", "BOG", "XPL", "UIO"];

// Inicialización de la UI y de las escuchas en tiempo real
document.addEventListener("DOMContentLoaded", () => {
  // Cargar Modo Oscuro desde LocalStorage
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").checked = true;
  }

  const orgSel = document.getElementById("origin");
  const destSel = document.getElementById("destination");
  const editOrgSel = document.getElementById("editOrigin");
  const editDestSel = document.getElementById("editDestination");

  airports.forEach((ap) => {
    orgSel.innerHTML += `<option value="${ap}">${ap}</option>`;
    destSel.innerHTML += `<option value="${ap}">${ap}</option>`;
    editOrgSel.innerHTML += `<option value="${ap}">${ap}</option>`;
    editDestSel.innerHTML += `<option value="${ap}">${ap}</option>`;
  });

  const header = document.getElementById("timeHeader");
  for (let i = 0; i < 24; i++) {
    header.innerHTML += `<div class="time-slot">${i.toString().padStart(2, "0")}:00</div>`;
  }

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("currentViewDate").value = today;
  document.getElementById("depDate").value = today;
  document.getElementById("arrDate").value = today;

  // --- ESCUCHAS EN TIEMPO REAL DESDE FIRESTORE ---

  // 1. Sincronizar Stands
  db.collection("stands").onSnapshot((snapshot) => {
    standsData = [];
    snapshot.forEach((doc) => {
      standsData.push({ id: doc.id, ...doc.data() });
    });
    updateStandSelects();
    renderTimeline(); // Redibujar al cambiar stands
  });

  // 2. Sincronizar Vuelos
  db.collection("flights").onSnapshot((snapshot) => {
    flightsData = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      flightsData.push({
        id: doc.id,
        ...data,
        // Al recuperar de Firestore, los objetos Date se convierten en Timestamps.
        // Los transformamos de nuevo a Date nativo de JS con .toDate()
        departureObj: data.departureObj ? data.departureObj.toDate() : null,
        arrivalObj: data.arrivalObj ? data.arrivalObj.toDate() : null,
      });
    });
    renderTimeline(); // Redibujar al cambiar vuelos
  });
});

// --- TEMA Y CONTRASTE ---

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

// Algoritmo YIQ para determinar el color del texto basado en el fondo
function getContrastColor(hexcolor) {
  if (!hexcolor) return "#ffffff"; // Default blanco
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#202124" : "#ffffff"; // Oscuro si el fondo es claro, Blanco si es oscuro
}

// --- GESTIÓN DE STANDS EN FIRESTORE ---

function addStand() {
  const nameInput = document.getElementById("newStandName");
  const colorInput = document.getElementById("standColor");
  const name = nameInput.value.trim();

  if (!name) return;

  // Guardamos directamente en la colección de Firestore
  db.collection("stands")
    .add({
      name: name,
      color: colorInput.value,
    })
    .then(() => {
      nameInput.value = "";
    })
    .catch((err) => alert("Error al guardar stand: " + err));
}

function deleteStand(standId) {
  // 1. Eliminar el documento del Stand
  db.collection("stands").doc(standId).delete();

  // 2. Limpiar en cascada los vuelos que estaban asignados a ese stand
  flightsData.forEach((f) => {
    if (f.standId === standId) {
      db.collection("flights").doc(f.id).delete();
    }
  });
}

function updateStandSelects() {
  const sel = document.getElementById("standSelect");
  const editSel = document.getElementById("editStandSelect");
  sel.innerHTML = "";
  editSel.innerHTML = "";

  standsData.forEach((s) => {
    const option = `<option value="${s.id}">${s.name}</option>`;
    sel.innerHTML += option;
    editSel.innerHTML += option;
  });
}

// --- GESTIÓN DE VUELOS EN FIRESTORE ---

function addFlight() {
  const flightNum = document.getElementById("flightId").value;
  const org = document.getElementById("origin").value;
  const dest = document.getElementById("destination").value;
  const depDate = document.getElementById("depDate").value;
  const depTime = document.getElementById("depTime").value;
  const arrDate = document.getElementById("arrDate").value;
  const arrTime = document.getElementById("arrTime").value;
  const standId = document.getElementById("standSelect").value;
  const color = document.getElementById("flightColor").value; // NUEVO

  if (!flightNum || !depDate || !depTime || !arrDate || !arrTime || !standId) {
    return alert("Por favor, completa todos los datos del vuelo.");
  }

  const departure = new Date(`${depDate}T${depTime}`);
  const arrival = new Date(`${arrDate}T${arrTime}`);

  if (arrival <= departure)
    return alert("La llegada debe ser posterior a la salida.");

  const hasOverlap = flightsData.some((f) => {
    if (f.standId !== standId) return false;
    return departure < f.arrivalObj && arrival > f.departureObj;
  });

  if (hasOverlap)
    return alert("¡Conflicto! El stand ya está ocupado en ese horario.");

  // GUARDAR EN FIRESTORE
  db.collection("flights").add({
    flightNum,
    org,
    dest,
    depDate,
    depTime,
    arrDate,
    arrTime,
    standId,
    color, // GUARDAMOS COLOR
    departureObj: firebase.firestore.Timestamp.fromDate(departure),
    arrivalObj: firebase.firestore.Timestamp.fromDate(arrival),
  });
}

function deleteFlight(flightId) {
  db.collection("flights").doc(flightId).delete();
}

// --- MENÚ LATERAL DE EDICIÓN ---

function openEditDrawer(flightId) {
  const flight = flightsData.find((f) => f.id === flightId);
  if (!flight) return;

  document.getElementById("editFlightInternalId").value = flight.id;
  document.getElementById("editFlightId").value = flight.flightNum;
  document.getElementById("editOrigin").value = flight.org;
  document.getElementById("editDestination").value = flight.dest;
  document.getElementById("editDepDate").value = flight.depDate;
  document.getElementById("editDepTime").value = flight.depTime;
  document.getElementById("editArrDate").value = flight.arrDate;
  document.getElementById("editArrTime").value = flight.arrTime;
  document.getElementById("editStandSelect").value = flight.standId;
  document.getElementById("editFlightColor").value = flight.color || "#1a73e8";

  document.getElementById("drawerOverlay").classList.add("active");
  document.getElementById("editDrawer").classList.add("active");
}

function closeEditDrawer() {
  document.getElementById("drawerOverlay").classList.remove("active");
  document.getElementById("editDrawer").classList.remove("active");
}

function saveFlightEdit() {
  const id = document.getElementById("editFlightInternalId").value;
  const flightNum = document.getElementById("editFlightId").value;
  const org = document.getElementById("editOrigin").value;
  const dest = document.getElementById("editDestination").value;
  const depDate = document.getElementById("editDepDate").value;
  const depTime = document.getElementById("editDepTime").value;
  const arrDate = document.getElementById("editArrDate").value;
  const arrTime = document.getElementById("editArrTime").value;
  const standId = document.getElementById("editStandSelect").value;
  const color = document.getElementById("editFlightColor").value; // NUEVO

  const departure = new Date(`${depDate}T${depTime}`);
  const arrival = new Date(`${arrDate}T${arrTime}`);

  if (arrival <= departure)
    return alert("La llegada debe ser posterior a la salida.");

  const hasOverlap = flightsData.some((f) => {
    if (f.id === id) return false;
    if (f.standId !== standId) return false;
    return departure < f.arrivalObj && arrival > f.departureObj;
  });

  if (hasOverlap)
    return alert("¡Conflicto! La nueva configuración choca con otro vuelo.");

  db.collection("flights")
    .doc(id)
    .update({
      flightNum,
      org,
      dest,
      depDate,
      depTime,
      arrDate,
      arrTime,
      standId,
      color, // ACTUALIZAMOS COLOR
      departureObj: firebase.firestore.Timestamp.fromDate(departure),
      arrivalObj: firebase.firestore.Timestamp.fromDate(arrival),
    })
    .then(() => {
      closeEditDrawer();
    });
}

// --- CONTROL DE VISTAS Y RENDERIZADO ---

function changeViewDay(offset) {
  const dateInput = document.getElementById("currentViewDate");
  const currentDate = new Date(dateInput.value);
  currentDate.setDate(currentDate.getDate() + offset);
  dateInput.value = currentDate.toISOString().split("T")[0];

  renderTimeline();

  const timelineContainer = document.querySelector(".timeline-container");
  if (offset === 1) timelineContainer.scrollLeft = 0;
  else if (offset === -1)
    timelineContainer.scrollLeft =
      timelineContainer.scrollWidth - timelineContainer.clientWidth;
}

function renderTimeline() {
  const sidebar = document.getElementById("sidebar");
  const rowsContainer = document.getElementById("rowsContainer");
  const viewDateStr = document.getElementById("currentViewDate").value;

  const viewStart = new Date(`${viewDateStr}T00:00:00`);
  const viewEnd = new Date(`${viewDateStr}T23:59:59`);

  sidebar.innerHTML = "";
  rowsContainer.innerHTML = "";

  standsData.forEach((stand) => {
    const standEl = document.createElement("div");
    standEl.className = "sidebar-item";
    standEl.style.backgroundColor = stand.color;
    standEl.innerHTML = `
            <span>${stand.name}</span>
            <button class="delete-stand" onclick="deleteStand('${stand.id}')" title="Eliminar stand">×</button>
        `;
    sidebar.appendChild(standEl);

    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.dataset.standId = stand.id;

    // Drag & Drop
    rowEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      rowEl.classList.add("drag-over");
    });
    rowEl.addEventListener("dragleave", () => {
      rowEl.classList.remove("drag-over");
    });
    rowEl.addEventListener("drop", (e) => {
      e.preventDefault();
      rowEl.classList.remove("drag-over");
      const flightId = e.dataTransfer.getData("text/plain");
      const draggedFlight = flightsData.find((f) => f.id === flightId);

      if (!draggedFlight || draggedFlight.standId === stand.id) return;

      const hasOverlap = flightsData.some((f) => {
        if (f.id === draggedFlight.id) return false;
        if (f.standId !== stand.id) return false;
        return (
          draggedFlight.departureObj < f.arrivalObj &&
          draggedFlight.arrivalObj > f.departureObj
        );
      });

      if (hasOverlap)
        return alert("Conflicto: No se puede mover el vuelo aquí.");

      // Al soltar el vuelo arrastrado, simplemente actualizamos su standId en Firestore
      db.collection("flights").doc(draggedFlight.id).update({
        standId: stand.id,
      });
    });

    const standFlights = flightsData.filter((f) => f.standId === stand.id);

    standFlights.forEach((flight) => {
      if (!flight.arrivalObj || !flight.departureObj) return;
      if (flight.arrivalObj < viewStart || flight.departureObj > viewEnd)
        return;

      const visibleStart =
        flight.departureObj < viewStart ? viewStart : flight.departureObj;
      const visibleEnd =
        flight.arrivalObj > viewEnd ? viewEnd : flight.arrivalObj;

      const startMins =
        visibleStart.getHours() * 60 + visibleStart.getMinutes();
      const endMins = visibleEnd.getHours() * 60 + visibleEnd.getMinutes();
      const durationMins = endMins - startMins;

      const leftPercent = (startMins / 1440) * 100;
      const widthPercent = (durationMins / 1440) * 100;

      const flightBlock = document.createElement("div");
      flightBlock.className = "flight-block";
      flightBlock.style.left = `${leftPercent}%`;
      flightBlock.style.width = `${widthPercent}%`;
      flightBlock.draggable = true;

      // APLICAR COLOR Y CONTRASTE
      const bgColor = flight.color || "#1a73e8";
      flightBlock.style.backgroundColor = bgColor;
      flightBlock.style.color = getContrastColor(bgColor);

      flightBlock.onclick = () => openEditDrawer(flight.id);

      flightBlock.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", flight.id);
        setTimeout(() => flightBlock.classList.add("dragging"), 0);
      });

      flightBlock.addEventListener("dragend", () => {
        flightBlock.classList.remove("dragging");
      });

      let timeText = `${flight.depTime} - ${flight.arrTime}`;
      if (flight.departureObj < viewStart) timeText = `◀ ... ${flight.arrTime}`;
      if (flight.arrivalObj > viewEnd) timeText = `${flight.depTime} ... ▶`;
      if (flight.departureObj < viewStart && flight.arrivalObj > viewEnd)
        timeText = `◀ DÍA COMPLETO ▶`;

      flightBlock.innerHTML = `
                <strong>${flight.flightNum}</strong>
                <span>${flight.org} → ${flight.dest}</span>
                <span>${timeText}</span>
                <button class="del-flight" onclick="event.stopPropagation(); deleteFlight('${flight.id}')">×</button>
            `;

      rowEl.appendChild(flightBlock);
    });

    rowsContainer.appendChild(rowEl);
  });
}
