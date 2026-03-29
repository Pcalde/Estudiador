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

    function renderizarConceptoActual(tarjeta, modoLec, tiposConfig) {
        if (!tarjeta) return;

        const tipo = String(tarjeta.Apartado || 'Concepto').trim();
        let colorTipo = 'var(--accent)'; // Fallback arquitectónico (hereda color de la asignatura)

        // PROTECCIÓN ARQUITECTÓNICA: Resolución polimórfica y case-insensitive
        if (tiposConfig) {
            if (Array.isArray(tiposConfig)) {
                // Si la configuración viene como Array [{nombre: 'Concepto', color: '#ff0000'}, ...]
                const match = tiposConfig.find(t => 
                    String(t.nombre || t.tipo || t.id || '').toLowerCase() === tipo.toLowerCase()
                );
                if (match && match.color) colorTipo = match.color;
            } else if (typeof tiposConfig === 'object') {
                // Si la configuración viene como Diccionario {'Concepto': {color: '#ff0000'}}
                const key = Object.keys(tiposConfig).find(k => 
                    String(k).toLowerCase() === tipo.toLowerCase()
                );
                if (key && tiposConfig[key] && tiposConfig[key].color) {
                    colorTipo = tiposConfig[key].color;
                }
            }
        }

        const tit = document.getElementById('concepto-titulo');
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
        if (metaTema) metaTema.innerText = `Tema ${tarjeta.Tema}`;

        const fElem   = document.getElementById('meta-fecha');
        const hoyVal  = typeof fechaValor === 'function' ? fechaValor(getFechaHoy()) : 0;
        const proxVal = typeof fechaValor === 'function' && tarjeta.ProximoRepaso ? fechaValor(tarjeta.ProximoRepaso) : 0;

        if (fElem && proxVal) {
            if (proxVal < hoyVal) {
                fElem.innerText   = 'Retraso: ' + formatDateForUI(tarjeta.ProximoRepaso);
                fElem.style.color = 'var(--status-red)';
            } else if (proxVal === hoyVal) {
                fElem.innerText   = 'Hoy';
                fElem.style.color = 'var(--status-yellow)';
            } else {
                fElem.innerText   = 'Adelanto: ' + formatDateForUI(tarjeta.ProximoRepaso);
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
