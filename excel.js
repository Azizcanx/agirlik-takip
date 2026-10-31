/* excel.js: modül (window.AT'ye kayıt olur; index.html'de disa.js'ten sonra yüklenir)
   "Excel'e aktar": tek .xlsx dosyası, dört sayfa: Özet · Antrenmanlar · Kilo · Kalori.
   Görünüş (uygulamanın "defter" kimliği): kendi tablo stili "AgirlikTakip" (koyu mürekkep başlık, çok açık şerit, ince yatay çizgi,
   filtre düğmeli), sayfa sekme renkleri, yatay yazdırma (genişliğe sığar, başlık satırı her sayfada).
   Özet: serif başlık bandı + 6 sayı kartı (antrenman, set, toplam ton, kilo değişimi, haftalık hız, ortalama kalori) + en çok
   yapılan hareketler (tahmini maxta veri çubuğu). Antrenmanlar: her antrenman bir blok (koşullu biçim: üstte mürekkep çizgi,
   tekrarlanan tarih/ad soluk; değerler silinmez, sıralama/filtre bozulmaz), 0 kg "vücut ağ." (sayı biçimi, değer 0),
   rekor setler açık altın zemin (excel.js hesaplar, sabit stil). Kilo: tartı noktaları + 7 günlük ortalama çizgi grafiği;
   Kalori: günlük sütun grafiği (+ önerilen kalori çizgisi). Grafikler tablodaki hücrelere bağlı (son 12 ay / 60 gün).
   Tarih = Excel seri günü; metinler inlineStr; hücreye formül yazılmaz (yalnız koşullu biçim kuralı).
   Satırlar disa.js'ten (AT._csv): CSV ile aynı kurallar. Bağımlılık yok: SpreadsheetML elle yazılır, ZIP'e kendi
   DEFLATE'imizle (sabit Huffman + LZ77, eşzamanlı: indirme dokunma anında kalır) konur. Test: Temp/agt/excel-test.js */
(function (AT) {
'use strict';

/* ---------- ZIP: yerel dosya başlıkları + merkezi dizin + bitiş kaydı ---------- */
var CRC = [];
(function () {
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
})();
function crc32(b) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function utf8(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  var b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
  for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/* DEFLATE (RFC 1951), tek blok sabit Huffman; LZ77 32 KB pencere, 3 baytlık özet zinciri (en çok 32 aday).
   XML çok tekrarlı: ~10 kat küçülür (5 yıllık veri MB'larca değil yüzlerce KB). */
var LBAS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEK = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DBAS = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DEK = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var LKOD = new Uint16Array(288), LBOY = new Uint8Array(288), DKOD = new Uint16Array(30), LSIRA = new Uint8Array(259);
(function () {
  function ters(c, n) { var r = 0; for (var i = 0; i < n; i++) { r = (r << 1) | (c & 1); c >>= 1; } return r; }
  for (var s = 0; s < 288; s++) {
    var c, n;
    if (s < 144) { c = 0x30 + s; n = 8; } else if (s < 256) { c = 0x190 + s - 144; n = 9; } else if (s < 280) { c = s - 256; n = 7; } else { c = 0xC0 + s - 280; n = 8; }
    LKOD[s] = ters(c, n); LBOY[s] = n;
  }
  for (var d = 0; d < 30; d++) DKOD[d] = ters(d, 5);
  for (var i = 0, l = 3; l <= 258; l++) { while (i < 28 && LBAS[i + 1] <= l) i++; LSIRA[l] = i; }
})();
function deflate(src) {
  var n = src.length, out = new Uint8Array(Math.ceil(n * 9 / 8) + 16), p = 0, acc = 0, nb = 0;
  function yaz(v, k) { acc |= v << nb; nb += k; while (nb >= 8) { out[p++] = acc & 255; acc >>>= 8; nb -= 8; } }
  function sembol(s) { yaz(LKOD[s], LBOY[s]); }
  yaz(1, 1); yaz(1, 2);   /* BFINAL = 1, BTYPE = 01 (sabit Huffman) */
  var HB = 15, HM = (1 << HB) - 1, bas = new Int32Array(1 << HB), once = new Int32Array(32768), i = 0;
  for (var q = 0; q < bas.length; q++) bas[q] = -1;
  function ekle(k) { var h = ((src[k] << 10) ^ (src[k + 1] << 5) ^ src[k + 2]) & HM; once[k & 32767] = bas[h]; bas[h] = k; return h; }
  while (i < n) {
    var bl = 0, bd = 0;
    if (i + 2 < n) {
      var h = ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & HM, j = bas[h], z = 0, en = Math.min(258, n - i);
      while (j >= 0 && i - j <= 32768 && z++ < 32) {
        if (src[j + bl] === src[i + bl]) {
          var l = 0; while (l < en && src[j + l] === src[i + l]) l++;
          if (l > bl) { bl = l; bd = i - j; if (l === en) break; }
        }
        j = once[j & 32767];
      }
      ekle(i);
    }
    if (bl >= 3) {
      var li = LSIRA[bl]; sembol(257 + li); if (LEK[li]) yaz(bl - LBAS[li], LEK[li]);
      var di = 29; while (DBAS[di] > bd) di--;
      yaz(DKOD[di], 5); if (DEK[di]) yaz(bd - DBAS[di], DEK[di]);
      for (var k = i + 1; k < i + bl; k++) if (k + 2 < n) ekle(k);
      i += bl;
    } else { sembol(src[i]); i++; }
  }
  sembol(256);
  if (nb) out[p++] = acc & 255;
  return out.subarray(0, p);
}

/* dosyalar: [{ad (ASCII), veri: metin | Uint8Array}] -> .zip baytları. sakla: sıkıştırmadan (STORE); yoksa DEFLATE,
   sıkışmayan parça STORE kalır. */
function zip(dosyalar, zaman, sakla) {
  var d = zaman || new Date(), yil = Math.min(2107, Math.max(1980, d.getFullYear()));
  var saat = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var gun = ((yil - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  var parca = [], merkez = [], ofs = 0, mBoy = 0;
  dosyalar.forEach(function (f) {
    var ad = utf8(f.ad), veri = typeof f.veri === 'string' ? utf8(f.veri) : f.veri, crc = crc32(veri), yon = 0, ic = veri;
    if (!sakla) { var s = deflate(veri); if (s.length < veri.length) { ic = s; yon = 8; } }
    var y = new Uint8Array(30 + ad.length), v = new DataView(y.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0, true); v.setUint16(8, yon, true);
    v.setUint16(10, saat, true); v.setUint16(12, gun, true); v.setUint32(14, crc, true);
    v.setUint32(18, ic.length, true); v.setUint32(22, veri.length, true); v.setUint16(26, ad.length, true); v.setUint16(28, 0, true);
    y.set(ad, 30);
    var m = new Uint8Array(46 + ad.length), w = new DataView(m.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0, true); w.setUint16(10, yon, true);
    w.setUint16(12, saat, true); w.setUint16(14, gun, true); w.setUint32(16, crc, true);
    w.setUint32(20, ic.length, true); w.setUint32(24, veri.length, true); w.setUint16(28, ad.length, true);
    w.setUint32(42, ofs, true);   /* 30–41: ek alan, yorum, disk, öznitelikler = 0 */
    m.set(ad, 46);
    parca.push(y, ic); merkez.push(m); ofs += y.length + ic.length; mBoy += m.length;
  });
  var son = new Uint8Array(22), e = new DataView(son.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dosyalar.length, true); e.setUint16(10, dosyalar.length, true);
  e.setUint32(12, mBoy, true); e.setUint32(16, ofs, true);
  var out = new Uint8Array(ofs + mBoy + 22), p = 0;
  parca.concat(merkez, [son]).forEach(function (x) { out.set(x, p); p += x.length; });
  return out;
}

/* ---------- XML yardımcıları ---------- */
var XB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', REL = NS_R + '/';
var NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
var NS_X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main', NS_XM = 'http://schemas.microsoft.com/office/excel/2006/main';
var OOX = 'application/vnd.openxmlformats-officedocument.', XLSX_TUR = OOX + 'spreadsheetml.sheet';
var KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function kac(s) { return s.replace(/[&<>"']/g, function (c) { return KACIS[c]; }); }
function vekil(s) { return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, function (m) { return m.length === 2 ? m : '�'; }); }
/* öznitelik ve düz metin: & < > " ' kaçışı; XML 1.0'da yasak karakterler (sekme/LF/CR dışı kontrol, U+FFFE/FFFF) atılır */
function x(s) { return kac(vekil(String(s == null ? '' : s)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')); }
/* hücre metni (ST_Xstring), Excel'in kendi kuralı: kontrol karakteri -> _xHHHH_; metinde zaten "_xHHHH_" varsa
   başına _x005F_ (Excel onu çözüp başka harfe çevirmesin). Hücre en çok 32767 karakter. */
function metinXml(s) {
  s = vekil(String(s).slice(0, 32767)).replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1')
    .replace(/[\x00-\x08\x0B-\x1F￾￿]/g, function (c) { return '_x' + ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4) + '_'; });
  return kac(s);
}
/* 'YYYY-MM-DD' -> Excel seri günü (1900 sistemi; 1970-01-01 = 25569). Geçersiz ya da 1 Mart 1900 öncesi -> NaN */
function seri(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
  if (!m) return NaN;
  var y = +m[1], a = +m[2], g = +m[3], t = Date.UTC(y, a - 1, g), d = new Date(t);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return NaN;
  var s = t / 864e5 + 25569;
  return s >= 61 ? s : NaN;
}
/* 0 -> A, 25 -> Z, 26 -> AA */
function harf(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function rels(l) {
  return XB + '<Relationships xmlns="' + NS_PR + '">' + l.map(function (r, i) {
    return '<Relationship Id="rId' + (i + 1) + '" Type="' + r[0] + '" Target="' + r[1] + '"/>'; }).join('') + '</Relationships>';
}

/* ---------- renkler, stiller ve tema ---------- */
var MUREKKEP = '2B3A55';   /* koyu mürekkep laciverti: başlıklar, bant, çizgiler */
var LACI = '3D5D8A';       /* uygulamanın mürekkebi (style.css --ac, açık tema) */
var SERIT = 'F2F4F8', CIZGI = 'E1E5EC', SOLUK = 'A3A9B4', GRI = '6A7280', KART = 'F3F5F9', ALTIN = 'FBEFC9', ALTIN_Y = '7A5A12', BANT_Y = 'C9D2E3';
var CUBUK = 'A7B6CF', NOKTA = '9AA9C2', HARDAL = '9A6B1F';
/* stil kaydı: aynı tanım bir kez yazılır. o: {fmt: biçim kodu, font: {b, i, sz, renk, ad}, dolgu: 'RRGGBB',
   kenar: {sol|sag|ust|alt: [stil, renk]}, hiza: {y: yatay, d: dikey, girinti}} -> cellXfs sırası */
var NF = [], FONT = [], DOLGU = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
  KENAR = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], XF = [];
var YERLESIK = { '#,##0': 3 };
function sira(l, s) { var i = l.indexOf(s); if (i < 0) { l.push(s); i = l.length - 1; } return i; }
function renk(r) { return '<color rgb="FF' + r + '"/>'; }
function fontXml(o) {
  return '<font>' + (o.b ? '<b/>' : '') + (o.i ? '<i/>' : '') + '<sz val="' + (o.sz || 11) + '"/>' + (o.renk ? renk(o.renk) : '') +
    '<name val="' + (o.ad || 'Calibri') + '"/><family val="' + (o.ad === 'Cambria' ? 1 : 2) + '"/></font>';
}
function kenarXml(k) {
  function bir(ad, t) { return t ? '<' + ad + ' style="' + t[0] + '">' + renk(t[1]) + '</' + ad + '>' : '<' + ad + '/>'; }
  return '<border>' + bir('left', k.sol) + bir('right', k.sag) + bir('top', k.ust) + bir('bottom', k.alt) + '<diagonal/></border>';
}
function dolguXml(r) { return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + r + '"/><bgColor indexed="64"/></patternFill></fill>'; }
function stil(o) {
  var nf = o.fmt == null ? 0 : o.fmt in YERLESIK ? YERLESIK[o.fmt] : 164 + sira(NF, o.fmt);
  var f = sira(FONT, fontXml(o.font || {})), d = o.dolgu ? sira(DOLGU, dolguXml(o.dolgu)) : 0, k = o.kenar ? sira(KENAR, kenarXml(o.kenar)) : 0;
  var h = o.hiza ? '<alignment' + (o.hiza.y ? ' horizontal="' + o.hiza.y + '"' : '') + (o.hiza.d ? ' vertical="' + o.hiza.d + '"' : '') +
    (o.hiza.girinti ? ' indent="' + o.hiza.girinti + '"' : '') + '/>' : '';
  return sira(XF, '<xf numFmtId="' + nf + '" fontId="' + f + '" fillId="' + d + '" borderId="' + k + '" xfId="0"' + (nf ? ' applyNumberFormat="1"' : '') +
    (f ? ' applyFont="1"' : '') + (d ? ' applyFill="1"' : '') + (k ? ' applyBorder="1"' : '') + (h ? ' applyAlignment="1">' + h + '</xf>' : '/>'));
}
var F_TARIH = 'dd\\.mm\\.yyyy', F_KG = '0.0#', F_KGANT = '0.0#;-0.0#;"vücut ağ."', F_TOPLAM = '#,##0;-#,##0;"–"', F_YUZDE = '+0%;-0%;0%';
var BEYAZ_YAN = { sol: ['thick', 'FFFFFF'], sag: ['thick', 'FFFFFF'] };
function kart(ek) { var o = { dolgu: KART, kenar: { sol: BEYAZ_YAN.sol, sag: BEYAZ_YAN.sag }, hiza: { y: 'center', d: 'center' } }; for (var k in ek) o[k] = ek[k]; return o; }
function kartSayi(fmt) { return stil(kart({ fmt: fmt, font: { ad: 'Cambria', sz: 22, renk: MUREKKEP } })); }
var ST = {
  normal: stil({}),
  baslik: stil({ font: { b: 1, renk: 'FFFFFF' }, dolgu: MUREKKEP, hiza: { d: 'center' } }),   /* tablo stilini tanımayan uygulamalarda da başlık belli */
  tarih: stil({ fmt: F_TARIH }), kg: stil({ fmt: F_KG }), binlik: stil({ fmt: '#,##0' }),
  kapak: stil({ font: { ad: 'Cambria', sz: 24, renk: 'FFFFFF' }, dolgu: MUREKKEP, hiza: { d: 'center', girinti: 1 } }),
  soluk: stil({ font: { renk: GRI } }), kalin: stil({ font: { b: 1 } }),
  altbaslik: stil({ font: { sz: 10, renk: BANT_Y }, dolgu: MUREKKEP, hiza: { d: 'top', girinti: 1 } }),
  kgAnt: stil({ fmt: F_KGANT }), toplam: stil({ fmt: F_TOPLAM }), yuzde: stil({ fmt: F_YUZDE }),
  /* rekor seti: açık altın zemin, tahmini max kalın */
  metinA: stil({ dolgu: ALTIN }), tarihA: stil({ fmt: F_TARIH, dolgu: ALTIN }), kgAntA: stil({ fmt: F_KGANT, dolgu: ALTIN }),
  toplamA: stil({ fmt: F_TOPLAM, dolgu: ALTIN }), tmaxA: stil({ fmt: F_KG, dolgu: ALTIN, font: { b: 1, renk: ALTIN_Y } }),
  /* Özet kartları: etiket (üstte lacivert çizgi), büyük serif sayı, küçük not; kartlar arası beyaz kalın kenar boşluk gibi durur */
  kartEt: stil(kart({ font: { sz: 9, b: 1, renk: GRI }, kenar: { sol: BEYAZ_YAN.sol, sag: BEYAZ_YAN.sag, ust: ['medium', LACI] }, hiza: { y: 'center', d: 'bottom' } })),
  kartSayi: kartSayi('#,##0'), kartTon: kartSayi('#,##0.0" t"'), kartKg: kartSayi('+0.0" kg";-0.0" kg";0.0" kg"'),
  kartHiz: kartSayi('+0.00" kg";-0.00" kg";0.00" kg"'), kartKcal: kartSayi('#,##0" kcal"'), kartBos: stil(kart({ font: { ad: 'Cambria', sz: 22, renk: SOLUK } })),
  kartNot: stil(kart({ font: { sz: 9, renk: GRI }, hiza: { y: 'center', d: 'top' } })),
  bolum: stil({ font: { ad: 'Cambria', sz: 14, renk: MUREKKEP }, hiza: { d: 'bottom' } }),
  dipnot: stil({ font: { sz: 9, i: 1, renk: GRI } })
};
/* dxf: 0–2 tablo stili (bütün tablo: ince yatay çizgi · başlık · şerit), 3–6 Antrenmanlar koşullu biçimi */
var DXF = [
  '<dxf><border><bottom style="thin">' + renk(CIZGI) + '</bottom><horizontal style="thin">' + renk(CIZGI) + '</horizontal></border></dxf>',
  '<dxf><font><b/>' + renk('FFFFFF') + '</font><fill><patternFill patternType="solid"><fgColor rgb="FF' + MUREKKEP + '"/><bgColor rgb="FF' + MUREKKEP + '"/></patternFill></fill></dxf>',
  '<dxf><fill><patternFill patternType="solid"><fgColor rgb="FF' + SERIT + '"/><bgColor rgb="FF' + SERIT + '"/></patternFill></fill></dxf>',
  '<dxf><border><top style="thin">' + renk(MUREKKEP) + '</top></border></dxf>',   /* yeni antrenman: üstte mürekkep çizgi */
  '<dxf><border><top style="thin">' + renk('C3CAD6') + '</top></border></dxf>',   /* yeni hareket: biraz daha koyu çizgi */
  '<dxf><font>' + renk(SOLUK) + '</font></dxf>',   /* bloğun içinde tekrarlanan tarih/ad */
  '<dxf><font><b/></font></dxf>'   /* bloğun ilk satırında tarih/ad */
];
var TABLO_STIL = 'AgirlikTakip';
function stillerXml() {
  return XB + '<styleSheet xmlns="' + NS + '">' +
    '<numFmts count="' + NF.length + '">' + NF.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + x(f) + '"/>'; }).join('') + '</numFmts>' +
    '<fonts count="' + FONT.length + '">' + FONT.join('') + '</fonts><fills count="' + DOLGU.length + '">' + DOLGU.join('') + '</fills>' +
    '<borders count="' + KENAR.length + '">' + KENAR.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + XF.length + '">' + XF.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="' + DXF.length + '">' + DXF.join('') + '</dxfs>' +
    '<tableStyles count="1" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"><tableStyle name="' + TABLO_STIL + '" pivot="0" count="3">' +
    '<tableStyleElement type="wholeTable" dxfId="0"/><tableStyleElement type="headerRow" dxfId="1"/><tableStyleElement type="firstRowStripe" dxfId="2"/></tableStyle></tableStyles>' +
    '</styleSheet>';
}
/* tema: yeni tablolar/grafikler de mürekkep tonlarında açılsın */
var DOLGU3 = new Array(4).join('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>');
var TEMA = XB + '<a:theme xmlns:a="' + NS_A + '" name="Agirlik Takip"><a:themeElements>' +
  '<a:clrScheme name="Agirlik Takip"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="' + MUREKKEP + '"/></a:dk2><a:lt2><a:srgbClr val="F7F4EE"/></a:lt2>' +
  [LACI, HARDAL, '3F8462', 'B4544A', '6F8FBF', '8F949B'].map(function (c, i) { return '<a:accent' + (i + 1) + '><a:srgbClr val="' + c + '"/></a:accent' + (i + 1) + '>'; }).join('') +
  '<a:hlink><a:srgbClr val="' + LACI + '"/></a:hlink><a:folHlink><a:srgbClr val="6A6C70"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Agirlik Takip"><a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Agirlik Takip"><a:fillStyleLst>' + DOLGU3 + '</a:fillStyleLst><a:lnStyleLst>' +
  [6350, 12700, 19050].map(function (w) { return '<a:ln w="' + w + '"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'; }).join('') +
  '</a:lnStyleLst><a:effectStyleLst>' + new Array(4).join('<a:effectStyle><a:effectLst/></a:effectStyle>') + '</a:effectStyleLst>' +
  '<a:bgFillStyleLst>' + DOLGU3 + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

/* ---------- sayfa ve tablo XML ---------- */
/* sayfa: {ad, satirlar: [[{v, s} | {s} (yalnız stil) | null] | null], genislik: [karakter], tablolar: [{ad, ref, sutunlar}], dondur,
   izgara, yukseklik: {satırNo0: pt}, birlesik: ['A1:H1'], kosul: [xml], ext: xml, sekme: 'RRGGBB', grafik: {...}} */
function hucreXml(ref, h) {
  var s = h.s ? ' s="' + h.s + '"' : '';
  if (!dolu(h)) return '<c r="' + ref + '"' + s + '/>';
  if (typeof h.v === 'number') return '<c r="' + ref + '"' + s + '><v>' + h.v + '</v></c>';
  var t = String(h.v);
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t' + (/^\s|\s$/.test(t) ? ' xml:space="preserve"' : '') + '>' + metinXml(t) + '</t></is></c>';
}
function dolu(h) { return !!h && h.v != null && h.v !== '' && (typeof h.v !== 'number' || isFinite(h.v)); }
function yaziliyor(h) { return dolu(h) || (!!h && !!h.s); }
var ALTBILGI = '<headerFooter><oddFooter>' + x('&L&8Ağırlık Takip · &A&R&8&P / &N') + '</oddFooter></headerFooter>';
function sayfaXml(sy, secili, drawingId) {
  var satir = [], enC = sy.genislik.length, enR = 1;
  sy.satirlar.forEach(function (r, i) {
    if (!r) return;
    var c = '';
    r.forEach(function (h, j) { if (yaziliyor(h)) { c += hucreXml(harf(j) + (i + 1), h); enC = Math.max(enC, j + 1); } });
    if (!c) return;
    var y = sy.yukseklik && sy.yukseklik[i];
    satir.push('<row r="' + (i + 1) + '"' + (y ? ' ht="' + y + '" customHeight="1"' : '') + '>' + c + '</row>');
    enR = i + 1;
  });
  /* yalnız yüksekliği olan boş satırlar (Özet'te aralık) */
  if (sy.yukseklik) Object.keys(sy.yukseklik).forEach(function (k) {
    var i = +k; if (sy.satirlar[i] && sy.satirlar[i].some(yaziliyor)) return;
    satir.push({ i: i, x: '<row r="' + (i + 1) + '" ht="' + sy.yukseklik[k] + '" customHeight="1"/>' });
  });
  satir = satir.map(function (s) { return typeof s === 'string' ? { i: +/r="(\d+)"/.exec(s)[1] - 1, x: s } : s; })
    .sort(function (a, b) { return a.i - b.i; }).map(function (s) { return s.x; });
  var t = sy.tablolar || [];
  t.forEach(function (tb) { enR = Math.max(enR, +/\d+$/.exec(tb.ref)[0]); });
  var gor = '<sheetView workbookViewId="0"' + (sy.izgara === false ? ' showGridLines="0"' : '') + (secili ? ' tabSelected="1"' : '') + ' zoomScale="100" zoomScaleNormal="100">' +
    (sy.dondur ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') + '</sheetView>';
  return XB + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
    '<sheetPr>' + (sy.sekme ? '<tabColor rgb="FF' + sy.sekme + '"/>' : '') + '<pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:' + harf(enC - 1) + enR + '"/>' +
    '<sheetViews>' + gor + '</sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>' +
    sy.genislik.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
    '<sheetData>' + satir.join('') + '</sheetData>' +
    (sy.birlesik && sy.birlesik.length ? '<mergeCells count="' + sy.birlesik.length + '">' + sy.birlesik.map(function (b) { return '<mergeCell ref="' + b + '"/>'; }).join('') + '</mergeCells>' : '') +
    (sy.kosul || []).join('') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' + ALTBILGI +
    (drawingId ? '<drawing r:id="' + drawingId + '"/>' : '') +
    (t.length ? '<tableParts count="' + t.length + '">' + t.map(function (_, j) { return '<tablePart r:id="rId' + (j + 1) + '"/>'; }).join('') + '</tableParts>' : '') +
    (sy.ext || '') + '</worksheet>';
}
/* Excel Tablosu: başlık hücreleri sütun adlarıyla birebir aynı olmalı (yoksa Excel "onarır") */
function tabloXml(id, tb) {
  return XB + '<table xmlns="' + NS + '" id="' + id + '" name="' + tb.ad + '" displayName="' + tb.ad + '" ref="' + tb.ref + '" totalsRowShown="0">' +
    '<autoFilter ref="' + tb.ref + '"/><tableColumns count="' + tb.sutunlar.length + '">' +
    tb.sutunlar.map(function (a, i) { return '<tableColumn id="' + (i + 1) + '" name="' + x(a) + '"/>'; }).join('') + '</tableColumns>' +
    '<tableStyleInfo name="' + TABLO_STIL + '" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>';
}
/* koşullu biçim kuralları: [{sqref, kurallar: [{dxf, f}]}] -> xml (öncelik sırayla) */
function kosulXml(l) {
  var p = 0;
  return l.map(function (k) {
    return '<conditionalFormatting sqref="' + k.sqref + '">' + k.kurallar.map(function (r) {
      return '<cfRule type="expression" dxfId="' + r.dxf + '" priority="' + (++p) + '"><formula>' + x(r.f) + '</formula></cfRule>'; }).join('') + '</conditionalFormatting>';
  });
}
/* veri çubuğu: 0'dan başlar, düz (degrade yok, Excel 2010+ uzantısı; 2007 ve diğerleri degrade gösterir) */
var CUBUK_ID = '{6A1E2B3C-0D4F-4A5B-9C8D-7E6F5A4B3C2D}';
function veriCubugu(sqref) {
  return {
    kosul: '<conditionalFormatting sqref="' + sqref + '"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/>' + renk(CUBUK) + '</dataBar>' +
      '<extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="' + NS_X14 + '"><x14:id>' + CUBUK_ID + '</x14:id></ext></extLst></cfRule></conditionalFormatting>',
    ext: '<extLst><ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="' + NS_X14 + '"><x14:conditionalFormattings>' +
      '<x14:conditionalFormatting xmlns:xm="' + NS_XM + '"><x14:cfRule type="dataBar" id="' + CUBUK_ID + '"><x14:dataBar minLength="0" maxLength="100" gradient="0">' +
      '<x14:cfvo type="num"><xm:f>0</xm:f></x14:cfvo><x14:cfvo type="max"/><x14:negativeFillColor rgb="FFB4544A"/><x14:axisColor rgb="FF000000"/></x14:dataBar></x14:cfRule>' +
      '<xm:sqref>' + sqref + '</xm:sqref></x14:conditionalFormatting></x14:conditionalFormattings></ext></extLst>'
  };
}

/* ---------- grafik (DrawingML) ---------- */
/* g: {baslik, kat: {ref, v: [seri gün]}, seriler: [{ad, tur: 'nokta'|'cizgi'|'sutun'|'hedef', ref?, v: [sayı]}], yMin, yMax, yBicim} */
function yazi(sz, rnk, ek) { return '<a:defRPr sz="' + sz + '"' + (ek || '') + '><a:solidFill><a:srgbClr val="' + rnk + '"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr>'; }
function txPr(sz, rnk) { return '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>' + yazi(sz, rnk) + '</a:pPr><a:endParaRPr lang="tr-TR"/></a:p></c:txPr>'; }
function onbellek(v, kod) {
  return '<c:numCache><c:formatCode>' + x(kod || 'General') + '</c:formatCode><c:ptCount val="' + v.length + '"/>' +
    v.map(function (n, i) { return typeof n === 'number' && isFinite(n) ? '<c:pt idx="' + i + '"><c:v>' + n + '</c:v></c:pt>' : ''; }).join('') + '</c:numCache>';
}
function seriXml(s, i, kat) {
  var cizgi = s.tur === 'nokta' ? '<a:ln w="28575"><a:noFill/></a:ln>' :
    s.tur === 'hedef' ? '<a:ln w="19050" cap="rnd"><a:solidFill><a:srgbClr val="' + HARDAL + '"/></a:solidFill><a:prstDash val="dash"/><a:round/></a:ln>' :
    '<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + MUREKKEP + '"/></a:solidFill><a:round/></a:ln>';
  var sp = s.tur === 'sutun' ? '<c:spPr><a:solidFill><a:srgbClr val="' + CUBUK + '"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>' :
    '<c:spPr>' + cizgi + '</c:spPr><c:marker>' + (s.tur === 'nokta' ? '<c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="' + NOKTA +
      '"/></a:solidFill><a:ln w="9525"><a:noFill/></a:ln></c:spPr>' : '<c:symbol val="none"/>') + '</c:marker>';
  var deger = s.ref ? '<c:numRef><c:f>' + x(s.ref) + '</c:f>' + onbellek(s.v) + '</c:numRef>' :
    '<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="' + s.v.length + '"/>' + s.v.map(function (n, j) { return '<c:pt idx="' + j + '"><c:v>' + n + '</c:v></c:pt>'; }).join('') + '</c:numLit>';
  return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/><c:tx><c:v>' + x(s.ad) + '</c:v></c:tx>' + sp +
    '<c:cat><c:numRef><c:f>' + x(kat.ref) + '</c:f>' + onbellek(kat.v, F_TARIH) + '</c:numRef></c:cat><c:val>' + deger + '</c:val>' +
    (s.tur === 'sutun' ? '' : '<c:smooth val="0"/>') + '</c:ser>';
}
function grafikXml(g) {
  var sut = [], cz = [];
  g.seriler.forEach(function (s, i) { (s.tur === 'sutun' ? sut : cz).push(seriXml(s, i, g.kat)); });
  var EKS = '<c:axId val="500100"/><c:axId val="500200"/>';
  var cizgiYok = '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>';
  return XB + '<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:date1904 val="0"/><c:lang val="tr-TR"/><c:roundedCorners val="0"/>' +
    '<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr>' + yazi(1300, MUREKKEP, ' b="0"') + '</a:pPr><a:r><a:rPr lang="tr-TR" sz="1300" b="0">' +
    '<a:solidFill><a:srgbClr val="' + MUREKKEP + '"/></a:solidFill><a:latin typeface="Cambria"/></a:rPr><a:t>' + x(g.baslik) + '</a:t></a:r></a:p></c:rich></c:tx>' +
    '<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
    (sut.length ? '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + sut.join('') + '<c:gapWidth val="40"/>' + EKS + '</c:barChart>' : '') +
    (cz.length ? '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + cz.join('') + '<c:marker val="1"/>' + EKS + '</c:lineChart>' : '') +
    '<c:dateAx><c:axId val="500100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' +
    '<c:numFmt formatCode="dd\\.mm" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>' +
    '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C3CAD6"/></a:solidFill></a:ln></c:spPr>' + txPr(900, GRI) +
    '<c:crossAx val="500200"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblOffset val="100"/><c:baseTimeUnit val="days"/>' + (g.xAdim ? '<c:majorUnit val="' + g.xAdim + '"/><c:majorTimeUnit val="days"/>' : '') + '</c:dateAx>' +
    '<c:valAx><c:axId val="500200"/><c:scaling><c:orientation val="minMax"/>' + (g.yMax != null ? '<c:max val="' + g.yMax + '"/>' : '') +
    (g.yMin != null ? '<c:min val="' + g.yMin + '"/>' : '') + '</c:scaling><c:delete val="0"/><c:axPos val="l"/>' +
    '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="' + CIZGI + '"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
    '<c:numFmt formatCode="' + x(g.yBicim || 'General') + '" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    cizgiYok + txPr(900, GRI) + '<c:crossAx val="500100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>' + (g.yAdim ? '<c:majorUnit val="' + g.yAdim + '"/>' : '') + '</c:valAx>' +
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>' +
    (g.seriler.length > 1 ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>' + txPr(900, GRI) + '</c:legend>' : '') + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="' + CIZGI + '"/></a:solidFill></a:ln></c:spPr>' +
    txPr(1000, '3A4252') + '</c:chartSpace>';
}
/* grafik çerçevesi: g.konum = [ilk sütun, ilk satır, son sütun, son satır] (0'dan) */
function cizimXml(g) {
  var k = g.konum;
  function nokta(ad, c, r) { return '<xdr:' + ad + '><xdr:col>' + c + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + r + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:' + ad + '>'; }
  return XB + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '">' +
    '<xdr:twoCellAnchor editAs="oneCell">' + nokta('from', k[0], k[1]) + nokta('to', k[2], k[3]) +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="' + x(g.baslik) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '">' +
    '<c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
}
function zamanW3c(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

/* sayfalar -> paket parçaları [{ad, veri}]. İlk sayfa açılışta seçili. */
function paket(sayfalar, zaman) {
  zaman = zaman || new Date();
  var d = [{ ad: '[Content_Types].xml', veri: '' }], tabloN = 0, grafikN = 0, tur = '', adlar = [];
  d.push({ ad: '_rels/.rels', veri: rels([[REL + 'officeDocument', 'xl/workbook.xml'],
    ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], [REL + 'extended-properties', 'docProps/app.xml']]) });
  d.push({ ad: 'docProps/core.xml', veri: XB + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>Ağırlık Takip</dc:title><dc:creator>Ağırlık Takip</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + zamanW3c(zaman) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + zamanW3c(zaman) + '</dcterms:modified></cp:coreProperties>' });
  d.push({ ad: 'docProps/app.xml', veri: XB + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Ağırlık Takip</Application></Properties>' });
  /* yazdırırken başlık satırı her sayfada (tablo sayfaları) */
  var tekrar = sayfalar.map(function (s, i) { return s.dondur ? '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + x("'" + s.ad + "'!$1:$1") + '</definedName>' : ''; }).join('');
  d.push({ ad: 'xl/workbook.xml', veri: XB + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    sayfalar.map(function (s, i) { return '<sheet name="' + x(s.ad) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
    (tekrar ? '<definedNames>' + tekrar + '</definedNames>' : '') + '</workbook>' });
  d.push({ ad: 'xl/_rels/workbook.xml.rels', veri: rels(sayfalar.map(function (s, i) { return [REL + 'worksheet', 'worksheets/sheet' + (i + 1) + '.xml']; })
    .concat([[REL + 'styles', 'styles.xml'], [REL + 'theme', 'theme/theme1.xml']])) });
  d.push({ ad: 'xl/styles.xml', veri: stillerXml() });
  d.push({ ad: 'xl/theme/theme1.xml', veri: TEMA });
  sayfalar.forEach(function (s, i) {
    var ad = 'sheet' + (i + 1) + '.xml', t = s.tablolar || [], r = [], g = s.grafik;
    t.forEach(function () { r.push([REL + 'table', '../tables/table' + (++tabloN) + '.xml']); });
    if (g) { grafikN++; r.push([REL + 'drawing', '../drawings/drawing' + grafikN + '.xml']); }
    d.push({ ad: 'xl/worksheets/' + ad, veri: sayfaXml(s, i === 0, g ? 'rId' + r.length : '') });
    tur += '<Override PartName="/xl/worksheets/' + ad + '" ContentType="' + OOX + 'spreadsheetml.worksheet+xml"/>';
    if (r.length) d.push({ ad: 'xl/worksheets/_rels/' + ad + '.rels', veri: rels(r) });
    t.forEach(function (tb, j) {
      var n = tabloN - t.length + j + 1;
      d.push({ ad: 'xl/tables/table' + n + '.xml', veri: tabloXml(n, tb) });
      tur += '<Override PartName="/xl/tables/table' + n + '.xml" ContentType="' + OOX + 'spreadsheetml.table+xml"/>';
    });
    if (g) {
      d.push({ ad: 'xl/drawings/drawing' + grafikN + '.xml', veri: cizimXml(g) });
      d.push({ ad: 'xl/drawings/_rels/drawing' + grafikN + '.xml.rels', veri: rels([[REL + 'chart', '../charts/chart' + grafikN + '.xml']]) });
      d.push({ ad: 'xl/charts/chart' + grafikN + '.xml', veri: grafikXml(g) });
      tur += '<Override PartName="/xl/drawings/drawing' + grafikN + '.xml" ContentType="' + OOX + 'drawing+xml"/>' +
        '<Override PartName="/xl/charts/chart' + grafikN + '.xml" ContentType="' + OOX + 'drawingml.chart+xml"/>';
    }
    adlar.push(s.ad);
  });
  d[0].veri = XB + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="' + OOX + 'spreadsheetml.sheet.main+xml"/>' + tur +
    '<Override PartName="/xl/styles.xml" ContentType="' + OOX + 'spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="' + OOX + 'theme+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="' + OOX + 'extended-properties+xml"/></Types>';
  return d;
}
/* sayfalar -> .xlsx baytları (sakla: sıkıştırmasız) */
function xlsx(sayfalar, zaman, sakla) { zaman = zaman || new Date(); return zip(paket(sayfalar, zaman), zaman, sakla); }

/* ---------- veriden sayfalara ---------- */
/* sütun tipleri: tarih · metin · kg (0,0#) · kgAnt (0 = "vücut ağ.") · toplam (#.##0, 0 = "–") · binlik (#.##0) · yuzde · sayi / gram (Genel) */
var STIL = { tarih: ST.tarih, kg: ST.kg, binlik: ST.binlik, kgAnt: ST.kgAnt, toplam: ST.toplam, yuzde: ST.yuzde };
var ALTIN_ST = {};   /* düz stil -> rekor satırı stili */
ALTIN_ST[ST.normal] = ST.metinA; ALTIN_ST[ST.tarih] = ST.tarihA; ALTIN_ST[ST.kgAnt] = ST.kgAntA; ALTIN_ST[ST.toplam] = ST.toplamA; ALTIN_ST[ST.kg] = ST.tmaxA;
var ANT = [['Tarih', 'tarih'], ['Antrenman', 'metin'], ['Hareket', 'metin'], ['Kas grubu', 'metin'], ['Set', 'sayi'], ['kg', 'kgAnt'], ['Tekrar', 'sayi'],
  ['Toplam (kg)', 'toplam'], ['Tahmini max (kg)', 'kg'], ['Örnek', 'metin']];
var KILO = [['Tarih', 'tarih'], ['Kilo (kg)', 'kg'], ['7 günlük ortalama (kg)', 'kg'], ['Örnek', 'metin']];
var KCAL = [['Tarih', 'tarih'], ['Kalori (kcal)', 'binlik'], ['Protein (g)', 'gram'], ['Karbonhidrat (g)', 'gram'], ['Yağ (g)', 'gram'], ['Örnek', 'metin']];
var ANA = [['Hareket', 'metin'], ['Seans', 'sayi'], ['Tahmini max (kg)', 'kg'], ['En iyi set', 'metin'], ['Tarih', 'tarih'], ['Gelişim', 'yuzde']];
var ANA_N = 8;   /* Özet: en çok yapılan ilk 8 hareket */
var KILO_GUN = 365, KCAL_GUN = 60, ORT_GUN = 28;   /* grafik pencereleri, ortalama kalori penceresi (gün) */
var SEKME = { ozet: MUREKKEP, ant: LACI, kilo: '3F8462', kcal: HARDAL };

/* satır değeri -> hücre. {n, d} (disa.js: ondalığı belli sayı) d basamağa yuvarlanır; boş -> null */
function hucre(v, tip) {
  if (v && typeof v === 'object' && 'n' in v) { if (typeof v.n !== 'number' || !isFinite(v.n)) return null; var k = Math.pow(10, v.d == null ? 2 : v.d); v = Math.round(v.n * k) / k; }
  if (v == null || v === '') return null;
  if (tip === 'tarih') { var s = seri(v); return isFinite(s) ? { v: s, s: ST.tarih } : { v: String(v) }; }
  if (tip === 'metin' || typeof v !== 'number') return { v: String(v) };
  if (!isFinite(v)) return null;
  if (tip === 'gram') v = Math.round(v * 10) / 10;
  return { v: v === 0 ? 0 : v, s: STIL[tip] || 0 };   /* -0 -> 0 */
}
/* görünen yazının yaklaşık uzunluğu (sütun genişliği için) */
function olc(h) {
  if (!dolu(h)) return 0;
  if (typeof h.v !== 'number') return String(h.v).length;
  if (h.s === ST.tarih) return 10;
  var a = Math.abs(h.v), ek = h.v < 0 ? 1 : 0;
  if (h.s === ST.kgAnt && a === 0) return 9;
  if (h.s === ST.kg || h.s === ST.kgAnt) return (Math.round(a * 10) === a * 10 ? a.toFixed(1) : a.toFixed(2)).length + ek;
  if (h.s === ST.binlik || h.s === ST.toplam) { var n = String(Math.round(a)).length; return n + Math.floor((n - 1) / 3) + ek; }
  if (h.s === ST.yuzde) return String(Math.round(a * 100)).length + 2;
  return String(h.v).length;
}
/* sütun genişliği (karakter): kalın başlık + filtre düğmesi payı, veri + kenar payı */
function gen(baslik, veri) { return Math.min(45, Math.max(7, Math.ceil(Math.max(baslik.length * 1.1 + 4, veri * 1.1 + 2)))); }
function basSatiri(sut) { return sut.map(function (c) { return { v: c[0], s: ST.baslik }; }); }
/* tablo: üst = başlığın satır numarası (1'den), bas = ilk sütun (0'dan); veri yoksa bir boş satır (Excel de başlık + bir boş satırla açar) */
function tablo(ad, sut, ust, n, bas) {
  bas = bas || 0;
  return { ad: ad, ref: harf(bas) + ust + ':' + harf(bas + sut.length - 1) + (ust + Math.max(1, n)), sutunlar: sut.map(function (c) { return c[0]; }) };
}
function genislikler(sut, satirlar) {
  return sut.map(function (c, j) { var m = 0; for (var i = 1; i < satirlar.length; i++) m = Math.max(m, olc(satirlar[i][j])); return gen(c[0], m); });
}
function tabloSayfasi(ad, tabloAd, sut, veri, sekme) {
  var satirlar = [basSatiri(sut)].concat(veri.map(function (r) { return sut.map(function (c, j) { return hucre(r[j], c[1]); }); }));
  return { ad: ad, satirlar: satirlar, genislik: genislikler(sut, satirlar), dondur: true, yukseklik: { 0: 22 }, sekme: sekme,
    tablolar: [tablo(tabloAd, sut, 1, veri.length)] };
}

function sirali(l) { return (l || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); }); }
function sayiYaz(n, d) { return AT.fmt ? AT.fmt(n, d == null ? 2 : d) : String(Math.round(n * 100) / 100).replace('.', ','); }
function p2(n) { return (n < 10 ? '0' : '') + n; }
function tarihYaz(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; }
function gunOnce(iso, n) { var t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - n * 864e5, d = new Date(t); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
var MAXT = function () { return AT.MAX_TEKRAR || 12; };
/* satırın tahmini maxı (uygulamadaki gibi 12 tekrar üstü sayılmaz) */
function satirMax(r) { return r[6] > MAXT() ? 0 : r[8] && typeof r[8] === 'object' && isFinite(r[8].n) ? r[8].n : 0; }
/* antrenman satırları (art arda aynı tarih + ad = bir antrenman) için rekorlar: bir hareketin o antrenmandaki en iyi seti,
   önceki antrenmanların hepsinden yüksekse (ilk kez yapılan hareket rekor sayılmaz). Dönüş: satır sırası -> true */
function rekorlar(ant) {
  var enIyi = Object.create(null), out = [], i = 0;
  while (i < ant.length) {
    var j = i, bu = Object.create(null);
    while (j < ant.length && ant[j][0] === ant[i][0] && ant[j][1] === ant[i][1]) {
      var v = satirMax(ant[j]), h = ant[j][2];
      if (v > 0 && (!bu[h] || v > bu[h].v + 1e-9)) bu[h] = { v: v, i: j };
      j++;
    }
    for (var h2 in bu) {
      if (enIyi[h2] > 0 && bu[h2].v > enIyi[h2] + 1e-9) out[bu[h2].i] = true;
      if (!(enIyi[h2] >= bu[h2].v)) enIyi[h2] = bu[h2].v;
    }
    i = j;
  }
  return out;
}

/* Özet verisi: kayıt aralığı, antrenman/set/toplam, kartlar için kilo/hız/kalori; en çok yapılan hareketlerin en iyi tahmini maxı
   (uygulamadaki gibi AT.tahminiMax: 12 tekrar üstü sayılmaz; Antrenmanlar sayfası CSV gibi ham tahmini maxı yazar) */
function ozetVeri(S, ant, kilo, kcal) {
  var tar = [], toplam = 0, m = Object.create(null), l = [], tmax = AT.tahminiMax || AT.e1rm, B = AT.bulkHesap;
  [ant, kilo, kcal].forEach(function (t) { t.forEach(function (r) { tar.push(r[0]); }); });
  (S.sessions || []).forEach(function (se) { if (se) tar.push(se.date); });
  tar = tar.filter(function (d) { return isFinite(seri(d)); }).sort();
  /* en yüklü antrenman (art arda aynı tarih + ad) */
  var gunTop = null, a0 = 0;
  while (a0 < ant.length) {
    var a1 = a0, t0 = 0;
    while (a1 < ant.length && ant[a1][0] === ant[a0][0] && ant[a1][1] === ant[a0][1]) { t0 += ant[a1][5] * ant[a1][6]; a1++; }
    toplam += t0; if (!gunTop || t0 > gunTop.t) gunTop = { t: t0, tarih: ant[a0][0] };
    a0 = a1;
  }
  var sesTar = (S.sessions || []).map(function (se) { return se && se.date; }).filter(function (d) { return isFinite(seri(d)); }).sort();
  sirali(S.sessions).forEach(function (se) {
    (se.exs || []).forEach(function (ex) {
      var sets = AT.yapilanSetler(ex); if (!sets.length) return;
      var h = m[ex.ad];
      if (!h) { h = m[ex.ad] = { ad: ex.ad, seans: 0, max: 0, ilk: 0, son: null }; l.push(h); }
      if (h.son !== se) { h.seans++; h.son = se; }
      var buMax = 0;
      sets.forEach(function (s) {
        var kg = AT.num(s.kg), r = AT.num(s.reps), v = tmax(kg, r, s.rpe);
        if (v > buMax) buMax = v;
        if (v > h.max + 1e-9) { h.max = v; h.kg = kg; h.r = r; h.tarih = se.date; }
      });
      if (!h.ilk && buMax > 0) h.ilk = buMax;
    });
  });
  var har = l.filter(function (h) { return h.max > 0; })
    .sort(function (a, b) { return b.seans - a.seans || b.max - a.max || (a.ad < b.ad ? -1 : 1); }).slice(0, ANA_N)
    .map(function (h) { return [h.ad, h.seans, { n: h.max, d: 1 }, sayiYaz(h.kg) + ' kg × ' + sayiYaz(h.r), h.tarih, h.seans > 1 && h.ilk > 0 ? { n: h.max / h.ilk - 1, d: 3 } : '']; });
  /* kilo: başlangıç = ilk 7 günün ortalaması; son = uygulamadaki ortalama kilo (bulk.js), yoksa son 7 günlük ortalama */
  var kl = null;
  if (kilo.length) {
    var ilkG = kilo[0][0], s7 = gunOnce(ilkG, -7), bt = 0, bn = 0, gec = B ? B.gecerli(S.bw) : null;
    kilo.forEach(function (r) { if (r[0] < s7) { bt += r[1].n; bn++; } });
    var son = gec && gec.length ? B.ortalamaKilo(gec) : null;
    if (!(son > 0)) son = kilo[kilo.length - 1][2].n;
    kl = { bas: bt / bn, son: son, n: kilo.length };
  }
  /* haftalık hız: bulk.js'in hesabı (son 28 günün tartıları; bulk sezonu varsa sezon içi) */
  var hz = null;
  if (B && kilo.length) {
    var ay = B.hizAyrinti(B.gecerli(S.bw), S.bulk && S.bulk.bas || null);
    if (ay && isFinite(ay.hiz)) hz = { hiz: ay.hiz, se: ay.se, bulk: S.bulk || null };
  }
  /* ortalama kalori: son kalori gününden geriye 28 gün */
  var kc = null;
  if (kcal.length) {
    var sonK = kcal[kcal.length - 1][0], alt = gunOnce(sonK, ORT_GUN - 1), kt = 0, kn = 0, pt = 0, pn = 0;
    kcal.forEach(function (r) { if (r[0] >= alt) { kt += r[1]; kn++; var p = typeof r[2] === 'object' ? r[2].n : r[2]; if (p > 0) { pt += p; pn++; } } });
    kc = { ort: kt / kn, gun: kn, p: pn ? pt / pn : null };
  }
  return { ilk: tar[0] || null, son: tar[tar.length - 1] || null, seans: (S.sessions || []).length, set: ant.length, toplam: Math.round(toplam * 10) / 10,
    seansIlk: sesTar[0] || null, seansSon: sesTar[sesTar.length - 1] || null, gunTop: gunTop, kilo: kl, hiz: hz, kcal: kc, hareketler: har };
}

/* Özet "pano": A ve H kenar boşluğu; B–G üç çift sütun = üç kart genişliği; hareket tablosu B–G */
function ozetKartlari(o) {
  function aralik(min, max) { return (min >= 0 ? '+' : '') + sayiYaz(min) + ' – ' + (max >= 0 ? '+' : '') + sayiYaz(max) + ' kg'; }
  return [
    { et: 'ANTRENMAN', v: o.seans, s: ST.kartSayi, not: o.seansIlk ? tarihYaz(o.seansIlk) + ' – ' + tarihYaz(o.seansSon) : 'henüz antrenman yok' },
    { et: 'TOPLAM SET', v: o.set, s: ST.kartSayi, not: o.seans && o.set ? 'antrenman başına ~' + sayiYaz(o.set / o.seans, 0) : 'ısınma setleri sayılmaz' },
    { et: 'TOPLAM KALDIRILAN', v: o.set ? Math.round(o.toplam / 100) / 10 : null, s: ST.kartTon,
      not: o.gunTop && o.gunTop.t > 0 ? 'en yüklü gün ' + sayiYaz(o.gunTop.t / 1000, 1) + ' t · ' + tarihYaz(o.gunTop.tarih) : 'kg × tekrar toplamı' },
    { et: 'KİLO DEĞİŞİMİ', v: o.kilo && o.kilo.n > 1 ? Math.round((o.kilo.son - o.kilo.bas) * 10) / 10 : null, s: ST.kartKg,
      not: o.kilo && o.kilo.n > 1 ? sayiYaz(o.kilo.bas, 1) + ' → ' + sayiYaz(o.kilo.son, 1) + ' kg (ortalama)' : 'en az 2 tartı gerekli' },
    { et: 'HAFTALIK HIZ', v: o.hiz ? Math.round(o.hiz.hiz * 100) / 100 : null, s: ST.kartHiz,
      not: !o.hiz ? 'en az 4 tartı ve 1 hafta gerekli' : o.hiz.bulk ? 'hedef ' + aralik(+o.hiz.bulk.min, +o.hiz.bulk.max) : 'son 4 haftanın tartılarından' },
    { et: 'ORTALAMA KALORİ', v: o.kcal ? Math.round(o.kcal.ort) : null, s: ST.kartKcal,
      not: !o.kcal ? 'kalori girilmemiş' : 'son ' + ORT_GUN + ' gün · ' + o.kcal.gun + ' gün kayıt' + (o.kcal.p ? ' · protein ~' + sayiYaz(o.kcal.p, 0) + ' g' : '') }
  ];
}
function ozetSayfasi(o, zaman, rekorVar) {
  var R = [], bir = [], yuk = { 0: 44, 1: 22, 2: 12, 3: 20, 4: 38, 5: 20, 6: 10, 7: 20, 8: 38, 9: 20, 10: 20, 11: 26 };
  function sat(i) { return R[i] || (R[i] = []); }
  function bant(i, v, s) { for (var c = 0; c < 8; c++) sat(i)[c] = { v: c ? null : v, s: s }; bir.push('A' + (i + 1) + ':H' + (i + 1)); }
  bant(0, 'Ağırlık Takip', ST.kapak);
  bant(1, (o.ilk ? tarihYaz(o.ilk) + ' – ' + tarihYaz(o.son) + '  ·  ' : '') + p2(zaman.getDate()) + '.' + p2(zaman.getMonth() + 1) + '.' + zaman.getFullYear() + ' tarihinde dışa aktarıldı', ST.altbaslik);
  ozetKartlari(o).forEach(function (k, i) {
    var r = i < 3 ? 3 : 7, c = 1 + 2 * (i % 3), dv = k.v != null && isFinite(k.v);
    [[k.et, ST.kartEt], [dv ? (k.v === 0 ? 0 : k.v) : '–', dv ? k.s : ST.kartBos], [k.not, ST.kartNot]].forEach(function (h, j) {
      sat(r + j)[c] = { v: h[0], s: h[1] }; sat(r + j)[c + 1] = { v: null, s: h[1] };
      bir.push(harf(c) + (r + j + 1) + ':' + harf(c + 1) + (r + j + 1));
    });
  });
  sat(11)[1] = { v: 'En çok yapılan hareketler', s: ST.bolum };
  var ust = 13;   /* tablo başlığının satır numarası */
  R[ust - 1] = [null].concat(basSatiri(ANA));
  o.hareketler.forEach(function (r, i) { R[ust + i] = [null].concat(ANA.map(function (c, j) { return hucre(r[j], c[1]); })); });
  var son = ust + Math.max(1, o.hareketler.length);   /* tablonun son satırı (1'den) */
  if (rekorVar) R[son + 1] = [null, { v: 'Antrenmanlar sayfasında altın zeminli setler: o güne kadarki en yüksek tahmini max (rekor).', s: ST.dipnot }];
  /* genişlik: hareket tablosuna göre, sonra üç çift eşitlenir (kartlar aynı boyda) */
  var w = ANA.map(function (c, j) { var m = 0; o.hareketler.forEach(function (r, i) { m = Math.max(m, olc(R[ust + i][j + 1])); }); return gen(c[0], m); });
  var cift = Math.max(w[0] + w[1], w[2] + w[3], w[4] + w[5], 34);
  w[1] = cift - w[0]; w[3] = cift - w[2]; w[5] = cift - w[4];
  var ver = veriCubugu('D' + (ust + 1) + ':D' + son);
  return { ad: 'Özet', satirlar: R, genislik: [2.5].concat(w, [2.5]), izgara: false, yukseklik: yuk, birlesik: bir, sekme: SEKME.ozet,
    kosul: o.hareketler.length ? [ver.kosul] : [], ext: o.hareketler.length ? ver.ext : '', tablolar: [tablo('HareketTablosu', ANA, ust, o.hareketler.length, 1)] };
}

/* Antrenmanlar: her antrenman bir blok; rekor setleri altın zeminli */
function antrenmanSayfasi(ant) {
  var sy = tabloSayfasi('Antrenmanlar', 'AntrenmanTablosu', ANT, ant, SEKME.ant), rek = rekorlar(ant), n = ant.length + 1;
  rek.forEach(function (v, i) {
    if (!v) return;
    sy.satirlar[i + 1] = sy.satirlar[i + 1].map(function (h) { var s = h && h.s || 0; return { v: h ? h.v : null, s: ALTIN_ST[s] != null ? ALTIN_ST[s] : s }; });
  });
  sy.rekor = rek.some(Boolean);
  if (ant.length >= 1) sy.kosul = kosulXml([
    { sqref: 'A2:J' + n, kurallar: [{ dxf: 3, f: 'OR($A2<>$A1,$B2<>$B1)' }, { dxf: 4, f: '$C2<>$C1' }] },
    { sqref: 'A2:B' + n, kurallar: [{ dxf: 6, f: 'OR($A2<>$A1,$B2<>$B1)' }, { dxf: 5, f: 'AND($A2=$A1,$B2=$B1)' }] },
    { sqref: 'C2:D' + n, kurallar: [{ dxf: 5, f: 'AND($A2=$A1,$B2=$B1,$C2=$C1)' }] }
  ]);
  return sy;
}

/* grafik penceresi: tarihe göre sıralı satırların son `gun` günü -> ilk satır sırası */
function pencere(veri, gun) { if (!veri.length) return 0; var alt = gunOnce(veri[veri.length - 1][0], gun - 1), i = 0; while (veri[i][0] < alt) i++; return i; }
function deger(v) { return v && typeof v === 'object' ? (isFinite(v.n) ? Math.round(v.n * 100) / 100 : null) : typeof v === 'number' ? v : null; }
function kiloSayfasi(kilo) {
  var sy = tabloSayfasi('Kilo', 'KiloTablosu', KILO, kilo, SEKME.kilo);
  if (kilo.length < 2) return sy;
  var i0 = pencere(kilo, KILO_GUN), w = kilo.slice(i0), a = i0 + 2, b = kilo.length + 1, ys = [];
  w.forEach(function (r) { ys.push(deger(r[1]), deger(r[2])); });
  ys = ys.filter(function (v) { return v != null; });
  sy.genislik.push(3);
  /* y ekseni veriye yakın, tam sayı adımlı (Excel'in kendi adımı 0,5 olunca "0" biçimiyle etiketler tekrar ediyordu) */
  var lo = Math.min.apply(null, ys) - 0.5, hi = Math.max.apply(null, ys) + 0.5, adim = hi - lo <= 8 ? 1 : hi - lo <= 16 ? 2 : 5;
  sy.grafik = { baslik: i0 ? 'Kilo · son 12 ay' : 'Kilo', konum: [5, 1, 15, 22], yBicim: '0', yAdim: adim,
    yMin: Math.floor(lo / adim) * adim, yMax: Math.ceil(hi / adim) * adim,
    kat: { ref: "'Kilo'!$A$" + a + ':$A$' + b, v: w.map(function (r) { return seri(r[0]); }) },
    seriler: [{ ad: 'Tartı', tur: 'nokta', ref: "'Kilo'!$B$" + a + ':$B$' + b, v: w.map(function (r) { return deger(r[1]); }) },
      { ad: '7 günlük ortalama', tur: 'cizgi', ref: "'Kilo'!$C$" + a + ':$C$' + b, v: w.map(function (r) { return deger(r[2]); }) }] };
  return sy;
}
/* önerilen günlük kalori: bu sezonun haftalık önerisi (S.kcalOneri), yoksa bulk.js hesabı; sezon yoksa null. Durumu değiştirmez. */
function hedefKcal(S) {
  var b = S.bulk; if (!b) return null;
  var o = S.kcalOneri, an = [b.bas, b.hedefKg, b.min, b.max].join('|');
  if (o && o.anahtar === an && o.deger > 0) return o.deger;
  try { var r = AT.bulkHesap && AT.iso && AT.bulkHesap.hesapla(S.bw, b, AT.iso(new Date()), S.kcal); return r && r.hedefKcal > 0 ? r.hedefKcal : null; } catch (e) { return null; }
}
function kaloriSayfasi(kcal, hedef) {
  var sy = tabloSayfasi('Kalori', 'KaloriTablosu', KCAL, kcal, SEKME.kcal);
  if (kcal.length < 2) return sy;
  var i0 = pencere(kcal, KCAL_GUN), w = kcal.slice(i0), a = i0 + 2, b = kcal.length + 1;
  sy.genislik.push(3);
  var ser = [{ ad: 'Kalori', tur: 'sutun', ref: "'Kalori'!$B$" + a + ':$B$' + b, v: w.map(function (r) { return r[1]; }) }];
  if (hedef > 0) ser.push({ ad: 'Önerilen (' + sayiYaz(hedef, 0) + ' kcal)', tur: 'hedef', v: w.map(function () { return hedef; }) });
  sy.grafik = { baslik: 'Günlük kalori · son ' + KCAL_GUN + ' gün', konum: [7, 1, 16, 22], yBicim: '#,##0', yMin: 0, xAdim: 7,
    kat: { ref: "'Kalori'!$A$" + a + ':$A$' + b, v: w.map(function (r) { return seri(r[0]); }) }, seriler: ser };
  return sy;
}

/* S -> { bos, sayfalar, say }. Satırlar disa.js'teki CSV satırlarıyla aynı (aynı süzgeç ve kurallar). */
function kitap(S, zaman) {
  var C = AT._csv, ant = C.antrenmanSatirlari(S.sessions || []), kilo = C.kiloSatirlari(S.bw || []), kcal = C.kaloriSatirlari(S.kcal || []);
  var an = antrenmanSayfasi(ant);
  return {
    bos: !ant.length && !kilo.length && !kcal.length && !(S.sessions || []).length,
    say: { seans: (S.sessions || []).length, set: ant.length, kilo: kilo.length, kcal: kcal.length },
    sayfalar: [ozetSayfasi(ozetVeri(S, ant, kilo, kcal), zaman || new Date(), an.rekor), an, kiloSayfasi(kilo), kaloriSayfasi(kcal, hedefKcal(S))]
  };
}

AT._xlsx = { crc32: crc32, zip: zip, deflate: deflate, utf8: utf8, x: x, metinXml: metinXml, seri: seri, harf: harf, xlsx: xlsx, paket: paket, kitap: kitap,
  ozetVeri: ozetVeri, hucre: hucre, rekorlar: rekorlar, tabloSayfasi: tabloSayfasi, grafikXml: grafikXml, XLSX_TUR: XLSX_TUR, ST: ST, TABLO_STIL: TABLO_STIL };

AT.islem['excel-indir'] = function () {
  if (!AT._csv) return AT.toast('Excel aktarımı yüklenemedi');
  var simdi = new Date(), k = kitap(AT.S, simdi), b;
  if (k.bos) return AT.toast('Dışa aktarılacak kayıt yok');
  try { b = xlsx(k.sayfalar, simdi); } catch (e) { if (window.console) console.error(e); return AT.toast('Excel dosyası hazırlanamadı'); }
  AT.indir(new Blob([b], { type: XLSX_TUR }), 'agirlik-takip-' + AT.iso(simdi) + '.xlsx');
  AT.toast('Excel dosyası indirildi');
};
})(window.AT);
