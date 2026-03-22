// ════════════════════════════════════════════════════════════════
// PDF-MANAGER.JS — Módulo de Visor de Recursos
// Encapsula la gestión de memoria RAM, blobs y UI del visor PDF.
// ════════════════════════════════════════════════════════════════

const PDFManager = (() => {

    // 1. GESTIÓN VISUAL (ACORDEÓN)
    function toggleAcordeon() {
        const mod = document.getElementById('modulo-pdf');
        if (!mod) return;
        const arrowIcon = document.getElementById('pdf-arrow-icon');
        const statusText = document.getElementById('pdf-status-text');
        
        if (mod.classList.contains('pdf-collapsed')) {
            mod.classList.remove('pdf-collapsed');
            if (arrowIcon) arrowIcon.innerText = "▲";
            if (statusText) statusText.innerText = "Ocultar";
        } else {
            mod.classList.add('pdf-collapsed');
            if (arrowIcon) arrowIcon.innerText = "▼";
            if (statusText) statusText.innerText = "Desplegar";
        }
    }

    // 2. RENDERIZADO DE CHIPS (SLOTS)
    /**
     * Renderizado seguro de slots de recursos.
     * Elimina vulnerabilidades XSS y minimiza reflows mediante DocumentFragment.
     */
    function render() {
        const asigActual = State.get('nombreAsignaturaActual');
        const recursos = State.get('recursosPorAsignatura') || {};
        const slots = State.get('slotsMemoria') || {};
        const listaActual = recursos[asigActual] || [];
        
        const contenedor = document.getElementById('lista-recursos-slots');
        if (!contenedor) return;
        
        // Limpiar contenedor de forma eficiente
        contenedor.innerHTML = '';
        const fragment = document.createDocumentFragment();

        listaActual.forEach((rec, index) => {
            const isLoaded = !!slots[rec.id];
            
            // Creación de elementos mediante API segura
            const div = document.createElement('div');
            div.className = `slot-chip ${isLoaded ? 'loaded' : 'empty'}`;
            div.onclick = () => clickEnSlot(index);
            
            const span = document.createElement('span');
            // textContent neutraliza cualquier intento de inyección HTML
            span.textContent = `${isLoaded ? '📖' : '📥'} ${rec.nombre}`;
            
            const btn = document.createElement('button');
            btn.className = "slot-del-btn";
            btn.dataset.action = "borrarSlot";
            btn.dataset.idx = index;
            btn.title = "Olvidar referencia";
            btn.textContent = "✕";

            div.appendChild(span);
            div.appendChild(btn);
            fragment.appendChild(div);
        });
        
        contenedor.appendChild(fragment);
    }

    // 3. CREACIÓN Y BORRADO (Metadatos)
    function crearSlot() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) { alert("Selecciona una asignatura primero."); return; }
        
        const nombre = prompt("Nombre para la referencia (ej: 'Stewart', 'Teoría Tema 1'):");
        if (nombre && nombre.trim()) {
            let recursos = State.get('recursosPorAsignatura') || {};
            if (!recursos[asigActual]) recursos[asigActual] = [];
            
            recursos[asigActual].push(nombre.trim());
            localStorage.setItem('estudiador_recursos', JSON.stringify(recursos));
            State.set('recursosPorAsignatura', recursos);
            render();
        }
    }

    function borrarSlot(index, e) {
        if(e) e.stopPropagation(); // Evita disparar la carga del archivo
        if(confirm("¿Eliminar esta referencia de la lista?")) {
            const asigActual = State.get('nombreAsignaturaActual');
            let recursos = State.get('recursosPorAsignatura') || {};
            let slots = State.get('slotsMemoria') || {};

            // Eliminar metadato
            recursos[asigActual].splice(index, 1);
            localStorage.setItem('estudiador_recursos', JSON.stringify(recursos));
            State.set('recursosPorAsignatura', recursos);
            
            // Limpiar memoria RAM asociada para no dejar basura (Memory Leak prevention)
            const key = `${asigActual}_${index}`;
            if (slots[key]) {
                URL.revokeObjectURL(slots[key]);
                delete slots[key];
                State.set('slotsMemoria', slots);
            }
            
            // Resetear visor si estábamos viendo ese
            const frame = document.getElementById('pdf-frame');
            if (frame) {
                frame.src = "";
                frame.style.display = "none";
                const ph = document.getElementById('pdf-placeholder');
                if (ph) ph.style.display = "block";
            }

            render();
        }
    }

    // 4. LÓGICA DE CARGA DE ARCHIVOS (Volátil)
    function clickEnSlot(index) {
        const asigActual = State.get('nombreAsignaturaActual');
        const slots = State.get('slotsMemoria') || {};
        const key = `${asigActual}_${index}`;
        
        // CASO A: Ya está cargado en RAM -> Mostrar
        if (slots[key]) {
            _mostrarBlobEnVisor(slots[key]);
            _resaltarSlotActivo(index);
        } 
        // CASO B: Está vacío -> Pedir archivo
        else {
            State.set('slotEditando', index);
            const input = document.getElementById('input-pdf-slot');
            if(input) input.click();
        }
    }

    function cargarPDFEnSlot(input) {
        const slotEditando = State.get('slotEditando');
        const asigActual = State.get('nombreAsignaturaActual');
        let slots = State.get('slotsMemoria') || {};

        if (input.files && input.files[0] && slotEditando !== -1) {
            const file = input.files[0];
            
            // Validar tipo
            if (file.type !== 'application/pdf') {
                alert("Por favor, selecciona un archivo PDF.");
                return;
            }

            const blobUrl = URL.createObjectURL(file);
            const key = `${asigActual}_${slotEditando}`;
            
            // Guardar en RAM
            slots[key] = blobUrl;
            State.set('slotsMemoria', slots);
            
            // Mostrar inmediatamente
            _mostrarBlobEnVisor(blobUrl);
            _resaltarSlotActivo(slotEditando);
            render(); // Actualiza el chip a estado "loaded"
            
            // Limpiar input y estado
            input.value = "";
            State.set('slotEditando', -1);
        }
    }

    // Helpers privados
    function _mostrarBlobEnVisor(url) {
        const frame = document.getElementById('pdf-frame');
        const placeholder = document.getElementById('pdf-placeholder');
        
        if (frame && placeholder) {
            frame.src = `${url}#toolbar=1&view=FitH`;
            frame.style.display = 'block';
            placeholder.style.display = 'none';
        }
        
        const modulo = document.getElementById('modulo-pdf');
        if (modulo && modulo.classList.contains('pdf-collapsed')) toggleAcordeon();
    }

    function _resaltarSlotActivo(idx) {
        document.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active-view'));
        render(); // Asegurar consistencia del DOM
        setTimeout(() => {
            const contenedor = document.getElementById('lista-recursos-slots');
            if (contenedor && contenedor.children[idx]) {
                contenedor.children[idx].classList.add('active-view');
            }
        }, 10);
    }

    return {
        toggleAcordeon, render, crearSlot, borrarSlot, clickEnSlot, cargarPDFEnSlot
    };
})();

// API Pública delegada al objeto global (para event delegation y retrocompatibilidad)
window.toggleAcordeonPDF = PDFManager.toggleAcordeon;
window.renderRecursos = PDFManager.render;
window.crearSlotRecurso = PDFManager.crearSlot;
window.borrarSlot = PDFManager.borrarSlot;
window.clickEnSlot = PDFManager.clickEnSlot;
window.cargarPDFEnSlot = PDFManager.cargarPDFEnSlot;

CommandRegistry.register('borrarSlot', ({idx}) => PDFManager.borrarSlot(Number(idx)));