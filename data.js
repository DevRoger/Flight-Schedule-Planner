// === CONFIGURACIÓN DE FIREBASE (PEGA TUS CREDENCIALES) ===
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

// === TEMA ===
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").checked = true;
  }
});

function toggleTheme() {
  if (document.getElementById("themeToggle").checked) {
    document.body.classList.add("dark-mode");
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark-mode");
    localStorage.setItem("theme", "light");
  }
}

// === NAVEGACIÓN ===
function openNav() {
  document.getElementById("navOverlay").classList.add("active");
  document.getElementById("mainNav").classList.add("open");
}
function closeNav() {
  document.getElementById("navOverlay").classList.remove("active");
  document.getElementById("mainNav").classList.remove("open");
}

// === LÓGICA DE EXPORTACIÓN ===
async function exportData() {
  try {
    const standsSnap = await db.collection("stands").get();
    const flightsSnap = await db.collection("flights").get();

    const exportObj = {
      metadata: {
        appName: "AeroSchedule",
        exportDate: new Date().toISOString(),
      },
      stands: [],
      flights: [],
    };

    // Empaquetar Stands
    standsSnap.forEach((doc) => {
      exportObj.stands.push({ id: doc.id, ...doc.data() });
    });

    // Empaquetar Eventos (Eliminando los objetos complejos Timestamp de Firebase)
    flightsSnap.forEach((doc) => {
      const data = doc.data();
      delete data.departureObj; // Se reconstruyen al importar
      delete data.arrivalObj;
      exportObj.flights.push({ id: doc.id, ...data });
    });

    // Crear y descargar archivo JSON
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `AeroSchedule_Backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("Error al exportar datos: " + error.message);
  }
}

// === LÓGICA DE IMPORTACIÓN ===
let selectedJsonFile = null;

function handleFileSelect(event) {
  const file = event.target.files[0];
  const display = document.getElementById("fileNameDisplay");
  const importBtn = document.getElementById("importBtn");

  if (file) {
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      alert("Por favor, selecciona un archivo JSON válido.");
      return;
    }
    selectedJsonFile = file;
    display.innerText = file.name;
    display.style.color = "var(--primary)";
    importBtn.style.display = "inline-flex";
  }
}

// 1. Importar desde Archivo (Lee el archivo y llama al motor)
function importData() {
  if (!selectedJsonFile) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await processImport(data); // Llamada al motor compartido

      // Resetear UI del archivo
      document.getElementById("jsonFileInput").value = "";
      selectedJsonFile = null;
      document.getElementById("fileNameDisplay").innerText =
        "Ningún archivo seleccionado";
      document.getElementById("fileNameDisplay").style.color =
        "var(--text-sec)";
      document.getElementById("importBtn").style.display = "none";
    } catch (error) {
      alert("Error crítico durante la importación: " + error.message);
    }
  };
  reader.readAsText(selectedJsonFile);
}

// 2. Importar desde Texto (Lee el textarea y llama al motor)
async function importDataFromText() {
  const text = document.getElementById("jsonTextInput").value.trim();

  if (!text) {
    alert("Por favor, pega el código JSON en el recuadro antes de importar.");
    return;
  }

  try {
    const data = JSON.parse(text);
    await processImport(data); // Llamada al motor compartido

    // Resetear UI del texto
    document.getElementById("jsonTextInput").value = "";
  } catch (error) {
    alert(
      "El texto introducido no es un JSON válido o está mal formateado. Detalle: " +
        error.message,
    );
  }
}

// 3. El Motor Compartido con Firebase (Batch)
async function processImport(data) {
  if (!data.stands || !data.flights) {
    throw new Error(
      "El formato del archivo no es compatible con AeroSchedule.",
    );
  }

  const confirmImport = confirm(
    `Se van a importar ${data.stands.length} stands y ${data.flights.length} eventos. Los datos existentes con el mismo ID se actualizarán. ¿Continuar?`,
  );
  if (!confirmImport) return;

  // Usamos batch (lotes) para asegurar que se sube todo de golpe
  const batch = db.batch();

  // Importar Stands (merge: true)
  data.stands.forEach((stand) => {
    const standRef = db.collection("stands").doc(stand.id);
    const standData = { ...stand };
    delete standData.id;
    batch.set(standRef, standData, { merge: true });
  });

  // Importar Eventos (merge: true y reconstrucción de fechas)
  data.flights.forEach((flight) => {
    const flightRef = db.collection("flights").doc(flight.id);
    const flightData = { ...flight };
    delete flightData.id;

    const departure = new Date(`${flight.depDate}T${flight.depTime}`);
    const arrival = new Date(`${flight.arrDate}T${flight.arrTime}`);

    flightData.departureObj = firebase.firestore.Timestamp.fromDate(departure);
    flightData.arrivalObj = firebase.firestore.Timestamp.fromDate(arrival);

    batch.set(flightRef, flightData, { merge: true });
  });

  await batch.commit();
  alert("¡Importación completada con éxito!");
}

// === LÓGICA DE BORRADO MASIVO ===
async function clearDatabase() {
  const confirm1 = confirm(
    "⚠️ ATENCIÓN: Estás a punto de borrar TODA la base de datos. Esto no se puede deshacer. ¿Estás absolutamente seguro?",
  );
  if (!confirm1) return;

  const confirm2 = prompt(
    "Para confirmar la eliminación total, escribe la palabra 'BORRAR':",
  );
  if (confirm2 !== "BORRAR") {
    alert("Operación cancelada.");
    return;
  }

  try {
    const standsSnap = await db.collection("stands").get();
    const flightsSnap = await db.collection("flights").get();

    const batch = db.batch();

    standsSnap.forEach((doc) => batch.delete(doc.ref));
    flightsSnap.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
    alert("La base de datos ha sido eliminada por completo.");
  } catch (error) {
    alert("Error al borrar la base de datos: " + error.message);
  }
}
