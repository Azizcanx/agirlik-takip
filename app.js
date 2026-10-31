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
function bos() { return { v: 1, sessions: [], bw: [], kcal: [], takviye: { liste: [], alinan: {} }, defter: [], ozel: [], active: null, dinlenme: 90, tema: 'koyu', temaV: 2, bulk: null }; }
function yukle() {
  try { var r = localStorage.getItem(KEY); S = r ? Object.assign(bos(), { temaV: 0 }, JSON.parse(r)) : bos(); } catch (e) { S = bos(); }
  /* tek seferlik: eski varsayılan açık temadan koyuya (Aziz: "açık çok göz alıyor"); sonra seçim kullanıcının */
  if (!S.temaV) { if (S.tema === 'acik') S.tema = 'koyu'; S.temaV = 2; }
  /* süren antrenmanın son hâli ayrı anahtardaysa (kaydet(true)) onu al; antrenman bittiyse eski kopya yok sayılır */
  try { var a = JSON.parse(localStorage.getItem(KEY_AKTIF) || 'null'); if (a && S.active && a.id === S.active.id) S.active = a; } catch (e) { }
}
/* kaydet(true): yalnız süren antrenman değişti (set kutusu, ✓, set ekle/tipi, ad, not). Bütün veriyi yeniden yazmak yerine
   ~2 KB'lık S.active ayrı anahtara yazılır; eşitleme tetiklenmez (antrenman bitince tam kayıt). 5 yıllık veride telefonda
   ✓ ~130 ms'den ~20 ms'ye iner. Tam kayıt bu anahtarı siler; yukle() aynı antrenmansa onu okur. */
var KEY_AKTIF = KEY + '-aktif';
function kaydet(aktif) {
  if (aktif === true && S.active) { try { localStorage.setItem(KEY_AKTIF, JSON.stringify(S.active)); return; } catch (e) { /* tam kayda düş */ } }
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
  if (hd && hd.kg > 0 && hd.tekrar > 0) {
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

/* PR: her egzersiz için kronolojik koşan en iyi; ilk seans referans (rozet yok) */
function prHesapla() {
  var en = {}, map = {};
  bitenSeanslar().forEach(function (se) {
    se.exs.forEach(function (e) {
      var sets = yapilanSetler(e); if (!sets.length) return;
      var b = en[e.ad], m1 = 0, m1s = null, mk = 0;
      sets.forEach(function (s) { var v = tahminiMax(num(s.kg), num(s.reps), s.rpe); if (v > m1) { m1 = v; m1s = s; } mk = Math.max(mk, num(s.kg)); });
      if (b) {
        var t = [];
        if (m1 > b.e1 + 0.05) t.push({ ad: 'Tahmini max', yeni: m1, fark: m1 - b.e1, set: m1s });
        if (mk > b.kg + 0.05) t.push({ ad: 'En ağır', yeni: mk, fark: mk - b.kg });
        if (t.length) (map[se.id] = map[se.id] || {})[e.ad] = t;
      }
      en[e.ad] = { e1: Math.max(b ? b.e1 : 0, m1), kg: Math.max(b ? b.kg : 0, mk) };
    });
  });
  return map;
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
        var sets = []; for (var i = 0; i < 3 + (rnd() > .7 ? 1 : 0); i++) {
          var tekrar = Math.max(3, p[3] - (i > 0 ? Math.round(rnd() * 2 + (i - 1)) : 0));
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
       ham: true → ham tartılar soluk nokta (tek path; 200 noktaya kadar), ek: function (p) → dokunma etiketinin 3. satırı}
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
  var hamVar = o.ham && n <= 200, T = ref.length > 1 || hamVar ? 34 : 14;
  var mn = Infinity, mx = -Infinity, x0 = Infinity, x1 = -Infinity;
  function kap(p, y) { if (y < mn) mn = y; if (y > mx) mx = y; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
  pts.forEach(function (p) { kap(p, p.y); if (hamVar && p.ham > 0) kap(p, p.ham); });
  ref.forEach(function (p) { kap(p, p.y); });
  var st = adim(mx - mn > 0 ? mx - mn : Math.max(1, Math.abs(mx) * .05), 4);
  var y0 = Math.floor(mn / st + 1e-9) * st, y1 = Math.ceil(mx / st - 1e-9) * st;
  if (y1 - y0 < st * 2) { y0 -= st; y1 += st; }
  if (mn >= 0 && y0 < 0) { y0 = 0; }
  var dc = ondalik(st), et = [];
  for (var v = y0, k = 0; v <= y1 + st * 1e-6 && k < 12; v += st, k++) et.push([v, fmt(v, dc)]);
  /* sol boşluk en uzun eksen yazısına göre (12px tabular ~7px/karakter) */
  var L = Math.max(30, 14 + 7 * Math.max.apply(0, et.map(function (e) { return e[1].length; })));
  var yil = x1 - x0 > 300 * 864e5;
  function X(x) { return x1 === x0 ? (L + W - R) / 2 : L + (x - x0) / (x1 - x0) * (W - L - R); }
  function Y(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
  /* ekran okuyucu özeti: "Ortalama kilo, son 82,4 kg, 12 haftada +1,8 kg" (nokta <title>'ları role=img içinde okunmaz) */
  var fk = pts[n - 1].y - pts[0].y, gun = Math.round((pts[n - 1].x - pts[0].x) / 864e5);
  var ozet = (o.baslik || 'Grafik') + ', son ' + fmt(pts[n - 1].y) + bir + (n > 1 && gun > 0 ? ', ' + (gun >= 14 ? Math.round(gun / 7) + ' haftada ' : gun + ' günde ') + (fk > 0 ? '+' : fk < 0 ? '−' : '±') + fmt(Math.abs(fk)) + bir : '') + '. Ok tuşlarıyla noktalar gezilir.';
  var s = '<svg class="chart cizgi" data-g="' + id + '" tabindex="0" width="' + W + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(ozet) + '"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity=".22"/><stop offset=".55" stop-opacity=".07"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>';
  et.forEach(function (e) {
    var y = Math.round(Y(e[0])) + .5;
    s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + e[1] + '</text>';
  });
  /* piksel konumları bir kez hesaplanır (path, noktalar ve dokunma aynı diziyi kullanır) */
  var px = new Array(n), py = new Array(n), d = new Array(n);
  for (var i = 0; i < n; i++) { px[i] = Math.round(X(pts[i].x) * 10) / 10; py[i] = Math.round(Y(pts[i].y) * 10) / 10; d[i] = (i ? 'L' : 'M') + px[i] + ' ' + py[i]; }
  d = d.join(' ');
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
  if (T > 14) {   /* açıklama satırı: çizginin üstünde kendi şeridinde, hiçbir şeyle çakışmaz */
    lejant('ln', o.seriAd || 'değer');
    if (hamVar) lejant('ham', 'tartı');
    if (ref.length > 1 && o.refAd !== false) lejant('ref', o.refAd || 'Hedef');
  }
  s += '<path class="ln" pathLength="1" d="' + d + '"/>';
  var son = n - 1;
  for (i = 0; i < n; i++) {
    var tt = '<title>' + h(pts[i].t) + ': ' + fmt(pts[i].y) + h(bir) + '</title>';
    if (i === son) s += '<circle class="hale" cx="' + px[i] + '" cy="' + py[i] + '" r="9"/><circle class="dot son" cx="' + px[i] + '" cy="' + py[i] + '" r="4.5">' + tt + '</circle>';
    else if (n <= 20) s += '<circle class="dot" cx="' + px[i] + '" cy="' + py[i] + '" r="3">' + tt + '</circle>';
    else s += '<circle class="hit" cx="' + px[i] + '" cy="' + py[i] + '" r="7">' + tt + '</circle>';
  }
  /* son değer etiketi: çizginin geldiği yönün tersinde (yükselen çizgide üstte) */
  var sv = fmt(pts[son].y) + bir, sw = 7 * sv.length + 16, onc = py[Math.max(0, son - Math.max(1, Math.round(n / 12)))];
  var ust = n < 2 || onc >= py[son]; if (ust && py[son] - 30 < 2) ust = false; if (!ust && py[son] + 30 > H - B) ust = true;
  var sx = Math.max(L, Math.min(W - 2 - sw, px[son] - sw / 2)), sy = ust ? py[son] - 30 : py[son] + 10;
  s += '<g class="sonet"><rect x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="' + sw + '" height="20" rx="10"/><text x="' + (sx + sw / 2).toFixed(1) + '" y="' + (sy + 14).toFixed(1) + '" text-anchor="middle">' + h(sv) + '</text></g>';
  var ix = etiketIdx(n, Math.floor((W - L) / (yil ? 96 : 84)) + 1);
  ix.forEach(function (j) { var tx = px[j]; s += '<text x="' + tx + '" y="' + (H - 6) + '" text-anchor="' + (tx < L + 30 ? 'start' : tx > W - R - 30 ? 'end' : 'middle') + '">' + h(yil ? eksenTarih(pts[j].x, true) : pts[j].t) + '</text>'; });
  GV[id] = { tur: 'c', W: W, T: T, A: H - B, px: px, py: py, pts: pts, bir: bir, ref: ref.length > 1 ? ref.map(function (p) { return [X(p.x), p.y]; }) : null, refAd: o.refAd || 'hedef', ek: o.ek };
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
    if (ix.indexOf(i) >= 0) s += '<text x="' + (x + bw * .3).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? 'start' : i === son ? 'end' : 'middle') + '"' + (i === 0 ? ' dx="' + (-bw * .3).toFixed(1) + '"' : i === son ? ' dx="' + (bw * .3).toFixed(1) + '"' : '') + '>' + h(it.l) + '</text>';
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
    '<li><b>Kilonu yaz</b><span>Sabah aç karnına tartıl, aşağıdaki kutuya gir. İstersen gün içinde yediğin kaloriyi de yaz; 2 hafta sonra günlük harcamanı hesaplarım.</span></li>' +
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
function vBugun() {
  var a = S.active, o = '';
  if (!a) {
    var son = bitenSeanslar().filter(function (x) { return !x.demo; }).pop() || bitenSeanslar().pop(), hic = !S.sessions.length && !S.bw.length;
    o += '<h1>Bugün</h1><p class="sub">' + tarih(iso(new Date())) + '</p>';
    var sr = siradaki();
    var a1 = (hic ? ilkAdimlar() : '') + (sr
      ? '<button class="btn-ac btn-big btn-sira" data-act="basla-tekrar" data-id="' + h(sr.id) + '"><span>Sıradaki: ' + h(sadeAd(sr.name)) + '<kbd>N</kbd></span><small>' + h(hareketOnizle(sr)) + '</small></button><button class="btn-ghost mini basla-baska" data-act="basla">Başka antrenman seç</button>'
      : '<button class="btn-ac btn-big" data-act="basla">Antrenmana başla<kbd>N</kbd></button>') + sonGunSatir(son) + (AT.bolum.tarti ? AT.bolum.tarti() : '');
    var b1 = AT.bolum.notlar ? AT.bolum.notlar() : '';
    if (son) {
      b1 += '<h2>Son antrenman</h2><div class="panel liste">' + seansSatir(son, prHesapla()) + '</div>';
    } else if (hic) {
      b1 += '<p class="mut ipucu">Önce nasıl göründüğüne bakmak istersen: Ayarlar › Örnek veriyi yükle.</p>';
    } else {
      b1 += '<div class="empty">Henüz antrenman yok.</div>';
    }
    return o + kol(a1, b1);
  }
  var tamam = seansSetSayisi(a), topSet = a.exs.reduce(function (t, e) { return t + e.sets.filter(function (s) { return s.tip !== 'isinma'; }).length; }, 0);   /* ısınma sayılmaz */
  o += '<input id="seansad" class="baslik-input" value="' + h(a.name) + '" aria-label="Antrenmanın adı (değiştirebilirsin)" autocomplete="off">';
  o += '<p class="sub">Başladı ' + new Date(a.start).toTimeString().slice(0, 5) + ' · <span id="gecen">' + gecenSure(a.start) + '</span></p>';
  if (topSet) o += '<div class="ilerle"><div class="ibar"><i style="width:' + Math.round(tamam / topSet * 100) + '%"></i></div><span><b>' + tamam + '</b> / ' + topSet + ' set bitti</span></div>';
  var o0 = o; o = '';
  if (!a.exs.length) o += '<div class="empty">Henüz hareket yok.<br>Aşağıdan “+ Hareket ekle” ile başla.</div>';
  a.exs.forEach(function (e, ei) {
    var prev = oncekiSetler(e.ad);
    var exBitti = e.sets.length && e.sets.every(function (x) { return x.done; });
    o += '<section class="panel' + (exBitti ? ' ex-bitti' : '') + '"><div class="ex-head"><span class="grow"><b>' + h(e.ad) + '</b>' + (exBitti ? '<span class="ex-tik" aria-label="bitti">✓</span>' : '') + '<span class="tag">' + h(e.kas) + '</span></span>' +
      (AT.bolum.plakaDugme ? AT.bolum.plakaDugme(ei) : '') +
      '<button class="mini btn-ghost" data-act="egz-sil" data-e="' + ei + '" aria-label="Hareketi çıkar">Çıkar</button></div>';
    o += miniGecmis(e.ad);
    var rg = S.rpe ? ' rpe' : '';
    o += '<div class="setgrid' + rg + '"><span class="lbl">Set</span><span class="lbl">kg</span><span class="lbl">Tekrar</span>' + (S.rpe ? '<span class="lbl">Zorluk</span>' : '') + '<span class="lbl">Bitti</span></div>';
    var isNo = 0;
    e.sets.forEach(function (s, si) {
      var isin = s.tip === 'isinma', wi = isin ? -1 : isNo++, pv = isin ? null : hedefPv(e.ad, prev, wi, e, si);
      var etk = isin ? 'I' : String(wi + 1), ad = isin ? 'ısınma seti' : 'normal set';
      o += '<div class="setgrid' + (s.done ? ' is-done' : '') + rg + '"><button class="n' + (s.tip ? ' ' + s.tip : '') + '" data-act="set-tip" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + ': ' + ad + ' (dokun: tipini değiştir)" title="' + ad + '">' + etk + '</button>' +
        '<input inputmode="decimal" data-e="' + ei + '" data-s="' + si + '" data-f="kg" value="' + h(s.kg) + '" placeholder="' + (pv ? fmt(num(pv.kg), 2) : 'kg') + '" aria-label="' + h(e.ad) + ' set ' + (si + 1) + ' kg">' +
        '<input inputmode="numeric" data-e="' + ei + '" data-s="' + si + '" data-f="reps" value="' + h(s.reps) + '" placeholder="' + (pv ? h(pv.reps) : 'tekrar') + '" aria-label="' + h(e.ad) + ' set ' + (si + 1) + ' tekrar">' +
        (S.rpe ? '<input inputmode="decimal" data-e="' + ei + '" data-s="' + si + '" data-f="rpe" value="' + h(s.rpe) + '" placeholder="–" aria-label="' + h(e.ad) + ' set ' + (si + 1) + ' zorluk (RPE 6–10, boş bırakılabilir)">' : '') +
        '<button class="done' + (s.done ? ' on' : '') + '" data-act="tamam" data-e="' + ei + '" data-s="' + si + '" aria-label="Seti bitti olarak işaretle" aria-pressed="' + !!s.done + '">&#10003;</button></div>';
    });
    o += '<button class="addset" data-act="set-ekle" data-e="' + ei + '">+ Set ekle</button>';
    o += '</section>';
  });
  o += '<button class="btn-big" data-act="egz-ekle" style="margin:4px 0 22px">+ Hareket ekle<kbd>N</kbd></button>';
  var b2 = '<details class="katla seansnot"' + (a.not ? ' open' : '') + '><summary>Seans notu' + (a.not ? '' : ' ekle') + '</summary><textarea id="seansnot" rows="3" placeholder="Uyku, ağrı, nasıl hissettin…" aria-label="Seans notu">' + h(a.not || '') + '</textarea></details>';
  b2 += '<button class="btn-ac btn-big" data-act="bitir">Antrenmanı bitir ve kaydet</button>';
  b2 += '<button class="btn-ghost btn-bad btn-big" style="margin-top:8px;min-height:46px;font-size:15px" data-act="iptal">Kaydetmeden çık</button>';
  b2 += '<p class="kisaipucu">Enter: kg → tekrar → seti tamamla · <kbd>?</kbd> kısayollar</p>';
  return o0 + kol(o, b2, 'yan');
}

/* Geçmiş / Bugün ortak seans satırı */
function seansSatir(s, pr) {
  var np = pr && pr[s.id] ? Object.keys(pr[s.id]).length : 0;
  /* örnek seansın adı zaten "(örnek)" içeriyorsa etiketi tekrarlama */
  var demo = s.demo && !/örnek/i.test(s.name || '');
  return '<button class="satir" data-act="seans" data-id="' + h(s.id) + '"><span class="grow"><b>' + h(s.name || 'Antrenman') + '</b><span class="num">' + tarih(s.date, 1) + (s.date.slice(0, 4) !== String(new Date().getFullYear()) ? ' ' + s.date.slice(0, 4) : '') + ' · ' + seansSetSayisi(s) + ' set · ' + s.exs.length + ' hareket</span>' +
    (s.not ? '<span class="notkisa">' + h(String(s.not).replace(/\s+/g, ' ')) + '</span>' : '') + '</span>' +
    (np ? '<span class="rek">' + np + ' rekor</span>' : '') + (demo ? '<span class="tag demo">örnek</span>' : '') + '</button>';
}

/* son 7 günde kas grubu başına set; yatay çubuk */
function kasBolum(l) {
  var lim = new Date(); lim.setDate(lim.getDate() - 6); var limS = iso(lim), kasSet = {};
  KAS.forEach(function (k) { kasSet[k] = 0; });
  /* a10: ana kas 1, hareketin ikincil kasları (hareketler.js) set başına 0,5; gösterimde yuvarlanır */
  l.forEach(function (s) { if (s.date >= limS) s.exs.forEach(function (e) {
    var k = e.kas || kasOf(e.ad), n = yapilanSetler(e).length; if (!n) return;
    kasSet[k] = (kasSet[k] || 0) + n;
    ikincilOf(e.ad).forEach(function (y) { if (y !== k) kasSet[y] = (kasSet[y] || 0) + n * 0.5; });
  }); });
  var kasl = KAS.concat(Object.keys(kasSet).filter(function (k) { return KAS.indexOf(k) < 0 && kasSet[k]; }));
  var mxk = Math.max.apply(0, kasl.map(function (k) { return kasSet[k] || 0; })) || 1;
  return '<h2>Son 7 günde kaslar <small>· set sayısı, yardımcı kas yarım</small></h2><div class="panel"><div class="kasbar">' + kasl.map(function (k) {
    var n = Math.round(kasSet[k] || 0);
    return '<div' + (n ? '' : ' class="sifir"') + '><span>' + h(k) + '</span><div class="ibar"><i style="width:' + Math.round(n / mxk * 100) + '%"></i></div><b>' + n + '<small>set</small></b></div>';
  }).join('') + '</div><p class="mut kucuk">Kas başına haftada 10 ve üstü set iyi bir hedef. Soluk olanlar son 7 günde hiç çalışılmadı.</p></div>';
}

function vGecmis() {
  var bu = new Date(); if (!gecmisAy) gecmisAy = new Date(bu.getFullYear(), bu.getMonth(), 1);
  var y = gecmisAy.getFullYear(), m = gecmisAy.getMonth();
  var gunler = {}; S.sessions.forEach(function (s) { gunler[s.date] = true; });
  var o = '<h1>Geçmiş</h1>';
  var seri = haftaSerisi(), buAy = S.sessions.filter(function (s) { return s.date.slice(0, 7) === y + '-' + p2(m + 1); }).length;
  o += '<p class="sub">' + (seri > 1 ? seri + ' haftadır her hafta antrenman yaptın · ' : '') + 'toplam ' + S.sessions.length + ' antrenman' +
    (AT.bolum.haftalikDugme && S.sessions.length ? ' ' + AT.bolum.haftalikDugme() : '') + '</p>';   /* haftalik.js */
  var o0 = o; o = '';
  o += '<div class="panel"><div class="ayb"><button data-act="ay" data-d="-1" aria-label="Önceki ay">&lsaquo;</button><b>' + AYLAR[m] + ' ' + y + '</b><button data-act="ay" data-d="1" aria-label="Sonraki ay">&rsaquo;</button></div>';
  o += '<div class="cal">' + GUN.map(function (g) { return '<span class="h">' + g + '</span>'; }).join('');
  var ilk = (new Date(y, m, 1).getDay() + 6) % 7, say = new Date(y, m + 1, 0).getDate(), bi = iso(bu);
  for (var i = 0; i < ilk; i++) o += '<span class="pad"></span>';
  for (var d = 1; d <= say; d++) { var k = y + '-' + p2(m + 1) + '-' + p2(d); o += '<span class="' + (gunler[k] ? 'on' : '') + (k === bi ? ' today' : '') + '">' + d + '</span>'; }
  o += '</div><p class="mut kucuk takvim-not"><i class="nokta"></i>antrenman yaptığın gün</p></div>';
  if (S.sessions.length) o += kasBolum(bitenSeanslar());
  /* takvimde başka ay açıksa sayı o aya aittir: "· Eylül ayında 12" */
  var b = '<h2>Antrenmanlar <small>· ' + (y === bu.getFullYear() && m === bu.getMonth() ? 'bu ay ' : AYLAR[m] + ' ayında ') + buAy + '</small></h2>';
  var l = S.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.start || 0) - (a.start || 0); });
  if (!l.length) return o0 + kol(o, b + '<div class="empty">Kayıtlı antrenman yok.</div>', 'takvim');
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
  if (pts.length) {
    o += '<div class="panel"><div class="hero"><b>' + fmt(enE) + ' <small>kg</small></b><span>tahmini max: tek tekrarda kaldırabileceğin kilo · en iyisi ' + h(enET).replace(' ', '&nbsp;') + '</span></div>';
    if (fark > 0) o += '<p class="durum iyi">İlk kayıttan bu yana +' + fmt(fark) + ' kg güçlendin.</p>';
    o += cizgi(pts, { baslik: secEgz + ' tahmini max', birim: 'kg', ek: enIyiSet }) + '</div>';
  } else {
    o += '<p class="mut kucuk">Bu harekette ' + MAX_TEKRAR + ' tekrar ve altı set yok; tahmini max yalnız ' + MAX_TEKRAR + ' ve altı tekrardan hesaplanır.</p>';
  }
  o += '<div class="panel"><dl class="kv">' +
    '<div><dt>En ağır kaldırdığın</dt><dd>' + fmt(enAgir, 2) + ' kg<small>' + h(enAgirT) + '</small></dd></div>' +
    '<div><dt>En iyi set</dt><dd>' + (enSet.kg != null ? fmt(enSet.kg, 2) + ' kg × ' + enSet.r + '<small>' + h(enSet.t) + '</small>' : '–') + '</dd></div>' +
    '<div><dt>Bir seansta en çok</dt><dd>' + fmt(enHac, 0) + ' kg<small>' + h(enHacT) + '</small></dd></div></dl></div>';
  // haftalık toplam kaldırılan (bu hareket), son 12 hafta
  var hb = haftaBasi(iso(new Date())), hv = {};
  l.forEach(function (s) { s.exs.forEach(function (e) { if (e.ad === secEgz) hv[haftaBasi(s.date)] = (hv[haftaBasi(s.date)] || 0) + hacim(e); }); });
  var items = [], d = parse(hb); d.setDate(d.getDate() - 77);
  for (var i = 0; i < 12; i++) { items.push({ l: tarih(iso(d), 1), v: hv[iso(d)] || 0 }); d.setDate(d.getDate() + 7); }
  o += '<details class="katla"><summary>Haftalık toplam <small>son 12 hafta</small></summary><p class="mut kucuk">Her hafta bu harekette kaldırdığın toplam (kg × tekrar).</p>' + cubuk(items, { baslik: secEgz + ' haftalık toplam', birim: 'kg' }) + '</details>';
  // rekorlar
  var pr = prHesapla(), prs = [];
  l.forEach(function (s) { if (pr[s.id] && pr[s.id][secEgz]) prs.push({ s: s, t: pr[s.id][secEgz] }); });
  o += '<details class="katla"><summary>Rekorlar <small>' + prs.length + '</small></summary>';
  o += tekrarTablosu(secEgz, l, enE);   /* b1 */
  if (!prs.length) o += '<p class="mut kucuk">Bu harekette henüz yeni rekor yok (ilk seans başlangıç sayılır).</p>';
  else o += '<div class="liste">' + prs.slice(-8).reverse().map(prSatir).join('') + '</div>';
  return o + '</details>';
}
function vIlerleme() {
  var o = '<h1>İlerleme</h1>';
  var l = bitenSeanslar();
  var kartK = function () { return AT.bolum.kart ? AT.bolum.kart() : ''; };
  if (!l.length && !S.bw.length) return o + '<div class="empty">Antrenman ve tartı kaydettikçe grafikler burada oluşur.<br>Örneğe bakmak için: Ayarlar › Örnek veriyi yükle.</div>' + bwAlan();
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
      return '<div class="pr-l"><span class="k">' + h(t.ad) + (t.set ? '<small>' + fmt(num(t.set.kg), 2) + ' × ' + h(t.set.reps) + '</small>' : '') + '</span>' +
        '<b>' + fmt(t.yeni, kgOnd(t)) + ' kg</b><span class="up">+' + fmt(t.fark, kgOnd(t)) + '</span></div>';
    }).join('') + '</div></div>';
}

function bwBolum() {
  var l = S.bw.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var o = '<h2>Vücut ağırlığı</h2><div class="panel">';
  if (l.length) {
    var son = l[l.length - 1], ilk = l[0], fk = son.kg - ilk.kg;
    o += '<div class="hero"><b>' + fmt(son.kg) + ' <small>kg</small></b><span>' + tarih(son.date, 1) + (l.length > 1 ? ' · ilk kayda göre ' + (fk > 0 ? '+' : fk < 0 ? '−' : '') + fmt(Math.abs(fk)) + ' kg' : '') + (son.demo ? ' <span class="tag demo">örnek</span>' : '') + '</span></div>';
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
function vAyarlar() {
  var demoVar = S.sessions.some(function (s) { return s.demo; }) || S.bw.some(function (b) { return b.demo; }) || (S.kcal || []).some(function (k) { return k.demo; }) || (S.defter || []).some(function (n) { return n && n.demo; });
  var o0 = '<h1>Ayarlar</h1><p class="sub">' + (AT.esitBagli && AT.esitBagli() ? 'Kayıtların bu cihazda ve şifreli olarak GitHub\'daki gizli dosyanda durur.' : 'Kayıtların yalnız bu cihazda durur; internete gönderilmez.') + '</p>';
  /* yedek, otomatik yedek, eşitleme ve Excel tek grupta; ayrıntılar katlanır (durumları özet satırında) */
  var a0 = '<h2>Yedek ve eşitleme</h2><div class="panel liste">' +
    '<button class="satir" data-act="disa"><span class="grow"><b>Yedeği indir</b><span>Tüm kayıtlar tek dosyada; arada bir al</span></span></button>' +
    '<button class="satir" data-act="ice"><span class="grow"><b>Yedeği geri yükle</b><span>Şu anki verinin yerine geçer</span></span></button></div>' +
    '<input type="file" id="dosya" accept="application/json,.json" hidden>';
  if (AT.bolum.otoyedek) a0 += AT.bolum.otoyedek();
  if (AT.bolum.esitle) a0 += AT.bolum.esitle();   /* esitle.js: PC ↔ telefon */
  if (AT.bolum.disa) a0 += '<details class="katla"><summary>Excel ve diğer uygulamalar <small>Strong, Hevy</small></summary>' + AT.bolum.disa() + '</details>';
  var o = '<h2>Görünüm</h2><div class="seg" role="group" aria-label="Tema">' + [['sistem', 'Sistem'], ['acik', 'Açık'], ['koyu', 'Koyu']].map(function (t) {
    return '<button data-act="tema" data-v="' + t[0] + '" aria-pressed="' + ((S.tema || 'sistem') === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var dEgz = Object.keys(S.dinlenmeEgz || {});
  o += '<h2>Antrenman</h2><div class="panel"><label class="alan"><span>Setler arası dinlenme (saniye)</span><input id="din" inputmode="numeric" value="' + S.dinlenme + '"></label>' +
    (dEgz.length ? '<p class="din-egz">' + dEgz.map(function (k) { var v = S.dinlenmeEgz[k]; return h(k) + ' <b>' + Math.floor(v / 60) + ':' + p2(v % 60) + '</b>'; }).join(' · ') +
      ' <button class="btn-ghost mini" data-act="din-egz-sil">Sıfırla</button></p>' : '') +
    '<div class="alan"><span>Zorluk alanı (RPE): her sete 6–10 arası zorluk yazmak için</span><div class="seg" role="group" aria-label="Zorluk alanı">' + [[0, 'Kapalı'], [1, 'Açık']].map(function (t) {
      return '<button data-act="rpe" data-v="' + t[0] + '" aria-pressed="' + (!!S.rpe === !!t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<p class="mut kucuk alt-not">Bilmiyorsan kapalı bırak; öneriler yine çalışır.</p></div>' +
    (AT.bolum.ses ? AT.bolum.ses() : '') + '</div>';
  o += '<h2>Örnek veri</h2><div class="panel liste">' + (demoVar
    ? '<button class="satir bad" data-act="demo-sil"><span class="grow"><b>Örnek veriyi sil</b><span>Yalnız "örnek" etiketli kayıtlar gider</span></span></button>'
    : '<button class="satir" data-act="demo-yukle"><span class="grow"><b>Örnek veriyi yükle</b><span>Dolu hâlini görmek için 12 haftalık uydurma kayıt, "örnek" etiketli</span></span></button>') + '</div>';
  o += '<details class="katla"><summary>Bu kelimeler ne demek?</summary><dl class="sozluk">' + SOZLUK.map(function (x) { return '<dt>' + h(x[0]) + '</dt><dd>' + h(x[1]) + '</dd>'; }).join('') + '</dl></details>';
  o += '<h2>Veriyi sil</h2><div class="panel liste"><button class="satir bad" data-act="hepsini-sil"><span class="grow"><b>Tüm verileri sil</b><span>Antrenmanlar, kilo, kalori ve makrolar, takviyeler, defter notları, kilo hedefi ve ayarlar</span></span></button></div>';
  return o0 + kol(a0, o) + '<p class="altnot">Ağırlık Takip · internetsiz çalışır<span class="pc"> · kısayollar <kbd>?</kbd></span></p>';
}

function temaGecis() {
  var r = document.documentElement; r.classList.add('tema-gecis'); temaUygula();
  clearTimeout(temaGecis.t); temaGecis.t = setTimeout(function () { r.classList.remove('tema-gecis'); }, 450);
}
function temaUygula() {
  var r = document.documentElement;
  if (S.tema === 'acik' || S.tema === 'koyu') r.dataset.theme = S.tema; else delete r.dataset.theme;
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
  v.classList.toggle('giris', v.dataset.sekme !== tab); v.dataset.sekme = tab;   /* yalnız sekme değişince giriş animasyonu (style.css) */
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  var f = $('#dosya'); if (f) f.addEventListener('change', iceAl);
  if (tab === 'bugun') setVurgu();
}

/* ---------- sheet / toast ---------- */
function sheet(html) { var s = $('#sheet'); s.innerHTML = '<div class="in">' + html + '</div>'; s.hidden = false; }
function kapat() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
function toast(m, sure) {
  Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (x) { x.remove(); });
  geriFn = null;
  var t = document.createElement('div'); t.className = 'toast' + ($('#rest').hidden ? '' : ' yukari'); t.setAttribute('role', 'status'); t.textContent = m;
  document.body.appendChild(t); setTimeout(function () { t.remove(); if (t.geri && geriFn === t.geri) geriFn = null; }, sure || 2200);
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
function egzListele(q) {
  q = q.toLocaleLowerCase('tr'); var l = tumEgz().filter(function (x) { return (x.ad + ' ' + (x.tr || '')).toLocaleLowerCase('tr').indexOf(q) >= 0; }), el = $('#egzliste');
  el.hidden = !l.length; $('#egzyok').hidden = !!l.length;
  el.innerHTML = l.map(function (x) { return '<button class="satir arti" data-act="egz-sec-ekle" data-ad="' + h(x.ad) + '"><span class="grow"><b>' + h(x.ad) + '</b><span>' + h(x.kas) + '</span></span></button>'; }).join('');
}

function seansSheet(id) {
  var se = S.sessions.filter(function (s) { return s.id === id; })[0]; if (!se) return;
  var pr = prHesapla()[id] || {};
  var o = '<h3>' + h(se.name || 'Antrenman') + (se.demo && !/örnek/i.test(se.name || '') ? ' <span class="tag demo">örnek</span>' : '') + '</h3><p class="mut">' + tarih(se.date) + ' · ' + seansSetSayisi(se) + ' set · toplam ' + fmt(seansHacim(se), 0) + ' kg kaldırdın</p>';
  if (se.not) o += '<p class="seans-not">' + h(se.not) + '</p>';
  o += '<div class="panel liste">';
  se.exs.forEach(function (e) {
    var sets = yapilanSetler(e); if (!sets.length) return;
    o += '<div class="satir"><span class="grow"><b>' + h(e.ad) + '</b><span class="num">' + sets.map(function (s) { return fmt(num(s.kg), 2) + '×' + h(s.reps); }).join(' · ') + '</span>' +
      (pr[e.ad] ? '<span class="rek">Rekor · ' + pr[e.ad].map(function (t) { return h(t.ad) + ' ' + fmt(t.yeni, kgOnd(t)) + ' kg'; }).join(' · ') + '</span>' : '') + '</span>' +
      '<span class="deger">' + fmt(hacim(e), 0) + ' kg</span></div>';
  });
  o += '</div><div class="yigin" style="margin-top:18px"><button class="btn-big" data-act="kapat">Kapat</button>' +
    (islem['seans-duzenle'] ? '<button class="btn-big" data-act="seans-duzenle" data-id="' + h(id) + '">Düzenle</button>' : '') +   /* duzenle.js */
    '<button class="btn-big btn-ghost btn-bad" data-act="seans-sil" data-id="' + h(id) + '">Antrenmanı sil</button></div>';
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
function uyanikKontrol() { var r = $('#rest'); uyanikTut(!!r && !r.hidden && restBitis > Date.now()); }
document.addEventListener('visibilitychange', uyanikKontrol);
setInterval(uyanikKontrol, 5000);   /* bitir/iptal gibi sayacı gizleyen her yol için */

function restBasla(sn) {
  restBitis = Date.now() + sn * 1000; restSure = sn * 1000; $('#rest').hidden = false; restCiz();
  clearInterval(restTimer); restTimer = setInterval(restCiz, 250);
}
function restCiz() {
  var r = $('#rest'), kalan = Math.ceil((restBitis - Date.now()) / 1000);
  uyanikTut(kalan > 0 && !r.hidden);
  if (kalan <= 0) {
    clearInterval(restTimer); r.innerHTML = '<span class="t"><small>Dinlenme</small>Bitti, sıradaki set</span><button class="btn-ac" data-act="rest-kapat">Tamam</button>';
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (AT.restBitti) AT.restBitti();   /* pc.js: ses */
    setTimeout(function () { if (Date.now() >= restBitis) r.hidden = true; }, 6000); return;
  }
  var kalanMs = restBitis - Date.now(), oran = Math.max(0, Math.min(1, kalanMs / Math.max(restSure, kalanMs, 1)));
  r.innerHTML = '<span class="t"><small>Dinlenme' + (restEgz ? ' · ' + h(restEgz) : '') + '</small>' + Math.floor(kalan / 60) + ':' + p2(kalan % 60) + '</span><button data-act="rest-ekle" data-d="-15" aria-label="15 saniye azalt">−15</button><button data-act="rest-ekle" data-d="15" aria-label="15 saniye ekle">+15</button><button data-act="rest-kapat">Geç</button>' +
    '<div class="ibar" aria-hidden="true"><i style="width:' + (oran * 100).toFixed(1) + '%"></i></div>';
}

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
    if (s.done) { s.done = false; delete s.t; kaydet(true); return render(); }
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
    s.done = true; s.t = Date.now(); kaydet(true); render();   /* s.t: setin bittiği an (unutulan antrenmanın gerçek süresi için) */
    var hepsi = S.active.exs.every(function (x) { return x.sets.every(function (y) { return y.done; }); });
    if (hepsi) {   /* son set: dinlenme yok */ clearInterval(restTimer); $('#rest').hidden = true; return; }
    restEgz = e.ad; restBasla(dinlenmeOf(e.ad));
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
  tema: function (d) { S.tema = d.v; S.temaV = 2; kaydet(); temaGecis(); render(); },
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
  'rest-kapat': function () { clearInterval(restTimer); $('#rest').hidden = true; uyanikTut(false); },
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
  a.exs.push({ ad: ad, kas: kasOf(ad), sets: sets }); kaydet(); kapat(); render();
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
  if (t.dataset.tab) return sekmeAc(t.dataset.tab);
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
function sekmeAc(t) {
  tab = t; render(); window.scrollTo(0, 0);
  /* erişilebilirlik: ekran okuyucu yeni sayfayı duysun; başlık sekmeyi söylesin */
  var b = $('#tabs [data-tab="' + tab + '"]'); document.title = (b ? b.textContent.trim() + ' · ' : '') + 'Ağırlık Takip';
  $('#view').focus({ preventScroll: true });
}
function yaziyor(t) { return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
function odakla(sel) { var e = $(sel); if (e) { e.focus(); if (e.select) e.select(); } return e; }
function setEnter(t) {
  var e = +t.dataset.e, s = +t.dataset.s, ins = t.closest('.setgrid').querySelectorAll('input'), i = Array.prototype.indexOf.call(ins, t);
  if (i < ins.length - 1) return odakla('input[data-e="' + e + '"][data-s="' + s + '"][data-f="' + ins[i + 1].dataset.f + '"]');
  var ex = S.active && S.active.exs[e]; if (!ex || !ex.sets[s]) return render();
  if (!ex.sets[s].done) islem.tamam({ e: String(e), s: String(s) });
  if (!S.active || !S.active.exs[e] || !S.active.exs[e].sets[s] || !S.active.exs[e].sets[s].done) return odakla('input[data-e="' + e + '"][data-s="' + s + '"][data-f="' + t.dataset.f + '"]');
  if (!odakla('input[data-e="' + e + '"][data-s="' + (s + 1) + '"][data-f="kg"]')) odakla('.addset[data-e="' + e + '"]');
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
    ev.preventDefault(); if (tab !== 'bugun') sekmeAc('bugun');
    if (S.active) return egzSheet();
    var sr = siradaki(); return sr ? islem['basla-tekrar']({ id: sr.id }) : islem.basla();
  }
  if (ev.key === '?') { ev.preventDefault(); kisayolSheet(); }
});

/* ---------- modül arayüzü ----------
   bulk.js, notlar.js, disa.js bu nesneye kayıt olur (index.html'de app.js'ten sonra yüklenir).
   AT.bolum.<ad>() -> HTML döndürür, AT.islem['eylem'] = function (dataset) {} -> data-act tıklaması. */
var AT = window.AT = {
  islem: islem, bolum: {}, KAS: KAS, AYLAR: AYLAR, p2: p2, iso: iso, parse: parse, h: h, num: num, fmt: fmt, tarih: tarih, uid: uid,
  e1rm: e1rm, tahminiMax: tahminiMax, MAX_TEKRAR: MAX_TEKRAR, haftaBasi: haftaBasi, $: $, kaydet: kaydet, render: render, toast: toast, sheet: sheet, kapat: kapat, onayla: onayla,
  bitenSeanslar: bitenSeanslar, yapilanSetler: yapilanSetler, tumSetler: tumSetler, hacim: hacim, seansHacim: seansHacim, kasOf: kasOf, prHesapla: prHesapla,
  cizgi: cizgi, cubuk: cubuk, indir: indir, geriAl: geriAl, kol: kol, masaustu: masaustu
};
Object.defineProperty(AT, 'S', { get: function () { return S; } });
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
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', temaUygula);
setInterval(function () { var g = $('#gecen'); if (g && S.active) g.textContent = gecenSure(S.active.start); }, 30000);
setInterval(function () { if (tab === 'bugun' && S.active) setVurgu(); }, 10000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
