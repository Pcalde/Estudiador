// Observaciones de trabajo inmutables. Su crédito describe trabajo, no dominio académico.
const PlannerObservations = (() => {
    function validar(plan, original) {
        const registro = structuredClone(original);
        if (!registro || typeof registro.id !== 'string' || !registro.id.trim()) throw new Error('Falta identidad de la sesión.');
        if (!['manual', 'pomodoro'].includes(registro.source)) throw new Error('Procedencia de sesión inválida.');
        if (!['partial', 'complete', 'none'].includes(registro.progress)) throw new Error('Progreso inválido.');
        if (!Number.isFinite(registro.durationMinutes) || registro.durationMinutes <= 0 || registro.durationMinutes > 1440) throw new Error('Duración de sesión inválida.');
        const fecha = Domain.parseDateSafe(registro.date);
        if (!fecha || Domain.toISODateString(fecha) !== registro.date) throw new Error('Fecha de sesión inválida.');
        if (typeof registro.sourceEventId !== 'string' || !registro.sourceEventId) throw new Error('Falta identidad del evento de origen.');
        if (registro.date > Domain.getFechaHoy()) throw new Error('La sesión todavía no ha ocurrido.');
        registro.dayComplete = registro.dayComplete === true;
        registro.activityId ||= null;
        registro.taskId ||= null;
        const actividad = plan.activities.find(a => a.id === registro.activityId && !a.archived);
        if (registro.activityId && !actividad) throw new Error('Actividad inexistente o archivada.');
        if (registro.progress === 'complete' && !actividad) throw new Error('Selecciona la actividad completada.');
        registro.subjectId = actividad?.subjectId ?? null;
        registro.topicId = actividad?.topicId ?? null;
        registro.workType = actividad?.type ?? null;
        registro.assessmentIds = actividad ? [...actividad.assessmentIds] : [];
        if (registro.taskId) {
            const tarea = Object.values(plan.schedule).flat().find(t => t.idTarea === registro.taskId);
            if (!tarea || tarea.activityId !== registro.activityId) throw new Error('La tarea no corresponde a la actividad.');
        }
        registro.note = String(registro.note || '').trim();
        return registro;
    }

    function credito(plan, actividad, hoy, antesDe = null, examenId = null, acreditarFinalizacion = true) {
        let minutos = 0;
        let completa = false;
        const tareasCompletas = new Map(Object.entries(plan.schedule).flatMap(([fecha, tareas]) =>
            fecha <= hoy && (!antesDe || fecha < antesDe) ? tareas.filter(t => t.status === 'completed').map(t => [t.idTarea,t]) : []));
        for (const registro of plan.observations || []) {
            if (registro.activityId !== actividad.id || (examenId && !registro.assessmentIds?.includes(examenId)) || registro.date > hoy ||
                (antesDe && registro.date >= antesDe) || registro.progress === 'none') continue;
            // Una sesión ligada a una tarea completa ya está representada por la evidencia legacy.
            const completaVinculada = registro.taskId ? tareasCompletas.get(registro.taskId) : null;
            if (completaVinculada && !completaVinculada.appliedObservationIds?.includes(registro.id)) continue;
            minutos += registro.durationMinutes;
            completa ||= registro.progress === 'complete';
        }
        return completa && acreditarFinalizacion ? Math.max(minutos, actividad.estimateMinutes || 0) : minutos;
    }

    function identidad(registro) {
        return JSON.stringify([registro.source, registro.sourceEventId]);
    }
    return { validar, credito, identidad };
})();
