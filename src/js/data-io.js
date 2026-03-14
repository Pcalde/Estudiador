// ════════════════════════════════════════════════════════════════
// DATA-IO.JS — Gestor de Entrada/Salida de Datos
// Encapsula la importación, exportación, backups y telemetría.
// Arquitectura: Usa State.get/set para datos. Recibe callbacks 
// para orquestación de UI/Persistencia vía init().
// ════════════════════════════════════════════════════════════════

const DataIO = (() => {

    // ── Dependencias inyectadas por app.js ────────────────────────
    let _cb = {
        guardarEnLocal: () => {}, actualizarMenuLateral: () => {}, cargarAsignatura: () => {},
        cancelarEdicion: () => {}, aplicarFiltros: () => {}, updateDashboard: () => {},
        sincronizar: () => {}, getFechaHoy: () => new Date().toISOString().slice(0, 10),
        ordenarTarjeta: (t) => t
    };

    function init(callbacks) {
        _cb = { ..._cb, ...callbacks };
    }

    // ── Helper interno ────────────────────────────────────────────
    function _descargar(uri, nombreArchivo) {
        const a = document.createElement('a');
        a.href = uri;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ════════════════════════════════════════════════════════════
    // 1. IMPORTACIÓN LaTeX
    // ════════════════════════════════════════════════════════════
    function procesarImportacionLatex() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) { alert("Selecciona una asignatura primero."); return; }

        const rawInput = document.getElementById('import-area-latex').value;
        const temaDefault = parseInt(document.getElementById('latex-tema-input').value) || 1;
        const newCards = Parser.parseLatexToCards(rawInput, temaDefault);

        if (newCards.length === 0) { alert("No se detectaron comandos válidos."); return; }

        const titulosGenericos = ['definición','teorema','proposición','lema','corolario','axioma','observación','nota','ejemplo','demostración','propiedad'];
        let nuevas = 0, actualizadas = 0;
        let biblioteca = State.get('biblioteca') || {};

        newCards.forEach(c => {
            const tituloLimpio = c.Titulo.toLowerCase().trim();
            const esGenerico = tituloLimpio.endsWith('(auto)') || titulosGenericos.includes(tituloLimpio);
            const existente = biblioteca[asigActual].find(ext => ext.Titulo.toLowerCase().trim() === tituloLimpio);

            if (existente && !esGenerico) {
                existente.Contenido = c.Contenido;
                existente.Tema = c.Tema;
                existente.Apartado = c.Apartado;
                actualizadas++;
            } else {
                biblioteca[asigActual].push(c);
                nuevas++;
            }
        });

        State.set('biblioteca', biblioteca);
        _cb.guardarEnLocal();
        _cb.actualizarMenuLateral(biblioteca, asigActual);
        _cb.cargarAsignatura(asigActual);
        
        alert(`Importación completada:\n\n✨ ${nuevas} nuevas.\n♻️ ${actualizadas} actualizadas.`);
        document.getElementById('import-area-latex').value = "";
        _cb.cancelarEdicion();
    }

    // ════════════════════════════════════════════════════════════
    // 2. IMPORTACIÓN JSON
    // ════════════════════════════════════════════════════════════
    function procesarImportacion() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) { alert("Error: No hay asignatura seleccionada."); return; }

        const raw = document.getElementById('import-area').value;
        if (!raw || raw.trim() === "") { alert("El campo de texto está vacío."); return; }

        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) throw new Error("Debe ser una lista [].");

            let importados = 0, omitidos = 0;
            let biblioteca = State.get('biblioteca') || {};

            arr.forEach(item => {
                if (item.Titulo || item.Contenido) {
                    biblioteca[asigActual].push({
                        "Titulo": item.Titulo || "Sin Título",
                        "Contenido": Parser.sanearLatex(item.Contenido || "..."),
                        "Tema": parseInt(item.Tema) || 1,
                        "Apartado": item.Apartado || "Definición",
                        "Dificultad": null,
                        "EtapaRepaso": item.EtapaRepaso !== undefined ? item.EtapaRepaso : 0,
                        "UltimoRepaso": item.UltimoRepaso || null,
                        "ProximoRepaso": item.ProximoRepaso || _cb.getFechaHoy()
                    });
                    importados++;
                } else {
                    omitidos++;
                }
            });

            if (importados > 0) {
                State.set('biblioteca', biblioteca);
                _cb.guardarEnLocal();
                alert(`ÉXITO: ${importados} tarjetas añadidas.${omitidos > 0 ? `\nOmitidas: ${omitidos}` : ''}`);
                document.getElementById('import-area').value = "";
                _cb.cancelarEdicion();
                _cb.aplicarFiltros();
                _cb.updateDashboard();
            }
        } catch (e) {
            alert("ERROR DE SINTAXIS:\n" + e.message);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 3. EDICIÓN JSON DIRECTA
    // ════════════════════════════════════════════════════════════
    function guardarEdicionJSON() {
        const asigActual = State.get('nombreAsignaturaActual');
        const raw = document.getElementById('json-editor-area').value;
        try {
            let parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error("Debe ser una lista []");
            
            parsed = parsed.map(_cb.ordenarTarjeta);
            let biblioteca = State.get('biblioteca') || {};
            biblioteca[asigActual] = parsed;
            
            State.set('biblioteca', biblioteca);
            _cb.guardarEnLocal();
            _cb.sincronizar();
            alert("Cambios guardados.");
            _cb.cargarAsignatura(asigActual);
        } catch (e) {
            alert("Error sintaxis: " + e.message);
        }
    }

    function descargarAsignaturaActual() {
        const asigActual = State.get('nombreAsignaturaActual');
        if (!asigActual) return;
        const biblioteca = State.get('biblioteca') || {};
        const uri = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(biblioteca[asigActual], null, 4));
        _descargar(uri, asigActual + ".json");
    }

    // ════════════════════════════════════════════════════════════
    // 4. BACKUP Y RESTAURACIÓN INTEGRAL
    // ════════════════════════════════════════════════════════════
    async function exportarBackup() {
        const backupData = {
            version: "1.16.4",
            timestamp: new Date().toISOString(),
            data: {
                'estudiador_db_v2':        JSON.stringify(State.get('biblioteca') || {}),
                'estudiador_horario':      JSON.stringify(State.get('horarioGlobal') || {}),
                'estudiador_fechas_clave': JSON.stringify(State.get('fechasClave') || []),
                'estudiador_colores':      localStorage.getItem('estudiador_colores'),
                'estudiador_proyectos':    localStorage.getItem('estudiador_proyectos'),
                'pomo_settings':           localStorage.getItem('pomo_settings'),
                'pomo_tasks':              localStorage.getItem('pomo_tasks'),
                'pomo_log_today':          localStorage.getItem('pomo_log_today'),
                'estudiador_widget_config': localStorage.getItem('estudiador_widget_config')
            }
        };
        const uri = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 4));
        _descargar(uri, `Backup_Estudiador_${new Date().toISOString().slice(0, 10)}.json`);
    }

    function importarBackup(inputElement) {
        const file = inputElement.files[0];
        if (!file) return;
        if (!confirm("¡ATENCIÓN! Esto sobreescribirá todos tus datos actuales.\n¿Estás seguro?")) {
            inputElement.value = ""; return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const backup = JSON.parse(e.target.result);
                if (!backup.data) throw new Error("Falta el bloque 'data'");
                Object.keys(backup.data).forEach(key => {
                    if (backup.data[key] !== null) localStorage.setItem(key, backup.data[key]);
                });
                alert("Restauración completada. La página se recargará.");
                location.reload();
            } catch (err) { alert("Error al restaurar: " + err.message); }
        };
        reader.readAsText(file);
    }

    // ════════════════════════════════════════════════════════════
    // 5. UTILIDADES (FSRS & NUEVA ASIGNATURA)
    // ════════════════════════════════════════════════════════════
    function exportarDatosOptimizacionFSRS() {
        let csvContent = "card_id,review_time,review_rating,review_state,review_duration\n";
        let count = 0;
        const biblioteca = State.get('biblioteca') || {};

        Object.keys(biblioteca).forEach(asig => {
            if (!Array.isArray(biblioteca[asig])) return;
            biblioteca[asig].forEach(tarjeta => {
                if (!tarjeta.id || !Array.isArray(tarjeta.review_log)) return;
                tarjeta.review_log.forEach(log => {
                    csvContent += `${tarjeta.id},${log.ts},${log.g},${log.st},0.0\n`;
                    count++;
                });
            });
        });

        if (count === 0) { alert("Aún no hay datos de repaso acumulados."); return; }
        const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
        _descargar(uri, `FSRS_Revlog_Estudiador_${_cb.getFechaHoy()}.csv`);
    }

    function gestionarNuevaAsignatura() {
        const input = prompt("NUEVA ASIGNATURA:\n- Escribe el nombre para crearla vacía.\n- O deja VACÍO para importar un JSON.");
        if (input === null) return; 

        if (input.trim() !== "") {
            const nombre = input.trim();
            let biblioteca = State.get('biblioteca') || {};
            if(biblioteca[nombre]) { alert("Ya existe una asignatura con ese nombre."); return; }
            
            biblioteca[nombre] = []; 
            State.set('biblioteca', biblioteca);
            _cb.guardarEnLocal();
            _cb.actualizarMenuLateral(biblioteca, nombre);
            _cb.cargarAsignatura(nombre);
        } else {
            document.getElementById('file-input-unified').click();
        }
    }

    return {
        init, procesarImportacionLatex, procesarImportacion, guardarEdicionJSON,
        descargarAsignaturaActual, exportarBackup, importarBackup, 
        exportarDatosOptimizacionFSRS, gestionarNuevaAsignatura
    };
})();

// Proxies para el DOM
window.procesarImportacionLatex    = () => DataIO.procesarImportacionLatex();
window.procesarImportacion         = () => DataIO.procesarImportacion();
window.guardarEdicionJSON          = () => DataIO.guardarEdicionJSON();
window.descargarAsignaturaActual   = () => DataIO.descargarAsignaturaActual();
window.exportarBackup              = () => DataIO.exportarBackup();
window.importarBackup              = el  => DataIO.importarBackup(el);
window.exportarDatosOptimizacionFSRS = () => DataIO.exportarDatosOptimizacionFSRS();
window.gestionarNuevaAsignatura    = () => DataIO.gestionarNuevaAsignatura();