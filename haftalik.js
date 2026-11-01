/* haftalik.js: modül (window.AT'ye kayıt olur). Haftalık özet ("hafta hikâyesi").
   Yeni haftada ilk açılışta bir kez geçen haftanın özeti açılır (o hafta en az bir antrenman ya da tartı varsa);
   Geçmiş'teki düğmeyle istenen hafta (‹ ›). Görünüm: tam ekran dikey kart dizisi (telefonda tam ekran, geniş ekranda
   ortada telefon oranında çerçeve). Üstte kart sayısı kadar ilerleme çizgisi; sağa dokun ileri, sola geri, basılı tut
   durakla; her kart ~5 sn'de kendiliğinden ilerler (hareket azaltmada yalnız dokunma), klavyede ← →, Esc kapatır.
   Kartlar (verisi olmayan atlanır): kapak (antrenman sayısı) · toplam (önceki haftaya göre) · rekorlar · kilo · kaslar · kapanış.
   Hesaplar yalnız mevcut AT.* fonksiyonlarından; S.haftaGoruldu = son gösterilen hafta başı (mantık değişmedi). */
(function (AT) {
'use strict';

function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function aralik(bas) { return AT.tarih(bas, 1) + ' – ' + AT.tarih(gunEkle(bas, 6), 1); }
function isaret(n, d) { return (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + AT.fmt(Math.abs(n), d); }
function kasi(e) { return e.kas || (AT.kasOf ? AT.kasOf(e.ad) : 'Diğer'); }

/* bas: Pazartesi (YYYY-MM-DD). Saf hesap: S ve prHesapla haritası verilir */
function hesap(S, bas, pr) {
  var son = gunEkle(bas, 6), ic = function (d) { return d >= bas && d <= son; };
  var se = AT.bitenSeanslar().filter(function (s) { return ic(s.date); });
  var set = 0, hacim = 0, rekor = [], rd = {}, kas = {};
  se.forEach(function (s) {
    s.exs.forEach(function (e) { var n = AT.yapilanSetler(e).length; set += n; if (n) { var k = kasi(e); kas[k] = (kas[k] || 0) + n; } });
    hacim += AT.seansHacim(s);
    var p = pr[s.id] || {};
    Object.keys(p).forEach(function (ad) {
      if (rekor.indexOf(ad) < 0) rekor.push(ad);
      /* hikâye için: hareket başına eski → yeni (tahmini max öncelikli; hafta içinde birden çok rekor: ilk eski, en büyük yeni) */
      var t = p[ad].filter(function (x) { return x.ad === 'Tahmini max'; })[0] || p[ad][0], r = rd[ad];
      if (!r || (r.tur !== 'Tahmini max' && t.ad === 'Tahmini max')) rd[ad] = { ad: ad, tur: t.ad, eski: t.yeni - t.fark, yeni: t.yeni };
      else if (r.tur === t.ad && t.yeni > r.yeni) r.yeni = t.yeni;
    });
  });
  var o = { bas: bas, seans: se.length, set: set, hacim: hacim, rekor: rekor, kilo: null, kcal: null, takviye: null,
    rekorD: rekor.map(function (ad) { return rd[ad]; }), kas: kas };
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

/* seri ve "her zamanki": haftalık antrenman sayıları. seri = bas'ta biten, en az 1 antrenmanlı ardışık hafta;
   olagan = önceki 8 haftanın (antrenmanlı olanların) medyanı; yoksa null */
function seriHesap(bas) {
  var say = {};
  AT.bitenSeanslar().forEach(function (s) { var w = AT.haftaBasi(s.date); say[w] = (say[w] || 0) + 1; });
  var seri = 0, w = bas; while (say[w]) { seri++; w = gunEkle(w, -7); }
  var l = []; for (var i = 1; i <= 8; i++) { var n = say[gunEkle(bas, -7 * i)]; if (n) l.push(n); }
  l.sort(function (a, b) { return a - b; });
  return { seri: seri, olagan: l.length >= 2 ? l[Math.floor((l.length - 1) / 2)] : null };
}
/* bu hafta hiç çalışılmayan büyük kas grupları (önceki 4 haftada çalışılmışsa) */
var IZLENEN = ['Göğüs', 'Sırt', 'Bacak', 'Omuz'];
function ihmal(bas, kas) {
  var on = {}, ilk = gunEkle(bas, -28);
  AT.bitenSeanslar().forEach(function (s) { if (s.date >= ilk && s.date < bas) s.exs.forEach(function (e) { if (AT.yapilanSetler(e).length) on[kasi(e)] = 1; }); });
  return IZLENEN.filter(function (k) { return on[k] && !kas[k]; });
}

/* ---------- kartlar ---------- */
var YILDIZ = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"/></svg>';
function say(n, d) { var y = AT.fmt(n, d || 0); return '<b class="hk-dev' + (y.length >= 5 ? ' uzun' : '') + '" data-say="' + n + '" data-d="' + (d || 0) + '">' + y + '</b>'; }

function kiloCizgi(S, bas) {
  var B = AT.bulkHesap; if (!B) return '';
  var a = gunEkle(bas, -1), son = gunEkle(bas, 6);
  var tr = B.trendSeri(B.gecerli(S.bw)).filter(function (p) { return p.date >= a && p.date <= son; });
  if (tr.length < 2) return '';
  var W = 280, H = 84, P = 8, x0 = AT.parse(a);
  var ys = tr.map(function (p) { return p.kg; }).concat(tr.filter(function (p) { return p.ham != null; }).map(function (p) { return p.ham; }));
  var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), ar = Math.max(mx - mn, 0.6), orta = (mx + mn) / 2;
  function X(d) { return P + (AT.parse(d) - x0) / 864e5 / 7 * (W - 2 * P); }
  function Y(v) { return H / 2 - (v - orta) / ar * (H - 2 * P); }
  var yol = tr.map(function (p, i) { return (i ? 'L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(p.kg).toFixed(1); }).join('');
  var nok = tr.filter(function (p) { return p.ham != null && p.date >= bas; }).map(function (p) { return '<circle class="ham" cx="' + X(p.date).toFixed(1) + '" cy="' + Y(p.ham).toFixed(1) + '" r="2.6"/>'; }).join('');
  var s = tr[tr.length - 1];
  return '<svg class="hk-cizgi" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path pathLength="100" d="' + yol + '"/>' + nok +
    '<circle class="son" cx="' + X(s.date).toFixed(1) + '" cy="' + Y(s.kg).toFixed(1) + '" r="4.5"/></svg>';
}

function kartlar(S, v, on, bas) {
  var buHafta = AT.haftaBasi(AT.iso(new Date())), etiket = bas === buHafta ? 'Bu hafta' : bas === gunEkle(buHafta, -7) ? 'Geçen hafta' : aralik(bas);
  var l = [];
  /* (a) kapak */
  var gunSet = {}, bugunS = AT.iso(new Date());
  AT.bitenSeanslar().forEach(function (s) { gunSet[s.date] = 1; });
  l.push({ tur: 'kapak', duyuru: etiket + ': ' + v.seans + ' antrenman.', html:
    '<p class="hk-etiket">' + AT.h(etiket) + '</p>' + say(v.seans) + '<p class="hk-alt">' + (v.seans ? 'antrenman' : 'antrenman yok') + '</p>' +
    '<div class="hk-gunler">' + ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(function (g, i) {
      var k = gunEkle(bas, i); return '<span class="' + (gunSet[k] ? 'on' : '') + (k > bugunS ? ' ileri' : '') + '"><i></i>' + g + '</span>'; }).join('') + '</div>' });
  /* (b) toplam */
  if (v.hacim > 0) {
    var ton = v.hacim >= 10000, b = '', yz = null;
    if (on.hacim > 0) {
      var y = Math.round((v.hacim - on.hacim) / on.hacim * 100);
      /* yalnız artış büyük yazılır (düşüş moral bozmasın; çubuklar farkı yine gösterir); önceki hafta en az 2 antrenman
         ve fark ≤%150: tek antrenmanlı haftaya göre '%562' gibi anlamsız sayı çıkmasın */
      if (on.seans >= 2 && y >= 1 && y <= 150) yz = y;
      var mx = Math.max(v.hacim, on.hacim);
      b = '<div class="hk-kiyas">' +
        '<div><span>' + (bas === buHafta ? 'Bu hafta' : bas === gunEkle(buHafta, -7) ? 'Geçen hafta' : 'O hafta') + '</span><i style="--w:' + (v.hacim / mx * 100).toFixed(1) + '%"></i></div>' +
        '<div class="once"><span>Önceki</span><i style="--w:' + (on.hacim / mx * 100).toFixed(1) + '%"></i></div></div>';
    }
    l.push({ tur: 'ton', duyuru: 'Toplam ' + (ton ? AT.fmt(v.hacim / 1000, 1) + ' ton' : AT.fmt(Math.round(v.hacim), 0) + ' kilo') + (yz != null ? ', önceki haftadan yüzde ' + yz + ' fazla' : '') + '.', html:
      '<p class="hk-etiket">Toplam kaldırdığın</p>' + (ton ? say(Math.round(v.hacim / 100) / 10, 1) : say(Math.round(v.hacim))) +
      '<p class="hk-alt">' + (ton ? 'ton' : 'kg') + ' · ' + AT.fmt(v.set, 0) + ' set</p>' +
      (yz != null ? '<p class="hk-fark">+%' + yz + ' <small>önceki haftadan fazla</small></p>' : '') + b });
  }
  /* (c) rekorlar */
  if (v.rekorD.length) {
    var r = v.rekorD.slice().sort(function (a, b) { return (b.yeni - b.eski) / b.eski - (a.yeni - a.eski) / a.eski; });
    l.push({ tur: 'rekor', duyuru: v.rekorD.length + ' rekor: ' + r.slice(0, 3).map(function (x) { return x.ad; }).join(', ') + '.', html:
      '<p class="hk-etiket">' + (v.rekorD.length === 1 ? 'Rekor' : v.rekorD.length + ' rekor') + '</p>' +
      '<ul class="hk-rekor">' + r.slice(0, 3).map(function (x) {
        var d = x.tur === 'En ağır' ? 2 : 1;
        return '<li>' + YILDIZ + '<b>' + AT.h(x.ad) + '</b><span><s>' + AT.fmt(x.eski, d) + '</s> → <strong>' + AT.fmt(x.yeni, d) + '</strong> kg</span><small>' + (x.tur === 'En ağır' ? 'en ağır' : 'tahmini max') + '</small></li>';
      }).join('') + '</ul>' + (r.length > 3 ? '<p class="hk-not">+' + (r.length - 3) + ' rekor daha</p>' : '') });
  }
  /* (d) kilo */
  if (v.kilo != null) {
    var B = AT.bulkHesap, son = gunEkle(bas, 6), ay = null;
    if (B && B.hizAyrinti) ay = B.hizAyrinti(B.gecerli(S.bw).filter(function (x) { return x.date <= son; }));
    var hiz = ay && ay.gun >= 14 ? ay.hiz : null;
    l.push({ tur: 'kilo', duyuru: 'Ortalama kilo bu hafta ' + isaret(v.kilo, 1) + ' kilo' + (hiz != null ? ', haftalık hız ' + isaret(hiz, 2) : '') + '.', html:
      '<p class="hk-etiket">Ortalama kilo</p><b class="hk-dev kucuk">' + isaret(v.kilo, 1) + '<small>kg</small></b>' +
      '<p class="hk-alt">bu hafta</p>' + kiloCizgi(S, bas) +
      (hiz != null || v.kcal ? '<dl class="hk-mini">' + (hiz != null ? '<div><dt>Hız</dt><dd>' + isaret(hiz, 2) + ' kg/hafta</dd></div>' : '') +
        (v.kcal ? '<div><dt>Ortalama</dt><dd>' + AT.fmt(Math.round(v.kcal.ort / 10) * 10, 0) + ' kcal <small>' + v.kcal.gun + ' gün</small></dd></div>' : '') + '</dl>' : '') });
  }
  /* (e) kaslar */
  var kl = Object.keys(v.kas).sort(function (a, b) { return v.kas[b] - v.kas[a]; });
  if (kl.length) {
    var ih = ihmal(bas, v.kas), mk = v.kas[kl[0]];
    l.push({ tur: 'kas', duyuru: 'En çok ' + kl[0] + ', ' + v.kas[kl[0]] + ' set.' + (ih.length ? ' Bu hafta yok: ' + ih.join(', ') + '.' : ''), html:
      '<p class="hk-etiket">En çok çalışılan</p><b class="hk-dev kelime">' + AT.h(kl[0]) + '</b><p class="hk-alt">' + v.kas[kl[0]] + ' set</p>' +
      '<ul class="hk-kas">' + kl.slice(0, 6).map(function (k, i) {
        return '<li' + (i ? '' : ' class="ilk"') + '><span>' + AT.h(k) + '</span><i style="--w:' + (v.kas[k] / mk * 100).toFixed(1) + '%"></i><b>' + v.kas[k] + '</b></li>'; }).join('') + '</ul>' +
      (ih.length ? '<p class="hk-ihmal">Bu hafta yok: <b>' + ih.map(AT.h).join(', ') + '</b></p>' : '') });
  }
  /* (f) kapanış: tek kural tabanlı cümle */
  var sr = seriHesap(bas), cumle;
  var bas2 = bas === buHafta ? 'Bu hafta' : bas === gunEkle(buHafta, -7) ? 'Geçen hafta' : 'O hafta';
  if (!v.seans) cumle = bas === buHafta ? 'Hafta daha bitmedi. İlk antrenman bir dokunuş uzakta.' : bas2 + ' ara verdin. Yeni hafta, temiz sayfa.';
  else if (sr.olagan && v.seans >= sr.olagan) cumle = bas2 + ' ' + v.seans + '/' + sr.olagan + (sr.seri >= 2 ? ', seri ' + sr.seri + ' hafta.' : '.');
  else if (sr.olagan) cumle = bas2 + (bas === buHafta ? ' şimdilik ' : ' ') + v.seans + '/' + sr.olagan + '.' + (sr.seri >= 2 ? ' Seri ' + sr.seri + ' hafta' + (bas === buHafta ? '.' : ', sürüyor.') : '');
  else cumle = bas2 + ' ' + v.seans + ' antrenman.' + (sr.seri >= 2 ? ' Seri ' + sr.seri + ' hafta.' : ' Seri başladı.');
  var ek = [];
  if (v.set) ek.push([AT.fmt(v.set, 0), 'set']);
  if (v.rekor.length) ek.push([v.rekor.length, 'rekor']);
  if (v.takviye != null) ek.push([v.takviye + '/7', 'takviye tam']);
  l.push({ tur: 'son', duyuru: cumle, html:
    '<p class="hk-etiket">' + (bas === buHafta ? 'Hafta sürüyor' : 'Hafta kapandı') + '</p><p class="hk-cumle">' + AT.h(cumle) + '</p>' +
    (ek.length ? '<dl class="hk-mini satir">' + ek.map(function (x) { return '<div><dd>' + x[0] + '</dd><dt>' + x[1] + '</dt></div>'; }).join('') + '</dl>' : '') +
    '<div class="hk-son-dugme"><button class="btn-ghost" data-act="hafta-git" data-d="-7">&lsaquo; Önceki hafta</button>' +
    '<button class="btn-ac btn-big" data-act="kapat">Kapat</button></div>' });
  return l;
}

/* ---------- hikâye oynatıcı ---------- */
var SURE = 5000, hk = null, gosterilen = null;
function azHareket() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

function ac(bas) {
  var S = AT.S, pr = AT.prHesapla(), v = hesap(S, bas, pr), on = hesap(S, gunEkle(bas, -7), pr);
  var buHafta = AT.haftaBasi(AT.iso(new Date())), l = kartlar(S, v, on, bas);
  gosterilen = bas;
  var o = '<div class="hikaye" data-kart="' + l[0].tur + '">' +
    '<div class="hk-cubuk" aria-hidden="true">' + l.map(function () { return '<span><i></i></span>'; }).join('') + '</div>' +
    '<div class="hk-ust"><button class="hk-hafta" data-act="hafta-git" data-d="-7" aria-label="Önceki hafta">&lsaquo;</button>' +
    '<span class="hk-tarih">' + AT.h(aralik(bas)) + '</span><button class="hk-hafta" data-act="hafta-git" data-d="7" aria-label="Sonraki hafta"' + (bas >= buHafta ? ' disabled' : '') + '>&rsaquo;</button></div>' +
    '<div class="hk-sahne">' + l.map(function (k, i) { return '<section class="hk-kart k-' + k.tur + '" aria-roledescription="kart" aria-label="' + (i + 1) + ' / ' + l.length + '"' + (i ? ' hidden' : '') + '>' + k.html + '</section>'; }).join('') +
    '<button type="button" class="hk-dokun geri" aria-label="Önceki kart"></button><button type="button" class="hk-dokun ileri" aria-label="Sonraki kart"></button></div></div>';
  AT.sheet(o);
  var kok = document.querySelector('#sheet .hikaye'); if (!kok) return;
  var dlg = kok.parentNode; dlg.setAttribute('aria-label', 'Haftalık özet, ' + aralik(bas)); dlg.classList.add('hk-in');
  if (hk && hk.raf) cancelAnimationFrame(hk.raf);
  hk = { kok: kok, l: l, i: 0, t: 0, son: 0, dur: false, basildi: 0, uzun: false, oto: !azHareket(), raf: 0 };
  baglan(kok);
  git(0);
  hk.raf = requestAnimationFrame(dongu);
}

function git(i) {
  if (!hk) return;
  var n = hk.l.length; i = Math.max(0, Math.min(n - 1, i));
  hk.i = i; hk.t = 0;
  var kart = hk.kok.querySelectorAll('.hk-kart');
  Array.prototype.forEach.call(kart, function (k, j) { k.hidden = j !== i; k.classList.toggle('on', j === i); });
  hk.kok.dataset.kart = hk.l[i].tur;
  cubuk();
  AT.duyur((i + 1) + '/' + n + '. ' + hk.l[i].duyuru);
  saydir(kart[i]);
}
function cubuk() {
  var s = hk.kok.querySelectorAll('.hk-cubuk i');
  Array.prototype.forEach.call(s, function (x, j) {
    var k = j < hk.i ? 1 : j > hk.i ? 0 : (hk.oto ? Math.min(1, hk.t / SURE) : 1);
    x.style.transform = 'scaleX(' + k.toFixed(4) + ')';
  });
}
function dongu(ts) {
  if (!hk || !hk.kok.isConnected) { hk = null; return; }
  var dt = hk.son ? Math.min(100, ts - hk.son) : 0; hk.son = ts;   /* sekme arkadayken birikmesin */
  if (hk.oto && !hk.dur && hk.i < hk.l.length - 1) {
    hk.t += dt;
    if (hk.t >= SURE) git(hk.i + 1); else cubuk();
  }
  hk.raf = requestAnimationFrame(dongu);
}
/* dokunma: sol %32 geri, kalan ileri; 350 ms'den uzun basış = durakla (bırakınca sürer, gezinme yok) */
function baglan(kok) {
  var sahne = kok.querySelector('.hk-sahne');
  sahne.addEventListener('pointerdown', function (ev) {
    if (!hk || ev.target.closest('[data-act]')) return;
    hk.dur = true; hk.basildi = Date.now(); hk.uzun = false; kok.classList.add('durdu');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
    sahne.addEventListener(t, function () {
      if (!hk || !hk.dur) return;
      hk.uzun = Date.now() - hk.basildi > 350; hk.dur = false; kok.classList.remove('durdu');
    });
  });
  Array.prototype.forEach.call(kok.querySelectorAll('.hk-dokun'), function (b) {
    b.addEventListener('click', function (ev) {
      if (!hk) return;
      if (ev.detail && hk.uzun) { hk.uzun = false; return; }
      git(hk.i + (b.classList.contains('geri') ? -1 : 1));
    });
  });
}
document.addEventListener('keydown', function (ev) {
  if (!hk || !hk.kok.isConnected || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'ArrowRight') { ev.preventDefault(); git(hk.i + 1); }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); git(hk.i - 1); }
});

/* büyük rakam 0'dan değerine (~0,7 sn; hareket azaltmada hemen) */
function saydir(kart) {
  var el = kart && kart.querySelectorAll('[data-say]');
  if (!el || !el.length || azHareket()) return;
  var t0 = null;
  function adim(t) {
    if (t0 == null) t0 = t;
    var k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
    Array.prototype.forEach.call(el, function (b) { b.textContent = AT.fmt(+b.dataset.say * e, +b.dataset.d); });
    if (k < 1 && kart.isConnected) requestAnimationFrame(adim);
  }
  requestAnimationFrame(adim);
}

function sonTamHafta() { return gunEkle(AT.haftaBasi(AT.iso(new Date())), -7); }

AT.haftalikOzet = function (bas) { ac(bas || sonTamHafta()); };
AT.islem['hafta-ozet'] = function () { ac(sonTamHafta()); };
AT.islem['hafta-git'] = function (d) {
  var y = gunEkle(gosterilen || sonTamHafta(), +d.d), bu = AT.haftaBasi(AT.iso(new Date()));
  if (y > bu) return;
  ac(y);
  /* klavyeyle gezerken odak aynı düğmede kalsın */
  var b = document.querySelector('#sheet .hk-ust [data-act="hafta-git"][data-d="' + d.d + '"]');
  if (b && !b.disabled) b.focus({ preventScroll: true });
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

/* test için (git/durum: ekran görüntüsünde belirli kart) */
AT._haftalik = { hesap: hesap, sonTamHafta: sonTamHafta, seriHesap: seriHesap,
  git: function (i) { if (hk) { hk.oto = false; git(i); } }, durum: function () { return hk ? { i: hk.i, n: hk.l.length, tur: hk.l[hk.i].tur, oto: hk.oto } : null; } };
})(window.AT);
