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
        if (typeof Logger !== 'undefined') Logger.error("Arquitectura: UI.getEditorData no disponible.");
        return false;
    }

    const formData = UI.getEditorData();
    if (!formData.titulo || !formData.contenido) {
        alert("El título y el contenido no pueden estar vacíos.");
        return false;
    }

    let success = false;
    State.batch(() => {
        const biblioteca = State.get('biblioteca');
        
        // Identidad estricta priorizando los identificadores únicos
        const matcher = (c) => {
            if (c.id && concepto.id && c.id === concepto.id) return true;
            if (c._idx !== undefined && concepto._idx !== undefined && c._idx === concepto._idx) return true;
            if (c.IndiceGlobal !== undefined && concepto.IndiceGlobal !== undefined && c.IndiceGlobal === concepto.IndiceGlobal) return true;
            return c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido;
        };

        const targetIdx = biblioteca[asigActual].findIndex(matcher);

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
            const colaIdx = cola.findIndex(matcher);
            if (colaIdx !== -1) {
                cola[colaIdx] = updatedCard;
                State.set('colaEstudio', cola);
            }
            success = true;
        } else {
            if (typeof Logger !== 'undefined') Logger.error("Editor: Índice objetivo no localizado. Abortando mutación para evitar duplicados.");
        }
    });

    if (success) {
        if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof UI !== 'undefined' && UI.mostrarFeedbackGuardadoEditor) UI.mostrarFeedbackGuardadoEditor();
        if (cerrar) cancelarEdicion();
    }
    return success;
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

    // INTERCEPTOR ARQUITECTÓNICO: Redirección forzosa.
    // Si la UI invoca esto por error pero hay un concepto activo, se trata de una edición.
    if (State.get('conceptoActual')) {
        if (typeof Logger !== 'undefined') Logger.info("Interceptado intento de crear nueva tarjeta durante edición. Redirigiendo...");
        guardarDatosEditorAmigable(true);
        return;
    }

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
        const maxIdx = biblioteca[asigActual].reduce((max, card) => Math.max(max, card.IndiceGlobal || card._idx || 0), 0);
        
        biblioteca[asigActual].push({
            "Titulo":       t,
            "Contenido":    typeof _procesarContenido === 'function' ? _procesarContenido(c) : c,
            "Tema":         formData.tema || 1,
            "Apartado":     formData.apartado || "Concepto",
            "EtapaRepaso":  0,
            "Dificultad":   2,
            "UltimoRepaso": null,
            "ProximoRepaso": typeof window.getFechaHoy === 'function' ? window.getFechaHoy() : new Date().toISOString().split('T')[0],
            "IndiceGlobal": maxIdx + 1,
            "_idx":         maxIdx + 1
        });
        State.set('biblioteca', biblioteca);
    });

    if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
    if (typeof UI.limpiarEditorData === 'function') UI.limpiarEditorData();
    alert("Tarjeta guardada: " + t);
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
