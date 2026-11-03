/* G25: kapanan haftanın çevrimdışı koç raporu. S.kocRapor[pazartesi].
   Hesaplar tarih kesitinden; ham geçmiş/defter dış koça gönderilmez. */
(function (AT) {
'use strict';
if (!AT) return;
var ANA = ['Göğüs', 'Sırt', 'Bacak', 'Omuz', 'Kol'], secili = null, zaman = null, bekleyen = null, bos = null;
var LS = 'agirlik-koc-rapor-goruldu', ONCELIK = { deload: 0, duraganlik: 1, artis: 2 };
function gun(s, n) { var d = AT.parse(s); d.setDate(d.getDate() + n); return AT.iso(d); }
function hafta(s) { return AT.haftaBasi(s); }
function bugun() { return AT.iso(new Date()); }
function sonHafta() { return gun(hafta(bugun()), -7); }
function f(n, d) { return AT.fmt(n, d == null ? 1 : d); }
function tamam(S, son) {
  return (S.sessions || []).filter(function (s) { return s && s.date <= son && Array.isArray(s.exs) &&
    s.exs.some(function (e) { return AT.yapilanSetler(e).length; }); })
    .slice().sort(function (a, b) { return a.date.localeCompare(b.date) || (a.start || 0) - (b.start || 0); });
}
function setSay(l) { return l.reduce(function (t, s) { return t + s.exs.reduce(function (v, e) { return v + AT.yapilanSetler(e).length; }, 0); }, 0); }
function hedefYaz(x) { var h = x.hedef; return x.ad + ': ' + h.n + ' set × ' + h.tekrar + ' tekrar' + (h.va ? ', vücut ağırlığıyla' : ', ' + f(h.kg, 2) + ' kg'); }
function karar(l) {
  return (l || []).filter(function (x) { return x.hedef; }).slice().sort(function (a, b) {
    return ONCELIK[a.tur] - ONCELIK[b.tur] || (b.duragan || 0) - (a.duragan || 0) || a.ad.localeCompare(b.ad);
  })[0] || null;
}
/* Plan kaydı yok: yalnız önceki 28 günde en az iki kez çalışılmış günler.
   Aynı gün iki seans alışkanlığı iki kez saymaz; rapor haftası bu hesaba girmez. */
function plan(l, bas) {
  var say = [0, 0, 0, 0, 0, 0, 0], tarihler = {};
  l.forEach(function (s) { if (s.date >= gun(bas, -28) && s.date < bas && !tarihler[s.date]) {
    tarihler[s.date] = true; say[AT.parse(s.date).getDay()]++;
  } });
  return { n: say.filter(function (n) { return n >= 2; }).length, gunler: say };
}
/* Rekor: önceki gerçek en iyiyi aşan haftalık set (ilk set rekor sayılmaz).
   Yakın fırsat: son setin en iyiye yüzde uzaklığı; yalnız notlar hedefi rekoru aşarsa. */
function guc(l, bas, adaylar) {
  var en = {}, once = {}, son = {}, kayit = {};
  l.forEach(function (s) {
    var seansOn = {}; Object.keys(en).forEach(function (k) { seansOn[k] = en[k]; });
    s.exs.forEach(function (e) {
    var sets = AT.yapilanSetler(e); sets.forEach(function (z) {
      var kg = AT.num(z.kg), r = AT.num(z.reps), va = kg === 0;
      var v = va ? r : AT.tahminiMax(kg, r, z.rpe); if (!(v > 0)) return;
      var k = e.ad + (va ? ':va' : ':kg'), eski = seansOn[k] || 0;
      if (s.date >= bas && eski && v > eski + 0.05 && (!kayit[k] || v > kayit[k].yeni)) kayit[k] = { ad: e.ad, eski: once[k] || eski, yeni: v, va: va };
      en[k] = Math.max(en[k] || 0, v); if (s.date < bas) once[k] = en[k];
      son[k] = { ad: e.ad, v: v, va: va, date: s.date };
    });
  }); });
  var yakin = [];
  (adaylar || []).forEach(function (x) {
    if (x.tur !== 'artis' || !x.hedef) return;
    var h = x.hedef, k = x.ad + (h.va ? ':va' : ':kg'), s = son[k];
    if (!s || s.date < bas) return;
    var v = h.va ? h.tekrar : AT.tahminiMax(h.kg, h.tekrar);
    if (v > en[k] + 0.05) yakin.push({ ad: x.ad, hedef: h, en: en[k], son: s.v, tahmin: v, va: !!h.va, fark: (en[k] - s.v) / en[k] });
  });
  yakin.sort(function (a, b) { return a.fark - b.fark || a.ad.localeCompare(b.ad); });
  return { rekorlar: Object.keys(kayit).map(function (k) { return kayit[k]; }), yakin: yakin[0] || null };
}
function kilo(S, son) {
  var B = AT.bulkHesap, D = AT.donem; if (!B) return null;
  var ds = (S.donemGecmis || []).concat(S.donem ? [S.donem] : []);
  var d = ds.filter(function (x) { return x.bas <= son && (!x.bit || x.bit >= son); }).pop();
  var b = d && D ? D.ayna(d) || D.korumaNesne(d) : S.bulk && S.bulk.bas <= son ? S.bulk : null;
  if (!b) return null;
  var bw = (S.bw || []).filter(function (x) { return x.date <= son; });
  var kcal = (S.kcal || []).filter(function (x) { return x.date <= son; });
  var r = B.hesapla(bw, b, son, kcal); if (!r || r.hiz == null || r.durum === 'veri' || r.durum === 'erken') return null;
  var ay = B.hizAyrinti(B.gecerli(bw), b.bas), sp = d && D ? D.sapma(d, r).sinif : r.durum;
  var hedef = null;
  if (r.hedefKcal != null) {
    var eski = S.kcalOneri && S.kcalOneri.hafta <= hafta(gun(son, 1)) ? S.kcalOneri : null;
    hedef = B.haftalikOneri(eski, r.hedefKcal, hafta(gun(son, 1)), [b.bas, b.hedefKg, b.min, b.max].join('|'), B.kcalHaftaGun(kcal, gun(son, 1)) < 4).deger;
  }
  return { hiz: r.hiz, se: ay.se, min: r.min, max: r.max, durum: sp,
    donem: d ? D.TUR[d.tur].ad : b.hedefKg < b.basKg ? 'Cut' : 'Bulk', hedefKcal: hedef,
    kcalFark: hedef == null && r.kcal != null ? Math.round(Math.max(-200, Math.min(200, r.kcal / 2)) / 50) * 50 : null,
    sonTarti: r.sonTarti, tarti: B.gunluk(B.gecerli(bw)).filter(function (x) { return x.date >= gun(r.sonTarti, -41) && x.date >= b.bas; }).length };
}
function hesap(S, tarih) {
  var bas = hafta(tarih), son = gun(bas, 6), l = tamam(S, son), bu = l.filter(function (s) { return s.date >= bas; });
  var kas = AT.denge.say(l, son), set = setSay(bu), cumleler = [], p = plan(l, bas);
  var adaylar = AT.notlarRapor ? AT.notlarRapor(l, gun(son, 1)).filter(function (x) { return x.son >= bas; }) : [];
  var sec = karar(adaylar), g = guc(l, bas, adaylar), k = kilo(S, son);
  function ekle(tur, metin, neden) { if (metin) cumleler.push({ tur: tur, metin: metin + '.', neden: neden }); }
  if (set) {
    var kl = ANA.concat(Object.keys(kas).filter(function (x) { return ANA.indexOf(x) < 0; }));
    ekle('hacim', kl.map(function (x) { return x + ' ' + f(kas[x] || 0) + ' set ' + AT.denge.etiket(kas[x] || 0); }).join(' · '),
      bu.length + ' seans · ' + set + ' iş seti; ana kas 1, yardımcı kas 0,5; az <5, iyi 5–15, çok >15 set');
  }
  if (g.rekorlar.length) ekle('rekor', 'Rekor kırdığın hareketler: ' + g.rekorlar.map(function (x) { return x.ad; }).join(', '),
    g.rekorlar.map(function (x) { return x.ad + ': ' + f(x.eski) + ' → ' + f(x.yeni) + (x.va ? ' tekrar' : ' kg tahmini max'); }).join(' · '));
  if (sec) ekle('guc', (sec.tur === 'deload' ? 'Hafif hafta, ' : sec.tur === 'duraganlik' ? 'Durağanlığı aşmak için aralığı değiştir, ' : 'Sıradaki hedef, ') + hedefYaz(sec),
    sec.seans + ' seans · son seansta ' + sec.set + ' set · ' + sec.neden);
  if (k) {
    var durum = { iyi: 'yolda', yolda: 'yolda', yavas: 'yavaş', hizli: 'hızlı', artiyor: 'kilo artıyor', dusuyor: 'kilo düşüyor' }[k.durum];
    ekle('kilo', k.donem + ': haftada ' + f(k.hiz, 2) + ' kg, ' + durum +
      (k.hedefKcal != null ? '; günlük hedef ' + f(k.hedefKcal, 0) + ' kcal' : k.kcalFark ? '; günde ' + f(Math.abs(k.kcalFark), 0) + ' kcal ' + (k.kcalFark > 0 ? 'ekle' : 'azalt') : ''),
      'Hız ' + f(k.hiz, 3) + ' kg/hafta · standart hata (SE) ' + f(k.se, 3) + ' kg/hafta · hedef ' + f(k.min, 2) + '–' + f(k.max, 2) +
      ' · son tartı ' + k.sonTarti + ' · son 42 gün/dönem içinde ' + k.tarti + ' tartı günü; ham tartı regresyonu, ilk 14 gün ve bayat veride öneri yok');
  }
  if (p.n) ekle('uyum', 'Alışkanlık planı ' + p.n + ' antrenman, yaptığın ' + bu.length,
    'Önceki 28 günün gün sayımları (Pazar–Cumartesi): ' + p.gunler.join(', ') + '; en az 2 kez yapılan günler plan sayıldı · bu hafta ' + bu.length + ' seans, ' + set + ' set');
  if (set) {
    var enAz = ANA.slice().sort(function (a, b) { return (kas[a] || 0) - (kas[b] || 0); })[0];
    var firsat = sec && sec.tur !== 'artis' ? null : g.yakin;
    ekle('odak', 'Gelecek hafta odağın ' + enAz + (sec && sec.tur !== 'artis' ? '; önce ' + (sec.tur === 'deload' ? 'hafif haftayı uygula' : sec.ad + ' tekrar aralığını değiştir') :
      firsat ? '; en yakın rekor fırsatı ' + hedefYaz(firsat) : ''),
      enAz + ' ' + f(kas[enAz] || 0) + ' set · ' + bu.length + ' seans' + (firsat ? '; son/en iyi ' + f(firsat.son) + '/' + f(firsat.en) + ', hedefle ' + f(firsat.tahmin) + (firsat.va ? ' tekrar' : ' kg tahmini max') : sec ? '; öncelik ' + sec.tur : ''));
  }
  return { v: 1, hafta: bas, son: son, cumleler: cumleler.slice(0, 6), sayilar: { seans: bu.length, set: set, kas: kas, rekor: g.rekorlar, karar: sec, kilo: k, plan: p.n || null } };
}
function al(bas) {
  bas = hafta(bas); var S = AT.S, r = S.kocRapor && S.kocRapor[bas];
  if (r) return r;
  r = hesap(S, bas);
  if (r.cumleler.length) { if (!S.kocRapor) S.kocRapor = {}; S.kocRapor[bas] = r; AT.kaydet(); }
  return r;
}
function pcKoc() {
  var a = AT._koc && AT._koc.ayar();
  return !!(AT.masaustu && AT.masaustu() && a && a.s === 'codex' && AT.kocJsonVar && AT.kocJsonVar());
}
function html(r) {
  var haftalar = Object.keys(AT.S.kocRapor || {}).concat([r.hafta, sonHafta()]).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort();
  var i = haftalar.indexOf(r.hafta), h = AT.h;
  return '<section class="kr-rapor"><p class="mut kucuk">' + h(AT.tarih(r.hafta, 1) + ' – ' + AT.tarih(r.son, 1)) + '</p><h3>Haftalık koç raporu</h3>' +
    (r.cumleler.length ? '<ol class="kr-cumleler">' + r.cumleler.map(function (c) {
      return '<li><details><summary><span>' + h(c.metin) + '</span><small>neden?</small></summary><p>' + h(c.neden) + '</p></details></li>';
    }).join('') + '</ol>' : '<p class="mut">Bu hafta için yeterli veri yok.</p>') +
    (r.cumleler.length && pcKoc() ? '<button class="btn-ghost kr-yorum" data-act="kocrapor-yorum"' + (bekleyen === r.hafta ? ' disabled' : '') + '>ChatGPT ile yorumla</button>' : '') +
    '<div class="kr-cevap" aria-live="polite">' + h(bekleyen === r.hafta ? 'Yorum bekleniyor…' : r.yorum || '') + '</div>' +
    '<div class="kr-alt"><button class="btn-ghost mini" data-act="kocrapor-ac" data-hafta="' + h(i > 0 ? haftalar[i - 1] : gun(r.hafta, -7)) + '">‹ Önceki</button>' +
    '<button class="btn-ghost mini" data-act="kocrapor-ac" data-hafta="' + h(i < haftalar.length - 1 ? haftalar[i + 1] : r.hafta) + '"' + (r.hafta >= sonHafta() ? ' disabled' : '') + '>Sonraki ›</button>' +
    '<button class="btn-ghost mini" data-act="kocrapor-hikaye">Hafta hikâyesi</button></div></section>';
}
function ac(bas) { secili = hafta(bas || sonHafta()); AT.sheet(html(al(secili))); }
function goruldu() { try { return localStorage.getItem(LS); } catch (e) { return null; } }
function isaretle(w) { try { localStorage.setItem(LS, w); } catch (e) { /* rapor yine S içinde */ } }
/* Boş çıkan haftayı yalnız veri sayısı değişince yeniden dene (eşitleme/içe aktarma sonrası). */
function imza() { return hafta(bugun()) + '|' + (AT.S.sessions || []).length + '|' + (AT.S.bw || []).length; }
function ilkAc() {
  zaman = null; if (!AT.S || AT.S.active || goruldu() === hafta(bugun())) return;
  var sh = AT.$('#sheet'); if (sh && !sh.hidden) return;
  var r = al(sonHafta()); if (!r.cumleler.length) { bos = imza(); return; }   /* boş hafta: bu oturumda her render'da yeniden hesaplanmaz */
  isaretle(hafta(bugun())); ac(r.hafta);
}
function satir() {
  if (AT.S.active) return '';
  if (goruldu() !== hafta(bugun()) && bos !== imza() && !zaman) zaman = setTimeout(ilkAc, 950);
  var w = sonHafta(), r = AT.S.kocRapor && AT.S.kocRapor[w];
  if (!r && !tamam(AT.S, gun(w, 6)).some(function (s) { return s.date >= w; }) && !(AT.S.bw || []).some(function (x) { return x.date >= w && x.date <= gun(w, 6); })) return '';
  return '<button class="btn-ghost kr-satir" data-act="kocrapor-ac">Haftalık koç raporun <span aria-hidden="true">›</span></button>';
}
/* Gizlilik: bugünden geriye en çok 56 gün, sekiz SAYISAL hafta özeti.
   Eski raporun metni, serbest seans/hareket adları, defter, kimlikler gönderilmez. */
function ozet(S, tarih) {
  var bas = gun(tarih, -55), ilk = gun(hafta(tarih), -49), tum = tamam(S, tarih), l = tum.filter(function (s) { return s.date >= bas; }), out = [];   /* karar/rekor tüm geçmişle (rapordaki gibi); gönderilen yalnız sayı */
  for (var i = 0; i < 8; i++) {
    var w = gun(ilk, 7 * i), ws = gun(w, 6) < tarih ? gun(w, 6) : tarih, se = l.filter(function (s) { return s.date >= w && s.date <= ws; });
    var bw = AT.bulkHesap.gecerli(S.bw || []).filter(function (x) { return x.date >= w && x.date >= bas && x.date <= ws; });
    var kc = AT.bulkHesap.kcalGecerli(S.kcal || []).filter(function (x) { return x.date >= w && x.date >= bas && x.date <= ws; });
    var kas = AT.denge.say(se, ws), hiz = AT.bulkHesap.hizAyrinti(AT.bulkHesap.gecerli(S.bw || []).filter(function (x) { return x.date >= bas && x.date <= ws; }));
    var aday = AT.notlarRapor(tum.filter(function (s) { return s.date <= ws; }), gun(ws, 1)).filter(function (x) { return x.son >= w; });
    var sec = karar(aday), h = sec && sec.hedef;
    out.push({ hafta: w, seans: se.length, set: setSay(se), kas: ANA.map(function (k) { return kas[k] || 0; }),
      rekor: guc(tum.filter(function (s) { return s.date <= ws; }), w, []).rekorlar.length,
      karar: sec ? { tur: sec.tur, kg: h.kg, tekrar: h.tekrar, set: h.n } : null,
      kilo: bw.length ? +(bw.reduce(function (t, x) { return t + +x.kg; }, 0) / bw.length).toFixed(2) : null,
      hiz: hiz ? +hiz.hiz.toFixed(3) : null, SE: hiz ? +hiz.se.toFixed(3) : null,
      kcal: kc.length ? Math.round(kc.reduce(function (t, x) { return t + +x.kcal; }, 0) / kc.length) : null });
  }
  return { kasSirasi: ANA, haftalar: out };
}
AT.islem['kocrapor-ac'] = function (d) { ac(d && d.hafta); };
AT.islem['hafta-ozet'] = function () { ac(); };
AT.islem['kocrapor-hikaye'] = function () { AT.haftalikOzet(secili); };
AT.islem['kocrapor-yorum'] = function () {
  if (!pcKoc() || bekleyen || !secili) return Promise.resolve();
  var w = secili, r = al(w), veri = ozet(AT.S, bugun());
  var istem = 'Türkçe en çok 3 kısa cümleyle haftalık sayısal özeti yorumla; yalnız veriye dayan, eksik veride sessiz kal; hafif hafta > durağanlık > artış önceliğini koru; JSON {"yorum":"..."} döndür. Kas sayıları ana 1, yardımcı 0,5 settir. İncelenen hafta: ' +
    (veri.haftalar.some(function (x) { return x.hafta === w; }) ? w : 'son 8 hafta dışında; yalnız güncel özeti yorumla') + '\n' + JSON.stringify(veri);
  bekleyen = w; ac(w);
  return AT.kocJson(istem).then(function (m) {
    var j = JSON.parse(m); if (!j || typeof j.yorum !== 'string' || !j.yorum.trim()) throw new Error('cevap');
    /* Silme/geri yükleme/eşitleme sırasında kaldırılan raporu diriltme. */
    if (AT.S.kocRapor && AT.S.kocRapor[w] === r) { r.yorum = j.yorum.trim().slice(0, 2000); AT.kaydet(); }
  }).catch(function () { if (secili === w) AT.toast('Yorum alınamadı; raporun kayıtlı'); }).then(function () {
    bekleyen = null; var sh = AT.$('#sheet .kr-rapor'); if (secili === w && sh) ac(w);
  });
};
AT.kocRapor = { hesap: hesap, hafta: hafta, karar: karar, plan: plan, html: html, al: al, ac: ac, satir: satir, ilkAc: ilkAc, ozet: ozet, pcKoc: pcKoc };
/* Çekirdek eski bağlantıyı yalnız seans varsa basar; tartıdan oluşan eski rapor
   da Geçmiş'ten erişilebilir. Yalnız view kökünün yenilenmesini izle. */
function gecmisBagla() {
  if (!AT.S || (AT.S.sessions || []).length || !Object.keys(AT.S.kocRapor || {}).length) return;
  var v = AT.$('#view'); if (!v) return;
  var h = v.querySelector('h1'), p = v.querySelector('.sub');
  if (h && h.textContent === 'Geçmiş' && p && !p.querySelector('[data-act="hafta-ozet"]'))
    p.insertAdjacentHTML('beforeend', ' <button class="btn-ghost mini hafta-dugme" data-act="hafta-ozet">Haftalık özet</button>');
}
document.addEventListener('DOMContentLoaded', function () {
  if (!zaman) zaman = setTimeout(ilkAc, 950);
  var v = AT.$('#view'); if (v && typeof MutationObserver !== 'undefined') new MutationObserver(gecmisBagla).observe(v, { childList: true });
  gecmisBagla();
});
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { bos = null; ilkAc(); } });
var eskiSil = AT.islem['hepsini-kesin'];
AT.islem['hepsini-kesin'] = function (d) { clearTimeout(zaman); zaman = null; secili = null; try { localStorage.removeItem(LS); } catch (e) {} if (eskiSil) return eskiSil(d); };
})(window.AT);
