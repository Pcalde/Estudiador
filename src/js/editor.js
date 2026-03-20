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
    document.getElementById('import-card').classList.remove('hidden');
    document.getElementById('import-area').value = "";
}

function modoEdicionJSON() {
    const asigActual = State.get('nombreAsignaturaActual');
    if (!asigActual) return;
    const tarjetas = (State.get('biblioteca')[asigActual] || []).map(ordenarTarjeta);
    if (typeof UI !== 'undefined' && UI.abrirEditorJSON) UI.abrirEditorJSON(tarjetas);
}

function cancelarEdicion() {
    if (typeof UI !== 'undefined' && UI.cancelarEdicion) {
        UI.cancelarEdicion(!!State.get('nombreAsignaturaActual'));
    }
}

function abrirEditorAmigable() {
    const concepto = State.get('conceptoActual');
    if (!concepto) return;
    const idx   = State.get('indiceNavegacion') || 0;
    const total = (State.get('colaEstudio') || []).length;
    if (typeof UI !== 'undefined' && UI.abrirEditorAmigable) {
        UI.abrirEditorAmigable(concepto, idx, total);
    } else {
        Logger.error("Arquitectura: UI.abrirEditorAmigable no implementado.");
    }
}

function guardarDatosEditorAmigable(cerrar = true) {
    const concepto   = State.get('conceptoActual');
    const asigActual = State.get('nombreAsignaturaActual');
    if (!concepto || !asigActual) return false;

    if (typeof UI === 'undefined' || !UI.getEditorData) {
        Logger.error("Arquitectura: UI.getEditorData no disponible.");
        return false;
    }

    const formData = UI.getEditorData();
    if (!formData.titulo || !formData.contenido) {
        alert("El título y el contenido no pueden estar vacíos.");
        return false;
    }

    State.batch(() => {
        const biblioteca = State.get('biblioteca');
        const targetIdx  = biblioteca[asigActual].findIndex(
            c => c.id === concepto.id || (c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido)
        );

        if (targetIdx !== -1) {
            const updatedCard = {
                ...biblioteca[asigActual][targetIdx],
                Titulo:    formData.titulo,
                Contenido: typeof Parser !== 'undefined' ? Parser.sanearLatex(formData.contenido) : formData.contenido,
                Tema:      formData.tema,
                Apartado:  formData.apartado
            };
            biblioteca[asigActual][targetIdx] = updatedCard;
            State.set('biblioteca', biblioteca);
            State.set('conceptoActual', structuredClone(updatedCard));

            let cola = State.get('colaEstudio') || [];
            const colaIdx = cola.findIndex(
                c => c.id === concepto.id || (c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido)
            );
            if (colaIdx !== -1) {
                cola[colaIdx] = updatedCard;
                State.set('colaEstudio', cola);
            }
        }
    });

    EventBus.emit('DATA_REQUIRES_SAVE');
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof UI !== 'undefined' && UI.mostrarFeedbackGuardadoEditor) UI.mostrarFeedbackGuardadoEditor();
    if (cerrar) cancelarEdicion();
    return true;
}

function navegarEditor(delta) {
    if (!guardarDatosEditorAmigable(false)) return;

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

    const asigActual = State.get('nombreAsignaturaActual');
    if (!asigActual) return;

    State.batch(() => {
        const biblioteca = State.get('biblioteca');
        biblioteca[asigActual].push({
            "Titulo":       t,
            "Contenido":    _procesarContenido(c),
            "Tema":         formData.tema || 1,
            "Apartado":     formData.apartado || "Concepto",
            "EtapaRepaso":  0,
            "Dificultad":   2,
            "UltimoRepaso": null,
            "ProximoRepaso": window.getFechaHoy()
        });
        State.set('biblioteca', biblioteca);
    });

    EventBus.emit('DATA_REQUIRES_SAVE');
    if (typeof UI.limpiarEditorData === 'function') UI.limpiarEditorData();
    alert("Tarjeta guardada: " + t);
    cancelarEdicion();
    if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
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
