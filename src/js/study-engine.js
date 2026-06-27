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

        const modoEstudio = State.get('modoEstudio') || 'aleatorio';

        // 1. INTERCEPCIÓN PRIORITARIA: Modo Máxima Utilidad (Monte Carlo)
        if (modoEstudio === 'montecarlo') {
            const resultadosMC = State.get('resultadosMonteCarlo') || {};
            const res = resultadosMC[asigActual];
            
            if (res && res.tarjetasCriticas && res.tarjetasCriticas.length > 0) {
                const idsCriticos = res.tarjetasCriticas.map(t => t.id);
                filtrados = todos.filter(t => idsCriticos.includes(t.id));
                
                // Ordenar estrictamente por impacto estocástico (mayor a menor)
                filtrados.sort((a, b) => {
                    const critA = res.tarjetasCriticas.find(c => c.id === a.id)?.deltaNota || 0;
                    const critB = res.tarjetasCriticas.find(c => c.id === b.id)?.deltaNota || 0;
                    return critB - critA;
                });
            } else {
                filtrados = []; // Cola vacía si no hay simulaciones o conceptos críticos
            }
        } 
        // 2. FILTRADO ESTÁNDAR
        else {
            const rawFiltros = (typeof UI !== 'undefined' && UI.getEstadoFiltros) ? UI.getEstadoFiltros() : null;
            const f = rawFiltros || { 
                hoy: false, nuevas: false, tema: false, rango: false, tipo: false, dificultad: false,
                tiposSeleccionados: [], difsActivas: []
            };

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

            // Lógica de Ordenación
            const isSecuencial = State.get('modoSecuencial');
            if (modoEstudio === 'secuencial_retraso') {
                filtrados.sort((a, b) => {
                    const valA = a.ProximoRepaso ? window.fechaValor(a.ProximoRepaso) : 0;
                    const valB = b.ProximoRepaso ? window.fechaValor(b.ProximoRepaso) : 0;
                    return valA - valB; 
                });
            } else if (modoEstudio === 'secuencial_puro' || modoEstudio === 'lectura') {
                // Orden natural
            } else {
                for (let i = filtrados.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [filtrados[i], filtrados[j]] = [filtrados[j], filtrados[i]];
                }
            }
        }

        // 3. Notificación a UI e Inyección de Estado
        const isSecuencialGlobal = modoEstudio === 'montecarlo' ? true : State.get('modoSecuencial');
        const nFiltros = modoEstudio === 'montecarlo' ? 1 : 0; // Falsa bandera para forzar UI activa

        if (typeof UI !== 'undefined') {
            if (UI.renderEstadoFiltros) UI.renderEstadoFiltros(nFiltros, filtrados.length, isSecuencialGlobal);
            if (UI.renderControlesModoEstudio) UI.renderControlesModoEstudio(isSecuencialGlobal);
        }

        State.batch(() => {
            State.set('colaEstudio', filtrados);
            State.set('indiceNavegacion', 0);
            State.set('conceptoActual', filtrados.length > 0 ? structuredClone(filtrados[0]) : null);
        });

        if (filtrados.length === 0 && typeof UI !== 'undefined' && UI.renderTarjetaVacia) {
            UI.renderTarjetaVacia();
        }
    }
    function setModoEstudio(modo) {
        State.set('modoEstudio', modo);
        State.set('modoLectura', modo === 'lectura');
        State.set('modoSecuencial', modo !== 'aleatorio' && modo !== 'anki');

        aplicarFiltros();

        if (modo === 'lectura' && typeof UI !== 'undefined' && UI.revelar) UI.revelar();
        if (typeof UI !== 'undefined' && UI.renderBotonesDificultad) UI.renderBotonesDificultad(modo);
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

    function _siguienteIndiceAnkiDisponible(cola, idxActual) {
        const ahora = Date.now();
        const n = cola.length;
        if (n === 0) return -1;
        for (let i = 1; i <= n; i++) {
            const idx = (idxActual + i) % n;
            const due = cola[idx]._ankiDueAt;
            if (!due || due <= ahora) return idx;
        }
        // Ninguna lista todavía: mostramos la más próxima en lugar de bloquear
        let mejor = (idxActual + 1) % n;
        cola.forEach((c, idx) => {
            if (idx === idxActual) return;
            if ((c._ankiDueAt || 0) < (cola[mejor]._ankiDueAt || 0)) mejor = idx;
        });
        return mejor;
    }

    function procesarRepasoAnki(calidad, concepto, asigActual) {
        const result = Scheduler.calcularSiguienteRepasoAnki(concepto, calidad);
        const tarjetaActualizada = result.tarjeta;

        const biblioteca = State.get('biblioteca');
        const idxOriginal = biblioteca[asigActual].findIndex(
            c => c.id === concepto.id || (c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido)
        );
        if (idxOriginal === -1) return;

        State.batch(() => {
            biblioteca[asigActual][idxOriginal] = tarjetaActualizada;
            State.set('biblioteca', biblioteca);

            const stats = State.get('sessionData') || {};
            stats.tarjetas = (stats.tarjetas || 0) + 1;
            if (calidad === 1) stats.faciles  = (stats.faciles  || 0) + 1;
            if (calidad === 4) stats.criticas = (stats.criticas || 0) + 1;
            State.set('sessionData', stats);

            let cola = State.get('colaEstudio') || [];
            const currentIdx = State.get('indiceNavegacion');

            if (result.graduado) {
                cola.splice(currentIdx, 1);
                State.set('colaEstudio', cola);
                if (cola.length === 0) {
                    State.set('indiceNavegacion', 0);
                    State.set('conceptoActual', null);
                } else {
                    const nextIdx = currentIdx % cola.length;
                    State.set('indiceNavegacion', nextIdx);
                    State.set('conceptoActual', structuredClone(cola[nextIdx]));
                }
            } else {
                cola[currentIdx] = tarjetaActualizada;
                State.set('colaEstudio', cola);
                const nextIdx = _siguienteIndiceAnkiDisponible(cola, currentIdx);
                State.set('indiceNavegacion', nextIdx);
                State.set('conceptoActual', nextIdx === -1 ? null : structuredClone(cola[nextIdx]));
            }
        });

        EventBus.emit('DATA_REQUIRES_SAVE');
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (State.get('colaEstudio').length === 0 && typeof UI !== 'undefined' && UI.renderTarjetaVacia) {
            UI.renderTarjetaVacia();
        }
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

        if (State.get('modoEstudio') === 'anki') {
            procesarRepasoAnki(calidad, concepto, asigActual);
            return;
        }

        if (typeof Scheduler === 'undefined') {
            Logger.error("Error Crítico: Scheduler no definido.");
            return;
        }

        const result = Scheduler.calcularSiguienteRepaso(concepto, calidad);
        const tarjetaActualizada = result.tarjeta;
        
        if (typeof DB !== 'undefined' && typeof DB.addRevlog === 'function') {
            DB.addRevlog({
                cardId: concepto.id,
                reviewTime: Date.now(),
                // Si la tarjeta es nueva y no tiene UltimoRepaso, usamos Date.now() como punto 0
                lastReviewTime: concepto.UltimoRepaso ? new Date(concepto.UltimoRepaso).getTime() : Date.now(),
                grade: calidad,
                stability: tarjetaActualizada.fsrs_stability || 0.1 
            }).catch(e => console.error("Error guardando log FSRS:", e));
        }

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

                // EXTRACCIÓN O REENCOLADO (Corrección FSRS)
                let cola = State.get('colaEstudio') || [];
                const currentIdx = State.get('indiceNavegacion');
                
                if (calidad === 4) {
                    // REENCOLAR: Extrae y la envía al final de la cola activa
                    const tarjetaFallada = cola.splice(currentIdx, 1)[0];
                    cola.push(tarjetaFallada);
                    State.set('colaEstudio', cola);
                    
                    // El puntero se mantiene (apuntando al nuevo elemento en esa posición)
                    const nextIdx = currentIdx % cola.length;
                    State.set('indiceNavegacion', nextIdx);
                    State.set('conceptoActual', structuredClone(cola[nextIdx]));
                } else {
                    // EXTRACCIÓN NORMAL (Éxito)
                    cola.splice(currentIdx, 1);
                    State.set('colaEstudio', cola);
                    
                    if (cola.length === 0) {
                        State.set('indiceNavegacion', 0);
                        State.set('conceptoActual', null);
                    } else {
                        const nextIdx = currentIdx % cola.length; 
                        State.set('indiceNavegacion', nextIdx);
                        State.set('conceptoActual', structuredClone(cola[nextIdx]));
                    }
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
        toggleModoLectura,
        setModoEstudio
    };
})();

// ════════════════════════════════════════════════════════════════
// Proxies de compatibilidad DOM (Capa de Controlador)
// ════════════════════════════════════════════════════════════════
window.aplicarFiltros = (isManual = true) => StudyEngine.aplicarFiltros(isManual);
window.anteriorTarjeta = () => StudyEngine.anteriorTarjeta();
window.siguienteTarjeta = () => StudyEngine.siguienteTarjeta();
window.procesarRepaso = (c) => StudyEngine.procesarRepaso(c);
window.setModoEstudio = (modo) => StudyEngine.setModoEstudio(modo);

window.toggleModoSecuencial = (eventOrBool) => {
    let isSeq;
    if (typeof eventOrBool === 'boolean') {
        isSeq = eventOrBool;
    } else if (eventOrBool && eventOrBool.target) {
        isSeq = eventOrBool.target.checked;
    } else {
        const checkbox = document.getElementById('check-secuencial');
        isSeq = checkbox ? checkbox.checked : false;
    }
    StudyEngine.toggleModoSecuencial(isSeq);
};

window.toggleModoLectura = (eventOrBool) => {
    let isLec;
    if (typeof eventOrBool === 'boolean') {
        isLec = eventOrBool;
    } else if (eventOrBool && eventOrBool.target) {
        isLec = eventOrBool.target.checked;
    } else {
        const checkbox = document.getElementById('check-lectura');
        isLec = checkbox ? checkbox.checked : false;
    }
    StudyEngine.toggleModoLectura(isLec);
    
    // El controlador orquesta la interfaz si se activa la lectura
    if (isLec && typeof UI !== 'undefined' && UI.revelar) {
        UI.revelar();
    }
};
