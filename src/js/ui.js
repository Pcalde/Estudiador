// ════════════════════════════════════════════════════════════════
// UI.JS — Compositor
// Ensambla todos los sub-módulos UI en un único namespace.
// Ninguna función vive aquí — solo la composición.
//
// Orden de carga requerido en index.html:
//   ui-core.js → ui-study.js → ui-dashboard.js → ui-editor.js
//   → ui-agenda.js → ui-settings.js → ui-sidebar.js
//   → ui-pomo.js → ui-amigos.js → ui.js (este archivo, el último)
// ════════════════════════════════════════════════════════════════

const UI = Object.assign(
    {},
    UICore,
    UIStudy,
    UIDashboard,
    UIEditor,
    UIAgenda,
    UISettings,
    UISidebar,
    UIPomo,
    UIAmigos,
    UIGraph,
    UIExamPlanner
);

// Compatibilidad: cambiarPestanaAjustes se llama directamente desde el HTML
window.cambiarPestanaAjustes = UI.cambiarPestanaAjustes;
