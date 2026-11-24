const PlannerEstimator = (() => {
    function capacidadPrevista(plan, fecha, objetivo, maximo) {
        const peso = plan.preferences.declaredWeight ?? 0.8;
        if (peso === 1) return {minutes:Math.min(objetivo,maximo), sampleDays:0, source:'declared'};
        const dia = Domain.parseDateSafe(fecha).getDay();
        const dias = new Map();
        const completos = new Set();
        const desde = Domain.parseDateSafe(fecha);
        desde.setDate(desde.getDate()-56);
        const limite = Domain.toISODateString(desde);
        const temporada = d => plan.examSeason?.from && plan.examSeason?.to && d >= plan.examSeason.from && d <= plan.examSeason.to;
        for (const registro of plan.observations || []) {
            if (registro.date >= fecha || registro.date < limite || Domain.parseDateSafe(registro.date).getDay() !== dia || temporada(registro.date) !== temporada(fecha)) continue;
            dias.set(registro.date,(dias.get(registro.date) || 0)+registro.durationMinutes);
            if (registro.dayComplete) completos.add(registro.date);
        }
        const muestras = [...completos].map(d=>dias.get(d));
        if (muestras.length < 3) return {minutes:Math.min(objetivo,maximo),sampleDays:muestras.length,source:'declared'};
        const media = muestras.reduce((n,m)=>n+m,0)/muestras.length;
        return {minutes:Math.min(maximo,peso*objetivo+(1-peso)*media),sampleDays:muestras.length,source:'observed-and-declared'};
    }

    function retencion(plan, biblioteca) {
        return plan.asignaturasPlanificadas.flatMap(asig => (asig.temas || []).filter(t=>t.source?.cardIds?.length).map(tema => {
            const tarjetas=(biblioteca[tema.source.libraryKey] || []).filter(t=>tema.source.cardIds.includes(String(t.id)));
            return {subjectId:asig.id,topicId:tema.id,name:tema.nombre,linkedCards:tarjetas.length,
                reviewedCards:tarjetas.filter(t=>t.fsrs_state && t.fsrs_state !== 'new' && t.fsrs_stability != null).length};
        }));
    }
    return {capacidadPrevista,retencion};
})();
