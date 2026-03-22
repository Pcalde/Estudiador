// ════════════════════════════════════════════════════════════════
// WIDGET-MANAGER.JS — Orquestador Visual del Dashboard
// Arquitectura: Reordenamiento inmutable basado en CSS Flexbox (order).
// Cero destrucción de nodos en caliente. Sin location.reload().
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

    // ── Lectura/Escritura de Estado ───────────────────────────────
    function _getConfig() {
        let cfg = State.get('widgetConfig');
        if (!cfg || !cfg.order) {
            cfg = Util.loadLS('estudiador_widget_config', { order: [...DEFAULT_ORDER], hidden: {}, minimized: {} });
        }
        
        // Saneamiento de seguridad: asegurar que todos los defaults existan en caso de array corrupto
        const validOrder = cfg.order.filter(id => DEFAULT_ORDER.includes(id));
        DEFAULT_ORDER.forEach(id => { if (!validOrder.includes(id)) validOrder.push(id); });
        cfg.order = validOrder;

        return cfg;
    }

    function _saveConfig(cfg) {
        State.set('widgetConfig', cfg);
        localStorage.setItem('estudiador_widget_config', JSON.stringify(cfg));
    }

    // ── Motor Visual: Reordenamiento Virtual (Flexbox) ────────────
    function applyLayout() {
        const cfg = _getConfig();
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        col.querySelectorAll('[data-widget-id]').forEach(el => {
            const wid = el.dataset.widgetId;
            const index = cfg.order.indexOf(wid);
            
            // REGLA ARQUITECTÓNICA: Usamos el motor de renderizado CSS en lugar de arrancar nodos del DOM
            el.style.order = index !== -1 ? index : 99;
            el.classList.toggle('widget-hidden', !!(cfg.hidden && cfg.hidden[wid]));
            el.classList.toggle('widget-minimized', !!(cfg.minimized && cfg.minimized[wid]));
        });
    }

    // ── Inyección de Controles ────────────────────────────────────
    function _injectControls() {
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        col.querySelectorAll('[data-widget-id]').forEach(el => {
            if (el.querySelector('.widget-controls')) return; 
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

    // ── Motor de Drag & Drop (Virtualizado) ───────────────────────
    let _dragSrc = null;

    function _initDragDrop() {
        const col = document.getElementById('dashboard-col');
        if (!col) return;

        col.querySelectorAll('[data-widget-id]').forEach(el => {
            const handle = el.querySelector('.widget-drag-handle');
            
            if (handle) {
                handle.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
                handle.addEventListener('mouseup', () => el.removeAttribute('draggable'));
                handle.addEventListener('mouseleave', () => el.removeAttribute('draggable'));
            } else {
                el.setAttribute('draggable', 'true');
            }

            el.addEventListener('dragstart', (e) => {
                _dragSrc = el;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', el.dataset.widgetId); 
                requestAnimationFrame(() => el.classList.add('widget-dragging'));
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('widget-dragging');
                el.removeAttribute('draggable'); 
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

                // FIX ARQUITECTÓNICO: Computamos el nuevo orden en el array (Lógica Pura)
                const cfg = _getConfig();
                const srcId = _dragSrc.dataset.widgetId;
                const dstId = el.dataset.widgetId;

                // Eliminamos el widget de su posición original
                let newOrder = cfg.order.filter(id => id !== srcId); 
                
                // Encontramos la posición de destino y lo insertamos
                const dstIndex = newOrder.indexOf(dstId);
                newOrder.splice(dstIndex, 0, srcId);

                cfg.order = newOrder;
                _saveConfig(cfg);
                
                // Aplicamos el redibujado ordenado sin tocar la estructura de nodos HTML
                applyLayout();
            });
        });
    }

    // ── API Pública (Mutaciones Visuales) ─────────────────────────
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
        _renderManagePanel(); 
    }

    // ── Modal de Gestión (Restaurador) ────────────────────────────
    function _renderManagePanel() {
        const panel = document.getElementById('widget-manage-panel');
        if (!panel) return;
        const cfg = _getConfig();
        const rows = DEFAULT_ORDER.map(wid => {
            const isHidden = !!(cfg.hidden && cfg.hidden[wid]);
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
        // FIX: Reconstrucción de estado sin recurrir a location.reload()
        const cfg = { order: [...DEFAULT_ORDER], hidden: {}, minimized: {} };
        _saveConfig(cfg);
        applyLayout();
        _renderManagePanel();
        
        // Forzar repintado dinámico de las gráficas de telemetría en la capa subyacente
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
    }

    function closeManagePanel() {
        const panel = document.getElementById('widget-manage-panel');
        if (panel) panel.classList.remove('open');
    }

    // ── Inicialización del Módulo ─────────────────────────────────
    function init() {
        // Asegurar que el layout base contenga la propiedad Flex obligatoria
        const col = document.getElementById('dashboard-col');
        if (col && window.getComputedStyle(col).display !== 'flex') {
            col.style.display = 'flex';
            col.style.flexDirection = 'column';
        }

        _injectControls();
        applyLayout();
        _initDragDrop();
    }

    return {
        init, toggleMinimize, toggleHide, applyLayout,
        openManagePanel, closeManagePanel, restaurarWidgets
    };
})();

window.openWidgetManagePanel = () => WidgetManager.openManagePanel();

CommandRegistry.register('minimizeWidget',         ({widgetId}) => WidgetManager.toggleMinimize(widgetId));
CommandRegistry.register('hideWidget',             ({widgetId}) => WidgetManager.toggleHide(widgetId));
CommandRegistry.register('restoreWidget',          ({widgetId}) => WidgetManager.toggleHide(widgetId));
CommandRegistry.register('restaurarWidgetsOcultos',()           => WidgetManager.restaurarWidgets());