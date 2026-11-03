/* denge.js (G7): Kas dengesi, Dengeleyici (Sıradaki), Güç seviyen, Antrenman günü hatırlatması. Bağımlılıksız; window.AT'ye kayıt olur.
   - AT.denge.say(seanslar, bugun)   : son 7 gün kas başına gerçek iş seti (ana kas 1, yardımcı 0,5; ısınma sayılmaz) -> { Göğüs: 8, ... }
   - AT.denge.etiket(n)              : 'az' (<5) | 'iyi' (5–15) | 'çok' (>15)
   - AT.bolum.kasSerit()             : Geçmiş'te kas haritasının altında sessiz tek şerit ("Bu hafta: Göğüs 8 iyi · Sırt 4 az …")
   - AT.denge.sec(uygun, varsayilan) : siradaki() (app.js) 48 saat kuralını ZATEN uygulayıp `uygun`u (en eskiden yeniye) verir; burada yalnız
                                       bu listeden, haftalık hedefin altındaki en büyük kası kapsayan EN ESKİ antrenman seçilir (kapsayan yoksa varsayilan).
                                       Kural dışına asla çıkmaz: dönen değer her zaman `uygun`dan ya da varsayilan'dır.
   - AT.denge.neden(antrenman)       : Sıradaki kartındaki tek satır gerekçe ("Sırt bu hafta az çalıştı") ya da ''.
   - AT.bolum.gucSeviye()            : İlerleme > Güç: 4 büyük hareket için seviye + sıradaki eşiğe kalan kg (vücut ağırlığı yoksa '')
   - AT.denge.hatirlat.*             : yalnız ana ekran (standalone) + Notification API varsa Ayarlar > Antrenman'da tek satır; yerel zamanlayıcı.
   Kaynaklar: Pelland ve ark. 2025 haftalık set meta-analizi özeti (reports/Bulk antrenman bilimi ve UX 2026.md): 5–10 set/hafta verimli,
   daha fazlası ileri düzey; ikincil kas 0,5 set. Güç eşikleri: reports/Guc seviyesi esikleri.md (Strength Level erkek tabloları).

   DÜRÜST SINIR (hatırlatma): iOS'ta arka plan push (sunucu) YOK. Zamanlayıcı yalnız uygulama açıkken/önplandayken çalışır; telefon kilitliyken
   ya da uygulama kapalıyken bildirim GELMEZ. Uygulama sonradan açılınca, saat geçeli 4 saatten az ve bugün antrenman yoksa hemen bir kez gösterilir. */
(function (AT) {
'use strict';
if (!AT) return;

var AZ = 5, COK = 15, ANA = ['Göğüs', 'Sırt', 'Omuz', 'Bacak', 'Kol'];   /* Karın: sıralamada ve eksik aramada yok, yalnız çalışıldıysa gösterilir */

/* ---------- 1) kas dengesi ---------- */
function say(seanslar, bugun) {
  var lim = AT.parse(bugun); lim.setDate(lim.getDate() - 6); var limS = AT.iso(lim), m = {};
  (seanslar || []).forEach(function (s) {
    if (!s || s.date < limS || s.date > bugun || !Array.isArray(s.exs)) return;
    s.exs.forEach(function (e) {
      var n = AT.yapilanSetler(e).length; if (!n) return;
      var k = e.kas || AT.kasOf(e.ad); m[k] = (m[k] || 0) + n;
      AT.ikincilOf(e.ad).forEach(function (x) { if (x !== k) m[x] = (m[x] || 0) + n * 0.5; });
    });
  });
  return m;
}
function etiket(n) { return n < AZ ? 'az' : n > COK ? 'çok' : 'iyi'; }
function yaz(n) { return String(Math.round(n)); }   /* kas haritası listesiyle aynı yuvarlama */
function bugunS() { return AT.iso(new Date()); }

function serit() {
  if (!AT.S.sessions.length) return '';
  var m = say(AT.S.sessions, bugunS());
  var kl = ANA.concat(m['Karın'] ? ['Karın'] : []);
  return '<p class="mut kucuk denge-serit">Bu hafta (son 7 gün): ' + kl.map(function (k) {
    var n = m[k] || 0; return AT.h(k) + ' ' + yaz(n) + ' <i>' + etiket(n) + '</i>';
  }).join(' · ') + '</p>';
}
AT.bolum.kasSerit = serit;

/* ---------- 2) Dengeleyici ---------- */
/* haftalık hedefin altındaki (az) en büyük açığı olan ana kas; bu hafta hiç antrenman yoksa (dinlenme haftası/dönüş) öneri yok */
function acikKas(seanslar, bugun) {
  var m = say(seanslar, bugun), top = 0, en = null, ac = 0;
  Object.keys(m).forEach(function (k) { top += m[k]; });
  if (!top) return null;
  ANA.forEach(function (k) { var d = AZ - (m[k] || 0); if (d > ac) { ac = d; en = k; } });
  return en;
}
/* antrenmanın bir kasa ANA kas olarak planladığı set sayısı (set sayısı yoksa 3) */
function kapsam(se, kas) {
  var t = 0; (se.exs || []).forEach(function (e) {
    var n = (e.sets && e.sets.length) || 3, k = e.kas || AT.kasOf(e.ad);
    if (k === kas) t += n;   /* yalnız ana kas sayılır: yardımcı kas payı gerekçe/seçim için zayıf (Squat'ın Sırt payı 'Sırt günü' yapmaz) */
  });
  return t;
}
var MIN_KAPSAM = 2;
/* antrenmanın ana kas olarak içerdiği tüm kaslar (en az MIN_KAPSAM planlı set); biri son 48 saatte çalışıldıysa öne alınmaz */
function anaKaslar(se) {
  var m = {}; (se.exs || []).forEach(function (e) { var k = e.kas || AT.kasOf(e.ad); m[k] = (m[k] || 0) + ((e.sets && e.sets.length) || 3); });
  return Object.keys(m).filter(function (k) { return m[k] >= MIN_KAPSAM; });
}
function tazeDegil(se) { return !AT.kasYeni || anaKaslar(se).every(function (k) { return !AT.kasYeni(k, 48); }); }
function sec(uygun, varsayilan) {
  var kas = acikKas(AT.S.sessions, bugunS());
  if (!kas || !uygun || !uygun.length) return varsayilan;
  for (var i = 0; i < uygun.length; i++) if (kapsam(uygun[i], kas) >= MIN_KAPSAM && tazeDegil(uygun[i])) return uygun[i];
  return varsayilan;
}
function neden(se) {
  if (!se) return '';
  var kas = acikKas(AT.S.sessions, bugunS());
  return kas && kapsam(se, kas) >= MIN_KAPSAM ? kas + ' bu hafta az çalıştı' : '';
}

/* ---------- 3) Güç seviyen ----------
   Eşikler (vücut ağırlığının katı, erkek): Strength Level "strength standards" erkek tabloları, 80 kg satırı / 80
   (strengthlevel.com/strength-standards/male/kg, 3 Kas 2026'da alındı; topluluk verisi). Sütunlar: Intermediate, Advanced, Elite.
   Seviye: Başlangıç (Intermediate altı, yani Beginner+Novice), Orta (Intermediate), İleri (Advanced), Çok ileri (Elite).
   Tek oran kullanılır (80 kg satırı); gerçek tablo hafif kiloya göre değişir (kaynak notuna bak). Uydurma sayı yok. */
var GUC = [
  { ad: 'Squat', esik: [1.65, 2.10, 2.58] },
  { ad: 'Bench Press', esik: [1.23, 1.55, 1.89] },
  { ad: 'Deadlift', esik: [1.94, 2.45, 2.99] },
  { ad: 'Overhead Press', esik: [0.78, 1.01, 1.26] }
];
var SEVIYE = ['Başlangıç', 'Orta', 'İleri', 'Çok ileri'];
/* en iyi tahmini max (kg) ve vücut ağırlığına göre seviye; sonraki eşik kg'ı */
function seviye(max, bw, esik) {
  if (!(max > 0) || !(bw > 0)) return null;
  var o = max / bw, i = 0; while (i < 3 && o >= esik[i]) i++;
  return { i: i, ad: SEVIYE[i], oran: o, kalan: i < 3 ? Math.max(0, Math.ceil(esik[i] * bw - max)) : 0 };
}
function bwSon() {
  var lim = new Date(); lim.setDate(lim.getDate() - 30); var limS = AT.iso(lim);   /* 30 günden eski tartı yanıltır: gösterme */
  var l = AT.S.bw.filter(function (b) { return AT.num(b.kg) > 0 && b.date >= limS; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return l.length ? AT.num(l[l.length - 1].kg) : 0;
}
function enIyiMax(ad) {
  var m = 0, lim = new Date(); lim.setDate(lim.getDate() - 56); var limS = AT.iso(lim);   /* son 8 hafta */
  AT.S.sessions.forEach(function (se) { if (se.date < limS) return; (se.exs || []).forEach(function (e) {
    if (e.ad !== ad) return;
    AT.yapilanSetler(e).forEach(function (s) { m = Math.max(m, AT.tahminiMax(AT.num(s.kg), AT.num(s.reps), s.rpe)); });
  }); });
  return m;
}
function gucSeviye() {
  var bw = bwSon(); if (!bw) return '';
  var sat = GUC.map(function (g) {
    var s = seviye(enIyiMax(g.ad), bw, g.esik); if (!s) return '';
    return '<div class="denge-guc"><b>' + AT.h(g.ad) + '</b><span>' + s.ad + (s.i < 3 ? ' <small>' + SEVIYE[s.i + 1] + ' için ' + AT.fmt(s.kalan, 0) + ' kg kaldı</small>' : ' <small>en üst seviye</small>') + '</span></div>';
  }).join('');
  return sat ? '<h3 class="denge-bas">Güç seviyen <small>son 8 hafta · tahmini max / ' + AT.fmt(bw, 1) + ' kg vücut ağırlığı</small></h3><div class="panel denge-panel">' + sat + '</div>' : '';
}
AT.bolum.gucSeviye = gucSeviye;

/* ---------- 4) Antrenman günü hatırlatması ---------- */
var AK = 'agirlik-hatirlat';   /* cihaza özel (izin cihazdadır): eşitlenmez, esitle.js VERI'ye girmez */
var zaman = null, env0 = null;
function ortam(e) { return e || env0 || { nav: window.navigator, mm: window.matchMedia ? function (q) { return window.matchMedia(q); } : null, N: window.Notification, ls: window.localStorage }; }
function ayar(e) {
  var o = { a: 0, saat: '18:00', son: '' };
  try { var j = JSON.parse(ortam(e).ls.getItem(AK) || '{}'); if (j.a) o.a = 1; if (/^\d\d:\d\d$/.test(j.saat)) o.saat = j.saat; if (j.son) o.son = j.son; } catch (x) { /* bozuk kayıt: kapalı */ }
  return o;
}
function ayarYaz(o, e) { try { ortam(e).ls.setItem(AK, JSON.stringify(o)); } catch (x) { /* depolama dolu: ayar kalıcı olmaz */ } }
/* yalnız ana ekran uygulaması (iOS'ta bildirim izni ancak orada vardır) ve Notification API varsa */
function destek(e) {
  e = ortam(e); var n = e.nav || {};
  var ana = n.standalone === true || !!(e.mm && e.mm('(display-mode: standalone)') && e.mm('(display-mode: standalone)').matches);
  return !!(ana && e.N);
}
/* bir sonraki planlı antrenman günü: son 28 günde ≥2 kez antrenman yapılan haftanın günleri (alışkanlık); bugünün saati geçmediyse ve bugün
   antrenman yoksa bugün, yoksa en yakın alışkanlık günü. Alışkanlık yoksa (az veri) planlanmaz. Dönen: Date (yerel zaman) ya da null */
function sonrakiGun(seanslar, simdi, saat) {
  var lim = new Date(simdi); lim.setDate(lim.getDate() - 28); var limS = AT.iso(lim), say = [0, 0, 0, 0, 0, 0, 0], bu = AT.iso(new Date(simdi));
  (seanslar || []).forEach(function (s) { if (s && !s.demo && s.date >= limS && s.date <= bu) say[AT.parse(s.date).getDay()]++; });
  if (say.filter(function (x) { return x >= 2; }).length === 0) return null;
  var p = saat.split(':'), hh = +p[0], mm = +p[1], bugunYapildi = (seanslar || []).some(function (s) { return s && s.date === bu; });
  for (var i = 0; i < 8; i++) {
    var d = new Date(simdi); d.setDate(d.getDate() + i); d.setHours(hh, mm, 0, 0);
    if (say[d.getDay()] < 2) continue;
    if (d.getTime() <= simdi) continue;
    if (i === 0 && bugunYapildi) continue;
    return d;
  }
  return null;
}
function goster(metin, e, onay) {
  e = ortam(e); var N = e.N; if (!N || N.permission !== 'granted') return false;
  var bas = 'Antrenman günü', ops = { body: metin, tag: 'antrenman-gunu', icon: 'icon-192.png' };
  /* showNotification bir Promise döndürür: reddedilirse gösterilmedi sayılır (gün işaretlenmez), hata yutulur */
  try {
    if (e.sw && e.sw.showNotification) {
      var p = e.sw.showNotification(bas, ops);
      if (p && p.then) { p.then(function () { if (onay) onay(true); }, function () { if (onay) onay(false); }); return true; }
    } else new N(bas, ops);
    if (onay) onay(true); return true;
  } catch (x) { return false; }
}
function metin() { var sr = AT.siradaki && AT.siradaki(); return sr ? 'Sıradaki: ' + String(sr.name || 'Antrenman').replace(/\s*\(örnek\)\s*$/i, '') : 'Bugün antrenman günü'; }
/* uygulama açılışında / öne gelince: planla. Kaçırılan (saat geçeli <4 sa, bugün antrenman yok, bugün hiç gösterilmedi) hemen gösterilir */
function planla(e) {
  clearTimeout(zaman); zaman = null;
  var a = ayar(e), E = ortam(e);
  if (!a.a || !destek(e) || !E.N || E.N.permission !== 'granted') return null;
  var simdi = (E.simdi || Date.now)(), bu = AT.iso(new Date(simdi)), p = a.saat.split(':');
  var bugunSaat = new Date(simdi); bugunSaat.setHours(+p[0], +p[1], 0, 0);
  var yapildi = AT.S.sessions.some(function (s) { return s.date === bu; });
  var gecen = simdi - bugunSaat.getTime();
  if (gecen > 0 && gecen < 4 * 36e5 && !yapildi && a.son !== bu) {
    var d0 = sonrakiGunBugun(AT.S.sessions, simdi);
    if (d0) goster(metin(), e, function (ok) { if (ok) { var a1 = ayar(e); a1.son = bu; ayarYaz(a1, e); } });
  }
  var d = sonrakiGun(AT.S.sessions, simdi, a.saat); if (!d) return null;
  var ms = d.getTime() - simdi;
  zaman = (E.setTimeout || setTimeout)(function () {
    var b2 = AT.iso(new Date()), a2 = ayar(e);
    if (!AT.S.sessions.some(function (s) { return s.date === b2; }) && a2.son !== b2) goster(metin(), e, function (ok) { if (ok) { var a3 = ayar(e); a3.son = b2; ayarYaz(a3, e); } });
    planla(e);
  }, Math.min(ms, 2147000000));
  return d;
}
/* bugün alışkanlık günü mü (kaçırılan bildirim yalnız o gün için) */
function sonrakiGunBugun(seanslar, simdi) {
  var lim = new Date(simdi); lim.setDate(lim.getDate() - 28); var limS = AT.iso(lim), n = 0, g = new Date(simdi).getDay(), bu = AT.iso(new Date(simdi));
  (seanslar || []).forEach(function (s) { if (s && !s.demo && s.date >= limS && s.date < bu && AT.parse(s.date).getDay() === g) n++; });
  return n >= 2;
}
function hatirlatHtml() {
  if (!destek()) return '';
  var a = ayar(), E = ortam(), red = E.N && E.N.permission === 'denied';
  return '<div class="alan denge-hat"><span>Antrenman günü hatırlat</span><div class="denge-hat-s"><div class="seg" role="group" aria-label="Antrenman günü hatırlat">' +
    [[0, 'Kapalı'], [1, 'Açık']].map(function (t) { return '<button data-act="hatirlat" data-v="' + t[0] + '" aria-pressed="' + (!!a.a === !!t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    (a.a ? '<input id="hat-saat" type="time" value="' + a.saat + '" aria-label="Hatırlatma saati">' : '') + '</div>' +
    '<p class="mut kucuk alt-not">Yalnız uygulama açıkken bildirir.' + (red ? ' Bildirim izni kapalı: iPhone Ayarlar &gt; Bildirimler.' : '') + '</p></div>';
}
AT.bolum.hatirlat = hatirlatHtml;
AT.islem['hatirlat'] = function (d) {
  var a = ayar(), E = ortam();
  if (d.v !== '1') { a.a = 0; ayarYaz(a); planla(); AT.render(); return; }
  if (!destek()) return;
  var ac = function (izin) {
    if (izin === 'granted') { a.a = 1; ayarYaz(a); planla(); AT.toast('Hatırlatma açık · uygulama açıkken çalışır'); }
    else AT.toast('Bildirim izni verilmedi');
    AT.render();
  };
  if (E.N.permission === 'granted') return ac('granted');
  try { var r = E.N.requestPermission(function (p) { ac(p); }); if (r && r.then) r.then(ac, function () { ac('denied'); }); } catch (x) { ac('denied'); }   /* izin yalnız Açık'a dokununca istenir */
};
document.addEventListener('change', function (ev) {
  if (ev.target && ev.target.id === 'hat-saat' && /^\d\d:\d\d$/.test(ev.target.value)) { var a = ayar(); a.saat = ev.target.value; a.son = ''; ayarYaz(a); planla(); }
});
var eskiHepsi = AT.islem['hepsini-kesin'];
AT.islem['hepsini-kesin'] = function (d) { try { localStorage.removeItem(AK); } catch (x) { /* yok */ } clearTimeout(zaman); if (eskiHepsi) return eskiHepsi(d); };

/* açılışta ve uygulama öne gelince planla (önplanda değilken zamanlayıcıyı iOS dondurabilir) */
function sw() { return navigator.serviceWorker && navigator.serviceWorker.ready ? navigator.serviceWorker.ready : Promise.resolve(null); }
function baslat() { sw().then(function (r) { env0 = null; var e = ortam(); e.sw = r; env0 = e; planla(); }, function () { planla(); }); }
document.addEventListener('DOMContentLoaded', baslat);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') planla(); });

AT.denge = { say: say, etiket: etiket, acikKas: acikKas, kapsam: kapsam, sec: sec, neden: neden, seviye: seviye, GUC: GUC, SEVIYE: SEVIYE,
  hatirlat: { destek: destek, ayar: ayar, ayarYaz: ayarYaz, sonrakiGun: sonrakiGun, planla: planla, goster: goster } };
})(window.AT);
