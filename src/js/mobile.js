// ════════════════════════════════════════════════════════════════
// MOBILE.JS — Navegación y layout móvil
// Dependencias globales: Logger, abrirAjustes (settings.js / app.js)
// ════════════════════════════════════════════════════════════════

function simularClickVisual(selector) {
    try {
        const el = document.querySelector(selector);
        if (el) {
            el.classList.add('simulated-active');
            setTimeout(() => el.classList.remove('simulated-active'), 150);
        }
    } catch (e) { Logger.warn("Error visual:", e); }
}

function feedbackVisualSimple(el) {
    if (el) {
        el.style.color = "var(--accent)";
        setTimeout(() => el.style.color = "", 200);
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn     = document.getElementById('sidebar-toggle');
    sidebar.classList.toggle('collapsed');
    if (btn) btn.innerText = sidebar.classList.contains('collapsed') ? '▶' : '◀';
}

function toggleMobileMenu() {
    const sidebar   = document.getElementById('sidebar');
    const dashboard = document.getElementById('dashboard-col');
    dashboard.classList.remove('mobile-active');
    sidebar.classList.toggle('mobile-open');
}

function manejarNavegacionMovil(target, btnElement) {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const sidebar   = document.getElementById('sidebar');
    const dashboard = document.getElementById('dashboard-col');

    switch (target) {
        case 'study':
            sidebar.classList.remove('mobile-open');
            dashboard.classList.remove('mobile-active');
            break;
        case 'sidebar':
            dashboard.classList.remove('mobile-active');
            sidebar.classList.add('mobile-open');
            break;
        case 'dashboard':
            sidebar.classList.remove('mobile-open');
            dashboard.classList.add('mobile-active');
            if (typeof window.updateDashboard === 'function') window.updateDashboard();
            break;
        case 'settings':
            if (typeof abrirAjustes === 'function') abrirAjustes();
            break;
    }
}

function toggleMobileStats() {
    const sidebar   = document.getElementById('sidebar');
    const dashboard = document.getElementById('dashboard-col');
    sidebar.classList.remove('mobile-open');
    if (dashboard.classList.contains('mobile-active')) {
        dashboard.classList.remove('mobile-active');
    } else {
        dashboard.classList.add('mobile-active');
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
    }
}

function cerrarPanelesMoviles() {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('dashboard-col')?.classList.remove('mobile-active');
}

CommandRegistry.register('nav-mobile',    ({target}) => manejarNavegacionMovil(target));
CommandRegistry.register('abrir-ajustes', ()         => { manejarNavegacionMovil('study'); window.abrirAjustes(); });
CommandRegistry.register('toggle-pomodoro', () => {
    manejarNavegacionMovil('study');
    const pomoCard = document.getElementById('pomodoro-card');
    if (pomoCard) { pomoCard.classList.remove('collapsed'); pomoCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});