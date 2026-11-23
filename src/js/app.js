// ════════════════════════════════════════════════════════════════
// APP.JS — Núcleo de arranque y orquestador
//
// Orden de carga:
//   state.js → window.js → firebase.js → colors.js → agenda.js
//   → asignaturas.js → editor.js → ia-service.js → settings.js
//   → filters.js → mobile.js → [exam.js, pizarra.js, pomodoro.js…]
//   → ui.js → app.js  ← este archivo
// ════════════════════════════════════════════════════════════════

const APP_VERSION = "2.8.3";

// ────────────────────────────────────────────────────────────────
// UTIL — helpers privados reutilizables
// ────────────────────────────────────────────────────────────────
const Util = Object.freeze({
    loadLS(key, fallback = null) {
        try {
            const raw = Perfil.local.getItem(key);
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

async function borrarTodoLocal() {
    if (!confirm('¿Eliminar los datos de Estudiador de este navegador? La copia en la nube se conserva.')) return;
    try {
        await DB.clearLocalData();
        Perfil.local.clear();
        location.reload();
    } catch (error) {
        Toast.show('No se pudo completar el restablecimiento: ' + error.message, 'error');
    }
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


let confirmarCargaLocal;
const cargaLocalLista = new Promise(resolve => { confirmarCargaLocal = resolve; });
let ultimoGuardado = 0;
async function guardarEstadoLocal() {
    const intento = ++ultimoGuardado;
    const reintentar = document.getElementById('btn-reintentar-guardado');
    const biblioteca = State.get('biblioteca');
    const bibliotecaConfig = State.get('bibliotecaConfig');
    const asigActual = State.get('nombreAsignaturaActual');
    const graphData  = State.get('graphData');
    try {
        await DB.setVars({ biblioteca, bibliotecaConfig, graphData });
        if (intento !== ultimoGuardado) return;
        if (asigActual) Perfil.local.setItem('estudiador_asig_actual', asigActual);
        Perfil.local.removeItem('estudiador_biblioteca');
        if (reintentar && !reintentar.hidden) {
            reintentar.hidden = true;
            Toast.show('Cambios guardados en este dispositivo.', 'success');
        }
    } catch (error) {
        if (intento !== ultimoGuardado) return;
        Logger.error('Fallo de guardado local:', error);
        if (reintentar) reintentar.hidden = false;
        Toast.show('Guardado incompleto. Reintenta antes de cerrar la página.', 'error');
    }
}
EventBus.on('DATA_REQUIRES_SAVE', guardarEstadoLocal);
EventBus.on('DATOS_NUBE_CARGADOS', ({ asigActual }) => {
    Logger.info('Reaccionando a carga de nube: actualizando UI...');

    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
    if (typeof updateDashboard       === 'function') updateDashboard();
    if (asigActual && typeof cargarAsignatura === 'function') {
        cargarAsignatura(asigActual);
    }
    
    // Forzar recarga de bibliotecaConfig desde Perfil.local si existe
    State.set('bibliotecaConfig', State.get('bibliotecaConfig'));
});
// REEMPLAZAR EN app.js
EventBus.on('AJUSTES_GUARDADOS', ({ modoIA }) => {
    if (typeof window.setPomoMode      === 'function') window.setPomoMode(State.get('currentMode') || 'work');
    if (typeof window.updateDashboard  === 'function') window.updateDashboard();
    if (typeof renderHorarioGrid       === 'function') renderHorarioGrid();
    if (typeof actualizarMenuLateral   === 'function') actualizarMenuLateral();

    const asig = State.get('nombreAsignaturaActual');
    if (asig && typeof UI !== 'undefined' && UI.aplicarColorAsignaturaActiva) {
        UI.aplicarColorAsignaturaActiva(getColorAsignatura(asig));
    }
    if (typeof Toast !== 'undefined') {
        Toast.show(`Ajustes guardados. Modo IA: ${modoIA}`, 'success');
    }
    
    if (typeof UI !== 'undefined' && UI.cerrarAjustes) UI.cerrarAjustes();
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
        if (biblioActual !== null) return biblioActual;
        Logger.info("Migración: Buscando datos heredados (Legacy)...");

        const legacyV2 = Perfil.local.getItem('estudiador_db_v2');
        const legacyV1 = Perfil.local.getItem('estudiador_biblioteca');
        const localDB  = await DB.getVar('biblioteca_local');

        let recoveredDB = {};
        if      (legacyV2) { recoveredDB = JSON.parse(legacyV2); }
        else if (legacyV1) { recoveredDB = JSON.parse(legacyV1); }
        else if (localDB)  { recoveredDB = localDB; }

        if (Object.keys(recoveredDB).length > 0) {
            await DB.setVar('biblioteca', recoveredDB);
            Perfil.local.removeItem('estudiador_db_v2');
            Perfil.local.removeItem('estudiador_biblioteca');
            Logger.info("Migración completada: Biblioteca transferida a IndexedDB.");
        }
        return recoveredDB;
    }

    async function migrarConfiguracionesSecundarias() {
        const fechasLegacy  = Perfil.local.getItem('estudiador_fechas_clave');
        if (fechasLegacy)  { await DB.setVar('fechasClave',   JSON.parse(fechasLegacy));  Perfil.local.removeItem('estudiador_fechas_clave'); }
        const horarioLegacy = Perfil.local.getItem('estudiador_horario');
        if (horarioLegacy) { await DB.setVar('horarioGlobal', JSON.parse(horarioLegacy)); Perfil.local.removeItem('estudiador_horario'); }
    }

    return { migrarBiblioteca, migrarConfiguracionesSecundarias };
})();

// ────────────────────────────────────────────────────────────────
// BOOTLOADER ASÍNCRONO
// ────────────────────────────────────────────────────────────────
async function arrancarAplicacion() {
    try {
        Logger.info("Iniciando motor de almacenamiento unificado...");

        await DataIO.recuperarRestauracion();
        let biblioDB = await DB.getVar('biblioteca');
        biblioDB     = await MigrationEngine.migrarBiblioteca(biblioDB);
        const normalizada = DataIO.normalizarBiblioteca(biblioDB, false);
        let graphData = await DB.getVar('graphData') || {};
        if (Object.keys(biblioDB).some(nombre => biblioDB[nombre].some((card, i) => card !== normalizada[nombre][i]))) {
            graphData = DataIO.migrarIdsMapa(graphData, biblioDB, normalizada);
            await DB.setVars({ biblioteca: normalizada, graphData });
        }
        biblioDB = normalizada;
        await MigrationEngine.migrarConfiguracionesSecundarias();

        State.set('biblioteca',    biblioDB);
        State.set('fechasClave',   await DB.getVar('fechasClave')   || []);
        State.set('horarioGlobal', await DB.getVar('horarioGlobal') || {});
        State.set('graphData', graphData);
        State.set('bibliotecaConfig', Util.loadLS('estudiador_biblioteca_config', null)
            ?? await DB.getVar('bibliotecaConfig') ?? { carpetas: {}, archivadas: [] });
        State.set('planificador', await DB.getVar('planificador_pro')
            ?? Util.loadLS('estudiador_planificador_pro', null) ?? {});   

        const ultimaAsig = Perfil.local.getItem('estudiador_asig_actual');
        if (ultimaAsig && biblioDB[ultimaAsig]) {
            State.set('nombreAsignaturaActual', ultimaAsig);
            EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: ultimaAsig });
        } else {
            if (typeof UI !== 'undefined' && UI.renderTarjetaVacia) UI.renderTarjetaVacia();
        }

        Logger.info("Estado inicial hidratado correctamente.");
        return true;
    } catch (error) {
        Logger.error("Fallo crítico en hidratación DB:", error);
        alert("No se pudieron recuperar los datos locales. Recarga la página para reintentar.");
        return false;
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
        EventBus.on('QUIZ_COMPLETADO', (payload) => {
            Logger.info('Tipo Test completado:', payload);
            // Opcional: registrar en historial de estadísticas
        });
    }

    // 1. Arranque asíncrono (DB + migración)
    await Perfil.listo;
    if (!await arrancarAplicacion()) { confirmarCargaLocal(false); return; }
    document.title = `Estudiador Pro v ${APP_VERSION}`;
    const badge = document.getElementById('app-version-badge');
    if (badge) badge.innerText = APP_VERSION;

    // 2. Sanitización de fechas en memoria
    if (typeof Domain.normalizarPomoFechas === 'function')       Domain.normalizarPomoFechas();
    if (typeof Domain.normalizarBibliotecaFechas === 'function') Domain.normalizarBibliotecaFechas(State.get('biblioteca'));
    if (typeof Domain.normalizarFechasClave === 'function')      State.set('fechasClave', Domain.normalizarFechasClave(State.get('fechasClave')));

    // 3. Estado ligero (Perfil.local)
    try {
        initAppState();
        confirmarCargaLocal(true);
    } catch (error) {
        confirmarCargaLocal(false);
        Logger.error('No se pudo cargar la configuración del perfil:', error);
        Toast.show('Revisa la copia local antes de sincronizar.', 'error');
        return;
    }
    const elPrivacy = document.getElementById('set-privacy-stats');
    if (elPrivacy) {
        elPrivacy.checked = Perfil.local.getItem('estudiador_privacy_stats') === 'true';
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
    if (typeof AudioManager !== 'undefined') {AudioManager.init();}
    
    // ─── DEBOUNCING PARA SLIDERS DE SONIDO ──────────────────────────────────────
    const _sliderDebounceTimers = {};
    
    function _createDebouncedSliderHandler(category, property) {
        return function(value) {
            const key = `${category}-${property}`;
            clearTimeout(_sliderDebounceTimers[key]);
            
            _sliderDebounceTimers[key] = setTimeout(() => {
                const settings = State.get('soundSettings');
                State.set('soundSettings', {
                    ...settings,
                    [category]: { ...settings[category], [property]: parseInt(value) }
                });
            }, 200);
        };
    }
    
    // Exponer funciones al global scope para inline handlers
    window.onAlarmVolChange = _createDebouncedSliderHandler('alarm', 'volume');
    window.onAlarmPitchChange = _createDebouncedSliderHandler('alarm', 'pitch');
    window.onRewardVolChange = _createDebouncedSliderHandler('reward', 'volume');
    window.onRewardPitchChange = _createDebouncedSliderHandler('reward', 'pitch');
    window.onAmbientVolChange = _createDebouncedSliderHandler('ambient', 'volume');
    window.onAmbientPitchChange = _createDebouncedSliderHandler('ambient', 'pitch');
    // Manejadores Defensivos para nueva categoría (Evita el TypeError)
    window.onHardVolChange = function(val) {
        const lbl = document.getElementById('hard-vol-label');
        if (lbl) lbl.innerText = val + '%';
        
        const st = State.get('soundSettings') || {};
        if (!st.hard) st.hard = { enabled: false, volume: 100, pitch: 0 };
        st.hard.volume = parseInt(val, 10);
        State.set('soundSettings', st);
    };

    window.onHardPitchChange = function(val) {
        const lbl = document.getElementById('hard-pitch-label');
        if (lbl) lbl.innerText = val;
        
        const st = State.get('soundSettings') || {};
        if (!st.hard) st.hard = { enabled: false, volume: 100, pitch: 0 };
        st.hard.pitch = parseInt(val, 10);
        State.set('soundSettings', st);
    };
    
    // ─── SINCRONIZACIÓN DE CONTROLES DE SONIDO CON STATE ───────────────────────
    function syncSoundControls() {
        const settings = State.get('soundSettings') || {};
        const muted = State.get('audioMuted');
        
        // === MUTE GLOBAL ===
        const muteIcon = document.getElementById('mute-icon');
        if (muteIcon) {
            muteIcon.style.color = muted ? '#999' : '#f48080';
            muteIcon.innerHTML = muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-mute"></i>';
        }
        
        // === ALARM CONTROLS ===
        const alarmSettings = settings.alarm || {};
        
        // Botón toggle alarma
        const alarmToggleBtn = document.getElementById('alarm-toggle-btn');
        if (alarmToggleBtn) {
            const isEnabled = alarmSettings.enabled !== false;
            alarmToggleBtn.style.opacity = isEnabled ? '1' : '0.4';
            alarmToggleBtn.style.filter = isEnabled ? 'brightness(1)' : 'brightness(0.6)';
        }
        
        // Select de track
        const alarmSelect = document.getElementById('alarm-select');
        if (alarmSelect) { alarmSelect.value = State.get('alarmTrack') || 'custom'; }
        
        // Sliders y labels
        const alarmVol = document.getElementById('alarm-volume');
        if (alarmVol) { alarmVol.value = alarmSettings.volume ?? 100; }
        const alarmVolLabel = document.getElementById('alarm-vol-label');
        if (alarmVolLabel) alarmVolLabel.textContent = (alarmSettings.volume ?? 100) + '%';
        
        const alarmPitch = document.getElementById('alarm-pitch');
        if (alarmPitch) { alarmPitch.value = alarmSettings.pitch ?? 0; }
        const alarmPitchLabel = document.getElementById('alarm-pitch-label');
        if (alarmPitchLabel) alarmPitchLabel.textContent = (alarmSettings.pitch ?? 0);
        
        // === REWARD CONTROLS ===
        const rewardSettings = settings.reward || {};
        
        // Botón toggle recompensa
        const rewardToggleBtn = document.getElementById('reward-toggle-btn');
        if (rewardToggleBtn) {
            const isEnabled = rewardSettings.enabled !== false;
            rewardToggleBtn.style.opacity = isEnabled ? '1' : '0.4';
            rewardToggleBtn.style.filter = isEnabled ? 'brightness(1)' : 'brightness(0.6)';
        }
        
        // Select de track
        const rewardSelect = document.getElementById('reward-select');
        if (rewardSelect) { rewardSelect.value = State.get('rewardTrack') || 'warning'; }
        
        // Sliders y labels
        const rewardVol = document.getElementById('reward-volume');
        if (rewardVol) { rewardVol.value = rewardSettings.volume ?? 100; }
        const rewardVolLabel = document.getElementById('reward-vol-label');
        if (rewardVolLabel) rewardVolLabel.textContent = (rewardSettings.volume ?? 100) + '%';
        
        const rewardPitch = document.getElementById('reward-pitch');
        if (rewardPitch) { rewardPitch.value = rewardSettings.pitch ?? 0; }
        const rewardPitchLabel = document.getElementById('reward-pitch-label');
        if (rewardPitchLabel) rewardPitchLabel.textContent = (rewardSettings.pitch ?? 0);

        // === HARD (DIFICULTAD) CONTROLS ===
        const hardSettings = settings.hard || {};
        
        // Botón toggle dificultad
        const hardToggleBtn = document.getElementById('hard-toggle-btn');
        if (hardToggleBtn) {
            // Asumimos que por defecto está desactivado (false) para no molestar, a diferencia de reward
            const isEnabled = hardSettings.enabled === true; 
            hardToggleBtn.style.opacity = isEnabled ? '1' : '0.4';
            hardToggleBtn.style.filter = isEnabled ? 'brightness(1)' : 'brightness(0.6)';
        }
        
        // Select de track
        const hardSelect = document.getElementById('hard-select');
        if (hardSelect) { hardSelect.value = State.get('hardTrack') || 'bump'; }
        
        // Sliders y labels
        const hardVol = document.getElementById('hard-volume');
        if (hardVol) { hardVol.value = hardSettings.volume ?? 100; }
        const hardVolLabel = document.getElementById('hard-vol-label');
        if (hardVolLabel) hardVolLabel.textContent = (hardSettings.volume ?? 100) + '%';
        
        const hardPitch = document.getElementById('hard-pitch');
        if (hardPitch) { hardPitch.value = hardSettings.pitch ?? 0; }
        const hardPitchLabel = document.getElementById('hard-pitch-label');
        if (hardPitchLabel) hardPitchLabel.textContent = (hardSettings.pitch ?? 0);
        
        // === AMBIENT CONTROLS ===
        const ambientSettings = settings.ambient || {};
        
        // Botón toggle ambiente
        const ambientToggleBtn = document.getElementById('ambient-toggle-btn');
        if (ambientToggleBtn) {
            const isEnabled = ambientSettings.enabled !== false;
            ambientToggleBtn.style.opacity = isEnabled ? '1' : '0.4';
            ambientToggleBtn.style.filter = isEnabled ? 'brightness(1)' : 'brightness(0.6)';
        }
        
        // Select de track
        const ambientSelect = document.getElementById('ambient-select');
        if (ambientSelect) { ambientSelect.value = State.get('ambientTrack') || 'brownian'; }
        
        // Sliders y labels
        const ambientVol = document.getElementById('ambient-volume');
        if (ambientVol) { ambientVol.value = ambientSettings.volume ?? 80; }
        const ambientVolLabel = document.getElementById('ambient-vol-label');
        if (ambientVolLabel) ambientVolLabel.textContent = (ambientSettings.volume ?? 80) + '%';
        
        const ambientPitch = document.getElementById('ambient-pitch');
        if (ambientPitch) { ambientPitch.value = ambientSettings.pitch ?? 0; }
        const ambientPitchLabel = document.getElementById('ambient-pitch-label');
        if (ambientPitchLabel) ambientPitchLabel.textContent = (ambientSettings.pitch ?? 0);
        
        // Botón de sonido continuo - visual feedback
        const ambientContinuousBtn = document.getElementById('ambient-continuous-btn');
        if (ambientContinuousBtn) {
            const isContinuous = ambientSettings.continuous === true;
            ambientContinuousBtn.style.opacity = isContinuous ? '1' : '0.5';
            ambientContinuousBtn.style.filter = isContinuous ? 'brightness(1.1)' : 'brightness(0.8)';
            ambientContinuousBtn.style.boxShadow = isContinuous ? '0 0 8px rgba(90,179,255,0.5)' : 'none';
        }
    }
    
    // Guardar soundSettings y audio tracks en Perfil.local cuando cambien
    function saveAudioSettingsToStorage() {
        const soundSettings = State.get('soundSettings');
        const ambientTrack = State.get('ambientTrack');
        const rewardTrack = State.get('rewardTrack');
        const alarmTrack = State.get('alarmTrack');
        
        Perfil.local.setItem('estudiador_sound_settings', JSON.stringify(soundSettings));
        Perfil.local.setItem('estudiador_ambient_track', ambientTrack || 'brownian');
        Perfil.local.setItem('estudiador_reward_track', rewardTrack || 'warning');
        Perfil.local.setItem('estudiador_hard_track', State.get('hardTrack'));
        Perfil.local.setItem('estudiador_alarm_track', alarmTrack || 'custom');
    }
    
    // Escuchar cambios en STATE para sincronizar UI y guardar settings
    if (typeof EventBus !== 'undefined') {
        EventBus.on('STATE_CHANGED', (data) => {
            if (data.keys.includes('soundSettings') || data.keys.includes('audioMuted') || 
                data.keys.includes('ambientTrack') || data.keys.includes('rewardTrack') ||
                data.keys.includes('alarmTrack') || data.keys.includes('hardTrack')) {
                syncSoundControls();
                saveAudioSettingsToStorage();
            }
        });
        
        // Sonido de inicio de pomodoro
        EventBus.on('POMO_STARTED', () => {
            if (State.get('audioMuted')) return;
            const rewardSettings = State.get('soundSettings').reward;
            if (rewardSettings.enabled) {
                // Reproducir sonido suave de inicio (usar reward track como feedback)
                if (typeof AudioManager !== 'undefined' && AudioManager.preview) {
                    AudioManager.previewLimited('sfx_warning', 0.5);
                }
            }
        });
    }
    
    // Inicializar controles de sonido en carga
    syncSoundControls();
        
    

    // 6. Cierre automático sidebar móvil al seleccionar asignatura
    document.getElementById('lista-asignaturas')?.addEventListener('click', (event) => {
        if (event.target.closest('.sidebar-subject') && window.innerWidth <= 950) cerrarPanelesMoviles();
    });
    document.getElementById('mc-btn-simular')?.addEventListener('click', () => {
        if (typeof window.lanzarSimulacionMonteCarlo === 'function') {
            window.lanzarSimulacionMonteCarlo();
        }
    });

    // 7. Importación masiva de JSON
    document.getElementById('file-input-unified')?.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;
        for (const file of e.target.files) {
            try {
                const nombre = file.name.replace(/\.json$/i, '').trim();
                if (!nombre) throw new Error('Falta el nombre de la asignatura.');
                const cards = JSON.parse(await file.text());
                const biblioteca = State.get('biblioteca');
                const reemplazo = Object.hasOwn(biblioteca, nombre);
                const ids = new Set(Object.entries(biblioteca).filter(([asig]) => asig !== nombre)
                    .flatMap(([, tarjetas]) => tarjetas.map(card => card.id)));
                const tarjetas = DataIO.normalizarTarjetas(cards, ids);
                if (reemplazo && !confirm('¿Reemplazar ' + nombre + ' por ' + tarjetas.length + ' tarjetas? Se conservará una copia previa.')) continue;
                await DataIO.guardarBiblioteca({ ...biblioteca, [nombre]: tarjetas }, reemplazo);
                actualizarMenuLateral();
                if (State.get('nombreAsignaturaActual') === nombre) cargarAsignatura(nombre);
                Toast.show(nombre + ' importada.', 'success');
            } catch (error) {
                Toast.show(file.name + ': ' + error.message, 'error');
            }
        }
        e.target.value = "";
    });

    // 8. Controlador de teclado global
    // ESTAMOS CEDIENDO EN ESTE ASPECTO DEUDA TÉCNICA POR SER SIMPLEMENTE UNA TONTERÍA VISUAL: EL SIMULARCLICKVISUAL
    // GANAMOS POCO METIÉNDOLO EN UI EN COMPARACIÓN A DEJARLO AHÍ, NO ES IMPORTANTE

document.addEventListener('keydown', (e) => {
    if (!e.key) return;
    if (e.target.closest?.('#sidebar, #sidebar-folder-dialog')) return;
    const key     = e.key.toLowerCase();
    const tag     = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable || tag === 'SELECT';
    
    // Leemos el contexto de forma segura desde el nuevo State
    const context = State.get('currentContext');

    // ── Contexto: Examen ──────────────────────────────────────
    if (context === 'quiz') return;
    if (context === 'exam') {
        const isFlash = document.getElementById('examen-flash')?.style.display === 'block';
        if (!isFlash || isInput) return;
        
        const btnRevelar = document.getElementById('ex-f-btn-revelar');
        const isRevelado = btnRevelar && btnRevelar.style.display === 'none';
        
        if ((e.code === 'Space' || key === 'enter') && !isRevelado) {
            e.preventDefault();
            if (typeof EXAM !== 'undefined') EXAM.flashRevelar();
            if (typeof simularClickVisual === 'function') simularClickVisual('#ex-f-btn-revelar');
            return;
        }
        if (isRevelado && ['1','2','3','4'].includes(key)) {
            e.preventDefault();
            if (typeof EXAM !== 'undefined') EXAM.flashPuntuar(parseInt(key));
            if (typeof simularClickVisual === 'function') simularClickVisual(`#btn-examenflashpuntuar${key === '1' ? '' : `-${key}`}`);
        }
        return;
    }

    // ── Contexto: Editor ──────────────────────────────────────
    if (context === 'editor') {
        const nav = (delta) => { if (typeof navegarEditor === 'function') navegarEditor(delta); };
        if (e.altKey && (key === 'a' || key === 'arrowleft'))  { e.preventDefault(); nav(-1); return; }
        if (e.altKey && (key === 'd' || key === 'arrowright')) { e.preventDefault(); nav(1);  return; }
        if (!isInput) {
            if (key === 'a' || key === 'arrowleft')  { e.preventDefault(); nav(-1); return; }
            if (key === 'd' || key === 'arrowright') { e.preventDefault(); nav(1);  return; }
        }
        return;
    }

    if (isInput) return;

    // ── Global: Espacio → Pomodoro ────────────────────────────
    if (key === ' ') {
        e.preventDefault();
        if (typeof Timer !== 'undefined' && Timer.toggle) Timer.toggle();
        return;
    }

    // ── Global: L / S → modos lectura/secuencial ─────────────
    if (key === 'l' || key === 's') {
        e.preventDefault();
        const id  = key === 'l' ? 'check-modo-lectura' : 'check-secuencial';
        const chk = document.getElementById(id);
        if (chk) { 
            chk.checked = !chk.checked; 
            // Llamada directa al dominio, sin depender de proxies de window
            if (key === 'l' && typeof StudyEngine !== 'undefined') StudyEngine.toggleModoLectura(chk.checked);
            if (key === 's' && typeof StudyEngine !== 'undefined') StudyEngine.toggleModoSecuencial(chk.checked);
        }
        return;
    }

    // ── Contexto: Estudio (o fallback por defecto) ────────────
    if (context === 'study' || !context) {
        // BARRERA: No procesar atajos de estudio si no hay tarjeta
        if (!State.get('conceptoActual')) return; 

        if (key === 'enter') {
            if (State.get('modoLectura')) return;
            e.preventDefault();
            const elm = document.getElementById('concepto-contenido');
            if (!elm) return;
            
            const estaVisible = !elm.classList.contains('hidden');
            if (estaVisible) { 
                if (typeof UI !== 'undefined' && UI.ocultarRespuesta) UI.ocultarRespuesta(); 
                if (typeof simularClickVisual === 'function') simularClickVisual('#btn-ocultar'); 
            } else { 
                if (typeof UI !== 'undefined' && UI.revelar) UI.revelar(); 
                if (typeof simularClickVisual === 'function') simularClickVisual('#btn-main-revelar'); 
            }
            return;
        }
        if (key === 'd' || key === 'arrowright') {
            e.preventDefault();
            if (typeof StudyEngine !== 'undefined') StudyEngine.siguienteTarjeta();
            if (typeof simularClickVisual === 'function') simularClickVisual('#btn-siguientetarjeta');
            return;
        }
        if (key === 'a' || key === 'arrowleft') {
            e.preventDefault();
            if (State.get('modoSecuencial')) { 
                if (typeof StudyEngine !== 'undefined') StudyEngine.anteriorTarjeta(); 
                if (typeof simularClickVisual === 'function') simularClickVisual('#btn-prev'); 
            }
            return;
        }
        if (!e.repeat && ['1','2','3','4'].includes(key)) {
            const controles = document.getElementById('controles-respuesta');
            if (controles && !controles.classList.contains('hidden')) {
                e.preventDefault();
                if (typeof StudyEngine !== 'undefined') StudyEngine.procesarRepaso(parseInt(key));
                if (typeof simularClickVisual === 'function') simularClickVisual(`#btn-procesarrepaso${key === '1' ? '' : `-${key}`}`);
            }
        }
    }
});

    Logger.info("Estudiador: Teclado global listo.");
});

// ────────────────────────────────────────────────────────────────
// EVENT DELEGATION — elementos generados dinámicamente
// ────────────────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
    // 1. Delegación basada en Data-Attributes (existente)
    const el = e.target.closest('[data-action]');
    if (el && typeof CommandRegistry !== 'undefined') {
        CommandRegistry.dispatch(el.dataset.action, el.dataset);
        return;
    }

    // 2. Intercepción estricta: Planificador de Exámenes
    const btnPlanificador = e.target.closest('#btn-add-fecha');
    if (btnPlanificador) {
        e.preventDefault();
        // Intentar a través del compositor UI primero
        if (typeof UI !== 'undefined' && typeof UI.abrirPlanificador === 'function') {
            UI.abrirPlanificador();
        } 
        // Fallback directo si falló la inyección en ui.js
        else if (typeof UIExamPlanner !== 'undefined' && typeof UIExamPlanner.abrirPlanificador === 'function') {
            Logger.warn("Arquitectura: UIExamPlanner no compuesto en UI. Usando fallback directo.");
            UIExamPlanner.abrirPlanificador();
        } 
        // Falla crítica de carga
        else {
            Logger.error("Arquitectura: UIExamPlanner no está en memoria. Revisa index.html.");
        }
        return;
    }

    // 3. Fallback de delegación para Calendario (por si pierden el onclick inline)
    const btnPrevMes = e.target.closest('#btn-cambiarmes, .btn-prev-month, .fa-chevron-left');
    const btnNextMes = e.target.closest('#btn-cambiarmes-2, .btn-next-month, .fa-chevron-right');
    
    // Solo interceptamos si el clic pertenece a la cabecera del widget del calendario
    if (e.target.closest('.widget-calendario-header')) {
        if (btnPrevMes) { e.preventDefault(); if (typeof window.cambiarMes === 'function') window.cambiarMes(-1); return; }
        if (btnNextMes) { e.preventDefault(); if (typeof window.cambiarMes === 'function') window.cambiarMes(1); return; }
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
    on('#check-lectura', 'change', event => StudyEngine.toggleModoLectura(event.target.checked));
    on('#check-modo-lectura', 'change', event => {
        StudyEngine.toggleModoLectura(event.target.checked);
        const label = document.querySelector('label[for="check-modo-lectura"]');
        if (label) label.classList.toggle('modo-card-activo', event.target.checked);
    });
    // Evento al cambiar un radio del modal
    document.querySelectorAll('input[name="radio-modo-estudio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            window.setModoEstudio(e.target.value);
            
            // Actualizar la etiqueta visual del botón principal
            const etiquetas = {
                'aleatorio': 'Aleatorio',
                'secuencial_retraso': 'Sec. Retraso',
                'secuencial_puro': 'Sec. Puro',
                'anki': 'Anki'
            };
            document.getElementById('label-modo-estudio').textContent = etiquetas[e.target.value];
            
            // Actualizar estilos de selección visual
            document.querySelectorAll('#modo-estudio-modal label').forEach(label => {
                label.style.borderColor = '#333';
                label.style.background = '#1a1a1a';
                label.style.boxShadow = 'none';
            });
            
            const selectedLabel = document.querySelector(`label[for="check-modo-${e.target.id.replace('check-modo-', '')}"]`);
            if (selectedLabel) {
                selectedLabel.style.borderColor = 'var(--accent)';
                selectedLabel.style.background = 'rgba(76, 175, 80, 0.1)';
                selectedLabel.style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.3)';
                
                // Colorear el icono
                const icon = selectedLabel.querySelector('i');
                if (icon) icon.style.color = 'var(--accent)';
                
                // Colorear el texto fuerte
                const strong = selectedLabel.querySelector('strong');
                if (strong) strong.style.color = 'var(--accent)';
            }
            
            // Cerrar con un pequeño retraso
            setTimeout(() => {
                document.getElementById('modo-estudio-modal').style.display = 'none';
            }, 150);
        });
    });

    // Sidebar y navegación
    on('#sidebar-toggle',              'click',  toggleSidebar);
    on('#btn-abrirajustes',            'click',  abrirAjustes);
    on('#btn-gestionarnuevaasignatura','click',  gestionarNuevaAsignatura);
    on('#btn-crearcarpeta',            'click',  () => UI.crearCarpeta());
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
    on('#btn-main-revelar', 'click', () => { if (typeof UI !== 'undefined' && UI.revelar) UI.revelar(); });
    on('#btn-ocultar', 'click', () => { if (typeof UI !== 'undefined' && UI.ocultarRespuesta) UI.ocultarRespuesta(); });
    on('#btn-procesarrepaso',  'click',  () => window.procesarRepaso(1));
    on('#btn-procesarrepaso-2','click',  () => window.procesarRepaso(2));
    on('#btn-procesarrepaso-3','click',  () => window.procesarRepaso(3));
    on('#btn-procesarrepaso-4','click',  () => window.procesarRepaso(4));
    on('#btn-prev',            'click',  window.anteriorTarjeta);
    on('#btn-siguientetarjeta','click',  () => window.siguienteTarjeta(true));
    on('#btn-filtros-dropdown','click',  abrirModalFiltros);
    on('#btn-modal-modo-estudio', 'click', () => {
        const modoActual = State.get('modoEstudio') || 'aleatorio';
        const lectura = document.getElementById('check-modo-lectura');
        if (lectura) lectura.checked = !!State.get('modoLectura');
        const radio = document.querySelector(`input[name="radio-modo-estudio"][value="${modoActual}"]`);
        if (radio) radio.checked = true;
        
        // Actualizar estilos visuales
        document.querySelectorAll('#modo-estudio-modal label').forEach(label => {
            label.style.borderColor = '#333';
            label.style.background = '#1a1a1a';
            label.style.boxShadow = 'none';
            const icon = label.querySelector('i');
            const strong = label.querySelector('strong');
            if (icon) icon.style.color = '#555';
            if (strong) strong.style.color = '#ccc';
        });
        
        const selectedLabel = document.querySelector(`label[for="check-modo-${modoActual}"]`);
        if (selectedLabel) {
            selectedLabel.style.borderColor = 'var(--accent)';
            selectedLabel.style.background = 'rgba(76, 175, 80, 0.1)';
            selectedLabel.style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.3)';
            const icon = selectedLabel.querySelector('i');
            const strong = selectedLabel.querySelector('strong');
            if (icon) icon.style.color = 'var(--accent)';
            if (strong) strong.style.color = 'var(--accent)';
        }
        const lecturaLabel = document.querySelector('label[for="check-modo-lectura"]');
        if (lecturaLabel && State.get('modoLectura')) {
            lecturaLabel.style.borderColor = 'var(--accent)';
            lecturaLabel.style.background = 'rgba(76, 175, 80, 0.1)';
            lecturaLabel.style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.3)';
            lecturaLabel.querySelector('i')?.style.setProperty('color', 'var(--accent)');
            lecturaLabel.querySelector('strong')?.style.setProperty('color', 'var(--accent)');
        }
        
        document.getElementById('modo-estudio-modal').style.display = 'flex';
    });

    // Cerrar Modal
    on('#btn-cerrar-modo-estudio', 'click', () => {
        document.getElementById('modo-estudio-modal').style.display = 'none';
    });

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
    on('#add-task-trigger',        'click',  () => showTaskForm());
    on('#btn-adjpomo',             'click',  () => adjPomo(1));
    on('#btn-adjpomo-2',           'click',  () => adjPomo(-1));
    on('#btn-hidetaskform',        'click',  () => hideTaskForm());
    on('#btn-savenewtask',         'click',  () => saveNewTask());

    // Calendario y fechas
    on('#btn-cambiarmes',        'click', () => cambiarMes(-1));
    on('#btn-cambiarmes-2',      'click', () => cambiarMes(1));
    on('#btn-cerrarfechasmodal', 'click', cerrarFechasModal);
    on('#btn-guardarfechaclave', 'click', guardarFechaClave);

    // Resumen sesión
    on('#btn-cerrarresumensesion', 'click', cerrarResumenSesion);

    // Ajustes
    on('#btn-cerrarajustes', 'click', () => { if (typeof UI !== 'undefined' && UI.cerrarAjustes) UI.cerrarAjustes(); });
    on('#btn-guardarhorariodia','click',  guardarHorarioDia);
    on('#set-visual-theme',     'change', guardarApariencia);
    on('#set-click-effect',     'change', guardarApariencia);
    on('#btn-guardarajustes',   'click',  guardarAjustes);
    on('#set-privacy-stats',    'change', togglePrivacidadUI);
    
    // Ajustes IA - Selector de proveedor
    on('#set-ia-proveedor', 'change', (e) => {
        const proveedor = e.target.value;
        if (typeof UISettings !== 'undefined' && UISettings.actualizarPanelProveedor) {
            UISettings.actualizarPanelProveedor(proveedor);
        }
        // Guardar proveedor en State
        if (typeof State !== 'undefined') {
            State.set('iaProveedor', proveedor);
        }
        // Cargar modelos OpenRouter si se selecciona
        if (proveedor === 'openrouter') {
            const apiKey = document.getElementById('set-openrouter-key')?.value.trim();
            console.log('[DEBUG] Cambiando a OpenRouter. API Key presente:', !!apiKey);
            if (apiKey && typeof State !== 'undefined') {
                State.set('openRouterApiKey', apiKey);
            }
            if (typeof AI !== 'undefined' && AI.cargarModelosOpenRouter) {
                AI.cargarModelosOpenRouter().then((modelos) => {
                    console.log('[DEBUG] Modelos OpenRouter cargados:', modelos.length);
                    if (typeof UISettings !== 'undefined' && UISettings.renderModelosOpenRouter) {
                        UISettings.renderModelosOpenRouter();
                    }
                }).catch(err => {
                    console.error('[DEBUG] Error cargando modelos OpenRouter:', err);
                });
            }
        }
    });
    
    // Botón recargar modelos OpenRouter
    on('#btn-cargar-modelos-openrouter', 'click', () => {
        if (typeof AI !== 'undefined' && AI.cargarModelosOpenRouter) {
            AI.cargarModelosOpenRouter().then(() => {
                if (typeof UISettings !== 'undefined' && UISettings.renderModelosOpenRouter) {
                    UISettings.renderModelosOpenRouter();
                    Toast.show('Modelos actualizados', 'success', 2000);
                }
            }).catch(err => {
                Toast.show('Error al cargar modelos: ' + err.message, 'error', 4000);
            });
        }
    });

    // Auth y nube
    on('#btn-login',           'click', procesarLogin);
    on('#btn-register',        'click', procesarRegistro);
    on('#btn-abrirmodalamigos','click', abrirModalAmigos);
    on('#btn-cerrarsesion',    'click', cerrarSesion);
    on('#btn-login-google',    'click', window.procesarLoginGoogle);
    on('#btn-sync-nube',       'click', forzarRespaldoNube);
    on('#btn-forzarbajada',    'click', forzarBajada);
    on('#btn-reintentar-guardado', 'click', guardarEstadoLocal);
    on('#btn-copia-anterior', 'click', () => DataIO.exportarBackup(true));
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
    on('#ex-demo',                        'click', probarExamen);
    on('#btn-iniciarexamen',              'click', iniciarExamen);
    on('#ex-f-btn-revelar',              'click', examenFlashRevelar);
    on('#ex-f-saltar',                   'click', examenFlashSaltar);
    on('#ex-f-anterior',                 'click', examenFlashAnterior);
    document.getElementById('ex-f-nav')?.addEventListener('click', event => {
        const btn = event.target.closest('[data-flash-ir]');
        if (btn) EXAM.flashIrA(Number(btn.dataset.flashIr));
    });
    on('#btn-examenflashpuntuar',         'click', () => examenFlashPuntuar(1));
    on('#btn-examenflashpuntuar-2',       'click', () => examenFlashPuntuar(2));
    on('#btn-examenflashpuntuar-3',       'click', () => examenFlashPuntuar(3));
    on('#btn-examenflashpuntuar-4',       'click', () => examenFlashPuntuar(4));
    on('#btn-examenrealguardarrespuesta', 'input', examenRealGuardarRespuesta);
    on('#btn-examenrealanterior',         'click', examenRealAnterior);
    on('#btn-examenrealsiguiente',        'click', examenRealSiguiente);
    on('#btn-examenrealentregar',         'click', examenRealEntregar);
    on('#ex-c-btn-nota',                 'click', examenRealCalcularNota);
    on('#btn-repetirexamen',             'click', () => EXAM.repetirDesdeResultado());

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

    // Amigos
    on('#btn-cerrarmodalamigos', 'click', cerrarModalAmigos);

    // Filtros
    on('#btn-cerrarmodalfiltros',   'click',  cerrarModalFiltros);
    on('#btn-cerrarmodalfiltros-2', 'click',  cerrarModalFiltros);
    on('#btn-limpiarfiltros',       'click',  limpiarFiltros);
    on('#check-filtro-hoy',     'change', () => { toggleIconoFiltro('icon-hoy',        '#C93412'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-2',       'click',  () => document.getElementById('check-filtro-hoy').click());
    on('#check-filtro-nuevas',  'change', () => { toggleIconoFiltro('icon-nuevas',     '#C93412'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-3',       'click',  () => document.getElementById('check-filtro-nuevas').click());
    on('#check-filtro-tema',    'change', () => { toggleIconoFiltro('icon-tema',       '#C93412'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-4',       'click',  () => document.getElementById('check-filtro-tema').click());
    on('#filtro-tema-val',      'input',  sincronizarFiltrosAlState, window.aplicarFiltros);
    on('#check-filtro-rango',   'change', () => { toggleIconoFiltro('icon-rango',      '#256ca5'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-5',       'click',  () => document.getElementById('check-filtro-rango').click());
    on('#filtro-rango-val',     'input',  sincronizarFiltrosAlState, window.aplicarFiltros);
    on('#check-filtro-tipo',    'change', () => { toggleIconoFiltro('icon-tipo',       '#C93412'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-6',       'click',  () => document.getElementById('check-filtro-tipo').click());
    on('#check-filtro-dificultad','change',() => { toggleIconoFiltro('icon-dificultad','#C93412'); sincronizarFiltrosAlState(); window.aplicarFiltros(); });
    on('#btn-document-7',       'click',  () => document.getElementById('check-filtro-dificultad').click());
    on('#check-dif-1', 'change', sincronizarFiltrosAlState, window.aplicarFiltros);
    on('#check-dif-2', 'change', sincronizarFiltrosAlState, window.aplicarFiltros);
    on('#check-dif-3', 'change', sincronizarFiltrosAlState, window.aplicarFiltros);
    on('#check-dif-4', 'change', sincronizarFiltrosAlState, window.aplicarFiltros);
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

        const isLocal  = !!Perfil.local.getItem('estudiador_groq_key');
        const apiKey   = State.get('groqApiKey')  || "";
        const proxyUrl = State.get('groqProxyUrl') || "";
        const fbConfig = localStorage.getItem('firebase_config') || "";
        const iaModel  = State.get('iaModel') || "openai/gpt-oss-120b";

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

window.cambiarPestanaAjustes = (...args) => { if (typeof UI !== 'undefined' && UI.cambiarPestanaAjustes) return UI.cambiarPestanaAjustes(...args); };

// Cargar modelos OpenRouter al inicio si hay API key guardada
document.addEventListener('DOMContentLoaded', () => {
    const openRouterKey = Perfil.local.getItem('estudiador_openrouter_key');
    if (openRouterKey && typeof AI !== 'undefined' && AI.cargarModelosOpenRouter) {
        AI.cargarModelosOpenRouter();
    }
});
