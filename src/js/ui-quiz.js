// ════════════════════════════════════════════════════════════════
// UI-QUIZ.JS — Interfaz de Usuario para Modo Tipo Test
// Maneja la renderización del modal, selector de dificultad y resultados.
// ════════════════════════════════════════════════════════════════

const UI_Quiz = (() => {

    const DIFICULTADES = {
        'recluta':   { label: 'RECLUTA',   icon: 'fa-person-military-rifle', color: '#4CAF50', desc: 'Preguntas directas y conceptuales' },
        'curtido':   { label: 'CURTIDO',   icon: 'fa-person-military-pointing', color: '#FF9800', desc: 'Aplicación práctica y análisis' },
        'veterano':  { label: 'VETERANO',  icon: 'fa-skull-crossbones', color: '#f44336', desc: 'Casos complejos y excepciones' }
    };
    const TIPOS_COLORES = { 'Definición':'#c40202', 'Teorema':'#1e4fb2', 'Proposición':'#16a116', 'Lema':'#3b9c67', 'Corolario':'#00bcd4', 'Axioma':'#9c27b0', 'Observación':'#7242A3', 'Nota':'#9e9e9e', 'Ejemplo':'#3db370', 'Ejercicio':'#ff8c00' };

    function cabecera(titulo, detalle = '') {
        return `<header class="exam-quiz-header">
            <div><h3>${titulo}</h3>${detalle ? `<p>${detalle}</p>` : ''}</div>
            <button type="button" class="btn-modern btn-neutral" data-action="volverDeQuiz">Volver a Examen</button>
        </header>`;
    }

    function mostrar(id, contenido) {
        const panel = document.getElementById(id);
        panel.innerHTML = contenido;
        EXAM.mostrarVista(id);
        panel.querySelector('h3')?.setAttribute('tabindex', '-1');
        panel.querySelector('h3')?.focus({ preventScroll: true });
    }

    function abrir() {
        Quiz.cancelarGeneracion();
        EXAM.abrir();
        EXAM.setModo('quiz');
    }

    function cerrar() {
        Quiz.cancelarGeneracion();
        EXAM.abrir();
        document.getElementById('ex-mode-btn-quiz')?.focus();
    }

    function tarjetasOpciones(id, titulo, datos, valor) {
        const tarjetas = Object.entries(datos).map(([key, item]) => `
            <label class="exam-mode-card exam-quiz-choice" style="--quiz-choice-color:${item.color || 'var(--accent)'}">
                <input type="radio" name="${id}" value="${escapeHtml(key)}" ${key === valor ? 'checked' : ''}>
                <span class="exam-mode-icon" aria-hidden="true"><i class="fa-solid ${escapeHtml(item.icon)}"></i></span>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.desc || '')}</small>
            </label>`).join('');
        return `<fieldset class="exam-quiz-choice-group exam-quiz-wide">
            <legend>${titulo}</legend><div class="exam-quiz-choices">${tarjetas}</div>
        </fieldset>`;
    }

    function renderConfig() {
        const biblioteca = State.get('biblioteca') || {};
        const actual = State.get('nombreAsignaturaActual');
        const asignaturas = Object.keys(biblioteca).map(nombre =>
            `<option value="${escapeHtml(nombre)}" ${nombre === actual ? 'selected' : ''}>${escapeHtml(nombre)}</option>`).join('');
        mostrar('quiz-config', `
            ${cabecera('Tipo Test', 'Genera preguntas con IA a partir de tus apuntes.')}
            <form id="quiz-form" class="exam-quiz-form">
                <label class="exam-quiz-wide">Asignatura
                    <select id="quiz-asig" class="form-input"><option value="ALL">Todas las asignaturas</option>${asignaturas}</select>
                </label>
                ${tarjetasOpciones('quiz-dificultad', 'Dificultad', DIFICULTADES, 'recluta')}
                ${tarjetasOpciones('quiz-temperatura', 'Creatividad de la IA', TestAI.TEMPERATURAS, 'equilibrado')}
                <fieldset class="exam-quiz-filter-group exam-quiz-wide"><legend>Tipos de contenido</legend><div id="quiz-tipos-grid" class="exam-quiz-type-grid"></div></fieldset>
                <fieldset class="exam-quiz-filter-group exam-quiz-wide"><legend>Contenido incluido</legend><div id="quiz-filtros-contenido" class="exam-quiz-filter-grid"></div><small>Si no marcas nada, se usará todo el contenido disponible.</small></fieldset>
                <label>Preguntas
                    <input id="quiz-num" class="form-input" type="number" min="3" max="20" value="5" required>
                </label>
                <fieldset class="exam-quiz-filter-group exam-quiz-wide" id="quiz-tramo"><legend>Tramo estudiado</legend>
                    <div class="exam-quiz-filter-grid"><label>Desde<select id="quiz-desde" class="form-input"></select></label><label>Hasta (incluido)<select id="quiz-hasta" class="form-input"></select></label></div>
                </fieldset>
                <label class="exam-quiz-option exam-quiz-wide" style="display:flex"><input type="checkbox" id="quiz-repaso" style="width:1rem">Repasar solo conceptos difíciles o con fallos registrados</label>
                <button class="btn-modern btn-success exam-quiz-wide" type="submit">Comenzar test</button>
            </form>`);
        document.getElementById('quiz-form').addEventListener('submit', event => {
            event.preventDefault();
            Quiz.iniciar();
        });
        const actualizarFiltros = () => {
            const seleccion = document.getElementById('quiz-asig').value;
            const tarjetas = seleccion === 'ALL' ? Object.values(biblioteca).flat() : (biblioteca[seleccion] || []);
            document.getElementById('quiz-tramo').hidden = seleccion === 'ALL';
            const opciones = seleccion === 'ALL' ? '' : tarjetas.map((c, i) => `<option value="${i}">${i + 1}. ${escapeHtml(String(c.Titulo || c.Apartado || 'Sin título'))}</option>`).join('');
            document.getElementById('quiz-desde').innerHTML = '<option value="">Principio</option>' + opciones;
            document.getElementById('quiz-hasta').innerHTML = '<option value="">Final</option>' + opciones;
            const tipos = [...new Set(tarjetas.map(card => card.Tipo).filter(Boolean))].sort();
            document.getElementById('quiz-tipos-grid').innerHTML = tipos.map(tipo => {
                const color = State.get('tiposTarjeta')?.[tipo]?.color || TIPOS_COLORES[tipo] || '#888';
                return `<label class="exam-quiz-type" style="--type-color:${color}"><input type="checkbox" name="quiz-tipo" value="${escapeHtml(String(tipo))}" checked> ${escapeHtml(String(tipo))}</label>`;
            }).join('') || '<span>Sin tipos disponibles</span>';
            const temas = [...new Set(tarjetas.map(card => card.Tema).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
            const apartados = [...new Set(tarjetas.map(card => card.Apartado).filter(Boolean))].sort();
            const pintar = (nombre, valores, etiqueta) => valores.length ? valores.map(valor => {
                const color = nombre === 'quiz-apartado' ? (State.get('tiposTarjeta')?.[valor]?.color || TIPOS_COLORES[valor] || 'var(--accent)') : 'var(--accent)';
                return `<label class="exam-quiz-type" style="--type-color:${color}"><input type="checkbox" name="${nombre}" value="${escapeHtml(String(valor))}"> ${etiqueta}${escapeHtml(String(valor))}</label>`;
            }).join('') : '<span class="exam-quiz-empty">Sin opciones disponibles</span>';
            document.getElementById('quiz-filtros-contenido').innerHTML = `<div class="exam-quiz-content-column"><strong>Temas</strong><div class="exam-quiz-content-list">${pintar('quiz-tema', temas, 'Tema ')}</div></div><div class="exam-quiz-content-column"><strong>Apartados</strong><div class="exam-quiz-content-list">${pintar('quiz-apartado', apartados, '')}</div></div>`;
        };
        document.getElementById('quiz-asig').addEventListener('change', actualizarFiltros);
        actualizarFiltros();
    }

    function renderCarga() {
        mostrar('quiz-config', `${cabecera('Tipo Test')}
            <p role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Generando preguntas...</p>`);
    }

    function renderPreguntasInsuficientes(solicitadas, disponibles, continuar, reintentar) {
        mostrar('quiz-config', `${cabecera('Tipo Test')}
            <p>Se han generado ${disponibles} de las ${solicitadas} preguntas solicitadas.</p>
            <div class="exam-quiz-controls">
                <button id="quiz-reintentar" class="btn-modern btn-neutral" type="button">Reintentar</button>
                <button id="quiz-continuar" class="btn-modern btn-success" type="button">Continuar con ${disponibles}</button>
            </div>`);
        document.getElementById('quiz-reintentar').onclick = reintentar;
        document.getElementById('quiz-continuar').onclick = () => continuar(disponibles);
    }

    function renderPregunta(pregunta, idx, total) {
        const elegida = State.get('quizEstado')?.respuestas?.[idx];
        const opciones = pregunta.opciones.map((opt, i) => `
            <label class="exam-quiz-option">
                <input type="radio" name="quiz-respuesta" value="${i}" ${elegida === i ? 'checked' : ''}>
                <span>${escapeHtml(opt)}</span>
            </label>`).join('');
        mostrar('quiz-pregunta', `
            ${cabecera('Tipo Test', `Pregunta ${idx + 1} de ${total}`)}
            <div class="exam-question-progress"><div class="exam-progress-track"><div class="exam-progress-fill" style="width:${((idx + 1) / total) * 100}%"></div></div><span>P ${idx + 1}/${total}</span></div>
            <nav class="exam-question-nav" aria-label="Navegación entre preguntas">${Array.from({length:total}, (_,i) => `<button type="button" class="exam-question-dot ${i === idx ? 'current' : ''} ${State.get('quizEstado')?.respuestas?.[i] !== undefined ? 'answered' : ''}" data-quiz-ir="${i}" aria-label="Pregunta ${i+1}" ${i === idx ? 'aria-current="step"' : ''}>${i+1}</button>`).join('')}</nav>
            <fieldset class="exam-quiz-options"><legend>${escapeHtml(pregunta.pregunta)}</legend>${opciones}</fieldset>
            <footer class="exam-quiz-controls">
                <button type="button" class="btn-modern btn-neutral" data-action="quizAnterior" ${idx === 0 ? 'disabled' : ''}>Anterior</button>
                <button type="button" class="btn-modern btn-success" data-action="quizSiguiente">${idx + 1 === total ? 'Entregar test' : 'Siguiente'}</button>
            </footer>`);
        const panel = document.getElementById('quiz-pregunta');
        panel.querySelector('fieldset').addEventListener('change', event => {
            Quiz.seleccionarOpcion(Number(event.target.value));
            panel.querySelector(`[data-quiz-ir="${idx}"]`)?.classList.add('answered');
        });
        panel.querySelectorAll('[data-quiz-ir]').forEach(btn => btn.addEventListener('click', () => Quiz.irA(Number(btn.dataset.quizIr))));
        globalThis.MathJax?.typesetPromise?.([panel]).catch(() => {});
    }

    function renderResultados(resultados) {
        const aciertos = resultados.filter(r => r.correcta).length;
        const lista = document.createElement('div');
        lista.className = 'exam-quiz-results';
        lista.innerHTML = resultados.map((r, i) => `
            <article class="exam-quiz-result ${r.correcta ? 'quiz-correcta' : ''}">
                <h4>${i + 1}. ${escapeHtml(r.pregunta)}</h4>
                <p>${r.correcta ? 'Correcta' : (r.opcionElegida === undefined ? 'Sin responder' : 'Incorrecta')}: ${escapeHtml(r.opcionElegida ?? '—')}</p>
                ${r.correcta ? '' : `<p>Respuesta correcta: ${escapeHtml(r.opcionCorrecta)}</p>`}
                ${r.explicacion ? `<p>${escapeHtml(r.explicacion)}</p>` : ''}
            </article>`).join('');
        EXAM.mostrarResultadoExterno({
            origen: 'quiz', nota: resultados.length ? 10 * aciertos / resultados.length : 0,
            bien: aciertos, mal: resultados.length - aciertos,
            descripcion: `Tipo Test · ${resultados.length} preguntas`, detalles: lista
        });
        globalThis.MathJax?.typesetPromise?.([lista]).catch(() => {});
    }

    return { abrir, cerrar, renderConfig, renderCarga, renderPreguntasInsuficientes, renderPregunta, renderResultados };
})();

CommandRegistry.register('quiz', () => UI_Quiz.abrir());
CommandRegistry.register('volverDeQuiz', () => UI_Quiz.cerrar());
CommandRegistry.register('quizAnterior', () => Quiz.anterior());
CommandRegistry.register('quizSiguiente', () => Quiz.siguiente());
CommandRegistry.register('quizRepetir', () => Quiz.repetir());
