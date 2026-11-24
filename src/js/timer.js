// ════════════════════════════════════════════════════════════════
// TIMER.JS — Motor del temporizador Pomodoro
// Responsabilidad única: gestión del ciclo work/break y el reloj.
// Comunicación con tasks.js exclusivamente vía EventBus.
//
// Cargado después de: domain.js, ui.js
// Cargado antes de:   pomodoro.js (tasks), app.js
// ════════════════════════════════════════════════════════════════

const Timer = (() => {

    let venceEn = null;
    let autoInicio;
    let contexto = null;

    // ── Modo ──────────────────────────────────────────────────────

    function setMode(modo) {
        State.set('currentMode', modo);
        _pausar();
        contexto = null;
        const settings = State.get('pomoSettings') || {};
        const timeLeft = (settings[modo] || 25) * 60;
        State.set('timeLeft', timeLeft);
        UI.renderPomoModo(modo);
        UI.updateTimerDisplay(timeLeft, modo);   // ← añadir
        _renderCycleInfo();
        if (typeof PlannerTracking !== 'undefined') PlannerTracking.selectorPomodoro();
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

        clearTimeout(autoInicio);
        const modo = State.get('currentMode');
        if (modo === 'work' && !contexto) {
            const tarea = (State.get('taskList') || []).find(t => t.active && !t.done);
            const asignatura = State.get('nombreAsignaturaActual') || 'General';
            contexto = { tarea, asignatura: Domain.resolverAsignaturaDeTarea(tarea?.text, asignatura),
                initialSeconds:State.get('timeLeft'),
                planner:typeof PlannerTracking !== 'undefined' ? PlannerTracking.contextoPomodoro() : null };
        }
        venceEn = Date.now() + State.get('timeLeft') * 1000;
        State.set('isRunning', true);
        EventBus.emit('POMO_STARTED', { mode: modo });
        UI.renderTimerEstado(true);
        if (typeof PlannerTracking !== 'undefined') PlannerTracking.selectorPomodoro();

        // Sincronización inmediata del pronóstico
        if (typeof window.updateFinishTime === 'function') window.updateFinishTime();

        const interval = setInterval(() => {
            const left = Math.max(0, Math.ceil((venceEn - Date.now()) / 1000));
            State.set('timeLeft', left);
            UI.updateTimerDisplay(left, State.get('currentMode'));
            if (typeof window.updateFinishTime === 'function') window.updateFinishTime();
            if (left <= 0) _finalizarCiclo();
        }, 1000);

        State.set('timerInterval', interval);
    }

    function _pausar() {
        clearTimeout(autoInicio);
        if (venceEn !== null) State.set('timeLeft', Math.max(0, Math.ceil((venceEn - Date.now()) / 1000)));
        venceEn = null;
        State.set('isRunning', false);
        const interval = State.get('timerInterval');
        if (interval) clearInterval(interval);
        UI.renderTimerEstado(false);
    }

    // ── Fin de ciclo ──────────────────────────────────────────────

    function _finalizarCiclo() {
        _pausar();

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
        const activeIdx = (State.get('taskList') || []).indexOf(contexto?.tarea);
        if (activeIdx !== -1) EventBus.emit('TIMER_POMO_WORK_DONE', { activeIdx });
        const plannerSession=contexto?.planner ? {...contexto.planner,
            date:Domain.getFechaHoy(), durationMinutes:Math.max(0,(contexto.initialSeconds-State.get('timeLeft'))/60)} : null;
        EventBus.emit('pomodoro:finished', { asignatura: contexto?.asignatura || 'General', plannerSession });

        // 3. Avanzar ciclos y elegir siguiente modo
        const ciclos = (State.get('pomoCycles') || 0) + 1;
        State.set('pomoCycles', ciclos);

        const nextMode = (ciclos % ciclosMax === 0) ? 'long' : 'short';
        document.title = `🔔 ${nextMode === 'work' ? 'WORK' : 'BREAK'}`;
        setMode(nextMode);

        if (settings.autoStart === true) {
            autoInicio = setTimeout(_iniciar, 1500);
        }
    }

    // ── API pública ───────────────────────────────────────────────

    function saltar() {
        setMode(State.get('currentMode') === 'work' ? 'short' : 'work');
    }

    return { setMode, toggle, saltar };
})();

// Proxies globales
window.setPomoMode    = (m) => Timer.setMode(m);
window.toggleTimer    = ()  => Timer.toggle();
window.finishPomodoro = ()  => Timer.saltar();