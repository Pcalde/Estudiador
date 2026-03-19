// ════════════════════════════════════════════════════════════════
// APP.JS — Núcleo de arranque y orquestador
//
// Orden de carga:
//   state.js → domain.js → firebase.js → colors.js → agenda.js
//   → asignaturas.js → editor.js → ia-service.js → settings.js
//   → filters.js → mobile.js → [exam.js, pizarra.js, pomodoro.js…]
//   → ui.js → app.js  ← este archivo
// ════════════════════════════════════════════════════════════════

const APP_VERSION = "1.18.10";

// ────────────────────────────────────────────────────────────────
// LOGGER CENTRALIZADO
// ────────────────────────────────────────────────────────────────
const Logger = (() => {
    const MAX = 200;
    const _log = [];

    function _push(level, ...args) {
        const entry = {
            ts:    new Date().toISOString(),
            level,
            msg:   args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
        };
        _log.push(entry);
        if (_log.length > MAX) _log.shift();
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(`[${level.toUpperCase()}]`, ...args);
    }

    return {
        info:    (...a) => _push('info',  ...a),
        warn:    (...a) => _push('warn',  ...a),
        error:   (...a) => _push('error', ...a),
        getLogs: ()     => [..._log],
        dump:    ()     => { console.table(_log.slice(-50)); }
    };
})();

// ────────────────────────────────────────────────────────────────
// UTIL — helpers privados reutilizables
// ────────────────────────────────────────────────────────────────
const Util = Object.freeze({
    loadLS(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw !== null ? JSON.parse(raw) : fallback;
        } catch (e) {
            Logger.warn(`loadLS: error leyendo "${key}"`, e);
            return fallback;
        }
    },
    pad2: n => String(n).padStart(2, '0'),
    toggleModal(id, open) {
        const el = document.getElementById(id);
        if (!el) return;
        if (open) { el.classList.remove('hidden'); el.style.display = 'flex'; }
        else      { el.classList.add('hidden');    el.style.display = 'none'; }
    }
});

// ────────────────────────────────────────────────────────────────
// HELPERS GLOBALES
// ────────────────────────────────────────────────────────────────
function escapeHtml(value) {
    const safe = String(value ?? '');
    return safe
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}
window.escapeHtml = escapeHtml;

function persistirDatosLocales(key, data) {
    if (typeof DB !== 'undefined') {
        DB.setVar(key, data).catch(e => Logger.error(`Fallo al persistir [${key}]:`, e));
    }
}

function borrarTodoLocal() {
    if (confirm("¿Reset total?")) { localStorage.clear(); location.reload(); }
}

function abrirModalPomodoro()  { Util.toggleModal('pomodoro-modal', true);  renderTasks(); }
function cerrarModalPomodoro() { Util.toggleModal('pomodoro-modal', false); }

// ────────────────────────────────────────────────────────────────
// EVENT BUS — receptores de módulos externos
// ────────────────────────────────────────────────────────────────
EventBus.on('pomodoro:finished', (payload) => {
    Logger.info("Pomodoro completado en:", payload.asignatura);
    registrarPomoCompletado(payload.asignatura);
    showResumenSesion();
    resetSessionData();
});


EventBus.on('DATA_REQUIRES_SAVE', async () => {
    const biblioteca = State.get('biblioteca');
    const asigActual = State.get('nombreAsignaturaActual');
    try {
        await DB.setVar('biblioteca', biblioteca);
        if (asigActual) localStorage.setItem('estudiador_asig_actual', asigActual);
        localStorage.removeItem('estudiador_biblioteca');
    } catch (error) {
        Logger.error("Error guardando en IndexedDB:", error);
    }
});

EventBus.on('UI_ASIGNATURA_CARGADA', (payload) => {
    if (typeof cargarAsignatura === 'function') cargarAsignatura(payload.nombre);
});

// ────────────────────────────────────────────────────────────────
// REACTOR DE ESTADO (Dominio → UI)
// ────────────────────────────────────────────────────────────────
const _stateReactions = {
    'colaEstudio': () => {
        const cola    = State.get('colaEstudio') || [];
        const counter = document.getElementById('contador-filtro');
        if (counter) counter.textContent = `${cola.length} tarjetas`;

        const tarjeta = State.get('conceptoActual');
        if (!tarjeta || cola.length === 0) {
            if (typeof UI !== 'undefined' && UI.renderTarjetaVacia) UI.renderTarjetaVacia();
        } else {
            if (typeof UI !== 'undefined' && UI.renderizarConceptoActual) {
                UI.renderizarConceptoActual(tarjeta, State.get('modoLectura'), State.get('tiposTarjeta'));
            }
        }
    },

    'conceptoActual': () => {
        const tarjeta = State.get('conceptoActual');
        if (!tarjeta) {
            if (typeof UI !== 'undefined' && UI.renderTarjetaVacia) UI.renderTarjetaVacia();
            return;
        }
        if (typeof UI !== 'undefined' && UI.renderizarConceptoActual) {
            UI.renderizarConceptoActual(tarjeta, State.get('modoLectura'), State.get('tiposTarjeta'));
        }
    },

    'modoLectura': () => {
        const tarjeta = State.get('conceptoActual');
        if (tarjeta && typeof UI !== 'undefined' && UI.renderizarConceptoActual) {
            UI.renderizarConceptoActual(tarjeta, State.get('modoLectura'), State.get('tiposTarjeta'));
        }
    },

    'modoSecuencial': () => {
        const isSeq = State.get('modoSecuencial');
        if (typeof UI !== 'undefined' && UI.renderControlesModoEstudio) {
            UI.renderControlesModoEstudio(isSeq);
        }
    },

    'taskList': () => {
        if (typeof window.renderTasks === 'function') window.renderTasks();
    }
};

function procesarMutacionesEstado(keys) {
    let requireDashboardRefresh = false;
    const triggersDashboard = ['biblioteca', 'nombreAsignaturaActual', 'sessionData', 'pomoHistory'];

    keys.forEach(key => {
        if (_stateReactions[key]) _stateReactions[key]();
        if (triggersDashboard.includes(key)) requireDashboardRefresh = true;
    });

    if (requireDashboardRefresh && typeof Telemetry !== 'undefined') {
        Telemetry.updateDashboard();
    }
}

EventBus.on('STATE_CHANGED',       (payload) => procesarMutacionesEstado(payload.keys));
EventBus.on('STATE_BATCH_CHANGED', (payload) => procesarMutacionesEstado(payload.keys));

// ────────────────────────────────────────────────────────────────
// MIGRATION ENGINE
// ────────────────────────────────────────────────────────────────
const MigrationEngine = (() => {
    async function migrarBiblioteca(biblioActual) {
        if (biblioActual && Object.keys(biblioActual).length > 0) return biblioActual;
        Logger.info("Migración: Buscando datos heredados (Legacy)...");

        const legacyV2 = localStorage.getItem('estudiador_db_v2');
        const legacyV1 = localStorage.getItem('estudiador_biblioteca');
        const localDB  = await DB.getVar('biblioteca_local');

        let recoveredDB = {};
        if      (legacyV2) { recoveredDB = JSON.parse(legacyV2); localStorage.removeItem('estudiador_db_v2'); }
        else if (legacyV1) { recoveredDB = JSON.parse(legacyV1); localStorage.removeItem('estudiador_biblioteca'); }
        else if (localDB)  { recoveredDB = localDB; }

        if (Object.keys(recoveredDB).length > 0) {
            await DB.setVar('biblioteca', recoveredDB);
            Logger.info("Migración completada: Biblioteca transferida a IndexedDB.");
        }
        return recoveredDB;
    }

    async function migrarConfiguracionesSecundarias() {
        const fechasLegacy  = localStorage.getItem('estudiador_fechas_clave');
        if (fechasLegacy)  { await DB.setVar('fechasClave',   JSON.parse(fechasLegacy));  localStorage.removeItem('estudiador_fechas_clave'); }
        const horarioLegacy = localStorage.getItem('estudiador_horario');
        if (horarioLegacy) { await DB.setVar('horarioGlobal', JSON.parse(horarioLegacy)); localStorage.removeItem('estudiador_horario'); }
    }

    return { migrarBiblioteca, migrarConfiguracionesSecundarias };
})();

// ────────────────────────────────────────────────────────────────
// BOOTLOADER ASÍNCRONO
// ────────────────────────────────────────────────────────────────
async function arrancarAplicacion() {
    try {
        Logger.info("Iniciando motor de almacenamiento unificado...");

        let biblioDB = await DB.getVar('biblioteca');
        biblioDB     = await MigrationEngine.migrarBiblioteca(biblioDB);
        await MigrationEngine.migrarConfiguracionesSecundarias();

        State.set('biblioteca',    biblioDB);
        State.set('fechasClave',   await DB.getVar('fechasClave')   || []);
        State.set('horarioGlobal', await DB.getVar('horarioGlobal') || {});

        const ultimaAsig = localStorage.getItem('estudiador_asig_actual');
        if (ultimaAsig && biblioDB[ultimaAsig]) {
            State.set('nombreAsignaturaActual', ultimaAsig);
            EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: ultimaAsig });
        } else {
            if (typeof UI !== 'undefined' && UI.renderTarjetaVacia) UI.renderTarjetaVacia();
        }

        Logger.info("Estado inicial hidratado correctamente.");
    } catch (error) {
        Logger.error("Fallo crítico en hidratación DB:", error);
        alert("Error de I/O durante el arranque. Revisa la consola.");
    }
}

// ────────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA PRINCIPAL
// ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    if (typeof EventBus !== 'undefined') {
        EventBus.on('EXAMEN_COMPLETADO', (payload) => {
            if (typeof window.registrarExamen === 'function') window.registrarExamen(payload);
        });
    }

    // 1. Arranque asíncrono (DB + migración)
    await arrancarAplicacion();
    document.title = `Estudiador Pro v ${APP_VERSION}`;
    const badge = document.getElementById('app-version-badge');
    if (badge) badge.innerText = APP_VERSION;

    // 2. Sanitización de fechas en memoria
    if (typeof window.normalizarPomoFechas === 'function')       window.normalizarPomoFechas();
    if (typeof window.normalizarBibliotecaFechas === 'function') window.normalizarBibliotecaFechas(State.get('biblioteca'));
    if (typeof window.normalizarFechasClave === 'function')      State.set('fechasClave', window.normalizarFechasClave(State.get('fechasClave')));

    // 3. Estado ligero (localStorage)
    initAppState();
    const elPrivacy = document.getElementById('set-privacy-stats');
    if (elPrivacy) {
        elPrivacy.checked = localStorage.getItem('estudiador_privacy_stats') === 'true';
        if (typeof togglePrivacidadUI === 'function') togglePrivacidadUI();
    }

    // 4. Inicialización de interfaz
    if (typeof setPomoMode           === 'function') setPomoMode('work');
    if (typeof resetSessionData      === 'function') resetSessionData();
    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
    if (typeof cargarApariencia      === 'function') cargarApariencia();
    cargarColoresGlobales();
    if (typeof renderFechasList      === 'function') renderFechasList();
    if (typeof renderUpcomingEvents  === 'function') renderUpcomingEvents();
    if (typeof WidgetManager         !== 'undefined') WidgetManager.init();

    // 5. Renderizado inicial de widgets
    if (typeof updatePomoStats     === 'function') updatePomoStats();
    if (typeof updateWeeklyWidget  === 'function') updateWeeklyWidget();
    if (typeof updateGlobalStats   === 'function') updateGlobalStats();
    if (typeof updatePendingWindow === 'function') updatePendingWindow();

    // 6. Cierre automático sidebar móvil al seleccionar asignatura
    document.getElementById('lista-asignaturas')?.addEventListener('click', () => {
        if (window.innerWidth < 950) setTimeout(cerrarPanelesMoviles, 150);
    });

    // 7. Importación masiva de JSON
    document.getElementById('file-input-unified')?.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;
        let importados = 0;
        for (const f of e.target.files) {
            try {
                const nombreArchivo = f.name.replace('.json', '');
                const contenido     = JSON.parse(await f.text());
                if (Array.isArray(contenido)) {
                    const biblio = State.get('biblioteca');
                    if (biblio[nombreArchivo] && !confirm(`La asignatura "${nombreArchivo}" ya existe. ¿Sobreescribir?`)) continue;
                    biblio[nombreArchivo] = contenido;
                    State.set('biblioteca', biblio);
                    importados++;
                }
            } catch (err) { Logger.error("Error leyendo archivo:", err); }
        }
        if (importados > 0) {
            EventBus.emit('DATA_REQUIRES_SAVE');
            actualizarMenuLateral();
            alert(`${importados} asignaturas importadas correctamente.`);
        }
        e.target.value = "";
    });

    // 8. Controlador de teclado global
    document.addEventListener('keydown', (e) => {
        if (!e.key) return;
        const key     = e.key.toLowerCase();
        const tag     = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable || tag === 'SELECT';

        // Prioridad 1: Modo Examen
        if (State.get('examenActivo')) {
            const isFlash    = document.getElementById('examen-flash')?.style.display === 'block';
            if (!isFlash || isInput) return;
            const btnRevelar = document.getElementById('ex-f-btn-revelar');
            const isRevelado = btnRevelar && btnRevelar.style.display === 'none';
            if ((e.code === 'Space' || key === 'enter') && !isRevelado) {
                e.preventDefault();
                window.examenFlashRevelar?.();
                simularClickVisual('#ex-f-btn-revelar');
                return;
            }
            if (isRevelado && ['1','2','3','4'].includes(key)) {
                e.preventDefault();
                window.examenFlashPuntuar(parseInt(key));
                simularClickVisual(`#btn-examenflashpuntuar${key === '1' ? '' : `-${key}`}`);
            }
            return;
        }

        // Prioridad 2: Editor amigable
        const editorCard     = document.getElementById('editor-card');
        const isEditorActive = editorCard && !editorCard.classList.contains('hidden');
        if (isEditorActive) {
            const nav = (delta) => {
                simularClickVisual(delta < 0 ? '#btn-edit-prev' : '#btn-edit-next');
                navegarEditor(delta);
            };
            if (e.altKey && (key === 'a' || key === 'arrowleft'))  { e.preventDefault(); nav(-1); return; }
            if (e.altKey && (key === 'd' || key === 'arrowright')) { e.preventDefault(); nav(1);  return; }
            if (!isInput) {
                if (key === 'a' || key === 'arrowleft')  { e.preventDefault(); nav(-1); return; }
                if (key === 'd' || key === 'arrowright') { e.preventDefault(); nav(1);  return; }
            }
        }

        if (isInput) return;

        // Espacio: Pomodoro
        if (key === ' ') {
            e.preventDefault();
            toggleTimer?.();
            simularClickVisual('#mini-btn-toggle');
            simularClickVisual('#btn-pomo-action');
            return;
        }

        // L / S: modos
        if (key === 'l' || key === 's') {
            e.preventDefault();
            const id  = key === 'l' ? 'check-lectura' : 'check-secuencial';
            const fn  = key === 'l' ? window.toggleModoLectura : window.toggleModoSecuencial;
            const chk = document.getElementById(id);
            if (chk) { chk.checked = !chk.checked; fn?.(chk.checked); feedbackVisualSimple(chk.parentElement); }
            return;
        }

        // Contexto: tarjeta de estudio
        const studyCard = document.getElementById('study-card');
        if (studyCard && !studyCard.classList.contains('hidden')) {
            if (key === 'enter') {
                e.preventDefault();
                const estaVisible = !document.getElementById('concepto-contenido')?.classList.contains('hidden');
                if (estaVisible) { simularClickVisual('#btn-ocultar');      UI.ocultarRespuesta?.(); }
                else             { simularClickVisual('#btn-main-revelar'); UI.revelar?.(); }
                return;
            }
            if (key === 'd' || key === 'arrowright') {
                e.preventDefault(); simularClickVisual('#btn-siguientetarjeta'); window.siguienteTarjeta?.(); return;
            }
            if (key === 'a' || key === 'arrowleft') {
                e.preventDefault();
                const btnPrev = document.getElementById('btn-prev');
                if (btnPrev && !btnPrev.classList.contains('hidden')) {
                    simularClickVisual('#btn-prev'); window.anteriorTarjeta?.();
                }
                return;
            }
            if (['1','2','3','4'].includes(key)) {
                const controles = document.getElementById('controles-respuesta');
                if (controles && !controles.classList.contains('hidden')) {
                    e.preventDefault();
                    simularClickVisual(`#btn-procesarrepaso${key === '1' ? '' : `-${key}`}`);
                    window.procesarRepaso?.(parseInt(key));
                }
            }
        }
    });

    Logger.info("Estudiador: Teclado global restaurado.");
});

// ────────────────────────────────────────────────────────────────
// EVENT DELEGATION — elementos generados dinámicamente
// ────────────────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const idx    = el.dataset.idx    !== undefined ? Number(el.dataset.idx)  : undefined;
    const nombre = el.dataset.nombre !== undefined ? el.dataset.nombre       : undefined;
    const id     = el.dataset.id     !== undefined ? el.dataset.id           : undefined;
    const n      = el.dataset.n      !== undefined ? Number(el.dataset.n)    : undefined;

    switch (action) {
        case 'renombrarAsignatura':           renombrarAsignatura(nombre, e);                          break;
        case 'borrarAsignatura':              borrarAsignatura(nombre, e);                             break;
        case 'borrarProyecto':                borrarProyecto(idx);                                     break;
        case 'editTask':                      editTask(idx, e);                                        break;
        case 'toggleDone':                    toggleDone(idx, e);                                      break;
        case 'deleteTask':                    deleteTask(idx, e);                                      break;
        case 'eliminarFechaClave':            eliminarFechaClave(id);                                  break;
        case 'borrarSlot':                    borrarSlot(idx, e);                                      break;
        case 'examRealIrA':                   EXAM._api.realIrA(idx);                                  break;
        case 'examenCorreccionPuntuar':       examenCorreccionPuntuar(idx, n);                         break;
        case 'cargarPanelAmigos':             cargarPanelAmigos();                                     break;
        case 'importarAsignaturaCompartida':  importarAsignaturaCompartida(el.dataset.id);             break;
        case 'aceptarSolicitud':              aceptarSolicitud(el.dataset.id, el.dataset.email);       break;
        case 'verStatsAmigo':                 verStatsAmigo(el.dataset.uid, el.dataset.email);         break;
        case 'abrirCompartirAsignatura':      abrirCompartirAsignatura(el.dataset.email);              break;
        case 'enviarSolicitudAmistad':        enviarSolicitudAmistad();                                break;
        case 'compartirAsignatura':           compartirAsignatura(el.dataset.email, el.dataset.asig);  break;
        case 'rechazarSolicitud':             rechazarSolicitud(id);                                   break;
        case 'eliminarAmigo':                 eliminarAmigo(id);                                       break;
        case 'fragmentarTarjetaActualIA':     fragmentarTarjetaActualIA();                             break;
        case 'minimizeWidget':                WidgetManager?.toggleMinimize(el.dataset.widgetId);      break;
        case 'hideWidget':
        case 'restoreWidget':                 WidgetManager?.toggleHide(el.dataset.widgetId);          break;
        case 'nav-mobile':                    manejarNavegacionMovil(el.dataset.target, el);           break;
        case 'abrir-ajustes':
            manejarNavegacionMovil?.('study');
            abrirAjustes?.();
            break;
        case 'toggle-pomodoro': {
            manejarNavegacionMovil?.('study', document.querySelector('[data-target="study"]'));
            const pomoCard = document.getElementById('pomodoro-card');
            if (pomoCard) { pomoCard.classList.remove('collapsed'); pomoCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            break;
        }
        case 'setModoExamen': examenSetMode(el.dataset.modo); break;
        case 'restaurarWidgetsOcultos':
            if (typeof WidgetManager !== 'undefined' && WidgetManager.restaurarWidgets) {
                WidgetManager.restaurarWidgets();
            }
            break;
    }
});

// ────────────────────────────────────────────────────────────────
// EVENT BINDINGS — listeners de elementos estáticos del DOM
// ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };

    // Color presets
    document.getElementById('set-color-preset')?.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') { guardarColoresGlobales(e.target.value, {}); cargarColoresGlobales(); }
    });

    // Color pickers individuales
    document.querySelectorAll('.color-picker-dinamico').forEach(picker => {
        picker.addEventListener('input', (e) => {
            const cssVar = e.target.dataset.var;
            const color  = e.target.value;
            document.documentElement.style.setProperty(cssVar, color);
            const select = document.getElementById('set-color-preset');
            if (select && select.value !== 'custom') { select.value = 'custom'; currentPresetName = 'custom'; }
            currentCustomPalette[cssVar] = color;
        });
        picker.addEventListener('change', () => guardarColoresGlobales());
    });

    // Sidebar y navegación
    on('#sidebar-toggle',              'click',  toggleSidebar);
    on('#btn-abrirajustes',            'click',  abrirAjustes);
    on('#btn-gestionarnuevaasignatura','click',  gestionarNuevaAsignatura);
    on('#btn-crearproyecto',           'click',  crearProyecto);
    on('#btn-modoimportar',            'click',  modoImportar);
    on('#btn-abrirexamen',             'click',  abrirExamen);
    on('#btn-togglepizarra',           'click',  () => Pizarra.toggle());

    // Edición
    on('#btn-modoedicionjson',             'click',  abrirEditorAmigable);
    on('#btn-ir-json',                     'click',  modoEdicionJSON);
    on('#btn-guardar-edicion-amigable',    'click',  () => guardarDatosEditorAmigable(true));
    on('#btn-edit-prev',                   'click',  () => navegarEditor(-1));
    on('#btn-edit-next',                   'click',  () => navegarEditor(1));
    on('#btn-cancelaredicion-1',           'click',  cancelarEdicion);
    on('#btn-cancelaredicion-2',           'click',  cancelarEdicion);
    on('#btn-cancelaredicion-3',           'click',  cancelarEdicion);
    on('#btn-cancelaredicion-4',           'click',  cancelarEdicion);
    on('#btn-cancelaredicion',             'click',  cancelarEdicion);
    on('#btn-guardarnuevoconcepto',        'click',  guardarNuevoConcepto);
    on('#btn-descargarasignaturaactual',   'click',  () => window.descargarAsignaturaActual());
    on('#btn-guardaredicionjson',          'click',  () => window.guardarEdicionJSON());
    on('#btn-volver-visual',              'click',  abrirEditorAmigable);
    on('#tab-import-json',                'click',  () => setImportMode('json'));
    on('#tab-import-latex',               'click',  () => setImportMode('latex'));
    on('#btn-procesarimportacion',        'click',  procesarImportacion);
    on('#btn-procesarimportacionlatex',   'click',  procesarImportacionLatex);

    // Tarjeta de estudio
    on('#btn-main-revelar',    'click',  UI.revelar);
    on('#btn-ocultar',         'click',  UI.ocultarRespuesta);
    on('#btn-procesarrepaso',  'click',  () => window.procesarRepaso(1));
    on('#btn-procesarrepaso-2','click',  () => window.procesarRepaso(2));
    on('#btn-procesarrepaso-3','click',  () => window.procesarRepaso(3));
    on('#btn-procesarrepaso-4','click',  () => window.procesarRepaso(4));
    on('#btn-prev',            'click',  window.anteriorTarjeta);
    on('#btn-siguientetarjeta','click',  () => window.siguienteTarjeta(true));
    on('#btn-filtros-dropdown','click',  abrirModalFiltros);
    on('#check-secuencial',    'change', window.toggleModoSecuencial);
    on('#check-lectura',       'change', window.toggleModoLectura);

    // PDF
    on('#pdf-toggle-mini',      'click',  toggleAcordeonPDF);
    on('#pdf-header-bar',       'click',  toggleAcordeonPDF);
    on('#btn-crearslotrecurso', 'click',  crearSlotRecurso);
    on('#input-pdf-slot',       'change', (e) => cargarPDFEnSlot(e.target));

    // Pomodoro
    on('#btn-abrirmodalpomodoro',  'click',  abrirModalPomodoro);
    on('#btn-cerrarmodalpomodoro', 'click',  cerrarModalPomodoro);
    on('#mini-btn-toggle',         'click',  toggleTimer);
    on('#btn-finishpomodoro',      'click',  finishPomodoro);
    on('#btn-finishpomodoro-2',    'click',  finishPomodoro);
    on('#mini-task-select',        'change', (e) => activarTareaDesdeMini(e.target.value));
    on('#btn-week-7',              'click',  () => setWeeklyView('7d'));
    on('#btn-week-28',             'click',  () => setWeeklyView('28d'));
    on('#btn-mode-work',           'click',  () => setPomoMode('work'));
    on('#btn-mode-short',          'click',  () => setPomoMode('short'));
    on('#btn-mode-long',           'click',  () => setPomoMode('long'));
    on('#btn-pomo-action',         'click',  toggleTimer);
    on('#add-task-trigger',        'click',  showTaskForm);
    on('#btn-adjpomo',             'click',  () => adjPomo(1));
    on('#btn-adjpomo-2',           'click',  () => adjPomo(-1));
    on('#btn-hidetaskform',        'click',  hideTaskForm);
    on('#btn-savenewtask',         'click',  saveNewTask);

    // Calendario y fechas
    on('#btn-cambiarmes',        'click', () => cambiarMes(-1));
    on('#btn-cambiarmes-2',      'click', () => cambiarMes(1));
    on('#btn-add-fecha',         'click', abrirFechasModal);
    on('#btn-cerrarfechasmodal', 'click', cerrarFechasModal);
    on('#btn-guardarfechaclave', 'click', guardarFechaClave);

    // Resumen sesión
    on('#btn-cerrarresumensesion', 'click', cerrarResumenSesion);

    // Ajustes
    on('#btn-cerrarajustes',    'click',  UI.cerrarAjustes);
    on('#btn-guardarhorariodia','click',  guardarHorarioDia);
    on('#set-visual-theme',     'change', guardarApariencia);
    on('#set-click-effect',     'change', guardarApariencia);
    on('#btn-guardarajustes',   'click',  guardarAjustes);
    on('#set-privacy-stats',    'change', togglePrivacidadUI);

    // Auth y nube
    on('#btn-login',           'click', procesarLogin);
    on('#btn-register',        'click', procesarRegistro);
    on('#btn-abrirmodalamigos','click', abrirModalAmigos);
    on('#btn-cerrarsesion',    'click', cerrarSesion);
    on('#btn-login-google',    'click', window.procesarLoginGoogle);
    on('#btn-sync-nube',       'click', forzarRespaldoNube);
    on('#btn-forzarbajada',    'click', forzarBajada);
    on('#btn-exportarbackup',  'click', () => window.exportarBackup());
    on('#btn-document',        'click', () => document.getElementById('backup-input-unico').click());
    on('#backup-input-unico',  'change', (e) => importarBackup(e.target));
    on('#btn-borrartodolocal', 'click', borrarTodoLocal);

    // Examen
    on('#btn-cerrarexamen',               'click', cerrarExamen);
    on('#btn-cerrarexamen-2',             'click', cerrarExamen);
    on('#btn-cerrarexamen-3',             'click', cerrarExamen);
    on('#btn-cerrarexamen-4',             'click', cerrarExamen);
    on('#btn-cerrarexamen-5',             'click', cerrarExamen);
    on('#btn-cerrarexamen-6',             'click', cerrarExamen);
    on('#ex-mode-btn-flash',              'click', () => examenSetMode('flash'));
    on('#ex-mode-btn-real',               'click', () => examenSetMode('real'));
    on('#ex-mode-btn-feynman',            'click', () => examenSetMode('feynman'));
    on('#btn-iniciarexamen',              'click', iniciarExamen);
    on('#ex-f-btn-revelar',              'click', examenFlashRevelar);
    on('#btn-examenflashpuntuar',         'click', () => examenFlashPuntuar(1));
    on('#btn-examenflashpuntuar-2',       'click', () => examenFlashPuntuar(2));
    on('#btn-examenflashpuntuar-3',       'click', () => examenFlashPuntuar(3));
    on('#btn-examenflashpuntuar-4',       'click', () => examenFlashPuntuar(4));
    on('#btn-examenrealguardarrespuesta', 'input', examenRealGuardarRespuesta);
    on('#btn-examenrealanterior',         'click', examenRealAnterior);
    on('#btn-examenrealsiguiente',        'click', examenRealSiguiente);
    on('#btn-examenrealentregar',         'click', examenRealEntregar);
    on('#ex-c-btn-nota',                 'click', examenRealCalcularNota);
    on('#btn-repetirexamen',             'click', repetirExamen);

    // Pizarra
    on('#pz-btn-lapiz',       'click',  () => Pizarra.setModo('lapiz'));
    on('#pz-btn-resaltador',  'click',  () => Pizarra.setModo('resaltador'));
    on('#pz-btn-linea',       'click',  () => Pizarra.setModo('linea'));
    on('#pz-btn-borrador',    'click',  () => Pizarra.setModo('borrador'));
    on('#pz-color-amarillo',  'click',  () => Pizarra.setColor('#ffff00'));
    on('#pz-color-blanco',    'click',  () => Pizarra.setColor('#ffffff'));
    on('#pz-color-cyan',      'click',  () => Pizarra.setColor('#00e5ff'));
    on('#pz-color-salmon',    'click',  () => Pizarra.setColor('#ff6b6b'));
    on('#pz-color-verde',     'click',  () => Pizarra.setColor('#69ff47'));
    on('#pizarra-color',      'change', (e) => Pizarra.setColor(e.target.value));
    on('#pizarra-grosor',     'input',  (e) => Pizarra.setGrosor(e.target.value));
    on('#btn-undopizarra',    'click',  () => Pizarra.undo());
    on('#btn-limpiarpizarra', 'click',  () => Pizarra.limpiar());
    on('#btn-togglepizarra-2','click',  () => Pizarra.toggle(false));

    // Móvil
    on('#btn-togglemobilemenu',    'click', toggleMobileMenu);
    on('#btn-cerrarpanelesmoviles','click', cerrarPanelesMoviles);
    on('#btn-togglemobilestats',   'click', toggleMobileStats);

    // Chat IA
    on('#btn-togglechat', 'click',   toggleChat);
    on('#btn-open-chat',  'click',   toggleChat);
    on('#ai-user-input',  'keydown', (e) => checkEnterIA(e));
    on('#btn-send-ai',    'click',   enviarMensajeIA);

    // Amigos
    on('#btn-cerrarmodalamigos', 'click', cerrarModalAmigos);

    // Filtros
    on('#btn-cerrarmodalfiltros',   'click',  cerrarModalFiltros);
    on('#btn-cerrarmodalfiltros-2', 'click',  cerrarModalFiltros);
    on('#btn-limpiarfiltros',       'click',  limpiarFiltros);
    on('#check-filtro-hoy',     'change', () => { toggleIconoFiltro('icon-hoy',        '#C93412'); window.aplicarFiltros(); });
    on('#btn-document-2',       'click',  () => document.getElementById('check-filtro-hoy').click());
    on('#check-filtro-nuevas',  'change', () => { toggleIconoFiltro('icon-nuevas',     '#C93412'); window.aplicarFiltros(); });
    on('#btn-document-3',       'click',  () => document.getElementById('check-filtro-nuevas').click());
    on('#check-filtro-tema',    'change', () => { toggleIconoFiltro('icon-tema',       '#C93412'); window.aplicarFiltros(); });
    on('#btn-document-4',       'click',  () => document.getElementById('check-filtro-tema').click());
    on('#filtro-tema-val',      'input',  window.aplicarFiltros);
    on('#check-filtro-rango',   'change', () => { toggleIconoFiltro('icon-rango',      '#256ca5'); window.aplicarFiltros(); });
    on('#btn-document-5',       'click',  () => document.getElementById('check-filtro-rango').click());
    on('#filtro-rango-val',     'input',  window.aplicarFiltros);
    on('#check-filtro-tipo',    'change', () => { toggleIconoFiltro('icon-tipo',       '#C93412'); window.aplicarFiltros(); });
    on('#btn-document-6',       'click',  () => document.getElementById('check-filtro-tipo').click());
    on('#check-filtro-dificultad','change',() => { toggleIconoFiltro('icon-dificultad','#C93412'); window.aplicarFiltros(); });
    on('#btn-document-7',       'click',  () => document.getElementById('check-filtro-dificultad').click());
    on('#check-dif-1', 'change', window.aplicarFiltros);
    on('#check-dif-2', 'change', window.aplicarFiltros);
    on('#check-dif-3', 'change', window.aplicarFiltros);
    on('#check-dif-4', 'change', window.aplicarFiltros);
    on('#btn-restaurar-widgets', 'click', () => {
        if (typeof WidgetManager !== 'undefined' && WidgetManager.restaurarWidgets) {
            if (confirm("¿Restaurar orden y visibilidad original de los widgets?")) {
                WidgetManager.restaurarWidgets();
            }
        }
    });
});

// ────────────────────────────────────────────────────────────────
// CONTROLADOR GLOBAL DE AJUSTES
// ────────────────────────────────────────────────────────────────
window.abrirAjustes = function() {
    try {
        Logger.info("Abriendo panel de ajustes...");
        window.manejarNavegacionMovil?.('study');

        const isLocal  = !!localStorage.getItem('estudiador_groq_key');
        const apiKey   = State.get('groqApiKey')  || "";
        const proxyUrl = State.get('groqProxyUrl') || "";
        const fbConfig = localStorage.getItem('firebase_config') || "";
        const iaModel  = State.get('iaModel') || "llama-3.3-70b-versatile";

        if (typeof UI === 'undefined' || !UI.abrirAjustes) throw new Error("UI.abrirAjustes no disponible.");
        UI.abrirAjustes(apiKey, isLocal, proxyUrl, fbConfig, iaModel);

        const horario = State.get('horarioGlobal') || {};
        const diaIdx  = typeof diaSeleccionadoIndex !== 'undefined' ? diaSeleccionadoIndex : -1;
        const biblio  = State.get('biblioteca') || {};
        if (typeof UI.renderHorarioGrid   === 'function') UI.renderHorarioGrid(horario, biblio, diaIdx);
        if (typeof UI.renderColorSettings === 'function') UI.renderColorSettings(biblio);

    } catch (error) {
        console.error("[ERROR CRÍTICO EN AJUSTES]:", error);
        alert("Fallo al abrir ajustes. Revisa la consola.");
    }
};

window.cambiarPestanaAjustes = UI.cambiarPestanaAjustes;
