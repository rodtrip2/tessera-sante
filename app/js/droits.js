// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — droits : règles des rôles, des accès, des services visibles et de la visibilité du journal et des onglets.
 * Étape 2 du plan d'architecture : le socle fournit les règles, chaque module y verse ses données (accès cochables,
 * rôles fournis et leurs droits historiques, onglets masquables) par `creer(def)`, qui rend les fonctions liées.
 * Aucune donnée d'un module ici : celles d'Isocont sont dans model.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).droits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Accès au mode formation : accordé à tous les comptes, sauf désactivation par l'administrateur. */
  function accesFormation(compte) { return !!compte && compte.id !== 'secours' && compte.formation !== false; }

  // ------------------------------------------------ Niveaux de visibilité du journal (communs à tous les modules)
  var NIVEAUX_JOURNAL = [
    { code: 'complet', libelle: 'Journal complet (tous les services, comptes, paramétrage, exports)' },
    { code: 'services', libelle: 'Saisies de ses services (et ses propres saisies)' },
    { code: 'siennes', libelle: 'Ses propres saisies seulement' },
    { code: 'aucun', libelle: 'Pas d’accès au journal (onglet masqué)' }
  ];

  /**
   * Droits d'un module. `def` : { roles: { CODE: libellé } (ADMIN compris), rolesDeService, droits: { CODE: [types] },
   * acces: [{ code, libelle, types }], typesAdmin, rolesFournis, ongletsMasquables, typesEnPlus: { CODE: [types] }
   * (ajoutés aux droits historiques pour les accès par défaut), rolesJournalComplet (journal complet par défaut),
   * ongletRegistreSeul (seul onglet d'un rôle « registre seulement »), module (identifiant du module, pour son activation
   * par service), rolesEncadrement (rôles qui consultent un service où le module est désactivé, avec l'administrateur),
   * lireAcces (r ↦ liste des accès du module cochés pour le rôle `r` de `config.roles` ; par défaut `r.acces`, ceux
   * d'Isocont ; un autre module range les siens dans `r.accesModules[module]`, étape 6), appartenance ('role' : tout rôle
   * a un rôle dans le module ; 'acces' : seulement un rôle qui y a au moins un accès) }.
   */
  // Rôles fournis de lecture (0.27.3) : tous les services, journal fermé et identité réduite par défaut, selon le rôle
  var TOUS_SERVICES_DEFAUT = ['ADMIN_GARDE', 'DIRECTEUR_SOINS'];
  var SANS_JOURNAL_DEFAUT = ['MEDECIN', 'MEDECIN_CHEF_SERVICE', 'MEDECIN_CHEF_POLE', 'ADMIN_GARDE', 'DIRECTEUR_SOINS', 'INTERVENANT'];
  var IDENTITE_REDUITE_DEFAUT = ['ADMIN_GARDE', 'INTERVENANT'];
  // Intervenant extérieur (0.31.0) : n'entre dans un module que par un accès coché (jamais par son seul rôle), et n'a par
  // défaut que les accès que le module lui donne expressément (l'agenda de ses activités)
  var ACCES_SEULS = ['INTERVENANT'];
  var IDENTITES = { complete: 'Identité complète', initiales: 'Initiales seulement' };

  function creer(def) {
    var ROLES = def.roles, ROLES_DE_SERVICE = def.rolesDeService || [], DROITS = def.droits || {}, ACCES = def.acces || [];
    var TYPES_ADMIN = def.typesAdmin || [], ROLES_FOURNIS = def.rolesFournis || [], ONGLETS_MASQUABLES = def.ongletsMasquables || [];
    var TYPES_EN_PLUS = def.typesEnPlus || {}, JOURNAL_COMPLET = def.rolesJournalComplet || [], ONGLET_REGISTRE_SEUL = def.ongletRegistreSeul || null;
    var MODULE = def.module || null, ENCADREMENT = def.rolesEncadrement || [];
    // Module désactivé par défaut (Contrôles, 14 novembre 2026) : sans réglage, activé dans aucun service
    var INACTIF_DEFAUT = !!def.inactifParDefaut;
    // Cadre supérieur de santé (0.27.2) : accès par défaut, journal et encadrement du cadre, dans chaque module
    if (DROITS.CADRE && !DROITS.CADRE_SUP) DROITS = Object.assign({}, DROITS, { CADRE_SUP: DROITS.CADRE.slice() });
    if (TYPES_EN_PLUS.CADRE && !TYPES_EN_PLUS.CADRE_SUP) TYPES_EN_PLUS = Object.assign({}, TYPES_EN_PLUS, { CADRE_SUP: TYPES_EN_PLUS.CADRE.slice() });
    function avecSup(l) { return l.indexOf('CADRE') >= 0 && l.indexOf('CADRE_SUP') < 0 ? l.concat(['CADRE_SUP']) : l; }
    JOURNAL_COMPLET = avecSup(JOURNAL_COMPLET); ENCADREMENT = avecSup(ENCADREMENT);
    var LIRE_ACCES = def.lireAcces || function (r) { return r.acces; }, APPARTENANCE = def.appartenance || 'role';

    // ------------------------------------------------ Activation du module par service (étape 3, architecture § 5)
    /**
     * Services où le module est activé (`config.modulesServices[module]`) : null = tous, y compris les services créés
     * ensuite (sans réglage : comportement d'origine) ; sinon la liste des codes activés.
     */
    function activation(config) {
      var v = MODULE && config && config.modulesServices && config.modulesServices[MODULE];
      if (v && v.arret === true) return [];   // module arrêté (0.43.0) : désactivé dans tous les services, réglage par service gardé
      if (!v) return INACTIF_DEFAUT ? [] : null;
      if (v.tous !== false) return null;
      return Array.isArray(v.services) ? v.services.map(String) : [];
    }
    /** Module arrêté depuis l'accueil de l'administration (0.43.0) : fenêtre masquée pour tous, données conservées. */
    function arrete(config) { var v = MODULE && config && config.modulesServices && config.modulesServices[MODULE]; return !!(v && v.arret === true); }
    /** Service choisi dans le réglage par service, sans tenir compte de l'arrêt du module (0.43.0). */
    function serviceChoisi(config, code) { var v = MODULE && config && config.modulesServices && config.modulesServices[MODULE]; if (!v) return !INACTIF_DEFAUT; if (v.tous !== false) return true; return (Array.isArray(v.services) ? v.services.map(String) : []).indexOf(code) >= 0; }
    function serviceActif(config, code) { var a = activation(config); return !a || a.indexOf(code) >= 0; }
    /** Services où le module est désactivé (données conservées, plus de saisie, consultation par l'encadrement). */
    function servicesInactifs(config) {
      return ((config && config.services) || []).map(function (s) { return s.code; }).filter(function (c) { return !serviceActif(config, c); });
    }
    /** Vrai si ces rôles consultent les services où le module est désactivé (administrateur, encadrement). */
    function consulteInactifs(roles) {
      return (roles || []).some(function (r) { return r === 'ADMIN' || ENCADREMENT.indexOf(r) >= 0; });
    }





    // ------------------------------------------------ Rôles configurables

    /** Accès par défaut d'un rôle fourni, déduits de ses droits historiques. */
    function accesDefaut(code) {
      if (ACCES_SEULS.indexOf(code) >= 0 && !DROITS[code]) return [];
      var droits = (DROITS[code] || []).slice();
      (TYPES_EN_PLUS[code] || []).forEach(function (t) { droits.push(t); });
      return ACCES.filter(function (a) { return a.types.every(function (t) { return droits.indexOf(t) >= 0; }); }).map(function (a) { return a.code; });
    }

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
        var brut = LIRE_ACCES(r);
        var acces = Array.isArray(brut) ? brut.filter(function (a) { return ACCES.some(function (x) { return x.code === a; }); }) : (fourni ? accesDefaut(code) : []);
        var types = [];
        ACCES.forEach(function (a) { if (acces.indexOf(a.code) >= 0) a.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); }); });
        var svc = r.services === undefined ? !(fourni && TOUS_SERVICES_DEFAUT.indexOf(code) >= 0) : !!r.services;
        var identite = r.identite === 'initiales' || r.identite === 'complete' ? r.identite : (fourni && IDENTITE_REDUITE_DEFAUT.indexOf(code) >= 0 ? 'initiales' : 'complete');
        // Registre seulement (demande du porteur) : aucune saisie, aucun journal, un seul onglet, le registre tel quel.
        // `registreAnonyme` : nom du réglage en 1.65.0, repris tel quel.
        var anonyme = !fourni && (r.registreSeul === true || r.registreAnonyme === true);
        if (anonyme) { acces = []; types = []; }
        var masques = anonyme ? [] : (Array.isArray(r.ongletsMasques) ? ONGLETS_MASQUABLES.filter(function (o) { return r.ongletsMasques.indexOf(o) >= 0; }) : []);
        res.push({ code: code, libelle: String(r.libelle || (fourni ? ROLES[code] : code)).trim() || code, acces: acces, types: types,
          services: svc, journal: anonyme ? 'aucun' : journalDefaut(code, svc, r.journal), registreSeul: anonyme, ongletsMasques: masques, fourni: fourni, admin: false, identite: identite });
      });
      res.push({ code: 'ADMIN', libelle: ROLES.ADMIN, acces: [], types: TYPES_ADMIN.slice(), services: false, journal: 'complet', fourni: true, admin: true });
      return res;
    }

    // ------------------------------------------------ Visibilité du journal (demande du porteur)
    // Niveau par rôle (`config.roles[CODE].journal`) ; un compte qui cumule des rôles a le niveau le plus large.
    // Par défaut (choix du porteur) : cadre de santé et rôles « tous services » complet, autres rôles limités à leurs services.
    function journalDefaut(code, services, valeur) {
      if (NIVEAUX_JOURNAL.some(function (n) { return n.code === valeur; })) return valeur;
      if (SANS_JOURNAL_DEFAUT.indexOf(code) >= 0) return 'aucun';
      if (JOURNAL_COMPLET.indexOf(code) >= 0 || !services) return 'complet';
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
        if (r.registreSeul) return onglet === ONGLET_REGISTRE_SEUL;
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

    /** Vrai si l'un des rôles donne un rôle dans le module (clé du module, onglets) ; l'administrateur toujours. */
    function membre(roles, config) {
      if ((roles || []).indexOf('ADMIN') >= 0) return true;
      var rc = rolesConfig(config);
      return (roles || []).some(function (code) { var r = rc.filter(function (x) { return x.code === code && !x.admin; })[0]; return !!r && ((APPARTENANCE !== 'acces' && ACCES_SEULS.indexOf(code) < 0) || r.acces.length > 0); });
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
      // Services où le module est désactivé : visibles de l'administrateur et de l'encadrement seulement (consultation)
      if (!consulteInactifs(compte.roles)) tous = tous.filter(function (c) { return serviceActif(config, c); });
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
      IDENTITES: IDENTITES, identiteReduite: function (roles, config) {
        // Identité réduite (initiales) : si aucun des rôles du compte ne voit l'identité complète (l'administrateur la voit)
        var rs = (roles || []).filter(function (x) { return x !== 'ADMIN'; });
        if (!rs.length || (roles || []).indexOf('ADMIN') >= 0) return false;
        var rc = rolesConfig(config);
        return rs.every(function (code) { var r = rc.filter(function (x) { return x.code === code; })[0]; return !r || r.identite === 'initiales'; });
      },
      ROLES: ROLES, DROITS: DROITS, ACCES: ACCES, TYPES_ADMIN: TYPES_ADMIN, ROLES_FOURNIS: ROLES_FOURNIS, ROLES_DE_SERVICE: ROLES_DE_SERVICE,
      accesFormation: accesFormation, accesDefaut: accesDefaut, rolesConfig: rolesConfig, libRole: libRole, peut: peut,
      voitTousServices: voitTousServices, exigeService: exigeService, servicesDe: servicesDe, membre: membre, LIRE_ACCES: LIRE_ACCES,
      NIVEAUX_JOURNAL: NIVEAUX_JOURNAL, niveauJournal: niveauJournal, journalVisible: journalVisible,
      ONGLETS_MASQUABLES: ONGLETS_MASQUABLES, ongletVisible: ongletVisible, registreSeul: registreSeul,
      module: MODULE, ROLES_ENCADREMENT: ENCADREMENT, INACTIF_PAR_DEFAUT: INACTIF_DEFAUT, activation: activation, arrete: arrete, serviceChoisi: serviceChoisi, serviceActif: serviceActif, servicesInactifs: servicesInactifs, consulteInactifs: consulteInactifs
    };
  }

  return { accesFormation: accesFormation, NIVEAUX_JOURNAL: NIVEAUX_JOURNAL, creer: creer };
});
