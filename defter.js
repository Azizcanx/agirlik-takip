/* defter.js: modül (window.AT'ye kayıt olur). "Defter" sekmesi: gün içinde aklına geleni yaz.
   S.defter = [{id, t: yazıldığı an (ms), d: 'YYYY-MM-DD' yazıldığı yerel gün, metin, duz?: son düzenleme (ms), demo?}]
   Üstte yazdıkça uzayan çizgili alan; yarım kalan yazı bu cihazda taslak olarak durur (localStorage, eşitlenmez).
   Kaydet ya da Ctrl+Enter (PC). Altta notlar günlere göre (Bugün, Dün, "29 Ekim Perşembe"), en yeni üstte.
   Nota dokun → düzenle / sil (6 sn Geri al); boş bırakıp kaydetmek de siler. 15'ten fazla notta "Notlarda ara":
   büyük/küçük harf ve Türkçe harf duyarsız (göğüs = gogus), bütün kelimeleri geçen notlar, eşleşen yer işaretli.
   Eşitleme: esitle.js VERI + LISTE (defter: 'id'). AT.gorunum.defter() -> sekme HTML'i
   Koç (koc.js, isteğe bağlı): Kaydet yanında "Koça sor" (AT.bolum.kocDugme), altında çipler + bekleme satırı (AT.bolum.kocAlt);
   koç notu {…, koc: {s: soru, model, ss: sağlayıcı}} AT.kocSatir ile çizilir; aramada soru da taranır. Ctrl+Shift+Enter = Koça sor. */
(function (AT) {
'use strict';

var GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
var ARA_ESIK = 15, ILK = 50, UZUN = 10000, LS_TASLAK = 'agirlik-defter-taslak';

/* ---------- saf hesaplar ---------- */
function veri(S) { if (!Array.isArray(S.defter)) S.defter = []; return S.defter; }
function notlar(S) { return veri(S).filter(function (n) { return n && typeof n === 'object' && n.id != null; }); }
function sira(l, id) { for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return i; return -1; }
function gunOf(n) { return /^\d{4}-\d{2}-\d{2}$/.test(n.d || '') ? n.d : AT.iso(new Date(+n.t || 0)); }
function saat(ts) { var d = new Date(+ts || 0); return AT.p2(d.getHours()) + ':' + AT.p2(d.getMinutes()); }
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
/* "29 Ekim Perşembe"; başka yıldaysa "29 Ekim 2025 Çarşamba" */
function tamTarih(gun, bugun) {
  var d = AT.parse(gun);
  return d.getDate() + ' ' + AT.AYLAR[d.getMonth()] + (gun.slice(0, 4) !== bugun.slice(0, 4) ? ' ' + d.getFullYear() : '') + ' ' + GUNLER[d.getDay()];
}
function gunAdi(gun, bugun) { return gun === bugun ? 'Bugün' : gun === gunEkle(bugun, -1) ? 'Dün' : tamTarih(gun, bugun); }
/* gün grupları [{gun, notlar}]: en yeni gün üstte, gün içinde en yeni not üstte */
function grupla(l) {
  var out = [], g = null;
  l.slice().sort(function (a, b) { var x = gunOf(a), y = gunOf(b); return x < y ? 1 : x > y ? -1 : (+b.t || 0) - (+a.t || 0); })
    .forEach(function (n) { var k = gunOf(n); if (!g || g.gun !== k) out.push(g = { gun: k, notlar: [] }); g.notlar.push(n); });
  return out;
}
function temizle(m) { return String(m == null ? '' : m).replace(/\r\n?/g, '\n').trim().slice(0, UZUN); }

/* arama: Türkçe küçük harf + Türkçe harfsiz (ç→c, ı→i …). Her harf tek harfe iner, konumlar metinle aynı kalır (işaret için) */
var HARF = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function katla(s) {
  s = String(s == null ? '' : s);
  var k = s.toLocaleLowerCase('tr');
  if (k.length !== s.length) { k = ''; for (var i = 0; i < s.length; i++) { var c = s.charAt(i).toLocaleLowerCase('tr'); k += c.length === 1 ? c : s.charAt(i); } }
  return k.replace(/[çğıöşüâîû]/g, function (c) { return HARF[c]; });
}
function terimler(q) { return katla(q).split(/\s+/).filter(Boolean); }
function eslesir(n, ts) { var m = katla(n.metin + (n.koc && n.koc.s ? '\n' + n.koc.s : '')); return ts.every(function (t) { return m.indexOf(t) >= 0; }); }
function bulNotlar(l, q) { var ts = terimler(q); return ts.length ? l.filter(function (n) { return eslesir(n, ts); }) : l.slice(); }
/* metin kaçışla yazılır (HTML çalışmaz); terimlerin geçtiği yerler <mark> */
function vurgula(metin, ts) {
  metin = String(metin == null ? '' : metin);
  if (!ts || !ts.length) return AT.h(metin);
  var k = katla(metin), on = [], o = '', i = 0;
  ts.forEach(function (t) { for (var p = k.indexOf(t); p >= 0; p = k.indexOf(t, p + 1)) for (var x = p; x < p + t.length; x++) on[x] = true; });
  while (i < metin.length) {
    var j = i + 1, v = !!on[i];
    while (j < metin.length && !!on[j] === v) j++;
    o += v ? '<mark>' + AT.h(metin.slice(i, j)) + '</mark>' : AT.h(metin.slice(i, j));
    i = j;
  }
  return o;
}

/* ---------- taslak: yarım kalan yazı (yalnız bu cihaz) ---------- */
function taslakOku() { try { return localStorage.getItem(LS_TASLAK) || ''; } catch (e) { return ''; } }
function taslakYaz(v) { try { if (v) localStorage.setItem(LS_TASLAK, v); else localStorage.removeItem(LS_TASLAK); } catch (e) {} }

/* ---------- görünüm ---------- */
var aramaQ = '', hepsi = false;

/* yazı alanı yazdıkça uzar; CSS max-height'a gelince kendi içinde kayar */
function boyutla(e) {
  if (!e || !e.style || typeof getComputedStyle !== 'function') return;
  var y = window.scrollY, mx = parseFloat(getComputedStyle(e).maxHeight) || Infinity;
  e.style.height = 'auto';
  var h = e.scrollHeight + e.offsetHeight - e.clientHeight;   /* + kenarlık */
  e.style.height = Math.min(h, mx) + 'px';
  e.style.overflowY = h > mx ? 'auto' : 'hidden';
  if (window.scrollY !== y) window.scrollTo(0, y);
}
function notSatir(n, ts) {
  if (n.koc && AT.kocSatir) return AT.kocSatir(n, ts, saat(n.t), vurgula);
  return '<button class="satir df-not" data-act="df-ac" data-id="' + AT.h(n.id) + '"><span class="df-saat">' + saat(n.t) + '</span>' +
    '<span class="grow df-metin">' + vurgula(n.metin, ts) + '</span>' + (n.demo ? '<span class="tag demo">örnek</span>' : '') + '</button>';
}
/* notlar sütunu (arama yazarken yalnız bu kısım yenilenir). İlk ILK not tam günlerle; arama hepsine bakar */
function listeHtml() {
  var l = notlar(AT.S), bugun = AT.iso(new Date());
  if (!l.length) return AT.bos ? AT.bos('defter', 'Henüz not yok; yazdıkların günlere göre burada birikir.') : '<div class="empty">Henüz not yok.</div>';
  var ts = l.length > ARA_ESIK ? terimler(aramaQ) : [], bul = ts.length ? l.filter(function (n) { return eslesir(n, ts); }) : l;
  var gr = grupla(bul), say = 0, n = 0;
  for (; n < gr.length && (hepsi || ts.length || say < ILK); n++) say += gr[n].notlar.length;
  var o = ts.length ? '<p class="df-sonuc">' + (bul.length ? bul.length + ' not bulundu' : 'Bulunamadı') + '</p>' : '';
  o += gr.slice(0, n).map(function (g) {
    return '<h2 class="df-gun"><span class="df-say">' + g.notlar.length + ' not</span>' + AT.h(gunAdi(g.gun, bugun)) + '</h2><div class="panel liste">' + g.notlar.map(function (x) { return notSatir(x, ts); }).join('') + '</div>';
  }).join('');
  if (bul.length > say) o += '<button class="btn-big btn-ghost ac" data-act="df-hepsi">Daha eski notlar (' + (bul.length - say) + ')</button>';
  return o;
}
function gorunum() {
  var l = notlar(AT.S), bugun = AT.iso(new Date());
  var o = '<h1>Defter</h1><p class="sub">' + AT.h(tamTarih(bugun, bugun)) + (l.length ? ' · ' + l.length + ' not' : '') + '</p>';
  var a = '<div class="df-yaz"><textarea id="df-metin" class="df-alan" rows="3" maxlength="' + UZUN + '" placeholder="Aklına geleni yaz…" aria-label="Yeni not">' + AT.h(taslakOku()) + '</textarea>' +
    '<div class="df-dugmeler"><button class="btn-ac btn-big" data-act="df-kaydet">Kaydet<kbd>Ctrl + Enter</kbd></button>' + (AT.bolum.kocDugme ? AT.bolum.kocDugme() : '') +
    (AT.setDil ? AT.setDil.mik('df-metin') : '') + '</div>' +
    (AT.bolum.kocAlt ? AT.bolum.kocAlt() : '') + '</div>';
  if (l.length > ARA_ESIK) a += '<input id="df-ara" class="df-ara" type="search" placeholder="Notlarda ara" aria-label="Notlarda ara" autocomplete="off" value="' + AT.h(aramaQ) + '">';
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { boyutla(AT.$('#df-metin')); });   /* taslak varsa boyu */
  return o + AT.kol(a, '<div id="df-liste">' + listeHtml() + '</div>', 'defter');
}

/* ---------- işlemler ---------- */
AT.islem['df-kaydet'] = function (d) {
  var e = AT.$('#df-metin'), m = temizle(e ? e.value : ''), not = d && d.not;
  if (not) AT.kapat();   /* setdil.js seçim penceresinden "Not olarak kaydet" */
  if (!m) { AT.toast('Önce bir şey yaz'); if (e && e.focus) e.focus(); return; }
  /* setdil.js: metin güçlü biçimde set ("curl 3x10 15") ya da soruysa önce seçim; yanlışlıkla notlar set olmasın */
  if (!not && AT.setDil && AT.setDil.defterOnce(m)) return;
  var t = Date.now();
  veri(AT.S).push({ id: AT.uid(), t: t, d: AT.iso(new Date(t)), metin: m });
  taslakYaz(''); aramaQ = '';   /* yeni not aramaya takılıp gizlenmesin */
  AT.kaydet(); AT.render(); AT.toast('Not kaydedildi');
  if (AT.masaustu && AT.masaustu()) { var y = AT.$('#df-metin'); if (y && y.focus) y.focus(); }   /* PC: sıradaki nota devam */
};
AT.islem['df-ac'] = function (d) {
  var l = veri(AT.S), i = sira(l, d.id); if (i < 0) return;
  var n = l[i], bugun = AT.iso(new Date()), g = gunOf(n), alt = gunAdi(g, bugun) + ' ' + saat(n.t);
  if (n.duz) {
    var dg = AT.iso(new Date(+n.duz)), ad = gunAdi(dg, bugun);
    alt += ' · düzenlendi ' + (dg === g ? '' : (ad === 'Bugün' || ad === 'Dün' ? ad.toLocaleLowerCase('tr') : ad) + ' ') + saat(n.duz);
  }
  var id = AT.h(n.id);
  AT.sheet('<h3>' + (n.koc ? 'Koç notu' : 'Notu düzenle') + (n.demo ? ' <span class="tag demo">örnek</span>' : '') + '</h3><p class="mut">' + AT.h(alt) + '</p>' +
    (n.koc ? '<p class="koc-soru">' + AT.h(n.koc.s) + '</p>' : '') +
    '<textarea id="df-duz" class="df-alan" data-id="' + id + '" maxlength="' + UZUN + '" aria-label="Not">' + AT.h(n.metin) + '</textarea>' +
    '<div class="yigin"><button class="btn-ac btn-big" data-act="df-duz-kaydet" data-id="' + id + '">Kaydet<kbd>Ctrl + Enter</kbd></button>' +
    '<button class="btn-big" data-act="kapat">Vazgeç</button>' +
    '<button class="btn-big btn-ghost btn-bad" data-act="df-sil" data-id="' + id + '">Notu sil</button></div>');
  var e = AT.$('#df-duz'); boyutla(e);
  if (e && e.focus && AT.masaustu && AT.masaustu()) { e.focus(); try { e.setSelectionRange(e.value.length, e.value.length); } catch (x) {} }
};
function sil(id) {
  var l = veri(AT.S), i = sira(l, id); if (i < 0) return AT.kapat();
  var x = l.splice(i, 1)[0];
  AT.kaydet(); AT.kapat(); AT.render();
  AT.geriAl('Not silindi', function () { var l2 = veri(AT.S); if (sira(l2, x.id) < 0) l2.push(x); });
}
AT.islem['df-sil'] = function (d) { sil(d.id); };
/* boş bırakıp kaydetmek notu siler (Geri al ile) */
AT.islem['df-duz-kaydet'] = function (d) {
  var e = AT.$('#df-duz'), l = veri(AT.S), i = sira(l, d.id);
  if (i < 0 || !e) return AT.kapat();
  var m = temizle(e.value), eski = l[i];
  if (!m) return sil(d.id);
  if (m === eski.metin) return AT.kapat();
  l[i] = Object.assign({}, eski, { metin: m, duz: Date.now() });
  AT.kaydet(); AT.kapat(); AT.render();
  AT.geriAl('Not güncellendi', function () { var l2 = veri(AT.S), k = sira(l2, eski.id); if (k >= 0) l2[k] = eski; else l2.push(eski); });
};
AT.islem['df-hepsi'] = function () { hepsi = true; AT.render(); };

/* örnek veri: app.js'in yükle/sil işlemlerini sarar; yalnız demo: true notlara dokunur */
var DEMO = [
  [0, 7, 40, 'Uyku 6 saat, biraz yorgunum. Akşam bacak günü: squat öncesi ısınmayı uzun tut.'],
  [1, 21, 15, 'Bench\'te son sette sağ omuz hafif sızladı. Gelecek sefer tutuşu biraz daralt, kiloyu artırma.'],
  [2, 13, 5, 'Alınacaklar:\n– kreatin (bitmek üzere)\n– protein tozu, çikolatalı\n– bileklik'],
  [4, 19, 30, 'Salon 18.00–19.00 arası çok kalabalık; 20.00\'den sonra gitmek daha rahat.']
];
function demoNotlar(simdi) {
  var g0 = new Date(simdi); g0.setHours(0, 0, 0, 0);
  return DEMO.map(function (x, i) {
    var d = new Date(g0.getTime()); d.setDate(d.getDate() - x[0]); d.setHours(x[1], x[2], 0, 0);
    var t = x[0] ? d.getTime() : Math.max(g0.getTime() + 60000, Math.min(simdi - 600000, d.getTime()));   /* bugünkü not gelecekte olmasın */
    return { id: 'ddf' + (i + 1), t: t, d: AT.iso(new Date(t)), metin: x[3], demo: true };
  });
}
function demosuz(S) { return veri(S).filter(function (n) { return !(n && n.demo); }); }
var eskiYukle = AT.islem['demo-yukle'], eskiSil = AT.islem['demo-sil'], eskiHepsi = AT.islem['hepsini-kesin'];
AT.islem['demo-yukle'] = function (d) {
  AT.S.defter = demosuz(AT.S).concat(demoNotlar(Date.now()));
  if (eskiYukle) return eskiYukle(d);
  AT.kaydet(); AT.render();
};
AT.islem['demo-sil'] = function (d) {
  AT.S.defter = demosuz(AT.S);
  if (eskiSil) return eskiSil(d);
  AT.kaydet(); AT.render();
};
/* "Tüm verileri sil": yarım taslak da gitsin */
AT.islem['hepsini-kesin'] = function (d) { taslakYaz(''); aramaQ = ''; hepsi = false; if (eskiHepsi) return eskiHepsi(d); };

/* ---------- olaylar ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t) return;
    if (t.id === 'df-metin') { taslakYaz(t.value); boyutla(t); }
    else if (t.id === 'df-duz') boyutla(t);
    else if (t.id === 'df-ara') { aramaQ = t.value; var l = AT.$('#df-liste'); if (l) l.innerHTML = listeHtml(); }
  });
  /* Ctrl/Cmd+Enter: kaydet · Esc: yazı alanından çık (1–6 sekme kısayolları yeniden çalışsın) */
  document.addEventListener('keydown', function (ev) {
    var t = ev.target; if (!t) return;
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !ev.isComposing) {
      if (t.id === 'df-metin' && ev.shiftKey && AT.kocBagli && AT.kocBagli()) { ev.preventDefault(); AT.islem['koc-sor'](); }
      else if (t.id === 'df-metin') { ev.preventDefault(); AT.islem['df-kaydet'](); }
      else if (t.id === 'df-duz') { ev.preventDefault(); AT.islem['df-duz-kaydet']({ id: t.dataset.id }); }
    } else if (ev.key === 'Escape' && t.id === 'df-metin' && t.blur) t.blur();
  });
}

AT.gorunum = AT.gorunum || {};
AT.gorunum.defter = gorunum;
AT._defter = { veri: veri, grupla: grupla, gunAdi: gunAdi, tamTarih: tamTarih, katla: katla, terimler: terimler, bulNotlar: bulNotlar, vurgula: vurgula,
  temizle: temizle, demoNotlar: demoNotlar, listeHtml: listeHtml, aramaYaz: function (q) { aramaQ = q; }, taslakOku: taslakOku,
  taslakYaz: taslakYaz, boyutla: boyutla };   /* test için; koc.js de kullanır (taslak, yazı alanı boyu, liste) */
})(window.AT);
