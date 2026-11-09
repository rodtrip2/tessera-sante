// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — largeur des colonnes des tableaux (0.20.0, décisions du porteur du 9 novembre 2026).
 *
 * Une largeur réglée est un nombre de pixels de 40 à 800 ; 0 ou absent : largeur automatique. Une carte de largeurs
 * associe le code (ou le titre) d'une colonne à sa largeur. Où elles sont gardées :
 * - liste des patients : dans l'affichage (celui de l'agent, ou celui réglé par l'administrateur) ;
 * - tableaux du module Isolement et contention : réglage commun `largeursColonnes` { <tableau>: { '*': carte,
 *   <service>: carte } } ; l'administrateur règle pour l'établissement (« * ») et pour un service, le cadre pour ses
 *   services (la largeur du service l'emporte sur celle de l'établissement) ;
 * - autres tableaux : préférence de l'agent (`largeurs` : { <tableau>: carte }), qui le suit d'un poste à l'autre ;
 * - Vue d'ensemble : avec la vue (module-vue.js), réglée par le cadre ; grilles (agenda, planning, présences) : sans.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).largeurs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 40, MAX = 800, NB_COLONNES = 80, NB_TABLEAUX = 200;
  var CODE = /^[^\u0000-\u001f]{1,120}$/;

  function largeur(v) { var n = Math.round(+v); return isFinite(n) && n >= MIN && n <= MAX ? n : 0; }
  /** Carte { colonne: pixels }, validée (colonnes inconnues ou largeurs hors bornes écartées). */
  function carte(m) {
    var r = {};
    if (!m || typeof m !== 'object' || Array.isArray(m)) return r;
    Object.keys(m).slice(0, NB_COLONNES).forEach(function (k) { var n = largeur(m[k]); if (n && CODE.test(k)) r[k] = n; });
    return r;
  }
  /** Ajoute (ou retire, pixels 0) la largeur d'une colonne dans une carte ; renvoie une nouvelle carte. */
  function regler(m, colonne, px) {
    var r = carte(m), n = largeur(px);
    if (!CODE.test(String(colonne || ''))) return r;
    if (n) r[colonne] = n; else delete r[colonne];
    return r;
  }
  /** Réglage commun `largeursColonnes`, validé : { tableau: { '*'|service: carte } }. */
  function reglage(v) {
    var r = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return r;
    Object.keys(v).slice(0, NB_TABLEAUX).forEach(function (t) {
      if (!CODE.test(t) || !v[t] || typeof v[t] !== 'object') return;
      var x = {};
      Object.keys(v[t]).forEach(function (s) { if (s === '*' || /^[A-Za-z0-9_-]{1,40}$/.test(s)) { var c = carte(v[t][s]); if (Object.keys(c).length) x[s] = c; } });
      if (Object.keys(x).length) r[t] = x;
    });
    return r;
  }
  /** Largeurs d'un tableau pour un service : celles de l'établissement, remplacées colonne par colonne par celles du service. */
  function pourService(config, tableau, service) {
    var t = reglage(config && config.largeursColonnes)[tableau] || {};
    return Object.assign({}, t['*'] || {}, service && service !== '*' ? t[service] || {} : {});
  }
  /**
   * Nouveau réglage commun après qu'une colonne a été redimensionnée : `portees` = '*' et/ou codes de services où écrire.
   */
  function reglerCommun(v, tableau, portees, colonne, px) {
    var r = reglage(v);
    (portees || []).forEach(function (s) {
      var t = r[tableau] = r[tableau] || {};
      var c = regler(t[s], colonne, px);
      if (Object.keys(c).length) t[s] = c; else delete t[s];
      if (!Object.keys(t).length) delete r[tableau];
    });
    return r;
  }
  /**
   * Contrôle du réglage commun écrit par un agent qui n'est pas administrateur : le cadre ne change que les largeurs de
   * ses services (jamais celles de l'établissement « * » ni celles d'un autre service).
   */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object') return false;
    var a = reglage(ancien), b = reglage(nouveau), tabs = {};
    if (JSON.stringify(b) !== JSON.stringify(nouveau)) return false;   // valeurs mal formées
    Object.keys(a).concat(Object.keys(b)).forEach(function (t) { tabs[t] = 1; });
    return Object.keys(tabs).every(function (t) {
      var x = a[t] || {}, y = b[t] || {}, ps = {};
      Object.keys(x).concat(Object.keys(y)).forEach(function (s) { ps[s] = 1; });
      return Object.keys(ps).every(function (s) { return JSON.stringify(x[s]) === JSON.stringify(y[s]) || (s !== '*' && sv.indexOf(s) >= 0); });
    });
  }
  /** Code d'une colonne tiré de son titre : sans flèche de tri ni espaces superflus. */
  function codeTitre(t) { return String(t || '').replace(/[▲▼⚙]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120); }

  return { MIN: MIN, MAX: MAX, largeur: largeur, carte: carte, regler: regler, reglage: reglage, pourService: pourService,
    reglerCommun: reglerCommun, controlerCadre: controlerCadre, codeTitre: codeTitre };
});
