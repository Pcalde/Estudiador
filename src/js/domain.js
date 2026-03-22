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

    // ── Constantes heredadas ─────────
    const INTERVALOS = [2, 3, 5, 7];
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
            const match = clave?.match(regexAntiguo);
            return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : clave;
        }

        // 1. Log singular del día
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

        // 2. Extracción DRY para diccionarios
        function migrarDiccionario(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const dict = JSON.parse(raw);
                let mod = false;
                const nuevo = {};
                for (const [f, v] of Object.entries(dict)) {
                    const nf = convertirClave(f);
                    nuevo[nf] = v;
                    if (nf !== f) mod = true;
                }
                if (mod) localStorage.setItem(key, JSON.stringify(nuevo));
            } catch(e) { console.error(`Error migrando ${key}:`, e); }
        }

        migrarDiccionario('pomo_history');
        migrarDiccionario('pomo_details_history');
    }

    function normalizarTarjetaFechas(tarjeta) {
        if (!tarjeta || typeof tarjeta !== 'object') return;
        tarjeta.UltimoRepaso  = toISODateString(tarjeta.UltimoRepaso)  || null;
        tarjeta.ProximoRepaso = toISODateString(tarjeta.ProximoRepaso) || null;
    }

    function normalizarBibliotecaFechas(bibliotecaParam) {
        Object.keys(bibliotecaParam || {}).forEach(asig => {
            if (!Array.isArray(bibliotecaParam[asig])) return;
            bibliotecaParam[asig].forEach(normalizarTarjetaFechas);
        });
    }

    function normalizarFechasClave(fechasClaveParam) {
        if (!Array.isArray(fechasClaveParam)) return [];
        return fechasClaveParam
            .map(ev => ({ ...ev, fecha: toISODateString(ev?.fecha) }))
            .filter(ev => !!ev.fecha);
    }

// ════════════════════════════════════════════════════════════════
// OBJETIVOS Y DEUDA
// ════════════════════════════════════════════════════════════════

    function getObjetivoHoy(horarioParam, bibliotecaParam) {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1;
        if (diaSemana === -1) diaSemana = 6;
        let sumaTotal = 0;
        Object.keys(horarioParam || {}).forEach(asig => {
            if ((bibliotecaParam && bibliotecaParam[asig]) || asig === 'General')
                sumaTotal += (horarioParam[asig][diaSemana] || 0);
        });
        return sumaTotal > 0 ? sumaTotal : 4;
    }

    function getObjetivoContextual(horarioParam, bibliotecaParam, asigActual) {
        const hoy = new Date();
        let diaSemana = hoy.getDay() - 1;
        if (diaSemana === -1) diaSemana = 6;
        if (!asigActual) return getObjetivoHoy(horarioParam, bibliotecaParam);
        let obj = 0;
        if (horarioParam && horarioParam[asigActual])
            obj += (horarioParam[asigActual][diaSemana] || 0);
        if (horarioParam && horarioParam['General'] && asigActual !== 'General')
            obj += (horarioParam['General'][diaSemana] || 0);
        return obj > 0 ? obj : 1;
    }

    function calcularDeuda(asigActual, bibliotecaParam) {
        if (!asigActual || !bibliotecaParam || !bibliotecaParam[asigActual]) return 0;
        return Math.round(Scheduler.calcularDeudaArray(bibliotecaParam[asigActual]));
    }

// ════════════════════════════════════════════════════════════════
// FSRS-6 — NÚCLEO MATEMÁTICO
// ════════════════════════════════════════════════════════════════

const FSRS6_W_DEFAULT = [
    0.212,  1.2931, 2.3065, 8.2956,
    6.4133, 0.8334, 3.0194, 0.001,
    1.8722, 0.1666, 0.796,  1.4835,
    0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658,
    0.1542
];

const FSRS6_DR_DEFAULT   = 0.90;
const FSRS6_MAX_INTERVAL = 36500;

// ── Caché de Constantes FSRS ───────────────────────────────────
let _cachedW20 = null;
let _cachedDecay = null;
let _cachedFactor = null;

function getFsrsConstants(w20) {
    if (_cachedW20 === w20) return { DECAY: _cachedDecay, FACTOR: _cachedFactor };
    _cachedDecay = -w20;
    _cachedFactor = Math.pow(0.9, 1 / _cachedDecay) - 1;
    _cachedW20 = w20;
    return { DECAY: _cachedDecay, FACTOR: _cachedFactor };
}

// ── Funciones matemáticas internas ───────────────────────────────

function appGradeToFSRS(g) { return 5 - g; }

function fsrsR(t, S, w20) {
    const { DECAY, FACTOR } = getFsrsConstants(w20);
    return Math.pow(1 + FACTOR * t / S, DECAY);
}

function fsrsInterval(S, DR, w20, maxI = FSRS6_MAX_INTERVAL) {
    const { DECAY, FACTOR } = getFsrsConstants(w20);
    const I = (S / FACTOR) * (Math.pow(DR, 1 / DECAY) - 1);
    return Math.min(Math.max(1, Math.round(I)), maxI);
}

function fsrsS0(G, w) { return Math.max(0.1, w[G - 1]); }

function fsrsD0(G, w) {
    return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (G - 1)) + 1));
}

function fsrsDnext(D, G, w) {
    const dD   = -w[6] * (G - 3);
    const Dp   = D + dD * (10 - D) / 9;
    const D0e  = fsrsD0(4, w);
    return Math.min(10, Math.max(1, w[7] * D0e + (1 - w[7]) * Dp));
}

function fsrsSr(D, S, R, G, w) {
    const hPen   = G === 2 ? w[15] : 1;
    const eBonus = G === 4 ? w[16] : 1;
    const SInc   = 1 + Math.exp(w[8]) * (11 - D)
        * Math.pow(S, -w[9])
        * (Math.exp((1 - R) * w[10]) - 1)
        * hPen * eBonus;
    return Math.max(S, S * SInc);
}

function fsrsSf(D, S, R, w) {
    const raw = w[11]
        * Math.pow(D, -w[12])
        * (Math.pow(S + 1, w[13]) - 1)
        * Math.exp((1 - R) * w[14]);
    return Math.min(S, Math.max(0.1, raw));
}

function fsrsSst(S, G, w) {
    const newS = S * Math.exp(w[17] * (G - 3 + w[18])) * Math.pow(S, -w[19]);
    return G >= 3 ? Math.max(S, newS) : Math.max(0.1, newS);
}

function migrarAFsrs6(tarjeta) {
    const t = structuredClone(tarjeta);
    
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

    calcularSiguienteRepaso(tarjeta, calidad, _unused, opts = {}) {
        const w         = opts.w                 || FSRS6_W_DEFAULT;
        const DR        = opts.desiredRetention  || FSRS6_DR_DEFAULT;
        const isSameDay = opts.isSameDay         || false;

        let t = migrarAFsrs6(structuredClone(tarjeta));
        const G = appGradeToFSRS(calidad);

        const elapsed = t.UltimoRepaso
            ? Math.max(0, diffDiasCalendario(t.UltimoRepaso, getFechaHoy()))
            : 0;
        const R = (t.fsrs_stability != null && elapsed > 0)
            ? fsrsR(elapsed, t.fsrs_stability, w[20])
            : 1.0;

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

        t.fsrs_stability  = newS;
        t.fsrs_difficulty = newD;
        t.fsrs_state      = (G === 1 && t.fsrs_state !== 'review') ? 'learning' : 'review';

        t.Dificultad    = calidad;
        t.EtapaRepaso   = t.fsrs_state === 'review'
            ? Math.round(Math.log2(Math.max(1, newS)))
            : 0;
        t.UltimoRepaso  = getFechaHoy();
        t.ProximoRepaso = toISODateString(fechaBase);

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
        
        if (t.review_log) delete t.review_log;

        return { tarjeta: t, reencolar, intervalDias, R };
    },

    diasHastaRepaso(tarjeta) {
        if (!tarjeta.ProximoRepaso) return 0;
        return diffDiasCalendario(getFechaHoy(), tarjeta.ProximoRepaso);
    },

    retencionActual(tarjeta, w = FSRS6_W_DEFAULT) {
        if (tarjeta.fsrs_stability == null || !tarjeta.UltimoRepaso) return null;
        const elapsed = Math.max(0, diffDiasCalendario(tarjeta.UltimoRepaso, getFechaHoy()));
        return fsrsR(elapsed, tarjeta.fsrs_stability, w[20]);
    },

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

    _math: { fsrsR, fsrsInterval, fsrsS0, fsrsD0, fsrsDnext, fsrsSr, fsrsSf, fsrsSst,
             appGradeToFSRS, migrarAFsrs6, getFsrsConstants },
};

/**
     * @function calcularHoraFinPomodoro
     * @description Calcula la hora estimada de finalización basándose en las tareas pendientes 
     * y la configuración de ciclos FSRS/Pomodoro. Función pura, sin efectos secundarios.
     * @param {Array} tasks - Lista de tareas del estado.
     * @param {Object} config - Configuración del Pomodoro (work, short, long, cyclesBeforeLong).
     * @param {number} ciclosActuales - Ciclos completados en la sesión actual.
     * @returns {string|null} Hora formateada (ej. "18:45") o null si no hay tareas.
     */
    /**
     * @function calcularHoraFinPomodoro
     * @description Calcula la hora de finalización blindada. Corrige el contrato de datos (t.est).
     */
    function calcularHoraFinPomodoro(tasks, config, ciclosActuales, currentMode, timeLeftSeconds) {
        try {
            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return null;
            
            const safeConfig = config || {};
            let remainingPomos = 0;
            
            tasks.forEach(t => { 
                if (!t.done) {
                    // FIX ARQUITECTÓNICO: Mapeo correcto de la propiedad heredada 'est'
                    const est = Number(t.est) || 1; 
                    const comp = Number(t.completed) || 0;
                    const pendientes = est - comp;
                    if (pendientes > 0) remainingPomos += pendientes;
                }
            });
            
            if (remainingPomos <= 0) return null;

            let timeSeconds = 0;
            const cbl = Number(safeConfig.cyclesBeforeLong) || 4;
            const wSec = (Number(safeConfig.work) || 25) * 60;
            const sSec = (Number(safeConfig.short) || 5) * 60;
            const lSec = (Number(safeConfig.long) || 15) * 60;
            
            let currentCycle = Number(ciclosActuales) || 0;
            const timeLeft = Number(timeLeftSeconds) || 0;

            if (currentMode === 'work') {
                timeSeconds += timeLeft;
                remainingPomos -= 1; 
                currentCycle += 1;
                if (remainingPomos > 0) {
                    timeSeconds += (currentCycle % cbl === 0) ? lSec : sSec;
                }
            } else {
                timeSeconds += timeLeft;
            }

            for (let i = 0; i < remainingPomos; i++) {
                timeSeconds += wSec;
                currentCycle += 1;
                if (i < remainingPomos - 1) {
                    timeSeconds += (currentCycle % cbl === 0) ? lSec : sSec;
                }
            }
            
            if (isNaN(timeSeconds)) return null;

            const now = new Date();
            now.setSeconds(now.getSeconds() + timeSeconds);
            return now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch (error) {
            Logger.error("Error en calcularHoraFinPomodoro:", error);
            return null;
        }
    }

    // ════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE CONTEXTO DE TAREAS POMODORO
// ════════════════════════════════════════════════════════════════

/**
 * Comprueba si un nombre corresponde a una asignatura conocida en la biblioteca.
 * Función pura: solo lee State como consulta, sin efectos secundarios.
 * @param {string} nombre
 * @returns {boolean}
 */
function esAsignaturaValida(nombre) {
    if (!nombre) return false;
    const n   = nombre.toLowerCase().trim();
    const bib = State.get('biblioteca') || {};
    return Object.keys(bib).some(k => k.toLowerCase().trim() === n);
}

/**
 * Extrae la asignatura de contexto a partir del texto de una tarea.
 * Soporta los formatos de tag:
 *   [Proyecto]           → busca si es asignatura directa o proyecto vinculado
 *   [Proyecto : Asig]    → extrae la asignatura explícita tras el separador ':'
 *
 * @param {string} taskText - Texto completo de la tarea (ej. "Repasar límites [Análisis]")
 * @param {string} fallback - Valor por defecto si no se resuelve contexto
 * @returns {string} Nombre de asignatura resuelto
 */
function resolverAsignaturaDeTarea(taskText, fallback = 'General') {
    if (!taskText) return fallback;

    const match = taskText.match(/\[([^\]]+)\]/);
    if (!match) return fallback;

    // Limpiar el tag: quitar '#' y espacios extremos
    const rawTag = match[1].replace(/#/g, '').trim();

    // Formato explícito [Proyecto : Asignatura] — separador con posibles espacios
    const separadorIdx = rawTag.indexOf(':');
    if (separadorIdx !== -1) {
        const posibleAsig = rawTag.slice(separadorIdx + 1).trim();
        if (esAsignaturaValida(posibleAsig)) {
            const bib       = State.get('biblioteca') || {};
            const nombreReal = Object.keys(bib).find(
                k => k.toLowerCase().trim() === posibleAsig.toLowerCase().trim()
            );
            return nombreReal || posibleAsig;
        }
    }

    // Formato simple [Tag]: comprobar si es asignatura directa
    if (esAsignaturaValida(rawTag)) {
        const bib        = State.get('biblioteca') || {};
        const nombreReal = Object.keys(bib).find(
            k => k.toLowerCase().trim() === rawTag.toLowerCase().trim()
        );
        return nombreReal || rawTag;
    }

    // Buscar si el tag corresponde a un proyecto vinculado a una asignatura
    const proyectos = State.get('projects') || [];
    const proyecto  = proyectos.find(p => {
        const pNombre = (typeof p === 'object' ? p.nombre : p) || '';
        return pNombre.toLowerCase().trim() === rawTag.toLowerCase().trim();
    });

    if (proyecto && typeof proyecto === 'object' && proyecto.asignatura) {
        return proyecto.asignatura;
    }

    // Tag desconocido: devolver el raw para que el caller decida
    return rawTag || fallback;
}

// ════════════════════════════════════════════════════════════════
// NAMESPACE DE LA CAPA DE DOMINIO (Exportación explícita)
// ════════════════════════════════════════════════════════════════

const Domain = {
    calcularHoraFinPomodoro,
    esAsignaturaValida,
    resolverAsignaturaDeTarea,
    parseDateSafe,
    toISODateString,
    formatDateForUI,
    getFechaHoy,
    formatearFecha,
    fechaValor,
    esVencido,
    diffDiasCalendario,
    normalizarPomoFechas,
    normalizarBibliotecaFechas,
    normalizarFechasClave,
    calcularDeuda,
};

// Exposición segura al objeto global para que otros scripts (pomodoro.js) lo detecten
window.Domain = Domain;