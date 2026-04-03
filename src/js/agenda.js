// ════════════════════════════════════════════════════════════════
// AGENDA.JS — Gestión de fechas clave y eventos del calendario
// ════════════════════════════════════════════════════════════════

window.calendarViewDate = window.calendarViewDate || new Date();

const TIPOS_EVENTO = {
    examen:   { label: 'Final',   iconClass: 'fa-sharp fa-solid fa-chess-king',   weight: 'dominant' },
    prueba:   { label: 'Prueba',  iconClass: 'fa-sharp fa-solid fa-chess-queen',  weight: 'strong'   },
    entrega:  { label: 'Entrega', iconClass: 'fa-sharp fa-solid fa-chess-knight', weight: 'subtle'   },
    vacacion: { label: 'Festivo', iconClass: 'fa-solid fa-umbrella-beach',        weight: 'subtle'   },
    otro:     { label: 'Otro',    iconClass: 'fa-sharp fa-solid fa-chess-pawn',   weight: 'subtle'   },
};

/** Devuelve el color del evento: color de asignatura o gris genérico. */
function getColorEvento(ev) {
    // Dependencia segura de colors.js
    return ev.asig && typeof window.getColorAsignatura === 'function' 
        ? window.getColorAsignatura(ev.asig) 
        : '#607d8b';
}

function guardarFechasClave() {
    const saneadas = typeof window.normalizarFechasClave === 'function' 
        ? window.normalizarFechasClave(State.get('fechasClave') || [])
        : (State.get('fechasClave') || []);
        
    State.set('fechasClave', saneadas);
    if (typeof persistirDatosLocales === 'function') persistirDatosLocales('fechasClave', saneadas);
}

function inputDateToApp(s) {
    if (!s) return "";
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

function appDateToInput(s) {
    if (!s) return "";
    const p = s.split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s;
}

function abrirFechasModal() {
    const biblio     = State.get('biblioteca');
    const asigActual = State.get('nombreAsignaturaActual');
    const fechas     = State.get('fechasClave') || [];

    if (UI && UI.abrirFechasModal) UI.abrirFechasModal(biblio, asigActual);

    const inputFecha = document.getElementById('fk-fecha');
    if (inputFecha) {
        inputFecha.value = typeof window.getFechaHoy === 'function'
            ? window.getFechaHoy()
            : new Date().toISOString().split('T')[0];
    }
    const inputNombre = document.getElementById('fk-nombre');
    if (inputNombre) inputNombre.value = '';

    if (UI && UI.renderFechasList) UI.renderFechasList(fechas);
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
    
    // Validar fecha asumiendo que domain.js provee parseDateSafe
    const parseado = typeof window.parseDateSafe === 'function' ? window.parseDateSafe(fechaInput) : true;
    if (!fecha || !parseado) {
        alert('La fecha no es válida. Usa el selector de fecha.');
        document.getElementById('fk-fecha').focus();
        return;
    }

    const fechas = State.get('fechasClave') || [];
    fechas.push({ id: Date.now(), nombre: nombre.slice(0, 120), fecha, tipo, asig, completada: false });
    
    // Ordenar por cercanía
    if (typeof window.fechaValor === 'function') {
        fechas.sort((a, b) => window.fechaValor(a.fecha) - window.fechaValor(b.fecha));
    }

    State.set('fechasClave', fechas);
    guardarFechasClave();
    renderFechasList();
    renderUpcomingEvents(); // CORRECCIÓN: Sincronizar widget del dashboard
    
    document.getElementById('fk-nombre').value = '';
    document.getElementById('fk-nombre').focus();
}

function eliminarFechaClave(id) {
    let fechas = State.get('fechasClave') || [];
    fechas = fechas.filter(e => e.id !== id);
    State.set('fechasClave', fechas);
    guardarFechasClave();
    renderFechasList();
    renderUpcomingEvents(); // CORRECCIÓN: Sincronizar widget del dashboard
}

function toggleCompletarFechaClave(id) {
    let fechas = State.get('fechasClave') || [];
    const idx = fechas.findIndex(e => e.id === id);
    if (idx !== -1) {
        fechas[idx].completada = !fechas[idx].completada;
        State.set('fechasClave', fechas);
        guardarFechasClave();
        renderFechasList();
        renderUpcomingEvents();
    }
}

function renderFechasList() { 
    if (UI && UI.renderFechasList) UI.renderFechasList(State.get('fechasClave') || []); 
}

function renderUpcomingEvents() { 
    if (UI && UI.renderUpcomingEvents) UI.renderUpcomingEvents(State.get('fechasClave') || []); 
}

function initFechasClave() {
    let fechasLegacy = JSON.parse(localStorage.getItem('estudiador_fechas_clave') || '[]');
    const saneadas   = typeof window.normalizarFechasClave === 'function' ? window.normalizarFechasClave(fechasLegacy) : fechasLegacy;
    State.set('fechasClave', saneadas);
    guardarFechasClave();
    renderUpcomingEvents();
}

function cambiarMes(delta) {
    window.calendarViewDate.setMonth(window.calendarViewDate.getMonth() + delta);
    if (typeof updateCalendarHeatmap === 'function') updateCalendarHeatmap();
}

// ────────────────────────────────────────────────────────────────
// EXPOSICIÓN OBLIGATORIA A LA ARQUITECTURA GLOBAL
// ────────────────────────────────────────────────────────────────
window.getColorEvento = getColorEvento;
window.abrirFechasModal = abrirFechasModal;
window.cerrarFechasModal = cerrarFechasModal;
window.guardarFechaClave = guardarFechaClave;
window.eliminarFechaClave = eliminarFechaClave;
window.toggleCompletarFechaClave = toggleCompletarFechaClave; // Nueva función
window.renderFechasList = renderFechasList;
window.renderUpcomingEvents = renderUpcomingEvents;
window.initFechasClave = initFechasClave;
window.cambiarMes = cambiarMes;