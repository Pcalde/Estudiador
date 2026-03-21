// ════════════════════════════════════════════════════════════════
// UI-DASHBOARD.JS — Widgets del panel de estadísticas
// ════════════════════════════════════════════════════════════════

const UIDashboard = (() => {

    function updateDifficultyStats(counts, prevSnap, total, pendientesHoy) {
        const elTotal = document.getElementById('total-cards-count');
        const elHoy   = document.getElementById('today-cards-count');
        if (elTotal) elTotal.innerText = escapeHtml(String(total || 0));
        if (elHoy)   elHoy.innerText   = escapeHtml(String(pendientesHoy || 0));

        const labels = { 0:'Nuevas', 1:'Fáciles', 2:'Bien', 3:'Difíciles', 4:'Críticas' };
        const colors = {
            0: 'var(--border)',
            1: 'var(--status-blue)',
            2: 'var(--status-green)',
            3: 'var(--status-yellow)',
            4: 'var(--status-red)'
        };

        let html = '';
        [0, 4, 3, 2, 1].forEach(k => {
            const val = counts[k] || 0;
            const pct = total > 0 ? (val / total) * 100 : 0;
            let deltaHtml = '<span class="diff-delta neutral">—</span>';
            if (prevSnap) {
                const diff = val - (prevSnap[k] || 0);
                if      (diff > 0) deltaHtml = `<span class="diff-delta up">+${escapeHtml(String(diff))}</span>`;
                else if (diff < 0) deltaHtml = `<span class="diff-delta down">${escapeHtml(String(diff))}</span>`;
                else               deltaHtml = `<span class="diff-delta neutral">·</span>`;
            }
            html += `
                <div class="diff-bar-row">
                    <div class="diff-label">${labels[k]}</div>
                    <div class="diff-track">
                        <div class="diff-fill" style="width:${pct}%;background:${colors[k]};transition:width 0.3s ease;"></div>
                    </div>
                    <div class="diff-val">${escapeHtml(String(val))}</div>
                    ${deltaHtml}
                </div>`;
        });

        const containerBars = document.getElementById('dist-bars');
        if (containerBars) containerBars.innerHTML = html;
    }

    function updateGlobalStats(streak, totalDiasActivos, msgActividad) {
        const elStreak = document.getElementById('global-streak');
        const elTotal  = document.getElementById('global-total-days');
        const elMsg    = document.getElementById('global-activity-msg');
        if (elStreak) elStreak.innerText = escapeHtml(String(streak || 0));
        if (elTotal)  elTotal.innerText  = escapeHtml(String(totalDiasActivos || 0));
        if (elMsg)    elMsg.innerText    = escapeHtml(String(msgActividad || ''));
    }

    function updateCalendarHeatmap(bib, asigActual, fechas, viewDate) {
        const container = document.getElementById('calendar-heatmap');
        const title     = document.getElementById('calendar-month-title');
        if (!container) return;

        container.innerHTML = '';

        container.onmouseleave = () => {
            if (typeof updatePendingWindow === 'function') {
                updatePendingWindow(undefined);  
            }
        };
        container.onmouseover = (e) => {
            const dayDiv = e.target.closest('.heatmap-day[data-interactive="true"]');
            if (!dayDiv) return;
            const dStr = dayDiv.getAttribute('data-date');
            if (!dStr) return;
            if (typeof updatePendingWindow === 'function') updatePendingWindow(dStr);

            // Scroll al widget de pendientes si no es visible
            const widget = document.getElementById('widget-pendientes');
            if (widget) {
                const rect = widget.getBoundingClientRect();
                const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
                if (!isVisible) widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };

        const year   = viewDate.getFullYear();
        const month  = viewDate.getMonth();
        const monthNames = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        if (title) title.innerText = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1);
        const lastDay  = new Date(year, month + 1, 0);
        let startDay   = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;
        const numDays  = lastDay.getDate();

        const todayStr = getFechaHoy();
        const todayVal = fechaValor(todayStr);

        let doneCount = {}, missedCount = {}, futureCount = {};

        if (asigActual && bib[asigActual]) {
            bib[asigActual].forEach(c => {
                if (c.UltimoRepaso) {
                    const ultISO = toISODateString(c.UltimoRepaso);
                    doneCount[ultISO] = (doneCount[ultISO] || 0) + 1;
                }
                if (c.ProximoRepaso) {
                    const pISO = toISODateString(c.ProximoRepaso);
                    const pVal = fechaValor(c.ProximoRepaso);
                    if (pVal < todayVal) {
                        const repasada = c.UltimoRepaso && fechaValor(c.UltimoRepaso) >= pVal;
                        if (!repasada) missedCount[pISO] = (missedCount[pISO] || 0) + 1;
                    } else if (pVal > todayVal) {
                        futureCount[pISO] = (futureCount[pISO] || 0) + 1;
                    }
                }
            });
        }

        let eventMap = {};
        (fechas || []).forEach(ev => {
            const evISO = toISODateString(ev.fecha);
            if (!eventMap[evISO]) eventMap[evISO] = [];
            eventMap[evISO].push(ev);
        });

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < startDay; i++) {
            const pad = document.createElement('div');
            pad.className = 'heatmap-day';
            pad.style.cssText = 'background:transparent;border:none;pointer-events:none;';
            fragment.appendChild(pad);
        }

        for (let i = 1; i <= numDays; i++) {
            const dStr   = toISODateString(new Date(year, month, i));
            const dVal   = fechaValor(dStr);
            const div    = document.createElement('div');
            div.className = 'heatmap-day';
            div.innerText = i;
            div.setAttribute('data-date', dStr);

            const done   = doneCount[dStr]   || 0;
            const missed = missedCount[dStr]  || 0;
            const future = futureCount[dStr]  || 0;

            let estado = 'vacio';
            if (dVal < todayVal) {
                if      (done > 0 && missed > 0) estado = 'mixed';
                else if (missed > 0)              estado = 'missed';
                else if (done > 0)                estado = 'done';
            } else if (dVal === todayVal) {
                estado = done > 0 ? 'today-done' : 'today';
            } else if (future > 0) {
                estado = 'future';
            }

            switch (estado) {
                case 'done':       div.classList.add('day-past-done'); break;
                case 'missed':     div.classList.add('day-past-missed'); break;
                case 'mixed':      div.classList.add('day-past-done'); div.style.boxShadow = 'inset 0 -3px 0 var(--status-red)'; break;
                case 'today':      div.classList.add('day-today-indicator'); break;
                case 'today-done': div.classList.add('day-today-indicator', 'day-today-active'); break;
                case 'future':     div.classList.add('day-future-pending'); break;
            }

            let tipLines = [formatDateForUI(dStr)];
            if (done > 0)                       tipLines.push(`✓ ${done} repasadas`);
            if (missed > 0)                     tipLines.push(`⚠ ${missed} pendientes`);
            if (future > 0)                     tipLines.push(`📅 ${future} programadas`);
            if (dVal === todayVal && done === 0) tipLines.push('Hoy · sin repasos aún');

            const eventos = eventMap[dStr] || [];
            if (eventos.length > 0) {
                const weights = { dominant: 3, strong: 2, subtle: 1 };
                const ev   = eventos.reduce((a, b) => (weights[TIPOS_EVENTO[a.tipo]?.weight] || 0) >= (weights[TIPOS_EVENTO[b.tipo]?.weight] || 0) ? a : b);
                const tipo = TIPOS_EVENTO[ev.tipo] || TIPOS_EVENTO.otro;
                const color = getColorEvento(ev);

                if (tipo.weight === 'dominant') {
                    div.className    = 'heatmap-day';
                    div.style.background   = color;
                    div.style.color        = '#fff';
                    div.style.fontWeight   = 'bold';
                    div.style.boxShadow    = `0 0 8px ${color}99`;
                    div.style.outline      = `2px solid ${color}`;
                    div.style.outlineOffset = '-2px';
                } else if (tipo.weight === 'strong') {
                    div.style.background = color;
                    div.style.color      = '#fff';
                    div.style.fontWeight = 'bold';
                    if      (estado === 'missed' || estado === 'mixed')      div.style.boxShadow = `inset 0 -4px 0 var(--status-red)`;
                    else if (estado === 'done'   || estado === 'today-done') div.style.boxShadow = `inset 0 -4px 0 var(--status-blue)`;
                    else                                                      div.style.boxShadow = `0 0 5px ${color}88`;
                } else {
                    const dot = document.createElement('span');
                    dot.className      = 'event-dot';
                    dot.style.background = color;
                    div.appendChild(dot);
                }
                eventos.forEach(e => tipLines.push(`★ ${escapeHtml(e.nombre)}${e.asig ? ' · ' + escapeHtml(e.asig) : ''}`));
            }

            div.setAttribute('data-tip', tipLines.join('\n'));
            if (estado !== 'vacio' || eventos.length > 0) div.setAttribute('data-interactive', 'true');

            fragment.appendChild(div);
        }

        container.appendChild(fragment);
    }

    function updatePronostico(counts, maxCount) {
        const container = document.getElementById('pronostico-bars');
        if (!container) return;

        container.innerHTML = '';
        if (!counts || counts.length === 0) {
            container.innerHTML = "<div style='color:var(--text-muted);font-size:0.85em;text-align:center;'>Sin datos para pronóstico</div>";
            return;
        }

        const fragment = document.createDocumentFragment();
        counts.forEach(c => {
            const h        = Math.max((c.count / maxCount) * 100, 2);
            let barColor   = 'var(--border)';
            if      (c.isToday)    barColor = 'var(--accent)';
            else if (c.count > 20) barColor = 'var(--status-red)';
            else if (c.count > 0)  barColor = 'var(--status-blue)';

            const col = document.createElement('div');
            col.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;flex:1;';
            col.innerHTML = `
                <span style="font-size:0.65em;margin-bottom:4px;color:var(--text-muted);">${c.count > 0 ? escapeHtml(c.count) : ''}</span>
                <div style="width:60%;height:${h}%;background:${barColor};border-radius:3px 3px 0 0;min-height:4px;transition:height 0.3s ease;"></div>
                <span style="font-size:0.6em;margin-top:4px;color:${c.isToday ? 'var(--text-main)' : 'var(--text-muted)'};font-weight:${c.isToday ? 'bold' : 'normal'};">${escapeHtml(c.dayLabel)}</span>
            `;
            fragment.appendChild(col);
        });
        container.appendChild(fragment);
    }

    function updateDeudaEstudio(deudaTotal, contadores, deudaDesglose) {
        const scoreEl = document.getElementById('deuda-score');
        const listEl  = document.getElementById('deuda-list');
        if (!scoreEl || !listEl) return;

        const dt = Math.round((deudaTotal || 0) * 10) / 10;
        scoreEl.innerText   = dt;
        scoreEl.style.color = dt === 0
            ? 'var(--status-green)'
            : dt < 10 ? 'var(--status-yellow)' : 'var(--status-red)';

        const fmt = (v) => (Math.round((v || 0) * 10) / 10).toFixed(1);
        listEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-leaf" style="color:var(--status-green)"></i> Nuevas (${escapeHtml(contadores.nuevas || 0)})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.nuevas)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-book-open" style="color:var(--status-blue)"></i> Aprendizaje (${escapeHtml(contadores.learning || 0)})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.learning)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-rotate-right" style="color:var(--text-main)"></i> Repaso (${escapeHtml(contadores.repasoNormal || 0)})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.repasoNormal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-triangle-exclamation" style="color:var(--status-red)"></i> Críticas (${escapeHtml(contadores.criticas || 0)})</span>
                <span style="font-weight:bold;color:var(--status-red);">${fmt(deudaDesglose.criticas)}</span>
            </div>`;
    }

    function updateEficienciaWidget(bib, asigActual, pomoLogHoy) {
        const elTarjetas  = document.getElementById('ef-tarjetas');
        const elRatio     = document.getElementById('ef-ratio');
        const elFacilidad = document.getElementById('ef-facilidad');
        const elSesiones  = document.getElementById('ef-sesiones');
        if (!elTarjetas) return;

        const todayStr = getFechaHoy();
        let todayLog   = pomoLogHoy || { count: 0, details: {} };
        if (todayLog.date !== todayStr) todayLog = { count: 0, details: {} };

        let pomosHoy = 0, tarjetasRepasadasHoy = 0, tarjetasFacilesHoy = 0;

        if (asigActual && bib[asigActual]) {
            const asigNorm = asigActual.toLowerCase().trim();
            Object.keys(todayLog.details || {}).forEach(k => {
                if (k.toLowerCase().trim() === asigNorm) pomosHoy += todayLog.details[k];
            });
            bib[asigActual].forEach(c => {
                if (c.UltimoRepaso && toISODateString(c.UltimoRepaso) === todayStr) {
                    tarjetasRepasadasHoy++;
                    if (parseInt(c.Dificultad) === 1) tarjetasFacilesHoy++;
                }
            });
        } else {
            pomosHoy = todayLog.count || 0;
            Object.keys(bib).forEach(asig => {
                bib[asig].forEach(c => {
                    if (c.UltimoRepaso && toISODateString(c.UltimoRepaso) === todayStr) {
                        tarjetasRepasadasHoy++;
                        if (parseInt(c.Dificultad) === 1) tarjetasFacilesHoy++;
                    }
                });
            });
        }

        const ratio    = pomosHoy > 0 ? (tarjetasRepasadasHoy / pomosHoy).toFixed(1) : (tarjetasRepasadasHoy > 0 ? tarjetasRepasadasHoy : '-');
        const pctFacil = tarjetasRepasadasHoy > 0 ? Math.round((tarjetasFacilesHoy / tarjetasRepasadasHoy) * 100) + '%' : '-';

        elTarjetas.innerText  = tarjetasRepasadasHoy;
        elRatio.innerText     = ratio;
        elFacilidad.innerText = pctFacil;
        elSesiones.innerText  = pomosHoy;
    }

    function updateWeeklyWidget(horario, bib, viewMode, pomoHistory, pomoLogHoy, pomoDetailsHistory) {
        const container = document.getElementById('weekly-chart-container');
        if (!container) return;

        container.innerHTML = '';
        const history  = pomoHistory || {};
        const todayLog = pomoLogHoy  || {};
        const todayStr = getFechaHoy();
        const days     = viewMode === '28d' ? 28 : 7;
        let totalPomos = 0, daysMetGoal = 0;

        container.onclick = function(e) {
            const col = e.target.closest('.weekly-col-item');
            if (!col) return;
            document.querySelectorAll('.bar-popup').forEach(p => p.remove());

            const dateStr  = col.getAttribute('data-date');
            const logEntry = dateStr === todayStr ? (todayLog.date === todayStr ? todayLog : null) : null;
            const details  = logEntry ? logEntry.details : (pomoDetailsHistory[dateStr] || {});
            const valNum   = parseInt(col.getAttribute('data-val')  || '0', 10);
            const goalNum  = parseInt(col.getAttribute('data-goal') || '0', 10);

            let popupHtml = `<strong>${dateStr}</strong><br>${valNum}/${goalNum} pomos<br>`;
            if (Object.keys(details).length > 0) {
                Object.entries(details).forEach(([asig, n]) => { popupHtml += `${escapeHtml(asig)}: ${n}<br>`; });
            } else {
                popupHtml += 'Sin desglose';
            }
            const popup = document.createElement('div');
            popup.className = 'bar-popup';
            popup.innerHTML = popupHtml;
            col.style.position = 'relative';
            col.appendChild(popup);
            setTimeout(() => popup.remove(), 3000);
        };

        let allVals = [];
        for (let i = days - 1; i >= 0; i--) {
            const d    = new Date(); d.setDate(d.getDate() - i);
            const dStr = formatearFecha(d);
            allVals.push(dStr === todayStr ? ((todayLog.date === todayStr ? todayLog.count : 0) || 0) : (history[dStr] || 0));
        }
        const maxVal   = Math.max(...allVals, 1);
        const fragment = document.createDocumentFragment();

        for (let i = days - 1; i >= 0; i--) {
            const d        = new Date(); d.setDate(d.getDate() - i);
            const dStr     = formatearFecha(d);
            const dayNames = ['D','L','M','X','J','V','S'];
            const dayLabel = dayNames[d.getDay()];
            const isToday  = i === 0;

            let val = dStr === todayStr ? ((todayLog.date === todayStr ? todayLog.count : 0) || 0) : (history[dStr] || 0);
            const dayIndex = (d.getDay() + 6) % 7;

            let dailyGoal = 0;
            if (horario) {
                Object.keys(horario).forEach(asig => {
                    if (bib[asig] || asig === 'General') dailyGoal += (horario[asig][dayIndex] || 0);
                });
            }
            if (dailyGoal === 0) dailyGoal = 4;

            const isMet    = val >= dailyGoal && val > 0;
            if (isMet) daysMetGoal++;
            totalPomos += val;

            const barColor = isMet ? 'var(--status-green)' : (isToday ? 'var(--accent)' : 'var(--border)');
            const numColor = isMet ? 'var(--status-green)' : (isToday ? 'var(--text-main)' : 'var(--text-muted)');
            const maxRef   = Math.max(maxVal, dailyGoal);
            const h        = Math.min(100, (val / maxRef) * 100);
            const goalH    = Math.min(100, (dailyGoal / maxRef) * 100);

            const col = document.createElement('div');
            col.className = 'weekly-col-item';
            col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;cursor:pointer;';
            col.setAttribute('data-date', dStr);
            col.setAttribute('data-val',  val);
            col.setAttribute('data-goal', dailyGoal);
            col.title = `${dStr} — ${val}/${dailyGoal} pomos`;

            col.innerHTML = `
                <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative;">
                    ${val > 0 && viewMode === '7d' ? `<span style="font-size:0.7em;margin-bottom:2px;font-weight:bold;color:${numColor};">${val}</span>` : ''}
                    <div style="width:${viewMode === '28d' ? '80' : '60'}%;height:${Math.max(h, 2)}%;background:${barColor};border-radius:3px 3px 0 0;transition:height 0.5s;z-index:2;min-height:4px;"></div>
                    <div style="position:absolute;bottom:${goalH}%;width:100%;height:1px;border-top:1px dashed rgba(255,255,255,0.2);z-index:1;pointer-events:none;"></div>
                </div>
                <span style="font-size:${viewMode === '28d' ? '0.45' : '0.6'}em;margin-top:4px;color:${isToday ? 'var(--text-main)' : 'var(--text-muted)'};font-weight:${isToday ? 'bold' : 'normal'}">${dayLabel}</span>
            `;
            fragment.appendChild(col);
        }

        container.appendChild(fragment);

        const elMet   = document.getElementById('weekly-goals-met');
        const elTotal = document.getElementById('weekly-total');
        if (elMet)   elMet.innerText   = `${daysMetGoal}/${days}`;
        if (elTotal) elTotal.innerText = totalPomos;
    }

    function updateWeeklyViewButtons(mode) {
        document.getElementById('btn-week-7')?.classList.toggle('active',  mode === '7d');
        document.getElementById('btn-week-28')?.classList.toggle('active', mode === '28d');
    }

    function updateMapaHoras(horaHistory) {
        const container = document.getElementById('hora-heatmap-container');
        const bestEl    = document.getElementById('hora-best');
        if (!container) return;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const maxVal   = Math.max(...Object.values(horaHistory), 1);
        let bestHora = -1, bestVal = 0;

        for (let h = 0; h < 24; h++) {
            const val       = horaHistory[h] || 0;
            if (val > bestVal) { bestVal = val; bestHora = h; }
            const intensity = val / maxVal;
            const r         = Math.round(25 + intensity * 25);
            const g         = Math.round(166 * intensity);
            const b         = Math.round(147 * intensity);
            const bg        = val === 0 ? 'var(--menu-color)' : `rgb(${r},${g},${b})`;

            const cell = document.createElement('div');
            cell.className = 'hora-cell';
            cell.style.backgroundColor = bg;
            cell.setAttribute('data-tip', `${String(h).padStart(2,'0')}:00 — ${val} pomos`);
            if (val > 0) cell.innerText = val;
            fragment.appendChild(cell);
        }

        container.appendChild(fragment);

        if (bestEl) {
            if (bestHora >= 0 && bestVal > 0) {
                bestEl.innerHTML = `<i class="fa-solid fa-rotate" style="color:#e09f12;"></i> Mejor hora: ${String(bestHora).padStart(2,'0')}:00 (${bestVal} pomos)`;
            } else {
                bestEl.innerText = 'Sin datos aún';
            }
        }
    }

    function updatePomoStats(horario, asigActual, lista, pomoLogHoy) {
        try {
            let pendingPomos = 0;
            const currentAsigNorm = asigActual ? asigActual.toLowerCase().trim() : '';

            lista.forEach(t => {
                if (!t.done) {
                    const match = t.text.match(/\[(.*?)\]/);
                    const tag   = match ? match[1].toLowerCase().trim() : 'general';
                    if (!asigActual || tag === 'general' || tag === currentAsigNorm) {
                        pendingPomos += Math.max(0, t.est - t.completed);
                    }
                }
            });

            let todayLog = pomoLogHoy;
            const todayStr = getFechaHoy();
            if (todayLog.date !== todayStr) todayLog = { date: todayStr, count: 0, details: {} };

            const details    = todayLog.details || {};
            const diaSemana  = (new Date().getDay() + 6) % 7;
            let metaSpecific = 0;
            let metaGeneral  = (horario['General'] && horario['General'][diaSemana]) || 0;

            if (asigActual && horario[asigActual]) {
                metaSpecific = horario[asigActual][diaSemana] || 0;
            } else if (!asigActual) {
                Object.keys(horario).forEach(k => {
                    if (k !== 'General') metaSpecific += (horario[k][diaSemana] || 0);
                });
            }

            const localGoal = metaSpecific + metaGeneral;
            const goalElem  = document.getElementById('pomo-goal-today');
            if (goalElem) goalElem.innerText = localGoal > 0 ? localGoal : (metaGeneral > 0 ? metaGeneral : '-');

            let countSpecific = 0;
            if (asigActual) {
                const target = asigActual.toLowerCase().trim();
                Object.keys(details).forEach(key => {
                    if (key.toLowerCase().trim() === target) countSpecific += details[key];
                });
            } else {
                countSpecific = todayLog.count;
            }

            const totalDaily          = todayLog.count;
            const countOthers         = Math.max(0, totalDaily - countSpecific);
            const baseSpecific        = Math.min(countSpecific, metaSpecific);
            const spillSpecific       = Math.max(0, countSpecific - metaSpecific);
            const availableForGeneral = spillSpecific + countOthers;
            const filledGeneral       = Math.min(metaGeneral, availableForGeneral);
            const doneContextual      = !asigActual ? totalDaily : baseSpecific + filledGeneral;

            let gradientParts   = [];
            let currentDeg      = 0;
            let breakdownHTML   = '';
            let remainingToPaint = doneContextual;
            const totalToRepresent = Math.max(doneContextual, localGoal, 1);

            if (asigActual && countSpecific > 0 && remainingToPaint > 0) {
                const take  = Math.min(countSpecific, remainingToPaint);
                const deg   = (take / totalToRepresent) * 360;
                const color = getColorAsignatura(asigActual);
                gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
                currentDeg      += deg;
                remainingToPaint -= take;
                breakdownHTML   += `<div><span style="color:${color};"><i class='fa-regular fa-circle-dot'></i></span> ${asigActual}: <strong>${countSpecific}</strong></div>`;
            }

            if (remainingToPaint > 0) {
                Object.keys(details).forEach(asig => {
                    if (asigActual && asig.toLowerCase().trim() === currentAsigNorm) return;
                    const val = details[asig];
                    if (val > 0) {
                        const take  = Math.min(val, remainingToPaint);
                        if (take > 0) {
                            const deg   = (take / totalToRepresent) * 360;
                            const color = getColorAsignatura(asig);
                            gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
                            currentDeg      += deg;
                            remainingToPaint -= take;
                            breakdownHTML   += `<div><span style="color:${color};"><i class='fa-regular fa-circle-dot'></i></span> ${asig}: <strong>${val}</strong></div>`;
                        }
                    }
                });
            }

            const doneElem = document.getElementById('pomo-done-today');
            if (doneElem) {
                doneElem.innerText = doneContextual;
                doneElem.onclick   = (typeof editarProgresoManual === 'function') ? editarProgresoManual : null;
            }

            if (doneContextual < localGoal) gradientParts.push(`#333 ${currentDeg}deg 360deg`);

            const donut = document.getElementById('daily-donut');
            const bdDiv = document.getElementById('today-breakdown');
            if (donut) donut.style.background = doneContextual > 0 ? `conic-gradient(${gradientParts.join(', ')})` : 'conic-gradient(#333 0% 100%)';
            if (bdDiv) bdDiv.innerHTML = breakdownHTML || "<span style='opacity:0.5;font-size:0.8em'>Sin actividad relevante</span>";

            const pctEl = document.getElementById('daily-progress-text');
            if (pctEl) pctEl.innerText = Math.round((doneContextual / Math.max(localGoal, 1)) * 100) + '%';

        } catch (e) { Logger.error('updatePomoStats:', e); }
    }

    function updatePendingWindow(bib, asigActual, fechaEspecifica = null) {
        const listContainer = document.getElementById('pending-list-items');
        const countDisplay  = document.getElementById('pending-total-count');
        const titleWidget   = document.querySelector('#widget-pendientes .stat-title');
        if (!listContainer || !countDisplay) return;

        listContainer.innerHTML = '';

        if (!asigActual || !bib[asigActual]) {
            countDisplay.innerText  = '0';
            listContainer.innerHTML = "<li class='pending-empty-msg'>Selecciona asignatura</li>";
            return;
        }

        const cards = bib[asigActual];
        let filtrados    = [];
        let tituloEstado = 'Ventana de Pendientes (Hoy + Atrasados)';

        if (fechaEspecifica !== undefined && fechaEspecifica !== null) {
            // Día específico del hover
            filtrados    = cards.filter(c => c.ProximoRepaso === fechaEspecifica);
            tituloEstado = `Programado para el ${formatDateForUI(fechaEspecifica)}`;
            } else {
                // Default: hoy + atrasados
                const todayVal = fechaValor(getFechaHoy());
                filtrados      = cards.filter(c => c.ProximoRepaso && fechaValor(c.ProximoRepaso) <= todayVal);
                tituloEstado   = 'Ventana de Pendientes (Hoy)';
            }

        if (titleWidget)  titleWidget.innerText  = tituloEstado;
        countDisplay.innerText  = filtrados.length;
        countDisplay.className  = filtrados.length > 0 ? 'text-danger' : (fechaEspecifica ? 'text-muted' : 'text-success');

        if (filtrados.length === 0) {
            const msg = fechaEspecifica ? 'Nada programado' : '¡Todo al día! <i class="fa-solid fa-dove"></i>';
            listContainer.innerHTML = `<li class='pending-empty-msg'>${msg}</li>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        filtrados.forEach(c => {
            const li = document.createElement('li');
            li.className = 'asig-item pending-item';
            let difText  = 'N';
            let colorVar = 'var(--text-muted)';
            if (c.Dificultad) {
                difText  = c.Dificultad;
                if (difText == 1) colorVar = 'var(--status-blue)';
                if (difText == 2) colorVar = 'var(--status-green)';
                if (difText == 3) colorVar = 'var(--status-yellow)';
                if (difText == 4) colorVar = 'var(--status-red)';
            } else if (c.EtapaRepaso > 0) {
                difText = '?';
            }
            li.innerHTML = `
                <span class="pending-item-title">${escapeHtml(c.Titulo)}</span>
                <span style="font-weight:bold;color:${colorVar};">(${difText})</span>`;
            fragment.appendChild(li);
        });
        listContainer.appendChild(fragment);

        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([listContainer]).catch(err => Logger.error(err));
        }
    }

    return {
        updateDifficultyStats,
        updateGlobalStats,
        updateCalendarHeatmap,
        updatePronostico,
        updateDeudaEstudio,
        updateEficienciaWidget,
        updateWeeklyWidget,
        updateWeeklyViewButtons,
        updateMapaHoras,
        updatePomoStats,
        updatePendingWindow,
    };
})();
