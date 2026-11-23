// EXAM.JS — Coordinador de exámenes Flash, Real y Feynman.
// El motor conversacional está en feynman.js y su interfaz en interfaz/ui-feynman.js.
// Dependencias: State, Logger, CommandRegistry, FEYNMAN, UIFeynman.

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
    let _timer      = null;
    let _segsLeft   = 0;
    let _config     = {};
    let _flashReveladas = [];
    let _ultimoResultado = 'exam';

    // ── Constantes ────────────────────────────────────────────────
    const TIPOS_COLORES = {
        'Definición':  '#c40202', 'Teorema':     '#1e4fb2',
        'Proposición': '#16a116', 'Lema':        '#3b9c67',
        'Corolario':   '#00bcd4', 'Axioma':      '#9c27b0',
        'Observación': '#7242A3', 'Nota':        '#9e9e9e',
        'Ejemplo':     '#3db370', 'Ejercicio':   '#ff8c00',
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
        ['examen-config', 'examen-flash', 'examen-real', 'examen-correccion', 'examen-resultados', 'examen-feynman',
            'quiz-config', 'quiz-pregunta', 'quiz-resultados', 'graph-exam-screen']
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
    const DESCRIPCIONES = {
        flash: ['Repaso Flash', 'Recuperación rápida: piensa la respuesta, revélala y evalúate. Ideal para afianzar definiciones y resultados breves.'],
        real: ['Examen Real', 'Responde por escrito sin ver la solución. Puedes saltar preguntas, revisarlas y entregar cuando quieras. Después compararás tus respuestas con los apuntes.'],
        feynman: ['Método Feynman', 'Explica un concepto a un personaje que hace preguntas y señala lagunas. Recomendado para profundizar en pocos conceptos.'],
        graph: ['Relaciones', 'Explica las conexiones del mapa, reconstruye cadenas y compara tu respuesta con las tarjetas.'],
        quiz: ['Tipo Test con IA', 'La IA crea preguntas de cuatro opciones a partir del contenido seleccionado. Elige dificultad y creatividad, navega libremente y revisa tus resultados.']
    };

    function _bibliotecaSeleccionada() {
        const biblioteca = State.get('biblioteca') || {};
        const asig = document.getElementById('ex-asig')?.value || 'ALL';
        return asig === 'ALL' ? Object.values(biblioteca).flat() : (biblioteca[asig] || []);
    }

    function _checkboxes(name) {
        return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
    }

    function leerFiltros() {
        const desde = document.getElementById('ex-desde')?.value;
        const hasta = document.getElementById('ex-hasta')?.value;
        return {
            temas: _checkboxes('ex-tema'), apartados: _checkboxes('ex-apartado'), tipos: _checkboxes('ex-tipo'),
            desde: desde === '' || desde == null ? null : Number(desde),
            hasta: hasta === '' || hasta == null ? null : Number(hasta),
            repaso: !!document.getElementById('ex-repaso')?.checked
        };
    }

    function _filtrar() {
        const filtros = leerFiltros();
        const asig = document.getElementById('ex-asig').value;
        const biblioteca = State.get('biblioteca') || {};
        let pool = asig === 'ALL'
            ? Object.entries(biblioteca).flatMap(([nombre, tarjetas]) => tarjetas.map(c => ({...c, _asigFicticia: nombre})))
            : [...(biblioteca[asig] || [])];
        if (asig !== 'ALL') pool = pool.slice(filtros.desde ?? 0, filtros.hasta == null ? undefined : filtros.hasta + 1);
        const temas = new Set(filtros.temas), apartados = new Set(filtros.apartados), tipos = new Set(filtros.tipos);
        const elegibles = _bibliotecaSeleccionada();
        const posiblesTipos = [...new Set(elegibles.map(c => String(c.Tipo || '')).filter(Boolean))];
        const seleccionVacia = posiblesTipos.length && tipos.size === 0;
        if (seleccionVacia) return [];
        return pool.filter(c => (!temas.size || temas.has(String(c.Tema))) &&
            (!apartados.size || apartados.has(String(c.Apartado))) &&
            (!tipos.size || tipos.has(String(c.Tipo))) &&
            (!filtros.repaso || Number(c.Dificultad) >= 3 || Number(c.fsrs_lapses) > 0));
    }

    function actualizarContenido() {
        const tarjetas = _bibliotecaSeleccionada();
        const asig = document.getElementById('ex-asig').value;
        const tipos = [...new Set(tarjetas.map(c => c.Tipo).filter(Boolean))].sort();
        const temas = [...new Set(tarjetas.map(c => c.Tema).filter(v => v !== undefined && v !== null && v !== ''))].sort((a,b) => Number(a)-Number(b));
        const apartados = [...new Set(tarjetas.map(c => c.Apartado).filter(Boolean))].sort();
        const colorTipo = t => State.get('tiposTarjeta')?.[t]?.color || TIPOS_COLORES[t] || 'var(--accent)';
        const cb = (name, value, label, checked, color) => `<label class="exam-quiz-type" style="--type-color:${color || 'var(--accent)'}"><input type="checkbox" name="${name}" value="${escapeHtml(String(value))}" ${checked ? 'checked' : ''}>${escapeHtml(String(label))}</label>`;
        document.getElementById('ex-tipos-grid').innerHTML = tipos.length ? tipos.map(t => cb('ex-tipo',t,t,true,colorTipo(t))).join('') : '<small>Sin tipos registrados</small>';
        document.getElementById('ex-contenido').innerHTML = `<div class="exam-setup-filter"><strong>Temas</strong><div class="exam-quiz-content-list exam-filtros-contenido">${temas.map(t => cb('ex-tema',t,`Tema ${t}`,false)).join('') || '<small>Sin temas</small>'}</div></div><div class="exam-setup-filter"><strong>Apartados</strong><div class="exam-quiz-content-list exam-filtros-contenido">${apartados.map(t => cb('ex-apartado',t,t,false,colorTipo(t))).join('') || '<small>Sin apartados</small>'}</div></div>`;
        const tramo = document.getElementById('ex-tramo');
        tramo.hidden = asig === 'ALL';
        const opts = tarjetas.map((c, i) => `<option value="${i}">${i+1}. ${escapeHtml(String(c.Titulo || c.Apartado || 'Sin título'))}</option>`).join('');
        document.getElementById('ex-desde').innerHTML = '<option value="">Desde el principio</option>' + opts;
        document.getElementById('ex-hasta').innerHTML = '<option value="">Hasta el final</option>' + opts;
        actualizarDisponibles();
    }

    function actualizarDisponibles() {
        const el = document.getElementById('ex-disponibles');
        if (!el) return;
        const n = _filtrar().length;
        el.textContent = `${n} concepto${n === 1 ? '' : 's'} disponible${n === 1 ? '' : 's'} con estos filtros`;
        el.classList.toggle('exam-setup-empty', !n);
    }

    function abrir() {
        Logger.info('Modo Examen: abriendo');
        State.set('currentContext', 'exam');
        State.set('examenActivo', true);
        const modal = document.getElementById('examen-modal');
        modal.style.display = 'flex';
        if (typeof UIFeynman !== 'undefined') UIFeynman.montar();
        _show('examen-config');
        const biblioteca = State.get('biblioteca') || {};
        const actual = State.get('nombreAsignaturaActual');
        const sel = document.getElementById('ex-asig');
        sel.innerHTML = '<option value="ALL">Todas las asignaturas</option>' + Object.keys(biblioteca).map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
        if (actual && biblioteca[actual]) sel.value = actual;
        if (!sel.dataset.configurado) {
            sel.addEventListener('change', () => { actualizarContenido(); if (_modo === 'graph') GraphExam.open(); });
            document.getElementById('examen-config').addEventListener('change', e => {
                if (e.target.matches('#ex-asig')) return;
                actualizarDisponibles();
            });
            sel.dataset.configurado = '1';
        }
        actualizarContenido();
        setModo(_modo);
    }

    function setModo(m) {
        if (!DESCRIPCIONES[m]) return;
        _modo = m;
        Object.keys(DESCRIPCIONES).forEach(key => {
            const btn = document.getElementById(`ex-mode-btn-${key}`);
            if (!btn) return;
            btn.classList.toggle('active', key === m);
            btn.setAttribute('aria-pressed', String(key === m));
        });
        document.getElementById('ex-mode-title').textContent = DESCRIPCIONES[m][0];
        document.getElementById('ex-mode-description').textContent = DESCRIPCIONES[m][1];
        if (m === 'quiz') UI_Quiz.mostrarOpcionesModo();
        const graph = m === 'graph';
        document.getElementById('ex-graph-slot').hidden = !graph;
        document.querySelectorAll('.exam-graph-incompatible').forEach(el => el.hidden = graph);
        if (graph && typeof GraphExam !== 'undefined') GraphExam.open();
        document.getElementById('ex-quiz-specific').hidden = m !== 'quiz';
        document.getElementById('ex-tiempo-wrap').hidden = m === 'quiz' || m === 'feynman' || graph;
        document.getElementById('ex-tiempo-label').textContent = m === 'flash' ? 'Tiempo por tarjeta (segundos, 0 = libre)' : 'Tiempo total (minutos, 0 = libre)';
        document.getElementById('ex-num').max = m === 'quiz' ? '20' : '100';
        if (m === 'quiz' && Number(document.getElementById('ex-num').value) > 20) document.getElementById('ex-num').value = 20;
        if (typeof UIFeynman !== 'undefined') UIFeynman.actualizarConfiguracion(m);
    }

    function iniciarDemo() {
        _clearTimer();
        if (_modo === 'quiz') { Quiz.iniciarDemo(); return; }
        if (_modo === 'graph') { GraphExam.start(); return; }
        const muestra = [{ Apartado: 'Definición', Tema: 1, Tipo: 'Teoría', Titulo: '¿Qué es una función inyectiva?', Contenido: 'Una función $f:A\\to B$ es inyectiva si $f(x)=f(y)$ implica $x=y$.', Dificultad: 1 },
            { Apartado: 'Teorema', Tema: 1, Tipo: 'Teoría', Titulo: 'Explica el teorema de Pitágoras.', Contenido: 'En un triángulo rectángulo, $a^2+b^2=c^2$.', Dificultad: 1 }];
        _cola = muestra;
        _idx = 0; _puntos = new Array(muestra.length).fill(null); _respuestas = new Array(muestra.length).fill(''); _flashReveladas = new Array(muestra.length).fill(false);
        _config = { asig: 'Demostración', tiempo: 0, modo: _modo, numMax: muestra.length, demo: true };
        if (_modo === 'feynman') {
            if (typeof FEYNMAN === 'undefined' || typeof UIFeynman === 'undefined') return alert('Falta el motor Feynman.');
            UIFeynman.mostrarDemo();
            _show('examen-feynman');
        } else if (_modo === 'flash') { _show('examen-flash'); _flashRender(); }
        else { _show('examen-real'); _realRender(); }
    }

    function iniciar() {
        _clearTimer();
        if (_modo === 'quiz') { Quiz.iniciar(); return; }
        if (_modo === 'graph') { GraphExam.start(); return; }
        const asig = document.getElementById('ex-asig').value;
        const numMax = Math.max(1, Number(document.getElementById('ex-num').value) || 10);
        const tiempo = Math.max(0, Number(document.getElementById('ex-tiempo').value) || 0);
        const filtros = leerFiltros();
        if (filtros.desde != null && filtros.hasta != null && filtros.desde > filtros.hasta) return alert('El final del tramo debe ser posterior al inicio.');
        const pool = _filtrar();
        if (!pool.length) return alert('No hay conceptos que coincidan con los filtros seleccionados.');

        _cola       = _shuffle(pool).slice(0, numMax);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
        _flashReveladas = new Array(_cola.length).fill(false);
        _config     = { asig, tiempo, modo: _modo, numMax: _cola.length };

        Logger.info(`Examen (${_modo}): ${_cola.length} tarjetas. Contexto: ${asig}`);

        if (_modo === 'feynman') {
            if (typeof FEYNMAN === 'undefined' || typeof UIFeynman === 'undefined') {
                alert('No se han cargado los módulos Feynman. Revisa el orden de scripts.');
                return;
            }
            UIFeynman.montar();
            if (!FEYNMAN.iniciar({
                tarjetas: _cola,
                config: _config,
                personaje: UIFeynman.leerPersonaje(), reto: UIFeynman.leerReto()
            })) return;
            _show('examen-feynman');
        } else if (_modo === 'flash') {
            _show('examen-flash');
            _flashRender();
            if (tiempo > 0) _flashStartTimer(tiempo);
        } else {
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
        const revelada = !!_flashReveladas[_idx];
        document.getElementById('ex-f-contenido').style.display  = revelada ? 'block' : 'none';
        document.getElementById('ex-f-btn-revelar').style.display = revelada ? 'none' : 'block';
        document.getElementById('ex-f-valoracion').style.display  = revelada ? 'flex' : 'none';
        const anterior = document.getElementById('ex-f-anterior');
        if (anterior) anterior.disabled = _idx === 0;
        const siguiente = document.getElementById('ex-f-saltar');
        if (siguiente) siguiente.textContent = _idx === _cola.length - 1 ? 'Finalizar →' : 'Siguiente →';
        const nav = document.getElementById('ex-f-nav');
        if (nav) nav.innerHTML = _cola.map((_, i) => `<button type="button" class="exam-question-dot ${i === _idx ? 'current' : ''} ${_puntos[i] !== null ? 'answered' : ''}" data-flash-ir="${i}" aria-label="Tarjeta ${i + 1}">${i + 1}</button>`).join('');
        if (nav) nav.onclick = e => { const btn = e.target.closest('[data-flash-ir]'); if (btn) flashIrA(Number(btn.dataset.flashIr)); };

        document.getElementById('ex-f-bar').style.width   = `${((_idx + 1) / _cola.length) * 100}%`;
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
        _flashReveladas[_idx] = true;
        document.getElementById('ex-f-contenido').style.display   = 'block';
        document.getElementById('ex-f-btn-revelar').style.display  = 'none';
        document.getElementById('ex-f-valoracion').style.display   = 'flex';
        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('ex-f-contenido')]).catch(() => {});
    }

    function flashIrA(i) {
        if (!Number.isInteger(i) || i < 0 || i >= _cola.length) return;
        _clearTimer();
        _idx = i;
        _flashRender();
        if (_config.tiempo > 0 && !_flashReveladas[_idx]) _flashStartTimer(_config.tiempo);
    }

    function flashAnterior() { flashIrA(_idx - 1); }

    function flashSaltar() {
        if (_idx < _cola.length - 1) flashIrA(_idx + 1);
        else { _clearTimer(); _mostrarResultados(); }
    }

    function flashPuntuar(n) {
        _puntos[_idx] = n;
        if (_idx < _cola.length - 1) flashIrA(_idx + 1);
        else { _clearTimer(); _mostrarResultados(); }
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
        const inputRespuesta = document.getElementById('ex-r-respuesta');
        inputRespuesta.placeholder = "Escribe tu respuesta formal aquí... (soporta LaTeX con $...$)";
        inputRespuesta.style.border = "1px solid #3a3a3a";
        inputRespuesta.style.background = "#151515";
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
        
        _renderCorreccion();
    }

    // ── CORRECCIÓN ────────────────────────────────────────────────
    function _renderCorreccion() {
        const fragment = document.createDocumentFragment();

        _cola.forEach((c, i) => {
            const color = TIPOS_COLORES[c.Apartado] || '#888';
            const card = document.createElement('div');
            card.className = 'exam-correction-card';
            
            const respuestaUsuario = (_respuestas[i] || '').trim() || '<em style="color:#555">(en blanco)</em>';
            const badgeAsig = c._asigFicticia ? `<span style="color:#FF9800; margin-right:8px; font-weight:bold;">[${c._asigFicticia}]</span>` : '';
            
            let botonesNota = '';
            [1, 2, 3, 4].forEach(n => {
                const lbl = ['', 'Fácil', 'Bien', 'Difícil', 'Mal'][n];
                botonesNota += `<button onclick="window.examenCorreccionPuntuar(${i},${n})" id="ex-c-btn-${i}-${n}" class="exam-btn-grade grade-${n}">${n} ${lbl}</button>`;
            });
            const panelNota = `<div class="exam-grade-grid">${botonesNota}</div>`;

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

        const lista = document.getElementById('ex-c-lista');
        if (lista) {
            lista.innerHTML = '';
            lista.appendChild(fragment);
            const submitBtn = document.getElementById('ex-c-btn-nota');
            if (submitBtn) submitBtn.innerText = `Ver nota final (faltan ${_cola.length}) →`;
        }

        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('ex-c-lista')]).catch(() => {});
    }

    function correccionPuntuar(pregIdx, n) {

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
        _ultimoResultado = 'exam';
        document.getElementById('ex-res-nota').nextElementSibling.textContent = 'Nota';
        document.getElementById('ex-res-ok').nextElementSibling.textContent = 'Bien';
        document.getElementById('ex-res-fail').nextElementSibling.textContent = 'A repasar';
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
        
        const modoVisual = _config.modo === 'flash' ? 'Repaso Rápido' : 'Examen Real';
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
                      return `<div style="padding:4px 0;border-bottom:1px solid #222;color:#ccc;">
                          <span style="color:#f44336;margin-right:5px;">✖</span>
                          <strong>${c.Titulo || '?'}</strong>
                          <span style="color:#555;font-size:0.85em;"> · ${c.Apartado || ''}</span>
                       </div>`;
                  }).join('');
        }

        Logger.info(`Examen terminado: nota ${niceNota}, bien=${bien}, repasar=${aRep}`);

        if (!_config.demo && typeof EventBus !== 'undefined') {
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

    function mostrarResultadoExterno({ origen, nota, bien, mal, descripcion, detalles, etiqueta = 'Nota' }) {
        _ultimoResultado = origen;
        const notaValida = Number.isFinite(nota);
        const puntuacion = notaValida ? Math.max(0, Math.min(10, nota)) : 0;
        const [estrellas, titulo, colorTexto] =
            puntuacion >= 9 ? [5, 'Sobresaliente', '#FFD700'] :
            puntuacion >= 8 ? [4, 'Notable alto', '#bb86fc'] :
            puntuacion >= 7 ? [3, 'Notable bajo', '#bb86fc'] :
            puntuacion >= 6 ? [3, 'Bien', '#4dabf7'] :
            puntuacion >= 5 ? [2, 'Aprobado', '#4dabf7'] :
            puntuacion >= 3.5 ? [1, 'La próxima será...', '#ef5350'] : [0, 'Suspenso', '#ef5350'];
        const heading = document.getElementById('ex-res-titulo');
        heading.textContent = origen === 'feynman' ? 'Informe Feynman' : titulo;
        heading.style.color = origen === 'feynman' ? 'var(--accent)' : colorTexto;
        document.getElementById('ex-res-emoji').innerHTML = generarBarraEstrellas(notaValida ? estrellas : 0);
        document.getElementById('ex-res-asig').textContent = descripcion;
        document.getElementById('ex-res-nota').textContent = notaValida ? nota.toFixed(1) : '—';
        document.getElementById('ex-res-nota').nextElementSibling.textContent = etiqueta;
        document.getElementById('ex-res-ok').textContent = bien;
        document.getElementById('ex-res-ok').nextElementSibling.textContent = origen === 'feynman' ? 'Verificadas' : 'Bien';
        document.getElementById('ex-res-fail').textContent = mal;
        document.getElementById('ex-res-fail').nextElementSibling.textContent = origen === 'feynman' ? 'Pendientes' : 'A repasar';
        document.getElementById('ex-res-lista').replaceChildren(detalles);
        document.getElementById('btn-repetirexamen').querySelector('i').className = 'fa-solid fa-rotate-left';
        _show('examen-resultados');
    }

    function repetirDesdeResultado() {
        if (_ultimoResultado === 'quiz') { Quiz.repetir(); return; }
        if (_ultimoResultado === 'feynman') { abrir(); setModo('feynman'); return; }
        repetir();
    }

    function repetir() {
        _cola       = _shuffle(_cola);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
        _flashReveladas = new Array(_cola.length).fill(false);
        
        if (_modo === 'feynman') {
            if (typeof FEYNMAN === 'undefined' || typeof UIFeynman === 'undefined') return;
            UIFeynman.montar();
            if (FEYNMAN.iniciar({ tarjetas: _cola, config: _config, personaje: UIFeynman.leerPersonaje(), reto: UIFeynman.leerReto() })) {
                _show('examen-feynman');
            }
        } else if (_modo === 'flash') {
            _show('examen-flash'); _flashRender();
            if (_config.tiempo > 0) _flashStartTimer(_config.tiempo);
        } else {
            _show('examen-real'); _realRender();
            if (_config.tiempo > 0) _realStartTimer(_config.tiempo * 60);
        }
    }

    function cerrar() {
        _clearTimer();
        if (typeof FEYNMAN !== 'undefined') FEYNMAN.cerrar();
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
        abrir, setModo, iniciar, iniciarDemo, cerrar, repetir, mostrarVista: _show, leerFiltros,
        flashRevelar, flashPuntuar, flashSaltar, flashAnterior, flashIrA,
        mostrarResultadoExterno, repetirDesdeResultado,
        realGuardarRespuesta, realSiguiente, realAnterior, realEntregar,
        correccionPuntuar, calcularNota,
        _api: { realIrA }
    };
})();

// ── Proxies globales ─────────────────────────────────────────────
window.abrirExamen                = () => EXAM.abrir();
window.examenSetMode              = m  => EXAM.setModo(m);
window.iniciarExamen              = () => EXAM.iniciar();
window.probarExamen               = () => EXAM.iniciarDemo();
window.cerrarExamen               = () => {
    EXAM.cerrar();
    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
    const nombreAsignaturaActual = State.get('nombreAsignaturaActual');
    if (nombreAsignaturaActual && typeof cargarAsignatura === 'function') cargarAsignatura(nombreAsignaturaActual);
};
window.repetirExamen              = () => EXAM.repetir();
window.examenFlashRevelar         = () => EXAM.flashRevelar();
window.examenFlashSaltar          = () => EXAM.flashSaltar();
window.examenFlashAnterior        = () => EXAM.flashAnterior();
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
