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
    if (user) {
        const esNuevoLogin = !State.get('currentUser');
        State.set('currentUser', user);

        const db = State.get('db');
        if (db) db.collection('emailIndex').doc(user.email).set({ uid: user.uid }).catch(() => {});

        UI.renderAuthEstado(user);

        if (_autoSaveInterval) clearInterval(_autoSaveInterval);
        _autoSaveInterval = setInterval(() => {
            Logger.info("Ejecutando Auto-Save de seguridad en la nube...");
            sincronizar();
        }, INTERVALO_AUTOSAVE_MS);

        if (esNuevoLogin) comprobarNubeAlIniciar();

    } else {
        State.set('currentUser', null);

        if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }

        UI.renderAuthEstado(null);
    }
}

// ─────────────────────────────────────────────────────────────
// COMPROBACIÓN INICIAL DE NUBE v2
// ─────────────────────────────────────────────────────────────

async function comprobarNubeAlIniciar() {
    const currentUser = State.get('currentUser');
    const db = State.get('db');
    if (!currentUser || !db) return;

    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            Toast.ask(
                'Se ha detectado una copia en la nube. ¿Deseas sobreescribir tus datos locales?',
                async () => {
                    await cargarDatosUsuario();
                    Toast.show('Sincronización inicial completada', 'success');
                }
            );
        }
    } catch (error) {
        Logger.error("Error al comprobar la nube:", error);
    }
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
            stats: Telemetry.construirResumenPublico(),
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

            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('DATOS_NUBE_CARGADOS', {
                asigActual: State.get('nombreAsignaturaActual')
            });

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
    if (!State.get('currentUser')) return;
    Toast.ask(
        "¿Recargar desde la nube? Perderás los cambios locales no guardados.",
        () => {
            cargarDatosUsuario().then(() => {
                Toast.show('Datos recargados desde Firebase', 'success');
            });
        }
    );
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
// EXPOSICIÓN PÚBLICA
// ─────────────────────────────────────────────────────────────

window.procesarLoginGoogle        = procesarLoginGoogle;
window.sincronizarTelemetriaFSRS  = sincronizarTelemetriaFSRS;
