// ════════════════════════════════════════════════════════════════
// STATE.JS — Estado centralizado de la aplicación
// v2.0 — Todos los globales viven aquí con acceso controlado.
// El resto del código sigue leyendo/escribiendo por nombre gracias
// a Object.defineProperty sobre window (retrocompatibilidad total).
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

        // Calendario & Horario
        fechasClave:        null, // lazy: lee localStorage en primer acceso
        horarioGlobal:      {},
        calendarViewDate:   new Date(),
        weeklyViewMode:     '7d',
        diaSeleccionadoIndex: -1,

        // Firebase
        db:                 null,
        auth:               null,
        currentUser:        null,
        unsubscribeSnapshot: null,
        primeraCarga:       true,

        // Groq / IA
        groqApiKey:  null, // lazy
        groqProxyUrl: null, // lazy

        // Recursos / PDF
        recursosPorAsignatura: {},
        slotsMemoria:          {},
        slotEditando:          -1,

        // Examen
        _examenActivo: false,

        // Widget layout (orden, minimizado, oculto)
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

    // ── Exponer cada clave como propiedad de window ───────────────
    // Así todo el código existente (que usa `biblioteca`, `currentUser`, etc.)
    // sigue funcionando sin cambios, pero ahora la mutación pasa por _s.
    const _keys = Object.keys(_s);
    _keys.forEach(key => {
        Object.defineProperty(window, key, {
            get() {
                if (_s[key] === null && _lazyInits[key]) {
                    _s[key] = _lazyInits[key]();
                }
                return _s[key];
            },
            set(v) { _s[key] = v; },
            configurable: true,
            enumerable:   true,
        });
    });

    // ── API pública de State ──────────────────────────────────────
    return {
        /** Lee un valor del estado */
        get(key)      { return window[key]; },
        /** Escribe un valor en el estado */
        set(key, val) { window[key] = val; },
        /** Snapshot para depuración */
        snapshot() {
            const snap = {};
            _keys.forEach(k => { snap[k] = _s[k]; });
            return snap;
        },
        /** Devuelve las claves gestionadas */
        keys() { return [..._keys]; },
    };
})();
