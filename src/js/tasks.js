// ════════════════════════════════════════════════════════════════
// TASKS.JS — Gestión de tareas del Pomodoro
// Responsabilidad única: CRUD de tareas y renderizado de la lista.
// Se comunica con timer.js exclusivamente vía EventBus.
//
// Cargado después de: domain.js, ui.js, timer.js
// Cargado antes de:   app.js
// ════════════════════════════════════════════════════════════════

const Tasks = (() => {

    // ── Formulario ────────────────────────────────────────────────

    function mostrarFormulario(editIdx = -1) {
        State.set('editingTaskIndex', editIdx);
        const list    = State.get('taskList') || [];
        const taskData = editIdx >= 0 ? list[editIdx] : null;
        UI.renderTaskForm(true, taskData);
    }

    function ocultarFormulario() {
        State.set('editingTaskIndex', -1);
        UI.renderTaskForm(false);
    }

    function ajustarPomo(delta) {
        const inp = document.getElementById('new-task-est');
        if (!inp) return;
        inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
    }

    // ── CRUD ──────────────────────────────────────────────────────

    function guardarNueva() {
        const titulo    = document.getElementById('new-task-title')?.value.trim();
        const est       = parseInt(document.getElementById('new-task-est')?.value) || 1;
        const projInput = document.getElementById('new-task-project');
        const proj      = projInput ? projInput.value.trim() : '';

        if (!titulo) return;

        const tag      = proj ? `[${proj}]` : '';
        const taskText = tag ? `${titulo} ${tag}` : titulo;

        const list    = State.get('taskList') || [];
        const editIdx = State.get('editingTaskIndex');

        if (editIdx >= 0 && editIdx < list.length) {
            list[editIdx].text = taskText;
            list[editIdx].est  = est;
        } else {
            list.push({
                text:      taskText,
                est,
                completed: 0,
                active:    false,
                done:      false
            });
        }

        State.set('taskList', list);
        _persistir();
        render();
        ocultarFormulario();
    }

    function toggleActiva(idx) {
        const list    = State.get('taskList') || [];
        const prevIdx = list.findIndex(t => t.active);

        if (prevIdx !== -1 && prevIdx !== idx) list[prevIdx].active = false;
        if (list[idx]) list[idx].active = !list[idx].active;

        State.set('taskList', list);
        _persistir();
        render();
    }

    function toggleHecha(idx) {
        const list = State.get('taskList') || [];
        if (list[idx]) list[idx].done = !list[idx].done;
        State.set('taskList', list);
        _persistir();
        render();
    }

    function editar(idx, ev) {
        if (ev) ev.stopPropagation();
        mostrarFormulario(idx);
    }

    function eliminar(idx) {
        const list = State.get('taskList') || [];
        list.splice(idx, 1);
        State.set('taskList', list);
        _persistir();
        render();
    }

    function activarDesdeMini(indexStr) {
        const idx  = parseInt(indexStr);
        const list = State.get('taskList') || [];

        if (idx === -1) {
            list.forEach(t => t.active = false);
            State.set('taskList', list);
            _persistir();
            render();
        } else if (list[idx]) {
            toggleActiva(idx);
        }
    }

    // ── Renderizado ───────────────────────────────────────────────

    function render() {
        const tasks = State.get('taskList') || [];

        UI.renderTasks(tasks, {
            onToggleActive: (idx) => {
                toggleActiva(idx);
                if (typeof window.updatePomoStats === 'function') window.updatePomoStats();
            },
            onToggleDone:   (idx) => toggleHecha(idx),
            onDelete:       (idx) => eliminar(idx),
            onEdit:         (idx) => editar(idx)
        });

        _actualizarFinishTime();
        UI.actualizarDesplegableMini(tasks);
    }

    // ── Estimación de fin de sesión ───────────────────────────────

    function _actualizarFinishTime() {
        try {
            const tasks       = State.get('taskList') || [];
            const config      = State.get('pomoSettings') || {};
            const ciclos      = State.get('pomoCycles') || 0;
            const currentMode = State.get('currentMode') || 'work';
            const timeLeft    = State.get('timeLeft') ?? (Number(config.work) || 25) * 60;

            // Pomodoros pendientes
            let pomosRestantes = 0;
            tasks.forEach(t => {
                if (!t.done) {
                    pomosRestantes += Math.max(0, (Number(t.est) || 1) - (Number(t.completed) || 0));
                }
            });

            // Hora de fin vía Domain
            const horaFin = Domain.calcularHoraFinPomodoro(
                tasks, config, ciclos, currentMode, timeLeft
            );

            // Tiempo total estimado para UI principal
            const wMin     = Number(config.work  || 25);
            const sMin     = Number(config.short || 5);
            const totalMin = pomosRestantes * wMin + Math.max(0, pomosRestantes - 1) * sMin;
            const h        = Math.floor(totalMin / 60);
            const m        = totalMin % 60;
            const tiempoStr = pomosRestantes > 0
                ? (h > 0 ? `~${h}h ${m}m` : `${m}min`)
                : null;

            // Delegar renderizado a UI (sin tocar DOM directamente)
            UI.updateFinishTime(pomosRestantes, horaFin, tiempoStr);
            UI.renderMiniWidget(pomosRestantes, horaFin);

        } catch (e) {
            Logger.error('Tasks: fallo en _actualizarFinishTime:', e);
        }
    }

    // ── Persistencia ──────────────────────────────────────────────

    function _persistir() {
        localStorage.setItem('pomo_tasks', JSON.stringify(State.get('taskList')));
        EventBus.emit('STATE_CHANGED', { keys: ['taskList'] });
    }

    // ── Listener: timer completó un ciclo work ────────────────────

    EventBus.on('TIMER_POMO_WORK_DONE', ({ activeIdx }) => {
        const list = State.get('taskList') || [];
        if (!list[activeIdx]) return;
        list[activeIdx].completed++;
        State.set('taskList', list);
        _persistir();
        render();
    });

    // ── API pública ───────────────────────────────────────────────

    return {
        mostrarFormulario,
        ocultarFormulario,
        ajustarPomo,
        guardarNueva,
        toggleActiva,
        toggleHecha,
        editar,
        eliminar,
        activarDesdeMini,
        render,
        actualizarFinishTime: _actualizarFinishTime
    };
})();

// Proxies globales
window.showTaskForm          = (idx) => Tasks.mostrarFormulario(idx);
window.hideTaskForm          = ()    => Tasks.ocultarFormulario();
window.adjPomo               = (d)   => Tasks.ajustarPomo(d);
window.saveNewTask           = ()    => Tasks.guardarNueva();
window.renderTasks           = ()    => Tasks.render();
window.updateFinishTime      = ()    => Tasks.actualizarFinishTime();
window.toggleActive          = (i)   => Tasks.toggleActiva(i);
window.toggleDone            = (i)   => Tasks.toggleHecha(i);
window.editTask              = (i,e) => Tasks.editar(i, e);
window.deleteTask            = (i)   => Tasks.eliminar(i);
window.activarTareaDesdeMini = (s)   => Tasks.activarDesdeMini(s);