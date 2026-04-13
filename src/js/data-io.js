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
    // 1. IMPORTACIÓN LaTeX (Restaurada a Arquitectura Original)
    // ════════════════════════════════════════════════════════════
    function procesarImportacionLatex(rawInput, temaDefault) {
        const asigActual = State.get('nombreAsignaturaActual');
        
        if (!asigActual) { 
            throw new Error("ERR_NO_SUBJECT: Selecciona una asignatura primero."); 
        }

        const newCards = (typeof Parser !== 'undefined') ? Parser.parseLatexToCards(rawInput, temaDefault) : [];
        if (newCards.length === 0) { 
            throw new Error("ERR_NO_CARDS: No se detectaron comandos válidos en el bloque LaTeX."); 
        }

        let biblioteca = State.get('biblioteca') || {};
        if (!biblioteca[asigActual]) biblioteca[asigActual] = [];

        const arrayAsignatura = biblioteca[asigActual];
        const hoy = (typeof window.getFechaHoy === 'function') ? window.getFechaHoy() : new Date().toISOString().slice(0, 10);
        let aProcesarPorIA = 0;

        // Cálculo del índice máximo actual para garantizar secuencialidad inmutable
        const maxIdx = arrayAsignatura.reduce((max, c) => Math.max(max, c.IndiceGlobal ?? 0), 0);

        newCards.forEach((c, i) => {
            if (c._needsAutoTitle) {
                c.Titulo = "Generando título... (IA)";
                aProcesarPorIA++;
            }
            c.Dificultad = 2; 
            c.ProximoRepaso = hoy;
            
            // Asignación estricta de Identidad e Índice
            c.IndiceGlobal = maxIdx + i + 1;
            if (!c.id) {
                c.id = typeof crypto !== 'undefined' && crypto.randomUUID 
                    ? crypto.randomUUID() 
                    : 'c_' + Date.now() + Math.random().toString(36).substr(2, 9);
            }
        });

        arrayAsignatura.push(...newCards);
        State.set('biblioteca', biblioteca);

        EventBus.emit('DATA_REQUIRES_SAVE');
        EventBus.emit('STATE_CHANGED', { keys: ['colaEstudio', 'biblioteca'] });
        
        if (typeof window.cancelarEdicion === 'function') window.cancelarEdicion();
        if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();

        if (aProcesarPorIA > 0 && typeof AI !== 'undefined' && AI.procesarTitulosEnLote) {
            AI.procesarTitulosEnLote(asigActual);
        }
        return { count: newCards.length, conIA: aProcesarPorIA };
    }

    // 2. CREACIÓN DE ASIGNATURA (Operación de datos pura)
    function crearNuevaAsignatura(nombre) {
        const nombreLimpio = nombre.trim();
        let biblioteca = State.get('biblioteca') || {};
        
        if (biblioteca[nombreLimpio]) {
            return { success: false, error: "Ya existe una asignatura con este nombre." };
        }
        
        State.batch(() => {
            biblioteca[nombreLimpio] = []; 
            State.set('biblioteca', biblioteca);
            State.set('nombreAsignaturaActual', nombreLimpio);
        });
        
        EventBus.emit('DATA_REQUIRES_SAVE');
        EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: nombreLimpio });
        
        return { success: true, nombre: nombreLimpio };
    }

    // 2. IMPORTACIÓN JSON
    function procesarImportacion(raw) {
        try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) throw new Error("El JSON debe ser una lista [].");

            const asigActual = State.get('nombreAsignaturaActual');
            if (!asigActual) throw new Error("Selecciona una asignatura primero.");

            let biblioteca = State.get('biblioteca') || {};
            const arrayAsignatura = biblioteca[asigActual] || [];

            // Identificación de la base para auto-incremento local
            const maxIdx = arrayAsignatura.reduce((max, c) => Math.max(max, c.IndiceGlobal ?? 0), 0);

            data.forEach((c, i) => {
                if (c.IndiceGlobal === undefined) c.IndiceGlobal = maxIdx + i + 1;
                if (!c.id) {
                    c.id = typeof crypto !== 'undefined' && crypto.randomUUID 
                        ? crypto.randomUUID() 
                        : 'c_' + Date.now() + Math.random().toString(36).substr(2, 9);
                }
            });

            biblioteca[asigActual] = [...arrayAsignatura, ...data];
            State.set('biblioteca', biblioteca);
            
            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('STATE_CHANGED', { keys: ['colaEstudio', 'biblioteca'] });

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
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
        descargarAsignaturaActual, exportarBackup, importarBackup, crearNuevaAsignatura
    };
})();

// Proxies Globales para compatibilidad con app.js
// NOTA: Estos wrappers son responsables de atrapar errores de data-io y delegarlos a la UI
window.procesarImportacionLatex = () => {
    try {
        const rawInput = document.getElementById('import-area-latex')?.value || '';
        const temaDefault = parseInt(document.getElementById('latex-tema-input')?.value) || 1;
        const result = DataIO.procesarImportacionLatex(rawInput, temaDefault);
        
        const importArea = document.getElementById('import-area-latex');
        if (importArea) importArea.value = "";
        
        // La UI es responsable de mostrar feedback
        if (result.conIA > 0) {
            alert(`${result.count} tarjetas importadas. La IA procesará ${result.conIA} títulos vacíos.`);
        } else {
            alert(`${result.count} tarjetas importadas con sus títulos originales respetados.`);
        }
    } catch(e) {
        // Atrapar excepciones de la capa de datos y mostrarlas en UI
        const errorMsg = e.message || 'Error desconocido en importación LaTeX';
        if (errorMsg.includes('ERR_NO_SUBJECT')) {
            alert('⚠️ Selecciona una asignatura primero.');
        } else if (errorMsg.includes('ERR_NO_CARDS')) {
            alert('⚠️ No se detectaron comandos válidos. Verifica el formato LaTeX.');
        } else {
            alert('❌ Error: ' + errorMsg);
        }
        if (typeof Logger !== 'undefined') Logger.error('[procesarImportacionLatex]', e);
    }
};
window.procesarImportacion = () => {
    const raw = document.getElementById('import-area').value;
    const result = DataIO.procesarImportacion(raw);
    if (result.success) {
        alert("Importación JSON exitosa.");
        if (typeof window.cancelarEdicion === 'function') window.cancelarEdicion();
        if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
    } else {
        alert("Error en JSON: " + result.error);
    }
};
window.descargarAsignaturaActual   = () => DataIO.descargarAsignaturaActual();
window.exportarBackup              = () => DataIO.exportarBackup();
window.importarBackup              = el => DataIO.importarBackup(el);
window.gestionarNuevaAsignatura = () => {
    // El controlador exige los datos a la vista asíncronamente
    if (typeof UI !== 'undefined' && UI.pedirNombreAsignatura) {
        UI.pedirNombreAsignatura((nombre) => {
            if (nombre === null || nombre.trim() === "") {
                // Si el usuario cancela o deja vacío, se lanza el flujo secundario (subir archivo)
                const fileInput = document.getElementById('file-input-unified');
                if (fileInput) fileInput.click();
                return;
            }
            
            const result = DataIO.crearNuevaAsignatura(nombre);
            if (!result.success) {
                alert(result.error);
            } else {
                if (typeof window.actualizarMenuLateral === 'function') window.actualizarMenuLateral();
                if (typeof window.cargarAsignatura === 'function') window.cargarAsignatura(result.nombre);
            }
        });
    } else {
        Logger.error("Arquitectura: UI.pedirNombreAsignatura no está implementado en ui.js.");
    }
};
window.guardarEdicionJSON = () => {
    const rawText = document.getElementById('json-editor-area').value;
    const result = DataIO.guardarEdicionJSON(rawText);
    if (result.success) alert("Cambios guardados.");
    else alert("Error: " + result.error);
};