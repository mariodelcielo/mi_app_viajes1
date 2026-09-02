const CACHE_NAME = 'gestion-viajes-v1';
const ARCHIVOS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ARCHIVOS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Estrategia: red primero (para llevar datos frescos), y si falla, caché (para abrir offline)
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(resp => {
                const copia = resp.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
                return resp;
            })
            .catch(() => caches.match(event.request))
    );
});
