// ════════════════════════════════════════════════════════════════
// ASIGNATURAS.JS — Gestión de asignaturas y proyectos
// Cargado después de: colors.js
// Dependencias globales: State, UI, Logger, EventBus, getColorAsignatura
// ════════════════════════════════════════════════════════════════

function guardarProyectos() {
    localStorage.setItem('estudiador_proyectos', JSON.stringify(projects));
}

function actualizarMenuLateral() {
    UI.actualizarMenuLateral(State.get('biblioteca') || {}, State.get('nombreAsignaturaActual'));
}

function actualizarListaProyectos() {
    UI.actualizarListaProyectos(projects);
}

function borrarProyecto(i) {
    projects.splice(i, 1);
    guardarProyectos();
    actualizarListaProyectos();
}

function renombrarAsignatura(oldName, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }

    const newName = prompt(`Nuevo nombre para ${oldName}:`, oldName);
    if (!newName || newName.trim() === "" || newName === oldName) return;

    const biblio = State.get('biblioteca');
    if (biblio[newName]) { alert("Ese nombre ya existe."); return; }

    State.batch(() => {
        biblio[newName] = biblio[oldName];
        delete biblio[oldName];
        State.set('biblioteca', biblio);
        if (State.get('nombreAsignaturaActual') === oldName) {
            State.set('nombreAsignaturaActual', newName);
        }
    });

    EventBus.emit('DATA_REQUIRES_SAVE');
    actualizarMenuLateral();
    if (State.get('nombreAsignaturaActual') === newName) cargarAsignatura(newName);
}

function borrarAsignatura(nombre, ev) {
    if (ev) ev.stopPropagation();
    if (!confirm(`¿Eliminar "${nombre}"? Toda su información se perderá.`)) return;

    State.batch(() => {
        const biblio = State.get('biblioteca');
        delete biblio[nombre];
        State.set('biblioteca', biblio);

        if (State.get('nombreAsignaturaActual') === nombre) {
            State.set('nombreAsignaturaActual', null);
            if (typeof UI !== 'undefined' && UI.cancelarEdicion) UI.cancelarEdicion(false);
        }
    });

    EventBus.emit('DATA_REQUIRES_SAVE');
    actualizarMenuLateral();
    if (typeof window.sincronizar === 'function') window.sincronizar();
}

function cargarAsignatura(nombre) {
    Logger.info("Cargando asignatura:", nombre);

    nombreAsignaturaActual = nombre;
    actualizarMenuLateral();

    UI.ocultarTodo();
    const studyCard = document.getElementById('study-card');
    if (studyCard) studyCard.classList.remove('hidden');

    try {
        const color = getColorAsignatura(nombre);
        UI.aplicarColorAsignaturaActiva(color);

        const modPdf = document.getElementById('modulo-pdf');
        if (modPdf) modPdf.classList.add('pdf-collapsed');

        const frame = document.getElementById('pdf-frame');
        if (frame) { frame.src = ""; frame.style.display = "none"; }

        const ph = document.getElementById('pdf-placeholder');
        if (ph) ph.style.display = "block";

        const arrowIcon = document.getElementById('pdf-arrow-icon');
        if (arrowIcon) arrowIcon.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';

        const statusText = document.getElementById('pdf-status-text');
        if (statusText) statusText.innerText = "Desplegar";

        if (typeof renderSlots === 'function') renderSlots();
        else if (typeof actualizarSlotsPdf === 'function') actualizarSlotsPdf();

    } catch (e) {
        Logger.error("Error silenciado en módulo PDF:", e);
    }

    indiceNavegacion = 0;
    conceptoActual   = null;

    if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
}

function crearProyecto() {
    const nombre = prompt("Nombre del Proyecto:");
    if (!nombre) return;

    const asigs = Object.keys(State.get('biblioteca') || {});
    let asigVinculada = "";

    if (asigs.length > 0) {
        const defaultAsig = nombreAsignaturaActual ? (asigs.indexOf(nombreAsignaturaActual) + 1) : "";
        let msg = "Vincular a asignatura (número) o dejar vacío para General:\n";
        asigs.forEach((a, i) => msg += `${i + 1}. ${a}\n`);
        const resp = prompt(msg, defaultAsig);
        const idx = parseInt(resp) - 1;
        if (!isNaN(idx) && asigs[idx]) asigVinculada = asigs[idx];
    }

    projects.push({ nombre, asignatura: asigVinculada });
    guardarProyectos();
    actualizarListaProyectos();
}

function actualizarDesplegableMini() {
    UI.actualizarDesplegableMini(taskList, State.get('userColors') || {});
}
