(function () {
'use strict';

/* ---------- yardımcılar ---------- */
var KEY = 'agirlik-takip-v1';
var KAS = ['Göğüs', 'Sırt', 'Omuz', 'Bacak', 'Kol', 'Karın'];
var HAZIR = [
  ['Bench Press', 'Göğüs'], ['Incline Dumbbell Press', 'Göğüs'], ['Cable Fly', 'Göğüs'], ['Dips', 'Göğüs'],
  ['Deadlift', 'Sırt'], ['Barbell Row', 'Sırt'], ['Pull-up', 'Sırt'], ['Lat Pulldown', 'Sırt'],
  ['Overhead Press', 'Omuz'], ['Lateral Raise', 'Omuz'],
  ['Squat', 'Bacak'], ['Leg Press', 'Bacak'], ['Romanian Deadlift', 'Bacak'], ['Leg Curl', 'Bacak'],
  ['Biceps Curl', 'Kol'], ['Triceps Pushdown', 'Kol'],
  ['Cable Crunch', 'Karın']
];
var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
var GUN = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

function p2(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function parse(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; }
var NF = {};   /* fmt: ondalık sayısı başına tek biçimleyici (toLocaleString her çağrıda yenisini kuruyordu; 5 yılda %8-10 CPU) */
function fmt(n, d) { d = d == null ? 1 : d; return (NF[d] || (NF[d] = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }))).format(+n); }
/* büyük sayı: sayarak yükselme animasyonu için data-say (ham sayı) + data-say-ond (ondalık hane); metin fmt ile normal yazılır */
function sayData(n, d) { d = d == null ? 1 : d; var k = Math.pow(10, d), v = Math.round(+n * k) / k; return '<data class="say" value="' + v + '" data-say="' + v + '" data-say-ond="' + d + '">' + fmt(v, d) + '</data>'; }
function tarih(s, kisa) { var d = parse(s); return d.getDate() + ' ' + AYLAR[d.getMonth()].slice(0, kisa ? 3 : 20) + (kisa ? '' : ' ' + d.getFullYear()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
/* tahmini 1RM. rpe yok/geçersiz -> Epley. rpe (6–10) varsa RPE tablosu eğrisi:
   x = kalan tekrar (10 − rpe) + (tekrar − 1); x ≤ 2,92 ise ikinci derece, sonra doğrusal, x ≥ 16 ise %50 */
function e1rm(kg, reps, rpe) {
  if (!(kg > 0) || !(reps > 0)) return 0;
  var r = rpe == null || rpe === '' ? NaN : num(rpe);
  if (!(r >= 6 && r <= 10)) return reps === 1 ? kg : kg * (1 + reps / 30);
  var x = (10 - r) + (reps - 1);
  if (x <= 0) return kg;
  var y = x >= 16 ? 0.5 : x <= 2.92 ? (0.347619 * x * x - 4.60714 * x + 99.9667) / 100 : (-2.64249 * x + 97.0955) / 100;
  return kg / y;
}
/* rekor, grafik, durağanlık ve kart için tahmini max: 12 tekrarın üstünde formüller bozulur (Strong da yalnız ≤12'yi sayar),
   o setler 0 döner (toplam, set sayısı ve hedef hesapları etkilenmez; CSV ham e1rm'i yazar) */
var MAX_TEKRAR = 12;
function tahminiMax(kg, reps, rpe) { return reps > MAX_TEKRAR ? 0 : e1rm(kg, reps, rpe); }
function haftaBasi(s) { var d = parse(s); var g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); return iso(d); }
function $(s, r) { return (r || document).querySelector(s); }

/* ---------- veri ---------- */
var S;
function bos() { return { v: 1, sessions: [], bw: [], kcal: [], takviye: { liste: [], alinan: {} }, defter: [], ozel: [], active: null, dinlenme: 90, tema: 'koyu', temaV: 4, bulk: null }; }
function yukle() {
  try { var r = localStorage.getItem(KEY); S = r ? Object.assign(bos(), { temaV: 0 }, JSON.parse(r)) : bos(); } catch (e) { S = bos(); }
  /* tek seferlik: eski varsayılan açık temadan koyuya (Aziz: "açık çok göz alıyor"); sonra seçim kullanıcının */
  if (!S.temaV) { if (S.tema === 'acik') S.tema = 'koyu'; S.temaV = 2; }
  /* tek seferlik (v42): sade varsayılan Koyu; otomatik Apple'a alınanlar (temaV 3) bir kez Koyu'ya döner; Apple Ayarlar'dan seçilebilir */
  if (S.temaV < 4) { if (S.temaV < 3 || S.tema === 'apple') S.tema = 'koyu'; S.temaV = 4; }
  /* süren antrenmanın son hâli ayrı anahtardaysa (kaydet(true)) onu al; antrenman bittiyse eski kopya yok sayılır */
  try { var a = JSON.parse(localStorage.getItem(KEY_AKTIF) || 'null'); if (a && S.active && a.id === S.active.id) S.active = a; } catch (e) { }
}
/* kaydet(true): yalnız süren antrenman değişti (set kutusu, ✓, set ekle/tipi, ad, not). Bütün veriyi yeniden yazmak yerine
   ~2 KB'lık S.active ayrı anahtara yazılır; eşitleme tetiklenmez (antrenman bitince tam kayıt). 5 yıllık veride telefonda
   ✓ ~130 ms'den ~20 ms'ye iner. Tam kayıt bu anahtarı siler; yukle() aynı antrenmansa onu okur. */
var KEY_AKTIF = KEY + '-aktif';
var tamamSon = 0;   /* son set ✓ anı (çift dokunuş koruması, islem.tamam) */
/* surum: her tam kayıtta artar (S'yi değiştiren her yol — yeniDurum, içe aktarma, tümünü sil, Geri al — tam kaydet() çağırır).
   prHesapla, AT.notlar, AT.hedefSet ve harcama sonuçları bu sayıyla önbellekte; kaydet(true) yalnız S.active'i değiştirir, sayı artmaz */
var surum = 0;
function kaydet(aktif) {
  if (aktif === true && S.active) { try { localStorage.setItem(KEY_AKTIF, JSON.stringify(S.active)); return; } catch (e) { /* tam kayda düş */ } }
  surum++;
  try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.removeItem(KEY_AKTIF); } catch (e) { toast('Kaydedilemedi (depolama dolu?)'); }
  if (AT.degisti) AT.degisti();   /* esitle.js: değişiklikten sonra eşitleme */
}
/* window.HAREKETLER (hareketler.js) varsa geniş liste: [{ad, tr, kas, ikincil, ekipman, tip}]; yoksa HAZIR */
function tumEgz() {
  var l = window.HAREKETLER && window.HAREKETLER.length ? window.HAREKETLER : HAZIR.map(function (x) { return { ad: x[0], kas: x[1] }; });
  return l.concat(S.ozel);
}
function ikincilOf(ad) { var t = tumEgz().filter(function (x) { return x.ad === ad; })[0]; return t && Array.isArray(t.ikincil) ? t.ikincil : []; }
function kasOf(ad) { var t = tumEgz().filter(function (x) { return x.ad === ad; })[0]; return t ? t.kas : 'Diğer'; }

function bitenSeanslar() {
  return S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); });
}
/* set tipi s.tip: yok = normal · 'isinma' (rekor, toplam, öneri, tahmini max dışı); set numarasına dokununca değişir.
   yapilanSetler: istatistik için iş setleri; tumSetler: kaydedilecek tüm bitmiş setler (ısınma dahil) */
var TIPLER = ['', 'isinma'];
function gecerliSet(s) { return s.done && num(s.kg) >= 0 && num(s.reps) > 0; }
function yapilanSetler(ex) { return ex.sets.filter(function (s) { return gecerliSet(s) && s.tip !== 'isinma'; }); }
function tumSetler(ex) { return ex.sets.filter(gecerliSet); }
function hacim(ex) { return yapilanSetler(ex).reduce(function (t, s) { return t + num(s.kg) * num(s.reps); }, 0); }
function seansHacim(se) { return se.exs.reduce(function (t, e) { return t + hacim(e); }, 0); }
function seansSetSayisi(se) { return se.exs.reduce(function (t, e) { return t + yapilanSetler(e).length; }, 0); }

/* set için soluk sayı: notlar.js bugünkü hedefi (aynı kg × hedef tekrar) varsa o, yoksa geçen seferin aynı sıradaki seti */
function hedefPv(ad, prev, wi, ex, si) {
  var hd = AT.hedefSet ? AT.hedefSet(ad) : null;
  if (hd && (hd.kg > 0 || hd.va) && hd.tekrar > 0) {   /* va: vücut ağırlığı (d8), soluk kg 0 kalır */
    /* a8: bu seansta aynı kg'daki son bitmiş iş seti hedefin 2+ altında kaldıysa sonraki setlerin hedefi o tekrara iner (yalnız soluk sayı) */
    var r = hd.tekrar;
    if (ex) ex.sets.slice(0, si).forEach(function (x) { if (x.done && x.tip !== 'isinma' && num(x.kg) === hd.kg && num(x.reps) > 0) r = num(x.reps) <= hd.tekrar - 2 ? num(x.reps) : hd.tekrar; });
    return { kg: String(hd.kg), reps: String(r) };
  }
  return prev[wi] || prev[prev.length - 1] || null;
}
/* b2: dinlenme harekete özel sürenin 2 katını geçtiyse o hareketin sıradaki seti hafifçe vurgulanır (yeniden çizmeden) */
function setVurgu() {
  Array.prototype.forEach.call(document.querySelectorAll('.setgrid.gecikti'), function (x) { x.classList.remove('gecikti'); });
  var a = S.active; if (!a) return;
  var son = null, se = -1;
  a.exs.forEach(function (e, ei) { e.sets.forEach(function (x) { if (x.done && x.t && (!son || x.t > son.t)) { son = x; se = ei; } }); });
  if (!son) return;
  var e = a.exs[se], si = -1; e.sets.forEach(function (x, i) { if (si < 0 && !x.done) si = i; });
  if (si < 0 || Date.now() - son.t < 2 * dinlenmeOf(e.ad) * 1000) return;
  var inp = $('input[data-e="' + se + '"][data-s="' + si + '"][data-f="kg"]'); if (inp) inp.closest('.setgrid').classList.add('gecikti');
}
function oncekiSetler(ad) {
  var l = bitenSeanslar();
  for (var i = l.length - 1; i >= 0; i--) {
    var e = l[i].exs.filter(function (x) { return x.ad === ad; })[0];
    if (e && yapilanSetler(e).length) return yapilanSetler(e);
  }
  return [];
}
/* hareketin son n seansı (en yeni önce): [{date, sets}]; ısınma setleri hariç */
function sonSeanslar(ad, n) {
  var l = bitenSeanslar(), out = [];
  for (var i = l.length - 1; i >= 0 && out.length < n; i--) {
    var e = l[i].exs.filter(function (x) { return x.ad === ad; })[0], sets = e ? yapilanSetler(e) : [];
    if (sets.length) out.push({ date: l[i].date, sets: sets });
  }
  return out;
}
/* antrenmanda hareket başı: "Geçen sefer" satırı; 2+ seans varsa dokununca son 3 seans açılır (tarih · setler · tahmini max) */
var acikGecmis = {};
function miniGecmis(ad) {
  var l = sonSeanslar(ad, 3); if (!l.length) return '';
  var bas = 'Geçen sefer: <b>' + gecenYaz(l[0].sets) + '</b>';
  if (l.length < 2) return '<p class="hint gecen">' + bas + '</p>';
  return '<details class="mini-gecmis" data-ad="' + h(ad) + '"' + (acikGecmis[ad] ? ' open' : '') + '><summary class="hint gecen">' + bas + '<span class="neden">son ' + l.length + '</span></summary><ul>' +
    l.map(function (x) {
      var m = x.sets.reduce(function (t, s) { return Math.max(t, tahminiMax(num(s.kg), num(s.reps), s.rpe)); }, 0);
      return '<li><span class="t">' + tarih(x.date, 1) + '</span><span class="s">' + gecenYaz(x.sets) + '</span><span class="m">' + (m > 0 ? 'max ~' + fmt(m) : '') + '</span></li>';
    }).join('') + '</ul></details>';
}

/* PR: her egzersiz için kronolojik koşan en iyi; ilk seans referans (rozet yok).
   d8: hareketin seanstaki bütün iş setleri 0 kg ise (vücut ağırlığı) rekor = tek sette en çok tekrar ({ad:'En çok tekrar', va:1});
   taban yalnız 0 kg seanslardan, ilk 0 kg seans referans. Karışık (bir set bile kg > 0) seans tahmini max yolundan; o yolun ilk
   kg > 0 seansı da referans (0 → 20 kg "rekor" olmaz) */
var prOnb = { k: -1, m: null };   /* sonuç yalnız okunur; surum değişmedikçe önbellekten */
function prHesapla() {
  if (prOnb.k === surum) return prOnb.m;
  var en = {}, map = {};
  bitenSeanslar().forEach(function (se) {
    se.exs.forEach(function (e) {
      var sets = yapilanSetler(e); if (!sets.length) return;
      var b = en[e.ad], m1 = 0, m1s = null, mk = 0, mr = 0, mrs = null;
      sets.forEach(function (s) { var v = tahminiMax(num(s.kg), num(s.reps), s.rpe); if (v > m1) { m1 = v; m1s = s; } mk = Math.max(mk, num(s.kg)); if (num(s.reps) > mr) { mr = num(s.reps); mrs = s; } });
      var va = mk === 0;
      if (b) {
        var t = [];
        if (va) { if (b.tk > 0 && mr > b.tk) t.push({ ad: 'En çok tekrar', yeni: mr, fark: mr - b.tk, set: mrs, va: 1 }); }
        else {
          if (b.e1 > 0 && m1 > b.e1 + 0.05) t.push({ ad: 'Tahmini max', yeni: m1, fark: m1 - b.e1, set: m1s });
          if (b.kg > 0 && mk > b.kg + 0.05) t.push({ ad: 'En ağır', yeni: mk, fark: mk - b.kg });
        }
        if (t.length) (map[se.id] = map[se.id] || {})[e.ad] = t;
      }
      en[e.ad] = { e1: Math.max(b ? b.e1 : 0, m1), kg: Math.max(b ? b.kg : 0, mk), tk: Math.max(b ? b.tk : 0, va ? mr : 0) };
    });
  });
  prOnb = { k: surum, m: map, en: en };
  return map;
}
/* süren antrenmanda tahmini max rekorunu geçen setler: {'ei|si': yeni max, ei: 1}. Taban biten seansların en iyisi (prHesapla
   önbelleği; ilk seans referans, +0,05 eşiği aynı), sette sırayla koşan en iyi. ✓ başına yalnız bu seansın setleri gezilir.
   d8: hareketin bu seanstaki bitmiş iş setleri hep 0 kg ise tekrar rekoru (taban en çok tekrar); değer tekrar, out['t'+ei+'|'+si] = 1 */
var aktifRek = {};
function aktifRekor(a) {
  prHesapla(); var en = prOnb.en || {}, kos = {}, out = {};
  a.exs.forEach(function (e, ei) {
    var b = en[e.ad]; if (!b) return;
    var k = kos[e.ad] || (kos[e.ad] = { m: b.e1, r: b.tk || 0 });
    var is = e.sets.filter(function (s) { return gecerliSet(s) && s.tip !== 'isinma'; }), va = is.every(function (s) { return num(s.kg) === 0; });
    is.forEach(function (s) {
      var si = e.sets.indexOf(s);
      if (va) { var r = num(s.reps); if (k.r > 0 && r > k.r) { k.r = r; out[ei + '|' + si] = r; out['t' + ei + '|' + si] = 1; out[ei] = 1; } return; }
      var v = tahminiMax(num(s.kg), num(s.reps), s.rpe);
      if (k.m > 0 && v > k.m + 0.05) { k.m = v; out[ei + '|' + si] = v; out[ei] = 1; }
    });
  });
  return out;
}

/* ---------- demo veri ---------- */
function demoUret() {
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var prog = [
    [['Bench Press', 62.5, 1.25, 8], ['Overhead Press', 40, 0.8, 8], ['Incline Dumbbell Press', 22, 0.5, 10], ['Triceps Pushdown', 30, 0.8, 12]],
    [['Barbell Row', 60, 1.25, 8], ['Pull-up', 0, 0, 8], ['Lat Pulldown', 55, 1, 10], ['Biceps Curl', 14, 0.4, 10]],
    [['Squat', 80, 2.5, 6], ['Romanian Deadlift', 75, 2, 8], ['Leg Press', 140, 5, 10], ['Cable Crunch', 40, 1, 12]]
  ];
  var adlar = ['İtiş', 'Çekiş', 'Bacak'];
  var bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  var basla = new Date(bugun); basla.setDate(basla.getDate() - 84);
  var g = (basla.getDay() + 6) % 7; basla.setDate(basla.getDate() - g);
  var n = 0, out = [], bw = [];
  for (var w = 0; w < 13; w++) {
    [0, 2, 4].forEach(function (gun, k) {
      var d = new Date(basla); d.setDate(d.getDate() + w * 7 + gun);
      if (d >= bugun || rnd() < 0.12) return;
      var dene = (n++ % 3);
      var exs = prog[dene].map(function (p) {
        var kg = Math.round((p[1] + p[2] * w + (rnd() - .5) * p[2] * 3) / 1.25) * 1.25;
        var bt = p[1] === 0 ? p[3] + Math.floor(w / 3) : p[3];   /* vücut ağırlığı (barfiks): tekrar ilerler (d8) */
        var sets = []; for (var i = 0; i < 3 + (rnd() > .7 ? 1 : 0); i++) {
          var tekrar = Math.max(3, bt - (i > 0 ? Math.round(rnd() * 2 + (i - 1)) : 0));
          sets.push({ kg: String(Math.max(0, kg)), reps: String(tekrar), done: true });
        }
        return { ad: p[0], kas: kasOf(p[0]), sets: sets };
      });
      out.push({ id: 'd' + iso(d), date: iso(d), start: d.getTime() + 18 * 36e5, end: d.getTime() + 19 * 36e5, name: adlar[dene] + ' (örnek)', exs: exs, demo: true });
    });
  }
  for (var i = 0; i <= 84; i += 3) {
    var d = new Date(basla); d.setDate(d.getDate() + i); if (d > bugun) break;
    bw.push({ id: 'dbw' + i, date: iso(d), kg: Math.round((84.2 - i * 0.025 + (rnd() - .5) * 0.8) * 10) / 10, demo: true });
  }
  var ek = AT.demoBw ? AT.demoBw(basla, bugun) : null;
  return { sessions: out, bw: ek ? ek.bw : bw, bulk: ek ? ek.bulk : null, kcal: ek && ek.kcal ? ek.kcal : [] };
}

/* ---------- durum ---------- */
var tab = 'bugun', gecmisAy = null, secEgz = null, restBitis = 0, restSure = 0, restTimer = null, tickT = null, restEgz = null;
/* S.dinlenmeEgz = {hareket adı: saniye}; yoksa genel S.dinlenme */
function dinlenmeOf(ad) { var m = S.dinlenmeEgz || {}; return m[ad] >= 10 ? m[ad] : (S.dinlenme || 90); }

/* ---------- grafik ---------- */
var gid = 0;
/* grafik genişliği = .panel genişliği (view iç genişliği; masaüstünde iki sütundan biri) → SVG 1:1, yazılar gerçek 12px */
var KOL_ARA = 48;   /* style.css .duzen column-gap ile aynı */
function masaustu() { return !!(window.matchMedia && matchMedia('(min-width:1024px)').matches); }
function grafikW() {
  var v = $('#view'), w = 600;
  if (v) { var cs = getComputedStyle(v); w = v.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); }
  if (masaustu()) w = (w - KOL_ARA) / 2;
  return Math.round(Math.max(240, Math.min(760, w)));
}
/* iki sütun: telefonda alt alta (sıra aynı), masaüstünde yan yana. cls: 'yan' (sağ dar, yapışkan) · 'takvim' (sol dar) */
function kol(a, b, cls) { return '<div class="duzen' + (cls ? ' ' + cls : '') + '"><div class="kol">' + a + '</div><div class="kol">' + b + '</div></div>'; }
/* uzunluğu n olan seride en fazla k etiket için indeksler (ilk ve son dahil) */
function etiketIdx(n, k) { var r = []; if (n < 1) return r; k = Math.max(2, Math.min(k, n)); for (var i = 0; i < k; i++) { var j = Math.round(i * (n - 1) / (k - 1)); if (r.indexOf(j) < 0) r.push(j); } return r; }
/* "yuvarlak" eksen adımı: aralık r, yaklaşık n bölme → 1 · 2 · 2,5 · 5 · 10 × 10^k */
function adim(r, n) {
  var ham = r / (n || 4); if (!(ham > 0)) return 1;
  var e = Math.pow(10, Math.floor(Math.log(ham) / Math.LN10)), f = ham / e, c = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < c.length; i++) if (f <= c[i] + 1e-9) return c[i] * e;
  return 10 * e;
}
function ondalik(st) { var d = 0; while (d < 3 && Math.abs(st * Math.pow(10, d) - Math.round(st * Math.pow(10, d))) > 1e-6) d++; return d; }
/* pts: [{x: ms, y: sayı, t: etiket, ham?: o günün gerçek tartısı}]
   o: {baslik, birim:'kg', ref:[{x,y},{x,y}] kesik hedef çizgisi, refAd:'Hedef', seriAd: açıklamada çizginin adı,
       ham: true → ham tartılar soluk nokta (tek path; 200 noktaya kadar), ek: function (p) → dokunma etiketinin 3. satırı,
       koni: {a, b: [[x,y]...] iki kenar (ilk nokta çizginin sonu), o: orta çizgi, v: [x,y] varış noktası?, bant: [x,x]?,
             etiket?, ex: etiketin x'i, ozet?} gelecek tahmini (bulk.js); eksen koninin ucuna uzar, dokununca "tahmin" ve aralık,
       hedef: {y, ad, alt: etiket çizginin altında} yatay ince hedef çizgisi,
       rek: [nokta indeksi] altın rekor noktaları, tas: [{i, v, t}] kilometre taşı bayrakları (v eşik, t eksen tarihi)}
   Etkileşim: GV[id] (piksel konumları + noktalar) ve tek document dinleyicisi (grafikOlay); nokta başına dinleyici yok. */
var GV = {};
var AY3 = AYLAR.map(function (a) { return a.slice(0, 3); });
function eksenTarih(x, uzun) { var d = new Date(x); return uzun ? AY3[d.getMonth()] + ' ' + d.getFullYear() : d.getDate() + ' ' + AY3[d.getMonth()]; }
function grafikId() { var id = 'g' + (++gid); if (gid === 1) GV = {}; return id; }   /* render() gid'i sıfırlar: eski kayıtlar atılır */
function cizgi(pts, o) {
  o = o || {}; var W = grafikW(), H = 210, R = 14, B = 28, bir = o.birim ? ' ' + o.birim : '';
  pts = (pts || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
  if (!pts.length) return '<p class="empty">Henüz veri yok.</p>';
  var id = grafikId(), n = pts.length;
  var ref = (o.ref || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
  var kn = o.koni && o.koni.a && o.koni.a.length > 1 && o.koni.b && o.koni.b.length > 1 ? o.koni : null;
  var hd = o.hedef && isFinite(o.hedef.y) ? o.hedef : null, tas = o.tas || [], rek = {};
  (o.rek || []).forEach(function (i) { rek[i] = 1; });
  var hamVar = o.ham && n <= 200, T = ref.length > 1 || hamVar || tas.length ? 34 : 14;
  var mn = Infinity, mx = -Infinity, x0 = Infinity, x1 = -Infinity;
  function kap(p, y) { if (y < mn) mn = y; if (y > mx) mx = y; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
  pts.forEach(function (p) { kap(p, p.y); if (hamVar && p.ham > 0) kap(p, p.ham); });
  ref.forEach(function (p) { kap(p, p.y); });
  if (kn) kn.a.concat(kn.b).forEach(function (q) { kap({ x: q[0] }, q[1]); });
  if (hd) kap({ x: pts[0].x }, +hd.y);
  var st = adim(mx - mn > 0 ? mx - mn : Math.max(1, Math.abs(mx) * .05), 4);
  var y0 = Math.floor(mn / st + 1e-9) * st, y1 = Math.ceil(mx / st - 1e-9) * st;
  if (y1 - y0 < st * 2) { y0 -= st; y1 += st; }
  /* hedef çizgisi grafiğin kenarına yapışmasın (koninin düz ucu çerçeve gibi okunur): bir adım pay */
  if (hd && +hd.y > y1 - st * .2) y1 += st;
  if (hd && +hd.y < y0 + st * .2 && y0 - st >= 0) y0 -= st;
  if (mn >= 0 && y0 < 0) { y0 = 0; }
  var dc = ondalik(st), et = [];
  for (var v = y0, k = 0; v <= y1 + st * 1e-6 && k < 12; v += st, k++) et.push([v, fmt(v, dc)]);
  /* sol boşluk en uzun eksen yazısına göre (12px tabular ~7px/karakter) */
  var L = Math.max(30, 14 + 7 * Math.max.apply(0, et.map(function (e) { return e[1].length; })));
  var yil = x1 - x0 > 300 * 864e5;
  function X(x) { return x1 === x0 ? (L + W - R) / 2 : L + (x - x0) / (x1 - x0) * (W - L - R); }
  function Y(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
  function P(q) { return X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }
  /* ekran okuyucu özeti: "Ortalama kilo, son 82,4 kg, 12 haftada +1,8 kg" (nokta <title>'ları role=img içinde okunmaz) */
  var fk = pts[n - 1].y - pts[0].y, gun = Math.round((pts[n - 1].x - pts[0].x) / 864e5);
  var ozet = (o.baslik || 'Grafik') + ', son ' + fmt(pts[n - 1].y) + bir + (n > 1 && gun > 0 ? ', ' + (gun >= 14 ? Math.round(gun / 7) + ' haftada ' : gun + ' günde ') + (fk > 0 ? '+' : fk < 0 ? '−' : '±') + fmt(Math.abs(fk)) + bir : '') + '. ' + (kn && kn.ozet ? kn.ozet + '. ' : '') + 'Ok tuşlarıyla noktalar gezilir.';
  var s = '<svg class="chart cizgi" data-g="' + id + '" tabindex="0" width="' + W + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(ozet) + '"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity=".22"/><stop offset=".55" stop-opacity=".07"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>';
  et.forEach(function (e) {
    var y = Math.round(Y(e[0])) + .5;
    s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + e[1] + '</text>';
  });
  /* hedef kilo: yatay ince çizgi; etiket koninin uzağında, sol uçta (çizginin başı etiket tarafındaysa sağ uçta).
     alt: çizgi hedefin üstünde, etiket çizginin altında */
  if (hd) {
    var hy = Math.round(Y(+hd.y)) + .5, solBos = hd.alt ? pts[0].y >= +hd.y : pts[0].y <= +hd.y;
    s += '<line class="hedefc" x1="' + L + '" x2="' + (W - R) + '" y1="' + hy + '" y2="' + hy + '"/><text class="hedeft" x="' + (solBos ? L + 2 : W - R) + '" y="' + (hd.alt ? hy + 15 : hy - 6) + '" text-anchor="' + (solBos ? 'start' : 'end') + '">' + h(hd.ad) + '</text>';
  }
  /* gelecek konisi: iki kenar arası yumuşak degrade (soldan sağa söner), ince kenarlar, kesik orta çizgi, varış noktası, eksende
     varış bandı. Çizginin altında çizilir; .koni CSS'te çizgi çizildikten sonra belirir */
  if (kn) {
    s += '<defs><linearGradient id="' + id + 'k" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-opacity=".34"/><stop offset="1" stop-opacity=".08"/></linearGradient></defs><g class="koni">' +
      '<path class="koni-a" fill="url(#' + id + 'k)" d="M' + kn.a.map(P).join(' L') + ' L' + kn.b.slice().reverse().map(P).join(' L') + 'Z"/>' +
      '<path class="koni-k" d="M' + kn.a.map(P).join(' L') + ' M' + kn.b.map(P).join(' L') + '"/>' +
      (kn.o && kn.o.length > 1 ? '<path class="koni-o" d="M' + kn.o.map(P).join(' L') + '"/>' : '') +
      (kn.bant ? '<rect class="bant" x="' + X(kn.bant[0]).toFixed(1) + '" y="' + (H - B - 2.5) + '" width="' + Math.max(5, X(kn.bant[1]) - X(kn.bant[0])).toFixed(1) + '" height="5" rx="2.5"/>' : '') +
      (kn.v ? '<circle class="koni-v" cx="' + X(kn.v[0]).toFixed(1) + '" cy="' + Y(kn.v[1]).toFixed(1) + '" r="4"/>' : '') + '</g>';
  }
  /* piksel konumları bir kez hesaplanır (path, noktalar ve dokunma aynı diziyi kullanır) */
  var px = new Array(n), py = new Array(n), d = new Array(n);
  for (var i = 0; i < n; i++) { px[i] = Math.round(X(pts[i].x) * 10) / 10; py[i] = Math.round(Y(pts[i].y) * 10) / 10; d[i] = (i ? 'L' : 'M') + px[i] + ' ' + py[i]; }
  d = d.join(' ');
  /* Apple teması: yumuşak (monoton kübik) eğri; tepe/dip taşmaz */
  if (n > 2 && n <= 400 && document.documentElement.dataset.tema === 'apple') {
    var mm = [], dx = [], sl = [], j;
    for (j = 0; j < n - 1; j++) { dx[j] = px[j + 1] - px[j]; sl[j] = dx[j] ? (py[j + 1] - py[j]) / dx[j] : 0; }
    mm[0] = sl[0]; mm[n - 1] = sl[n - 2];
    for (j = 1; j < n - 1; j++) mm[j] = sl[j - 1] * sl[j] <= 0 ? 0 : (sl[j - 1] + sl[j]) / 2;
    for (j = 0; j < n - 1; j++) {
      if (sl[j] === 0) { mm[j] = 0; mm[j + 1] = 0; continue; }
      var aa = mm[j] / sl[j], bb = mm[j + 1] / sl[j], hh = aa * aa + bb * bb;
      if (hh > 9) { var tt = 3 / Math.sqrt(hh); mm[j] = tt * aa * sl[j]; mm[j + 1] = tt * bb * sl[j]; }
    }
    d = 'M' + px[0] + ' ' + py[0];
    for (j = 0; j < n - 1; j++) d += ' C' + (px[j] + dx[j] / 3).toFixed(1) + ' ' + (py[j] + mm[j] * dx[j] / 3).toFixed(1) + ' ' + (px[j + 1] - dx[j] / 3).toFixed(1) + ' ' + (py[j + 1] - mm[j + 1] * dx[j] / 3).toFixed(1) + ' ' + px[j + 1] + ' ' + py[j + 1];
  }
  if (n > 1) s += '<path class="alan" fill="url(#' + id + ')" d="' + d + ' L' + px[n - 1] + ' ' + (H - B) + ' L' + px[0] + ' ' + (H - B) + 'Z"/>';
  if (hamVar) {
    var hd = ''; pts.forEach(function (p, i) { if (p.ham > 0) hd += 'M' + px[i] + ' ' + Math.round(Y(p.ham) * 10) / 10 + 'h0'; });
    if (hd) s += '<path class="ham" d="' + hd + '"/>';
  }
  var lx = L, ly = 13;
  function lejant(tur, ad) {
    var w = 7 * ad.length + 34;
    if (tur === 'ham') s += '<path class="ham" d="M' + (lx + 9) + ' ' + ly + 'h0"/>';
    else s += '<path class="' + tur + '" d="M' + lx + ' ' + ly + 'h18"/>';
    s += '<text class="leg" x="' + (lx + (tur === 'ham' ? 16 : 24)) + '" y="' + (ly + 4) + '">' + h(ad) + '</text>'; lx += w - (tur === 'ham' ? 8 : 0);
  }
  if (ref.length > 1) {
    s += '<path class="ref" d="' + ref.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ') + '"><title>' + h((o.refAd || 'Hedef') + ': ' + fmt(ref[ref.length - 1].y) + bir) + '</title></path>';
  }
  if (ref.length > 1 || hamVar) {   /* açıklama satırı: çizginin üstünde kendi şeridinde, hiçbir şeyle çakışmaz */
    lejant('ln', o.seriAd || 'değer');
    if (hamVar) lejant('ham', 'tartı');
    if (ref.length > 1 && o.refAd !== false) lejant('ref', o.refAd || 'Hedef');
  }
  s += '<path class="ln" pathLength="1" d="' + d + '"/>';
  var son = n - 1;
  for (i = 0; i < n; i++) {
    var tt = '<title>' + h(pts[i].t) + ': ' + fmt(pts[i].y) + h(bir) + '</title>';
    if (i === son) s += '<circle class="hale' + (rek[i] ? ' rek' : '') + '" cx="' + px[i] + '" cy="' + py[i] + '" r="9"/><circle class="dot son' + (rek[i] ? ' rek' : '') + '" cx="' + px[i] + '" cy="' + py[i] + '" r="4.5">' + tt + '</circle>';
    else if (rek[i]) s += '<circle class="dot rek" cx="' + px[i] + '" cy="' + py[i] + '" r="' + (n <= 20 ? 4 : 3.5) + '">' + tt + '</circle>';
    else if (n <= 20) s += '<circle class="dot" cx="' + px[i] + '" cy="' + py[i] + '" r="3">' + tt + '</circle>';
    else s += '<circle class="hit" cx="' + px[i] + '" cy="' + py[i] + '" r="7">' + tt + '</circle>';
  }
  /* kilometre taşları: noktadan yukarı ince direk + sola bakan flama, eşik değeri flamanın solunda (yükselen çizgide sol üst boştur);
     soldaki eksen yazılarına taşarsa sağa döner. Yazılar sondan başa yerleşir, çakışan yazı atlanır (flama kalır) */
  var kutu = [], tasSon = false;
  function cakisir(a) { return kutu.some(function (k) { return a[0] < k[2] && a[2] > k[0] && a[1] < k[3] && a[3] > k[1]; }); }
  tas.slice().reverse().forEach(function (m) {
    var i = m.i; if (!(i >= 0 && i < n)) return; if (i === son) tasSon = true;
    var x = px[i], y = py[i], ty = Math.max(4, y - 22), yt = fmt(m.v, 0), tw = 7 * yt.length + 2, sag = x - 12 - tw < L - 4;
    s += '<g class="tas"><line class="tas-c" x1="' + x + '" x2="' + x + '" y1="' + (y + 6).toFixed(1) + '" y2="' + (H - B) + '"/><path class="tas-d" d="M' + x + ' ' + (y - 5).toFixed(1) + 'V' + ty.toFixed(1) + '"/>' +
      '<path class="tas-f" d="M' + x + ' ' + ty.toFixed(1) + 'l' + (sag ? 9 : -9) + ' 3.5l' + (sag ? -9 : 9) + ' 3.5z"/>';
    var bx = sag ? [x + 12, ty - 3, x + 12 + tw, ty + 11] : [x - 12 - tw, ty - 3, x - 12, ty + 11];
    if (!cakisir(bx)) { kutu.push(bx); s += '<text class="tas-v" x="' + (sag ? x + 12 : x - 12) + '" y="' + (ty + 8).toFixed(1) + '" text-anchor="' + (sag ? 'start' : 'end') + '">' + h(yt) + '</text>'; }
    s += '</g>';
  });
  /* son değer etiketi: çizginin geldiği yönün tersinde (yükselen çizgide üstte); son noktada taş varsa altta (flamayla çakışmasın) */
  var sv = fmt(pts[son].y) + bir, sw = 7 * sv.length + 16, onc = py[Math.max(0, son - Math.max(1, Math.round(n / 12)))];
  var ust = (n < 2 || onc >= py[son]) && !tasSon; if (ust && py[son] - 30 < 2) ust = false; if (!ust && py[son] + 30 > H - B) ust = true;
  var sx = Math.max(L, Math.min(W - 2 - sw, px[son] - sw / 2)), sy = ust ? py[son] - 30 : py[son] + 10;
  s += '<g class="sonet"><rect x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="' + sw + '" height="20" rx="10"/><text x="' + (sx + sw / 2).toFixed(1) + '" y="' + (sy + 14).toFixed(1) + '" text-anchor="middle">' + h(sv) + '</text></g>';
  /* x ekseni: önce koni varış etiketi ve taş tarihleri, sonra düzenli tarihler; çakışan yazı atlanır */
  var eks = [], xs = [];
  function eksen(x, t, cls) {
    var w = 6.6 * t.length, an = x < L + w / 2 ? 'start' : x > W - 2 - w / 2 ? 'end' : 'middle', a = an === 'start' ? x : an === 'end' ? x - w : x - w / 2;
    if (xs.some(function (k) { return a < k[1] + 10 && a + w > k[0] - 10; })) return;
    xs.push([a, a + w]); eks.push('<text' + (cls ? ' class="' + cls + '"' : '') + ' x="' + (+x).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + an + '">' + h(t) + '</text>');
  }
  if (kn && kn.etiket && kn.ex != null) eksen(X(kn.ex), kn.etiket, 'bant-t');
  tas.slice().reverse().forEach(function (m) { if (m.i >= 0 && m.i < n && m.t) eksen(px[m.i], m.t, 'tas-t'); });
  var ix = etiketIdx(n, Math.floor(((kn ? px[son] : W) - L) / (yil ? 96 : 84)) + 1);
  ix.reverse().forEach(function (j) { eksen(px[j], yil ? eksenTarih(pts[j].x, true) : pts[j].t); });
  if (kn) eksen(W - R, eksenTarih(x1, yil), 'kx');
  s += '<g class="grafik-tarihler">' + eks.join('') + '</g>';
  /* koni bölgesinde dokunma: o tarihteki tahmin aralığı (iki kenarın arası) */
  var kHit = null;
  if (kn) {
    var kAra = function (pl, x) {
      for (var j = 1; j < pl.length; j++) if (x <= pl[j][0] || j === pl.length - 1) { var q = pl[j - 1], w = pl[j]; return w[0] === q[0] ? w[1] : q[1] + (w[1] - q[1]) * (x - q[0]) / (w[0] - q[0]); }
      return pl[0][1];
    };
    kHit = function (xp) {
      var xd = Math.min(x1, x0 + (xp - L) / (W - L - R) * (x1 - x0));
      var ya = kAra(kn.a, xd), yb = kAra(kn.b, xd), lo = Math.min(ya, yb), hi = Math.max(ya, yb);
      var yo = kn.o && kn.o.length > 1 ? kAra(kn.o, Math.min(xd, kn.o[kn.o.length - 1][0])) : (lo + hi) / 2;
      return { px: Math.round(X(xd) * 10) / 10, py: Math.round(Y(yo) * 10) / 10, d: eksenTarih(xd), v: (hi - lo < .05 ? fmt(lo) : fmt(lo) + '–' + fmt(hi)) + bir, e: 'tahmin' };
    };
  }
  GV[id] = { tur: 'c', W: W, T: T, A: H - B, px: px, py: py, pts: pts, bir: bir, ref: ref.length > 1 ? ref.map(function (p) { return [X(p.x), p.y]; }) : null, refAd: o.refAd || 'hedef', ek: o.ek, koni: kHit };
  return s + imlec() + '</svg>';
}
/* dokunma/fare etiketi: kılavuz çizgi, nokta, yuvarlak kutu (2–3 satır). Başta görünmez; grafikOlay doldurur */
function imlec() { return '<g class="im" aria-hidden="true"><line class="im-c"/><circle class="im-n" r="5"/><rect class="im-k" rx="8"/><text class="im-t"><tspan class="im-d"/><tspan class="im-v"/><tspan class="im-e"/></text></g>'; }
/* items: [{l: etiket, v: sayı}]; o: {baslik, birim (varsayılan 'kg'), donem (etiket eki, varsayılan ' haftası')} */
function cubuk(items, o) {
  o = o || {}; var bir = o.birim == null ? 'kg' : o.birim, id = grafikId();
  var W = grafikW(), H = 180, R = 4, B = 26, T = 22, mxv = Math.max.apply(0, items.map(function (i) { return i.v || 0; })) || 0;
  var st = adim(mxv > 0 ? mxv : 1, 3), ust = Math.max(st, Math.ceil(mxv / st - 1e-9) * st), dc = ondalik(st), et = [];
  for (var v = 0, k = 0; v <= ust + st * 1e-6 && k < 10; v += st, k++) et.push([v, fmt(v, dc)]);
  var L = Math.max(30, 14 + 7 * Math.max.apply(0, et.map(function (e) { return e[1].length; })));
  var bw = (W - L - R) / Math.max(1, items.length), ix = etiketIdx(items.length, Math.floor((W - L) / 80) + 1), son = items.length - 1;
  var sonI = items.length ? items[items.length - 1] : null, be = bir ? ' ' + bir : '';
  var ozet = (o.baslik || 'Haftalık hacim') + (sonI ? ', ' + items.length + ' hafta, son ' + fmt(sonI.v || 0, 0) + be + ', en çok ' + fmt(mxv, 0) + be : '') + '. Ok tuşlarıyla haftalar gezilir.';
  var s = '<svg class="chart cubuk" data-g="' + id + '" tabindex="0" width="' + W + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(ozet) + '">';
  et.forEach(function (e) {
    var y = Math.round(T + (1 - e[0] / ust) * (H - T - B)) + .5;
    s += '<line class="grid' + (e[0] === 0 ? ' z' : '') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + e[1] + '</text>';
  });
  var ys = [];
  items.forEach(function (it, i) {
    var hh = (H - T - B) * (it.v || 0) / ust, x = L + i * bw + bw * .2; ys.push(H - B - hh);
    if (hh > 0) s += '<rect class="bar' + (i === son ? ' son' : '') + '" data-i="' + i + '" x="' + x.toFixed(1) + '" y="' + (H - B - hh).toFixed(1) + '" width="' + (bw * .6).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="' + Math.min(4, bw * .15).toFixed(1) + '"><title>' + h(it.l) + ': ' + fmt(it.v, 0) + (bir ? ' ' + h(bir) : '') + '</title></rect>';
    if (ix.indexOf(i) >= 0) s += '<text class="grafik-tarih" x="' + (x + bw * .3).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? 'start' : i === son ? 'end' : 'middle') + '"' + (i === 0 ? ' dx="' + (-bw * .3).toFixed(1) + '"' : i === son ? ' dx="' + (bw * .3).toFixed(1) + '"' : '') + '>' + h(it.l) + '</text>';
  });
  /* son değer etiketi: son çubuğun üstünde */
  if (items.length && items[son].v > 0) s += '<text class="sonv" x="' + (L + son * bw + bw * .8).toFixed(1) + '" y="' + (ys[son] - 7).toFixed(1) + '" text-anchor="end">' + fmt(items[son].v, 0) + '</text>';
  GV[id] = { tur: 'b', W: W, T: T, A: H - B, L: L, bw: bw, ys: ys, items: items, bir: bir ? ' ' + bir : '', donem: o.donem == null ? ' haftası' : o.donem };
  return s + imlec() + '</svg>';
}
/* tek dinleyici (document, yetki devri): fare üstündeyken / parmak dokununca en yakın nokta. Dokunmada etiket
   başka yere dokunulana kadar kalır; yatay kaydırma (touch-action: pan-y) etiketi gezdirir. */
var imAcik = null;
function imGizle() { if (imAcik) { imAcik.classList.remove('im-on'); var b = imAcik.querySelector('.bar.on'); if (b) b.classList.remove('on'); imAcik._i = -1; imAcik = null; } }
function imGoster(svg, cx, ki) {
  var g = GV[svg.getAttribute('data-g')]; if (!g) return;
  var r = svg.getBoundingClientRect(); if (!r.width) return;
  var x = ki == null ? (cx - r.left) * g.W / r.width : 0, i, n, j, px, py, d, v, e = '';
  if (g.tur === 'b') {
    n = g.items.length; i = Math.max(0, Math.min(n - 1, ki != null ? ki : Math.floor((x - g.L) / g.bw)));
    px = g.L + (i + .5) * g.bw; py = g.ys[i]; d = g.items[i].l + g.donem; v = fmt(g.items[i].v || 0, 0) + g.bir;
  } else if (g.koni && ki == null && x > g.px[g.px.length - 1] + 8) {   /* gelecek konisi: tahmin aralığı */
    var kk = g.koni(x); i = 'k' + kk.px; px = kk.px; py = kk.py; d = kk.d; v = kk.v; e = kk.e;
  } else {
    var a = g.px; n = a.length; var lo = 0, hi = n - 1;
    while (hi - lo > 1) { j = (lo + hi) >> 1; if (a[j] < x) lo = j; else hi = j; }   /* x'ler sıralı: ikili arama */
    i = ki != null ? Math.max(0, Math.min(n - 1, ki)) : Math.abs(a[lo] - x) <= Math.abs(a[hi] - x) ? lo : hi;
    var p = g.pts[i]; px = a[i]; py = g.py[i];
    d = p.t + (new Date(p.x).getFullYear() !== new Date().getFullYear() ? ' ' + new Date(p.x).getFullYear() : ''); v = fmt(p.y) + g.bir;
    if (g.ek) e = g.ek(p) || '';
    if (g.ref) { var f = g.ref, k2 = f.length - 1; if (px >= f[0][0] - .5 && px <= f[k2][0] + .5) { for (j = 1; j < k2 && f[j][0] < px; j++); var q = f[j - 1], w = f[j], hy = w[0] === q[0] ? w[1] : q[1] + (w[1] - q[1]) * (px - q[0]) / (w[0] - q[0]); e += (e ? ' · ' : '') + g.refAd + ' ' + fmt(hy) + g.bir; } }
  }
  if (imAcik && imAcik !== svg) imGizle();
  imAcik = svg; svg.classList.add('im-on');
  if (svg._i === i) return; svg._i = i;
  var $c = svg.querySelector('.im-c'), $n = svg.querySelector('.im-n'), $k = svg.querySelector('.im-k'), $t = svg.querySelector('.im-t');
  if (g.tur === 'b') { var ob = svg.querySelector('.bar.on'); if (ob) ob.classList.remove('on'); var nb = svg.querySelector('.bar[data-i="' + i + '"]'); if (nb) nb.classList.add('on'); }
  $c.setAttribute('x1', px); $c.setAttribute('x2', px); $c.setAttribute('y1', g.T - 4); $c.setAttribute('y2', g.A);
  $n.setAttribute('cx', px); $n.setAttribute('cy', py); $n.style.display = g.tur === 'b' ? 'none' : '';
  var sat = [d, v, e], ts = $t.children, sy = 0;
  for (j = 0; j < 3; j++) { ts[j].textContent = sat[j]; ts[j].setAttribute('x', 0); ts[j].setAttribute('dy', j ? 17 : 0); ts[j].style.display = sat[j] ? '' : 'none'; }
  var bw = 0; for (j = 0; j < 3; j++) if (sat[j]) bw = Math.max(bw, ts[j].getComputedTextLength());
  var kw = Math.ceil(bw) + 20, kh = (e ? 3 : 2) * 17 + 10, kx = Math.max(2, Math.min(g.W - 2 - kw, px - kw / 2));
  var ky = py - kh - 12; if (ky < 2) ky = Math.min(g.A - kh, py + 14); if (ky < 2) ky = 2;
  if (g.tur === 'b' && ky + kh > py - 4) ky = Math.max(2, py - kh - 6);
  $k.setAttribute('x', kx); $k.setAttribute('y', ky); $k.setAttribute('width', kw); $k.setAttribute('height', kh);
  for (j = 0; j < 3; j++) ts[j].setAttribute('x', kx + 10);
  $t.setAttribute("y", ky + 18);
}
function grafikOlay(ev) {
  var t = ev.target, svg = t && t.closest ? t.closest('svg.chart[data-g]') : null;
  if (ev.type === 'focusout') { if (svg && imAcik === svg) imGizle(); return; }
  if (ev.type === 'keydown') {   /* klavye: odaklı grafikte ← → noktalar, Home/End uçlar */
    var g = svg && GV[svg.getAttribute('data-g')], k = { ArrowLeft: -1, ArrowRight: 1, Home: -1e9, End: 1e9 }[ev.key];
    if (!g || !k || ev.target !== svg) return;
    ev.preventDefault();
    var son = (g.tur === 'b' ? g.items.length : g.px.length) - 1, su = svg._i >= 0 && imAcik === svg ? svg._i : son + (k > 0 ? 0 : 1);
    imGoster(svg, 0, Math.max(0, Math.min(son, su + k))); return;
  }
  if (ev.type === 'pointerout') { if (ev.pointerType !== 'touch' && svg && imAcik === svg && !(ev.relatedTarget && svg.contains(ev.relatedTarget))) imGizle(); return; }
  if (!svg) { if (ev.type === 'pointerdown') imGizle(); return; }
  if (ev.type === 'pointermove' && ev.pointerType === 'touch' && imAcik !== svg) return;   /* parmak kaydırırken (dikey) etiket açılmasın */
  imGoster(svg, ev.clientX);
}
['pointerdown', 'pointermove', 'pointerout', 'focusout'].forEach(function (tur) { document.addEventListener(tur, grafikOlay, { passive: true }); });
document.addEventListener('keydown', grafikOlay);

/* ---------- görünümler ---------- */
function gecenSure(ts) { var m = Math.floor((Date.now() - ts) / 60000); return m < 60 ? m + ' dk' : Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk'; }

/* ilk açılış rehberi: hiç kayıt yokken Bugün'ün üstünde */
function ilkAdimlar() {
  return '<ol class="adimlar">' +
    '<li><b>Kilonu yaz</b><span>Sabah aç karnına tartıl, kilo kutusuna gir. İstersen gün içinde yediğin kaloriyi de yaz; 2 hafta sonra günlük harcamanı hesaplarım.</span></li>' +
    '<li><b>Antrenmana başla</b><span>Hareketleri seç; her set için kg ve tekrar yaz.</span></li>' +
    '<li><b>Seti bitirince ✓\'e bas</b><span>Dinlenme sayacı kendiliğinden başlar. Bir dahaki sefere ne yapacağını burada önereceğim.</span></li>' +
    '</ol>';
}
/* "Geçen sefer" kısa yazımı: aynı kg ise "80 kg × 8, 8, 6", değilse "60×8 · 65×6" */
function gecenYaz(prev) {
  var kg = prev.map(function (s) { return num(s.kg); });
  if (kg.every(function (k) { return k === kg[0]; })) return (kg[0] > 0 ? fmt(kg[0], 2) + ' kg' : 'vücut ağırlığı') + ' × ' + prev.map(function (s) { return h(s.reps); }).join(', ');
  return prev.map(function (s) { return fmt(num(s.kg), 2) + '×' + h(s.reps); }).join(' · ');
}
/* tekrarlanabilir antrenmanlar: farklı adlı son 5 seans (en yeni önce) */
function sadeAd(n) { return String(n || '').replace(/\s*\(örnek\)\s*$/i, '').trim(); }
/* "Squat · Romanian Deadlift · +2": ilk iki hareket, kalanların sayısı */
function hareketOnizle(se) {
  var a = se.exs.map(function (e) { return e.ad; });
  return a.slice(0, 2).join(' · ') + (a.length > 2 ? ' · +' + (a.length - 2) : '');
}
function siradaki() {
  var l = sablonlar(), lim = new Date(); lim.setDate(lim.getDate() - 21); var limS = iso(lim);
  l = l.filter(function (s) { return s.date >= limS; });
  if (l.length < 2) return null;
  /* a13 (veriyle test edilmedi, tutucu): en eskisinden başla; ana kası son 48 saatte çalışılmış olanı atla; hepsi tazeyse en eskisi */
  for (var i = l.length - 1; i >= 0; i--) if (!kasYeni(anaKas(l[i]), 48)) return l[i];
  return l[l.length - 1];
}
/* antrenmanın ana kası: en çok iş setinin kası */
function anaKas(se) {
  var m = {}, en = null; se.exs.forEach(function (e) { var k = e.kas || kasOf(e.ad); m[k] = (m[k] || 0) + yapilanSetler(e).length; if (!en || m[k] > m[en]) en = k; });
  return en;
}
/* bu kas son `saat` içinde ana kas olarak çalışıldı mı (seans bitişi, yoksa günün 18:00'i) */
function kasYeni(kas, saat) {
  if (!kas) return false;
  var sinir = Date.now() - saat * 36e5;
  return S.sessions.some(function (se) {
    var t = se.end || (parse(se.date).getTime() + 18 * 36e5);
    return t >= sinir && se.exs.some(function (e) { return (e.kas || kasOf(e.ad)) === kas && yapilanSetler(e).length; });
  });
}
function sablonlar() {
  var gor = {}, out = [];
  bitenSeanslar().reverse().forEach(function (s) {
    var ad = sadeAd(s.name); if (!ad || gor[ad] || out.length >= 5 || !s.exs.length) return;
    gor[ad] = 1; out.push(s);
  });
  return out;
}
function baslaSheet() {
  var o = '<h3>Antrenmana başla</h3><p class="mut">Daha önce yaptığın bir antrenmanı seç; hareketler ve set sayısı hazır gelir.</p><div class="panel liste">';
  var sr = siradaki(), l = sablonlar();
  if (sr) l = [sr].concat(l.filter(function (x) { return x !== sr; }));
  o += l.map(function (s) {
    return '<button class="satir" data-act="basla-tekrar" data-id="' + h(s.id) + '"><span class="grow"><b>' + h(sadeAd(s.name)) + (s === sr ? ' <span class="tag pr">sıradaki</span>' : '') + '</b><span>' +
      h(s.exs.map(function (e) { return e.ad; }).join(', ')) + '</span><span class="num">Son: ' + tarih(s.date, 1) + '</span></span></button>';
  }).join('');
  o += '</div><div class="yigin" style="margin-top:16px"><button class="btn-big" data-act="basla-bos">Boş başla, hareketleri ben seçeceğim</button><button class="btn-big btn-ghost" data-act="kapat">Vazgeç</button></div>';
  sheet(o);
}

/* a16: son antrenman 5 günden eskiyse tek sessiz satır (bildirim yok) */
function sonGunSatir(son) {
  if (!son) return '';
  var g = Math.round((parse(iso(new Date())) - parse(son.date)) / 864e5);
  return g > 5 ? '<p class="son-gun">Son antrenman ' + g + ' gün önce</p>' : '';
}
/* Bugün başlığının altında bu hafta (Pt–Pz): antrenmanlı gün dolu, bugün halkalı, gelecek soluk (Geçmiş takvimiyle aynı dil) */
var GUN_TAM = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
function haftaSerit() {
  var bugun = iso(new Date()), bas = parse(haftaBasi(bugun)), basS = iso(bas), son = new Date(bas); son.setDate(son.getDate() + 6);
  var sonS = iso(son), gun = {}, n = 0, o = '';
  S.sessions.forEach(function (s) { if (s.date >= basS && s.date <= sonS) { (gun[s.date] = gun[s.date] || []).push(sadeAd(s.name) || 'Antrenman'); n++; } });
  for (var i = 0; i < 7; i++) {
    var d = new Date(bas); d.setDate(d.getDate() + i); var k = iso(d), g = gun[k];
    var c = (g ? 'on' : '') + (k === bugun ? ' bugun' : k > bugun ? ' sonra' : '');
    o += '<li' + (c ? ' class="' + c.trim() + '"' : '') + ' title="' + h(GUN_TAM[i] + ' ' + tarih(k, 1) + (g ? ' · ' + g.join(', ') : '')) + '"><span>' + GUN[i] + '</span><i>' + d.getDate() + '</i></li>';
  }
  return '<div class="hserit" role="group" aria-label="Bu hafta ' + n + ' antrenman"><ol aria-hidden="true">' + o + '</ol>' +
    '<p class="hs-say" aria-hidden="true"><b>' + n + '</b><span>antrenman<br>bu hafta</span></p></div>';
}
/* ---------- Bugün'ün canlı başlığı ----------
   Arkada son 30 günün ortalama kilo eğrisi (bulk.js cizgiSeri; çok soluk dalga, yalnız süs: aria-hidden), altında günün
   durumuna göre tek kısa cümle (kural tabanlı). İkisi de sürüm + gün anahtarlı önbellekte; render başına iş yok denecek kadar az. */
var basOnb = { k: null };
function gunlerArasi(a, b) { return Math.round((parse(a) - parse(b)) / 864e5); }
function kiloDalga(bugun) {
  var B = AT.bulkHesap; if (!B || !S.bw || !S.bw.length) return '';
  var bas = new Date(parse(bugun)); bas.setDate(bas.getDate() - 30); var basS = iso(bas);
  var l = B.gecerli(S.bw), ham = l.filter(function (b) { return b.date >= basS; });
  if (ham.length < 3) return '';
  var p = B.cizgiSeri(B.trendSeri(l)).filter(function (x) { return x.date >= basS; });
  var gun = p.length ? gunlerArasi(p[p.length - 1].date, p[0].date) : 0; if (gun < 5) return '';
  var mn = Infinity, mx = -Infinity; p.forEach(function (x) { mn = Math.min(mn, x.kg); mx = Math.max(mx, x.kg); });
  /* en az 1,5 kg'lık aralık: düz giden kiloda gürültü dağ gibi görünmesin */
  var orta = (mn + mx) / 2, yay = Math.max(mx - mn, 1.5), W = 600, H = 120;
  var pt = p.map(function (x) { return [gunlerArasi(x.date, p[0].date) / gun * W, 22 + (1 - ((x.kg - orta) / yay + 0.5)) * 76]; });
  /* Catmull-Rom → kübik Bézier: noktalardan geçen yumuşak dalga */
  var d = 'M' + pt[0][0].toFixed(1) + ' ' + pt[0][1].toFixed(1);
  for (var i = 0; i < pt.length - 1; i++) {
    var a = pt[i - 1] || pt[i], b = pt[i], c = pt[i + 1], e = pt[i + 2] || c;
    d += 'C' + (b[0] + (c[0] - a[0]) / 6).toFixed(1) + ' ' + (b[1] + (c[1] - a[1]) / 6).toFixed(1) + ' ' + (c[0] - (e[0] - b[0]) / 6).toFixed(1) + ' ' + (c[1] - (e[1] - b[1]) / 6).toFixed(1) + ' ' + c[0].toFixed(1) + ' ' + c[1].toFixed(1);
  }
  return '<svg class="bg-dalga" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="bg-dolgu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
    '<path class="bg-alan" d="' + d + 'L' + W + ' ' + H + 'L0 ' + H + 'Z" fill="url(#bg-dolgu)"/><path class="bg-cizgi" d="' + d + '" vector-effect="non-scaling-stroke"/></svg>';
}
/* haftalık alışkanlık: son 8 tam haftanın (ilk antrenman haftasından sonrası) antrenman sayısı medyanı; 3 haftadan az veri ya da <2 ise yok */
function haftaHedefi(bugun) {
  var l = bitenSeanslar(); if (!l.length) return null;
  var buHafta = haftaBasi(bugun), ilk = haftaBasi(l[0].date), say = {}, n = [];
  l.forEach(function (s) { var k = haftaBasi(s.date); say[k] = (say[k] || 0) + 1; });
  for (var i = 1; i <= 8; i++) {
    var d = parse(buHafta); d.setDate(d.getDate() - 7 * i); var k = iso(d);
    if (k < ilk) break; n.push(say[k] || 0);
  }
  if (n.length < 3) return null;
  n.sort(function (a, b) { return a - b; });
  var m = Math.round(n.length % 2 ? n[(n.length - 1) / 2] : (n[n.length / 2 - 1] + n[n.length / 2]) / 2);
  return m >= 2 ? Math.min(m, 7) : null;
}
/* "Bacak günü" (kısa ad) ya da "Sıradaki: Pazartesi antrenmanı" */
function gunAdi(s) { var n = sadeAd(s.name) || 'Antrenman'; return /gün|antrenman|day|workout/i.test(n) || n.length > 18 ? 'Sıradaki: ' + n : n + ' günü'; }
/* günün tek cümlesi (öncelik sırası): bugün yapıldı → rekor haftası (3+) → dinlenme günü (3 gün üst üste ya da haftalık
   alışkanlık doldu ve dün çalışıldı) → Sıradaki + dinlenme → yalnız dinlenme. Ek bilgi: haftalık alışkanlık varsa "haftada 3/4" */
function bugunCumle(bugun, sr) {
  var l = bitenSeanslar(); if (!l.length) return '';
  var son = l[l.length - 1], g = gunlerArasi(bugun, son.date), hb = haftaBasi(bugun), pr = prHesapla(), gunler = {}, n = 0, rekH = 0, rekB = 0;
  l.forEach(function (s) {
    gunler[s.date] = 1;
    if (s.date >= hb && s.date <= bugun) { n++; var r = pr && pr[s.id] ? Object.keys(pr[s.id]).length : 0; rekH += r; if (s.date === bugun) rekB += r; }
  });
  var hedef = haftaHedefi(bugun), oran = hedef ? 'haftada ' + n + '/' + hedef : '';
  var ust = 0, d = parse(bugun); for (;;) { d.setDate(d.getDate() - 1); if (!gunler[iso(d)]) break; ust++; }
  var dinlen = g >= 3 && g <= 5 ? (g - 1) + ' gündür dinlendin' : g === 2 ? 'dün dinlendin' : '';
  function bir() { var c = Array.prototype.filter.call(arguments, Boolean).join(' · '); return c.charAt(0).toLocaleUpperCase('tr') + c.slice(1); }
  if (g <= 0) return bir(rekB ? 'Bugün ' + rekB + ' rekor kırdın' : 'Bugünkü antrenman tamam', oran);
  if (rekH >= 3) return bir('Rekor haftası: ' + rekH + ' rekor', oran || dinlen);
  if (ust >= 3 || (hedef && n >= hedef && g === 1)) return bir('Bugün dinlenme günü', oran || ust + ' gün üst üste çalıştın');
  if (sr) return bir(gunAdi(sr), g === 1 ? 'dün ' + (sadeAd(son.name) || 'antrenman') : dinlen, oran);
  return bir(g === 1 ? 'Dün: ' + (sadeAd(son.name) || 'antrenman') : dinlen, oran);
}
/* halka.js (Apple teması hero'su): bu hafta antrenman sayısı + hedef, haftalık seri, sıradaki antrenman */
function halkaVeri() {
  var bg = iso(new Date()), bas = haftaBasi(bg), n = 0;
  S.sessions.forEach(function (s) { if (haftaBasi(s.date) === bas) n++; });
  return { n: n, hedef: haftaHedefi(bg) || 3, seri: haftaSerisi(), sira: siradaki() };
}
function bugunBaslik(sr) {
  var bugun = iso(new Date()), k = surum + '|' + bugun + '|' + (sr ? sr.id : '');
  if (basOnb.k !== k) basOnb = { k: k, dalga: kiloDalga(bugun), cumle: bugunCumle(bugun, sr) };
  return '<header class="bg-ust' + (basOnb.dalga ? ' dalgali' : '') + '">' + basOnb.dalga + '<button class="bg-ara" data-act="komut" aria-label="Hızlı komut"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg></button><h1>Bugün</h1><p class="sub">' + tarih(bugun) + '</p>' +
    (basOnb.cumle ? '<p class="bg-cumle">' + h(basOnb.cumle) + '</p>' : '') + '</header>';
}
var IKON_BASLA = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
var IKON_TIK = '<svg class="tik" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var IKON_YILDIZ = '<svg class="yildiz" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"/></svg>';
/* Bugün'deki son antrenman: ne zaman, kaç set, toplam (Geçmiş satırından biraz zengin) */
function gunOnce(d) { var g = Math.round((parse(iso(new Date())) - parse(d)) / 864e5); return g <= 0 ? 'Bugün' : g === 1 ? 'Dün' : g + ' gün önce'; }
function sonKart(s, pr) {
  var np = pr && pr[s.id] ? Object.keys(pr[s.id]).length : 0, demo = s.demo && !/örnek/i.test(s.name || '');
  return '<button class="satir son-ant" data-act="seans" data-id="' + h(s.id) + '"><span class="grow"><b>' + h(s.name || 'Antrenman') + '</b>' +
    '<span class="num">' + gunOnce(s.date) + ' · ' + tarih(s.date, 1) + ' · ' + seansSetSayisi(s) + ' set · toplam ' + fmt(seansHacim(s), 0) + ' kg</span>' +
    '<span class="son-egz">' + h(s.exs.map(function (e) { return e.ad; }).join(' · ')) + '</span>' +
    (s.not ? '<span class="notkisa">' + h(String(s.not).replace(/\s+/g, ' ')) + '</span>' : '') + '</span>' +
    (np ? '<span class="rek">' + np + ' rekor</span>' : '') + (demo ? '<span class="tag demo">örnek</span>' : '') + '</button>';
}
var BOS_CIZIM = '<svg class="bos-cizim" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><path d="M10 22v12M46 22v12M15 17v22M41 17v22M15 28h26"/><path d="M8 46h40" stroke-dasharray="2 5"/></svg>';
/* antrenman ekranı: biten hareket kartının açık/kapalı hâli (kullanıcı dokunduysa); anahtar antrenman + sıra + ad */
var katlaDurum = {}, sonTik = null;
function katlaAnahtar(a, ei, e) { return a.id + '|' + ei + '|' + e.ad; }
/* şu an çalışılan hareket: son bitirilen setin hareketi; hiç yoksa setleri bitmemiş ilk hareket */
function simdikiEgz(a) {
  var en = 0, ei = -1;
  a.exs.forEach(function (e, i) { e.sets.forEach(function (x) { if (x.done && (x.t || 0) >= en) { en = x.t || 0; ei = i; } }); });
  if (ei < 0) a.exs.some(function (e, i) { if (e.sets.some(function (x) { return !x.done; })) { ei = i; return true; } return false; });
  return ei;
}
/* Bugün'ün üstünde tek satır "yazarak kayıt" (Apple dışı temalar; Enter → setdil.js sade()) */
function sadeYaz() {
  if (S.tema === 'apple' || !AT.setDil || !AT.setDil.sade) return '';
  return '<div class="sade-yaz"><input id="sade-yaz" type="text" placeholder="Yaz: bench 3x8 60, 82,4 tartıldım…" autocomplete="off" enterkeyhint="send" aria-label="Yazarak kayıt"></div>';
}
function vBugun() {
  var a = S.active, o = '';
  if (!a) {
    var son = bitenSeanslar().filter(function (x) { return !x.demo; }).pop() || bitenSeanslar().pop(), hic = !S.sessions.length && !S.bw.length;
    var sr = siradaki();
    o += bugunBaslik(sr) + sadeYaz() + (AT.halka && S.tema === 'apple' ? AT.halka.html() + AT.halka.kartlar() : '') + haftaSerit();
    var a1 = (hic ? ilkAdimlar() : '') + (sr
      ? '<button class="btn-ac btn-big btn-sira" data-act="basla-tekrar" data-id="' + h(sr.id) + '"><span class="sira-yazi"><small class="sira-ust">Sıradaki</small><span class="sira-ad">' + h(sadeAd(sr.name)) + '<kbd>N</kbd></span><small>' + h(hareketOnizle(sr)) + '</small></span><span class="sira-ok">' + IKON_BASLA + '</span></button><button class="btn-ghost mini basla-baska" data-act="basla">Başka antrenman seç</button>'
      : '<button class="btn-ac btn-big btn-basla" data-act="basla"><span class="sira-ok">' + IKON_BASLA + '</span>Antrenmana başla<kbd>N</kbd></button>') + sonGunSatir(son);
    var b1 = '';
    if (son) {
      b1 += '<h2>Son antrenman</h2><div class="panel liste">' + sonKart(son, prHesapla()) + '</div>';
    } else if (hic) {
      b1 += '<div class="bos-durum">' + BOS_CIZIM + '<p>Önce nasıl göründüğüne bakmak istersen örnek veriyle dene; Ayarlar\'dan tek dokunuşla silinir.</p><button class="btn-ghost mini" data-act="demo-yukle">Örnek veriyi yükle</button></div>';
    } else {
      b1 += '<div class="bos-durum">' + BOS_CIZIM + '<p>Henüz antrenman yok.</p></div>';
    }
    /* telefonda sıra: Sıradaki → kilo/kalori → öneriler → son antrenman (DOM ve odak sırası da bu).
       PC'de (.duzen.bugun ızgarası) solda antrenman (Sıradaki, öneriler, son), sağda kilo/kalori kartı: iki sütun dengeli */
    var not = AT.bolum.notlar ? AT.bolum.notlar() : '', tr = AT.bolum.tarti ? AT.bolum.tarti() : '';
    return o + '<div class="duzen bugun"><div class="b-sira">' + a1 + '</div>' + (tr ? '<div class="b-tarti">' + tr + '</div>' : '') +
      (not ? '<div class="b-not">' + not + '</div>' : '') + '<div class="b-son">' + b1 + '</div></div>';
  }
  var tamam = seansSetSayisi(a), topSet = 0, simdi = simdikiEgz(a), yeni = sonTik && Date.now() - sonTik.t < 900 ? sonTik : null;
  var segs = a.exs.map(function (e) { var n = e.sets.filter(function (s) { return s.tip !== 'isinma'; }).length, d = yapilanSetler(e).length; topSet += n; return { n: n, d: Math.min(d, n) }; });   /* ısınma sayılmaz */
  /* sıradaki set: şu anki hareketin ilk bitmemiş seti; o hareket bittiyse sonraki hareketlerden ilki */
  var hedefE = -1, hedefS = -1;
  for (var k = 0; k < a.exs.length && hedefE < 0; k++) {
    var ki = (Math.max(simdi, 0) + k) % a.exs.length, ks = -1;
    a.exs[ki].sets.some(function (x, i) { if (!x.done) { ks = i; return true; } return false; });
    if (ks >= 0) { hedefE = ki; hedefS = ks; }
  }
  /* telefonda odak sahnesi: hareket başına tam genişlik sahne (yalnız bellekte konum; yeni antrenmanda sıradaki hareketten başlar) */
  var sm = !masaustu() && a.exs.length > 0;
  if (sahne.id !== a.id) { sahne.id = a.id; sahne.i = hedefE >= 0 ? hedefE : a.exs.length; }
  sahne.i = Math.max(0, Math.min(a.exs.length, sahne.i));
  var rek = aktifRek = aktifRekor(a), etiket = false;
  var ctx = { rek: rek, yeni: yeni, hedefE: hedefE, hedefS: hedefS, rg: S.rpe ? ' rpe' : '' };
  o += '<input id="seansad" class="baslik-input" value="' + h(a.name) + '" aria-label="Antrenmanın adı (değiştirebilirsin)" autocomplete="off">';
  o += '<p class="sub">Başladı ' + new Date(a.start).toTimeString().slice(0, 5) + ' · <span id="gecen">' + gecenSure(a.start) + '</span></p>' + sadeYaz();
  /* hareket başına parçalı çubuk (PC): parça genişliği set sayısı, dolu kısmı biten set; hareketi biten parça yeşil. Altında hareket şeridi */
  if (a.exs.length) o += '<div class="ilerle' + (sm ? ' sahne-ust' : '') + '">' + (topSet ? '<div class="iseg" role="progressbar" aria-label="Biten set" aria-valuemin="0" aria-valuemax="' + topSet + '" aria-valuenow="' + tamam + '">' +
    segs.map(function (x) { return x.n ? '<i style="flex-grow:' + x.n + '"' + (x.d >= x.n ? ' class="tam"' : '') + '><u style="width:' + Math.round(x.d / x.n * 100) + '%"></u></i>' : ''; }).join('') +
    '</div><span class="ilerle-say"><b>' + tamam + '</b> / ' + topSet + ' set</span>' : '') + egzSerit(a, segs, ctx, sm ? sahne.i : hedefE, sm) + '</div>';
  var o0 = o; o = '';
  var hac = a.exs.reduce(function (t, e) { return t + hacim(e); }, 0), bitenEgz = segs.filter(function (x) { return x.n && x.d >= x.n; }).length;
  var b2 = '<div class="bitir-ozet"><div><b data-gecen>' + gecenSure(a.start) + '</b><span>süre</span></div><div><b>' + bitenEgz + '<small>/' + a.exs.length + '</small></b><span>hareket</span></div><div><b>' + fmt(hac, 0) + '</b><span>kg toplam</span></div></div>';
  b2 += '<details class="katla seansnot"' + (a.not ? ' open' : '') + '><summary>Seans notu' + (a.not ? '' : ' ekle') + '</summary><textarea id="seansnot" rows="3" placeholder="Uyku, ağrı, nasıl hissettin…" aria-label="Seans notu">' + h(a.not || '') + '</textarea></details>';
  b2 += '<button class="btn-ac btn-big btn-bitir" data-act="bitir">Antrenmanı bitir ve kaydet</button>';
  b2 += '<button class="btn-ghost btn-bad btn-big btn-cik" data-act="iptal">Kaydetmeden çık</button>';
  if (sm) {
    o += '<div class="sahneler" data-n="' + a.exs.length + '">';
    a.exs.forEach(function (e, ei) { o += sahneKart(a, e, ei, ctx); });
    o += '<section class="sahne-son" data-e="' + a.exs.length + '" aria-label="Antrenmanı bitir"><h2>' + (bitenEgz >= a.exs.length ? 'Hepsi bitti' : 'Bitirmeye hazır mısın?') + '</h2>' + b2 +
      '<button class="btn-big ekle-egz" data-act="egz-ekle">+ Hareket ekle</button></section></div>';
    return o0 + o;
  }
  if (!a.exs.length) o += '<div class="bos-durum">' + BOS_CIZIM + '<p>Henüz hareket yok. Aşağıdan “+ Hareket ekle” ile başla.</p></div>';
  /* rekor kıran setler (yıldız); başlık satırı (Set/kg/Tekrar) yalnız ilk açık kartta */
  a.exs.forEach(function (e, ei) {
    var prev = oncekiSetler(e.ad);
    /* hareket bitti: ısınma olmayan bütün setleri ✓ — kart tek satır özete iner (dokununca açılır; durum yalnız bellekte) */
    var is0 = e.sets.filter(function (x) { return x.tip !== 'isinma'; });
    var exBitti = is0.length && is0.every(function (x) { return x.done; });
    var kd = katlaDurum[katlaAnahtar(a, ei, e)], kapali = exBitti && (kd != null ? !kd : true);
    var oz = exBitti ? gecenYaz(yapilanSetler(e)) : '';
    o += '<section class="panel ex' + (exBitti ? ' ex-bitti' : '') + (kapali ? ' kapali' : '') + (!exBitti && ei === hedefE ? ' sirada' : '') + (exBitti && yeni && yeni.e === ei ? ' ex-yeni' + (rek[ei + '|' + yeni.s] ? ' rekor-yeni' : '') : '') + '" data-e="' + ei + '"><div class="ex-head">' +
      (exBitti
        ? '<button class="ex-katla grow" data-act="egz-katla" data-e="' + ei + '" aria-expanded="' + !kapali + '"><span class="ex-tik" aria-label="bitti">' + IKON_TIK + '</span><span class="ex-ad"><b>' + h(e.ad) + '</b><small class="ex-ozet">' + oz + '</small></span>' +
          (rek[ei] ? '<span class="ex-rek" role="img" aria-label="rekor">' + IKON_YILDIZ + '</span>' : '') + '<span class="ex-ok" aria-hidden="true"></span></button>'
        : '<span class="grow"><b>' + h(e.ad) + '</b><span class="tag">' + h(e.kas) + '</span></span>') +
      '<span class="ex-dug">' + (AT.bolum.plakaDugme ? AT.bolum.plakaDugme(ei) : '') +
      '<button class="mini btn-ghost" data-act="egz-sil" data-e="' + ei + '" aria-label="Hareketi çıkar">Çıkar</button></span></div><div class="ex-govde">';
    o += miniGecmis(e.ad);
    if (!kapali && !etiket) { etiket = true; o += setEtiket(); }
    var isNo = 0;
    e.sets.forEach(function (s, si) {
      var isin = s.tip === 'isinma', wi = isin ? -1 : isNo++;
      o += setSatir(e, ei, s, si, wi, isin ? null : hedefPv(e.ad, prev, wi, e, si), ctx);
    });
    o += '<button class="addset" data-act="set-ekle" data-e="' + ei + '">+ Set ekle</button>';
    o += '</div></section>';
  });
  o += '<button class="btn-big ekle-egz" data-act="egz-ekle">+ Hareket ekle<kbd>N</kbd></button>';
  b2 += '<p class="kisaipucu">Enter: kg → tekrar → seti tamamla · <kbd>?</kbd> kısayollar</p>';
  return o0 + kol(o, b2, 'yan antrenman');
}
function setEtiket() { return '<div class="setgrid etiket' + (S.rpe ? ' rpe' : '') + '" aria-hidden="true"><span class="lbl">Set</span><span class="lbl">kg</span><span class="lbl">Tekrar</span>' + (S.rpe ? '<span class="lbl">Zorluk</span>' : '') + '<span class="lbl">Bitti</span></div>'; }
/* set satırı (liste ve sahne ortak). dev: sahnenin büyük "şimdiki set"i — aynı girişler (data-e/s/f), dev serif rakam, geniş ✓.
   Soluk sayılar (placeholder) hedefPv: boş bırakıp ✓ = hedef kuralı her iki görünümde aynı */
function setSatir(e, ei, s, si, wi, pv, ctx, dev) {
  var isin = s.tip === 'isinma', rek = ctx.rek, yeni = ctx.yeni, rg = ctx.rg;
  var etk = isin ? 'I' : String(wi + 1), ad = isin ? 'ısınma seti' : 'normal set', rk = s.done && rek[ei + '|' + si];
  var sc = (s.done ? ' is-done' : '') + (isin ? ' isin' : '') + (ei === ctx.hedefE && si === ctx.hedefS ? ' siradaki' : '') + (rk ? ' rekor' : '') +
    (yeni && yeni.e === ei && yeni.s === si && s.done ? ' yeni' + (rk ? ' rekor-yeni' : '') : '');
  var nB = '<button class="n' + (s.tip ? ' ' + s.tip : '') + '" data-act="set-tip" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + ': ' + ad + ' (dokun: tipini değiştir)" title="' + ad + '">' +
    (dev ? (isin ? 'Isınma seti' : 'Set ' + etk + '<small> / ' + dev.n + '</small>') : etk) + '</button>';
  var kg = '<input inputmode="decimal" data-e="' + ei + '" data-s="' + si + '" data-f="kg" value="' + h(s.kg) + '" placeholder="' + (pv ? fmt(num(pv.kg), 2) : dev ? '–' : 'kg') + '" aria-label="' + h(e.ad) + ' set ' + etk + ' kg' + (pv ? ', hedef ' + fmt(num(pv.kg), 2) : '') + '">';
  var tk = '<input inputmode="numeric" data-e="' + ei + '" data-s="' + si + '" data-f="reps" value="' + h(s.reps) + '" placeholder="' + (pv ? h(pv.reps) : dev ? '–' : 'tekrar') + '" aria-label="' + h(e.ad) + ' set ' + etk + ' tekrar' + (pv ? ', hedef ' + h(pv.reps) : '') + '">';
  var rp = S.rpe ? '<input inputmode="decimal" data-e="' + ei + '" data-s="' + si + '" data-f="rpe" value="' + h(s.rpe) + '" placeholder="–" aria-label="' + h(e.ad) + ' set ' + (si + 1) + ' zorluk (RPE 6–10, boş bırakılabilir)">' : '';
  var ok = '<button class="done' + (s.done ? ' on' : '') + (dev ? ' btn-ac' : '') + '" data-act="tamam" data-e="' + ei + '" data-s="' + si + '" aria-label="' + h(e.ad) + ' set ' + etk + (isin ? ' (ısınma)' : '') + ' bitti' + (rk ? ', yeni rekor' : '') + '" aria-pressed="' + !!s.done + '">' + IKON_TIK +
    (dev ? '<span>Seti bitir</span>' : '') + (rk ? '<span class="rek-yildiz" aria-hidden="true">' + IKON_YILDIZ + '</span>' : '') + '</button>';
  if (!dev) return '<div class="setgrid' + sc + rg + '">' + nB + kg + tk + rp + ok + '</div>';
  return '<div class="setgrid dev' + sc + rg + (dev.yeni ? ' dev-yeni' : '') + '"><div class="dev-ust">' + nB + (pv ? '<span class="dev-hedef">hedef</span>' : '') + '</div>' +
    '<label class="dev-kg">' + kg + '<span class="birim">kg</span></label><span class="dev-x" aria-hidden="true">×</span><label class="dev-tk">' + tk + '<span class="birim">tekrar</span></label>' +
    (rp ? '<label class="dev-rpe"><span class="birim">Zorluk</span>' + rp + '</label>' : '') + ok + '</div>';
}

/* ---------- odak sahnesi (telefon, <1024 px) ----------
   Üstte hareket şeridi (çip: ilerleme halkası, ✓, rekor altın), altında yana kayan sahneler (scroll-snap): her hareket tam genişlik,
   üstte dev rakamla şimdiki set, altında kompakt set listesi; son sahne bitir. Konum (sahne.i) yalnız bellekte; yeniden çizimde korunur. */
var sahne = { id: null, i: 0 }, sahneOto = null, sahneRaf = 0;
function sahneModu() { return !!(S.active && S.active.exs.length && tab === 'bugun' && !masaustu()); }
function egzSerit(a, segs, ctx, akt, sm) {
  var rek = ctx.rek, yeni = ctx.yeni, o = '<nav class="eserit" aria-label="Hareketler">';
  a.exs.forEach(function (e, ei) {
    var x = segs[ei], bitti = x.n > 0 && x.d >= x.n, p = x.n ? x.d / x.n : 0, yr = yeni && yeni.e === ei && rek[ei + '|' + yeni.s];
    o += '<button class="ecip' + (bitti ? ' bitti' : '') + (rek[ei] ? ' rek' : '') + (yr ? ' rek-yeni' : '') + '" data-act="sahne-git" data-e="' + ei + '"' + (ei === akt ? ' aria-current="true"' : '') +
      ' aria-label="' + h(e.ad) + ', ' + x.d + ' / ' + x.n + ' set' + (bitti ? ', bitti' : '') + (rek[ei] ? ', rekor' : '') + '">' +
      '<span class="ec-halka" aria-hidden="true"><svg viewBox="0 0 28 28"><circle class="iz" cx="14" cy="14" r="11.5"/><circle class="dolu" cx="14" cy="14" r="11.5" pathLength="100" style="stroke-dashoffset:' + (100 - p * 100).toFixed(1) + '"/></svg>' +
      (rek[ei] ? IKON_YILDIZ : bitti ? IKON_TIK : '<i>' + x.d + '</i>') + '</span><span class="ec-ad">' + h(e.ad) + '</span></button>';
  });
  if (sm) o += '<button class="ecip ec-ekle" data-act="egz-ekle" aria-label="Hareket ekle">+</button><button class="ecip ec-bitir" data-act="sahne-git" data-e="' + a.exs.length + '"' + (akt === a.exs.length ? ' aria-current="true"' : '') + '>Bitir</button>';
  return o + '</nav>';
}
/* bir hareketin sahnesi: başlık, rekor satırı, Geçen sefer (küçük), dev set (ilk bitmemiş set) ya da "bitti" kartı, kompakt liste */
function sahneKart(a, e, ei, ctx) {
  var rek = ctx.rek, yeni = ctx.yeni, prev = oncekiSetler(e.ad), n = a.exs.length;
  var is0 = e.sets.filter(function (x) { return x.tip !== 'isinma'; }), bitti = is0.length > 0 && is0.every(function (x) { return x.done; });
  var di = -1; e.sets.some(function (x, i) { if (!x.done) { di = i; return true; } return false; });
  var yr = yeni && yeni.e === ei && rek[ei + '|' + yeni.s], enRek = 0, enTk = 0;
  Object.keys(rek).forEach(function (k) { var p = k.split('|'); if (p.length === 2 && +p[0] === ei) { if (rek['t' + k]) enTk = Math.max(enTk, rek[k]); else enRek = Math.max(enRek, rek[k]); } });
  var o = '<section class="panel ex sahne' + (bitti ? ' ex-bitti' : '') + (ei === ctx.hedefE ? ' sirada' : '') + (yr ? ' rekor-yeni' : '') + '" data-e="' + ei + '" aria-label="Hareket ' + (ei + 1) + ' / ' + n + ': ' + h(e.ad) + '">' +
    '<div class="ex-head"><span class="grow"><small class="sahne-no">' + (ei + 1) + ' / ' + n + '</small><b>' + h(e.ad) + '</b><span class="tag">' + h(e.kas) + '</span></span>' +
    '<span class="ex-dug">' + (AT.bolum.plakaDugme ? AT.bolum.plakaDugme(ei) : '') + '<button class="mini btn-ghost" data-act="egz-sil" data-e="' + ei + '" aria-label="Hareketi çıkar">Çıkar</button></span></div>';
  if (enRek || enTk) o += '<p class="sahne-rek">' + IKON_YILDIZ + 'Rekor · ' + (enRek ? 'tahmini max ~' + fmt(enRek) + ' kg' : 'en çok tekrar ' + enTk) + '</p>';
  o += miniGecmis(e.ad);
  var isNo = 0, nIs = is0.length, satir = '', dev = '';
  e.sets.forEach(function (s, si) {
    var isin = s.tip === 'isinma', wi = isin ? -1 : isNo++, pv = isin ? null : hedefPv(e.ad, prev, wi, e, si);
    if (si === di) dev = setSatir(e, ei, s, si, wi, pv, ctx, { n: nIs, yeni: yeni && yeni.e === ei && Date.now() - yeni.t < 900 });
    else satir += setSatir(e, ei, s, si, wi, pv, ctx);
  });
  if (di < 0) {
    /* hepsi bitti: özet + sıradaki harekete tek dokunuş */
    var j = -1; for (var k = 1; k < n && j < 0; k++) { var x = (ei + k) % n; if (a.exs[x].sets.some(function (y) { return !y.done; })) j = x; }
    var ys = yapilanSetler(e);
    dev = '<div class="dev-bitti' + (yeni && yeni.e === ei ? ' dev-yeni' : '') + '"><span class="db-tik' + (enRek ? ' rek' : '') + '" aria-hidden="true">' + (enRek ? IKON_YILDIZ : IKON_TIK) + '</span>' +
      '<b>' + (enRek ? 'Rekorla bitti' : 'Bitti') + '</b><span class="db-ozet">' + (ys.length ? gecenYaz(ys) + ' · ' + fmt(hacim(e), 0) + ' kg' : 'Yalnız ısınma') + '</span>' +
      (j >= 0 ? '<button class="btn-ac btn-big" data-act="sahne-git" data-e="' + j + '">Sıradaki: ' + h(a.exs[j].ad) + '<span class="ok" aria-hidden="true">→</span></button>'
        : '<button class="btn-ac btn-big" data-act="sahne-git" data-e="' + n + '">Bitirmeye geç<span class="ok" aria-hidden="true">→</span></button>') + '</div>';
  }
  o += dev + (satir ? '<div class="sahne-liste">' + satir + '</div>' : '') + '<button class="addset" data-act="set-ekle" data-e="' + ei + '">+ Set ekle</button>';
  return o + '</section>';
}
/* yeniden çizimden sonra: sahne konumu (scrollLeft) geri, şerit eşlenir, kaydırma dinlenir, dinlenme dolgusu sürer */
function sahneKur() {
  var k = $('#view .sahneler'); if (!k) return;
  k.scrollLeft = sahne.i * k.clientWidth;
  k.addEventListener('scroll', sahneKaydi, { passive: true });
  seritEsle(false);
  if (!$('#rest').hidden && restBitis > Date.now()) restCiz();
}
function sahneKaydi() {
  if (sahneRaf) return;
  sahneRaf = requestAnimationFrame(function () {
    sahneRaf = 0; var k = $('#view .sahneler'); if (!k || !k.clientWidth) return;
    var i = Math.max(0, Math.min(+k.dataset.n, Math.round(k.scrollLeft / k.clientWidth)));
    if (i !== sahne.i) { sahne.i = i; seritEsle(true); }
  });
}
/* aktif çip: aria-current + şeritte ortada (sayfa dikey kaymaz: scrollIntoView değil) */
function seritEsle(yumusak) {
  var nav = $('#view .eserit'); if (!nav) return;
  var akt = null;
  Array.prototype.forEach.call(nav.querySelectorAll('[data-act=sahne-git]'), function (b) { if (+b.dataset.e === sahne.i) { b.setAttribute('aria-current', 'true'); akt = b; } else b.removeAttribute('aria-current'); });
  if (akt && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, akt.offsetLeft - (nav.clientWidth - akt.offsetWidth) / 2), behavior: yumusak && !azHareket.matches ? 'smooth' : 'auto' });
}
function sahneGit(i, yumusak) {
  var k = $('#view .sahneler'); if (!k) return;
  sahne.i = i; k.scrollTo({ left: i * k.clientWidth, behavior: yumusak && !azHareket.matches ? 'smooth' : 'auto' }); seritEsle(yumusak);
}
/* hareketin son seti ✓: ~600 ms sonra sıradaki bitmemiş harekete (yoksa bitir sahnesine) kayar; arada dokunulursa kaymaz */
function sahneIlerle(ei) {
  if (sahneOto) clearTimeout(sahneOto);
  var id = S.active.id;
  sahneOto = setTimeout(function () {
    sahneOto = null; var a = S.active; if (!a || a.id !== id || !sahneModu() || sahne.i !== ei) return;
    var n = a.exs.length, j = n;
    for (var k = 1; k < n; k++) { var x = (ei + k) % n; if (a.exs[x].sets.some(function (y) { return !y.done; })) { j = x; break; } }
    sahneGit(j, true);
  }, 600);
}
['pointerdown', 'keydown', 'wheel'].forEach(function (t) { document.addEventListener(t, function () { if (sahneOto) { clearTimeout(sahneOto); sahneOto = null; } }, { capture: true, passive: true }); });
/* dinlenme süresince sahne kartlarının zemini aşağı doğru boşalır: CSS animasyonu (sahne-bosal-a/b), JS yalnız süre değişince kurar.
   oran null: dolguyu kaldır. Az hareket isteyende adım adım (restCiz'in 250 ms tıkıyla) */
function sahneDinlen(oran, kalanMs, ak, son) {
  var k = $('#view .sahneler'); if (!k) return;
  if (oran == null) { k.classList.remove('dinlen', 'son'); delete k.dataset.da; return; }
  if (k.dataset.da !== ak) {
    k.dataset.da = ak; k.style.setProperty('--d0', (100 - oran * 100).toFixed(2)); k.style.setProperty('--dsure', kalanMs + 'ms');
    k.dataset.dn = k.dataset.dn === 'a' ? 'b' : 'a';
  }
  if (azHareket.matches) k.style.setProperty('--dsimdi', (100 - oran * 100).toFixed(2) + '%');
  k.classList.add('dinlen');
  if (k.classList.contains('son') !== son) { if (son) k.style.setProperty('--son-sure', Math.max(300, kalanMs) + 'ms'); k.classList.toggle('son', son); }
}

/* boş durum: tek renk çizgi çizim (currentColor) + tek kısa cümle. AT.bos = bosDurum(tur, metin, ek) */
var BOS_SVG = {
  gecmis: '<rect x="14" y="20" width="52" height="46" rx="7"/><path d="M14 32h52M28 14v10M52 14v10"/><path class="y" d="M24 42h4M38 42h4M52 42h4M24 54h4M38 54h4"/><circle cx="54" cy="54" r="7"/><path d="M51 54l2.2 2.2 4-4.4"/>',
  defter: '<path d="M14 20c9-4 18-4 26 2v44c-8-6-17-6-26-2z"/><path d="M66 20c-9-4-18-4-26 2v44c8-6 17-6 26-2z"/><path class="y" d="M20 32c4-1.5 9-1.5 14 .5M20 42c4-1.5 9-1.5 14 .5M46 32.5c5-2 10-2 14-.5M46 42.5c5-2 10-2 14-.5"/>',
  takviye: '<rect x="24" y="12" width="32" height="10" rx="3"/><path d="M27 22h26v40a6 6 0 0 1-6 6H33a6 6 0 0 1-6-6z"/><path class="y" d="M27 32h26M27 58h26"/><rect x="33" y="40" width="14" height="8" rx="4" transform="rotate(-35 40 44)"/>',
  ilerleme: '<path d="M14 14v52h54"/><path d="M22 54l12-12 9 7 17-20"/><path d="M52 29h8v8"/><path class="y" d="M14 41h4M14 27h4"/>'
};
function bosDurum(tur, metin, ek) {
  return '<div class="bos"><svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">' + (BOS_SVG[tur] || '') + '</svg><p>' + h(metin) + '</p>' + (ek || '') + '</div>';
}

/* Geçmiş / Bugün ortak seans satırı: solda gün kutusu, ortada ad + set · hareket · toplam, sağda rekor rozeti */
function seansSatir(s, pr) {
  var np = pr && pr[s.id] ? Object.keys(pr[s.id]).length : 0;
  /* örnek seansın adı zaten "(örnek)" içeriyorsa etiketi tekrarlama */
  var demo = s.demo && !/örnek/i.test(s.name || ''), d = parse(s.date), yil = s.date.slice(0, 4) !== String(new Date().getFullYear());
  var hc = seansHacim(s);
  return '<button class="satir seans-satir" data-act="seans" data-id="' + h(s.id) + '" aria-label="' + h((s.name || 'Antrenman') + ', ' + tarih(s.date, 1) + (yil ? ' ' + s.date.slice(0, 4) : '')) + '">' +
    '<span class="ss-gun" aria-hidden="true"><b>' + d.getDate() + '</b><span>' + AYLAR[d.getMonth()].slice(0, 3) + (yil ? ' ’' + s.date.slice(2, 4) : '') + '</span></span>' +
    '<span class="grow"><b>' + h(s.name || 'Antrenman') + '</b><span class="num">' + seansSetSayisi(s) + ' set · ' + s.exs.length + ' hareket' + (hc > 0 ? ' <span class="nw">· ' + (hc >= 10000 ? fmt(hc / 1000, 1) + ' ton' : fmt(hc, 0) + ' kg') + '</span>' : '') + '</span>' +
    (s.not ? '<span class="notkisa">' + h(String(s.not).replace(/\s+/g, ' ')) + '</span>' : '') + '</span>' +
    (np ? '<span class="rek rozet"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"/></svg>' + np + '<span class="rk-k"> rekor</span></span>' : '') + (demo ? '<span class="tag demo">örnek</span>' : '') + '</button>';
}

/* son 7 günde kas grubu başına set: vücut kas haritası (ön + arka, el çizimi SVG) + kompakt liste.
   Renk: 0 set çok soluk + kesikli kontur, hedefe (haftada 10 set) yaklaştıkça --ac koyulaşır, hedefi geçen --iyi.
   Bölgeye dokun / üzerine gel / Enter → kas adı, set, son çalışıldığı gün etiketi (+ #duyuru). */
var KAS_HEDEF = 10;
/* çizim: viewBox 0 0 100 226, sol yarı çizilir, khM aynalar (x → 100 − x) */
function khM(s) { return s + '<g transform="matrix(-1 0 0 1 100 0)">' + s + '</g>'; }
function khP(d) { return '<path d="' + d + '"/>'; }
function khR(x, y, w, hh) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="2.6"/>'; }
var KH_ORT = {
  delt: khP('M38 34c-9-1-17 2-20 9-2 5-2 10-1 13 1 1 4 1 5 0 1-4 4-8 8-10 5-2 8-6 8-12z'),
  kol: khP('M19 59c-3 6-4 14-3 22 1 3 6 3 8 1 2-7 3-15 2-21-2-2-5-3-7-2z') + khP('M16 86c-3 8-4 20-3 34h6c2-11 4-23 5-33-2-2-6-2-8-1z'),
  bas: '<ellipse cx="50" cy="14" rx="9.5" ry="12"/><path d="M45 23h10v10H45z"/>',
  uc: '<ellipse cx="15.5" cy="127" rx="4" ry="6"/><ellipse cx="39" cy="169.5" rx="5" ry="4"/><path d="M34 214h9l1.5 7c-3.5 1.5-8.5 1.5-12 0z"/>',
  on: khP('M32 97c1 6 1 11 2 15 5 2 10 3 15 4v-8c-7-1-13-5-17-11z'),
  arka: khP('M35 204h7l1 9h-9z')
};
var KH_ON = {
  'Omuz': KH_ORT.delt,
  'Göğüs': khP('M49 39v22c-6 3-13 3-17-1-2-4-2-9 0-13 3-5 10-8 17-8z'),
  'Kol': KH_ORT.kol,
  'Karın': khR(41, 65, 8, 10) + khR(41, 77, 8, 10) + khR(41, 89, 8, 10) + khR(42, 101, 7, 9) + khP('M33 64c2 10 2 24 1 36l5 4V66z'),
  'Bacak': khP('M34 112c-4 14-5 32-2 50 3 3 10 3 13 0 3-15 4-32 3-46-4-1-10-2-14-4z') + khP('M34 176c-2 12-1 26 1 36h8c2-10 3-24 1-36-3-2-7-2-10 0z')
};
var KH_ARKA = {
  'Sırt': khP('M49 27v30l-8-11c-2-3-3-4-5-5 5-3 9-7 10-14z') + khP('M31 48c4 3 9 6 13 12l3 6v18c-5 2-10 4-13 8-2-14-4-30-3-44z') + khR(43, 87, 6, 17),
  'Omuz': KH_ORT.delt,
  'Kol': KH_ORT.kol,
  'Bacak': khP('M49 104v16c-6 3-12 2-16-2-2-5-1-10 2-13 4-2 9-2 14-1z') + khP('M33 123c-2 13-2 27 0 40 3 3 10 3 13 0 2-13 2-26 1-38-4-1-10-1-14-2z') +
    khP('M33 176c-3 9-3 19 0 26 3 3 8 3 11 0 2-8 2-18-1-26-3-2-7-2-10 0z')
};
var KH_ODAK = { 'Göğüs': 'on', 'Omuz': 'on', 'Kol': 'on', 'Karın': 'on', 'Bacak': 'on', 'Sırt': 'arka' };   /* klavyede her kas bir kez */
var khVeri = {}, khSecili = null;
function khEtiketMetni(k) {
  var v = khVeri[k] || { n: 0 };
  return k + ' · ' + (v.n ? v.n + ' set' : '7 günde yok') + (v.son ? ' · son ' + gunOnce(v.son).toLowerCase() : ' · hiç çalışılmadı');
}
function khFigur(yon, bolge) {
  var govde = KH_ORT.bas + khM(KH_ORT.uc + KH_ORT[yon]), g = '';
  KAS.forEach(function (k, i) {
    if (!bolge[k]) return;
    var v = khVeri[k], odak = KH_ODAK[k] === yon;
    govde += khM(bolge[k]);
    g += '<g class="kh-b' + v.cls + '" data-act="kas-sec" data-kas="' + h(k) + '" data-yon="' + yon + '" style="--o:' + v.o + ';--i:' + i + '"' +
      (odak ? ' tabindex="0" role="button" aria-label="' + h(khEtiketMetni(k).replace(' · ', ': ').replace(/ · /g, ', ')) + '"' : '') + '>' + khM(bolge[k]) + '</g>';
  });
  return '<figure class="kh-fig"><svg viewBox="0 0 100 226" role="group" aria-label="' + (yon === 'on' ? 'Ön' : 'Arka') + ' vücut"><g class="kh-govde" aria-hidden="true">' + govde + '</g>' + g + '</svg><figcaption>' + (yon === 'on' ? 'ön' : 'arka') + '</figcaption></figure>';
}
function kasBolum(l) {
  var lim = new Date(); lim.setDate(lim.getDate() - 6); var limS = iso(lim), kasSet = {}, son = {};
  KAS.forEach(function (k) { kasSet[k] = 0; });
  /* a10: ana kas 1, hareketin ikincil kasları (hareketler.js) set başına 0,5; gösterimde yuvarlanır. Son gün: tüm geçmişte ana ya da yardımcı */
  l.forEach(function (s) { s.exs.forEach(function (e) {
    var k = e.kas || kasOf(e.ad), n = yapilanSetler(e).length; if (!n) return;
    var y = ikincilOf(e.ad).filter(function (x) { return x !== k; });
    [k].concat(y).forEach(function (x) { if (!son[x] || s.date > son[x]) son[x] = s.date; });
    if (s.date < limS) return;
    kasSet[k] = (kasSet[k] || 0) + n;
    y.forEach(function (x) { kasSet[x] = (kasSet[x] || 0) + n * 0.5; });
  }); });
  var kasl = KAS.concat(Object.keys(kasSet).filter(function (k) { return KAS.indexOf(k) < 0 && kasSet[k]; }));
  khVeri = {}; khSecili = null;
  kasl.forEach(function (k) {
    var n = Math.round(kasSet[k] || 0);
    khVeri[k] = { n: n, son: son[k], cls: n ? n >= KAS_HEDEF ? ' tamam' : '' : ' sifir', o: n ? n >= KAS_HEDEF ? .82 : (.3 + .5 * n / KAS_HEDEF).toFixed(2) : .07 };
  });
  var liste = kasl.map(function (k) {
    var v = khVeri[k];
    return '<div class="kh-s' + v.cls + '" data-act="kas-sec" data-kas="' + h(k) + '" style="--o:' + v.o + ';--w:' + Math.min(100, Math.round(v.n / KAS_HEDEF * 100)) + '%"><span>' + h(k) + '</span><b>' + v.n + '</b><i aria-hidden="true"></i></div>';
  }).join('');
  return '<h2>Son 7 günde kaslar <small>· set, yardımcı kas yarım</small></h2><div class="panel kh-panel"><div class="kh-harita">' + khFigur('on', KH_ON) + khFigur('arka', KH_ARKA) +
    '<div class="kh-etiket" aria-hidden="true" hidden></div></div><div class="kh-liste">' + liste + '</div>' +
    '<p class="mut kucuk kh-not"><span class="kh-l">0<span class="kh-sw" aria-hidden="true"><i style="--o:.07"></i><i style="--o:.45"></i><i style="--o:.7"></i><i class="tamam"></i></span>' + KAS_HEDEF + '+ set hedef</span><span>kesikli: 7 günde hiç</span></p></div>';
}
/* bölge seçimi: etiket bölgenin üstünde (sığmazsa altında), haritanın içinde kalır.
   kalici: tıklama / Enter (aç-kapa, duyurulur); değilse fareyle üzerine gelme (ayrılınca seçili olana döner) */
function khGoster(k, yon, kalici) {
  var hr = $('.kh-harita'); if (!hr) return;
  var et = hr.querySelector('.kh-etiket'), bl = [].slice.call(document.querySelectorAll('.kh-b,.kh-s'));
  if (kalici) khSecili = khSecili && khSecili.k === k && (!yon || khSecili.yon === yon) ? null : { k: k, yon: yon };
  var a = kalici ? khSecili : k ? { k: k, yon: yon } : khSecili;
  bl.forEach(function (x) { x.classList.toggle('sec', !!a && x.dataset.kas === a.k); });
  if (!a) { et.hidden = true; return; }
  var ad = function (x, y) { return x.classList.contains('kh-b') && x.dataset.kas === a.k && x.dataset.yon === y; };
  var hedef = bl.filter(function (x) { return ad(x, a.yon); })[0] || bl.filter(function (x) { return ad(x, KH_ODAK[a.k]); })[0];
  et.textContent = khEtiketMetni(a.k); et.hidden = false;
  if (kalici) duyur(et.textContent);
  var w = hr.getBoundingClientRect(), ew = et.offsetWidth, eh = et.offsetHeight;
  if (!hedef) { et.className = 'kh-etiket alt'; et.style.left = w.width / 2 + 'px'; et.style.top = w.height + 'px'; return; }
  var r = hedef.getBoundingClientRect(), alt = r.top - w.top < eh + 10;
  et.className = 'kh-etiket' + (alt ? ' alt' : '');
  et.style.left = Math.max(ew / 2 + 2, Math.min(w.width - ew / 2 - 2, r.left + r.width / 2 - w.left)) + 'px';
  et.style.top = (alt ? r.bottom - w.top + 8 : r.top - w.top - 8) + 'px';
}
document.addEventListener('click', function (ev) {
  var t = ev.target.closest && ev.target.closest('[data-act="kas-sec"]'); if (t) khGoster(t.dataset.kas, t.dataset.yon, true);
});
document.addEventListener('keydown', function (ev) {
  var t = ev.target; if (!t.classList || !t.classList.contains('kh-b') || (ev.key !== 'Enter' && ev.key !== ' ')) return;
  ev.preventDefault(); khGoster(t.dataset.kas, t.dataset.yon, true);
});
document.addEventListener('pointerover', function (ev) {
  if (ev.pointerType !== 'mouse' || !ev.target.closest) return;
  var g = ev.target.closest('.kh-b'); if (g) khGoster(g.dataset.kas, g.dataset.yon);
  else if (ev.target.closest('.kh-harita')) khGoster(null);
});
document.addEventListener('focusin', function (ev) { var t = ev.target; if (t.classList && t.classList.contains('kh-b')) khGoster(t.dataset.kas, t.dataset.yon); });
document.addEventListener('focusout', function (ev) { var t = ev.target; if (t.classList && t.classList.contains('kh-b')) khGoster(null); });
document.addEventListener('pointerout', function (ev) {
  if (ev.pointerType !== 'mouse' || !ev.target.closest || !ev.target.closest('.kh-harita')) return;
  if (!(ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.kh-harita'))) khGoster(null);
});

/* son 12 hafta: her hafta bir sütun (antrenman sayısı), solda üst üste hafta sayısı */
function haftaSeridi() {
  var w = {}; S.sessions.forEach(function (s) { var k = haftaBasi(s.date); w[k] = (w[k] || 0) + 1; });
  var d = parse(haftaBasi(iso(new Date()))); d.setDate(d.getDate() - 77);
  var cs = '', seri = haftaSerisi();
  for (var i = 0; i < 12; i++) {
    var k = iso(d), n = w[k] || 0;
    cs += '<i class="h' + Math.min(n, 4) + (i === 11 ? ' bu' : '') + '" title="' + tarih(k, 1) + ' haftası: ' + n + ' antrenman"></i>';
    d.setDate(d.getDate() + 7);
  }
  return '<div class="hseri"><div class="hseri-n"><b>' + seri + '</b><span>' + (seri ? 'hafta üst üste<br>antrenman' : 'hafta seri<br>bu hafta başla') + '</span></div>' +
    '<div class="hseri-c" role="img" aria-label="Son 12 hafta, haftalık antrenman sayısı">' + cs + '</div></div>';
}

/* takvim günleri: hep 6 hafta satırı; önceki/sonraki ayın günleri soluk ama ısısı ve rekoru görünür.
   Bu ay açıksa fazladan satırlar üste (geçen haftalar), başka ayda alta eklenir. Antrenman günü düğme: o günün seansını açar. */
function takvimGunler(y, m, gunler, ton) {
  var bi = iso(new Date()), pr = prHesapla(), son = {}, rek = {}, varRek = false;
  S.sessions.forEach(function (s) {
    if (!son[s.date] || (s.start || 0) > (son[s.date].start || 0)) son[s.date] = s;
    if (pr[s.id]) rek[s.date] = 1;
  });
  var ilk = (new Date(y, m, 1).getDay() + 6) % 7, say = new Date(y, m + 1, 0).getDate();
  var satir = Math.ceil((ilk + say) / 7), ust = (iso(new Date(y, m, 1)).slice(0, 7) === bi.slice(0, 7) ? 6 - satir : 0);
  var d = new Date(y, m, 1 - ilk - ust * 7), o = '';
  for (var i = 0; i < 42; i++, d.setDate(d.getDate() + 1)) {
    var k = iso(d), n = gunler[k], diger = d.getMonth() !== m, s = son[k], r = n && rek[k];
    if (r) varRek = true;
    var c = 'g' + (diger ? ' diger' : '') + (n ? ' on t' + ton(n) : '') + (r ? ' rek' : '') + (k === bi ? ' today' : '');
    var ad = d.getDate() + ' ' + AYLAR[d.getMonth()];
    o += n && s
      ? '<button class="' + c + '" data-act="seans" data-id="' + h(s.id) + '"' + (k === bi ? ' aria-current="date"' : '') + ' title="' + n + ' set' + (r ? ' · rekor' : '') + '" aria-label="' + ad + ', ' + h(s.name || 'Antrenman') + ', ' + n + ' set' + (r ? ', rekor' : '') + '">' + d.getDate() + '</button>'
      : '<span class="' + c + '"' + (k === bi ? ' aria-current="date"' : '') + (diger ? ' aria-hidden="true"' : '') + '>' + d.getDate() + '</span>';
  }
  return { html: o, rek: varRek };
}

function vGecmis() {
  var bu = new Date(); if (!gecmisAy) gecmisAy = new Date(bu.getFullYear(), bu.getMonth(), 1);
  var y = gecmisAy.getFullYear(), m = gecmisAy.getMonth();
  /* gün başına set; takvim tonu kişinin olağan gününe göre (medyan): az · olağan · çok */
  var gunler = {}; S.sessions.forEach(function (s) { gunler[s.date] = (gunler[s.date] || 0) + Math.max(1, seansSetSayisi(s)); });
  var dg = Object.keys(gunler).map(function (k) { return gunler[k]; }).sort(function (a, b) { return a - b; }), med = dg.length ? dg[Math.floor(dg.length / 2)] : 0;
  function ton(n) { return n <= med * 0.75 ? 1 : n >= med * 1.3 ? 3 : 2; }
  var o = '<h1>Geçmiş</h1>';
  var buAy = S.sessions.filter(function (s) { return s.date.slice(0, 7) === y + '-' + p2(m + 1); }).length;
  o += '<p class="sub">toplam ' + S.sessions.length + ' antrenman' +
    (AT.bolum.haftalikDugme && S.sessions.length ? ' ' + AT.bolum.haftalikDugme() : '') + '</p>';   /* haftalik.js */
  var o0 = o; o = '';
  if (S.sessions.length) o += haftaSeridi();
  o += '<div class="panel takvim-panel"><div class="ayb"><button data-act="ay" data-d="-1" aria-label="Önceki ay">&lsaquo;</button><b>' + AYLAR[m] + ' ' + y + '</b><button data-act="ay" data-d="1" aria-label="Sonraki ay">&rsaquo;</button></div>';
  var tg = takvimGunler(y, m, gunler, ton);
  o += '<div class="cal">' + GUN.map(function (g) { return '<span class="h">' + g + '</span>'; }).join('') + tg.html + '</div>';
  o += '<p class="mut kucuk takvim-not"><span class="ton-l" aria-hidden="true">az<i class="t1"></i><i class="t2"></i><i class="t3"></i>çok set</span><span class="bugun-l"><i></i>bugün</span>' +
    (tg.rek ? '<span class="rek-l" aria-hidden="true"><i></i>rekor</span>' : '') + '</p></div>';
  if (S.sessions.length) o += '<div class="gecmis-kas">' + kasBolum(bitenSeanslar()) + '</div>';
  /* takvimde başka ay açıksa sayı o aya aittir: "· Eylül ayında 12" */
  var b = '<h2>Antrenmanlar <small>· ' + (y === bu.getFullYear() && m === bu.getMonth() ? 'bu ay ' : AYLAR[m] + ' ayında ') + buAy + '</small></h2>';
  var l = S.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.start || 0) - (a.start || 0); });
  if (!l.length) return o0 + kol(o, b + bosDurum('gecmis', 'Bitirdiğin antrenmanlar burada birikir.'), 'takvim');
  var pr = prHesapla();
  var n = gecmisHepsi ? 200 : 10;
  b += '<div class="panel liste">' + l.slice(0, n).map(function (s) { return seansSatir(s, pr); }).join('') + '</div>';
  if (l.length > n) b += gecmisHepsi ? '<p class="mut">Son 200 antrenman gösteriliyor.</p>' : '<button class="btn-big btn-ghost ac" data-act="gecmis-hepsi">Tümünü göster (' + l.length + ')</button>';
  return o0 + kol(o, b, 'takvim');
}

function haftaSerisi() {
  var w = {}; S.sessions.forEach(function (s) { w[haftaBasi(s.date)] = 1; });
  var d = parse(haftaBasi(iso(new Date()))), n = 0;
  if (!w[iso(d)]) d.setDate(d.getDate() - 7);
  while (w[iso(d)]) { n++; d.setDate(d.getDate() - 7); }
  return n;
}

function egzNoktalar(ad) {
  var pts = [];
  bitenSeanslar().forEach(function (se) {
    se.exs.forEach(function (e) {
      if (e.ad !== ad) return;
      var m = 0; yapilanSetler(e).forEach(function (s) { m = Math.max(m, tahminiMax(num(s.kg), num(s.reps), s.rpe)); });
      if (m > 0) pts.push({ x: parse(se.date).getTime(), y: m, t: tarih(se.date, 1), se: se, e: e });
    });
  });
  return pts;
}

/* İlerleme iki konu: Kilo | Güç. Telefonda üstteki seçici biri gösterir; masaüstünde ikisi yan yana (seçici gizli). */
var ilerSek = null, gecmisHepsi = false;
/* dokunma etiketinin 3. satırı: o seansın tahmini maxı veren seti ("80 kg × 8"); yalnız dokununca hesaplanır */
function enIyiSet(p) {
  var b = null, m = 0; if (!p.e) return '';
  yapilanSetler(p.e).forEach(function (s) { var v = tahminiMax(num(s.kg), num(s.reps), s.rpe); if (v > m) { m = v; b = s; } });
  return b ? 'en iyi set ' + fmt(num(b.kg), 2) + ' kg × ' + b.reps : '';
}
/* "12 Ekim'de" / "3 Mart 2025'te": Türkçe bulunma eki (tarih Türkçe okunuşunun son ünlüsüne ve sertliğine göre) */
var AY_EK = ['ta', 'ta', 'ta', 'da', 'ta', 'da', 'da', 'ta', 'de', 'de', 'da', 'ta'];
function sayiEk(n) {
  n = Math.abs(Math.round(n));
  if (n === 0) return 'da';
  var b = n % 10, o = Math.floor(n / 10) % 10;
  if (b) return ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'][b];
  if (o) return ['', 'da', 'de', 'da', 'ta', 'de', 'ta', 'te', 'de', 'da'][o];
  return 'de';   /* yüz, bin */
}
function tarihDe(s) { var d = parse(s), y = d.getFullYear(); return d.getDate() + ' ' + AYLAR[d.getMonth()] + (y !== new Date().getFullYear() ? ' ' + y + "'" + sayiEk(y) : "'" + AY_EK[d.getMonth()]); }
/* kilometre taşları: tahmini maxın ilk kez geçtiği yuvarlak eşikler (ilk seans başlangıç sayılır, onun altındakiler taş değil).
   Adım hareketin aralığına göre: ilk seanstan en iyiye 40 kg+ artışta 20, daha azında (ya da 20'lik eşik geçilmediyse) 10. En son 4 taş. pts kronolojik */
function kmTaslari(pts) {
  if (pts.length < 2) return [];
  function bul(st) {
    var out = [], m = pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].y > m) { for (var e = (Math.floor(m / st) + 1) * st; e <= pts[i].y + 1e-9; e += st) out.push({ i: i, v: e, t: pts[i].t, date: pts[i].se ? pts[i].se.date : null }); m = pts[i].y; }
    }
    return out;
  }
  var enE = Math.max.apply(0, pts.map(function (p) { return p.y; })), t = enE - pts[0].y >= 40 ? bul(20) : [];
  if (!t.length) t = bul(10);
  /* aynı seansta iki eşik geçildiyse yalnız büyüğü (bayrak üst üste binmesin) */
  t = t.filter(function (x, k) { return !(t[k + 1] && t[k + 1].i === x.i); });
  return t.slice(-4);
}
function gucBolum(l) {
  var adlar = []; l.forEach(function (s) { s.exs.forEach(function (e) { if (yapilanSetler(e).length && adlar.indexOf(e.ad) < 0) adlar.push(e.ad); }); });
  var o = '<h2>Güç</h2>';
  if (!adlar.length) return o + '<p class="mut">Antrenman kaydettikçe her hareketin güç grafiği burada oluşur.</p>';
  if (!secEgz || adlar.indexOf(secEgz) < 0) secEgz = adlar[0];
  o += '<label class="alan"><select id="egzsec" aria-label="Hareket seç">' + adlar.map(function (a) { return '<option value="' + h(a) + '"' + (a === secEgz ? ' selected' : '') + '>' + h(a) + '</option>'; }).join('') + '</select></label>';
  var pts = egzNoktalar(secEgz);
  var enAgir = 0, enAgirT = '', enSet = { v: 0 }, enHac = 0, enHacT = '', enE = 0, enET = '';
  pts.forEach(function (p) { if (p.y > enE) { enE = p.y; enET = p.t; } });
  /* en ağır / en iyi set / seans toplamı: tahmini maxı olmayan (yalnız 12+ tekrarlı) seanslar dahil hepsinden */
  l.forEach(function (se) {
    se.exs.forEach(function (e) {
      if (e.ad !== secEgz) return; var t = tarih(se.date, 1);
      yapilanSetler(e).forEach(function (s) { var kg = num(s.kg); if (kg > enAgir) { enAgir = kg; enAgirT = t; } var v = kg * num(s.reps); if (v > enSet.v) enSet = { v: v, kg: kg, r: num(s.reps), t: t }; });
      var hc = hacim(e); if (hc > enHac) { enHac = hc; enHacT = t; }
    });
  });
  var ilkP = pts[0], sonP = pts[pts.length - 1], fark = sonP && ilkP && pts.length > 1 ? sonP.y - ilkP.y : 0;
  var va = enAgir === 0;   /* d8: bütün setler 0 kg (vücut ağırlığı; adlar yalnız seti olan hareketler): tekrar grafiği */
  if (va) o += gucVa(l);
  else if (pts.length) {
    o += '<div class="panel"><div class="hero"><b>' + sayData(enE, 1) + ' <small>kg</small></b><span>tahmini max: tek tekrarda kaldırabileceğin kilo · en iyisi ' + h(enET).replace(' ', '&nbsp;') + '</span></div>';
    if (fark > 0) o += '<p class="durum iyi">İlk kayıttan bu yana +' + fmt(fark) + ' kg güçlendin.</p>';
    /* rekor noktaları (prHesapla: tahmini max rekoru kırılan seans) altın; kilometre taşları bayrak, en sonu altta tek satır */
    var prm = prHesapla(), rk = [], ts = kmTaslari(pts);
    pts.forEach(function (p, i) { var t = p.se && prm[p.se.id] && prm[p.se.id][secEgz]; if (t && t.some(function (x) { return x.ad === 'Tahmini max'; })) rk.push(i); });
    o += cizgi(pts, { baslik: secEgz + ' tahmini max', birim: 'kg', ek: enIyiSet, rek: rk, tas: ts });
    var st = ts[ts.length - 1];
    if (st && st.date) o += '<p class="tas-son"><i aria-hidden="true"></i>' + h(fmt(st.v, 0)) + " kg'ı " + h(tarihDe(st.date)) + ' geçtin</p>';
    o += '</div>';
  } else {
    o += '<p class="mut kucuk">Bu harekette ' + MAX_TEKRAR + ' tekrar ve altı set yok; tahmini max yalnız ' + MAX_TEKRAR + ' ve altı tekrardan hesaplanır.</p>';
  }
  if (!va) o += '<div class="panel"><dl class="kv">' +
    '<div><dt>En ağır kaldırdığın</dt><dd>' + fmt(enAgir, 2) + ' kg<small>' + h(enAgirT) + '</small></dd></div>' +
    '<div><dt>En iyi set</dt><dd>' + (enSet.kg != null ? fmt(enSet.kg, 2) + ' kg × ' + enSet.r + '<small>' + h(enSet.t) + '</small>' : '–') + '</dd></div>' +
    '<div><dt>Bir seansta en çok</dt><dd>' + fmt(enHac, 0) + ' kg<small>' + h(enHacT) + '</small></dd></div></dl></div>';
  // haftalık toplam kaldırılan (bu hareket), son 12 hafta; vücut ağırlığında toplam tekrar
  var hb = haftaBasi(iso(new Date())), hv = {};
  l.forEach(function (s) { s.exs.forEach(function (e) { if (e.ad === secEgz) hv[haftaBasi(s.date)] = (hv[haftaBasi(s.date)] || 0) + (va ? toplamTekrar(e) : hacim(e)); }); });
  var items = [], d = parse(hb); d.setDate(d.getDate() - 77);
  for (var i = 0; i < 12; i++) { items.push({ l: tarih(iso(d), 1), v: hv[iso(d)] || 0 }); d.setDate(d.getDate() + 7); }
  o += '<details class="katla"><summary>Haftalık toplam <small>son 12 hafta</small></summary><p class="mut kucuk">' + (va ? 'Her hafta bu harekette yaptığın toplam tekrar.' : 'Her hafta bu harekette kaldırdığın toplam (kg × tekrar).') + '</p>' +
    cubuk(items, { baslik: secEgz + ' haftalık toplam', birim: va ? 'tekrar' : 'kg' }) + '</details>';
  // rekorlar
  var pr = prHesapla(), prs = [];
  l.forEach(function (s) { if (pr[s.id] && pr[s.id][secEgz]) prs.push({ s: s, t: pr[s.id][secEgz] }); });
  o += '<details class="katla"><summary>Rekorlar <small>' + prs.length + '</small></summary>';
  o += tekrarTablosu(secEgz, l, enE);   /* b1 */
  if (!prs.length) o += '<p class="mut kucuk">Bu harekette henüz yeni rekor yok (ilk seans başlangıç sayılır).</p>';
  else o += '<div class="liste">' + prs.slice(-8).reverse().map(prSatir).join('') + '</div>';
  return o + '</details>';
}
/* d8: vücut ağırlığı hareketi (bütün setler 0 kg): seans başına tek sette en çok tekrar grafiği; rekor noktası prHesapla 'En çok tekrar' */
function toplamTekrar(e) { return yapilanSetler(e).reduce(function (t, x) { return t + num(x.reps); }, 0); }
function gucVa(l) {
  var pts = [], rk = [], en = 0, enT = '', top = 0, topT = '', prm = prHesapla();
  l.forEach(function (se) { se.exs.forEach(function (e) {
    var s = e.ad === secEgz ? yapilanSetler(e) : []; if (!s.length) return;
    var m = Math.max.apply(0, s.map(function (x) { return num(x.reps); })), tt = toplamTekrar(e), t = tarih(se.date, 1), r = prm[se.id] && prm[se.id][secEgz];
    if (m > en) { en = m; enT = t; } if (tt > top) { top = tt; topT = t; }
    if (r && r.some(function (x) { return x.va; })) rk.push(pts.length);
    pts.push({ x: parse(se.date).getTime(), y: m, t: t });
  }); });
  var fark = pts.length > 1 ? pts[pts.length - 1].y - pts[0].y : 0;
  return '<div class="panel"><div class="hero"><b>' + sayData(en, 0) + ' <small>tekrar</small></b><span>vücut ağırlığıyla tek sette en çok tekrar · en iyisi ' + h(enT).replace(' ', '&nbsp;') + '</span></div>' +
    (fark > 0 ? '<p class="durum iyi">İlk kayıttan bu yana +' + fark + ' tekrar.</p>' : '') +
    cizgi(pts, { baslik: secEgz + ' en çok tekrar', birim: 'tekrar', rek: rk }) + '</div>' +
    '<div class="panel"><dl class="kv"><div><dt>Tek sette en çok</dt><dd>' + en + ' tekrar<small>' + h(enT) + '</small></dd></div>' +
    '<div><dt>Bir seansta en çok</dt><dd>' + top + ' tekrar<small>' + h(topT) + '</small></dd></div></dl></div>';
}
function vIlerleme() {
  var o = '<h1>İlerleme</h1>';
  var l = bitenSeanslar();
  var kartK = function () { return AT.bolum.kart ? AT.bolum.kart() : ''; };
  if (!l.length && !S.bw.length) return o + bosDurum('ilerleme', 'Tartı ve antrenman ekledikçe grafiklerin burada çizilir.', '<button class="btn-ghost mini" data-act="demo-yukle">Örnek veriyle gör</button>') + bwAlan();
  if (!ilerSek) ilerSek = S.bw.length || S.bulk ? 'kilo' : 'guc';
  var hb = haftaBasi(iso(new Date())), buHafta = l.filter(function (s) { return haftaBasi(s.date) === hb; }).length, seri = haftaSerisi();
  o += '<p class="sub">Bu hafta ' + buHafta + ' antrenman' + (seri > 1 ? ' · ' + seri + ' haftadır aksatmadın' : '') + '</p>';
  o += '<div class="seg sekme" role="group" aria-label="Konu">' + [['kilo', 'Kilo'], ['guc', 'Güç']].map(function (t) {
    return '<button data-act="ilersek" data-v="' + t[0] + '" aria-pressed="' + (ilerSek === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  return o + kol(bwAlan() + kartK(), gucBolum(l), 'ilerleme sek-' + ilerSek);
}
function bwAlan() { return AT.bolum.bulk ? AT.bolum.bulk() : bwBolum(); }

/* b1: 1–12 tekrar için gerçek en iyi kg (en az o kadar tekrar yapılmış en ağır set) ve en iyi tahmini maxtan
   geri hesap (Epley tersi). Gerçek tahmini geçerse tahmin sütunu da gerçeği gösterir. Rekor bildirimi tetiklemez. */
function tekrarTablosu(ad, l, enE) {
  if (!(enE > 0)) return '';
  var en = []; for (var r = 1; r <= MAX_TEKRAR; r++) en[r] = 0;
  l.forEach(function (se) { se.exs.forEach(function (e) {
    if (e.ad !== ad) return;
    yapilanSetler(e).forEach(function (x) { var kg = num(x.kg), n = Math.min(MAX_TEKRAR, num(x.reps)); for (var r = 1; r <= n; r++) if (kg > en[r]) en[r] = kg; });
  }); });
  var o = '<table class="tekrar-tablo"><thead><tr><th>Tekrar</th><th>En iyin</th><th>Tahmini</th></tr></thead><tbody>';
  for (var r = 1; r <= MAX_TEKRAR; r++) {
    var t = r === 1 ? enE : enE / (1 + r / 30), g = en[r];
    o += '<tr><td>' + r + '</td><td>' + (g > 0 ? fmt(g, 2) + ' kg' : '<span class="mut">–</span>') + '</td><td>' + (g >= t ? '<b>' + fmt(g, 2) + '</b>' : '~' + fmt(Math.round(t * 2) / 2, 1)) + ' kg</td></tr>';
  }
  return o + '</tbody></table>';
}
/* rekor değeri: gerçek kaldırılan kilo (En ağır) 2 ondalık (78,75), tahmini max 1 ondalık */
function kgOnd(t) { return t && t.ad === 'En ağır' ? 2 : 1; }
function prSatir(x) {
  var d = parse(x.s.date), yil = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return '<div class="satir pr"><div class="pr-d"><b>' + d.getDate() + '</b><span>' + AYLAR[d.getMonth()].slice(0, 3) + yil + '</span></div><div class="grow">' +
    x.t.map(function (t) {
      if (t.va) return '<div class="pr-l"><span class="k">' + h(t.ad) + '</span><b>' + t.yeni + ' tekrar</b><span class="up">+' + t.fark + '</span></div>';   /* d8 */
      return '<div class="pr-l"><span class="k">' + h(t.ad) + (t.set ? '<small>' + fmt(num(t.set.kg), 2) + ' × ' + h(t.set.reps) + '</small>' : '') + '</span>' +
        '<b>' + fmt(t.yeni, kgOnd(t)) + ' kg</b><span class="up">+' + fmt(t.fark, kgOnd(t)) + '</span></div>';
    }).join('') + '</div></div>';
}

function bwBolum() {
  var l = S.bw.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var o = '<h2>Vücut ağırlığı</h2><div class="panel">';
  if (l.length) {
    var son = l[l.length - 1], ilk = l[0], fk = son.kg - ilk.kg;
    o += '<div class="hero"><b>' + sayData(son.kg, 1) + ' <small>kg</small></b><span>' + tarih(son.date, 1) + (l.length > 1 ? ' · ilk kayda göre ' + (fk > 0 ? '+' : fk < 0 ? '−' : '') + fmt(Math.abs(fk)) + ' kg' : '') + (son.demo ? ' <span class="tag demo">örnek</span>' : '') + '</span></div>';
    o += cizgi(l.map(function (b) { return { x: parse(b.date).getTime(), y: b.kg, t: tarih(b.date, 1) }; }), { baslik: 'Vücut ağırlığı', birim: 'kg' });
  }
  o += '<div class="row" style="margin-top:' + (l.length ? 16 : 0) + 'px"><input id="bwkg" inputmode="decimal" placeholder="Bugünkü kilo, örn. 82,4" aria-label="Vücut ağırlığı kg"><button class="btn-ac" data-act="bw-ekle">Kaydet</button></div>';
  if (l.length) o += '<button class="mini btn-ghost" data-act="bw-geri" style="margin:8px 0 -6px -12px;color:var(--mut)">Son kaydı sil</button>';
  return o + '</div>';
}

/* Ayarlar > "Bu kelimeler ne demek?" */
var SOZLUK = [
  ['Set ve tekrar', 'Set, bir hareketi ara vermeden yaptığın bir tur; tekrar, o turda kaç kez yaptığın. 3 set × 8 tekrar = 8\'er tekrarlık 3 tur.'],
  ['Tahmini max', 'Tek tekrarda kaldırabileceğin tahmini en ağır kilo (1RM). Yaptığın setten hesaplanır, örn. 80 kg × 8 ≈ 101 kg; max denemene gerek yok.'],
  ['Toplam kaldırılan', 'kg × tekrar toplamı (hacim). 3 set × 8 × 80 kg = 1.920 kg.'],
  ['Ortalama kilo', 'Tartı günden güne su ve yemekle 1-2 kg oynar. Uygulama son günlerin ağırlıklı ortalamasını gösterir; asıl gidişat budur.'],
  ['Bulk ve cut', 'Bulk: kas için yavaşça kilo alma dönemi. Cut: kilo verme dönemi.'],
  ['Günlük harcama', 'Bir günde yaktığın toplam kalori (TDEE). Son 4 haftada yediğin kalori ortalamasından kilo değişiminin karşılığı düşülerek hesaplanır (1 kg ≈ 7.700 kcal). Kilon sabitse yediğin kadar harcıyorsun.'],
  ['Hafif hafta', 'İlerleme durunca 1 hafta kiloyu %10 düşürüp toparlanmak (deload). Sonra eski kiloya dönersin.'],
  ['Zorluk (RPE)', '10 = bir tekrar daha yapamazdım, 9 = bir tekrar daha yapabilirdim, 8 = iki tekrar daha. Ayarlardan açılır, boş bırakılabilir.'],
  ['Makro', 'Protein, karbonhidrat ve yağ (gram). 1 g protein ve karbonhidrat 4 kcal, 1 g yağ 9 kcal eder; makroyla eklediğin öğünün kalorisi kendiliğinden hesaplanır.']
];
/* Ayarlar küçük çizgi ikonları (currentColor) */
var AY_IKON = {
  yedek: '<path d="M7 17.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 17.5z"/>',
  gorunum: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15a7.5 7.5 0 0 0 0-15z" fill="currentColor" stroke="none"/>',
  antrenman: '<rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/><path d="M8 12h8M2.5 10v4M21.5 10v4"/>',
  ornek: '<path d="M12 3.5l1.8 4.6 4.7 1.9-4.7 1.9L12 16.5l-1.8-4.6L5.5 10l4.7-1.9z"/><path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  sozluk: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5zM5 18.5A1.5 1.5 0 0 0 6.5 20H19"/><path d="M9 8.5h6"/>',
  sil: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>'
};
function ayIkon(k) { return '<svg class="ay-i" viewBox="0 0 24 24" aria-hidden="true">' + AY_IKON[k] + '</svg>'; }
function ayBaslik(k, m) { return '<h2 class="ay-b">' + ayIkon(k) + h(m) + '</h2>'; }
function aySatir(act, b, alt, cls) { return '<button class="satir ay-satir' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"><span class="grow"><b>' + h(b) + '</b><span>' + h(alt) + '</span></span></button>'; }
function vAyarlar() {
  var demoVar = S.sessions.some(function (s) { return s.demo; }) || S.bw.some(function (b) { return b.demo; }) || (S.kcal || []).some(function (k) { return k.demo; }) || (S.defter || []).some(function (n) { return n && n.demo; });
  var o0 = '<h1>Ayarlar</h1><p class="sub">' + (AT.esitBagli && AT.esitBagli() ? 'Kayıtların bu cihazda ve şifreli olarak GitHub\'daki gizli dosyanda durur.' : 'Kayıtların yalnız bu cihazda durur; internete gönderilmez.') + (AT.kocBilgi ? AT.kocBilgi() : '') + '</p>';
  /* yedek, otomatik yedek, eşitleme ve Excel tek grupta; ayrıntılar katlanır (durumları özet satırında) */
  var a0 = ayBaslik('yedek', 'Yedek ve eşitleme') + '<div class="panel liste ay-grup">' +
    aySatir('disa', 'Yedeği indir', 'Tüm kayıtlar tek dosyada; arada bir al') +
    aySatir('ice', 'Yedeği geri yükle', 'Şu anki verinin yerine geçer') + '</div>' +
    '<input type="file" id="dosya" accept="application/json,.json" hidden>';
  if (AT.bolum.otoyedek) a0 += AT.bolum.otoyedek();
  if (AT.bolum.esitle) a0 += AT.bolum.esitle();   /* esitle.js: PC ↔ telefon */
  if (AT.bolum.koc) a0 += AT.bolum.koc();   /* koc.js: isteğe bağlı yapay zekâ koçu */
  if (AT.bolum.disa) a0 += '<details class="katla ay-excel"><summary>Excel ve diğer uygulamalar <small>Strong, Hevy</small></summary>' + AT.bolum.disa() + '</details>';
  /* tema: üç küçük sayfa önizlemesi (Sistem yarı yarıya) */
  /* PC'de sütunlar dengeli: Görünüm sol sütunda yedeğin altında (telefonda sıra aynı) */
  a0 += ayBaslik('gorunum', 'Görünüm') + '<div class="tema-sec" role="group" aria-label="Tema">' + [['sistem', 'Sistem'], ['acik', 'Açık'], ['koyu', 'Koyu'], ['apple', 'Apple']].map(function (t) {
    return '<button data-act="tema" data-v="' + t[0] + '" aria-pressed="' + ((S.tema || 'sistem') === t[0]) + '"><span class="tema-on ' + t[0] + '" aria-hidden="true"><i></i><i></i><i></i></span>' + t[1] + '</button>'; }).join('') + '</div>';
  var dEgz = Object.keys(S.dinlenmeEgz || {});
  var o = ayBaslik('antrenman', 'Antrenman') + '<div class="panel"><label class="alan"><span>Setler arası dinlenme (saniye)</span><input id="din" inputmode="numeric" value="' + S.dinlenme + '"></label>' +
    (dEgz.length ? '<p class="din-egz">' + dEgz.map(function (k) { var v = S.dinlenmeEgz[k]; return h(k) + ' <b>' + Math.floor(v / 60) + ':' + p2(v % 60) + '</b>'; }).join(' · ') +
      ' <button class="btn-ghost mini" data-act="din-egz-sil">Sıfırla</button></p>' : '') +
    '<div class="alan"><span>Zorluk alanı (RPE): her sete 6–10 arası zorluk yazmak için</span><div class="seg" role="group" aria-label="Zorluk alanı">' + [[0, 'Kapalı'], [1, 'Açık']].map(function (t) {
      return '<button data-act="rpe" data-v="' + t[0] + '" aria-pressed="' + (!!S.rpe === !!t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<p class="mut kucuk alt-not">Bilmiyorsan kapalı bırak; öneriler yine çalışır.</p></div>' +
    (AT.bolum.ses ? AT.bolum.ses() : '') + '</div>';
  o += ayBaslik('ornek', 'Örnek veri') + '<div class="panel liste ay-grup">' + (demoVar
    ? aySatir('demo-sil', 'Örnek veriyi sil', 'Yalnız "örnek" etiketli kayıtlar gider', 'bad')
    : aySatir('demo-yukle', 'Örnek veriyi yükle', 'Dolu hâlini görmek için 12 haftalık uydurma kayıt, "örnek" etiketli')) + '</div>';
  o += '<details class="katla ay-sozluk"><summary>' + ayIkon('sozluk') + 'Bu kelimeler ne demek?</summary><dl class="sozluk">' + SOZLUK.map(function (x) { return '<dt>' + h(x[0]) + '</dt><dd>' + h(x[1]) + '</dd>'; }).join('') + '</dl></details>';
  /* tehlikeli işlem en altta, sütunların dışında ayrı ve sakin */
  var sil = '<div class="ay-tehlike">' + ayBaslik('sil', 'Veriyi sil') + '<div class="panel liste ay-grup">' + aySatir('hepsini-sil', 'Tüm verileri sil', 'Antrenmanlar, kilo, kalori ve makrolar, takviyeler, defter notları, kilo hedefi ve ayarlar', 'bad') + '</div></div>';
  return o0 + kol(a0, o) + sil + '<p class="altnot">Ağırlık Takip · internetsiz çalışır<span class="pc"> · kısayollar <kbd>?</kbd></span></p>';
}

function temaGecis() {
  var r = document.documentElement; r.classList.add('tema-gecis'); temaUygula();
  clearTimeout(temaGecis.t); temaGecis.t = setTimeout(function () { r.classList.remove('tema-gecis'); }, 450);
}
function temaUygula() {
  var r = document.documentElement;
  /* Apple teması koyu değişkenlerin üstüne biner: data-theme=koyu + data-tema=apple */
  if (S.tema === 'apple') { r.dataset.theme = 'koyu'; r.dataset.tema = 'apple'; }
  else { delete r.dataset.tema; if (S.tema === 'acik' || S.tema === 'koyu') r.dataset.theme = S.tema; else delete r.dataset.theme; }
  var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(r).getPropertyValue('--bg').trim();
}
function render() {
  var v = $('#view'); gid = 0;
  var g = ({ bugun: vBugun, gecmis: vGecmis, ilerleme: vIlerleme, ayarlar: vAyarlar })[tab] || (AT.gorunum && AT.gorunum[tab]);   /* takviye.js: AT.gorunum.takviye */
  if (!g) { tab = 'bugun'; g = vBugun; }
  /* hata kalkanı: bir ekran bozulursa boş sayfa yerine kurtarma ekranı; veri dokunulmaz */
  try { v.innerHTML = g(); } catch (e) {
    if (window.console) console.error(e);
    v.innerHTML = '<h1>Bu ekran açılamadı</h1><p class="sub">Kayıtların yerinde. Önce yedeği indir, sonra başka bir sekmeye geç.</p>' +
      '<div class="yigin"><button class="btn-ac btn-big" data-act="disa">Yedeği indir</button>' + (tab !== 'bugun' ? '<button class="btn-big" data-tab="bugun">Bugün\'e dön</button>' : '') + '</div>' +
      '<p class="altnot">' + h(String(e && e.message || e)) + '</p>';
  }
  /* yalnız sekme değişince giriş animasyonu (style.css); View Transition sürerken o kaydırır, bu kapalı */
  var yeniSekme = v.dataset.sekme !== tab;
  v.classList.toggle('giris', yeniSekme && !vtSuruyor); v.dataset.sekme = tab;
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  var f = $('#dosya'); if (f) f.addEventListener('change', iceAl);
  if (tab === 'bugun') { setVurgu(); sahneKur(); }
  if (yeniSekme || !hapEl) hapYerlestir();
  sayilariSay();
}

/* ---------- hareket dili ----------
   Sekme geçişi: View Transitions API varsa içerik menü sırasına göre hafifçe yana kayıp solar (≤220 ms), menünün
   etkin hapı (.sekme-hap, tek öğe) yeni sekmeye kayar; API yoksa eski .giris süzülmesi. Yalnız sekme değişince;
   aynı sekmede yeniden çizim (yazı, ✓) geçişsiz. Hareketi azalt açıksa hiçbiri. */
var vtSuruyor = false, hapEl = null, SIRA = ['bugun', 'gecmis', 'ilerleme', 'defter', 'takviye', 'ayarlar'];
function hapYerlestir() {
  var nav = $('#tabs'); if (!nav || !nav.getBoundingClientRect) return;
  if (!hapEl) { hapEl = document.createElement('span'); hapEl.className = 'sekme-hap'; hapEl.setAttribute('aria-hidden', 'true'); nav.insertBefore(hapEl, nav.firstChild); nav.classList.add('hapli'); }
  var b = $('#tabs button[aria-current=page]');
  if (!b || !b.offsetWidth) { hapEl.style.opacity = '0'; return; }
  var pc = masaustu(), w = pc ? b.offsetWidth : 46, hh = pc ? b.offsetHeight : 28;
  var x = pc ? b.offsetLeft : b.offsetLeft + (b.offsetWidth - w) / 2, y = b.offsetTop + (pc ? 0 : 3);
  hapEl.style.width = w + 'px'; hapEl.style.height = hh + 'px'; hapEl.style.opacity = '';
  hapEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  /* ilk yerleşim ve ekran değişimi kaymasın: geçiş, yer bir kez oturduktan sonra açılır */
  if (!hapEl.classList.contains('kayar')) requestAnimationFrame(function () { requestAnimationFrame(function () { hapEl.classList.add('kayar'); }); });
}
window.addEventListener('resize', function () { if (hapEl) { hapEl.classList.remove('kayar'); clearTimeout(hapYerlestir.t); hapYerlestir.t = setTimeout(hapYerlestir, 120); } });
function sekmeGecis(t, hemen, yap) {
  var eski = SIRA.indexOf(tab), yeni = SIRA.indexOf(t), r = document.documentElement;
  if (hemen || !document.startViewTransition || azHareket.matches || eski === yeni || vtSuruyor || document.hidden) { yap(); return; }
  r.dataset.vt = yeni > eski ? 'ileri' : 'geri';
  r.classList.toggle('vt-asagi', window.scrollY > 8);   /* aşağı kaymışken eski sayfanın üstü görünmesin: eski görüntü hemen kalkar */
  vtSuruyor = true;
  var bitti = function () { vtSuruyor = false; delete r.dataset.vt; r.classList.remove('vt-asagi'); };
  try {
    var g = document.startViewTransition(function () { yap(); });
    g.finished.then(bitti, bitti);
  } catch (e) { bitti(); yap(); }
}
/* Sayarak yükselen sayılar: #view içinde [data-say="82.1"] (data-say-ond: ondalık, varsayılan 0; data-say-ad: anahtar,
   yoksa sekme + sıra; data-say-bas: ilk görünüşte başlangıç, yoksa %85'i). Öğenin içinde biçimli son değeri taşıyan ilk
   metin parçası önceki gösterilen değerden yeniye ≤600 ms sayar; sonda metin tam olarak ilk hâline döner (ekran okuyucu
   doğru değeri okur). Aynı değer yeniden çizilirse dokunulmaz. */
var saySon = {}, sayIs = 0;
function sayilariSay() {
  var is = ++sayIs;
  (window.requestAnimationFrame || setTimeout)(function () {
    if (is !== sayIs) return;
    var v = $('#view'); if (!v || !v.querySelectorAll) return;
    var l = v.querySelectorAll('[data-say]'), sira = {};
    Array.prototype.forEach.call(l, function (el) {
      var hedef = +el.dataset.say, d = +el.dataset.sayOnd || 0; if (!isFinite(hedef)) return;
      var ad = el.dataset.sayAd; if (!ad) { sira[tab] = (sira[tab] || 0) + 1; ad = tab + ':' + sira[tab]; }
      var once = saySon[ad], yuv = Math.pow(10, d); saySon[ad] = hedef;
      if (once === undefined) once = el.dataset.sayBas != null && isFinite(+el.dataset.sayBas) ? +el.dataset.sayBas : hedef * 0.85;
      if (Math.round(once * yuv) === Math.round(hedef * yuv) || azHareket.matches) return;
      sayAkit(el, once, hedef, d);
    });
  });
}
function sayAkit(el, bas, son, d) {
  var yazi = fmt(son, d), tw = document.createTreeWalker(el, 4), dugum = null;   /* 4: NodeFilter.SHOW_TEXT */
  while (tw.nextNode()) if (tw.currentNode.nodeValue.indexOf(yazi) >= 0) { dugum = tw.currentNode; break; }
  if (!dugum) return;
  var tam = dugum.nodeValue, i = tam.indexOf(yazi), on = tam.slice(0, i), arka = tam.slice(i + yazi.length);
  var fark = Math.abs(son - bas), sure = Math.min(600, 260 + 340 * Math.min(1, fark / (Math.abs(son) * 0.15 || 1))), t0 = 0;
  function adim(t) {
    if (!dugum.isConnected) return;
    if (!t0) t0 = t;
    var k = Math.min(1, (t - t0) / sure), e = 1 - Math.pow(1 - k, 3);
    dugum.nodeValue = k >= 1 ? tam : on + fmt(bas + (son - bas) * e, d) + arka;
    if (k < 1) requestAnimationFrame(adim);
  }
  dugum.nodeValue = on + fmt(bas, d) + arka;
  requestAnimationFrame(adim);
}

/* ---------- sheet / toast ---------- */
/* pencere: diyalog rolü, arkası inert, odak içeri; kapanınca odak açan öğeye (yoksa #view) */
var donus = null;
function sheet(html) {
  var s = $('#sheet'), app = $('#app'); if (s.hidden) donus = document.activeElement; sheetIzKaldir();
  /* sağ üstte kapat (×): telefonda başparmakla, PC'de fareyle rahat; arka plana dokunmak / Esc de kapatır */
  s.innerHTML = '<div class="in" role="dialog" aria-modal="true" tabindex="-1"><button type="button" class="sh-kapat" data-act="kapat" aria-label="Kapat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>' + html + '</div>'; s.hidden = false;
  if (app) app.inert = true;
  var b = s.querySelector('h3'); if (b) { b.id = 'sh-b'; s.firstChild.setAttribute('aria-labelledby', 'sh-b'); }
  if (!s.contains(document.activeElement)) (s.querySelector('[autofocus]') || s.firstChild).focus({ preventScroll: true });
}
/* kapanış yumuşak: asıl #sheet hemen gizlenir (durum, odak, testler aynı), yerinde etkisiz bir kopyası 180 ms'de aşağı süzülüp solar.
   Hemen yeni pencere açılırsa (sheet()) kopya beklemeden kalkar */
var sheetIz = null;
function sheetIzKaldir() { if (sheetIz) { sheetIz.remove(); sheetIz = null; } }
function sheetIzBirak(s) {
  sheetIzKaldir();
  if (azHareket.matches || s.hidden || !s.firstChild || !s.cloneNode) return;
  var c = s.cloneNode(true); c.className = 'sheet-iz'; c.setAttribute('aria-hidden', 'true'); c.inert = true;
  Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });   /* kopya #sheet kimliğini taşır (biçim için) ama gövdenin sonunda: $('#sheet') hep asıl pencereyi bulur */
  var ic = s.firstChild, k = c.firstChild; if (ic && k && ic.scrollTop) k.scrollTop = ic.scrollTop;
  document.body.appendChild(c); if (ic && k && ic.scrollTop) k.scrollTop = ic.scrollTop;
  sheetIz = c; setTimeout(function () { if (sheetIz === c) sheetIzKaldir(); }, 200);
}
function kapat() {
  var s = $('#sheet'), app = $('#app'); sheetIzBirak(s); s.hidden = true; s.innerHTML = ''; if (app) app.inert = false;
  if (donus && donus.isConnected) donus.focus({ preventScroll: true }); else { var v = $('#view'); if (v) v.focus({ preventScroll: true }); }
  donus = null;
}
/* ekran okuyucuya bildirim (#duyuru, aria-live) */
function duyur(m) { var d = $('#duyuru'); if (d) { d.textContent = ''; setTimeout(function () { d.textContent = m; }, 50); } }
function toast(m, sure) {
  Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (x) { x.remove(); });
  geriFn = null;
  var t = document.createElement('div'); t.className = 'toast' + ($('#rest').hidden ? '' : ' yukari'); t.setAttribute('role', 'status'); t.textContent = m;
  document.body.appendChild(t); duyur(m);
  setTimeout(function () { t.classList.add('git'); }, Math.max(0, (sure || 2200) - 180));   /* son 180 ms: yumuşak çıkış */
  setTimeout(function () { t.remove(); if (t.geri && geriFn === t.geri) geriFn = null; }, sure || 2200);
  return t;
}
/* silme sonrası 6 sn "Geri al": fn eski hâli geri koyar (kaydet + render burada) */
var geriFn = null;
function geriAl(m, fn) {
  var t = toast(m, 6000), b = document.createElement('button');
  b.type = 'button'; b.dataset.act = 'geri-al'; b.textContent = 'Geri al';
  t.classList.add('geri'); t.appendChild(b); geriFn = t.geri = fn;
}
function onayla(baslik, metin, act, etiket) {
  sheet('<h3>' + h(baslik) + '</h3><p class="mut">' + h(metin) + '</p><div class="yigin"><button class="btn-big btn-bad" data-act="' + act + '">' + h(etiket) + '</button><button class="btn-big btn-ghost" data-act="kapat">Vazgeç</button></div>');
}

function egzSheet() {
  var ara = '<h3>Hareket ekle</h3><p class="mut">Ara ve seç; Türkçe de yazabilirsin (göğüs, şınav, barfiks…).</p><input id="egzara" placeholder="Ara…" aria-label="Hareket ara" autocomplete="off"><div id="egzliste" class="panel liste" style="margin-top:12px"></div><p class="mut" id="egzyok" hidden>Bulunamadı; aşağıdan kendin ekleyebilirsin.</p>' +
    '<h2>Listede yoksa kendin ekle</h2><div class="alanlar"><label class="alan"><span>Ad</span><input id="ozad" placeholder="ör. Hack Squat"></label><label class="alan"><span>Kas grubu</span><select id="ozkas">' + KAS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label></div>' +
    '<div class="yigin"><button class="btn-big" data-act="oz-ekle">Ekle</button><button class="btn-ghost btn-big" data-act="kapat">Kapat</button></div>';
  sheet(ara); egzListele('');
  $('#egzara').addEventListener('input', function (e) { egzListele(e.target.value); });
  if (masaustu()) $('#egzara').focus();
}
/* d7: son 30 günde yapılan hareketler, en son yapılan önce: [{ad, gun}] (gun: kaç gün önce) */
function sonYapilanlar() {
  var lim = new Date(); lim.setDate(lim.getDate() - 30); var limS = iso(lim), bugun = parse(iso(new Date())), gor = {}, out = [], l = bitenSeanslar();
  for (var i = l.length - 1; i >= 0 && l[i].date >= limS; i--) l[i].exs.forEach(function (e) {
    if (!gor[e.ad] && yapilanSetler(e).length) { gor[e.ad] = 1; out.push({ ad: e.ad, gun: Math.round((bugun - parse(l[i].date)) / 864e5) }); }
  });
  return out;
}
/* arama: Türkçe harfsiz (komut.js AT.harfsiz, tek kaynak), çok kelimede bütün kelimeler. Arama boşken son yapılanlar üstte */
function egzListele(q) {
  var kat = AT.harfsiz || function (s) { return String(s || '').toLocaleLowerCase('tr').trim(); };
  var ts = kat(q).split(/\s+/).filter(Boolean), tum = tumEgz(), el = $('#egzliste'), son = [];
  var l = tum.filter(function (x) { var m = kat(x.ad) + ' ' + kat(x.tr); return ts.every(function (t) { return m.indexOf(t) >= 0; }); });
  if (!ts.length) {
    var ust = {};
    son = sonYapilanlar().map(function (y) { ust[y.ad] = 1; var x = tum.filter(function (z) { return z.ad === y.ad; })[0] || { ad: y.ad, kas: kasOf(y.ad) }; return { ad: x.ad, kas: x.kas, gun: y.gun }; });
    l = l.filter(function (x) { return !ust[x.ad]; });
  }
  var satir = function (x) {
    var ne = x.gun == null ? '' : ' · ' + (x.gun <= 0 ? 'bugün' : x.gun === 1 ? 'dün' : x.gun + ' gün önce');
    return '<button class="satir arti" data-act="egz-sec-ekle" data-ad="' + h(x.ad) + '"><span class="grow"><b>' + h(x.ad) + '</b><span>' + h(x.kas) + ne + '</span></span></button>';
  };
  el.hidden = !l.length && !son.length; $('#egzyok').hidden = !el.hidden;
  el.innerHTML = son.length ? '<p class="egz-ara-b">Son yapılanlar</p>' + son.map(satir).join('') + (l.length ? '<p class="egz-ara-b">Tüm hareketler</p>' : '') + l.map(satir).join('') : l.map(satir).join('');
}

function seansSheet(id) {
  var se = S.sessions.filter(function (s) { return s.id === id; })[0]; if (!se) return;
  var pr = prHesapla()[id] || {}, hc = seansHacim(se), ton = hc >= 10000;
  var dk = se.end && se.start ? Math.max(1, Math.round((se.end - se.start) / 60000)) : null;
  var o = '<p class="sheet-ust">' + tarih(se.date) + '</p><h3>' + h(se.name || 'Antrenman') + (se.demo && !/örnek/i.test(se.name || '') ? ' <span class="tag demo">örnek</span>' : '') + '</h3>';
  o += '<div class="sayilar">' + (dk ? '<div><b>' + dk + '</b><span>dakika</span></div>' : '') +
    '<div><b>' + seansSetSayisi(se) + '</b><span>set</span></div>' +
    '<div><b>' + (ton ? fmt(hc / 1000, 1) : fmt(hc, 0)) + '</b><span>' + (ton ? 'ton' : 'kg') + ' toplam</span></div></div>';
  if (se.not) o += '<p class="seans-not">' + h(se.not) + '</p>';
  o += '<div class="seans-egz">';
  se.exs.forEach(function (e) {
    var sets = yapilanSetler(e); if (!sets.length) return;
    o += '<div class="se-x"><div class="se-b"><b>' + h(e.ad) + '</b><span class="deger">' + fmt(hacim(e), 0) + ' kg</span></div>' +
      '<div class="se-set num">' + sets.map(function (s) { return '<span>' + fmt(num(s.kg), 2) + '<small>×</small>' + h(s.reps) + '</span>'; }).join('') + '</div>' +
      (pr[e.ad] ? '<p class="se-rek"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"/></svg>Rekor · ' + pr[e.ad].map(function (t) { return h(t.ad) + ' ' + fmt(t.yeni, kgOnd(t)) + ' kg'; }).join(' · ') + '</p>' : '') + '</div>';
  });
  o += '</div><div class="sheet-dugme">' +
    (islem['seans-duzenle'] ? '<button class="btn-big" data-act="seans-duzenle" data-id="' + h(id) + '">Düzenle</button>' : '') +   /* duzenle.js */
    '<button class="btn-big btn-ac" data-act="kapat">Kapat</button></div>' +
    '<button class="btn-big btn-ghost btn-bad sheet-sil" data-act="seans-sil" data-id="' + h(id) + '">Antrenmanı sil</button>';
  sheet(o);
}

/* a12 yardımcıları: son gerçek tartı (bugün hariç, son 14 gün), onay penceresi, kayıt */
function sonTarti() {
  var t = iso(new Date()), lim = new Date(); lim.setDate(lim.getDate() - 14); var limS = iso(lim);
  var l = S.bw.filter(function (b) { return !b.demo && b.date < t && b.date >= limS && num(b.kg) > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return l.length ? l[l.length - 1] : null;
}
function tartiSor(v, metin, etiket) {
  sheet('<h3>Tartıyı kontrol et</h3><p class="mut">' + h(metin) + '</p><div class="yigin"><button class="btn-ac btn-big" data-act="bw-ekle-kesin" data-v="' + h(String(v)) + '">' + h(etiket) + '</button>' +
    '<button class="btn-big btn-ghost" data-act="kapat">Düzelt</button></div>');
}
function tartiKaydet(v) {
  if (!(v > 20 && v < 400)) return toast('Geçerli bir kg gir');
  var t = iso(new Date()); S.bw = S.bw.filter(function (b) { return !(b.date === t && !b.demo); });
  S.bw.push({ id: uid(), date: t, kg: Math.round(v * 10) / 10 }); kaydet(); render(); toast('Kaydedildi');
}
/* antrenmandaki son set zamanı (yoksa başlangıç) */
function sonHareket(a) { var m = a.start || 0; a.exs.forEach(function (e) { e.sets.forEach(function (x) { if (x.done && x.t > m) m = x.t; }); }); return m; }
function saat(ts) { var d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
/* açılışta: antrenman 3 saatten uzun süredir hareketsiz açıksa sor (bilgi kutusu yok, düz pencere) */
function unutulanKontrol() {
  var a = S.active; if (!a) return;
  var son = sonHareket(a); if (Date.now() - son < 3 * 36e5) return;
  var n = a.exs.reduce(function (t, e) { return t + tumSetler(e).length; }, 0);
  var gun = a.date !== iso(new Date()) ? tarih(a.date, 1) + ' ' : '';
  sheet('<h3>Antrenman açık kaldı</h3><p class="mut">' + h(a.name) + ' · ' + gun + saat(a.start) + '\'te başladı' + (son > a.start ? ', son set ' + saat(son) : '') + ' · ' + n + ' set</p>' +
    '<div class="yigin">' + (n ? '<button class="btn-ac btn-big" data-act="bitir">Bitir ve kaydet</button>' : '') +
    '<button class="btn-big" data-act="kapat">Devam et</button><button class="btn-big btn-ghost btn-bad" data-act="iptal-kesin">Kaydetmeden çık</button></div>');
}

/* ---------- dinlenme sayacı ---------- */
/* dinlenme sayacı çalışırken ekran kararmasın (Wake Lock). Sayaç bitince, geçilince ya da gizlenince bırakılır;
   sayfa arka plana gidince tarayıcı kendisi bırakır, geri gelince sayaç sürüyorsa yeniden istenir. Destek yoksa sessiz. */
var uyanik = null, uyanikIste = false, uyanikBekle = false;
function uyanikTut(ac) {
  uyanikIste = ac;
  if (!navigator.wakeLock) return;
  if (ac && !uyanik && !uyanikBekle && document.visibilityState === 'visible') {
    uyanikBekle = true;
    navigator.wakeLock.request('screen').then(function (l) {
      uyanikBekle = false;
      if (!uyanikIste) { l.release().catch(function () {}); return; }
      uyanik = l; l.addEventListener('release', function () { if (uyanik === l) uyanik = null; });
    }, function () { uyanikBekle = false; });
  } else if (!ac && uyanik) { var l = uyanik; uyanik = null; l.release().catch(function () {}); }
}
function uyanikKontrol() { var r = $('#rest'); uyanikTut(!!r && !r.hidden && !!S.active && Date.now() < restBitis + ASIM_UZUN); }   /* aşım sayarken de açık (d10) */
document.addEventListener('visibilitychange', uyanikKontrol);
setInterval(uyanikKontrol, 5000);   /* bitir/iptal gibi sayacı gizleyen her yol için */

/* ✓ sonrası yeniden çiz; biten hareket kartı katlanınca dokunulan set parmağın altından kaymasın (kaydırmayı düzelt) */
function yerindeCiz(d) {
  if (sahneModu()) return render();   /* sahnede dev set yerinde kalır; sayfayı kaydırma */
  var sec = '[data-act=tamam][data-e="' + d.e + '"][data-s="' + d.s + '"]', kart = 'section.ex[data-e="' + d.e + '"]';
  var b = $(sec), y0 = b ? b.getBoundingClientRect().top : null, k = $(kart), k0 = k ? k.getBoundingClientRect().top : null;
  render();
  /* düğme görünürse onu, hareket katlandıysa (düğme gizli) kartın üstünü yerinde tut: sıradaki hareket hemen altına gelir */
  var b2 = y0 == null ? null : $(sec), k2 = k0 == null ? null : $(kart), dy = null;
  if (b2 && b2.offsetParent) dy = b2.getBoundingClientRect().top - y0;
  else if (k2) dy = k2.getBoundingClientRect().top - k0;
  if (dy != null && Math.abs(dy) > 1) window.scrollBy(0, dy);
}
function restBasla(sn) {
  restBitis = Date.now() + sn * 1000; restSure = sn * 1000; $('#rest').hidden = false; restCiz();
  clearInterval(restTimer); restTimer = setInterval(restCiz, 250);
}
/* ince halka: kalan süre oranı (pathLength 100). Akış CSS animasyonuyla (rest-akis-a/b): yalnız süre değişince
   (başla, −15/+15) o anki orandan sona kadar yeniden kurulur; arada JS halkaya dokunmaz. Az hareket isteyende adım adım. */
function restHalka(bitti) { return '<span class="halka' + (bitti ? ' bitti' : '') + '" aria-hidden="true"><svg viewBox="0 0 44 44"><circle class="iz" cx="22" cy="22" r="19"/><circle class="dolu" cx="22" cy="22" r="19" pathLength="100"/></svg>' + (bitti ? IKON_TIK : '') + '</span>'; }
/* d10: süre bitince sayaç kapanmaz, aşımı sayar ("+0:45"; zaman damgasından, arka plandan dönünce de doğru). Sıradaki set ✓,
   Tamam/Geç ya da antrenmanın bitişi kapatır. Aşım 10 dk'yı geçince "Uzun ara" der, sayaç durur, ekran kilidi bırakılır (pil) */
var ASIM_UZUN = 10 * 60000;
function restCiz() {
  var r = $('#rest'), simdi = Date.now(), kalan = Math.ceil((restBitis - simdi) / 1000);
  if (r.hidden || !S.active) { clearInterval(restTimer); r.hidden = true; uyanikTut(false); sahneDinlen(null); return; }   /* iptal/bitir/eşitleme */
  uyanikTut(simdi < restBitis + ASIM_UZUN);
  if (kalan <= 0) return restAsim(r, simdi - restBitis);
  var kalanMs = restBitis - simdi, oran = Math.max(0, Math.min(1, kalanMs / Math.max(restSure, kalanMs, 1))), ad = restEgz || '';
  /* 250 ms'de bir yalnız sayı ve halka güncellenir; yapı hareket değişince ya da bitişten sonra kurulur */
  if (r.dataset.k !== 'say' || r.dataset.egz !== ad) {
    r.dataset.k = 'say'; r.dataset.egz = ad; r.classList.remove('uzun');
    r.innerHTML = restHalka(false) + '<span class="t"><small>Dinlenme' + (ad ? ' · ' + h(ad) : '') + '</small><span class="sn"></span></span><button data-act="rest-ekle" data-d="-15" aria-label="15 saniye azalt">−15</button><button data-act="rest-ekle" data-d="15" aria-label="15 saniye ekle">+15</button><button data-act="rest-kapat">Geç</button>';
  }
  var sn = r.querySelector('.sn'), c = r.querySelector('.dolu'), yz = Math.floor(kalan / 60) + ':' + p2(kalan % 60);
  if (sn.textContent !== yz) sn.textContent = yz;
  var ak = restBitis + '/' + restSure;
  if (c.dataset.a !== ak) {
    c.dataset.a = ak; c.style.setProperty('--o0', (100 - oran * 100).toFixed(2)); c.style.setProperty('--sure', kalanMs + 'ms');
    c.dataset.n = c.dataset.n === 'a' ? 'b' : 'a';   /* ad değişince tarayıcı animasyonu baştan başlatır */
  }
  if (azHareket.matches) c.style.strokeDashoffset = (100 - oran * 100).toFixed(2);
  /* son 10 sn: halka ve sayı kalan süre boyunca uyarı tonuna akar (geçiş süresi = kalan) */
  var son = kalan <= 10;
  if (r.classList.contains('son') !== son) { if (son) r.style.setProperty('--son-sure', Math.max(300, kalanMs) + 'ms'); r.classList.toggle('son', son); }
  sahneDinlen(oran, kalanMs, ak, son);   /* telefonda sahne kartlarının zemini de aynı sürede boşalır */
}
function restAsim(r, asim) {
  var uzun = asim >= ASIM_UZUN;
  if (r.dataset.k !== 'bitti') {   /* bitiş anı: yapı, nabız (CSS), ses ve titreşim yalnız bir kez */
    r.dataset.k = 'bitti'; r.classList.remove('son');
    r.innerHTML = restHalka(true) + '<span class="t"><small>Dinlenme bitti</small><span class="sn"></span></span><button class="btn-ac" data-act="rest-kapat">Tamam</button>';
    if (!uzun) {   /* 10 dk+ sonra dönüldüyse (kilit, arka plan) geç kalmış ses çalınmaz */
      /* titreşim yalnız kullanıcı sayfaya dokunduysa (yoksa tarayıcı engelleyip konsola uyarı yazar) */
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]);
      if (AT.restBitti) AT.restBitti();   /* pc.js: ses */
      if (AT.duyur) AT.duyur('Dinlenme bitti');
    }
    sahneDinlen(null);
  }
  var sn = r.querySelector('.sn'), s = Math.floor(asim / 1000), yz = uzun ? 'Uzun ara' : '+' + Math.floor(s / 60) + ':' + p2(s % 60);
  if (sn.textContent !== yz) sn.textContent = yz;
  r.classList.toggle('uzun', uzun);
  if (uzun) { clearInterval(restTimer); uyanikTut(false); }
}
/* kilitten / arka plandan dönünce aşım sayısı hemen doğru görünsün (aralık tıkını beklemeden) */
document.addEventListener('visibilitychange', function () { var r = $('#rest'); if (document.visibilityState === 'visible' && r && !r.hidden) restCiz(); });
var azHareket = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

/* ---------- işlemler ---------- */
var islem = {
  /* geçmişte antrenman varsa önce "hangisini tekrarlayalım" sayfası, yoksa doğrudan boş başla */
  basla: function () { if (S.active) return render(); if (sablonlar().length) baslaSheet(); else islem['basla-bos'](); },
  'basla-bos': function () {
    var n = bitenSeanslar().filter(function (s) { return !s.demo; }).length;
    S.active = { id: uid(), date: iso(new Date()), start: Date.now(), name: 'Antrenman ' + (n + 1), exs: [] }; kaydet(); kapat(); render(); egzSheet();
  },
  /* seçilen seansın hareketleri, aynı set sayısıyla, boş kutularla (soluk sayılar = geçen sefer) */
  'basla-tekrar': function (d) {
    var se = S.sessions.filter(function (s) { return s.id === d.id; })[0]; if (!se) return;
    var exs = se.exs.map(function (e) {
      var ts = tumSetler(e).slice(0, 10), sets = ts.map(function (x) { var y = { kg: '', reps: '', done: false }; if (x.tip) y.tip = x.tip; return y; });
      while (sets.length < 1 || (!ts.length && sets.length < 3)) sets.push({ kg: '', reps: '', done: false });
      return { ad: e.ad, kas: e.kas || kasOf(e.ad), sets: sets };
    });
    S.active = { id: uid(), date: iso(new Date()), start: Date.now(), name: sadeAd(se.name) || 'Antrenman', exs: exs };
    kaydet(); kapat(); window.scrollTo(0, 0); render(); toast(exs.length + ' hareket hazır');
  },
  'gecmis-hepsi': function () { gecmisHepsi = true; render(); },
  /* Kilo | Güç: iki sütun zaten çizili, yalnız sınıf değişir (5 yılda telefonda ~110 ms yeniden çizim yerine anında) */
  ilersek: function (d) {
    ilerSek = d.v === 'guc' ? 'guc' : 'kilo';
    var k = $('#view .duzen.ilerleme');
    if (!k) return render();
    k.classList.remove('sek-kilo', 'sek-guc'); k.classList.add('sek-' + ilerSek);
    Array.prototype.forEach.call(document.querySelectorAll('[data-act=ilersek]'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === ilerSek); });
  },
  'egz-ekle': egzSheet,
  'egz-sec-ekle': function (d) { ekle(d.ad); },
  'oz-ekle': function () {
    var ad = $('#ozad').value.trim(); if (!ad) return toast('Ad yaz');
    if (!tumEgz().some(function (x) { return x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'); })) S.ozel.push({ ad: ad, kas: $('#ozkas').value });
    ekle(ad);
  },
  'egz-sil': function (d) {
    var i = +d.e, x = S.active.exs.splice(i, 1)[0]; kaydet(); render();
    if (x) geriAl(x.ad + ' çıkarıldı', function () { if (S.active) S.active.exs.splice(Math.min(i, S.active.exs.length), 0, x); });
  },
  'geri-al': function () {
    var f = geriFn; geriFn = null;
    Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (x) { x.remove(); });
    if (f) { f(); kaydet(); render(); toast('Geri alındı'); }
  },
  'set-ekle': function (d) {
    var e = S.active.exs[+d.e], son = e.sets[e.sets.length - 1];
    var yeni = { kg: son ? son.kg : '', reps: son ? son.reps : '', done: false };
    if (S.rpe) yeni.rpe = '';   // RPE kopyalanmaz: her setin zorluğu ayrı girilir
    e.sets.push(yeni); kaydet(true); render();
  },
  tamam: function (d) {
    var e = S.active && S.active.exs[+d.e], s = e && e.sets[+d.s];
    if (!s) return render();   /* ekran eski: yeniden çiz */
    /* çift dokunuş: ✓ sonrası aynı yere sıradaki setin düğmesi gelir (ya da aynı ✓ geri alınır); 450 ms içindeki
       ikinci dokunuş yok sayılır. CSS kilidi "hareketi azalt"ta kalktığı için koruma burada (Codex incelemesi) */
    var simdi = Date.now(); if (simdi - tamamSon < 450) return; tamamSon = simdi;
    if (s.done) { s.done = false; delete s.t; kaydet(true); return yerindeCiz(d); }
    var wi = e.sets.slice(0, +d.s).filter(function (x) { return x.tip !== 'isinma'; }).length, p = s.tip === 'isinma' ? null : hedefPv(e.ad, oncekiSetler(e.ad), wi, e, +d.s);
    // ipucundan doldurma: Türkçe ondalık virgül (78,75); binlik ayıracı yok ki num() geri okuyabilsin
    if (s.kg === '' && p) s.kg = String(num(p.kg)).replace('.', ',');
    if (s.reps === '' && p) s.reps = String(num(p.reps));
    if (!(num(s.reps) > 0) || !(num(s.kg) >= 0)) return toast('kg ve tekrar gir');
    /* düzenleme penceresiyle aynı sınırlar: 8,5 tekrar ya da 1500 kg sahte rekor yazmasın */
    if (num(s.reps) % 1 || num(s.reps) > 200) return toast('Tekrar 1–200 arası tam sayı olmalı');
    if (num(s.kg) > 1000) return toast('kg 0–1000 arası olmalı');
    if (S.rpe && s.rpe != null && String(s.rpe).trim() !== '') {   // RPE isteğe bağlı; girildiyse 6–10, 0,5 adım
      var r = num(s.rpe);
      if (!(r >= 6 && r <= 10)) return toast('RPE 6–10 arası olmalı (boş bırakabilirsin)');
      s.rpe = fmt(Math.round(r * 2) / 2);
    }
    s.done = true; s.t = Date.now(); kaydet(true);   /* s.t: setin bittiği an (unutulan antrenmanın gerçek süresi için) */
    sonTik = { e: +d.e, s: +d.s, t: s.t }; yerindeCiz(d);   /* .yeni: ✓ animasyonu (CSS) */
    var rv = aktifRek[d.e + '|' + d.s];   /* render'da hesaplandı: bu set tahmini max rekoru (yıldız + parıltı ekranda) */
    if (rv) duyur('Yeni rekor: ' + e.ad + (aktifRek['t' + d.e + '|' + d.s] ? ', en çok tekrar ' + rv : ', tahmini max ~' + fmt(rv) + ' kg'));
    /* kısa dokunsal geri bildirim; destek ya da kullanıcı dokunuşu yoksa sessiz (tarayıcı uyarısı da çıkmasın) */
    try { var ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(10); } catch (er) { }
    /* odak sahnesi: hareketin son iş seti bittiyse kısa süre sonra sıradaki harekete kay */
    if (sahneModu() && s.tip !== 'isinma' && e.sets.every(function (x) { return x.done || x.tip === 'isinma'; })) sahneIlerle(+d.e);
    var hepsi = S.active.exs.every(function (x) { return x.sets.every(function (y) { return y.done; }); });
    if (hepsi) {   /* son set: dinlenme yok */ clearInterval(restTimer); $('#rest').hidden = true; sahneDinlen(null); return; }
    restEgz = e.ad; restBasla(dinlenmeOf(e.ad));
  },
  /* biten hareket kartını aç/kapat: yeniden çizmeden sınıf değişir, durum render sonrası korunur */
  'egz-katla': function (d) {
    var a = S.active, e = a && a.exs[+d.e], sec = $('section.ex[data-e="' + d.e + '"]'); if (!e || !sec) return render();
    var ac = sec.classList.contains('kapali');
    katlaDurum[katlaAnahtar(a, +d.e, e)] = ac; sec.classList.toggle('kapali', !ac);
    var b = sec.querySelector('.ex-katla'); if (b) b.setAttribute('aria-expanded', ac);
  },
  'set-tip': function (d) {
    var s = S.active.exs[+d.e].sets[+d.s], t = TIPLER[(TIPLER.indexOf(s.tip || '') + 1) % TIPLER.length];
    if (t) s.tip = t; else delete s.tip;
    kaydet(true); render();
  },
  rpe: function (d) { S.rpe = d.v === '1'; kaydet(); render(); },
  bitir: function () {
    var a = S.active, tamam = a.exs.reduce(function (t, e) { return t + tumSetler(e).length; }, 0);
    if (!tamam) return onayla('Tamamlanan set yok', 'Bu antrenman kaydedilmeyecek.', 'iptal-kesin', 'Antrenmanı at');
    a.exs.forEach(function (e) { e.sets = tumSetler(e); }); a.exs = a.exs.filter(function (e) { return e.sets.length; });
    a.name = String(a.name || '').trim() || 'Antrenman';
    /* açık unutulduysa (son setten 30 dk+ geçti) bitiş = son set + 2 dk; süre şişmesin */
    var sonSet = sonHareket(a), simdi = Date.now();
    a.end = sonSet > a.start && simdi - sonSet > 30 * 60000 ? sonSet + 2 * 60000 : simdi;
    S.sessions.push(a); S.active = null; kaydet();
    $('#rest').hidden = true; clearInterval(restTimer);
    var pr = prHesapla()[a.id], np = pr ? Object.keys(pr).length : 0;
    render();
    if (AT.seansOzet) AT.seansOzet(a);   /* ozet.js: bitiş özeti */
    else toast(np ? 'Kaydedildi · ' + np + ' yeni rekor!' : 'Antrenman kaydedildi');
  },
  iptal: function () { onayla('Kaydetmeden çıkılsın mı?', 'Bu antrenmanda yazdığın her şey silinir.', 'iptal-kesin', 'Evet, kaydetmeden çık'); },
  'iptal-kesin': function () { S.active = null; kaydet(); kapat(); $('#rest').hidden = true; render(); },
  kapat: kapat,
  seans: function (d) { seansSheet(d.id); },
  'seans-sil': function (d) {
    var x = S.sessions.filter(function (s) { return s.id === d.id; })[0]; if (!x) return kapat();
    S.sessions = S.sessions.filter(function (s) { return s.id !== d.id; }); kaydet(); kapat(); render();
    geriAl('Antrenman silindi', function () { if (!S.sessions.some(function (s) { return s.id === x.id; })) S.sessions.push(x); });
  },
  ay: function (d) { gecmisAy = new Date(gecmisAy.getFullYear(), gecmisAy.getMonth() + (+d.d), 1); render(); },
  'egz-sec': function (d) { secEgz = d.ad; render(); },
  tema: function (d) { S.tema = d.v; S.temaV = 4; kaydet(); temaGecis(); render(); },
  'tema-cevir': function () { var koyu = document.documentElement.dataset.theme === 'koyu'; islem.tema({ v: koyu ? 'acik' : 'koyu' }); },
  /* a12: yanlış tartı koruması. 824 → "82,4 mü?"; son tartıdan (14 gün içinde) 3 kg+ farkta onay. Kayıt yine kullanıcının */
  'bw-ekle': function () {
    var v = num($('#bwkg').value);
    if (v >= 400 && v < 4000 && v % 1 === 0) return tartiSor(Math.round(v) / 10, v + ' yazdın. ' + fmt(Math.round(v) / 10) + ' kg mı demek istedin?', fmt(Math.round(v) / 10) + ' kg kaydet');
    if (!(v > 20 && v < 400)) return toast('Geçerli bir kg gir');
    var st = sonTarti();
    if (st && Math.abs(v - st.kg) > 3) return tartiSor(v, 'Son tartın ' + fmt(st.kg) + ' kg idi (' + tarih(st.date, 1) + '). ' + fmt(Math.round(v * 10) / 10) + ' kg doğru mu?', 'Evet, kaydet');
    tartiKaydet(v);
  },
  'bw-ekle-kesin': function (d) { kapat(); tartiKaydet(num(d.v)); },
  'bw-geri': function () {
    var l = S.bw.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), x = l[l.length - 1]; if (!x) return;
    S.bw = S.bw.filter(function (b) { return b.id !== x.id; }); kaydet(); render();
    geriAl(fmt(x.kg) + ' kg kaydı silindi', function () { if (!S.bw.some(function (b) { return b.id === x.id; })) S.bw.push(x); });
  },
  'rest-ekle': function (d) {
    restBitis += (+d.d) * 1000; if (restBitis < Date.now() + 1000) restBitis = Date.now() + 1000;
    restSure = Math.max(1000, restSure + (+d.d) * 1000);
    if (restEgz) { (S.dinlenmeEgz = S.dinlenmeEgz || {})[restEgz] = Math.max(15, Math.min(900, Math.round(restSure / 5000) * 5)); kaydet(); }
    clearInterval(restTimer); restTimer = setInterval(restCiz, 250); restCiz();
  },
  'din-egz-sil': function () { delete S.dinlenmeEgz; kaydet(); render(); toast('Hareketlere özel süreler silindi'); },
  'rest-kapat': function () { clearInterval(restTimer); $('#rest').hidden = true; uyanikTut(false); sahneDinlen(null); },
  /* hareket şeridi: telefonda o sahneye kayar; PC'de o karta (biten kart katlıysa açılır) */
  'sahne-git': function (d) {
    var i = +d.e;
    if (sahneModu()) return sahneGit(i, true);
    var sec = $('section.ex[data-e="' + i + '"]'); if (!sec) return;
    if (sec.classList.contains('kapali')) islem['egz-katla']({ e: d.e });
    sec.scrollIntoView({ behavior: azHareket.matches ? 'auto' : 'smooth', block: 'start' });
  },
  disa: function () { indir(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), 'agirlik-yedek-' + iso(new Date()) + '.json'); toast('Yedek indirildi'); },
  ice: function () { $('#dosya').click(); },
  'ice-kesin': function () { S = pendingImport; pendingImport = null; kaydet(); kapat(); temaUygula(); render(); toast('İçe aktarıldı'); },
  'demo-yukle': function () { var d = demoUret(); S.sessions = S.sessions.concat(d.sessions); S.bw = S.bw.concat(d.bw); S.kcal = (S.kcal || []).concat(d.kcal.filter(function (k) { return !(S.kcal || []).some(function (x) { return x.date === k.date; }); })); if (d.bulk && !S.bulk) S.bulk = d.bulk; kaydet(); render(); toast('Örnek veri yüklendi'); },
  'demo-sil': function () { S.kcalOneri = null;   /* örnek veriden türeyen haftalık kalori önerisi gerçek hedefte kalmasın */
    S.sessions = S.sessions.filter(function (s) { return !s.demo; }); S.bw = S.bw.filter(function (b) { return !b.demo; }); S.kcal = (S.kcal || []).filter(function (k) { return !k.demo; }); if (S.bulk && S.bulk.demo) S.bulk = null; secEgz = null; kaydet(); render(); toast('Örnek veri silindi'); },
  'hepsini-sil': function () { onayla('Tüm veriler silinsin mi?', 'Antrenmanlar, kilo, kalori ve makrolar, takviyeler, defter notları, kilo hedefi, kendi eklediğin hareketler ve ayarlar kalıcı olarak silinir. Önce yedek almanı öneririm.', 'hepsini-kesin', 'Evet, hepsini sil'); },
  'hepsini-kesin': function () { S = bos(); kaydet(); secEgz = null; kapat(); temaUygula(); $('#rest').hidden = true; render(); toast('Tüm veriler silindi'); }
};
var pendingImport = null;

function indir(blob, ad) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function ekle(ad) {
  var a = S.active; if (!a) return;
  var son = oncekiSetler(ad), n = Math.max(3, Math.min(son.length || 3, 6)), sets = [];
  for (var i = 0; i < n; i++) sets.push({ kg: '', reps: '', done: false });
  a.exs.push({ ad: ad, kas: kasOf(ad), sets: sets }); sahne.i = a.exs.length - 1; kaydet(); kapat(); render();   /* telefonda yeni hareketin sahnesi */
  if (masaustu()) odakla('input[data-e="' + (a.exs.length - 1) + '"][data-s="0"][data-f="kg"]');
}

function iceAl(ev) {
  var f = ev.target.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    try {
      var j = JSON.parse(r.result);
      if (!j || !Array.isArray(j.sessions)) throw new Error('biçim');
      pendingImport = Object.assign(bos(), j);
      onayla('Yedek yüklensin mi?', j.sessions.length + ' antrenman ve ' + (j.bw || []).length + ' kilo kaydı içeriyor. Mevcut verinin yerine geçer.', 'ice-kesin', 'Yedeği yükle');
    } catch (e) { toast('Geçersiz yedek dosyası'); }
  };
  r.readAsText(f);
}

/* ---------- olaylar ---------- */
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act],[data-tab]'); if (!t) { if (ev.target.id === 'sheet') kapat(); return; }
  if (t.dataset.tab) return sekmeAc(t.dataset.tab, !ev.isTrusted);   /* komut.js gibi kod tıklaması: hemen (ardından gelen işlem yeni sekmeyi bulsun) */
  var f = islem[t.dataset.act]; if (f) f(t.dataset);
});
/* mini geçmişin açık/kapalı hâli her ✓ sonrası yeniden çizimde korunsun ('toggle' kabarcıklanmaz: yakalama) */
document.addEventListener('toggle', function (ev) {
  var d = ev.target; if (d.classList && d.classList.contains('mini-gecmis')) acikGecmis[d.dataset.ad] = d.open;
}, true);
document.addEventListener('input', function (ev) {
  var t = ev.target; if (t.id === 'din') { var n = parseInt(t.value, 10); if (n >= 10 && n <= 900) { S.dinlenme = n; kaydet(); } return; }
  if (t.id === 'seansnot' && S.active) { S.active.not = t.value; kaydet(true); return; }
  if (t.id === 'seansad' && S.active) { S.active.name = t.value.slice(0, 60); kaydet(true); return; }
  if (t.dataset.f && S.active) {
    var ex = S.active.exs[+t.dataset.e], st = ex && ex.sets[+t.dataset.s];
    if (!st) return render();   /* ekran eski (eşitleme değiştirdi): yazma, yeniden çiz */
    st[t.dataset.f] = t.value; kaydet(true);
  }
});
document.addEventListener('change', function (ev) {
  if (ev.target.id === 'egzsec') { secEgz = ev.target.value; render(); var g = $('#egzsec'); if (g) g.focus(); }
});
/* ---------- klavye (PC) ----------
   1–6 sekme · N antrenman başlat / hareket ekle · ? kısayollar · Esc kapat
   set satırında Enter: kg → tekrar → (RPE) → seti tamamla, sonraki setin kg'sine geç */
var SEKME = { '1': 'bugun', '2': 'gecmis', '3': 'ilerleme', '4': 'defter', '5': 'takviye', '6': 'ayarlar' };
/* hemen: geçişsiz (kod tıklaması, N). Geçiş çizimi bir kare sonra çalışır; arada başka sekme seçildiyse sonuncusu kazanır */
var sekmeHedef = null;
function sekmeAc(t, hemen) {
  sekmeHedef = t;
  sekmeGecis(t, hemen, function () {
    tab = sekmeHedef; render(); window.scrollTo(0, 0);
    /* erişilebilirlik: ekran okuyucu yeni sayfayı duysun; başlık sekmeyi söylesin */
    var b = $('#tabs [data-tab="' + tab + '"]'); document.title = (b ? b.textContent.trim() + ' · ' : '') + 'Ağırlık Takip';
    $('#view').focus({ preventScroll: true });
  });
}
function yaziyor(t) { return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
function odakla(sel) { var e = $(sel); if (e) { e.focus(); if (e.select) e.select(); } return e; }
function setEnter(t) {
  var e = +t.dataset.e, s = +t.dataset.s, ins = t.closest('.setgrid').querySelectorAll('input'), i = Array.prototype.indexOf.call(ins, t);
  if (i < ins.length - 1) return odakla('input[data-e="' + e + '"][data-s="' + s + '"][data-f="' + ins[i + 1].dataset.f + '"]');
  var ex = S.active && S.active.exs[e]; if (!ex || !ex.sets[s]) return render();
  if (!ex.sets[s].done) islem.tamam({ e: String(e), s: String(s) });
  if (!S.active || !S.active.exs[e] || !S.active.exs[e].sets[s] || !S.active.exs[e].sets[s].done) return odakla('input[data-e="' + e + '"][data-s="' + s + '"][data-f="' + t.dataset.f + '"]');
  var son = $('input[data-e="' + e + '"][data-s="' + (s + 1) + '"][data-f="kg"]');
  if (son && son.offsetParent) return odakla('input[data-e="' + e + '"][data-s="' + (s + 1) + '"][data-f="kg"]');
  /* hareket bitip katlandıysa sıradaki setin kg'sine (sonraki hareket); yoksa "+ Set ekle" */
  var ad = $('.addset[data-e="' + e + '"]');
  if (!(ad && ad.offsetParent) && odakla('.setgrid.siradaki input[data-f="kg"]')) return;
  odakla('.addset[data-e="' + e + '"]');
}
function kisayolSheet() {
  var l = [['1 – 6', 'Bugün · Geçmiş · İlerleme · Defter · Takviye · Ayarlar'], ['N', 'Antrenmanı başlat / hareket ekle'], ['Enter', 'Set satırında: kg → tekrar → seti tamamla'],
    ['Enter', 'Egzersiz aramada: ilk sonucu ekle'], ['Enter', 'Kilo ya da kalori alanında: kaydet'], ['Ctrl + Enter', 'Defterde: notu kaydet'], ['Ctrl + K', 'Hızlı komut: 82,4 · +650 · bench · özet'], ['Esc', 'Pencereyi kapat'], ['?', 'Bu liste']];
  sheet('<h3>Klavye kısayolları</h3><p class="mut">Bilgisayarda daha hızlı kayıt için.</p><dl class="kv">' + l.map(function (x) { return '<div><dt>' + h(x[1]) + '</dt><dd><kbd>' + h(x[0]) + '</kbd></dd></div>'; }).join('') +
    '</dl><div class="yigin" style="margin-top:18px"><button class="btn-big" data-act="kapat">Kapat</button></div>');
}
islem.kisayol = kisayolSheet;
document.addEventListener('keydown', function (ev) {
  var t = ev.target, acik = !$('#sheet').hidden;
  if (ev.key === 'Escape' && acik) return kapat();
  if (ev.key === 'Enter' && !ev.isComposing) {
    if (t.dataset && t.dataset.f && t.dataset.e != null && S.active) { ev.preventDefault(); return setEnter(t); }
    if (t.id === 'bwkg') { ev.preventDefault(); return islem['bw-ekle'](); }
    if (t.id === 'kcalgir' && islem['kcal-ekle']) { ev.preventDefault(); return islem['kcal-ekle'](); }
    if (t.id === 'egzara') { var ilk = $('#egzliste [data-act="egz-sec-ekle"]'); if (ilk && !$('#egzliste').hidden) { ev.preventDefault(); ekle(ilk.dataset.ad); } return; }
  }
  if (acik || ev.ctrlKey || ev.metaKey || ev.altKey || yaziyor(t)) return;
  if (SEKME[ev.key]) { ev.preventDefault(); return sekmeAc(SEKME[ev.key]); }
  if (ev.key === 'n' || ev.key === 'N') {
    ev.preventDefault(); if (tab !== 'bugun') sekmeAc('bugun', true);
    if (S.active) return egzSheet();
    var sr = siradaki(); return sr ? islem['basla-tekrar']({ id: sr.id }) : islem.basla();
  }
  if (ev.key === '?') { ev.preventDefault(); kisayolSheet(); }
});

/* setdil.js (doğal dille set): setler süren antrenmana bitmiş (✓) olarak yazılır; aynı tipte boş bekleyen set satırı varsa
   o dolar, yoksa sona eklenir. Rekor duyurusu ve dinlenme sayacı ✓ akışıyla aynı. tam: antrenman yeni kurulduysa tam kayıt */
function aktifSetEkle(ad, sets, tam) {
  var a = S.active; if (!a || !sets.length) return -1;
  var ei = -1; a.exs.forEach(function (e, i) { if (e.ad === ad) ei = i; });
  if (ei < 0) { a.exs.push({ ad: ad, kas: kasOf(ad), sets: [] }); ei = a.exs.length - 1; }
  var e = a.exs[ei], t = Date.now(), yer = [];
  sets.forEach(function (x, k) {
    var y = { kg: String(x.kg).replace('.', ','), reps: String(x.reps), done: true, t: t + k }, i = -1;
    if (x.tip) y.tip = x.tip;
    e.sets.forEach(function (s, j) { if (i < 0 && !s.done && String(s.kg).trim() === '' && String(s.reps).trim() === '' && (s.tip || '') === (y.tip || '')) i = j; });
    if (i < 0) { e.sets.push(y); i = e.sets.length - 1; } else e.sets[i] = y;
    yer.push(i);
  });
  sahne.i = ei; kaydet(tam ? undefined : true); render();
  yer.forEach(function (si) { var rv = aktifRek[ei + '|' + si]; if (rv) duyur('Yeni rekor: ' + ad + (aktifRek['t' + ei + '|' + si] ? ', en çok tekrar ' + rv : ', tahmini max ~' + fmt(rv) + ' kg')); });
  if (a.exs.every(function (x) { return x.sets.every(function (y) { return y.done; }); })) { clearInterval(restTimer); $('#rest').hidden = true; sahneDinlen(null); }
  else if (sets.some(function (x) { return x.tip !== 'isinma'; })) { restEgz = ad; restBasla(dinlenmeOf(ad)); }
  return ei;
}

/* ---------- modül arayüzü ----------
   bulk.js, notlar.js, disa.js bu nesneye kayıt olur (index.html'de app.js'ten sonra yüklenir).
   AT.bolum.<ad>() -> HTML döndürür, AT.islem['eylem'] = function (dataset) {} -> data-act tıklaması. */
var AT = window.AT = {
  islem: islem, bolum: {}, KAS: KAS, AYLAR: AYLAR, p2: p2, iso: iso, parse: parse, h: h, num: num, fmt: fmt, tarih: tarih, uid: uid,
  e1rm: e1rm, tahminiMax: tahminiMax, MAX_TEKRAR: MAX_TEKRAR, haftaBasi: haftaBasi, $: $, kaydet: kaydet, render: render, toast: toast, sheet: sheet, kapat: kapat, onayla: onayla,
  bitenSeanslar: bitenSeanslar, yapilanSetler: yapilanSetler, tumSetler: tumSetler, hacim: hacim, seansHacim: seansHacim, kasOf: kasOf, ikincilOf: ikincilOf, prHesapla: prHesapla,
  cizgi: cizgi, cubuk: cubuk, sayData: sayData, indir: indir, bos: bosDurum, duyur: duyur, geriAl: geriAl, kol: kol, masaustu: masaustu,
  aktifSetEkle: aktifSetEkle, halkaVeri: halkaVeri, sonTarti: sonTarti, tartiKaydet: tartiKaydet, dinlenmeOf: dinlenmeOf
};
Object.defineProperty(AT, 'S', { get: function () { return S; } });
AT.surum = function () { return surum; };   /* önbellek anahtarı (notlar.js, bulk.js) */
/* esitle.js: öbür cihazdan birleşen durumu uygula (tema gibi cihaza özel alanlar x içinde zaten bu cihazınki) */
/* süren antrenmanın yapısı (hareket adları ve set sayıları): eşitleme bunu değiştirirse ekrandaki data-e/data-s indeksleri eskir */
function aktifImza(x) { var a = x && x.active; return a ? a.id + '|' + a.exs.map(function (e) { return e.ad + ':' + e.sets.length; }).join(',') : ''; }
AT.yeniDurum = function (x) {
  var once = aktifImza(S);
  S = Object.assign(bos(), x); kaydet(); temaUygula();
  /* yazarken ekranı yenileme (odak kaybolmasın); ama antrenmanın yapısı değiştiyse yine çiz, yoksa değer yanlış harekete yazılır */
  if (!yaziyor(document.activeElement) || aktifImza(S) !== once) render();
};

document.addEventListener('DOMContentLoaded', function () {
  yukle(); temaUygula(); render(); unutulanKontrol();
  /* kalıcı depolama: tarayıcı yer açarken bu sitenin verisini silmesin (Chrome/Edge sessizce verir) */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () {});
});
var sonW = 0;
window.addEventListener('resize', function () { clearTimeout(tickT); tickT = setTimeout(function () { var w = grafikW(); if (w !== sonW) { sonW = w; if (tab === 'ilerleme' && !yaziyor(document.activeElement)) render(); } }, 150); });
/* antrenman açıkken PC ↔ telefon eşiği geçilirse liste ↔ sahne düzeni yeniden kurulur (yazarken değil) */
if (window.matchMedia) matchMedia('(min-width:1024px)').addEventListener('change', function () { if (tab === 'bugun' && S.active && !yaziyor(document.activeElement)) render(); });
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', temaUygula);
setInterval(function () { if (S.active) Array.prototype.forEach.call(document.querySelectorAll('#gecen,[data-gecen]'), function (g) { g.textContent = gecenSure(S.active.start); }); }, 30000);
setInterval(function () { if (tab === 'bugun' && S.active) setVurgu(); }, 10000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
