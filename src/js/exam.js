// ════════════════════════════════════════════════════════════════
// EXAM.JS — Módulo de Evaluación
// Encapsula toda la lógica, estado y UI del Modo Examen.
//
// Dependencias en window (deben cargar antes):
//   - Logger        (app.js)
//   - biblioteca    (state.js)
//   - nombreAsignaturaActual (state.js)
//   - _examenActivo (state.js)  ← leído como global en el keydown de app.js
//   - MathJax       (CDN, opcional)
//   - actualizarMenuLateral, cargarAsignatura (app.js, usados en cerrarExamen)
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// EXAM.JS — Módulo de Evaluación (V2: Feynman & Interleaved Support)
// Encapsula toda la lógica, estado y UI del Modo Examen.
// ════════════════════════════════════════════════════════════════

function generarBarraEstrellas(plenas) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        const color = i <= plenas ? '#FFD700' : '#2a2a2a';
        html += `<i class="fa-solid fa-star" style="color:${color}; margin-right:2px;"></i>`;
    }
    return html;
}

const EXAM = (() => {

    // ── Estado interno ────────────────────────────────────────────
    let _modo       = 'flash';  // 'flash' | 'real' | 'feynman'
    let _cola       = [];
    let _idx        = 0;
    let _puntos     = [];       // calificación [1-4] por tarjeta
    let _respuestas = [];       // texto libre del usuario
    let _feedbacks  = [];       // retroalimentación de la IA (Modo Feynman)
    let _timer      = null;
    let _segsLeft   = 0;
    let _config     = {};

    // ── Constantes ────────────────────────────────────────────────
    const TIPOS_COLORES = {
        'Definición':  '#c40202', 'Teorema':     '#1e4fb2',
        'Proposición': '#16a116', 'Lema':        '#3b9c67',
        'Corolario':   '#00bcd4', 'Axioma':      '#9c27b0',
        'Observación': '#7242A3', 'Nota':        '#9e9e9e',
        'Ejemplo':     '#3db370'
    };
    const PESOS = { 1: 1.0, 2: 0.75, 3: 0.40, 4: 0.0 };

    // ── Helpers privados ──────────────────────────────────────────
    function _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function _show(id) {
        ['examen-config', 'examen-flash', 'examen-real', 'examen-correccion', 'examen-resultados']
            .forEach(s => {
                const el = document.getElementById(s);
                if (el) el.style.display = (s === id) ? 'block' : 'none';
            });
    }

    function _clearTimer() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    function _guardarRespuestaActual() {
        const input = document.getElementById('ex-r-respuesta');
        if (input) _respuestas[_idx] = input.value;
    }

    // ── CONFIG ────────────────────────────────────────────────────
    function abrir() {
        Logger.info('Modo Examen: abriendo');
        State.set('currentContext', 'exam');
        State.set('examenActivo', true);

        const biblioteca = State.get('biblioteca') || {};
        const asigActual = State.get('nombreAsignaturaActual');

        document.getElementById('examen-modal').style.display = 'flex';
        _show('examen-config');

        const sel = document.getElementById('ex-asig');
        sel.innerHTML = '<option value="ALL">🌟 TODAS LAS ASIGNATURAS (Intercalado)</option>' + 
            Object.keys(biblioteca).map(a => `<option value="${a}">${a}</option>`).join('');
            
        if (asigActual && biblioteca[asigActual]) sel.value = asigActual;
        const tipos = ['Definición', 'Teorema', 'Proposición', 'Lema', 'Corolario', 'Ejemplo', 'Observación', 'Axioma'];
        document.getElementById('ex-tipos-grid').innerHTML = tipos.map(t => {
            const c = TIPOS_COLORES[t] || '#888';
            return `<label
                onmouseover="this.style.background='${c}30'"
                onmouseout="this.style.background=this.querySelector('input').checked?'${c}30':'${c}15'"
                style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.78em;
                       padding:5px 10px;border:1px solid ${c}55;border-radius:12px;color:${c};
                       background:${c}15;user-select:none;transition:all 0.15s ease;">
                <input type="checkbox" value="${t}" checked style="accent-color:${c};">
                ${t}
            </label>`;
        }).join('');
    }

    function setModo(m) {
        _modo = m;
        const btns = {
            'flash': document.getElementById('ex-mode-btn-flash'),
            'real': document.getElementById('ex-mode-btn-real'),
            'feynman': document.getElementById('ex-mode-btn-feynman') // Nuevo botón
        };
        
        Object.keys(btns).forEach(key => {
            if (btns[key]) {
                btns[key].style.borderColor = key === m ? 'var(--accent)' : '#333';
                btns[key].style.background  = key === m ? 'rgba(76,175,80,0.12)' : 'transparent';
            }
        });

        const tiempoLabel = document.getElementById('ex-tiempo-label');
        if (tiempoLabel) tiempoLabel.innerText = m === 'flash'
            ? 'TIEMPO/TARJETA (s, 0=libre)'
            : 'TIEMPO TOTAL (min, 0=libre)';
    }

    function iniciar() {
        const asig        = document.getElementById('ex-asig').value;
        const numMax      = parseInt(document.getElementById('ex-num').value) || 10;
        const tiempo      = parseInt(document.getElementById('ex-tiempo').value) || 0;
        const temasRaw    = document.getElementById('ex-temas').value.trim();
        const temasFiltro = temasRaw ? temasRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const tiposChecked = [...document.querySelectorAll('#ex-tipos-grid input:checked')].map(cb => cb.value);

        const biblioteca = State.get('biblioteca') || {};
        let rawPool = [];
        
        // Soporte de Examen Intercalado
        if (asig === 'ALL') {
            Object.keys(biblioteca).forEach(a => {
                biblioteca[a].forEach(c => rawPool.push({ ...c, _asigFicticia: a }));
            });
        } else {
            if (!biblioteca[asig] || biblioteca[asig].length === 0) return alert('La asignatura está vacía.');
            rawPool = [...biblioteca[asig]];
        }

        let pool = rawPool.filter(c => {
            const tipoOk = tiposChecked.length === 0 || tiposChecked.includes(c.Apartado);
            const temaOk = temasFiltro.length === 0  || temasFiltro.includes(Number(c.Tema));
            return tipoOk && temaOk;
        });
        
        if (pool.length === 0) { alert('Ninguna tarjeta coincide con los filtros.'); return; }

        _cola       = _shuffle(pool).slice(0, numMax);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
        _feedbacks  = new Array(_cola.length).fill('');
        _config     = { asig, tiempo, modo: _modo, numMax: _cola.length };

        Logger.info(`Examen (${_modo}): ${_cola.length} tarjetas. Contexto: ${asig}`);

        if (_modo === 'flash') {
            _show('examen-flash');
            _flashRender();
            if (tiempo > 0) _flashStartTimer(tiempo);
        } else {
            // El modo 'real' y 'feynman' comparten la interfaz de redacción
            _show('examen-real');
            _realRender();
            if (tiempo > 0) _realStartTimer(tiempo * 60);
        }
    }

    // ── MODO FLASH ────────────────────────────────────────────────
    function _flashRender() {
        if (_idx >= _cola.length) { _mostrarResultados(); return; }
        const c     = _cola[_idx];
        const color = TIPOS_COLORES[c.Apartado] || '#888';

        document.getElementById('ex-f-tipo').innerText  = c.Apartado || 'Tarjeta';
        document.getElementById('ex-f-tipo').style.cssText = `font-size:0.7em;font-weight:bold;padding:2px 10px;border-radius:12px;background:${color}22;color:${color};border:1px solid ${color};`;
        
        const badgeAsig = c._asigFicticia ? `<span style="color:#FF9800; margin-right:8px;">[${c._asigFicticia}]</span>` : '';
        document.getElementById('ex-f-tema').innerHTML           = `${badgeAsig}Tema ${c.Tema || '?'}`;
        document.getElementById('ex-f-titulo').innerHTML         = c.Titulo || '';
        document.getElementById('ex-f-contenido').innerHTML      = c.Contenido || '';
        document.getElementById('ex-f-contenido').style.display  = 'none';
        document.getElementById('ex-f-btn-revelar').style.display = 'block';
        document.getElementById('ex-f-valoracion').style.display  = 'none';

        document.getElementById('ex-f-bar').style.width   = `${(_idx / _cola.length) * 100}%`;
        document.getElementById('ex-f-label').innerText   = `${_idx + 1}/${_cola.length}`;

        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('examen-flash')]).catch(() => {});
    }

    function _flashStartTimer(segs) {
        _clearTimer();
        _segsLeft = segs;
        const d = document.getElementById('ex-f-timer');
        d.style.display = 'inline-block';
        d.innerText = _segsLeft + 's';
        _timer = setInterval(() => {
            _segsLeft--;
            d.innerText     = _segsLeft + 's';
            d.style.color   = _segsLeft <= 5 ? '#f44336' : '#FF9800';
            if (_segsLeft <= 0) { _clearTimer(); flashRevelar(); }
        }, 1000);
    }

    function flashRevelar() {
        _clearTimer();
        document.getElementById('ex-f-contenido').style.display   = 'block';
        document.getElementById('ex-f-btn-revelar').style.display  = 'none';
        document.getElementById('ex-f-valoracion').style.display   = 'flex';
        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('ex-f-contenido')]).catch(() => {});
    }

    function flashPuntuar(n) {
        _puntos[_idx] = n;
        _idx++;
        _flashRender();
        if (_config.tiempo > 0 && _idx < _cola.length) _flashStartTimer(_config.tiempo);
    }

    // ── MODO REAL / FEYNMAN ───────────────────────────────────────
    function _realRender() {
        _idx = Math.max(0, Math.min(_idx, _cola.length - 1));
        const c     = _cola[_idx];
        const color = TIPOS_COLORES[c.Apartado] || '#2196F3';

        document.getElementById('ex-r-tipo').innerText  = c.Apartado || 'Tarjeta';
        document.getElementById('ex-r-tipo').style.cssText = `font-size:0.7em;font-weight:bold;padding:2px 10px;border-radius:12px;background:${color}22;color:${color};border:1px solid ${color};`;
        
        const badgeAsig = c._asigFicticia ? `<span style="color:#FF9800; margin-right:8px;">[${c._asigFicticia}]</span>` : '';
        document.getElementById('ex-r-tema').innerHTML           = `${badgeAsig}Tema ${c.Tema || '?'}`;
        document.getElementById('ex-r-titulo').innerHTML         = c.Titulo || '';
        // Inyección condicional UX para advertencia de Modo Feynman
        const inputRespuesta = document.getElementById('ex-r-respuesta');
        if (_modo === 'feynman') {
            inputRespuesta.placeholder = "Modo Feynman activo: Explica este concepto de forma intuitiva. Imagina que se lo explicas a un neófito, pero mantén la precisión matemática.";
            inputRespuesta.style.border = "1px solid var(--accent)";
            inputRespuesta.style.background = "rgba(76,175,80,0.03)";
        } else {
            inputRespuesta.placeholder = "Escribe tu respuesta formal aquí... (soporta LaTeX con $...$)";
            inputRespuesta.style.border = "1px solid #3a3a3a";
            inputRespuesta.style.background = "#151515";
        }
        inputRespuesta.value = _respuestas[_idx] || '';

        document.getElementById('ex-r-bar').style.width  = `${((_idx + 1) / _cola.length) * 100}%`;
        document.getElementById('ex-r-label').innerText  = `P ${_idx + 1}/${_cola.length}`;

        document.getElementById('ex-r-nav').innerHTML = _cola.map((_, i) => {
            const resp   = (_respuestas[i] || '').trim();
            const active = i === _idx;
            const bg     = active ? '#2196F3' : resp ? '#4CAF50' : '#333';
            const border = active ? '2px solid #2196F3' : `2px solid ${bg}`;
            const fontColor  = (active || resp) ? 'white' : '#666';
            return `<button onclick="EXAM._api.realIrA(${i})"
                style="width:28px;height:28px;border-radius:50%;background:${bg};border:${border};
                       color:${fontColor};font-size:0.7em;cursor:pointer;font-weight:bold;">${i + 1}</button>`;
        }).join('');

        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('ex-r-titulo')]).catch(() => {});
    }

    function _realStartTimer(totalSegs) {
        _clearTimer();
        _segsLeft = totalSegs;
        const d = document.getElementById('ex-r-timer');
        d.style.display = 'inline-block';
        _timer = setInterval(() => {
            _segsLeft--;
            const m = Math.floor(_segsLeft / 60), s = _segsLeft % 60;
            d.innerText   = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            d.style.color = _segsLeft <= 60 ? '#f44336' : '#FF9800';
            if (_segsLeft <= 0) { _clearTimer(); realEntregar(); }
        }, 1000);
    }

    function realGuardarRespuesta() { _guardarRespuestaActual(); _realRender(); }
    function realIrA(i) { _guardarRespuestaActual(); _idx = i; _realRender(); }
    function realSiguiente() { _guardarRespuestaActual(); if (_idx < _cola.length - 1) { _idx++; _realRender(); } }
    function realAnterior() { _guardarRespuestaActual(); if (_idx > 0) { _idx--; _realRender(); } }

    function realEntregar() {
        _clearTimer();
        _guardarRespuestaActual();
        Logger.info('Examen real entregado. Evaluando...');
        
        _show('examen-correccion');
        
        if (_modo === 'feynman') {
            _evaluarFeynmanIA();
        } else {
            _renderCorreccion();
        }
    }

    // ── MIDDLEWARE: EVALUACIÓN FEYNMAN (IA) ───────────────────────
    async function _evaluarFeynmanIA() {
        const lista = document.getElementById('ex-c-lista');
        lista.innerHTML = `
            <div style="text-align:center; padding: 60px 20px;">
                <i class="fa-solid fa-microchip fa-spin fa-3x" style="color:var(--accent); margin-bottom: 20px;"></i>
                <h3 style="color:#eee;">El Profesor Feynman está evaluando...</h3>
                <p style="color:#888;">Analizando rigurosidad y simplicidad pedagógica.</p>
            </div>
        `;

        const apiKey = State.get('groqApiKey');
        const proxyUrl = State.get('groqProxyUrl');

        if (!apiKey && !proxyUrl) {
            alert("Error de Arquitectura: La API Key de IA no está configurada. Pasando a corrección manual.");
            _modo = 'real';
            _renderCorreccion();
            return;
        }

        const QA_Payload = _cola.map((c, i) => ({
            id: i,
            concepto: c.Titulo,
            solucion_matematica: c.Contenido,
            respuesta_alumno: _respuestas[i] || "[En blanco]"
        }));

        const prompt = `Eres Richard Feynman evaluando a un alumno universitario de ciencias exactas.
            El alumno debe explicar conceptos complejos de forma simple, pero SIN PERDER EL RIGOR MATEMÁTICO.
            Si la explicación es demasiado técnica y no demuestra intuición, penalízalo levemente. Si pierde el rigor o se inventa matemáticas, suspéndelo.

            INSTRUCCIÓN CRÍTICA: La "solucion_matematica" base está escrita en código LaTeX puro. Debes evaluar el fondo matemático y la equivalencia semántica de la respuesta del alumno frente a esta solución, ignorando las diferencias de notación formal (no exijas que el alumno escriba LaTeX).

            Evalúa cada respuesta contra la "solucion_matematica".
            Escala ESTRICTA para la clave "nota":
            1: Excelente (Domina el concepto, intuición perfecta y matemáticamente sólido).
            2: Bien (Correcto, pero le falta claridad o tiene pequeñas imprecisiones).
            3: Difícil/Regular (Errores conceptuales moderados o falta rigor).
            4: Mal (Incorrecto, en blanco, o alucina matemáticas).

            Devuelve ÚNICAMENTE un JSON válido con esta estructura:
            {"evaluacion": [{"id": 0, "nota": 2, "feedback": "Tu explicación de por qué esta nota (máx 2 líneas, directo y al grano)"}]}

            Examen a evaluar:
            ${JSON.stringify(QA_Payload)}`;

        try {
            const endpoint = proxyUrl || "https://api.groq.com/openai/v1/chat/completions";
            const headers = { "Content-Type": "application/json" };
            if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({
                    model: State.get('iaModel') || "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) throw new Error("Fallo en la API de IA");
            const data = await response.json();
            
            let rawStr = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(rawStr);

            result.evaluacion.forEach(ev => {
                _puntos[ev.id] = ev.nota;
                _feedbacks[ev.id] = ev.feedback;
            });

            _renderCorreccion(true); // Flag de Feynman activada

        } catch (error) {
            Logger.error("Fallo IA Feynman", error);
            alert("Error de red o parseo en la IA. Devolviendo el control a la corrección manual.");
            _modo = 'real';
            _renderCorreccion();
        }
    }

    // ── CORRECCIÓN ────────────────────────────────────────────────
    function _renderCorreccion(isFeynman = false) {
        const fragment = document.createDocumentFragment();

        _cola.forEach((c, i) => {
            const color = TIPOS_COLORES[c.Apartado] || '#888';
            const card = document.createElement('div');
            card.className = 'exam-correction-card';
            
            const respuestaUsuario = (_respuestas[i] || '').trim() || '<em style="color:#555">(en blanco)</em>';
            const badgeAsig = c._asigFicticia ? `<span style="color:#FF9800; margin-right:8px; font-weight:bold;">[${c._asigFicticia}]</span>` : '';
            
            let panelNota = '';

            if (isFeynman) {
                // Renderizado IA
                const notaIA = _puntos[i] || 4;
                const lbl = ['', 'Excelente', 'Bien', 'Regular', 'Mal'][notaIA];
                const bgColors = ['', '#4CAF50', '#8BC34A', '#FF9800', '#f44336'];
                
                panelNota = `
                    <div style="background: #1e1e1e; padding: 15px; border-radius: 8px; border-left: 4px solid ${bgColors[notaIA]}; margin-top: 15px;">
                        <div style="font-weight:bold; color:${bgColors[notaIA]}; margin-bottom: 5px;">Calificación IA: ${lbl}</div>
                        <div style="font-size:0.9em; color:#ddd; font-style:italic;">"${_feedbacks[i]}"</div>
                    </div>
                `;
            } else {
                // Renderizado Manual
                let botonesNota = '';
                [1, 2, 3, 4].forEach(n => {
                    const lbl = ['', 'Fácil', 'Bien', 'Difícil', 'Mal'][n];
                    botonesNota += `<button onclick="window.examenCorreccionPuntuar(${i},${n})" id="ex-c-btn-${i}-${n}" class="exam-btn-grade grade-${n}">${n} ${lbl}</button>`;
                });
                panelNota = `<div class="exam-grade-grid">${botonesNota}</div>`;
            }

            card.innerHTML = `
                <div class="exam-card-header">
                    <span class="exam-badge" style="background:${color}22; color:${color}; border: 1px solid ${color};">${c.Apartado || ''}</span>
                    <span class="exam-meta">${badgeAsig}Tema ${c.Tema || '?'}</span>
                    <span class="exam-meta right">P${i + 1}</span>
                </div>
                <div class="exam-card-title">${c.Titulo || ''}</div>
                <div class="exam-card-grid">
                    <div>
                        <div class="exam-col-label">Tu respuesta</div>
                        <div class="exam-ans-box user-ans">${respuestaUsuario}</div>
                    </div>
                    <div>
                        <div class="exam-col-label">Solución Formal</div>
                        <div class="exam-ans-box correct-ans">${c.Contenido || ''}</div>
                    </div>
                </div>
                ${panelNota}
            `;
            fragment.appendChild(card);
        });

        // Botón de cálculo de nota si es Feynman (ya que no hay interacción manual requerida)
        if (isFeynman) {
            const btnDiv = document.createElement('div');
            btnDiv.style.textAlign = 'center';
            btnDiv.style.marginTop = '20px';
            btnDiv.innerHTML = `<button onclick="window.examenRealCalcularNota()" class="btn-main" style="padding: 15px 30px; font-size: 1.1em; background: var(--accent); color: #000;">Ver nota final del Profesor Feynman →</button>`;
            fragment.appendChild(btnDiv);
        }

        const lista = document.getElementById('ex-c-lista');
        if (lista) {
            lista.innerHTML = '';
            lista.appendChild(fragment);
            // Si es corrección manual, nos aseguramos de resetear el botón de nota
            if (!isFeynman) {
                const submitBtn = document.getElementById('ex-c-btn-nota');
                if (submitBtn) submitBtn.innerText = `Ver nota final (faltan ${_cola.length}) →`;
            }
        }

        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('ex-c-lista')]).catch(() => {});
    }

    function correccionPuntuar(pregIdx, n) {
        if (_modo === 'feynman') return; // Bloqueo de seguridad

        _puntos[pregIdx] = n;
        for (let k = 1; k <= 4; k++) {
            const btn = document.getElementById(`ex-c-btn-${pregIdx}-${k}`);
            if (!btn) continue;
            btn.style.opacity   = k === n ? '1' : '0.35';
            btn.style.transform = k === n ? 'scale(1.05)' : 'scale(1)';
        }
        const pendientes = _puntos.filter(p => p === null).length;
        const submitBtn  = document.getElementById('ex-c-btn-nota');
        if (submitBtn) submitBtn.innerText = pendientes === 0 ? 'Ver nota final →' : `Ver nota final (faltan ${pendientes}) →`;
    }

    function calcularNota() {
        const pts    = _puntos.map(p => p === null ? 4 : p);
        const suma   = pts.reduce((acc, n) => acc + PESOS[n], 0);
        _mostrarResultados((suma / _cola.length) * 10, pts);
    }

    // ── RESULTADOS ────────────────────────────────────────────────
    function _mostrarResultados(nota10, ptsArray) {
        _show('examen-resultados');
        const pts      = (ptsArray || _puntos).map(p => p === null ? 4 : p);
        const total    = _cola.length;
        const notaFinal = nota10 !== undefined ? nota10 : (pts.reduce((a, n) => a + PESOS[n], 0) / total) * 10;

        const niceNota = notaFinal.toFixed(1);
        const bien     = pts.filter(p => p <= 2).length;
        const aRep     = pts.filter(p => p >= 3).length;

        document.getElementById('ex-res-nota').innerText = niceNota;
        document.getElementById('ex-res-ok').innerText   = bien;
        document.getElementById('ex-res-fail').innerText = aRep;
        
        const modoVisual = _config.modo === 'flash' ? 'Repaso Rápido' : (_config.modo === 'feynman' ? 'Evaluación Feynman (IA)' : 'Examen Real');
        document.getElementById('ex-res-asig').innerText = `${_config.asig} · ${total} tarjetas · ${modoVisual}`;

        const [estrellas, titulo, colorTexto] =
            notaFinal >= 9   ? [5, 'Sobresaliente',      '#FFD700'] :
            notaFinal >= 8   ? [4, 'Notable alto',        '#bb86fc'] :
            notaFinal >= 7   ? [3, 'Notable bajo',        '#bb86fc'] :
            notaFinal >= 6   ? [3, 'Bien',                '#4dabf7'] :
            notaFinal >= 5   ? [2, 'Aprobado',            '#4dabf7'] :
            notaFinal >= 3.5 ? [1, 'La próxima será...',  '#ef5350'] :
                               [0, 'Suspenso',            '#ef5350'];

        document.getElementById('ex-res-emoji').innerHTML = generarBarraEstrellas(estrellas);
        const elTitulo = document.getElementById('ex-res-titulo');
        if (elTitulo) { elTitulo.innerText = titulo; elTitulo.style.color = colorTexto; }

        // Mapeo estricto conservando el índice original para evitar desalineación de arrays
        const falladasMapped = _cola
            .map((c, index) => ({ tarjeta: c, indexOriginal: index, nota: pts[index] }))
            .filter(item => item.nota >= 3);

        const listaEl = document.getElementById('ex-res-lista');
        if (listaEl) {
            listaEl.innerHTML = falladasMapped.length === 0
                ? '<p style="color:#4CAF50;text-align:center;"><i class="fa-solid fa-check"></i> Todo correcto o bien</p>'
                : `<p style="color:#888;margin:0 0 8px 0;">A repasar (${falladasMapped.length}):</p>` +
                  falladasMapped.map(item => {
                      const c = item.tarjeta;
                      const idx = item.indexOriginal;
                      const feedback = _config.modo === 'feynman' ? `<br><span style="color:#FF9800;font-style:italic;">${_feedbacks[idx]}</span>` : '';
                      return `<div style="padding:4px 0;border-bottom:1px solid #222;color:#ccc;">
                          <span style="color:#f44336;margin-right:5px;">✖</span>
                          <strong>${c.Titulo || '?'}</strong>
                          <span style="color:#555;font-size:0.85em;"> · ${c.Apartado || ''}</span>
                          ${feedback}
                       </div>`;
                  }).join('');
        }

        Logger.info(`Examen terminado: nota ${niceNota}, bien=${bien}, repasar=${aRep}`);

        if (typeof EventBus !== 'undefined') {
            EventBus.emit('EXAMEN_COMPLETADO', {
                fecha: new Date().toISOString(),
                asignatura: _config.asig,
                modo: _config.modo,
                nota: parseFloat(niceNota),
                total: total,
                bien: bien,
                mal: aRep
            });
        }
    }

    function repetir() {
        _cola       = _shuffle(_cola);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
        _feedbacks  = new Array(_cola.length).fill('');
        
        if (_modo === 'flash') {
            _show('examen-flash'); _flashRender();
            if (_config.tiempo > 0) _flashStartTimer(_config.tiempo);
        } else {
            _show('examen-real'); _realRender();
            if (_config.tiempo > 0) _realStartTimer(_config.tiempo * 60);
        }
    }

    function cerrar() {
        _clearTimer();
        State.set('examenActivo', false);
        State.set('currentContext', 'study');
        const modal = document.getElementById('examen-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active'); 
        }
        
    }

    // ── API pública ───────────────────────────────────────────────
    return {
        abrir, setModo, iniciar, cerrar, repetir,
        flashRevelar, flashPuntuar,
        realGuardarRespuesta, realSiguiente, realAnterior, realEntregar,
        correccionPuntuar, calcularNota,
        _api: { realIrA }
    };
})();

// ── Proxies globales ─────────────────────────────────────────────
window.abrirExamen                = () => EXAM.abrir();
window.examenSetMode              = m  => EXAM.setModo(m);
window.iniciarExamen              = () => EXAM.iniciar();
window.cerrarExamen               = () => {
    EXAM.cerrar();
    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
    if (nombreAsignaturaActual && typeof cargarAsignatura === 'function') cargarAsignatura(nombreAsignaturaActual);
};
window.repetirExamen              = () => EXAM.repetir();
window.examenFlashRevelar         = () => EXAM.flashRevelar();
window.examenFlashPuntuar         = n  => EXAM.flashPuntuar(n);
window.examenRealGuardarRespuesta = () => EXAM.realGuardarRespuesta();
window.examenRealSiguiente        = () => EXAM.realSiguiente();
window.examenRealAnterior         = () => EXAM.realAnterior();
window.examenRealEntregar         = () => EXAM.realEntregar();
window.examenCorreccionPuntuar    = (i, n) => EXAM.correccionPuntuar(i, n);
window.examenRealCalcularNota     = () => EXAM.calcularNota();

CommandRegistry.register('examRealIrA',            ({idx}) => EXAM._api.realIrA(Number(idx)));
CommandRegistry.register('examenCorreccionPuntuar', ({idx, n}) => EXAM.correccionPuntuar(Number(idx), Number(n)));
CommandRegistry.register('setModoExamen',           ({modo}) => EXAM.setModo(modo));
