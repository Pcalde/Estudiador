// ════════════════════════════════════════════════════════════════
// AI.JS — Módulo Tutor IA (Groq API)
// Encapsula la lógica de red, orquestación de prompts y chat.
// Arquitectura: Lee credenciales y modelo del State. Cero mutaciones DOM.
// ════════════════════════════════════════════════════════════════

const AI = (() => {
    
    const MODELOS = {
        COMPLEJO: "llama-3.3-70b-versatile",
        RAPIDO:   "llama-3.1-8b-instant"
    };

    async function _llamarGroq(systemMsg, userMsg, modeloOverride = null) {
        const apiKey = State.get('groqApiKey');
        const proxyUrl = State.get('groqProxyUrl');
        
        if (!apiKey && !proxyUrl) throw new Error("Faltan credenciales de IA.");

        const modeloActivo = modeloOverride || State.get('iaModel') || MODELOS.COMPLEJO;

        const payload = {
            model: modeloActivo,
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: userMsg }
            ],
            temperature: 0.3,
            max_tokens: 1024
        };

        const url = proxyUrl || "https://api.groq.com/openai/v1/chat/completions";
        const headers = { "Content-Type": "application/json" };
        if (!proxyUrl) headers["Authorization"] = `Bearer ${apiKey}`;

        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Error en red IA (Status: ${response.status})`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    function toggleChat() {
        const chat = document.getElementById('ai-chat-widget');
        if (!chat) return;
        chat.classList.toggle('hidden');
        if (!chat.classList.contains('hidden')) {
            document.getElementById('ai-user-input').focus();
            const container = document.getElementById('chat-messages');
            if (container) container.scrollTop = container.scrollHeight;
        }
    }

    function checkEnterIA(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensajeIA();
        }
    }

    function _construirContexto() {
        const asigActual = State.get('nombreAsignaturaActual');
        const concepto = State.get('conceptoActual');
        if (!concepto) return "El alumno está en el menú principal.";
        return `[ASIGNATURA]: ${asigActual || 'General'}\n[CONTENIDO]: ${concepto.Contenido || 'Vacío'}`;
    }

    async function enviarMensajeIA() {
        const input = document.getElementById('ai-user-input');
        const texto = input.value.trim();
        if (!texto) return;

        input.value = "";
        if (typeof UI !== 'undefined' && UI.agregarMensajeChat) {
            UI.agregarMensajeChat("user", texto);
            UI.agregarMensajeChat("system", "Pensando...");
        }
        
        try {
            const context = _construirContexto();
            const prompt = `Eres un profesor experto. Contexto:\n${context}\nResponde breve con LaTeX ($).`;
            const respuesta = await _llamarGroq(prompt, texto);
            
            const container = document.getElementById('chat-messages');
            if (container && container.lastElementChild) container.removeChild(container.lastElementChild);
            if (typeof UI !== 'undefined' && UI.agregarMensajeChat) UI.agregarMensajeChat("ai", respuesta);
        } catch (e) {
            const container = document.getElementById('chat-messages');
            if (container && container.lastElementChild) container.removeChild(container.lastElementChild);
            if (typeof UI !== 'undefined' && UI.agregarMensajeChat) UI.agregarMensajeChat("system", " Error: " + e.message);
        }
    }

    async function generarTituloAutomatico(contenido) {
        if (!contenido || contenido.trim() === "") return "Tarjeta vacía (Auto)";
        
        const prompt = `Actúa como indexador de apuntes matemáticos. 
        Lee el texto y genera un título descriptivo y específico que lo diferencie de otros conceptos similares (máximo 6-8 palabras).
        Ejemplos: Si te dan la definición de sigma-algebra en X, o las propiedades de una medida arbitraria, pones:
        Ejemplo 1: {{{{$\\sigma$-álgebra en X}}}}
        Ejemplo 2: {{{{Propiedades de la Medida}}}}
        Responde ÚNICAMENTE con el título envuelto en 4 llaves y los comandos de latex con dos \\\\ y envueltos en dólares $.`;
        
        // Cero delegación de errores. El error debe subir al orquestador para no silenciar Rate Limits.
        const respuesta = await _llamarGroq(prompt, contenido, MODELOS.RAPIDO);
        const match = respuesta.match(/\{{2,4}(.*?)\}{2,4}/);
        if (match) return `${match[1].trim()} (Auto)`;
        
        return "Concepto (Revisar IA)";
    }

    async function procesarTitulosEnLote(asignatura) {
        const biblioteca = State.get('biblioteca');
        if (!biblioteca || !biblioteca[asignatura]) return;

        let tarjetas = biblioteca[asignatura];
        let procesadas = 0;

        for (let i = 0; i < tarjetas.length; i++) {
            if (tarjetas[i]._needsAutoTitle) {
                try {
                    // Backoff de 3500ms estricto para mitigar el HTTP 429 (Rate Limit de Groq)
                    await new Promise(resolve => setTimeout(resolve, 3500));
                    
                    const nuevoTitulo = await generarTituloAutomatico(tarjetas[i].Contenido);
                    tarjetas[i].Titulo = nuevoTitulo;
                    delete tarjetas[i]._needsAutoTitle;
                    procesadas++;
                    
                } catch (e) {
                    if (typeof Logger !== 'undefined') Logger.error("Fallo IA en título:", e);
                    tarjetas[i].Titulo = "Error de IA (Editar)";
                    delete tarjetas[i]._needsAutoTitle;
                }
            }
        }

        if (procesadas > 0) {
            State.set('biblioteca', biblioteca);
            if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
            
            // CORRECCIÓN DE REACTIVIDAD: Forzamos la regeneración de la cola para que la UI se actualice
            if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros(false);
        }
    }

    return { 
        toggleChat, 
        checkEnterIA, 
        enviarMensajeIA, 
        generarTituloAutomatico, 
        procesarTitulosEnLote,
        setModeloActivo: (m) => { State.set('iaModel', m); localStorage.setItem('estudiador_ia_model', m); }
    };
})();

// Bindings globales
window.toggleChat = AI.toggleChat;
window.checkEnterIA = AI.checkEnterIA;
window.enviarMensajeIA = AI.enviarMensajeIA;
window.cambiarModeloIA = AI.setModeloActivo;