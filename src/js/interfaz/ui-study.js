// ════════════════════════════════════════════════════════════════
// UI-STUDY.JS — Tarjeta de estudio, filtros y controles de modo
// ════════════════════════════════════════════════════════════════

const UIStudy = (() => {

    function getEstadoFiltros() {
        return {
            hoy:               document.getElementById('check-filtro-hoy')?.checked,
            nuevas:            document.getElementById('check-filtro-nuevas')?.checked,
            tema:              document.getElementById('check-filtro-tema')?.checked,
            rango:             document.getElementById('check-filtro-rango')?.checked,
            tipo:              document.getElementById('check-filtro-tipo')?.checked,
            dificultad:        document.getElementById('check-filtro-dificultad')?.checked,
            temaVal:           document.getElementById('filtro-tema-val')?.value || '',
            rangoVal:          document.getElementById('filtro-rango-val')?.value || '',
            tiposSeleccionados: [...document.querySelectorAll('#filtro-tipo-grid input:checked')].map(cb => cb.value.toLowerCase()),
            difsActivas:       ['1','2','3','4'].filter(n => document.getElementById(`check-dif-${n}`)?.checked)
        };
    }

    function renderEstadoFiltros(filtros, totalTarjetas, isSecuencial) {
    const icon  = document.getElementById('filtros-icon');
    const count = document.getElementById('contador-filtro');
    if (!icon || !count) return;

    const hayFiltros = filtros.hoy || filtros.nuevas || filtros.tema || 
                       filtros.rango || filtros.tipo || filtros.dificultad;

    icon.style.color = hayFiltros ? 'var(--status-green)' : 'var(--status-red)';
    count.innerText  = `${totalTarjetas} tarjetas`;

    const btnFiltros = document.getElementById('btn-filtros-dropdown');
    if (btnFiltros) {
        btnFiltros.style.borderColor = hayFiltros ? 'var(--status-green)' : '';
        btnFiltros.style.color       = hayFiltros ? 'var(--status-green)' : '';
    }

    const btnSeq = document.getElementById('btn-modo-secuencial');
    if (btnSeq) {
        btnSeq.style.color       = isSecuencial ? 'var(--status-green)' : 'var(--text-muted)';
        btnSeq.style.borderColor = isSecuencial ? 'var(--status-green)' : 'var(--border)';
    }
}

    function renderizarConceptoActual(tarjeta, modoLec, tiposConfig = {}) {
        if (!tarjeta) return;

        const tipo      = tarjeta.Apartado || 'Concepto';
        const colorTipo = tiposConfig[tipo]?.color || 'var(--accent)';
        const tit       = document.getElementById('concepto-titulo');

        if (tit) {
            tit.style.color = colorTipo;
            tit.innerHTML   = `<span style="font-size:0.6em;opacity:0.8;text-transform:uppercase;display:block;margin-bottom:5px;">${escapeHtml(tipo)}</span>${escapeHtml(tarjeta.Titulo || '')}`;
        }

        const cont = document.getElementById('concepto-contenido');
        if (cont) {
            cont.innerHTML = typeof Parser !== 'undefined'
                ? Parser.sanearLatex(tarjeta.Contenido)
                : tarjeta.Contenido;
        }

        const metaTema = document.getElementById('meta-tema');
        if (metaTema) {
            let txtContext = `Tema ${tarjeta.Tema || 1}`;
            if (tarjeta.IndiceGlobal !== undefined) txtContext += ` · # ${tarjeta.IndiceGlobal}`;
            metaTema.innerText = txtContext;
        }

        const fElem   = document.getElementById('meta-fecha');
        // Fallback seguro de window.* asumiendo inyección global
        const fHoy    = typeof window.getFechaHoy === 'function' ? window.getFechaHoy() : new Date().toISOString().split('T')[0];
        const hoyVal  = typeof window.fechaValor === 'function' ? window.fechaValor(fHoy) : Date.parse(fHoy);
        const proxVal = typeof window.fechaValor === 'function' ? window.fechaValor(tarjeta.ProximoRepaso) : Date.parse(tarjeta.ProximoRepaso);

        if (fElem) {
            if (proxVal < hoyVal) {
                fElem.innerText   = 'Retraso: ' + (typeof window.formatDateForUI === 'function' ? window.formatDateForUI(tarjeta.ProximoRepaso) : tarjeta.ProximoRepaso);
                fElem.style.color = 'var(--status-red)';
            } else if (proxVal === hoyVal) {
                fElem.innerText   = 'Hoy';
                fElem.style.color = 'var(--status-yellow)';
            } else {
                fElem.innerText   = 'Adelanto: ' + (typeof window.formatDateForUI === 'function' ? window.formatDateForUI(tarjeta.ProximoRepaso) : tarjeta.ProximoRepaso);
                fElem.style.color = 'var(--text-muted)';
            }
        }

        const btnOcultar = document.getElementById('btn-ocultar');
        if (modoLec) {
            cont?.classList.remove('hidden');
            document.getElementById('controles-respuesta')?.classList.remove('hidden');
            document.getElementById('area-revelar')?.classList.add('hidden');
            btnOcultar?.classList.remove('hidden');
        } else {
            cont?.classList.add('hidden');
            document.getElementById('controles-respuesta')?.classList.add('hidden');
            document.getElementById('area-revelar')?.classList.remove('hidden');
            btnOcultar?.classList.add('hidden');
        }

        if (typeof MathJax !== 'undefined') {
            const target = document.getElementById('study-card');
            if (target) {
                MathJax.typesetClear([target]);
                MathJax.typesetPromise([target]).catch(err => {
                    if (err?.message?.includes('replaceChild') || err?.stack?.includes('replaceChild')) return;
                    if (typeof Logger !== 'undefined') Logger.error('Error MathJax:', err);
                });
            }
        }
    }

    function renderControlesModoEstudio(isSecuencial) {
        const btnPrev     = document.getElementById('btn-prev');
        const btnNextText = document.getElementById('btn-next-text');
        const nextShortcut = document.getElementById('next-shortcut');

        if (isSecuencial) {
            btnPrev?.classList.remove('hidden');
            if (btnNextText)  btnNextText.innerText   = 'Siguiente';
            if (nextShortcut) nextShortcut.innerText  = '[→]';
        } else {
            btnPrev?.classList.add('hidden');
            if (btnNextText)  btnNextText.innerText   = 'Siguiente (Random)';
            if (nextShortcut) nextShortcut.innerText  = '[→]';
        }
    }

    return {
        getEstadoFiltros,
        renderEstadoFiltros,
        renderizarConceptoActual,
        renderControlesModoEstudio,
    };
})();
