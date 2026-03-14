// ════════════════════════════════════════════════════════════════
// EVENT-BUS.JS — Sistema centralizado de mensajería (Pub/Sub)
// ════════════════════════════════════════════════════════════════
const EventBus = (() => {
    const _listeners = {};

    return {
        on(event, callback) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(callback);
        },
        emit(event, payload = {}) {
            if (!_listeners[event]) return;
            _listeners[event].forEach(cb => {
                try { 
                    cb(payload); 
                } catch (e) { 
                    if(typeof Logger !== 'undefined') Logger.error(`EventBus [${event}]:`, e); 
                }
            });
        },
        off(event, callback) {
            if (!_listeners[event]) return;
            _listeners[event] = _listeners[event].filter(cb => cb !== callback);
        }
    };
})();