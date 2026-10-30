/* pc.js: modül (window.AT'ye kayıt olur)
   1) Dinlenme bitince ses (bilgisayarda titreşim yok). S.ses: false ise kapalı, varsayılan açık. Web Audio, dosya yok.
   2) Otomatik yedek (Edge/Chrome masaüstü, File System Access): seçilen klasöre günde bir JSON, son 14 gün tutulur.
      Klasör tutamacı IndexedDB'de; veri değişmediyse yazılmaz. Tarayıcı izni düşerse Ayarlar'da "İzin ver".
   AT.bolum.ses() / AT.bolum.otoyedek() -> Ayarlar parçaları · AT.restBitti() -> app.js restCiz çağırır */
(function (AT) {
'use strict';

/* ---------- ses ---------- */
var ctx = null;
function sesAc() {   /* tarayıcı sesi yalnız kullanıcı dokunuşundan sonra açar: ilk tıklamada hazırla */
  var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  try { if (!ctx) ctx = new C(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { ctx = null; }
}
function bip(t0, f, sure) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
  o.start(t0); o.stop(t0 + sure + 0.02);
}
function calSes() {
  if (AT.S.ses === false || !ctx) return;
  try { var t = ctx.currentTime + 0.02; bip(t, 880, 0.18); bip(t + 0.24, 880, 0.18); bip(t + 0.48, 1175, 0.32); } catch (e) {}
}
document.addEventListener('pointerdown', sesAc, true);
document.addEventListener('keydown', sesAc, true);
AT.restBitti = calSes;

/* ---------- otomatik yedek ---------- */
var DESTEK = typeof window.showDirectoryPicker === 'function' && !!window.indexedDB;
var SAKLA = 14, ONEK = 'agirlik-yedek-', LS = 'agirlik-otoyedek';
var klasor = null, izin = 'yok', yaziyor = false;   /* izin: yok | granted | prompt | denied */

function db(islem, deger) {
  return new Promise(function (ok, red) {
    var r = indexedDB.open('agirlik-takip', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onerror = function () { red(r.error); };
    r.onsuccess = function () {
      var t = r.result.transaction('kv', islem === 'al' ? 'readonly' : 'readwrite'), s = t.objectStore('kv');
      var q = islem === 'al' ? s.get('klasor') : islem === 'koy' ? s.put(deger, 'klasor') : s.delete('klasor');
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { red(q.error); };
      t.oncomplete = function () { r.result.close(); };
    };
  });
}
function bilgi() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
function ozet(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return s.length + ':' + x; }

function izinBak() {
  if (!klasor) { izin = 'yok'; return Promise.resolve(izin); }
  return klasor.queryPermission({ mode: 'readwrite' }).then(function (p) { izin = p; return p; }, function () { izin = 'prompt'; return izin; });
}
/* zorla: veri aynı olsa da yaz (Şimdi yedekle) */
function yedekle(zorla) {
  if (!klasor || izin !== 'granted' || yaziyor) return Promise.resolve(false);
  var metin = JSON.stringify(AT.S, null, 2), oz = ozet(metin), b = bilgi(), gun = AT.iso(new Date());
  if (!zorla && b.oz === oz) return Promise.resolve(false);
  yaziyor = true;
  return klasor.getFileHandle(ONEK + gun + '.json', { create: true })
    .then(function (f) { return f.createWritable(); })
    .then(function (w) { return w.write(metin).then(function () { return w.close(); }); })
    .then(function () { localStorage.setItem(LS, JSON.stringify({ oz: oz, t: Date.now() })); return temizle(); })
    .then(function () { yaziyor = false; ciz(); return true; }, function () { yaziyor = false; izinBak().then(ciz); return false; });
}
function temizle() {
  if (!klasor.values) return Promise.resolve();
  var adlar = [], it = klasor.values();
  function sonraki() {
    return it.next().then(function (r) {
      if (r.done) return;
      if (r.value.kind === 'file' && /^agirlik-yedek-\d{4}-\d{2}-\d{2}\.json$/.test(r.value.name)) adlar.push(r.value.name);
      return sonraki();
    });
  }
  return sonraki().then(function () {
    adlar.sort();
    return Promise.all(adlar.slice(0, Math.max(0, adlar.length - SAKLA)).map(function (a) { return klasor.removeEntry(a); }));
  }).catch(function () {});
}

/* ---------- Ayarlar bölümü ---------- */
function zaman(t) { var d = new Date(t); return AT.tarih(AT.iso(d), 1) + ' ' + AT.p2(d.getHours()) + ':' + AT.p2(d.getMinutes()); }
function yedekHTML() {
  var b = bilgi();
  if (!klasor) return '<p class="mut">Seçtiğin klasöre her gün bir yedek dosyası yazılır, son ' + SAKLA + ' gün saklanır. OneDrive içinde bir klasör seçersen yedek buluta da gider.</p>' +
    '<button class="btn-big" data-act="oy-sec">Yedek klasörü seç</button>';
  var ad = AT.h(klasor.name);
  if (izin === 'granted') return '<p class="durum iyi">Açık · klasör: ' + ad + (b.t ? ' · son yedek ' + AT.h(zaman(b.t)) : '') + '</p>' +
    '<div class="row"><button class="btn-ghost mini" data-act="oy-simdi">Şimdi yedekle</button><span class="grow"></span><button class="btn-ghost mini" data-act="oy-kapat">Kapat</button></div>';
  return '<p class="durum uyari">Tarayıcı izni yenilemeni istiyor · klasör: ' + ad + (b.t ? ' · son yedek ' + AT.h(zaman(b.t)) : '') + '</p>' +
    '<div class="row"><button class="btn-ac" data-act="oy-izin">İzin ver</button><span class="grow"></span><button class="btn-ghost mini" data-act="oy-kapat">Kapat</button></div>';
}
function ciz() { var e = AT.$('#otoyedek'); if (e) e.innerHTML = yedekHTML(); }

/* Ayarlar > Antrenman paneli içinde bir alan */
AT.bolum.ses = function () {
  var acik = AT.S.ses !== false;
  return '<div class="alan"><span>Dinlenme bitince sesli uyarı</span><div class="seg" role="group" aria-label="Dinlenme sesi">' +
    [[0, 'Kapalı'], [1, 'Açık']].map(function (t) { return '<button data-act="ses" data-v="' + t[0] + '" aria-pressed="' + (acik === !!t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div>';
};
/* Ayarlar > Yedek altında; yalnız klasör yazabilen tarayıcıda (Edge/Chrome masaüstü) */
AT.bolum.otoyedek = function () {
  if (!DESTEK) return '';
  setTimeout(function () { izinBak().then(ciz); }, 0);
  return '<h2>Otomatik yedek <small>bu bilgisayar</small></h2><div class="panel" id="otoyedek">' + yedekHTML() + '</div>';
};
AT.islem.ses = function (d) { AT.S.ses = d.v === '1'; AT.kaydet(); AT.render(); if (AT.S.ses) { sesAc(); calSes(); } };
AT.islem['oy-sec'] = function () {
  window.showDirectoryPicker({ id: 'agirlik-yedek', mode: 'readwrite', startIn: 'documents' }).then(function (k) {
    klasor = k; izin = 'granted'; return db('koy', k);
  }).then(function () { return yedekle(true); }).then(function (y) { ciz(); if (y) AT.toast('Otomatik yedek açık'); })
    .catch(function (e) { if (e && e.name !== 'AbortError') AT.toast('Klasör seçilemedi'); });
};
AT.islem['oy-izin'] = function () {
  if (!klasor) return;
  klasor.requestPermission({ mode: 'readwrite' }).then(function (p) { izin = p; return p === 'granted' ? yedekle(false) : false; }).then(ciz, ciz);
};
AT.islem['oy-simdi'] = function () { yedekle(true).then(function (y) { AT.toast(y ? 'Yedeklendi' : 'Yedeklenemedi'); }); };
AT.islem['oy-kapat'] = function () {
  klasor = null; izin = 'yok'; localStorage.removeItem(LS);
  db('sil').then(ciz, ciz); AT.toast('Otomatik yedek kapandı (eski dosyalar klasörde duruyor)');
};

/* açılışta klasörü yükle; değişiklik varsa 2 dakikada bir ve pencereden çıkınca yaz */
if (DESTEK) {
  document.addEventListener('DOMContentLoaded', function () {
    db('al').then(function (k) {
      if (!k) return;
      klasor = k;
      return izinBak().then(function (p) {
        ciz();
        if (p === 'granted') return yedekle(false);
        var b = bilgi(), bugun = AT.iso(new Date());
        if (b.uyari !== bugun) { b.uyari = bugun; localStorage.setItem(LS, JSON.stringify(b)); setTimeout(function () { AT.toast('Otomatik yedek için Ayarlar\'dan izin ver'); }, 1500); }
      });
    }).catch(function () {});
  });
  setInterval(function () { yedekle(false); }, 120000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) yedekle(false); });
}

AT._pc = { ozet: ozet, calSes: calSes, yedekle: yedekle, kur: function (k, i) { klasor = k; izin = i; } };   /* test için */
})(window.AT);
