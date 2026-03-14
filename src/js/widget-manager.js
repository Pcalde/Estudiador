// ════════════════════════════════════════════════════════════════
// WIDGET-MANAGER.JS — Personalización del Dashboard
// Gestiona: minimizar, ocultar y reordenar widgets por drag&drop.
// Fuente de verdad: State('widgetConfig') → localStorage.
// No lee clases CSS para tomar decisiones; solo las aplica.
// ════════════════════════════════════════════════════════════════

const WidgetManager = (() => {

    const DEFAULT_ORDER = [
        'widget-pomo', 'widget-progreso', 'widget-constancia',
        'widget-distribucion', 'widget-semanal', 'widget-pronostico',
        'widget-deuda', 'widget-eficiencia', 'widget-horas',
        'widget-calendario', 'widget-pendientes'
    ];

    const WIDGET_LABELS = {
        'widget-pomo':         'Pomodoro',
        'widget-progreso':     'Progreso diario',
        'widget-constancia':   'Constancia',
        'widget-distribucion': 'Distribución',
        'widget-semanal':      'Rendimiento Semanal',
        'widget-pronostico':   'Pronóstico de Carga',
        'widget-deuda':        'Deuda de Estudio',
        'widget-eficiencia':   'Eficiencia de Sesión',
        'widget-horas':        'Actividad por Hora',
        'widget-calendario':   'Calendario',
        'widget-pendientes':   'Ventana de Pendientes',
    };

    // ── CSS inyectado una sola vez ────────────────────────────────
    const CSS = `
        .widget-controls {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
            opacity: 0;
            transition: opacity 0.15s;
            height: 18px;
        }
        .stat-widget:hover .widget-controls { opacity: 1; }

        .widget-drag-handle {
            cursor: grab;
            color: #555;
            font-size: 1.1em;
            padding: 0 4px;
            line-height: 1;
            user-select: none;
        }
        .widget-drag-handle:active { cursor: grabbing; }

        .widget-ctrl-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #555;
            font-size: 0.75em;
            padding: 2px 5px;
            border-radius: 3px;
            line-height: 1;
            transition: color 0.1s, background 0.1s;
        }
        .widget-ctrl-btn:hover { color: #ccc; background: #333; }

        /* Estado minimizado: oculta todo excepto controles y el primer stat-title */
        .stat-widget.widget-minimized > *:not(.widget-controls):not(.stat-title) {
            display: none !important;
        }
        .stat-widget.widget-minimized > .stat-title {
            margin-bottom: 0;
            opacity: 0.6;
        }
        .stat-widget.widget-minimized { padding-bottom: 8px; }

        /* Estado oculto */
        .stat-widget.widget-hidden { display: none !important; }

        /* Drag & Drop feedback */
        .stat-widget.widget-dragging {
            opacity: 0.45;
            outline: 2px dashed var(--accent, #4CAF50);
        }
        .stat-widget.widget-drag-over {
            outline: 2px solid var(--accent, #4CAF50);
            outline-offset: -2px;
        }

        /* Panel de gestión */
        #widget-manage-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 10px;
            padding: 18px;
            z-index: 9999;
            min-width: 240px;
            max-width: 300px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            display: none;
        }
        #widget-manage-panel.open { display: block; }
        #widget-manage-panel h3 {
            margin: 0 0 12px;
            font-size: 0.85em;
            color: #aaa;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .wmp-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #2a2a2a;
            font-size: 0.8em;
            color: #ccc;
        }
        .wmp-row:last-child { border-bottom: none; }
        .wmp-toggle {
            cursor: pointer;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid #444;
            background: none;
            font-size: 0.75em;
            color: #888;
            transition: all 0.15s;
        }
        .wmp-toggle.active { color: #4CAF50; border-color: #4CAF50; }
        #widget-manage-close {
            margin-top: 12px;
            width: 100%;
            padding: 6px;
            background: #2a2a2a;
            border: none;
            border-radius: 5px;
            color: #888;
            cursor: pointer;
            font-size: 0.8em;
        }
        #widget-manage-close:hover { background: #333; color: #ccc; }
    `;

    // ── Helpers de configuración ──────────────────────────────────
    function _getConfig() {
        let cfg = State.get('widgetConfig');
        if (!cfg || !cfg.order) {
            cfg = { order: [...DEFAULT_ORDER], hidden: {}, minimized: {} };
            _saveConfig(cfg);
        }
        return cfg;
    }

    function _saveConfig(cfg) {
        State.set('widgetConfig', cfg);
        localStorage.setItem('estudiador_widget_config', JSON.stringify(cfg));
    }

    // ── Aplicar estado visual desde la config ─────────────────────
    function applyLayout() {
        const cfg = _getConfig();
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        // 1. Reordenar nodos en el DOM según cfg.order
        const ordered = cfg.order
            .map(wid => col.querySelector(`[data-widget-id="${wid}"]`))
            .filter(Boolean);

        ordered.forEach(el => col.appendChild(el)); // mover al final en orden

        // 2. Aplicar clases hidden/minimized
        col.querySelectorAll('[data-widget-id]').forEach(el => {
            const wid = el.dataset.widgetId;
            el.classList.toggle('widget-hidden',    !!cfg.hidden[wid]);
            el.classList.toggle('widget-minimized', !!cfg.minimized[wid]);
        });
    }

    // ── Inyectar botones de control en cada widget ────────────────
    function _injectControls() {
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        col.querySelectorAll('[data-widget-id]').forEach(el => {
            if (el.querySelector('.widget-controls')) return; // idempotente
            const wid = el.dataset.widgetId;
            const row = document.createElement('div');
            row.className = 'widget-controls';
            row.innerHTML = `
                <span class="widget-drag-handle" title="Arrastrar para reordenar">⠿</span>
                <button class="widget-ctrl-btn" data-action="minimizeWidget" data-widget-id="${wid}" title="Minimizar/Expandir">—</button>
                <button class="widget-ctrl-btn" data-action="hideWidget" data-widget-id="${wid}" title="Ocultar widget">✕</button>
            `;
            el.prepend(row);
        });
    }

    // ── Drag & Drop ───────────────────────────────────────────────
    let _dragSrc = null;

    function _initDragDrop() {
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        col.querySelectorAll('[data-widget-id]').forEach(el => {
            const handle = el.querySelector('.widget-drag-handle');
            
            // SoC: Controlar el estado draggable dinámicamente desde el handle
            if (handle) {
                handle.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
                handle.addEventListener('mouseup', () => el.removeAttribute('draggable'));
                handle.addEventListener('mouseleave', () => el.removeAttribute('draggable'));
            } else {
                // Fallback si el widget no tiene handle definido
                el.setAttribute('draggable', 'true');
            }

            el.addEventListener('dragstart', (e) => {
                _dragSrc = el;
                e.dataTransfer.effectAllowed = 'move';
                // Obligatorio para evitar bloqueos silenciosos en Firefox/Webkit
                e.dataTransfer.setData('text/plain', el.dataset.widgetId); 
                
                requestAnimationFrame(() => el.classList.add('widget-dragging'));
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('widget-dragging');
                el.removeAttribute('draggable'); // Limpieza de estado
                col.querySelectorAll('[data-widget-id]').forEach(w => w.classList.remove('widget-drag-over'));
                _dragSrc = null;
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (_dragSrc && el !== _dragSrc) {
                    col.querySelectorAll('[data-widget-id]').forEach(w => w.classList.remove('widget-drag-over'));
                    el.classList.add('widget-drag-over');
                }
            });

            el.addEventListener('dragleave', () => {
                el.classList.remove('widget-drag-over');
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('widget-drag-over');
                if (!_dragSrc || _dragSrc === el) return;

                // Reordenar en el DOM
                const allWidgets = [...col.querySelectorAll('[data-widget-id]')];
                const srcIdx = allWidgets.indexOf(_dragSrc);
                const dstIdx = allWidgets.indexOf(el);
                
                if (srcIdx < dstIdx) el.after(_dragSrc);
                else el.before(_dragSrc);

                // Persistir nuevo orden
                const cfg = _getConfig();
                cfg.order = [...col.querySelectorAll('[data-widget-id]')].map(w => w.dataset.widgetId);
                _saveConfig(cfg);
            });
        });
    }

    // ── API pública ───────────────────────────────────────────────
    function toggleMinimize(wid) {
        const cfg = _getConfig();
        cfg.minimized = cfg.minimized || {};
        cfg.minimized[wid] = !cfg.minimized[wid];
        _saveConfig(cfg);
        applyLayout();
    }

    function toggleHide(wid) {
        const cfg = _getConfig();
        cfg.hidden = cfg.hidden || {};
        cfg.hidden[wid] = !cfg.hidden[wid];
        _saveConfig(cfg);
        applyLayout();
        _renderManagePanel(); // refrescar panel si está abierto
    }

    // ── Panel de gestión (para restaurar widgets ocultos) ─────────
    function _renderManagePanel() {
        const panel = document.getElementById('widget-manage-panel');
        if (!panel) return;
        const cfg = _getConfig();
        const rows = DEFAULT_ORDER.map(wid => {
            const isHidden = !!cfg.hidden[wid];
            return `<div class="wmp-row">
                <span>${WIDGET_LABELS[wid] || wid}</span>
                <button class="wmp-toggle ${isHidden ? '' : 'active'}"
                        data-action="restoreWidget" data-widget-id="${wid}">
                    ${isHidden ? 'Mostrar' : 'Visible'}
                </button>
            </div>`;
        }).join('');
        panel.querySelector('.wmp-body').innerHTML = rows;
    }

    function openManagePanel() {
        let panel = document.getElementById('widget-manage-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'widget-manage-panel';
            panel.innerHTML = `
                <h3>Gestionar widgets</h3>
                <div class="wmp-body"></div>
                <button id="widget-manage-close">Cerrar</button>
            `;
            document.body.appendChild(panel);
            panel.querySelector('#widget-manage-close').addEventListener('click', closeManagePanel);
        }
        _renderManagePanel();
        panel.classList.add('open');
    }
    function restaurarWidgets() {
        const cfg = _getConfig();
        cfg.order = [];  // Resetea el orden para que asuma el del DOM original
        cfg.hidden = []; // Vacía la lista de widgets minimizados/eliminados
        _saveConfig(cfg);
        location.reload(); // Recarga en frío para garantizar la reconstrucción estructural del DOM
    }

    function closeManagePanel() {
        const panel = document.getElementById('widget-manage-panel');
        if (panel) panel.classList.remove('open');
    }

    // ── Inicialización ────────────────────────────────────────────
    function init() {
        // Inyectar CSS
        if (!document.getElementById('widget-manager-styles')) {
            const style = document.createElement('style');
            style.id = 'widget-manager-styles';
            style.textContent = CSS;
            document.head.appendChild(style);
        }

        _injectControls();
        applyLayout();
        _initDragDrop();
    }

    return {
        init,
        toggleMinimize,
        toggleHide,
        applyLayout,
        openManagePanel,
        closeManagePanel,
        restaurarWidgets,
    };
})();

// Proxy global para abrir el panel desde cualquier botón en el HTML
window.openWidgetManagePanel = () => WidgetManager.openManagePanel();
