// ════════════════════════════════════════════════════════════════
// TIMER.JS — Motor del temporizador Pomodoro
// Responsabilidad única: gestión del ciclo work/break y el reloj.
// Comunicación con tasks.js exclusivamente vía EventBus.
//
// Cargado después de: domain.js, ui.js
// Cargado antes de:   pomodoro.js (tasks), app.js
// ════════════════════════════════════════════════════════════════

const Timer = (() => {

    // ── Modo ──────────────────────────────────────────────────────

    function setMode(modo) {
        State.set('currentMode', modo);
        _pausar();
        const settings = State.get('pomoSettings') || {};
        const timeLeft = (settings[modo] || 25) * 60;
        State.set('timeLeft', timeLeft);
        UI.renderPomoModo(modo);
        UI.updateTimerDisplay(timeLeft, modo);   // ← añadir
        _renderCycleInfo();
    }

    function _renderCycleInfo() {
        const ciclos    = State.get('pomoCycles') || 0;
        const modo      = State.get('currentMode');
        const settings  = State.get('pomoSettings') || {};
        const ciclosMax = settings.cyclesBeforeLong || 4;
        UI.renderCycleInfo(ciclos, ciclosMax, modo);
    }

    // ── Reloj ─────────────────────────────────────────────────────

    function toggle() {
        if (State.get('isRunning')) _pausar();
        else _iniciar();
    }

    function _iniciar() {
        const intervalPrevio = State.get('timerInterval');
        if (intervalPrevio) clearInterval(intervalPrevio);

        State.set('isRunning', true);
        UI.renderTimerEstado(true);

        // Sincronización inmediata del pronóstico
        if (typeof window.updateFinishTime === 'function') window.updateFinishTime();

        const interval = setInterval(() => {
            const left = State.get('timeLeft') - 1;
            State.set('timeLeft', left);
            UI.updateTimerDisplay(left, State.get('currentMode'));
            if (typeof window.updateFinishTime === 'function') window.updateFinishTime();
            if (left <= 0) _finalizarCiclo();
        }, 1000);

        State.set('timerInterval', interval);
    }

    function _pausar() {
        State.set('isRunning', false);
        const interval = State.get('timerInterval');
        if (interval) clearInterval(interval);
        UI.renderTimerEstado(false);
    }

    // ── Fin de ciclo ──────────────────────────────────────────────

    function _finalizarCiclo() {
        _pausar();
        _generarBeep();

        const modoActual = State.get('currentMode');
        const settings   = State.get('pomoSettings') || {};
        const ciclosMax  = settings.cyclesBeforeLong || 4;

        if (modoActual === 'work') {
            _procesarCicloTrabajo(ciclosMax, settings);
        } else {
            setMode('work');
        }
    }

    function _procesarCicloTrabajo(ciclosMax, settings) {
        // 1. Resolver contexto de asignatura (solo lectura del estado de tareas)
        let asignaturaParaRegistro = State.get('nombreAsignaturaActual') || 'General';
        const list      = State.get('taskList') || [];
        const activeIdx = list.findIndex(t => t.active);

        if (activeIdx !== -1) {
            asignaturaParaRegistro = Domain.resolverAsignaturaDeTarea(
                list[activeIdx].text,
                asignaturaParaRegistro
            );
            // Delegar la mutación y persistencia de la tarea a tasks.js
            EventBus.emit('TIMER_POMO_WORK_DONE', { activeIdx });
        }

        // 2. Notificar al orquestador (telemetría, resumen sesión, etc.)
        EventBus.emit('pomodoro:finished', { asignatura: asignaturaParaRegistro });

        // 3. Avanzar ciclos y elegir siguiente modo
        const ciclos = (State.get('pomoCycles') || 0) + 1;
        State.set('pomoCycles', ciclos);

        const nextMode = (ciclos % ciclosMax === 0) ? 'long' : 'short';
        document.title = `🔔 ${nextMode === 'work' ? 'WORK' : 'BREAK'}`;
        setMode(nextMode);

        if (settings.autoStart === true) {
            setTimeout(() => _iniciar(), 1500);
        }
    }

    // ── Audio ─────────────────────────────────────────────────────

    function _generarBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.connect(g);
            g.connect(ctx.destination);
            osc.frequency.value = 523.25;
            osc.start();
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
            osc.stop(ctx.currentTime + 1);
        } catch (e) {
            Logger.warn('No se pudo reproducir el beep:', e);
        }
    }

    // ── API pública ───────────────────────────────────────────────

    return { setMode, toggle, finalizarCiclo: _finalizarCiclo };
})();

// Proxies globales
window.setPomoMode    = (m) => Timer.setMode(m);
window.toggleTimer    = ()  => Timer.toggle();
window.finishPomodoro = ()  => Timer.finalizarCiclo();