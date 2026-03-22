// ════════════════════════════════════════════════════════════════
// LOGGER.JS — Telemetría interna. DEBE ser el primer script cargado.
// ════════════════════════════════════════════════════════════════
const Logger = (() => {
    const MAX = 200;
    const _log = [];

    function _push(level, ...args) {
        const entry = {
            ts:    new Date().toISOString(),
            level,
            msg:   args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
        };
        _log.push(entry);
        if (_log.length > MAX) _log.shift();
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(`[${level.toUpperCase()}]`, ...args);
    }

    return {
        info:    (...a) => _push('info',  ...a),
        warn:    (...a) => _push('warn',  ...a),
        error:   (...a) => _push('error', ...a),
        getLogs: ()     => [..._log],
        dump:    ()     => { console.table(_log.slice(-50)); }
    };
})();