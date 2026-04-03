// ════════════════════════════════════════════════════════════════
// UI-EXAMPLANNER.JS — Workspace de Planificación Avanzada (Integrado)
// ════════════════════════════════════════════════════════════════

const UIExamPlanner = (() => {
    // ── ESTADO LOCAL ──
    const UIState = {
        view: 'calendar', 
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth()
    };

    // CACHE LOCAL para evitar desincronización - SOU la fuente de verdad en runtime
    let planCache = null;

    const DEFAULT_STUDY_TYPES = [
        { id: 'st_read',  name: 'Lectura',   icon: 'fa-book-open',     color: 'var(--status-blue)' },
        { id: 'st_study', name: 'Estudio',   icon: 'fa-brain',         color: 'var(--status-yellow)' },
        { id: 'st_prac',  name: 'Práctica',  icon: 'fa-pen-to-square', color: 'var(--accent)' },
        { id: 'st_rev',   name: 'Repaso',    icon: 'fa-rotate-right',  color: 'var(--status-green)' }
    ];
    const DEFAULT_DAILY_CAPACITIES = { regularCourse: 4, examSeason: 8, weekend: 6 };
    const DEFAULT_EXAM_WEIGHTS = [
        { id: 'minor',  label: 'Prueba Menor',  multiplier: 0.5 },
        { id: 'mid',    label: 'Parcial',       multiplier: 1.0 },
        { id: 'final',  label: 'Examen Final',  multiplier: 2.0 },
        { id: 'proj',   label: 'Entrega Final', multiplier: 1.5 }
    ];

    // ── GESTIÓN DE ESTADO CENTRALIZADO ──
    // NOTA: getPlan ahora es async y debe ser await'd en contextos async
    // Para contextos síncronos, usar getPlanSync() que lee de State cache
    async function getPlan() {
        let plan = null;
        
        // INTENTAR 1: Leer de IndexedDB (fuente de verdad)
        try {
            if (typeof DB !== 'undefined' && DB.getVar) {
                plan = await DB.getVar('planificador_pro');
            }
        } catch(e) {
            Logger.warn('[UIExamPlanner] getPlan: error leyendo IndexedDB:', e);
        }
        
        // INTENTAR 2: Fallback a localStorage
        if (!plan) {
            try {
                const planGuardado = localStorage.getItem('estudiador_planificador_pro');
                if (planGuardado) {
                    plan = JSON.parse(planGuardado);
                }
            } catch(e) {
                Logger.warn('[UIExamPlanner] getPlan: error leyendo localStorage:', e);
            }
        }
        
        // INTENTAR 3: Fallback a State
        if (!plan) {
            plan = typeof State !== 'undefined' ? State.get('planificador') : null;
        }
        
        if (!plan || !plan.asignaturasPlanificadas) {
            plan = {
                studyTypes: [
                    { id: 'st_read',  name: 'Lectura',   icon: 'fa-book-open',     color: 'var(--status-blue)' },
                    { id: 'st_study', name: 'Estudio',   icon: 'fa-brain',         color: 'var(--status-yellow)' },
                    { id: 'st_prac',  name: 'Práctica',  icon: 'fa-pen-to-square', color: 'var(--accent)' },
                    { id: 'st_rev',   name: 'Repaso',    icon: 'fa-rotate-right',  color: 'var(--status-green)' }
                ],
                dailyCapacities: { regularCourse: 4, examSeason: 8, weekend: 6 },
                asignaturasPlanificadas: [],
                examenes: [],
                schedule: {}
            };
        }
        if (!Array.isArray(plan.studyTypes) || plan.studyTypes.length === 0) {
            plan.studyTypes = DEFAULT_STUDY_TYPES.map(t => ({ ...t }));
        }
        if (!plan.dailyCapacities || typeof plan.dailyCapacities !== 'object') {
            plan.dailyCapacities = { ...DEFAULT_DAILY_CAPACITIES };
        }
        if (!Array.isArray(plan.examWeights) || plan.examWeights.length === 0) {
            plan.examWeights = DEFAULT_EXAM_WEIGHTS.map(w => ({ ...w }));
        }
        if (!Array.isArray(plan.asignaturasPlanificadas)) plan.asignaturasPlanificadas = [];
        if (!Array.isArray(plan.examenes)) plan.examenes = [];
        if (!plan.schedule || typeof plan.schedule !== 'object') plan.schedule = {};

        // AÑADIR: reconstruir asignaturas desde el schedule si la lista está vacía
        if (plan.asignaturasPlanificadas.length === 0 && Object.keys(plan.schedule).length > 0) {
            const asigMap = {};
            Object.values(plan.schedule).forEach(tareas => {
                tareas.forEach(t => {
                    if (t.asigId && !asigMap[t.asigId]) {
                        asigMap[t.asigId] = {
                            id: t.asigId,
                            nombre: t.asigNombre || t.asigId,
                            acronimo: t.acronimo || '',
                            color: t.color || 'var(--accent)',
                            temas: []
                        };
                    }
                    if (t.asigId && t.temaId && asigMap[t.asigId]) {
                        const yaExiste = asigMap[t.asigId].temas.some(tm => tm.id === t.temaId);
                        if (!yaExiste) {
                            asigMap[t.asigId].temas.push({
                                id: t.temaId,
                                nombre: t.temaNombre || t.temaId,
                                pomosEstimados: t.pomosAsignados || 2,
                                tipoEstudioId: t.studyTypeId || 'st_read'
                            });
                        }
                    }
                });
            });
            plan.asignaturasPlanificadas = Object.values(asigMap);
        }

        normalizarSchedulePlan(plan);
        return plan;
    }

    // Versión síncrona para contextos que no pueden ser async
    // Lee del cache local que es la fuente de verdad en runtime
    function getPlanSync() {
        // Si no hay cache, rellenar de State
        if (!planCache) {
            planCache = State.get('planificador');
        }
        
        if (!planCache || !planCache.asignaturasPlanificadas) {
            // Crear plan vacío en caché
            planCache = {
                studyTypes: DEFAULT_STUDY_TYPES.map(t => ({ ...t })),
                dailyCapacities: { ...DEFAULT_DAILY_CAPACITIES },
                asignaturasPlanificadas: [],
                examenes: [],
                schedule: {}
            };
        }
        
        return planCache;
    }

    function getTaskId(task, fallback = '') {
        return String(task?.idTarea ?? task?.id ?? fallback);
    }

    function getTaskStatus(task) {
        if (task?.status === 'completed' || task?.status === 'failed' || task?.status === 'pending') {
            return task.status;
        }
        return task?.completada ? 'completed' : 'pending';
    }

    function getTaskPomos(task) {
        const pomos = Number(task?.pomosAsignados ?? task?.pomos ?? 0);
        return Number.isFinite(pomos) ? pomos : 0;
    }

    function resolveLegacyStudyTypeId(task) {
        if (task?.studyTypeId) return task.studyTypeId;
        const typeName = String(task?.typeName || '').toLowerCase();
        if (typeName.includes('repaso')) return 'st_rev';
        if (typeName.includes('práct') || typeName.includes('pract')) return 'st_prac';
        if (typeName.includes('lectura')) return 'st_read';
        return 'st_study';
    }

    function resolveTaskColor(plan, task) {
        if (task?.color) return task.color;
        const asig = (plan.asignaturasPlanificadas || []).find(a =>
            a.id === task?.asigId || a.nombre === task?.asigNombre
        );
        if (asig?.color) return asig.color;
        if (typeof window.getColorAsignatura === 'function' && task?.asigNombre) {
            const color = window.getColorAsignatura(task.asigNombre);
            if (color) return color;
        }
        return 'var(--accent)';
    }

    function normalizarTareaPlan(plan, task, fecha, index) {
        if (!task || typeof task !== 'object') return null;

        const taskId = getTaskId(task, `legacy_${fecha}_${index}`);
        const pomosAsignados = getTaskPomos(task);
        const status = getTaskStatus(task);
        const temaNombre = String(task.temaNombre || task.typeName || 'Estudio planificado').trim() || 'Estudio planificado';

        return {
            ...task,
            id: task.id || taskId,
            idTarea: taskId,
            temaNombre,
            studyTypeId: resolveLegacyStudyTypeId(task),
            typeName: task.typeName || temaNombre,
            pomos: pomosAsignados,
            pomosAsignados,
            status,
            completada: status === 'completed',
            color: resolveTaskColor(plan, task)
        };
    }

    function normalizarSchedulePlan(plan) {
        Object.keys(plan.schedule || {}).forEach(fecha => {
            const tareas = Array.isArray(plan.schedule[fecha]) ? plan.schedule[fecha] : [];
            plan.schedule[fecha] = tareas
                .map((task, index) => normalizarTareaPlan(plan, task, fecha, index))
                .filter(Boolean);
        });
    }

    function aplicarEstadoTarea(task, status) {
        task.status = status;
        task.completada = status === 'completed';
    }

    function savePlan(plan) {
        normalizarSchedulePlan(plan);
        
        // PRIMERO: actualizar cache local CON CLON PROFUNDO (fuente de verdad en runtime)
        planCache = JSON.parse(JSON.stringify(plan));
        
        // SEGUNDO: actualizar State para otros handlers
        State.set('planificador', planCache);
        
        // TERCERO: guardar en persisten storage en background (no bloqueante)
        
        // Guardar en IndexedDB
        if (typeof DB !== 'undefined' && DB.setVar) {
            DB.setVar('planificador_pro', planCache)
                .then(() => Logger.info('[UIExamPlanner] Plan guardado en IndexedDB'))
                .catch(e => Logger.error('[UIExamPlanner] Error guardando en IndexedDB:', e));
        }
        
        // Guardar también en localStorage como fallback
        try {
            localStorage.setItem('estudiador_planificador_pro', JSON.stringify(planCache));
        } catch(e) {
            Logger.error('[UIExamPlanner] savePlan: error al guardar en localStorage:', e);
        }
        
        // Emitir evento para que otros handlers se enteren
        if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
        
        // Actualizar heatmap si existe
        try {
            if (typeof window.updateCalendarHeatmap === 'function') window.updateCalendarHeatmap();
        } catch(e) {
            Logger.warn('[UIExamPlanner] updateCalendarHeatmap falló (no crítico):', e);
        }
    }

    // ── RENDERIZADOR PRINCIPAL ──
    function renderWorkspace() {
        let ws = document.getElementById('examplanner-workspace');
        if (!ws) {
            ws = document.createElement('div');
            ws.id = 'examplanner-workspace';
            ws.innerHTML = `
                <style>
                    #examplanner-workspace { position: fixed; inset: 0; z-index: 999999; background: var(--bg-color, #121212); color: var(--text-main, #e0e0e0); display: flex; flex-direction: column; font-family: 'JetBrains Mono', monospace, sans-serif; font-size: 13px; }
                    .ep-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; border: 1px solid var(--border); background: var(--card-bg, #1e1e1e); color: var(--text-main); cursor: pointer; transition: opacity .2s; }
                    .ep-btn:hover { opacity: .75; }
                    .ep-btn.acc { background: var(--accent); color: #000; border: none; }
                    .ep-btn.dnr { background: var(--status-red); color: #fff; border: none; }
                    .ep-inp { background: var(--bg-color); color: var(--text-main); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; outline: none; width: 100%; transition: border-color .2s; }
                    .ep-inp:focus { border-color: var(--accent); }
                    .ep-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
                    .ep-header { display: flex; align-items: center; gap: 4px; padding: 7px 14px; flex-shrink: 0; background: var(--menu-color, #181818); border-bottom: 1px solid var(--border); justify-content: space-between; }
                    .ep-navb { display: flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 8px; border: none; font-size: 12px; font-weight: 500; cursor: pointer; background: transparent; color: var(--text-main); opacity: .6; }
                    .ep-navb.on { background: var(--accent); color: #000; opacity: 1; }
                    #ep-body { display: flex; flex: 1; overflow: hidden; }
                    #ep-sb { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border); background: var(--menu-color); }
                    #ep-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                    .ep-dc { border-radius: 9px; padding: 5px; border: 1px solid var(--border); background: var(--card-bg); overflow: hidden; display: flex; flex-direction: column; min-height: 80px; cursor: pointer; transition: border-color 0.2s; }
                    .ep-dc:hover { border-color: var(--accent); }
                    .ep-dc.exday { background: rgba(244,67,54,.08); border-color: var(--status-red); }
                    .ep-dc.today { border-color: var(--accent); box-shadow: 0 0 10px rgba(0,255,204,.15); }
                    
                    /* Estados de tareas */
                    .t-st-btn { padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
                    .t-st-btn.on-sg { background: var(--status-green); color: #fff; border-color: var(--status-green); }
                    .t-st-btn.on-sr { background: var(--status-red); color: #fff; border-color: var(--status-red); }
                    .t-item.done { border-color: var(--status-green); opacity: 0.7; }
                    .t-item.done .t-nom { text-decoration: line-through; }
                    .t-item.failed { border-color: var(--status-red); }
                </style>
                <div class="ep-header">
                    <div style="display:flex; gap:10px;" id="ep-nav-container"></div>
                    <button class="ep-btn dnr" id="ep-btn-close-ws"><i class="fa-solid fa-xmark"></i> Cerrar Planificador</button>
                </div>
                <div id="ep-body">
                    <div id="ep-sb">
                        <div style="padding:15px; border-bottom:1px solid var(--border); font-weight:bold; color:var(--accent);"><i class="fa-solid fa-chess-knight"></i> Estudiador Pro</div>
                        <div id="ep-sb-content" style="padding:10px; overflow-y:auto; flex:1;"></div>
                    </div>
                    <div id="ep-main"></div>
                </div>
            `;
            document.body.appendChild(ws);
            document.getElementById('ep-btn-close-ws').addEventListener('click', () => ws.remove());
        }

        renderNavegacion();
        renderSidebar();
        
        if (UIState.view === 'calendar') renderCalendar();
        else if (UIState.view === 'setup') renderSetup();
        else if (UIState.view === 'metrics') renderMetrics();
    }

    // ── VISTAS ──
    function renderNavegacion() {
        const nav = document.getElementById('ep-nav-container');
        if (!nav) return;
        nav.innerHTML = `
            <button class="ep-navb ${UIState.view === 'calendar' ? 'on' : ''}" data-view="calendar"><i class="fa-solid fa-calendar-days"></i> Calendario</button>
            <button class="ep-navb ${UIState.view === 'setup' ? 'on' : ''}" data-view="setup"><i class="fa-solid fa-gear"></i> Configuración</button>
            <button class="ep-navb ${UIState.view === 'metrics' ? 'on' : ''}" data-view="metrics"><i class="fa-solid fa-chart-pie"></i> Métricas</button>
        `;
        nav.querySelectorAll('.ep-navb').forEach(btn => {
            btn.addEventListener('click', (e) => {
                UIState.view = e.currentTarget.dataset.view;
                renderWorkspace();
            });
        });
    }

    function renderSidebar() {
        const sb = document.getElementById('ep-sb-content');
        if (!sb) return;
        const plan = getPlanSync();
        
        if (plan.asignaturasPlanificadas.length === 0) {
            sb.innerHTML = `<div style="text-align:center; color:gray; margin-top:20px; font-size:11px;"><i class="fa-solid fa-layer-group"></i><br><br>Añade asignaturas en Configuración</div>`;
            return;
        }

        sb.innerHTML = plan.asignaturasPlanificadas.map(asig => {
            const ex = plan.examenes.find(e => e.asigId === asig.id);
            const diasFaltan = ex ? (typeof Domain !== 'undefined' ? Domain.calcularDiasRestantesExamen(ex.fecha) : '?') : '-';
            return `
                <div style="margin-bottom:15px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border-left:3px solid ${asig.color || 'var(--accent)'};">
                    <div style="font-weight:bold; margin-bottom:5px;">${escapeHtml(asig.nombre)}</div>
                    <div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-book-bookmark"></i> ${asig.temas.length} Temas registrados</div>
                    ${ex ? `<div style="font-size:11px; color:var(--status-red); margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> Examen en ${diasFaltan} días</div>` : ''}
                </div>
            `;
        }).join('');
    }

    function renderCalendar() {
        const main = document.getElementById('ep-main');
        if (!main) return;
        const plan = getPlanSync();
        
        const y = UIState.calYear;
        const m = UIState.calMonth;
        const totalDias = new Date(y, m + 1, 0).getDate();
        const primerDia = (new Date(y, m, 1).getDay() + 6) % 7; 
        const monthName = new Date(y, m, 1).toLocaleString('es', { month: 'long', year: 'numeric' });

        let celdas = '';
        for (let i = 0; i < primerDia; i++) celdas += `<div style="opacity:0;"></div>`;
        
        for (let d = 1; d <= totalDias; d++) {
            const fechaStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const esHoy = fechaStr === new Date().toISOString().split('T')[0];
            const tareas = plan.schedule[fechaStr] || [];
            const examenes = plan.examenes.filter(e => e.fecha === fechaStr);
            
            let contenido = '';
            if (examenes.length > 0) {
                const ex = examenes[0];
                const exColor = ex.color || 'var(--status-red)';
                const exAsig = ex.asigNombre || 'EXAM';
                contenido = `
                    <div style="color:${exColor}; font-weight:bold; font-size:10px; margin-top:8px; border-top:1px solid ${exColor}; padding-top:4px;">
                        <i class="fa-solid fa-chess-king"></i> ${escapeHtml(exAsig)}
                    </div>
                    <div style="font-size:8px; color:var(--text-muted); margin-top:2px;">
                        ${ex.hora ? ex.hora : ''} ${ex.lugar ? ' @ ' + escapeHtml(ex.lugar) : ''}
                    </div>
                `;
            } else if (tareas.length > 0) {
                const completadas = tareas.filter(t => t.status === 'completed').length;
                const fallidas = tareas.filter(t => t.status === 'failed').length;
                const totalPomos = tareas.reduce((acc, t) => acc + t.pomosAsignados, 0);
                
                // Mostrar hasta 3 acrónimos + iconos
                const acroList = tareas.slice(0, 3).map(t => {
                    const tipo = plan.studyTypes.find(st => st.id === t.studyTypeId);
                    const asig = plan.asignaturasPlanificadas.find(a => a.id === t.asigId);
                    const acro = asig?.acronimo || asig?.nombre?.substring(0, 3).toUpperCase() || '?';
                    const icon = tipo?.icon || 'fa-book';
                    const color = t.color || asig?.color || 'var(--accent)';
                    const st = t.status === 'completed' ? 'completed' : '';
                    
                    return `
                        <div style="display:inline-flex; align-items:center; gap:2px; padding:2px 4px; border-radius:3px; background:${color}20; border:1px solid ${color}; margin:1px; font-size:8px; ${st === 'completed' ? 'opacity:0.5;' : ''}">
                            <i class="fa-solid ${icon}" style="font-size:7px; color:${color};"></i>
                            <strong style="color:${color};">${acro}</strong>
                        </div>
                    `;
                }).join('');
                
                let dotEstado = '';
                if (fallidas > 0) dotEstado = '<i class="fa-solid fa-circle-exclamation" style="color:var(--status-red);"></i>';
                else if (completadas === tareas.length) dotEstado = '<i class="fa-solid fa-circle-check" style="color:var(--status-green);"></i>';

                contenido = `
                    <div style="margin-top:4px; font-size:8px; display:flex; flex-wrap:wrap; gap:2px;">
                        ${acroList}
                        ${tareas.length > 3 ? `<div style="font-size:7px; color:var(--text-muted);">+${tareas.length - 3}</div>` : ''}
                    </div>
                    <div style="font-size:9px; color:var(--text-muted); margin-top:2px; display:flex; justify-content:space-between; align-items:center;">
                        <span><i class="fa-solid fa-stopwatch"></i> ${totalPomos}p</span>
                        ${dotEstado}
                    </div>
                `;
            }

            // Aquí usamos el atributo data-action que será interceptado por CommandRegistry
            celdas += `
                <div class="ep-dc ${esHoy ? 'today' : ''} ${examenes.length > 0 ? 'exday' : ''}" data-action="open-day" data-fecha="${fechaStr}">
                    <div style="font-weight:bold; ${esHoy ? 'color:var(--accent);' : ''}">${d}</div>
                    ${contenido}
                </div>
            `;
        }

        main.innerHTML = `
            <div class="ep-header" style="background:transparent;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <button class="ep-btn" id="ep-btn-prev-m"><i class="fa-solid fa-chevron-left"></i></button>
                    <span style="font-weight:bold; text-transform:capitalize; width:150px; text-align:center;">${monthName}</span>
                    <button class="ep-btn" id="ep-btn-next-m"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                <div>
                    <button class="ep-btn acc" id="ep-btn-autoplan"><i class="fa-solid fa-bolt"></i> Autoplanificar Todo</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:5px; padding:10px 15px 0; text-align:center; font-size:11px; opacity:0.5; font-weight:bold;">
                <div>L</div><div>M</div><div>X</div><div>J</div><div>V</div><div>S</div><div>D</div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:10px 15px 15px;">
                <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:5px; auto-rows:minmax(80px, auto);">${celdas}</div>
            </div>
        `;

        // Solo bindings funcionales puros, delegamos open-day al Registry
        document.getElementById('ep-btn-prev-m').addEventListener('click', () => cambiarMes(-1));
        document.getElementById('ep-btn-next-m').addEventListener('click', () => cambiarMes(1));
        document.getElementById('ep-btn-autoplan').addEventListener('click', lanzarAutoplan);
    }

    function renderSetup() {
        const main = document.getElementById('ep-main');
        if (!main) return;
        const plan = getPlanSync();

        // Inicialización de estado local para pestañas
        UIState.setupTab = UIState.setupTab || 'asignaturas';

        const biblio = (typeof State !== 'undefined') ? State.get('biblioteca') || {} : {};
        const opcionesBiblio = Object.keys(biblio).map(nombre => `<option value="${escapeHtml(nombre)}">`).join('');

        // ── 1. SISTEMA DE PESTAÑAS ──
        const htmlTabs = `
            <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:10px;">
                <button class="ep-navb ${UIState.setupTab === 'asignaturas' ? 'on' : ''}" data-setuptab="asignaturas"><i class="fa-solid fa-book"></i> Asignaturas y Exámenes</button>
                <button class="ep-navb ${UIState.setupTab === 'capacidades' ? 'on' : ''}" data-setuptab="capacidades"><i class="fa-solid fa-battery-half"></i> Capacidad Diaria</button>
                <button class="ep-navb ${UIState.setupTab === 'tipos' ? 'on' : ''}" data-setuptab="tipos"><i class="fa-solid fa-tags"></i> Tipos de Sesión</button>
                <button class="ep-navb ${UIState.setupTab === 'temporada' ? 'on' : ''}" data-setuptab="temporada"><i class="fa-solid fa-calendar-alt"></i> Temporada Exámenes</button>
            </div>
        `;

        let tabContent = '';

        // ── 2. VISTAS MODULARES ──
        if (UIState.setupTab === 'asignaturas') {
            const htmlTablaAsignaturas = `
                <div class="ep-card" style="margin-top:15px; padding:0; overflow:hidden; border:1px solid var(--border);">
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <thead>
                            <tr style="background:var(--menu-color); border-bottom:1px solid var(--border); text-align:left;">
                                <th style="padding:10px 14px; font-weight:600; color:var(--text-muted);">ASIGNATURA</th>
                                <th style="padding:10px 14px; text-align:center; font-weight:600; color:var(--text-muted);">TEMAS</th>
                                <th style="padding:10px 14px; font-weight:600; color:var(--text-muted);">EXAMEN</th>
                                <th style="padding:10px 14px; text-align:center; font-weight:600; color:var(--text-muted);">PESO</th>
                                <th style="padding:10px 14px; text-align:right; font-weight:600; color:var(--text-muted);">ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${plan.asignaturasPlanificadas.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No hay asignaturas planificadas en el sistema.</td></tr>` : ''}
                            ${plan.asignaturasPlanificadas.map(a => {
                                const ex = plan.examenes.find(e => e.asigId === a.id);
                                return `
                                    <tr style="border-bottom:1px solid var(--border); transition: background 0.2s;">
                                        <td style="padding:10px 14px; display:flex; align-items:center; gap:8px;">
                                            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${a.color};"></span>
                                            <strong style="font-size:13px;">${escapeHtml(a.nombre)}</strong>
                                            ${a.acronimo ? `<span style="background:var(--bg-color); border:1px solid var(--border); padding:2px 5px; border-radius:4px; font-size:10px; color:var(--text-muted);">${escapeHtml(a.acronimo)}</span>` : ''}
                                        </td>
                                        <td style="padding:10px 14px; text-align:center;">
                                            <span style="background:rgba(255,255,255,0.05); border:1px solid var(--border); padding:2px 8px; border-radius:12px; font-size:11px;">${a.temas.length}</span>
                                        </td>
                                        <td style="padding:10px 14px; font-size:11px;">
                                            ${ex ? `
                                                <div style="color:${ex.color}; font-weight:bold;"><i class="fa-solid fa-calendar"></i> ${ex.fecha}</div>
                                                <div style="color:var(--text-muted); margin-top:3px;"><i class="fa-solid fa-clock"></i> ${ex.hora||'--:--'} ${ex.lugar ? `· <i class="fa-solid fa-map-pin"></i> ${escapeHtml(ex.lugar)}` : ''}</div>
                                            ` : '<span style="color:var(--text-muted); opacity:0.5; font-style:italic;">Sin examen asignado</span>'}
                                        </td>
                                        <td style="padding:10px 14px; text-align:center; color:var(--text-main); font-weight:bold;">
                                            ${ex ? ex.notaPercentaje + '%' : '-'}
                                        </td>
                                        <td style="padding:10px 14px; text-align:right;">
                                            <div style="display:flex; gap:6px; justify-content:flex-end;">
                                                <button class="ep-btn ep-btn-edit-temas" data-id="${a.id}" style="padding:5px 8px; font-size:11px; background:var(--bg-color);" title="Editar Temas"><i class="fa-solid fa-list"></i> Temas</button>
                                                ${ex ? `<button class="ep-btn ep-btn-edit-exam" data-id="${ex.id}" style="padding:5px 8px; font-size:11px; background:var(--bg-color);" title="Editar Examen"><i class="fa-solid fa-calendar-check"></i></button>` : ''}
                                                <button class="ep-btn dnr btn-del-asig" data-id="${a.id}" style="padding:5px 8px; font-size:11px;" title="Eliminar Bloque Completo"><i class="fa-solid fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            tabContent = `
                <div class="ep-card">
                    <h3 style="margin-top:0; font-size:13px; color:var(--text-muted);">AÑADIR ASIGNATURA Y EXAMEN</h3>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <input type="text" id="ep-new-asig" list="ep-lista-biblio" class="ep-inp" placeholder="Nombre (Ej: Álgebra)" autocomplete="off" style="flex:1;">
                        <datalist id="ep-lista-biblio">${opcionesBiblio}</datalist>
                        <input type="text" id="ep-new-acro" class="ep-inp" placeholder="Acrónimo (Ej: ALG)" style="width:80px;" title="Acrónimo (3-4 caracteres máx)">
                        <input type="date" id="ep-new-date" class="ep-inp" style="width:140px;" title="Fecha del Examen">
                        <input type="time" id="ep-new-hora" class="ep-inp" value="09:00" style="width:100px;" title="Hora del Examen">
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="ep-new-lugar" class="ep-inp" placeholder="Aula / Lugar (Opcional)" style="flex:1;">
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                            <label style="font-size:10px; color:var(--text-muted);">% Nota</label>
                            <input type="number" id="ep-new-peso" class="ep-inp" style="width:70px; text-align:center;" min="0" max="100" value="100">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                            <label style="font-size:10px; color:var(--text-muted);">Nº Temas</label>
                            <input type="number" id="ep-new-temas" class="ep-inp" style="width:70px; text-align:center;" min="1" value="5">
                        </div>
                        <button class="ep-btn acc" id="ep-btn-crear-asig" style="width:120px; justify-content:center; height:34px; margin-top:16px;"><i class="fa-solid fa-plus"></i> Añadir</button>
                    </div>
                </div>
                ${htmlTablaAsignaturas}
            `;
        } else if (UIState.setupTab === 'capacidades') {
            tabContent = `
                <div class="ep-card">
                    <h3 style="margin-top:0; font-size:13px; color:var(--text-muted);">CAPACIDAD DIARIA (POMODOROS)</h3>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:15px;">
                        <div>
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:5px;"><i class="fa-solid fa-book"></i> Días Normales</label>
                            <input type="number" id="ep-cap-regular" class="ep-inp" min="1" value="${plan.dailyCapacities?.regularCourse || 4}" style="text-align:center;">
                        </div>
                        <div>
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:5px;"><i class="fa-solid fa-fire"></i> Temporada de Exámenes</label>
                            <input type="number" id="ep-cap-exam" class="ep-inp" min="1" value="${plan.dailyCapacities?.examSeason || 8}" style="text-align:center;">
                        </div>
                        <div>
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:5px;"><i class="fa-solid fa-sun"></i> Fines de Semana</label>
                            <input type="number" id="ep-cap-weekend" class="ep-inp" min="1" value="${plan.dailyCapacities?.weekend || 6}" style="text-align:center;">
                        </div>
                    </div>
                    <button class="ep-btn acc" id="ep-btn-guardar-cap" style="width:100%; margin-top:15px; justify-content:center;"><i class="fa-solid fa-floppy-disk"></i> Guardar Configuraciones</button>
                </div>
            `;
        } else if (UIState.setupTab === 'tipos') {
            tabContent = `
                <div class="ep-card">
                    <h3 style="margin-top:0; font-size:13px; color:var(--text-muted);">TIPOS DE SESIÓN</h3>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:15px;"><i class="fa-solid fa-circle-info"></i> El color en calendario se heredará dinámicamente de la asignatura vinculada.</div>
                    ${plan.studyTypes.map(st => `
                        <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border-left:3px solid var(--accent);">
                            <i class="fa-solid ${st.icon}" style="font-size:16px; width:30px; text-align:center; color:var(--accent); flex-shrink:0;"></i>
                            <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                                <input type="text" value="${escapeHtml(st.name)}" class="ep-inp ep-study-type-name" style="font-size:12px; padding:6px;" data-id="${st.id}" placeholder="Nombre">
                                <input type="text" value="${st.icon}" class="ep-inp ep-study-type-icon" style="font-size:11px; padding:6px;" data-id="${st.id}" placeholder="Clase FontAwesome (ej: fa-book)">
                            </div>
                            <button class="ep-btn dnr ep-btn-del-tipo" data-id="${st.id}" style="width:40px; padding:6px;"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `).join('')}
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="ep-btn acc" id="ep-btn-add-tipo" style="flex:1; justify-content:center;"><i class="fa-solid fa-plus"></i> Agregar Nuevo Tipo</button>
                        <button class="ep-btn acc" id="ep-btn-guardar-tipos" style="flex:1; justify-content:center;"><i class="fa-solid fa-floppy-disk"></i> Guardar Cambios</button>
                    </div>
                </div>
            `;
        } else if (UIState.setupTab === 'temporada') {
            tabContent = `
                <div class="ep-card">
                    <h3 style="margin-top:0; font-size:13px; color:var(--text-muted);">TEMPORADA DE EXÁMENES</h3>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:15px;"><i class="fa-solid fa-circle-info"></i> Rango de fechas en el que se aplicará la capacidad diaria intensiva para autoplanificación.</div>
                    <div style="display:flex; gap:15px; align-items:end; margin-bottom:10px;">
                        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                            <label style="font-size:11px; color:var(--text-muted);">Inicio Temporada</label>
                            <input type="date" id="ep-exam-season-from" class="ep-inp" value="${plan.examSeason?.from || ''}">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                            <label style="font-size:11px; color:var(--text-muted);">Fin Temporada</label>
                            <input type="date" id="ep-exam-season-to" class="ep-inp" value="${plan.examSeason?.to || ''}">
                        </div>
                        <button class="ep-btn acc" id="ep-btn-guardar-season" style="width:140px; justify-content:center; height:34px;"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                    </div>
                </div>
            `;
        }

        // Inyectar en el Main Container
        main.innerHTML = `
            <div style="flex:1; overflow-y:auto; padding:20px;">
                <h2 style="margin-top:0; margin-bottom:15px;"><i class="fa-solid fa-sliders"></i> Configuración del Plan</h2>
                ${htmlTabs}
                ${tabContent}
            </div>
        `;

        // ── 3. BINDING DE EVENTOS (Delegación Segura) ──
        
        // Navegación de pestañas
        main.querySelectorAll('.ep-navb[data-setuptab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                UIState.setupTab = e.currentTarget.dataset.setuptab;
                renderWorkspace();
            });
        });

        // Eventos condicionales basados en el DOM inyectado (Opt-chaining architecture)
        document.getElementById('ep-btn-crear-asig')?.addEventListener('click', guardarAsigExamen);

        main.querySelectorAll('.btn-del-asig').forEach(btn => {
            btn.addEventListener('click', (e) => borrarAsig(e.currentTarget.dataset.id));
        });

        main.querySelectorAll('.ep-btn-edit-temas').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const asigId = e.currentTarget.dataset.id;
                const asig = getPlanSync().asignaturasPlanificadas.find(a => a.id === asigId);
                if (asig) editarTemas(asig);
            });
        });

        main.querySelectorAll('.ep-btn-edit-exam').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const examId = e.currentTarget.dataset.id;
                const planContext = getPlanSync();
                const exam = planContext.examenes.find(ex => ex.id === examId);
                if (exam) editarExamen(exam, planContext);
            });
        });

        document.getElementById('ep-btn-guardar-cap')?.addEventListener('click', () => {
            const currentPlan = getPlanSync();
            currentPlan.dailyCapacities = {
                regularCourse: parseInt(document.getElementById('ep-cap-regular').value, 10) || 4,
                examSeason: parseInt(document.getElementById('ep-cap-exam').value, 10) || 8,
                weekend: parseInt(document.getElementById('ep-cap-weekend').value, 10) || 6
            };
            savePlan(currentPlan);
            alert('✅ Capacidades actualizadas correctamente en caché persistente.');
        });

        document.getElementById('ep-btn-guardar-tipos')?.addEventListener('click', () => {
            const currentPlan = getPlanSync();
            main.querySelectorAll('.ep-study-type-name').forEach(inp => {
                const tipo = currentPlan.studyTypes.find(t => t.id === inp.dataset.id);
                if (tipo) tipo.name = inp.value.trim() || tipo.name;
            });
            main.querySelectorAll('.ep-study-type-icon').forEach(inp => {
                const tipo = currentPlan.studyTypes.find(t => t.id === inp.dataset.id);
                if (tipo && inp.value.trim()) tipo.icon = inp.value.trim();
            });
            savePlan(currentPlan);
            alert('✅ Tipos de sesión sincronizados.');
        });

        document.getElementById('ep-btn-add-tipo')?.addEventListener('click', () => {
            const nombre = prompt('Ingresa el nombre del nuevo tipo de sesión:');
            if (!nombre) return;
            const icono = prompt('Ingresa clase FontAwesome (ej: fa-star):', 'fa-star');
            if (!icono) return;
            
            const currentPlan = getPlanSync();
            currentPlan.studyTypes.push({
                id: 'st_' + Date.now(),
                name: nombre.trim(),
                icon: icono.trim(),
                color: 'var(--accent)'
            });
            savePlan(currentPlan);
            renderWorkspace();
        });

        main.querySelectorAll('.ep-btn-del-tipo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!confirm(`¿Proceder con la eliminación del tipo de sesión?`)) return;
                const tipoId = e.currentTarget.dataset.id;
                const currentPlan = getPlanSync();
                currentPlan.studyTypes = currentPlan.studyTypes.filter(t => t.id !== tipoId);
                savePlan(currentPlan);
                renderWorkspace();
            });
        });

        document.getElementById('ep-btn-guardar-season')?.addEventListener('click', () => {
            const currentPlan = getPlanSync();
            currentPlan.examSeason = { 
                from: document.getElementById('ep-exam-season-from').value, 
                to: document.getElementById('ep-exam-season-to').value 
            };
            savePlan(currentPlan);
            alert('✅ Ventana de temporada de exámenes actualizada.');
        });
    }
    function editarTemas(asig) {
        let overlay = document.getElementById('ep-temas-overlay');
        if (overlay) overlay.remove();

        const plan = getPlanSync();
        const asigActualizada = plan.asignaturasPlanificadas.find(a => a.id === asig.id);
        if (!asigActualizada) {
            Logger.warn('[UIExamPlanner] Intento de editar temas de asignatura inexistente.');
            return;
        }

        // AISLAMIENTO DE ESTADO (Draft Model): Evita mutar el plan central si el usuario cancela o cierra el modal.
        let draftTemas = JSON.parse(JSON.stringify(asigActualizada.temas));

        overlay = document.createElement('div');
        overlay.id = 'ep-temas-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999999; display:flex; justify-content:center; align-items:center; backdrop-filter:blur(3px);';

        const renderTemasList = () => {
            return draftTemas.map((t, idx) => `
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border-left:3px solid ${asigActualizada.color};">
                    <span style="font-weight:bold; color:var(--text-muted); width:20px;">${idx + 1}.</span>
                    <input type="text" class="ep-inp ep-tema-nombre" data-id="${t.id}" value="${escapeHtml(t.nombre)}" placeholder="Nombre del tema" style="flex:2; font-size:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:2px; flex:1;">
                        <span style="font-size:9px; color:var(--text-muted);">Pomodoros Estimados</span>
                        <input type="number" class="ep-inp ep-tema-pomos" data-id="${t.id}" value="${t.pomosEstimados}" min="1" style="width:100px; text-align:center; font-size:12px;">
                    </div>
                    <button class="ep-btn dnr ep-btn-del-tema" data-id="${t.id}" style="padding:6px; margin-top:14px;"><i class="fa-solid fa-trash"></i></button>
                </div>
            `).join('');
        };

        const updateHTML = () => {
            overlay.innerHTML = `
                <div style="background:var(--card-bg, #1e1e1e); width:90%; max-width:600px; border-radius:12px; border:1px solid var(--border); display:flex; flex-direction:column; max-height:85vh; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                    <div style="padding:15px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                        <h3 style="margin:0;"><i class="fa-solid fa-list-check" style="color:${asigActualizada.color};"></i> Temas: ${escapeHtml(asigActualizada.nombre)}</h3>
                        <button id="ep-btn-close-temas" style="background:none; border:none; color:var(--text-main); cursor:pointer; font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div id="ep-temas-container" style="padding:15px; overflow-y:auto; flex:1;">
                        ${draftTemas.length === 0 ? '<div style="text-align:center; color:var(--text-muted); font-size:12px;">No hay temas registrados.</div>' : renderTemasList()}
                    </div>
                    <div style="padding:15px; border-top:1px solid var(--border); background:var(--menu-color, #181818); border-radius: 0 0 12px 12px; display:flex; justify-content:space-between; gap:10px; flex-shrink:0;">
                        <button id="ep-btn-add-tema" style="padding:8px 16px; background:var(--bg-color); border:1px solid var(--border); border-radius:6px; color:var(--text-main); cursor:pointer;"><i class="fa-solid fa-plus"></i> Añadir Tema</button>
                        <div style="display:flex; gap:10px;">
                            <button id="ep-btn-cancel-temas" style="padding:8px 16px; background:var(--card-bg); border:1px solid var(--border); border-radius:6px; color:var(--text-main); cursor:pointer;">Cancelar</button>
                            <button id="ep-btn-save-temas" style="padding:8px 16px; background:var(--accent); color:#000; border:none; border-radius:6px; font-weight:bold; cursor:pointer;"><i class="fa-solid fa-floppy-disk"></i> Guardar Todo</button>
                        </div>
                    </div>
                </div>
            `;
            bindEvents();
        };

        const bindEvents = () => {
            // Cierres de seguridad que ahora simplemente descartan el Draft Model
            overlay.querySelector('#ep-btn-close-temas').addEventListener('click', () => overlay.remove());
            overlay.querySelector('#ep-btn-cancel-temas').addEventListener('click', () => overlay.remove());
            
            overlay.querySelector('#ep-btn-add-tema').addEventListener('click', () => {
                const idCounter = draftTemas.length + 1;
                draftTemas.push({
                    id: 'tm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    nombre: `Tema ${idCounter}`,
                    pomosEstimados: 2,
                    tipoEstudioId: 'st_study' // Parámetro silencioso para satisfacer el contrato de la DB heredado
                });
                sincronizarDOM();
                updateHTML();
            });

            overlay.querySelectorAll('.ep-btn-del-tema').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    sincronizarDOM(); 
                    draftTemas = draftTemas.filter(t => t.id !== id);
                    updateHTML();
                });
            });

            const sincronizarDOM = () => {
                overlay.querySelectorAll('.ep-tema-nombre').forEach(inp => {
                    const t = draftTemas.find(x => x.id === inp.dataset.id);
                    if (t) t.nombre = inp.value.trim() || 'Sin título';
                });
                overlay.querySelectorAll('.ep-tema-pomos').forEach(inp => {
                    const t = draftTemas.find(x => x.id === inp.dataset.id);
                    if (t) t.pomosEstimados = parseInt(inp.value, 10) || 1;
                });
            };

            // VOLCADO ATÓMICO A LA FUENTE DE VERDAD
            overlay.querySelector('#ep-btn-save-temas').addEventListener('click', () => {
                sincronizarDOM();
                
                State.batch(() => {
                    asigActualizada.temas = draftTemas;
                    savePlan(plan);
                });
                
                overlay.remove();
                renderWorkspace(); 
            });
        };

        updateHTML();
        document.body.appendChild(overlay);
    }

    function editarExamen(exam, plan) {
        let overlay = document.getElementById('ep-exam-overlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'ep-exam-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999999; display:flex; justify-content:center; align-items:center; backdrop-filter:blur(3px);';
        overlay.innerHTML = `
            <div style="background:var(--card-bg, #1e1e1e); width:90%; max-width:450px; border-radius:12px; border:1px solid var(--border); display:flex; flex-direction:column; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                <div style="padding:15px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;"><i class="fa-solid fa-edit" style="color:var(--accent);"></i> Editar Examen</h3>
                    <button id="ep-btn-close-exam-edit" style="background:none; border:none; color:var(--text-main); cursor:pointer; font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div style="padding:15px; overflow-y:auto;">
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Asignatura</label>
                        <input type="text" id="ep-edit-asig" class="ep-inp" value="${escapeHtml(exam.asigNombre)}" disabled style="opacity:0.6;">
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <div style="flex:1;">
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Fecha</label>
                            <input type="date" id="ep-edit-fecha" class="ep-inp" value="${exam.fecha}">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Hora</label>
                            <input type="time" id="ep-edit-hora" class="ep-inp" value="${exam.hora || '09:00'}">
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Lugar (Opcional)</label>
                        <input type="text" id="ep-edit-lugar" class="ep-inp" value="${escapeHtml(exam.lugar || '')}">
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <div style="flex:1;">
                            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">% de Nota</label>
                            <input type="number" id="ep-edit-peso" class="ep-inp" min="0" max="100" value="${exam.notaPercentaje || 100}">
                        </div>
                    </div>
                </div>
                <div style="padding:15px; border-top:1px solid var(--border); background:var(--menu-color, #181818); border-radius: 0 0 12px 12px; display:flex; justify-content:flex-end; gap:10px;">
                    <button id="ep-btn-cancel-exam" style="padding:8px 16px; background:var(--card-bg); border:1px solid var(--border); border-radius:6px; color:var(--text-main); cursor:pointer;">Cancelar</button>
                    <button id="ep-btn-save-exam" style="padding:8px 16px; background:var(--accent); color:#000; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Guardar Cambios</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('ep-btn-close-exam-edit').addEventListener('click', () => overlay.remove());
        document.getElementById('ep-btn-cancel-exam').addEventListener('click', () => overlay.remove());
        
        document.getElementById('ep-btn-save-exam').addEventListener('click', () => {
            exam.fecha = document.getElementById('ep-edit-fecha').value;
            exam.hora = document.getElementById('ep-edit-hora').value;
            exam.lugar = document.getElementById('ep-edit-lugar').value.trim();
            exam.notaPercentaje = parseInt(document.getElementById('ep-edit-peso').value, 10) || 100;
            
            savePlan(plan);
            overlay.remove();
            renderWorkspace();
        });
    }

    function renderMetrics() {
        const main = document.getElementById('ep-main');
        if (!main) return;
        const plan = getPlanSync();

        let totalPomos = 0, donePomos = 0, failPomos = 0;
        let totalSes = 0, doneSes = 0, failSes = 0;
        const asigStats = {};

        Object.values(plan.schedule).forEach(dia => {
            dia.forEach(t => {
                totalSes++;
                totalPomos += t.pomosAsignados;
                
                if (!asigStats[t.asigId]) asigStats[t.asigId] = { nombre: t.asigNombre, color: t.color, tSes:0, dSes:0, tPom:0, dPom:0 };
                asigStats[t.asigId].tSes++;
                asigStats[t.asigId].tPom += t.pomosAsignados;

                if (t.status === 'completed') {
                    doneSes++; donePomos += t.pomosAsignados;
                    asigStats[t.asigId].dSes++; asigStats[t.asigId].dPom += t.pomosAsignados;
                } else if (t.status === 'failed') {
                    failSes++; failPomos += t.pomosAsignados;
                }
            });
        });

        const exitoGlobal = totalSes > 0 ? Math.round((doneSes / totalSes) * 100) : 0;
        const pcoPomos    = totalPomos > 0 ? Math.round((donePomos / totalPomos) * 100) : 0;

        const barrasAsig = Object.values(asigStats).map(st => {
            const pct = st.tPom > 0 ? Math.round((st.dPom / st.tPom) * 100) : 0;
            return `
                <div class="ep-card" style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <strong><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${st.color}; margin-right:5px;"></span>${escapeHtml(st.nombre)}</strong>
                        <span style="font-weight:bold;">${pct}% completado</span>
                    </div>
                    <div style="height:6px; background:var(--bg-color); border-radius:3px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:${st.color}; transition:width 0.4s ease;"></div>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:5px; text-align:right;">
                        ${st.dPom} / ${st.tPom} Pomodoros
                    </div>
                </div>
            `;
        }).join('');

        main.innerHTML = `
            <div style="flex:1; overflow-y:auto; padding:20px;">
                <h2 style="margin-top:0;"><i class="fa-solid fa-chart-pie"></i> Progreso y Rendimiento</h2>
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:15px; margin-bottom:20px;">
                    <div class="ep-card" style="text-align:center;">
                        <div style="font-size:24px; font-weight:bold; color:var(--status-green);">${exitoGlobal}%</div>
                        <div style="font-size:11px; color:var(--text-muted);">Cumplimiento de Tareas</div>
                    </div>
                    <div class="ep-card" style="text-align:center;">
                        <div style="font-size:24px; font-weight:bold; color:var(--accent);">${donePomos} <span style="font-size:14px;">/ ${totalPomos}</span></div>
                        <div style="font-size:11px; color:var(--text-muted);">Pomodoros Realizados</div>
                    </div>
                    <div class="ep-card" style="text-align:center;">
                        <div style="font-size:24px; font-weight:bold; color:var(--status-red);">${failSes}</div>
                        <div style="font-size:11px; color:var(--text-muted);">Sesiones Fallidas</div>
                    </div>
                </div>
                <h3 style="margin-top:0; font-size:13px; color:var(--text-muted);">DESGLOSE POR ASIGNATURA</h3>
                ${barrasAsig || '<div style="color:gray; font-size:12px;">No hay planificaciones activas.</div>'}
            </div>
        `;
    }

    function abrirEditorDia(fecha) {
        try {
            let overlay = document.getElementById('ep-dia-overlay');
            if (overlay) overlay.remove();

            const plan = getPlanSync();
            const formatFecha = typeof Domain !== 'undefined' && Domain.formatearFechaES ? Domain.formatearFechaES(fecha) : fecha;
            const tareas = plan.schedule[fecha] || [];

            const optsTipos = (plan.studyTypes || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            const optsAsig = (plan.asignaturasPlanificadas || []).map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');

            overlay = document.createElement('div');
            overlay.id = 'ep-dia-overlay';
            overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999999; display:flex; justify-content:center; align-items:center; backdrop-filter:blur(3px);';
            overlay.innerHTML = `
            <div style="background:var(--card-bg, #1e1e1e); width:90%; max-width:500px; border-radius:12px; border:1px solid var(--border); display:flex; flex-direction:column; max-height:90vh; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                <div style="padding:15px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;"><i class="fa-solid fa-calendar-day" style="color:var(--accent);"></i> Plan del ${formatFecha}</h3>
                    <button id="ep-btn-close-dia" style="background:none; border:none; color:var(--text-main); cursor:pointer; font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div id="ep-tasks-list" style="padding:15px; overflow-y:auto; flex:1;">
                    ${tareas.length === 0 ? '<div style="color:gray;text-align:center;font-size:12px;padding:20px;"><i class="fa-solid fa-mug-hot"></i> Día libre.</div>' : tareas.map(t => {
                        const icon = plan.studyTypes.find(st => st.id === t.studyTypeId)?.icon || 'fa-book';
                        const isDone = t.status === 'completed';
                        const isFail = t.status === 'failed';
                        
                        return `
                        <div class="t-item ${isDone ? 'done' : isFail ? 'failed' : ''}" style="border-left:3px solid ${t.color}; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border: 1px solid var(--border);">
                            <div>
                                <div class="t-nom" style="font-weight:bold; font-size:13px;">${escapeHtml(t.temaNombre)}</div>
                                <div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid ${icon}"></i> ${escapeHtml(t.asigNombre)} <span style="margin-left:5px; color:var(--accent);"><i class="fa-solid fa-stopwatch"></i> ${t.pomosAsignados}</span></div>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <button class="t-st-btn ${isDone ? 'on-sg' : ''}" data-action="set-state" data-state="completed" data-id="${t.idTarea}" data-fecha="${fecha}"><i class="fa-solid fa-check"></i></button>
                                <button class="t-st-btn ${isFail ? 'on-sr' : ''}" data-action="set-state" data-state="failed" data-id="${t.idTarea}" data-fecha="${fecha}"><i class="fa-solid fa-xmark"></i></button>
                                <button class="t-st-btn" style="color:var(--status-red); border-color:transparent; margin-left:5px;" data-action="del-task" data-id="${t.idTarea}" data-fecha="${fecha}"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    `}).join('')}
                </div>
                
                <div style="padding:15px; border-top:1px solid var(--border); background:var(--menu-color, #181818); border-radius: 0 0 12px 12px;">
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <select id="ep-dia-asig" style="flex:1; background:var(--bg-color); color:var(--text-main); border:1px solid var(--border); border-radius:6px; padding:8px;">
                            <option value="">-- Asignatura --</option>
                            ${optsAsig}
                        </select>
                        <select id="ep-dia-tipo" style="flex:1; background:var(--bg-color); color:var(--text-main); border:1px solid var(--border); border-radius:6px; padding:8px;">
                            ${optsTipos}
                        </select>
                    </div>
                    <select id="ep-dia-tema" style="width:100%; background:var(--bg-color); color:var(--text-main); border:1px solid var(--border); border-radius:6px; padding:8px; margin-bottom:10px;">
                        <option value="">Selecciona asignatura primero</option>
                    </select>
                    
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--border);">
                        <span style="font-size:11px; color:gray;"><i class="fa-solid fa-stopwatch"></i> Pomodoros:</span>
                        <input type="range" id="ep-dia-pomos" min="1" max="12" value="2" style="flex:1; accent-color:var(--accent); cursor:pointer;">
                        <span id="ep-dia-pomos-val" style="color:var(--accent); font-weight:bold; width:20px; text-align:right; font-size:14px;">2</span>
                    </div>
                    
                    <button id="ep-btn-add-task" style="width:100%; padding:10px; background:var(--accent); color:#000; border:none; border-radius:6px; font-weight:bold; cursor:pointer;"><i class="fa-solid fa-plus"></i> Fijar Sesión Manual</button>
                </div>
            </div>
        `;
            document.body.appendChild(overlay);
            // Listener para cerrar el overlay y actualizar el calendario
            document.getElementById('ep-btn-close-dia').addEventListener('click', () => {
                overlay.remove();
                // Actualizar el calendario para reflejar cambios de estado
                if (UIState.view === 'calendar') renderCalendar();
            });
            
            // Listeners para los botones de estado y borrado (delegación directa en el overlay)
            overlay.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                const estado = btn.dataset.state;
                
                Logger.info(`[UIExamPlanner] Capturado clic: action=${action}, id=${id}, state=${estado}, fecha=${fecha}`);
                
                if (action === 'set-state' && estado && id) {
                    Logger.info(`[UIExamPlanner] Ejecutando cambiarEstadoTarea(${fecha}, ${id}, ${estado})`);
                    cambiarEstadoTarea(fecha, id, estado);
                } else if (action === 'del-task' && id) {
                    Logger.info(`[UIExamPlanner] Ejecutando borrarTareaDia(${fecha}, ${id})`);
                    borrarTareaDia(fecha, id);
                }
            });
            
            const inpPomos = document.getElementById('ep-dia-pomos');
            if (inpPomos) {
                inpPomos.addEventListener('input', (e) => document.getElementById('ep-dia-pomos-val').innerText = e.target.value);
            }
            
            const selectAsig = document.getElementById('ep-dia-asig');
            if (selectAsig) {
                selectAsig.addEventListener('change', (e) => actualizarTemasSelect(e.target.value));
            }
            
            // Listener para el botón de añadir tarea
            const btnAddTask = document.getElementById('ep-btn-add-task');
            if (btnAddTask) {
                btnAddTask.addEventListener('click', () => {
                    Logger.info(`[UIExamPlanner] Botón "Fijar Sesión Manual" clickeado para fecha ${fecha}`);
                    guardarTareaDia(fecha);
                });
            }
        } catch(e) {
            Logger.error(`[UIExamPlanner] abrirEditorDia error:`, e);
        }
    }

    // ── FUNCIONES AUXILIARES Y MUTADORES ──
    function cambiarMes(delta) {
        UIState.calMonth += delta;
        if (UIState.calMonth > 11) { UIState.calMonth = 0; UIState.calYear++; }
        if (UIState.calMonth < 0) { UIState.calMonth = 11; UIState.calYear--; }
        renderWorkspace();
    }

    function actualizarTemasSelect(asigId) {
        const selectTema = document.getElementById('ep-dia-tema');
        if (!selectTema) return;
        const plan = getPlanSync();
        const asig = plan.asignaturasPlanificadas.find(a => a.id === asigId);
        
        if (!asig || asig.temas.length === 0) {
            selectTema.innerHTML = '<option value="">Sin temas disponibles</option>';
            return;
        }
        selectTema.innerHTML = asig.temas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
    }

    function guardarTareaDia(fecha) {
        Logger.info(`[UIExamPlanner] guardarTareaDia ejecutándose para fecha ${fecha}`);
        
        const asigId = document.getElementById('ep-dia-asig').value;
        const tipoId = document.getElementById('ep-dia-tipo').value;
        const temaId = document.getElementById('ep-dia-tema').value;
        const pomos = parseInt(document.getElementById('ep-dia-pomos').value, 10);

        Logger.info(`[UIExamPlanner] Valores obtenidos: asigId=${asigId}, tipoId=${tipoId}, temaId=${temaId}, pomos=${pomos}`);

        if (!asigId || !temaId) { 
            Logger.warn('[UIExamPlanner] Validación fallida: faltan asignatura o tema');
            alert("Debes seleccionar una asignatura y un tema."); 
            return; 
        }

        const plan = getPlanSync();
        const asig = plan.asignaturasPlanificadas.find(a => a.id === asigId);
        const tema = asig.temas.find(t => t.id === temaId);
        const tipo = plan.studyTypes.find(t => t.id === tipoId);

        Logger.info(`[UIExamPlanner] Encontrados: asig=${asig?.nombre}, tema=${tema?.nombre}, tipo=${tipo?.name}`);

        State.batch(() => {
            if (!plan.schedule[fecha]) plan.schedule[fecha] = [];
            const idTarea = 'tk_' + Date.now();
            const nuevaTarea = {
                id: idTarea,
                idTarea,
                asigId: asig.id,
                asigNombre: asig.nombre,
                temaId: tema.id,
                temaNombre: tema.nombre,
                studyTypeId: tipo.id,
                pomosAsignados: pomos,
                status: 'pending',
                color: asig.color
            };
            
            Logger.info(`[UIExamPlanner] Creando tarea:`, nuevaTarea);
            plan.schedule[fecha].push(nuevaTarea);
            savePlan(plan);
        });

        Logger.info(`[UIExamPlanner] Tarea guardada, actualizando overlay`);
        // Actualizar el overlay inmediatamente sin setTimeout
        abrirEditorDia(fecha);
    }

    function borrarTareaDia(fecha, idTarea) {
        try {
            const plan = getPlanSync();
            const targetId = String(idTarea);
            if (plan.schedule[fecha]) {
                plan.schedule[fecha] = plan.schedule[fecha].filter(t => getTaskId(t) !== targetId);
            }
            savePlan(plan);
            abrirEditorDia(fecha);
        } catch(e) {
            Logger.error(`[UIExamPlanner] borrarTareaDia error:`, e);
        }
    }

    function cambiarEstadoTarea(fecha, idTarea, nuevoEstado) {
        try {
            const plan = getPlanSync();
            const targetId = String(idTarea);
            if (plan.schedule[fecha]) {
                const tarea = plan.schedule[fecha].find(t => getTaskId(t) === targetId);
                if (tarea) {
                    const proximoEstado = getTaskStatus(tarea) === nuevoEstado ? 'pending' : nuevoEstado;
                    aplicarEstadoTarea(tarea, proximoEstado);
                }
            }
            savePlan(plan);
            abrirEditorDia(fecha);
        } catch(e) {
            Logger.error(`[UIExamPlanner] cambiarEstadoTarea error:`, e);
        }
    }



    async function lanzarAutoplan() {
        if (typeof Domain === 'undefined' || !Domain.generarHorarioPlanificador) return;
        const plan = await getPlan();  // ← await
        planCache = JSON.parse(JSON.stringify(plan)); // sincronizar cache tras lectura async
        const resultado = Domain.generarHorarioPlanificador(planCache);
        
        if (resultado.excedido) {
            alert(`⚠️ DÉFICIT DETECTADO\n\n${resultado.log}\n\nSe ha autocompletado lo posible hasta la fecha de los exámenes.`);
        } else {
            alert(`✅ PLANIFICACIÓN EXITOSA\n\n${resultado.log}`);
        }

        State.batch(() => {
            plan.schedule = resultado.scheduleGenerado;
            savePlan(planCache);
        });
        renderWorkspace();
    }

    function guardarAsigExamen() {
        const nombre = document.getElementById('ep-new-asig').value.trim();
        const acronimo = document.getElementById('ep-new-acro').value.trim().substring(0, 4).toUpperCase();
        const fecha = document.getElementById('ep-new-date').value;
        const numTemas = parseInt(document.getElementById('ep-new-temas').value, 10);
        const hora = document.getElementById('ep-new-hora').value;
        const lugar = document.getElementById('ep-new-lugar').value.trim();
        const notaPercentaje = parseInt(document.getElementById('ep-new-peso').value, 10) || 100;

        if (!nombre || !fecha || isNaN(numTemas)) { 
            alert("Completa el nombre, la fecha y el número de temas."); 
            return; 
        }

        let colorFinal = 'var(--accent)';
        const userColors = State.get('userColors') || {};
        if (userColors[nombre]) {
            colorFinal = userColors[nombre];
        } else if (typeof window.getColorAsignatura === 'function') {
            const tempC = window.getColorAsignatura(nombre);
            if (tempC && tempC !== '#607d8b') colorFinal = tempC;
        }

        const plan = getPlanSync();
        const idAsig = 'asig_' + Date.now();
        const temas = [];
        for (let i = 1; i <= numTemas; i++) {
            temas.push({ id: 'tm_' + Date.now() + '_' + i, nombre: `Tema ${i}`, pomosEstimados: 2, tipoEstudioId: 'st_read' });
        }

        State.batch(() => {
            plan.asignaturasPlanificadas.push({ id: idAsig, nombre, acronimo, color: colorFinal, temas });
            
            // Inyectar modelo de datos ampliado de Claude
            plan.examenes.push({ 
                id: 'ex_' + Date.now(), 
                asigId: idAsig, 
                asigNombre: nombre, 
                fecha, 
                hora, 
                lugar, 
                notaPercentaje,
                color: colorFinal 
            });

            // Auto-generar distribución inicial invocando al motor puro del Dominio
            if (typeof Domain !== 'undefined' && typeof Domain.calcularDistribucionPlanificador === 'function') {
                plan.schedule = Domain.calcularDistribucionPlanificador(plan);
                normalizarSchedulePlan(plan);
            }

            savePlan(plan);
        });

        document.getElementById('ep-new-asig').value = '';
        document.getElementById('ep-new-acro').value = '';
        document.getElementById('ep-new-lugar').value = '';
        document.getElementById('ep-new-peso').value = '100';
        document.getElementById('ep-new-temas').value = '5';
        renderWorkspace();
    }

    function borrarAsig(id) {
        if (!confirm("¿Eliminar bloque completo? Se borrará de la planificación diaria también.")) return;
        const plan = getPlanSync();
        State.batch(() => {
            plan.asignaturasPlanificadas = plan.asignaturasPlanificadas.filter(a => a.id !== id);
            plan.examenes = plan.examenes.filter(e => e.asigId !== id);
            Object.keys(plan.schedule).forEach(fecha => {
                plan.schedule[fecha] = plan.schedule[fecha].filter(t => t.asigId !== id);
            });
            savePlan(plan);
        });
        renderWorkspace();
    }

    function escapeHtml(str) { return String(str || '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m])); }

    // ── REGISTRO DE COMANDOS EN EL ORQUESTADOR GLOBAL ──
    if (typeof CommandRegistry !== 'undefined') {
        CommandRegistry.register('open-day',  (data) => abrirEditorDia(data.fecha));
    }

    // ── FUNCIONES PÚBLICAS (expuestas al scope global) ──
    function toggleCompletarTareaPlanner(fechaId, tareaId, estado) {
        cambiarEstadoTarea(fechaId, tareaId, estado || 'completed');
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
    }

    function eliminarTareaPlanner(fechaId, tareaId) {
        borrarTareaDia(fechaId, tareaId);
    }

    return { 
        abrirPlanificador: async function() { 
            // Cargar el plan de IndexedDB antes de renderizar y guardarlo en cache
            try {
                const plan = await getPlan();
                planCache = { ...plan };  // Sincronizar cache local
                State.set('planificador', plan);
            } catch(e) {
                Logger.error('[UIExamPlanner] Error al cargar plan:', e);
            }
            renderWorkspace(); 
        },
        toggleCompletarTareaPlanner,
        eliminarTareaPlanner
    };
})();

window.toggleCompletarTareaPlanner = UIExamPlanner.toggleCompletarTareaPlanner;
window.eliminarTareaPlanner = UIExamPlanner.eliminarTareaPlanner;

