/**
 * AudioService - SAJAUX Tactical System
 * Maneja la síntesis nativa de sirenas y balizas vía Web Audio API (Modo Studio HD) y
 * la grabación de notas de voz PTT con filtros DSP y sistema de "ducking" (atenuación automática).
 */

class AudioService {
  constructor() {
    this.audioCtx = null;
    this.activeOscillators = [];
    this.activeGainNodes = [];
    this.alarmInterval = null;
    this.isPlaying = false;

    // Grabación de voz PTT
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.mediaStream = null;
    this.rawMicStream = null;
    this.recordingStartTime = null;
  }

  /**
   * Inicializa AudioContext ante la primera acción del usuario para cumplir
   * con las políticas de auto-reproducción de navegadores móviles.
   */
  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Detiene inmediatamente cualquier baliza o sirena en curso.
   */
  _clearActiveNodes() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }

    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.activeGainNodes.forEach((gain) => {
        try {
          if (gain.gain && typeof gain.gain.cancelScheduledValues === 'function') {
            gain.gain.cancelScheduledValues(now);
          }
          if (gain.gain) {
            gain.gain.setValueAtTime(0, now);
          }
          gain.disconnect();
        } catch (e) {}
      });
    }
    this.activeGainNodes = [];

    this.activeOscillators.forEach((osc) => {
      try {
        if (osc.frequency && typeof osc.frequency.cancelScheduledValues === 'function' && this.audioCtx) {
          osc.frequency.cancelScheduledValues(this.audioCtx.currentTime);
        }
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    this.activeOscillators = [];
  }

  stopAlarm() {
    this.isPlaying = false;
    this._clearActiveNodes();

    // Pausar elementos HTML5 por si hubieran audios en curso
    try {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach(a => { a.pause(); a.currentTime = 0; });
    } catch(e) {}

    if (this.audioCtx && this.audioCtx.state === 'running') {
      try {
        this.audioCtx.suspend();
      } catch (e) {}
    }
  }

  /**
   * Reproduce la alarma sonora de alta fidelidad utilizando modulación continua nativa por LFO (Hardware C++ del navegador).
   * Elimina el uso de temporizadores JavaScript en bucle, evitando distorsiones y logrando un corte inmediato.
   * @param {'colaboracion'|'cooperacion'|'guardia'} type
   */
  playAlarm(type) {
    this._clearActiveNodes();
    this.initContext();
    if (!this.audioCtx) return;

    this.isPlaying = true;

    // Filtro pasa-bajos maestro con resonancia sutil (Q=2.2) para emular altavoces de consola táctica y evitar saturación digital
    const masterFilter = this.audioCtx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.setValueAtTime(3400, this.audioCtx.currentTime);
    masterFilter.Q.setValueAtTime(2.2, this.audioCtx.currentTime);
    masterFilter.connect(this.audioCtx.destination);

    // Nodo de ganancia maestro del ciclo
    const masterGain = this.audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
    masterGain.connect(masterFilter);
    this.activeGainNodes.push(masterGain);

    if (type === 'cooperacion') {
      // 🔴 COOPERACIÓN URGENTE (Apoyo Policial Inmediato / Riesgo Vital / 10-99)
      // Perfil Táctico: "C4i Command Piercing Warble & Digital Strobe Beacon"
      // Barrido exponencial hiper-rápido (6.8 Hz) + Pulso estroboscópico de advertencia + Sub-bajo
      const osc1 = this.audioCtx.createOscillator(); // Sawtooth Warble principal
      const osc2 = this.audioCtx.createOscillator(); // Sawtooth Detuned (+15 cents) para cuerpo unísono
      const oscStrobe = this.audioCtx.createOscillator(); // Digital Strobe Pulse (1650 Hz @ 13.6 Hz)
      const oscSub = this.audioCtx.createOscillator();    // Sub-bajo táctico
      const lfo = this.audioCtx.createOscillator();
      const lfoGain1 = this.audioCtx.createGain();
      const lfoGain2 = this.audioCtx.createGain();
      const lfoGainSub = this.audioCtx.createGain();
      const lfoStrobe = this.audioCtx.createOscillator();
      const strobeGate = this.audioCtx.createGain();

      // Osciladores principales
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1575, this.audioCtx.currentTime); // Centro entre 850Hz y 2300Hz

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(1590, this.audioCtx.currentTime);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(787.5, this.audioCtx.currentTime); // 0.5x del principal

      oscStrobe.type = 'square';
      oscStrobe.frequency.setValueAtTime(1650, this.audioCtx.currentTime);

      // LFO Warble de máxima urgencia: 6.8 barridos por segundo (725 Hz de excursión)
      lfo.type = 'triangle';
      lfo.frequency.setValueAtTime(6.8, this.audioCtx.currentTime);
      lfoGain1.gain.setValueAtTime(725, this.audioCtx.currentTime);
      lfoGain2.gain.setValueAtTime(730, this.audioCtx.currentTime);
      lfoGainSub.gain.setValueAtTime(362.5, this.audioCtx.currentTime);

      lfo.connect(lfoGain1);
      lfoGain1.connect(osc1.frequency);

      lfo.connect(lfoGain2);
      lfoGain2.connect(osc2.frequency);

      lfo.connect(lfoGainSub);
      lfoGainSub.connect(oscSub.frequency);

      // LFO Strobe de advertencia digital (13.6 Hz, exactamente el doble del warble)
      lfoStrobe.type = 'square';
      lfoStrobe.frequency.setValueAtTime(13.6, this.audioCtx.currentTime);
      strobeGate.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
      lfoStrobe.connect(strobeGate.gain);
      oscStrobe.connect(strobeGate);

      const gain1 = this.audioCtx.createGain();
      const gain2 = this.audioCtx.createGain();
      const gainSub = this.audioCtx.createGain();
      gain1.gain.setValueAtTime(0.38, this.audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
      gainSub.gain.setValueAtTime(0.42, this.audioCtx.currentTime);

      osc1.connect(gain1);
      osc2.connect(gain2);
      oscSub.connect(gainSub);

      gain1.connect(masterGain);
      gain2.connect(masterGain);
      gainSub.connect(masterGain);
      strobeGate.connect(masterGain);

      osc1.start();
      osc2.start();
      oscSub.start();
      oscStrobe.start();
      lfo.start();
      lfoStrobe.start();

      this.activeOscillators.push(osc1, osc2, oscSub, oscStrobe, lfo, lfoStrobe);
      this.activeGainNodes.push(lfoGain1, lfoGain2, lfoGainSub, strobeGate, gain1, gain2, gainSub);

    } else if (type === 'colaboracion') {
      // 🟡 COLABORACIÓN POLICIAL (Apoyo en Ruta / Procedimiento de Cobertura)
      // Perfil Táctico: "Tactical Priority Intercept Cadence & Radar Sweep"
      // Barrido de comando autoritario (1.25 Hz) interbloqueado con bip de radar táctico en tránsito
      const oscSweep = this.audioCtx.createOscillator();
      const oscSub = this.audioCtx.createOscillator();
      const oscRadar = this.audioCtx.createOscillator(); // Bip de radar táctico en ruta
      const lfoSweep = this.audioCtx.createOscillator();
      const lfoSweepGain = this.audioCtx.createGain();
      const lfoRadar = this.audioCtx.createOscillator();
      const radarGate = this.audioCtx.createGain();

      oscSweep.type = 'sawtooth';
      oscSweep.frequency.setValueAtTime(935, this.audioCtx.currentTime); // Centro entre 620Hz y 1250Hz

      oscSub.type = 'triangle';
      oscSub.frequency.setValueAtTime(467.5, this.audioCtx.currentTime);

      oscRadar.type = 'square';
      oscRadar.frequency.setValueAtTime(980, this.audioCtx.currentTime);

      // LFO Sweep de cadencia operativa: 1.25 Hz (~0.8s por ciclo)
      lfoSweep.type = 'triangle';
      lfoSweep.frequency.setValueAtTime(1.25, this.audioCtx.currentTime);
      lfoSweepGain.gain.setValueAtTime(315, this.audioCtx.currentTime);

      lfoSweep.connect(lfoSweepGain);
      lfoSweepGain.connect(oscSweep.frequency);

      const lfoSubGain = this.audioCtx.createGain();
      lfoSubGain.gain.setValueAtTime(157.5, this.audioCtx.currentTime);
      lfoSweep.connect(lfoSubGain);
      lfoSubGain.connect(oscSub.frequency);

      // LFO Radar (2.5 Hz para marcar el paso táctico de patrulla en desplazamiento)
      lfoRadar.type = 'square';
      lfoRadar.frequency.setValueAtTime(2.5, this.audioCtx.currentTime);
      radarGate.gain.setValueAtTime(0.16, this.audioCtx.currentTime);
      lfoRadar.connect(radarGate.gain);
      oscRadar.connect(radarGate);

      const gainSweep = this.audioCtx.createGain();
      const gainSub = this.audioCtx.createGain();
      gainSweep.gain.setValueAtTime(0.45, this.audioCtx.currentTime);
      gainSub.gain.setValueAtTime(0.40, this.audioCtx.currentTime);

      oscSweep.connect(gainSweep);
      oscSub.connect(gainSub);

      gainSweep.connect(masterGain);
      gainSub.connect(masterGain);
      radarGate.connect(masterGain);

      oscSweep.start();
      oscSub.start();
      oscRadar.start();
      lfoSweep.start();
      lfoRadar.start();

      this.activeOscillators.push(oscSweep, oscSub, oscRadar, lfoSweep, lfoRadar);
      this.activeGainNodes.push(lfoSweepGain, lfoSubGain, radarGate, gainSweep, gainSub);

    } else if (type === 'guardia') {
      // 🔵 COOPERACIÓN SERVICIO DE GUARDIA (Apoyo en Cuartel / Dependencia Policial)
      // Perfil Táctico: "HQ Tactical Facility Klaxon & Station Alarm"
      // Tono bitonal percusivo rápido y penetrante para alerta en cuarteles (1000 Hz / 750 Hz)
      const oscKlaxon = this.audioCtx.createOscillator();
      const oscChime = this.audioCtx.createOscillator(); // Armónico metálico de campana de cuartel
      const oscBase = this.audioCtx.createOscillator();  // Hum de base táctica
      const lfo = this.audioCtx.createOscillator();
      const lfoGainKlaxon = this.audioCtx.createGain();
      const lfoGainChime = this.audioCtx.createGain();

      oscKlaxon.type = 'sawtooth';
      oscKlaxon.frequency.setValueAtTime(875, this.audioCtx.currentTime); // Centro entre 1000Hz y 750Hz

      oscChime.type = 'sine';
      oscChime.frequency.setValueAtTime(1312.5, this.audioCtx.currentTime); // Quinta armónica por encima

      oscBase.type = 'sine';
      oscBase.frequency.setValueAtTime(375, this.audioCtx.currentTime); // Sub-armónico de presencia

      // LFO Klaxon de alta urgencia en cuartel: alternancia limpia cada ~156 ms (3.2 Hz)
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(3.2, this.audioCtx.currentTime);
      lfoGainKlaxon.gain.setValueAtTime(125, this.audioCtx.currentTime); // +125 = 1000Hz, -125 = 750Hz
      lfoGainChime.gain.setValueAtTime(187.5, this.audioCtx.currentTime);

      lfo.connect(lfoGainKlaxon);
      lfoGainKlaxon.connect(oscKlaxon.frequency);

      lfo.connect(lfoGainChime);
      lfoGainChime.connect(oscChime.frequency);

      const gainKlaxon = this.audioCtx.createGain();
      const gainChime = this.audioCtx.createGain();
      const gainBase = this.audioCtx.createGain();
      gainKlaxon.gain.setValueAtTime(0.42, this.audioCtx.currentTime);
      gainChime.gain.setValueAtTime(0.28, this.audioCtx.currentTime);
      gainBase.gain.setValueAtTime(0.35, this.audioCtx.currentTime);

      oscKlaxon.connect(gainKlaxon);
      oscChime.connect(gainChime);
      oscBase.connect(gainBase);

      gainKlaxon.connect(masterGain);
      gainChime.connect(masterGain);
      gainBase.connect(masterGain);

      oscKlaxon.start();
      oscChime.start();
      oscBase.start();
      lfo.start();

      this.activeOscillators.push(oscKlaxon, oscChime, oscBase, lfo);
      this.activeGainNodes.push(lfoGainKlaxon, lfoGainChime, gainKlaxon, gainChime, gainBase);
    }
  }

  /**
   * Reproduce el efecto digital de confirmación táctica (Motorola APX Roger Beep / Command Chirp).
   * Ráfaga bitonal corta percusiva de alta fidelidad (1450Hz -> 1850Hz con caída exponencial).
   */
  playTacticalClick() {
    this.initContext();
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      // Tono 1: Ataque percusivo inicial (1450 Hz por 25 ms)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1450, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.025);

      // Tono 2: Confirmación ascendente (1850 Hz por 35 ms)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1850, now + 0.022);
      gain2.gain.setValueAtTime(0.14, now + 0.022);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.058);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.022);
      osc2.stop(now + 0.058);
    } catch (e) {}
  }

  /**
   * Atenúa o silencia el volumen del tono policial de fondo (Ducking) cuando se reproduce una nota de voz entrante.
   * @param {boolean} shouldDuck true para bajar volumen de sirena al mínimo (0.5%), false para restaurar (35%)
   */
  duckAlarm(shouldDuck = true) {
    if (!this.audioCtx || !this.isPlaying) return;
    const now = this.audioCtx.currentTime;
    // 0.005 (0.5%) de volumen durante la voz para que el receptor escuche SOLO LA VOZ pura y nítida
    const targetGain = shouldDuck ? 0.005 : 0.35;
    this.activeGainNodes.forEach((gain) => {
      try {
        if (gain.gain && typeof gain.gain.cancelScheduledValues === 'function') {
          gain.gain.cancelScheduledValues(now);
          gain.gain.linearRampToValueAtTime(targetGain, now + 0.1);
        }
      } catch (e) {}
    });
  }

  /**
   * Inicia la grabación de micrófono (PTT) con máxima calidad, compresión de estudio y nitidez de voz (Studio HD Audio)
   * @returns {Promise<boolean>} éxito o fallo al solicitar permisos
   */
  async startRecording() {
    try {
      this.audioChunks = [];
      // Pedimos audio crudo de alta fidelidad sin filtros VOIP que apagan los agudos en celulares
      const constraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 }
        }
      };
      const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.rawMicStream = rawStream;

      let recordStream = rawStream;
      try {
        this.initContext();
        if (this.audioCtx && typeof this.audioCtx.createMediaStreamSource === 'function' && typeof this.audioCtx.createMediaStreamDestination === 'function') {
          const source = this.audioCtx.createMediaStreamSource(rawStream);

          // 1. Filtro Pasa-Altos (Highpass a 85 Hz) para eliminar retumbo de viento y golpes en el celular
          const highPass = this.audioCtx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = 85;

          // 2. Filtro de Nitidez y Presencia Vocal (+5 dB en 2600 Hz) para máxima inteligibilidad en radios policiales
          const presenceFilter = this.audioCtx.createBiquadFilter();
          presenceFilter.type = 'peaking';
          presenceFilter.frequency.value = 2600;
          presenceFilter.Q.value = 1.0;
          presenceFilter.gain.value = 5.0;

          // 3. Pre-amplificador de volumen (+3.5 dB / 1.5x) para que la voz suene fuerte y autoritaria
          const preAmp = this.audioCtx.createGain();
          preAmp.gain.value = 1.5;

          // 4. Compresor Dinámico Studio-Grade (Empareja volumen del que habla despacio y evita distorsión si gritan)
          const compressor = this.audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -22;
          compressor.knee.value = 10;
          compressor.ratio.value = 4.5;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;

          const destination = this.audioCtx.createMediaStreamDestination();

          source.connect(highPass);
          highPass.connect(presenceFilter);
          presenceFilter.connect(preAmp);
          preAmp.connect(compressor);
          compressor.connect(destination);

          recordStream = destination.stream;
        }
      } catch (dspError) {
        console.warn('[AudioService] DSP no disponible en este dispositivo, grabando stream directo HD:', dspError);
        recordStream = rawStream;
      }
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      const options = {
        audioBitsPerSecond: 128000 // 128 kbps para voz policial HD ultra nítida
      };
      if (mimeType) options.mimeType = mimeType;

      this.mediaStream = recordStream;
      this.mediaRecorder = new MediaRecorder(recordStream, options);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.recordingStartTime = Date.now();
      this.mediaRecorder.start();
      this.playTacticalClick();
      return true;
    } catch (error) {
      console.warn('[AudioService] Error al obtener micrófono HD:', error);
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.rawMicStream = this.mediaStream;
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.audioChunks.push(e.data); };
        this.recordingStartTime = Date.now();
        this.mediaRecorder.start();
        this.playTacticalClick();
        return true;
      } catch (e2) {
        alert('⚠️ No se pudo acceder al micrófono. Verifica los permisos del navegador en tu celular.');
        return false;
      }
    }
  }

  /**
   * Detiene la grabación y retorna el audio codificado en Base64 para adjuntar al mensaje de alerta.
   * @returns {Promise<{base64Url: string, blob: Blob, durationSec: number}|null>}
   */
  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const durationSec = Math.max(1, Math.round((Date.now() - (this.recordingStartTime || Date.now())) / 1000));
        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.rawMicStream) {
          this.rawMicStream.getTracks().forEach(track => track.stop());
        }

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          resolve({
            base64Url: reader.result,
            blob: blob,
            durationSec: durationSec
          });
        };
      };

      this.mediaRecorder.stop();
      this.playTacticalClick();
    });
  }

  /**
   * Reproduce un audio codificado en Base64 o URL silenciando la sirena de fondo
   * @param {string} audioUrl
   */
  playAudioNote(audioUrl) {
    if (!audioUrl) return;
    try {
      const audio = new Audio(audioUrl);
      audio.onplay = () => this.duckAlarm(true);
      audio.onended = () => this.duckAlarm(false);
      audio.onpause = () => this.duckAlarm(false);
      audio.play().catch(err => console.warn('No se pudo reproducir nota de voz:', err));
    } catch (e) {}
  }
}

// Instancia global
window.audioService = new AudioService();
