const UIPlannerSessions = (() => {
    const esc = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function render(main,plan,actualizar) {
        const opciones=(plan.activities || []).filter(a=>!a.archived).map(a=>{
            const asig=plan.asignaturasPlanificadas.find(s=>s.id===a.subjectId);
            return '<option value="'+esc(a.id)+'">'+esc(asig?.nombre+' · '+asig?.temas.find(t=>t.id===a.topicId)?.nombre+' · '+(plan.studyTypes.find(t=>t.id===a.type)?.name || a.type))+'</option>';
        }).join('');
        const pendientes=PlannerTracking.pendientesActuales();
        const senales=PlannerEstimator.retencion(plan,State.get('biblioteca') || {});
        main.innerHTML=`<div class="ep-academic">
            <h2>Trabajo realizado</h2>
            <p>Registra la duración real y el progreso de la actividad. Completar una actividad acredita su trabajo estimado; el dominio académico requiere evidencia adicional.</p>
            <form id="ep-session-form" class="ep-card">
                <label>Fecha<input class="ep-inp" name="date" type="date" value="${Domain.getFechaHoy()}" max="${Domain.getFechaHoy()}" required></label>
                <label>Actividad<select class="ep-inp" name="activity"><option value="">Sin actividad asignada</option>${opciones}</select></label>
                <label>Minutos reales<input class="ep-inp" name="minutes" type="number" min="0.1" max="1440" step="0.1" required></label>
                <label>Progreso<select class="ep-inp" name="progress"><option value="partial">Trabajo parcial</option><option value="complete">Actividad completada</option><option value="none">Tiempo sin avance acreditado</option></select></label>
                <label>Notas<input class="ep-inp" name="note"></label>
                <label><input name="dayComplete" type="checkbox">He registrado todo el estudio de ese día (permite compararlo con mi disponibilidad)</label>
                <button class="ep-btn acc" type="submit">Guardar sesión externa</button>
                <p id="ep-session-error" role="alert"></p>
            </form>
            <p>${pendientes.length} sesiones pendientes de guardar.</p><button class="ep-btn" id="ep-session-retry">Reintentar sesiones pendientes</button>
            <h3>Historial de sesiones</h3>
            ${(plan.observations || []).map(o=>`<p>${esc(o.date)} · ${o.durationMinutes} min · ${esc(o.source)} · ${esc(o.progress)} · ${esc(plan.activities.find(a=>a.id===o.activityId)?.id || 'Sin actividad')} · ${esc(o.note)}</p>`).join('') || '<p>Todavía no hay sesiones registradas.</p>'}
            <h3>Señales de retención</h3><p>Las tarjetas repasadas son evidencia parcial de retención. La duración del trabajo y las notas objetivo se mantienen independientes.</p>
            ${senales.map(s=>`<p>${esc(s.name)} · ${s.reviewedCards} tarjetas con historial FSRS de ${s.linkedCards} vinculadas.</p>`).join('') || '<p>Importa temas con tarjetas identificadas para consultar sus señales.</p>'}
            ${plan.lastReplan ? `<h3>Última replanificación</h3><p>${esc(plan.lastReplan.date)} · ${esc(plan.lastReplan.reason)} · ${plan.lastReplan.added.length} sesiones añadidas y ${plan.lastReplan.removed.length} retiradas y ${plan.lastReplan.changed?.length || 0} modificadas.</p>` : ''}
        </div>`;
        const form=main.querySelector('form');
        let registro=null;
        form.onsubmit=async event=>{
            event.preventDefault();
            const button=form.querySelector('button');
            button.disabled=true;
            try {
                if (!registro) {
                    const id=DataIO.nuevoId();
                    registro=PlannerObservations.validar(plan,{id,sourceEventId:id,source:'manual',
                        date:form.elements.date.value,activityId:form.elements.activity.value || null,
                        durationMinutes:Number(form.elements.minutes.value),progress:form.elements.progress.value,
                        note:form.elements.note.value,dayComplete:form.elements.dayComplete.checked});
                }
                await PlannerTracking.registrar(registro);
                await actualizar();
            } catch(error) { form.querySelector('#ep-session-error').textContent=error.message; }
            finally { button.disabled=false; }
        };
        main.querySelector('#ep-session-retry').onclick=async()=>{
            try { await PlannerTracking.enviar(); await actualizar(); }
            catch(error) { form.querySelector('#ep-session-error').textContent=error.message; }
        };
    }
    return {render};
})();
