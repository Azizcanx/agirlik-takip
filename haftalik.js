/* haftalik.js: modül (window.AT'ye kayıt olur). Haftalık özet ("hafta hikâyesi").
   Yeni haftada ilk açılışta bir kez geçen haftanın özeti açılır (o hafta en az bir antrenman ya da tartı varsa);
   Geçmiş'teki düğmeyle istenen hafta (‹ ›). Görünüm: tam ekran dikey kart dizisi (telefonda tam ekran, geniş ekranda
   ortada telefon oranında çerçeve). Üstte kart sayısı kadar ilerleme çizgisi; sağa dokun ileri, sola geri, basılı tut
   durakla; her kart ~5 sn'de kendiliğinden ilerler (hareket azaltmada yalnız dokunma), klavyede ← →, Esc kapatır.
   Kartlar (verisi olmayan atlanır): kapak (antrenman sayısı) · toplam (önceki haftaya göre) · rekorlar · kilo · kaslar · kapanış.
   Hesaplar yalnız mevcut AT.* fonksiyonlarından; S.haftaGoruldu = son gösterilen hafta başı (mantık değişmedi).
   Aynı oynatıcıyla yıl hikâyesi (dosyanın sonunda): 15 Aralık–31 Ocak'ta bir kez, S.yilGoruldu; AT.yilOzet(yil). */
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
      if (!r || (r.tur !== 'Tahmini max' && t.ad === 'Tahmini max')) rd[ad] = { ad: ad, tur: t.ad, eski: t.yeni - t.fark, yeni: t.yeni, va: t.va ? 1 : undefined };
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
        /* vücut ağırlığı (prHesapla va): tekrar rekoru, birim tekrar, ondalık yok */
        var d = x.va ? 0 : x.tur === 'En ağır' ? 2 : 1;
        return '<li>' + YILDIZ + '<b>' + AT.h(x.ad) + '</b><span><s>' + AT.fmt(x.eski, d) + '</s> → <strong>' + AT.fmt(x.yeni, d) + '</strong> ' + (x.va ? 'tekrar' : 'kg') + '</span><small>' + (x.va ? 'en çok tekrar' : x.tur === 'En ağır' ? 'en ağır' : 'tahmini max') + '</small></li>';
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
  oynat(l, '<div class="hk-ust"><button class="hk-hafta" data-act="hafta-git" data-d="-7" aria-label="Önceki hafta">&lsaquo;</button>' +
    '<span class="hk-tarih">' + AT.h(aralik(bas)) + '</span><button class="hk-hafta" data-act="hafta-git" data-d="7" aria-label="Sonraki hafta"' + (bas >= buHafta ? ' disabled' : '') + '>&rsaquo;</button></div>',
    'Haftalık özet, ' + aralik(bas));
}
/* ortak oynatıcı (hafta ve yıl hikâyesi): l = [{tur, duyuru, html, ac?(kartEl)}], ust = üst satır HTML'i, ad = pencerenin erişilebilir adı */
var DURDUR_IKON = '<svg class="dur" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6v12M15.5 6v12"/></svg><svg class="oyna" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4L18 12z"/></svg>';
function oynat(l, ust, ad, sinif) {
  /* hafta değiştirirken (‹ ›) duraklatma / otomatik ilerleme durumu sürer */
  var oto = hk && hk.kok && hk.kok.isConnected ? hk.oto : !azHareket();
  var o = '<div class="hikaye' + (sinif ? ' ' + sinif : '') + '" data-kart="' + l[0].tur + '">' +
    '<div class="hk-cubuk" aria-hidden="true">' + l.map(function () { return '<span><i></i></span>'; }).join('') + '</div>' +
    '<button type="button" class="hk-durdur" aria-label="Duraklat" aria-pressed="' + !oto + '">' + DURDUR_IKON + '</button>' + ust +
    '<div class="hk-sahne">' + l.map(function (k, i) { return '<section class="hk-kart k-' + k.tur + '" aria-roledescription="kart" aria-label="' + (i + 1) + ' / ' + l.length + '"' + (i ? ' hidden' : '') + '>' + k.html + '</section>'; }).join('') +
    '<button type="button" class="hk-dokun geri" aria-label="Önceki kart"></button><button type="button" class="hk-dokun ileri" aria-label="Sonraki kart"></button></div></div>';
  AT.sheet(o);
  var kok = document.querySelector('#sheet .hikaye'); if (!kok) return;
  var dlg = kok.parentNode; dlg.setAttribute('aria-label', ad); dlg.classList.add('hk-in');
  if (hk && hk.raf) cancelAnimationFrame(hk.raf);
  hk = { kok: kok, l: l, i: 0, t: 0, son: 0, dur: false, basildi: 0, uzun: false, oto: oto, raf: 0, bosluk: false };
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
  if (hk.l[i].ac) hk.l[i].ac(kart[i]);
}
function cubuk() {
  var s = hk.kok.querySelectorAll('.hk-cubuk i');
  Array.prototype.forEach.call(s, function (x, j) {
    var k = j < hk.i ? 1 : j > hk.i ? 0 : (hk.oto || hk.t > 0 ? Math.min(1, hk.t / SURE) : 1);   /* duraklatılınca çizgi olduğu yerde kalır */
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
      if (hk.bosluk) return;   /* odak bu düğmedeyken Boşluk: duraklat/devam, gezinme yok */
      if (ev.detail && hk.uzun) { hk.uzun = false; return; }
      git(hk.i + (b.classList.contains('geri') ? -1 : 1));
    });
  });
  var d = kok.querySelector('.hk-durdur');
  if (d) d.addEventListener('click', function () { duraklat(); });
}
/* duraklat / devam (düğme ve Boşluk). zorla: true = duraklat, false = devam, yok = değiştir. Hareket azaltmada başta durur; düğme oynatır */
function duraklat(zorla, sessiz) {
  if (!hk) return;
  var dur = zorla == null ? hk.oto : zorla;
  if (dur === !hk.oto) return;
  hk.oto = !dur; hk.son = 0;
  if (!dur && hk.i >= hk.l.length - 1) hk.t = 0;
  var b = hk.kok.querySelector('.hk-durdur'); if (b) b.setAttribute('aria-pressed', String(dur));
  cubuk();
  if (!sessiz) AT.duyur(dur ? 'Duraklatıldı' : 'Sürüyor');
}
/* ← → gezinir (otomatik ilerleme bu açılış için durur); Boşluk duraklatır / sürdürür (odak başka bir düğme ya da kutudaysa onun işi) */
function tus(ev) {
  if (!hk || !hk.kok.isConnected || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
    ev.preventDefault(); duraklat(true, true); git(hk.i + (ev.key === 'ArrowRight' ? 1 : -1));
  } else if (ev.key === ' ' || ev.key === 'Spacebar') {
    var h = ev.target && ev.target.closest ? ev.target.closest('button,input,textarea,select,a') : null;
    if (h && !h.classList.contains('hk-dokun')) return;   /* duraklat düğmesinin kendisi de: tıklaması değiştirir */
    ev.preventDefault();
    if (ev.repeat) return;
    hk.bosluk = true; duraklat();
  }
}
document.addEventListener('keydown', tus);
document.addEventListener('keyup', function (ev) { if (hk && (ev.key === ' ' || ev.key === 'Spacebar')) setTimeout(function () { if (hk) hk.bosluk = false; }, 0); });

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
/* ---------- yıl hikâyesi ----------
   15 Aralık–31 Ocak arasında ilk açılışta bir kez (Aralık'ta bu yıl, Ocak'ta geçen yıl); aynı aralıkta Geçmiş'te "2026 özeti" düğmesi.
   Görüldü: S.yilGoruldu = yıl (haftaGoruldu gibi cihaza özel; esitle VERI'de yok). AT.yilOzet(yil) her zaman açar (önizleme).
   Hesap yılın kayıtları üstünde tek geçiş: tahmini max AT.tahminiMax, rekor sayısı AT.prHesapla, kilo bulkHesap (ortalama kilo). */
var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
var AY_DAN = ["Ocak'tan", "Şubat'tan", "Mart'tan", "Nisan'dan", "Mayıs'tan", "Haziran'dan", "Temmuz'dan", "Ağustos'tan", "Eylül'den", "Ekim'den", "Kasım'dan", "Aralık'tan"];
var AY_HARF = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];
/* yılın bulunma eki: 2026'da, 2027'de (son okunan rakam) */
function yilDe(y) { var b = y % 10, o = Math.floor(y / 10) % 10; return y + "'" + (b ? ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'][b] : o ? ['', 'da', 'de', 'da', 'ta', 'de', 'ta', 'te', 'de', 'da'][o] : 'de'); }
/* bugün (YYYY-MM-DD) için özet yılı: 15–31 Aralık bu yıl, Ocak geçen yıl, başka zaman null */
function yilSec(bugun) { var y = +bugun.slice(0, 4), md = bugun.slice(5); return md >= '12-15' ? y : md <= '01-31' ? y - 1 : null; }
function ort(l) { return l.reduce(function (t, x) { return t + x; }, 0) / l.length; }

function yilHesap(S, yil, pr) {
  var a = yil + '-01-01', b = yil + '-12-31', ic = function (d) { return typeof d === 'string' && d >= a && d <= b; };
  var tm = AT.tahminiMax || AT.e1rm, kasOnb = {}, ex = {}, hf = {};
  var se = AT.bitenSeanslar().filter(function (s) { return ic(s.date); });
  var o = { yil: yil, seans: se.length, set: 0, hacim: 0, ay: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], aySeans: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hafta: 0, haftalar: hf, kas: {}, rekor: 0, artan: [], enCok: null, seri: null, kilo: null, bulk: null, defter: 0, takviye: null, ilk: null, son: null, gercek: false };
  se.forEach(function (s) {
    var m = +s.date.slice(5, 7) - 1, hv = AT.seansHacim(s);
    o.hacim += hv; o.ay[m] += hv; o.aySeans[m]++; hf[AT.haftaBasi(s.date)] = 1;
    if (!s.demo) o.gercek = true;
    var p = pr && pr[s.id]; if (p) o.rekor += Object.keys(p).length;
    s.exs.forEach(function (e) {
      var sets = AT.yapilanSetler(e), n = sets.length; if (!n) return;
      var k = e.kas || kasOnb[e.ad] || (kasOnb[e.ad] = kasi(e));
      o.set += n; o.kas[k] = (o.kas[k] || 0) + n;
      var x = ex[e.ad] || (ex[e.ad] = { ad: e.ad, seans: 0, set: 0, ilk: 0, en: 0, tIlk: 0, tEn: 0, tSeans: 0 }), mx = 0, mr = 0, va = true;
      x.seans++; x.set += n;
      sets.forEach(function (z) { var v = tm(AT.num(z.kg), AT.num(z.reps), z.rpe); if (v > mx) mx = v; if (AT.num(z.kg) !== 0) va = false; if (AT.num(z.reps) > mr) mr = AT.num(z.reps); });
      if (mx > 0) { if (!x.ilk) x.ilk = mx; if (mx > x.en) x.en = mx; }
      /* vücut ağırlığı (seansın bütün iş setleri 0 kg; prHesapla ile aynı tanım): tek sette en çok tekrar */
      if (va && mr > 0) { x.tSeans++; if (!x.tIlk) x.tIlk = mr; if (mr > x.tEn) x.tEn = mr; }
    });
  });
  var el = Object.keys(ex).map(function (k) { return ex[k]; });
  /* yılın rekorları: yıl içindeki ilk tahmini max → yılın en iyisi; en çok artan (kg) 3 hareket.
     Vücut ağırlığı hareketleri ilk → en çok tekrar (va: kg alanı tekrar farkı); ağırlıklı liste 3'ü doldurmuyorsa ya da
     tekrar artışı yüzdece 3.'den büyükse en iyi tekrar rekoru listeye girer */
  var srt = function (p, q) { return q.kg - p.kg || q.yuzde - p.yuzde; };
  o.artan = el.filter(function (x) { return x.seans >= 2 && x.ilk > 0 && x.en > x.ilk + 0.05; })
    .map(function (x) { return { ad: x.ad, ilk: x.ilk, en: x.en, kg: x.en - x.ilk, yuzde: (x.en - x.ilk) / x.ilk * 100 }; })
    .sort(srt).slice(0, 3);
  var tl = el.filter(function (x) { return x.tSeans >= 2 && x.tEn > x.tIlk && !o.artan.some(function (a) { return a.ad === x.ad; }); })
    .map(function (x) { return { ad: x.ad, ilk: x.tIlk, en: x.tEn, kg: x.tEn - x.tIlk, yuzde: (x.tEn - x.tIlk) / x.tIlk * 100, va: 1 }; })
    .sort(function (p, q) { return q.yuzde - p.yuzde || q.kg - p.kg; });
  while (tl.length && (o.artan.length < 3 || tl[0].yuzde > o.artan[2].yuzde)) { if (o.artan.length >= 3) o.artan.pop(); o.artan.push(tl.shift()); }
  el.forEach(function (x) { if (!o.enCok || x.seans > o.enCok.seans || (x.seans === o.enCok.seans && x.set > o.enCok.set)) o.enCok = x; });
  /* en uzun seri: üst üste antrenmanlı hafta */
  var cur = null;
  Object.keys(hf).sort().forEach(function (w) {
    if (cur && gunEkle(cur.son, 7) === w) { cur.n++; cur.son = w; } else cur = { n: 1, bas: w, son: w };
    if (!o.seri || cur.n > o.seri.n) o.seri = cur;
  });
  o.hafta = Object.keys(hf).length;
  if (se.length) { o.ilk = se[0].date; o.son = se[se.length - 1].date; }
  /* kilo: yılın ilk tartı haftasının ortalaması → yıl sonundaki ortalama kilo (regresyon/EMA, İlerleme ile aynı) */
  var B = AT.bulkHesap;
  if (B) {
    var tum = B.gecerli(S.bw), bw = tum.filter(function (x) { return ic(x.date); });
    if (bw.length) {
      if (!o.ilk || bw[0].date < o.ilk) o.ilk = bw[0].date;
      if (!o.son || bw[bw.length - 1].date > o.son) o.son = bw[bw.length - 1].date;
      if (bw.some(function (x) { return !x.demo; })) o.gercek = true;
    }
    var gun = {}; bw.forEach(function (x) { gun[x.date] = 1; });
    var gs = Object.keys(gun).length;
    if (gs >= 2) {
      var h1 = gunEkle(bw[0].date, 6), tr = B.trendSeri(bw), cz = B.cizgiSeri ? B.cizgiSeri(tr) : tr;
      var sk = B.ortalamaKilo ? B.ortalamaKilo(bw) : tr[tr.length - 1].kg;
      /* çizgi en çok ~90 nokta (yıllık günlük seri seyreltilir; son nokta hep kalır) */
      var adim = Math.max(1, Math.ceil(cz.length / 90)), sr = cz.filter(function (p, i) { return i % adim === 0 || i === cz.length - 1; });
      o.kilo = { ilk: ort(bw.filter(function (x) { return x.date <= h1; }).map(function (x) { return +x.kg; })), son: sk, gun: gs,
        bas: bw[0].date, bit: bw[bw.length - 1].date, seri: sr.map(function (p) { return { date: p.date, kg: p.kg }; }) };
    }
    var bk = S.bulk;
    if (bk && bk.bas && bk.bas <= b && isFinite(+bk.basKg)) {
      var bl = tum.filter(function (x) { return x.date >= bk.bas && x.date <= b; });
      if (bl.length) {
        var bs = B.ortalamaKilo ? B.ortalamaKilo(bl, bk.bas) : bl[bl.length - 1].kg;
        o.bulk = { bas: bk.bas, basKg: +bk.basKg, hedefKg: +bk.hedefKg, simdi: bs, yon: +bk.hedefKg < +bk.basKg ? -1 : 1 };
      }
    }
  }
  o.defter = (S.defter || []).filter(function (x) { return x && ic(x.d); }).length;
  var tk = S.takviye;
  if (tk && tk.liste && tk.liste.length && tk.alinan) {
    var tam = 0, herhangi = 0;
    Object.keys(tk.alinan).forEach(function (g) {
      var al = tk.alinan[g] || []; if (!ic(g) || !al.length) return;
      herhangi++; if (tk.liste.every(function (x) { return al.indexOf(x.id) >= 0; })) tam++;
    });
    if (herhangi) o.takviye = { tam: tam, gun: herhangi };
  }
  return o;
}
function yilVeriVar(v) { return !!(v && (v.seans || v.kilo)); }
/* açılışta: gösterilecek yıl ya da null (saf; S değişmez). Gerçek (örnek olmayan) kayıt yoksa sessiz */
function yilKontrol(S, bugun, pr) {
  var y = yilSec(bugun); if (y == null || !S || S.active || S.yilGoruldu === y) return null;
  var v = yilHesap(S, y, pr);
  return yilVeriVar(v) && v.gercek ? { yil: y, v: v } : null;
}

function yilCizgi(k) {
  var s = k.seri; if (s.length < 2) return '';
  var W = 280, H = 96, P = 8, x0 = AT.parse(s[0].date), gn = Math.max(1, (AT.parse(s[s.length - 1].date) - x0) / 864e5);
  var ys = s.map(function (p) { return p.kg; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), ar = Math.max(mx - mn, 0.8), orta = (mx + mn) / 2;
  function X(d) { return P + (AT.parse(d) - x0) / 864e5 / gn * (W - 2 * P); }
  function Y(v) { return H / 2 - (v - orta) / ar * (H - 2 * P); }
  var yol = s.map(function (p, i) { return (i ? 'L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(p.kg).toFixed(1); }).join(''), z = s[s.length - 1];
  return '<svg class="hk-cizgi" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path pathLength="100" d="' + yol + '"/>' +
    '<circle class="ham" cx="' + X(s[0].date).toFixed(1) + '" cy="' + Y(s[0].kg).toFixed(1) + '" r="3.5"/>' +
    '<circle class="son" cx="' + X(z.date).toFixed(1) + '" cy="' + Y(z.kg).toFixed(1) + '" r="4.5"/></svg>';
}
function tarihY(d, yil) { return AT.tarih(d, 1) + (+d.slice(0, 4) !== yil ? ' ' + d.slice(0, 4) : ''); }
/* yılın rekoru: ağırlıkta kg (1 ondalık), vücut ağırlığında tekrar (ondalıksız) */
function rkD(x) { return x.va ? 0 : 1; }
function rkBirim(x) { return x.va ? 'tekrar' : 'kg'; }
function rkArtis(x) { return '+' + AT.fmt(x.kg, rkD(x)) + ' ' + rkBirim(x); }
/* ton: 1000 tondan sonra ondalık yok (1.440 ton; '1.440,2' kalabalık) */
function tonD(kg) { return kg >= 1e6 ? 0 : 1; }
function tonYaz(kg) { return kg >= 10000 ? AT.fmt(kg / 1000, tonD(kg)) + ' ton' : AT.fmt(Math.round(kg), 0) + ' kg'; }

/* kapanış: tek kural tabanlı cümle (ilk tutan); sayı ile "kg" aynı satırda kalır */
function yilCumle(v, bitti) { return yilCumle0(v, bitti).replace(/(\d) (kg|tekrar)/g, '$1 $2'); }
function yilCumle0(v, bitti) {
  var son = v.yil + 1, k = v.kilo, a = v.artan[0];
  if (!v.seans) return 'Tartı defteri tuttun. ' + yilDe(son) + ' sıra ağırlıkta.';
  if (v.bulk && k && a && (k.son - k.ilk) * v.bulk.yon > 0.5)
    return 'Ortalama kilo ' + isaret(k.son - k.ilk, 1) + ' kg, ' + a.ad + ' ' + rkArtis(a) + ': sezon işliyor.';
  if (v.seri && v.seri.n >= 8) return v.seri.n + ' hafta üst üste salondaydın. ' + yilDe(son) + ' bu seriyi geç.';
  if (a && a.yuzde >= 10) return 'En büyük adım ' + a.ad + ': ' + rkArtis(a) + '. ' + (bitti ? (a.va ? 'Yeni yıl, yeni tekrar.' : 'Yeni yıl, yeni max.') : 'Yıl bitmeden bir tane daha?');
  return v.seans + ' antrenman, ' + AT.fmt(v.set, 0) + ' set. ' + (bitti ? 'Defter dolu, sayfa yeni.' : 'Yılın son haftaları da sayılır.');
}

function yilKartlar(v) {
  var l = [], yil = v.yil, bugun = AT.iso(new Date()), bitti = bugun > yil + '-12-31';
  var ilkAy = v.ilk ? +v.ilk.slice(5, 7) - 1 : 0, kismi = ilkAy > 0, beri = kismi ? AY_DAN[ilkAy] + ' beri' : '';
  var sonAy = bitti ? 11 : bugun.slice(0, 4) === String(yil) ? +bugun.slice(5, 7) - 1 : 11;
  /* (a) kapak: yıl + antrenman sayısı + 12 ay */
  var kapakAlt = v.seans ? 'antrenman · ' + v.hafta + ' haftada' : 'gün tartı';
  l.push({ tur: 'kapak', duyuru: yil + (kismi ? ', ' + beri : '') + ': ' + (v.seans ? v.seans + ' antrenman, ' + v.hafta + ' haftada.' : v.kilo.gun + ' gün tartı.'), html:
    '<p class="hk-etiket">' + yil + ' yılın' + (kismi ? ' · ' + AT.h(beri) : '') + '</p>' + say(v.seans || v.kilo.gun) + '<p class="hk-alt">' + kapakAlt + '</p>' +
    '<div class="hk-gunler yil-aylar">' + AY_HARF.map(function (g, i) {
      return '<span class="' + (v.aySeans[i] ? 'on' : '') + (i > sonAy ? ' ileri' : '') + '" title="' + AYLAR[i] + '"><i></i>' + g + '</span>'; }).join('') + '</div>' });
  /* (b) toplam + en yüklü ay (aylık sütunlar: ilk kayıtlı aydan son aya) */
  if (v.hacim > 0) {
    var ton = v.hacim >= 10000, enAy = 0, ilkA = 11, sonA = 0;
    v.ay.forEach(function (x, i) { if (x > v.ay[enAy]) enAy = i; if (x > 0) { ilkA = Math.min(ilkA, i); sonA = Math.max(sonA, i); } });
    ilkA = Math.min(ilkA, ilkAy); sonA = Math.max(sonA, Math.min(sonAy, 11));
    var mx = v.ay[enAy], sut = '';
    if (sonA > ilkA) {
      sut = '<div class="yil-sutun" aria-hidden="true">';
      for (var i = ilkA; i <= sonA; i++) sut += '<span class="' + (i === enAy ? 'en' : '') + '"><i style="--h:' + (v.ay[i] / mx * 100).toFixed(1) + '%"></i>' + AY_HARF[i] + '</span>';
      sut += '</div>';
    }
    l.push({ tur: 'ton', duyuru: 'Toplam ' + tonYaz(v.hacim) + ', ' + AT.fmt(v.set, 0) + ' set. En yüklü ay ' + AYLAR[enAy] + ', ' + tonYaz(mx) + '.', html:
      '<p class="hk-etiket">Toplam kaldırdığın</p>' + (ton ? (tonD(v.hacim) ? say(Math.round(v.hacim / 100) / 10, 1) : say(Math.round(v.hacim / 1000))) : say(Math.round(v.hacim))) +
      '<p class="hk-alt">' + (ton ? 'ton' : 'kg') + ' · ' + AT.fmt(v.set, 0) + ' set</p>' + sut +
      '<p class="yil-satir">En yüklü ay <b>' + AYLAR[enAy] + '</b> · ' + tonYaz(mx) + '</p>' });
  }
  /* (c) yılın rekorları */
  if (v.artan.length) {
    l.push({ tur: 'rekor', duyuru: 'Yılın rekorları: ' + v.artan.map(function (x) { return x.ad + ' artı ' + AT.fmt(x.kg, rkD(x)) + (x.va ? ' tekrar' : ' kilo'); }).join(', ') + '.', html:
      '<p class="hk-etiket">Yılın rekorları</p>' +
      '<ul class="hk-rekor">' + v.artan.map(function (x) {
        return '<li>' + YILDIZ + '<b>' + AT.h(x.ad) + '</b><span><s>' + AT.fmt(x.ilk, rkD(x)) + '</s> → <strong>' + AT.fmt(x.en, rkD(x)) + '</strong> ' + rkBirim(x) + '</span>' +
          '<small>' + rkArtis(x) + ' · %' + AT.fmt(Math.round(x.yuzde), 0) + ' · ' + (x.va ? 'en çok tekrar' : 'tahmini max') + '</small></li>';
      }).join('') + '</ul>' + (v.rekor ? '<p class="hk-not">' + (kismi ? AY_DAN[ilkAy] + ' beri ' : 'Yıl boyunca ') + v.rekor + ' rekor</p>' : '') });
  }
  /* (d) kilo yolculuğu */
  if (v.kilo) {
    var k = v.kilo, fark = k.son - k.ilk, bu = v.bulk, bl = '';
    if (bu) {
      var sezon = bu.yon < 0 ? 'Cut sezonu' : 'Bulk sezonu';
      bl = '<div><dt>' + sezon + '</dt><dd>' + AT.fmt(bu.basKg, 1) + ' → ' + AT.fmt(bu.simdi, 1) + ' kg <small>hedef ' + AT.fmt(bu.hedefKg, 1) + ' · ' + AT.h(tarihY(bu.bas, yil)) + '</small></dd></div>';
    }
    l.push({ tur: 'kilo', duyuru: 'Ortalama kilo ' + AT.fmt(k.ilk, 1) + ' kilodan ' + AT.fmt(k.son, 1) + ' kiloya, ' + isaret(fark, 1) + '.' + (bu ? ' ' + (bu.yon < 0 ? 'Cut' : 'Bulk') + ' sezonu ' + AT.fmt(bu.basKg, 1) + ' kilodan ' + AT.fmt(bu.simdi, 1) + ' kiloya.' : ''), html:
      '<p class="hk-etiket">Kilo yolculuğu</p><b class="hk-dev kucuk">' + isaret(fark, 1) + '<small>kg</small></b>' +
      '<p class="hk-alt">' + AT.fmt(k.ilk, 1) + ' → ' + AT.fmt(k.son, 1) + ' kg</p>' + yilCizgi(k) +
      '<dl class="hk-mini">' + bl + '<div><dt>Tartı</dt><dd>' + k.gun + ' gün <small>' + AT.h(AT.tarih(k.bas, 1) + ' – ' + AT.tarih(k.bit, 1)) + '</small></dd></div></dl>' });
  }
  /* (e) en çok yapılan hareket + kaslar */
  var kl = Object.keys(v.kas).sort(function (p, q) { return v.kas[q] - v.kas[p]; });
  if (v.enCok) {
    var e = v.enCok, mk = v.kas[kl[0]];
    l.push({ tur: 'hareket', duyuru: 'En çok yapılan ' + e.ad + ', ' + e.seans + ' antrenmanda. En çok çalışılan kas ' + kl[0] + ', ' + AT.fmt(mk, 0) + ' set.', html:
      '<p class="hk-etiket">En çok yapılan</p><b class="hk-dev kelime' + (e.ad.length > 14 ? ' uzun-ad' : '') + '">' + AT.h(e.ad) + '</b>' +
      '<p class="hk-alt">' + e.seans + ' antrenmanda · ' + AT.fmt(e.set, 0) + ' set</p>' +
      '<p class="yil-satir">En çok çalışılan kas <b>' + AT.h(kl[0]) + '</b></p>' +
      '<ul class="hk-kas">' + kl.slice(0, 5).map(function (q, i) {
        return '<li' + (i ? '' : ' class="ilk"') + '><span>' + AT.h(q) + '</span><i style="--w:' + (v.kas[q] / mk * 100).toFixed(1) + '%"></i><b>' + AT.fmt(v.kas[q], 0) + '</b></li>'; }).join('') + '</ul>' });
  }
  /* (f) en uzun seri + yılın haftaları */
  if (v.seri && v.seri.n >= 2) {
    var sr = v.seri, hft = '', hn = 0, w = AT.haftaBasi(yil + '-01-01'), son = yil + '-12-31';
    for (; w <= son; w = gunEkle(w, 7), hn++)
      hft += '<i class="' + (v.haftalar[w] ? (w >= sr.bas && w <= sr.son ? 'seri' : 'on') : '') + (w > bugun ? ' ileri' : '') + '"></i>';
    /* gösterilen aralık yılın içinde kalır (ilk hafta 29 Aralık'ta başlasa da "1 Oca") */
    var sb = sr.bas < yil + '-01-01' ? yil + '-01-01' : sr.bas, ss = gunEkle(sr.son, 6); if (ss > son) ss = son;
    l.push({ tur: 'seri', duyuru: 'En uzun seri ' + sr.n + ' hafta üst üste, ' + AT.tarih(sb, 1) + ' ile ' + AT.tarih(ss, 1) + ' arası.', html:
      '<p class="hk-etiket">En uzun seri</p>' + say(sr.n) + '<p class="hk-alt">hafta üst üste</p>' +
      '<p class="yil-satir">' + AT.h(AT.tarih(sb, 1) + ' – ' + AT.tarih(ss, 1)) + '</p>' +
      '<div class="yil-hafta" style="--k:' + (hn > 52 ? 18 : 13) + '" aria-hidden="true">' + hft + '</div>' +
      '<p class="hk-not">Antrenmanlı hafta: ' + v.hafta + '</p>' });
  }
  /* (g) defter + takviye (tek satır) */
  if (v.defter || v.takviye) {
    var tkS = v.takviye ? 'Takviye: <b>' + v.takviye.tam + ' gün</b> tam' + (v.takviye.gun > v.takviye.tam ? ', ' + v.takviye.gun + ' gün en az biri' : '') : '';
    l.push({ tur: 'defter', duyuru: (v.defter ? 'Deftere ' + v.defter + ' not.' : '') + (v.takviye ? ' Takviye ' + v.takviye.tam + ' gün tam.' : ''), html: v.defter
      ? '<p class="hk-etiket">Defterin</p>' + say(v.defter) + '<p class="hk-alt">not yazdın</p>' + (tkS ? '<p class="yil-satir">' + tkS + '</p>' : '')
      : '<p class="hk-etiket">Takviye düzeni</p>' + say(v.takviye.tam) + '<p class="hk-alt">gün tam</p>' + (v.takviye.gun > v.takviye.tam ? '<p class="yil-satir">' + v.takviye.gun + ' gün en az biri</p>' : '') });
  }
  /* (h) kapanış + paylaşılabilir kart */
  var cumle = yilCumle(v, bitti), ek = [];
  if (v.seans) ek.push([v.seans, 'antrenman']);
  if (v.hacim >= 10000) ek.push([AT.fmt(v.hacim / 1000, tonD(v.hacim)), 'ton']); else if (v.set) ek.push([AT.fmt(v.set, 0), 'set']);
  if (v.rekor) ek.push([v.rekor, 'rekor']);
  var paylas = AT.pngKart && AT.pngKart.paylasilir();
  l.push({ tur: 'son', duyuru: cumle, ac: function () { yilKartHazirla(v, cumle); }, html:
    '<p class="hk-etiket">' + yil + (bitti ? ' kapandı' : ' kapanıyor') + '</p><p class="hk-cumle">' + AT.h(cumle) + '</p>' +
    (ek.length ? '<dl class="hk-mini satir">' + ek.map(function (x) { return '<div><dd>' + x[0] + '</dd><dt>' + x[1] + '</dt></div>'; }).join('') + '</dl>' : '') +
    '<div class="hk-son-dugme">' + (AT.pngKart ? '<button class="btn-ac btn-big" data-act="yil-paylas">' + (paylas ? 'Kartı paylaş' : 'Kartı indir') + '</button>' : '') +
    '<button class="btn-ghost' + (AT.pngKart ? '' : ' btn-ac btn-big') + '" data-act="kapat">Kapat</button></div>' });
  return l;
}

/* ---------- yılın kartı (PNG, 1080×1920, koyu kimlik; ekstra.js AT.pngKart ile paylaş/indir) ---------- */
var yilBlob = null, yilBlobYil = null;
/* kapanış kartına gelince hazırlanır (çizim ~100 ms: kartın giriş hareketi bitince); tıklamada blob hazır, paylaşım kullanıcı hareketini kaybetmez */
function yilKartHazirla(v, cumle, hemen) {
  if (yilBlobYil === v.yil) return;
  yilBlobYil = v.yil; yilBlob = null;
  setTimeout(function () {
    try { yilKartCiz(v, cumle).toBlob(function (b) { if (yilBlobYil === v.yil) yilBlob = b; }); } catch (e) { yilBlobYil = null; }
  }, hemen ? 0 : 650);
}
function yilKartCiz(v, cumle) {
  var W = 1080, H = 1920, P = 96, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var c = cv.getContext('2d'), F = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  var SF = '"Iowan Old Style","Palatino Linotype",Palatino,Charter,ui-serif,Georgia,serif';
  /* koyu tema paleti (style.css :root[data-theme=koyu]) + hikâye tonları */
  var BG = '#111215', S1 = '#191a1e', LN = '#2a2d32', TX = '#e6e2da', MUT = '#a3a099', DIM = '#8a8882', AC = '#9db6e6', ALT = '#d9b46e';
  var rr = AT.pngKart && AT.pngKart.rr;
  function yaz(t, x, y, boy, agir, renk, hiza, serif, maxW) {
    c.font = (agir || 400) + ' ' + boy + 'px ' + (serif ? SF : F); c.fillStyle = renk || TX; c.textAlign = hiza || 'left';
    if (maxW) { while (t.length > 3 && c.measureText(t).width > maxW) t = t.slice(0, -2).trim() + '…'; }
    c.fillText(t, x, y); return c.measureText(t).width;
  }
  function sar(t, boy, maxW) {   /* kelime kaydırma: satır listesi */
    c.font = '600 ' + boy + 'px ' + SF; var out = [], s = '';
    t.split(' ').forEach(function (k) { var d = s ? s + ' ' + k : k; if (s && c.measureText(d).width > maxW) { out.push(s); s = k; } else s = d; });
    if (s) out.push(s); return out;
  }
  c.fillStyle = BG; c.fillRect(0, 0, W, H);
  var g = c.createRadialGradient(W * 0.92, -60, 0, W * 0.92, -60, 1150); g.addColorStop(0, 'rgba(61,107,209,.34)'); g.addColorStop(1, 'rgba(61,107,209,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  var g2 = c.createRadialGradient(-80, H + 40, 0, -80, H + 40, 900); g2.addColorStop(0, 'rgba(200,149,44,.14)'); g2.addColorStop(1, 'rgba(200,149,44,0)');
  c.fillStyle = g2; c.fillRect(0, 0, W, H);
  var ilkAy = v.ilk ? +v.ilk.slice(5, 7) - 1 : 0, y = P + 36;
  yaz('AĞIRLIK TAKİP', P, y, 30, 700, AC);
  yaz(ilkAy > 0 ? AY_DAN[ilkAy] + ' beri' : 'yılın özeti', W - P, y, 32, 500, MUT, 'right');
  y += 290; yaz(String(v.yil), P - 10, y, 300, 600, TX, 'left', true);
  y += 76; yaz(v.seans ? v.seans + ' antrenman · ' + v.hafta + ' haftada' : (v.kilo ? v.kilo.gun : 0) + ' gün tartı', P, y, 46, 500, MUT);
  /* üç sayı */
  var sx = [], cw = (W - 2 * P) / 3;
  if (v.hacim > 0) sx.push([v.hacim >= 10000 ? AT.fmt(v.hacim / 1000, tonD(v.hacim)) : AT.fmt(Math.round(v.hacim), 0), v.hacim >= 10000 ? 'ton' : 'kg toplam']);
  if (v.set) sx.push([AT.fmt(v.set, 0), 'set']);
  if (v.seri && v.seri.n >= 2) sx.push([String(v.seri.n), 'hafta seri']); else if (v.rekor) sx.push([String(v.rekor), 'rekor']);
  if (sx.length) {
    y += 70; c.fillStyle = LN; c.fillRect(P, y, W - 2 * P, 2);
    /* üç sayı aynı boyda; en geniş olan sütuna sığmazsa hepsi küçülür (5 yılda "2.689", "1.440") */
    var boy = 96; c.font = '600 96px ' + SF;
    sx.forEach(function (k) { var w = c.measureText(k[0]).width; if (w > cw - 28) boy = Math.min(boy, Math.floor(96 * (cw - 28) / w)); });
    y += 128; sx.forEach(function (k, i) { yaz(k[0], P + i * cw, y, boy, 600, TX, 'left', true); yaz(k[1], P + i * cw, y + 52, 34, 400, MUT); });
    y += 52;
  }
  /* kilo paneli */
  if (v.kilo && rr) {
    var k = v.kilo, py = y + 60, ph = 330;
    c.fillStyle = S1; rr(c, P, py, W - 2 * P, ph, 36); c.fill(); c.strokeStyle = LN; c.lineWidth = 2; c.stroke();
    yaz('Ortalama kilo', P + 44, py + 72, 34, 500, MUT);
    yaz(isaret(k.son - k.ilk, 1) + ' kg', P + 44, py + 168, 92, 600, TX, 'left', true);
    yaz(AT.fmt(k.ilk, 1) + ' → ' + AT.fmt(k.son, 1) + ' kg', W - P - 44, py + 72, 34, 500, MUT, 'right');
    var s = k.seri;
    if (s.length > 1) {
      var mn = Math.min.apply(0, s.map(function (p) { return p.kg; })), mx = Math.max.apply(0, s.map(function (p) { return p.kg; }));
      if (mx - mn < 0.8) { var o2 = (mx + mn) / 2; mn = o2 - 0.4; mx = o2 + 0.4; }
      var ix = P + 44, iy = py + 200, iw = W - 2 * P - 88, ih = 96;
      var X = function (i) { return ix + i / (s.length - 1) * iw; }, Y = function (kg) { return iy + (1 - (kg - mn) / (mx - mn)) * ih; };
      c.beginPath(); s.forEach(function (p, i) { if (i) c.lineTo(X(i), Y(p.kg)); else c.moveTo(X(i), Y(p.kg)); });
      c.strokeStyle = AC; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
      c.beginPath(); c.arc(X(s.length - 1), Y(s[s.length - 1].kg), 12, 0, 7); c.fillStyle = S1; c.fill(); c.lineWidth = 6; c.strokeStyle = AC; c.stroke();
    }
    y = py + ph;
  }
  /* rekorlar: sığdığı kadar (kapanış cümlesine yer kalsın) */
  var cs = sar(cumle, 58, W - 2 * P).slice(0, 3), cy = H - P - 120 - (cs.length - 1) * 70;
  if (v.artan.length && y + 200 < cy - 60) {
    y += 104; yaz('Yılın rekorları', P, y, 40, 600, TX, 'left', true); y += 12;
    v.artan.forEach(function (x) {
      if (y + 140 > cy - 70) return;
      y += 74; var aw = yaz(rkArtis(x), W - P, y, 48, 650, ALT, 'right', true);
      yaz(x.ad, P, y, 42, 500, TX, 'left', false, W - 2 * P - aw - 40);
      y += 46; yaz(AT.fmt(x.ilk, rkD(x)) + ' → ' + AT.fmt(x.en, rkD(x)) + ' ' + rkBirim(x) + ' · %' + AT.fmt(Math.round(x.yuzde), 0) + ' · ' + (x.va ? 'en çok tekrar' : 'tahmini max'), P, y, 32, 400, MUT);
      y += 28; c.fillStyle = LN; c.fillRect(P, y, W - 2 * P, 2);
    });
  }
  cs.forEach(function (t, i) { yaz(t, P, cy + i * 70, 58, 600, TX, 'left', true); });
  yaz(String(v.yil), P, H - P - 6, 32, 500, DIM);
  yaz('Ağırlık Takip', W - P, H - P - 6, 32, 600, AC, 'right');
  return cv;
}

var yilGosterilen = null;
function yilAc(yil, v) {
  v = v || yilHesap(AT.S, yil, AT.prHesapla());
  if (!yilVeriVar(v)) { AT.toast(yil + ' için kayıt yok'); return false; }
  yilBlob = null; yilBlobYil = null;   /* her açılışta güncel veriyle yeniden çizilir */
  yilGosterilen = v;
  oynat(yilKartlar(v), '<div class="hk-ust yil-ust"><span class="hk-tarih">' + yil + ' özeti</span></div>', yil + ' özeti', 'yil');
  return true;
}
AT.yilOzet = function (yil) { var t = AT.iso(new Date()); return yilAc(+yil || yilSec(t) || +t.slice(0, 4)); };
AT.islem['yil-ozet'] = function () { AT.yilOzet(); };
AT.islem['yil-paylas'] = function () {
  var v = yilGosterilen; if (!v || !AT.pngKart) return;
  if (!yilBlob || yilBlobYil !== v.yil) { yilKartHazirla(v, yilCumle(v, AT.iso(new Date()) > v.yil + '-12-31'), true); return AT.toast('Hazırlanıyor, tekrar dene'); }
  AT.pngKart.paylas(yilBlob, 'agirlik-takip-' + v.yil + '.png', v.yil + ' özeti');
};

/* Geçmiş ekranındaki düğmeler: haftalık özet; 15 Aralık–31 Ocak arasında (o yılın kaydı varsa) yıl özeti */
AT.bolum.haftalikDugme = function () {
  var o = '<button class="btn-ghost mini hafta-dugme" data-act="hafta-ozet">Haftalık özet</button>', y = yilSec(AT.iso(new Date())), S = AT.S;
  if (y != null && S && (S.sessions.some(function (s) { return s.date.slice(0, 4) === String(y); }) || (S.bw || []).some(function (b) { return String(b.date).slice(0, 4) === String(y); })))
    o += ' <button class="btn-ghost mini hafta-dugme" data-act="yil-ozet">' + y + ' özeti</button>';
  return o;
};

/* yeni haftada ilk açılış: geçen haftada kayıt varsa bir kez göster. 15 Aralık–31 Ocak'ta önce yıl özeti (bir kez; o gün hafta özeti sonraki açılışa kalır) */
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    var S = AT.S, bas = sonTamHafta(); if (!S || S.active) return;
    var sh = AT.$('#sheet'); if (sh && !sh.hidden) return;
    var yk = yilKontrol(S, AT.iso(new Date()), AT.prHesapla());
    if (yk) { S.yilGoruldu = yk.yil; AT.kaydet(); yilAc(yk.yil, yk.v); return; }
    if (S.haftaGoruldu === bas) return;
    var v = hesap(S, bas, AT.prHesapla()), ilk = S.haftaGoruldu == null;
    S.haftaGoruldu = bas; AT.kaydet();
    if (ilk && !S.sessions.some(function (s) { return !s.demo; })) return;   /* hiç gerçek kaydı yoksa sessiz */
    if (v.seans || v.kilo != null) ac(bas);
  }, 700);
});

/* test için (git/durum: ekran görüntüsünde belirli kart) */
AT._haftalik = { hesap: hesap, kartlar: kartlar, sonTamHafta: sonTamHafta, seriHesap: seriHesap, yilSec: yilSec, yilHesap: yilHesap, yilKontrol: yilKontrol, yilKartlar: yilKartlar, yilCumle: yilCumle, yilKartCiz: yilKartCiz,
  git: function (i) { if (hk) { duraklat(true, true); git(i); } }, durum: function () { return hk ? { i: hk.i, n: hk.l.length, tur: hk.l[hk.i].tur, oto: hk.oto } : null; },
  tus: tus, duraklat: duraklat, _kur: function (h) { hk = h; } };
})(window.AT);
