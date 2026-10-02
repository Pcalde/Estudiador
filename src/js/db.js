// ════════════════════════════════════════════════════════════════
// DB.JS — Capa de persistencia asíncrona (IndexedDB)
// Arquitectura Local-First para telemetría masiva y objetos pesados.
// ════════════════════════════════════════════════════════════════

const DB = (() => {
    const DB_NAME = 'EstudiadorProDB';
    // v2: almacén 'media' para blobs de audio/MIDI (tarjetas tipo 'musica')
    const DB_VERSION = 2;
    let dbInstance = null;

    // 1. Inicialización y control de Esquema
    const init = () => new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            Logger.info("DB: Construyendo esquema versión " + DB_VERSION);
            
            // Almacén 1: Telemetría de Repasos (FSRS Revlog)
            if (!db.objectStoreNames.contains('fsrs_logs')) {
                // keyPath 'id' autoincremental, no muta la tarjeta
                const logStore = db.createObjectStore('fsrs_logs', { keyPath: 'id', autoIncrement: true });
                logStore.createIndex('cardId', 'cardId', { unique: false });
                logStore.createIndex('synced', 'synced', { unique: false }); // 0 = Pendiente, 1 = Subido a Firebase
                logStore.createIndex('ts', 'ts', { unique: false });
            }

            // Almacén 2: Key-Value Genérico (Para futura migración de localStorage)
            if (!db.objectStoreNames.contains('keyval')) {
                db.createObjectStore('keyval', { keyPath: 'key' });
            }

            // Almacén 3: Media binaria (.mid, .pdf, imágenes…) indexada por id
            if (!db.objectStoreNames.contains('media')) {
                db.createObjectStore('media', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };

        request.onerror = (e) => {
            Logger.error("DB: Error crítico inicializando IndexedDB", e.target.error);
            reject(e.target.error);
        };
    });

    // 2. Operaciones FSRS Revlog
    const addRevlog = async (logEntry) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fsrs_logs', 'readwrite');
            const store = tx.objectStore('fsrs_logs');
            
            // Forzamos synced: 0 por defecto
            const entry = { ...logEntry, synced: 0 };
            const req = store.add(entry);
            
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    };

    const getUnsyncedRevlogs = async () => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fsrs_logs', 'readonly');
            const store = tx.objectStore('fsrs_logs');
            const index = store.index('synced');
            const req = index.getAll(IDBKeyRange.only(0));
            
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    };

    const markRevlogsAsSynced = async (idsArray) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fsrs_logs', 'readwrite');
            const store = tx.objectStore('fsrs_logs');
            
            idsArray.forEach(id => {
                const req = store.get(id);
                req.onsuccess = () => {
                    const data = req.result;
                    if (data) {
                        data.synced = 1;
                        store.put(data);
                    }
                };
            });
            
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    };

    // 3. Operaciones Key-Value (Preparación para migraciones)
    const setVar = async (key, value) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keyval', 'readwrite');
            tx.objectStore('keyval').put({ key, value });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    };

    const getVar = async (key) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keyval', 'readonly');
            const req = tx.objectStore('keyval').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = (e) => reject(e.target.error);
        });
    };

    const getAll = async (storeName) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    };

    // 4. Operaciones Media (blobs .mid / audio para tarjetas tipo 'musica')
    const putMedia = async ({ id, blob, nombre = '', tipo = '' }) => {
        if (!id) throw new Error('putMedia: falta id');
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media', 'readwrite');
            tx.objectStore('media').put({ id, blob, nombre, tipo, ts: Date.now() });
            tx.oncomplete = () => resolve(id);
            tx.onerror = (e) => reject(e.target.error);
        });
    };

    const getMedia = async (id) => {
        if (!id) return null;
        try {
            const db = await init();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('media', 'readonly');
                const req = tx.objectStore('media').get(id);
                req.onsuccess = () => resolve(req.result ? req.result.blob : null);
                req.onerror = (e) => reject(e.target.error);
            });
        } catch (e) {
            Logger.error('DB.getMedia:', e);
            return null;
        }
    };

    const deleteMedia = async (id) => {
        const db = await init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media', 'readwrite');
            tx.objectStore('media').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    };

    return {
        init, addRevlog, getUnsyncedRevlogs, markRevlogsAsSynced, setVar, getVar,
        getAll, putMedia, getMedia, deleteMedia
    };
})();
