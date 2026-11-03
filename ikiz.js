/* ikiz.js: modül (window.AT'ye kayıt olur). G23 "Dijital İkiz": İlerleme > Kilo içinde "Senaryo dene" penceresi.
   Girdi: günlük kalori farkı (−500…+500, 50 adım), süre (4/8/12/16 hafta), protein g/kg. Çıktı: kilo eğrisi + belirsizlik bandı,
   güç tahmini, karşılaştırma satırı, "Uygula" (Dönem Motoru'na bulk/cut/koruma). Kural/istatistik tabanlı, çevrimdışı, yeni bağımlılık yok.
   S.ikiz = [{id, t, fark, hf, prot, kg0, hiz0, hiz1, dg, pm, dn?}] son 5 senaryo (id ile eşitlenir; dn = Uygula ile açılan dönemin id'si).

   FORMÜLLER (docs/arastirma-fizyoloji-modeli.md "Dijital İkiz (G23)" bölümü):
   Kilo: bulk.js harcamayı "ortalama alım − gözlenen hız×7700/7" diye uyarlanır (harcamaHesap). Alım fark kadar değişirse harcama sabit kaldığı sürece
     yeni hız = (alım + fark − harcama)×7/7700 = gözlenen hız + fark×7/7700 (alım değişmeden kalan kısım = gözlenen hız). Eğri doğrusal: kg0 + hız1×hafta.
   Bant (yarı genişlik, hafta başına): √((1,96·SE_hız)² + (0,07·harcama×7/7700)²), bantta ×hafta. SE_hız = bulk.js hizAyrinti.se (koni ile aynı);
     harcama belirsizliği ±%7: bulk.js'te harcama için belirsizlik yok, bu UYGULAMANIN varsayımıdır (gün ortalaması 28 günde ±%5–10 oynar; kaynak yok).
   Güç: son 8 hafta, hareket başına seans e1RM'inin (AT.tahminiMax) doğrusal regresyonu, ileri doğrusal uzatma; eğim SE'si bantı verir (en az ±%1,5).
     Cut (fark<0): pozitif eğim ×max(0,25; 1 − 0,75·|fark|/500) sönümlenir, negatif eğim aynen. Yön kaynaklı: ılımlı açıkta güç korunur, kazanç sınırlı
     (Garthe 2011; Helms 2014; reports/Donem motoru.md). SAYILAR (0,25 / 0,75) kaynaksız, uygulamanın varsayımıdır [doğrulanmadı]. Bulk'ta sönümsüz.
   Veri kapısı: tartı <14 gün ya da hareket <6 seans (son 8 hafta, ≥14 gün yayılı) → o parça gizlenir, "N gün daha veri". */
(function (AT) {
'use strict';

var KCAL_KG = 7700, TDEE_PAY = 0.07, GUN_MS = 864e5, MIN_TARTI_GUN = 14, MIN_SEANS = 6, MIN_YAYILIM = 14, PENCERE = 56, SON_N = 5, BAYAT = 10;
var SURELER = [4, 8, 12, 16], FARK_MAX = 500, FARK_ADIM = 50;
var PROT_ARALIK = { bulk: [1.6, 2.2], cut: [2.0, 2.4], koruma: [1.6, 2.2] }, TUR_AD = { bulk: 'Bulk', cut: 'Cut', koruma: 'Koruma' };

function B() { return AT.bulkHesap; }
function gunFark(a, b) { return Math.round((AT.parse(a) - AT.parse(b)) / GUN_MS); }
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function f(n, d) { return Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function isaret(n, d) { var r = Math.round(Math.abs(n) * Math.pow(10, d)) / Math.pow(10, d); return (r === 0 ? '' : n > 0 ? '+' : '−') + f(r, d); }
function tur(fark) { return fark > 0 ? 'bulk' : fark < 0 ? 'cut' : 'koruma'; }

/* ---------- saf hesaplar ---------- */
/* Kilo senaryosu. g = {hiz0 (gözlenen kg/hf), se (kg/hf), kg0, tdee (kcal/gün), fark (kcal/gün), hf} */
function hizSenaryo(g) {
  var hiz1 = g.hiz0 + g.fark * 7 / KCAL_KG;
  var h = Math.sqrt(Math.pow(1.96 * (g.se > 0 ? g.se : 0), 2) + Math.pow(TDEE_PAY * g.tdee * 7 / KCAL_KG, 2));
  var dg = hiz1 * g.hf, pm = h * g.hf;
  return { hiz0: g.hiz0, hiz1: hiz1, h: h, dg: dg, pm: pm, kg0: g.kg0, bitis: g.kg0 + dg, alt: g.kg0 + dg - pm, ust: g.kg0 + dg + pm };
}
/* Tartı veri kapısı. l = bulk.js gecerli(bw) (tarihe sıralı). {tamam, eksik (gün), bayat (gün), ay (hizAyrinti)} */
function tartiKapi(l, bugun) {
  if (!l.length) return { tamam: false, eksik: MIN_TARTI_GUN };
  var son = l[l.length - 1].date, span = gunFark(son, l[0].date), ay = B().hizAyrinti(l);
  if (gunFark(bugun, son) > BAYAT) return { tamam: false, eksik: 0, bayat: gunFark(bugun, son) };
  if (!ay || ay.gun < MIN_TARTI_GUN) return { tamam: false, eksik: Math.max(1, MIN_TARTI_GUN - (ay ? ay.gun : span)) };
  return { tamam: true, ay: ay };
}
/* Çizilecek seri: bulk.js çizgi serisi (tr kodlu), kg0 = son çizgi noktası. Koni = AT.cizgi seçeneği */
function koniKur(x0, y0, s, hf) {
  var x1 = x0 + hf * 7 * GUN_MS;
  return { a: [[x0, y0], [x1, y0 + s.dg + s.pm]], b: [[x0, y0], [x1, y0 + s.dg - s.pm]], o: [[x0, y0], [x1, y0 + s.dg]],
    ozet: hf + ' haftalık senaryo: ' + AT.fmt(y0 + s.dg - s.pm) + '–' + AT.fmt(y0 + s.dg + s.pm) + ' kg' };
}

/* Güç. seri: {ad: [{x: gün (bugüne göre ≤0), y: e1RM}]} */
function gucSeri(S, bugun) {
  var tm = AT.tahminiMax || AT.e1rm, ys = AT.yapilanSetler, m = {}, bas = gunEkle(bugun, -PENCERE);
  (S.sessions || []).forEach(function (se) {
    if (!se || !se.exs || !se.date || se.date < bas || se.date > bugun) return;
    se.exs.forEach(function (e) {
      var en = 0;
      ys(e).forEach(function (z) { var v = tm(AT.num(z.kg), AT.num(z.reps), z.rpe); if (v > en) en = v; });
      if (en > 0) (m[e.ad] = m[e.ad] || []).push({ x: gunFark(se.date, bugun), y: en });
    });
  });
  return m;
}
/* doğrusal regresyon: eğim (kg/gün), eğim SE'si, son noktadaki uygun değer */
function dogru(p) {
  var n = p.length, mx = 0, my = 0, sxx = 0, sxy = 0, rss = 0;
  p.forEach(function (q) { mx += q.x; my += q.y; }); mx /= n; my /= n;
  p.forEach(function (q) { sxx += (q.x - mx) * (q.x - mx); sxy += (q.x - mx) * (q.y - my); });
  if (!sxx) return null;
  var b = sxy / sxx, xs = Math.max.apply(0, p.map(function (q) { return q.x; }));
  p.forEach(function (q) { var r = q.y - (my + b * (q.x - mx)); rss += r * r; });
  return { b: b, se: n > 2 ? Math.sqrt(rss / (n - 2) / sxx) : 0, son: my + b * (xs - mx) };
}
/* cut sönümü: yalnız pozitif eğim ve fark<0; 1 = sönümsüz */
function soenum(fark) { return fark < 0 ? Math.max(0.25, 1 - 0.75 * Math.min(1, -fark / FARK_MAX)) : 1; }
/* {liste: [{ad, n, simdi, bit, pm, hf: eğim kg/hf (sönümlü)}], eksik: gün | 0} — en çok yapılan 4 hareket */
function gucHesap(seri, fark, hf) {
  var ad = Object.keys(seri).sort(function (a, b) { return seri[b].length - seri[a].length || (a < b ? -1 : 1); }).slice(0, 4);
  var liste = [], eksik = 0;
  ad.forEach(function (a) {
    var p = seri[a], n = p.length, xs = p.map(function (q) { return q.x; }), yay = Math.max.apply(0, xs) - Math.min.apply(0, xs), d = n >= 2 ? dogru(p) : null;
    if (n < MIN_SEANS || yay < MIN_YAYILIM || !d) {
      var ara = n >= 2 && yay > 0 ? yay / (n - 1) : 4, gun = Math.max(Math.ceil(Math.max(0, MIN_SEANS - n) * ara), Math.max(0, MIN_YAYILIM - yay));
      if (!liste.length && (!eksik || gun < eksik)) eksik = Math.max(1, gun);
      return;
    }
    var k = d.b > 0 ? soenum(fark) : 1, egim = d.b * k, gun = hf * 7;
    liste.push({ ad: a, n: n, simdi: d.son, bit: d.son + egim * gun, pm: Math.max(1.96 * d.se * gun, 0.015 * d.son), hf: egim * 7, soenumlu: k < 1 });
  });
  if (liste.length) eksik = 0;
  return { liste: liste, eksik: eksik };
}

/* Uygula → Dönem Motoru girdisi (AT.donem.kur). s = hizSenaryo sonucu */
function donemGirdi(s, fark, hf, prot, bugun) {
  var g = { tur: tur(fark), bas: bugun, basKg: r1(s.kg0), hedefTarih: gunEkle(bugun, hf * 7), protGkg: prot };
  if (g.tur !== 'koruma') g.hedefKg = r1(s.kg0 + s.dg);
  return g;
}
/* tahmin–gerçek: p = senaryo hızı, g = gerçekleşen hız (kg/hf). fark = gerçek − tahmin */
function kiyas(p, g) {
  if (typeof p !== 'number' || typeof g !== 'number' || !isFinite(p) || !isFinite(g)) return null;
  var d = g - p;
  return { fark: d, satir: 'Senaryo tahmini ' + isaret(p, 2) + ' kg/hf · gerçekleşen ' + isaret(g, 2) + ' kg/hf (' + isaret(d, 2) + ')' };
}
/* dönem raporuna eklenecek özet: bu dönemi açan en yeni senaryo kaydı */
function raporOzet(S, donemId) {
  var l = (S.ikiz || []).filter(function (k) { return k && k.dn === donemId; });
  if (!l.length) return null;
  var k = l[l.length - 1];
  return { hiz: k.hiz1, hf: k.hf, fark: k.fark };
}
function raporSatir(rapor) {
  if (!rapor || !rapor.ikiz) return '';
  var k = kiyas(rapor.ikiz.hiz, rapor.hiz);
  return k ? k.satir : '';
}

/* ---------- durum ---------- */
var tas = null;   /* açık pencere: {fark, hf, prot, onay} */
function bugunIso() { return AT.iso(new Date()); }
function protVar() { var p = AT.donemProtein ? AT.donemProtein() : 0; return p > 0 ? p : 1.8; }
function taslak() { if (!tas) tas = { fark: 0, hf: 8, prot: r1(protVar()), onay: false }; return tas; }

/* mevcut verilerden senaryo girdisi; null = tartı verisi yetersiz ({eksik, bayat}) */
function girdi() {
  var S = AT.S, bg = bugunIso(), l = B().gecerli(S.bw), kapi = tartiKapi(l, bg);
  if (!kapi.tamam) return { kapi: kapi, l: l, bg: bg };
  var seri = B().cizgiSeri(B().trendSeri(l)).filter(function (p) { return p.date >= gunEkle(bg, -PENCERE); });
  var h = AT.harcama ? AT.harcama() : null, kg = seri.length ? seri[seri.length - 1].kg : B().ortalamaKilo(l);
  var tdee = h && h.tdee > 0 ? h.tdee : Math.round(kg * 33);   /* harcama hesabı yoksa 33 kcal/kg varsayımı */
  return { kapi: kapi, l: l, bg: bg, seri: seri, kg0: kg, tdee: tdee, tdeeVar: !!(h && h.tdee > 0), ort: h && h.ortKcal > 0 ? h.ortKcal : null };
}
function senaryo(x, t) { return hizSenaryo({ hiz0: x.kapi.ay.hiz, se: x.kapi.ay.se, kg0: x.kg0, tdee: x.tdee, fark: t.fark, hf: t.hf }); }

/* ---------- arayüz ---------- */
AT.bolum.ikizSatir = function () {
  if (!AT.S || !B().gecerli(AT.S.bw).length) return '';
  return '<button type="button" class="ikiz-satir" data-act="ikiz-ac"><span>Senaryo dene</span><i aria-hidden="true">›</i></button>';
};

function adim(et, deger, k, ekle) {
  return '<div class="ikiz-gir"><span>' + AT.h(et) + '</span><div><button type="button" data-act="ikiz-ayar" data-k="' + k + '" data-v="-1" aria-label="' + AT.h(et) + ' azalt">−</button><b>' + deger + '</b>' +
    '<button type="button" data-act="ikiz-ayar" data-k="' + k + '" data-v="1" aria-label="' + AT.h(et) + ' artır">+</button></div></div>';
}
function sonSenaryolar() {
  var l = (AT.S.ikiz || []).slice().reverse();
  if (!l.length) return '';
  return '<details class="katla ikiz-son"><summary>Son senaryolar <small>' + l.length + '</small></summary><ul class="donem-liste">' + l.map(function (k) {
    return '<li><button type="button" data-act="ikiz-yukle" data-id="' + AT.h(k.id) + '"><span><b>' + AT.h(isaret(k.fark, 0)) + ' kcal · ' + k.hf + ' hf</b><small>' + AT.h(AT.tarih(k.t, 1)) + (k.dn ? ' · uygulandı' : '') + '</small></span>' +
      '<span class="donem-sag">' + AT.h(isaret(k.dg, 1)) + ' kg<small>' + AT.h(isaret(k.hiz1, 2)) + ' kg/hf</small></span></button></li>';
  }).join('') + '</ul></details>';
}
function html() {
  var t = taslak(), S = AT.S, x = girdi(), T = tur(t.fark);
  var o = '<div class="ikiz"><h3>Senaryo dene</h3>';
  if (t.onay) {
    var d = S.donem;
    return o + '<p class="ikiz-onay">' + (d ? 'Mevcut ' + AT.h(TUR_AD[d.tur]) + ' dönemi bitirilip yerine ' : '') + AT.h(TUR_AD[T]) + ' dönemi başlatılsın mı?' +
      (d ? ' Eski dönem geçmişe kaydolur.' : '') + '</p><button class="btn-ac btn-big" data-act="ikiz-uygula-onay">' + (d ? 'Değiştir' : 'Başlat') + '</button>' +
      '<button class="btn-big btn-ghost" data-act="ikiz-ac">Vazgeç</button></div>';
  }
  o += adim('Günlük kalori farkı', AT.h(isaret(t.fark, 0) + ' kcal'), 'fark');
  o += '<div class="ikiz-gir"><span>Süre</span><div class="seg" role="group" aria-label="Süre">' + SURELER.map(function (n) {
    return '<button type="button" data-act="ikiz-sure" data-v="' + n + '" aria-pressed="' + (t.hf === n) + '">' + n + ' hf</button>'; }).join('') + '</div></div>';
  var kgPr = x.kg0 ? Math.round(x.kg0 * t.prot / 5) * 5 : 0;
  o += adim('Protein', AT.h(f(t.prot, 1) + ' g/kg') + (kgPr ? ' <small>' + kgPr + ' g</small>' : ''), 'prot');
  if (!x.kapi.tamam) {
    o += '<p class="mut ikiz-az">' + (x.kapi.bayat ? 'Son tartı ' + x.kapi.bayat + ' gün önce; tahmin için yeniden tart' : 'Tahmin için ' + x.kapi.eksik + ' gün daha veri') + '</p>';
  } else {
    var s = senaryo(x, t), ort = x.ort ? Math.round((x.ort + t.fark) / 10) * 10 : null;
    o += '<p class="ikiz-kiyas">Bugünkü gidiş: <b>' + AT.h(isaret(s.hiz0, 2)) + ' kg/hf</b> · Senaryo: <b>' + AT.h(isaret(s.hiz1, 2)) + ' kg/hf</b> · ' + t.hf + ' haftada ~<b>' + AT.h(isaret(s.dg, 1)) + ' kg</b> (±' + AT.h(f(s.pm, 1)) + ')' +
      (ort ? '<br><span class="mut">günde ~' + AT.h(AT.fmt(ort, 0)) + ' kcal</span>' : '') + '</p>';
    var d2 = S.donem, hedef = d2 ? { y: d2.hedefKg, ad: 'hedef ' + AT.fmt(d2.hedefKg) + ' kg', alt: x.kg0 > d2.hedefKg } : null;
    var x0 = AT.parse(x.seri[x.seri.length - 1].date).getTime();
    o += B().grafik(x.seri, null, 'Senaryo: ortalama kilo', { koni: koniKur(x0, r1(x.kg0), s, t.hf), hedef: d2 && d2.tur !== 'koruma' ? hedef : null }, null);
    var g = gucHesap(gucSeri(S, x.bg), t.fark, t.hf);
    if (g.liste.length) {
      o += '<dl class="kv ikiz-guc">' + g.liste.map(function (z) {
        return '<div><dt>' + AT.h(z.ad) + '</dt><dd>' + AT.h(AT.fmt(z.simdi) + ' → ~' + AT.fmt(z.bit)) + ' kg<small>±' + AT.h(AT.fmt(z.pm)) + '</small></dd></div>'; }).join('') + '</dl>' +
        '<p class="mut kucuk">Tahmini max, ' + t.hf + ' hafta sonra' + (t.fark < 0 ? ' (açıkta kazanç sınırlı)' : '') + '. Tahmin, garanti değil.</p>';
    } else if (g.eksik) o += '<p class="mut ikiz-az">Güç tahmini için ' + g.eksik + ' gün daha veri</p>';
    else o += '<p class="mut kucuk">Tahmin, garanti değil.</p>';
  }
  if (x.kapi.tamam) {
    o += '<button class="btn-ac btn-big" data-act="ikiz-uygula">' + AT.h(TUR_AD[T]) + ' dönemi olarak uygula</button>' +
      '<button class="btn-big btn-ghost" data-act="ikiz-kaydet">Senaryoyu kaydet</button>';
  }
  return o + sonSenaryolar() + '<button class="btn-big btn-ghost" data-act="kapat">Kapat</button></div>';
}
function ciz() {
  var ic = document.querySelector('#sheet .in'), st = ic ? ic.scrollTop : 0;
  AT.sheet(html());
  var n = document.querySelector('#sheet .in'); if (n && st) n.scrollTop = st;
}
AT.islem['ikiz-ac'] = function () { taslak().onay = false; ciz(); };
AT.islem['ikiz-sure'] = function (d) { var t = taslak(); t.hf = +d.v || 8; ciz(); };
AT.islem['ikiz-ayar'] = function (d) {
  var t = taslak(), v = +d.v;
  if (d.k === 'fark') t.fark = Math.max(-FARK_MAX, Math.min(FARK_MAX, t.fark + v * FARK_ADIM));
  else t.prot = r1(Math.max(1.6, Math.min(2.4, t.prot + v * 0.1)));
  ciz();
};
AT.islem['ikiz-yukle'] = function (d) {
  var k = (AT.S.ikiz || []).filter(function (z) { return z.id === d.id; })[0]; if (!k) return;
  tas = { fark: k.fark, hf: k.hf, prot: k.prot, onay: false }; ciz();
};

function kayitUret(t, s, dn) {
  return { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: bugunIso(), fark: t.fark, hf: t.hf, prot: t.prot,
    kg0: r1(s.kg0), hiz0: r2(s.hiz0), hiz1: r2(s.hiz1), dg: r1(s.dg), pm: r1(s.pm), dn: dn || null };
}
/* son 5 senaryo; aynı ayarlar (fark+süre+protein, dönemsiz) yinelenmez. Uygula kayıtları (dn) kırpılmaz: dönem raporu onları okur */
function kayitEkle(S, k) {
  var l = (S.ikiz || []).filter(function (z) { return z && (k.dn || z.dn || z.fark !== k.fark || z.hf !== k.hf || z.prot !== k.prot); });
  l.push(k);
  var son = l.filter(function (z) { return !z.dn; }).slice(-SON_N);
  S.ikiz = l.filter(function (z) { return z.dn || son.indexOf(z) >= 0; });
}
AT.islem['ikiz-kaydet'] = function () {
  var x = girdi(); if (!x.kapi.tamam) return;
  var t = taslak(), onceki = JSON.stringify(AT.S.ikiz || []);
  kayitEkle(AT.S, kayitUret(t, senaryo(x, t)));
  AT.kaydet(); ciz();
  if (AT.geriAl) AT.geriAl('Senaryo kaydedildi', function () { AT.S.ikiz = JSON.parse(onceki); AT.kaydet(); });
  else AT.toast('Senaryo kaydedildi');
};

/* Uygula: dönem varsa önce onay. Hata ise toast, pencere açık kalır */
AT.islem['ikiz-uygula'] = function () {
  var x = girdi(); if (!x.kapi.tamam) return;
  var t = taslak(), s = senaryo(x, t), T = tur(t.fark);
  if (T === 'bulk' && s.dg < 0.1) return AT.toast('Bu senaryo kiloyu artırmıyor; farkı yükselt');
  if (T === 'cut' && s.dg > -0.1) return AT.toast('Bu senaryo kiloyu düşürmüyor; farkı azalt');
  var k = AT.donem.kur(donemGirdi(s, t.fark, t.hf, t.prot, x.bg));
  if (k.hata) return AT.toast(k.hata);
  t.onay = true; ciz();
};
function anlik(S) { return JSON.stringify({ donem: S.donem || null, bulk: S.bulk || null, gecmis: S.donemGecmis || [], oneri: S.kcalOneri || null, ikiz: S.ikiz || [] }); }
AT.islem['ikiz-uygula-onay'] = function () {
  var S = AT.S, x = girdi(); if (!x.kapi.tamam) return;
  var t = taslak(), s = senaryo(x, t), bg = x.bg;
  var k = AT.donem.kur(donemGirdi(s, t.fark, t.hf, t.prot, bg)); if (k.hata) { t.onay = false; ciz(); return AT.toast(k.hata); }
  var onceki = anlik(S), d0 = S.donem;
  if (d0) {   /* eski dönem raporuyla geçmişe */
    var r = AT.bulkDurum ? AT.bulkDurum() : null, rp = AT.donem.rapor(S, d0, r, bg, 'elle');
    S.donemGecmis = (S.donemGecmis || []).filter(function (z) { return z.id !== rp.id; }).concat([rp]);
  }
  S.donem = k.d; S.bulk = AT.donem.ayna(k.d); S.kcalOneri = null;
  kayitEkle(S, kayitUret(t, s, k.d.id));
  tas = null; AT.kaydet(); AT.kapat(); AT.render();
  var m = TUR_AD[k.d.tur] + ' dönemi başladı';
  if (AT.geriAl) AT.geriAl(m, function () {
    var o = JSON.parse(onceki); S.donem = o.donem; S.bulk = o.bulk; S.donemGecmis = o.gecmis; S.kcalOneri = o.oneri; S.ikiz = o.ikiz; AT.kaydet(); AT.render();
  }); else AT.toast(m);
};

AT.ikiz = { hizSenaryo: hizSenaryo, tartiKapi: tartiKapi, koniKur: koniKur, gucSeri: gucSeri, gucHesap: gucHesap, soenum: soenum, donemGirdi: donemGirdi,
  kiyas: kiyas, raporOzet: raporOzet, raporSatir: raporSatir, kayitEkle: kayitEkle, kayitUret: kayitUret, tur: tur, isaret: isaret };
})(window.AT);
