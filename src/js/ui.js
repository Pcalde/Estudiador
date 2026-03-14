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
    document.getElementById('fechas-modal').classList.remove('visible');
    updateCalendarHeatmap();
    renderUpcomingEvents();
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

    function showResumenSesion(sesion) {
        const tarjetas = sesion.tarjetas;
        const pctFacil = tarjetas > 0 ? Math.round((sesion.faciles / tarjetas) * 100) : 0;
        const deudaAhora = calcularDeuda();
        const deltaDeuda = sesion.deudaInicial - deudaAhora;

        document.getElementById('rsm-tarjetas').innerText = tarjetas;
        document.getElementById('rsm-facilidad').innerText = tarjetas > 0 ? pctFacil + '%' : '-';
        
        const deudaEl = document.getElementById('rsm-deuda');
        if (deltaDeuda > 0) {
            deudaEl.innerText = '-' + deltaDeuda;
            deudaEl.style.color = '#4CAF50';
        } else if (deltaDeuda < 0) {
            deudaEl.innerText = '+' + Math.abs(deltaDeuda);
            deudaEl.style.color = '#f44336';
        } else {
            deudaEl.innerText = '=';
            deudaEl.style.color = '#888';
        }

        let breakdownHtml = '';
        if (tarjetas > 0) {
            const parts = [];
            if (sesion.faciles > 0) parts.push(` Fáciles: <strong>${sesion.faciles}</strong>`);
            const bien = tarjetas - sesion.faciles - sesion.dificiles - sesion.criticas;
            if (bien > 0) parts.push(`ðŸŸ¡ Bien: <strong>${bien}</strong>`);
            if (sesion.dificiles > 0) parts.push(`ðŸŸ  Difíciles: <strong>${sesion.dificiles}</strong>`);
            if (sesion.criticas > 0) parts.push(`ðŸ”´ Críticas: <strong>${sesion.criticas}</strong>`);
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
        document.getElementById('rsm-mensaje').innerText = msg[1];

        document.getElementById('resumen-sesion-modal').classList.add('visible');
    }


// ── Grupo 2: Renderizado con inyección de dependencias ───────



    function renderizarConceptoActual(tarjeta, modoLec) {
        if(!tarjeta) return;

        const tipo = tarjeta.Apartado || 'Definición';
        const tit = document.getElementById('concepto-titulo');
        
        // Asignamos la clase de color al contenedor
        tit.className = `color-${tipo}`; 
        
        tit.innerHTML = `<span style="font-size:0.6em; opacity:0.8; text-transform:uppercase; display:block; margin-bottom:5px;">${escapeHtml(tipo)}</span>${escapeHtml(tarjeta.Titulo || '')}`;
        
        // FIX CRÍTICO: Referencia explícita al módulo Parser
        document.getElementById('concepto-contenido').innerHTML = typeof Parser !== 'undefined' ? Parser.sanearLatex(tarjeta.Contenido) : tarjeta.Contenido;
        
        document.getElementById('meta-tema').innerText = `Tema ${tarjeta.Tema}`;
        
        // Cálculo de fechas
        const fElem = document.getElementById('meta-fecha');
        const hoyVal = fechaValor(getFechaHoy());
        const proxVal = fechaValor(tarjeta.ProximoRepaso);

        if (proxVal < hoyVal) {
            fElem.innerText = "Retraso: " + formatDateForUI(tarjeta.ProximoRepaso);
            fElem.style.color = "#ff5252"; 
        } else if (proxVal === hoyVal) {
            fElem.innerText = "Hoy"; 
            fElem.style.color = "#ffab40";
        } else {
            fElem.innerText = "Adelanto: " + formatDateForUI(tarjeta.ProximoRepaso);
            fElem.style.color = "#888";
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

        // REPROCESADO MATHJAX:
        if(typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([document.getElementById('study-card')]).catch(err => Logger.error(err));
        }
    }

    function actualizarMenuLateral(bib, asigActual) {
        const lista = document.getElementById('lista-asignaturas'); 
        lista.innerHTML = "";
        
        Object.keys(bib).forEach(nombre => {
            const li = document.createElement('li'); 
            li.className = 'asig-item';
            
            // --- INYECCIÓN DE COLOR DINÁMICO ---
            // Obtenemos el color configurado o generado por hash
            const colorAsignatura = getColorAsignatura(nombre);
            // Lo asignamos a una variable CSS local para este elemento
            li.style.setProperty('--dynamic-color', colorAsignatura);
            
            if(nombre === asigActual) li.classList.add('active');
            
            // Renderizado del contenido
            li.innerHTML = `
                <span style="flex-grow:1; display:flex; align-items:center; gap:8px;">
                    ${nombre}
                </span>
                <div class="asig-actions">
                    <button class="btn-mini" data-action="renombrarAsignatura" data-nombre=${nombre} title="Renombrar"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="btn-mini" data-action="borrarAsignatura" data-nombre=${nombre} title="Borrar">✕</button>
                </div>
            `;
            
            li.onclick = () => cargarAsignatura(nombre);
            lista.appendChild(li);
        });
    }

    function actualizarListaProyectos(projects) {
        const l = document.getElementById('lista-proyectos');
        const sel = document.getElementById('new-task-project');
        
        if(!l || !sel) return; 
        
        l.innerHTML = "";
        sel.innerHTML = '<option value="">Sin proyecto (General)</option>';
        
        projects.forEach((p, i) => {
            const pNombre = typeof p === 'string' ? p : p.nombre;
            const pAsig = (typeof p === 'object' && p.asignatura) ? p.asignatura : "";
            
            // Usamos window.getColorAsignatura porque estamos en UI
            const color = pAsig ? window.getColorAsignatura(pAsig) : window.getColorAsignatura(pNombre);

            const li = document.createElement('li'); 
            li.className = 'asig-item';
            li.style.setProperty('--dynamic-color', color);
            
            li.innerHTML = `
                <span style="font-size:0.9em">
                    ${pNombre} 
                    <i style="color:#666;font-size:0.8em">${pAsig ? '['+pAsig+']' : ''}</i>
                </span> 
                <div class="asig-actions">
                <button class="btn-mini" data-action="borrarProyecto" data-idx=${i}>x</button>
                </div>
            `;
            l.appendChild(li);
            
            // El formato compuesto crucial para el backend
            const valorGuardado = pAsig ? `${pNombre} : ${pAsig}` : pNombre;
            const textoVisible = pAsig ? `${pNombre} (de ${pAsig})` : pNombre;
            
            sel.innerHTML += `<option value="${valorGuardado}">${textoVisible}</option>`;
        });
    }

    function renderTasks(lista) {
        const l = document.getElementById('task-list'); 
        l.innerHTML = "";
        
        lista.forEach((t, i) => {
            // 1. DETECCIÓN INTELIGENTE DE COLOR (Misma lógica robusta)
            let colorTema = "#666"; 
            const match = t.text.match(/\[(.*?)\]/);
            
            if (match) {
                let rawTag = match[1].replace(/#/g, '').trim();
                if (rawTag.includes(':')) {
                    const partes = rawTag.split(':');
                    rawTag = partes[partes.length - 1].trim();
                }
                colorTema = getColorAsignatura(rawTag);
            }

            const li = document.createElement('li'); 
            
            // 2. INYECCIÓN DE LA VARIABLE CSS
            // Esto permite que el CSS controle todas las animaciones hover/active
            li.style.setProperty('--task-color', colorTema);
            
            li.className = `task-item ${t.active ? 'active-task' : ''} ${t.done ? 'done' : ''}`;
            
            // Evento Click
            li.onclick = (e) => { 
                if(e.target.tagName !== 'BUTTON') toggleActive(i); 
                updatePomoStats();
            };
            
            // 3. RENDERIZADO
            // Nota: Usamos 'colorTema' para los textos y barra, pero el contenedor usa la variable CSS
            li.innerHTML = `
                <div style="flex-grow:1; display:flex; flex-direction:column;">
                    <span style="color:${t.done ? '#888' : '#e0e0e0'}; font-weight:500;">${t.text}</span>
                    <div class="task-progress-bg">
                        <div style="height:100%; background:${colorTema}; width:${Math.min(100, (t.completed/t.est)*100)}%; transition: width 0.3s;"></div>
                    </div>
                </div>
                
                <div style="display:flex; flex-direction:column; align-items:flex-end; margin-left:15px;">
                    <span class="pomo-count" style="color:${colorTema}; font-weight:bold; font-size:0.9em;">${t.completed}/${t.est}</span>
                    <div style="display:flex; gap:5px; margin-top:4px; opacity:0.6; transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.6">
                        <button data-action="editTask" data-idx=${i} style="background:none;border:none;color:#aaa;cursor:pointer; font-size:1.1em;" title="Modificar"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button data-action="toggleDone" data-idx=${i} style="background:none;border:none;color:${t.done ? 'var(--accent)' : '#aaa'};cursor:pointer; font-size:1.1em;">&check;</button>
                        <button data-action="deleteTask" data-idx=${i} style="background:none;border:none;color:#d32f2f;cursor:pointer; font-size:1.1em;">✕</button>
                    </div>
                </div>
            `;
            l.appendChild(li);
        });
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

function updateFinishTime(lista, config) {
    let pomosRestantes = 0; 
    
    // Calcular carga
    lista.forEach(t => {
        if (!t.done) pomosRestantes += Math.max(0, t.est - t.completed);
    });

    // --- CÁLCULO DE TIEMPO (Lógica existente) ---
    const tWork = config.work;
    const tShort = config.short;
    const tLong = config.long;
    
    let minutosTotales = 0;
    for (let i = 1; i <= pomosRestantes; i++) {
        minutosTotales += tWork;
        if (i < pomosRestantes) {
            if (i % 4 === 0) minutosTotales += tLong;
            else minutosTotales += tShort;
        }
    }

    const now = new Date();
    now.setMinutes(now.getMinutes() + minutosTotales);
    const endH = String(now.getHours()).padStart(2, '0');
    const endM = String(now.getMinutes()).padStart(2, '0');
    const finishString = `${endH}:${endM}`;

    // --- 1. ACTUALIZAR MODAL GRANDE ---
    const displayBig = document.getElementById('finish-time-display');
    if(displayBig) {
        if (pomosRestantes === 0) {
            displayBig.innerHTML = "<span style='color:#666'>Todo al día</span>";
        } else {
            const durH = Math.floor(minutosTotales / 60);
            const durM = minutosTotales % 60;
            displayBig.innerHTML = `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px; font-size:0.9em;">
                    <span>Restan: <strong style="color:#eee">${pomosRestantes}🍅</strong></span>
                    <span>Tiempo: <strong style="color:#eee">${durH}h ${durM}m</strong></span>
                </div>


                
                <div style="background: linear-gradient(145deg, rgba(76,175,80,0.1) 0%, rgba(76,175,80,0.05) 100%); border-radius: 12px; padding: 10px 15px; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 10px; border: 1px solid rgba(76,175,80,0.2);">
                    <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #2dbdbd; border-radius: 8px;">
                        <i class="fa-solid fa-plane-arrival" style="font-size: 16px; color: #121212;"></i>
                    </div>
                    <span style="color: #e0e0e0; font-weight: 500;">Fin estimado: <strong style="color: var(--accent); font-size: 1.1em;">${finishString}</strong></span>
                </div>
            `;
        }
    }

    // --- 2. ACTUALIZAR MINI WIDGET (REQUERIMIENTO 1) ---
    const miniCount = document.getElementById('mini-pomo-count');
    const miniTime = document.getElementById('mini-finish-time');
    
    if(miniCount && miniTime) {
        if(pomosRestantes > 0) {
            miniCount.innerText = `${pomosRestantes}🍅`;
            miniTime.innerHTML = `
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 12px;">
                <div style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; background: var(--accent); border-radius: 4px;">
                    <i class="fa-solid fa-plane-arrival" style="font-size: 10px; color: #121212;"></i>
                </div>
                <span style="color: var(--accent); font-weight: bold;">${finishString}</span>
            </div>`
        } else {
            miniCount.innerText = "";
            miniTime.innerText = ""; // Ocultar si no hay tareas
        }
    }
}

function renderFechasList(fechas) {
    const container = document.getElementById('fechas-list-container');
    const emptyMsg  = document.getElementById('fechas-empty-msg');
    if (!container) return;

    container.querySelectorAll('.fecha-item').forEach(el => el.remove());

    if (fechas.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    fechas.forEach(ev => {
        const tipo = TIPOS_EVENTO[ev.tipo] || TIPOS_EVENTO.otro;
        const color = getColorEvento(ev);
        const diffDays = diffDiasCalendario(getFechaHoy(), ev.fecha);
        const eventDateUI = formatDateForUI(ev.fecha);
        const safeNombre = escapeHtml(ev.nombre || '');
        const safeAsig = escapeHtml(ev.asig || '');
        const safeColor = escapeHtml(color);
        const safeId = Number(ev.id) || 0;

        let diffLabel = '';
        if      (diffDays < 0)  diffLabel = `hace ${Math.abs(diffDays)}d`;
        else if (diffDays === 0) diffLabel = 'HOY';
        else                     diffLabel = `en ${diffDays}d`;

        let iconHtml = '';
        if (tipo.iconClass) {
            iconHtml = `<i class="${tipo.iconClass}"></i>`;
        } else if (tipo.icon) {
            iconHtml = tipo.icon;
        }

        const item = document.createElement('div');
        item.className = 'fecha-item';
        if (diffDays < 0) item.style.opacity = '0.45';

        item.innerHTML = `
            <span style="width:10px; height:10px; border-radius:50%; background:${safeColor}; flex-shrink:0;"></span>
            <span class="fi-label">
                <strong>${safeNombre}</strong>
                ${ev.asig ? `<span style="color:#666; font-size:0.85em;"> · ${safeAsig}</span>` : ''}
                <span style="color:#555; font-size:0.8em;"> ${iconHtml}</span>
            </span>
            <span class="fi-date">${eventDateUI}</span>
            <span style="color:#888; font-size:0.8em; min-width:48px; text-align:right;">${diffLabel}</span>
            <button class="fi-del" data-action="eliminarFechaClave" data-id=${safeId} title="Eliminar">✕</button>
        `;
        container.appendChild(item);
    });
}

    function renderUpcomingEvents(fechas) {
        const container = document.getElementById('upcoming-events-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        // 1. Filtrado de eventos caducados mediante TimeStamps absolutos
        const hoyTs = parseDateSafe(new Date()).getTime();
        
        let futuros = fechas.filter(fc => {
            const fechaVal = parseDateSafe(fc.fecha);
            return fechaVal && fechaVal.getTime() >= hoyTs;
        });
        
        // 2. Ordenación cronológica pura
        futuros.sort((a, b) => parseDateSafe(a.fecha).getTime() - parseDateSafe(b.fecha).getTime());
        
        if (futuros.length === 0) {
            container.innerHTML = '<div class="empty-msg" style="color: #888; text-align: center; padding: 10px;">No hay eventos próximos</div>';
            return;
        }
        
        // 3. Renderizado seguro del DOM
        futuros.slice(0, 5).forEach(ev => {
            const el = document.createElement('div');
            el.className = 'event-item';
            // Estilos base para asegurar la estructura (puedes moverlos a tu CSS)
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.marginBottom = '10px';
            
            // Selección de icono Font Awesome
            let iconHtml = '<i class="fas fa-calendar-alt" style="color: var(--accent);"></i>';
            if (ev.tipo === 'examen') iconHtml = '<i class="fas fa-file-alt" style="color: #d95550;"></i>';
            if (ev.tipo === 'entrega') iconHtml = '<i class="fas fa-tasks" style="color: #4CAF50;"></i>';
            
            // REGLA DE ORO: Atributo title SIEMPRE en texto plano
            el.title = `${ev.nombre} - ${ev.tipo ? ev.tipo.toUpperCase() : 'EVENTO'}`;
            
            const fechaUI = formatDateForUI(ev.fecha);
            const diasFaltantes = diffDiasCalendario(new Date(), ev.fecha);
            
            let badgeHtml = '';
            if (diasFaltantes === 0) badgeHtml = '<span class="badge" style="background:#d95550; padding:2px 6px; border-radius:4px; font-size:0.8em;">HOY</span>';
            else if (diasFaltantes === 1) badgeHtml = '<span class="badge" style="background:#e67e22; padding:2px 6px; border-radius:4px; font-size:0.8em;">Mañana</span>';
            else badgeHtml = `<span class="badge" style="background:#256ca5; padding:2px 6px; border-radius:4px; font-size:0.8em;">Faltan ${diasFaltantes}d</span>`;

            el.innerHTML = `
                <div class="event-icon" style="margin-right: 12px; font-size: 1.2em;">${iconHtml}</div>
                <div class="event-details" style="flex: 1;">
                    <div class="event-name" style="font-weight: bold; color: var(--text-main);">${ev.nombre}</div>
                    <div class="event-date" style="font-size: 0.85em; color: #aaa;">${fechaUI} ${badgeHtml}</div>
                </div>
            `;
            
            container.appendChild(el);
        });
    }

function abrirFechasModal(bib, asigActual) {
    const sel = document.getElementById('fk-asig');
    sel.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = '— Todas las asignaturas —';
    sel.appendChild(allOption);
    Object.keys(bib).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        sel.appendChild(opt);
    });
    if (asigActual) sel.value = asigActual;

    document.getElementById('fk-fecha').value = appDateToInput(getFechaHoy());
    document.getElementById('fk-nombre').value = '';

    renderFechasList();
    document.getElementById('fechas-modal').classList.add('visible');
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

    function updatePronostico(bib, asigActual) {
        const container = document.getElementById('forecast-container');
        if (!container || !asigActual || !bib[asigActual]) return;
        container.innerHTML = "";

        const cards = bib[asigActual];
        const dayLabels = ["D","L","M","X","J","V","S"];

        // Contar tarjetas por día para los próximos 7 días
        let counts = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(); d.setDate(d.getDate() + i);
            const dStr = formatearFecha(d);
            const dayLabel = dayLabels[d.getDay()];
            const isToday = i === 0;
            const count = cards.filter(c => c.ProximoRepaso === dStr).length
                        + (i === 0 ? cards.filter(c => c.ProximoRepaso && fechaValor(c.ProximoRepaso) < fechaValor(dStr)).length : 0);
            counts.push({ dStr, dayLabel, count, isToday });
        }

        const maxCount = Math.max(...counts.map(c => c.count), 1);

        counts.forEach(({ dStr, dayLabel, count, isToday }) => {
            const pct = (count / maxCount) * 100;
            const color = isToday ? 'var(--accent)' : count > 20 ? '#f44336' : count > 10 ? '#FF9800' : '#256ca5';

            const row = document.createElement('div');
            row.className = 'forecast-row';
            row.innerHTML = `
                <span class="forecast-day-label" style="${isToday ? 'color:white;font-weight:bold;' : ''}">${isToday ? 'HOY' : dayLabel}</span>
                <div class="forecast-track">
                    <div class="forecast-fill" style="width:${pct}%; background:${color};"></div>
                </div>
                <span class="forecast-count" style="${isToday ? 'color:white;' : ''}">${count}</span>
            `;
            container.appendChild(row);
        });
    }

    function updateDeudaEstudio(bib, asigActual) {
        const scoreEl = document.getElementById('deuda-score');
        const breakdownEl = document.getElementById('deuda-breakdown');
        if (!scoreEl || !asigActual || !bib[asigActual]) return;

        const todayVal = window.fechaValor(window.getFechaHoy());
        let deudaTotal = 0;
        
        let contadores = { nuevas: 0, learning: 0, repasoNormal: 0, criticas: 0 };
        let deudaDesglose = { nuevas: 0, learning: 0, repasoNormal: 0, criticas: 0 };

        bib[asigActual].forEach(c => {
            if (c.ProximoRepaso && window.fechaValor(c.ProximoRepaso) <= todayVal) {
                // DETECCIÓN INTELIGENTE: Si no tiene fsrs_state ni UltimoRepaso, es Nueva
                const isNew = c.fsrs_state === 'new' || (!c.fsrs_state && !c.UltimoRepaso);
                
                if (isNew) {
                    deudaTotal += 1.0;
                    contadores.nuevas++;
                    deudaDesglose.nuevas += 1.0;
                } else if (c.fsrs_state === 'learning') {
                    deudaTotal += 4.0;
                    contadores.learning++;
                    deudaDesglose.learning += 4.0;
                } else {
                    const elapsed = c.UltimoRepaso ? Math.max(0, window.diffDiasCalendario(c.UltimoRepaso, window.getFechaHoy())) : 0;
                    const stability = c.fsrs_stability || 1;
                    const R = Math.pow(0.9, elapsed / stability);
                    const D = c.fsrs_difficulty || 5;
                    const peso = Math.max(0.5, (1 - R) * D);
                    
                    deudaTotal += peso;
                    if (R < 0.8) {
                        contadores.criticas++;
                        deudaDesglose.criticas += peso;
                    } else {
                        contadores.repasoNormal++;
                        deudaDesglose.repasoNormal += peso;
                    }
                }
            }
        });

        deudaTotal = Math.round(deudaTotal);
        scoreEl.innerText = deudaTotal;
        scoreEl.style.color = deudaTotal === 0 ? '#4CAF50' : deudaTotal < 15 ? '#FFC107' : deudaTotal < 40 ? '#FF9800' : '#f44336';

        let html = '';
        const addItem = (label, count, val, color) => {
            if (count > 0) {
                html += `<div class="deuda-item"><span>${label}</span><span style="color:#aaa;">${count} tarj. <strong style="color:${color}; margin-left:8px;">${Math.round(val)}</strong> pts</span></div>`;
            }
        };

        addItem("Re-aprendizajes", contadores.learning, deudaDesglose.learning, "#f44336");
        addItem("Peligro de olvido", contadores.criticas, deudaDesglose.criticas, "#FF9800");
        addItem("Tarjetas Nuevas", contadores.nuevas, deudaDesglose.nuevas, "#2196F3");
        addItem("Repasos normales", contadores.repasoNormal, deudaDesglose.repasoNormal, "#4CAF50");

        if (!html) html = '<div style="text-align:center; color:#4CAF50; padding:8px;"> &check; Sin deuda pendiente</div>';
        breakdownEl.innerHTML = html;
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

    function updateDifficultyStats(bib, asigActual, prevSnap) {
    if(!asigActual || !bib[asigActual]) return;

    const cards = bib[asigActual];
    const total = cards.length;
    
    // Contadores: 0:Nueva, 1:Fácil, 2:Bien, 3:Difícil, 4:Crítica
    let counts = { 0:0, 1:0, 2:0, 3:0, 4:0 };
    let pendientesHoy = 0;
    const todayVal = fechaValor(getFechaHoy());

    cards.forEach(c => {
        const dif = (c.Dificultad === null || c.Dificultad === undefined) ? 2 : parseInt(c.Dificultad);
        const etapa = c.EtapaRepaso || 0;
        const tieneRepaso = !!c.UltimoRepaso;

        if (dif === 2 && !tieneRepaso && etapa === 0) {
            counts[0]++;
        } else {
            if (counts[dif] !== undefined) counts[dif]++;
            else counts[3]++;
        }

        if (c.ProximoRepaso && fechaValor(c.ProximoRepaso) <= todayVal) pendientesHoy++;
    });

    const elTotal = document.getElementById('total-cards-count');
    const elHoy = document.getElementById('today-cards-count');
    if(elTotal) elTotal.innerText = total;
    if(elHoy) elHoy.innerText = pendientesHoy;

    const labels = { 0: "Nuevas", 1: "Fáciles", 2: "Bien", 3: "Difíciles", 4: "Críticas" };
    const colors = { 0: "#9e9e9e", 1: "#2196F3", 2: "#4CAF50", 3: "#FF9800", 4: "#f44336" };

    let html = "";
    [0, 4, 3, 2, 1].forEach(k => { 
        const pct = total > 0 ? (counts[k] / total) * 100 : 0;
        let deltaHtml = '<span class="diff-delta neutral">—</span>';
        if (prevSnap) {
            const diff = counts[k] - (prevSnap[k] || 0);
            if (diff > 0) deltaHtml = `<span class="diff-delta up">+${diff}</span>`;
            else if (diff < 0) deltaHtml = `<span class="diff-delta down">${diff}</span>`;
            else deltaHtml = `<span class="diff-delta neutral">·</span>`;
        }
        html += `
            <div class="diff-bar-row">
                <div class="diff-label">${labels[k]}</div>
                <div class="diff-track">
                    <div class="diff-fill" style="width:${pct}%; background:${colors[k]}; transition: width 0.3s ease;"></div>
                </div>
                <div class="diff-val">${counts[k]}</div>
                ${deltaHtml}
            </div>`;
    });
    
    const containerBars = document.getElementById('dist-bars');
    if(containerBars) containerBars.innerHTML = html;
    return counts;  // el wrapper persiste el snapshot
}

    function updateCalendarHeatmap(bib, asigActual, fechas, viewDate) {
        const container = document.getElementById('calendar-heatmap');
        const title = document.getElementById('calendar-month-title');
        if(!container) return;
        container.innerHTML = "";

        const year  = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const monthNames = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
        title.innerText = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1);
        const lastDay  = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;
        const numDays  = lastDay.getDate();
        
        // Uso estricto del motor ISO
        const todayStr = getFechaHoy();
        const todayVal = fechaValor(todayStr);

        let doneCount   = {};
        let missedCount = {};
        let futureCount = {};

        if (asigActual && bib[asigActual]) {
            bib[asigActual].forEach(c => {
                // Blindaje ISO: Forzamos la normalización in-situ para evitar desajustes de RAM
                if (c.UltimoRepaso) {
                    const ultISO = toISODateString(c.UltimoRepaso);
                    doneCount[ultISO] = (doneCount[ultISO] || 0) + 1;
                }

                if (c.ProximoRepaso) {
                    const pISO = toISODateString(c.ProximoRepaso);
                    const pVal = fechaValor(c.ProximoRepaso);

                    if (pVal < todayVal) {
                        const fueRepasadaDespues = c.UltimoRepaso && fechaValor(c.UltimoRepaso) >= pVal;
                        if (!fueRepasadaDespues) {
                            missedCount[pISO] = (missedCount[pISO] || 0) + 1;
                        }
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

        container.onmouseleave = () => {
            if(typeof updatePendingWindow === 'function') updatePendingWindow(null);
        };

        for (let i = 0; i < startDay; i++) {
            const pad = document.createElement('div');
            pad.className = 'heatmap-day';
            pad.style.cssText = 'background:transparent; border:none; pointer-events:none;';
            container.appendChild(pad);
        }

        for (let i = 1; i <= numDays; i++) {
            const dStr = toISODateString(new Date(year, month, i));
            const dVal = fechaValor(dStr);
            const div  = document.createElement('div');
            div.className = 'heatmap-day';
            div.innerText = i;

            const done   = doneCount[dStr]   || 0;
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
                case 'done':
                    div.classList.add('day-past-done');
                    break;
                case 'missed':
                    div.classList.add('day-past-missed');
                    break;
                case 'mixed':
                    div.classList.add('day-past-done');
                    div.style.boxShadow = 'inset 0 -3px 0 #bb0e02';
                    break;
                case 'today':
                    div.classList.add('day-today-indicator');
                    break;
                case 'today-done':
                    div.classList.add('day-today-indicator', 'day-today-active');
                    break;
                case 'future':
                    div.classList.add('day-future-pending');
                    break;
            }

            // TOOLTIP TEXTO PLANO ESTRICTO
            let tipLines = [formatDateForUI(dStr)];
            if (done > 0)   tipLines.push(`✓ ${done} repasadas`);
            if (missed > 0) tipLines.push(`⚠ ${missed} pendientes`);
            if (future > 0) tipLines.push(`📅 ${future} programadas`);
            if (dVal === todayVal && done === 0) tipLines.push('Hoy · sin repasos aún');

            const eventos = eventMap[dStr] || [];
            if (eventos.length > 0) {
                const weights = { dominant: 3, strong: 2, subtle: 1 };
                const ev   = eventos.reduce((a, b) =>
                    (weights[TIPOS_EVENTO[a.tipo]?.weight] || 0) >= (weights[TIPOS_EVENTO[b.tipo]?.weight] || 0) ? a : b
                );
                const tipo  = TIPOS_EVENTO[ev.tipo] || TIPOS_EVENTO.otro;
                const color = getColorEvento(ev);

                if (tipo.weight === 'dominant') {
                    div.className = 'heatmap-day'; 
                    div.style.background  = color;
                    div.style.color       = '#fff';
                    div.style.fontWeight  = 'bold';
                    div.style.boxShadow   = `0 0 8px ${color}99`;
                    div.style.outline     = `2px solid ${color}`;
                    div.style.outlineOffset = '-2px';
                } else if (tipo.weight === 'strong') {
                    const existingBg = window.getComputedStyle(div).background;
                    div.style.background = color;
                    div.style.color      = '#fff';
                    div.style.fontWeight = 'bold';
                    if (estado === 'missed' || estado === 'mixed') {
                        div.style.boxShadow = `inset 0 -4px 0 #bb0e02`;
                    } else if (estado === 'done' || estado === 'today-done') {
                        div.style.boxShadow = `inset 0 -4px 0 var(--status-blue)`;
                    } else {
                        div.style.boxShadow = `0 0 5px ${color}88`;
                    }
                } else {
                    const dot = document.createElement('span');
                    dot.className = 'event-dot';
                    dot.style.background = color;
                    div.appendChild(dot);
                }

                eventos.forEach(e => {
                    tipLines.push(`★ ${e.nombre}${e.asig ? ' · ' + e.asig : ''}`);
                });
            }

            div.setAttribute('data-tip', tipLines.join('\n'));

            if (estado !== 'vacio' || eventos.length > 0) {
                div.addEventListener('mouseenter', () => {
                    if(typeof updatePendingWindow === 'function') updatePendingWindow(dStr);
                });
            }

            container.appendChild(div);
        }
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
            
            // Actualizar estadísticas globales (Racha, etc)
            updateGlobalStats();

        } catch(e) { Logger.error("Error en updatePomoStats:", e); }
    }

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

        // Determinar maxRef global para escalar bien
        let allVals = [];
        for(let i = days-1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dStr = formatearFecha(d);
            let val = dStr === todayStr ? ((todayLog.date === todayStr ? todayLog.count : 0) || 0) : (history[dStr] || 0);
            allVals.push(val);
        }
        const maxVal = Math.max(...allVals, 1);
        
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
            
            let barColor = "#333";
            let numColor = "#666";
            if (isMet) { barColor = "#19a693"; numColor = "#19a693"; }
            else if (isToday) { barColor = "var(--accent)"; numColor = "white"; }
            else if (val > 0) { barColor = "#666"; numColor = "#aaa"; }
            
            const maxRef = Math.max(maxVal, dailyGoal);
            const h = Math.min(100, (val / maxRef) * 100);
            const goalH = Math.min(100, (dailyGoal / maxRef) * 100);

            const col = document.createElement('div');
            const colStyle = viewMode === '28d'
                ? "flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; position:relative; cursor:pointer;"
                : "flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; position:relative; cursor:pointer;";
            col.style.cssText = colStyle;
            col.setAttribute('data-date', dStr);
            col.setAttribute('data-val', val);
            col.setAttribute('data-goal', dailyGoal);

            // Tooltip desglose al hover
            col.innerHTML = `
                <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; position:relative;">
                    ${val > 0 && viewMode === '7d' ? `<span style="font-size:0.7em; margin-bottom:2px; font-weight:bold; color:${numColor};">${val}</span>` : ''}
                    <div style="width:${viewMode === '28d' ? '80' : '60'}%; height:${Math.max(h, 2)}%; background:${barColor}; border-radius:3px 3px 0 0; transition:height 0.5s; z-index:2; min-height:4px;"></div>
                    <div style="position:absolute; bottom:${goalH}%; width:100%; height:1px; border-top:1px dashed rgba(255,255,255,0.2); z-index:1; pointer-events:none;"></div>
                </div>
                <span style="font-size:${viewMode === '28d' ? '0.45' : '0.6'}em; margin-top:4px; color:${isToday ? 'white' : '#666'}; font-weight:${isToday ? 'bold' : 'normal'}">${dayLabel}</span>
            `;

            // Click: mostrar popup de desglose
            col.addEventListener('click', function() {
                document.querySelectorAll('.bar-popup').forEach(p => p.remove());
                const dateStr = this.getAttribute('data-date');
                const logEntry = dateStr === todayStr
                    ? (todayLog.date === todayStr ? todayLog : null)
                    : null;
                const histDetails = pomoDetailsHistory;
                const details = logEntry ? logEntry.details : (histDetails[dateStr] || {});
                const valNum = parseInt(this.getAttribute('data-val'));
                const goalNum = parseInt(this.getAttribute('data-goal'));

                let popupHtml = `<strong>${dateStr}</strong><br>${valNum}/${goalNum} pomos<br>`;
                if (Object.keys(details).length > 0) {
                    Object.entries(details).forEach(([asig, n]) => {
                        popupHtml += `${asig}: ${n}<br>`;
                    });
                } else {
                    popupHtml += `Sin desglose`;
                }
                const popup = document.createElement('div');
                popup.className = 'bar-popup';
                popup.innerHTML = popupHtml;
                this.style.position = 'relative';
                this.appendChild(popup);
                setTimeout(() => popup.remove(), 3000);
            });
            
            col.title = `${dStr} — ${val}/${dailyGoal} pomos`;
            container.appendChild(col);
        }
        
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
        const maxVal = Math.max(...Object.values(horaHistory), 1);

        let bestHora = -1, bestVal = 0;
        for (let h = 0; h < 24; h++) {
            const val = horaHistory[h] || 0;
            if (val > bestVal) { bestVal = val; bestHora = h; }
            const intensity = val / maxVal;
            const r = Math.round(25 + intensity * 25);
            const g = Math.round(166 * intensity);
            const b = Math.round(147 * intensity);
            const bg = val === 0 ? '#2a2a2a' : `rgb(${r},${g},${b})`;

            const cell = document.createElement('div');
            cell.className = 'hora-cell';
            cell.style.background = bg;
            cell.setAttribute('data-tip', `${String(h).padStart(2,'0')}:00 — ${val} pomos`);
            if (val > 0) cell.innerText = val;
            container.appendChild(cell);
        }

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
            listContainer.innerHTML = "<li style='text-align:center; color:#666; font-size:0.8em; padding:10px;'>Selecciona asignatura</li>";
            return;
        }

        const cards = bib[asigActual];
        let filtrados = [];
        let tituloEstado = "Ventana de Pendientes (Hoy + Atrasados)";

        if (fechaEspecifica) {
            // MODO HOVER: Solo lo de esa fecha exacta
            filtrados = cards.filter(c => c.ProximoRepaso === fechaEspecifica);
            tituloEstado = `Programado para el ${fechaEspecifica}`;
        } else {
            // MODO DEFAULT: Todo lo acumulado hasta hoy
            const todayVal = fechaValor(getFechaHoy());
            filtrados = cards.filter(c => {
                if(!c.ProximoRepaso) return false;
                return fechaValor(c.ProximoRepaso) <= todayVal;
            });
            tituloEstado = "Ventana de Pendientes (Hoy)";
        }

        // Actualizar Título del Widget
        if(titleWidget) titleWidget.innerText = tituloEstado;

        // Actualizar Contador
        countDisplay.innerText = filtrados.length;
        if (filtrados.length > 0) countDisplay.style.color = "var(--status-red)";
        else countDisplay.style.color = (fechaEspecifica) ? "#888" : "var(--status-green)";

        // Renderizar Lista
        if(filtrados.length === 0) {
            const msg = fechaEspecifica ? "Nada programado" : '¡Todo al día! <i class="fa-solid fa-dove"></i>';
            listContainer.innerHTML = `<li style='text-align:center; color:#888; font-style:italic; padding:10px;'>${msg}</li>`;
        } else {
            filtrados.forEach(c => {
                const li = document.createElement('li');
                li.className = 'asig-item'; 
                li.style.cursor = "default";
                li.style.fontSize = "0.85em";
                
                let difText = "N";
                let difColor = "#999";
                
                if (c.Dificultad) {
                    difText = c.Dificultad;
                    if(difText == 1) difColor = "#2196F3";
                    if(difText == 2) difColor = "#4CAF50";
                    if(difText == 3) difColor = "#FF9800";
                    if(difText == 4) difColor = "#f44336";
                } else if (c.EtapaRepaso > 0) {
                    difText = "?";
                }

                // Inyectamos HTML para que el LaTeX crudo se pinte
                li.innerHTML = `
                    <span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:5px;">${c.Titulo}</span>
                    <span style="font-weight:bold; color:${difColor};">(${difText})</span>
                `;
                listContainer.appendChild(li);
            });
            
            // CAMBIO: Renderizar LaTeX en esta lista pequeña
            if(typeof MathJax !== 'undefined') {
                MathJax.typesetPromise([listContainer]).catch(err => Logger.error(err));
            }
        }
    }

    function renderHorarioGrid(horario, bib, diaSeleccionado) {
        const contenedor = document.getElementById('schedule-grid-container');
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
                    // Aquí está tu formato: "EDP (2🍅)"
                    tag.innerText = `${asig} (${horas}🍅)`;
                    content.appendChild(tag);
                }
            });
            
            box.appendChild(content);
            contenedor.appendChild(box);
        });
    }

function renderRecursos(asigActual, recursos, slots) {
    const contenedor = document.getElementById('lista-recursos-slots');
    if(!contenedor) return;
    contenedor.innerHTML = "";

    if (!asigActual) return;
    
    // Inicializar array si no existe
    if (!recursos[asigActual]) {
        recursos[asigActual] = [];
    }

    const lista = recursos[asigActual];
    
    if(lista.length === 0) {
        contenedor.innerHTML = "<span style='font-size:0.8em; color:#444; font-style:italic;'>Sin libros. Añade uno a la derecha.</span>";
        return;
    }

    lista.forEach((nombreLibro, index) => {
        const key = `${asigActual}_${index}`;
        const isLoaded = !!slots[key]; 
        
        // Crear el Chip
        const div = document.createElement('div');
        let classes = "slot-chip";
        if(isLoaded) classes += " loaded";
        
        div.className = classes;
        div.title = isLoaded ? "Ver libro" : "Haga clic para cargar el archivo PDF";
        div.onclick = () => clickEnSlot(index);
        
        // Icono de estado
        const icon = isLoaded ? 'ðŸ“–' : 'ðŸ“¥';
        
        div.innerHTML = `
            <span>${icon} ${nombreLibro}</span>
            <button class="slot-del-btn" data-action="borrarSlot" data-idx=${index} title="Olvidar referencia">í—</button>
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
    };
})();

window.cambiarPestanaAjustes = UI.cambiarPestanaAjustes;