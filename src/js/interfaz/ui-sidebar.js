// ════════════════════════════════════════════════════════════════
// UI-SIDEBAR.JS — Sidebar, menú lateral, proyectos, PDF, colores
// ════════════════════════════════════════════════════════════════

const UISidebar = (() => {

    function obtenerEstructuraBiblioteca() {
        const bib = State.get('biblioteca') || {};
        const config = State.get('bibliotecaConfig') || { carpetas: {}, archivadas: [] };
        
        return { bib, config };
    }

    function guardarConfigBiblioteca(config) {
        State.set('bibliotecaConfig', config);
        // Guardar también en localStorage como respaldo
        localStorage.setItem('estudiador_biblioteca_config', JSON.stringify(config));
        if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
    }

    // Función pública para obtener tarjetas de una asignatura (incluyendo carpetas)
    function obtenerTarjetasPorAsignatura(nombreAsignatura) {
        const { bib } = obtenerEstructuraBiblioteca();
        if (!bib[nombreAsignatura]) return [];
        return bib[nombreAsignatura];
    }

    function renderizarArbolAsignaturas(bib, config, asigActual) {
        const lista = document.getElementById('lista-asignaturas');
        if (!lista) return;

        lista.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const { carpetas, archivadas } = config;
        const archivadasSet = new Set(archivadas || []);
        
        // Separar asignaturas activas y archivadas
        const asignaturasActivas = [];
        const asignaturasArchivadas = [];

        Object.keys(bib).forEach(nombre => {
            if (archivadasSet.has(nombre)) {
                asignaturasArchivadas.push(nombre);
            } else {
                asignaturasActivas.push(nombre);
            }
        });

        // Renderizar carpetas con sus asignaturas
        if (carpetas && Object.keys(carpetas).length > 0) {
            Object.entries(carpetas).forEach(([nombreCarpeta, asignaturasEnCarpeta]) => {
                const carpetaLi = document.createElement('li');
                carpetaLi.className = 'carpeta-item';
                
                const asignaturasFiltradas = asignaturasActivas.filter(a => asignaturasEnCarpeta.includes(a));
                const tieneContenido = asignaturasFiltradas.length > 0;
                
                carpetaLi.innerHTML = `
                    <div class="carpeta-header" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;">
                        <i class="fa-solid fa-folder folder-icon" style="color:var(--text-subtle);"></i>
                        <span style="font-weight:bold;color:var(--text-primary);">${escapeHtml(nombreCarpeta)}</span>
                        <span style="font-size:0.75em;color:var(--text-subtle);">(${asignaturasFiltradas.length})</span>
                        <div style="margin-left:auto;display:flex;gap:4px;">
                            <button class="btn-mini" data-action="editarCarpeta" data-carpeta="${escapeHtml(nombreCarpeta)}" title="Editar carpeta"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="btn-mini" data-action="borrarCarpeta" data-carpeta="${escapeHtml(nombreCarpeta)}" title="Eliminar carpeta"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <ul class="carpeta-content" style="list-style:none;padding-left:20px;margin:0;${tieneContenido ? '' : 'display:none;'}">
                        ${asignaturasFiltradas.map(nombre => crearItemAsignaturaHTML(nombre, asigActual)).join('')}
                    </ul>
                `;
                
                const header = carpetaLi.querySelector('.carpeta-header');
                const content = carpetaLi.querySelector('.carpeta-content');
                
                header.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    const icon = header.querySelector('.folder-icon');
                    if (content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        content.style.display = 'block';
                        icon.classList.replace('fa-folder', 'fa-folder-open');
                    } else {
                        content.classList.add('collapsed');
                        setTimeout(() => {
                            if (content.classList.contains('collapsed')) {
                                content.style.display = 'none';
                            }
                        }, 400);
                        icon.classList.replace('fa-folder-open', 'fa-folder');
                    }
                });
                
                // Inicializar estado collapsed si no tiene contenido
                if (!tieneContenido) {
                    content.classList.add('collapsed');
                }
                
                fragment.appendChild(carpetaLi);
            });
        }

        // Renderizar asignaturas sin carpeta (activas)
        const asignaturasSinCarpeta = asignaturasActivas.filter(a => {
            return !Object.values(carpetas || {}).some(arr => arr.includes(a));
        });

        if (asignaturasSinCarpeta.length > 0) {
            asignaturasSinCarpeta.forEach(nombre => {
                const li = crearItemAsignatura(nombre, asigActual);
                fragment.appendChild(li);
            });
        }

        // Separador para archivadas
        if (asignaturasArchivadas.length > 0) {
            const separador = document.createElement('li');
            separador.className = 'separador-archivadas';
            separador.innerHTML = `<span><i class="fa-solid fa-box-archive" style="margin-right:6px;"></i>ARCHIVADAS (${asignaturasArchivadas.length})</span>`;
            fragment.appendChild(separador);

            asignaturasArchivadas.forEach(nombre => {
                const li = crearItemAsignatura(nombre, asigActual, true);
                fragment.appendChild(li);
            });
        }

        lista.appendChild(fragment);
    }

    function crearItemAsignatura(nombre, asigActual, isArchived = false) {
        const li = document.createElement('li');
        li.className = 'asig-item' + (nombre === asigActual ? ' active' : '');
        li.style.setProperty('--dynamic-color', getColorAsignatura(nombre));
        if (isArchived) li.style.opacity = '0.6';
        
        const archivedIcon = isArchived 
            ? '<i class="fa-solid fa-box-archive" style="color:var(--text-subtle);"></i>' 
            : '';
        
        li.innerHTML = `
            <span style="flex-grow:1;display:flex;align-items:center;gap:8px;">${archivedIcon}${escapeHtml(nombre)}</span>
            <div class="asig-actions">
                <button class="btn-mini" data-action="renombrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Renombrar"><i class="fa-regular fa-pen-to-square"></i></button>
                <button class="btn-mini" data-action="${isArchived ? 'desarchivarAsignatura' : 'archivarAsignatura'}" data-nombre="${escapeHtml(nombre)}" title="${isArchived ? 'Desarchivar' : 'Archivar'}">
                    <i class="fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'}"></i>
                </button>
                <button class="btn-mini" data-action="organizarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Organizar en carpeta"><i class="fa-solid fa-folder-plus"></i></button>
                <button class="btn-mini" data-action="borrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Borrar"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        
        li.onclick = (e) => { 
            if (e.target.closest('.asig-actions')) return;
            if (typeof cargarAsignatura === 'function') cargarAsignatura(nombre); 
        };
        return li;
    }

    function crearItemAsignaturaHTML(nombre, asigActual, isArchived = false) {
        const color = getColorAsignatura(nombre);
        const archivedStyle = isArchived ? 'opacity:0.6;' : '';
        const archivedIcon = isArchived 
            ? '<i class="fa-solid fa-box-archive" style="color:var(--text-subtle);"></i>' 
            : '';
        
        return `
            <li class="asig-item${nombre === asigActual ? ' active' : ''}" 
                style="--dynamic-color:${color};${archivedStyle}">
                <span style="flex-grow:1;display:flex;align-items:center;gap:8px;">${archivedIcon}${escapeHtml(nombre)}</span>
                <div class="asig-actions">
                    <button class="btn-mini" data-action="renombrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Renombrar"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="btn-mini" data-action="${isArchived ? 'desarchivarAsignatura' : 'archivarAsignatura'}" data-nombre="${escapeHtml(nombre)}" title="${isArchived ? 'Desarchivar' : 'Archivar'}">
                        <i class="fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'}"></i>
                    </button>
                    <button class="btn-mini" data-action="organizarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Organizar en carpeta"><i class="fa-solid fa-folder-plus"></i></button>
                    <button class="btn-mini" data-action="borrarAsignatura" data-nombre="${escapeHtml(nombre)}" title="Borrar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </li>
        `;
    }

    function actualizarMenuLateral(bib, asigActual) {
        const { bib: bibData, config } = obtenerEstructuraBiblioteca();
        renderizarArbolAsignaturas(bibData, config, asigActual);
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

    // Funciones de gestión de carpetas y archivado
    function crearCarpeta() {
        const nombre = prompt("Nombre de la carpeta (ej: 'Tercer año', 'Idiomas'):");
        if (!nombre || nombre.trim() === "") return;
        
        const { config } = obtenerEstructuraBiblioteca();
        if (config.carpetas[nombre]) {
            alert("Ya existe una carpeta con ese nombre.");
            return;
        }
        
        config.carpetas[nombre] = [];
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    function editarCarpeta(nombreAntiguo) {
        const nuevoNombre = prompt("Nuevo nombre para la carpeta:", nombreAntiguo);
        if (!nuevoNombre || nuevoNombre.trim() === "" || nuevoNombre === nombreAntiguo) return;
        
        const { config } = obtenerEstructuraBiblioteca();
        if (config.carpetas[nuevoNombre]) {
            alert("Ya existe una carpeta con ese nombre.");
            return;
        }
        
        config.carpetas[nuevoNombre] = config.carpetas[nombreAntiguo];
        delete config.carpetas[nombreAntiguo];
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    function borrarCarpeta(nombreCarpeta) {
        if (!confirm(`¿Eliminar carpeta "${nombreCarpeta}"? Las asignaturas dentro no se eliminarán, quedarán sin carpeta.`)) return;
        
        const { config } = obtenerEstructuraBiblioteca();
        delete config.carpetas[nombreCarpeta];
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    function archivarAsignatura(nombre) {
        const { config } = obtenerEstructuraBiblioteca();
        
        // Remover de todas las carpetas
        Object.keys(config.carpetas).forEach(carpeta => {
            config.carpetas[carpeta] = config.carpetas[carpeta].filter(a => a !== nombre);
            // Limpiar carpetas vacías opcionalmente
            if (config.carpetas[carpeta].length === 0) {
                // delete config.carpetas[carpeta]; // Opcional: mantener carpetas vacías
            }
        });
        
        if (!config.archivadas.includes(nombre)) {
            config.archivadas.push(nombre);
        }
        
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    function desarchivarAsignatura(nombre) {
        const { config } = obtenerEstructuraBiblioteca();
        config.archivadas = config.archivadas.filter(a => a !== nombre);
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    function organizarAsignatura(nombre) {
        const { bib, config } = obtenerEstructuraBiblioteca();
        const carpetasExistentes = Object.keys(config.carpetas);
        
        if (carpetasExistentes.length === 0) {
            const crearNueva = confirm("No hay carpetas creadas. ¿Quieres crear una nueva ahora?");
            if (crearNueva) {
                crearCarpeta();
                // Después de crear, volver a organizar
                setTimeout(() => organizarAsignatura(nombre), 100);
            }
            return;
        }
        
        let menu = "Selecciona carpeta para '" + nombre + "':\n\n";
        menu += "0. Sin carpeta\n";
        carpetasExistentes.forEach((c, i) => {
            menu += `${i + 1}. ${c}\n`;
        });
        
        const resp = prompt(menu, "0");
        const idx = parseInt(resp);
        
        if (isNaN(idx) || idx < 0 || idx > carpetasExistentes.length) return;
        
        // Remover de todas las carpetas primero
        Object.keys(config.carpetas).forEach(carpeta => {
            config.carpetas[carpeta] = config.carpetas[carpeta].filter(a => a !== nombre);
        });
        
        // También quitar de archivadas si estaba
        config.archivadas = config.archivadas.filter(a => a !== nombre);
        
        // Añadir a la carpeta seleccionada
        if (idx > 0) {
            const carpetaSeleccionada = carpetasExistentes[idx - 1];
            if (!config.carpetas[carpetaSeleccionada].includes(nombre)) {
                config.carpetas[carpetaSeleccionada].push(nombre);
            }
        }
        
        guardarConfigBiblioteca(config);
        actualizarMenuLateral();
    }

    return {
        actualizarMenuLateral,
        actualizarListaProyectos,
        renderRecursos,
        aplicarColorAsignaturaActiva,
        crearCarpeta,
        editarCarpeta,
        borrarCarpeta,
        archivarAsignatura,
        desarchivarAsignatura,
        organizarAsignatura,
        obtenerTarjetasPorAsignatura,
    };
})();
