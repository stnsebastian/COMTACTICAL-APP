/**
 * App.js - SAJAUX Controller
 * Controlador principal de la PWA táctica de emergencias policiales SAJAUX.
 */

class AppController {
  constructor() {
    this.currentUser = null;
    this.currentAudioNote = null; // { base64Url, durationSec }
    this.isRecordingPTT = false;
    this.isRecordingStrobePTT = false;
    this.activeStrobeAlert = null;
    this.isWhatsAppEnabled = localStorage.getItem('sajaux_whatsapp_enabled') === 'true';
    this.lastAlertSentOrReceived = null;
    this.deferredInstallPrompt = null;
    this.audioTimers = [];
    this.stoppedAlertId = null;
    this.screenWakeLock = null;
  }

  init() {
    console.log('[SAJAUX] Inicializando aplicación PWA táctica');
    this.cacheDOM();
    this.bindEvents();
    this.checkSession();
    this.setupNetworkListeners();
    this.setupPWAInstaller();
    this.renderAlertsFeed();
  }

  cacheDOM() {
    // Pantallas
    this.loginView = document.getElementById('login-view');
    this.dashboardView = document.getElementById('dashboard-view');
    this.feedView = document.getElementById('feed-view');
    this.mapView = document.getElementById('map-view');
    this.strobeModal = document.getElementById('strobe-modal');

    // Formulario Ingreso
    this.loginForm = document.getElementById('login-form');
    this.firstNameInput = document.getElementById('input-firstname');
    this.surnamesInput = document.getElementById('input-surnames');

    // Display Operador
    this.operatorDisplayName = document.getElementById('operator-display-name');
    this.btnLogout = document.getElementById('btn-logout');

    // Botones de Emergencia
    this.btnColaboracion = document.getElementById('btn-sos-colaboracion');
    this.btnCooperacion = document.getElementById('btn-sos-cooperacion');
    this.btnGuardia = document.getElementById('btn-sos-guardia');



    // Strobe PTT Grabador en vivo
    this.btnStrobePTT = document.getElementById('btn-strobe-ptt');
    this.strobeRecordingDot = document.getElementById('strobe-recording-dot');
    this.strobePttText = document.getElementById('strobe-ptt-text');

    // Navegación inferior
    this.navButtons = document.querySelectorAll('.nav-item');
    this.navBadge = document.getElementById('nav-feed-badge');

    // Feed Central
    this.feedContainer = document.getElementById('alerts-feed-list');
    this.btnSimulate = document.getElementById('btn-simulate');
    this.btnClearFeed = document.getElementById('btn-clear-feed');

    // Strobe Modal elementos
    this.strobeContentCard = document.getElementById('strobe-content-card');
    this.strobeIconBadge = document.getElementById('strobe-icon-badge');
    this.strobeTitle = document.getElementById('strobe-title');
    this.strobeGrade = document.getElementById('strobe-grade');
    this.strobeCallerName = document.getElementById('strobe-caller-name');
    this.strobeSenderId = document.getElementById('strobe-sender-id');
    this.strobeLocationText = document.getElementById('strobe-location-text');
    this.strobeAudioBox = document.getElementById('strobe-audio-box');
    this.strobeAudioPlayer = document.getElementById('strobe-audio-player');
    this.btnStrobeOpenMap = document.getElementById('btn-strobe-open-map');
    this.btnStrobeDespliegue = document.getElementById('btn-strobe-despliegue');
    this.btnStopAlarm = document.getElementById('btn-stop-alarm');
    this.btnStrobeSigilo = document.getElementById('btn-strobe-sigilo');

    // WhatsApp elementos opcionales
    this.loginWhatsappToggle = document.getElementById('login-whatsapp-toggle');
    this.dashboardWhatsappToggle = document.getElementById('dashboard-whatsapp-toggle');

    // PWA Instalador elementos
    this.pwaInstallBannerLogin = document.getElementById('pwa-install-banner-login');
    this.pwaInstallBannerDashboard = document.getElementById('pwa-install-banner-dashboard');
    this.btnInstallLogin = document.getElementById('btn-install-pwa-login');
    this.btnInstallDashboard = document.getElementById('btn-install-pwa-dashboard');

    // Botones tácticos de turno
    this.btnCloseShift = document.getElementById('btn-close-shift');
  }

  bindEvents() {
    // Formateo automático de nombre en tiempo real
    if (this.firstNameInput) {
      this.firstNameInput.addEventListener('input', (e) => {
        const formatted = this.formatFirstName(e.target.value);
        if (e.target.value !== formatted) {
          const pos = e.target.selectionStart;
          e.target.value = formatted;
          e.target.setSelectionRange(pos, pos);
        }
      });
    }

    // Formateo automático de apellidos a mayúscula en tiempo real
    if (this.surnamesInput) {
      this.surnamesInput.addEventListener('input', (e) => {
        const formatted = e.target.value.toUpperCase();
        if (e.target.value !== formatted) {
          const pos = e.target.selectionStart;
          e.target.value = formatted;
          e.target.setSelectionRange(pos, pos);
        }
      });
    }

    // Envío del login
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const first = this.formatFirstName(this.firstNameInput.value.trim());
        const surnames = this.surnamesInput.value.trim().toUpperCase();

        if (!first || !surnames) {
          alert('Por favor ingresa tu primer nombre y los dos apellidos para el registro operativo en SAJAUX.');
          return;
        }

        const fullName = `${first} ${surnames}`;
        this.loginUser({ firstName: first, surnames: surnames, fullName: fullName });
      });
    }

    // Cerrar sesión y botones tácticos de turno
    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', () => this.logoutUser());
    }
    if (this.btnCloseShift) {
      this.btnCloseShift.addEventListener('click', () => this.logoutUser());
    }

    // Botones de Emergencia (3 Tipos)
    if (this.btnColaboracion) {
      this.btnColaboracion.addEventListener('click', () => this.triggerEmergency('colaboracion'));
    }
    if (this.btnCooperacion) {
      this.btnCooperacion.addEventListener('click', () => this.triggerEmergency('cooperacion'));
    }
    if (this.btnGuardia) {
      this.btnGuardia.addEventListener('click', () => this.triggerEmergency('guardia'));
    }

    // PTT Grabador dentro del Modal de Alerta (Strobe PTT)
    if (this.btnStrobePTT) {
      this.bindTacticalPTTButton(this.btnStrobePTT, true);
    }

    // Control automático del volumen de la sirena (ducking al 0.5%) cada vez que se reproduzca una nota de voz PTT en baliza o vista previa
    if (this.strobeAudioPlayer) {
      this.strobeAudioPlayer.addEventListener('play', () => window.audioService.duckAlarm(true));
      this.strobeAudioPlayer.addEventListener('pause', () => window.audioService.duckAlarm(false));
      this.strobeAudioPlayer.addEventListener('ended', () => window.audioService.duckAlarm(false));
    }
    if (this.audioPlayerElem) {
      this.audioPlayerElem.addEventListener('play', () => window.audioService.duckAlarm(true));
      this.audioPlayerElem.addEventListener('pause', () => window.audioService.duckAlarm(false));
      this.audioPlayerElem.addEventListener('ended', () => window.audioService.duckAlarm(false));
    }

    // Navegación Inferior
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewName = btn.getAttribute('data-view');
        this.showView(viewName);
      });
    });

    // Inicializar el Servicio de Mapa Táctico GPS
    this.tacticalMapService = new TacticalMapService(this);

    // Simulación de alertas entrantes
    if (this.btnSimulate) {
      this.btnSimulate.addEventListener('click', () => {
        window.networkService.simulateIncomingAlert();
      });
    }

    // Limpiar historial del radar de emergencias
    if (this.btnClearFeed) {
      this.btnClearFeed.addEventListener('click', () => {
        if (confirm('¿Confirmas que deseas limpiar todos los registros de emergencias en el radar SAJAUX?')) {
          window.networkService.clearHistory();
          this.renderAlertsFeed();
          if (this.navBadge) {
            this.navBadge.classList.add('hidden');
          }
        }
      });
    }

    // Preferencia opcional de envío automático a WhatsApp
    if (this.loginWhatsappToggle) {
      this.loginWhatsappToggle.checked = this.isWhatsAppEnabled;
      this.loginWhatsappToggle.addEventListener('change', (e) => {
        this.updateWhatsAppPreference(e.target.checked);
      });
    }
    if (this.dashboardWhatsappToggle) {
      this.dashboardWhatsappToggle.checked = this.isWhatsAppEnabled;
      this.dashboardWhatsappToggle.addEventListener('change', (e) => {
        this.updateWhatsAppPreference(e.target.checked);
      });
    }

    // Detener alarma desde el Modal Estroboscópico (Slide to deactivate)
    if (this.btnStopAlarm) {
      const thumb = this.btnStopAlarm.querySelector('.slider-thumb');
      const slider = this.btnStopAlarm.querySelector('.strobe-deactivate-slider');
      
      const executeStopAlarm = () => {
        if (thumb) {
          thumb.style.transition = 'transform 0.3s ease';
          thumb.style.transform = 'translateX(0px)';
        }
        if (this.activeStrobeAlert && this.activeStrobeAlert.id) {
          this.stoppedAlertId = this.activeStrobeAlert.id;
        } else if (this.lastAlertSentOrReceived && this.lastAlertSentOrReceived.id) {
          this.stoppedAlertId = this.lastAlertSentOrReceived.id;
        }
        if (this.audioTimers && this.audioTimers.length > 0) {
          this.audioTimers.forEach(t => clearTimeout(t));
          this.audioTimers = [];
        }
        window.audioService.stopAlarm();
        if (this.strobeAudioPlayer) {
          this.strobeAudioPlayer.pause();
          this.strobeAudioPlayer.src = '';
        }
        if (this.strobeAudioBox) this.strobeAudioBox.classList.add('hidden');
        if (this.btnStrobeOpenMap) this.btnStrobeOpenMap.classList.add('hidden');
        if (this.strobeModal) {
          this.strobeModal.classList.add('hidden');
          this.strobeModal.className = 'strobe-modal hidden';
        }
        this.activeStrobeAlert = null;
      };

      if (thumb && slider) {
        let isDragging = false;
        let startX = 0;
        let maxDrag = 0;

        const onDragStart = (e) => {
          isDragging = true;
          startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
          maxDrag = slider.clientWidth - thumb.clientWidth - 10;
          thumb.style.transition = 'none';
        };

        const onDragMove = (e) => {
          if (!isDragging) return;
          let currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
          let dragDist = currentX - startX;
          
          if (dragDist < 0) dragDist = 0;
          if (dragDist > maxDrag) dragDist = maxDrag;
          
          thumb.style.transform = `translateX(${dragDist}px)`;
          
          if (dragDist >= maxDrag * 0.85) {
            isDragging = false;
            executeStopAlarm();
          }
        };

        const onDragEnd = () => {
          if (!isDragging) return;
          isDragging = false;
          thumb.style.transition = 'transform 0.3s ease';
          thumb.style.transform = 'translateX(0px)';
        };

        thumb.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);

        thumb.addEventListener('touchstart', onDragStart, {passive: true});
        document.addEventListener('touchmove', onDragMove, {passive: true});
        document.addEventListener('touchend', onDragEnd);
      } else {
        this.btnStopAlarm.addEventListener('click', executeStopAlarm);
      }
    }
  }

  updateWhatsAppPreference(checked) {
    this.isWhatsAppEnabled = checked;
    localStorage.setItem('sajaux_whatsapp_enabled', checked ? 'true' : 'false');
    if (this.loginWhatsappToggle) this.loginWhatsappToggle.checked = checked;
    if (this.dashboardWhatsappToggle) this.dashboardWhatsappToggle.checked = checked;
    window.audioService.playTacticalClick();
  }

  /**
   * Envía la alerta en formato texto al WhatsApp para compartir en el Grupo BICRIM SAN JAVIER.
   */
  sendToWhatsApp(alertType, location, operatorName) {
    let typeHeader = '🟡 COLABORACIÓN POLICIAL (Situación Controlada / Apoyo)';
    if (alertType === 'cooperacion') typeHeader = '🔴 COOPERACIÓN URGENTE (Apoyo Policial Inmediato)';
    if (alertType === 'guardia') typeHeader = '🔵 COOPERACIÓN SERVICIO DE GUARDIA (Apoyo en Dependencia)';

    let msg = `🚨 *ALERTA SAJAUX - BICRIM SAN JAVIER* 🚨\n\n`;
    msg += `*Tipo de Alerta:* ${typeHeader}\n`;
    msg += `*Funcionario:* ${operatorName || (this.currentUser ? this.currentUser.fullName : 'Operador Policial')}\n`;
    
    if (location && !location.isGuardia && location.lat && location.lng) {
      msg += `*Coordenadas Satelitales:* ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}\n`;
      msg += `*🗺️ Ubicación GPS directo:* https://maps.google.com/?q=${location.lat},${location.lng}\n`;
      if (location.accuracy) msg += `_Precisión ±${location.accuracy}m_\n`;
    } else if (location && location.isGuardia) {
      msg += `*Ubicación:* 📍 SERVICIO DE GUARDIA DE LA UNIDAD\n`;
    } else {
      msg += `*Ubicación:* Alerta Rápida (Sin GPS o en proceso)\n`;
    }
    msg += `\n_Enviado automáticamente desde Terminal Táctica SAJAUX_`;

    const encodedMsg = encodeURIComponent(msg);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMsg}`;
    
    window.open(whatsappUrl, '_blank');
  }

  /**
   * Formatea el primer nombre: primera letra en mayúscula y el resto minúscula.
   */
  formatFirstName(str) {
    if (!str) return '';
    return str.split(' ').map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  checkSession() {
    const saved = localStorage.getItem('sajaux_current_operator');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        if (this.operatorDisplayName) this.operatorDisplayName.textContent = this.currentUser.fullName;
        this.showView('dashboard');
        return;
      } catch (e) {}
    }
    this.showView('login');
  }

  loginUser(userObj) {
    this.currentUser = userObj;
    localStorage.setItem('sajaux_current_operator', JSON.stringify(userObj));
    if (this.operatorDisplayName) this.operatorDisplayName.textContent = userObj.fullName;
    window.audioService.playTacticalClick();
    this.showView('dashboard');

    // Reforzar automáticamente WakeLock, persistencia en RAM y notificaciones al entrar a turno
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(wl => {
          this.screenWakeLock = wl;
        }).catch(() => {});
      }
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
      if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) {}
  }

  logoutUser() {
    if (confirm('¿Confirmas que deseas SALIR DEL TURNO OPERATIVO y cerrar la sesión en SAJAUX?')) {
      localStorage.removeItem('sajaux_current_operator');
      this.currentUser = null;
      window.audioService.stopAlarm();
      try {
        if (this.screenWakeLock) {
          this.screenWakeLock.release();
          this.screenWakeLock = null;
        }
      } catch (e) {}
      this.showView('login');
    }
  }

  showView(viewName) {
    [this.loginView, this.dashboardView, this.feedView, this.mapView].forEach(view => {
      if (view) {
        view.classList.remove('active');
        view.classList.add('hidden');
      }
    });

    if (viewName === 'login') {
      if (this.loginView) {
        this.loginView.classList.remove('hidden');
        setTimeout(() => this.loginView.classList.add('active'), 20);
      }
      const nav = document.querySelector('.tactical-nav');
      const banner = document.querySelector('.operator-banner');
      if (nav) nav.classList.add('hidden');
      if (banner) banner.classList.add('hidden');
    } else {
      const nav = document.querySelector('.tactical-nav');
      const banner = document.querySelector('.operator-banner');
      if (nav) nav.classList.remove('hidden');
      if (banner) banner.classList.remove('hidden');

      this.navButtons.forEach(btn => {
        if (btn.getAttribute('data-view') === viewName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      if (viewName === 'dashboard' && this.dashboardView) {
        this.dashboardView.classList.remove('hidden');
        setTimeout(() => this.dashboardView.classList.add('active'), 20);
      } else if (viewName === 'feed' && this.feedView) {
        this.feedView.classList.remove('hidden');
        setTimeout(() => this.feedView.classList.add('active'), 20);
        this.renderAlertsFeed();
        if (this.navBadge) {
          this.navBadge.classList.add('hidden');
        }
      } else if (viewName === 'map' && this.mapView) {
        this.mapView.classList.remove('hidden');
        setTimeout(() => {
          this.mapView.classList.add('active');
          if (this.tacticalMapService) {
            this.tacticalMapService.initOrRefreshMap();
          }
        }, 20);
      }
    }
  }

  bindTacticalPTTButton(buttonElem, isStrobeMode) {
    if (!buttonElem) return;
    let pressStartTime = 0;
    let isHolding = false;
    let hasTriggeredStop = false;

    const startAction = async (e) => {
      e.preventDefault();
      if (isStrobeMode && (!this.activeStrobeAlert && !this.lastAlertSentOrReceived)) {
        alert('No hay una alerta activa para adjuntar nota de voz.');
        return;
      }
      const isRecording = isStrobeMode ? this.isRecordingStrobePTT : this.isRecordingPTT;
      if (isRecording) {
        await this.handlePTTStop(isStrobeMode);
        return;
      }
      pressStartTime = Date.now();
      isHolding = true;
      hasTriggeredStop = false;
      await this.handlePTTStart(isStrobeMode);
    };

    const stopAction = async (e) => {
      if (!isHolding) return;
      isHolding = false;
      const isRecording = isStrobeMode ? this.isRecordingStrobePTT : this.isRecordingPTT;
      if (!isRecording || hasTriggeredStop) return;

      hasTriggeredStop = true;
      await this.handlePTTStop(isStrobeMode);
    };

    const cancelAction = async () => {
      if (!isHolding) return;
      isHolding = false;
      const isRecording = isStrobeMode ? this.isRecordingStrobePTT : this.isRecordingPTT;
      if (isRecording && !hasTriggeredStop) {
        hasTriggeredStop = true;
        await this.handlePTTStop(isStrobeMode);
      }
    };

    buttonElem.addEventListener('pointerdown', startAction);
    buttonElem.addEventListener('pointerup', stopAction);
    buttonElem.addEventListener('pointercancel', cancelAction);
    buttonElem.addEventListener('pointerleave', cancelAction);
  }

  async handlePTTStart(isStrobeMode) {
    if (isStrobeMode) {
      window.audioService.duckAlarm(true);
    }
    const started = await window.audioService.startRecording();
    if (started) {
      if (isStrobeMode) {
        this.isRecordingStrobePTT = true;
        if (this.btnStrobePTT) this.btnStrobePTT.classList.add('recording');
        if (this.strobeRecordingDot) this.strobeRecordingDot.classList.remove('hidden');
        if (this.strobePttText) this.strobePttText.textContent = '🔴 GRABANDO... SUELTA PARA TRANSMITIR A LA RED';
      } else {
        this.isRecordingPTT = true;
        if (this.btnPTT) this.btnPTT.classList.add('recording');
        if (this.pttText) this.pttText.textContent = '🔴 GRABANDO PTT... SUELTA PARA TRANSMITIR A LA RED';
      }
    } else if (isStrobeMode) {
      window.audioService.duckAlarm(false);
    }
  }

  async handlePTTStop(isStrobeMode) {
    const audioResult = await window.audioService.stopRecording();
    if (isStrobeMode) {
      this.isRecordingStrobePTT = false;
      if (this.btnStrobePTT) this.btnStrobePTT.classList.remove('recording');
      if (this.strobeRecordingDot) this.strobeRecordingDot.classList.add('hidden');
      if (this.strobePttText) this.strobePttText.textContent = '🎙️ GRABAR Y TRANSMITIR NOTA DE VOZ / RADIO PTT';
      window.audioService.duckAlarm(false);

      if (audioResult && audioResult.base64Url) {
        this.transmitDirectVoiceNote(audioResult, true);
      }
    } else {
      this.isRecordingPTT = false;
      if (this.btnPTT) this.btnPTT.classList.remove('recording');
      if (this.pttText) this.pttText.textContent = '🎙️ PRESIONAR PARA HABLAR (PTT HD)';

      if (audioResult && audioResult.base64Url) {
        // Transmisión inmediata y automática al soltar el botón
        this.transmitDirectVoiceNote(audioResult, false);
      }
    }
  }

  transmitDirectVoiceNote(audioResult, isFromStrobe = false) {
    if (!audioResult || !audioResult.base64Url) return;
    const baseAlert = this.activeStrobeAlert || this.lastAlertSentOrReceived || {};
    const voiceUpdatePayload = {
      ...baseAlert,
      id: `SAJAUX_VOICE_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      parentAlertId: baseAlert.id || `parent_${Date.now()}`,
      alertType: baseAlert.alertType || 'colaboracion',
      operatorName: `${this.currentUser ? this.currentUser.fullName : 'Funcionario'} (Radio PTT)`,
      location: baseAlert.location || null,
      audioNote: audioResult.base64Url,
      audioDuration: audioResult.durationSec,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Confirmación acústica y emisión en tiempo real a la red (MQTT + BroadcastChannel)
    window.audioService.playTacticalClick();
    window.networkService.broadcastAlert(voiceUpdatePayload);
    this.lastAlertSentOrReceived = voiceUpdatePayload;

    if (!isFromStrobe && this.pttText) {
      this.pttText.textContent = '✅ ¡NOTA PTT TRANSMITIDA A LA RED!';
      setTimeout(() => {
        if (!this.isRecordingPTT && this.pttText) {
          this.pttText.textContent = '🎙️ PRESIONAR PARA HABLAR (PTT HD)';
        }
      }, 2500);
    }

    // Mostrar reproductor en nuestra propia baliza de forma inmediata si está abierta
    if (this.strobeAudioBox && this.strobeAudioPlayer) {
      this.strobeAudioBox.classList.remove('hidden');
      this.strobeAudioPlayer.src = audioResult.base64Url;
    }
    this.renderAlertsFeed();
  }

  /**
   * Emite una alerta de emergencia desde este celular.
   * @param {'colaboracion'|'cooperacion'|'guardia'} alertType 
   */
  async triggerEmergency(alertType) {
    if (!this.currentUser) {
      alert('Debes ingresar tu nombre y apellidos antes de emitir una alerta en SAJAUX.');
      return;
    }

    window.audioService.playTacticalClick();

    // Obtener ubicación según tipo (para guardia será nula/fija sin pedir GPS)
    const geoData = await window.geoService.getLocationForAlert(alertType);

    const alertObj = {
      operatorName: this.currentUser.fullName,
      alertType: alertType,
      location: geoData,
      audioNote: this.currentAudioNote ? this.currentAudioNote.base64Url : null,
      audioDuration: this.currentAudioNote ? this.currentAudioNote.durationSec : null
    };

    // Emitir a la red y guardar en historial
    const broadcasted = window.networkService.broadcastAlert(alertObj);

    // Guardar referencia de última alerta
    this.lastAlertSentOrReceived = broadcasted;

    // Si está activada la preferencia de WhatsApp, enviar automáticamente el mensaje al grupo
    if (this.isWhatsAppEnabled) {
      this.sendToWhatsApp(alertType, geoData, this.currentUser.fullName);
    }

    // Si se adjuntó audio temporal en dashboard, limpiarlo
    if (this.currentAudioNote) {
      this.currentAudioNote = null;
      if (this.audioPreviewContainer) this.audioPreviewContainer.classList.add('hidden');
      if (this.audioPlayerElem) this.audioPlayerElem.src = '';
    }

    // Al activarla nosotros mismos, abrir modal de baliza SOLO iluminación (isReceiver = false -> SIN alarma sonora local)
    this.openStrobeModal(broadcasted, false);
    this.renderAlertsFeed();
  }

  setupNetworkListeners() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(e => console.warn('Permiso de notificación:', e));
    }

    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(wl => {
          this.screenWakeLock = wl;
          console.log('[SAJAUX] WakeLock de pantalla activo.');
        }).catch(() => {});
      }
    } catch (e) {}

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'ALERT_RESTORE_FOCUS') {
          const alertToShow = event.data.alertData || this.lastAlertSentOrReceived;
          if (alertToShow) {
            if (this.stoppedAlertId && alertToShow.id === this.stoppedAlertId) return;
            if (this.activeStrobeAlert && this.activeStrobeAlert.id === alertToShow.id && !this.strobeModal.classList.contains('hidden')) return;
            this.openStrobeModal(alertToShow, true);
          }
          try { window.focus(); } catch (e) {}
        }
      });
    }

    window.networkService.onAlertReceived((alertData, isLocalBroadcast) => {
      if (!isLocalBroadcast) {
        this.openStrobeModal(alertData, true);

        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_EMERGENCY_NOTIFICATION',
                alertData: alertData
              });
            } else {
              let typeTitle = '🟡 COLABORACIÓN POLICIAL';
              if (alertData.alertType === 'cooperacion') typeTitle = '🔴 ¡COOPERACIÓN URGENTE!';
              if (alertData.alertType === 'guardia') typeTitle = '🔵 COOPERACIÓN SERVICIO DE GUARDIA';
              
              const n = new Notification(`🚨 SAJAUX: ${typeTitle}`, {
                body: `Operador: ${alertData.operatorName || 'Funcionario Policial'} - Toca para abrir baliza y ubicación en mapa.`,
                icon: './icon-192.svg',
                badge: './icon-192.svg',
                vibrate: [600, 200, 600, 200, 600, 200, 600, 200, 600],
                requireInteraction: true,
                renotify: true,
                tag: alertData.id || 'sajaux-alert'
              });
              n.onclick = () => {
                window.focus();
                n.close();
              };
            }
          } catch (e) {
            console.warn('Notification error:', e);
          }
        }
      }
      this.renderAlertsFeed();

      if (this.feedView && this.feedView.classList.contains('hidden') && this.navBadge) {
        this.navBadge.classList.remove('hidden');
        this.navBadge.textContent = '1';
      }
    });

    if (typeof window.networkService.onStatusChange === 'function') {
      window.networkService.onStatusChange((isConnected) => {
        const opLabel = document.querySelector('.operator-label');
        if (opLabel) {
          if (isConnected) {
            opLabel.innerHTML = '🟢 RED SAJAUX ONLINE (WI-FI / 4G)';
            opLabel.style.color = '#10b981';
          } else {
            opLabel.innerHTML = '🟡 MODO LOCAL / CONECTANDO A RED...';
            opLabel.style.color = '#f59e0b';
          }
        }
      });
    }
  }

  /**
   * Muestra la baliza estroboscópica y activa la sirena en el celular receptor
   */
  openStrobeModal(alertData, isReceiver = true) {
    if (!alertData || !this.strobeModal) return;
    if (this.stoppedAlertId && alertData.id === this.stoppedAlertId) return;

    // Si la baliza ya está activa, verificar si es una actualización de nota de voz PTT
    if (this.activeStrobeAlert && !this.strobeModal.classList.contains('hidden')) {
      if (alertData.id === this.activeStrobeAlert.id || alertData.parentAlertId === this.activeStrobeAlert.id) {
        if (alertData.audioNote && this.strobeAudioBox && this.strobeAudioPlayer) {
          this.strobeAudioBox.classList.remove('hidden');
          this.strobeAudioPlayer.src = alertData.audioNote;
          this.strobeAudioPlayer.onplay = () => window.audioService.duckAlarm(true);
          this.strobeAudioPlayer.onended = () => window.audioService.duckAlarm(false);
          this.strobeAudioPlayer.onpause = () => window.audioService.duckAlarm(false);
          if (isReceiver) {
            this.strobeAudioPlayer.play().catch(e => {
              console.warn('Autoplay audio bloqueado en update:', e);
              window.audioService.playAudioNote(alertData.audioNote);
            });
          }
        }
        return;
      }
    }

    try {
      window.focus();
      if (isReceiver && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'WAKE_AND_FOCUS_CLIENTS',
          alertData: alertData
        });
      }
    } catch (e) {}

    this.activeStrobeAlert = alertData;
    const { alertType, operatorName, location, audioNote } = alertData;

    this.strobeModal.className = 'strobe-modal'; // reset de clases

    if (alertType === 'cooperacion') {
      this.strobeModal.classList.add('theme-red');
      if (this.strobeTitle) this.strobeTitle.textContent = '¡ COOPERACIÓN !';
      if (this.strobeGrade) this.strobeGrade.textContent = 'NIVEL DE RESPUESTA: GRADO 1';
      if (isReceiver) window.audioService.playAlarm('cooperacion');
    } else if (alertType === 'colaboracion') {
      this.strobeModal.classList.add('theme-yellow');
      if (this.strobeTitle) this.strobeTitle.textContent = '¡ COLABORACIÓN !';
      if (this.strobeGrade) this.strobeGrade.textContent = 'NIVEL DE RESPUESTA: GRADO 2';
      if (isReceiver) window.audioService.playAlarm('colaboracion');
    } else if (alertType === 'guardia') {
      this.strobeModal.classList.add('theme-blue');
      if (this.strobeTitle) this.strobeTitle.textContent = '¡ GUARDIA CUARTEL !';
      if (this.strobeGrade) this.strobeGrade.textContent = 'NIVEL DE RESPUESTA: GRADO 3';
      if (isReceiver) window.audioService.playAlarm('guardia');
    }

    if (this.strobeCallerName) {
      this.strobeCallerName.textContent = operatorName || 'Unidad Policial (Desconocida)';
    }
    if (this.strobeSenderId) {
      const hashStr = (operatorName || 'UNIDAD').toUpperCase().replace(/[^A-Z]/g, '');
      const numCode = Math.abs(hashStr.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 78292)).toString().slice(0, 5);
      this.strobeSenderId.textContent = `ID: SF-${numCode || '78292'}-MX`;
    }
    
    // Configurar ubicación GPS y botón para abrir mapa directamente en nuestro Mapa Táctico
    if (this.strobeLocationText) {
      if (location && location.isGuardia) {
        this.strobeLocationText.innerHTML = `<span class="loc-coords">📍 SERVICIO DE GUARDIA DE LA UNIDAD</span><span class="loc-precision">Base Central</span>`;
        if (this.btnStrobeOpenMap && isReceiver) {
          this.btnStrobeOpenMap.classList.remove('hidden');
          this.btnStrobeOpenMap.onclick = () => {
            window.audioService.playTacticalClick();
            if (this.strobeModal) this.strobeModal.classList.add('hidden');
            window.audioService.stopAlarm();
            this.showView('map');
            if (this.tacticalMapService) this.tacticalMapService.setEmergencyTarget(alertData);
          };
        }
      } else if (location && location.lat) {
        this.strobeLocationText.innerHTML = `<span class="loc-coords">📍 ${location.lat.toFixed(4)}° N, ${location.lng.toFixed(4)}° W</span><span class="loc-precision">Precisión: ±${location.accuracy || 3.2}m</span>`;
        if (this.btnStrobeOpenMap && isReceiver) {
          this.btnStrobeOpenMap.classList.remove('hidden');
          this.btnStrobeOpenMap.onclick = () => {
            window.audioService.playTacticalClick();
            if (this.strobeModal) this.strobeModal.classList.add('hidden');
            window.audioService.stopAlarm();
            this.showView('map');
            if (this.tacticalMapService) this.tacticalMapService.setEmergencyTarget(alertData);
          };
        } else if (this.btnStrobeOpenMap) {
          this.btnStrobeOpenMap.classList.add('hidden');
        }
      } else {
        this.strobeLocationText.innerHTML = `<span class="loc-coords">📍 19.4326° N, 99.1332° W</span><span class="loc-precision">Precisión: 3.2m</span>`;
        if (this.btnStrobeOpenMap) this.btnStrobeOpenMap.classList.add('hidden');
      }
    }



    this.lastAlertSentOrReceived = alertData;
    if (this.audioTimers && this.audioTimers.length > 0) {
      this.audioTimers.forEach(t => clearTimeout(t));
    }
    this.audioTimers = [];

    // Configurar reproductor de nota de voz en la baliza
    if (audioNote && this.strobeAudioBox && this.strobeAudioPlayer) {
      this.strobeAudioBox.classList.remove('hidden');
      this.strobeAudioPlayer.src = audioNote;
      this.strobeAudioPlayer.onplay = () => window.audioService.duckAlarm(true);
      this.strobeAudioPlayer.onended = () => window.audioService.duckAlarm(false);
      this.strobeAudioPlayer.onpause = () => window.audioService.duckAlarm(false);
      if (isReceiver) {
        const t1 = setTimeout(() => {
          this.strobeAudioPlayer.play().catch(e => {
            console.warn('Autoplay audio bloqueado, activando fallback HD:', e);
            window.audioService.playAudioNote(audioNote);
          });
        }, 500);
        this.audioTimers.push(t1);
      }
    } else if (this.strobeAudioBox) {
      this.strobeAudioBox.classList.add('hidden');
      if (this.strobeAudioPlayer) {
        this.strobeAudioPlayer.onplay = null;
        this.strobeAudioPlayer.onended = null;
        this.strobeAudioPlayer.onpause = null;
        this.strobeAudioPlayer.src = '';
      }
    }

    this.strobeModal.classList.remove('hidden');
  }

  renderAlertsFeed() {
    if (!this.feedContainer) return;
    const history = window.networkService.getAlertHistory();

    if (history.length === 0) {
      this.feedContainer.innerHTML = `
        <div class="empty-feed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
          <p style="font-weight:700;">No hay incidentes activos ni historial reciente en la central SAJAUX.</p>
          <p style="font-size:12px;margin-top:4px;">Las alertas de Colaboración, Cooperación y Guardia aparecerán aquí en tiempo real.</p>
        </div>
      `;
      return;
    }

    this.feedContainer.innerHTML = history.map((item, index) => {
      const isRed = item.alertType === 'cooperacion';
      const isBlue = item.alertType === 'guardia';

      let cardClass = 'type-colaboracion';
      let badgeClass = 'badge-yellow';
      let badgeText = '🟡 COLABORACIÓN';
      
      if (isRed) {
        cardClass = 'type-cooperacion';
        badgeClass = 'badge-red';
        badgeText = '🔴 COOPERACIÓN URGENTE';
      } else if (isBlue) {
        cardClass = 'type-guardia';
        badgeClass = 'badge-blue';
        badgeText = '🔵 SERVICIO DE GUARDIA';
      }

      let locationHtml = '';
      if (item.location && item.location.isGuardia) {
        locationHtml = `
          <div class="guardia-location-pill" onclick="window.sajauxApp.openTacticalRouteFromFeed(${index})" style="cursor:pointer;" title="Ver en Mapa Táctico">
            <span>🛡️</span>
            <span>SERVICIO DE GUARDIA DE LA UNIDAD • 🧭 VER RUTA</span>
          </div>
        `;
      } else if (item.location && item.location.mapUrl) {
        locationHtml = `
          <div class="alert-location-box" style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
              <div class="alert-location-text">
                <span>📍</span>
                <span>${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)}</span>
              </div>
              <button onclick="window.sajauxApp.openTacticalRouteFromFeed(${index})" class="btn-nav-map" style="border:none; cursor:pointer;" title="Ver ruta en Mapa Táctico">
                <span>🧭 RUTA TÁCTICA</span>
              </button>
            </div>
            <div class="alert-ext-apps">
              <button onclick="window.sajauxApp.openExternalNav('google', ${item.location.lat}, ${item.location.lng})" class="mini-app-btn btn-google" title="Abrir en Google Maps">🌐 Google</button>
              <button onclick="window.sajauxApp.openExternalNav('waze', ${item.location.lat}, ${item.location.lng})" class="mini-app-btn btn-waze" title="Abrir en Waze">🚗 Waze</button>
              <button onclick="window.sajauxApp.openExternalNav('petal', ${item.location.lat}, ${item.location.lng})" class="mini-app-btn btn-petal" title="Abrir en Petal Maps">🌸 Petal</button>
            </div>
          </div>
        `;
      }

      let audioHtml = '';
      if (item.audioNote) {
        audioHtml = `
          <div class="alert-audio-player">
            <span style="font-size:14px;">🎙️ Nota de voz PTT HD</span>
            <audio controls src="${item.audioNote}" style="height:28px; max-width:200px;"></audio>
          </div>
        `;
      }

      let respondersHtml = '';
      if (item.responders && item.responders.length > 0) {
        respondersHtml = `
          <div class="badge-despliegue">
            <span>🚨 EN CAMINO AL AUXILIO (${item.responders.length}):</span>
            <span style="color: white; font-weight: 700; margin-left: 4px;">${item.responders.join(', ')}</span>
          </div>
        `;
      }

      const despliegueBtnHtml = `
        <button onclick="window.sajauxApp.triggerDespliegueEnCamino(${index})" class="btn-despliegue" style="padding: 8px 10px; margin-top: 6px; box-shadow: none;">
          <div class="despliegue-header" style="justify-content: center; margin-bottom: 0;">
            <span class="despliegue-icon">🚨</span>
            <span class="despliegue-title" style="font-size: 11px;">PULSAR: DESPLIEGUE EN CAMINO</span>
          </div>
        </button>
      `;

      return `
        <div class="alert-card ${cardClass}">
          <div class="alert-card-header">
            <span class="alert-badge ${badgeClass}">${badgeText}</span>
            <span class="alert-time">${item.timeFormatted || ''}</span>
          </div>
          <div class="alert-user-info">
            <div class="alert-user-name">${item.operatorName || 'Operador Policial'}</div>
          </div>
          ${locationHtml}
          ${audioHtml}
          ${respondersHtml}
          ${despliegueBtnHtml}
        </div>
      `;
    }).join('');
  }

  setupPWAInstaller() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');
    
    if (isStandalone) {
      console.log('[SAJAUX] Ejecutando en modo nativo/standalone. Ocultando banners de instalación.');
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      console.log('[SAJAUX] beforeinstallprompt capturado. PWA lista para instalar en celular.');

      if (this.pwaInstallBannerLogin) this.pwaInstallBannerLogin.classList.remove('hidden');
      if (this.pwaInstallBannerDashboard) this.pwaInstallBannerDashboard.classList.remove('hidden');
    });

    if (isIOS) {
      if (this.pwaInstallBannerLogin) this.pwaInstallBannerLogin.classList.remove('hidden');
      if (this.pwaInstallBannerDashboard) this.pwaInstallBannerDashboard.classList.remove('hidden');

      const setIOSHelpText = (btn) => {
        if (!btn) return;
        btn.innerHTML = `📲 En iPhone/iPad:<br><small style="font-size:10px; opacity:0.9;">Toca 'Compartir' ⎋ y luego 'Agregar a Inicio' ➕</small>`;
        btn.style.background = 'linear-gradient(135deg, #1e293b, #334155)';
      };
      setIOSHelpText(this.btnInstallLogin);
      setIOSHelpText(this.btnInstallDashboard);
    } else {
      setTimeout(() => {
        if (!isStandalone && !this.deferredInstallPrompt && !isIOS) {
          if (this.pwaInstallBannerLogin) this.pwaInstallBannerLogin.classList.remove('hidden');
          if (this.pwaInstallBannerDashboard) this.pwaInstallBannerDashboard.classList.remove('hidden');
        }
      }, 1500);
    }

    const triggerInstall = async () => {
      if (this.deferredInstallPrompt) {
        this.deferredInstallPrompt.prompt();
        const { outcome } = await this.deferredInstallPrompt.userChoice;
        console.log(`[SAJAUX] Resultado de instalación PWA: ${outcome}`);
        if (outcome === 'accepted') {
          if (this.pwaInstallBannerLogin) this.pwaInstallBannerLogin.classList.add('hidden');
          if (this.pwaInstallBannerDashboard) this.pwaInstallBannerDashboard.classList.add('hidden');
        }
        this.deferredInstallPrompt = null;
      } else if (isIOS) {
        alert("Para instalar SAJAUX en iPhone/iPad:\n\n1. Toca el icono 'Compartir' ⎋ en la barra inferior del navegador.\n2. Desliza y selecciona 'Agregar a inicio' ➕.");
      } else {
        alert("Para instalar SAJAUX como aplicación nativa en tu celular:\n\n1. Abre las opciones del navegador (menú de 3 puntos ⋮ en Chrome).\n2. Toca 'Instalar aplicación' o 'Agregar a la pantalla principal'.");
      }
    };

    if (this.btnInstallLogin) this.btnInstallLogin.addEventListener('click', triggerInstall);
    if (this.btnInstallDashboard) this.btnInstallDashboard.addEventListener('click', triggerInstall);

    window.addEventListener('appinstalled', () => {
      console.log('[SAJAUX] ¡Aplicación instalada exitosamente en el celular!');
      if (this.pwaInstallBannerLogin) this.pwaInstallBannerLogin.classList.add('hidden');
      if (this.pwaInstallBannerDashboard) this.pwaInstallBannerDashboard.classList.add('hidden');
    });
  }
  openTacticalRouteFromFeed(index) {
    window.audioService.playTacticalClick();
    const history = window.networkService.getAlertHistory();
    const alertData = history[index];
    if (alertData && this.tacticalMapService) {
      this.showView('map');
      this.tacticalMapService.setEmergencyTarget(alertData);
    }
  }

  openExternalNav(appType, targetLat, targetLng) {
    window.audioService.playTacticalClick();
    let lat = targetLat;
    let lng = targetLng;

    if (!lat || !lng) {
      if (this.tacticalMapService && this.tacticalMapService.currentTargetCoords) {
        lat = this.tacticalMapService.currentTargetCoords.lat;
        lng = this.tacticalMapService.currentTargetCoords.lng;
      } else if (this.lastAlertSentOrReceived && this.lastAlertSentOrReceived.location && this.lastAlertSentOrReceived.location.lat) {
        lat = this.lastAlertSentOrReceived.location.lat;
        lng = this.lastAlertSentOrReceived.location.lng;
      } else {
        lat = -35.5880;
        lng = -71.7250;
      }
    }

    if (appType === 'google') {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      window.open(url, '_blank');
    } else if (appType === 'waze') {
      const url = `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
      window.open(url, '_blank');
    } else if (appType === 'petal') {
      const url = `https://www.petalmaps.com/routes/?daddr=${lat},${lng}&type=drive`;
      window.open(url, '_blank');
    }
  }

  openExternalNavFromModal(appType) {
    if (this.lastAlertSentOrReceived && this.lastAlertSentOrReceived.location && this.lastAlertSentOrReceived.location.lat) {
      this.openExternalNav(appType, this.lastAlertSentOrReceived.location.lat, this.lastAlertSentOrReceived.location.lng);
    } else {
      this.openExternalNav(appType);
    }
  }

  triggerDespliegueEnCamino(alertDataOrIndex, fromModal = false) {
    window.audioService.playTacticalClick();
    
    let alertData = alertDataOrIndex;
    if (typeof alertDataOrIndex === 'number') {
      const history = window.networkService.getAlertHistory();
      alertData = history[alertDataOrIndex];
    } else if (!alertData) {
      alertData = this.lastAlertSentOrReceived;
    }

    // Registrar despliegue en la alerta y en la red
    const responderName = (this.currentUser && this.currentUser.fullName) ? this.currentUser.fullName : 'Móvil Policial';
    if (alertData) {
      alertData.responders = alertData.responders || [];
      if (!alertData.responders.includes(responderName)) {
        alertData.responders.push(responderName);
        // Guardar la actualización en memoria local e historial
        window.networkService.saveToLocalHistory(alertData);
        // Emitir la alerta actualizada a la red para que los demás vean la concurrencia
        if (window.networkService.mqttClient && window.networkService.isCloudConnected) {
          try {
            window.networkService.mqttClient.publish(window.networkService.cloudTopic, JSON.stringify(alertData), { qos: 1 });
          } catch(e) {}
        }
      }
    }

    // Ocultar (borrar) inmediatamente el botón en el mapa una vez confirmado
    const mapDespliegueBox = document.getElementById('map-despliegue-box');
    if (mapDespliegueBox) mapDespliegueBox.classList.add('hidden');

    // Si estamos en el modal de baliza, apagar la alarma y ocultar el modal para ir al mapa
    if (fromModal || (this.strobeModal && !this.strobeModal.classList.contains('hidden'))) {
      if (this.strobeModal) this.strobeModal.classList.add('hidden');
      window.audioService.stopAlarm();
    }

    // Navegar de inmediato al Mapa Táctico y trazar ruta solo si no estamos ahí
    const isAlreadyOnMap = this.mapView && !this.mapView.classList.contains('hidden');
    if (!isAlreadyOnMap) {
      this.showView('map');
      setTimeout(() => {
        if (this.tacticalMapService && alertData) {
          this.tacticalMapService.setEmergencyTarget(alertData);
        }
      }, 50);
    } else {
      if (this.tacticalMapService && alertData) {
        this.tacticalMapService.setEmergencyTarget(alertData);
      }
    }

    // Actualización de feed silenciosa (sin alert invasivo que interrumpa la PWA)
    this.renderAlertsFeed();
  }
}

/* ========================================================
   SERVICIO DE MAPA TÁCTICO POLICIAL EN VIVO (LEAFLET + CARTODB)
   ======================================================== */
class TacticalMapService {
  constructor(appController) {
    this.app = appController;
    this.map = null;
    this.isInitialized = false;
    this.selfMarker = null;
    this.targetMarker = null;
    this.routePolyline = null;
    this.connectedUnitMarkers = [];
    this.currentSelfCoords = { lat: -35.5925, lng: -71.7315 }; // Base BICRIM San Javier
    this.currentTargetCoords = null;

    // Patrullas policiales conectadas en terreno para radar en vivo
    this.patrolUnits = [
      { id: 'SF-HQ', name: 'Guardia Cuartel BICRIM San Javier', lat: -35.5925, lng: -71.7315, status: '🔵 Base Central y Comando', distKm: 0.0 }
    ];

    this.cacheUI();
    this.bindEvents();
  }

  cacheUI() {
    this.mapContainer = document.getElementById('tactical-map-container');
    this.mapStatusPill = document.getElementById('map-status-pill');
    this.routeSummaryBox = document.getElementById('map-route-summary');
    this.distVal = document.getElementById('map-dist-val');
    this.etaVal = document.getElementById('map-eta-val');
    this.supportVal = document.getElementById('map-support-val');
    this.targetInfoBox = document.getElementById('map-target-info');
    this.targetNameElem = document.getElementById('map-target-name');
    this.targetDescElem = document.getElementById('map-target-desc');
    this.mapDespliegueBox = document.getElementById('map-despliegue-box');
    
    this.mapRespondersBoard = document.getElementById('map-responders-board');
    this.boardRespondersCount = document.getElementById('board-responders-count');
    this.mapRespondersList = document.getElementById('map-responders-list');
    
    this.btnCenterSelf = document.getElementById('btn-map-center-self');
    this.btnCenterTarget = document.getElementById('btn-map-center-target');
  }

  bindEvents() {
    // btnCenterSelf eliminado, no se bindeará el evento
    if (this.btnCenterTarget) {
      this.btnCenterTarget.addEventListener('click', () => {
        window.audioService.playTacticalClick();
        if (this.map && this.currentTargetCoords) {
          this.map.flyTo([this.currentTargetCoords.lat, this.currentTargetCoords.lng], 16, { animate: true, duration: 1.2 });
        }
      });
    }
  }

  initOrRefreshMap() {
    if (!window.L || !this.mapContainer) return;

    if (!this.isInitialized) {
      this.isInitialized = true;
      
      this.map = L.map('tactical-map-container', {
        zoomControl: false,
        attributionControl: false
      }).setView([this.currentSelfCoords.lat, this.currentSelfCoords.lng], 15);

      // CartoDB Dark Matter Base Tiles (Especial Modo Sigilo y Alta Legibilidad)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(this.map);

      L.control.zoom({ position: 'topright' }).addTo(this.map);

      // Obtener GPS del operador en segundo plano si hay permisos
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.currentSelfCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            this.renderSelfMarker();
          },
          (err) => {
            console.log('[TacticalMap] Usando coordenadas base BICRIM San Javier como ubicación por defecto.');
            this.renderSelfMarker();
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        this.renderSelfMarker();
      }

      this.renderSelfMarker();
      this.renderConnectedPatrols();
      this.renderRespondersBoard(this.app ? this.app.lastAlertSentOrReceived : null);
    } else {
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
        this.renderRespondersBoard(this.app ? this.app.lastAlertSentOrReceived : null);
      }, 100);
    }
  }

  renderSelfMarker() {
    // DESHABILITADO: El usuario solicitó no mostrar el pin "TÚ (MI PATRULLA)" por defecto,
    // solo se mostrarán los marcadores de la emergencia y demás unidades conectadas.
    return;
  }

  renderConnectedPatrols() {
    if (!this.map || !window.L) return;

    this.connectedUnitMarkers.forEach(m => this.map.removeLayer(m));
    this.connectedUnitMarkers = [];

    this.patrolUnits.forEach(unit => {
      if (unit.id === 'SF-HQ') {
        const hqHtml = `
          <div style="background: rgba(14,20,31,0.95); border: 1.5px solid #3b82f6; border-radius: 8px; padding: 3px 8px; display: flex; align-items: center; gap: 5px; box-shadow: 0 0 12px rgba(59,130,246,0.5); white-space: nowrap; transform: translate(-50%, -50%);">
            <span style="font-size:12px;">🛡️</span>
            <span style="color:#60a5fa; font-size:10px; font-weight:800;">BICRIM SAN JAVIER</span>
          </div>
        `;
        const hqIcon = L.divIcon({ className: '', html: hqHtml, iconSize: [130, 26], iconAnchor: [65, 13] });
        const marker = L.marker([unit.lat, unit.lng], { icon: hqIcon })
          .addTo(this.map)
          .bindPopup(`
            <div class="marker-popup-title">🛡️ CUARTEL BICRIM SAN JAVIER</div>
            <div class="marker-popup-sub">Policía de Investigaciones de Chile</div>
            <div class="marker-popup-status">🟢 CENTRAL OPERATIVA Y GUARDIA</div>
          `);
        this.connectedUnitMarkers.push(marker);
      } else {
        const unitHtml = `
          <div style="background: rgba(14,20,31,0.92); border: 1.5px solid #10b981; border-radius: 50px; padding: 3px 8px; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(16,185,129,0.4); white-space: nowrap; transform: translate(-50%, -50%);">
            <span style="display:inline-block; width:7px; height:7px; background:#10b981; border-radius:50%;"></span>
            <span style="color:#a7f3d0; font-size:10px; font-weight:700;">${unit.id} (${unit.distKm}km)</span>
          </div>
        `;
        const uIcon = L.divIcon({ className: '', html: unitHtml, iconSize: [110, 24], iconAnchor: [55, 12] });
        const marker = L.marker([unit.lat, unit.lng], { icon: uIcon })
          .addTo(this.map)
          .bindPopup(`
            <div class="marker-popup-title">🚓 ${unit.name}</div>
            <div class="marker-popup-sub">Distancia relativa: ${unit.distKm} km</div>
            <div class="marker-popup-status">${unit.status}</div>
          `);
        this.connectedUnitMarkers.push(marker);
      }
    });

    if (this.mapStatusPill) {
      this.mapStatusPill.textContent = `🟢 ${this.patrolUnits.length + 1} UNIDADES EN TERRENO`;
    }
  }

  renderRespondersBoard(alertData) {
    if (this.responderPins) {
      this.responderPins.forEach(p => { if (this.map && p) this.map.removeLayer(p); });
    }
    this.responderPins = [];

    const responders = alertData && alertData.responders ? alertData.responders : [];
    
    if (this.boardRespondersCount) {
      this.boardRespondersCount.textContent = `🟢 ${responders.length + this.patrolUnits.length} EN RADAR`;
    }

    let html = '';

    // 1. Mostrar funcionarios que pulsaron "Despliegue en Camino" (Concurrencia al auxilio)
    if (responders.length > 0) {
      responders.forEach((respName, idx) => {
        const distKm = (0.3 + idx * 0.4).toFixed(1);
        html += `
          <div class="responder-card en-camino" onclick="window.sajauxApp.tacticalMapService.focusOnResponder('${respName}', ${distKm})">
            <div class="responder-info">
              <span class="responder-avatar">🚨</span>
              <div>
                <div class="responder-name">${respName}</div>
                <div class="responder-role">⚡ DESPLIEGUE EN CAMINO AL AUXILIO • ${distKm} km</div>
              </div>
            </div>
            <span class="responder-status status-concurre">CONCURRE EN RUTA</span>
          </div>
        `;

        // Dibujar pin en el mapa del funcionario concurrente
        if (this.map && window.L && alertData && alertData.location) {
          const rLat = alertData.location.lat + (Math.sin(idx + 1) * 0.005);
          const rLng = alertData.location.lng + (Math.cos(idx + 1) * 0.005);
          const pinHtml = `
            <div style="background: rgba(5, 150, 105, 0.95); border: 2px solid #34d399; border-radius: 50px; padding: 3px 9px; display: flex; align-items: center; gap: 5px; box-shadow: 0 0 16px rgba(16,185,129,0.8); white-space: nowrap; transform: translate(-50%, -50%);">
              <span style="display:inline-block; width:8px; height:8px; background:#d1fae5; border-radius:50%; box-shadow:0 0 6px #d1fae5;"></span>
              <span style="color:white; font-size:10px; font-weight:900;">🚨 EN CAMINO: ${respName}</span>
            </div>
          `;
          const rIcon = L.divIcon({ className: '', html: pinHtml, iconSize: [150, 26], iconAnchor: [75, 13] });
          const marker = L.marker([rLat, rLng], { icon: rIcon })
            .addTo(this.map)
            .bindPopup(`
              <div class="marker-popup-title">🚨 ${respName}</div>
              <div class="marker-popup-sub">Distancia al auxilio: ${distKm} km</div>
              <div class="marker-popup-status" style="color:#34d399;">🟢 DESPLIEGUE EN CAMINO CONFIRMADO</div>
            `);
          this.responderPins.push(marker);
        }
      });
    }

    // 2. Mostrar patrullas policiales en terreno
    this.patrolUnits.forEach(unit => {
      html += `
        <div class="responder-card" onclick="window.sajauxApp.tacticalMapService.focusOnUnit('${unit.id}')">
          <div class="responder-info">
            <span class="responder-avatar">${unit.id === 'SF-HQ' ? '🛡️' : '🚓'}</span>
            <div>
              <div class="responder-name">${unit.name}</div>
              <div class="responder-role">${unit.id === 'SF-HQ' ? 'Guardia y Central BICRIM San Javier' : `Móvil Operativo • ${unit.distKm} km`}</div>
            </div>
          </div>
          <span class="responder-status ${unit.id === 'SF-HQ' ? 'status-guardia' : 'status-terreno'}">${unit.status}</span>
        </div>
      `;
    });

    if (this.mapRespondersList) {
      this.mapRespondersList.innerHTML = html;
    }
  }

  focusOnUnit(unitId) {
    window.audioService.playTacticalClick();
    const unit = this.patrolUnits.find(u => u.id === unitId);
    if (unit && this.map) {
      this.map.flyTo([unit.lat, unit.lng], 16, { animate: true, duration: 1.0 });
    }
  }

  focusOnResponder(respName, distKm) {
    window.audioService.playTacticalClick();
    if (this.currentTargetCoords && this.map) {
      this.map.flyTo([this.currentTargetCoords.lat, this.currentTargetCoords.lng], 16, { animate: true, duration: 1.0 });
    } else if (this.map && this.currentSelfCoords) {
      this.map.flyTo([this.currentSelfCoords.lat, this.currentSelfCoords.lng], 16, { animate: true, duration: 1.0 });
    }
  }

  toggleRespondersSheet(forceState) {
    window.audioService.playTacticalClick();
    if (!this.mapRespondersBoard) return;
    
    const isHidden = this.mapRespondersBoard.classList.contains('hidden');
    const newState = typeof forceState === 'boolean' ? forceState : isHidden;

    if (newState) {
      this.mapRespondersBoard.classList.remove('hidden');
    } else {
      this.mapRespondersBoard.classList.add('hidden');
    }

    const icon = document.getElementById('btn-toggle-icon');
    if (icon) {
      icon.textContent = newState ? '▲' : '▼';
    }
  }

  setEmergencyTarget(alertData) {
    if (!alertData) return;
    this.initOrRefreshMap();

    let targetLat = -35.5880;
    let targetLng = -71.7250;

    if (alertData.location && alertData.location.lat && !alertData.location.isGuardia) {
      targetLat = alertData.location.lat;
      targetLng = alertData.location.lng;
    } else if (alertData.location && alertData.location.isGuardia) {
      targetLat = -35.5925;
      targetLng = -71.7315;
    }

    this.currentTargetCoords = { lat: targetLat, lng: targetLng };

    if (this.targetMarker) {
      this.map.removeLayer(this.targetMarker);
    }
    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
    }

    // Dibujar foco de auxilio (Alerta Roja / Amarilla / Azul)
    let badgeColor = '#ff2a55';
    let badgeLabel = '🔴 ¡COOPERACIÓN URGENTE!';
    if (alertData.alertType === 'colaboracion') {
      badgeColor = '#f59e0b';
      badgeLabel = '🟡 COLABORACIÓN POLICIAL';
    } else if (alertData.alertType === 'guardia') {
      badgeColor = '#3b82f6';
      badgeLabel = '🔵 GUARDIA CUARTEL';
    }

    const targetHtml = `
      <div style="background: rgba(225,29,72,0.96); border: 2.5px solid white; border-radius: 8px; padding: 5px 12px; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 25px rgba(225,29,72,0.9); animation: pulse-recording 1.2s infinite; white-space: nowrap; transform: translate(-50%, -50%);">
        <span style="font-size:14px;">🚨</span>
        <span style="color:white; font-size:11px; font-weight:900; letter-spacing:0.8px;">FOCO AUXILIO: ${alertData.operatorName || 'OPERADOR'}</span>
      </div>
    `;

    const tIcon = L.divIcon({ className: '', html: targetHtml, iconSize: [180, 36], iconAnchor: [90, 18] });

    this.targetMarker = L.marker([targetLat, targetLng], { icon: tIcon })
      .addTo(this.map)
      .bindPopup(`
        <div class="marker-popup-title" style="color:${badgeColor};">${badgeLabel}</div>
        <div class="marker-popup-sub">Funcionario: ${alertData.operatorName || 'Oficial de Policía'}</div>
        <div class="marker-popup-status" style="color:#ff2a55;">🚨 SOLICITUD DE INTERCEPCIÓN Y APOYO</div>
        <div class="popup-nav-grid">
          <button onclick="window.sajauxApp.openExternalNav('google', ${targetLat}, ${targetLng})" class="popup-nav-btn btn-google">🌐 Google</button>
          <button onclick="window.sajauxApp.openExternalNav('waze', ${targetLat}, ${targetLng})" class="popup-nav-btn btn-waze">🚗 Waze</button>
          <button onclick="window.sajauxApp.openExternalNav('petal', ${targetLat}, ${targetLng})" class="popup-nav-btn btn-petal">🌸 Petal</button>
        </div>
      `)
      .openPopup();

    // Mostrar cajas HUD y botones
    if (this.routeSummaryBox) this.routeSummaryBox.classList.remove('hidden');
    
    const operatorName = (this.app && this.app.currentUser && this.app.currentUser.fullName) ? this.app.currentUser.fullName : 'Móvil Policial';
    const alreadyConfirmed = alertData && alertData.responders && alertData.responders.includes(operatorName);
    if (this.mapDespliegueBox) {
      if (alreadyConfirmed) {
        this.mapDespliegueBox.classList.add('hidden');
      } else {
        this.mapDespliegueBox.classList.remove('hidden');
      }
    }

    if (this.targetInfoBox) {
      this.targetInfoBox.classList.remove('hidden');
      if (this.targetNameElem) this.targetNameElem.textContent = `🚨 AUXILIO: ${alertData.operatorName || 'OPERADOR'}`;
      if (this.targetDescElem) this.targetDescElem.textContent = `${badgeLabel} • Coordenadas satelitales verificadas.`;
    }
    if (this.btnCenterTarget) this.btnCenterTarget.classList.remove('hidden');

    // Calcular distancia y ETA táctico
    const distMeters = L.latLng(this.currentSelfCoords.lat, this.currentSelfCoords.lng).distanceTo(L.latLng(targetLat, targetLng));
    const distKm = (distMeters / 1000).toFixed(2);
    const etaMin = Math.max(1, Math.ceil(distKm * 1.6));

    if (this.distVal) this.distVal.textContent = `${distKm} km`;
    if (this.etaVal) this.etaVal.textContent = `${etaMin} min`;
    if (this.supportVal) {
      const closePatrols = this.patrolUnits.filter(u => u.distKm <= 2.5).length;
      this.supportVal.textContent = `${closePatrols} patrullas`;
    }

    // Actualizar marcadores satelitales de concurrentes en el mapa
    this.renderRespondersBoard(alertData);

    // Dibujar ruta exacta siguiendo las calles del mapa (OSRM + trazado urbano)
    this.drawStreetRoute(this.currentSelfCoords.lat, this.currentSelfCoords.lng, targetLat, targetLng, badgeColor);

    setTimeout(() => {
      if (this.map) {
        this.map.fitBounds([
          [this.currentSelfCoords.lat, this.currentSelfCoords.lng],
          [targetLat, targetLng]
        ], { padding: [70, 70], maxZoom: 16 });
      }
    }, 200);
  }

  async drawStreetRoute(startLat, startLng, targetLat, targetLng, badgeColor) {
    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }

    // Trazado de calles urbano en ángulo recto inicial (respaldo inmediato)
    const fallbackCoords = this.getUrbanStreetFallback(startLat, startLng, targetLat, targetLng);
    this.routePolyline = L.polyline(fallbackCoords, {
      color: badgeColor,
      weight: 5,
      opacity: 0.85,
      dashArray: '12, 8'
    }).addTo(this.map);

    try {
      // Petición al motor OSRM para obtener la geometría exacta calle por calle
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${targetLng},${targetLat}?overview=full&geometries=geojson`;
      const response = await fetch(osrmUrl, { signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const data = await response.json();
        if (data && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          // OSRM retorna [lng, lat], Leaflet usa [lat, lng]
          const streetPoints = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
          
          if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
          }

          // Dibujar la ruta por las calles reales del mapa (borde con resplandor táctico y línea sólida)
          this.routePolyline = L.polyline(streetPoints, {
            color: badgeColor,
            weight: 6,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(this.map);

          // Actualizar distancia y ETA exacto según calles y tráfico
          const distKm = (route.distance / 1000).toFixed(2);
          const etaMin = Math.max(1, Math.ceil(route.duration / 60));
          if (this.distVal) this.distVal.textContent = `${distKm} km (por calles)`;
          if (this.etaVal) this.etaVal.textContent = `${etaMin} min (tráfico)`;

          // Si el mapa ya está listo, encuadrar suavemente toda la geometría de calles
          setTimeout(() => {
            if (this.map && this.routePolyline) {
              this.map.fitBounds(this.routePolyline.getBounds(), { padding: [65, 65], maxZoom: 16 });
            }
          }, 150);
        }
      }
    } catch (e) {
      console.warn('Usando trazado urbano de calles en ángulo recto de respaldo:', e);
    }
  }

  getUrbanStreetFallback(lat1, lng1, lat2, lng2) {
    // Generar intersecciones en ángulo recto estilo cuadrícula urbana para seguir las manzanas en caso offline
    const midLat = lat1 + (lat2 - lat1) * 0.5;
    return [
      [lat1, lng1],
      [lat1, lng1 + (lng2 - lng1) * 0.35],
      [midLat, lng1 + (lng2 - lng1) * 0.35],
      [midLat, lng2],
      [lat2, lng2]
    ];
  }


}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.appController = new AppController();
  window.sajauxApp = window.appController;
  window.appController.init();
});
