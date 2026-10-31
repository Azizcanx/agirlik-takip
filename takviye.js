/* takviye.js: modül (window.AT'ye kayıt olur). Ayrı "Takviye" sekmesi.
   S.takviye = { liste: [{id, ad, doz, zaman}], alinan: {'YYYY-MM-DD': [id, ...]} }
   zaman: 'sabah' | 'antrenman' | 'aksam' | 'gun' (gün içinde). Bugün tıkla → alındı / geri al.
   Son 30 gün: her takviye için nokta şeridi, kaç gün alındığı ve bugüne uzanan seri.
   AT.gorunum.takviye() -> sekme HTML'i */
(function (AT) {
'use strict';

var ZAMAN = [['sabah', 'Sabah'], ['antrenman', 'Antrenman sonrası'], ['aksam', 'Akşam'], ['gun', 'Gün içinde']];
var HAZIR = [['Kreatin', '5 g', 'gun'], ['Protein tozu', '1 ölçek', 'antrenman'], ['D vitamini', '1 tablet', 'sabah'], ['Omega-3', '1 kapsül', 'sabah'],
  ['Magnezyum', '1 tablet', 'aksam'], ['Multivitamin', '1 tablet', 'sabah'], ['Kafein / pre-workout', '1 ölçü', 'antrenman'], ['Çinko', '1 tablet', 'aksam']];
var GUN30 = 30;

/* ---------- saf hesaplar ---------- */
function veri(S) {
  var t = S.takviye;
  if (!t || typeof t !== 'object') t = S.takviye = { liste: [], alinan: {} };
  if (!Array.isArray(t.liste)) t.liste = [];
  if (!t.alinan || typeof t.alinan !== 'object') t.alinan = {};
  return t;
}
function alindiMi(t, id, gun) { var a = t.alinan[gun]; return !!(a && a.indexOf(id) >= 0); }
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
/* id için son n gün (bugün dahil) şerit + sayı + seri. Seri: bugünden geriye kesintisiz alınan gün;
   bugün henüz alınmadıysa dünden başlar (gün bitmeden seri bozulmuş sayılmaz) */
function ozet(t, id, bugun, n) {
  n = n || GUN30;
  var serit = [], say = 0;
  for (var i = n - 1; i >= 0; i--) { var g = gunEkle(bugun, -i), v = alindiMi(t, id, g); serit.push({ gun: g, v: v }); if (v) say++; }
  var seri = 0, d = alindiMi(t, id, bugun) ? bugun : gunEkle(bugun, -1);
  while (alindiMi(t, id, d) && seri < 3650) { seri++; d = gunEkle(d, -1); }
  return { serit: serit, say: say, seri: seri };
}
function degistir(t, id, gun) {
  var a = (t.alinan[gun] || []).slice(), i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  if (a.length) t.alinan[gun] = a; else delete t.alinan[gun];
  return i < 0;
}

/* ---------- görünüm ---------- */
function zamanAd(z) { var x = ZAMAN.filter(function (k) { return k[0] === z; })[0]; return x ? x[1] : 'Gün içinde'; }
var duzenle = false;

function bugunListe(t, bugun) {
  var sira = ZAMAN.map(function (z) { return z[0]; });
  var l = t.liste.slice().sort(function (a, b) { return sira.indexOf(a.zaman) - sira.indexOf(b.zaman); });
  return '<div class="tk-liste">' + l.map(function (x) {
    var ok = alindiMi(t, x.id, bugun);
    return '<button class="satir tk' + (ok ? ' on' : '') + '" data-act="tk-al" data-id="' + AT.h(x.id) + '" aria-pressed="' + ok + '">' +
      '<span class="tk-kutu" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>' +
      '<span class="grow"><b>' + AT.h(x.ad) + '</b><span>' + AT.h([x.doz, zamanAd(x.zaman)].filter(Boolean).join(' · ')) + '</span></span></button>';
  }).join('') + '</div>';
}
function gecmis(t, bugun) {
  return '<div class="panel liste">' + t.liste.map(function (x) {
    var o = ozet(t, x.id, bugun);
    return '<div class="satir tk-gecmis"><span class="grow"><b>' + AT.h(x.ad) + '</b>' +
      '<span class="tk-serit" role="img" aria-label="' + AT.h(x.ad + ': son ' + GUN30 + ' günde ' + o.say + ' gün') + '">' +
      o.serit.map(function (g, i) { var c = (g.v ? 'v' : '') + (i === GUN30 - 1 ? ' bu' : ''); return '<i' + (c ? ' class="' + c.trim() + '"' : '') + ' title="' + AT.h(AT.tarih(g.gun, 1)) + '"></i>'; }).join('') + '</span></span>' +
      '<span class="tk-say' + (o.seri >= 7 ? ' iyi' : '') + '"><b>' + o.say + '/' + GUN30 + '</b><span>' + (o.seri ? o.seri + ' gün seri' : 'seri yok') + '</span></span></div>';
  }).join('') + '</div>';
}
function duzenleBolum(t) {
  var var_ = t.liste.map(function (x) { return x.ad.toLocaleLowerCase('tr'); });
  var hazir = HAZIR.filter(function (x) { return var_.indexOf(x[0].toLocaleLowerCase('tr')) < 0; });
  var o = '';
  if (t.liste.length) o += '<div class="panel liste">' + t.liste.map(function (x) {
    return '<div class="satir"><span class="grow"><b>' + AT.h(x.ad) + '</b><span>' + AT.h([x.doz, zamanAd(x.zaman)].filter(Boolean).join(' · ')) + '</span></span>' +
      '<button class="btn-ghost mini btn-bad" data-act="tk-sil" data-id="' + AT.h(x.id) + '">Çıkar</button></div>';
  }).join('') + '</div>';
  if (hazir.length) o += '<h3 class="tk-h3">Hızlı ekle</h3><div class="chips">' + hazir.map(function (x, i) {
    return '<button class="chip" data-act="tk-hazir" data-i="' + HAZIR.indexOf(x) + '">+ ' + AT.h(x[0]) + '</button>'; }).join('') + '</div>';
  o += '<h3 class="tk-h3">Kendin ekle</h3><div class="alanlar"><label class="alan"><span>Ad</span><input id="tk-ad" placeholder="örn. Melatonin" autocomplete="off"></label>' +
    '<label class="alan"><span>Doz</span><input id="tk-doz" placeholder="örn. 600 mg" autocomplete="off"></label>' +
    '<label class="alan tam"><span>Ne zaman</span><select id="tk-zaman">' + ZAMAN.map(function (z) { return '<option value="' + z[0] + '"' + (z[0] === 'gun' ? ' selected' : '') + '>' + z[1] + '</option>'; }).join('') + '</select></label></div>' +
    '<button class="btn-big" data-act="tk-ekle">Ekle</button>';
  return o;
}

function gorunum() {
  var S = AT.S, t = veri(S), bugun = AT.iso(new Date());
  var n = t.liste.length, al = t.liste.filter(function (x) { return alindiMi(t, x.id, bugun); }).length;
  var o = '<h1>Takviye</h1><p class="sub">' + (n ? 'Bugün ' + al + '/' + n + ' alındı' : AT.tarih(bugun)) + '</p>';
  if (!n) return o + (AT.bos ? AT.bos('takviye', 'Her gün aldıklarını ekle, dokunarak işaretle.') : '') + '<h2>Takviyelerini ekle</h2>' + duzenleBolum(t);
  /* düzenlerken bugünün listesi gizlenir: aynı takviyeler iki kez görünmesin */
  var a = duzenle ? '<h2>Listeyi düzenle</h2>' : '<h2>Bugün <small>dokun: alındı</small></h2>' + bugunListe(t, bugun);
  a += '<div class="row tk-alt"><button class="btn-ghost mini" data-act="tk-duzenle">' + (duzenle ? 'Düzenlemeyi kapat' : 'Listeyi düzenle') + '</button></div>';
  if (duzenle) a += duzenleBolum(t);
  var b = '<h2>Son ' + GUN30 + ' gün</h2>' + gecmis(t, bugun);
  return o + AT.kol(a, b);
}

/* ---------- işlemler ---------- */
function ekle(ad, doz, zaman) {
  var t = veri(AT.S); ad = String(ad || '').trim().slice(0, 40); doz = String(doz || '').trim().slice(0, 30);
  if (!ad) return AT.toast('Ad yaz');
  if (t.liste.some(function (x) { return x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'); })) return AT.toast(ad + ' zaten listede');
  t.liste.push({ id: AT.uid(), ad: ad, doz: doz, zaman: ZAMAN.some(function (z) { return z[0] === zaman; }) ? zaman : 'gun' });
  AT.kaydet(); AT.render(); AT.toast(ad + ' eklendi');
}
AT.islem['tk-al'] = function (d) {
  var t = veri(AT.S), x = t.liste.filter(function (k) { return k.id === d.id; })[0]; if (!x) return;
  var alindi = degistir(t, d.id, AT.iso(new Date())); AT.kaydet(); AT.render();
  var b = alindi && AT.$('[data-act="tk-al"][data-id="' + String(d.id).replace(/"/g, '') + '"]'); if (b && b.classList) b.classList.add('az');   /* yalnız yeni işaretlenen kutu canlanır */
  if (alindi && t.liste.every(function (k) { return alindiMi(t, k.id, AT.iso(new Date())); })) AT.toast('Bugünkü takviyeler tamam');
};
AT.islem['tk-duzenle'] = function () { duzenle = !duzenle; AT.render(); };
AT.islem['tk-hazir'] = function (d) { var x = HAZIR[+d.i]; if (x) ekle(x[0], x[1], x[2]); };
AT.islem['tk-ekle'] = function () { var g = function (id) { var e = AT.$('#' + id); return e ? e.value : ''; }; ekle(g('tk-ad'), g('tk-doz'), g('tk-zaman')); };
AT.islem['tk-sil'] = function (d) {
  var t = veri(AT.S), x = t.liste.filter(function (k) { return k.id === d.id; })[0]; if (!x) return;
  AT.onayla(x.ad + ' listeden çıksın mı?', 'Geçmiş kayıtları silinir.', 'tk-sil-kesin', 'Çıkar');
  sonSil = d.id;
};
var sonSil = null;
AT.islem['tk-sil-kesin'] = function () {
  var t = veri(AT.S), id = sonSil; sonSil = null;
  t.liste = t.liste.filter(function (k) { return k.id !== id; });
  Object.keys(t.alinan).forEach(function (g) { t.alinan[g] = t.alinan[g].filter(function (x) { return x !== id; }); if (!t.alinan[g].length) delete t.alinan[g]; });
  AT.kaydet(); AT.kapat(); AT.render();
};

AT.gorunum = AT.gorunum || {};
AT.gorunum.takviye = gorunum;
AT._takviye = { veri: veri, ozet: ozet, degistir: degistir, alindiMi: alindiMi, HAZIR: HAZIR };   /* test için */
})(window.AT);
