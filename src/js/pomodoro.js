// ════════════════════════════════════════════════════════════════
// POMODORO.JS — Gestor de Tiempo y Tareas
// Opera de forma aislada. Emite eventos CustomEvent para notificar
// al orquestador (app.js) sobre la finalización de ciclos.
// ════════════════════════════════════════════════════════════════

const POMODORO = (() => {

    // --- RELOJ Y ALARMAS ---

    function setMode(m) {
        State.set('currentMode', m);
        pauseTimer();
        const settings = State.get('pomoSettings');
        State.set('timeLeft', settings[m] * 60);
        updateTimerDisplay();

        const colors = {
            'work': 'var(--pomo-work)', 
            'short': 'var(--pomo-short)', 
            'long': 'var(--pomo-long)'
        };
        const labels = {'work':'POMODORO', 'short':'DESCANSO CORTO', 'long':'DESCANSO LARGO'};
        const activeColor = colors[m];

        const bigBtn = document.getElementById('btn-pomo-action');
        if(bigBtn) {
            bigBtn.style.color = activeColor;
            bigBtn.style.borderColor = activeColor;
            bigBtn.innerHTML = "&#9658;&#9658;";
        }
        
        document.querySelectorAll('.pomo-btn-mode').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById('btn-mode-' + m);
        if(activeBtn) activeBtn.classList.add('active');

        const miniWidget = document.getElementById('mini-pomo-widget');
        const miniLabel = document.getElementById('mini-mode-label');
        const miniBtn = document.getElementById('mini-btn-toggle');
        const pomoIconBtn = document.querySelector('#btn-abrirmodalpomodoro i'); 
        
        if(miniWidget) {
            miniWidget.style.borderTopColor = activeColor;
            miniLabel.innerText = labels[m];
            miniLabel.style.color = activeColor;
            miniBtn.style.color = activeColor;
            miniBtn.innerHTML = "&#9658;";
            
            if(pomoIconBtn) {
                pomoIconBtn.style.color = activeColor;
                pomoIconBtn.style.transition = 'color 0.3s ease';
            }
        }
        _updatePomosToLongBreak();
    }

    function _updatePomosToLongBreak() {
        const ciclos = State.get('pomoCycles') || 0;
        const modo = State.get('currentMode');
        const settings = State.get('pomoSettings') || {};
        const ciclosMax = settings.cyclesBeforeLong || 4;
        
        const ciclosHechos = ciclos % ciclosMax;
        const faltan = ciclosMax - ciclosHechos;
        
        const infoElem = document.getElementById('mini-cycle-info');
        if (infoElem) {
            if (faltan === 1 && modo === 'work') {
                infoElem.innerHTML = "Siguiente: <strong>LARGO</strong>";
                infoElem.style.color = "var(--accent)";
            } else if (modo !== 'work') {
                infoElem.innerHTML = "En descanso";
                infoElem.style.color = "#888";
            } else {
                infoElem.innerHTML = `Largo en: <strong>${faltan}</strong> pomos`;
                infoElem.style.color = "#666";
            }
        }
    }

    function toggleTimer() {
        if(State.get('isRunning')) pauseTimer();
        else startTimer();
    }

    function startTimer() {
        let interval = State.get('timerInterval');
        if(interval) clearInterval(interval);
        
        State.set('isRunning', true);
        
        const bigBtn = document.getElementById('btn-pomo-action');
        if(bigBtn) bigBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        const miniBtn = document.getElementById('mini-btn-toggle');
        if(miniBtn) miniBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

        // Sincronización inmediata del pronóstico al alterar el flujo temporal (Reanudar)
        updateFinishTime();

        interval = setInterval(() => {
            let left = State.get('timeLeft') - 1;
            State.set('timeLeft', left);
            updateTimerDisplay();
            if(left <= 0) finishPomodoro();
        }, 1000);
        State.set('timerInterval', interval);
    }

    function updateTimerDisplay() {
        UI.updateTimerDisplay(State.get('timeLeft'), State.get('currentMode'));
        // Sincronización continua del pronóstico en cada tick del reloj para absorber derivas
        updateFinishTime();
    }

    function pauseTimer() {
        State.set('isRunning', false);
        const interval = State.get('timerInterval');
        if (interval) clearInterval(interval);
        
        const bigBtn = document.getElementById('btn-pomo-action');
        if(bigBtn) bigBtn.innerHTML = "&#9658;&#9658;";
        const miniBtn = document.getElementById('mini-btn-toggle');
        if(miniBtn) miniBtn.innerHTML = "&#9658;";
    }



    function _resolverAsignaturaDeTarea(taskText) {
        let asignaturaParaRegistro = "General"; 
        const match = taskText.match(/\[(.*?)\]/);
        
        if (match) {
            let rawTag = match[1].replace(/#/g, '').trim(); 
            if (rawTag.includes(':')) {
                const partes = rawTag.split(':');
                const posible = partes[partes.length - 1].trim();
                if (_esAsignaturaValida(posible)) return posible;
            }
            
            const proys = State.get('projects') || [];
            const proyecto = proys.find(p => (typeof p === 'object' ? p.nombre : p).toLowerCase() === rawTag.toLowerCase());
            
            if (proyecto && typeof proyecto === 'object' && proyecto.asignatura) {
                asignaturaParaRegistro = proyecto.asignatura;
            } else if (_esAsignaturaValida(rawTag)) {
                const bib = State.get('biblioteca') || {};
                const nombreReal = Object.keys(bib).find(k => k.toLowerCase() === rawTag.toLowerCase());
                asignaturaParaRegistro = nombreReal || rawTag;
            } else {
                asignaturaParaRegistro = rawTag;
            }
        }
        return asignaturaParaRegistro;
    }

    /**
     * @function finishPomodoro
     * @description Finaliza el ciclo actual del Pomodoro, reproduce el aviso sonoro, 
     * resuelve el contexto dinámico de la asignatura y orquesta la transición al siguiente estado.
     * @returns {void}
     */
    function finishPomodoro() {
        pauseTimer();
        if (typeof _generarBeep === 'function') _generarBeep();

        const modoActual = State.get('currentMode');
        const settings = State.get('pomoSettings') || {};
        const ciclosMax = settings.cyclesBeforeLong || 4; 
        
        let nextMode = 'work';
        
        // FIX ARQUITECTÓNICO: El contexto por defecto debe ser la asignatura activa actual
        let asignaturaParaRegistro = State.get('nombreAsignaturaActual') || "General"; 

        if (modoActual === 'work') {
            const list = State.get('taskList') || [];
            const idx = list.findIndex(t => t.active);
            
            if (idx !== -1) { 
                list[idx].completed++; 
                saveTasks(); 
                
                // Si la tarea tiene una asignatura explícita, sobreescribe el contexto actual
                const asigTarea = _resolverAsignaturaDeTarea(list[idx].text);
                if (asigTarea && asigTarea !== "General") {
                    asignaturaParaRegistro = asigTarea;
                }
            }
            
            EventBus.emit('pomodoro:finished', { asignatura: asignaturaParaRegistro });
            
            let ciclos = (State.get('pomoCycles') || 0) + 1;
            State.set('pomoCycles', ciclos);
            
            if (ciclos > 0 && ciclos % ciclosMax === 0) nextMode = 'long';
            else nextMode = 'short';

        } else {
            nextMode = 'work';
        }

        document.title = "🔔 " + (nextMode === 'work' ? "WORK" : "BREAK");
        setMode(nextMode);

        if (settings.autoStart === true) {
            setTimeout(() => { startTimer(); }, 1500);
        }
    }

    function _esAsignaturaValida(nombre) {
        if(!nombre) return false;
        const n = nombre.toLowerCase();
        const bib = State.get('biblioteca') || {};
        const enBiblio = Object.keys(bib).some(k => k.toLowerCase() === n);
        const enColores = (typeof COLORES_ASIGNATURAS !== 'undefined') && Object.keys(COLORES_ASIGNATURAS).some(k => k.toLowerCase() === n);
        return enBiblio || enColores;
    }

    function _generarBeep() {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 523.25; 
        osc.start();
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
        osc.stop(ctx.currentTime + 1);
    }

    // --- GESTIÓN DE TAREAS ---


    function showTaskForm(editIdx = -1) {
        State.set('editingTaskIndex', editIdx);
        
        document.getElementById('add-task-trigger').classList.add('hidden');
        document.getElementById('task-form-panel').classList.remove('hidden');
        
        const inputTitle = document.getElementById('new-task-title');
        const inputEst = document.getElementById('new-task-est');
        
        if (editIdx >= 0) {
            const list = State.get('taskList') || [];
            const t = list[editIdx];
            if (t) {
                // Parseo inverso para rellenar el formulario limpiamente
                let rawText = t.text;
                const match = rawText.match(/\[(.*?)\]$/);
                if (match) {
                    const projSelect = document.getElementById('new-task-project');
                    if (projSelect) projSelect.value = match[1];
                    rawText = rawText.replace(/\[.*?\]$/, '').trim();
                }
                inputTitle.value = rawText;
                inputEst.value = t.est;
            }
        } else {
            inputTitle.value = "";
            inputEst.value = 1;
        }
        inputTitle.focus();
    }

    function hideTaskForm() {
        document.getElementById('add-task-trigger').classList.remove('hidden');
        document.getElementById('task-form-panel').classList.add('hidden');
        State.set('editingTaskIndex', -1);
    }

    function adjPomo(delta) {
        const inp = document.getElementById('new-task-est');
        let val = parseInt(inp.value) || 1;
        inp.value = Math.max(1, val + delta);
    }

    function saveNewTask() {
        const t = document.getElementById('new-task-title').value.trim();
        const est = parseInt(document.getElementById('new-task-est').value) || 1;
        const projInput = document.getElementById('new-task-project');
        const proj = projInput ? projInput.value : "";
        
        if (!t) return;
        
        const tag = proj ? `[${proj}]` : ""; 
        const taskText = tag ? `${t} ${tag}` : t;
        
        const list = State.get('taskList') || [];
        const editIdx = State.get('editingTaskIndex');
        
        if (editIdx >= 0 && editIdx < list.length) {
            // Actualización In-Place
            list[editIdx].text = taskText;
            list[editIdx].est = est;
        } else {
            // Inserción nueva
            list.push({ text: taskText, est: est, completed: 0, active: false, done: false });
        }
        
        State.set('taskList', list);
        saveTasks();
        renderTasks(); 
        hideTaskForm(); 
    }

    /**
     * @function updateFinishTime
     * @description Orquesta el cálculo delegando el renderizado a la capa de UI
     * y manteniendo el layout aislado del mini-widget.
     */
    function updateFinishTime() {
        try {
            const tasks = State.get('taskList') || [];
            const config = State.get('pomoSettings') || {};
            const ciclos = State.get('pomoCycles') || 0;
            const stateTime = State.get('timeLeft');

            const currentMode = State.get('currentMode') || 'work';
            const timeLeftSeconds = (stateTime !== undefined && stateTime !== null) 
                ? Number(stateTime) 
                : (Number(config.work) || 25) * 60;

            // 1. Cálculo de pomodoros pendientes
            let pomosRestantes = 0;
            tasks.forEach(t => {
                if (!t.done) {
                    const est = Number(t.est !== undefined ? t.est : t.pomos) || 1;
                    const comp = Number(t.completed) || 0;
                    const pendientes = est - comp;
                    if (pendientes > 0) pomosRestantes += pendientes;
                }
            });

            // 2. Cálculo de hora de fin vía Dominio
            let horaFin = null;
            if (typeof Domain !== 'undefined' && Domain.calcularHoraFinPomodoro) {
                horaFin = Domain.calcularHoraFinPomodoro(
                    tasks, config, ciclos, currentMode, timeLeftSeconds
                );
            }

            // 3. ACTUALIZACIÓN DE UI PRINCIPAL (Pasa los 2 argumentos correctamente)
            const wMin = Number((config || {}).work) || 25;
            const sMin = Number((config || {}).short) || 5;
            const totalMin = pomosRestantes * wMin + Math.max(0, pomosRestantes - 1) * sMin;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            const tiempoStr = pomosRestantes > 0 ? (h > 0 ? `~${h}h ${m}m` : `${m}min`) : null;

            if (typeof UI !== 'undefined' && UI.updateFinishTime) {
                UI.updateFinishTime(pomosRestantes, horaFin, tiempoStr);
            }

            // 4. RESTAURACIÓN DEL MINI-WIDGET VISUAL
            const miniCount = document.getElementById('mini-pomo-count');
            const miniTime  = document.getElementById('mini-finish-time');
            
            if (miniCount) {
                miniCount.innerText = pomosRestantes > 0 ? `${pomosRestantes}🍅` : '';
            }
            
            if (miniTime) {
                // Si hay pomodoros y la hora no devolvió error
                if (pomosRestantes > 0 && horaFin && horaFin !== "ERROR") {
                    // HTML original restaurado con el icono FontAwesome y flexbox
                    miniTime.innerHTML = `
                        <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:12px;">
                            <div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:var(--accent);border-radius:4px;">
                                <i class="fa-solid fa-plane-arrival" style="font-size:10px;color:#121212;"></i>
                            </div>
                            <span style="color:var(--accent);font-weight:bold;">${horaFin}</span>
                        </div>`;
                } else {
                    miniTime.innerHTML = '';
                }
            }

        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error("Fallo al actualizar hora de fin:", error);
        }
    }

    /**
     * @function renderTasks
     * @description Instruye a la vista para dibujar e inyecta los manejadores de eventos (incluyendo edición).
     */
    function renderTasks() {
        try {
            const tasks = State.get('taskList') || [];
            
            if (typeof UI !== 'undefined' && UI.renderTasks) {
                UI.renderTasks(tasks, {
                    onToggleActive: (idx) => {
                        toggleActive(idx);
                        if (typeof window.updatePomoStats === 'function') window.updatePomoStats();
                    },
                    onToggleDone: (idx) => {
                        toggleDone(idx);
                    },
                    onDelete: (idx) => {
                        deleteTask(idx);
                    },
                    onEdit: (idx) => {
                        // FIX: Soporte para el botón de edición
                        if (typeof editTask === 'function') editTask(idx);
                    }
                });
            }
            
            updateFinishTime();
            
            if (typeof UI !== 'undefined' && UI.actualizarDesplegableMini) {
                UI.actualizarDesplegableMini(tasks);
            }
        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error("El flujo de renderTasks fue interrumpido:", error);
        }
    }

    function activarTareaDesdeMini(indexStr) {
        const idx = parseInt(indexStr);
        const list = State.get('taskList') || [];
        if (idx === -1) {
            list.forEach(t => t.active = false);
            State.set('taskList', list);
            saveTasks();
            renderTasks();
        } else if (idx >= 0 && list[idx]) {
            toggleActive(idx);
        }
    }
    
    function toggleActive(i) {
        const list = State.get('taskList') || [];
        
        // Optimización O(1) de memoria. No iterar toda la matriz.
        const prevIdx = list.findIndex(t => t.active);
        if (prevIdx !== -1 && prevIdx !== i) list[prevIdx].active = false;
        
        if (list[i]) list[i].active = !list[i].active; 
        
        State.set('taskList', list);
        saveTasks(); 
        renderTasks();
    }

    function toggleDone(i) {
        const list = State.get('taskList') || [];
        if (list[i]) list[i].done = !list[i].done; 
        State.set('taskList', list);
        saveTasks(); 
        renderTasks();
    }

    function editTask(i, ev) {
        if (ev) ev.stopPropagation();
        // Cero diálogos nativos. Delegación pura a la UI construida.
        showTaskForm(i);
    }

    function deleteTask(i) {
        const list = State.get('taskList') || [];
        list.splice(i, 1); 
        State.set('taskList', list);
        saveTasks(); 
        renderTasks();
    }

    function saveTasks() {
        localStorage.setItem('pomo_tasks', JSON.stringify(State.get('taskList')));
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('STATE_CHANGED', { keys: ['taskList'] });
        }
    }

    return {
        setMode, toggleTimer, finishPomodoro,
        showTaskForm, hideTaskForm, adjPomo, saveNewTask, renderTasks, updateFinishTime,
        activarTareaDesdeMini, toggleActive, toggleDone, editTask, deleteTask
    };
})();

// Delegación a window para los event listeners del DOM
window.setPomoMode = POMODORO.setMode;
window.toggleTimer = POMODORO.toggleTimer;
window.finishPomodoro = POMODORO.finishPomodoro;
window.showTaskForm = POMODORO.showTaskForm;
window.hideTaskForm = POMODORO.hideTaskForm;
window.adjPomo = POMODORO.adjPomo;
window.saveNewTask = POMODORO.saveNewTask;
window.renderTasks = POMODORO.renderTasks;
window.updateFinishTime = POMODORO.updateFinishTime;
window.activarTareaDesdeMini = POMODORO.activarTareaDesdeMini;
window.toggleActive = POMODORO.toggleActive;
window.toggleDone = POMODORO.toggleDone;
window.editTask = POMODORO.editTask;
window.deleteTask = POMODORO.deleteTask;