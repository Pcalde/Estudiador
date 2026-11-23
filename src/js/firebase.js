// ════════════════════════════════════════════════════════════════
// FIREBASE.JS — Capa de red: autenticación, persistencia en nube y funciones sociales
//
// ════════════════════════════════════════════════════════════════
let _syncTimeout     = null;
let _autoSaveInterval = null;
let _auth            = null;
let _db              = null;
let _cuentaAutoguardado = null;
let _revisionLocal;
let _lecturaRevision;
let _operacion = Promise.resolve();
let _autenticando = false;
let _proyecto;

function exigirCuenta(uid) {
    if (!uid || _auth?.currentUser?.uid !== uid || State.get('currentUser')?.uid !== uid ||
        Perfil.cuenta !== JSON.stringify([_proyecto, uid])) throw new Error('La cuenta ha cambiado.');
}

function enCuenta(fn) {
    const uid = State.get('currentUser')?.uid;
    const tarea = _operacion.then(async () => {
        exigirCuenta(uid);
        if (!await cargaLocalLista) throw new Error('No se pudo abrir el perfil local.');
        await _lecturaRevision;
        exigirCuenta(uid);
        return fn(uid);
    });
    _operacion = tarea.catch(() => {});
    return tarea;
}

function revision(doc) {
    if (!doc.exists) return null;
    const datos = doc.data();
    return datos.revision || 'anterior:' + JSON.stringify(datos.lastUpdated || null);
}

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
        if (typeof firebase === 'undefined') { Perfil.activar(null); return; }
        const firebaseConfig = JSON.parse(configStr);
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

        _proyecto = firebase.app().options.projectId;
        if (_auth) return;
        _db   = firebase.firestore();
        _auth = firebase.auth();
        _auth.onAuthStateChanged(_manejarCambioAuth, () => Perfil.activar(null));
        _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => Logger.warn('setPersistence falló:', err));
        window._fbDB   = _db;
        window._fbAuth = _auth;

    } catch (e) {
        Logger.error('Error al inicializar Firebase:', e);
        Perfil.activar(null);
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
    if (_autenticando) return;
    if (!Perfil.activar(user ? JSON.stringify([_proyecto, user.uid]) : null)) {
        _cuentaAutoguardado = null;
        State.set('currentUser', null);
        clearTimeout(_syncTimeout);
        clearInterval(_autoSaveInterval);
        return;
    }
    if (user) {
        const esNuevoLogin = State.get('currentUser')?.uid !== user.uid;
        if (esNuevoLogin) {
            _cuentaAutoguardado = null;
            _lecturaRevision = DB.getVar('revisionNube').then(valor => { _revisionLocal = valor; });
        }

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
        
        if (!_autoSaveInterval) {
            _autoSaveInterval = setInterval(() => {
                if (_cuentaAutoguardado !== State.get('currentUser')?.uid) return;
                guardarDatosUsuario().catch(error => Logger.error('Error en guardado automático:', error));
            }, INTERVALO_AUTOSAVE_MS);
        }
        if (esNuevoLogin && typeof comprobarNubeAlIniciar === 'function') {
            comprobarNubeAlIniciar();
        }

    } else {
        _cuentaAutoguardado = null;
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
        if (!await cargaLocalLista) return;
        await _lecturaRevision;
        const doc = await _db.collection('users').doc(currentUser.uid).get({ source: 'server' });
        exigirCuenta(currentUser.uid);
        if (revision(doc) === _revisionLocal) {
            _cuentaAutoguardado = currentUser.uid;
        } else if (doc.exists) {
            const contar = biblioteca => Object.values(biblioteca || {}).reduce((n, cards) => n + (Array.isArray(cards) ? cards.length : 0), 0);
            const local = contar(State.get('biblioteca'));
            const remota = contar(doc.data().biblioteca);
            Toast.ask('Este dispositivo tiene ' + local + ' tarjetas y la copia remota tiene ' + remota +
                '. ¿Cargar la versión remota? Podrás descargar la versión local desde Ajustes.', () => {
                if (State.get('currentUser')?.uid === currentUser.uid) restaurarCopiaNube();
            });
        }
    } catch (error) {
        Logger.error("Error al comprobar la nube:", error);
    }
}

// ─────────────────────────────────────────────────────────────
// SUBIDA DE DATOS
// ─────────────────────────────────────────────────────────────
function guardarDatosUsuario() { return enCuenta(subirDatos); }

async function subirDatos(uid) {
    const currentUser = State.get('currentUser');

    const data = structuredClone({
        biblioteca:   State.get('biblioteca')   || {},
        bibliotecaConfig: State.get('bibliotecaConfig') || { carpetas: {}, archivadas: [] },
        projects:     State.get('projects')     || [],
        fechasClave:  State.get('fechasClave')  || [],
        horarioGlobal: State.get('horarioGlobal') || {},
        userColors:   State.get('userColors')   || {},
        pomoSettings: State.get('pomoSettings') || {},
        taskList:     State.get('taskList')     || [],
        graphData: State.get('graphData') || {}       
    });
    data.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();

    const publica = { email: currentUser.email, stats: Telemetry.construirResumenPublico(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
    const ref = _db.collection('users').doc(uid);
    const nueva = DataIO.nuevoId();
    try {
        await _db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            exigirCuenta(uid);
            if (revision(doc) !== _revisionLocal) {
                _cuentaAutoguardado = null;
                const mensaje = 'La copia remota ha cambiado. Cárgala desde Ajustes para conservar ambas versiones.';
                Toast.show(mensaje, 'warning');
                throw new Error(mensaje);
            }
            tx.set(ref, { ...data, revision: nueva }, { mergeFields: [...Object.keys(data), 'revision'] });
            tx.set(_db.collection('usersPublic').doc(uid), publica, { mergeFields: Object.keys(publica) });
        });
        await DB.setVar('revisionNube', nueva);
        _revisionLocal = nueva;
        exigirCuenta(uid);
        Logger.info('Datos guardados en Firebase');
        if (State.get('currentUser')?.uid === currentUser.uid) _cuentaAutoguardado = currentUser.uid;
    } catch (error) {
        Logger.error('Error al guardar en Firebase:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────
// BAJADA DE DATOS
// ─────────────────────────────────────────────────────────────
function cargarDatosUsuario() { return enCuenta(descargarDatos); }

async function descargarDatos(uid) {
    const currentUser = State.get('currentUser');
    if (!currentUser || !_db) throw new Error('Inicia sesion para cargar la copia.');
    const doc = await _db.collection('users').doc(currentUser.uid).get({ source: 'server' });
    exigirCuenta(uid);
    if (!doc.exists) throw new Error('No hay una copia guardada.');
    const data = doc.data();
    if (!data.biblioteca || typeof data.biblioteca !== 'object') throw new Error('Biblioteca ausente en la copia.');
    for (const key of ['projects', 'taskList', 'fechasClave']) {
        if (data[key] != null && !Array.isArray(data[key])) throw new Error('Lista inválida: ' + key);
    }
    for (const key of ['graphData', 'horarioGlobal', 'bibliotecaConfig', 'pomoSettings', 'userColors']) {
        if (data[key] != null && (typeof data[key] !== 'object' || Array.isArray(data[key]))) throw new Error('Datos inválidos: ' + key);
    }
    const original = data.biblioteca;
    const biblioteca = DataIO.normalizarBiblioteca(original);
    Domain.normalizarBibliotecaFechas(biblioteca);
    const bibliotecaConfig = data.bibliotecaConfig || { carpetas: {}, archivadas: [] };
    const graphData = DataIO.migrarIdsMapa(data.graphData || {}, original, biblioteca);
    const horarioGlobal = data.horarioGlobal || {};
    const fechasClave = Domain.normalizarFechasClave(data.fechasClave || []);
    const values = { biblioteca, bibliotecaConfig, graphData, horarioGlobal, fechasClave };
    const storage = {
        estudiador_biblioteca_config: bibliotecaConfig,
        estudiador_proyectos: data.projects || [],
        estudiador_colores: data.userColors || {},
        pomo_settings: data.pomoSettings || State.get('pomoSettings'),
        pomo_tasks: data.taskList || []
    };
    const locales = Object.entries(storage).map(([key, value]) => [key, JSON.stringify(value)]);
    if (!Object.hasOwn(biblioteca, State.get('nombreAsignaturaActual'))) locales.push(['estudiador_asig_actual', null]);
    const base = revision(doc);
    await DataIO.aplicarRestauracion({ ...values, revisionNube: base }, locales, undefined, () => exigirCuenta(uid));
    exigirCuenta(uid);
    _revisionLocal = base;
    State.batch(() => {
        Object.entries(values).forEach(([key, value]) => State.set(key, value));
        State.set('projects', storage.estudiador_proyectos);
        State.set('userColors', storage.estudiador_colores);
        State.set('pomoSettings', storage.pomo_settings);
        State.set('taskList', storage.pomo_tasks);
        const actual = State.get('nombreAsignaturaActual');
        if (!Object.hasOwn(biblioteca, actual)) {
            State.set('nombreAsignaturaActual', null);
            State.set('colaEstudio', []);
            State.set('conceptoActual', null);
        }
    });
    actualizarListaProyectos();
    EventBus.emit('DATOS_NUBE_CARGADOS', { asigActual: State.get('nombreAsignaturaActual') });
}

async function restaurarCopiaNube() {
    const uid = State.get('currentUser')?.uid;
    _cuentaAutoguardado = null;
    try {
        await cargarDatosUsuario();
        if (State.get('currentUser')?.uid === uid) _cuentaAutoguardado = uid;
        Toast.show('Datos recargados desde Firebase.', 'success');
    } catch (error) {
        Logger.error('Error al cargar desde Firebase:', error);
        Toast.show('No se pudo cargar la copia: ' + error.message, 'error');
    }
}

// ------------------------------------------------------------
// SINCRONIZACIÓN
// ─────────────────────────────────────────────────────────────
function sincronizar() {
    const uid = State.get('currentUser')?.uid;
    if (!uid || _cuentaAutoguardado !== uid) return;
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(() => {
        if (_cuentaAutoguardado !== uid || State.get('currentUser')?.uid !== uid) return;
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
        alert("No se pudo guardar: " + error.message);
    } finally {
        if (btn) btn.innerText = "Guardar en Nube";
    }
}

function forzarBajada() {
    if (!State.get('currentUser')) return;
    Toast.ask(
        "¿Recargar desde la nube? Perderás los cambios locales no guardados.",
        restaurarCopiaNube
    );
}

// ─────────────────────────────────────────────────────────────
// TELEMETRÍA FSRS — Batch Firestore (API compat v8)
// ─────────────────────────────────────────────────────────────
async function sincronizarTelemetriaFSRS() {
    const currentUser = State.get('currentUser');
    if (!_db || !currentUser || _cuentaAutoguardado !== currentUser.uid || typeof DB === 'undefined') return;

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
                   || localStorage.getItem('firebase_config') || JSON.stringify(FIREBASE_CONFIG_EMBEBIDA);
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
        _autenticando = true;
        const cred = await _auth.createUserWithEmailAndPassword(email, pass);
        const ts   = firebase.firestore.FieldValue.serverTimestamp();
        await _db.collection('usersPublic').doc(cred.user.uid).set({
            email, stats: { totalTarjetas: 0, pendientesHoy: 0, dominadas: 0, asignaturas: [] },
            lastUpdated: ts
        });
        alert("Cuenta creada. El espacio de estudio de la cuenta está listo.");
    } catch (error) {
        Logger.error("Error registro:", error);
        alert("Fallo de registro: " + error.message);
    } finally {
        btn.innerText = "Crear Cuenta Nueva";
        _autenticando = false;
        _manejarCambioAuth(_auth.currentUser);
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
        _autenticando = true;
        const result = await _auth.signInWithPopup(provider);
        const user = result.user;

        if (typeof Logger !== 'undefined') Logger.info("Auth: Login Google OK", user.email);

        if (result.additionalUserInfo?.isNewUser) {
            const batch = _db.batch();
            batch.set(_db.collection('usersPublic').doc(user.uid), { email: user.email }, { merge: true });
            batch.set(_db.collection('emailIndex').doc(user.email), { uid: user.uid });
            await batch.commit();
        }
    } catch (error) {
        if (typeof Logger !== 'undefined') Logger.error("Error Auth Google:", error);
        
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("Error de acceso: " + error.message);
        }
    } finally {
        if (btn) btn.innerHTML = textoOriginal;
        _autenticando = false;
        _manejarCambioAuth(_auth.currentUser);
    }
}

function cerrarSesion() {
    if (!confirm("¿Seguro que deseas cerrar sesión? Dejarás de sincronizar con la nube.")) return;
    _auth.signOut().catch(error => Toast.show('No se pudo cerrar la sesión: ' + error.message, 'error'));
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
