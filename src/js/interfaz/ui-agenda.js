// ════════════════════════════════════════════════════════════════
// UI-AGENDA.JS — Fechas clave y eventos próximos
// ════════════════════════════════════════════════════════════════

const UIAgenda = (() => {

    function cerrarFechasModal() {
        document.getElementById('fechas-modal')?.classList.remove('visible');
    }

    function abrirFechasModal(bib, asigActual) {
        const sel = document.getElementById('fk-asig');
        if (sel) {
            sel.innerHTML = '';
            const allOpt     = document.createElement('option');
            allOpt.value     = '';
            allOpt.textContent = '— Todas las asignaturas —';
            sel.appendChild(allOpt);
            Object.keys(bib || {}).forEach(a => {
                const opt       = document.createElement('option');
                opt.value       = a;
                opt.textContent = a;
                sel.appendChild(opt);
            });
            if (asigActual) sel.value = asigActual;
        }
        document.getElementById('fechas-modal')?.classList.add('visible');
    }

    function renderFechasList(fechas) {
        const list     = document.getElementById('fechas-list');
        const emptyMsg = document.getElementById('fechas-empty');
        if (!list || !emptyMsg) return;

        list.innerHTML = '';
        if (!fechas || fechas.length === 0) {
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';

        const fragment = document.createDocumentFragment();
        fechas.forEach((fc) => {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);';

            const safeFecha  = escapeHtml(formatDateForUI(fc.fecha));
            const safeNombre = escapeHtml(fc.nombre);
            const safeTipo   = escapeHtml(fc.tipo);
            const colorTipo  = (typeof TIPOS_EVENTO !== 'undefined' && TIPOS_EVENTO[fc.tipo])
                ? TIPOS_EVENTO[fc.tipo].color || '#888'
                : '#888';

            li.innerHTML = `
                <div>
                    <strong>${safeFecha}</strong> - ${safeNombre}
                    <span style="font-size:0.8em;color:${colorTipo};border:1px solid ${colorTipo};padding:2px 4px;border-radius:3px;margin-left:6px;">${safeTipo}</span>
                </div>
                <button class="btn-icon" data-action="eliminarFechaClave" data-id="${fc.id}" style="color:var(--status-red);">
                    <i class="fa-solid fa-trash"></i>
                </button>`;
            fragment.appendChild(li);
        });
        list.appendChild(fragment);
    }

    function renderUpcomingEvents(fechas) {
        const container = document.getElementById('upcoming-events-list');
        if (!container) return;

        container.innerHTML = '';
        const hoyTs = parseDateSafe(new Date()).getTime();

        let futuros = (fechas || []).filter(fc => {
            const fv = parseDateSafe(fc.fecha);
            return fv && fv.getTime() >= hoyTs;
        });
        futuros.sort((a, b) => parseDateSafe(a.fecha).getTime() - parseDateSafe(b.fecha).getTime());

        if (futuros.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:10px;">No hay eventos próximos</div>';
            return;
        }

        futuros.slice(0, 5).forEach(ev => {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;margin-bottom:10px;';

            let iconHtml = '<i class="fas fa-calendar-alt" style="color:var(--accent);"></i>';
            if (ev.tipo === 'examen')  iconHtml = '<i class="fas fa-file-alt" style="color:var(--status-red);"></i>';
            if (ev.tipo === 'entrega') iconHtml = '<i class="fas fa-tasks" style="color:var(--status-green);"></i>';

            const safeNombre = escapeHtml(String(ev.nombre || ''));
            const fechaUI    = escapeHtml(formatDateForUI(ev.fecha));
            const diasFaltantes = diffDiasCalendario(new Date(), ev.fecha);

            let badgeHtml = '';
            if      (diasFaltantes === 0) badgeHtml = `<span style="background:var(--status-red);padding:2px 6px;border-radius:4px;font-size:0.8em;color:#fff;">HOY</span>`;
            else if (diasFaltantes === 1) badgeHtml = `<span style="background:var(--status-yellow);padding:2px 6px;border-radius:4px;font-size:0.8em;color:#fff;">Mañana</span>`;
            else                          badgeHtml = `<span style="background:var(--status-blue);padding:2px 6px;border-radius:4px;font-size:0.8em;color:#fff;">Faltan ${escapeHtml(String(diasFaltantes))}d</span>`;

            el.innerHTML = `
                <div style="margin-right:12px;font-size:1.2em;">${iconHtml}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold;color:var(--text-main);">${safeNombre}</div>
                    <div style="font-size:0.85em;color:var(--text-muted);">${fechaUI} ${badgeHtml}</div>
                </div>`;
            container.appendChild(el);
        });
    }

    return {
        cerrarFechasModal,
        abrirFechasModal,
        renderFechasList,
        renderUpcomingEvents,
    };
})();
