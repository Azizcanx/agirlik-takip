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

var gecOnb = null;   /* bu sürümde gecerli(AT.S.bw) çıktısı: harcama önbelleği girdinin durumdan geldiğini tanısın */
function gecerli(l) {
  var out = (l || []).filter(function (b) { return b && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && isFinite(b.kg) && b.kg > 0; })
    .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (AT.surum && AT.S && l === AT.S.bw) gecOnb = { k: AT.surum(), l: out };
  return out;
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
/* a9: varış süresi aralık olarak (hafta): kalan / (hız ± 1,96·SE). Yavaş uç 0'a inerse 'yok' (henüz tahmin yok) */
function varisAralik(kalan, hiz, se) {
  if (hiz == null || !(kalan * hiz > 0)) return null;
  var h = Math.abs(hiz), p = 1.96 * (se > 0 ? se : 0), hizli = h + p, yavas = h - p;
  if (!(yavas > 0.02)) return 'yok';
  var az = Math.max(1, Math.round(Math.abs(kalan) / hizli)), cok = Math.max(az, Math.round(Math.abs(kalan) / yavas));
  return { az: az, cok: cok };
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
/* aynı ekranda harcama 3 kez istenir (hesapla, kaloriGecmisi, harcamaSatir); girdiler uygulama durumuysa (kcal === AT.S.kcal,
   bw === AT.S.bw ya da bu sürümdeki gecerli(AT.S.bw)) sonuç gün + veri sürümüyle saklanır, bir kez hesaplanır. Sonuç yalnız okunur.
   Başka girdiyle (testler, AT.surum yok) her seferinde hesaplanır. */
var hrOnb = { k: null, v: null };
function durumdan(bw, kcal) {
  var S = AT.S; if (!AT.surum || !S || kcal !== S.kcal) return false;
  return bw === S.bw || (!!gecOnb && gecOnb.l === bw && gecOnb.k === AT.surum());
}
function harcama(bw, kcal, bugun) {
  var k = durumdan(bw, kcal) ? bugun + ':' + AT.surum() : null;
  if (k !== null && hrOnb.k === k) return hrOnb.v;
  var v = harcamaHesap(bw, kcal, bugun);
  if (k !== null) hrOnb = { k: k, v: v };
  return v;
}
function harcamaHesap(bw, kcal, bugun) {
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
/* a11: önerilen günlük kalori haftada bir güncellenir: yeni = eski + ½ × (hesaplanan − eski), haftalık değişim en çok ±200,
   50'ye yuvarlı. o = {hafta, deger, anahtar}; anahtar (hedef ayarları) değişti ya da 3 haftadan eskiyse hesaplanan doğrudan alınır.
   Saf: yeni o'yu döndürür, kaydetmez. */
var ONERI_ADIM = 200;
/* d9: eksik = son 7 günde 4'ten az kalori günü (yalnız "iyi günler" girilen hafta harcamayı yukarı çekmesin). Eksikse taze öneri
   (aynı hedef, 3 haftadan yeni) olduğu gibi kalır, saklanmaz; ertesi gün yeniden bakılır. Saklı öneri yoksa / hedef değiştiyse hesaplanan alınır */
function haftalikOneri(o, ham, hafta, anahtar, eksik) {
  if (ham == null || !isFinite(ham)) return null;
  if (o && o.anahtar === anahtar && o.hafta === hafta && isFinite(o.deger)) return o;
  var taze = o && o.anahtar === anahtar && isFinite(o.deger) && gunFark(hafta, o.hafta) > 0 && gunFark(hafta, o.hafta) <= 21;
  if (eksik && taze) return o;
  var d = taze ? o.deger + Math.max(-ONERI_ADIM, Math.min(ONERI_ADIM, 0.5 * (ham - o.deger))) : ham;
  return { hafta: hafta, deger: Math.round(d / 50) * 50, anahtar: anahtar };
}
/* d9: bugünden önceki 7 günde geçerli kalori günü sayısı (bugün yarım olabilir, sayılmaz) */
var ONERI_KCAL_GUN = 4;
function kcalHaftaGun(kcal, bugun) {
  var bas = gunEkle(bugun, -7);
  return kcalGecerli(kcal).filter(function (x) { return x.date >= bas && x.date < bugun; }).length;
}
/* gösterimden önce: r.hedefKcal'i haftalık öneriyle değiştirir, değiştiyse S.kcalOneri'yi saklar */
function oneriUygula(r, bulk, bugun) {
  if (!r || r.hedefKcal == null || r.durum === 'erken' || r.durum === 'veri') return r;   /* ilk 2 hafta ve bayat tartıda saklanan öneri değişmez */
  var anahtar = [bulk.bas, bulk.hedefKg, bulk.min, bulk.max].join('|'), o = AT.S.kcalOneri;
  var y = haftalikOneri(o, r.hedefKcal, AT.haftaBasi(bugun), anahtar, kcalHaftaGun(AT.S.kcal, bugun) < ONERI_KCAL_GUN);
  if (y && (!o || y.hafta !== o.hafta || y.deger !== o.deger || y.anahtar !== o.anahtar)) { AT.S.kcalOneri = y; AT.kaydet(); }
  if (y) r.hedefKcal = y.deger;
  return r;
}
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
    varisAralik: durum === 'erken' || durum === 'veri' ? null : varisAralik(kalan, hiz, ay ? ay.se : 0),
    hedefKg: +bulk.hedefKg, basKg: +bulk.basKg,
    tdee: hr.tdee != null ? hr.tdee : null, ortKcal: hr.ortKcal != null ? hr.ortKcal : null,
    /* ilk 14 gün ('erken') ve bayat tartıda ('veri') kalori önerisi yok: ekranda "14. günden sonra" yazarken sayı gösterilmesin */
    hedefKcal: hr.tdee != null && durum !== 'erken' && durum !== 'veri' ? hedefKcalOf(hr.tdee, min, max) : null
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
    var kc = Math.round((2600 + 330 + (rnd() - 0.5) * 600) / 10) * 10, mp = 140 + j * 7 % 21, my = 78 + j * 5 % 15;
    /* makrolar rnd() çağırmadan türetilir (örnek kilo/kalori dizisi değişmesin); 4·P + 4·K + 9·Y = kcal */
    kcal.push({ id: 'dkc' + j, date: AT.iso(dk), kcal: kc, p: mp, k: Math.round((kc - 4 * mp - 9 * my) / 4), y: my, demo: true });
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
/* durum satırı: iyi/uyarı renkli; 'erken' (ilk 14 gün) düz sonuç satırı (bilgi kutusu yok, Aziz'in kararı); 'veri' hiç yok */
function durumSatiri(r, metin) {
  if (r.durum === 'veri') return '';
  if (r.durum === 'erken') return '<p class="mut kucuk durum-duz">' + AT.h(metin) + '</p>';
  return '<p class="durum ' + SINIF[r.durum] + '">' + AT.h(metin) + '</p>';
}
function sezonAd(b) { return yonOf(b) > 0 ? 'Bulk sezonu' : 'Cut sezonu'; }
function durumMetin(r, yon) {
  if (r.durum === 'veri') return 'Gidişatı görmek için en az 4 tartı ve 1 hafta gerekli.';
  var hz = 'haftada ' + hizYaz(r.hiz) + ' kg';
  if (r.durum === 'erken') return 'İlk tahmin: ' + hz + ' (hedef ' + aralikYaz(r.min, r.max) + ' kg) · kalori önerisi 14. günden sonra';
  /* aynı ekrandaki "Hedef hız için günde ~X" ile aynı sayı (önceden ortalama yenen ile 10 kcal farklı iki sayı çıkıyordu) */
  var dev = r.hedefKcal != null ? r.hedefKcal : r.ortKcal;
  if (r.durum === 'iyi') return 'Doğru hızdasın: ' + hz + ' (hedef ' + aralikYaz(r.min, r.max) + ' kg).' + (dev != null ? ' Günde ~' + kcalSay(dev) + ' ile böyle devam.' : '');
  if (r.durum === 'hizli') return 'Fazla hızlı: ' + hz + (yon > 0 ? ', yağ alıyor olabilirsin. ' : ', kas kaybedebilirsin. ') + kcalYaz(r.kcal, r);
  if (r.hiz * yon < 0) return (yon > 0 ? 'Kilo düşüyor: ' : 'Kilo artıyor: ') + hz + '. ' + kcalYaz(r.kcal, r);
  return 'Yavaş: ' + hz + '. ' + kcalYaz(r.kcal, r);
}
/* Bugün ekranındaki tek satır, ör. "Bulk iyi gidiyor: haftada +0,33 kg" */
function kisaDurum(r, ad) {
  if (r.durum === 'veri') return ad + ': gidişat için birkaç tartı daha gerekli';
  var hz = 'haftada ' + hizYaz(r.hiz) + ' kg';
  if (r.durum === 'erken') return ad + ' ilk tahmin: ' + hz;
  if (r.durum === 'iyi') return ad + ' iyi gidiyor: ' + hz;
  return ad + (r.durum === 'hizli' ? ' fazla hızlı: ' : ' yavaş: ') + hz + ' · ' +
    (r.hedefKcal != null ? 'günde ~' + kcalSay(r.hedefKcal) + ' ye' : 'günde ~' + AT.fmt(Math.abs(r.kcal), 0) + ' kcal ' + (r.kcal > 0 ? 'fazla' : 'az') + ' ye');
}
function demoTag(b) { return b && b.demo ? ' <span class="tag demo">örnek</span>' : ''; }

/* ---------- görünüm parçaları ---------- */
function kiloGir(etiket) {
  return '<div class="row"><input id="bwkg" class="grow" inputmode="decimal" placeholder="kg, örn. 82,4" aria-label="Vücut ağırlığı kg"><button class="btn-ac" data-act="bw-ekle">' + AT.h(etiket || 'Kaydet') + '</button></div>';
}
/* Apple teması: kilo grafiği zaman aralığı (1A/3A/6A/1Y/Tümü); yalnız gösterim, veri 45 günden uzunsa */
var kiloAralik = 0, ARALIKLAR = [['1A', 30], ['3A', 90], ['6A', 180], ['1Y', 365], ['Tümü', 0]];
function aralikUygula(seri, ref) {
  var apple = typeof document !== 'undefined' && document.documentElement.dataset.tema === 'apple';
  if (!apple || seri.length < 2 || gunFark(seri[seri.length - 1].date, seri[0].date) <= 45) return { seri: seri, ref: ref, kontrol: '' };
  var kontrol = '<div class="seg aralik" role="group" aria-label="Zaman aralığı">' + ARALIKLAR.map(function (a) {
    return '<button data-act="kilo-aralik" data-v="' + a[1] + '" aria-pressed="' + (kiloAralik === a[1]) + '">' + a[0] + '</button>'; }).join('') + '</div>';
  if (!kiloAralik) return { seri: seri, ref: ref, kontrol: kontrol };
  var son = AT.parse(seri[seri.length - 1].date).getTime(), kes = son - kiloAralik * 864e5;
  var s2 = seri.filter(function (p) { return AT.parse(p.date).getTime() >= kes; });
  if (s2.length < 2) return { seri: seri, ref: ref, kontrol: kontrol };
  var r2 = ref;
  if (ref && ref.length > 1 && ref[0].x < kes) {
    var a = ref[0], b = ref[ref.length - 1], k = (kes - a.x) / (b.x - a.x);
    r2 = [{ x: kes, y: r10(a.y + (b.y - a.y) * k), t: AT.tarih(AT.iso(new Date(kes)), 1) }, b];
  }
  return { seri: s2, ref: r2, kontrol: kontrol };
}
AT.islem['kilo-aralik'] = function (d) { kiloAralik = +d.v || 0; AT.render(); };
function grafik(seri, ref, baslik, kn) {
  if (!seri.length) return '<p class="mut">Tartı ekledikçe grafik burada oluşur.</p>';
  var ar = aralikUygula(seri, ref); seri = ar.seri; ref = ar.ref;
  /* çizgi = ortalama kilo; ham tartılar soluk nokta (kısa seride), dokununca o günün tartısı ve hedef çizgisinin değeri */
  var o = { baslik: baslik, birim: 'kg', seriAd: 'ortalama kilo', ham: true, ek: function (p) { return p.ham > 0 ? 'tartı ' + AT.fmt(p.ham) + ' kg' : ''; } };
  if (ref) { o.ref = ref; o.refAd = 'hedef hız'; }
  if (kn) { o.koni = kn.koni; o.hedef = kn.hedef; }
  return ar.kontrol + AT.cizgi(seri.map(function (p) { return { x: AT.parse(p.date).getTime(), y: r10(p.kg), t: AT.tarih(p.date, 1), ham: p.ham }; }), o);
}
/* büyük kilo rakamı: data-say öznitelikli (app.js sayData; yoksa düz metin) */
function buyukKg(n) { return AT.sayData ? AT.sayData(n, 1) : AT.h(AT.fmt(n)); }
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
/* makrolu gün varsa: son 7 tamamlanmış günün ortalaması + kilo başına protein (ortalama kiloya göre) */
function makroSatir(bugun) {
  var o = makroOrt(AT.S.kcal, bugun, 7); if (!o) return '';
  var l = gecerli(AT.S.bw), kg = l.length ? ortalamaKilo(l) : null;
  return '<div><dt>Makrolar <small>' + o.gun + ' gün ort.</small></dt><dd>' + AT.h(makroYaz(o)) + '</dd></div>' +
    (kg > 0 && o.p > 0 ? '<div><dt>Protein kilo başına</dt><dd>' + AT.h(AT.fmt(o.p / kg, 1)) + ' g/kg</dd></div>' : '');
}
function kaloriGecmisi(bugun) {
  var h = haftalikKcal(AT.S.kcal, bugun, 8);
  if (!h.some(function (x) { return x.gun; })) return '';
  var hr = harcama(AT.S.bw, AT.S.kcal, bugun);
  /* özet: harcama hazırsa sayı, değilse ne kadar kaldığı (ör. "harcama için 6/10 gün") */
  var oz = hr.tdee != null ? 'harcama ~' + kcalSay(hr.tdee) : hr.eksik && !hr.eksik.eski && hr.eksik.kcalGun < TDEE_KCAL_GUN ? 'harcama için ' + hr.eksik.kcalGun + '/' + TDEE_KCAL_GUN + ' gün' : 'haftalık';
  var hs = harcamaSatir(bugun) + makroSatir(bugun);
  return '<details class="katla"><summary>Kalori ve harcama <small>' + AT.h(oz) + '</small></summary>' + (hs ? '<dl class="kv">' + hs + '</dl>' : '') +
    AT.cubuk(h.map(function (x) { return { l: AT.tarih(x.bas, 1), v: Math.round(x.ort) }; }), { baslik: 'Haftalık ortalama kalori', birim: 'kcal' }) + '</details>';
}

function bolumYok(l) {
  var o = '<h2>Vücut ağırlığı</h2><div class="panel">';
  var son = sonKayit(l), tr = trendSeri(l), trSon = tr.length ? ortalamaKilo(l) : null;
  if (son) {
    o += '<div class="hero"><b>' + buyukKg(trSon) + ' <small>kg</small></b><span>ortalama kilo · son tartı ' + AT.h(AT.fmt(son.kg)) + ' kg, ' + AT.h(AT.tarih(son.date, 1)) + demoTag(son) + '</span></div>';
    o += grafik(cizgiSeri(tr), null, 'Ortalama vücut ağırlığı');
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

/* GELECEK KONİSİ: çizginin sonundan hedefe, bugünkü hız ± 1,96·SE ile açılan olasılık konisi (varisAralik ile aynı hız/SE).
   Varış aralığı varsa kenarlar varış aralığının iki ucunda hedefi keser (hızlı kenar sonra hedef boyunca düz; kama), eksen yavaş uca
   ya da +12 haftaya (kısası) uzar, eksende varış bandı + "~16 Ara" (r.varis: "Bu hızla varış" satırıyla aynı tarih).
   Aralık yoksa ('yok': yavaş uç ≤0; hedef geçildi/ters yön) koni 4 hafta ileri, varış etiketi yok. 'erken'/'veri': koni yok.
   Dönüş: {koni, hedef} (AT.cizgi seçenekleri) ya da null. seri: grafikteki cizgiSeri; ay: hizAyrinti (hesapla ile aynı girdi) */
var KONI_UZUN = 84, KONI_KISA = 28, GUN_MS = 864e5;
function koniOf(seri, r, ay, bugun) {
  if (!r || r.durum === 'erken' || r.durum === 'veri' || r.hiz == null || !ay || seri.length < 2) return null;
  var son = seri[seri.length - 1], x0 = AT.parse(son.date).getTime(), y0 = r10(son.kg), bg = AT.parse(bugun).getTime();
  var p = 1.96 * (ay.se > 0 ? ay.se : 0), a = r.varisAralik, hd = r.hedefKg, yon = hd < r.basKg ? -1 : 1;
  var hedef = { y: hd, ad: 'hedef ' + AT.fmt(hd) + ' kg', alt: y0 > hd };
  function kes(xh, x) { return y0 + (hd - y0) * (x - x0) / (xh - x0); }   /* (x0,y0)'dan (xh, hedef)'e doğru, x'teki değer */
  if (a && a !== 'yok' && (hd - y0) * yon > 0) {
    var h = Math.abs(r.hiz), kal = Math.abs(r.kalan);
    var xF = bg + kal / (h + p) * 7 * GUN_MS, xS = bg + kal / (h - p) * 7 * GUN_MS, xV = r.varis ? AT.parse(r.varis).getTime() : bg + kal / h * 7 * GUN_MS;
    var x1 = Math.min(xS, bg + KONI_UZUN * GUN_MS), vic = xV <= x1;
    return { hedef: hedef, koni: {
      a: xF < x1 ? [[x0, y0], [xF, hd], [x1, hd]] : [[x0, y0], [x1, kes(xF, x1)]],
      b: [[x0, y0], [x1, xS <= x1 ? hd : kes(xS, x1)]],
      o: [[x0, y0], vic ? [xV, hd] : [x1, kes(xV, x1)]],
      v: vic ? [xV, hd] : null,
      bant: xF < x1 ? [xF, x1] : null,
      etiket: vic && r.varis ? '~' + AT.tarih(r.varis, 1) : null, ex: xV,
      ozet: 'Tahmin: hedefe ' + (a.az === a.cok ? a.az : a.az + '–' + a.cok) + ' hafta' + (r.varis ? ', ' + AT.tarih(r.varis, 1) + ' civarı' : '')
    } };
  }
  var x2 = bg + KONI_KISA * GUN_MS, gun = (x2 - x0) / GUN_MS;
  return { hedef: hedef, koni: {
    a: [[x0, y0], [x2, y0 + (r.hiz + p) / 7 * gun]], b: [[x0, y0], [x2, y0 + (r.hiz - p) / 7 * gun]], o: [[x0, y0], [x2, y0 + r.hiz / 7 * gun]],
    ozet: '4 haftalık tahmin: ' + AT.fmt(y0 + (r.hiz - p) / 7 * gun) + '–' + AT.fmt(y0 + (r.hiz + p) / 7 * gun) + ' kg'
  } };
}
/* "~6–9 hafta (9 Ara civarı)"; aralık yoksa tek tarih; yavaş uç belirsizse "henüz tahmin yok" */
function varisYaz(r) {
  var a = r.varisAralik;
  if (a === 'yok') return '<span class="mut">henüz tahmin yok</span>';
  if (!r.varis) return '—';
  if (!a) return AT.h(AT.tarih(r.varis));
  return '~' + (a.az === a.cok ? a.az : a.az + '–' + a.cok) + ' hafta <span class="mut">(' + AT.h(AT.tarih(r.varis, 1)) + ' civarı)</span>';
}
function bolumVar(l, b) {
  var r = oneriUygula(hesapla(l, b, AT.iso(new Date()), AT.S.kcal), b, AT.iso(new Date())), yon = yonOf(b);
  var bugun = AT.iso(new Date()), gun = Math.max(0, gunFark(bugun, b.bas));
  var o = '<h2>' + sezonAd(b) + ' <small>' + (Math.floor(gun / 7) + 1) + '. hafta</small>' + demoTag(b) + '</h2><div class="panel">';
  o += '<div class="hero"><b>' + buyukKg(r.simdi) + ' <small>kg</small></b><span>ortalama kilo · başlangıçtan <i class="fark' + (r10(r.degisim) * yon > 0 ? ' iyi' : '') + '">' + AT.h(isaret(r10(r.degisim))) + ' kg</i></span></div>';
  var tam = r.hedefKg - r.basKg, yuzde = tam ? (r.simdi - r.basKg) / tam * 100 : 100;
  yuzde = Math.round(Math.max(0, Math.min(100, yuzde)));
  o += '<div class="ibar" role="progressbar" aria-label="Hedefe ilerleme" aria-valuenow="' + yuzde + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + yuzde + '%"></i></div>' +
    '<div class="ibar-uc"><span>' + AT.h(AT.fmt(r.basKg)) + ' kg · ' + AT.h(AT.tarih(b.bas, 1)) + '</span><span>hedef ' + AT.h(AT.fmt(r.hedefKg)) + ' kg</span></div>';
  o += durumSatiri(r, durumMetin(r, yon));
  var son = sonKayit(l), ulasti = r.kalan * yon <= 0;
  o += '<dl class="kv">' +
    '<div><dt>Hedefe kalan</dt><dd>' + (ulasti ? 'Hedefe ulaştın' : AT.h(isaret(r10(r.kalan))) + ' kg') + '</dd></div>' +
    '<div><dt>Bu hızla varış</dt><dd>' + varisYaz(r) + '</dd></div>' +
    (r.hedefKcal != null ? '<div><dt>Hedef hız için</dt><dd>günde ~' + AT.h(kcalSay(r.hedefKcal)) + '</dd></div>' : '') +
    '</dl>';   /* harcama ve ortalama yediğin: Kalori geçmişi katlanırında */
  var seri = cizgiSeri(trendSeri(l)).filter(function (p) { return p.date >= b.bas; }), ref = null;
  if (son && son.date > b.bas) {
    var orta = (r.min + r.max) / 2;
    ref = [
      { x: AT.parse(b.bas).getTime(), y: +b.basKg, t: AT.tarih(b.bas, 1) },
      { x: AT.parse(son.date).getTime(), y: r10(b.basKg + orta * gunFark(son.date, b.bas) / 7), t: AT.tarih(son.date, 1) }
    ];
  }
  o += grafik(seri, ref, 'Ortalama kilo ve hedef çizgisi', koniOf(seri, r, r.durum === 'erken' || r.durum === 'veri' ? null : hizAyrinti(l, b.bas), bugun));
  o += '<div class="row">' + (l.length ? '<button class="btn-ghost mini" data-act="bw-geri">Son kaydı sil</button>' : '') +
    '<span class="grow"></span><button class="btn-ghost mini" data-act="bulk-ayar">Hedefi düzenle</button></div>';
  return o + '</div>' + kaloriGecmisi(bugun);
}

/* ---------- makrolar (isteğe bağlı): günün kalori kaydına p/k/y gram; S.kcal [{id, date, kcal, p?, k?, y?}] ----------
   "Makro ile ekle": girilen gramlar günün toplamına eklenir, kalorisi 4·P + 4·K + 9·Y olarak kaloriye de eklenir
   (aynı öğünü ayrıca "+kcal" yazmaya gerek yok). Eşitleme kaydı alan alan birleştirir (esitle.js). */
var MAKRO = [['p', 'Protein', 4], ['k', 'Karb', 4], ['y', 'Yağ', 9]], MAKRO_ACIK_GUN = 14;
function makroKcal(m) { return MAKRO.reduce(function (t, x) { return t + (+m[x[0]] > 0 ? +m[x[0]] * x[2] : 0); }, 0); }
function makroVar(k) { return !!k && MAKRO.some(function (x) { return +k[x[0]] > 0; }); }
function makroYaz(k) { return MAKRO.map(function (x) { return x[0].toLocaleUpperCase('tr') + ' ' + AT.fmt(+k[x[0]] || 0, 0); }).join(' · ') + ' g'; }
/* tamamlanmış son n günün (bugün hariç) makro ortalaması; makrolu gün yoksa null */
function makroOrt(kcal, bugun, n) {
  var bas = gunEkle(bugun, -n), l = (kcal || []).filter(function (k) { return k && k.date >= bas && k.date < bugun && makroVar(k); });
  if (!l.length) return null;
  var o = { gun: l.length };
  MAKRO.forEach(function (x) { o[x[0]] = l.reduce(function (t, k) { return t + (+k[x[0]] || 0); }, 0) / l.length; });
  return o;
}

/* bugünün kalori toplamı + giriş. "+650" öğün ekler, düz sayı günün toplamını değiştirir.
   Bugünün kaydı ham okunur: 300 kcal altı (ör. ilk öğün bir shake) da görünür ve üstüne eklenir; harcama yine kcalGecerli ile süzer */
function kcalBugun(bugun) { var k = (AT.S.kcal || []).filter(function (x) { return x && x.date === bugun; }); return k.length ? k[k.length - 1] : null; }
/* günlük protein hedefi: kilo × 1,8 g (1,6–2,2 aralığının alt-orta ucu); kilo = İlerleme'deki "Protein kilo başına" ile aynı kaynak (ortalamaKilo) */
var PROTEIN_GKG = 1.8, PROTEIN_YETER = 1.6;
function proteinKg() { var l = gecerli(AT.S.bw), kg = l.length ? ortalamaKilo(l) : null; return kg > 0 ? kg : null; }
function proteinHedef() { var kg = proteinKg(); return kg ? Math.round(kg * PROTEIN_GKG / 5) * 5 : null; }
/* d12: protein çubuğu. Hedef 1,8 g/kg (işaret çubuğun %80'inde, tam boy = hedef × 1,25); 1,6 g/kg'ı geçince "tamam" tonu
   (kazancın kırılma noktası ~1,6, Nunes 2022), altında nötr. Kırmızı yok. Saf: {hedef, yeter, max, yuzde, isaret, tamam} */
function proteinDurum(g, kg) {
  if (!(kg > 0)) return null;
  var hedef = Math.round(kg * PROTEIN_GKG / 5) * 5, max = hedef * 1.25;
  return { hedef: hedef, yeter: kg * PROTEIN_YETER, max: max, yuzde: Math.max(0, Math.min(100, g / max * 100)), isaret: hedef / max * 100, tamam: g >= kg * PROTEIN_YETER };
}
/* kalori çubuğu: önceki yüzdeden yenisine akar (yalnız değer değişince; ilk çizimde 0'dan). Yalnız bu oturumda, gösterim */
var kcalYuzde = null, makroAcik = null;
function cubukHtml(sinif, yuzde, eski, etiket, now, max, stil) {
  var w = Math.round(Math.max(0, Math.min(100, yuzde)));
  var akar = eski !== undefined && eski !== w ? ' class="akar" style="--o:' + (eski || 0) + '%;width:' + w + '%"' : ' style="width:' + w + '%"';
  return '<div class="' + sinif + '"' + (stil ? ' style="' + stil + '"' : '') + ' role="progressbar" aria-label="' + AT.h(etiket) + '" aria-valuenow="' + Math.round(now) + '" aria-valuemin="0" aria-valuemax="' + Math.round(max) + '"><i' + akar + '></i></div>';
}
/* bugünün kalori toplamı: hedef varsa "2.740 / 3.000 kcal · 260 kaldı" + ince çubuk (aşınca dolu, "+120 fazla", sakin renk);
   hedef yoksa (ilk 14 gün, bayat tartı, hedef yok) yalnız sayı. Makro yazıldıysa altında P/K/Y şeridi (protein hedefe göre mini çubuk) */
/* app.js sayarak yükselen sayı: öğenin içindeki ilk biçimli değer önceki gösterilenden yeniye sayar (yalnız öznitelik) */
function sayOz(kc) { return ' data-say="' + Math.round(kc) + '" data-say-ad="bugun-kcal"'; }
function kcalOzet(k, hedef, yon) {
  if (!k && hedef == null) return '';
  var kc = k ? +k.kcal || 0 : 0, o = '';
  if (hedef != null) {
    var fark = Math.round(hedef - kc), tam = fark <= 0, w = kc / hedef * 100, eski = kcalYuzde;
    kcalYuzde = Math.round(Math.min(100, w));
    var not = !k ? '' : fark > 0 ? AT.fmt(fark, 0) + ' kaldı' : fark < 0 ? '+' + AT.fmt(-fark, 0) + ' fazla' : 'hedef tamam';
    o += '<div class="kc-ozet' + (tam ? ' tam' : '') + (tam && yon > 0 ? ' iyi' : '') + '"><div class="kc-ust"><span class="kc-say"' + sayOz(kc) + '><b>' + AT.h(AT.fmt(kc, 0)) + '</b> / ' + AT.h(kcalSay(hedef)) + '</span>' + demoTag(k) +
      (not ? '<span class="kc-not">' + AT.h(not) + '</span>' : '') + '</div>' +
      cubukHtml('ibar kc-bar', w, eski === null ? 0 : eski, 'Bugünkü kalori, hedef ' + kcalSay(hedef), kc, hedef);
  } else {
    o += '<div class="kc-ozet"><div class="kc-ust"><span class="kc-say"' + sayOz(kc) + '><b>' + AT.h(AT.fmt(kc, 0)) + '</b> kcal</span>' + demoTag(k) + '</div>';
  }
  if (makroVar(k)) {
    var pkg = proteinKg();
    o += '<ul class="mk-serit" aria-label="Bugünkü makrolar">' + MAKRO.map(function (x) {
      var g = +k[x[0]] || 0, pd = x[0] === 'p' ? proteinDurum(g, pkg) : null, hp = pd ? pd.hedef : null;
      return '<li class="mk-' + x[0] + '"><span>' + x[1] + '</span><b>' + AT.h(AT.fmt(g, 0)) + '<small>' + (hp ? ' / ' + AT.h(AT.fmt(hp, 0)) : '') + ' g</small></b>' +
        (pd ? cubukHtml('mk-bar mk-pbar' + (pd.tamam ? ' tamam' : ''), pd.yuzde, undefined, 'Protein, hedef ' + AT.fmt(hp, 0) + ' g' + (pd.tamam ? ', yeterli' : ''), g, pd.max, '--hedef:' + pd.isaret.toFixed(1) + '%') : '') + '</li>';
    }).join('') + '</ul>';
  }
  return o + '</div>';
}
function kcalGir(bugun, hedef, yon) {
  var k = kcalBugun(bugun), bas = gunEkle(bugun, -MAKRO_ACIK_GUN);
  /* son 2 haftada makro yazıldıysa açık gelir; hiç kullanılmadıysa tek satır kapalı durur. Elle açıp kapatma bu oturumda hatırlanır */
  var acik = makroAcik != null ? makroAcik : (AT.S.kcal || []).some(function (x) { return x && x.date >= bas && makroVar(x); });
  return kcalOzet(k, hedef, yon) +
    '<div class="row kcalrow"><input id="kcalgir" class="grow" inputmode="text" autocomplete="off" placeholder="' + (k ? 'öğün ekle: +650' : 'kalori, örn. 2800 · öğün +650') + '" aria-label="Bugün yediğin kalori">' +
    '<button data-act="kcal-ekle">' + (k ? 'Ekle' : 'Kaydet') + '</button></div>' +
    '<div class="kc-alt"><details class="makro"' + (acik ? ' open' : '') + '><summary>Makro ile ekle</summary><div class="row makrorow">' +
    MAKRO.map(function (x) { return '<label class="mk-alan"><span>' + x[1] + ' g</span><input id="mk-' + x[0] + '" inputmode="decimal" autocomplete="off" aria-label="' + x[1] + ', gram"></label>'; }).join('') +
    '<button data-act="makro-ekle">Ekle</button></div><p class="mut kucuk makro-kcal" id="mk-kcal"></p></details>' +
    (k ? '<button class="btn-ghost mini kc-sil" data-act="kcal-sil">Sıfırla</button>' : '') + '</div>';
}
/* yalnız kullanıcının dokunuşu hatırlanır (toggle olayı çizimde open ile de gelir); klavyede Enter/Boşluk da click üretir */
if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
  var s = ev.target && ev.target.closest ? ev.target.closest('.panel.tarti details.makro>summary') : null;
  if (s) makroAcik = !s.parentNode.open;
});
/* makro kutularına yazarken eklenecek kaloriyi göster */
if (typeof document !== 'undefined') document.addEventListener('input', function (ev) {
  if (!ev.target || !/^mk-[pky]$/.test(ev.target.id || '')) return;
  var m = {}, e = AT.$('#mk-kcal'); MAKRO.forEach(function (x) { var i = AT.$('#mk-' + x[0]); m[x[0]] = i ? AT.num(String(i.value).trim()) : NaN; });
  var c = makroKcal(m); if (e) e.textContent = c > 0 ? '+' + kcalSay(Math.round(c)) + ' eklenecek' : '';
});
/* bugünün kaydını değiştir: varsa (örnek değilse) kopyası üzerinde, yoksa yeni; id korunur, eşitleme tarih + alan bazında */
function gunuGuncelle(bugun, fn) {
  var eski = kcalBugun(bugun), k = eski && !eski.demo ? Object.assign({}, eski) : { id: AT.uid(), date: bugun, kcal: 0 };
  fn(k);
  AT.S.kcal = (AT.S.kcal || []).filter(function (x) { return x.date !== bugun; });
  AT.S.kcal.push(k);
  return k;
}
var duzelt = false;
function tarti() {
  var l = gecerli(AT.S.bw), bugun = AT.iso(new Date()), ac = duzelt; duzelt = false;
  var bk = l.filter(function (b) { return b.date === bugun; });
  var t = bk.filter(function (b) { return !b.demo; }).pop() || bk.pop();
  var b = AT.S.bulk, r = b ? oneriUygula(hesapla(l, b, bugun, AT.S.kcal), b, bugun) : null;
  var o = '<h2>Bugünkü kilo ve kalori</h2><div class="panel tarti">';
  if (t && !ac) {
    var ok = l.filter(function (x) { return x.date < bugun && !x.demo === !t.demo; }).pop();
    o += '<div class="row kilo-bugun"><span class="grow" data-say="' + (+t.kg) + '" data-say-ond="1" data-say-ad="bugun-kilo"' + (ok ? ' data-say-bas="' + (+ok.kg) + '"' : '') + '>Bugün: <b>' + AT.h(AT.fmt(t.kg)) + ' kg</b> ✓' + demoTag(t) + kiloFark(l, t, bugun) + '</span><button class="btn-ghost mini" data-act="tarti-duzelt">Düzelt</button></div>';
  } else {
    o += kiloGir(t ? 'Düzelt' : 'Kaydet');
  }
  o += kcalGir(bugun, r ? r.hedefKcal : null, b ? yonOf(b) : 1);
  if (r) o += durumSatiri(r, kisaDurum(r, sezonAd(b).split(' ')[0]));
  return o + '</div>';
}
/* bugünkü tartının bir önceki tartıya göre farkı (dün ya da en çok 7 gün önce; örnek ile gerçek karışmaz), ör. "+0,2 dünden" */
function kiloFark(l, t, bugun) {
  var o = l.filter(function (x) { return x.date < bugun && !x.demo === !t.demo; }).pop();
  if (!o) return '';
  var g = gunFark(bugun, o.date); if (g > 7) return '';
  var f = r10(t.kg - o.kg);
  return ' <span class="kfark" title="' + AT.h(AT.tarih(o.date, 1) + ' tartısı ' + AT.fmt(o.kg) + ' kg') + '">' + (f ? AT.h(isaret(f)) : '±0') + ' <small>' + (g === 1 ? 'dünden' : g + ' günde') + '</small></span>';
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
AT.islem['kcal-ekle'] = function (d) {
  var e = AT.$('#kcalgir'), ham = d && d.v != null ? String(d.v).replace(/\s|\./g, '') : e ? String(e.value).trim().replace(/\s|\./g, '') : '';   /* d.v: setdil.js "650 kalori yedim" */
  var ekle = /^\+/.test(ham), v = AT.num(ham.replace(/^\+/, ''));
  var bugun = AT.iso(new Date()), k = kcalBugun(bugun), yeni = ekle ? (k && !k.demo ? +k.kcal || 0 : 0) + v : v;   /* örnek kaloriye eklenmez */
  if (!(v > 0) || v > 10000) return AT.toast('Kaloriyi 1–10.000 arası gir (öğün için +650)');
  /* düz sayı günün toplamıdır, 300 altı büyük ihtimalle yanlışlık; "+" ile küçük öğün (ör. shake) eklenebilir */
  if (!ekle && yeni < KCAL_MIN) return AT.toast('Günlük toplam en az ' + KCAL_MIN + ' kcal olmalı; öğün eklemek için +' + AT.fmt(v, 0) + ' yaz');
  if (yeni > KCAL_MAX) return AT.toast('Günlük toplam çok yüksek');
  var g = gunuGuncelle(bugun, function (x) { x.kcal = Math.round(yeni); });   /* makrolar korunur */
  AT.kaydet(); AT.render(); AT.toast('Bugün ' + kcalSay(g.kcal));
  var n = AT.$('#kcalgir'); if (n && AT.masaustu && AT.masaustu()) n.focus();
};
AT.islem['makro-ekle'] = function () {
  var m = {}, hata = '';
  MAKRO.forEach(function (x) {
    var e = AT.$('#mk-' + x[0]), v = e ? String(e.value).trim().replace(/^\+/, '') : '';
    if (!v) return;
    var n = AT.num(v);
    if (!(n >= 0 && n <= 1000)) { hata = hata || x[1] + ' 0–1000 g arası olmalı'; return; }
    m[x[0]] = n;
  });
  if (hata) return AT.toast(hata);
  if (!makroVar(m)) return AT.toast('En az bir makro yaz (gram)');
  var bugun = AT.iso(new Date()), eski = kcalBugun(bugun), ek = makroKcal(m);
  if ((eski && !eski.demo ? +eski.kcal || 0 : 0) + ek > KCAL_MAX) return AT.toast('Günlük toplam çok yüksek');
  var g = gunuGuncelle(bugun, function (x) {
    MAKRO.forEach(function (y) { if (m[y[0]] != null) x[y[0]] = Math.round(((+x[y[0]] || 0) + m[y[0]]) * 10) / 10; });
    x.kcal = Math.round((+x.kcal || 0) + ek);
  });
  AT.kaydet(); AT.render(); AT.toast('Bugün ' + kcalSay(g.kcal) + ' · ' + makroYaz(g));
  var p = AT.$('#mk-p'); if (p && AT.masaustu && AT.masaustu()) p.focus();
};
AT.islem['kcal-sil'] = function () {
  var bugun = AT.iso(new Date()), k = kcalBugun(bugun);
  AT.S.kcal = (AT.S.kcal || []).filter(function (x) { return x.date !== bugun; });
  AT.kaydet(); AT.render();
  var m = makroVar(k) ? 'Bugünün kalorisi ve makroları silindi' : 'Bugünün kalorisi silindi';
  if (k && AT.geriAl) AT.geriAl(m, function () { if (!AT.S.kcal.some(function (x) { return x.date === k.date; })) AT.S.kcal.push(k); });
  else AT.toast(m);
};
AT.islem['tarti-duzelt'] = function () { duzelt = true; AT.render(); var e = AT.$('#bwkg'); if (e) e.focus(); };

/* ---------- dışa açılan ---------- */
/* halka.js: bugünün kalori/protein değerleri ve hedefleri (hedef yoksa null) */
AT.gunVeri = function () {
  var bg = AT.iso(new Date()), k = kcalBugun(bg), b = AT.S.bulk, l = gecerli(AT.S.bw);
  var r = b ? oneriUygula(hesapla(l, b, bg, AT.S.kcal), b, bg) : null;
  return { kcal: k ? +k.kcal || 0 : 0, kcalHedef: r && r.hedefKcal != null ? r.hedefKcal : null, p: k && makroVar(k) ? +k.p || 0 : 0, pHedef: proteinHedef() };
};
AT.bulkDurum = function () { var b = AT.iso(new Date()); return oneriUygula(hesapla(AT.S.bw, AT.S.bulk, b, AT.S.kcal), AT.S.bulk, b); };
AT.harcama = function () { return harcama(AT.S.bw, AT.S.kcal, AT.iso(new Date())); };
AT.bolum.bulk = function () { var l = gecerli(AT.S.bw); return AT.S.bulk ? bolumVar(l, AT.S.bulk) : bolumYok(l); };
AT.bolum.tarti = tarti;
AT.demoBw = demoBw;
/* test/başka modüller için saf hesaplar */
AT.bulkHesap = { koni: koniOf, makroKcal: makroKcal, makroOrt: makroOrt, makroYaz: makroYaz, cizgiSeri: cizgiSeri, ortalamaKilo: ortalamaKilo, yarimGunAt: yarimGunAt, gecerli: gecerli, gunluk: gunluk, trendSeri: trendSeri, egim: egim, hiz: hizHesap, hizAyrinti: hizAyrinti, durum: durumOf, kcal: kcalOf, varis: varisOf, varisAralik: varisAralik, varsayilanHiz: varsayilanHiz, haftalikOneri: haftalikOneri, kcalHaftaGun: kcalHaftaGun, oneriUygula: oneriUygula, proteinDurum: proteinDurum, hesapla: hesapla, durumMetin: durumMetin, kcalGecerli: kcalGecerli, harcama: harcama, haftalikKcal: haftalikKcal, hedefKcal: hedefKcalOf };
})(window.AT);
