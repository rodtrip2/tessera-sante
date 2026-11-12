// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — import des fichiers Word et Excel (0.41.0, étape 4). Logique seule, testable sous Node.
 * Le fichier est lu dans le navigateur, jamais copié sur le partage : seul le document Tessera créé (chiffré) est gardé.
 *   .docx → document texte : titres, paragraphes, mises en forme, alignement, retrait, listes, tableaux, sauts de page,
 *           page (format, orientation, marges), révisions Word reprises en modifications suivies ;
 *   .xlsx / .xlsm → tableur : feuilles, valeurs, formules (traduites en français ; résultat gardé si une fonction n'est
 *           pas reconnue), mises en forme, formats, largeurs, hauteurs, fusions, volets, filtre, listes de choix ;
 *   .csv → tableur (séparateur reconnu : « ; », « , » ou tabulation).
 * Couleurs et polices ramenées aux plus proches de Tessera ; limites du tableur (lignes, colonnes) appliquées.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./module-documents.js'), require('./tableur.js'), require('./xlsx.js'));
  else (root.SIC = root.SIC || {}).documentsImport = factory(root.SIC.documents, root.SIC.tableur, root.SIC.xlsx);
})(typeof self !== 'undefined' ? self : this, function (DM, T, XL) {
  'use strict';
  var dec = new TextDecoder();

  // ------------------------------------------------------------ XML (lecteur minimal : éléments, attributs, texte)
  function entites(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, '&');
  }
  /** Arbre d'un document XML : { n (nom sans préfixe), a (attributs, sans préfixe), e (enfants), t (texte) }. */
  function xml(texte) {
    var racine = { n: '#', a: {}, e: [] }, pile = [racine], re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g, m;
    while ((m = re.exec(texte))) {
      var haut = pile[pile.length - 1];
      if (m[6] !== undefined) { haut.e.push({ t: entites(m[6]) }); continue; }
      if (m[5] !== undefined) { haut.e.push({ t: m[5] }); continue; }
      if (!m[2]) continue;
      var nom = m[2].replace(/^.*:/, '');
      if (m[1]) { while (pile.length > 1 && pile[pile.length - 1].n !== nom) pile.pop(); if (pile.length > 1) pile.pop(); continue; }
      var a = {}, ra = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, ma;
      while ((ma = ra.exec(m[3] || ''))) a[ma[1].replace(/^.*:/, '')] = entites(ma[2] !== undefined ? ma[2] : ma[3]);
      var el = { n: nom, a: a, e: [] };
      haut.e.push(el);
      if (!m[4]) pile.push(el);
    }
    return racine;
  }
  function enfants(el, nom) { return (el && el.e || []).filter(function (x) { return x.n === nom; }); }
  function enfant(el, nom) { return enfants(el, nom)[0] || null; }
  function trouver(el, nom) { if (!el) return null; if (el.n === nom) return el; for (var i = 0; i < (el.e || []).length; i++) { var r = trouver(el.e[i], nom); if (r) return r; } return null; }
  function tous(el, nom, res) { res = res || []; (el && el.e || []).forEach(function (x) { if (x.n === nom) res.push(x); tous(x, nom, res); }); return res; }
  function texteDe(el) { var s = ''; (el.e || []).forEach(function (x) { s += x.t !== undefined ? x.t : texteDe(x); }); return s; }
  function vrai(el) { return !!el && el.a.val !== '0' && el.a.val !== 'false' && el.a.val !== 'none'; }

  // ------------------------------------------------------------ Couleurs et polices les plus proches
  var COULEURS = { gris: '666666', rouge: 'C00000', orange: 'C55A11', vert: '2E7D32', bleu: '1F4E9C', violet: '7030A0', marron: '7B4B2A' };
  var FONDS = { jaune: 'FFF176', vert: 'C5E8B7', bleu: 'BFE3F5', rose: 'F8C8DC', gris: 'DDDDDD', orange: 'FFD8A8', violet: 'E2D4F3' };
  var SURLIGNAGE = { yellow: 'jaune', green: 'vert', brightGreen: 'vert', darkGreen: 'vert', cyan: 'bleu', blue: 'bleu', darkCyan: 'bleu', magenta: 'rose', red: 'rose', darkMagenta: 'violet', lightGray: 'gris', darkGray: 'gris', darkYellow: 'orange' };
  function proche(hex, palette, seuilNoir) {
    if (!/^[0-9A-Fa-f]{6}$/.test(hex || '')) return undefined;
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    if (seuilNoir && r + g + b < 120) return undefined;          // noir ou presque : couleur automatique
    if (!seuilNoir && r > 245 && g > 245 && b > 245) return undefined;   // blanc : pas de fond
    var best = null, d0 = Infinity;
    Object.keys(palette).forEach(function (k) { var h = palette[k], d = Math.pow(r - parseInt(h.slice(0, 2), 16), 2) + Math.pow(g - parseInt(h.slice(2, 4), 16), 2) + Math.pow(b - parseInt(h.slice(4, 6), 16), 2); if (d < d0) { d0 = d; best = k; } });
    return best;
  }
  var POLICES = { arial: 'arial', helvetica: 'arial', calibri: 'calibri', carlito: 'calibri', cambria: 'cambria', georgia: 'georgia', 'times new roman': 'times', times: 'times', verdana: 'verdana', tahoma: 'tahoma', 'trebuchet ms': 'trebuchet', 'courier new': 'courier', courier: 'courier' };
  function police(nom) { return POLICES[String(nom || '').toLowerCase()] || undefined; }
  function taille(pt) { if (!(pt > 0)) return undefined; return T.TAILLES.reduce(function (b, t) { return Math.abs(t - pt) < Math.abs(b - pt) ? t : b; }, T.TAILLES[0]); }

  // ------------------------------------------------------------ Word (.docx)
  /** Document texte d'un fichier .docx : { contenu, titre, alertes }. */
  async function docx(octets, options) {
    var z = XL.lireZip(octets instanceof ArrayBuffer ? octets : octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
    async function fichier(n) { return z[n] ? dec.decode(await z[n]()) : ''; }
    var doc = xml(await fichier('word/document.xml')), corps = trouver(doc, 'body');
    if (!corps) throw new Error('Document Word non reconnu (.docx).');
    var alertes = [], styles = xml(await fichier('word/styles.xml')), numerotation = xml(await fichier('word/numbering.xml'));
    // Styles : titres (par l'identifiant, le nom ou le niveau de plan) ; numérotations : puces ou numéros par niveau
    var titres = {};
    tous(styles, 'style').forEach(function (s) {
      var id = s.a.styleId, nom = String((enfant(s, 'name') || { a: {} }).a.val || '').toLowerCase(), plan = trouver(s, 'outlineLvl');
      var m = /^(?:heading|titre)\s*([1-9])$/.exec(nom) || /^(?:heading|titre)([1-9])$/i.exec(id || '');
      if (m) titres[id] = Math.min(3, +m[1]); else if (plan && +plan.a.val < 3) titres[id] = +plan.a.val + 1;
    });
    var abstraits = {}, nums = {};
    tous(numerotation, 'abstractNum').forEach(function (a) { var l = {}; enfants(a, 'lvl').forEach(function (v) { var f = enfant(v, 'numFmt'); l[v.a.ilvl] = f && f.a.val !== 'bullet' ? 'ol' : 'ul'; }); abstraits[a.a.abstractNumId] = l; });
    tous(numerotation, 'num').forEach(function (n) { var a = enfant(n, 'abstractNumId'); if (a) nums[n.a.numId] = abstraits[a.a.val] || {}; });
    function marqueRev(el) { return { p: el.a.author || 'Word', n: el.a.author || 'Word', le: el.a.date || new Date().toISOString() }; }
    function rPr(r, base) {
      var p = enfant(r, 'rPr'), x = Object.assign({}, base || {});
      if (!p) return x;
      if (enfant(p, 'b')) x.g = vrai(enfant(p, 'b')) || undefined;
      if (enfant(p, 'i')) x.i = vrai(enfant(p, 'i')) || undefined;
      if (enfant(p, 'u')) x.s = vrai(enfant(p, 'u')) || undefined;
      if (enfant(p, 'strike') || enfant(p, 'dstrike')) x.b = vrai(enfant(p, 'strike') || enfant(p, 'dstrike')) || undefined;
      var f = enfant(p, 'rFonts'); if (f) { var pl = police(f.a.ascii || f.a.hAnsi); if (pl) x.p = pl; }
      var sz = enfant(p, 'sz'); if (sz) x.z = taille(+sz.a.val / 2);
      var c = enfant(p, 'color'); if (c && c.a.val && c.a.val !== 'auto') x.c = proche(c.a.val, COULEURS, true);
      var hl = enfant(p, 'highlight'); if (hl) x.f = SURLIGNAGE[hl.a.val];
      var sh = enfant(p, 'shd'); if (sh && sh.a.fill && sh.a.fill !== 'auto' && !x.f) x.f = proche(sh.a.fill, FONDS, false);
      var ch = enfant(p, 'rPrChange'); if (ch) { var av = rPr({ e: [enfant(ch, 'rPr') || { n: 'rPr', a: {}, e: [] }].map(function (y) { return Object.assign({}, y, { n: 'rPr' }); }) }, {}); x.fmt = Object.assign(marqueRev(ch), { avant: av }); }
      return x;
    }
    function runs(p, styleBase) {
      var res = [];
      function suivre(el, rev) {
        (el.e || []).forEach(function (n) {
          if (n.n === 'r') {
            var st = rPr(n, styleBase), texte = '';
            (n.e || []).forEach(function (c) {
              if (c.n === 't' || c.n === 'delText') texte += texteDe(c);
              else if (c.n === 'tab') texte += ' ';
              else if (c.n === 'br' && c.a.type !== 'page') texte += '\n';
              else if (c.n === 'br' && c.a.type === 'page') res.push({ saut: true });
              else if (c.n === 'noBreakHyphen') texte += '-';
            });
            if (texte) { var r = Object.assign({ x: texte }, st); if (rev) r[rev.genre] = rev.m; res.push(r); }
          } else if (n.n === 'ins' || n.n === 'del') suivre(n, { genre: n.n, m: marqueRev(n) });
          else if (n.n === 'hyperlink' || n.n === 'smartTag' || n.n === 'sdt' || n.n === 'sdtContent' || n.n === 'fldSimple') suivre(n, rev);
        });
      }
      suivre(p, null);
      return res;
    }
    var blocs = [];
    function paragraphe(p) {
      var pp = enfant(p, 'pPr'), style = pp && enfant(pp, 'pStyle') ? enfant(pp, 'pStyle').a.val : '', b = { t: 'p', runs: [] };
      if (titres[style]) b.t = 'h' + titres[style];
      var num = pp && enfant(pp, 'numPr');
      if (num && enfant(num, 'numId') && enfant(num, 'numId').a.val !== '0') { var niv = +((enfant(num, 'ilvl') || { a: { val: 0 } }).a.val) || 0, l = nums[enfant(num, 'numId').a.val] || {}; b = { t: 'li', liste: l[niv] || 'ul', n: Math.min(6, niv), runs: [] }; }
      var jc = pp && enfant(pp, 'jc'); if (jc) b.al = { center: 'c', right: 'd', end: 'd', both: 'j', distribute: 'j' }[jc.a.val] || 'g';
      var ind = pp && enfant(pp, 'ind'); if (ind && b.t !== 'li') { var gauche = +(ind.a.left || ind.a.start || 0); if (gauche >= 300) b.r = Math.min(8, Math.round(gauche / 709) || 1); }
      var rs = runs(p), courants = [];
      var rmarque = pp && enfant(pp, 'rPr');
      if (rmarque && enfant(rmarque, 'ins')) b.suivi = Object.assign(marqueRev(enfant(rmarque, 'ins')), { op: 'ins' });
      if (pp && enfant(pp, 'pageBreakBefore') && vrai(enfant(pp, 'pageBreakBefore'))) blocs.push({ t: 'saut' });
      rs.forEach(function (r) { if (r.saut) { if (courants.length) { blocs.push(Object.assign({}, b, { runs: courants })); courants = []; } blocs.push({ t: 'saut' }); } else courants.push(r); });
      if (courants.length || !rs.some(function (r) { return r.saut; })) blocs.push(Object.assign({}, b, { runs: courants }));
    }
    function tableau(tbl) {
      var lignes = [], entete = false, grille = enfants(enfant(tbl, 'tblGrid'), 'gridCol').map(function (g) { return +g.a.w || 0; });
      enfants(tbl, 'tr').forEach(function (tr, i) {
        var trp = enfant(tr, 'trPr'); if (i === 0 && trp && enfant(trp, 'tblHeader')) entete = true;
        var l = [];
        enfants(tr, 'tc').forEach(function (tc) {
          var ps = tous(tc, 'p'), rs = [], al = 'g';
          ps.forEach(function (p, k) { if (k) rs.push({ x: '\n' }); rs = rs.concat(runs(p).filter(function (r) { return !r.saut; })); var jc = trouver(enfant(p, 'pPr') || {}, 'jc'); if (jc) al = { center: 'c', right: 'd' }[jc.a.val] || al; });
          var span = trouver(enfant(tc, 'tcPr') || {}, 'gridSpan'), n = span ? Math.max(1, +span.a.val) : 1;
          l.push({ runs: rs, al: al }); for (var s = 1; s < n; s++) l.push({ runs: [] });
        });
        if (l.length) lignes.push(l.slice(0, 20));
      });
      if (!lignes.length) return;
      var total = grille.reduce(function (s, x) { return s + x; }, 0), n = Math.max.apply(null, lignes.map(function (l) { return l.length; }));
      blocs.push({ t: 'table', lignes: lignes, entete: entete, largeurs: total && grille.length === n ? grille.map(function (w) { return Math.round(w / total * 1000) / 10; }) : null });
    }
    (corps.e || []).forEach(function (el, i) {
      // Paragraphe vide que Word place après un tableau : pas repris
      if (el.n === 'p' && i > 0 && corps.e[i - 1].n === 'tbl' && !texteDe(el).trim() && !trouver(el, 'br')) return;
      if (el.n === 'p') paragraphe(el);
      else if (el.n === 'tbl') tableau(el);
      else if (el.n === 'sdt') tous(el, 'p').forEach(paragraphe);
    });
    // Page : format, orientation, marges (premier format de section rencontré)
    var sect = trouver(corps, 'sectPr'), page = {};
    if (sect) {
      var sz = enfant(sect, 'pgSz'), mg = enfant(sect, 'pgMar'), mm = function (tw) { return Math.round((+tw || 0) / 56.7); };
      if (sz && (sz.a.orient === 'landscape' || +sz.a.w > +sz.a.h)) page.orientation = 'paysage';
      if (mg) page.marges = { h: mm(mg.a.top), b: mm(mg.a.bottom), g: mm(mg.a.left), d: mm(mg.a.right) };
    }
    var defaut = trouver(styles, 'rPrDefault'), df = defaut && trouver(defaut, 'rFonts'), ds = defaut && trouver(defaut, 'sz');
    if (df && police(df.a.ascii)) page.police = police(df.a.ascii);
    if (ds) page.taille = taille(+ds.a.val / 2);
    if (tous(doc, 'drawing').length || tous(doc, 'pict').length) alertes.push('Les images et dessins ne sont pas repris.');
    if (z['word/header1.xml'] || z['word/footer1.xml']) alertes.push('L’en-tête et le pied de page de Word ne sont pas repris : à régler dans « Mise en page ».');
    var c = DM.contenu({ blocs: blocs, page: page });
    var titre = (options && options.titre) || '', core = xml(await fichier('docProps/core.xml')), t0 = trouver(core, 'title');
    if (t0 && texteDe(t0).trim()) titre = texteDe(t0).trim();
    return { contenu: c, titre: titre, alertes: alertes };
  }

  // ------------------------------------------------------------ Excel (.xlsx)
  var FORMATS_DATE = { 14: 1, 15: 1, 16: 1, 17: 1, 22: 1, 27: 1, 30: 1, 36: 1, 50: 1, 57: 1 }, FORMATS_HEURE = { 18: 1, 19: 1, 20: 1, 21: 1, 45: 1, 46: 1, 47: 1 };
  function formatDe(id, code) {
    var c = String(code || '');
    if (FORMATS_DATE[id] || (/[dy]/i.test(c.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,]+$/.test(c))) return { fmt: 'date' };
    if (FORMATS_HEURE[id] || /h+:mm/i.test(c)) return { fmt: 'heure' };
    if (id === 9 || id === 10 || /%/.test(c)) return { fmt: 'pct', dec: id === 10 ? 2 : ((/\.(0+)/.exec(c) || ['', ''])[1].length) };
    if (/€/.test(c) || id === 7 || id === 8) return { fmt: 'eur', dec: ((/\.(0+)/.exec(c) || ['', '00'])[1].length) };
    if (id === 2 || id === 4 || /0\.0/.test(c)) return { fmt: 'nombre', dec: ((/\.(0+)/.exec(c) || ['', ''])[1].length), mil: /#,##/.test(c) || id === 4 || undefined };
    if (id === 3 || /#,##0$/.test(c)) return { fmt: 'nombre', dec: 0, mil: true };
    if (id === 49 || c === '@') return { fmt: 'texte' };
    return {};
  }
  function couleurXl(el, palette, noir) { if (!el || !el.a.rgb) return undefined; return proche(el.a.rgb.slice(-6), palette, noir); }
  /** Tableur d'un fichier .xlsx : { contenu, alertes }. */
  async function xlsx(octets, options) {
    var z = XL.lireZip(octets instanceof ArrayBuffer ? octets : octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
    async function fichier(n) { return z[n] ? dec.decode(await z[n]()) : ''; }
    var wb = xml(await fichier('xl/workbook.xml'));
    if (!trouver(wb, 'sheets')) throw new Error('Classeur Excel non reconnu (.xlsx).');
    var alertes = [], liens = {};
    tous(xml(await fichier('xl/_rels/workbook.xml.rels')), 'Relationship').forEach(function (r) { var t = r.a.Target || ''; liens[r.a.Id] = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); });
    var partages = tous(xml(await fichier('xl/sharedStrings.xml')), 'si').map(function (si) { return tous(si, 't').map(texteDe).join(''); });
    // Styles des cases
    var st = xml(await fichier('xl/styles.xml')), codes = {};
    tous(st, 'numFmt').forEach(function (n) { codes[n.a.numFmtId] = n.a.formatCode; });
    var polices = enfants(trouver(st, 'fonts'), 'font').map(function (f) {
      var x = {}; if (enfant(f, 'b') && vrai(enfant(f, 'b')) !== false) x.g = true; if (enfant(f, 'i')) x.i = true; if (enfant(f, 'u')) x.s = true; if (enfant(f, 'strike')) x.b = true;
      var sz = enfant(f, 'sz'); if (sz && +sz.a.val !== 11) x.z = taille(+sz.a.val);
      var nm = enfant(f, 'name'); if (nm && police(nm.a.val) && police(nm.a.val) !== 'calibri') x.p = police(nm.a.val);
      var c = couleurXl(enfant(f, 'color'), COULEURS, true); if (c) x.c = c;
      return x;
    });
    var fonds = enfants(trouver(st, 'fills'), 'fill').map(function (f) { var p = enfant(f, 'patternFill'); return p && p.a.patternType === 'solid' ? couleurXl(enfant(p, 'fgColor'), FONDS, false) : undefined; });
    var bordures = enfants(trouver(st, 'borders'), 'border').map(function (b) { return ['left', 'right', 'top', 'bottom'].some(function (k) { var x = enfant(b, k); return x && x.a.style && x.a.style !== 'none'; }); });
    var styles = enfants(trouver(st, 'cellXfs'), 'xf').map(function (x) {
      var s = Object.assign({}, polices[+x.a.fontId || 0] || {}), f = fonds[+x.a.fillId || 0]; if (f) s.f = f;
      if (bordures[+x.a.borderId || 0]) s.bd = true;
      Object.assign(s, formatDe(+x.a.numFmtId || 0, codes[x.a.numFmtId]));
      var al = enfant(x, 'alignment'); if (al) { var h = { left: 'g', center: 'c', centerContinuous: 'c', right: 'd' }[al.a.horizontal]; if (h) s.al = h; if (al.a.wrapText === '1' || al.a.wrapText === 'true') s.r = true; }
      Object.keys(s).forEach(function (k) { if (s[k] === undefined) delete s[k]; });
      return s;
    });
    var dxfs = enfants(trouver(st, 'dxfs'), 'dxf').map(function (d) {
      var x = {}, fo = enfant(d, 'font'), fi = enfant(d, 'fill');
      if (fo) { if (enfant(fo, 'b')) x.g = true; if (enfant(fo, 'i')) x.i = true; var c = couleurXl(enfant(fo, 'color'), COULEURS, true); if (c) x.c = c; }
      if (fi) { var p = enfant(fi, 'patternFill'), cc = p && (couleurXl(enfant(p, 'bgColor'), FONDS, false) || couleurXl(enfant(p, 'fgColor'), FONDS, false)); if (cc) x.f = cc; }
      return x;
    });
    var feuilles = [], tronque = false, inconnues = {};
    var ss = enfants(trouver(wb, 'sheets'), 'sheet');
    for (var i = 0; i < ss.length && feuilles.length < T.MAX_FEUILLES; i++) {
      var sh = ss[i], chemin = liens[sh.a.id];
      if (!chemin || !z[chemin]) continue;
      var w = xml(await fichier(chemin)), cellules = {}, largeurs = {}, hauteurs = {}, maitres = {};
      tous(w, 'col').forEach(function (c) { if (c.a.width && (c.a.customWidth === '1' || c.a.customWidth === 'true' || true)) for (var k = +c.a.min - 1; k <= Math.min(+c.a.max - 1, T.MAX_COLONNES - 1); k++) largeurs[k] = Math.max(24, Math.min(800, Math.round(+c.a.width * 7))); });
      tous(w, 'row').forEach(function (r) {
        var l = +r.a.r - 1;
        if (l >= T.MAX_LIGNES) { tronque = true; return; }
        if (r.a.ht && (r.a.customHeight === '1' || r.a.customHeight === 'true')) hauteurs[l] = Math.max(16, Math.min(400, Math.round(+r.a.ht / 0.75)));
        enfants(r, 'c').forEach(function (c) {
          var p = T.lire(c.a.r); if (!p) return;
          if (p.c >= T.MAX_COLONNES) { tronque = true; return; }
          var t = c.a.t, v = enfant(c, 'v'), f = enfant(c, 'f'), s = styles[+c.a.s || 0] || {}, val, x = {};
          var brut = v ? texteDe(v) : null;
          if (t === 's') val = brut !== null ? partages[+brut] : undefined;
          else if (t === 'inlineStr') val = tous(c, 't').map(texteDe).join('');
          else if (t === 'str' || t === 'e') val = brut;
          else if (t === 'b') val = brut === '1' ? 'VRAI' : brut === '0' ? 'FAUX' : undefined;
          else if (brut !== null && brut !== '') val = +brut;
          // Formule : partagée (la première porte le texte), traduite en français ; fonction inconnue : résultat gardé
          var texteF = f ? texteDe(f) : '';
          if (f && f.a.t === 'shared' && f.a.si !== undefined) {
            if (texteF) maitres[f.a.si] = { f: texteF, l: p.l, c: p.c };
            else if (maitres[f.a.si]) { var fr0 = T.depuisAnglais(maitres[f.a.si].f); texteF = fr0 ? T.decaler(fr0, p.l - maitres[f.a.si].l, p.c - maitres[f.a.si].c).slice(1) : ''; if (texteF) texteF = '§' + texteF; }
          }
          if (texteF) {
            var fr = texteF.charAt(0) === '§' ? '=' + texteF.slice(1) : T.depuisAnglais(texteF);
            if (fr && !T.verifier(fr)) x.f = fr; else { var nm = (/^([A-Z][A-Z0-9.]*)\(/i.exec(texteF) || [])[1]; inconnues[nm || texteF.slice(0, 20)] = 1; }
          }
          if (!x.f && val !== undefined && val !== null && val !== '') x.v = typeof val === 'number' ? val : String(val);
          if (Object.keys(s).length) x.s = s;
          if (x.f || x.v !== undefined || x.s) cellules[T.nom(p.l, p.c)] = x;
        });
      });
      var fusions = tous(w, 'mergeCell').map(function (m) { var q = String(m.a.ref || '').split(':'), a = T.lire(q[0]), b = T.lire(q[1] || q[0]); return a && b ? { l: a.l, c: a.c, nl: b.l - a.l + 1, nc: b.c - a.c + 1 } : null; }).filter(Boolean);
      var pane = trouver(w, 'pane'), figer = { l: 0, c: 0 };
      if (pane && (pane.a.state === 'frozen' || pane.a.state === 'frozenSplit')) { if (+pane.a.ySplit >= 1) figer.l = 1; if (+pane.a.xSplit >= 1) figer.c = 1; }
      var af = trouver(w, 'autoFilter'), filtre = null;
      if (af && af.a.ref) { var q = af.a.ref.split(':'), a1 = T.lire(q[0]), b1 = T.lire(q[1] || q[0]); if (a1 && b1) filtre = { l: a1.l, c1: a1.c, c2: b1.c, masques: {} }; }
      var plage = function (sq) { var q2 = String(sq || '').split(' ')[0].split(':'), a2 = T.lire(q2[0]), b2 = T.lire(q2[1] || q2[0]); return a2 && b2 ? { l1: a2.l, c1: a2.c, l2: Math.min(T.MAX_LIGNES - 1, b2.l), c2: Math.min(T.MAX_COLONNES - 1, b2.c) } : null; };
      var validations = tous(w, 'dataValidation').map(function (dv) {
        var pl = plage(dv.a.sqref), f1 = enfant(dv, 'formula1'), txt = f1 ? texteDe(f1) : '';
        if (!pl) return null;
        if (dv.a.type === 'list' && /^".*"$/.test(txt)) return { plage: pl, genre: 'liste', valeurs: txt.slice(1, -1).replace(/""/g, '"').split(','), bloquant: dv.a.errorStyle !== 'warning' && dv.a.errorStyle !== 'information', message: dv.a.error || '' };
        var genre = { decimal: 'nombre', whole: 'nombre', date: 'date', textLength: 'texte' }[dv.a.type], f2 = enfant(dv, 'formula2'), n1 = +txt, n2 = f2 ? +texteDe(f2) : undefined, op = dv.a.operator || 'between';
        if (!genre || !isFinite(n1)) return null;
        var r = { plage: pl, genre: genre, bloquant: dv.a.errorStyle !== 'warning' && dv.a.errorStyle !== 'information', message: dv.a.error || '' };
        if (op === 'between') { r.min = n1; if (isFinite(n2)) r.max = n2; } else if (/greaterThan/.test(op)) r.min = n1 > -1e300 ? n1 : undefined; else if (/lessThan/.test(op)) r.max = n1;
        return r;
      }).filter(Boolean);
      var OPS = { greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=', equal: '=', notEqual: '<>', between: 'entre' }, conditions = [];
      tous(w, 'conditionalFormatting').forEach(function (cf) {
        var pl = plage(cf.a.sqref); if (!pl) return;
        enfants(cf, 'cfRule').forEach(function (r) {
          var style = dxfs[+r.a.dxfId] || {}, fs = enfants(r, 'formula').map(texteDe), val = function (s) { s = String(s || ''); return /^".*"$/.test(s) ? s.slice(1, -1).replace(/""/g, '"') : isFinite(+s) && s !== '' ? +s : null; };
          var c = null;
          if (r.a.type === 'cellIs' && OPS[r.a.operator] && val(fs[0]) !== null) c = { plage: pl, op: OPS[r.a.operator], v1: val(fs[0]), v2: val(fs[1]), style: style };
          else if (r.a.type === 'containsText' && r.a.text) c = { plage: pl, op: 'contient', v1: r.a.text, style: style };
          else if (r.a.type === 'containsBlanks') c = { plage: pl, op: 'vide', style: style };
          else if (r.a.type === 'notContainsBlanks') c = { plage: pl, op: 'nonvide', style: style };
          else if (r.a.type === 'containsErrors') c = { plage: pl, op: 'erreur', style: style };
          if (c && T.condition(c)) conditions.push(c); else alertes.push('Une règle de mise en forme conditionnelle de la feuille « ' + sh.a.name + ' » n’est pas reprise.');
        });
      });
      feuilles.push({ nom: sh.a.name, cellules: cellules, largeurs: largeurs, hauteurs: hauteurs, fusions: fusions, figer: figer, filtre: filtre, validations: validations, conditions: conditions });
    }
    if (ss.length > T.MAX_FEUILLES) alertes.push('Seules les ' + T.MAX_FEUILLES + ' premières feuilles sont reprises.');
    if (tronque) alertes.push('Le classeur dépasse les limites du tableur (' + T.MAX_LIGNES + ' lignes, ' + T.MAX_COLONNES + ' colonnes) : le reste n’est pas repris.');
    var ks = Object.keys(inconnues); if (ks.length) alertes.push('Formules non reconnues (résultat gardé, sans la formule) : ' + ks.slice(0, 10).join(', ') + (ks.length > 10 ? '…' : '') + '.');
    if (Object.keys(z).some(function (k) { return /^xl\/(charts|drawings)\//.test(k); })) alertes.push('Les graphiques et images ne sont pas repris.');
    var titre = (options && options.titre) || '', t0 = trouver(xml(await fichier('docProps/core.xml')), 'title');
    if (t0 && texteDe(t0).trim()) titre = texteDe(t0).trim();
    return { contenu: T.contenu({ feuilles: feuilles }), titre: titre, alertes: alertes };
  }

  // ------------------------------------------------------------ CSV
  function csv(texte, options) {
    var t = String(texte || '').replace(/^﻿/, ''), premiere = t.split(/\r?\n/)[0] || '';
    var sep = ['\t', ';', ','].map(function (s) { return [s, premiere.split(s).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var lignes = [], ligne = [], champ = '', q = false, tronque = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += ch; continue; }
      if (ch === '"' && champ === '') { q = true; continue; }
      if (ch === sep) { ligne.push(champ); champ = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; continue; }
      champ += ch;
    }
    if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    var cellules = {};
    lignes.forEach(function (l, li) {
      if (li >= T.MAX_LIGNES) { tronque = true; return; }
      l.forEach(function (v, c) {
        if (c >= T.MAX_COLONNES) { tronque = true; return; }
        var r = T.saisir(v); if (r.vide) return;
        var x = r.f ? (T.verifier(r.f) ? { v: v } : { f: r.f }) : { v: r.v }; if (r.fmt) x.s = { fmt: r.fmt };
        cellules[T.nom(li, c)] = x;
      });
    });
    return { contenu: T.contenu({ feuilles: [{ nom: (options && options.feuille) || 'Feuille1', cellules: cellules }] }), titre: (options && options.titre) || '', alertes: tronque ? ['Le fichier dépasse les limites du tableur : le reste n’est pas repris.'] : [] };
  }

  /** Import d'un fichier selon son extension : { contenu, titre, alertes }. */
  async function importer(nom, octets) {
    var ext = (/\.([a-z0-9]+)$/i.exec(nom || '') || ['', ''])[1].toLowerCase(), titre = String(nom || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    if (ext === 'docx') return docx(octets, { titre: titre });
    if (ext === 'xlsx' || ext === 'xlsm') return xlsx(octets, { titre: titre });
    if (ext === 'csv' || ext === 'txt') return csv(dec.decode(octets), { titre: titre, feuille: titre.slice(0, 31) });
    throw new Error('Format non pris en charge : Word (.docx), Excel (.xlsx, .xlsm) ou CSV (.csv). Un ancien fichier .doc ou .xls est à réenregistrer au format récent depuis Word ou Excel.');
  }

  return { importer: importer, docx: docx, xlsx: xlsx, csv: csv, xml: xml };
});
