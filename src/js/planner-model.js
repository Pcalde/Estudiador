const PlannerModel = (() => {
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
        if (!Number.isFinite(pomos) || pomos < 0) throw new Error('Duración de tarea inválida.');
        return pomos;
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
        return 'var(--accent)';
    }

    function normalizarTareaPlan(plan, task, fecha, index) {
        if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Tarea inválida en ' + fecha);

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
            const tareas = plan.schedule[fecha];
            if (!Array.isArray(tareas) || !fechaValida(fecha)) throw new Error('Día de calendario inválido: ' + fecha);
            plan.schedule[fecha] = tareas
                .map((task, index) => normalizarTareaPlan(plan, task, fecha, index))
                .filter(Boolean);
        });
    }


    function fechaValida(fecha) {
        if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
        const d = new Date(fecha + 'T12:00:00Z');
        return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
    }

    function migrar(original) {
        if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('Plan inválido.');
        const plan = structuredClone(original);
        if (plan.schemaVersion != null && ![1,2].includes(plan.schemaVersion)) throw new Error('Versión del plan no compatible.');
        plan.schemaVersion = 2;
        plan.revision ??= 0;
        if (!Number.isSafeInteger(plan.revision) || plan.revision < 0) throw new Error('Revisión inválida.');
        plan.pomodoroConversion ??= plan.pomodoroMinutes != null
            ? { minutes: Number(plan.pomodoroMinutes), source: 'legacy' }
            : { minutes: 25, source: 'assumed' };
        if (!(Number.isFinite(plan.pomodoroConversion.minutes) && plan.pomodoroConversion.minutes > 0)) throw new Error('Duración de Pomodoro inválida.');
        plan.asignaturasPlanificadas ??= [];
        plan.examenes ??= [];
        plan.schedule ??= {};
        for (const key of ['asignaturasPlanificadas', 'examenes']) {
            if (!Array.isArray(plan[key])) throw new Error('Lista inválida: ' + key);
        }
        if (typeof plan.schedule !== 'object' || Array.isArray(plan.schedule)) throw new Error('Calendario inválido.');
        if (!plan.studyTypes?.length) plan.studyTypes = structuredClone(DEFAULT_STUDY_TYPES);
        if (!plan.examWeights?.length) plan.examWeights = structuredClone(DEFAULT_EXAM_WEIGHTS);
        plan.dailyCapacities = { ...DEFAULT_DAILY_CAPACITIES, ...plan.dailyCapacities };
        for (const cap of [...Object.values(plan.dailyCapacities), ...Object.values(plan.dayOverrides || {})]) {
            if (typeof cap === 'boolean' || cap === '' || cap == null || !Number.isFinite(Number(cap)) || Number(cap) < 0) throw new Error('Capacidad inválida.');
        }
        for (const fecha of [...(plan.blockedDays || []), ...Object.keys(plan.dayOverrides || {})]) {
            if (!fecha || !fechaValida(fecha)) throw new Error('Fecha de excepción inválida.');
        }
        for (const fecha of [plan.examSeason?.from, plan.examSeason?.to].filter(v => v != null && v !== '')) {
            if (!fechaValida(fecha)) throw new Error('Fecha de temporada inválida.');
        }
        if (plan.examSeason?.from && plan.examSeason?.to && plan.examSeason.from > plan.examSeason.to) throw new Error('Temporada invertida.');
        normalizarSchedulePlan(plan);
        // AÑADIR: reconstruir asignaturas desde el schedule si la lista está vacía
        if (plan.asignaturasPlanificadas.length === 0 && Object.keys(plan.schedule).length > 0) {
            const asigMap = Object.create(null);
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
                                pomosEstimados: 0,
                                estimacionDesconocida: true,
                                tipoEstudioId: t.studyTypeId || 'st_read'
                            });
                        }
                    }
                });
            });
            plan.asignaturasPlanificadas = Object.values(asigMap);
        }


        plan.asignaturasPlanificadas.forEach((asig,i) => {
            asig.id ??= 'legacy_asig_' + i;
            (asig.temas || []).forEach((tema,j) => {
                tema.id ??= 'legacy_tema_' + i + '_' + j;
                if (tema.pomosEstimados == null || tema.pomosEstimados === '' || typeof tema.pomosEstimados === 'boolean') throw new Error('Estimación ausente o inválida.');
                tema.estimatedMinutes = Number(tema.pomosEstimados ?? 0) * plan.pomodoroConversion.minutes;
                if (!Number.isFinite(tema.estimatedMinutes) || tema.estimatedMinutes < 0) throw new Error('Estimación inválida.');
            });
        });
        plan.examenes.forEach((examen,i) => {
            examen.id ??= 'legacy_ex_' + i;
            if (!examen.fecha || !fechaValida(examen.fecha)) throw new Error('Fecha de examen inválida.');
        });
        const comprobarIds = items => {
            const ids = new Set();
            for (const item of items) {
                if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('Identificador inválido.');
                if (ids.has(item.id)) throw new Error('ID repetido en el plan: ' + item.id);
                ids.add(item.id);
            }
        };
        const tareas = Object.values(plan.schedule).flat();
        comprobarIds(tareas.map(t => ({id: t.idTarea})));
        comprobarIds(plan.examenes);
        comprobarIds(plan.asignaturasPlanificadas);
        for (const asig of plan.asignaturasPlanificadas) comprobarIds(asig.temas || []);
        normalizarAcademico(plan);
        return plan;
    }
    function normalizarAcademico(plan) {
        const minutos = plan.pomodoroConversion.minutes;
        plan.academicVersion = 2;
        plan.preferences ??= {};
        plan.preferences.reserveFraction ??= 0.15;
        plan.preferences.declaredWeight ??= 0.8;
        plan.preferences.autoReplan ??= true;
        numero(plan.preferences.declaredWeight,0,1,'Peso de disponibilidad declarada');
        if (typeof plan.preferences.autoReplan !== 'boolean') throw new Error('Replanificación automática inválida.');
        numero(plan.preferences.reserveFraction, 0, 0.8, 'Reserva');
        plan.availability ??= {weekly:{}};
        plan.availability.weekly ??= {};
        for (const [dia, capacidad] of Object.entries(plan.availability.weekly)) {
            if (!/^[0-6]$/.test(dia)) throw new Error('Día semanal inválido.');
            numero(capacidad.targetMinutes, 0, 1440, 'Objetivo diario');
            numero(capacidad.maxMinutes, capacidad.targetMinutes, 1440, 'Máximo diario');
        }
        plan.activities ??= [];
        if (!Array.isArray(plan.activities)) throw new Error('Actividades inválidas.');
        for (const examen of plan.examenes) {
            examen.goal ??= {type:'mastery', target:100};
            if (!['grade','mastery','mixed'].includes(examen.goal.type)) throw new Error('Objetivo inválido.');
            numero(examen.goal.target, 0, examen.goal.type === 'mastery' ? 100 : 10, 'Objetivo');
            if (examen.goal.type === 'mixed') numero(examen.goal.masteryTarget, 0, 100, 'Dominio objetivo');
        }
        for (const asig of plan.asignaturasPlanificadas) {
            for (const tema of asig.temas || []) {
                for (const campo of ['difficulty','extension','currentLevel']) {
                    tema[campo] ??= null;
                    if (tema[campo] !== null) numero(tema[campo], 1, 5, campo);
                }
                const existentes = plan.activities.filter(a => a.subjectId === asig.id && a.topicId === tema.id);
                if (!existentes.length) {
                    const examen = examenDeTema(plan, asig.id, tema);
                    plan.activities.push({
                        id:'activity_' + encodeURIComponent(JSON.stringify([asig.id,tema.id])),
                        subjectId:asig.id, topicId:tema.id, type:tema.tipoEstudioId || 'st_study',
                        assessmentIds:examen ? [examen.id] : [],
                        estimateMinutes:tema.estimacionDesconocida ? null : Number(tema.pomosEstimados) * minutos,
                        source:'legacy', dependsOn:[], minGapDays:0
                    });
                }
                for (const actividad of existentes.filter(a => a.source === 'legacy')) {
                    actividad.estimateMinutes = tema.estimacionDesconocida ? null : Number(tema.pomosEstimados) * minutos;

                }
            }
        }
        const ids = new Set();
        for (const actividad of plan.activities) {
            if (typeof actividad.id !== 'string' || !actividad.id || ids.has(actividad.id)) throw new Error('Identificador de actividad inválido o repetido.');
            ids.add(actividad.id);
            if (!Array.isArray(actividad.assessmentIds) || new Set(actividad.assessmentIds).size !== actividad.assessmentIds.length) throw new Error('Evaluaciones de actividad inválidas.');
            if (!Array.isArray(actividad.dependsOn)) throw new Error('Dependencias inválidas.');
            if (actividad.estimateMinutes !== null) numero(actividad.estimateMinutes, 0, Number.MAX_SAFE_INTEGER, 'Estimación en minutos');
            actividad.minGapDays ??= 0;
            numero(actividad.minGapDays, 0, 365, 'Separación entre actividades');
            if (!Number.isInteger(actividad.minGapDays)) throw new Error('Separación en días enteros requerida.');
        }
        for (const asig of plan.asignaturasPlanificadas) {
            for (const tema of asig.temas || []) {
                const actividades = plan.activities.filter(a => a.subjectId === asig.id && a.topicId === tema.id && !a.archived);
                tema.estimacionDesconocida = actividades.some(a => a.estimateMinutes === null);
                tema.estimatedMinutes = actividades.reduce((n,a) => n + (a.estimateMinutes || 0), 0);
                tema.pomosEstimados = tema.estimatedMinutes / minutos;
                tema.requiredTypes = [...new Set(actividades.map(a => a.type))];
            }
        }
        for (const examen of plan.examenes) {
            examen.topicIds = [...new Set(plan.activities.filter(a => !a.archived && a.assessmentIds.includes(examen.id)).map(a => a.topicId))];
        }
        const visitadas = new Set(), pendientes = new Set();
        function visitar(id) {
            if (pendientes.has(id)) throw new Error('Dependencia circular.');
            if (visitadas.has(id)) return;
            const actividad = plan.activities.find(a => a.id === id);
            if (!actividad) throw new Error('Dependencia inexistente: ' + id);
            pendientes.add(id);
            actividad.dependsOn.forEach(visitar);
            pendientes.delete(id);
            visitadas.add(id);
        }
        plan.activities.forEach(a => visitar(a.id));
        for (const tareas of Object.values(plan.schedule)) {
            for (const tarea of tareas) {
                tarea.plannedMinutes ??= getTaskPomos(tarea) * minutos;
                numero(tarea.plannedMinutes, 0, Number.MAX_SAFE_INTEGER, 'Minutos de sesión');
                tarea.pomosAsignados = tarea.plannedMinutes / minutos;
                tarea.pomos = tarea.pomosAsignados;
                if (tarea.activityId) {
                    const actividad = plan.activities.find(a => a.id === tarea.activityId);
                    if (actividad && (actividad.subjectId !== tarea.asigId || actividad.topicId !== tarea.temaId)) {
                        throw new Error('La sesión no corresponde a su actividad o convocatoria.');
                    }
                }
                if (!tarea.activityId) {
                    const examen = examenDeTarea(plan, tarea);
                    const candidatas = plan.activities.filter(a => a.subjectId === tarea.asigId && a.topicId === tarea.temaId &&
                        examen && a.assessmentIds.includes(examen.id));
                    if (candidatas.length === 1) tarea.activityId = candidatas[0].id;
                }
            }
        }
    }

    function numero(valor, minimo, maximo, campo) {
        if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo) throw new Error(campo + ' fuera de rango.');
    }

    function examenDeTema(plan, asigId, tema) {
        const examenes = plan.examenes.filter(e => e.asigId === asigId).sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
        return tema.examenId ? examenes.find(e => e.id === tema.examenId) : examenes[0];
    }

    function examenDeTarea(plan, tarea) {
        const examenes = plan.examenes.filter(e => e.asigId === tarea.asigId);
        if (tarea.examenId) return examenes.find(e => e.id === tarea.examenId);
        return examenes.length === 1 ? examenes[0] : undefined;
    }

    function realizadaAntesDelExamen(tarea, fecha, examen, hoy) {
        return tarea.status === 'completed' && fecha <= hoy && !!examen && fecha < examen.fecha;
    }

    function metricasAcademicas(plan, hoy) {
        const conversion=plan.pomodoroConversion.minutes;
        const filas=plan.examenes.map(e=>({examenId:e.id,nombre:(plan.asignaturasPlanificadas.find(a=>a.id===e.asigId)?.nombre || e.id)+' · '+e.fecha,
            estimado:null,pendiente:null,planificado:0,completado:0,preparacionCompletada:0,sesiones:0,realizadas:0,fallidas:0,sinEstimacion:false}));
        const historico={examenId:null,nombre:'Historial sin actividad o convocatoria inequívoca',estimado:null,pendiente:null,
            planificado:0,completado:0,preparacionCompletada:0,sesiones:0,realizadas:0,fallidas:0,sinEstimacion:false};
        const creditos=new Map();
        for (const [fecha,tareas] of Object.entries(plan.schedule)) {
            for (const tarea of tareas) {
                const actividad=plan.activities.find(a=>a.id===tarea.activityId);
                const destinos=actividad && (!tarea.examenId || actividad.assessmentIds.includes(tarea.examenId)) ? filas.filter(f=>actividad.assessmentIds.includes(f.examenId)) : [];
                const cantidad=(tarea.plannedMinutes ?? getTaskPomos(tarea)*conversion)/conversion;
                for (const fila of destinos.length ? destinos : [historico]) {
                    if (tarea.status==='pending' && fecha>=hoy) fila.planificado+=cantidad;
                    if (fecha>hoy) continue;
                    fila.sesiones++;
                    if (tarea.status==='failed') fila.fallidas++;
                    if (tarea.status!=='completed') continue;
                    fila.realizadas++;
                    fila.completado+=cantidad;
                    const examen=plan.examenes.find(e=>e.id===fila.examenId);
                    if (realizadaAntesDelExamen(tarea,fecha,examen,hoy)) {
                        fila.preparacionCompletada+=cantidad;
                        const key=JSON.stringify([actividad.id,examen.id]);
                        creditos.set(key,(creditos.get(key)||0)+cantidad);
                    }
                }
            }
        }
        for (const actividad of plan.activities) {
            for (const id of actividad.assessmentIds) {
                const examen=plan.examenes.find(e=>e.id===id);
                const fila=filas.find(f=>f.examenId===id);
                if (!examen || !fila) continue;
                const cantidad=PlannerObservations.credito(plan,actividad,hoy,examen.fecha,examen.id)/conversion;
                const key=JSON.stringify([actividad.id,id]);
                creditos.set(key,(creditos.get(key)||0)+cantidad);
                fila.preparacionCompletada+=cantidad;
                fila.completado+=PlannerObservations.credito(plan,actividad,hoy,null,null,false)/conversion;
            }
        }
        for (const actividad of plan.activities.filter(a=>!a.archived)) {
            for (const id of actividad.assessmentIds) {
                const fila=filas.find(f=>f.examenId===id);
                if (!fila) continue;
                if (actividad.estimateMinutes===null) { fila.sinEstimacion=true; continue; }
                const estimado=actividad.estimateMinutes/conversion;
                fila.estimado=(fila.estimado || 0)+estimado;
                fila.pendiente=(fila.pendiente || 0)+Math.max(0,estimado-(creditos.get(JSON.stringify([actividad.id,id])) || 0));
            }
        }
        if (historico.sesiones || historico.planificado) filas.push(historico);
        return filas;
    }

    function metricasPorConvocatoria(plan, hoy) {
        if (plan.activities) return metricasAcademicas(plan,hoy);
        const crear = (examenId, nombre) => ({examenId, nombre, estimado:null, pendiente:null,
            planificado:0, completado:0, preparacionCompletada:0, sesiones:0, realizadas:0, fallidas:0, sinEstimacion:false});
        const filas = plan.examenes.map(e => crear(e.id,
            (plan.asignaturasPlanificadas.find(a => a.id === e.asigId)?.nombre || e.asigNombre || 'Examen') + ' · ' + e.fecha + ' · ' + (e.nombre || e.id)));
        const historico = crear(null, 'Historial sin convocatoria inequívoca');
        const realizadas = new Map();
        for (const [fecha, tareas] of Object.entries(plan.schedule)) {
            for (const tarea of tareas) {
                const examen = examenDeTarea(plan, tarea);
                const fila = filas.find(f => f.examenId === examen?.id) || historico;
                const pomos = getTaskPomos(tarea);
                if (tarea.status === 'pending' && fecha>=hoy) fila.planificado += pomos;
                if (fecha > hoy) continue;
                fila.sesiones++;
                if (tarea.status === 'completed') {
                    fila.realizadas++;
                    fila.completado += pomos;
                    if (realizadaAntesDelExamen(tarea, fecha, examen, hoy)) {
                        fila.preparacionCompletada += pomos;
                        const key = JSON.stringify([examen.id, tarea.asigId, tarea.temaId]);
                        realizadas.set(key, (realizadas.get(key) || 0) + pomos);
                    }
                }
                if (tarea.status === 'failed') fila.fallidas++;
            }
        }
        for (const asig of plan.asignaturasPlanificadas) {
            for (const tema of asig.temas || []) {
                const examen = examenDeTema(plan, asig.id, tema);
                const fila = filas.find(f => f.examenId === examen?.id) || historico;
                if (tema.estimacionDesconocida) { fila.sinEstimacion = true; continue; }
                const estimado = Number(tema.pomosEstimados);
                fila.estimado = (fila.estimado || 0) + estimado;
                const hecho = examen ? realizadas.get(JSON.stringify([examen.id, asig.id, tema.id])) || 0 : 0;
                fila.pendiente = (fila.pendiente || 0) + Math.max(0, estimado - hecho);
            }
        }
        if (historico.sesiones || historico.planificado || historico.estimado != null) filas.push(historico);
        return filas;
    }

    return { migrar, getTaskId, getTaskStatus, examenDeTema, examenDeTarea, realizadaAntesDelExamen, metricasPorConvocatoria };
})();
