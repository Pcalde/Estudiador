// ════════════════════════════════════════════════════════════════
// TELEMETRY.JS — Motor de Estadísticas y Dashboard
// Encapsula cálculos de FSRS (deuda), mapas de calor, rachas,
// y orquesta las actualizaciones de los widgets de la UI.
// ════════════════════════════════════════════════════════════════

const Telemetry = (() => {

    
    async function updateCurvaOlvidoWidget() {
        try {
            const data = await OlvidoAnalytics.procesarCurvaOlvido();
            // Filtramos para exigir un tamaño muestral mínimo por intervalo de tiempo
            const datosValidos = data.filter(d => d.n > 3); 
            
            if (typeof UI !== 'undefined' && UI.updateCurvaOlvido) {
                UI.updateCurvaOlvido(datosValidos);
            }
        } catch (e) {
            console.error("Error orquestando Curva de Olvido:", e);
        }
    }

    
    function updateDashboard() {
        const asig = State.get('nombreAsignaturaActual');
        
        if (typeof UI !== 'undefined' && UI.toggleDashboardVisibility) {
            UI.toggleDashboardVisibility(!!asig);
        }
        
        if (!asig) return;

        const _hidden = (State.get('widgetConfig') || {}).hidden || {};
        
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
        
        // Ejecución delegada de la curva de olvido
        _run('widget-curva-olvido', updateCurvaOlvidoWidget);
        
        updateProbabilidadAprobado(); 
        
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('TELEMETRY_UPDATED', { widgets: ['upcoming-events', 'horas', 'probability'] });
        }
    }
        
 //////////////////////////////
 // SIMULACIÓN DE MONTECARLO
 //////////////////////////////
    
    function updateProbabilidadAprobado() {
        const asigActual = State.get('nombreAsignaturaActual');
        const resultadosTotales = State.get('resultadosMonteCarlo') || {};
        const res = resultadosTotales[asigActual];
        
        const historyKey = `mc_history_${asigActual}`;
        const history = JSON.parse(localStorage.getItem(historyKey) || '[]');

        if (typeof UI !== 'undefined' && UI.renderWidgetMonteCarlo) {
            UI.renderWidgetMonteCarlo(res, history);
        }
    }

    // Lee los valores actuales de los inputs del modal (solo para pasar a la simulación)
function obtenerFiltrosSimulacion() {
    return {
        fechaExamen: document.getElementById('mc-fecha-examen')?.value || null,
        umbral: parseFloat(document.getElementById('mc-umbral')?.value) || 5.0,
        filtroTema: document.getElementById('mc-filtro-tema')?.value || null,
        filtroApartado: document.getElementById('mc-filtro-apartado')?.value || null
    };
}

// ========== MODIFICACIÓN DENTRO DEL IIFE DE telemetry.js ==========

function _parsearRangoTemas(str) {
    if (!str || !str.trim()) return null;
    const bloques = str.split(',');
    const temasValidos = new Set();
    
    bloques.forEach(b => {
        const elemento = b.trim();
        if (elemento.includes('-')) {
            const [inicio, fin] = elemento.split('-').map(Number);
            if (!isNaN(inicio) && !isNaN(fin) && inicio <= fin) {
                for (let i = inicio; i <= fin; i++) temasValidos.add(i);
            }
        } else {
            const num = Number(elemento);
            if (!isNaN(num) && elemento !== '') temasValidos.add(num);
        }
    });
    return temasValidos;
}

async function lanzarSimulacionMonteCarlo(config) {
    const asigActual = State.get('nombreAsignaturaActual');
    const bib = State.get('biblioteca');
    if (!asigActual || !bib[asigActual]) {
        if (typeof Toast !== 'undefined') Toast.show('Selecciona una asignatura primero.', 'warning');
        return;
    }

    const tarjetasTotales = bib[asigActual];
    
    // Parsear reglas para excluir del subconjunto a evaluar (si el usuario excluyó un apartado, no tiene sentido calcular su margen)
    const apartadosExcluidos = (config.reglas || []).filter(r => r.excluido).map(r => r.tipo.toLowerCase());
    const temasFiltrados = _parsearRangoTemas(config.filtroTemaRaw);

    let subsetObjetivo = tarjetasTotales.filter(t => {
        if (temasFiltrados && !temasFiltrados.has(Number(t.Tema))) return false;
        if (t.Apartado && apartadosExcluidos.includes(t.Apartado.trim().toLowerCase())) return false;
        return true;
    });

    if (subsetObjetivo.length === 0) {
        if (typeof Toast !== 'undefined') Toast.show('Tus filtros excluyen todas las tarjetas.', 'warning');
        return;
    }

    if (typeof UI !== 'undefined' && UI.mostrarCargaMonteCarlo) UI.mostrarCargaMonteCarlo();

    // Retardo inicial para renderizar la pantalla de carga
    setTimeout(() => {
        // Enviar la configuración completa al motor (incluyendo las matrices clásicas)
        const configSim = {
            notaMaxima: config.notaMaxima,
            notaObjetivo: config.notaObjetivo,
            maxTarjetas: config.maxTarjetas,
            maxPeso: config.maxPeso,
            fechaExamen: config.fechaExamen,
            simulaciones: config.simulaciones,
            reglas: config.reglas || []
        };

        const resultadoBase = Domain.calcularProbabilidadExito(tarjetasTotales, configSim);

        State.batch(() => {
            const todos = State.get('resultadosMonteCarlo') || {};
            todos[asigActual] = resultadoBase;
            State.set('resultadosMonteCarlo', todos);
        });
        Telemetry.updateProbabilidadAprobado();

        if (resultadoBase.error || !config.calcularEstrategia) {
            if (typeof UI !== 'undefined' && UI.renderResultadosMonteCarlo) {
                UI.renderResultadosMonteCarlo(resultadoBase, null, null);
            }
            return;
        }

        // Aplicar el filtro secundario de estrategia si el usuario seleccionó un tipo específico
        let subsetMarginal = subsetObjetivo;
        if (config.estrategiaFiltroTipo) {
            subsetMarginal = subsetObjetivo.filter(t => 
                t.Apartado && t.Apartado.trim().toLowerCase() === config.estrategiaFiltroTipo.toLowerCase()
            );
        }

        if (subsetMarginal.length === 0) {
            // El examen es válido, pero no hay tarjetas del tipo buscado para mejorar la nota
            if (typeof UI !== 'undefined' && UI.renderResultadosMonteCarlo) {
                UI.renderResultadosMonteCarlo(resultadoBase, [], null);
            }
            return;
        }

        const candidatos = subsetMarginal.slice(0, 75); 
        const resultadosMarginales = [];
        let idx = 0;

        function procesarSiguienteTarjeta() {
            if (idx < candidatos.length) {
                if (typeof UI !== 'undefined' && UI.actualizarProgresoMarginal) {
                    UI.actualizarProgresoMarginal(idx + 1, candidatos.length);
                }

                const tarjeta = candidatos[idx];
                const tarjetasModificadas = tarjetasTotales.map(t =>
                    t.id === tarjeta.id
                        ? { ...t, fsrs_stability: 1000, UltimoRepaso: Domain.getFechaHoy() }
                        : t
                );

                const sim = Domain.calcularProbabilidadExito(tarjetasModificadas, configSim);
                resultadosMarginales.push({
                    id: tarjeta.id,
                    titulo: tarjeta.Titulo,
                    tema: tarjeta.Tema,
                    apartado: tarjeta.Apartado,
                    deltaNota: sim.notaMedia - resultadoBase.notaMedia
                });

                idx++;
                setTimeout(procesarSiguienteTarjeta, 0); // Ejecución no bloqueante
            } else {
                const tarjetasCriticas = resultadosMarginales
                    .filter(r => r.deltaNota >= 0.1)
                    .sort((a, b) => b.deltaNota - a.deltaNota);

                const top5 = tarjetasCriticas.slice(0, 5);

                const historyKey = `mc_history_${asigActual}`;
                let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
                history.push({ 
                    ts: Date.now(), 
                    prob: resultadoBase.probabilidad, 
                    media: resultadoBase.notaMedia,
                    ansiedad: config.estresMedia
                });
                if (history.length > 30) history.shift();
                localStorage.setItem(historyKey, JSON.stringify(history));

                State.batch(() => {
                    const todos = State.get('resultadosMonteCarlo') || {};
                    if (todos[asigActual]) {
                        todos[asigActual].top5 = top5;
                        todos[asigActual].tarjetasCriticas = tarjetasCriticas;
                    }
                    State.set('resultadosMonteCarlo', todos);
                });

                const inyectarMazoCritico = (listaCritica) => {
                    if (!listaCritica || listaCritica.length === 0) {
                        if (typeof Toast !== 'undefined') Toast.show('No hay conceptos críticos identificados.', 'warning');
                        return;
                    }
                    
                    // Delegación estricta al Controlador Oficial
                    if (typeof window.setModoEstudio === 'function') {
                        window.setModoEstudio('montecarlo');
                        
                        // Sincronizar UI del selector
                        const radio = document.getElementById('check-modo-montecarlo');
                        if (radio) radio.checked = true;
                        const label = document.getElementById('label-modo-estudio');
                        if (label) label.innerText = 'Máx. Utilidad';
                    }
                    
                    if (typeof window.cerrarModalMonteCarlo === 'function') window.cerrarModalMonteCarlo();
                    if (typeof Toast !== 'undefined') Toast.show(`Aislados ${listaCritica.length} conceptos críticos.`, 'success');
                };

                if (typeof UI !== 'undefined' && UI.renderResultadosMonteCarlo) {
                    UI.renderResultadosMonteCarlo(resultadoBase, top5, inyectarMazoCritico);
                }
            }
        }

        procesarSiguienteTarjeta();

    }, 50);
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
        const bib = State.get('biblioteca');
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
        try {
            // ARCH: Lectura estricta del estado. Cero mutaciones.
            const planificador = State.get('planificador');

            if (typeof UI !== 'undefined' && UI.updateCalendarHeatmap) {
                // Delegación de renderizado a la capa de UI
                UI.updateCalendarHeatmap(
                    State.get('biblioteca'), 
                    State.get('nombreAsignaturaActual'), 
                    State.get('fechasClave'), 
                    window.calendarViewDate || new Date(),
                    planificador
                );
            }
        } catch (error) {
            Logger.error('[Telemetry] Fallo en updateCalendarHeatmap:', error);
        }
    }
    
    function updatePomoStats() {
    const pomoLogHoy = JSON.parse(localStorage.getItem('pomo_log_today') || '{"date":"","count":0,"details":{}}');
    const plan = State.get('planificador') || {};
    const todayStr = window.getFechaHoy();
    const planHoy = (plan.schedule || {})[todayStr] || [];
    const plannerTasks = planHoy.map(t => ({
        text: `[${t.asigNombre}] ${t.temaNombre}`,
        est: t.pomosAsignados || 0,
        completed: t.status === 'completed' ? t.pomosAsignados : 0,
        done: t.status === 'completed'
    }));
    const combinedTasks = [...(State.get('taskList') || []), ...plannerTasks];

    UI.updatePomoStats(
        State.get('horarioGlobal'), 
        State.get('nombreAsignaturaActual'), 
        combinedTasks, 
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
    const bib = State.get('biblioteca');

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
const OlvidoAnalytics = {
  async procesarCurvaOlvido() {
    const logs = await DB.getAll('fsrs_logs'); 
    
    const datosGrafica = logs.map(log => {
      const diasDesdeRepaso = (log.reviewTime - log.lastReviewTime) / 86400000;
      const tau = diasDesdeRepaso / log.stability; 
      
      return {
        tau: tau,
        yProb: Math.pow(0.9, tau),
        yReal: log.grade > 1 ? 1 : 0 
      };
    }).filter(d => !isNaN(d.tau) && isFinite(d.tau)); // Filtrar fallos de datos

    return this.agruparDatos(datosGrafica);
  },
  
  agruparDatos(datosRaw) {
    // Binning por intervalos de tau de 0.1
    const binned = {};
    datosRaw.forEach(d => {
      const bucket = (Math.round(d.tau * 10) / 10).toFixed(1);
      if(!binned[bucket]) {
        binned[bucket] = { sumReal: 0, count: 0, rTeorico: Math.pow(0.9, parseFloat(bucket)) };
      }
      binned[bucket].sumReal += d.yReal;
      binned[bucket].count += 1;
    });

    return Object.keys(binned).map(bucket => ({
      tau: parseFloat(bucket),
      retencionReal: binned[bucket].sumReal / binned[bucket].count,
      retencionTeorica: binned[bucket].rTeorico,
      n: binned[bucket].count // Tamaño muestral
    })).sort((a, b) => a.tau - b.tau);
  }
};
async function updateCurvaOlvidoWidget() {
    try {
        const data = await OlvidoAnalytics.procesarCurvaOlvido();
        // Exigir al menos n > 3 por cada bucket para evitar picos por varianza
        const datosValidos = data.filter(d => d.n > 3); 

        
        if (typeof UI !== 'undefined' && UI.updateCurvaOlvido) {
            UI.updateCurvaOlvido(datosValidos);
        }
    } catch (e) {
        Logger.error("Error orquestando Curva de Olvido:", e);
    }
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

        let pendientes = 0, dominadas = 0;

        tarjetas.forEach(c => {
            if (!c?.ProximoRepaso || Domain.fechaValor(c.ProximoRepaso) <= todayVal) pendientes++;

            if      (c.fsrs_state === 'review' && c.fsrs_stability > 21) dominadas++;
            else if (!c.fsrs_state && (c?.EtapaRepaso || 0) >= 5)        dominadas++;
        });
        
        // EXTRACCIÓN Y CÁLCULO DE DEUDA LOCAL
        const deudaLocal = (typeof Scheduler !== 'undefined' && typeof Scheduler.calcularDeudaArray === 'function') 
                           ? Scheduler.calcularDeudaArray(tarjetas) 
                           : 0;

        resumen.totalTarjetas += tarjetas.length;
        resumen.pendientesHoy += pendientes;
        resumen.dominadas     += dominadas;
        resumen.deudaTotal    += deudaLocal;
        
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
        updateMapaHoras, showResumenSesion, cerrarResumenSesion, updatePendingWindow, registrarExamen,
        updateProbabilidadAprobado, lanzarSimulacionMonteCarlo,
        getForgettingCurveData: () => OlvidoAnalytics.procesarCurvaOlvido(),
        cerrarModalMonteCarlo: () => document.getElementById('modal-montecarlo')?.classList.remove('visible'),
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
window.updateProbabilidadAprobado = () => Telemetry.updateProbabilidadAprobado();
window.lanzarSimulacionMonteCarlo = (config) => Telemetry.lanzarSimulacionMonteCarlo(config);



