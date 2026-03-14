// ════════════════════════════════════════════════════════════════
// STUDY-ENGINE.JS — Motor de Estudio y Gestión de Cola
// Encapsula el filtrado, la navegación (anterior/siguiente)
// y el procesamiento de la lógica SRS (FSRS).
// ════════════════════════════════════════════════════════════════


const StudyEngine = (() => {

    /** 
     * La comunicación  es vía EventBus y State Reactor.
     */

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

    /**
     * Sanea el filtrado. No toca clases CSS. 
     * El cambio en 'colaEstudio' disparará el Reactor de UI.
     */
    function aplicarFiltros() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) return;
        
        const biblioteca = State.get('biblioteca');
        const todos = biblioteca[asigActual] || [];
        let filtrados = [...todos];

        const soloNuevas = document.getElementById('check-filtro-nuevas')?.checked;
        if (soloNuevas) filtrados = filtrados.filter(c => !c.UltimoRepaso);

        const filtroTema = document.getElementById('check-filtro-tema')?.checked;
        if (filtroTema) {
            const val = document.getElementById('filtro-tema-val')?.value;
            const temasPermitidos = _parsearListaNumeros(val);
            if (temasPermitidos.size > 0) filtrados = filtrados.filter(c => temasPermitidos.has(c.Tema));
        }

        const filtroRango = document.getElementById('check-filtro-rango')?.checked;
        if (filtroRango) {
            const val = document.getElementById('filtro-rango-val')?.value;
            const rangoPermitido = _parsearListaNumeros(val);
            if (rangoPermitido.size > 0) filtrados = filtrados.filter((_, i) => rangoPermitido.has(i + 1));
        }

        State.batch(() => {
            if (State.get('modoSecuencial')) {
                filtrados.sort((a, b) => window.fechaValor(a.ProximoRepaso) - window.fechaValor(b.ProximoRepaso));
                State.set('indiceNavegacion', 0); // Fijo al inicio si es secuencial
            } else {
                // Aleatoriedad pura si no es secuencial
                const randomIdx = filtrados.length > 0 ? Math.floor(Math.random() * filtrados.length) : 0;
                State.set('indiceNavegacion', randomIdx);
            }
            State.set('colaEstudio', filtrados);
        });

        EventBus.emit('DATA_REQUIRES_SAVE');
        siguienteTarjeta(false); 
    }

    function siguienteTarjeta(incrementar = true) {
        const cola = State.get('colaEstudio') || [];
        if (cola.length === 0) {
            State.set('conceptoActual', null);
            return;
        }

        let idx = State.get('indiceNavegacion');
        if (incrementar) {
            idx = State.get('modoSecuencial') ? (idx + 1) % cola.length : Math.floor(Math.random() * cola.length);
        }

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
     * Procesamiento FSRS con Batching.
     */
    function procesarRepaso(calidad) {
        const concepto = State.get('conceptoActual');
        const asigActual = State.get('nombreAsignaturaActual');
        if (!concepto || !asigActual) return;

        // 1. Cálculo matemático (Dominio Puro)
        const result = Domain.calcularSiguienteRepaso(concepto, calidad);
        const tarjetaActualizada = result.tarjeta;

        // 2. Actualización de persistencia en State
        const biblioteca = State.get('biblioteca');
        const idxOriginal = biblioteca[asigActual].findIndex(c => c.id === concepto.id || (c.Titulo === concepto.Titulo && c.Contenido === concepto.Contenido));

        if (idxOriginal !== -1) {
            State.batch(() => {
                // Actualizar biblioteca global
                biblioteca[asigActual][idxOriginal] = tarjetaActualizada;
                State.set('biblioteca', biblioteca);

                // Actualizar estadísticas de sesión
                const stats = State.get('sessionData') || {};
                stats.tarjetas = (stats.tarjetas || 0) + 1;
                if (calidad === 1) stats.faciles = (stats.faciles || 0) + 1;
                if (calidad === 4) stats.criticas = (stats.criticas || 0) + 1;
                State.set('sessionData', stats);
            });

            // 3. Persistencia y siguiente paso
            EventBus.emit('DATA_REQUIRES_SAVE');
            siguienteTarjeta(true);
        }
    }

    function toggleModoSecuencial() {
        const isSeq = document.getElementById('check-secuencial')?.checked || false;
        State.set('modoSecuencial', isSeq);
        aplicarFiltros();
    }

    function toggleModoLectura() {
        const isLec = document.getElementById('check-lectura')?.checked || false;
        State.set('modoLectura', isLec);
        /** * ELIMINADO: UI.revelar(). 
         * El Reactor en app.js debe escuchar 'modoLectura' y llamar a UI.revelar().
         */
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

// Proxies de compatibilidad DOM
window.aplicarFiltros = () => StudyEngine.aplicarFiltros();
window.anteriorTarjeta = () => StudyEngine.anteriorTarjeta();
window.siguienteTarjeta = (b) => StudyEngine.siguienteTarjeta(b);
window.procesarRepaso = (c) => StudyEngine.procesarRepaso(c);
window.toggleModoSecuencial = () => StudyEngine.toggleModoSecuencial();
window.toggleModoLectura = () => StudyEngine.toggleModoLectura();