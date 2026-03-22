// ════════════════════════════════════════════════════════════════
// TELEMETRY.JS — Motor de Estadísticas y Dashboard
// Encapsula cálculos de FSRS (deuda), mapas de calor, rachas,
// y orquesta las actualizaciones de los widgets de la UI.
// ════════════════════════════════════════════════════════════════

const Telemetry = (() => {

    function updateDashboard() {
        const asig = State.get('nombreAsignaturaActual');
        
        if (typeof UI !== 'undefined' && UI.toggleDashboardVisibility) {
            UI.toggleDashboardVisibility(!!asig);
        }
        
        if (!asig) return;

        const _hidden = (State.get('widgetConfig') || {}).hidden || {};
        
        // Error Boundary para evitar fallos en cascada en el Dashboard
        const _run = (wid, fn) => { 
            if (!_hidden[wid]) {
                try {
                    fn();
                } catch (e) {
                    Logger.error(`Dashboard: Excepción controlada en ${wid}:`, e);
                }
            } 
        };

        _run('widget-distribucion', updateDifficultyStats);
        _run('widget-calendario',   updateCalendarHeatmap);
        _run('widget-progreso',     updatePomoStats);
        _run('widget-constancia',   updateGlobalStats);
        _run('widget-pendientes',   updatePendingWindow);
        _run('widget-semanal',      updateWeeklyWidget);
        _run('widget-pronostico',   updatePronostico);
        _run('widget-deuda',        updateDeudaEstudio);
        _run('widget-eficiencia',   updateEficienciaWidget);
        _run('widget-horas',        updateMapaHoras);
        
        if (typeof window.renderUpcomingEvents === 'function') {
            try { window.renderUpcomingEvents(); } catch (e) { /* ignore */ }
        }
    }

    function setWeeklyView(mode) {
        window.weeklyViewMode = mode; 
        if (typeof UI !== 'undefined' && UI.updateWeeklyViewButtons) {
            UI.updateWeeklyViewButtons(mode);
        }
        updateWeeklyWidget();
    }

    function cerrarResumenSesion() {
        if (typeof UI !== 'undefined' && UI.cerrarResumenSesion) {
            UI.cerrarResumenSesion();
        }
    }
    

    function updateDifficultyStats() {
        const asig = State.get('nombreAsignaturaActual');
        const bib = State.getRef('biblioteca');
        if (!asig || !bib[asig]) return;

        const cards = bib[asig];
        let counts = { new: 0, learning: 0, consolidando: 0, revision: 0, dominadas: 0 };
        let pendientesHoy = 0;
        const todayVal = Domain.fechaValor(Domain.getFechaHoy());

        cards.forEach(c => {
            const state     = c.fsrs_state || 'new';
            const stability = c.fsrs_stability || 0;

            if (!c.UltimoRepaso || state === 'new') {
                counts.new++;
            } else if (state === 'learning') {
                counts.learning++;
            } else {
                if      (stability > 21) counts.dominadas++;
                else if (stability >= 7) counts.revision++;
                else                     counts.consolidando++;
            }

            if (c.ProximoRepaso && Domain.fechaValor(c.ProximoRepaso) <= todayVal) pendientesHoy++;
        });

        UI.updateDifficultyStats(counts, cards.length, pendientesHoy);
    }

    function updateCalendarHeatmap() {
        UI.updateCalendarHeatmap(
            State.get('biblioteca'), 
            State.get('nombreAsignaturaActual'), 
            State.get('fechasClave'), 
            window.calendarViewDate || new Date()
        );
    }
    
    function updatePomoStats() {
        const pomoLogHoy = JSON.parse(localStorage.getItem('pomo_log_today') || '{"date":"","count":0,"details":{}}');
        UI.updatePomoStats(
            State.get('horarioGlobal'), 
            State.get('nombreAsignaturaActual'), 
            State.get('taskList'), 
            pomoLogHoy
        );
    }

    function registrarPomoCompletado(asignatura) {
        let todayLog = JSON.parse(localStorage.getItem('pomo_log_today') || '{"date":"","count":0, "details":{}}');
        const todayStr = Domain.getFechaHoy();
        
        if(todayLog.date !== todayStr) { 
            if(todayLog.date && todayLog.count > 0) {
                let history = JSON.parse(localStorage.getItem('pomo_history') || '{}');
                history[todayLog.date] = todayLog.count;
                let detailsHistory = JSON.parse(localStorage.getItem('pomo_details_history') || '{}');
                detailsHistory[todayLog.date] = todayLog.details || {};
                
                const keys = Object.keys(history);
                if(keys.length > 60) { delete history[keys[0]]; delete detailsHistory[keys[0]]; }
                
                localStorage.setItem('pomo_history', JSON.stringify(history));
                localStorage.setItem('pomo_details_history', JSON.stringify(detailsHistory));
            }
            todayLog = {date: todayStr, count: 0, details: {}}; 
        }
        
        todayLog.count++;
        if (!todayLog.details) todayLog.details = {};
        
        let asigKey = asignatura ? asignatura.trim() : "General";
        asigKey = asigKey.charAt(0).toUpperCase() + asigKey.slice(1);
        todayLog.details[asigKey] = (todayLog.details[asigKey] || 0) + 1;

        const hora = new Date().getHours();
        if (!todayLog.horas) todayLog.horas = {};
        todayLog.horas[hora] = (todayLog.horas[hora] || 0) + 1;
        
        let horaHistory = JSON.parse(localStorage.getItem('pomo_hora_history') || '{}');
        horaHistory[hora] = (horaHistory[hora] || 0) + 1;
        localStorage.setItem('pomo_hora_history', JSON.stringify(horaHistory));

        localStorage.setItem('pomo_log_today', JSON.stringify(todayLog));
        
        updatePomoStats();
        updateWeeklyWidget();
        updateGlobalStats();
    }
    function registrarExamen(payload) {
        let historial = JSON.parse(localStorage.getItem('estudiador_historial_examenes') || '[]');
        historial.push(payload);
        
        // Mantenemos una ventana móvil de los últimos 100 exámenes para no saturar memoria
        if (historial.length > 100) historial.shift();
        
        localStorage.setItem('estudiador_historial_examenes', JSON.stringify(historial));
        Logger.info("Historial de examen persistido.");
    }

    function editarProgresoManual() {
        const asigKey = State.get('nombreAsignaturaActual') || "General";
        const asigNorm = asigKey.trim();
        
        let todayLog = JSON.parse(localStorage.getItem('pomo_log_today') || '{"date":"","count":0, "details":{}}');
        const keyBuscada = Object.keys(todayLog.details || {}).find(k => k.toLowerCase() === asigNorm.toLowerCase()) || asigNorm;
        const valorActual = (todayLog.details && todayLog.details[keyBuscada]) || 0;

        const nuevoValor = prompt(`Corregir pomodoros de hoy para ${asigKey}:`, valorActual);
        
        if (nuevoValor !== null) {
            const intVal = parseInt(nuevoValor);
            if (!isNaN(intVal) && intVal >= 0) {
                const diferencia = intVal - valorActual;
                if (!todayLog.details) todayLog.details = {};
                todayLog.details[keyBuscada] = intVal;
                
                todayLog.count += diferencia;
                if(todayLog.count < 0) todayLog.count = 0; 

                localStorage.setItem('pomo_log_today', JSON.stringify(todayLog));
                updateDashboard(); 
            }
        }
    }

    function updateGlobalStats() {
        const asig = State.get('nombreAsignaturaActual');
        const biblioteca = State.get('biblioteca');
        if (!asig || !biblioteca[asig]) return;

        const cards = biblioteca[asig];
        const today = new Date();
        const todayStr = Domain.formatearFecha(today);

        let doneMap = {};

        // Mapeamos únicamente los días donde hubo actividad real
        cards.forEach(c => {
            if (c.UltimoRepaso) doneMap[c.UltimoRepaso] = true;
        });

        const todayLog = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0, "details":{}}');
        const asigKey = asig.toLowerCase().trim();
        if (todayLog.details && (todayLog.details[asigKey] > 0 || todayLog.details["general"] > 0)) {
            doneMap[todayStr] = true;
        }

        let streak = 0;
        let checkDate = new Date(today);
        
        // LÓGICA DE RACHA CORREGIDA:
        // Si ya estudiaste hoy, cuenta hacia atrás desde hoy.
        // Si aún no has estudiado hoy, cuenta hacia atrás desde ayer (mantienes tu número visualmente).
        const estudiadoHoy = !!doneMap[todayStr];
        checkDate.setDate(checkDate.getDate() - (estudiadoHoy ? 0 : 1));

        for (let i = 0; i < 365; i++) {
            const dayStr = Domain.formatearFecha(checkDate);
            if (!doneMap[dayStr]) break; // Solo rompe si un día entero no tuvo repasos
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        }

        const totalDiasActivos = Object.keys(doneMap).length;
        const totalCards = cards.filter(c => c.UltimoRepaso).length;
        const avg = totalDiasActivos > 0 ? (totalCards / totalDiasActivos).toFixed(1) : 0;

        // Delegación estricta a la Vista
        if (typeof UI !== 'undefined' && UI.updateGlobalStats) {
            UI.updateGlobalStats(streak, totalDiasActivos, avg);
        }
    }

    function setWeeklyView(mode) {
        window.weeklyViewMode = mode; 
        const btn7 = document.getElementById('btn-week-7');
        const btn28 = document.getElementById('btn-week-28');
        if (btn7) btn7.classList.toggle('active', mode === '7d');
        if (btn28) btn28.classList.toggle('active', mode === '28d');
        updateWeeklyWidget();
    }

    function updateWeeklyWidget() {
        const pomoHistory        = JSON.parse(localStorage.getItem('pomo_history') || '{}');
        const pomoLogHoy         = JSON.parse(localStorage.getItem('pomo_log_today') || '{}');
        const pomoDetailsHistory = JSON.parse(localStorage.getItem('pomo_details_history') || '{}');
        UI.updateWeeklyWidget(
            State.get('horarioGlobal'), 
            State.get('biblioteca'), 
            window.weeklyViewMode || '7d',
            pomoHistory, pomoLogHoy, pomoDetailsHistory
        );
    }


    function updatePronostico() {
        const asigActual = State.get('nombreAsignaturaActual');
        const bib = State.get('biblioteca');
        if (!asigActual || !bib[asigActual]) {
            UI.updatePronostico([], 1);
            return;
        }

        const cards = bib[asigActual];
        const dayLabels = ["D","L","M","X","J","V","S"];
        let counts = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(); d.setDate(d.getDate() + i);
            const dStr = Domain.formatearFecha(d);
            const dayLabel = dayLabels[d.getDay()];
            const isToday = i === 0;
            const count = cards.filter(c => c.ProximoRepaso === dStr).length
                        + (isToday ? cards.filter(c => c.ProximoRepaso && Domain.fechaValor(c.ProximoRepaso) < Domain.fechaValor(dStr)).length : 0);
            counts.push({ dayLabel, count, isToday });
        }

        const maxCount = Math.max(...counts.map(c => c.count), 1);
        UI.updatePronostico(counts, maxCount);
    }
    function updateDeudaEstudio() {
    const asigActual = State.get('nombreAsignaturaActual');
    const bib = State.getRef('biblioteca');

    if (!asigActual || !bib[asigActual]) {
        UI.updateDeudaEstudio(0, { nuevas:0, learning:0, repasoNormal:0, criticas:0 }, { nuevas:0, learning:0, repasoNormal:0, criticas:0 });
        return;
    }

    try {
        const todayVal = fechaValor(getFechaHoy());
        let deudaTotal = 0;
        let contadores  = { nuevas:0, learning:0, repasoNormal:0, criticas:0 };
        let deudaDesglose = { nuevas:0, learning:0, repasoNormal:0, criticas:0 };

        bib[asigActual].forEach(c => {
            if (!c.ProximoRepaso || fechaValor(c.ProximoRepaso) > todayVal) return;

            const isNew = c.fsrs_state === 'new' || (!c.fsrs_state && !c.UltimoRepaso);
            if (isNew) {
                deudaTotal += 1.0; contadores.nuevas++; deudaDesglose.nuevas += 1.0;
            } else if (c.fsrs_state === 'learning') {
                deudaTotal += 4.0; contadores.learning++; deudaDesglose.learning += 4.0;
            } else {
                const R = Scheduler.retencionActual(c) ?? 0.9;
                const D = c.fsrs_difficulty || 5;
                const peso = Math.max(0.5, (1 - R) * D);
                deudaTotal += peso;
                if (R < 0.8) { contadores.criticas++; deudaDesglose.criticas += peso; }
                else         { contadores.repasoNormal++; deudaDesglose.repasoNormal += peso; }
            }
        });

        UI.updateDeudaEstudio(deudaTotal, contadores, deudaDesglose);
    } catch (err) {
        Logger.error("Telemetría (Deuda): Ejecución abortada.", err);
    }
}
    
    function updateEficienciaWidget() {
        const pomoLogHoy = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0,"details":{}}');
        UI.updateEficienciaWidget(State.get('biblioteca'), State.get('nombreAsignaturaActual'), pomoLogHoy);
    }

    function updateMapaHoras() {
        const horaHistory = JSON.parse(localStorage.getItem('pomo_hora_history') || '{}');
        UI.updateMapaHoras(horaHistory);
    }

    function showResumenSesion() {
        if (typeof window.sincronizarTelemetriaFSRS === 'function') {
            window.sincronizarTelemetriaFSRS().catch(e => console.error("Error silencioso en sync:", e));
        }

        const sessionData = State.get('sessionData') || { tarjetas: 0, faciles: 0, dificiles: 0, criticas: 0, deudaInicial: 0 };
        const asig = State.get('nombreAsignaturaActual');
        const biblio = State.get('biblioteca');
        const deudaAhora = typeof Domain.calcularDeuda === 'function' ? Domain.calcularDeuda(asig, biblio) : 0; 
        
        // Delegación estricta a la capa de UI.
        UI.showResumenSesion(sessionData, deudaAhora);
    }

    function cerrarResumenSesion() {
        const modal = document.getElementById('resumen-sesion-modal');
        if (modal) modal.classList.remove('visible');
    }

    function updatePendingWindow(fechaEspecifica) {
        UI.updatePendingWindow(
            State.get('biblioteca'),
            State.get('nombreAsignaturaActual'),
            fechaEspecifica  // undefined llega intacto (no hay default aquí)
        );
    }
    // ── Resumen público (para subida a Firestore) ─────────────────

/**
 * Calcula la racha de días consecutivos de estudio desde el estado.
 * Función pura: no toca el DOM ni efectos secundarios.
 * @param {Object} biblioteca
 * @returns {number}
 */
function _calcularRachaDesdeEstado(biblioteca) {
        const todayStr = Domain.getFechaHoy();
        let doneMap = {};

        Object.values(biblioteca || {}).forEach(tarjetas => {
            (tarjetas || []).forEach(c => {
                if (c.UltimoRepaso) doneMap[Domain.toISODateString(c.UltimoRepaso)] = true;
            });
        });

        let streak = 0;
        let check = new Date();
        
        // Aplica el mismo pivote lógico para el resumen público
        const estudiadoHoy = !!doneMap[todayStr];
        check.setDate(check.getDate() - (estudiadoHoy ? 0 : 1));

        for (let i = 0; i < 365; i++) {
            const d = Domain.formatearFecha(check);
            if (!doneMap[d]) break;
            streak++;
            check.setDate(check.getDate() - 1);
        }
        return streak;
    }

/**
 * Construye el objeto de estadísticas públicas del usuario para Firestore.
 * Lee únicamente de State y localStorage. Cero DOM, cero efectos secundarios.
 * @returns {Object} Resumen público serializable
 */
function construirResumenPublico() {
    const isPrivate = localStorage.getItem('estudiador_privacy_stats') === 'true';
    if (isPrivate) return { isPrivate: true };

    const todayLog   = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0}');
    const biblioteca = State.get('biblioteca') || {};
    const todayVal   = Domain.fechaValor(Domain.getFechaHoy());

    const resumen = {
        isPrivate:     false,
        totalTarjetas: 0,
        pendientesHoy: 0,
        dominadas:     0,
        deudaTotal:    0,
        racha:         _calcularRachaDesdeEstado(biblioteca),
        pomosHoy:      todayLog.count || 0,
        asignaturas:   []
    };

    Object.keys(biblioteca).forEach(asig => {
        const tarjetas = Array.isArray(biblioteca[asig]) ? biblioteca[asig] : [];
        if (!tarjetas.length) return;

        let pendientes = 0, dominadas = 0

        tarjetas.forEach(c => {
            if (!c?.ProximoRepaso || Domain.fechaValor(c.ProximoRepaso) <= todayVal) pendientes++;

            if      (c.fsrs_state === 'review' && c.fsrs_stability > 21) dominadas++;
            else if (!c.fsrs_state && (c?.EtapaRepaso || 0) >= 5)        dominadas++;
        });
        
        resumen.totalTarjetas += tarjetas.length;
        resumen.pendientesHoy += pendientes;
        resumen.dominadas     += dominadas;
        resumen.deudaTotal    += Scheduler.calcularDeudaArray(tarjetas);
        resumen.asignaturas.push({
            nombre:        asig,
            totalTarjetas: tarjetas.length,
            pendientesHoy: pendientes,
            dominadas,
            deuda:         Math.round(deudaLocal * 10) / 10
        });
    });

    resumen.deudaTotal = Math.round(resumen.deudaTotal * 10) / 10;
    return resumen;
}

    return {
        updateDashboard, updateDifficultyStats, updateCalendarHeatmap,
        updatePomoStats, registrarPomoCompletado, editarProgresoManual,
        updateGlobalStats, setWeeklyView, updateWeeklyWidget,
        updatePronostico, updateDeudaEstudio, updateEficienciaWidget, construirResumenPublico,
        updateMapaHoras, showResumenSesion, cerrarResumenSesion, updatePendingWindow, registrarExamen
    };
})();

// ── Proxies globales ─────────────────────────────────────────
window.updateDashboard         = () => Telemetry.updateDashboard();
window.updateDifficultyStats   = () => Telemetry.updateDifficultyStats();
window.updateCalendarHeatmap   = () => Telemetry.updateCalendarHeatmap();
window.updatePomoStats         = () => Telemetry.updatePomoStats();
window.registrarPomoCompletado = (asig) => Telemetry.registrarPomoCompletado(asig);
window.editarProgresoManual    = () => Telemetry.editarProgresoManual();
window.updateGlobalStats       = () => Telemetry.updateGlobalStats();
window.setWeeklyView           = (m) => Telemetry.setWeeklyView(m);
window.updateWeeklyWidget      = () => Telemetry.updateWeeklyWidget();
window.updatePronostico        = () => Telemetry.updatePronostico();
window.updateDeudaEstudio      = () => Telemetry.updateDeudaEstudio();
window.updateEficienciaWidget  = () => Telemetry.updateEficienciaWidget();
window.updateMapaHoras         = () => Telemetry.updateMapaHoras();
window.showResumenSesion       = () => Telemetry.showResumenSesion();
window.cerrarResumenSesion     = () => Telemetry.cerrarResumenSesion();
window.updatePendingWindow     = (f) => Telemetry.updatePendingWindow(f);
window.registrarExamen         = (p) => Telemetry.registrarExamen(p);
window.construirResumenPublico = () => Telemetry.construirResumenPublico();