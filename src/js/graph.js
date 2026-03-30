// ════════════════════════════════════════════════════════════════
// GRAPH.JS — Controlador del Mapa Conceptual Relacional
// Responsabilidad: lógica pura, mutación de State, EventBus.
// ════════════════════════════════════════════════════════════════

const Graph = (() => {

    function _asig() { return State.get('nombreAsignaturaActual'); }

    function _getData(asig) {
        const gd = State.get('graphData') || {};
        if (!gd[asig]) gd[asig] = { nodes: [], edges: [] };
        return gd[asig];
    }

    // CORRECCIÓN: Recibe asig explícitamente para evitar race conditions
    function _cardId(card, asigName) {
        return card.id || `${asigName}_${card.Titulo?.substring(0, 24)}_${card.IndiceGlobal ?? card._idx ?? 0}`;
    }

    function _persist() {
        EventBus.emit('DATA_REQUIRES_SAVE');
    }

    function _enrich(data, asig) {
        const cards = (State.get('biblioteca') || {})[asig] || [];
        const cardMap = {};
        // Pasamos asig al generador de IDs
        cards.forEach(c => { cardMap[_cardId(c, asig)] = c; });

        const nodes = data.nodes
            .map(n => ({ ...n, card: cardMap[n.id] }))
            .filter(n => n.card);                   

        return { nodes, edges: data.edges };
    }

    // ── API pública ───────────────────────────────────────────────

    function abrir() {
        const asig = _asig();
        if (!asig) { Toast.show('Selecciona una asignatura primero', 'warning'); return; }

        const data    = _getData(asig);
        const tiposConfig = State.get('tiposTarjeta') || {};
        const enriched = _enrich(data, asig);

        // CORRECCIÓN: Llamada directa a UIGraph con camelCase
        UIGraph.abrirMapa(asig, enriched.nodes, enriched.edges, tiposConfig, {
            onSearch:         (q, filter)  => buscarTarjetas(q, filter),
            onAddNode:        (cardId)     => addNode(cardId),
            onRemoveNode:     (cardId)     => removeNode(cardId),
            onAddEdge:        (src, tgt, lbl) => addEdge(src, tgt, lbl),
            onRemoveEdge:     (edgeId)     => removeEdge(edgeId),
            onPositionChange: (id, x, y)   => updatePosition(id, x, y),
            onNodeClick:      (id)         => abrirTarjetaReal(id),
            onRateCard:       (id, rating) => calificarTarjetaDesdeMapa(id, rating),
            onAddDefis:       (tema, limite) => addTodasDefiniciones(tema, limite)
        });
    }

    function addTodasDefiniciones(tema, limite) {
        const asig = _asig();
        const cards = (State.get('biblioteca') || {})[asig] || [];
        const gd = { ...(State.get('graphData') || {}) };
        if (!gd[asig]) gd[asig] = { nodes: [], edges: [] };

        let defis = cards.filter(c => c.Apartado === 'Definición');
        
        if (tema !== null && !isNaN(tema)) {
            defis = defis.filter(c => parseInt(c.Tema) === tema);
        }
        if (limite !== null && !isNaN(limite)) {
            defis = defis.slice(0, limite);
        }

        let añadidas = 0;
        defis.forEach(d => {
            const dId = _cardId(d, asig); // Pasamos asig
            if (!gd[asig].nodes.find(n => n.id === dId)) {
                gd[asig].nodes.push({ id: dId, x: (Math.random() - 0.5) * 800, y: (Math.random() - 0.5) * 600 });
                añadidas++;
            }
        });

        if (añadidas > 0) {
            State.set('graphData', gd);
            _persist();
            _refresh(asig);
            if (typeof Toast !== 'undefined') Toast.show(`${añadidas} definiciones añadidas.`, 'success');
        } else {
            if (typeof Toast !== 'undefined') Toast.show('No hay definiciones nuevas para este filtro.', 'info');
        }
    }

    function addNode(cardId) {
        const asig = _asig();
        const gd   = { ...(State.get('graphData') || {}) };
        if (!gd[asig]) gd[asig] = { nodes: [], edges: [] };

        if (gd[asig].nodes.find(n => n.id === cardId)) return;

        const baseX = (Math.random() - 0.5) * 600;
        const baseY = (Math.random() - 0.5) * 400;

        gd[asig].nodes.push({ id: cardId, x: baseX, y: baseY });

        const cards = (State.get('biblioteca') || {})[asig] || [];
        const mainCard = cards.find(c => _cardId(c, asig) === cardId);

        if (mainCard && ['Teorema', 'Proposición', 'Lema', 'Corolario'].includes(mainCard.Apartado)) {
            const tituloMain = mainCard.Titulo || '';
            const demoPrefix = `Demostración: ${tituloMain}`;
            
            const demos = cards.filter(c => 
                c.Apartado?.startsWith('Demo') && 
                c.Titulo?.includes(demoPrefix)
            ).sort((a, b) => (a.Titulo || '').localeCompare(b.Titulo || ''));

            let lastSourceId = cardId;
            let offsetY = 120;
            
            demos.forEach((demo, index) => {
                const demoId = _cardId(demo, asig); // Pasamos asig
                if (!gd[asig].nodes.find(n => n.id === demoId)) {
                    gd[asig].nodes.push({ id: demoId, x: baseX, y: baseY + offsetY });
                    gd[asig].edges.push({
                        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        source: lastSourceId, target: demoId, 
                        label: index === 0 ? 'demuestra' : 'continúa'
                    });
                    lastSourceId = demoId; 
                    offsetY += 100;
                }
            });
        }

        State.set('graphData', gd);
        _persist();
        _refresh(asig);
    }

    function buscarTarjetas(query, tipoFilter = '') {
        const asig  = _asig();
        const cards = (State.get('biblioteca') || {})[asig] || [];
        const q     = query.toLowerCase().trim();
        
        return cards
            .filter(c => {
                if (tipoFilter && c.Apartado !== tipoFilter) return false;
                if (!q) return true; 
                return c.Titulo?.toLowerCase().includes(q);
            })
            .slice(0, 60)
            .map(c => ({ id: _cardId(c, asig), titulo: c.Titulo, tipo: c.Apartado })); // Pasamos asig
    }

    // ── Integración con la App ─────────────────────────────────────
    
    function abrirTarjetaReal(cardId) {
        const asig = _asig();
        const cards = (State.get('biblioteca') || {})[asig] || [];
        const card = cards.find(c => _cardId(c, asig) === cardId);
        
        if (!card) return;

        // CORRECCIÓN: Llamada directa a UIGraph
        UIGraph.mostrarPreview(card, cardId);
    }

    // CORRECCIÓN CRÍTICA: Lógica de Dominio Pura (Scheduler)
    function calificarTarjetaDesdeMapa(cardId, uiRating) {
        const asig = _asig();
        const biblioteca = State.get('biblioteca') || {};
        const cards = biblioteca[asig] || [];
        const idx = cards.findIndex(c => _cardId(c, asig) === cardId);
        
        if (idx === -1) return;

        const card = cards[idx];

        // Delegación absoluta al motor del Scheduler nativo
        if (typeof Scheduler !== 'undefined' && typeof Scheduler.calcularSiguienteRepaso === 'function') {
            const result = Scheduler.calcularSiguienteRepaso(card, uiRating);
            // Reemplazamos la tarjeta en el array de la biblioteca (depende de si devuelve .tarjeta o el objeto directo)
            cards[idx] = result.tarjeta || result; 
        } else {
            Logger.warn("Scheduler no encontrado. Fallback ejecutado.");
            cards[idx].Repasos = (cards[idx].Repasos || 0) + 1;
        }

        // Transacción de estado (Al haber mutado cards[idx], State lo reconocerá por referencia)
        State.set('biblioteca', biblioteca);
        EventBus.emit('DATA_REQUIRES_SAVE');

        // Notificación a la capa de UI Principal
        if (typeof StudyEngine !== 'undefined' && typeof StudyEngine.aplicarFiltros === 'function') {
            StudyEngine.aplicarFiltros(false); 
        }
        if (typeof window.updateDashboard === 'function') {
            window.updateDashboard();
        }
        if (typeof Toast !== 'undefined') {
            const uiLabelMap = { 1: 'Fácil', 2: 'Bien', 3: 'Difícil', 4: 'Otra vez' };
            Toast.show(`Tarjeta repasada (${uiLabelMap[uiRating]})`, 'success');
        }
    }

    function removeNode(cardId) {
        const asig = _asig();
        const gd   = { ...(State.get('graphData') || {}) };
        if (!gd[asig]) return;

        gd[asig].nodes = gd[asig].nodes.filter(n => n.id !== cardId);
        gd[asig].edges = gd[asig].edges.filter(e => e.source !== cardId && e.target !== cardId);

        State.set('graphData', gd);
        _persist();
        _refresh(asig);
    }

    function addEdge(source, target, label = '') {
        const asig = _asig();
        const gd   = { ...(State.get('graphData') || {}) };
        if (!gd[asig]) return;

        if (gd[asig].edges.find(e => e.source === source && e.target === target)) return;

        gd[asig].edges.push({
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            source, target, label,
        });

        State.set('graphData', gd);
        _persist();
        _refresh(asig);
    }

    function removeEdge(edgeId) {
        const asig = _asig();
        const gd   = { ...(State.get('graphData') || {}) };
        if (!gd[asig]) return;

        gd[asig].edges = gd[asig].edges.filter(e => e.id !== edgeId);

        State.set('graphData', gd);
        _persist();
        _refresh(asig);
    }

    function updatePosition(cardId, x, y) {
        const asig = _asig();
        const gd   = State.get('graphData') || {};
        const node = (gd[asig]?.nodes || []).find(n => n.id === cardId);
        if (node) { node.x = x; node.y = y; }
        State.set('graphData', gd);
        _persist();                         
    }

    function _refresh(asig) {
        const data     = _getData(asig);
        const enriched = _enrich(data, asig);
        const tiposConfig = State.get('tiposTarjeta') || {};
        // CORRECCIÓN: camelCase
        UIGraph.refreshMapa(enriched.nodes, enriched.edges, tiposConfig);
    }

    // CORRECCIÓN: Exportación completa de métodos internos útiles para tests o extensiones futuras
    return { 
        abrir, 
        buscarTarjetas, 
        addNode, 
        removeNode, 
        addEdge, 
        removeEdge, 
        updatePosition,
        abrirTarjetaReal,
        calificarTarjetaDesdeMapa,
        addTodasDefiniciones
    };
})();

// ── Proxies globales ──────────────────────────────────────────────
window.abrirMapaConceptual = () => Graph.abrir();