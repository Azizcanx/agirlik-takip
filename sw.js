const V = 'agirlik-v17';
const DOSYALAR = ['./', 'index.html', 'style.css', 'hareketler.js', 'app.js', 'bulk.js', 'notlar.js', 'disa.js', 'ekstra.js', 'pc.js', 'takviye.js', 'duzenle.js', 'ozet.js', 'haftalik.js', 'komut.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(DOSYALAR))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => { const k = r.clone(); caches.open(V).then(c => c.put(e.request, k)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
