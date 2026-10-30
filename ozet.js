/* ozet.js: modül (window.AT'ye kayıt olur). Antrenman bitince özet penceresi:
   süre · set · toplam kg (sayarak yükselir), aynı adlı önceki antrenmana göre toplam farkı, o günün rekorları.
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
  var pr = AT.prHesapla()[se.id] || {}, hac = AT.seansHacim(se), on = oncekiAyni(se);
  return {
    dk: dk(se), set: setSay(se), hacim: hac, fark: on ? hac - AT.seansHacim(on) : null, onceki: on ? on.date : null,
    rekor: Object.keys(pr).map(function (ad) { return { ad: ad, t: pr[ad] }; })
  };
}
function say(n, d) { return '<b data-say="' + n + '" data-d="' + (d || 0) + '">' + AT.fmt(n, d || 0) + '</b>'; }

AT.seansOzet = function (se) {
  var v = veri(se), ton = v.hacim >= 10000;
  var o = '<div class="ozet-son"><p class="ozet-ust">Antrenman bitti</p><h3>' + AT.h(se.name || 'Antrenman') + '</h3>' +
    '<div class="ozet ozet-buyuk">' +
    (v.dk != null ? '<div>' + say(v.dk) + '<span>dakika</span></div>' : '') +
    '<div>' + say(v.set) + '<span>set</span></div>' +
    '<div>' + (ton ? say(Math.round(v.hacim / 100) / 10, 1) + '<span>ton kaldırdın</span>' : say(Math.round(v.hacim)) + '<span>kg kaldırdın</span>') + '</div></div>';
  if (v.fark != null && v.fark >= 1)   /* yalnız artış; düşüş moral bozmasın */
    o += '<p class="durum iyi">Geçen seferden +' + AT.fmt(Math.round(v.fark), 0) + ' kg fazla (' + AT.h(AT.tarih(v.onceki, 1)) + ')</p>';
  if (v.rekor.length) {
    o += '<h2>' + (v.rekor.length === 1 ? 'Yeni rekor' : v.rekor.length + ' yeni rekor') + '</h2><ul class="ozet-rekor">' + v.rekor.map(function (r) {
      return '<li><b>' + AT.h(r.ad) + '</b><span>' + r.t.map(function (t) { return AT.h(t.ad) + ' ' + AT.fmt(t.yeni) + ' kg <i>+' + AT.fmt(t.fark) + '</i>'; }).join(' · ') + '</span></li>';
    }).join('') + '</ul>';
  }
  o += '<button class="btn-ac btn-big" data-act="kapat" style="margin-top:20px">Tamam</button></div>';
  AT.sheet(o);
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
