// SPDX-License-Identifier: EUPL-1.2
/*
 * Session (socle) — coffre de clés, comptes, journal et synchronisation.
 * Aucune règle métier : droits, journal et rangement des exports viennent du socle (droits.js,
 * noyau-journal.js, exports-rangement.js) ; la reconstitution de l'état et les réglages par défaut
 * viennent du module (`moduleActif()`, son contrat au registre des modules), seul point d'appel au métier.
 */
(function (root) {
  'use strict';
  var SIC = root.SIC = root.SIC || {};
  var C = SIC.crypto;
  // Fichiers du socle : chargés par la page, ou lus directement sous Node (tests).
  function socle(nom, fichier) { return SIC[nom] || (typeof require === 'function' ? require(fichier) : undefined); }
  var Droits = socle('droits', './droits.js'), N = socle('noyauJournal', './noyau-journal.js'), X = socle('exportsRangement', './exports-rangement.js');
  var T = socle('trousseau', './trousseau.js');
  /**
   * Module dont la session tient le journal : celui du registre des modules (contrat, modules.js). Sans registre
   * (tests qui ne chargent que le modèle), le modèle d'Isocont est lu comme un contrat.
   */
  function moduleActif() {
    var m = SIC.modules && SIC.modules.actif();
    if (m) return m;
    return { saisies: { reduire: SIC.model.reduire }, reglages: { defaut: SIC.model.CONFIG_DEFAUT }, droits: SIC.model.droits };
  }
  function D() { return moduleActif().droits; }
  /** Réglages en vigueur, ou réglages par défaut du module avant la première lecture du journal. */
  function config(s) { return s.etat ? s.etat.config : moduleActif().reglages.defaut; }

  function id8() { return C.hex(C.aleatoire(4)); }

  function Session(dossier) {
    this.dossier = dossier;
    this.cle = null;
    this.coffre = null;
    this.comptes = [];         // [{id, login, nom, roles, actif}]
    this.utilisateur = null;   // compte connecté (ou compte de secours)
    this.evts = [];            // saisies de tous les journaux du jeu actif
    this.rejetes = [];         // fichiers illisibles de tous les journaux ({ journal, nom, chemin… })
    this.journauxActifs = null;
    this.etat = null;
    this.derniereSynchro = null;
    this.auditeurs = [];
    // Jeu de données actif : les données réelles (dossier principal) ou le jeu de formation.
    this.donnees = null;       // Dossier du jeu de formation quand il est ouvert
    this.cleDonnees = null;    // sa clé
    this.formation = false;
  }

  function dossierActif(s) { return s.formation ? s.donnees : s.dossier; }
  /** Sous-dossier du jeu de formation : dans le dossier du module (modules\<module>\formation). */
  function cheminFormation() { return SIC.Dossier.cheminJournal(moduleActif().id || 'isocont').concat(['formation']); }

  // ---------------------------------------------------------- Journaux (étape 3 du plan d'architecture)
  /*
   * Données réelles : deux journaux, chacun dans son sous-dossier (saisies, repères, instantanés, quarantaine) :
   * le journal du socle (socle\) et celui du module (modules\<module>\). Le module reconstitue son état à partir
   * des deux (réglages communs du socle + ses saisies). Jeu de formation : un seul journal, comme avant.
   */
  var SOCLE = 'socle';
  /** Saisies du socle : traces des comptes et des clés, prises d'acte d'intégrité, réglages communs. */
  var TYPES_SOCLE = { COMPTE: 1, INTEGRITE: 1 };
  var REGLAGES_SOCLE = { etablissement: 1, services: 1, roles: 1, modulesServices: 1 };

  function nouveauJournal(nom, dossier, cle) { return { nom: nom, dossier: dossier, cle: cle, evts: [], connus: new Set(), rejetes: [], reperesLus: {} }; }
  /** Journaux du jeu de données actif. */
  function journaux(s) {
    if (!s.journauxActifs) {
      s.journauxActifs = s.formation ? [nouveauJournal('formation', s.donnees, s.cleDonnees)]
        : [nouveauJournal(SOCLE, null, s.cle)].concat(accesModule(s) ? [nouveauJournal(idModule(), null, jeuModule(s))] : []);
    }
    return s.journauxActifs;
  }
  /** Dossier d'un journal (créé à la première saisie) ; null s'il n'existe pas encore et `creer` est faux. */
  async function dossierJournal(s, j, creer) {
    if (!j.dossier) j.dossier = await s.dossier.journal(j.nom, creer);
    return j.dossier;
  }
  /** Préfixe des chemins d'un journal depuis le dossier des données (affiché au service informatique). */
  function prefixeJournal(s, nom) { return s.formation ? '' : SIC.Dossier.cheminJournal(nom).join('/') + '/'; }
  /** Journal qui reçoit une saisie : celui de la saisie visée pour une annulation, le socle pour ses saisies, sinon le module. */
  function journalPour(js, type, data) {
    if (js.length === 1 && js[0].nom !== SOCLE) return js[0];   // jeu de formation : un seul journal
    if (type === 'ANNULATION' && data && data.cible) {
      var vise = js.filter(function (j) { return j.evts.some(function (e) { return e.id === data.cible; }); })[0];
      if (vise) return vise;
    }
    if (TYPES_SOCLE[type] || (type === 'CONFIG' && data && REGLAGES_SOCLE[data.cle])) return js[0];
    if (!js[1]) throw new Error('Vous n’avez pas la clé du module « ' + (moduleActif().libelle || idModule()) + ' » : saisie impossible.');
    return js[1];
  }
  /**
   * Activation du module par service (architecture § 5) : aucune saisie du module ne peut toucher un service où il
   * est désactivé (données conservées, consultation seule). Les saisies du socle ne sont pas concernées.
   */
  function controlerActivation(s, type, data) {
    var m = moduleActif(), cfg = config(s);
    if (!s.etat || !m.saisies.cibles || journalPour(journaux(s), type, data).nom === SOCLE) return;
    var inactifs = m.saisies.cibles(s.etat, { type: type, data: data || {} }).filter(function (c) { return !m.droits.serviceActif(cfg, c); });
    if (inactifs.length) {
      var lib = inactifs.map(function (c) { var x = (cfg.services || []).filter(function (v) { return v.code === c; })[0]; return x ? x.libelle : c; }).join(', ');
      throw new Error('Le module « ' + (m.libelle || m.id) + ' » est désactivé pour ' + (inactifs.length > 1 ? 'les services ' : 'le service ') + lib + ' : consultation seule, aucune saisie possible.');
    }
  }
  // ---------------------------------------------------------- Trousseau (étape 4)
  function v2(s) { return !!(s.coffre && s.coffre.version === 2); }
  function idModule() { return moduleActif().id || 'isocont'; }
  function modulesDeclares() { return SIC.modules ? SIC.modules.liste().map(function (m) { return m.id; }) : [idModule()]; }
  /** Trousseau ouvert : `cle` = jeu de la plateforme (comptes, journal du socle, préférences, traces). */
  function installerTrousseau(s, trousseau, privee8, cleV1) {
    s.trousseau = trousseau; s.privee8 = privee8 || null; s.cleV1 = cleV1 || null;
    s.cle = trousseau[T.PLATEFORME];
  }
  /** Coffre version 1 : la clé de données unique tient lieu de toutes les clés de droit (comportement d'origine). */
  function trousseauV1(s, cle) { var j = T.jeuV1(cle), t = {}; t[T.PLATEFORME] = j; t[idModule()] = j; installerTrousseau(s, t, null, cle); }
  function jeuModule(s) { return s.trousseau && (s.trousseau[idModule()] || s.trousseau[T.PLATEFORME]); }
  async function ouvrirAvecPrivee(s, pour, privee8) {
    installerTrousseau(s, await T.ouvrir(s.coffre, pour, await C.importerPrivee(privee8)), privee8);
  }
  function nouvelId() { return 'k' + id8(); }

  /**
   * Règle de remise de la clé d'un module (0.4.4) : un rôle dans le module et au moins un service où il est activé
   * (l'encadrement et les rôles « tous services » suivent l'activation du module ; l'administrateur a toujours la clé).
   */
  function aDroitPour(s) {
    var m = moduleActif(), d = m.droits, cfg = config(s);
    var codes = d.rolesConfig(cfg).map(function (r) { return r.code; });
    return function (nom, compte) {
      if (nom !== (m.id || 'isocont')) return true;
      var roles = compte.roles || [];
      if (roles.indexOf('ADMIN') >= 0) return true;
      if (!roles.some(function (r) { return codes.indexOf(r) >= 0; })) return false;
      if (!d.activation || !d.activation(cfg) || d.consulteInactifs(roles)) return true;
      var svs = d.voitTousServices(roles, cfg) ? (cfg.services || []).map(function (x) { return x.code; }) : (compte.services || []);
      return svs.some(function (c) { return d.serviceActif(cfg, c); });
    };
  }
  /** Vrai si la session détient la clé du module (coffre version 1 : toujours). */
  function accesModule(s) {
    if (!v2(s) || s.formation) return true;
    var j = s.trousseau && s.trousseau[idModule()];
    return !!j && (!!j.maitresse || Object.keys(j.octets).length > 0);
  }

  function oublierJournaux(s) {
    s.journauxActifs = null; s.evts = []; s.rejetes = []; s.etat = null; s.integrite = null;
  }

  Session.prototype.sur = function (fn) { this.auditeurs.push(fn); };
  /** Prévient l'interface. `info` : { source: 'synchro', nouveaux: n } pour une synchronisation, sinon saisie locale. */
  Session.prototype.notifier = function (info) { var s = this; this.auditeurs.forEach(function (f) { f(s, info || { source: 'local' }); }); };

  // --------------------------------------------------------- Coffre
  Session.prototype.chargerCoffre = async function () {
    this.coffre = await this.dossier.lireCoffre();
    return this.coffre;
  };

  async function chiffrerComptes(cle, comptes) {
    return C.b64(await C.chiffrerJSON(cle, { comptes: comptes }, 'comptes'));
  }

  /**
   * Initialise un dossier vide, directement en coffre version 2 (trousseau) : clés de droit, clé de secours
   * (code de secours), clé personnelle du compte administrateur.
   */
  Session.prototype.initialiser = async function (admin) {
    if (await this.dossier.lireCoffre()) throw new Error('Ce dossier contient déjà des données.');
    var compte = { id: 'u' + id8(), login: admin.login.trim().toLowerCase(), nom: admin.nom.trim(), roles: ['CADRE', 'ADMIN'], actif: true };
    var code = C.nouveauCodeSecours();
    var r = await T.creerCoffre({ compte: compte, motDePasse: admin.motDePasse, codeSecours: code, modules: modulesDeclares(), id: nouvelId });
    installerTrousseau(this, r.trousseau, r.privee8);
    this.comptes = [compte];
    r.coffre.comptes = await chiffrerComptes(this.cle, this.comptes);
    this.coffre = await this.dossier.ecrireCoffre(r.coffre, undefined);
    this.utilisateur = compte;
    await this.synchroniser();
    return code;
  };

  async function lireComptes(session) {
    var o;
    try { o = await C.dechiffrerJSON(session.cle, C.deb64(session.coffre.comptes), 'comptes'); }
    catch (e) {
      if (v2(session)) throw new Error('Votre trousseau ne permet pas d’ouvrir la liste des comptes : votre accès a été retiré ou vos clés ne sont pas à jour. Demandez à l’administrateur de réémettre vos clés.');
      throw e;
    }
    session.comptes = o.comptes;
  }
  async function lireComptesAvec(session, coffre) {
    var o = await C.dechiffrerJSON(session.cle, C.deb64(coffre.comptes), 'comptes');
    session.comptes = o.comptes;
  }

  Session.prototype.connexionMotDePasse = async function (login, motDePasse) {
    login = login.trim().toLowerCase();
    var embs = this.coffre.emballages.filter(function (e) { return e.methode === 'mdp' && e.login === login; });
    if (!embs.length) throw new Error('Identifiant ou mot de passe incorrect.');
    var secret = null, trouve = null;
    for (var i = 0; i < embs.length && !secret; i++) {
      try { secret = await C.deballerMotDePasse(embs[i], motDePasse, v2(this)); trouve = embs[i]; } catch (e) { secret = null; }
    }
    if (!secret) throw new Error('Identifiant ou mot de passe incorrect.');
    if (v2(this)) await ouvrirAvecPrivee(this, trouve.userId, secret); else trousseauV1(this, secret);
    await lireComptes(this);
    var u = this.comptes.filter(function (c) { return c.id === trouve.userId; })[0];
    if (!u || !u.actif) { this.verrouiller(); throw new Error('Ce compte est désactivé.'); }
    var val = SIC.comptes.validite(u, Date.now());
    if (val.expire) { this.verrouiller(); throw new Error('Ce compte temporaire a expiré (dernier jour d’accès : ' + u.finValidite.split('-').reverse().join('/') + '). Demandez sa prolongation à l’administrateur.'); }
    this.utilisateur = u;
    await this.synchroniser();
  };

  Session.prototype.connexionCleSecurite = async function () {
    var embs = this.coffre.emballages.filter(function (e) { return e.methode === 'cle'; });
    var r = await C.deballerCleSecurite(embs, v2(this));
    if (v2(this)) await ouvrirAvecPrivee(this, r.emballage.userId || T.SECOURS, r.cle); else trousseauV1(this, r.cle);
    await lireComptes(this);
    var u = this.comptes.filter(function (c) { return c.id === r.emballage.userId; })[0];
    this.utilisateur = u && u.actif ? u : { id: 'secours', login: 'secours', nom: 'Déblocage par clé de sécurité', roles: ['ADMIN'], actif: true };
    await this.synchroniser();
  };

  Session.prototype.connexionCodeSecours = async function (code) {
    var emb = this.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
    if (!emb) throw new Error('Aucun code de secours enregistré.');
    var secret;
    try { secret = await C.deballerCodeSecours(emb, code, v2(this)); } catch (e) { throw new Error('Code de secours incorrect.'); }
    if (v2(this)) await ouvrirAvecPrivee(this, T.SECOURS, secret); else trousseauV1(this, secret);
    await lireComptes(this);
    this.utilisateur = { id: 'secours', login: 'secours', nom: 'Déblocage par code de secours', roles: ['ADMIN'], actif: true };
    await this.synchroniser();
  };

  /**
   * Vérifie, sans ouvrir de session de travail, qu'un identifiant et un mot de passe (ou le code de secours,
   * `login` vide) sont ceux d'un administrateur de ce dossier. Retourne le nom de l'administrateur.
   */
  Session.verifierAdministrateur = async function (dossier, login, secret) {
    var s = new Session(dossier);
    await s.chargerCoffre();
    if (!s.coffre) throw new Error('Coffre du dossier illisible : vérification impossible.');
    try {
      if (login) {
        login = login.trim().toLowerCase();
        var embs = s.coffre.emballages.filter(function (e) { return e.methode === 'mdp' && e.login === login; });
        var ouvert = null, trouve = null;
        for (var i = 0; i < embs.length && !ouvert; i++) { try { ouvert = await C.deballerMotDePasse(embs[i], secret, v2(s)); trouve = embs[i]; } catch (e) { ouvert = null; } }
        if (!ouvert) throw new Error('Identifiant ou mot de passe incorrect.');
        if (v2(s)) await ouvrirAvecPrivee(s, trouve.userId, ouvert); else trousseauV1(s, ouvert);
        await lireComptes(s);
        var u = s.comptes.filter(function (c) { return c.id === trouve.userId; })[0];
        if (!u || !u.actif || (u.roles || []).indexOf('ADMIN') < 0) throw new Error('Ce compte n’est pas un compte administrateur actif.');
        return u.nom;
      }
      var emb = s.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
      if (!emb) throw new Error('Aucun code de secours enregistré.');
      try { await C.deballerCodeSecours(emb, secret, v2(s)); } catch (e) { throw new Error('Code de secours incorrect.'); }
      return 'code de secours';
    } finally { s.verrouiller(); }
  };

  Session.prototype.verrouiller = function () {
    // Trousseau effacé de la mémoire (octets des clés et partie privée remis à zéro)
    T.effacer(this.trousseau); if (this.privee8) this.privee8.fill(0);
    this.trousseau = null; this.privee8 = null; this.cleV1 = null;
    this.cle = null; this.utilisateur = null; this.comptes = [];
    this.donnees = null; this.cleDonnees = null; this.formation = false; oublierJournaux(this); this.preferences = null;
    this.apercu = null;
  };

  /** Relit le coffre, applique `modif`, réécrit (contrôle de révision). */
  Session.prototype.modifierCoffre = async function (modif) {
    var coffre = await this.dossier.lireCoffre();
    this.coffre = coffre;
    await lireComptes(this);
    await modif(coffre, this.comptes);
    coffre.comptes = await chiffrerComptes(this.cle, this.comptes);
    this.coffre = await this.dossier.ecrireCoffre(coffre, coffre.rev);
    var moi = this.utilisateur && this.comptes.filter(function (x) { return x.id === this.utilisateur.id; }, this)[0];
    if (moi) this.utilisateur = moi;
    this.notifier();
  };

  /** Trace dans le journal une opération sur les comptes ou les clés (sans aucun secret). */
  Session.prototype.tracer = function (action, detail) {
    return this.enregistrer('COMPTE', Object.assign({ action: action }, detail || {}), undefined, { sansControle: true, journalReel: true });
  };

  var MOTIF_LOGIN = /^[a-z0-9._-]{2,40}$/;

  /** Crée un compte. Le mot de passe est provisoire : il devra être changé à la première connexion. */
  Session.prototype.creerCompte = async function (c) {
    await this.creerComptes([c]);
  };

  /**
   * Crée plusieurs comptes en une seule écriture du coffre.
   * `liste` : [{ nom, login, roles, services, motDePasse, aleatoire? }] ; `progres(n, total)` facultatif.
   */
  Session.prototype.creerComptes = async function (liste, progres) {
    var s = this;
    liste.forEach(function (c) {
      c.login = c.login.trim().toLowerCase();
      if (!MOTIF_LOGIN.test(c.login)) throw new Error('Identifiant « ' + c.login + ' » : lettres minuscules, chiffres, point, tiret (2 à 40 caractères).');
      if (!c.nom || !c.nom.trim()) throw new Error('Nom manquant pour « ' + c.login + ' ».');
    });
    // Emballages préparés avant d'ouvrir le coffre : la fenêtre d'écriture reste courte.
    // Version 2 : une clé personnelle par compte, partie privée emballée par le mot de passe provisoire, enveloppes
    // des clés de droit selon ses droits. Version 1 : emballage de la clé de données (format d'origine).
    var prepares = [];
    for (var i = 0; i < liste.length; i++) {
      var c = liste[i], id = 'u' + id8(), it = c.aleatoire ? C.ITERATIONS_PROVISOIRE : undefined;
      var compte = { id: id, login: c.login, nom: c.nom.trim(), roles: c.roles, services: c.services || [], actif: true, mdpProvisoire: true, formation: c.formation !== false, finValidite: c.finValidite || '' };
      var agent = null, emb;
      if (v2(s)) { agent = await T.nouvelAgent(s.trousseau, s.coffre, compte, c.motDePasse, it, aDroitPour(s)); agent.privee8.fill(0); emb = agent.emballage; }
      else emb = await C.emballerMotDePasse(s.cleV1, c.motDePasse, it);
      emb.id = nouvelId(); emb.userId = id; emb.login = c.login;
      prepares.push({ compte: compte, emb: emb, agent: agent });
      if (progres) progres(i + 1, liste.length);
    }
    await this.modifierCoffre(async function (coffre, comptes) {
      prepares.forEach(function (p) {
        if (comptes.some(function (x) { return x.login === p.compte.login; })) throw new Error('L’identifiant « ' + p.compte.login + ' » existe déjà.');
      });
      prepares.forEach(function (p) {
        comptes.push(p.compte); coffre.emballages.push(p.emb);
        if (p.agent) { coffre.agents[p.compte.id] = { publique: p.agent.publique }; coffre.enveloppes = coffre.enveloppes.concat(p.agent.enveloppes); }
      });
    });
    if (prepares.length === 1) await this.tracer('CREATION', { login: prepares[0].compte.login, roles: prepares[0].compte.roles, services: prepares[0].compte.services, finValidite: prepares[0].compte.finValidite || undefined });
    else await this.tracer('CREATION_LOT', { comptes: prepares.map(function (p) { return { login: p.compte.login, roles: p.compte.roles, services: p.compte.services }; }) });
  };

  /** Modifie un compte. `formation` (facultatif) : accès au mode formation. */
  Session.prototype.modifierRoles = async function (userId, roles, actif, services, formation, finValidite) {
    var s = this;
    await this.modifierCoffre(async function (coffre, comptes) {
      var c = comptes.filter(function (x) { return x.id === userId; })[0];
      if (!c) throw new Error('Compte introuvable.');
      c.roles = roles; c.actif = actif; c.services = services || [];
      if (typeof formation === 'boolean') c.formation = formation;
      if (typeof finValidite === 'string') c.finValidite = finValidite;
      if (!actif) {
        coffre.emballages = coffre.emballages.filter(function (e) { return e.userId !== userId; });
        // Enveloppes : retirées par l'application des droits ci-dessous, qui crée alors les nouvelles générations
      }
      if (coffre.version === 2) await T.appliquerDroits(s.trousseau, coffre, comptes, aDroitPour(s));   // clés selon les droits, nouvelle génération si retrait
    });
    var c2 = this.comptes.filter(function (x) { return x.id === userId; })[0];
    await this.tracer('ROLES', { login: c2 ? c2.login : userId, roles: roles, actif: actif, services: services || [], formation: c2 ? c2.formation !== false : undefined, finValidite: c2 && c2.finValidite ? c2.finValidite : undefined });
    if (userId === this.utilisateur.id && c2) this.utilisateur = c2;
  };

  /**
   * Remplace le mot de passe d'un compte. Fait par l'administrateur pour un autre agent,
   * le mot de passe est provisoire (à changer à la connexion suivante) ; fait par l'agent
   * lui-même, il devient définitif.
   */
  Session.prototype.reinitialiserMotDePasse = async function (userId, motDePasse, options) {
    var s = this, provisoire = userId !== this.utilisateur.id, it = options && options.aleatoire ? C.ITERATIONS_PROVISOIRE : undefined;
    // Par l'agent lui-même : sa partie privée réemballée. Par l'administrateur (version 2) : il ne connaît pas la partie
    // privée de l'agent, il lui crée une nouvelle clé personnelle et lui remet de nouvelles enveloppes.
    // Premier changement par l'agent (mot de passe provisoire) : il crée sa propre clé personnelle, que l'administrateur
    // n'a jamais connue (décision du porteur) ; il se remet lui-même ses clés.
    var nouvellePaire = v2(this) && (provisoire || !!this.utilisateur.mdpProvisoire);
    var emb = v2(this) ? (nouvellePaire ? null : await C.emballerMotDePasse(s.privee8, motDePasse, it)) : await C.emballerMotDePasse(s.cleV1, motDePasse, it);
    await this.modifierCoffre(async function (coffre, comptes) {
      var c = comptes.filter(function (x) { return x.id === userId; })[0];
      if (!c) throw new Error('Compte introuvable.');
      coffre.emballages = coffre.emballages.filter(function (e) { return !(e.methode === 'mdp' && e.userId === userId); });
      if (!emb) {
        var a = await T.nouvelAgent(s.trousseau, coffre, c, motDePasse, it, aDroitPour(s));
        if (provisoire) a.privee8.fill(0); else { if (s.privee8) s.privee8.fill(0); s.privee8 = a.privee8; }
        emb = a.emballage;
        coffre.agents[userId] = { publique: a.publique };
        coffre.emballages = coffre.emballages.filter(function (e) { return e.userId !== userId; });   // clés de sécurité de l'ancienne paire
        coffre.enveloppes = coffre.enveloppes.filter(function (e) { return e.pour !== userId; }).concat(a.enveloppes);
      }
      emb.id = nouvelId(); emb.userId = userId; emb.login = c.login;
      coffre.emballages.push(emb);
      c.mdpProvisoire = provisoire;
    });
    var c3 = this.comptes.filter(function (x) { return x.id === userId; })[0];
    await this.tracer(userId === this.utilisateur.id ? 'MDP_CHANGE' : 'MDP_REINIT', { login: c3 ? c3.login : userId });
  };

  Session.prototype.changerMonMotDePasse = function (motDePasse) {
    return this.reinitialiserMotDePasse(this.utilisateur.id, motDePasse);
  };

  /** Vrai si la session détient la clé du module affiché (sinon : aucune donnée du module n'est lue). */
  Session.prototype.accesModule = function () { return accesModule(this); };

  /**
   * Applique les droits actuels aux clés (administrateur, données réelles, coffre version 2) : enveloppes à remettre
   * ou à retirer, nouvelle génération si un détenteur perd une clé. Sans effet si rien n'a changé.
   * Retourne { change, generations, maitresses }.
   */
  Session.prototype.appliquerDroits = async function () {
    var s = this, res = { change: false, generations: [], maitresses: [] };
    if (!v2(this) || this.formation || !this.trousseau || !this.trousseau[T.PLATEFORME].maitresse || !this.etat) return res;
    var coffre = await this.dossier.lireCoffre(), aDroit = aDroitPour(this);
    var essai = JSON.parse(JSON.stringify(coffre));
    await lireComptesAvec(this, coffre);
    var gens = {};
    Object.keys(coffre.cles).forEach(function (n) { gens[n] = coffre.cles[n].courante; });
    // Calcul à blanc sur une copie : le coffre n'est réécrit que s'il y a quelque chose à faire
    var jeuxCopie = {};
    Object.keys(this.trousseau).forEach(function (n) {
      var j = s.trousseau[n], o = {};
      Object.keys(j.octets).forEach(function (g) { o[g] = j.octets[g].slice(); });   // vraie copie : la copie est effacée ensuite
      jeuxCopie[n] = T.nouveauJeu(n, j.courante, o, j.maitresse && j.maitresse.slice(), j.base);
    });
    var blanc = await T.appliquerDroits(jeuxCopie, essai, this.comptes, aDroit);
    T.effacer(jeuxCopie);
    if (!blanc.change) return res;
    await this.modifierCoffre(async function (cf, comptes) { res = await T.appliquerDroits(s.trousseau, cf, comptes, aDroit); });
    if (res.generations.length) await this.tracer('GENERATION', { cles: res.generations, maitresses: res.maitresses.length ? res.maitresses : undefined, libelle: 'nouvelle génération de clé après un retrait de droit' });
    return res;
  };

  /** Comptes actifs dont le trousseau est incomplet : [{ id, nom, cles }] (administrateur, coffre version 2). */
  Session.prototype.trousseauxIncomplets = function () {
    if (!v2(this) || this.formation || !this.etat) return [];
    var s = this;
    return T.incomplets(this.coffre, this.comptes, aDroitPour(this)).map(function (x) { var c = s.comptes.filter(function (y) { return y.id === x.id; })[0]; return { id: x.id, nom: c ? c.nom : x.id, cles: x.cles }; });
  };

  /** Vrai si le coffre est encore en version 1 (clé de données unique) : migration vers le trousseau à proposer. */
  Session.prototype.migrationTrousseauPossible = function () { return !!this.coffre && !v2(this); };

  /**
   * Migration du coffre version 1 vers le trousseau (étape 4, 0.4.3). Réservée à un compte administrateur, sur les
   * données réelles. `motDePasse` : celui de l'administrateur (il le garde) ; `codeSecours` (facultatif) : le code
   * actuel, repris s'il est donné, sinon un nouveau code est créé. Aucun fichier de saisie n'est modifié ; l'ancien
   * coffre reste dans l'historique du coffre. Retourne { codeSecours (nouveau code, ou null), provisoires: [fiches] }.
   */
  Session.prototype.migrerVersTrousseau = async function (motDePasse, codeSecours) {
    var s = this;
    if (v2(this)) throw new Error('Ce dossier utilise déjà le trousseau.');
    if (this.formation) throw new Error('Quittez le mode formation pour migrer les données réelles.');
    if (!this.utilisateur || this.utilisateur.id === 'secours' || (this.utilisateur.roles || []).indexOf('ADMIN') < 0) throw new Error('Migration réservée à un compte administrateur (connexion par mot de passe).');
    var coffre = await this.dossier.lireCoffre();
    this.coffre = coffre;
    if (v2(this)) throw new Error('Ce dossier vient d’être migré depuis un autre poste : reconnectez-vous.');
    var embMdp = coffre.emballages.filter(function (e) { return e.methode === 'mdp' && e.userId === s.utilisateur.id; });
    var ok = false;
    for (var i = 0; i < embMdp.length && !ok; i++) { try { await C.deballerMotDePasse(embMdp[i], motDePasse); ok = true; } catch (e) { /* suivant */ } }
    if (!ok) throw new Error('Mot de passe incorrect.');
    var code = (codeSecours || '').trim(), nouveau = null;
    if (code) {
      var embSec = coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
      try { await C.deballerCodeSecours(embSec, code); } catch (e) { throw new Error('Code de secours incorrect : laissez le champ vide pour en créer un nouveau.'); }
    } else { code = nouveau = C.nouveauCodeSecours(); }
    await lireComptes(this);
    var r = await T.migrerCoffre(coffre, this.cleV1, this.comptes, { modules: modulesDeclares(), adminId: this.utilisateur.id, motDePasseAdmin: motDePasse, codeSecours: code, provisoire: C.nouveauMotDePasseProvisoire, id: nouvelId, aDroit: aDroitPour(this) });
    var provisoires = r.provisoires.map(function (p) { p.compte.mdpProvisoire = true; return { nom: p.compte.nom, login: p.compte.login, motDePasse: p.motDePasse, roles: p.compte.roles, services: p.compte.services || [], finValidite: p.compte.finValidite || '' }; });
    r.coffre.comptes = await chiffrerComptes(r.trousseau[T.PLATEFORME], this.comptes);
    this.coffre = await this.dossier.ecrireCoffre(r.coffre, coffre.rev);
    T.effacer(this.trousseau);
    installerTrousseau(this, r.trousseau, r.privee8);
    oublierJournaux(this);   // relecture complète avec le trousseau (l'existant est en génération 1)
    await this.synchroniser();
    await this.tracer('MIGRATION_TROUSSEAU', { libelle: 'coffre migré vers le trousseau de clés', comptes: provisoires.length + 1, nouveauCodeSecours: !!nouveau });
    return { codeSecours: nouveau, provisoires: provisoires };
  };

  /** Date de la migration vers le trousseau si l'ancien coffre (version 1) est encore dans l'historique, sinon null. */
  Session.prototype.retourAvantTrousseauPossible = async function () {
    if (!v2(this) || !this.coffre.migreLe) return null;
    var versions = await this.dossier.versionsCoffre();
    return versions.some(function (v) { return v.valide && v.coffre && v.coffre.version !== 2; }) ? this.coffre.migreLe : null;
  };

  /**
   * Retour à la clé unique : remet en place le dernier coffre version 1 de l'historique (le coffre actuel y reste).
   * Les saisies faites depuis la migration, chiffrées avec le trousseau, ne seront plus lisibles. La session est
   * fermée : reconnexion avec les mots de passe d'avant la migration.
   */
  Session.prototype.revenirAvantTrousseau = async function () {
    if (!this.utilisateur || this.utilisateur.id === 'secours' || (this.utilisateur.roles || []).indexOf('ADMIN') < 0) throw new Error('Réservé à un compte administrateur.');
    var actuel = await this.dossier.lireCoffre();
    if (!actuel || actuel.version !== 2) throw new Error('Ce dossier n’utilise pas le trousseau.');
    var v1 = (await this.dossier.versionsCoffre()).filter(function (v) { return v.valide && v.coffre && v.coffre.version !== 2; })[0];
    if (!v1) throw new Error('Aucun coffre d’avant la migration dans l’historique.');
    var c = JSON.parse(JSON.stringify(v1.coffre));
    delete c.archiveLe; c.retourTrousseauLe = new Date().toISOString();
    await this.dossier.ecrireCoffre(c, actuel.rev);
    this.verrouiller();
  };

  Session.prototype.ajouterCleSecurite = async function (libelle) {
    var s = this;
    var secret = v2(this) ? this.privee8 : this.cleV1;   // partie privée de l'agent (ou de la clé de secours en déblocage)
    if (!secret) throw new Error('Session sans clé personnelle ouverte : reconnectez-vous.');
    var emb = await C.emballerCleSecurite(secret, this.utilisateur.login, libelle);
    emb.id = 'k' + id8(); emb.userId = this.utilisateur.id === 'secours' ? null : this.utilisateur.id;
    await this.modifierCoffre(async function (coffre) { coffre.emballages.push(emb); });
    await this.tracer('CLE_AJOUT', { libelle: emb.libelle, rpId: emb.rpId });
    return s;
  };

  Session.prototype.retirerEmballage = async function (idEmb) {
    await this.modifierCoffre(async function (coffre) {
      coffre.emballages = coffre.emballages.filter(function (e) { return e.id !== idEmb; });
    });
    await this.tracer('CLE_RETRAIT', { id: idEmb });
  };

  Session.prototype.nouveauCodeSecours = async function () {
    var s = this, code = C.nouveauCodeSecours();
    if (v2(this)) {
      // Nouvelle clé de secours : clés maîtresses réenveloppées ; l'ancien code et une YubiKey de secours n'ouvrent plus rien
      await this.modifierCoffre(async function (coffre) { await T.nouveauSecours(s.trousseau, coffre, code, nouvelId()); });
    } else {
      var emb = await C.emballerCodeSecours(this.cleV1, code);
      emb.id = nouvelId(); emb.userId = null;
      await this.modifierCoffre(async function (coffre) {
        coffre.emballages = coffre.emballages.filter(function (e) { return e.methode !== 'secours'; }).concat([emb]);
      });
    }
    await this.tracer('CODE_SECOURS', {});
    return code;
  };

  // ---------------------------------------------------------- Journal
  /** Rôles de l'utilisateur : les mêmes dans les données réelles et dans le jeu de formation. */
  Session.prototype.roles = function () { var c = this.compteEffectif(); return c ? c.roles : []; };
  /** Codes des services visibles (tous pour un administrateur). */
  Session.prototype.mesServices = function () { return this.etat ? D().servicesDe(this.compteEffectif(), this.etat.config) : []; };

  // ---------------------------------------------------------- Aperçu de l'affichage d'un rôle (administrateur)
  /**
   * L'administrateur voit l'outil comme un agent portant le rôle `code` (onglets, boutons, journal), sur tous les
   * services. Rien n'est enregistré pendant l'aperçu (voir `enregistrer`) ; il cesse au verrouillage. null = fin.
   */
  Session.prototype.definirApercu = function (code) {
    if (!code) { this.apercu = null; return; }
    if (!this.utilisateur || (this.utilisateur.roles || []).indexOf('ADMIN') < 0) throw new Error('Réservé à l’administrateur.');
    var cfg = config(this);
    var r = D().rolesConfig(cfg).filter(function (x) { return x.code === code && !x.admin; })[0];
    if (!r) throw new Error('Rôle inconnu : ' + code);
    this.apercu = { code: code, libelle: r.libelle };
  };
  /** Compte tel que l'interface doit le traiter : le compte connecté, ou le rôle en aperçu (tous les services). */
  Session.prototype.compteEffectif = function () {
    if (!this.utilisateur) return null;
    if (!this.apercu) return this.utilisateur;
    var cfg = config(this);
    return Object.assign({}, this.utilisateur, { roles: [this.apercu.code], services: (cfg.services || []).map(function (s) { return s.code; }) });
  };
  Session.prototype.accesFormation = function () { return Droits.accesFormation(this.utilisateur); };
  Session.prototype.peut = function (type) { return D().peut(this.roles(), type, config(this)); };

  Session.prototype.nomAuteur = function (userId) {
    var c = this.comptes.filter(function (x) { return x.id === userId; })[0];
    return c ? c.nom : (userId === 'secours' ? 'Compte de secours' : userId === 'demo' ? 'Données fictives' : userId);
  };

  /**
   * Enregistre une saisie dans le jeu de données actif. `base` = version de la mesure au moment de la saisie.
   * `options.journalReel` : la saisie va toujours dans le journal des données réelles (traces des comptes),
   * même pendant le mode formation ; elle n'apparaît alors pas dans le jeu de formation.
   */
  Session.prototype.enregistrer = async function (type, data, base, options) {
    if (options && options.journalReel && this.formation) {
      var at0 = new Date().toISOString(), by0 = this.utilisateur.id;
      var trace = { v: 1, id: SIC.horodatageCompact(at0) + '_' + by0 + '_' + id8(), at: at0, by: by0, type: type, data: data, prec: null };
      await (await this.dossier.journal(SOCLE, true)).ecrireEvenement(this.cle, trace);   // journal du socle des données réelles
      return trace;
    }
    // Aperçu d'un rôle : rien n'est enregistré (seules les traces techniques des opérations réellement faites passent)
    if (this.apercu && type !== 'COMPTE') throw new Error('Aperçu de l’affichage du rôle « ' + this.apercu.libelle + ' » : aucune saisie n’est enregistrée. Revenez à votre affichage (liste « Affichage » en haut de l’écran) pour saisir.');
    if (!(options && options.sansControle) && !this.peut(type)) throw new Error("Votre rôle ne permet pas cette action.");
    if (!(options && options.sansControle)) controlerActivation(this, type, data);
    var at = (options && options.at) || new Date().toISOString();
    var by = (options && options.by) || this.utilisateur.id;
    var j = journalPour(journaux(this), type, data), d = await dossierJournal(this, j, true);
    var mesUns = j.evts.filter(function (e) { return e.by === by; });   // chaînage et repère : propres à chaque journal
    var evt = {
      v: 1,
      id: SIC.horodatageCompact(at) + '_' + by + '_' + id8(),
      at: at, by: by, type: type, data: data,
      prec: mesUns.length ? mesUns[mesUns.length - 1].id : null
    };
    if (typeof base === 'number') evt.base = base;
    await d.ecrireEvenement(j.cle, evt);
    j.connus.add(evt.id + '.enc');
    j.evts.push(evt);
    this.evts.push(evt);
    // Repère d'intégrité de l'agent (par journal) : permet de détecter la disparition de ses dernières saisies.
    // Le compteur ne recule jamais : un poste qui ne voit pas une saisie perdue ne doit pas effacer l'écart.
    if (j.reperesLus[by] === undefined) {
      var lu = await d.lireRepere(j.cle, by);
      j.reperesLus[by] = (lu && lu.n) || 0;
    }
    var n = Math.max(mesUns.length, j.reperesLus[by] || 0) + 1;
    j.reperesLus[by] = n;
    try { await d.ecrireRepere(j.cle, by, { n: n, dernier: evt.id, at: at }); } catch (e) { /* sans conséquence sur la saisie */ }
    this.recalculer();
    // Réglages qui changent les droits (rôles, services, activation des modules), annulations, imports : clés à jour
    if (v2(this) && !this.formation && (type === 'CONFIG' || type === 'ANNULATION' || type === 'LOT') && this.trousseau[T.PLATEFORME].maitresse) {
      try { await this.appliquerDroits(); } catch (e) { this.erreurDroits = e.message; }
    }
    return evt;
  };

  // ---------------------------------------------------------- Exports
  /**
   * Enregistre un export (PDF, CSV) dans le dossier des exports du jeu de données actif (réglage
   * `config.exports.dossier`, « exports » par défaut), sous-dossier `categorie`. Tracé au journal
   * (nom du fichier) sauf `options.sansTrace` (export déjà tracé par ailleurs). Retourne le chemin relatif.
   */
  Session.prototype.exporter = async function (categorie, nom, octets, options) {
    var d = dossierActif(this), dossier = X.dossierExports(config(this));
    var chemin = await d.ecrireExport(dossier, [X.dossierExportService(options && options.service), categorie], nom, octets);
    if (!(options && options.sansTrace)) { try { await this.tracer('EXPORT', { libelle: chemin }); } catch (e) { /* sans conséquence sur l'export */ } }
    return chemin;
  };
  Session.prototype.listerExports = function () {
    return dossierActif(this).listerExports(X.dossierExports(config(this)));
  };
  Session.prototype.lireExport = function (chemin) { return dossierActif(this).lireExport(chemin); };

  /**
   * Purge des exports selon la durée de conservation réglée par l'administrateur (`config.exports.conservationJours`).
   * `options.simulation` : liste seulement. Sinon supprime les fichiers trop anciens et trace la purge au journal
   * (règle de l'établissement appliquée à la connexion de n'importe quel agent, ou par l'administrateur).
   * Retourne la liste des fichiers concernés.
   */
  Session.prototype.purgerExports = async function (options) {
    var cfg = config(this), o = X.optionsExports(cfg);
    var maintenant = (options && options.maintenant) || Date.now();
    var jours = options && options.conservationJours !== undefined ? options.conservationJours : o.conservationJours;
    var cibles = X.exportsAPurger(await this.listerExports(), jours, maintenant);
    if ((options && options.simulation) || !cibles.length) return cibles;
    var d = dossierActif(this), faits = [];
    for (var i = 0; i < cibles.length; i++) { try { await d.supprimerExport(cibles[i].chemin); faits.push(cibles[i]); } catch (e) { /* fichier déjà supprimé ou verrouillé */ } }
    if (faits.length) await this.tracer('PURGE_EXPORTS', { libelle: faits.length + ' fichier(s) de plus de ' + jours + ' jours supprimé(s) du dossier « ' + o.dossier + ' »' });
    return faits;
  };
  Session.prototype.supprimerExport = async function (chemin) {
    if (!this.peut('CONFIG')) throw new Error('Réservé à l’administrateur.');
    await dossierActif(this).supprimerExport(chemin);
    await this.tracer('EXPORT_SUPPRIME', { libelle: chemin });
  };

  // ---------------------------------------------------------- Préférences de l'agent
  /**
   * Préférences d'affichage de l'agent connecté (thème clair ou sombre…), rangées avec les données réelles
   * (même en mode formation) : elles le suivent d'un poste à l'autre. Rien n'est écrit au journal.
   */
  Session.prototype.lirePreferences = async function () {
    if (!this.utilisateur || !this.cle) return {};
    this.preferences = await this.dossier.lirePreferences(this.cle, this.utilisateur.id);
    return this.preferences;
  };

  Session.prototype.enregistrerPreference = async function (cle, valeur) {
    if (!this.utilisateur || !this.cle) return;
    var p = Object.assign({}, this.preferences || await this.dossier.lirePreferences(this.cle, this.utilisateur.id));
    p[cle] = valeur; p.modifieLe = new Date().toISOString();
    await this.dossier.ecrirePreferences(this.cle, this.utilisateur.id, p);
    this.preferences = p;
  };

  // ---------------------------------------------------------- Intégrité et copies
  /**
   * Contrôle d'intégrité du jeu de données actif : repères des agents (nombre de saisies et dernière
   * saisie attendus), saisies chargées qui ne sont plus sur le partage, fichiers illisibles, maillons
   * manquants du chaînage. Les anomalies dont l'administrateur a pris acte sont écartées (N.filtrerIntegrite).
   * Retourne { verifieLe, reperes: [], disparus: [], illisibles, fichiersIllisibles: [], manquants,
   * listeManquants: [], acquis }.
   */
  Session.prototype.verifierIntegrite = async function () {
    var s = this, js = journaux(this), etat = this.etat || { manquants: [], manquantsAcquis: [] };
    var journalDe = {};
    js.forEach(function (j) { j.evts.forEach(function (e) { journalDe[e.id] = j.nom; }); });
    var res = { verifieLe: Date.now(), reperes: [], disparus: [],
      fichiersIllisibles: this.rejetes.map(function (r) { return { nom: r.nom, journal: r.journal, chemin: prefixeJournal(s, r.journal) + (r.chemin || N.cheminEvenement(r.nom)), raison: r.raison || '', taille: r.taille }; }),
      listeManquants: etat.manquants.map(function (x) { return { id: x.manque, chemin: prefixeJournal(s, journalDe[x.evt]) + N.cheminEvenement(x.manque + '.enc'), by: x.by, suivant: x.evt }; }),
      manquantsAcquis: (etat.manquantsAcquis || []).length };
    res.manquants = res.listeManquants.length;
    // Contrôle journal par journal : repères des agents et fichiers chargés encore présents sur le partage
    for (var k = 0; k < js.length; k++) {
      var j = js[k], d = await dossierJournal(this, j, false);
      if (!d) continue;
      var ids = {};
      j.evts.forEach(function (e) { ids[e.id] = e.by; });
      (await d.lireReperes(j.cle)).forEach(function (r) {
        var cle = js.length > 1 ? j.nom : undefined;
        if (r.illisible) { res.reperes.push({ journal: cle, agent: r.agent, illisible: true }); return; }
        j.reperesLus[r.agent] = Math.max(j.reperesLus[r.agent] || 0, r.n || 0);
        var n = j.evts.filter(function (e) { return e.by === r.agent; }).length;
        if (!ids[r.dernier] || n < r.n) res.reperes.push({ journal: cle, agent: r.agent, attendu: r.n, present: n, dernier: r.dernier, dernierManquant: !ids[r.dernier], dernierLe: r.at });
      });
      var surPartage = await d.nomsEvenements();
      j.connus.forEach(function (nom) { if (!surPartage.has(nom)) res.disparus.push(nom); });
    }
    res = N.filtrerIntegrite(res, etat.integrite);
    this.integrite = res;
    return res;
  };

  /** Vrai si le dernier contrôle a relevé une anomalie non prise en compte. */
  Session.prototype.anomaliesIntegrite = function () {
    var r = this.integrite;
    return !!r && !!(r.reperes.length || r.disparus.length || r.illisibles || r.manquants);
  };

  /**
   * Répare le dossier des données réelles depuis une copie de sauvegarde complète : seuls les fichiers
   * absents ou illisibles sont remis, après vérification qu'ils s'ouvrent avec la clé actuelle ;
   * les fichiers illisibles remplacés passent en quarantaine. Relit le dossier, refait le contrôle,
   * trace l'opération au journal. Retourne le rapport de store.reparerDepuisCopie.
   */
  Session.prototype.reparerDepuisCopie = async function (copie) {
    if (this.formation) throw new Error('Réparation possible seulement sur les données réelles (quittez le mode formation).');
    if (!this.peut('INTEGRITE')) throw new Error('Réservé à l’administrateur.');
    var jeux = [this.cle, jeuModule(this)], illisibles = new Set(this.rejetes.map(function (r) { return r.nom; }));
    var rapport = await this.dossier.reparerDepuisCopie(copie, illisibles, async function (nom, octets) {
      for (var i = 0; i < jeux.length; i++) {   // saisie du socle ou du module : vérifiée avec la clé actuelle
        try { var e = await C.dechiffrerJSON(jeux[i], octets, 'evt:' + nom); if (e && e.id + '.enc' === nom) return true; } catch (err) { /* autre clé */ }
      }
      return false;
    });
    var charges = {};
    this.evts.forEach(function (e) { charges[e.id + '.enc'] = true; });
    var remis = new Set(rapport.remis.map(function (c) { return c.split('/').pop(); }));
    journaux(this).forEach(function (j) {
      remis.forEach(function (nom) { if (!charges[nom]) j.connus.delete(nom); });
      j.rejetes = j.rejetes.filter(function (r) { return !remis.has(r.nom); });
    });
    this.rejetes = this.rejetes.filter(function (r) { return !remis.has(r.nom); });
    if (rapport.remis.length || rapport.invalides.length) await this.tracer('REPARATION', { libelle: rapport.remis.length + ' fichier(s) remis depuis la copie du ' + (copie.creeLe ? copie.creeLe.slice(0, 10) : '?') + (rapport.invalides.length ? ', ' + rapport.invalides.length + ' refusé(s)' : '') });
    await this.synchroniser();
    await this.verifierIntegrite();
    return rapport;
  };

  /** Met en quarantaine les fichiers illisibles désignés (noms), tracé au journal. Retourne les chemins de destination. */
  Session.prototype.mettreEnQuarantaine = async function (noms) {
    if (!this.peut('INTEGRITE')) throw new Error('Réservé à l’administrateur.');
    var voulus = new Set(noms), faits = [], s = this, js = journaux(this);
    for (var i = 0; i < this.rejetes.length; i++) {
      var r = this.rejetes[i];
      if (!voulus.has(r.nom)) continue;
      var j = js.filter(function (x) { return x.nom === r.journal; })[0] || js[js.length - 1];
      var d = await dossierJournal(this, j, false);
      faits.push({ nom: r.nom, vers: prefixeJournal(this, j.nom) + await d.mettreEnQuarantaine(r.chemin || N.cheminEvenement(r.nom)) });
    }
    var ecartes = new Set(faits.map(function (f) { return f.nom; }));
    this.rejetes = this.rejetes.filter(function (r) { return !ecartes.has(r.nom); });
    js.forEach(function (j) {   // jamais chargés : ne pas les signaler comme disparus
      j.rejetes = j.rejetes.filter(function (r) { return !ecartes.has(r.nom); });
      ecartes.forEach(function (nom) { j.connus.delete(nom); });
    });
    if (faits.length) await this.tracer('QUARANTAINE', { libelle: faits.length + ' fichier(s) illisible(s) mis en quarantaine : ' + faits.map(function (f) { return f.nom; }).join(', ') });
    await s.verifierIntegrite();
    return faits;
  };

  /**
   * Prise d'acte, par l'administrateur, des anomalies du dernier contrôle (récupération impossible) :
   * saisie INTEGRITE avec motif obligatoire. Les anomalies listées ne déclenchent plus d'alerte ;
   * une anomalie nouvelle en déclenche une.
   */
  Session.prototype.prendreActeIntegrite = async function (motif) {
    motif = String(motif || '').trim();
    if (!motif) throw new Error('Le motif est obligatoire.');
    var r = await this.verifierIntegrite();
    if (!this.anomaliesIntegrite()) throw new Error('Aucune anomalie à prendre en compte.');
    var ids = {};
    r.listeManquants.forEach(function (x) { ids[x.id] = true; });
    r.disparus.forEach(function (nom) { ids[nom.replace(/\.enc$/, '')] = true; });
    var data = {
      motif: motif,
      reperes: r.reperes.map(function (x) { return x.illisible ? { journal: x.journal, agent: x.agent, illisible: true } : { journal: x.journal, agent: x.agent, ecart: Math.max(0, x.attendu - x.present), dernier: x.dernierManquant ? x.dernier : '' }; }),
      manquants: Object.keys(ids),
      fichiers: r.fichiersIllisibles.map(function (f) { return f.nom; })
    };
    var evt = await this.enregistrer('INTEGRITE', data);
    await this.verifierIntegrite();
    return evt;
  };

  /**
   * Copie du coffre à conserver sous scellé avec le code de secours : sans les mots de passe des agents
   * (ils seraient à réinitialiser après une restauration), avec le code de secours et les clés de sécurité.
   * La date et le code de secours couverts sont notés dans le coffre.
   */
  Session.prototype.copieSousScelle = async function () {
    var secours = this.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
    if (!secours) throw new Error('Aucun code de secours enregistré.');
    var creeLe = new Date().toISOString();
    await this.modifierCoffre(async function (coffre) { coffre.scelle = { creeLe: creeLe, secours: secours.id }; });
    var copie = JSON.parse(JSON.stringify(this.coffre));
    copie.emballages = copie.emballages.filter(function (e) { return e.methode !== 'mdp'; });
    copie.copieSousScelle = creeLe;
    await this.tracer('SCELLE', { libelle: 'copie du coffre sous scellé' });
    return copie;
  };

  /** État de la copie sous scellé : { creeLe, aJour } (à refaire si le code de secours a été renouvelé). */
  Session.prototype.etatScelle = function () {
    var sc = this.coffre && this.coffre.scelle, secours = this.coffre && this.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
    if (!sc) return null;
    return { creeLe: sc.creeLe, aJour: !!secours && sc.secours === secours.id };
  };

  /** Copie de sauvegarde complète (coffre et saisies chiffrées), tracée au journal. */
  Session.prototype.copieComplete = async function () {
    var copie = await this.dossier.copieComplete();
    await this.tracer('SAUVEGARDE', { libelle: copie.fichiers.length + ' fichiers de saisie' });
    return copie;
  };

  /** Date de la dernière copie de sauvegarde complète (journal), ou null. */
  Session.prototype.derniereCopie = function () {
    var t = null;
    this.evts.forEach(function (e) { if (e.type === 'COMPTE' && e.data && e.data.action === 'SAUVEGARDE' && (!t || e.at > t)) t = e.at; });
    return t ? Date.parse(t) : null;
  };

  /** Enregistre plusieurs saisies dans un seul fichier (import, données de démonstration). */
  Session.prototype.enregistrerLot = function (evenements, options) {
    return this.enregistrer('LOT', { evenements: evenements, libelle: (options && options.libelle) || '' }, undefined, options);
  };

  Session.prototype.recalculer = function (info) {
    this.etat = moduleActif().saisies.reduire(this.evts);
    this.notifier(info);
  };

  Session.prototype.synchroniser = async function () {
    if (!this.cle) return 0;
    if (this.derniereSynchro && Date.now() - (this.dernierCoffre || 0) > 60000) {
      this.dernierCoffre = Date.now();
      try {
        var coffre = await this.dossier.lireCoffre();
        if (coffre && this.coffre && coffre.version !== this.coffre.version) {
          // Coffre migré vers le trousseau depuis un autre poste : l'ancienne clé n'ouvre plus les comptes
          this.verrouiller();
          this.notifier({ source: 'verrou', message: 'Le dossier a été migré vers le trousseau de clés depuis un autre poste : reconnectez-vous.' });
          return 0;
        }
        if (coffre && this.coffre && coffre.rev !== this.coffre.rev && v2(this) && !this.formation && this.privee8) {
          // Coffre modifié ailleurs (droits, générations) : trousseau rouvert ; accès retiré ou clés changées → verrouillage
          var pour = this.utilisateur.id === 'secours' ? T.SECOURS : this.utilisateur.id;
          var cleChangee = !coffre.agents[pour] || (this.coffre.agents[pour] && coffre.agents[pour].publique !== this.coffre.agents[pour].publique);
          var t = cleChangee ? null : await T.ouvrir(coffre, pour, await C.importerPrivee(this.privee8));
          if (!t || !(await t[T.PLATEFORME].cle(t[T.PLATEFORME].courante))) {
            if (t) T.effacer(t);
            this.verrouiller();
            this.notifier({ source: 'verrou', message: cleChangee ? 'Vos clés ont été renouvelées par l’administrateur : reconnectez-vous.' : 'Votre accès a été retiré ou vos clés ne sont plus à jour : reconnectez-vous ou adressez-vous à l’administrateur.' });
            return 0;
          }
          var avaitModule = accesModule(this), ancien = this.trousseau;
          this.trousseau = t; this.cle = t[T.PLATEFORME];
          T.effacer(ancien);
          if (avaitModule !== accesModule(this)) oublierJournaux(this);
          else (this.journauxActifs || []).forEach(function (j) { j.cle = j.nom === SOCLE ? t[T.PLATEFORME] : (t[j.nom] || j.cle); });
        }
        if (coffre && this.coffre && coffre.rev !== this.coffre.rev) {
          var jeuChange = this.formation && JSON.stringify(coffre.formation || null) !== JSON.stringify(this.coffre.formation || null);
          this.coffre = coffre; await lireComptes(this);
          var moi = this.utilisateur && this.comptes.filter(function (c) { return c.id === this.utilisateur.id; }, this)[0];
          if (moi) this.utilisateur = moi;
          if (this.formation && !this.accesFormation()) { await this.fermerFormation(); return 0; }
          if (jeuChange) {   // jeu de formation régénéré ou supprimé depuis un autre poste
            if (coffre.formation && this.accesFormation()) { await this.ouvrirFormation(); return 0; }
            await this.fermerFormation(); return 0;
          }
        }
      } catch (e) { /* coffre momentanément illisible : nouvelle tentative plus tard */ }
    }
    var js = journaux(this), nouveaux = [];
    for (var k = 0; k < js.length; k++) {
      var j = js[k], d = await dossierJournal(this, j, false);
      if (!d) continue;   // journal pas encore créé (aucune saisie)
      var r = await d.lireNouveaux(j.cle, j.connus);
      // Fichiers illisibles : liste tenue à jour à chaque lecture (un fichier relu avec succès en sort)
      var lus = {}; r.evenements.forEach(function (e) { lus[e.id + '.enc'] = true; });
      var parNom = {}; j.rejetes.forEach(function (x) { if (!lus[x.nom]) parNom[x.nom] = x; });
      r.rejetes.forEach(function (x) { var a = parNom[x.nom]; x.essais = (a && a.essais || 0) + 1; x.journal = j.nom; parNom[x.nom] = x; });
      j.rejetes = Object.keys(parNom).map(function (n) { return parNom[n]; });
      j.evts = j.evts.concat(r.evenements);
      nouveaux = nouveaux.concat(r.evenements);
    }
    this.rejetes = [].concat.apply([], js.map(function (x) { return x.rejetes; }));
    this.derniereSynchro = Date.now();
    if (nouveaux.length || !this.etat) {
      this.evts = this.evts.concat(nouveaux);
      this.recalculer({ source: 'synchro', nouveaux: nouveaux.length });
    } else this.notifier({ source: 'synchro', nouveaux: 0 });
    return nouveaux.length;
  };

  // ------------------------------------------- Dossier de secours (miroir) et déplacement
  /**
   * Vérifie qu'un dossier peut servir de dossier de secours : vide, ou copie des mêmes données (même coffre d'origine).
   * Retourne 'vide' ou 'meme'.
   */
  Session.prototype.controlerMiroir = async function (autre) {
    if (await this.dossier.memeQue(autre)) throw new Error('C’est le dossier des données lui-même : choisissez un dossier sur un autre partage ou un autre serveur.');
    var coffre = await autre.lireCoffre();
    if (coffre) {
      if (coffre.creeLe !== this.coffre.creeLe) throw new Error('Ce dossier contient d’autres données (autre établissement, autre service ou jeu de démonstration) : choisissez un dossier vide.');
      return 'meme';
    }
    if (autre.coffreIllisible) throw new Error('Ce dossier contient un coffre illisible : choisissez un dossier vide.');
    for await (var k of autre.handle.keys()) { if (k !== 'miroir-etat.json') throw new Error('Ce dossier n’est pas vide : choisissez un dossier vide (ou un dossier de secours de ces mêmes données).'); }
    return 'vide';
  };
  /** Synchronise le dossier des données et le dossier de secours ; relit les saisies venues du secours. */
  Session.prototype.synchroniserMiroir = async function (miroir, options) {
    options = options || {};
    if (!this.cle || !this.coffre) throw new Error('Session fermée.');
    await this.controlerMiroir(miroir);
    var r = await this.dossier.synchroniserAvec(miroir, { type: options.type, poste: options.poste || (this.utilisateur && this.utilisateur.nom) || '' });
    if (r.depuisAutre) {
      try { await this.tracer('MIROIR_REPRISE', { libelle: r.depuisAutre + ' fichier(s) repris du dossier de secours « ' + miroir.nom + ' »' }); } catch (e) { /* trace facultative */ }
      if (r.coffre === 'depuis') { this.coffre = await this.dossier.lireCoffre(); await lireComptes(this); }
      await this.synchroniser();
    }
    if (options.tracer || r.coffre === 'conflit') { try { await this.tracer('MIROIR', { libelle: 'Synchronisation avec « ' + miroir.nom + ' » : ' + r.versAutre + ' fichier(s) copié(s)' + (r.coffre === 'conflit' ? ' ; coffres différents de même révision, celui du dossier principal retenu' : '') }); } catch (e) { /* trace facultative */ } }
    return r;
  };
  /** Déplace toutes les données vers `cible` (vide) ; ce dossier est ensuite marqué « déplacé » et ne s'ouvre plus. */
  Session.prototype.deplacerDonnees = async function (cible, progres) {
    if (!this.peut('CONFIG')) throw new Error('Réservé à l’administrateur.');
    if (this.formation) throw new Error('Quittez le mode formation avant de déplacer les données.');
    if (await this.dossier.memeQue(cible)) throw new Error('Choisissez un autre dossier que le dossier actuel.');
    await this.tracer('DEPLACEMENT', { libelle: 'Données déplacées de « ' + this.dossier.nom + ' » vers « ' + cible.nom + ' »' });
    return this.dossier.deplacerVers(cible, { par: this.utilisateur.nom, progres: progres });
  };

  // ---------------------------------------------------------- Mode formation
  /*
   * Le jeu de formation est un second jeu de données, entièrement fictif, rangé dans le
   * sous-dossier « formation » du dossier principal, chiffré avec sa propre clé. Cette clé est
   * conservée dans le coffre, chiffrée par la clé des données réelles : seul un agent connecté
   * avec son vrai compte peut l'ouvrir, avec ses vrais rôles et services. À la connexion, chaque
   * agent dont l'accès au mode formation n'a pas été désactivé choisit entre les données réelles
   * et le jeu de formation. Les comptes, mots de passe et clés restent ceux du coffre réel.
   */
  Session.prototype.jeuFormation = function () { return (this.coffre && this.coffre.formation) || null; };

  /**
   * Crée le jeu de formation (première ouverture par un agent) ou le recrée en effaçant
   * l'ancien (administrateur), à partir des saisies fictives fournies.
   */
  Session.prototype.creerFormation = async function (saisies, libelle) {
    var admin = this.roles().indexOf('ADMIN') >= 0;
    if (!(admin || (this.accesFormation() && !this.jeuFormation()))) throw new Error('Seul un administrateur peut régénérer le jeu de formation.');
    if (this.formation) throw new Error('Revenez d’abord aux données réelles.');
    var s = this;
    var handle = await this.dossier.sousDossier(cheminFormation(), true);
    var df = new SIC.Dossier(handle, 'formation');
    await df.vider();
    await df.ecrireFichier(handle, 'FORMATION-LISEZMOI.txt', new TextEncoder().encode(
      'Jeu de données FICTIVES de Tessera Santé (module ' + (moduleActif().libelle || 'Isocont') + '), utilisé pour la formation et les tests.\r\n' +
      'Ne pas ouvrir ce dossier comme dossier principal. Il peut être supprimé sans perte de données réelles :\r\n' +
      'le formateur le recrée depuis l’application (bouton « Mode formation »).\r\n'));
    var cle = await C.nouvelleCleDonnees();
    var at = new Date().toISOString();
    var lot = { v: 1, id: SIC.horodatageCompact(at) + '_' + this.utilisateur.id + '_' + id8(), at: at, by: this.utilisateur.id, type: 'LOT', data: { evenements: saisies, libelle: libelle || 'Jeu de formation' }, prec: null };
    await df.ecrireEvenement(cle, lot);
    var protege = C.b64(await C.chiffrerJSON(jeuModule(this), { k: await C.exporterCle(cle) }, 'formation'));   // sous la clé du module
    await this.modifierCoffre(async function (coffre) {
      coffre.formation = { cle: protege, creeLe: at, par: s.utilisateur.nom };
    });
    await this.tracer('FORMATION_CREEE', { saisies: saisies.length });
  };

  /**
   * Bascule la session sur le jeu de formation. `generer(config)` fournit les saisies fictives
   * si le jeu n'existe pas encore (il est alors créé à partir du paramétrage réel).
   */
  Session.prototype.ouvrirFormation = async function (generer) {
    if (!this.accesFormation()) throw new Error('L’accès au mode formation est désactivé pour ce compte.');
    if (!this.jeuFormation()) this.coffre = await this.dossier.lireCoffre();
    if (!this.jeuFormation()) {
      if (!generer) throw new Error('Le jeu de formation n’existe pas encore.');
      await this.creerFormation(generer(this.etat.config), 'Jeu de formation (données fictives)');
    }
    var jeu = this.jeuFormation();
    var o = await C.dechiffrerJSON(jeuModule(this), C.deb64(jeu.cle), 'formation');
    this.cleDonnees = await C.importerCle(o.k);
    this.donnees = new SIC.Dossier(await this.dossier.sousDossier(cheminFormation(), false), 'formation');
    this.formation = true;
    oublierJournaux(this);
    await this.synchroniser();
  };

  /** Revient aux données réelles. */
  Session.prototype.fermerFormation = async function () {
    this.donnees = null; this.cleDonnees = null; this.formation = false;
    oublierJournaux(this);
    await this.synchroniser();
  };

  SIC.Session = Session;
})(typeof self !== 'undefined' ? self : this);
