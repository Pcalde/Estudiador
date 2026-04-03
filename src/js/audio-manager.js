// ════════════════════════════════════════════════════════════════
// AUDIO-MANAGER.JS — Capa de Gestión Híbrida de Audio (Reactivo)
// Patrón de diseño: Esclavo de Estado Global (State-driven)
// ════════════════════════════════════════════════════════════════

const AudioManager = (() => {
    let _audioCtx = null;
    let _noiseNode = null;
    let _noiseGain = null;
    let _previewSource = null;  // Para cancelar previews en flight
    
    // Diccionario de definiciones de audios (sin cargar aún)
    const _audioDefinitions = {
        // --- EFECTOS DE SONIDO (SFX) ---
        sfx_campana:  { src: 'assets/audio/campana_notreDame.ogg', loop: false },
        sfx_mario:    { src: 'assets/audio/mario_world_clear.ogg', loop: false },
        sfx_bump:     { src: 'assets/audio/bump_into_wall.ogg', loop: false },
        sfx_custom:   { src: 'assets/audio/trofeo_ps3.ogg', loop: false },
        sfx_estrellita: { src: 'assets/audio/buena.mp3', loop: false },
        sfx_warning:  { src: 'assets/audio/mario_warning.ogg', loop: false },
        sfx_coin:     { src: 'assets/audio/mario_coin.ogg', loop: false },
        sfx_victoryPokebits: { src: 'assets/audio/pokemon_team_victory_bits.ogg', loop: false },
        sfx_victoryPoke: { src: 'assets/audio/victoria_pokemon.ogg', loop: false },

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
    function _preview(trackId, forceCategory = null) {
        if (_previewSource) {
            _previewSource.pause();
            _previewSource.currentTime = 0;
        }
        
        const track = _getOrCreateAudio(trackId);
        if (!track) {
            Logger.warn(`Preview: Track ${trackId} no encontrado`);
            return;
        }
        
        // ARCH: Prioridad a la Categoría Inyectada para evitar colisiones léxicas
        let category = forceCategory;
        
        if (!category) {
            if (trackId.includes('sfx_warning') || trackId.includes('sfx_coin') || trackId.includes('sfx_estrellita')) {
                category = 'reward';
            } else if (trackId.includes('sfx_bump')) {
                category = 'hard';
            } else if (trackId.includes('sfx_campana') || trackId.includes('sfx_mario') || trackId.includes('sfx_custom')) {
                category = 'alarm';
            } else {
                category = 'ambient';
            }
        }
        
        const soundSettings = State.get('soundSettings') || {};
        const settings = soundSettings[category] || { volume: 100, pitch: 0 };
        _applyGainPitch(track, settings.volume, settings.pitch);
        
        _previewSource = track;
        track.currentTime = 0;
        track.play().catch(e => Logger.warn(`Preview error [${trackId}]:`, e));
        Logger.info(`🔊 Preview: ${trackId} [Cat: ${category}] (vol: ${settings.volume}%, pitch: ${settings.pitch})`);
    }

    function _previewLimited(trackId, seconds = 10) {
        if (_previewSource) {
            try { _previewSource.pause(); _previewSource.currentTime = 0; } catch(e) {}
        }
        const track = _getOrCreateAudio(trackId);
        if (!track) { Logger.warn(`Track no encontrado: ${trackId}`); return; }
        let category = 'ambient';
        if (trackId.includes('sfx_')) {
            if (trackId.includes('warning') || trackId.includes('coin') || trackId.includes('estrellita')) category = 'reward';
            else if (trackId.includes('bump')) category = 'hard';
            else category = 'alarm';
        }
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

        // 1.5. FEEDBACK DE DIFICULTAD (Difícil)
        EventBus.on('CARD_RATED_HARD', () => {
            if (State.get('audioMuted')) return;
            const soundSettings = State.get('soundSettings') || {};
            // Fallback seguro por si el State aún no tiene la clave 'hard' inicializada
            const hardSettings = soundSettings.hard || { enabled: false, volume: 100, pitch: 0 };
            if (!hardSettings.enabled) return;
            
            const userPref = State.get('hardTrack') || 'bump';
            const trackKey = 'sfx_' + userPref;
            const trackToPlay = _getOrCreateAudio(trackKey) || _getOrCreateAudio('sfx_bump');
            
            if (trackToPlay) {
                _applyGainPitch(trackToPlay, hardSettings.volume, hardSettings.pitch);
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