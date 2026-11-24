// Motor determinista en minutos. Los pomodoros se conservan como adaptador de presentación.
const PlannerEngine = (() => {
    function desplazar(fecha, dias) {
        const d = Domain.parseDateSafe(fecha);
        if (!d || Domain.toISODateString(d) !== fecha) throw new Error('Fecha inválida: ' + fecha);
        d.setDate(d.getDate() + dias);
        return Domain.toISODateString(d);
    }

    function capacidadMinutos(plan, fecha, objetivo = false) {
        if ((plan.blockedDays || []).includes(fecha) ||
            plan.examenes.some(e => e.fecha === fecha || e.fecha === desplazar(fecha, 1))) return 0;
        const conversion = plan.pomodoroConversion?.minutes || 25;
        if (plan.dayOverrides?.[fecha] != null) return Number(plan.dayOverrides[fecha]) * conversion;
        const dia = Domain.parseDateSafe(fecha).getDay();
        const semanal = plan.availability?.weekly?.[dia];
        if (semanal) return objetivo ? PlannerEstimator.capacidadPrevista(plan,fecha,semanal.targetMinutes,semanal.maxMinutes).minutes : semanal.maxMinutes;
        const rango = plan.examSeason;
        const temporada = rango?.from && rango?.to ? fecha >= rango.from && fecha <= rango.to :
            plan.examenes.some(e => e.fecha >= fecha && e.fecha <= desplazar(fecha, 7));
        const tipo = [0,6].includes(dia) ? 'weekend' : temporada ? 'examSeason' : 'regularCourse';
        const valor = Number(plan.dailyCapacities?.[tipo]);
        if (!Number.isFinite(valor) || valor < 0) throw new Error('Capacidad inválida.');
        return objetivo ? PlannerEstimator.capacidadPrevista(plan,fecha,valor*conversion,valor*conversion).minutes : valor*conversion;
    }
    function capacidad(plan, fecha) {
        return capacidadMinutos(plan, fecha) / (plan.pomodoroConversion?.minutes || 25);
    }
    function minutos(plan, tarea) {
        return tarea.plannedMinutes ?? Number(tarea.pomosAsignados || 0) * plan.pomodoroConversion.minutes;
    }

    function generar(original, hoy) {
        desplazar(hoy, 0);
        const plan = PlannerModel.migrar(original);
        const conversion = plan.pomodoroConversion.minutes;
        const base = {};
        const conflictos = [];
        const actividades = plan.activities.filter(a => !a.archived);
        for (const [fecha, tareas] of Object.entries(plan.schedule)) {
            const fijas = tareas.filter(t => !t.isAuto || t.locked || ['completed','failed'].includes(t.status) || fecha < hoy);
            if (fijas.length) base[fecha] = structuredClone(fijas);
            if (fecha >= hoy && fijas.reduce((n,t) => n + minutos(plan,t),0) > capacidadMinutos(plan,fecha)) {
                conflictos.push(fecha + ': las sesiones conservadas superan la capacidad.');
            }
            for (const tarea of fijas) {
                if (!tarea.activityId) conflictos.push(fecha + ': tarea histórica sin actividad o convocatoria inequívoca.');
                const actividad = actividades.find(a => a.id === tarea.activityId);
                if (!actividad) continue;
                if (tarea.examenId && !actividad.assessmentIds.includes(tarea.examenId)) {
                    conflictos.push(fecha + ': la sesión conserva una evaluación anterior a la asociación actual de la actividad.');
                }
                for (const id of actividad.assessmentIds) {
                    const examen = plan.examenes.find(e => e.id === id);
                    if (tarea.status === 'pending' && examen && fecha > desplazar(examen.fecha,-2)) conflictos.push(fecha + ': sesión fijada después del plazo de ' + id);
                }
            }
        }
        if (!actividades.length) conflictos.push('Falta definir el trabajo de los temas.');
        const trabajos = actividades.map(a => {
            const asig = plan.asignaturasPlanificadas.find(s => s.id === a.subjectId);
            const tema = asig?.temas.find(t => t.id === a.topicId);
            const examenes = a.assessmentIds.map(id => plan.examenes.find(e => e.id === id && e.asigId === a.subjectId));
            if (!asig || !tema || !examenes.length || examenes.some(e => !e)) conflictos.push(a.id + ': falta tema o evaluación asociada.');
            if (a.estimateMinutes === null) conflictos.push((tema?.nombre || a.id) + ': estimación desconocida.');
            return {a, asig, tema, examenes:examenes.filter(Boolean)};
        });
        function credito(schedule, trabajo, examen, hasta = null) {
            let total = PlannerObservations.credito(plan,trabajo.a,hoy,examen.fecha,trabajo.a.assessmentIds.includes(examen.id) ? examen.id : null);
            if (hasta) total = PlannerObservations.credito({...plan,observations:(plan.observations || []).filter(o=>o.date<=hasta)},trabajo.a,hoy,examen.fecha,trabajo.a.assessmentIds.includes(examen.id) ? examen.id : null);
            for (const [fecha,tareas] of Object.entries(schedule)) {
                if (hasta && fecha > hasta) continue;
                for (const t of tareas) {
                    if (t.activityId !== trabajo.a.id || (t.examenId && !trabajo.a.assessmentIds.includes(t.examenId))) continue;
                    if (t.status === 'completed' && fecha <= hoy && fecha < examen.fecha) total += minutos(plan,t);
                    if (t.status === 'pending' && fecha >= hoy && fecha <= desplazar(examen.fecha,-2) && capacidadMinutos(plan,fecha) > 0) total += minutos(plan,t);
                }
            }
            return total;
        }
        function evaluar(schedule) {
            const deficits = [];
            for (const trabajo of trabajos) {
                const {a,asig,tema,examenes} = trabajo;
                if (a.estimateMinutes === null) continue;
                const destinos = examenes.length ? examenes : [null];
                for (const examen of destinos) {
                    const falta = Math.max(0,a.estimateMinutes - (examen ? credito(schedule,trabajo,examen) : 0));
                    if (falta > 0) deficits.push({activityId:a.id, examenId:examen?.id ?? null, asigId:a.subjectId, temaId:a.topicId,
                        minutes:falta, pomos:falta/conversion, nombre:(asig?.nombre || '') + ' · ' + (tema?.nombre || a.id),
                        motivo:examen ? 'Trabajo pendiente antes de ' + desplazar(examen.fecha,-2) : 'Falta examen asociado'});
                }
            }
            return deficits;
        }
        function distribuir(reserva) {
            const schedule = structuredClone(base);
            const plazos = plan.examenes.map(e => desplazar(e.fecha,-2)).sort();
            const ultimo = plazos.at(-1);
            for (let fecha = hoy; ultimo && fecha <= ultimo; fecha = desplazar(fecha,1)) {
                const techo = capacidadMinutos(plan,fecha);
                const objetivo = capacidadMinutos(plan,fecha,true);
                const capacidadDia = reserva ? Math.min(techo,objetivo) * (1-plan.preferences.reserveFraction) : techo;
                let libre = capacidadDia - (schedule[fecha] || []).reduce((n,t) => n+minutos(plan,t),0);
                while (libre > 0.000001) {
                    const opciones = [];
                    for (const trabajo of trabajos) {
                        const {a,asig,tema,examenes} = trabajo;
                        if (!asig || !tema || a.estimateMinutes === null) continue;
                        const futuros = examenes.filter(e => desplazar(e.fecha,-2) >= fecha && credito(schedule,trabajo,e) < a.estimateMinutes - 0.000001)
                            .sort((a,b) => a.fecha.localeCompare(b.fecha));
                        const examen = futuros[0];
                        if (!examen) continue;
                        const limite = desplazar(examen.fecha,-2);
                        const restante = a.estimateMinutes - credito(schedule,trabajo,examen);
                        const dependenciasListas = a.dependsOn.every(id => {
                            const previo = trabajos.find(t => t.a.id === id);
                            if (!previo || previo.a.estimateMinutes === null) return false;
                            const hasta = desplazar(fecha,-a.minGapDays);
                            return credito(schedule,previo,examen,hasta) >= previo.a.estimateMinutes - 0.000001;
                        });
                        if (!dependenciasListas) continue;
                        let capacidadRestante = 0;
                        for (let d=fecha; d<=limite; d=desplazar(d,1)) capacidadRestante += capacidadMinutos(plan,d);
                        opciones.push({trabajo,examen,limite,restante,holgura:capacidadRestante-restante});
                    }
                    opciones.sort((a,b) => a.limite.localeCompare(b.limite) || a.holgura-b.holgura ||
                        plan.asignaturasPlanificadas.indexOf(a.trabajo.asig)-plan.asignaturasPlanificadas.indexOf(b.trabajo.asig) ||
                        a.trabajo.a.id.localeCompare(b.trabajo.a.id));
                    const opcion = opciones[0];
                    if (!opcion) break;
                    const cantidad = Math.min(50,libre,opcion.restante);
                    // Un resto pequeño de actividad es válido; no fragmentar para ocupar huecos pequeños.
                    if (cantidad < 10 && opcion.restante > cantidad) break;
                    const {a,asig,tema} = opcion.trabajo;
                    const tareas = schedule[fecha] ||= [];
                    const prefijo = 'auto_' + encodeURIComponent(JSON.stringify([a.id,fecha]));
                    let tarea = tareas.find(t => t.idTarea === prefijo && t.isAuto && !t.locked && t.status === 'pending');
                    if (!tarea) {
                        let id = prefijo;
                        while (tareas.some(t => t.idTarea === id)) id += '+';
                        tarea = {idTarea:id, activityId:a.id, asigId:asig.id, asigNombre:asig.nombre,
                            temaId:tema.id,temaNombre:tema.nombre,color:asig.color,examenId:opcion.examen.id,
                            assessmentIds:[...a.assessmentIds],appliedObservationIds:(plan.observations || []).filter(o=>o.activityId===a.id && o.date<=hoy && o.progress!=='none').map(o=>o.id),studyTypeId:a.type,plannedMinutes:0,pomosAsignados:0,status:'pending',isAuto:true};
                        tareas.push(tarea);
                    }
                    tarea.plannedMinutes += cantidad;
                    tarea.pomosAsignados = tarea.plannedMinutes/conversion;
                    libre -= cantidad;
                }
            }
            return schedule;
        }
        let schedule = distribuir(true);
        let deficits = evaluar(schedule);
        let sinHolgura = false;
        if (deficits.length) {
            const reparado = distribuir(false);
            const faltante = evaluar(reparado);
            if (faltante.reduce((n,d)=>n+d.minutes,0) < deficits.reduce((n,d)=>n+d.minutes,0)) {
                schedule = reparado; deficits = faltante; sinHolgura = true;
            }
        }
        // Validación final independiente de la elección de la cola.
        for (const [fecha,tareas] of Object.entries(schedule)) {
            const automaticas = tareas.filter(t => t.isAuto && !t.locked && t.status === 'pending' && fecha >= hoy);
            if (!automaticas.length) continue;
            if (tareas.reduce((n,t)=>n+minutos(plan,t),0) > capacidadMinutos(plan,fecha)+0.000001) conflictos.push(fecha + ': capacidad excedida.');
            for (const t of automaticas) {
                const examen = plan.examenes.find(e => e.id === t.examenId);
                if (!examen || fecha > desplazar(examen.fecha,-2)) conflictos.push(fecha + ': plazo inválido.');
            }
        }
        for (const [fecha,tareas] of Object.entries(schedule)) {
            for (const tarea of tareas.filter(t=>t.status==='pending')) {
                const trabajo = trabajos.find(t=>t.a.id===tarea.activityId);
                if (!trabajo) continue;
                const examen = trabajo.examenes.find(e=>desplazar(e.fecha,-2)>=fecha);
                if (!examen) continue;
                for (const id of trabajo.a.dependsOn) {
                    const previo = trabajos.find(t=>t.a.id===id);
                    if (!previo || previo.a.estimateMinutes===null ||
                        credito(schedule,previo,examen,desplazar(fecha,-trabajo.a.minGapDays)) < previo.a.estimateMinutes-0.000001) {
                        conflictos.push(fecha + ': dependencia pendiente de ' + tarea.activityId);
                    }
                }
            }
        }
        const porActividad = new Map();
        for (const d of deficits) porActividad.set(d.activityId,Math.max(porActividad.get(d.activityId) || 0,d.pomos));
        const deficit = [...porActividad.values()].reduce((n,pomos)=>n+pomos,0);
        // El máximo por actividad resume déficits de fechas distintas; no representa trabajo físico exacto.
        const trabajoUnico = actividades.map(a => {
            let realizado = PlannerObservations.credito(plan,a,hoy);
            for (const [fecha,tareas] of Object.entries(plan.schedule)) {
                if (fecha > hoy) continue;
                for (const t of tareas) {
                    if (t.activityId === a.id && t.status === 'completed' &&
                        (!t.examenId || a.assessmentIds.includes(t.examenId))) realizado += minutos(plan,t);
                }
            }
            return {activityId:a.id, remainingMinutes:a.estimateMinutes === null ? null : Math.max(0,a.estimateMinutes-realizado)};
        });
        const uniqueWorkRemainingMinutes = trabajoUnico.reduce((n,a)=>n+(a.remainingMinutes || 0),0);
        const unknownActivityCount = trabajoUnico.filter(a=>a.remainingMinutes===null).length;
        const avisos = [...new Set(conflictos)];
        const resumen = avisos.concat(deficits.map(d => d.nombre + ' · ' + (d.examenId || 'sin evaluación') + ': déficit individual de ' + Math.ceil(d.minutes) + ' min en su plazo. ' + d.motivo));
        if (sinHolgura) resumen.push('Sin holgura suficiente: se ha utilizado capacidad hasta el máximo declarado.');
        return {scheduleGenerado:schedule, deficits, conflictos:avisos, deficit,
            deficitAggregation:'sum_of_maximum_deadline_deficits_per_activity', deficitIsApproximate:true,
            uniqueWorkRemainingMinutes, unknownActivityCount, uniqueWorkByActivity:trabajoUnico, excedido:!!(deficits.length || avisos.length),sinHolgura,
            log:resumen.join('\n') || 'Propuesta heurística dentro de los plazos y de la capacidad declarada.'};
    }
    return {generar,capacidad,capacidadMinutos};
})();
