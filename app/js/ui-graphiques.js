// SPDX-License-Identifier: EUPL-1.2
/*
 * Graphiques en PDF (0.78.0, demande du porteur du 16 novembre 2026) : tout graphique affiché (SVG) est relu tel qu'il
 * est dessiné à l'écran (formes, couleurs du thème clair, textes) et redessiné en vecteurs dans un PDF au papier de
 * l'établissement (app/js/ui-pdf-etab.js, app/js/pdf.js). Aucune image, aucune bibliothèque.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h;

  /** « rgb(r, g, b) » ou « rgba(r, g, b, a) » → [r, g, b] (0 à 1), éclairci sur fond blanc selon l'opacité. */
  function couleurCss(v, opacite) {
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(String(v || '').trim());
    if (!m) return null;
    var a = m[4] === undefined ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    a *= opacite === undefined ? 1 : opacite;
    if (!(a > 0.01)) return null;
    return [m[1], m[2], m[3]].map(function (x) { return 1 - (1 - Math.min(255, +x) / 255) * Math.min(1, a); });
  }
  function opaciteDe(n, racine) {
    var o = 1;
    for (var e = n; e && e !== racine.parentNode; e = e.parentNode) { var v = parseFloat(getComputedStyle(e).opacity); if (isFinite(v)) o *= v; }
    return o;
  }
  /** Translation cumulée (attributs transform="translate(x, y)") entre l'élément et le SVG. */
  function decalage(n, racine) {
    var dx = 0, dy = 0;
    for (var e = n; e && e !== racine; e = e.parentNode) {
      var m = /translate\(\s*(-?[\d.]+)(?:[,\s]+(-?[\d.]+))?\s*\)/.exec(e.getAttribute && e.getAttribute('transform') || '');
      if (m) { dx += +m[1]; dy += +(m[2] || 0); }
    }
    return [dx, dy];
  }
  function attr(n, k) { var v = parseFloat(n.getAttribute(k)); return isFinite(v) ? v : 0; }

  /**
   * Dessin (format de SIC.pdf.Document.prototype.dessin) d'un élément SVG affiché. Les couleurs sont lues dans le thème
   * clair, même si l'agent affiche le thème sombre (papier blanc).
   */
  function svgEnDessin(svg) {
    var racineDoc = document.documentElement, theme = racineDoc.getAttribute('data-theme');
    if (theme === 'dark') racineDoc.setAttribute('data-theme', 'light');
    try {
      var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), r = svg.getBoundingClientRect();
      var W = vb.length === 4 && vb[2] > 0 ? vb[2] : (r.width || 600), H = vb.length === 4 && vb[3] > 0 ? vb[3] : (r.height || 300), ox = vb.length === 4 ? vb[0] : 0, oy = vb.length === 4 ? vb[1] : 0;
      var el = [];
      Array.prototype.forEach.call(svg.querySelectorAll('rect, line, polyline, polygon, path, circle, ellipse, text'), function (n) {
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        var op = opaciteDe(n, svg), d = decalage(n, svg), tx = d[0] - ox, ty = d[1] - oy;
        var fo = parseFloat(cs.fillOpacity), so = parseFloat(cs.strokeOpacity);
        var fond = couleurCss(cs.fill, op * (isFinite(fo) ? fo : 1)), trait = couleurCss(cs.stroke, op * (isFinite(so) ? so : 1));
        var ep = parseFloat(cs.strokeWidth) || 1, pointille = cs.strokeDasharray && cs.strokeDasharray !== 'none';
        var tag = n.tagName.toLowerCase(), base = { fond: fond, trait: trait, ep: ep, pointille: pointille };
        if (tag === 'rect') el.push(Object.assign({ e: 'rect', x: attr(n, 'x') + tx, y: attr(n, 'y') + ty, w: attr(n, 'width'), h: attr(n, 'height') }, base));
        else if (tag === 'line') el.push(Object.assign({ e: 'line', x1: attr(n, 'x1') + tx, y1: attr(n, 'y1') + ty, x2: attr(n, 'x2') + tx, y2: attr(n, 'y2') + ty }, base, { trait: trait || fond }));
        else if (tag === 'polyline' || tag === 'polygon') {
          var nb = (n.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), pts = [];
          for (var i = 0; i + 1 < nb.length; i += 2) pts.push([nb[i] + tx, nb[i + 1] + ty]);
          el.push(Object.assign({ e: 'polyline', pts: pts, ferme: tag === 'polygon' }, base));
        } else if (tag === 'circle') el.push(Object.assign({ e: 'circle', cx: attr(n, 'cx') + tx, cy: attr(n, 'cy') + ty, r: attr(n, 'r') }, base));
        else if (tag === 'ellipse') el.push(Object.assign({ e: 'circle', cx: attr(n, 'cx') + tx, cy: attr(n, 'cy') + ty, r: (attr(n, 'rx') + attr(n, 'ry')) / 2 }, base));
        else if (tag === 'path') {
          // Translation appliquée par un groupe : tracé décalé par une transformation du dessin (cas rare, ignoré si absent)
          el.push(Object.assign({ e: 'path', d: tx || ty ? decalerTrace(n.getAttribute('d'), tx, ty) : n.getAttribute('d') }, base));
        } else if (tag === 'text') {
          var t = Array.prototype.map.call(n.childNodes, function (c) { return c.nodeType === 3 || (c.tagName && c.tagName.toLowerCase() === 'tspan') ? c.textContent : ''; }).join('');
          var poids = cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600;
          var ancre = n.getAttribute('text-anchor') || cs.textAnchor || 'start';
          el.push({ e: 'text', x: attr(n, 'x') + tx, y: attr(n, 'y') + ty, t: t, taille: parseFloat(cs.fontSize) || 11, gras: poids, ancre: ancre, couleur: fond || [0.2, 0.2, 0.2] });
        }
      });
      return { largeur: W, hauteur: H, elements: el };
    } finally {
      if (theme === 'dark') racineDoc.setAttribute('data-theme', theme);
    }
  }
  /** Tracé absolu décalé (M, L, C, A, H, V en majuscules seulement ; un tracé relatif suit son point de départ). */
  function decalerTrace(d, tx, ty) {
    var segs = SIC.pdf.segmentsTrace(d);
    return segs.map(function (g) {
      if (g[0] === 'Z') return 'Z';
      var v = g.slice(1).map(function (x, i) { return (x + (i % 2 ? ty : tx)).toFixed(2); });
      return g[0] + v.join(' ');
    }).join(' ');
  }
  /** Légende d'une figure : pastilles colorées (éléments vides à fond coloré) suivies de leur texte. */
  function legendeDe(fig) {
    var cap = fig && fig.querySelector && fig.querySelector('figcaption');
    if (!cap || cap.classList.contains('actions') || cap.querySelector('button')) return [];
    var racineDoc = document.documentElement, theme = racineDoc.getAttribute('data-theme'), res = [], cour = null;
    if (theme === 'dark') racineDoc.setAttribute('data-theme', 'light');
    try {
      Array.prototype.forEach.call(cap.childNodes, function (c) {
        if (c.nodeType === 1 && !c.textContent.trim()) {
          var cs = getComputedStyle(c), coul = couleurCss(cs.backgroundColor, parseFloat(cs.opacity));
          if (coul) { cour = { couleur: coul, texte: '' }; res.push(cour); return; }
        }
        if (c.nodeType === 1 && c.classList.contains('ecran-seul')) return;
        var t = c.textContent;
        if (!t) return;
        if (!cour) { cour = { couleur: null, texte: '' }; res.push(cour); }
        cour.texte += t;
      });
    } finally { if (theme === 'dark') racineDoc.setAttribute('data-theme', theme); }
    return res.map(function (x) { return { couleur: x.couleur, texte: x.texte.replace(/\s+/g, ' ').trim() }; }).filter(function (x) { return x.couleur || x.texte; });
  }
  /** Légende dessinée sous le graphique : pastilles et textes, retour à la ligne si besoin. */
  function dessinerLegende(doc, legende) {
    if (!legende.length) return;
    var x = doc.mg.g, taille = 8.5, ligne = 12, max = doc.mg.g + doc.largeurUtile;
    doc.place(ligne);
    legende.forEach(function (it) {
      var lt = it.texte ? SIC.pdf.largeur(it.texte, taille) : 0, besoin = (it.couleur ? 12 : 0) + lt + 10;
      if (x + besoin > max && x > doc.mg.g) { x = doc.mg.g; doc.y -= ligne; doc.place(ligne); }
      if (it.couleur) { doc.rect(x, doc.y - 8, 8, 8, it.couleur); x += 12; }
      if (it.texte) {
        if (x + lt > max) { doc.paragraphe(it.texte, { taille: taille, x: x, largeur: max - x, apres: 0 }); x = doc.mg.g; return; }
        doc.texte(x, doc.y - 7, it.texte, taille, null, [0.25, 0.25, 0.25]); x += lt + 10;
      }
    });
    doc.y -= ligne + 4;
  }
  /** Graphique (élément SVG ou figure qui le contient) ajouté à un document PDF en cours, avec sa légende. */
  function ajouterAuPdf(doc, cible, options) {
    options = options || {};
    var svg = cible && (cible.tagName && cible.tagName.toLowerCase() === 'svg' ? cible : cible.querySelector && cible.querySelector('svg'));
    if (!svg) return false;
    // Graphique construit pour l'export, pas encore affiché : rattaché le temps de lire ses styles, hors de l'écran
    var porteur = null;
    if (!svg.isConnected) { porteur = h('div', { class: 'hors-ecran', 'aria-hidden': 'true' }, svg.closest && svg.closest('figure') || svg); document.body.appendChild(porteur); }
    try {
    if (options.titre) doc.paragraphe(options.titre, { taille: 10, style: 'gras', avant: 6, apres: 4 });
    doc.dessin(svgEnDessin(svg), { hauteurMax: options.hauteurMax || 330, apres: 4 });
    dessinerLegende(doc, legendeDe(svg.closest ? svg.closest('figure') : null));
    if (options.note) doc.paragraphe(options.note, { taille: 8, rgb: [0.35, 0.35, 0.35], apres: 4 });
    } finally { if (porteur) porteur.remove(); }
    return true;
  }
  /**
   * Export d'un graphique seul en PDF, au papier de l'établissement : `options` { titre, sousTitre, service, nom,
   * confidentiel, note, categorie }. Le fichier passe par U.exporter (dossier des exports, tracé, purgé).
   */
  function exporter(cible, options) {
    options = options || {};
    var P = U.pdfEtab.creer(options.service || null, options.titre || 'Graphique', { sousTitre: options.sousTitre, confidentiel: !!options.confidentiel });
    if (!ajouterAuPdf(P.doc, cible, { note: options.note, hauteurMax: 470 })) { U.toast('Aucun graphique à exporter.'); return null; }
    var nom = String(options.nom || options.titre || 'graphique').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'graphique';
    return U.exporter(options.categorie || 'graphiques', nom + '.pdf', P.finir({ signature: false }), 'application/pdf', { service: options.service || null });
  }
  /** Bouton « PDF » à placer près d'un graphique ; `options` peut être une fonction (calculée au clic). */
  function bouton(cible, options) {
    return h('button', { class: 'btn petit', type: 'button', title: 'Exporter ce graphique en PDF', onclick: function () {
      var c = typeof cible === 'function' ? cible() : cible;
      exporter(c, typeof options === 'function' ? options() : options);
    } }, 'Exporter en PDF');
  }

  U.graphiquePdf = { svgEnDessin: svgEnDessin, legendeDe: legendeDe, ajouterAuPdf: ajouterAuPdf, exporter: exporter, bouton: bouton, couleurCss: couleurCss };
})();
