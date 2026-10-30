/* notlar.js: modül (window.AT'ye kayıt olur)
   Bugün ekranı için kural tabanlı notlar. LLM yok, internet yok; her not somut veri içerir.
   AT.notlar(bugunIso?) -> [{ tip:'iyi'|'uyari'|'bilgi', baslik, aciklama }] (en fazla 4, öncelik sırasıyla)
   AT.bolum.notlar()    -> HTML ya da '' */
(function (AT) {
'use strict';
if (!AT) return;

var MAX = 4;
var IZLENEN = ['Göğüs', 'Sırt', 'Bacak', 'Omuz'];   // ihmal kuralı için büyük gruplar

function gunFark(a, b) { return Math.round((AT.parse(b) - AT.parse(a)) / 864e5); }   // b - a (gün)
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function kasi(ex) { return ex.kas || AT.kasOf(ex.ad); }
function altVucut(ex) { return kasi(ex) === 'Bacak' || /deadlift/i.test(ex.ad); }
/* artış: alt vücut +5 (hafifse +2,5), üst vücut +2,5 (20 kg altı dambıl/kablo +1) */
function artis(ex, kg) { return altVucut(ex) ? (kg < 40 ? 2.5 : 5) : (kg < 20 ? 1 : 2.5); }
function kgYaz(n) { return AT.fmt(n, 2) + ' kg'; }

/* egzersiz geçmişi: ad -> [{ date, sets, ex }] (seans başına tek kayıt, kronolojik) */
function gecmis(seanslar) {
  var m = {};
  seanslar.forEach(function (se) {
    (se.exs || []).forEach(function (ex) {
      var sets = AT.yapilanSetler(ex); if (!sets.length) return;
      var l = m[ex.ad] = m[ex.ad] || [], son = l[l.length - 1];
      if (son && son.id === se.id) son.sets = son.sets.concat(sets);
      else l.push({ id: se.id, date: se.date, sets: sets, ex: ex });
    });
  });
  return m;
}
/* tahmini max: 12 tekrar üstü sayılmaz (AT.tahminiMax); eski app.js ile çalışırsa e1rm */
function tmax(s) { return (AT.tahminiMax || AT.e1rm)(AT.num(s.kg), AT.num(s.reps), s.rpe); }
/* aralık altı geri hesap (Boostcamp'in açıkladığı fikir, kendi kodumuz): çalışma setlerinin EN İYİSİ bile alt sınırın
   altındaysa, alt tekrar için kg = tahmini max / (1 + alt/30), 20 kg altı 1, üstü 2,5 kg adıma aşağı yuvarlı.
   Yalnız bazı setler kaçtıysa, sonuç mevcut kg'dan hafif değilse ya da tahmini max yoksa 0 (bugünkü kural sürer) */
function geriKg(ws, kg, alt) {
  if (Math.max.apply(0, tekrarlar(ws)) >= alt) return 0;
  var e = enIyi1RM(ws); if (!(e > 0)) return 0;
  var adim = kg < 20 ? 1 : 2.5, k = Math.floor(e / (1 + alt / 30) / adim + 1e-9) * adim;
  return k > 0 && k < kg ? Math.round(k * 100) / 100 : 0;
}
function enIyi1RM(sets) { return sets.reduce(function (t, s) { return Math.max(t, tmax(s)); }, 0); }
function enIyiSet(sets) {
  var b = null, bv = 0;
  sets.forEach(function (s) { var v = tmax(s); if (v > bv) { bv = v; b = s; } });
  return b;
}
/* çalışma setleri: seansın en ağır kg'sındaki setler (ısınma/geri iniş setleri hariç) */
function calisma(sets) {
  var mx = sets.reduce(function (t, s) { return Math.max(t, AT.num(s.kg)); }, 0);
  return sets.filter(function (s) { return AT.num(s.kg) === mx; });
}
function tekrarlar(sets) { return sets.map(function (s) { return AT.num(s.reps); }); }
/* [5,5,5] -> "3×5", [8,7,6] -> "8-7-6" */
function kisaSet(rs) { return rs.every(function (r) { return r === rs[0]; }) ? rs.length + '×' + rs[0] : rs.join('-'); }
function ort(a) { return a.reduce(function (t, x) { return t + x; }, 0) / a.length; }
/* tekrar aralığı: çalışma setlerinin hepsi 6 ve altıysa 3–6, değilse 8–12 */
function aralik(rs) { return Math.max.apply(0, rs) <= 6 ? [3, 6] : [8, 12]; }
function rpeOf(s) { var r = s ? AT.num(s.rpe) : NaN; return r >= 6 && r <= 10 ? r : null; }
var RPE_KOLAY = 7, RPE_ZOR = 9.5;

/* 1) Tartı aralığı: bulk açık, son tartı 3+ gün önce ya da hiç */
function kuralTarti(S, bugun, bd) {
  if (!S.bulk || !bd) return null;
  var g = bd.sonTarti ? gunFark(bd.sonTarti, bugun) : null;
  if (g !== null && g < 3) return null;
  return {
    tip: 'uyari',
    baslik: g === null ? 'Bulk başladı, hiç tartılmadın' : g + ' gündür tartılmadın',
    aciklama: 'Sabah, tuvaletten sonra, aç karnına tartıl; haftalık ortalama düzgün çıksın. Haftada en az 3 tartı yeterli.'
  };
}

/* 2) İhmal edilen kas grubu: son 30 günde 3+ antrenman; büyük grup 8+ gündür yok (daha önce yapılmışsa) */
function kuralIhmal(seanslar, bugun) {
  var son30 = seanslar.filter(function (se) { var g = gunFark(se.date, bugun); return g >= 0 && g < 30; });
  if (son30.length < 3) return null;
  var son = {};
  seanslar.forEach(function (se) {
    (se.exs || []).forEach(function (ex) { if (AT.yapilanSetler(ex).length) son[kasi(ex)] = se.date; });
  });
  var l = IZLENEN.filter(function (k) { return son[k]; })
    .map(function (k) { return { kas: k, gun: gunFark(son[k], bugun), tarih: son[k] }; })
    .filter(function (x) { return x.gun >= 8; })
    .sort(function (a, b) { return b.gun - a.gun; });
  if (!l.length) return null;
  var ilk = l[0];
  var baslik = l.length === 1 ? ilk.kas + ' ' + ilk.gun + ' gündür çalışılmadı'
    : l.map(function (x) { return x.kas + ' ' + x.gun; }).join(', ') + ' gündür çalışılmadı';
  return {
    tip: 'uyari',
    baslik: baslik,
    aciklama: 'Son ' + ilk.kas + ': ' + AT.tarih(ilk.tarih, true) + '. Kas başına haftada 2 seans hedefle; sıradaki antrenmana ' + ilk.kas + ' koy.'
  };
}

/* 3) Durağanlık: 4+ seanslı egzersizde en iyi e1RM son 3+ seanstır geçilmedi (son seans 28 gün içinde) */
function durgunlar(h, bugun) {
  var out = [];
  Object.keys(h).forEach(function (ad) {
    var l = h[ad].filter(function (x) { return enIyi1RM(x.sets) > 0; });
    if (l.length < 4 || gunFark(l[l.length - 1].date, bugun) > 28) return;
    var bi = 0, bv = 0;
    l.forEach(function (x, i) { var v = enIyi1RM(x.sets); if (v > bv + 0.05) { bv = v; bi = i; } });
    var k = l.length - 1 - bi;
    if (k >= 3) out.push({ ad: ad, n: l.length, k: k, e1: bv, son: l[l.length - 1] });
  });
  return out.sort(function (a, b) { return b.n - a.n || b.k - a.k; });
}
function kuralDurgun(d, S) {
  if (!d.length) return null;
  var x = d[0], s = enIyiSet(x.son.sets), kg = AT.num(s.kg), r = AT.num(s.reps), yeni = kg + artis(x.son.ex, kg);
  var aralik = r >= 8 ? r + ' yerine 5-6 tekrar' : r + ' yerine 8-10 tekrar';
  var aciklama = 'Son en iyi set ' + AT.fmt(kg, 2) + '×' + r + '. ' +
    (S.bulk ? 'Bulk\'tasın: sonraki seansta ' + kgYaz(yeni) + ' dene ya da tekrar aralığını değiştir (' + aralik + ').'
            : 'Sonraki seansta ' + kgYaz(yeni) + ' dene ya da tekrar aralığını değiştir (' + aralik + '); uyku ve kaloriyi kontrol et.');
  return { tip: 'bilgi', baslik: x.ad + ' ' + x.k + ' seanstır ilerlemiyor', aciklama: 'En iyi tahmini max ' + AT.fmt(x.e1, 1) + ' kg. ' + aciklama };
}

/* 4) Sonraki seans önerisi: çift ilerleme (double progression) + deload + isteğe bağlı RPE.
   Aday: son 14 günde yapılan, 2+ çalışma seti (en ağır kg'daki setler), kg > 0.
   Aralık 8–12 (setlerin hepsi ≤6 ise 3–6). Öncelik: deload > kg artır > aynı kg + 1 tekrar.
   - deload: son 3 seans aynı kg, ortalama tekrar düştü ya da iki seans üst üste artmadı, son seans tepeye ulaşmadı
             -> 1 hafta −%10 (2,5'e yuvarlı). Son set RPE ≤ 7 ise deload yok (kolay geçmiş).
   - tepe: tüm çalışma setleri ≥ aralık tepesi -> +artis() kg, tekrar alt sınıra. Son set RPE ≥ 9,5 -> aynı kg'da kal.
   - aralık içi/altı: aynı kg, hedef = max(ilk set, en düşük + 1) (tepeyi aşmaz). Son set RPE ≤ 7 ve alt sınır tuttuysa -> +kg.
   Her egzersize tek not; kuralDurgun ile çakışmayı hesapla() önler. */
function oneriler(h, bugun) {
  var m = {};
  Object.keys(h).forEach(function (a) {
    var l = h[a], son = l[l.length - 1], g = gunFark(son.date, bugun);
    if (g < 0 || g > 14) return;
    var ws = calisma(son.sets), kg = AT.num(ws[0] && ws[0].kg);
    if (ws.length < 2 || !(kg > 0)) return;
    var rs = tekrarlar(ws), ilk = rs[0], mn = Math.min.apply(0, rs), ar = aralik(rs), alt = ar[0], tepe = ar[1];
    var rpe = rpeOf(ws[ws.length - 1]), rpeYaz = rpe != null ? 'son set RPE ' + AT.fmt(rpe) : '';
    var ne = AT.tarih(son.date, true), n = ws.length, ek = artis(son.ex, kg), yeni = kg + ek;
    var bolge = (altVucut(son.ex) ? 'Alt vücut' : 'Üst vücut') + ': +' + AT.fmt(ek, 2) + ' kg';
    var x = { g: g, n: l.length };

    // deload: son 3 seans aynı kg'da ve tekrar ilerlemiyor
    var u3 = l.slice(-3).map(function (z) { return calisma(z.sets); });
    if (l.length >= 3 && mn < tepe && kg >= 5 && !(rpe != null && rpe <= RPE_KOLAY) &&
        u3.every(function (w) { return w.length && AT.num(w[0].kg) === kg; })) {
      var o = u3.map(function (w) { return ort(tekrarlar(w)); });
      if (o[2] <= o[1] && (o[2] < o[0] || o[1] <= o[0])) {
        var dk = Math.round(kg * 0.9 / 2.5) * 2.5; if (dk >= kg) dk = kg - 2.5;
        x.sinif = 0; x.hedef = { kg: dk, tekrar: ilk, n: n };
        x.not = { tip: 'uyari', baslik: a + ': bu hafta hafif çalış, ' + kgYaz(dk),
          aciklama: 'Son 3 seans ' + kgYaz(kg) + ' ile tekrarlar ' + u3.map(function (w) { return kisaSet(tekrarlar(w)); }).join(' → ') +
            '; ilerleme durdu. 1 hafta %10 hafif (' + kgYaz(dk) + ') aynı set ve tekrarla toparlan, sonra yine ' + kgYaz(kg) + '.' };
        m[a] = x; return;
      }
    }
    if (mn >= tepe) {
      if (rpe != null && rpe >= RPE_ZOR) {
        x.sinif = 2; x.hedef = { kg: kg, tekrar: tepe, n: n };
        x.not = { tip: 'bilgi', baslik: a + ': ' + kgYaz(kg) + ' ile ' + n + ' set × ' + tepe + ' tekrar',
          aciklama: 'Geçen sefer (' + ne + ') ' + n + '×' + mn + ' @ ' + kgYaz(kg) + ' ama ' + rpeYaz + ': aynı kg\'da kal. RPE 9 ve altına inince +' + AT.fmt(ek, 2) + ' kg.' };
      } else {
        x.sinif = 1; x.hedef = { kg: yeni, tekrar: alt, n: n };
        x.not = { tip: 'iyi', baslik: a + ': bugün ' + kgYaz(yeni) + ' dene',
          aciklama: 'Geçen sefer (' + ne + ') ' + n + '×' + mn + ' @ ' + kgYaz(kg) + ', tüm setler ' + alt + '–' + tepe + ' aralığının tepesinde' +
            (rpeYaz ? ' (' + rpeYaz + ')' : '') + '. ' + bolge + ', tekrarı ' + alt + '\'e indir: hedef ' + n + '×' + alt + '.' };
      }
    } else if (rpe != null && rpe <= RPE_KOLAY && mn >= alt) {
      x.sinif = 1; x.hedef = { kg: yeni, tekrar: mn, n: n };
      x.not = { tip: 'iyi', baslik: a + ': bugün ' + kgYaz(yeni) + ' dene',
        aciklama: 'Geçen sefer (' + ne + ') ' + rs.join(', ') + ' tekrar @ ' + kgYaz(kg) + ', ' + rpeYaz + ': fazla kolay. ' + bolge + ', aynı tekrar (' + n + '×' + mn + ').' };
    } else if (geriKg(ws, kg, alt) > 0) {
      // en iyi set bile aralığın altında: alt sınır tekrarı için kg, tahmini maxtan geri (Epley tersi), adıma aşağı yuvarlı
      var gk = geriKg(ws, kg, alt);
      x.sinif = 2; x.hedef = { kg: gk, tekrar: alt, n: n };
      x.not = { tip: 'bilgi', baslik: a + ': ' + kgYaz(gk) + ' ile ' + n + ' set × ' + alt + ' tekrar',
        aciklama: 'Geçen sefer (' + ne + ') ' + rs.join(', ') + ' tekrar @ ' + kgYaz(kg) + ': en iyi set bile ' + alt + '–' + tepe +
          ' aralığının altında. Tahmini maxına göre ' + alt + ' tekrar için ' + kgYaz(gk) + ' uygun; oradan yeniden yüksel, hepsi ' + tepe + ' olunca ' + kgYaz(kg) + '\'a dön.' };
    } else {
      var hedef = Math.min(tepe, Math.max(ilk, mn + 1));
      x.sinif = 2; x.hedef = { kg: kg, tekrar: hedef, n: n };
      x.not = { tip: mn === Math.max.apply(0, rs) ? 'iyi' : 'bilgi', baslik: a + ': ' + kgYaz(kg) + ' ile ' + n + ' set × ' + hedef + ' tekrar',
        aciklama: 'Geçen sefer (' + ne + ') ' + rs.join(', ') + ' tekrar (aralık ' + alt + '–' + tepe + '). ' +
          (rpe != null && rpe >= RPE_ZOR ? 'Son set RPE ' + AT.fmt(rpe) + ': zorlandın, aynı kg\'da kal; ' : mn < ilk ? 'Önce setleri eşitle; ' : 'Her seans bir tekrar ekle; ') +
          'hepsi ' + tepe + ' olunca +' + AT.fmt(ek, 2) + ' kg.' };
    }
    m[a] = x;
  });
  return m;
}
function kuralIlerleme(o, haric) {
  return Object.keys(o).filter(function (a) { return haric.indexOf(a) < 0; }).sort(function (a, b) {
    var x = o[a], y = o[b];
    return x.sinif - y.sinif || y.g - x.g || y.n - x.n;
  }).slice(0, 2).map(function (a) { return o[a].not; });
}

/* 5) Haftalık hacim: bu hafta (Pzt->bugün) set sayısı, geçen haftanın aynı gününe kadarkine göre belirgin düşük.
   Gürültü süzgeci: Çarşamba ve sonrası, geçen hafta o noktaya kadar 12+ set, fark 8+ set ve oran < %60. */
function kuralHacim(seanslar, bugun) {
  var bas = AT.haftaBasi(bugun), gunNo = gunFark(bas, bugun);
  if (gunNo < 2) return null;
  var gBas = gunEkle(bas, -7), gSon = gunEkle(bugun, -7);
  var bu = { set: 0, n: 0 }, gec = { set: 0, n: 0 }, gecTum = 0;
  seanslar.forEach(function (se) {
    var n = (se.exs || []).reduce(function (t, e) { return t + AT.yapilanSetler(e).length; }, 0);
    if (!n) return;
    if (se.date >= bas && se.date <= bugun) { bu.set += n; bu.n++; }
    if (se.date >= gBas && se.date < bas) { gecTum++; if (se.date <= gSon) { gec.set += n; gec.n++; } }
  });
  if (gec.set < 12 || gec.set - bu.set < 8 || bu.set >= gec.set * 0.6) return null;
  return {
    tip: 'bilgi',
    baslik: 'Bu hafta ' + bu.set + ' set, geçen hafta bu güne kadar ' + gec.set + ' set',
    aciklama: 'Geçen hafta toplam ' + gecTum + ' antrenman, bu hafta ' + bu.n + '. Kas kazanımı için haftalık seti koru; hafta bitmeden ' +
      Math.max(1, gecTum - bu.n) + ' antrenman daha planla.'
  };
}

/* saf hesap: seanslar kronolojik, S durum, bugun ISO, bd bulkDurum() sonucu ya da null */
function hesapla(seanslar, S, bugun, bd) {
  seanslar = (seanslar || []).filter(function (se) { return se && se.date && se.date <= bugun; });
  var h = gecmis(seanslar), o = oneriler(h, bugun), out = [];
  // deload önerilen egzersiz durağanlık notuna girmez; durağanlık notu alan egzersiz ilerleme notuna girmez (tek not)
  var d = durgunlar(h, bugun).filter(function (x) { return !(o[x.ad] && o[x.ad].sinif === 0); });
  function ekle(n) { if (n) out.push(n); }
  ekle(kuralTarti(S, bugun, bd));
  ekle(kuralIhmal(seanslar, bugun));
  ekle(kuralDurgun(d, S));
  kuralIlerleme(o, d.length ? [d[0].ad] : []).forEach(ekle);
  ekle(kuralHacim(seanslar, bugun));
  return out.slice(0, MAX);
}

AT.notlar = function (bugun) {
  var S = AT.S || {};
  bugun = bugun || AT.iso(new Date());
  var bd = null;
  try { bd = AT.bulkDurum ? AT.bulkDurum() : null; } catch (e) { bd = null; }
  try { return hesapla(AT.bitenSeanslar(), S, bugun, bd || null); } catch (e) { return []; }
};
AT.notlarHesapla = hesapla;   // test için saf giriş
/* bugünkü hedef (öneriyle aynı kural): ad -> {kg, tekrar, n} ya da null (son seans 14 günden eski / yeterli set yok).
   app.js antrenman ekranında soluk sayıları (placeholder) bununla doldurur. Seans listesi değişmedikçe önbellekte. */
var hedefOnb = { k: null, m: null };
AT.hedefSet = function (ad) {
  var l = AT.bitenSeanslar(), bugun = AT.iso(new Date()), k = bugun + ':' + l.length + ':' + (l.length ? l[l.length - 1].id + (l[l.length - 1].end || '') : '');
  if (hedefOnb.k !== k) { try { hedefOnb.m = oneriler(gecmis(l), bugun); } catch (e) { hedefOnb.m = {}; } hedefOnb.k = k; }
  var x = hedefOnb.m[ad]; return x && x.hedef ? x.hedef : null;
};

AT.bolum = AT.bolum || {};
AT.bolum.notlar = function () {
  if (AT.S && AT.S.active) return '';
  var l = AT.notlar();
  if (!l.length) return '';
  /* başlık = ne yapmalı (tek satır); açıklama = neden, dokununca açılır */
  return '<h2>Bugün için öneriler</h2><ul class="notlar">' + l.map(function (n) {
    var tip = { iyi: 1, uyari: 1, bilgi: 1 }[n.tip] ? n.tip : 'bilgi';
    return '<li class="' + tip + '"><details><summary><b>' + AT.h(n.baslik) + '</b><span class="neden">Neden?</span></summary><span>' + AT.h(n.aciklama) + '</span></details></li>';
  }).join('') + '</ul>';
};
})(window.AT);
