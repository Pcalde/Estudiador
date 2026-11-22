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
            const id = value => cambios.get(value) ?? value;
            return [nombre, {
                ...grafo,
                nodes: (grafo.nodes || []).map(node => ({ ...node, id: id(node.id) })),
                edges: (grafo.edges || []).map(edge => ({ ...edge, source: id(edge.source), target: id(edge.target) }))
            }];
        }));
    }

    function idsOtrasAsignaturas(biblioteca, asig) {
        return new Set(Object.entries(biblioteca).filter(([nombre]) => nombre !== asig).flatMap(([, cards]) => cards.map(c => c.id)));
    }

    async function guardarBiblioteca(biblioteca) {
        await DB.setVar('biblioteca', biblioteca);
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
            await guardarBiblioteca({ ...biblioteca, [asigActual]: parsed });
            EventBus.emit('UI_ASIGNATURA_CARGADA', { nombre: asigActual });
            
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

    const clavesDB = ['biblioteca', 'bibliotecaConfig', 'graphData', 'planificador_pro', 'horarioGlobal', 'fechasClave'];
    const clavesLocales = [
        'estudiador_asig_actual', 'estudiador_proyectos', 'pomo_tasks', 'pomo_settings',
        'pomo_history', 'pomo_details_history', 'pomo_hora_history', 'pomo_log_today',
        'estudiador_historial_examenes', 'estudiador_recursos', 'estudiador_biblioteca_config',
        'estudiador_planificador_pro', 'estudiador_colores', 'estudiador_tipos_tarjeta',
        'estudiador_widget_config', 'estudiador_paleta_global', 'estudiador_apariencia',
        'estudiador_sound_settings', 'estudiador_ambient_track', 'estudiador_reward_track',
        'estudiador_hard_track', 'estudiador_alarm_track', 'estudiador_privacy_stats'
    ];

    async function exportarBackup() {
        try {
            const datos = Object.fromEntries(await Promise.all(clavesDB.map(async key => [key, await DB.getVar(key)])));
            const local = Object.fromEntries(clavesLocales.map(key => [key, localStorage.getItem(key)]));
            const repasos = await DB.getAll('fsrs_logs');
            const blob = new Blob([JSON.stringify({ formato: 'Estudiador', version: 1, datos, local, repasos }, null, 2)], { type: 'application/json' });
            _descargar(URL.createObjectURL(blob), 'Estudiador_' + Date.now() + '.json');
        } catch (error) { Toast.show('No se pudo exportar la copia: ' + error.message, 'error'); }
    }

    async function importarBackup(el) {
        const file = el.files[0];
        if (!file) return;
        try {
            const raw = JSON.parse(await file.text());
            const completa = raw?.formato === 'Estudiador';
            if (completa && (raw.version !== 1 || !raw.datos?.biblioteca || !raw.local)) {
                throw new Error('Formato de copia no compatible.');
            }
            const datos = completa ? Object.fromEntries(clavesDB.map(key => [key, raw.datos[key] ?? null])) : { biblioteca: raw };
            const original = datos.biblioteca ?? (completa ? {} : raw);
            datos.biblioteca = normalizarBiblioteca(original);
            if (datos.graphData) datos.graphData = migrarIdsMapa(datos.graphData, original, datos.biblioteca);
            const locales = completa ? clavesLocales.map(key => [key, raw.local[key] ?? null]) : [];
            const listas = ['estudiador_proyectos', 'pomo_tasks', 'estudiador_historial_examenes'];
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
            const repasos = completa ? raw.repasos : undefined;
            if (repasos !== undefined && (!Array.isArray(repasos) || repasos.some(log => !log || !Number.isInteger(log.id)))) {
                throw new Error('Historial de repasos inválido.');
            }
            if (!confirm('Restaurar la copia y reemplazar ' + (completa ? 'los datos locales incluidos' : 'la biblioteca') + '?')) return;
            const anteriores = locales.map(([key]) => [key, localStorage.getItem(key)]);
            const aplicarLocales = entries => entries.forEach(([key, value]) => {
                if (value === null) localStorage.removeItem(key);
                else localStorage.setItem(key, value);
            });
            try {
                aplicarLocales(locales);
                await DB.setVars(datos, repasos);
            } catch (error) {
                aplicarLocales(anteriores);
                throw error;
            }
            location.reload();
        } catch (error) {
            Toast.show('No se pudo restaurar: ' + error.message, 'error');
        } finally { el.value = ''; }
    }

    return {
        nuevoId, normalizarTarjetas, normalizarBiblioteca, migrarIdsMapa, guardarBiblioteca,
        procesarImportacionLatex, procesarImportacion, guardarEdicionJSON,
        descargarAsignaturaActual, exportarBackup, importarBackup, crearNuevaAsignatura
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
    else alert("Error: " + result.error);
};
