/* esitle.js: modül (window.AT'ye kayıt olur). PC ↔ telefon eşitleme, ücretsiz ve sunucusuz.
   Veri kullanıcının GitHub hesabında GİZLİ bir gist'te ("agirlik-takip-esitleme") durur; içerik kullanıcının
   şifresiyle şifrelenir (PBKDF2-SHA256 150k → AES-GCM 256; varsa gzip). Anahtar: yalnız "gist" yetkili GitHub token.
   Birleştirme üç yönlü: son eşitlenen hâl (taban) + bu cihaz + öbür cihaz. Kimlikli listelerde (antrenman, kilo,
   kalori, takviye) yeni kayıtlar birleşir, bir cihazda silinen öbüründe de silinir; tekil alanlarda değişen taraf kazanır.
   Cihaza özel alanlar (tema vb.) eşitlenmez. Tetik: açılış, değişiklikten 15 sn sonra, pencereden çıkış/dönüş, "Şimdi eşitle".
   AT.bolum.esitle() → Ayarlar bölümü; AT.degisti() ← app.js kaydet(); AT.yeniDurum(S) → app.js durumu değiştirir. */
(function (AT) {
'use strict';

var LS_AYAR = 'agirlik-esit', LS_TABAN = 'agirlik-esit-taban', ACIKLAMA = 'agirlik-takip-esitleme', DOSYA = 'agirlik-takip.json';
var API = 'https://api.github.com', TEL_ADRES = 'https://azizcanx.github.io/agirlik-takip/';
var VERI = ['sessions', 'bw', 'kcal', 'ozel', 'takviye', 'bulk', 'active', 'dinlenme', 'dinlenmeEgz', 'rpe', 'ses', 'kcalOneri'];
var LISTE = { sessions: 'id', bw: 'id', kcal: 'date', ozel: 'ad' };   /* kalori günde tek: tarihle */
var DESTEK = !!(window.crypto && crypto.subtle && window.fetch && window.TextEncoder);

/* ---------- saf: birleştirme ---------- */
function J(x) { return JSON.stringify(x === undefined ? null : x); }
function veriAl(S) { var o = {}; VERI.forEach(function (k) { if (S[k] !== undefined) o[k] = S[k]; }); return o; }
/* tekil değer: bu cihaz tabana göre değiştiyse o, değilse öbürü */
function sec(b, l, r) { return J(l) !== J(b) ? l : r; }
/* kimlikli liste: anahtar fn ile. alanBazli: iki taraf da aynı kaydı değiştirdiyse alan alan birleştir
   (kalori günlüğü: telefonda kcal, PC'de p/k/y girilse ikisi de kalır); değilse değişen tarafın kaydı */
function liste(b, l, r, ak, alanBazli) {
  var key = function (x) { return x && x[ak] != null ? String(x[ak]) : null; };
  var mb = {}, ml = {}, mr = {}, sira = [];
  (b || []).forEach(function (x) { var k = key(x); if (k) mb[k] = x; });
  (l || []).forEach(function (x) { var k = key(x); if (k) { ml[k] = x; sira.push(k); } });
  (r || []).forEach(function (x) { var k = key(x); if (k) { mr[k] = x; if (!(k in ml)) sira.push(k); } });
  var out = [];
  sira.forEach(function (k) {
    var vb = mb[k], vl = ml[k], vr = mr[k];
    if (vl && vr) out.push(alanBazli && J(vl) !== J(vb) && J(vr) !== J(vb) ? harita(vb, vl, vr) : J(vl) !== J(vb) ? vl : vr);
    else if (vl) { if (!vb || J(vl) !== J(vb)) out.push(vl); }      /* öbüründe yok: tabanda varsa orada silinmiş (bu cihazda değişmediyse sil) */
    else if (vr) { if (!vb || J(vr) !== J(vb)) out.push(vr); }      /* bu cihazda yok: tabanda varsa burada silinmiş */
  });
  return out;
}
/* düz nesne (gün → değer): anahtar bazında üç yönlü */
function harita(b, l, r) {
  b = b || {}; l = l || {}; r = r || {};
  var o = {}, ks = {};
  [b, l, r].forEach(function (m) { Object.keys(m).forEach(function (k) { ks[k] = 1; }); });
  Object.keys(ks).forEach(function (k) {
    var v = (k in l) && (k in r) ? sec(b[k], l[k], r[k]) : (k in l) ? ((k in b) && J(l[k]) === J(b[k]) ? undefined : l[k]) : (k in r) ? ((k in b) && J(r[k]) === J(b[k]) ? undefined : r[k]) : undefined;
    if (v !== undefined) o[k] = v;
  });
  return o;
}
function birlestir(b, l, r) {
  b = b || {}; var o = {};
  VERI.forEach(function (k) {
    if (LISTE[k]) o[k] = liste(b[k], l[k], r[k], LISTE[k], k === 'kcal');
    else if (k === 'takviye') {
      var tb = b[k] || {}, tl = l[k] || {}, tr = r[k] || {};
      o[k] = { liste: liste(tb.liste, tl.liste, tr.liste, 'id'), alinan: harita(tb.alinan, tl.alinan, tr.alinan) };
    } else if (k === 'dinlenmeEgz') o[k] = harita(b[k], l[k], r[k]);
    else { var v = sec(b[k], l[k], r[k]); if (v !== undefined) o[k] = v; }
  });
  return o;
}

/* ---------- şifreleme ---------- */
function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
var anahtarOnb = {};
function anahtar(sifre, tuz) {
  var k = sifre + '|' + b64(tuz);
  if (!anahtarOnb[k]) anahtarOnb[k] = turet(sifre, tuz).catch(function (e) { delete anahtarOnb[k]; throw e; });
  return anahtarOnb[k];
}
var sifTuz = null;   /* bu oturumda şifrelemede kullanılan tuz (şifre değişince yenilenir) */
function turet(sifre, tuz) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(sifre), 'PBKDF2', false, ['deriveKey']).then(function (k) {
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: tuz, iterations: 150000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });
}
function akis(u8, tur) {   /* gzip varsa sıkıştır/aç */
  return new Response(new Blob([u8]).stream().pipeThrough(tur === 'z' ? new CompressionStream('gzip') : new DecompressionStream('gzip'))).arrayBuffer().then(function (a) { return new Uint8Array(a); });
}
function sifrele(obj, sifre, rev) {
  if (!sifTuz || sifTuz.sifre !== sifre) sifTuz = { sifre: sifre, tuz: crypto.getRandomValues(new Uint8Array(16)) };
  var tuz = sifTuz.tuz, iv = crypto.getRandomValues(new Uint8Array(12)), ham = new TextEncoder().encode(JSON.stringify(obj));
  var z = typeof CompressionStream === 'function';
  return Promise.all([anahtar(sifre, tuz), z ? akis(ham, 'z') : ham]).then(function (x) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, x[0], x[1]);
  }).then(function (c) { return JSON.stringify({ v: 1, rev: rev || 0, z: z ? 1 : 0, tuz: b64(tuz), iv: b64(iv), veri: b64(new Uint8Array(c)) }); });
}
function coz(metin, sifre) {
  var p = JSON.parse(metin);
  return anahtar(sifre, unb64(p.tuz)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, k, unb64(p.veri)); })
    .then(function (a) { var u = new Uint8Array(a); return p.z ? akis(u, 'a') : u; })
    .then(function (u) { return JSON.parse(new TextDecoder().decode(u)); }, function (e) { var h = new Error('sifre'); h.kod = 'sifre'; throw h; });
}

/* ---------- GitHub gist ---------- */
function ayar() { try { return JSON.parse(localStorage.getItem(LS_AYAR) || 'null'); } catch (e) { return null; } }
function ayarYaz(a) { if (a) localStorage.setItem(LS_AYAR, JSON.stringify(a)); else localStorage.removeItem(LS_AYAR); }
function istek(a, yol, yontem, govde) {
  var b = govde ? JSON.stringify(govde) : undefined, ka = !!b && b.length < 60000;
  var git = function (k) { return fetch(API + yol, { method: yontem || 'GET', headers: { Authorization: 'Bearer ' + a.token, Accept: 'application/vnd.github+json' }, body: b, cache: 'no-store', keepalive: k }); };
  /* keepalive + CORS ön kontrolü bazı tarayıcılarda desteklenmez: hata olursa bir kez keepalive'sız dene */
  return (ka ? git(true).catch(function () { return git(false); }) : git(false))
    .then(function (r) {
      if (r.status === 401) { var h = new Error('anahtar'); h.kod = 'anahtar'; throw h; }
      if (!r.ok) { var e = new Error('github ' + r.status); e.kod = 'ag'; throw e; }
      return r.json();
    }, function () { var e = new Error('ag'); e.kod = 'ag'; throw e; });
}
function gistBul(a) {
  if (a.gist) return Promise.resolve(a.gist);
  return istek(a, '/gists?per_page=100').then(function (l) { var g = l.filter(function (x) { return x.description === ACIKLAMA; })[0]; return g ? g.id : null; });
}
function uzakOku(a) {
  return istek(a, '/gists/' + a.gist).then(function (g) {
    var f = g.files && g.files[DOSYA]; if (!f) return null;
    if (!f.truncated) return f.content;
    return fetch(f.raw_url, { cache: 'no-store' }).then(function (r) { return r.text(); });
  });
}

/* ---------- eşitleme ---------- */
var calisiyor = false, bekliyor = false, zaman = null, uygulaniyor = false, sonHata = null;
function taban() { try { return JSON.parse(localStorage.getItem(LS_TABAN) || 'null'); } catch (e) { return null; } }
function esitle(elle) {
  var a = ayar(); if (!a || !DESTEK) return Promise.resolve(false);
  if (calisiyor) { bekliyor = true; return Promise.resolve(false); }
  if (!navigator.onLine && !elle) return Promise.resolve(false);
  calisiyor = true; ciz('Eşitleniyor…');
  var yerel = veriAl(AT.S), uzakRev = 0, tabanRev = +a.rev || 0;
  return gistBul(a).then(function (id) {
    if (!id) return null;
    a.gist = id;
    return uzakOku(a).then(function (m) {
      if (!m) return null;
      try { uzakRev = +JSON.parse(m).rev || 0; } catch (e) { uzakRev = 0; }
      /* bayat okuma koruması: bu cihazın son gördüğünden eski sürüm geldiyse (önbellek/vekil) birleştirme yok, kayıt silinmez */
      if (uzakRev < tabanRev) { var h = new Error('bayat'); h.kod = 'ag'; throw h; }
      return coz(m, a.sifre);
    });
  }).then(function (uzak) {
    if (!ayar()) return false;   /* eşitleme bu arada kaldırıldıysa hiçbir şey yazma */
    var son = uzak ? birlestir(taban(), yerel, uzak) : yerel;
    var yaz = !uzak || J(son) !== J(uzak), yerelDegisti = J(son) !== J(yerel), yeniRev = yaz ? Math.max(uzakRev, tabanRev) + 1 : uzakRev;
    return (yaz ? sifrele(son, a.sifre, yeniRev).then(function (m) {
      var govde = { files: {} }; govde.files[DOSYA] = { content: m };
      if (a.gist) return istek(a, '/gists/' + a.gist, 'PATCH', govde);
      govde.description = ACIKLAMA; govde.public = false;
      return istek(a, '/gists', 'POST', govde).then(function (g) { a.gist = g.id; ayarYaz(a); });
    }) : Promise.resolve()).then(function () {
      if (!ayar()) return false;
      localStorage.setItem(LS_TABAN, JSON.stringify(son));
      if (yerelDegisti) { uygulaniyor = true; try { AT.yeniDurum(Object.assign({}, AT.S, son)); } finally { uygulaniyor = false; } }
      a.son = Date.now(); a.hata = null; a.rev = yeniRev; ayarYaz(a); sonHata = null;
      return yerelDegisti;
    });
  }).then(function (d) { calisiyor = false; ciz(); if (elle) AT.toast(d ? 'Eşitlendi, yeni kayıtlar geldi' : 'Eşitlendi'); if (bekliyor) { bekliyor = false; planla(2000); } return d; },
    function (e) {
      calisiyor = false; sonHata = e.kod || 'ag'; var a2 = ayar(); if (a2) { a2.hata = sonHata; ayarYaz(a2); }
      ciz(); if (elle) AT.toast(hataMetni(sonHata)); return false;
    });
}
function planla(ms) { clearTimeout(zaman); zaman = setTimeout(function () { esitle(false); }, ms); }
function hataMetni(k) {
  return k === 'sifre' ? 'Şifre öbür cihazdakiyle aynı değil' : k === 'anahtar' ? 'GitHub anahtarı geçersiz ya da süresi dolmuş' : 'İnternet yok; bağlanınca eşitlenir';
}
AT.esitBagli = function () { return !!ayar(); };
AT.degisti = function () { if (!uygulaniyor && ayar()) planla(3000); };

/* ---------- Ayarlar bölümü ---------- */
function saat(t) { var d = new Date(t); return AT.tarih(AT.iso(d), 1) + ' ' + AT.p2(d.getHours()) + ':' + AT.p2(d.getMinutes()); }
function icerik(durum) {
  var a = ayar();
  if (!DESTEK) return '<p class="mut">Bu tarayıcı eşitlemeyi desteklemiyor.</p>';
  if (!a) return '<p class="mut">Kayıtların PC ve telefonda aynı olsun: GitHub hesabındaki gizli bir dosyada, kendi şifrenle kilitli durur. Ücretsiz.</p>' +
    '<label class="alan"><span>GitHub anahtarı ya da PC\'den gelen link <a href="https://github.com/settings/tokens/new?scopes=gist&description=Agirlik%20Takip%20esitleme" target="_blank" rel="noopener">anahtar al</a> <small>(süre: No expiration)</small></span><input id="es-token" type="password" autocomplete="off" placeholder="ghp_… ya da bağlantı linki"></label>' +
    '<label class="alan"><span>Şifre (iki cihazda aynı)</span><input id="es-sifre" type="password" autocomplete="new-password" placeholder="en az 6 karakter"></label>' +
    '<button class="btn-ac btn-big" data-act="es-bagla">Bağla</button>';
  var hata = a.hata || sonHata;
  return '<p class="durum ' + (hata ? 'uyari' : 'iyi') + '">' + AT.h(durum || (hata ? hataMetni(hata) : a.son ? 'Eşitlendi · ' + saat(a.son) : 'Bağlandı')) + '</p>' +
    '<div class="row"><button class="btn-ghost mini" data-act="es-simdi">Şimdi eşitle</button><button class="btn-ghost mini" data-act="es-link">Telefona bağlantı linki</button><span class="grow"></span><button class="btn-ghost mini" data-act="es-kaldir">Kaldır</button></div>';
}
/* Ayarlar'da katlanır; özet: kapalı / bağlı / sorun var (sorun varsa kendiliğinden açık) */
function esitDurumu() { var a = ayar(); return !DESTEK ? 'desteklenmiyor' : !a ? 'kapalı' : (a.hata || sonHata) ? 'sorun var' : 'bağlı'; }
function ciz(durum) {
  var e = AT.$('#esitleme'); if (e) e.innerHTML = icerik(durum);
  var z = AT.$('#esitleme-ozet'); if (z) z.textContent = esitDurumu();
  var d = e && e.closest ? e.closest('details') : null; if (d && esitDurumu() === 'sorun var') d.open = true;
}
AT.bolum.esitle = function () {
  return '<details class="katla"' + (esitDurumu() === 'sorun var' ? ' open' : '') + '><summary>PC ↔ telefon eşitleme <small id="esitleme-ozet">' + esitDurumu() + '</small></summary>' +
    '<div class="panel" id="esitleme">' + icerik() + '</div></details>';
};

function linkCoz(m) { return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m))))); }
function bagla(token, sifre) {
  token = String(token || '').trim(); sifre = String(sifre || '');
  var lm = /esitle=([^&\s#]+)/.exec(token);   /* PC'den gelen bağlantı linki yapıştırıldıysa anahtar + şifre ondan */
  if (lm) { try { var lx = linkCoz(lm[1]); token = String(lx.t || ''); sifre = String(lx.s || ''); } catch (e) { return AT.toast('Bağlantı linki bozuk'); } }
  if (!/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token)) return AT.toast('GitHub anahtarı ghp_ ya da github_pat_ ile başlar');
  if (sifre.length < 6) return AT.toast('Şifre en az 6 karakter olmalı');
  ayarYaz({ token: token, sifre: sifre });
  localStorage.removeItem(LS_TABAN);   /* yeni bağlantı: iki taraf birleşir, silme yok */
  ciz('Bağlanıyor…');
  esitle(true).then(function () { var a = ayar(); if (a && a.hata) { ayarYaz(null); ciz(); } else AT.render(); });
}
AT.islem['es-bagla'] = function () { var t = AT.$('#es-token'), s = AT.$('#es-sifre'); bagla(t && t.value, s && s.value); };
AT.islem['es-simdi'] = function () { esitle(true); };
AT.islem['es-kaldir'] = function () {
  AT.onayla('Eşitleme kaldırılsın mı?', 'Bu cihazdaki kayıtlar yerinde kalır; GitHub\'daki gizli dosya silinmez.', 'es-kaldir-kesin', 'Kaldır');
};
AT.islem['es-kaldir-kesin'] = function () { ayarYaz(null); localStorage.removeItem(LS_TABAN); AT.kapat(); AT.render(); AT.toast('Eşitleme kaldırıldı'); };
/* telefon için tek seferlik link: anahtar + şifre adresin # kısmında (sunucuya gitmez); açılınca kendiliğinden bağlanır */
AT.islem['es-link'] = function () {
  var a = ayar(); if (!a) return;
  var link = TEL_ADRES + '#esitle=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ t: a.token, s: a.sifre })))));
  var bitti = function () { AT.toast('Link kopyalandı; kendine gönder, telefonda aç'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(bitti, function () { prompt('Linki kopyala:', link); });
  else prompt('Linki kopyala:', link);
};

/* açılış: #esitle= linki → bağlan; bağlıysa eşitle */
document.addEventListener('DOMContentLoaded', function () {
  var m = /[#&]esitle=([^&]+)/.exec(location.hash);
  if (m) {
    try { var x = linkCoz(m[1]); history.replaceState(null, '', location.pathname + location.search); setTimeout(function () { bagla(x.t, x.s); }, 300); }
    catch (e) { AT.toast('Bağlantı linki bozuk'); }
    return;
  }
  if (ayar()) setTimeout(function () { esitle(false); }, 1200);
});
document.addEventListener('visibilitychange', function () { if (!ayar()) return; if (document.hidden) esitle(false); else planla(800); });
window.addEventListener('online', function () { if (ayar()) planla(1000); });
window.addEventListener('focus', function () { if (ayar()) planla(500); });
window.addEventListener('pageshow', function (e) { if (e.persisted && ayar()) planla(500); });
setInterval(function () { if (ayar() && !document.hidden) esitle(false); }, 60000);

AT._esitle = { birlestir: birlestir, liste: liste, harita: harita, sifrele: sifrele, coz: coz, veriAl: veriAl };   /* test için */
})(window.AT);
