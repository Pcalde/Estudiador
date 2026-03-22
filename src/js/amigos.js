// ════════════════════════════════════════════════════════════════
// AMIGOS.JS — Sistema social: amigos, solicitudes y compartir
// Responsabilidad: Firestore + orquestación. Cero DOM directo.
// Cargado después de: firebase.js, ui.js
// ════════════════════════════════════════════════════════════════

const Amigos = (() => {

    const _db   = () => getDb;
    const _user = () => State.get('currentUser');

    // ── Modal ─────────────────────────────────────────────────────

    function abrirModal() {
        if (!_user()) return alert('Debes iniciar sesión para usar esta función.');
        document.getElementById('modal-amigos').classList.remove('hidden');
        cargarPanel();
    }

    function cerrarModal() {
        document.getElementById('modal-amigos').classList.add('hidden');
    }

    // ── Panel principal ───────────────────────────────────────────

    async function cargarPanel() {
        UI.renderCargandoAmigos();
        try {
            const uid   = _user().uid;
            const email = _user().email;

            const [solicitudesSnap, enviadas, recibidas, compartidasSnap] = await Promise.all([
                _db().collection('friendRequests').where('toUid',   '==', uid).where('status', '==', 'pending').get(),
                _db().collection('friendRequests').where('fromUid', '==', uid).where('status', '==', 'accepted').get(),
                _db().collection('friendRequests').where('toUid',   '==', uid).where('status', '==', 'accepted').get(),
                _db().collection('sharedSubjects').where('toEmail', '==', email).where('seen', '==', false).get(),
            ]);

            const amigos = [];
            enviadas.forEach(doc  => { const d = doc.data(); amigos.push({ docId: doc.id, uid: d.toUid,   email: d.toEmail   }); });
            recibidas.forEach(doc => { const d = doc.data(); amigos.push({ docId: doc.id, uid: d.fromUid, email: d.fromEmail }); });

            const solicitudes = [];
            solicitudesSnap.forEach(doc => solicitudes.push({ id: doc.id, fromEmail: doc.data().fromEmail }));

            const compartidas = [];
            compartidasSnap.forEach(doc => {
                const d = doc.data();
                compartidas.push({ id: doc.id, fromEmail: d.fromEmail, subjectName: d.subjectName, cardsCount: d.cards.length });
            });

            UI.renderPanelAmigos({ solicitudes, amigos, compartidas });

        } catch (e) {
            Logger.error('Amigos.cargarPanel:', e);
            UI.renderErrorAmigos();
        }
    }

    // ── Solicitudes ───────────────────────────────────────────────

    async function enviarSolicitud() {
        const user  = _user();
        const email = (document.getElementById('input-nuevo-amigo')?.value || '').trim().toLowerCase();

        if (!email)                 return alert('Escribe un email.');
        if (email === user.email)   return alert('No puedes añadirte a ti mismo.');

        const indexDoc = await _db().collection('emailIndex').doc(email).get();
        if (!indexDoc.exists) return alert(`No se encontró ningún usuario con el correo "${email}".`);

        const toUid = indexDoc.data().uid;
        const existing = await _db().collection('friendRequests')
            .where('fromUid', '==', user.uid).where('toUid', '==', toUid).get();
        if (!existing.empty) return alert('Ya has enviado una solicitud o ya sois amigos.');

        await _db().collection('friendRequests').add({
            fromUid:   user.uid, fromEmail: user.email,
            toEmail:   email,    toUid,
            status:    'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`¡Solicitud enviada a ${email}!`);
        if (document.getElementById('input-nuevo-amigo')) {
            document.getElementById('input-nuevo-amigo').value = '';
        }
    }

    async function aceptarSolicitud(docId) {
        try {
            await _db().collection('friendRequests').doc(docId).update({ status: 'accepted' });
            cargarPanel();
        } catch (e) {
            Logger.error('Amigos.aceptarSolicitud:', e);
            alert('Error al aceptar la solicitud.');
        }
    }

    async function rechazarSolicitud(docId) {
        if (!confirm('¿Rechazar esta solicitud?')) return;
        try {
            await _db().collection('friendRequests').doc(docId).delete();
            cargarPanel();
        } catch (e) {
            Logger.error('Amigos.rechazarSolicitud:', e);
            alert('Error al rechazar.');
        }
    }

    async function eliminarAmigo(docId) {
        if (!confirm('¿Eliminar a este usuario?')) return;
        try {
            await _db().collection('friendRequests').doc(docId).delete();
            cargarPanel();
        } catch (e) {
            Logger.error('Amigos.eliminarAmigo:', e);
            alert('Error al eliminar.');
        }
    }

    // ── Stats de amigo ────────────────────────────────────────────

    async function verStats(uid, email) {
        if (!uid || uid === 'undefined') {
            return alert('Usuario añadido con versión antigua. Elimínalo y vuélvelo a añadir.');
        }
        UI.renderCargandoStatsAmigo(email);
        try {
            const doc = await _db().collection('usersPublic').doc(uid).get();
            if (!doc.exists) { UI.renderErrorStatsAmigo(); return; }
            UI.renderStatsAmigo({ email, stats: (doc.data() || {}).stats || {} });
        } catch (e) {
            Logger.error('Amigos.verStats:', e);
            UI.renderErrorStatsAmigo();
        }
    }

    // ── Compartir asignaturas ─────────────────────────────────────

    function abrirCompartir(friendEmail) {
        const biblioteca  = State.get('biblioteca') || {};
        const asignaturas = Object.keys(biblioteca).map(nombre => ({
            nombre, count: biblioteca[nombre].length
        }));
        UI.renderCompartirAsignatura(friendEmail, asignaturas);
    }

    async function compartir(toEmail, nombreAsig) {
        const CAMPOS_PRIVADOS = [
            'UltimoRepaso', 'ProximoRepaso', 'EtapaRepaso', 'IndiceGlobal',
            'fsrs_state', 'fsrs_stability', 'fsrs_difficulty', 'review_log'
        ];
        const biblioteca = State.get('biblioteca') || {};
        const tarjetasLimpias = (biblioteca[nombreAsig] || []).map(t => {
            const copia = { ...t };
            CAMPOS_PRIVADOS.forEach(c => delete copia[c]);
            return copia;
        });

        try {
            const user = _user();
            await _db().collection('sharedSubjects').add({
                fromUid: user.uid, fromEmail: user.email,
                toEmail, subjectName: nombreAsig,
                cards: tarjetasLimpias,
                seen: false,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`"${nombreAsig}" enviada a ${toEmail}.`);
            cargarPanel();
        } catch (e) {
            Logger.error('Amigos.compartir:', e);
            alert('Error al compartir. ¿Hay conexión?');
        }
    }

    async function importarCompartida(docId) {
        try {
            const db      = _db();
            const docSnap = await db.collection('sharedSubjects').doc(docId).get();
            if (!docSnap.exists) return alert('El documento ya no existe.');

            const d         = docSnap.data();
            let nombreFinal = d.subjectName;
            const biblioteca = State.get('biblioteca') || {};

            if (biblioteca[nombreFinal]) {
                nombreFinal = prompt(
                    `Ya tienes "${nombreFinal}". ¿Con qué nombre importarla?`,
                    `${nombreFinal} (compartida)`
                );
                if (!nombreFinal?.trim()) return;
                nombreFinal = nombreFinal.trim();
            }

            State.batch(() => {
                const bib = State.get('biblioteca');
                bib[nombreFinal] = d.cards;
                State.set('biblioteca', bib);
            });
            EventBus.emit('DATA_REQUIRES_SAVE');

            if (typeof actualizarMenuLateral === 'function') actualizarMenuLateral();
            if (typeof window.sincronizar    === 'function') window.sincronizar();

            await db.collection('sharedSubjects').doc(docId).update({ seen: true });
            alert(`¡Éxito! "${nombreFinal}" importada.`);
            cargarPanel();
        } catch (e) {
            Logger.error('Amigos.importarCompartida:', e);
            alert('Error al importar la asignatura.');
        }
    }

    // ── Init ──────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        const modal = document.getElementById('modal-amigos');
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });
    });

    return {
        abrirModal, cerrarModal, cargarPanel,
        enviarSolicitud, aceptarSolicitud, rechazarSolicitud, eliminarAmigo,
        verStats, abrirCompartir, compartir, importarCompartida
    };
})();

// ── Proxies globales (compatibilidad con app.js) ──────────────
window.abrirModalAmigos             = () => Amigos.abrirModal();
window.cerrarModalAmigos            = () => Amigos.cerrarModal();
window.cargarPanelAmigos            = () => Amigos.cargarPanel();
window.enviarSolicitudAmistad       = () => Amigos.enviarSolicitud();
window.aceptarSolicitud             = (id) => Amigos.aceptarSolicitud(id);
window.rechazarSolicitud            = (id) => Amigos.rechazarSolicitud(id);
window.eliminarAmigo                = (id) => Amigos.eliminarAmigo(id);
window.verStatsAmigo                = (uid, email) => Amigos.verStats(uid, email);
window.abrirCompartirAsignatura     = (email) => Amigos.abrirCompartir(email);
window.compartirAsignatura          = (email, asig) => Amigos.compartir(email, asig);
window.importarAsignaturaCompartida = (id) => Amigos.importarCompartida(id);

CommandRegistry.register('importarAsignaturaCompartida', ({id})           => Amigos.importarCompartida(id));
CommandRegistry.register('aceptarSolicitud',             ({id})           => Amigos.aceptarSolicitud(id));
CommandRegistry.register('verStatsAmigo',                ({uid, email})   => Amigos.verStats(uid, email));
CommandRegistry.register('abrirCompartirAsignatura',     ({email})        => Amigos.abrirCompartir(email));
CommandRegistry.register('enviarSolicitudAmistad',       ()               => Amigos.enviarSolicitud());
CommandRegistry.register('compartirAsignatura',          ({email, asig})  => Amigos.compartir(email, asig));
CommandRegistry.register('rechazarSolicitud',            ({id})           => Amigos.rechazarSolicitud(id));
CommandRegistry.register('eliminarAmigo',                ({id})           => Amigos.eliminarAmigo(id));
CommandRegistry.register('cargarPanelAmigos',            ()               => Amigos.cargarPanel());