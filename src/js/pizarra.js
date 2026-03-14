// ════════════════════════════════════════════════════════════════
// PIZARRA.JS — Aislamiento del subsistema de Canvas
// API pública: { init, toggle, setModo, setColor, setGrosor, limpiar, undo }
// ════════════════════════════════════════════════════════════════

const Pizarra = (() => {
    let canvas, ctx;
    let pintando = false;
    let colorLapiz = "#ffff00";
    let grosorLapiz = 3;
    let modoPizarra = 'lapiz'; // 'lapiz' | 'resaltador' | 'linea' | 'borrador'

    const pizarraHistorial = [];
    const PIZARRA_MAX_UNDO = 30;
    let lineaStartX = 0, lineaStartY = 0;
    let snapshotAntesLinea = null;

    function init() {
        canvas = document.getElementById('pizarra-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d', { willReadFrequently: true });

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        canvas.addEventListener('mousedown',  (e) => { aplicarContextoActual(); iniciarTrazo(...getCoordsRaton(e)); });
        canvas.addEventListener('mousemove',  (e) => moverTrazo(...getCoordsRaton(e)));
        canvas.addEventListener('mouseup',    () => finalizarTrazo());
        canvas.addEventListener('mouseleave', () => finalizarTrazo());

        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); aplicarContextoActual(); iniciarTrazo(...getCoordsTactil(e)); }, { passive: false });
        canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); moverTrazo(...getCoordsTactil(e)); }, { passive: false });
        canvas.addEventListener('touchend',   () => finalizarTrazo());

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !canvas.classList.contains('hidden')) {
                e.preventDefault();
                undo();
            }
        });
    }

    function resizeCanvas() {
        const img = canvas.toDataURL();
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        if (img && img !== 'data:,') {
            const image = new Image();
            image.onload = () => ctx.drawImage(image, 0, 0);
            image.src = img;
        }
        aplicarContextoActual();
    }

    function aplicarContextoActual() {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (modoPizarra === 'borrador') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = 1;
            ctx.lineWidth   = grosorLapiz * 4;
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (modoPizarra === 'resaltador') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.35;
            ctx.lineWidth   = grosorLapiz * 5;
            ctx.strokeStyle = colorLapiz;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.lineWidth   = grosorLapiz;
            ctx.strokeStyle = colorLapiz;
        }
    }

    function guardarSnapshot() {
        pizarraHistorial.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (pizarraHistorial.length > PIZARRA_MAX_UNDO) pizarraHistorial.shift();
    }

    function undo() {
        if (pizarraHistorial.length === 0) return;
        ctx.putImageData(pizarraHistorial.pop(), 0, 0);
    }

    function getCoordsRaton(e)  { return [e.clientX, e.clientY]; }
    function getCoordsTactil(e) { const t = e.touches[0]; return [t.clientX, t.clientY]; }

    function iniciarTrazo(x, y) {
        guardarSnapshot();
        pintando = true;
        if (modoPizarra === 'linea') {
            lineaStartX = x; lineaStartY = y;
            snapshotAntesLinea = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } else {
            ctx.beginPath(); ctx.moveTo(x, y);
        }
    }

    function moverTrazo(x, y) {
        if (!pintando) return;
        if (modoPizarra === 'linea') {
            ctx.putImageData(snapshotAntesLinea, 0, 0);
            aplicarContextoActual();
            ctx.beginPath(); ctx.moveTo(lineaStartX, lineaStartY); ctx.lineTo(x, y); ctx.stroke();
        } else {
            ctx.lineTo(x, y); ctx.stroke();
        }
    }

    function finalizarTrazo() { pintando = false; snapshotAntesLinea = null; }

    // ── API pública ───────────────────────────────────────────────

    function setModo(modo) {
        modoPizarra = modo;
        aplicarContextoActual();
        ['lapiz', 'resaltador', 'linea', 'borrador'].forEach(m => {
            const btn = document.getElementById('pz-btn-' + m);
            if (btn) {
                btn.style.background   = (m === modo) ? '#555' : '#333';
                btn.style.borderColor  = (m === modo) ? 'var(--accent)' : '#555';
            }
        });
        canvas.style.cursor = modo === 'borrador' ? 'cell' : 'crosshair';
    }

    function setColor(c) {
        colorLapiz = c;
        const picker = document.getElementById('pizarra-color');
        if (picker) picker.value = c;
        ['amarillo', 'blanco', 'cyan', 'salmon', 'verde'].forEach(nombre => {
            const el = document.getElementById('pz-color-' + nombre);
            if (el) el.style.borderColor = '#555';
        });
        if (modoPizarra !== 'borrador') aplicarContextoActual();
    }

    function setGrosor(g) { grosorLapiz = parseInt(g); aplicarContextoActual(); }

    function limpiar() {
        guardarSnapshot();
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        aplicarContextoActual();
    }

    function toggle(forzarEstado = null) {
        const tools    = document.getElementById('pizarra-tools');
        const isActive = !canvas.classList.contains('hidden');
        const nuevoEstado = forzarEstado !== null ? forzarEstado : !isActive;
        if (nuevoEstado) {
            canvas.classList.remove('hidden');
            tools.classList.remove('hidden');
            resizeCanvas();
            setModo(modoPizarra);
            document.body.style.overflow = 'hidden';
        } else {
            canvas.classList.add('hidden');
            tools.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    return { init, toggle, setModo, setColor, setGrosor, limpiar, undo };
})();

// Autoinicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', Pizarra.init);
