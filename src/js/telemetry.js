// ════════════════════════════════════════════════════════════════
// TELEMETRY.JS — Motor de Estadísticas y Dashboard
// Encapsula cálculos de FSRS (deuda), mapas de calor, rachas,
// y orquesta las actualizaciones de los widgets de la UI.
// ════════════════════════════════════════════════════════════════

const Telemetry = (() => {

    function updateDashboard() {
        const asig = State.get('nombreAsignaturaActual');
        const dashboardCol = document.getElementById('dashboard-col');
        
        if (!asig) {
            if (dashboardCol) dashboardCol.classList.add('hidden');
            return;
        }
        if (dashboardCol) dashboardCol.classList.remove('hidden');

        const _hidden = (State.get('widgetConfig') || {}).hidden || {};
        const _run = (wid, fn) => { if (!_hidden[wid]) fn(); };

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
        
        if (typeof window.renderUpcomingEvents === 'function') window.renderUpcomingEvents();
    }

    function updateDifficultyStats() {
        const asig = State.get('nombreAsignaturaActual');
        if (!asig) return;
        const snapKey = `dist_snap_${asig}`;
        const prevSnap = JSON.parse(localStorage.getItem(snapKey) || 'null');
        const counts = UI.updateDifficultyStats(State.get('biblioteca'), asig, prevSnap);
        if (counts) localStorage.setItem(snapKey, JSON.stringify(counts));
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
        const todayStr = window.getFechaHoy();
        
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
        const todayStr = window.formatearFecha(today);
        const todayVal = window.fechaValor(todayStr);

        let doneMap = {};
        let missedMap = {};

        cards.forEach(c => {
            if (c.UltimoRepaso) doneMap[c.UltimoRepaso] = true;
            if (c.ProximoRepaso) {
                const pVal = window.fechaValor(c.ProximoRepaso);
                if (pVal < todayVal) missedMap[c.ProximoRepaso] = true;
            }
        });

        const todayLog = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0, "details":{}}');
        const asigKey = asig.toLowerCase().trim();
        if (todayLog.details && (todayLog.details[asigKey] > 0 || todayLog.details["general"] > 0)) {
            doneMap[todayStr] = true;
        }

        let streak = 0;
        let checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - 1); 

        for (let i = 0; i < 365; i++) {
            const dayStr = window.formatearFecha(checkDate);
            if (missedMap[dayStr]) break; 
            else if (doneMap[dayStr]) streak++;
            else break;
            checkDate.setDate(checkDate.getDate() - 1);
        }

        if (doneMap[todayStr]) streak++;

        const elStreak = document.getElementById('stat-streak');
        const elTotal = document.getElementById('stat-total-days'); 
        const elAvg = document.getElementById('stat-avg'); 
        const elMsg = document.getElementById('streak-msg');

        if(elStreak) {
            elStreak.innerText = streak;
            const totalDiasActivos = Object.keys(doneMap).length;
            elTotal.innerText = totalDiasActivos;
            
            const totalCards = cards.filter(c => c.UltimoRepaso).length;
            const avg = totalDiasActivos > 0 ? (totalCards / totalDiasActivos).toFixed(1) : 0;
            elAvg.innerText = avg;

            elStreak.style.color = streak > 0 ? "#FFC107" : "#666";
            
            if (streak === 0) elMsg.innerText = "No has empezado aún...";
            else if (streak === 1) elMsg.innerText = "Sigue así!";
            else elMsg.innerText = `${streak} días de racha. Bien hecho.`;
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

    function calcularDeuda() {
        const asig = State.get('nombreAsignaturaActual');
        const biblio = State.get('biblioteca');
        if (!asig || !biblio[asig]) return 0;
        
        const tarjetas = biblio[asig];
        const todayVal = window.fechaValor(window.getFechaHoy());
        let deuda = 0;

        for (const c of tarjetas) {
            if (!c.ProximoRepaso || window.fechaValor(c.ProximoRepaso) > todayVal) continue;
            
            if (c.fsrs_state === 'new') {
                deuda += 1.0; 
            } else if (c.fsrs_state === 'learning') {
                deuda += 4.0; 
            } else {
                const elapsed = c.UltimoRepaso ? Math.max(0, window.diffDiasCalendario(c.UltimoRepaso, window.getFechaHoy())) : 0;
                const R = c.fsrs_stability ? Math.pow(0.9, elapsed / c.fsrs_stability) : 0.9;
                const probOlvido = 1 - R; 
                const D = c.fsrs_difficulty || 5; 
                let pesoDinamico = Math.max(0.5, probOlvido * D);
                deuda += pesoDinamico;
            }
        }
        return Math.round(deuda * 10) / 10;
    }

    function updatePronostico() { UI.updatePronostico(State.get('biblioteca'), State.get('nombreAsignaturaActual')); }
    function updateDeudaEstudio() { UI.updateDeudaEstudio(State.get('biblioteca'), State.get('nombreAsignaturaActual')); }
    
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
        const tarjetas = sessionData.tarjetas;
        const pctFacil = tarjetas > 0 ? Math.round((sessionData.faciles / tarjetas) * 100) : 0;
        const deudaAhora = calcularDeuda();
        const deltaDeuda = sessionData.deudaInicial - deudaAhora;

        const elTarjetas = document.getElementById('rsm-tarjetas');
        if(elTarjetas) elTarjetas.innerText = tarjetas;
        
        const elFacilidad = document.getElementById('rsm-facilidad');
        if(elFacilidad) elFacilidad.innerText = tarjetas > 0 ? pctFacil + '%' : '-';
        
        const deudaEl = document.getElementById('rsm-deuda');
        if(deudaEl) {
            if (deltaDeuda > 0) {
                deudaEl.innerText = '-' + deltaDeuda;
                deudaEl.style.color = '#4CAF50';
            } else if (deltaDeuda < 0) {
                deudaEl.innerText = '+' + Math.abs(deltaDeuda);
                deudaEl.style.color = '#f44336';
            } else {
                deudaEl.innerText = '=';
                deudaEl.style.color = '#888';
            }
        }

        let breakdownHtml = '';
        if (tarjetas > 0) {
            const parts = [];
            if (sessionData.faciles > 0) parts.push(`🟢 Fáciles: <strong>${sessionData.faciles}</strong>`);
            const bien = tarjetas - sessionData.faciles - sessionData.dificiles - sessionData.criticas;
            if (bien > 0) parts.push(`🟡 Bien: <strong>${bien}</strong>`);
            if (sessionData.dificiles > 0) parts.push(`🟠 Difíciles: <strong>${sessionData.dificiles}</strong>`);
            if (sessionData.criticas > 0) parts.push(`🔴 Críticas: <strong>${sessionData.criticas}</strong>`);
            breakdownHtml = parts.join(' &nbsp;·&nbsp; ');
        }
        const elBreakdown = document.getElementById('rsm-breakdown');
        if(elBreakdown) elBreakdown.innerHTML = breakdownHtml;

        const mensajes = [
            [0, "Pomodoro completado. ¡Descansa!"],
            [5, "Sesión ligera. Cada tarjeta cuenta."],
            [15, "Buena sesión. ¡Sigue el ritmo!"],
            [30, "Sesión intensa. Mereces el descanso."],
            [Infinity, "¡Bestia! Sesión excepcional."]
        ];
        const msg = mensajes.find(([limit]) => tarjetas <= limit) || mensajes[mensajes.length-1];
        const elMensaje = document.getElementById('rsm-mensaje');
        if(elMensaje) elMensaje.innerText = msg[1];

        const modal = document.getElementById('resumen-sesion-modal');
        if(modal) modal.classList.add('visible');
    }

    function cerrarResumenSesion() {
        const modal = document.getElementById('resumen-sesion-modal');
        if (modal) modal.classList.remove('visible');
    }

    function updatePendingWindow(fechaEspecifica = null) {
        UI.updatePendingWindow(State.get('biblioteca'), State.get('nombreAsignaturaActual'), fechaEspecifica);
    }

    return {
        updateDashboard, updateDifficultyStats, updateCalendarHeatmap,
        updatePomoStats, registrarPomoCompletado, editarProgresoManual,
        updateGlobalStats, setWeeklyView, updateWeeklyWidget, calcularDeuda,
        updatePronostico, updateDeudaEstudio, updateEficienciaWidget,
        updateMapaHoras, showResumenSesion, cerrarResumenSesion, updatePendingWindow
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
window.calcularDeuda           = () => Telemetry.calcularDeuda();
window.updatePronostico        = () => Telemetry.updatePronostico();
window.updateDeudaEstudio      = () => Telemetry.updateDeudaEstudio();
window.updateEficienciaWidget  = () => Telemetry.updateEficienciaWidget();
window.updateMapaHoras         = () => Telemetry.updateMapaHoras();
window.showResumenSesion       = () => Telemetry.showResumenSesion();
window.cerrarResumenSesion     = () => Telemetry.cerrarResumenSesion();
window.updatePendingWindow     = (f) => Telemetry.updatePendingWindow(f);