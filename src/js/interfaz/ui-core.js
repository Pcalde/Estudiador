// ════════════════════════════════════════════════════════════════
// UI-CORE.JS — Funciones base de UI: visibilidad, sesión, chat
// Cargado antes de: todos los demás ui-*.js
// ════════════════════════════════════════════════════════════════

const UICore = (() => {

    function ocultarTodo() {
        ['welcome-screen', 'study-card', 'editor-card', 'import-card', 'json-editor-card'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    }

    function revelar() {
        document.getElementById('area-revelar')?.classList.add('hidden');
        document.getElementById('concepto-contenido')?.classList.remove('hidden');
        document.getElementById('controles-respuesta')?.classList.remove('hidden');
        document.getElementById('btn-ocultar')?.classList.remove('hidden');
    }

    function ocultarRespuesta() {
        document.getElementById('concepto-contenido')?.classList.add('hidden');
        document.getElementById('controles-respuesta')?.classList.add('hidden');
        document.getElementById('btn-ocultar')?.classList.add('hidden');
        document.getElementById('area-revelar')?.classList.remove('hidden');
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    function renderTarjetaVacia() {
        const tit = document.getElementById('concepto-titulo');
        if (tit) { tit.className = ''; tit.innerText = 'Sin tarjetas'; }
        const cont = document.getElementById('concepto-contenido');
        if (cont) {
            cont.innerHTML = "<p style='color:#888;text-align:center;'>No hay contenido para este filtro.</p>";
            cont.classList.remove('hidden');
        }
        document.getElementById('area-revelar')?.classList.add('hidden');
        document.getElementById('controles-respuesta')?.classList.add('hidden');
        const metaTema = document.getElementById('meta-tema');
        const metaFecha = document.getElementById('meta-fecha');
        if (metaTema)  metaTema.innerText  = '-';
        if (metaFecha) metaFecha.innerText = '-';
    }

    function toggleDashboardVisibility(isVisible) {
        const col = document.getElementById('dashboard-col');
        if (col) col.classList.toggle('hidden', !isVisible);
    }

    function agregarMensajeChat(role, text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `chat-msg ${role}`;
        let html = escapeHtml(text).replace(/\n/g, '<br>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        div.innerHTML = html;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        if (typeof MathJax !== 'undefined') MathJax.typesetPromise([div]).catch(() => null);
    }

    function showResumenSesion(sesion, deudaAhora) {
        const tarjetas  = Number(sesion.tarjetas) || 0;
        const pctFacil  = tarjetas > 0 ? Math.round((Number(sesion.faciles) / tarjetas) * 100) : 0;
        const deltaDeuda = Number(sesion.deudaInicial) - Number(deudaAhora);

        const elTarjetas = document.getElementById('rsm-tarjetas');
        const elFacil    = document.getElementById('rsm-facilidad');
        const deudaEl    = document.getElementById('rsm-deuda');

        if (elTarjetas) elTarjetas.innerText = escapeHtml(String(tarjetas));
        if (elFacil)    elFacil.innerText    = tarjetas > 0 ? escapeHtml(String(pctFacil)) + '%' : '-';

        if (deudaEl) {
            if (deltaDeuda > 0) {
                deudaEl.innerText    = '-' + escapeHtml(String(deltaDeuda));
                deudaEl.style.color  = 'var(--status-green)';
            } else if (deltaDeuda < 0) {
                deudaEl.innerText    = '+' + escapeHtml(String(Math.abs(deltaDeuda)));
                deudaEl.style.color  = 'var(--status-red)';
            } else {
                deudaEl.innerText    = '=';
                deudaEl.style.color  = 'var(--text-muted)';
            }
        }

        let breakdownHtml = '';
        if (tarjetas > 0) {
            const parts = [];
            const f = Number(sesion.faciles)   || 0;
            const d = Number(sesion.dificiles) || 0;
            const c = Number(sesion.criticas)  || 0;
            const b = tarjetas - f - d - c;
            if (f > 0) parts.push(`🟢 Fáciles: <strong>${escapeHtml(String(f))}</strong>`);
            if (b > 0) parts.push(`🟡 Bien: <strong>${escapeHtml(String(b))}</strong>`);
            if (d > 0) parts.push(`🟠 Difíciles: <strong>${escapeHtml(String(d))}</strong>`);
            if (c > 0) parts.push(`🔴 Críticas: <strong>${escapeHtml(String(c))}</strong>`);
            breakdownHtml = parts.join(' &nbsp;·&nbsp; ');
        }
        const bkEl = document.getElementById('rsm-breakdown');
        if (bkEl) bkEl.innerHTML = breakdownHtml;

        const mensajes = [
            [0,        'Pomodoro completado. ¡Descansa!'],
            [5,        'Sesión ligera. Cada tarjeta cuenta.'],
            [15,       'Buena sesión. ¡Sigue el ritmo!'],
            [30,       'Sesión intensa. Mereces el descanso.'],
            [Infinity, '¡Bestia! Sesión excepcional.']
        ];
        const msg = mensajes.find(([limit]) => tarjetas <= limit);
        const msgEl = document.getElementById('rsm-mensaje');
        if (msgEl && msg) msgEl.innerText = escapeHtml(msg[1]);

        const modal = document.getElementById('resumen-sesion-modal');
        if (modal) modal.classList.add('visible');
    }

    function cerrarResumenSesion() {
        document.getElementById('resumen-sesion-modal')?.classList.remove('visible');
    }
    renderizarMatematicas: async (nodo) => {
        if (!nodo) return;
        
        // Prevención estricta: Si MathJax v3 aún no ha instanciado sus métodos, ignoramos la mutación.
        // El escáner automático de arranque de MathJax procesará el DOM pendiente en cuanto el CDN termine.
        if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise === 'function') {
            try {
                if (typeof MathJax.typesetClear === 'function') {
                    MathJax.typesetClear([nodo]);
                }
                await MathJax.typesetPromise([nodo]);
            } catch (err) {
                if (typeof Logger !== 'undefined') Logger.warn("UI MathJax Render Error:", err);
            }
        }
    }

    return {
        ocultarTodo,
        revelar,
        ocultarRespuesta,
        renderTarjetaVacia,
        toggleDashboardVisibility,
        agregarMensajeChat,
        showResumenSesion,
        cerrarResumenSesion,
    };
})();
