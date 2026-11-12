// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — contrat déclaré au registre des modules (0.34.0, étape 1 : documents texte ; décisions du porteur
 * du 12 novembre 2026).
 *
 * Documents texte mis en forme (polices, tailles, couleurs, titres, listes, tableaux, alignements, marges, orientation,
 * en-tête et pied de page, sauts de page), chiffrés chacun par sa propre clé : la clé du document est emballée pour les
 * seules clés de ceux avec qui il est partagé (agent, service, rôle d'un service, groupe), dans un fichier de clés tenu
 * par la session ; un document supprimé passe 30 jours dans la corbeille, puis son fichier de clés est détruit : ses
 * versions, toujours dans le journal (ajout seul), deviennent illisibles. Le module ne voit ni les clés ni le coffre.
 *
 * Privé à son auteur jusqu'au partage (décision) ; droits par document : lire, modifier, gérer (partage, corbeille,
 * validation demandée). Titre, rattachements (patient, agent, salle…) et contenu sont chiffrés par la clé du document ;
 * seuls l'existence du document, son auteur, ses dates, son partage et son statut sont lisibles par les agents du module.
 * Chaque enregistrement est une version (historique, retour à une version, comparaison). Circuit de validation (décision) :
 * brouillon, à valider, validé (par qui, quand, version en vigueur), à réviser à la date prévue. Modèles : par le cadre
 * pour ses services, par l'administrateur pour l'établissement. Aucune donnée clinique. Journal `modules\documents\`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'), require('./groupes.js'), require('./tableur.js'));
  else (root.SIC = root.SIC || {}).documents = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.groupes, root.SIC.tableur);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, G, T) {
  'use strict';

  var TYPES = ['DOC', 'DOC_VERSION', 'DOC_PARTAGE', 'DOC_STATUT', 'DOC_VALIDATION', 'DOC_CORBEILLE', 'DOC_EFFACE', 'DOC_TRANSFERT', 'DOC_OPTIONS', 'DOC_EXPORT', 'DOC_IMAGE'];
  var DROITS_DOC = { lire: 1, modifier: 2, gerer: 3 };
  var LIB_DROITS = { lire: 'Lire', modifier: 'Modifier', gerer: 'Gérer (partage, corbeille)' };
  var STATUTS = { brouillon: 'Brouillon', 'a-valider': 'À valider', valide: 'Validé', modifie: 'Modifié depuis la validation', 'a-reviser': 'À réviser' };
  var CORBEILLE_JOURS = 30;
  /**
   * Réglages de l'établissement (`config.documents`, administrateur, 0.34.1) : durée de la corbeille, de 7 à 365 jours
   * (30 par défaut). Validés à la lecture.
   */
  function options(config) {
    var o = (config && config.documents) || {}, j = Math.round(+o.corbeilleJours);
    // transfertPrives (0.34.2, désactivé par défaut) : les documents privés (partagés avec personne) d'un compte retiré
    // sont aussi transférés au cadre ; sinon ils restent illisibles (seul leur auteur les ouvrait)
    return { corbeilleJours: j >= 7 && j <= 365 ? j : CORBEILLE_JOURS, transfertPrives: o.transfertPrives === true };
  }
  function joursCorbeille(config) { return options(config).corbeilleJours; }
  var ID = /^DC[0-9a-f]{8,32}$/, JOUR = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_VERSION = 2500000;  // caractères du contenu chiffré d'une version (≈ 1,8 Mo : texte long ou grand classeur)

  function texte(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n || 120); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ------------------------------------------------------------ Mise en forme : polices, tailles, couleurs (classes CSS)
  var POLICES = { '': 'Police du document', arial: 'Arial', calibri: 'Calibri', cambria: 'Cambria', georgia: 'Georgia', times: 'Times New Roman', verdana: 'Verdana', tahoma: 'Tahoma', trebuchet: 'Trebuchet MS', courier: 'Courier New' };
  var TAILLES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
  var COULEURS = { '': 'Automatique', gris: 'Gris', rouge: 'Rouge', orange: 'Orange', vert: 'Vert', bleu: 'Bleu', violet: 'Violet', marron: 'Marron' };
  var FONDS = { '': 'Aucun', jaune: 'Surligné jaune', vert: 'Surligné vert', bleu: 'Surligné bleu', rose: 'Surligné rose', gris: 'Surligné gris' };
  var BLOCS = { p: 'Texte', h1: 'Titre 1', h2: 'Titre 2', h3: 'Titre 3' };
  var ALIGNEMENTS = { g: 'À gauche', c: 'Centré', d: 'À droite', j: 'Justifié' };
  var CHAMPS_PAGE = { titre: 'Titre du document', date: 'Date d’impression', page: 'Numéro de page', service: 'Service', auteur: 'Auteur', version: 'Version en vigueur' };

  function run(r) {
    if (!r || typeof r.x !== 'string' || !r.x) return null;
    var x = { x: r.x.replace(/\r\n?/g, '\n').slice(0, 20000) };
    ['g', 'i', 's', 'b'].forEach(function (k) { if (r[k] === true) x[k] = true; });
    if (POLICES[r.p] && r.p) x.p = r.p;
    if (TAILLES.indexOf(+r.z) >= 0) x.z = +r.z;
    if (COULEURS[r.c] && r.c) x.c = r.c;
    if (FONDS[r.f] && r.f) x.f = r.f;
    // Suivi des modifications (0.37.0) : texte ajouté (ins) ou supprimé (del) par un agent, à accepter ou refuser
    var m = marque(r.ins); if (m) x.ins = m;
    var d = marque(r.del); if (d) x.del = d;
    // Mise en forme changée (0.38.0) : mise en forme d'avant, pour refuser
    if (r.fmt && marque(r.fmt)) { var av = {}, a0 = r.fmt.avant || {}; ['g', 'i', 's', 'b'].forEach(function (k) { if (a0[k] === true) av[k] = true; }); if (POLICES[a0.p] && a0.p) av.p = a0.p; if (TAILLES.indexOf(+a0.z) >= 0) av.z = +a0.z; if (COULEURS[a0.c] && a0.c) av.c = a0.c; if (FONDS[a0.f] && a0.f) av.f = a0.f;
      x.fmt = Object.assign(marque(r.fmt), { id: texte(r.fmt.id, 30) || 'f' + Math.random().toString(36).slice(2, 10), avant: av }); }
    return x;
  }
  var OPS_BLOC = { ins: 'Nouveau paragraphe', ajout: 'Élément ajouté', del: 'Élément supprimé', fusion: 'Paragraphes fusionnés' };
  function marqueBloc(m) { var x = marque(m); return x && OPS_BLOC[m.op] ? Object.assign(x, { op: m.op, id: texte(m.id, 30) || 'b' + Math.random().toString(36).slice(2, 10) }) : null; }
  function avecSuivi(x, b) { var m = marqueBloc(b && b.suivi); if (m) x.suivi = m; return x; }
  function marque(m) { return m && typeof m === 'object' && texte(m.p, 60) ? { p: texte(m.p, 60), n: texte(m.n, 80), le: texte(m.le, 30) } : null; }
  function memeMarque(a, b) { return (!a && !b) || (a && b && a.p === b.p && a.le.slice(0, 16) === b.le.slice(0, 16)); }
  /** Fusionne les morceaux contigus de même mise en forme. */
  function fusionner(runs) {
    var res = [];
    (runs || []).map(run).filter(Boolean).forEach(function (r) {
      var p = res[res.length - 1];
      if (p && ['g', 'i', 's', 'b', 'p', 'z', 'c', 'f'].every(function (k) { return p[k] === r[k]; }) && memeMarque(p.ins, r.ins) && memeMarque(p.del, r.del) && ((!p.fmt && !r.fmt) || (p.fmt && r.fmt && p.fmt.id === r.fmt.id))) p.x += r.x; else res.push(r);
    });
    return res;
  }
  function cellule(c) { return { runs: fusionner(c && c.runs), al: ALIGNEMENTS[c && c.al] ? c.al : 'g' }; }
  function bloc(b) {
    if (!b || typeof b !== 'object') return null;
    if (b.t === 'saut') return avecSuivi({ t: 'saut' }, b);
    // Image (0.42.0) : renvoi à une image du document (saisie DOC_IMAGE), largeur en % de la page, alignement
    if (b.t === 'img') { var iid = texte(b.id, 30); if (!ID_IMAGE.test(iid)) return null; var lp = Math.round(+b.l); var im = { t: 'img', id: iid, l: lp >= 5 && lp <= 100 ? lp : 50, al: b.al === 'g' || b.al === 'd' ? b.al : 'c' }, lg = texte(b.leg, 200); if (lg) im.leg = lg; return avecSuivi(im, b); }
    if (b.t === 'table') {
      var lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 200).map(function (l) { return (Array.isArray(l) ? l : []).slice(0, 20).map(cellule); }).filter(function (l) { return l.length; });
      if (!lignes.length) return null;
      var n = Math.max.apply(null, lignes.map(function (l) { return l.length; }));
      lignes.forEach(function (l) { while (l.length < n) l.push(cellule({})); });
      var larg = Array.isArray(b.largeurs) && b.largeurs.length === n ? b.largeurs.map(function (x) { return Math.max(5, Math.min(95, +x || 0)); }) : null;
      return avecSuivi({ t: 'table', lignes: lignes, entete: b.entete === true, largeurs: larg }, b);
    }
    var t = BLOCS[b.t] ? b.t : b.t === 'li' ? 'li' : 'p';
    var x = { t: t, runs: fusionner(b.runs), al: ALIGNEMENTS[b.al] ? b.al : 'g' };
    var r = Math.round(+b.r); if (r > 0 && r <= 8) x.r = r;
    if (t === 'li') { x.liste = b.liste === 'ol' ? 'ol' : 'ul'; var n2 = Math.round(+b.n); x.n = n2 > 0 && n2 <= 6 ? n2 : 0; }
    return avecSuivi(x, b);
  }
  function zones(z) { z = z || {}; return { gauche: texte(z.gauche, 160), centre: texte(z.centre, 160), droite: texte(z.droite, 160) }; }
  function marge(v, d) { var n = Math.round(+v); return n >= 5 && n <= 50 ? n : d; }
  /** Page : orientation, marges (mm), police et taille par défaut, en-tête et pied de page, numéro de page. */
  function page(p) {
    p = p && typeof p === 'object' ? p : {};
    var m = p.marges || {};
    return { orientation: p.orientation === 'paysage' ? 'paysage' : 'portrait', marges: { h: marge(m.h, 20), b: marge(m.b, 20), g: marge(m.g, 20), d: marge(m.d, 20) },
      police: POLICES[p.police] && p.police ? p.police : 'calibri', taille: TAILLES.indexOf(+p.taille) >= 0 ? +p.taille : 11,
      entete: zones(p.entete), pied: p.pied ? zones(p.pied) : { gauche: '{titre}', centre: '', droite: 'Page {page}' }, interligne: [1, 1.15, 1.5, 2].indexOf(+p.interligne) >= 0 ? +p.interligne : 1.15,
      masque: masquePage(p.masque) };
  }
  /**
   * Masque de fond d'un document (0.42.0) : image du document (papier à en-tête, filigrane) sous le texte, sur toutes
   * les pages ou la première, opacité ; `source` : masque de service ou d'établissement dont il vient.
   */
  function masquePage(m) {
    if (!m || !ID_IMAGE.test(texte(m.image, 30))) return undefined;
    var o = Math.round(+m.opacite * 100) / 100;
    return { image: texte(m.image, 30), pages: m.pages === 'premiere' ? 'premiere' : 'toutes', opacite: o >= 0.05 && o <= 1 ? o : 1, source: texte(m.source, 40) || undefined, nom: texte(m.nom, 80) || undefined };
  }
  var ID_IMAGE = /^im[0-9a-f]{6,24}$/, MAX_IMAGE = 3000000;
  /**
   * Masques de service et d'établissement (réglage commun `masquesDocuments`, 0.42.0) :
   * { id: { nom, services (vide : établissement), image: { donnees (data:image/…), largeur, hauteur }, pages, opacite,
   * marges (facultatives, mm), orientation } }. Validés à la lecture.
   */
  function masques(config) {
    var src = (config && config.masquesDocuments) || {}, res = {};
    Object.keys(src).slice(0, 100).forEach(function (k) {
      var m = src[k]; if (!/^mq[0-9a-z]{4,24}$/.test(k) || !m || !m.image || !/^data:image\/(png|jpeg);base64,/.test(String(m.image.donnees || '')) || m.image.donnees.length > MAX_IMAGE) return;
      var mg = m.marges, o = Math.round(+m.opacite * 100) / 100;
      res[k] = { id: k, nom: texte(m.nom, 80) || 'Masque', services: (Array.isArray(m.services) ? m.services : []).map(function (s) { return texte(s, 30); }).filter(Boolean).slice(0, 50),
        image: { donnees: m.image.donnees, largeur: Math.round(+m.image.largeur) || 0, hauteur: Math.round(+m.image.hauteur) || 0 },
        pages: m.pages === 'premiere' ? 'premiere' : 'toutes', opacite: o >= 0.05 && o <= 1 ? o : 1, orientation: m.orientation === 'paysage' ? 'paysage' : 'portrait',
        marges: mg ? { h: marge(mg.h, 20), b: marge(mg.b, 20), g: marge(mg.g, 20), d: marge(mg.d, 20) } : null };
    });
    return res;
  }
  /** Masques proposés à un agent : ceux de l'établissement et ceux de ses services. */
  function masquesPour(config, compte) {
    var ms = masques(config), sv = (compte && compte.services) || [];
    return Object.keys(ms).map(function (k) { return ms[k]; }).filter(function (m) { return !m.services.length || m.services.some(function (s) { return sv.indexOf(s) >= 0; }); })
      .sort(function (a, b) { return (a.services.length ? 1 : 0) - (b.services.length ? 1 : 0) || a.nom.localeCompare(b.nom); });
  }
  /**
   * Changement des masques par un cadre (réglage ouvert au cadre) : seulement les masques de ses services (ajout,
   * modification, retrait) ; les masques d'établissement sont réservés à l'administrateur.
   */
  function controlerMasques(ancien, nouveau, compte) {
    var sv = (compte && compte.services) || [], a = ancien || {}, n = nouveau || {};
    function sien(m) { return m && Array.isArray(m.services) && m.services.length && m.services.every(function (s) { return sv.indexOf(s) >= 0; }); }
    return Object.keys(Object.assign({}, a, n)).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(n[k]) || ((!a[k] || sien(a[k])) && (!n[k] || sien(n[k]))); });
  }
  var GENRES = { texte: 'Document texte', tableur: 'Tableur' };
  /** Contenu d'un document, validé à la lecture : texte (blocs, page) ou tableur (feuilles, page, 0.35.0). */
  function contenu(c) {
    c = c && typeof c === 'object' ? c : {};
    if (c.genre === 'tableur' && T) return T.contenu(c);
    function blocsDe(l) { var b = (Array.isArray(l) ? l : []).slice(0, 5000).map(bloc).filter(Boolean); return b.length ? b : [{ t: 'p', runs: [], al: 'g' }]; }
    // Onglets (0.39.0) : un document texte peut être découpé en onglets { id, titre, blocs } ; sans onglet, `blocs`
    if (Array.isArray(c.onglets) && c.onglets.length) {
      var vus = {}, os = c.onglets.slice(0, MAX_ONGLETS).map(function (o, i) {
        var id = texte(o && o.id, 30).replace(/[^A-Za-z0-9_-]/g, ''); if (!id || vus[id]) id = 'o' + (i + 1) + Math.random().toString(36).slice(2, 7); vus[id] = 1;
        return { id: id, titre: texte(o && o.titre, 60).trim() || 'Onglet ' + (i + 1), blocs: blocsDe(o && o.blocs) };
      });
      return { v: 1, onglets: os, page: page(c.page) };
    }
    return { v: 1, blocs: blocsDe(c.blocs), page: page(c.page) };
  }
  var MAX_ONGLETS = 30;
  /** Onglets d'un contenu texte (un seul, sans titre, pour un document sans onglets). */
  function ongletsDe(c) { var x = c && c.onglets ? c : contenu(c); return x.onglets || [{ id: '', titre: '', blocs: x.blocs }]; }
  /** Contenu reconstruit à partir de ses onglets (sans onglets s'il n'en reste qu'un sans identifiant). */
  function avecOnglets(os, p) { return os.length === 1 && !os[0].id ? contenu({ blocs: os[0].blocs, page: p }) : contenu({ onglets: os, page: p }); }
  /** Texte brut d'un bloc (recherche, comparaison des versions). */
  function texteBloc(b) {
    if (!b) return '';
    if (b.t === 'saut') return '— saut de page —';
    if (b.t === 'img') return '[image' + (b.leg ? ' : ' + b.leg : '') + ']';
    if (b.t === 'table') return b.lignes.map(function (l) { return l.map(function (c) { return c.runs.map(function (r) { return r.x; }).join(''); }).join(' | '); }).join('\n');
    return (b.runs || []).map(function (r) { return r.x; }).join('');
  }
  function texteContenu(c) { var x = contenu(c); if (x.genre === 'tableur') return T.textesCases(x).map(function (y) { return y.valeur; }).join('\n'); return ongletsDe(x).map(function (o) { return (o.titre ? o.titre + '\n' : '') + o.blocs.map(texteBloc).join('\n'); }).join('\n'); }
  /** Titres du document (sommaire). */
  function sommaire(c) { var x = contenu(c); if (x.genre === 'tableur') return []; return [].concat.apply([], ongletsDe(x).map(function (o) { return o.blocs; })).map(function (b, i) { return /^h[123]$/.test(b.t) ? { niveau: +b.t.slice(1), texte: texteBloc(b), index: i } : null; }).filter(function (x) { return x && x.texte; }); }
  /** Métadonnées chiffrées avec le contenu : titre, rattachements. */
  function meta(m) {
    m = m && typeof m === 'object' ? m : {};
    var r = (Array.isArray(m.rattaches) ? m.rattaches : []).filter(function (x) { return x && /^[a-z]{2,20}$/.test(x.module || '') && /^[a-z-]{2,20}$/.test(x.genre || '') && texte(x.id, 60); }).slice(0, 30)
      .map(function (x) { return { module: x.module, genre: x.genre, id: texte(x.id, 60), libelle: texte(x.libelle, 120), service: texte(x.service, 30) }; });
    return { titre: texte(m.titre, 160) || 'Sans titre', rattaches: r, resume: texte(m.resume, 300) };
  }

  /**
   * Comparaison de deux versions, bloc par bloc (plus longue sous-suite commune sur le texte des blocs) :
   * [{ etat: 'egal' | 'ajout' | 'retrait', texte }].
   */
  function comparer(a, b) {
    if ((a && a.genre === 'tableur') || (b && b.genre === 'tableur')) return T.comparer(contenu(Object.assign({ genre: 'tableur' }, a)), contenu(Object.assign({ genre: 'tableur' }, b)));
    var ca = contenu(a), cb = contenu(b);
    if (ca.onglets || cb.onglets) {
      // Onglets : comparaison onglet par onglet (repérés par leur identifiant)
      var oa = ongletsDe(ca), ob = ongletsDe(cb), res = [], ids = ob.map(function (o) { return o.id; });
      oa.forEach(function (o) { if (ids.indexOf(o.id) < 0) ids.push(o.id); });
      ids.forEach(function (id) {
        var x = oa.filter(function (o) { return o.id === id; })[0], y = ob.filter(function (o) { return o.id === id; })[0];
        if (!x) { res.push({ etat: 'ajout', texte: '— Onglet ajouté : ' + y.titre + ' —' }); y.blocs.forEach(function (bl) { res.push({ etat: 'ajout', texte: texteBloc(bl) }); }); return; }
        if (!y) { res.push({ etat: 'retrait', texte: '— Onglet retiré : ' + x.titre + ' —' }); return; }
        res.push({ etat: x.titre === y.titre ? 'egal' : 'ajout', texte: '— Onglet : ' + (x.titre === y.titre ? y.titre : x.titre + ' → ' + y.titre) + ' —' });
        res = res.concat(comparer({ blocs: x.blocs }, { blocs: y.blocs }));
      });
      return res;
    }
    var x = ca.blocs.map(texteBloc), y = cb.blocs.map(texteBloc), n = x.length, m = y.length;
    if (n * m > 4e6) return [{ etat: 'retrait', texte: x.join('\n') }, { etat: 'ajout', texte: y.join('\n') }];
    var L = []; for (var i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var res = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { res.push({ etat: 'egal', texte: x[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { res.push({ etat: 'retrait', texte: x[i] }); i++; }
      else { res.push({ etat: 'ajout', texte: y[j] }); j++; }
    }
    while (i < n) res.push({ etat: 'retrait', texte: x[i++] });
    while (j < m) res.push({ etat: 'ajout', texte: y[j++] });
    return res;
  }

  // ------------------------------------------------------------ Suivi des modifications (0.37.0)
  /**
   * Modifications suivies d'un document texte : [{ bloc, genre: 'ins' | 'del' | 'fmt' | 'bloc', texte, op, id, p, n, le }]
   * (texte ajouté ou supprimé, mise en forme changée, paragraphe ou élément ajouté, supprimé, fusionné).
   */
  function modificationsSuivies(c) {
    var x0 = contenu(c);
    if (x0.onglets) return [].concat.apply([], x0.onglets.map(function (o) { return modificationsSuivies({ blocs: o.blocs }).map(function (m) { m.onglet = o.id; m.ongletTitre = o.titre; return m; }); }));
    var res = [];
    function runs(rs, i) {
      (rs || []).forEach(function (r) {
        ['ins', 'del'].forEach(function (g) { if (r[g]) { var d = res[res.length - 1]; if (d && d.bloc === i && d.genre === g && d.p === r[g].p && d.le === r[g].le) d.texte += r.x; else res.push({ bloc: i, genre: g, texte: r.x, p: r[g].p, n: r[g].n, le: r[g].le }); } });
        if (r.fmt) { var e = res.filter(function (x) { return x.genre === 'fmt' && x.id === r.fmt.id; })[0]; if (e) e.texte += r.x; else res.push({ bloc: i, genre: 'fmt', id: r.fmt.id, texte: r.x, p: r.fmt.p, n: r.fmt.n, le: r.fmt.le }); }
      });
    }
    (contenu(c).blocs || []).forEach(function (b, i) {
      if (b.suivi) res.push({ bloc: i, genre: 'bloc', op: b.suivi.op, id: b.suivi.id, texte: OPS_BLOC[b.suivi.op] + (b.t === 'table' ? ' (tableau)' : b.t === 'saut' ? ' (saut de page)' : ' : ' + texteBloc(b).slice(0, 80)), p: b.suivi.p, n: b.suivi.n, le: b.suivi.le });
      if (b.t === 'table') b.lignes.forEach(function (l) { l.forEach(function (x) { runs(x.runs, i); }); }); else runs(b.runs, i);
    });
    return res;
  }
  function textuel(b) { return b && b.runs && b.t !== 'table' && b.t !== 'saut'; }
  /**
   * Tout accepter ou tout refuser, ou une seule mise en forme ou un seul paragraphe (`id`). Accepter : texte ajouté gardé,
   * texte supprimé retiré (un paragraphe dont tout le texte est supprimé disparaît), mise en forme gardée, élément ajouté
   * gardé, élément supprimé retiré, paragraphes fusionnés. Refuser : l'inverse.
   */
  function resoudreSuivi(c, accepter, id) {
    var x0 = contenu(c);
    if (x0.onglets) return contenu({ onglets: x0.onglets.map(function (o) { return { id: o.id, titre: o.titre, blocs: resoudreSuivi({ blocs: o.blocs }, accepter, id).blocs }; }), page: x0.page });
    var x = JSON.parse(JSON.stringify(x0));
    function runs(rs) {
      return fusionner((rs || []).filter(function (r) { return id ? true : accepter ? !r.del : !r.ins; }).map(function (r) {
        var y = Object.assign({}, r);
        if (!id) { delete y.ins; delete y.del; }
        if (y.fmt && (!id || y.fmt.id === id)) { if (!accepter) { ['g', 'i', 's', 'b', 'p', 'z', 'c', 'f'].forEach(function (k) { delete y[k]; }); Object.assign(y, r.fmt.avant); } delete y.fmt; }
        return y;
      }));
    }
    var res = [];
    x.blocs.forEach(function (b) {
      var avant = textuel(b) ? (b.runs || []).length : 0;
      if (b.t === 'table') b.lignes.forEach(function (l) { l.forEach(function (y) { y.runs = runs(y.runs); }); }); else if (b.runs) b.runs = runs(b.runs);
      var m = b.suivi, vise = m && (!id || m.id === id);
      if (vise) delete b.suivi;
      if (!id && accepter && textuel(b) && avant && !b.runs.length) return;   // tout le texte supprimé : paragraphe retiré
      if (vise) {
        var retirer = (m.op === 'ajout' && !accepter) || (m.op === 'del' && accepter), joindre = (m.op === 'ins' && !accepter) || (m.op === 'fusion' && accepter);
        if (retirer) return;
        var prec = res[res.length - 1];
        if (joindre && textuel(prec) && textuel(b)) { prec.runs = fusionner(prec.runs.concat(b.runs)); return; }
      }
      res.push(b);
    });
    x.blocs = res;
    return contenu(x);
  }

  // ------------------------------------------------------------ Fusion à trois (édition simultanée, 0.37.0)
  /**
   * Correspondance de deux suites (plus longue sous-suite commune) : paires [i, j] des éléments égaux, dans l'ordre.
   */
  function correspondances(x, y) {
    var n = x.length, m = y.length;
    if (n * m > 4e6) { var k = 0; while (k < n && k < m && x[k] === y[k]) k++; var r = []; for (var i0 = 0; i0 < k; i0++) r.push([i0, i0]); return r; }
    var L = []; for (var i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var res = []; i = 0; j = 0;
    while (i < n && j < m) { if (x[i] === y[j]) { res.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    return res;
  }
  /**
   * Fusion à trois de suites d'éléments (comparés par leur texte JSON) : ce que chacun a changé depuis la base est
   * gardé ; les deux ont changé le même passage différemment : les deux versions sont gardées (la sienne d'abord) et le
   * conflit est compté. Retourne { elements, conflits }.
   */
  function fusion3(base, mien, autre) {
    var B = base.map(JSON.stringify), M = mien.map(JSON.stringify), A = autre.map(JSON.stringify);
    // Changements de chaque côté par rapport à la base : { d, f (fin exclue, dans la base), el (éléments à la place) }
    function changements(S, objets, cote) {
      var res = [], pb = 0, ps = 0;
      correspondances(B, S).concat([[B.length, S.length]]).forEach(function (p) {
        if (p[0] > pb || p[1] > ps) res.push({ d: pb, f: p[0], el: objets.slice(ps, p[1]), js: S.slice(ps, p[1]), cote: cote });
        pb = p[0] + 1; ps = p[1] + 1;
      });
      return res;
    }
    var tous = changements(M, mien, 'm').concat(changements(A, autre, 'a')).sort(function (x, y) { return x.d - y.d || x.f - y.f; });
    function touche(x, y) { return (x.d < y.f && y.d < x.f) || x.d === y.d || (x.d === x.f && x.d > y.d && x.d < y.f) || (y.d === y.f && y.d > x.d && y.d < x.f); }
    var res = [], pos = 0, conflits = 0, k = 0;
    function appliquer(hs, d, f) { var r = [], p = d; hs.forEach(function (x) { r = r.concat(base.slice(p, x.d), x.el); p = x.f; }); return r.concat(base.slice(p, f)); }
    while (k < tous.length) {
      var groupe = [tous[k]], d = tous[k].d, f = tous[k].f; k++;
      while (k < tous.length && groupe.some(function (x) { return touche(x, tous[k]); })) { groupe.push(tous[k]); f = Math.max(f, tous[k].f); k++; }
      res = res.concat(base.slice(pos, d));
      var hm = groupe.filter(function (x) { return x.cote === 'm'; }), ha = groupe.filter(function (x) { return x.cote === 'a'; });
      var vm = appliquer(hm, d, f), va = appliquer(ha, d, f);
      if (!hm.length) res = res.concat(va);
      else if (!ha.length) res = res.concat(vm);
      else {
        var jm = vm.map(JSON.stringify), ja = va.map(JSON.stringify);
        if (jm.join('\n') === ja.join('\n')) res = res.concat(vm);
        else { res = res.concat(vm, va.filter(function (x, i) { return jm.indexOf(ja[i]) < 0; })); conflits++; }
      }
      pos = f;
    }
    return { elements: res.concat(base.slice(pos)), conflits: conflits };
  }
  /** Valeur fusionnée d'un objet entier : changée d'un seul côté, ou la sienne si les deux l'ont changée. */
  function fusionObjet(base, mien, autre) {
    var b = JSON.stringify(base), m = JSON.stringify(mien), a = JSON.stringify(autre);
    if (m === b) return { valeur: autre, conflit: false };
    return { valeur: mien, conflit: a !== b && a !== m };
  }
  /**
   * Fusion de deux versions d'un document (la sienne et celle enregistrée entre-temps par un autre agent), d'après la
   * version de départ commune : { meta, contenu, conflits }.
   */
  function fusionnerVersions(base, mien, autre) {
    var mb = meta(base.meta), mm = meta(mien.meta), ma = meta(autre.meta), conflits = 0;
    var t = fusionObjet(mb.titre, mm.titre, ma.titre); if (t.conflit) conflits++;
    var r = fusionObjet(mb.rattaches, mm.rattaches, ma.rattaches);
    var m2 = Object.assign({}, mm, { titre: t.valeur, rattaches: r.valeur });
    var cb = contenu(base.contenu), cm = contenu(mien.contenu), ca = contenu(autre.contenu), c;
    if (cm.genre === 'tableur' || ca.genre === 'tableur') { var f = T.fusionner(cb.genre === 'tableur' ? cb : T.contenu({}), T.contenu(cm), T.contenu(ca)); c = f.contenu; conflits += f.conflits; }
    else {
      // Onglet par onglet (repérés par leur identifiant) : ajoutés d'un côté gardés, retirés d'un côté sans changement de l'autre retirés
      var ob = ongletsDe(cb), om = ongletsDe(cm), oa = ongletsDe(ca), p = fusionObjet(cb.page, cm.page, ca.page), os = [];
      function par(l, id) { return l.filter(function (o) { return o.id === id; })[0]; }
      var ordre = om.map(function (o) { return o.id; }); oa.forEach(function (o) { if (ordre.indexOf(o.id) < 0 && !par(ob, o.id)) ordre.push(o.id); });
      ordre.forEach(function (id) {
        var b0 = par(ob, id), m0 = par(om, id), a0 = par(oa, id);
        if (!m0) { os.push(a0); return; }
        if (!a0 && b0) { if (JSON.stringify(m0) === JSON.stringify(b0)) return; os.push(m0); conflits++; return; }
        if (!a0) { os.push(m0); return; }
        var f3 = fusion3(b0 ? b0.blocs : [], m0.blocs, a0.blocs), tt = fusionObjet(b0 ? b0.titre : m0.titre, m0.titre, a0.titre);
        conflits += f3.conflits + (tt.conflit ? 1 : 0);
        os.push({ id: id, titre: tt.valeur, blocs: f3.elements });
      });
      c = avecOnglets(os, p.valeur); conflits += p.conflit ? 1 : 0;
    }
    return { meta: meta(m2), contenu: c, conflits: conflits };
  }

  // ------------------------------------------------------------ Partage et clés (une clé par document)
  /** Entrée de partage validée : { genre: agent | service | role | groupe, code, service (rôle), droit }. */
  function entree(p) {
    if (!p || ['agent', 'service', 'role', 'groupe'].indexOf(p.genre) < 0 || !texte(p.code, 60)) return null;
    var x = { genre: p.genre, code: texte(p.code, 60), droit: DROITS_DOC[p.droit] ? p.droit : 'lire' };
    if (p.genre === 'role') { if (!texte(p.service, 30)) return null; x.service = texte(p.service, 30); }
    if (x.droit === 'gerer' && p.genre !== 'agent') x.droit = 'modifier';   // gérer : agent nommé seulement
    return x;
  }
  function partage(l) {
    var vus = {}, res = [];
    (Array.isArray(l) ? l : []).map(entree).filter(Boolean).forEach(function (p) { var k = p.genre + '|' + p.code + '|' + (p.service || ''); if (vus[k]) return; vus[k] = 1; res.push(p); });
    return res.slice(0, 200);
  }
  /** Nom de la clé d'une entrée de partage (familles « k- » : agent, service, rôle d'un service, groupe). */
  function nomCle(p) {
    if (p.genre === 'agent') return 'k-a.' + p.code;
    if (p.genre === 'service') return 'k-s.' + p.code;
    if (p.genre === 'role') return 'k-r.' + p.code + '.' + p.service;
    return 'k-g.' + p.code;
  }
  /** Clés pour lesquelles la clé du document est emballée : son auteur et chaque entrée de partage. */
  function clesDocument(auteur, l) {
    var res = ['k-a.' + auteur];
    partage(l).forEach(function (p) { var n = nomCle(p); if (res.indexOf(n) < 0) res.push(n); });
    return res;
  }
  /** Clés à créer (administrateur) : une par agent, par service, par rôle de service dans chaque service, par groupe. */
  function clesNecessaires(config, comptes) {
    var res = [], svs = ((config && config.services) || []).map(function (s) { return s.code; });
    (comptes || []).filter(function (c) { return c && c.actif !== false && c.id !== 'secours'; }).forEach(function (c) { res.push('k-a.' + c.id); });
    svs.forEach(function (s) { res.push('k-s.' + s); M.ROLES_DE_SERVICE.filter(function (r) { return r !== 'INTERVENANT'; }).forEach(function (r) { res.push('k-r.' + r + '.' + s); }); });
    ((config && config.groupes) || []).forEach(function (g) { if (g && g.code) res.push('k-g.' + g.code); });
    return res;
  }
  /** Un compte a-t-il droit à une clé de document (membre du module ; agent, service, rôle du service, groupe) ? */
  function aDroitCle(nom, compte, config, membre) {
    if (!compte || !membre) return false;
    var p = String(nom).split('.'), genre = p[0], sv = compte.services || [];
    if (genre === 'k-a') return p.slice(1).join('.') === compte.id;
    if (genre === 'k-s') return sv.indexOf(p[1]) >= 0;
    if (genre === 'k-r') return (compte.roles || []).indexOf(p[1]) >= 0 && sv.indexOf(p[2]) >= 0;
    if (genre === 'k-g') return G ? G.de(config, compte.id).indexOf(p.slice(1).join('.')) >= 0 : false;
    return false;
  }
  /** Droit d'un compte sur un document : 'gerer' (auteur), le plus haut des partages qui le concernent, ou null. */
  function droitDe(doc, compte, config) {
    if (!doc || !compte) return null;
    if (doc.auteur === compte.id) return 'gerer';
    var gr = G ? G.de(config, compte.id) : [], sv = compte.services || [], ro = compte.roles || [], best = null;
    (doc.partage || []).forEach(function (p) {
      var ok = p.genre === 'agent' ? p.code === compte.id : p.genre === 'service' ? sv.indexOf(p.code) >= 0 : p.genre === 'role' ? ro.indexOf(p.code) >= 0 && sv.indexOf(p.service) >= 0 : gr.indexOf(p.code) >= 0;
      if (ok && (!best || DROITS_DOC[p.droit] > DROITS_DOC[best])) best = p.droit;
    });
    return best;
  }
  /** Droit d'exporter (0.40.0) : réglé par document par celui qui le gère (« modifier » par défaut). */
  function peutExporter(doc, compte, config) { var n = (doc && doc.options && doc.options.export) || 'modifier'; return peut(doc, compte, config, n); }
  function peut(doc, compte, config, droit) { var d = droitDe(doc, compte, config); return !!d && DROITS_DOC[d] >= DROITS_DOC[droit]; }
  /** Partage retiré (une entrée en moins, ou un droit abaissé à rien) : nouvelle génération de la clé du document. */
  function retraitDe(ancien, nouveau) {
    var cles = {}; partage(nouveau).forEach(function (p) { cles[nomCle(p)] = 1; });
    return partage(ancien).some(function (p) { return !cles[nomCle(p)]; });
  }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, x = d.doc && st.docs[d.doc];
    if (x && x.noms && d.nom && !x.efface) x.noms[e.by] = texte(d.nom, 80);   // nom affiché de l'agent (comptes fictifs ou retirés)
    switch (e.type) {
      case 'DOC':
        if (!ID.test(d.id || '') || st.docs[d.id]) break;
        st.docs[d.id] = { id: d.id, genre: GENRES[d.genre] ? d.genre : 'texte', modele: d.modele === true, auteur: e.by, cree: e.at, partage: partage(d.partage), services: Array.isArray(d.services) ? d.services.slice(0, 30) : [],
          depuis: texte(d.depuis, 40), versions: [], statut: { statut: 'brouillon' }, validations: [], corbeille: null, efface: null, modifie: e.at, noms: {}, options: { simultane: false, suivi: false, export: 'modifier' } };
        if (d.nom) st.docs[d.id].noms[e.by] = texte(d.nom, 80);
        break;
      case 'DOC_VERSION':
        if (!x || x.efface || typeof d.ct !== 'string') break;
        x.versions.push({ id: e.id, le: e.at, par: e.by, g: +d.g || 1, ct: d.ct, taille: d.ct.length, restauree: texte(d.restauree, 60), base: texte(d.base, 80) });   // base : version de départ (édition simultanée)
        x.modifie = e.at;
        if (x.statut.statut === 'valide') x.statut = Object.assign({}, x.statut, { statut: 'modifie' });
        break;
      case 'DOC_PARTAGE':
        if (!x || x.efface) break;
        x.partage = partage(d.partage);
        if (Array.isArray(d.services)) x.services = d.services.slice(0, 30);
        break;
      case 'DOC_STATUT':
        // Demande de validation, retour en brouillon (avec message)
        if (!x || x.efface) break;
        if (d.statut === 'a-valider' || d.statut === 'brouillon') x.statut = Object.assign({}, x.statut, { statut: d.statut, demandePar: e.by, demandeLe: e.at, message: texte(d.message, 300), attendu: '', etapes: [] });
        break;
      case 'DOC_VALIDATION':
        if (!x || x.efface) break;
        var v = x.versions.filter(function (y) { return y.id === d.version; })[0];
        if (!v) break;
        // Validation supplémentaire (0.34.1) : le valideur la demande à un agent nommé, qui reçoit le document en lecture ;
        // le document reste « à valider » jusqu'à la dernière validation. Les étapes déjà faites sont gardées.
        var etapes = ((x.statut.statut === 'a-valider' && x.statut.etapes) || []).concat([{ par: e.by, le: e.at, version: v.id, message: texte(d.message, 300) }]);
        var sup = texte(d.supplementaire, 60);
        x.validations.push({ par: e.by, le: e.at, version: v.id, revision: JOUR.test(d.revision || '') ? d.revision : '', supplementaire: sup });
        if (sup) {
          x.statut = { statut: 'a-valider', attendu: sup, etapes: etapes, demandePar: e.by, demandeLe: e.at, message: texte(d.message, 300), revision: JOUR.test(d.revision || '') ? d.revision : '' };
          if (!x.partage.some(function (p) { return p.genre === 'agent' && p.code === sup; })) x.partage.push({ genre: 'agent', code: sup, droit: 'lire' });
          break;
        }
        var rev = JOUR.test(d.revision || '') ? d.revision : (x.statut.attendu ? x.statut.revision || '' : '');   // date choisie à la 1re étape
        x.statut = { statut: 'valide', par: e.by, le: e.at, version: v.id, revision: rev, message: texte(d.message, 300), etapes: etapes };
        break;
      case 'DOC_CORBEILLE':
        if (!x || x.efface) break;
        x.corbeille = d.corbeille ? { le: e.at, par: e.by } : null;
        break;
      case 'DOC_OPTIONS':
        // Options du document (0.37.0) : édition simultanée en direct, suivi des modifications (désactivées par défaut)
        if (!x || x.efface) break;
        x.options = { simultane: d.simultane === true, suivi: d.suivi === true, export: DROITS_DOC[d.export] ? d.export : (x.options.export || 'modifier'), par: e.by, le: e.at };
        break;
      case 'DOC_IMAGE':
        // Image d'un document (0.42.0) : chiffrée par la clé du document, écrite une fois, citée par les versions
        if (!x || x.efface || !ID_IMAGE.test(texte(d.id, 30)) || typeof d.ct !== 'string') break;
        (x.images = x.images || {})[d.id] = { id: d.id, g: +d.g || 1, ct: d.ct, le: e.at, par: e.by };
        break;
      case 'DOC_EXPORT':
        // Export (0.40.0) : le fichier sort du chiffrement de Tessera ; inscrit au journal du module (format, version)
        if (!x || x.efface) break;
        (x.exports = x.exports || []).push({ par: e.by, le: e.at, format: texte(d.format, 10), version: texte(d.version, 80) });
        break;
      case 'DOC_TRANSFERT':
        // Compte de l'auteur retiré (0.34.1) : la gestion passe au cadre de ses services (session de l'administrateur)
        if (!x || x.efface || !Array.isArray(d.vers)) break;
        d.vers.slice(0, 20).forEach(function (id) {
          id = texte(id, 60); if (!id) return;
          var p = x.partage.filter(function (y) { return y.genre === 'agent' && y.code === id; })[0];
          if (p) p.droit = 'gerer'; else x.partage.push({ genre: 'agent', code: id, droit: 'gerer' });
        });
        x.transfert = { le: e.at, vers: d.vers.slice(0, 20), de: x.auteur };
        break;
      case 'DOC_EFFACE':
        if (!x || x.efface) break;
        x.efface = { le: e.at, par: e.by };
        x.versions.forEach(function (y) { y.ct = null; });   // illisibles de toute façon : clé détruite
        if (x.images) Object.keys(x.images).forEach(function (k) { x.images[k].ct = null; });
        break;
    }
  }
  function reduire(evts) {
    return N.reduire(evts, { cle: 'documents', etat: function () { return { docs: {} }; }, appliquer: appliquer });
  }

  // ------------------------------------------------------------ Lecture
  /** Statut affiché : « à réviser » quand la date de révision d'un document validé est passée. */
  function statut(doc, maintenant) {
    var s = (doc && doc.statut) || { statut: 'brouillon' };
    if ((s.statut === 'valide' || s.statut === 'modifie') && s.revision && s.revision <= jourISO(maintenant || Date.now())) return Object.assign({}, s, { statut: 'a-reviser', avant: s.statut });
    return s;
  }
  function derniere(doc) { return doc && doc.versions.length ? doc.versions[doc.versions.length - 1] : null; }
  /** Version en vigueur : la dernière validée, sinon la dernière. */
  function enVigueur(doc) {
    var s = doc && doc.statut, v = s && s.version && doc.versions.filter(function (y) { return y.id === s.version; })[0];
    return v || derniere(doc);
  }
  /** Documents que le compte peut lire (hors effacés) ; `options` : { modeles, corbeille }. */
  function visibles(st, compte, config, options) {
    var o = options || {};
    return Object.keys((st && st.docs) || {}).map(function (k) { return st.docs[k]; }).filter(function (d) {
      if (d.efface || !droitDe(d, compte, config)) return false;
      if (o.corbeille) return !!d.corbeille;
      if (d.corbeille) return false;
      return o.modeles === undefined ? true : !!d.modele === !!o.modeles;
    }).sort(function (a, b) { return String(b.modifie).localeCompare(String(a.modifie)); });
  }
  /** Documents à valider pour un valideur (cadre) : demandes de validation des documents qu'il peut lire. */
  function aValider(st, compte, config) {
    var v = estValideur(compte, config);
    return visibles(st, compte, config, { modeles: undefined }).filter(function (d) { var s = statut(d); return s.statut === 'a-valider' && (s.attendu ? s.attendu === compte.id : v); });
  }
  /** Validations supplémentaires demandées nommément à cet agent. */
  function validationsDemandees(st, compte, config) { return visibles(st, compte, config, { modeles: undefined }).filter(function (d) { var s = statut(d); return s.statut === 'a-valider' && s.attendu && s.attendu === compte.id; }); }
  /** Peut valider ce document : la personne attendue (validation supplémentaire), sinon un valideur à qui il est partagé. */
  function peutValider(doc, compte, config) {
    var s = statut(doc); if (s.statut !== 'a-valider' || !compte) return false;
    return s.attendu ? s.attendu === compte.id : estValideur(compte, config) && !!droitDe(doc, compte, config);
  }
  /**
   * Documents dont l'auteur n'a plus de compte actif, sans transfert : gestion à transférer au cadre (rôle CADRE actif)
   * d'un des services de l'auteur. [{ doc, vers: [ids] }] ; un document sans cadre trouvé attend.
   */
  function aTransferer(st, comptes, config) {
    var cs = comptes || [], res = [], prives = options(config).transfertPrives;
    Object.keys((st && st.docs) || {}).forEach(function (k) {
      var d = st.docs[k], a = cs.filter(function (c) { return c.id === d.auteur; })[0];
      if (d.efface || d.transfert || !a || a.actif !== false) return;
      if (!prives && !(d.partage || []).length) return;   // document privé : transfert désactivé par défaut
      var vers = cs.filter(function (c) { return c.actif !== false && c.id !== a.id && (c.roles || []).indexOf('CADRE') >= 0 && (c.services || []).some(function (x) { return (a.services || []).indexOf(x) >= 0; }); }).map(function (c) { return c.id; });
      if (vers.length) res.push({ doc: d.id, vers: vers });
    });
    return res;
  }
  /** Documents de la corbeille dont l'effacement est échu (30 jours). */
  function aEffacer(st, maintenant, jours) {
    var lim = (maintenant || Date.now()) - (jours || CORBEILLE_JOURS) * 864e5;
    return Object.keys((st && st.docs) || {}).map(function (k) { return st.docs[k]; }).filter(function (d) { return d.corbeille && !d.efface && Date.parse(d.corbeille.le) <= lim; });
  }
  function joursAvantEffacement(doc, maintenant, jours) { return doc && doc.corbeille ? Math.max(0, Math.ceil((Date.parse(doc.corbeille.le) + (jours || CORBEILLE_JOURS) * 864e5 - (maintenant || Date.now())) / 864e5)) : null; }

  // ------------------------------------------------------------ Contrôles
  function estValideur(compte, config) { return D.peut((compte && compte.roles) || [], 'DOC_VALIDATION', config); }
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || reduire([]), compte = ctx && ctx.compte, config = ctx && ctx.config, x = d && d.doc ? st.docs[d.doc] : null, roles = (compte && compte.roles) || [];
    if (type === 'DOC') {
      if (!ID.test(d.id || '')) throw new Error('Identifiant du document invalide.');
      if (st.docs[d.id]) throw new Error('Document déjà créé.');
      if (d.modele) {
        var svs = d.services || [];
        if (roles.indexOf('ADMIN') < 0 && !(roles.indexOf('CADRE') >= 0 || roles.indexOf('CADRE_SUP') >= 0)) throw new Error('Les modèles sont créés par le cadre (ses services) ou l’administrateur (établissement).');
        if (roles.indexOf('ADMIN') < 0 && svs.some(function (s) { return (compte.services || []).indexOf(s) < 0; })) throw new Error('Modèle : choisissez parmi vos services.');
      }
      partage(d.partage).forEach(function (p) { if (p.droit === 'gerer' && p.genre !== 'agent') throw new Error('Le droit de gérer se donne à un agent nommé.'); });
      return;
    }
    if (!x) throw new Error('Document introuvable.');
    if (x.efface) throw new Error('Document effacé.');
    if (type === 'DOC_VERSION') {
      if (!peut(x, compte, config, 'modifier')) throw new Error('Vous ne pouvez pas modifier ce document.');
      if (x.corbeille) throw new Error('Document dans la corbeille : restaurez-le d’abord.');
      if (typeof d.ct !== 'string' || d.ct.length > MAX_VERSION) throw new Error('Document trop volumineux.');
      return;
    }
    if (type === 'DOC_OPTIONS') {
      if (!peut(x, compte, config, 'modifier')) throw new Error('Vous ne pouvez pas modifier ce document.');
      if (d.export && d.export !== ((x.options && x.options.export) || 'modifier') && !peut(x, compte, config, 'gerer')) throw new Error('Seul celui qui gère le document règle qui peut l’exporter.');
      return;
    }
    if (type === 'DOC_IMAGE') {
      if (!peut(x, compte, config, 'modifier')) throw new Error('Vous ne pouvez pas modifier ce document.');
      if (!ID_IMAGE.test(String(d.id || '')) || typeof d.ct !== 'string' || d.ct.length > MAX_IMAGE * 1.4) throw new Error('Image trop lourde ou invalide.');
      return;
    }
    if (type === 'DOC_EXPORT') { if (!peutExporter(x, compte, config)) throw new Error('Vous ne pouvez pas exporter ce document.'); return; }
    if (type === 'DOC_PARTAGE' || type === 'DOC_CORBEILLE') {
      if (!peut(x, compte, config, 'gerer')) throw new Error('Seul celui qui gère le document change son partage ou le met à la corbeille.');
      if (type === 'DOC_PARTAGE') partage(d.partage).forEach(function (p) { if (p.droit === 'gerer' && p.genre !== 'agent') throw new Error('Le droit de gérer se donne à un agent nommé.'); });
      return;
    }
    if (type === 'DOC_STATUT') {
      if (d.statut === 'a-valider' && !peut(x, compte, config, 'modifier')) throw new Error('Vous ne pouvez pas demander la validation de ce document.');
      if (d.statut === 'brouillon' && !peut(x, compte, config, 'modifier') && !peutValider(x, compte, config)) throw new Error('Changement de statut non permis.');
      if (['a-valider', 'brouillon'].indexOf(d.statut) < 0) throw new Error('Statut inconnu.');
      if (!x.versions.length) throw new Error('Document vide : enregistrez-le d’abord.');
      return;
    }
    if (type === 'DOC_VALIDATION') {
      var att = statut(x).attendu;
      if (att && att !== (compte && compte.id)) throw new Error('Une validation supplémentaire est demandée à un autre agent.');
      if (!att && !estValideur(compte, config)) throw new Error('Votre rôle ne permet pas de valider les documents.');
      if (!att && !droitDe(x, compte, config)) throw new Error('Le document doit vous être partagé pour être validé.');
      if (statut(x).statut !== 'a-valider') throw new Error('Le document n’est pas à valider.');
      if (d.supplementaire && (!texte(d.supplementaire, 60) || d.supplementaire === compte.id)) throw new Error('Validation supplémentaire : choisissez un autre agent.');
      if (!x.versions.some(function (v) { return v.id === d.version; })) throw new Error('Version inconnue.');
      if (d.revision && (!JOUR.test(d.revision) || d.revision <= jourISO(Date.now()))) throw new Error('La date de révision doit être à venir.');
      return;
    }
    if (type === 'DOC_EFFACE') {
      // Effacement : celui qui gère le document (depuis la corbeille), ou n'importe quel poste à l'échéance des 30 jours
      if (!x.corbeille) throw new Error('Seul un document de la corbeille est effacé.');
      if (!peut(x, compte, config, 'gerer') && Date.parse(x.corbeille.le) > Date.now() - joursCorbeille(config) * 864e5) throw new Error('Effacement réservé à celui qui gère le document avant l’échéance.');
    }
    if (type === 'DOC_TRANSFERT') {
      if (roles.indexOf('ADMIN') < 0) throw new Error('Le transfert des documents d’un compte retiré est fait par l’administrateur.');
      if (!Array.isArray(d.vers) || !d.vers.length) throw new Error('Transfert : aucun destinataire.');
    }
  }
  /** Saisies permises par le droit sur le document (et non par le seul rôle) : versions, partage, corbeille, statut, effacement échu. */
  function permisPourSoi(type, data, compte, ctx) {
    if (type === 'DOC_EXPORT' && data && ctx && ctx.etat && ctx.etat.docs && ctx.etat.docs[data.doc]) return peutExporter(ctx.etat.docs[data.doc], compte, ctx.config);
    if (['DOC_VERSION', 'DOC_PARTAGE', 'DOC_CORBEILLE', 'DOC_STATUT', 'DOC_EFFACE', 'DOC_VALIDATION', 'DOC_OPTIONS', 'DOC_IMAGE'].indexOf(type) < 0 || !data || !ctx || !ctx.etat) return false;
    var x = ctx.etat.docs && ctx.etat.docs[data.doc];
    if (!x) return false;
    // Validation supplémentaire : la personne nommée valide (ou renvoie en brouillon) sans le rôle de valideur
    if (type === 'DOC_VALIDATION') return !!statut(x).attendu && statut(x).attendu === (compte && compte.id);
    if (type === 'DOC_STATUT' && data.statut === 'brouillon' && statut(x).attendu === (compte && compte.id)) return true;
    if (type === 'DOC_EFFACE') return !!x.corbeille && (peut(x, compte, ctx.config, 'gerer') || Date.parse(x.corbeille.le) <= Date.now() - joursCorbeille(ctx.config) * 864e5);
    return peut(x, compte, ctx.config, type === 'DOC_VERSION' || type === 'DOC_STATUT' || type === 'DOC_OPTIONS' || type === 'DOC_IMAGE' ? 'modifier' : 'gerer');
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'documents.utiliser', libelle: 'Créer des documents, modifier ceux qui lui sont partagés', types: ['DOC', 'DOC_VERSION', 'DOC_PARTAGE', 'DOC_STATUT', 'DOC_CORBEILLE', 'DOC_EFFACE', 'DOC_OPTIONS', 'DOC_EXPORT', 'DOC_IMAGE'] },
    { code: 'documents.valider', libelle: 'Valider les documents (procédures, règlements) et fixer leur date de révision', types: ['DOC_VALIDATION'] }
  ];
  var U_ = ['DOC', 'DOC_VERSION', 'DOC_PARTAGE', 'DOC_STATUT', 'DOC_CORBEILLE', 'DOC_EFFACE', 'DOC_OPTIONS', 'DOC_EXPORT', 'DOC_IMAGE'];
  // Droits proposés : tous les agents créent ; le cadre et le cadre supérieur valident
  var DROITS = { IDE: U_, AS: U_, SECRETAIRE: U_, MEDECIN: U_, MEDECIN_CHEF_SERVICE: U_, MEDECIN_CHEF_POLE: U_, DIRECTEUR_SOINS: U_, CADRE: TYPES.slice() };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: ['DOC_TRANSFERT'], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'documents', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.documents : undefined; },
    appartenance: 'acces'
  });
  /** Services concernés par une saisie : ceux du partage (services, rôles) et du modèle. */
  function cibles(st, e) {
    var d = e.data || {}, x = (d.doc && st && st.docs && st.docs[d.doc]) || (e.type === 'DOC' ? { partage: partage(d.partage), services: d.services || [] } : null), res = [];
    if (!x) return res;
    (x.services || []).forEach(function (s) { if (res.indexOf(s) < 0) res.push(s); });
    (x.partage || []).forEach(function (p) { var s = p.genre === 'service' ? p.code : p.genre === 'role' ? p.service : null; if (s && res.indexOf(s) < 0) res.push(s); });
    return res;
  }

  var contrat = {
    id: 'documents',
    libelle: 'Documents',
    version: '0.1.0',
    icone: 'DO',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { masquesDocuments: controlerMasques } },
    vues: { onglets: [{ code: 'documents', libelle: 'Documents' }, { code: 'modeles', libelle: 'Modèles' }, { code: 'a-valider', libelle: 'À valider', droit: 'DOC_VALIDATION' }, { code: 'corbeille', libelle: 'Corbeille' }, { code: 'masques', libelle: 'Masques', droit: 'DOC_VALIDATION' }] },
    migrations: [],
    fournitures: [],
    besoins: []
  };

  registre.declarer(contrat);

  return { masques: masques, masquesPour: masquesPour, controlerMasques: controlerMasques, ID_IMAGE: ID_IMAGE, MAX_IMAGE: MAX_IMAGE, peutExporter: peutExporter, MAX_ONGLETS: MAX_ONGLETS, ongletsDe: ongletsDe, avecOnglets: avecOnglets, OPS_BLOC: OPS_BLOC, GENRES: GENRES, modificationsSuivies: modificationsSuivies, resoudreSuivi: resoudreSuivi, fusion3: fusion3, fusionnerVersions: fusionnerVersions, contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, DROITS_DOC: DROITS_DOC, LIB_DROITS: LIB_DROITS, STATUTS: STATUTS, CORBEILLE_JOURS: CORBEILLE_JOURS,
    POLICES: POLICES, TAILLES: TAILLES, COULEURS: COULEURS, FONDS: FONDS, BLOCS: BLOCS, ALIGNEMENTS: ALIGNEMENTS, CHAMPS_PAGE: CHAMPS_PAGE, ID: ID,
    run: run, fusionner: fusionner, bloc: bloc, page: page, contenu: contenu, texteBloc: texteBloc, texteContenu: texteContenu, sommaire: sommaire, meta: meta, comparer: comparer,
    entree: entree, partage: partage, nomCle: nomCle, clesDocument: clesDocument, clesNecessaires: clesNecessaires, aDroitCle: aDroitCle, droitDe: droitDe, peut: peut, retraitDe: retraitDe,
    options: options, joursCorbeille: joursCorbeille, validationsDemandees: validationsDemandees, peutValider: peutValider, aTransferer: aTransferer, estValideur: estValideur,
    statut: statut, derniere: derniere, enVigueur: enVigueur, visibles: visibles, aValider: aValider, aEffacer: aEffacer, joursAvantEffacement: joursAvantEffacement, controler: controler, permisPourSoi: permisPourSoi, jourISO: jourISO };
});
