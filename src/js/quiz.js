// ════════════════════════════════════════════════════════════════
// QUIZ.JS — Lógica del Modo Tipo Test con IA
// Genera preguntas tipo test usando IA, gestiona respuestas y actualiza FSRS.
// ════════════════════════════════════════════════════════════════

const Quiz = (() => {

    let _preguntas = [];
    let _idxActual = 0;
    let _respuestas = [];
    let _config = {};
    let _generacion = 0;

    function iniciar() {
        const asig = document.getElementById('ex-asig').value;
        const dificultad = document.querySelector('input[name="quiz-dificultad"]:checked')?.value || 'recluta';
        const numPreguntas = Math.min(20, Math.max(1, Number(document.getElementById('ex-num').value) || 5));
        const temperatura = document.querySelector('input[name="quiz-temperatura"]:checked')?.value || 'equilibrado';
        const filtros = EXAM.leerFiltros();
        if (filtros.hasta != null && filtros.desde != null && filtros.desde > filtros.hasta) return alert('Elige un final posterior al inicio.');
        const biblioteca = State.get('biblioteca') || {};
        if (!TestAI.conceptosDisponibles(biblioteca, asig, filtros).length) return alert('No hay contenido suficiente para generar el test con estos filtros.');
        _config = { asig, dificultad, numPreguntas, demo: false };
        _respuestas = []; _idxActual = 0;
        State.set('currentContext', 'quiz');
        Logger.info(`Tipo Test: ${asig}, ${dificultad}, ${numPreguntas} preguntas`);
        _generarPreguntasConIA(asig, numPreguntas, dificultad, temperatura, filtros);
    }

    function iniciarDemo() {
        cancelarGeneracion();
        _config = {asig:'Demostración', dificultad:'recluta', numPreguntas:3, demo:true};
        _preguntas = [
            {pregunta:'¿Cuál de estas funciones es inyectiva en los números reales?',opciones:['f(x)=x²','f(x)=2x+1','f(x)=|x|','f(x)=0'],correcta:1,explicacion:'La función afín con pendiente no nula es inyectiva.'},
            {pregunta:'¿Cuánto es 2 + 3?',opciones:['4','6','5','8'],correcta:2,explicacion:'La suma de dos y tres es cinco.'},
            {pregunta:'¿Qué propiedad cumple una aplicación biyectiva?',opciones:['Es inyectiva y sobreyectiva','Es siempre continua','Es siempre lineal','Su dominio es vacío'],correcta:0,explicacion:'Biyectiva significa simultáneamente inyectiva y sobreyectiva.'}
        ];
        _respuestas=[]; _idxActual=0;
        State.set('currentContext', 'quiz');
        State.set('quizEstado', {respuestas:[],idxActual:0});
        _mostrarPregunta(0);
    }

    function cancelarGeneracion() { _generacion++; }

    async function _generarPreguntasConIA(asig, num, dificultad, temperaturaKey, filtros = {}) {
        const generacion = ++_generacion;
        const sigueActiva = () => generacion === _generacion && State.get('currentContext') === 'quiz';
        UI_Quiz.renderCarga();

        try {
            // Generación tipo "caja negra": no se muestra el contenido al usuario
            const resultado = await TestAI.generarPreguntasParaTest(asig, num, dificultad, temperaturaKey, filtros);
            
            if (!sigueActiva()) return;
            if (resultado.preguntas.length === 0) {
                throw new Error('No se generaron preguntas válidas');
            }

            // Verificar si tenemos suficientes preguntas
            if (resultado.totalGeneradas < num) {
                // No hay suficientes preguntas válidas
                UI_Quiz.renderPreguntasInsuficientes(
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
                        _generarPreguntasConIA(asig, num, dificultad, temperaturaKey, filtros);
                    }
                );
            } else {
                // Hay suficientes o más de las necesarias - coger exactamente las solicitadas
                _preguntas = resultado.preguntas.slice(0, num);
                State.set('quizEstado', { respuestas: [], idxActual: 0 });
                _mostrarPregunta(0);
            }

        } catch (error) {
            if (!sigueActiva()) return;
            Logger.error('Error generando preguntas:', error);
            alert('Error al generar preguntas: ' + error.message + '\n\nAsegúrate de tener configurada una API Key en Ajustes.');
            EXAM.abrir();
            EXAM.setModo('quiz');
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
        

    }

    function irA(idx) {
        if (idx >= 0 && idx < _preguntas.length) _mostrarPregunta(idx);
    }

    function siguiente() {
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
            if (!_config.demo && esCorrecta && _config.asig !== 'ALL') {
                _actualizarFSRS(p.pregunta, true);
            } else if (!_config.demo && !esCorrecta && _config.asig !== 'ALL') {
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
        if (!_config.demo) EventBus.emit('QUIZ_COMPLETADO', {
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
        EXAM.abrir();
        EXAM.setModo('quiz');
    }

    return {
        iniciar,
        cancelarGeneracion,
        iniciarDemo,
        seleccionarOpcion,
        siguiente,
        anterior,
        irA,
        finalizar: _finalizar,
        repetir
    };
})();
