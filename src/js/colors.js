// ════════════════════════════════════════════════════════════════
// COLORS.JS — Motor de temas y colores dinámicos
// Cargado antes de: asignaturas.js, agenda.js, settings.js, app.js
// Dependencias globales: State, Util, Logger (app.js/boot)
// ════════════════════════════════════════════════════════════════

const COLOR_PRESETS = {
    'default': {
        '--bg-color': '#121212', '--menu-color': '#181818', '--card-bg': '#1e1e1e',
        '--text-main': '#e0e0e0', '--border': '#333333', '--accent': '#00ffcc',
        '--pomo-work': '#d95550', '--pomo-short': '#4c9195', '--pomo-long': '#457ca3',
        '--status-green': '#4CAF50', '--status-red': '#f44336', '--status-yellow': '#FF9800', '--status-blue': '#2196F3'
    },
    'nord': {
        '--bg-color': '#2e3440', '--menu-color': '#242933', '--card-bg': '#3b4252',
        '--text-main': '#eceff4', '--border': '#4c566a', '--accent': '#88c0d0',
        '--pomo-work': '#bf616a', '--pomo-short': '#a3be8c', '--pomo-long': '#5e81ac',
        '--status-green': '#a3be8c', '--status-red': '#bf616a', '--status-yellow': '#ebcb8b', '--status-blue': '#81a1c1'
    },
    'abyss': {
        '--bg-color': '#000000', '--menu-color': '#030303', '--card-bg': '#050505',
        '--text-main': '#d0d0d0', '--border': '#1a1a1a', '--accent': '#00ffcc',
        '--pomo-work': '#ff003c', '--pomo-short': '#00ffcc', '--pomo-long': '#7000ff',
        '--status-green': '#00ffaa', '--status-red': '#ff003c', '--status-yellow': '#ffaa00', '--status-blue': '#00aaff'
    },
    'terminal': {
        '--bg-color': '#0a0a0a', '--menu-color': '#050505', '--card-bg': '#0f0f0f',
        '--text-main': '#33ff33', '--border': '#114411', '--accent': '#33ff33',
        '--pomo-work': '#ff3333', '--pomo-short': '#33ff33', '--pomo-long': '#33aaff',
        '--status-green': '#33ff33', '--status-red': '#ff3333', '--status-yellow': '#ffff33', '--status-blue': '#33aaff'
    }
};

let currentCustomPalette = {};
let currentPresetName = 'default';

function guardarColoresGlobales(basePreset, overrides) {
    localStorage.setItem('estudiador_paleta_global', JSON.stringify({ basePreset, overrides }));
}

function inyectarVariablesCSS(paleta) {
    const root = document.documentElement;
    Object.keys(paleta).forEach(key => {
        root.style.setProperty(key, paleta[key]);
        const input = document.querySelector(`input[data-var="${key}"]`);
        if (input) input.value = paleta[key];
    });
}

function cargarColoresGlobales() {
    const saved = Util.loadLS('estudiador_paleta_global', { basePreset: 'default', overrides: {} });

    if (!COLOR_PRESETS[saved.basePreset]) saved.basePreset = 'default';

    const paletaActiva = { ...COLOR_PRESETS[saved.basePreset], ...saved.overrides };
    inyectarVariablesCSS(paletaActiva);

    const select = document.getElementById('set-color-preset');
    if (select) {
        select.value = Object.keys(saved.overrides).length > 0 ? 'custom' : saved.basePreset;
    }
}

/**
 * Resuelve el color de una asignatura: primero colores del usuario, luego hash HSL.
 */
function getColorAsignatura(nombreRaw) {
    if (!nombreRaw) return "#888888";
    const nombreNormalizado = String(nombreRaw).trim().toLowerCase();

    const userColors = State.get('userColors') || {};
    const userMatch = Object.keys(userColors).find(k => k.toLowerCase() === nombreNormalizado);
    if (userMatch && userColors[userMatch]) return userColors[userMatch];

    let hash = 0;
    for (let i = 0; i < nombreNormalizado.length; i++) {
        hash = nombreNormalizado.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash % 360)}, 65%, 55%)`;
}

/** Convierte cualquier color CSS a HEX usando el DOM como intérprete. */
function rgbToHex(col) {
    if (!col) return "#888888";
    if (col.startsWith('#')) return col;
    const temp = document.createElement("div");
    temp.style.color = col;
    document.body.appendChild(temp);
    const color = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const rgb = color.match(/\d+/g);
    if (!rgb) return "#888888";
    return "#" + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
}

/** Wrapper que lee la biblioteca del Estado para el panel de ajustes. */
function renderColorSettings() {
    UI.renderColorSettings(State.get('biblioteca') || {});
}

// Expuestos en window para módulos cargados antes de conocer el scope
window.getColorAsignatura = getColorAsignatura;
window.rgbToHex = rgbToHex;
