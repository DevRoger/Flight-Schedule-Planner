// Bases de datos en memoria
let standsData = []; // [{ id: 'stand_1', name: 'Puerta 1', color: '#ff0000' }]
let flightsData = []; // [{ id: '1', flightNum: 'IB123', org: 'BCN', dest: 'MAD', depDate: '...', depTime: '...', arrDate: '...', arrTime: '...', standId: 'stand_1' }]

const airports = ["BCN", "EZE", "BOG", "XPL", "UIO"];

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  // Rellenar selectores de aeropuertos
  const orgSel = document.getElementById("origin");
  const destSel = document.getElementById("destination");
  airports.forEach((ap) => {
    orgSel.innerHTML += `<option value="${ap}">${ap}</option>`;
    destSel.innerHTML += `<option value="${ap}">${ap}</option>`;
  });

  // Renderizar cabecera de horas (24h)
  const header = document.getElementById("timeHeader");
  for (let i = 0; i < 24; i++) {
    header.innerHTML += `<div class="time-slot">${i.toString().padStart(2, "0")}:00</div>`;
  }

  // Configurar fecha actual por defecto en los inputs y en el visualizador
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("currentViewDate").value = today;
  document.getElementById("depDate").value = today;
  document.getElementById("arrDate").value = today;

  renderTimeline();
});

// --- GESTIÓN DE STANDS ---

function addStand() {
  const nameInput = document.getElementById("newStandName");
  const colorInput = document.getElementById("standColor");
  const name = nameInput.value.trim();

  if (!name) return;

  const newStand = {
    id: "stand_" + Date.now(),
    name: name,
    color: colorInput.value,
  };

  standsData.push(newStand);
  nameInput.value = "";
  updateStandSelects();
  renderTimeline();
}

function deleteStand(standId) {
  standsData = standsData.filter((s) => s.id !== standId);
  // Opcional: Eliminar los vuelos asociados a ese stand
  flightsData = flightsData.filter((f) => f.standId !== standId);
  updateStandSelects();
  renderTimeline();
}

function updateStandSelects() {
  const sel = document.getElementById("standSelect");
  sel.innerHTML = "";
  standsData.forEach((s) => {
    sel.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });
}

// --- GESTIÓN DE VUELOS ---

function addFlight() {
  const flightNum = document.getElementById("flightId").value;
  const org = document.getElementById("origin").value;
  const dest = document.getElementById("destination").value;
  const depDate = document.getElementById("depDate").value;
  const depTime = document.getElementById("depTime").value;
  const arrDate = document.getElementById("arrDate").value;
  const arrTime = document.getElementById("arrTime").value;
  const standId = document.getElementById("standSelect").value;

  if (!flightNum || !depDate || !depTime || !arrDate || !arrTime || !standId) {
    return alert("Por favor, completa todos los datos del vuelo.");
  }

  const departure = new Date(`${depDate}T${depTime}`);
  const arrival = new Date(`${arrDate}T${arrTime}`);

  if (arrival <= departure) {
    return alert("La fecha/hora de llegada debe ser posterior a la de salida.");
  }

  // --- DETECCIÓN DE SOLAPAMIENTOS ---
  const hasOverlap = flightsData.some((f) => {
    // Solo comprobamos colisiones en el mismo Stand
    if (f.standId !== standId) return false;

    // Lógica de colisión (AABB): Inicio1 < Fin2 Y Fin1 > Inicio2
    return departure < f.arrivalObj && arrival > f.departureObj;
  });

  if (hasOverlap) {
    return alert(
      "¡Conflicto! Ya existe un vuelo programado en este stand que se solapa con este horario.",
    );
  }

  const newFlight = {
    id: "flight_" + Date.now(),
    flightNum,
    org,
    dest,
    depDate,
    depTime,
    arrDate,
    arrTime,
    standId,
    departureObj: departure,
    arrivalObj: arrival,
  };

  flightsData.push(newFlight);
  renderTimeline();
}

function deleteFlight(flightId) {
  flightsData = flightsData.filter((f) => f.id !== flightId);
  renderTimeline();
}

// --- CONTROL DE VISTAS Y RENDERIZADO ---

function changeViewDay(offset) {
  const dateInput = document.getElementById("currentViewDate");
  const currentDate = new Date(dateInput.value);
  currentDate.setDate(currentDate.getDate() + offset);
  dateInput.value = currentDate.toISOString().split("T")[0];

  // Primero renderizamos la nueva vista
  renderTimeline();

  // --- NUEVA LÓGICA DE SCROLL ---
  // Seleccionamos el contenedor que tiene el overflow-x
  const timelineContainer = document.querySelector(".timeline-container");

  if (offset === 1) {
    // Si pasamos al Día Siguiente: Scroll al inicio del día (00:00)
    timelineContainer.scrollLeft = 0;
  } else if (offset === -1) {
    // Si pasamos al Día Anterior: Scroll al final del día (23:59)
    // Restamos el ancho visible (clientWidth) al ancho total (scrollWidth) para llegar justo al tope derecho
    timelineContainer.scrollLeft =
      timelineContainer.scrollWidth - timelineContainer.clientWidth;
  }
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
    // 1. Sidebar Stand
    const standEl = document.createElement("div");
    standEl.className = "sidebar-item";
    standEl.style.backgroundColor = stand.color;
    standEl.innerHTML = `
            <span>${stand.name}</span>
            <button class="delete-stand" onclick="deleteStand('${stand.id}')" title="Eliminar stand">×</button>
        `;
    sidebar.appendChild(standEl);

    // 2. Timeline Row (Ahora es una zona para soltar elementos)
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.dataset.standId = stand.id;

    // Eventos Drag & Drop para la fila (Zona de destino)
    rowEl.addEventListener("dragover", (e) => {
      e.preventDefault(); // Necesario para permitir el "drop"
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

      // Verificamos solapamiento en el nuevo stand antes de moverlo
      const hasOverlap = flightsData.some((f) => {
        if (f.id === draggedFlight.id) return false; // No comparamos con sí mismo
        if (f.standId !== stand.id) return false;
        return (
          draggedFlight.departureObj < f.arrivalObj &&
          draggedFlight.arrivalObj > f.departureObj
        );
      });

      if (hasOverlap) {
        alert(
          "No se puede mover el vuelo aquí: genera un conflicto de horarios.",
        );
        return;
      }

      // Actualizamos el stand del vuelo arrastrado
      draggedFlight.standId = stand.id;
      renderTimeline();
    });

    // 3. Renderizar Vuelos
    const standFlights = flightsData.filter((f) => f.standId === stand.id);

    standFlights.forEach((flight) => {
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

      // Hacer el bloque arrastrable
      flightBlock.draggable = true;

      // Eventos Drag & Drop para el bloque de vuelo
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
                <button class="del-flight" onclick="deleteFlight('${flight.id}')">×</button>
            `;

      rowEl.appendChild(flightBlock);
    });

    rowsContainer.appendChild(rowEl);
  });
}
