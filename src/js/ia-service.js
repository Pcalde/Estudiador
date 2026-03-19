// ════════════════════════════════════════════════════════════════
// IA-SERVICE.JS — Fragmentación y llamadas a la API de IA
// Cargado después de: editor.js
// Dependencias globales: State, UI, Logger, EventBus, Parser
// ════════════════════════════════════════════════════════════════

/**
 * Orquestador de fragmentación: delega carga visual a UI, petición a
 * _ejecutarPromptFragmentacion y escritura al estado vía State.batch.
 */
async function fragmentarTarjetaActualIA() {
    const tarjeta  = State.get('conceptoActual');
    if (!tarjeta) return;

    const apiKey  = State.get('groqApiKey');
    const proxyUrl = State.get('groqProxyUrl');

    if (!apiKey && !proxyUrl) {
        alert("Configura la API Key de Groq o el Proxy en Ajustes primero.");
        return;
    }

    if (typeof UI !== 'undefined' && UI.setEstadoCargaFragmentacionIA) {
        UI.setEstadoCargaFragmentacionIA(true);
    }

    try {
        const fragmentos  = await _ejecutarPromptFragmentacion(tarjeta, apiKey, proxyUrl);
        const asigActual  = State.get('nombreAsignaturaActual');

        State.batch(() => {
            const biblio    = State.get('biblioteca');
            const targetIdx = biblio[asigActual].findIndex(
                c => c.Titulo === tarjeta.Titulo && c.Contenido === tarjeta.Contenido
            );
            if (targetIdx !== -1) biblio[asigActual].splice(targetIdx, 1);

            fragmentos.forEach(frag => {
                biblio[asigActual].push({
                    "Titulo":       frag.Titulo,
                    "Contenido":    typeof Parser !== 'undefined' ? Parser.sanearLatex(frag.Contenido) : frag.Contenido,
                    "Tema":         tarjeta.Tema,
                    "Apartado":     tarjeta.Apartado,
                    "EtapaRepaso":  0,
                    "Dificultad":   2,
                    "UltimoRepaso": null,
                    "ProximoRepaso": typeof window.getFechaHoy === 'function'
                        ? window.getFechaHoy()
                        : new Date().toISOString().split('T')[0],
                    "fsrs_state": "new",
                    "id": typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : 'c_' + Date.now() + Math.random()
                });
            });
            State.set('biblioteca', biblio);
        });

        EventBus.emit('DATA_REQUIRES_SAVE');
        alert(`Tarjeta fragmentada en ${fragmentos.length} partes.`);

        if (typeof UI !== 'undefined' && UI.cancelarEdicion) UI.cancelarEdicion(true);
        if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
        if (typeof window.updateDashboard === 'function') window.updateDashboard();

    } catch (error) {
        Logger.error("Fallo en fragmentarTarjetaActualIA:", error);
        alert("Error de procesamiento IA. Revisa la consola.");
    } finally {
        if (typeof UI !== 'undefined' && UI.setEstadoCargaFragmentacionIA) {
            UI.setEstadoCargaFragmentacionIA(false);
        }
    }
}

/**
 * Microservicio interno: construye el prompt, llama al endpoint y parsea la respuesta.
 * @returns {Promise<Array>} Array de objetos {Titulo, Contenido}.
 */
async function _ejecutarPromptFragmentacion(tarjeta, apiKey, proxyUrl) {
    const prompt = `Eres un experto en matemáticas. Aplica el Principio de Información Mínima.
La siguiente tarjeta de estudio (con LaTeX) es demasiado larga. Divídela en partes lógicas y atómicas.

REGLAS ESTRICTAS DE FORMATO (CRÍTICO):
1. Preserva todo el código LaTeX original intacto. No omitas ni reescribas ninguna fórmula.
2. DOBLE-ESCAPA las barras invertidas (\\\\frac en lugar de \\frac).
3. PROHIBIDO usar etiquetas HTML.
4. El Titulo de cada fragmento debe seguir EXACTAMENTE este formato:
"${tarjeta.Titulo}: [subtítulo descriptivo] (N)"

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{"fragmentos": [{"Titulo": "...", "Contenido": "..."}]}

Título original: ${tarjeta.Titulo}
Contenido:
${tarjeta.Contenido}`;

    const model    = State.get('iaModel') || 'llama-3.3-70b-versatile';
    const endpoint = proxyUrl || "https://api.groq.com/openai/v1/chat/completions";
    const headers  = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) throw new Error(`Fallo en la API de IA: ${response.status}`);
    const data = await response.json();

    let rawStr = data.choices[0].message.content
        .replace(/```json/g, '').replace(/```/g, '').trim();
    let jsonParseado;

    try {
        jsonParseado = JSON.parse(rawStr);
    } catch (_) {
        Logger.warn("El LLM falló el doble escapado. Ejecutando saneador regex...");
        const repairedStr = rawStr.replace(/(?<!\\)\\(?!["\\/bfnrt])/g, '\\\\');
        jsonParseado = JSON.parse(repairedStr);
    }

    const fragmentos = jsonParseado.fragmentos;
    if (!Array.isArray(fragmentos) || fragmentos.length === 0) {
        throw new Error("La IA no devolvió un array válido.");
    }
    return fragmentos;
}
