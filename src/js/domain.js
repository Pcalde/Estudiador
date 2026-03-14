// ════════════════════════════════════════════════════════════════
// DOMAIN.JS — Lógica pura de planificación y fechas
//
// REGLAS DE ORO de este módulo:
//   1. Ninguna función toca el DOM (sin document.*, sin innerHTML).
//   2. Ninguna función produce efectos secundarios en el estado global.
//   3. Los parámetros que leen estado global lo reciben como argumento,
//      o los acceden como lectura (nunca escritura) de window.
//   4. El núcleo SRS (Scheduler.*) opera por paso de valor (structuredClone).
//
// Algoritmo: FSRS-6 (21 parámetros, curva de olvido personalizable por usuario)
// Ref: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// ════════════════════════════════════════════════════════════════

    // ── Constantes heredadas (usadas por código externo) ─────────
    const INTERVALOS = [2, 3, 5, 7];   // conservado por retrocompatibilidad
    const DATE_FORMAT_STORAGE = 'yyyy-MM-dd';
    const DATE_FORMAT_LEGACY  = 'dd/MM/yyyy';


// ════════════════════════════════════════════════════════════════
// UTILIDADES DE FECHAS
// ════════════════════════════════════════════════════════════════

    function parseDateSafe(value) {
        if (!value) return null;
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) return null;
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                const [y, m, d] = raw.split('-').map(Number);
                return new Date(y, m - 1, d);
            }
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
                const [d, m, y] = raw.split('/').map(Number);
                return new Date(y, m - 1, d);
            }
            const nativeDate = new Date(raw);
            if (!Number.isNaN(nativeDate.getTime()))
                return new Date(nativeDate.getFullYear(), nativeDate.getMonth(), nativeDate.getDate());
        }
        if (typeof value === 'number') {
            const nativeDate = new Date(value);
            if (!Number.isNaN(nativeDate.getTime()))
                return new Date(nativeDate.getFullYear(), nativeDate.getMonth(), nativeDate.getDate());
        }
        return null;
    }

    function toISODateString(value) {
        const parsed = parseDateSafe(value);
        if (!parsed) return '';
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateForUI(value) {
        const parsed = parseDateSafe(value);
        if (!parsed) return '-';
        const d = String(parsed.getDate()).padStart(2, '0');
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const y = parsed.getFullYear();
        return `${d}/${m}/${y}`;
    }

    function getFechaHoy() { return toISODateString(new Date()); }
    function formatearFecha(d) { return toISODateString(d); }

    function fechaValor(value) {
        const parsed = parseDateSafe(value);
        return parsed ? parsed.getTime() : 0;
    }

    function esVencido(value) {
        const dueDate = parseDateSafe(value);
        if (!dueDate) return true;
        const today = parseDateSafe(new Date());
        return dueDate.getTime() <= today.getTime();
    }

    function diffDiasCalendario(fromValue, toValue) {
        const fromDate = parseDateSafe(fromValue);
        const toDate   = parseDateSafe(toValue);
        if (!fromDate || !toDate) return 0;
        const utcFrom = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        const utcTo   = Date.UTC(toDate.getFullYear(),   toDate.getMonth(),   toDate.getDate());
        return Math.round((utcTo - utcFrom) / 86400000);
    }


// ════════════════════════════════════════════════════════════════
// NORMALIZACIÓN DE FECHAS
// ════════════════════════════════════════════════════════════════

    function normalizarPomoFechas() {
        const regexAntiguo = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        function convertirClave(clave) {
            const match = clave.match(regexAntiguo);
            if (match) {
                return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
            }
            return clave;
        }
        try {
            const raw = localStorage.getItem('pomo_log_today');
            if (raw) {
                const log = JSON.parse(raw);
                if (log.date && regexAntiguo.test(log.date)) {
                    log.date = convertirClave(log.date);
                    localStorage.setItem('pomo_log_today', JSON.stringify(log));
                }
            }
        } catch(e) { console.error('Error migrando pomo_log_today:', e); }
        try {
            const raw = localStorage.getItem('pomo_history');
            if (raw) {
                const history = JSON.parse(raw);
                let mod = false;
                const nuevo = {};
                for (const [f, v] of Object.entries(history)) {
                    const nf = convertirClave(f);
                    nuevo[nf] = v;
                    if (nf !== f) mod = true;
                }
                if (mod) localStorage.setItem('pomo_history', JSON.stringify(nuevo));
            }
        } catch(e) { console.error('Error migrando pomo_history:', e); }
        try {
            const raw = localStorage.getItem('pomo_details_history');
            if (raw) {
                const details = JSON.parse(raw);
                let mod = false;
                const nuevo = {};
                for (const [f, v] of Object.entries(details)) {
                    const nf = convertirClave(f);
                    nuevo[nf] = v;
                    if (nf !== f) mod = true;
                }
                if (mod) localStorage.setItem('pomo_details_history', JSON.stringify(nuevo));
            }
        } catch(e) { console.error('Error migrando pomo_details_history:', e); }
    }

    function normalizarTarjetaFechas(tarjeta) {
        if (!tarjeta || typeof tarjeta !== 'object') return;
        tarjeta.UltimoRepaso  = toISODateString(tarjeta.UltimoRepaso)  || null;
        tarjeta.ProximoRepaso = toISODateString(tarjeta.ProximoRepaso) || null;
    }

    function normalizarBibliotecaFechas() {
        Object.keys(biblioteca || {}).forEach(asig => {
            if (!Array.isArray(biblioteca[asig])) return;
            biblioteca[asig].forEach(normalizarTarjetaFechas);
        });
    }

    function normalizarFechasClave() {
        if (!Array.isArray(fechasClave)) return;
        fechasClave = fechasClave
            .map(ev => ({ ...ev, fecha: toISODateString(ev?.fecha) }))
            .filter(ev => !!ev.fecha);
    }


// ════════════════════════════════════════════════════════════════
// OBJETIVOS Y DEUDA
// ════════════════════════════════════════════════════════════════

    function getObjetivoHoy() {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1;
        if (diaSemana === -1) diaSemana = 6;
        let sumaTotal = 0;
        Object.keys(horarioGlobal).forEach(asig => {
            if (biblioteca[asig] || asig === 'General')
                sumaTotal += (horarioGlobal[asig][diaSemana] || 0);
        });
        return sumaTotal > 0 ? sumaTotal : 4;
    }

    function getObjetivoContextual() {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1;
        if (diaSemana === -1) diaSemana = 6;
        if (!nombreAsignaturaActual) return getObjetivoHoy();
        let obj = 0;
        if (horarioGlobal[nombreAsignaturaActual])
            obj += (horarioGlobal[nombreAsignaturaActual][diaSemana] || 0);
        if (horarioGlobal['General'] && nombreAsignaturaActual !== 'General')
            obj += (horarioGlobal['General'][diaSemana] || 0);
        return obj > 0 ? obj : 1;
    }

    function calcularDeuda() {
        if (!nombreAsignaturaActual || !biblioteca[nombreAsignaturaActual]) return 0;
        const todayVal = fechaValor(getFechaHoy());
        const pesos    = { 1: 0.5, 2: 1, 3: 2, 4: 4 };
        let deuda = 0;
        biblioteca[nombreAsignaturaActual].forEach(c => {
            if (c.ProximoRepaso && fechaValor(c.ProximoRepaso) <= todayVal) {
                const dif = (c.Dificultad == null) ? 2 : parseInt(c.Dificultad);
                deuda += (pesos[dif] || 1);
            }
        });
        return Math.round(deuda);
    }


// ════════════════════════════════════════════════════════════════
// FSRS-6 — NÚCLEO MATEMÁTICO
// ════════════════════════════════════════════════════════════════
//
// Parámetros por defecto optimizados sobre ~500M repasos de ~10k usuarios.
// Fuente: https://github.com/open-spaced-repetition/srs-benchmark
//
// Índice de parámetros:
//   w[0..3]   → S inicial para grades Again/Hard/Good/Easy
//   w[4..7]   → dificultad D (inicial y actualización)
//   w[8..14]  → estabilidad S tras revisión (éxito y lapse)
//   w[15]     → penalización Hard en S_r
//   w[16]     → bonificación Easy en S_r
//   w[17..19] → revisión mismo día (S_st, NUEVO en FSRS-5/6)
//   w[20]     → curvatura de la curva de olvido (NUEVO en FSRS-6, 0.1–0.8)
//
// Mapeo de calidades app → grades FSRS:
//   App: 1=Fácil  2=Bien  3=Difícil  4=Crítica
//   FSRS: 4=Easy  3=Good  2=Hard     1=Again
// ════════════════════════════════════════════════════════════════

const FSRS6_W_DEFAULT = [
    0.212,  1.2931, 2.3065, 8.2956,   // w0-w3:  S0 por grade Again/Hard/Good/Easy
    6.4133, 0.8334, 3.0194, 0.001,    // w4-w7:  dificultad
    1.8722, 0.1666, 0.796,  1.4835,   // w8-w11: estabilidad éxito / lapse
    0.0614, 0.2629, 1.6483, 0.6014,   // w12-w15
    1.8729, 0.5425, 0.0912, 0.0658,   // w16-w19
    0.1542                             // w20: curvatura
];

const FSRS6_DR_DEFAULT   = 0.90;
const FSRS6_MAX_INTERVAL = 36500;    // 100 años como techo absoluto

// ── Funciones matemáticas internas ───────────────────────────────

/** App grade (1-4) → FSRS grade (4-1) */
function appGradeToFSRS(g) { return 5 - g; }

/**
 * Curva de olvido FSRS-6:
 *   R(t,S) = (1 + FACTOR·t/S)^DECAY
 *   DECAY  = -w[20]
 *   FACTOR = 0.9^(1/DECAY) – 1
 *   → garantiza R(S,S) = 0.9 para cualquier w[20]
 */
function fsrsR(t, S, w20) {
    const DECAY  = -w20;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
    return Math.pow(1 + FACTOR * t / S, DECAY);
}

/** Intervalo óptimo: I = S/FACTOR · (DR^(1/DECAY) – 1) */
function fsrsInterval(S, DR, w20, maxI = FSRS6_MAX_INTERVAL) {
    const DECAY  = -w20;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
    const I      = (S / FACTOR) * (Math.pow(DR, 1 / DECAY) - 1);
    return Math.min(Math.max(1, Math.round(I)), maxI);
}

/** S0(G) = w[G-1]  (G ∈ {1,2,3,4}) */
function fsrsS0(G, w) { return Math.max(0.1, w[G - 1]); }

/** D0(G) = w[4] – exp(w[5]·(G–1)) + 1  clamp [1,10] */
function fsrsD0(G, w) {
    return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (G - 1)) + 1));
}

/**
 * Actualización de D:
 *   ΔD  = –w[6]·(G–3)
 *   D'  = D + ΔD·(10–D)/9          (amortiguación lineal)
 *   D'' = w[7]·D0(Easy) + (1–w[7])·D'   (regresión a la media)  clamp [1,10]
 */
function fsrsDnext(D, G, w) {
    const dD   = -w[6] * (G - 3);
    const Dp   = D + dD * (10 - D) / 9;
    const D0e  = fsrsD0(4, w);   // ancla = Easy default
    return Math.min(10, Math.max(1, w[7] * D0e + (1 - w[7]) * Dp));
}

/**
 * S tras revisión exitosa (Hard/Good/Easy):
 *   SInc = 1 + exp(w[8])·(11–D)·S^(–w[9])·(exp((1–R)·w[10])–1)·hPen·eBonus
 *   S'_r = S · SInc   (S no puede bajar en éxito)
 */
function fsrsSr(D, S, R, G, w) {
    const hPen   = G === 2 ? w[15] : 1;
    const eBonus = G === 4 ? w[16] : 1;
    const SInc   = 1 + Math.exp(w[8]) * (11 - D)
        * Math.pow(S, -w[9])
        * (Math.exp((1 - R) * w[10]) - 1)
        * hPen * eBonus;
    return Math.max(S, S * SInc);
}

/**
 * S tras lapse (Again):
 *   S'_f = w[11]·D^(–w[12])·((S+1)^w[13]–1)·exp((1–R)·w[14])
 *          min(S'_f, S)
 */
function fsrsSf(D, S, R, w) {
    const raw = w[11]
        * Math.pow(D, -w[12])
        * (Math.pow(S + 1, w[13]) - 1)
        * Math.exp((1 - R) * w[14]);
    return Math.min(S, Math.max(0.1, raw));
}

/**
 * S tras revisión el mismo día (FSRS-5/6):
 *   S'_st = S · exp(w[17]·(G–3+w[18])) · S^(–w[19])
 *   Si G ≥ 3: S'_st ≥ S  (Good/Easy no pueden bajar S)
 */
function fsrsSst(S, G, w) {
    const newS = S * Math.exp(w[17] * (G - 3 + w[18])) * Math.pow(S, -w[19]);
    return G >= 3 ? Math.max(S, newS) : Math.max(0.1, newS);
}

/**
 * Migración suave: tarjetas del algoritmo antiguo → estado FSRS inicial.
 * Solo se ejecuta una vez por tarjeta (si fsrs_stability ya existe, no hace nada).
 */

function migrarAFsrs6(tarjeta) {
    const t = structuredClone(tarjeta);
    
    // 1. INYECCIÓN DE IDENTIDAD ESTABLE (UUID)
    if (!t.id) {
        t.id = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : 'c_' + Date.now() + Math.random().toString(36).slice(2);
    }

    if (t.fsrs_stability != null) return t;
    
    t.fsrs_lapses = t.fsrs_lapses ?? 0;
    t.review_log  = t.review_log  ?? [];

    if (!t.ProximoRepaso || (t.EtapaRepaso || 0) === 0) {
        t.fsrs_stability  = null;
        t.fsrs_difficulty = null;
        t.fsrs_state      = 'new';
        return t;
    }

    const S = t.UltimoRepaso
        ? Math.max(1, diffDiasCalendario(t.UltimoRepaso, t.ProximoRepaso))
        : INTERVALOS[Math.min((t.EtapaRepaso || 0), INTERVALOS.length - 1)];

    const dif = parseInt(t.Dificultad) || 2;
    const D   = Math.min(10, Math.max(1, dif * 2));

    t.fsrs_stability  = S;
    t.fsrs_difficulty = D;
    t.fsrs_state      = 'review';
    return t;
}






// ════════════════════════════════════════════════════════════════
// Scheduler — API pública del módulo SRS
// ════════════════════════════════════════════════════════════════

const Scheduler = {

    /**
     * Avanza el estado de una tarjeta según la calidad del repaso (FSRS-6).
     *
     * @param {Object}   tarjeta  - Tarjeta (con estado FSRS o legado; se migra aquí).
     * @param {number}   calidad  - Grade app: 1=Fácil, 2=Bien, 3=Difícil, 4=Crítica.
     * @param {number[]} _unused  - Parámetro heredado (intervalos legacy), ignorado.
     * @param {Object}   opts     - { w, desiredRetention, isSameDay }
     *
     * @returns {{ tarjeta, reencolar, intervalDias, R }}
     */
    calcularSiguienteRepaso(tarjeta, calidad, _unused, opts = {}) {
        const w         = opts.w                 || FSRS6_W_DEFAULT;
        const DR        = opts.desiredRetention  || FSRS6_DR_DEFAULT;
        const isSameDay = opts.isSameDay         || false;

        let t = migrarAFsrs6(structuredClone(tarjeta));
        const G = appGradeToFSRS(calidad);   // 1=Again … 4=Easy

        // Retención en el momento de la revisión
        const elapsed = t.UltimoRepaso
            ? Math.max(0, diffDiasCalendario(t.UltimoRepaso, getFechaHoy()))
            : 0;
        const R = (t.fsrs_stability != null && elapsed > 0)
            ? fsrsR(elapsed, t.fsrs_stability, w[20])
            : 1.0;

        // Nuevos S y D según estado
        let newS, newD;
        if (t.fsrs_state === 'new' || t.fsrs_stability == null) {
            newS = fsrsS0(G, w);
            newD = fsrsD0(G, w);
        } else if (isSameDay) {
            newS = fsrsSst(t.fsrs_stability, G, w);
            newD = fsrsDnext(t.fsrs_difficulty, G, w);
        } else if (G === 1) {
            newS = fsrsSf(t.fsrs_difficulty, t.fsrs_stability, R, w);
            newD = fsrsDnext(t.fsrs_difficulty, G, w);
            t.fsrs_lapses = (t.fsrs_lapses || 0) + 1;
        } else {
            newS = fsrsSr(t.fsrs_difficulty, t.fsrs_stability, R, G, w);
            newD = fsrsDnext(t.fsrs_difficulty, G, w);
        }

        const reencolar    = (G === 1);
        const intervalDias = reencolar ? 1 : fsrsInterval(newS, DR, w[20]);

        const fechaBase = new Date();
        fechaBase.setDate(fechaBase.getDate() + (reencolar ? 0 : intervalDias));

        // Campos FSRS
        t.fsrs_stability  = newS;
        t.fsrs_difficulty = newD;
        t.fsrs_state      = (G === 1 && t.fsrs_state !== 'review') ? 'learning' : 'review';

        // Campos legacy (para compatibilidad con el resto del código)
        t.Dificultad    = calidad;
        t.EtapaRepaso   = t.fsrs_state === 'review'
            ? Math.round(Math.log2(Math.max(1, newS)))
            : 0;
        t.UltimoRepaso  = getFechaHoy();
        t.ProximoRepaso = formatearFecha(fechaBase);

        // ── PERSISTENCIA DE TELEMETRÍA (FIRE & FORGET) ──
        if (typeof DB !== 'undefined' && t.id) {
            DB.addRevlog({
                cardId: t.id,
                ts:     Date.now(), 
                g:      G,          
                elap:   elapsed,    
                sched:  intervalDias,
                st:     t.fsrs_state === 'new' ? 0 : (t.fsrs_state === 'learning' ? 1 : 2)
            }).catch(e => console.error("Fallo guardando Revlog local:", e));
        }
        
        // Limpiamos la basura del localStorage si existía en esta tarjeta
        if (t.review_log) delete t.review_log;

        return { tarjeta: t, reencolar, intervalDias, R };
    },

    /** Días hasta el próximo repaso (negativo = atrasada). */
    diasHastaRepaso(tarjeta) {
        if (!tarjeta.ProximoRepaso) return 0;
        return diffDiasCalendario(getFechaHoy(), tarjeta.ProximoRepaso);
    },

    /** Retención actual estimada (0-1), o null si no hay estado FSRS. */
    retenciónActual(tarjeta, w = FSRS6_W_DEFAULT) {
        if (tarjeta.fsrs_stability == null || !tarjeta.UltimoRepaso) return null;
        const elapsed = Math.max(0, diffDiasCalendario(tarjeta.UltimoRepaso, getFechaHoy()));
        return fsrsR(elapsed, tarjeta.fsrs_stability, w[20]);
    },

    /** Deuda ponderada de un array de tarjetas (escala legacy conservada). */
    calcularDeudaArray(tarjetas) {
        const pesos    = { 1: 0.5, 2: 1, 3: 2, 4: 4 };
        const todayVal = fechaValor(getFechaHoy());
        let deuda = 0;
        for (const c of tarjetas) {
            if (!c.ProximoRepaso || fechaValor(c.ProximoRepaso) > todayVal) continue;
            const dif = (c.Dificultad == null) ? 2 : parseInt(c.Dificultad);
            deuda += pesos[dif] || 1;
        }
        return deuda;
    },

    /**
     * Vista previa de los 4 intervalos posibles para una tarjeta.
     * Útil para mostrar al usuario qué pasará al pulsar cada botón.
     */
    previstaIntervalos(tarjeta, opts = {}) {
        const labels = ['Fácil', 'Bien', 'Difícil', 'Crítica'];
        return [1, 2, 3, 4].map((calidad, i) => {
            const { intervalDias, tarjeta: t, R } =
                this.calcularSiguienteRepaso(tarjeta, calidad, null, opts);
            return {
                label:       labels[i],
                calidad,
                intervalDias,
                newS:        parseFloat(t.fsrs_stability.toFixed(2)),
                newD:        parseFloat(t.fsrs_difficulty.toFixed(2)),
                R:           parseFloat(R.toFixed(3)),
            };
        });
    },

    DEFAULTS: {
        w:                FSRS6_W_DEFAULT,
        desiredRetention: FSRS6_DR_DEFAULT,
        maxInterval:      FSRS6_MAX_INTERVAL,
    },

    // Expuesto para el futuro optimizador de parámetros por usuario
    _math: { fsrsR, fsrsInterval, fsrsS0, fsrsD0, fsrsDnext, fsrsSr, fsrsSf, fsrsSst,
             appGradeToFSRS, migrarAFsrs6 },
};
