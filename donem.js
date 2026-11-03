/* donem.js: modül (window.AT'ye kayıt olur). G12 "Dönem Motoru": bulk / cut / koruma dönemi.
   S.donem = null | { id, tur: 'bulk'|'cut'|'koruma', bas: 'YYYY-MM-DD', basKg (başlangıçtaki ortalama kilo), hedefKg, hedefTarih?,
                      hiz (hedef kg/hafta, işaretli), min, max (hedef hız aralığı), protGkg, girdi: 'kg'|'tarih'|'ikisi', demo? }
   S.donemGecmis = [rapor] (biten dönemlerin raporu; id ile eşitlenir)

   Tek kaynak: dönem varken hedef kilo/hız dönemden gelir. Bulk/cut döneminde S.bulk dönemin AYNASIDIR ({bas, basKg, hedefKg, min, max, donem: id};
   notlar/koç/excel/haftalık S.bulk'u okumaya devam eder, ek kod gerekmez). Koruma döneminde S.bulk null, hedef AT.donemKoruma() ile bulk.js'e verilir.
   Dönem yokken eski S.bulk ("Kilo hedefi") olduğu gibi çalışır. Ayna her bulk.js girişinde AT.donemSenk() ile onarılır (eşitleme iki alanı ayrı taşır).

   Kaynaklar (reports/Donem motoru.md): bulk %0,25–0,5/hafta (Iraki 2019; aynı oran bulk.js varsayilanHiz'da), cut %0,5–1,0/hafta
   (Helms 2014 kas koruma önerisi; Garthe 2011: yavaş kayıp, ~%0,7/hf, direnç antrenmanında kas/güç daha iyi korunur), protein bulk 1,6–2,2 g/kg
   (Morton 2018; varsayılan 1,8) ve cut 2,0–2,4 g/kg (Helms 2014; Jäger 2017; varsayılan 2,2). Çok hızlı eşikler: cut >%1/hf, bulk >%0,75/hf
   (yağ payı artar; Garthe 2011 / Iraki 2019 üst sınırı). Koruma bandı ±%0,15/hf BU UYGULAMANIN varsayımıdır (literatürde sabit sayı yok).
   Haftalık kalori: bulk.js'teki mevcut mekanizma (hedefKcalOf = harcama + hız×7700/7; haftalikOneri: yarım adım, ±200) aynen; yeni kural yok. */
(function (AT) {
'use strict';

var KCAL_KG = 7700, KONI_GUN = 84;
var TUR = {
  bulk: { ad: 'Bulk', yon: 1, prot: [1.6, 2.2], protVar: 1.8, asiri: 0.75 },
  cut: { ad: 'Cut', yon: -1, prot: [2.0, 2.4], protVar: 2.2, asiri: 1.0 },
  koruma: { ad: 'Koruma', yon: 0, prot: [1.6, 2.2], protVar: 1.8, asiri: 0 }
};
var LS_SORDU = 'agirlik-donem-sordu';

/* ---------- saf hesaplar ---------- */
function B() { return AT.bulkHesap; }
function r10(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function gunFark(a, b) { return Math.round((AT.parse(a) - AT.parse(b)) / 864e5); }
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function tarihOk(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && AT.iso(AT.parse(s)) === s; }
function J(x) { return JSON.stringify(x === undefined ? null : x); }
function f2(n) { return Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hizYaz(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + f2(n); }
function yuzdeYaz(n) { return Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function kcalSay(n) { return AT.fmt(n, 0) + ' kcal'; }

/* Dönem kur: g = {tur, bas, basKg, hedefKg?, hedefTarih?, protGkg?}. Hedef kilo VEYA hedef tarih yeter, öbürü hesaplanır;
   ikisi de verilirse hız onlardan çıkar (hedef hız = fark / hafta, ±%25 bant). Dönüş {d} ya da {hata} */
function kur(g) {
  var T = TUR[g && g.tur]; if (!T) return { hata: 'Dönem türünü seç' };
  var kg = +g.basKg;
  if (!(kg >= 20 && kg <= 400)) return { hata: 'Başlangıç kilosunu 20–400 kg arası gir' };
  if (!tarihOk(g.bas)) return { hata: 'Geçerli bir başlangıç tarihi gerekli' };
  var prot = g.protGkg > 0 ? +g.protGkg : T.protVar;
  if (prot < T.prot[0] || prot > T.prot[1]) return { hata: T.ad + ' için protein ' + AT.fmt(T.prot[0], 1) + '–' + AT.fmt(T.prot[1], 1) + ' g/kg arası olmalı' };
  var ht = g.hedefTarih || null;
  if (ht && !tarihOk(ht)) return { hata: 'Geçerli bir hedef tarihi seç' };
  if (ht && gunFark(ht, g.bas) < 7) return { hata: 'Hedef tarihi başlangıçtan en az 1 hafta sonra olmalı' };
  var d = { id: g.id || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tur: g.tur, bas: g.bas, basKg: r10(kg), protGkg: r2(prot) };
  if (T.yon === 0) {
    var x = r2(Math.max(0.1, kg * 0.0015));
    d.hedefKg = d.basKg; d.hedefTarih = ht; d.hiz = 0; d.min = -x; d.max = x; d.girdi = ht ? 'tarih' : 'kg';
    return { d: d };
  }
  var hk = g.hedefKg > 0 ? r10(+g.hedefKg) : null;
  if (!hk && !ht) return { hata: 'Hedef kilo ya da hedef tarih yaz' };
  if (hk) {
    if (!(hk >= 20 && hk <= 400)) return { hata: 'Hedef kiloyu 20–400 kg arası gir' };
    if ((hk - d.basKg) * T.yon <= 0) return { hata: T.ad + ' için hedef kilo başlangıçtan ' + (T.yon > 0 ? 'yüksek' : 'düşük') + ' olmalı' };
  }
  var min, max;
  if (hk && ht) {
    var hz = (hk - d.basKg) / (gunFark(ht, g.bas) / 7);
    if (Math.abs(hz) > 2) return { hata: 'Bu tarihe yetişmek haftada ' + f2(hz) + ' kg gerektirir; tarihi uzat' };
    var a = r2(hz * 0.75), b = r2(hz * 1.25); min = Math.min(a, b); max = Math.max(a, b); d.girdi = 'ikisi';
  } else {
    var v = B().varsayilanHiz(d.basKg, T.yon > 0 ? d.basKg + 1 : d.basKg - 1);   /* bulk +%0,25–0,5 · cut −%0,5–1,0, 0,05'e yuvarlı */
    min = v.min; max = v.max; d.girdi = hk ? 'kg' : 'tarih';
  }
  var orta = (min + max) / 2;
  if (hk) { if (!ht) ht = gunEkle(g.bas, Math.ceil(Math.abs(hk - d.basKg) / Math.abs(orta) * 7)); }
  else { hk = r10(d.basKg + orta * gunFark(ht, g.bas) / 7); if ((hk - d.basKg) * T.yon <= 0) return { hata: 'Bu tarih için hedef kilo hesaplanamadı' }; }
  d.hedefKg = hk; d.hedefTarih = ht; d.hiz = r2(orta); d.min = min; d.max = max;
  return { d: d };
}

/* bulk.js'in anladığı hedef nesnesi: bulk/cut için S.bulk aynası, koruma için bulk'a verilen geçici nesne */
function ayna(d) {
  if (!d || d.tur === 'koruma') return null;
  var o = { bas: d.bas, basKg: d.basKg, hedefKg: d.hedefKg, min: d.min, max: d.max, donem: d.id };
  if (d.demo) o.demo = true;
  return o;
}
function korumaNesne(d) {
  if (!d || d.tur !== 'koruma') return null;
  return { bas: d.bas, basKg: d.basKg, hedefKg: d.basKg, min: d.min, max: d.max, donem: d.id };
}
function bulkNesne(d) { return d ? ayna(d) || korumaNesne(d) : null; }

/* haftalık plan: kcal = harcama + hız×7700/7 (50'ye yuvarlı; bulk.js hedefKcalOf), protein = kilo × g/kg (5'e yuvarlı) */
function plan(d, tdee, kg) {
  return {
    kcal: tdee != null ? B().hedefKcal(tdee, d.min, d.max) : null,
    protein: kg > 0 ? Math.round(kg * (d.protGkg || TUR[d.tur].protVar) / 5) * 5 : null
  };
}

/* Sapma ("yolda mısın?"): r = bulk.js hesapla sonucu (dönem nesnesiyle). Sınıf: yolda | yavas | hizli | artiyor | dusuyor (koruma) | erken | veri.
   Bayat ya da yetersiz veride (son tartı >10 gün, <4 tartı) ve ilk 14 günde öneri satırı yok. asiri: bulk >%0,75 / cut >%1 haftada.
   Tek satır öneri: neden + (varsa) hedef kalori. */
function sapma(d, r) {
  if (!d || !r) return { sinif: 'veri', satir: null };
  if (r.durum === 'veri') return { sinif: 'veri', satir: null };
  if (r.durum === 'erken') return { sinif: 'erken', satir: null };
  var T = TUR[d.tur], kg = r.simdi, yuzde = kg > 0 ? r.hiz / kg * 100 : 0;
  var kc = r.hedefKcal != null ? ' · günde ~' + kcalSay(r.hedefKcal) : r.kcal != null ? ' · günde ~' + AT.fmt(Math.abs(r.kcal), 0) + ' kcal ' + (r.kcal > 0 ? 'fazla' : 'az') + ' ye' : '';
  if (T.yon === 0) {
    var s0 = r.durum === 'iyi' ? 'yolda' : r.durum === 'hizli' ? 'artiyor' : 'dusuyor';
    return { sinif: s0, yuzde: yuzde, satir: s0 === 'yolda' ? null : (s0 === 'artiyor' ? 'Kilo artıyor' : 'Kilo düşüyor') + ' (haftada ' + hizYaz(r.hiz) + ' kg)' + kc };
  }
  var asiri = T.yon * yuzde > T.asiri;
  if (asiri) {
    return { sinif: 'hizli', asiri: true, yuzde: yuzde, satir: (T.yon > 0 ? 'Çok hızlı artış' : 'Çok hızlı kayıp') + ' (haftada %' + yuzdeYaz(yuzde) + '): ' + (T.yon > 0 ? 'yağ payı artar' : 'kas kaybı riski') + kc };
  }
  if (r.durum === 'iyi') return { sinif: 'yolda', yuzde: yuzde, satir: null };
  var yavas = r.durum === 'yavas';
  return { sinif: yavas ? 'yavas' : 'hizli', yuzde: yuzde, satir: (yavas ? (r.hiz * T.yon < 0 ? (T.yon > 0 ? 'Kilo düşüyor' : 'Kilo artıyor') : 'Yavaş') : 'Hedef hızdan hızlı') + ' (haftada ' + hizYaz(r.hiz) + ' kg)' + kc };
}

/* dönem bitti mi: 'tarih' (hedef tarih geldi) | 'hedef' (ortalama kilo hedefi geçti; ≥14 gün, bayat/erken değil) | null */
function bitis(d, r, bugun) {
  if (!d) return null;
  if (d.hedefTarih && bugun >= d.hedefTarih) return 'tarih';
  var T = TUR[d.tur];
  if (T.yon !== 0 && r && r.durum !== 'veri' && r.durum !== 'erken' && gunFark(bugun, d.bas) >= 14 && (r.simdi - d.hedefKg) * T.yon >= 0) return 'hedef';
  return null;
}

var DURUM_AD = { yolda: 'yolda', yavas: 'yavaş', hizli: 'hızlı', artiyor: 'kilo artıyor', dusuyor: 'kilo düşüyor', erken: 'ilk tahmin', veri: 'tartı bekliyor' };
/* tek satır: "Bulk · 3. hafta · +0,31 kg/hf · yolda" */
function satirMetin(d, r, sp, bugun) {
  var hf = Math.floor(Math.max(0, gunFark(bugun, d.bas)) / 7) + 1, ad = sp.sinif === 'yolda' && d.tur === 'koruma' ? 'dengede' : sp.asiri ? 'çok hızlı' : DURUM_AD[sp.sinif];
  var p = [TUR[d.tur].ad, hf + '. hafta'];
  if (r && r.hiz != null && sp.sinif !== 'veri') p.push(hizYaz(r.hiz) + ' kg/hf');
  p.push(ad);
  return p.join(' · ');
}

/* ---------- rapor ---------- */
function kcalOrt(S, bas, son) {
  var m = {};
  (S.kcal || []).forEach(function (k) { if (k && k.date >= bas && k.date <= son && +k.kcal >= 300 && +k.kcal <= 15000) m[k.date] = k; });
  var l = Object.keys(m).map(function (x) { return m[x]; });
  l = B().yarimGunAt(l);
  if (!l.length) return { kcal: null, gun: 0 };
  return { kcal: Math.round(l.reduce(function (t, x) { return t + +x.kcal; }, 0) / l.length / 10) * 10, gun: l.length };
}
function proteinOrt(S, bas, son) {
  var l = (S.kcal || []).filter(function (k) { return k && k.date >= bas && k.date <= son && +k.p > 0; });
  if (!l.length) return { protein: null, gun: 0 };
  return { protein: Math.round(l.reduce(function (t, x) { return t + +x.p; }, 0) / l.length), gun: l.length };
}
/* dönemdeki antrenmanlarda en çok yapılan 4 hareket (≥2 seans): ilk seansın en iyi tahmini max'ı → son seansınki */
function gucDegisim(S, bas, son) {
  var tm = AT.tahminiMax || AT.e1rm, ys = AT.yapilanSetler, m = {};
  var l = (S.sessions || []).filter(function (s) { return s && s.date >= bas && s.date <= son && s.exs; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); });
  l.forEach(function (se) {
    var en = {};
    se.exs.forEach(function (e) {
      ys(e).forEach(function (z) { var v = tm(AT.num(z.kg), AT.num(z.reps), z.rpe); if (v > (en[e.ad] || 0)) en[e.ad] = v; });
    });
    Object.keys(en).forEach(function (ad) { (m[ad] = m[ad] || []).push(en[ad]); });
  });
  return Object.keys(m).filter(function (ad) { return m[ad].length >= 2; })
    .sort(function (a, b) { return m[b].length - m[a].length || (a < b ? -1 : 1); }).slice(0, 4)
    .map(function (ad) { var v = m[ad]; return { ad: ad, bas: r10(v[0]), bit: r10(v[v.length - 1]), n: v.length }; });
}
function rekorSay(S, bas, son) {
  var pr = AT.prHesapla ? AT.prHesapla() : {}, n = 0;
  (S.sessions || []).forEach(function (s) { if (s && s.date >= bas && s.date <= son && pr[s.id]) n += Object.keys(pr[s.id]).length; });
  return n;
}
/* rapor: r = dönem nesnesiyle hesapla sonucu (bitiş ortalama kilosu r.simdi) */
function raporUret(S, d, r, bugun, neden) {
  var gun = Math.max(1, gunFark(bugun, d.bas)), bit = r10(r && r.simdi != null ? r.simdi : d.basKg);
  var k = kcalOrt(S, d.bas, bugun), p = proteinOrt(S, d.bas, bugun);
  return {
    id: d.id, tur: d.tur, bas: d.bas, bit: bugun, neden: neden, gun: gun, hafta: r10(gun / 7),
    basKg: d.basKg, bitKg: bit, hedefKg: d.hedefKg, hedefTarih: d.hedefTarih || null, hedefHiz: d.hiz,
    hiz: r2((bit - d.basKg) / gun * 7), kcal: k.kcal, kcalGun: k.gun, protein: p.protein, proteinGun: p.gun,
    guc: gucDegisim(S, d.bas, bugun), rekor: rekorSay(S, d.bas, bugun),
    ikiz: AT.ikiz ? AT.ikiz.raporOzet(S, d.id) : null   /* G23: bu dönemi açan senaryonun tahmin hızı (rapor tek başına okunur) */
  };
}

/* ---------- durum / eşitleme ---------- */
function senk() {
  var S = AT.S; if (!S) return;
  var w = ayna(S.donem), cur = S.bulk;
  if (S.donem) { if (J(w) !== J(cur)) { S.bulk = w; AT.kaydet(); } }
  else if (cur && cur.donem) { S.bulk = null; AT.kaydet(); }
  kontrol();
}
AT.donemSenk = senk;
AT.donemKoruma = function () { return AT.S && AT.S.donem ? korumaNesne(AT.S.donem) : null; };
AT.donemProtein = function () { var d = AT.S && AT.S.donem; return d ? (d.protGkg || TUR[d.tur].protVar) : 0; };

function bugunIso() { return AT.iso(new Date()); }
function durumHesap() {
  var S = AT.S, d = S.donem; if (!d) return null;
  var r = AT.bulkDurum ? AT.bulkDurum() : null;
  return { d: d, r: r, sp: sapma(d, r), bugun: bugunIso() };
}

/* ---------- arayüz ---------- */
function sheetAcik() { var s = document.getElementById('sheet'); return !!s && !s.hidden; }
function sayi(id) { var e = AT.$('#' + id); if (!e) return NaN; var v = String(e.value).trim(); return v === '' ? NaN : AT.num(v.replace('−', '-')); }
function deger(id) { var e = AT.$('#' + id); return e ? String(e.value).trim() : ''; }

/* Üstteki tek satır; dönem yoksa boş */
AT.bolum.donemUst = function () {
  var x = durumHesap(); if (!x) return '';
  var sinif = { yolda: 'iyi', yavas: 'uyari', hizli: 'uyari', artiyor: 'uyari', dusuyor: 'uyari' }[x.sp.sinif] || 'nots';
  var bit = bitis(x.d, x.r, x.bugun);
  var o = '<button type="button" class="donem-satir ' + sinif + '" data-act="' + (bit ? 'donem-rapor-ac' : 'donem-ac') + '" aria-label="Dönem ayrıntısı"><i aria-hidden="true"></i><span>' +
    AT.h(bit ? TUR[x.d.tur].ad + ' · ' + (bit === 'hedef' ? 'hedefe ulaştın' : 'süre doldu') + ' · raporu gör' : satirMetin(x.d, x.r, x.sp, x.bugun)) + '</span></button>';
  if (x.sp.satir && !bit) o += '<p class="donem-oner">' + AT.h(x.sp.satir) + '</p>';
  return o;
};
AT.bolum.donemAc = function () { return true; };   /* bulk.js: "Dönem başlat" bağlantısı için var-mı işareti */

AT.bolum.donemGecmis = function () {
  var l = (AT.S.donemGecmis || []).slice().sort(function (a, b) { return a.bit < b.bit ? 1 : a.bit > b.bit ? -1 : 0; });
  if (!l.length) return '';
  return '<details class="katla donem-gecmis"><summary>Geçmiş dönemler <small>' + l.length + '</small></summary><ul class="donem-liste">' + l.map(function (g) {
    return '<li><button type="button" data-act="donem-rapor" data-id="' + AT.h(g.id) + '"><span><b>' + TUR[g.tur].ad + '</b><small>' + AT.h(AT.tarih(g.bas, 1) + ' – ' + AT.tarih(g.bit, 1)) + ' · ' + AT.h(AT.fmt(g.hafta, 1)) + ' hf</small></span>' +
      '<span class="donem-sag">' + AT.h(AT.fmt(g.basKg) + ' → ' + AT.fmt(g.bitKg)) + ' kg<small>' + AT.h(hizYaz(g.hiz)) + ' kg/hf</small></span></button></li>';
  }).join('') + '</ul></details>';
};

/* grafik işaretleri: ince dikey çizgiler (app.js cizgi o.dik) + hedef noktası; dönem yoksa null */
AT.donemDik = function () {
  var d = AT.S && AT.S.donem; if (!d) return null;
  var o = [{ x: AT.parse(d.bas).getTime(), ad: 'Başlangıç' }], bg = bugunIso();
  if (d.hedefTarih && d.hedefTarih > bg && gunFark(d.hedefTarih, bg) <= KONI_GUN)
    o.push({ x: AT.parse(d.hedefTarih).getTime(), y: d.hedefKg, ad: 'Hedef ' + AT.tarih(d.hedefTarih, 1), nokta: true });
  return o;
};

/* Koruma dönemi: hedef yok, hero + grafik (başlangıç çizgisi) */
AT.bolum.donemKoruma = function (l) {
  var d = AT.S.donem, H = B(), son = H.sonKayit(l), tr = H.trendSeri(l);
  var o = '<h2>Vücut ağırlığı</h2><div class="panel">';
  if (son) {
    o += '<div class="hero"><b>' + H.buyukKg(H.ortalamaKilo(l)) + ' <small>kg</small></b><span>ortalama kilo · son tartı ' + AT.h(AT.fmt(son.kg)) + ' kg, ' + AT.h(AT.tarih(son.date, 1)) + H.demoTag(son) + '</span></div>';
    var seri = H.cizgiSeri(tr).filter(function (p) { return p.date >= d.bas; });
    o += H.grafik(seri.length ? seri : H.cizgiSeri(tr), null, 'Ortalama vücut ağırlığı', { koni: null, hedef: { y: d.basKg, ad: 'koruma ' + AT.fmt(d.basKg) + ' kg', alt: false } }, AT.donemDik());
    o += '<div class="row"><button class="btn-ghost mini" data-act="bw-geri">Son kaydı sil</button><span class="grow"></span><button class="btn-ghost mini" data-act="donem-ac">Dönemi düzenle</button></div>';
  } else o += '<p class="mut">Kilonu Bugün ekranından gir; grafik burada oluşur.</p>';
  return o + '</div>';
};

var tas = null;   /* açık dönem penceresindeki taslak */
function formOku() {
  if (!tas) return;
  tas.hedefKg = deger('dn-hedef'); tas.hedefTarih = deger('dn-tarih'); tas.protGkg = deger('dn-prot');
  if (AT.$('#dn-baskg')) tas.basKg = deger('dn-baskg');
}
function formAc(tur) {
  var S = AT.S, d = S.donem, l = B().gecerli(S.bw), bugun = bugunIso();
  if (d) tas = tas && tas.id === d.id ? tas : { id: d.id, tur: d.tur, hedefKg: d.girdi === 'tarih' ? '' : AT.fmt(d.hedefKg), hedefTarih: d.girdi === 'kg' ? '' : d.hedefTarih || '', protGkg: AT.fmt(d.protGkg, 1), basKg: AT.fmt(d.basKg) };
  else {
    var b0 = S.bulk && !S.bulk.donem ? S.bulk : null;
    tas = tas && !tas.id ? tas : { tur: tur || (b0 ? (b0.hedefKg < b0.basKg ? 'cut' : 'bulk') : 'bulk'), hedefKg: b0 ? AT.fmt(b0.hedefKg) : '', hedefTarih: '', protGkg: '', basKg: l.length ? AT.fmt(r10(B().ortalamaKilo(l))) : '' };
    if (tur) tas.tur = tur;
  }
  var T = TUR[tas.tur];
  function alan(id, et, v, tip, ph) {
    return '<label class="alan"><span>' + AT.h(et) + '</span><input id="' + id + '" ' + (tip === 'date' ? 'type="date"' : 'inputmode="decimal" placeholder="' + AT.h(ph || '') + '"') + ' value="' + AT.h(v || '') + '"></label>';
  }
  var o = '<h3>' + (d ? T.ad + ' dönemi' : 'Dönem başlat') + '</h3>';
  if (!d) o += '<div class="seg" role="group" aria-label="Dönem türü">' + ['bulk', 'cut', 'koruma'].map(function (k) {
    return '<button data-act="donem-tur" data-v="' + k + '" aria-pressed="' + (tas.tur === k) + '">' + TUR[k].ad + '</button>'; }).join('') + '</div>';
  if (T.yon !== 0) o += '<div class="alanlar">' + alan('dn-hedef', 'Hedef kilo (kg)', tas.hedefKg, '', T.yon > 0 ? 'örn. 84' : 'örn. 76') + alan('dn-tarih', 'Hedef tarih', tas.hedefTarih, 'date') + '</div>' +
    '<p class="mut kucuk">İkisinden birini yaz, öbürü hesaplanır.</p>';
  else o += alan('dn-tarih', 'Bitiş tarihi (isteğe bağlı)', tas.hedefTarih, 'date');
  o += '<div class="alanlar">' + (d ? '' : alan('dn-baskg', 'Başlangıç kilosu', tas.basKg, '', 'örn. 78,4')) + alan('dn-prot', 'Protein (g/kg)', tas.protGkg, '', AT.fmt(T.protVar, 1)) + '</div>';
  if (d) {
    var x = durumHesap(), pl = plan(d, x && x.r ? x.r.tdee : null, x && x.r ? x.r.simdi : d.basKg);
    o += '<p class="mut kucuk donem-ozet">' + AT.h(satirMetin(d, x && x.r, x ? x.sp : { sinif: 'veri' }, bugun)) + '<br>' +
      (d.tur === 'koruma' ? '' : 'Hedef ' + AT.fmt(d.hedefKg) + ' kg · ' + AT.h(AT.tarih(d.hedefTarih, 1)) + ' · haftada ' + hizYaz(d.hiz) + ' kg<br>') +
      'Günde ' + (pl.kcal != null ? '~' + AT.h(kcalSay(x.r.hedefKcal != null ? x.r.hedefKcal : pl.kcal)) : 'kalori için harcama hesabı bekleniyor') + (pl.protein ? ' · protein ~' + pl.protein + ' g' : '') + '</p>';
  }
  o += '<button class="btn-ac btn-big" data-act="donem-kaydet">' + (d ? 'Kaydet' : 'Başlat') + '</button>';
  if (d) o += '<button class="btn-big btn-bad" data-act="donem-rapor-ac">Dönemi bitir</button>';
  o += '<button class="btn-big btn-ghost" data-act="kapat">Kapat</button>';
  AT.sheet(o);
}
AT.islem['donem-ac'] = function () { tas = null; formAc(); };
AT.islem['donem-tur'] = function (dd) { formOku(); tas.tur = dd.v; formAc(); };
var eskiAyar = AT.islem['bulk-ayar'];   /* bulk.js eski "Kilo hedefi" penceresi: dönem yokken */
AT.islem['bulk-ayar'] = function () { if (AT.S.donem) { tas = null; formAc(); } else if (eskiAyar) eskiAyar(); };
AT.islem['donem-kaydet'] = function () {
  formOku(); var S = AT.S, d0 = S.donem, bugun = bugunIso();
  var g = { id: d0 && d0.id, tur: d0 ? d0.tur : tas.tur, bas: d0 ? d0.bas : bugun, basKg: d0 ? d0.basKg : AT.num(String(tas.basKg).replace('−', '-')),
    hedefKg: AT.num(String(tas.hedefKg)), hedefTarih: tas.hedefTarih || null, protGkg: AT.num(String(tas.protGkg)) };
  var k = kur(g); if (k.hata) return AT.toast(k.hata);
  if (d0 && d0.demo) k.d.demo = true;
  var onceki = anlik();
  S.donem = k.d; S.bulk = ayna(k.d); S.kcalOneri = null;
  AT.kaydet(); tas = null; AT.kapat(); AT.render();
  AT.toast(d0 ? 'Dönem kaydedildi' : TUR[k.d.tur].ad + ' dönemi başladı');
  if (!d0 && AT.geriAl) AT.geriAl(TUR[k.d.tur].ad + ' dönemi başladı', function () { geriYukle(onceki); });
};

/* geri alınabilir geçiş: durumun anlık kopyası */
function anlik() { var S = AT.S; return J({ donem: S.donem || null, bulk: S.bulk || null, gecmis: S.donemGecmis || [], oneri: S.kcalOneri || null }); }
function geriYukle(js) {
  var S = AT.S, o = JSON.parse(js);
  S.donem = o.donem; S.bulk = o.bulk; S.donemGecmis = o.gecmis; S.kcalOneri = o.oneri;
  AT.kaydet(); AT.render();
}

var raporDurum = null;   /* açık rapor penceresi: {r, canli} */
function raporHtml(r, canli) {
  var T = TUR[r.tur], d = r.bitKg - r.basKg;
  var o = '<div class="ozet-son an donem-rapor"><p class="ozet-ust">Dönem raporu</p><h3>' + T.ad + ' · ' + AT.h(AT.tarih(r.bas, 1) + ' – ' + AT.tarih(r.bit, 1)) + '</h3>' +
    '<div class="ozet ozet-buyuk"><div><b>' + AT.h(AT.fmt(r.hafta, 1)) + '</b><span>hafta</span></div><div><b>' + AT.h(AT.fmt(r.basKg) + ' → ' + AT.fmt(r.bitKg)) + '</b><span>kg ortalama kilo</span></div><div><b>' + AT.h(hizYaz(r.hiz)) + '</b><span>kg / hafta</span></div></div>';
  var neden = r.neden === 'hedef' ? 'Hedefe ulaştın' : r.neden === 'tarih' ? 'Hedef tarih geldi' : 'Dönemi elle bitirdin';
  o += '<p class="mut kucuk donem-neden">' + neden + (r.tur !== 'koruma' ? ' · hedef ' + AT.h(AT.fmt(r.hedefKg)) + ' kg, haftada ' + AT.h(hizYaz(r.hedefHiz)) + ' kg' : '') + '</p>';
  o += '<dl class="kv">' +
    (r.kcal != null ? '<div><dt>Ortalama kalori</dt><dd>' + AT.h(kcalSay(r.kcal)) + '<small>' + r.kcalGun + ' gün</small></dd></div>' : '') +
    (r.protein != null ? '<div><dt>Ortalama protein</dt><dd>' + AT.h(AT.fmt(r.protein, 0)) + ' g<small>' + r.proteinGun + ' gün</small></dd></div>' : '') +
    '<div><dt>Rekor</dt><dd>' + r.rekor + '</dd></div>' +
    '</dl>';
  if (AT.ikiz && AT.ikiz.raporSatir(r)) o += '<p class="mut kucuk donem-neden">' + AT.h(AT.ikiz.raporSatir(r)) + '</p>';   /* G23: senaryo tahmini vs gerçekleşen */
  if (r.guc && r.guc.length) {
    o += '<h4 class="an-baslik">Güç (tahmini max)</h4><dl class="kv">' + r.guc.map(function (g) {
      var f = g.bit - g.bas;
      return '<div><dt>' + AT.h(g.ad) + '</dt><dd>' + AT.h(AT.fmt(g.bas) + ' → ' + AT.fmt(g.bit)) + ' kg<small>' + AT.h((f >= 0 ? '+' : '−') + AT.fmt(Math.abs(f))) + '</small></dd></div>';
    }).join('') + '</dl>';
  }
  if (canli) {
    o += '<button class="btn-ac btn-big an-tamam" data-act="donem-yeni">Yeni dönem başlat</button>' +
      (r.tur !== 'koruma' ? '<button class="btn-big" data-act="donem-koruma">Koruma dönemine geç</button>' : '') +
      '<button class="btn-big btn-ghost" data-act="donem-sadece-bitir">Yalnız bitir</button>' +
      '<button class="btn-big btn-ghost" data-act="kapat">Sürdür</button>';
  } else o += '<button class="btn-big btn-ghost" data-act="kapat">Kapat</button>';
  return o + '</div>';
}
function raporAc() {
  var S = AT.S, d = S.donem; if (!d) return;
  var bg = bugunIso(), r = AT.bulkDurum ? AT.bulkDurum() : null;
  var neden = bitis(d, r, bg) || 'elle';
  raporDurum = { r: raporUret(S, d, r, bg, neden) };
  AT.sheet(raporHtml(raporDurum.r, true));
}
AT.islem['donem-rapor-ac'] = raporAc;
AT.islem['donem-rapor'] = function (dd) {
  var g = (AT.S.donemGecmis || []).filter(function (x) { return x.id === dd.id; })[0]; if (!g) return;
  AT.sheet(raporHtml(g, false));
};
/* raporu arşivle, dönemi kapat; geri alma için eski durumu döndürür */
function arsivle() {
  var S = AT.S, onceki = anlik(), r = raporDurum && raporDurum.r; if (!r || !S.donem) return null;
  S.donemGecmis = (S.donemGecmis || []).filter(function (x) { return x.id !== r.id; }).concat([r]);
  S.donem = null; if (S.bulk && S.bulk.donem) S.bulk = null; S.kcalOneri = null;
  return onceki;
}
function bitirMsg(m, onceki) { AT.kaydet(); AT.kapat(); AT.render(); if (AT.geriAl) AT.geriAl(m, function () { geriYukle(onceki); }); else AT.toast(m); }
AT.islem['donem-sadece-bitir'] = function () { var o = arsivle(); if (o) bitirMsg('Dönem bitti', o); };
AT.islem['donem-yeni'] = function () {
  var r = raporDurum && raporDurum.r, o = arsivle(); if (!o) return;
  AT.kaydet(); tas = null; AT.render();
  formAc(r && r.tur === 'cut' ? 'bulk' : r && r.tur === 'bulk' ? 'cut' : 'bulk');
};
AT.islem['donem-koruma'] = function () {
  var r = raporDurum && raporDurum.r, o = arsivle(); if (!o) return;
  var k = kur({ tur: 'koruma', bas: bugunIso(), basKg: r.bitKg });
  if (k.d) AT.S.donem = k.d;
  bitirMsg('Koruma dönemi başladı', o);
};

/* hedef/tarih geldi: dönem raporu penceresi kendiliğinden (gün başına bir kez; antrenman sürerken ya da başka pencere açıkken değil) */
var kontrolOnb = '', bekliyor = false;
function kontrol() {
  var S = AT.S, d = S && S.donem; if (!d || S.active || bekliyor || typeof document === 'undefined') return;
  var bg = bugunIso(), sv = (AT.surum ? AT.surum() : 0) + '|' + bg;
  if (kontrolOnb === sv) return;
  kontrolOnb = sv;
  var neden = null;
  try { neden = bitis(d, B().hesapla(S.bw, bulkNesne(d), bg, S.kcal), bg); } catch (e) { neden = null; }
  if (!neden) return;
  var anahtar = d.id + '|' + neden + '|' + bg;
  try { if (localStorage.getItem(LS_SORDU) === anahtar) return; } catch (e) { /* depolama yok */ }
  bekliyor = true;
  setTimeout(function () {
    bekliyor = false;
    if (!AT.S.donem || AT.S.active || sheetAcik()) return;
    try { localStorage.setItem(LS_SORDU, anahtar); } catch (e) { /* önemsiz */ }
    raporAc();
  }, 700);
}

AT.donem = { kur: kur, ayna: ayna, korumaNesne: korumaNesne, plan: plan, sapma: sapma, bitis: bitis, satirMetin: satirMetin, rapor: raporUret, gucDegisim: gucDegisim, kcalOrt: kcalOrt, TUR: TUR, senk: senk, raporHtml: raporHtml };
})(window.AT);
