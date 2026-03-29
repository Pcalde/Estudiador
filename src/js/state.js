// ════════════════════════════════════════════════════════════════
// STATE.JS — Estado centralizado de la aplicación
// v2.1 — Estructura Estricta. Cero contaminación del objeto window.
// Las lecturas/escrituras DEBEN usar State.get(key) y State.set(key, val).
// ════════════════════════════════════════════════════════════════

const State = (() => {
    // ── Estado privado ────────────────────────────────────────────
    const _s = {
        // Biblioteca y estudio
        biblioteca:              {},
        projects:                [],
        nombreAsignaturaActual:  null,
        colaEstudio:             [],
        conceptoActual:          null,
        indiceNavegacion:        0,
        modoSecuencial:          false,
        modoLectura:             false,
        // Configuración de Dominio (Ontología de tarjetas expandida)
        tiposTarjeta: {
            // Entidades Principales
            'Definición':   { color: '#c40202', comandoLatex: '\\defi' },
            'Teorema':      { color: '#1e4fb2', comandoLatex: '\\teorema' },
            'Proposición':  { color: '#16a116', comandoLatex: '\\prop' },
            'Propiedad':    { color: '#16a116', comandoLatex: '\\propiedaddequemecomasloscojones' },
            'Lema':         { color: '#20603D', comandoLatex: '\\lema' },
            'Corolario':    { color: '#3883c2', comandoLatex: '\\coro' },
            'Axioma':       { color: '#dabcfa', comandoLatex: '\\axioma' },
            'Observación':  { color: '#7242A3', comandoLatex: '\\obs' },
            'Nota':         { color: '#9e9e9e', comandoLatex: '\\nota' },
            'Ejemplo':      { color: '#3CAF6E', comandoLatex: '\\ejemplo' },

            // Bloques de Demostración (Herencia de color y comandos específicos)
            'Dem. Teorema':      { color: '#1e4fb2', comandoLatex: '\\begin{demot}' },
            'Dem. Proposición':  { color: '#16a116', comandoLatex: '\\begin{demop}' },
            'Dem. Propiedad':    { color: '#16a116', comandoLatex: '\\begin{demop}' },
            'Dem. Lema':         { color: '#20603D', comandoLatex: '\\begin{demol}' },
            'Dem. Corolario':    { color: '#3883c2', comandoLatex: '\\begin{democ}' }
        },

        // Variables dinámicas de UI del Controlador
        tiposTarjeta:            [],
        currentContext:          null,
        filtrosActivos:          {},
        resultadosMonteCarlo:    {}, // Caché de simulaciones por asignatura

        // Apariencia
        currentVisualTheme:  'style-glass',
        currentClickEffect:  'click-skeuo',
        userColors:          {},

        // Pomodoro & Tareas
        pomoSettings:    { work: 35, short: 5, long: 15, autoStart: false },
        taskList:        [],
        timerInterval:   null,
        timeLeft:        1500,
        isRunning:       false,
        currentMode:     'work',
        pomoCycles:      0,
        dailyGoal:       6,
        pomoHistory:     [],
        isPomoProcessing: false,
        sessionData:     { tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0, deudaInicial: 0 },
        iaModel:         'llama-3.3-70b-versatile',

        // Calendario & Horario
        fechasClave:          null, 
        horarioGlobal:        {},
        calendarViewDate:     new Date(),
        weeklyViewMode:       '7d',
        diaSeleccionadoIndex: -1,

        // Firebase & Sync Flags
        db:                  null,
        auth:                null,
        currentUser:         null,
        unsubscribeSnapshot: null,
        primeraCarga:        true,
        isDirty:             false, 
        isInitialized:       false, 

        // Groq / IA
        groqApiKey:   null, 
        groqProxyUrl: null, 

        // Recursos / PDF
        recursosPorAsignatura: {},
        slotsMemoria:          {},
        slotEditando:          -1,

        // Examen
        _examenActivo: false,

        // Widget layout
        widgetConfig: null,
    };

    // ── Getters con lazy-init para valores de localStorage ────────
    const _lazyInits = {
        fechasClave:  () => JSON.parse(localStorage.getItem('estudiador_fechas_clave') || '[]'),
        groqApiKey:   () => sessionStorage.getItem('estudiador_groq_key_session')
                            || localStorage.getItem('estudiador_groq_key') || '',
        groqProxyUrl: () => localStorage.getItem('estudiador_groq_proxy_url') || '',
        widgetConfig: () => JSON.parse(localStorage.getItem('estudiador_widget_config') || 'null'),
    };

    // ── API pública de State ──────────────────────────────────────
    let _isBatching = false;
    let _pendingChanges = new Set();
    const _keys = Object.keys(_s);

    return {
        /** Lee un valor del estado centralizado */
        get(key) { 
            if (!(key in _s) && typeof Logger !== 'undefined') {
                Logger.warn(`STATE: Intento de lectura de clave inexistente o no registrada: ${key}`);
            }
            // Lazy initialization si el valor es null
            if (_s[key] === null && _lazyInits[key]) {
                _s[key] = _lazyInits[key]();
            }
            return _s[key];
        },
        
        /** Escribe un valor en el estado y notifica al bus */
        set(key, val) { 
            if (!(key in _s) && typeof Logger !== 'undefined') {
                Logger.info(`STATE: Registrando nueva clave dinámica en el estado: ${key}`);
            }
            
            _s[key] = val; 
            _s.isDirty = true; // Marca que hay cambios pendientes de sincronizar

            if (_isBatching) {
                _pendingChanges.add(key);
            } else if (typeof EventBus !== 'undefined') {
                EventBus.emit('STATE_CHANGED', { keys: [key] });
            }
        },

        /** Ejecuta múltiples mutaciones como una única transacción */
        batch(fn) {
            if (_isBatching) {
                fn(); 
                return;
            }
            
            _isBatching = true;
            _pendingChanges.clear();
            
            try { 
                fn(); 
            } catch(e) { 
                if (typeof Logger !== 'undefined') Logger.error("State Batch Error:", e); 
                throw e; 
            } finally {
                _isBatching = false;
                if (_pendingChanges.size > 0 && typeof EventBus !== 'undefined') {
                    EventBus.emit('STATE_BATCH_CHANGED', { keys: Array.from(_pendingChanges) });
                }
                _pendingChanges.clear();
            }
        },

        /** Bloqueo/Desbloqueo de seguridad para Firebase */
        setInitialized(status) {
            _s.isInitialized = status;
            _s.isDirty = false; // Al inicializar desde la nube, el estado arranca "limpio"
            if (typeof Logger !== 'undefined') Logger.info(`STATE: Inicializado=${status}. Sincronización permitida.`);
        },

        /** Snapshot inmutable para depuración */
        snapshot() {
            const snap = {};
            _keys.forEach(k => { snap[k] = _s[k]; });
            return JSON.parse(JSON.stringify(snap)); // Evita mutaciones por referencia
        }
    };
})();
