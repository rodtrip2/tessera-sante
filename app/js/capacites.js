// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — capacité d'accueil des services (0.18.2, décision du porteur du 9 novembre 2026, plan « Vue d'ensemble »).
 *
 * Réglage commun `capacites` (journal du socle) : { services: { <code>: { lits, chambresSeules, chambresDoubles,
 * fermetures: [{ id, debut, fin, lits, motif }], reserves: [{ id, debut, fin, lits, motif }] } } }. La chambre de soins
 * intensifs n'est pas comptée comme un lit. Lits ouverts = lits − fermetures du jour ; places disponibles = lits ouverts −
 * lits réservés du jour − patients présents (négatif : suroccupation). Réglée par l'administrateur, et par le cadre pour
 * ses services. Les sorties prévues se lisent dans la sortie prévisionnelle des séjours (module Patients).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).capacites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JOUR = /^\d{4}-\d{2}-\d{2}$/;
  function entier(v, min, max, d) { var n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : d; }
  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function periodes(l) {
    return (Array.isArray(l) ? l : []).filter(function (p) { return p && JOUR.test(p.debut || ''); }).map(function (p, i) {
      return { id: texte(p.id, 20) || 'p' + i, debut: p.debut, fin: JOUR.test(p.fin || '') && p.fin >= p.debut ? p.fin : '', lits: entier(p.lits, 1, 999, 1), motif: texte(p.motif, 80) };
    });
  }
  /** Capacité d'un service, validée à la lecture ; null sans réglage. */
  function service(config, code) {
    var x = (((config && config.capacites) || {}).services || {})[code];
    if (!x || typeof x !== 'object') return null;
    return { lits: entier(x.lits, 0, 999, 0), chambresSeules: entier(x.chambresSeules, 0, 999, 0), chambresDoubles: entier(x.chambresDoubles, 0, 999, 0),
      fermetures: periodes(x.fermetures), reserves: periodes(x.reserves) };
  }
  function couvre(p, j) { return p.debut <= j && (!p.fin || j <= p.fin); }
  /**
   * Situation d'un ou plusieurs services un jour donné (`quand` : ms ou AAAA-MM-JJ) avec `presents` patients présents :
   * { lits, fermes, ouverts, reserves, presents, places, motifs } ; null si aucun service n'a de capacité réglée.
   */
  function situation(config, codes, quand, presents, travaux) {
    var j = typeof quand === 'string' && JOUR.test(quand) ? quand : jourISO(quand || Date.now());
    var r = { lits: 0, fermes: 0, reserves: 0, presents: presents || 0, motifs: [] }, n = 0;
    (Array.isArray(codes) ? codes : [codes]).forEach(function (c) {
      var x = service(config, c); if (!x) return;
      n++;
      r.lits += x.lits;
      x.fermetures.filter(function (p) { return couvre(p, j); }).forEach(function (p) { r.fermes += p.lits; if (p.motif) r.motifs.push(p.motif); });
      x.reserves.filter(function (p) { return couvre(p, j); }).forEach(function (p) { r.reserves += p.lits; });
      // Chambres indisponibles pendant des travaux (0.22.0) : lits fermés tant que la demande est en cours
      (travaux || []).filter(function (t) { return t.service === c; }).forEach(function (t) { r.fermes += t.lits; r.travaux = (r.travaux || 0) + t.lits; });
    });
    if (!n) return null;
    r.ouverts = Math.max(0, r.lits - r.fermes);
    r.places = r.ouverts - r.reserves - r.presents;
    return r;
  }
  /** Le cadre ne règle que la capacité de ses services ; l'administrateur, toutes. Renvoie true ou false. */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object') return false;
    var a = (ancien && ancien.services) || {}, b = nouveau.services || {}, codes = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { codes[k] = 1; });
    var autres = Object.keys(nouveau).filter(function (k) { return k !== 'services'; });
    if (autres.some(function (k) { return JSON.stringify(nouveau[k]) !== JSON.stringify((ancien || {})[k]); })) return false;
    return Object.keys(codes).every(function (c) { return JSON.stringify(a[c]) === JSON.stringify(b[c]) || sv.indexOf(c) >= 0; });
  }

  return { service: service, situation: situation, controlerCadre: controlerCadre, jourISO: jourISO };
});
