// ════════════════════════════════════════════════════════════════
// APP.JS — Lógica principal de la aplicación
// Carga después de: state.js, firebase.js
// ════════════════════════════════════════════════════════════════

    // --------------------------------------------------------
    // LOGGER CENTRALIZADO v1.15
    // Sustituye los console.log dispersos. Guarda un historial
    // en memoria (últimas 200 entradas) para depuración.
    // --------------------------------------------------------
    const Logger = (() => {
        const MAX = 200;
        const _log = [];

        function _push(level, ...args) {
            const entry = {
                ts: new Date().toISOString(),
                level,
                msg: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
            };
            _log.push(entry);
            if (_log.length > MAX) _log.shift();
            // Redirige al console nativo con prefijo
            const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            fn(`[${level.toUpperCase()}]`, ...args);
        }

        return {
            info:  (...a) => _push('info',  ...a),
            warn:  (...a) => _push('warn',  ...a),
            error: (...a) => _push('error', ...a),
            /** Devuelve copia del historial completo */
            getLogs: () => [..._log],
            /** Vuelca logs en consola formateados */
            dump: () => { console.table(_log.slice(-50)); }
        };
    })();

    // --------------------------------------------------------
    // UTIL — helpers privados reutilizables
    // --------------------------------------------------------
    const Util = Object.freeze({
        /** Parsea un valor de localStorage con fallback seguro. */
        loadLS(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                return raw !== null ? JSON.parse(raw) : fallback;
            } catch (e) {
                Logger.warn(`loadLS: error leyendo "${key}"`, e);
                return fallback;
            }
        },
        /** Pad de 2 dígitos. */
        pad2: n => String(n).padStart(2, '0'),
        /** Abre (open=true) o cierra (open=false) un modal por su id. */
        toggleModal(id, open) {
            const el = document.getElementById(id);
            if (!el) return;
            if (open) { el.classList.remove('hidden'); el.style.display = 'flex'; }
            else      { el.classList.add('hidden');    el.style.display = 'none'; }
        }
    });

    // --------------------------------------------------------
    // APP STATE CENTRALIZADO v1.15
    // Objeto único que refleja el estado de la aplicación.
    // Las variables globales siguen siendo la fuente de verdad
    // (retrocompatibilidad), pero AppState ofrece una vista
    // consolidada y un método de snapshot para depuración.
    // --------------------------------------------------------
    const AppState = {
        // Getters que leen las vars globales (single source of truth)
        get asignaturaActual()  { return nombreAsignaturaActual; },
        get colaEstudio()       { return colaEstudio; },
        get conceptoActual()    { return conceptoActual; },
        get modoSecuencial()    { return modoSecuencial; },
        get modoLectura()       { return modoLectura; },
        get pomoSettings()      { return pomoSettings; },
        get taskList()          { return taskList; },
        get horario()           { return horarioGlobal; },

        // Setters centralizados (con log automático)
        setAsignatura(nombre) {
            Logger.info('AppState: asignatura →', nombre);
            nombreAsignaturaActual = nombre;
        },

        /** Devuelve un snapshot plano del estado actual para depuración */
        snapshot() {
            return {
                asignaturaActual: nombreAsignaturaActual,
                tarjetasEnCola:   colaEstudio.length,
                conceptoActual:   conceptoActual ? conceptoActual.Titulo : null,
                modoSecuencial,
                modoLectura,
                pomoRunning:      isRunning,
                currentPomoMode:  currentMode,
                logs:             Logger.getLogs().slice(-20)
            };
        }
    };

    // Fechas: parseDateSafe, toISODateString, formatDateForUI, getFechaHoy,
    // formatearFecha, fechaValor, esVencido, diffDiasCalendario,
    // normalizarTarjetaFechas, normalizarBibliotecaFechas,
    // normalizarFechasClave, normalizarPomoFechas → domain.js (carga antes)

    // --------------------------------------------------------
    // EVENT BUS (Receptores de módulos externos)
    // --------------------------------------------------------
    document.addEventListener('pomodoro:finished', (e) => {
        const asignatura = e.detail.asignatura;
        if (typeof Logger !== 'undefined') Logger.info("Pomodoro completado en:", asignatura);
        registrarPomoCompletado(asignatura);
        showResumenSesion();
        resetSessionData();
    });

    document.addEventListener('pomodoro:tasksUpdated', () => {
        if (typeof updatePomoStats === 'function') updatePomoStats();
    });

    function escapeHtml(value) {
        const safe = String(value ?? '');
        return safe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }




    /**
     * Carga el estado ligero de localStorage e inicializa controles de UI.
     * Invocada desde window.onload y DOMContentLoaded.
     */
    function initAppState() {
        // Colores y proyectos
        const colores = Util.loadLS('estudiador_colores');
        if (colores) userColors = colores;

        const proyectos = Util.loadLS('estudiador_proyectos');
        if (proyectos) {
            projects = proyectos;
            if (typeof actualizarListaProyectos === 'function') actualizarListaProyectos();
        }

        // Ajustes de Pomodoro
        const settings = Util.loadLS('pomo_settings');
        if (settings) {
            pomoSettings = settings;
            const ids = { 'set-work': 'work', 'set-short': 'short', 'set-long': 'long' };
            const defaults = { work: 25, short: 5, long: 15 };
            Object.entries(ids).forEach(([elId, key]) => {
                const el = document.getElementById(elId);
                if (el) el.value = pomoSettings[key] ?? defaults[key];
            });
            const elAuto = document.getElementById('check-auto-start');
            if (elAuto) elAuto.checked = !!pomoSettings.autoStart;
        }

        // Tareas
        const tasks = Util.loadLS('pomo_tasks');
        if (tasks) {
            taskList = tasks;
            if (typeof renderTasks === 'function') renderTasks();
        }
    }

    window.onload = function() {
        // ==========================================
        // FASE 1: SANITIZACIÓN DE DATOS EN MEMORIA
        // La carga desde DB ya ocurrió en el DOMContentLoaded. 
        // Aquí solo normalizamos lo que ya está en RAM.
        // ==========================================
        if (typeof window.normalizarPomoFechas === 'function') window.normalizarPomoFechas();
        if (typeof window.normalizarBibliotecaFechas === 'function') window.normalizarBibliotecaFechas();
        if (typeof window.normalizarFechasClave === 'function') window.normalizarFechasClave();

        // ==========================================
        // FASE 2: CARGA DE ESTADO LIGERO (Aún en LocalStorage)
        // ==========================================
        initAppState();

        // ==========================================
        // FASE 3: INICIALIZACIÓN DE INTERFAZ Y SESIÓN
        // ==========================================
        if (typeof setPomoMode === "function") setPomoMode('work');
        if (typeof resetSessionData === 'function') resetSessionData();
        if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
        if (typeof cargarApariencia === 'function') cargarApariencia();

        // ==========================================
        // FASE 4: RENDERIZADO DE WIDGETS Y DASHBOARD
        // ==========================================
        if (typeof updatePomoStats === 'function') updatePomoStats();
        if (typeof updateWeeklyWidget === 'function') updateWeeklyWidget();
        if (typeof updateGlobalStats === 'function') updateGlobalStats();
        if (typeof updatePendingWindow === 'function') updatePendingWindow();
    };
    // --- SISTEMA DE APARIENCIA ---
    // (global moved to state.js)
    // (global moved to state.js)
    const COLORES_ASIGNATURAS = {
        "Estructuras": "#a31f1f",        // Rojo
        "Procesos estocásticos": "#e6b230", // Amarillo
        "EDP": "#6e46ab",               // Morado
        "Modelización 1": "#379e6b",     // Verde
        "Medida": "#d65e22",            // Naranja
        "General": "#607d8b"            // Gris Azulado
    };
    // (global moved to state.js)

    function cargarApariencia() {
        const saved = JSON.parse(localStorage.getItem('estudiador_apariencia') || '{}');
        currentVisualTheme = saved.visual || 'style-glass';
        currentClickEffect = saved.click || 'click-skeuo'; // Por defecto Skeuo (el más placentero)

        // Aplicar al body
        document.body.className = ''; // Limpiar
        document.body.classList.add(currentVisualTheme, currentClickEffect);

        // Actualizar selects si el modal existe
        if(document.getElementById('set-visual-theme')) {
            document.getElementById('set-visual-theme').value = currentVisualTheme;
            document.getElementById('set-click-effect').value = currentClickEffect;
        }
    }

    function guardarApariencia() {
        currentVisualTheme = document.getElementById('set-visual-theme').value;
        currentClickEffect = document.getElementById('set-click-effect').value;
        
        localStorage.setItem('estudiador_apariencia', JSON.stringify({
            visual: currentVisualTheme,
            click: currentClickEffect
        }));
        
        cargarApariencia(); // Reaplicar inmediatamente
    }
    function guardarEnLocal() {
        normalizarBibliotecaFechas();
        // 1. Re-indexación absoluta de toda la base de datos
        for (const asignatura in biblioteca) {
            if (Array.isArray(biblioteca[asignatura])) {
                biblioteca[asignatura].forEach((tarjeta, idx) => {
                    tarjeta.IndiceGlobal = idx; // Se estampa la posición real en memoria
                });
            }
        }
        
        // 2. Persistencia en LocalStorage
        try {
            persistirDatosLocales('biblioteca_local', biblioteca);
        } catch (e) {
            Logger.error("Error crítico al guardar en localStorage:", e);
            alert("Error de almacenamiento. Posible cuota excedida.");
        }
    }
    function guardarProyectos() { localStorage.setItem('estudiador_proyectos', JSON.stringify(projects)); }
    function borrarTodoLocal() { if(confirm("¿Reset total?")) { localStorage.clear(); location.reload(); } }

    // --- SIDEBAR TOGGLE ---
    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('collapsed');
        // Cambiamos la flecha visualmente
        const btn = document.getElementById('sidebar-toggle');
        btn.innerText = document.getElementById('sidebar').classList.contains('collapsed') ? '▶' : '◀';
    }


    // --- GESTIÓN MODAL POMODORO ---
    function abrirModalPomodoro() {
        Util.toggleModal('pomodoro-modal', true);
        renderTasks();
    }
    function cerrarModalPomodoro() {
        Util.toggleModal('pomodoro-modal', false);
    }

    // --- ASIGNATURAS ---
    function renombrarAsignatura(oldName, ev) {
        // Esto evita que se dispare el click de "cargar asignatura" que está debajo
        if(ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }
        
        const newName = prompt("Nuevo nombre para " + oldName + ":", oldName);
        if(newName && newName.trim() !== "" && newName !== oldName) {
            if(biblioteca[newName]) { alert("Ese nombre ya existe."); return; }
            
            // Copiar datos y borrar anterior
            biblioteca[newName] = biblioteca[oldName];
            delete biblioteca[oldName];
            
            // Si era la actual, actualizar referencia
            if(nombreAsignaturaActual === oldName) nombreAsignaturaActual = newName;
            
            guardarEnLocal();
            actualizarMenuLateral();
            
            // Recargar interfaz si era la activa
            if(nombreAsignaturaActual === newName) cargarAsignatura(newName);
        }
    }

    function borrarAsignatura(nombre, ev) {
        if(ev) ev.stopPropagation();
        if(confirm(`¿Eliminar "${nombre}"?`)) {
            delete biblioteca[nombre]; guardarEnLocal();
            if(nombreAsignaturaActual===nombre) { nombreAsignaturaActual=null; UI.ocultarTodo(); document.getElementById('welcome-screen').classList.remove('hidden'); }
            actualizarMenuLateral();
            sincronizar();
        }
    }

    function actualizarMenuLateral() { UI.actualizarMenuLateral(biblioteca, nombreAsignaturaActual); }

    function actualizarListaProyectos() { UI.actualizarListaProyectos(projects); }
    function borrarProyecto(i) {
        projects.splice(i, 1); guardarProyectos(); actualizarListaProyectos();
    }

    // --- VISTAS ---
    //* function ocultarTodo() { ocultarTodo(); }    */
    function cargarAsignatura(nombre) {
    Logger.info("Cargando asignatura:", nombre);
    
    // 1. Establecer contexto
    nombreAsignaturaActual = nombre;

    // 2. Actualizar visualmente el Sidebar
    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();

    // 3. Preparar la UI
    UI.ocultarTodo();
    const studyCard = document.getElementById('study-card');
    if (studyCard) studyCard.classList.remove('hidden');

    // --- GESTIÓN COLOR PDF Y RESET (Blindado) ---
    try {
        const color = typeof getColorAsignatura === 'function' ? getColorAsignatura(nombre) : 'var(--accent)';
        const headerBar = document.getElementById('pdf-header-bar');
        if (headerBar) {
            headerBar.style.background = color;
            headerBar.style.borderColor = color;
        }
        
        const modPdf = document.getElementById('modulo-pdf');
        if (modPdf) {
            modPdf.style.setProperty('--dynamic-color', color);
            modPdf.classList.add('pdf-collapsed');
        }

        const frame = document.getElementById('pdf-frame');
        if (frame) {
            frame.src = "";
            frame.style.display = "none";
        }
        
        const ph = document.getElementById('pdf-placeholder');
        if (ph) ph.style.display = "block";

        const arrowIcon = document.getElementById('pdf-arrow-icon');
        if (arrowIcon) arrowIcon.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        
        const statusText = document.getElementById('pdf-status-text');
        if (statusText) statusText.innerText = "Desplegar";

        // Invocación segura de la función de renderizado de slots (si existe en esta versión)
        if (typeof renderSlots === 'function') renderSlots();
        else if (typeof actualizarSlotsPdf === 'function') actualizarSlotsPdf();

    } catch (e) {
        Logger.error("Arquitectura: Error silenciado en módulo PDF", e);
    }

    // 4. Resetear variables de navegación 
    indiceNavegacion = 0;
    conceptoActual = null;

    // 5. (filtro-tema-val ahora es un input de texto, no necesita población)

    // 6. Ejecutar filtros y renderizar
    if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
    if (typeof updateDashboard === 'function') window.updateDashboard();
}

    

    






    // --- FUNCIONES COMUNES EDITORES ---
    function modoImportar() { if(!nombreAsignaturaActual)return; UI.ocultarTodo(); document.getElementById('import-card').classList.remove('hidden'); document.getElementById('import-area').value=""; }
    // Orden canónico de propiedades de tarjeta para serialización
    const ORDEN_CLAVES_TARJETA = ["Titulo","Contenido","Tema","Apartado","Dificultad","EtapaRepaso","UltimoRepaso","ProximoRepaso","IndiceGlobal"];
    function ordenarTarjeta(obj) {
        const out = {};
        ORDEN_CLAVES_TARJETA.forEach(k => { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
        Object.keys(obj).forEach(k => { if (!ORDEN_CLAVES_TARJETA.includes(k)) out[k] = obj[k]; });
        return out;
    }

    function modoEdicionJSON() {
    if (!nombreAsignaturaActual) return;
    UI.ocultarTodo();
    document.getElementById('json-editor-card').classList.remove('hidden');
    
    const tarjetas = biblioteca[nombreAsignaturaActual];
    document.getElementById('json-editor-area').value = JSON.stringify(tarjetas.map(ordenarTarjeta), null, 4);
}
    function cancelarEdicion() { UI.ocultarTodo(); if(nombreAsignaturaActual) document.getElementById('study-card').classList.remove('hidden'); else document.getElementById('welcome-screen').classList.remove('hidden'); }

    // --- NUEVO EDITOR AMIGABLE ---
    function abrirEditorAmigable() {
        if(!conceptoActual) return;
        UI.ocultarTodo();
        document.getElementById('editor-card').classList.remove('hidden');
        cargarDatosEditorAmigable();
    }

    function cargarDatosEditorAmigable() {
        if(!conceptoActual) return;
        document.getElementById('edit-titulo').value = conceptoActual.Titulo || "";
        document.getElementById('edit-contenido').value = conceptoActual.Contenido || "";
        document.getElementById('edit-tema').value = conceptoActual.Tema || 1;
        document.getElementById('edit-apartado').value = conceptoActual.Apartado || "Definición";

        const idxLabel = document.getElementById('edit-idx-label');
        if(idxLabel) idxLabel.innerText = `(Tarjeta ${indiceNavegacion + 1} de ${colaEstudio.length})`;
    }

    function guardarDatosEditorAmigable(cerrar = true) {
        if(!conceptoActual) return false;
        
        const t = document.getElementById('edit-titulo').value.trim();
        const c = document.getElementById('edit-contenido').value.trim();

        if(!t || !c) {
            alert("El título y el contenido no pueden estar vacíos.");
            return false;
        }

        // Sobrescribir datos en memoria RAM
        conceptoActual.Titulo = t;
        // Pasamos el texto por el saneador de LaTeX antes de guardarlo en la memoria
        conceptoActual.Contenido = typeof Parser !== 'undefined' ? Parser.sanearLatex(c) : c;
        conceptoActual.Tema = parseInt(document.getElementById('edit-tema').value) || 1;
        conceptoActual.Apartado = document.getElementById('edit-apartado').value;

        // Persistir
        guardarEnLocal();
        window.updateDashboard();

        // Feedback visual
        const btn = document.getElementById('btn-guardar-edicion-amigable');
        if(btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Guardado!';
            btn.style.background = "#4CAF50";
            setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ""; }, 1000);
        }

        if(cerrar) {
            cancelarEdicion();
            renderizarConceptoActual(); // Refrescar la vista de estudio
        }
        return true;
    }

    function navegarEditor(delta) {
        // Auto-guardado al navegar
        if(!guardarDatosEditorAmigable(false)) return;

        // Mover índice en la cola actual
        indiceNavegacion += delta;
        if(indiceNavegacion < 0) indiceNavegacion = colaEstudio.length - 1;
        if(indiceNavegacion >= colaEstudio.length) indiceNavegacion = 0;

        conceptoActual = colaEstudio[indiceNavegacion];
        cargarDatosEditorAmigable();
    }
    function guardarNuevoConcepto() {
        const t = document.getElementById('edit-titulo').value; 
        const c = document.getElementById('edit-contenido').value;
        if(!t||!c) return;
        
        biblioteca[nombreAsignaturaActual].push({
            "Titulo": t,
            "Contenido": c,
            "Tema": parseInt(document.getElementById('edit-tema').value)||1,
            "Apartado": document.getElementById('edit-apartado').value,
            "EtapaRepaso": 0,
            "Dificultad": 2, // OBLIGATORIO: 2 para ser considerada "Nueva"
            "UltimoRepaso": null, // OBLIGATORIO: null para ser considerada "Nueva"
            "ProximoRepaso": window.getFechaHoy() 
        });
        
        guardarEnLocal(); 
        alert("Guardado"); 
        cancelarEdicion(); 
        window.aplicarFiltros(); 
        window.updateDashboard(); 
        
        document.getElementById('edit-titulo').value=""; 
        document.getElementById('edit-contenido').value="";
    }


    // --- POMODORO & TASKS (Rediseñado) ---
    // (trasladado a pomodoro.js)

    
    // ----------------------------------------------------------
    //  MÓDULO: FECHAS CLAVE
    //  Estructura: { id, nombre, fecha (dd/mm/yyyy), tipo, asig }
    // ----------------------------------------------------------
    // (global moved to state.js)

const TIPOS_EVENTO = {
    examen:   { label: 'Final',   iconClass: 'fa-sharp fa-solid fa-chess-king', weight: 'dominant' },
    prueba:   { label: 'Prueba',   iconClass: 'fa-sharp fa-solid fa-chess-queen', weight: 'strong'   },
    entrega:  { label: 'Entrega',  iconClass: 'fa-sharp fa-solid fa-chess-knight', weight: 'subtle'   },
    vacacion: { label: 'Festivo', iconClass: 'fa-solid fa-umbrella-beach', weight: 'subtle'   },
    otro:     { label: 'Otro',     iconClass: 'fa-sharp fa-solid fa-chess-pawn', weight: 'subtle' },
};

// Devuelve el color del evento: color de la asignatura si tiene, gris si es genérico
function getColorEvento(ev) {
    return ev.asig ? getColorAsignatura(ev.asig) : '#607d8b';
}

function guardarFechasClave() {
    normalizarFechasClave();
    persistirDatosLocales('fechasClave', fechasClave);
}

// Convierte "yyyy-mm-dd" (input[type=date]) -> "dd/mm/yyyy" (app)
// Convierte "YYYY-MM-DD" (Input HTML) ➔ "DD/MM/YYYY" (App)
function inputDateToApp(s) {
    if (!s) return "";
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

// Convierte "DD/MM/YYYY" (App) ➔ "YYYY-MM-DD" (Input HTML)
function appDateToInput(s) {
    if (!s) return "";
    const p = s.split('/');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

function abrirFechasModal() { UI.abrirFechasModal(biblioteca, nombreAsignaturaActual); }

function cerrarFechasModal() { /* → ui.js */
        document.getElementById('fechas-modal').classList.add('hidden'); }

function guardarFechaClave() {
    const nombre = document.getElementById('fk-nombre').value.trim();
    const fechaInput = document.getElementById('fk-fecha').value;
    const fecha  = inputDateToApp(fechaInput);
    const tipo   = document.getElementById('fk-tipo').value;
    const asig   = document.getElementById('fk-asig').value;

    if (!nombre) { document.getElementById('fk-nombre').focus(); return; }
    if (!fecha || !window.parseDateSafe(fechaInput)) {
        alert('La fecha no es válida. Usa el selector de fecha.');
        document.getElementById('fk-fecha').focus();
        return;
    }

    fechasClave.push({
        id: Date.now(),
        nombre: nombre.slice(0, 120),
        fecha,
        tipo,
        asig
    });
    fechasClave.sort((a, b) => window.fechaValor(a.fecha) - window.fechaValor(b.fecha));
    guardarFechasClave();
    renderFechasList();

    document.getElementById('fk-nombre').value = '';
    document.getElementById('fk-nombre').focus();
}

function eliminarFechaClave(id) {
    fechasClave = fechasClave.filter(e => e.id !== id);
    guardarFechasClave();
    renderFechasList();
}

function renderFechasList() { UI.renderFechasList(fechasClave); }
    /**
     * Renderiza los próximos eventos en el widget.
     * Fuerza la evaluación de fechas a zona local y separa los iconos del tooltip nativo.
     */
    function renderUpcomingEvents() { UI.renderUpcomingEvents(fechasClave); }
    function initFechasClave() {
    fechasClave = JSON.parse(localStorage.getItem('estudiador_fechas_clave') || '[]');
    normalizarFechasClave();
    guardarFechasClave();
    renderUpcomingEvents();
}

    // -----------------------------------------------------------------------
    

    // --- GESTIÓN DE PESTAí‘AS IMPORTACIÓN ---
    function setImportMode(mode) {
        const pJson = document.getElementById('panel-import-json');
        const pLatex = document.getElementById('panel-import-latex');
        const tJson = document.getElementById('tab-import-json');
        const tLatex = document.getElementById('tab-import-latex');

        if(mode === 'json') {
            pJson.classList.remove('hidden'); pLatex.classList.add('hidden');
            tJson.style.color = "var(--accent)"; tJson.style.borderBottom = "2px solid var(--accent)";
            tLatex.style.color = "#666"; tLatex.style.borderBottom = "none";
        } else {
            pJson.classList.add('hidden'); pLatex.classList.remove('hidden');
            tLatex.style.color = "var(--accent)"; tLatex.style.borderBottom = "2px solid var(--accent)";
            tJson.style.color = "#666"; tJson.style.borderBottom = "none";
        }
    }



    
    // --- SETTINGS ---
    function abrirAjustes() {
        const isLocal = !!localStorage.getItem('estudiador_groq_key');
        // 1. Abrir Modal básico
        UI.abrirAjustes(State.get('groqApiKey'), isLocal, State.get('groqProxyUrl'), localStorage.getItem('firebase_config') || "");
        // 2. Inyectar estado en los submódulos de ajustes
        UI.renderHorarioGrid(State.get('horarioGlobal') || {}, State.get('biblioteca') || {}, window.diaSeleccionadoIndex || -1);
        UI.renderColorSettings(State.get('biblioteca') || {});
    }
    // --- SETTINGS (Modularizado) ---
    function guardarAjustes() {
        _guardarConfigPomo();
        _guardarConfigIA();
        _guardarFirebase();
        _guardarPrivacidad();
        _guardarColores();
        _propagarCambiosUI();
        
        const modoGroq = State.get('groqProxyUrl') ? "PROXY" : (State.get('groqApiKey') ? "DIRECTO" : "INACTIVO");
        alert("Ajustes guardados correctamente.\nModo IA: " + modoGroq);
        UI.cerrarAjustes();
    }

    function _guardarConfigPomo() {
        const pomoSettings = State.get('pomoSettings') || {};
        pomoSettings.work = parseInt(document.getElementById('set-work').value) || 35;
        pomoSettings.short = parseInt(document.getElementById('set-short').value) || 5;
        pomoSettings.long = parseInt(document.getElementById('set-long').value) || 15;
        pomoSettings.autoStart = document.getElementById('check-auto-start').checked;
        State.set('pomoSettings', pomoSettings);
        localStorage.setItem('pomo_settings', JSON.stringify(pomoSettings));
    }

    function _guardarConfigIA() {
        const inputKey = document.getElementById('set-groq-key');
        const sessionOnly = !!document.getElementById('set-groq-session-only')?.checked;
        const inputProxy = document.getElementById('set-groq-proxy-url');
        
        if (inputKey) {
            const apiKey = inputKey.value.trim();
            State.set('groqApiKey', apiKey);
            if (sessionOnly) {
                sessionStorage.setItem('estudiador_groq_key_session', apiKey);
                localStorage.removeItem('estudiador_groq_key');
            } else {
                localStorage.setItem('estudiador_groq_key', apiKey);
                sessionStorage.removeItem('estudiador_groq_key_session');
            }
        }
        if (inputProxy) {
            const proxyUrl = inputProxy.value.trim();
            State.set('groqProxyUrl', proxyUrl);
            if (proxyUrl) localStorage.setItem('estudiador_groq_proxy_url', proxyUrl);
            else localStorage.removeItem('estudiador_groq_proxy_url');
        }
    }

    function _guardarFirebase() {
        const input = document.getElementById('set-firebase-config');
        if (input) {
            const str = input.value.trim();
            if (str) {
                try { JSON.parse(str); localStorage.setItem('firebase_config', str); if(typeof inicializarFirebase === 'function') inicializarFirebase(str); } 
                catch (e) { alert("La configuración de Firebase no es un JSON válido."); }
            } else localStorage.removeItem('firebase_config');
        }
    }

    function _guardarColores() {
        const userColors = State.get('userColors') || {};
        const biblioteca = State.get('biblioteca') || {};
        ["General", ...Object.keys(biblioteca)].forEach(k => {
            const input = document.getElementById(`color-input-${k}`);
            if(input) userColors[k] = input.value;
        });
        State.set('userColors', userColors);
        localStorage.setItem('estudiador_colores', JSON.stringify(userColors));
    }
    function _guardarPrivacidad() {
        const checkbox = document.getElementById('set-privacy-stats');
        if (checkbox) {
            localStorage.setItem('estudiador_privacy_stats', checkbox.checked ? 'true' : 'false');
        }
    }

    function _propagarCambiosUI() {
        if (typeof window.setPomoMode === 'function') window.setPomoMode(State.get('currentMode') || 'work'); 
        if (typeof window.updateDashboard === 'function') window.updateDashboard(); 
        if (typeof window.renderHorarioGrid === 'function') window.renderHorarioGrid(); 
        if (typeof window.actualizarMenuLateral === 'function') window.actualizarMenuLateral();

        const asig = State.get('nombreAsignaturaActual');
        if (asig) {
            const color = typeof window.getColorAsignatura === 'function' ? window.getColorAsignatura(asig) : '#4CAF50';
            const hBar = document.getElementById('pdf-header-bar');
            const modPdf = document.getElementById('modulo-pdf');
            if (hBar) { hBar.style.background = color; hBar.style.borderColor = color; }
            if (modPdf) modPdf.style.setProperty('--dynamic-color', color);
        }
    }
    function togglePrivacidadUI() {
        const cb = document.getElementById('set-privacy-stats');
        const icon = document.getElementById('privacy-icon');
        const title = document.getElementById('privacy-title');
        const desc = document.getElementById('privacy-desc');
        
        if(!cb || !icon || !title || !desc) return;
        
        // 1. Efecto Desvanecimiento (Humo / Sombras)
        icon.style.opacity = "0";
        icon.style.filter = "blur(4px)";
        title.style.opacity = "0";
        desc.style.opacity = "0";

        // 2. Cambiar la identidad en el pico de la invisibilidad (a los 200ms)
        setTimeout(() => {
            if (cb.checked) {
                // MODO ESPÍA
                icon.className = "fa-solid fa-user-secret";
                icon.style.color = "#888";
                title.innerText = "Modo Espía";
                title.style.color = "#888";
                desc.innerText = "Tus estadísticas están ocultas a tus amigos";
            } else {
                // MODO EXTROVERTIDO
                icon.className = "fa-solid fa-user";
                icon.style.color = "#00b6ca";
                title.innerText = "Modo Extrovertido";
                title.style.color = "#eee";
                desc.innerText = "Tus estadísticas son visibles para todos";
            }
            
            // 3. Efecto Aparición (Aclarar y enfocar)
            icon.style.opacity = "1";
            icon.style.filter = "blur(0px)";
            title.style.opacity = "1";
            desc.style.opacity = "1";
        }, 200); 
        
        // Guardar local y forzar subida a la nube
        localStorage.setItem('estudiador_privacy_stats', cb.checked ? 'true' : 'false');
        if (typeof window.sincronizar === 'function') window.sincronizar();
    }

    function resetSessionData() {
        const deudaActual = window.calcularDeuda();
        State.set('sessionData', { tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0, deudaInicial: deudaActual });
    }
    // --- CONFIGURACIÓN GLOBAL ---


// --- GESTIÓN DE HORARIO Y OBJETIVOS ---
    // Cálculo del objetivo dinámico de HOY
    function getObjetivoHoy() {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1; 
        if(diaSemana === -1) diaSemana = 6; 

        let sumaTotal = 0;
        
        Object.keys(horarioGlobal).forEach(asig => {
            // CORRECCIÓN: Ahora contamos también si es "General" aunque no esté en biblioteca
            if(biblioteca[asig] || asig === "General") {
                sumaTotal += (horarioGlobal[asig][diaSemana] || 0);
            }
        });

        return sumaTotal > 0 ? sumaTotal : 4; 
    }

    // --- ACTUALIZACIÓN DE PROYECTOS CON JERARQUÍA ---
    // Sobreescribe tu función crearProyecto actual
    function crearProyecto() {
        const nombre = prompt("Nombre del Proyecto:");
        if(!nombre) return;
        
        // Vincular a asignatura
        const asigs = Object.keys(biblioteca);
        let asigVinculada = "";
        
        if(asigs.length > 0) {
            // Si estamos dentro de una asignatura, sugerirla por defecto
            let defaultAsig = nombreAsignaturaActual ? (asigs.indexOf(nombreAsignaturaActual)+1) : "";
            let msg = "Vincular a asignatura (número) o dejar vacío para General:\n";
            asigs.forEach((a, i) => msg += `${i+1}. ${a}\n`);
            
            const resp = prompt(msg, defaultAsig);
            const idx = parseInt(resp) - 1;
            if(!isNaN(idx) && asigs[idx]) asigVinculada = asigs[idx];
        }
        
        // Estructura: String simple si es general, Objeto si es vinculado (para compatibilidad hacia atrás)
        // O mejor, migramos todo a objetos. Vamos a usar objetos.
        projects.push({ nombre: nombre, asignatura: asigVinculada });
        guardarProyectos();
        actualizarListaProyectos();
    }


    // --- CALENDARIO MENSUAL NAVEGABLE ---
    function cambiarMes(delta) {
        calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
        updateCalendarHeatmap();
    }
    function actualizarDesplegableMini() { UI.actualizarDesplegableMini(taskList, userColors); }

    /**
     * Resuelve el color de una asignatura de forma robusta e insensible a capitalización.
     * @param {string} nombreRaw 
     * @returns {string} Código de color (HEX o HSL)
     */
    function getColorAsignatura(nombreRaw) {
        if (!nombreRaw) return "#888888";
        
        const nombreNormalizado = String(nombreRaw).trim().toLowerCase();

        // 1. Prioridad: Colores personalizados por el usuario
        if (typeof userColors !== 'undefined' && userColors !== null) {
            const userMatch = Object.keys(userColors).find(k => k.toLowerCase() === nombreNormalizado);
            if (userMatch && userColors[userMatch]) return userColors[userMatch];
        }

        // 2. Prioridad: Colores por defecto del sistema
        if (typeof COLORES_ASIGNATURAS !== 'undefined' && COLORES_ASIGNATURAS !== null) {
            const defaultMatch = Object.keys(COLORES_ASIGNATURAS).find(k => k.toLowerCase() === nombreNormalizado);
            if (defaultMatch && COLORES_ASIGNATURAS[defaultMatch]) return COLORES_ASIGNATURAS[defaultMatch];
        }

        // 3. Fallback: Hash generativo basado en el nombre (siempre dará el mismo color para la misma cadena)
        let hash = 0;
        for (let i = 0; i < nombreNormalizado.length; i++) {
            hash = nombreNormalizado.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash % 360)}, 65%, 55%)`;
    }

    // 3. Renderizar la lista en Ajustes
    function renderColorSettings() { UI.renderColorSettings(biblioteca); }

    // Auxiliar: El input color necesita Hex, pero el hash devuelve HSL. 
    // Esta función asegura que el valor se lea bien en el input.
    function rgbToHex(col) {
        // Función auxiliar robusta para convertir colores
        if(!col) return "#888888";
        if(col.startsWith('#')) return col;
        const temp = document.createElement("div");
        temp.style.color = col;
        document.body.appendChild(temp);
        const styles = window.getComputedStyle(temp);
        const color = styles.color; 
        document.body.removeChild(temp);
        const rgb = color.match(/\d+/g);
        if(!rgb) return "#888888";
        return "#" + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
    }

    // --- LÓGICA DEL NUEVO CONFIGURADOR DE HORARIO ---
    // (global moved to state.js)
    function renderHorarioGrid() {
        UI.renderHorarioGrid(horarioGlobal, biblioteca, diaSeleccionadoIndex);
    }

    function seleccionarDiaHorario(idx, nombreCompleto) {
        diaSeleccionadoIndex = idx;
        
        document.getElementById('day-editor-panel').classList.remove('hidden');
        document.getElementById('day-editor-title').innerText = "Editar " + nombreCompleto;
        
        const select = document.getElementById('sch-subject-select');
        select.innerHTML = "";
        
        // Opción General SIEMPRE presente al principio
        select.innerHTML += `<option value="General">General (Libre)</option>`;

        // Resto de asignaturas
        Object.keys(biblioteca).forEach(a => {
            select.innerHTML += `<option value="${a}">${a}</option>`;
        });

        // Cargar valor actual
        if(select.value) {
            // Intentamos coger el valor de "General" por defecto si existe, o del primero
            const valGeneral = (horarioGlobal["General"] && horarioGlobal["General"][idx]) || 0;
            document.getElementById('sch-pomo-input').value = valGeneral;
        }
        
        renderHorarioGrid();
    }

    function guardarHorarioDia() {
        if (diaSeleccionadoIndex === -1) return;
        
        const asig = document.getElementById('sch-subject-select').value;
        const valor = parseInt(document.getElementById('sch-pomo-input').value) || 0;
        
        if (!asig) { alert("Crea asignaturas primero."); return; }

        // Inicializar array si no existe
        if (!horarioGlobal[asig]) horarioGlobal[asig] = [0,0,0,0,0,0,0];
        
        // Guardar valor en el índice del día
        horarioGlobal[asig][diaSeleccionadoIndex] = valor;
        
        // Persistir y refrescar
        localStorage.setItem('estudiador_horario', JSON.stringify(horarioGlobal));
        renderHorarioGrid();
        
        updatePomoStats(); // <--- ESTO ARREGLA QUE EL NíšMERO NO SE ACTUALIZASE
        
        // Feedback visual breve
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = "¡Hecho!";
        setTimeout(() => btn.innerText = originalText, 1000);
    }
    function getObjetivoContextual() {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1; 
        if(diaSemana === -1) diaSemana = 6; 

        // Si no hay asignatura seleccionada, devolvemos el global (suma de todo)
        if (!nombreAsignaturaActual) {
            return getObjetivoHoy(); // Tu función antigua que suma todo
        }

        // Si hay asignatura, sumamos SU objetivo + el de General
        let objetivoLocal = 0;
        
        // 1. Objetivo de la Asignatura Actual
        if (horarioGlobal[nombreAsignaturaActual]) {
            objetivoLocal += (horarioGlobal[nombreAsignaturaActual][diaSemana] || 0);
        }
        
        // 2. Objetivo General (siempre suma al contexto)
        if (horarioGlobal["General"] && nombreAsignaturaActual !== "General") {
            objetivoLocal += (horarioGlobal["General"][diaSemana] || 0);
        }

        return objetivoLocal > 0 ? objetivoLocal : 1; // Mínimo 1 para evitar división por cero
    }

    // Función mejorada para V1.9.2
    const FILTRO_TIPOS_COLORES = {
        'Definición':  '#c40202', 'Teorema':     '#1e4fb2',
        'Proposición': '#16a116', 'Lema':        '#3b9c67',
        'Corolario':   '#00bcd4', 'Axioma':      '#9c27b0',
        'Observación': '#7242A3', 'Nota':        '#9e9e9e',
        'Ejemplo':     '#3db370', 'Demostración':'#795548',
    };

    function abrirModalFiltros() {
        // Poblar el grid de tipos si está vacío
        const grid = document.getElementById('filtro-tipo-grid');
        if (grid && grid.children.length === 0) {
            Object.entries(FILTRO_TIPOS_COLORES).forEach(([t, c]) => {
                const lbl = document.createElement('label');
                lbl.style.cssText = `display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.78em;padding:4px 10px;border:1px solid ${c}55;border-radius:12px;color:${c};background:${c}15;user-select:none;transition:background 0.15s;`;
                lbl.onmouseover = () => lbl.style.background = `${c}30`;
                lbl.onmouseout  = () => lbl.style.background = lbl.querySelector('input').checked ? `${c}30` : `${c}15`;
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.value = t;
                cb.style.accentColor = c;
                cb.onchange = () => {
                    lbl.style.background = cb.checked ? `${c}30` : `${c}15`;
                    window.aplicarFiltros();
                };
                lbl.appendChild(cb);
                lbl.appendChild(document.createTextNode(t));
                grid.appendChild(lbl);
            });
        }
        Util.toggleModal('modal-filtros', true);
    }

    function cerrarModalFiltros() {
        Util.toggleModal('modal-filtros', false);
    }

    function toggleFiltrosDropdown() { abrirModalFiltros(); } // alias por si queda alguna referencia

    function toggleIconoFiltro(iconId, activeColor) {
        const cbId = 'check-filtro-' + iconId.replace('icon-', '');
        const checked = document.getElementById(cbId)?.checked;
        const icon = document.getElementById(iconId);
        if (icon) icon.style.color = checked ? activeColor : '#555';
    }

    function limpiarFiltros() {
        ['icon-hoy','icon-nuevas','icon-tema','icon-rango','icon-tipo','icon-dificultad'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.color = '#555';
        });
        ['check-filtro-hoy','check-filtro-nuevas','check-filtro-tema','check-filtro-rango','check-filtro-tipo','check-filtro-dificultad',
         'check-dif-1','check-dif-2','check-dif-3','check-dif-4'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        ['filtro-tema-val','filtro-rango-val'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.querySelectorAll('#filtro-tipo-grid input').forEach(cb => {
            cb.checked = false;
            const lbl = cb.closest('label');
            if (lbl) lbl.style.background = `${FILTRO_TIPOS_COLORES[cb.value] || '#888'}15`;
        });
        window.aplicarFiltros();
    }

    function toggleFiltrosUI() {
        const container = document.getElementById('filters-container');
        // Simplemente alternamos la clase. El CSS hace la magia de expansión y rotación.
        container.classList.toggle('filters-active');
    }
    
    // FILES INPUT

    // --- TECLADO MEJORADO (V1.9) ---
    // --- CONTROLADOR DE TECLADO AVANZADO ---
// --- GESTIÓN DE EVENTOS SEGURA (FIX CRÍTICO) ---
    // Envolvemos todo en DOMContentLoaded para asegurar que el HTML existe antes de buscar IDs
/* ===========================================================
       ZONA DE EVENTOS Y TECLADO (PEGAR AL FINAL DEL SCRIPT)
       =========================================================== */

    // 1. DEFINICIÓN DE FUNCIONES VISUALES (Deben existir antes de usarse)
    function simularClickVisual(selector) {
        try {
            const el = document.querySelector(selector);
            if(el) {
                el.classList.add('simulated-active');
                setTimeout(() => el.classList.remove('simulated-active'), 150);
            }
        } catch(e) { Logger.warn("Error visual:", e); }
    }

    function feedbackVisualSimple(el) {
        if(el) {
            el.style.color = "var(--accent)";
            setTimeout(() => el.style.color = "", 200);
        }
    }

    // Pizarra digital → pizarra.js

        /* --- GESTIÓN MÓVIL V2.0 --- */

    function toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const dashboard = document.getElementById('dashboard-col');
        
        // Cerrar dashboard si está abierto para evitar solapamiento
        dashboard.classList.remove('mobile-active');
        
        // Alternar menú
        if (sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
        } else {
            sidebar.classList.add('mobile-open');
        }
    }

    function toggleMobileStats() {
        const dashboard = document.getElementById('dashboard-col');
        const sidebar = document.getElementById('sidebar');
        
        // Cerrar menú si está abierto
        sidebar.classList.remove('mobile-open');
        
        // Alternar dashboard
        if (dashboard.classList.contains('mobile-active')) {
            dashboard.classList.remove('mobile-active');
        } else {
            dashboard.classList.add('mobile-active');
            // Hack para forzar redibujado de gráficas si Chart.js tuviera problemas (opcional)
            window.updateDashboard(); 
        }
    }

    function cerrarPanelesMoviles() {
        document.getElementById('sidebar').classList.remove('mobile-open');
        document.getElementById('dashboard-col').classList.remove('mobile-active');
    }


    // MODO EXAMEN → exam.js (carga antes de app.js)


    // EXAM, generarBarraEstrellas y todos los window.examen* → exam.js
    // _examenActivo sigue siendo global de state.js (leído por keydown handler).





    /**
     * @function persistirDatosLocales
     * @description Guarda de forma asíncrona un objeto pesado en IndexedDB.
     * Sustituye a localStorage.setItem para evitar bloqueos del hilo principal (UI).
     * @param {string} key - Clave del almacén (ej: 'fechasClave', 'biblioteca_local')
     * @param {any} data - Objeto o array a persistir.
     */
    function persistirDatosLocales(key, data) {
        if (typeof DB !== 'undefined') {
            DB.setVar(key, data).catch(e => {
                if (typeof Logger !== 'undefined') Logger.error(`Fallo al persistir [${key}] en IndexedDB:`, e);
            });
        }
    }

    /**
     * @function inicializarAlmacenamientoAsincrono
     * @description Hidrata el estado global desde IndexedDB. Si detecta la base de datos legacy
     * en localStorage, realiza una migración "On-the-fly", transfiere los datos a IndexedDB y purga el localStorage.
     * @returns {Promise<void>} Promesa que se resuelve cuando el estado (State) tiene los datos listos.
     */
    async function inicializarAlmacenamientoAsincrono() {
        if (typeof DB === 'undefined') return;

        let fechasLegacy = localStorage.getItem('estudiador_fechas_clave');
        if (fechasLegacy) {
            await DB.setVar('fechasClave', JSON.parse(fechasLegacy));
            localStorage.removeItem('estudiador_fechas_clave');
        }
        const fechasDB = await DB.getVar('fechasClave');
        if (fechasDB) {
            if (typeof State !== 'undefined') State.set('fechasClave', fechasDB);
            else window.fechasClave = fechasDB;
        }

        let horarioLegacy = localStorage.getItem('estudiador_horario');
        if (horarioLegacy) {
            await DB.setVar('horario', JSON.parse(horarioLegacy));
            localStorage.removeItem('estudiador_horario');
        }
        const horarioDB = await DB.getVar('horario');
        if (horarioDB) {
            // FIX: La variable global que leen los widgets es horarioGlobal, no horario.
            if (typeof State !== 'undefined') State.set('horarioGlobal', horarioDB);
            else window.horarioGlobal = horarioDB;
        }

        let dbLegacy = localStorage.getItem('estudiador_db_v2');
        if (dbLegacy) {
            await DB.setVar('biblioteca_local', JSON.parse(dbLegacy));
            localStorage.removeItem('estudiador_db_v2');
        }
        const biblioDB = await DB.getVar('biblioteca_local');
        if (biblioDB) {
            if (typeof State !== 'undefined') State.set('biblioteca', biblioDB);
            else window.biblioteca = biblioDB;
        }
    }

    // Atajos de teclado para el examen — SOLO activos cuando _examenActivo=true
    document.addEventListener('keydown', (ev) => {
        if (!_examenActivo) return;
        const tag = ev.target.tagName;
        // No interferir cuando el usuario está escribiendo en el textarea del examen real
        if (tag === 'TEXTAREA') return;

        if (ev.key === 'Enter') {
            const btnR = document.getElementById('ex-f-btn-revelar');
            if (btnR && btnR.style.display !== 'none') { ev.preventDefault(); examenFlashRevelar(); }
            return;
        }
        // 1-4: calificar en modo flash
        if (['1','2','3','4'].includes(ev.key)) {
            const val = document.getElementById('ex-f-valoracion');
            if (val && val.style.display !== 'none') {
                ev.preventDefault();
                examenFlashPuntuar(parseInt(ev.key));
            }
        }
    });


    /**
     * @function InicializadorPrincipal
     * @description Punto de entrada único de la aplicación. 
     * Hidrata el estado desde IndexedDB de forma asíncrona antes de permitir la interacción con la UI.
     * @inputs Ninguno.
     * @outputs {void}
     * @sideEffects Inicializa variables globales y acopla listeners al DOM.
     */
    document.addEventListener('DOMContentLoaded', async () => {
        // 1. BLOQUEO: Esperamos a que la base de datos local cargue
        if (typeof inicializarAlmacenamientoAsincrono === 'function') {
            await inicializarAlmacenamientoAsincrono();
        }

        // 2. SANITIZACIÓN DE DATOS EN MEMORIA
        if (typeof normalizarPomoFechas === 'function') normalizarPomoFechas();
        if (typeof normalizarBibliotecaFechas === 'function') normalizarBibliotecaFechas();
        if (typeof normalizarFechasClave === 'function') normalizarFechasClave();

        // 3. CARGA DE ESTADO LIGERO (LocalStorage)
        initAppState();
        // INICIALIZACIÓN MÓDULO I/O
        if (typeof DataIO !== 'undefined') {
            DataIO.init({
                guardarEnLocal, 
                cancelarEdicion, 
                aplicarFiltros: window.aplicarFiltros, 
                updateDashboard: window.updateDashboard, 
                cargarAsignatura, 
                actualizarMenuLateral, 
                sincronizar: window.sincronizar,
                getFechaHoy: window.getFechaHoy, 
                ordenarTarjeta: window.ordenarTarjeta
            });
        }
        if (typeof StudyEngine !== 'undefined') {
            StudyEngine.init({ 
                guardarEnLocal, 
                updateDashboard: window.updateDashboard 
            });
        }
        const elPrivacy = document.getElementById('set-privacy-stats');
        if (elPrivacy) {
            elPrivacy.checked = localStorage.getItem('estudiador_privacy_stats') === 'true';
            if (typeof togglePrivacidadUI === 'function') togglePrivacidadUI(); // Fuerza el dibujo inicial
        }
        

        // 4. INICIALIZACIÓN DE INTERFAZ Y SESIÓN
        if (typeof setPomoMode === "function") setPomoMode('work');
        if (typeof resetSessionData === 'function') resetSessionData();
        if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
        if (typeof cargarApariencia === 'function') cargarApariencia();
        if (typeof renderFechasList === 'function') renderFechasList();
        if (typeof renderUpcomingEvents === 'function') renderUpcomingEvents();
        if (typeof WidgetManager !== 'undefined') WidgetManager.init();

        // 5. RENDERIZADO DE WIDGETS (Ahora es seguro porque la DB ya cargó)
        if (typeof updatePomoStats === 'function') updatePomoStats();
        if (typeof updateWeeklyWidget === 'function') updateWeeklyWidget();
        if (typeof updateGlobalStats === 'function') updateGlobalStats();
        if (typeof updatePendingWindow === 'function') updatePendingWindow();

        // 6. EVENTOS DE UI Y ARCHIVOS
        const listaAsig = document.getElementById('lista-asignaturas');
        if (listaAsig) {
            listaAsig.addEventListener('click', () => {
                if (window.innerWidth < 950) setTimeout(typeof cerrarPanelesMoviles === 'function' ? cerrarPanelesMoviles : () => {}, 150);
            });
        }

        const inputArchivo = document.getElementById('file-input-unified');
        if (inputArchivo) {
            inputArchivo.addEventListener('change', async (e) => {
                if(e.target.files.length === 0) return;
                let importados = 0;
                for(let f of e.target.files) { 
                    try { 
                        const nombreArchivo = f.name.replace('.json','');
                        const contenido = JSON.parse(await f.text());
                        if(Array.isArray(contenido)) {
                            if(biblioteca[nombreArchivo] && !confirm(`La asignatura "${nombreArchivo}" ya existe. ¿Sobreescribir?`)) continue;
                            biblioteca[nombreArchivo] = contenido;
                            importados++;
                        }
                    } catch(err) { Logger.error("Error leyendo archivo:", err); } 
                }
                if(importados > 0) {
                    guardarEnLocal(); 
                    actualizarMenuLateral();
                    alert(` ${importados} asignaturas importadas correctamente.`);
                }
                e.target.value = ""; 
            });
        }

        // --- B. CONTROLADOR DE TECLADO (GLOBAL) ---
        document.addEventListener('keydown', (e) => {
            if (!e.key) return; // GUARD: Previene colapsos con eventos sintéticos o teclados virtuales
            
            const key = e.key.toLowerCase();
            const tag = e.target.tagName;
            const isInput = (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable || tag === 'SELECT');

            // Detectar si estamos en el Editor Amigable
            const editorCard = document.getElementById('editor-card');
            const isEditorActive = editorCard && !editorCard.classList.contains('hidden');

            // --- MODO POWER USER: Navegar en el editor INCLUSO mientras escribes ---
            if (isEditorActive) {
                // Usamos la tecla Alt + Flechas/A/D para saltar de tarjeta sin perder el foco
                if (e.altKey && (key === 'a' || key === 'arrowleft')) {
                    e.preventDefault();
                    if(typeof simularClickVisual === 'function') simularClickVisual('#btn-edit-prev');
                    if(typeof navegarEditor === 'function') navegarEditor(-1);
                    return;
                }
                if (e.altKey && (key === 'd' || key === 'arrowright')) {
                    e.preventDefault();
                    if(typeof simularClickVisual === 'function') simularClickVisual('#btn-edit-next');
                    if(typeof navegarEditor === 'function') navegarEditor(1);
                    return;
                }
                
                // Si NO estamos escribiendo texto, permitimos las teclas normales también
                if (!isInput) {
                    if (key === 'a' || key === 'arrowleft') {
                        e.preventDefault();
                        if(typeof simularClickVisual === 'function') simularClickVisual('#btn-edit-prev');
                        if(typeof navegarEditor === 'function') navegarEditor(-1);
                        return;
                    }
                    if (key === 'd' || key === 'arrowright') {
                        e.preventDefault();
                        if(typeof simularClickVisual === 'function') simularClickVisual('#btn-edit-next');
                        if(typeof navegarEditor === 'function') navegarEditor(1);
                        return;
                    }
                }
            }

            // 1. Evitar disparar el resto de atajos globales si estamos escribiendo texto
            if(isInput) return;

            // --- ATAJOS GLOBALES ---
            
            // ESPACIO: Pausar/Reanudar Pomodoro
            if(key === ' ') {
                e.preventDefault();
                if(typeof toggleTimer === 'function') toggleTimer();
                if(typeof simularClickVisual === 'function') {
                    simularClickVisual('#mini-btn-toggle'); 
                    simularClickVisual('#btn-pomo-action');
                }
                return;
            }

            // TECLA 'L': Modo Lectura
            if(key === 'l') { 
                e.preventDefault();
                const chk = document.getElementById('check-lectura');
                if(chk) { 
                    chk.checked = !chk.checked; 
                    if(typeof window.toggleModoLectura === 'function') window.toggleModoLectura(); 
                    if(typeof feedbackVisualSimple === 'function') feedbackVisualSimple(chk.parentElement);
                }
                return;
            }

            if(key === 's') { 
                e.preventDefault();
                const chk = document.getElementById('check-secuencial');
                if(chk) { 
                    chk.checked = !chk.checked; 
                    if(typeof window.toggleModoSecuencial === 'function') window.toggleModoSecuencial(); 
                    if(typeof feedbackVisualSimple === 'function') feedbackVisualSimple(chk.parentElement);
                }
                return;
            }

            // --- ATAJOS CONTEXTO ESTUDIO ---
            const studyCard = document.getElementById('study-card');
            const isStudyActive = studyCard && !studyCard.classList.contains('hidden');
            
            if(isStudyActive) {
                // FLECHA DERECHA o 'D': Siguiente
                if(key === 'd' || key === 'arrowright') {
                    e.preventDefault();
                    if(typeof simularClickVisual === 'function') simularClickVisual('.btn-next');
                    if(typeof window.siguienteTarjeta === 'function') window.siguienteTarjeta();
                    return;
                }
                
                if(key === 'a' || key === 'arrowleft') {
                    e.preventDefault();
                    const btnPrev = document.getElementById('btn-prev');
                    if(btnPrev && !btnPrev.classList.contains('hidden')) {
                        if(typeof simularClickVisual === 'function') simularClickVisual('#btn-prev');
                        if(typeof window.anteriorTarjeta === 'function') window.anteriorTarjeta();
                    }
                    return;
                }

                // ENTER: Revelar u Ocultar respuesta
                if(key === 'enter') { 
                    e.preventDefault();
                    
                    const contenido = document.getElementById('concepto-contenido');
                    const estaVisible = contenido && !contenido.classList.contains('hidden');
                    
                    if(estaVisible) {
                        if(typeof simularClickVisual === 'function') simularClickVisual('#btn-ocultar');
                        if(typeof UI.ocultarRespuesta === 'function') UI.ocultarRespuesta();
                    } else {
                        if(typeof simularClickVisual === 'function') simularClickVisual('#btn-main-revelar');
                        if(typeof UI.revelar === 'function') UI.revelar();
                    }
                    return;
                }
                
                // NÚMEROS 1-4: Calificar
                if(['1','2','3','4'].includes(key)) {
                    const controles = document.getElementById('controles-respuesta');
                    if(controles && !controles.classList.contains('hidden')) {
                        if(typeof simularClickVisual === 'function') simularClickVisual(`.btn-dif-${key}`); 
                        if(typeof window.procesarRepaso === 'function') window.procesarRepaso(parseInt(key));
                    }
                    return;
                }
            }
        });
        
        // Logger opcional de confirmación
        if (typeof Logger !== 'undefined') Logger.info("Estudiador: Teclado global restaurado.");
        
    
    });



// ════════════════════════════════════════════════════════════════
// EVENT DELEGATION — handlers para elementos generados dinámicamente
// ════════════════════════════════════════════════════════════════
document.addEventListener('click', function(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const idx    = el.dataset.idx    !== undefined ? Number(el.dataset.idx)  : undefined;
    const nombre = el.dataset.nombre !== undefined ? el.dataset.nombre       : undefined;
    const id     = el.dataset.id     !== undefined ? el.dataset.id           : undefined;
    const n      = el.dataset.n      !== undefined ? Number(el.dataset.n)    : undefined;

    switch (action) {
        case 'renombrarAsignatura':  renombrarAsignatura(nombre, e);   break;
        case 'borrarAsignatura':     borrarAsignatura(nombre, e);      break;
        case 'borrarProyecto':       borrarProyecto(idx);              break;
        case 'editTask':             editTask(idx, e);                 break;
        case 'toggleDone':           toggleDone(idx, e);               break;
        case 'deleteTask':           deleteTask(idx, e);               break;
        case 'eliminarFechaClave':   eliminarFechaClave(id);           break;
        case 'borrarSlot':           borrarSlot(idx, e);               break;
        case 'examRealIrA':          EXAM._api.realIrA(idx);           break;
        case 'examenCorreccionPuntuar': examenCorreccionPuntuar(idx, n); break;
        case 'cargarPanelAmigos':          cargarPanelAmigos();                                          break;
        case 'importarAsignaturaCompartida': importarAsignaturaCompartida(el.dataset.id);                  break;
        case 'aceptarSolicitud':            aceptarSolicitud(el.dataset.id, el.dataset.email);             break;
        case 'verStatsAmigo':               verStatsAmigo(el.dataset.uid, el.dataset.email);               break;
        case 'abrirCompartirAsignatura':    abrirCompartirAsignatura(el.dataset.email);                    break;
        case 'enviarSolicitudAmistad':      enviarSolicitudAmistad();                                      break;
        case 'compartirAsignatura':         compartirAsignatura(el.dataset.email, el.dataset.asig);        break;
        case 'rechazarSolicitud':           rechazarSolicitud(id);                                         break;
        case 'eliminarAmigo':               eliminarAmigo(id);                                             break;
        case 'minimizeWidget':
            if (typeof WidgetManager !== 'undefined') WidgetManager.toggleMinimize(el.dataset.widgetId);
            break;
        case 'hideWidget':
            if (typeof WidgetManager !== 'undefined') WidgetManager.toggleHide(el.dataset.widgetId);
            break;
        case 'restoreWidget':
            if (typeof WidgetManager !== 'undefined') WidgetManager.toggleHide(el.dataset.widgetId);
            break;
    }
});

// ════════════════════════════════════════════════════════════════
// EVENT BINDINGS — generado automáticamente en refactor v1
// ════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };

  on("#sidebar-toggle", "click", toggleSidebar);
  on("#btn-abrirajustes", "click", abrirAjustes);
  on("#btn-gestionarnuevaasignatura", "click", gestionarNuevaAsignatura);
  on("#btn-crearproyecto", "click", crearProyecto);
  on("#btn-modoimportar", "click", modoImportar);
  on("#btn-abrirexamen", "click", abrirExamen);
  on("#btn-togglepizarra", "click", () => Pizarra.toggle());
  on("#btn-modoedicionjson", "click", abrirEditorAmigable);
  on("#btn-ir-json", "click", modoEdicionJSON);
  on("#btn-guardar-edicion-amigable", "click", () => guardarDatosEditorAmigable(true));
  on("#btn-edit-prev", "click", () => navegarEditor(-1));
  on("#btn-edit-next", "click", () => navegarEditor(1));
  on("#btn-cancelaredicion-1", "click", cancelarEdicion);
  on("#btn-main-revelar", "click", UI.revelar);
  on("#btn-procesarrepaso", "click", () => window.procesarRepaso(1));
  on("#btn-procesarrepaso-2", "click", () => window.procesarRepaso(2));
  on("#btn-procesarrepaso-3", "click", () => window.procesarRepaso(3));
  on("#btn-procesarrepaso-4", "click", () => window.procesarRepaso(4));
  on("#btn-prev", "click", window.anteriorTarjeta);
  on("#btn-siguientetarjeta", "click", () => window.siguienteTarjeta(true));
  on("#btn-ocultar", "click", UI.ocultarRespuesta);
  on("#btn-filtros-dropdown", "click", abrirModalFiltros);
  on("#check-secuencial", "change", window.toggleModoSecuencial);
  on("#check-lectura", "change", window.toggleModoLectura);
  on("#pdf-toggle-mini", "click", toggleAcordeonPDF);
  on("#pdf-header-bar", "click", toggleAcordeonPDF);
  on("#btn-crearslotrecurso", "click", crearSlotRecurso);
  on("#input-pdf-slot", "change", (e) => cargarPDFEnSlot(e.target));
  on("#btn-cancelaredicion", "click", cancelarEdicion);
  on("#btn-guardarnuevoconcepto", "click", guardarNuevoConcepto);
  on("#btn-descargarasignaturaactual", "click", descargarAsignaturaActual);
  on("#btn-cancelaredicion-2", "click", cancelarEdicion);
  on("#btn-guardaredicionjson", "click", guardarEdicionJSON);
  on("#btn-volver-visual", "click", abrirEditorAmigable);    
  on("#tab-import-json", "click", () => setImportMode('json'));
  on("#tab-import-latex", "click", () => setImportMode('latex'));
  on("#btn-cancelaredicion-3", "click", cancelarEdicion);
  on("#btn-procesarimportacion", "click", procesarImportacion);
  on("#btn-cancelaredicion-4", "click", cancelarEdicion);
  on("#btn-procesarimportacionlatex", "click", procesarImportacionLatex);
  on("#btn-abrirmodalpomodoro", "click", abrirModalPomodoro);
  on("#mini-btn-toggle", "click", toggleTimer);
  on("#btn-finishpomodoro", "click", finishPomodoro);
  on("#mini-task-select", "change", (e) => activarTareaDesdeMini(e.target.value));
  on("#btn-week-7", "click", () => setWeeklyView('7d'));
  on("#btn-week-28", "click", () => setWeeklyView('28d'));
  on("#btn-cambiarmes", "click", () => cambiarMes(-1));
  on("#btn-add-fecha", "click", abrirFechasModal);
  on("#btn-cambiarmes-2", "click", () => cambiarMes(1));
  on("#btn-cerrarresumensesion", "click", cerrarResumenSesion);
  on("#btn-cerrarfechasmodal", "click", cerrarFechasModal);
  on("#btn-guardarfechaclave", "click", guardarFechaClave);
  on("#btn-cerrarajustes", "click", UI.cerrarAjustes);
  on("#btn-guardarhorariodia", "click", guardarHorarioDia);
  on("#set-visual-theme", "change", guardarApariencia);
  on("#set-click-effect", "change", guardarApariencia);
  on("#btn-guardarajustes", "click", guardarAjustes);
  on("#btn-login", "click", procesarLogin);
  on("#btn-register", "click", procesarRegistro);
  on("#btn-abrirmodalamigos", "click", abrirModalAmigos);
  on("#btn-cerrarsesion", "click", cerrarSesion);
  on("#btn-sync-nube", "click", forzarRespaldoNube);
  on("#btn-forzarbajada", "click", forzarBajada);
  on("#btn-exportarbackup", "click", exportarBackup);
  on("#btn-document", "click", () => document.getElementById('backup-input-unico').click());
  on("#backup-input-unico", "change", (e) => importarBackup(e.target));
  on("#btn-borrartodolocal", "click", borrarTodoLocal);
  on("#btn-cerrarmodalpomodoro", "click", cerrarModalPomodoro);
  on("#btn-mode-work", "click", () => setPomoMode('work'));
  on("#btn-mode-short", "click", () => setPomoMode('short'));
  on("#btn-mode-long", "click", () => setPomoMode('long'));
  on("#btn-pomo-action", "click", toggleTimer);
  on("#btn-finishpomodoro-2", "click", finishPomodoro);
  on("#add-task-trigger", "click", showTaskForm);
  on("#btn-adjpomo", "click", () => adjPomo(1));
  on("#btn-adjpomo-2", "click", () => adjPomo(-1));
  on("#btn-hidetaskform", "click", hideTaskForm);
  on("#btn-savenewtask", "click", saveNewTask);
  on("#btn-cerrarexamen", "click", cerrarExamen);
  on("#btn-cerrarexamen-2", "click", cerrarExamen);
  on("#ex-mode-btn-flash", "click", () => examenSetMode('flash'));
  on("#ex-mode-btn-real", "click", () => examenSetMode('real'));
  on("#btn-iniciarexamen", "click", iniciarExamen);
  on("#btn-cerrarexamen-3", "click", cerrarExamen);
  on("#ex-f-btn-revelar", "click", examenFlashRevelar);
  on("#btn-examenflashpuntuar", "click", () => examenFlashPuntuar(1));
  on("#btn-examenflashpuntuar-2", "click", () => examenFlashPuntuar(2));
  on("#btn-examenflashpuntuar-3", "click", () => examenFlashPuntuar(3));
  on("#btn-examenflashpuntuar-4", "click", () => examenFlashPuntuar(4));
  on("#btn-cerrarexamen-4", "click", cerrarExamen);
  on("#btn-examenrealguardarrespuesta", "input", examenRealGuardarRespuesta);
  on("#btn-examenrealanterior", "click", examenRealAnterior);
  on("#btn-examenrealsiguiente", "click", examenRealSiguiente);
  on("#btn-examenrealentregar", "click", examenRealEntregar);
  on("#btn-cerrarexamen-5", "click", cerrarExamen);
  on("#ex-c-btn-nota", "click", examenRealCalcularNota);
  on("#btn-repetirexamen", "click", repetirExamen);
  on("#btn-cerrarexamen-6", "click", cerrarExamen);
  on("#pz-btn-lapiz", "click", () => Pizarra.setModo('lapiz'));
  on("#pz-btn-resaltador", "click", () => Pizarra.setModo('resaltador'));
  on("#pz-btn-linea", "click", () => Pizarra.setModo('linea'));
  on("#pz-btn-borrador", "click", () => Pizarra.setModo('borrador'));
  on("#pz-color-amarillo", "click", () => Pizarra.setColor('#ffff00'));
  on("#pz-color-blanco", "click", () => Pizarra.setColor('#ffffff'));
  on("#pz-color-cyan", "click", () => Pizarra.setColor('#00e5ff'));
  on("#pz-color-salmon", "click", () => Pizarra.setColor('#ff6b6b'));
  on("#pz-color-verde", "click", () => Pizarra.setColor('#69ff47'));
  on("#pizarra-color", "change", (e) => Pizarra.setColor(e.target.value));
  on("#pizarra-grosor", "input", (e) => Pizarra.setGrosor(e.target.value));
  on("#btn-undopizarra", "click", () => Pizarra.undo());
  on("#btn-limpiarpizarra", "click", () => Pizarra.limpiar());
  on("#btn-togglepizarra-2", "click", () => Pizarra.toggle(false));
  on("#btn-togglemobilemenu", "click", toggleMobileMenu);
  on("#btn-cerrarpanelesmoviles", "click", cerrarPanelesMoviles);
  on("#btn-togglemobilestats", "click", toggleMobileStats);
  on("#btn-togglechat", "click", toggleChat);
  on("#ai-user-input", "keydown", (e) => { checkEnterIA(e) });
  on("#btn-send-ai", "click", enviarMensajeIA);
  on("#btn-open-chat", "click", toggleChat);
  on("#btn-cerrarmodalamigos", "click", cerrarModalAmigos);
  on("#btn-cerrarmodalfiltros", "click", cerrarModalFiltros);
  on("#check-filtro-hoy", "change", () => { toggleIconoFiltro('icon-hoy','#C93412'); window.aplicarFiltros() });
  on("#btn-document-2", "click", () => document.getElementById('check-filtro-hoy').click());
  on("#check-filtro-nuevas", "change", () => { toggleIconoFiltro('icon-nuevas','#C93412'); window.aplicarFiltros() });
  on("#btn-document-3", "click", () => document.getElementById('check-filtro-nuevas').click());
  on("#check-filtro-tema", "change", () => { toggleIconoFiltro('icon-tema','#C93412'); window.aplicarFiltros() });
  on("#btn-document-4", "click", () => document.getElementById('check-filtro-tema').click());
  on("#filtro-tema-val", "input", window.aplicarFiltros);
  on("#check-filtro-rango", "change", () => { toggleIconoFiltro('icon-rango','#256ca5'); window.aplicarFiltros() });
  on("#btn-document-5", "click", () => document.getElementById('check-filtro-rango').click());
  on("#filtro-rango-val", "input", window.aplicarFiltros);
  on("#check-filtro-tipo", "change", () => { toggleIconoFiltro('icon-tipo','#C93412'); window.aplicarFiltros() });
  on("#btn-document-6", "click", () => document.getElementById('check-filtro-tipo').click());
  on("#check-filtro-dificultad", "change", () => { toggleIconoFiltro('icon-dificultad','#C93412'); window.aplicarFiltros() });
  on("#btn-document-7", "click", () => document.getElementById('check-filtro-dificultad').click());
  on("#check-dif-1", "change", window.aplicarFiltros);
  on("#check-dif-2", "change", window.aplicarFiltros);
  on("#check-dif-3", "change", window.aplicarFiltros);
  on("#check-dif-4", "change", window.aplicarFiltros);
  on("#btn-limpiarfiltros", "click", limpiarFiltros);
  on("#btn-cerrarmodalfiltros-2", "click", cerrarModalFiltros);
  on("#set-privacy-stats", "change", togglePrivacidadUI);
});
