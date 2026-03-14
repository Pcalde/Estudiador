// ════════════════════════════════════════════════════════════════
// DATA-IO.JS — Gestor de Entrada/Salida de Datos
// Encapsula la importación, exportación, backups y telemetría.
// Arquitectura: Usa State.get/set para datos. Recibe callbacks 
// para orquestación de UI/Persistencia vía init().
// ════════════════════════════════════════════════════════════════

const DataIO = (() => {

    function _descargar(uri, nombreArchivo) {
        const a = document.createElement('a');
        a.href = uri;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ════════════════════════════════════════════════════════════
    // 1. IMPORTACIÓN LaTeX (Corregida: Respeta títulos manuales)
    // ════════════════════════════════════════════════════════════
    function procesarImportacionLatex() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) { alert("Selecciona una asignatura primero."); return; }

        const rawInput = document.getElementById('import-area-latex').value;
        const temaDefault = parseInt(document.getElementById('latex-tema-input').value) || 1;
        
        const newCards = (typeof Parser !== 'undefined') ? Parser.parseLatexToCards(rawInput, temaDefault) : [];
        if (newCards.length === 0) { alert("No se detectaron comandos válidos."); return; }

        let biblioteca = State.get('biblioteca') || {};
        if (!biblioteca[asigActual]) biblioteca[asigActual] = [];

        // Obtener fecha hoy de forma segura
        const hoy = (typeof window.getFechaHoy === 'function') ? window.getFechaHoy() : new Date().toISOString().slice(0, 10);

        // Tipos base que devuelve el parser
        const titulosGenericos = ['Definición', 'Teorema', 'Proposición', 'Lema', 'Corolario', 'Nota', 'Ejemplo', 'Concepto', 'Axioma', 'Observación', 'Demostración'];
        let aProcesarPorIA = 0;

        newCards.forEach(c => {
            // CORRECCIÓN CRÍTICA: El parser le añade " (Auto)" a las que no tienen corchetes.
            // Se lo quitamos temporalmente para compararlo con nuestra lista estricta.
            const tituloBase = c.Titulo.replace(' (Auto)', '').trim();

            // Si coincide con la lista, significa que el usuario dejó el título en blanco
            if (titulosGenericos.includes(tituloBase)) {
                c._needsAutoTitle = true; 
                c.Titulo = "Generando título... (IA)"; 
                aProcesarPorIA++;
            }
            // Si no coincide (ej: "Abiertos en \reales"), se mantiene el título intacto.
            
            c.Dificultad = 2; 
            c.ProximoRepaso = hoy;
        });

        biblioteca[asigActual].push(...newCards);
        State.set('biblioteca', biblioteca);

        EventBus.emit('DATA_REQUIRES_SAVE');
        EventBus.emit('STATE_CHANGED', { keys: ['colaEstudio', 'biblioteca'] });
        
        document.getElementById('import-area-latex').value = "";
        
        // Feedback preciso sobre qué se mandó a la IA y qué no
        if (aProcesarPorIA > 0) {
            alert(`${newCards.length} tarjetas importadas. La IA procesará ${aProcesarPorIA} títulos vacíos.`);
        } else {
            alert(`${newCards.length} tarjetas importadas con sus títulos originales respetados.`);
        }
        
        if (typeof window.cancelarEdicion === 'function') window.cancelarEdicion();
        if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();

        // Solo despertamos al Worker si realmente hay trabajo
        if (aProcesarPorIA > 0 && typeof AI !== 'undefined' && AI.procesarTitulosEnLote) {
            AI.procesarTitulosEnLote(asigActual);
        }
    }

    // 2. GESTIÓN DE ASIGNATURAS (Sin _cb)
    function gestionarNuevaAsignatura() {
        const input = prompt("Nombre de la nueva asignatura (o deja vacío para subir archivo):");
        if (input === null) return; 

        if (input.trim() !== "") {
            const nombre = input.trim();
            let biblioteca = State.get('biblioteca') || {};
            if(biblioteca[nombre]) { alert("Ya existe esta asignatura."); return; }
            
            biblioteca[nombre] = []; 
            State.set('biblioteca', biblioteca);
            
            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre });
        } else {
            const fileInput = document.getElementById('file-input-unified');
            if (fileInput) fileInput.click();
        }
    }

    // 2. IMPORTACIÓN JSON
    function procesarImportacion() {
        const raw = document.getElementById('import-area').value;
        try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) throw new Error("El JSON debe ser una lista [].");

            const asigActual = State.get('nombreAsignaturaActual');
            if (!asigActual) throw new Error("Selecciona una asignatura primero.");

            let biblioteca = State.get('biblioteca') || {};
            biblioteca[asigActual] = [...(biblioteca[asigActual] || []), ...data];

            State.set('biblioteca', biblioteca);
            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('STATE_CHANGED', { keys: ['colaEstudio', 'biblioteca'] });

            alert("Importación JSON exitosa.");
            if (typeof window.cancelarEdicion === 'function') window.cancelarEdicion();
            if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
        } catch (e) {
            alert("Error en JSON: " + e.message);
        }
    }

    // 3. GESTIÓN DE ASIGNATURAS
    function guardarEdicionJSON(rawJsonString) {
        const asigActual = State.get('nombreAsignaturaActual');
        try {
            let parsed = JSON.parse(rawJsonString);
            if (!Array.isArray(parsed)) throw new Error("Debe ser una lista []");
            
            let biblioteca = State.get('biblioteca') || {};
            biblioteca[asigActual] = parsed;
            
            State.set('biblioteca', biblioteca);
            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: asigActual });
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function descargarAsignaturaActual() {
        const asig = State.get('nombreAsignaturaActual');
        const bib = State.get('biblioteca') || {};
        if (!asig || !bib[asig]) return;
        const blob = new Blob([JSON.stringify(bib[asig], null, 2)], { type: 'application/json' });
        _descargar(URL.createObjectURL(blob), `${asig}_backup.json`);
    }

    function exportarBackup() {
        const bib = State.get('biblioteca') || {};
        const blob = new Blob([JSON.stringify(bib, null, 2)], { type: 'application/json' });
        _descargar(URL.createObjectURL(blob), `Backup_${new Date().getTime()}.json`);
    }

    function importarBackup(el) {
        const file = el.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                State.set('biblioteca', data);
                EventBus.emit('DATA_REQUIRES_SAVE');
                alert("Backup restaurado. Recargando...");
                location.reload();
            } catch (err) { alert("Archivo inválido."); }
        };
        reader.readAsText(file);
    }

    return {
        procesarImportacionLatex, procesarImportacion, guardarEdicionJSON,
        descargarAsignaturaActual, exportarBackup, importarBackup, gestionarNuevaAsignatura
    };
})();

// Proxies Globales para compatibilidad con app.js
window.procesarImportacionLatex    = () => DataIO.procesarImportacionLatex();
window.procesarImportacion         = () => DataIO.procesarImportacion();
window.descargarAsignaturaActual   = () => DataIO.descargarAsignaturaActual();
window.exportarBackup              = () => DataIO.exportarBackup();
window.importarBackup              = el => DataIO.importarBackup(el);
window.gestionarNuevaAsignatura    = () => DataIO.gestionarNuevaAsignatura();
window.guardarEdicionJSON = () => {
    const rawText = document.getElementById('json-editor-area').value;
    const result = DataIO.guardarEdicionJSON(rawText);
    if (result.success) alert("Cambios guardados.");
    else alert("Error: " + result.error);
};