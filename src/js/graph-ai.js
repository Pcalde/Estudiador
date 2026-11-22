// GRAPH-AI.JS — Propuestas de relaciones con referencias temporales inequívocas.
// La IA nunca escribe directamente en el grafo: el usuario revisa cada relación.
const GraphAI = (() => {
    const _normalizarTitulo = t => String(t || '').replace(/\$\$?/g, '')
        .replace(/\\(?:textbf|textit|mathrm|text)\{([^}]*)\}/g, '$1')
        .toLocaleLowerCase().replace(/\s+/g, ' ').trim();

    // No hacer emparejamiento aproximado: si hay títulos duplicados el resultado es ambiguo.
    function _resolverTitulo(titulo, cards) {
        const matches = cards.filter(c => _normalizarTitulo(c.Titulo) === _normalizarTitulo(titulo));
        return matches.length === 1 ? matches[0] : null;
    }
    function _parsearRelacionesTexto(texto) {
        const validas = [], invalidas = [];
        for (const line of String(texto || '').split(/\r?\n/)) {
            const raw = line.trim();
            if (!raw || raw.startsWith('#') || raw.startsWith('```')) continue;
            const match = raw.match(/^(C\d+)\s*->\s*(C\d+)(?:\s*:\s*(.*))?$/i);
            if (match) validas.push({ origenRaw: match[1].toUpperCase(),
                destinoRaw: match[2].toUpperCase(), etiqueta: String(match[3] || '').replace(/^['"]|['"]$/g, '').trim() });
            else invalidas.push(raw);
        }
        return { validas, invalidas };
    }
    function _rowSelect(cards, initial) {
        const select = document.createElement('select');
        select.className = 'graph-review-select';
        for (const c of cards) {
            const opt = new Option(`${c.ref} · ${c.title.slice(0, 85)}`, c.ref);
            select.add(opt);
        }
        select.value = initial;
        return select;
    }
    function _reviewProposal(text, cards, asig) {
        const { validas, invalidas } = _parsearRelacionesTexto(text);
        const cardMap = new Map(cards.map(c => [c.ref, c]));
        const root = document.createElement('div');
        root.className = 'graph-overlay';
        root.innerHTML = `<div class="graph-dialog graph-review-dialog">
            <h3>Revisar relaciones propuestas</h3>
            <p class="graph-help">Las relaciones son hipótesis de la IA, no hechos verificados. Ajusta sus extremos y etiquetas antes de aceptarlas.</p>
            <div class="graph-review-list" id="graph-review-list"></div>
            <p class="graph-help" id="graph-review-errors"></p>
            <div class="graph-actions"><button class="graph-secondary" data-close>Cancelar</button>
                <button data-apply>Aplicar seleccionadas</button></div>
        </div>`;
        const list = root.querySelector('#graph-review-list');
        const entries = [];
        for (const p of validas) {
            const line = document.createElement('div');
            line.className = 'graph-review-row';
            const check = document.createElement('input'); check.type = 'checkbox';
            check.checked = cardMap.has(p.origenRaw) && cardMap.has(p.destinoRaw) && p.origenRaw !== p.destinoRaw;
            const source = _rowSelect(cards, p.origenRaw);
            const target = _rowSelect(cards, p.destinoRaw);
            const label = document.createElement('input'); label.type = 'text';
            label.value = p.etiqueta; label.maxLength = 180; label.placeholder = 'Tipo de relación';
            const arrow = document.createElement('span'); arrow.textContent = '→';
            line.append(check, source, arrow, target, label);
            list.append(line);
            entries.push({ check, source, target, label });
        }
        root.querySelector('#graph-review-errors').textContent =
            `${validas.length} propuestas, ${invalidas.length} líneas no interpretadas.` +
            (invalidas.length ? ` Primera línea incorrecta: ${invalidas[0].slice(0, 130)}` : '');
        root.querySelector('[data-close]').onclick = () => root.remove();
        root.querySelector('[data-apply]').onclick = () => {
            if (State.get('nombreAsignaturaActual') !== asig) {
                Toast.show('La asignatura cambió mientras se revisaban relaciones', 'warning'); return;
            }
            const approved = [];
            for (const e of entries) {
                if (!e.check.checked) continue;
                const from = cardMap.get(e.source.value), to = cardMap.get(e.target.value);
                if (!from || !to || from.id === to.id) continue;
                approved.push({ source: from.id, target: to.id, label: e.label.value });
            }
            if (!approved.length) { Toast.show('No hay relaciones seleccionadas', 'warning'); return; }
            const count = Graph.aplicarRelaciones(approved, 'ia');
            Toast.show(`${count} relaciones añadidas. Permanecen marcadas como pendientes de verificación.`, 'success');
            root.remove();
        };
        document.getElementById('modal-graph')?.appendChild(root);
    }

    async function generarMapaConIA(cardsSeleccionadas = null) {
        const asig = State.get('nombreAsignaturaActual');
        const all = (State.get('biblioteca') || {})[asig] || [];
        const cards = cardsSeleccionadas ?? all;
        if (!asig || !cards.length) { Toast.show('Selecciona tarjetas antes de generar relaciones', 'warning'); return; }
        if (cards.length > 180) { Toast.show('Procesa un lote de como máximo 180 tarjetas', 'warning'); return; }
        if (typeof AI === 'undefined' || typeof AI.generarRespuesta !== 'function') {
            Toast.show('Servicio IA no disponible', 'error'); return;
        }
        const assigned = cards.map((card, i) => ({
            id: Graph._cardId(card, asig), ref: `C${i + 1}`, title: card.Titulo,
            tema: card.Tema, tipo: card.Apartado
        }));
        const listing = assigned.map(c => `${c.ref} [tema ${c.tema}, ${c.tipo}]: ${c.title}`).join('\n');
        const prompt = `Eres un asistente de Matemáticas. Propón relaciones matemáticas justificables entre estos conceptos.
Las referencias C1, C2, ... son identificadores de esta lista; NO son títulos.
${listing}

Devuelve exclusivamente líneas como:
C1 -> C4 : requiere
C4 -> C6 : generaliza

Usa SOLO referencias existentes de la lista, sin inventar conceptos. Máximo 2-3 conexiones significativas por concepto.
Indica una relación breve y precisa (requiere, generaliza, es_caso_de, aplica_a, demuestra, equivale_a, etc.).
Diferencia la secuencia de los apuntes de una verdadera dependencia lógica: NO infieras una relación solo por el orden.
El usuario verificará las propuestas antes de aplicarlas.`;
        Toast.show(`Analizando ${cards.length} tarjetas…`, 'info');
        try {
            const response = await AI.generarRespuesta(prompt);
            if (State.get('nombreAsignaturaActual') !== asig) return;
            const { validas } = _parsearRelacionesTexto(String(response || ''));
            if (!validas.length) { Toast.show('La IA no devolvió propuestas reconocibles', 'warning'); return; }
            _reviewProposal(String(response), assigned, asig);
        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error('Error en GraphAI', error);
            Toast.show(`No se pudieron generar las relaciones: ${error.message}`, 'error');
        }
    }
    return { generarMapaConIA, _parsearRelacionesTexto, _normalizarTitulo, _resolverTitulo };
})();
if (typeof CommandRegistry !== 'undefined') CommandRegistry.register('generarMapaConIA', () => GraphAI.generarMapaConIA());
