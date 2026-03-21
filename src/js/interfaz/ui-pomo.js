// ════════════════════════════════════════════════════════════════
// UI-POMO.JS — Widgets del Pomodoro: timer, tareas, finish time
// ════════════════════════════════════════════════════════════════

const UIPomo = (() => {

    function updateTimerDisplay(segsLeft, mode) {
        const m       = Math.floor(segsLeft / 60).toString().padStart(2, '0');
        const s       = (segsLeft % 60).toString().padStart(2, '0');
        const timeStr = `${m}:${s}`;

        const bigTimer  = document.getElementById('timer-display');
        const miniTimer = document.getElementById('mini-timer-display');
        if (bigTimer)  bigTimer.innerText  = timeStr;
        if (miniTimer) miniTimer.innerText = timeStr;

        document.title = `${timeStr} - ${mode === 'work' ? 'Work' : 'Break'}`;
    }

    function updateFinishTime(remainingPomos, horaStr, tiempoStr) {
        const emptyMsg      = document.getElementById('pomo-empty-msg');
        const statusContent = document.getElementById('pomo-status-content');
        const remainCount   = document.getElementById('pomo-remain-count');
        const tiempoEl      = document.getElementById('pomo-remain-time');
        const etaValue      = document.getElementById('pomo-eta-value');
        const faltan        = Number(remainingPomos) || 0;

        if (faltan <= 0) {
            if (emptyMsg)      emptyMsg.style.display      = 'block';
            if (statusContent) statusContent.style.display = 'none';
        } else {
            if (emptyMsg)      emptyMsg.style.display      = 'none';
            if (statusContent) statusContent.style.display = 'block';
            if (remainCount)   remainCount.textContent     = `${faltan}🍅`;
            if (tiempoEl)      tiempoEl.textContent        = tiempoStr || '--';
            if (etaValue)      etaValue.textContent        = horaStr   || '--:--';
        }
    }

    function renderPomoModo(modo) {
        const colors = { work: 'var(--pomo-work)', short: 'var(--pomo-short)', long: 'var(--pomo-long)' };
        const labels = { work: 'POMODORO', short: 'DESCANSO CORTO', long: 'DESCANSO LARGO' };
        const activeColor = colors[modo] || colors.work;

        const bigBtn = document.getElementById('btn-pomo-action');
        if (bigBtn) {
            bigBtn.style.color       = activeColor;
            bigBtn.style.borderColor = activeColor;
            bigBtn.innerHTML         = '&#9658;&#9658;';
        }

        document.querySelectorAll('.pomo-btn-mode').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-mode-' + modo)?.classList.add('active');

        const miniWidget = document.getElementById('mini-pomo-widget');
        const miniLabel  = document.getElementById('mini-mode-label');
        const miniBtn    = document.getElementById('mini-btn-toggle');
        const pomoIcon   = document.querySelector('#btn-abrirmodalpomodoro i');

        if (miniWidget) miniWidget.style.borderTopColor = activeColor;
        if (miniLabel)  { miniLabel.innerText = labels[modo] || ''; miniLabel.style.color = activeColor; }
        if (miniBtn)    { miniBtn.style.color = activeColor; miniBtn.innerHTML = '&#9658;'; }
        if (pomoIcon)   { pomoIcon.style.color = activeColor; pomoIcon.style.transition = 'color 0.3s ease'; }
    }

    function renderTimerEstado(isRunning) {
        const pauseIcon = '<i class="fa-solid fa-pause"></i>';
        const bigBtn    = document.getElementById('btn-pomo-action');
        const miniBtn   = document.getElementById('mini-btn-toggle');
        if (bigBtn)  bigBtn.innerHTML  = isRunning ? pauseIcon : '&#9658;&#9658;';
        if (miniBtn) miniBtn.innerHTML = isRunning ? pauseIcon : '&#9658;';
    }

    function renderCycleInfo(ciclos, ciclosMax, modo) {
        const el = document.getElementById('mini-cycle-info');
        if (!el) return;
        const faltan = ciclosMax - (ciclos % ciclosMax);
        if (modo !== 'work') {
            el.innerHTML   = 'En descanso';
            el.style.color = 'var(--text-muted)';
        } else if (faltan === 1) {
            el.innerHTML   = 'Siguiente: <strong>LARGO</strong>';
            el.style.color = 'var(--accent)';
        } else {
            el.innerHTML   = `Largo en: <strong>${faltan}</strong> pomos`;
            el.style.color = 'var(--text-subtle)';
        }
    }

    function renderTaskForm(visible, taskData = null) {
        const trigger = document.getElementById('add-task-trigger');
        const panel   = document.getElementById('task-form-panel');
        if (!trigger || !panel) return;

        if (!visible) {
            trigger.classList.remove('hidden');
            panel.classList.add('hidden');
            return;
        }

        trigger.classList.add('hidden');
        panel.classList.remove('hidden');

        const inputTitle = document.getElementById('new-task-title');
        const inputEst   = document.getElementById('new-task-est');
        const projSelect = document.getElementById('new-task-project');

        if (taskData) {
            let rawText    = taskData.text || '';
            const matchTag = rawText.match(/\[([^\]]+)\]$/);
            if (matchTag && projSelect) {
                projSelect.value = matchTag[1];
                rawText = rawText.replace(/\[([^\]]+)\]$/, '').trim();
            }
            if (inputTitle) inputTitle.value = rawText;
            if (inputEst)   inputEst.value   = taskData.est || 1;
        } else {
            if (inputTitle) inputTitle.value = '';
            if (inputEst)   inputEst.value   = 1;
            if (projSelect) projSelect.value = '';
        }

        if (inputTitle) inputTitle.focus();
    }

    function renderMiniWidget(pomosRestantes, horaFin) {
        const miniCount = document.getElementById('mini-pomo-count');
        const miniTime  = document.getElementById('mini-finish-time');

        if (miniCount) miniCount.innerText = pomosRestantes > 0 ? `${pomosRestantes}🍅` : '';
        if (!miniTime) return;

        if (pomosRestantes > 0 && horaFin && horaFin !== 'ERROR') {
            miniTime.innerHTML = `
                <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:12px;">
                    <div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:var(--accent);border-radius:4px;">
                        <i class="fa-solid fa-plane-arrival" style="font-size:10px;color:#121212;"></i>
                    </div>
                    <span style="color:var(--accent);font-weight:bold;">${escapeHtml(horaFin)}</span>
                </div>`;
        } else {
            miniTime.innerHTML = '';
        }
    }

    function actualizarDesplegableMini(lista) {
        const select = document.getElementById('mini-task-select');
        if (!select) return;

        const currentActive = lista.findIndex(t => t.active);
        select.innerHTML    = '<option value="-1">-- Sin tarea activa --</option>';

        lista.forEach((t, index) => {
            if (!t.done) {
                const opt      = document.createElement('option');
                opt.value      = index;
                opt.text       = t.text.length > 40 ? t.text.substring(0, 38) + '...' : t.text;
                if (t.active) {
                    opt.selected          = true;
                    select.style.borderColor = 'var(--accent)';
                    select.style.color       = 'var(--text-main)';
                }
                select.appendChild(opt);
            }
        });

        if (currentActive === -1) {
            select.style.borderColor = 'var(--border)';
            select.style.color       = 'var(--text-muted)';
            select.value             = '-1';
        }
    }

    function renderTasks(tasks, callbacks = {}) {
        try {
            const list = document.getElementById('task-list');
            if (!list) return;

            list.innerHTML = '';
            if (!tasks || tasks.length === 0) {
                list.innerHTML = '<li style="text-align:center;color:var(--text-muted);padding:10px;font-size:0.9em;">Sin tareas</li>';
                return;
            }

            const fragment = document.createDocumentFragment();

            tasks.forEach((t, i) => {
                let colorTema = 'var(--text-muted)';
                const match   = t.text.match(/\[(.*?)\]/);
                if (match) {
                    let rawTag = match[1].replace(/#/g, '').trim();
                    if (rawTag.includes(':')) rawTag = rawTag.split(':').pop().trim();
                    if (typeof window.getColorAsignatura === 'function') colorTema = window.getColorAsignatura(rawTag);
                }

                const li = document.createElement('li');
                li.style.setProperty('--task-color', colorTema);
                li.className = `task-item ${t.active ? 'active-task' : ''} ${t.done ? 'done' : ''}`;

                const safeText = escapeHtml(String(t.text || 'Sin título'));
                const comp     = Number(t.completed) || 0;
                const est      = Number(t.est)        || 1;

                li.innerHTML = `
                    <div style="flex-grow:1;display:flex;flex-direction:column;pointer-events:none;">
                        <span style="color:${t.done ? 'var(--text-muted)' : 'var(--text-main)'};font-weight:500;">${safeText}</span>
                        <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);margin-top:5px;border-radius:2px;overflow:hidden;">
                            <div style="height:100%;background:${colorTema};width:${Math.min(100, (comp / est) * 100)}%;transition:width 0.3s;"></div>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;margin-left:15px;z-index:2;">
                        <span style="color:${colorTema};font-weight:bold;font-size:0.9em;">${comp}/${est}</span>
                        <div style="display:flex;gap:5px;margin-top:4px;opacity:0.6;transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.6">
                            <button data-action="editTask"   style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1em;" title="Modificar"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button data-action="toggleDone" style="background:none;border:none;color:${t.done ? 'var(--status-green)' : 'var(--text-muted)'};cursor:pointer;font-size:1.1em;">&check;</button>
                            <button data-action="deleteTask" style="background:none;border:none;color:var(--status-red);cursor:pointer;font-size:1.1em;">✕</button>
                        </div>
                    </div>`;

                li.onclick = (e) => {
                    const btn = e.target.closest('button');
                    if (btn) {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        if      (action === 'deleteTask'  && callbacks.onDelete)       callbacks.onDelete(i);
                        else if (action === 'toggleDone'  && callbacks.onToggleDone)   callbacks.onToggleDone(i);
                        else if (action === 'editTask'    && callbacks.onEdit)         callbacks.onEdit(i);
                    } else {
                        if (callbacks.onToggleActive) callbacks.onToggleActive(i);
                    }
                };

                fragment.appendChild(li);
            });

            list.appendChild(fragment);
        } catch (error) {
            Logger.error('UIPomo.renderTasks:', error);
        }
    }

    return {
        updateTimerDisplay,
        updateFinishTime,
        renderPomoModo,
        renderTimerEstado,
        renderCycleInfo,
        renderTaskForm,
        renderMiniWidget,
        actualizarDesplegableMini,
        renderTasks,
    };
})();
