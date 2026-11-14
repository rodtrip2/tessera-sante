// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — classement personnel des messages et des documents (lot I, phase 2 du plan d'action, 14 novembre 2026).
 *
 * Chaque agent range pour lui seul : favoris (étoile), étiquettes en couleur, dossiers et sous-dossiers. Le classement
 * est gardé dans les préférences de l'agent, chiffrées avec sa clé personnelle, invisibles des autres. Les étiquettes
 * communes sont définies par l'administrateur (établissement) et par le cadre (ses services) : elles donnent un
 * vocabulaire partagé, mais chaque agent les pose pour lui-même. Supprimer un dossier ne supprime rien : son contenu
 * et ses sous-dossiers reviennent à la racine. Un message rangé dans un dossier quitte la boîte de réception.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).classement = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COULEURS = { bleu: 'Bleu', vert: 'Vert', orange: 'Orange', rouge: 'Rouge', violet: 'Violet', gris: 'Gris' };
  var MODULES = { messagerie: 'Messagerie', documents: 'Documents' };
  var MAX_ETIQUETTES = 30, MAX_DOSSIERS = 60, MOTIF_ID = /^[a-zA-Z0-9_-]{1,40}$/;

  function texte(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n || 40) : ''; }
  function nouvelId(prefixe, existants) { var i = existants.length + 1, id; do { id = prefixe + (i++); } while (existants.indexOf(id) >= 0); return id; }
  function cloner(o) { return JSON.parse(JSON.stringify(o)); }

  /** Classement lu et validé. */
  function normaliser(c) {
    c = c && typeof c === 'object' ? c : {};
    var etiquettes = (Array.isArray(c.etiquettes) ? c.etiquettes : []).filter(function (e) { return e && MOTIF_ID.test(e.id || '') && texte(e.libelle); })
      .slice(0, MAX_ETIQUETTES).map(function (e) { return { id: e.id, libelle: texte(e.libelle, 30), couleur: COULEURS[e.couleur] ? e.couleur : 'gris' }; });
    var dossiers = {};
    Object.keys(MODULES).forEach(function (m) {
      var l = (c.dossiers && Array.isArray(c.dossiers[m]) ? c.dossiers[m] : []).filter(function (d) { return d && MOTIF_ID.test(d.id || '') && texte(d.libelle); }).slice(0, MAX_DOSSIERS);
      var ids = l.map(function (d) { return d.id; });
      // Un seul niveau de sous-dossiers ; un parent inconnu ramène à la racine
      dossiers[m] = l.map(function (d) { var p = ids.indexOf(d.parent) >= 0 && d.parent !== d.id ? d.parent : ''; return { id: d.id, libelle: texte(d.libelle, 40), parent: p }; });
      dossiers[m].forEach(function (d) { var p = dossiers[m].filter(function (x) { return x.id === d.parent; })[0]; if (p && p.parent) d.parent = ''; });
    });
    var elements = {};
    Object.keys(c.elements && typeof c.elements === 'object' ? c.elements : {}).forEach(function (k) {
      var e = c.elements[k], m = String(k).split('|')[0];
      if (!MODULES[m] || !e) return;
      var x = {};
      if (e.favori === true) x.favori = true;
      var et = (Array.isArray(e.etiquettes) ? e.etiquettes : []).filter(function (id) { return typeof id === 'string' && /^(c-)?[a-zA-Z0-9_-]{1,40}$/.test(id); });
      if (et.length) x.etiquettes = et.slice(0, 10);
      if (e.dossier && dossiers[m].some(function (d) { return d.id === e.dossier; })) x.dossier = e.dossier;
      if (Object.keys(x).length) elements[k] = x;
    });
    return { etiquettes: etiquettes, dossiers: dossiers, elements: elements };
  }
  function cle(module, id) { return module + '|' + id; }
  /** Classement d'un élément : { favori, etiquettes, dossier }. */
  function element(c, module, id) { var e = normaliser(c).elements[cle(module, id)] || {}; return { favori: !!e.favori, etiquettes: e.etiquettes || [], dossier: e.dossier || '' }; }

  /** Étiquettes communes des réglages (`config.etiquettesCommunes` = { '*': [...], U1: [...] }) pour des services. */
  function communes(config, services) {
    var v = (config && config.etiquettesCommunes) || {}, res = [], vus = {};
    ['*'].concat(services || []).forEach(function (sv) {
      (Array.isArray(v[sv]) ? v[sv] : []).forEach(function (e) {
        var code = texte(e && e.code, 30).toLowerCase().replace(/[^a-z0-9-]/g, '-'), lib = texte(e && e.libelle, 30);
        if (!code || !lib || vus[code]) return;
        vus[code] = 1;
        res.push({ id: 'c-' + code, libelle: lib, couleur: COULEURS[e.couleur] ? e.couleur : 'gris', commune: true, niveau: sv });
      });
    });
    return res;
  }
  /** Toutes les étiquettes proposées à l'agent : communes, puis personnelles. */
  function etiquettes(c, config, services) { return communes(config, services).concat(normaliser(c).etiquettes); }

  // ------------------------------------------------------------ Modifications (renvoient un nouveau classement)
  function marquer(c, module, id, modif) {
    if (!MODULES[module] || !id) throw new Error('Élément inconnu.');
    var n = normaliser(c), k = cle(module, id), e = Object.assign({}, n.elements[k] || {});
    if (modif.favori !== undefined) { if (modif.favori) e.favori = true; else delete e.favori; }
    if (modif.etiquettes !== undefined) { var l = (modif.etiquettes || []).filter(function (x, i, t) { return t.indexOf(x) === i; }); if (l.length) e.etiquettes = l; else delete e.etiquettes; }
    if (modif.dossier !== undefined) {
      if (modif.dossier && !n.dossiers[module].some(function (d) { return d.id === modif.dossier; })) throw new Error('Dossier inconnu.');
      if (modif.dossier) e.dossier = modif.dossier; else delete e.dossier;
    }
    if (Object.keys(e).length) n.elements[k] = e; else delete n.elements[k];
    return normaliser(n);
  }
  function creerEtiquette(c, libelle, couleur) {
    var n = normaliser(c), lib = texte(libelle, 30);
    if (!lib) throw new Error('Donnez un nom à l’étiquette.');
    if (n.etiquettes.length >= MAX_ETIQUETTES) throw new Error('Trente étiquettes au plus.');
    if (n.etiquettes.some(function (e) { return e.libelle.toLowerCase() === lib.toLowerCase(); })) throw new Error('Cette étiquette existe déjà.');
    var id = nouvelId('e', n.etiquettes.map(function (e) { return e.id; }));
    n.etiquettes.push({ id: id, libelle: lib, couleur: COULEURS[couleur] ? couleur : 'gris' });
    return { classement: normaliser(n), id: id };
  }
  function modifierEtiquette(c, id, libelle, couleur) {
    var n = normaliser(c), e = n.etiquettes.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('Étiquette inconnue.');
    if (texte(libelle, 30)) e.libelle = texte(libelle, 30);
    if (COULEURS[couleur]) e.couleur = couleur;
    return normaliser(n);
  }
  /** Supprime une étiquette personnelle et la retire de tous les éléments. */
  function supprimerEtiquette(c, id) {
    var n = normaliser(c);
    n.etiquettes = n.etiquettes.filter(function (e) { return e.id !== id; });
    Object.keys(n.elements).forEach(function (k) { var e = n.elements[k]; if (e.etiquettes) e.etiquettes = e.etiquettes.filter(function (x) { return x !== id; }); });
    return normaliser(n);
  }
  function creerDossier(c, module, libelle, parent) {
    var n = normaliser(c), lib = texte(libelle, 40), l = n.dossiers[module];
    if (!l) throw new Error('Module inconnu.');
    if (!lib) throw new Error('Donnez un nom au dossier.');
    if (l.length >= MAX_DOSSIERS) throw new Error('Soixante dossiers au plus.');
    var p = parent ? l.filter(function (d) { return d.id === parent; })[0] : null;
    if (parent && !p) throw new Error('Dossier parent inconnu.');
    if (p && p.parent) throw new Error('Un sous-dossier ne contient pas d’autre dossier.');
    if (l.some(function (d) { return d.parent === (parent || '') && d.libelle.toLowerCase() === lib.toLowerCase(); })) throw new Error('Ce dossier existe déjà ici.');
    var id = nouvelId('d', l.map(function (d) { return d.id; }));
    l.push({ id: id, libelle: lib, parent: parent || '' });
    return { classement: normaliser(n), id: id };
  }
  function renommerDossier(c, module, id, libelle) {
    var n = normaliser(c), d = (n.dossiers[module] || []).filter(function (x) { return x.id === id; })[0];
    if (!d) throw new Error('Dossier inconnu.');
    if (!texte(libelle, 40)) throw new Error('Donnez un nom au dossier.');
    d.libelle = texte(libelle, 40);
    return normaliser(n);
  }
  /** Supprime un dossier : ses éléments et ses sous-dossiers reviennent à la racine (rien n'est supprimé). */
  function supprimerDossier(c, module, id) {
    var n = normaliser(c);
    n.dossiers[module] = (n.dossiers[module] || []).filter(function (d) { return d.id !== id; }).map(function (d) { return d.parent === id ? Object.assign({}, d, { parent: '' }) : d; });
    Object.keys(n.elements).forEach(function (k) { if (k.indexOf(module + '|') === 0 && n.elements[k].dossier === id) delete n.elements[k].dossier; });
    return normaliser(n);
  }
  /** Nombre d'éléments rangés dans un dossier (sans ses sous-dossiers). */
  function contenu(c, module, id) {
    var n = normaliser(c);
    return Object.keys(n.elements).filter(function (k) { return k.indexOf(module + '|') === 0 && n.elements[k].dossier === id; }).length;
  }

  // ------------------------------------------------------------ Filtres
  /**
   * Garde les identifiants selon le filtre { favoris, etiquette, dossier } ; `dossier` : '' = tous, '-' = hors dossier
   * (boîte de réception), sinon l'identifiant (et ses sous-dossiers si `avecSous`).
   */
  function filtrer(c, module, ids, f) {
    f = f || {};
    var n = normaliser(c), sous = f.dossier && f.dossier !== '-' && f.avecSous ? n.dossiers[module].filter(function (d) { return d.parent === f.dossier; }).map(function (d) { return d.id; }) : [];
    return ids.filter(function (id) {
      var e = n.elements[cle(module, id)] || {};
      if (f.favoris && !e.favori) return false;
      if (f.etiquette && (e.etiquettes || []).indexOf(f.etiquette) < 0) return false;
      if (f.dossier === '-' && e.dossier) return false;
      if (f.dossier && f.dossier !== '-' && e.dossier !== f.dossier && sous.indexOf(e.dossier) < 0) return false;
      return true;
    });
  }

  return { COULEURS: COULEURS, MODULES: MODULES, normaliser: normaliser, element: element, communes: communes, etiquettes: etiquettes, marquer: marquer,
    creerEtiquette: creerEtiquette, modifierEtiquette: modifierEtiquette, supprimerEtiquette: supprimerEtiquette,
    creerDossier: creerDossier, renommerDossier: renommerDossier, supprimerDossier: supprimerDossier, contenu: contenu, filtrer: filtrer, cloner: cloner };
});
