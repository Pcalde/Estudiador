// ════════════════════════════════════════════════════════════════
// UI-EDITOR.JS — Editor visual de tarjetas y JSON
// ════════════════════════════════════════════════════════════════

const UIEditor = (() => {

    function abrirEditorAmigable(concepto, idxNavegacion, totalCola) {
        if (typeof UI !== 'undefined' && UI.ocultarTodo) UI.ocultarTodo();
        const editorCard = document.getElementById('editor-card');
        if (editorCard) editorCard.classList.remove('hidden');

        // ── Mostrar sección de edición, ocultar sección de nueva tarjeta ──
        document.getElementById('seccion-editar-existente')?.classList.remove('hidden');
        document.getElementById('seccion-nueva-tarjeta')?.classList.add('hidden');

        const f = (id) => document.getElementById(id);
        if (f('edit-titulo'))    f('edit-titulo').value    = concepto.Titulo    || '';
        if (f('edit-contenido')) f('edit-contenido').value = concepto.Contenido || '';
        if (f('edit-tema'))      f('edit-tema').value      = concepto.Tema      || 1;
        if (f('edit-apartado'))  f('edit-apartado').value  = concepto.Apartado  || 'Definición';

        const idxLabel = f('edit-idx-label');
        if (idxLabel) idxLabel.innerText = `(Tarjeta ${idxNavegacion + 1} de ${totalCola})`;
    }

    function getEditorData() {
        return {
            titulo:    document.getElementById('edit-titulo')?.value.trim()    || '',
            contenido: document.getElementById('edit-contenido')?.value.trim() || '',
            tema:      parseInt(document.getElementById('edit-tema')?.value)   || 1,
            apartado:  document.getElementById('edit-apartado')?.value         || 'Definición'
        };
    }

    function limpiarEditorData() {
        const t = document.getElementById('edit-titulo');
        const c = document.getElementById('edit-contenido');
        if (t) t.value = '';
        if (c) c.value = '';
    }

    function mostrarFeedbackGuardadoEditor() {
        const btn = document.getElementById('btn-guardar-edicion-amigable');
        if (!btn) return;
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Guardado!';
        btn.classList.add('btn-success');
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove('btn-success'); }, 1000);
    }

    function setBtnIAModo(isProcessing) {
        const btn = document.getElementById('btn-guardarnuevoconcepto');
        if (!btn) return;
        if (isProcessing) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML        = '<i class="fa-solid fa-microchip fa-fade"></i> Pensando...';
            btn.disabled         = true;
        } else {
            btn.innerHTML = btn.dataset.original || '<i class="fa-solid fa-floppy-disk"></i> Guardar';
            btn.disabled  = false;
        }
    }

    function abrirEditorJSON(tarjetasSaneadas) {
        if (typeof UI !== 'undefined' && UI.ocultarTodo) UI.ocultarTodo();
        document.getElementById('json-editor-card')?.classList.remove('hidden');
        const area = document.getElementById('json-editor-area');
        if (area) area.value = JSON.stringify(tarjetasSaneadas, null, 4);
    }

    function cancelarEdicion(hasAsignatura) {
        if (typeof UI !== 'undefined' && UI.ocultarTodo) UI.ocultarTodo();
        if (hasAsignatura) {
            document.getElementById('study-card')?.classList.remove('hidden');
        } else {
            document.getElementById('welcome-screen')?.classList.remove('hidden');
        }
    }

    function pedirNombreAsignatura(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(3px);';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:var(--card-bg);padding:25px;border-radius:12px;width:320px;text-align:center;border:1px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,0.6);';

        const title   = document.createElement('h3');
        title.innerText = 'Nueva Asignatura';
        title.style.cssText = 'margin-top:0;color:var(--text-main);font-size:1.2em;margin-bottom:15px;';

        const input = document.createElement('input');
        input.type        = 'text';
        input.placeholder = 'Nombre (ej: Termodinámica)';
        input.style.cssText = 'width:100%;padding:12px;margin-bottom:20px;border-radius:6px;border:1px solid var(--border);background:var(--bg-color);color:var(--text-main);box-sizing:border-box;outline:none;font-size:1em;';
        input.onfocus = () => input.style.borderColor = 'var(--accent)';
        input.onblur  = () => input.style.borderColor = 'var(--border)';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;justify-content:space-between;gap:10px;';

        const btnSubir = document.createElement('button');
        btnSubir.innerText    = 'Subir Archivo';
        btnSubir.style.cssText = 'flex:1;background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:10px;border-radius:6px;cursor:pointer;font-weight:500;transition:all 0.2s;';
        btnSubir.onmouseover = () => { btnSubir.style.background = 'var(--border)'; btnSubir.style.color = 'var(--text-main)'; };
        btnSubir.onmouseout  = () => { btnSubir.style.background = 'transparent'; btnSubir.style.color = 'var(--text-muted)'; };

        const btnOk = document.createElement('button');
        btnOk.innerText    = 'Crear';
        btnOk.style.cssText = 'flex:1;background:var(--accent);color:#000;font-weight:bold;border:none;padding:10px;border-radius:6px;cursor:pointer;transition:opacity 0.2s;';
        btnOk.onmouseover = () => btnOk.style.opacity = '0.8';
        btnOk.onmouseout  = () => btnOk.style.opacity = '1';

        const close = (val) => { document.body.removeChild(overlay); callback(val); };
        btnSubir.onclick  = () => close(null);
        btnOk.onclick     = () => close(input.value);
        input.onkeydown   = (e) => { if (e.key === 'Enter') btnOk.click(); if (e.key === 'Escape') btnSubir.click(); };

        btnContainer.appendChild(btnSubir);
        btnContainer.appendChild(btnOk);
        modal.appendChild(title);
        modal.appendChild(input);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        input.focus();
    }

    function setEstadoCargaFragmentacionIA(isProcessing) {
        const btn = document.getElementById('btn-fragmentar-ia');
        if (!btn) return;
        if (isProcessing) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML        = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
            btn.disabled         = true;
        } else {
            btn.innerHTML = btn.dataset.original || '<i class="fa-solid fa-scissors"></i> Fragmentar con IA';
            btn.disabled  = false;
        }
    }

    return {
        abrirEditorAmigable,
        getEditorData,
        limpiarEditorData,
        mostrarFeedbackGuardadoEditor,
        setBtnIAModo,
        abrirEditorJSON,
        cancelarEdicion,
        pedirNombreAsignatura,
        setEstadoCargaFragmentacionIA,
    };
})();
