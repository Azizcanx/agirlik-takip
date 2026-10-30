/* haftalik.js: modül (window.AT'ye kayıt olur). Haftalık özet ("hafta karnesi").
   Yeni haftada ilk açılışta bir kez geçen haftanın özeti açılır (o hafta en az bir antrenman ya da tartı varsa);
   Geçmiş'teki düğmeyle istenen hafta (‹ ›). Yalnız sonuç: antrenman, set, toplam, ortalama kilo değişimi,
   ortalama kalori, takviye düzeni, rekorlar; önceki haftaya göre toplam farkı. S.haftaGoruldu = son gösterilen hafta başı. */
(function (AT) {
'use strict';

function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function aralik(bas) { return AT.tarih(bas, 1) + ' – ' + AT.tarih(gunEkle(bas, 6), 1); }

/* bas: Pazartesi (YYYY-MM-DD). Saf hesap: S ve prHesapla haritası verilir */
function hesap(S, bas, pr) {
  var son = gunEkle(bas, 6), ic = function (d) { return d >= bas && d <= son; };
  var se = AT.bitenSeanslar().filter(function (s) { return ic(s.date); });
  var set = 0, hacim = 0, rekor = [];
  se.forEach(function (s) {
    s.exs.forEach(function (e) { set += AT.yapilanSetler(e).length; });
    hacim += AT.seansHacim(s);
    Object.keys(pr[s.id] || {}).forEach(function (ad) { if (rekor.indexOf(ad) < 0) rekor.push(ad); });
  });
  var o = { bas: bas, seans: se.length, set: set, hacim: hacim, rekor: rekor, kilo: null, kcal: null, takviye: null };
  /* ortalama kilo (trend) değişimi: haftanın son günü − önceki haftanın son günü */
  var B = AT.bulkHesap;
  if (B) {
    var tr = B.trendSeri(B.gecerli(S.bw)), m = {}; tr.forEach(function (p) { m[p.date] = p.kg; });
    var a = m[gunEkle(bas, -1)], b = m[son];
    if (a == null || b == null) { /* aralık dışına taşan tartılar: haftadaki ilk/son trend değeri */
      var w = tr.filter(function (p) { return ic(p.date); });
      if (w.length >= 2) { a = a == null ? w[0].kg : a; b = w[w.length - 1].kg; }
    }
    if (a != null && b != null) o.kilo = b - a;
    var k = B.kcalGecerli(S.kcal).filter(function (x) { return ic(x.date); });
    if (k.length) o.kcal = { ort: k.reduce(function (t, x) { return t + +x.kcal; }, 0) / k.length, gun: k.length };
  }
  var tk = S.takviye;
  if (tk && tk.liste && tk.liste.length) {
    var tam = 0; for (var i = 0; i < 7; i++) { var g = gunEkle(bas, i), al = tk.alinan[g] || []; if (tk.liste.every(function (x) { return al.indexOf(x.id) >= 0; })) tam++; }
    o.takviye = tam;
  }
  return o;
}

var gosterilen = null;
function ac(bas) {
  var S = AT.S, pr = AT.prHesapla(), v = hesap(S, bas, pr), on = hesap(S, gunEkle(bas, -7), pr);
  var buHafta = AT.haftaBasi(AT.iso(new Date())), ton = v.hacim >= 10000;
  gosterilen = bas;
  var o = '<div class="ozet-son hafta"><div class="ayb"><button data-act="hafta-git" data-d="-7" aria-label="Önceki hafta">&lsaquo;</button>' +
    '<b>' + AT.h(aralik(bas)) + '</b><button data-act="hafta-git" data-d="7" aria-label="Sonraki hafta"' + (bas >= buHafta ? ' disabled' : '') + '>&rsaquo;</button></div>' +
    '<h3>' + (bas === buHafta ? 'Bu hafta' : bas === gunEkle(buHafta, -7) ? 'Geçen hafta' : 'Haftalık özet') + '</h3>';
  o += '<div class="ozet ozet-buyuk"><div><b>' + v.seans + '</b><span>antrenman</span></div>' +
    '<div><b>' + (ton ? AT.fmt(v.hacim / 1000, 1) : AT.fmt(Math.round(v.hacim), 0)) + '</b><span>' + (ton ? 'ton' : 'kg') + ' toplam</span></div>' +
    '<div><b>' + (v.kilo == null ? '–' : (v.kilo > 0.04 ? '+' : v.kilo < -0.04 ? '−' : '') + AT.fmt(Math.abs(v.kilo), 1)) + '</b><span>kg kilo farkı</span></div></div>';
  if (on.hacim > 0 && v.hacim > 0) {
    var y = Math.round((v.hacim - on.hacim) / on.hacim * 100);
    if (y >= 1) o += '<p class="durum iyi">Önceki haftadan %' + y + ' fazla kaldırdın</p>';
  }
  var kv = [];
  kv.push(['Set', AT.fmt(v.set, 0)]);
  if (v.kcal) kv.push(['Ortalama kalori', AT.fmt(Math.round(v.kcal.ort / 10) * 10, 0) + ' kcal<small>' + v.kcal.gun + ' gün</small>']);
  if (v.takviye != null) kv.push(['Takviyeler tam', v.takviye + '/7 gün']);
  o += '<dl class="kv">' + kv.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>';
  if (v.rekor.length) o += '<h2>' + (v.rekor.length === 1 ? 'Rekor' : v.rekor.length + ' rekor') + '</h2><ul class="ozet-rekor">' +
    v.rekor.slice(0, 6).map(function (ad) { return '<li><b>' + AT.h(ad) + '</b></li>'; }).join('') + '</ul>';
  o += '<button class="btn-ac btn-big" data-act="kapat" style="margin-top:20px">Tamam</button></div>';
  AT.sheet(o);
}
function sonTamHafta() { return gunEkle(AT.haftaBasi(AT.iso(new Date())), -7); }

AT.haftalikOzet = function (bas) { ac(bas || sonTamHafta()); };
AT.islem['hafta-ozet'] = function () { ac(sonTamHafta()); };
AT.islem['hafta-git'] = function (d) {
  var y = gunEkle(gosterilen || sonTamHafta(), +d.d), bu = AT.haftaBasi(AT.iso(new Date()));
  if (y <= bu) ac(y);
};
/* Geçmiş ekranındaki düğme */
AT.bolum.haftalikDugme = function () { return '<button class="btn-ghost mini hafta-dugme" data-act="hafta-ozet">Haftalık özet</button>'; };

/* yeni haftada ilk açılış: geçen haftada kayıt varsa bir kez göster */
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    var S = AT.S, bas = sonTamHafta(); if (!S || S.active) return;
    var sh = AT.$('#sheet'); if (sh && !sh.hidden) return;
    if (S.haftaGoruldu === bas) return;
    var v = hesap(S, bas, AT.prHesapla()), ilk = S.haftaGoruldu == null;
    S.haftaGoruldu = bas; AT.kaydet();
    if (ilk && !S.sessions.some(function (s) { return !s.demo; })) return;   /* hiç gerçek kaydı yoksa sessiz */
    if (v.seans || v.kilo != null) ac(bas);
  }, 700);
});

AT._haftalik = { hesap: hesap, sonTamHafta: sonTamHafta };   /* test için */
})(window.AT);
