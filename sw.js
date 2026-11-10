// Modo sin internet: guarda la app y la sirve desde el teléfono. Cambiar VERSION en cada cambio publicado.
const VERSION = 'rutina-v3';
const ARCHIVOS = ['./', 'index.html', 'css/app.css', 'js/main.js', 'js/logic.js', 'js/store.js', 'js/agregar.js', 'js/calendario.js', 'js/avisos.js', 'manifest.json', 'icons/icono.svg', 'icons/icono-180.png', 'icons/icono-192.png', 'icons/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para recibir cambios), si no hay conexión, lo guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
// Aviso push del servidor (app cerrada): { title, body, tag }.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Rutina', {
    body: d.body || '', tag: d.tag || 'rutina', icon: 'icons/icono-192.png', badge: 'icons/icono-192.png', data: { ir: 'hoy' },
  }));
});
// Tocar un aviso abre la app en Hoy.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs[0]) { cs[0].postMessage({ ir: 'hoy' }); return cs[0].focus(); }
    return self.clients.openWindow('./?ir=hoy');
  }));
});
