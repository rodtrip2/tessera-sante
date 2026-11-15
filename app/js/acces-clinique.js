// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — accès aux données cliniques réglable et « bris de glace » (phase 5, lot G, décisions du porteur du
 * 15 novembre 2026).
 *
 * Données cliniques : données ajoutées marquées « donnée clinique » (clé propre ; fonction « donnee-clinique » de
 * l'onglet Validations). Réglage `accesClinique` = { '*': options, <service>: options } :
 *   - presents : rôles qui ne voient les données cliniques que des patients présents (séjour en cours dans un de leurs
 *     services) ; les autres rôles lecteurs voient tous les patients de leurs services ;
 *   - bris : { roles (rôles qui peuvent recourir au bris de glace), duree ('poste' : jusqu'à la fin du poste en cours,
 *     selon les postes du service ; ou un nombre de minutes) }.
 * Bris de glace (fonction « bris-de-glace » de l'onglet Validations, livrée désactivée) : un agent sans accès lit les
 * données cliniques d'un patient pour une durée limitée, avec une justification obligatoire ; la saisie est au journal
 * du module Patients, le cadre du service du patient et l'administrateur de garde sont prévenus, le cadre relit chaque
 * mois la liste (exportable pour le délégué à la protection des données).
 * Choix du porteur : accès garanti par l'application et la traçabilité (la clé propre de la donnée est aussi remise aux
 * rôles qui peuvent recourir au bris de glace), comme la consultation tracée de la messagerie ; pas de clé par patient.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).accesClinique = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAUT = { presents: [], bris: { roles: ['IDE', 'AS'], duree: 'poste' } };
  var MIN_JUSTIF = 10;

  function V() { return typeof self !== 'undefined' && self.SIC && self.SIC.validations; }
  function liste(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : null; }
  /** Options d'un service : réglage du service, sinon de l'établissement, sinon défauts. */
  function options(config, service) {
    var r = (config && config.accesClinique) || {}, x = (service && r[service]) || r['*'] || {}, b = x.bris || {};
    var duree = b.duree === 'poste' ? 'poste' : (Math.round(+b.duree) >= 15 && Math.round(+b.duree) <= 24 * 60 ? Math.round(+b.duree) : DEFAUT.bris.duree);
    return { presents: liste(x.presents) || DEFAUT.presents.slice(), bris: { roles: liste(b.roles) || DEFAUT.bris.roles.slice(), duree: duree } };
  }
  function brisActive(config) { var v = V(); return !!v && v.actif(config, 'bris-de-glace'); }
  /** Rôles qui peuvent recourir au bris de glace, tous services confondus (remise de la clé propre des données cliniques). */
  function rolesBris(config) {
    if (!brisActive(config)) return [];
    var r = (config && config.accesClinique) || {}, res = options(config, null).bris.roles.slice();
    Object.keys(r).forEach(function (k) { if (k !== '*') options(config, k).bris.roles.forEach(function (x) { if (res.indexOf(x) < 0) res.push(x); }); });
    return res;
  }
  function peutBriser(config, roles, service) {
    if (!brisActive(config)) return false;
    var ok = options(config, service).bris.roles;
    return (roles || []).some(function (r) { return ok.indexOf(r) >= 0; });
  }
  function minutes(h) { var m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? +m[1] * 60 + +m[2] : null; }
  /**
   * Fin d'un bris de glace commencé à `debut` (ms) : fin du poste en cours (postes du service : [{ debut, fin }]), ou
   * `duree` minutes ; sans poste qui couvre l'heure, 8 heures au plus.
   */
  function fin(debut, duree, postes) {
    if (duree !== 'poste') return debut + duree * 60000;
    var d = new Date(debut), m = d.getHours() * 60 + d.getMinutes(), best = null;
    (postes || []).forEach(function (p) {
      var a = minutes(p.debut), b = minutes(p.fin);
      if (a === null || b === null) return;
      var dans = a < b ? m >= a && m < b : (m >= a || m < b), reste;
      if (!dans) return;
      reste = a < b ? b - m : (m >= a ? 1440 - m + b : b - m);
      if (best === null || reste < best) best = reste;
    });
    var r = best === null ? 8 * 60 : best;
    return debut + Math.min(r, 16 * 60) * 60000 - d.getSeconds() * 1000 - d.getMilliseconds();
  }
  /** Bris de glace en cours d'un agent pour un patient (état du module Patients : `bris`). */
  function brisEnCours(bris, agent, patientId, maintenant) {
    var t = maintenant || Date.now();
    return Object.keys(bris || {}).map(function (k) { return bris[k]; }).filter(function (b) { return b.agent === agent && b.patientId === patientId && Date.parse(b.fin) > t && !b.clos; })[0] || null;
  }
  /**
   * Accès d'un agent aux données cliniques d'un patient : { ok, raison } ; raison : 'role' (accès habituel), 'bris'
   * (bris de glace en cours), 'absent' (rôle limité aux patients présents, patient non présent), 'aucun'.
   * ctx : { config, roles (rôles de l'agent dans le service du patient), lecteur (le rôle lit la donnée), present
   * (patient hospitalisé dans un service de l'agent), service (service du patient), bris (état), agent, maintenant }.
   */
  function acces(ctx) {
    var o = options(ctx.config, ctx.service), roles = ctx.roles || [];
    if (roles.indexOf('ADMIN') >= 0 && !ctx.lecteur) return { ok: false, raison: 'aucun' };
    if (ctx.lecteur) {
      var limite = roles.length > 0 && roles.every(function (r) { return o.presents.indexOf(r) >= 0 || r === 'ADMIN'; }) && roles.some(function (r) { return o.presents.indexOf(r) >= 0; });
      if (!limite || ctx.present) return { ok: true, raison: 'role' };
      if (brisEnCours(ctx.bris, ctx.agent, ctx.patientId, ctx.maintenant)) return { ok: true, raison: 'bris' };
      return { ok: false, raison: 'absent' };
    }
    if (brisEnCours(ctx.bris, ctx.agent, ctx.patientId, ctx.maintenant)) return { ok: true, raison: 'bris' };
    return { ok: false, raison: 'aucun' };
  }
  /** Contrôle d'un bris de glace avant l'enregistrement ; erreur en clair. */
  function controlerBris(d, ctx) {
    if (!brisActive(ctx.config)) throw new Error('Bris de glace : fonction désactivée par l’établissement (onglet « Validations »).');
    if (!d.id || !d.patientId) throw new Error('Patient manquant.');
    if (String(d.justification || '').replace(/\s+/g, ' ').trim().length < MIN_JUSTIF) throw new Error('Justifiez le bris de glace (au moins ' + MIN_JUSTIF + ' caractères) : il est tracé et relu par le cadre.');
    if (!(Date.parse(d.fin) > Date.parse(d.debut || 0))) throw new Error('Durée du bris de glace invalide.');
    if (Date.parse(d.fin) - Date.parse(d.debut) > 24 * 3600e3) throw new Error('Un bris de glace dure 24 heures au plus.');
    if (ctx.compte && !peutBriser(ctx.config, ctx.compte.roles, d.service)) throw new Error('Votre rôle ne permet pas le bris de glace dans ce service.');
  }
  /** Bris de glace d'un mois (AAAA-MM) pour des services (null : tous), les plus récents d'abord. */
  function duMois(bris, mois, services) {
    return Object.keys(bris || {}).map(function (k) { return bris[k]; }).filter(function (b) { return String(b.debut).slice(0, 7) === mois && (!services || services.indexOf(b.service) >= 0); })
      .sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); });
  }
  /** Bris de glace pas encore relus (services du cadre ; null : tous). */
  function aRelire(bris, services) { return Object.keys(bris || {}).map(function (k) { return bris[k]; }).filter(function (b) { return !b.relu && (!services || services.indexOf(b.service) >= 0); }); }
  return { DEFAUT: DEFAUT, MIN_JUSTIF: MIN_JUSTIF, options: options, brisActive: brisActive, rolesBris: rolesBris, peutBriser: peutBriser, fin: fin, brisEnCours: brisEnCours, acces: acces,
    controlerBris: controlerBris, duMois: duMois, aRelire: aRelire };
});
