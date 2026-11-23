// ════════════════════════════════════════════════════════════════
// UI-SIDEBAR.JS — Sidebar, menú lateral, proyectos, PDF, colores
// ════════════════════════════════════════════════════════════════

const UISidebar = (() => {

    const estadosCarpeta = new Map();

    function habilitarArrastre(tirador, fila, nombre) {
        let inicio = null;
        let destino = null;
        let arrastrando = false;

        function actualizarDestino(event) {
            destino?.classList.remove('sidebar-drop-active');
            destino = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-sidebar-drop]');
            destino?.classList.add('sidebar-drop-active');
        }

        tirador.addEventListener('pointerdown', event => {
            if (inicio || event.button !== 0 || !event.isPrimary) return;
            inicio = { id: event.pointerId, x: event.clientX, y: event.clientY };
            tirador.setPointerCapture(event.pointerId);
        });

        tirador.addEventListener('pointermove', event => {
            if (inicio?.id !== event.pointerId) return;
            if (!arrastrando && Math.hypot(event.clientX - inicio.x, event.clientY - inicio.y) < 6) return;
            arrastrando = true;
            fila.classList.add('sidebar-dragging');
            actualizarDestino(event);
        });

        function finalizar(event) {
            if (inicio?.id !== event.pointerId) return;
            if (arrastrando && event.type === 'pointerup') actualizarDestino(event);
            const carpeta = event.type === 'pointerup' ? destino?.dataset.sidebarDrop : undefined;
            destino?.classList.remove('sidebar-drop-active');
            fila.classList.remove('sidebar-dragging');
            inicio = destino = null;
            arrastrando = false;
            if (carpeta === undefined) return;

            const { bib, config } = obtenerEstructuraBiblioteca();
            if (!Object.hasOwn(bib, nombre) || (carpeta && !Object.hasOwn(config.carpetas, carpeta))) return;
            moverAsignatura(config, nombre, carpeta);
            guardarConfigBiblioteca(config);
            actualizarMenuLateral();
        }

        tirador.addEventListener('pointerup', finalizar);
        tirador.addEventListener('pointercancel', finalizar);
        tirador.addEventListener('lostpointercapture', finalizar);
    }

    function obtenerEstructuraBiblioteca() {
        const bib = State.get('biblioteca') || {};
        const config = State.get('bibliotecaConfig') || { carpetas: {}, archivadas: [] };
        
        return { bib, config };
    }

    function guardarConfigBiblioteca(config) {
        State.set('bibliotecaConfig', config);
        // Guardar también en Perfil.local como respaldo
        Perfil.local.setItem('estudiador_biblioteca_config', JSON.stringify(config));
        if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
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
                carpetaLi.dataset.sidebarDrop = nombreCarpeta;
                
                const asignaturasFiltradas = asignaturasActivas.filter(a => asignaturasEnCarpeta.includes(a));
                carpetaLi.innerHTML = `
                    <details class="sidebar-folder">
                        <summary title="${escapeHtml(nombreCarpeta)}">
                            <i class="fa-solid fa-folder" aria-hidden="true"></i>
                            <span class="sidebar-name">${escapeHtml(nombreCarpeta)}</span>
                            <span class="sidebar-count">${asignaturasFiltradas.length}</span>
                        </summary>
                        <ul class="carpeta-content"></ul>
                    </details>
                    <details class="sidebar-actions">
                        <summary aria-label="Opciones de ${escapeHtml(nombreCarpeta)}" title="Opciones de carpeta">
                        <span class="dots" aria-hidden="true">
                            <span></span><span></span><span></span>
                        </span>
                        </summary>
                        <button type="button" data-action="editarCarpeta" data-carpeta="${escapeHtml(nombreCarpeta)}">Renombrar</button>
                        <button type="button" data-action="borrarCarpeta" data-carpeta="${escapeHtml(nombreCarpeta)}">Eliminar carpeta</button>
                    </details>`;

                const folder = carpetaLi.querySelector('.sidebar-folder');
                const content = carpetaLi.querySelector('.carpeta-content');
                folder.open = estadosCarpeta.get(nombreCarpeta) ?? asignaturasFiltradas.includes(asigActual);
                folder.addEventListener('toggle', () => {
                    if (folder.isConnected) estadosCarpeta.set(nombreCarpeta, folder.open);
                });
                asignaturasFiltradas.forEach(nombre => content.appendChild(crearItemAsignatura(nombre, asigActual)));
                if (!asignaturasFiltradas.length) {
                    const empty = document.createElement('li');
                    empty.className = 'sidebar-empty';
                    empty.textContent = 'Carpeta vac\u00eda';
                    content.appendChild(empty);
                }

                fragment.appendChild(carpetaLi);
            });
        }

        // Renderizar asignaturas sin carpeta (activas)
        const asignaturasSinCarpeta = asignaturasActivas.filter(a => {
            return !Object.values(carpetas || {}).some(arr => arr.includes(a));
        });

        if (Object.keys(carpetas || {}).length) {
            const destino = document.createElement('li');
            destino.className = 'sidebar-drop-target';
            destino.dataset.sidebarDrop = '';
            destino.textContent = 'Sin carpeta';
            fragment.appendChild(destino);
        }
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

        if (!fragment.childNodes.length) {
            const empty = document.createElement('li');
            empty.className = 'sidebar-empty';
            empty.textContent = 'A\u00fan no hay asignaturas';
            fragment.appendChild(empty);
        }
        lista.appendChild(fragment);
    }

    function crearItemAsignatura(nombre, asigActual, isArchived = false) {
        const li = document.createElement('li');
        li.className = 'asig-item' + (nombre === asigActual ? ' active' : '');
        li.style.setProperty('--dynamic-color', getColorAsignatura(nombre));
        if (isArchived) li.style.opacity = '0.6';
        
        const label = escapeHtml(nombre);
        li.innerHTML = `
            ${isArchived ? '' : '<span class="sidebar-drag-handle" title="Arrastrar a una carpeta" aria-hidden="true">&#8942;&#8942;</span>'}
            <button type="button" class="sidebar-subject" title="${label}" ${nombre === asigActual ? 'aria-current="true"' : ''}>${label}</button>
            <details class="sidebar-actions">
                <summary aria-label="Opciones de ${label}" title="Opciones de asignatura">
                <span class="dots" aria-hidden="true">
                    <span></span><span></span><span></span>
                </span>
                </summary>
                <button type="button" data-action="organizarAsignatura" data-nombre="${label}">Mover a carpeta</button>
                <button type="button" data-action="renombrarAsignatura" data-nombre="${label}">Renombrar</button>
                <button type="button" data-action="${isArchived ? 'desarchivarAsignatura' : 'archivarAsignatura'}" data-nombre="${label}">${isArchived ? 'Desarchivar' : 'Archivar'}</button>
                <button type="button" data-action="borrarAsignatura" data-nombre="${label}">Eliminar asignatura</button>
            </details>`;

        li.querySelector('.sidebar-subject').addEventListener('click', () => cargarAsignatura(nombre));
        const tirador = li.querySelector('.sidebar-drag-handle');
        if (tirador) {
            li.classList.add('sidebar-draggable');
            habilitarArrastre(tirador, li, nombre);
        }
        return li;
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

        if (!projects.length) {
            const empty = document.createElement('li');
            empty.className = 'sidebar-empty';
            empty.textContent = 'Sin proyectos';
            fragmentL.appendChild(empty);
        }
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
    function abrirFormularioCarpeta(titulo, etiqueta, campo, guardar, accionExtra) {
        const dialog = document.getElementById('sidebar-folder-dialog');
        const form = dialog.querySelector('form');
        const error = form.querySelector('[role="alert"]');
        form.querySelector('h2').textContent = titulo;
        form.querySelector('label').textContent = etiqueta;
        const anterior = form.querySelector('#sidebar-folder-field');
        campo.id = anterior.id;
        campo.setAttribute('autofocus', '');
        anterior.replaceWith(campo);
        error.textContent = '';
        const extra = form.querySelector('.sidebar-dialog-extra');
        extra.hidden = !accionExtra;
        extra.onclick = accionExtra ? () => { dialog.close(); accionExtra(); } : null;
        form.onsubmit = event => {
            event.preventDefault();
            const mensaje = guardar(campo.value);
            if (mensaje) {
                error.textContent = mensaje;
                campo.focus();
                return;
            }
            dialog.close();
            actualizarMenuLateral();
            document.getElementById('btn-crearcarpeta').focus();
        };
        dialog.showModal();
    }

    function editarCarpeta(nombreAntiguo = null, asignatura = null) {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 80;
        input.value = nombreAntiguo || '';
        input.placeholder = 'Ej. Idiomas';
        abrirFormularioCarpeta(nombreAntiguo ? 'Renombrar carpeta' : 'Nueva carpeta', 'Nombre', input, valor => {
            const nombre = valor.trim();
            if (!nombre) return 'Escribe un nombre para la carpeta.';
            if (nombre === nombreAntiguo) return;
            const { config } = obtenerEstructuraBiblioteca();
            if (Object.keys(config.carpetas).some(c => c !== nombreAntiguo && c.toLowerCase() === nombre.toLowerCase())) {
                return 'Ya existe una carpeta con ese nombre.';
            }
            const asignaturas = nombreAntiguo ? config.carpetas[nombreAntiguo] : [];
            config.carpetas = { ...config.carpetas, [nombre]: asignaturas };
            if (nombreAntiguo) delete config.carpetas[nombreAntiguo];
            estadosCarpeta.set(nombre, estadosCarpeta.get(nombreAntiguo) ?? true);
            estadosCarpeta.delete(nombreAntiguo);
            if (asignatura) moverAsignatura(config, asignatura, nombre);
            guardarConfigBiblioteca(config);
        });
    }

    function crearCarpeta() {
        editarCarpeta();
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

    function moverAsignatura(config, nombre, carpeta) {
        Object.keys(config.carpetas).forEach(c => {
            config.carpetas[c] = config.carpetas[c].filter(a => a !== nombre);
        });
        config.archivadas = config.archivadas.filter(a => a !== nombre);
        if (carpeta) {
            config.carpetas[carpeta].push(nombre);
            estadosCarpeta.set(carpeta, true);
        }
    }

    function organizarAsignatura(nombre) {
        const { config } = obtenerEstructuraBiblioteca();
        const select = document.createElement('select');
        select.add(new Option('Sin carpeta', ''));
        Object.entries(config.carpetas).forEach(([carpeta, asignaturas]) => {
            select.add(new Option(carpeta, carpeta, false, asignaturas.includes(nombre)));
        });
        abrirFormularioCarpeta('Mover ' + nombre, 'Carpeta de destino', select, carpeta => {
            const { config } = obtenerEstructuraBiblioteca();
            if (carpeta && !Object.hasOwn(config.carpetas, carpeta)) return 'Esa carpeta ya no existe.';
            moverAsignatura(config, nombre, carpeta);
            guardarConfigBiblioteca(config);
        }, () => editarCarpeta(null, nombre));
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
    };
})();
