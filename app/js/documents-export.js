// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — exports (0.40.0, étape 4). Logique seule, testable sous Node, sans bibliothèque :
 *   texte  → Word (.docx, modifications suivies comprises si demandé), RTF, PDF ;
 *   tableur → Excel (.xlsx : valeurs, formules en anglais avec leurs résultats, mises en forme, formats, largeurs,
 *             hauteurs, fusions, volets figés, filtre, listes de choix, mise en forme conditionnelle), CSV, PDF.
 * Archives ZIP écrites à la main (sans compression), XML écrit en clair. Un fichier exporté sort du chiffrement de
 * Tessera : le droit d'exporter est réglé par document (module-documents.js), chaque export est inscrit au journal.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./module-documents.js'), require('./tableur.js'), require('./pdf.js'));
  else (root.SIC = root.SIC || {}).documentsExport = factory(root.SIC.documents, root.SIC.tableur, root.SIC.pdf);
})(typeof self !== 'undefined' ? self : this, function (DM, T, PDF) {
  'use strict';
  var enc = new TextEncoder();

  // ------------------------------------------------------------ ZIP (méthode « stockée »)
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(o) { var c = 0xFFFFFFFF; for (var i = 0; i < o.length; i++) c = CRC[(c ^ o[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /** Archive ZIP de fichiers [{ nom, contenu (texte ou octets) }]. */
  function zip(fichiers) {
    var parties = [], central = [], pos = 0, d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    fichiers.forEach(function (f) {
      var nom = enc.encode(f.nom), o = typeof f.contenu === 'string' ? enc.encode(f.contenu) : f.contenu, c = crc32(o);
      var h = new Uint8Array(30 + nom.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, dt, true); v.setUint16(12, dd, true);
      v.setUint32(14, c, true); v.setUint32(18, o.length, true); v.setUint32(22, o.length, true); v.setUint16(26, nom.length, true); v.setUint16(28, 0, true); h.set(nom, 30);
      var e = new Uint8Array(46 + nom.length), w = new DataView(e.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true); w.setUint16(12, dt, true); w.setUint16(14, dd, true);
      w.setUint32(16, c, true); w.setUint32(20, o.length, true); w.setUint32(24, o.length, true); w.setUint16(28, nom.length, true); w.setUint32(42, pos, true); e.set(nom, 46);
      parties.push(h, o); central.push(e); pos += h.length + o.length;
    });
    var tc = central.reduce(function (s, x) { return s + x.length; }, 0), fin = new Uint8Array(22), z = new DataView(fin.buffer);
    z.setUint32(0, 0x06054b50, true); z.setUint16(8, fichiers.length, true); z.setUint16(10, fichiers.length, true); z.setUint32(12, tc, true); z.setUint32(16, pos, true);
    var tout = parties.concat(central, [fin]), n = tout.reduce(function (s, x) { return s + x.length; }, 0), res = new Uint8Array(n), k = 0;
    tout.forEach(function (x) { res.set(x, k); k += x.length; });
    return res;
  }

  // ------------------------------------------------------------ Correspondances
  function x(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var POLICES = { arial: 'Arial', calibri: 'Calibri', cambria: 'Cambria', georgia: 'Georgia', times: 'Times New Roman', verdana: 'Verdana', tahoma: 'Tahoma', trebuchet: 'Trebuchet MS', courier: 'Courier New' };
  var COULEURS = { gris: '666666', rouge: 'C00000', orange: 'C55A11', vert: '2E7D32', bleu: '1F4E9C', violet: '7030A0', marron: '7B4B2A' };
  var FONDS = { jaune: 'FFF176', vert: 'C5E8B7', bleu: 'BFE3F5', rose: 'F8C8DC', gris: 'DDDDDD', orange: 'FFD8A8', violet: 'E2D4F3' };
  var SURLIGNAGE = { jaune: 'yellow', vert: 'green', bleu: 'cyan', rose: 'magenta', gris: 'lightGray' };
  function rgb(h) { return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
  function remplir(modele, v) { return String(modele || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }); }
  function blocsTexte(c, final) { var x0 = final ? DM.resoudreSuivi(c, true) : DM.contenu(c); return DM.ongletsDe(x0); }
  function nomFichier(t) { return String(t || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ._-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'document'; }

  // ------------------------------------------------------------ Word (.docx)
  /**
   * Document Word. `o` : { suivi: 'marques' (modifications suivies écrites en révisions Word) | 'final' (acceptées),
   * valeurs: champs de l'en-tête et du pied de page (titre, date, service, auteur, version) }.
   */
  function docx(contenu, meta, o) {
    o = o || {};
    var c = DM.contenu(contenu), p = c.page, final = o.suivi !== 'marques', os = blocsTexte(c, final), idRev = 1, v = Object.assign({ titre: (meta && meta.titre) || '' }, o.valeurs || {});
    function rPr(r, sansChangement) {
      var s = '';
      if (r.p && POLICES[r.p]) s += '<w:rFonts w:ascii="' + x(POLICES[r.p]) + '" w:hAnsi="' + x(POLICES[r.p]) + '" w:cs="' + x(POLICES[r.p]) + '"/>';
      if (r.g) s += '<w:b/>'; if (r.i) s += '<w:i/>'; if (r.b) s += '<w:strike/>';
      if (r.c && COULEURS[r.c]) s += '<w:color w:val="' + COULEURS[r.c] + '"/>';
      if (r.z) s += '<w:sz w:val="' + Math.round(r.z * 2) + '"/><w:szCs w:val="' + Math.round(r.z * 2) + '"/>';
      if (r.f && SURLIGNAGE[r.f]) s += '<w:highlight w:val="' + SURLIGNAGE[r.f] + '"/>';
      if (r.s) s += '<w:u w:val="single"/>';
      if (!sansChangement && !final && r.fmt) s += '<w:rPrChange w:id="' + (idRev++) + '" w:author="' + x(r.fmt.n || r.fmt.p) + '" w:date="' + x(r.fmt.le) + '"><w:rPr>' + rPr(r.fmt.avant || {}, true) + '</w:rPr></w:rPrChange>';
      return s ? '<w:rPr>' + s + '</w:rPr>' : '';
    }
    function runsXml(runs) {
      return (runs || []).map(function (r) {
        var del = !final && r.del, morceaux = String(r.x).split('\n'), t = morceaux.map(function (m, i) { return (i ? '<w:br/>' : '') + (m ? (del ? '<w:delText xml:space="preserve">' : '<w:t xml:space="preserve">') + x(m) + (del ? '</w:delText>' : '</w:t>') : ''); }).join('');
        var run = '<w:r>' + rPr(r) + t + '</w:r>';
        if (!final && r.ins) return '<w:ins w:id="' + (idRev++) + '" w:author="' + x(r.ins.n || r.ins.p) + '" w:date="' + x(r.ins.le) + '">' + run + '</w:ins>';
        if (del) return '<w:del w:id="' + (idRev++) + '" w:author="' + x(r.del.n || r.del.p) + '" w:date="' + x(r.del.le) + '">' + run + '</w:del>';
        return run;
      }).join('');
    }
    function marquePara(b) {
      if (final || !b.suivi) return '';
      var m = b.suivi, att = ' w:id="' + (idRev++) + '" w:author="' + x(m.n || m.p) + '" w:date="' + x(m.le) + '"';
      return m.op === 'ins' || m.op === 'ajout' ? '<w:rPr><w:ins' + att + '/></w:rPr>' : m.op === 'del' ? '<w:rPr><w:del' + att + '/></w:rPr>' : '';
    }
    function para(b) {
      var pp = '';
      if (/^h[123]$/.test(b.t)) pp += '<w:pStyle w:val="Titre' + b.t[1] + '"/>';
      if (b.t === 'li') pp += '<w:pStyle w:val="Paragraphedeliste"/><w:numPr><w:ilvl w:val="' + (b.n || 0) + '"/><w:numId w:val="' + (b.liste === 'ol' ? 2 : 1) + '"/></w:numPr>';
      if (b.r) pp += '<w:ind w:left="' + (b.r * 709) + '"/>';
      if (b.al && b.al !== 'g') pp += '<w:jc w:val="' + { c: 'center', d: 'right', j: 'both' }[b.al] + '"/>';
      pp += marquePara(b);
      return '<w:p>' + (pp ? '<w:pPr>' + pp + '</w:pPr>' : '') + runsXml(b.runs) + '</w:p>';
    }
    var largeurUtile = Math.round(((p.orientation === 'paysage' ? 297 : 210) - p.marges.g - p.marges.d) * 56.7);
    function table(b) {
      var n = b.lignes[0].length, larg = (b.largeurs || b.lignes[0].map(function () { return 100 / n; })).map(function (w) { return Math.round(largeurUtile * w / 100); });
      var s = '<w:tbl><w:tblPr><w:tblW w:w="' + largeurUtile + '" w:type="dxa"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="777777"/>'; }).join('') + '</w:tblBorders></w:tblPr>';
      s += '<w:tblGrid>' + larg.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
      b.lignes.forEach(function (l, i) {
        s += '<w:tr>' + (b.entete && i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + l.map(function (cel, j) {
          var runs = b.entete && i === 0 ? cel.runs.map(function (r) { return Object.assign({}, r, { g: true }); }) : cel.runs;
          return '<w:tc><w:tcPr><w:tcW w:w="' + larg[j] + '" w:type="dxa"/>' + (b.entete && i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '') + '</w:tcPr>' + para({ t: 'p', runs: runs, al: cel.al }) + '</w:tc>';
        }).join('') + '</w:tr>';
      });
      return s + '</w:tbl><w:p/>';
    }
    var saut = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>', corps = '';
    os.forEach(function (on, i) {
      if (i) corps += saut;
      if (on.titre && os.length > 1) corps += '<w:p><w:pPr><w:pStyle w:val="Titre"/></w:pPr><w:r><w:t xml:space="preserve">' + x(on.titre) + '</w:t></w:r></w:p>';
      on.blocs.forEach(function (b) { corps += b.t === 'table' ? table(b) : b.t === 'saut' ? saut : para(b); });
    });
    // En-tête et pied de page : trois zones (tabulations centrée et droite), « {page} » devient un champ PAGE
    function zonesXml(z) {
      var parts = ['gauche', 'centre', 'droite'].map(function (k) {
        return String(z[k] || '').split('{page}').map(function (morceau, i) { return (i ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' : '') + (morceau ? '<w:r><w:t xml:space="preserve">' + x(remplir(morceau, v)) + '</w:t></w:r>' : ''); }).join('');
      });
      return '<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(largeurUtile / 2) + '"/><w:tab w:val="right" w:pos="' + largeurUtile + '"/></w:tabs><w:rPr><w:sz w:val="17"/><w:color w:val="555555"/></w:rPr></w:pPr>' + parts[0] + '<w:r><w:tab/></w:r>' + parts[1] + '<w:r><w:tab/></w:r>' + parts[2] + '</w:p>';
    }
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var tw = function (mm) { return Math.round(mm * 56.7); }, paysage = p.orientation === 'paysage';
    var sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="' + (paysage ? 16838 : 11906) + '" w:h="' + (paysage ? 11906 : 16838) + '"' + (paysage ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + tw(p.marges.h) + '" w:right="' + tw(p.marges.d) + '" w:bottom="' + tw(p.marges.b) + '" w:left="' + tw(p.marges.g) + '" w:header="' + tw(Math.max(5, p.marges.h / 2)) + '" w:footer="' + tw(Math.max(5, p.marges.b / 2)) + '" w:gutter="0"/></w:sectPr>';
    var police = POLICES[p.police] || 'Calibri', taille = Math.round(p.taille * 2), ligne = Math.round(240 * p.interligne);
    function style(id, nom, rpr, ppr) { return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + nom + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + '<w:rPr>' + rpr + '</w:rPr></w:style>'; }
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + x(police) + '" w:hAnsi="' + x(police) + '" w:cs="' + x(police) + '"/><w:sz w:val="' + taille + '"/><w:szCs w:val="' + taille + '"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="' + ligne + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      style('Titre', 'Title', '<w:b/><w:sz w:val="' + Math.round(taille * 1.3) + '"/><w:color w:val="555555"/>', '<w:spacing w:after="160"/>') +
      style('Titre1', 'heading 1', '<w:b/><w:sz w:val="' + Math.round(taille * 1.8) + '"/>', '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/>') +
      style('Titre2', 'heading 2', '<w:b/><w:sz w:val="' + Math.round(taille * 1.4) + '"/>', '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/>') +
      style('Titre3', 'heading 3', '<w:b/><w:sz w:val="' + Math.round(taille * 1.15) + '"/>', '<w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/>') +
      style('Paragraphedeliste', 'List Paragraph', '', '<w:ind w:left="720"/><w:contextualSpacing/>') + '</w:styles>';
    function niveaux(puce) {
      var r = ''; for (var i = 0; i < 7; i++) r += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + (puce ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][i % 3]) + '"/><w:lvlText w:val="' + (puce ? ['•', '◦', '▪'][i % 3] : '%' + (i + 1) + '.') + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 + 360 * i) + '" w:hanging="360"/></w:pPr></w:lvl>';
      return r;
    }
    var numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ' + NS + '><w:abstractNum w:abstractNumId="1">' + niveaux(true) + '</w:abstractNum><w:abstractNum w:abstractNumId="2">' + niveaux(false) + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>';
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      { nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { nom: 'docProps/core.xml', contenu: core(meta, o) },
      { nom: 'word/_rels/document.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="' + R + '/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="' + R + '/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="' + R + '/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="' + R + '/footer" Target="footer1.xml"/></Relationships>' },
      { nom: 'word/document.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + corps + sect + '</w:body></w:document>' },
      { nom: 'word/styles.xml', contenu: styles },
      { nom: 'word/numbering.xml', contenu: numbering },
      { nom: 'word/header1.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '>' + zonesXml(p.entete) + '</w:hdr>' },
      { nom: 'word/footer1.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' + zonesXml(p.pied) + '</w:ftr>' }
    ]);
  }
  function core(meta, o) {
    var d = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x((meta && meta.titre) || '') + '</dc:title><dc:creator>' + x((o && o.auteur) || '') + '</dc:creator><cp:keywords>Tessera Santé</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">' + d + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + d + '</dcterms:modified></cp:coreProperties>';
  }

  // ------------------------------------------------------------ RTF
  /** Document RTF (modifications suivies acceptées : le format n'a pas de révisions lisibles partout). */
  function rtf(contenu, meta, o) {
    o = o || {};
    var c = DM.contenu(contenu), p = c.page, os = blocsTexte(c, true), v = Object.assign({ titre: (meta && meta.titre) || '' }, o.valeurs || {});
    var polices = ['Calibri'].concat(Object.keys(POLICES).map(function (k) { return POLICES[k]; }).filter(function (n) { return n !== 'Calibri'; })), idxPolice = function (k) { return Math.max(0, polices.indexOf(POLICES[k] || 'Calibri')); };
    var couleurs = Object.keys(COULEURS).concat(Object.keys(FONDS).map(function (k) { return 'f-' + k; }));
    function col(k) { var h = k.slice(0, 2) === 'f-' ? FONDS[k.slice(2)] : COULEURS[k]; var r = rgb(h); return '\\red' + Math.round(r[0] * 255) + '\\green' + Math.round(r[1] * 255) + '\\blue' + Math.round(r[2] * 255) + ';'; }
    function t(s) {
      return String(s).replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\line ').replace(/[^\x00-\x7f]/g, function (ch) { var n = ch.charCodeAt(0); return '\\u' + (n > 32767 ? n - 65536 : n) + '?'; });
    }
    function runs(rs) {
      return (rs || []).map(function (r) {
        var f = '';
        if (r.p) f += '\\f' + idxPolice(r.p); if (r.z) f += '\\fs' + Math.round(r.z * 2); if (r.g) f += '\\b'; if (r.i) f += '\\i'; if (r.s) f += '\\ul'; if (r.b) f += '\\strike';
        if (r.c) f += '\\cf' + (couleurs.indexOf(r.c) + 1); if (r.f) f += '\\highlight' + (couleurs.indexOf('f-' + r.f) + 1);
        return f ? '{' + f + ' ' + t(r.x) + '}' : t(r.x);
      }).join('');
    }
    var largeurUtile = Math.round(((p.orientation === 'paysage' ? 297 : 210) - p.marges.g - p.marges.d) * 56.7), s = '', compteurs = {};
    function para(b) {
      var al = { c: '\\qc', d: '\\qr', j: '\\qj' }[b.al] || '\\ql', taille = { h1: 1.8, h2: 1.4, h3: 1.15 }[b.t];
      var debut = '\\pard' + al + (b.r ? '\\li' + (b.r * 709) : '') + (b.t === 'li' ? '\\li' + (360 + 360 * (b.n || 0)) + '\\fi-360' : '') + '\\sa120 ';
      var puce = '';
      if (b.t === 'li') { var k = b.liste + (b.n || 0); compteurs[k] = (compteurs[k] || 0) + 1; puce = b.liste === 'ol' ? compteurs[k] + '.\\tab ' : '\\bullet\\tab '; } else compteurs = {};
      return debut + (taille ? '{\\b\\fs' + Math.round(p.taille * 2 * taille) + ' ' : '') + puce + runs(b.runs) + (taille ? '}' : '') + '\\par\n';
    }
    os.forEach(function (on, i) {
      if (i) s += '\\page\n';
      if (on.titre && os.length > 1) s += '\\pard\\sa160{\\b\\cf1\\fs' + Math.round(p.taille * 2.6) + ' ' + t(on.titre) + '}\\par\n';
      on.blocs.forEach(function (b) {
        if (b.t === 'saut') { s += '\\page\n'; return; }
        if (b.t === 'table') {
          var n = b.lignes[0].length, larg = (b.largeurs || b.lignes[0].map(function () { return 100 / n; })), acc = 0, bords = '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10';
          var cellx = larg.map(function (w) { acc += Math.round(largeurUtile * w / 100); return bords + '\\cellx' + acc; }).join('');
          b.lignes.forEach(function (l, li) { s += '\\trowd\\trgaph108' + (b.entete && li === 0 ? '\\trhdr' : '') + cellx + l.map(function (cel) { return '\\pard\\intbl' + ({ c: '\\qc', d: '\\qr' }[cel.al] || '') + ' ' + (b.entete && li === 0 ? '{\\b ' + runs(cel.runs) + '}' : runs(cel.runs)) + '\\cell'; }).join('') + '\\row\n'; });
          s += '\\pard\\par\n';
          return;
        }
        s += para(b);
      });
    });
    function zones(z) { return ['gauche', 'centre', 'droite'].map(function (k) { return String(z[k] || '').split('{page}').map(function (m, i) { return (i ? '{\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}' : '') + t(remplir(m, v)); }).join(''); }).join('\\tab '); }
    var tw = function (mm) { return Math.round(mm * 56.7); }, paysage = p.orientation === 'paysage';
    var tab = '\\tqc\\tx' + Math.round(largeurUtile / 2) + '\\tqr\\tx' + largeurUtile;
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1036{\\fonttbl' + polices.map(function (n, i) { return '{\\f' + i + ' ' + n + ';}'; }).join('') + '}{\\colortbl;' + couleurs.map(col).join('') + '}\n' +
      '{\\info{\\title ' + t((meta && meta.titre) || '') + '}}\\paperw' + (paysage ? 16838 : 11906) + '\\paperh' + (paysage ? 11906 : 16838) + (paysage ? '\\landscape' : '') + '\\margt' + tw(p.marges.h) + '\\margb' + tw(p.marges.b) + '\\margl' + tw(p.marges.g) + '\\margr' + tw(p.marges.d) +
      '\\f' + idxPolice(p.police) + '\\fs' + Math.round(p.taille * 2) + '\n{\\header\\pard' + tab + '{\\fs17 ' + zones(p.entete) + '}\\par}\n{\\footer\\pard' + tab + '{\\fs17 ' + zones(p.pied) + '}\\par}\n' + s + '}';
  }

  // ------------------------------------------------------------ Excel (.xlsx)
  /** Classeur Excel : formules écrites en anglais (avec leurs résultats), mises en forme, formats, structure. */
  function xlsx(classeur, meta, o) {
    var C = T.contenu(classeur), calc = T.calculer(C, { maintenant: o && o.maintenant }), maintenant = (o && o.maintenant) || Date.now();
    // Styles : polices, fonds, bordures, formats de nombre et alignements uniques
    var fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FF333333"/></left><right style="thin"><color rgb="FF333333"/></right><top style="thin"><color rgb="FF333333"/></top><bottom style="thin"><color rgb="FF333333"/></bottom><diagonal/></border>'];
    var numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], cleXf = { '': 0 }, dxfs = [];
    function indice(liste, xml) { var i = liste.indexOf(xml); if (i < 0) { liste.push(xml); i = liste.length - 1; } return i; }
    function formatNombre(s) {
      var f = s.fmt, d = s.dec, z = function (n) { return n ? '.' + '0'.repeat(n) : ''; };
      if (!f || f === 'std') return d !== undefined ? (s.mil ? '#,##0' : '0') + z(d) : 0;
      if (f === 'texte') return 49;
      if (f === 'date') return 'dd/mm/yyyy';
      if (f === 'heure') return 'hh:mm';
      if (f === 'pct') return '0' + z(d === undefined ? 0 : d) + '%';
      if (f === 'eur') return '#,##0' + z(d === undefined ? 2 : d) + '\\ "€"';
      return (s.mil ? '#,##0' : '0') + z(d === undefined ? 2 : d);
    }
    function idFormat(s) { var f = formatNombre(s); if (typeof f === 'number') return f; var i = numFmts.indexOf(f); if (i < 0) { numFmts.push(f); i = numFmts.length - 1; } return 164 + i; }
    function police(s) { return '<font>' + (s.g ? '<b/>' : '') + (s.i ? '<i/>' : '') + (s.b ? '<strike/>' : '') + (s.s ? '<u/>' : '') + '<sz val="' + (s.z || 11) + '"/>' + (s.c ? '<color rgb="FF' + COULEURS[s.c] + '"/>' : '') + '<name val="' + x(POLICES[s.p] || 'Calibri') + '"/></font>'; }
    function remplissage(f) { return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + FONDS[f] + '"/><bgColor indexed="64"/></patternFill></fill>'; }
    function xf(s) {
      s = s || {};
      var k = Object.keys(s).length ? JSON.stringify(s) : ''; if (cleXf[k] !== undefined) return cleXf[k];
      var fid = indice(fonts, police(s)), fill = s.f ? indice(fills, remplissage(s.f)) : 0, b = s.bd ? 1 : 0, nf = idFormat(s);
      var al = s.al || s.r ? '<alignment' + (s.al ? ' horizontal="' + { g: 'left', c: 'center', d: 'right' }[s.al] + '"' : '') + (s.r ? ' wrapText="1"' : '') + ' vertical="bottom"/>' : '';
      xfs.push('<xf numFmtId="' + nf + '" fontId="' + fid + '" fillId="' + fill + '" borderId="' + b + '" xfId="0"' + (nf ? ' applyNumberFormat="1"' : '') + (fid ? ' applyFont="1"' : '') + (fill ? ' applyFill="1"' : '') + (b ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>'));
      cleXf[k] = xfs.length - 1; return cleXf[k];
    }
    function dxf(st) { return indice(dxfs, '<dxf><font>' + (st.g ? '<b/>' : '') + (st.i ? '<i/>' : '') + (st.c ? '<color rgb="FF' + COULEURS[st.c] + '"/>' : '') + '</font>' + (st.f ? '<fill><patternFill patternType="solid"><bgColor rgb="FF' + FONDS[st.f] + '"/></patternFill></fill>' : '') + '</dxf>'); }
    function valeurFormule(v) { return typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : v && v.err ? x({ '#NOM?': '#NAME?', '#VALEUR!': '#VALUE!', '#NOMBRE!': '#NUM!', '#CYCLE!': '#REF!' }[v.err] || v.err) : x(v == null ? '' : v); }
    var feuilles = C.feuilles.map(function (f, fi) {
      var e = T.etendue(f), lignes = '', cols = '', ref = function (l, c) { return T.nom(l, c); };
      for (var c = 0; c < e.c; c++) if (f.largeurs[c]) cols += '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (Math.round(f.largeurs[c] / 7 * 100) / 100) + '" customWidth="1"/>';
      var masquees = T.lignesMasquees(C, fi, calc);
      for (var l = 0; l < e.l; l++) {
        var cases = '';
        for (c = 0; c < e.c; c++) {
          var cel = f.cellules[T.nom(l, c)]; if (!cel) continue;
          var s = xf(cel.s), a = ' r="' + ref(l, c) + '"' + (s ? ' s="' + s + '"' : ''), v = calc.valeur(fi, l, c);
          if (cel.f !== undefined) {
            var en = T.versAnglais(cel.f);
            if (en === null) { cases += '<c' + a + ' t="inlineStr"><is><t>' + x(cel.f) + '</t></is></c>'; continue; }
            cases += '<c' + a + (typeof v === 'string' ? ' t="str"' : typeof v === 'boolean' ? ' t="b"' : v && v.err ? ' t="e"' : '') + '><f>' + x(en) + '</f>' + (v === null || v === undefined ? '' : '<v>' + valeurFormule(v) + '</v>') + '</c>';
          } else if (typeof cel.v === 'number') cases += '<c' + a + '><v>' + cel.v + '</v></c>';
          else if (cel.v !== undefined) cases += '<c' + a + ' t="inlineStr"><is><t xml:space="preserve">' + x(cel.v) + '</t></is></c>';
          else cases += '<c' + a + '/>';
        }
        var ht = f.hauteurs[l];
        if (cases || ht || masquees[l]) lignes += '<row r="' + (l + 1) + '"' + (ht ? ' ht="' + Math.round(ht * 0.75 * 100) / 100 + '" customHeight="1"' : '') + (masquees[l] ? ' hidden="1"' : '') + '>' + cases + '</row>';
      }
      var vue = '<sheetViews><sheetView workbookViewId="0"' + (fi === 0 ? ' tabSelected="1"' : '') + '>' + (f.figer.l || f.figer.c ? '<pane' + (f.figer.c ? ' xSplit="1"' : '') + (f.figer.l ? ' ySplit="1"' : '') + ' topLeftCell="' + ref(f.figer.l ? 1 : 0, f.figer.c ? 1 : 0) + '" activePane="' + (f.figer.l && f.figer.c ? 'bottomRight' : f.figer.l ? 'bottomLeft' : 'topRight') + '" state="frozen"/>' : '') + '</sheetView></sheetViews>';
      var fusions = f.fusions.length ? '<mergeCells count="' + f.fusions.length + '">' + f.fusions.map(function (u) { return '<mergeCell ref="' + ref(u.l, u.c) + ':' + ref(u.l + u.nl - 1, u.c + u.nc - 1) + '"/>'; }).join('') + '</mergeCells>' : '';
      var filtre = f.filtre ? '<autoFilter ref="' + ref(f.filtre.l, f.filtre.c1) + ':' + ref(Math.max(f.filtre.l, e.l - 1), f.filtre.c2) + '"/>' : '';
      // Mise en forme conditionnelle : comparaisons, texte, vides, erreurs, dates (formules avec AUJOURDHUI)
      var prio = 1, cond = f.conditions.map(function (r) {
        var sq = T.libPlage(r.plage), hg = ref(r.plage.l1, r.plage.c1), d = dxf(r.style), val = function (v) { return typeof v === 'number' ? String(v) : '"' + String(v).replace(/"/g, '""') + '"'; };
        var OPS = { '>': 'greaterThan', '>=': 'greaterThanOrEqual', '<': 'lessThan', '<=': 'lessThanOrEqual', '=': 'equal', '<>': 'notEqual' }, rule;
        if (OPS[r.op]) rule = '<cfRule type="cellIs" dxfId="' + d + '" priority="' + prio + '" operator="' + OPS[r.op] + '"><formula>' + x(val(r.v1)) + '</formula></cfRule>';
        else if (r.op === 'entre') rule = '<cfRule type="cellIs" dxfId="' + d + '" priority="' + prio + '" operator="between"><formula>' + x(val(r.v1)) + '</formula><formula>' + x(val(r.v2)) + '</formula></cfRule>';
        else if (r.op === 'contient') rule = '<cfRule type="containsText" dxfId="' + d + '" priority="' + prio + '" operator="containsText" text="' + x(r.v1) + '"><formula>' + x('NOT(ISERROR(SEARCH(' + val(String(r.v1)) + ',' + hg + ')))') + '</formula></cfRule>';
        else if (r.op === 'vide') rule = '<cfRule type="containsBlanks" dxfId="' + d + '" priority="' + prio + '"><formula>LEN(TRIM(' + hg + '))=0</formula></cfRule>';
        else if (r.op === 'nonvide') rule = '<cfRule type="notContainsBlanks" dxfId="' + d + '" priority="' + prio + '"><formula>LEN(TRIM(' + hg + '))&gt;0</formula></cfRule>';
        else if (r.op === 'erreur') rule = '<cfRule type="containsErrors" dxfId="' + d + '" priority="' + prio + '"><formula>ISERROR(' + hg + ')</formula></cfRule>';
        else if (r.op === 'passe') rule = '<cfRule type="expression" dxfId="' + d + '" priority="' + prio + '"><formula>' + x('AND(ISNUMBER(' + hg + '),' + hg + '<TODAY())') + '</formula></cfRule>';
        else if (r.op === 'proche') rule = '<cfRule type="expression" dxfId="' + d + '" priority="' + prio + '"><formula>' + x('AND(ISNUMBER(' + hg + '),' + hg + '>=TODAY(),' + hg + '<=TODAY()+' + (+r.v1 || 0) + ')') + '</formula></cfRule>';
        prio++;
        return rule ? '<conditionalFormatting sqref="' + sq + '">' + rule + '</conditionalFormatting>' : '';
      }).join('');
      var listes = f.validations.length ? '<dataValidations count="' + f.validations.length + '">' + f.validations.map(function (r) {
        var sq = T.libPlage(r.plage), err = r.bloquant ? ' errorStyle="stop"' : ' errorStyle="warning"', msg = r.message ? ' error="' + x(r.message) + '"' : '';
        if (r.genre === 'liste') return '<dataValidation type="list" allowBlank="1" showErrorMessage="1"' + err + msg + ' sqref="' + sq + '"><formula1>' + x('"' + r.valeurs.join(',').replace(/"/g, '""').slice(0, 250) + '"') + '</formula1></dataValidation>';
        var type = r.genre === 'nombre' ? 'decimal' : r.genre === 'date' ? 'date' : 'textLength', op = r.min !== undefined && r.max !== undefined ? 'between' : r.min !== undefined ? 'greaterThanOrEqual' : r.max !== undefined ? 'lessThanOrEqual' : null;
        if (!op) return '<dataValidation type="' + type + '" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1"' + err + msg + ' sqref="' + sq + '"><formula1>' + (r.genre === 'nombre' ? '-1E+307' : '0') + '</formula1></dataValidation>';
        return '<dataValidation type="' + type + '" operator="' + op + '" allowBlank="1" showErrorMessage="1"' + err + msg + ' sqref="' + sq + '"><formula1>' + (r.min !== undefined ? r.min : r.max) + '</formula1>' + (op === 'between' ? '<formula2>' + r.max + '</formula2>' : '') + '</dataValidation>';
      }).join('') + '</dataValidations>' : '';
      var pg = C.page, mm = function (v) { return Math.round(v / 25.4 * 1000) / 1000; };
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        (pg.ajuster ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') + (e.l && e.c ? '<dimension ref="A1:' + ref(e.l - 1, e.c - 1) + '"/>' : '') + vue + '<sheetFormatPr defaultRowHeight="15"/>' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + lignes + '</sheetData>' + filtre + fusions + cond + listes +
        '<printOptions' + (pg.quadrillage ? ' gridLines="1"' : '') + '/><pageMargins left="' + mm(pg.marges.g) + '" right="' + mm(pg.marges.d) + '" top="' + mm(pg.marges.h) + '" bottom="' + mm(pg.marges.b) + '" header="0.2" footer="0.2"/>' +
        '<pageSetup paperSize="9" orientation="' + (pg.orientation === 'portrait' ? 'portrait' : 'landscape') + '"' + (pg.ajuster ? ' fitToWidth="1" fitToHeight="0"' : '') + '/></worksheet>';
    });
    var noms = C.feuilles.map(function (f) { return f.nom; });
    var definis = C.feuilles.map(function (f, i) { var e = T.etendue(f); return f.filtre ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' + x("'" + f.nom.replace(/'/g, "''") + "'!$" + T.lettres(f.filtre.c1) + '$' + (f.filtre.l + 1) + ':$' + T.lettres(f.filtre.c2) + '$' + Math.max(f.filtre.l + 1, e.l)) + '</definedName>' : (C.page.repeter ? '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + x("'" + f.nom.replace(/'/g, "''") + "'!$1:$1") + '</definedName>' : ''); }).join('');
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + x(f) + '"/>'; }).join('') + '</numFmts>' : '') +
      '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="' + dxfs.length + '">' + dxfs.join('') + '</dxfs></styleSheet>';
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var fichiers = [
      { nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + noms.map(function (n, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { nom: 'docProps/core.xml', contenu: core(meta, o) },
      { nom: 'xl/workbook.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + R + '"><workbookPr date1904="0"/><bookViews><workbookView/></bookViews><sheets>' + noms.map(function (n, i) { return '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rIdS' + (i + 1) + '"/>'; }).join('') + '</sheets>' + (definis ? '<definedNames>' + definis + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { nom: 'xl/_rels/workbook.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + noms.map(function (n, i) { return '<Relationship Id="rIdS' + (i + 1) + '" Type="' + R + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rIdStyles" Type="' + R + '/styles" Target="styles.xml"/></Relationships>' }
    ];
    feuilles.forEach(function (s, i) { fichiers.push({ nom: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenu: s }); });
    fichiers.push({ nom: 'xl/styles.xml', contenu: styles });
    void maintenant;
    return zip(fichiers);
  }

  // ------------------------------------------------------------ CSV
  /**
   * Feuille en CSV pour un tableur français : séparateur « ; », virgule décimale, dates JJ/MM/AAAA, valeurs calculées
   * des formules ; précédé d'une marque d'octets (BOM) pour que les accents s'ouvrent correctement.
   */
  function csv(classeur, fi, o) {
    var C = T.contenu(classeur), f = C.feuilles[fi || 0], e = T.etendue(f), calc = T.calculer(C, { maintenant: o && o.maintenant }), lignes = [], masquees = T.lignesMasquees(C, fi || 0, calc);
    for (var l = 0; l < e.l; l++) {
      if (masquees[l] && !(o && o.masquees)) continue;
      var ligne = [];
      for (var c = 0; c < e.c; c++) {
        var cel = f.cellules[T.nom(l, c)], v = calc.valeur(fi || 0, l, c), s = (cel && cel.s) || {};
        var t = v === null || v === undefined ? '' : T.estErr(v) ? v.err : typeof v === 'number' ? (s.fmt === 'date' || s.fmt === 'heure' ? T.afficher(v, s) : String(+v.toPrecision(15)).replace('.', ',')) : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(v);
        ligne.push(/[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
      }
      lignes.push(ligne.join(';'));
    }
    return '\ufeff' + lignes.join('\r\n') + '\r\n';
  }

  // ------------------------------------------------------------ PDF
  var MMPT = 72 / 25.4;
  function styleRun(r) { return r.g && r.i ? 'gras-italique' : r.g ? 'gras' : r.i ? 'italique' : null; }
  /**
   * PDF d'un document texte (polices remplacées par Helvetica, la police standard des PDF ; mises en forme, titres,
   * listes, tableaux, sauts de page, onglets, en-tête et pied de page avec numéros de page).
   */
  function pdfTexte(contenu, meta, o) {
    o = o || {};
    var c = DM.resoudreSuivi(contenu, true), p = c.page, v = Object.assign({ titre: (meta && meta.titre) || '' }, o.valeurs || {}), os = DM.ongletsDe(c);
    var doc = new PDF.Document({ titre: v.titre, auteur: o.auteur || '', paysage: p.orientation === 'paysage', marges: { haut: p.marges.h, bas: p.marges.b, gauche: p.marges.g, droite: p.marges.d }, finPage: function (n, total) { return zonesPdf(doc, p, v, n, total); } });
    var base = p.taille, inter = p.interligne * 1.2;
    /** Paragraphe riche : mots de styles différents, retour à la ligne, alignement. */
    function paragraphe(runs, opt) {
      opt = opt || {};
      var x0 = doc.mg.g + (opt.retrait || 0), largeurMax = doc.largeurUtile - (opt.retrait || 0), mots = [];
      (runs.length ? runs : [{ x: '' }]).forEach(function (r) {
        var taille = (r.z || opt.taille || base), st = opt.gras ? (r.i ? 'gras-italique' : 'gras') : styleRun(r);
        String(r.x).split('\n').forEach(function (morceau, i) {
          if (i) mots.push({ saut: true });
          morceau.split(/( +)/).forEach(function (m) { if (m) mots.push({ t: m, taille: taille, style: st, r: r, espace: /^ +$/.test(m) }); });
        });
      });
      var lignes = [[]], l = 0;
      mots.forEach(function (m) {
        if (m.saut) { lignes.push([]); l = 0; return; }
        var lg = PDF.largeur(m.t, m.taille, m.style === 'gras' || m.style === 'gras-italique');
        if (l + lg > largeurMax && l > 0 && !m.espace) { lignes.push([]); l = 0; }
        if (!lignes[lignes.length - 1].length && m.espace) return;
        m.lg = lg; lignes[lignes.length - 1].push(m); l += lg;
      });
      doc.y -= opt.avant || 0;
      lignes.forEach(function (ms, li) {
        while (ms.length && ms[ms.length - 1].espace) ms.pop();
        var h = Math.max.apply(null, [opt.taille || base].concat(ms.map(function (m) { return m.taille; }))), haut = h * inter;
        doc.place(haut);
        var total = ms.reduce(function (s, m) { return s + m.lg; }, 0), x = x0;
        if (opt.al === 'c') x = x0 + (largeurMax - total) / 2; else if (opt.al === 'd') x = x0 + largeurMax - total;
        if (li === 0 && opt.puce) doc.texte(x0 - 12, doc.y - h, opt.puce, opt.taille || base);
        var y = doc.y - h;
        ms.forEach(function (m) {
          if (m.r.f && FONDS[m.r.f]) doc.rect(x, y - h * 0.22, m.lg, h * 1.15, rgb(FONDS[m.r.f]), null);
          doc.texte(x, y, m.t, m.taille, m.style, m.r.c && COULEURS[m.r.c] ? rgb(COULEURS[m.r.c]) : null);
          if (m.r.s) doc.filet(x, y - 1.2, x + m.lg, y - 1.2, m.r.c && COULEURS[m.r.c] ? rgb(COULEURS[m.r.c]) : [0, 0, 0], 0.5);
          if (m.r.b) doc.filet(x, y + m.taille * 0.3, x + m.lg, y + m.taille * 0.3, [0, 0, 0], 0.5);
          x += m.lg;
        });
        doc.y -= haut;
      });
      doc.y -= opt.apres !== undefined ? opt.apres : base * 0.4;
    }
    function tableau(b) {
      var n = b.lignes[0].length, poids = b.largeurs || b.lignes[0].map(function () { return 1; });
      var txt = function (cel) { return cel.runs.map(function (r) { return r.x; }).join(''); };
      doc.tableau({ entetes: b.entete ? b.lignes[0].map(txt) : null,
        lignes: (b.entete ? b.lignes.slice(1) : b.lignes).map(function (l) { return l.map(function (cel) { return cel.runs.map(function (r) { return r.x; }).join(''); }); }), poids: poids.slice(0, n), taille: Math.max(7, base - 1) });
    }
    var compteurs = {};
    os.forEach(function (on, i) {
      if (i) doc.nouvellePage();
      if (on.titre && os.length > 1) paragraphe([{ x: on.titre.toUpperCase() }], { taille: base * 0.85, apres: base * 0.8 });
      on.blocs.forEach(function (b) {
        if (b.t !== 'li') compteurs = {};
        if (b.t === 'saut') { doc.nouvellePage(); return; }
        if (b.t === 'table') { tableau(b); return; }
        var t = { h1: 1.8, h2: 1.4, h3: 1.15 }[b.t];
        if (t) { paragraphe(b.runs, { taille: base * t, gras: true, al: b.al, avant: base * 0.6, apres: base * 0.3 }); return; }
        if (b.t === 'li') { var k = b.liste + (b.n || 0); compteurs[k] = (compteurs[k] || 0) + 1; paragraphe(b.runs, { retrait: 16 + 14 * (b.n || 0), puce: b.liste === 'ol' ? compteurs[k] + '.' : '•', al: b.al, apres: base * 0.15 }); return; }
        paragraphe(b.runs, { al: b.al, retrait: (b.r || 0) * 12.5 * MMPT });
      });
    });
    return doc.octets();
  }
  function zonesPdf(doc, p, v, n, total, feuille) {
    var ops = [], w = Object.assign({}, v, { feuille: feuille || v.feuille || '' });
    [['entete', doc.F.h - Math.max(14, doc.mg.h / 2)], ['pied', Math.max(10, doc.mg.b / 2 - 3)]].forEach(function (z) {
      ['gauche', 'centre', 'droite'].forEach(function (k) {
        var t = remplir(String(p[z[0]][k] || '').replace(/\{page\}/g, n + ' sur ' + total), w); if (!t) return;
        var lg = PDF.largeur(t, 7.5, false), x = k === 'gauche' ? doc.mg.g : k === 'centre' ? (doc.F.l - lg) / 2 : doc.F.l - doc.mg.d - lg;
        ops.push(doc.opTexte(x, z[1], t, 7.5, null, [0.35, 0.35, 0.35]));
      });
    });
    return ops;
  }
  /** PDF d'un tableur : grille de chaque feuille (étendue utilisée), mises en forme, ajustée à la largeur de la page. */
  function pdfTableur(classeur, meta, o) {
    o = o || {};
    var C = T.contenu(classeur), p = C.page, calc = T.calculer(C, { maintenant: o.maintenant }), v = Object.assign({ titre: (meta && meta.titre) || '' }, o.valeurs || {}), feuilleCourante = '';
    var doc = new PDF.Document({ titre: v.titre, auteur: o.auteur || '', paysage: p.orientation !== 'portrait', marges: { haut: p.marges.h, bas: p.marges.b, gauche: p.marges.g, droite: p.marges.d },
      finPage: function (n, total) { return zonesPdf(doc, p, v, n, total, nomsPages[n - 1]); } });
    var nomsPages = [], indices = o.feuilles || C.feuilles.map(function (f, i) { return i; });
    indices.forEach(function (fi, k) {
      var f = C.feuilles[fi], e = T.etendue(f), masquees = T.lignesMasquees(C, fi, calc), maintenant = o.maintenant || Date.now();
      if (k) doc.nouvellePage();
      feuilleCourante = f.nom;
      while (nomsPages.length < doc.pages.length) nomsPages.push(feuilleCourante);
      if (indices.length > 1) { doc.paragraphe(f.nom, { taille: 10, style: 'gras', apres: 4 }); }
      if (!e.l || !e.c) { doc.paragraphe('Feuille vide.', { taille: 9, style: 'italique' }); return; }
      var larg = []; for (var c = 0; c < e.c; c++) larg.push((f.largeurs[c] || 100) * 0.75);
      var total = larg.reduce(function (s, x0) { return s + x0; }, 0), echelle = p.ajuster || total > doc.largeurUtile ? Math.min(1.4, doc.largeurUtile / total) : 1;
      larg = larg.map(function (w) { return w * echelle; });
      var couverts = {}; f.fusions.forEach(function (u) { for (var i = u.l; i < u.l + u.nl; i++) for (var j = u.c; j < u.c + u.nc; j++) if (i !== u.l || j !== u.c) couverts[i + ':' + j] = 1; });
      function hauteur(l) { return Math.max(9, (f.hauteurs[l] || 20) * 0.75 * echelle); }
      function ligne(l) {
        var h = hauteur(l), x0 = doc.mg.g;
        for (var c = 0; c < e.c; c++) {
          var lc = larg[c];
          if (couverts[l + ':' + c]) { x0 += lc; continue; }
          var u = f.fusions.filter(function (z) { return z.l === l && z.c === c; })[0], hc = h;
          if (u) { lc = larg.slice(c, c + u.nc).reduce(function (s, y) { return s + y; }, 0); }
          var cel = f.cellules[T.nom(l, c)], val = calc.valeur(fi, l, c), st = Object.assign({}, cel && cel.s, T.styleConditionnel(f, l, c, val, maintenant));
          if (st.f && FONDS[st.f]) doc.rect(x0, doc.y - hc, lc, hc, rgb(FONDS[st.f]), null);
          if (p.quadrillage || st.bd) doc.rect(x0, doc.y - hc, lc, hc, null, st.bd ? [0.2, 0.2, 0.2] : [0.7, 0.7, 0.7]);
          var texte = T.afficher(val, cel && cel.s), taille = Math.max(5, (st.z || 10) * echelle * 0.9), gras = !!st.g;
          if (texte) {
            var max = lc - 4; while (texte.length > 1 && PDF.largeur(texte, taille, gras) > max) texte = texte.slice(0, -1);
            var lg = PDF.largeur(texte, taille, gras), al = T.alignement(val, st), tx = al === 'd' ? x0 + lc - 2 - lg : al === 'c' ? x0 + (lc - lg) / 2 : x0 + 2;
            doc.texte(tx, doc.y - hc + (hc - taille) / 2 + taille * 0.22, texte, taille, st.g && st.i ? 'gras-italique' : st.g ? 'gras' : st.i ? 'italique' : null, T.estErr(val) ? [0.7, 0.1, 0.1] : st.c && COULEURS[st.c] ? rgb(COULEURS[st.c]) : null);
          }
          x0 += lc;
        }
        doc.y -= h;
      }
      for (var l = 0; l < e.l; l++) {
        if (masquees[l]) continue;
        if (doc.place(hauteur(l))) { while (nomsPages.length < doc.pages.length) nomsPages.push(feuilleCourante); if (p.repeter && l > 0) ligne(0); }
        ligne(l);
      }
      while (nomsPages.length < doc.pages.length) nomsPages.push(feuilleCourante);
    });
    return doc.octets();
  }

  var FORMATS = {
    texte: [{ code: 'pdf', libelle: 'PDF (.pdf)', type: 'application/pdf' }, { code: 'docx', libelle: 'Word (.docx)', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, { code: 'rtf', libelle: 'RTF (.rtf)', type: 'application/rtf' }],
    tableur: [{ code: 'xlsx', libelle: 'Excel (.xlsx)', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { code: 'csv', libelle: 'CSV (.csv, feuille affichée)', type: 'text/csv;charset=utf-8' }, { code: 'pdf', libelle: 'PDF (.pdf)', type: 'application/pdf' }]
  };
  /** Fichier d'export : { nom, octets, type }. `o` : { format, suivi, valeurs, feuille, auteur }. */
  function exporter(lu, o) {
    var genre = lu.contenu.genre === 'tableur' ? 'tableur' : 'texte', f = FORMATS[genre].filter(function (z) { return z.code === o.format; })[0];
    if (!f) throw new Error('Format d’export inconnu.');
    var nom = nomFichier(lu.meta.titre) + (o.format === 'csv' && lu.contenu.feuilles.length > 1 ? '_' + nomFichier(lu.contenu.feuilles[o.feuille || 0].nom) : '') + '.' + o.format, octets;
    if (genre === 'texte') octets = o.format === 'docx' ? docx(lu.contenu, lu.meta, o) : o.format === 'rtf' ? enc.encode(rtf(lu.contenu, lu.meta, o)) : pdfTexte(lu.contenu, lu.meta, o);
    else octets = o.format === 'xlsx' ? xlsx(lu.contenu, lu.meta, o) : o.format === 'csv' ? enc.encode(csv(lu.contenu, o.feuille || 0, o)) : pdfTableur(lu.contenu, lu.meta, o);
    return { nom: nom, octets: octets, type: f.type };
  }

  return { FORMATS: FORMATS, zip: zip, crc32: crc32, docx: docx, rtf: rtf, xlsx: xlsx, csv: csv, pdfTexte: pdfTexte, pdfTableur: pdfTableur, exporter: exporter, nomFichier: nomFichier };
});
