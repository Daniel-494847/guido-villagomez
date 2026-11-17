/* =========================================================
   app.js — EVALUACION FINAL con Firebase Firestore
   Colecciones:
     cursos       -> un documento por curso (Área, minutos, estado, preguntas)
     examenes     -> examen completo por curso (título, preguntas, respuestas y claves) [SOLO PERSONAL]
     pruebas      -> preguntas SIN la respuesta correcta [LEGIBLE POR ESTUDIANTES]
     claves       -> claves de calificación por curso (respuesta correcta de cada pregunta) [SOLO PERSONAL]
     estudiantes  -> registro del estudiante, clasificado por curso y Área
     resultados   -> nota sobre 45, aciertos y desaciertos de cada estudiante
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
let paraleloCursosSeleccionado = "A";
const NOTA_MAXIMA = 45; // Nota máxima que puede obtener un estudiante
// Redondea la nota a un decimal y la muestra sin ceros innecesarios (34.2, 45)
const redondearNota = valor => Math.round(Number(valor) * 10) / 10;
const textoNota = valor => {
  const v = redondearNota(valor);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// Calcula la nota con las claves del curso (solo se usan después de enviar la evaluación).
// "respuestas" está en el orden en que el estudiante vio las preguntas y "orden" indica
// el índice original de cada pregunta en el examen.
function calcularNotaConClaves(respuestas, orden, claves) {
  const total = Array.isArray(respuestas) ? respuestas.length : 0;
  let aciertos = 0;
  const correctas = [];
  for (let i = 0; i < total; i++) {
    const base = Array.isArray(orden) && Number.isInteger(orden[i]) ? orden[i] : i;
    const ok = Number.isInteger(respuestas[i]) && respuestas[i] === claves[base];
    correctas.push(ok);
    if (ok) aciertos++;
  }
  return {
    aciertos,
    desaciertos: total - aciertos,
    total,
    nota: total ? redondearNota((aciertos / total) * NOTA_MAXIMA) : 0,
    correctas
  };
}

// Desbloquea las claves del curso para este estudiante (una sola vez, después del envío).
async function obtenerClavesCurso(resultado) {
  const user = auth.currentUser;
  if (!user || !resultado || !resultado.cursoId) return null;

  // El personal puede leer las claves directamente, sin crear un desbloqueo.
  if (!user.isAnonymous) {
    try {
      const sol = await db.collection("soluciones").doc(resultado.cursoId).get();
      if (!sol.exists) return null;
      const claves = sol.data().claves;
      return Array.isArray(claves) ? claves : null;
    } catch (e) {
      return null;
    }
  }

  const desbloqueoId = user.uid;
  const ref = db.collection("desbloqueos").doc(resultado.cursoId).collection("estudiantes").doc(desbloqueoId);
  let snap;
  try {
    snap = await ref.get();
  } catch (e) {
    return null;
  }
  if (!snap.exists) {
    try {
      await ref.set({
        authUid: user.uid,
        cursoId: resultado.cursoId,
        resultadoId: resultado.id,
        creadoEn: new Date().toISOString()
      });
    } catch (e) {
      return null;
    }
  }

  try {
    const sol = await db.collection("soluciones").doc(resultado.cursoId).get();
    if (!sol.exists) return null;
    const claves = sol.data().claves;
    return Array.isArray(claves) ? claves : null;
  } catch (e) {
    return null;
  }
}

async function obtenerNotaLocal(resultado) {
  const claves = await obtenerClavesCurso(resultado);
  if (!claves) return null;
  return calcularNotaConClaves(resultado.respuestas || [], resultado.preguntasOrden, claves);
}
const CURSOS = [ // Solo Secundaria (cada curso aplica a todos sus paralelos A, B y C)
  "1ro de Secundaria", "2do de Secundaria", "3ro de Secundaria",
  "4to de Secundaria", "5to de Secundaria", "6to de Secundaria"
];
const AREAS = [
  "Ciencias Sociales", "Matemática", "Comunicación y Lenguajes", "Ciencias Naturales",
  "Técnica Tecnológica", "Educación Física y Deportes", "Artes Plásticas y Visuales", "Valores, Espiritualidad y Religiones"
];
// Abrevia "Secundaria" a "Sec" (solo para vistas del administrador)
const abreviarSecundaria = s => String(s || "").replace(/Secundaria/g, "Sec");

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
const ULTIMO_INTENTO = "eval_ultimo_intento";

// Guarda los datos del último intento para poder consultar la nota sin volver a escribirlos.
function guardarUltimoIntento(est) {
  try {
    localStorage.setItem(ULTIMO_INTENTO, JSON.stringify({
      id: est.id, nombres: est.nombres, apellidos: est.apellidos,
      curso: est.curso, cursoId: est.cursoId, paralelo: est.paralelo
    }));
  } catch (e) { }
}
function leerUltimoIntento() {
  try {
    const dato = JSON.parse(localStorage.getItem(ULTIMO_INTENTO) || "null");
    return dato && dato.id ? dato : null;
  } catch (e) {
    return null;
  }
}
const esc = s => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };
function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
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
      batch.set(db.collection("soluciones").doc(cursoId(nombre)), {
        cursoId: cursoId(nombre),
        claves: PREGUNTAS_EJEMPLO.map(p => Number(p.c)),
        total: PREGUNTAS_EJEMPLO.length,
        actualizado: new Date().toISOString()
      });
      CACHE[cursoId(nombre)] = datos;
    });
    await batch.commit();
  }
  return faltan.length;
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
const urlEstudiantes = new URL(window.location.href);
urlEstudiantes.searchParams.set("modo", "estudiante");
$("linkEstudiantes").value = urlEstudiantes.href;

(async () => {
  try { await cargarCursos(); }
  catch (e) { avisarError("No se pudo conectar con Firestore: " + e.message + " (revisa las reglas de la base de datos)."); }
  actualizarCurso();
  const ultimo = leerUltimoIntento();
  if (ultimo && !$("nombres").value && !$("apellidos").value) {
    $("nombres").value = ultimo.nombres || "";
    $("apellidos").value = ultimo.apellidos || "";
    if (ultimo.curso) $("curso").value = ultimo.curso;
    if (ultimo.paralelo) $("paralelo").value = ultimo.paralelo;
    actualizarCurso();
  }
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

async function compartirEnlaceEstudiantes() {
  const campo = $("linkEstudiantes");
  const estado = $("estadoEnlaceEstudiantes");
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("El navegador no permite copiar automáticamente.");
    }
    await navigator.clipboard.writeText(campo.value);
    estado.textContent = "Enlace copiado. Ya puedes compartirlo con tus estudiantes.";
  } catch (e) {
    campo.focus();
    campo.select();
    estado.textContent = "No se pudo copiar automáticamente. El enlace está seleccionado para que lo copies manualmente.";
  }
}

function actualizarVistaPersonal() {
  const autorizado = Boolean(usuarioPersonal && ["admin", "docente"].includes(rolPersonal));
  $("btnCerrarSesion").classList.toggle("d-none", !autorizado);
  $("loginPersonal").classList.toggle("d-none", autorizado);
  $("contenidoPersonal").classList.toggle("d-none", !autorizado);
  $("herramientasAdmin").classList.toggle("d-none", !autorizado || rolPersonal !== "admin");
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
let evaluacion = null, estudiante = null, timer = null, enviando = false, tiempoAgotado = false, finEvaluacion = null;
let indicePregunta = 0;   // pregunta que se muestra en pantalla (estilo Quizizz)
let borrador = [];        // respuestas guardadas del estudiante (índice de opción o -1)

// ---------- Navegación tipo Quizizz ----------
// Borrador de respuestas en localStorage (clave única por estudiante y examen)
const claveBorrador = () => "respuestas_" + (estudiante ? estudiante.id : "none");

function guardarBorrador() {
  try {
    localStorage.setItem(claveBorrador(), JSON.stringify({
      respuestas: respuestasMarcadas(),
      indicePregunta,
      actualizado: new Date().toISOString()
    }));
  } catch (e) { /* almacenamiento no disponible */ }
}

function leerBorrador() {
  try {
    const v = JSON.parse(localStorage.getItem(claveBorrador()) || "null");
    if (Array.isArray(v)) return { respuestas: v, indicePregunta: 0, actualizado: 0 };
    if (!v || !Array.isArray(v.respuestas)) return null;
    const actualizado = Date.parse(v.actualizado || "");
    return {
      respuestas: v.respuestas,
      indicePregunta: Number.isInteger(v.indicePregunta) ? v.indicePregunta : 0,
      actualizado: Number.isFinite(actualizado) ? actualizado : 0
    };
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
    <div class="border rounded p-2 p-sm-3 bg-light">
      <p class="fw-semibold fs-6 mb-2">${i + 1}. ${esc(q.p)} ${borrador[i] >= 0 ? '<span class="badge text-bg-success ms-2">✔ Respondida</span>' : '<span class="badge text-bg-secondary ms-2">Sin responder</span>'}</p>
      ${q.o.map((op, j) => `
        <div class="form-check fs-6 py-2 border-bottom">
          <input class="form-check-input" type="radio" id="p${i}o${j}" name="p${i}" value="${j}" ${j === marcadaVal ? "checked" : ""} ${tiempoAgotado ? "disabled" : ""} onchange="preguntaRespondida(${i}, this.value)">
          <label class="form-check-label d-block" for="p${i}o${j}">${"ABCD"[j]}) ${esc(op)}</label>
        </div>`).join("")}
    </div>`;
  // Botones: Anterior se desactiva en la primera; Siguiente se oculta en la última.
  $("btnAnterior").disabled = tiempoAgotado || i === 0;
  $("btnSiguiente").disabled = tiempoAgotado;
  $("btnSiguiente").classList.toggle("d-none", i === total - 1);
  $("barraProgreso").style.width = Math.round(((i + 1) / total) * 100) + "%";
  $("barraProgreso").parentElement.setAttribute("aria-valuenow", Math.round(((i + 1) / total) * 100));
  pintarNavPreguntas();
}

// Al marcar una opción solo se guarda en el dispositivo.
// La base de datos se escribe una sola vez, al enviar la evaluación.
async function preguntaRespondida(i, valor) {
  if (tiempoAgotado) return;
  borrador[i] = Number(valor);
  guardarBorrador();                     // persiste en localStorage
  pintarNavPreguntas();
  pintarPreguntaActual();                // muestra el badge "Respondida"
}

function preguntaMover(delta) {
  if (tiempoAgotado) return;
  const total = evaluacion.preguntas.length;
  indicePregunta = Math.min(total - 1, Math.max(0, indicePregunta + delta));
  guardarBorrador();
  pintarPreguntaActual();
}

// Barra inferior: número por pregunta, verde = respondida, gris = sin responder
function pintarNavPreguntas() {
  const respondidas = borrador.filter(m => m >= 0).length;
  $("contadorRespondidas").textContent = `✔ ${respondidas} de ${borrador.length} respondidas`;
  $("navPreguntas").innerHTML = borrador.map((m, i) => `
    <button type="button" class="btn btn-sm ${m >= 0 ? "btn-success" : "btn-outline-secondary"} ${i === indicePregunta ? "fw-bold border-2" : ""}" onclick="irAPregunta(${i})" title="${m >= 0 ? "Respondida" : "Sin responder"}" ${tiempoAgotado ? "disabled" : ""}>
      ${i + 1} ${m >= 0 ? "✔" : ""}
    </button>`).join("");
}

function irAPregunta(i) {
  if (tiempoAgotado) return;
  indicePregunta = i;
  guardarBorrador();
  bootstrap.Collapse.getOrCreateInstance($("panelPreguntas"), { toggle: false }).hide();
  pintarPreguntaActual();
}

async function iniciar() {
  const nombres = $("nombres").value.trim(), apellidos = $("apellidos").value.trim();
  if (!nombres || !apellidos) return alert("Escribe tus nombres y apellidos.");

  $("btnIniciar").disabled = true;
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
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
        return alert("No se pudo acceder a este intento. Puede que ya lo hayas finalizado; si no, vuelve desde el mismo dispositivo y navegador, con el mismo curso y los mismos nombres.");
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
    estudiante.preguntasOrden = ordenPreguntas;
    const preguntasAsignadas = ordenPreguntas.map(indice => preguntasBase[indice]);
    // En memoria del estudiante solo entran preguntas SIN clave (campo "c")
    evaluacion = { ...c, titulo: (prueba && prueba.titulo) || c.titulo, preguntas: preguntasAsignadas.map(q => ({ p: q.p, o: [...q.o] })) };
    const totalPreguntas = evaluacion.preguntas.length;
    const borradorLocal = leerBorrador();
    const localValido = reg.exists && borradorLocal &&
      borradorLocal.respuestas.length === totalPreguntas;
    borrador = localValido
      ? [...borradorLocal.respuestas]
      : Array(totalPreguntas).fill(-1);
    const indiceGuardado = localValido ? borradorLocal.indicePregunta : 0;
    if (!reg.exists) borrarBorrador();

    indicePregunta = Number.isInteger(indiceGuardado) && indiceGuardado >= 0 && indiceGuardado < totalPreguntas
      ? indiceGuardado
      : 0;

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

    guardarBorrador();

    const restante = c.minutos * 60 - Math.floor((Date.now() - inicio) / 1000);
    tiempoAgotado = restante <= 0;

    // Muestra la prueba asignada al curso, una pregunta a la vez (estilo Quizizz)
    $("tituloEval").textContent = c.titulo;
    $("datosEst").textContent = `${apellidos} ${nombres} · ${c.nombre} "${paralelo}"`;
    pintarPreguntaActual();
    pintarNavPreguntas();
    $("paso1").classList.add("d-none");
    $("paso2").classList.remove("d-none");
    if (tiempoAgotado) {
      $("reloj").textContent = "⏱ 00:00";
      enviando = true;
      return guardarResultado(respuestasMarcadas());
    }
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
  finEvaluacion = Date.now() + segundos * 1000;
  const fin = finEvaluacion;
  const tic = () => {
    const r = Math.max(0, Math.round((fin - Date.now()) / 1000));
    $("reloj").textContent = "⏱ " + String(Math.floor(r / 60)).padStart(2, "0") + ":" + String(r % 60).padStart(2, "0");
    $("reloj").classList.toggle("border-danger", r <= 60);
    $("reloj").classList.toggle("text-danger", r <= 60);
    $("reloj").classList.toggle("border-primary", r > 60);
    $("reloj").classList.toggle("text-primary", r > 60);
    if (r <= 0) {
      clearInterval(timer);
      tiempoAgotado = true;
      pintarPreguntaActual();
      enviar(true);
    }
  };
  tic();
  timer = setInterval(tic, 500);
}

let modalResumen = null; // instancia de Bootstrap del modal de resumen

async function enviar(auto) {
  if (enviando) return;
  $("estadoEnvio").classList.add("d-none");
  $("estadoEnvio").classList.remove("d-flex");
  if (auto || tiempoAgotado) {
    // Tiempo agotado: se envía sin preguntar
    enviando = true;
    tiempoAgotado = true;
    clearInterval(timer);
    return guardarResultado(respuestasMarcadas());
  }
  // Resumen antes de enviar: preguntar si realmente desea enviar
  const marcadas = respuestasMarcadas();
  const sinResponder = marcadas.filter(m => m < 0).length;
  const respondidas = marcadas.length - sinResponder;
  $("cuerpoResumen").innerHTML = `
    <p class="fs-5 fw-semibold">Has respondido <span class="text-success">${respondidas}</span> de <b>${marcadas.length}</b> preguntas.</p>
    ${sinResponder
      ? `<div class="alert alert-warning py-2">⚠ Tienes <b>${sinResponder}</b> pregunta(s) sin responder (${marcadas.map((m, i) => m < 0 ? i + 1 : null).filter(Boolean).join(", ")}). ¿Estás seguro de enviar la evaluación así? Quedarán como incorrectas.</div>`
      : `<div class="alert alert-success py-2">✔ Respondiste todas las preguntas. ¿Estás seguro de finalizar y enviar?</div>`}
    <p class="mb-0">Una vez enviada <b>no podrás modificar tus respuestas</b>.</p>`;
  const botonConfirmar = $("btnConfirmarEnvio");
  botonConfirmar.textContent = sinResponder ? "Sí, enviar sin responder" : "Sí, enviar evaluación";
  botonConfirmar.classList.toggle("btn-danger", sinResponder > 0);
  botonConfirmar.classList.toggle("btn-success", sinResponder === 0);
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

async function reintentarEnvio() {
  if (enviando) return;
  enviando = true;
  $("estadoEnvio").classList.add("d-none");
  $("estadoEnvio").classList.remove("d-flex");
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
    preguntasOrden: estudiante.preguntasOrden,
    respuestas: marcadas, correctas: [], fecha: new Date().toISOString()
  };
  try {
    await db.collection("resultados").doc(estudiante.id).set(resultado);
  } catch (e) {
    if (e.code === "permission-denied") {
      try {
        await db.collection("estudiantes").doc(estudiante.id).get();
      } catch (verificacion) {
        if (verificacion.code === "permission-denied") {
          borrarBorrador();
          try { localStorage.setItem("eval_rindio_" + estudiante.id, "1"); } catch (error) { }
          pintarResultado(resultado, true);
          $("estadoGuardado").textContent = "La evaluación ya estaba registrada.";
          return;
        }
      }
    }

    enviando = false;
    if (!tiempoAgotado && finEvaluacion !== null) {
      const restante = Math.ceil((finEvaluacion - Date.now()) / 1000);
      if (restante > 0) arrancarReloj(restante);
      else {
        tiempoAgotado = true;
        pintarPreguntaActual();
      }
    }
    $("mensajeEnvio").textContent = "No se pudo guardar la evaluación. Tus respuestas se conservaron; revisa la conexión y vuelve a intentar enviarla. " + e.message;
    $("estadoEnvio").classList.remove("d-none");
    $("estadoEnvio").classList.add("d-flex");
    return;
  }

  borrarBorrador();
  try { localStorage.setItem("eval_rindio_" + estudiante.id, "1"); } catch (e) { }
  guardarUltimoIntento(estudiante);
  pintarResultado(resultado, false);
  $("estadoGuardado").textContent = "✅ Resultado guardado.";
}

function pintarResultado(r, yaRindio) {
  // El estudiante no ve las preguntas ni las claves: solo su nota.
  $("notaFinal").textContent = "…";
  $("mensajeNota").textContent = "Calculando tu nota…";
  $("nAciertos").textContent = `✔ ${r.respuestas.filter(m => m >= 0).length} de ${r.total} respuestas enviadas`;
  $("nDesaciertos").textContent = "";
  $("estadoGuardado").textContent = yaRindio ? "Evaluación ya registrada." : "Guardando…";
  $("estadoNota").classList.add("d-none");
  $("paso1").classList.add("d-none");
  $("paso2").classList.add("d-none");
  $("paso3").classList.remove("d-none");
  programarConsultaNota();
  actualizarNotaResultado();
}

// La nota la calcula el docente; la pantalla se actualiza sola cuando está lista.
let consultaNotaTimer = null, consultaNotaIntentos = 0;

function programarConsultaNota() {
  clearInterval(consultaNotaTimer);
  consultaNotaIntentos = 0;
  consultaNotaTimer = setInterval(() => {
    if ($("paso3").classList.contains("d-none") || consultaNotaIntentos >= 30) {
      clearInterval(consultaNotaTimer);
      return;
    }
    consultaNotaIntentos++;
    actualizarNotaResultado();
  }, 20000);
}

async function actualizarNotaResultado(manual = false) {
  if (!estudiante) return;
  const boton = $("btnActualizarNota");
  const textoBoton = boton ? boton.textContent : "";
  if (manual && boton) { boton.disabled = true; boton.textContent = "🔄 Actualizando…"; }
  try {
    const documento = await db.collection("resultados").doc(estudiante.id).get();
    if (!documento.exists) return;
    const r = { ...documento.data(), id: documento.id };
    if (r.calificadoEn && r.escala === String(NOTA_MAXIMA)) {
      mostrarNota(r);
      return;
    }
    const local = await obtenerNotaLocal(r);
    if (local) mostrarNotaCalculada(local);
    else mostrarNota(r);
  } catch (e) {
    // Si falla la lectura, se conserva la información y se reintenta al pulsar de nuevo.
  } finally {
    if (manual && boton) { boton.disabled = false; boton.textContent = textoBoton || "🔄 Actualizar nota"; }
  }
}

// Muestra la nota oficial ya registrada por el docente.
function mostrarNota(r) {
  if (!r.calificadoEn || r.escala !== String(NOTA_MAXIMA)) {
    $("notaFinal").textContent = "Enviada ✓";
    $("mensajeNota").textContent = "Tu evaluación está enviada y pendiente de calificación. La nota aparecerá aquí cuando esté disponible.";
    return;
  }
  $("notaFinal").textContent = `${textoNota(r.nota)}/${NOTA_MAXIMA}`;
  $("mensajeNota").textContent = "Nota obtenida:";
  $("nAciertos").textContent = `✔ ${r.aciertos} aciertos`;
  $("nDesaciertos").textContent = ` · ✘ ${r.desaciertos} desaciertos`;
  $("estadoGuardado").textContent = "✅ Nota registrada por el docente.";
  clearInterval(consultaNotaTimer);
}

// Muestra la nota calculada en el navegador con las claves desbloqueadas tras el envío.
function mostrarNotaCalculada(local) {
  $("notaFinal").textContent = `${textoNota(local.nota)}/${NOTA_MAXIMA}`;
  $("mensajeNota").textContent = "Nota obtenida:";
  $("nAciertos").textContent = `✔ ${local.aciertos} aciertos`;
  $("nDesaciertos").textContent = ` · ✘ ${local.desaciertos} desaciertos`;
  $("estadoGuardado").textContent = "✅ Nota calculada. El docente registrará la calificación oficial.";
}

// Recupera la sesión anónima guardada antes de crear una nueva.
async function sesionAnonima() {
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  if (auth.currentUser) return auth.currentUser;
  await new Promise(resolve => {
    let listo = false;
    const terminar = () => { if (!listo) { listo = true; resolve(); } };
    const unsub = auth.onAuthStateChanged(user => {
      if (user) { unsub(); terminar(); }
    });
    setTimeout(() => { unsub(); terminar(); }, 1500);
  });
  if (auth.currentUser) return auth.currentUser;
  return (await auth.signInAnonymously()).user;
}

// Consulta de nota desde la pantalla inicial (mismo dispositivo y navegador).
async function consultarNota() {
  const nombres = $("nombres").value.trim(), apellidos = $("apellidos").value.trim();
  const ultimo = leerUltimoIntento();
  let id;

  if (nombres && apellidos) {
    id = `${cursoId($("curso").value)}_${slug(apellidos + " " + nombres)}`;
  } else if (!nombres && !apellidos && ultimo?.id) {
    // Si ya envió desde este dispositivo, se usa el intento guardado sin volver a escribir los datos.
    id = ultimo.id;
  } else if (!nombres && !apellidos) {
    return alert("Escribe tus nombres y apellidos.");
  } else {
    return alert("Escribe los nombres y apellidos completos.");
  }

  const caja = $("estadoNota");
  const boton = $("btnConsultarNota");
  if (boton) { boton.disabled = true; boton.textContent = "Consultando…"; }
  caja.className = "alert alert-info mt-3 mb-0";
  caja.textContent = "Consultando…";
  caja.classList.remove("d-none");
  try {
    await sesionAnonima();
    const documento = await db.collection("resultados").doc(id).get();
    if (!documento.exists) {
      caja.className = "alert alert-warning mt-3 mb-0";
      caja.textContent = "No encontramos una evaluación enviada con estos datos. Revisa el curso, los nombres y apellidos.";
      return;
    }
    const r = { ...documento.data(), id: documento.id };
    if (r.calificadoEn && r.escala === String(NOTA_MAXIMA)) {
      caja.className = "alert alert-success mt-3 mb-0";
      caja.innerHTML = `🎓 <b>Nota: ${textoNota(r.nota)}/${NOTA_MAXIMA}</b><br>
        <span class="text-success fw-semibold">✔ ${r.aciertos} aciertos</span> ·
        <span class="text-danger fw-semibold">✘ ${r.desaciertos} desaciertos</span>`;
      return;
    }
    const local = await obtenerNotaLocal(r);
    if (local) {
      caja.className = "alert alert-success mt-3 mb-0";
      caja.innerHTML = `🎓 <b>Nota: ${textoNota(local.nota)}/${NOTA_MAXIMA}</b><br>
        <span class="text-success fw-semibold">✔ ${local.aciertos} aciertos</span> ·
        <span class="text-danger fw-semibold">✘ ${local.desaciertos} desaciertos</span><br>
        <span class="small text-secondary">El docente registrará la calificación oficial.</span>`;
      return;
    }
    caja.className = "alert alert-info mt-3 mb-0";
    caja.textContent = "Tu evaluación ya fue enviada y está pendiente de calificación. Vuelve a consultar más tarde.";
  } catch (e) {
    caja.className = "alert alert-warning mt-3 mb-0";
    caja.textContent = e.code === "permission-denied"
      ? "Por seguridad, la nota solo se puede consultar desde el mismo dispositivo y navegador donde se envió la evaluación."
      : "No se pudo consultar la nota: " + e.message;
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = "Consultar mi nota"; }
  }
}

function reiniciar() {
  clearInterval(timer);
  clearInterval(consultaNotaTimer);
  enviando = false;
  tiempoAgotado = false;
  finEvaluacion = null;
  $("estadoEnvio").classList.add("d-none");
  $("estadoEnvio").classList.remove("d-flex");
  $("estadoNota").classList.add("d-none");
  $("nombres").value = ""; $("apellidos").value = "";
  $("paso3").classList.add("d-none");
  $("paso1").classList.remove("d-none");
}

/* =========================================================
   ADMINISTRADOR
   ========================================================= */
async function leerResultados() {
  const snapshot = await db.collection("resultados").get();
  return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}
const porCurso = id => RESULTADOS.filter(r => r.cursoId === id);
const collatorNomina = new Intl.Collator("es", { sensitivity: "base" });
function compararNomina(a, b) {
  return collatorNomina.compare(a.apellidos || "", b.apellidos || "") ||
    collatorNomina.compare(a.nombres || "", b.nombres || "") ||
    collatorNomina.compare(a.paralelo || "", b.paralelo || "");
}

async function cargarAdmin() {
  if (!usuarioPersonal || !["admin", "docente"].includes(rolPersonal)) return;
  $("tablaCursos").innerHTML = "<tr><td colspan='6'>Cargando…</td></tr>";
  let etapa = "cargar cursos";
  try {
    if (rolPersonal === "admin") {
      etapa = "verificar y crear cursos";
      await crearColecciones();
    } else {
      await cargarCursos();
    }
    etapa = "leer conteos de exámenes";
    await cargarCantidadPreguntas();
    etapa = "preparar claves de calificación";
    const clavesCreadas = await asegurarSoluciones();
    $("estadoClaves").textContent = clavesCreadas
      ? `🔑 Claves de calificación preparadas para ${clavesCreadas} curso(s).`
      : "";
    etapa = "recalificar resultados pendientes";
    await calificarPendientes();
    etapa = "leer resultados";
    RESULTADOS = await leerResultados();
    pintarCursos();
    reporte();
    $("errorGlobal").classList.add("d-none");
    $("errorGlobal").textContent = "";
  } catch (e) {
    avisarError(`Firestore rechazó el paso "${etapa}" en ${firebaseConfig.projectId}: ${e.message} Revisa que las reglas estén desplegadas en este proyecto y que tu documento usuarios/{UID} tenga rol "admin" o "docente".`);
  }
}

async function cargarCantidadPreguntas() {
  await Promise.all(CURSOS.map(async nombre => {
    const id = cursoId(nombre), curso = CACHE[id];
    if (!curso || Number.isInteger(curso.cantidadPreguntas)) return;

    const documento = await db.collection("examenes").doc(id).get();
    const examen = documento.exists ? documento.data() : null;
    curso.cantidadPreguntas = examen
      ? Number.isInteger(examen.cantidad)
        ? examen.cantidad
        : Array.isArray(examen.preguntas) ? examen.preguntas.length : 0
      : 0;
  }));
}

// Crea las claves de calificación que falten (solo administrador).
async function asegurarSoluciones() {
  if (rolPersonal !== "admin") return 0;
  let creadas = 0;
  for (const nombre of CURSOS) {
    const id = cursoId(nombre);
    try {
      const sol = await db.collection("soluciones").doc(id).get();
      if (sol.exists) continue;
      const examen = await db.collection("examenes").doc(id).get();
      if (!examen.exists) continue;
      const preguntas = examen.data().preguntas || [];
      if (!preguntas.length) continue;
      await db.collection("soluciones").doc(id).set({
        cursoId: id,
        claves: preguntas.map(p => Number(p.c)),
        total: preguntas.length,
        actualizado: new Date().toISOString()
      });
      creadas++;
    } catch (e) {
      // Se reintenta la próxima vez que se abra el panel.
    }
  }
  return creadas;
}

function preguntasEnOrdenDeResultado(preguntas, resultado) {
  if (!Array.isArray(preguntas) || !preguntas.length) return null;
  const orden = resultado.preguntasOrden;
  if (Array.isArray(orden) &&
      orden.length === preguntas.length &&
      new Set(orden).size === preguntas.length &&
      orden.every(indice => Number.isInteger(indice) && indice >= 0 && indice < preguntas.length)) {
    return orden.map(indice => preguntas[indice]);
  }

  if (!Array.isArray(resultado.preguntas) || resultado.preguntas.length !== preguntas.length) return null;
  const disponibles = new Set(preguntas.map((_, indice) => indice));
  const ordenInferido = [];
  for (const guardada of resultado.preguntas) {
    const indice = [...disponibles].find(i =>
      preguntas[i].p === guardada.p &&
      JSON.stringify(preguntas[i].o) === JSON.stringify(guardada.o)
    );
    if (indice === undefined) return null;
    disponibles.delete(indice);
    ordenInferido.push(indice);
  }
  return ordenInferido.map(indice => preguntas[indice]);
}

// El administrador calcula las notas usando las claves privadas de "examenes".
// La nota máxima es 45 y se reparte proporcionalmente entre las preguntas:
// nota = aciertos * 45 / cantidad de preguntas (p. ej. 38 de 50 -> 34.2/45).
async function calificarPendientes() {
  const pendientes = (await leerResultados()).filter(resultado =>
    !resultado.calificadoEn || resultado.escala !== String(NOTA_MAXIMA)
  );
  let batch = db.batch(), cambios = 0, enLote = 0;
  for (const resultado of pendientes) {
    const examen = await db.collection("examenes").doc(resultado.cursoId).get();
    if (!examen.exists) continue;
    let preguntas = examen.data().preguntas || [];
    if (!Array.isArray(resultado.preguntasOrden) && resultado.id) {
      const estudiante = await db.collection("estudiantes").doc(resultado.id).get();
      if (estudiante.exists && Array.isArray(estudiante.data().preguntasOrden)) {
        resultado.preguntasOrden = estudiante.data().preguntasOrden;
      }
    }
    preguntas = preguntasEnOrdenDeResultado(preguntas, resultado);
    if (!preguntas) continue;
    const respuestas = resultado.respuestas || [];
    const correctas = preguntas.map((pregunta, indice) => respuestas[indice] === pregunta.c);
    const aciertos = correctas.filter(Boolean).length;
    const nota = preguntas.length ? redondearNota((aciertos / preguntas.length) * NOTA_MAXIMA) : 0;
    batch.update(db.collection("resultados").doc(resultado.id), {
      correctas,
      aciertos,
      desaciertos: preguntas.length - aciertos,
      total: preguntas.length,
      nota,
      notaMaxima: NOTA_MAXIMA,
      escala: String(NOTA_MAXIMA),
      calificadoEn: new Date().toISOString()
    });
    cambios++;
    enLote++;
    if (enLote === 450) {
      await batch.commit();
      batch = db.batch();
      enLote = 0;
    }
  }
  if (enLote) await batch.commit();
  return cambios;
}

function seleccionarParaleloCursos(paralelo) {
  if (!PARALELOS.includes(paralelo)) return;
  paraleloCursosSeleccionado = paralelo;
  $("encabezadoRindieron").textContent = `Rindieron ${paralelo}`;
  PARALELOS.forEach(p => {
    const boton = $(`btnParalelo${p}`);
    const activo = p === paralelo;
    boton.classList.toggle("active", activo);
    boton.setAttribute("aria-pressed", String(activo));
  });
  pintarCursos();
}

function pintarCursos() {
  const esAdmin = rolPersonal === "admin";
  const html = CURSOS.map(nombre => {
    const id = cursoId(nombre), c = CACHE[id];
    if (!c) return "";
    const cant = porCurso(id).filter(r => r.paralelo === paraleloCursosSeleccionado).length;
    const acciones = [];
    if (esAdmin) {
      acciones.push(`<button class="btn btn-sm btn-primary" title="Guardar área y tiempo" onclick="guardarFila('${id}')">Guardar</button>`);
      acciones.push(`<button class="btn btn-sm btn-danger" title="Depurar resultados del paralelo ${paraleloCursosSeleccionado}" onclick="eliminarRegistrosCurso('${id}', '${paraleloCursosSeleccionado}')">Depurar</button>`);
    }
    if (c.activo) {
      if (esAdmin) acciones.push(`<button class="btn btn-sm btn-danger" title="Concluir evaluación" onclick="alternarEstado('${id}')">Concluir</button>`);
    } else {
      if (esAdmin) acciones.push(`<button class="btn btn-sm btn-success" title="Reabrir evaluación" onclick="alternarEstado('${id}')">Reabrir</button>`);
    }
    if (esAdmin) {
      acciones.push(`<button class="btn btn-sm btn-secondary" title="Generar lista de notas" onclick="generarPromedios('${id}')">Notas</button>`);
    }
    acciones.push(`<button class="btn btn-sm btn-primary" title="Descargar reporte porcentual por paralelo" onclick="descargarInformeCurso('${id}')">⬇ Reporte %</button>`);
    const estado = c.activo ? "🟢 Activa" : "🔒 Concluida";
    // Una sola fila por curso, alineada con los encabezados (scroll horizontal en móvil)
    return `
      <tr>
        <td class="fw-semibold text-nowrap">${esc(abreviarSecundaria(c.nombre || nombre))}</td>
        <td><select class="form-select form-select-sm w-auto" id="ar_${id}" ${esAdmin ? "" : "disabled"} title="${esc(c.area)}">${AREAS.map(a => `<option ${a === c.area ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></td>
        <td>
          <div class="input-group input-group-sm flex-nowrap w-auto">
            <input class="form-control text-center" type="number" min="1" inputmode="numeric" id="mi_${id}" value="${Number(c.minutos) || 30}" ${esAdmin ? "" : "disabled"}>
            <span class="input-group-text">min</span>
          </div>
        </td>
        <td class="text-nowrap">${estado}</td>
        <td class="text-center">${cant}</td>
        <td><div class="d-flex flex-nowrap gap-1">${acciones.join("")}</div></td>
      </tr>`;
  }).join("");
  $("tablaCursos").innerHTML = html || `<tr><td colspan="6" class="text-center text-secondary">No hay cursos disponibles.</td></tr>`;
}

// Guarda el área y el temporizador del curso.
async function guardarFila(id) {
  if (!exigirAdministrador()) return;
  const c = CACHE[id];
  if (!c) return alert("No se encontró la configuración del curso.");
  const area = $("ar_" + id).value, minutos = Number($("mi_" + id).value);
  if (!minutos || minutos < 1) return alert("Ingresa los minutos (mínimo 1).");
  try {
    await db.collection("cursos").doc(id).update({ area, minutos });
    c.area = area;
    c.minutos = minutos;
    alert(`Guardado: ${c.nombre} · ${area} · ${minutos} min`);
  } catch (e) { alert("Error: " + e.message); }
}

// Concluye o reabre la evaluación del curso.
async function alternarEstado(id) {
  if (!exigirAdministrador()) return;
  const c = CACHE[id];
  if (!c) return alert("No se encontró la configuración del curso.");
  const msg = c.activo
    ? `¿Concluir la evaluación de ${c.nombre}? Los estudiantes ya no podrán rendirla.`
    : `¿Reabrir la evaluación de ${c.nombre}?`;
  if (!confirm(msg)) return;
  try {
    await db.collection("cursos").doc(id).update({
      activo: !c.activo,
      concluidoEn: c.activo ? new Date().toISOString() : null
    });
    cargarAdmin();
  } catch (e) { alert("Error: " + e.message); }
}

async function eliminarDocumentosCurso(coleccion, id, paralelo, eliminarRelacionado) {
  let eliminados = 0;
  while (true) {
    const snapshot = await db.collection(coleccion)
      .where("cursoId", "==", id)
      .where("paralelo", "==", paralelo)
      .limit(eliminarRelacionado ? 250 : 400)
      .get();
    if (snapshot.empty) return eliminados;

    const batch = db.batch();
    snapshot.docs.forEach(documento => {
      batch.delete(documento.ref);
      if (eliminarRelacionado) eliminarRelacionado(batch, documento);
    });
    await batch.commit();
    eliminados += snapshot.size;
  }
}

async function eliminarRegistrosCurso(id, paralelo) {
  if (!exigirAdministrador()) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id) || !PARALELOS.includes(paralelo)) return alert("El curso o paralelo seleccionado no es válido.");
  const curso = CACHE[id];
  if (!curso) return alert("No se encontró la configuración del curso.");
  if (!confirm(`Se eliminarán permanentemente los registros de estudiantes, sus borradores de respuesta y resultados de ${curso.nombre}, paralelo ${paralelo}. Las preguntas, la configuración y los datos de otros paralelos se conservarán. ¿Continuar?`)) return;

  let estudiantesEliminados = 0, resultadosEliminados = 0;
  try {
    estudiantesEliminados = await eliminarDocumentosCurso("estudiantes", id, paralelo, (batch, documento) => {
      batch.delete(db.collection("respuestas").doc("borrador_" + documento.id));
    });
    resultadosEliminados = await eliminarDocumentosCurso("resultados", id, paralelo);
    RESULTADOS = await leerResultados();
    pintarCursos();
    reporte();
    alert(`Eliminados ${estudiantesEliminados} registros de estudiantes, sus borradores de respuesta y ${resultadosEliminados} resultados de ${curso.nombre}, paralelo ${paralelo}.`);
  } catch (e) {
    alert(`No se pudo completar el borrado. Se eliminaron ${estudiantesEliminados} registros de estudiantes con sus borradores y ${resultadosEliminados} resultados antes del error: ${e.message}`);
    await cargarAdmin();
  }
}

/* ---------- Editor de preguntas ---------- */
let edit = null;

async function editarPreguntas(id) {
  if (!exigirAdministrador()) return;
  const c = CACHE[id];
  if (!c) return alert("No se encontró la configuración del curso.");
  try {
    const documento = await db.collection("examenes").doc(id).get();
    const preguntas = documento.exists ? documento.data().preguntas : [];
    edit = { id, titulo: c.titulo, preguntas: JSON.parse(JSON.stringify(preguntas || [])) };
  } catch (e) {
    return alert("No se pudo cargar el examen: " + e.message);
  }
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
  if (!edit || !CACHE[edit.id]) return alert("No se encontró la configuración del curso.");
  edit.titulo = $("edTitulo").value.trim() || "Evaluación";
  if (!edit.preguntas.length) return alert("Agrega al menos una pregunta.");
  try {
    await guardarExamenEnBD(edit.id, edit.titulo, edit.preguntas);
    alert("Preguntas guardadas.");
    pintarCursos();
  } catch (e) { alert("Error: " + e.message); }
}

/* ---------- Reporte en pantalla ---------- */
let graficos = {};

// Calcula totales, promedio y aciertos/desaciertos por pregunta.
// El promedio está en la escala de la nota máxima (45).
function stats(lista) {
  const n = lista.length;
  const aciertos = lista.reduce((s, r) => s + (Number(r.aciertos) || 0), 0);
  const desaciertos = lista.reduce((s, r) => s + (Number(r.desaciertos) || 0), 0);
  const sumaNotas = lista.reduce((s, r) => s + (Number(r.nota) || 0), 0);
  const promedio = n ? redondearNota(sumaNotas / n) : 0;
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

const porcentajesTorta = {
  id: "porcentajesTorta",
  afterDatasetsDraw(chart) {
    if (!["pie", "doughnut"].includes(chart.config.type)) return;
    const valores = chart.data.datasets[0].data.map(Number);
    const total = valores.reduce((suma, valor) => suma + (Number.isFinite(valor) ? valor : 0), 0);
    if (!total) return;

    const contexto = chart.ctx;
    chart.getDatasetMeta(0).data.forEach((arco, indice) => {
      const valor = valores[indice];
      if (!valor || !Number.isFinite(valor)) return;
      const porcentaje = valor * 100 / total;
      if (porcentaje < 4) return;
      const angulo = (arco.startAngle + arco.endAngle) / 2;
      const radio = (arco.innerRadius + arco.outerRadius) / 2;
      const x = arco.x + Math.cos(angulo) * radio;
      const y = arco.y + Math.sin(angulo) * radio;
      contexto.save();
      contexto.fillStyle = "#fff";
      contexto.font = "bold 14px sans-serif";
      contexto.textAlign = "center";
      contexto.textBaseline = "middle";
      contexto.fillText(`${porcentaje.toFixed(1)}%`, x, y);
      contexto.restore();
    });
  }
};

function textoPorcentajes(s) {
  const total = s.aciertos + s.desaciertos;
  const porcentaje = cantidad => total ? (cantidad * 100 / total).toFixed(1) : "0.0";
  return `Aciertos: ${porcentaje(s.aciertos)}%   Desaciertos: ${porcentaje(s.desaciertos)}%`;
}

function paraleloExportacionSeleccionado() {
  return paraleloCursosSeleccionado;
}

const filtrarParalelo = (lista, paralelo) => lista.filter(r => r.paralelo === paralelo);

function agregarTortasPorParalelo(doc, lista, y, paralelo) {
  const anchoColumna = 60;
  const tamanoGrafico = 42;
  const x = 75;
  const s = stats(filtrarParalelo(lista, paralelo));
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text(`Paralelo ${paralelo}`, x + anchoColumna / 2, y, { align: "center" });
  if (s.aciertos + s.desaciertos > 0) {
    doc.addImage(imagenGrafico("pie", datosTorta(s), 300, 300), "PNG", x + 9, y + 3, tamanoGrafico, tamanoGrafico);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(textoPorcentajes(s), anchoColumna - 2), x + 1, y + 51);
  } else {
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Sin resultados", x + anchoColumna / 2, y + 26, { align: "center" });
  }
  return y + 65;
}

function dibujar(id, tipo, data) {
  if (graficos[id]) graficos[id].destroy();
  graficos[id] = new Chart($(id), { type: tipo, data, options: { responsive: true }, plugins: [porcentajesTorta] });
}

function reporte() {
  const fc = $("fCurso").value, fp = $("fParalelo").value;
  const lista = RESULTADOS.filter(r => (!fc || r.cursoId === fc) && (!fp || r.paralelo === fp));
  const s = stats(lista);
  $("resumen").textContent = `${s.n} evaluaciones · Promedio: ${textoNota(s.promedio)}/${NOTA_MAXIMA}`;

  PARALELOS.forEach(paralelo => {
    const estadisticasParalelo = stats(lista.filter(r => r.paralelo === paralelo));
    dibujar(`gParalelo${paralelo}`, "pie", datosTorta(estadisticasParalelo));
  });

  $("tabla").innerHTML = [...lista].sort((a, b) => {
    const na = a.calificadoEn ? Number(a.nota) || 0 : -1;
    const nb = b.calificadoEn ? Number(b.nota) || 0 : -1;
    if (nb !== na) return nb - na;
    return compararNomina(a, b);
  }).map(r => `
    <tr><td>${esc(r.apellidos + " " + r.nombres)}</td><td>${esc(abreviarSecundaria(r.curso))}</td><td>${esc(r.area)}</td><td>${esc(r.paralelo)}</td>
    <td class="text-success fw-semibold">${r.aciertos}</td><td class="text-danger fw-semibold">${r.desaciertos}</td><td>${r.calificadoEn ? `${textoNota(r.nota)}/${NOTA_MAXIMA}` : "Pendiente"}</td>
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
  let preguntasBase = null;
  if (r.cursoId && r.paralelo) {
    try {
      const documento = await db.collection("examenes").doc(r.cursoId).get();
      if (documento.exists) preguntasBase = documento.data().preguntas;
    } catch (e) {
      return alert("No tienes permiso para leer este examen o no se pudo cargar: " + e.message);
    }
  }
  const preguntas = preguntasEnOrdenDeResultado(preguntasBase, r) || preguntasGuardadas;
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
  escribir(`Aciertos: ${r.aciertos} · Desaciertos: ${r.desaciertos} · Nota: ${textoNota(r.nota)}/${NOTA_MAXIMA}`, 15, 11, true);
  escribir(`Fecha: ${new Date(r.fecha).toLocaleString("es-BO")}`, 15, 9, false);
  if (!preguntas.some(pregunta => Number.isInteger(pregunta.c))) {
    escribir("Aviso: el examen disponible no conserva las claves de respuesta.", 15, 9, false);
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

async function descargarInformeCurso(id) {
  if (!exigirAccesoDescargas()) return;
  const paralelo = paraleloExportacionSeleccionado();
  if (!paralelo) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id)) return alert("El curso seleccionado no es válido.");
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");

  try {
    RESULTADOS = await leerResultados();
    const curso = CACHE[id];
    if (!curso) return alert("No se encontró la configuración del curso y paralelo. Actualiza el reporte e inténtalo de nuevo.");

    const lista = filtrarParalelo(porCurso(id), paralelo);
    const s = stats(lista);
    const total = s.aciertos + s.desaciertos;
    const porcentaje = cantidad => total ? (cantidad * 100 / total).toFixed(1) + "%" : "0.0%";
    const doc = new window.jspdf.jsPDF();

    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(`Resumen de ${abreviarSecundaria(curso.nombre)} - Paralelo ${paralelo}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, 18, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Área: ${curso.area} · Generado: ${new Date().toLocaleString("es-BO")}`, 15, 26);

    let y = tabla(doc, 38, ["Indicador", "Resultado"], [105, 75], [
      ["Evaluaciones registradas", s.n],
      ["Respuestas contabilizadas", total],
      ["Aciertos", `${s.aciertos} (${porcentaje(s.aciertos)})`],
      ["Desaciertos", `${s.desaciertos} (${porcentaje(s.desaciertos)})`],
      ["Promedio de notas", `${textoNota(s.promedio)}/${NOTA_MAXIMA}`]
    ]);

    if (s.n) {
      y += 8;
      if (y + 75 > 275) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(`PORCENTAJE DE RESPUESTAS - PARALELO ${paralelo}`, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;
      y = agregarTortasPorParalelo(doc, lista, y, paralelo);
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(`RESULTADOS - PARALELO ${paralelo}`, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;
      const filasParalelos = [paralelo].map(paraleloFila => {
        const paraleloStats = stats(lista.filter(r => r.paralelo === paraleloFila));
        const totalParalelo = paraleloStats.aciertos + paraleloStats.desaciertos;
        const porcentajeParalelo = cantidad => totalParalelo
          ? (cantidad * 100 / totalParalelo).toFixed(1) + "%"
          : "0.0%";
        return [
          paraleloFila,
          paraleloStats.n,
          `${paraleloStats.aciertos} (${porcentajeParalelo(paraleloStats.aciertos)})`,
          `${paraleloStats.desaciertos} (${porcentajeParalelo(paraleloStats.desaciertos)})`,
          `${textoNota(paraleloStats.promedio)}/${NOTA_MAXIMA}`
        ];
      });
      y = tabla(doc, y, ["Paralelo", "Eval.", "Aciertos", "Desaciertos", "Promedio"], [28, 24, 42, 48, 38], filasParalelos) + 8;

      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("DETALLE POR ESTUDIANTE", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;
      const estudiantes = [...lista]
        .sort(compararNomina)
        .map(r => [r.apellidos + " " + r.nombres, r.paralelo, r.aciertos, r.desaciertos, `${textoNota(r.nota)}/${NOTA_MAXIMA}`]);
      tabla(doc, y, ["Apellidos y nombres", "Par.", "Aciertos", "Desaciertos", "Nota /45"], [65, 20, 30, 30, 35], estudiantes);
    } else {
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(`Aún no hay evaluaciones registradas para el paralelo ${paralelo}.`, 15, y + 8);
    }

    doc.save(`informe_porcentajes_${id}_paralelo_${paralelo}.pdf`);
  } catch (e) {
    alert("No se pudo generar el informe del curso: " + e.message);
  }
}

// Genera la lista de estudiantes con sus notas (redondeadas, número entero ≥ 5).
async function generarPromedios(id) {
  if (!exigirAccesoDescargas()) return;
  const paralelo = paraleloExportacionSeleccionado();
  if (!paralelo) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id)) return alert("El curso seleccionado no es válido.");
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");

  try {
    RESULTADOS = await leerResultados();
    const curso = CACHE[id];
    if (!curso) return alert("No se encontró la configuración del curso y paralelo. Actualiza el reporte e inténtalo de nuevo.");

    const lista = filtrarParalelo(porCurso(id), paralelo)
      .map(r => ({ ...r, nota: Math.round(Number(r.nota) || 0) }))
      .filter(r => Number.isInteger(r.nota) && r.nota >= 5);

    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(`Notas - ${abreviarSecundaria(curso.nombre)} - Paralelo ${paralelo}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, 18, { align: "center" });
    doc.setFontSize(12); doc.setFont("helvetica", "normal");
    doc.text(`Área: ${curso.area} · Generado: ${new Date().toLocaleString("es-BO")}`, 15, 30);

    if (!lista.length) {
      doc.setFontSize(12); doc.setFont("helvetica", "normal");
      doc.text("Sin notas registradas con nota entera igual o mayor a 5.", 15, 48);
    } else {
      const filasNotas = [...lista].sort(compararNomina).map((r, indice) => [String(indice + 1), `${r.apellidos} ${r.nombres}`, `${textoNota(r.nota)}`]);
      tabla(doc, 48, ["#", "Apellidos y nombres", "Nota"], [10, 110, 40], filasNotas);
    }

    doc.save(`notas_${id}_paralelo_${paralelo}.pdf`);
  } catch (e) {
    alert("No se pudo generar las notas: " + e.message);
  }
}

/* ---------- Descargas: PDF con gráficos ---------- */

// Dibuja un gráfico fuera de pantalla y devuelve la imagen para el PDF
function imagenGrafico(tipo, data, ancho, alto) {
  const cv = document.createElement("canvas");
  cv.width = ancho; cv.height = alto;
  const fondo = { id: "fondo", beforeDraw(ch) { ch.ctx.save(); ch.ctx.fillStyle = "#fff"; ch.ctx.fillRect(0, 0, ch.width, ch.height); ch.ctx.restore(); } };
  const ch = new Chart(cv, {
    type: tipo, data,
    options: { animation: false, responsive: false, devicePixelRatio: 1, plugins: { legend: { display: false } } },
    plugins: [fondo, porcentajesTorta]
  });
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

async function generarPDF(ids, archivo, titulo, paralelo) {
  if (!exigirAccesoDescargas()) return;
  if (!window.jspdf) return alert("No se cargó la librería PDF (revisa tu conexión).");
  RESULTADOS = await leerResultados();
  const doc = new window.jspdf.jsPDF();
  let y = 20;
  const porParalelo = id => filtrarParalelo(porCurso(id), paralelo);

  // Portada: resumen general por curso
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(`${titulo} - Paralelo ${paralelo}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Generado: " + new Date().toLocaleString("es-BO"), 15, y); y += 10;

  const filas = ids.map(id => {
    const c = CACHE[id], s = stats(porParalelo(id));
    return [abreviarSecundaria(c.nombre), c.area, s.n, `${textoNota(s.promedio)}/${NOTA_MAXIMA}`, s.aciertos, s.desaciertos];
  });
  y = tabla(doc, y, ["Curso", "Área", "Estud.", "Promedio", "Aciertos", "Desaciertos"], [40, 35, 22, 27, 27, 28], filas);

  const listaGeneral = ids.flatMap(porParalelo);
  const resumenGeneral = stats(listaGeneral);
  if (resumenGeneral.n) {
    if (y + 75 > 275) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`PORCENTAJE DE RESPUESTAS - PARALELO ${paralelo}`, 15, y);
    y = agregarTortasPorParalelo(doc, listaGeneral, y + 5, paralelo);
  }

  // Gráfico comparativo de promedios por curso
  const conDatos = ids.filter(id => porParalelo(id).length);
  if (conDatos.length > 1) {
    if (y + 80 > 275) { doc.addPage(); y = 20; }
    const img = imagenGrafico("bar", {
      labels: conDatos.map(id => CACHE[id].nombre),
      datasets: [{ label: `Promedio (sobre ${NOTA_MAXIMA})`, data: conDatos.map(id => stats(porParalelo(id)).promedio), backgroundColor: "#1d4ed8" }]
    }, 850, 350);
    doc.addImage(img, "PNG", 15, y + 4, 170, 70);
    y += 80;
  }

  // Una página por curso: gráficos + lista de estudiantes
  ids.forEach(id => {
    const c = CACHE[id], lista = porParalelo(id), s = stats(lista);
    doc.addPage(); y = 20;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`${c.nombre} - ${c.area} - PARALELO ${paralelo}`.toLocaleUpperCase("es-BO"), doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Estudiantes: ${s.n}   Promedio: ${textoNota(s.promedio)}/${NOTA_MAXIMA}   Aciertos: ${s.aciertos}   Desaciertos: ${s.desaciertos}`, 15, y); y += 8;
    if (!s.n) { doc.text("Sin resultados.", 15, y); return; }

    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`PORCENTAJE DE RESPUESTAS - PARALELO ${paralelo}`, 15, y); y += 5;
    y = agregarTortasPorParalelo(doc, lista, y, paralelo);
    if (y + 70 > 275) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("ACIERTOS Y DESACIERTOS POR PREGUNTA", 15, y); y += 4;
    doc.addImage(imagenGrafico("bar", datosPreguntas(s), 700, 350), "PNG", 15, y, 180, 55);
    y += 60;

    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("RESULTADOS POR ESTUDIANTE", doc.internal.pageSize.getWidth() / 2, y, { align: "center" }); y += 7;
    const orden = [...lista].sort(compararNomina);
    tabla(doc, y, ["Apellidos y nombres", "Par.", "Aciertos", "Desaciertos", "Nota /45"], [65, 20, 30, 30, 35],
      orden.map(r => [r.apellidos + " " + r.nombres, r.paralelo, r.aciertos, r.desaciertos, `${textoNota(r.nota)}/${NOTA_MAXIMA}`]));
  });

  doc.save(archivo);
}

const descargarPDF = id => {
  const paralelo = paraleloExportacionSeleccionado();
  if (!paralelo) return;
  if (!CURSOS.some(nombre => cursoId(nombre) === id)) return alert("El curso seleccionado no es válido.");
  const curso = CACHE[id] || { nombre: id };
  return generarPDF([id], `resumen_${id}_paralelo_${paralelo}.pdf`, `Resumen de ${abreviarSecundaria(curso.nombre)}`, paralelo);
};
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

// Las claves se guardan en examenes y las preguntas sin claves se publican en pruebas.
async function guardarExamenEnBD(id, titulo, preguntas) {
  if (!exigirAdministrador()) throw new Error("Esta acción está reservada al administrador.");
  const c = CACHE[id];
  if (!c) throw new Error("No se encontró la configuración del curso.");
  const examen = examenDe(id, titulo, preguntas);
  await db.collection("examenes").doc(id).set(examen);
  await db.collection("pruebas").doc(id).set({
    cursoId: id,
    titulo,
    cantidad: examen.cantidad,
    preguntas: publicarSinClave(examen.preguntas),
    actualizado: examen.actualizado
  });
  await db.collection("soluciones").doc(id).set({
    cursoId: id,
    claves: examen.preguntas.map(p => Number(p.c)),
    total: examen.cantidad,
    actualizado: examen.actualizado
  });
  await db.collection("cursos").doc(id).update({
    titulo,
    cantidadPreguntas: examen.cantidad
  });
  c.titulo = titulo;
  c.cantidadPreguntas = examen.cantidad;
  delete c.preguntas;
  CACHE_PRUEBAS[id] = {
    cursoId: id,
    titulo,
    cantidad: examen.cantidad,
    preguntas: publicarSinClave(preguntas)
  };
}

// Guarda en la base de datos el examen cargado (archivo .json o texto pegado)
async function guardarImportacion() {
  if (!exigirAdministrador()) return;
  const id = $("impCurso").value;
  const c = CACHE[id];
  if (!c) return alert("No se encontró la configuración del curso.");
  if (!importadas.length) return;
  if (!confirm(`Se REEMPLAZARÁ por completo el examen de ${c.nombre} (${c.cantidadPreguntas || 0} preguntas actuales) por ${importadas.length} preguntas nuevas. ¿Continuar?`)) return;
  const titulo = $("impTitulo").value.trim() || "Evaluación";
  try {
    await guardarExamenEnBD(id, titulo, importadas);
    alert(`Listo: examen guardado para ${c.nombre}.`);
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