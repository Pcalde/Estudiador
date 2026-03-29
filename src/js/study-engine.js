// ════════════════════════════════════════════════════════════════
// STUDY-ENGINE.JS — Motor de Estudio y Gestión de Cola
// Encapsula el filtrado, la navegación (anterior/siguiente)
// y el procesamiento de la lógica SRS (FSRS).
// ════════════════════════════════════════════════════════════════

const StudyEngine = (() => {

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

        // LECTURA DEFENSIVA: Si UI.getEstadoFiltros() falla, aplicamos objeto vacío por defecto
        const rawFiltros = (typeof UI !== 'undefined' && UI.getEstadoFiltros) ? UI.getEstadoFiltros() : null;
        const f = rawFiltros || { 
            hoy: false, nuevas: false, tema: false, rango: false, tipo: false, dificultad: false,
            tiposSeleccionados: [], difsActivas: []
        };

        // 1. Filtrado Matemático
        if (f.hoy) filtrados = filtrados.filter(c => !c.ProximoRepaso || window.esVencido(c.ProximoRepaso));
        if (f.nuevas) filtrados = filtrados.filter(c => !c.UltimoRepaso);
        if (f.tema && f.temaVal) {
            const temasSet = _parsearListaNumeros(f.temaVal);
            if (temasSet.size > 0) filtrados = filtrados.filter(c => temasSet.has(parseInt(c.Tema)));
        }
        if (f.rango && f.rangoVal) {
            const idxSet = _parsearListaNumeros(f.rangoVal);
            if (idxSet.size > 0) {
                filtrados = filtrados.filter(c => idxSet.has(c.IndiceGlobal !== undefined ? c.IndiceGlobal : 0));
            } else {
                const m = f.rangoVal.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
                if (m) {
                    const desde = parseInt(m[1]), hasta = parseInt(m[2]);
                    filtrados = filtrados.filter(c => {
                        const idx = c.IndiceGlobal !== undefined ? c.IndiceGlobal : 0;
                        return idx >= desde && idx <= hasta;
                    });
                }
            }
        }
        if (f.tipo && Array.isArray(f.tiposSeleccionados) && f.tiposSeleccionados.length > 0) {
            filtrados = filtrados.filter(c => f.tiposSeleccionados.some(t => (c.Apartado || '').toLowerCase().startsWith(t)));
        }
        if (f.dificultad && Array.isArray(f.difsActivas) && f.difsActivas.length > 0) {
            const REGLAS_DIFICULTAD = {
                '1': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) <= 4.0,
                '2': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) >  4.0 && (c.fsrs_difficulty || 5) <= 7.0,
                '3': c => c.fsrs_state === 'review' && (c.fsrs_difficulty || 5) >  7.0,
                '4': c => c.fsrs_state === 'learning',
            };
            filtrados = filtrados.filter(c => f.difsActivas.some(d => REGLAS_DIFICULTAD[d] && REGLAS_DIFICULTAD[d](c)));
        }

        // 2. Lógica de Ordenación y Barajado
        const isSecuencial = State.get('modoSecuencial');
        if (isSecuencial) {
            filtrados.sort((a, b) => {
                const valA = a.ProximoRepaso ? window.fechaValor(a.ProximoRepaso) : 0;
                const valB = b.ProximoRepaso ? window.fechaValor(b.ProximoRepaso) : 0;
                return valA - valB;
            });
        } else {
            for (let i = filtrados.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [filtrados[i], filtrados[j]] = [filtrados[j], filtrados[i]];
            }
        }

        // 3. Notificación a la Interfaz de Usuario
        const nFiltros = [f.hoy, f.nuevas, f.tema, f.rango, f.tipo, f.dificultad].filter(Boolean).length;
        if (typeof UI !== 'undefined') {
            if (UI.renderEstadoFiltros) UI.renderEstadoFiltros(nFiltros, filtrados.length);
            if (UI.renderControlesModoEstudio) UI.renderControlesModoEstudio(isSecuencial);
        }

        // 4. Inyección Atómica en el Estado (Batch)
        State.batch(() => {
            State.set('colaEstudio', filtrados);
            State.set('indiceNavegacion', 0);
            if (filtrados.length > 0) {
                State.set('conceptoActual', structuredClone(filtrados[0]));
            } else {
                State.set('conceptoActual', null);
            }
        });

        if (filtrados.length === 0 && typeof UI !== 'undefined' && UI.renderTarjetaVacia) {
            UI.renderTarjetaVacia();
        }
    }

    function siguienteTarjeta() {
        const cola = State.get('colaEstudio') || [];
        if (cola.length === 0) return;
        
        let idx = State.get('indiceNavegacion');
        idx = (idx + 1) % cola.length;

        State.batch(() => {
            State.set('indiceNavegacion', idx);
            State.set('conceptoActual', structuredClone(cola[idx]));
        });
    }

    function anteriorTarjeta() {
        const cola = State.get('colaEstudio') || [];
        if (cola.length <= 1) return;

        let idx = State.get('indiceNavegacion');
        idx = (idx - 1 + cola.length) % cola.length;

        State.batch(() => {
            State.set('indiceNavegacion', idx);
            State.set('conceptoActual', structuredClone(cola[idx]));
        });
    }

    /**
     * @function procesarRepaso
     * @description Evalúa la tarjeta actual usando el algoritmo FSRS (Scheduler),
     * actualiza la biblioteca, los datos de la sesión y extrae la tarjeta de la cola activa.
     * @param {number} calidad - Calificación dada por el usuario (1: Fácil, 2: Bien, 3: Difícil, 4: Crítica).
     * @returns {void}
     */
    function procesarRepaso(calidad) {
        const concepto = State.get('conceptoActual');
        const asigActual = State.get('nombreAsignaturaActual');
        if (!concepto || !asigActual) return;
        if (typeof Scheduler === 'undefined') {
            Logger.error("Error Crítico: Scheduler no definido.");
            return;
        }

        const result = Scheduler.calcularSiguienteRepaso(concepto, calidad);
        const tarjetaActualizada = result.tarjeta;

        const biblioteca = State.get('biblioteca');
        const idxOriginal = biblioteca[asigActual].findIndex(c => c.id === concepto.id || (c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido));

        if (idxOriginal !== -1) {
            State.batch(() => {
                // Actualizar DB en memoria
                biblioteca[asigActual][idxOriginal] = tarjetaActualizada;
                State.set('biblioteca', biblioteca);

                // Stats de Sesión
                const stats = State.get('sessionData') || {};
                stats.tarjetas = (stats.tarjetas || 0) + 1;
                if (calidad === 1) stats.faciles = (stats.faciles || 0) + 1;
                if (calidad === 4) stats.criticas = (stats.criticas || 0) + 1;
                State.set('sessionData', stats);

                // EXTRACCIÓN de la tarjeta de la cola viva
                let cola = State.get('colaEstudio') || [];
                const currentIdx = State.get('indiceNavegacion');
                cola.splice(currentIdx, 1);
                State.set('colaEstudio', cola);

                // Mover puntero automáticamente sin avanzar el índice
                if (cola.length === 0) {
                    State.set('indiceNavegacion', 0);
                    State.set('conceptoActual', null);
                } else {
                    const nextIdx = currentIdx % cola.length; // Si borramos la última, salta a la 0
                    State.set('indiceNavegacion', nextIdx);
                    State.set('conceptoActual', structuredClone(cola[nextIdx]));
                }
            });

            EventBus.emit('DATA_REQUIRES_SAVE');
            if (typeof window.updateDashboard === 'function') window.updateDashboard();
            if (State.get('colaEstudio').length === 0 && typeof UI !== 'undefined' && UI.renderTarjetaVacia) {
                UI.renderTarjetaVacia();
            }
        }
    }

    function toggleModoSecuencial(isSeq) {
        State.set('modoSecuencial', !!isSeq);
        aplicarFiltros();
    }

    function toggleModoLectura(isLec) {
        State.set('modoLectura', !!isLec);
    }

    return {
        aplicarFiltros,
        anteriorTarjeta,
        siguienteTarjeta,
        procesarRepaso,
        toggleModoSecuencial,
        toggleModoLectura
    };
})();

// ════════════════════════════════════════════════════════════════
// Proxies de compatibilidad DOM (Capa de Controlador)
// ════════════════════════════════════════════════════════════════
window.aplicarFiltros = (isManual = true) => StudyEngine.aplicarFiltros(isManual);
window.anteriorTarjeta = () => StudyEngine.anteriorTarjeta();
window.siguienteTarjeta = () => StudyEngine.siguienteTarjeta();
window.procesarRepaso = (c) => StudyEngine.procesarRepaso(c);

window.toggleModoSecuencial = (event) => {
    // Lee el estado directamente del evento, o usa el DOM como fallback estricto
    const isSeq = (event && event.target) ? event.target.checked : !!document.getElementById('check-secuencial')?.checked;
    StudyEngine.toggleModoSecuencial(isSeq);
};

window.toggleModoLectura = (event) => {
    const isLec = (event && event.target) ? event.target.checked : !!document.getElementById('check-lectura')?.checked;
    StudyEngine.toggleModoLectura(isLec);
    
    // El controlador orquesta la interfaz si se activa la lectura
    if (isLec && typeof UI !== 'undefined' && UI.revelar) {
        UI.revelar();
    }
};