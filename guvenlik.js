/* guvenlik.js: modül (window.AT'ye kayıt olur). Telefonda verinin kaybolmaması (iPhone Safari).
   - iOS Safari'de ana ekrana EKLENMEMİŞ site, ~7 gün kullanılmazsa tarayıcı tarafından temizlenebilir. O durumda Bugün'ün
     en üstünde tek sessiz satır (7 gün gizlenebilir) + "nasıl?" 3 adımlı pencere. Ana ekran uygulamasında ve PC'de hiç görünmez.
   - Kalıcı depolama isteği (navigator.storage.persist) sonucu Ayarlar > Yedek özetinde ("kalıcı depolama: evet/hayır").
   - Yedeği indir: iOS'ta navigator.share ile dosya (Dosyalar/iCloud/mesaj); olmazsa ya da PC'de eski blob indirme.
   - Son yedek zamanı bu cihazda ('agirlik-son-yedek', eşitlenmez); gerçek veri varsa ve 7 günden eskiyse Bugün'de haftada en çok
     bir kez tek satır (başka durum satırı yokken, yalnız telefonda), Ayarlar özetinde her zaman. Açılır pencere yok.
   Saf yardımcılar env alır (test: Temp/agt/guvenlik-test.js). AT.guvenlik */
(function (AT) {
'use strict';

var K_YEDEK = 'agirlik-son-yedek', K_GUV = 'agirlik-guvenlik-gizle', K_HAT = 'agirlik-yedek-gizle', GUN = 864e5, HAFTA = 7 * GUN;
var kalici = null;   /* true | false | null (bilinmiyor / desteklenmiyor) */

function ortam() {
  return { nav: window.navigator, mm: window.matchMedia ? function (q) { return window.matchMedia(q); } : null, ls: window.localStorage, File: window.File, now: Date.now };
}
function oku(env, k) { try { var v = env.ls.getItem(k); return v ? +v : 0; } catch (e) { return 0; } }
function yaz(env, k, v) { try { env.ls.setItem(k, String(v)); } catch (e) { } }

/* iPhone / iPad / iPod (iPadOS 13+ masaüstü gibi görünür: MacIntel + dokunmatik) */
function iosMu(env) {
  var n = env.nav || {}, ua = String(n.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}
/* ana ekrandan açılmış mı (iOS: navigator.standalone; öbürleri: display-mode) */
function bagimsizMi(env) {
  var n = env.nav || {};
  if (n.standalone === true) return true;
  try { if (env.mm && (env.mm('(display-mode: standalone)').matches || env.mm('(display-mode: fullscreen)').matches)) return true; } catch (e) { }
  return false;
}
/* tarayıcı sekmesinde açık iOS (temizlenme riski olan tek durum) */
function iosSafariSekme(env) { env = env || ortam(); return iosMu(env) && !bagimsizMi(env); }

function gercekVeri(S) {
  if (!S) return false;
  var d = function (l) { return (l || []).some(function (x) { return x && !x.demo; }); };
  return d(S.sessions) || d(S.bw) || d(S.kcal) || d(S.defter) || !!(S.takviye && (S.takviye.liste || []).length);
}
function sonYedek(env) { return oku(env || ortam(), K_YEDEK); }
function gunOnce(env, t) { return Math.floor((env.now() - t) / GUN); }
/* "hiç" | "bugün" | "N gün önce" */
function sonYedekYazi(env) {
  env = env || ortam(); var t = sonYedek(env); if (!t) return 'hiç';
  var g = Math.max(0, gunOnce(env, t)); return g === 0 ? 'bugün' : g + ' gün önce';
}
function yedekGerekli(S, env) {
  env = env || ortam(); var t = sonYedek(env);
  return gercekVeri(S) && (!t || env.now() - t > HAFTA);
}
function gizli(env, k) { var t = oku(env, k); return !!t && env.now() - t < HAFTA; }

/* Ayarlar > Yedek ve eşitleme: "Yedeği indir" altındaki özet satırı */
function ozetSatir(env) {
  env = env || ortam();
  var ar = AT.arsiv ? AT.arsiv.durumYazi(env, sonYedek(env)) : '';
  return 'son yedek: ' + sonYedekYazi(env) + (ar ? ' · ' + ar : '') + (kalici == null ? '' : ' · kalıcı depolama: ' + (kalici ? 'evet' : 'hayır'));
}

/* Bugün'ün en üstündeki tek durum satırı. baska: başka bir durum satırı zaten gösteriliyorsa hatırlatma çıkmaz. */
function satirHtml(S, masaustu, baska, env) {
  env = env || ortam();
  if (masaustu) return '';
  if (iosSafariSekme(env) && !gizli(env, K_GUV)) {
    return '<p class="guv-satir" role="note"><span>Verilerin güvende kalsın: Paylaş → Ana Ekrana Ekle</span>' +
      '<button type="button" class="guv-link" data-act="guv-nasil">nasıl?</button>' +
      '<button type="button" class="guv-x" data-act="guv-gizle" aria-label="7 gün gizle">×</button></p>';
  }
  if (!baska && yedekGerekli(S, env) && !gizli(env, K_HAT)) {
    var t = sonYedek(env);
    return '<p class="guv-satir" role="note"><span>' + (t ? 'Son yedek ' + gunOnce(env, t) + ' gün önce' : 'Henüz yedek almadın') + '</span>' +
      '<button type="button" class="guv-link" data-act="disa">Yedeği al</button>' +
      '<button type="button" class="guv-x" data-act="yedek-gizle" aria-label="7 gün gizle">×</button></p>';
  }
  return '';
}

/* Yedeği paylaş / indir. iOS'ta dosya paylaşımı varsa onu (kullanıcı eylemiyle aynı turda çağrılmalı), yoksa indir() geri dönüşü.
   Dönüş: Promise<'paylas' | 'indir' | 'iptal'>. 'iptal' = kullanıcı paylaşım sayfasını kapattı (yedek sayılmaz). */
function yedekGonder(env, json, ad, indir) {
  env = env || ortam();
  try {
    var n = env.nav, F = env.File;
    if (iosMu(env) && n && n.canShare && n.share && F) {
      var dosya = new F([json], ad, { type: 'application/json' });
      if (n.canShare({ files: [dosya] })) {
        return Promise.resolve(n.share({ files: [dosya], title: 'Ağırlık Takip yedeği' })).then(
          function () { yaz(env, K_YEDEK, env.now()); return 'paylas'; },
          function (e) { if (e && e.name === 'AbortError') return 'iptal'; indir(); yaz(env, K_YEDEK, env.now()); return 'indir'; });
      }
    }
  } catch (e) { /* indirmeye düş */ }
  indir(); yaz(env, K_YEDEK, env.now());
  return Promise.resolve('indir');
}

/* kalıcı depolama: zaten verilmişse dokunma, değilse iste; sonuç özet satırında */
function kaliciIste(env, bitti) {
  env = env || ortam();
  var st = env.nav && env.nav.storage;
  if (!st || !st.persist) { kalici = null; return Promise.resolve(null); }
  return Promise.resolve(st.persisted ? st.persisted() : false).then(function (p) { return p ? true : st.persist(); })
    .then(function (v) { kalici = !!v; if (bitti) bitti(kalici); return kalici; }, function () { kalici = null; return null; });
}

function nasilPencere() {
  AT.sheet('<h3>Ana ekrana ekle</h3>' +
    '<ol class="adimlar"><li><b>Paylaş düğmesine dokun</b><span>Safari\'nin altındaki, ok çıkan kare simge.</span></li>' +
    '<li><b>“Ana Ekrana Ekle”yi seç</b><span>Listeyi biraz yukarı kaydırman gerekebilir. Sonra “Ekle”.</span></li>' +
    '<li><b>Uygulamayı simgeden aç</b><span>Ana ekran uygulaması ayrı hafıza kullanır: şimdiye kadar yazdıkların varsa önce Ayarlar &gt; Yedeği indir, simgeden açınca Yedeği geri yükle.</span></li></ol>' +
    '<div class="yigin"><button class="btn-big" data-act="kapat">Tamam</button></div>');
}

AT.islem['guv-nasil'] = nasilPencere;
AT.islem['guv-gizle'] = function () { yaz(ortam(), K_GUV, Date.now()); AT.render(); };
AT.islem['yedek-gizle'] = function () { yaz(ortam(), K_HAT, Date.now()); AT.render(); };

AT.guvenlik = {
  iosSafariSekme: iosSafariSekme, iosMu: iosMu, bagimsizMi: bagimsizMi, gercekVeri: gercekVeri, yedekGerekli: yedekGerekli,
  sonYedekYazi: sonYedekYazi, ozetSatir: ozetSatir, satir: satirHtml, yedekGonder: yedekGonder, kaliciIste: kaliciIste,
  kalici: function () { return kalici; }, ortam: ortam, nasil: nasilPencere
};

document.addEventListener('DOMContentLoaded', function () {
  kaliciIste(null, function () {
    var a = document.activeElement, yaziyor = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (!yaziyor && document.querySelector(".ay-satir[data-act=disa]")) AT.render();   /* Ayarlar açıksa özet güncellensin */
  });
});
})(window.AT);
