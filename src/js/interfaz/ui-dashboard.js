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
        container.onmouseover = (e) => {
            const dayDiv = e.target.closest('.heatmap-day[data-interactive="true"]');
            
            // Si no estamos sobre un día válido, volvemos a la vista de "Hoy"
            if (!dayDiv) {
                if (typeof window.updatePendingWindow === 'function') {
                    window.updatePendingWindow(undefined); 
                }
                return;
            }

            const dStr = dayDiv.getAttribute('data-date');
            if (!dStr) return;
            if (typeof window.updatePendingWindow === 'function') {
                window.updatePendingWindow(dStr);
            }

            // El scroll automático se ha eliminado para no interrumpir la navegación del usuario
        };

        // Asegurar que el mouseleave también resetee
        container.onmouseleave = () => {
            if (typeof window.updatePendingWindow === 'function') {
                window.updatePendingWindow(undefined);
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

    let curvaOlvidoChartInstance = null;

    function updateCurvaOlvido(datosValidos) {
        const canvas = document.getElementById('olvido-chart');
        const emptyMsg = document.getElementById('olvido-empty-msg');
        
        if (!canvas || !emptyMsg) return;

        if (!datosValidos || datosValidos.length === 0) {
            canvas.style.display = 'none';
            emptyMsg.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        emptyMsg.style.display = 'none';

        const ctx = canvas.getContext('2d');
        if (curvaOlvidoChartInstance) curvaOlvidoChartInstance.destroy();

        curvaOlvidoChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        type: 'line',
                        label: 'Teórica R(τ)',
                        data: datosValidos.map(d => ({ x: d.tau, y: d.retencionTeorica })),
                        borderColor: 'rgba(76, 175, 80, 0.8)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0
                    },
                    {
                        type: 'scatter',
                        label: 'Empírica (Tus aciertos)',
                        data: datosValidos.map(d => ({ x: d.tau, y: d.retencionReal })),
                        backgroundColor: 'rgba(33, 150, 243, 1)',
                        pointRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Tiempo Normalizado (τ)', color: '#666' }, min: 0 },
                    y: { title: { display: true, text: 'Retención (R)', color: '#666' }, min: 0, max: 1.05 }
                },
                plugins: {
                    legend: { labels: { color: '#aaa', boxWidth: 12 } }
                }
            }
        });
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

        if (typeof UICore !== 'undefined' && UICore.renderizarMatematicas) {
            UICore.renderizarMatematicas(listContainer).catch(err => Logger.error(err)); // o el nodo que estés renderizando
        }
    }
   // ════════════════════════════════════════════════════════════════
    // UI MONTE CARLO (v7 - Unificada: Reglas Clásicas + Proyección FSRS)
    // ════════════════════════════════════════════════════════════════

    const _escapeHtml = (str) => String(str).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]));

    function _generarColorPorTag(tag) {
        if (!tag || tag === 'General') return '#888888';
        if (tag === 'Demostraciones') return '#e09f12'; 
        let hash = 0;
        for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${Math.abs(hash) % 360}, 70%, 65%)`;
    }

    function _renderEstructuraModal(titulo, icono, cuerpoHtml, footerHtml) {
        return `
        <div style="background:var(--card-bg); border:1px solid #444; border-radius:10px; width:95%; max-width:600px; max-height:88vh; display:flex; flex-direction:column; overflow:hidden; margin:auto; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #333; flex-shrink:0;">
                <h3 style="margin:0; font-size:1em; color:var(--text-main);">
                    <i class="${icono}" style="color:var(--accent); margin-right:8px;"></i>${titulo}
                </h3>
                <button onclick="window.cerrarModalMonteCarlo()" style="background:rgba(255,82,82,0.15); border:1px solid rgba(255,82,82,0.5); color:#ff5252; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:1em; display:flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1; transition: 0.2s;">✕</button>
            </div>
            <div id="mc-modal-body" style="overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px;">
                ${cuerpoHtml}
            </div>
            ${footerHtml ? `
            <div id="mc-modal-footer" style="display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; border-top:1px solid #333; flex-shrink:0;">
                ${footerHtml}
            </div>` : ''}
        </div>
        `;
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

        let color = res.probabilidad >= 90 ? '#2a701d' : (res.probabilidad>=70 ? '#2b78a4': (res.probabilidad >= 50 ? '#a7a339' : '#e63434'));
        
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

    function mostrarCargaMonteCarlo() {
        const bodyContainer = document.getElementById('mc-modal-body');
        const footerContainer = document.getElementById('mc-modal-footer');
        if (!bodyContainer) return;

        bodyContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 10px;" id="mc-loading-area">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: var(--accent); margin-bottom: 15px;"></i>
                <p style="margin: 10px 0; font-weight:bold; color:var(--text-main);" id="mc-progress-title">Procesando simulación base...</p>
                <div style="width: 100%; background: #222; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 15px; display:none;" id="mc-progress-bar-wrapper">
                    <div id="mc-progress-bar-fill" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.1s linear;"></div>
                </div>
                <p style="font-size: 0.8em; color: var(--text-muted); margin-top: 8px;" id="mc-progress-subtitle">Aplicando restricciones y fechas.</p>
            </div>
        `;
        if (footerContainer) footerContainer.style.display = 'none';
    }

    function actualizarProgresoMarginal(index, total) {
        const barWrapper = document.getElementById('mc-progress-bar-wrapper');
        const barFill = document.getElementById('mc-progress-bar-fill');
        const title = document.getElementById('mc-progress-title');
        const subtitle = document.getElementById('mc-progress-subtitle');

        if (barWrapper) barWrapper.style.display = 'block';
        // Asignación corregida
        if (barFill) barFill.style.width = `${(index / total) * 100}%`;
        if (title) title.innerText = `Evaluando estrategia óptima...`;
        if (subtitle) subtitle.innerText = `Analizando impacto marginal de la tarjeta ${index} de ${total}`;
    }

    function abrirModalMonteCarlo() {
        const modalOverlay = document.getElementById('modal-montecarlo');
        if (modalOverlay) modalOverlay.classList.add('visible');

        const asigActual = State.get('nombreAsignaturaActual');
        const tarjetas = State.get('biblioteca')[asigActual] || [];
        
        const tiposSet = new Set();
        tarjetas.forEach(c => {
            let t = c.Apartado ? c.Apartado.trim().toLowerCase() : '';
            if (!t) tiposSet.add('General');
            else if (t.startsWith('demo')) tiposSet.add('Demostraciones');
            else tiposSet.add(t.charAt(0).toUpperCase() + t.slice(1));
        });
        const tipos = Array.from(tiposSet).sort();

        let cuerpo = `
            <p style="font-size:0.85em; color:#bbb; margin-top:0;">Configura las reglas del examen y focaliza la predicción en el tiempo.</p>
            
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
                </div>
            </div>

            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:10px; margin-bottom:5px;">
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.7em; color:#888;">Rango de Temas a Evaluar (Ej: 1,2,4-7)</label>
                        <input type="text" id="mc-filtro-tema-input" class="input-glass" placeholder="Vacío = toda la asignatura" style="width:100%; font-size:0.8em; padding:5px;">
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                        <div style="display:flex; flex-direction:column; gap:3px;">
                            <label style="font-size:0.7em; color:#888;">Fecha del Examen</label>
                            <input type="date" id="mc-fecha-examen" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px;">
                            <label style="font-size:0.7em; color:#888;">Simulaciones Base</label>
                            <input type="number" id="mc-simulaciones" value="3000" step="500" class="input-glass" style="width:100%; font-size:0.8em; padding:5px;">
                        </div>
                    </div>
                </div>
            </div>

            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:10px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <i class="fa-solid fa-layer-group" style="color:var(--accent); font-size:0.9em;"></i>
                    <span style="font-size:0.85em; color:#ccc; font-weight:bold;">Distribución de preguntas</span>
                </div>
                <div style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
        `;

        tipos.forEach(t => {
            const tagColor = _generarColorPorTag(t);
            cuerpo += `
                <div class="mc-regla-row" data-tipo="${_escapeHtml(t)}" data-excluido="false" style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; background:#111; border:1px solid #333;">
                    <button class="mc-btn-exclude" onclick="window.toggleExcludeMC(this)" style="background:transparent; border:none; color:${tagColor}; cursor:pointer; font-size:1.1em; width:24px; display:flex; justify-content:center; transition:0.2s;" title="En la bolsa">
                        <i class="fa-solid fa-check-circle"></i>
                    </button>
                    <span style="font-size:0.8em; color:#ccc; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold;">${_escapeHtml(t)}</span>
                    <input type="number" class="mc-total input-glass" placeholder="Pts total" step="0.25" min="0.25" style="width:75px; font-size:0.75em; padding:4px;">
                    <input type="number" class="mc-valor input-glass" placeholder="Peso c/u" step="0.25" min="0.25" style="width:75px; font-size:0.75em; padding:4px;">
                </div>
            `;
        });
        
        if (tipos.length === 0) cuerpo += `<p style="color:#888; font-size:0.75em;">No tienes tarjetas con apartado asignado.</p>`;
        
        cuerpo += `
                </div>
            </div>
            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:12px; margin-top:5px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <button id="mc-btn-estrategia" onclick="window.toggleEstrategiaMC(this)" data-activo="true" style="background:transparent; border:none; color:var(--status-green); cursor:pointer; font-size:1.5em; display:flex; align-items:center; justify-content:center; transition:0.2s;" title="Activar/Desactivar">
                        <i class="fa-solid fa-lightbulb"></i>
                    </button>
                    <div>
                        <strong style="font-size: 0.95em; color:var(--text-main);">Calcular Estrategia Óptima</strong>
                        <span style="display:block; font-size:0.8em; color:#888; margin-top:2px;">Analiza el retorno marginal (ΔE) de cada concepto.</span>
                    </div>
                </div>
                <div id="mc-estrategia-filtros" style="display:flex; align-items:center; gap:10px; margin-left: 36px;">
                    <i class="fa-solid fa-arrow-turn-up fa-rotate-90" style="color:#444;"></i>
                    <select id="mc-estrategia-tipo" class="input-glass" style="flex:1; font-size:0.85em; padding:6px; border:1px solid #444; border-radius:4px; background:#111; color:#eee;">
                        <option value="">Evaluar todos los tipos</option>
                        ${tipos.map(t => `<option value="${_escapeHtml(t)}">Solo ${_escapeHtml(t)}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;

        const footer = `
            <button onclick="window.lanzarSimulacionDesdeUI()" style="background:rgba(143, 47, 162,0.15); border:1px solid #AE39C6; color:#AE39C6; font-size:0.9em; cursor:pointer; padding:8px 16px; border-radius:6px; font-weight:bold; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-bolt"></i> Ejecutar Análisis
            </button>
        `;

        modalOverlay.innerHTML = _renderEstructuraModal("Arquitectura Estocástica", "fa-solid fa-gears", cuerpo, footer);
    }

    function lanzarSimulacionDesdeUI() {
        const btnEst = document.getElementById('mc-btn-estrategia');
        const config = {
            notaMaxima: parseFloat(document.getElementById('mc-nota-max').value) || 10.0,
            notaObjetivo: parseFloat(document.getElementById('mc-nota-obj').value) || 5.0,
            maxTarjetas: parseInt(document.getElementById('mc-max-preguntas').value) || 10,
            maxPeso: parseFloat(document.getElementById('mc-max-peso').value) || 3.0,
            simulaciones: parseInt(document.getElementById('mc-simulaciones').value) || 3000,
            fechaExamen: document.getElementById('mc-fecha-examen')?.value || null,
            filtroTemaRaw: document.getElementById('mc-filtro-tema-input')?.value || null,
            calcularEstrategia: btnEst ? btnEst.getAttribute('data-activo') === 'true' : false,
            estrategiaFiltroTipo: document.getElementById('mc-estrategia-tipo')?.value || null,
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

    function renderResultadosMonteCarlo(resBase, top5, onClickTarjeta) {
        const modalOverlay = document.getElementById('modal-montecarlo');
        if (!modalOverlay) return;

        if (resBase.error) {
            const errHTML = `<div style="color:#f44336; text-align:center; padding:20px;">${resBase.msg}</div>`;
            modalOverlay.innerHTML = _renderEstructuraModal("Conflicto de Reglas", "fa-solid fa-bug", errHTML, "");
            return;
        }

        let cuerpo = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7em; color:#888; text-transform:uppercase; font-weight:bold;">Media Esperada</div>
                    <div style="font-size:1.6em; font-weight:bold; color:var(--accent);">${resBase.notaMedia} <span style="font-size:0.5em; color:#666;">/ ${resBase.notaMaxima}</span></div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7em; color:#888; text-transform:uppercase; font-weight:bold;">Riesgo (Varianza)</div>
                    <div style="font-size:1.6em; font-weight:bold; color:#facc15;">± ${resBase.desviacion}</div>
                </div>
            </div>

            <div id="mc-estrategia-seccion">
                <h4 style="margin:5px 0 10px 0; font-size:0.9em; color:var(--text-main);"><i class="fa-solid fa-bullseye" style="color:var(--status-blue)"></i> Conceptos de Máximo Retorno (Top 5)</h4>
                <div id="mc-top5-container" style="display:flex; flex-direction:column; gap:6px; margin-bottom: 20px;"></div>
            </div>

            <h4 style="margin:0 0 10px 0; font-size:0.9em; color:var(--text-main);"><i class="fa-solid fa-magnifying-glass-chart" style="color:var(--accent)"></i> Auditoría Estocástica</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        resBase.ejemplos.forEach(ex => {
            const color = ex.aprobado ? '#4caf50' : '#f44336';
            cuerpo += `
                <div style="background:rgba(255,255,255,0.02); border:1px solid ${color}40; border-radius:6px; padding:10px; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <strong style="font-size:0.85em;">Examen Virtual #${ex.id}</strong>
                        <span style="color: ${color}; font-weight: bold; font-size:0.85em;">Nota: ${ex.nota}</span>
                    </div>
                    <div style="font-size: 0.78em; color: #bbb; max-height: 120px; overflow-y: auto; padding-right:5px;">
            `;
            ex.detalles.forEach(d => {
                const icon = d.acertada ? '<i class="fa-solid fa-check" style="color:#4caf50"></i>' : '<i class="fa-solid fa-xmark" style="color:#f44336"></i>';
                const tagColor = _generarColorPorTag(d.tipo);
                
                cuerpo += `
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:flex-start; font-size: 0.9em;">
                        <span style="flex:1; line-height:1.2; padding-right:8px;">
                            <span style="color:${tagColor}; font-weight:bold; margin-right:4px;">[${_escapeHtml(d.tipo)}]</span>
                            ${_escapeHtml(d.titulo)} 
                            <span style="color:#666; font-size:0.85em;">(${d.peso.toFixed(2)} pts)</span> 
                        </span>
                        <span>${icon}</span>
                    </div>`;
            });
            cuerpo += `</div></div>`;
        });
        cuerpo += `</div>`;

        const footer = `
            <button onclick="window.abrirModalMonteCarlo()" class="btn-glass" style="font-size:0.85em; padding:8px 14px; cursor:pointer;">
                <i class="fa-solid fa-rotate-left"></i> Reconfigurar
            </button>
        `;

        modalOverlay.innerHTML = _renderEstructuraModal("Resultados de Simulación", "fa-solid fa-chart-pie", cuerpo, footer);

        const top5Container = document.getElementById('mc-top5-container');
        if (!top5Container) return;

        if (top5 === null) {
            document.getElementById('mc-estrategia-seccion').style.display = 'none';
        } else if (top5.length === 0) {
            top5Container.innerHTML = '<div style="color:#888; text-align:center; font-size:0.85em; padding:10px; background:rgba(0,0,0,0.2); border-radius:6px;">No se identificó beneficio marginal o filtros muy restrictivos.</div>';
        } else {
            top5.forEach(item => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 10px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; cursor: pointer; border: 1px solid #333; transition: 0.2s; display:flex; justify-content:space-between; align-items:center;';
                div.onmouseover = () => div.style.borderColor = 'var(--status-blue)';
                div.onmouseout  = () => div.style.borderColor = '#333';
                div.innerHTML = `
                    <div style="overflow:hidden; padding-right:10px;">
                        <strong style="font-size:0.9em; display:block; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${_escapeHtml(item.titulo)}</strong>
                        <span style="font-size:0.75em; color:#aaa;">Tema ${item.tema} &middot; ${item.apartado}</span>
                    </div>
                    <span style="color:var(--status-green); font-weight:bold; font-size:0.9em; white-space:nowrap;">+${item.deltaNota.toFixed(2)} pts</span>
                `;
                div.onclick = () => onClickTarjeta(item.id);
                top5Container.appendChild(div);
            });
        }
    }

    function cerrarModalMonteCarlo() {
        const modal = document.getElementById('modal-montecarlo');
        if (modal) modal.classList.remove('visible');
    }

    return {
        updateDifficultyStats,
        updateGlobalStats,
        updateCalendarHeatmap,
        updatePronostico,
        updateDeudaEstudio,
        updateCurvaOlvido,
        updateEficienciaWidget,
        updateWeeklyWidget,
        updateWeeklyViewButtons,
        updateMapaHoras,
        updatePomoStats,
        updatePendingWindow,
        updateProbabilidadAprobado,
        renderWidgetMonteCarlo,
        mostrarCargaMonteCarlo,
        actualizarProgresoMarginal,
        lanzarSimulacionDesdeUI,
        abrirModalMonteCarlo,
        cerrarModalMonteCarlo,
        renderResultadosMonteCarlo
    };
})(); 

window.lanzarSimulacionDesdeUI = () => UIDashboard.lanzarSimulacionDesdeUI();
window.abrirModalMonteCarlo    = () => UIDashboard.abrirModalMonteCarlo();
window.cerrarModalMonteCarlo   = () => UIDashboard.cerrarModalMonteCarlo();

window.toggleEstrategiaMC = function(btn) {
    const isActivo = btn.getAttribute('data-activo') === 'true';
    const filtros = document.getElementById('mc-estrategia-filtros');
    
    if (isActivo) {
        btn.setAttribute('data-activo', 'false');
        btn.style.color = '#444';
        if (filtros) {
            filtros.style.opacity = '0.3';
            filtros.style.pointerEvents = 'none';
        }
    } else {
        btn.setAttribute('data-activo', 'true');
        btn.style.color = 'var(--status-green)';
        if (filtros) {
            filtros.style.opacity = '1';
            filtros.style.pointerEvents = 'auto';
        }
    }
};

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