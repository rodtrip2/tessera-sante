// SPDX-License-Identifier: EUPL-1.2
/*
 * Patients — professionnels ou structures participant à la prise en charge (0.21.0, décision du porteur du 11 novembre 2026).
 *
 * Répertoire commun (un cabinet, un foyer ou un hôpital de jour saisi une fois, saisie `INTERVENANT` du module Patients) :
 * { id, type, nom, contact, commentaire, champs: { code: valeur }, supprime }. Chaque fiche patient y rattache ses
 * intervenants (saisie `PRISE_EN_CHARGE` : { patientId, lien, intervenant, commentaire, retire }).
 * Réglage commun `intervenants` = { types: [{ code, libelle }], champs: [{ code, libelle }] } : types proposés et champs
 * ajoutés, réglés par l'administrateur ou le cadre. Coordonnées professionnelles seulement ; aucune donnée clinique.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).intervenants = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES_DEFAUT = [
    { code: 'idel', libelle: 'Infirmier libéral à domicile (IDEL)' },
    { code: 'foyer', libelle: 'Foyer ou lieu de vie' },
    { code: 'hdj', libelle: 'Hôpital de jour (HDJ)' },
    { code: 'cmp', libelle: 'Centre médico-psychologique (CMP)' },
    { code: 'cattp', libelle: 'Centre d’accueil thérapeutique à temps partiel (CATTP)' },
    { code: 'medecin', libelle: 'Médecin traitant' },
    { code: 'pharmacie', libelle: 'Pharmacie' },
    { code: 'mandataire', libelle: 'Mandataire judiciaire, tuteur ou curateur' },
    { code: 'social', libelle: 'Service d’accompagnement social ou médico-social' },
    { code: 'autre', libelle: 'Autre' }
  ];
  var CODE = /^[a-z][a-z0-9-]{1,30}$/;
  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function liste(l, defaut) {
    var vus = {}, r = (Array.isArray(l) ? l : []).filter(function (x) { return x && CODE.test(x.code || '') && texte(x.libelle) && !vus[x.code] && (vus[x.code] = 1); }).slice(0, 40).map(function (x) { return { code: x.code, libelle: texte(x.libelle, 80) }; });
    return r.length ? r : defaut;
  }
  /** Réglage validé : types proposés (liste fournie par défaut) et champs ajoutés. */
  function reglages(config) {
    var v = (config && config.intervenants) || {};
    return { types: liste(v.types, TYPES_DEFAUT.slice()), champs: liste(v.champs, []) };
  }
  function libType(config, code) { var t = reglages(config).types.filter(function (x) { return x.code === code; })[0]; return t ? t.libelle : (code || 'Autre'); }
  /** Fiche du répertoire, validée (nom obligatoire). */
  function normaliser(d, config) {
    var g = reglages(config), ch = {};
    g.champs.forEach(function (c) { var v = texte(d && d.champs && d.champs[c.code], 200); if (v) ch[c.code] = v; });
    var r = { id: String((d && d.id) || ''), type: g.types.some(function (t) { return t.code === (d && d.type); }) ? d.type : 'autre', nom: texte(d && d.nom, 120), contact: texte(d && d.contact, 120), commentaire: texte(d && d.commentaire, 300), champs: ch };
    if (!r.id || !r.nom) throw new Error('Indiquez le nom du professionnel ou de la structure.');
    return r;
  }
  /** Répertoire en vigueur, trié par nom. */
  function repertoire(st) {
    var m = (st && st.intervenants) || {};
    return Object.keys(m).map(function (k) { return m[k]; }).filter(function (x) { return !x.supprime; }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
  }
  /** Intervenants d'un patient : [{ lien, intervenant (fiche du répertoire), commentaire }]. */
  function dePatient(st, fiche) {
    var m = (st && st.intervenants) || {};
    return ((fiche && fiche.priseEnCharge) || []).map(function (l) { return { lien: l.lien, intervenant: m[l.intervenant], commentaire: l.commentaire || '' }; }).filter(function (x) { return x.intervenant && !x.intervenant.supprime; });
  }
  /**
   * Lignes de l'export du droit d'accès (décision du porteur du 11 novembre 2026) : type et nom de chaque professionnel
   * ou structure qui suit le patient, sans les coordonnées ni les commentaires internes du service. [[type, nom]].
   */
  function pourExport(st, fiche, config) {
    return dePatient(st, fiche).map(function (l) { return [libType(config, l.intervenant.type), l.intervenant.nom]; });
  }
  /** Réglage écrit par le cadre ou l'administrateur (types et champs : communs à l'établissement). */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [];
    return (roles.indexOf('ADMIN') >= 0 || roles.indexOf('CADRE') >= 0) && !!nouveau && typeof nouveau === 'object' && !Array.isArray(nouveau);
  }
  return { TYPES_DEFAUT: TYPES_DEFAUT, reglages: reglages, libType: libType, normaliser: normaliser, repertoire: repertoire, dePatient: dePatient, pourExport: pourExport, controlerCadre: controlerCadre };
});
