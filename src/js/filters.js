// ════════════════════════════════════════════════════════════════
// FILTERS.JS — Gestión de filtros de la cola de estudio
// Dependencias globales: State, UI, Logger, Util
// ════════════════════════════════════════════════════════════════

function abrirModalFiltros() {
    const grid       = document.getElementById('filtro-tipo-grid');
    const tiposConfig = State.get('tiposTarjeta') || {};

    // Construir chips de tipo solo la primera vez
    if (grid && grid.children.length === 0) {
        Object.entries(tiposConfig).forEach(([t, config]) => {
            const c   = config.color;
            const lbl = document.createElement('label');
            lbl.style.cssText = `display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.78em;`
                + `padding:4px 10px;border:1px solid ${c}55;border-radius:12px;`
                + `color:${c};background:${c}15;user-select:none;transition:background 0.15s;`;
            lbl.onmouseover = () => lbl.style.background = `${c}30`;
            lbl.onmouseout  = () => lbl.style.background = lbl.querySelector('input').checked ? `${c}30` : `${c}15`;

            const cb = document.createElement('input');
            cb.type  = 'checkbox';
            cb.value = t;
            cb.style.accentColor = c;
            cb.onchange = () => {
                lbl.style.background = cb.checked ? `${c}30` : `${c}15`;
                if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
            };
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(t));
            grid.appendChild(lbl);
        });
    }
    Util.toggleModal('modal-filtros', true);
}

function cerrarModalFiltros() {
    Util.toggleModal('modal-filtros', false);
}

/** Alias para compatibilidad con referencias antiguas. */
function toggleFiltrosDropdown() { abrirModalFiltros(); }

function toggleIconoFiltro(iconId, activeColor) {
    const cbId    = 'check-filtro-' + iconId.replace('icon-', '');
    const checked = document.getElementById(cbId)?.checked;
    const icon    = document.getElementById(iconId);
    if (icon) icon.style.color = checked ? activeColor : '#555';
}

function limpiarFiltros() {
    ['icon-hoy', 'icon-nuevas', 'icon-tema', 'icon-rango', 'icon-tipo', 'icon-dificultad'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.color = '#555';
    });

    ['check-filtro-hoy', 'check-filtro-nuevas', 'check-filtro-tema',
     'check-filtro-rango', 'check-filtro-tipo', 'check-filtro-dificultad',
     'check-dif-1', 'check-dif-2', 'check-dif-3', 'check-dif-4'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });

    ['filtro-tema-val', 'filtro-rango-val'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const tiposConfig = State.get('tiposTarjeta') || {};
    document.querySelectorAll('#filtro-tipo-grid input').forEach(cb => {
        cb.checked = false;
        const lbl   = cb.closest('label');
        const color = tiposConfig[cb.value]?.color || '#888';
        if (lbl) lbl.style.background = `${color}15`;
    });

    if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
}

function toggleFiltrosUI() {
    document.getElementById('filters-container')?.classList.toggle('filters-active');
}
