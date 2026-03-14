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

/**
 * Genera dinámicamente una barra de 5 estrellas (privada al módulo).
 * @param {number} plenas - Estrellas doradas a mostrar (0-5).
 * @returns {string} HTML con iconos FontAwesome.
 */
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
    let _modo       = 'flash';  // 'flash' | 'real'
    let _cola       = [];
    let _idx        = 0;
    let _puntos     = [];       // calificación [1-4] por tarjeta
    let _respuestas = [];       // texto libre del usuario (modo real)
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

    // ── CONFIG ────────────────────────────────────────────────────
    function abrir() {
        if (typeof Logger !== 'undefined') Logger.info('Modo Examen: abriendo');

        // Usamos el global directo: el listener de teclado en app.js lo lee así
        window._examenActivo = true;

        document.getElementById('examen-modal').style.display = 'flex';
        _show('examen-config');

        const sel = document.getElementById('ex-asig');
        sel.innerHTML = Object.keys(biblioteca).map(a => `<option value="${a}">${a}</option>`).join('');
        if (nombreAsignaturaActual && biblioteca[nombreAsignaturaActual]) sel.value = nombreAsignaturaActual;

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
        document.getElementById('ex-mode-btn-flash').style.borderColor = m === 'flash' ? 'var(--accent)' : '#333';
        document.getElementById('ex-mode-btn-flash').style.background  = m === 'flash' ? 'rgba(76,175,80,0.12)' : 'transparent';
        document.getElementById('ex-mode-btn-real').style.borderColor  = m === 'real'  ? '#2196F3' : '#333';
        document.getElementById('ex-mode-btn-real').style.background   = m === 'real'  ? 'rgba(33,150,243,0.12)' : 'transparent';

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
        const temasFiltro = temasRaw
            ? temasRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
            : [];
        const tiposChecked = [...document.querySelectorAll('#ex-tipos-grid input:checked')].map(cb => cb.value);

        if (!biblioteca[asig] || biblioteca[asig].length === 0) {
            alert('La asignatura está vacía.');
            return;
        }

        let pool = biblioteca[asig].filter(c => {
            const tipoOk = tiposChecked.length === 0 || tiposChecked.includes(c.Apartado);
            const temaOk = temasFiltro.length === 0  || temasFiltro.includes(Number(c.Tema));
            return tipoOk && temaOk;
        });
        if (pool.length === 0) { alert('Ninguna tarjeta coincide con los filtros.'); return; }

        _cola       = _shuffle(pool).slice(0, numMax);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
        _config     = { asig, tiempo, modo: _modo, numMax: _cola.length };

        if (typeof Logger !== 'undefined') Logger.info(`Examen (${_modo}): ${_cola.length} tarjetas de "${asig}"`);

        if (_modo === 'flash') {
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
        document.getElementById('ex-f-tipo').style.cssText =
            `font-size:0.7em;font-weight:bold;padding:2px 10px;border-radius:12px;` +
            `background:${color}22;color:${color};border:1px solid ${color};`;
        document.getElementById('ex-f-tema').innerText           = `Tema ${c.Tema || '?'}`;
        document.getElementById('ex-f-titulo').innerHTML         = c.Titulo || '';
        document.getElementById('ex-f-contenido').innerHTML      = c.Contenido || '';
        document.getElementById('ex-f-contenido').style.display  = 'none';
        document.getElementById('ex-f-btn-revelar').style.display = 'block';
        document.getElementById('ex-f-valoracion').style.display  = 'none';

        document.getElementById('ex-f-bar').style.width   = `${(_idx / _cola.length) * 100}%`;
        document.getElementById('ex-f-label').innerText   = `${_idx + 1}/${_cola.length}`;

        if (typeof MathJax !== 'undefined')
            MathJax.typesetPromise([document.getElementById('examen-flash')]).catch(() => {});
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
        if (typeof MathJax !== 'undefined')
            MathJax.typesetPromise([document.getElementById('ex-f-contenido')]).catch(() => {});
    }

    function flashPuntuar(n) {
        _puntos[_idx] = n;
        _idx++;
        _flashRender();
        if (_config.tiempo > 0 && _idx < _cola.length) _flashStartTimer(_config.tiempo);
    }

    // ── MODO REAL ─────────────────────────────────────────────────
    function _realRender() {
        _idx = Math.max(0, Math.min(_idx, _cola.length - 1));
        const c     = _cola[_idx];
        const color = TIPOS_COLORES[c.Apartado] || '#2196F3';

        document.getElementById('ex-r-tipo').innerText  = c.Apartado || 'Tarjeta';
        document.getElementById('ex-r-tipo').style.cssText =
            `font-size:0.7em;font-weight:bold;padding:2px 10px;border-radius:12px;` +
            `background:${color}22;color:${color};border:1px solid ${color};`;
        document.getElementById('ex-r-tema').innerText           = `Tema ${c.Tema || '?'}`;
        document.getElementById('ex-r-titulo').innerHTML         = c.Titulo || '';
        document.getElementById('ex-r-respuesta').value          = _respuestas[_idx] || '';

        document.getElementById('ex-r-bar').style.width  = `${((_idx + 1) / _cola.length) * 100}%`;
        document.getElementById('ex-r-label').innerText  = `P ${_idx + 1}/${_cola.length}`;

        document.getElementById('ex-r-nav').innerHTML = _cola.map((_, i) => {
            const resp   = (_respuestas[i] || '').trim();
            const active = i === _idx;
            const bg     = active ? '#2196F3' : resp ? '#4CAF50' : '#333';
            const border = active ? '2px solid #2196F3' : `2px solid ${bg}`;
            const color  = (active || resp) ? 'white' : '#666';
            return `<button onclick="EXAM._api.realIrA(${i})"
                style="width:28px;height:28px;border-radius:50%;background:${bg};border:${border};
                       color:${color};font-size:0.7em;cursor:pointer;font-weight:bold;">${i + 1}</button>`;
        }).join('');

        if (typeof MathJax !== 'undefined')
            MathJax.typesetPromise([document.getElementById('ex-r-titulo')]).catch(() => {});
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

    function realGuardarRespuesta() {
        _respuestas[_idx] = document.getElementById('ex-r-respuesta').value;
        _realRender();
    }

    function realIrA(i) {
        _respuestas[_idx] = document.getElementById('ex-r-respuesta').value;
        _idx = i;
        _realRender();
    }

    function realSiguiente() {
        _respuestas[_idx] = document.getElementById('ex-r-respuesta').value;
        if (_idx < _cola.length - 1) { _idx++; _realRender(); }
    }

    function realAnterior() {
        _respuestas[_idx] = document.getElementById('ex-r-respuesta').value;
        if (_idx > 0) { _idx--; _realRender(); }
    }

    function realEntregar() {
        _clearTimer();
        _respuestas[_idx] = document.getElementById('ex-r-respuesta').value;
        if (typeof Logger !== 'undefined') Logger.info('Examen real entregado');
        _show('examen-correccion');
        _renderCorreccion();
    }

    // ── CORRECCIÓN ────────────────────────────────────────────────
    function _renderCorreccion() {
        document.getElementById('ex-c-lista').innerHTML = _cola.map((c, i) => {
            const color = TIPOS_COLORES[c.Apartado] || '#888';
            const botonesNota = [1, 2, 3, 4].map(n => {
                const bg  = ['', 'rgba(33,150,243,0.2)', 'rgba(76,175,80,0.2)', 'rgba(255,152,0,0.2)', 'rgba(244,67,54,0.2)'][n];
                const bc  = ['', '#2196F3', '#4CAF50', '#FF9800', '#f44336'][n];
                const lbl = ['', 'Fácil', 'Bien', 'Difícil', 'Mal'][n];
                return `<button onclick="window.examenCorreccionPuntuar(${i},${n})" id="ex-c-btn-${i}-${n}"
                    style="padding:7px 2px;background:${bg};border:1px solid ${bc};color:${bc};
                           border-radius:6px;cursor:pointer;font-size:0.8em;font-weight:bold;">${n} ${lbl}</button>`;
            }).join('');

            return `
            <div id="ex-c-item-${i}" style="border:1px solid #2a2a2a;border-radius:8px;padding:14px;background:#151515;">
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <span style="font-size:0.7em;padding:1px 8px;border-radius:10px;background:${color}22;color:${color};border:1px solid ${color};">${c.Apartado || ''}</span>
                    <span style="font-size:0.75em;color:#555;">Tema ${c.Tema || '?'}</span>
                    <span style="font-size:0.75em;color:#888;margin-left:auto;">P${i + 1}</span>
                </div>
                <div style="font-weight:bold;color:#eee;margin-bottom:10px;">${c.Titulo || ''}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;font-size:0.85em;">
                    <div>
                        <div style="color:#888;margin-bottom:4px;font-size:0.8em;text-transform:uppercase;">Tu respuesta</div>
                        <div style="background:#1a1a1a;border-radius:5px;padding:8px;color:#aaa;white-space:pre-wrap;min-height:40px;">
                            ${(_respuestas[i] || '').trim() || '<em style="color:#555">(en blanco)</em>'}
                        </div>
                    </div>
                    <div>
                        <div style="color:#888;margin-bottom:4px;font-size:0.8em;text-transform:uppercase;">Solución</div>
                        <div style="background:#1a1a1a;border-radius:5px;padding:8px;color:#ccc;line-height:1.5;min-height:40px;">
                            ${c.Contenido || ''}
                        </div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">${botonesNota}</div>
            </div>`;
        }).join('');

        if (typeof MathJax !== 'undefined')
            MathJax.typesetPromise([document.getElementById('ex-c-lista')]).catch(() => {});
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
        if (submitBtn) submitBtn.innerText = pendientes === 0
            ? 'Ver nota final →'
            : `Ver nota final (faltan ${pendientes}) →`;
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
        const notaFinal = nota10 !== undefined
            ? nota10
            : (pts.reduce((a, n) => a + PESOS[n], 0) / total) * 10;

        const niceNota = notaFinal.toFixed(1);
        const bien     = pts.filter(p => p <= 2).length;
        const aRep     = pts.filter(p => p >= 3).length;

        document.getElementById('ex-res-nota').innerText = niceNota;
        document.getElementById('ex-res-ok').innerText   = bien;
        document.getElementById('ex-res-fail').innerText = aRep;
        document.getElementById('ex-res-asig').innerText =
            `${_config.asig} · ${total} tarjetas · ${_config.modo === 'flash' ? 'Repaso rápido' : 'Examen real'}`;

        // Bug corregido: el original solo extraía [estrellas, titulo], colorTexto quedaba undefined
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
        elTitulo.innerText   = titulo;
        elTitulo.style.color = colorTexto;

        const falladas = _cola.filter((_, i) => pts[i] >= 3);
        document.getElementById('ex-res-lista').innerHTML = falladas.length === 0
            ? '<p style="color:#4CAF50;text-align:center;"><i class="fa-solid fa-check"></i> Todo correcto o bien</p>'
            : `<p style="color:#888;margin:0 0 8px 0;">A repasar (${falladas.length}):</p>` +
              falladas.map(c =>
                  `<div style="padding:4px 0;border-bottom:1px solid #222;color:#ccc;">
                      <span style="color:#f44336;margin-right:5px;">✖</span>
                      <strong>${c.Titulo || '?'}</strong>
                      <span style="color:#555;font-size:0.85em;"> · ${c.Apartado || ''}</span>
                   </div>`
              ).join('');

        if (typeof Logger !== 'undefined')
            Logger.info(`Examen terminado: nota ${niceNota}, bien=${bien}, repasar=${aRep}`);
    }

    function repetir() {
        _cola       = _shuffle(_cola);
        _idx        = 0;
        _puntos     = new Array(_cola.length).fill(null);
        _respuestas = new Array(_cola.length).fill('');
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
        // Global directo: el listener de teclado en app.js lo lee como _examenActivo
        window._examenActivo = false;
        const modal = document.getElementById('examen-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active'); // por si el CSS usa esta clase para animaciones
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

// ── Proxies globales (usados por DOMContentLoaded en app.js) ─────
window.abrirExamen                = () => EXAM.abrir();
window.examenSetMode              = m  => EXAM.setModo(m);
window.iniciarExamen              = () => EXAM.iniciar();
window.cerrarExamen               = () => {
    EXAM.cerrar();
    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
    if (nombreAsignaturaActual && typeof cargarAsignatura === 'function')
        cargarAsignatura(nombreAsignaturaActual);
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
