// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — rôles selon le service (phase 5, décisions du porteur du 15 novembre 2026).
 *
 * Un compte a ses rôles habituels (`compte.roles`) ; pour un service où il exerce autrement (ex. IDE en Unité 1, faisant
 * fonction de cadre en Unité 2), un réglage remplace ses rôles de service dans ce service seulement. Réglage commun
 * `rolesServices` = { <compte>: { <service>: [rôles de service] } } (journal du socle) ; les rôles qui ne sont pas des
 * rôles de service (administrateur, directeur des soins, administrateur de garde) restent valables partout.
 *
 * Droits : chaque saisie est contrôlée avec les rôles du compte dans le service qu'elle concerne (patient, mesure,
 * demande…) ; « Tous les services » cumule l'affichage, pas les droits. Clés : remises selon l'ensemble des rôles du
 * compte (le cloisonnement entre services d'un même module reste celui de l'interface, décision du porteur).
 * Réglé par l'administrateur, et par le cadre pour les agents de ses services, sans donner un rôle d'encadrement ni
 * un rôle médical (IDE, aide-soignant, secrétaire, intervenant).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else (root.SIC = root.SIC || {}).rolesServices = factory(root.SIC.model);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var DE_SERVICE = M.ROLES_DE_SERVICE;
  /** Rôles que le cadre peut attribuer dans ses services (jamais un rôle d'encadrement ni un rôle médical). */
  var ATTRIBUABLES_CADRE = ['IDE', 'AS', 'SECRETAIRE', 'INTERVENANT'];

  function normaliser(v) {
    var r = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return r;
    Object.keys(v).forEach(function (id) {
      var x = v[id];
      if (!x || typeof x !== 'object' || Array.isArray(x)) return;
      Object.keys(x).forEach(function (sv) {
        var l = Array.isArray(x[sv]) ? x[sv].filter(function (ro, i, a) { return DE_SERVICE.indexOf(ro) >= 0 && a.indexOf(ro) === i; }) : null;
        if (l && l.length) (r[id] = r[id] || {})[sv] = l;
      });
    });
    return r;
  }
  function reglage(config, id) { return normaliser(config && config.rolesServices)[id] || {}; }
  /** Le compte a-t-il des rôles propres à un service ? */
  function aDesRoles(config, compte) { return !!compte && Object.keys(reglage(config, compte.id)).some(function (sv) { return (compte.services || []).indexOf(sv) >= 0; }); }
  /**
   * Rôles du compte dans un service : rôles propres au service (s'il y en a, et s'il y est affecté), plus ses rôles qui
   * ne sont pas des rôles de service ; sinon ses rôles habituels. Sans service : rôles habituels.
   */
  function rolesDans(compte, config, service) {
    var base = (compte && compte.roles) || [];
    if (!compte || !service || service === '*' || (compte.services || []).indexOf(service) < 0) return base.slice();
    var propre = reglage(config, compte.id)[service];
    if (!propre) return base.slice();
    var r = base.filter(function (x) { return DE_SERVICE.indexOf(x) < 0; });
    propre.forEach(function (x) { if (r.indexOf(x) < 0) r.push(x); });
    // Cadre supérieur : porte aussi le rôle Cadre (comme partout ailleurs)
    if (r.indexOf('CADRE_SUP') >= 0 && r.indexOf('CADRE') < 0) r.push('CADRE');
    return r;
  }
  /** Ensemble des rôles du compte, tous services confondus (affichage « Tous les services », clés des modules). */
  function rolesTous(compte, config) {
    var r = ((compte && compte.roles) || []).slice(), x = compte ? reglage(config, compte.id) : {};
    Object.keys(x).forEach(function (sv) { if ((compte.services || []).indexOf(sv) >= 0) x[sv].forEach(function (ro) { if (r.indexOf(ro) < 0) r.push(ro); }); });
    return r;
  }
  /** Services du compte où il a exactement ces rôles (pour les contrôles qui croisent les services, ex. validateur). */
  function servicesAvecRoles(compte, config, roles) {
    var cle = roles.slice().sort().join(',');
    return (compte.services || []).filter(function (sv) { return rolesDans(compte, config, sv).slice().sort().join(',') === cle; });
  }
  /** Compte vu dans un service : rôles du service, services où il a les mêmes rôles. */
  function compteDans(compte, config, service) {
    if (!compte || !aDesRoles(config, compte)) return compte;
    var r = rolesDans(compte, config, service);
    return Object.assign({}, compte, { roles: r, services: service && service !== '*' ? servicesAvecRoles(compte, config, r) : (compte.services || []).filter(function (sv) { return !reglage(config, compte.id)[sv]; }) });
  }

  /** Rôles qu'un compte peut attribuer dans un service (administrateur : tous les rôles de service ; cadre : ATTRIBUABLES_CADRE). */
  function attribuables(auteur, service) {
    var r = (auteur && auteur.roles) || [];
    if (r.indexOf('ADMIN') >= 0) return DE_SERVICE.slice();
    if (r.indexOf('CADRE') >= 0 && (auteur.services || []).indexOf(service) >= 0) return ATTRIBUABLES_CADRE.slice();
    return [];
  }
  /** L'auteur peut-il régler les rôles par service de ce compte (au moins un service commun réglable, jamais soi-même) ? */
  function peutRegler(auteur, compte) {
    if (!auteur || !compte || auteur.id === compte.id) return (auteur && (auteur.roles || []).indexOf('ADMIN') >= 0) || false;
    return (compte.services || []).some(function (sv) { return attribuables(auteur, sv).length > 0; });
  }
  /**
   * Changement du réglage permis à l'auteur ? Erreur en clair sinon. Chaque (compte, service) modifié : service du compte ;
   * administrateur : tout ; cadre : services à lui, anciens et nouveaux rôles parmi ceux qu'il attribue, jamais lui-même.
   */
  function controler(ancien, nouveau, auteur, comptes) {
    var a = normaliser(ancien), n = normaliser(nouveau), ids = {};
    Object.keys(a).concat(Object.keys(n)).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (id) {
      var xa = a[id] || {}, xn = n[id] || {}, svs = {};
      Object.keys(xa).concat(Object.keys(xn)).forEach(function (k) { svs[k] = 1; });
      Object.keys(svs).forEach(function (sv) {
        if (JSON.stringify(xa[sv] || null) === JSON.stringify(xn[sv] || null)) return;
        var c = (comptes || []).filter(function (x) { return x.id === id; })[0];
        if (!c) throw new Error('Compte inconnu.');
        if (xn[sv] && (c.services || []).indexOf(sv) < 0) throw new Error(c.nom + ' n’est pas affecté(e) au service ' + sv + '.');
        var ok = attribuables(auteur, sv);
        if (!ok.length) throw new Error('Vous ne réglez pas les rôles du service ' + sv + '.');
        if (auteur && id === auteur.id && (auteur.roles || []).indexOf('ADMIN') < 0) throw new Error('Vous ne réglez pas vos propres rôles.');
        (xa[sv] || []).concat(xn[sv] || []).forEach(function (ro) { if (ok.indexOf(ro) < 0) throw new Error('Le rôle « ' + (M.ROLES[ro] || ro) + ' » est attribué par l’administrateur seulement.'); });
      });
    });
    return true;
  }
  /** Nouveau réglage où les rôles d'un compte dans un service sont remplacés (null ou [] : rôles habituels). */
  function avec(config, id, service, roles) {
    var v = normaliser(config && config.rolesServices);
    var x = Object.assign({}, v[id] || {});
    if (roles && roles.length) x[service] = roles.slice(); else delete x[service];
    if (Object.keys(x).length) v[id] = x; else delete v[id];
    return v;
  }
  return { ATTRIBUABLES_CADRE: ATTRIBUABLES_CADRE, normaliser: normaliser, reglage: reglage, aDesRoles: aDesRoles, rolesDans: rolesDans, rolesTous: rolesTous, compteDans: compteDans,
    servicesAvecRoles: servicesAvecRoles, attribuables: attribuables, peutRegler: peutRegler, controler: controler, avec: avec };
});
