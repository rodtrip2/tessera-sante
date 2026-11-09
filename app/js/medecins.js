// SPDX-License-Identifier: EUPL-1.2
/*
 * Liste commune des médecins (décision du porteur du 8 novembre 2026) : une seule liste pour la fiche patient (médecins
 * de 1re et 2e ligne), Isocont (psychiatre décisionnaire) et le module Suivi médical (présences, entretiens).
 * Réglage commun `medecins` (journal du socle) : { liste: [{ id, nom, fonction, services, statut, debut, fin, compte,
 * actif }], gestion: [rôles] }. Les médecins n'ont pas besoin de compte ; `compte` permettra plus tard de rattacher un nom
 * à un compte Tessera. Gestion de la liste : administrateur, et les rôles de `gestion` (cadre et secrétaire par défaut),
 * qui ajoutent notamment les médecins intérimaires.
 * Identité stable (décision du porteur du 8 novembre 2026) : chaque médecin garde son identifiant et la liste de ses
 * anciens noms ; les saisies faites sous un ancien nom (fiche patient, présences, entretiens, Isocont) le suivent : les
 * écrans les ramènent à son nom actuel (`nomActuel`, `resoudre`). Les nouvelles saisies du Suivi médical portent en plus
 * son identifiant. Le rattachement à un compte ne change ni l'identifiant ni le nom : les saisies suivent de même.
 * Médecin non répertorié (décision du porteur du 8 novembre 2026) : tout agent qui renseigne un médecin (fiche patient,
 * Isocont, Suivi médical) peut en ajouter un absent de la liste ; sa fiche porte `aConfirmer` (et `propose` : par qui,
 * quand, pour quel service), elle est utilisable aussitôt, marquée « à confirmer », jusqu'à ce que les gestionnaires de
 * la liste la confirment (corrigée au besoin), la réunissent avec un médecin existant (le nom saisi devient un ancien nom
 * de celui-ci : les saisies le suivent) ou la refusent (le nom reste dans les saisies, marqué « hors liste » ; `refuses`).
 * Reprise de l'existant : les noms de l'ancienne liste `psychiatres` absents de la liste commune y figurent comme
 * psychiatres titulaires ; à l'enregistrement, `psychiatres` est tenue à jour (noms des psychiatres actifs) pour les
 * écrans qui la lisent encore.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).medecins = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FONCTIONS = { psychiatre: 'Psychiatre', somaticien: 'Médecin somaticien', interne: 'Interne', autre: 'Autre médecin' };
  var STATUTS = { titulaire: 'Titulaire', vacataire: 'Vacataire', interimaire: 'Intérimaire' };
  var GESTION_DEFAUT = ['CADRE', 'SECRETAIRE'];

  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }
  function dateISO(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
  function slug(n) { return 'm-' + (texte(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'medecin'); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function normaliser(m) {
    return {
      id: texte(m.id, 40) || slug(m.nom), nom: texte(m.nom, 60), fonction: FONCTIONS[m.fonction] ? m.fonction : 'psychiatre',
      services: Array.isArray(m.services) ? m.services.filter(function (s) { return typeof s === 'string'; }) : [],
      statut: STATUTS[m.statut] ? m.statut : 'titulaire', debut: dateISO(m.debut), fin: dateISO(m.fin),
      compte: typeof m.compte === 'string' && m.compte ? m.compte : null, actif: m.actif !== false,
      anciensNoms: Array.isArray(m.anciensNoms) ? m.anciensNoms.map(function (n) { return texte(n, 60); }).filter(Boolean) : [],
      aConfirmer: m.aConfirmer === true, initiales: texte(m.initiales, 8),
      propose: m.aConfirmer === true && m.propose && typeof m.propose === 'object' ? { par: texte(m.propose.par, 40), nom: texte(m.propose.nom, 60), le: texte(m.propose.le, 30), service: texte(m.propose.service, 20) } : null
    };
  }
  /**
   * Initiales proposées d'après le nom (0.18.0, décision du porteur du 9 novembre 2026), modifiables dans la fiche du
   * médecin : titre (Dr, Pr) et précision entre parenthèses écartés ; « Jeanne Dupont » → « JD », « Arnaud » → « ARN ».
   */
  function proposerInitiales(nom) {
    var mots = texte(nom).replace(/\([^)]*\)/g, ' ').split(/[\s-]+/).filter(function (w) { return w && !/^(dr|pr|docteur|professeur)\.?$/i.test(w); });
    if (!mots.length) return '';
    if (mots.length === 1) return mots[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3).toUpperCase();
    return mots.map(function (w) { return w.charAt(0).toUpperCase(); }).join('').slice(0, 4);
  }
  /** Initiales affichées : celles réglées dans la fiche du médecin, sinon proposées d'après le nom. */
  function initiales(config, nom, id) {
    var m = id ? parId(config, id) : null;
    if (!m && nom) m = parNom(config, nom);
    return (m && m.initiales) || proposerInitiales(m ? m.nom : nom);
  }
  function brut(config) { var x = config && config.medecins; return x && typeof x === 'object' && !Array.isArray(x) ? x : { liste: Array.isArray(x) ? x : [] }; }
  /** Liste commune, validée à la lecture, avec la reprise des noms de l'ancienne liste des psychiatres. */
  function liste(config) {
    var vus = {}, res = [];
    (Array.isArray(brut(config).liste) ? brut(config).liste : []).forEach(function (m) {
      if (!m || !texte(m.nom)) return;
      var x = normaliser(m), cle = x.nom.toLowerCase();
      if (vus[cle]) return;
      vus[cle] = true; x.anciensNoms.forEach(function (a) { vus[a.toLowerCase()] = vus[a.toLowerCase()] || 'ancien'; }); res.push(x);
    });
    ((config && config.psychiatres) || []).forEach(function (n) {
      if (typeof n !== 'string' || !n.trim() || vus[n.trim().toLowerCase()]) return;
      vus[n.trim().toLowerCase()] = true;
      res.push(normaliser({ nom: n, fonction: 'psychiatre', statut: 'titulaire', repris: true }));
    });
    return res;
  }
  function refuses(config) { var x = brut(config).refuses; return Array.isArray(x) ? x.filter(function (n) { return typeof n === 'string' && n.trim(); }) : []; }
  function estRefuse(config, nom) { var n = texte(nom).toLowerCase(); return !!n && refuses(config).some(function (x) { return x.toLowerCase() === n; }); }
  /** Fiches à confirmer par les gestionnaires de la liste. */
  function aConfirmer(config) { return liste(config).filter(function (m) { return m.aConfirmer; }); }
  /**
   * Noms saisis qui ne désignent aucun médecin de la liste (ni nom actuel ni ancien nom) et qui n'ont pas été laissés
   * hors liste : « Noms à rattacher ». `noms` : [{ nom, source }] ; rend [{ nom, sources: { source: nombre } }].
   */
  function nonRattaches(config, noms) {
    var res = {};
    (noms || []).forEach(function (x) {
      var n = texte(x && x.nom, 60);
      if (!n || parNom(config, n) || estRefuse(config, n)) return;
      var r = res[n.toLowerCase()] = res[n.toLowerCase()] || { nom: n, sources: {} };
      r.sources[x.source] = (r.sources[x.source] || 0) + 1;
    });
    return Object.keys(res).map(function (k) { return res[k]; }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
  }
  /** Réunir une fiche (à confirmer, ou un nom hors liste) avec un médecin existant : le nom devient un ancien nom de celui-ci. */
  function reunir(l, nom, cibleId) {
    var n = texte(nom, 60);
    return l.filter(function (m) { return !(m.aConfirmer && m.nom.toLowerCase() === n.toLowerCase()); }).map(function (m) {
      if (m.id !== cibleId) return m;
      var x = normaliser(m);
      if (n && x.nom.toLowerCase() !== n.toLowerCase() && !x.anciensNoms.some(function (a) { return a.toLowerCase() === n.toLowerCase(); })) x.anciensNoms.push(n);
      return x;
    });
  }
  function gestion(config) { var g = brut(config).gestion; return Array.isArray(g) ? g.filter(function (r) { return typeof r === 'string'; }) : GESTION_DEFAUT.slice(); }
  /** Médecin présent à une date : actif, et dans sa période pour un intérimaire (ou une période renseignée). */
  function enActivite(m, date) {
    if (!m.actif) return false;
    var j = jourISO(date || Date.now());
    return (!m.debut || m.debut <= j) && (!m.fin || m.fin >= j);
  }
  /** Médecins proposés aux listes de choix : en activité, du service (ou sans service précisé). */
  function proposes(config, options) {
    var o = options || {};
    return liste(config).filter(function (m) { return enActivite(m, o.date) && (!o.service || !m.services.length || m.services.indexOf(o.service) >= 0) && (!o.fonction || m.fonction === o.fonction); })
      .sort(function (a, b) { return a.nom.localeCompare(b.nom); });
  }
  function noms(config, options) { return proposes(config, options).map(function (m) { return m.nom; }); }
  /** Médecin désigné par un nom, actuel ou ancien (les saisies faites sous un ancien nom le suivent). */
  function parNom(config, nom) {
    var n = texte(nom).toLowerCase();
    if (!n) return null;
    var l = liste(config);
    return l.filter(function (m) { return m.nom.toLowerCase() === n; })[0] || l.filter(function (m) { return m.anciensNoms.some(function (a) { return a.toLowerCase() === n; }); })[0] || null;
  }
  function parId(config, id) { return id ? liste(config).filter(function (m) { return m.id === id; })[0] || null : null; }
  function parCompte(config, compte) { return compte ? liste(config).filter(function (m) { return m.compte === compte; })[0] || null : null; }
  /** Nom actuel d'un médecin désigné par un nom (actuel ou ancien) ou par son identifiant ; le nom tel quel sinon. */
  function resoudre(config, nom, id) { var m = parId(config, id) || parNom(config, nom); return m ? m.nom : texte(nom, 60); }
  function nomActuel(config, nom) { return resoudre(config, nom, null); }
  /** Deux désignations visent-elles le même médecin ? */
  function meme(config, a, b) { return !!a && !!b && nomActuel(config, a).toLowerCase() === nomActuel(config, b).toLowerCase(); }
  /** Renommage : l'ancien nom rejoint les anciens noms (sans doublon ni le nouveau nom). */
  function renommer(m, nouveau) {
    var x = normaliser(m), n = texte(nouveau, 60);
    if (n && n !== x.nom) x.anciensNoms = x.anciensNoms.concat([x.nom]).filter(function (a, i, l) { return a.toLowerCase() !== n.toLowerCase() && l.indexOf(a) === i; });
    x.nom = n || x.nom;
    return x;
  }
  function estPsychiatre(config, nom) { var m = parNom(config, nom); return !!m && m.fonction === 'psychiatre'; }
  /** Noms des psychiatres actifs : valeur tenue à jour de l'ancienne liste `psychiatres`. */
  function psychiatres(l) { return l.filter(function (m) { return m.actif && !m.aConfirmer && m.fonction === 'psychiatre'; }).map(function (m) { return m.nom; }); }
  function peutGerer(config, compte) {
    var r = (compte && compte.roles) || [];
    return r.indexOf('ADMIN') >= 0 || r.some(function (x) { return gestion(config).indexOf(x) >= 0; });
  }
  /** Contrôle d'un nouveau réglage `medecins` (ou `psychiatres`, tenu à jour) écrit par un compte non administrateur. */
  function controler(config, cle, nouveau, compte) {
    if (!peutGerer(config, compte)) {
      // Un agent qui ne gère pas la liste peut seulement y ajouter des médecins non répertoriés, à confirmer
      if (cle !== 'medecins') throw new Error('La liste des médecins est gérée par l’administrateur et les rôles désignés (cadre et secrétaire par défaut).');
      var avant = brut(config), apres = brut({ medecins: nouveau }), id = compte && compte.id;
      var la = (avant.liste || []).map(normaliser), ln = (apres.liste || []).map(normaliser);
      var memes = la.every(function (m) { return ln.some(function (y) { return JSON.stringify(y) === JSON.stringify(m); }); });
      var ajouts = ln.filter(function (y) { return !la.some(function (m) { return m.id === y.id; }); });
      if (!memes || ln.length !== la.length + ajouts.length || ajouts.some(function (y) { return !y.aConfirmer || !y.propose || y.propose.par !== id; })
        || JSON.stringify(gestion({ medecins: nouveau })) !== JSON.stringify(gestion(config)) || JSON.stringify(refuses({ medecins: nouveau })) !== JSON.stringify(refuses(config)))
        throw new Error('Vous pouvez ajouter un médecin non répertorié (à confirmer) ; la liste est gérée par le cadre et la secrétaire.');
      return true;
    }
    var admin = ((compte && compte.roles) || []).indexOf('ADMIN') >= 0;
    if (cle === 'medecins' && !admin && JSON.stringify(gestion({ medecins: nouveau })) !== JSON.stringify(gestion(config))) throw new Error('Seul l’administrateur choisit qui gère la liste des médecins.');
    return true;
  }

  return { proposerInitiales: proposerInitiales, initiales: initiales, FONCTIONS: FONCTIONS, STATUTS: STATUTS, GESTION_DEFAUT: GESTION_DEFAUT, liste: liste, gestion: gestion, enActivite: enActivite, proposes: proposes, noms: noms,
    parNom: parNom, parId: parId, refuses: refuses, estRefuse: estRefuse, aConfirmer: aConfirmer, nonRattaches: nonRattaches, reunir: reunir, parCompte: parCompte, resoudre: resoudre, nomActuel: nomActuel, meme: meme, renommer: renommer, estPsychiatre: estPsychiatre, psychiatres: psychiatres, peutGerer: peutGerer, controler: controler, normaliser: normaliser, slug: slug };
});
