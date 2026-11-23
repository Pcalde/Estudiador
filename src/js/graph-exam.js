// GRAPH-EXAM.JS — Modo de examen autónomo integrado en el modal existente.
// No modifica FSRS y no necesita editar el exam.js original.
const GraphExam = (() => {
    let questions = [], index = 0, correct = 0, repetir = null;
    const $ = id => document.getElementById(id);
    const _escape = t => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _math = el => { if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {}); };
    function candidatas(tarjetas, seleccion) {
        const porAsignatura = new Map();
        for (const card of tarjetas) {
            const asig = seleccion === 'ALL' ? card._asigFicticia : seleccion;
            if (!porAsignatura.has(asig)) porAsignatura.set(asig, new Map());
            porAsignatura.get(asig).set(Graph._cardId(card, asig), card);
        }
        const mapas = State.get('graphData') || {};
        const relaciones = [];
        for (const [asig, tarjetasMapa] of porAsignatura) {
            const grafo = mapas[asig];
            if (!grafo) continue;
            const nodos = new Set((grafo.nodes || []).map(n => String(n.id)));
            for (const enlace of grafo.edges || []) {
                const origen = String(enlace.source), destino = String(enlace.target);
                const relation = String(enlace.label || '').trim();
                if (!relation || enlace.reviewed === false || !nodos.has(origen) || !nodos.has(destino)) continue;
                const from = tarjetasMapa.get(origen), to = tarjetasMapa.get(destino);
                if (from && to) relaciones.push({ from, to, relation });
            }
        }
        return relaciones;
    }

    function demo() {
        start([{ from: { Titulo: 'Cuadrado' }, to: { Titulo: 'Rectángulo' }, relation: 'Es un caso particular de' }], 1);
    }

    function start(pool, limite) {
        if (!pool.length) return Toast.show('No hay relaciones verificadas con estos filtros.', 'warning');
        const total = Math.min(pool.length, Math.max(1, Math.floor(limite)));
        repetir = () => start(pool, limite);
        questions = [...pool];
        for (let i = questions.length-1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i+1));
            [questions[i],questions[j]] = [questions[j],questions[i]];
        }
        questions.length = total; index = 0; correct = 0;
        $('examen-modal').style.display = 'flex';
        $('graph-exam-screen').hidden = false;
        EXAM.mostrarVista('graph-exam-screen');
        _render();
    }
    function _render() {
        const root = $('graph-exam-screen');
        if (index >= questions.length) {
            root.innerHTML = `<h3>Examen de relaciones completado</h3>
                <p>Relaciones recordadas: <strong>${correct}/${questions.length}</strong></p>
                <p>Este resultado no altera las calificaciones de repaso FSRS.</p>
                <div class="graph-exam-answers"><button id="graph-exam-repeat">Repetir</button>
                    <button id="graph-exam-close">Volver</button></div>`;
            root.querySelectorAll('button').forEach(b => b.classList.add('btn-modern', 'btn-reveal'));
            $('graph-exam-repeat').onclick = repetir;
            $('graph-exam-close').onclick = close;
            return;
        }
        const q = questions[index];
        root.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <h3>Examen de relaciones</h3><button id="graph-exam-close">Volver</button></div>
            <p>${index + 1} de ${questions.length} · ${correct} recordadas</p>
            <p class="graph-exam-question">¿Qué relación dirigida hay entre estos conceptos?</p>
            <div class="graph-exam-question"><strong>${_escape(q.from.Titulo)}</strong> → <strong>${_escape(q.to.Titulo)}</strong></div>
            <p class="graph-help" id="graph-exam-answer" hidden></p>
            <div class="graph-exam-answers"><button id="graph-exam-reveal">Mostrar respuesta</button>
                <button id="graph-exam-correct" hidden>La recordé</button>
                <button id="graph-exam-wrong" hidden>No la recordé</button></div>`;
        root.querySelectorAll('button').forEach(b => b.classList.add('btn-modern', 'btn-reveal'));
        $('graph-exam-close').onclick = close;
        $('graph-exam-reveal').onclick = () => {
            const el = $('graph-exam-answer');
            el.textContent = `Relación: ${q.relation}`;
            el.hidden = false; $('graph-exam-reveal').hidden = true;
            $('graph-exam-correct').hidden = false; $('graph-exam-wrong').hidden = false;
        };
        $('graph-exam-correct').onclick = () => { correct++; index++; _render(); };
        $('graph-exam-wrong').onclick = () => { index++; _render(); };
        _math(root);
    }
    function close() {
        $('graph-exam-screen').replaceChildren();
        repetir = null;
        EXAM.mostrarVista('examen-config');
        // Conservamos el modal del examen abierto: permite elegir otro modo.
    }
    return { candidatas, demo, start, close };
})();
