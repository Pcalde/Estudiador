// ════════════════════════════════════════════════════════════════
// EDITOR.JS — Controladores de edición, importación y creación
// Cargado después de: colors.js, asignaturas.js
// Dependencias globales: State, UI, Logger, EventBus, Parser (parser.js)
// ════════════════════════════════════════════════════════════════

const ORDEN_CLAVES_TARJETA = [
    "Titulo", "Contenido", "Tema", "Apartado", "Dificultad",
    "EtapaRepaso", "UltimoRepaso", "ProximoRepaso", "IndiceGlobal"
];
function _procesarContenido(c) {
    if (typeof Parser === 'undefined') return c;
    // Si tiene comandos LaTeX estructurales, convertir primero
    if (/\\begin\{|\\item\b/.test(c)) {
        try { return Parser.cleanLatexToHtml(c); } 
        catch(e) { Logger.error('Conversión LaTeX falló:', e); }
    }
    return Parser.sanearLatex(c);
}

function ordenarTarjeta(obj) {
    const out = {};
    ORDEN_CLAVES_TARJETA.forEach(k => {
        if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    });
    Object.keys(obj).forEach(k => {
        if (!ORDEN_CLAVES_TARJETA.includes(k)) out[k] = obj[k];
    });
    return out;
}

function modoImportar() {
    if (!State.get('nombreAsignaturaActual')) return;
    UI.ocultarTodo();
    State.set('currentContext', 'import');
    document.getElementById('import-card').classList.remove('hidden');
    document.getElementById('import-area').value = "";
}

function modoEdicionJSON() {
    const asigActual = State.get('nombreAsignaturaActual');
    if (!asigActual) return;
    const tarjetas = (State.get('biblioteca')[asigActual] || []).map(ordenarTarjeta);
    if (typeof UI !== 'undefined' && UI.abrirEditorJSON) UI.abrirEditorJSON(tarjetas);
}

let destinoEditor = null;

function cancelarEdicion() {
    destinoEditor = null;
    const asigActual = State.get('nombreAsignaturaActual');
    
    if (typeof UI !== 'undefined' && UI.cancelarEdicion) {
        UI.cancelarEdicion(!!asigActual);
    }
    
    // Delegación correcta de estado usando la variable recuperada
    State.set('currentContext', asigActual ? 'study' : 'welcome');
}

function abrirEditorAmigable() {
    const concepto = State.get('conceptoActual');
    if (!concepto) return;
    const idx   = State.get('indiceNavegacion') || 0;
    const total = (State.get('colaEstudio') || []).length;
    if (typeof UI !== 'undefined' && UI.abrirEditorAmigable) {
        destinoEditor = { id: concepto.id, asignatura: State.get('nombreAsignaturaActual') };
        UI.abrirEditorAmigable(concepto, idx, total);
    } else {
        Logger.error("Arquitectura: UI.abrirEditorAmigable no implementado.");
    }
}

async function guardarDatosEditorAmigable(cerrar = true) {
    const destino = destinoEditor;
    if (!destino?.id) {
        Toast.show('Vuelve a abrir la tarjeta que quieres editar.', 'error');
        return false;
    }
    const asigActual = destino.asignatura;

    if (typeof UI === 'undefined' || !UI.getEditorData) {
        Logger.error("Arquitectura: UI.getEditorData no disponible.");
        return false;
    }

    const formData = UI.getEditorData();
    if (!formData.titulo || !formData.contenido) {
        alert("El título y el contenido no pueden estar vacíos.");
        return false;
    }

    const biblioteca = State.get('biblioteca');
    const tarjetas = biblioteca[asigActual] || [];
    const idx = tarjetas.findIndex(card => card.id === destino.id);
    if (idx < 0) {
        Toast.show('No se ha encontrado la tarjeta original.', 'error');
        return false;
    }
    const actualizada = {
        ...tarjetas[idx],
        Titulo: formData.titulo,
        Contenido: typeof Parser !== 'undefined' ? Parser.sanearLatex(formData.contenido) : formData.contenido,
        Tema: formData.tema,
        Apartado: formData.apartado
    };
    const siguientes = tarjetas.map((card, i) => i === idx ? actualizada : card);
    try {
        await DataIO.guardarBiblioteca({ ...biblioteca, [asigActual]: siguientes });
    } catch (error) {
        Toast.show('No se pudo guardar la tarjeta.', 'error');
        return false;
    }
    if (State.get('nombreAsignaturaActual') === asigActual) {
        State.batch(() => {
            if (State.get('conceptoActual')?.id === destino.id) {
                State.set('conceptoActual', structuredClone(actualizada));
            }
            State.set('colaEstudio', (State.get('colaEstudio') || []).map(card => card.id === destino.id ? actualizada : card));
        });
        if (cerrar && destinoEditor === destino) cancelarEdicion();
    }
    Toast.show('Tarjeta guardada.', 'success');
    return true;
}

async function navegarEditor(delta) {
    if (!await guardarDatosEditorAmigable(false)) return;

    const cola = State.get('colaEstudio') || [];
    if (cola.length === 0) return;

    let idx = (State.get('indiceNavegacion') || 0) + delta;
    if (idx < 0) idx = cola.length - 1;
    if (idx >= cola.length) idx = 0;

    State.batch(() => {
        State.set('indiceNavegacion', idx);
        State.set('conceptoActual', structuredClone(cola[idx]));
    });

    abrirEditorAmigable();
}

async function guardarNuevoConcepto() {
    if (typeof UI === 'undefined' || !UI.getEditorData) return;

    // INTERCEPTOR ARQUITECTÓNICO: Redirección forzosa.
    // Si la UI invoca esto por error pero hay un concepto activo, se trata de una edición.
    if (State.get('conceptoActual')) {
        Logger.info("Interceptado intento de crear nueva tarjeta durante edición. Redirigiendo...");
        guardarDatosEditorAmigable(true);
        return;
    }

    const asigActual = State.get('nombreAsignaturaActual');
    if (!asigActual) return;
    const formData = UI.getEditorData();
    let t = formData.titulo;
    const c = formData.contenido;

    if (!c) { alert("El contenido no puede estar vacío."); return; }

    if (!t) {
        if (typeof UI.setBtnIAModo === 'function') UI.setBtnIAModo(true);
        try {
            t = await AI.generarTituloAutomatico(c);
        } catch (e) {
            t = "Concepto Genérico (Auto)";
        } finally {
            if (typeof UI.setBtnIAModo === 'function') UI.setBtnIAModo(false);
        }
    }

    const biblioteca = State.get('biblioteca');
    if (!Object.hasOwn(biblioteca, asigActual)) {
        Toast.show('La asignatura de destino ya no existe.', 'error');
        return;
    }
        const maxIdx = biblioteca[asigActual].reduce((max, card) => Math.max(max, card.IndiceGlobal || card._idx || 0), 0);
        
    const tarjeta = {
            id: DataIO.nuevoId(),
            "Titulo":       t,
            "Contenido":    typeof _procesarContenido === 'function' ? _procesarContenido(c) : c,
            "Tema":         formData.tema || 1,
            "Apartado":     formData.apartado || "Concepto",
            "EtapaRepaso":  0,
            "Dificultad":   2,
            "UltimoRepaso": null,
            "ProximoRepaso": typeof window.getFechaHoy === 'function' ? window.getFechaHoy() : new Date().toISOString().split('T')[0],
            "IndiceGlobal": maxIdx + 1,
            "_idx": maxIdx + 1
    };
    try {
        await DataIO.guardarBiblioteca({ ...biblioteca, [asigActual]: [...biblioteca[asigActual], tarjeta] });
    } catch (error) {
        Toast.show('No se pudo guardar la tarjeta.', 'error');
        return;
    }
    if (State.get('nombreAsignaturaActual') !== asigActual) {
        Toast.show('Tarjeta guardada en ' + asigActual, 'success');
        return;
    }
    if (typeof UI.limpiarEditorData === 'function') UI.limpiarEditorData();
    Toast.show("Tarjeta guardada: " + t, "success");
    cancelarEdicion();
    if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
}

function setImportMode(mode) {
    try {
        const pJson  = document.getElementById('panel-import-json');
        const pLatex = document.getElementById('panel-import-latex');
        const tJson  = document.getElementById('tab-import-json');
        const tLatex = document.getElementById('tab-import-latex');

        if (!pJson || !pLatex || !tJson || !tLatex) {
            Logger.warn("UI: Faltan nodos DOM en la vista de importación.");
            return;
        }

        if (mode === 'json') {
            pJson.classList.remove('hidden');
            pLatex.classList.add('hidden');
            tJson.style.color        = "var(--accent)";
            tJson.style.borderBottom = "2px solid var(--accent)";
            tLatex.style.color        = "#666";
            tLatex.style.borderBottom = "none";
        } else {
            pJson.classList.add('hidden');
            pLatex.classList.remove('hidden');
            tLatex.style.color        = "var(--accent)";
            tLatex.style.borderBottom = "2px solid var(--accent)";
            tJson.style.color        = "#666";
            tJson.style.borderBottom = "none";
        }
    } catch (error) {
        Logger.error("Error mutando DOM en setImportMode:", error);
    }
}
