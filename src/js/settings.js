// ════════════════════════════════════════════════════════════════
// SETTINGS.JS — Ajustes, horario, apariencia y privacidad
// Cargado después de: colors.js
// Dependencias: State, UI, Logger, EventBus, getColorAsignatura
// ════════════════════════════════════════════════════════════════

/**
 * Carga el estado ligero de localStorage e inicializa controles de UI.
 * Invocada desde el bootloader principal (DOMContentLoaded).
 */
function initAppState() {
    State.batch(() => {
        const colores = Util.loadLS('estudiador_colores');
        if (colores) State.set('userColors', colores);

        const proyectos = Util.loadLS('estudiador_proyectos');
        if (proyectos) State.set('projects', proyectos);

        const settings = Util.loadLS('pomo_settings');
        if (settings) {
            State.set('pomoSettings', settings);
            _sincronizarInputsPomo(settings);
        }

        const tasks = Util.loadLS('pomo_tasks');
        if (tasks) State.set('taskList', tasks);

        const savedModel = localStorage.getItem('estudiador_ia_model');
        if (savedModel) State.set('iaModel', savedModel);
    });

    // Los proyectos necesitan renderizado fuera del batch (depende de UI)
    if (State.get('projects').length > 0) {
        if (typeof actualizarListaProyectos === 'function') actualizarListaProyectos();
    }
    if (State.get('taskList').length > 0) {
        if (typeof renderTasks === 'function') renderTasks();
    }
}

/** Sincroniza los inputs de pomodoro con los valores guardados. */
function _sincronizarInputsPomo(settings) {
    const campos = {
        'set-work':   'work',
        'set-short':  'short',
        'set-long':   'long',
        'set-cycles': 'cyclesBeforeLong'
    };
    const defaults = { work: 25, short: 5, long: 15, cyclesBeforeLong: 4 };
    Object.entries(campos).forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        if (el) el.value = settings[key] ?? defaults[key];
    });
    const elAuto = document.getElementById('check-auto-start');
    if (elAuto) elAuto.checked = !!settings.autoStart;
}

// ── Apariencia ────────────────────────────────────────────────

function cargarApariencia() {
    const saved = Util.loadLS('estudiador_apariencia') || {};
    const visualTheme  = saved.visual || 'style-glass';
    const clickEffect  = saved.click  || 'click-skeuo';

    // FIX: Usar el State centralizado en lugar de globales legacy
    State.set('currentVisualTheme', visualTheme);
    State.set('currentClickEffect', clickEffect);

    UI.renderApariencia(visualTheme, clickEffect);
}

function guardarApariencia() {
    const visualTheme = document.getElementById('set-visual-theme').value;
    const clickEffect = document.getElementById('set-click-effect').value;

    // FIX: Mutar a través del State
    State.batch(() => {
        State.set('currentVisualTheme', visualTheme);
        State.set('currentClickEffect', clickEffect);
    });

    localStorage.setItem('estudiador_apariencia', JSON.stringify({
        visual: visualTheme,
        click:  clickEffect
    }));
    UI.renderApariencia(visualTheme, clickEffect);
}

// ── Privacidad ────────────────────────────────────────────────

function togglePrivacidadUI() {
    const cb = document.getElementById('set-privacy-stats');
    if (!cb) return;
    const isPrivate = cb.checked;
    localStorage.setItem('estudiador_privacy_stats', isPrivate ? 'true' : 'false');
    UI.renderPrivacidadUI(isPrivate);
    if (typeof window.sincronizar === 'function') window.sincronizar();
}

// ── Horario ───────────────────────────────────────────────────

function renderHorarioGrid() {
    UI.renderHorarioGrid(
        State.get('horarioGlobal') || {},
        State.get('biblioteca')    || {},
        State.get('diaSeleccionadoIndex') 
    );
}

function seleccionarDiaHorario(idx, nombreCompleto) {
    State.set('diaSeleccionadoIndex', idx); 

    const horario      = State.get('horarioGlobal') || {};
    const asignaturas  = Object.keys(State.get('biblioteca') || {});
    const valorGeneral = (horario['General']?.[idx]) || 0;

    UI.renderSelectorDia(nombreCompleto, asignaturas, valorGeneral);
    renderHorarioGrid();
}

function guardarHorarioDia(e) {
    const idx = State.get('diaSeleccionadoIndex');
    if (idx === -1) return;

    const asig  = document.getElementById('sch-subject-select')?.value;
    const valor = parseInt(document.getElementById('sch-pomo-input')?.value) || 0;

    // FIX: Reemplazar alert() nativo por Toast
    if (!asig) { Toast.show('Crea asignaturas primero.', 'error'); return; }

    const horario = State.get('horarioGlobal') || {};
    if (!horario[asig]) horario[asig] = [0, 0, 0, 0, 0, 0, 0];
    horario[asig][idx] = valor;

    State.set('horarioGlobal', horario);
    DB.setVar('horarioGlobal', horario).catch(err => Logger.error('Error guardando horario:', err));

    renderHorarioGrid();
    if (typeof window.updatePomoStats === 'function') window.updatePomoStats();

    // Feedback visual usando Toast en lugar de cambiar el botón
    Toast.show('Día guardado correctamente', 'success');
}

// ── Sesión de estudio ─────────────────────────────────────────

function resetSessionData() {
    const asig   = State.get('nombreAsignaturaActual');
    const biblio = State.get('biblioteca');
    const deudaActual = typeof window.calcularDeuda === 'function'
        ? window.calcularDeuda(asig, biblio)
        : 0;
    State.set('sessionData', {
        tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0,
        deudaInicial: deudaActual
    });
}

// ── Guardar ajustes ───────────────────────────────────────────

function guardarAjustes() {
    if (typeof UI === 'undefined' || !UI.getAjustesData) {
        Logger.error('Arquitectura: UI.getAjustesData no está implementado.');
        return;
    }

    const asigs    = ['General', ...Object.keys(State.get('biblioteca') || {})];
    const formData = UI.getAjustesData(asigs);

    // 1. Validar antes de persistir nada
    if (formData.firebase.configStr) {
        try { JSON.parse(formData.firebase.configStr); }
        catch (e) { alert('La configuración de Firebase no es un JSON válido.'); return; }
    }

    // 2. Persistir en State (batch atómico)
    State.batch(() => {
        const pomoSettings = { ...State.get('pomoSettings'), ...formData.pomo };
        State.set('pomoSettings', pomoSettings);
        State.set('groqApiKey',   formData.ia.apiKey);
        State.set('groqProxyUrl', formData.ia.proxyUrl);
        const userColors = { ...State.get('userColors'), ...formData.colores };
        State.set('userColors', userColors);
    });

    // 3. Persistir en localStorage (efectos secundarios, fuera del batch)
    _persistirAjustesStorage(formData);

    // 4. Notificar al orquestador para que actualice la UI
    const modoIA = State.get('groqProxyUrl')
        ? 'PROXY'
        : (State.get('groqApiKey') ? 'DIRECTO' : 'INACTIVO');

    EventBus.emit('AJUSTES_GUARDADOS', { modoIA });
}

/** Persistencia pura en storage. Sin efectos secundarios de UI. */
function _persistirAjustesStorage(formData) {
    localStorage.setItem('pomo_settings', JSON.stringify(State.get('pomoSettings')));

    if (formData.ia.sessionOnly) {
        sessionStorage.setItem('estudiador_groq_key_session', formData.ia.apiKey);
        localStorage.removeItem('estudiador_groq_key');
    } else {
        localStorage.setItem('estudiador_groq_key', formData.ia.apiKey);
        sessionStorage.removeItem('estudiador_groq_key_session');
    }

    if (formData.ia.proxyUrl) localStorage.setItem('estudiador_groq_proxy_url', formData.ia.proxyUrl);
    else                       localStorage.removeItem('estudiador_groq_proxy_url');

    if (formData.firebase.configStr) {
        localStorage.setItem('firebase_config', formData.firebase.configStr);
        if (typeof inicializarFirebase === 'function') {
            inicializarFirebase(formData.firebase.configStr);
        }
    } else {
        localStorage.removeItem('firebase_config');
    }

    localStorage.setItem('estudiador_colores',        JSON.stringify(State.get('userColors')));
    localStorage.setItem('estudiador_privacy_stats',  formData.privacidad.shareStats ? 'true' : 'false');
}