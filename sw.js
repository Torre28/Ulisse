// Ulisse: guscio dell'app in cache per l'uso offline; notizie, Wikipedia e modelli passano sempre dalla rete.
const CACHE = 'ulisse-v1.3c';
const SHELL = ['./', './index.html', './css/app.css', './js/core.js', './js/data.js', './js/sources.js', './js/ai.js', './js/geo.js', './js/engine.js', './js/views.js', './prompts/piani.json', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // rete prima, cache come riserva: gli aggiornamenti arrivano subito, offline funziona lo stesso
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
