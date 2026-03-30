// ════════════════════════════════════════════════════════════════
// UI-GRAPH.JS — Renderizado del Mapa Conceptual (Vis.js Network)
// Responsabilidad: DOM + Vis.js. Cero lógica de negocio.
// Carga tras: los demás ui-*.js, antes de ui.js
// ════════════════════════════════════════════════════════════════

const UIGraph = (() => {

    let _network    = null;
    let _previewPanel = null;
    let _cb         = {};   
    let _tipos      = {};
    let _edgeMode   = false;
    let _edgeSrc    = null;

    // ── Utilidades de mapeo ───────────────────────────────────────

    function _getCssVar(varName, fallback) {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return val ? val : fallback;
    }

    // ── Utilidades de mapeo ───────────────────────────────────────
    function _colorForTipo(tipo) {
        return (_tipos[tipo]?.color) || _getCssVar('--accent', '#607d8b');
    }

    /** Saneador mejorado: Mantiene el texto LaTeX crudo legible, elimina llaves superfluas */
    function _plainTitle(titulo) {
        if (!titulo) return '(sin título)';
        return titulo
            .replace(/\$\$/g, '') // Quita delimitadores de bloque
            .replace(/\$/g, '')   // Quita delimitadores inline
            .replace(/\\textbf\{([^}]*)\}/g, '$1')
            .replace(/\\textit\{([^}]*)\}/g, '$1')
            .trim()
            .substring(0, 65) + (titulo.length > 65 ? '...' : '');
    }

    function _toVisNode(n) {
        const baseColor = _colorForTipo(n.card.Apartado);
        const bgColor   = _getCssVar('--surface-1', '#1e1e1e'); // Fondo OPACO (Soluciona flechas superpuestas)
        const textColor = _getCssVar('--text-main', '#e0e0e0');

        return {
            id:    n.id,
            label: _plainTitle(n.card.Titulo), 
            color: {
                background: bgColor, 
                border:     baseColor,
                highlight:  { background: bgColor, border: baseColor },
                hover:      { background: bgColor, border: baseColor },
            },
            font:        { color: textColor, size: 13, face: 'inherit' },
            borderWidth: 2,
            shape:       'box',
            margin:      10,
            x: n.x,
            y: n.y,
        };
    }

    function _toVisEdge(e) {
        const edgeColor = _getCssVar('--border', '#555');
        const textColor = _getCssVar('--text-main', '#aaa');
        
        return {
            id:     e.id,
            from:   e.source,
            to:     e.target,
            label:  e.label || '',
            arrows: {
                to: { enabled: true, scaleFactor: 0.8 } 
            },
            color:  { 
                color: edgeColor, 
                highlight: _getCssVar('--accent', '--text-main'), 
                hover: edgeColor 
            },
            font: { 
                color: textColor, 
                size: 11, 
                align: 'middle', 
                face: 'inherit', 
                background: 'var(--bg-color)',
                // Reducimos el trazo del borde del texto para máxima claridad
                strokeWidth: 0,
                strokeColor: 'transparent'
            },
            smooth: { type: 'continuous', roundness: 0.5 },
            // Bajamos la anchura base y la de selección
            width: 1.5,
            selectionWidth: 1.5 
        };
    }

    // ── Modo conexión ─────────────────────────────────────────────

    function _setEdgeMode(on) {
        _edgeMode = on;
        _edgeSrc  = null;
        if (_network) _network.unselectAll();

        const btn  = document.getElementById('graph-btn-edge');
        const hint = document.getElementById('graph-hint');

        if (btn) {
            btn.style.background   = on ? 'rgba(76,175,80,0.2)' : '';
            btn.style.borderColor  = on ? 'var(--accent)'       : 'var(--border-light)';
            btn.style.color        = on ? 'var(--accent)'       : 'var(--text-muted)';
        }
        if (hint) hint.innerText = on ? 'Clic en nodo origen → luego nodo destino.' : '';
    }
    // ── Custom Prompt No Bloqueante ───────────────────────────────

    function _customPrompt(mensaje, valorPorDefecto, callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(2px);';
        
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-color, #121212); padding:20px; border-radius:8px; border:1px solid var(--border-light, #333); width:320px; box-shadow:0 8px 24px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:12px; font-family:inherit;';
        
        const label = document.createElement('label');
        label.textContent = mensaje;
        label.style.color = 'var(--text-main, #fff)';
        label.style.fontSize = '0.9em';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = valorPorDefecto || '';
        input.style.cssText = 'padding:10px; border-radius:6px; border:1px solid var(--border, #444); background:var(--surface-1, #1e1e1e); color:var(--text-main, #fff); width:100%; box-sizing:border-box; outline:none; font-family:inherit;';
        input.onfocus = () => input.style.borderColor = 'var(--accent, #4caf50)';
        input.onblur = () => input.style.borderColor = 'var(--border, #444)';
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; justify-content:flex-end; gap:10px; margin-top:8px;';
        
        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Cancelar';
        btnCancel.style.cssText = 'padding:8px 14px; background:transparent; border:1px solid var(--border-light, #444); color:var(--text-muted, #aaa); border-radius:6px; cursor:pointer; font-weight:bold; transition:all 0.2s;';
        
        const btnOk = document.createElement('button');
        btnOk.textContent = 'Aceptar';
        btnOk.style.cssText = 'padding:8px 14px; background:var(--accent, #4caf50); border:none; color:#fff; border-radius:6px; cursor:pointer; font-weight:bold; transition:all 0.2s;';
        
        btnRow.appendChild(btnCancel);
        btnRow.appendChild(btnOk);
        box.appendChild(label);
        box.appendChild(input);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        
        document.getElementById('modal-graph').appendChild(overlay);
        input.focus();
        input.select();
        
        const close = (val) => {
            overlay.remove();
            callback(val);
        };
        
        btnOk.onclick = () => close(input.value);
        btnCancel.onclick = () => close(null);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        };
    }

    function _deleteSelected() {
        if (!_network) return;
        _network.getSelectedNodes().forEach(id => _cb.onRemoveNode?.(id));
        _network.getSelectedEdges().forEach(id => _cb.onRemoveEdge?.(id));
    }

    // ── Búsqueda ──────────────────────────────────────────────────


    function _bindSearch() {
        const input   = document.getElementById('graph-search-input');
        const results = document.getElementById('graph-search-results');
        const filter  = document.getElementById('graph-search-filter');
        if (!input || !results) return;

        const triggerSearch = () => {
            const q = input.value;
            const f = filter ? filter.value : '';
            const found = _cb.onSearch?.(q, f) || [];
            
            results.innerHTML  = '';
            if (found.length === 0) {
                results.style.display = 'none';
                return;
            }

            results.style.display = 'block';
            found.forEach(r => {
                const div = document.createElement('div');
                div.style.cssText = `
                    padding:7px 12px; cursor:pointer; font-size:0.82em;
                    border-bottom:1px solid var(--border);
                    color:${_colorForTipo(r.tipo)};
                    transition:background 0.15s; display:flex; gap:8px; align-items:center;
                `;
                div.innerHTML = `<span style="font-size:0.7em; padding:2px 4px; border:1px solid; border-radius:3px; opacity:0.8">${r.tipo.substring(0,3).toUpperCase()}</span> ${escapeHtml(_plainTitle(r.titulo))}`;
                div.onmouseenter = () => div.style.background = 'var(--surface-1)';
                div.onmouseleave = () => div.style.background = '';
                div.onclick = () => {
                    _cb.onAddNode?.(r.id);
                    input.value = '';
                    results.style.display = 'none';
                };
                results.appendChild(div);
            });
        };

        // Escuchadores: Buscar al escribir, al hacer focus y al cambiar el filtro
        input.oninput = triggerSearch;
        input.onfocus = triggerSearch;
        if (filter) filter.onchange = triggerSearch;

        // Cerrar resultados al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target) && (!filter || !filter.contains(e.target))) {
                results.style.display = 'none';
            }
        }, { capture: false });
    }

    // Helper interno (si no lo tienes, añádelo arriba)
    function escapeHtml(text) {
        return (text || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ── Inicialización de Vis.js ──────────────────────────────────

    function _initNetwork(nodes, edges) {
        const container = document.getElementById('graph-canvas-container');
        if (!container) return;

        if (_network) { _network.destroy(); _network = null; }

        const visNodes = new vis.DataSet(nodes.map(_toVisNode));
        const visEdges = new vis.DataSet(edges.map(_toVisEdge));

        const options = {
            physics:     { enabled: false },
            interaction: { hover: true, multiselect: true, tooltipDelay: 300 },
            manipulation:{ enabled: false },
            nodes:       { widthConstraint: { maximum: 200 } },
            edges:       { selectionWidth: 2.5 },
        };

        _network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);

        // ── Eventos de red ──────────────────────────────────────────

        _network.on('click', (params) => {
            if (params.nodes.length === 1) {
                const targetNode = params.nodes[0];
                
                if (_edgeMode) {
                    // Lógica de creación de flechas
                    if (!_edgeSrc) {
                        _edgeSrc = targetNode;
                        _network.selectNodes([_edgeSrc]);
                    } else {
                        if (targetNode !== _edgeSrc) {
                            _customPrompt('Etiqueta de la relación (vacío = ninguna):', '', (result) => {
                                if (result !== null) _cb.onAddEdge?.(_edgeSrc, targetNode, result.trim());
                                _setEdgeMode(false);
                            });
                        } else {
                            _setEdgeMode(false);
                        }
                    }
                } else {
                    // NUEVO: Modo normal -> Dispara evento de apertura de tarjeta
                    _cb.onNodeClick?.(targetNode);
                }
            } else if (params.nodes.length === 0 && params.edges.length === 0) {
                _setEdgeMode(false);
                if (_previewPanel) _previewPanel.style.display = 'none'; // Cierra panel al clicar fuera
            }
        });

        _network.on('dragEnd', (params) => {
            if (params.nodes.length === 1) {
                const id  = params.nodes[0];
                const pos = _network.getPosition(id);
                _cb.onPositionChange?.(id, Math.round(pos.x), Math.round(pos.y));
            }
        });

        // Doble clic en arista → editar etiqueta
        _network.on('doubleClick', (params) => {
            if (params.edges.length === 1 && params.nodes.length === 0) {
                const edgeId   = params.edges[0];
                const edgeData = visEdges.get(edgeId);
                
                // USO DEL CUSTOM PROMPT PARA EDICIÓN
                _customPrompt('Nueva etiqueta:', edgeData?.label ?? '', (result) => {
                    if (result !== null) {
                        const fromId = edgeData.from;
                        const toId   = edgeData.to;
                        _cb.onRemoveEdge?.(edgeId);
                        _cb.onAddEdge?.(fromId, toId, result.trim());
                    }
                });
            }
        });
    }

    // ── API pública ───────────────────────────────────────────────

    function abrirMapa(asig, enrichedNodes, edges, tiposConfig, callbacks) {
        _cb    = callbacks;
        _tipos = tiposConfig;
        _setEdgeMode(false);

        const modal = document.getElementById('modal-graph');
        if (!modal) return;
        modal.classList.remove('hidden');

        const label = document.getElementById('graph-asig-label');
        if (label) label.textContent = asig;

        _initNetwork(enrichedNodes, edges);
        _bindSearch();

        setTimeout(() => document.getElementById('graph-search-input')?.focus(), 200);
    }

    function refreshMapa(enrichedNodes, edges, tiposConfig) {
        _tipos = tiposConfig;
        if (!_network) return;

        const body = _network.body.data;
        body.nodes.clear();
        body.edges.clear();
        body.nodes.add(enrichedNodes.map(_toVisNode));
        body.edges.add(edges.map(_toVisEdge));
    }

    function cerrarMapa() {
        document.getElementById('modal-graph')?.classList.add('hidden');
        if (_network) { _network.destroy(); _network = null; }
        _setEdgeMode(false);
    }

    function mostrarPreview(card, cardId) {
        if (!_previewPanel) {
            _previewPanel = document.createElement('div');
            _previewPanel.style.cssText = 'position:absolute; top:70px; right:20px; width:400px; max-height:calc(100% - 90px); background:var(--surface-1, #1e1e1e); border:1px solid var(--border-light, #333); border-radius:8px; box-shadow:0 12px 32px rgba(0,0,0,0.6); z-index:1000; display:flex; flex-direction:column; overflow:hidden;';
            document.getElementById('modal-graph').appendChild(_previewPanel);
        }
        
        const tipo = card.Apartado || 'Tarjeta';
        const color = _colorForTipo(tipo);

        const titulo = card.Titulo || '(Sin título)';
        const Contenido = card.Contenido ? `<div id="graph-preview-answer" style="display:none; border-top:1px dashed var(--border, #444); padding-top:16px; color:var(--text-main, #eee);">${card.Contenido}</div>` : '';

        _previewPanel.innerHTML = `
            <div style="padding:12px 16px; border-bottom:1px solid var(--border, #444); display:flex; justify-content:space-between; align-items:center; background:var(--surface-1, #1e1e1e);">
                <span style="font-size:0.85em; color:${color}; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">${tipo}</span>
                <button id="graph-preview-close" title="Cerrar panel" style="background:none; border:none; color:var(--text-muted, #aaa); cursor:pointer; font-size:1.4em; line-height:1;">&times;</button>
            </div>
            <div style="padding:20px; overflow-y:auto; flex:1; font-size:0.95em; line-height:1.6;">
                <h3 style="margin-top:0; color:var(--text-main, #fff); font-size:1.15em; margin-bottom:16px;">${titulo}</h3>
                
                ${Contenido}
            </div>
            <div style="padding:12px 16px; border-top:1px solid var(--border, #444); background:var(--surface-1, #1e1e1e); display:flex; flex-direction:column; gap:10px;">
                <button id="graph-preview-show" style="width:100%; padding:10px; background:var(--accent, #4caf50); border:none; color:#fff; border-radius:6px; cursor:pointer; font-weight:bold; transition:all 0.2s;">
                    <i class="fa-solid fa-eye"></i> Mostrar Contenido
                </button>
                
                <div id="graph-preview-rates" style="display:none; gap:6px; width:100%;">
                    <button class="btn-dif btn-dif-1" data-rate="1">1<br><span>Fácil</span></button>
                    <button class="btn-dif btn-dif-2" data-rate="2">2<br><span>Bien</span></button>
                    <button class="btn-dif btn-dif-3" data-rate="3">3<br><span>Difícil</span></button>
                    <button class="btn-dif btn-dif-4" data-rate="4">4<br><span>Mal</span></button>
                </div>
            </div>
        `;

        _previewPanel.style.display = 'flex';

        // ── CSS Dinámico para Botones Estéticos (Solución Deuda Técnica/UX) ──
        
        const ratesDiv = document.getElementById('graph-preview-rates');
        
        // Estilo base para los botones de rating (Outlined)
        const baseRateBtnStyle = `
            flex:1; padding:12px 6px; border-radius:6px; cursor:pointer; font-weight:bold; 
            font-size:0.85em; transition:all 0.2s; border:1px solid transparent; text-transform:uppercase; letter-spacing:0.5px;
            background:transparent;
        `;

        ratesDiv.querySelectorAll('.graph-btn-rate').forEach(btn => {
            const semanticVar = btn.getAttribute('data-semantic-color');
            const color = _getCssVar(semanticVar, '#888');
            const hoverColor = btn.getAttribute('data-hover-color');

            // Aplicar estilo base y color contorneado
            btn.style.cssText = baseRateBtnStyle;
            btn.style.borderColor = color;
            btn.style.color = color;

            // Efecto de relleno al hover
            btn.onmouseenter = () => {
                btn.style.background = color;
                btn.style.color = hoverColor;
            };
            btn.onmouseleave = () => {
                btn.style.background = 'transparent';
                btn.style.color = color;
            };
        });

        // ── Listeners de Interacción ──
        
        document.getElementById('graph-preview-close').onclick = () => {
            _previewPanel.style.display = 'none';
        };

        const btnShow = document.getElementById('graph-preview-show');
        const answerDiv = document.getElementById('graph-preview-answer');

        btnShow.onclick = () => {
            btnShow.style.display = 'none';
            ratesDiv.style.display = 'flex';
            if (answerDiv) answerDiv.style.display = 'block';
        };

        // Delegación de calificación
        document.querySelectorAll('.graph-btn-rate').forEach(btn => {
            btn.onclick = (e) => {
                // Obtenemos el rating nativo de la UI (ej. '1' -> 'Fácil')
                const rating = parseInt(e.target.getAttribute('data-rate'));
                _cb.onRateCard?.(cardId, rating);
                _previewPanel.style.display = 'none';
            };
        });

        // Renderizado MathJax
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
            MathJax.typesetPromise([_previewPanel]).catch(e => console.error("Error MathJax:", e));
        }
    }


    function _promptBatchDefis(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(2px);';
        
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-color, #121212); padding:20px; border-radius:8px; border:1px solid var(--border-light, #333); width:320px; box-shadow:0 8px 24px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:12px; font-family:inherit; color:var(--text-main);';
        
        box.innerHTML = `
            <h4 style="margin:0 0 10px 0; color:var(--accent);">Añadir Definiciones</h4>
            <label style="font-size:0.85em; color:var(--text-muted);">Filtrar por Tema (Opcional)</label>
            <input type="number" id="batch-tema" placeholder="Ej: 1" style="padding:10px; background:var(--surface-1); border:1px solid var(--border); color:#fff; border-radius:4px; outline:none;">
            <label style="font-size:0.85em; color:var(--text-muted); margin-top:5px;">Límite de nodos (Opcional)</label>
            <input type="number" id="batch-limit" placeholder="Ej: 5" style="padding:10px; background:var(--surface-1); border:1px solid var(--border); color:#fff; border-radius:4px; outline:none;">
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
                <button id="batch-cancel" style="padding:8px 14px; background:transparent; border:1px solid var(--border); color:var(--text-muted); border-radius:6px; cursor:pointer; font-weight:bold;">Cancelar</button>
                <button id="batch-ok" style="padding:8px 14px; background:var(--accent); border:none; color:#fff; border-radius:6px; cursor:pointer; font-weight:bold;">Añadir al mapa</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.getElementById('modal-graph').appendChild(overlay);
        
        document.getElementById('batch-tema').focus();

        const close = () => overlay.remove();
        document.getElementById('batch-cancel').onclick = close;
        
        document.getElementById('batch-ok').onclick = () => {
            const t = document.getElementById('batch-tema').value;
            const l = document.getElementById('batch-limit').value;
            close();
            callback(t ? parseInt(t) : null, l ? parseInt(l) : null);
        };

        // Soporte de teclado (Escape/Enter)
        overlay.onkeydown = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter') document.getElementById('batch-ok').click();
        };
    }



    // ── Event listeners estáticos (toolbar) ──────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('graph-btn-edge')?.addEventListener('click', () => _setEdgeMode(!_edgeMode));
        document.getElementById('graph-btn-delete')?.addEventListener('click', _deleteSelected);
        document.getElementById('graph-btn-fit')?.addEventListener('click', () => _network?.fit({ animation: { duration: 400 } }));
        
        // CORRECCIÓN: camelCase aplicado
        document.getElementById('graph-btn-close')?.addEventListener('click', cerrarMapa);
        
        document.getElementById('btn-togglegrafo')?.addEventListener('click', () => window.abrirMapaConceptual?.());
        
        document.getElementById('graph-btn-add-defis')?.addEventListener('click', () => {
            _promptBatchDefis((tema, limite) => {
                _cb.onAddDefis?.(tema, limite);
            });
        });

        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('modal-graph');
            if (!modal || modal.classList.contains('hidden')) return; 

            if (e.key === 'Escape') {
                if (_previewPanel && _previewPanel.style.display === 'flex') {
                    _previewPanel.style.display = 'none'; 
                } else {
                    cerrarMapa(); // CORRECCIÓN: camelCase aplicado
                }
                return;
            }

            if (_previewPanel && _previewPanel.style.display === 'flex') {
                if (document.activeElement?.id === 'graph-search-input') return;

                const btnShow = document.getElementById('graph-preview-show');
                const ratesDiv = document.getElementById('graph-preview-rates');

                if ((e.key === ' ' || e.key === 'Enter') && btnShow && btnShow.style.display !== 'none') {
                    e.preventDefault();
                    btnShow.click();
                } else if (ratesDiv && ratesDiv.style.display !== 'none') {
                    if (['1', '2', '3', '4'].includes(e.key)) {
                        e.preventDefault();
                        const btnCalificar = document.querySelector(`.btn-dif-${e.key}`);
                        if (btnCalificar) btnCalificar.click();
                    }
                }
            }
        });
    });

    // CORRECCIÓN: Exportación estandarizada
    return { abrirMapa, refreshMapa, cerrarMapa, mostrarPreview };
})();