// ════════════════════════════════════════════════════════════════
// TESTS — Saberes no textuales (renderers, idiomas, piano, importación)
//
// Ejecutar:  node tests/saberes-no-textuales.test.js
//
// Estrategia: los módulos del navegador se cargan con vm.runInThisContext
// tras inyectar un mock mínimo de window/State/DB/Toast… Cada archivo
// define sus globals vía globalThis (ver cabeceras de card-renderers.js y
// media-study.js), por lo que el orden de carga replica el de index.html.
// Los casos asíncronos se recogen en una cola y se esperan antes del resumen.
// ════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ── Micro-framework de tests (síncronos + asíncronos) ───────────
let _pasados = 0, _fallidos = 0;
const _fallos = [];
const _colaAsync = [];

function test(nombre, fn) {
    try {
        const r = fn();
        if (r && typeof r.then === 'function') {
            _colaAsync.push(r.then(
                () => { console.log(`  ✓ ${nombre}`); _pasados++; },
                (e) => { console.error(`  ✗ ${nombre}\n      ${e.message}`); _fallidos++; _fallos.push({ nombre, err: e }); }
            ));
        } else {
            console.log(`  ✓ ${nombre}`); _pasados++;
        }
    } catch (e) {
        console.error(`  ✗ ${nombre}\n      ${e.message}`);
        _fallidos++; _fallos.push({ nombre, err: e });
    }
}
function grupo(nombre, fn) { console.log(`\n${nombre}`); fn(); }

// ── Mocks de entorno navegador ──────────────────────────────────
global.window = {};                       // sin speechSynthesis/Tone/MIDI a propósito

const _stateStore = {};
global.State = {
    get: (k) => _stateStore[k],
    set: (k, v) => { _stateStore[k] = v; },
    batch: (fn) => fn && fn()
};
global.Logger = { info(){}, warn(){}, error(){} };
const toasts = [];
global.Toast = { show: (msg, tipo) => toasts.push({ msg, tipo }) };
const comandosRegistrados = {};
global.CommandRegistry = {
    register: (accion, handler) => { comandosRegistrados[accion] = handler; },
    dispatch: (accion, ds) => comandosRegistrados[accion]?.(ds)
};
global.escapeHtml = (str) => String(str ?? '')
    .replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// DB simulada para blobs .mid
const _mediaStore = new Map();
global.DB = {
    putMedia: async ({ id, blob }) => { _mediaStore.set(id, blob); },
    getMedia: async (id) => _mediaStore.get(id) || null,
    deleteMedia: async (id) => { _mediaStore.delete(id); }
};

// Parser simulado (renderer 'texto' lo usa solo si existe)
global.Parser = { sanearLatex: (t) => `[latex]${t}` };

// persistirDatosLocales / aplicarFiltros simulados (llamados por MediaStudy)
const persistido = [];
global.persistirDatosLocales = (k) => persistido.push(k);
global.aplicarFiltros = () => {};

// ── Carga de módulos reales (orden como en index.html) ─────────
const SRC = p => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', p), 'utf8');
vm.runInThisContext(SRC('card-renderers.js'), { filename: 'card-renderers.js' });
vm.runInThisContext(SRC('media-study.js'),   { filename: 'media-study.js' });

const { CardRenderers, MusicRoll, MediaStudy, generarParejaIdioma } = global;

// ── Fixture MIDI falsa (formato @tonejs/midi ya parseado) ───────
// 120 BPM, compás de `comps` negras → compás = comps·0.5 s.
function midiFalso({ bpm = 120, comps = 4, durSeg = 48 } = {}) {
    const tracks = [{ notes: [] }];
    for (let t = 0; t < durSeg; t += 0.5) {
        tracks[0].notes.push({ time: t, duration: 0.4, midi: 60 + Math.round(Math.sin(t) * 12), name: 'C4' });
    }
    return {
        header: { tempos: [{ bpm }], timeSignatures: [{ timeSignature: [comps, 4] }] },
        tracks,
        duration: durSeg
    };
}

// ════════════════════════════════════════════════════════════════
grupo('1 · Registro de renderizadores (CardRenderers)', () => {

    test('expone texto, idioma y musica al cargar', () => {
        assert.deepStrictEqual(CardRenderers.tipos().sort(), ['idioma', 'musica', 'texto']);
    });

    test('_norm normaliza mayúsculas, acentos y espacios', () => {
        assert.strictEqual(CardRenderers._norm('  Música '), 'musica');
        assert.strictEqual(CardRenderers._norm('IDIOma'), 'idioma');
    });

    test('despacha por Tipo explícito', () => {
        const r = CardRenderers.get({ Tipo: 'idioma' });
        assert.ok(r.front({ Delante: 'x', Titulo: 'x' }).includes('lang-face'));
    });

    test('retrocompatibilidad: cae al Apartado si no hay Tipo', () => {
        const r = CardRenderers.get({ Apartado: 'Musica' });
        assert.ok(r.front({ Pieza: 'X', CompasIni: 1, CompasFin: 4 }).includes('compases'));
    });

    test('fallback a renderer texto para tipos desconocidos', () => {
        const r = CardRenderers.get({ Tipo: 'nada_de_esto', Contenido: 'hola', Titulo: 't' });
        assert.strictEqual(r.front({ Contenido: 'formula', Titulo: 'x' }), '[latex]formula');
    });

    test('register rechaza renderers inválidos sin romper el registry', () => {
        CardRenderers.register('roto', { front: null });   // sin front/back válidos
        assert.ok(!CardRenderers.tipos().includes('roto'));
    });

    test('tiene() distingue tarjetas no textuales', () => {
        assert.strictEqual(CardRenderers.tiene({ Tipo: 'idioma' }), true);
        assert.strictEqual(CardRenderers.tiene({}), false);          // fallback texto
        assert.strictEqual(CardRenderers.tiene({ Apartado: 'Definición' }), false);
    });

    test('notificar sobrevive a excepciones internas de los hooks', () => {
        let llamado = false;
        CardRenderers.register('hook_test', { front: () => '', back: () => '', onMount: () => { throw new Error('boom'); } });
        assert.doesNotThrow(() => CardRenderers.notificar('onMount', { Tipo: 'hook_test' }, null));
        CardRenderers.register('hook_ok', { front: () => '', back: () => '', onUnmount: () => { llamado = true; } });
        CardRenderers.notificar('onUnmount', { Tipo: 'hook_ok' });
        assert.strictEqual(llamado, true);
    });
});

// ════════════════════════════════════════════════════════════════
grupo('2 · Renderer idioma (parejas, cloze, XSS)', () => {

    test('generarParejaIdioma crea 2 tarjetas con parent_id común y FSRS independiente', () => {
        const [a, b] = generarParejaIdioma({ delante: 'perro', detras: 'dog' });
        assert.strictEqual(a.Tipo, 'idioma');
        assert.strictEqual(a.Direccion, 'directa');
        assert.strictEqual(b.Direccion, 'reversa');
        assert.strictEqual(a.parent_id, b.parent_id);
        assert.strictEqual(b.Titulo, 'dog');           // invertida
        assert.strictEqual(a.EtapaRepaso, 0);
        assert.strictEqual(a.ProximoRepaso, null);     // nueva para FSRS
    });

    test('front pregunta la cara correcta según dirección', () => {
        const [dir, rev] = generarParejaIdioma({ delante: 'gato', detras: 'cat', idiomaSrc: 'es', idiomaDst: 'en' });
        const f = CardRenderers.get(dir).front(dir);
        assert.ok(f.includes('gato') && !f.includes('>cat<'));
        assert.ok(f.includes('ES'));
        const fr = CardRenderers.get(rev).front(rev);
        assert.ok(fr.includes('cat') && fr.includes('EN'));
    });

    test('back muestra la respuesta con su etiqueta', () => {
        const [t] = generarParejaIdioma({ delante: 'casa', detras: 'house' });
        const bk = CardRenderers.get(t).back(t);
        assert.ok(bk.includes('house') && bk.includes('EN'));
    });

    test('cloze sustituye {{c1::...}} por huecos revelables', () => {
        const [t] = generarParejaIdioma({ delante: 'Me gusta {{c1::el pan}}', detras: 'I like bread', cloze: true });
        const f = CardRenderers.get(t).front(t);
        assert.ok(f.includes('cloze-slot'));
        assert.ok(f.includes('data-cloze="el pan"'));
        assert.ok(!f.includes('{{c1::'));                    // marcador nunca visible
        assert.strictEqual((f.match(/cloze-slot/g) || []).length, 1);
    });

    test('sin cloze los marcadores quedan intactos como texto', () => {
        const [t] = generarParejaIdioma({ delante: 'texto plano', detras: 'plain' });
        assert.ok(CardRenderers.get(t).front(t).includes('texto plano'));
    });

    test('escapea HTML inyectado en ambas caras', () => {
        const [t] = generarParejaIdioma({ delante: '<img src=x onerror=alert(1)>', detras: 'ok' });
        const f = CardRenderers.get(t).front(t);
        assert.ok(!f.includes('<img'));
        assert.ok(f.includes('&lt;img'));
    });

    test('botón TTS ausente sin speechSynthesis (degradado elegante)', () => {
        const [t] = generarParejaIdioma({ delante: 'hola', detras: 'hello' });
        assert.ok(!CardRenderers.get(t).front(t).includes('ttsDecir'));
    });

    test('handler ttsDecir registrado y no-op sin speechSynthesis', () => {
        assert.strictEqual(typeof comandosRegistrados['ttsDecir'], 'function');
        assert.doesNotThrow(() => comandosRegistrados['ttsDecir']({ texto: 'hi', lang: 'en' }));
    });
});

// ════════════════════════════════════════════════════════════════
grupo('3 · Renderer música (pasajes, troceado, rango)', () => {

    test('front describe el pasaje (compases, mano, tempo)', () => {
        const t = { Tipo: 'musica', Pieza: 'Gymnopédie', CompasIni: 17, CompasFin: 24, Mano: 'izq', Tempo: 72 };
        const f = CardRenderers.get(t).front(t);
        assert.ok(f.includes('Gymnop&eacute;die'));
        assert.ok(f.includes('17–24'));
        assert.ok(f.includes('mano izquierda'));
        assert.ok(f.includes('♩=72'));
    });

    test('back expone controles con data-action registrados', () => {
        const t = { Tipo: 'musica', MediaId: 'm1', CompasIni: 1, CompasFin: 8 };
        const b = CardRenderers.get(t).back(t);
        for (const acc of ['musicaReproducir', 'musicaParar', 'musicaDescargar']) {
            assert.ok(b.includes(`data-action="${acc}"`), `falta ${acc}`);
            assert.strictEqual(typeof comandosRegistrados[acc], 'function', `${acc} sin handler`);
        }
        assert.ok(b.includes('data-media-id="m1"'));
    });

    test('rangoSegundos: 120 BPM 4/4 → compás = 2 s', () => {
        const { ini, fin } = MusicRoll.rangoSegundos(midiFalso(), 5, 8);
        assert.strictEqual(ini, 8);
        assert.strictEqual(fin, 16);
    });

    test('rangoSegundos respeta tiempo compuesto (6/4 a 60 BPM → compás = 6 s)', () => {
        const { ini, fin } = MusicRoll.rangoSegundos(midiFalso({ bpm: 60, comps: 6 }), 2, 3);
        assert.strictEqual(ini, 6);
        assert.strictEqual(fin, 18);
    });

    test('trocear cubre toda la pieza sin solapes ni huecos', () => {
        const semillas = MusicRoll.trocear(midiFalso({ durSeg: 48 }), { pieza: 'Claro de luna', compasesPorPasaje: 8 });
        assert.strictEqual(semillas.length, 3);                 // 24 compases → 3×8
        assert.strictEqual(semillas[0].CompasIni, 1);
        assert.strictEqual(semillas[0].CompasFin, 8);
        assert.strictEqual(semillas[1].CompasIni, 9);
        assert.strictEqual(semillas[2].CompasFin, 24);
        semillas.forEach(s => {
            assert.strictEqual(s.Tipo, 'musica');
            assert.strictEqual(s.Pieza, 'Claro de luna');
            assert.strictEqual(s.Mano, 'ambas');
            assert.strictEqual(s.Tempo, 120);
            assert.strictEqual(s.EtapaRepaso, 0);
        });
    });

    test('trocear redondea el último pasaje incompleto', () => {
        const semillas = MusicRoll.trocear(midiFalso({ durSeg: 30 }), { compasesPorPasaje: 8 });
        assert.strictEqual(semillas.length, 2);                 // 15 compases → 8 + 7
        assert.strictEqual(semillas[1].CompasIni, 9);
        assert.strictEqual(semillas[1].CompasFin, 15);
    });

    test('trocear con midi sin duración cae a 1 pasaje mínimo', () => {
        const m = midiFalso(); m.duration = Infinity;
        const semillas = MusicRoll.trocear(m, { compasesPorPasaje: 8 });
        assert.strictEqual(semillas.length, 1);
        assert.strictEqual(semillas[0].CompasIni, 1);
    });

    test('dibujar es no-op sin document (entorno de tests)', () => {
        assert.doesNotThrow(() => MusicRoll.dibujar({}, midiFalso(), { CompasIni: 1, CompasFin: 4 }));
    });

    test('onMount de música es seguro sin Tone.js/MIDI cargados', () => {
        const t = { Tipo: 'musica', MediaId: 'no-existe', CompasIni: 1, CompasFin: 4 };
        assert.doesNotThrow(() => CardRenderers.notificar('onMount', t, null));
    });
});

// ════════════════════════════════════════════════════════════════
grupo('4 · Importación CSV/TSV de idiomas', () => {

    test('parseDelimited detecta coma y punto y coma', () => {
        assert.deepStrictEqual(MediaStudy.parseDelimited('a,b\nc,d'), [['a','b'],['c','d']]);
        assert.deepStrictEqual(MediaStudy.parseDelimited('a;b\nc;d'), [['a','b'],['c','d']]);
    });

    test('respeta comillas con separadores internos y dobles comillas', () => {
        const filas = MediaStudy.parseDelimited('"Hola, mundo","Say ""hi"""\nx,y');
        assert.deepStrictEqual(filas, [['Hola, mundo', 'Say "hi"'], ['x', 'y']]);
    });

    test('tolera CRLF y líneas vacías', () => {
        const filas = MediaStudy.parseDelimited('a,b\r\n\r\nc,d\r\n');
        assert.deepStrictEqual(filas, [['a','b'],['c','d']]);
    });

    test('parsearCsvIdiomas genera parejas bidireccionales por fila', () => {
        const tarjetas = MediaStudy.parsearCsvIdiomas('perro,dog\ngato,cat');
        assert.strictEqual(tarjetas.length, 4);                     // 2 filas × 2 direcciones
        assert.strictEqual(new Set(tarjetas.map(t => t.parent_id)).size, 2);
        assert.ok(tarjetas.every(t => t.Tipo === 'idioma'));
    });

    test('ignora cabeceras tipo Anki y filas incompletas', () => {
        const tarjetas = MediaStudy.parsearCsvIdiomas('Front,Back\nperro,dog\nsolo_una_columna\n');
        assert.strictEqual(tarjetas.length, 2);
    });

    test('autodetecta cloze en el contenido aunque falte la columna', () => {
        const tarjetas = MediaStudy.parsearCsvIdiomas('Me gusta {{c1::bailar}},I like dancing');
        assert.ok(tarjetas.every(t => t.Cloze === true));
    });

    test('columnas src/dst opcionales llegan a IdiomaSrc/IdiomaDst', () => {
        const tarjetas = MediaStudy.parsearCsvIdiomas('bonjour,hello,fr,en');
        assert.strictEqual(tarjetas[0].IdiomaSrc, 'fr');
        assert.strictEqual(tarjetas[0].IdiomaDst, 'en');
    });

    test('_insertarTarjetas deduplica por Título+Contenido y asigna ids', () => {
        _stateStore.nombreAsignaturaActual = 'Francés';
        _stateStore.biblioteca = { 'Francés': [] };
        const tarjetas = MediaStudy.parsearCsvIdiomas('lune,moon');
        assert.strictEqual(MediaStudy._insertarTarjetas(tarjetas), 2);
        assert.strictEqual(MediaStudy._insertarTarjetas(tarjetas), 0);   // repetida: dedupe
        const lista = _stateStore.biblioteca['Francés'];
        assert.ok(lista.every(t => typeof t.id === 'string' && t.id.length > 0));
        assert.ok(lista.every(t => t.EtapaRepaso === 0));
    });

    test('importarCsv sobre un File-like termina en biblioteca + toast', async () => {
        _stateStore.nombreAsignaturaActual = 'Inglés';
        _stateStore.biblioteca = { 'Inglés': [] };
        const file = { name: 'anki.csv', text: async () => 'house,casa\nwater,agua' };
        const n = await MediaStudy.importarCsv(file);
        assert.strictEqual(n, 4);
        assert.strictEqual(_stateStore.biblioteca['Inglés'].length, 4);
        assert.ok(toasts.some(t => t.tipo === 'success' && /tarjetas/.test(t.msg)));
        assert.ok(persistido.includes('biblioteca'));
    });

    test('CSV vacío avisa sin insertar nada', async () => {
        _stateStore.nombreAsignaturaActual = 'Inglés';
        _stateStore.biblioteca = { 'Inglés': [] };
        const n = await MediaStudy.importarCsv({ name: 'v.csv', text: async () => '' });
        assert.strictEqual(n, 0);
        assert.ok(toasts.some(t => t.tipo === 'warning'));
    });
});

// ════════════════════════════════════════════════════════════════
grupo('5 · Importación .mid y modo "Pídeme una sección"', () => {

    test('importarMidi sin @tonejs/midi degrada con error claro (sin lanzar)', async () => {
        _stateStore.nombreAsignaturaActual = 'Piano';
        _stateStore.biblioteca = { 'Piano': [] };
        delete global.window.MIDI;
        const n = await MediaStudy.importarMidi({ name: 'x.mid', arrayBuffer: async () => new ArrayBuffer(8) });
        assert.strictEqual(n, 0);
        assert.ok(toasts.some(t => t.tipo === 'error' && /tonejs/i.test(t.msg)));
    });

    test('importarMidi guarda el blob en DB y trocea la pieza', async () => {
        const midi = midiFalso({ durSeg: 32 });                 // 16 compases
        global.window.MIDI = function () { return midi; };     // stub de @tonejs/midi
        _stateStore.nombreAsignaturaActual = 'Piano';
        _stateStore.biblioteca = { 'Piano': [] };
        const file = { name: 'Nocturno.mid', arrayBuffer: async () => new ArrayBuffer(8) };
        const n = await MediaStudy.importarMidi(file, { compasesPorPasaje: 8, mano: 'der' });
        assert.strictEqual(n, 2);                               // c.1-8, c.9-16
        const lista = _stateStore.biblioteca['Piano'];
        assert.strictEqual(lista[0].Pieza, 'Nocturno');         // sin extensión .mid
        assert.strictEqual(lista[0].Mano, 'der');
        assert.ok(lista[0].MediaId, 'las tarjetas apuntan al blob');
        assert.strictEqual(lista[0].MediaId, lista[1].MediaId);
        assert.strictEqual(_mediaStore.size, 1);                // un único blob compartido
    });

    test('.mid corrupto → toast de error, sin tarjetas', async () => {
        global.window.MIDI = function () { throw new Error('bad midi'); };
        _stateStore.nombreAsignaturaActual = 'Piano';
        _stateStore.biblioteca = { 'Piano': [] };
        const n = await MediaStudy.importarMidi({ name: 'roto.mid', arrayBuffer: async () => new ArrayBuffer(4) });
        assert.strictEqual(n, 0);
        assert.ok(toasts.some(t => t.tipo === 'error' && /no es válido/.test(t.msg)));
        assert.strictEqual(_stateStore.biblioteca['Piano'].length, 0);
    });

    test('filtrarPorPasaje reduce la cola al rango pedido y ordena por compás', async () => {
        const midi = midiFalso({ durSeg: 48 });
        global.window.MIDI = function () { return midi; };
        _stateStore.nombreAsignaturaActual = 'Piano';
        _stateStore.biblioteca = { 'Piano': [] };
        await MediaStudy.importarMidi({ name: 'Balada.mid', arrayBuffer: async () => new ArrayBuffer(8) }, { compasesPorPasaje: 4 });
        // 24 compases / 4 → 6 pasajes + ruido textual que debe quedar fuera
        _stateStore.biblioteca['Piano'].push({ Titulo: 'nota', Contenido: 'texto', Apartado: 'Nota' });

        const n = MediaStudy.filtrarPorPasaje({ compasIni: 5, compasFin: 12 });
        assert.strictEqual(n, 2);                                   // pasajes c.5-8 y c.9-12
        assert.strictEqual(_stateStore.colaEstudio.length, 2);
        assert.ok(_stateStore.colaEstudio.every(c => c.Tipo === 'musica'));
        assert.strictEqual(_stateStore.conceptoActual.CompasIni, 5);
        assert.strictEqual(_stateStore.indiceNavegacion, 0);
    });

    test('filtrarPorPasaje por mediaId aísla una sola pieza', () => {
        const todas = _stateStore.biblioteca['Piano'].filter(c => c.Tipo === 'musica');
        const id = todas[0].MediaId;
        const n = MediaStudy.filtrarPorPasaje({ mediaId: id });
        assert.strictEqual(n, todas.length);
        assert.ok(_stateStore.colaEstudio.every(c => c.MediaId === id));
    });

    test('sección sin coincidencias avisa y deja la cola vacía', () => {
        const n = MediaStudy.filtrarPorPasaje({ compasIni: 999 });
        assert.strictEqual(n, 0);
        assert.strictEqual(_stateStore.colaEstudio.length, 0);
        assert.strictEqual(_stateStore.conceptoActual, null);
        assert.ok(toasts.some(t => t.tipo === 'warning' && /coincidan/.test(t.msg)));
    });
});

// ════════════════════════════════════════════════════════════════
grupo('6 · Regresión: scheduler y rutas textuales intactas', () => {

    test('las tarjetas generadas son semillas FSRS normales', () => {
        const [idioma] = generarParejaIdioma({ delante: 'a', detras: 'b' });
        const musica = MusicRoll.trocear(midiFalso(), {})[0];
        for (const t of [idioma, musica]) {
            assert.ok('EtapaRepaso' in t && 'ProximoRepaso' in t && 'UltimoRepaso' in t);
            assert.ok('Titulo' in t && 'Contenido' in t && 'Apartado' in t);
        }
    });

    test('renderer texto preserva el comportamiento histórico (Parser.sanearLatex)', () => {
        const r = CardRenderers.get({ Contenido: '\\alpha' });
        assert.strictEqual(r.front({ Contenido: '\\alpha', Titulo: 'x' }), '[latex]\\alpha');
    });

    test('exam/quiz filtran tarjetas de música (no van al tipo test)', () => {
        const examSrc = SRC('exam.js'), quizSrc = SRC('quiz.js');
        assert.ok(/musica/.test(examSrc), 'exam.js debe excluir pasajes de música');
        assert.ok(/_esTarjetaMusica/.test(quizSrc), 'quiz.js debe excluir pasajes de música');
    });

    test('index.html carga toast.js antes de card-renderers/media-study', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const iToast = html.indexOf('src/js/toast.js');
        const iCR = html.indexOf('src/js/card-renderers.js');
        const iMS = html.indexOf('src/js/media-study.js');
        assert.ok(iToast >= 0 && iCR > iToast && iMS > iToast, 'orden de scripts incorrecto');
    });

    test('handlers de música son inofensivos sin concepto activo', () => {
        _stateStore.conceptoActual = null;
        assert.doesNotThrow(() => comandosRegistrados['musicaReproducir']());
        assert.doesNotThrow(() => comandosRegistrados['musicaParar']());
        assert.doesNotThrow(() => comandosRegistrados['musicaDescargar']());
    });
});

// ── Resumen (tras esperar los casos asíncronos) ─────────────────
(async () => {
    await Promise.allSettled(_colaAsync);
    console.log(`\n${_pasados} pasados, ${_fallidos} fallidos`);
    if (_fallos.length) {
        console.log('\nDetalles:');
        _fallos.forEach(f => console.log(` - ${f.nombre}: ${f.err.stack?.split('\n')[0]}`));
    }
    process.exit(_fallidos ? 1 : 0);
})();
