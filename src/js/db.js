// ════════════════════════════════════════════════════════════════
// DB.JS — Capa de persistencia asíncrona (IndexedDB)
// Arquitectura Local-First para telemetría masiva y objetos pesados.
// ════════════════════════════════════════════════════════════════

const DB = (() => {
    const DB_NAME = 'EstudiadorProDB';
    const DB_VERSION = 1;
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

    return { 
        init, 
        addRevlog, 
        getUnsyncedRevlogs, 
        markRevlogsAsSynced, 
        setVar, 
        getVar 
    };
})();