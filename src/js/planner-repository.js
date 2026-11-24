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
            const sesiones = store.get('planner_sessions');
            let resultado, fallo;
            sesiones.onsuccess = () => {
                try {
                    resultado = aplicar(get.result?.value, (key, value) => store.put({ key, value }), sesiones.result?.value || []);
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
                    activityId: tarea.activityId ?? null, plannedMinutes: tarea.plannedMinutes,
                    anterior: antes ?? null, status: tarea.status, pomos: tarea.pomosAsignados });
            }
        }
        if (cambios.length) put('planner_observaciones_' + plan.commitId, cambios);
        const anteriores = new Map(Object.entries(anterior?.schedule || {}).flatMap(([fecha,tareas])=>tareas.map(t=>[t.idTarea,{fecha,tarea:t}])));
        const actuales = new Map(Object.entries(plan.schedule).flatMap(([fecha,tareas])=>tareas.map(t=>[t.idTarea,{fecha,tarea:t}])));
        put('planner_change_' + plan.commitId, {
            revision:plan.revision, previousRevision:anterior?.revision ?? null, date:plan.updatedAt,
            reason:plan.lastChangeReason || plan.lastReplan?.reason || 'Edición del plan',
            added:[...actuales.keys()].filter(id=>!anteriores.has(id)),
            removed:[...anteriores.keys()].filter(id=>!actuales.has(id)),
            changed:[...actuales.keys()].filter(id=>anteriores.has(id) && JSON.stringify(actuales.get(id))!==JSON.stringify(anteriores.get(id)))
        });
        put('planner_revision_' + plan.commitId, plan);
        put(clave, plan);
        return plan;
    }

    async function abrir() {
        await cola;
        return transaccion((actual, put, observaciones) => {
            if (actual?.schemaVersion === 2) return {...PlannerModel.migrar(actual), observations:structuredClone(observaciones)};
            const local = Perfil.local.getItem('estudiador_planificador_pro');
            const origen = actual ?? (local ? JSON.parse(local) : {});
            const plan = PlannerModel.migrar(origen);
            plan.revision = 1;
            plan.updatedAt = new Date().toISOString();
            plan.commitId = DataIO.nuevoId();
            const backup = { indexedDB: actual ?? null, localStorage: local };
            put('planner_backup_' + plan.commitId, backup);
            put('planner_backup_legacy', backup);
            return {...registrar(put, null, plan), observations:structuredClone(observaciones)};
        });
    }

    function guardar(borrador) {
        const plan = PlannerModel.migrar(borrador);
        delete plan.observations;
        plan.lastChangeReason='Edición del plan';
        const esperada = plan.revision;
        const base = plan.commitId;
        plan.commitId = DataIO.nuevoId();
        plan.revision++;
        plan.updatedAt = new Date().toISOString();
        const confirmacion = cola.then(() => transaccion((actual, put, observaciones) => {
            if (actual?.revision !== esperada || actual.commitId !== base) throw new Error('La revisión ha cambiado. Vuelve a abrir el plan antes de editar.');
            if (actual.academicVersion !== 2) put('planner_backup_academic_' + plan.commitId, actual);
            return {...registrar(put, actual, plan), observations:structuredClone(observaciones)};
        })).then(guardado => {
            State.set('planificador', structuredClone(guardado));
            return guardado;
        });
        cola = confirmacion.catch(() => {});
        return { plan: structuredClone(plan), confirmacion };
    }
    function registrarSesion(original) {
        const entrada = structuredClone(original);
        const operacion = cola.then(() => transaccion((actual, put, sesiones) => {
            if (!actual) throw new Error('Abre el planificador antes de registrar una sesión.');
            const previa = sesiones.find(s => PlannerObservations.identidad(s) === PlannerObservations.identidad(entrada) || s.id === entrada.id);
            if (previa) {
                for (const campo of ['id','source','sourceEventId','activityId','taskId','date','durationMinutes','progress','note','dayComplete']) {
                    if ((previa[campo] ?? null) !== (entrada[campo] ?? null)) throw new Error('La identidad de sesión ya corresponde a otro registro.');
                }
                return {...PlannerModel.migrar(actual), observations:structuredClone(sesiones)};
            }
            const plan = PlannerModel.migrar(actual);
            const registro = PlannerObservations.validar(plan, entrada);
            registro.recordedAt = new Date().toISOString();
            const nuevas = [...sesiones, registro];
            put('planner_sessions', nuevas);
            plan.revision++;
            plan.commitId = DataIO.nuevoId();
            plan.updatedAt = registro.recordedAt;
            plan.lastChangeReason = 'Sesión registrada: ' + registro.id;
            return {...registrar(put,actual,plan), observations:structuredClone(nuevas)};
        })).then(plan => {
            State.set('planificador', structuredClone(plan));
            return plan;
        });
        cola = operacion.catch(() => {});
        return operacion;
    }

    function replanificar(hoy = Domain.getFechaHoy(), motivo = 'Actualización del plan') {
        const operacion = cola.then(() => transaccion((actual,put,observaciones) => {
            if (!actual) return null;
            const plan = {...PlannerModel.migrar(actual), observations:structuredClone(observaciones)};
            if (actual.schemaVersion !== 2 || !plan.preferences.autoReplan) return plan;
            const resultado = PlannerEngine.generar(plan,hoy);
            if (resultado.excedido) return {...plan, replanNotice:resultado.log};
            const propuesta = PlannerModel.migrar({...plan,schedule:resultado.scheduleGenerado});
            if (JSON.stringify(propuesta.schedule) === JSON.stringify(plan.schedule)) return plan;
            const antes = Object.entries(plan.schedule).flatMap(([fecha,ts])=>ts.map(t=>({fecha,...t})));
            const despues = Object.entries(propuesta.schedule).flatMap(([fecha,ts])=>ts.map(t=>({fecha,...t})));
            delete propuesta.lastChangeReason;
            propuesta.lastReplan = {date:hoy,reason:motivo,
                added:despues.filter(t=>!antes.some(a=>a.idTarea===t.idTarea)).map(t=>({id:t.idTarea,date:t.fecha})),
                removed:antes.filter(t=>!despues.some(a=>a.idTarea===t.idTarea)).map(t=>({id:t.idTarea,date:t.fecha})),
                changed:despues.filter(t=>antes.some(a=>a.idTarea===t.idTarea && (a.plannedMinutes!==t.plannedMinutes || a.fecha!==t.fecha))).map(t=>({id:t.idTarea,date:t.fecha,minutes:t.plannedMinutes}))};
            propuesta.revision++;
            propuesta.commitId=DataIO.nuevoId();
            propuesta.updatedAt=new Date().toISOString();
            delete propuesta.observations;
            registrar(put,actual,propuesta);
            return {...propuesta,observations:structuredClone(observaciones)};
        })).then(plan=>{
            if (plan) State.set('planificador',structuredClone(plan));
            return plan;
        });
        cola=operacion.catch(()=>{});
        return operacion;
    }

    return { abrir, guardar, registrarSesion, replanificar };
})();
