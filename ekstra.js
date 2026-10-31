/* ekstra.js: plaka hesaplayıcı + ısınma setleri, sezon kartı (paylaşılabilir PNG) */
(function (AT) {
'use strict';

/* ---------- plaka ---------- */
var PLAKA = [25, 20, 15, 10, 5, 2.5, 1.25];
var PRENK = { 25: '#c9736c', 20: '#6f8fbf', 15: '#d4b768', 10: '#7aab88', 5: '#e4e2dc', 2.5: '#8f949b', 1.25: '#bfc2c6' };
var PBOY = { 25: 140, 20: 132, 15: 116, 10: 98, 5: 74, 2.5: 58, 1.25: 48 };
var PEN = { 25: 22, 20: 20, 15: 18, 10: 15, 5: 11, 2.5: 9, 1.25: 7 };
var PLAKASIZ = /dumbbell|cable|pulldown|pushdown|pull-up|push-up|chin-up|dips|crunch|raise|fly|plank/i;
var pd = { e: 0, kg: 0, bar: 20 };

function yuv(x) { return Math.round(x * 100) / 100; }
/* bir taraf için plakalar (büyükten küçüğe); kalan > 0 ise tam tutmuyor */
function plakalar(kg, bar) {
  var yan = yuv((kg - bar) / 2), r = [];
  if (yan < 0) return { yan: r, kalan: yan };
  PLAKA.forEach(function (p) { while (yan + 1e-9 >= p) { r.push(p); yan = yuv(yan - p); } });
  return { yan: r, kalan: yan };
}
function isinma(kg, bar) {
  var l = []; if (!(kg >= bar + 20)) return l;
  if (bar > 0) l.push({ kg: bar, r: 10 });
  [[0.4, 5], [0.6, 3], [0.8, 2]].forEach(function (x) {
    var k = Math.max(bar, Math.round(kg * x[0] / 2.5) * 2.5);
    if ((!l.length || k > l[l.length - 1].kg) && k < kg) l.push({ kg: k, r: x[1] });
  });
  return l;
}
function plakaYazi(kg, bar) {
  var p = plakalar(kg, bar);
  if (p.kalan < 0) return 'Bardan hafif';
  return p.yan.length ? p.yan.map(function (x) { return AT.fmt(x, 2); }).join(' + ') : 'Plaka yok';
}
function plakaSvg(yan, bar) {
  var W = 360, H = 160, x = 40, s = '<svg class="plaka-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bir taraftaki plakalar">';
  s += '<rect x="0" y="' + (H / 2 - 5) + '" width="' + W + '" height="10" rx="3" fill="#b4b7bc"/>';
  if (bar > 0) s += '<rect x="' + (x - 12) + '" y="' + (H / 2 - 14) + '" width="10" height="28" rx="2" fill="#9a9ea4"/>';
  yan.forEach(function (p) {
    var w = PEN[p], hh = PBOY[p];
    s += '<rect x="' + x + '" y="' + ((H - hh) / 2) + '" width="' + w + '" height="' + hh + '" rx="3" fill="' + PRENK[p] + '" stroke="rgba(0,0,0,.12)"/>';
    x += w + 3;
  });
  return s + '</svg>';
}
function egzKg(ex) {
  var s = ex.sets.filter(function (x) { return !x.done && AT.num(x.kg) > 0; })[0] || ex.sets.filter(function (x) { return AT.num(x.kg) > 0; }).pop();
  if (s) return AT.num(s.kg);
  var l = AT.bitenSeanslar();
  for (var i = l.length - 1; i >= 0; i--) {
    var e = l[i].exs.filter(function (x) { return x.ad === ex.ad; })[0];
    if (e) { var y = AT.yapilanSetler(e); if (y.length) return Math.max.apply(0, y.map(function (z) { return AT.num(z.kg); })); }
  }
  return 60;
}
function plakaSheet() {
  var ex = AT.S.active && AT.S.active.exs[pd.e]; if (!ex) return AT.kapat();
  var p = plakalar(pd.kg, pd.bar), o = '<h3>Plaka · ' + AT.h(ex.ad) + '</h3>';
  o += '<div class="row"><button data-act="plaka-d" data-d="-2.5" aria-label="2,5 kg azalt">−2,5</button><div class="grow hero" style="text-align:center"><b>' + AT.fmt(pd.kg, 2) + ' kg</b></div><button data-act="plaka-d" data-d="2.5" aria-label="2,5 kg artır">+2,5</button></div>';
  o += '<div class="chips" style="margin:12px 0">' + [[20, 'Bar 20'], [15, 'Bar 15'], [10, 'Bar 10'], [0, 'Makine']].map(function (b) {
    return '<button class="chip" data-act="plaka-bar" data-v="' + b[0] + '" aria-pressed="' + (pd.bar === b[0]) + '">' + b[1] + '</button>';
  }).join('') + '</div>';
  if (p.kalan < 0) o += '<p class="durum uyari">' + AT.fmt(pd.kg, 2) + ' kg bardan hafif.</p>';
  else {
    o += plakaSvg(p.yan, pd.bar);
    o += '<p class="durum ' + (p.kalan > 0 ? 'uyari' : 'iyi') + '">Her tarafa: <b>' + AT.h(plakaYazi(pd.kg, pd.bar)) + '</b>' +
      (p.kalan > 0 ? ' · tam tutmuyor, ' + AT.fmt(yuv(pd.bar + 2 * p.yan.reduce(function (t, x) { return t + x; }, 0)), 2) + ' kg olur' : '') + '</p>';
  }
  var is = isinma(pd.kg, pd.bar);
  if (is.length) {
    o += '<h2>Isınma</h2><dl class="kv">' + is.map(function (x) {
      return '<div><dt>' + AT.fmt(x.kg, 2) + ' kg × ' + x.r + '</dt><dd>' + AT.h(x.kg === pd.bar ? 'boş bar' : plakaYazi(x.kg, pd.bar)) + '</dd></div>';
    }).join('') + '</dl>';
  }
  o += '<button class="btn-ac btn-big" data-act="plaka-yaz" style="margin-top:14px">Boş setlere ' + AT.fmt(pd.kg, 2) + ' kg yaz</button>';
  o += '<button class="btn-ghost btn-big" data-act="kapat" style="margin-top:8px">Kapat</button>';
  AT.sheet(o);
}

AT.bolum.plakaDugme = function (ei) {
  var ex = AT.S.active && AT.S.active.exs[ei];
  if (!ex) return '';
  var t = (window.HAREKETLER || []).filter(function (x) { return x.ad === ex.ad; })[0];
  if (t ? !(t.ekipman === 'Barbell' || (t.ekipman === 'Makine' && /press|hack|squat/i.test(ex.ad))) : PLAKASIZ.test(ex.ad)) return '';
  return '<button class="mini btn-ghost" data-act="plaka" data-e="' + ei + '">Plaka</button>';
};
AT.islem.plaka = function (d) {
  var ex = AT.S.active.exs[+d.e]; pd.e = +d.e; pd.kg = egzKg(ex);
  pd.bar = /leg press|hack|makine|machine/i.test(ex.ad) ? 0 : 20; plakaSheet();
};
AT.islem['plaka-d'] = function (d) { pd.kg = Math.max(0, yuv(pd.kg + (+d.d))); plakaSheet(); };
AT.islem['plaka-bar'] = function (d) { pd.bar = +d.v; plakaSheet(); };
AT.islem['plaka-yaz'] = function () {
  var ex = AT.S.active && AT.S.active.exs[pd.e]; if (!ex) return AT.kapat();
  var n = 0; ex.sets.forEach(function (s) { if (!s.done) { s.kg = String(pd.kg); n++; } });
  AT.kaydet(); AT.kapat(); AT.render(); AT.toast(n ? n + ' sete ' + AT.fmt(pd.kg, 2) + ' kg yazıldı' : 'Boş set yok');
};

/* ---------- sezon kartı ---------- */
var kartBlob = null;
function ort(a) { return a.reduce(function (t, x) { return t + x; }, 0) / a.length; }
function gunEkle(iso, n) { var d = AT.parse(iso); d.setDate(d.getDate() + n); return AT.iso(d); }

function kartVeri() {
  var S = AT.S, bugun = AT.iso(new Date()), bas = S.bulk ? S.bulk.bas : gunEkle(bugun, -83);
  var bw = S.bw.filter(function (b) { return b.date >= bas; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var ses = AT.bitenSeanslar().filter(function (s) { return s.date >= bas; });
  if (!bw.length && !ses.length) return null;
  var v = { bas: bas, bit: bugun, hafta: Math.max(1, Math.ceil((AT.parse(bugun) - AT.parse(bas)) / 864e5 / 7)), bulk: !!S.bulk };
  if (bw.length) {
    var son = bw[bw.length - 1].date;
    v.kg0 = S.bulk ? S.bulk.basKg : ort(bw.filter(function (b) { return b.date <= gunEkle(bw[0].date, 6); }).map(function (b) { return b.kg; }));
    v.kg1 = ort(bw.filter(function (b) { return b.date >= gunEkle(son, -6); }).map(function (b) { return b.kg; })); v.kgAd = '7 günlük ortalama';
    var bd = S.bulk && AT.bulkDurum ? AT.bulkDurum() : null;
    if (bd && isFinite(bd.simdi)) { v.kg1 = bd.simdi; v.kgAd = 'ortalama kilo'; }
    v.seri = bw.map(function (b, i) {
      var lim = gunEkle(b.date, -6), a = bw.slice(0, i + 1).filter(function (x) { return x.date >= lim; });
      return ort(a.map(function (x) { return x.kg; }));
    });
  }
  var ex = {};
  ses.forEach(function (s) {
    s.exs.forEach(function (e) {
      var m = 0; AT.yapilanSetler(e).forEach(function (z) { m = Math.max(m, (AT.tahminiMax || AT.e1rm)(AT.num(z.kg), AT.num(z.reps), z.rpe)); });
      if (!(m > 0)) return;
      var x = ex[e.ad] || (ex[e.ad] = { ad: e.ad, n: 0, ilk: m, en: 0 });
      x.n++; x.en = Math.max(x.en, m);
    });
  });
  v.gucler = Object.keys(ex).map(function (k) { return ex[k]; }).filter(function (x) { return x.n >= 2; })
    .sort(function (a, b) { return b.n - a.n || (b.en - b.ilk) - (a.en - a.ilk); }).slice(0, 4);
  v.seans = ses.length;
  v.hacim = ses.reduce(function (t, s) { return t + AT.seansHacim(s); }, 0);
  v.set = ses.reduce(function (t, s) { return t + s.exs.reduce(function (u, e) { return u + AT.yapilanSetler(e).length; }, 0); }, 0);
  return v;
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function isaretli(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + AT.fmt(Math.abs(n), d); }

function kartCiz(v) {
  var W = 1080, H = 1920, P = 90, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var c = cv.getContext('2d'), F = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  var SF = '"Iowan Old Style","Palatino Linotype",Palatino,Charter,ui-serif,Georgia,serif';
  /* uygulamanın açık paleti (style.css :root) */
  var TX = '#26282c', MUT = '#6a6c70', DIM = '#9c9b97', AC = '#3d5d8a', IYI = '#3f8462', LN = '#e4ded2', S1 = '#fffdf9';
  function yaz(t, x, y, boy, agir, renk, hiza, serif, maxW) {
    c.font = (agir || 400) + ' ' + boy + 'px ' + (serif ? SF : F); c.fillStyle = renk || TX; c.textAlign = hiza || 'left';
    if (maxW) { while (t.length > 3 && c.measureText(t).width > maxW) t = t.slice(0, -2).trim() + '…'; }
    c.fillText(t, x, y);
  }
  c.fillStyle = '#f7f4ee'; c.fillRect(0, 0, W, H);
  var y = P + 40;
  yaz((v.bulk ? 'Bulk sezonu' : 'Son 12 hafta') + ' · ' + v.hafta + '. hafta', P, y, 42, 500, MUT); y += 40;
  if (v.kg1 != null) {
    y += 190; yaz(isaretli(v.kg1 - v.kg0, 1) + ' kg', P - 6, y, 210, 600, TX, 'left', true);
    y += 76; yaz(AT.fmt(v.kg0, 1) + ' → ' + AT.fmt(v.kg1, 1) + ' kg · ' + v.kgAd, P, y, 40, 400, MUT);
    // kilo eğrisi
    y += 50; var gx = P, gy = y, gw = W - 2 * P, gh = 300;
    c.fillStyle = S1; rr(c, gx, gy, gw, gh, 36); c.fill(); c.strokeStyle = LN; c.lineWidth = 2; c.stroke();
    var s = v.seri; if (s.length > 1) {
      var mn = Math.min.apply(0, s), mx = Math.max.apply(0, s); if (mx - mn < 0.5) { mn -= 0.25; mx += 0.25; }
      var ix = gx + 50, iy = gy + 50, iw = gw - 100, ih = gh - 100;
      function X(i) { return ix + i / (s.length - 1) * iw; } function Y(k) { return iy + (1 - (k - mn) / (mx - mn)) * ih; }
      c.beginPath(); s.forEach(function (k, i) { if (i) c.lineTo(X(i), Y(k)); else c.moveTo(X(i), Y(k)); });
      c.strokeStyle = AC; c.lineWidth = 7; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
      c.lineTo(X(s.length - 1), iy + ih); c.lineTo(X(0), iy + ih); c.closePath(); c.fillStyle = 'rgba(61,93,138,.08)'; c.fill();
      c.beginPath(); c.arc(X(s.length - 1), Y(s[s.length - 1]), 14, 0, 7); c.fillStyle = S1; c.fill(); c.lineWidth = 6; c.strokeStyle = AC; c.stroke();
    }
    y = gy + gh + 30;
  } else y += 40;
  // güç
  if (v.gucler.length) {
    y += 80; yaz('Güç · tahmini max', P, y, 46, 600, TX, 'left', true); y += 26;
    v.gucler.forEach(function (g) {
      y += 72; yaz(g.ad, P, y, 44, 500, TX, 'left', false, W - 2 * P - 220);
      yaz(isaretli(g.en - g.ilk, 1) + ' kg', W - P, y, 46, 650, g.en > g.ilk ? IYI : MUT, 'right');
      y += 46; yaz(AT.fmt(g.ilk, 1) + ' → ' + AT.fmt(g.en, 1) + ' kg', P, y, 34, 400, MUT);
      y += 30; c.fillStyle = LN; c.fillRect(P, y, W - 2 * P, 2);
    });
  }
  // sayılar
  var sy = Math.max(y + 130, H - P - 230), cw = (W - 2 * P) / 3;
  [[String(v.seans), 'antrenman'], [String(v.set), 'set'], [AT.fmt(v.hacim / 1000, 1) + ' t', 'toplam kaldırılan']].forEach(function (k, i) {
    yaz(k[0], P + i * cw, sy, 84, 600, TX, 'left', true); yaz(k[1], P + i * cw, sy + 56, 36, 400, MUT);
  });
  yaz(AT.tarih(v.bas, 1) + (v.bas.slice(0, 4) !== v.bit.slice(0, 4) ? ' ' + v.bas.slice(0, 4) : '') + ' – ' + AT.tarih(v.bit, 1) + ' ' + v.bit.slice(0, 4), P, H - P - 10, 34, 400, DIM);
  yaz('Ağırlık Takip', W - P, H - P - 10, 34, 600, AC, 'right');
  return cv;
}

AT.bolum.kart = function () {
  if (!AT.S.sessions.length && !AT.S.bw.length) return '';
  return '<div class="panel liste ayri"><button class="satir" data-act="kart"><span class="grow"><b>Paylaşılabilir kart oluştur</b><span>Kilo değişimi ve güç artışı tek görselde (hikâye boyutu)</span></span></button></div>';
};
AT.islem.kart = function () {
  var v = kartVeri(); if (!v) return AT.toast('Kart için veri yok');
  var cv = kartCiz(v); kartBlob = null;
  cv.toBlob(function (b) { kartBlob = b; });
  var paylas = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  AT.sheet('<h3>Sezon kartı</h3><img class="kart-onizleme" alt="Sezon kartı önizlemesi" src="' + cv.toDataURL('image/png') + '">' +
    (paylas ? '<button class="btn-ac btn-big" data-act="kart-paylas" style="margin-bottom:8px">Paylaş</button>' : '') +
    '<button class="btn-big' + (paylas ? '' : ' btn-ac') + '" data-act="kart-indir" style="margin-bottom:8px">PNG indir</button><button class="btn-ghost btn-big" data-act="kapat">Kapat</button>');
};
function kartAd() { return 'sezon-karti-' + AT.iso(new Date()) + '.png'; }
AT.islem['kart-indir'] = function () { if (!kartBlob) return AT.toast('Hazırlanıyor, tekrar dene'); AT.indir(kartBlob, kartAd()); AT.toast('Kart indirildi'); };
AT.islem['kart-paylas'] = function () {
  if (!kartBlob) return AT.toast('Hazırlanıyor, tekrar dene');
  navigator.share({ files: [new File([kartBlob], kartAd(), { type: 'image/png' })], title: 'Sezon kartı' }).catch(function () {});
};

AT._ekstra = { plakalar: plakalar, isinma: isinma, kartVeri: kartVeri };
})(window.AT);
