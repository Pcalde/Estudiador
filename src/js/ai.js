// ════════════════════════════════════════════════════════════════
// AI.JS — Módulo Tutor IA (Groq API)
// Encapsula la lógica de red, orquestación de prompts y chat.
// ════════════════════════════════════════════════════════════════

const AI = (() => {
    const MODEL_ID = "llama-3.3-70b-versatile";

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
        
        if (!concepto) return "El alumno está en el menú principal, sin tarjeta activa.";
        
        return `
        [ASIGNATURA]: ${asigActual || 'General'}
        [TIPO]: ${concepto.Apartado || 'Concepto'}
        [TÍTULO]: ${concepto.Titulo || 'Sin título'}
        [CONTENIDO (LaTeX)]: ${concepto.Contenido || ''}
        `;
    }

    async function _llamarGroq(sysPrompt, userMsg) {
        const groqProxyUrl = State.get('groqProxyUrl');
        const groqApiKey = State.get('groqApiKey');

        const payload = {
            model: MODEL_ID,
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userMsg }
            ],
            temperature: 0.3,
            max_tokens: 1024,
            top_p: 1,
            stream: false
        };

        const headers = { "Content-Type": "application/json" };
        let endpoint = "https://api.groq.com/openai/v1/chat/completions";

        if (groqProxyUrl) {
            try { new URL(groqProxyUrl); } catch (_) { throw new Error("URL de proxy inválida."); }
            endpoint = groqProxyUrl;
        } else {
            if (!groqApiKey) throw new Error("API Key no detectada en memoria.");
            headers.Authorization = `Bearer ${groqApiKey}`;
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorMsg = `Error ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData?.error?.message) {
                    errorMsg += `: ${errorData.error.message}`;
                }
            } catch (_) {
                errorMsg += " (sin detalle JSON)";
            }
            if (typeof Logger !== 'undefined') Logger.error("FALLO GROQ:", errorMsg);
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (!data?.choices?.length) {
            throw new Error("La IA respondió con contenido vacío.");
        }
        return data.choices[0].message.content;
    }

    async function enviarMensajeIA() {
        const input = document.getElementById('ai-user-input');
        if (!input) return;
        
        const texto = input.value.trim();
        if (!texto) return;

        const groqApiKey = State.get('groqApiKey');
        const groqProxyUrl = State.get('groqProxyUrl');

        if (!groqApiKey && !groqProxyUrl) {
            UI.agregarMensajeChat("system", "Falta la API Key o un proxy backend. Configúralo en Ajustes.");
            return;
        }

        // 1. UI: Mostrar mensaje del usuario
        UI.agregarMensajeChat("user", texto);
        input.value = "";

        // 2. Preparar contexto (Lo que ve el usuario)
        const contextoTarjeta = _construirContexto();
        
        // 3. Prompt de Sistema (Identidad)
        const systemPrompt = `Eres un profesor experto de matemáticas y ciencias. 
        El alumno está estudiando una tarjeta con la siguiente información:
        ${contextoTarjeta}
        
        Responde a la pregunta del alumno basándote en este contexto si es relevante. 
        Sé conciso, didáctico y usa LaTeX (entre signos $) para fórmulas.`;

        // 4. Llamada a la API
        UI.agregarMensajeChat("system", "Pensando...");
        
        try {
            const respuesta = await _llamarGroq(systemPrompt, texto);
            
            // Borrar "Pensando..." (el último hijo del chat)
            const container = document.getElementById('chat-messages');
            if (container && container.lastElementChild) {
                container.removeChild(container.lastElementChild);
            }
            
            UI.agregarMensajeChat("ai", respuesta);
        } catch (e) {
            const container = document.getElementById('chat-messages');
            if (container && container.lastElementChild) {
                container.removeChild(container.lastElementChild);
            }
            UI.agregarMensajeChat("system", " Error: " + e.message);
        }
    }

    return { toggleChat, checkEnterIA, enviarMensajeIA };
})();

// API Pública en window para bindings en el HTML y delegación de eventos
window.toggleChat = AI.toggleChat;
window.checkEnterIA = AI.checkEnterIA;
window.enviarMensajeIA = AI.enviarMensajeIA;