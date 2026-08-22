// ════════════════════════════════════════════════════════════════
// UI-SETTINGS.JS — Panel de ajustes, horario, colores, apariencia
// ════════════════════════════════════════════════════════════════

const UISettings = (() => {

    function abrirAjustes(apiKey, isLocal, proxyUrl, fbConfig, currentModel) {
        if (typeof UI !== 'undefined' && UI.ocultarTodo) UI.ocultarTodo();
        const modal = document.getElementById('ajustes-modal');
        if (!modal) return;
        modal.classList.remove('hidden');

        const f = (id) => document.getElementById(id);
        
        // Cargar configuración de proveedor
        const proveedorActivo = State.get('iaProveedor') || 'groq';
        const selProveedor = f('set-ia-proveedor');
        if (selProveedor) selProveedor.value = proveedorActivo;
        
        // Mostrar/ocultar paneles según proveedor
        actualizarPanelProveedor(proveedorActivo);
        
        // Configuración Groq
        if (f('set-groq-key'))        f('set-groq-key').value        = apiKey   || '';
        if (f('set-groq-session-only')) f('set-groq-session-only').checked = !isLocal;
        if (f('set-groq-proxy-url'))  f('set-groq-proxy-url').value  = proxyUrl || '';
        if (f('set-firebase-config')) f('set-firebase-config').value  = fbConfig || '';

        // Modelo Groq
        const selGroqModel = f('set-groq-modelo');
        if (selGroqModel) selGroqModel.value = currentModel || 'llama-3.3-70b-versatile';
        
        // Cargar modelos OpenRouter si está seleccionado
        if (proveedorActivo === 'openrouter') {
            if (typeof AI !== 'undefined' && AI.cargarModelosOpenRouter) {
                AI.cargarModelosOpenRouter().then(() => {
                    renderModelosOpenRouter();
                });
            }
        }
    }
    
    function actualizarPanelProveedor(proveedor) {
        const panelGroq = document.getElementById('config-groq');
        const panelOpenRouter = document.getElementById('config-openrouter');
        
        if (panelGroq && panelOpenRouter) {
            if (proveedor === 'openrouter') {
                panelGroq.classList.add('hidden');
                panelOpenRouter.classList.remove('hidden');
            } else {
                panelGroq.classList.remove('hidden');
                panelOpenRouter.classList.add('hidden');
            }
        }
    }
    
    function renderModelosOpenRouter() {
        const select = document.getElementById('set-openrouter-modelo');
        const info = document.getElementById('openrouter-modelos-info');
        if (!select) return;
        
        const modelos = AI.getModelosDisponibles();
        const modeloActual = State.get('iaModel');
        
        select.innerHTML = '';
        
        if (modelos.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Sin modelos disponibles (añade API key)';
            select.appendChild(opt);
            if (info) info.textContent = '';
            return;
        }
        
        modelos.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.nombre;
            if (m.id === modeloActual) opt.selected = true;
            select.appendChild(opt);
        });
        
        if (info) {
            info.textContent = `${modelos.length} modelos gratuitos disponibles`;
        }
    }

    function cerrarAjustes() {
        document.getElementById('ajustes-modal')?.classList.add('hidden');
    }

    function cambiarPestanaAjustes(tabId) {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.classList.remove('stab-active');
            const panelId = btn.getAttribute('data-stab');
            if (panelId) {
                const panel = document.getElementById(panelId);
                if (panel) { panel.classList.add('hidden'); panel.style.display = 'none'; }
            }
        });

        const btnActivo = document.querySelector(`.stab[data-stab="${tabId}"]`);
        if (btnActivo) btnActivo.classList.add('stab-active');

        const panelActivo = document.getElementById(tabId);
        if (panelActivo) { panelActivo.classList.remove('hidden'); panelActivo.style.display = ''; }
    }

    function getAjustesData(clavesAsignaturas = []) {
        const f = (id) => document.getElementById(id);
        
        // Obtener proveedor seleccionado
        const proveedorSeleccionado = f('set-ia-proveedor')?.value || 'groq';
        
        // Obtener modelo seleccionado según proveedor
        let modeloSeleccionado;
        if (proveedorSeleccionado === 'openrouter') {
            modeloSeleccionado = f('set-openrouter-modelo')?.value || '';
        } else {
            modeloSeleccionado = f('set-groq-modelo')?.value || 'llama-3.3-70b-versatile';
        }
        
        // Guardar modelo en localStorage
        if (modeloSeleccionado) {
            localStorage.setItem('estudiador_ia_model', modeloSeleccionado);
        }
        
        // Guardar proveedor en localStorage
        localStorage.setItem('estudiador_ia_proveedor', proveedorSeleccionado);
        
        const formData = {
            pomo: {
                work:             parseInt(f('set-work')?.value)   || 35,
                short:            parseInt(f('set-short')?.value)  || 5,
                long:             parseInt(f('set-long')?.value)   || 15,
                cyclesBeforeLong: parseInt(f('set-cycles')?.value) || 4,
                autoStart:        f('check-auto-start')?.checked   || false
            },
            ia: {
                apiKey:      f('set-groq-key')?.value.trim()      || '',
                sessionOnly: !!f('set-groq-session-only')?.checked,
                proxyUrl:    f('set-groq-proxy-url')?.value.trim() || '',
                openRouterKey: f('set-openrouter-key')?.value.trim() || '',
                proveedor:   proveedorSeleccionado,
                modelo:      modeloSeleccionado
            },
            firebase: {
                configStr: f('set-firebase-config')?.value.trim() || ''
            },
            colores:    {},
            privacidad: { shareStats: f('set-privacy-stats')?.checked || false }
        };

        clavesAsignaturas.forEach(k => {
            const input = document.getElementById(`color-input-${k}`);
            if (input) formData.colores[k] = input.value;
        });

        return formData;
    }

    function renderHorarioGrid(horario, bib, diaSeleccionado) {
        const contenedor = document.getElementById('schedule-grid-container');
        if (!contenedor) return;
        contenedor.innerHTML = '';

        const dias       = ['L','M','X','J','V','S','D'];
        const nombresDias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

        dias.forEach((letra, i) => {
            const box = document.createElement('div');
            box.className = `schedule-day-box ${i === diaSeleccionado ? 'selected' : ''}`;
            box.onclick   = () => {
                if (typeof seleccionarDiaHorario === 'function') seleccionarDiaHorario(i, nombresDias[i]);
            };

            const label = document.createElement('div');
            label.className = 'day-label';
            label.innerText = letra;
            box.appendChild(label);

            const content = document.createElement('div');
            content.className = 'day-content';

            Object.keys(horario || {}).forEach(asig => {
                const horas = horario[asig][i];
                if (horas > 0) {
                    const tag = document.createElement('div');
                    tag.className           = 'mini-subject-tag';
                    tag.style.backgroundColor = getColorAsignatura(asig);
                    tag.innerText           = `${asig} (${horas}🍅)`;
                    content.appendChild(tag);
                }
            });

            box.appendChild(content);
            contenedor.appendChild(box);
        });
    }

    function renderColorSettings(bib) {
        const container = document.getElementById('settings-colors-list');
        if (!container) return;
        container.innerHTML = '';

        ['General', ...Object.keys(bib)].forEach(k => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--surface-1);padding:8px 10px;border-radius:4px;margin-bottom:5px;border:1px solid var(--border);';

            const label = document.createElement('span');
            label.innerText   = k;
            label.style.cssText = 'font-size:0.9em;color:var(--text-main);';

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;gap:8px;';

            const valHex = rgbToHex(getColorAsignatura(k));

            const textIn = document.createElement('input');
            textIn.type       = 'text';
            textIn.value      = valHex.toUpperCase();
            textIn.style.cssText = 'width:70px;background:var(--bg-color);border:1px solid var(--border);color:var(--text-main);padding:5px;text-align:center;font-family:monospace;border-radius:3px;';

            const colorIn = document.createElement('input');
            colorIn.type  = 'color';
            colorIn.value = valHex;
            colorIn.id    = `color-input-${k}`;
            colorIn.style.cssText = 'border:none;width:35px;height:30px;cursor:pointer;background:none;padding:0;';

            colorIn.oninput  = (e) => textIn.value = e.target.value.toUpperCase();
            textIn.onchange  = (e) => { if (e.target.value.startsWith('#')) colorIn.value = e.target.value; };

            wrapper.appendChild(textIn);
            wrapper.appendChild(colorIn);
            div.appendChild(label);
            div.appendChild(wrapper);
            container.appendChild(div);
        });
    }

    function renderApariencia(visualTheme, clickEffect) {
        document.body.className = '';
        document.body.classList.add(visualTheme, clickEffect);
        const selTheme = document.getElementById('set-visual-theme');
        const selClick = document.getElementById('set-click-effect');
        if (selTheme) selTheme.value = visualTheme;
        if (selClick) selClick.value = clickEffect;
    }

    function renderPrivacidadUI(isPrivate) {
        const icon  = document.getElementById('privacy-icon');
        const title = document.getElementById('privacy-title');
        const desc  = document.getElementById('privacy-desc');
        if (!icon || !title || !desc) return;

        icon.style.opacity  = '0';
        icon.style.filter   = 'blur(4px)';
        title.style.opacity = '0';
        desc.style.opacity  = '0';

        setTimeout(() => {
            if (isPrivate) {
                icon.className    = 'fa-solid fa-user-secret';
                icon.style.color  = 'var(--text-muted)';
                title.innerText   = 'Modo Espía';
                title.style.color = 'var(--text-muted)';
                desc.innerText    = 'Tus estadísticas están ocultas a tus amigos';
            } else {
                icon.className    = 'fa-solid fa-user';
                icon.style.color  = 'var(--status-blue)';
                title.innerText   = 'Modo Extrovertido';
                title.style.color = 'var(--text-main)';
                desc.innerText    = 'Tus estadísticas son visibles para todos';
            }
            icon.style.opacity  = '1';
            icon.style.filter   = 'blur(0px)';
            title.style.opacity = '1';
            desc.style.opacity  = '1';
        }, 200);
    }

    function renderSelectorDia(nombreCompleto, asignaturas, valorGeneral) {
        const panel  = document.getElementById('day-editor-panel');
        const titulo = document.getElementById('day-editor-title');
        const select = document.getElementById('sch-subject-select');
        const input  = document.getElementById('sch-pomo-input');
        if (!panel || !titulo || !select || !input) return;

        panel.classList.remove('hidden');
        titulo.innerText = 'Editar ' + nombreCompleto;

        select.innerHTML = '<option value="General">General (Libre)</option>';
        const fragment   = document.createDocumentFragment();
        asignaturas.forEach(a => {
            const opt       = document.createElement('option');
            opt.value       = a;
            opt.textContent = a;
            fragment.appendChild(opt);
        });
        select.appendChild(fragment);
        input.value = valorGeneral;
    }

    return {
        abrirAjustes,
        cerrarAjustes,
        cambiarPestanaAjustes,
        getAjustesData,
        renderHorarioGrid,
        renderColorSettings,
        renderApariencia,
        renderPrivacidadUI,
        renderSelectorDia,
        actualizarPanelProveedor,
        renderModelosOpenRouter,
    };
})();
