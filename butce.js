/* G24 Zaman bütçesine sığan seans.
   Antrenman başlatırken isteğe bağlı süre (30 / 45 / 60 dk, S.butceDk; yok = sınırsız). Süre seçiliyse seans tahmini hesaplanır, sığmıyorsa
   YALNIZ bu seansın hareket listesi kırpılır (şablon/plan verisi değişmez, "sonraki güne borç" tutulmaz):
     tahmin = her hareket için çalışma seti × (ortalama set süresi + o hareketin dinlenmesi) + ısınma setleri × ISINMA_SN
   Kırpma sırası: (a) her hareketten en fazla 1 set (en az 2 kalır), (b) izolasyon/ikincil hareketler sona alınır, gerekirse çıkarılır
   (ana kası Dengeleyici'de "az" olanlar korunur), (c) dinlenme hiç kısaltılmaz (kişisel değer aynen sayılır).
   Kırpılan set/hareket seans notuna tek satır yazılır. Erken bitirme başarısızlık değildir: haftalık/denge yapılan setleri normal sayar.
   API: AT.butce = { tahmin, setSuresi, kirp, uygula, kart, gosterge, baslikHtml, secici } */
(function () {
  var AT = window.AT; if (!AT) return;
  /* Kişisel veri yetersizse varsayım: bir çalışma seti ~45 sn (kaldırış + yerleşme). */
  var VARSAYILAN_SET_SN = 45;
  /* Isınma seti ayrı sayılır: ~30 sn set + ~30 sn bekleme (ısınmada tam dinlenme yok). */
  var ISINMA_SN = 60;
  var ENAZ_SET = 2, ORNEK_ENAZ = 5;

  function sayim(e) {
    var w = 0, k = 0; (e.sets || []).forEach(function (s) { if (s.tip === 'isinma') w++; else k++; });
    return { w: w, k: k };
  }
  /* seans tahmini (saniye). o: { setSn, dinlenme(ad) -> sn } */
  function tahmin(exs, o) {
    o = o || {};
    var setSn = o.setSn > 0 ? o.setSn : VARSAYILAN_SET_SN, din = o.dinlenme || AT.dinlenmeOf || function () { return 90; };
    return (exs || []).reduce(function (t, e) { var c = sayim(e); return t + c.k * (setSn + din(e.ad)) + c.w * ISINMA_SN; }, 0);
  }
  function medyan(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
  /* kişisel set süresi: aynı hareketin ardışık ✓ zaman damgaları (s.t) farkı = set + dinlenme; dinlenme çıkarılır, 10–180 sn arası net değerlerin medyanı.
     Dinlenmeyi atlayıp hızlı basılan (net <10) ve uzun ara verilen (>180) farklar alınmaz. 5'ten az örnek varsa varsayım (45 sn). */
  function setSuresi(seanslar, din) {
    din = din || AT.dinlenmeOf || function () { return 90; };
    var n = [];
    (seanslar || []).forEach(function (se) {
      if (!se || se.demo) return;
      (se.exs || []).forEach(function (e) {
        var ts = (e.sets || []).filter(function (s) { return s.done && s.tip !== 'isinma' && s.t > 1e9; }).map(function (s) { return s.t; }).sort(function (a, b) { return a - b; });
        for (var i = 1; i < ts.length; i++) { var net = (ts[i] - ts[i - 1]) / 1000 - din(e.ad); if (net >= 10 && net <= 180) n.push(net); }
      });
    });
    return n.length >= ORNEK_ENAZ ? Math.round(medyan(n)) : VARSAYILAN_SET_SN;
  }
  function kopya(exs) { return (exs || []).map(function (e) { return Object.assign({}, e, { sets: (e.sets || []).map(function (s) { return Object.assign({}, s); }) }); }); }
  function sonCalisma(e) { for (var i = e.sets.length - 1; i >= 0; i--) if (e.sets[i].tip !== 'isinma') return i; return -1; }
  /* kırpma: girdiyi DEĞİŞTİRMEZ. o: { setSn, dinlenme, izolasyon(ad), koru(e) }. Dönen: { exs, kSet, kHar, sn, sigdi } */
  function kirp(exs, dk, o) {
    o = o || {};
    var izo = o.izolasyon || function (ad) { return AT.dinlenmeTipi ? AT.dinlenmeTipi(ad) === 75 : false; }, koru = o.koru || function () { return false; };
    var cikti = kopya(exs), butce = dk * 60, r = { exs: cikti, kSet: 0, kHar: 0, sn: 0, sigdi: true };
    var sig = function () { return tahmin(cikti, { setSn: o.setSn, dinlenme: o.dinlenme }) <= butce; };
    if (!(dk > 0) || sig()) { r.sn = tahmin(cikti, o); return r; }
    /* (a) her hareketten en fazla 1 çalışma seti, sondan başa; en az ENAZ_SET kalır */
    for (var i = cikti.length - 1; i >= 0 && !sig(); i--) {
      var e = cikti[i];
      if (sayim(e).k > ENAZ_SET) { e.sets.splice(sonCalisma(e), 1); r.kSet++; }
    }
    /* (b) izolasyon hareketleri sona al (göreli sıra korunur), sondan çıkar; ana kası "az" olanlar korunur */
    if (!sig()) {
      var ana = cikti.filter(function (e) { return !izo(e.ad); }), yan = cikti.filter(function (e) { return izo(e.ad); });
      cikti = r.exs = ana.concat(yan);
      for (var j = cikti.length - 1; j >= ana.length && !sig(); j--) {
        if (koru(cikti[j])) continue;
        cikti.splice(j, 1); r.kHar++;
      }
    }
    r.sigdi = sig(); r.sn = tahmin(cikti, o);
    return r;
  }
  function koruFn() {
    var d = AT.denge, S = AT.S, m = {};
    if (d && d.say && S) { try { m = d.say(AT.bitenSeanslar(), AT.iso(new Date())); } catch (x) { m = {}; } }
    return function (e) { return !!(d && d.etiket) && d.etiket(m[e.kas || AT.kasOf(e.ad)] || 0) === 'az'; };
  }
  function secenek() { return { setSn: setSuresi(AT.bitenSeanslar()), dinlenme: AT.dinlenmeOf, koru: koruFn() }; }
  function dk() { var d = AT.S && AT.S.butceDk; return d > 0 ? +d : 0; }
  /* antrenman başlarken: süre seçiliyse kırpılmış hareketler + seans notu satırı (yoksa null) */
  function uygula(exs) {
    var b = dk(); if (!b) return null;
    var r = kirp(exs, b, secenek()), p = [];
    if (r.kSet) p.push(r.kSet + ' set'); if (r.kHar) p.push(r.kHar + ' hareket');
    return { exs: r.exs, meta: { dk: b }, not: p.length ? b + ' dk bütçesi: ' + p.join(', ') + ' kırpıldı' : '' };
  }
  /* Bugün > Sıradaki: yalnız metin ("~45 dk") — seçili süreye göre kırpılmış planın tahmini */
  function kart(se, pl) {
    var b = dk(); if (!b || !pl || !pl.exs) return '';
    var exs = pl.exs.map(function (pe) {
      var e = se.hazir ? pe : ((se.exs || []).filter(function (x) { return x.ad === pe.ad; })[0] || pe), ts = AT.tumSetler(e).slice(0, 10), n = ts.length || 3;
      return { ad: e.ad, kas: e.kas || AT.kasOf(e.ad), sets: Array.apply(null, Array(n)).map(function (_, i) { return ts[i] && ts[i].tip ? { tip: ts[i].tip } : {}; }) };
    });
    var r = kirp(exs, b, secenek());
    return '~' + Math.max(1, Math.round(r.sn / 60)) + ' dk';
  }
  /* aktif antrenman başlığı: "~28 dk · 3/5 hareket" ya da süre dolunca "süre doldu · 3/5 hareket" (nötr, kırmızı yok) */
  function gosterge(a, simdi) {
    if (!a || !a.butce || !(a.butce.dk > 0) || !a.exs || !a.exs.length) return '';
    var bit = a.exs.filter(function (e) { return e.sets.length && e.sets.every(function (s) { return s.done; }); }).length, hr = bit + '/' + a.exs.length + ' hareket';
    if ((simdi || Date.now()) - a.start >= a.butce.dk * 60000) return 'süre doldu · ' + hr;
    var kalan = a.exs.map(function (e) { return { ad: e.ad, sets: e.sets.filter(function (s) { return !s.done; }) }; });
    var sn = tahmin(kalan, secenek());
    return (sn > 0 ? '~' + Math.max(1, Math.round(sn / 60)) + ' dk' : 'tamam') + ' · ' + hr;
  }
  function baslikHtml(a) { var g = gosterge(a); return g ? ' · <span id="butce-g">' + AT.h(g) + '</span>' : ''; }
  function secici() {
    var b = dk();
    return '<div class="butce-sec" role="group" aria-label="Süre"><span class="butce-et">Süre</span>' + [30, 45, 60, 0].map(function (v) {
      return '<button type="button" class="mini btn-ghost" data-act="butce-sec" data-dk="' + v + '" aria-pressed="' + (b === v) + '">' + (v ? v + ' dk' : 'sınırsız') + '</button>';
    }).join('') + '</div>';
  }
  AT.islem['butce-sec'] = function (d) {
    var v = +d.dk || 0; if (v) AT.S.butceDk = v; else delete AT.S.butceDk;
    AT.kaydet();
    Array.prototype.forEach.call(document.querySelectorAll('[data-act=butce-sec]'), function (b) { b.setAttribute('aria-pressed', String((+b.dataset.dk || 0) === v)); });
    AT.render();
  };
  setInterval(function () {
    var g = document.getElementById('butce-g'); if (g && AT.S && AT.S.active) g.textContent = gosterge(AT.S.active);
  }, 30000);
  AT.butce = { tahmin: tahmin, setSuresi: setSuresi, kirp: kirp, uygula: uygula, kart: kart, gosterge: gosterge, baslikHtml: baslikHtml, secici: secici, VARSAYILAN_SET_SN: VARSAYILAN_SET_SN };
})();
