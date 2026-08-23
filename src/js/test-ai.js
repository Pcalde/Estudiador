// ════════════════════════════════════════════════════════════════
// TEST-AI.JS — Generación de Tipo Test con IA
// Formato DSL lineal robusto para evitar problemas con LaTeX
// Control de temperatura semántico: Conservador, Equilibrado, Innovador
// Generación tipo "caja negra": usuario no ve preguntas hasta empezar
// ════════════════════════════════════════════════════════════════

const TestAI = (() => {

    // ── Configuración de temperaturas semánticas ─────────────────

    const TEMPERATURAS = {
        'conservador': { value: 0.2, label: 'Conservador', icon: 'fa-shield-halved', desc: 'Preguntas directas basadas estrictamente en el contenido' },
        'equilibrado': { value: 0.5, label: 'Equilibrado', icon: 'fa-scale-balanced', desc: 'Mezcla de preguntas conceptuales y de aplicación' },
        'innovador':   { value: 0.8, label: 'Innovador', icon: 'fa-lightbulb', desc: 'Preguntas creativas que exploran relaciones no obvias' }
    };

    // ── Parser tolerante de DSL para tipo test ───────────────────

    /**
     * Parsea texto formato DSL para tipo test:
     * Pregunta: [texto de la pregunta]
     * A) [opción A]
     * B) [opción B] ✓
     * C) [opción C]
     * D) [opción D]
     * ---
     * 
     * Soporta LaTeX en preguntas y opciones ($...$, $$...$$)
     * Ignora líneas vacías y comentarios (#)
     */
    function _parsearPreguntasTexto(texto) {
        const validas = [];
        const invalidas = [];
        
        const bloques = texto.split(/---+\n?/).filter(b => b.trim().length > 0);
        
        bloques.forEach(bloque => {
            const lineas = bloque.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
            
            if (lineas.length < 5) {
                invalidas.push({ tipo: 'incompleto', contenido: bloque.substring(0, 100) });
                return;
            }
            
            const lineaPregunta = lineas.find(l => l.toLowerCase().startsWith('pregunta:'));
            if (!lineaPregunta) {
                invalidas.push({ tipo: 'sin_pregunta', contenido: bloque.substring(0, 100) });
                return;
            }
            
            const preguntaTexto = lineaPregunta.replace(/^pregunta:\s*/i, '').trim();
            
            // Extraer opciones (líneas que empiezan con A), B), C), D))
            const opciones = [];
            let correctaIdx = -1;
            
            ['A', 'B', 'C', 'D'].forEach((letra, idx) => {
                const regex = new RegExp(`^${letra}\\)\\s*(.+?)\\s*(✓)?\\s*$`, 'i');
                const match = lineas.find(l => regex.test(l.trim()));
                
                if (match) {
                    const m = match.trim().match(regex);
                    opciones.push(m[1].trim());
                    if (m[2]) correctaIdx = idx;
                }
            });
            
            if (opciones.length < 4 || correctaIdx === -1) {
                invalidas.push({ 
                    tipo: 'opciones_invalidas', 
                    contenido: `Pregunta: ${preguntaTexto.substring(0, 50)}`,
                    detalle: `Opciones: ${opciones.length}, Correcta marcada: ${correctaIdx !== -1}`
                });
                return;
            }
            
            // Buscar explicación opcional
            const lineaExplicacion = lineas.find(l => l.toLowerCase().startsWith('explicación:') || l.toLowerCase().startsWith('explicacion:'));
            const explicacion = lineaExplicacion ? lineaExplicacion.replace(/^explicaci[oó]n:\s*/i, '').trim() : '';
            
            validas.push({
                pregunta: preguntaTexto,
                opciones: opciones,
                correcta: correctaIdx,
                explicacion: explicacion
            });
        });
        
        return { validas, invalidas };
    }

    // ── Función de fallback con segundo pase de IA ───────────────

    async function _reintentarPreguntasInvalidas(invalidas, contenidoOriginal, temperatura) {
        if (invalidas.length === 0) return [];
        
        const promptFallback = `Las siguientes preguntas tipo test tienen errores de formato o no se pudieron parsear.
Reparalas usando EXACTAMENTE este formato DSL:

Pregunta: [texto de la pregunta con LaTeX si es necesario]
A) [opción A]
B) [opción B] ✓
C) [opción C]
D) [opción D]
Explicación: [breve explicación]
---

ERRORES DETECTADOS:
${invalidas.map((inv, i) => `${i + 1}. ${inv.tipo}: ${inv.contenido}`).join('\n')}

CONTENIDO ORIGINAL DE REFERENCIA:
${contenidoOriginal.substring(0, 3000)}

Devuelve ÚNICAMENTE las preguntas reparadas en el formato DSL especificado, sin texto adicional.`;

        try {
            const respuesta = await AI.generarRespuestaConTemperatura(promptFallback, temperatura.value);
            const { validas } = _parsearPreguntasTexto(respuesta);
            return validas;
        } catch (error) {
            Logger.warn('Fallback de IA fallido:', error);
            return [];
        }
    }

    // ── Modal de advertencia cuando no hay suficientes preguntas ─

    function _abrirAdvertenciaPreguntasInsuficientes(numEsperado, numDisponibles, onContinuar, onReintentar) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999999; display:flex; align-items:center; justify-content:center;';

        overlay.innerHTML = `
            <div style="background:var(--card-bg); width:500px; max-width:90vw; border-radius:12px; border:1px solid var(--border); padding:20px; display:flex; flex-direction:column; gap:12px;">
                <h4 style="margin:0; color:var(--accent);"><i class="fa-solid fa-triangle-exclamation"></i> Preguntas insuficientes</h4>
                <p style="font-size:0.9em; color:var(--text-main); margin:0;">
                    Se solicitaron <strong>${numEsperado}</strong> preguntas, pero solo <strong>${numDisponibles}</strong> superaron la validación de sintaxis.
                </p>
                <p style="font-size:0.85em; color:var(--text-muted); margin:0;">
                    Las preguntas inválidas se descartan automáticamente para mantener la calidad del test.
                </p>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                    <button id="test-reintentar" style="padding:8px 16px; background:transparent; border:1px solid var(--border); color:var(--text-muted); border-radius:6px; cursor:pointer;"><i class="fa-solid fa-rotate-right"></i> Reintentar generación</button>
                    <button id="test-continuar" style="padding:8px 16px; background:var(--accent); border:none; color:#000; border-radius:6px; font-weight:bold; cursor:pointer;"><i class="fa-solid fa-play"></i> Continuar con ${numDisponibles}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#test-reintentar').onclick = () => {
            overlay.remove();
            onReintentar();
        };
        overlay.querySelector('#test-continuar').onclick = () => {
            overlay.remove();
            onContinuar(numDisponibles);
        };
    }

    // ── Selección de batch de conceptos para contexto ────────────

    function _seleccionarBatchConceptos(asig, numConceptos) {
        let cardsDisponibles = [];
        
        if (asig === 'ALL') {
            const biblioteca = State.get('biblioteca') || {};
            Object.values(biblioteca).forEach(asignatura => {
                cardsDisponibles.push(...asignatura);
            });
        } else {
            // Usar la función pública que maneja carpetas
            cardsDisponibles = UISidebar.obtenerTarjetasPorAsignatura(asig);
        }
        
        // Filtrar cards con contenido relevante
        cardsDisponibles = cardsDisponibles.filter(c => 
            c.Contenido && c.Contenido.trim().length > 50 &&
            c.Titulo && c.Titulo.trim().length > 0
        );
        
        if (cardsDisponibles.length === 0) {
            return '';
        }
        
        // Seleccionar batch aleatorio (sobredimensionado para tener margen)
        const batchSize = Math.min(numConceptos, cardsDisponibles.length);
        const seleccion = [];
        const indicesUsados = new Set();
        
        while (seleccion.length < batchSize && indicesUsados.size < cardsDisponibles.length) {
            const idx = Math.floor(Math.random() * cardsDisponibles.length);
            if (!indicesUsados.has(idx)) {
                indicesUsados.add(idx);
                seleccion.push(cardsDisponibles[idx]);
            }
        }
        
        // Construir texto de contexto
        return seleccion.map(c => `Concepto: ${c.Titulo}\n${c.Contenido}`).join('\n\n');
    }

    // ── Generación de preguntas con IA (caja negra) ──────────────

    async function generarPreguntasParaTest(asig, numPreguntas, dificultad, temperaturaKey) {
        const temperatura = TEMPERATURAS[temperaturaKey] || TEMPERATURAS.equilibrado;
        
        // Factor de sobregeneración: pedir 25% más para tener margen de descarte
        const factorSobreGeneracion = 1.25;
        const numPreguntasAGenerar = Math.ceil(numPreguntas * factorSobreGeneracion);
        
        // Seleccionar batch de conceptos aleatorios como contexto
        const contexto = _seleccionarBatchConceptos(asig, numPreguntasAGenerar * 2);
        
        if (contexto.trim().length === 0) {
            throw new Error('No hay contenido disponible en los apuntes para generar preguntas');
        }
        
        const prompt = `Eres un profesor universitario experto en crear exámenes tipo test sobre matemáticas.
Genera EXACTAMENTE ${numPreguntasAGenerar} preguntas de opción múltiple basadas ÚNICAMENTE en el siguiente contexto académico.

NIVEL DE DIFICULTAD: ${dificultad.toUpperCase()}
- RECLUTA: Preguntas directas sobre conceptos básicos y definiciones
- CURTIDO: Preguntas que requieren aplicación práctica y análisis
- VETERANO: Preguntas complejas sobre casos excepcionales, relaciones entre conceptos y detalles sutiles

TEMPERATURA DE CREATIVIDAD: ${temperatura.label} (${temperatura.value})
- Usa este valor para calibrar qué tanto puedes "delirar" preguntas creativas vs. ceñirte estrictamente al contenido

FORMATO DE SALIDA OBLIGATORIO (DSL LINEAL):
Debes responder ÚNICAMENTE con preguntas en este formato exacto, sin JSON ni texto adicional:

Pregunta: [Texto de la pregunta. Usa LaTeX si es necesario: $\\int_0^1 x^2 dx$]
A) [Opción A con LaTeX si corresponde]
B) [Opción B con LaTeX si corresponde] ✓
C) [Opción C con LaTeX si corresponde]
D) [Opción D con LaTeX si corresponde]
Explicación: [Breve explicación de por qué es correcta]
---
Pregunta: [Siguiente pregunta...]
A) ...
B) ... ✓
C) ...
D) ...
Explicación: [...]
---

REQUISITOS CRÍTICOS:
1. EXACTAMENTE 4 opciones por pregunta (A, B, C, D)
2. Marca la opción CORRECTA con ✓ al final de la línea
3. La posición de la correcta debe ser aleatoria (no siempre la misma)
4. Las opciones incorrectas deben ser plausibles pero claramente erróneas
5. USA LaTeX SIEMPRE QUE SEA NECESARIO ($...$ para inline, $$...$$ para display)
6. Basa las preguntas estrictamente en el contexto proporcionado
7. Separa cada pregunta con una línea que contenga solo "---"

CONTEXTO ACADÉMICO:
${contexto.substring(0, 8000)}`;

        try {
            const respuestaIA = await AI.generarRespuestaConTemperatura(prompt, temperatura.value);
            const { validas, invalidas } = _parsearPreguntasTexto(respuestaIA);
            
            // Intentar recuperar preguntas inválidas con fallback (solo si necesitamos más)
            if (invalidas.length > 0 && validas.length < numPreguntas) {
                Logger.info(`Intentando recuperar ${invalidas.length} preguntas inválidas...`);
                const recuperadas = await _reintentarPreguntasInvalidas(invalidas, contexto, temperatura);
                validas.push(...recuperadas);
            }
            
            // Retornar TODAS las válidas (el caller decide cuántas usar)
            return {
                preguntas: validas,
                numEsperado: numPreguntas,
                totalGeneradas: validas.length
            };
            
        } catch (error) {
            Logger.error('Error generando preguntas:', error);
            throw error;
        }
    }

    // ── Construcción de texto DSL para revisión ──────────────────

    function _construirTextoDSL(preguntas) {
        return preguntas.map(p => {
            const opcionesDSL = p.opciones.map((opt, idx) => {
                const marcaCorrecta = idx === p.correcta ? ' ✓' : '';
                return `${String.fromCharCode(65 + idx)}) ${opt}${marcaCorrecta}`;
            }).join('\n');
            
            return `Pregunta: ${p.pregunta}
${opcionesDSL}
Explicación: ${p.explicacion || ''}
---`;
        }).join('\n\n');
    }

    // ── API pública ───────────────────────────────────────────────

    return {
        generarPreguntasParaTest,
        _parsearPreguntasTexto,
        _construirTextoDSL,
        _abrirAdvertenciaPreguntasInsuficientes,
        TEMPERATURAS
    };
})();

// Registrar comando para acceso desde consola/tests
if (typeof CommandRegistry !== 'undefined') {
    CommandRegistry.register('generarPreguntasTestIA', (asig, num, dif, temp) => {
        return TestAI.generarPreguntasParaTest(asig, num, dif, temp);
    });
}
