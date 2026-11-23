// El espacio queda fijado durante toda la vida de la página, incluso en operaciones asíncronas.
const Perfil = (() => {
    const marcador = 'estudiador:perfil-activo';
    const cuenta = sessionStorage.getItem(marcador);
    const prefijo = cuenta ? 'perfil/' + encodeURIComponent(cuenta) + '/' : '';
    let autorizar;
    const listo = cuenta ? new Promise(resolve => { autorizar = resolve; }) : Promise.resolve();
    if (cuenta) document.documentElement.style.visibility = 'hidden';

    function almacen(storage) {
        return {
            getItem: key => storage.getItem(prefijo + key),
            setItem: (key, value) => storage.setItem(prefijo + key, value),
            removeItem: key => storage.removeItem(prefijo + key),
            clear() {
                const keys = Object.keys(storage).filter(key => prefijo ? key.startsWith(prefijo) :
                    /^(estudiador_|estudiador:feynman:|pomo_|mc_history_)/.test(key));
                for (const key of keys) storage.removeItem(key);
            }
        };
    }

    function activar(destino) {
        if (cuenta !== destino) {
            document.documentElement.style.visibility = 'hidden';
            if (destino) sessionStorage.setItem(marcador, destino);
            else sessionStorage.removeItem(marcador);
            location.reload();
            return false;
        }
        autorizar?.();
        document.documentElement.style.visibility = '';
        return true;
    }

    return { cuenta, listo, activar, local: almacen(localStorage), sesion: almacen(sessionStorage),
        nombreDB: cuenta ? 'EstudiadorProDB/' + encodeURIComponent(cuenta) : 'EstudiadorProDB' };
})();
