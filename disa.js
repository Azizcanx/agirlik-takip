/* disa.js: modül (window.AT'ye kayıt olur)
   CSV dışa aktarma: Türkçe Excel'de çift tıklayınca düzgün açılan CSV
   (UTF-8 BOM, ayraç ';', satır sonu CRLF, ondalık virgül). Bağımlılık yok.
   Asıl Excel aktarımı excel.js (.xlsx, aynı satır fonksiyonlarını kullanır); CSV eski uygulamalar ve içe aktarma için. */
(function (AT) {
'use strict';

var BOM = '﻿', AYRAC = ';', SATIR = '\r\n';

/* Sayı -> "82,5" (binlik ayraç yok, en çok d ondalık). Geçersizse boş. */
function sayi(n, d) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  var k = Math.pow(10, d == null ? 2 : d), r = Math.round(n * k) / k;
  if (r === 0) r = 0; /* -0 -> 0 */
  return String(r).replace('.', ',');
}

/* Tek hücre: number -> sayı (negatif sayı olarak kalır), diğerleri metin.
   Metin = + - @ (ya da sekme/CR) ile başlıyorsa formül sayılmasın diye başa ' eklenir;
   ; " veya satır sonu içeriyorsa tırnak içine alınır, " -> "". */
function hucre(v) {
  if (v == null) return '';
  if (typeof v === 'number') return sayi(v, 2);
  if (typeof v === 'object' && v && 'n' in v) return sayi(v.n, v.d); /* {n, d}: ondalık sayısı belirli sayı */
  var s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csv(satirlar) {
  return BOM + satirlar.map(function (r) { return r.map(hucre).join(AYRAC); }).join(SATIR) + SATIR;
}

function sirala(sessions) {
  return sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); });
}

var ANT_BASLIK = ['Tarih', 'Antrenman', 'Egzersiz', 'Kas grubu', 'Set no', 'kg', 'Tekrar', 'Hacim (kg)', 'Tahmini 1RM (kg)', 'Örnek'];
var KILO_BASLIK = ['Tarih', 'Kilo (kg)', '7 günlük ortalama (kg)', 'Örnek'];
var KCAL_BASLIK = ['Tarih', 'Kalori (kcal)', 'Protein (g)', 'Karbonhidrat (g)', 'Yağ (g)', 'Örnek'];

/* Her tamamlanmış set bir satır (başlık hariç). */
function antrenmanSatirlari(sessions) {
  var out = [];
  sirala(sessions || []).forEach(function (se) {
    (se.exs || []).forEach(function (ex) {
      AT.yapilanSetler(ex).forEach(function (s, i) {
        var kg = AT.num(s.kg), r = AT.num(s.reps), e1 = AT.e1rm(kg, r, s.rpe);
        out.push([se.date, se.name || 'Antrenman', ex.ad, ex.kas || AT.kasOf(ex.ad), i + 1, kg, r,
          { n: kg * r, d: 1 }, e1 > 0 ? { n: e1, d: 1 } : '', se.demo ? 'evet' : '']);
      });
    });
  });
  return out;
}

/* 7 günlük ortalama: o tarih dahil geriye 7 takvim günü (t-6 .. t) içindeki kayıtların ortalaması. */
function kiloSatirlari(bw) {
  var l = (bw || []).filter(function (b) { return b && b.date && AT.num(b.kg) > 0; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return l.map(function (b) {
    var son = AT.parse(b.date); son.setDate(son.getDate() - 6);
    var alt = AT.iso(son), t = 0, n = 0;
    l.forEach(function (x) { if (x.date >= alt && x.date <= b.date) { t += AT.num(x.kg); n++; } });
    return [b.date, { n: AT.num(b.kg), d: 2 }, { n: t / n, d: 2 }, b.demo ? 'evet' : ''];
  });
}

/* Günlük kalori: her gün bir satır (aynı gün tek; bulk.js kcalGecerli ile aynı kural) */
function kaloriSatirlari(kcal) {
  var m = {};
  (kcal || []).forEach(function (k) { if (k && /^\d{4}-\d{2}-\d{2}$/.test(k.date) && k.kcal >= 300 && k.kcal <= 15000) m[k.date] = k; });
  /* makrolar isteğe bağlı: girilmemişse boş hücre; ondalıklı gram virgülle */
  function g(v) { v = +v; return v > 0 ? (v % 1 ? { n: v, d: 1 } : v) : ''; }
  return Object.keys(m).sort().map(function (d) { var k = m[d]; return [d, Math.round(+k.kcal), g(k.p), g(k.k), g(k.y), k.demo ? 'evet' : '']; });
}

/* ---------- CSV içe aktarma (Strong, Hevy, bizim antrenman/kilo/kalori CSV'leri) ---------- */

/* Ayraç: ilk satırda (tırnak dışında) en çok geçen , ; ya da sekme. */
function ayracBul(t) {
  var say = { ',': 0, ';': 0, '\t': 0 }, q = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (c === '"') q = !q;
    else if (!q && (c === '\n' || c === '\r')) break;
    else if (!q && c in say) say[c]++;
  }
  return say[';'] > say[','] && say[';'] >= say['\t'] ? ';' : say['\t'] > say[','] ? '\t' : ',';
}

/* RFC 4180 benzeri: tırnaklı alan, "" kaçışı, tırnak içinde satır sonu, CRLF/LF, BOM. Boş satırlar atılır. */
function csvCoz(t, ayrac) {
  t = String(t == null ? '' : t).replace(/^﻿/, '');
  var d = ayrac || ayracBul(t), rows = [], row = [], f = '', q = false, i = 0, n = t.length;
  function alanBitir() { row.push(f); f = ''; }
  function satirBitir() { alanBitir(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
  for (; i < n; i++) {
    var c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === d) alanBitir();
    else if (c === '\r') { if (t[i + 1] === '\n') i++; satirBitir(); }
    else if (c === '\n') satirBitir();
    else f += c;
  }
  if (f !== '' || row.length) satirBitir();
  return rows;
}

/* Sütun adı eşleme anahtarı: küçük harf, aksan/boşluk/noktalama yok ("Kilo (kg)" -> "kilokg"). */
function anahtar(s) {
  return String(s).toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Metin hücresi: kırp; dışa aktarırken formül korumasıyla eklenen baştaki ' geri alınır. */
function metin(v) {
  var s = String(v == null ? '' : v).trim();
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/* "82,5" "82.5" "1.234,5" "1,234.5" -> sayı; boş/geçersiz -> NaN */
function sayiCoz(v) {
  var s = String(v == null ? '' : v).replace(/[\s ]/g, '');
  if (!s) return NaN;
  var v1 = s.lastIndexOf(','), n1 = s.lastIndexOf('.');
  if (v1 >= 0 && n1 >= 0) s = v1 > n1 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
}

var AY = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  oca: 1, sub: 2, nis: 4, haz: 6, tem: 7, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12 };

/* Tarih(+saat) -> { date: 'YYYY-MM-DD', ms: yerel zaman ms ya da null }. Tanınmazsa null.
   2024-05-01 18:30:00 · 2024-05-01T18:30 · 1 May 2024, 18:30 · May 1, 2024 6:30 PM · 01.05.2024 18:30 · 1/5/2024 */
function tarihCoz(v) {
  var s = String(v == null ? '' : v).trim(), y, m, g, r;
  if (!s) return null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +r[1]; m = +r[2]; g = +r[3]; }
  else if ((r = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s))) { g = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) {
    var a = +r[1], b = +r[2];
    if (b > 12 && a <= 12) { m = a; g = b; } else { g = a; m = b; } /* belirsizse gün/ay (Türkçe) */
    y = +r[3];
  } else {
    var k = anahtar(s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]+/g, ' ').trim().split(' ')[0] || '').slice(0, 3);
    var sayilar = s.replace(/\d{1,2}:\d{2}(:\d{2})?.*$/, '').match(/\d+/g) || [];
    if (!AY[k] || sayilar.length < 2) return null;
    m = AY[k];
    var yil = sayilar.filter(function (x) { return x.length === 4; })[0], gun = sayilar.filter(function (x) { return x.length <= 2; })[0];
    if (!yil || !gun) return null;
    y = +yil; g = +gun;
  }
  var d = new Date(y, m - 1, g);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== g) return null;
  var ms = null, sa = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(s.slice(r ? r[0].length : 0));
  if (sa) {
    var hh = +sa[1];
    if (sa[4]) { var pm = /p/i.test(sa[4]); if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; }
    if (hh < 24 && +sa[2] < 60) ms = new Date(y, m - 1, g, hh, +sa[2], +(sa[3] || 0)).getTime();
  }
  return { date: AT.iso(d), ms: ms };
}

/* Süre -> saniye: "1h 5m" "45m" "1:05:00" "3900" */
function sureCoz(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase(), r;
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  if ((r = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s))) return r[3] != null ? +r[1] * 3600 + +r[2] * 60 + +r[3] : +r[1] * 60 + +r[2];
  var t = 0, ok = false;
  s.replace(/(\d+(?:\.\d+)?)\s*(h|sa|m|dk|s|sn)/g, function (_, x, b) { ok = true; t += +x * ({ h: 3600, sa: 3600, m: 60, dk: 60 }[b] || 1); });
  return ok ? t : 0;
}

var LB = 0.45359237;
function yuvarla(n, d) { var k = Math.pow(10, d); return Math.round(n * k) / k; }

/* Biçim tanıma: başlık anahtarları -> { tip, ad, sutun(ad...) } */
function bicimBul(bas) {
  var a = bas.map(anahtar);
  function idx() { for (var i = 0; i < arguments.length; i++) { var j = a.indexOf(arguments[i]); if (j >= 0) return j; } return -1; }
  function var_() { return Array.prototype.every.call(arguments, function (x) { return a.indexOf(x) >= 0; }); }
  if (var_('exercisetitle', 'starttime', 'reps') && (var_('weightkg') || var_('weightlbs')))
    return { tip: 'hevy', ad: 'Hevy', c: { ad: idx('title'), tarih: idx('starttime'), bitis: idx('endtime'), egz: idx('exercisetitle'),
      kg: idx('weightkg'), lb: idx('weightlbs'), tekrar: idx('reps'), rpe: idx('rpe'), tur: idx('settype') } };
  if (var_('date', 'exercisename', 'reps', 'weight'))
    return { tip: 'strong', ad: 'Strong', c: { ad: idx('workoutname'), tarih: idx('date'), sure: idx('duration', 'workoutduration'), egz: idx('exercisename'),
      kg: idx('weight'), birim: idx('weightunit'), tekrar: idx('reps'), rpe: idx('rpe'), sira: idx('setorder') } };
  if (var_('tarih', 'egzersiz', 'kg', 'tekrar'))
    return { tip: 'bizim', ad: 'Ağırlık Takip', c: { ad: idx('antrenman'), tarih: idx('tarih'), egz: idx('egzersiz'), kas: idx('kasgrubu'),
      kg: idx('kg'), tekrar: idx('tekrar'), rpe: idx('rpe'), ornek: idx('ornek') } };
  if (var_('tarih') && (var_('kalorikcal') || var_('kalori')) && !var_('kilokg') && !var_('kilo'))
    return { tip: 'kalori', ad: 'Kalori', c: { tarih: idx('tarih'), kcal: idx('kalorikcal', 'kalori'), ornek: idx('ornek'),
      p: idx('proteing', 'protein'), k: idx('karbonhidratg', 'karbonhidrat', 'karbg', 'karb'), y: idx('yagg', 'yag') } };
  if (var_('tarih') && (var_('kilokg') || var_('kilo')))
    return { tip: 'kilo', ad: 'Kilo', c: { tarih: idx('tarih'), kg: idx('kilokg', 'kilo'), ornek: idx('ornek') } };
  return null;
}

/* Strong/Hevy adı → uygulamadaki ad: "Bench Press (Barbell)" → "Bench Press", "Bench Press (Dumbbell)" → "Dumbbell Bench Press", "Pull Up" → "Pull-up" */
function adAnahtar(s) { return String(s).toLocaleLowerCase('en').replace(/biceps/g, 'bicep').replace(/triceps/g, 'tricep').replace(/[^a-z0-9]/g, ''); }
function adEsle(ad) {
  if (!ad || AT.kasOf(ad) !== 'Diğer') return ad;
  var liste = (window.HAREKETLER || []).map(function (x) { return x.ad; }), m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(ad);
  var kok = m ? m[1] : ad, ek = m ? m[2].split(/\s*[-\/,]\s*/)[0] : '';
  var aday = ek && !/barbell/i.test(ek) ? [ad, ek + ' ' + kok, kok + ' ' + ek, kok] : [ad, kok];
  for (var i = 0; i < aday.length; i++) {
    var k = adAnahtar(aday[i]), bul = liste.filter(function (x) { return adAnahtar(x) === k; })[0];
    if (bul) return bul;
  }
  return ad;
}
function seansAnahtar(date, ad) { return date + '|' + String(ad || '').trim().toLocaleLowerCase('tr'); }

/* Saf ayrıştırıcı: CSV metni + mevcut durum -> eklenecekler ve özet. S değiştirilmez.
   Dönüş: { hata } ya da { tip, ad, sessions, ozel, bw, setN, atlanan, satirAtlanan, lb } */
function iceCoz(text, S) {
  S = S || {};
  var rows = csvCoz(text);
  if (rows.length < 2) return { hata: rows.length ? 'CSV\'de başlıktan başka satır yok' : 'Dosya boş' };
  var b = bicimBul(rows[0]);
  if (!b) return { hata: 'Tanınmayan CSV biçimi (Strong, Hevy ya da bu uygulamanın CSV\'si olmalı)' };
  var c = b.c, veri = rows.slice(1), satirAtlanan = 0;
  function al(r, i) { return i >= 0 && i < r.length ? r[i] : ''; }

  if (b.tip === 'kalori') {
    var varC = {}, kc = [], atlanC = 0;
    (S.kcal || []).forEach(function (x) { varC[x.date] = 1; });
    veri.forEach(function (r) {
      var t = tarihCoz(al(r, c.tarih)), k = sayiCoz(al(r, c.kcal));
      if (!t || !(k >= 300 && k <= 15000)) { satirAtlanan++; return; }
      if (varC[t.date]) { atlanC++; return; }
      varC[t.date] = 1;
      var o = { id: AT.uid(), date: t.date, kcal: Math.round(k) };
      ['p', 'k', 'y'].forEach(function (x) { var v = sayiCoz(al(r, c[x])); if (v > 0 && v <= 1000) o[x] = Math.round(v * 10) / 10; });   /* makro sütunları varsa */
      if (/^evet$/i.test(metin(al(r, c.ornek)))) o.demo = true;
      kc.push(o);
    });
    return { tip: 'kalori', ad: b.ad, sessions: [], ozel: [], bw: [], kcal: kc, setN: 0, atlanan: atlanC, satirAtlanan: satirAtlanan, lb: false };
  }
  if (b.tip === 'kilo') {
    var varK = {}, bw = [], atlanK = 0;
    (S.bw || []).forEach(function (x) { varK[x.date] = 1; });
    veri.forEach(function (r) {
      var t = tarihCoz(al(r, c.tarih)), kg = sayiCoz(al(r, c.kg));
      if (!t || !(kg > 0)) { satirAtlanan++; return; }
      if (varK[t.date]) { atlanK++; return; }
      varK[t.date] = 1;
      var o = { id: AT.uid(), date: t.date, kg: yuvarla(kg, 2) };
      if (/^evet$/i.test(metin(al(r, c.ornek)))) o.demo = true;
      bw.push(o);
    });
    return { tip: 'kilo', ad: b.ad, sessions: [], ozel: [], bw: bw, setN: 0, atlanan: atlanK, satirAtlanan: satirAtlanan, lb: false };
  }

  var mevcut = {}, gruplar = {}, sira = [], lb = false;
  (S.sessions || []).forEach(function (se) { mevcut[seansAnahtar(se.date, se.name)] = 1; });
  veri.forEach(function (r) {
    var t = tarihCoz(al(r, c.tarih)), egz = b.tip === 'bizim' ? metin(al(r, c.egz)) : adEsle(metin(al(r, c.egz)));
    if (!t || !egz) { satirAtlanan++; return; }
    if (b.tip === 'hevy' && /warm/i.test(al(r, c.tur))) { satirAtlanan++; return; }
    if (b.tip === 'strong' && /^\s*w/i.test(al(r, c.sira))) { satirAtlanan++; return; } /* "W" ısınma */
    var reps = sayiCoz(al(r, c.tekrar)), kgHam = al(r, c.kg), kg, lbSet = false;
    if (b.tip === 'hevy' && c.kg < 0) { kgHam = al(r, c.lb); lbSet = true; }
    if (b.tip === 'strong' && /lb/i.test(al(r, c.birim))) lbSet = true;
    kg = String(kgHam).trim() === '' ? 0 : sayiCoz(kgHam); /* boş ağırlık = vücut ağırlığı (0 kg) */
    if (!(reps > 0) || !(kg >= 0)) { satirAtlanan++; return; } /* kardiyo, süre, dinlenme satırları */
    if (lbSet) { kg = kg * LB; lb = true; }
    var ad = metin(al(r, c.ad)) || 'Antrenman', k = seansAnahtar(t.date, ad), g = gruplar[k];
    if (!g) {
      g = gruplar[k] = { se: { id: AT.uid(), date: t.date, name: ad, exs: [] }, ex: {} };
      if (t.ms != null) g.se.start = t.ms;
      if (b.tip === 'hevy') { var bt = tarihCoz(al(r, c.bitis)); if (bt && bt.ms != null && t.ms != null && bt.ms >= t.ms) g.se.end = bt.ms; }
      if (b.tip === 'strong' && t.ms != null) { var sn = sureCoz(al(r, c.sure)); if (sn > 0) g.se.end = t.ms + sn * 1000; }
      if (b.tip === 'bizim' && /^evet$/i.test(metin(al(r, c.ornek)))) g.se.demo = true;
      sira.push(k);
    }
    var ex = g.ex[egz];
    if (!ex) {
      var kas = AT.kasOf(egz), dosyaKas = b.tip === 'bizim' ? metin(al(r, c.kas)) : '';
      ex = g.ex[egz] = { ad: egz, kas: kas !== 'Diğer' ? kas : dosyaKas || 'Diğer', sets: [] };
      g.se.exs.push(ex);
    }
    var set = { kg: String(yuvarla(kg, 2)), reps: String(yuvarla(reps, 2)), done: true }, rpe = sayiCoz(al(r, c.rpe));
    if (rpe > 0) set.rpe = String(rpe);
    ex.sets.push(set);
  });

  var sessions = [], atlanan = 0, setN = 0, ozel = [], ozelVar = {};
  (S.ozel || []).forEach(function (o) { ozelVar[String(o.ad).toLocaleLowerCase('tr')] = 1; });
  sira.forEach(function (k) {
    if (mevcut[k]) { atlanan++; return; }
    var se = gruplar[k].se; sessions.push(se);
    se.exs.forEach(function (ex) {
      setN += ex.sets.length;
      var lk = ex.ad.toLocaleLowerCase('tr');
      if (AT.kasOf(ex.ad) === 'Diğer' && !ozelVar[lk]) { ozelVar[lk] = 1; ozel.push({ ad: ex.ad, kas: ex.kas || 'Diğer' }); }
    });
  });
  return { tip: b.tip, ad: b.ad, sessions: sessions, ozel: ozel, bw: [], setN: setN, atlanan: atlanan, satirAtlanan: satirAtlanan, lb: lb };
}

/* Onay metni (AT.onayla ikinci argümanı) */
function ozetMetni(r) {
  if (r.tip === 'kalori')
    return 'Kalori CSV\'si · ' + r.kcal.length + ' gün.' + (r.atlanan ? ' ' + r.atlanan + ' gün zaten var, atlanacak.' : '');
  if (r.tip === 'kilo')
    return 'Kilo CSV\'si · ' + r.bw.length + ' kayıt.' + (r.atlanan ? ' ' + r.atlanan + ' tarih zaten var, atlanacak.' : '');
  return r.ad + ' biçimi · ' + r.sessions.length + ' antrenman, ' + r.setN + ' set, ' + r.ozel.length + ' yeni hareket.' +
    (r.atlanan ? ' ' + r.atlanan + ' antrenman zaten var, atlanacak.' : '') +
    (r.lb ? ' Ağırlıklar lb\'den kg\'ye çevrildi.' : '');
}

/* Uygula: S'ye ekler (S değişir). */
function iceUygula(r, S) {
  S.sessions = (S.sessions || []).concat(r.sessions);
  if (r.ozel.length) S.ozel = (S.ozel || []).concat(r.ozel);
  if (r.bw.length) S.bw = (S.bw || []).concat(r.bw);
  if (r.kcal && r.kcal.length) S.kcal = (S.kcal || []).concat(r.kcal);
}

AT._csv = { adEsle: adEsle, sayi: sayi, hucre: hucre, csv: csv, antrenmanSatirlari: antrenmanSatirlari, kiloSatirlari: kiloSatirlari, kaloriSatirlari: kaloriSatirlari, ANT_BASLIK: ANT_BASLIK, KILO_BASLIK: KILO_BASLIK, KCAL_BASLIK: KCAL_BASLIK,
  csvCoz: csvCoz, ayracBul: ayracBul, anahtar: anahtar, sayiCoz: sayiCoz, tarihCoz: tarihCoz, sureCoz: sureCoz, bicimBul: bicimBul,
  iceCoz: iceCoz, ozetMetni: ozetMetni, iceUygula: iceUygula };

function indirCsv(onek, baslik, satirlar, ne) {
  if (!satirlar.length) return AT.toast('Dışa aktarılacak kayıt yok');
  var ad = onek + '-' + AT.iso(new Date()) + '.csv';
  AT.indir(new Blob([csv([baslik].concat(satirlar))], { type: 'text/csv;charset=utf-8' }), ad);
  AT.toast(satirlar.length + ' ' + ne + ' indirildi');
}

AT.islem['csv-antrenman'] = function () {
  indirCsv('agirlik-antrenmanlar', ANT_BASLIK, antrenmanSatirlari(AT.S.sessions), 'set');
};
AT.islem['csv-kilo'] = function () {
  indirCsv('agirlik-kilo', KILO_BASLIK, kiloSatirlari(AT.S.bw), 'kilo kaydı');
};
AT.islem['csv-kalori'] = function () {
  indirCsv('agirlik-kalori', KCAL_BASLIK, kaloriSatirlari(AT.S.kcal), 'günlük kalori');
};

/* İçe aktarma akışı: düğme -> #csvdosya -> oku (UTF-8, olmazsa Windows-1254) -> özet + onay -> ekle */
var bekleyen = null;
function dosyaOku(f, cb) {
  var r = new FileReader();
  r.onload = function () {
    var t;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(r.result); }
    catch (e) { try { t = new TextDecoder('windows-1254').decode(r.result); } catch (e2) { t = null; } }
    cb(t);
  };
  r.onerror = function () { cb(null); };
  r.readAsArrayBuffer(f);
}
function csvMetinSec(t) {
  if (t == null) return AT.toast('Dosya okunamadı');
  var r;
  try { r = iceCoz(t, AT.S); } catch (e) { return AT.toast('CSV okunamadı (bozuk dosya)'); }
  if (r.hata) return AT.toast(r.hata);
  if (!r.sessions.length && !r.bw.length && !(r.kcal || []).length)
    return AT.toast(r.atlanan ? 'Yeni kayıt yok: ' + r.atlanan + (r.tip === 'kilo' || r.tip === 'kalori' ? ' gün' : ' antrenman') + ' zaten kayıtlı' : r.tip === 'kalori' ? 'CSV\'de geçerli kalori yok' : 'CSV\'de içe aktarılacak set yok');
  bekleyen = t;
  AT.onayla('CSV içe aktarılsın mı?', ozetMetni(r), 'csv-ice-kesin', 'İçe aktar');
}
function csvSec(f) {
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) return AT.toast('Dosya çok büyük (20 MB üstü)');
  dosyaOku(f, csvMetinSec);
}
AT.islem['csv-ice'] = function () { var f = AT.$('#csvdosya'); if (f) { f.value = ''; f.click(); } };
AT.islem['csv-ice-kesin'] = function () {
  if (bekleyen == null) return AT.kapat();
  var r = iceCoz(bekleyen, AT.S); bekleyen = null; /* onay anındaki veriye göre yeniden süz: çift kayıt olmasın */
  if (!r.hata) iceUygula(r, AT.S);
  AT.kaydet(); AT.kapat(); AT.render();
  AT.toast(r.hata ? r.hata : r.tip === 'kilo' ? r.bw.length + ' kilo kaydı içe aktarıldı' : r.tip === 'kalori' ? r.kcal.length + ' günlük kalori içe aktarıldı' : r.sessions.length + ' antrenman, ' + r.setN + ' set içe aktarıldı');
};
if (typeof document !== 'undefined') document.addEventListener('change', function (ev) {
  var t = ev.target; if (!t || t.id !== 'csvdosya') return;
  var f = t.files && t.files[0]; t.value = ''; csvSec(f);
});
AT._csv.metinSec = csvMetinSec; /* test: dosya okunmuş gibi akışı çalıştırır */

AT.bolum.disa = function () {
  var S = AT.S, setN = antrenmanSatirlari(S.sessions).length, seansN = (S.sessions || []).length, kiloN = kiloSatirlari(S.bw).length;
  var xl = !!AT.islem['excel-indir'];   /* excel.js yüklüyse tek .xlsx öne çıkar; CSV küçük satıra iner */
  function satir(act, etiket, bilgi) {
    return '<div class="row"><button class="btn-big grow" data-act="' + act + '">' + AT.h(etiket) + '</button><span class="mut">' + AT.h(bilgi) + '</span></div>';
  }
  function kucuk(act, etiket) { return '<button class="btn-ghost mini" data-act="' + act + '">' + AT.h(etiket) + '</button>'; }
  /* Ayarlar'da "Excel ve diğer uygulamalar" katlanır bölümünün içi (başlığı app.js verir) */
  return '<div class="panel">' +
    (xl ? '<button class="btn-ac btn-big" data-act="excel-indir">' + AT.h('Excel\'e aktar (.xlsx)') + '</button>' : '') +
    '<p class="mut kucuk xl-durum">' + AT.h(seansN + ' antrenman (' + setN + ' set) · ' + kiloN + ' tartı · ' + kaloriSatirlari(S.kcal).length + ' gün kalori') + '</p>' +
    '<p class="mut kucuk csv-etiket">' + AT.h(xl ? 'CSV olarak (eski uygulamalar için):' : 'Excel\'e (CSV) indir:') + '</p>' +
    '<div class="row csv-satir">' + kucuk('csv-antrenman', 'Antrenmanlar') + kucuk('csv-kilo', 'Kilo') + kucuk('csv-kalori', 'Kalori') + '</div>' +
    '<p class="mut">' + AT.h('Başka uygulamadan getir:') + '</p>' +
    satir('csv-ice', 'CSV içe aktar', 'Strong, Hevy ya da bu uygulama') +
    '<input type="file" id="csvdosya" accept=".csv,text/csv" hidden>' +
    '<p class="mut">' + AT.h('Mevcut kayıtlara eklenir; aynı gün ve aynı adla zaten olan antrenman atlanır.') + '</p></div>';
};
})(window.AT);
