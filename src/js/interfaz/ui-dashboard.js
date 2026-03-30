// ════════════════════════════════════════════════════════════════
// UI-DASHBOARD.JS — Widgets del panel de estadísticas
// ════════════════════════════════════════════════════════════════

const UIDashboard = (() => {

    function updateDifficultyStats(counts, total, pendientesHoy) {
        const elTotal = document.getElementById('total-cards-count');
        const elHoy   = document.getElementById('today-cards-count');
        if (elTotal) elTotal.innerText = escapeHtml(String(total || 0));
        if (elHoy)   elHoy.innerText   = escapeHtml(String(pendientesHoy || 0));

        const labels = {
            new:          'Nuevas',
            learning:     'Reaprendizaje',
            consolidando: 'Consolidando',
            revision:     'Revisión',
            dominadas:    'Dominadas'
        };
        const colors = {
            new:          'var(--border)',
            learning:     'var(--status-red)',
            consolidando: 'var(--status-yellow)',
            revision:     'var(--status-green)',
            dominadas:    'var(--status-blue)'
        };

        let html = '';
        ['dominadas', 'revision', 'consolidando', 'learning', 'new'].forEach(k => {
            const val = counts[k] || 0;
            const pct = total > 0 ? (val / total) * 100 : 0;
            html += `
                <div class="diff-bar-row">
                    <div class="diff-label" style="width:90px;">${labels[k]}</div>
                    <div class="diff-track">
                        <div class="diff-fill" style="width:${pct}%;background:${colors[k]};transition:width 0.3s ease;"></div>
                    </div>
                    <div class="diff-val">${escapeHtml(String(val))}</div>
                </div>`;
        });

        const containerBars = document.getElementById('dist-bars');
        if (containerBars) containerBars.innerHTML = html;
    }

    function updateGlobalStats(streak, totalDiasActivos, avg) {
        const elStreak = document.getElementById('stat-streak');
        const elTotal  = document.getElementById('stat-total-days');
        const elAvg    = document.getElementById('stat-avg');
        const elMsg    = document.getElementById('streak-msg');

        if (elStreak) elStreak.innerText = escapeHtml(String(streak || 0));
        if (elTotal)  elTotal.innerText  = escapeHtml(String(totalDiasActivos || 0));
        if (elAvg)    elAvg.innerText    = escapeHtml(String(avg || 0));
        
            if (elMsg) {
            if (streak > 0) {
                // Configuración dinámica basada en la magnitud de la racha
                let colorVar = 'var(--status-red)';    
                let iconColor = 'var(--fuego)';
                const labelDia = streak === 1 ? 'día' : 'días';

                if (streak >= 7) {
                    colorVar = 'var(--status-blue)';
                    iconColor = 'var(--fuego-azul)';
                }    else if (streak >= 5) {
                    colorVar = 'var(--status-green)';  
                    
                } else if (streak >= 2) {
                    colorVar = 'var(--status-yellow)'; 
                }

                elMsg.innerHTML = `
                    Racha: <span style="color:${colorVar}; font-weight:bold;">${streak}</span> ${labelDia}! 
                    <i class="fa-solid fa-fire-flame-curved" style="color:${iconColor}; margin-left:4px; font-size: 1.25em"></i>
                `;
            } else {
                elMsg.innerHTML = `<span style="color:var(--text-muted);">Inicia una racha hoy para no acumular deuda.</span>`;
            }
        }
    }
    // Añadir al namespace UI / UI_Dashboard
    function updateProbabilidadAprobado(porcentaje) {
        const labelElem = document.getElementById('dash-prob-aprobado-val');
        const barraElem = document.getElementById('dash-prob-aprobado-bar'); // Opcional para barra visual
        
        if (!labelElem) return;

        labelElem.innerText = `${porcentaje}%`;

        // Lógica de colores semánticos (Rojo -> Naranja -> Verde)
        let color = 'var(--text-color)';
        if (porcentaje >= 80) color = '#4ade80'; // Verde (Listo para examen)
        else if (porcentaje >= 50) color = '#facc15'; // Amarillo/Naranja (Estudiando)
        else color = '#f87171'; // Rojo (Riesgo de suspenso)

        labelElem.style.color = color;
        if (barraElem) {
            barraElem.style.width = `${porcentaje}%`;
            barraElem.style.backgroundColor = color;
        }
    }

    function updateCalendarHeatmap(bib, asigActual, fechas, viewDate) {
        const container = document.getElementById('calendar-heatmap');
        const title     = document.getElementById('calendar-month-title');
        if (!container) return;

        container.innerHTML = '';

        container.onmouseleave = () => {
            // Delegación explícita al controlador global para evitar colisión con la función local UI
            if (typeof window.updatePendingWindow === 'function') {
                window.updatePendingWindow(undefined);  
            }
        };
        
        container.onmouseover = (e) => {
            const dayDiv = e.target.closest('.heatmap-day[data-interactive="true"]');
            if (!dayDiv) return;
            const dStr = dayDiv.getAttribute('data-date');
            if (!dStr) return;
            
            // Delegación explícita al controlador global
            if (typeof window.updatePendingWindow === 'function') {
                window.updatePendingWindow(dStr);
            }

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

    /**
     * Actualiza el widget de Pronóstico de Carga (7 días).
     * Renderiza un gráfico de barras proporcional con un eje Y de escala a la izquierda.
     * @param {Array<{count: number, dayLabel: string, isToday: boolean}>} counts
     * @param {number} maxCount - El valor máximo para escalar el eje Y.
     */
    function updatePronostico(counts, maxCount) {
        const container = document.getElementById('forecast-container'); 
        if (!container) return;

        container.innerHTML = '';
        container.style.height = '120px';
        container.style.marginTop = '10px';

        if (!counts || counts.length === 0) {
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.85em;">Sin datos</div>`;
            return;
        }

        // --- LÓGICA DE ESCALADO (Raíz Cuadrada) ---
        // f(x) = sqrt(x). Esto cumple que sqrt(64)=8 vs sqrt(1)=1 (8 veces más grande)
        const sqrtMax = Math.sqrt(Math.max(maxCount, 1));
        
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; width:100%; height:100%; gap:8px;';

        // 1. EJE Y (Ticks basados en la escala inversa para referencia visual)
        const yAxis = document.createElement('div');
        yAxis.style.cssText = 'display:flex; flex-direction:column-reverse; justify-content:space-between; width:28px; color:var(--text-muted); font-size:0.65em; text-align:right; padding-bottom:18px; border-right:1px solid rgba(255,255,255,0.05);';

        // Mostramos 3 puntos de referencia: 0, el punto medio visual (sqrt) y el máximo
        const midPoint = Math.round(Math.pow(sqrtMax / 2, 2));
        [0, midPoint, Math.round(maxCount)].forEach(val => {
            const span = document.createElement('span');
            span.innerText = escapeHtml(String(val));
            yAxis.appendChild(span);
        });
        wrapper.appendChild(yAxis);

        // 2. ÁREA DE GRÁFICO
        const chartArea = document.createElement('div');
        chartArea.style.cssText = 'display:flex; flex:1; justify-content:space-around; align-items:flex-end; height:100%;';

        counts.forEach(c => {
            // Calculamos la altura basada en la raíz cuadrada
            const currentSqrt = Math.sqrt(c.count);
            const percentage = (currentSqrt / sqrtMax) * 100;
            
            const barHeight = c.count > 0 ? `calc(${Math.min(percentage, 100)}% - 18px)` : '2px';

            let barColor = 'var(--border)';
            if (c.isToday) barColor = 'var(--accent)';
            else if (c.count > 30) barColor = 'var(--status-red)';
            else if (c.count > 0)  barColor = 'var(--status-blue)';

            const col = document.createElement('div');
            col.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; flex:1;';
            
            col.innerHTML = `
                <div title="${c.count} tarjetas" style="width:65%; height:${barHeight}; background:${barColor}; border-radius:3px 3px 0 0; transition:height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); min-width:6px;"></div>
                <span style="height:18px; line-height:18px; font-size:0.7em; color:${c.isToday ? 'var(--accent)' : 'var(--text-muted)'}; font-weight:${c.isToday ? 'bold' : 'normal'}; text-transform:uppercase;">${escapeHtml(c.dayLabel)}</span>
            `;
            chartArea.appendChild(col);
        });

        wrapper.appendChild(chartArea);
        container.appendChild(wrapper);
    }

    function updateDeudaEstudio(deudaTotal, contadores, deudaDesglose) {
        const scoreEl = document.getElementById('deuda-score');
        const listEl  = document.getElementById('deuda-breakdown'); 
        if (!scoreEl || !listEl) return;

        const dt = Math.round((deudaTotal || 0) * 10) / 10;
        scoreEl.innerText   = dt;
        scoreEl.style.color = dt === 0
            ? 'var(--status-green)'
            : dt < 10 ? 'var(--status-yellow)' : 'var(--status-red)';

        const fmt = (v) => (Math.round((v || 0) * 10) / 10).toFixed(1);
        listEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-seedling" style="color:var(--status-green)"></i> Nuevas (${escapeHtml(String(contadores.nuevas || 0))})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.nuevas)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-book-open" style="color:var(--status-blue)"></i> Aprendizaje (${escapeHtml(String(contadores.learning || 0))})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.learning)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-rotate-right" style="color:var(--text-main)"></i> Repaso (${escapeHtml(String(contadores.repasoNormal || 0))})</span>
                <span style="font-weight:bold;color:var(--text-main);">${fmt(deudaDesglose.repasoNormal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-muted);"><i class="fa-solid fa-triangle-exclamation" style="color:var(--status-red)"></i> Críticas (${escapeHtml(String(contadores.criticas || 0))})</span>
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

        if (typeof UI !== 'undefined' && UI.renderizarMatematicas) {
            UI.renderizarMatematicas(listContainer).catch(err => Logger.error(err)); // o el nodo que estés renderizando
        }
    }
    // ════════════════════════════════════════════════════════════════
    // UI MONTE CARLO (Módulo Interno - v4 UX Optimizada)
    // ════════════════════════════════════════════════════════════════
    function _generarColorPorTag(tag) {
        if (!tag || tag === 'General') return '#888888';
        if (tag === 'Demostraciones') return '#e09f12'; 
        let hash = 0;
        for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 65%)`; // Colores pastel generados matemáticamente
    }
    function renderWidgetMonteCarlo(res) {
        const contenedor = document.getElementById('widget-montecarlo-container');
        if (!contenedor) return;

        if (!res) {
            contenedor.innerHTML = `
                <div class="stat-value" style="font-size: 0.75rem; color:var(--text-subtle)">Pendiente de cálculo</div>
                <button onclick="window.abrirModalMonteCarlo()" class="btn-modern btn-muted" style="
                    margin-top: 10px; 
                    width: 100%; 
                    justify-content: center; 
                    font-weight: bold;">
                    <i class="fa-solid fa-dice"></i> Empezar Simulación
                </button>
            `;
            return;
        }

        let color = res.probabilidad >= 90 ? '#2a701d' : (res.probabilidad>=70 ? '#95178b': (res.probabilidad >= 50 ? '#2b78a4' : '#e63434'));
        
        contenedor.innerHTML = `
            <div style="font-size: 0.9rem; color: var(--text-main);">
                Aprobarías el <strong style="color: ${color}; font-size: 1.05rem;">${res.probabilidad}%</strong> de los exámenes.
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">
                Nota media estimada: <strong>${res.notaMedia} / ${res.notaMaxima}</strong>
            </div>
            <button onclick="window.abrirModalMonteCarlo()" class="btn-modern btn-muted" style="
            margin-top: 10px; font-size: 0.8rem;width: 100%;justify-content: center;">
                <i class="fa-solid fa-dice"></i> Recalcular
            </button>
        `;
    }

    function _renderEstructuraModal(titulo, icono, cuerpoHtml, footerHtml) {
        return `
        <div style="background:var(--card-bg); border:1px solid #444; border-radius:10px; width:95%; max-width:500px; max-height:88vh; display:flex; flex-direction:column; overflow:hidden; margin:auto; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #333; flex-shrink:0;">
                <h3 style="margin:0; font-size:0.9em; color:var(--text-main);">
                    <i class="${icono}" style="color:var(--accent); margin-right:6px;"></i>${titulo}
                </h3>
                <button onclick="window.cerrarModalMonteCarlo()" style="background:rgba(255,82,82,0.15); border:1px solid rgba(255,82,82,0.5); color:#ff5252; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:1em; display:flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1; transition: 0.2s;">✕</button>
            </div>
            <div style="overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:10px;">
                ${cuerpoHtml}
            </div>
            ${footerHtml ? `
            <div style="display:flex; justify-content:flex-end; align-items:center; padding:8px 14px; border-top:1px solid #333; flex-shrink:0;">
                ${footerHtml}
            </div>` : ''}
        </div>
        `;
    }

    function mostrarCargaMonteCarlo(simulaciones = 5000) {
        const modalOverlay = document.getElementById('modal-montecarlo');
        if (!modalOverlay) return;
        
        const formatNum = simulaciones.toLocaleString('es-ES');
        const cuerpo = `
            <div style="text-align: center; padding: 40px 10px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: var(--accent);"></i>
                <p style="margin-top: 20px; font-weight:bold; color:var(--text-main);">Procesando ${formatNum} simulaciones...</p>
                <p style="font-size: 0.8em; color: var(--text-muted);">Aplicando restricciones FSRS y calculando varianza.</p>
            </div>
        `;
        modalOverlay.innerHTML = _renderEstructuraModal("Motor FSRS", "fa-solid fa-microchip", cuerpo, "");
    }

    function renderModalMonteCarlo(res) {
        const modalOverlay = document.getElementById('modal-montecarlo');
        if (!modalOverlay || !res) return;

        if (res.error) {
            const cuerpoError = `
                <div style="background:rgba(244,67,54,0.1); border:1px solid rgba(244,67,54,0.4); border-radius:8px; padding:20px; text-align:center; color:#f44336; margin: 20px 0;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:2em; margin-bottom:10px;"></i>
                    <h4 style="margin:0 0 10px 0;">Simulación Abortada</h4>
                    <p style="font-size:0.85em; margin:0;">${res.msg}</p>
                </div>
            `;
            const footerError = `
                <button onclick="window.abrirModalMonteCarlo(true)" style="background:rgba(143, 47, 162,0.15); border:1px solid #AE39C6; color:#AE39C6; font-size:0.8em; cursor:pointer; padding:6px 14px; border-radius:6px; font-weight:bold;">
                    <i class="fa-solid fa-gear"></i> Ajustar Restricciones
                </button>
            `;
            modalOverlay.innerHTML = _renderEstructuraModal("Conflicto de Reglas", "fa-solid fa-bug", cuerpoError, footerError);
            return;
        }

        let cuerpo = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:0.7em; color:#888; text-transform:uppercase; font-weight:bold;">Media Esperada</div>
                    <div style="font-size:1.6em; font-weight:bold; color:var(--accent);">${res.notaMedia} <span style="font-size:0.5em; color:#666;">/ ${res.notaMaxima}</span></div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:0.7em; color:#888; text-transform:uppercase; font-weight:bold;">Varianza (Riesgo)</div>
                    <div style="font-size:1.6em; font-weight:bold; color:#facc15;">± ${res.desviacion}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:10px; text-align:center; grid-column: span 2; border: 1px solid rgba(76,175,80,0.3);">
                    <div style="font-size:0.7em; color:#888; text-transform:uppercase; font-weight:bold;">Intervalo de Confianza (95%)</div>
                    <div style="font-size:1.2em; font-weight:bold; color:#4caf50;">
                        Tus notas fluctuarán entre [ ${res.icMin} — ${res.icMax} ]
                    </div>
                </div>
            </div>
            <p style="font-size:0.8em; color:#888; margin-top:-5px; margin-bottom:10px; text-align:center;">
                *Auditoría real: 3 exámenes extraídos de la simulación múltiple.
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        res.ejemplos.forEach(ex => {
            const color = ex.aprobado ? '#4caf50' : '#f44336';
            const bgClass = ex.aprobado ? 'rgba(76,175,80,0.05)' : 'rgba(244,67,54,0.05)';
            cuerpo += `
                <div style="background:${bgClass}; border:1px solid ${color}40; border-radius:6px; padding:10px; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <strong style="font-size:0.85em;">Examen #${ex.id}</strong>
                        <span style="color: ${color}; font-weight: bold; font-size:0.85em;">Obtenido: ${ex.nota} / ${res.notaMaxima}</span>
                    </div>
                    <div style="font-size: 0.78em; color: #bbb; max-height: 180px; overflow-y: auto; padding-right:5px;">
            `;
            ex.detalles.forEach((d) => {
                const icon = d.acertada ? '<i class="fa-solid fa-check" style="color:#4caf50"></i>' : '<i class="fa-solid fa-xmark" style="color:#f44336"></i>';
                // Reutilizamos la función nativa de colores del sistema si existe, si no fallback
                const tagColor = _generarColorPorTag(d.tipo);
                
                cuerpo += `
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:flex-start;">
                        <span style="flex:1; line-height:1.2; padding-right:8px;">
                            <span style="color:${tagColor}; font-weight:bold; margin-right:4px;">[${escapeHtml(d.tipo)}]</span>
                            ${escapeHtml(d.titulo)} 
                            <span style="color:#666; font-size:0.9em;">(${d.peso}pts)</span>
                        </span>
                        <span>${icon}</span>
                    </div>`;
            });
            cuerpo += `</div></div>`;
        });
        cuerpo += `</div>`;

        const footer = `
            <button onclick="window.abrirModalMonteCarlo(true)" class="btn-glass" style="font-size:0.85em; padding:6px 14px;">
                <i class="fa-solid fa-gear"></i> Ajustar Restricciones
            </button>
        `;

        modalOverlay.innerHTML = _renderEstructuraModal("Resultados (Motor Monte Carlo)", "fa-solid fa-chart-pie", cuerpo, footer);
    }

    function lanzarSimulacionDesdeUI() {
        const config = {
            notaMaxima: parseFloat(document.getElementById('mc-nota-max').value) || 10.0,
            notaObjetivo: parseFloat(document.getElementById('mc-nota-obj').value) || 7.0,
            maxTarjetas: parseInt(document.getElementById('mc-max-preguntas').value) || 50,
            maxPeso: parseFloat(document.getElementById('mc-max-peso').value) || 3.0,
            simulaciones: parseInt(document.getElementById('mc-simulaciones').value) || 5000,
            reglas: []
        };
        
        document.querySelectorAll('.mc-regla-row').forEach(row => {
            const excluido = row.getAttribute('data-excluido') === 'true';
            const tipo = row.getAttribute('data-tipo');
            const total = parseFloat(row.querySelector('.mc-total').value) || 0;
            const valor = parseFloat(row.querySelector('.mc-valor').value) || 0;
            
            if (excluido || total > 0 || valor > 0) {
                config.reglas.push({ tipo, excluido, total, valor });
            }
        });

        if (typeof window.lanzarSimulacionMonteCarlo === 'function') {
            window.lanzarSimulacionMonteCarlo(config);
        }
    }

    function abrirModalMonteCarlo(forzarConfig = false) {
        const modalOverlay = document.getElementById('modal-montecarlo');
        if (modalOverlay) modalOverlay.classList.add('visible');
        
        const asigActual = State.get('nombreAsignaturaActual');
        const cacheResultados = State.get('resultadosMonteCarlo') || {};
        
        if (!forzarConfig && cacheResultados[asigActual]) {
            renderModalMonteCarlo(cacheResultados[asigActual]);
            return;
        }

        const tarjetas = State.get('biblioteca')[asigActual] || [];
        const tiposSet = new Set();
        tarjetas.forEach(c => {
            let t = c.Apartado ? c.Apartado.trim().toLowerCase() : '';
            if (!t) tiposSet.add('General');
            else if (t.startsWith('demo')) tiposSet.add('Demostraciones');
            else tiposSet.add(t.charAt(0).toUpperCase() + t.slice(1));
        });
        const tipos = Array.from(tiposSet);

        let cuerpo = `
            <p style="font-size:0.8em; color:#888; margin-top:0;">Fija la estructura de tu examen. Para descartar temas que no entran, marca la X.</p>
            
            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:10px; margin-bottom:5px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.7em; color:#888;">Nota Máxima</label>
                        <input type="number" id="mc-nota-max" value="10.0" step="0.5" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.7em; color:#888;">Corte Aprobado</label>
                        <input type="number" id="mc-nota-obj" value="5.0" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.7em; color:#888;">Límite Preguntas</label>
                        <input type="number" id="mc-max-preguntas" value="10" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.7em; color:#888;">Pts/Tarjeta Máx.</label>
                        <input type="number" id="mc-max-peso" value="3.0" step="0.25" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px; grid-column: span 2;">
                        <label style="font-size:0.7em; color:#888;">Nº de Simulaciones (Iteraciones)</label>
                        <input type="number" id="mc-simulaciones" value="5000" step="1000" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                </div>
            </div>

            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:10px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <i class="fa-solid fa-layer-group" style="color:var(--accent); font-size:0.9em;"></i>
                    <span style="font-size:0.85em; color:#ccc; font-weight:bold;">Matriz de Exclusión y Reglas</span>
                </div>
                <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
        `;

        tipos.forEach(t => {
            const tagColor = (typeof window.getColorAsignatura === 'function') ? window.getColorAsignatura(t) : '#e09f12';
            cuerpo += `
                <div class="mc-regla-row" data-tipo="${escapeHtml(t)}" data-excluido="false" style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; background:#111; border:1px solid #333;">
                    <button class="mc-btn-exclude" onclick="window.toggleExcludeMC(this)" style="background:transparent; border:none; color:${tagColor}; cursor:pointer; font-size:1.1em; width:24px; display:flex; justify-content:center; transition:0.2s;" title="En la bolsa">
                        <i class="fa-solid fa-check-circle"></i>
                    </button>
                    <span style="font-size:0.8em; color:#ccc; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold;">${escapeHtml(t)}</span>
                    <input type="number" class="mc-total input-glass" placeholder="Puntos totales" step="0.25" min="0.25" style="width:85px; font-size:0.75em; padding:4px;">
                    <input type="number" class="mc-valor input-glass" placeholder="Peso c/u" step="0.25" min="0.25" style="width:80px; font-size:0.75em; padding:4px;">
                </div>
            `;
        });
        
        if (tipos.length === 0) cuerpo += `<p style="color:#888; font-size:0.75em;">No tienes tarjetas con apartado asignado.</p>`;
        cuerpo += `</div></div>`;

        const footer = `
            <button onclick="window.lanzarSimulacionDesdeUI()" style="background:rgba(143, 47, 162,0.15); border:1px solid #AE39C6; color:#AE39C6; font-size:0.85em; cursor:pointer; padding:6px 16px; border-radius:6px; font-weight:bold; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-play"></i> Simular Examen
            </button>
        `;

        modalOverlay.innerHTML = _renderEstructuraModal("Arquitectura Estocástica", "fa-solid fa-gears", cuerpo, footer);
    }

    function cerrarModalMonteCarlo() {
        const modal = document.getElementById('modal-montecarlo');
        if (modal) modal.classList.remove('visible');
    }

    // ── RETORNO DEL MÓDULO ──────────
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
        updateProbabilidadAprobado,
        renderWidgetMonteCarlo,
        mostrarCargaMonteCarlo,
        renderModalMonteCarlo,
        lanzarSimulacionDesdeUI,
        abrirModalMonteCarlo,
        cerrarModalMonteCarlo
    };
})(); // <--- FIN DEL IIFE UIDashboard

// ════════════════════════════════════════════════════════════════
// PROXIES GLOBALES DEL DOM 
// ════════════════════════════════════════════════════════════════

window.lanzarSimulacionDesdeUI = () => UIDashboard.lanzarSimulacionDesdeUI();
window.abrirModalMonteCarlo    = (forzar) => UIDashboard.abrirModalMonteCarlo(forzar);
window.cerrarModalMonteCarlo   = () => UIDashboard.cerrarModalMonteCarlo();

window.toggleExcludeMC = function(btn) {
    const row = btn.closest('.mc-regla-row');
    const isExcluido = row.getAttribute('data-excluido') === 'true';
    
    if (isExcluido) {
        row.setAttribute('data-excluido', 'false');
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i>';
        btn.style.color = btn.getAttribute('data-color-orig');
        row.style.opacity = '1';
        row.querySelectorAll('input').forEach(i => i.disabled = false);
    } else {
        if (!btn.getAttribute('data-color-orig')) btn.setAttribute('data-color-orig', btn.style.color);
        row.setAttribute('data-excluido', 'true');
        btn.innerHTML = '<i class="fa-solid fa-ban"></i>';
        btn.style.color = '#f44336';
        row.style.opacity = '0.5';
        row.querySelectorAll('input').forEach(i => { i.disabled = true; i.value = ''; });
    }
};