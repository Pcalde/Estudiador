// ════════════════════════════════════════════════════════════════
// COMMAND-REGISTRY.JS — Registro central de acciones de UI.
// Cada módulo registra sus handlers. App.js solo despacha.
// ════════════════════════════════════════════════════════════════

const CommandRegistry = (() => {
    const _commands = {};

    function register(action, handler) {
        if (_commands[action]) {
            Logger.warn(`CommandRegistry: acción '${action}' sobreescrita.`);
        }
        _commands[action] = handler;
    }

    function dispatch(action, dataset) {
        const handler = _commands[action];
        if (!handler) {
            Logger.warn(`CommandRegistry: acción '${action}' no registrada.`);
            return;
        }
        try {
            handler(dataset);
        } catch(e) {
            Logger.error(`CommandRegistry: fallo ejecutando '${action}':`, e);
        }
    }

    return { register, dispatch };
})();