/* setdil.js: modül (window.AT'ye kayıt olur). Doğal dille kayıt: "1 set 10 tekrar curl attım", "bench 3x8 60",
   "82,4 geldim 650 kalori yedim, squat 100x5", "bir set daha", "son seti 12 yap", "bench rekorum".
   Kural tabanlı, internetsiz. Sayı kelimeleri (sesli yazım: "altmış iki buçuk"), Türkçe harfsiz eşleşme.
   Hiçbir şey onaysız yazılmaz: önizleme penceresi (düzenlenir, satırlar işaretlenir) → Ekle → Geri al'lı bildirim.
   Nereye: süren antrenman → ona (app.js AT.aktifSetEkle, ✓ akışıyla aynı sonuç); yoksa bugün bitmiş antrenman
   (duzenle.js doğrulaması, tam kayıt); o da yoksa yeni antrenman. Tartı AT.tartiKaydet, kalori kcal-ekle yolundan.
   Girdi: Ctrl+K (komut.js), Defter Kaydet (defter.js), Koça sor (koc.js), mikrofon (SpeechRecognition varsa).
   Kural anlamazsa ve koç (API / PC) bağlıysa yalnız JSON isteyen kısa istem (AT.kocJson); dönen JSON doğrulanır.
   AT.setAyristir(metin) -> {hareket, setler:[{kg, reps}], eksik:[...]} | null · AT.setDil */
(function (AT) {
'use strict';

var ORNEK = "Anlayamadım: örn. 'curl 3x10 15 kg'";
var HARF = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function kat(s) { return String(s == null ? '' : s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, function (c) { return HARF[c]; }); }
function kopya(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function virgul(v) { return String(v == null ? '' : v).replace('.', ','); }
function bugun() { return AT.iso(new Date()); }
function kume(s) { var o = {}; s.split(' ').forEach(function (w) { o[w] = 1; }); return o; }

/* ---------- metni sadeleştir ---------- */
var SAYI = { sifir: 0, bir: 1, bi: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90 };
var BIRIM = { set: 1, seti: 1, tekrar: 1, kilo: 1, kg: 1, kere: 1, carpi: 1, x: 1, dakika: 1, dk: 1, saniye: 1, sn: 1, daha: 1, bucuk: 1, yuz: 1, bin: 1 };
/* "altmış iki buçuk" → 62.5, "yüz yirmi" → 120; "sekiz sekiz yedi" üç ayrı sayı kalır (tekrar listesi) */
function sayiKelime(s) {
  var p = s.split(/\s+/), out = [], i = 0;
  while (i < p.length) {
    var w = p[i];
    if (!(w in SAYI) && w !== 'yuz' && w !== 'bin') { out.push(w); i++; continue; }
    /* "bir şey", "bi baktım": tek başına "bir" ancak set/tekrar/kilo gibi bir kelimeden önce sayıdır */
    if ((w === 'bir' || w === 'bi') && !BIRIM[p[i + 1] || '']) { out.push(w); i++; continue; }
    var top = 0, cur = 0, j = i;
    for (; j < p.length; j++) {
      var x = p[j], v = SAYI[x];
      if (v != null) {
        if (!(cur === 0 || (v < 10 && cur % 10 === 0) || (v >= 10 && cur % 100 === 0))) break;
        cur += v;
      } else if (x === 'yuz') { if (cur % 100 !== cur && cur) break; cur = (cur || 1) * 100; }
      else if (x === 'bin') { top += (cur || 1) * 1000; cur = 0; }
      else if (x === 'bucuk') { cur += 0.5; j++; break; }
      else break;
    }
    out.push(String(top + cur)); i = j;
  }
  return out.join(' ');
}
function normal(m) {
  var s = kat(m).replace(/['’`´][a-z]*/g, '').replace(/\r?\n/g, ', ').replace(/[!?]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\d)\s*(kg|kilo|kcal|dk|sn)(?=[\s,.;]|$)/g, '$1 $2');
  s = sayiKelime(s);
  s = s.replace(/(\d+(?:[.,]\d+)?)\s+bucuk\b/g, function (x, a) { return String(+a.replace(',', '.') + 0.5); });
  s = s.replace(/\b\d{1,2}(?:\s*,\s*\d{1,2}){2,}\b/g, function (x) { return x.replace(/\s*,\s*/g, ' '); });   /* 8,8,7 → tekrar listesi */
  s = s.replace(/(\d),(\d)/g, '$1.$2');   /* 62,5 */
  s = s.replace(/\s*(?:\bkere\b|\bcarpi\b|×|\*)\s*/g, ' x ').replace(/(\d)\s*x\s*(\d)/g, '$1x$2');
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- hareket eşleşmesi ---------- */
var ESANLAM = { curl: 'Biceps Curl', pazi: 'Biceps Curl', biceps: 'Biceps Curl', bench: 'Bench Press', barfiks: 'Pull-up', sinav: 'Push-up',
  squat: 'Squat', deadlift: 'Deadlift', ohp: 'Overhead Press', 'omuz pres': 'Overhead Press', row: 'Barbell Row', kurek: 'Barbell Row',
  dips: 'Dips', lat: 'Lat Pulldown', 'leg press': 'Leg Press', 'yana acis': 'Lateral Raise', triceps: 'Triceps Pushdown' };
/* tek başına hareket sayılmayan genel kelimeler */
var GENEL = kume('arka on ust alt tek kol gogus omuz sirt bacak karin kalca makine makinesi kablo oturarak ayakta egimli dar genis ters yana pres press dumbbell barbell dambil agirlik vucut son set ilk');
/* yok sayılan dolgu: fiiller, hitap, birim artığı */
var DOLGU = kume('set seti sette setle setlik seri tekrar tekrarli tekrarlik rep reps kg kilo kiloyla kilogram kiloluk kilodan ile x tane adet ' +
  'attim yaptim cektim bastim kaldirdim ittim vurdum yaptik attik ettim tamamladim bitirdim kanka abi abim kardesim hocam reis ' +
  'bugun simdi az once de da bi daha ve sonra ardindan ama cok iyi guzel oldu geldi gitti toplam her biri birinde ayni en hepsi falan filan gibi ' +
  'yine tekrardan ilk diger dedik yani tamam evet tam');
var KG_B = kume('kg kilo kiloyla kilogram kiloluk kilodan kiloda'), REP_B = kume('tekrar tekrarli tekrarlik rep reps tane'),
  SET_B = kume('set setlik seri sette'), SURE_B = kume('saat dakika dk sn saniye gun hafta ay yil km metre lt litre gr gram adim kcal kalori');

function vucutMu(ad) { var x = (window.HAREKETLER || []).filter(function (y) { return y.ad === ad; })[0]; return !!x && x.ekipman === 'Vücut ağırlığı'; }
/* son yapılan hareketler, en yeni önce (süren antrenman dahil) */
function sonAdlar(n) {
  var S = AT.S, out = [], gor = {};
  function ekle(ad) { if (!gor[ad]) { gor[ad] = 1; out.push(ad); } }
  if (S.active) {
    var ss = [];
    S.active.exs.forEach(function (e) { var t = 0; e.sets.forEach(function (s) { if (s.done && s.t > t) t = s.t; }); ss.push({ ad: e.ad, t: t || 1 }); });
    ss.sort(function (a, b) { return b.t - a.t; }).forEach(function (x) { ekle(x.ad); });
  }
  var l = AT.bitenSeanslar();
  for (var i = l.length - 1; i >= 0 && out.length < (n || 1e9); i--) l[i].exs.slice().reverse().forEach(function (e) { if (AT.yapilanSetler(e).length) ekle(e.ad); });
  return n ? out.slice(0, n) : out;
}
function katalog() {
  var l = [], gor = {};
  function ekle(ad, tr) {
    if (!ad || gor[ad]) return; gor[ad] = 1;
    var al = [ad].concat(String(tr || '').split(',')).map(function (x) { return kat(x).replace(/-/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    l.push({ ad: ad, al: al.map(function (x) { return x.split(' '); }), alT: al, i: l.length });
  }
  (window.HAREKETLER || []).forEach(function (x) { ekle(x.ad, x.tr); });
  (AT.S.ozel || []).forEach(function (x) { ekle(x.ad, ''); });
  sonAdlar().forEach(function (ad) { ekle(ad, ''); });
  return l;
}
/* kelime eşleşmesi: 2 = aynı ya da ek almış (squatta, curlde); 1 = başı (benc) */
function kelimeEs(q, a) {
  if (q === a) return 2;
  if (a.length >= 4 && q.indexOf(a) === 0 && q.length - a.length <= 3) return 2;
  if (q.length >= 3 && a.indexOf(q) === 0) return 1;
  return 0;
}
function skor(qw, c) {
  var qs = qw.join(' '), en = 0;
  c.alT.forEach(function (a, k) {
    if (a === qs) { en = 3; return; }
    var min = 2;
    for (var i = 0; i < qw.length && min > 0; i++) { var b = 0; c.al[k].forEach(function (w) { b = Math.max(b, kelimeEs(qw[i], w)); }); min = Math.min(min, b); }
    if (min > en) en = min;
  });
  return en;
}
function once(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
/* kelimeler içinde en iyi hareket penceresi (≤ 4 kelime). Sıra: puan, pencere uzunluğu, en son yapılan, eşanlam, liste sırası */
function hareketBul(kelimeler) {
  var w = kelimeler.filter(function (x) { return x && !/^[+-]?\d/.test(x); }); if (!w.length) return null;
  var kt = katalog(), son = sonAdlar(), sira = {}; son.forEach(function (a, i) { sira[a] = i; });
  var en = null;
  for (var len = Math.min(4, w.length); len >= 1; len--) for (var s = 0; s + len <= w.length; s++) {
    var qw = w.slice(s, s + len), qs = qw.join(' ');
    if (len === 1 && (GENEL[qs] || DOLGU[qs] || qs.length < 3)) continue;
    kt.forEach(function (c) {
      var p = skor(qw, c); if (!p) return;
      var es = ESANLAM[qs] === c.ad ? 1 : 0, r = sira[c.ad] != null ? sira[c.ad] : 1e6;
      var k = [p, len, -r, es, -c.i];
      if (!en || once(k, en.k)) en = { ad: c.ad, k: k, bas: s, len: len, puan: p };
    });
  }
  return en && { ad: en.ad, bas: en.bas, len: en.len, puan: en.puan, kalan: w.length - en.len };
}

/* ---------- süren antrenman ---------- */
function sonSetAktif(ad) {
  var a = AT.S.active, b = null; if (!a) return null;
  a.exs.forEach(function (e, ei) {
    if (ad && e.ad !== ad) return;
    e.sets.forEach(function (s, si) { if (s.done && (!b || (s.t || 0) >= (b.s.t || 0))) b = { e: e, s: s, ei: ei, si: si }; });
  });
  return b;
}
function simdikiAd() {
  var a = AT.S.active; if (!a || !a.exs.length) return null;
  var b = sonSetAktif(); if (b) return b.e.ad;
  var e = a.exs.filter(function (x) { return x.sets.some(function (s) { return !s.done; }); })[0];
  return (e || a.exs[a.exs.length - 1]).ad;
}
/* kg verilmediyse: bu antrenmandaki son set, yoksa geçen seferin son iş seti */
function sonKg(ad) {
  var b = sonSetAktif(ad); if (b && b.s.tip !== 'isinma') return { kg: AT.num(b.s.kg), kaynak: 'bu antrenmandan' };
  var l = AT.bitenSeanslar();
  for (var i = l.length - 1; i >= 0; i--) {
    var e = l[i].exs.filter(function (x) { return x.ad === ad; })[0], ys = e ? AT.yapilanSetler(e) : [];
    if (ys.length) return { kg: AT.num(ys[ys.length - 1].kg), kaynak: 'geçen seferden' };
  }
  return null;
}
function bugunSeans() {
  var t = bugun(), l = AT.S.sessions.filter(function (s) { return s.date === t && !s.demo; });
  return l.sort(function (a, b) { return (a.end || a.start || 0) - (b.end || b.start || 0); })[l.length - 1] || null;
}

/* ---------- ayrıştırma ---------- */
function setSatir(ad, setler, tip, notlar) {
  var eksik = [], not = notlar ? notlar.slice() : [];
  if (setler.some(function (s) { return s.kg == null || s.kg === ''; })) {
    var sk = sonKg(ad);
    if (sk && isFinite(sk.kg)) { setler.forEach(function (s) { if (s.kg == null || s.kg === '') s.kg = sk.kg; }); not.push('kg ' + sk.kaynak); }
    else if (vucutMu(ad)) { setler.forEach(function (s) { if (s.kg == null || s.kg === '') s.kg = 0; }); not.push('vücut ağırlığı'); }
    else eksik.push('kg');
  }
  return { tur: 'set', ad: ad, tip: tip || '', not: not, eksik: eksik,
    setler: setler.map(function (s) { var y = { kg: s.kg == null || s.kg === '' ? '' : virgul(s.kg), reps: String(s.reps) }; if (s.rpe != null) y.rpe = s.rpe; return y; }) };
}
function tamMi(v, a, b) { return isFinite(v) && v % 1 === 0 && v >= a && v <= b; }

/* bir parça → set satırı ya da null. {satir, kalan: tanınmayan kelime sayısı} */
function setCoz(seg) {
  var tip = '', t = ' ' + seg + ' ';
  if (/\bisinma\b/.test(t)) { tip = 'isinma'; t = t.replace(/\bisinma( seti)?\b/g, ' '); }
  var tok = t.trim().split(/\s+/).filter(Boolean), kg = null, reps = null, setN = null, bare = [], axb = [], kel = [];
  for (var i = 0; i < tok.length; i++) {
    var w = tok[i], nx = tok[i + 1] || '';
    if (/^\d+(\.\d+)?x\d+(\.\d+)?(x\d+(\.\d+)?)?$/.test(w)) { axb.push(w.split('x').map(Number)); continue; }
    if (/^\d+(\.\d+)?$/.test(w)) {
      var v = +w;
      if (KG_B[nx]) { kg = v; i++; } else if (REP_B[nx]) { reps = v; i++; } else if (SET_B[nx]) { setN = v; i++; } else if (SURE_B[nx]) i++;
      else bare.push({ v: v, i: i });
      continue;
    }
    if (/\d/.test(w)) continue;
    kel.push(w);
  }
  /* tekrar listesi: art arda 3+ (kg belliyse 2+) küçük tam sayı: "60 kg 8 8 7" */
  var liste = null;
  for (var a = 0; a < bare.length && !liste; a++) {
    var b = a; while (b + 1 < bare.length && bare[b + 1].i === bare[b].i + 1) b++;
    var run = bare.slice(a, b + 1).filter(function (x) { return tamMi(x.v, 1, 50); });
    if (run.length === b - a + 1 && run.length >= (kg != null ? 2 : 3)) { liste = run.map(function (x) { return x.v; }); bare.splice(a, run.length); }
    a = b;
  }
  var setler = null;
  if (axb.length > 1) setler = axb.map(function (x) { return { kg: x[0], reps: x[1] }; });
  else if (axb.length) {
    var x = axb[0], digerKg = kg != null || bare.length > 0;
    if (x.length === 3) { if (x[0] <= 10 && x[0] % 1 === 0) { setN = x[0]; reps = x[1]; kg = x[2]; } else { kg = x[0]; reps = x[1]; setN = x[2]; } }
    else if (x[0] % 1 === 0 && setN == null && (x[0] <= 6 || (digerKg && x[0] <= 20))) { setN = x[0]; reps = x[1]; }
    else { if (kg == null) kg = x[0]; reps = x[1]; }
  }
  if (!setler && !liste) {
    if (reps == null) {
      if (bare.length >= 2 && kg == null) { if (bare[1].v > 30 && bare[0].v <= 30) { reps = bare[0].v; kg = bare[1].v; } else { kg = bare[0].v; reps = bare[1].v; } }
      else if (bare.length) { var u = bare[0].v; if (kg == null && (u > 30 || u % 1)) kg = u; else reps = u; }
    } else if (kg == null && bare.length) kg = bare[0].v;
  } else if (liste && kg == null && bare.length) kg = bare[0].v;
  if (liste) setler = liste.map(function (r) { return { kg: kg, reps: r }; });
  else if (!setler && reps != null) { var n = setN == null ? 1 : setN; if (!tamMi(n, 1, 20)) return null; setler = []; for (var k = 0; k < n; k++) setler.push({ kg: kg, reps: reps }); }
  var h = hareketBul(kel);
  return { ad: h && h.ad, kalan: h ? h.kalan : kel.filter(function (w) { return !DOLGU[w]; }).length, setler: setler, tip: tip,
    gecerli: !!setler && setler.every(function (s) { return tamMi(s.reps, 1, 200) && (s.kg == null || (s.kg >= 0 && s.kg <= 1000)); }) };
}

/* süren antrenmana göre göreli komutlar */
function relCoz(seg) {
  var a = AT.S.active, t = ' ' + seg.replace(/\b(kanka|abi|hocam|lutfen|bi)\b/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  var dinM = /\b(dinlenme\w*|dinlen\w*|mola|ara)\b/.test(t) && /(\d+(?:\.\d+)?)\s*(dakika|dk|saniye|sn)\b/.exec(t);
  var rpeM = /\b(?:rpe|zorluk)\s*(\d+(?:\.5)?)\b/.exec(t);
  var zor = /\b(cok zor|tukendim|son tekrar|failure|zorla)\b/.test(t) ? 10 : /\bzor(du| geldi)?\b/.test(t) ? 9 : /\b(orta)\b/.test(t) && /geldi|idi|du/.test(t) ? 8 : /\b(rahat|kolay)\w*\b/.test(t) ? 7 : 0;
  var silM = /\bson set\w*\b.*\b(sil|kaldir|iptal)\w*/.test(t);
  var duzM = /\bson set\w*\s+(\d+(?:\.\d+)?)\s*(kg|kilo|tekrar)?\s*(yap|olsun|olacak|duzelt)/.exec(t);
  var kgM = /([+-])\s*(\d+(?:\.\d+)?)\s*(?:kg|kilo)\b/.exec(t) || /(\d+(?:\.\d+)?)\s*(?:kg|kilo)\s*(arttir|artir|ekle|fazla|daha|bindir|azalt|dusur|eksilt|indir|eksik)\w*/.exec(t);
  var repM = /([+-])\s*(\d+)\s*tekrar\b/.exec(t) || /(\d+)\s*tekrar\s*(fazla|daha|arttir|artir|eksik|az|azalt)\w*/.exec(t);
  var kopM = /\b(1 set daha|set daha|aynisi|ayni set\w*|ayni sekilde|1 daha)\b/.test(t);
  if (!(dinM || rpeM || zor || silM || duzM || kgM || repM || kopM)) return null;
  if (!a) return { tur: 'mesaj', metin: 'Süren antrenman yok' };
  var w = t.trim().split(' ').filter(function (x) { return !/\d/.test(x); }), h = hareketBul(w), ad = h && h.puan >= 2 ? h.ad : simdikiAd();
  if (!ad) return { tur: 'mesaj', metin: 'Önce bir hareket ekle' };
  if (dinM) {
    var sn = Math.round(+dinM[1] * (/^(dakika|dk)$/.test(dinM[2]) ? 60 : 1));
    if (!(sn >= 15 && sn <= 900)) return { tur: 'mesaj', metin: 'Dinlenme 15 sn – 15 dk arası olmalı' };
    return { tur: 'dinlen', ad: ad, sn: sn };
  }
  var son = sonSetAktif(ad);
  if (rpeM || zor) {
    if (!AT.S.rpe) return { tur: 'mesaj', metin: 'Zorluk kapalı: Ayarlar > Antrenman' };
    var p = rpeM ? +rpeM[1] : zor;
    if (!(p >= 6 && p <= 10)) return { tur: 'mesaj', metin: 'Zorluk 6–10 arası olmalı' };
    if (!son) return { tur: 'mesaj', metin: 'Henüz bitmiş set yok' };
    return { tur: 'duzelt', ref: son.s, ad: son.e.ad, alan: 'rpe', v: Math.round(p * 2) / 2 };
  }
  if (!son) return { tur: 'mesaj', metin: 'Henüz bitmiş set yok' };
  if (silM) return { tur: 'sil', ref: son.s, ad: son.e.ad };
  if (duzM) {
    var kgMi = duzM[2] === 'kg' || duzM[2] === 'kilo', dv = +duzM[1];
    if (kgMi ? !(dv >= 0 && dv <= 1000) : !tamMi(dv, 1, 200)) return { tur: 'mesaj', metin: kgMi ? 'kg 0–1000 arası olmalı' : 'Tekrar 1–200 arası tam sayı olmalı' };
    return { tur: 'duzelt', ref: son.s, ad: son.e.ad, alan: kgMi ? 'kg' : 'reps', v: dv };
  }
  var kgS = AT.num(son.s.kg), rS = AT.num(son.s.reps), not = 'son setin aynısı';
  if (kgM) {
    var d, isr = kgM[1] === '-' || /azalt|dusur|eksilt|indir|eksik/.test(kgM[0]) ? -1 : 1;
    d = kgM[1] === '+' || kgM[1] === '-' ? +kgM[2] : +kgM[1];
    kgS = Math.round((kgS + isr * d) * 100) / 100; not = (isr > 0 ? '+' : '−') + AT.fmt(d) + ' kg';
    if (kgS < 0) return { tur: 'mesaj', metin: 'kg sıfırın altına inemez' };
  }
  if (repM) {
    var rd = repM[1] === '+' || repM[1] === '-' ? +repM[2] : +repM[1], ri = repM[1] === '-' || /eksik|az/.test(repM[0]) ? -1 : 1;
    rS += ri * rd; not = (kgM ? not + ', ' : '') + (ri > 0 ? '+' : '−') + rd + ' tekrar';
    if (!tamMi(rS, 1, 200)) return { tur: 'mesaj', metin: 'Tekrar 1–200 arası olmalı' };
  }
  var s = setSatir(son.e.ad, [{ kg: kgS, reps: rS }], son.s.tip, [not]); s.aktif = true; return s;
}

/* tartı ve kalori: cümlenin herhangi bir yerinden çıkarılır, kalanı set parçalarına gider */
function cikar(n, satir) {
  n = ' ' + n + ' ';
  n = n.replace(/\s\+?(\d{2,5})\s*(?:kcal|kalori|kal)\b(?:\s+(?:yedim|aldim|ekle|yedik|ictim))?/g, function (x, v) { satir.push({ tur: 'kcal', v: String(+v) }); return ' , '; })
    .replace(/\b(?:kalori|kcal)\s*\+?(\d{2,5})\b/g, function (x, v) { satir.push({ tur: 'kcal', v: String(+v) }); return ' , '; });
  function kilo(x, v) {
    var k = +v, not = '';
    if (k >= 400 && k < 4000 && k % 1 === 0) { not = v + ' yazdın → ' + virgul(k / 10) + ' kg'; k = k / 10; }
    if (!(k > 20 && k < 400)) return x;
    satir.push({ tur: 'kilo', v: virgul(Math.round(k * 10) / 10), not: not }); return ' , ';
  }
  n = n.replace(/\s(\d{2,4}(?:\.\d)?)\s*(?:kg|kilo)?\s*(?:geldim|ciktim|cikti|tartildim|oldum|tartida)\b/g, kilo)
    .replace(/\b(?:tartida|tarti|tartim|kilom|tartildim|sabah tarti\w*)\s*(\d{2,4}(?:\.\d)?)\b(?:\s*(?:kg|kilo))?(?:\s+(?:geldim|cikti|ciktim))?/g, kilo);
  satir.sort(function (a, b) { return (a.tur === 'kilo' ? 0 : 1) - (b.tur === 'kilo' ? 0 : 1); });   /* önce tartı, sonra kalori */
  return n.replace(/\s+/g, ' ').trim();
}
var AYIRAC = /\s*(?:;|,|\.\s|\bdaha sonra\b|\bsonra\b|\bardindan\b|\bayrica\b|\bve\b|\b1 de\b)\s*/;
function parcalar(n) {
  var p = n.split(AYIRAC).map(function (x) { return x.replace(/\.$/, '').trim(); }).filter(Boolean), out = [];
  /* hareketsiz ve komutsuz sayı parçası komşusuna yapışır: "3 set 8 tekrar ve 60 kilo bench" */
  p.forEach(function (x) { out.push(x); });
  for (var i = 0; i < out.length; i++) {
    var x = out[i]; if (!/\d/.test(x) || relCozSessiz(x)) continue;
    var w = x.split(' ').filter(function (y) { return !/\d/.test(y); });
    if (hareketBul(w)) continue;
    if (out.length > 1) { if (i + 1 < out.length) out[i + 1] = x + ' ' + out[i + 1]; else out[i - 1] = out[i - 1] + ' ' + x; out.splice(i, 1); i--; }
  }
  return out;
}
function relCozSessiz(x) { return /\b(dinlen\w*|mola|rpe|zorluk|son set\w*|set daha|aynisi|ayni set|1 daha|tekrar (fazla|daha|eksik)|(kg|kilo) (arttir|artir|azalt|dusur|ekle|fazla|daha))\b|[+-]\s*\d/.test(' ' + x + ' '); }

/* ---------- sorular (kural tabanlı cevap) ---------- */
var KASK = { gogus: 'Göğüs', sirt: 'Sırt', omuz: 'Omuz', bacak: 'Bacak', kol: 'Kol', karin: 'Karın', pazi: 'Kol', biceps: 'Kol', triceps: 'Kol' };
function setYaz(s) { var kg = AT.num(s.kg); return (kg > 0 ? AT.fmt(kg) + ' kg × ' : '') + AT.num(s.reps) + (kg > 0 ? '' : ' tekrar'); }
function soruCoz(ham, n) {
  var t = ' ' + n + ' ', rek = /\b(rekor\w*|en iyi\w*|max|maks|pr)\b/.test(t), son = /\b(en son|son ne|son kac|gecen sefer\w*|son yaptig\w*|ne yaptim|son antrenman\w*)\b/.test(t),
    kac = /\bkac (is )?set\w*\b/.test(t), soru = /\?/.test(ham) || /\b(kac|ne|neydi|nedir|nasil|hangi)\b/.test(t);
  rek = rek && (soru || /\b(rekorum\w*|rekoru|en iyim\w*)\b/.test(t));
  son = son && (soru || /\b(ne yaptim|son ne)\b/.test(t));
  if (!(rek || son || kac)) return null;
  var w = n.split(' ').filter(function (x) { return !/\d/.test(x) && !/^(rekor\w*|iyi\w*|max|maks|pr|son|en|ne|neydi|kac|set\w*|yaptim|yaptig\w*|gecen|sefer\w*|bu|hafta\w*|bugun|antrenman\w*)$/.test(x); });
  if (kac) {
    var kas = null; w.forEach(function (x) { if (KASK[x] && !kas) kas = KASK[x]; });
    var h = kas ? null : hareketBul(w);
    if (!kas && !h) return { cevap: null };
    var t0 = bugun(), bas, bit = t0, ad = 'Bu hafta';
    if (/\bbugun\b/.test(t)) { bas = t0; ad = 'Bugün'; }
    else if (/\bgecen hafta\b/.test(t)) { var d = AT.parse(AT.haftaBasi(t0)); d.setDate(d.getDate() - 7); bas = AT.iso(d); d.setDate(d.getDate() + 6); bit = AT.iso(d); ad = 'Geçen hafta'; }
    else bas = AT.haftaBasi(t0);
    var say = 0, se = 0, l = AT.bitenSeanslar().filter(function (s) { return s.date >= bas && s.date <= bit; });
    if (AT.S.active && AT.S.active.date >= bas && AT.S.active.date <= bit) l = l.concat([AT.S.active]);
    l.forEach(function (s) { var k = 0; s.exs.forEach(function (e) { if (kas ? AT.kasOf(e.ad) === kas : e.ad === h.ad) k += AT.yapilanSetler(e).length; }); if (k) se++; say += k; });
    return { cevap: ad + ' ' + (kas || h.ad) + ': ' + say + ' iş seti' + (se ? ' (' + se + ' antrenman)' : '') };
  }
  var hb = hareketBul(w);
  if (!hb || !(rek || son)) return { cevap: null };
  var adh = hb.ad, en = null, sonS = null;
  AT.bitenSeanslar().forEach(function (s) {
    s.exs.forEach(function (e) {
      if (e.ad !== adh) return; var ys = AT.yapilanSetler(e); if (!ys.length) return;
      sonS = { date: s.date, sets: ys };
      ys.forEach(function (x) {
        var kg = AT.num(x.kg), r = AT.num(x.reps), v = kg > 0 ? AT.tahminiMax(kg, r, x.rpe) : 0, k = kg > 0 ? v * 1000 + kg : r;
        if (!en || k > en.k) en = { k: k, v: v, s: x, date: s.date };
      });
    });
  });
  if (!sonS) return { cevap: adh + ' için kayıt yok' };
  if (son) return { cevap: adh + ' · son ' + AT.tarih(sonS.date, 1) + ': ' + sonS.sets.map(setYaz).join(', ') };
  return { cevap: adh + ' rekoru: ' + setYaz(en.s) + (en.v > 0 ? ' (tahmini max ~' + AT.fmt(en.v) + ' kg)' : '') + ', ' + AT.tarih(en.date, 1) };
}

/* ---------- ana ayrıştırıcı ----------
   coz(metin) -> {satirlar:[…], guclu} | {soru:{cevap}} | {mesaj} | null */
function coz(metin) {
  var ham = String(metin == null ? '' : metin).trim(); if (!ham || ham.length > 400) return null;
  var n = normal(ham), q = soruCoz(ham, n);
  if (q) return { soru: q };
  var satir = [], mesaj = null, guclu = true;
  n = cikar(n, satir);
  parcalar(n).forEach(function (seg) {
    /* açık hareket + set önce ("bench 3x8 60 zor geldi"); yoksa göreli komut ("2 tekrar daha"); yoksa süren hareket ("ısınma 40x10") */
    var s = setCoz(seg), r = s.ad && s.setler && s.gecerli ? null : relCoz(seg);
    if (r) { if (r.tur === 'mesaj') mesaj = mesaj || r.metin; else satir.push(r); return; }
    if (!s.ad && s.setler && AT.S.active && s.kalan === 0) s.ad = simdikiAd();
    if (s.ad && s.setler && s.gecerli) { var x = setSatir(s.ad, s.setler, s.tip); if (s.kalan > 2) guclu = false; satir.push(x); return; }
    /* tek başına tartı: "82,4" / "82,4 kg" (ondalıklı) */
    var k = /^(\d{2,3}\.\d)\s*(kg|kilo)?$/.exec(seg);
    if (k && +k[1] > 20 && +k[1] < 400) satir.push({ tur: 'kilo', v: virgul(+k[1]), not: '' });
  });
  if (satir.length) return { satirlar: satir, guclu: guclu };
  return mesaj ? { mesaj: mesaj } : null;
}
function setBenzeri(metin) { var n = normal(metin); return /\d/.test(n) && /\b(set\w*|tekrar\w*|rep\w*)\b|\dx\d/.test(n); }
/* istenen biçim: ilk set grubu */
function setAyristir(metin) {
  var r = coz(metin), s = r && r.satirlar && r.satirlar.filter(function (x) { return x.tur === 'set'; })[0];
  return s ? { hareket: s.ad, setler: s.setler.map(function (x) { return { kg: x.kg === '' ? null : AT.num(x.kg), reps: AT.num(x.reps) }; }), eksik: s.eksik.slice(), tip: s.tip, not: s.not.slice() } : null;
}

/* ---------- önizleme ---------- */
var on = null;   /* {satirlar, kaynak: 'komut'|'defter'|'koc', metin} */
function hedefYazi() {
  if (AT.S.active) return 'Süren antrenmana eklenir';
  var b = bugunSeans(); return b ? 'Bugünkü antrenmana eklenir (' + (b.name || 'Antrenman') + ')' : 'Yeni antrenman başlar';
}
function satirHtml(x, i, cok) {
  var sec = cok ? '<input type="checkbox" data-sd="' + i + '"' + (x.kapali ? '' : ' checked') + ' aria-label="Bu satırı ekle">' : '', o = '';
  if (x.tur === 'set') {
    var alt = [x.setler.length + ' set'].concat(x.tip === 'isinma' ? ['ısınma'] : [], x.not || []);
    if (x.eksik.indexOf('kg') >= 0) alt.push('kg yaz');
    o += '<div class="sd-ust">' + sec + '<b class="grow">' + AT.h(x.ad) + '</b></div><p class="sd-alt">' + AT.h(alt.join(' · ')) + '</p>' +
      '<div class="setgrid dz"><span class="lbl">Set</span><span class="lbl">kg</span><span class="lbl">Tekrar</span><span class="lbl">Sil</span></div>';
    x.setler.forEach(function (s, k) {
      var a = ' data-sd="' + i + '" data-sk="' + k + '"';
      o += '<div class="setgrid dz"><span class="n' + (x.tip === 'isinma' ? ' isinma' : '') + '">' + (x.tip === 'isinma' ? 'I' : k + 1) + '</span>' +
        '<input inputmode="decimal"' + a + ' data-sf="kg" value="' + AT.h(s.kg) + '" placeholder="kg" aria-label="' + AT.h(x.ad) + ' set ' + (k + 1) + ' kg">' +
        '<input inputmode="numeric"' + a + ' data-sf="reps" value="' + AT.h(s.reps) + '" aria-label="' + AT.h(x.ad) + ' set ' + (k + 1) + ' tekrar">' +
        '<button class="done dz-sil" data-act="sd-set-sil"' + a + ' aria-label="Seti çıkar">×</button></div>';
    });
  } else if (x.tur === 'kilo' || x.tur === 'kcal') {
    var kilo = x.tur === 'kilo';
    o += '<div class="sd-ust">' + sec + '<b class="grow">' + (kilo ? 'Tartı' : 'Kalori') + '</b><span class="sd-tek">' + (kilo ? '' : '+') +
      '<input inputmode="decimal" data-sd="' + i + '" data-sf="v" value="' + AT.h(x.v) + '" aria-label="' + (kilo ? 'Tartı kg' : 'Kalori') + '"> ' + (kilo ? 'kg' : 'kcal') + '</span></div>';
    var uy = kilo ? tartiUyari(x) : 'bugünün toplamına eklenir';
    if (uy) o += '<p class="sd-alt">' + AT.h(uy) + '</p>';
  } else {
    var ref = x.ref, ne = x.tur === 'dinlen' ? 'Dinlenme · ' + x.ad + ': ' + Math.floor(x.sn / 60) + ':' + AT.p2(x.sn % 60)
      : x.tur === 'sil' ? x.ad + ' · son seti sil (' + setYaz(ref) + ')'
      : x.ad + ' · son set: ' + (x.alan === 'rpe' ? 'zorluk ' + AT.fmt(x.v) : setYaz(ref) + ' → ' + setYaz(Object.assign({}, ref, x.alan === 'kg' ? { kg: x.v } : { reps: x.v })));
    o += '<div class="sd-ust">' + sec + '<b class="grow">' + AT.h(ne) + '</b></div>';
  }
  return '<section class="panel sd-grup' + (x.kapali ? ' kapali' : '') + '">' + o + '</section>';
}
function tartiUyari(x) {
  var v = AT.num(x.v), st = AT.sonTarti ? AT.sonTarti() : null, u = x.not ? [x.not] : [];
  if (st && v > 0 && Math.abs(v - st.kg) > 3) u.push('Son tartın ' + AT.fmt(st.kg) + ' kg idi (' + AT.tarih(st.date, 1) + '); doğru mu?');
  return u.join(' · ');
}
function ciz() {
  var l = on.satirlar, cok = l.length > 1, ant = l.some(function (x) { return x.tur !== 'kilo' && x.tur !== 'kcal'; });
  var o = '<h3>' + (ant && !cok ? 'Antrenmana ekle' : 'Eklensin mi?') + '</h3>' + l.map(function (x, i) { return satirHtml(x, i, cok); }).join('') +
    (ant ? '<p class="mut sd-hedef">' + AT.h(hedefYazi()) + '</p>' : '') +
    '<div class="yigin"><button class="btn-ac btn-big" data-act="sd-ekle">' + (cok ? 'Hepsini ekle' : 'Ekle') + '</button>' +
    (on.kaynak === 'defter' ? '<button class="btn-big" data-act="df-kaydet" data-not="1">Not olarak kaydet</button>' : '') +
    '<button class="btn-big btn-ghost" data-act="kapat">Vazgeç</button></div>';
  AT.sheet(o);
}
function onizle(r, kaynak, metin) {
  if (!r || !r.satirlar || !r.satirlar.length) return false;
  on = { satirlar: r.satirlar.map(function (x) { var y = Object.assign({}, x); if (x.setler) y.setler = x.setler.map(function (s) { return Object.assign({}, s); }); return y; }), kaynak: kaynak || '', metin: metin || '' };
  ciz(); return true;
}
function cevapGoster(q, kaynak, metin) {
  var bag = AT.kocBagli && AT.kocBagli();
  AT.sheet('<h3>' + (q.cevap ? 'Cevap' : 'Anlayamadım') + '</h3><p class="sd-cevap">' + AT.h(q.cevap || 'Bunu verinden çıkaramadım.') + '</p><div class="yigin">' +
    (bag ? '<button class="btn-big' + (q.cevap ? '' : ' btn-ac') + '" data-act="sd-koca" data-q="' + AT.h(metin) + '">' + (q.cevap ? 'Yine de koça sor' : 'Koça sor') + '</button>' : '') +
    (kaynak === 'defter' ? '<button class="btn-big" data-act="df-kaydet" data-not="1">Not olarak kaydet</button>' : '') +
    '<button class="btn-big btn-ghost" data-act="kapat">Kapat</button></div>');
}

/* ---------- uygula ---------- */
function setleriOku(x) {
  var out = [];
  for (var k = 0; k < x.setler.length; k++) {
    var s = x.setler[k], kg = AT.num(s.kg), r = AT.num(s.reps);
    if (String(s.kg).trim() === '') return x.ad + ': kg yaz';
    if (!(kg >= 0 && kg <= 1000)) return x.ad + ': kg 0–1000 arası olmalı';
    if (!tamMi(r, 1, 200)) return x.ad + ': tekrar 1–200 arası tam sayı olmalı';
    var y = { kg: kg, reps: r }; if (x.tip) y.tip = x.tip; out.push(y);
  }
  return out;
}
function uygula() {
  if (!on) return;
  var S = AT.S, l = on.satirlar.filter(function (x) { return !x.kapali; });
  if (!l.length) return AT.toast('Eklenecek satır seçili değil');
  var hazir = [], i;
  for (i = 0; i < l.length; i++) {
    var x = l[i], y = { x: x };
    if (x.tur === 'set') { var s = setleriOku(x); if (typeof s === 'string') return AT.toast(s); if (!s.length) continue; y.sets = s; }
    else if (x.tur === 'kilo') { y.v = AT.num(x.v); if (!(y.v > 20 && y.v < 400)) return AT.toast('Tartı 20–400 kg arası olmalı'); }
    else if (x.tur === 'kcal') { y.v = AT.num(String(x.v).replace(/[\s.]/g, '')); if (!(y.v > 0 && y.v <= 10000)) return AT.toast('Kaloriyi 1–10.000 arası gir'); }
    if ((x.aktif || x.ref || x.tur === 'dinlen') && !S.active) return AT.toast('Süren antrenman yok');
    hazir.push(y);
  }
  if (!hazir.length) return AT.toast('Eklenecek set kalmadı');
  var ant = hazir.filter(function (y) { return y.x.tur !== 'kilo' && y.x.tur !== 'kcal'; });
  var eski = { active: kopya(S.active), sessions: S.sessions.slice(), bw: S.bw, kcal: kopya(S.kcal || []), din: S.dinlenmeEgz ? Object.assign({}, S.dinlenmeEgz) : null };
  /* bugün bitmiş antrenmana: önce doğrula, sonra hiçbir şey yazılmadıysa dur */
  var seans = null, seansI = -1;
  if (ant.length && !S.active) {
    var b = bugunSeans();
    if (b) {
      seans = kopya(b); seansI = S.sessions.indexOf(b);
      ant.forEach(function (y) {
        var e = null; seans.exs.forEach(function (z) { if (z.ad === y.x.ad) e = z; });
        if (!e) { e = { ad: y.x.ad, kas: AT.kasOf(y.x.ad), sets: [] }; seans.exs.push(e); }
        y.sets.forEach(function (s) { var z = { kg: virgul(s.kg), reps: String(s.reps), done: true }; if (s.tip) z.tip = s.tip; e.sets.push(z); });
      });
      var hata = AT._duzenle ? AT._duzenle.dogrula(seans) : null; if (hata) return AT.toast(hata);
    }
  }
  var kaynak = on.kaynak; on = null; AT.kapat();
  var ozet = [], setSay = 0;
  hazir.forEach(function (y) {
    if (y.x.tur === 'kilo') { AT.tartiKaydet(y.v); ozet.push('tartı ' + AT.fmt(y.v) + ' kg'); }
    else if (y.x.tur === 'kcal') { AT.islem['kcal-ekle']({ v: '+' + Math.round(y.v) }); ozet.push('+' + AT.fmt(Math.round(y.v), 0) + ' kcal'); }
  });
  if (seans) { S.sessions[seansI] = seans; AT.kaydet(); ant.forEach(function (y) { setSay += y.sets.length; }); }
  else if (ant.length) {
    var yeni = !S.active;
    if (yeni) S.active = { id: AT.uid(), date: bugun(), start: Date.now(), name: 'Antrenman', exs: [] };
    ant.forEach(function (y) {
      var x = y.x;
      if (x.tur === 'set') { AT.aktifSetEkle(x.ad, y.sets, yeni); setSay += y.sets.length; }
      else if (x.tur === 'dinlen') { (S.dinlenmeEgz = S.dinlenmeEgz || {})[x.ad] = x.sn; AT.kaydet(); ozet.push('dinlenme ' + Math.floor(x.sn / 60) + ':' + AT.p2(x.sn % 60)); }
      else {
        var e = null, si = -1; S.active.exs.forEach(function (z) { var k = z.sets.indexOf(x.ref); if (k >= 0) { e = z; si = k; } });
        if (!e) return;
        if (x.tur === 'sil') { e.sets.splice(si, 1); ozet.push('son set silindi'); }
        else { x.ref[x.alan] = x.alan === 'rpe' ? AT.fmt(x.v) : virgul(x.v); ozet.push('son set düzeltildi'); }
        AT.kaydet(true);
      }
    });
  }
  if (setSay) ozet.unshift(setSay + ' set eklendi');
  if (kaynak === 'defter') { var t = AT.$('#df-metin'); if (t) t.value = ''; if (AT._defter) AT._defter.taslakYaz(''); }
  AT.render();
  AT.geriAl(ozet.join(' · ') || 'Eklendi', function () {
    S.active = eski.active; S.sessions = eski.sessions; S.bw = eski.bw; S.kcal = eski.kcal;
    if (eski.din) S.dinlenmeEgz = eski.din; else delete S.dinlenmeEgz;
  });
}

/* ---------- koç yedeği (yalnız JSON) ---------- */
function jsonDogrula(c) {
  c = String(c == null ? '' : c); var a = c.indexOf('{'), b = c.lastIndexOf('}'); if (a < 0 || b < a) return null;
  var j; try { j = JSON.parse(c.slice(a, b + 1)); } catch (e) { return null; }
  if (!j || typeof j.hareket !== 'string' || !j.hareket.trim() || j.hareket.length > 80 || !Array.isArray(j.setler) || !j.setler.length || j.setler.length > 20) return null;
  var ad = null, k = kat(j.hareket).trim();
  katalog().forEach(function (x) { if (!ad && kat(x.ad) === k) ad = x.ad; });
  if (!ad) { var h = hareketBul(normal(j.hareket).split(' ')); if (h && h.puan >= 2) ad = h.ad; }
  if (!ad) return null;
  var sets = [];
  for (var i = 0; i < j.setler.length; i++) {
    var s = j.setler[i]; if (!s || typeof s !== 'object') return null;
    var r = typeof s.reps === 'number' ? s.reps : NaN, kg = s.kg == null || s.kg === '' ? null : typeof s.kg === 'number' ? s.kg : NaN;
    if (!tamMi(r, 1, 200) || (kg !== null && !(kg >= 0 && kg <= 1000))) return null;
    sets.push({ kg: kg, reps: r });
  }
  return { satirlar: [setSatir(ad, sets, '', ['koç anlamlandırdı'])], guclu: true };
}
function kocIstem(metin) {
  var adlar = sonAdlar(30); if (!adlar.length) adlar = (window.HAREKETLER || []).slice(0, 30).map(function (x) { return x.ad; });
  return 'Spor salonu notunu set kaydına çevir. Yalnız şu biçimde JSON yaz: {"hareket":"Ad","setler":[{"kg":60,"reps":8}]}. ' +
    'Her set ayrı öğe; kg bilinmiyorsa null; anlaşılmıyorsa {"hareket":null,"setler":[]}. Hareket adını mümkünse şu listeden aynen seç: ' +
    adlar.join(', ') + '.\nNot: ' + String(metin).slice(0, 300);
}
function kocla(metin, kaynak) {
  if (!(AT.kocJsonVar && AT.kocJsonVar())) { AT.toast(ORNEK); return Promise.resolve(null); }
  AT.toast('Koç anlamlandırıyor…', 4000);
  return AT.kocJson(kocIstem(metin)).then(function (c) { var r = jsonDogrula(c); if (!r) throw new Error('json'); onizle(r, kaynak, metin); return r; })
    .catch(function () { AT.toast(ORNEK); return null; });
}

/* ---------- girdi noktaları ---------- */
function ozetYaz(r) {
  return r.satirlar.map(function (x) {
    if (x.tur === 'set') { var s = x.setler, ayni = s.every(function (y) { return y.kg === s[0].kg && y.reps === s[0].reps; });
      return x.ad + ' ' + (ayni ? s.length + '×' + s[0].reps : s.map(function (y) { return y.reps; }).join('-')) + (s[0].kg !== '' ? ' · ' + s[0].kg + ' kg' : ''); }
    if (x.tur === 'kilo') return 'tartı ' + x.v + ' kg';
    if (x.tur === 'kcal') return '+' + x.v + ' kcal';
    if (x.tur === 'dinlen') return 'dinlenme ' + x.ad;
    return x.tur === 'sil' ? 'son seti sil' : 'son seti düzelt';
  }).join(' + ');
}
/* Ctrl+K: [ilk öneriler, son öneriler]. Tek başına tartı/kalori komut.js'te zaten var */
function komutOneri(q) {
  var r = coz(q), bas = [], son = [];
  if (r && r.satirlar && r.satirlar.some(function (x) { return x.tur !== 'kilo' && x.tur !== 'kcal'; }) || r && r.satirlar && r.satirlar.length > 1)
    bas.push({ ad: (r.satirlar.some(function (x) { return x.tur === 'set'; }) ? 'Set ekle: ' : 'Uygula: ') + ozetYaz(r), alt: 'önizle, onayla', f: function () { onizle(r, 'komut', q); } });
  else if (r && r.soru && r.soru.cevap) bas.push({ ad: r.soru.cevap, alt: 'cevap', f: function () { AT.kapat(); } });
  else if (r && r.soru && AT.kocBagli && AT.kocBagli() && String(q).trim().length > 6) son.push({ ad: 'Koça sor: ' + String(q).trim(), alt: 'Defter', f: function () { kocaGit(q); } });
  else if (r && r.mesaj) bas.push({ ad: r.mesaj, alt: '', f: function () { AT.toast(r.mesaj); } });
  else if (!r && setBenzeri(q)) son.push(AT.kocJsonVar && AT.kocJsonVar() ? { ad: 'Set ekle: koç anlamlandırsın', alt: 'koça kısa istek', f: function () { kocla(q, 'komut'); } }
    : { ad: ORNEK, alt: '', f: function () { AT.toast(ORNEK); } });
  return [bas, son];
}
function kocaGit(q) {
  AT.kapat(); var b = AT.$('#tabs [data-tab="defter"]'); if (b) b.click();
  if (AT.islem['koc-sor']) AT.islem['koc-sor']({ q: String(q).trim() });
}
/* Defter "Kaydet": güçlü uyum varsa seçim (antrenmana ekle / not olarak kaydet); soru → cevap. true = pencere açıldı */
function defterOnce(m) {
  var r = coz(m);
  if (r && r.satirlar && r.guclu) return onizle(r, 'defter', m);
  if (r && r.soru && r.soru.cevap) { cevapGoster(r.soru, 'defter', m); return true; }
  return false;
}
/* "Koça sor": set kalıbı → önizleme (koç limiti harcanmaz); soru → kural cevabı; kural anlamazsa set benzeri metinde JSON yedeği */
function kocOnce(m) {
  var r = coz(m);
  if (r && r.satirlar) return onizle(r, 'defter', m);
  if (r && r.soru && r.soru.cevap) { cevapGoster(r.soru, 'koc', m); return true; }
  if (!r && setBenzeri(m) && AT.kocJsonVar && AT.kocJsonVar()) { kocla(m, 'defter'); return true; }
  return false;
}

/* ---------- sesli giriş ---------- */
var IKON_MIK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
function sesVar() { return typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) || null; }
function mik(hedef) { return sesVar() ? '<button type="button" class="mik" data-act="sd-mik" data-h="' + AT.h(hedef) + '" aria-label="Sesle yaz" aria-pressed="false" title="Sesle yaz">' + IKON_MIK + '</button>' : ''; }
var dinleyen = null;
var SES_HATA = { 'not-allowed': 'Mikrofon izni verilmedi', 'service-not-allowed': 'Mikrofon izni verilmedi', 'no-speech': 'Ses duyulmadı',
  'audio-capture': 'Mikrofon bulunamadı', network: 'Ses tanıma için internet gerekli' };
function mikDurum(h, acik) {
  var b = AT.$('[data-act="sd-mik"][data-h="' + h + '"]'); if (!b) return;
  if (b.classList) b.classList.toggle('dinliyor', acik); if (b.setAttribute) b.setAttribute('aria-pressed', acik ? 'true' : 'false');
}
function sesBitti(h, metin) {
  if (h === 'komut') { var r = coz(metin); if (r && r.satirlar) onizle(r, 'komut', metin); else if (r && r.soru && r.soru.cevap) cevapGoster(r.soru, 'komut', metin); }
  else if (h === 'df-metin') defterOnce(metin);
}
AT.islem['sd-mik'] = function (d) {
  if (dinleyen) { try { dinleyen.stop(); } catch (x) {} return; }
  var C = sesVar(), e = AT.$('#' + d.h); if (!C || !e) return;
  var r = new C(), bas = d.h === 'df-metin' && String(e.value || '').trim() ? String(e.value).replace(/\s*$/, ' ') : '', son = '', hata = null;
  r.lang = 'tr-TR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onresult = function (ev) {
    var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
    son = t.trim(); e.value = bas + son;
    if (e.dispatchEvent && typeof Event === 'function') e.dispatchEvent(new Event('input', { bubbles: true }));
  };
  r.onerror = function (ev) { hata = ev && ev.error || 'diger'; };
  r.onend = function () {
    dinleyen = null; mikDurum(d.h, false);
    if (hata && hata !== 'aborted') return AT.toast(SES_HATA[hata] || 'Ses tanınamadı');
    if (!son) return hata ? null : AT.toast('Ses duyulmadı');
    sesBitti(d.h, e.value);
  };
  try { r.start(); } catch (x) { return AT.toast('Mikrofon başlatılamadı'); }
  dinleyen = r; mikDurum(d.h, true);
};

/* ---------- işlemler, olaylar ---------- */
AT.islem['sd-ekle'] = uygula;
AT.islem['sd-set-sil'] = function (d) {
  var x = on && on.satirlar[+d.sd]; if (!x) return;
  x.setler.splice(+d.sk, 1); if (!x.setler.length) on.satirlar.splice(+d.sd, 1);
  if (!on.satirlar.length) { on = null; return AT.kapat(); }
  ciz();
};
AT.islem['sd-koca'] = function (d) { kocaGit(d.q); };
if (typeof document !== 'undefined') document.addEventListener('input', function (ev) {
  var t = ev.target; if (!on || !t || !t.dataset || t.dataset.sd == null) return;
  var x = on.satirlar[+t.dataset.sd]; if (!x) return;
  if (t.type === 'checkbox') { x.kapali = !t.checked; var s = t.closest && t.closest('.sd-grup'); if (s) s.classList.toggle('kapali', x.kapali); return; }
  if (t.dataset.sf === 'v') x.v = t.value; else if (x.setler && x.setler[+t.dataset.sk]) x.setler[+t.dataset.sk][t.dataset.sf] = t.value;
});

AT.setAyristir = setAyristir;
AT.setDil = { coz: coz, onizle: onizle, uygula: uygula, komutOneri: komutOneri, defterOnce: defterOnce, kocOnce: kocOnce, mik: mik, kocla: kocla };
AT._setdil = { normal: normal, hareketBul: hareketBul, jsonDogrula: jsonDogrula, kocIstem: kocIstem, setBenzeri: setBenzeri, on: function () { return on; }, sonKg: sonKg };   /* test için */
})(window.AT);
