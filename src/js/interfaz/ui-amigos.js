// ════════════════════════════════════════════════════════════════
// UI-AMIGOS.JS — Panel de amigos, stats, compartir y auth
// ════════════════════════════════════════════════════════════════

const UIAmigos = (() => {

    function renderCargandoAmigos() {
        const el = document.getElementById('amigos-contenido');
        if (el) el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0;">Cargando...</p>';
    }

    function renderErrorAmigos() {
        const el = document.getElementById('amigos-contenido');
        if (el) el.innerHTML = '<p style="color:var(--status-red);text-align:center;">Error al cargar. Verifica tu conexión.</p>';
    }

    function renderPanelAmigos({ solicitudes, amigos, compartidas }) {
        const el = document.getElementById('amigos-contenido');
        if (!el) return;

        const s = (str) => escapeHtml(String(str || ''));
        let html = '';

        if (compartidas.length > 0) {
            html += `<div style="margin-bottom:15px;padding:12px;background:rgba(76,175,80,0.08);border:1px solid var(--accent);border-radius:6px;">
                <div style="font-size:0.72em;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
                    <i class="fa-solid fa-truck-fast"></i> Asignaturas recibidas
                </div>`;
            compartidas.forEach(c => {
                html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
                    <div>
                        <span style="font-size:0.9em;color:var(--text-main);">${s(c.subjectName)}</span>
                        <span style="color:var(--text-subtle);font-size:0.78em;display:block;">de ${s(c.fromEmail)} · ${c.cardsCount} tarjetas</span>
                    </div>
                    <button data-action="importarAsignaturaCompartida" data-id="${s(c.id)}"
                        style="background:var(--accent);color:#000;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:0.8em;font-weight:bold;">
                        Importar
                    </button>
                </div>`;
            });
            html += '</div>';
        }

        if (solicitudes.length > 0) {
            html += `<div style="margin-bottom:15px;padding:12px;background:rgba(205,205,0,0.08);border:1px solid var(--status-yellow);border-radius:6px;">
                <div style="font-size:0.72em;color:var(--status-yellow);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
                    <i class="fa-solid fa-person-circle-plus"></i> Solicitudes de amistad
                </div>`;
            solicitudes.forEach(sol => {
                html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:0.9em;color:var(--text-main);">${s(sol.fromEmail)}</span>
                    <div>
                        <button data-action="aceptarSolicitud" data-id="${s(sol.id)}"
                            style="background:rgba(205,205,0,0.15);color:var(--status-yellow);border:1px solid var(--status-yellow);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.8em;">
                            Aceptar
                        </button>
                        <button data-action="rechazarSolicitud" data-id="${s(sol.id)}"
                            style="background:rgba(244,67,54,0.15);color:var(--status-red);border:1px solid var(--status-red);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.8em;margin-left:5px;">
                            Rechazar
                        </button>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        html += `<div style="margin-bottom:15px;">
            <div style="font-size:0.72em;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
                Tus amigos (${amigos.length})
            </div>`;
        if (amigos.length === 0) {
            html += '<p style="color:var(--text-subtle);font-size:0.85em;margin:0 0 8px;">Aún no tienes amigos añadidos.</p>';
        } else {
            amigos.forEach(a => {
                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:0.88em;color:var(--text-main);">${s(a.email)}</span>
                    <div style="display:flex;gap:6px;">
                        <button data-action="verStatsAmigo" data-uid="${s(a.uid)}" data-email="${s(a.email)}"
                            style="background:rgba(37,108,165,0.15);color:var(--status-blue);border:1px solid var(--status-blue);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78em;">
                            <i class="fa-solid fa-chart-pie"></i> Stats
                        </button>
                        <button data-action="abrirCompartirAsignatura" data-email="${s(a.email)}"
                            style="background:rgba(76,175,80,0.1);color:var(--accent);border:1px solid var(--accent);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78em;">
                            <i class="fa-solid fa-share-nodes"></i>
                        </button>
                        <button data-action="eliminarAmigo" data-id="${s(a.docId)}"
                            style="background:rgba(244,67,54,0.1);color:var(--status-red);border:1px solid var(--status-red);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78em;">
                            <i class="fa-solid fa-user-minus"></i>
                        </button>
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        html += `<div style="padding-top:15px;border-top:1px solid var(--border);">
            <div style="font-size:0.72em;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                Añadir amigo por email
            </div>
            <div style="display:flex;gap:8px;">
                <input type="email" id="input-nuevo-amigo" placeholder="correo@ejemplo.com"
                    style="flex:1;padding:8px 10px;background:var(--bg-color);border:1px solid var(--border-light);color:var(--text-main);border-radius:4px;outline:none;font-size:0.88em;">
                <button data-action="enviarSolicitudAmistad"
                    style="background:rgba(76,175,80,0.15);color:var(--accent);border:1px solid var(--accent);padding:8px 14px;border-radius:4px;cursor:pointer;font-size:0.85em;white-space:nowrap;">
                    Enviar
                </button>
            </div>
        </div>`;

        el.innerHTML = html;
    }

    function renderCargandoStatsAmigo(email) {
        const el = document.getElementById('amigos-contenido');
        if (el) el.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px 0;">Analizando telemetría de ${escapeHtml(email || '')}...</p>`;
    }

    function renderErrorStatsAmigo() {
        const el = document.getElementById('amigos-contenido');
        if (el) el.innerHTML = `
            <button data-action="cargarPanelAmigos" style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-bottom:10px;font-size:0.85em;">
                <i class="fa-solid fa-arrow-left"></i> Volver
            </button>
            <p style="color:var(--status-red);">No se encontraron estadísticas o fallo de conexión.</p>`;
    }

    function renderStatsAmigo({ email, stats }) {
        const el = document.getElementById('amigos-contenido');
        if (!el) return;

        const s = (v) => escapeHtml(String(v ?? ''));
        let html = `<button data-action="cargarPanelAmigos"
            style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-bottom:15px;font-size:0.85em;">
            <i class="fa-solid fa-arrow-left"></i> Volver
        </button>
        <div style="font-size:0.95em;color:var(--accent);margin-bottom:14px;font-weight:bold;">
            <i class="fa-solid fa-user"></i> ${s(email)}
        </div>`;

        if (stats.isPrivate) {
            html += `<div style="text-align:center;padding:20px 0;">
                <i class="fa-solid fa-user-ninja" style="font-size:3em;color:var(--text-subtle);margin-bottom:15px;display:block;"></i>
                <p style="color:var(--text-muted);font-size:0.9em;">Este usuario ha activado el Modo Fantasma.</p>
            </div>`;
            el.innerHTML = html;
            return;
        }

        const deudaColor = (stats.deudaTotal || 0) === 0 ? 'var(--status-green)' : 'var(--status-red)';
        html += `<div style="display:flex;gap:10px;margin-bottom:20px;">
            <div style="flex:1;background:var(--surface-1);padding:12px 5px;border-radius:8px;text-align:center;border:1px solid var(--border);">
                <div style="font-size:1.4em;color:#FFC107;font-weight:bold;"><i class="fa-solid fa-fire"></i> ${s(stats.racha || 0)}</div>
                <div style="font-size:0.65em;color:var(--text-muted);text-transform:uppercase;margin-top:4px;">Días Racha</div>
            </div>
            <div style="flex:1;background:var(--surface-1);padding:12px 5px;border-radius:8px;text-align:center;border:1px solid var(--border);">
                <div style="font-size:1.4em;color:var(--pomo-work);font-weight:bold;"><i class="fa-solid fa-stopwatch"></i> ${s(stats.pomosHoy || 0)}</div>
                <div style="font-size:0.65em;color:var(--text-muted);text-transform:uppercase;margin-top:4px;">Pomos Hoy</div>
            </div>
            <div style="flex:1;background:var(--surface-1);padding:12px 5px;border-radius:8px;text-align:center;border:1px solid var(--border);">
                <div style="font-size:1.4em;color:${deudaColor};font-weight:bold;"><i class="fa-solid fa-chart-line"></i> ${s(stats.deudaTotal || 0)}</div>
                <div style="font-size:0.65em;color:var(--text-muted);text-transform:uppercase;margin-top:4px;">Deuda FSRS</div>
            </div>
        </div>`;

        const asigs = Array.isArray(stats.asignaturas) ? stats.asignaturas : [];
        if (asigs.length === 0) {
            html += '<p style="color:var(--text-subtle);font-size:0.85em;text-align:center;">Sin asignaturas creadas.</p>';
        } else {
            asigs.forEach(item => {
                html += `<div style="padding:10px 12px;background:var(--menu-color);border-radius:6px;margin-bottom:8px;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
                        <span style="font-size:0.9em;color:var(--text-main);font-weight:bold;">${s(item.nombre)}</span>
                        <span style="font-size:0.75em;color:var(--text-muted);"><i class="fa-solid fa-layer-group"></i> ${Number(item.totalTarjetas || 0)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.75em;border-top:1px dashed var(--border);padding-top:6px;">
                        <span style="color:var(--status-red);"><i class="fa-solid fa-triangle-exclamation"></i> ${Number(item.pendientesHoy || 0)} atrasadas</span>
                        <span style="color:var(--status-blue);"><i class="fa-solid fa-weight-hanging"></i> ${Number(item.deuda || 0)} deuda</span>
                        <span style="color:var(--status-green);"><i class="fa-solid fa-brain"></i> ${Number(item.dominadas || 0)} dom.</span>
                    </div>
                </div>`;
            });
        }
        el.innerHTML = html;
    }

    function renderCompartirAsignatura(friendEmail, asignaturas) {
        const el = document.getElementById('amigos-contenido');
        if (!el) return;

        const s = (v) => escapeHtml(String(v || ''));
        let html = `<button data-action="cargarPanelAmigos"
            style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-bottom:12px;font-size:0.85em;">
            <i class="fa-solid fa-arrow-left"></i> Volver
        </button>
        <div style="font-size:0.9em;color:var(--text-main);margin-bottom:4px;">
            Compartir con <b style="color:var(--accent);">${s(friendEmail)}</b>
        </div>
        <div style="font-size:0.72em;color:var(--text-subtle);margin-bottom:14px;">Los datos de repaso no se incluyen.</div>`;

        if (asignaturas.length === 0) {
            html += '<p style="color:var(--text-subtle);font-size:0.85em;">No tienes asignaturas para compartir.</p>';
        } else {
            asignaturas.forEach(({ nombre, count }) => {
                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;">
                    <span style="font-size:0.88em;color:var(--text-main);">
                        ${s(nombre)} <span style="color:var(--text-subtle);font-size:0.82em;">(${count})</span>
                    </span>
                    <button data-action="compartirAsignatura" data-email="${s(friendEmail)}" data-asig="${s(nombre)}"
                        style="background:rgba(76,175,80,0.12);color:var(--accent);border:1px solid var(--accent);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.8em;white-space:nowrap;">
                        <i class="fa-regular fa-paper-plane"></i> Enviar
                    </button>
                </div>`;
            });
        }
        el.innerHTML = html;
    }

    function renderAuthEstado(user) {
        const statusDiv    = document.getElementById('auth-status');
        const loginForm    = document.getElementById('auth-login-form');
        const loggedInForm = document.getElementById('auth-logged-in');

        if (user) {
            if (statusDiv) statusDiv.innerHTML = `Estado: <span style="color:var(--accent);">Conectado (${escapeHtml(user.email)})</span>`;
            loginForm?.classList.add('hidden');
            loggedInForm?.classList.remove('hidden');
        } else {
            if (statusDiv) statusDiv.innerText = 'Estado: Desconectado (Modo Offline)';
            loginForm?.classList.remove('hidden');
            loggedInForm?.classList.add('hidden');
        }
    }

    return {
        renderCargandoAmigos,
        renderErrorAmigos,
        renderPanelAmigos,
        renderCargandoStatsAmigo,
        renderErrorStatsAmigo,
        renderStatsAmigo,
        renderCompartirAsignatura,
        renderAuthEstado,
    };
})();
