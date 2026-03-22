// ════════════════════════════════════════════════════════════════
// AGENDA.JS — Gestión de fechas clave y eventos del calendario
// Cargado después de: colors.js
// Dependencias globales: State, UI, Logger, EventBus, persistirDatosLocales
// ════════════════════════════════════════════════════════════════

const TIPOS_EVENTO = {
    examen:   { label: 'Final',   iconClass: 'fa-sharp fa-solid fa-chess-king',   weight: 'dominant' },
    prueba:   { label: 'Prueba',  iconClass: 'fa-sharp fa-solid fa-chess-queen',  weight: 'strong'   },
    entrega:  { label: 'Entrega', iconClass: 'fa-sharp fa-solid fa-chess-knight', weight: 'subtle'   },
    vacacion: { label: 'Festivo', iconClass: 'fa-solid fa-umbrella-beach',        weight: 'subtle'   },
    otro:     { label: 'Otro',    iconClass: 'fa-sharp fa-solid fa-chess-pawn',   weight: 'subtle'   },
};

/** Devuelve el color del evento: color de asignatura o gris genérico. */
function getColorEvento(ev) {
    return ev.asig ? getColorAsignatura(ev.asig) : '#607d8b';
}

function guardarFechasClave() {
    const saneadas = window.normalizarFechasClave(State.get('fechasClave'));
    State.set('fechasClave', saneadas);
    persistirDatosLocales('fechasClave', saneadas);
}

/** Convierte "YYYY-MM-DD" (input HTML) → "DD/MM/YYYY" (app). */
function inputDateToApp(s) {
    if (!s) return "";
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

/** Convierte "DD/MM/YYYY" (app) → "YYYY-MM-DD" (input HTML). */
function appDateToInput(s) {
    if (!s) return "";
    const p = s.split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s;
}

function abrirFechasModal() {
    const biblio    = State.get('biblioteca');
    const asigActual = State.get('nombreAsignaturaActual');
    const fechas    = State.get('fechasClave');

    UI.abrirFechasModal(biblio, asigActual);

    const inputFecha = document.getElementById('fk-fecha');
    if (inputFecha) {
        inputFecha.value = typeof window.getFechaHoy === 'function'
            ? window.getFechaHoy()
            : new Date().toISOString().split('T')[0];
    }
    const inputNombre = document.getElementById('fk-nombre');
    if (inputNombre) inputNombre.value = '';

    UI.renderFechasList(fechas);
}

function cerrarFechasModal() {
    if (typeof UI !== 'undefined' && UI.cerrarFechasModal) UI.cerrarFechasModal();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
}

function guardarFechaClave() {
    const nombre     = document.getElementById('fk-nombre').value.trim();
    const fechaInput = document.getElementById('fk-fecha').value;
    const fecha      = inputDateToApp(fechaInput);
    const tipo       = document.getElementById('fk-tipo').value;
    const asig       = document.getElementById('fk-asig').value;

    if (!nombre) { document.getElementById('fk-nombre').focus(); return; }
    if (!fecha || !window.parseDateSafe(fechaInput)) {
        alert('La fecha no es válida. Usa el selector de fecha.');
        document.getElementById('fk-fecha').focus();
        return;
    }

    const fechas = State.get('fechasClave') || [];
    fechas.push({ id: Date.now(), nombre: nombre.slice(0, 120), fecha, tipo, asig });
    fechas.sort((a, b) => window.fechaValor(a.fecha) - window.fechaValor(b.fecha));
    State.set('fechasClave', fechas);
    guardarFechasClave();
    UI.renderFechasList(fechas);

    document.getElementById('fk-nombre').value = '';
    document.getElementById('fk-nombre').focus();
}

function eliminarFechaClave(id) {
    let fechas = State.get('fechasClave');
    fechas = fechas.filter(e => e.id !== id);
    State.set('fechasClave', fechas);
    guardarFechasClave();
    UI.renderFechasList(fechas);
}

function renderFechasList()    { UI.renderFechasList(State.get('fechasClave') || []); }
function renderUpcomingEvents() { UI.renderUpcomingEvents(State.get('fechasClave') || []); }

function initFechasClave() {
    let fechasLegacy = JSON.parse(localStorage.getItem('estudiador_fechas_clave') || '[]');
    const saneadas   = window.normalizarFechasClave(fechasLegacy);
    State.set('fechasClave', saneadas);
    guardarFechasClave();
    renderUpcomingEvents();
}

function cambiarMes(delta) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    if (typeof updateCalendarHeatmap === 'function') updateCalendarHeatmap();
}
CommandRegistry.register('eliminarFechaClave', ({id}) => eliminarFechaClave(id));
