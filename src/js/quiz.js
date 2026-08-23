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

        // Obtener contenido de los apuntes usando la función pública que maneja carpetas
        const tarjetas = UISidebar.obtenerTarjetasPorAsignatura(asig);
        let contenidoParaIA = '';

        if (asig === 'ALL') {
            const biblioteca = State.get('biblioteca') || {};
            Object.values(biblioteca).forEach(asignatura => {
                asignatura.forEach(c => {
                    contenidoParaIA += `Tema: ${c.Titulo}\n${c.Contenido}\n\n`;
                });
            });
        } else if (tarjetas.length > 0) {
            tarjetas.forEach(c => {
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
        const temperaturaKey = document.getElementById('quiz-temperatura')?.value || 'equilibrado';
        const asig = document.getElementById('quiz-asig')?.value;
        
        const modalContainer = document.getElementById('quiz-config');
        
        modalContainer.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                    <button onclick="UI_Quiz.cerrar()" style="background:none; border:none; color:#888; cursor:pointer; font-size:1.2em;" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <i class="fa-solid fa-brain fa-pulse fa-3x" style="color:var(--accent); margin-bottom:20px;"></i>
                <h3 style="color:#fff; margin:0 0 10px 0;">Generando preguntas...</h3>
                <p style="color:#888;">La IA está creando ${num} preguntas nivel ${dificultad.toUpperCase()}</p>
                <p style="color:#666; font-size:0.85em; margin-top:15px;">Puedes cerrar esta ventana si prefieres. El proceso continuará en segundo plano.</p>
            </div>
        `;

        try {
            // Generación tipo "caja negra": no se muestra el contenido al usuario
            const resultado = await TestAI.generarPreguntasParaTest(asig, num, dificultad, temperaturaKey);
            
            if (resultado.preguntas.length === 0) {
                throw new Error('No se generaron preguntas válidas');
            }

            // Verificar si tenemos suficientes preguntas
            if (resultado.totalGeneradas < num) {
                // No hay suficientes preguntas válidas
                TestAI._abrirAdvertenciaPreguntasInsuficientes(
                    num,
                    resultado.totalGeneradas,
                    // Callback: continuar con las disponibles
                    (numDisponibles) => {
                        _preguntas = resultado.preguntas.slice(0, numDisponibles);
                        State.set('quizEstado', { respuestas: [], idxActual: 0 });
                        _mostrarPregunta(0);
                    },
                    // Callback: reintentar
                    () => {
                        _generarPreguntasConIA(contenido, num, dificultad);
                    }
                );
            } else {
                // Hay suficientes o más de las necesarias - coger exactamente las solicitadas
                _preguntas = resultado.preguntas.slice(0, num);
                State.set('quizEstado', { respuestas: [], idxActual: 0 });
                _mostrarPregunta(0);
            }

        } catch (error) {
            Logger.error('Error generando preguntas:', error);
            alert('Error al generar preguntas: ' + error.message + '\n\nAsegúrate de tener configurada una API Key en Ajustes.');
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
        // Buscar tarjeta relacionada usando la función pública que maneja carpetas
        const asig = _config.asig;
        
        if (asig === 'ALL') return; // No actualizar FSRS en modo todas las asignaturas
        
        const tarjetas = UISidebar.obtenerTarjetasPorAsignatura(asig);
        if (tarjetas.length === 0) return;

        // Búsqueda heurística por similitud de texto
        const tarjetaRelacionada = tarjetas.find(t => 
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
            const biblioteca = State.get('biblioteca') || {};
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
