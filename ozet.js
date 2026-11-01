/* ozet.js: modül (window.AT'ye kayıt olur). Antrenman bitince özet penceresi, bir "an":
   üstte ad; süre · set · toplam kg (sayarak yükselir); aynı adlı önceki antrenmana göre toplam artış yüzdesi büyük;
   rekor kırıldıysa altın "rekor şeridi" kartları tek tek belirir (hareket + eski → yeni tahmini max) ve pencereden
   bir kez ince altın ışık geçer (hareket azaltmada yok). Konfeti yok.
   AT.seansOzet(se) -> app.js bitir çağırır. Fikir: Hevy/Strong antrenman sonu özeti (yalnız fikir). */
(function (AT) {
'use strict';

function dk(se) { return se.end && se.start ? Math.max(1, Math.round((se.end - se.start) / 60000)) : null; }
function setSay(se) { return se.exs.reduce(function (t, e) { return t + AT.yapilanSetler(e).length; }, 0); }
function sadeAd(s) { return String(s || '').replace(/\s*\(örnek\)\s*$/i, '').trim().toLocaleLowerCase('tr'); }
/* aynı adlı (örnek eki yok sayılır) bundan önceki son antrenman */
function oncekiAyni(se) {
  var ad = sadeAd(se.name), l = AT.bitenSeanslar().filter(function (s) { return s.id !== se.id && sadeAd(s.name) === ad && (s.date < se.date || (s.date === se.date && (s.start || 0) < (se.start || 0))); });
  return l.length ? l[l.length - 1] : null;
}
function veri(se) {
  var pr = AT.prHesapla()[se.id] || {}, hac = AT.seansHacim(se), on = oncekiAyni(se), onH = on ? AT.seansHacim(on) : 0;
  return {
    dk: dk(se), set: setSay(se), hacim: hac, fark: on ? hac - onH : null, onceki: on ? on.date : null,
    yuzde: on && onH > 0 ? Math.round((hac - onH) / onH * 100) : null,
    rekor: Object.keys(pr).map(function (ad) { return { ad: ad, t: pr[ad] }; })
  };
}
function say(n, d) { return '<b data-say="' + n + '" data-d="' + (d || 0) + '">' + AT.fmt(n, d || 0) + '</b>'; }
var YILDIZ = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"/></svg>';

/* rekor şeridi kartı: tahmini max öncelikli (eski → yeni), yoksa en ağır */
function rekorKart(r, i) {
  var tm = r.t.filter(function (t) { return t.ad === 'Tahmini max'; })[0], ea = r.t.filter(function (t) { return t.ad === 'En ağır'; })[0];
  var t = tm || ea, d = t === ea ? 2 : 1;
  return '<li style="--i:' + i + '"><span class="an-yildiz">' + YILDIZ + '</span><span class="an-ad"><b>' + AT.h(r.ad) + '</b><small>' +
    (tm ? 'tahmini max' : 'en ağır') + (tm && ea ? ' · en ağır ' + AT.fmt(ea.yeni, 2) + ' kg' : '') + '</small></span>' +
    '<span class="an-deger"><s>' + AT.fmt(t.yeni - t.fark, d) + '</s><span aria-hidden="true"> → </span><span class="sr"> yerine </span><strong>' + AT.fmt(t.yeni, d) + '</strong><small> kg</small></span></li>';
}

AT.seansOzet = function (se) {
  var v = veri(se), ton = v.hacim >= 10000, rk = v.rekor.length;
  var o = '<div class="ozet-son an' + (rk ? ' rekorlu' : '') + '">' + (rk ? '<div class="an-isik" aria-hidden="true"></div>' : '') +
    '<p class="ozet-ust">Antrenman bitti</p><h3>' + AT.h(se.name || 'Antrenman') + '</h3>' +
    '<div class="ozet ozet-buyuk">' +
    (v.dk != null ? '<div>' + say(v.dk) + '<span>dakika</span></div>' : '') +
    '<div>' + say(v.set) + '<span>set</span></div>' +
    '<div>' + (ton ? say(Math.round(v.hacim / 100) / 10, 1) + '<span>ton kaldırdın</span>' : say(Math.round(v.hacim)) + '<span>kg kaldırdın</span>') + '</div></div>';
  if (v.fark != null && v.fark >= 1) {   /* yalnız artış; düşüş moral bozmasın */
    var alt = 'Geçen seferden +' + AT.fmt(Math.round(v.fark), 0) + ' kg fazla (' + AT.h(AT.tarih(v.onceki, 1)) + ')';
    o += v.yuzde >= 1 && v.yuzde <= 200
      ? '<div class="an-artis"><p class="an-yuzde"><span>+%</span>' + say(v.yuzde) + '</p><p>toplam, geçen seferden fazla<small>' + alt.replace(/^Geçen seferden /, '') + '</small></p></div>'
      : '<p class="durum iyi">' + alt + '</p>';
  }
  if (rk) o += '<h4 class="an-baslik">' + (rk === 1 ? 'Yeni rekor' : rk + ' yeni rekor') + '</h4><ul class="an-rekor">' + v.rekor.map(rekorKart).join('') + '</ul>';
  o += '<button class="btn-ac btn-big an-tamam" data-act="kapat">Tamam</button></div>';
  AT.sheet(o);
  if (AT.duyur) AT.duyur('Antrenman bitti' + (rk ? ', ' + (rk === 1 ? 'yeni rekor' : rk + ' yeni rekor') + ': ' + v.rekor.map(function (r) { return r.ad; }).join(', ') : '') + '.');
  saydir();
};

/* sayılar 0'dan değerine ~0,7 sn'de yükselir (hareket azaltma tercihinde hemen) */
function saydir() {
  var el = document.querySelectorAll('#sheet [data-say]');
  if (!el.length || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  var t0 = null, SURE = 700;
  function adim(t) {
    if (t0 == null) t0 = t;
    var k = Math.min(1, (t - t0) / SURE), e = 1 - Math.pow(1 - k, 3);
    Array.prototype.forEach.call(el, function (b) { b.textContent = AT.fmt(+b.dataset.say * e, +b.dataset.d); });
    if (k < 1) requestAnimationFrame(adim);
  }
  requestAnimationFrame(adim);
}

AT._ozet = { veri: veri, oncekiAyni: oncekiAyni };   /* test için */
})(window.AT);
