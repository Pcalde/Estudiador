const PlannerRepository = (() => {
    const clave = 'planificador_pro';
    let cola = Promise.resolve();

    // La lectura de revisión y todas las escrituras ocurren bajo el mismo bloqueo de IndexedDB.
    async function transaccion(aplicar) {
        const db = await DB.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keyval', 'readwrite');
            const store = tx.objectStore('keyval');
            const get = store.get(clave);
            let resultado, fallo;
            get.onsuccess = () => {
                try {
                    resultado = aplicar(get.result?.value, (key, value) => store.put({ key, value }));
                } catch (error) {
                    fallo = error;
                    tx.abort();
                }
            };
            tx.oncomplete = () => resolve(resultado);
            tx.onabort = () => reject(fallo || tx.error || new Error('Escritura cancelada.'));
        });
    }

    function registrar(put, anterior, plan) {
        const previas = new Map();
        for (const tareas of Object.values(anterior?.schedule || {})) {
            for (const tarea of tareas) previas.set(tarea.idTarea, tarea.status);
        }
        const cambios = [];
        for (const [fecha, tareas] of Object.entries(plan.schedule)) {
            for (const tarea of tareas) {
                const antes = previas.get(tarea.idTarea);
                if (antes === tarea.status || (!antes && tarea.status === 'pending')) continue;
                cambios.push({ fecha, idTarea: tarea.idTarea, asigId: tarea.asigId, temaId: tarea.temaId,
                    anterior: antes ?? null, status: tarea.status, pomos: tarea.pomosAsignados });
            }
        }
        if (cambios.length) put('planner_observaciones_' + plan.commitId, cambios);
        put('planner_revision_' + plan.commitId, plan);
        put(clave, plan);
        return plan;
    }

    async function abrir() {
        await cola;
        return transaccion((actual, put) => {
            if (actual?.schemaVersion === 2) return PlannerModel.migrar(actual);
            const local = Perfil.local.getItem('estudiador_planificador_pro');
            const origen = actual ?? (local ? JSON.parse(local) : {});
            const plan = PlannerModel.migrar(origen);
            plan.revision = 1;
            plan.updatedAt = new Date().toISOString();
            plan.commitId = DataIO.nuevoId();
            const backup = { indexedDB: actual ?? null, localStorage: local };
            put('planner_backup_' + plan.commitId, backup);
            put('planner_backup_legacy', backup);
            return registrar(put, null, plan);
        });
    }

    function guardar(borrador) {
        const plan = PlannerModel.migrar(borrador);
        const esperada = plan.revision;
        const base = plan.commitId;
        plan.commitId = DataIO.nuevoId();
        plan.revision++;
        plan.updatedAt = new Date().toISOString();
        const confirmacion = cola.then(() => transaccion((actual, put) => {
            if (actual?.revision !== esperada || actual.commitId !== base) throw new Error('La revisión ha cambiado. Vuelve a abrir el plan antes de editar.');
            return registrar(put, actual, plan);
        })).then(guardado => {
            State.set('planificador', structuredClone(guardado));
        });
        cola = confirmacion.catch(() => {});
        return { plan: structuredClone(plan), confirmacion };
    }
    return { abrir, guardar };
})();
