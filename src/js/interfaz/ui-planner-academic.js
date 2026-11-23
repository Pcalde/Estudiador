const UIPlannerAcademic = (() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function render(main, original, guardar) {
        const plan = PlannerModel.migrar(original);
        const biblioteca = State.get('biblioteca') || {};
        const opciones = (items, seleccionado) => items.map(([id,nombre]) => `<option value="${esc(id)}" ${id===seleccionado?'selected':''}>${esc(nombre)}</option>`).join('');
        const niveles = valor => opciones([['','No sé'],...[1,2,3,4,5].map(n=>[String(n),String(n)])],valor==null?'':String(valor));
        main.innerHTML = `<div class="ep-academic">
            <h2>Planificación académica</h2>
            <p>Los objetivos de nota y dominio se guardan como referencia personal. El reparto utiliza las estimaciones de minutos y las restricciones configuradas. Cambiar un objetivo conserva el esfuerzo y la distribución; para ajustarlos, edita las actividades.</p>
            <section class="ep-card"><h3>Importar temario</h3>
                <label>Biblioteca<select class="ep-inp" id="ep-import-library">${opciones(Object.keys(biblioteca).map(k=>[k,k]))}</select></label>
                <label>Destino<select class="ep-inp" id="ep-import-subject"><option value="">Crear o reutilizar asignatura importada</option>${opciones(plan.asignaturasPlanificadas.map(a=>[a.id,a.nombre]))}</select></label>
                <button class="ep-btn" id="ep-import-topics">Importar temas</button>
                <p>Los temas nuevos necesitan una estimación. Reimportar conserva las ediciones y la trazabilidad de tarjetas.</p>
            </section>
            <form id="ep-academic-form">
            <section class="ep-card"><h3>Objetivos por evaluación</h3>
                <label>Asignatura de nueva evaluación<select class="ep-inp" id="ep-new-exam-subject">${opciones(plan.asignaturasPlanificadas.map(a=>[a.id,a.nombre]))}</select></label>
                <label>Fecha<input class="ep-inp" id="ep-new-exam-date" type="date"></label>
                <button type="button" class="ep-btn" id="ep-new-exam">Añadir evaluación</button>
            ${plan.examenes.map((e,i)=>`<fieldset data-exam="${i}"><legend>${esc(e.asigNombre || plan.asignaturasPlanificadas.find(a=>a.id===e.asigId)?.nombre)} · ${esc(e.fecha)}</legend>
                <label>Objetivo<select name="goalType" class="ep-inp">${opciones([['grade','Nota (0–10)'],['mastery','Dominio (0–100 %)'],['mixed','Mixto (nota y dominio)']],e.goal.type)}</select></label>
                <label>Valor objetivo<input class="ep-inp" name="goalTarget" type="number" min="0" max="100" step="0.1" value="${e.goal.target}" required></label>
                <label>Dominio para objetivo mixto (%)<input class="ep-inp" name="masteryTarget" type="number" min="0" max="100" value="${e.goal.masteryTarget ?? 100}"></label>
            </fieldset>`).join('')}
            </section>
            <section class="ep-card"><h3>Temas</h3>
            ${plan.asignaturasPlanificadas.map((a,ai)=>(a.temas || []).map((t,ti)=>`<fieldset data-subject="${ai}" data-topic="${ti}"><legend>${esc(a.nombre)} · ${esc(t.nombre)}</legend>
                <label>Nombre<input class="ep-inp" name="topicName" value="${esc(t.nombre)}" required></label>
                <label>Dificultad (1–5)<select class="ep-inp" name="difficulty">${niveles(t.difficulty)}</select></label>
                <label>Extensión relativa (1–5)<select class="ep-inp" name="extension">${niveles(t.extension)}</select></label>
                <label>Nivel actual (1–5)<select class="ep-inp" name="currentLevel">${niveles(t.currentLevel)}</select></label>
            </fieldset>`).join('')).join('')}
            </section>
            <section class="ep-card"><h3>Actividades y preparación compartida</h3>
                <p>Una actividad vinculada a varias evaluaciones se programa una sola vez. Añade actividades de repaso independientes cuando corresponda. El orden de dependencias se respeta antes de generar sesiones.</p>
                ${plan.activities.filter(a=>!a.archived).map(a=>`<fieldset data-activity="${esc(a.id)}"><legend>${esc(plan.asignaturasPlanificadas.find(s=>s.id===a.subjectId)?.nombre)} · ${esc(plan.asignaturasPlanificadas.find(s=>s.id===a.subjectId)?.temas.find(t=>t.id===a.topicId)?.nombre || a.id)}</legend>
                    <label>Tipo<select class="ep-inp" name="activityType">${opciones(plan.studyTypes.map(t=>[t.id,t.name]),a.type)}</select></label>
                    <label>Estimación total (minutos, vacío si desconocida)<input class="ep-inp" name="minutes" type="number" min="0" step="1" value="${a.estimateMinutes ?? ''}"></label>
                    <label>Evaluaciones<select class="ep-inp" name="assessments" multiple>${plan.examenes.filter(e=>e.asigId===a.subjectId).map(e=>`<option value="${esc(e.id)}" ${a.assessmentIds.includes(e.id)?'selected':''}>${esc(e.fecha + ' · ' + (e.nombre || e.id))}</option>`).join('')}</select></label>
                    <label>Depende de<select class="ep-inp" name="dependencies" multiple>${plan.activities.filter(b=>b.id!==a.id && !b.archived).map(b=>`<option value="${esc(b.id)}" ${a.dependsOn.includes(b.id)?'selected':''}>${esc(plan.asignaturasPlanificadas.find(s=>s.id===b.subjectId)?.temas.find(t=>t.id===b.topicId)?.nombre || b.id)} · ${esc(plan.studyTypes.find(t=>t.id===b.type)?.name || b.type)}</option>`).join('')}</select></label>
                    <label>Días de separación tras dependencias<input class="ep-inp" name="gap" type="number" min="0" max="365" value="${a.minGapDays}"></label>
                </fieldset>`).join('')}
                <label>Tema para una actividad nueva<select id="ep-new-activity-topic" class="ep-inp">${plan.asignaturasPlanificadas.flatMap(a=>(a.temas || []).map(t=>`<option value="${esc(JSON.stringify([a.id,t.id]))}">${esc(a.nombre+' · '+t.nombre)}</option>`)).join('')}</select></label>
                <button type="button" class="ep-btn" id="ep-add-activity">Añadir actividad</button>
            </section>
            <section class="ep-card"><h3>Disponibilidad semanal en minutos</h3>
                <p>Dejar ambos valores vacíos conserva la capacidad de curso, temporada o fin de semana. Las excepciones del asistente prevalecen. Las vísperas, exámenes y días bloqueados tienen capacidad cero.</p>
                ${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((dia,i)=>`<fieldset data-weekday="${i}"><legend>${dia}</legend>
                    <label>Objetivo<input class="ep-inp" name="target" type="number" min="0" max="1440" value="${plan.availability.weekly[i]?.targetMinutes ?? ''}"></label>
                    <label>Máximo<input class="ep-inp" name="max" type="number" min="0" max="1440" value="${plan.availability.weekly[i]?.maxMinutes ?? ''}"></label>
                </fieldset>`).join('')}
                <label>Reserva orientativa (%)<input class="ep-inp" name="reserve" type="number" min="0" max="80" value="${plan.preferences.reserveFraction*100}"></label>
            </section>
            <p id="ep-academic-error" role="alert"></p>
            <button class="ep-btn acc" type="submit">Guardar configuración académica</button>
            </form>
        </div>`;
        const form = main.querySelector('form');
        const error = e => { main.querySelector('#ep-academic-error').textContent = e.message; };
        function recoger() {
            const draft = structuredClone(plan);
            for (const field of form.querySelectorAll('[data-exam]')) {
                const goal = {type:field.querySelector('[name=goalType]').value,target:Number(field.querySelector('[name=goalTarget]').value)};
                if (goal.type==='mixed') goal.masteryTarget=Number(field.querySelector('[name=masteryTarget]').value);
                draft.examenes[Number(field.dataset.exam)].goal=goal;
            }
            for (const field of form.querySelectorAll('[data-topic]')) {
                const tema = draft.asignaturasPlanificadas[Number(field.dataset.subject)].temas[Number(field.dataset.topic)];
                tema.nombre=field.querySelector('[name=topicName]').value.trim();
                for (const key of ['difficulty','extension','currentLevel']) {
                    const value=field.querySelector('[name='+key+']').value;
                    tema[key]=value===''?null:Number(value);
                }
            }
            for (const field of form.querySelectorAll('[data-activity]')) {
                const a=draft.activities.find(a=>a.id===field.dataset.activity);
                const valor=field.querySelector('[name=minutes]').value;
                a.estimateMinutes=valor===''?null:Number(valor);
                a.source='manual';
                a.type=field.querySelector('[name=activityType]').value;
                a.assessmentIds=Array.from(field.querySelector('[name=assessments]').selectedOptions,o=>o.value);
                a.dependsOn=Array.from(field.querySelector('[name=dependencies]').selectedOptions,o=>o.value);
                a.minGapDays=Number(field.querySelector('[name=gap]').value);
            }
            for (const field of form.querySelectorAll('[data-weekday]')) {
                const target=field.querySelector('[name=target]').value, max=field.querySelector('[name=max]').value;
                if (target==='' && max==='') delete draft.availability.weekly[field.dataset.weekday];
                else {
                    if (target==='' || max==='') throw new Error('Completa objetivo y máximo del día.');
                    draft.availability.weekly[field.dataset.weekday]={targetMinutes:Number(target),maxMinutes:Number(max)};
                }
            }
            draft.preferences.reserveFraction=Number(form.querySelector('[name=reserve]').value)/100;
            return PlannerModel.migrar(draft);
        }
        form.onsubmit=async event=>{
            event.preventDefault();
            try { await guardar(recoger(),'Configuración académica guardada.'); } catch(e) { error(e); }
        };
        main.querySelector('#ep-new-exam').onclick=()=>{
            try {
                const draft=recoger();
                const asig=draft.asignaturasPlanificadas.find(a=>a.id===main.querySelector('#ep-new-exam-subject').value);
                if (!asig) throw new Error('Selecciona asignatura.');
                draft.examenes.push({id:DataIO.nuevoId(),asigId:asig.id,asigNombre:asig.nombre,color:asig.color,
                    fecha:main.querySelector('#ep-new-exam-date').value,goal:{type:'mastery',target:100}});
                render(main,PlannerModel.migrar(draft),guardar);
            } catch(e) { error(e); }
        };
        main.querySelector('#ep-add-activity').onclick=()=>{
            try {
                const draft=recoger();
                const [subjectId,topicId]=JSON.parse(main.querySelector('#ep-new-activity-topic').value);
                draft.activities.push({id:DataIO.nuevoId(),subjectId,topicId,type:'st_rev',assessmentIds:[],estimateMinutes:null,dependsOn:[],source:'manual',minGapDays:1});
                render(main,draft,guardar);
            } catch(e) { error(e); }
        };
        main.querySelector('#ep-import-topics').onclick=async()=>{
            try {
                const draft=PlannerImport.desdeBiblioteca(recoger(),biblioteca,main.querySelector('#ep-import-library').value,main.querySelector('#ep-import-subject').value);
                await guardar(draft,'Temas importados. Revisa sus estimaciones.');
            } catch(e) { error(e); }
        };
    }
    return {render};
})();
