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
        
        // Precálculo estricto: ¿Cuántas tarjetas REALMENTE necesitan título?
        const idxAProcesar = tarjetas.reduce((acc, c, idx) => {
            if (c._needsAutoTitle) acc.push(idx);
            return acc;
        }, []);
        
        const totalObjetivo = idxAProcesar.length;
        if (totalObjetivo === 0) return;

        let procesadas = 0;
        const toastId = 'ia_batch_' + asignatura.replace(/\s+/g, '');
        
        // Despliegue de Widget UI inicial
        if (typeof Toast !== 'undefined') {
            Toast.showProgress(toastId, `Iniciando IA (0/${totalObjetivo})...`, 0);
        }

        const delayBase = 500; 

        for (let idx of idxAProcesar) {
            let tarjeta = tarjetas[idx];
            let intentos = 0;
            let exito = false;
            let waitTime = delayBase;

            while (intentos < 5 && !exito) {
                try {
                    if (intentos > 0 || procesadas > 0) {
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                    
                    const nuevoTitulo = await generarTituloAutomatico(tarjeta.Contenido);
                    tarjeta.Titulo = nuevoTitulo;
                    delete tarjeta._needsAutoTitle;
                    
                    procesadas++;
                    exito = true;
                    waitTime = delayBase; 
                    
                    // Actualización de Telemetría UI
                    if (typeof Toast !== 'undefined') {
                        Toast.showProgress(toastId, `Generando títulos... (${procesadas}/${totalObjetivo})`, (procesadas / totalObjetivo) * 100);
                    }
                    
                } catch (e) {
                    intentos++;
                    const msg = e.message || "";
                    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');
                    
                    if (isRateLimit) {
                        let cooldownSeconds = 10;
                        const match = msg.match(/try again in ([\d\.]+)s/);
                        if (match && match[1]) cooldownSeconds = parseFloat(match[1]) + 1.0; 
                        
                        waitTime = cooldownSeconds * 1000;
                        
                        // Notificar el enfriamiento para que el usuario no crea que se ha colgado
                        if (typeof Toast !== 'undefined') {
                            Toast.showProgress(toastId, `Pausa de red IA (${cooldownSeconds.toFixed(1)}s)...`, (procesadas / totalObjetivo) * 100);
                        }
                    } else if (intentos >= 5) {
                        tarjeta.Titulo = "Error de IA (Editar)";
                        delete tarjeta._needsAutoTitle;
                        procesadas++; // Contabilizar para no desfasar la barra matemática
                        
                        if (typeof Toast !== 'undefined') {
                            Toast.showProgress(toastId, `Omitiendo error IA... (${procesadas}/${totalObjetivo})`, (procesadas / totalObjetivo) * 100);
                        }
                    } else {
                        waitTime = 3000; 
                    }
                }
            }

            if (procesadas > 0 && procesadas % 10 === 0) {
                State.set('biblioteca', biblioteca);
                if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
                if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros(false);
            }
        }

        // Persistencia y recarga final
        if (procesadas > 0) {
            State.set('biblioteca', biblioteca);
            if (typeof EventBus !== 'undefined') EventBus.emit('DATA_REQUIRES_SAVE');
            if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros(false);
        }

        // Desmontaje visual y notificación de éxito nativa
        if (typeof Toast !== 'undefined') {
            Toast.removeProgress(toastId);
            Toast.show(`IA: ${procesadas} tarjetas procesadas con éxito.`, 'success', 5000);
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