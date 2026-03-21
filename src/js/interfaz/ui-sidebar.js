// ════════════════════════════════════════════════════════════════
// UI-SIDEBAR.JS — Sidebar, menú lateral, proyectos, PDF, colores
// ════════════════════════════════════════════════════════════════

const UISidebar = (() => {

    function actualizarMenuLateral(bib, asigActual) {
        const lista = document.getElementById('lista-asignaturas');
        if (!lista) return;

        lista.innerHTML = '';
        const fragment = document.createDocumentFragment();

        Object.keys(bib).forEach(nombre => {
            const li = document.createElement('li');
            li.className = 'asig-item';
            li.style.setProperty('--dynamic-color', getColorAsignatura(nombre));
            if (nombre === asigActual) li.classList.add('active');

            li.innerHTML = `
                <span style="flex-grow:1;display:flex;align-items:center;gap:8px;">${escapeHtml(nombre)}</span>
                <div class="asig-actions">
                    <button class="btn-mini" data-action="renombrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Renombrar"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="btn-mini" data-action="borrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Borrar">✕</button>
                </div>`;
            li.onclick = () => { if (typeof cargarAsignatura === 'function') cargarAsignatura(nombre); };
            fragment.appendChild(li);
        });

        lista.appendChild(fragment);
    }

    function actualizarListaProyectos(projects) {
        const l   = document.getElementById('lista-proyectos');
        const sel = document.getElementById('new-task-project');
        if (!l || !sel) return;

        l.innerHTML   = '';
        sel.innerHTML = '<option value="">Sin proyecto (General)</option>';

        const fragmentL   = document.createDocumentFragment();
        const fragmentSel = document.createDocumentFragment();

        projects.forEach((p, i) => {
            const pNombre = typeof p === 'string' ? p : p.nombre;
            const pAsig   = (typeof p === 'object' && p.asignatura) ? p.asignatura : '';
            const color   = pAsig ? window.getColorAsignatura(pAsig) : window.getColorAsignatura(pNombre);

            const li = document.createElement('li');
            li.className = 'asig-item';
            li.style.setProperty('--dynamic-color', color);
            li.innerHTML = `
                <span style="font-size:0.9em;">
                    ${escapeHtml(pNombre)}
                    <i style="color:var(--text-subtle);font-size:0.8em;">${pAsig ? '[' + escapeHtml(pAsig) + ']' : ''}</i>
                </span>
                <div class="asig-actions">
                    <button class="btn-mini" data-action="borrarProyecto" data-idx="${i}">✕</button>
                </div>`;
            fragmentL.appendChild(li);

            const valorGuardado = pAsig ? `${pNombre} : ${pAsig}` : pNombre;
            const textoVisible  = pAsig ? `${pNombre} (de ${pAsig})` : pNombre;
            const opt           = document.createElement('option');
            opt.value           = valorGuardado;
            opt.textContent     = textoVisible;
            fragmentSel.appendChild(opt);
        });

        l.appendChild(fragmentL);
        sel.appendChild(fragmentSel);
    }

    function renderRecursos(asigActual, recursos, slots) {
        const contenedor = document.getElementById('lista-recursos-slots');
        if (!contenedor) return;
        contenedor.innerHTML = '';
        if (!asigActual) return;

        const lista = recursos[asigActual] || [];
        if (lista.length === 0) {
            contenedor.innerHTML = "<span style='font-size:0.8em;color:var(--text-subtle);font-style:italic;'>Sin libros. Añade uno a la derecha.</span>";
            return;
        }

        lista.forEach((nombreLibro, index) => {
            const key      = `${asigActual}_${index}`;
            const isLoaded = !!slots[key];
            const div      = document.createElement('div');
            div.className  = `slot-chip${isLoaded ? ' loaded' : ''}`;
            div.title      = isLoaded ? 'Ver libro' : 'Haga clic para cargar el archivo PDF';
            div.onclick    = () => { if (typeof window.clickEnSlot === 'function') window.clickEnSlot(index); };

            const safeNombre = escapeHtml(nombreLibro);
            div.innerHTML = `
                <span>${isLoaded ? '📖' : '📥'} ${safeNombre}</span>
                <button class="slot-del-btn" data-action="borrarSlot" data-idx="${index}" title="Olvidar referencia">✕</button>`;
            contenedor.appendChild(div);
        });
    }

    function aplicarColorAsignaturaActiva(color) {
        const hBar   = document.getElementById('pdf-header-bar');
        const modPdf = document.getElementById('modulo-pdf');
        if (hBar)   { hBar.style.background = color; hBar.style.borderColor = color; }
        if (modPdf) modPdf.style.setProperty('--dynamic-color', color);
    }

    return {
        actualizarMenuLateral,
        actualizarListaProyectos,
        renderRecursos,
        aplicarColorAsignaturaActiva,
    };
})();
