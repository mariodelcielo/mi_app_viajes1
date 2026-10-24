const CACHE_NAME = 'gestion-viajes-v5';
const ARCHIVOS = [
    './', './index.html', './rescates-logo.png', './consulta.html',
    './favicon.png', './favicon.ico', './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];

// El backend NUNCA se cachea. Si no hay señal, la app tiene que enterarse y
// usar los datos del celular; si el service worker devolviera una respuesta
// vieja, la app creería que está enlazada y podría pisar cambios locales.
const SIN_CACHE = ['script.google.com', 'script.googleusercontent.com', 'googleusercontent.com'];

// El manifiesto tampoco se guarda: es el que decide CÓMO se abre la app (si el
// teléfono lo tiene viejo, sigue abriendo como ventana de app y el botón atrás
// cierra todo). Siempre se pide a la red, y si no hay seña, se usa el del caché.
const NUNCA_CACHE = ['manifest.json'];

// Tope para la red: con poca señal, una descarga puede quedarse colgada sin
// fallar nunca. Sin este tope, el teléfono se queda en negro esperando.
const TOPE_RED = 4000;

/** Corta una promesa que tarda más de `ms` (red colgada = como si no hubiera). */
function conTope(promesa, ms) {
    return new Promise((resolver, rechazar) => {
        let listo = false;
        const reloj = setTimeout(() => {
            if (listo) return;
            listo = true;
            rechazar(new Error('la red no contestó'));
        }, ms);
        promesa.then(valor => {
            if (listo) return;
            listo = true;
            clearTimeout(reloj);
            resolver(valor);
        }).catch(err => {
            if (listo) return;
            listo = true;
            clearTimeout(reloj);
            rechazar(err);
        });
    });
}

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

// Estrategia: primero lo guardado (abre al instante, aunque no haya señal) y en
// paralelo se pide por red para actualizar la copia para la próxima vez.
// Antes era "red primero": con la red colgada la app quedaba en negro esperando.
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

    // 3) El manifiesto se pide siempre a la red (de él depende cómo se abre la app).
    if (NUNCA_CACHE.some(n => url.pathname.endsWith('/' + n) || url.pathname === '/' + n)) {
        event.respondWith(
            conTope(fetch(req), TOPE_RED).catch(() => caches.match(req))
        );
        return;
    }

    event.respondWith(desdeCacheYActualizar(req));
});

/** Devuelve la copia guardada (si está) y, por atrás, la actualiza desde la red. */
function desdeCacheYActualizar(req) {
    const refresco = conTope(fetch(req), TOPE_RED)
        .then(resp => {
            if (resp && resp.ok) {
                const copia = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
            }
            return resp;
        })
        .catch(() => null);

    return caches.match(req).then(guardada => {
        if (guardada) {
            refresco.catch(() => {});
            return guardada;
        }
        return refresco.then(resp => resp || caches.match('./index.html'));    });
}
