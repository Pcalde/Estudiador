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

        const colors = {'work':'#d95550', 'short':'#4c9195', 'long':'#457ca3'};
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
        const ciclosHechos = ciclos % 4;
        const faltan = 4 - ciclosHechos;
        
        const infoElem = document.getElementById('mini-cycle-info');
        if(infoElem) {
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

        interval = setInterval(() => {
            let left = State.get('timeLeft') - 1;
            State.set('timeLeft', left);
            updateTimerDisplay();
            if(left <= 0) finishPomodoro();
        }, 1000);
        State.set('timerInterval', interval);
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

    function updateTimerDisplay() {
        UI.updateTimerDisplay(State.get('timeLeft'), State.get('currentMode'));
    }

    function finishPomodoro() {
        pauseTimer();
        _playAlarm();

        let modoActual = State.get('currentMode');
        let nextMode = 'work';
        let asignaturaParaRegistro = "General"; 

        if (modoActual === 'work') {
            const list = State.get('taskList') || [];
            const idx = list.findIndex(t => t.active);
            
            if(idx !== -1) { 
                list[idx].completed++; 
                saveTasks(); 
                
                const match = list[idx].text.match(/\[(.*?)\]/);
                if (match) {
                    let rawTag = match[1].replace(/#/g, '').trim(); 
                    if (rawTag.includes(':')) {
                        const partes = rawTag.split(':');
                        const posible = partes[partes.length - 1].trim();
                        if (_esAsignaturaValida(posible)) asignaturaParaRegistro = posible;
                    } else {
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
                }
            }
            
            // Emitir evento de dominio en lugar de llamar a app.js directamente
            const evento = new CustomEvent('pomodoro:finished', { 
                detail: { asignatura: asignaturaParaRegistro } 
            });
            document.dispatchEvent(evento);
            
            let ciclos = (State.get('pomoCycles') || 0) + 1;
            State.set('pomoCycles', ciclos);
            if (ciclos > 0 && ciclos % 4 === 0) nextMode = 'long';
            else nextMode = 'short';

        } else {
            nextMode = 'work';
        }

        document.title = "🔔 " + (nextMode === 'work' ? "WORK" : "BREAK");
        setMode(nextMode);

        const settings = State.get('pomoSettings');
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

    function _playAlarm() {
        const audio = document.getElementById('alarm-audio');
        if(audio) {
            const promesa = audio.play();
            if (promesa !== undefined) {
                promesa.catch(error => {
                    if(typeof Logger !== 'undefined') Logger.warn("Fallo audio, usando fallback.", error);
                    _generarBeep();
                });
            }
        } else _generarBeep();
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

    function showTaskForm() {
        document.getElementById('add-task-trigger').classList.add('hidden');
        document.getElementById('task-form-panel').classList.remove('hidden');
        document.getElementById('new-task-title').focus();
    }

    function hideTaskForm() {
        document.getElementById('add-task-trigger').classList.remove('hidden');
        document.getElementById('task-form-panel').classList.add('hidden');
        document.getElementById('new-task-title').value = "";
        document.getElementById('new-task-est').value = 1;
    }

    function adjPomo(delta) {
        const inp = document.getElementById('new-task-est');
        let val = parseInt(inp.value) || 1;
        inp.value = Math.max(1, val + delta);
    }

    function saveNewTask() {
        const t = document.getElementById('new-task-title').value;
        const est = parseInt(document.getElementById('new-task-est').value) || 1;
        const proj = document.getElementById('new-task-project').value;
        
        if(!t || t.trim() === "") return;
        
        const tag = proj ? `[${proj}]` : ""; 
        const taskText = tag ? `${t} ${tag}` : t;
        
        const list = State.get('taskList') || [];
        list.push({ text: taskText, est: est, completed: 0, active: false, done: false });
        State.set('taskList', list);
        saveTasks();
        renderTasks(); 
        hideTaskForm(); 
    }

    function renderTasks() { 
        const list = State.get('taskList') || [];
        UI.renderTasks(list); 
        UI.updateFinishTime(list, State.get('pomoSettings'));
        UI.actualizarDesplegableMini(list);
    }

    function updateFinishTime() { UI.updateFinishTime(State.get('taskList') || [], State.get('pomoSettings')); }

    function activarTareaDesdeMini(indexStr) {
        const idx = parseInt(indexStr);
        const list = State.get('taskList') || [];
        if (idx === -1) {
            list.forEach(t => t.active = false);
        } else if (idx >= 0 && list[idx]) {
            toggleActive(idx);
            return; 
        }
        State.set('taskList', list);
        saveTasks();
        renderTasks();
    }
    
    function toggleActive(i) {
        const list = State.get('taskList') || [];
        list.forEach((t,x) => t.active = (x === i)); 
        State.set('taskList', list);
        saveTasks(); renderTasks();
    }

    function toggleDone(i) {
        const list = State.get('taskList') || [];
        list[i].done = !list[i].done; 
        State.set('taskList', list);
        saveTasks(); renderTasks();
    }

    function editTask(i, ev) {
        if(ev) ev.stopPropagation();
        const list = State.get('taskList') || [];
        const t = list[i];
        
        const nuevoTexto = prompt("Editar nombre de la tarea:", t.text);
        if (nuevoTexto === null) return; 
        
        const nuevaEst = prompt("Editar estimación de Pomodoros:", t.est);
        if (nuevaEst === null) return; 

        const estInt = parseInt(nuevaEst);
        if (nuevoTexto.trim() !== "" && !isNaN(estInt) && estInt > 0) {
            t.text = nuevoTexto;
            t.est = estInt;
            State.set('taskList', list);
            saveTasks();
            renderTasks();
        } else {
            alert("Datos inválidos. La estimación debe ser un número mayor a 0.");
        }
    }

    function deleteTask(i) {
        const list = State.get('taskList') || [];
        list.splice(i,1); 
        State.set('taskList', list);
        saveTasks(); renderTasks();
    }

    function saveTasks() {
        localStorage.setItem('pomo_tasks', JSON.stringify(State.get('taskList')));
        const evt = new CustomEvent('pomodoro:tasksUpdated');
        document.dispatchEvent(evt);
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