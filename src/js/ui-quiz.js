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

    function abrir() {
        const modal = document.getElementById('quiz-modal');
        if (!modal) return;

        modal.style.display = 'flex';
        _renderConfig();
    }

    function cerrar() {
        const modal = document.getElementById('quiz-modal');
        if (modal) modal.style.display = 'none';
    }

    function _renderConfig() {
        const container = document.getElementById('quiz-config');
        if (!container) return;
        _mostrarVista('quiz-config');
        
        const biblioteca = State.get('biblioteca') || {};
        const asigActual = State.get('nombreAsignaturaActual');

        const opcionesAsig = Object.keys(biblioteca).map(a => 
            `<option value="${a}" ${a === asigActual ? 'selected' : ''}>${a}</option>`
        ).join('');

        const htmlDificultades = Object.entries(DIFICULTADES).map(([key, data]) => `
            <div class="diff-option" data-diff="${key}" onclick="UI_Quiz._api.selectDificultad('${key}')" 
                 style="border: 2px solid #333; background: rgba(0,0,0,0.2);">
                <i class="fa-solid ${data.icon}" style="color: ${data.color}; font-size: 1.5em;"></i>
                <span style="font-weight: bold; color: ${data.color};">${data.label}</span>
                <small style="display:block; color:#888; margin-top:4px;">${data.desc}</small>
            </div>
        `).join('');

        container.innerHTML = `
            <div style="display:flex; justify-content:flex-end; margin-bottom:-10px;">
                <button onclick="UI_Quiz.cerrar()" style="background:none; border:none; color:#888; cursor:pointer; font-size:1.3em;" title="Cerrar">✕</button>
            </div>
            <div style="text-align:center; margin-bottom:20px;">
                <h3 style="color:#fff; margin:0 0 10px 0;"><i class="fa-solid fa-list-check"></i> Configurar Tipo Test</h3>
                <p style="color:#888; font-size:0.9em;">Genera preguntas automáticas con IA basadas en tus apuntes</p>
            </div>

            <div style="margin-bottom:15px;">
                <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:5px;">ASIGNATURA</label>
                <select id="quiz-asig" style="width:100%; padding:8px; background:#1a1a1a; border:1px solid #333; color:#fff; border-radius:6px;">
                    <option value="ALL">🌟 TODAS LAS ASIGNATURAS</option>
                    ${opcionesAsig}
                </select>
            </div>

            <div style="margin-bottom:20px;">
                <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:10px;">DIFICULTAD</label>
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
                    ${htmlDificultades}
                </div>
                <input type="hidden" id="quiz-dificultad" value="">
            </div>

            <div style="margin-bottom:20px;">
                <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:5px;">NÚMERO DE PREGUNTAS</label>
                <input type="number" id="quiz-num" value="5" min="3" max="20" 
                       style="width:100%; padding:8px; background:#1a1a1a; border:1px solid #333; color:#fff; border-radius:6px;">
            </div>

            <button onclick="UI_Quiz._api.iniciar()" 
                    style="width:100%; padding:12px; background:var(--accent); color:#fff; border:none; border-radius:8px; font-size:1em; font-weight:bold; cursor:pointer;">
                <i class="fa-solid fa-play"></i> COMENZAR TEST
            </button>
        `;
    }

    function selectDificultad(key) {
        document.querySelectorAll('.diff-option').forEach(el => {
            el.style.borderColor = '#333';
            el.style.background = 'rgba(0,0,0,0.2)';
        });
        
        const selected = document.querySelector(`.diff-option[data-diff="${key}"]`);
        if (selected) {
            selected.style.borderColor = DIFICULTADES[key].color;
            selected.style.background = `${DIFICULTADES[key].color}15`;
        }
        
        document.getElementById('quiz-dificultad').value = key;
    }

    function renderPregunta(pregunta, idx, total) {
        const container = document.getElementById('quiz-pregunta-container');
        if (!container) return;
        _mostrarVista('quiz-pregunta');
        
        const opcionesHtml = pregunta.opciones.map((opt, i) => `
            <div class="quiz-opcion" data-idx="${i}" onclick="UI_Quiz._api.seleccionarOpcion(${i})"
                 style="padding:12px; border:2px solid #333; border-radius:8px; cursor:pointer; transition:all 0.2s; background:#1a1a1a;">
                <span style="font-weight:bold; color:var(--accent); margin-right:8px;">${String.fromCharCode(65+i)})</span>
                <span style="color:#eee;">${opt}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <span style="color:#888; font-size:0.9em;">Pregunta ${idx+1} de ${total}</span>
                <div style="height:6px; width:150px; background:#333; border-radius:3px; overflow:hidden;">
                    <div style="height:100%; width:${((idx+1)/total)*100}%; background:var(--accent); transition:width 0.3s;"></div>
                </div>
                <button onclick="UI_Quiz.cerrar()" style="background:none; border:none; color:#888; cursor:pointer; font-size:1.2em;" title="Abandonar test">✕</button>
            </div>
            
            <div style="background:#1a1a1a; padding:15px; border-radius:8px; margin-bottom:20px; border-left:4px solid var(--accent);">
                <p style="color:#fff; font-size:1.1em; line-height:1.5; margin:0;">${pregunta.pregunta}</p>
            </div>

            <div style="display:grid; gap:10px;">
                ${opcionesHtml}
            </div>

            <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                <button onclick="UI_Quiz._api.anterior()" id="quiz-btn-anterior" 
                        style="padding:10px 20px; background:#333; color:#fff; border:none; border-radius:6px; cursor:pointer; ${idx===0?'opacity:0.5;pointer-events:none;':''}">
                    <i class="fa-solid fa-arrow-left"></i> Anterior
                </button>
                <button onclick="UI_Quiz._api.siguiente()" id="quiz-btn-siguiente"
                        style="padding:10px 20px; background:var(--accent); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                    ${idx === total-1 ? 'Finalizar' : 'Siguiente'} <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;

        // Marcar opción seleccionada si existe
        const estado = State.get('quizEstado') || {};
        if (estado.respuestas && estado.respuestas[idx] !== undefined) {
            const opcionSel = container.querySelector(`.quiz-opcion[data-idx="${estado.respuestas[idx]}"]`);
            if (opcionSel) {
                opcionSel.style.borderColor = 'var(--accent)';
                opcionSel.style.background = 'rgba(76,175,80,0.1)';
            }
        }

        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([container]).catch(() => {});
        }
    }

    function _mostrarVista(id) {
        ['quiz-config', 'quiz-pregunta', 'quiz-resultados'].forEach(vId => {
            const el = document.getElementById(vId);
            if (el) el.style.display = (vId === id) ? 'block' : 'none';
        });
    }

    function renderResultados(resultados) {
        const container = document.getElementById('quiz-resultados');
        if (!container) return;
        _mostrarVista('quiz-resultados');
        
        const aciertos = resultados.filter(r => r.correcta).length;
        const porcentaje = Math.round((aciertos / resultados.length) * 100);
        
        let colorNota = porcentaje >= 80 ? '#4CAF50' : porcentaje >= 50 ? '#FF9800' : '#f44336';
        
        const detallesHtml = resultados.map((r, i) => `
            <div style="padding:15px; background:#1a1a1a; border-radius:8px; margin-bottom:10px; border-left:4px solid ${r.correcta ? '#4CAF50' : '#f44336'};">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="color:#888; font-size:0.85em;">Pregunta ${i+1}</span>
                    <span style="color:${r.correcta ? '#4CAF50' : '#f44336'}; font-weight:bold;">
                        ${r.correcta ? '✓ Correcta' : '✗ Incorrecta'}
                    </span>
                </div>
                <p style="color:#fff; margin:0 0 10px 0; line-height:1.4;">${r.pregunta}</p>
                <div style="font-size:0.9em;">
                    <div style="color:${r.correcta ? '#4CAF50' : '#f44336'}; margin-bottom:5px;">
                        <strong>Tu respuesta:</strong> ${r.opcionElegida}
                    </div>
                    ${!r.correcta ? `
                        <div style="color:#4CAF50;">
                            <strong>Correcta:</strong> ${r.opcionCorrecta}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div style="text-align:center; margin-bottom:25px;">
                <div style="font-size:3em; color:${colorNota}; margin-bottom:10px;">
                    <i class="fa-solid ${porcentaje >= 80 ? 'fa-trophy' : porcentaje >= 50 ? 'fa-medal' : 'fa-circle-exclamation'}"></i>
                </div>
                <h2 style="color:#fff; margin:0;">${porcentaje}% de Aciertos</h2>
                <p style="color:#888; margin:5px 0 0 0;">${aciertos} de ${resultados.length} preguntas correctas</p>
            </div>

            <div style="max-height:400px; overflow-y:auto; padding-right:5px;">
                ${detallesHtml}
            </div>

            <div style="margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <button onclick="UI_Quiz._api.cerrar()" 
                        style="padding:12px; background:#333; color:#fff; border:none; border-radius:6px; cursor:pointer;">
                    <i class="fa-solid fa-xmark"></i> Cerrar
                </button>
                <button onclick="UI_Quiz._api.repetir()" 
                        style="padding:12px; background:var(--accent); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                    <i class="fa-solid fa-rotate-right"></i> Repetir Test
                </button>
            </div>
        `;
    }

    return {
        abrir,
        cerrar,
        renderConfig: _renderConfig,
        renderPregunta,
        renderResultados,
        selectDificultad,
        _api: {
            selectDificultad,
            iniciar: () => Quiz.iniciar(),
            seleccionarOpcion: (idx) => Quiz.seleccionarOpcion(idx),
            siguiente: () => Quiz.siguiente(),
            anterior: () => Quiz.anterior(),
            cerrar,
            repetir: () => Quiz.repetir()
        }
    };
})();
