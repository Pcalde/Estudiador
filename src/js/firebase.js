// ════════════════════════════════════════════════════════════════
// FIREBASE.JS — Capa de red: autenticación, persistencia en nube y funciones sociales
//
// CAMBIOS v2 (auditoría):
//   - cargarDatosUsuario: mutaciones via State.set() + EventBus en lugar de globales directos
//   - guardarDatosUsuario: lecturas via State.get()
//   - normalizarBibliotecaFechas / normalizarFechasClave: se pasan argumentos
//   - sincronizarTelemetriaFSRS: reescrita con API compat v8
//   - onAuthStateChanged: registrado ANTES de setPersistence (no dentro del .then)
//   - setInterval de auto-save: arranca solo tras login, se cancela en cerrarSesion
//   - syncTimeout: privado (_syncTimeout), fuera de window
//   - construirResumenPublicoUsuario: lee de State.get() en lugar del DOM
//   - importarAsignaturaCompartida: sustituye guardarEnLocal por EventBus
//   - aceptarSolicitud: firma corregida (solo docId)
// ════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG_EMBEBIDA = {
    apiKey: "AIzaSyBZJar5Z82Fb8lvPaYc2BOMpjGMF2PM0jY",
    authDomain: "estudiador-pro.firebaseapp.com",
    projectId: "estudiador-pro",
    storageBucket: "estudiador-pro.firebasestorage.app",
    messagingSenderId: "465558266905",
    appId: "1:465558266905:web:f2a409f91df1ff55ab3688"
};

const INTERVALO_AUTOSAVE_MS = 15 * 60 * 1000; // 15 minutos

// ── Variables privadas al módulo ──────────────────────────────
let _syncTimeout   = null;
let _autoSaveInterval = null;

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

function inicializarFirebase(configStr) {
    try {
        const firebaseConfig = JSON.parse(configStr);
        if (typeof firebase === 'undefined') return;

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // FIX: asignamos via State para que los módulos que usen State.get() los vean
        State.set('db',   firebase.firestore());
        State.set('auth', firebase.auth());

        // FIX: registrar onAuthStateChanged ANTES de setPersistence
        // así funciona aunque setPersistence falle (Safari modo privado, etc.)
        State.get('auth').onAuthStateChanged(_manejarCambioAuth);

        State.get('auth')
            .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => Logger.warn('setPersistence falló (modo privado?):', err));

    } catch (e) {
        Logger.error('Error al inicializar Firebase:', e);
    }
}

window.addEventListener('load', () => {
    const savedConfig = localStorage.getItem('firebase_config');
    inicializarFirebase(savedConfig || JSON.stringify(FIREBASE_CONFIG_EMBEBIDA));
});

// ─────────────────────────────────────────────────────────────
// MANEJADOR DE ESTADO DE AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────

function _manejarCambioAuth(user) {
    const statusDiv    = document.getElementById('auth-status');
    const loginForm    = document.getElementById('auth-login-form');
    const loggedInForm = document.getElementById('auth-logged-in');

    if (user) {
        const esNuevoLogin = !State.get('currentUser');
        State.set('currentUser', user);

        const db = State.get('db');
        if (db) db.collection('emailIndex').doc(user.email).set({ uid: user.uid }).catch(() => {});

        if (statusDiv) statusDiv.innerHTML = `Estado: <span style="color:var(--accent);">Conectado (${user.email})</span>`;
        if (loginForm)    loginForm.classList.add('hidden');
        if (loggedInForm) loggedInForm.classList.remove('hidden');

        // Auto-save periódico: arrancar solo tras login
        if (_autoSaveInterval) clearInterval(_autoSaveInterval);
        _autoSaveInterval = setInterval(() => {
            Logger.info("Ejecutando Auto-Save de seguridad en la nube...");
            sincronizar();
        }, INTERVALO_AUTOSAVE_MS);

        if (esNuevoLogin) comprobarNubeAlIniciar();

    } else {
        State.set('currentUser', null);

        // Detener auto-save al cerrar sesión
        if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }

        if (statusDiv)    statusDiv.innerText = "Estado: Desconectado (Modo Offline)";
        if (loginForm)    loginForm.classList.remove('hidden');
        if (loggedInForm) loggedInForm.classList.add('hidden');
    }
}

// ─────────────────────────────────────────────────────────────
// COMPROBACIÓN INICIAL DE NUBE
// ─────────────────────────────────────────────────────────────

async function comprobarNubeAlIniciar() {
    const currentUser = State.get('currentUser');
    const db = State.get('db');
    if (!currentUser || !db) return;

    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            if (confirm('Se ha detectado una copia de seguridad en la nube. ¿Deseas sobreescribir tus datos locales con la versión de la nube?')) {
                await cargarDatosUsuario();
            }
        }
    } catch (error) {
        Logger.error("Error al comprobar la nube:", error);
    }
}

// ─────────────────────────────────────────────────────────────
// RESUMEN PÚBLICO (lee de State, no del DOM)
// ─────────────────────────────────────────────────────────────

function construirResumenPublicoUsuario() {
    const isPrivate = localStorage.getItem('estudiador_privacy_stats') === 'true';
    if (isPrivate) return { isPrivate: true };

    const todayLog  = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0}');
    const biblioteca = State.get('biblioteca') || {};

    // FIX: racha leída del estado de telemetría (element stat-streak puede no existir)
    // Se calcula directamente en lugar de leer del DOM.
    const todayVal = window.fechaValor(window.getFechaHoy());

    const resumen = {
        isPrivate: false,
        totalTarjetas: 0,
        pendientesHoy: 0,
        dominadas: 0,
        deudaTotal: 0,
        racha: _calcularRachaDesdeEstado(biblioteca),
        pomosHoy: todayLog.count || 0,
        asignaturas: []
    };

    Object.keys(biblioteca).forEach(asig => {
        const tarjetas = Array.isArray(biblioteca[asig]) ? biblioteca[asig] : [];
        if (!tarjetas.length) return;

        let pendientes = 0, dominadas = 0, deudaLocal = 0;

        tarjetas.forEach(c => {
            if (!c?.ProximoRepaso || window.fechaValor(c.ProximoRepaso) <= todayVal) pendientes++;

            if (c.fsrs_state === 'review' && c.fsrs_stability > 21) dominadas++;
            else if (!c.fsrs_state && (c?.EtapaRepaso || 0) >= 5) dominadas++;

            if (c.ProximoRepaso && window.fechaValor(c.ProximoRepaso) <= todayVal) {
                const isNew = c.fsrs_state === 'new' || (!c.fsrs_state && !c.UltimoRepaso);
                if (isNew) {
                    deudaLocal += 1.0;
                } else if (c.fsrs_state === 'learning') {
                    deudaLocal += 4.0;
                } else {
                    const elapsed = c.UltimoRepaso
                        ? Math.max(0, window.diffDiasCalendario(c.UltimoRepaso, window.getFechaHoy()))
                        : 0;
                    const R = Math.pow(0.9, elapsed / (c.fsrs_stability || 1));
                    deudaLocal += Math.max(0.5, (1 - R) * (c.fsrs_difficulty || 5));
                }
            }
        });

        resumen.totalTarjetas += tarjetas.length;
        resumen.pendientesHoy += pendientes;
        resumen.dominadas     += dominadas;
        resumen.deudaTotal    += deudaLocal;
        resumen.asignaturas.push({
            nombre: asig,
            totalTarjetas: tarjetas.length,
            pendientesHoy: pendientes,
            dominadas,
            deuda: Math.round(deudaLocal * 10) / 10
        });
    });

    resumen.deudaTotal = Math.round(resumen.deudaTotal * 10) / 10;
    return resumen;
}

/** Calcula la racha desde el estado en lugar del DOM. */
function _calcularRachaDesdeEstado(biblioteca) {
    const todayStr = window.getFechaHoy();
    const todayVal = window.fechaValor(todayStr);
    let doneMap = {};

    Object.values(biblioteca || {}).forEach(tarjetas => {
        (tarjetas || []).forEach(c => {
            if (c.UltimoRepaso) doneMap[window.toISODateString(c.UltimoRepaso)] = true;
        });
    });

    // Contar días consecutivos hacia atrás desde ayer
    let streak = doneMap[todayStr] ? 1 : 0;
    let check  = new Date();
    check.setDate(check.getDate() - 1);
    for (let i = 0; i < 365; i++) {
        const d = window.formatearFecha(check);
        if (!doneMap[d]) break;
        streak++;
        check.setDate(check.getDate() - 1);
    }
    return streak;
}

// ─────────────────────────────────────────────────────────────
// SUBIDA DE DATOS
// ─────────────────────────────────────────────────────────────

async function guardarDatosUsuario() {
    const currentUser = State.get('currentUser');
    const db          = State.get('db');
    if (!currentUser || !db) return;

    // FIX: todas las lecturas via State.get()
    const data = {
        biblioteca:   State.get('biblioteca')   || {},
        projects:     State.get('projects')     || [],
        fechasClave:  State.get('fechasClave')  || [],
        horarioGlobal: State.get('horarioGlobal') || {},
        userColors:   State.get('userColors')   || {},
        pomoSettings: State.get('pomoSettings') || {},
        taskList:     State.get('taskList')     || [],
        lastUpdated:  firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
        await db.collection('usersPublic').doc(currentUser.uid).set({
            email: currentUser.email,
            stats: construirResumenPublicoUsuario(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        Logger.info('Datos guardados en Firebase');
    } catch (error) {
        Logger.error('Error al guardar en Firebase:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────
// BAJADA DE DATOS
// ─────────────────────────────────────────────────────────────

async function cargarDatosUsuario() {
    const currentUser = State.get('currentUser');
    const db          = State.get('db');
    if (!currentUser || !db) return;

    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();

        if (doc.exists) {
            const data = doc.data();

            // FIX: mutaciones a través de State.set() en un batch atómico
            State.batch(() => {
                const biblio = data.biblioteca || {};
                // FIX: normalizar con argumentos correctos
                window.normalizarBibliotecaFechas(biblio);
                State.set('biblioteca', biblio);

                State.set('projects',      data.projects      || []);
                State.set('horarioGlobal', data.horarioGlobal || {});
                State.set('userColors',    data.userColors    || {});
                State.set('pomoSettings',  data.pomoSettings  || State.get('pomoSettings'));
                State.set('taskList',      data.taskList      || []);

                const fechasSaneadas = window.normalizarFechasClave(data.fechasClave || []);
                State.set('fechasClave', fechasSaneadas);
            });

            // FIX: persistencia local via EventBus, no guardarEnLocal()
            EventBus.emit('DATA_REQUIRES_SAVE');

            // Actualizar la interfaz
            if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
            if (typeof updateDashboard       === 'function') updateDashboard();
            const asigActual = State.get('nombreAsignaturaActual');
            if (asigActual && typeof cargarAsignatura === 'function') cargarAsignatura(asigActual);

            Logger.info('Datos cargados desde Firebase y volcados al estado local.');
        } else {
            // Primera vez: subir lo que hay localmente
            await guardarDatosUsuario();
        }
    } catch (error) {
        Logger.error('Error al cargar desde Firebase:', error);
    }
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZACIÓN
// ─────────────────────────────────────────────────────────────

// FIX: _syncTimeout es privado, no contamina window
function sincronizar() {
    if (!State.get('currentUser')) return;
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(() => {
        guardarDatosUsuario().catch(e => Logger.error("Fallo sincro silenciosa:", e));
    }, 1500);
}
window.sincronizar = sincronizar;

async function forzarRespaldoNube() {
    if (!State.get('currentUser')) {
        alert("Debes iniciar sesión para respaldar en la nube.");
        return;
    }
    const btn = document.getElementById('btn-sync-nube');
    if (btn) btn.innerText = "Subiendo...";
    try {
        await guardarDatosUsuario();
        alert("Copia de seguridad guardada en Firebase correctamente.");
    } catch (error) {
        Logger.error("Fallo al subir a la nube:", error);
        alert("Error al guardar en la nube. Revisa tu conexión.");
    } finally {
        if (btn) btn.innerText = "Guardar en Nube";
    }
}

function forzarBajada() {
    if (State.get('currentUser') && confirm("¿Recargar desde la nube? Se perderán los cambios locales no guardados.")) {
        cargarDatosUsuario();
    }
}

// ─────────────────────────────────────────────────────────────
// TELEMETRÍA FSRS — Batch Firestore (API compat v8)
// ─────────────────────────────────────────────────────────────

async function sincronizarTelemetriaFSRS() {
    const db          = State.get('db');
    const currentUser = State.get('currentUser');
    if (!db || !currentUser || typeof DB === 'undefined') return;

    try {
        const pendientes = await DB.getUnsyncedRevlogs();
        if (!pendientes || pendientes.length === 0) return;

        // Firestore limita 500 ops por batch
        const limite = pendientes.slice(0, 450);

        // FIX: API compat v8 (db.batch(), db.collection().doc())
        const batch    = db.batch();
        const basePath = `users/${currentUser.uid}/fsrs_revlogs`;

        limite.forEach(log => {
            const { id, synced, ...cleanLog } = log;
            batch.set(
                db.collection(basePath).doc(),
                { ...cleanLog, syncedAt: Date.now() }
            );
        });

        await batch.commit();
        Logger.info(`Telemetría FSRS: Batch subido con ${limite.length} registros.`);

        await DB.markRevlogsAsSynced(limite.map(l => l.id));
    } catch (error) {
        Logger.error("Fallo crítico en sincronizarTelemetriaFSRS:", error);
    }
}

// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────

async function asegurarFirebaseInit() {
    if (State.get('auth')) return true;
    const configStr = document.getElementById('set-firebase-config')?.value.trim()
                   || localStorage.getItem('firebase_config');
    if (!configStr) {
        alert("Firebase no está configurado.\n\nVe a Ajustes → Cuenta → pega el objeto de configuración y guarda.");
        return false;
    }
    inicializarFirebase(configStr);
    for (let i = 0; i < 30; i++) {
        if (State.get('auth')) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    alert("No se pudo inicializar Firebase. Comprueba la configuración.");
    return false;
}

async function procesarLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const btn   = document.getElementById('btn-login');
    if (!email || !pass) { alert("Rellena el correo y la contraseña."); return; }
    if (!await asegurarFirebaseInit()) return;
    btn.innerText = "Conectando...";
    try {
        await State.get('auth').signInWithEmailAndPassword(email, pass);
    } catch (error) {
        Logger.error("Error en login:", error);
        alert("Error de acceso. Verifica tu correo y contraseña.");
    } finally {
        btn.innerText = "Acceder";
    }
}

async function procesarRegistro() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const btn   = document.getElementById('btn-register');
    if (!email || pass.length < 6) return alert("Email válido y contraseña de mín. 6 caracteres.");
    if (!await asegurarFirebaseInit()) return;
    btn.innerText = "Creando...";
    try {
        const cred = await State.get('auth').createUserWithEmailAndPassword(email, pass);
        const db   = State.get('db');
        const ts   = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(cred.user.uid).set({
            biblioteca: {}, projects: [], fechasClave: [], horarioGlobal: {},
            userColors: {}, pomoSettings: State.get('pomoSettings') || {},
            taskList: [], createdAt: ts
        });
        await db.collection('usersPublic').doc(cred.user.uid).set({
            email, stats: { totalTarjetas: 0, pendientesHoy: 0, dominadas: 0, asignaturas: [] },
            lastUpdated: ts
        });
        alert("Cuenta creada. Realizando primera subida local...");
        await guardarDatosUsuario();
    } catch (error) {
        Logger.error("Error registro:", error);
        alert("Fallo de registro: " + error.message);
        btn.innerText = "Crear Cuenta Nueva";
    }
}

async function procesarLoginGoogle() {
    if (!await asegurarFirebaseInit()) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    const btn = document.getElementById('btn-login-google');
    if (btn) btn.innerText = "Conectando...";
    try {
        const result = await State.get('auth').signInWithPopup(provider);
        const user   = result.user;
        const db     = State.get('db');
        const ts     = firebase.firestore.FieldValue.serverTimestamp();

        // FIX: additionalUserInfo.isNewUser es frágil en v9+; usamos get() como comprobación robusta
        const existing = await db.collection('users').doc(user.uid).get();
        if (!existing.exists) {
            Logger.info("Nuevo usuario Google. Inicializando base de datos...");
            await db.collection('users').doc(user.uid).set({
                biblioteca: {}, projects: [], fechasClave: [], horarioGlobal: {},
                userColors: {}, pomoSettings: State.get('pomoSettings') || {},
                taskList: [], createdAt: ts
            });
            await db.collection('usersPublic').doc(user.uid).set({
                email: user.email,
                stats: { totalTarjetas: 0, pendientesHoy: 0, dominadas: 0, asignaturas: [] },
                lastUpdated: ts
            });
            await db.collection('emailIndex').doc(user.email).set({ uid: user.uid });
            alert("Cuenta creada con Google. Realizando primera subida local...");
            await guardarDatosUsuario();
        }
    } catch (error) {
        Logger.error("Error en Google Auth:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("Error de acceso con Google: " + error.message);
        }
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-brands fa-google"></i> Acceder con Google';
    }
}

function cerrarSesion() {
    if (!confirm("¿Seguro que deseas cerrar sesión? Dejarás de sincronizar con la nube.")) return;
    // Detener auto-save antes de cerrar
    if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }
    State.get('auth').signOut().then(() => {
        State.set('currentUser', null);
        location.reload();
    });
}

// ─────────────────────────────────────────────────────────────
// SISTEMA DE AMIGOS Y COMPARTIR
// ─────────────────────────────────────────────────────────────

function abrirModalAmigos() {
    if (!State.get('currentUser')) return alert('Debes iniciar sesión para usar esta función.');
    document.getElementById('modal-amigos').classList.remove('hidden');
    cargarPanelAmigos();
}

function cerrarModalAmigos() {
    document.getElementById('modal-amigos').classList.add('hidden');
}

async function cargarPanelAmigos() {
    const contenido   = document.getElementById('amigos-contenido');
    const currentUser = State.get('currentUser');
    const db          = State.get('db');
    contenido.innerHTML = '<p style="color:#888; text-align:center; padding:20px 0;">Cargando...</p>';

    try {
        const [solicitudesSnap, enviadas, recibidas, compartidasSnap] = await Promise.all([
            db.collection('friendRequests').where('toUid',   '==', currentUser.uid).where('status', '==', 'pending').get(),
            db.collection('friendRequests').where('fromUid', '==', currentUser.uid).where('status', '==', 'accepted').get(),
            db.collection('friendRequests').where('toUid',   '==', currentUser.uid).where('status', '==', 'accepted').get(),
            db.collection('sharedSubjects').where('toEmail', '==', currentUser.email).where('seen', '==', false).get(),
        ]);

        const amigos = [];
        enviadas.forEach(doc  => { const d = doc.data(); amigos.push({ docId: doc.id, uid: d.toUid,   email: d.toEmail   }); });
        recibidas.forEach(doc => { const d = doc.data(); amigos.push({ docId: doc.id, uid: d.fromUid, email: d.fromEmail }); });

        let html = '';

        // Asignaturas recibidas
        if (!compartidasSnap.empty) {
            html += '<div style="margin-bottom:15px; padding:12px; background:rgba(76,175,80,0.08); border:1px solid var(--accent); border-radius:6px;">';
            html += '<div style="font-size:0.72em; color:var(--accent); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;"><i class="fa-solid fa-truck-fast"></i> Asignaturas recibidas</div>';
            compartidasSnap.forEach(doc => {
                const d = doc.data();
                html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
                    <div><span style="font-size:0.9em; color:white;">${escapeHtml(d.subjectName || '')}</span>
                    <span style="color:#666; font-size:0.78em; display:block;">de ${escapeHtml(d.fromEmail || '')} · ${d.cards.length} tarjetas</span></div>
                    <button data-action="importarAsignaturaCompartida" data-id="${doc.id}" style="background:var(--accent); color:#000; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:0.8em; font-weight:bold;">Importar</button>
                </div>`;
            });
            html += '</div>';
        }

        // Solicitudes pendientes
        if (!solicitudesSnap.empty) {
            html += '<div style="margin-bottom:15px; padding:12px; background:rgba(205,205,0,0.08); border:1px solid #cdcd00; border-radius:6px;">';
            html += '<div style="font-size:0.72em; color:#cdcd00; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;"><i class="fa-solid fa-person-circle-plus"></i> Solicitudes de amistad</div>';
            solicitudesSnap.forEach(doc => {
                const d = doc.data();
                html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.9em; color:#ddd;">${escapeHtml(d.fromEmail)}</span>
                    <div>
                        <button data-action="aceptarSolicitud" data-id="${doc.id}" style="background:rgba(205,205,0,0.15); color:#cdcd00; border:1px solid #cdcd00; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.8em;">Aceptar</button>
                        <button data-action="rechazarSolicitud" data-id="${doc.id}" style="background:rgba(244,67,54,0.15); color:#f44336; border:1px solid #f44336; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-left:5px;">Rechazar</button>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        // Lista de amigos
        html += `<div style="margin-bottom:15px;"><div style="font-size:0.72em; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Tus amigos (${amigos.length})</div>`;
        if (amigos.length === 0) {
            html += '<p style="color:#555; font-size:0.85em; margin:0 0 8px;">Aún no tienes amigos añadidos.</p>';
        } else {
            amigos.forEach(a => {
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #252525;">
                    <span style="font-size:0.88em; color:#ccc;">${escapeHtml(a.email)}</span>
                    <div style="display:flex; gap:6px;">
                        <button data-action="verStatsAmigo" data-uid="${a.uid}" data-email="${escapeHtml(a.email)}" style="background:rgba(37,108,165,0.15); color:#4da6e8; border:1px solid #256ca5; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.78em;"><i class="fa-solid fa-chart-pie"></i> Stats</button>
                        <button data-action="abrirCompartirAsignatura" data-email="${escapeHtml(a.email)}" style="background:rgba(76,175,80,0.1); color:var(--accent); border:1px solid var(--accent); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.78em;"><i class="fa-solid fa-share-nodes"></i></button>
                        <button data-action="eliminarAmigo" data-id="${a.docId}" style="background:rgba(244,67,54,0.1); color:#f44336; border:1px solid #f44336; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.78em;" title="Eliminar amigo"><i class="fa-solid fa-user-minus"></i></button>
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        // Añadir amigo
        html += `<div style="padding-top:15px; border-top:1px solid #2a2a2a;">
            <div style="font-size:0.72em; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Añadir amigo por email</div>
            <div style="display:flex; gap:8px;">
                <input type="email" id="input-nuevo-amigo" placeholder="correo@ejemplo.com" style="flex:1; padding:8px 10px; background:#1a1a1a; border:1px solid #444; color:#eee; border-radius:4px; outline:none; font-size:0.88em;">
                <button data-action="enviarSolicitudAmistad" style="background:rgba(76,175,80,0.15); color:var(--accent); border:1px solid var(--accent); padding:8px 14px; border-radius:4px; cursor:pointer; font-size:0.85em; white-space:nowrap;">Enviar</button>
            </div>
        </div>`;

        contenido.innerHTML = html;
    } catch(e) {
        Logger.error('Error cargarPanelAmigos:', e);
        contenido.innerHTML = '<p style="color:#ff5252; text-align:center;">Error al cargar. Verifica tu conexión.</p>';
    }
}

async function enviarSolicitudAmistad() {
    const currentUser = State.get('currentUser');
    const db          = State.get('db');
    const email = (document.getElementById('input-nuevo-amigo').value || '').trim().toLowerCase();
    if (!email) return alert('Escribe un email.');
    if (email === currentUser.email) return alert('No puedes añadirte a ti mismo.');

    const indexDoc = await db.collection('emailIndex').doc(email).get();
    if (!indexDoc.exists) return alert(`No se encontró ningún usuario con el correo "${email}".`);

    const toUid = indexDoc.data().uid;
    const existing = await db.collection('friendRequests')
        .where('fromUid', '==', currentUser.uid)
        .where('toUid',   '==', toUid)
        .get();
    if (!existing.empty) return alert('Ya has enviado una solicitud o ya sois amigos.');

    await db.collection('friendRequests').add({
        fromUid:   currentUser.uid,
        fromEmail: currentUser.email,
        toEmail:   email,
        toUid,
        status:    'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('¡Solicitud enviada a ' + email + '!');
    document.getElementById('input-nuevo-amigo').value = '';
}

// FIX: firma corregida — solo docId (el parámetro email que llegaba del HTML no se usaba)
async function aceptarSolicitud(docId) {
    try {
        await State.get('db').collection('friendRequests').doc(docId).update({ status: 'accepted' });
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('Error aceptarSolicitud:', e);
        alert('Error al aceptar la solicitud.');
    }
}

async function rechazarSolicitud(docId) {
    if (!confirm("¿Rechazar esta solicitud de amistad?")) return;
    try {
        await State.get('db').collection('friendRequests').doc(docId).delete();
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('Error rechazarSolicitud:', e);
        alert('Error al rechazar.');
    }
}

async function eliminarAmigo(docId) {
    if (!confirm("¿Eliminar a este usuario?")) return;
    try {
        await State.get('db').collection('friendRequests').doc(docId).delete();
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('Error eliminarAmigo:', e);
        alert('Error al eliminar amigo.');
    }
}

async function verStatsAmigo(uid, email) {
    if (!uid || uid === 'undefined') {
        alert('Este usuario fue añadido con una versión antigua. Elimínalo y vuélvelo a añadir.');
        return;
    }
    const contenido  = document.getElementById('amigos-contenido');
    const safeEmail  = escapeHtml(email || '');
    contenido.innerHTML = `<p style="color:#888; text-align:center; padding:20px 0;">Analizando telemetría de ${safeEmail}...</p>`;

    try {
        const doc = await State.get('db').collection('usersPublic').doc(uid).get();
        if (!doc.exists) {
            contenido.innerHTML = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:10px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button><p style="color:#ff5252;">No se encontraron estadísticas.</p>';
            return;
        }

        const stats = (doc.data() || {}).stats || {};
        let html = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:15px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button>';
        html += `<div style="font-size:0.95em; color:var(--accent); margin-bottom:14px; font-weight:bold;"><i class="fa-solid fa-user"></i> ${safeEmail}</div>`;

        if (stats.isPrivate) {
            html += `<div style="text-align:center; padding:20px 0;">
                <i class="fa-solid fa-user-ninja" style="font-size:3em; color:#444; margin-bottom:15px; display:block;"></i>
                <p style="color:#888; font-size:0.9em;">Este usuario ha activado el Modo Fantasma.</p>
            </div>`;
            contenido.innerHTML = html;
            return;
        }

        html += `<div style="display:flex; gap:10px; margin-bottom:20px;">
            <div style="flex:1; background:#1a1a1a; padding:12px 5px; border-radius:8px; text-align:center; border:1px solid #333;">
                <div style="font-size:1.4em; color:#FFC107; font-weight:bold;"><i class="fa-solid fa-fire"></i> ${stats.racha || 0}</div>
                <div style="font-size:0.65em; color:#888; text-transform:uppercase; margin-top:4px;">Días Racha</div>
            </div>
            <div style="flex:1; background:#1a1a1a; padding:12px 5px; border-radius:8px; text-align:center; border:1px solid #333;">
                <div style="font-size:1.4em; color:#d95550; font-weight:bold;"><i class="fa-solid fa-stopwatch"></i> ${stats.pomosHoy || 0}</div>
                <div style="font-size:0.65em; color:#888; text-transform:uppercase; margin-top:4px;">Pomos Hoy</div>
            </div>
            <div style="flex:1; background:#1a1a1a; padding:12px 5px; border-radius:8px; text-align:center; border:1px solid #333;">
                <div style="font-size:1.4em; color:${(stats.deudaTotal || 0) === 0 ? '#4CAF50' : '#f44336'}; font-weight:bold;"><i class="fa-solid fa-chart-line"></i> ${stats.deudaTotal || 0}</div>
                <div style="font-size:0.65em; color:#888; text-transform:uppercase; margin-top:4px;">Deuda FSRS</div>
            </div>
        </div>`;

        const asignaturas = Array.isArray(stats.asignaturas) ? stats.asignaturas : [];
        if (asignaturas.length === 0) {
            html += '<p style="color:#555; font-size:0.85em; text-align:center;">Sin asignaturas creadas.</p>';
        } else {
            asignaturas.forEach(item => {
                const nombre = escapeHtml(item.nombre || 'Sin nombre');
                html += `<div style="padding:10px 12px; background:#151515; border-radius:6px; margin-bottom:8px; border:1px solid #222;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                        <span style="font-size:0.9em; color:#ddd; font-weight:bold;">${nombre}</span>
                        <span style="font-size:0.75em; color:#888;"><i class="fa-solid fa-layer-group"></i> ${Number(item.totalTarjetas || 0)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75em; border-top:1px dashed #2a2a2a; padding-top:6px;">
                        <span style="color:#f44336;"><i class="fa-solid fa-triangle-exclamation"></i> ${Number(item.pendientesHoy || 0)} atrasadas</span>
                        <span style="color:#256ca5;"><i class="fa-solid fa-weight-hanging"></i> ${Number(item.deuda || 0)} deuda</span>
                        <span style="color:#4CAF50;"><i class="fa-solid fa-brain"></i> ${Number(item.dominadas || 0)} dom.</span>
                    </div>
                </div>`;
            });
        }
        contenido.innerHTML = html;
    } catch(e) {
        Logger.error('verStatsAmigo error:', e);
        contenido.innerHTML = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:10px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button><p style="color:#ff5252;">Fallo de conexión o permisos.</p>';
    }
}

async function abrirCompartirAsignatura(friendEmail) {
    const contenido  = document.getElementById('amigos-contenido');
    const biblioteca = State.get('biblioteca') || {};
    const asigs      = Object.keys(biblioteca);

    let html = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:12px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button>';
    html += `<div style="font-size:0.9em; color:#ccc; margin-bottom:4px;">Compartir con <b style="color:var(--accent);">${friendEmail}</b></div>`;
    html += '<div style="font-size:0.72em; color:#555; margin-bottom:14px;">Los datos de repaso (Rachas, Fechas) no se incluyen.</div>';

    if (asigs.length === 0) {
        html += '<p style="color:#555; font-size:0.85em;">No tienes asignaturas para compartir.</p>';
    } else {
        asigs.forEach(asig => {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #252525; gap:8px;">
                <span style="font-size:0.88em; color:#ccc;">${asig} <span style="color:#555; font-size:0.82em;">(${biblioteca[asig].length})</span></span>
                <button data-action="compartirAsignatura" data-email="${friendEmail}" data-asig="${asig}" style="background:rgba(76,175,80,0.12); color:var(--accent); border:1px solid var(--accent); padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.8em; white-space:nowrap;"><i class="fa-regular fa-paper-plane"></i> Enviar</button>
            </div>`;
        });
    }
    contenido.innerHTML = html;
}

async function compartirAsignatura(toEmail, nombreAsig) {
    const CAMPOS_PRIVADOS = ['UltimoRepaso', 'ProximoRepaso', 'EtapaRepaso', 'IndiceGlobal',
                             'fsrs_state', 'fsrs_stability', 'fsrs_difficulty', 'review_log'];
    const biblioteca = State.get('biblioteca') || {};
    const tarjetasLimpias = (biblioteca[nombreAsig] || []).map(t => {
        const copia = { ...t };
        CAMPOS_PRIVADOS.forEach(c => delete copia[c]);
        return copia;
    });

    try {
        const currentUser = State.get('currentUser');
        await State.get('db').collection('sharedSubjects').add({
            fromUid:     currentUser.uid,
            fromEmail:   currentUser.email,
            toEmail,
            subjectName: nombreAsig,
            cards:       tarjetasLimpias,
            seen:        false,
            timestamp:   firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`"${nombreAsig}" enviada a ${toEmail}.`);
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('compartirAsignatura error:', e);
        alert('Error al compartir. ¿Hay conexión?');
    }
}

async function importarAsignaturaCompartida(docId) {
    try {
        const db      = State.get('db');
        const docSnap = await db.collection('sharedSubjects').doc(docId).get();
        if (!docSnap.exists) return alert('El documento ya no existe.');

        const d        = docSnap.data();
        let nombreFinal = d.subjectName;
        const biblioteca = State.get('biblioteca') || {};

        if (biblioteca[nombreFinal]) {
            nombreFinal = prompt(`Ya tienes "${nombreFinal}". ¿Con qué nombre importarla?`, `${nombreFinal} (compartida)`);
            if (!nombreFinal || !nombreFinal.trim()) return;
            nombreFinal = nombreFinal.trim();
        }

        // FIX: mutación a través del estado + EventBus, no guardarEnLocal
        State.batch(() => {
            const bib = State.get('biblioteca');
            bib[nombreFinal] = d.cards;
            State.set('biblioteca', bib);
        });
        EventBus.emit('DATA_REQUIRES_SAVE');

        if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
        sincronizar();

        await db.collection('sharedSubjects').doc(docId).update({ seen: true });
        alert(`¡Éxito! "${nombreFinal}" importada.`);
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('importarAsignaturaCompartida error:', e);
        alert('Error al importar la asignatura.');
    }
}

// ─────────────────────────────────────────────────────────────
// CIERRE DEL MODAL AL CLICK FUERA
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const modalAmigos = document.getElementById('modal-amigos');
    if (modalAmigos) {
        modalAmigos.addEventListener('click', e => {
            if (e.target === modalAmigos) cerrarModalAmigos();
        });
    }
});

// ─────────────────────────────────────────────────────────────
// EXPOSICIÓN PÚBLICA
// ─────────────────────────────────────────────────────────────

window.procesarLoginGoogle        = procesarLoginGoogle;
window.sincronizarTelemetriaFSRS  = sincronizarTelemetriaFSRS;
