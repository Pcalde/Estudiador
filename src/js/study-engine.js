// ════════════════════════════════════════════════════════════════
// STUDY-ENGINE.JS — Motor de Estudio y Gestión de Cola
// Encapsula el filtrado, la navegación (anterior/siguiente)
// y el procesamiento de la lógica SRS (FSRS).
// ════════════════════════════════════════════════════════════════

const StudyEngine = (() => {

    let _cb = {
        guardarEnLocal: () => {},
        updateDashboard: () => {}
    };

    function init(callbacks) {
        _cb = { ..._cb, ...callbacks };
    }

    function _parsearListaNumeros(str) {
        const result = new Set();
        if (!str || !str.trim()) return result;
        str.split(',').forEach(part => {
            part = part.trim();
            const rango = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
            if (rango) {
                const desde = parseInt(rango[1]), hasta = parseInt(rango[2]);
                for (let i = Math.min(desde, hasta); i <= Math.max(desde, hasta); i++) result.add(i);
            } else if (/^\d+$/.test(part)) {
                result.add(parseInt(part));
            }
        });
        return result;
    }

    function aplicarFiltros() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) return;
        
        const biblioteca = State.get('biblioteca');
        const todos = biblioteca[asigActual] || [];
        let filtrados = [...todos];

        const filtroHoy        = document.getElementById('check-filtro-hoy')?.checked;
        const filtroNuevas     = document.getElementById('check-filtro-nuevas')?.checked;
        const filtroTema       = document.getElementById('check-filtro-tema')?.checked;
        const filtroRango      = document.getElementById('check-filtro-rango')?.checked;
        const filtroTipo       = document.getElementById('check-filtro-tipo')?.checked;
        const filtroDificultad = document.getElementById('check-filtro-dificultad')?.checked;

        if (filtroHoy) {
            filtrados = filtrados.filter(c => !c.ProximoRepaso || window.esVencido(c.ProximoRepaso));
        }
        if (filtroNuevas) {
            filtrados = filtrados.filter(c => !c.UltimoRepaso);
        }
        if (filtroTema) {
            const temasSet = _parsearListaNumeros(document.getElementById('filtro-tema-val')?.value || '');
            if (temasSet.size > 0) filtrados = filtrados.filter(c => temasSet.has(parseInt(c.Tema)));
        }
        if (filtroRango) {
            const rangoStr = document.getElementById('filtro-rango-val')?.value || '';
            const idxSet = _parsearListaNumeros(rangoStr);
            if (idxSet.size > 0) {
                filtrados = filtrados.filter(c => idxSet.has(c.IndiceGlobal !== undefined ? c.IndiceGlobal : 0));
            } else {
                const m = rangoStr.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
                if (m) {
                    const desde = parseInt(m[1]), hasta = parseInt(m[2]);
                    filtrados = filtrados.filter(c => {
                        const idx = c.IndiceGlobal !== undefined ? c.IndiceGlobal : 0;
                        return idx >= desde && idx <= hasta;
                    });
                }
            }
        }
        if (filtroTipo) {
            const tiposSeleccionados = [...document.querySelectorAll('#filtro-tipo-grid input:checked')].map(cb => cb.value.toLowerCase());
            if (tiposSeleccionados.length > 0) {
                filtrados = filtrados.filter(c => tiposSeleccionados.some(t => (c.Apartado || '').toLowerCase().startsWith(t)));
            }
        }
        if (filtroDificultad) {
            const difsActivas = ['1','2','3','4'].filter(n => document.getElementById(`check-dif-${n}`)?.checked);
            if (difsActivas.length > 0) {
                const REGLAS_DIFICULTAD = {
                    '1': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) <= 4.0,
                    '2': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) >  4.0 && (c.fsrs_difficulty || 5) <= 7.0,
                    '3': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) >  7.0,
                    '4': c => c.fsrs_state === 'learning',
                };
                filtrados = filtrados.filter(c => difsActivas.some(d => REGLAS_DIFICULTAD[d](c)));
            }
        }

        State.set('colaEstudio', filtrados);
        State.set('indiceNavegacion', 0);

        const nFiltros = [filtroHoy, filtroNuevas, filtroTema, filtroRango, filtroTipo, filtroDificultad].filter(Boolean).length;
        const icon = document.getElementById('filtros-icon');
        const btn = document.getElementById('btn-filtros-dropdown');
        if (icon) icon.style.color = nFiltros > 0 ? '#4caf50' : '#e53935';
        if (btn) btn.style.borderColor = nFiltros > 0 ? '#4caf50' : '#555';

        const contador = document.getElementById('contador-filtro');
        if (contador) contador.innerText = `[${filtrados.length}]`;
        const contadorModal = document.getElementById('contador-filtro-modal');
        if (contadorModal) contadorModal.innerText = `${filtrados.length} tarjetas`;

        if (filtrados.length === 0) {
            UI.renderTarjetaVacia();
        } else {
            if (State.get('modoSecuencial')) {
                filtrados.sort((a, b) => {
                    const tA = parseInt(a.Tema) || 0;
                    const tB = parseInt(b.Tema) || 0;
                    if (tA !== tB) return tA - tB;
                    return (a.IndiceGlobal || 0) - (b.IndiceGlobal || 0);
                });
            }
            siguienteTarjeta(false);
        }
    }

    function anteriorTarjeta() {
        let cola = State.get('colaEstudio');
        let idx = State.get('indiceNavegacion');
        
        if (!State.get('modoSecuencial') || cola.length === 0) return;
        
        idx--;
        if (idx < 0) idx = cola.length - 1;
        
        State.set('indiceNavegacion', idx);
        State.set('conceptoActual', cola[idx]);
        
        const contador = document.getElementById('contador-filtro');
        if(contador) contador.innerText = `[${idx + 1}/${cola.length}]`;
        
        UI.renderizarConceptoActual(cola[idx], State.get('modoLectura'));

        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([document.getElementById('study-card')]).catch(()=>{});
        }
    }

    function siguienteTarjeta(avanzar = true) {
        let cola = State.get('colaEstudio');
        let idx = State.get('indiceNavegacion');

        if (!cola || cola.length === 0) { 
            aplicarFiltros(); 
            return; 
        }

        if (State.get('modoSecuencial')) {
            if (avanzar) {
                idx++;
                if (idx >= cola.length) idx = 0;
            }
            if (idx < 0) idx = 0;
        } else {
            idx = Math.floor(Math.random() * cola.length);
        }

        State.set('indiceNavegacion', idx);
        const concepto = cola[idx];
        State.set('conceptoActual', concepto);

        // Renderizado UI
        const tipo = concepto.Apartado || 'Definición';
        const tit = document.getElementById('concepto-titulo');
        tit.className = `color-${tipo}`; 
        tit.innerHTML = `<span style="font-size:0.6em; opacity:0.8; text-transform:uppercase; display:block; margin-bottom:5px;">${window.escapeHtml(tipo)}</span>${window.escapeHtml(concepto.Titulo || '')}`;
        
        document.getElementById('concepto-contenido').innerHTML = Parser.sanearLatex(concepto.Contenido);
        document.getElementById('meta-tema').innerText = `Tema ${concepto.Tema || '?'}`;
        
        const contador = document.getElementById('contador-filtro');
        if (contador) contador.innerText = State.get('modoSecuencial') ? `[${idx + 1}/${cola.length}]` : `[${cola.length}]`;

        // Semáforo Fechas
        const fElem = document.getElementById('meta-fecha');
        const hoyVal = window.fechaValor(window.getFechaHoy());
        const proxVal = window.fechaValor(concepto.ProximoRepaso);

        if (!concepto.ProximoRepaso) {
            fElem.innerText = "Nueva"; fElem.style.color = "#e0e0e0";
        } else if (proxVal < hoyVal) {
            fElem.innerText = "Retraso: " + window.formatDateForUI(concepto.ProximoRepaso); fElem.style.color = "var(--status-red)"; 
        } else if (proxVal === hoyVal) {
            fElem.innerText = "Hoy"; fElem.style.color = "var(--status-yellow)";
        } else {
            fElem.innerText = "Adelanto: " + window.formatDateForUI(concepto.ProximoRepaso); fElem.style.color = "#888";
        }

        const btnOcultar = document.getElementById('btn-ocultar');
        if (State.get('modoLectura')) {
            document.getElementById('concepto-contenido').classList.remove('hidden');
            document.getElementById('controles-respuesta').classList.remove('hidden');
            document.getElementById('area-revelar').classList.add('hidden');
            if(btnOcultar) btnOcultar.classList.remove('hidden');
        } else {
            document.getElementById('concepto-contenido').classList.add('hidden');
            document.getElementById('controles-respuesta').classList.add('hidden');
            document.getElementById('area-revelar').classList.remove('hidden');
            if(btnOcultar) btnOcultar.classList.add('hidden');
        }

        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([document.getElementById('study-card')]).catch(()=>{});
    }

    function procesarRepaso(calidad) {
        const conceptoActual = State.get('conceptoActual');
        if (!conceptoActual) return;

        let sessionData = State.get('sessionData') || { tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0 };
        sessionData.tarjetas++;
        if (calidad === 1) sessionData.faciles++;
        else if (calidad === 3) sessionData.dificiles++;
        else if (calidad === 4) sessionData.criticas++;
        State.set('sessionData', sessionData);

        const { tarjeta: tarjetaActualizada, reencolar } = Scheduler.calcularSiguienteRepaso(conceptoActual, calidad);

        if (reencolar) {
            conceptoActual.Dificultad  = tarjetaActualizada.Dificultad;
            conceptoActual.EtapaRepaso = tarjetaActualizada.EtapaRepaso;
            _cb.guardarEnLocal();
            _cb.updateDashboard();
            siguienteTarjeta();
            return;
        }

        conceptoActual.Dificultad    = tarjetaActualizada.Dificultad;
        conceptoActual.EtapaRepaso   = tarjetaActualizada.EtapaRepaso;
        conceptoActual.UltimoRepaso  = tarjetaActualizada.UltimoRepaso;
        conceptoActual.ProximoRepaso = tarjetaActualizada.ProximoRepaso;

        _cb.guardarEnLocal();
        _cb.updateDashboard();
        
        let cola = State.get('colaEstudio');
        let idx = State.get('indiceNavegacion');

        if (State.get('modoSecuencial')) {
            if (document.getElementById('check-filtro-hoy')?.checked) {
                cola.splice(idx, 1);
                if (idx >= cola.length) idx = 0;
                State.set('colaEstudio', cola);
                State.set('indiceNavegacion', idx);
                
                if (cola.length === 0) UI.renderTarjetaVacia();
                else {
                     State.set('conceptoActual', cola[idx]);
                     UI.renderizarConceptoActual(cola[idx], State.get('modoLectura'));
                }
            } else {
                siguienteTarjeta();
            }
        } else {
            State.set('colaEstudio', cola.filter(c => c !== conceptoActual));
            siguienteTarjeta();
        }
    }

    function toggleModoSecuencial() {
        const isSec = document.getElementById('check-secuencial').checked;
        State.set('modoSecuencial', isSec);
        
        const btnPrev = document.getElementById('btn-prev');
        const btnNextText = document.getElementById('btn-next-text');
        const nextShortcut = document.querySelector('.btn-next .btn-shortcut');

        if(isSec) {
            let cola = State.get('colaEstudio');
            cola.sort((a,b) => window.fechaValor(a.ProximoRepaso) - window.fechaValor(b.ProximoRepaso));
            State.set('colaEstudio', cola);
            State.set('indiceNavegacion', 0);
            if(btnPrev) btnPrev.classList.remove('hidden');
            if(btnNextText) btnNextText.innerText = "Siguiente"; 
            if(nextShortcut) nextShortcut.innerText = "[→]"; 
        } else {
            if(btnPrev) btnPrev.classList.add('hidden');
            if(btnNextText) btnNextText.innerText = "Siguiente (Random)";
            if(nextShortcut) nextShortcut.innerText = "[→]"; 
        }
        siguienteTarjeta(false); 
    }

    function toggleModoLectura() {
        const isLec = document.getElementById('check-lectura').checked;
        State.set('modoLectura', isLec);
        if(isLec && document.getElementById('concepto-contenido')?.classList.contains('hidden')) {
            UI.revelar();
        }
    }

    return {
        init, aplicarFiltros, anteriorTarjeta, siguienteTarjeta,
        procesarRepaso, toggleModoSecuencial, toggleModoLectura
    };
})();

// Proxies DOM
window.aplicarFiltros = () => StudyEngine.aplicarFiltros();
window.anteriorTarjeta = () => StudyEngine.anteriorTarjeta();
window.siguienteTarjeta = (b) => StudyEngine.siguienteTarjeta(b);
window.procesarRepaso = (n) => StudyEngine.procesarRepaso(n);
window.toggleModoSecuencial = () => StudyEngine.toggleModoSecuencial();
window.toggleModoLectura = () => StudyEngine.toggleModoLectura();