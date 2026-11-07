// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — trousseau de clés (étape 4 du plan d'architecture, docs/architecture.md § 4).
 *
 * Coffre version 2 :
 *   agents      { <id compte> | 'secours': { publique } }       parties publiques ECDH P-256, en clair
 *   emballages  [{ methode: 'mdp' | 'cle' | 'secours', userId, … cle }]  partie privée d'un agent (userId) ou de la clé
 *               de secours (userId null : code de secours, YubiKey de secours), emballée par ce moyen
 *   cles        { plateforme: { courante, origine? }, <module>: { … } }   génération en cours de chaque clé de droit ;
 *               origine : la génération 1 est l'ancienne clé de données d'un coffre migré (non tirée de la clé maîtresse)
 *   enveloppes  [{ cle, g, pour, eph, sel, ct }]   g = numéro de génération, ou 'm' pour la clé maîtresse ;
 *               pour = id du compte ou 'secours'
 *   comptes     chiffrés par la clé de plateforme
 *
 * Un « jeu » est la forme en mémoire d'une clé de droit : { nom, courante, cle(g) } ; crypto.js l'accepte partout
 * où il attend une clé (écriture avec la génération courante, lecture d'après l'en-tête du fichier).
 * Version 0.4.2 : tous les comptes reçoivent toutes les clés de droit ; les administrateurs et la clé de secours
 * reçoivent aussi les clés maîtresses. La remise selon les rôles vient en 0.4.4.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crypto.js'));
  else (root.SIC = root.SIC || {}).trousseau = factory(root.SIC.crypto);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var PLATEFORME = 'plateforme', SECOURS = 'secours';

  function contexte(cle, g, pour) { return cle + ':' + g + ':' + pour; }

  /** Jeu d'une clé de droit en mémoire : octets des générations reçues, ou clé maîtresse (toutes les générations). */
  function nouveauJeu(nom, courante, octets, maitresse) {
    var cache = {};
    var jeu = {
      nom: nom, courante: courante, octets: octets || {}, maitresse: maitresse || null,
      /** Clé AES-GCM d'une génération (null si elle n'a pas été remise). */
      cle: async function (g) {
        if (cache[g]) return cache[g];
        var o = jeu.octets[g] || (jeu.maitresse && g >= 1 ? await C.octetsGeneration(jeu.maitresse, nom, g) : null);
        if (!o) return null;
        jeu.octets[g] = o;
        cache[g] = await C.importerCleOctets(o);
        return cache[g];
      },
      /** Octets d'une génération, pour la remettre à un autre agent (null si absente). */
      octetsDe: async function (g) {
        if (jeu.octets[g]) return jeu.octets[g];
        if (!jeu.maitresse) return null;
        jeu.octets[g] = await C.octetsGeneration(jeu.maitresse, nom, g);
        return jeu.octets[g];
      },
      effacer: function () {
        Object.keys(jeu.octets).forEach(function (g) { jeu.octets[g].fill(0); });
        if (jeu.maitresse) jeu.maitresse.fill(0);
        jeu.octets = {}; jeu.maitresse = null; cache = {};
      }
    };
    return jeu;
  }

  /** Coffre version 1 (clé de données unique) : un jeu qui écrit au format d'origine et lit la génération 1. */
  function jeuV1(cleDonnees) {
    return { nom: 'v1', courante: null, v1: true, cle: async function (g) { return g === 1 ? cleDonnees : null; }, effacer: function () {} };
  }

  /** Droits d'un compte en clés : 0.4.2, toutes les clés ; clés maîtresses pour l'administrateur. */
  function droitsDe(coffre, compte) {
    return { cles: Object.keys(coffre.cles), maitresses: !!compte && (compte.roles || []).indexOf('ADMIN') >= 0 };
  }

  /**
   * Enveloppes à remettre au détenteur `pour` (partie publique `publique`) : toutes les générations des clés de
   * `droits.cles`, et les clés maîtresses si `droits.maitresses`. Le trousseau de l'auteur doit les détenir.
   */
  async function enveloppesPour(trousseau, coffre, pour, publique, droits) {
    var res = [];
    for (var i = 0; i < droits.cles.length; i++) {
      var nom = droits.cles[i], jeu = trousseau[nom], courante = coffre.cles[nom].courante;
      if (!jeu) throw new Error('Clé « ' + nom + ' » absente de votre trousseau : remise impossible.');
      for (var g = 1; g <= courante; g++) {
        var o = await jeu.octetsDe(g);
        if (!o) throw new Error('Génération ' + g + ' de la clé « ' + nom + ' » absente de votre trousseau : remise impossible.');
        res.push(Object.assign({ cle: nom, g: g, pour: pour }, await C.envelopper(o, publique, contexte(nom, g, pour))));
      }
      if (droits.maitresses) {
        if (!jeu.maitresse) throw new Error('Seul un administrateur peut remettre la clé maîtresse « ' + nom + ' ».');
        res.push(Object.assign({ cle: nom, g: 'm', pour: pour }, await C.envelopper(jeu.maitresse, publique, contexte(nom, 'm', pour))));
      }
    }
    return res;
  }

  /**
   * Enveloppes de la clé de secours : clés maîtresses (toutes les générations s'en déduisent) et, pour un coffre
   * migré, la génération d'origine (ancienne clé de données), qui ne se déduit pas de la clé maîtresse.
   */
  async function enveloppesSecours(trousseau, coffre, publique) {
    var res = [], noms = Object.keys(coffre.cles);
    for (var i = 0; i < noms.length; i++) {
      var nom = noms[i], jeu = trousseau[nom];
      if (!jeu || !jeu.maitresse) throw new Error('Seul un administrateur peut préparer la clé de secours.');
      res.push(Object.assign({ cle: nom, g: 'm', pour: SECOURS }, await C.envelopper(jeu.maitresse, publique, contexte(nom, 'm', SECOURS))));
      if (coffre.cles[nom].origine) {
        var o = await jeu.octetsDe(1);
        res.push(Object.assign({ cle: nom, g: 1, pour: SECOURS }, await C.envelopper(o, publique, contexte(nom, 1, SECOURS))));
      }
    }
    return res;
  }

  /** Ouvre le trousseau du détenteur `pour` (id du compte ou 'secours') avec sa partie privée (CryptoKey). */
  async function ouvrir(coffre, pour, privee) {
    var t = {};
    Object.keys(coffre.cles).forEach(function (nom) { t[nom] = nouveauJeu(nom, coffre.cles[nom].courante); });
    var miennes = (coffre.enveloppes || []).filter(function (e) { return e.pour === pour; });
    for (var i = 0; i < miennes.length; i++) {
      var e = miennes[i], jeu = t[e.cle];
      if (!jeu) continue;
      var o = await C.ouvrirEnveloppe(e, privee, contexte(e.cle, e.g, pour));
      if (e.g === 'm') jeu.maitresse = o; else jeu.octets[e.g] = o;
    }
    return t;
  }

  /** Clés de droit dont le détenteur ne peut pas lire la génération courante (trousseau incomplet). */
  async function manquantes(trousseau) {
    var res = [];
    var noms = Object.keys(trousseau);
    for (var i = 0; i < noms.length; i++) { var j = trousseau[noms[i]]; if (!j.v1 && !(await j.cle(j.courante))) res.push(noms[i]); }
    return res;
  }

  function effacer(trousseau) { Object.keys(trousseau || {}).forEach(function (n) { trousseau[n].effacer(); }); }

  /**
   * Prépare un coffre version 2 pour un dossier vide : clés maîtresses, première génération, clé de secours
   * (partie privée emballée par le code), clé personnelle de l'administrateur (partie privée emballée par son mot de
   * passe), enveloppes. Les comptes sont ajoutés chiffrés par l'appelant. Retourne { coffre, trousseau, privee8 }.
   */
  async function creerCoffre(options) {
    var noms = [PLATEFORME].concat(options.modules || []);
    var t = {}, cles = {};
    noms.forEach(function (nom) { t[nom] = nouveauJeu(nom, 1, {}, C.nouvelleMaitresse()); cles[nom] = { courante: 1 }; });
    var coffre = { format: 'SIC-coffre', version: 2, creeLe: new Date().toISOString(), agents: {}, emballages: [], cles: cles, enveloppes: [] };
    // Clé de secours : clés maîtresses seulement (elles donnent toutes les générations)
    var sec = await C.nouvellePaire(), sec8 = await C.exporterPrivee(sec.privateKey);
    coffre.agents[SECOURS] = { publique: await C.exporterPublique(sec.publicKey) };
    var embSec = await C.emballerCodeSecours(sec8, options.codeSecours);
    embSec.id = options.id(); embSec.userId = null;
    coffre.emballages.push(embSec);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesSecours(t, coffre, sec.publicKey));
    sec8.fill(0);
    // Administrateur
    var adm = await C.nouvellePaire(), adm8 = await C.exporterPrivee(adm.privateKey);
    coffre.agents[options.compte.id] = { publique: await C.exporterPublique(adm.publicKey) };
    var emb = await C.emballerMotDePasse(adm8, options.motDePasse);
    emb.id = options.id(); emb.userId = options.compte.id; emb.login = options.compte.login;
    coffre.emballages.push(emb);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesPour(t, coffre, options.compte.id, adm.publicKey, droitsDe(coffre, options.compte)));
    return { coffre: coffre, trousseau: t, privee8: adm8 };
  }

  /**
   * Nouvelle clé personnelle pour un compte : paire, partie privée emballée par le mot de passe donné, enveloppes
   * selon ses droits. Retourne { publique (texte), emballage, enveloppes, privee8 }.
   */
  async function nouvelAgent(trousseau, coffre, compte, motDePasse, iterations) {
    var p = await C.nouvellePaire(), p8 = await C.exporterPrivee(p.privateKey);
    var emb = await C.emballerMotDePasse(p8, motDePasse, iterations);
    var env = await enveloppesPour(trousseau, coffre, compte.id, p.publicKey, droitsDe(coffre, compte));
    return { publique: await C.exporterPublique(p.publicKey), emballage: emb, enveloppes: env, privee8: p8 };
  }

  /** Recalcule les enveloppes d'un compte d'après ses droits actuels (partie publique déjà au coffre). */
  async function renouvelerEnveloppes(trousseau, coffre, compte) {
    var a = coffre.agents[compte.id];
    if (!a) throw new Error('Clé personnelle absente pour ce compte.');
    var env = await enveloppesPour(trousseau, coffre, compte.id, await C.importerPublique(a.publique), droitsDe(coffre, compte));
    coffre.enveloppes = coffre.enveloppes.filter(function (e) { return e.pour !== compte.id; }).concat(env);
  }

  /** Nouvelle clé de secours (nouveau code) : réservée à qui détient les clés maîtresses. Retourne l'emballage. */
  async function nouveauSecours(trousseau, coffre, code, id) {
    var noms = Object.keys(coffre.cles);
    noms.forEach(function (n) { if (!trousseau[n] || !trousseau[n].maitresse) throw new Error('Seul un administrateur peut renouveler le code de secours.'); });
    var sec = await C.nouvellePaire(), sec8 = await C.exporterPrivee(sec.privateKey);
    var emb = await C.emballerCodeSecours(sec8, code);
    emb.id = id; emb.userId = null;
    sec8.fill(0);
    var env = await enveloppesSecours(trousseau, coffre, sec.publicKey);
    coffre.agents[SECOURS] = { publique: await C.exporterPublique(sec.publicKey) };
    coffre.enveloppes = coffre.enveloppes.filter(function (e) { return e.pour !== SECOURS; }).concat(env);
    // L'ancienne clé de secours n'ouvre plus rien : son code et une éventuelle YubiKey de secours sont retirés
    coffre.emballages = coffre.emballages.filter(function (e) { return e.userId !== null; }).concat([emb]);
    return emb;
  }

  /**
   * Migration d'un coffre version 1 (étape 4, 0.4.3 ; décisions du porteur : aucun rechiffrement, mots de passe
   * provisoires). L'ancienne clé de données devient la génération 1 (« origine ») de la clé de plateforme et de chaque
   * clé de module : tout l'existant reste lisible tel quel. Une génération 2 distincte est créée pour chacune : les
   * saisies à venir sont cloisonnées. Chaque compte actif reçoit une clé personnelle : l'administrateur qui migre garde
   * son mot de passe, les autres reçoivent un mot de passe provisoire. Les clés de sécurité (YubiKey) sont à
   * réenregistrer ; la copie sous scellé est à refaire.
   * options : { modules, adminId, motDePasseAdmin, codeSecours, provisoire() → mot de passe, id() → id d'emballage }.
   * Retourne { coffre (sans comptes), trousseau, privee8 de l'administrateur, provisoires: [{ compte, motDePasse }] }.
   */
  async function migrerCoffre(ancien, cleDonnees, comptes, options) {
    var origine = C.deb64(await C.exporterCle(cleDonnees));
    var noms = [PLATEFORME].concat(options.modules || []);
    var t = {}, cles = {};
    noms.forEach(function (nom) { var o = {}; o[1] = origine.slice(); t[nom] = nouveauJeu(nom, 2, o, C.nouvelleMaitresse()); cles[nom] = { courante: 2, origine: true }; });
    origine.fill(0);
    var coffre = { format: 'SIC-coffre', version: 2, creeLe: ancien.creeLe, migreLe: new Date().toISOString(), agents: {}, emballages: [], cles: cles, enveloppes: [] };
    if (ancien.formation) coffre.formation = ancien.formation;   // clé du jeu protégée par l'ancienne clé : génération 1 d'Isocont
    var sec = await C.nouvellePaire(), sec8 = await C.exporterPrivee(sec.privateKey);
    coffre.agents[SECOURS] = { publique: await C.exporterPublique(sec.publicKey) };
    var embSec = await C.emballerCodeSecours(sec8, options.codeSecours);
    embSec.id = options.id(); embSec.userId = null;
    sec8.fill(0);
    coffre.emballages.push(embSec);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesSecours(t, coffre, sec.publicKey));
    var provisoires = [], privee8 = null;
    for (var i = 0; i < comptes.length; i++) {
      var c = comptes[i];
      if (!c.actif) continue;   // compte désactivé : clé personnelle créée à sa réactivation (réinitialisation)
      var estAdmin = c.id === options.adminId, mdp = estAdmin ? options.motDePasseAdmin : options.provisoire();
      var a = await nouvelAgent(t, coffre, c, mdp, estAdmin ? undefined : C.ITERATIONS_PROVISOIRE);
      a.emballage.id = options.id(); a.emballage.userId = c.id; a.emballage.login = c.login;
      coffre.agents[c.id] = { publique: a.publique };
      coffre.emballages.push(a.emballage);
      coffre.enveloppes = coffre.enveloppes.concat(a.enveloppes);
      if (estAdmin) privee8 = a.privee8; else { a.privee8.fill(0); provisoires.push({ compte: c, motDePasse: mdp }); }
    }
    if (!privee8) throw new Error('Compte administrateur introuvable parmi les comptes actifs.');
    return { coffre: coffre, trousseau: t, privee8: privee8, provisoires: provisoires };
  }

  return {
    PLATEFORME: PLATEFORME, migrerCoffre: migrerCoffre, enveloppesSecours: enveloppesSecours, SECOURS: SECOURS, jeuV1: jeuV1, nouveauJeu: nouveauJeu, droitsDe: droitsDe, enveloppesPour: enveloppesPour,
    ouvrir: ouvrir, manquantes: manquantes, effacer: effacer, creerCoffre: creerCoffre, nouvelAgent: nouvelAgent,
    renouvelerEnveloppes: renouvelerEnveloppes, nouveauSecours: nouveauSecours
  };
});
