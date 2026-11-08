// SPDX-License-Identifier: EUPL-1.2
/*
 * Liste commune des médecins (décision du porteur du 8 novembre 2026) : une seule liste pour la fiche patient (médecins
 * de 1re et 2e ligne), Isocont (psychiatre décisionnaire) et le module Suivi médical (présences, entretiens).
 * Réglage commun `medecins` (journal du socle) : { liste: [{ id, nom, fonction, services, statut, debut, fin, compte,
 * actif }], gestion: [rôles] }. Les médecins n'ont pas besoin de compte ; `compte` permettra plus tard de rattacher un nom
 * à un compte Tessera. Gestion de la liste : administrateur, et les rôles de `gestion` (cadre et secrétaire par défaut),
 * qui ajoutent notamment les médecins intérimaires.
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
      compte: typeof m.compte === 'string' && m.compte ? m.compte : null, actif: m.actif !== false
    };
  }
  function brut(config) { var x = config && config.medecins; return x && typeof x === 'object' && !Array.isArray(x) ? x : { liste: Array.isArray(x) ? x : [] }; }
  /** Liste commune, validée à la lecture, avec la reprise des noms de l'ancienne liste des psychiatres. */
  function liste(config) {
    var vus = {}, res = [];
    (Array.isArray(brut(config).liste) ? brut(config).liste : []).forEach(function (m) {
      if (!m || !texte(m.nom)) return;
      var x = normaliser(m), cle = x.nom.toLowerCase();
      if (vus[cle]) return;
      vus[cle] = true; res.push(x);
    });
    ((config && config.psychiatres) || []).forEach(function (n) {
      if (typeof n !== 'string' || !n.trim() || vus[n.trim().toLowerCase()]) return;
      vus[n.trim().toLowerCase()] = true;
      res.push(normaliser({ nom: n, fonction: 'psychiatre', statut: 'titulaire', repris: true }));
    });
    return res;
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
  function parNom(config, nom) { var n = texte(nom).toLowerCase(); return liste(config).filter(function (m) { return m.nom.toLowerCase() === n; })[0] || null; }
  function estPsychiatre(config, nom) { var m = parNom(config, nom); return !!m && m.fonction === 'psychiatre'; }
  /** Noms des psychiatres actifs : valeur tenue à jour de l'ancienne liste `psychiatres`. */
  function psychiatres(l) { return l.filter(function (m) { return m.actif && m.fonction === 'psychiatre'; }).map(function (m) { return m.nom; }); }
  function peutGerer(config, compte) {
    var r = (compte && compte.roles) || [];
    return r.indexOf('ADMIN') >= 0 || r.some(function (x) { return gestion(config).indexOf(x) >= 0; });
  }
  /** Contrôle d'un nouveau réglage `medecins` (ou `psychiatres`, tenu à jour) écrit par un compte non administrateur. */
  function controler(config, cle, nouveau, compte) {
    if (!peutGerer(config, compte)) throw new Error('La liste des médecins est gérée par l’administrateur et les rôles désignés (cadre et secrétaire par défaut).');
    var admin = ((compte && compte.roles) || []).indexOf('ADMIN') >= 0;
    if (cle === 'medecins' && !admin && JSON.stringify(gestion({ medecins: nouveau })) !== JSON.stringify(gestion(config))) throw new Error('Seul l’administrateur choisit qui gère la liste des médecins.');
    return true;
  }

  return { FONCTIONS: FONCTIONS, STATUTS: STATUTS, GESTION_DEFAUT: GESTION_DEFAUT, liste: liste, gestion: gestion, enActivite: enActivite, proposes: proposes, noms: noms,
    parNom: parNom, estPsychiatre: estPsychiatre, psychiatres: psychiatres, peutGerer: peutGerer, controler: controler, normaliser: normaliser, slug: slug };
});
