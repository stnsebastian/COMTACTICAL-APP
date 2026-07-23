/**
 * GeoService - SAJAUX Tactical System
 * Maneja la geolocalización GPS exacta de los funcionarios policiales en terreno
 * para emergencias de Colaboración y Cooperación Urgente.
 * NOTA CRÍTICA: Para Cooperación Servicio de Guardia, este servicio devuelve ubicación fija/nula sin activar GPS.
 */

class GeoService {
  constructor() {
    this.lastPosition = null;
  }

  /**
   * Obtiene la ubicación GPS exacta del celular para emergencias en terreno.
   * Si es 'guardia', no consulta GPS y devuelve objeto de ubicación fija.
   * @param {'colaboracion'|'cooperacion'|'guardia'} alertType 
   * @returns {Promise<{lat: number|null, lng: number|null, accuracy: number|null, label: string, isGuardia: boolean, mapUrl: string|null}>}
   */
  async getLocationForAlert(alertType) {
    // REGLA CLAVE: LA COOPERACIÓN SERVICIO DE GUARDIA NO DEBE ENVIAR LA UBICACIÓN GPS
    if (alertType === 'guardia') {
      return {
        lat: null,
        lng: null,
        accuracy: null,
        label: '📍 SERVICIO DE GUARDIA DE LA UNIDAD',
        isGuardia: true,
        mapUrl: null
      };
    }

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('[GeoService] Geolocation no disponible en navegador, usando coordenadas tácticas simuladas');
        const fallback = this.getSimulatedTacticalCoords();
        resolve(fallback);
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = Math.round(position.coords.accuracy || 10);
          const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;

          const geoData = {
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            label: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracy}m)`,
            isGuardia: false,
            mapUrl: mapUrl
          };

          this.lastPosition = geoData;
          resolve(geoData);
        },
        (error) => {
          console.warn('[GeoService] Error al obtener GPS exacto:', error.message);
          if (this.lastPosition && !this.lastPosition.isGuardia) {
            resolve(this.lastPosition);
          } else {
            const fallback = this.getSimulatedTacticalCoords();
            resolve(fallback);
          }
        },
        options
      );
    });
  }

  /**
   * Coordenadas tácticas simuladas en caso de entorno de prueba sin GPS real
   */
  getSimulatedTacticalCoords() {
    const lat = -33.4489 + (Math.random() - 0.5) * 0.01;
    const lng = -70.6693 + (Math.random() - 0.5) * 0.01;
    const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
    
    return {
      lat: lat,
      lng: lng,
      accuracy: 15,
      label: `GPS Táctico: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±15m)`,
      isGuardia: false,
      mapUrl: mapUrl
    };
  }
}

window.geoService = new GeoService();
