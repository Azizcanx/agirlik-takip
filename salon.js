/* salon.js: Salon modu. Telefonda süren antrenmanda başlıktaki "Salon" düğmesiyle tam ekran, eller serbest görünüm:
   dev kg × tekrar rakamları, büyük − / +, tek dokunuşla ✓, büyük mikrofon (SpeechRecognition tr-TR), dinlenmede sesli geri sayım
   (speechSynthesis tr-TR; Ayarlar'daki "sesli uyarı" kapalıysa titreşim). Veri modeli değişmez: tüm yazma app.js'in
   AT.islem['tamam'] / ['adj'] / ['set-ekle'] / ['rest-*'] yolundan geçer; çıkınca normal sahne kaldığı hareketten sürer.
   Ses komutları: "60 8" (kg tekrar, ✓), "altmış sekiz" (60 × 8), "bitti", "sonraki", "bir set daha", "dinlenmeyi geç", "geri al".
   Anlaşılan komut 1 sn önizlenir, kendiliğinden uygulanır, Geri al ile döner. Destek yoksa (mikrofon, sentez, titreşim) sessizce atlanır.
   AT.bolum.salonDugme() -> başlık düğmesi (app.js) · AT.salonAcik() -> Wake Lock için · AT._salon -> test */
(function (AT) {
'use strict';
if (!AT) return;

var W = typeof window !== 'undefined' ? window : {}, D = typeof document !== 'undefined' ? document : null;
function srVar() { return W.SpeechRecognition || W.webkitSpeechRecognition || null; }
function sentezVar() { return !!(W.speechSynthesis && W.SpeechSynthesisUtterance); }
function titreVar() { return !!(typeof navigator !== 'undefined' && navigator.vibrate); }

/* ---------- ses komutu → eylem (saf; test edilir) ---------- */
function norm(m) {
  if (AT._setdil && AT._setdil.normal) { try { return AT._setdil.normal(m); } catch (e) { } }
  return String(m == null ? '' : m).toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/\s+/g, ' ').trim();
}
function kgOk(v) { return isFinite(v) && v >= 0 && v <= 1000; }
function tkOk(v) { return isFinite(v) && v >= 1 && v <= 200 && v % 1 === 0; }
function fm(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
function degerEylem(kg, reps, tamam) {
  if (kg != null && !kgOk(kg)) return { tur: 'bilinmiyor', neden: 'kg 0–1000 arası olmalı' };
  if (reps != null && !tkOk(reps)) return { tur: 'bilinmiyor', neden: 'Tekrar 1–200 arası tam sayı olmalı' };
  var o = []; if (kg != null) o.push(fm(kg) + ' kg'); if (reps != null) o.push(reps + ' tekrar');
  return { tur: 'deger', kg: kg, reps: reps, tamam: !!tamam, ozet: (kg != null && reps != null ? fm(kg) + ' × ' + reps : o.join(' · ')) + (tamam ? ' ✓' : '') };
}
/* göreli kalıplar ("2,5 kilo arttır", "bir tekrar fazla"): setdil kural ayrıştırıcısı, süren hareketin son bitmiş setine göre */
function goreli(ham) {
  try {
    var r = AT.setDil && AT.setDil.coz && AT.setDil.coz(ham), x = r && r.satirlar && r.satirlar[0];
    if (x && x.tur === 'set' && x.aktif && x.setler && x.setler[0]) {
      var s0 = x.setler[0], kg = AT.num(s0.kg), rp = AT.num(s0.reps);
      return degerEylem(isNaN(kg) ? null : kg, isNaN(rp) ? null : rp, false);
    }
  } catch (e) { }
  return null;
}
function komut(metin) {
  var ham = String(metin == null ? '' : metin).trim(); if (!ham || ham.length > 200) return { tur: 'bilinmiyor' };
  var n = norm(ham);
  var bitDeyim = /\b(bitti|bitirdim|tamam|tamamla\w*|yaptim|oldu|onayla|isaretle|kaydet)\b/.test(n);
  if (/\bgeri al\b|\bvazgec\b|\biptal\b/.test(n)) return { tur: 'geri', ozet: 'Geri al' };
  if (/\bantrenman\w*\s+(bitir|bitti|kapat)|\b(cik|salondan cik|salon\w* kapat)\b/.test(n)) return { tur: 'cik', ozet: 'Salon modundan çık' };
  if (/\bdinlen\w*\s+(gec|atla|bitir|kapat|bitti)\b|^(gec|atla)$|\bdinlenme\w* (yok|gerekmiyor)\b/.test(n)) return { tur: 'dinlenGec', ozet: 'Dinlenmeyi geç' };
  var dk = /\bdinlen\w*\s+(\d+)\s*(dakika|dk|saniye|sn)?\b/.exec(n);
  if (dk) { var sn = Math.round(+dk[1] * (/^(dakika|dk)$/.test(dk[2] || '') ? 60 : 1)); if (sn >= 15 && sn <= 900) return { tur: 'dinlen', sn: sn, ozet: 'Dinlenme ' + sn + ' sn' }; return { tur: 'bilinmiyor', neden: 'Dinlenme 15 sn – 15 dk arası olmalı' }; }
  if (/\b(arttir|artir|azalt|dusur|eksilt|indir|bindir|fazla|eksik)\w*/.test(n)) { var g = goreli(ham); if (g) return g; }
  var nums = (n.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  var kgM = /(\d+(?:\.\d+)?)\s*(?:kg|kilo)\b/.exec(n), tkM = /(\d+)\s*(?:tekrar|kere|rep|x)\b/.exec(n), xM = /\b(\d+(?:\.\d+)?)(?:\s*(?:kg|kilo))?\s*x\s*(\d+)\b/.exec(n);
  if (/\bset daha\b|\bset ekle\b|\bbir daha\b|\b1 daha\b|\bayni set\b|\bayni sekilde\b/.test(n)) {
    var k1 = kgM ? +kgM[1] : null, t1 = tkM ? +tkM[1] : null;
    var d1 = (k1 != null || t1 != null) ? degerEylem(k1, t1, false) : null;
    if (d1 && d1.tur === 'bilinmiyor') return d1;
    return { tur: 'setekle', kg: k1, reps: t1, ozet: 'Bir set daha' + (d1 ? ' (' + d1.ozet + ')' : '') };
  }
  if (/\b(onceki|geri git|bir onceki)\b/.test(n)) return { tur: 'onceki', ozet: 'Önceki hareket' };
  if (/\b(sonraki|ileri|siradaki|diger hareket|baska hareket)\b/.test(n)) return { tur: 'sonraki', ozet: 'Sonraki hareket' };
  if (xM) return degerEylem(+xM[1], +xM[2], true);
  if (kgM || tkM) { var kk = kgM ? +kgM[1] : null, tt = tkM ? +tkM[1] : null; return degerEylem(kk, tt, bitDeyim || (kk != null && tt != null)); }
  if (nums.length >= 2) return degerEylem(nums[0], nums[1], true);
  if (nums.length === 1) {
    var v = nums[0];
    /* "altmış sekiz" tanıyıcıda 68 olur: 5'in katı olmayan iki basamaklı tam sayı = onluk kg + birler tekrar (60 × 8) */
    if (v >= 20 && v < 100 && v % 1 === 0 && v % 5 !== 0) { var bd = degerEylem(Math.floor(v / 10) * 10, v % 10, true); if (bd.tur === 'deger') { bd.belirsiz = true; bd.onizleme = fm(bd.kg) + ' × ' + bd.reps + ' mi?'; } return bd; }
    if (v >= 20 || v % 1 !== 0) return degerEylem(v, null, bitDeyim);
    return degerEylem(null, v, bitDeyim);
  }
  if (bitDeyim) return { tur: 'tamam', ozet: 'Seti bitir' };
  return { tur: 'bilinmiyor' };
}

/* ---------- dinlenme anonsları (saf; test edilir) ----------
   once/simdi: kalan tam saniye (yukarı yuvarlanmış) önceki ve şimdiki tıkta; sure: dinlenme süresi sn; sonSet: bitince gelen son set mi.
   Eşik, üstünden geçildiğinde bir kez söylenir; tek tıkta birden çok eşik geçilirse yalnız en sonuncusu (arka plandan dönünce gevezelik yok). */
var ESIKLER = [30, 10, 3, 2, 1];
function anons(once, simdi, sure, sonSet) {
  if (!(once > 0 && once > simdi)) return null;
  if (simdi <= 0) return { t: sonSet ? 'Son set hazır' : 'Sıradaki set hazır', son: true };
  var bul = null;
  ESIKLER.forEach(function (e) { if (once > e && simdi <= e && e <= sure - 5) bul = e; });
  if (bul == null) return null;
  return { t: bul === 30 ? '30 saniye' : String(bul), e: bul };
}

/* ---------- ses çıkışı ---------- */
var trSes = null;
function konus(t, yedek) {
  if (!sentezVar()) return false;
  try {
    var ss = W.speechSynthesis; ss.cancel();
    var u = new W.SpeechSynthesisUtterance(t), basladi = false, dustu = false;
    u.lang = 'tr-TR'; u.rate = 1.05; u.volume = 1;
    if (!trSes && ss.getVoices) trSes = (ss.getVoices() || []).filter(function (v) { return /^tr/i.test(v.lang); })[0] || null;
    if (trSes) u.voice = trSes;
    /* iOS'ta konuşma asenkron başarısız ya da sessiz kalabilir: hata olayı ya da 1,8 sn içinde başlamama = yedeğe düş */
    function dus() { if (!dustu) { dustu = true; if (yedek) yedek(); } }
    u.onstart = function () { basladi = true; };
    u.onerror = function (ev) { if (!ev || (ev.error !== 'canceled' && ev.error !== 'interrupted')) dus(); };
    setTimeout(function () { if (!basladi && acik) dus(); }, 1800);
    ss.speak(u); return true;
  } catch (e) { return false; }
}
function titre(p) { try { var ua = navigator.userActivation; if (titreVar() && (!ua || ua.hasBeenActive)) navigator.vibrate(p); } catch (e) { } }
/* Her anons ekranda da yazılır (sayaç zaten görünür). Ses kapalı / sentez yok / konuşma başlamadı: titreşim. iOS'ta navigator.vibrate YOK:
   orada yedek yalnız görseldir (sayaç + anons yazısı). Bitiş titreşimi/sesi app.js restAsim'de zaten var. */
function bildir(a) {
  if (!a) return;
  gorsel(a.t);
  var sesli = AT.S && AT.S.ses !== false;
  var yedek = function () { if (!a.son) titre(a.e === 30 || a.e === 10 ? [60] : [30]); };
  if (sesli && !dinleyen && konus(a.t, yedek)) return;
  yedek();
}
function gorsel(t) {
  durumYazi = t; clearTimeout(gorZ);
  gorZ = setTimeout(function () { if (durumYazi === t) { durumYazi = ''; durumGuncelle(); } }, 3000);
  durumGuncelle();
}

/* ---------- durum ---------- */
var acik = false, kok = null, ei = 0, sonKalan = null, sonBitis = 0, tikId = null, dinleyen = null, geriFn = null, geriZ = null, onizZ = null, gorZ = null, eiAd = null, bekleyen = null, metinSon = '', durumYazi = '';
function A() { return AT.S && AT.S.active; }
function kim() { var a = A(); return a ? a.id + '|' + ei : ''; }
function sheetAcik() { var e = D && D.getElementById && D.getElementById('sheet'); return !!e && !e.hidden; }
function restKapat() { if (rest().acik) AT.islem['rest-kapat']({}); sonKalan = null; if (AT.uyanikKontrol) AT.uyanikKontrol(); }   /* Wake Lock Salon açıkken bırakılmaz */
function sonrakiGit() { var a = A(); if (!a) return; var j = siradaki(a, ei); if (j >= 0) ei = j; restKapat(); ciz(); }
function sayi(s) { var v = AT.num(s); return isFinite(v) ? v : NaN; }
function bitenMi(e) { var w = e.sets.filter(function (x) { return x.tip !== 'isinma'; }); return w.length > 0 && w.every(function (x) { return x.done; }); }
function kalanSet(e) { return e.sets.filter(function (x) { return !x.done && x.tip !== 'isinma'; }).length + e.sets.filter(function (x) { return !x.done && x.tip === 'isinma'; }).length; }
function siradaki(a, bas) {
  for (var k = 1; k <= a.exs.length; k++) { var x = (bas + k) % a.exs.length; if (a.exs[x].sets.some(function (y) { return !y.done; })) return x; }
  return -1;
}
function setIdx(e) { for (var i = 0; i < e.sets.length; i++) if (!e.sets[i].done) return i; return -1; }
function toplamKalan(a) { return a.exs.reduce(function (t, e) { return t + e.sets.filter(function (s) { return !s.done; }).length; }, 0); }
function rest() { return AT.restDurum ? AT.restDurum() : { acik: false }; }
function kalanSn(r) { return Math.ceil((r.bitis - Date.now()) / 1000); }
function ydk(sn) { sn = Math.max(0, sn); return Math.floor(sn / 60) + ':' + AT.p2(sn % 60); }

/* ---------- çizim ---------- */
var IK_MIK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
var IK_TIK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var IK_KAPAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function blok(alan, ad, deger, ipucu, e, si) {
  var p = ' data-act="salon-adj" data-alan="' + alan + '" data-y="';
  return '<div class="sl-blok"><button type="button" class="sl-pm"' + p + '-1" aria-label="' + AT.h(ad) + ' azalt">−</button>' +
    '<div class="sl-deger"><b class="sl-say' + (deger === '' ? ' ipucu' : '') + '" data-alan="' + alan + '">' + AT.h(deger === '' ? (ipucu || '–') : deger) + '</b><small>' + ad + '</small></div>' +
    '<button type="button" class="sl-pm"' + p + '1" aria-label="' + AT.h(ad) + ' artır">+</button></div>';
}
function restHtml(r) {
  if (!r.acik) return '';
  var k = kalanSn(r), bitti = k <= 0;
  return '<div class="sl-rest' + (bitti ? ' bitti' : '') + '" data-rest="' + (bitti ? 'b' : 's') + '"><span class="sl-rest-t"><small>' + (bitti ? 'Dinlenme bitti' : 'Dinlenme') + '</small><b class="sl-sn">' + (bitti ? '+' + ydk(-k) : ydk(k)) + '</b></span>' +
    '<span class="sl-rest-d">' + (bitti ? '' : '<button type="button" data-act="salon-rest" data-d="-15" aria-label="15 saniye azalt">−15</button><button type="button" data-act="salon-rest" data-d="15" aria-label="15 saniye ekle">+15</button>') +
    '<button type="button" data-act="salon-rest" data-d="0">' + (bitti ? 'Tamam' : 'Geç') + '</button></span></div>';
}
function govde() {
  var a = A(); if (!a || !a.exs.length) return '<p class="sl-bos">Antrenmanda hareket yok</p>';
  ei = Math.max(0, Math.min(a.exs.length - 1, ei));
  var e = a.exs[ei]; eiAd = e.ad; var si = setIdx(e), hepsi = toplamKalan(a) === 0, r = rest();
  var isNo = 0, nIs = e.sets.filter(function (x) { return x.tip !== 'isinma'; }).length;
  for (var i = 0; i <= si && i >= 0; i++) if (e.sets[i].tip !== 'isinma') isNo++;
  var o = '<header class="sl-ust"><div class="sl-baslik"><small>' + (ei + 1) + ' / ' + a.exs.length + (si >= 0 ? ' · ' + (e.sets[si].tip === 'isinma' ? 'Isınma seti' : 'Set ' + isNo + ' / ' + nIs) : ' · bitti') + '</small><b>' + AT.h(e.ad) + '</b></div>' +
    '<button type="button" class="sl-cik" data-act="salon-cik" aria-label="Salon modundan çık">' + IK_KAPAT + '</button></header>';
  if (hepsi) {
    o += '<div class="sl-orta sl-hepsi"><span class="sl-hepsi-tik" aria-hidden="true">' + IK_TIK + '</span><b>Hepsi bitti</b></div><button type="button" class="sl-tamam" data-act="salon-cik"><span>Antrenmanı bitirmeye dön</span></button>';
  } else if (si < 0) {
    var j = siradaki(a, ei);
    o += '<div class="sl-orta sl-hepsi"><span class="sl-hepsi-tik" aria-hidden="true">' + IK_TIK + '</span><b>Hareket bitti</b></div>' + restHtml(r) +
      '<button type="button" class="sl-tamam" data-act="salon-sonraki"><span>Sıradaki: ' + AT.h(j >= 0 ? a.exs[j].ad : '') + '</span></button>';
  } else {
    var s = e.sets[si], pv = AT.setHedef ? AT.setHedef(ei, si) : null;
    o += '<div class="sl-orta">' + blok('kg', 'kg', String(s.kg).replace('.', ','), pv ? fm(AT.num(pv.kg)) : '', e, si) + '<span class="sl-x" aria-hidden="true">×</span>' +
      blok('reps', 'tekrar', String(s.reps), pv ? String(pv.reps) : (e.hedef || ''), e, si) + '</div>' + restHtml(r) +
      '<button type="button" class="sl-tamam" data-act="salon-tamam" aria-label="Seti bitir"><span>' + IK_TIK + 'Seti bitir</span></button>';
  }
  var mik = srVar() ? '<button type="button" class="sl-mik' + (dinleyen ? ' dinliyor' : '') + '" data-act="salon-mik" aria-pressed="' + !!dinleyen + '" aria-label="Sesle komut ver">' + IK_MIK + '</button>' : '';
  o += '<footer class="sl-alt">' + mik + '<div class="sl-durum" aria-live="polite">' + durumHtml() + '</div></footer>';
  return o;
}
function durumHtml() {
  if (bekleyen) return '<span>' + AT.h(bekleyen.eylem.onizleme || bekleyen.eylem.ozet || '') + '</span><button type="button" data-act="salon-iptal">İptal</button>';
  if (geriFn) return '<span>' + AT.h(geriFn.ozet) + '</span><button type="button" data-act="salon-geri">Geri al</button>';
  if (dinleyen) return '<span>' + AT.h(metinSon || 'Dinliyorum…') + '</span>';
  return '<span class="sl-sess">' + AT.h(durumYazi) + '</span>';
}
function ciz() {
  if (!acik || !kok) return;
  kok.innerHTML = govde();
}
function durumGuncelle() { var d = kok && kok.querySelector('.sl-durum'); if (d) d.innerHTML = durumHtml(); var m = kok && kok.querySelector('.sl-mik'); if (m) { m.classList.toggle('dinliyor', !!dinleyen); m.setAttribute('aria-pressed', dinleyen ? 'true' : 'false'); } }

/* ---------- eylemler ---------- */
function anlik() { var a = A(); if (!a) return null; var e = a.exs[ei]; return e ? { a: a, e: e, si: setIdx(e) } : null; }
/* hedefli geri alma: eylemden önce her setin anlık görüntüsü; sonra yalnız DEĞİŞEN (ya da eklenen) setler geri alınır.
   Araya başka değişiklik girdiyse (set nesnesi gitti: eşitleme; içeriği değişti: elle düzenleme) hiçbir şey ezilmez. */
function snap() {
  var a = A(); if (!a) return null;
  return { id: a.id, l: a.exs.map(function (e) { return { e: e, n: e.sets.length, o: e.sets.slice(), j: e.sets.map(function (x) { return JSON.stringify(x); }) }; }) };
}
function fark(sn) {
  var a = A(), d = []; if (!sn || !a || a.id !== sn.id) return d;
  sn.l.forEach(function (x) {
    if (a.exs.indexOf(x.e) < 0) return;
    x.e.sets.forEach(function (st, i) {
      if (i >= x.n || x.o[i] !== st) d.push({ e: x.e, s: st, ekle: true });
      else if (JSON.stringify(st) !== x.j[i]) d.push({ e: x.e, s: st, once: x.j[i] });
    });
  });
  d.forEach(function (c) { c.sonra = JSON.stringify(c.s); });
  return d;
}
function geriVer(ozet, sn, restTamam) {
  var d = fark(sn); if (!d.length) return;
  clearTimeout(geriZ);
  geriFn = { ozet: ozet, f: function () {
    var a = A(), temiz = !!a && a.id === sn.id && d.every(function (c) { return a.exs.indexOf(c.e) >= 0 && c.e.sets.indexOf(c.s) >= 0 && JSON.stringify(c.s) === c.sonra; });
    if (!temiz) { durumYazi = 'Araya değişiklik girdi, geri alınamadı'; durumGuncelle(); return; }
    d.forEach(function (c) {
      if (c.ekle) c.e.sets.splice(c.e.sets.indexOf(c.s), 1);
      else { Object.keys(c.s).forEach(function (k) { delete c.s[k]; }); Object.assign(c.s, JSON.parse(c.once)); }
    });
    if (restTamam) restKapat();
    AT.kaydet(true); AT.render(); sonKalan = null; ciz(); durumGuncelle();
  } };
  geriZ = setTimeout(function () { geriFn = null; durumGuncelle(); }, 7000);
}
function tamamla() {
  var x = anlik(); if (!x || x.si < 0) return false;
  var e0 = ei;
  AT.islem.tamam({ e: String(ei), s: String(x.si) });
  var s = x.e.sets[x.si];
  if (!s || !s.done) { return false; }   /* doğrulama hatası: app.js toast gösterdi */
  if (bitenMi(x.e)) { var j = siradaki(x.a, e0); if (j >= 0 && AT.S.active.exs[j]) { /* hareket bitti: kartta kalır, Sıradaki düğmesi çıkar */ } }
  sonKalan = null;
  return true;
}
function uygula(ey) {
  var x = anlik(); if (!x) return;
  var sn = snap(), ozet = ey.ozet || '';
  if (ey.tur === 'cik') return kapat();
  if (ey.tur === 'geri') { if (geriFn) { var f = geriFn.f; geriFn = null; f(); } return; }
  if (ey.tur === 'sonraki') return sonrakiGit();
  if (ey.tur === 'onceki') { if (ei > 0) { ei--; ciz(); } return; }
  if (ey.tur === 'dinlenGec') { restKapat(); ciz(); return; }
  if (ey.tur === 'dinlen') { var rr = rest(); if (rr.acik) { AT.islem['rest-ekle']({ d: String(ey.sn - Math.max(0, kalanSn(rr))) }); sonKalan = null; } ciz(); return; }
  if (ey.tur === 'setekle') {
    AT.islem['set-ekle']({ e: String(ei) });
    var ne = AT.S.active.exs[ei], ns = ne.sets[ne.sets.length - 1];
    if (ey.kg != null) ns.kg = fm(ey.kg); if (ey.reps != null) ns.reps = String(ey.reps);
    AT.kaydet(true); AT.render(); ciz(); geriVer(ozet, sn); durumGuncelle(); return;
  }
  if (x.si < 0) return ey.tur === 'tamam' ? sonrakiGit() : undefined;
  var s = x.e.sets[x.si];
  if (ey.tur === 'deger') {
    if (ey.kg != null) s.kg = fm(ey.kg);
    if (ey.reps != null) s.reps = String(ey.reps);
    AT.kaydet(true);
    if (ey.tamam) { if (!tamamla()) { ciz(); return; } }
    else AT.render();
  } else if (ey.tur === 'tamam') { if (!tamamla()) return; }
  ciz(); geriVer(ozet, sn, ey.tamam || ey.tur === 'tamam'); durumGuncelle();
}
function dene(metin) {
  var ey = komut(metin);
  if (ey.tur === 'bilinmiyor') { durumYazi = ey.neden || 'Anlayamadım: “60 8”, “bitti”, “sonraki”'; metinSon = ''; bekleyen = null; durumGuncelle(); return; }
  if (ey.tur === 'geri') return uygula(ey);
  clearTimeout(onizZ); metinSon = '';
  bekleyen = { eylem: ey, k: kim() };
  durumGuncelle();
  /* belirsiz tek sayı ("68" = 60 × 8 mi?) 1,5 sn; sheet açıkken bekleyen işlem duraklar; hareket/antrenman değiştiyse atılır */
  (function planla(ms) {
    onizZ = setTimeout(function () {
      var b = bekleyen; if (!b) return;
      if (sheetAcik()) return planla(300);
      bekleyen = null; if (acik && b.k === kim()) uygula(b.eylem); durumGuncelle();
    }, ms);
  })(ey.belirsiz ? 1500 : 1000);
}

/* ---------- mikrofon ---------- */
var SES_HATA = { 'not-allowed': 'Mikrofon izni verilmedi', 'service-not-allowed': 'Mikrofon izni verilmedi', 'no-speech': 'Ses duyulmadı', 'audio-capture': 'Mikrofon bulunamadı', network: 'Ses tanıma için internet gerekli' };
function dinle() {
  if (dinleyen) { try { dinleyen.stop(); } catch (e) { } return; }
  var C = srVar(); if (!C) return;
  try { if (W.speechSynthesis) W.speechSynthesis.cancel(); } catch (e) { }
  var r = new C(), son = '', hata = null, k0 = kim();
  r.lang = 'tr-TR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; son = t.trim(); metinSon = son; durumGuncelle(); };
  r.onerror = function (ev) { hata = ev && ev.error || 'diger'; };
  r.onend = function () {
    if (!acik || dinleyen !== r) return;   /* Salon kapandı / yeni oturum: eski sonuç atılır */
    dinleyen = null; durumGuncelle();
    if (kim() !== k0) { metinSon = ''; durumGuncelle(); return; }   /* hareket ya da antrenman değişti */
    if (hata && hata !== 'aborted') { durumYazi = SES_HATA[hata] || 'Ses tanınamadı'; metinSon = ''; return durumGuncelle(); }
    if (!son) { durumYazi = 'Ses duyulmadı'; return durumGuncelle(); }
    dene(son);
  };
  bekleyen = null; clearTimeout(onizZ); durumYazi = ''; metinSon = '';   /* geriFn kalır: sesle "geri al" çalışsın */
  try { r.start(); } catch (e) { durumYazi = 'Mikrofon başlatılamadı'; return durumGuncelle(); }
  dinleyen = r; durumGuncelle();
}

/* ---------- aç / kapat / saniye tıkı ---------- */
function tik() {
  var a = A(); if (!a) return kapat();
  var r = rest(), k = r.acik ? kalanSn(r) : null;
  if (r.acik) {
    if (r.bitis !== sonBitis) { sonBitis = r.bitis; sonKalan = null; }
    var d = kok && kok.querySelector('.sl-rest'), durum = k <= 0 ? 'b' : 's';
    if (!d || d.dataset.rest !== durum) { ciz(); d = kok && kok.querySelector('.sl-rest'); }
    var sn = d && d.querySelector('.sl-sn'); if (sn) { var yz = k <= 0 ? '+' + ydk(-k) : ydk(k); if (sn.textContent !== yz) sn.textContent = yz; }
    if (sonKalan != null && !sheetAcik()) bildir(anons(sonKalan, k, Math.round(r.sure / 1000), toplamKalan(a) === 1));
    sonKalan = k;
  } else if (kok && kok.querySelector('.sl-rest')) { sonKalan = null; ciz(); }
}
function ac() {
  var a = A(); if (acik || !a || !a.exs.length || !D) return;
  acik = true;
  var g = AT.gorunenEgz && AT.gorunenEgz(), gi = g ? a.exs.map(function (x) { return x.ad; }).indexOf(g) : -1;
  ei = gi >= 0 && a.exs[gi].sets.some(function (y) { return !y.done; }) ? gi : Math.max(0, siradaki(a, -1));
  if (ei < 0) ei = 0;
  kok = D.createElement('div'); kok.id = 'salon'; kok.className = 'salon'; kok.setAttribute('role', 'dialog'); kok.setAttribute('aria-modal', 'true'); kok.setAttribute('aria-label', 'Salon modu');
  D.body.appendChild(kok); D.documentElement.classList.add('salon-acik');
  durumYazi = ''; metinSon = ''; sonKalan = null; sonBitis = 0;
  /* iOS: sentez ilk kez kullanıcı dokunuşunda "açılmalı" */
  try { if (sentezVar()) { var u = new W.SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'tr-TR'; W.speechSynthesis.speak(u); } } catch (x) { }
  if (AT.uyanikTut) AT.uyanikTut(true);
  ciz(); tikId = setInterval(tik, 250);
  var b = kok.querySelector('.sl-tamam'); if (b && b.focus) b.focus({ preventScroll: true });
}
function kapat() {
  if (!acik) return;
  acik = false; clearInterval(tikId); clearTimeout(onizZ); clearTimeout(geriZ); clearTimeout(gorZ);
  bekleyen = null; geriFn = null;
  if (dinleyen) { try { dinleyen.abort(); } catch (e) { } dinleyen = null; }
  try { if (W.speechSynthesis) W.speechSynthesis.cancel(); } catch (e) { }
  if (kok && kok.remove) kok.remove(); kok = null; if (D) D.documentElement.classList.remove('salon-acik');
  var a = A(), son = ei;
  if (a) { AT.render(); if (AT.islem['sahne-git'] && !AT.masaustu()) AT.islem['sahne-git']({ e: String(Math.min(son, a.exs.length)) }); }
  if (AT.uyanikKontrol) AT.uyanikKontrol();
}

/* ---------- olaylar ---------- */
AT.islem['salon-ac'] = ac;
AT.islem['salon-cik'] = kapat;
AT.islem['salon-tamam'] = function () { var x = anlik(); if (!x || x.si < 0) return; var sn = snap(); if (tamamla()) { ciz(); geriVer('Set işaretlendi', sn, true); durumGuncelle(); } };
AT.islem['salon-sonraki'] = sonrakiGit;
AT.islem['salon-adj'] = function (d) {
  var x = anlik(); if (!x || x.si < 0) return;
  AT.islem.adj({ e: String(ei), s: String(x.si), alan: d.alan, y: d.y });
  var s = x.e.sets[x.si], b = kok && kok.querySelector('.sl-say[data-alan="' + d.alan + '"]');
  if (b) { b.textContent = String(s[d.alan]).replace('.', ','); b.classList.remove('ipucu'); }
};
AT.islem['salon-rest'] = function (d) {
  var n = +d.d; if (!n) { restKapat(); return ciz(); }
  AT.islem['rest-ekle']({ d: String(n) }); sonKalan = null;
};
AT.islem['salon-mik'] = dinle;
AT.islem['salon-iptal'] = function () { clearTimeout(onizZ); bekleyen = null; durumYazi = ''; durumGuncelle(); };
AT.islem['salon-geri'] = function () { clearTimeout(geriZ); if (geriFn) { var f = geriFn.f; geriFn = null; f(); } };
if (D) D.addEventListener('keydown', function (ev) { if (acik && ev.key === 'Escape') kapat(); });

AT.bolum.salonDugme = function () { return '<button type="button" class="mini btn-ghost salon-ust" data-act="salon-ac" aria-label="Salon modu: tam ekran, eller serbest">Salon</button>'; };
AT.salonAcik = function () { return acik; };
AT.salonAnonsVar = function () { return acik && !!AT.S && AT.S.ses !== false && sentezVar(); };
/* app.js render() sonu: katman güncel veriden yeniden çizilir (eşitleme, geri al, başka yoldan değişiklik); antrenman kalktıysa kapanır */
AT.salonYenile = function () {
  if (!acik) return;
  var a = A(); if (!a || !a.exs.length) return kapat();
  if (!a.exs[ei] || a.exs[ei].ad !== eiAd) {
    var i = eiAd == null ? -1 : a.exs.map(function (x) { return x.ad; }).indexOf(eiAd);
    ei = i >= 0 ? i : Math.max(0, siradaki(a, -1));
  }
  ciz();
};
AT._salon = {
  komut: komut, anons: anons, ESIKLER: ESIKLER, srVar: srVar, sentezVar: sentezVar, titreVar: titreVar, konus: konus, bildir: bildir,
  durum: function () { return { acik: acik, ei: ei, dinleyen: !!dinleyen, bekleyen: bekleyen && bekleyen.eylem, geri: !!geriFn }; },
  govde: govde, dene: dene, snap: snap, sheetAcik: sheetAcik, uygula: uygula, ac: ac, kapat: kapat, tik: tik
};
})(window.AT);
