/* bulk.js: modül (window.AT'ye kayıt olur)
   Bulk (ya da cut) sezonu: trend kilo (üstel ortalama), haftalık hız (trende regresyon), kural tabanlı kcal önerisi.
   S.bulk = null | { bas:'YYYY-MM-DD', basKg, hedefKg, min, max, demo? }  (min/max: hedef haftalık değişim kg/hafta, min < max) */
(function (AT) {
'use strict';

var KCAL_KG = 7700;

/* ---------- saf hesaplar (DOM/S yok; node ile test edilir) ---------- */
function gunFark(a, b) { return Math.round((AT.parse(a) - AT.parse(b)) / 864e5); } /* a - b, gün */
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function r10(n) { return Math.round(n * 10) / 10; }
function r05(n) { return Math.round(Math.round(n / 0.05) * 0.05 * 100) / 100; }

function gecerli(l) {
  return (l || []).filter(function (b) { return b && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && isFinite(b.kg) && b.kg > 0; })
    .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}
/* Trend (üstel hareketli ortalama; The Hacker's Diet / TrendWeight yöntemi):
   aynı günün kayıtları ortalanır; iki tartı arasındaki boş günler doğrusal doldurulur (ilk..son tartı, ileriye uzatılmaz);
   trend_0 = ilk kilo, trend_t = trend_{t-1} + ALFA × (kilo_t − trend_{t-1}).
   l: gecerli() çıktısı (sıralı). Dönüş: her gün için [{date, kg: trend, ham: o günün gerçek tartısı ya da null}] */
var ALFA = 0.1;
function gunluk(l) {
  var out = [];
  l.forEach(function (b) {
    var s = out[out.length - 1];
    if (s && s.date === b.date) { s.t += +b.kg; s.n++; } else out.push({ date: b.date, t: +b.kg, n: 1 });
  });
  return out.map(function (g) { return { date: g.date, kg: g.t / g.n }; });
}
function trendSeri(l) {
  var g = gunluk(l); if (!g.length) return [];
  var t = g[0].kg, out = [{ date: g[0].date, kg: t, ham: g[0].kg }];
  for (var i = 1; i < g.length; i++) {
    var a = g[i - 1], b = g[i], n = gunFark(b.date, a.date);
    for (var k = 1; k <= n; k++) {
      t += ALFA * (a.kg + (b.kg - a.kg) * k / n - t);
      out.push({ date: k === n ? b.date : gunEkle(a.date, k), kg: t, ham: k === n ? b.kg : null });
    }
  }
  return out;
}
function sonTrend(l) { var tr = trendSeri(l); return tr.length ? tr[tr.length - 1].kg : null; }
/* grafik çizgisi: çift üstel ortalama (2×EMA − EMA'nın EMA'sı, aynı α). Düz artışta gecikmesiz, böylece çizginin sonu
   üstteki "ortalama kilo" (regresyon) ile örtüşür; tek günlük sıçramaya tepkisi ~2α. tr: trendSeri çıktısı */
function cizgiSeri(tr) {
  if (!tr.length) return [];
  var e2 = tr[0].kg;
  return tr.map(function (p) { e2 += ALFA * (p.kg - e2); return { date: p.date, kg: 2 * p.kg - e2, ham: p.ham }; });
}
/* gösterilen ortalama kilo: 14+ günlük regresyon varsa doğrunun son tartı günündeki değeri, yoksa EMA */
function ortalamaKilo(l, bas) {
  var ay = hizAyrinti(l, bas);
  return ay && ay.gun >= ERKEN_GUN && isFinite(ay.deger) ? ay.deger : sonTrend(l);
}
/* doğrusal regresyon eğimi (kg/gün); x = gün. n<2 ya da yayılım 0 ise null */
function egim(pts) {
  var n = pts.length; if (n < 2) return null;
  var mx = 0, my = 0; pts.forEach(function (p) { mx += p.x; my += p.y; }); mx /= n; my /= n;
  var sxy = 0, sxx = 0; pts.forEach(function (p) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); });
  return sxx ? sxy / sxx : null;
}
/* Haftalık hız (kg/hafta): son tartıdan geriye 28 günün (ve bas sonrasının) GERÇEK tartılarına (aynı gün ortalanır)
   doğrusal regresyon eğimi × 7; seyrek tartıda pencere en az 8 tartı günü olana kadar 42 güne kadar geriye uzar.
   Trend (EMA) eğimi kullanılmaz: EMA rampaya geç oturur; simülasyonda (gerçek 0,30, günlük tartı, ±0,4 gürültü)
   14. günde 0,17, 21. günde 0,24 gösteriyordu; Holt (α 0,1, β 0,1) da düzeltmedi, sonra 0,34'e taştı.
   Ham regresyon sapmasız (14. gün 0,30 ±0,16; 28. gün 0,30 ±0,07); kalori değişimine tepkisi eski yöntemle aynı.
   En az 4 tartı günü ve ilk tartıdan sona en az 7 gün yoksa null.
   hizAyrinti: {hiz, se: eğimin standart hatası (kg/hafta), gun: kullanılan ilk–son tartı arası gün} */
var HIZ_GUN = 28, HIZ_EN_COK = 42, HIZ_NOKTA = 8, ERKEN_GUN = 14;
function hizAyrinti(l, bas) {
  var g = gunluk(l); if (!g.length) return null;
  var son = g[g.length - 1].date;
  var aday = g.filter(function (p) { return gunFark(son, p.date) < HIZ_EN_COK && (!bas || p.date >= bas); });
  var w = aday.filter(function (p) { return gunFark(son, p.date) < HIZ_GUN; });
  if (w.length < HIZ_NOKTA) w = aday.slice(-HIZ_NOKTA);
  if (w.length < 4 || gunFark(son, w[0].date) < 7) return null;
  var pts = w.map(function (p) { return { x: gunFark(p.date, w[0].date), y: p.kg }; }), e = egim(pts);
  if (e == null) return null;
  var n = pts.length, mx = 0, my = 0, sxx = 0, rss = 0;
  pts.forEach(function (p) { mx += p.x; my += p.y; }); mx /= n; my /= n;
  pts.forEach(function (p) { sxx += (p.x - mx) * (p.x - mx); var r = p.y - (my + e * (p.x - mx)); rss += r * r; });
  var xs = gunFark(son, w[0].date);
  /* deger: regresyon doğrusunun son tartı günündeki değeri (gecikmesiz "ortalama kilo"; α=0,1 EMA ~9 gün geriden gelir, haftada 0,4 kg bulkta ~0,5 kg düşük) */
  return { hiz: e * 7, se: n > 2 && sxx ? Math.sqrt(rss / (n - 2) / sxx) * 7 : 0, gun: xs, deger: my + e * (xs - mx) };
}
function hizHesap(l, bas) { var a = hizAyrinti(l, bas); return a ? a.hiz : null; }
function yonOf(bulk) { return bulk.hedefKg < bulk.basKg ? -1 : 1; }
/* hiz < min / hiz > max; bulk'ta küçük = yavaş, cut'ta (negatif aralık) küçük = fazla hızlı kayıp.
   pay (isteğe bağlı, kg/hafta): aralığın bu kadar dışına çıkmadan uyarma (tartı gürültüsü yüzünden öneri gidip gelmesin) */
function durumOf(hiz, min, max, yon, pay) {
  if (hiz == null) return 'veri';
  pay = pay > 0 ? pay : 0;
  if (hiz < min - pay) return yon > 0 ? 'yavas' : 'hizli';
  if (hiz > max + pay) return yon > 0 ? 'hizli' : 'yavas';
  return 'iyi';
}
function kcalOf(hiz, min, max) { return Math.round(((min + max) / 2 - hiz) * KCAL_KG / 7 / 10) * 10; }
function varisOf(kalan, hiz, bugun) {
  if (hiz == null || !(Math.abs(hiz) > 0.02) || !(kalan * hiz > 0)) return null;
  return gunEkle(bugun, Math.round(kalan / hiz * 7));
}
function varsayilanHiz(basKg, hedefKg) {
  if (hedefKg < basKg) return { min: -r05(basKg * 0.01), max: -r05(basKg * 0.005) };
  return { min: r05(basKg * 0.0025), max: r05(basKg * 0.005) };
}
/* Kalori kayıtları: [{id, date, kcal, demo?}] -> geçerli, tarihe göre sıralı, aynı gün tek (son yazılan) */
var KCAL_MIN = 300, KCAL_MAX = 15000;
function kcalGecerli(l) {
  var m = {};
  (l || []).forEach(function (k) { if (k && typeof k.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.date) && isFinite(k.kcal) && k.kcal >= KCAL_MIN && k.kcal <= KCAL_MAX) m[k.date] = k; });
  return Object.keys(m).sort().map(function (d) { return m[d]; });
}
/* Uyarlanır günlük harcama (TDEE), kural tabanlı: son 28 günde
   harcama = ortalama yenen kalori − (kilo değişim hızı kg/gün × 7700).
   Kilo hızı aynı penceredeki gerçek tartılara regresyon (hizAyrinti). Eksik kalori günleri ortalamaya girmez.
   Şart: pencerede en az 10 kalori günü ve en az 14 günlük tartı yayılımı; yoksa null + ne kadar eksik olduğu.
   Dönüş: {tdee, ortKcal, kcalGun, tartiGun, hiz} ya da {eksik: {kcalGun, tartiGun}} */
var TDEE_GUN = 28, TDEE_KCAL_GUN = 10, ESKI_GUN = 10;   /* son tartı 10 günden eskiyse hız/harcama/kalori önerisi yok (bayat) */
/* yarım girilmiş gün: penceredeki kalori medyanının yarısından az olan gün (ör. yalnız kahvaltı yazılmış) harcamayı
   yapay düşürür; ortalamaya girmez. En az 5 gün yoksa süzme (medyan anlamsız) */
function yarimGunAt(k) {
  if (k.length < 5) return k;
  var s = k.map(function (x) { return +x.kcal; }).sort(function (a, b) { return a - b; }), m = s.length;
  var med = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  return k.filter(function (x) { return +x.kcal >= med * 0.5; });
}
function harcama(bw, kcal, bugun) {
  var bas = gunEkle(bugun, -(TDEE_GUN - 1));
  var k = yarimGunAt(kcalGecerli(kcal).filter(function (x) { return x.date >= bas && x.date <= bugun; }));
  var l = gecerli(bw).filter(function (x) { return x.date >= bas && x.date <= bugun; });
  var ay = hizAyrinti(l, bas), tartiGun = ay ? ay.gun : 0, tum = gecerli(bw), sonT = tum.length ? tum[tum.length - 1].date : null;
  if (sonT && gunFark(bugun, sonT) > ESKI_GUN) return { eksik: { kcalGun: k.length, tartiGun: tartiGun, eski: gunFark(bugun, sonT) } };
  if (k.length < TDEE_KCAL_GUN || !ay || ay.gun < ERKEN_GUN) return { eksik: { kcalGun: k.length, tartiGun: tartiGun } };
  var ort = k.reduce(function (t, x) { return t + +x.kcal; }, 0) / k.length;
  return { tdee: Math.round((ort - ay.hiz / 7 * KCAL_KG) / 10) * 10, ortKcal: Math.round(ort / 10) * 10, kcalGun: k.length, tartiGun: tartiGun, hiz: ay.hiz };
}
/* hedef hıza göre günlük kalori: harcama + aralığın ortası × 7700 / 7, 50'ye yuvarlı */
function hedefKcalOf(tdee, min, max) { return Math.round((tdee + (min + max) / 2 * KCAL_KG / 7) / 50) * 50; }
function hesapla(bw, bulk, bugun, kcal) {
  if (!bulk) return null;
  var l = gecerli(bw), son = l.length ? l[l.length - 1] : null;
  var ay = hizAyrinti(l, bulk.bas), hiz = ay ? ay.hiz : null, min = +bulk.min, max = +bulk.max;
  /* ortalama kilo: 14+ günlük regresyon varsa doğrunun bugünkü değeri (kalan ve varış da bundan), yoksa EMA; grafik çizgisi EMA kalır */
  var simdi = !son ? +bulk.basKg : ay && ay.gun >= ERKEN_GUN && isFinite(ay.deger) ? ay.deger : sonTrend(l);
  /* ilk 2 hafta: hız gösterilir ama kalori önerisi yok ('erken'); sonra aralık dışına standart hata kadar taşarsa uyar */
  var durum = ay && ay.gun < ERKEN_GUN ? 'erken' : durumOf(hiz, min, max, yonOf(bulk), ay ? Math.min(ay.se, 0.15) : 0);
  if (son && gunFark(bugun, son.date) > ESKI_GUN) durum = 'veri';   /* bayat: öneri yok; notlar.js "X gündür tartılmadın" der */
  var kalan = bulk.hedefKg - simdi, hr = harcama(bw, kcal, bugun);
  return {
    simdi: simdi, degisim: simdi - bulk.basKg, hiz: hiz, min: min, max: max, durum: durum,
    kcal: durum === 'yavas' || durum === 'hizli' ? kcalOf(hiz, min, max) : null,
    sonTarti: son ? son.date : null, kalan: kalan, varis: varisOf(kalan, hiz, bugun),
    hedefKg: +bulk.hedefKg, basKg: +bulk.basKg,
    tdee: hr.tdee != null ? hr.tdee : null, ortKcal: hr.ortKcal != null ? hr.ortKcal : null,
    hedefKcal: hr.tdee != null ? hedefKcalOf(hr.tdee, min, max) : null
  };
}

/* ---------- demo veri ---------- */
function demoBw(basla, bugun) {
  var seed = 725055; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var bas = new Date(basla); bas.setHours(0, 0, 0, 0);
  var son = new Date(bugun); son.setHours(0, 0, 0, 0);
  var bw = [];
  for (var i = 0; i <= 120; i += 2) {
    var d = new Date(bas); d.setDate(d.getDate() + i); if (d > son) break; /* bugüne kadar (~84-90 gün) */
    bw.push({ id: 'dbw' + i, date: AT.iso(d), kg: r10(78.4 + 0.3 * i / 7 + (rnd() - 0.5) * 0.8), demo: true });
  }
  var basKg = bw.length ? bw[0].kg : 78.4, kcal = [];
  for (var j = 0; j <= 120; j++) {
    var dk = new Date(bas); dk.setDate(dk.getDate() + j); if (dk > son) break;
    if (gunFark(AT.iso(son), AT.iso(dk)) > 45 || rnd() < 0.15) continue;   /* son ~6 hafta, arada unutulan günler */
    kcal.push({ id: 'dkc' + j, date: AT.iso(dk), kcal: Math.round((2600 + 330 + (rnd() - 0.5) * 600) / 10) * 10, demo: true });
  }
  return { bw: bw, kcal: kcal, bulk: { bas: AT.iso(bas), basKg: basKg, hedefKg: 84, min: 0.2, max: 0.4, demo: true } };
}

/* ---------- metin ---------- */
function isaret(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + AT.fmt(Math.abs(n), d); }
function f2(n) { return Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hizYaz(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + f2(n); }
function aralikYaz(min, max) { return min >= 0 ? f2(min) + '–' + f2(max) : hizYaz(min) + ' ile ' + hizYaz(max); }
function kcalSay(n) { return AT.fmt(n, 0) + ' kcal'; }
/* harcama biliniyorsa net sayı ("Günde ~2.950 kcal ye"), bilinmiyorsa fark ("~220 kcal daha fazla ye") */
function kcalYaz(k, r) {
  if (r && r.hedefKcal != null) return 'Günde ~' + kcalSay(r.hedefKcal) + ' ye (şu an ortalama ' + kcalSay(r.ortKcal) + ').';
  return 'Günde ~' + AT.fmt(Math.abs(k), 0) + ' kcal ' + (k > 0 ? 'daha fazla ye.' : 'daha az ye.');
}
var SINIF = { iyi: 'iyi', yavas: 'uyari', hizli: 'uyari', veri: 'bilgi', erken: 'bilgi' };
function sezonAd(b) { return yonOf(b) > 0 ? 'Bulk sezonu' : 'Cut sezonu'; }
function durumMetin(r, yon) {
  if (r.durum === 'veri') return 'Gidişatı görmek için en az 4 tartı ve 1 hafta gerekli.';
  var hz = 'haftada ' + hizYaz(r.hiz) + ' kg';
  if (r.durum === 'erken') return 'İlk tahmin: ' + hz + ' (hedef ' + aralikYaz(r.min, r.max) + ' kg). İlk iki hafta tartı oynak; kalori önerisi 2. haftadan sonra.';
  if (r.durum === 'iyi') return 'Doğru hızdasın: ' + hz + ' (hedef ' + aralikYaz(r.min, r.max) + ' kg).' + (r.ortKcal != null ? ' Ortalama ' + kcalSay(r.ortKcal) + ' ile böyle devam.' : '');
  if (r.durum === 'hizli') return 'Fazla hızlı: ' + hz + (yon > 0 ? ', yağ alıyor olabilirsin. ' : ', kas kaybedebilirsin. ') + kcalYaz(r.kcal, r);
  if (r.hiz * yon < 0) return (yon > 0 ? 'Kilo düşüyor: ' : 'Kilo artıyor: ') + hz + '. ' + kcalYaz(r.kcal, r);
  return 'Yavaş: ' + hz + '. ' + kcalYaz(r.kcal, r);
}
/* Bugün ekranındaki tek satır, ör. "Bulk iyi gidiyor: haftada +0,33 kg" */
function kisaDurum(r, ad) {
  if (r.durum === 'veri') return ad + ': gidişat için birkaç tartı daha gerekli';
  var hz = 'haftada ' + hizYaz(r.hiz) + ' kg';
  if (r.durum === 'erken') return ad + ' ilk tahmin: ' + hz + ' (2 hafta dolunca netleşir)';
  if (r.durum === 'iyi') return ad + ' iyi gidiyor: ' + hz;
  return ad + (r.durum === 'hizli' ? ' fazla hızlı: ' : ' yavaş: ') + hz + ' · ' +
    (r.hedefKcal != null ? 'günde ~' + kcalSay(r.hedefKcal) + ' ye' : 'günde ~' + AT.fmt(Math.abs(r.kcal), 0) + ' kcal ' + (r.kcal > 0 ? 'fazla' : 'az') + ' ye');
}
function demoTag(b) { return b && b.demo ? ' <span class="tag demo">örnek</span>' : ''; }

/* ---------- görünüm parçaları ---------- */
function kiloGir(etiket) {
  return '<div class="row"><input id="bwkg" class="grow" inputmode="decimal" placeholder="kg, örn. 82,4" aria-label="Vücut ağırlığı kg"><button class="btn-ac" data-act="bw-ekle">' + AT.h(etiket || 'Kaydet') + '</button></div>';
}
function grafik(seri, ref, baslik) {
  if (!seri.length) return '<p class="mut">Tartı ekledikçe grafik burada oluşur.</p>';
  var o = { baslik: baslik };
  if (ref) o.ref = ref;
  return AT.cizgi(seri.map(function (p) { return { x: AT.parse(p.date).getTime(), y: r10(p.kg), t: AT.tarih(p.date, 1) }; }), o);
}
function sonKayit(l) { return l.length ? l[l.length - 1] : null; }
/* "Günlük harcaman" anahtar-değer satırı; hiç kalori kaydı yoksa boş */
function harcamaSatir(bugun) {
  var S = AT.S; if (!kcalGecerli(S.kcal).length) return '';
  var hr = harcama(S.bw, S.kcal, bugun), demo = kcalGecerli(S.kcal).some(function (k) { return k.demo; });
  if (hr.tdee == null && hr.eksik.eski) return '<div><dt>Günlük harcaman</dt><dd class="mut">son tartı ' + hr.eksik.eski + ' gün önce</dd></div>';
  if (hr.tdee == null) return '<div><dt>Günlük harcaman</dt><dd class="mut">' + Math.min(hr.eksik.kcalGun, TDEE_KCAL_GUN) + '/' + TDEE_KCAL_GUN + ' kalori günü · ' +
    Math.min(hr.eksik.tartiGun, ERKEN_GUN) + '/' + ERKEN_GUN + ' gün tartı</dd></div>';
  return '<div><dt>Günlük harcaman <small>son 4 hafta</small></dt><dd>~' + AT.h(kcalSay(hr.tdee)) + demoTag({ demo: demo }) + '</dd></div>' +
    '<div><dt>Ortalama yediğin</dt><dd>' + AT.h(kcalSay(hr.ortKcal)) + '<small>' + hr.kcalGun + ' gün</small></dd></div>';
}

/* son 8 haftanın haftalık ortalama yenen kalorisi (girilen günler); katlanır, çubuk grafik. Kayıt yoksa boş */
function haftalikKcal(kcal, bugun, n) {
  var hb = AT.haftaBasi(bugun), k = kcalGecerli(kcal), out = [];
  for (var i = n - 1; i >= 0; i--) {
    var bas = gunEkle(hb, -7 * i), son = gunEkle(bas, 6);
    var w = k.filter(function (x) { return x.date >= bas && x.date <= son; });
    out.push({ bas: bas, gun: w.length, ort: w.length ? w.reduce(function (t, x) { return t + +x.kcal; }, 0) / w.length : 0 });
  }
  return out;
}
function kaloriGecmisi(bugun) {
  var h = haftalikKcal(AT.S.kcal, bugun, 8);
  if (!h.some(function (x) { return x.gun; })) return '';
  var hr = harcama(AT.S.bw, AT.S.kcal, bugun);
  return '<details class="katla"><summary>Kalori geçmişi <small>' + (hr.tdee != null ? 'harcama ~' + AT.h(kcalSay(hr.tdee)) : 'haftalık') + '</small></summary>' +
    AT.cubuk(h.map(function (x) { return { l: AT.tarih(x.bas, 1), v: Math.round(x.ort) }; }), { baslik: 'Haftalık ortalama kalori', birim: 'kcal' }) + '</details>';
}

function bolumYok(l) {
  var o = '<h2>Vücut ağırlığı</h2><div class="panel">';
  var son = sonKayit(l), tr = trendSeri(l), trSon = tr.length ? ortalamaKilo(l) : null;
  if (son) {
    o += '<div class="hero"><b>' + AT.h(AT.fmt(trSon)) + ' <small>kg</small></b><span>ortalama kilo · son tartı ' + AT.h(AT.fmt(son.kg)) + ' kg, ' + AT.h(AT.tarih(son.date, 1)) + demoTag(son) + '</span></div>';
    o += grafik(cizgiSeri(tr), null, 'Ortalama vücut ağırlığı');
    var hs = harcamaSatir(AT.iso(new Date()));
    if (hs) o += '<dl class="kv">' + hs + '</dl>';
    o += '<div class="row"><button class="btn-ghost mini" data-act="bw-geri">Son kaydı sil</button></div>';
  } else {
    o += '<p class="mut">Kilonu Bugün ekranından gir; grafik burada oluşur.</p>';
  }
  o += '</div>' + kaloriGecmisi(AT.iso(new Date()));
  var baslangic = son ? r10(trSon) : '';
  o += '<h2>Kilo hedefi <small>bulk ya da cut</small></h2><div class="panel">' +
    '<p class="mut">Ulaşmak istediğin kiloyu yaz. Her tartıda doğru hızda gidip gitmediğini, gerekirse günde kaç kalori ekleyip çıkaracağını söylerim.</p>' +
    '<div class="alanlar"><label class="alan"><span>Başlangıç kilosu</span><input id="bulk-baskg" inputmode="decimal" placeholder="örn. 78,4" value="' + AT.h(baslangic === '' ? '' : AT.fmt(baslangic)) + '"></label>' +
    '<label class="alan"><span>Hedef kilo</span><input id="bulk-hedef" inputmode="decimal" placeholder="örn. 84"></label></div>' +
    '<button class="btn-ac btn-big" data-act="bulk-basla">Hedefi başlat</button></div>';
  return o;
}

function bolumVar(l, b) {
  var r = hesapla(l, b, AT.iso(new Date()), AT.S.kcal), yon = yonOf(b);
  var bugun = AT.iso(new Date()), gun = Math.max(0, gunFark(bugun, b.bas));
  var o = '<h2>' + sezonAd(b) + ' <small>' + (Math.floor(gun / 7) + 1) + '. hafta</small>' + demoTag(b) + '</h2><div class="panel">';
  o += '<div class="hero"><b>' + AT.h(AT.fmt(r.simdi)) + ' <small>kg</small></b><span>ortalama kilo · başlangıçtan ' + AT.h(isaret(r10(r.degisim))) + ' kg</span></div>';
  var tam = r.hedefKg - r.basKg, yuzde = tam ? (r.simdi - r.basKg) / tam * 100 : 100;
  yuzde = Math.round(Math.max(0, Math.min(100, yuzde)));
  o += '<div class="ibar" role="progressbar" aria-label="Hedefe ilerleme" aria-valuenow="' + yuzde + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + yuzde + '%"></i></div>' +
    '<div class="ibar-uc"><span>' + AT.h(AT.fmt(r.basKg)) + ' kg · ' + AT.h(AT.tarih(b.bas, 1)) + '</span><span>hedef ' + AT.h(AT.fmt(r.hedefKg)) + ' kg</span></div>';
  if (r.durum !== 'veri') o += '<p class="durum ' + SINIF[r.durum] + '">' + AT.h(durumMetin(r, yon)) + '</p>';   /* "daha fazla tartı gerekli" ipucu kutusu yok */
  var son = sonKayit(l), ulasti = r.kalan * yon <= 0;
  o += '<dl class="kv">' +
    '<div><dt>Hedefe kalan</dt><dd>' + (ulasti ? 'Hedefe ulaştın' : AT.h(isaret(r10(r.kalan))) + ' kg') + '</dd></div>' +
    '<div><dt>Bu hızla varış</dt><dd>' + (r.varis ? AT.h(AT.tarih(r.varis)) + ' <span class="mut">(~' + Math.max(1, Math.round(gunFark(r.varis, bugun) / 7)) + ' hafta)</span>' : '—') + '</dd></div>' +
    (r.hedefKcal != null ? '<div><dt>Hedef hız için</dt><dd>günde ~' + AT.h(kcalSay(r.hedefKcal)) + '</dd></div>' : '') +
    harcamaSatir(bugun) +
    '</dl>';
  var seri = cizgiSeri(trendSeri(l)).filter(function (p) { return p.date >= b.bas; }), ref = null;
  if (son && son.date > b.bas) {
    var orta = (r.min + r.max) / 2;
    ref = [
      { x: AT.parse(b.bas).getTime(), y: +b.basKg, t: AT.tarih(b.bas, 1) },
      { x: AT.parse(son.date).getTime(), y: r10(b.basKg + orta * gunFark(son.date, b.bas) / 7), t: AT.tarih(son.date, 1) }
    ];
  }
  o += grafik(seri, ref, 'Ortalama kilo ve hedef çizgisi');
  o += '<div class="row">' + (l.length ? '<button class="btn-ghost mini" data-act="bw-geri">Son kaydı sil</button>' : '') +
    '<span class="grow"></span><button class="btn-ghost mini" data-act="bulk-ayar">Hedefi düzenle</button></div>';
  return o + '</div>' + kaloriGecmisi(bugun);
}

/* bugünün kalori toplamı + giriş. "+650" öğün ekler, düz sayı günün toplamını değiştirir */
function kcalBugun(bugun) { var k = kcalGecerli(AT.S.kcal).filter(function (x) { return x.date === bugun; }); return k.length ? k[0] : null; }
function kcalGir(bugun) {
  var k = kcalBugun(bugun);
  return '<div class="row kcalrow"><input id="kcalgir" class="grow" inputmode="text" autocomplete="off" placeholder="' + (k ? 'öğün ekle: +650' : 'kalori, örn. 2800 · öğün +650') + '" aria-label="Bugün yediğin kalori">' +
    '<button data-act="kcal-ekle">' + (k ? 'Ekle' : 'Kaydet') + '</button></div>' +
    (k ? '<p class="kcal-bugun">Bugün: <b>' + AT.h(kcalSay(k.kcal)) + '</b>' + demoTag(k) + ' <button class="btn-ghost mini" data-act="kcal-sil">Sıfırla</button></p>' : '');
}
var duzelt = false;
function tarti() {
  var l = gecerli(AT.S.bw), bugun = AT.iso(new Date()), ac = duzelt; duzelt = false;
  var bk = l.filter(function (b) { return b.date === bugun; });
  var t = bk.filter(function (b) { return !b.demo; }).pop() || bk.pop();
  var o = '<h2>Bugünkü kilo ve kalori</h2><div class="panel">';
  if (t && !ac) {
    o += '<div class="row"><span class="grow">Bugün: <b>' + AT.h(AT.fmt(t.kg)) + ' kg</b> ✓' + demoTag(t) + '</span><button class="btn-ghost mini" data-act="tarti-duzelt">Düzelt</button></div>';
  } else {
    o += kiloGir(t ? 'Düzelt' : 'Kaydet');
  }
  o += kcalGir(bugun);
  var b = AT.S.bulk;
  if (b) {
    var r = hesapla(l, b, bugun, AT.S.kcal);
    if (r.durum !== 'veri') o += '<p class="durum ' + SINIF[r.durum] + '">' + AT.h(kisaDurum(r, sezonAd(b).split(' ')[0])) + '</p>';
  }
  return o + '</div>';
}

/* ---------- ayar alt sayfası ---------- */
function ayarSheet() {
  var b = AT.S.bulk; if (!b) return;
  function alan(id, et, v, tip) {
    return '<label class="alan"><span>' + AT.h(et) + '</span><input id="' + id + '" ' + (tip === 'date' ? 'type="date"' : 'inputmode="decimal"') + ' value="' + AT.h(v) + '"></label>';
  }
  AT.sheet('<h3>Kilo hedefi</h3>' +
    alan('ba-bas', 'Başlangıç tarihi', b.bas, 'date') +
    '<div class="alanlar">' + alan('ba-baskg', 'Başlangıç kilosu', AT.fmt(b.basKg)) + alan('ba-hedef', 'Hedef kilo', AT.fmt(b.hedefKg)) + '</div>' +
    '<div class="alanlar">' + alan('ba-min', 'Haftalık hız en az (kg)', AT.fmt(b.min, 2)) + alan('ba-max', 'Haftalık hız en çok (kg)', AT.fmt(b.max, 2)) + '</div>' +
    '<p class="mut">Haftalık hız: kilonun haftada kaç kg değişmesini istediğin. Kilo vermek (cut) için eksi yaz, örn. −0,8 ile −0,4.</p>' +
    '<button class="btn-ac btn-big" data-act="bulk-kaydet">Kaydet</button>' +
    '<button class="btn-big btn-bad" data-act="bulk-bitir">Hedefi bitir</button>' +
    '<button class="btn-big btn-ghost" data-act="kapat">Kapat</button>');
}
function sayi(id) { var e = AT.$('#' + id); return e ? AT.num(String(e.value).replace('−', '-')) : NaN; }
function kgOk(n) { return n >= 20 && n <= 400; }

AT.islem['bulk-basla'] = function () {
  var bas = sayi('bulk-baskg'), hedef = sayi('bulk-hedef');
  if (!kgOk(bas) || !kgOk(hedef)) return AT.toast('Kiloları 20–400 kg arası gir');
  bas = r10(bas); hedef = r10(hedef);
  if (bas === hedef) return AT.toast('Hedef, başlangıçtan farklı olmalı');
  var v = varsayilanHiz(bas, hedef);
  AT.S.bulk = { bas: AT.iso(new Date()), basKg: bas, hedefKg: hedef, min: v.min, max: v.max };
  AT.kaydet(); AT.render(); AT.toast(sezonAd(AT.S.bulk) + ' başladı');
};
AT.islem['bulk-ayar'] = ayarSheet;
AT.islem['bulk-kaydet'] = function () {
  var b = AT.S.bulk; if (!b) return AT.kapat();
  var e = AT.$('#ba-bas'), tarih = e ? e.value : '';
  var bas = sayi('ba-baskg'), hedef = sayi('ba-hedef'), min = sayi('ba-min'), max = sayi('ba-max');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || AT.iso(AT.parse(tarih)) !== tarih) return AT.toast('Geçerli bir başlangıç tarihi seç');
  if (tarih > AT.iso(new Date())) return AT.toast('Başlangıç tarihi gelecekte olamaz');
  if (!kgOk(bas) || !kgOk(hedef)) return AT.toast('Kiloları 20–400 kg arası gir');
  if (r10(bas) === r10(hedef)) return AT.toast('Hedef, başlangıçtan farklı olmalı');
  if (!isFinite(min) || !isFinite(max) || Math.abs(min) > 2 || Math.abs(max) > 2) return AT.toast('Haftalık hız −2 ile +2 kg arası olmalı');
  if (!(min < max)) return AT.toast('Haftalık hızda "en az", "en çok"tan küçük olmalı');
  if ((hedef > bas && max <= 0) || (hedef < bas && min >= 0)) return AT.toast('Hız aralığı hedefin yönüyle uyuşmuyor');
  var y = { bas: tarih, basKg: r10(bas), hedefKg: r10(hedef), min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100 };
  if (b.demo) y.demo = true;
  AT.S.bulk = y; AT.kaydet(); AT.kapat(); AT.render(); AT.toast('Kaydedildi');
};
AT.islem['bulk-bitir'] = function () {
  AT.onayla('Hedef bitirilsin mi?', 'Hedef ayarları silinir; kilo kayıtların kalır.', 'bulk-bitir-kesin', 'Hedefi bitir');
};
AT.islem['bulk-bitir-kesin'] = function () { AT.S.bulk = null; AT.kaydet(); AT.kapat(); AT.render(); AT.toast('Hedef bitti'); };
AT.islem['kcal-ekle'] = function () {
  var e = AT.$('#kcalgir'), ham = e ? String(e.value).trim().replace(/\s|\./g, '') : '';
  var ekle = /^\+/.test(ham), v = AT.num(ham.replace(/^\+/, ''));
  var bugun = AT.iso(new Date()), k = kcalBugun(bugun), yeni = ekle ? (k && !k.demo ? +k.kcal : 0) + v : v;   /* örnek kaloriye eklenmez */
  if (!(v > 0) || v > 10000) return AT.toast('Kaloriyi 1–10.000 arası gir (öğün için +650)');
  if (yeni < KCAL_MIN || yeni > KCAL_MAX) return AT.toast(yeni < KCAL_MIN ? 'Günlük toplam en az ' + KCAL_MIN + ' kcal olmalı; öğün eklemek için +' + AT.fmt(v, 0) + ' yaz' : 'Günlük toplam çok yüksek');
  AT.S.kcal = (AT.S.kcal || []).filter(function (x) { return x.date !== bugun; });
  AT.S.kcal.push({ id: AT.uid(), date: bugun, kcal: Math.round(yeni) });
  AT.kaydet(); AT.render(); AT.toast('Bugün ' + kcalSay(Math.round(yeni)));
  var n = AT.$('#kcalgir'); if (n && AT.masaustu && AT.masaustu()) n.focus();
};
AT.islem['kcal-sil'] = function () {
  var bugun = AT.iso(new Date()); AT.S.kcal = (AT.S.kcal || []).filter(function (x) { return x.date !== bugun; });
  AT.kaydet(); AT.render(); AT.toast('Bugünün kalorisi silindi');
};
AT.islem['tarti-duzelt'] = function () { duzelt = true; AT.render(); var e = AT.$('#bwkg'); if (e) e.focus(); };

/* ---------- dışa açılan ---------- */
AT.bulkDurum = function () { return hesapla(AT.S.bw, AT.S.bulk, AT.iso(new Date()), AT.S.kcal); };
AT.harcama = function () { return harcama(AT.S.bw, AT.S.kcal, AT.iso(new Date())); };
AT.bolum.bulk = function () { var l = gecerli(AT.S.bw); return AT.S.bulk ? bolumVar(l, AT.S.bulk) : bolumYok(l); };
AT.bolum.tarti = tarti;
AT.demoBw = demoBw;
/* test/başka modüller için saf hesaplar */
AT.bulkHesap = { cizgiSeri: cizgiSeri, ortalamaKilo: ortalamaKilo, yarimGunAt: yarimGunAt, gecerli: gecerli, gunluk: gunluk, trendSeri: trendSeri, egim: egim, hiz: hizHesap, hizAyrinti: hizAyrinti, durum: durumOf, kcal: kcalOf, varis: varisOf, varsayilanHiz: varsayilanHiz, hesapla: hesapla, durumMetin: durumMetin, kcalGecerli: kcalGecerli, harcama: harcama, haftalikKcal: haftalikKcal, hedefKcal: hedefKcalOf };
})(window.AT);
