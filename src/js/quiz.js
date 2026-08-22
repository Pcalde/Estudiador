// ════════════════════════════════════════════════════════════════
// QUIZ.JS — Lógica del Modo Tipo Test con IA
// Genera preguntas tipo test usando IA, gestiona respuestas y actualiza FSRS.
// ════════════════════════════════════════════════════════════════

const Quiz = (() => {

    let _preguntas = [];
    let _idxActual = 0;
    let _respuestas = [];
    let _config = {};

    function iniciar() {
        const asig = document.getElementById('quiz-asig')?.value;
        const dificultad = document.getElementById('quiz-dificultad')?.value;
        const numPreguntas = parseInt(document.getElementById('quiz-num')?.value) || 5;

        if (!dificultad) {
            alert('Selecciona una dificultad (Recluta, Curtido o Veterano)');
            return;
        }

        Logger.info(`Iniciando Tipo Test: ${asig}, ${dificultad}, ${numPreguntas} preguntas`);

        _config = { asig, dificultad, numPreguntas };
        _respuestas = [];
        _idxActual = 0;

        // Obtener contenido de los apuntes
        const biblioteca = State.get('biblioteca') || {};
        let contenidoParaIA = '';

        if (asig === 'ALL') {
            Object.values(biblioteca).forEach(asignatura => {
                asignatura.forEach(c => {
                    contenidoParaIA += `Tema: ${c.Titulo}\n${c.Contenido}\n\n`;
                });
            });
        } else if (biblioteca[asig]) {
            biblioteca[asig].forEach(c => {
                contenidoParaIA += `Tema: ${c.Titulo}\n${c.Contenido}\n\n`;
            });
        }

        if (contenidoParaIA.trim().length === 0) {
            alert('No hay contenido en los apuntes seleccionados para generar preguntas.');
            return;
        }

        _generarPreguntasConIA(contenidoParaIA, numPreguntas, dificultad);
    }

    async function _generarPreguntasConIA(contenido, num, dificultad) {
        const modalContainer = document.getElementById('quiz-config');
        
        modalContainer.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fa-solid fa-brain fa-pulse fa-3x" style="color:var(--accent); margin-bottom:20px;"></i>
                <h3 style="color:#fff; margin:0 0 10px 0;">Generando preguntas...</h3>
                <p style="color:#888;">La IA está creando ${num} preguntas nivel ${dificultad.toUpperCase()}</p>
            </div>
        `;

        const prompt = `Eres un profesor universitario experto en crear exámenes tipo test.
Genera EXACTAMENTE ${num} preguntas de opción múltiple basadas en el siguiente contenido académico.

NIVEL DE DIFICULTAD: ${dificultad.toUpperCase()}
- RECLUTA: Preguntas directas sobre conceptos básicos y definiciones
- CURTIDO: Preguntas que requieren aplicación práctica y análisis
- VETERANO: Preguntas complejas sobre casos excepcionales, relaciones entre conceptos y detalles sutiles

FORMATO DE SALIDA OBLIGATORIO:
Debes responder ÚNICAMENTE con un JSON válido con esta estructura exacta, sin texto adicional:
[
  {
    "pregunta": "Texto de la pregunta",
    "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
    "correcta": 0,
    "explicacion": "Breve explicación de por qué es correcta"
  }
]

REQUISITOS:
- 4 opciones por pregunta (A, B, C, D)
- La opción correcta debe estar en posición aleatoria (0-3)
- Las opciones incorrectas deben ser plausibles pero claramente erróneas
- Usa notación LaTeX si es necesario ($...$)
- Basa las preguntas estrictamente en el contenido proporcionado

CONTENIDO ACADÉMICO:
${contenido.substring(0, 8000)}
`;

        try {
            const respuestaIA = await window.generarRespuestaIA(prompt);
            
            // Parsear JSON de la respuesta
            let preguntas;
            try {
                // Intentar extraer JSON si viene envuelto en texto
                const jsonMatch = respuestaIA.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    preguntas = JSON.parse(jsonMatch[0]);
                } else {
                    preguntas = JSON.parse(respuestaIA);
                }
            } catch (parseError) {
                Logger.error('Error parseando JSON de IA:', parseError);
                throw new Error('La IA no devolvió un formato JSON válido');
            }

            if (!Array.isArray(preguntas) || preguntas.length === 0) {
                throw new Error('No se generaron preguntas válidas');
            }

            _preguntas = preguntas.slice(0, num);
            State.set('quizEstado', { respuestas: [], idxActual: 0 });
            
            _mostrarPregunta(0);

        } catch (error) {
            Logger.error('Error generando preguntas:', error);
            alert('Error al generar preguntas: ' + error.message + '\\n\\nAsegúrate de tener configurada una API Key en Ajustes.');
            UI_Quiz.cerrar();
        }
    }

    function _mostrarPregunta(idx) {
        _idxActual = idx;
        UI_Quiz.renderPregunta(_preguntas[idx], idx, _preguntas.length);
    }

    function seleccionarOpcion(idx) {
        _respuestas[_idxActual] = idx;
        State.set('quizEstado', { 
            respuestas: [..._respuestas], 
            idxActual: _idxActual 
        });
        
        // Re-renderizar para mostrar selección
        UI_Quiz.renderPregunta(_preguntas[_idxActual], _idxActual, _preguntas.length);
    }

    function siguiente() {
        if (_respuestas[_idxActual] === undefined) {
            alert('Selecciona una respuesta antes de continuar');
            return;
        }

        if (_idxActual < _preguntas.length - 1) {
            _mostrarPregunta(_idxActual + 1);
        } else {
            _finalizar();
        }
    }

    function anterior() {
        if (_idxActual > 0) {
            _mostrarPregunta(_idxActual - 1);
        }
    }

    function _finalizar() {
        Logger.info('Tipo Test finalizado, calculando resultados...');

        const resultados = _preguntas.map((p, i) => {
            const opcionElegidaIdx = _respuestas[i];
            const esCorrecta = opcionElegidaIdx === p.correcta;

            // Actualizar FSRS si estamos en una asignatura específica
            if (esCorrecta && _config.asig !== 'ALL') {
                _actualizarFSRS(p.pregunta, true);
            } else if (!esCorrecta && _config.asig !== 'ALL') {
                _actualizarFSRS(p.pregunta, false);
            }

            return {
                pregunta: p.pregunta,
                opcionElegida: p.opciones[opcionElegidaIdx],
                opcionCorrecta: p.opciones[p.correcta],
                correcta: esCorrecta,
                explicacion: p.explicacion
            };
        });

        // Emitir evento para registro en app.js
        EventBus.emit('QUIZ_COMPLETADO', {
            asignatura: _config.asig,
            dificultad: _config.dificultad,
            aciertos: resultados.filter(r => r.correcta).length,
            total: resultados.length,
            fecha: new Date().toISOString()
        });

        UI_Quiz.renderResultados(resultados);
    }

    function _actualizarFSRS(concepto, acierto) {
        // Buscar tarjeta relacionada en la biblioteca actual
        const biblioteca = State.get('biblioteca') || {};
        const asig = _config.asig;
        
        if (!biblioteca[asig]) return;

        // Búsqueda heurística por similitud de texto
        const tarjetaRelacionada = biblioteca[asig].find(t => 
            t.Titulo.toLowerCase().includes(concepto.substring(0, 30).toLowerCase()) ||
            concepto.toLowerCase().includes(t.Titulo.toLowerCase().substring(0, 30))
        );

        if (tarjetaRelacionada && tarjetaRelacionada.FSRS) {
            const fsrs = tarjetaRelacionada.FSRS;
            
            // Acierto: aumentar intervalo ligeramente
            // Fallo: reducir intervalo
            const factor = acierto ? 1.1 : 0.7;
            fsrs.interval = Math.max(1, Math.round(fsrs.interval * factor));
            fsrs.repetitions = acierto ? fsrs.repetitions + 1 : 0;
            fsrs.difficulty = acierto 
                ? Math.max(1, fsrs.difficulty - 0.1) 
                : Math.min(10, fsrs.difficulty + 0.2);

            Logger.info(`FSRS actualizado para "${tarjetaRelacionada.Titulo}": ${acierto ? 'acierto' : 'fallo'} → intervalo: ${fsrs.interval}`);
            
            // Guardar cambios
            State.set('biblioteca', biblioteca);
            persistirDatosLocales('biblioteca', biblioteca);
        }
    }

    function repetir() {
        _preguntas = [];
        _respuestas = [];
        _idxActual = 0;
        UI_Quiz.abrir();
    }

    return {
        iniciar,
        seleccionarOpcion,
        siguiente,
        anterior,
        finalizar: _finalizar,
        repetir
    };
})();
