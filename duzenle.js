/* duzenle.js: modül (window.AT'ye kayıt olur). Bitmiş antrenmanı düzenleme.
   Antrenman penceresindeki "Düzenle" → taslak kopya üzerinde ad, tarih, not, set kg/tekrar(/RPE) düzelt,
   set ya da hareket sil, set ekle. Kaydet: doğrular, boş setleri/hareketleri atar, 6 sn "Geri al" verir.
   AT.islem['seans-duzenle']({id}) */
(function (AT) {
'use strict';

var taslak = null, eskiId = null;

/* noktalı ondalığı (örnek/CSV verisi) Türkçe virgülle göster; num() ikisini de okur */
function virgul(v) { return String(v == null ? '' : v).replace('.', ','); }
function kopya(x) { return JSON.parse(JSON.stringify(x)); }
function rpeVar(t) { return !!AT.S.rpe || t.exs.some(function (e) { return e.sets.some(function (s) { return s.rpe != null && String(s.rpe).trim() !== ''; }); }); }

function ciz() {
  var t = taslak, rp = rpeVar(t), rg = rp ? ' rpe' : '', in_ = AT.$('#sheet .in'), kay = in_ ? in_.scrollTop : 0;
  var o = '<h3>Antrenmanı düzenle</h3>' +
    '<div class="alanlar"><label class="alan"><span>Ad</span><input id="dz-ad" value="' + AT.h(t.name || '') + '" autocomplete="off"></label>' +
    '<label class="alan"><span>Tarih</span><input id="dz-tarih" type="date" value="' + AT.h(t.date) + '" max="' + AT.iso(new Date()) + '"></label></div>';
  t.exs.forEach(function (e, ei) {
    o += '<section class="panel dz-ex"><div class="ex-head"><span class="grow"><b>' + AT.h(e.ad) + '</b></span>' +
      '<button class="mini btn-ghost" data-act="dz-ex-sil" data-e="' + ei + '">Çıkar</button></div>';
    o += '<div class="setgrid dz' + rg + '"><span class="lbl">Set</span><span class="lbl">kg</span><span class="lbl">Tekrar</span>' + (rp ? '<span class="lbl">Zorluk</span>' : '') + '<span class="lbl">Sil</span></div>';
    e.sets.forEach(function (s, si) {
      var a = ' data-te="' + ei + '" data-ts="' + si + '"';
      o += '<div class="setgrid dz' + rg + '"><span class="n' + (s.tip === 'isinma' ? ' isinma' : '') + '">' + (s.tip === 'isinma' ? 'I' : si + 1) + '</span>' +
        '<input inputmode="decimal"' + a + ' data-tf="kg" value="' + AT.h(virgul(s.kg)) + '" aria-label="' + AT.h(e.ad) + ' set ' + (si + 1) + ' kg">' +
        '<input inputmode="numeric"' + a + ' data-tf="reps" value="' + AT.h(s.reps) + '" aria-label="' + AT.h(e.ad) + ' set ' + (si + 1) + ' tekrar">' +
        (rp ? '<input inputmode="decimal"' + a + ' data-tf="rpe" value="' + AT.h(s.rpe == null ? '' : s.rpe) + '" placeholder="–" aria-label="' + AT.h(e.ad) + ' set ' + (si + 1) + ' zorluk">' : '') +
        '<button class="done dz-sil" data-act="dz-set-sil"' + a + ' aria-label="Seti sil">×</button></div>';
    });
    o += '<button class="addset" data-act="dz-set-ekle" data-e="' + ei + '">+ Set ekle</button></section>';
  });
  if (!t.exs.length) o += '<p class="mut">Hareket kalmadı; kaydedemezsin. Vazgeç ya da antrenmanı sil.</p>';
  o += '<label class="seansnot"><span>Seans notu</span><textarea id="dz-not" rows="2">' + AT.h(t.not || '') + '</textarea></label>' +
    '<div class="yigin"><button class="btn-ac btn-big" data-act="dz-kaydet">Kaydet</button><button class="btn-big btn-ghost" data-act="dz-vazgec">Vazgeç</button></div>';
  AT.sheet(o);
  var y = AT.$('#sheet .in'); if (y) y.scrollTop = kay;
}

/* doğrulama: boş satır (kg ve tekrar boş) atılır; yarım satır hata. Dönüş: hata metni ya da null */
function dogrula(t) {
  var hata = null;
  t.exs.forEach(function (e) {
    e.sets = e.sets.filter(function (s) { return String(s.kg).trim() !== '' || String(s.reps).trim() !== ''; });
    e.sets.forEach(function (s) {
      if (hata) return;
      var kg = AT.num(s.kg), r = AT.num(s.reps);
      if (!(kg >= 0 && kg <= 1000) || !(r >= 1 && r <= 200) || Math.round(r) !== r) { hata = e.ad + ': kg ve tekrarı kontrol et'; return; }
      if (s.rpe != null && String(s.rpe).trim() !== '') {
        var p = AT.num(s.rpe); if (!(p >= 6 && p <= 10)) { hata = e.ad + ': zorluk 6–10 arası olmalı (boş bırakabilirsin)'; return; }
        s.rpe = AT.fmt(Math.round(p * 2) / 2);
      } else delete s.rpe;
      s.reps = String(r); s.done = true;
    });
  });
  if (hata) return hata;
  t.exs = t.exs.filter(function (e) { return e.sets.length; });
  if (!t.exs.length) return 'En az bir set kalmalı';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || AT.iso(AT.parse(t.date)) !== t.date) return 'Geçerli bir tarih seç';
  if (t.date > AT.iso(new Date())) return 'Tarih gelecekte olamaz';
  return null;
}

AT.islem['seans-duzenle'] = function (d) {
  var se = AT.S.sessions.filter(function (s) { return s.id === d.id; })[0]; if (!se) return;
  taslak = kopya(se); eskiId = se.id; ciz();
  if (AT.masaustu && AT.masaustu()) { var e = AT.$('#dz-ad'); if (e) e.focus(); }
};
AT.islem['dz-set-sil'] = function (d) { taslak.exs[+d.te].sets.splice(+d.ts, 1); ciz(); };
AT.islem['dz-ex-sil'] = function (d) { taslak.exs.splice(+d.e, 1); ciz(); };
AT.islem['dz-set-ekle'] = function (d) {
  var e = taslak.exs[+d.e], son = e.sets[e.sets.length - 1];
  e.sets.push({ kg: son ? son.kg : '', reps: son ? son.reps : '', done: true }); ciz();
  var n = AT.$('input[data-te="' + d.e + '"][data-ts="' + (e.sets.length - 1) + '"][data-tf="kg"]'); if (n) n.focus();
};
AT.islem['dz-vazgec'] = function () { var id = eskiId; taslak = null; AT.kapat(); if (id) AT.islem.seans({ id: id }); };
AT.islem['dz-kaydet'] = function () {
  var t = kopya(taslak), hata = dogrula(t); if (hata) return AT.toast(hata);
  t.name = String(t.name || '').trim() || 'Antrenman';
  var i = -1; AT.S.sessions.forEach(function (s, k) { if (s.id === eskiId) i = k; }); if (i < 0) return AT.kapat();
  var eski = AT.S.sessions[i]; AT.S.sessions[i] = t; taslak = null;
  AT.kaydet(); AT.kapat(); AT.render();
  if (AT.geriAl) AT.geriAl('Antrenman güncellendi', function () { AT.S.sessions = AT.S.sessions.map(function (s) { return s.id === eski.id ? eski : s; }); });
  else AT.toast('Antrenman güncellendi');
};

document.addEventListener('input', function (ev) {
  var t = ev.target; if (!taslak) return;
  if (t.dataset && t.dataset.tf != null) { var s = taslak.exs[+t.dataset.te] && taslak.exs[+t.dataset.te].sets[+t.dataset.ts]; if (s) s[t.dataset.tf] = t.value; return; }
  if (t.id === 'dz-ad') taslak.name = t.value; else if (t.id === 'dz-tarih') taslak.date = t.value; else if (t.id === 'dz-not') taslak.not = t.value;
});

AT._duzenle = { dogrula: dogrula, taslak: function () { return taslak; } };   /* test için */
})(window.AT);
