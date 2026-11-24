const PlannerTracking = (() => {
    let pendientes = [];
    let cargado = false;
    let enviando = null;
    function cargar() {
        if (cargado) return;
        const texto = Perfil.local.getItem('planner_session_outbox');
        pendientes = texto ? JSON.parse(texto) : [];
        if (!Array.isArray(pendientes)) throw new Error('Respaldo de sesiones inválido.');
        cargado = true;
    }
    function respaldar() {
        try { Perfil.local.setItem('planner_session_outbox',JSON.stringify(pendientes)); }
        catch { Toast.show('La sesión permanece en memoria. Mantén la página abierta y reintenta el registro.','warning'); }
    }
    async function enviar() {
        cargar();
        if (enviando) return enviando;
        enviando = (async () => {
            await PlannerRepository.abrir();
            while (pendientes.length) {
                await PlannerRepository.registrarSesion(pendientes[0]);
                pendientes.shift();
                respaldar();
            }
            if (Perfil.local.getItem('estudiador_planner_borrador')) return PlannerRepository.abrir();
            return PlannerRepository.replanificar(Domain.getFechaHoy(),'Sesiones observadas');
        })();
        try { const plan=await enviando; EventBus.emit('PLANNER_UPDATED',{plan}); return plan; }
        finally { enviando = null; }
    }
    async function registrar(registro) {
        cargar();
        const anterior=pendientes.find(p=>PlannerObservations.identidad(p)===PlannerObservations.identidad(registro));
        if (anterior && ['id','activityId','taskId','date','durationMinutes','progress','note','dayComplete'].some(key=>(anterior[key] ?? null)!==(registro[key] ?? null))) throw new Error('La sesión pendiente ya tiene otros datos.');
        if (!anterior) {
            pendientes.push(structuredClone(registro));
            respaldar();
        }
        return enviar();
    }
    function pendientesActuales() { cargar(); return structuredClone(pendientes); }
    function selectorPomodoro() {
        let selector=document.getElementById('pomo-planner-task');
        if (!selector) {
            const contenedor=document.getElementById('pomodoro-card-content');
            if (!contenedor) return;
            const label=document.createElement('label');
            label.textContent='Sesión del planificador';
            selector=document.createElement('select');
            selector.id='pomo-planner-task';
            selector.className='ep-inp';
            label.appendChild(selector);
            contenedor.prepend(label);
        }
        const anterior=selector.value;
        selector.replaceChildren(new Option('Sin tarea asignada',''));
        const plan=State.get('planificador');
        for (const [fecha,tareas] of Object.entries(plan?.schedule || {})) {
            for (const tarea of tareas.filter(t=>t.status==='pending' && t.activityId)) {
                const opcion=new Option(fecha+' · '+tarea.asigNombre+' · '+tarea.temaNombre,tarea.idTarea);
                opcion.dataset.activityId=tarea.activityId;
                selector.appendChild(opcion);
            }
        }
        selector.value=anterior;
        selector.disabled=!!State.get('isRunning');
    }
    function contextoPomodoro() {
        const selector=document.getElementById('pomo-planner-task');
        const opcion=selector?.selectedOptions[0];
        const id=DataIO.nuevoId();
        return {id,sourceEventId:id,source:'pomodoro',date:Domain.getFechaHoy(),
            activityId:opcion?.dataset.activityId || null,taskId:selector?.value || null,
            progress:'partial',note:'',dayComplete:false};
    }
    let ultimaFecha=null;
    async function revisar(motivo, forzar=false) {
        const hoy=Domain.getFechaHoy();
        if (!forzar && ultimaFecha===hoy) return;
        if (Perfil.local.getItem('estudiador_planner_borrador')) return;
        const plan=await PlannerRepository.replanificar(hoy,motivo);
        ultimaFecha=hoy;
        if (plan) EventBus.emit('PLANNER_UPDATED',{plan});
        if (plan?.replanNotice) Toast.show('Revisa la propuesta del planificador. '+plan.replanNotice,'warning');
    }
    function iniciar() {
        try {
            cargar();
            if (pendientes.length) enviar().catch(error=>Toast.show('Hay sesiones pendientes de guardar. '+error.message,'error'));
        } catch(error) { Toast.show(error.message,'error'); }
        revisar('Apertura de la aplicación').catch(error=>Toast.show(error.message,'error'));
        setInterval(()=>{ if (!document.hidden) revisar('Cambio de día').catch(error=>Toast.show(error.message,'error')); },60000);
        document.addEventListener('visibilitychange',()=>{
            if (!document.hidden) revisar('Reanudación de la aplicación').catch(error=>Toast.show(error.message,'error'));
        });
    }
    EventBus.on('pomodoro:finished', payload => {
        if (!payload.plannerSession || payload.plannerSession.durationMinutes <= 0) return;
        registrar(payload.plannerSession).catch(error=>Toast.show('Sesión pendiente de guardar. Abre Registros para reintentar. '+error.message,'error'));
    });
    return {registrar,enviar,pendientesActuales,selectorPomodoro,contextoPomodoro,iniciar,revisar};
})();
