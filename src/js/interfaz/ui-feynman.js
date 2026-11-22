// UI-FEYNMAN.JS — Presentación del examen Feynman; toda su UI vive aquí.
// Dependencia global: FEYNMAN (motor sin DOM).
// Se monta sobre #examen-modal, sin modificar el HTML existente.

const UIFeynman = (() => {
    let montado = false;
    let desuscribir = null;
    const ICONOS = { abuelo: 'fa-person-cane', padre: 'fa-user', companero: 'fa-user-graduate' };

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


    function montar() {
        if (montado) return;
        const modal = el('examen-modal');
        const config = el('examen-config');
        if (!modal || !config) return;
        const bloque = nodo('section');
        bloque.id = 'ex-feynman-config';
        const titulo = nodo('h4', '', '¿A quién quieres enseñárselo?');
        bloque.appendChild(titulo);
        const opciones = nodo('div', 'fey-personajes');
        Object.entries(FEYNMAN.PERSONAJES).forEach(([id, perfil]) => {
            const lab = nodo('label', 'fey-persona');
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'feynman-personaje'; radio.value = id;
            radio.checked = id === 'abuelo';
            const icono = nodo('i', `fa-solid ${ICONOS[id]}`);
            const texto = nodo('strong', '', perfil.nombre);
            const mini = nodo('small', '', id === 'companero' ? 'Repaso antes del examen' : id === 'padre' ? 'Aplicaciones prácticas' : 'Sin tecnicismos');
            lab.append(radio, icono, texto, mini);
            opciones.appendChild(lab);
        });
        bloque.appendChild(opciones);
        bloque.appendChild(nodo('p', 'fey-sub', 'La cobertura conceptual no es una nota. La comprensión del personaje se comprueba en el diálogo. Se recomiendan 1–3 tarjetas.'));
        const retoBox = nodo('label', 'fey-challenge');
        retoBox.appendChild(nodo('span', '', 'Desafío opcional:'));
        const retoSelect = nodo('select'); retoSelect.id = 'fey-reto';
        Object.entries(FEYNMAN.RETOS).forEach(([key, nombre]) => {
            const op = document.createElement('option'); op.value=key; op.textContent=nombre; retoSelect.appendChild(op);
        });
        retoBox.appendChild(retoSelect); bloque.appendChild(retoBox);
        const slot = el('ex-feynman-slot');
        if (slot) slot.appendChild(bloque);
        else config.appendChild(bloque);

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
        // El panel compartido decide cuándo mostrar el temporizador.
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
        else if (accion === 'cerrar-demo' && typeof EXAM !== 'undefined') EXAM.abrir();
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
            if (typeof EXAM !== 'undefined') {
                const r = estado.resumen;
                const detalles = nodo('div', 'fey-shared-report');
                while (root.firstChild) detalles.appendChild(root.firstChild);
                // Los controles de resultados pertenecen ahora al panel común.
                detalles.querySelectorAll('[data-fey-accion]').forEach(b => b.remove());
                EXAM.mostrarResultadoExterno({
                    origen:'feynman', nota: r.coberturaMedia === null ? NaN : r.coberturaMedia / 10,
                    bien:r.verificados, mal:r.total - r.verificados,
                    etiqueta:'Cobertura /10 · no nota',
                    descripcion:`Feynman · ${r.evaluados}/${r.total} conceptos trabajados · La cobertura no es una calificación`,
                    detalles
                });
                matematicas(detalles);
                return;
            }
        } else if (estado.fase === 'preparando') {
            pintarPreparacion(root, estado);
        } else {
            pintarDialogo(root, estado);
        }
        matematicas(root);
    }

    // Demostración completamente estática: ni FEYNMAN.iniciar ni llamadas de IA.
    function mostrarDemo() {
        const root = el('examen-feynman');
        if (!root) return;
        root.replaceChildren();
        const cab = nodo('div', 'fey-top');
        const encabezado = nodo('div');
        encabezado.append(nodo('div', 'fey-sub', 'FEYNMAN · ABUELO · DEMOSTRACIÓN'),
                          nodo('div', 'fey-title', 'Explica el teorema de Pitágoras'));
        cab.append(encabezado, boton('Cerrar ✕', 'cerrar'));
        root.appendChild(cab);
        const aviso = nodo('p', 'fey-demo-notice', 'Ejemplo preestablecido. No utiliza IA, no consume tokens y no guarda resultados.');
        root.appendChild(aviso);
        const progreso = nodo('div', 'fey-progress-caption');
        progreso.append(nodo('span', 'fey-sub', 'Cobertura conceptual (ejemplo)'), nodo('strong', '', '75%'));
        root.appendChild(progreso);
        const barra = nodo('div', 'fey-progress');
        const avance = nodo('div'); avance.style.width = '75%';
        barra.appendChild(avance); root.appendChild(barra);
        root.appendChild(nodo('div', 'fey-verify', 'Comprensión del personaje: En comprobación (simulada)'));
        const log = nodo('div', 'fey-log');
        [
          ['personaje', 'ABUELO', '¿Me explicas qué es el teorema de Pitágoras?'],
          ['estudiante', 'TÚ', 'En un triángulo rectángulo, la suma de los cuadrados de los dos catetos es igual al cuadrado de la hipotenusa.'],
          ['personaje', 'ABUELO', 'Entonces, si los catetos miden 3 y 4, ¿la hipotenusa mide 5?']
        ].forEach(([rol, autor, mensaje]) => {
            const burbuja = nodo('div', `fey-bubble ${rol}`);
            burbuja.append(nodo('div', 'fey-bubble-label', autor), nodo('div', '', mensaje));
            log.appendChild(burbuja);
        });
        root.appendChild(log);
        root.appendChild(nodo('p', 'fey-sub', 'Esta conversación es una muestra de la interfaz, no una evaluación real.'));
        const acciones = nodo('div', 'fey-actions');
        acciones.appendChild(boton('Volver a configuración', 'cerrar-demo', 'primary'));
        root.appendChild(acciones);
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
        if (e.indice < e.total - 1) {
            const terminar = boton('Terminar sesión anticipadamente', 'terminar');
            terminar.disabled = e.ocupado;
            acciones.appendChild(terminar);
        }
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

    function leerReto() { return el('fey-reto')?.value || 'libre'; }

    return { montar, actualizarConfiguracion, leerPersonaje, leerReto, mostrarDemo };
})();
