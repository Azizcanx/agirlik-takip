/* halka.js: modül (window.AT'ye kayıt olur). Bugün ekranının "Apple Fitness" kahramanı: üç iç içe halka + yan değerler,
   altında widget kartları (kilo, seri, son rekor, sıradaki). Yalnız gösterim; veri app.js AT.halkaVeri / bulk.js AT.gunVeri'den okunur.
   Dış halka: bu hafta antrenman / hedef · orta: bugünkü kalori / hedef · iç: protein / hedef. %100'ü geçen ikinci tur çizer.
   Halkalar yalnız Apple temasında görünür (CSS: .halka-hero { display: none } diğer temalarda). AT.halka.html() */
(function (AT) {
'use strict';

var C = 100, R = [84, 62, 40], SW = 17;   /* viewBox 200: merkez 100, yarıçaplar, çizgi kalınlığı */
var AD = ['ant', 'kcal', 'prot'];
function yay(i, f) {
  var o = '', r = R[i], ad = AD[i], v1 = Math.max(0, Math.min(1, f)) * 100, v2 = f > 1 ? Math.min(1, f - 1) * 100 : 0;
  o += '<circle class="h-iz" cx="' + C + '" cy="' + C + '" r="' + r + '" stroke-width="' + SW + '"/>';
  if (v1 > 0.4) o += '<circle class="h-yay h-' + ad + '" cx="' + C + '" cy="' + C + '" r="' + r + '" stroke-width="' + SW + '" pathLength="100" stroke="url(#hg-' + ad + ')" style="--v:' + v1.toFixed(1) + '" stroke-dasharray="' + v1.toFixed(1) + ' 100" transform="rotate(-90 ' + C + ' ' + C + ')"/>';
  if (v2 > 0.4) o += '<circle class="h-yay h-ust h-' + ad + '" cx="' + C + '" cy="' + C + '" r="' + r + '" stroke-width="' + SW + '" pathLength="100" stroke="url(#hg-' + ad + 'b)" style="--v:' + v2.toFixed(1) + '" stroke-dasharray="' + v2.toFixed(1) + ' 100" transform="rotate(-90 ' + C + ' ' + C + ')"/>';
  return o;
}
function say(n) { return '<data class="say" value="' + n + '" data-say="' + n + '" data-say-ad="halka-' + n + '">' + AT.fmt(n, 0) + '</data>'; }
function yuzde(f) { return f == null ? '' : Math.round(f * 100) + '%'; }

function veri() {
  var h = AT.halkaVeri ? AT.halkaVeri() : { n: 0, hedef: 3 }, g = AT.gunVeri ? AT.gunVeri() : {};
  return {
    ant: { v: h.n, hedef: h.hedef },
    kcal: { v: g.kcal || 0, hedef: g.kcalHedef || null },
    prot: { v: g.p || 0, hedef: g.pHedef || null }
  };
}
function html() {
  var d = veri(), f = [d.ant.hedef ? d.ant.v / d.ant.hedef : 0, d.kcal.hedef ? d.kcal.v / d.kcal.hedef : 0, d.prot.hedef ? d.prot.v / d.prot.hedef : 0];
  var svg = '<svg class="halkalar" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="hg-ant" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fa114f"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient>' +
    '<linearGradient id="hg-antb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a3d"/><stop offset="1" stop-color="#fa114f"/></linearGradient>' +
    '<linearGradient id="hg-kcal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6ff00"/><stop offset="1" stop-color="#30d158"/></linearGradient>' +
    '<linearGradient id="hg-kcalb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30d158"/><stop offset="1" stop-color="#a6ff00"/></linearGradient>' +
    '<linearGradient id="hg-prot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#0a84ff"/></linearGradient>' +
    '<linearGradient id="hg-protb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset="1" stop-color="#00f0ff"/></linearGradient></defs>' +
    yay(0, f[0]) + yay(1, f[1]) + yay(2, f[2]) + '</svg>';
  function sat(ad, ust, v, hedef, birim, f1) {
    return '<li class="h-' + ad + '"><i aria-hidden="true"></i><span class="h-et">' + ust + '</span><b>' + say(Math.round(v)) + (hedef ? '<small> / ' + AT.fmt(hedef, 0) + ' ' + birim + '</small>' : '<small> ' + birim + '</small>') + '</b>' +
      (f1 != null ? '<em>' + yuzde(f1) + '</em>' : '') + '</li>';
  }
  var ozet = 'Antrenman ' + d.ant.v + (d.ant.hedef ? ' / ' + d.ant.hedef : '') + ', kalori ' + Math.round(d.kcal.v) + (d.kcal.hedef ? ' / ' + d.kcal.hedef : '') + ', protein ' + Math.round(d.prot.v) + (d.prot.hedef ? ' / ' + d.prot.hedef : '') + ' gram';
  return '<section class="halka-hero" role="group" aria-label="' + AT.h(ozet) + '">' + svg + '<ul class="halka-say">' +
    sat('ant', 'Antrenman', d.ant.v, d.ant.hedef, 'bu hafta', d.ant.hedef ? f[0] : null) +
    sat('kcal', 'Kalori', d.kcal.v, d.kcal.hedef, 'kcal', d.kcal.hedef ? f[1] : null) +
    sat('prot', 'Protein', d.prot.v, d.prot.hedef, 'g', d.prot.hedef ? f[2] : null) + '</ul></section>';
}

/* ---------- widget kartları ---------- */
function ikon(ad) {
  var p = { kilo: '<path d="M6 8h12l1.5 11h-15z"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0"/>', seri: '<path d="M12 3c1 3.4 5 5.2 5 10a5 5 0 0 1-10 0c0-2 .9-3.2 2-4.3.2 1.6 1 2.3 2 2.6C10.6 8 11 5.8 12 3z"/>',
    rekor: '<path d="M12 3.5l2.4 5 5.4.7-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.7z"/>', sira: '<path d="M9 5.5l8 6.5-8 6.5z"/>' };
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' + p[ad] + '</svg>';
}
function kartlar() {
  var S = AT.S, bg = AT.iso(new Date()), o = '';
  var l = (AT.bulkHesap && AT.bulkHesap.gecerli) ? AT.bulkHesap.gecerli(S.bw || []) : (S.bw || []);
  var t = l.length ? l[l.length - 1] : null, once = t ? l.filter(function (x) { return x.date < t.date; }).pop() : null;
  var fark = t && once ? Math.round((t.kg - once.kg) * 10) / 10 : null;
  o += '<div class="wg wg-kilo"><div class="wg-ust">' + ikon('kilo') + '<span>Kilo</span></div><b class="wg-say">' + (t ? AT.fmt(t.kg) + '<small> kg</small>' : '–') + '</b>' +
    '<span class="wg-alt' + (fark > 0 ? ' art' : fark < 0 ? ' azal' : '') + '">' + (fark == null ? 'tartı ekle' : (fark > 0 ? '+' : fark < 0 ? '−' : '±') + AT.fmt(Math.abs(fark)) + ' kg önceki tartıdan') + '</span></div>';
  var h = AT.halkaVeri ? AT.halkaVeri() : { seri: 0, sira: null };
  o += '<div class="wg wg-seri"><div class="wg-ust">' + ikon('seri') + '<span>Seri</span></div><b class="wg-say">' + h.seri + '<small> hafta</small></b><span class="wg-alt">' + (h.seri ? 'üst üste antrenman' : 'bu hafta başla') + '</span></div>';
  var pr = AT.prHesapla ? AT.prHesapla() : null, sonPr = null;
  if (pr) AT.bitenSeanslar().slice().reverse().some(function (se) { var m = pr[se.id]; if (m) { var k = Object.keys(m)[0]; sonPr = { ad: k, v: m[k][0].yeni, d: se.date }; return true; } return false; });
  var prAd = sonPr ? String(sonPr.ad) : '';
  o += '<div class="wg wg-rekor"><div class="wg-ust">' + ikon('rekor') + '<span>Son rekor</span></div><b class="wg-say wg-metin">' + (sonPr ? AT.h(prAd.length > 22 ? prAd.slice(0, 21) + '…' : prAd) : '–') + '</b><span class="wg-alt">' + (sonPr ? AT.tarih(sonPr.d, 1) : 'henüz yok') + '</span></div>';
  var sr = h.sira;
  o += '<div class="wg wg-sira"><div class="wg-ust">' + ikon('sira') + '<span>Sıradaki</span></div><b class="wg-say wg-metin">' + (sr ? AT.h(sr.name || 'Antrenman') : 'Antrenman') + '</b><span class="wg-alt">' + (sr ? 'son: ' + AT.tarih(sr.date, 1) : 'serbest başla') + '</span></div>';
  return '<div class="wg-sira-grup" role="group" aria-label="Özet kartları">' + o + '</div>';
}

AT.halka = { html: html, kartlar: kartlar, veri: veri };
})(window.AT);
