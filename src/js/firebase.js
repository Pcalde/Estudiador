// ════════════════════════════════════════════════════════════════
// FIREBASE.JS — Capa de red: autenticación, persistencia en nube y funciones sociales
//
// ════════════════════════════════════════════════════════════════
let _syncTimeout     = null;
let _autoSaveInterval = null;
let _auth            = null;
let _db              = null;

const FIREBASE_CONFIG_EMBEBIDA = {
    apiKey: "AIzaSyBZJar5Z82Fb8lvPaYc2BOMpjGMF2PM0jY",
    authDomain: "estudiador-pro.firebaseapp.com",
    projectId: "estudiador-pro",
    storageBucket: "estudiador-pro.firebasestorage.app",
    messagingSenderId: "465558266905",
    appId: "1:465558266905:web:f2a409f91df1ff55ab3688"
};

const INTERVALO_AUTOSAVE_MS = 15 * 60 * 1000; // 15 minutos

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────
function inicializarFirebase(configStr) {
    try {
        if (typeof firebase === 'undefined') return;
        const firebaseConfig = JSON.parse(configStr);
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

        _db   = firebase.firestore();
        _auth = firebase.auth();
        _auth.onAuthStateChanged(_manejarCambioAuth);
        _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => Logger.warn('setPersistence falló:', err));
        window._fbDB   = _db;
        window._fbAuth = _auth;

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
// ─────────────────────────────────────────────────────────────
// MANEJADOR DE ESTADO DE AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────
function _manejarCambioAuth(user) {
    if (user) {
        const esNuevoLogin = !State.get('currentUser');

        const pureUser = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || null,
            photoURL: user.photoURL || null,
            emailVerified: user.emailVerified || false
        };
        
        // Mutación centralizada
        State.set('currentUser', pureUser);
        if (typeof UI !== 'undefined' && typeof UI.renderAuthEstado === 'function') {
            UI.renderAuthEstado(pureUser);
        }
        
        if (typeof sincronizarTelemetriaFSRS === 'function') sincronizarTelemetriaFSRS();
        
        if (!_autoSaveInterval) {
            _autoSaveInterval = setInterval(guardarDatosUsuario, INTERVALO_AUTOSAVE_MS);
        }
        if (esNuevoLogin && typeof comprobarNubeAlIniciar === 'function') {
            comprobarNubeAlIniciar();
        }

    } else {
        State.set('currentUser', null);
        
        if (typeof UI !== 'undefined' && typeof UI.renderAuthEstado === 'function') {
            UI.renderAuthEstado(null);
        }

        if (_autoSaveInterval) {
            clearInterval(_autoSaveInterval);
            _autoSaveInterval = null;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// COMPROBACIÓN INICIAL DE NUBE v2
// ─────────────────────────────────────────────────────────────
async function comprobarNubeAlIniciar() {
    const currentUser = State.get('currentUser');
    if (!currentUser || !_db) return;

    try {
        const doc = await _db.collection('users').doc(currentUser.uid).get();
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
    if (!currentUser || !_db) return;

    const data = {
        biblioteca:   State.get('biblioteca')   || {},
        projects:     State.get('projects')     || [],
        fechasClave:  State.get('fechasClave')  || [],
        horarioGlobal: State.get('horarioGlobal') || {},
        userColors:   State.get('userColors')   || {},
        pomoSettings: State.get('pomoSettings') || {},
        taskList:     State.get('taskList')     || [],
        lastUpdated:  firebase.firestore.FieldValue.serverTimestamp(),
        graphData: State.get('graphData') || {}       
    };

    try {
        await _db.collection('users').doc(currentUser.uid).set(data, { merge: true });
        await _db.collection('usersPublic').doc(currentUser.uid).set({
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
    if (!currentUser || !_db) return;

    try {
        const doc = await _db.collection('users').doc(currentUser.uid).get();

        if (doc.exists) {
            const data = doc.data();

            State.batch(() => {
                const biblio = data.biblioteca || {};
                if (typeof window.normalizarBibliotecaFechas === 'function') window.normalizarBibliotecaFechas(biblio);
                State.set('biblioteca', biblio);

                State.set('projects',      data.projects      || []);
                State.set('horarioGlobal', data.horarioGlobal || {});
                State.set('userColors',    data.userColors    || {});
                State.set('pomoSettings',  data.pomoSettings  || State.get('pomoSettings'));
                State.set('taskList',      data.taskList      || []);
                State.set('graphData', data.graphData || {});

                if (typeof window.normalizarFechasClave === 'function') {
                    const fechasSaneadas = window.normalizarFechasClave(data.fechasClave || []);
                    State.set('fechasClave', fechasSaneadas);
                }
            });

            EventBus.emit('DATA_REQUIRES_SAVE');
            EventBus.emit('DATOS_NUBE_CARGADOS', { asigActual: State.get('nombreAsignaturaActual') });

            Logger.info('Datos cargados desde Firebase y volcados al estado local.');
        } else {
            await guardarDatosUsuario();
        }
    } catch (error) {
        Logger.error('Error al cargar desde Firebase:', error);
    }
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZACIÓN
// ─────────────────────────────────────────────────────────────
function sincronizar() {
    if (!State.get('currentUser')) return;
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(() => {
        guardarDatosUsuario().catch(e => Logger.error("Fallo sincro silenciosa:", e));
    }, 1500);
}
window.sincronizar = sincronizar;

async function forzarRespaldoNube() {
    if (!State.get('currentUser')) return alert("Debes iniciar sesión para respaldar en la nube.");
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
    const currentUser = State.get('currentUser');
    if (!_db || !currentUser || typeof DB === 'undefined') return;

    try {
        const pendientes = await DB.getUnsyncedRevlogs();
        if (!pendientes || pendientes.length === 0) return;

        const limite = pendientes.slice(0, 450);
        const batch    = _db.batch();
        const basePath = `users/${currentUser.uid}/fsrs_revlogs`;

        limite.forEach(log => {
            const { id, synced, ...cleanLog } = log;
            batch.set(
                _db.collection(basePath).doc(),
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
    if (_auth) return true;
    const configStr = document.getElementById('set-firebase-config')?.value.trim()
                   || localStorage.getItem('firebase_config');
    if (!configStr) {
        alert("Firebase no configurado. Ve a Ajustes → Cuenta.");
        return false;
    }
    inicializarFirebase(configStr);
    for (let i = 0; i < 30; i++) {
        if (_auth) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    alert("No se pudo inicializar Firebase.");
    return false;
}

async function procesarLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const btn   = document.getElementById('btn-login');
    if (!email || !pass) return alert("Rellena el correo y la contraseña."); 
    if (!await asegurarFirebaseInit()) return;
    btn.innerText = "Conectando...";
    try {
        await _auth.signInWithEmailAndPassword(email, pass);
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
        const cred = await _auth.createUserWithEmailAndPassword(email, pass);
        const ts   = firebase.firestore.FieldValue.serverTimestamp();
        await _db.collection('users').doc(cred.user.uid).set({
            biblioteca: {}, projects: [], fechasClave: [], horarioGlobal: {},
            userColors: {}, pomoSettings: State.get('pomoSettings') || {},
            taskList: [], createdAt: ts
        });
        await _db.collection('usersPublic').doc(cred.user.uid).set({
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

// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN GOOGLE
// ─────────────────────────────────────────────────────────────
async function procesarLoginGoogle() {
    // 1. Orquestación estricta: Garantizar que la red está levantada
    if (!await asegurarFirebaseInit()) return;

    const btn = document.querySelector('#btn-google-login') || document.querySelector('.btn-google') || document.getElementById('btn-login-google');
    const textoOriginal = btn ? btn.innerHTML : '';
    
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        
        // 2. Uso directo de variables de módulo (ya garantizadas por asegurarFirebaseInit)
        const result = await _auth.signInWithPopup(provider);
        const user = result.user;

        if (typeof Logger !== 'undefined') Logger.info("Auth: Login Google OK", user.email);

        const userDoc = await _db.collection('usersPublic').doc(user.uid).get();
        
        // 3. Inicialización completa del documento de usuario (Evita null pointers en UI)
        if (!userDoc.exists) {
            const ts = firebase.firestore.FieldValue.serverTimestamp();
            
            await _db.collection('users').doc(user.uid).set({
                biblioteca: {}, projects: [], fechasClave: [], horarioGlobal: {},
                userColors: {}, pomoSettings: State.get('pomoSettings') || {},
                taskList: [], createdAt: ts
            });
            
            await _db.collection('usersPublic').doc(user.uid).set({
                email: user.email,
                stats: { totalTarjetas: 0, pendientesHoy: 0, dominadas: 0, asignaturas: [] },
                lastUpdated: ts
            });
            
            await _db.collection('emailIndex').doc(user.email).set({ uid: user.uid });
            
            alert("Cuenta creada con Google. Realizando primera subida local...");
            await guardarDatosUsuario();
        }
    } catch (error) {
        if (typeof Logger !== 'undefined') Logger.error("Error Auth Google:", error);
        
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("Error de acceso: " + error.message);
        }
    } finally {
        if (btn) btn.innerHTML = textoOriginal;
    }
}

function cerrarSesion() {
    if (!confirm("¿Seguro que deseas cerrar sesión? Dejarás de sincronizar con la nube.")) return;
    if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }
    _auth.signOut().then(() => {
        State.set('currentUser', null);
        location.reload();
    });
}

// ─────────────────────────────────────────────────────────────
// EXPOSICIÓN PÚBLICA
// ─────────────────────────────────────────────────────────────
window.procesarLoginGoogle        = procesarLoginGoogle;
window.sincronizarTelemetriaFSRS  = sincronizarTelemetriaFSRS;
window.procesarLogin              = procesarLogin;
window.procesarRegistro           = procesarRegistro;
window.cerrarSesion               = cerrarSesion;
window.forzarRespaldoNube         = forzarRespaldoNube;
window.forzarBajada               = forzarBajada;
window.sincronizar                = sincronizar;
window.cargarDatosUsuario         = cargarDatosUsuario;
window.guardarDatosUsuario        = guardarDatosUsuario;
