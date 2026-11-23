const PlannerImport = (() => {
    function desdeBiblioteca(original, biblioteca, clave, subjectId) {
        const plan = PlannerModel.migrar(original);
        if (!Array.isArray(biblioteca[clave])) throw new Error('Asignatura de biblioteca inexistente.');
        let asig = subjectId ? plan.asignaturasPlanificadas.find(a => a.id === subjectId) :
            plan.asignaturasPlanificadas.find(a => a.libraryKey === clave);
        if (subjectId && !asig) throw new Error('Asignatura destino inexistente.');
        if (!asig) {
            asig = {id:'library_' + encodeURIComponent(clave),nombre:clave,libraryKey:clave,color:'var(--accent)',temas:[]};
            plan.asignaturasPlanificadas.push(asig);
        }
        asig.libraryKey = clave;
        const grupos = new Map();
        for (const tarjeta of biblioteca[clave]) {
            const nombre = String(tarjeta.Tema ?? 'Sin tema').trim() || 'Sin tema';
            if (!grupos.has(nombre)) grupos.set(nombre,[]);
            if (tarjeta.id != null) grupos.get(nombre).push(String(tarjeta.id));
        }
        for (const [nombre,cardIds] of grupos) {
            const existente = asig.temas.find(t => t.source?.libraryKey === clave &&
                (t.source.key === nombre || t.source.previousKeys?.includes(nombre) || t.source.cardIds?.some(id => cardIds.includes(id))));
            if (existente) {
                if (existente.source.key !== nombre) {
                    existente.source.previousKeys = [...new Set([...(existente.source.previousKeys || []), existente.source.key])];
                    existente.source.key = nombre;
                }
                existente.source.cardIds = [...new Set([...(existente.source.cardIds || []),...cardIds])];
                continue;
            }
            asig.temas.push({id:'library_topic_' + encodeURIComponent(JSON.stringify([clave,nombre])),
                nombre,pomosEstimados:0,estimacionDesconocida:true,
                source:{type:'library',libraryKey:clave,key:nombre,cardIds:[...new Set(cardIds)]},
                difficulty:null,extension:null,currentLevel:null,tipoEstudioId:'st_study'});
        }
        return PlannerModel.migrar(plan);
    }
    return {desdeBiblioteca};
})();
