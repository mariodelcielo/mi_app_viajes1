const CACHE_NAME = 'gestion-viajes-v2';
const ARCHIVOS = [
    './', './index.html', './manifest.json', './rescates-logo.png', './consulta.html',
    './favicon.png', './favicon.ico', './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];

// El backend NUNCA se cachea. Si no hay señal, la app tiene que enterarse y
// usar los datos del celular; si el service worker devolviera una respuesta
// vieja, la app creería que está enlazada y podría pisar cambios locales.
const SIN_CACHE = ['script.google.com', 'script.googleusercontent.com', 'googleusercontent.com'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // Se agrega archivo por archivo: si falta uno, no se cae toda la instalación.
            .then(cache => Promise.all(ARCHIVOS.map(a => cache.add(a).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Estrategia: red primero (datos frescos) y caché solo si no hay señal.
self.addEventListener('fetch', event => {
    const req = event.request;

    // Los POST (guardar en la planilla) nunca pasan por el caché.
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // 1) La API de Apps Script queda fuera del service worker.
    if (SIN_CACHE.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;

    // 2) Solo manejamos archivos propios; el resto lo resuelve el navegador.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then(resp => {
                if (resp && resp.ok) {
                    const copia = resp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(req, copia)).catch(() => {});
                }
                return resp;
            })
            .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
});
