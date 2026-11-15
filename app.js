/* =========================================================
   app.js — Evaluación en línea con Firebase Firestore
   Colecciones:
     cursos       -> un documento por curso (Área, minutos, estado, preguntas)
     examenes     -> examen completo por curso (título, preguntas, respuestas y claves) [SOLO PERSONAL]
     pruebas      -> preguntas SIN la respuesta correcta [LEGIBLE POR ESTUDIANTES]
     claves       -> claves de calificación por curso (respuesta correcta de cada pregunta) [SOLO PERSONAL]
     estudiantes  -> registro del estudiante, clasificado por curso y Área
     resultados   -> nota, aciertos y desaciertos de cada estudiante
   ========================================================= */

// ---------- CONFIGURACIÓN ----------
const firebaseConfig = {
  apiKey: "AIzaSyDrDoGFUE8-gTNWwSj3819YYs5TvgoP8Jo",
  authDomain: "evaluaciones-guido-2026.firebaseapp.com",
  projectId: "evaluaciones-guido-2026",
  storageBucket: "evaluaciones-guido-2026.firebasestorage.app",
  messagingSenderId: "285865534897",
  appId: "1:285865534897:web:8f47d828cbe8d258410990"
};
const PARALELOS = ["A", "B", "C"]; // Solo estos paralelos
const CURSOS = [ // Solo Secundaria (cada curso aplica a todos sus paralelos A, B y C)
  "1ro de Secundaria", "2do de Secundaria", "3ro de Secundaria",
  "4to de Secundaria", "5to de Secundaria", "6to de Secundaria"
];
const AREAS = [
  "Ciencias Sociales", "Matemática", "Comunicación y Lenguajes", "Ciencias Naturales",
  "Técnica Tecnológica", "Educación Física y Deportes", "Artes Plásticas y Visuales", "Valores, Espiritualidad y Religiones"
];

// Preguntas de ejemplo con las que se crea cada curso (luego el administrador las edita)
// c = índice de la respuesta correcta (empieza en 0)
const PREGUNTAS_EJEMPLO = [
  { p: "¿Cuál es la sede de gobierno de Bolivia?", o: ["Sucre", "Cochabamba", "La Paz", "Santa Cruz"], c: 2 },
  { p: "¿En qué año se promulgó la actual Constitución Política del Estado?", o: ["1967", "2009", "2006", "1995"], c: 1 },
  { p: "¿Qué océano baña la costa oeste de Sudamérica?", o: ["Atlántico", "Índico", "Pacífico", "Ártico"], c: 2 },
  { p: "¿Cuántos departamentos tiene Bolivia?", o: ["7", "8", "9", "10"], c: 2 }
];

// ---------- UTILIDADES ----------
const $ = id => document.getElementById(id);
const MODO_ESTUDIANTE = new URLSearchParams(window.location.search).get("modo") === "estudiante";
const esc = s => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };
// Convierte texto en un código seguro: "5to de Secundaria" -> "5to-de-secundaria"
const slug = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cursoId = nombre => slug(nombre);
function crearOrdenPreguntas(cantidad) {
  const orden = Array.from({ length: cantidad }, (_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

// Quita la respuesta correcta (campo c) antes de mostrar/publishar preguntas a estudiantes
const publicarSinClave = preguntas => (preguntas || []).map(q => ({ p: q.p, o: [...q.o] }));

// Construye el documento de examen (con claves) que solo ve el personal
function examenDe(cursoIdDoc, titulo, preguntas) {
  return {
    cursoId: cursoIdDoc,
    titulo,
    preguntas: JSON.parse(JSON.stringify(preguntas)), // p = pregunta, o = opciones, c = respuesta correcta
    cantidad: preguntas.length,
    actualizado: new Date().toISOString()
  };
}

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let CACHE_PRUEBAS = {};   // pruebas (preguntas sin clave) leídas por el estudiante
let CACHE = {};        // cursos: id -> datos
let RESULTADOS = [];   // resultados leídos (vista administrador)
let usuarioPersonal = null, rolPersonal = null;

function avisarError(msg) {
  $("errorGlobal").textContent = msg;
  $("errorGlobal").classList.remove("d-none");
}

// ---------- CURSOS ----------
async function cargarCursos() {
  const snap = await db.collection("cursos").get();
  CACHE = {};
  snap.forEach(d => CACHE[d.id] = d.data());
}

// Crea los cursos faltantes; solo se llama desde el panel de personal.
async function crearColecciones() {
  await cargarCursos();
  const faltan = CURSOS.filter(n => !CACHE[cursoId(n)]);
  if (faltan.length) {
    const batch = db.batch();
    faltan.forEach(nombre => {
      const datos = {
        nombre, area: "Ciencias Sociales", minutos: 30, activo: true,
        titulo: "Evaluación de Ciencias Sociales - " + nombre,
        cantidadPreguntas: PREGUNTAS_EJEMPLO.length
      };
      batch.set(db.collection("cursos").doc(cursoId(nombre)), datos);
      batch.set(db.collection("pruebas").doc(cursoId(nombre)), { cursoId: cursoId(nombre), titulo: datos.titulo, preguntas: publicarSinClave(PREGUNTAS_EJEMPLO) });
      batch.set(db.collection("examenes").doc(cursoId(nombre)), examenDe(cursoId(nombre), datos.titulo, PREGUNTAS_EJEMPLO));
      CACHE[cursoId(nombre)] = datos;
    });
    await batch.commit();
  }
  return faltan.length;
}

async function crearFaltantes() {
  if (!exigirAdministrador()) return;
  try {
    const n = await crearColecciones();
    alert(n ? `Se crearon ${n} cursos.` : "Todas las colecciones ya existen.");
    cargarAdmin();
  } catch (e) { alert("Error: " + e.message); }
}

// ---------- INICIO ----------
if (MODO_ESTUDIANTE) $("tabAdm").hidden = true;

CURSOS.forEach(c => { $("curso").add(new Option(c, c)); $("fCurso").add(new Option(c, cursoId(c))); });
$("fCurso").insertBefore(new Option("Todos", ""), $("fCurso").firstChild);
$("fCurso").value = "";
CURSOS.forEach(c => $("impCurso").add(new Option(c, cursoId(c))));
$("impCurso").value = cursoId("2do de Secundaria");
PARALELOS.forEach(p => $("paralelo").add(new Option(p, p)));
$("fParalelo").add(new Option("Todos", ""));
PARALELOS.forEach(p => $("fParalelo").add(new Option(p, p)));

(async () => {
  try { await cargarCursos(); }
  catch (e) { avisarError("No se pudo conectar con Firestore: " + e.message + " (revisa las reglas de la base de datos)."); }
  actualizarCurso();
})();

// Muestra automáticamente el curso, el Área y el tiempo
function actualizarCurso() {
  const c = CACHE[cursoId($("curso").value)];
  let t = `\u{1F393} ${$("curso").value} — Paralelo ${$("paralelo").value}`;
  if (c) t += ` \u00B7 \u00C1rea: ${c.area} \u00B7 \u23F1 ${c.minutos} min`;
  if (c && !c.activo) t += " \u00B7 \u{1F512} Concluida";
  $("badgeCurso").textContent = t;
}

function mostrar(v) {
  $("vistaEst").classList.toggle("d-none", v !== "est");
  $("vistaAdm").classList.toggle("d-none", v !== "adm");
  $("tabEst").classList.toggle("btn-light", v === "est");
  $("tabEst").classList.toggle("text-primary", v === "est");
  $("tabEst").classList.toggle("fw-semibold", v === "est");
  $("tabEst").classList.toggle("btn-outline-light", v !== "est");
  $("tabAdm").classList.toggle("btn-light", v === "adm");
  $("tabAdm").classList.toggle("text-primary", v === "adm");
  $("tabAdm").classList.toggle("fw-semibold", v === "adm");
  $("tabAdm").classList.toggle("btn-outline-light", v !== "adm");
  if (v === "adm") actualizarVistaPersonal();
}

function actualizarVistaPersonal() {
  const autorizado = Boolean(usuarioPersonal && ["admin", "docente"].includes(rolPersonal));
  $("loginPersonal").classList.toggle("d-none", autorizado);
  $("contenidoPersonal").classList.toggle("d-none", !autorizado);
  $("herramientasAdmin").classList.toggle("d-none", !autorizado || rolPersonal !== "admin");
  $("btnCrearFaltantes").classList.toggle("d-none", rolPersonal !== "admin");
  if (autorizado && !$("vistaAdm").classList.contains("d-none")) cargarAdmin();
}

function mostrarErrorAcceso(mensaje) {
  $("errorLogin").textContent = mensaje;
  $("errorLogin").classList.remove("d-none");
}

function exigirAdministrador() {
  if (usuarioPersonal && rolPersonal === "admin") return true;
  alert("Esta acción está reservada al administrador.");
  return false;
}

async function verificarSesionPersonal(user) {
  usuarioPersonal = null;
  rolPersonal = null;
  if (!user || user.isAnonymous) {
    actualizarVistaPersonal();
    return;
  }

  try {
    const perfil = await db.collection("usuarios").doc(user.uid).get();
    const rol = perfil.exists ? perfil.data().rol : "";
    if (!["admin", "docente"].includes(rol)) {
      await auth.signOut();
      mostrarErrorAcceso("La cuenta no tiene un rol autorizado. Solicita al administrador que la habilite.");
      return;
    }
    usuarioPersonal = user;
    rolPersonal = rol;
    $("errorLogin").classList.add("d-none");
    actualizarVistaPersonal();
  } catch (e) {
    await auth.signOut();
    mostrarErrorAcceso("No se pudo verificar el rol: " + e.message);
  }
}

auth.onAuthStateChanged(user => {
  verificarSesionPersonal(user).catch(e => mostrarErrorAcceso("No se pudo validar la sesión: " + e.message));
});

async function ingresarPersonal() {
  const email = $("emailPersonal").value.trim();
  const password = $("passwordPersonal").value;
  if (!email || !password) return mostrarErrorAcceso("Escribe el correo y la contraseña.");

  $("btnIngresarPersonal").disabled = true;
  $("errorLogin").classList.add("d-none");
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    mostrarErrorAcceso("No se pudo iniciar sesión: " + e.message);
  } finally {
    $("btnIngresarPersonal").disabled = false;
  }
}

async function cerrarSesionPersonal() {
  try {
    await auth.signOut();
    mostrar("est");
  } catch (e) {
    avisarError("No se pudo cerrar la sesión: " + e.message);
  }
}

/* =========================================================
   ESTUDIANTE
   ========================================================= */
let evaluacion = null, estudiante = null, timer = null, enviando = false;
let indicePregunta = 0;   // pregunta que se muestra en pantalla (estilo Quizizz)
let borrador = [];        // respuestas guardadas del estudiante (índice de opción o -1)

// ---------- Navegación tipo Quizizz ----------
// Borrador de respuestas en localStorage (clave única por estudiante y examen)
const claveBorrador = () => "respuestas_" + (estudiante ? estudiante.id : "none");

function guardarBorrador() {
  try { localStorage.setItem(claveBorrador(), JSON.stringify(respuestasMarcadas())); } catch (e) { /* almacenamiento no disponible */ }
}

function leerBorrador() {
  try {
    const v = JSON.parse(localStorage.getItem(claveBorrador()) || "null");
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

function borrarBorrador() {
  try { localStorage.removeItem(claveBorrador()); } catch (e) { }
}

function respuestasMarcadas() { return [...borrador]; }

// Dibuja la pregunta actual en pantalla
function pintarPreguntaActual() {
  const i = indicePregunta, q = evaluacion.preguntas[i], total = evaluacion.preguntas.length;
  const marcadaVal = borrador[i] ?? -1;
  $("contadorPregunta").textContent = `Pregunta ${i + 1} de ${total}`;
  $("preguntaActual").innerHTML = `
    <div class="border rounded p-3 bg-light">
      <p class="fw-semibold fs-5 mb-3">${i + 1}. ${esc(q.p)} ${borrador[i] >= 0 ? '<span class="badge text-bg-success ms-2">✔ Respondida</span>' : '<span class="badge text-bg-secondary ms-2">Sin responder</span>'}</p>
      ${q.o.map((op, j) => `
        <div class="form-check fs-5 py-2 border-bottom">
          <input class="form-check-input" type="radio" id="p${i}o${j}" name="p${i}" value="${j}" ${j === marcadaVal ? "checked" : ""} onchange="preguntaRespondida(${i}, this.value)">
          <label class="form-check-label" for="p${i}o${j}">${"ABCD"[j]}) ${esc(op)}</label>
        </div>`).join("")}
    </div>`;
  // Botones: Anterior se oculta en la primera, Siguiente cambia a Terminar en la última
  $("btnAnterior").disabled = i === 0;
  $("btnSiguiente").classList.toggle("d-none", i === total - 1);
  $("btnSaltar").classList.toggle("d-none", i === total - 1);
  $("barraProgreso").style.width = Math.round(((i + 1) / total) * 100) + "%";
  pintarNavPreguntas();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Al marcar una opción, la respuesta queda guardada de inmediato
async function preguntaRespondida(i, valor) {
  borrador[i] = Number(valor);
  guardarBorrador();                     // persiste en localStorage
  guardarBorradorEnFirestore();          // persiste en la base de datos
  pintarNavPreguntas();
  pintarPreguntaActual();                // muestra el badge "Respondida"
}

// Sube el borrador a Firestore (doc "borrador_<id>" en la colección respuestas)
let subiendoBorrador = null;
function guardarBorradorEnFirestore() {
  if (!estudiante) return;
  const datos = {
    authUid: auth.currentUser ? auth.currentUser.uid : null,
    estudianteId: estudiante.id,
    cursoId: estudiante.cursoId,
    respuestas: [...borrador],
    actualizado: new Date().toISOString()
  };
  const ref = db.collection("respuestas").doc("borrador_" + estudiante.id);
  subiendoBorrador = (subiendoBorrador || Promise.resolve())
    .catch(() => { })
    .then(() => ref.set(datos))
    .finally(() => { subiendoBorrador = null; });
}

function preguntaMover(delta) {
  const total = evaluacion.preguntas.length;
  indicePregunta = Math.min(total - 1, Math.max(0, indicePregunta + delta));
  pintarPreguntaActual();
}

// Salta la pregunta sin responderla (avanza a la siguiente)
function preguntaSaltar() {
  borrador[indicePregunta] = -1;   // desmarca cualquier opción elegida
  guardarBorrador();
  guardarBorradorEnFirestore();
  if (indicePregunta < evaluacion.preguntas.length - 1) indicePregunta++;
  pintarPreguntaActual();
}

// Barra inferior: número por pregunta, verde = respondida, gris = sin responder
function pintarNavPreguntas() {
  const respondidas = borrador.filter(m => m >= 0).length;
  $("contadorRespondidas").textContent = `✔ ${respondidas} de ${borrador.length} respondidas`;
  $("navPreguntas").innerHTML = borrador.map((m, i) => `
    <button type="button" class="btn btn-sm ${m >= 0 ? "btn-success" : "btn-outline-secondary"} ${i === indicePregunta ? "fw-bold border-2" : ""}" onclick="irAPregunta(${i})" title="${m >= 0 ? "Respondida" : "Sin responder"}">
      ${i + 1} ${m >= 0 ? "✔" : ""}
    </button>`).join("");
}

function irAPregunta(i) { indicePregunta = i; pintarPreguntaActual(); }

async function iniciar() {
  const nombres = $("nombres").value.trim(), apellidos = $("apellidos").value.trim();
  if (!nombres || !apellidos) return alert("Escribe tus nombres y apellidos.");

  $("btnIniciar").disabled = true;
  try {
    let sesion = auth.currentUser;
    if (sesion && !sesion.isAnonymous) throw new Error("Cierra la sesión del personal antes de iniciar una evaluación.");
    if (!sesion) sesion = (await auth.signInAnonymously()).user;

    const cid = cursoId($("curso").value);
    let c = CACHE[cid];
    if (!c) {
      const curso = await db.collection("cursos").doc(cid).get();
      if (curso.exists) {
        c = curso.data();
        CACHE[cid] = c;
      }
    }
    if (!c) return alert("No hay evaluación configurada para este curso.");

    // El curso y el nombre identifican un único intento, aunque cambie el paralelo.
    const paralelo = $("paralelo").value;
    const id = `${cid}_${slug(apellidos + " " + nombres)}`;
    estudiante = { id, nombres, apellidos, curso: c.nombre, cursoId: cid, paralelo, area: c.area, authUid: sesion.uid };

    const ref = db.collection("estudiantes").doc(id);
    let reg;
    try {
      reg = await ref.get();
    } catch (e) {
      if (e.code === "permission-denied") {
        return alert("Ya respondiste esta evaluación o ya existe un intento iniciado. No puedes volver a iniciarla.");
      }
      throw e;
    }

    if (localStorage.getItem("eval_rindio_" + id) === "1") {
      return alert("Ya respondiste esta evaluación desde este dispositivo. No puedes volver a iniciarla.");
    }

    if (!c.activo) return alert("La evaluación de este curso ya concluyó.");

    // Las preguntas se leen de la colección "pruebas" (sin la clave de respuesta).
    // La colección "examenes" (con claves) solo la puede leer el personal.
    let prueba = CACHE_PRUEBAS[cid];
    if (!prueba) {
      const p = await db.collection("pruebas").doc(cid).get();
      if (p.exists) { prueba = p.data(); CACHE_PRUEBAS[cid] = prueba; }
    }
    const preguntasBase = prueba && Array.isArray(prueba.preguntas) ? prueba.preguntas : null;
    if (!preguntasBase || !preguntasBase.length) return alert("Aún no hay preguntas para este curso.");

    // Registro del estudiante clasificado por curso y Área
    // Si ya había empezado, se conserva la hora de inicio (el tiempo no se reinicia)
    const ordenGuardado = reg.exists ? reg.data().preguntasOrden : null;
    const ordenValido = Array.isArray(ordenGuardado) &&
      ordenGuardado.length === preguntasBase.length &&
      new Set(ordenGuardado).size === preguntasBase.length &&
      ordenGuardado.every(indice => Number.isInteger(indice) && indice >= 0 && indice < preguntasBase.length);
    const ordenPreguntas = ordenValido ? ordenGuardado : crearOrdenPreguntas(preguntasBase.length);
    const preguntasAsignadas = ordenPreguntas.map(indice => preguntasBase[indice]);
    // En memoria del estudiante solo entran preguntas SIN clave (campo "c")
    evaluacion = { ...c, titulo: (prueba && prueba.titulo) || c.titulo, preguntas: preguntasAsignadas.map(q => ({ p: q.p, o: [...q.o] })) };
    // Recupera las respuestas ya guardadas (localStorage y Firestore)
    borrador = leerBorrador();
    if (!borrador || borrador.length !== evaluacion.preguntas.length) borrador = Array(evaluacion.preguntas.length).fill(-1);
    try {
      const nube = await db.collection("respuestas").doc("borrador_" + id).get();
      if (nube.exists && Array.isArray(nube.data().respuestas) && nube.data().respuestas.length === borrador.length) {
        const nubeDatos = nube.data().respuestas;
        const local = borrador;
        // Gana el origen con más respuestas respondidas
        const cant = arr => arr.filter(m => m >= 0).length;
        borrador = cant(nubeDatos) > cant(local) ? nubeDatos : local;
      }
    } catch (e) { /* si no se puede leer la nube, se usa lo local */ }
    guardarBorradorEnFirestore();
    let inicio = Date.now();
    if (reg.exists && reg.data().inicioMs) inicio = reg.data().inicioMs;
    else {
      try {
        await ref.set({
          ...estudiante,
          inicioMs: inicio,
          registrado: new Date().toISOString(),
          preguntasOrden: ordenPreguntas
        });
      } catch (e) {
        if (e.code === "permission-denied") {
          return alert("Ya respondiste esta evaluación o ya existe un intento iniciado con este nombre.");
        }
        throw e;
      }
    }

    const restante = c.minutos * 60 - Math.floor((Date.now() - inicio) / 1000);
    if (restante <= 0) {
      alert("Tu tiempo ya terminó. Se enviarán automáticamente tus respuestas guardadas.");
      return guardarResultado(respuestasMarcadas());
    }

    // Muestra la prueba asignada al curso, una pregunta a la vez (estilo Quizizz)
    $("tituloEval").textContent = c.titulo;
    $("datosEst").textContent = `${apellidos} ${nombres} · ${c.nombre} "${paralelo}" · Área: ${c.area}`;
    indicePregunta = 0;
    pintarPreguntaActual();
    pintarNavPreguntas();
    $("paso1").classList.add("d-none");
    $("paso2").classList.remove("d-none");
    arrancarReloj(restante);
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    $("btnIniciar").disabled = false;
  }
}

// Cuenta regresiva; al llegar a 0 envía automáticamente
function arrancarReloj(segundos) {
  clearInterval(timer);
  const fin = Date.now() + segundos * 1000;
  const tic = () => {
    const r = Math.max(0, Math.round((fin - Date.now()) / 1000));
    $("reloj").textContent = "⏱ " + String(Math.floor(r / 60)).padStart(2, "0") + ":" + String(r % 60).padStart(2, "0");
    $("reloj").classList.toggle("border-danger", r <= 60);
    $("reloj").classList.toggle("text-danger", r <= 60);
    $("reloj").classList.toggle("border-primary", r > 60);
    $("reloj").classList.toggle("text-primary", r > 60);
    if (r <= 0) { clearInterval(timer); enviar(true); }
  };
  tic();
  timer = setInterval(tic, 500);
}

let modalResumen = null; // instancia de Bootstrap del modal de resumen

async function enviar(auto) {
  if (enviando) return;
  if (auto) {
    // Tiempo agotado: se envía sin preguntar
    enviando = true;
    clearInterval(timer);
    return guardarResultado(respuestasMarcadas());
  }
  // Resumen antes de enviar: preguntar si realmente desea enviar
  const marcadas = respuestasMarcadas();
  const sinResponder = marcadas.filter(m => m < 0).length;
  const respondidas = marcadas.length - sinResponder;
  $("cuerpoResumen").innerHTML = `
    <p class="fs-5 fw-semibold">Has respondido <span class="text-success">${respondidas}</span> de <b>${marcadas.length}</b> preguntas.</p>
    ${sinResponder ? `<div class="alert alert-warning py-2">⚠ Tienes <b>${sinResponder}</b> pregunta(s) sin responder: quedarán como incorrectas.<br>${marcadas.map((m, i) => m < 0 ? i + 1 : null).filter(Boolean).join(", ")}</div>`
      : `<div class="alert alert-success py-2">✔ Respondiste todas las preguntas.</div>`}
    <p class="mb-0">Una vez enviada <b>no podrás modificar tus respuestas</b>.</p>`;
  modalResumen = modalResumen || new bootstrap.Modal($("modalResumen"));
  modalResumen.show();
}

// Se ejecuta al pulsar "Sí, enviar evaluación" en el modal
async function confirmarEnvio() {
  if (enviando) return;
  modalResumen.hide();
  enviando = true;
  clearInterval(timer);
  await guardarResultado(respuestasMarcadas());
}

async function guardarResultado(marcadas) {
  const qs = evaluacion.preguntas;
  // El estudiante NO conoce las claves: se envían solo sus respuestas marcadas.
  // La nota/aciertos los calcula el personal desde la colección "examenes" (con claves).
  const resultado = {
    ...estudiante, titulo: evaluacion.titulo,
    aciertos: 0, desaciertos: qs.length, total: qs.length,
    nota: 0,
    preguntas: qs.map(q => ({ p: q.p, o: [...q.o] })), // sin campo c
    respuestas: marcadas, correctas: qs.map(() => false), fecha: new Date().toISOString()
  };
  pintarResultado(resultado, evaluacion, false);
  borrarBorrador();
  try { localStorage.setItem("eval_rindio_" + estudiante.id, "1"); } catch (e) { }
  try {
    await db.collection("respuestas").doc("borrador_" + estudiante.id).delete().catch(() => { });
    await db.collection("resultados").doc(estudiante.id).set(resultado);
    $("estadoGuardado").textContent = "✅ Resultado guardado.";
  } catch (e) {
    $("estadoGuardado").textContent = "⚠️ No se pudo guardar: " + e.message;
  }
}

function pintarResultado(r, c, yaRindio) {
  // El estudiante no ve su nota (la clave queda en el lado del personal):
  // solo se confirma que sus respuestas fueron enviadas.
  $("notaFinal").textContent = "Enviada ✓";
  $("nAciertos").textContent = "✓ Respuestas enviadas: " + r.respuestas.filter(m => m >= 0).length + " de " + r.total;
  $("nDesaciertos").textContent = "Tu nota aparecerá en el reporte del docente.";
  $("estadoGuardado").textContent = yaRindio ? "Evaluación ya registrada." : "Guardando…";
  $("revision").innerHTML = c.preguntas.map((q, i) => {
    const m = r.respuestas[i];
    return `<p><b>${i + 1}.</b> ${esc(q.p)}<br>
      <span class="fw-semibold">Tu respuesta: ${m >= 0 ? esc(q.o[m]) : "Sin responder"}</span></p>`;
  }).join("");
  $("paso1").classList.add("d-none");
  $("paso2").classList.add("d-none");
  $("paso3").classList.remove("d-none");
}

function reiniciar() {
  enviando = false;
  $("nombres").value = ""; $("apellidos").value = "";
  $("paso3").classList.add("d-none");
  $("paso1").classList.remove("d-none");
}

/* =========================================================
   ADMINISTRADOR
   ========================================================= */
async function leerResultados() {
  const s = await db.collection("resultados").get();
  return s.docs.map(d => ({ ...d.data(), id: d.id }));
}
const porCurso = id => RESULTADOS.filter(r => r.cursoId === id);
const idsConcluidos = () => CURSOS.map(cursoId).filter(id => CACHE[id] && !CACHE[id].activo);
const collatorNomina = new Intl.Collator("es", { sensitivity: "base" });
function compararNomina(a, b) {
  return collatorNomina.compare(a.apellidos || "", b.apellidos || "") ||
    collatorNomina.compare(a.nombres || "", b.nombres || "") ||
    collatorNomina.compare(a.paralelo || "", b.paralelo || "");
}

async function cargarAdmin() {
  if (!usuarioPersonal || !["admin", "docente"].includes(rolPersonal)) return;
  $("tablaCursos").innerHTML = "<tr><td colspan='6'>Cargando…</td></tr>";
  try {
    if (rolPersonal === "admin") await crearColecciones();
    else await cargarCursos();
    await calificarPendientes();
    RESULTADOS = await leerResultados();
    pintarCursos();
    reporte();
  } catch (e) { avisarError("Error al cargar: " + e.message); }
}

// El personal (con acceso a las claves en "examenes") recalcula nota/aciertos/desaciertos
// de todo resultado que aún esté sin calificar (nota 0 y desaciertos = total).
async function calificarPendientes() {
  try {
    const sinCalificar = await db.collection("resultados")
      .where("nota", "==", 0).get();
    if (sinCalificar.empty) return;
    const batch = db.batch();
    let cambios = 0;
    for (const d of sinCalificar.docs) {
      const r = d.data();
      const ex = await db.collection("examenes").doc(r.cursoId).get();
      if (!ex.exists) continue;
      const qs = ex.data().preguntas || [];
      if (!qs.length) continue;
      const marcadas = r.respuestas || [];
      const correctas = qs.map((q, i) => marcadas[i] === q.c);
      const aciertos = correctas.filter(Boolean).length;
      batch.update(d.ref, {
        correctas,
        aciertos,
        desaciertos: qs.length - aciertos,
        nota: Math.round((aciertos / qs.length) * 100),
        calificadoEn: new Date().toISOString()
      });
      cambios++;
    }
    if (cambios) await batch.commit();
  } catch (e) { /* si falla, se recalcula en el próximo ingreso */ }
}

function pintarCursos() {
  const esAdmin = rolPersonal === "admin";
  $("tablaCursos").innerHTML = CURSOS.map(nombre => {
    const id = cursoId(nombre), c = CACHE[id];
    const cant = porCurso(id).length;
    return `<tr>
      <td>${esc(nombre)}</td>
      <td><select class="form-select form-select-sm" id="ar_${id}" ${esAdmin ? "" : "disabled"}>${AREAS.map(a => `<option ${a === c.area ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></td>
      <td><input class="form-control form-control-sm w-auto" type="number" min="1" id="mi_${id}" value="${c.minutos}" ${esAdmin ? "" : "disabled"}> min</td>
      <td>${c.activo ? "🟢 Activa" : "🔒 Concluida"}</td>
      <td>${cant}</td>
      <td>
        ${esAdmin ? `<button class="btn btn-sm btn-primary me-1 mb-1" onclick="guardarFila('${id}')">Guardar</button>
        <button class="btn btn-sm btn-secondary me-1 mb-1" onclick="editarPreguntas('${id}')">Preguntas (${(c.cantidadPreguntas != null ? c.cantidadPreguntas : "...")})</button>` : ""}
        ${esAdmin ? `<button class="btn btn-sm btn-danger me-1 mb-1" onclick="eliminarRegistrosCurso('${id}')">Eliminar estudiantes</button>` : ""}
        <button class="btn btn-sm btn-primary me-1 mb-1" onclick="descargarInformeCurso('${id}')">⬇ Reporte %</button>
        ${c.activo
          ? (esAdmin ? `<button class="btn btn-sm btn-danger me-1 mb-1" onclick="alternarEstado('${id}')">Concluir</button>` : "")
          : `${esAdmin ? `<button class="btn btn-sm btn-success me-1 mb-1" onclick="alternarEstado('${id}')">Reabrir</button>` : ""}
             <button class="btn btn-sm btn-primary me-1 mb-1" onclick="descargarCSV('${id}')">⬇ CSV</button>
             <button class="btn btn-sm btn-primary me-1 mb-1" onclick="descargarPDF('${id}')">⬇ PDF</button>`}
      </td></tr>`;
  }).join("");

  // Las descargas generales se habilitan cuando hay evaluaciones concluidas
  const hay = idsConcluidos().length > 0;
  $("btnGeneral").disabled = !hay;
  $("btnCsvTodos").disabled = !hay;
  $("avisoDescargas").textContent = hay ? "" : "Concluye al menos una evaluación para habilitar las descargas.";
}

// Guarda el Área y el temporizador del curso
async function guardarFila(id) {
  if (!exigirAdministrador()) return;
  const area = $("ar_" + id).value, minutos = Number($("mi_" + id).value);
  if (!minutos || minutos < 1) return alert("Ingresa los minutos (mínimo 1).");
  try {
    await db.collection("cursos").doc(id).update({ area, minutos });
    CACHE[id].area = area; CACHE[id].minutos = minutos;
    alert("Guardado: " + CACHE[id].nombre + " · " + area + " · " + minutos + " min");
  } catch (e) { alert("Error: " + e.message); }
}

// Concluye o reabre la evaluación de un curso
async function alternarEstado(id) {
  if (!exigirAdministrador()) return;
  const c = CACHE[id];
  const msg = c.activo
    ? `¿Concluir la evaluación de ${c.nombre}? Los estudiantes ya no podrán rendirla.`
    : `¿Reabrir la evaluación de ${c.nombre}?`;
  if (!confirm(msg)) return;
  try {
    await db.collection("cursos").doc(id).update({ activo: !c.activo, concluidoEn: c.activo ? new Date().toISOString() : null });
    cargarAdmin();
  } catch (e) { alert("Error: " + e.message); }
}

async function eliminarDocumentosCurso(coleccion, id) {
  let eliminados = 0;
  while (true) {
    const snapshot = await db.collection(coleccion)
      .where("cursoId", "==", id)
      .limit(400)
      .get();
    if (snapshot.empty) return eliminados;

    const batch = db.batch();
    snapshot.docs.forEach(documento => batch.delete(documento.ref));
    await batch.commit();
    eliminados += snapshot.size;
  }
}

async function eliminarRegistrosCurso(id) {
  if (!exigirAdministrador()) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id)) return alert("El curso seleccionado no es válido.");
  const curso = CACHE[id];
  if (!curso) return alert("No se encontró la configuración del curso.");
  if (!confirm(`Se concluirá la evaluación de ${curso.nombre} y se eliminarán permanentemente todos sus registros de estudiantes y resultados. Las preguntas y la configuración del curso se conservarán. ¿Continuar?`)) return;

  let estudiantesEliminados = 0, resultadosEliminados = 0;
  try {
    if (curso.activo) {
      await db.collection("cursos").doc(id).update({ activo: false, concluidoEn: new Date().toISOString() });
      curso.activo = false;
    }
    estudiantesEliminados = await eliminarDocumentosCurso("estudiantes", id);
    resultadosEliminados = await eliminarDocumentosCurso("resultados", id);
    RESULTADOS = await leerResultados();
    pintarCursos();
    reporte();
    alert(`Eliminados ${estudiantesEliminados} registros de estudiantes y ${resultadosEliminados} resultados de ${curso.nombre}.`);
  } catch (e) {
    alert(`No se pudo completar el borrado. Se eliminaron ${estudiantesEliminados} registros de estudiantes y ${resultadosEliminados} resultados antes del error: ${e.message}`);
    await cargarAdmin();
  }
}

/* ---------- Editor de preguntas ---------- */
let edit = null;

async function editarPreguntas(id) {
  const c = CACHE[id];
  // Las preguntas con clave están en "examenes" (solo personal)
  let preguntas = (c.preguntas !== undefined) ? c.preguntas : null;
  if (!preguntas) {
    try {
      const ex = await db.collection("examenes").doc(id).get();
      preguntas = ex.exists ? ex.data().preguntas : [];
      c.preguntas = preguntas;
    } catch (e) { preguntas = []; }
  }
  edit = { id, titulo: c.titulo, preguntas: JSON.parse(JSON.stringify(preguntas || [])) };
  pintarEditor();
  $("editor").scrollIntoView({ behavior: "smooth" });
}

function pintarEditor() {
  const c = CACHE[edit.id];
  $("editor").classList.remove("d-none");
  $("editor").innerHTML = `
    <div class="card-body">
    <h2 class="h4">Preguntas — ${esc(c.nombre)}</h2>
    <label for="edTitulo" class="form-label">Título de la evaluación</label>
    <input class="form-control" id="edTitulo" value="${esc(edit.titulo)}">
    ${edit.preguntas.map((q, i) => `
      <div class="border-bottom py-3">
        <p class="fw-semibold">${i + 1}. ${esc(q.p)}</p>
        <button class="btn btn-sm btn-danger mb-2" onclick="quitarPregunta(${i})">Quitar</button><br>
        ${q.o.map((o, j) => `<span class="${j === q.c ? "text-success fw-semibold" : ""}">${"ABCD"[j]}) ${esc(o)}</span>`).join(" · ")}
      </div>`).join("")}
    <h3 class="h5 mt-3">Agregar pregunta</h3>
    <input class="form-control" id="nqP" placeholder="Enunciado de la pregunta">
    <div class="row g-2 mt-1">
      ${[0, 1, 2, 3].map(j => `<div class="col-12 col-md-6"><input class="form-control" id="nqO${j}" placeholder="Opción ${"ABCD"[j]}"></div>`).join("")}
    </div>
    <label for="nqC" class="form-label mt-3">Respuesta correcta</label>
    <select class="form-select" id="nqC"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select>
    <div class="d-flex flex-wrap gap-2 mt-3">
    <button class="btn btn-secondary" onclick="agregarPregunta()">+ Agregar</button>
    <button class="btn btn-primary" onclick="guardarPreguntas()">Guardar cambios</button>
    <button class="btn btn-secondary" onclick="$('editor').classList.add('d-none')">Cerrar</button>
    </div>
    </div>`;
}

function agregarPregunta() {
  edit.titulo = $("edTitulo").value;
  const p = $("nqP").value.trim();
  const o = [0, 1, 2, 3].map(j => $("nqO" + j).value.trim());
  if (!p || o.some(x => !x)) return alert("Completa el enunciado y las 4 opciones.");
  edit.preguntas.push({ p, o, c: Number($("nqC").value) });
  pintarEditor();
}

function quitarPregunta(i) {
  edit.titulo = $("edTitulo").value;
  edit.preguntas.splice(i, 1);
  pintarEditor();
}

async function guardarPreguntas() {
  if (!exigirAdministrador()) return;
  edit.titulo = $("edTitulo").value.trim() || "Evaluación";
  if (!edit.preguntas.length) return alert("Agrega al menos una pregunta.");
  try {
    await guardarExamenEnBD(edit.id, edit.titulo, edit.preguntas);
    CACHE[edit.id].titulo = edit.titulo;
    alert("Preguntas guardadas.");
    pintarCursos();
  } catch (e) { alert("Error: " + e.message); }
}

/* ---------- Reporte en pantalla ---------- */
let graficos = {};

// Calcula totales, promedio y aciertos/desaciertos por pregunta
function stats(lista) {
  const n = lista.length;
  const aciertos = lista.reduce((s, r) => s + r.aciertos, 0);
  const desaciertos = lista.reduce((s, r) => s + r.desaciertos, 0);
  const promedio = n ? Math.round(lista.reduce((s, r) => s + r.nota, 0) / n) : 0;
  const nPreg = Math.max(0, ...lista.map(r => (r.correctas || []).length));
  const pa = Array(nPreg).fill(0), pd = Array(nPreg).fill(0);
  lista.forEach(r => (r.correctas || []).forEach((ok, i) => ok ? pa[i]++ : pd[i]++));
  return { n, aciertos, desaciertos, promedio, pa, pd };
}
const datosTorta = s => ({
  labels: ["Aciertos", "Desaciertos"],
  datasets: [{ data: [s.aciertos, s.desaciertos], backgroundColor: ["#16a34a", "#dc2626"] }]
});
const datosPreguntas = s => ({
  labels: s.pa.map((_, i) => "P" + (i + 1)),
  datasets: [
    { label: "Aciertos", data: s.pa, backgroundColor: "#16a34a" },
    { label: "Desaciertos", data: s.pd, backgroundColor: "#dc2626" }
  ]
});

function dibujar(id, tipo, data) {
  if (graficos[id]) graficos[id].destroy();
  graficos[id] = new Chart($(id), { type: tipo, data, options: { responsive: true } });
}

function reporte() {
  const fc = $("fCurso").value, fp = $("fParalelo").value;
  const lista = RESULTADOS.filter(r => (!fc || r.cursoId === fc) && (!fp || r.paralelo === fp));
  const s = stats(lista);
  $("resumen").textContent = `${s.n} evaluaciones · Promedio: ${s.promedio}/100`;

  dibujar("gTotal", "doughnut", datosTorta(s));

  const grupos = {};
  lista.forEach(r => {
    const k = `${r.curso} "${r.paralelo}"`;
    grupos[k] = grupos[k] || { a: 0, d: 0 };
    grupos[k].a += r.aciertos; grupos[k].d += r.desaciertos;
  });
  dibujar("gCursos", "bar", {
    labels: Object.keys(grupos),
    datasets: [
      { label: "Aciertos", data: Object.values(grupos).map(g => g.a), backgroundColor: "#16a34a" },
      { label: "Desaciertos", data: Object.values(grupos).map(g => g.d), backgroundColor: "#dc2626" }
    ]
  });

  dibujar("gPreguntas", "bar", datosPreguntas(s));

  $("tabla").innerHTML = [...lista].sort(compararNomina).map(r => `
    <tr><td>${esc(r.apellidos + " " + r.nombres)}</td><td>${esc(r.curso)}</td><td>${esc(r.area)}</td><td>${esc(r.paralelo)}</td>
    <td class="text-success fw-semibold">${r.aciertos}</td><td class="text-danger fw-semibold">${r.desaciertos}</td><td>${r.nota}</td>
    <td>${new Date(r.fecha).toLocaleString("es-BO")}</td>
    <td><button class="btn btn-sm btn-primary" onclick="descargarExamenEstudiante('${esc(r.id)}')">⬇ PDF</button></td></tr>`).join("");
}

function exigirAccesoDescargas() {
  if (usuarioPersonal && ["admin", "docente"].includes(rolPersonal)) return true;
  alert("Inicia sesión con una cuenta autorizada de administrador o docente.");
  return false;
}

async function descargarExamenEstudiante(id) {
  if (!exigirAccesoDescargas()) return;
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");
  const r = RESULTADOS.find(resultado => resultado.id === id);
  if (!r) return alert("No se encontró el resultado del estudiante. Actualiza el reporte e inténtalo de nuevo.");

  const preguntasGuardadas = Array.isArray(r.preguntas) && r.preguntas.length ? r.preguntas : null;
  // El personal puede leer el examen con claves desde "examenes"
  let preguntas = preguntasGuardadas;
  if (!preguntas && r.cursoId) {
    try {
      const ex = await db.collection("examenes").doc(r.cursoId).get();
      if (ex.exists) preguntas = ex.data().preguntas;
    } catch (e) { }
  }
  if (!preguntas || !preguntas.length) return alert("No se encontraron las preguntas de esta evaluación.");

  const doc = new window.jspdf.jsPDF();
  // Escribir: si centrado = true, el texto se centra y va en mayúsculas (para títulos)
  let y = 18;
  const escribir = (texto, x, tamano, negrita, centrado) => {
    doc.setFontSize(tamano);
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    const salida = centrado ? String(texto).toLocaleUpperCase("es-BO") : String(texto);
    const lineas = doc.splitTextToSize(salida, 180);
    lineas.forEach(linea => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(linea, centrado ? doc.internal.pageSize.getWidth() / 2 : x, y, centrado ? { align: "center" } : undefined);
      y += tamano * 0.55;
    });
  };

  escribir("Examen y resultado del estudiante", 15, 16, true, true);
  escribir(`${r.apellidos} ${r.nombres} · ${r.curso} "${r.paralelo}" · ${r.area}`, 15, 10, false);
  escribir(`Aciertos: ${r.aciertos} · Desaciertos: ${r.desaciertos} · Nota: ${r.nota}/100`, 15, 11, true);
  escribir(`Fecha: ${new Date(r.fecha).toLocaleString("es-BO")}`, 15, 9, false);
  if (!preguntasGuardadas) {
    escribir("Aviso: este resultado antiguo no conserva una copia del examen; se muestran las preguntas actuales del curso.", 15, 9, false);
  }
  y += 3;

  preguntas.forEach((q, i) => {
    const respuesta = Array.isArray(r.respuestas) ? r.respuestas[i] : -1;
    const acierto = respuesta === q.c;
    escribir(`${i + 1}. ${q.p}`, 15, 11, true);
    q.o.forEach((opcion, j) => {
      const marcas = [];
      if (j === respuesta) marcas.push("Respuesta del estudiante");
      if (j === q.c) marcas.push("Correcta");
      escribir(`   ${"ABCD"[j]}) ${opcion}${marcas.length ? ` — ${marcas.join(" · ")}` : ""}`, 18, 9, j === respuesta || j === q.c);
    });
    escribir(respuesta < 0 ? "Resultado: Sin responder" : `Resultado: ${acierto ? "Acierto" : "Desacierto"}`, 18, 9, true);
    y += 3;
  });

  doc.save(`examen_${slug(r.apellidos + "_" + r.nombres)}.pdf`);
}

async function descargarInformePorCurso() {
  if (!exigirAccesoDescargas()) return;
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");
  try {
    RESULTADOS = await leerResultados();
    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("Informe de resultados por curso".toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, 18, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Porcentajes calculados sobre el total de respuestas registradas.", 15, 25);
    doc.text("Generado: " + new Date().toLocaleString("es-BO"), 15, 31);

    const filas = CURSOS.map(nombre => {
      const id = cursoId(nombre), s = stats(porCurso(id));
      const total = s.aciertos + s.desaciertos;
      const porcentajeAciertos = total ? (s.aciertos * 100 / total).toFixed(1) + "%" : "0.0%";
      const porcentajeDesaciertos = total ? (s.desaciertos * 100 / total).toFixed(1) + "%" : "0.0%";
      return [nombre, s.n, total, porcentajeAciertos, porcentajeDesaciertos, s.promedio + "/100"];
    });
    tabla(doc, 42, ["Curso", "Estudiantes", "Respuestas", "Aciertos", "Desaciertos", "Promedio"], [42, 34, 30, 24, 27, 23], filas);
    doc.save("informe_porcentajes_por_curso.pdf");
  } catch (e) {
    alert("No se pudo generar el informe: " + e.message);
  }
}

async function descargarInformeCurso(id) {
  if (!exigirAccesoDescargas()) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id)) return alert("El curso seleccionado no es válido.");
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");

  try {
    RESULTADOS = await leerResultados();
    const curso = CACHE[id];
    if (!curso) return alert("No se encontró la configuración del curso. Actualiza el reporte e inténtalo de nuevo.");

    const lista = porCurso(id);
    const s = stats(lista);
    const total = s.aciertos + s.desaciertos;
    const porcentaje = cantidad => total ? (cantidad * 100 / total).toFixed(1) + "%" : "0.0%";
    const doc = new window.jspdf.jsPDF();

    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(`Resumen de ${curso.nombre}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, 18, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Área: ${curso.area} · Generado: ${new Date().toLocaleString("es-BO")}`, 15, 26);

    let y = tabla(doc, 38, ["Indicador", "Resultado"], [105, 75], [
      ["Evaluaciones registradas", s.n],
      ["Respuestas contabilizadas", total],
      ["Aciertos", `${s.aciertos} (${porcentaje(s.aciertos)})`],
      ["Desaciertos", `${s.desaciertos} (${porcentaje(s.desaciertos)})`],
      ["Promedio de notas", `${s.promedio}/100`]
    ]);

    if (s.n) {
      y += 8;
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("RESULTADOS POR PARALELO", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;
      const filasParalelos = PARALELOS.map(paralelo => {
        const paraleloStats = stats(lista.filter(r => r.paralelo === paralelo));
        const totalParalelo = paraleloStats.aciertos + paraleloStats.desaciertos;
        const porcentajeParalelo = cantidad => totalParalelo
          ? (cantidad * 100 / totalParalelo).toFixed(1) + "%"
          : "0.0%";
        return [
          paralelo,
          paraleloStats.n,
          `${paraleloStats.aciertos} (${porcentajeParalelo(paraleloStats.aciertos)})`,
          `${paraleloStats.desaciertos} (${porcentajeParalelo(paraleloStats.desaciertos)})`,
          `${paraleloStats.promedio}/100`
        ];
      });
      y = tabla(doc, y, ["Paralelo", "Eval.", "Aciertos", "Desaciertos", "Promedio"], [28, 24, 42, 48, 38], filasParalelos) + 8;

      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("DETALLE POR ESTUDIANTE", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;
      const estudiantes = [...lista]
        .sort(compararNomina)
        .map(r => [r.apellidos + " " + r.nombres, r.paralelo, r.aciertos, r.desaciertos, `${r.nota}/100`]);
      tabla(doc, y, ["Apellidos y nombres", "Par.", "Aciertos", "Desaciertos", "Nota"], [65, 20, 30, 30, 35], estudiantes);
    } else {
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text("Aún no hay evaluaciones registradas para este curso.", 15, y + 8);
    }

    doc.save(`informe_porcentajes_${id}.pdf`);
  } catch (e) {
    alert("No se pudo generar el informe del curso: " + e.message);
  }
}

/* ---------- Descargas: CSV ---------- */
function bajar(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
}

// Resumen de lo que obtuvo cada estudiante (se abre en Excel)
async function descargarCSV(id) {
  if (!exigirAccesoDescargas()) return;
  RESULTADOS = await leerResultados();
  const ids = id ? [id] : idsConcluidos();
  const filas = [["Curso", "Área", "Paralelo", "Apellidos", "Nombres", "Aciertos", "Desaciertos", "Nota", "Fecha"]];
  ids.forEach(cid => [...porCurso(cid)]
    .sort(compararNomina)
    .forEach(r => filas.push([r.curso, r.area, r.paralelo, r.apellidos, r.nombres, r.aciertos, r.desaciertos, r.nota, r.fecha])));
  const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  bajar(new Blob(["\ufeff" + csv], { type: "text/csv" }), id ? `notas_${id}.csv` : "notas_todos.csv");
}

/* ---------- Descargas: PDF con gráficos ---------- */

// Dibuja un gráfico fuera de pantalla y devuelve la imagen para el PDF
function imagenGrafico(tipo, data, ancho, alto) {
  const cv = document.createElement("canvas");
  cv.width = ancho; cv.height = alto;
  const fondo = { id: "fondo", beforeDraw(ch) { ch.ctx.save(); ch.ctx.fillStyle = "#fff"; ch.ctx.fillRect(0, 0, ch.width, ch.height); ch.ctx.restore(); } };
  const ch = new Chart(cv, { type: tipo, data, options: { animation: false, responsive: false, devicePixelRatio: 1 }, plugins: [fondo] });
  const url = cv.toDataURL("image/png");
  ch.destroy();
  return url;
}

// Dibuja tablas con celdas y salta de página si hace falta
function tabla(doc, y, cabecera, anchos, filas) {
  const margen = 15;
  const anchoDisponible = doc.internal.pageSize.getWidth() - margen * 2;
  const sumaAnchos = anchos.reduce((suma, ancho) => suma + ancho, 0);
  const anchosCeldas = anchos.map(ancho => anchoDisponible * ancho / sumaAnchos);
  const dibujarFila = (fila, negrita) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(8.5);
    const textos = fila.map((texto, indice) => {
      const lineas = doc.splitTextToSize(String(texto), Math.max(8, anchosCeldas[indice] - 4));
      return Array.isArray(lineas) ? lineas : [lineas];
    });
    const alto = Math.max(7, Math.max(...textos.map(lineas => lineas.length)) * 4 + 3);
    if (y + alto > 280 && y > 20) {
      doc.addPage();
      y = 20;
      if (fila !== cabecera) dibujarFila(cabecera, true);
    }

    let x = margen;
    doc.setDrawColor(80);
    doc.setLineWidth(0.1);
    textos.forEach((lineas, indice) => {
      const ancho = anchosCeldas[indice];
      doc.rect(x, y, ancho, alto);
      doc.text(lineas, x + 2, y + 4.5);
      x += ancho;
    });
    y += alto;
  };

  dibujarFila(cabecera, true);
  filas.forEach(fila => dibujarFila(fila, false));
  return y;
}

async function generarPDF(ids, archivo, titulo) {
  if (!exigirAccesoDescargas()) return;
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");
  RESULTADOS = await leerResultados();
  const doc = new window.jspdf.jsPDF();
  let y = 20;

  // Portada: resumen general por curso
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(titulo.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Generado: " + new Date().toLocaleString("es-BO"), 15, y); y += 10;

  const filas = ids.map(id => {
    const c = CACHE[id], s = stats(porCurso(id));
    return [c.nombre, c.area, s.n, s.promedio + "/100", s.aciertos, s.desaciertos];
  });
  y = tabla(doc, y, ["Curso", "Área", "Estud.", "Promedio", "Aciertos", "Desaciertos"], [40, 35, 22, 27, 27, 28], filas);

  // Gráfico comparativo de promedios por curso
  const conDatos = ids.filter(id => porCurso(id).length);
  if (conDatos.length > 1) {
    if (y > 200) { doc.addPage(); y = 20; }
    const img = imagenGrafico("bar", {
      labels: conDatos.map(id => CACHE[id].nombre),
      datasets: [{ label: "Promedio (sobre 100)", data: conDatos.map(id => stats(porCurso(id)).promedio), backgroundColor: "#1d4ed8" }]
    }, 850, 350);
    doc.addImage(img, "PNG", 15, y + 4, 170, 70);
  }

  // Una página por curso: gráficos + lista de estudiantes
  ids.forEach(id => {
    const c = CACHE[id], lista = porCurso(id), s = stats(lista);
    doc.addPage(); y = 20;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`${c.nombre} - ${c.area}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Estudiantes: ${s.n}   Promedio: ${s.promedio}/100   Aciertos: ${s.aciertos}   Desaciertos: ${s.desaciertos}`, 15, y); y += 8;
    if (!s.n) { doc.text("Sin resultados.", 15, y); return; }

    doc.addImage(imagenGrafico("doughnut", datosTorta(s), 400, 400), "PNG", 15, y, 65, 65);
    doc.addImage(imagenGrafico("bar", datosPreguntas(s), 700, 400), "PNG", 85, y, 110, 63);
    y += 72;

    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("RESULTADOS POR ESTUDIANTE", doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
    const orden = [...lista].sort(compararNomina);
    tabla(doc, y, ["Apellidos y nombres", "Par.", "Aciertos", "Desaciertos", "Nota"], [65, 20, 30, 30, 35],
      orden.map(r => [r.apellidos + " " + r.nombres, r.paralelo, r.aciertos, r.desaciertos, r.nota]));
  });

  doc.save(archivo);
}

const descargarPDF = id => generarPDF([id], `resumen_${id}.pdf`, `Resumen de ${CACHE[id].nombre}`);
const descargarGeneral = () => generarPDF(idsConcluidos(), "resumen_general.pdf", "Resumen general de evaluaciones");

/* ---------- Importar un examen desde texto ---------- */
let importadas = [];

// Lee el texto del examen: "1.- Pregunta" y opciones "a) ..."
function leerExamen(texto) {
  const preguntas = [];
  let q = null, op = -1;
  texto.split(/\r?\n/).forEach(linea => {
    const t = linea.replace(/\s+/g, " ").trim();
    if (!t) return;
    let m;
    if ((m = t.match(/^(\d+)\s*[.\-)]+\s*(.*)$/))) {              // nueva pregunta
      q = { p: m[2], o: [] }; op = -1; preguntas.push(q);
    } else if (q && (m = t.match(/^([a-dA-D])\s*[.)]\s*(.*)$/))) { // opción a), b), c), d)
      q.o.push(m[2]); op = q.o.length - 1;
    } else if (q) {                                                // continuación de línea
      if (op >= 0) q.o[op] += " " + t; else q.p += " " + t;
    }
  });
  return preguntas;
}

// Lee la clave: "1c 2b 3b ..." o "cbb..." (en el orden en que aparecen las preguntas)
function leerClave(txt) {
  const t = txt.trim();
  const pares = [...t.matchAll(/\d+\s*[-.):]*\s*([a-dA-D])(?![a-zA-Z])/g)];
  if (pares.length) return pares.map(m => m[1].toLowerCase());
  const junto = t.replace(/[\s,;]/g, "");
  return /^[a-dA-D]+$/.test(junto) ? junto.toLowerCase().split("") : [];
}

// Vista previa: la respuesta correcta se muestra en verde
function analizarExamen() {
  const qs = leerExamen($("impTexto").value);
  const clave = leerClave($("impClave").value);
  importadas = [];
  $("btnImportar").disabled = true;

  if (!qs.length) return ($("impVista").innerHTML = `<p class="text-danger">No se encontraron preguntas. Pega el texto del examen.</p>`);
  const malas = qs.map((q, i) => q.o.length !== 4 ? i + 1 : 0).filter(Boolean);
  if (malas.length) return ($("impVista").innerHTML = `<p class="text-danger">Estas preguntas no tienen 4 opciones: ${malas.join(", ")}</p>`);
  if (clave.length !== qs.length)
    return ($("impVista").innerHTML = `<p class="text-danger">El examen tiene ${qs.length} preguntas y la clave ${clave.length} respuestas.</p>`);

  importadas = qs.map((q, i) => ({ p: q.p, o: q.o, c: "abcd".indexOf(clave[i]) }));
  $("impVista").innerHTML = `<p class="text-success fw-semibold">✔ ${importadas.length} preguntas listas. Revisa la clave antes de guardar.</p>` +
    importadas.map((q, i) => `
      <div class="border-bottom py-3"><b>${i + 1}. ${esc(q.p)}</b><br>
      ${q.o.map((o, j) => `<span class="${j === q.c ? "text-success fw-semibold" : ""}">${"ABCD"[j]}) ${esc(o)}</span>`).join("<br>")}</div>`).join("");
  $("btnImportar").disabled = false;
}

// Guarda el examen COMPLETO (título, preguntas y respuestas) en la base de datos.
// Reemplaza en su totalidad el examen anterior del curso (cursos + examenes).
async function guardarExamenEnBD(id, titulo, preguntas) {
  const c = CACHE[id];
  const examen = examenDe(id, titulo, preguntas);
  // Reemplazo total: set() sustituye todo el contenido anterior.
  // "examenes" guarda la clave (c) — solo el personal la lee.
  // "pruebas" guarda las mismas preguntas SIN la clave — lo que ve el estudiante.
  await db.collection("examenes").doc(id).set(examen);
  await db.collection("pruebas").doc(id).set({
    cursoId: id, titulo, cantidad: examen.cantidad,
    preguntas: publicarSinClave(examen.preguntas),
    actualizado: examen.actualizado
  });
  await db.collection("cursos").doc(id).update({ titulo, cantidadPreguntas: examen.cantidad });
  c.titulo = titulo; c.cantidadPreguntas = examen.cantidad; delete c.preguntas;
}

// Guarda en la base de datos el examen cargado (archivo .json o texto pegado)
async function guardarImportacion() {
  if (!exigirAdministrador()) return;
  const id = $("impCurso").value, c = CACHE[id];
  if (!importadas.length) return;
  if (!confirm(`Se REEMPLAZARÁ por completo el examen de ${c.nombre} (${c.cantidadPreguntas || 0} preguntas actuales) por ${importadas.length} preguntas nuevas. ¿Continuar?`)) return;
  const titulo = $("impTitulo").value.trim() || "Evaluación";
  try {
    await guardarExamenEnBD(id, titulo, importadas);
    alert(`Listo: examen guardado en la base de datos. ${importadas.length} preguntas reemplazaron totalmente las anteriores de ${c.nombre}.`);
    importadas = [];
    $("btnImportar").disabled = true;
    pintarCursos();
  } catch (e) { alert("Error: " + e.message); }
}

// Carga un examen ya preparado (.json con título y preguntas {p, o, c}).
// Al subir el archivo, el examen se guarda directamente en la base de datos
// y reemplaza en su totalidad el examen anterior del curso.
function cargarArchivoExamen(input) {
  const f = input.files[0];
  if (!f) return;
  importadas = [];
  $("btnImportar").disabled = true;
  $("impVista").textContent = "";
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const d = JSON.parse(lector.result);
      if (!d || typeof d !== "object" || !Array.isArray(d.preguntas) ||
          (d.titulo !== undefined && typeof d.titulo !== "string") ||
          (d.cursoId !== undefined && (typeof d.cursoId !== "string" || !CURSOS.some(c => cursoId(c) === d.cursoId))) ||
          !d.preguntas.every(q => q && typeof q.p === "string" && q.p.trim() &&
            Array.isArray(q.o) && q.o.length === 4 &&
            q.o.every(o => typeof o === "string" && o.trim()) &&
            Number.isInteger(q.c) && q.c >= 0 && q.c < 4)) {
        throw new Error("formato no válido");
      }
      if (d.cursoId) $("impCurso").value = d.cursoId;
      if (d.titulo) $("impTitulo").value = d.titulo;
      $("impTexto").value = "";
      $("impClave").value = "";
      importadas = d.preguntas;
      if (!importadas.length) {
        $("impVista").innerHTML = `<p class="small text-secondary">Plantilla de ${esc($("impCurso").selectedOptions[0].text)} cargada, pero todavía no tiene preguntas. Agrégalas al archivo antes de importarlo.</p>`;
        return;
      }
      $("impVista").innerHTML = `<p class="text-success fw-semibold">✔ ${importadas.length} preguntas listas. Revisa la clave antes de guardar.</p>` +
        importadas.map((q, i) => `
          <div class="border-bottom py-3"><b>${i + 1}. ${esc(q.p)}</b><br>
          ${q.o.map((o, j) => `<span class="${j === q.c ? "text-success fw-semibold" : ""}">${"ABCD"[j]}) ${esc(o)}</span>`).join("<br>")}</div>`).join("");
      $("btnImportar").disabled = false;
      // Guardado automático: el archivo subido reemplaza totalmente el examen del curso en la base de datos
      guardarImportacion();
    } catch (e) {
      importadas = [];
      $("impVista").innerHTML = `<p class="text-danger">No se pudo leer el archivo: ${esc(e.message)}</p>`;
    }
  };
  lector.onerror = () => {
    importadas = [];
    $("impVista").innerHTML = `<p class="text-danger">No se pudo leer el archivo seleccionado.</p>`;
  };
  lector.readAsText(f);
}

/* ---------- Plantilla para subir preguntas y respuestas ---------- */

// Descarga una plantilla .json del curso elegido, con 2 preguntas de ejemplo
// para completar y cargar despues en "Cargar archivo (.json)".
function descargarPlantillaExamen() {
  if (!exigirAdministrador()) return;
  const cid = $("impCurso").value;
  const curso = CACHE[cid] || { nombre: $("impCurso").selectedOptions[0].text };
  const plantilla = {
    cursoId: cid,
    titulo: $("impTitulo").value.trim() || ("Evaluacion de " + curso.nombre),
    instrucciones: "Complete cada pregunta con su enunciado (p), las 4 opciones (o) y el indice de la respuesta correcta (c: 0=A, 1=B, 2=C, 3=D). No cambie cursoId. Guarde el archivo y carguelo en 'Cargar archivo (.json)'.",
    preguntas: [
      { p: "Escriba aqui la pregunta 1", o: ["Opcion A", "Opcion B", "Opcion C", "Opcion D"], c: 0 },
      { p: "Escriba aqui la pregunta 2", o: ["Opcion A", "Opcion B", "Opcion C", "Opcion D"], c: 0 }
    ]
  };
  bajar(new Blob([JSON.stringify(plantilla, null, 2)], { type: "application/json" }),
    "plantilla_examen_" + cid + ".json");
}
