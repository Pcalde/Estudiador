// ════════════════════════════════════════════════════════════════
// FIREBASE.JS — Capa de red: autenticación, persistencia en nube y funciones sociales
// Depende de: state.js (globals), Logger, biblioteca, fechasClave, etc.
// ════════════════════════════════════════════════════════════════


    // Variables globales para Firebase
    const FIREBASE_CONFIG_EMBEBIDA = {
        apiKey: "AIzaSyBZJar5Z82Fb8lvPaYc2BOMpjGMF2PM0jY",               
        authDomain: "estudiador-pro.firebaseapp.com",
        projectId: "estudiador-pro",
        storageBucket: "estudiador-pro.firebasestorage.app",
        messagingSenderId: "465558266905",
        appId: "1:465558266905:web:f2a409f91df1ff55ab3688"
    };
    // (moved to state.js)
    // (moved to state.js)
    // (moved to state.js)
    // (moved to state.js)
    // (moved to state.js)
    const INTERVALO_AUTOSAVE_MS = 15 * 60 * 1000; // 15 minutos

    setInterval(() => {
        if (currentUser && typeof sincronizar === 'function') {
            Logger.info("Ejecutando Auto-Save de seguridad en la nube...");
            sincronizar(); // Se omite el .catch() dado que sincronizar() no devuelve Promise
        }
    }, INTERVALO_AUTOSAVE_MS);



        // --- SISTEMA DE RESPALDO MANUAL Y ARRANQUE ---

        async function comprobarNubeAlIniciar() {
            if (!currentUser) return;
            
            try {
                const userRef = db.collection('users').doc(currentUser.uid);
                const doc = await userRef.get();
                
                if (doc.exists) {
                    if (confirm('Se ha detectado una copia de seguridad en la nube. ¿Deseas sobreescribir tus datos locales actuales con la versión de la nube?')) {
                        await cargarDatosUsuario(); 
                    }
                }
            } catch (error) {
                Logger.error("Error al comprobar la nube:", error);
            }
        }
        
        function inicializarFirebase(configStr) {
            try {
                const firebaseConfig = JSON.parse(configStr);
                if (typeof firebase === 'undefined') return;
                
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                
                db = firebase.firestore();
                auth = firebase.auth();
                
                auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        auth.onAuthStateChanged(user => {
            const statusDiv = document.getElementById('auth-status');
            const loginForm = document.getElementById('auth-login-form');
            const loggedInForm = document.getElementById('auth-logged-in');

            if (user) {
                const esNuevoLogin = !currentUser;
                currentUser = user;
                db.collection('emailIndex').doc(user.email).set({ uid: user.uid }).catch(() => {});
                if(statusDiv) statusDiv.innerHTML = `Estado: <span style="color: var(--accent);">Conectado (${user.email})</span>`;
                if(loginForm) loginForm.classList.add('hidden');
                if(loggedInForm) loggedInForm.classList.remove('hidden');
                if (esNuevoLogin && typeof comprobarNubeAlIniciar === 'function') {
                    comprobarNubeAlIniciar();
                }
            } else {
                currentUser = null;
                if(statusDiv) statusDiv.innerText = "Estado: Desconectado (Modo Offline)";
                if(loginForm) loginForm.classList.remove('hidden');
                if(loggedInForm) loggedInForm.classList.add('hidden');
            }
        });
    })
    .catch(error => Logger.error('Error de persistencia o auth:', error));
                    
            } catch (e) {
                Logger.error('Error al inicializar Firebase:', e);
            }
        }
        window.addEventListener('load', () => {
            const savedConfig = localStorage.getItem('firebase_config');
            // Prioridad: config manual > config embebida
            const configStr = savedConfig || JSON.stringify(FIREBASE_CONFIG_EMBEBIDA);
            inicializarFirebase(configStr);
        });

        function construirResumenPublicoUsuario() {
            // 1. Comprobación de Privacidad
            const isPrivate = localStorage.getItem('estudiador_privacy_stats') === 'true';
            if (isPrivate) return { isPrivate: true };

            // 2. Extraer datos globales
            const elStreak = document.getElementById('stat-streak');
            const todayLog = JSON.parse(localStorage.getItem('pomo_log_today') || '{"count":0}');
            
            const resumen = {
                isPrivate: false,
                totalTarjetas: 0,
                pendientesHoy: 0,
                dominadas: 0,
                deudaTotal: 0,
                racha: elStreak ? parseInt(elStreak.innerText) || 0 : 0,
                pomosHoy: todayLog.count || 0,
                asignaturas: []
            };

            const todayVal = window.fechaValor(window.getFechaHoy());

            Object.keys(biblioteca || {}).forEach(asig => {
                const tarjetas = Array.isArray(biblioteca[asig]) ? biblioteca[asig] : [];
                if (!tarjetas.length) return;

                let pendientes = 0;
                let dominadas = 0;
                let deudaLocal = 0;

                tarjetas.forEach(c => {
                    // Contar Pendientes
                    if (!c?.ProximoRepaso || window.fechaValor(c.ProximoRepaso) <= todayVal) pendientes++;

                    // Contar Dominadas (FSRS > 21 días de retención, o Legacy Etapa >= 5)
                    if (c.fsrs_state === 'review' && c.fsrs_stability > 21) dominadas++;
                    else if (!c.fsrs_state && (c?.EtapaRepaso || 0) >= 5) dominadas++;

                    // Calcular Deuda FSRS Exacta
                    // Calcular Deuda FSRS Exacta
                    if (c.ProximoRepaso && window.fechaValor(c.ProximoRepaso) <= todayVal) {
                        const isNew = c.fsrs_state === 'new' || (!c.fsrs_state && !c.UltimoRepaso);
                        
                        if (isNew) deudaLocal += 1.0;
                        else if (c.fsrs_state === 'learning') deudaLocal += 4.0;
                        else {
                            const elapsed = c.UltimoRepaso ? Math.max(0, window.diffDiasCalendario(c.UltimoRepaso, window.getFechaHoy())) : 0;
                            const stability = c.fsrs_stability || 1;
                            const R = Math.pow(0.9, elapsed / stability);
                            const D = c.fsrs_difficulty || 5;
                            deudaLocal += Math.max(0.5, (1 - R) * D);
                        }
                    }
                });

                resumen.totalTarjetas += tarjetas.length;
                resumen.pendientesHoy += pendientes;
                resumen.dominadas += dominadas;
                resumen.deudaTotal += deudaLocal;

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

        /**
         * Persiste datos privados del usuario en `users/{uid}` y un resumen público en `usersPublic/{uid}`.
         * @returns {Promise<void>}
         */
        async function guardarDatosUsuario() {
            if (!currentUser) return;
            
            const userRef = db.collection('users').doc(currentUser.uid);
            const data = {
                biblioteca: biblioteca || {},
                projects: typeof projects !== 'undefined' ? projects : [],
                fechasClave: typeof fechasClave !== 'undefined' ? fechasClave : [],
                horarioGlobal: typeof horarioGlobal !== 'undefined' ? horarioGlobal : {},
                userColors: typeof userColors !== 'undefined' ? userColors : {},
                pomoSettings: typeof pomoSettings !== 'undefined' ? pomoSettings : {},
                taskList: typeof taskList !== 'undefined' ? taskList : [],
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                await userRef.set(data, { merge: true });
                await db.collection('usersPublic').doc(currentUser.uid).set({
                    email: currentUser.email,
                    stats: construirResumenPublicoUsuario(),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                Logger.info('Datos guardados en Firebase');
            } catch (error) {
                Logger.error('Error al guardar en Firebase:', error);
                throw error; // Propagamos el error para que forzarRespaldoNube lo capture
            }
        }

        // Función central de BAJADA
        async function cargarDatosUsuario() {
            if (!currentUser) return;
            
            const userRef = db.collection('users').doc(currentUser.uid);
            try {
                const doc = await userRef.get();
                if (doc.exists) {
                    const data = doc.data();
                    
                    // 1. Inyección en RAM
                    biblioteca = data.biblioteca || {};
                    if(typeof projects !== 'undefined') projects = data.projects || [];
                    if(typeof fechasClave !== 'undefined') fechasClave = data.fechasClave || [];
                    if(typeof horarioGlobal !== 'undefined') horarioGlobal = data.horarioGlobal || {};
                    if(typeof userColors !== 'undefined') userColors = data.userColors || {};
                    if(typeof pomoSettings !== 'undefined') pomoSettings = data.pomoSettings || pomoSettings;
                    if(typeof taskList !== 'undefined') taskList = data.taskList || [];
                    normalizarBibliotecaFechas();
                    normalizarFechasClave();
                    
                    // 2. CORRECCIÓN CRÍTICA: Volcado a disco duro (Local-First)
                    // Llama a tu función nativa de guardado para sellar los datos en el navegador
                    if (typeof guardarEnLocal === 'function') {
                        guardarEnLocal();
                    } else {
                        localStorage.setItem('estudiador_db_v2', JSON.stringify(biblioteca));
                    }
                    
                    // 3. Actualizar la interfaz
                    if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
                    if (typeof updateDashboard === 'function') updateDashboard();
                    if (typeof cargarAsignatura === 'function' && typeof nombreAsignaturaActual !== 'undefined') cargarAsignatura(nombreAsignaturaActual);
                    
                    Logger.info('Datos cargados desde Firebase e inyectados en LocalStorage');
                } else {
                    await guardarDatosUsuario();
                }
            } catch (error) {
                Logger.error('Error al cargar desde Firebase:', error);
            }
        }

        // Buffer para guardados automáticos o en ráfaga (No bloquea la UI)
        function sincronizar() {
            if (currentUser) {
                if (window.syncTimeout) clearTimeout(window.syncTimeout);
                window.syncTimeout = setTimeout(() => {
                    guardarDatosUsuario().catch(e => Logger.error("Fallo sincro silenciosa:", e));
                }, 1500);
            }
        }
        window.sincronizar = sincronizar;

        // Disparador manual explícito (Debe ser síncrono visualmente)
        async function forzarRespaldoNube() {
            if (!currentUser) {
                alert("Debes iniciar sesión para respaldar en la nube.");
                return;
            }
            
            const btn = document.getElementById('btn-sync-nube');
            if(btn) btn.innerText = "Subiendo...";
            
            try {
                // CORRECCIÓN: Llamamos a la Promesa real, no al timeout
                await guardarDatosUsuario();
                alert("Copia de seguridad guardada en Firebase correctamente.");
            } catch (error) {
                Logger.error("Fallo al subir a la nube:", error);
                alert("Error al guardar en la nube. Revisa tu conexión.");
            } finally {
                if(btn) btn.innerText = "Guardar en Nube";
            }
        }

        function forzarBajada() {
            if (currentUser && confirm("¿Recargar desde la nube? Se perderán los cambios locales no guardados.")) {
                cargarDatosUsuario();
            }
        }
        // --- SISTEMA DE AUTENTICACIÓN ---

        async function asegurarFirebaseInit() {
            if (auth) return true;
            const configStr = (document.getElementById('set-firebase-config')?.value.trim()) || localStorage.getItem('firebase_config');
            if (!configStr) {
                alert("Firebase no está configurado en este dispositivo.\n\nVe al apartado 'Configuración de Firebase', pega el objeto de configuración y guárdalo. Solo hace falta hacerlo una vez.");
                return false;
            }
            inicializarFirebase(configStr);
            for (let i = 0; i < 30; i++) {
                if (auth) return true;
                await new Promise(r => setTimeout(r, 100));
            }
            alert("No se pudo inicializar Firebase. Comprueba que la configuración es correcta.");
            return false;
        }

        async function procesarLogin() {
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-login');
            
            if (!email || !pass) {
                alert("Rellena el correo y la contraseña.");
                return;
            }
            if (!await asegurarFirebaseInit()) return;
            
            btn.innerText = "Conectando...";
            try {
                await auth.signInWithEmailAndPassword(email, pass);
            } catch (error) {
                Logger.error("Error en login:", error);
                alert(" Error de acceso. Verifica tu correo y contraseña.");
            } finally {
                btn.innerText = "Acceder";
            }
        }

        async function procesarRegistro() {
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-register');
            
            if (!email || pass.length < 6) return alert("Email válido y contraseña de mín. 6 caracteres.");
            if (!await asegurarFirebaseInit()) return;
            
            btn.innerText = "Creando...";
            try {
                const cred = await auth.createUserWithEmailAndPassword(email, pass);
                
                // Inicialización de la base de datos para el nuevo usuario
                await db.collection('users').doc(cred.user.uid).set({
                    biblioteca: {},
                    projects: [],
                    fechasClave: [],
                    horarioGlobal: {},
                    userColors: {},
                    pomoSettings: typeof pomoSettings !== 'undefined' ? pomoSettings : {},
                    taskList: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                await db.collection('usersPublic').doc(cred.user.uid).set({
                    email: email,
                    stats: {
                        totalTarjetas: 0,
                        pendientesHoy: 0,
                        dominadas: 0,
                        asignaturas: []
                    },
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                alert("Cuenta creada. Realizando primera subida local...");
                await guardarDatosUsuario(); // Sube lo que tuviera en localStorage a su nueva cuenta
                
            } catch (error) {
                Logger.error("Error registro:", error);
                alert("Fallo de registro: " + error.message);
                btn.innerText = "Crear Cuenta Nueva";
            }
        }

        function cerrarSesion() {
            if(confirm("¿Seguro que deseas cerrar sesión? Dejarás de sincronizar con la nube.")) {
                auth.signOut().then(() => {
                    currentUser = null;
                    location.reload(); // Recarga agresiva para limpiar memoria
                });
            }
        }


    // =============================================
    // SISTEMA DE AMIGOS Y COMPARTIR (integrado)
    // =============================================

// =============================================
// SISTEMA DE AMIGOS Y COMPARTIR (CORREGIDO)
// =============================================

function abrirModalAmigos() {
    if (!currentUser) return alert('Debes iniciar sesión para usar esta función.');
    document.getElementById('modal-amigos').classList.remove('hidden');
    cargarPanelAmigos();
}

function cerrarModalAmigos() {
    document.getElementById('modal-amigos').classList.add('hidden');
}

async function cargarPanelAmigos() {
    const contenido = document.getElementById('amigos-contenido');
    contenido.innerHTML = '<p style="color:#888; text-align:center; padding:20px 0;">Cargando...</p>';

    try {
        // 1. Solicitudes de amistad recibidas pendientes
        const solicitudesSnap = await db.collection('friendRequests')
            .where('toUid', '==', currentUser.uid) // <- Usamos UID en vez de Email
            .where('status', '==', 'pending')
            .get();

        // 2. Lista de amigos
        const enviadas = await db.collection('friendRequests')
            .where('fromUid', '==', currentUser.uid)
            .where('status', '==', 'accepted')
            .get();

        const recibidas = await db.collection('friendRequests')
            .where('toUid', '==', currentUser.uid)
            .where('status', '==', 'accepted')
            .get();

        // Construir lista de amigos GUARDANDO EL ID DEL DOCUMENTO PARA PODER BORRARLOS
        const amigos = [];
        enviadas.forEach(doc => {
            const d = doc.data();
            amigos.push({ docId: doc.id, uid: d.toUid, email: d.toEmail });
        });
        recibidas.forEach(doc => {
            const d = doc.data();
            amigos.push({ docId: doc.id, uid: d.fromUid, email: d.fromEmail });
        });

        // 3. Asignaturas compartidas pendientes
        const compartidasSnap = await db.collection('sharedSubjects')
            .where('toEmail', '==', currentUser.email)
            .where('seen', '==', false)
            .get();

        let html = '';

        // --- ASIGNATURAS RECIBIDAS ---
        if (!compartidasSnap.empty) {
            html += '<div style="margin-bottom:15px; padding:12px; background:rgba(76,175,80,0.08); border:1px solid var(--accent); border-radius:6px;">';
            html += '<div style="font-size:0.72em; color:var(--accent); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;"><i class="fa-solid fa-truck-fast"></i> Asignaturas recibidas</div>';
            compartidasSnap.forEach(doc => {
                const d = doc.data();
                const safeSubject = escapeHtml(d.subjectName || '');
                const safeFromEmail = escapeHtml(d.fromEmail || '');
                html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">';
                html += '<div><span style="font-size:0.9em; color:white;">' + safeSubject + '</span><span style="color:#666; font-size:0.78em; display:block;">de ' + safeFromEmail + ' · ' + d.cards.length + ' tarjetas</span></div>';
                html += `<button data-action="importarAsignaturaCompartida" data-id="${doc.id}" style="background:var(--accent); color:#000; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:0.8em; font-weight:bold;">Importar</button>`;
                html += '</div>';
            });
            html += '</div>';
        }

        // --- SOLICITUDES PENDIENTES ---
        if (!solicitudesSnap.empty) {
            html += '<div style="margin-bottom:15px; padding:12px; background:rgba(205,205,0,0.08); border:1px solid #cdcd00; border-radius:6px;">';
            html += '<div style="font-size:0.72em; color:#cdcd00; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;"><i class="fa-solid fa-person-circle-plus"></i> Solicitudes de amistad</div>';
            solicitudesSnap.forEach(doc => {
                const d = doc.data();
                html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">';
                html += `<span style="font-size:0.9em; color:#ddd;">${escapeHtml(d.fromEmail)}</span>`;
                html += `<div>
                            <button data-action="aceptarSolicitud" data-id="${doc.id}" style="background:rgba(205,205,0,0.15); color:#cdcd00; border:1px solid #cdcd00; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.8em;">Aceptar</button>
                            <button data-action="rechazarSolicitud" data-id="${doc.id}" style="background:rgba(244,67,54,0.15); color:#f44336; border:1px solid #f44336; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-left:5px;">Rechazar</button>
                         </div>`;
                html += '</div>';
            });
            html += '</div>';
        }

        // --- LISTA DE AMIGOS ---
        html += '<div style="margin-bottom:15px;">';
        html += '<div style="font-size:0.72em; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Tus amigos (' + amigos.length + ')</div>';

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

        // --- AÑADIR AMIGO ---
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
    const email = (document.getElementById('input-nuevo-amigo').value || '').trim().toLowerCase();
    if (!email) return alert('Escribe un email.');
    if (email === currentUser.email) return alert('No puedes añadirte a ti mismo.');

    const indexDoc = await db.collection('emailIndex').doc(email).get();
    if (!indexDoc.exists) return alert(`No se encontró ningún usuario con el correo "${email}".\n¿Está registrado?`);

    const toUid = indexDoc.data().uid;

    const existing = await db.collection('friendRequests')
        .where('fromUid', '==', currentUser.uid)
        .where('toUid', '==', toUid)
        .get();
    if (!existing.empty) return alert('Ya has enviado una solicitud o ya sois amigos.');

    await db.collection('friendRequests').add({
        fromUid: currentUser.uid,
        fromEmail: currentUser.email,
        toEmail: email,
        toUid: toUid,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('¡Éxito! Solicitud enviada a ' + email);
    document.getElementById('input-nuevo-amigo').value = '';
}

async function aceptarSolicitud(docId) {
    try {
        await db.collection('friendRequests').doc(docId).update({ status: 'accepted' });
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('Error aceptarSolicitud:', e);
        alert('Error al aceptar la solicitud.');
    }
}

async function rechazarSolicitud(docId) {
    if (!confirm("¿Rechazar esta solicitud de amistad?")) return;
    try {
        await db.collection('friendRequests').doc(docId).delete();
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('Error rechazarSolicitud:', e);
        alert('Error al rechazar. Revisa tu conexión.');
    }
}

async function eliminarAmigo(docId) {
    if (!confirm("¿Seguro que deseas eliminar a este usuario? Perderéis el acceso a estadísticas mutuamente.")) return;
    try {
        await db.collection('friendRequests').doc(docId).delete();
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

    const contenido = document.getElementById('amigos-contenido');
    const safeEmail = escapeHtml(email || '');
    contenido.innerHTML = `<p style="color:#888; text-align:center; padding:20px 0;">Analizando telemetría de ${safeEmail}...</p>`;

    try {
        const doc = await db.collection('usersPublic').doc(uid).get();
        if (!doc.exists) {
            contenido.innerHTML = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:10px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button>';
            contenido.innerHTML += '<p style="color:#ff5252;">No se encontraron estadísticas para este usuario.</p>';
            return;
        }

        const data = doc.data() || {};
        const stats = data.stats || {};

        let html = '<button data-action="cargarPanelAmigos" style="background:none;border:none;color:#888;cursor:pointer;margin-bottom:15px;font-size:0.85em;"><i class="fa-solid fa-arrow-left"></i> Volver</button>';
        html += `<div style="font-size:0.95em; color:var(--accent); margin-bottom:14px; font-weight:bold;"><i class="fa-solid fa-user"></i> ${safeEmail}</div>`;

        // CHECK PRIVACIDAD
        if (stats.isPrivate) {
            html += `
            <div style="text-align:center; padding: 20px 0;">
                <i class="fa-solid fa-user-ninja" style="font-size:3em; color:#444; margin-bottom:15px; display:block;"></i>
                <p style="color:#888; font-size:0.9em;">Este usuario ha activado el Modo Fantasma.<br>Sus estadísticas de estudio son privadas.</p>
            </div>`;
            contenido.innerHTML = html;
            return;
        }

        // BADGES GLOBALES (Racha, Pomos, Deuda Total)
        html += `
        <div style="display:flex; gap:10px; margin-bottom:20px;">
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
                html += `<div style="padding:10px 12px; background:#151515; border-radius:6px; margin-bottom:8px; border: 1px solid #222;">
                            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                                <span style="font-size:0.9em; color:#ddd; font-weight:bold;">${nombre}</span>
                                <span style="font-size:0.75em; color:#888;"><i class="fa-solid fa-layer-group"></i> ${Number(item.totalTarjetas || 0)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75em; border-top:1px dashed #2a2a2a; padding-top:6px;">
                                <span style="color:#f44336;" title="Tarjetas Pendientes"><i class="fa-solid fa-triangle-exclamation"></i> ${Number(item.pendientesHoy || 0)} atrasadas</span>
                                <span style="color:#256ca5;" title="Deuda FSRS"><i class="fa-solid fa-weight-hanging"></i> ${Number(item.deuda || 0)} deuda</span>
                                <span style="color:#4CAF50;" title="Retención Alta"><i class="fa-solid fa-brain"></i> ${Number(item.dominadas || 0)} dom.</span>
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
    const contenido = document.getElementById('amigos-contenido');
    const asigs = Object.keys(biblioteca);

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
    const CAMPOS_PRIVADOS = ['UltimoRepaso', 'ProximoRepaso', 'EtapaRepaso', 'IndiceGlobal', 'fsrs_state', 'fsrs_stability', 'fsrs_difficulty', 'review_log'];

    const tarjetasLimpias = (biblioteca[nombreAsig] || []).map(t => {
        const copia = { ...t };
        CAMPOS_PRIVADOS.forEach(c => delete copia[c]);
        return copia;
    });

    try {
        await db.collection('sharedSubjects').add({
            fromUid: currentUser.uid,
            fromEmail: currentUser.email,
            toEmail: toEmail,
            subjectName: nombreAsig,
            cards: tarjetasLimpias,
            seen: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`<i class="fa-solid fa-check"></i> "${nombreAsig}" enviada a ${toEmail}.`);
        cargarPanelAmigos();
    } catch(e) {
        Logger.error('compartirAsignatura error:', e);
        alert('Error al compartir. ¿Hay conexión?');
    }
}

async function importarAsignaturaCompartida(docId) {
    try {
        const docSnap = await db.collection('sharedSubjects').doc(docId).get();
        if (!docSnap.exists) return alert('El documento ya no existe.');

        const d = docSnap.data();
        let nombreFinal = d.subjectName;

        if (biblioteca[nombreFinal]) {
            nombreFinal = prompt(`Ya tienes una asignatura llamada "${nombreFinal}". ¿Con qué nombre importarla?`, `${nombreFinal} (compartida)`);
            if (!nombreFinal || !nombreFinal.trim()) return;
            nombreFinal = nombreFinal.trim();
        }

        biblioteca[nombreFinal] = d.cards;
        if (typeof guardarEnLocal === 'function') guardarEnLocal();
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

    // Cerrar modal al hacer click fuera (con guard por si el DOM no está listo)
    document.addEventListener('DOMContentLoaded', function() {
        const modalAmigos = document.getElementById('modal-amigos');
        if (modalAmigos) {
            modalAmigos.addEventListener('click', function(e) {
                if (e.target === this) cerrarModalAmigos();
            });
        }
    });



    /**
     * Extrae los logs pendientes de IndexedDB y los sube a Firestore en un solo Batch.
     * Coste: 1 operación de red independientemente de cuántas tarjetas se hayan repasado.
     */
    async function sincronizarTelemetriaFSRS() {
        // Validar conexión y autenticación
        if (!window.db || !window.currentUser || typeof DB === 'undefined') return;

        try {
            const pendientes = await DB.getUnsyncedRevlogs();
            
            // Si no hay nada que subir, abortamos silenciosamente
            if (!pendientes || pendientes.length === 0) return;

            // Firestore permite hasta 500 operaciones por Batch
            const limite = pendientes.slice(0, 450); 
            
            // Importaciones de Firebase (asegúrate de tenerlas disponibles en tu módulo)
            // import { writeBatch, doc, collection } from "firebase/firestore";
            
            const batch = window.writeBatch ? window.writeBatch(window.db) : window.db.batch(); // Soporte v9/v8
            
            // Ruta: usuarios / {uid} / fsrs_revlogs / {auto_id}
            const basePath = `users/${window.currentUser.uid}/fsrs_revlogs`;

            limite.forEach(log => {
                // Creamos una referencia de documento con ID automático
                const docRef = window.doc ? window.doc(window.collection(window.db, basePath)) : window.db.collection(basePath).doc();
                
                // Subimos el log sin el ID local de IndexedDB y le estampamos la fecha de subida
                const { id, synced, ...cleanLog } = log;
                batch.set(docRef, { ...cleanLog, syncedAt: Date.now() });
            });

            await batch.commit();
            if (typeof Logger !== 'undefined') Logger.info(`Telemetría FSRS: Batch subido con ${limite.length} registros.`);

            // 3. Marcar localmente como sincronizados para no volver a subirlos
            const idsSincronizados = limite.map(l => l.id);
            await DB.markRevlogsAsSynced(idsSincronizados);

        } catch (error) {
            if (typeof Logger !== 'undefined') Logger.error("Fallo crítico en sincronizarTelemetriaFSRS:", error);
        }
    }
