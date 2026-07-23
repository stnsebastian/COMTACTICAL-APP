const CACHE_NAME = 'sajaux-tactical-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './audio-service.js',
  './geo-service.js',
  './network-service.js',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precargando assets PWA SAJAUX v1');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando caché antigua SAJAUX:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Estrategia Red-Primero para archivos de código y HTML para garantizar siempre las últimas funciones
  if (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
  } else {
    // Cache-Primero solo para íconos e imágenes estáticas
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});

// Manejo de eventos de clic en notificación push para traer la app al frente o abrirla
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la PWA ya está abierta (en segundo plano o pestaña), enfocar y ordenar desplegar baliza
      for (const client of clientList) {
        if ('focus' in client && 'postMessage' in client) {
          client.postMessage({ type: 'ALERT_RESTORE_FOCUS' });
          return client.focus();
        }
      }
      // Si estaba cerrada, abrir página principal
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

// Manejo de recepción de mensajes desde app.js (alerta recibida por WebSocket estando minimizado)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_EMERGENCY_NOTIFICATION') {
    const alertData = event.data.alertData || {};
    let typeTitle = '🟡 COLABORACIÓN POLICIAL';
    if (alertData.alertType === 'cooperacion') typeTitle = '🔴 ¡COOPERACIÓN URGENTE!';
    if (alertData.alertType === 'guardia') typeTitle = '🔵 COOPERACIÓN SERVICIO DE GUARDIA';

    const options = {
      body: `Operador: ${alertData.operatorName || 'Funcionario Policial'} - TOCA PARA DESPLEGAR BALIZA Y MAPA GPS`,
      icon: './icon-192.svg',
      badge: './icon-192.svg',
      vibrate: [600, 200, 600, 200, 600, 200, 600, 200, 600],
      requireInteraction: true,
      renotify: true,
      tag: alertData.id || 'sajaux-emergency-live'
    };

    event.waitUntil(
      self.registration.showNotification(`🚨 SAJAUX: ${typeTitle}`, options).then(() => {
        return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          for (const client of clientList) {
            if ('focus' in client) {
              client.postMessage({ type: 'ALERT_RESTORE_FOCUS', alertData });
              client.focus().catch(() => {});
            }
          }
        });
      })
    );
  } else if (event.data.type === 'WAKE_AND_FOCUS_CLIENTS') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'ALERT_RESTORE_FOCUS', alertData: event.data.alertData });
            client.focus().catch(() => {});
          }
        }
      })
    );
  }
});

// Manejo de recepción de Push remoto
self.addEventListener('push', (event) => {
  let data = { title: '🚨 SAJAUX ALERTA POLICIAL', body: 'Alerta entrante en la unidad BICRIM SAN JAVIER.' };
  if (event.data) {
    try {
      const parsed = event.data.json();
      data.title = parsed.title || data.title;
      data.body = parsed.body || data.body;
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './icon-192.svg',
    badge: './icon-192.svg',
    vibrate: [600, 200, 600, 200, 600, 200, 600],
    requireInteraction: true,
    renotify: true,
    tag: 'sajaux-emergency'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).then(() => {
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'ALERT_RESTORE_FOCUS' });
            client.focus().catch(() => {});
          }
        }
      });
    })
  );
});
