// Adaptador de la carga legacy: las capacidades y estimaciones se expresan en pomodoros.
const PlannerEngine = (() => {
    function desplazar(fecha, dias) {
        const d = Domain.parseDateSafe(fecha);
        if (!d || Domain.toISODateString(d) !== fecha) throw new Error('Fecha de planificación inválida: ' + fecha);
        d.setDate(d.getDate() + dias);
        return Domain.toISODateString(d);
    }

    function capacidad(plan, fecha) {
        if ((plan.blockedDays || []).includes(fecha)) return 0;
        const examenes = plan.examenes || [];
        if (examenes.some(e => e.fecha === fecha || e.fecha === desplazar(fecha, 1))) return 0;
        const finde = [0, 6].includes(Domain.parseDateSafe(fecha).getDay());
        const rango = plan.examSeason;
        const temporada = rango?.from && rango?.to ? fecha >= rango.from && fecha <= rango.to :
            examenes.some(e => e.fecha >= fecha && e.fecha <= desplazar(fecha, 7));
        const tipo = finde ? 'weekend' : temporada ? 'examSeason' : 'regularCourse';
        const valor = Number(plan.dayOverrides?.[fecha] ?? plan.dailyCapacities?.[tipo]);
        if (!Number.isFinite(valor) || valor < 0) throw new Error('Capacidad inválida para ' + fecha);
        return valor;
    }

    function generar(plan, hoy) {
        desplazar(hoy, 0);
        const schedule = {};
        const conservadas = [];
        for (const [fecha, tareas] of Object.entries(plan.schedule || {})) {
            const fijas = tareas.filter(t => !t.isAuto || t.locked || ['completed','failed'].includes(t.status));
            if (fijas.length) schedule[fecha] = structuredClone(fijas);
            for (const tarea of fijas) conservadas.push({ fecha, tarea });
        }
        const conflictos = [];
        for (const [fecha, tareas] of Object.entries(schedule)) {
            if (fecha < hoy) continue;
            const reservados = tareas.reduce((n,t) => n + Number(t.pomosAsignados || 0), 0);
            if (reservados > capacidad(plan, fecha)) conflictos.push(fecha + ': las sesiones conservadas superan la capacidad del día.');
        }
        const cola = [];
        if (!(plan.asignaturasPlanificadas || []).some(a => a.temas?.length)) conflictos.push('Falta definir el trabajo de los temas.');
        for (const asig of plan.asignaturasPlanificadas || []) {
            const examenes = (plan.examenes || []).filter(e => e.asigId === asig.id).sort((a,b) => a.fecha.localeCompare(b.fecha));
            for (const tema of asig.temas || []) {
                const examen = PlannerModel.examenDeTema(plan, asig.id, tema);
                if (tema.estimacionDesconocida) conflictos.push(tema.nombre + ': confirma la estimación total reconstruida del historial.');
                const limite = examen ? desplazar(examen.fecha, -2) : null;
                const estimado = Number(tema.pomosEstimados);
                if (!Number.isFinite(estimado) || estimado < 0) throw new Error('Estimación inválida: ' + tema.nombre);
                let restante = estimado;
                for (const { fecha, tarea } of conservadas) {
                    if (tarea.asigId !== asig.id || tarea.temaId !== tema.id) continue;
                    if (tarea.examenId && PlannerModel.examenDeTarea(plan, tarea)?.id !== examen?.id) continue;
                    if (!tarea.examenId && examenes.length !== 1) {
                        conflictos.push(fecha + ': tarea histórica sin convocatoria inequívoca.');
                        continue;
                    }
                    if (tarea.status === 'pending' && limite && fecha > limite) {
                        conflictos.push(fecha + ': ' + tema.nombre + ' está fijado después del plazo.');
                    }
                    if ((tarea.status === 'completed' && fecha <= hoy) || (tarea.status === 'pending' && fecha >= hoy && fecha <= limite && capacidad(plan, fecha) > 0)) {
                        restante -= Number(tarea.pomosAsignados || 0);
                    }
                }
                if (restante > 0) cola.push({ asig, tema, examen, limite, restante });
            }
        }
        const limites = cola.map(i => i.limite).filter(Boolean).sort();
        const ultimo = limites.at(-1);
        for (let fecha = hoy; ultimo && fecha <= ultimo; fecha = desplazar(fecha, 1)) {
            let disponible = capacidad(plan, fecha) - (schedule[fecha] || []).reduce((n,t) => n + Number(t.pomosAsignados || 0), 0);
            const candidatos = cola.filter(i => i.limite >= fecha && i.restante > 0);
            candidatos.sort((a,b) => a.limite.localeCompare(b.limite) ||
                plan.asignaturasPlanificadas.indexOf(a.asig) - plan.asignaturasPlanificadas.indexOf(b.asig) ||
                b.restante - a.restante);
            while (disponible > 0 && candidatos.some(i => i.restante > 0)) {
                for (const item of candidatos) {
                    if (disponible <= 0 || item.restante <= 0) continue;
                    const { asig, tema, examen } = item;
                    const pomos = Math.min(1, item.restante, disponible);
                    const tareas = schedule[fecha] ||= [];
                    const idTarea = 'auto_' + encodeURIComponent(JSON.stringify([asig.id, tema.id, examen.id, fecha]));
                    let tarea = tareas.find(t => t.idTarea === idTarea && t.isAuto && !t.locked && t.status === 'pending');
                    if (!tarea) {
                        tarea = { idTarea: idTarea + (tareas.some(t => t.idTarea === idTarea) ? '_nuevo' : ''),
                            asigId: asig.id, asigNombre: asig.nombre, color: asig.color,
                            temaId: tema.id, temaNombre: tema.nombre, examenId: examen.id,
                            studyTypeId: tema.tipoEstudioId || 'st_read', pomosAsignados: 0, status: 'pending', isAuto: true };
                        tareas.push(tarea);
                    }
                    tarea.pomosAsignados += pomos;
                    item.restante -= pomos;
                    disponible -= pomos;
                }
            }
        }
        const deficits = cola.filter(i => i.restante > 0).map(i => ({ examenId: i.examen?.id ?? null,
            asigId: i.asig.id, temaId: i.tema.id, pomos: i.restante,
            motivo: i.examen ? 'Capacidad insuficiente antes del plazo' : 'Falta examen asociado',
            nombre: i.asig.nombre + ' · ' + i.tema.nombre }));
        const deficit = deficits.reduce((n,d) => n + d.pomos, 0);
        return { scheduleGenerado: schedule, deficits, conflictos, deficit, excedido: deficit > 0 || conflictos.length > 0,
            log: conflictos.concat(deficits.map(d => d.nombre + ': ' + d.pomos + ' pomodoros pendientes. ' + d.motivo)).join('\n') || 'Trabajo distribuido dentro de los plazos.' };
    }
    return { generar, capacidad };
})();
