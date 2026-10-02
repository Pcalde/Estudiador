// ════════════════════════════════════════════════════════════════
// CARD-RENDERERS.JS — Registro de renderizadores por tipo de tarjeta
//
// Patrón idéntico a CommandRegistry: cada módulo registra su renderer
// bajo una clave (normalizada) y UIStudy despacha por ella.
// El scheduler (FSRS) NO conoce los tipos: solo ve id/estabilidad/fechas,
// por lo que añadir aquí no toca la cola, filtros, deuda ni Monte Carlo.
//
// Contrato de un renderer:
//   {
//     front(tarjeta)        -> string HTML  : anverso (lo que se pregunta)
//     back(tarjeta)         -> string HTML  : reverso (respuesta + extras)
//     onMount?(tarjeta, contenedorEl)       : tras insertar el HTML (audio, MIDI…)
//     onReveal?(tarjeta)                    : al revelar la respuesta
//     onUnmount?()                          : al cambiar de tarjeta (limpiar timers/audio)
//   }
// ════════════════════════════════════════════════════════════════

// Dependencias duales: en el navegador son globals creados por los <script>
// anteriores (var/globalThis); en Node/tests se inyectan vía globalThis antes
// de cargar este archivo. NO usar const/let con el mismo nombre: la TDZ
// rompería la resolución del global.
if (typeof globalThis.Logger === 'undefined') {
    globalThis.Logger = { info(){}, warn(){}, error(){} };
}
if (typeof globalThis.CommandRegistry === 'undefined') {
    globalThis.CommandRegistry = { register(){}, dispatch(){} };
}
if (typeof globalThis.State === 'undefined') {
    globalThis.State = { get(){ return null; }, set(){}, batch(fn){ fn && fn(); } };
}
if (typeof globalThis.escapeHtml === 'undefined') {
    globalThis.escapeHtml = (str) => String(str ?? '')
        .replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

const CardRenderers = (() => {
    const _renderers = {};

    // Clave normalizada: minúsculas, sin acentos, espacios → '_'
    function _norm(key) {
        return String(key || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_');
    }

    function register(tipo, renderer) {
        const key = _norm(tipo);
        if (_renderers[key]) {
            Logger.warn(`CardRenderers: renderer '${key}' sobreescrito.`);
        }
        if (!renderer || typeof renderer.front !== 'function' || typeof renderer.back !== 'function') {
            Logger.error("CardRenderers: renderer inválido (requiere front/back):", tipo);
            return;
        }
        _renderers[key] = renderer;
    }

    /**
     * Busca el renderer del tipo en orden de prioridad:
     *   1. tarjeta.Tipo explicito ('idioma', 'musica')
     *   2. tarjeta.Apartado (retrocompatible: un Apartado 'Idioma' también funciona)
     *   3. fallback registrado (por defecto 'texto')
     */
    function get(tarjeta) {
        const keys = [tarjeta?.Tipo, tarjeta?.Apartado].filter(Boolean).map(_norm);
        for (const k of keys) {
            if (_renderers[k]) return _renderers[k];
        }
        return _renderers['texto'] || null;
    }

    function tiene(tarjeta) {
        return get(tarjeta) !== null && !_esTexto(get(tarjeta));
    }

    function _esTexto(r) {
        return r === _renderers['texto'];
    }

    function notificar(nombre, tarjeta, arg) {
        const r = get(tarjeta);
        if (r && typeof r[nombre] === 'function') {
            try { r[nombre](tarjeta, arg); }
            catch (e) { Logger.error(`CardRenderers: fallo en '${nombre}':`, e); }
        }
    }

    /** Lista de claves registradas (útil para tests y UI) */
    function tipos() {
        return Object.keys(_renderers);
    }

    return { register, get, tiene, notificar, tipos, _norm };
})();

// ════════════════════════════════════════════════════════════════
// RENDERER POR DEFECTO — 'texto' (comportamiento histórico)
// ════════════════════════════════════════════════════════════════

CardRenderers.register('texto', {
    front(tarjeta) {
        return typeof Parser !== 'undefined'
            ? Parser.sanearLatex(tarjeta.Contenido)
            : escapeHtml(tarjeta.Contenido || '');
    },
    back(tarjeta) {
        return this.front(tarjeta);
    }
});

// ════════════════════════════════════════════════════════════════
// RENDERER 'idioma' — tarjetas bidireccionales + cloze + TTS
//
// Campos extra en la tarjeta:
//   IdiomaSrc / IdiomaDst : códigos BCP-47 ('es', 'en', 'fr'…)
//   Delante / Detras      : texto de cada cara (si faltan, se derivan
//                           de Titulo / Contenido)
//   Cloze                 : true → sustituye {{c1::...}} por huecos
//
// Las tarjetas se generan en parejas con parent_id para que el
// usuario pueda repasar ES→EN y EN→ES con historial FSRS independiente.
// ════════════════════════════════════════════════════════════════

(function () {
    const CLOZE_RE = /\{\{c(\d+)::([^}]+)\}\}/g;

    function _caras(tarjeta) {
        const dir = (tarjeta.Direccion || '').toLowerCase();
        const A = tarjeta.Delante || tarjeta.Titulo || '';
        const B = tarjeta.Detras || tarjeta.Contenido || '';
        return dir === 'reversa' ? { q: B, a: A } : { q: A, a: B };
    }

    function _cloze(html) {
        let n = 0;
        return html.replace(CLOZE_RE, (_, grupo, texto) => {
            n++;
            return `<span class="cloze-slot" data-cloze="${escapeHtml(texto)}" title="Haz clic para revelar">`
                 + `[${escapeHtml(String(grupo))} · ____]</span>`;
        });
    }

    function _btnEscuchar(texto, lang) {
        if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return '';
        return `<button type="button" class="btn-audio" data-action="ttsDecir" `
             + `data-texto="${escapeHtml(texto)}" data-lang="${escapeHtml(lang || 'es')}" `
             + `title="Escuchar 🔊">🔊</button>`;
    }

    CardRenderers.register('idioma', {
        front(tarjeta) {
            const { q } = _caras(tarjeta);
            const src = tarjeta.IdiomaSrc || 'es';
            const safe = escapeHtml(q);
            const cuerpo = tarjeta.Cloze ? _cloze(safe) : safe;
            return `<div class="lang-face">${_btnEscuchar(q, src)}`
                 + `<span class="lang-tag">${escapeHtml(src.toUpperCase())}</span>`
                 + `<div class="lang-text">${cuerpo}</div></div>`;
        },

        back(tarjeta) {
            const { a } = _caras(tarjeta);
            const dst = tarjeta.IdiomaDst || 'en';
            return `<div class="lang-answer"><hr style="opacity:.3;margin:10px 0"/>`
                 + `<div class="lang-face">${_btnEscuchar(a, dst)}`
                 + `<span class="lang-tag">${escapeHtml(dst.toUpperCase())}</span>`
                 + `<div class="lang-text">${escapeHtml(a)}</div></div></div>`;
        },

        onMount(tarjeta, contenedor) {
            if (!contenedor) return;
            // Huecos interactivos: clic individual para autorrevelar antes del botón
            contenedor.querySelectorAll('.cloze-slot').forEach(slot => {
                slot.onclick = () => {
                    slot.classList.toggle('cloze-open');
                    const abierto = slot.classList.contains('cloze-open');
                    slot.innerText = abierto ? slot.dataset.cloze : '[____]';
                };
            });
        }
    });

    // ── Generación de parejas bidireccionales ────────────────────
    // Devuelve 2 tarjetas herederas de las semillas FSRS vacías;
    // el scheduler las trata como tarjetas normales e independientes.
    window.generarParejaIdioma = function ({ delante, detras, idiomaSrc = 'es', idiomaDst = 'en',
                                            tema, apartado, cloze = false }) {
        const pid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID() : 'p_' + Date.now() + Math.random().toString(36).slice(2);
        const base = {
            Tipo: 'idioma', Apartado: apartado || 'Idioma', Tema: tema || '',
            EtapaRepaso: 0, UltimoRepaso: null, ProximoRepaso: null,
            IdiomaSrc: idiomaSrc, IdiomaDst: idiomaDst, Cloze: cloze, parent_id: pid
        };
        return [
            { ...base, Direccion: 'directa',  Delante: delante, Detras: detras,
              Titulo: delante, Contenido: detras },
            { ...base, Direccion: 'reversa',  Delante: detras,  Detras: delante,
              Titulo: detras,  Contenido: delante }
        ];
    };
})();

// ════════════════════════════════════════════════════════════════
// RENDERER 'musica' — pasajes de piano desde .mid
//
// Campos extra en la tarjeta:
//   MediaId    : clave del blob .mid en IndexedDB (store 'media')
//   CompasIni / CompasFin : fronteras del pasaje (inclusive)
//   Mano       : 'ambas' | 'izq' | 'der'
//   Tempo      : ♩ objetivo (BPM)
//   Pieza      : nombre legible
//
// El anverso siempre funciona (texto). El reverso intenta dibujar un
// piano-roll con Tone.js + @tonejs/midi SOLO si las librerías están
// cargadas; si no, degrada elegantemente a "instala las dependencias".
// ════════════════════════════════════════════════════════════════

(function () {
    function _hayLibs() {
        return typeof window !== 'undefined'
            && typeof window.Tone !== 'undefined' && typeof window.MIDI !== 'undefined';
    }

    async function _obtenerBlob(mediaId) {
        if (typeof DB === 'undefined' || !DB.getMedia) return null;
        return DB.getMedia(mediaId);
    }

    function _descargar(blob, nombre) {
        if (typeof document === 'undefined') return;   // entorno de tests
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre || 'pasaje.mid';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    /** Convierte un Blob/File en ArrayBuffer sin depender de blob.arrayBuffer() */
    function _leerBuffer(blob) {
        if (blob.arrayBuffer) return blob.arrayBuffer();
        if (typeof FileReader === 'undefined') return Promise.reject(new Error('FileReader no disponible'));
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsArrayBuffer(blob);
        });
    }

    CardRenderers.register('musica', {
        front(tarjeta) {
            const manoTxt = { izq: 'mano izquierda', der: 'mano derecha', ambas: 'ambas manos' }[tarjeta.Mano || 'ambas'];
            return `<div class="music-front">🎹 <strong>${escapeHtml(tarjeta.Pieza || 'Pasaje')}</strong><br/>`
                 + `Toca compases <b>${tarjeta.CompasIni ?? '?'}–${tarjeta.CompasFin ?? '?'}</b> · ${escapeHtml(manoTxt)} · `
                 + `♩=${tarjeta.Tempo || 80}`
                 + (tarjeta.Notas ? `<br/><small>${escapeHtml(tarjeta.Notas)}</small>` : '')
                 + `</div>`;
        },

        back(tarjeta) {
            const id = escapeHtml(tarjeta.MediaId || '');
            return `<div class="music-back" data-media-id="${id}" `
                 + `data-ini="${tarjeta.CompasIni ?? 1}" data-fin="${tarjeta.CompasFin ?? 999}" `
                 + `data-mano="${escapeHtml(tarjeta.Mano || 'ambas')}">`
                 + `<div class="music-controls">`
                 + `  <button type="button" data-action="musicaReproducir">▶ Reproducir pasaje</button>`
                 + `  <button type="button" data-action="musicaParar">⏹ Parar</button>`
                 + `  <button type="button" data-action="musicaDescargar">⬇ .mid</button>`
                 + `</div>`
                 + `<div class="music-roll" id="music-roll-${id}">`
                 + (_hayLibs() ? '<em>Cargando piano-roll…</em>'
                               : '<em>Partitura aproximada no disponible: carga Tone.js y @tonejs/midi.</em>')
                 + `</div></div>`;
        },

        async onMount(tarjeta, contenedor) {
            if (!_hayLibs() || !contenedor) return;
            const box = contenedor.querySelector('.music-roll');
            if (!box || !tarjeta.MediaId) return;
            const blob = await _obtenerBlob(tarjeta.MediaId);
            if (!blob) { box.innerHTML = '<em>Archivo .mid no encontrado en la biblioteca local.</em>'; return; }
            try {
                const buf = await _leerBuffer(blob);
                const midi = new window.MIDI(buf);
                MusicRoll.dibujar(box, midi, tarjeta);
            } catch (e) {
                Logger.error('Renderer musica: fallo parseando .mid:', e);
                box.innerHTML = '<em>Error leyendo el archivo .mid.</em>';
            }
        },

        onUnmount() {
            detener();
        }
    });

    // ── Reproducción aislada del pasaje con Tone.js ──────────────
    let _synth = null;
    const _timers = [];

    async function reproducir(tarjeta) {
        if (!_hayLibs()) {
            if (typeof Toast !== 'undefined' && Toast.show) Toast.show('Faltan Tone.js / @tonejs/midi para reproducir.', 'warning');
            return;
        }
        const blob = await _obtenerBlob(tarjeta.MediaId);
        if (!blob) return;
        detener();
        const midi = new window.MIDI(await _leerBuffer(blob));
        // Notas ya vienen en segundos gracias a @tonejs/midi (usa el tempo map)
        const { ini, fin } = MusicRoll.rangoSegundos(midi, tarjeta.CompasIni, tarjeta.CompasFin);

        const events = [];
        midi.tracks.forEach(tr => tr.notes.forEach(n => {
            if (n.time < ini - 0.05 || n.time > fin) return;
            if (tarjeta.Mano === 'der' && n.midi < 60) return;   // C4 ≈ divisoria de manos
            if (tarjeta.Mano === 'izq' && n.midi >= 60) return;
            events.push({ off: Math.max(0, n.time - ini), name: n.name, dur: n.duration });
        }));
        if (!events.length) return;

        await window.Tone.start();           // exige gesto del usuario (el clic del botón lo es)
        _synth = _synth || new window.Tone.PolySynth(window.Tone.Synth).toDestination();
        events.forEach(ev => {
            _timers.push(setTimeout(() => {
                try { _synth.triggerAttackRelease(ev.name, ev.dur); } catch (e) {}
            }, ev.off * 1000));
        });
    }

    function detener() {
        _timers.forEach(clearTimeout);
        _timers.length = 0;
        try { _synth?.releaseAll(); } catch (e) {}
    }

    // Handlers registrados en CommandRegistry (despachados por delegación de onclick)
    CommandRegistry.register('musicaReproducir', () => {
        const t = State.get('conceptoActual');
        if (t) reproducir(t);
    });
    CommandRegistry.register('musicaParar', detener);
    CommandRegistry.register('musicaDescargar', async () => {
        const t = State.get('conceptoActual');
        if (!t?.MediaId) return;
        const blob = await _obtenerBlob(t.MediaId);
        if (blob) _descargar(blob, `${(t.Pieza || 'pasaje').replace(/[^\w\-]+/g, '_')}.mid`);
    });

    // ── Utilidades de troceado compartido (UI import + renderer) ──
    window.MusicRoll = {
        /** Convierte fronteras de compás a segundos usando el tempo map de Tone.js */
        rangoSegundos(midi, compasIni, compasFin) {
            const bpm = midi.header.tempos?.[0]?.bpm || 120;
            const num = midi.header.timeSignatures?.[0]?.timeSignature?.[0] || 4;
            const spb = 60 / bpm;                       // segundos por negra
            const compasSeg = spb * num;                // aproximación: compás de 'num' negras
            return { ini: (compasIni - 1) * compasSeg, fin: compasFin * compasSeg };
        },
        /**
         * Auto-troceado: divide la duración total en pasajes de `compasesPorPasaje`
         * y devuelve semillas de tarjeta 'musica' listas para encolar.
         * Duración estimada con el tempo/time-signature del primer tramo del mapa.
         */
        trocear(midi, { pieza = '', compasesPorPasaje = 8, mano = 'ambas', tempo = null } = {}) {
            const bpm = midi.header.tempos?.[0]?.bpm || 120;
            const num = midi.header.timeSignatures?.[0]?.timeSignature?.[0] || 4;
            const compasSeg = (60 / bpm) * num;
            const durSeg = (midi.duration && isFinite(midi.duration)) ? midi.duration : 0;
            const totalCompases = Math.max(1, Math.ceil(durSeg / compasSeg));
            const tarjetas = [];
            for (let ini = 1; ini <= totalCompases; ini += compasesPorPasaje) {
                const fin = Math.min(totalCompases, ini + compasesPorPasaje - 1);
                tarjetas.push({
                    Tipo: 'musica', Apartado: 'Musica', Tema: pieza || 'Pasaje',
                    Titulo: `${pieza || 'Pieza'} · c. ${ini}–${fin}`,
                    Contenido: `Pasaje compases ${ini}–${fin}`,
                    Pieza: pieza, CompasIni: ini, CompasFin: fin,
                    Mano: mano, Tempo: tempo || Math.round(bpm),
                    MediaId: null, EtapaRepaso: 0, UltimoRepaso: null, ProximoRepaso: null
                });
            }
            return tarjetas;
        },
        /** Piano-roll minimalista en SVG limitado al pasaje (aproximación cuantizada) */
        dibujar(box, midi, tarjeta) {
            if (typeof document === 'undefined') return;   // entorno de tests: sin DOM
            const { ini, fin } = this.rangoSegundos(midi, tarjeta.CompasIni ?? 1, tarjeta.CompasFin ?? Infinity);
            const notas = [];
            midi.tracks.forEach(tr => tr.notes.forEach(n => {
                if (n.time >= ini - 0.05 && n.time <= fin) notas.push({ t: n.time - ini, d: n.duration, midi: n.midi });
            }));
            if (!notas.length) { box.innerHTML = '<em>Sin notas en este pasaje.</em>'; return; }
            const pitches = notas.map(n => n.midi);
            const pMin = Math.min(...pitches), pMax = Math.max(...pitches);
            const tMax = Math.max(...notas.map(n => n.t + n.d)) || 1;
            const W = 600, H = 160, fila = (H - 10) / Math.max(1, pMax - pMin + 1);
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.style.width = '100%';
            notas.forEach(n => {
                const r = document.createElementNS(ns, 'rect');
                r.setAttribute('x', (n.t / tMax) * W);
                r.setAttribute('y', H - (n.midi - pMin + 1) * fila);
                r.setAttribute('width', Math.max(2, (n.d / tMax) * W));
                r.setAttribute('height', Math.max(2, fila - 1));
                r.setAttribute('fill', 'var(--accent)');
                svg.appendChild(r);
            });
            box.innerHTML = '';
            box.appendChild(svg);
        }
    };
})();

// ════════════════════════════════════════════════════════════════
// TTS — botón 🔊 global (speechSynthesis, coste cero)
// ════════════════════════════════════════════════════════════════

CommandRegistry.register('ttsDecir', (dataset) => {
    if (typeof window.speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(dataset.texto || '');
    u.lang = dataset.lang || 'es';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
});
