/* excel.js: modül (window.AT'ye kayıt olur; index.html'de disa.js'ten sonra yüklenir)
   "Excel'e aktar": tek .xlsx dosyası, dört sayfa: Özet · Antrenmanlar · Kilo · Kalori.
   Her sayfada gerçek Excel Tablosu (TableStyleMedium2: şeritli satır + filtre düğmesi), kalın başlık, veri sayfalarında
   dondurulmuş başlık satırı, içeriğe göre sütun genişliği. Tarih = Excel seri günü + gg.aa.yyyy; kg 0,0# · kcal #.##0 ·
   gram 0,1'e yuvarlı Genel biçim (0,# Excel'de tam sayının sonuna virgül koyar). Metinler inlineStr; formül yazılmaz.
   Satırlar disa.js'ten (AT._csv: antrenmanSatirlari / kiloSatirlari / kaloriSatirlari): CSV ile aynı kurallar.
   Bağımlılık yok: SpreadsheetML elle yazılır, sıkıştırmasız (STORE) ZIP'e konur. Test: Temp/agt/excel-test.js */
(function (AT) {
'use strict';

/* ---------- ZIP (STORE): yerel dosya başlıkları + merkezi dizin + bitiş kaydı ---------- */
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
/* dosyalar: [{ad (ASCII), veri: metin | Uint8Array}] -> .zip baytları (Uint8Array) */
function zip(dosyalar, zaman) {
  var d = zaman || new Date(), yil = Math.min(2107, Math.max(1980, d.getFullYear()));
  var saat = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var gun = ((yil - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  var parca = [], merkez = [], ofs = 0, mBoy = 0;
  dosyalar.forEach(function (f) {
    var ad = utf8(f.ad), veri = typeof f.veri === 'string' ? utf8(f.veri) : f.veri, crc = crc32(veri);
    var y = new Uint8Array(30 + ad.length), v = new DataView(y.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0, true); v.setUint16(8, 0, true);
    v.setUint16(10, saat, true); v.setUint16(12, gun, true); v.setUint32(14, crc, true);
    v.setUint32(18, veri.length, true); v.setUint32(22, veri.length, true); v.setUint16(26, ad.length, true); v.setUint16(28, 0, true);
    y.set(ad, 30);
    var m = new Uint8Array(46 + ad.length), w = new DataView(m.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0, true); w.setUint16(10, 0, true);
    w.setUint16(12, saat, true); w.setUint16(14, gun, true); w.setUint32(16, crc, true);
    w.setUint32(20, veri.length, true); w.setUint32(24, veri.length, true); w.setUint16(28, ad.length, true);
    w.setUint32(42, ofs, true);   /* 30–41: ek alan, yorum, disk, öznitelikler = 0 */
    m.set(ad, 46);
    parca.push(y, veri); merkez.push(m); ofs += y.length + veri.length; mBoy += m.length;
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

/* ---------- stiller ve tema ---------- */
var MUREKKEP = '3D5D8A';   /* uygulamanın lacivert mürekkebi (style.css --ac, açık tema) */
/* hücre stilleri: styles.xml cellXfs sırası */
var ST = { normal: 0, baslik: 1, tarih: 2, kg: 3, binlik: 4, kapak: 5, soluk: 6, kalin: 7 };
function font(ic) { return '<font>' + ic + '<name val="Calibri"/><family val="2"/></font>'; }
function xf(numFmt, fontId, fillId) {
  return '<xf numFmtId="' + numFmt + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="0" xfId="0"' +
    (numFmt ? ' applyNumberFormat="1"' : '') + (fontId ? ' applyFont="1"' : '') + (fillId ? ' applyFill="1"' : '') + '/>';
}
var STILLER = XB + '<styleSheet xmlns="' + NS + '">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="165" formatCode="0.0#"/></numFmts>' +
  '<fonts count="5">' + font('<sz val="11"/>') + font('<b/><sz val="11"/><color rgb="FFFFFFFF"/>') + font('<b/><sz val="16"/><color rgb="FF' + MUREKKEP + '"/>') +
    font('<sz val="11"/><color rgb="FF6A6C70"/>') + font('<b/><sz val="11"/>') + '</fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF' + MUREKKEP + '"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  /* normal · başlık (kalın beyaz, mürekkep zemin: tablo stilini tanımayan uygulamalarda da başlık belli) · tarih · kg · binlik · kapak · soluk · kalın */
  '<cellXfs count="8">' + xf(0, 0, 0) + xf(0, 1, 2) + xf(164, 0, 0) + xf(165, 0, 0) + xf(3, 0, 0) + xf(0, 2, 0) + xf(0, 3, 0) + xf(0, 4, 0) + '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
/* tema: TableStyleMedium2 accent1 rengini kullanır -> başlık ve şeritler mürekkep lacivert tonlarında */
var DOLGU3 = new Array(4).join('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>');
var TEMA = XB + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Agirlik Takip"><a:themeElements>' +
  '<a:clrScheme name="Agirlik Takip"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="26282C"/></a:dk2><a:lt2><a:srgbClr val="F7F4EE"/></a:lt2>' +
  [MUREKKEP, '9A6B1F', '3F8462', 'B4544A', '6F8FBF', '8F949B'].map(function (c, i) { return '<a:accent' + (i + 1) + '><a:srgbClr val="' + c + '"/></a:accent' + (i + 1) + '>'; }).join('') +
  '<a:hlink><a:srgbClr val="' + MUREKKEP + '"/></a:hlink><a:folHlink><a:srgbClr val="6A6C70"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Agirlik Takip"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Agirlik Takip"><a:fillStyleLst>' + DOLGU3 + '</a:fillStyleLst><a:lnStyleLst>' +
  [6350, 12700, 19050].map(function (w) { return '<a:ln w="' + w + '"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'; }).join('') +
  '</a:lnStyleLst><a:effectStyleLst>' + new Array(4).join('<a:effectStyle><a:effectLst/></a:effectStyle>') + '</a:effectStyleLst>' +
  '<a:bgFillStyleLst>' + DOLGU3 + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

/* ---------- sayfa ve tablo XML ---------- */
/* sayfa: {ad, satirlar: [[{v, s} | null] | null], genislik: [karakter], tablolar: [{ad, ref, sutunlar}], dondur, izgara, yukseklik: {satırNo0: pt}} */
function hucreXml(ref, h) {
  var s = h.s ? ' s="' + h.s + '"' : '';
  if (typeof h.v === 'number') return '<c r="' + ref + '"' + s + '><v>' + h.v + '</v></c>';
  var t = String(h.v);
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t' + (/^\s|\s$/.test(t) ? ' xml:space="preserve"' : '') + '>' + metinXml(t) + '</t></is></c>';
}
function dolu(h) { return !!h && h.v != null && h.v !== '' && (typeof h.v !== 'number' || isFinite(h.v)); }
function sayfaXml(sy, secili) {
  var satir = [], enC = sy.genislik.length, enR = 1;
  sy.satirlar.forEach(function (r, i) {
    if (!r) return;
    var c = '';
    r.forEach(function (h, j) { if (dolu(h)) { c += hucreXml(harf(j) + (i + 1), h); enC = Math.max(enC, j + 1); } });
    if (!c) return;
    var y = sy.yukseklik && sy.yukseklik[i];
    satir.push('<row r="' + (i + 1) + '"' + (y ? ' ht="' + y + '" customHeight="1"' : '') + '>' + c + '</row>');
    enR = i + 1;
  });
  var t = sy.tablolar || [];
  t.forEach(function (tb) { enR = Math.max(enR, +/\d+$/.exec(tb.ref)[0]); });
  var gor = '<sheetView workbookViewId="0"' + (sy.izgara === false ? ' showGridLines="0"' : '') + (secili ? ' tabSelected="1"' : '') + '>' +
    (sy.dondur ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') + '</sheetView>';
  return XB + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '"><dimension ref="A1:' + harf(enC - 1) + enR + '"/>' +
    '<sheetViews>' + gor + '</sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>' +
    sy.genislik.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
    '<sheetData>' + satir.join('') + '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    (t.length ? '<tableParts count="' + t.length + '">' + t.map(function (_, j) { return '<tablePart r:id="rId' + (j + 1) + '"/>'; }).join('') + '</tableParts>' : '') +
    '</worksheet>';
}
/* Excel Tablosu: başlık hücreleri sütun adlarıyla birebir aynı olmalı (yoksa Excel "onarır") */
function tabloXml(id, tb) {
  return XB + '<table xmlns="' + NS + '" id="' + id + '" name="' + tb.ad + '" displayName="' + tb.ad + '" ref="' + tb.ref + '" totalsRowShown="0">' +
    '<autoFilter ref="' + tb.ref + '"/><tableColumns count="' + tb.sutunlar.length + '">' +
    tb.sutunlar.map(function (a, i) { return '<tableColumn id="' + (i + 1) + '" name="' + x(a) + '"/>'; }).join('') + '</tableColumns>' +
    '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>';
}
function zamanW3c(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

/* sayfalar -> .xlsx baytları. İlk sayfa açılışta seçili. */
function xlsx(sayfalar, zaman) {
  zaman = zaman || new Date();
  var d = [{ ad: '[Content_Types].xml', veri: '' }], tabloN = 0, tur = '';
  d.push({ ad: '_rels/.rels', veri: rels([[REL + 'officeDocument', 'xl/workbook.xml'],
    ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], [REL + 'extended-properties', 'docProps/app.xml']]) });
  d.push({ ad: 'docProps/core.xml', veri: XB + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>Ağırlık Takip</dc:title><dc:creator>Ağırlık Takip</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + zamanW3c(zaman) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + zamanW3c(zaman) + '</dcterms:modified></cp:coreProperties>' });
  d.push({ ad: 'docProps/app.xml', veri: XB + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Ağırlık Takip</Application></Properties>' });
  d.push({ ad: 'xl/workbook.xml', veri: XB + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    sayfalar.map(function (s, i) { return '<sheet name="' + x(s.ad) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
  d.push({ ad: 'xl/_rels/workbook.xml.rels', veri: rels(sayfalar.map(function (s, i) { return [REL + 'worksheet', 'worksheets/sheet' + (i + 1) + '.xml']; })
    .concat([[REL + 'styles', 'styles.xml'], [REL + 'theme', 'theme/theme1.xml']])) });
  d.push({ ad: 'xl/styles.xml', veri: STILLER });
  d.push({ ad: 'xl/theme/theme1.xml', veri: TEMA });
  sayfalar.forEach(function (s, i) {
    var ad = 'sheet' + (i + 1) + '.xml', t = s.tablolar || [];
    d.push({ ad: 'xl/worksheets/' + ad, veri: sayfaXml(s, i === 0) });
    tur += '<Override PartName="/xl/worksheets/' + ad + '" ContentType="' + OOX + 'spreadsheetml.worksheet+xml"/>';
    if (!t.length) return;
    d.push({ ad: 'xl/worksheets/_rels/' + ad + '.rels', veri: rels(t.map(function (_, j) { return [REL + 'table', '../tables/table' + (tabloN + j + 1) + '.xml']; })) });
    t.forEach(function (tb) {
      tabloN++;
      d.push({ ad: 'xl/tables/table' + tabloN + '.xml', veri: tabloXml(tabloN, tb) });
      tur += '<Override PartName="/xl/tables/table' + tabloN + '.xml" ContentType="' + OOX + 'spreadsheetml.table+xml"/>';
    });
  });
  d[0].veri = XB + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="' + OOX + 'spreadsheetml.sheet.main+xml"/>' + tur +
    '<Override PartName="/xl/styles.xml" ContentType="' + OOX + 'spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="' + OOX + 'theme+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="' + OOX + 'extended-properties+xml"/></Types>';
  return zip(d, zaman);
}

/* ---------- veriden sayfalara ---------- */
/* sütun tipleri: tarih · metin · kg (0,0#) · binlik (#.##0) · sayi / gram (Genel) */
var STIL = { tarih: ST.tarih, kg: ST.kg, binlik: ST.binlik };
var ANT = [['Tarih', 'tarih'], ['Antrenman', 'metin'], ['Hareket', 'metin'], ['Kas grubu', 'metin'], ['Set', 'sayi'], ['kg', 'kg'], ['Tekrar', 'sayi'],
  ['Toplam (kg)', 'kg'], ['Tahmini max (kg)', 'kg'], ['Örnek', 'metin']];
var KILO = [['Tarih', 'tarih'], ['Kilo (kg)', 'kg'], ['7 günlük ortalama (kg)', 'kg'], ['Örnek', 'metin']];
var KCAL = [['Tarih', 'tarih'], ['Kalori (kcal)', 'binlik'], ['Protein (g)', 'gram'], ['Karbonhidrat (g)', 'gram'], ['Yağ (g)', 'gram'], ['Örnek', 'metin']];
var ANA = [['Hareket', 'metin'], ['En iyi tahmini max (kg)', 'kg'], ['En iyi set', 'metin'], ['Tarih', 'tarih'], ['Seans', 'sayi']];
var ANA_N = 8;   /* Özet: en çok yapılan ilk 8 hareket */

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
  if (h.s === ST.kg) return (Math.round(a * 10) === a * 10 ? a.toFixed(1) : a.toFixed(2)).length + ek;
  if (h.s === ST.binlik) { var n = String(Math.round(a)).length; return n + Math.floor((n - 1) / 3) + ek; }
  return String(h.v).length;
}
/* sütun genişliği (karakter): kalın başlık + filtre düğmesi payı, veri + kenar payı */
function gen(baslik, veri) { return Math.min(45, Math.max(7, Math.ceil(Math.max(baslik.length * 1.1 + 4, veri * 1.1 + 2)))); }
function basSatiri(sut) { return sut.map(function (c) { return { v: c[0], s: ST.baslik }; }); }
/* tablo: üst = başlığın satır numarası (1'den); veri yoksa bir boş satır (Excel de başlık + bir boş satırla açar) */
function tablo(ad, sut, ust, n) { return { ad: ad, ref: 'A' + ust + ':' + harf(sut.length - 1) + (ust + Math.max(1, n)), sutunlar: sut.map(function (c) { return c[0]; }) }; }

function tabloSayfasi(ad, tabloAd, sut, veri) {
  var satirlar = [basSatiri(sut)].concat(veri.map(function (r) { return sut.map(function (c, j) { return hucre(r[j], c[1]); }); }));
  var genislik = sut.map(function (c, j) { var m = 0; for (var i = 1; i < satirlar.length; i++) m = Math.max(m, olc(satirlar[i][j])); return gen(c[0], m); });
  return { ad: ad, satirlar: satirlar, genislik: genislik, dondur: true, tablolar: [tablo(tabloAd, sut, 1, veri.length)] };
}

function sirali(l) { return (l || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); }); }
function sayiYaz(n) { return AT.fmt ? AT.fmt(n, 2) : String(Math.round(n * 100) / 100).replace('.', ','); }
function p2(n) { return (n < 10 ? '0' : '') + n; }

/* Özet verisi: kayıt aralığı, antrenman/set/toplam; en çok yapılan hareketlerin en iyi tahmini maxı
   (uygulamadaki gibi AT.tahminiMax: 12 tekrar üstü sayılmaz; Antrenmanlar sayfası CSV gibi ham tahmini maxı yazar) */
function ozetVeri(S, ant, kilo, kcal) {
  var tar = [], toplam = 0, m = Object.create(null), l = [], tmax = AT.tahminiMax || AT.e1rm;
  [ant, kilo, kcal].forEach(function (t) { t.forEach(function (r) { tar.push(r[0]); }); });
  (S.sessions || []).forEach(function (se) { if (se) tar.push(se.date); });
  tar = tar.filter(function (d) { return isFinite(seri(d)); }).sort();
  ant.forEach(function (r) { toplam += r[5] * r[6]; });
  sirali(S.sessions).forEach(function (se) {
    (se.exs || []).forEach(function (ex) {
      var sets = AT.yapilanSetler(ex); if (!sets.length) return;
      var h = m[ex.ad];
      if (!h) { h = m[ex.ad] = { ad: ex.ad, seans: 0, max: 0, son: null }; l.push(h); }
      if (h.son !== se) { h.seans++; h.son = se; }
      sets.forEach(function (s) {
        var kg = AT.num(s.kg), r = AT.num(s.reps), v = tmax(kg, r, s.rpe);
        if (v > h.max + 1e-9) { h.max = v; h.kg = kg; h.r = r; h.tarih = se.date; }
      });
    });
  });
  var har = l.filter(function (h) { return h.max > 0; })
    .sort(function (a, b) { return b.seans - a.seans || b.max - a.max || (a.ad < b.ad ? -1 : 1); }).slice(0, ANA_N)
    .map(function (h) { return [h.ad, { n: h.max, d: 1 }, sayiYaz(h.kg) + ' kg × ' + sayiYaz(h.r), h.tarih, h.seans]; });
  return { ilk: tar[0] || null, son: tar[tar.length - 1] || null, seans: (S.sessions || []).length, set: ant.length, toplam: Math.round(toplam * 10) / 10, hareketler: har };
}

function ozetSayfasi(o, zaman) {
  var bilgi = [['İlk kayıt', hucre(o.ilk, 'tarih')], ['Son kayıt', hucre(o.son, 'tarih')], ['Antrenman', hucre(o.seans, 'sayi')], ['Set', hucre(o.set, 'sayi')],
    ['Toplam kaldırılan (kg)', hucre(o.toplam, 'binlik')]];
  var R = [[{ v: 'Ağırlık Takip', s: ST.kapak }], [{ v: p2(zaman.getDate()) + '.' + p2(zaman.getMonth() + 1) + '.' + zaman.getFullYear() + ' tarihinde dışa aktarıldı', s: ST.soluk }], null];
  bilgi.forEach(function (b) { R.push([{ v: b[0], s: ST.soluk }, b[1]]); });
  R.push(null, [{ v: 'En çok yapılan hareketler', s: ST.kalin }]);
  var ust = R.length + 1;   /* tablo başlığının satır numarası */
  R.push(basSatiri(ANA));
  o.hareketler.forEach(function (r) { R.push(ANA.map(function (c, j) { return hucre(r[j], c[1]); })); });
  var veri = R.slice(ust);
  var genislik = ANA.map(function (c, j) {
    var m = 0; veri.forEach(function (r) { m = Math.max(m, olc(r[j])); });
    if (j === 0) bilgi.forEach(function (b) { m = Math.max(m, b[0].length); });
    if (j === 1) bilgi.forEach(function (b) { m = Math.max(m, olc(b[1])); });
    return gen(c[0], m);
  });
  return { ad: 'Özet', satirlar: R, genislik: genislik, izgara: false, yukseklik: { 0: 24 }, tablolar: [tablo('HareketTablosu', ANA, ust, o.hareketler.length)] };
}

/* S -> { bos, sayfalar, say }. Satırlar disa.js'teki CSV satırlarıyla aynı (aynı süzgeç ve kurallar). */
function kitap(S, zaman) {
  var C = AT._csv, ant = C.antrenmanSatirlari(S.sessions || []), kilo = C.kiloSatirlari(S.bw || []), kcal = C.kaloriSatirlari(S.kcal || []);
  return {
    bos: !ant.length && !kilo.length && !kcal.length && !(S.sessions || []).length,
    say: { seans: (S.sessions || []).length, set: ant.length, kilo: kilo.length, kcal: kcal.length },
    sayfalar: [ozetSayfasi(ozetVeri(S, ant, kilo, kcal), zaman || new Date()),
      tabloSayfasi('Antrenmanlar', 'AntrenmanTablosu', ANT, ant), tabloSayfasi('Kilo', 'KiloTablosu', KILO, kilo), tabloSayfasi('Kalori', 'KaloriTablosu', KCAL, kcal)]
  };
}

AT._xlsx = { crc32: crc32, zip: zip, utf8: utf8, x: x, metinXml: metinXml, seri: seri, harf: harf, xlsx: xlsx, kitap: kitap, ozetVeri: ozetVeri, hucre: hucre,
  tabloSayfasi: tabloSayfasi, XLSX_TUR: XLSX_TUR, ST: ST };

AT.islem['excel-indir'] = function () {
  if (!AT._csv) return AT.toast('Excel aktarımı yüklenemedi');
  var simdi = new Date(), k = kitap(AT.S, simdi), b;
  if (k.bos) return AT.toast('Dışa aktarılacak kayıt yok');
  try { b = xlsx(k.sayfalar, simdi); } catch (e) { if (window.console) console.error(e); return AT.toast('Excel dosyası hazırlanamadı'); }
  AT.indir(new Blob([b], { type: XLSX_TUR }), 'agirlik-takip-' + AT.iso(simdi) + '.xlsx');
  AT.toast('Excel dosyası indirildi');
};
})(window.AT);
