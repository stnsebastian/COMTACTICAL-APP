/**
 * NetworkService - SAJAUX Tactical System
 * Canal de comunicación táctica en tiempo real utilizando WebSockets (MQTT sobre WSS)
 * para sincronizar alertas instantáneamente por Internet/Wi-Fi/4G entre celulares vinculados,
 * y BroadcastChannel para pestañas locales en el mismo equipo.
 */

class NetworkService {
  constructor() {
    this.channelName = 'sajaux_emergency_channel_v1';
    this.cloudTopic = 'sajaux/bicrim_san_javier/tactical_alerts_v1';
    
    // Identificador único por dispositivo físico para evitar que el emisor reciba su propio eco
    this.deviceId = localStorage.getItem('sajaux_device_id');
    if (!this.deviceId) {
      this.deviceId = `CEL_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      localStorage.setItem('sajaux_device_id', this.deviceId);
    }

    this.channel = null;
    this.mqttClient = null;
    this.isCloudConnected = false;
    this.listeners = [];
    this.statusListeners = [];

    this.initLocalChannel();
    this.initCloudClient();
  }

  initLocalChannel() {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event) => {
        const alertData = event.data;
        if (alertData && alertData.id) {
          console.log('[NetworkService] Alerta recibida vía BroadcastChannel local:', alertData);
          this.saveToLocalHistory(alertData);
          this.notifyListeners(alertData, false);
        }
      };
    }
  }

  initCloudClient() {
    if (typeof mqtt === 'undefined') {
      console.warn('[NetworkService] Librería MQTT no cargada. Solo comunicación en el mismo dispositivo.');
      return;
    }

    try {
      // Conectar a broker público MQTT de alta disponibilidad por WebSocket Seguro (WSS)
      console.log('[NetworkService] Conectando a servidor táctico en la nube (broker.emqx.io)...');
      this.mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
        clientId: `sajaux_${this.deviceId}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 3000
      });

      this.mqttClient.on('connect', () => {
        console.log('[NetworkService] 🟢 Conectado con éxito al canal cloud:', this.cloudTopic);
        this.isCloudConnected = true;
        this.notifyStatusListeners(true);

        this.mqttClient.subscribe(this.cloudTopic, { qos: 1 }, (err) => {
          if (!err) {
            console.log('[NetworkService] Suscrito a alertas tácticas SAJAUX');
          }
        });
      });

      this.mqttClient.on('message', (topic, message) => {
        if (topic === this.cloudTopic) {
          try {
            const alertData = JSON.parse(message.toString());
            // Si el mensaje fue enviado por este exacto celular, ignorar el eco remoto
            if (alertData && alertData.senderDeviceId === this.deviceId) {
              return;
            }
            console.log('[NetworkService] 🚨 ALERTA RECIBIDA POR INTERNET DESDE OTRO CELULAR:', alertData);
            this.saveToLocalHistory(alertData);
            this.notifyListeners(alertData, false);
          } catch (e) {
            console.error('[NetworkService] Error al procesar mensaje cloud:', e);
          }
        }
      });

      this.mqttClient.on('offline', () => {
        console.warn('[NetworkService] 🟡 Conexión cloud desconectada temporalmente...');
        this.isCloudConnected = false;
        this.notifyStatusListeners(false);
      });

      this.mqttClient.on('error', (err) => {
        console.warn('[NetworkService] Error en WebSocket cloud:', err);
      });
    } catch (e) {
      console.error('[NetworkService] No se pudo iniciar cliente cloud:', e);
    }
  }

  onAlertReceived(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.statusListeners.push(callback);
      callback(this.isCloudConnected);
    }
  }

  notifyStatusListeners(isConnected) {
    this.statusListeners.forEach(cb => {
      try { cb(isConnected); } catch(e) {}
    });
  }

  notifyListeners(alertData, isLocalBroadcast) {
    this.listeners.forEach(cb => {
      try {
        cb(alertData, isLocalBroadcast);
      } catch (e) {
        console.error('Error en listener de alerta:', e);
      }
    });
  }

  /**
   * Emite una nueva alerta táctica a toda la red SAJAUX (Cloud + Local)
   * @param {Object} alertObj 
   */
  broadcastAlert(alertObj) {
    const alertData = {
      ...alertObj,
      id: alertObj.id || `SAJAUX_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      senderDeviceId: this.deviceId,
      timestamp: alertObj.timestamp || new Date().toISOString(),
      timeFormatted: alertObj.timeFormatted || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // 1. Guardar en historial local
    this.saveToLocalHistory(alertData);

    // 2. Enviar por Internet / Wi-Fi / 4G a otros celulares de la red (MQTT WebSocket)
    if (this.mqttClient && this.isCloudConnected) {
      try {
        this.mqttClient.publish(this.cloudTopic, JSON.stringify(alertData), { qos: 1 });
        console.log('[NetworkService] 📡 Alerta enviada por Internet a la red de celulares.');
      } catch (e) {
        console.warn('[NetworkService] Error al publicar en cloud:', e);
      }
    }

    // 3. Enviar a otras pestañas o ventanas locales del mismo dispositivo
    if (this.channel) {
      try {
        this.channel.postMessage(alertData);
      } catch (e) {
        console.warn('No se pudo postMessage al canal local:', e);
      }
    }

    // 4. Notificar a la propia app local que se emitió con éxito
    this.notifyListeners(alertData, true);
    return alertData;
  }

  saveToLocalHistory(alertData) {
    try {
      const history = this.getAlertHistory();
      const existingIndex = history.findIndex(item => item.id === alertData.id);
      if (existingIndex >= 0) {
        const oldAlert = history[existingIndex];
        const mergedResponders = [...(oldAlert.responders || [])];
        
        (alertData.responders || []).forEach(inResp => {
          const inName = typeof inResp === 'object' ? inResp.name : inResp;
          const mIdx = mergedResponders.findIndex(r => (typeof r === 'object' ? r.name : r) === inName);
          if (mIdx >= 0) {
            mergedResponders[mIdx] = inResp;
          } else {
            mergedResponders.push(inResp);
          }
        });
        alertData.responders = mergedResponders;
        // Si el que mandó la alerta no mandó location (ej. es un update de un responder), preservamos el location original
        if (!alertData.location && oldAlert.location) {
          alertData.location = oldAlert.location;
        }

        // Fusión de notas de audio múltiples
        const mergedAudioNotes = [...(oldAlert.audioNotes || [])];
        (alertData.audioNotes || []).forEach(inAudio => {
          const exists = mergedAudioNotes.find(a => a.url === inAudio.url);
          if (!exists) {
            mergedAudioNotes.push(inAudio);
          }
        });
        // Agregar compatibilidad con audioNote simple viejo
        if (alertData.audioNote && !mergedAudioNotes.find(a => a.url === alertData.audioNote)) {
          mergedAudioNotes.push({ url: alertData.audioNote, operator: alertData.operatorName || 'Operador', timestamp: alertData.timeFormatted });
        }
        alertData.audioNotes = mergedAudioNotes;
        if (mergedAudioNotes.length > 0) {
          alertData.audioNote = mergedAudioNotes[mergedAudioNotes.length - 1].url;
        }

        history[existingIndex] = alertData;
      } else {
        history.unshift(alertData);
      }
      const trimmed = history.slice(0, 50);
      localStorage.setItem('sajaux_alerts_history', JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Error al guardar en localStorage:', e);
    }
  }

  getAlertHistory() {
    try {
      const raw = localStorage.getItem('sajaux_alerts_history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  clearHistory() {
    localStorage.removeItem('sajaux_alerts_history');
  }

  /**
   * Simula una alerta entrante de prueba desde unidades operativas en terreno o central
   */
  simulateIncomingAlert(forcedType) {
    const types = ['colaboracion', 'cooperacion', 'guardia'];
    const selectedType = forcedType || types[Math.floor(Math.random() * types.length)];
    
    const simulatedOperators = [
      'Sargento 1ro M. TORRES VALDÉS',
      'Cabo 2do P. SALAS MUÑOZ',
      'Suboficial R. BRAVO CASTRO',
      'Teniente A. FUENTES TAPIA',
      'Cabo 1ro C. SEPÚLVEDA VERA'
    ];
    
    const operator = simulatedOperators[Math.floor(Math.random() * simulatedOperators.length)];
    
    let locationData;
    if (selectedType === 'guardia') {
      locationData = {
        lat: null,
        lng: null,
        accuracy: null,
        label: '📍 SERVICIO DE GUARDIA DE LA UNIDAD',
        isGuardia: true,
        mapUrl: null
      };
    } else {
      const lat = -33.4489 + (Math.random() - 0.5) * 0.02;
      const lng = -70.6693 + (Math.random() - 0.5) * 0.02;
      locationData = {
        lat: lat,
        lng: lng,
        accuracy: 12,
        label: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±12m)`,
        isGuardia: false,
        mapUrl: `https://www.google.com/maps?q=${lat},${lng}`
      };
    }

    const alertData = {
      id: `SIM_${Date.now()}`,
      operatorName: operator,
      alertType: selectedType,
      location: locationData,
      audioNote: null,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    console.log('[NetworkService] Simulating incoming tactical alert:', alertData);
    this.saveToLocalHistory(alertData);
    this.notifyListeners(alertData, false);
    return alertData;
  }
}

window.networkService = new NetworkService();
