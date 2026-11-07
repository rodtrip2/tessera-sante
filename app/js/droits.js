// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — droits (étape 1 du plan d'architecture) : rôles, accès cochables, services visibles par un compte,
 * visibilité du journal et des onglets. Repris sans changement du modèle d'Isocont ; à l'étape 2, les accès
 * (ACCES, DROITS) seront déclarés par chaque module dans son contrat.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).droits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- Rôles
  var ROLES = {
    IDE: 'IDE',
    AS: 'Aide-soignant(e)',
    SECRETAIRE: 'Secrétaire',
    CADRE: 'Cadre de santé',
    ADMIN: 'Administrateur'
  };

  /** Accès au mode formation : accordé à tous les comptes, sauf désactivation par l'administrateur. */
  function accesFormation(compte) { return !!compte && compte.id !== 'secours' && compte.formation !== false; }

  // Rôles qui exigent au moins un service affecté.
  var ROLES_DE_SERVICE = ['IDE', 'AS', 'SECRETAIRE', 'CADRE'];

  // Types d'événements autorisés par rôle. L'IDE dispose en permanence des
  // actions JLD (usage prévu le week-end et en l'absence de la secrétaire).
  var DROITS = {
    IDE: ['PATIENT', 'MODE_HOSPI', 'MESURE_DEBUT', 'MESURE_FIN', 'PAUSE', 'REPRISE', 'TIERS', 'PROFESSIONNEL', 'JLD', 'INFORMATION', 'TRANSFERT', 'SOMATIQUE', 'SOMATIQUE_RETOUR', 'RECOURS', 'PROPOSITION', 'ENTRETIEN'],
    AS: ['PATIENT', 'MODE_HOSPI', 'MESURE_DEBUT', 'MESURE_FIN', 'PAUSE', 'REPRISE', 'TIERS', 'PROFESSIONNEL', 'JLD', 'INFORMATION', 'TRANSFERT', 'SOMATIQUE', 'SOMATIQUE_RETOUR', 'RECOURS', 'PROPOSITION', 'ENTRETIEN'],   // mêmes droits que l'IDE
    SECRETAIRE: ['JLD', 'RECOURS'],
    CADRE: ['PATIENT', 'MODE_HOSPI', 'MESURE_DEBUT', 'MESURE_FIN', 'PAUSE', 'REPRISE', 'TIERS', 'PROFESSIONNEL', 'JLD', 'INFORMATION', 'TRANSFERT', 'SOMATIQUE', 'SOMATIQUE_RETOUR', 'RECOURS', 'ENTRETIEN', 'CORRECTION', 'REFUS_PROPOSITION', 'ANNULATION', 'STATS', 'FUSION'],
    ADMIN: ['CONFIG', 'ANNULATION', 'COMPTE', 'LOT', 'INTEGRITE']
  };

  // ------------------------------------------------ Rôles configurables
  /**
   * Accès regroupés, cochés pour chaque rôle (Administration → Comptes et sécurité → Rôles et accès).
   * Chaque accès ouvre un ou plusieurs types de saisie (ou d'action) contrôlés par `peut`.
   * Le rôle Administrateur est fixe : droits d'administration, non modifiable (choix du porteur).
   */
  var ACCES = [
    { code: 'patients', libelle: 'Fiches patient et mode d’hospitalisation', types: ['PATIENT', 'MODE_HOSPI'] },
    { code: 'mesures', libelle: 'Début et fin des mesures, changement de lieu', types: ['MESURE_DEBUT', 'MESURE_FIN'] },
    { code: 'pauses', libelle: 'Pauses (levées temporaires) et reprises', types: ['PAUSE', 'REPRISE'] },
    { code: 'tiers', libelle: 'Information du tiers', types: ['TIERS'] },
    { code: 'jld', libelle: 'Envois au JLD et décisions reçues', types: ['JLD'] },
    { code: 'recours', libelle: 'Recours et appels', types: ['RECOURS'] },
    { code: 'surveillance', libelle: 'Surveillance : professionnels par poste', types: ['PROFESSIONNEL'] },
    { code: 'alertes', libelle: 'Tracer l’information demandée par une alerte', types: ['INFORMATION'] },
    { code: 'parcours', libelle: 'Transferts, soins somatiques ou urgences', types: ['TRANSFERT', 'SOMATIQUE', 'SOMATIQUE_RETOUR'] },
    { code: 'entretien', libelle: 'Entretien après la mesure', types: ['ENTRETIEN'] },
    { code: 'proposition', libelle: 'Proposer une correction (validée ensuite par un cadre)', types: ['PROPOSITION'] },
    { code: 'correction', libelle: 'Corriger une saisie, valider ou refuser les corrections proposées', types: ['CORRECTION', 'REFUS_PROPOSITION'] },
    { code: 'annulation', libelle: 'Annuler une saisie (mesures et patients)', types: ['ANNULATION'] },
    { code: 'fusion', libelle: 'Fusionner deux fiches patient', types: ['FUSION'] },
    { code: 'stats', libelle: 'Statistiques : saisir les effectifs', types: ['STATS'] },
    { code: 'communication', libelle: 'Registre pour communication (CADA) et export des données d’un patient', types: ['EDITION_CADA', 'EXPORT_PATIENT'] }
  ];
  var TYPES_ADMIN = ['CONFIG', 'ANNULATION', 'COMPTE', 'LOT', 'INTEGRITE', 'EDITION_CADA', 'EXPORT_PATIENT'];

  /** Accès par défaut d'un rôle fourni, déduits de ses droits historiques. */
  function accesDefaut(code) {
    var droits = (DROITS[code] || []).slice();
    if (code === 'CADRE') droits.push('EDITION_CADA', 'EXPORT_PATIENT');
    return ACCES.filter(function (a) { return a.types.every(function (t) { return droits.indexOf(t) >= 0; }); }).map(function (a) { return a.code; });
  }
  var ROLES_FOURNIS = ['IDE', 'AS', 'SECRETAIRE', 'CADRE'];

  /**
   * Rôles de l'établissement, validés : [{ code, libelle, acces: [], types: [], services, fourni, admin }].
   * `config.roles` = { CODE: { libelle, acces, services, supprime } } ; sans réglage, les rôles fournis.
   * `services` : vrai si le rôle voit seulement les services affectés au compte (faux : tous les services).
   */
  function rolesConfig(config) {
    var reg = (config && config.roles) || {}, res = [];
    var codes = ROLES_FOURNIS.concat(Object.keys(reg).filter(function (k) { return ROLES_FOURNIS.indexOf(k) < 0 && k !== 'ADMIN'; }).sort());
    codes.forEach(function (code) {
      var r = reg[code] || {}, fourni = ROLES_FOURNIS.indexOf(code) >= 0;
      if (!fourni && !reg[code]) return;
      if (r.supprime) return;
      var acces = Array.isArray(r.acces) ? r.acces.filter(function (a) { return ACCES.some(function (x) { return x.code === a; }); }) : (fourni ? accesDefaut(code) : []);
      var types = [];
      ACCES.forEach(function (a) { if (acces.indexOf(a.code) >= 0) a.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); }); });
      var svc = r.services === undefined ? true : !!r.services;
      // Registre seulement (demande du porteur) : aucune saisie, aucun journal, un seul onglet, le registre tel quel.
      // `registreAnonyme` : nom du réglage en 1.65.0, repris tel quel.
      var anonyme = !fourni && (r.registreSeul === true || r.registreAnonyme === true);
      if (anonyme) { acces = []; types = []; }
      var masques = anonyme ? [] : (Array.isArray(r.ongletsMasques) ? ONGLETS_MASQUABLES.filter(function (o) { return r.ongletsMasques.indexOf(o) >= 0; }) : []);
      res.push({ code: code, libelle: String(r.libelle || (fourni ? ROLES[code] : code)).trim() || code, acces: acces, types: types,
        services: svc, journal: anonyme ? 'aucun' : journalDefaut(code, svc, r.journal), registreSeul: anonyme, ongletsMasques: masques, fourni: fourni, admin: false });
    });
    res.push({ code: 'ADMIN', libelle: ROLES.ADMIN, acces: [], types: TYPES_ADMIN.slice(), services: false, journal: 'complet', fourni: true, admin: true });
    return res;
  }

  // ------------------------------------------------ Visibilité du journal (demande du porteur)
  // Niveau par rôle (`config.roles[CODE].journal`) ; un compte qui cumule des rôles a le niveau le plus large.
  // Par défaut (choix du porteur) : cadre de santé et rôles « tous services » complet, autres rôles limités à leurs services.
  var NIVEAUX_JOURNAL = [
    { code: 'complet', libelle: 'Journal complet (tous les services, comptes, paramétrage, exports)' },
    { code: 'services', libelle: 'Saisies de ses services (et ses propres saisies)' },
    { code: 'siennes', libelle: 'Ses propres saisies seulement' },
    { code: 'aucun', libelle: 'Pas d’accès au journal (onglet masqué)' }
  ];
  function journalDefaut(code, services, valeur) {
    if (NIVEAUX_JOURNAL.some(function (n) { return n.code === valeur; })) return valeur;
    if (code === 'CADRE' || !services) return 'complet';
    return 'services';
  }
  /** Niveau de visibilité du journal pour un ensemble de rôles : le plus large l'emporte. */
  function niveauJournal(roles, config) {
    var rc = rolesConfig(config), rang = { complet: 0, services: 1, siennes: 2, aucun: 3 }, meilleur = 'aucun';
    (roles || []).forEach(function (code) {
      var r = rc.filter(function (x) { return x.code === code; })[0];
      if (r && rang[r.journal] < rang[meilleur]) meilleur = r.journal;
    });
    return meilleur;
  }
  // Onglets que l'établissement peut masquer rôle par rôle (demande du porteur).
  // (Journal : réglage « Journal des saisies » du rôle ; Administration : administrateur seulement.)
  var ONGLETS_MASQUABLES = ['tableau', 'mesures', 'patients', 'jld', 'surveillance', 'registre', 'stats'];
  /**
   * Vrai si l'onglet est affiché pour ces rôles : il l'est dès qu'un des rôles l'affiche (le plus large l'emporte) ;
   * toujours pour l'administrateur ; un rôle « registre seulement » n'affiche que le registre.
   */
  function ongletVisible(roles, config, onglet) {
    if (ONGLETS_MASQUABLES.indexOf(onglet) < 0) return true;
    var rc = rolesConfig(config);
    return (roles || []).some(function (c) {
      var r = rc.filter(function (x) { return x.code === c; })[0];
      if (!r) return false;
      if (r.admin) return true;
      if (r.registreSeul) return onglet === 'registre';
      return r.ongletsMasques.indexOf(onglet) < 0;
    });
  }

  /**
   * Vrai si le compte n'a accès qu'au registre : tous ses rôles connus sont des rôles « registre seulement ».
   * Un rôle plus large cumulé l'emporte (comme pour les autres accès).
   */
  function registreSeul(roles, config) {
    var rc = rolesConfig(config), connus = (roles || []).map(function (c) { return rc.filter(function (x) { return x.code === c; })[0]; }).filter(Boolean);
    return connus.length > 0 && connus.every(function (r) { return r.registreSeul; });
  }

  /** Libellé d'un rôle (rôle supprimé ou inconnu : son code). */
  function libRole(config, code) {
    var r = rolesConfig(config).filter(function (x) { return x.code === code; })[0];
    return r ? r.libelle : (ROLES[code] || code);
  }

  function peut(roles, typeEvenement, config) {
    var rc = rolesConfig(config);
    return (roles || []).some(function (code) {
      var r = rc.filter(function (x) { return x.code === code; })[0];
      return !!r && r.types.indexOf(typeEvenement) >= 0;
    });
  }

  /** Vrai si l'un des rôles voit tous les services (administrateur, ou rôle réglé ainsi). */
  function voitTousServices(roles, config) {
    var rc = rolesConfig(config);
    return (roles || []).some(function (code) { var r = rc.filter(function (x) { return x.code === code; })[0]; return !!r && !r.services; });
  }

  /** Vrai si les rôles exigent au moins un service affecté au compte. */
  function exigeService(roles, config) {
    return !voitTousServices(roles, config) && (roles || []).some(function (code) { return rolesConfig(config).some(function (x) { return x.code === code; }); });
  }

  /** Services visibles par un compte : tous pour un administrateur, sinon ceux qui lui sont affectés. */
  function servicesDe(compte, config) {
    var tous = (config.services || []).map(function (s) { return s.code; });
    if (!compte) return [];
    if (voitTousServices(compte.roles, config)) return tous;
    var affectes = compte.services || [];
    return tous.filter(function (c) { return affectes.indexOf(c) >= 0; });
  }

  /**
   * Saisies du journal visibles par un compte : `complet` tout ; `services` ses propres saisies et les saisies
   * portant sur ses services ; `siennes` ses propres saisies ; `aucun` rien.
   * `servicesSaisie(e)` : services concernés par une saisie, fournis par le module (le socle ignore le métier).
   */
  function journalVisible(journal, compte, config, servicesSaisie) {
    var niveau = niveauJournal(compte && compte.roles, config);
    if (niveau === 'complet') return journal;
    if (niveau === 'aucun' || !compte) return [];
    var mien = function (e) { return e.by === compte.id; };
    if (niveau === 'siennes') return journal.filter(mien);
    var mesSv = servicesDe(compte, config);
    return journal.filter(function (e) {
      if (mien(e)) return true;
      return servicesSaisie(e).some(function (x) { return mesSv.indexOf(x) >= 0; });
    });
  }

  return {
    ROLES: ROLES, DROITS: DROITS, ACCES: ACCES, TYPES_ADMIN: TYPES_ADMIN, ROLES_FOURNIS: ROLES_FOURNIS, ROLES_DE_SERVICE: ROLES_DE_SERVICE,
    accesFormation: accesFormation, accesDefaut: accesDefaut, rolesConfig: rolesConfig, libRole: libRole, peut: peut,
    voitTousServices: voitTousServices, exigeService: exigeService, servicesDe: servicesDe,
    NIVEAUX_JOURNAL: NIVEAUX_JOURNAL, niveauJournal: niveauJournal, journalVisible: journalVisible,
    ONGLETS_MASQUABLES: ONGLETS_MASQUABLES, ongletVisible: ongletVisible, registreSeul: registreSeul
  };
});
