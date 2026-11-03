/* arsiv.js: modül (window.AT'ye kayıt olur). G19 "Kanıtlı arşiv": geri yüklenebilirliği kanıtlanan yedek.
   - Zarf: {sema, uygulama, olusturma, cihaz, ozet, sayim, veri}. Zarfsız düz JSON (eski yedek) okunmaya devam eder.
   - Hepsi EŞZAMANLI: iOS paylaşım sayfası kullanıcı dokunuşuyla aynı turda açılmalı; async özet dokunuş iznini düşürebilir.
     Bu yüzden özet SubtleCrypto yerine saf JS SHA-256 (TextEncoder yoksa FNV-1a yedek, "fnv:" önekiyle).
   - ac(metin): BELLEKTE doğrular (ayrıştır, zarf şeması, özet, sayımlar, göç); mevcut veriye dokunmaz.
   - kiyas(): yedek ↔ şu anki veri tek satırlık özet ("3 antrenman kaybolur"). prova(): üretilen dosyayı geri okur.
   - Cihaza özel (eşitlenmez): 'agirlik-yedek-dogrulandi' (son doğrulanan yedek anı), 'agirlik-geri-yukleme-sinandi' (gerçek geri yükleme anı).
   - semaGoc: gelecek şema için göç iskeleti (GOC[n] = n → n+1 işlevi; şimdilik boş, SEMA = 1).
   Test: test/birim/arsiv-test.js. AT.arsiv */
(function (AT) {
'use strict';

var SEMA = 1, UYGULAMA = 'agirlik-v67';
var K_DOGR = 'agirlik-yedek-dogrulandi', K_SINA = 'agirlik-geri-yukleme-sinandi', K_CIHAZ = 'agirlik-cihaz-id';
var GOC = {};   /* GOC[n] = function (veri) { ...; return veriN+1 } */
var AD = [['antrenman', 'antrenman'], ['set', 'set'], ['tarti', 'tartı'], ['kcal', 'kalori günü'], ['defter', 'not'], ['takviye', 'takviye'], ['donem', 'dönem']];

/* ---------- özet (hash) ---------- */
var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function utf8(s) { return new TextEncoder().encode(s); }
function sha256(bytes) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var n = bytes.length, tam = (((n + 9 + 63) >> 6) << 6), m = new Uint8Array(tam), w = new Array(64), i, j;
  m.set(bytes); m[n] = 0x80;
  var bit = n * 8, hi = Math.floor(bit / 4294967296), lo = bit >>> 0;
  m[tam - 8] = hi >>> 24; m[tam - 7] = hi >>> 16; m[tam - 6] = hi >>> 8; m[tam - 5] = hi; m[tam - 4] = lo >>> 24; m[tam - 3] = lo >>> 16; m[tam - 2] = lo >>> 8; m[tam - 1] = lo;
  function r(x, k) { return (x >>> k) | (x << (32 - k)); }
  for (var o = 0; o < tam; o += 64) {
    for (i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (i = 16; i < 64; i++) { var s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
    for (j = 0; j < 64; j++) {
      var t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[j] + w[j]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + hh) | 0;
  }
  return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
}
function fnv(s) { var x = 0x811c9dc5; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return ('00000000' + x.toString(16)).slice(-8); }
function ozetle(metin) { return typeof TextEncoder !== 'undefined' ? 'sha256:' + sha256(utf8(metin)) : 'fnv:' + fnv(metin); }
function ozetKontrol(metin, ozet) {
  if (/^fnv:/.test(ozet)) return ozet === 'fnv:' + fnv(metin);
  return /^sha256:/.test(ozet) && ozet === ozetle(metin);
}

/* ---------- sayım / aralık ---------- */
function liste(l) { return Array.isArray(l) ? l : []; }
function sayim(S) {
  S = S || {};
  var set = 0; liste(S.sessions).forEach(function (se) { liste(se && se.exs).forEach(function (e) { liste(e && e.sets).forEach(function (x) { if (x && x.done) set++; }); }); });
  return {
    antrenman: liste(S.sessions).length, set: set, tarti: liste(S.bw).length, kcal: liste(S.kcal).length, defter: liste(S.defter).length,
    takviye: liste(S.takviye && S.takviye.liste).length, donem: liste(S.donemGecmis).length + (S.donem ? 1 : 0)
  };
}
function aralik(S) {
  var lo = null, hi = null;
  [S.sessions, S.bw, S.kcal].forEach(function (l) { liste(l).forEach(function (x) { var d = x && x.date; if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return; if (lo == null || d < lo) lo = d; if (hi == null || d > hi) hi = d; }); });
  return lo ? { bas: lo, bit: hi } : null;
}
function tarihYaz(s) { var a = String(s).split('-'), ay = (AT.AYLAR || [])[+a[1] - 1]; return ay ? +a[2] + ' ' + ay.slice(0, 3) + ' ' + a[0] : s; }

/* ---------- zarf üret / aç ---------- */
function cihazId(env) {
  try { var v = env.ls.getItem(K_CIHAZ); if (!v) { v = Math.random().toString(36).slice(2, 8); env.ls.setItem(K_CIHAZ, v); } return v; } catch (e) { return 'x'; }
}
/* S → {metin, zarf}: dosyaya yazılacak JSON metni. veri önce JSON dönüşümünden geçirilir (undefined düşer): özet dosyadakiyle aynı baytlara bakar */
function uret(S, env) {
  env = env || ortam();
  var veri = JSON.parse(JSON.stringify(S)), vm = JSON.stringify(veri);
  var zarf = { sema: SEMA, uygulama: UYGULAMA, olusturma: new Date(env.now()).toISOString(), cihaz: cihazId(env), ozet: ozetle(vm), sayim: sayim(veri), veri: veri };
  return { metin: JSON.stringify(zarf, null, 2), zarf: zarf };
}
function semaGoc(veri, nereden, nereye) {
  for (var n = nereden; n < nereye; n++) {
    if (typeof GOC[n] !== 'function') throw new Error('Şema ' + n + ' → ' + (n + 1) + ' göçü yok');
    veri = GOC[n](veri);
  }
  return veri;
}
function esit(a, b) { return Object.keys(a).every(function (k) { return a[k] === b[k]; }) && Object.keys(b).length === Object.keys(a).length; }
function hata(neden) { return { ok: false, neden: neden }; }
/* metin → {ok, zarfli, veri, sayim, aralik, zarf} | {ok:false, neden}. Hiçbir şeyi değiştirmez. */
function ac(metin) {
  var j;
  try { j = JSON.parse(metin); } catch (e) { return hata('Dosya okunamadı: geçerli bir JSON değil'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return hata('Bu bir Ağırlık Takip yedeği değil');
  var zarfli = j.sema != null && j.veri != null, veri = zarfli ? j.veri : j;
  if (zarfli) {
    if (typeof j.sema !== 'number' || j.sema < 1 || j.sema % 1) return hata('Yedek zarfı bozuk: şema numarası geçersiz');
    if (j.sema > SEMA) return hata('Bu yedek daha yeni bir sürümden (şema ' + j.sema + '); önce uygulamayı güncelle');
    if (!veri || typeof veri !== 'object' || Array.isArray(veri)) return hata('Yedek zarfı bozuk: veri eksik');
    if (typeof j.ozet !== 'string' || !ozetKontrol(JSON.stringify(veri), j.ozet)) return hata('Dosya bozulmuş ya da sonradan değiştirilmiş: özet uyuşmuyor');
    if (!j.sayim || typeof j.sayim !== 'object' || !esit(j.sayim, sayim(veri))) return hata('Dosya bozulmuş: kayıt sayıları tutmuyor');
    if (j.sema < SEMA) { try { veri = semaGoc(veri, j.sema, SEMA); } catch (e) { return hata(e.message); } }
  }
  if (!Array.isArray(veri.sessions)) return hata('Bu bir Ağırlık Takip yedeği değil: antrenman listesi yok');
  if (veri.bw != null && !Array.isArray(veri.bw)) return hata('Yedek bozuk: kilo kayıtları liste değil');
  return { ok: true, zarfli: zarfli, veri: veri, zarf: zarfli ? { sema: j.sema, uygulama: j.uygulama, olusturma: j.olusturma, cihaz: j.cihaz } : null, sayim: sayim(veri), aralik: aralik(veri) };
}

/* yedek ↔ şu anki veri. satir: tek satır özet; kayip: {ad: adet} yalnız azalanlar (yedek geri yüklenince kaybolacak) */
function kiyas(yedek, mevcut) {
  var kayip = {}, kayipYazi = [], yaz = [];
  AD.forEach(function (a) {
    var y = yedek[a[0]] || 0, m = mevcut[a[0]] || 0;
    if (m > y) { kayip[a[0]] = m - y; if (a[0] !== 'set') kayipYazi.push((m - y) + ' ' + a[1]); }
  });
  [['antrenman', 'antrenman'], ['tarti', 'tartı']].forEach(function (a) { if ((yedek[a[0]] || 0) || (mevcut[a[0]] || 0)) yaz.push(a); });
  var s = 'Yedek: ' + (yedek.antrenman || 0) + ' antrenman · ' + (yedek.tarti || 0) + ' tartı · şu an ' + (mevcut.antrenman || 0) + ' antrenman · ' + (mevcut.tarti || 0) + ' tartı';
  s += kayipYazi.length ? '; ' + kayipYazi.join(', ') + ' kaybolur.' : '; hiçbir kayıt kaybolmaz.';
  return { satir: s, kayip: kayip, kayipVar: kayipYazi.length > 0 };
}
/* geri yükleme onayı metni (tek satır özet + aralık) */
function onayMetni(r, mevcutS) {
  var k = kiyas(r.sayim, sayim(mevcutS)), s = k.satir;
  if (r.aralik) s += ' (' + tarihYaz(r.aralik.bas) + ' – ' + tarihYaz(r.aralik.bit) + ')';
  if (!r.zarfli) s += ' Eski biçim: özet yok, yalnız yapı doğrulandı.';
  return s;
}

/* yedek provası: üretilen dosya metni bellekte geri okunur ve S ile sayım olarak eşleşir mi */
function prova(metin, S) {
  var r = ac(metin);
  if (!r.ok) return r;
  if (!r.zarfli) return hata('Zarf yazılamadı');
  if (!esit(r.sayim, sayim(S))) return hata('Geri okunan sayılar veriyle uyuşmuyor');
  if (JSON.stringify(r.veri) !== JSON.stringify(JSON.parse(JSON.stringify(S)))) return hata('Geri okunan veri farklı');
  return { ok: true, sayim: r.sayim };
}

/* ---------- cihaza özel durum ---------- */
function ortam() { return { ls: window.localStorage, now: Date.now }; }
function oku(env, k) { try { var v = env.ls.getItem(k); return v ? +v : 0; } catch (e) { return 0; } }
function yaz(env, k, v) { try { env.ls.setItem(k, String(v)); } catch (e) { } }
function dogrulandi(env) { env = env || ortam(); yaz(env, K_DOGR, env.now()); }
function sinandi(env) { env = env || ortam(); yaz(env, K_SINA, env.now()); }
/* son yedek dosyası doğrulandıysa; doğrulama son yedek anından eskiyse (sonraki yedek doğrulanmadı) yok */
function durumYazi(env, sonYedekAni) {
  env = env || ortam(); var o = [], d = oku(env, K_DOGR), s = oku(env, K_SINA);
  if (d && sonYedekAni && d >= sonYedekAni) o.push('dosya doğrulandı');
  if (s) { var t = new Date(s); o.push('geri yükleme sınandı · ' + t.getDate() + ' ' + ((AT.AYLAR || [])[t.getMonth()] || '').slice(0, 3)); }
  return o.join(' · ');
}

/* ---------- okunur kopya (Markdown) ---------- */
function ondalik(n) { return String(n).replace('.', ','); }
function markdown(S, env) {
  env = env || ortam(); S = S || {};
  var o = ['# Ağırlık Takip arşivi', '', 'Oluşturuldu: ' + new Date(env.now()).toISOString().slice(0, 10), ''];
  var se = liste(S.sessions).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  o.push('## Antrenmanlar (' + se.length + ')', '');
  se.forEach(function (s) {
    var dk = s.start && s.end && s.end > s.start ? ' · ' + Math.round((s.end - s.start) / 60000) + ' dk' : '';
    o.push('### ' + s.date + (s.name ? ' · ' + s.name : '') + dk);
    liste(s.exs).forEach(function (e) {
      var st = liste(e.sets).filter(function (x) { return x && x.done; }).map(function (x) { return (x.tip === 'isinma' ? '(ısınma) ' : '') + ondalik(x.kg) + '×' + x.reps + (x.rpe != null && String(x.rpe) !== '' ? ' @' + ondalik(x.rpe) : ''); });
      o.push('- ' + e.ad + ': ' + (st.length ? st.join(', ') : 'set yok'));
    });
    if (s.not) o.push('', '> ' + String(s.not).replace(/\n/g, '\n> '));
    o.push('');
  });
  var bw = liste(S.bw).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  o.push('## Tartılar (' + bw.length + ')', '');
  bw.forEach(function (b) { o.push('- ' + b.date + ': ' + ondalik(b.kg) + ' kg'); });
  o.push('');
  var dn = liste(S.donemGecmis).map(function (d) { return { d: d, son: d.bit }; });
  if (S.donem) dn.push({ d: S.donem, son: 'süren' });
  o.push('## Dönemler (' + dn.length + ')', '');
  dn.sort(function (a, b) { return a.d.bas < b.d.bas ? -1 : a.d.bas > b.d.bas ? 1 : 0; }).forEach(function (x) {
    var d = x.d, hedef = d.hedefKg != null ? ', hedef ' + ondalik(d.hedefKg) + ' kg' : '';
    o.push('- ' + d.tur + ' · ' + d.bas + ' → ' + x.son + ' · ' + (d.basKg != null ? ondalik(d.basKg) : '?') + (d.bitKg != null ? ' → ' + ondalik(d.bitKg) : '') + ' kg' + hedef);
  });
  o.push('');
  return o.join('\n');
}

AT.arsiv = {
  SEMA: SEMA, UYGULAMA: UYGULAMA, GOC: GOC, uret: uret, ac: ac, prova: prova, kiyas: kiyas, onayMetni: onayMetni, sayim: sayim, aralik: aralik, semaGoc: semaGoc,
  ozetle: ozetle, markdown: markdown, dogrulandi: dogrulandi, sinandi: sinandi, durumYazi: durumYazi, ortam: ortam
};

/* Okunur kopya: Ayarlar > Yedek grubunun altındaki bağlantı; iOS'ta share, değilse indirme */
AT.islem['arsiv-md'] = function () {
  var S = AT.S, md = markdown(S), ad = 'agirlik-arsiv-' + AT.iso(new Date()) + '.md', g = AT.guvenlik, env = g && g.ortam();
  var indirFn = function () { AT.indir(new Blob([md], { type: 'text/markdown' }), ad); };
  try {
    if (g && g.iosMu(env) && env.nav.canShare && env.nav.share && env.File) {
      var f = new env.File([md], ad, { type: 'text/markdown' });
      if (env.nav.canShare({ files: [f] })) { env.nav.share({ files: [f], title: 'Ağırlık Takip arşivi' }).catch(function (e) { if (!e || e.name !== 'AbortError') indirFn(); }); return; }
    }
  } catch (e) { }
  indirFn(); AT.toast('Okunur kopya indirildi');
};
})(window.AT);
