// SPDX-License-Identifier: EUPL-1.2
/*
 * Patients — sortie envisagée ou actée (0.21.0, décision du porteur du 11 novembre 2026).
 *
 * Une seule donnée dans le séjour (`sortiePrevue`), à deux états :
 * - **envisagée** : pas encore confirmée ; un jour précis, une fourchette (du… au…) ou une approximation (« la semaine
 *   prochaine ») ;
 * - **actée** : date arrêtée par le médecin avec le patient (jour précis, heure facultative).
 * { etat: 'envisagee' | 'actee', debut, fin, precision, heure }. Une sortie prévisionnelle saisie avant la 0.21.0 (sans
 * état) est une sortie envisagée. Couleurs : règles de la donnée « patients.sortiePrevue » (réglages des données, par
 * l'administrateur ou le cadre), reprises dans la Vue d'ensemble et l'Agenda. Fonctions pures, testées sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).sorties = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ETATS = { envisagee: 'Sortie envisagée', actee: 'Sortie actée' };
  var JOUR = /^\d{4}-\d{2}-\d{2}$/, HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
  /** Couleurs proposées (réglables dans les réglages de la donnée) : date passée, actée, envisagée. */
  var REGLES_DEFAUT = [
    { si: { op: 'depuisPlusDe', n: 0 }, couleur: 'rouge', rendu: 'fond', libelle: 'Date de sortie passée' },
    { si: { op: 'egal', valeur: 'actee' }, couleur: 'vert', rendu: 'fond', libelle: 'Sortie actée (date arrêtée avec le patient)' },
    { si: { op: 'egal', valeur: 'envisagee' }, couleur: 'jaune', rendu: 'fond', libelle: 'Sortie envisagée (à confirmer)' }];
  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 80); }
  function jourFr(j) { return String(j || '').split('-').reverse().join('/'); }

  function etat(v) { return v && v.etat === 'actee' ? 'actee' : 'envisagee'; }
  /** Valeur validée, ou null si rien n'est renseigné. Une sortie actée a un jour précis. */
  function normaliser(v) {
    if (!v || typeof v !== 'object') return null;
    var r = { etat: etat(v) };
    if (JOUR.test(v.debut || '')) r.debut = v.debut;
    if (r.etat === 'actee') {
      if (!r.debut) throw new Error('Une sortie actée a une date précise.');
      if (HEURE.test(v.heure || '')) r.heure = v.heure;
    } else {
      if (JOUR.test(v.fin || '') && r.debut) { if (v.fin < r.debut) throw new Error('La fin de la fourchette précède son début.'); if (v.fin !== r.debut) r.fin = v.fin; }
      if (texte(v.precision)) r.precision = texte(v.precision);
      if (!r.debut && !r.precision) return null;
    }
    if (r.etat === 'actee' && texte(v.precision)) r.precision = texte(v.precision);
    return r;
  }
  /** En clair : « Actée : 14/11/2026 à 11:00 », « Envisagée : du 16/11/2026 au 20/11/2026 — après la synthèse ». */
  function libelle(v, court) {
    if (!v) return '';
    var d = v.debut ? (v.fin && v.fin !== v.debut ? 'du ' + jourFr(v.debut) + ' au ' + jourFr(v.fin) : jourFr(v.debut)) : '';
    if (etat(v) === 'actee') d += v.heure ? ' à ' + v.heure : '';
    return (court ? '' : (etat(v) === 'actee' ? 'Actée : ' : 'Envisagée : ')) + [d, v.precision || ''].filter(Boolean).join(' — ');
  }
  function sejourEnCours(p) { var r = null; ((p && p.sejours) || []).forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  /**
   * Sorties à afficher jour par jour entre deux jours (inclus) pour les fiches données : la sortie actée à sa date, la
   * sortie envisagée au premier jour de sa fourchette. [{ patientId, sejourId, jour, etat, heure, valeur }], par jour.
   * `sansDate` : sorties envisagées sans date (approximation seule), à lister à part.
   */
  function parJour(fiches, debut, fin) {
    var res = [], sansDate = [];
    Object.keys(fiches || {}).forEach(function (k) {
      var p = fiches[k], sj = sejourEnCours(p), v = sj && sj.sortiePrevue;
      if (!v) return;
      var x = { patientId: p.id, sejourId: sj.id, etat: etat(v), heure: v.heure || '', valeur: v };
      if (!v.debut) { sansDate.push(x); return; }
      if (v.debut >= debut && v.debut <= fin) res.push(Object.assign({ jour: v.debut }, x));
    });
    res.sort(function (a, b) { return a.jour.localeCompare(b.jour) || (a.heure || '').localeCompare(b.heure || ''); });
    return { sorties: res, sansDate: sansDate };
  }
  /**
   * Réglage dédié des couleurs (décision du porteur du 11 novembre 2026) : couleur de la sortie envisagée, de la sortie
   * actée et de la date passée, lues dans les règles de la donnée et réécrites sans toucher aux autres règles.
   */
  var LIBELLES = { passee: 'Date de sortie passée', actee: 'Sortie actée (date arrêtée avec le patient)', envisagee: 'Sortie envisagée (à confirmer)' };
  function genre(r) {
    var si = (r && r.si) || {};
    if (si.op === 'egal' && (si.valeur === 'actee' || si.valeur === 'envisagee')) return si.valeur;
    return si.op === 'depuisPlusDe' && +si.n === 0 ? 'passee' : null;
  }
  function couleursDe(regles) {
    var c = { passee: '', actee: '', envisagee: '' };
    (regles || []).forEach(function (r) { var g = genre(r); if (g && !c[g]) c[g] = r.couleur; });
    return c;
  }
  function reglesAvec(regles, couleurs) {
    var autres = (regles || []).filter(function (r) { return !genre(r); }), c = couleurs || {};
    function regle(g, si) { return c[g] ? [{ si: si, couleur: c[g], rendu: 'fond', libelle: LIBELLES[g] }] : []; }
    return regle('passee', { op: 'depuisPlusDe', n: 0 }).concat(autres, regle('actee', { op: 'egal', valeur: 'actee' }), regle('envisagee', { op: 'egal', valeur: 'envisagee' }));
  }
  return { couleursDe: couleursDe, reglesAvec: reglesAvec, LIBELLES: LIBELLES, ETATS: ETATS, REGLES_DEFAUT: REGLES_DEFAUT, etat: etat, normaliser: normaliser, libelle: libelle, sejourEnCours: sejourEnCours, parJour: parJour };
});
