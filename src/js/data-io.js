// ════════════════════════════════════════════════════════════════
// DATA-IO.JS — Gestor de Entrada/Salida de Datos
// Encapsula la importación, exportación, backups y telemetría.
// Arquitectura: Usa State.get/set para datos. Recibe callbacks 
// para orquestación de UI/Persistencia vía init().
// ════════════════════════════════════════════════════════════════

const DataIO = (() => {

    function nuevoId() {
        return globalThis.crypto?.randomUUID?.() || 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    }

    function normalizarTarjetas(cards, ids = new Set(), validar = true) {
        if (!Array.isArray(cards)) throw new Error('Se esperaba una lista de tarjetas.');
        return cards.map((card, index) => {
            if (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('Tarjeta invalida en fila ' + (index + 1));
            if (validar && (typeof card.Titulo !== 'string' || typeof card.Contenido !== 'string' ||
                (card.Apartado != null && typeof card.Apartado !== 'string'))) {
                throw new Error('Revisa titulo, contenido y apartado de la tarjeta ' + (index + 1));
            }
            let id = card.id;
            if (typeof id !== 'string' || !id.trim() || ids.has(id)) {
                do { id = nuevoId(); } while (ids.has(id));
            }
            ids.add(id);
            return id === card.id ? card : { ...card, id };
        });
    }

    function normalizarBiblioteca(biblioteca, validar = true) {
        if (!biblioteca || typeof biblioteca !== 'object' || Array.isArray(biblioteca)) throw new Error('Biblioteca invalida.');
        const ids = new Set();
        return Object.fromEntries(Object.entries(biblioteca).map(([nombre, cards]) => [nombre, normalizarTarjetas(cards, ids, validar)]));
    }

    function migrarIdsMapa(mapa, original, normalizada) {
        if (typeof Graph === 'undefined') return mapa;
        return Object.fromEntries(Object.entries(mapa).map(([nombre, grafo]) => {
            const cambios = new Map();
            (original[nombre] || []).forEach((card, i) => {
                const antes = Graph._cardId(card, nombre);
                if (!cambios.has(antes)) cambios.set(antes, normalizada[nombre][i].id);
            });
            const id = value => cambios.get(String(value)) ?? value;
            const nodo = n => ({ ...n, id: id(n.id) });
            function migrarMapa(m) {
                const actualizado = {
                    ...m,
                    nodes: (m.nodes || []).map(nodo),
                    edges: (m.edges || []).map(e => ({ ...e, source: id(e.source), target: id(e.target) }))
                };
                if (m.islandNames) actualizado.islandNames = Object.fromEntries(
                    Object.entries(m.islandNames).map(([clave, titulo]) => [id(clave), titulo])
                );
                if (m.layoutUndo) actualizado.layoutUndo = m.layoutUndo.map(paso => paso.map(nodo));
                return actualizado;
            }
            const activo = migrarMapa(grafo);
            if (grafo.maps) activo.maps = grafo.maps.map(migrarMapa);
            return [nombre, activo];
        }));
    }

    function idsOtrasAsignaturas(biblioteca, asig) {
        return new Set(Object.entries(biblioteca).filter(([nombre]) => nombre !== asig).flatMap(([, cards]) => cards.map(c => c.id)));
    }

    async function guardarBiblioteca(biblioteca, guardarCopiaPrevia = false) {
        if (guardarCopiaPrevia) {
            const previa = await tomarCopia();
            await DB.setVars({ biblioteca, copiaPreviaRestauracion: previa });
        } else {
            await DB.setVar('biblioteca', biblioteca);
        }
        State.set('biblioteca', biblioteca);
    }

    function _descargar(uri, nombreArchivo) {
        const a = document.createElement('a');
        a.href = uri;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function procesarImportacionLatex(rawInput, temaDefault) {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) throw new Error("Selecciona una asignatura primero.");

        // Saneamiento Léxico: Despliega las macros dinámicas en llaves seguras para MathJax
        // y elimina las definiciones del preámbulo para evitar inyecciones anómalas en parser.js
        const sanitizedInput = rawInput
            .replace(/\\newcommand\{\\cajaeq\}[\s\S]*?\\usepackage\[most\]\{tcolorbox\}/g, '')
            .replace(/\\newtcbox\{\\cajapaso\}[\s\S]*?right=1pt\}/g, '')
            .replace(/\\cajaeq(?:\[[^\]]*\])?\{/g, '{')
            .replace(/\\cajapaso\{/g, '{');

        const newCards = (typeof Parser !== 'undefined') ? Parser.parseLatexToCards(sanitizedInput, temaDefault) : [];
        if (!newCards.length) throw new Error('No se detectaron tarjetas LaTeX.');
        const biblioteca = State.get('biblioteca') || {};
        const actuales = biblioteca[asigActual] || [];

        // Obtener fecha hoy de forma segura
        const hoy = (typeof window.getFechaHoy === 'function') ? window.getFechaHoy() : new Date().toISOString().slice(0, 10);

        // Tipos base que devuelve el parser
        const titulosGenericos = ['Definición', 'Teorema', 'Proposición', 'Lema', 'Corolario', 'Nota', 'Ejemplo', 'Concepto', 'Axioma','Ejercicio', 'Observación', 'Demostración'];
        let aProcesarPorIA = 0;

        newCards.forEach(c => {
            const tituloBase = c.Titulo.replace(' (Auto)', '').trim();

            if (titulosGenericos.includes(tituloBase)) {
                c._needsAutoTitle = true; 
                c.Titulo = "Generando título... (IA)"; 
                aProcesarPorIA++;
            }
            
            c.Dificultad = 2; 
            c.ProximoRepaso = hoy;
        });

        const tarjetas = normalizarTarjetas([...actuales, ...newCards], idsOtrasAsignaturas(biblioteca, asigActual));
        await guardarBiblioteca({ ...biblioteca, [asigActual]: tarjetas });
        return { count: newCards.length, conIA: aProcesarPorIA, asignatura: asigActual };
    }

    // 2. CREACIÓN DE ASIGNATURA (Operación de datos pura)
    function crearNuevaAsignatura(nombre) {
        const nombreLimpio = nombre.trim();
        let biblioteca = State.get('biblioteca') || {};
        
        if (biblioteca[nombreLimpio]) {
            return { success: false, error: "Ya existe una asignatura con este nombre." };
        }
        
        State.batch(() => {
            biblioteca[nombreLimpio] = []; 
            State.set('biblioteca', biblioteca);
            State.set('nombreAsignaturaActual', nombreLimpio);
        });
        
        EventBus.emit('DATA_REQUIRES_SAVE');
        EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: nombreLimpio });
        
        return { success: true, nombre: nombreLimpio };
    }

    // 2. IMPORTACIÓN JSON
    async function procesarImportacion(raw) {
        const asig = State.get('nombreAsignaturaActual');
        if (!asig) throw new Error('Selecciona una asignatura primero.');
        const biblioteca = State.get('biblioteca') || {};
        const actuales = biblioteca[asig] || [];
        const ids = idsOtrasAsignaturas(biblioteca, asig);
        actuales.forEach(card => ids.add(card.id));
        const tarjetas = normalizarTarjetas(JSON.parse(raw), ids);
        await guardarBiblioteca({ ...biblioteca, [asig]: [...actuales, ...tarjetas] });
        return tarjetas.length;
    }

    // 3. GESTIÓN DE ASIGNATURAS
    async function guardarEdicionJSON(rawJsonString) {
        const asigActual = State.get('nombreAsignaturaActual');
        try {
            if (!asigActual) throw new Error('Selecciona una asignatura primero.');
            const biblioteca = State.get('biblioteca') || {};
            const parsed = normalizarTarjetas(JSON.parse(rawJsonString), idsOtrasAsignaturas(biblioteca, asigActual))
                .map((card, index) => ({ ...card, IndiceGlobal: index + 1 }));
            if (!confirm('¿Reemplazar las ' + biblioteca[asigActual].length + ' tarjetas de ' + asigActual +
                ' por las ' + parsed.length + ' del editor? Se conservará una copia previa.')) {
                return { success: false, cancelada: true };
            }
            await guardarBiblioteca({ ...biblioteca, [asigActual]: parsed }, true);
            if (State.get('nombreAsignaturaActual') === asigActual) {
                EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: asigActual });
            }
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function descargarAsignaturaActual() {
        const asig = State.get('nombreAsignaturaActual');
        const bib = State.get('biblioteca') || {};
        if (!asig || !bib[asig]) return;
        const blob = new Blob([JSON.stringify(bib[asig], null, 2)], { type: 'application/json' });
        _descargar(URL.createObjectURL(blob), `${asig}_backup.json`);
    }

    const clavesDB = ['biblioteca', 'bibliotecaConfig', 'graphData', 'planificador_pro', 'horarioGlobal', 'fechasClave', 'planner_sessions'];
    const clavesLocales = [
        'estudiador_asig_actual', 'estudiador_proyectos', 'pomo_tasks', 'pomo_settings', 'planner_session_outbox',
        'pomo_history', 'pomo_details_history', 'pomo_hora_history', 'pomo_log_today',
        'estudiador_historial_examenes', 'estudiador_recursos', 'estudiador_biblioteca_config',
        'estudiador_planificador_pro', 'estudiador_colores', 'estudiador_tipos_tarjeta',
        'estudiador_widget_config', 'estudiador_paleta_global', 'estudiador_apariencia',
        'estudiador_sound_settings', 'estudiador_ambient_track', 'estudiador_reward_track',
        'estudiador_hard_track', 'estudiador_alarm_track', 'estudiador_privacy_stats'
    ];

    async function tomarCopia() {
        const { datos, repasos } = await DB.leerCopia(clavesDB);
        datos.biblioteca ??= {};
        const local = Object.fromEntries(clavesLocales.map(key => [key, Perfil.local.getItem(key)]));
        return { formato: 'Estudiador', version: 1, datos, local, repasos };
    }

    async function exportarBackup(anterior = false) {
        try {
            const copia = anterior ? await DB.getVar('copiaPreviaRestauracion') : await tomarCopia();
            if (!copia) return Toast.show('Todavía no hay una copia anterior a un reemplazo.', 'info');
            const blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            _descargar(url, (anterior ? 'Estudiador_anterior_' : 'Estudiador_') + Date.now() + '.json');
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { Toast.show('No se pudo exportar la copia: ' + error.message, 'error'); }
    }

    // Liberar primero las claves modificadas permite deshacer incluso al alcanzar la cuota.
    function escribirLocales(entries) {
        const cambios = entries.filter(([key, value]) => Perfil.local.getItem(key) !== value);
        for (const [key] of cambios) Perfil.local.removeItem(key);
        for (const [key, value] of cambios) {
            if (value !== null) Perfil.local.setItem(key, value);
        }
    }

    async function revertirRestauracionPendiente() {
        const pendientes = await DB.getVar('restauracionPendiente');
        if (pendientes) {
            escribirLocales(pendientes);
            await DB.setVar('restauracionPendiente', null);
        }
    }

    function conBloqueoRestauracion(fn) {
        return globalThis.navigator?.locks ? navigator.locks.request('estudiador-restaurar', fn) : fn();
    }

    async function aplicarRestauracion(datos, locales, repasos, comprobar = () => {}) {
        await conBloqueoRestauracion(async () => {
            await revertirRestauracionPendiente();
            const previa = await tomarCopia();
            const cambios = locales.filter(([key, value]) => previa.local[key] !== value);
            if (cambios.length) {
                await DB.setVar('restauracionPendiente', cambios.map(([key]) => [key, previa.local[key]]));
            }
            try {
                comprobar();
                escribirLocales(cambios);
                await DB.setVars({ ...datos, copiaPreviaRestauracion: previa, restauracionPendiente: null }, repasos);
            } catch (error) {
                await revertirRestauracionPendiente();
                throw error;
            }
        });
    }

    async function importarBackup(el) {
        const file = el.files[0];
        if (!file || el.disabled) return;
        el.disabled = true;
        try {
            const raw = JSON.parse(await file.text());
            const completa = raw?.formato === 'Estudiador';
            if (completa && (raw.version !== 1 || !Array.isArray(raw.repasos) ||
                !clavesDB.filter(key => key !== 'planner_sessions').every(key => Object.hasOwn(raw.datos || {}, key)) ||
                !clavesLocales.filter(key => key !== 'planner_session_outbox').every(key => Object.hasOwn(raw.local || {}, key)))) {
                throw new Error('Formato de copia no compatible.');
            }
            const datos = completa ? Object.fromEntries(clavesDB.map(key => [key, raw.datos[key] ?? null])) : { biblioteca: raw };
            const original = datos.biblioteca ?? (completa ? {} : raw);
            datos.biblioteca = normalizarBiblioteca(original);

            const locales = completa ? clavesLocales.map(key => [key, raw.local[key] ?? null]) : [];
            const listas = ['estudiador_proyectos', 'pomo_tasks', 'estudiador_historial_examenes', 'planner_session_outbox'];
            const texto = ['estudiador_asig_actual', 'estudiador_ambient_track', 'estudiador_reward_track',
                'estudiador_alarm_track', 'estudiador_hard_track', 'estudiador_privacy_stats'];
            for (const [key, value] of locales) {
                if (value === null) continue;
                if (typeof value !== 'string') throw new Error('Valor inválido: ' + key);
                if (texto.includes(key)) continue;
                const parsed = JSON.parse(value);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) !== listas.includes(key)) {
                    throw new Error('Valor inválido: ' + key);
                }
            }
            for (const [key, value] of Object.entries(datos)) {
                if (value !== null && (typeof value !== 'object' || Array.isArray(value) !== (key === 'fechasClave'))) {
                    throw new Error('Datos inválidos: ' + key);
                }
            }
            if (datos.graphData) datos.graphData = migrarIdsMapa(datos.graphData, original, datos.biblioteca);
            const repasos = completa ? raw.repasos : undefined;
            if (repasos !== undefined && (!Array.isArray(repasos) || repasos.some(log => !log || !Number.isInteger(log.id)))) {
                throw new Error('Historial de repasos inválido.');
            }
            if (repasos && new Set(repasos.map(log => log.id)).size !== repasos.length) {
                throw new Error('El historial contiene IDs de repaso repetidos.');
            }
            const asignaturas = Object.values(datos.biblioteca);
            const resumen = asignaturas.length + ' asignaturas y ' +
                asignaturas.reduce((n, tarjetas) => n + tarjetas.length, 0) + ' tarjetas';
            const alcance = completa ? 'los datos de la copia completa (' + repasos.length + ' repasos)' : 'solo la biblioteca';
            if (!confirm('Se reemplazará ' + alcance + ' con ' + resumen +
                '. Podrás descargar el estado anterior desde Ajustes. ¿Restaurar?')) return;
            await aplicarRestauracion(datos, locales, repasos);
            location.reload();
        } catch (error) {
            Toast.show('No se pudo restaurar: ' + error.message, 'error');
        } finally { el.disabled = false; el.value = ''; }
    }

    return {
        nuevoId, normalizarTarjetas, normalizarBiblioteca, migrarIdsMapa, guardarBiblioteca,
        procesarImportacionLatex, procesarImportacion, guardarEdicionJSON,
        descargarAsignaturaActual, exportarBackup, importarBackup, crearNuevaAsignatura,
        aplicarRestauracion,
        recuperarRestauracion: () => conBloqueoRestauracion(revertirRestauracionPendiente)
    };
})();

// Proxies Globales para compatibilidad con app.js
// NOTA: Estos wrappers son responsables de atrapar errores de data-io y delegarlos a la UI
async function mostrarImportacion(campo, importar) {
    if (campo.disabled) return;
    campo.disabled = true;
    try {
        const resultado = await importar(campo.value);
        campo.value = '';
        cancelarEdicion();
        Toast.show(resultado.count + ' tarjetas importadas.', 'success');
        if (resultado.conIA && typeof AI !== 'undefined') AI.procesarTitulosEnLote(resultado.asignatura);
    } catch (error) {
        Toast.show(error.message, 'error');
    } finally { campo.disabled = false; }
}

window.procesarImportacionLatex = () => mostrarImportacion(document.getElementById('import-area-latex'),
    raw => DataIO.procesarImportacionLatex(raw, Number(document.getElementById('latex-tema-input')?.value) || 1));
window.procesarImportacion = () => mostrarImportacion(document.getElementById('import-area'),
    async raw => ({ count: await DataIO.procesarImportacion(raw) }));
window.descargarAsignaturaActual   = () => DataIO.descargarAsignaturaActual();
window.exportarBackup              = () => DataIO.exportarBackup();
window.importarBackup              = el => DataIO.importarBackup(el);
window.gestionarNuevaAsignatura = () => {
    // El controlador exige los datos a la vista asíncronamente
    if (typeof UI !== 'undefined' && UI.pedirNombreAsignatura) {
        UI.pedirNombreAsignatura((nombre) => {
            if (nombre === null || nombre.trim() === "") {
                // Si el usuario cancela o deja vacío, se lanza el flujo secundario (subir archivo)
                const fileInput = document.getElementById('file-input-unified');
                if (fileInput) fileInput.click();
                return;
            }
            
            const result = DataIO.crearNuevaAsignatura(nombre);
            if (!result.success) {
                alert(result.error);
            } else {
                if (typeof window.actualizarMenuLateral === 'function') window.actualizarMenuLateral();
                if (typeof window.cargarAsignatura === 'function') window.cargarAsignatura(result.nombre);
            }
        });
    } else {
        Logger.error("Arquitectura: UI.pedirNombreAsignatura no está implementado en ui.js.");
    }
};
window.guardarEdicionJSON = async () => {
    const rawText = document.getElementById('json-editor-area').value;
    const result = await DataIO.guardarEdicionJSON(rawText);
    if (result.success) alert("Cambios guardados.");
    else if (!result.cancelada) alert("Error: " + result.error);
};
