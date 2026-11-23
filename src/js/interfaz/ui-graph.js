// UI-GRAPH.JS — Interfaz del grafo. No modifica directamente la biblioteca.
// Vis.js se utiliza solo para visualizar y seleccionar; la lógica reside en Graph.
const UIGraph = (() => {
    let _network = null, _cb = {}, _types = {}, _allNodes = [], _allEdges = [];
    let _preview = null, _selected = null, _connectFrom = null, _pathFrom = null;
    let _mode = 'normal', _emphasis = null, _hiddenTypes = new Set(), _fsrs = false;
    let _searchBound = false, _toolbarBound = false, _showIslands = true;
    const $ = id => document.getElementById(id);
    const _css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const _escaped = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const _plain = s => String(s || '(sin título)').replace(/\$\$?/g, '')
        .replace(/\\(?:textbf|textit|mathrm|text)\{([^}]*)\}/g, '$1').trim();
    const _tipoColor = type => _types[type]?.color || _css('--accent', '#4caf50');
    const _colorEstado = card => {
        if (!card.UltimoRepaso || card.fsrs_state === 'new') return _css('--text-subtle', '#888');
        if (card.fsrs_state === 'learning') return _css('--status-red', '#bb0e02');
        const s = Number(card.fsrs_stability || 0);
        if (s >= 21) return _css('--status-green', '#4caf50');
        if (s >= 7) return _css('--status-blue', '#256ca5');
        return _css('--status-yellow', '#cdcd00');
    };
    const _allowed = n => !_hiddenTypes.has(n.card.Apartado || '');
    function _toNode(n) {
        const bg = _css('--surface-1', '#2a2a2a'), fg = _css('--text-main', '#eee');
        const border = _fsrs ? _colorEstado(n.card) : _tipoColor(n.card.Apartado);
        const emph = !_emphasis || _emphasis.nodes.includes(String(n.id));
        const label = _plain(n.card.Titulo);
        return { id: n.id, label: label.length > 75 ? label.slice(0, 72) + '…' : label,
            shape: 'box', margin: 10, borderWidth: n.latestBatch ? 3.5 : (emph ? 2.5 : 1),
            color: { background: bg, border,
                highlight: { background: bg, border: _css('--accent', '#4caf50') },
                hover: { background: bg, border } },
            font: { color: emph ? fg : _css('--text-subtle', '#666'), size: 13, face: 'sans-serif' },
            title: undefined,
            opacity: emph ? 1 : .24, x: n.x, y: n.y };
    }
    function _toEdge(e) {
        const foreground = _css('--text-main', '#ddd'), muted = _css('--border-light', '#555');
        const active = !_emphasis || _emphasis.edges.includes(String(e.id));
        const text = String(e.label || '').trim();
        const font = { color: active ? foreground : _css('--text-subtle', '#666'), size: 11,
            align: 'middle', face: 'sans-serif', strokeWidth: 0 };
        // Canvas no entiende colores CSS tipo var(...).
        if (text) font.background = _css('--bg-color', '#121212');
        return { id: e.id, from: e.source, to: e.target, label: text,
            arrows: { to: { enabled: true, scaleFactor: .8 } },
            color: { color: active ? muted : _css('--border', '#333'),
                highlight: _css('--accent', '#4caf50'), hover: muted, opacity: active ? 1 : .13 },
            font, dashes: e.reviewed === false, width: active ? 1.7 : 1,
            smooth: { type: 'continuous', roundness: .4 } };
    }
    function _visible() {
        const nodes = _allNodes.filter(_allowed);
        const ids = new Set(nodes.map(n => String(n.id)));
        const edges = _allEdges.filter(e => ids.has(String(e.source)) && ids.has(String(e.target)));
        return { nodes, edges };
    }
    function _redraw(fit = false) {
        if (!_network) return;
        const { nodes, edges } = _visible();
        _hideTooltip();
        _network.setData({ nodes: new vis.DataSet(nodes.map(_toNode)), edges: new vis.DataSet(edges.map(_toEdge)) });
        if (fit && nodes.length) _network.fit({ animation: false });
        _fillTypes();
        _renderMaps();
        const count = $('graph-count'); if (count) count.textContent = `${nodes.length} nodos · ${edges.length} relaciones`;
    }
    function _setMode(mode) {
        _mode = _mode === mode ? 'normal' : mode;
        _connectFrom = null; _pathFrom = null;
        for (const [button, value] of [['graph-btn-edge','edge'], ['graph-btn-path','path']]) {
            $(button)?.classList.toggle('graph-active', _mode === value);
        }
        _hint(_mode === 'edge' ? 'Selecciona origen y destino para crear una relación.' :
            _mode === 'path' ? 'Selecciona origen y destino para encontrar un camino.' : '');
    }
    function _hint(text) { if ($('graph-hint')) $('graph-hint').textContent = text; }
    function _dialog(title, builder, width = '560px') {
        const overlay = document.createElement('div'); overlay.className = 'graph-overlay';
        const dialog = document.createElement('div'); dialog.className = 'graph-dialog';
        dialog.style.maxWidth = width;
        const h = document.createElement('h3'); h.textContent = title;
        dialog.append(h); overlay.append(dialog); $('modal-graph').append(overlay);
        overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
        builder(dialog, () => overlay.remove()); _applyGraphButtonTheme(dialog); return overlay;
    }
    function _prompt(title, initial, callback) {
        _dialog(title, (box, close) => {
            const inp = document.createElement('input'); inp.value = initial || ''; inp.maxLength = 180;
            const actions = document.createElement('div'); actions.className = 'graph-actions';
            const cancel = document.createElement('button'); cancel.className = 'graph-secondary'; cancel.textContent = 'Cancelar'; cancel.onclick = close;
            const ok = document.createElement('button'); ok.textContent = 'Aceptar';
            ok.onclick = () => { callback(inp.value.trim()); close(); };
            inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } };
            actions.append(cancel, ok); box.append(inp, actions); inp.focus(); inp.select();
        }, '380px');
    }
    function _inspectEdge(id) {
        const edge = _allEdges.find(e => String(e.id) === String(id)); if (!edge) return;
        _dialog('Revisar relación', (box, close) => {
            const label = document.createElement('label'); label.textContent = 'Etiqueta de la relación';
            const input = document.createElement('input'); input.value = edge.label || ''; input.maxLength = 180;
            const row = document.createElement('label'); row.className = 'graph-checkline';
            const checked = document.createElement('input'); checked.type = 'checkbox'; checked.checked = edge.reviewed !== false;
            row.append(checked, document.createTextNode(' Relación verificada por mí'));
            const note = document.createElement('p'); note.className = 'graph-help';
            note.textContent = 'Las relaciones propuestas por IA se señalan con líneas discontinuas hasta verificarlas.';
            // Metadatos opcionales para que el examen pueda contrastar implicaciones y recíprocos.
            const tipoLabel = document.createElement('label'); tipoLabel.textContent = 'Naturaleza de la conexión (opcional)';
            const tipo = document.createElement('select');
            for (const [value, text] of [
                ['', 'Sin clasificar'], ['asociacion', 'Asociación'], ['implicacion', 'Implicación'],
                ['equivalencia', 'Equivalencia'], ['construccion', 'Construcción'], ['dependencia', 'Dependencia']
            ]) {
                const opt = document.createElement('option'); opt.value = value; opt.textContent = text;
                tipo.append(opt);
            }
            tipo.value = edge.tipo || '';
            const reversibleLabel = document.createElement('label'); reversibleLabel.textContent = '¿Es reversible? (solo si está fundamentado)';
            const reversible = document.createElement('select');
            for (const [value, text] of [['','Sin determinar'],['true','Sí'],['false','No']]) {
                const opt = document.createElement('option'); opt.value = value; opt.textContent = text;
                reversible.append(opt);
            }
            reversible.value = edge.tipo === 'equivalencia' ? 'true' : (typeof edge.reversible === 'boolean' ? String(edge.reversible) : '');
            tipo.addEventListener('change', () => {
                if (tipo.value === 'equivalencia') reversible.value = 'true';
                reversible.disabled = tipo.value === 'equivalencia';
            });
            reversible.disabled = tipo.value === 'equivalencia';
            const explanationLabel = document.createElement('label'); explanationLabel.textContent = 'Justificación o contraejemplo (opcional)';
            const explanation = document.createElement('textarea');
            explanation.rows = 4; explanation.maxLength = 3000;
            explanation.placeholder = 'Hipótesis, explicación de la relación, contraejemplo si procede...';
            explanation.value = edge.explicacion || '';
            const actions = document.createElement('div'); actions.className = 'graph-actions';
            const del = document.createElement('button'); del.className = 'graph-danger'; del.textContent = 'Eliminar';
            del.onclick = () => { _cb.onRemoveEdge?.(id); close(); };
            const cancel = document.createElement('button'); cancel.className = 'graph-secondary'; cancel.textContent = 'Cancelar'; cancel.onclick = close;
            const save = document.createElement('button'); save.textContent = 'Guardar';
            save.onclick = () => {
                _cb.onEditEdge?.(id, {
                    label: input.value, reviewed: checked.checked, tipo: tipo.value,
                    reversible: reversible.value === '' ? null : reversible.value === 'true',
                    explicacion: explanation.value
                });
                close();
            };
            actions.append(del, cancel, save);
            box.append(label, input, row, note, tipoLabel, tipo, reversibleLabel, reversible,
                explanationLabel, explanation, actions);
            input.focus();
        });
    }
    function _clickNode(id) {
        _selected = String(id);
        if (_mode === 'edge') {
            if (!_connectFrom) { _connectFrom = id; _hint('Selecciona el nodo de destino.'); return; }
            if (String(_connectFrom) !== String(id)) {
                const source = _connectFrom;
                _prompt('Etiqueta de la nueva relación', '', value => _cb.onAddEdge?.(source, id, value));
            }
            _setMode('normal'); return;
        }
        if (_mode === 'path') {
            if (!_pathFrom) { _pathFrom = id; _hint('Selecciona el destino del camino.'); return; }
            const directed = $('graph-path-directed')?.checked !== false;
            _emphasis = _cb.onPath?.(_pathFrom, id, directed);
            _hint(_emphasis ? `Camino encontrado: ${_emphasis.nodes.length - 1} enlaces.` : 'No existe un camino entre estos nodos.');
            _redraw(); _setMode('normal'); return;
        }
        _cb.onNodeClick?.(id);
    }
    function _hideTooltip() {
        const tip = $('graph-node-tooltip');
        if (tip) tip.hidden = true;
    }
    function _showTooltip(content, event) {
        const host = $('graph-canvas-container');
        if (!host || !content) return _hideTooltip();
        let tip = $('graph-node-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'graph-node-tooltip'; tip.className = 'graph-node-tooltip';
            tip.setAttribute('role', 'tooltip'); host.append(tip);
        }
        tip.replaceChildren();
        for (const line of content) {
            const span = document.createElement('div');
            span.className = line.kind === 'heading' ? 'graph-tooltip-heading' : 'graph-tooltip-text';
            span.textContent = line.text;
            tip.append(span);
        }
        tip.hidden = false;
        _moveTooltip(event);
    }
    function _moveTooltip(event) {
        const tip = $('graph-node-tooltip'), host = $('graph-canvas-container');
        if (!tip || tip.hidden || !host || !event) return;
        const rect = host.getBoundingClientRect();
        const x = event.clientX - rect.left + 14;
        const y = event.clientY - rect.top + 14;
        tip.style.left = `${Math.min(Math.max(5,x), Math.max(5,host.clientWidth - tip.offsetWidth - 8))}px`;
        tip.style.top = `${Math.min(Math.max(5,y), Math.max(5,host.clientHeight - tip.offsetHeight - 8))}px`;
    }
    function _applyGraphButtonTheme(root) {
        if (!root) return;
        root.querySelectorAll('button').forEach(button => {
            if (button.classList.contains('btn-dif')) return;
            button.classList.add('btn-modern');
            button.classList.add(button.classList.contains('graph-primary') ? 'btn-next' : 'btn-reveal');
        });
    }
    // Dibujar detrás de los nodos una frontera por cada componente conexa débil.
    function _drawIslandBorders(ctx) {
        if (!_showIslands || !_network || typeof GraphLayout === 'undefined') return;
        const visible=_visible();
        const components=GraphLayout.components(visible.nodes,visible.edges);
        if(!components.length)return;
        const palette=[_css('--accent','#4caf50'),_css('--status-blue','#256ca5'),
            _css('--status-green','#4caf50'),_css('--status-yellow','#cdcd00')];
        ctx.save();
        components.forEach((group,index)=>{
            if(group.length<2)return;
            const boxes=group.map(n=>_network.getBoundingBox(n.id));
            const pad=48, left=Math.min(...boxes.map(b=>b.left))-pad,
                right=Math.max(...boxes.map(b=>b.right))+pad,
                top=Math.min(...boxes.map(b=>b.top))-pad,
                bottom=Math.max(...boxes.map(b=>b.bottom))+pad;
            const radius=26,color=palette[index%palette.length];
            ctx.beginPath();
            ctx.moveTo(left+radius,top);ctx.lineTo(right-radius,top);
            ctx.quadraticCurveTo(right,top,right,top+radius);ctx.lineTo(right,bottom-radius);
            ctx.quadraticCurveTo(right,bottom,right-radius,bottom);ctx.lineTo(left+radius,bottom);
            ctx.quadraticCurveTo(left,bottom,left,bottom-radius);ctx.lineTo(left,top+radius);
            ctx.quadraticCurveTo(left,top,left+radius,top);ctx.closePath();
            ctx.fillStyle=color;ctx.globalAlpha=.045;ctx.fill();
            ctx.globalAlpha=.65;ctx.strokeStyle=color;ctx.lineWidth=1.7;
            ctx.setLineDash([10,7]);ctx.stroke();ctx.setLineDash([]);
            ctx.globalAlpha=.85;ctx.fillStyle=color;ctx.font='bold 13px sans-serif';
            ctx.fillText(`Isla ${index+1} · ${group.length} nodos`,left+13,top+23);
        });
        ctx.restore();
    }
    function _initNetwork() {
        if (_network) _network.destroy();
        $('graph-node-tooltip')?.remove();
        _network = new vis.Network($('graph-canvas-container'),
            { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) },
            { physics: { enabled: false }, interaction: { hover: true, multiselect: true, tooltipDelay: 250 },
              manipulation: { enabled: false }, nodes: { widthConstraint: { maximum: 215 } } });
        _network.on('beforeDrawing',ctx=>_drawIslandBorders(ctx));
        _network.on('hoverNode', params => {
            const n = _allNodes.find(n => String(n.id) === String(params.node));
            if (!n) return;
            _showTooltip([
                {kind:'heading',text:n.card.Apartado || 'Tarjeta'},
                {kind:'text',text:`Tema ${n.card.Tema ?? '?'} · ${_plain(n.card.Titulo)}`}
            ], params.event?.srcEvent);
        });
        _network.on('hoverEdge', params => {
            const e = _allEdges.find(e => String(e.id) === String(params.edge));
            if (e) _showTooltip([{kind:'heading', text:e.label || 'Relación sin etiqueta'},
                {kind:'text',text:e.reviewed === false ? 'Pendiente de verificación' : 'Relación verificada'}],params.event?.srcEvent);
        });
        _network.on('blurNode', _hideTooltip);
        _network.on('blurEdge', _hideTooltip);
        if ($('graph-canvas-container')) $('graph-canvas-container').onmousemove = _moveTooltip;
        _network.on('click', params => {
            _hideTooltip();
            if (params.nodes.length === 1) _clickNode(params.nodes[0]);
            else if (!params.edges.length) { _selected = null; _setMode('normal'); if (_preview) _preview.style.display = 'none'; }
        });
        _network.on('doubleClick', params => {
            if (!params.nodes.length && params.edges.length === 1) _inspectEdge(params.edges[0]);
        });
        _network.on('dragEnd', params => {
            for (const id of params.nodes) {
                const pos = _network.getPosition(id);
                _cb.onPositionChange?.(id, Math.round(pos.x), Math.round(pos.y));
            }
        });
        _redraw(true);
    }
    function _fillTypes() {
        const field = $('graph-filter-types'); if (!field) return;
        const types = [...new Set(_allNodes.map(n => n.card.Apartado || 'Sin tipo'))].sort();
        const key = types.join('\u0000'); if (field.dataset.key === key) {
            field.querySelectorAll('label').forEach(label => { const box = label.querySelector('input'); if (box) box.checked = !_hiddenTypes.has(label.dataset.type); });
            return;
        }
        field.dataset.key = key; field.innerHTML = '';
        for (const t of types) {
            const label = document.createElement('label'); label.className = 'graph-checkline'; label.dataset.type = t;
            const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !_hiddenTypes.has(t);
            inp.onchange = () => { if (inp.checked) _hiddenTypes.delete(t); else _hiddenTypes.add(t); _redraw(); };
            label.append(inp, document.createTextNode(` ${t}`)); field.append(label);
        }
    }
    function _renderMaps() {
        const select = $('graph-map-select'); if (!select || !_cb.onListMaps) return;
        const current = _cb.onGetMap?.().id;
        select.innerHTML = '';
        for (const m of _cb.onListMaps()) select.add(new Option(`${m.name} (${m.nodes})`, m.id));
        select.value = current;
    }
    function _createTools() {
        if ($('graph-extra-tools')) return;
        const toolbar = $('graph-toolbar');
        const more = document.createElement('div'); more.id = 'graph-extra-tools'; more.className = 'graph-extra-tools';
        more.innerHTML = `<select id="graph-map-select" title="Mapa activo" aria-label="Mapa activo"></select>
            <button id="graph-map-new" title="Nuevo mapa">+ Mapa</button>
            <button id="graph-map-rename" title="Renombrar mapa">Renombrar</button>
            <button id="graph-map-delete" class="graph-danger" title="Eliminar mapa activo">Borrar mapa</button>
            <details class="graph-menu"><summary>Visualización</summary>
                <div class="graph-menu-panel">
                    <div id="graph-filter-types"></div>
                    <label class="graph-checkline"><input type="checkbox" id="graph-show-islands" checked> Mostrar fronteras de islas conexas</label>
                    <label class="graph-checkline"><input type="checkbox" id="graph-fsrs"> Mostrar progreso FSRS en el borde</label>
                    <p class="graph-help">FSRS: gris nuevo · rojo aprendizaje · amarillo consolidación · azul revisión · verde estable.</p>
                    <button id="graph-clear-emphasis" class="graph-secondary">Mostrar todo / quitar resaltado</button>
                </div></details>
            <details class="graph-menu"><summary>Organizar</summary><div class="graph-menu-panel">
                <p class="graph-help">Opera sobre los nodos seleccionados; sin selección, sobre el mapa entero.</p>
                <button id="graph-layout-grid">Organizar en cuadrícula</button>
                <button id="graph-layout-islands">Separar componentes en islas</button>
                <button id="graph-layout-hierarchy">Jerarquía de dependencias</button>
                <button id="graph-layout-generality">Jerarquía de generalidad</button>
                <button id="graph-layout-undo">Deshacer organización</button>
            </div></details>
            <button id="graph-btn-explore" title="Destacar relaciones entrantes y salientes">Entorno</button>
            <select id="graph-explore-direction" title="Dirección de exploración"><option value="entrantes">Entrantes</option><option value="salientes">Salientes</option><option value="ambos">Ambos</option></select>
            <button id="graph-btn-path" title="Buscar el camino entre dos nodos">Camino</button>
            <button id="graph-reset-highlight" title="Eliminar resaltado de entorno o camino">Limpiar resaltado</button>
            <label class="graph-inline"><input id="graph-path-directed" type="checkbox" checked>Dirigido</label>
            <details class="graph-menu"><summary>Exportar / Importar</summary><div class="graph-menu-panel">
                <button id="graph-export-text">Texto editable</button><button id="graph-import-text">Importar texto</button>
                <button id="graph-export-svg">Imagen SVG</button><button id="graph-export-png">Imagen PNG</button>
            </div></details>
            <span id="graph-count" class="graph-small"></span>`;
        toolbar.insertBefore(more, $('graph-hint'));
        _applyGraphButtonTheme(more);
        $('graph-map-select').onchange = e => { _emphasis = null; _hiddenTypes.clear(); _cb.onSelectMap?.(e.target.value); _renderMaps(); _network?.fit(); };
        $('graph-map-new').onclick = () => _prompt('Nombre del nuevo mapa', 'Mapa nuevo', name => { if (name) { _cb.onCreateMap?.(name); _emphasis = null; _hiddenTypes.clear(); _network?.fit(); } });
        $('graph-map-rename').onclick = () => {
            const m = _cb.onGetMap?.(); if (m) _prompt('Renombrar mapa', m.name, name => { if (name) _cb.onRenameMap?.(m.id, name); });
        };
        $('graph-map-delete').onclick = () => {
            const maps = _cb.onListMaps?.() || []; if (maps.length < 2) return Toast.show('Debe quedar al menos un mapa', 'warning');
            const m = _cb.onGetMap?.();
            if (window.confirm(`¿Eliminar el mapa «${m.name}»? No se puede deshacer.`)) _cb.onDeleteMap?.(m.id);
        };
        $('graph-fsrs').onchange = e => { _fsrs = e.target.checked; _redraw(); };
        $('graph-show-islands').onchange=e=>{_showIslands=e.target.checked;_network?.redraw();};
        const arrange=(type,criterion)=>{
            const ids=_network?.getSelectedNodes() || [];
            const ok=_cb.onOrganize?.(type,ids,{criterion});
            if(ok) { _network?.fit({animation:false}); _hint(`Organización aplicada a ${ids.length || 'todos los'} nodos.`); }
        };
        $('graph-layout-grid').onclick=()=>arrange('grid');
        $('graph-layout-islands').onclick=()=>arrange('islands');
        $('graph-layout-hierarchy').onclick=()=>arrange('hierarchy','dependencias');
        $('graph-layout-generality').onclick=()=>arrange('hierarchy','generalidad');
        $('graph-layout-undo').onclick=()=>{if(_cb.onUndoLayout?.())_hint('Organización deshecha.');};
        $('graph-clear-emphasis').onclick = () => { _emphasis = null; _hiddenTypes.clear(); _redraw(); };
        $('graph-btn-explore').onclick = () => {
            if (!_selected) return Toast.show('Selecciona un nodo primero', 'info');
            _emphasis = _cb.onExplore?.(_selected, $('graph-explore-direction').value, 1);
            _redraw(); _hint(`${_emphasis?.nodes.length || 0} nodos en el entorno seleccionado.`);
        };
        $('graph-btn-path').onclick = () => _setMode('path');
        $('graph-reset-highlight').onclick = () => { _emphasis = null; _setMode('normal'); _redraw(); _hint('Resaltado eliminado.'); };
        $('graph-export-text').onclick = () => _textDialog(false);
        $('graph-import-text').onclick = () => _textDialog(true);
        $('graph-export-svg').onclick = _exportSVG;
        $('graph-export-png').onclick = _exportPNG;
    }
    function _bindSearch() {
        if (_searchBound) return; _searchBound = true;
        const input = $('graph-search-input'), results = $('graph-search-results');
        if (!input || !results) return;
        const doSearch = () => {
            const list = _cb.onSearch?.(input.value, $('graph-search-filter')?.value || '', $('graph-search-tema')?.value || '') || [];
            results.replaceChildren(); results.style.display = list.length ? 'block' : 'none';
            for (const item of list) {
                const div = document.createElement('div'); div.className = 'graph-search-item';
                const kind = document.createElement('span');
                kind.className = 'graph-search-kind'; kind.textContent = (item.tipo || 'Tarjeta').slice(0, 4).toUpperCase();
                kind.style.setProperty('--graph-type-color', _tipoColor(item.tipo));
                const title = document.createElement('span');
                title.className = 'graph-search-title'; title.textContent = _plain(item.titulo);
                div.append(kind, title);
                div.onclick = () => { _cb.onAddNode?.(item.id); input.value = ''; results.style.display = 'none'; };
                results.append(div);
            }
        };
        for (const id of ['graph-search-input', 'graph-search-tema']) $(id)?.addEventListener('input', doSearch);
        $('graph-search-filter')?.addEventListener('change', doSearch);
        input.addEventListener('focus', doSearch);
        document.addEventListener('click', e => { if (!results.contains(e.target) && e.target !== input) results.style.display = 'none'; });
    }
    function _massDialog(forAI = false) {
        _dialog(forAI ? 'Generar relaciones con IA' : 'Añadir tarjetas por lote', (box, close) => {
            const txt = document.createElement('p'); txt.className = 'graph-help';
            txt.textContent = forAI ? 'Deja el tema vacío para incluir toda la asignatura (hasta 180 tarjetas).' : 'Añade las tarjetas seleccionadas sin cambiar la disposición general.';
            const title = document.createElement('label'); title.textContent = 'Tema (opcional)';
            const tema = document.createElement('input'); tema.type = 'number'; tema.min = '1'; tema.placeholder = 'Todos los temas';
            const tlabel = document.createElement('label'); tlabel.textContent = 'Tipo';
            const tipo = document.createElement('select');
            for (const type of ['', 'Definición', 'Teorema', 'Proposición', 'Lema', 'Corolario', 'Demot', 'Demop', 'Demol', 'Ejercicio', 'Ejemplo'])
                tipo.add(new Option(type || 'Todos los tipos', type));
            const actions = document.createElement('div'); actions.className = 'graph-actions';
            const cancel = document.createElement('button'); cancel.className = 'graph-secondary'; cancel.textContent = 'Cancelar'; cancel.onclick = close;
            const submit = document.createElement('button'); submit.textContent = forAI ? 'Proponer relaciones' : 'Añadir nodos';
            submit.onclick = () => {
                const theme = tema.value ? Number(tema.value) : null, cardType = tipo.value;
                if (forAI) {
                    const asig = State.get('nombreAsignaturaActual');
                    const cards = ((State.get('biblioteca') || {})[asig] || []).filter(c =>
                        (theme == null || Number(c.Tema) === theme) && (!cardType || c.Apartado === cardType));
                    if (!cards.length) return Toast.show('No hay tarjetas para ese filtro', 'warning');
                    GraphAI.generarMapaConIA(cards);
                } else _cb.onAddMassive?.(theme, cardType);
                close();
            };
            actions.append(cancel, submit); box.append(txt, title, tema, tlabel, tipo, actions);
        });
    }
    function _deleteSelection() {
        if (!_network) return;
        // Primero aristas para evitar refrescos que pierdan la selección.
        const edges = _network.getSelectedEdges(), nodes = _network.getSelectedNodes();
        for (const id of edges) _cb.onRemoveEdge?.(id);
        for (const id of nodes) _cb.onRemoveNode?.(id);
    }
    function _download(blob, filename) {
        const a = document.createElement('a'), url = URL.createObjectURL(blob);
        a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function _filename(ext) {
        const name = _cb.onGetMap?.()?.name || 'Mapa';
        return name.replace(/[^a-z0-9áéíóúüñ_-]+/gi, '_').slice(0, 50) + '.' + ext;
    }
    function _textDialog(importing) {
        _dialog(importing ? 'Importar mapa desde texto' : 'Exportar mapa en texto', (box, close) => {
            const help = document.createElement('p'); help.className = 'graph-help';
            help.textContent = importing ? 'Pega un archivo ESTUDIADOR-GRAPH v1. Los IDs se resolverán en tu biblioteca; si no coinciden, se probará una coincidencia exacta y única por título/tipo/tema.' :
                'Copia el contenido para revisarlo con otro LLM. Los IDs estables permitirán importar de vuelta las relaciones.';
            const textarea = document.createElement('textarea'); textarea.className = 'graph-textarea';
            textarea.value = importing ? '' : _cb.onExportText?.() || '';
            const feedback = document.createElement('p'); feedback.className = 'graph-help';
            const actions = document.createElement('div'); actions.className = 'graph-actions';
            const cancel = document.createElement('button'); cancel.className = 'graph-secondary'; cancel.textContent = 'Cerrar'; cancel.onclick = close;
            if (importing) {
                const mode = document.createElement('select'); mode.id = 'graph-import-mode';
                mode.add(new Option('Añadir / combinar', 'merge')); mode.add(new Option('Sustituir mapa activo', 'replace'));
                const preview = document.createElement('button'); preview.textContent = 'Validar'; preview.className = 'graph-secondary';
                const submit = document.createElement('button'); submit.textContent = 'Aplicar'; submit.disabled = true;
                let validated = null;
                preview.onclick = () => {
                    validated = Graph.analizarTexto(textarea.value);
                    feedback.textContent = validated.errors.length ? validated.errors.slice(0, 8).join('\n') :
                        `${validated.nodes.length} nodos y ${validated.edges.length} relaciones válidas. Puedes aplicar.`;
                    submit.disabled = !!validated.errors.length || !validated.nodes.length;
                };
                textarea.oninput = () => { submit.disabled = true; validated = null; feedback.textContent = ''; };
                submit.onclick = () => {
                    const result = _cb.onImportText?.(textarea.value, mode.value === 'replace');
                    if (result?.ok) { Toast.show('Mapa importado correctamente', 'success'); close(); }
                    else feedback.textContent = result?.errors?.join('\n') || 'Error de importación';
                };
                actions.append(mode, preview, submit, cancel);
            } else {
                const copy = document.createElement('button'); copy.textContent = 'Copiar';
                copy.onclick = async () => {
                    try { await navigator.clipboard.writeText(textarea.value); Toast.show('Texto copiado', 'success'); }
                    catch { textarea.select(); document.execCommand('copy'); Toast.show('Texto seleccionado para copiar', 'info'); }
                };
                const download = document.createElement('button'); download.textContent = 'Descargar .txt';
                download.onclick = () => _download(new Blob([textarea.value], {type:'text/plain;charset=utf-8'}), _filename('txt'));
                actions.append(copy, download, cancel);
            }
            box.append(help, textarea, feedback, actions);
        }, '800px');
    }
    function _exportPNG() {
        const svg = _buildSVG(); if (!svg) return;
        const url = URL.createObjectURL(new Blob([svg.text], {type:'image/svg+xml;charset=utf-8'}));
        const image = new Image();
        image.onload = () => {
            try {
                const factor = Math.min(2, 7000 / Math.max(svg.width, svg.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(svg.width * factor);
                canvas.height = Math.ceil(svg.height * factor);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => blob ? _download(blob, _filename('png')) :
                    Toast.show('No se pudo convertir el mapa en PNG', 'error'), 'image/png');
            } finally { URL.revokeObjectURL(url); }
        };
        image.onerror = () => { URL.revokeObjectURL(url); Toast.show('No se pudo generar el PNG', 'error'); };
        image.src = url;
    }
    function _buildSVG() {
        if (!_network) return;
        const { nodes, edges } = _visible();
        if (!nodes.length) return Toast.show('El mapa está vacío', 'warning');
        const positions = _network.getPositions(nodes.map(n => n.id));
        const boxes = new Map();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of nodes) {
            const b = _network.getBoundingBox(n.id);
            boxes.set(String(n.id), b);
            minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
            maxX = Math.max(maxX, b.right); maxY = Math.max(maxY, b.bottom);
        }
        const pad = 55, width = Math.max(200, maxX - minX + pad * 2), height = Math.max(120, maxY - minY + pad * 2);
        const fg = _css('--text-main', '#eee'), bg = _css('--bg-color', '#121212');
        const border = _css('--border-light', '#777');
        const content = [`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${minX-pad} ${minY-pad} ${width} ${height}">`,
            `<rect x="${minX-pad}" y="${minY-pad}" width="${width}" height="${height}" fill="${_escaped(bg)}"/>`,
            `<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="${_escaped(border)}"/></marker></defs>`];
        for (const e of edges) {
            const from = positions[String(e.source)], to = positions[String(e.target)];
            if (!from || !to) continue;
            const label = String(e.label || '');
            const sourceBox = boxes.get(String(e.source)), targetBox = boxes.get(String(e.target));
            const clipToEdge = (p, q, b) => {
                const dx = q.x - p.x, dy = q.y - p.y;
                const halfW = (b.right - b.left) / 2 + 1, halfH = (b.bottom - b.top) / 2 + 1;
                const tx = dx ? Math.abs(halfW / dx) : Infinity;
                const ty = dy ? Math.abs(halfH / dy) : Infinity;
                const t = Math.min(tx, ty, 1);
                return { x:p.x+dx*t, y:p.y+dy*t };
            };
            const a = clipToEdge(from, to, sourceBox), b = clipToEdge(to, from, targetBox);
            content.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${_escaped(border)}" stroke-width="1.6" ${e.reviewed === false ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow)"/>`);
            if (label) {
                const tx = (from.x + to.x) / 2, ty = (from.y + to.y) / 2;
                const length = Math.min(350, label.length * 6.4 + 12);
                content.push(`<rect x="${tx-length/2}" y="${ty-12}" width="${length}" height="19" rx="3" fill="${_escaped(bg)}"/>`,
                    `<text x="${tx}" y="${ty+1}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${_escaped(fg)}">${_escaped(label.slice(0, 54))}</text>`);
            }
        }
        for (const n of nodes) {
            const b = boxes.get(String(n.id)), color = _fsrs ? _colorEstado(n.card) : _tipoColor(n.card.Apartado);
            const label = _plain(n.card.Titulo).slice(0, 75);
            content.push(`<rect x="${b.left}" y="${b.top}" width="${b.right-b.left}" height="${b.bottom-b.top}" rx="5" fill="${_escaped(_css('--surface-1', '#2a2a2a'))}" stroke="${_escaped(color)}" stroke-width="2"/>`);
            const maxChars = Math.max(10, Math.floor((b.right-b.left-18)/7));
            const words = label.split(/\s+/), lines = [];
            let line = '';
            for (const word of words) {
                if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = ''; }
                if (word.length > maxChars) {
                    if (line) { lines.push(line); line = ''; }
                    for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
                } else line = line ? line + ' ' + word : word;
            }
            if (line) lines.push(line);
            const midpoint = (b.top+b.bottom)/2 - (lines.length-1)*7;
            content.push(`<text text-anchor="middle" font-size="12" font-family="sans-serif" fill="${_escaped(fg)}">`);
            lines.forEach((row, i) => content.push(`<tspan x="${(b.left+b.right)/2}" y="${midpoint+i*14+4}">${_escaped(row)}</tspan>`));
            content.push('</text>');
        }
        content.push('</svg>');
        return { text: content.join('\n'), width, height };
    }
    function _exportSVG() {
        const svg = _buildSVG();
        if (svg) _download(new Blob([svg.text], {type:'image/svg+xml;charset=utf-8'}), _filename('svg'));
    }
    function _bindToolbar() {
        if (_toolbarBound) return; _toolbarBound = true;
        $('graph-btn-edge')?.addEventListener('click', () => _setMode('edge'));
        $('graph-btn-delete')?.addEventListener('click', _deleteSelection);
        $('graph-btn-fit')?.addEventListener('click', () => _network?.fit({animation:{duration:350}}));
        $('graph-btn-close')?.addEventListener('click', cerrarMapa);
        $('btn-togglegrafo')?.addEventListener('click', () => window.abrirMapaConceptual?.());
        $('graph-btn-add-mass')?.addEventListener('click', () => _massDialog(false));
        $('graph-btn-ia')?.addEventListener('click', () => _massDialog(true));
        document.addEventListener('keydown', e => {
            const modal = $('modal-graph'); if (!modal || modal.classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                const overlay = modal.querySelector('.graph-overlay:last-of-type');
                if (overlay) overlay.remove();
                else if (_preview?.style.display === 'flex') _preview.style.display = 'none';
                else cerrarMapa();
                e.stopPropagation(); return;
            }
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
            if (_preview?.style.display === 'flex') {
                if (e.key === ' ' || e.key === 'Enter') { $('graph-preview-show')?.click(); e.preventDefault(); }
                if (['1','2','3','4'].includes(e.key)) { _preview.querySelector(`[data-rate="${e.key}"]`)?.click(); e.preventDefault(); }
            }
        });
    }
    function abrirMapa(asig, nodes, edges, tipos, callbacks) {
        _cb = callbacks || {}; _types = tipos || {}; _allNodes = nodes || []; _allEdges = edges || [];
        _hiddenTypes.clear(); _emphasis = null; _selected = null; _setMode('normal');
        $('modal-graph')?.classList.remove('hidden');
        if ($('graph-asig-label')) $('graph-asig-label').textContent = asig;
        _createTools(); _bindToolbar(); _bindSearch(); _initNetwork();
        setTimeout(() => $('graph-search-input')?.focus(), 100);
    }
    function refreshMapa(nodes, edges, tipos) {
        _allNodes = nodes || []; _allEdges = edges || []; _types = tipos || {};
        if (_emphasis) {
            const ids = new Set(_allNodes.map(n => String(n.id)));
            if (_emphasis.nodes.some(id => !ids.has(String(id)))) _emphasis = null;
        }
        _redraw();
    }
    function cerrarMapa() {
        if (_network) { _network.destroy(); _network = null; }
        $('graph-node-tooltip')?.remove();
        _preview?.remove(); _preview = null;
        $('modal-graph')?.querySelectorAll('.graph-overlay').forEach(el => el.remove());
        $('modal-graph')?.classList.add('hidden'); _mode = 'normal';
    }
    function mostrarPreview(card, id) {
        if (!_preview) { _preview = document.createElement('aside'); _preview.id = 'graph-preview'; _preview.className = 'graph-preview'; $('modal-graph').append(_preview); }
        _preview.innerHTML = `<div class="graph-preview-head"><strong>${_escaped(card.Apartado || 'Tarjeta')}</strong>
            <button id="graph-preview-close" class="graph-secondary btn-modern btn-reveal" aria-label="Cerrar">×</button></div>
            <div class="graph-preview-content"><h3>${_escaped(card.Titulo || '(sin título)')}</h3>
                <div id="graph-preview-answer" hidden></div></div>
            <div class="graph-preview-footer"><button id="graph-preview-show" class="btn-modern btn-reveal graph-primary">Mostrar contenido</button>
            <div id="graph-preview-rates" hidden>
                <button class="btn-dif btn-dif-1" data-rate="1">1 Fácil</button>
                <button class="btn-dif btn-dif-2" data-rate="2">2 Bien</button>
                <button class="btn-dif btn-dif-3" data-rate="3">3 Difícil</button>
                <button class="btn-dif btn-dif-4" data-rate="4">4 Mal</button>
            </div></div>`;
        // El contenido procede de las tarjetas locales: se mantiene el renderizado HTML/LaTeX de Estudiador.
        $('graph-preview-answer').innerHTML = card.Contenido || '(Sin contenido)';
        _preview.style.display = 'flex';
        $('graph-preview-close').onclick = () => _preview.style.display = 'none';
        $('graph-preview-show').onclick = () => {
            $('graph-preview-answer').hidden = false; $('graph-preview-rates').hidden = false;
            $('graph-preview-show').hidden = true;
            if (typeof MathJax !== 'undefined' && MathJax.typesetPromise)
                MathJax.typesetPromise([$('graph-preview-answer')]).catch(() => {});
        };
        for (const button of _preview.querySelectorAll('[data-rate]')) button.onclick = () => {
            _cb.onRateCard?.(id, Number(button.dataset.rate)); _preview.style.display = 'none';
        };
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise)
            MathJax.typesetPromise([_preview]).catch(() => {});
    }
    document.addEventListener('DOMContentLoaded', () => {
        _bindToolbar();
        const observer = new MutationObserver(() => { if (_network) _redraw(); });
        observer.observe(document.documentElement, {attributes:true, attributeFilter:['class','style','data-theme']});
        if (document.body) observer.observe(document.body, {attributes:true, attributeFilter:['class','style','data-theme']});
    });
    return { abrirMapa, refreshMapa, cerrarMapa, mostrarPreview };
})();
