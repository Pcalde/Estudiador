// ════════════════════════════════════════════════════════════════
// SETTINGS.JS — Ajustes, horario, apariencia y privacidad
// Cargado después de: colors.js
// Dependencias globales: State, UI, Logger, Util, EventBus, getColorAsignatura
// ════════════════════════════════════════════════════════════════

/**
 * Carga el estado ligero de localStorage e inicializa controles de UI.
 * Invocada desde el bootloader principal (DOMContentLoaded).
 */
function initAppState() {
    const colores = Util.loadLS('estudiador_colores');
    if (colores) { userColors = colores; State.set('userColors', colores); }

    const proyectos = Util.loadLS('estudiador_proyectos');
    if (proyectos) {
        projects = proyectos;
        if (typeof actualizarListaProyectos === 'function') actualizarListaProyectos();
    }

    const settings = Util.loadLS('pomo_settings');
    if (settings) {
        pomoSettings = settings;
        const ids = { 'set-work': 'work', 'set-short': 'short', 'set-long': 'long', 'set-cycles': 'cyclesBeforeLong' };
        const defaults = { work: 25, short: 5, long: 15, cyclesBeforeLong: 4 };
        Object.entries(ids).forEach(([elId, key]) => {
            const el = document.getElementById(elId);
            if (el) el.value = pomoSettings[key] ?? defaults[key];
        });
        const elAuto = document.getElementById('check-auto-start');
        if (elAuto) elAuto.checked = !!pomoSettings.autoStart;
    }

    const tasks = Util.loadLS('pomo_tasks');
    if (tasks) {
        taskList = tasks;
        if (typeof renderTasks === 'function') renderTasks();
    }

    const savedModel = localStorage.getItem('estudiador_ia_model');
    if (savedModel) State.set('iaModel', savedModel);
}

function cargarApariencia() {
    const saved = JSON.parse(localStorage.getItem('estudiador_apariencia') || '{}');
    currentVisualTheme = saved.visual || 'style-glass';
    currentClickEffect = saved.click  || 'click-skeuo';

    document.body.className = '';
    document.body.classList.add(currentVisualTheme, currentClickEffect);

    const selTheme = document.getElementById('set-visual-theme');
    const selClick = document.getElementById('set-click-effect');
    if (selTheme) selTheme.value = currentVisualTheme;
    if (selClick) selClick.value = currentClickEffect;
}

function guardarApariencia() {
    currentVisualTheme = document.getElementById('set-visual-theme').value;
    currentClickEffect = document.getElementById('set-click-effect').value;
    localStorage.setItem('estudiador_apariencia', JSON.stringify({
        visual: currentVisualTheme,
        click:  currentClickEffect
    }));
    cargarApariencia();
}

function guardarAjustes() {
    if (typeof UI === 'undefined' || !UI.getAjustesData) {
        Logger.error("Arquitectura: UI.getAjustesData no está implementado.");
        return;
    }

    const asigs    = ["General", ...Object.keys(State.get('biblioteca') || {})];
    const formData = UI.getAjustesData(asigs);

    // Transacción de estado pura (sin efectos secundarios de storage)
    State.batch(() => {
        const pomoSettings = State.get('pomoSettings') || {};
        Object.assign(pomoSettings, formData.pomo);
        State.set('pomoSettings', pomoSettings);

        State.set('groqApiKey',  formData.ia.apiKey);
        State.set('groqProxyUrl', formData.ia.proxyUrl);

        const userColors = State.get('userColors') || {};
        Object.assign(userColors, formData.colores);
        State.set('userColors', userColors);
    });

    // Persistencia en storage (fuera del batch: efectos secundarios puros)
    localStorage.setItem('pomo_settings', JSON.stringify(State.get('pomoSettings')));

    if (formData.ia.sessionOnly) {
        sessionStorage.setItem('estudiador_groq_key_session', formData.ia.apiKey);
        localStorage.removeItem('estudiador_groq_key');
    } else {
        localStorage.setItem('estudiador_groq_key', formData.ia.apiKey);
        sessionStorage.removeItem('estudiador_groq_key_session');
    }
    if (formData.ia.proxyUrl) localStorage.setItem('estudiador_groq_proxy_url', formData.ia.proxyUrl);
    else localStorage.removeItem('estudiador_groq_proxy_url');

    if (formData.firebase.configStr) {
        try {
            JSON.parse(formData.firebase.configStr);
            localStorage.setItem('firebase_config', formData.firebase.configStr);
            if (typeof inicializarFirebase === 'function') inicializarFirebase(formData.firebase.configStr);
        } catch (e) { alert("La configuración de Firebase no es un JSON válido."); }
    } else {
        localStorage.removeItem('firebase_config');
    }

    localStorage.setItem('estudiador_colores', JSON.stringify(State.get('userColors')));
    localStorage.setItem('estudiador_privacy_stats', formData.privacidad.shareStats ? 'true' : 'false');

    // Propagación de efectos visuales
    if (typeof window.setPomoMode === 'function')     window.setPomoMode(State.get('currentMode') || 'work');
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof renderHorarioGrid === 'function')      renderHorarioGrid();
    if (typeof actualizarMenuLateral === 'function')  actualizarMenuLateral();

    const asig = State.get('nombreAsignaturaActual');
    if (asig && typeof UI.aplicarColorAsignaturaActiva === 'function') {
        UI.aplicarColorAsignaturaActiva(getColorAsignatura(asig));
    }

    const modoGroq = State.get('groqProxyUrl') ? "PROXY" : (State.get('groqApiKey') ? "DIRECTO" : "INACTIVO");
    alert("Ajustes guardados correctamente.\nModo IA: " + modoGroq);

    if (typeof UI.cerrarAjustes === 'function') UI.cerrarAjustes();
}

function resetSessionData() {
    const asig    = State.get('nombreAsignaturaActual');
    const biblio  = State.get('biblioteca');
    const deudaActual = typeof window.calcularDeuda === 'function' ? window.calcularDeuda(asig, biblio) : 0;
    State.set('sessionData', { tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0, deudaInicial: deudaActual });
}

function renderHorarioGrid() {
    UI.renderHorarioGrid(
        State.get('horarioGlobal') || {},
        State.get('biblioteca') || {},
        diaSeleccionadoIndex
    );
}

function seleccionarDiaHorario(idx, nombreCompleto) {
    diaSeleccionadoIndex = idx;

    document.getElementById('day-editor-panel').classList.remove('hidden');
    document.getElementById('day-editor-title').innerText = "Editar " + nombreCompleto;

    const select = document.getElementById('sch-subject-select');
    select.innerHTML = `<option value="General">General (Libre)</option>`;
    Object.keys(State.get('biblioteca') || {}).forEach(a => {
        select.innerHTML += `<option value="${a}">${a}</option>`;
    });

    const valGeneral = (horarioGlobal["General"] && horarioGlobal["General"][idx]) || 0;
    document.getElementById('sch-pomo-input').value = valGeneral;

    renderHorarioGrid();
}

function guardarHorarioDia(e) {
    if (diaSeleccionadoIndex === -1) return;

    const asig  = document.getElementById('sch-subject-select').value;
    const valor = parseInt(document.getElementById('sch-pomo-input').value) || 0;

    if (!asig) { alert("Crea asignaturas primero."); return; }

    if (!horarioGlobal[asig]) horarioGlobal[asig] = [0, 0, 0, 0, 0, 0, 0];
    horarioGlobal[asig][diaSeleccionadoIndex] = valor;

    localStorage.setItem('estudiador_horario', JSON.stringify(horarioGlobal));
    renderHorarioGrid();
    if (typeof updatePomoStats === 'function') updatePomoStats();

    const btn = e.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = "¡Hecho!";
    setTimeout(() => btn.innerText = originalText, 1000);
}

function togglePrivacidadUI() {
    const cb    = document.getElementById('set-privacy-stats');
    const icon  = document.getElementById('privacy-icon');
    const title = document.getElementById('privacy-title');
    const desc  = document.getElementById('privacy-desc');

    if (!cb || !icon || !title || !desc) return;

    icon.style.opacity  = "0";
    icon.style.filter   = "blur(4px)";
    title.style.opacity = "0";
    desc.style.opacity  = "0";

    setTimeout(() => {
        if (cb.checked) {
            icon.className  = "fa-solid fa-user-secret";
            icon.style.color = "#888";
            title.innerText = "Modo Espía";
            title.style.color = "#888";
            desc.innerText  = "Tus estadísticas están ocultas a tus amigos";
        } else {
            icon.className  = "fa-solid fa-user";
            icon.style.color = "#00b6ca";
            title.innerText = "Modo Extrovertido";
            title.style.color = "#eee";
            desc.innerText  = "Tus estadísticas son visibles para todos";
        }
        icon.style.opacity  = "1";
        icon.style.filter   = "blur(0px)";
        title.style.opacity = "1";
        desc.style.opacity  = "1";
    }, 200);

    localStorage.setItem('estudiador_privacy_stats', cb.checked ? 'true' : 'false');
    if (typeof window.sincronizar === 'function') window.sincronizar();
}
