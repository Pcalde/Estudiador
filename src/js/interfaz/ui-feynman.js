// UI-FEYNMAN.JS — Presentación del examen Feynman; toda su UI vive aquí.
// Dependencia global: FEYNMAN (motor sin DOM).
// Se monta sobre #examen-modal, sin modificar el HTML existente.

const UIFeynman = (() => {
    let montado = false;
    let desuscribir = null;
    const ICONOS = { abuelo: 'fa-person-cane', padre: 'fa-user', companero: 'fa-user-graduate', bachiller: 'fa-book-open-reader' };
    const RETOS_ICONOS = { libre: 'fa-comments', analogia: 'fa-lightbulb', ejemplo: 'fa-calculator', breve: 'fa-bolt', detectar: 'fa-magnifying-glass' };

    function el(id) { return document.getElementById(id); }
    function textoSeguro(valor) { return String(valor ?? ''); }
    function nodo(tag, className, text) {
        const n = document.createElement(tag);
        if (className) n.className = className;
        if (text !== undefined) n.textContent = textoSeguro(text);
        return n;
    }
    function boton(etiqueta, accion, clase = '') {
        const b = nodo('button', `fey-btn ${clase}`, etiqueta);
        b.type = 'button';
        b.dataset.feyAccion = accion;
        return b;
    }
    function matematicas(root) {
        if (root && typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise === 'function') {
            MathJax.typesetPromise([root]).catch(() => {});
        }
    }

    function ponerEstilos() {
        if (el('feynman-css')) return;
        const style = document.createElement('style');
        style.id = 'feynman-css';
        style.textContent = `
            #ex-feynman-config { margin-top:16px; padding:14px; border:1px solid var(--border-light,#444); border-radius:10px; background:rgba(255,255,255,.025); }
            #ex-feynman-config h4 { color:var(--text-main,#eee); margin:0 0 10px; font-size:.85rem; }
            #examen-feynman { display:none; background:var(--card-bg,#1e1e1e); border:1px solid var(--border-light,#444); border-radius:14px; padding:24px; max-width:760px; width:100%; box-sizing:border-box; margin:auto; color:var(--text-main,#eee); }
            .fey-top { display:flex; justify-content:space-between; align-items:start; gap:14px; }
            .fey-sub { color:var(--text-muted,#999); font-size:.8rem; }
            .fey-title { font-size:1.18rem; line-height:1.5; margin:8px 0 15px; }
            .fey-progress { height:11px; border-radius:8px; overflow:hidden; background:var(--surface-2,#333); }
            .fey-progress > div { height:100%; background:var(--accent,#4caf50); transition:width .25s ease; }
            .fey-progress-caption { display:flex; align-items:baseline; justify-content:space-between; margin:14px 0 6px; }
            .fey-progress-caption strong { font-size:1.45rem; }
            .fey-log { display:flex; flex-direction:column; gap:12px; max-height:345px; min-height:125px; overflow-y:auto; margin:15px 0; padding:4px; }
            .fey-bubble { max-width:88%; padding:12px; border-radius:12px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
            .fey-bubble.personaje { align-self:flex-start; background:var(--surface-2,#292929); border:1px solid var(--border-light,#444); }
            .fey-bubble.estudiante { align-self:flex-end; background:rgba(76,175,80,.1); border:1px solid rgba(76,175,80,.35); }
            .fey-bubble-label { font-size:.69rem; color:var(--text-muted,#999); font-weight:700; margin-bottom:6px; }
            .fey-error { color:#ffb3ad; background:#60222240; padding:10px; border-radius:8px; font-size:.85rem; }
            .fey-feedback { background:var(--surface-1,#222); border-left:3px solid var(--accent,#4caf50); padding:10px; margin:12px 0; font-size:.85rem; color:var(--text-main,#ccc); }
            .fey-entry { width:100%; min-height:115px; resize:vertical; box-sizing:border-box; background:var(--surface-1,#171717); color:var(--text-main,#fff); border:1px solid var(--border-light,#444); border-radius:9px; padding:12px; font:inherit; }
            .fey-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-top:10px; }
            .fey-btn { cursor:pointer; border-radius:8px; padding:10px 14px; border:1px solid var(--border-light,#444); background:var(--surface-2,#333); color:var(--text-main,#eee); }
            .fey-btn.primary { background:var(--accent,#4caf50); color:#101010; border-color:transparent; font-weight:700; }
            .fey-btn:disabled { opacity:.42; cursor:not-allowed; }
            .fey-metas { margin-top:16px; border-top:1px solid var(--border-light,#444); padding-top:12px; }
            .fey-meta { margin:9px 0; font-size:.79rem; }
            .fey-meta-bar { height:5px; background:var(--surface-2,#333); margin-top:5px; border-radius:5px; overflow:hidden; }
            .fey-meta-bar > span { display:block; background:var(--accent,#4caf50); height:100%; }
            .fey-report-item { border:1px solid var(--border-light,#444); border-radius:8px; padding:12px; margin:10px 0; }
            .fey-report-item summary { cursor:pointer; }
            .fey-report-item li { margin:5px 0; }
            .fey-status { font-size:.75rem; color:var(--text-muted,#999); }
            .fey-memory { border-left:3px solid #e3a04b; padding:9px 11px; background:rgba(227,160,75,.07); border-radius:7px; font-size:.8rem; margin:10px 0; }
            .fey-verify { font-weight:600; margin:10px 0; }
            @media(max-width:520px){ #examen-feynman{padding:14px;} .fey-bubble{max-width:96%;} }
        `;
        document.head.appendChild(style);
    }

    function montar() {
        if (montado) return;
        const modal = el('examen-modal');
        const config = el('examen-config');
        if (!modal || !config) return;
        ponerEstilos();
        const bloque = nodo('section', 'fey-opciones');
        bloque.id = 'ex-feynman-config';
        const titulo = nodo('h4', '', '¿A quién quieres enseñárselo?');
        bloque.appendChild(titulo);
        const opciones = nodo('div', 'exam-quiz-choices fey-personajes');
        const perfilesDesc = {
            abuelo: 'Sin tecnicismos; explicación intuitiva',
            padre: 'Conexiones con situaciones cotidianas',
            companero: 'Resumen matemático antes del examen',
            bachiller: 'Conectar con matemáticas de instituto'
        };
        Object.entries(FEYNMAN.PERSONAJES).forEach(([id, perfil]) => {
            const lab = nodo('label', 'exam-mode-card exam-quiz-choice fey-persona');
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'feynman-personaje'; radio.value = id;
            radio.checked = id === 'abuelo';
            const iconoWrap = nodo('span', 'exam-mode-icon');
            iconoWrap.appendChild(nodo('i', `fa-solid ${ICONOS[id] || 'fa-user'}`));
            lab.append(radio, iconoWrap, nodo('strong', '', perfil.nombre),
                nodo('small', '', perfilesDesc[id] || perfil.objetivo));
            opciones.appendChild(lab);
        });
        bloque.appendChild(opciones);

        const retoTitulo = nodo('h4', 'fey-reto-title', 'Desafío opcional');
        bloque.appendChild(retoTitulo);
        const retos = nodo('div', 'exam-quiz-choices fey-retos');
        Object.entries(FEYNMAN.RETOS).forEach(([id, nombre]) => {
            const lab = nodo('label', 'exam-mode-card exam-quiz-choice fey-reto-card');
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'feynman-reto'; radio.value = id;
            radio.checked = id === 'libre';
            const iconoWrap = nodo('span', 'exam-mode-icon');
            iconoWrap.appendChild(nodo('i', `fa-solid ${RETOS_ICONOS[id] || 'fa-star'}`));
            lab.append(radio, iconoWrap, nodo('strong', '', id === 'libre' ? 'Libre' : ({analogia:'Analogía',ejemplo:'Ejemplo',breve:'Brevedad',detectar:'Detectar error'}[id] || id)), nodo('small','',nombre));
            retos.appendChild(lab);
        });
        bloque.appendChild(retos);
        bloque.appendChild(nodo('p', 'fey-sub', 'La cobertura conceptual no es una nota. Se recomiendan 1–3 tarjetas.'));
        // Montaje en el área de configuración: no desplazar el pie del modal.
        const slot = el('ex-feynman-slot');
        if (slot) slot.appendChild(bloque);
        else {
            const btnInicio = el('btn-iniciarexamen');
            if (btnInicio && btnInicio.parentNode === config) config.insertBefore(bloque, btnInicio);
            else config.appendChild(bloque);
        }

        const root = nodo('section');
        root.id = 'examen-feynman';
        root.addEventListener('click', manejarClick);
        root.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && ev.target.matches('[data-fey-input]')) {
                ev.preventDefault();
                const ta = root.querySelector('[data-fey-input]');
                FEYNMAN.responder(ta?.value || '');
            }
        });
        modal.appendChild(root);
        desuscribir = FEYNMAN.suscribir(renderizar);
        montado = true;
        actualizarConfiguracion('flash');
    }

    function actualizarConfiguracion(modo) {
        const bloque = el('ex-feynman-config');
        if (bloque) bloque.style.display = modo === 'feynman' ? 'block' : 'none';
        const tiempo = el('ex-tiempo')?.parentElement;
        if (tiempo) tiempo.style.display = modo === 'feynman' ? 'none' : '';
    }

    function leerPersonaje() {
        return document.querySelector('input[name="feynman-personaje"]:checked')?.value || 'abuelo';
    }

    function manejarClick(evento) {
        const accion = evento.target.closest('[data-fey-accion]')?.dataset.feyAccion;
        if (!accion) return;
        if (accion === 'enviar') FEYNMAN.responder(el('fey-respuesta')?.value || '');
        else if (accion === 'siguiente') FEYNMAN.avanzar();
        else if (accion === 'terminar') FEYNMAN.terminar();
        else if (accion === 'reintentar-preparacion') FEYNMAN.reintentarPreparacion();
        else if (accion === 'cerrar') {
            if (typeof window.cerrarExamen === 'function') window.cerrarExamen();
            else FEYNMAN.cerrar();
        }
        else if (accion === 'repetir' && typeof EXAM !== 'undefined') EXAM.repetir();
    }

    function renderizar(estado) {
        const root = el('examen-feynman');
        if (!root || !estado) return;
        root.replaceChildren();
        if (estado.fase === 'resultados') {
            pintarResultados(root, estado);
        } else if (estado.fase === 'preparando') {
            pintarPreparacion(root, estado);
        } else {
            pintarDialogo(root, estado);
        }
        matematicas(root);
    }

    function pintarPreparacion(root, e) {
        root.appendChild(nodo('div','fey-sub',`FEYNMAN · ${e.personaje.nombre} · Concepto ${e.indice+1}/${e.total}`));
        root.appendChild(nodo('h3','',e.tarjeta.Titulo || 'Concepto sin título'));
        root.appendChild(nodo('p','fey-status', e.ocupado ? 'Preparando objetivos independientes y obstáculos conceptuales…' : 'No se pudo preparar la rúbrica.'));
        if (e.error) root.appendChild(nodo('div','fey-error',e.error));
        const acciones=nodo('div','fey-actions');
        if (!e.ocupado) acciones.appendChild(boton('Reintentar preparación','reintentar-preparacion','primary'));
        acciones.appendChild(boton('Cerrar ✕','cerrar')); root.appendChild(acciones);
    }

    function pintarDialogo(root, e) {
        const c = e.registro;
        const h = nodo('div', 'fey-top');
        const info = nodo('div');
        info.appendChild(nodo('div', 'fey-sub', `FEYNMAN · ${e.personaje.nombre} · Concepto ${e.indice+1}/${e.total}`));
        info.appendChild(nodo('div', 'fey-title', e.tarjeta.Titulo || 'Concepto sin título'));
        h.append(info, boton('Cerrar ✕', 'cerrar'));
        root.appendChild(h);

        const porcentaje = nodo('div', 'fey-progress-caption');
        porcentaje.append(nodo('span', 'fey-sub', 'Cobertura conceptual (rúbrica)'), nodo('strong', '', `${c.cobertura}%`));
        root.appendChild(porcentaje);
        const barra = nodo('div', 'fey-progress');
        const avance = nodo('div');
        avance.style.width = `${c.cobertura}%`;
        barra.appendChild(avance);
        root.appendChild(barra);
        root.appendChild(nodo('p','fey-status',`Meta orientativa: ${e.meta}% · Turnos: ${c.turnos}/${e.maxTurnos} · La cobertura puede subir o bajar.`));
        const estadoVerificacion = c.comprension === 'verificada' ? 'Verificada mediante reformulación simulada' : c.comprension === 'contrastando' ? 'En comprobación: revisa o corrige lo que entendió el personaje' : 'Pendiente de comprobación';
        root.appendChild(nodo('div','fey-verify',`Comprensión del personaje: ${estadoVerificacion}`));
        if (c.turnos === 0) {
            const memoria=FEYNMAN.memoriaTarjeta(e.tarjeta);
            if (memoria?.pendientes?.length) root.appendChild(nodo('div','fey-memory',`De sesiones anteriores: conviene repasar ${memoria.pendientes.slice(0,3).map(o=>o.nombre).join('; ')}.`));
        }

        const log = nodo('div', 'fey-log');
        const bienvenida = { rol:'personaje', texto:e.personaje.bienvenida };
        [...[bienvenida], ...c.historial, ...(e.ocupado && c.pendiente ? [{ rol:'estudiante', texto:c.pendiente }] : [])].forEach(m => {
            const bubble = nodo('div', `fey-bubble ${m.rol}`);
            bubble.appendChild(nodo('div', 'fey-bubble-label', m.rol === 'estudiante' ? 'TÚ' : e.personaje.nombre.toUpperCase()));
            bubble.appendChild(nodo('div', '', m.texto));
            log.appendChild(bubble);
        });
        if (e.ocupado) log.appendChild(nodo('div', 'fey-sub', 'Evaluando la explicación…'));
        root.appendChild(log);
        log.scrollTop = log.scrollHeight;

        if (e.error) root.appendChild(nodo('div', 'fey-error', e.error));
        // Durante el diálogo no se muestran soluciones, rúbricas ni observaciones técnicas.
        // La retroalimentación detallada queda reservada para el informe final.

        if (!c.finalizada) {
            const entrada = nodo('textarea', 'fey-entry');
            entrada.id = 'fey-respuesta'; entrada.dataset.feyInput = '';
            entrada.placeholder = 'Explica el concepto como si quisieras que esta persona lo comprendiese de verdad…';
            entrada.value = e.ocupado ? '' : c.pendiente;
            entrada.disabled = e.ocupado;
            root.appendChild(entrada);
        }
        const acciones = nodo('div', 'fey-actions');
        if (!c.finalizada) {
            const responder = boton('Responder · Ctrl+Enter', 'enviar', 'primary');
            responder.disabled = e.ocupado;
            acciones.appendChild(responder);
        }
        const siguiente = boton(e.indice === e.total - 1 ? 'Finalizar sesión' : 'Siguiente concepto', 'siguiente');
        siguiente.disabled = e.ocupado;
        acciones.appendChild(siguiente);
        const terminar = boton('Terminar ahora', 'terminar');
        terminar.disabled = e.ocupado;
        acciones.appendChild(terminar);
        root.appendChild(acciones);


    }

    function pintarResultados(root, e) {
        const r = e.resumen;
        const h = nodo('div', 'fey-top');
        const titulo = nodo('div');
        titulo.append(nodo('div','fey-sub',`RESULTADOS FORMATIVOS · ${e.personaje.nombre}`), nodo('h2','', 'Informe Feynman'));
        h.append(titulo, boton('Cerrar ✕', 'cerrar'));
        root.appendChild(h);
        root.appendChild(nodo('p', 'fey-sub', `Conceptos trabajados: ${r.evaluados}/${r.total}. Comprensiones verificadas: ${r.verificados}. No modifica FSRS.`));
        const resumen = nodo('div', 'fey-feedback');
        resumen.appendChild(nodo('div','',`Cobertura conceptual media: ${r.coberturaMedia === null ? 'Sin evaluar' : r.coberturaMedia + '%'}`));
        resumen.appendChild(nodo('div','',`Calidad explicativa media: ${r.calidadMedia === null ? 'Sin evaluar' : r.calidadMedia + '%'}`));
        root.appendChild(resumen);
        r.tarjetas.forEach((t, index) => {
            const caja = nodo('details', 'fey-report-item');
            if (t.cobertura !== null && (t.cobertura < e.meta || t.comprension !== 'verificada')) caja.open = true;
            const sum = nodo('summary', '', `${index + 1}. ${t.titulo} · ${t.cobertura === null ? 'Sin evaluar' : t.cobertura + '% de cobertura'}`);
            caja.appendChild(sum);
            caja.appendChild(nodo('p', 'fey-sub', `Turnos: ${t.turnos} · Calidad explicativa: ${t.calidad === null ? '—' : t.calidad + '%'}`));
            caja.appendChild(nodo('p','fey-sub',`Comprensión simulada: ${t.comprension}`));
            if(t.verificacion)caja.appendChild(nodo('p','fey-sub',`Comprobación: ${t.verificacion}`));
            if (t.feedback) caja.appendChild(nodo('p', '', t.feedback));
            if (t.errores.length) {
                caja.appendChild(nodo('strong', '', 'Errores por revisar'));
                const lista = nodo('ul');
                t.errores.forEach(error => lista.appendChild(nodo('li', '', error)));
                caja.appendChild(lista);
            }
            t.objetivos.filter(o => o.nivel < 0.85 || o.estado === 'pendiente').forEach(o => caja.appendChild(nodo('p', 'fey-sub', `Pendiente: ${o.nombre} (${Math.round(o.nivel * 100)}%) · ${o.obstaculo}`)));
            root.appendChild(caja);
        });
        const acciones = nodo('div', 'fey-actions');
        acciones.append(boton('Repetir con este personaje', 'repetir', 'primary'), boton('Cerrar', 'cerrar'));
        root.appendChild(acciones);
    }

    function leerReto() { return document.querySelector('input[name="feynman-reto"]:checked')?.value || 'libre'; }

    return { montar, actualizarConfiguracion, leerPersonaje, leerReto };
})();
