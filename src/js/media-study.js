// ════════════════════════════════════════════════════════════════
// MEDIA-STUDY.JS — Importación de contenido para saberes no textuales
//
//   1. CSV/TSV de idiomas (compatible con exportaciones de Anki):
//        delante ; detrás ; [idioma_src] ; [idioma_dst] ; [cloze]
//      Cada fila genera una PAREJA bidireccional (ES→EN y EN→ES) con
//      historial FSRS independiente.
//
//   2. Subida de .mid: guarda el blob en IndexedDB (store 'media') y
//      auto-trocea la pieza en pasajes de N compases → tarjetas 'musica'.
//
// Dependencias: State, Logger, Toast, escapeHtml, DB, generarParejaIdioma,
//               MusicRoll, window.MIDI (@tonejs/midi, opcional).
// El scheduler no se entera: estas tarjetas son tarjetas normales con
// campos extra que solo leen los renderers.
// ════════════════════════════════════════════════════════════════

// Dependencias duales (ver card-renderers.js): en tests se inyectan vía globalThis.
if (typeof globalThis.Logger === 'undefined') {
    globalThis.Logger = { info(){}, warn(){}, error(){} };
}
if (typeof globalThis.Toast === 'undefined' || !globalThis.Toast.show) {
    globalThis.Toast = Object.assign(globalThis.Toast || {}, { show(){} });
}

const MediaStudy = (() => {

    const _genId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'c_' + Date.now() + Math.random().toString(36).slice(2);

    // ── Parser CSV/TSV tolerante (comillas, separador auto) ───────
    function parseDelimited(texto) {
        const lineas = [];
        let campo = '', fila = [], inQuotes = false;
        const sep = (texto.split('\n')[0] || '').includes(';') ? ';' : ',';
        for (let i = 0; i < texto.length; i++) {
            const ch = texto[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (texto[i + 1] === '"') { campo += '"'; i++; }
                    else inQuotes = false;
                } else campo += ch;
            } else if (ch === '"')      inQuotes = true;
            else if (ch === sep)        { fila.push(campo); campo = ''; }
            else if (ch === '\n')       { fila.push(campo.replace(/\r$/, '')); lineas.push(fila); fila = []; campo = ''; }
            else if (ch === '\r')       { /* ignorado fuera de comillas */ }
            else                         campo += ch;
        }
        if (campo !== '' || fila.length) { fila.push(campo.replace(/\r$/, '')); lineas.push(fila); }
        return lineas.map(r => r.map(c => c.trim())).filter(r => r.some(c => c.length));
    }

    /**
     * Convierte texto CSV/TSV en semillas de tarjeta 'idioma' (parejas).
     * @returns {Array} tarjetas listas para insertar en biblioteca[asig]
     */
    function parsearCsvIdiomas(texto) {
        const filas = parseDelimited(texto);
        const tarjetas = [];
        for (const f of filas) {
            let [delante, detras, src = 'es', dst = 'en', cloze = ''] = f;
            if (!delante || !detras) continue;
            // Cabecera tipo "front,back" o "delante,detrás": ignorarla
            if (/^(front|delante|anverso|term)/i.test(delante) && /^(back|detr[aá]s|reverso|definition)$/i.test(detras)) continue;
            const esCloze = cloze.toLowerCase().startsWith('y') || /\{\{c\d+::/.test(delante + detras);
            tarjetas.push(...generarParejaIdioma({
                delante, detras, idiomaSrc: src || 'es', idiomaDst: dst || 'en', cloze: esCloze
            }));
        }
        return tarjetas;
    }

    // ── Inserción en la asignatura activa ─────────────────────────
    function _insertarTarjetas(nuevas) {
        const asig = State.get('nombreAsignaturaActual');
        if (!asig) { Toast.show('Selecciona una asignatura antes de importar.', 'error'); return 0; }
        const biblioteca = structuredClone(State.get('biblioteca') || {});
        const lista = biblioteca[asig] || (biblioteca[asig] = []);
        const existentes = new Set(lista.map(t => `${t.Titulo}||${t.Contenido}`));
        let añadidas = 0;
        nuevas.forEach(t => {
            const t2 = { ...t };
            if (!t2.id) t2.id = _genId();
            if (!t2.EtapaRepaso) t2.EtapaRepaso = 0;
            const clave = `${t2.Titulo}||${t2.Contenido}`;
            if (existentes.has(clave)) return;      // dedupe básico
            existentes.add(clave);
            lista.push(t2);
            añadidas++;
        });
        State.set('biblioteca', biblioteca);
        if (typeof window.persistirDatosLocales === 'function') window.persistirDatosLocales('biblioteca', biblioteca);
        if (typeof window.aplicarFiltros === 'function') window.aplicarFiltros();
        return añadidas;
    }

    // ── Modo "Pídeme una sección": filtra la cola por pieza pasaje ─
    // Se usa como filtro de estudio temporal (no toca el scheduler):
    // solo reduce colaEstudio a los pasajes de un MediaId/rango.
    function filtrarPorPasaje({ mediaId = null, compasIni = null, compasFin = null } = {}) {
        const asig = State.get('nombreAsignaturaActual');
        const biblioteca = State.get('biblioteca') || {};
        const lista = biblioteca[asig] || [];
        let seleccion = lista.filter(c => (c.Tipo || '').toLowerCase() === 'musica');
        if (mediaId)   seleccion = seleccion.filter(c => c.MediaId === mediaId);
        if (compasIni != null) seleccion = seleccion.filter(c => (c.CompasFin ?? 0) >= compasIni);
        if (compasFin != null) seleccion = seleccion.filter(c => (c.CompasIni ?? Infinity) <= compasFin);
        seleccion.sort((a, b) => (a.CompasIni || 0) - (b.CompasIni || 0));
        State.batch(() => {
            State.set('colaEstudio', seleccion);
            State.set('indiceNavegacion', 0);
            State.set('conceptoActual', seleccion.length ? structuredClone(seleccion[0]) : null);
        });
        if (!seleccion.length && typeof Toast !== 'undefined' && Toast.show) {
            Toast.show('No hay pasajes que coincidan con esa sección.', 'warning');
        }
        return seleccion.length;
    }

    // ── API pública: importar CSV desde File ──────────────────────
    async function importarCsv(file) {
        const texto = await file.text();
        const tarjetas = parsearCsvIdiomas(texto);
        if (!tarjetas.length) { Toast.show('CSV sin filas válidas (esperado: delante, detrás[, src, dst]).', 'warning'); return 0; }
        const n = _insertarTarjetas(tarjetas);
        Toast.show(`Idiomas: ${n} tarjetas (${n / 2} pares bidireccionales).`, 'success');
        return n;
    }

    // ── API pública: subir .mid y trocear en pasajes ──────────────
    async function importarMidi(file, { compasesPorPasaje = 8, mano = 'ambas' } = {}) {
        if (typeof window.MIDI === 'undefined') {
            Toast.show('Falta @tonejs/midi: no puedo parsear el .mid en el navegador.', 'error');
            return 0;
        }
        let midi;
        try {
            midi = new window.MIDI(await file.arrayBuffer());
        } catch (e) {
            Logger.error('MediaStudy: .mid ilegible:', e);
            Toast.show('El archivo .mid no es válido.', 'error');
            return 0;
        }
        const mediaId = _genId();
        const nombre = (file.name || 'pasaje').replace(/\.mid$/i, '');
        if (typeof DB !== 'undefined' && DB.putMedia) {
            await DB.putMedia({ id: mediaId, blob: file, nombre, tipo: 'audio/midi' });
        }
        const semillas = MusicRoll.trocear(midi, { pieza: nombre, compasesPorPasaje, mano });
        semillas.forEach(t => { t.MediaId = mediaId; });
        const n = _insertarTarjetas(semillas);
        Toast.show(`Música: ${n} pasajes creados desde "${nombre}".`, 'success');
        return n;
    }

    return { parseDelimited, parsearCsvIdiomas, importarCsv, importarMidi, filtrarPorPasaje, _insertarTarjetas };
})();

window.MediaStudy = MediaStudy;
