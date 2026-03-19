// ════════════════════════════════════════════════════════════════
// UI.JS — Capa de renderizado / vista
// Grupos 1 y 2 del mapa de migración.
//
// REGLAS:
//   1. Ninguna función escribe estado global.
//   2. Las dependencias de estado se inyectan como parámetros explícitos.
//   3. Puede leer el DOM y mutarlo (ése es su único trabajo).
//   4. No llama a firebase.js ni a localStorage directamente.
//
// Cargado después de domain.js, antes de app.js.
// ════════════════════════════════════════════════════════════════

const UI = (() => {

    // ── Helpers internos de ui.js ─────────────────────────────────
    // escapeHtml se define en app.js y está disponible en window.

    // ── Grupo 1: Renderizado sin parámetros ─────────────────────

    function ocultarTodo() {
        ['welcome-screen', 'study-card', 'editor-card', 'import-card', 'json-editor-card'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    }

    function revelar() {
        const areaRevelar = document.getElementById('area-revelar');
        const contenido = document.getElementById('concepto-contenido');
        const controles = document.getElementById('controles-respuesta');
        const btnOcultar = document.getElementById('btn-ocultar');

        if(areaRevelar) areaRevelar.classList.add('hidden');
        if(contenido) contenido.classList.remove('hidden');
        if(controles) controles.classList.remove('hidden');
        if(btnOcultar) btnOcultar.classList.remove('hidden'); // Forzar aparición
    }

    function ocultarRespuesta() {
        const areaRevelar = document.getElementById('area-revelar');
        const contenido = document.getElementById('concepto-contenido');
        const controles = document.getElementById('controles-respuesta');
        const btnOcultar = document.getElementById('btn-ocultar');

        if(contenido) contenido.classList.add('hidden');
        if(controles) controles.classList.add('hidden');
        if(btnOcultar) btnOcultar.classList.add('hidden'); // Forzar ocultación
        if(areaRevelar) areaRevelar.classList.remove('hidden');
        
        const mainContent = document.getElementById('main-content');
        if(mainContent) mainContent.scrollTop = 0;
    }

    function renderTarjetaVacia() {
        document.getElementById('concepto-titulo').className = "";
        document.getElementById('concepto-titulo').innerText = "Sin tarjetas";
        document.getElementById('concepto-contenido').innerHTML = "<p style='color:#888; text-align:center;'>No hay contenido para este filtro.</p>";
        document.getElementById('concepto-contenido').classList.remove('hidden');
        document.getElementById('area-revelar').classList.add('hidden');
        document.getElementById('controles-respuesta').classList.add('hidden');
        document.getElementById('meta-tema').innerText = "-";
        document.getElementById('meta-fecha').innerText = "-";
    }

function cerrarFechasModal() {
        const modal = document.getElementById('fechas-modal');
        if (modal) modal.classList.remove('visible');
    }

    function abrirAjustes(apiKey, isLocal, proxyUrl, fbConfig, currentModel) { // <--- Nuevo parámetro
        ocultarTodo();
        const modal = document.getElementById('ajustes-modal');
        if (!modal) return;
        
        modal.classList.remove('hidden');

        if (document.getElementById('set-groq-key')) document.getElementById('set-groq-key').value = apiKey || "";
        if (document.getElementById('set-groq-session-only')) document.getElementById('set-groq-session-only').checked = !isLocal;
        if (document.getElementById('set-groq-proxy-url')) document.getElementById('set-groq-proxy-url').value = proxyUrl || "";
        if (document.getElementById('set-firebase-config')) document.getElementById('set-firebase-config').value = fbConfig || "";

        // AÑADIR ESTO: Inicializar el selector de modelos
        const selModel = document.getElementById('selector-modelo-ia');
        if (selModel) {
            selModel.value = currentModel || 'llama-3.3-70b-versatile';
        }
    }

    function cerrarAjustes(){document.getElementById('ajustes-modal').classList.add('hidden');}

    function agregarMensajeChat(role, text) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `chat-msg ${role}`;
        
        // Procesar Markdown básico y Saltos de línea
        // Nota: Para LaTeX complejo, MathJax debe reprocesar
        let html = escapeHtml(text).replace(/\n/g, "<br>");
        
        // Negritas simples (**text**)
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        div.innerHTML = html;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        // Reprocesar MathJax en el nuevo mensaje
        if(typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([div]).catch(()=>null);
        }
    }

    /**
     * @function showResumenSesion
     * @description Despliega el modal de fin de sesión con métricas. 
     * Erradica colores fijos delegando en variables CSS y asegura el casting estricto a String para prevenir excepciones en escapeHtml.
     */
    function showResumenSesion(sesion, deudaAhora) {
        const tarjetas = Number(sesion.tarjetas) || 0;
        const pctFacil = tarjetas > 0 ? Math.round((Number(sesion.faciles) / tarjetas) * 100) : 0;
        const deltaDeuda = Number(sesion.deudaInicial) - Number(deudaAhora);

        document.getElementById('rsm-tarjetas').innerText = escapeHtml(String(tarjetas));
        document.getElementById('rsm-facilidad').innerText = tarjetas > 0 ? escapeHtml(String(pctFacil)) + '%' : '-';
        
        const deudaEl = document.getElementById('rsm-deuda');
        if (deudaEl) { 
            if (deltaDeuda > 0) {
                deudaEl.innerText = '-' + escapeHtml(String(deltaDeuda));
                deudaEl.style.color = 'var(--status-green, #4CAF50)';
            } else if (deltaDeuda < 0) {
                deudaEl.innerText = '+' + escapeHtml(String(Math.abs(deltaDeuda)));
                deudaEl.style.color = 'var(--status-red, #f44336)';
            } else {
                deudaEl.innerText = '=';
                deudaEl.style.color = 'var(--text-muted, #888)';
            }
        }

        let breakdownHtml = '';
        if (tarjetas > 0) {
            const parts = [];
            const f = Number(sesion.faciles) || 0;
            const d = Number(sesion.dificiles) || 0;
            const c = Number(sesion.criticas) || 0;
            const b = tarjetas - f - d - c;

            if (f > 0) parts.push(`🟢 Fáciles: <strong>${escapeHtml(String(f))}</strong>`);
            if (b > 0) parts.push(`🟡 Bien: <strong>${escapeHtml(String(b))}</strong>`);
            if (d > 0) parts.push(`🟠 Difíciles: <strong>${escapeHtml(String(d))}</strong>`);
            if (c > 0) parts.push(`🔴 Críticas: <strong>${escapeHtml(String(c))}</strong>`);
            breakdownHtml = parts.join(' &nbsp;·&nbsp; ');
        }
        document.getElementById('rsm-breakdown').innerHTML = breakdownHtml;

        const mensajes = [
            [0, "Pomodoro completado. ¡Descansa!"],
            [5, "Sesión ligera. Cada tarjeta cuenta."],
            [15, "Buena sesión. ¡Sigue el ritmo!"],
            [30, "Sesión intensa. Mereces el descanso."],
            [Infinity, "¡Bestia! Sesión excepcional."]
        ];
        const msg = mensajes.find(([limit]) => tarjetas <= limit) || mensajes[mensajes.length-1];
        document.getElementById('rsm-mensaje').innerText = escapeHtml(msg[1]);

        const modal = document.getElementById('resumen-sesion-modal');
        if(modal) modal.classList.add('visible');
    }


// ── Grupo 2: Renderizado con inyección de dependencias ───────

    function getEstadoFiltros() {
        return {
            hoy: document.getElementById('check-filtro-hoy')?.checked,
            nuevas: document.getElementById('check-filtro-nuevas')?.checked,
            tema: document.getElementById('check-filtro-tema')?.checked,
            rango: document.getElementById('check-filtro-rango')?.checked,
            tipo: document.getElementById('check-filtro-tipo')?.checked,
            dificultad: document.getElementById('check-filtro-dificultad')?.checked,
            temaVal: document.getElementById('filtro-tema-val')?.value || '',
            rangoVal: document.getElementById('filtro-rango-val')?.value || '',
            tiposSeleccionados: [...document.querySelectorAll('#filtro-tipo-grid input:checked')].map(cb => cb.value.toLowerCase()),
            difsActivas: ['1','2','3','4'].filter(n => document.getElementById(`check-dif-${n}`)?.checked)
        };
    }

    /**
     * @function renderEstadoFiltros
     * @description Refleja visualmente si hay filtros activos en la vista de estudio.
     */
    function renderEstadoFiltros(activos, isSecuencial) {
        const icon = document.getElementById('icon-filtro');
        const count = document.getElementById('contador-filtro');
        if(!icon || !count) return;

        let nFiltros = 0;
        if (activos.temas && activos.temas.length > 0) nFiltros++;
        if (activos.dificultades && activos.dificultades.length > 0) nFiltros++;
        if (activos.tipos && activos.tipos.length > 0) nFiltros++;

        // FIX ARQUITECTÓNICO: Uso estricto de la paleta semántica del sistema
        icon.style.color = nFiltros > 0 ? 'var(--status-green, #4caf50)' : 'var(--status-red, #e53935)';
        
        count.innerText = nFiltros > 0 ? `${nFiltros} filtros` : 'Off';
        
        const btnSeq = document.getElementById('btn-modo-secuencial');
        if (btnSeq) {
            btnSeq.style.color = isSecuencial ? 'var(--status-green, #4caf50)' : 'var(--text-muted, #666)';
            btnSeq.style.borderColor = isSecuencial ? 'var(--status-green, #4caf50)' : 'var(--border, #444)';
        }
    }

    /**
     * @function renderizarConceptoActual
     * @description Renderiza la tarjeta de estudio activa en el DOM, gestionando la visibilidad
     * según el modo de lectura y resolviendo los colores desde la ontología inyectada.
     * Respeta la inmutabilidad y no posee efectos secundarios sobre el estado global.
     * * @param {Object} tarjeta - Objeto de dominio que representa la flashcard actual.
     * @param {boolean} modoLec - Indica si el modo de lectura está activo (true) o no (false).
     * @param {Object} [tiposConfig={}] - Diccionario de configuración visual de tipos de tarjeta (Inyectado por el controlador).
     * @returns {void}
     */
    function renderizarConceptoActual(tarjeta, modoLec, tiposConfig = {}) {
        if (!tarjeta) return;

        const tipo = tarjeta.Apartado || 'Concepto';
        const tit = document.getElementById('concepto-titulo');
        
        // Resolución de color inyectada (Arquitectura Limpia - Cero lecturas a State)
        const colorTipo = tiposConfig[tipo]?.color || 'var(--accent)'; 
        
        tit.style.color = colorTipo;
        tit.innerHTML = `<span style="font-size:0.6em; opacity:0.8; text-transform:uppercase; display:block; margin-bottom:5px;">${escapeHtml(tipo)}</span>${escapeHtml(tarjeta.Titulo || '')}`;
        
        document.getElementById('concepto-contenido').innerHTML = typeof Parser !== 'undefined' ? Parser.sanearLatex(tarjeta.Contenido) : tarjeta.Contenido;

        document.getElementById('meta-tema').innerText = `Tema ${tarjeta.Tema}`;
        
        // Cálculo de fechas y asignación de colores semánticos (Eliminación de hardcoding)
        const fElem = document.getElementById('meta-fecha');
        const hoyVal = fechaValor(getFechaHoy());
        const proxVal = fechaValor(tarjeta.ProximoRepaso);

        if (proxVal < hoyVal) {
            fElem.innerText = "Retraso: " + formatDateForUI(tarjeta.ProximoRepaso);
            fElem.style.color = "var(--status-red)"; 
        } else if (proxVal === hoyVal) {
            fElem.innerText = "Hoy"; 
            fElem.style.color = "var(--status-yellow)";
        } else {
            fElem.innerText = "Adelanto: " + formatDateForUI(tarjeta.ProximoRepaso);
            fElem.style.color = "var(--text-muted, #888)";
        }

        // Gestión de visibilidad (Modo Lectura)
        const btnOcultar = document.getElementById('btn-ocultar');
        if (modoLec) {
            document.getElementById('concepto-contenido').classList.remove('hidden');
            document.getElementById('controles-respuesta').classList.remove('hidden');
            document.getElementById('area-revelar').classList.add('hidden');
            if (btnOcultar) btnOcultar.classList.remove('hidden');
        } else {
            document.getElementById('concepto-contenido').classList.add('hidden');
            document.getElementById('controles-respuesta').classList.add('hidden');
            document.getElementById('area-revelar').classList.remove('hidden');
            if (btnOcultar) btnOcultar.classList.add('hidden');
        }

        // REPROCESADO MATHJAX
        if (typeof MathJax !== 'undefined') {
            const target = document.getElementById('study-card');
            if (target) {
                // 1. Limpiamos cualquier intento de renderizado previo sobre este nodo
                MathJax.typesetClear([target]); 

                // 2. Iniciamos la promesa con captura de error específica
                MathJax.typesetPromise([target]).catch(err => {
                    // Si el error es porque el nodo ya no existe (común en navegación rápida), 
                    // lo ignoramos para no ensuciar el log ni romper el hilo.
                    if (err && (err.message?.includes('replaceChild') || err.stack?.includes('replaceChild'))) {
                        return; 
                    }
                    // Solo registramos errores que no sean por interrupción del DOM
                    Logger.error("Error crítico MathJax:", err);
                });
            }
        }
    }

    function actualizarMenuLateral(bib, asigActual) {
        const lista = document.getElementById('lista-asignaturas'); 
        if (!lista) return;
        lista.innerHTML = "";
        
        const fragment = document.createDocumentFragment();
        
        Object.keys(bib).forEach(nombre => {
            const li = document.createElement('li'); 
            li.className = 'asig-item';
            li.style.setProperty('--dynamic-color', getColorAsignatura(nombre));
            
            if(nombre === asigActual) li.classList.add('active');
            
            li.innerHTML = `
                <span style="flex-grow:1; display:flex; align-items:center; gap:8px;">
                    ${escapeHtml(nombre)}
                </span>
                <div class="asig-actions">
                    <button class="btn-mini" data-action="renombrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Renombrar"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="btn-mini" data-action="borrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Borrar">✕</button>
                </div>
            `;
            
            li.onclick = () => cargarAsignatura(nombre);
            fragment.appendChild(li);
        });
        
        lista.appendChild(fragment); // Único reflow
    }

    function actualizarListaProyectos(projects) {
        const l = document.getElementById('lista-proyectos');
        const sel = document.getElementById('new-task-project');
        if(!l || !sel) return; 
        
        l.innerHTML = "";
        sel.innerHTML = '<option value="">Sin proyecto (General)</option>';
        
        const fragmentL = document.createDocumentFragment();
        const fragmentSel = document.createDocumentFragment();
        
        projects.forEach((p, i) => {
            const pNombre = typeof p === 'string' ? p : p.nombre;
            const pAsig = (typeof p === 'object' && p.asignatura) ? p.asignatura : "";
            const color = pAsig ? window.getColorAsignatura(pAsig) : window.getColorAsignatura(pNombre);

            const li = document.createElement('li'); 
            li.className = 'asig-item';
            li.style.setProperty('--dynamic-color', color);
            
            li.innerHTML = `
                <span style="font-size:0.9em">
                    ${escapeHtml(pNombre)} 
                    <i style="color:#666;font-size:0.8em">${pAsig ? '['+escapeHtml(pAsig)+']' : ''}</i>
                </span> 
                <div class="asig-actions">
                    <button class="btn-mini" data-action="borrarProyecto" data-idx=${i}>✕</button>
                </div>
            `;
            fragmentL.appendChild(li);
            
            const valorGuardado = pAsig ? `${pNombre} : ${pAsig}` : pNombre;
            const textoVisible = pAsig ? `${pNombre} (de ${pAsig})` : pNombre;
            
            const opt = document.createElement('option');
            opt.value = valorGuardado;
            opt.textContent = textoVisible;
            fragmentSel.appendChild(opt);
        });
        
        l.appendChild(fragmentL);
        sel.appendChild(fragmentSel);
    }

    /**
     * @function renderTasks
     * @description Dibuja la lista de tareas restaurando el diseño visual original (barras de progreso, tags), 
     * pero manteniendo la inyección de dependencias estricta en los botones.
     */
    function renderTasks(tasks, callbacks = {}) {
        try {
            // FIX ARQUITECTÓNICO: ID correcto del DOM
            const list = document.getElementById('task-list'); 
            if (!list) return;
            
            list.innerHTML = '';
            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
                list.innerHTML = '<li style="text-align:center; color:var(--text-muted, #888); padding:10px; font-size:0.9em;">Sin tareas</li>';
                if (typeof updateFinishTime === 'function') updateFinishTime();
                return;
            }

            const fragment = document.createDocumentFragment();
            
            tasks.forEach((t, i) => {
                let colorTema = "var(--text-muted, #666)"; 
                const match = t.text.match(/\[(.*?)\]/);
                
                if (match) {
                    let rawTag = match[1].replace(/#/g, '').trim();
                    if (rawTag.includes(':')) {
                        const partes = rawTag.split(':');
                        rawTag = partes[partes.length - 1].trim();
                    }
                    if (typeof window.getColorAsignatura === 'function') {
                        colorTema = window.getColorAsignatura(rawTag);
                    }
                }

                const li = document.createElement('li'); 
                li.style.setProperty('--task-color', colorTema);
                li.className = `task-item ${t.active ? 'active-task' : ''} ${t.done ? 'done' : ''}`;
                
                const rawText = String(t.text || 'Sin título');
                const safeText = (typeof window.escapeHtml === 'function') ? window.escapeHtml(rawText) : rawText;
                
                const comp = Number(t.completed) || 0;
                const est = Number(t.est) || 1; // FIX: Mapeo correcto de propiedad

                li.innerHTML = `
                    <div style="flex-grow:1; display:flex; flex-direction:column; pointer-events:none;">
                        <span style="color:${t.done ? '#888' : '#e0e0e0'}; font-weight:500;">${safeText}</span>
                        <div class="task-progress-bg" style="width:100%; height:4px; background:rgba(255,255,255,0.1); margin-top:5px; border-radius:2px; overflow:hidden;">
                            <div style="height:100%; background:${colorTema}; width:${Math.min(100, (comp/est)*100)}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    
                    <div style="display:flex; flex-direction:column; align-items:flex-end; margin-left:15px; z-index:2;">
                        <span class="pomo-count" style="color:${colorTema}; font-weight:bold; font-size:0.9em;">${comp}/${est}</span>
                        <div style="display:flex; gap:5px; margin-top:4px; opacity:0.6; transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.6">
                            <button data-action="editTask" style="background:none;border:none;color:var(--text-muted,#aaa);cursor:pointer; font-size:1.1em;" title="Modificar"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button data-action="toggleDone" style="background:none;border:none;color:${t.done ? 'var(--status-green,#4caf50)' : 'var(--text-muted,#aaa)'};cursor:pointer; font-size:1.1em;">&check;</button>
                            <button data-action="deleteTask" style="background:none;border:none;color:var(--status-red,#d32f2f);cursor:pointer; font-size:1.1em;">✕</button>
                        </div>
                    </div>
                `;

                // Delegación de eventos pura
                li.onclick = (e) => {
                    const btn = e.target.closest('button');
                    if (btn) {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        if (action === 'deleteTask' && callbacks.onDelete) callbacks.onDelete(i);
                        else if (action === 'toggleDone' && callbacks.onToggleDone) callbacks.onToggleDone(i);
                        else if (action === 'editTask' && callbacks.onEdit) callbacks.onEdit(i);
                    } else {
                        if (callbacks.onToggleActive) callbacks.onToggleActive(i);
                    }
                };
                
                fragment.appendChild(li);
            });
            
            list.appendChild(fragment);
        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error("Error crítico en UI.renderTasks:", error);
        }
    }

    function updateTimerDisplay(segsLeft, mode) { 
        const m = Math.floor(segsLeft / 60).toString().padStart(2, '0');
        const s = (segsLeft % 60).toString().padStart(2, '0');
        const timeStr = `${m}:${s}`;
        
        // 1. Actualizar Tarjeta Grande (si existe)
        const bigTimer = document.getElementById('timer-display');
        if(bigTimer) bigTimer.innerText = timeStr;
        
        // 2. Actualizar Mini Widget
        const miniTimer = document.getElementById('mini-timer-display');
        if(miniTimer) miniTimer.innerText = timeStr;
        
        // 3. Título del navegador
        document.title = `${timeStr} - ${mode === 'work' ? 'Work' : 'Break'}`;
    }


    /**
     * @function updateFinishTime
     * @description Actualiza la vista de la estimación sin destruir el DOM.
     * Solo renderiza, la capa de controlador (pomodoro.js) es la que inyecta la hora final calculada.
     */
    function updateFinishTime(remainingPomos, horaStr, tiempoStr) {
        const emptyMsg     = document.getElementById('pomo-empty-msg');
        const statusContent = document.getElementById('pomo-status-content');
        const remainCount  = document.getElementById('pomo-remain-count');
        const tiempoEl     = document.getElementById('pomo-remain-time');  // añadido
        const etaValue     = document.getElementById('pomo-eta-value');
        const faltan = Number(remainingPomos) || 0;
        if (faltan <= 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            if (statusContent) statusContent.style.display = 'none';
        } else {
            if (emptyMsg) emptyMsg.style.display = 'none';
            if (statusContent) statusContent.style.display = 'block';
            if (remainCount) remainCount.textContent = `${faltan}🍅`;
            if (tiempoEl) tiempoEl.textContent = tiempoStr || '--';   // añadido
            if (etaValue) etaValue.textContent = horaStr || '--:--';
        }
    }


    /**
     * @function renderFechasList
     * @description Dibuja la lista del modal de agenda. Verifica la existencia de contenedores
     * antes de inyectar fragmentos.
     */
    function renderFechasList(fechas) {
        const list = document.getElementById('fechas-list');
        const emptyMsg = document.getElementById('fechas-empty');
        
        // FIX ARQUITECTÓNICO: Guardia contra derreferencia nula
        if (!list || !emptyMsg) return;

        list.innerHTML = '';
        if (!fechas || fechas.length === 0) {
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';

        const fragment = document.createDocumentFragment();
        fechas.forEach((fc, i) => {
            const li = document.createElement('li');
            li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);";
            
            const safeFecha = escapeHtml(formatDateForUI(fc.fecha));
            const safeNombre = escapeHtml(fc.nombre);
            const safeTipo = escapeHtml(fc.tipo);
            const colorTipo = TIPOS_EVENTO[fc.tipo]?.color || '#888';

            li.innerHTML = `
                <div>
                    <strong>${safeFecha}</strong> - ${safeNombre} 
                    <span style="font-size:0.8em; color:${colorTipo}; border:1px solid ${colorTipo}; padding:2px 4px; border-radius:3px; margin-left:6px;">${safeTipo}</span>
                </div>
                <button class="btn-icon" data-idx="${i}" style="color:var(--status-red);"><i class="fa-solid fa-trash"></i></button>
            `;
            // Delegación de eventos temporal (hasta que extraigamos la lógica al controlador)
            li.querySelector('button').onclick = () => {
                if(typeof window.eliminarFecha === 'function') window.eliminarFecha(i);
            };
            fragment.appendChild(li);
        });
        list.appendChild(fragment);
    }

    /**
     * @function renderUpcomingEvents
     * @description Renderiza la lista de eventos inminentes. Implementa paleta semántica
     * y sanitización estricta para evitar la inyección de atributos HTML en los tooltips.
     */
    function renderUpcomingEvents(fechas) {
        const container = document.getElementById('upcoming-events-list');
        if (!container) return;
        
        container.innerHTML = '';
        const hoyTs = parseDateSafe(new Date()).getTime();
        
        let futuros = fechas.filter(fc => {
            const fechaVal = parseDateSafe(fc.fecha);
            return fechaVal && fechaVal.getTime() >= hoyTs;
        });
        
        futuros.sort((a, b) => parseDateSafe(a.fecha).getTime() - parseDateSafe(b.fecha).getTime());
        
        if (futuros.length === 0) {
            container.innerHTML = '<div class="empty-msg" style="color: var(--text-muted, #888); text-align: center; padding: 10px;">No hay eventos próximos</div>';
            return;
        }
        
        futuros.slice(0, 5).forEach(ev => {
            const el = document.createElement('div');
            el.className = 'event-item';
            el.style.cssText = 'display:flex; align-items:center; margin-bottom:10px;';
            
            let iconHtml = '<i class="fas fa-calendar-alt" style="color: var(--accent);"></i>';
            if (ev.tipo === 'examen') iconHtml = '<i class="fas fa-file-alt" style="color: var(--status-red, #d95550);"></i>';
            if (ev.tipo === 'entrega') iconHtml = '<i class="fas fa-tasks" style="color: var(--status-green, #4CAF50);"></i>';
            
            const safeTipo = escapeHtml(String(ev.tipo || 'EVENTO')).toUpperCase();
            const safeNombre = escapeHtml(String(ev.nombre || ''));
            
            el.title = `${safeNombre} - ${safeTipo}`;
            
            const fechaUI = escapeHtml(formatDateForUI(ev.fecha));
            const diasFaltantes = diffDiasCalendario(new Date(), ev.fecha);
            
            let badgeHtml = '';
            if (diasFaltantes === 0) badgeHtml = '<span class="badge" style="background:var(--status-red, #d95550); padding:2px 6px; border-radius:4px; font-size:0.8em; color:#fff;">HOY</span>';
            else if (diasFaltantes === 1) badgeHtml = '<span class="badge" style="background:var(--status-yellow, #e67e22); padding:2px 6px; border-radius:4px; font-size:0.8em; color:#fff;">Mañana</span>';
            else badgeHtml = `<span class="badge" style="background:var(--status-blue, #256ca5); padding:2px 6px; border-radius:4px; font-size:0.8em; color:#fff;">Faltan ${escapeHtml(String(diasFaltantes))}d</span>`;

            el.innerHTML = `
                <div class="event-icon" style="margin-right: 12px; font-size: 1.2em;">${iconHtml}</div>
                <div class="event-details" style="flex: 1;">
                    <div class="event-name" style="font-weight: bold; color: var(--text-main);">${safeNombre}</div>
                    <div class="event-date" style="font-size: 0.85em; color: var(--text-muted, #aaa);">${fechaUI} ${badgeHtml}</div>
                </div>
            `;
            
            container.appendChild(el);
        });
    }

    function abrirFechasModal(bib, asigActual) {
        const sel = document.getElementById('fk-asig');
        if (sel) {
            sel.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = '';
            allOption.textContent = '— Todas las asignaturas —';
            sel.appendChild(allOption);
            Object.keys(bib || {}).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = a;
                sel.appendChild(opt);
            });
            if (asigActual) sel.value = asigActual;
        }
        
        const modal = document.getElementById('fechas-modal');
        if (modal) modal.classList.add('visible');
    }

    function actualizarDesplegableMini(lista, colores) {
        const select = document.getElementById('mini-task-select');
        if(!select) return;

        // 1. Guardar la selección actual si no ha cambiado por evento
        const currentActive = lista.findIndex(t => t.active);

        // 2. Limpiar
        select.innerHTML = '<option value="-1">-- Sin tarea activa --</option>';

        // 3. Rellenar con pendientes
        lista.forEach((t, index) => {
            if (!t.done) {
                const opt = document.createElement('option');
                opt.value = index; // El valor es el índice real en el array lista
                
                // Texto: Acortar si es muy largo para que quepa
                const textoCorto = t.text.length > 40 ? t.text.substring(0, 38) + "..." : t.text;
                opt.text = textoCorto;

                // Marcar si es la activa actualmente
                if (t.active) {
                    opt.selected = true;
                    // Cambiar estilo del select para indicar actividad
                    select.style.borderColor = "var(--accent)";
                    select.style.color = "white";
                }
                
                select.appendChild(opt);
            }
        });

        // Reset visual si no hay activa
        if (currentActive === -1) {
            select.style.borderColor = "#444";
            select.style.color = "#ccc";
            select.value = "-1";
        }
    }

    function renderColorSettings(bib) {
        const container = document.getElementById('settings-colors-list');
        if(!container) return;
        container.innerHTML = "";
        
        const keys = ["General", ...Object.keys(bib)];
        
        keys.forEach(k => {
            const div = document.createElement('div');
            div.style.cssText = "display:flex; align-items:center; justify-content:space-between; background:#222; padding:8px 10px; border-radius:4px; margin-bottom:5px; border:1px solid #333;";
            
            const label = document.createElement('span');
            label.innerText = k;
            label.style.fontSize = "0.9em";
            label.style.color = "#ccc";
            
            const wrapper = document.createElement('div');
            wrapper.style.display = "flex";
            wrapper.style.gap = "8px";

            const valHex = rgbToHex(getColorAsignatura(k));

            // Input Texto
            const textIn = document.createElement('input');
            textIn.type = "text";
            textIn.value = valHex.toUpperCase();
            textIn.style.cssText = "width:70px; background:#111; border:1px solid #444; color:#fff; padding:5px; text-align:center; font-family:monospace; border-radius:3px;";
            
            // Input Color
            const colorIn = document.createElement('input');
            colorIn.type = "color";
            colorIn.value = valHex;
            colorIn.id = `color-input-${k}`;
            colorIn.style.cssText = "border:none; width:35px; height:30px; cursor:pointer; background:none; padding:0;";

            // Eventos
            colorIn.oninput = (e) => textIn.value = e.target.value.toUpperCase();
            textIn.onchange = (e) => { 
                if(e.target.value.startsWith('#')) colorIn.value = e.target.value; 
            };

            wrapper.appendChild(textIn);
            wrapper.appendChild(colorIn);
            div.appendChild(label);
            div.appendChild(wrapper);
            container.appendChild(div);
        });
    }

    /**
     * @function updatePronostico
     * @description Renderiza el gráfico de barras del pronóstico de repasos para los próximos 7 días.
     * Implementa saneamiento XSS y respeta la jerarquía de variables de color del sistema.
     * @param {Array} counts - Array de objetos conteniendo la carga por día { dayLabel, count, isToday }.
     * @param {number} maxCount - Valor máximo para el escalado proporcional de las barras.
     * @returns {void}
     */
    function updatePronostico(counts, maxCount) {
        const container = document.getElementById('pronostico-bars');
        if (!container) return;

        container.innerHTML = "";
        if (!counts || counts.length === 0) {
            container.innerHTML = "<div style='color:var(--text-muted, #888); font-size:0.85em; text-align:center;'>Sin datos para pronóstico</div>";
            return;
        }

        const fragment = document.createDocumentFragment();

        counts.forEach(c => {
            // Altura mínima garantizada de 2% para visualización de barras vacías
            const h = Math.max((c.count / maxCount) * 100, 2);
            
            // Resolución de color arquitectónica
            let barColor = "var(--border, #444)";
            if (c.isToday) barColor = "var(--accent)";
            else if (c.count > 20) barColor = "var(--status-red, #f44336)";
            else if (c.count > 0) barColor = "var(--status-blue, #2196F3)";

            const col = document.createElement('div');
            col.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; flex:1;";
            
            const safeLabel = escapeHtml(c.dayLabel);
            const safeCount = escapeHtml(c.count);

            col.innerHTML = `
                <span style="font-size:0.65em; margin-bottom:4px; color:var(--text-muted, #888);">${safeCount > 0 ? safeCount : ''}</span>
                <div style="width:60%; height:${h}%; background:${barColor}; border-radius:3px 3px 0 0; min-height:4px; transition: height 0.3s ease;"></div>
                <span style="font-size:0.6em; margin-top:4px; color:${c.isToday ? 'var(--text-main, #eee)' : 'var(--text-muted, #888)'}; font-weight:${c.isToday ? 'bold' : 'normal'};">${safeLabel}</span>
            `;
            fragment.appendChild(col);
        });

        container.appendChild(fragment);
    }

    /**
     * @function updateDeudaEstudio
     * @description Renderiza el widget de deuda FSRS. Elimina el CSS-in-JS hardcodeado 
     * delegando la responsabilidad visual a variables CSS semánticas (--status-green, --status-red).
     * @param {number} deudaTotal - Valor numérico total de la carga cognitiva pendiente.
     * @param {Object} contadores - Desglose absoluto de tarjetas por estado (nuevas, learning, etc.).
     * @param {Object} deudaDesglose - Desglose ponderado de la deuda por estado.
     * @returns {void}
     */
    function updateDeudaEstudio(deudaTotal, contadores, deudaDesglose) {
        const scoreEl = document.getElementById('deuda-score');
        const listEl = document.getElementById('deuda-list');
        if (!scoreEl || !listEl) return;

        // Formateo seguro a 1 decimal
        const dt = Math.round((deudaTotal || 0) * 10) / 10;
        scoreEl.innerText = dt;

        // Uso estricto de variables CSS del tema activo
        if (dt === 0) {
            scoreEl.style.color = 'var(--status-green, #4CAF50)';
        } else if (dt < 10) {
            scoreEl.style.color = 'var(--status-yellow, #FFC107)';
        } else {
            scoreEl.style.color = 'var(--status-red, #f44336)';
        }

        listEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:var(--text-muted, #888);"><i class="fa-solid fa-leaf" style="color:var(--status-green)"></i> Nuevas (${escapeHtml(contadores.nuevas || 0)})</span>
                <span style="font-weight:bold; color:var(--text-main);">${(Math.round((deudaDesglose.nuevas || 0) * 10) / 10).toFixed(1)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:var(--text-muted, #888);"><i class="fa-solid fa-book-open" style="color:var(--status-blue)"></i> Aprendizaje (${escapeHtml(contadores.learning || 0)})</span>
                <span style="font-weight:bold; color:var(--text-main);">${(Math.round((deudaDesglose.learning || 0) * 10) / 10).toFixed(1)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:var(--text-muted, #888);"><i class="fa-solid fa-rotate-right" style="color:var(--text-main)"></i> Repaso (${escapeHtml(contadores.repasoNormal || 0)})</span>
                <span style="font-weight:bold; color:var(--text-main);">${(Math.round((deudaDesglose.repasoNormal || 0) * 10) / 10).toFixed(1)}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-muted, #888);"><i class="fa-solid fa-triangle-exclamation" style="color:var(--status-red)"></i> Críticas (${escapeHtml(contadores.criticas || 0)})</span>
                <span style="font-weight:bold; color:var(--status-red, #f44336);">${(Math.round((deudaDesglose.criticas || 0) * 10) / 10).toFixed(1)}</span>
            </div>
        `;
    }

    function updateEficienciaWidget(bib, asigActual, pomoLogHoy) {
        const elTarjetas = document.getElementById('ef-tarjetas');
        const elRatio = document.getElementById('ef-ratio');
        const elFacilidad = document.getElementById('ef-facilidad');
        const elSesiones = document.getElementById('ef-sesiones');
        if (!elTarjetas) return;

        const todayStr = getFechaHoy();
        let todayLog = pomoLogHoy || { count: 0, details: {} };

        // Si el log es de otro día, lo tratamos como vacío para la interfaz
        if (todayLog.date !== todayStr) todayLog = { count: 0, details: {} };

        let pomosHoy = 0;
        let tarjetasRepasadasHoy = 0;
        let tarjetasFacilesHoy = 0;

        if (asigActual && bib[asigActual]) {
            // 1. CONTEXTO ESPECÍFICO: Solo la asignatura seleccionada
            const asigNorm = asigActual.toLowerCase().trim();
            
            // Contar Pomodoros de esta asignatura
            Object.keys(todayLog.details || {}).forEach(k => {
                if (k.toLowerCase().trim() === asigNorm) {
                    pomosHoy += todayLog.details[k];
                }
            });

            // Contar Tarjetas estudiadas hoy en esta asignatura
            bib[asigActual].forEach(c => {
                if (c.UltimoRepaso && toISODateString(c.UltimoRepaso) === todayStr) {
                    tarjetasRepasadasHoy++;
                    if (parseInt(c.Dificultad) === 1) tarjetasFacilesHoy++;
                }
            });
        } else {
            // 2. CONTEXTO GLOBAL: Sumatorio total del día
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

        // 3. CÁLCULO DE RENDIMIENTO MATEMÁTICAMENTE ESTRICTO
        const ratio = pomosHoy > 0 ? (tarjetasRepasadasHoy / pomosHoy).toFixed(1) : (tarjetasRepasadasHoy > 0 ? tarjetasRepasadasHoy : '-');
        const pctFacil = tarjetasRepasadasHoy > 0 ? Math.round((tarjetasFacilesHoy / tarjetasRepasadasHoy) * 100) + '%' : '-';

        // 4. INYECCIÓN DOM
        elTarjetas.innerText = tarjetasRepasadasHoy;
        elRatio.innerText = ratio;
        elFacilidad.innerText = pctFacil;
        elSesiones.innerText = pomosHoy;
    }


// ── Grupo 3: Renderizado con I/O extraída al wrapper ─────────

    /**
     * @function updateDifficultyStats
     * @description Renderiza la barra de distribución de fases FSRS.
     * Desvincula el CSS de la lógica JS e implementa coerción de tipos segura.
     */
    function updateDifficultyStats(counts, prevSnap, total, pendientesHoy) {
        const elTotal = document.getElementById('total-cards-count');
        const elHoy = document.getElementById('today-cards-count');
        if(elTotal) elTotal.innerText = escapeHtml(String(total || 0));
        if(elHoy) elHoy.innerText = escapeHtml(String(pendientesHoy || 0));

        const labels = { 0: "Nuevas", 1: "Fáciles", 2: "Bien", 3: "Difíciles", 4: "Críticas" };
        const colors = { 
            0: "var(--border, #9e9e9e)", 
            1: "var(--status-blue, #2196F3)", 
            2: "var(--status-green, #4CAF50)", 
            3: "var(--status-yellow, #FF9800)", 
            4: "var(--status-red, #f44336)" 
        };

        let html = "";
        [0, 4, 3, 2, 1].forEach(k => { 
            const val = counts[k] || 0;
            const pct = total > 0 ? (val / total) * 100 : 0;
            let deltaHtml = '<span class="diff-delta neutral">—</span>';
            
            if (prevSnap) {
                const diff = val - (prevSnap[k] || 0);
                if (diff > 0) deltaHtml = `<span class="diff-delta up">+${escapeHtml(String(diff))}</span>`;
                else if (diff < 0) deltaHtml = `<span class="diff-delta down">${escapeHtml(String(diff))}</span>`;
                else deltaHtml = `<span class="diff-delta neutral">·</span>`;
            }
            html += `
                <div class="diff-bar-row">
                    <div class="diff-label">${labels[k]}</div>
                    <div class="diff-track">
                        <div class="diff-fill" style="width:${pct}%; background:${colors[k]}; transition: width 0.3s ease;"></div>
                    </div>
                    <div class="diff-val">${escapeHtml(String(val))}</div>
                    ${deltaHtml}
                </div>`;
        });
        
        const containerBars = document.getElementById('dist-bars');
        if(containerBars) containerBars.innerHTML = html;
    }

    /**
     * @function updateGlobalStats
     * @description Renderiza las estadísticas globales. Implementa Null-Checks estrictos
     * para evitar excepciones silenciosas si el layout muta.
     */
    function updateGlobalStats(streak, totalDiasActivos, msgActividad) {
        const elStreak = document.getElementById('global-streak');
        const elTotal = document.getElementById('global-total-days');
        const elMsg = document.getElementById('global-activity-msg');

        if (elStreak) elStreak.innerText = escapeHtml(String(streak || 0));
        if (elTotal) elTotal.innerText = escapeHtml(String(totalDiasActivos || 0));
        if (elMsg) elMsg.innerText = escapeHtml(String(msgActividad || ''));
    }

    /**
     * @function updateCalendarHeatmap
     * @description Dibuja el mapa de calor del mes actual. Implementa delegación de eventos 
     * (onmouseover/onmouseout) para el panel de pendientes, erradicando los closures anidados por día.
     * @param {Object} bib - Biblioteca completa de asignaturas.
     * @param {string} asigActual - Nombre de la asignatura seleccionada.
     * @param {Array} fechas - Array de eventos de la agenda.
     * @param {Date} viewDate - Fecha de referencia para el mes renderizado.
     * @returns {void}
     */
    function updateCalendarHeatmap(bib, asigActual, fechas, viewDate) {
        const container = document.getElementById('calendar-heatmap');
        const title = document.getElementById('calendar-month-title');
        if(!container) return;
        
        container.innerHTML = "";

        // 1. Delegación de Eventos Estricta
        container.onmouseleave = () => {
            if(typeof updatePendingWindow === 'function') updatePendingWindow(null);
        };

        container.onmouseover = (e) => {
            const dayDiv = e.target.closest('.heatmap-day[data-interactive="true"]');
            if (!dayDiv) return;
            const dStr = dayDiv.getAttribute('data-date');
            if (dStr && typeof updatePendingWindow === 'function') updatePendingWindow(dStr);
        };

        const year  = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const monthNames = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
        title.innerText = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1);
        const lastDay  = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1;
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
                        const fueRepasadaDespues = c.UltimoRepaso && fechaValor(c.UltimoRepaso) >= pVal;
                        if (!fueRepasadaDespues) missedCount[pISO] = (missedCount[pISO] || 0) + 1;
                    } else if (pVal > todayVal) {
                        futureCount[pISO] = (futureCount[pISO] || 0) + 1;
                    }
                }
            });
        }

        let eventMap = {};
        fechas.forEach(ev => {
            const evISO = toISODateString(ev.fecha);
            if (!eventMap[evISO]) eventMap[evISO] = [];
            eventMap[evISO].push(ev);
        });

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < startDay; i++) {
            const pad = document.createElement('div');
            pad.className = 'heatmap-day';
            pad.style.cssText = 'background:transparent; border:none; pointer-events:none;';
            fragment.appendChild(pad);
        }

        for (let i = 1; i <= numDays; i++) {
            const dStr = toISODateString(new Date(year, month, i));
            const dVal = fechaValor(dStr);
            const div  = document.createElement('div');
            div.className = 'heatmap-day';
            div.innerText = i;
            // Injectamos meta-data para la delegación
            div.setAttribute('data-date', dStr);

            const done   = doneCount[dStr] || 0;
            const missed = missedCount[dStr] || 0;
            const future = futureCount[dStr] || 0;

            let estado = 'vacio';
            if (dVal < todayVal) {
                if (done > 0 && missed > 0) estado = 'mixed';
                else if (missed > 0)        estado = 'missed';
                else if (done > 0)          estado = 'done';
            } else if (dVal === todayVal) {
                estado = done > 0 ? 'today-done' : 'today';
            } else {
                if (future > 0) estado = 'future';
            }

            switch (estado) {
                case 'done': div.classList.add('day-past-done'); break;
                case 'missed': div.classList.add('day-past-missed'); break;
                case 'mixed': 
                    div.classList.add('day-past-done'); 
                    div.style.boxShadow = 'inset 0 -3px 0 var(--status-red, #bb0e02)'; 
                    break;
                case 'today': div.classList.add('day-today-indicator'); break;
                case 'today-done': div.classList.add('day-today-indicator', 'day-today-active'); break;
                case 'future': div.classList.add('day-future-pending'); break;
            }

            let tipLines = [formatDateForUI(dStr)];
            if (done > 0)   tipLines.push(`✓ ${done} repasadas`);
            if (missed > 0) tipLines.push(`⚠ ${missed} pendientes`);
            if (future > 0) tipLines.push(`📅 ${future} programadas`);
            if (dVal === todayVal && done === 0) tipLines.push('Hoy · sin repasos aún');

            const eventos = eventMap[dStr] || [];
            if (eventos.length > 0) {
                const weights = { dominant: 3, strong: 2, subtle: 1 };
                const ev = eventos.reduce((a, b) => (weights[TIPOS_EVENTO[a.tipo]?.weight] || 0) >= (weights[TIPOS_EVENTO[b.tipo]?.weight] || 0) ? a : b);
                const tipo = TIPOS_EVENTO[ev.tipo] || TIPOS_EVENTO.otro;
                const color = getColorEvento(ev);

                if (tipo.weight === 'dominant') {
                    div.className = 'heatmap-day'; 
                    div.style.background = color;
                    div.style.color = '#fff';
                    div.style.fontWeight = 'bold';
                    div.style.boxShadow = `0 0 8px ${color}99`;
                    div.style.outline = `2px solid ${color}`;
                    div.style.outlineOffset = '-2px';
                } else if (tipo.weight === 'strong') {
                    div.style.background = color;
                    div.style.color = '#fff';
                    div.style.fontWeight = 'bold';
                    if (estado === 'missed' || estado === 'mixed') div.style.boxShadow = `inset 0 -4px 0 var(--status-red, #bb0e02)`;
                    else if (estado === 'done' || estado === 'today-done') div.style.boxShadow = `inset 0 -4px 0 var(--status-blue)`;
                    else div.style.boxShadow = `0 0 5px ${color}88`;
                } else {
                    const dot = document.createElement('span');
                    dot.className = 'event-dot';
                    dot.style.background = color;
                    div.appendChild(dot);
                }
                eventos.forEach(e => tipLines.push(`★ ${escapeHtml(e.nombre)}${e.asig ? ' · ' + escapeHtml(e.asig) : ''}`));
            }

            div.setAttribute('data-tip', tipLines.join('\n'));

            // Marcamos para que la delegación lo intercepte
            if (estado !== 'vacio' || eventos.length > 0) {
                div.setAttribute('data-interactive', 'true');
            }

            fragment.appendChild(div);
        }
        
        container.appendChild(fragment);
    }

    function updatePomoStats(horario, asigActual, lista, pomoLogHoy) {
        try {
            // --- 1. CARGA PENDIENTE (TAREAS) ---
            let pendingPomos = 0;
            const currentAsigNorm = asigActual ? asigActual.toLowerCase().trim() : "";
            
            lista.forEach(t => { 
                if (!t.done) {
                    const match = t.text.match(/\[(.*?)\]/);
                    const tag = match ? match[1].toLowerCase().trim() : "general";
                    
                    // Si estamos en vista global, o la etiqueta coincide con la asignatura, o es general
                    if (!asigActual || tag === "general" || tag === currentAsigNorm) {
                        pendingPomos += Math.max(0, t.est - t.completed);
                    }
                }
            });

            // --- 2. RECUPERAR DATOS DEL LOG ---
            let todayLog = pomoLogHoy;
            const todayStr = getFechaHoy();
            // Reset diario si la fecha no coincide
            if(todayLog.date !== todayStr) { todayLog = {date: todayStr, count: 0, details:{}}; }
            
            const details = todayLog.details || {};
            const diaSemana = (new Date().getDay() + 6) % 7; // Lunes=0

            // --- 3. CÁLCULO DE METAS (GOALS) ---
            let metaSpecific = 0;
            let metaGeneral = (horario["General"] && horario["General"][diaSemana]) || 0;

            if (asigActual && horario[asigActual]) {
                metaSpecific = horario[asigActual][diaSemana] || 0;
            } else if (!asigActual) {
                // Vista GLOBAL: Sumar todas las metas específicas excepto General
                Object.keys(horario).forEach(k => {
                    if(k !== "General") metaSpecific += (horario[k][diaSemana] || 0);
                });
            }

            const localGoal = metaSpecific + metaGeneral;
            const goalElem = document.getElementById('pomo-goal-today');
            // Mostrar guión si no hay meta definida
            if(goalElem) goalElem.innerText = localGoal > 0 ? localGoal : (metaGeneral > 0 ? metaGeneral : "-");

            // --- 4. CÁLCULO DE LO HECHO (Lógica Robusta) ---
            let countSpecific = 0;
            
            if (asigActual) {
                // Iteramos sobre las claves guardadas para sumar coincidencias sin duplicar
                const target = asigActual.toLowerCase().trim();
                Object.keys(details).forEach(key => {
                    if (key.toLowerCase().trim() === target) {
                        countSpecific += details[key];
                    }
                });
            } else {
                // En modo global, el "específico" es el total absoluto del día
                countSpecific = todayLog.count; 
            }

            // Spillover: Lo que se ha hecho fuera del contexto actual
            const totalDaily = todayLog.count;
            const countOthers = Math.max(0, totalDaily - countSpecific);

            // LÓGICA DE VISUALIZACIÓN (Vasos Comunicantes)
            const baseSpecific = Math.min(countSpecific, metaSpecific); // Llenar meta específica
            const spillSpecific = Math.max(0, countSpecific - metaSpecific); // Lo que sobra de la específica
            const availableForGeneral = spillSpecific + countOthers; // Sobrante + Otros
            const filledGeneral = Math.min(metaGeneral, availableForGeneral); // Llenar meta general

            // Total a representar en el anillo
            let doneContextual = 0;
            if (!asigActual) {
                doneContextual = totalDaily;
            } else {
                doneContextual = baseSpecific + filledGeneral;
            }

            // --- 5. RENDERIZADO VISUAL (SEGMENTOS) ---
            let gradientParts = [];
            let currentDeg = 0;
            let breakdownHTML = "";
            
            let remainingToPaint = doneContextual;
            const totalToRepresent = Math.max(doneContextual, localGoal, 1); // Evitar división por 0

            // A. PINTAR ASIGNATURA ACTUAL (Prioridad visual)
            if (asigActual && countSpecific > 0 && remainingToPaint > 0) {
                const take = Math.min(countSpecific, remainingToPaint);
                const deg = (take / totalToRepresent) * 360;
                const color = getColorAsignatura(asigActual);
                
                gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
                currentDeg += deg;
                remainingToPaint -= take;
                
                breakdownHTML += `<div><span style="color:${color};"><i class='fa-regular fa-circle-dot'></i></span> ${asigActual}: <strong>${countSpecific}</strong></div>`;
            }

            // B. PINTAR RESTO (Relleno del hueco General con otras materias)
            if (remainingToPaint > 0) {
                Object.keys(details).forEach(asig => {
                    // Saltamos la asignatura actual (ya pintada o no relevante)
                    if (asigActual && asig.toLowerCase().trim() === currentAsigNorm) return;
                    
                    const val = details[asig];
                    if (val > 0) {
                        const take = Math.min(val, remainingToPaint);
                        if (take > 0) {
                            const deg = (take / totalToRepresent) * 360;
                            const color = getColorAsignatura(asig);
                            
                            gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
                            currentDeg += deg;
                            remainingToPaint -= take;
                            breakdownHTML += `<div><span style="color:${color};"><i class='fa-regular fa-circle-dot'></i></span> ${asig}: <strong>${val}</strong></div>`;
                        }
                    }
                });
            }

            // UI Updates
            const doneElem = document.getElementById('pomo-done-today');
            if(doneElem) {
                doneElem.innerText = doneContextual;
                doneElem.onclick = editarProgresoManual;
            }

            // Fondo Gris (Restante para la meta)
            if (doneContextual < localGoal) {
                gradientParts.push(`#333 ${currentDeg}deg 360deg`);
            }

            const donut = document.getElementById('daily-donut');
            const bdDiv = document.getElementById('today-breakdown');
            
            if (donut) donut.style.background = doneContextual > 0 ? `conic-gradient(${gradientParts.join(', ')})` : `conic-gradient(#333 0% 100%)`;
            if (bdDiv) bdDiv.innerHTML = breakdownHTML || "<span style='opacity:0.5; font-size:0.8em'>Sin actividad relevante</span>";
            
            const pct = Math.round((doneContextual / Math.max(localGoal,1)) * 100);
            document.getElementById('daily-progress-text').innerText = pct + "%";
        

        } catch(e) { Logger.error("Error en updatePomoStats:", e); }
    }

    /**
     * @function updateWeeklyWidget
     * @description Renderiza el gráfico de barras histórico. Utiliza delegación de eventos en el 
     * contenedor principal para mostrar popups, previniendo la acumulación de listeners (Memory Leaks).
     * @param {Object} horario - Configuración de metas diarias.
     * @param {Object} bib - Biblioteca completa de tarjetas.
     * @param {string} viewMode - Modo de vista actual ('7d' o '28d').
     * @param {Object} pomoHistory - Historial de pomodoros de días anteriores.
     * @param {Object} pomoLogHoy - Registro de pomodoros del día actual.
     * @param {Object} pomoDetailsHistory - Desglose de materias estudiadas históricamente.
     * @returns {void}
     */
    function updateWeeklyWidget(horario, bib, viewMode, pomoHistory, pomoLogHoy, pomoDetailsHistory) {
        const container = document.getElementById('weekly-chart-container');
        if(!container) return;
        
        container.innerHTML = "";
        
        const history = pomoHistory || {};
        const todayLog = pomoLogHoy || {};
        const todayStr = getFechaHoy();
        
        const days = viewMode === '28d' ? 28 : 7;
        let totalPomos = 0;
        let daysMetGoal = 0;

        // 1. Delegación de eventos centralizada para el contenedor
        container.onclick = function(e) {
            const col = e.target.closest('.weekly-col-item');
            if (!col) return;
            
            document.querySelectorAll('.bar-popup').forEach(p => p.remove());
            
            const dateStr = col.getAttribute('data-date');
            const logEntry = dateStr === todayStr ? (todayLog.date === todayStr ? todayLog : null) : null;
            const details = logEntry ? logEntry.details : (pomoDetailsHistory[dateStr] || {});
            
            const valNum = parseInt(col.getAttribute('data-val') || '0', 10);
            const goalNum = parseInt(col.getAttribute('data-goal') || '0', 10);

            let popupHtml = `<strong>${dateStr}</strong><br>${valNum}/${goalNum} pomos<br>`;
            if (Object.keys(details).length > 0) {
                Object.entries(details).forEach(([asig, n]) => { popupHtml += `${escapeHtml(asig)}: ${n}<br>`; });
            } else {
                popupHtml += `Sin desglose`;
            }
            
            const popup = document.createElement('div');
            popup.className = 'bar-popup';
            popup.innerHTML = popupHtml;
            col.style.position = 'relative';
            col.appendChild(popup);
            setTimeout(() => popup.remove(), 3000);
        };

        // 2. Cálculo de máximos
        let allVals = [];
        for(let i = days-1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dStr = formatearFecha(d);
            allVals.push(dStr === todayStr ? ((todayLog.date === todayStr ? todayLog.count : 0) || 0) : (history[dStr] || 0));
        }
        const maxVal = Math.max(...allVals, 1);
        
        // 3. Renderizado de columnas
        const fragment = document.createDocumentFragment();
        
        for(let i = days-1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dStr = formatearFecha(d);
            const dayNames = ["D","L","M","X","J","V","S"];
            const dayLabel = dayNames[d.getDay()];
            const isToday = i === 0;
            
            let val = dStr === todayStr ? ((todayLog.date === todayStr ? todayLog.count : 0) || 0) : (history[dStr] || 0);
            const dayIndex = (d.getDay() + 6) % 7; 
            
            let dailyGoal = 0;
            if (horario) {
                Object.keys(horario).forEach(asig => {
                    if (bib[asig] || asig === "General") dailyGoal += (horario[asig][dayIndex] || 0);
                });
            }
            if(dailyGoal === 0) dailyGoal = 4;
            
            const isMet = val >= dailyGoal && val > 0;
            if(isMet) daysMetGoal++;
            totalPomos += val;
            
            let barColor = isMet ? "var(--status-green, #19a693)" : (isToday ? "var(--accent)" : "var(--border, #666)");
            let numColor = isMet ? "var(--status-green, #19a693)" : (isToday ? "var(--text-main, white)" : "var(--text-muted, #aaa)");
            
            const maxRef = Math.max(maxVal, dailyGoal);
            const h = Math.min(100, (val / maxRef) * 100);
            const goalH = Math.min(100, (dailyGoal / maxRef) * 100);

            const col = document.createElement('div');
            // Inyectamos clase semántica para la delegación de eventos
            col.className = 'weekly-col-item';
            col.style.cssText = `flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; position:relative; cursor:pointer;`;
            col.setAttribute('data-date', dStr);
            col.setAttribute('data-val', val);
            col.setAttribute('data-goal', dailyGoal);
            col.title = `${dStr} — ${val}/${dailyGoal} pomos`;

            col.innerHTML = `
                <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; position:relative;">
                    ${val > 0 && viewMode === '7d' ? `<span style="font-size:0.7em; margin-bottom:2px; font-weight:bold; color:${numColor};">${val}</span>` : ''}
                    <div style="width:${viewMode === '28d' ? '80' : '60'}%; height:${Math.max(h, 2)}%; background:${barColor}; border-radius:3px 3px 0 0; transition:height 0.5s; z-index:2; min-height:4px;"></div>
                    <div style="position:absolute; bottom:${goalH}%; width:100%; height:1px; border-top:1px dashed rgba(255,255,255,0.2); z-index:1; pointer-events:none;"></div>
                </div>
                <span style="font-size:${viewMode === '28d' ? '0.45' : '0.6'}em; margin-top:4px; color:${isToday ? 'var(--text-main, white)' : 'var(--text-muted, #666)'}; font-weight:${isToday ? 'bold' : 'normal'}">${dayLabel}</span>
            `;
            fragment.appendChild(col);
        }
        
        container.appendChild(fragment);
        
        const elMet = document.getElementById('weekly-goals-met');
        const elTotal = document.getElementById('weekly-total');
        if(elMet) elMet.innerText = `${daysMetGoal}/${days}`;
        if(elTotal) elTotal.innerText = totalPomos;
    }

    function updateMapaHoras(horaHistory) {
        const container = document.getElementById('hora-heatmap-container');
        const bestEl = document.getElementById('hora-best');
        if (!container) return;
        
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const maxVal = Math.max(...Object.values(horaHistory), 1);

        let bestHora = -1, bestVal = 0;
        
        for (let h = 0; h < 24; h++) {
            const val = horaHistory[h] || 0;
            if (val > bestVal) { bestVal = val; bestHora = h; }
            
            const intensity = val / maxVal;
            const r = Math.round(25 + intensity * 25);
            const g = Math.round(166 * intensity);
            const b = Math.round(147 * intensity);
            const bg = val === 0 ? 'var(--menu-color)' : `rgb(${r},${g},${b})`;

            const cell = document.createElement('div');
            cell.className = 'hora-cell';
            cell.style.backgroundColor = bg;
            cell.setAttribute('data-tip', `${String(h).padStart(2,'0')}:00 — ${val} pomos`);
            if (val > 0) cell.innerText = val;
            
            fragment.appendChild(cell);
        }

        container.appendChild(fragment); // Único reflow

        if (bestHora >= 0 && bestVal > 0) {
            bestEl.innerHTML = `<i class="fa-solid fa-rotate" style="color: #e09f12;"></i> Mejor hora: ${String(bestHora).padStart(2,'0')}:00 (${bestVal} pomos)`;
        } else {
            bestEl.innerText = 'Sin datos aún';
        }
    }

    function updatePendingWindow(bib, asigActual, fechaEspecifica = null) {
        const listContainer = document.getElementById('pending-list-items');
        const countDisplay = document.getElementById('pending-total-count');
        const titleWidget = document.querySelector('#widget-pendientes .stat-title');
        
        if(!listContainer || !countDisplay) return;
        listContainer.innerHTML = "";
        
        if(!asigActual || !bib[asigActual]) {
            countDisplay.innerText = "0";
            listContainer.innerHTML = "<li class='pending-empty-msg'>Selecciona asignatura</li>";
            return;
        }

        const cards = bib[asigActual];
        let filtrados = [];
        let tituloEstado = "Ventana de Pendientes (Hoy + Atrasados)";

        if (fechaEspecifica) {
            filtrados = cards.filter(c => c.ProximoRepaso === fechaEspecifica);
            tituloEstado = `Programado para el ${formatDateForUI(fechaEspecifica)}`;
        } else {
            const todayVal = fechaValor(getFechaHoy());
            filtrados = cards.filter(c => c.ProximoRepaso && fechaValor(c.ProximoRepaso) <= todayVal);
            tituloEstado = "Ventana de Pendientes (Hoy)";
        }

        if(titleWidget) titleWidget.innerText = tituloEstado;

        countDisplay.innerText = filtrados.length;
        countDisplay.className = filtrados.length > 0 ? 'text-danger' : (fechaEspecifica ? 'text-muted' : 'text-success');

        if(filtrados.length === 0) {
            const msg = fechaEspecifica ? "Nada programado" : '¡Todo al día! <i class="fa-solid fa-dove"></i>';
            listContainer.innerHTML = `<li class='pending-empty-msg'>${msg}</li>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        filtrados.forEach(c => {
            const li = document.createElement('li');
            li.className = 'asig-item pending-item';
            
            let difText = "N";
            let colorVar = "var(--text-muted)";
            
            if (c.Dificultad) {
                difText = c.Dificultad;
                if(difText == 1) colorVar = "var(--status-blue)";
                if(difText == 2) colorVar = "var(--status-green)";
                if(difText == 3) colorVar = "var(--status-yellow)";
                if(difText == 4) colorVar = "var(--status-red)";
            } else if (c.EtapaRepaso > 0) {
                difText = "?";
            }

            // BLINDAJE XSS + Uso de CSS Variables Estrictas
            li.innerHTML = `
                <span class="pending-item-title">${escapeHtml(c.Titulo)}</span>
                <span style="font-weight:bold; color:${colorVar};">(${difText})</span>
            `;
            fragment.appendChild(li);
        });
        
        listContainer.appendChild(fragment);
        
        if(typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([listContainer]).catch(err => Logger.error(err));
        }
    }

    function renderControlesModoEstudio(isSecuencial) {
        // Usa los selectores originales de tu HTML
        const btnPrev = document.getElementById('btn-prev') || document.querySelector('[onclick*="anteriorTarjeta"]');
        const btnNextText = document.getElementById('btn-next-text');
        const nextShortcut = document.getElementById('next-shortcut');

        if (isSecuencial) {
            if(btnPrev) btnPrev.classList.remove('hidden');
            if(btnNextText) btnNextText.innerText = "Siguiente"; 
            if(nextShortcut) nextShortcut.innerText = "[→]"; 
        } else {
            if(btnPrev) btnPrev.classList.add('hidden');
            if(btnNextText) btnNextText.innerText = "Siguiente (Random)";
            if(nextShortcut) nextShortcut.innerText = "[→]"; 
        }
    }

    function renderHorarioGrid(horario, bib, diaSeleccionado) {
        const contenedor = document.getElementById('schedule-grid-container');
        if (!contenedor) return;
        contenedor.innerHTML = "";
        const dias = ["L", "M", "X", "J", "V", "S", "D"];
        const nombresDias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
        

        dias.forEach((letra, i) => {
            const box = document.createElement('div');
            box.className = `schedule-day-box ${i === diaSeleccionado ? 'selected' : ''}`;
            box.onclick = () => seleccionarDiaHorario(i, nombresDias[i]);
            
            // Etiqueta del día
            const label = document.createElement('div');
            label.className = 'day-label';
            label.innerText = letra;
            box.appendChild(label);

            // Contenido (Asignaturas)
            const content = document.createElement('div');
            content.className = 'day-content';
            
            // Buscar qué asignaturas tienen carga este día (i)
            Object.keys(horario).forEach(asig => {
                const horas = horario[asig][i]; // i va de 0 (Lunes) a 6
                if (horas > 0) {
                    const tag = document.createElement('div');
                    tag.className = 'mini-subject-tag';
                    tag.style.backgroundColor = getColorAsignatura(asig);
                    tag.innerText = `${asig} (${horas}🍅)`;
                    content.appendChild(tag);
                }
            });
            
            box.appendChild(content);
            contenedor.appendChild(box);
        });
    }
    function toggleDashboardVisibility(isVisible) {
        const dashboardCol = document.getElementById('dashboard-col');
        if (dashboardCol) {
            if (isVisible) dashboardCol.classList.remove('hidden');
            else dashboardCol.classList.add('hidden');
        }
    }

    function updateWeeklyViewButtons(mode) {
        const btn7 = document.getElementById('btn-week-7');
        const btn28 = document.getElementById('btn-week-28');
        if (btn7) btn7.classList.toggle('active', mode === '7d');
        if (btn28) btn28.classList.toggle('active', mode === '28d');
    }

    function cerrarResumenSesion() {
        const modal = document.getElementById('resumen-sesion-modal');
        if (modal) modal.classList.remove('visible');
    }

function renderRecursos(asigActual, recursos, slots) {
        const contenedor = document.getElementById('lista-recursos-slots');
        if(!contenedor) return;
        contenedor.innerHTML = "";

        if (!asigActual) return;
        
        // Uso de fallback inmutable. Cero mutación de dependencias externas.
        const lista = recursos[asigActual] || [];
        
        if(lista.length === 0) {
            contenedor.innerHTML = "<span style='font-size:0.8em; color:#444; font-style:italic;'>Sin libros. Añade uno a la derecha.</span>";
            return;
        }

        lista.forEach((nombreLibro, index) => {
            const key = `${asigActual}_${index}`;
            const isLoaded = !!slots[key]; 
            
            const div = document.createElement('div');
            let classes = "slot-chip";
            if(isLoaded) classes += " loaded";
            
            div.className = classes;
            div.title = isLoaded ? "Ver libro" : "Haga clic para cargar el archivo PDF";
            div.onclick = () => { if(typeof window.clickEnSlot === 'function') window.clickEnSlot(index); };
            
            const icon = isLoaded ? '📖' : '📥';
            const safeNombre = window.escapeHtml ? window.escapeHtml(nombreLibro) : nombreLibro;
            
            div.innerHTML = `
                <span>${icon} ${safeNombre}</span>
                <button class="slot-del-btn" data-action="borrarSlot" data-idx=${index} title="Olvidar referencia">✕</button>
            `;
            contenedor.appendChild(div);
        });
    }
function cambiarPestanaAjustes(tabId) {
        // 1. Recorrer todos los botones de pestaña declarados
        document.querySelectorAll('.stab').forEach(btn => {
            // A. Desactivar el estado visual del botón
            btn.classList.remove('stab-active');
            
            // B. Encontrar el panel vinculado a este botón y forzar su ocultación
            const idPanelVinculado = btn.getAttribute('data-stab');
            if (idPanelVinculado) {
                const panel = document.getElementById(idPanelVinculado);
                if (panel) {
                    panel.classList.add('hidden');
                    panel.style.display = 'none'; // Blindaje extra contra CSS rebelde
                }
            }
        });

        // 2. Activar visualmente el botón que fue clicado
        const btnActivo = document.querySelector(`.stab[data-stab="${tabId}"]`);
        if (btnActivo) {
            btnActivo.classList.add('stab-active');
        }

        // 3. Mostrar únicamente el panel solicitado
        const panelActivo = document.getElementById(tabId);
        if (panelActivo) {
            panelActivo.classList.remove('hidden');
            panelActivo.style.display = ''; // Cede el control al CSS original (block/flex)
        }
    }

    // ── ADAPTADORES DEL EDITOR Y JSON ─────────────────────────────
    
    function abrirEditorAmigable(concepto, idxNavegacion, totalCola) {
        ocultarTodo();
        const editorCard = document.getElementById('editor-card');
        if(editorCard) editorCard.classList.remove('hidden');
        
        document.getElementById('edit-titulo').value = concepto.Titulo || "";
        document.getElementById('edit-contenido').value = concepto.Contenido || "";
        document.getElementById('edit-tema').value = concepto.Tema || 1;
        document.getElementById('edit-apartado').value = concepto.Apartado || "Definición";

        const idxLabel = document.getElementById('edit-idx-label');
        if(idxLabel) idxLabel.innerText = `(Tarjeta ${idxNavegacion + 1} de ${totalCola})`;
    }

    function getEditorData() {
        return {
            titulo: document.getElementById('edit-titulo')?.value.trim() || "",
            contenido: document.getElementById('edit-contenido')?.value.trim() || "",
            tema: parseInt(document.getElementById('edit-tema')?.value) || 1,
            apartado: document.getElementById('edit-apartado')?.value || "Definición"
        };
    }

    /**
     * @function limpiarEditorData
     * @description Purga los campos de entrada del editor reteniendo las referencias.
     */
    function limpiarEditorData() {
        const tituloEl = document.getElementById('edit-titulo');
        const contenidoEl = document.getElementById('edit-contenido');
        
        if (tituloEl) tituloEl.value = "";
        if (contenidoEl) contenidoEl.value = "";
    }

    function mostrarFeedbackGuardadoEditor() {
        const btn = document.getElementById('btn-guardar-edicion-amigable');
        if(btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Guardado!';
            btn.classList.add('btn-success');
            setTimeout(() => { 
                btn.innerHTML = originalText; 
                btn.classList.remove('btn-success'); 
            }, 1000);
        }
    }

    /**
     * @function setBtnIAModo
     * @description Controla el estado semántico de carga del botón IA.
     * Utiliza la propiedad 'disabled' nativa para garantizar la accesibilidad y el bloqueo real.
     */
    function setBtnIAModo(isProcessing) {
        const btn = document.getElementById('btn-guardarnuevoconcepto');
        if(!btn) return;
        
        if (isProcessing) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-microchip fa-fade"></i> Pensando...';
            btn.disabled = true; // FIX ARQUITECTÓNICO
        } else {
            btn.innerHTML = btn.dataset.original || '<i class="fa-solid fa-floppy-disk"></i> Guardar';
            btn.disabled = false; // FIX ARQUITECTÓNICO
        }
    }

    function abrirEditorJSON(tarjetasSaneadas) {
        ocultarTodo();
        const jsonCard = document.getElementById('json-editor-card');
        if (jsonCard) jsonCard.classList.remove('hidden');
        const area = document.getElementById('json-editor-area');
        if (area) area.value = JSON.stringify(tarjetasSaneadas, null, 4);
    }

    function cancelarEdicion(hasAsignatura) {
        ocultarTodo();
        if (hasAsignatura) {
            document.getElementById('study-card').classList.remove('hidden');
        } else {
            document.getElementById('welcome-screen').classList.remove('hidden');
        }
    }
    // ── ADAPTADORES DE CONFIGURACIÓN Y ESTILO ─────────────────────

    /**
     * @function getAjustesData
     * @description Recopila todos los valores de los inputs del modal de ajustes.
     * @param {Array<string>} clavesAsignaturas - Lista de nombres para mapear colores.
     * @returns {Object} Diccionario plano con toda la configuración.
     */
    function getAjustesData(clavesAsignaturas = []) {
        const formData = {
            pomo: {
                work: parseInt(document.getElementById('set-work')?.value) || 35,
                short: parseInt(document.getElementById('set-short')?.value) || 5,
                long: parseInt(document.getElementById('set-long')?.value) || 15,
                cyclesBeforeLong: parseInt(document.getElementById('set-cycles')?.value) || 4,
                autoStart: document.getElementById('check-auto-start')?.checked || false
            },
            ia: {
                apiKey: document.getElementById('set-groq-key')?.value.trim() || "",
                sessionOnly: !!document.getElementById('set-groq-session-only')?.checked,
                proxyUrl: document.getElementById('set-groq-proxy-url')?.value.trim() || ""
            },
            firebase: {
                configStr: document.getElementById('set-firebase-config')?.value.trim() || ""
            },
            colores: {},
            privacidad: {
                shareStats: document.getElementById('set-privacy-stats')?.checked || false
            }
        };

        clavesAsignaturas.forEach(k => {
            const input = document.getElementById(`color-input-${k}`);
            if(input) formData.colores[k] = input.value;
        });

        return formData;
    }

    /**
     * @function aplicarColorAsignaturaActiva
     * @description Muta visualmente los acentos de la UI basados en el color inyectado.
     */
    function aplicarColorAsignaturaActiva(color) {
        const hBar = document.getElementById('pdf-header-bar');
        const modPdf = document.getElementById('modulo-pdf');
        if (hBar) { 
            hBar.style.background = color; 
            hBar.style.borderColor = color; 
        }
        if (modPdf) {
            modPdf.style.setProperty('--dynamic-color', color);
        }
    }
    /**
     * @function pedirNombreAsignatura
     * @description Genera un modal DOM asíncrono y no bloqueante para sustituir al prompt() nativo.
     * @param {Function} callback - Función que recibe el string introducido o null si se cancela.
     */
    function pedirNombreAsignatura(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter: blur(3px);";
        
        const modal = document.createElement('div');
        modal.style.cssText = "background:var(--card-bg, #1e1e1e); padding:25px; border-radius:12px; width:320px; text-align:center; border:1px solid var(--border, #333); box-shadow: 0 8px 32px rgba(0,0,0,0.6);";
        
        const title = document.createElement('h3');
        title.innerText = "Nueva Asignatura";
        title.style.cssText = "margin-top:0; color:var(--text-main, #eee); font-size: 1.2em; margin-bottom: 15px;";
        
        const input = document.createElement('input');
        input.type = "text";
        input.placeholder = "Nombre (ej: Termodinámica)";
        input.style.cssText = "width:100%; padding:12px; margin-bottom:20px; border-radius:6px; border:1px solid var(--border, #444); background:var(--bg-color, #121212); color:var(--text-main, #eee); box-sizing:border-box; outline:none; font-size: 1em;";
        input.onfocus = () => input.style.borderColor = "var(--accent, #00ffcc)";
        input.onblur  = () => input.style.borderColor = "var(--border, #444)";
        
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = "display:flex; justify-content:space-between; gap: 10px;";
        
        const btnsubir = document.createElement('button');
        btnsubir.innerText = "Subir Archivo";
        btnsubir.style.cssText = "flex: 1; background:transparent; border:1px solid var(--border, #555); color:var(--text-muted, #aaa); padding:10px; border-radius:6px; cursor:pointer; font-weight: 500; transition: all 0.2s;";
        btnsubir.onmouseover = () => { btnsubir.style.background = "var(--border, #333)"; btnsubir.style.color = "var(--text-main, #eee)"; };
        btnsubir.onmouseout  = () => { btnsubir.style.background = "transparent"; btnsubir.style.color = "var(--text-muted, #aaa)"; };
        
        const btnOk = document.createElement('button');
        btnOk.innerText = "Crear";
        btnOk.style.cssText = "flex: 1; background:var(--accent, #00ffcc); color:#000; font-weight:bold; border:none; padding:10px; border-radius:6px; cursor:pointer; transition: opacity 0.2s;";
        btnOk.onmouseover = () => btnOk.style.opacity = "0.8";
        btnOk.onmouseout  = () => btnOk.style.opacity = "1";

        const close = (val) => {
            document.body.removeChild(overlay);
            callback(val);
        };

        btnsubir.onclick = () => close(null);
        btnOk.onclick = () => close(input.value);
        input.onkeydown = (e) => { 
            if(e.key === 'Enter') btnOk.click(); 
            if(e.key === 'Escape') btnsubir.click(); 
        };

        btnContainer.appendChild(btnsubir);
        btnContainer.appendChild(btnOk);
        modal.appendChild(title);
        modal.appendChild(input);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        input.focus();
    }

    /**
     * @function setEstadoCargaFragmentacionIA
     * @description Controla el estado visual del botón de fragmentación IA (Spinner).
     * @param {boolean} isProcessing - True para estado de carga, False para restaurar.
     */
    function setEstadoCargaFragmentacionIA(isProcessing) {
        const btn = document.getElementById('btn-fragmentar-ia');
        if (!btn) return;
        
        if (isProcessing) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.original || '<i class="fa-solid fa-scissors"></i> Fragmentar con IA';
            btn.disabled = false;
        }
    }


// ════════════════════════════════════════════════════════════════
// Namespace UI — Exportación pública
// ════════════════════════════════════════════════════════════════
    return {
        ocultarTodo,
        revelar,
        ocultarRespuesta,
        renderTarjetaVacia,
        cerrarFechasModal,
        abrirAjustes,
        cerrarAjustes,
        agregarMensajeChat,
        showResumenSesion,
        renderizarConceptoActual,
        actualizarMenuLateral,
        actualizarListaProyectos,
        renderTasks,
        updateTimerDisplay,
        updateFinishTime,
        renderFechasList,
        renderUpcomingEvents,
        abrirFechasModal,
        actualizarDesplegableMini,
        renderColorSettings,
        updatePronostico,
        updateDeudaEstudio,
        updateEficienciaWidget,
        updateDifficultyStats,
        updateCalendarHeatmap,
        updatePomoStats,
        updateWeeklyWidget,
        updateMapaHoras,
        updatePendingWindow,
        renderHorarioGrid,
        renderRecursos,
        cambiarPestanaAjustes,
        getEstadoFiltros,
        renderEstadoFiltros,
        updateGlobalStats,
        toggleDashboardVisibility,
        updateWeeklyViewButtons,
        cerrarResumenSesion,
        renderControlesModoEstudio,
        abrirEditorAmigable,
        getEditorData,
        limpiarEditorData,
        mostrarFeedbackGuardadoEditor,
        setBtnIAModo,
        abrirEditorJSON,
        cancelarEdicion,
        getAjustesData,
        aplicarColorAsignaturaActiva,
        pedirNombreAsignatura,
        setEstadoCargaFragmentacionIA,
    };
})();

window.cambiarPestanaAjustes = UI.cambiarPestanaAjustes;