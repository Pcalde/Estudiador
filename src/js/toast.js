// ════════════════════════════════════════════════════════════════
// TOAST.JS — Sistema de Notificaciones No Bloqueantes
// Arquitectura: Módulo independiente. Inyecta su propio contenedor DOM
// si no existe. Sustituye a los alert() nativos.
// ════════════════════════════════════════════════════════════════

const Toast = (() => {
    let container = null;
    const _activeProgress = {};

    function _initContainer() {
        if (container) return;
        container = document.createElement('div');
        container.id = 'toast-container';
        // Estilos en línea para aislarlo de styles.css temporalmente,
        // aunque lo ideal es mover esto al CSS principal luego.
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    function showProgress(id, msg, percentage) {
        _initContainer();
        let pToast = _activeProgress[id];

        if (!pToast) {
            // Creación del nodo si no existe (Mínimo impacto de DOM)
            const el = document.createElement('div');
            el.style.cssText = `
                background: var(--card-bg, #1e1e1e);
                color: var(--text-main, #f5f5f5);
                padding: 12px 16px;
                border-radius: 8px;
                border: 1px solid var(--border, #333);
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                min-width: 250px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                opacity: 0;
                transform: translateY(10px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                pointer-events: auto;
            `;

            el.innerHTML = `
                <span class="t-msg" style="font-size:0.9em; font-weight:500;">${escapeHtml(msg)}</span>
                <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                    <div class="t-bar" style="width:${percentage}%; height:100%; background:var(--accent, #4CAF50); transition:width 0.3s ease;"></div>
                </div>
            `;
            container.appendChild(el);

            pToast = { 
                el, 
                msgNode: el.querySelector('.t-msg'), 
                barNode: el.querySelector('.t-bar') 
            };
            _activeProgress[id] = pToast;

            // Animación de entrada
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
        } else {
            // Actualización In-Place (Evita reflows pesados)
            pToast.msgNode.innerText = msg;
            pToast.barNode.style.width = `${percentage}%`;
        }
    }

    // 3. Añadir función de destrucción
    function removeProgress(id) {
        const pToast = _activeProgress[id];
        if (pToast) {
            pToast.el.style.opacity = '0';
            pToast.el.style.transform = 'translateY(10px)';
            setTimeout(() => {
                if (pToast.el.parentNode) pToast.el.remove();
                delete _activeProgress[id];
            }, 300);
        }
    }
    function show(msg, type = 'info', duration = 3000) {
        _initContainer();

        const toast = document.createElement('div');
        
        // Resolución de colores basada en nuestras variables semánticas
        const colors = {
            info:    'var(--status-blue, #2196F3)',
            success: 'var(--status-green, #4CAF50)',
            warning: 'var(--status-yellow, #FFC107)',
            error:   'var(--status-red, #f44336)'
        };
        
        const icons = {
            info:    '<i class="fa-solid fa-circle-info"></i>',
            success: '<i class="fa-solid fa-check-circle"></i>',
            warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
            error:   '<i class="fa-solid fa-circle-xmark"></i>'
        };

        const color = colors[type] || colors.info;
        const icon  = icons[type]  || icons.info;

        toast.style.cssText = `
            background: var(--surface-1, #1e1e1e);
            color: var(--text-main, #eee);
            border-left: 4px solid ${color};
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            font-size: 0.9em;
            display: flex;
            align-items: center;
            gap: 10px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            pointer-events: auto;
        `;

        toast.innerHTML = `<span style="color:${color}; font-size:1.1em;">${icon}</span> <span>${escapeHtml(msg)}</span>`;
        
        container.appendChild(toast);

        // Animar entrada
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Auto-destrucción
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300); // Esperar a que termine la transición
        }, duration);
    }
    /**
     * Muestra una notificación interactiva que no desaparece hasta que el usuario decide.
     * @param {string} msg - Pregunta o advertencia a mostrar.
     * @param {Function} onConfirm - Callback si el usuario acepta.
     * @param {Function} [onCancel] - Callback si el usuario cancela (opcional).
     */
    function ask(msg, onConfirm, onCancel = () => {}) {
        _initContainer();

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: var(--surface-1, #1e1e1e);
            color: var(--text-main, #eee);
            border-left: 4px solid var(--status-yellow, #FFC107);
            padding: 15px 20px;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.7);
            font-size: 0.9em;
            display: flex;
            flex-direction: column;
            gap: 12px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            pointer-events: auto;
            min-width: 280px;
        `;

        toast.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:10px;">
                <span style="color:var(--status-yellow); font-size:1.2em; margin-top:2px;">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                </span> 
                <span style="line-height:1.4;">${escapeHtml(msg)}</span>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
                <button id="t-btn-cancel" style="background:transparent; border:1px solid var(--border, #444); color:var(--text-muted, #aaa); padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.9em;">
                    Cancelar
                </button>
                <button id="t-btn-ok" style="background:var(--status-yellow, #FFC107); color:#000; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.9em;">
                    Sobreescribir
                </button>
            </div>
        `;

        container.appendChild(toast);

        // Animar entrada
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        const closeToast = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('#t-btn-ok').onclick = () => { closeToast(); onConfirm(); };
        toast.querySelector('#t-btn-cancel').onclick = () => { closeToast(); onCancel(); };
    }

    return { show, ask, showProgress, 
        removeProgress };
})();

// Proxy global por si lo necesitamos desde handlers directos
window.Toast = Toast;