// ════════════════════════════════════════════════════════════════
// GRAPH-AI.JS — Generación de Mapas Conceptuales con IA
// Formato DSL lineal robusto para evitar problemas con LaTeX
// ════════════════════════════════════════════════════════════════

const GraphAI = (() => {

    // ── Utilidades de normalización ───────────────────────────────
    
    /**
     * Normaliza un título para comparación fuzzy:
     * - Elimina delimitadores LaTeX ($$, $)
     * - Elimina comandos como \textbf{}, \textit{}
     * - Convierte a minúsculas y trim
     */
    function _normalizarTitulo(t) {
        return (t || '')
            .replace(/\$\$?/g, '')
            .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
            .toLowerCase()
            .trim();
    }

    /**
     * Busca una tarjeta que coincida con el título buscado.
     * Primero intenta match exacto normalizado, luego inclusión.
     */
    function _resolverTitulo(tituloBuscado, cardsDisponibles) {
        const norm = _normalizarTitulo(tituloBuscado);
        
        // 1. Match exacto normalizado
        let match = cardsDisponibles.find(c => _normalizarTitulo(c.Titulo) === norm);
        if (match) return match;
        
        // 2. Match por inclusión (en cualquier dirección)
        match = cardsDisponibles.find(c => {
            const cn = _normalizarTitulo(c.Titulo);
            return cn.includes(norm) || norm.includes(cn);
        });
        
        return match || null;
    }

    // ── Parser tolerante de DSL ───────────────────────────────────
    
    /**
     * Parsea texto formato DSL: "Título A -> Título B : etiqueta"
     * Ignora líneas vacías y comentarios (#)
     * Devuelve válidas e inválidas por separado
     */
    function _parsearRelacionesTexto(texto) {
        const validas = [];
        const invalidas = [];

        texto.split('\n').forEach(linea => {
            const raw = linea.trim();
            if (!raw || raw.startsWith('#')) return; // ignora vacías y comentarios

            const m = raw.match(/^(.+?)\s*->\s*(.+?)\s*(?::\s*(.+))?$/);
            if (!m) { 
                invalidas.push(raw); 
                return; 
            }

            validas.push({
                origenRaw: m[1].trim(),
                destinoRaw: m[2].trim(),
                etiqueta: (m[3] || '').trim()
            });
        });

        return { validas, invalidas };
    }

    // ── Modal de revisión en texto plano ──────────────────────────
    
    function _abrirRevisionTextoPlano(textoInicial, asig, cardsDisponibles) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999999; display:flex; align-items:center; justify-content:center;';

        overlay.innerHTML = `
            <div style="background:var(--card-bg); width:600px; max-width:90vw; border-radius:12px; border:1px solid var(--border); padding:20px; display:flex; flex-direction:column; gap:12px;">
                <h4 style="margin:0; color:var(--accent);"><i class="fa-solid fa-diagram-project"></i> Revisa el mapa antes de aplicarlo</h4>
                <p style="font-size:0.8em; color:var(--text-muted); margin:0;">
                    Formato: <code>Origen -> Destino : etiqueta</code>. Las líneas marcadas con <code>#</code> no se aplicarán — corrígelas o bórralas.
                </p>
                <textarea id="graph-ia-review" style="height:300px; font-family:monospace; font-size:0.85em; background:var(--bg-color); color:var(--text-main); border:1px solid var(--border); border-radius:6px; padding:10px; resize:vertical;">${textoInicial}</textarea>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button id="graph-ia-cancel" style="padding:8px 16px; background:transparent; border:1px solid var(--border); color:var(--text-muted); border-radius:6px; cursor:pointer;">Cancelar</button>
                    <button id="graph-ia-apply" style="padding:8px 16px; background:var(--accent); border:none; color:#000; border-radius:6px; font-weight:bold; cursor:pointer;">Aplicar al mapa</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#graph-ia-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#graph-ia-apply').onclick = () => {
            const textoFinal = overlay.querySelector('#graph-ia-review').value;
            const { validas } = _parsearRelacionesTexto(textoFinal);
            _aplicarRelacionesAlGrafo(validas, asig, cardsDisponibles);
            overlay.remove();
        };
    }

    // ── Aplicación de relaciones al grafo ─────────────────────────
    
    function _aplicarRelacionesAlGrafo(validas, asig, cardsDisponibles) {
        let aplicadas = 0;
        
        validas.forEach(v => {
            const origen  = _resolverTitulo(v.origenRaw, cardsDisponibles);
            const destino = _resolverTitulo(v.destinoRaw, cardsDisponibles);
            
            if (!origen || !destino) {
                Logger.warn(`Relación ignorada (no resuelta): ${v.origenRaw} -> ${v.destinoRaw}`);
                return;
            }

            const idOrigen  = Graph._cardId(origen, asig);
            const idDestino = Graph._cardId(destino, asig);
            
            if (!idOrigen || !idDestino) {
                Logger.warn(`IDs no generados: ${origen.Titulo} -> ${destino.Titulo}`);
                return;
            }

            Graph.addNode(idOrigen);
            Graph.addNode(idDestino);
            Graph.addEdge(idOrigen, idDestino, v.etiqueta);
            aplicadas++;
        });
        
        if (typeof Toast !== 'undefined') {
            Toast.show(`Mapa actualizado con ${aplicadas} relaciones de la IA.`, 'success');
        }
    }

    // ── Función principal de generación ───────────────────────────
    
    async function generarMapaConIA() {
        const asig = State.get('nombreAsignaturaActual');
        if (!asig) {
            Toast.show('Selecciona una asignatura primero', 'warning');
            return;
        }

        const cardsDisponibles = (State.get('biblioteca') || {})[asig] || [];
        if (cardsDisponibles.length === 0) {
            Toast.show('No hay tarjetas en esta asignatura', 'warning');
            return;
        }

        const apiKey = State.get('groqApiKey');
        const proxyUrl = State.get('groqProxyUrl');
        if (!apiKey && !proxyUrl) {
            Toast.show('Configura la API Key de Groq o el Proxy en Ajustes', 'error');
            return;
        }

        // Preparar lista de títulos para el prompt
        const listaTitulos = cardsDisponibles.map(c => `- ${c.Titulo}`).join('\n');
        
        const prompt = `Tienes esta lista de conceptos matemáticos:
${listaTitulos}

Genera las relaciones lógicas entre ellos (depende_de, demuestra, generaliza, aplica_a, es_caso_de, etc.)
usando EXACTAMENTE este formato, una relación por línea, sin explicaciones ni JSON:

Título origen -> Título destino : etiqueta

Usa los títulos EXACTOS de la lista. No inventes conceptos nuevos.
Prioriza relaciones significativas (máximo 2-3 por concepto).`;

        // Mostrar estado de carga
        if (typeof Toast !== 'undefined') {
            Toast.show('Generando mapa con IA...', 'info');
        }

        try {
            // Llamada a la IA usando el módulo AI existente
            let respuesta;
            if (typeof AI !== 'undefined' && typeof AI.generarRespuesta === 'function') {
                respuesta = await AI.generarRespuesta(prompt);
            } else {
                throw new Error('Módulo AI no disponible');
            }

            // Parsear respuesta
            const { validas, invalidas } = _parsearRelacionesTexto(respuesta);

            // Reconstruir texto para revisión humana
            let lineasParaRevision = [];
            
            validas.forEach(v => {
                const origen  = _resolverTitulo(v.origenRaw, cardsDisponibles);
                const destino = _resolverTitulo(v.destinoRaw, cardsDisponibles);
                
                if (origen && destino) {
                    lineasParaRevision.push(`${origen.Titulo} -> ${destino.Titulo}${v.etiqueta ? ' : ' + v.etiqueta : ''}`);
                } else {
                    lineasParaRevision.push(`# NO RESUELTA: ${v.origenRaw} -> ${v.destinoRaw}`);
                }
            });
            
            invalidas.forEach(l => {
                lineasParaRevision.push(`# LÍNEA MAL FORMADA: ${l}`);
            });

            if (lineasParaRevision.length === 0) {
                Toast.show('La IA no generó relaciones válidas', 'warning');
                return;
            }

            // Abrir modal de revisión
            _abrirRevisionTextoPlano(lineasParaRevision.join('\n'), asig, cardsDisponibles);

        } catch (error) {
            Logger.error('Error generando mapa con IA:', error);
            Toast.show(`Error: ${error.message}`, 'error');
        }
    }

    // ── API pública ───────────────────────────────────────────────
    
    return {
        generarMapaConIA,
        _parsearRelacionesTexto,   // Expuesto para tests
        _normalizarTitulo,         // Expuesto para tests
        _resolverTitulo            // Expuesto para tests
    };
})();

// Registrar comando para acceso desde consola/tests
if (typeof CommandRegistry !== 'undefined') {
    CommandRegistry.register('generarMapaConIA', () => GraphAI.generarMapaConIA());
}
