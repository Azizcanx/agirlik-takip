/* komut.js: modül (window.AT'ye kayıt olur). Hızlı komut: Ctrl+K (Mac'te Cmd+K).
   Yaz, Enter = ilk öneri. Anlar: "82,4" / "kilo 82,4" → kilo · "+650" / "2400 kcal" / "kalori 2400" → kalori ·
   sekme adları · "başla" · antrenmandayken hareket adı → ekle · "özet", "tema", "yedek".
   Komutlar ekrandaki düğmelerle aynı işi yapar (AT.islem); veri mantığı tekrar yazılmaz. */
(function (AT) {
'use strict';

/* küçük harf + Türkçe harfsiz ("geçmiş" = "gecmis"): klavyede Türkçe harf yazmadan da bulsun */
function kucuk(s) { return String(s || '').toLocaleLowerCase('tr').trim().replace(/[çğıöşü]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]; }); }
function sekme(ad) { var b = AT.$('#tabs [data-tab="' + ad + '"]'); if (b) b.click(); }
/* ekrandaki giriş kutusunu doldurup aynı düğme işini çalıştır (kutu Bugün ekranında) */
function kutuyla(id, deger, act) {
  AT.kapat(); sekme('bugun');
  var e = AT.$('#' + id); if (!e) { if (id === 'bwkg' && AT.islem['tarti-duzelt']) { AT.islem['tarti-duzelt'](); e = AT.$('#' + id); } }
  if (!e) return AT.toast('Önce Bugün ekranını aç');
  e.value = deger; AT.islem[act]();
}

var SEKMELER = [['bugun', 'Bugün'], ['gecmis', 'Geçmiş'], ['ilerleme', 'İlerleme'], ['defter', 'Defter'], ['takviye', 'Takviye'], ['ayarlar', 'Ayarlar']];
/* q -> [{ad, alt, f}] (ilk = Enter) */
function oneriler(q) {
  var k = kucuk(q), o = [], S = AT.S, sayi = /^(kilo\s*)?(\d{2,3}([.,]\d)?)\s*(kg)?$/.exec(k), kc = /^(kalori|kcal)?\s*(\+?\s*\d{2,5})\s*(kcal|kalori)?$/.exec(k);
  if (sayi && !/kcal|kalori/.test(k) && +sayi[2].replace(',', '.') >= 20 && +sayi[2].replace(',', '.') <= 400 && (sayi[1] || sayi[4] || /[.,]/.test(sayi[2])))
    o.push({ ad: 'Kilo: ' + sayi[2].replace('.', ',') + ' kg', alt: 'bugünkü tartı', f: function () { kutuyla('bwkg', sayi[2], 'bw-ekle'); } });
  if (kc && (kc[1] || kc[3] || /^\+/.test(kc[2]) || +kc[2] >= 500)) {
    var v = kc[2].replace(/\s/g, '');
    o.push({ ad: (/^\+/.test(v) ? 'Kalori ekle: ' : 'Kalori: ') + v + ' kcal', alt: /^\+/.test(v) ? 'bugünün toplamına' : 'bugünün toplamı', f: function () { kutuyla('kcalgir', v, 'kcal-ekle'); } });
  }
  SEKMELER.forEach(function (t) { if (!k || kucuk(t[1]).indexOf(k) === 0) o.push({ ad: t[1], alt: 'sekme', f: function () { AT.kapat(); sekme(t[0]); } }); });
  var eylem = [
    ['Antrenmana başla', 'başla basla antrenman', function () { AT.kapat(); sekme('bugun'); if (!AT.S.active) AT.islem.basla(); }, !S.active],
    ['Hareket ekle', 'hareket ekle egzersiz', function () { AT.kapat(); sekme('bugun'); AT.islem['egz-ekle'](); }, !!S.active],
    ['Haftalık özet', 'özet ozet hafta karne', function () { AT.islem['hafta-ozet'](); }, !!AT.islem['hafta-ozet']],
    ['Temayı değiştir', 'tema koyu açık acik karanlık', function () { AT.kapat(); AT.islem['tema-cevir'](); }, !!AT.islem['tema-cevir']],
    ['Yedeği indir', 'yedek indir dışa aktar json', function () { AT.kapat(); AT.islem.disa(); }, true],
    ['Klavye kısayolları', 'kısayol kisayol yardım', function () { AT.islem.kisayol(); }, !!AT.islem.kisayol]
  ];
  eylem.forEach(function (x) { if (x[3] && (!k || kucuk(x[1]).split(' ').some(function (w) { return w.indexOf(k) === 0; }) || kucuk(x[0]).indexOf(k) >= 0)) o.push({ ad: x[0], alt: '', f: x[2] }); });
  /* antrenmandayken hareket adı: doğrudan ekle */
  if (S.active && k.length >= 2 && window.HAREKETLER) {
    window.HAREKETLER.concat(S.ozel || []).filter(function (x) { return (kucuk(x.ad) + ' ' + kucuk(x.tr)).indexOf(k) >= 0; }).slice(0, 5).forEach(function (x) {
      o.push({ ad: x.ad, alt: 'harekete ekle · ' + x.kas, f: function () { AT.islem['egz-sec-ekle']({ ad: x.ad }); } });
    });
  }
  /* antrenman dışında hareket adı: o hareketin gelişimi (İlerleme > Güç) */
  if (!S.active && k.length >= 2) {
    var gor = {};
    AT.bitenSeanslar().forEach(function (se) { se.exs.forEach(function (e) { if (AT.yapilanSetler(e).length) gor[e.ad] = 1; }); });
    Object.keys(gor).filter(function (ad) { var x = (window.HAREKETLER || []).filter(function (y) { return y.ad === ad; })[0]; return (kucuk(ad) + ' ' + kucuk(x && x.tr)).indexOf(k) >= 0; })
      .slice(0, 5).forEach(function (ad) { o.push({ ad: ad, alt: 'gelişimini gör', f: function () { AT.kapat(); sekme('ilerleme'); AT.islem['egz-sec']({ ad: ad }); } }); });
  }
  /* setdil.js: "curl 3x10 15", "bir set daha", "bench rekorum" → başa; koç yedeği / "Anlayamadım" sona */
  var sd = AT.setDil ? AT.setDil.komutOneri(q) : [[], []];
  return sd[0].concat(o.slice(0, Math.max(0, 8 - sd[0].length - sd[1].length)), sd[1]);
}

var liste = [];
function ciz() {
  var q = AT.$('#komut') ? AT.$('#komut').value : '', l = liste = oneriler(q), el = AT.$('#komut-liste'); if (!el) return;
  el.innerHTML = l.length ? l.map(function (x, i) {
    return '<button class="satir komut' + (i === 0 ? ' ilk' : '') + '" data-act="komut-sec" data-i="' + i + '"><span class="grow"><b>' + AT.h(x.ad) + '</b>' + (x.alt ? '<span>' + AT.h(x.alt) + '</span>' : '') + '</span>' + (i === 0 ? '<kbd>Enter</kbd>' : '') + '</button>';
  }).join('') : '<p class="mut">Eşleşen komut yok</p>';
}
function ac() {
  AT.sheet('<div class="komut-ust"><input id="komut" class="komut-kutu" placeholder="Komut yaz: 82,4 · +650 · curl 3x10 15" autocomplete="off" aria-label="Hızlı komut">' +
    (AT.setDil ? AT.setDil.mik('komut') : '') + '</div><div id="komut-liste" class="liste komut-liste"></div>');
  var e = AT.$('#komut'); e.addEventListener('input', ciz); e.focus(); ciz();
}
AT.islem['komut-sec'] = function (d) { var x = liste[+d.i]; if (x) x.f(); };
AT.islem.komut = ac;

document.addEventListener('keydown', function (ev) {
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); ac(); return; }
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'komut') { ev.preventDefault(); if (liste[0]) liste[0].f(); }
}, true);

AT._komut = { oneriler: oneriler };   /* test için */
AT.harfsiz = kucuk;   /* tek kaynak: app.js hareket seçici araması da bunu kullanır */
})(window.AT);
