// ════════════════════════════════════════════════════════════════
// AUDIO-MANAGER.JS — Capa de Gestión Híbrida de Audio (Reactivo)
// Patrón de diseño: Esclavo de Estado Global (State-driven)
// ════════════════════════════════════════════════════════════════

const AudioManager = (() => {
    let _audioCtx = null;
    let _noiseNode = null;
    let _noiseGain = null;
    let _previewSource = null;  // Para cancelar previews en flight
    const ALARMA_BASE64 = [
        "data:audio/mp3;base64,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"
    ].join('');
    
    // Diccionario de definiciones de audios (sin cargar aún)
    const _audioDefinitions = {
        // --- EFECTOS DE SONIDO (SFX) ---
        sfx_campana:  { src: 'assets/audio/campana_notreDame.ogg', loop: false },
        sfx_mario:    { src: 'assets/audio/mario_world_clear.ogg', loop: false },
        sfx_custom:   { src: ALARMA_BASE64, loop: false },
        sfx_estrellita: { src: 'assets/audio/buena.mp3', loop: false },
        sfx_warning:  { src: 'assets/audio/mario_warning.ogg', loop: false },
        sfx_coin:     { src: 'assets/audio/mario_coin.ogg', loop: false },

        // --- AMBIENTES DE FONDO ---
        Buceo:         { src: 'assets/audio/abyss_ambience.ogg', loop: true },
        nocheCampera:  { src: 'assets/audio/night.ogg', loop: true },
        vagon:         { src: 'assets/audio/tren_con_gente.ogg', loop: true },
        rail:          { src: 'assets/audio/interior_vagon.ogg', loop: true},  
        ascuas:        { src: 'assets/audio/fire_crackling.ogg', loop: true },
        pajaritos:     { src: 'assets/audio/pajaros_cantando.ogg', loop: true },
        olas:          { src: 'assets/audio/olas_oceanicas.ogg', loop: true },
        cafeteria:     { src: 'assets/audio/cafeteria.ogg', loop: true },
        lluviaCochera: { src: 'assets/audio/rain_inside_car.ogg', loop: true },
    };
    
    // Caché de audios cargados
    const _staticTracks = {};
    
    // Lazy loader function
    function _getOrCreateAudio(trackId) {
        if (_staticTracks[trackId]) {
            return _staticTracks[trackId];
        }
        
        const def = _audioDefinitions[trackId];
        if (!def) {
            const err = `Audio no definido: ${trackId}`;
            if (typeof Logger !== 'undefined') Logger.warn(err);
            if (typeof Toast !== 'undefined') Toast.show(err, 'error');
            return null;
        }
        
        try {
            const audio = new Audio(def.src);
            audio.loop = def.loop;
            audio.preload = 'auto';
            _staticTracks[trackId] = audio;
            
            // Listener para errores de carga
            audio.addEventListener('error', () => {
                const errMsg = `Fallo al cargar audio: ${trackId}`;
                if (typeof Logger !== 'undefined') Logger.warn(errMsg);
                if (typeof Toast !== 'undefined') Toast.show(errMsg, 'error');
            });
            
            return audio;
        } catch (e) {
            const errMsg = `Error creando audio ${trackId}: ${e.message}`;
            if (typeof Logger !== 'undefined') Logger.error(errMsg);
            if (typeof Toast !== 'undefined') Toast.show(errMsg, 'error');
            return null;
        }
    }

    // ─── MOTOR PROCEDIMENTAL (RUIDO MARRÓN) ──────────────────────────
    function _initAudioContext() {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function _startBrownianNoise() {
        _initAudioContext();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        if (_noiseNode) return;

        const bufferSize = 2 * _audioCtx.sampleRate;
        const noiseBuffer = _audioCtx.createBuffer(1, bufferSize, _audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + 0.02 * white) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        _noiseNode = _audioCtx.createBufferSource();
        _noiseNode.buffer = noiseBuffer;
        _noiseNode.loop = true;

        _noiseGain = _audioCtx.createGain();
        
        // Aplicar volumen del usuario a brownian noise
        const ambientSettings = State.get('soundSettings').ambient || {};
        const volumeNormalized = Math.max(0, Math.min(1, (ambientSettings.volume || 80) / 100));
        _noiseGain.gain.value = volumeNormalized * 0.3; // 0.3 es el nivel base para brownian

        _noiseNode.connect(_noiseGain);
        _noiseGain.connect(_audioCtx.destination);
        _noiseNode.start();
    }

    function _stopBrownianNoise() {
        if (_noiseNode) {
            _noiseNode.stop();
            _noiseNode.disconnect();
            _noiseNode = null;
        }
    }

    // ─── CONTROL DE VOLUMEN Y PITCH ─────────────────────────────
    function _applyGainPitch(track, volume, pitch) {
        if (!track || volume == null) return track;
        
        try {
            // Aplicar volumen (0-100 → 0-1) usando propiedad nativa
            track.volume = Math.max(0, Math.min(1, volume / 100));
            
            // Aplicar pitch shift usando playbackRate (-12 a +12 semitones)
            if (pitch !== 0) {
                // Convertir semitones a factor multiplicativo: 2^(semitones/12)
                track.playbackRate = Math.pow(2, pitch / 12);
            } else {
                track.playbackRate = 1.0;
            }
        } catch (e) {
            Logger.warn(`Error aplicando gain/pitch:`, e);
        }
        
        return track;
    }

    // ─── PREVIEW DE AUDIO ───────────────────────────────────────
    function _preview(trackId) {
        // Cancelar preview anterior si está en curso
        if (_previewSource) {
            _previewSource.pause();
            _previewSource.currentTime = 0;
        }
        
        const track = _getOrCreateAudio(trackId);
        if (!track) {
            Logger.warn(`Preview: Track ${trackId} no encontrado`);
            return;
        }
        
        // Determinar categoría basada en nombre
        let category = 'alarm';
        if (trackId.includes('sfx_warning') || trackId.includes('sfx_coin') || trackId.includes('sfx_estrellita')) {
            category = 'reward';
        } else if (trackId.includes('sfx_campana') || trackId.includes('sfx_mario') || trackId.includes('sfx_custom')) {
            category = 'alarm';
        } else {
            category = 'ambient';
        }
        
        const settings = State.get('soundSettings')[category] || { volume: 100, pitch: 0 };
        _applyGainPitch(track, settings.volume, settings.pitch);
        
        _previewSource = track;
        track.currentTime = 0;
        track.play().catch(e => Logger.warn(`Preview error [${trackId}]:`, e));
        Logger.info(`🔊 Preview: ${trackId} (vol: ${settings.volume}%, pitch: ${settings.pitch})`);
    }

    function _previewLimited(trackId, seconds = 10) {
        if (_previewSource) {
            try { _previewSource.pause(); _previewSource.currentTime = 0; } catch(e) {}
        }
        const track = _getOrCreateAudio(trackId);
        if (!track) { Logger.warn(`Track no encontrado: ${trackId}`); return; }
        let category = 'ambient';
        if (trackId.includes('sfx_')) category = trackId.includes('warning') ? 'reward' : 'alarm';
        const settings = State.get('soundSettings')[category] || { volume: 100, pitch: 0 };
        _applyGainPitch(track, settings.volume, settings.pitch);
        _previewSource = track;
        track.currentTime = 0;
        track.play().catch(e => Logger.warn(`Preview error [${trackId}]:`, e));
        Logger.info(`🔊 Preview (${seconds}s): ${trackId}`);
        setTimeout(() => { if (_previewSource === track) { track.pause(); track.currentTime = 0; _previewSource = null; } }, seconds * 1000);
    }

    // ─── ORQUESTADOR REACTIVO ──────────────────────────────────────
    function _playAmbient() {
        const ambientSettings = State.get('soundSettings').ambient || {};
        
        // Solo reproducir si está habilitado (continuo o no, eso lo decide el caller)
        if (!ambientSettings.enabled) return;
        
        const trackId = State.get('ambientTrack') || 'brownian'; // Fallback a marrón
        
        if (trackId === 'brownian') {
            _startBrownianNoise();
        } else {
            const track = _getOrCreateAudio(trackId);
            if (track) {
                // Aplicar volumen y pitch del usuario
                _applyGainPitch(track, ambientSettings.volume, ambientSettings.pitch);
                track.play().catch(e => Logger.warn("Autoplay bloqueado para", trackId, e));
            }
        }
    }

    function _stopAmbient() {
        _stopBrownianNoise();
        // Detener dinámicamente cualquier ambiente en reproducción
        Object.keys(_staticTracks).forEach(id => {
            if (!id.startsWith('sfx_')) {
                _staticTracks[id].pause();
            }
        });
    }

    function _updateAmbientGain() {
        // Actualizar volumen/pitch de brownnoise SIN reiniciar
        if (_noiseGain) {
            const ambientSettings = State.get('soundSettings').ambient || {};
            const volumeNormalized = Math.max(0, Math.min(1, (ambientSettings.volume || 80) / 100));
            _noiseGain.gain.value = volumeNormalized * 0.3;
        }
        // También actualizar tracks que estén reproduciendo
        const trackId = State.get('ambientTrack') || 'brownian';
        if (trackId !== 'brownian') {
            const track = _getOrCreateAudio(trackId);
            if (track && !track.paused) {
                const ambientSettings = State.get('soundSettings').ambient || {};
                _applyGainPitch(track, ambientSettings.volume, ambientSettings.pitch);
            }
        }
    }

    function _toggleAmbientSoundImmediate() {
        const ambientSettings = State.get('soundSettings').ambient || {};
        const isCurrentlyContinuous = ambientSettings.continuous;
        
        // Togglear el boolean
        const newContinuous = !isCurrentlyContinuous;
        State.set('soundSettings', {
            ...State.get('soundSettings'),
            ambient: {...ambientSettings, continuous: newContinuous}
        });
        
        // Inmediatamente reproducir o parar
        if (newContinuous && ambientSettings.enabled && !State.get('audioMuted')) {
            _playAmbient();
        } else {
            _stopAmbient();
        }
    }

    function init() {
        if (typeof EventBus === 'undefined') return console.error("AudioManager requiere EventBus.");
        if (typeof State === 'undefined') return console.error("AudioManager requiere State.");
        if (typeof Logger === 'undefined') return console.error("AudioManager requiere Logger.");

        // FIX: Reproducción a prueba de fallos asíncronos (Evita la Race Condition)
        const _safePlay = (track, trackName = 'unknown') => {
            if (!track) {
                Logger.warn(`Audio track ${trackName} is undefined`);
                return;
            }
            const doPlay = () => {
                track.currentTime = 0;
                track.play()
                    .then(() => Logger.info(`▶ Reproduciendo: ${trackName}`))
                    .catch(e => Logger.warn(`Autoplay bloqueado [${trackName}]:`, e));
            };
            
            // readyState < 2 significa que el navegador limpió el buffer (HAVE_NOTHING o HAVE_METADATA)
            if (track.readyState < 2) {
                track.load();
                track.addEventListener('canplaythrough', doPlay, { once: true });
            } else {
                doPlay();
            }
        };

        // 1. RECOMPENSAS (Búho restaurado)
        EventBus.on('CARD_RATED_EASY', () => {
            if (State.get('audioMuted')) return;
            const rewardSettings = State.get('soundSettings').reward;
            if (!rewardSettings.enabled) return;
            
            const userPref = State.get('rewardTrack') || 'warning';
            const trackKey = 'sfx_' + userPref;
            const trackToPlay = _getOrCreateAudio(trackKey) || _getOrCreateAudio('sfx_warning') || _getOrCreateAudio('sfx_coin');
            
            if (trackToPlay) {
                _applyGainPitch(trackToPlay, rewardSettings.volume, rewardSettings.pitch);
                _safePlay(trackToPlay, trackKey);
            }
        });

        // 2. ALARMA POMODORO
        EventBus.on('pomodoro:finished', () => {
            if (State.get('audioMuted')) return;
            const alarmSettings = State.get('soundSettings').alarm;
            if (!alarmSettings.enabled) return;
            
            const userPref = State.get('alarmTrack') || 'custom';
            const trackKey = 'sfx_' + userPref;
            const trackToPlay = _getOrCreateAudio(trackKey) || _getOrCreateAudio('sfx_custom') || _getOrCreateAudio('sfx_mario');
            
            if (trackToPlay) {
                _applyGainPitch(trackToPlay, alarmSettings.volume, alarmSettings.pitch);
                _safePlay(trackToPlay, trackKey);
            }
        });

        // Pre-cleanup: Remover listeners duplicados si init() se llama múltiples veces
        // (No hay off() directo en EventBus simple, pero esto evita acumulación)
        
        // 3. REACTIVIDAD DE ESTADO (Ambientes y Descansos)
        EventBus.on('STATE_CHANGED', (data) => {
            const keys = data.keys;
            
            // Si SOLO cambió soundSettings: Intentar actualizar dinámicamente si está reproduciendo
            if (keys.length === 1 && keys[0] === 'soundSettings') {
                // Si brownian o un ambient track está reproduciendo, solo actualizar gain/pitch
                if (_noiseGain) {
                    _updateAmbientGain();
                    return;
                }
                // Si hay un track HTML reproduciendo, también actualizar
                const trackId = State.get('ambientTrack') || 'brownian';
                if (trackId !== 'brownian' && _staticTracks[trackId] && !_staticTracks[trackId].paused) {
                    _updateAmbientGain();
                    return;
                }
            }
            
            // Si cambió isRunning, currentMode, ambientTrack, audioMuted: Reiniciar
            if (keys.includes('isRunning') || keys.includes('currentMode') || keys.includes('ambientTrack') || keys.includes('audioMuted') || keys.includes('soundSettings')) {
                _stopAmbient();
                const relaxTrack = _staticTracks.relax;
                if (relaxTrack) relaxTrack.pause();
                if (State.get('audioMuted')) return;

                const isRunning = State.get('isRunning');
                const mode = State.get('currentMode');
                const ambientSettings = State.get('soundSettings').ambient || {};
                
                if (isRunning) {
                    if (mode === 'work') {
                        _playAmbient();
                    } else if (relaxTrack) {
                        _safePlay(relaxTrack);
                    }
                } else {
                    // Si NO hay pomodoro activo: reproducir ambiente solo si continuous === true
                    if (ambientSettings.continuous && ambientSettings.enabled) {
                        _playAmbient();
                    }
                }
            }
        });

        Logger.info("AudioManager Reactivo inicializado. Arquitectura asíncrona estabilizada.");
    }

    return { 
        init,
        preview: _preview,
        previewLimited: _previewLimited,
        toggleAmbientSound: _toggleAmbientSoundImmediate
    };
})();