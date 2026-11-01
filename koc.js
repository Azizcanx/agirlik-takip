/* koc.js: modül (window.AT'ye kayıt olur). İsteğe bağlı yapay zekâ koçu, Defter'de "Koça sor".
   Kapalıyken hiçbir istek gitmez; uygulamanın geri kalanı kural tabanlı ve internetsiz kalır.
   Sağlayıcılar:
   - API (kullanıcının kendi anahtarıyla, tarayıcıdan doğrudan; sunucu yok): Gemini (ücretsiz katman), OpenAI ve DeepSeek (ücretli).
     Gemini: generativelanguage.googleapis.com …:streamGenerateContent?alt=sse, anahtar x-goog-api-key başlığında (URL'de değil).
     OpenAI / DeepSeek: OpenAI uyumlu /chat/completions, stream:true, Authorization: Bearer.
     30 sn sessizlikte zaman aşımı (AbortController); cevap akışla yazılır.
   - Anahtarsız (ChatGPT / Claude aboneliği): API çağrısı yok. Soru + kısa özet panoya kopyalanır ve sitenin ?q= adresi açılır
     (adres URL_SINIR'ı aşarsa yalnız site açılır, "panoya kopyalandı"). Cevap otomatik gelmez: notta "Cevabı yapıştır".
   - PC yerel (yalnız localhost, pc/sunucu.ps1 /__koc): bu PC'deki Claude aboneliği ya da Codex (ChatGPT oturumu); jeton yalnız bellekte.
   Ayar: localStorage 'agirlik-koc' = {s: sağlayıcı, a?: anahtar, m?: çalışan model, son?: son başarılı deneme ms, hata?: 'anahtar'|'bakiye'}.
   Cihaza özel: esitle VERI'ye girmez; "Tüm verileri sil" siler; PC → telefon bağlantı linkiyle (#esitle=) taşınabilir (AT.kocLink/kocAl).
   Defter kaydı: S.defter'e {id, t, d, metin: cevap ('' = anahtarsız modda henüz yapıştırılmadı), koc: {s: soru, model, ss: sağlayıcı}}.
   Bağlam: son 8 haftanın kısa özeti (AT.* hesaplarından; ham geçmiş/CSV gitmez), API'de ≤ BUTCE bayt, anahtarsızda ≤ BUTCE_KISA.
   Güvenlik: anahtar konsola, hata metnine, URL'ye yazılmaz; cevap AT.h ile kaçışlı, yalnız **kalın**, başlık ve madde biçimi. */
(function (AT) {
'use strict';

var LS = 'agirlik-koc', BUTCE = 5600, BUTCE_KISA = 1500, URL_SINIR = 6000, MAX_CEVAP = 10000, PENCERE = 56;
var ZAMAN = 30000;
var SAG = {
  gemini: { ad: 'Gemini', tur: 'api', alt: 'ücretsiz anahtar', model: 'gemini-3.8-flash', yedek: 'gemini-flash-latest',
    link: 'https://aistudio.google.com/apikey', linkAd: 'Google AI Studio\'dan ücretsiz anahtar al' },
  openai: { ad: 'OpenAI', tur: 'api', alt: 'ücretli', model: 'gpt-6-luna', url: 'https://api.openai.com/v1/chat/completions',
    link: 'https://platform.openai.com/api-keys', linkAd: 'OpenAI\'dan anahtar al' },
  deepseek: { ad: 'DeepSeek', tur: 'api', alt: 'ücretli', model: 'deepseek-flash', url: 'https://api.deepseek.com/chat/completions',
    link: 'https://platform.deepseek.com/api_keys', linkAd: 'DeepSeek\'ten anahtar al' },
  chatgpt: { ad: 'ChatGPT', tur: 'web', alt: 'Plus hesabınla, anahtarsız', q: 'https://chatgpt.com/?q=', bos: 'https://chatgpt.com/',
    link: 'https://chatgpt.com/auth/login', linkAd: 'ChatGPT\'ye Google hesabınla giriş yap / hesap aç',
    sor: 'ChatGPT\'ye sor', soruldu: 'ChatGPT\'ye soruldu', yonelme: 'ChatGPT\'ye' },
  claude: { ad: 'Claude', tur: 'web', alt: 'abonelik hesabınla, anahtarsız', q: 'https://claude.ai/new?q=', bos: 'https://claude.ai/new',
    link: 'https://claude.ai/login', linkAd: 'Claude\'a Google hesabınla giriş yap / hesap aç',
    sor: 'Claude\'a sor', soruldu: 'Claude\'a soruldu', yonelme: 'Claude\'a' }
};
/* PC yerel koç (pc/sunucu.ps1, localhost): bu PC'deki Claude aboneliği ya da ChatGPT oturumu (Codex), anahtarsız. Sözleşme:
   GET /__koc/durum → {var:true, anahtar:jeton, motorlar:['claude','codex'], model?} | {var:false, neden};
   POST /__koc (X-Koc-Anahtar: jeton) {istem, motor} → {cevap} | {hata}
   (401/403 jeton, 409 meşgul, 413 büyük, 500, 504 sunucuda 120 sn). Jeton yalnız bellekte; 401'de bir kez tazelenir. Akış yok. */
SAG['pc-claude'] = { ad: 'Claude', tur: 'yerel', motor: 'claude', yonelme: 'Claude\'a', alt: 'bu PC\'deki abonelik (anahtarsız)' };
SAG.codex = { ad: 'Codex', tur: 'yerel', motor: 'codex', yonelme: 'Codex\'e', alt: 'bu PC\'deki ChatGPT oturumu (anahtarsız)' };
var CODEX_ZAMAN = 130000;
var SIRA = ['pc-claude', 'codex', 'gemini', 'openai', 'deepseek', 'chatgpt', 'claude'];
var CIPLER = ['Bugün ne yapayım?', 'Bulk nasıl gidiyor?', 'Hangi kası ihmal ediyorum?'];
var GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

var KURALLAR = 'Kanıta dayalı eşikler: bulkta kilo artışı haftada vücut ağırlığının %0,25–0,5\'i (cutta kayıp %0,5–1); ' +
  'kas başına haftada 5–10 iş seti en verimli dilim (uygulamanın hedefi 10), ~4 set en küçük etkili doz, hacim eşitken sıklık önemsiz; ' +
  'protein günde ~1,6–2,2 g/kg (uygulama 1,8 kullanır), günlük toplam önemli; çift ilerleme: 8–12 tekrar, tüm setler 12\'ye varınca ağırlığı artır; ' +
  'setleri başarısızlığa 1–2 tekrar kala bitirmek yeterli; dinlenme 90 sn civarı yeterli; 28 güne kadar arada güç kaybı önemsiz.';
var SISTEM = 'Sen "Ağırlık Takip" uygulamasındaki kişisel antrenman koçusun. Kullanıcıyla Türkçe, samimi ve kısa konuş. ' +
  'Kısa ve somut ol: en fazla 120 kelime, madde işaretini az kullan, önemli sayıyı **kalın** yaz. ' +
  'Yalnız VERİ bölümündeki bilgilere dayan; veride olmayan sayı, rekor ya da geçmiş uydurma, bilmiyorsan "veride yok" de. ' +
  KURALLAR + ' Tıbbi teşhis koyma; ağrı, sakatlık, uyuşma ya da baş dönmesi gibi durumlarda o hareketi zorlamamasını ve doktora ya da fizyoterapiste görünmesini söyle. ' +
  'Uygulamada olmayan bir özelliği varmış gibi anlatma.';
var SISTEM_KISA = 'Ağırlık Takip uygulamamın verisi aşağıda. Kısa ve somut bir antrenman koçu gibi Türkçe cevap ver: en fazla 120 kelime, ' +
  'yalnız bu veriye dayan, sayı uydurma. Eşikler: bulk haftada kilonun %0,25–0,5\'i; kas başına haftada 5–10 set; protein 1,6–2,2 g/kg; ' +
  '8–12 tekrarla çift ilerleme. Ağrı/sakatlıkta teşhis koyma, doktora yönlendir.';

/* ---------- ayar (yalnız bu cihaz) ---------- */
function ayar() {
  try { var a = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
  if (!a || !SAG[a.s]) return null;
  if (SAG[a.s].tur === 'api' && !(typeof a.a === 'string' && a.a)) return null;
  return a;
}
function ayarYaz(a) { try { if (a) localStorage.setItem(LS, JSON.stringify(a)); else localStorage.removeItem(LS); } catch (e) {} }
/* Defter'de düğme: anahtarsız mod her zaman; Codex yalnız bu PC'de (sunucu "yok" demediyse); API modunda anahtar geçersiz değilse */
function bagli() {
  var a = ayar(); if (!a) return false;
  var tur = SAG[a.s].tur;
  return tur === 'web' || (tur === 'yerel' ? yerelMi() && !(codex && !yerelVar(a.s)) : a.hata !== 'anahtar');
}

/* ---------- Codex durumu (yalnız localhost; telefonda/GitHub Pages'te hiç sorulmaz) ---------- */
var codex = null, codexSorgu = null;   /* codex: {var, anahtar, model, neden} son durum (yalnız bellek) */
function yerelMi() { try { return /^(localhost|127.0.0.1)$/.test(location.hostname) && location.port === '8770'; } catch (e) { return false; } }   /* yalnız pc/sunucu.ps1 (8770); test sunucularında yoklama yok */
/* yerel motor sunucuda var mı (s: 'pc-claude' | 'codex') */
function yerelVar(s) { return yerelMi() && !!codex && !!codex.var && !!SAG[s] && codex.motorlar.indexOf(SAG[s].motor) >= 0; }
function ilkYerel() { for (var i = 0; i < SIRA.length; i++) if (SAG[SIRA[i]].tur === 'yerel' && yerelVar(SIRA[i])) return SIRA[i]; return null; }
function codexDurum(tazele) {
  if (!yerelMi()) return Promise.resolve(null);
  if (codexSorgu && !tazele) return codexSorgu;
  codexSorgu = Promise.resolve().then(function () { return fetch('/__koc/durum', { cache: 'no-store', credentials: 'same-origin' }); })
    .then(function (r) { return r && r.ok ? r.json() : null; })
    .then(function (j) { codex = j && j.var === true && typeof j.anahtar === 'string' ? { var: true, anahtar: j.anahtar, model: String(j.model || ''), motorlar: Array.isArray(j.motorlar) ? j.motorlar.map(String) : ['codex'] } : { var: false, neden: j && j.neden ? String(j.neden) : '' }; return codex; },
      function () { codex = { var: false, neden: '' }; return codex; });
  return codexSorgu;
}
function codexIstek(s, istem, o) {
  var ctl = new AbortController(), zaman = false;
  if (o.is) { o.is.ctl = ctl; if (o.is.iptal) return Promise.reject(hata('iptal')); }
  var t = setTimeout(function () { zaman = true; ctl.abort(); }, CODEX_ZAMAN);
  var p;
  try { p = fetch('/__koc', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Koc-Anahtar': codex.anahtar }, body: JSON.stringify({ istem: istem, motor: SAG[s].motor }), signal: ctl.signal, cache: 'no-store' }); }
  catch (e) { p = Promise.reject(e); }
  return p.then(function (r) {
    if (!r.ok) { var st = r.status; throw hata(st === 401 || st === 403 ? 'cx-jeton' : st === 409 ? 'cx-mesgul' : st === 413 ? 'cx-buyuk' : st === 504 ? 'cx-zaman' : 'cx-hata'); }
    return r.json().then(function (j) { return j && typeof j.cevap === 'string' ? j.cevap : ''; }, function () { throw hata('cx-hata'); });
  }).then(function (m) { clearTimeout(t); return m; }, function (e) {
    clearTimeout(t);
    if (o.is && o.is.iptal) throw hata('iptal');
    if (e && e.kod) throw e;
    throw hata(zaman ? 'cx-zaman' : 'cx-yok');
  });
}
/* jetonsuzsa önce durum; 401/403'te durum bir kez tazelenip yeniden denenir */
function codexCagir(s, istem, o) {
  o = o || {};
  var model = function () { return SAG[s].motor + (codex && codex.model ? ' · ' + codex.model : ''); };
  var hazir = function (tazele) { return codexDurum(tazele).then(function () { if (!yerelVar(s)) throw hata('cx-kapali'); }); };
  return (yerelVar(s) ? Promise.resolve() : hazir(true)).then(function () { return codexIstek(s, istem, o); })
    .catch(function (e) { if (e.kod !== 'cx-jeton') throw e; return hazir(true).then(function () { return codexIstek(s, istem, o); }); })
    .then(function (m) { return { metin: m, model: model() }; });
}

/* ---------- küçük yardımcılar ---------- */
function gunEkle(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function gunFark(a, b) { return Math.round((AT.parse(a) - AT.parse(b)) / 864e5); }
function bayt(s) { return typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length; }
function kisalt(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function temizle(m) { return String(m == null ? '' : m).replace(/\r\n?/g, '\n').trim().slice(0, MAX_CEVAP); }
function f1(n) { return AT.fmt(n, 1); }
function isaretli(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + AT.fmt(Math.abs(n), d); }
function hata(kod) { var e = new Error(kod); e.kod = kod; return e; }
function saat(ts) { var d = new Date(+ts || 0); return AT.p2(d.getHours()) + ':' + AT.p2(d.getMinutes()); }

/* ---------- bağlam: son 8 haftanın kısa özeti ---------- */
function setE1(s) { return AT.tahminiMax(AT.num(s.kg), AT.num(s.reps), s.rpe) || 0; }
function enIyiSet(sets) {
  var b = null, bv = -1;
  sets.forEach(function (s) { var v = setE1(s) * 1000 + AT.num(s.kg) * AT.num(s.reps) / 1000 + AT.num(s.reps) / 1e6; if (v > bv) { bv = v; b = s; } });
  return b;
}
function setYaz(s) { var kg = AT.num(s.kg); return (kg > 0 ? f1(kg) : 'VA') + '×' + AT.num(s.reps); }
/* n noktadan k tanesi: ilk, son ve aradan eşit aralıklı */
function ornekle(l, k) {
  if (l.length <= k) return l.slice();
  var o = []; for (var i = 0; i < k; i++) o.push(l[Math.round(i * (l.length - 1) / (k - 1))]); return o;
}
/* bölümler: {b: başlık, l: satırlar, min: en az kalacak satır}; bütçe aşılırsa KES sırasıyla sondan satır atılır */
function metinOf(bl) {
  return bl.filter(function (x) { return x.l.length; }).map(function (x) { return (x.b ? x.b + '\n' : '') + x.l.join('\n'); }).join('\n\n');
}
function guvenli(f) { try { return f(); } catch (e) { return null; } }

function baglam(S, bugun, kisa) {
  S = S || {}; bugun = bugun || AT.iso(new Date());
  var canli = S === AT.S;   /* uygulama durumu: önbellekli AT.* hesapları (bulkDurum, notlar, bitenSeanslar); başka S (test) yalnız kendinden */
  var bas = gunEkle(bugun, -(PENCERE - 1)), d0 = AT.parse(bugun), H = AT.bulkHesap || {};
  var genel = { b: '', l: ['Bugün: ' + bugun + ' ' + GUNLER[d0.getDay()]] };
  var kilo = { b: 'KİLO VE SEZON', l: [] }, kal = { b: 'KALORİ (son 14 gün)', l: [] }, ant = { b: 'ANTRENMAN (son 8 hafta)', l: [] };
  var har = { b: 'HAREKETLER (tahmini max eğilimi, eskiden yeniye)', l: [], min: 2 }, kas = { b: '', l: [] };
  var sea = { b: 'ANTRENMANLAR (yeniden eskiye; hareket en iyi set, parantezde iş seti)', l: [] };
  var not = { b: 'UYGULAMANIN KURAL TABANLI NOTLARI', l: [] }, dft = { b: 'DEFTER NOTLARI (son 7 gün)', l: [] };

  /* kilo + bulk */
  var bw = H.gecerli ? guvenli(function () { return H.gecerli(S.bw); }) || [] : [], ort = null;
  if (bw.length) {
    var son = bw[bw.length - 1];
    ort = guvenli(function () { return H.ortalamaKilo(bw); });
    kilo.l.push('Son tartı: ' + f1(son.kg) + ' kg (' + son.date + ', ' + gunFark(bugun, son.date) + ' gün önce)' + (ort ? '; ortalama kilo ' + f1(ort) + ' kg' : '') +
      '; son 28 günde ' + bw.filter(function (b) { return b.date > gunEkle(bugun, -28); }).length + ' tartı');
  }
  if (S.bulk) {
    var b = S.bulk, yon = b.hedefKg < b.basKg ? -1 : 1;
    kilo.l.push((yon > 0 ? 'Bulk' : 'Cut') + ' sezonu: başlangıç ' + b.bas + ' ' + f1(b.basKg) + ' kg, hedef ' + f1(b.hedefKg) + ' kg, hedef hız haftada ' + isaretli(+b.min, 2) + ' ile ' + isaretli(+b.max, 2) + ' kg');
    var bd = guvenli(function () { return AT.bulkDurum && canli ? AT.bulkDurum() : null; });
    var ay = H.hizAyrinti ? guvenli(function () { return H.hizAyrinti(bw, b.bas); }) : null;
    if (bd) {
      var DUR = { iyi: 'hedef aralıkta', yavas: 'yavaş', hizli: 'fazla hızlı', erken: 'ilk 14 gün, tahmin erken', veri: 'tartı verisi yetersiz ya da bayat' };
      var s1 = 'Sezon ortalama kilo ' + f1(bd.simdi) + ' kg (başlangıçtan ' + isaretli(bd.degisim, 1) + ')';
      if (bd.hiz != null) s1 += '; hız haftada ' + isaretli(bd.hiz, 2) + (ay && ay.se > 0 ? ' ± ' + AT.fmt(ay.se, 2) : '') + ' kg' + (bd.simdi > 0 ? ' (%' + AT.fmt(Math.abs(bd.hiz) / bd.simdi * 100, 2) + ')' : '');
      s1 += '; durum: ' + (DUR[bd.durum] || bd.durum);
      kilo.l.push(s1);
      var va = bd.varisAralik;
      if (va && va !== 'yok') kilo.l.push('Hedefe kalan ' + f1(Math.abs(bd.kalan)) + ' kg, bu hızla ~' + va.az + (va.cok !== va.az ? '–' + va.cok : '') + ' hafta');
      if (bd.hedefKcal != null) kilo.l.push('Uygulamanın kalori önerisi: günde ~' + AT.fmt(bd.hedefKcal, 0) + ' kcal' + (bd.tdee != null ? ' (tahmini harcama ~' + AT.fmt(bd.tdee, 0) + ')' : ''));
    }
  }
  /* kalori + makro */
  var kb = gunEkle(bugun, -14), kl = (S.kcal || []).filter(function (k) { return k && k.date >= kb && k.date < bugun && +k.kcal >= 300; });
  if (kl.length) kal.l.push('Ortalama ' + AT.fmt(Math.round(kl.reduce(function (t, k) { return t + +k.kcal; }, 0) / kl.length / 10) * 10, 0) + ' kcal/gün (' + kl.length + ' gün girilmiş)');
  var bk = (S.kcal || []).filter(function (k) { return k && k.date === bugun; })[0];
  if (bk && +bk.kcal > 0) kal.l.push('Bugün şu ana kadar ' + AT.fmt(+bk.kcal, 0) + ' kcal');
  var mo = H.makroOrt ? guvenli(function () { return H.makroOrt(S.kcal, bugun, 14); }) : null;
  if (mo) kal.l.push('Makro ortalaması (' + mo.gun + ' gün): protein ' + AT.fmt(mo.p, 0) + ' g' + (ort ? ' (' + AT.fmt(mo.p / ort, 1) + ' g/kg)' : '') + ', karbonhidrat ' + AT.fmt(mo.k, 0) + ' g, yağ ' + AT.fmt(mo.y, 0) + ' g');
  if (ort) kal.l.push('Protein hedefi (1,8 g/kg): ~' + Math.round(ort * 1.8 / 5) * 5 + ' g');

  /* antrenman */
  var tum = guvenli(function () { return canli && AT.bitenSeanslar ? AT.bitenSeanslar() : (S.sessions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }) || [];
  tum = tum.filter(function (se) { return se && se.date && se.date <= bugun && Array.isArray(se.exs); });
  var pen = tum.filter(function (se) { return se.date >= bas; });
  if (tum.length) {
    var sonS = tum[tum.length - 1];
    ant.l.push(pen.length + ' antrenman (haftada ort. ' + AT.fmt(pen.length / 8, 1) + '); son antrenman ' + sonS.date + ' "' + kisalt(sonS.name || 'Antrenman', 30) + '" (' + gunFark(bugun, sonS.date) + ' gün önce)');
  } else ant.l.push('Hiç antrenman kaydı yok');
  if (S.active) ant.l.push('Şu an süren bir antrenman var: "' + kisalt(S.active.name || 'Antrenman', 30) + '"');
  /* rekorlar (tüm geçmiş): hareket → {v, d} */
  var rek = {};
  tum.forEach(function (se) { se.exs.forEach(function (e) { AT.yapilanSetler(e).forEach(function (s) { var v = setE1(s); if (v > 0 && (!rek[e.ad] || v > rek[e.ad].v + 0.05)) rek[e.ad] = { v: v, d: se.date }; }); }); });
  /* hareket başına seans dizisi */
  var hm = {}, hs = [];
  pen.forEach(function (se) {
    se.exs.forEach(function (e) {
      var sets = AT.yapilanSetler(e); if (!sets.length) return;
      var x = hm[e.ad]; if (!x) { x = hm[e.ad] = { ad: e.ad, l: [] }; hs.push(x); }
      var en = enIyiSet(sets);
      x.l.push({ d: se.date, e1: setE1(en), r: AT.num(en.reps), set: setYaz(en), n: sets.length });
    });
  });
  hs.sort(function (a, b) { var x = a.l[a.l.length - 1].d, y = b.l[b.l.length - 1].d; return x < y ? 1 : x > y ? -1 : b.l.length - a.l.length; });
  hs.slice(0, kisa ? 6 : 12).forEach(function (x) {
    var sonx = x.l[x.l.length - 1], e1l = x.l.filter(function (p) { return p.e1 > 0; }), k = kisa ? 3 : 5;
    var t = x.ad + ' (' + AT.kasOf(x.ad) + ', ' + x.l.length + ' seans): ';
    if (e1l.length) t += 'tahmini max ' + ornekle(e1l, k).map(function (p) { return AT.fmt(p.e1, 0); }).join('→') + ' kg';
    else t += 'en iyi tekrar ' + ornekle(x.l, k).map(function (p) { return p.r; }).join('→');
    if (rek[x.ad]) t += '; rekor ' + AT.fmt(rek[x.ad].v, 0) + ' kg (' + rek[x.ad].d + ')';
    t += '; son ' + sonx.d + ': ' + sonx.set + ', ' + sonx.n + ' set';
    har.l.push(t);
  });
  /* son 7 gün kas başına iş seti (ana kas) */
  var k7 = gunEkle(bugun, -6), ks = {};
  (AT.KAS || []).forEach(function (k) { ks[k] = 0; });
  tum.filter(function (se) { return se.date >= k7; }).forEach(function (se) { se.exs.forEach(function (e) { var k = AT.kasOf(e.ad); ks[k] = (ks[k] || 0) + AT.yapilanSetler(e).length; }); });
  if (tum.length) kas.l.push('Son 7 günde ana kas başına iş seti: ' + Object.keys(ks).map(function (k) { return k + ' ' + ks[k]; }).join(', '));
  /* seans listesi (yalnız API modunda) */
  if (!kisa) pen.slice().reverse().forEach(function (se) {
    var p = se.exs.map(function (e) { var s = AT.yapilanSetler(e); return s.length ? kisalt(e.ad, 28) + ' ' + setYaz(enIyiSet(s)) + ' (' + s.length + ')' : ''; }).filter(Boolean);
    if (p.length) sea.l.push(se.date + ' ' + kisalt(se.name || 'Antrenman', 24) + ': ' + p.join(', '));
  });
  /* kural tabanlı notlar */
  var nl = guvenli(function () { return AT.notlar && canli ? AT.notlar(bugun) : []; }) || [];
  nl.slice(0, kisa ? 3 : 6).forEach(function (n) { not.l.push('- ' + kisalt(n.baslik, 90) + (kisa || !n.aciklama ? '' : ': ' + kisalt(n.aciklama, 160))); });
  /* defter: son 7 gün, yeniden eskiye; koç notlarından yalnız soru */
  var d7 = gunEkle(bugun, -6);
  (Array.isArray(S.defter) ? S.defter : []).filter(function (n) { return n && n.d >= d7 && n.d <= bugun; })
    .sort(function (a, b) { return (+b.t || 0) - (+a.t || 0); }).slice(0, kisa ? 3 : 10).forEach(function (n) {
      dft.l.push('- ' + n.d + ' ' + saat(n.t) + ': ' + (n.koc ? '(koça sordu) ' + kisalt(n.koc.s, kisa ? 80 : 140) : kisalt(n.metin, kisa ? 100 : 220)));
    });

  var bl = [genel, kilo, kal, ant, kas, har, not, dft, sea], butce = kisa ? BUTCE_KISA : BUTCE;
  var KES = [sea, dft, not, har, kal, kilo];
  var m = metinOf(bl);
  while (bayt(m) > butce) {
    var x = null;
    for (var i = 0; i < KES.length; i++) if (KES[i].l.length > (KES[i].min || 0)) { x = KES[i]; break; }
    if (!x) break;
    x.l.pop(); m = metinOf(bl);
  }
  /* son çare: bayt sınırına kırp (Türkçe harfler 2 bayt) */
  while (bayt(m) > butce) m = m.slice(0, m.length - Math.max(1, Math.ceil((bayt(m) - butce) / 2)));
  return m;
}
function kullaniciMetni(soru, ozet) { return 'VERİ:\n' + ozet + '\n\nSORU: ' + soru; }

/* ---------- API ---------- */
function istekKur(s, anahtar, model, sistem, metin, akis, ek, kucuk) {
  if (s === 'gemini') {
    var g = { systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: metin }] }], generationConfig: { maxOutputTokens: kucuk ? 64 : 2048 } };
    if (ek) g.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    return { url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + (akis ? ':streamGenerateContent?alt=sse' : ':generateContent'),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar }, body: JSON.stringify(g) };
  }
  var o = { model: model, messages: [{ role: 'system', content: sistem }, { role: 'user', content: metin }], stream: !!akis };
  if (s === 'openai') { o.max_completion_tokens = kucuk ? 64 : 1500; if (ek) o.reasoning_effort = 'low'; }
  else { o.max_tokens = kucuk ? 16 : 800; if (ek) o.thinking = { type: 'disabled' }; }
  return { url: SAG[s].url, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + anahtar }, body: JSON.stringify(o) };
}
/* yanıt gövdesinden metin parçası; hata nesnesi ya da engel → hata */
function parcaAl(j, s) {
  if (!j || typeof j !== 'object') return '';
  if (j.error) throw hata('yogun');
  if (s === 'gemini') {
    var c = j.candidates && j.candidates[0];
    if (!c && j.promptFeedback && j.promptFeedback.blockReason) throw hata('engel');
    var p = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
    return p.filter(function (x) { return x && !x.thought && typeof x.text === 'string'; }).map(function (x) { return x.text; }).join('');
  }
  var ch = j.choices && j.choices[0];
  return ch ? (ch.delta && typeof ch.delta.content === 'string' ? ch.delta.content : ch.message && typeof ch.message.content === 'string' ? ch.message.content : '') : '';
}
/* yanıtı oku: SSE (data: satırları) akışla; değilse tek JSON. parca(eklenen, toplam) her parçada */
function oku(r, s, parca) {
  var tum = '', tampon = '', ham = '';
  function satir(l) {
    l = l.replace(/\r$/, ''); if (l.indexOf('data:') !== 0) return;
    var v = l.slice(5).trim(); if (!v || v === '[DONE]') return;
    var j; try { j = JSON.parse(v); } catch (e) { return; }
    var x = parcaAl(j, s); if (x) { tum += x; parca(x, tum); }
  }
  function besle(str, son) {
    if (ham.length < 200000) ham += str;
    tampon += str; var l = tampon.split('\n'); tampon = son ? '' : l.pop(); l.forEach(satir);
  }
  function bitir() {
    if (!tum) { var t = ham.trim(); if (t.charAt(0) === '{' || t.charAt(0) === '[') { var j; try { j = JSON.parse(t); } catch (e) { j = null; } if (Array.isArray(j)) j.forEach(function (x) { tum += parcaAl(x, s); }); else if (j) tum = parcaAl(j, s); if (tum) parca(tum, tum); } }
    return tum;
  }
  if (r.body && typeof r.body.getReader === 'function' && typeof TextDecoder === 'function') {
    var rd = r.body.getReader(), dc = new TextDecoder();
    var dongu = function () { return rd.read().then(function (x) { if (x.done) { besle(dc.decode(), true); return bitir(); } besle(dc.decode(x.value, { stream: true }), false); return dongu(); }); };
    return dongu();
  }
  return r.text().then(function (t) { besle(t, true); return bitir(); });
}
/* HTTP hatası → kod (gövde yalnız sınıflandırmaya bakılır, metne/konsola yazılmaz) */
function hataOku(r, s) {
  var st = r.status;
  return (typeof r.text === 'function' ? r.text().catch(function () { return ''; }) : Promise.resolve('')).then(function (t) {
    t = String(t || '').slice(0, 4000);
    if (st === 401 || st === 403) return hata('anahtar');
    if (st === 400) return hata(/API_KEY_INVALID|api key|api_key|invalid_api_key|authentication/i.test(t) ? 'anahtar' : 'param');
    if (st === 402) return hata('bakiye');
    if (st === 404) return hata('model');
    if (st === 429) return hata(/insufficient_quota|insufficient balance|billing/i.test(t) ? 'bakiye' : /per ?day|PerDay|daily/i.test(t) ? 'kota' : s === 'gemini' && /RESOURCE_EXHAUSTED/.test(t) && !/minute/i.test(t) ? 'kota' : 'sik');
    if (st >= 500) return hata('yogun');
    var e = hata('diger'); e.durum = st; return e;
  });
}
/* tek deneme: 30 sn sessizlikte iptal; is.iptal kullanıcının iptali */
function bir(s, anahtar, model, sistem, metin, o, ek) {
  var ctl = new AbortController(), zaman = false, t = null;
  var kur = function () { clearTimeout(t); t = setTimeout(function () { zaman = true; ctl.abort(); }, ZAMAN); };
  if (o.is) { o.is.ctl = ctl; if (o.is.iptal) return Promise.reject(hata('iptal')); }
  kur();
  var q = istekKur(s, anahtar, model, sistem, metin, o.akis, ek, o.kucuk);
  var p;
  try { p = fetch(q.url, { method: 'POST', headers: q.headers, body: q.body, signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { p = Promise.reject(e); }
  return p.then(function (r) {
    if (!r.ok) return hataOku(r, s).then(function (e) { throw e; });
    return oku(r, s, function (x, tum) { kur(); o.geldi = true; if (o.parca) o.parca(x, tum); });
  }).then(function (m) { clearTimeout(t); return m; }, function (e) {
    clearTimeout(t);
    if (o.is && o.is.iptal) throw hata('iptal');
    if (e && e.kod) throw e;
    throw hata(zaman ? 'zaman' : 'ag');
  });
}
/* parametre reddi (400) → ek ayarsız (düşünme düzeyi) bir kez daha; model yok (404) → Gemini'de "latest" takma adı */
function cagir(s, anahtar, model, sistem, metin, o) {
  o = o || {};
  var dene = function (m, ek) {
    return bir(s, anahtar, m, sistem, metin, o, ek).then(function (x) { return { metin: x, model: m }; }, function (e) {
      if (e.kod === 'param' && ek && !o.geldi) return dene(m, false);
      if (e.kod === 'model' && SAG[s].yedek && m !== SAG[s].yedek && !o.geldi) return dene(SAG[s].yedek, ek);
      throw e;
    });
  };
  return dene(model || SAG[s].model, true);
}
function hataMetni(k, s) {
  var p = SAG[s] || {}, yad = p.tur === 'yerel' ? p.ad : 'Codex';
  return k === 'anahtar' ? 'Anahtar geçersiz; Ayarlar > Yapay zekâ koçu\'ndan yeniden gir' :
    k === 'kota' ? 'Günlük ücretsiz kota doldu, yarın tekrar dene' :
    k === 'sik' ? 'Çok sık soruldu; bir dakika sonra tekrar dene' :
    k === 'bakiye' ? (p.ad || 'Servis') + ' hesabında bakiye yok (API ücretli)' :
    k === 'zaman' ? 'Cevap 30 sn içinde gelmedi; tekrar dene' :
    k === 'ag' ? 'İnternet yok ya da servise ulaşılamadı' :
    k === 'yogun' ? 'Servis şu an yoğun; biraz sonra tekrar dene' :
    k === 'model' ? 'Model bulunamadı; uygulamayı güncelle' :
    k === 'engel' ? 'Servis bu soruyu cevaplamadı; farklı sor' :
    k === 'bos' ? 'Koç boş cevap döndü; tekrar dene' :
    k === 'param' ? 'Servis isteği kabul etmedi; uygulamayı güncelle' :
    k === 'cx-mesgul' ? 'Koç başka bir soruyu cevaplıyor, birazdan tekrar dene' :
    k === 'cx-zaman' ? yad + ' 2 dakikada cevap vermedi' :
    k === 'cx-jeton' ? yad + ' bağlantısı reddedildi; uygulamayı PC kısayolundan yeniden aç' :
    k === 'cx-buyuk' ? 'Soru çok uzun; kısaltıp tekrar dene' :
    k === 'cx-kapali' ? 'Bu PC\'de ' + yad + ' şu an kullanılamıyor' :
    k === 'cx-yok' ? 'Bu PC\'deki koç sunucusuna ulaşılamadı; uygulamayı PC kısayolundan aç' :
    k === 'cx-hata' ? yad + ' cevap veremedi; tekrar dene' : 'Koç cevap veremedi; tekrar dene';
}

/* ---------- cevap biçimi: kaçışlı metin + **kalın**, # başlık → kalın, madde → • (HTML enjekte edilmez) ---------- */
function bicim(m) {
  return AT.h(String(m == null ? '' : m))
    .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
    .replace(/^(\s*)[-*•]\s+/gm, '$1• ')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1$2');
}

/* ---------- Ayarlar bölümü ---------- */
var secim = null, yazilan = '', goster = false, deneme = null;   /* deneme: {tip, metin} son "Bağlantıyı dene" sonucu */
function codexSorun(a) { return a && SAG[a.s].tur === 'yerel' && (!yerelMi() || (codex && !yerelVar(a.s))); }
function ozet() {
  var a = ayar(); if (!a) return 'kapalı';
  if (a.hata || codexSorun(a)) return 'sorun var';
  return SAG[a.s].tur === 'web' ? SAG[a.s].ad + ' · anahtarsız' : SAG[a.s].ad + ' bağlı';
}
function gizlilik(p) {
  return p.tur === 'api' ? 'Koç, sorduğunda son 8 haftanın özetini bu servise gönderir. Anahtar yalnız bu cihazda.' :
    p.tur === 'yerel' ? 'Koç, sorduğunda son 8 haftanın özetini bu PC\'deki ' + p.yonelme + ' verir; ' + p.ad + ' kendi oturumunla cevaplar. Anahtar gerekmez.' :
    p.sor + ' dediğinde soru ve son 8 haftanın kısa özeti panoya kopyalanır, ' + p.ad + ' açılır; göndermeyi sen yaparsın.';
}
function icerik() {
  var a = ayar();
  if (a) {
    var p = SAG[a.s], dur = deneme ? deneme : a.hata ? { tip: 'uyari', metin: hataMetni(a.hata, a.s) } :
      codexSorun(a) ? { tip: 'uyari', metin: yerelMi() ? hataMetni('cx-kapali', a.s) + (codex.neden ? ': ' + kisalt(codex.neden, 120) : '') : p.ad + ' (bu PC) yalnız PC sürümünde çalışır' } :
      { tip: 'iyi', metin: p.tur === 'web' ? p.ad + ' · anahtarsız; soru panodan gider' : p.tur === 'yerel' ? p.ad + ' bağlı · bu PC' + (codex && codex.model ? ' · ' + codex.model : '') :
        p.ad + ' bağlı · ' + (a.m || p.model) + (a.son ? ' · denendi ' + AT.tarih(AT.iso(new Date(a.son)), 1) + ' ' + saat(a.son) : '') };
    return '<p class="durum ' + (dur.tip === 'bekle' ? 'bilgi' : dur.tip) + '">' + AT.h(dur.metin) + '</p><p class="mut kucuk koc-giz">' + AT.h(gizlilik(p)) + '</p>' +
      '<div class="row">' + (p.tur === 'api' ? '<button class="btn-ghost mini" data-act="koc-dene">Bağlantıyı dene</button>' : '') + '<span class="grow"></span>' +
      '<button class="btn-ghost mini" data-act="koc-sil">' + (p.tur === 'api' ? 'Anahtarı sil' : 'Koçu kapat') + '</button></div>';
  }
  var s = secim && (SAG[secim].tur !== 'yerel' || yerelVar(secim)) ? secim : ilkYerel() || 'gemini', q = SAG[s];
  var o = '<div class="koc-sec" role="radiogroup" aria-label="Yapay zekâ servisi">' + SIRA.filter(function (k) { return SAG[k].tur !== 'yerel' || yerelVar(k); }).map(function (k) {
    return '<button role="radio" aria-checked="' + (k === s) + '" data-act="koc-sec" data-v="' + k + '"><b>' + AT.h(SAG[k].ad) + '</b><small>' + AT.h(SAG[k].alt) + '</small></button>';
  }).join('') + '</div>';
  if (q.tur === 'api') {
    o += '<p class="koc-link"><a href="' + q.link + '" target="_blank" rel="noopener">' + AT.h(q.linkAd) + '</a></p>' +
      '<div class="alan"><label for="koc-anahtar"><span>' + AT.h(q.ad) + ' anahtarı</span></label><div class="koc-anahtar"><input id="koc-anahtar" type="' + (goster ? 'text' : 'password') + '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Anahtarı yapıştır" value="' + AT.h(yazilan) + '">' +
      '<button class="btn-ghost mini" data-act="koc-goster" aria-pressed="' + goster + '">' + (goster ? 'Gizle' : 'Göster') + '</button></div></div>' +
      (deneme ? '<p class="durum ' + (deneme.tip === 'bekle' ? 'bilgi' : deneme.tip) + '">' + AT.h(deneme.metin) + '</p>' : '') +
      '<p class="mut kucuk koc-giz">' + AT.h(gizlilik(q)) + '</p><button class="btn-ac btn-big" data-act="koc-dene">Bağlantıyı dene</button>';
  } else {
    o += (q.link ? '<p class="koc-link"><a href="' + q.link + '" target="_blank" rel="noopener">' + AT.h(q.linkAd) + '</a></p>' : '') + '<p class="mut kucuk koc-giz">' + AT.h(gizlilik(q)) + '</p><button class="btn-ac btn-big" data-act="koc-web" data-v="' + s + '">' + AT.h(q.ad) + ' ile kullan</button>';
  }
  return o;
}
function ciz() {
  var e = AT.$('#koc-bolum'); if (e) e.innerHTML = icerik();
  var z = AT.$('#koc-ozet'); if (z) z.textContent = ozet();
}
AT.bolum.koc = function () {
  /* PC (localhost): Codex var mı, sessizce sor; cevap gelince bölüm yeniden çizilir */
  if (yerelMi() && !codexSorgu) codexDurum().then(function () { if (!(AT.$('#koc-anahtar') && yazilan)) ciz(); });
  return '<details class="katla koc-ayar"' + (ozet() === 'sorun var' ? ' open' : '') + '><summary>Yapay zekâ koçu <small id="koc-ozet">' + AT.h(ozet()) + '</small></summary>' +
    '<div class="panel" id="koc-bolum">' + icerik() + '</div></details>';
};
AT.islem['koc-sec'] = function (d) { if (!SAG[d.v]) return; yaziliAl(); secim = d.v; deneme = null; ciz(); };
AT.islem['koc-goster'] = function () { yaziliAl(); goster = !goster; ciz(); var e = AT.$('#koc-anahtar'); if (e && e.focus) e.focus(); };
function yaziliAl() { var e = AT.$('#koc-anahtar'); if (e) yazilan = String(e.value || ''); }
/* anahtarsız modlar (ChatGPT, Claude, Codex): anahtar ve deneme yok, seçmek yeter */
AT.islem['koc-web'] = function (d) {
  var s = (d && d.v) || secim; if (!SAG[s] || SAG[s].tur === 'api' || (SAG[s].tur === 'yerel' && !yerelVar(s))) return;
  ayarYaz({ s: s }); secim = null; deneme = null; AT.render(); AT.toast('Koç: ' + SAG[s].ad + ' (Defter\'de "' + etiket(s) + '")');
};
/* küçük test isteği; anahtar kutudaysa önce dener, geçerliyse (ya da yalnız kota/ağ sorunu varsa) kaydeder */
var denemeIs = 0;
AT.islem['koc-dene'] = function () {
  var a = ayar(), inp = AT.$('#koc-anahtar'), s, an, yeni = false;
  if (inp) { s = secim || 'gemini'; an = String(inp.value || '').replace(/\s+/g, ''); yazilan = an; yeni = true; if (an.length < 20) { AT.toast('Önce anahtarı yapıştır'); if (inp.focus) inp.focus(); return; } }
  else if (a && SAG[a.s].tur === 'api') { s = a.s; an = a.a; }
  else return;
  var no = ++denemeIs;
  deneme = { tip: 'bekle', metin: 'Deneniyor…' }; ciz();
  return cagir(s, an, yeni ? null : a.m, 'Kısa cevap ver.', 'Yalnız "tamam" yaz.', { kucuk: true }).then(function (r) {
    if (no !== denemeIs) return;
    ayarYaz({ s: s, a: an, m: r.model, son: Date.now() });
    secim = null; yazilan = ''; goster = false; deneme = null; AT.render(); AT.toast(SAG[s].ad + ' bağlandı');
  }, function (e) {
    if (no !== denemeIs) return;
    var gecici = e.kod === 'kota' || e.kod === 'sik' || e.kod === 'ag' || e.kod === 'zaman' || e.kod === 'yogun';
    if (yeni && gecici) { ayarYaz({ s: s, a: an }); secim = null; yazilan = ''; goster = false; }   /* anahtar reddedilmedi: kaydet, sonra yine dener */
    else if (!yeni) { var a2 = ayar(); if (a2) { if (e.kod === 'anahtar' || e.kod === 'bakiye') a2.hata = e.kod; ayarYaz(a2); } }
    deneme = { tip: 'uyari', metin: hataMetni(e.kod, s) }; ciz();
    if (yeni && gecici) AT.render();
  });
};
AT.islem['koc-sil'] = function () {
  var a = ayar(), web = a && SAG[a.s].tur === 'web';
  AT.onayla(web ? 'Koç kapatılsın mı?' : 'Anahtar silinsin mi?', web ? 'Defter\'deki eski koç notları yerinde kalır.' : 'Anahtar bu cihazdan silinir; Defter\'deki koç notları yerinde kalır.', 'koc-sil-kesin', web ? 'Kapat' : 'Sil');
};
AT.islem['koc-sil-kesin'] = function () { iptalEt(); ayarYaz(null); deneme = null; secim = null; AT.kapat(); AT.render(); AT.toast('Koç kapatıldı'); };

/* ---------- Defter ---------- */
var is = null;   /* süren soru: {soru, s, metin, durum: 'bekle'|'hata', hata, ctl, iptal} */
function etiket(s) { var p = SAG[s]; return p && p.tur === 'web' ? p.sor : 'Koça sor'; }
AT.bolum.kocDugme = function () {
  if (!bagli()) return '';
  var a = ayar();
  return '<button class="btn-big koc-dugme" data-act="koc-sor">' + AT.h(etiket(a.s)) + '<kbd>Ctrl + Shift + Enter</kbd></button>';
};
function durumHtml() {
  if (!is) return '';
  if (is.durum === 'hata') return '<p class="durum uyari koc-hata" role="alert">' + AT.h(hataMetni(is.hata, is.s)) + ' <button class="btn-ghost mini" data-act="koc-tamam">Tamam</button></p>';
  return '<div class="koc-bekle" role="status"><div class="koc-ust"><span class="koc-nokta" aria-hidden="true"></span><span class="grow">' + (is.metin ? 'Koç yazıyor…' : 'Koç düşünüyor…') + '</span>' +
    '<button class="btn-ghost mini" data-act="koc-iptal">İptal</button></div><p class="koc-soru">' + AT.h(is.soru) + '</p><div id="koc-akis" class="koc-cevap">' + bicim(is.metin) + '</div></div>';
}
AT.bolum.kocAlt = function () {
  if (!bagli() && !is) return '';
  var bos = !(AT._defter && AT._defter.taslakOku ? AT._defter.taslakOku() : '').trim();
  return (bagli() ? '<div class="koc-cipler" id="koc-cipler"' + (bos ? '' : ' hidden') + '>' + CIPLER.map(function (q) {
    return '<button class="cip" data-act="koc-sor" data-q="' + AT.h(q) + '">' + AT.h(q) + '</button>'; }).join('') + '</div>' : '') +
    '<div id="koc-durum" aria-live="polite">' + durumHtml() + '</div>';
};
function durumCiz() { var e = AT.$('#koc-durum'); if (e) e.innerHTML = durumHtml(); }
function akisCiz() {
  var e = AT.$('#koc-akis'); if (!e) return durumCiz();
  e.innerHTML = bicim(is.metin);
  var u = e.parentNode && e.parentNode.querySelector ? e.parentNode.querySelector('.koc-ust .grow') : null; if (u) u.textContent = 'Koç yazıyor…';
}
/* liste yenile: yazarken (odak alanda) yalnız not listesi ve durum, değilse tüm ekran */
function yenile() {
  var ae = typeof document !== 'undefined' ? document.activeElement : null, l = AT.$('#df-liste');
  if (ae && ae.id === 'df-metin' && l && AT._defter && AT._defter.listeHtml) { l.innerHTML = AT._defter.listeHtml(); durumCiz(); }
  else AT.render();
}
function alanBosalt(e, soru) {
  if (!e || temizle(e.value) !== soru) return;
  e.value = ''; if (AT._defter && AT._defter.taslakYaz) AT._defter.taslakYaz('');
  if (AT._defter && AT._defter.boyutla) AT._defter.boyutla(e);
  var c = AT.$('#koc-cipler'); if (c) c.hidden = false;
}
function geriKoy(soru) {
  var e = AT.$('#df-metin');
  if (e && !String(e.value || '').trim()) { e.value = soru; if (AT._defter && AT._defter.taslakYaz) AT._defter.taslakYaz(soru); var c = AT.$('#koc-cipler'); if (c) c.hidden = true; }
}
function notEkle(soru, cevap, model, s) {
  var t = Date.now(), n = { id: AT.uid(), t: t, d: AT.iso(new Date(t)), metin: cevap, koc: { s: soru, model: model, ss: s } };
  if (!Array.isArray(AT.S.defter)) AT.S.defter = [];
  AT.S.defter.push(n); AT.kaydet();
  return n;
}
AT.islem['koc-sor'] = function (d) {
  var a = ayar(); if (!a || !bagli()) return;
  var e = AT.$('#df-metin'), cip = !!(d && d.q), soru = temizle(cip ? d.q : e ? e.value : '').slice(0, 2000);
  if (!soru) { AT.toast('Önce sorunu yaz'); if (e && e.focus) e.focus(); return; }
  /* setdil.js: set kalıbı ("curl 3x10 15") → koça gitmeden önizleme; "bench rekorum" → kural cevabı (limit harcamaz) */
  if (!cip && AT.setDil && AT.setDil.kocOnce(soru)) return;
  if (SAG[a.s].tur === 'web') return webSor(a.s, soru, cip ? null : e);
  if (is && is.durum === 'bekle') return AT.toast('Koç hâlâ düşünüyor');
  var bu = is = { soru: soru, s: a.s, metin: '', durum: 'bekle' };
  if (!cip) alanBosalt(e, soru);
  durumCiz();
  var metin = kullaniciMetni(soru, baglam(AT.S, AT.iso(new Date()), false));
  var cagri = SAG[a.s].tur === 'yerel' ? codexCagir(a.s, SISTEM + '\n\n' + metin, { is: bu }) :
    cagir(a.s, a.a, a.m, SISTEM, metin, { akis: true, is: bu, parca: function (x, tum) { if (is === bu) { bu.metin = tum; akisCiz(); } } });
  return cagri.then(function (r) {
    if (is !== bu) return;
    var c = temizle(r.metin);
    if (!c) throw hata('bos');
    is = null;
    var a2 = ayar(); if (a2 && SAG[a2.s].tur === 'api' && (a2.m !== r.model || a2.hata)) { a2.m = r.model; delete a2.hata; ayarYaz(a2); }
    notEkle(soru, c, r.model, a.s);
    yenile(); AT.duyur && AT.duyur('Koç cevap verdi');
  }).catch(function (x) {
    if (is !== bu) return;
    if (x.kod === 'iptal') { is = null; geriKoy(soru); durumCiz(); return; }
    bu.durum = 'hata'; bu.hata = x.kod || 'diger';
    if (x.kod === 'anahtar' || x.kod === 'bakiye') { var a3 = ayar(); if (a3) { a3.hata = x.kod; ayarYaz(a3); } }
    geriKoy(soru);
    if (x.kod === 'anahtar' || x.kod === 'cx-kapali') yenile(); else durumCiz();
  });
};
function iptalEt() { if (is) { is.iptal = true; if (is.ctl) try { is.ctl.abort(); } catch (e) {} } is = null; }
AT.islem['koc-iptal'] = function () { if (!is) return; var s = is.soru; iptalEt(); geriKoy(s); durumCiz(); };
AT.islem['koc-tamam'] = function () { is = null; durumCiz(); if (!bagli()) yenile(); };

/* ---------- anahtarsız mod (ChatGPT / Claude): pano + ?q= adresi ---------- */
function webMetin(soru) { return SISTEM_KISA + '\n\nVERİ:\n' + baglam(AT.S, AT.iso(new Date()), true) + '\n\nSORU: ' + soru; }
function webAdres(s, metin) { var p = SAG[s], u = p.q + encodeURIComponent(metin); return u.length <= URL_SINIR ? { url: u, uzun: false } : { url: p.bos, uzun: true }; }
/* pano: clipboard API, olmazsa seçili textarea + execCommand; ikisi de olmazsa false */
function kopyala(m) {
  var yedek = function () {
    try {
      var t = document.createElement('textarea'); t.value = m; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(t); t.focus && t.focus(); t.select(); if (t.setSelectionRange) t.setSelectionRange(0, m.length);
      var ok = !!document.execCommand('copy'); t.remove ? t.remove() : document.body.removeChild(t); return ok;
    } catch (e) { return false; }
  };
  var c = typeof navigator !== 'undefined' && navigator.clipboard;
  if (c && typeof c.writeText === 'function') { try { return c.writeText(m).then(function () { return true; }, function () { return yedek(); }); } catch (e) { return Promise.resolve(yedek()); } }
  return Promise.resolve(yedek());
}
function panoPenceresi(s, metin) {
  var p = SAG[s];
  AT.sheet('<h3>Metni kopyala</h3><p class="mut">Panoya kopyalanamadı; metni seç, kopyala ve ' + AT.h(p.yonelme) + ' yapıştır.</p><textarea id="koc-pano" class="df-alan" readonly aria-label="Kopyalanacak metin">' + AT.h(metin) + '</textarea>' +
    '<div class="yigin"><button class="btn-big" data-act="kapat">Tamam</button></div>');
  var t = AT.$('#koc-pano'); if (t && t.select) { t.focus && t.focus(); t.select(); }
}
function webSor(s, soru, e) {
  var p = SAG[s], metin = webMetin(soru), w = webAdres(s, metin);
  var k = kopyala(metin);   /* pano önce: sekme açılınca belge odağı kaybeder */
  try { window.open(w.url, '_blank', 'noopener'); } catch (x) {}
  notEkle(soru, '', s, s);
  alanBosalt(e, soru);
  yenile();
  return k.then(function (ok) {
    if (!ok) return panoPenceresi(s, metin);
    AT.toast(w.uzun ? 'Soru panoya kopyalandı, ' + p.yonelme + ' yapıştır' : p.ad + ' açıldı; soru panoda da var', 5000);
  });
}
/* cevabı yapıştır: aynı not kaydına */
function notBul(id) { var l = Array.isArray(AT.S.defter) ? AT.S.defter : []; for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return i; return -1; }
AT.islem['koc-yapistir'] = function (d) {
  var i = notBul(d.id); if (i < 0) return;
  var n = AT.S.defter[i], p = SAG[n.koc && n.koc.ss] || { ad: 'Koç', soruldu: 'Koça soruldu' }, id = AT.h(n.id);
  var pano = typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function';
  AT.sheet('<h3>Cevabı yapıştır</h3><p class="mut">' + AT.h((p.soruldu || p.ad) + ' · ' + kisalt(n.koc && n.koc.s, 120)) + '</p>' +
    '<textarea id="koc-yap" class="df-alan" data-id="' + id + '" maxlength="' + MAX_CEVAP + '" placeholder="' + AT.h(p.ad) + '\'nin cevabını buraya yapıştır" aria-label="Cevap">' + AT.h(n.metin || '') + '</textarea>' +
    '<div class="yigin"><button class="btn-ac btn-big" data-act="koc-yap-kaydet" data-id="' + id + '">Kaydet<kbd>Ctrl + Enter</kbd></button>' +
    (pano ? '<button class="btn-big" data-act="koc-panodan">Panodan al</button>' : '') +
    '<button class="btn-big btn-ghost btn-bad" data-act="df-sil" data-id="' + id + '">Notu sil</button></div>');
  var t = AT.$('#koc-yap'); if (t && t.focus && AT.masaustu && AT.masaustu()) t.focus();
};
AT.islem['koc-panodan'] = function () {
  var t = AT.$('#koc-yap'); if (!t) return;
  navigator.clipboard.readText().then(function (x) { x = String(x || ''); if (!x.trim()) return AT.toast('Pano boş'); t.value = x; if (AT._defter && AT._defter.boyutla) AT._defter.boyutla(t); },
    function () { AT.toast('Panoya erişilemedi; uzun bas → Yapıştır'); if (t.focus) t.focus(); });
};
AT.islem['koc-yap-kaydet'] = function (d) {
  var t = AT.$('#koc-yap'), i = notBul(d.id); if (i < 0 || !t) return AT.kapat();
  var m = temizle(t.value); if (!m) { AT.toast('Önce cevabı yapıştır'); if (t.focus) t.focus(); return; }
  var eski = AT.S.defter[i]; if (m === eski.metin) return AT.kapat();
  AT.S.defter[i] = Object.assign({}, eski, { metin: m, duz: Date.now() });
  AT.kaydet(); AT.kapat(); AT.render(); AT.toast('Cevap eklendi');
};

/* not satırı (defter.js notSatir çağırır): soru üstte soluk, cevap altında biçimli, küçük etiket. vurgula: defter araması */
AT.kocSatir = function (n, ts, saatYazi, vurgula) {
  var k = n.koc || {}, p = SAG[k.ss] || { ad: k.ss || 'Koç', tur: 'api' }, web = p.tur === 'web', bekler = !String(n.metin || '').trim();
  var ara = ts && ts.length && vurgula;
  var et = web ? p.soruldu : 'Koç · ' + p.ad;
  var cevap = bekler ? '<span class="koc-yok">Cevap henüz yok</span>' : ara ? vurgula(n.metin, ts) : bicim(n.metin);
  var ic = '<span class="df-saat">' + saatYazi + '</span><span class="grow koc-not"><span class="koc-soru">' + (ara ? vurgula(k.s, ts) : AT.h(k.s)) + '</span>' +
    '<span class="koc-cevap">' + cevap + '</span><span class="koc-etiket">' + AT.h(et) + '</span></span>' + (n.demo ? '<span class="tag demo">örnek</span>' : '');
  var b = '<button class="satir df-not df-koc" data-act="' + (bekler ? 'koc-yapistir' : 'df-ac') + '" data-id="' + AT.h(n.id) + '">' + ic + '</button>';
  return bekler ? '<div class="df-koc-sar">' + b + '<button class="btn-ghost mini koc-yap-dugme" data-act="koc-yapistir" data-id="' + AT.h(n.id) + '">Cevabı yapıştır</button></div>' : b;
};

/* ---------- Tüm verileri sil, bağlantı linki, Ayarlar alt yazısı ---------- */
var eskiHepsi = AT.islem['hepsini-kesin'];
AT.islem['hepsini-kesin'] = function (d) { iptalEt(); ayarYaz(null); secim = null; yazilan = ''; deneme = null; if (eskiHepsi) return eskiHepsi(d); };
AT.kocBagli = bagli;
/* setdil.js yedeği: koçtan yalnız JSON. Yalnız API ya da PC yerel koç (anahtarsız web modunda cevap uygulamaya dönmez) */
AT.kocJsonVar = function () { var a = ayar(); return !!a && bagli() && SAG[a.s].tur !== 'web'; };
AT.kocJson = function (istem) {
  var a = ayar(); if (!AT.kocJsonVar()) return Promise.reject(hata('kapali'));
  var sis = 'Yalnız geçerli JSON döndür; açıklama ya da kod bloğu yazma.';
  return (SAG[a.s].tur === 'yerel' ? codexCagir(a.s, sis + '\n\n' + istem, {}) : cagir(a.s, a.a, a.m, sis, istem, {})).then(function (r) { return String(r && r.metin || ''); });
};
AT.kocLink = function () { var a = ayar(); return a && SAG[a.s].tur !== 'yerel' ? (a.a ? { s: a.s, a: a.a } : { s: a.s }) : null; };
/* PC'den gelen linkteki koç ayarı: bu cihazda koç yoksa alınır (var olanın üstüne yazılmaz) */
AT.kocAl = function (k) {
  if (!k || !SAG[k.s] || SAG[k.s].tur === 'yerel' || ayar()) return false;   /* yerel koç yalnız kendi PC'sinde */
  if (SAG[k.s].tur === 'api' && !(typeof k.a === 'string' && k.a.length >= 20)) return false;
  ayarYaz(SAG[k.s].tur === 'api' ? { s: k.s, a: k.a } : { s: k.s }); return true;
};
AT.kocBilgi = function () { var a = ayar(); return a && SAG[a.s].tur === 'api' ? ' Yalnız koça sorduğunda kısa bir özet ' + SAG[a.s].ad + ' servisine gider.' : ''; };

/* ---------- olaylar ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t) return;
    if (t.id === 'df-metin') { var c = AT.$('#koc-cipler'); if (c) c.hidden = !!String(t.value || '').trim(); }
    else if (t.id === 'koc-anahtar') yazilan = String(t.value || '');
    else if (t.id === 'koc-yap' && AT._defter && AT._defter.boyutla) AT._defter.boyutla(t);
  });
  document.addEventListener('keydown', function (ev) {
    var t = ev.target; if (!t || ev.key !== 'Enter' || !(ev.ctrlKey || ev.metaKey) || ev.isComposing) return;
    if (t.id === 'koc-yap') { ev.preventDefault(); AT.islem['koc-yap-kaydet']({ id: t.dataset ? t.dataset.id : null }); }
    else if (t.id === 'koc-anahtar') { ev.preventDefault(); AT.islem['koc-dene'](); }
  });
  /* Codex seçiliyse PC açılışında jeton alınır; sunucu "yok" derse Defter düğmesi gizlenir */
  document.addEventListener('DOMContentLoaded', function () {
    var a = ayar(); if (!a || SAG[a.s].tur !== 'yerel' || !yerelMi()) return;
    codexDurum().then(function () { if (!yerelVar(a.s)) AT.render(); });
  });
}

AT._koc = { SAG: SAG, SIRA: SIRA, SISTEM: SISTEM, LS: LS, URL_SINIR: URL_SINIR, BUTCE: BUTCE, BUTCE_KISA: BUTCE_KISA, ayar: ayar, ayarYaz: ayarYaz, bagli: bagli,
  baglam: baglam, bayt: bayt, istekKur: istekKur, cagir: cagir, oku: oku, hataMetni: hataMetni, bicim: bicim, webMetin: webMetin, webAdres: webAdres, kopyala: kopyala,
  codexDurum: codexDurum, codexSifirla: function () { codex = null; codexSorgu = null; }, codex: function () { return codex; },
  durum: function () { return is; }, zaman: function (ms) { ZAMAN = ms; }, codexZaman: function (ms) { CODEX_ZAMAN = ms; } };   /* test için */
})(window.AT);
