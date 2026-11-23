// GRAPH.JS — Estado, mapas guardados, relaciones y algoritmos del grafo.
// Compatible con graphData[asignatura].nodes/edges de versiones anteriores.
const Graph = (() => {
    const _asig = () => State.get('nombreAsignaturaActual');
    const _allCards = (asig = _asig()) => (State.get('biblioteca') || {})[asig] || [];
    const _clone = v => JSON.parse(JSON.stringify(v));
    const _id = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID() : `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    function _cardId(card, asigName) {
        if (card.id != null) return String(card.id);
        const titulo = card.Titulo || 'Sin_Titulo';
        const tipo = card.Apartado || 'Nodo';
        const idx = card.IndiceGlobal ?? card._idx ?? 0;
        let hash = 0;
        for (let i = 0; i < titulo.length; i++) hash = Math.imul(31, hash) + titulo.charCodeAt(i) | 0;
        return `${asigName}_${tipo}_${titulo.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}_${Math.abs(hash)}_${idx}`;
    }

    function _ensure(gd, asig) {
        if (!gd[asig] || typeof gd[asig] !== 'object') gd[asig] = { nodes: [], edges: [] };
        const data = gd[asig];
        if (!Array.isArray(data.nodes)) data.nodes = [];
        if (!Array.isArray(data.edges)) data.edges = [];
        if (!Array.isArray(data.maps)) data.maps = [];
        if (!data.islandNames || typeof data.islandNames !== 'object') data.islandNames = {};
        if (!data.activeMapId) data.activeMapId = 'main';
        if (!data.activeMapName) data.activeMapName = 'Mapa principal';
        return data;
    }
    function _read(asig = _asig()) { return _ensure(State.get('graphData') || {}, asig); }
    function _enrich(data, asig) {
        const cardMap = new Map(_allCards(asig).map(c => [_cardId(c, asig), c]));
        const nodes = data.nodes.filter(n => cardMap.has(String(n.id)))
            .map(n => ({ ...n, card: cardMap.get(String(n.id)) }));
        const validIds = new Set(nodes.map(n => String(n.id)));
        const edges = data.edges.filter(e => validIds.has(String(e.source)) && validIds.has(String(e.target)));
        return { nodes, edges };
    }
    function _refresh(asig = _asig()) {
        if (typeof UIGraph === 'undefined') return;
        const data = _read(asig);
        const enriched = _enrich(data, asig);
        UIGraph.refreshMapa(enriched.nodes, enriched.edges, State.get('tiposTarjeta') || {});
    }
    function _edit(callback, refresh = true) {
        const asig = _asig();
        if (!asig) return null;
        const gd = { ...(State.get('graphData') || {}) };
        const data = _clone(_ensure(gd, asig));
        const result = callback(data, asig);
        if (result === false) return false;
        gd[asig] = data;
        State.set('graphData', gd);
        EventBus.emit('DATA_REQUIRES_SAVE');
        if (refresh) _refresh(asig);
        return result === undefined ? true : result;
    }
    const _contains = (data, id) => data.nodes.some(n => String(n.id) === String(id));

    function _positionNew(data, previousIds) {
        const added=data.nodes.filter(n=>!previousIds.has(String(n.id)));
        if (!added.length) return 0;
        const existing=data.nodes.filter(n=>previousIds.has(String(n.id)));
        const positions=GraphLayout.newBatch(existing,added);
        data.nodes.forEach(n=>{n.latestBatch=false; if(positions[String(n.id)]) {
            n.x=positions[String(n.id)].x; n.y=positions[String(n.id)].y;
            n.latestBatch=true;
        }});
        return added.length;
    }
    function _insertNode(data, cardId, asig) {
        if (_contains(data, cardId)) return false;
        if (!_allCards(asig).some(c => _cardId(c, asig) === String(cardId))) return false;
        data.nodes.push({ id: String(cardId), x: 0, y: 0 });
        return true;
    }
    // Campos semánticos opcionales: no afectan a mapas antiguos ni a su disposición.
    const TIPOS_RELACION = new Set(['asociacion', 'implicacion', 'equivalencia', 'construccion', 'dependencia']);
    function _semantica(meta = {}) {
        const extra = {};
        if (TIPOS_RELACION.has(meta.tipo)) extra.tipo = meta.tipo;
        if (extra.tipo === 'equivalencia') extra.reversible = true;
        else if (typeof meta.reversible === 'boolean') extra.reversible = meta.reversible;
        if (meta.explicacion != null && String(meta.explicacion).trim())
            extra.explicacion = String(meta.explicacion).trim().slice(0, 3000);
        return extra;
    }
    function _insertEdge(data, src, tgt, label = '', origin = 'manual', reviewed = true, meta = {}) {
        src = String(src); tgt = String(tgt);
        if (src === tgt || !_contains(data, src) || !_contains(data, tgt)) return false;
        label = String(label ?? '').trim().slice(0, 180);
        const existing = data.edges.find(e => String(e.source) === src && String(e.target) === tgt && (e.label || '') === label);
        if (existing) return false;
        data.edges.push({ id: _id(), source: src, target: tgt, label, origin, reviewed, ..._semantica(meta) });
        return true;
    }
    function _attachDemonstrations(card, data, cards, asig) {
        if (!['Teorema', 'Proposición', 'Lema', 'Corolario'].includes(card.Apartado)) return;
        const prefix = `Demostración: ${card.Titulo || ''}`;
        const demos = cards.filter(c => c.Apartado?.startsWith('Demo') && c.Titulo?.includes(prefix));
        let prev = _cardId(card, asig);
        for (const [i, demo] of demos.entries()) {
            const id = _cardId(demo, asig);
            if (_insertNode(data, id, asig)) _insertEdge(data, prev, id, i === 0 ? 'demuestra' : 'continúa', 'auto', false);
            prev = id;
        }
    }

    function abrir() {
        const asig = _asig();
        if (!asig) { Toast.show('Selecciona una asignatura primero', 'warning'); return; }
        const data = _read(asig);
        const enriched = _enrich(data, asig);
        UIGraph.abrirMapa(asig, enriched.nodes, enriched.edges, State.get('tiposTarjeta') || {}, {
            onSearch: buscarTarjetas, onAddNode: addNode, onRemoveNode: removeNode,
            onAddEdge: addEdge, onEditEdge: editEdge, onRemoveEdge: removeEdge,
            onPositionChange: updatePosition, onNodeClick: abrirTarjetaReal,
            onRateCard: calificarTarjetaDesdeMapa, onAddMassive: addMassiveNodes,
            onExplore: explorar, onPath: camino, onGetMap: getCurrentMap,
            onListMaps: listarMapas, onCreateMap: crearMapa, onSelectMap: seleccionarMapa,
            onRenameMap: renombrarMapa, onDeleteMap: eliminarMapa,
            onExportText: exportarTexto, onImportText: importarTexto,
            onOrganize: organizar, onUndoLayout: deshacerOrganizacion,
            onGetIslandNames: getIslandNames, onRenameIsland: renombrarIsla
        });
    }
    function addNode(id) {
        return _edit((data, asig) => {
            const card = _allCards(asig).find(c => _cardId(c, asig) === String(id));
            if (!card || !_insertNode(data, id, asig)) return false;
            const before = new Set(data.nodes.map(n=>String(n.id)));
            // Incluimos la primera tarjeta en el lote sin mover los nodos existentes.
            before.delete(String(id));
            _attachDemonstrations(card, data, _allCards(asig), asig);
            _positionNew(data,before);
        });
    }
    function addMassiveNodes(tema, tipo = '') {
        const asig = _asig();
        const cards = _allCards(asig).filter(c =>
            (tema == null || Number(c.Tema) === Number(tema)) && (!tipo || c.Apartado === tipo));
        if (!cards.length) { Toast.show('No hay tarjetas para ese filtro', 'info'); return; }
        let count = 0;
        _edit(data => {
            const before=new Set(data.nodes.map(n=>String(n.id)));
            for (const card of cards) {
                if (_insertNode(data, _cardId(card, asig), asig)) {
                    count++;
                    if (!tipo) _attachDemonstrations(card, data, _allCards(asig), asig);
                }
            }
            if (!count) return false;
            _positionNew(data,before);
        });
        Toast.show(`${count} nodos nuevos`, 'success');
    }
    function removeNode(id) { return _edit(data => {
        if (!_contains(data, id)) return false;
        data.nodes = data.nodes.filter(n => String(n.id) !== String(id));
        data.edges = data.edges.filter(e => String(e.source) !== String(id) && String(e.target) !== String(id));
    }); }
    function addEdge(src, tgt, label = '') { return _edit(data => _insertEdge(data, src, tgt, label) || false); }
    function editEdge(id, change) { return _edit(data => {
        const e = data.edges.find(e => String(e.id) === String(id));
        if (!e) return false;
        if (change.label !== undefined) e.label = String(change.label).trim().slice(0, 180);
        if (change.reviewed !== undefined) e.reviewed = !!change.reviewed;
        if (change.tipo !== undefined) {
            if (TIPOS_RELACION.has(change.tipo)) e.tipo = change.tipo;
            else delete e.tipo;
        }
        if (change.reversible !== undefined) {
            if (typeof change.reversible === 'boolean') e.reversible = change.reversible;
            else delete e.reversible;
        }
        if (e.tipo === 'equivalencia') e.reversible = true; // equivalencia implica reciprocidad
        if (change.explicacion !== undefined) {
            const explanation = String(change.explicacion || '').trim().slice(0, 3000);
            if (explanation) e.explicacion = explanation;
            else delete e.explicacion;
        }
        if (change.source !== undefined && _contains(data, change.source)) e.source = String(change.source);
        if (change.target !== undefined && _contains(data, change.target)) e.target = String(change.target);
    }); }
    function removeEdge(id) { return _edit(data => {
        if (!data.edges.some(e => String(e.id) === String(id))) return false;
        data.edges = data.edges.filter(e => String(e.id) !== String(id));
    }); }
    function updatePosition(id, x, y) { return _edit(data => {
        const node = data.nodes.find(n => String(n.id) === String(id));
        if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        node.x = x; node.y = y;
    }, false); }
    function aplicarRelaciones(relations, origin = 'ia') {
        let added = 0;
        _edit((data, asig) => {
            const before=new Set(data.nodes.map(n=>String(n.id)));
            for (const r of relations) {
                if (!_insertNode(data, r.source, asig) && !_contains(data, r.source)) continue;
                if (!_insertNode(data, r.target, asig) && !_contains(data, r.target)) continue;
                if (_insertEdge(data, r.source, r.target, r.label, origin, origin !== 'ia')) added++;
            }
            if (!added) return false;
            _positionNew(data,before);
        });
        return added;
    }

    // Los nombres se anclan a un nodo estable: al cambiar la conectividad siguen
    // asociados al hilo que contenga ese nodo, sin crear grupos artificiales.
    function getIslandNames() { return _clone(_read().islandNames || {}); }
    function renombrarIsla(nodeIds, name) {
        const ids = new Set((nodeIds || []).map(String));
        if (!ids.size) return false;
        return _edit(data => {
            const names = data.islandNames || (data.islandNames = {});
            for (const id of ids) delete names[id];
            const title = String(name || '').trim().slice(0, 85);
            if (title) names[[...ids][0]] = title;
        });
    }
    function organizar(kind, requestedIds=null, options={}) {
        // Una distribución destructiva requiere selección explícita.
        const ids = new Set((requestedIds || []).map(String));
        if (!ids.size) return false;
        const saved = _read(), selected = saved.nodes.filter(n=>ids.has(String(n.id)));
        if (!selected.length) return false;
        const selectedEdges = saved.edges.filter(e=>ids.has(String(e.source))&&ids.has(String(e.target)));
        const focus = GraphLayout.center(selected);
        let positions;
        if(kind==='grid') positions=GraphLayout.grid(selected,{center:focus});
        else if(kind==='islands') positions=GraphLayout.islands(selected,selectedEdges,{center:focus,preserveInternal:true});
        else if(kind==='hierarchy') {
            const applicable=selectedEdges.some(e=>GraphLayout.orientedEdge(e,options.criterion||'dependencias'));
            if(!applicable) return false;
            positions=GraphLayout.hierarchy(selected,selectedEdges,{center:focus,criterion:options.criterion||'dependencias'});
        } else return false;
        const actuallyMoved=selected.filter(n=>positions[String(n.id)] &&
            (Math.abs(n.x-positions[String(n.id)].x)>0.01 || Math.abs(n.y-positions[String(n.id)].y)>0.01));
        if(!actuallyMoved.length) return false;
        return _edit(data=>{
            const history=Array.isArray(data.layoutUndo)?data.layoutUndo:[];
            history.push(selected.map(n=>({id:n.id,x:n.x,y:n.y})));
            data.layoutUndo=history.slice(-10);
            for(const n of data.nodes) if(positions[String(n.id)]) {
                n.x=positions[String(n.id)].x;n.y=positions[String(n.id)].y;
            }
        });
    }
    function deshacerOrganizacion() {
        return _edit(data=>{
            if(!data.layoutUndo?.length)return false;
            const prior=data.layoutUndo.pop();const p=new Map(prior.map(n=>[String(n.id),n]));
            for(const n of data.nodes)if(p.has(String(n.id))){n.x=p.get(String(n.id)).x;n.y=p.get(String(n.id)).y;}
        });
    }
    function buscarTarjetas(query = '', tipo = '', tema = '') {
        const q = String(query || '').toLocaleLowerCase().trim();
        return _allCards().filter(c => {
            if (tipo === 'Demo' ? !c.Apartado?.startsWith('Demo') : tipo && c.Apartado !== tipo) return false;
            if (tema && Number(c.Tema) !== Number(tema)) return false;
            return !q || String(c.Titulo || '').toLocaleLowerCase().includes(q);
        }).slice(0, 100).map(c => ({ id: _cardId(c, _asig()), titulo: c.Titulo, tipo: c.Apartado, tema: c.Tema }));
    }
    function abrirTarjetaReal(id) {
        const card = _allCards().find(c => _cardId(c, _asig()) === String(id));
        if (card) UIGraph.mostrarPreview(card, id);
    }
    function calificarTarjetaDesdeMapa(id, rating) {
        if (![1, 2, 3, 4].includes(Number(rating))) return;
        const asig = _asig(), biblioteca = { ...(State.get('biblioteca') || {}) };
        const cards = [...(biblioteca[asig] || [])];
        const idx = cards.findIndex(c => _cardId(c, asig) === String(id));
        if (idx < 0) return;
        if (typeof Scheduler !== 'undefined' && Scheduler.calcularSiguienteRepaso) {
            const result = Scheduler.calcularSiguienteRepaso(cards[idx], Number(rating));
            cards[idx] = result.tarjeta || result;
        } else return Toast.show('Motor de repaso no disponible', 'error');
        biblioteca[asig] = cards;
        State.set('biblioteca', biblioteca);
        EventBus.emit('DATA_REQUIRES_SAVE');
        _refresh(asig);
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        Toast.show('Tarjeta repasada', 'success');
    }

    // El sentido de la flecha es el almacenado, sin interpretar semánticamente su etiqueta.
    function explorar(id, sentido = 'entrantes', profundidad = 1) {
        const data = _read();
        const seen = new Set([String(id)]), edgeIds = new Set(), queue = [[String(id), 0]];
        while (queue.length) {
            const [current, depth] = queue.shift();
            if (depth >= Math.max(1, Math.min(10, Number(profundidad) || 1))) continue;
            for (const e of data.edges) {
                let next = null;
                if (sentido !== 'salientes' && String(e.target) === current) next = String(e.source);
                if (sentido !== 'entrantes' && String(e.source) === current) next = String(e.target);
                if (next === null) continue;
                edgeIds.add(String(e.id));
                if (!seen.has(next)) { seen.add(next); queue.push([next, depth + 1]); }
            }
        }
        return { nodes: [...seen], edges: [...edgeIds] };
    }
    function camino(origen, destino, dirigido = true) {
        const data = _read(), start = String(origen), end = String(destino);
        if (start === end) return { nodes: [start], edges: [] };
        const seen = new Set([start]), queue = [start], previous = new Map();
        while (queue.length) {
            const current = queue.shift();
            for (const e of data.edges) {
                let next = null;
                if (String(e.source) === current) next = String(e.target);
                else if (!dirigido && String(e.target) === current) next = String(e.source);
                if (next === null || seen.has(next)) continue;
                seen.add(next);
                previous.set(next, { prev: current, edge: String(e.id) });
                if (next === end) {
                    const nodes = [end], edges = [];
                    while (nodes[0] !== start) {
                        const step = previous.get(nodes[0]);
                        edges.unshift(step.edge); nodes.unshift(step.prev);
                    }
                    return { nodes, edges };
                }
                queue.push(next);
            }
        }
        return null;
    }

    // Mapas alternativos almacenados dentro de graphData, conservando nodes/edges en el activo.
    function _snapshot(data) { return {
        id: data.activeMapId, name: data.activeMapName,
        nodes: _clone(data.nodes), edges: _clone(data.edges), islandNames: _clone(data.islandNames || {})
    }; }
    function listarMapas() {
        const data = _read();
        return [{ ..._snapshot(data), active: true }, ...data.maps.map(m => ({ ...m, active: false }))]
            .map(m => ({ id: m.id, name: m.name, active: m.active,
                nodes: m.nodes.length, edges: m.edges.length }));
    }
    function getCurrentMap() { const data = _read(); return {
        id: data.activeMapId, name: data.activeMapName,
        nodes: _clone(data.nodes), edges: _clone(data.edges), islandNames: _clone(data.islandNames || {})
    }; }
    function crearMapa(nombre = '') { return _edit(data => {
        data.maps.push(_snapshot(data));
        data.activeMapId = _id();
        data.activeMapName = String(nombre || `Mapa ${data.maps.length + 1}`).trim().slice(0, 80);
        data.nodes = []; data.edges = []; data.islandNames = {};
    }); }
    function seleccionarMapa(id) { return _edit(data => {
        if (String(data.activeMapId) === String(id)) return false;
        const idx = data.maps.findIndex(m => String(m.id) === String(id));
        if (idx < 0) return false;
        const chosen = data.maps.splice(idx, 1)[0];
        data.maps.push(_snapshot(data));
        data.activeMapId = chosen.id; data.activeMapName = chosen.name;
        data.nodes = _clone(chosen.nodes); data.edges = _clone(chosen.edges); data.islandNames = _clone(chosen.islandNames || {});
    }); }
    function renombrarMapa(id, nombre) { return _edit(data => {
        const name = String(nombre || '').trim().slice(0, 80);
        if (!name) return false;
        if (String(id) === String(data.activeMapId)) data.activeMapName = name;
        else { const m = data.maps.find(m => String(m.id) === String(id)); if (!m) return false; m.name = name; }
    }); }
    function eliminarMapa(id) { return _edit(data => {
        if (String(id) !== String(data.activeMapId)) {
            const length = data.maps.length;
            data.maps = data.maps.filter(m => String(m.id) !== String(id));
            return data.maps.length === length ? false : true;
        }
        if (!data.maps.length) return false;
        const replacement = data.maps.shift();
        data.activeMapId = replacement.id; data.activeMapName = replacement.name;
        data.nodes = _clone(replacement.nodes); data.edges = _clone(replacement.edges); data.islandNames = _clone(replacement.islandNames || {});
    }); }

    // Exportación legible y robusta: JSON por línea, con títulos completos e IDs nativos.
    function exportarTexto() {
        const asig = _asig(), data = _read(asig);
        const cards = new Map(_allCards(asig).map(c => [_cardId(c, asig), c]));
        const lines = [
            '# ESTUDIADOR-GRAPH v1 — texto editable para compartir con personas y LLM',
            '# Conserva los ID de NODO y las referencias desde/hasta de RELACION.',
            '# Formato: una línea MAPA, NODO o RELACION seguida de un objeto JSON.',
            'MAPA ' + JSON.stringify({ version: 1, asignatura: asig, nombre: data.activeMapName }),
            '', '# NODOS'
        ];
        for (const n of data.nodes) {
            const c = cards.get(String(n.id));
            if (!c) continue;
            lines.push('NODO ' + JSON.stringify({ id: String(n.id), titulo: c.Titulo || '',
                tipo: c.Apartado || '', tema: c.Tema ?? '', indice: c.IndiceGlobal ?? null }));
        }
        lines.push('', '# RELACIONES');
        const ids = new Set(data.nodes.map(n => String(n.id)));
        for (const e of data.edges) if (ids.has(String(e.source)) && ids.has(String(e.target))) {
            lines.push('RELACION ' + JSON.stringify({ desde: String(e.source), hasta: String(e.target),
                etiqueta: e.label || '', revisada: e.reviewed !== false, ..._semantica(e) }));
        }
        return lines.join('\n') + '\n';
    }
    function _normalize(t) { return String(t || '').replace(/\$\$?/g, '')
        .replace(/\\(?:textbf|textit|mathrm|text)\{([^}]*)\}/g, '$1')
        .toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
    function analizarTexto(texto) {
        const meta = {}, nodes = [], edges = [], errors = [];
        for (const [idx, row] of String(texto).split(/\r?\n/).entries()) {
            const line = row.trim();
            if (!line || line.startsWith('#') || line.startsWith('```')) continue;
            const match = line.match(/^(MAPA|NODO|RELACION)\s+(.+)$/);
            if (!match) { errors.push(`Línea ${idx+1}: comando no reconocido`); continue; }
            try {
                const val = JSON.parse(match[2]);
                if (!val || typeof val !== 'object' || Array.isArray(val)) throw Error('Se esperaba un objeto JSON');
                if (match[1] === 'MAPA') Object.assign(meta, val);
                if (match[1] === 'NODO') {
                    if (val.id == null || !val.titulo) throw Error('NODO necesita id y titulo');
                    nodes.push(val);
                }
                if (match[1] === 'RELACION') {
                    if (val.desde == null || val.hasta == null) throw Error('RELACION necesita desde y hasta');
                    edges.push(val);
                }
            } catch (error) { errors.push(`Línea ${idx+1}: ${error.message}`); }
        }
        const asig = _asig();
        const library = _allCards(asig);
        const byId = new Map(library.map(c => [_cardId(c, asig), c]));
        const mapped = new Map(), readyNodes = [];
        for (const n of nodes) {
            let card = byId.get(String(n.id));
            if (!card) {
                const matches = library.filter(c => _normalize(c.Titulo) === _normalize(n.titulo)
                    && (!n.tipo || c.Apartado === n.tipo)
                    && (n.tema === '' || n.tema == null || String(c.Tema) === String(n.tema)));
                if (matches.length === 1) card = matches[0];
            }
            if (!card) { errors.push(`No se ha podido asociar la tarjeta: ${n.titulo}`); continue; }
            const localId = _cardId(card, asig);
            mapped.set(String(n.id), localId);
            if (!readyNodes.includes(localId)) readyNodes.push(localId);
        }
        const readyEdges = [];
        for (const e of edges) {
            const source = mapped.get(String(e.desde)), target = mapped.get(String(e.hasta));
            if (!source || !target) { errors.push(`Relación sin extremos válidos: ${e.desde} → ${e.hasta}`); continue; }
            readyEdges.push({ source, target, label: String(e.etiqueta || ''), reviewed: e.revisada === true, ..._semantica(e) });
        }
        return { meta, nodes: readyNodes, edges: readyEdges, errors };
    }
    function importarTexto(texto, reemplazar = false) {
        const parsed = analizarTexto(texto);
        if (parsed.errors.length) return { ok: false, ...parsed };
        if (!parsed.nodes.length) return { ok: false, ...parsed, errors: ['El texto no contiene nodos válidos'] };
        _edit((data, asig) => {
            if (reemplazar) { data.nodes = []; data.edges = []; }
            const before=new Set(data.nodes.map(n=>String(n.id)));
            for (const id of parsed.nodes) _insertNode(data, id, asig);
            for (const e of parsed.edges) _insertEdge(data, e.source, e.target, e.label, 'import', e.reviewed, e);
            _positionNew(data,before);
        });
        return { ok: true, ...parsed };
    }
    return { abrir, buscarTarjetas, addNode, removeNode, addEdge, editEdge, removeEdge,
        updatePosition, abrirTarjetaReal, calificarTarjetaDesdeMapa, addMassiveNodes,
        aplicarRelaciones, explorar, camino, listarMapas, getCurrentMap, crearMapa,
        seleccionarMapa, renombrarMapa, eliminarMapa, getIslandNames, renombrarIsla, exportarTexto, analizarTexto, importarTexto,
        organizar, deshacerOrganizacion, _cardId };
})();
window.abrirMapaConceptual = () => Graph.abrir();
