/* Ağırlık Takip service worker: internetsiz çalışma.
   - Yalnız aynı kökenli GET'lere karışır. Dış istekler (GitHub eşitleme API'si) hiç yakalanmaz: eski bir gist yanıtı
     önbellekten "güncel" diye dönüp eşitleme birleştirmesinde yeni kayıtları sildirmesin.
   - Ağ önce. Başarılı yanıt (200, aynı köken, yönlendirmesiz) önbelleği tazeler; 404/5xx gibi hatalı yanıt iyi kopyanın
     üstüne yazılmaz, önbellekte kopya varsa o verilir.
   - Zayıf internet (salon): sayfa BEKLE ms içinde gelmezse önbellekten açılır, ağ yanıtı arka planda önbelleğe yazılır.
     Sayfa önbellekten açıldıysa aynı yüklemedeki dosyalar da önbellekten gelir (beklemesin, sürümler karışmasın).
   - Kurulum HTTP önbelleğini atlar (cache: 'reload'): yeni sürüm eski dosyalarla kurulmasın.
   Test: Temp/agt/sw-test.js (sahte fetch/caches) ve yavaş/kopuk sunucuyla tarayıcıda. */
const V = 'agirlik-v29';
const DOSYALAR = ['./', 'index.html', 'style.css', 'hareketler.js', 'app.js', 'bulk.js', 'notlar.js', 'disa.js', 'ekstra.js', 'pc.js', 'takviye.js', 'duzenle.js', 'ozet.js', 'haftalik.js', 'komut.js', 'esitle.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const BEKLE = 3000, ONBELLEK_MODU = 15000;
let onbellekten = 0;   /* son sayfa önbellekten açıldıysa zamanı */

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(DOSYALAR.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))));
  self.clients.claim();
});

function iyi(r) { return !!r && r.ok && r.type === 'basic' && !r.redirected; }
function onbellekte(q) {
  return caches.open(V).then(c => c.match(q, { ignoreSearch: true })
    .then(r => r || (q.mode === 'navigate' ? c.match('index.html') : undefined)));
}

self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET' || new URL(q.url).origin !== self.location.origin) return;
  if (q.cache === 'only-if-cached' && q.mode !== 'same-origin') return;
  const sayfa = q.mode === 'navigate';

  /* sayfa az önce önbellekten açıldı: dosyalar da önbellekten (yoksa ağdan) */
  if (!sayfa && Date.now() - onbellekten < ONBELLEK_MODU) {
    e.respondWith(onbellekte(q).then(r => r || fetch(q)).catch(() => Response.error()));
    return;
  }

  let yazim = Promise.resolve();
  const ag = fetch(q).then(r => {
    if (iyi(r)) { const k = r.clone(); yazim = caches.open(V).then(c => c.put(q, k)); }
    return r;
  });
  e.waitUntil(ag.then(() => yazim, () => {}).catch(() => {}));

  e.respondWith(new Promise(coz => {
    let verildi = false, sure = null;
    const ver = r => { if (verildi || !r) return false; verildi = true; clearTimeout(sure); coz(r); return true; };
    const onbellekVer = () => onbellekte(q).then(r => { if (ver(r) && sayfa) onbellekten = Date.now(); return !!r; });
    if (sayfa) sure = setTimeout(onbellekVer, BEKLE);   /* zayıf internet: sayfa BEKLE ms sonra önbellekten */
    ag.then(r => {
      if (iyi(r) || r.type === 'opaqueredirect') { ver(r); if (sayfa) onbellekten = 0; return; }   /* yönlendirmeyi tarayıcı izlesin */
      onbellekte(q).then(c => { ver(c || r); });                                                    /* 404/5xx: varsa iyi kopya */
    }, () => {
      onbellekVer().then(var_ => { if (!var_) ver(Response.error()); });                             /* ağ yok */
    });
  }));
});
