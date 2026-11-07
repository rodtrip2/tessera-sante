// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — trousseau de clés (étape 4 du plan d'architecture, docs/architecture.md § 4).
 *
 * Coffre version 2 :
 *   agents      { <id compte> | 'secours': { publique } }       parties publiques ECDH P-256, en clair
 *   emballages  [{ methode: 'mdp' | 'cle' | 'secours', userId, … cle }]  partie privée d'un agent (userId) ou de la clé
 *               de secours (userId null : code de secours, YubiKey de secours), emballée par ce moyen
 *   cles        { plateforme: { courante, base? }, <module>: { … } }   génération en cours de chaque clé de droit ;
 *               base : première génération tirée de la clé maîtresse en vigueur (1 par défaut). Les générations
 *               antérieures (ancienne clé de données d'un coffre migré, clé maîtresse changée au retrait d'un
 *               administrateur) sont remises explicitement, y compris à la clé de secours.
 *   enveloppes  [{ cle, g, pour, eph, sel, ct }]   g = numéro de génération, ou 'm' pour la clé maîtresse ;
 *               pour = id du compte ou 'secours'
 *   comptes     chiffrés par la clé de plateforme
 *
 * Un « jeu » est la forme en mémoire d'une clé de droit : { nom, courante, cle(g) } ; crypto.js l'accepte partout
 * où il attend une clé (écriture avec la génération courante, lecture d'après l'en-tête du fichier).
 * Remise (0.4.4) : la clé de plateforme à tout compte actif ; la clé d'un module selon la règle `aDroit(nom, compte)`
 * fournie par la session (rôle dans le module, activation par service) ; les clés maîtresses aux administrateurs et à la
 * clé de secours. Un détenteur qui perd une clé : nouvelle génération (et nouvelle clé maîtresse s'il était administrateur).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crypto.js'));
  else (root.SIC = root.SIC || {}).trousseau = factory(root.SIC.crypto);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var PLATEFORME = 'plateforme', SECOURS = 'secours';
  function attestation() { return (typeof self !== 'undefined' && self.SIC && self.SIC.attestation) || (typeof require === 'function' ? require('./attestation.js') : null); }

  function contexte(cle, g, pour) { return cle + ':' + g + ':' + pour; }
  /** Première génération tirée de la clé maîtresse en vigueur (coffres migrés en 0.4.3 : « origine » = base 2). */
  function baseDe(c) { return (c && (c.base || (c.origine ? 2 : 1))) || 1; }
  /** Générations perdues d'une clé (non retrouvées lors d'un renouvellement après restauration) : ni remises, ni attestées. */
  function perdue(c, g) { return !!(c && c.perdues && c.perdues.indexOf(g) >= 0); }

  /** Jeu d'une clé de droit en mémoire : octets des générations reçues, ou clé maîtresse (toutes les générations). */
  function nouveauJeu(nom, courante, octets, maitresse, base) {
    var cache = {};
    var jeu = {
      nom: nom, courante: courante, octets: octets || {}, maitresse: maitresse || null, base: base || 1,
      /** Clé AES-GCM d'une génération (null si elle n'a pas été remise). */
      cle: async function (g) {
        if (cache[g]) return cache[g];
        var o = jeu.octets[g] || (jeu.maitresse && g >= jeu.base ? await C.octetsGeneration(jeu.maitresse, nom, g) : null);
        if (!o) return null;
        jeu.octets[g] = o;
        cache[g] = await C.importerCleOctets(o);
        return cache[g];
      },
      /** Octets d'une génération, pour la remettre à un autre agent (null si absente). */
      octetsDe: async function (g) {
        if (jeu.octets[g]) return jeu.octets[g];
        if (!jeu.maitresse || g < jeu.base) return null;
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

  function estAdmin(compte) { return !!compte && (compte.roles || []).indexOf('ADMIN') >= 0; }
  /**
   * Droits d'un compte en clés : clé de plateforme pour tout compte actif ; clé d'un module si `aDroit(nom, compte)`
   * (toutes si la règle n'est pas fournie) ; clés maîtresses pour l'administrateur (qui reçoit toutes les clés).
   */
  function droitsDe(coffre, compte, aDroit) {
    var admin = estAdmin(compte);
    var cles = Object.keys(coffre.cles).filter(function (nom) { return nom === PLATEFORME || admin || !aDroit || aDroit(nom, compte); });
    return { cles: cles, maitresses: admin };
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
        if (perdue(coffre.cles[nom], g)) continue;
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
      for (var g = 1; g < baseDe(coffre.cles[nom]); g++) {   // générations qui ne se déduisent pas de la clé maîtresse en vigueur
        if (perdue(coffre.cles[nom], g)) continue;
        var o = await jeu.octetsDe(g);
        if (!o) throw new Error('Génération ' + g + ' de la clé « ' + nom + ' » absente de votre trousseau.');
        res.push(Object.assign({ cle: nom, g: g, pour: SECOURS }, await C.envelopper(o, publique, contexte(nom, g, SECOURS))));
      }
    }
    return res;
  }

  /**
   * Ouvre le trousseau du détenteur `pour` (id du compte ou 'secours') avec sa partie privée (CryptoKey).
   * `etat` (attestation vérifiée, 0.5.0) : seules les générations et clés maîtresses dont l'empreinte est attestée sont
   * acceptées, et la génération d'écriture est celle de l'état signé (une enveloppe glissée par un tiers est ignorée).
   */
  async function ouvrir(coffre, pour, privee, etat) {
    var t = {}, A = attestation();
    Object.keys(coffre.cles).forEach(function (nom) {
      var c = etat && etat.cles[nom] ? etat.cles[nom] : coffre.cles[nom];
      t[nom] = nouveauJeu(nom, c.courante, {}, null, baseDe(c));
    });
    var miennes = (coffre.enveloppes || []).filter(function (e) { return e.pour === pour; });
    for (var i = 0; i < miennes.length; i++) {
      var e = miennes[i], jeu = t[e.cle];
      if (!jeu) continue;
      var o;
      // Une enveloppe abîmée ou modifiée n'empêche pas d'ouvrir les autres (elle est comptée et signalée)
      try { o = await C.ouvrirEnveloppe(e, privee, contexte(e.cle, e.g, pour)); } catch (err) { jeu.illisibles = (jeu.illisibles || 0) + 1; continue; }
      if (etat && !(await A.generationAttestee(etat, e.cle, e.g, o))) { o.fill(0); jeu.rejetees = (jeu.rejetees || 0) + 1; continue; }
      if (e.g === 'm') jeu.maitresse = o; else jeu.octets[e.g] = o;
    }
    // Génération d'écriture : jamais en deçà de la plus haute génération reçue (une génération courante remise en
    // arrière dans le coffre ne fait pas réécrire avec une génération que détient un agent retiré)
    if (!etat) Object.keys(t).forEach(function (nom) {
      var recues = Object.keys(t[nom].octets).map(Number);
      t[nom].courante = Math.max.apply(null, [t[nom].courante].concat(recues));
    });
    return t;
  }

  /** Clés de droit dont le détenteur ne peut pas lire la génération courante (trousseau incomplet). */
  async function manquantes(trousseau) {
    var res = [];
    var noms = Object.keys(trousseau);
    for (var i = 0; i < noms.length; i++) { var j = trousseau[noms[i]]; if (!j.v1 && !(await j.cle(j.courante))) res.push(noms[i]); }
    return res;
  }

  /** Copie de travail indépendante (octets recopiés) : modifiée puis installée seulement après l'écriture du coffre. */
  function copier(trousseau) {
    var c = {};
    Object.keys(trousseau).forEach(function (n) {
      var j = trousseau[n];
      if (j.v1) { c[n] = j; return; }
      var o = {};
      Object.keys(j.octets).forEach(function (g) { o[g] = j.octets[g].slice(); });
      c[n] = nouveauJeu(n, j.courante, o, j.maitresse && j.maitresse.slice(), j.base);
    });
    return c;
  }

  function effacer(trousseau) { Object.keys(trousseau || {}).forEach(function (n) { if (!trousseau[n].v1) trousseau[n].effacer(); }); }

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
    var embSec = await C.emballerCodeSecours(C.paquet(sec8, options.ancre), options.codeSecours);
    embSec.id = options.id(); embSec.userId = null;
    coffre.emballages.push(embSec);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesSecours(t, coffre, sec.publicKey));
    sec8.fill(0);
    // Administrateur
    var adm = await C.nouvellePaire(), adm8 = await C.exporterPrivee(adm.privateKey);
    coffre.agents[options.compte.id] = { publique: await C.exporterPublique(adm.publicKey) };
    var emb = await C.emballerMotDePasse(C.paquet(adm8, options.ancre), options.motDePasse);
    emb.id = options.id(); emb.userId = options.compte.id; emb.login = options.compte.login;
    coffre.emballages.push(emb);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesPour(t, coffre, options.compte.id, adm.publicKey, droitsDe(coffre, options.compte)));
    return { coffre: coffre, trousseau: t, privee8: adm8 };
  }

  /**
   * Nouvelle clé personnelle pour un compte : paire, partie privée emballée par le mot de passe donné, enveloppes
   * selon ses droits. Retourne { publique (texte), emballage, enveloppes, privee8 }.
   */
  async function nouvelAgent(trousseau, coffre, compte, motDePasse, iterations, aDroit, ancre) {
    var p = await C.nouvellePaire(), p8 = await C.exporterPrivee(p.privateKey);
    var emb = await C.emballerMotDePasse(C.paquet(p8, ancre), motDePasse, iterations);
    var env = await enveloppesPour(trousseau, coffre, compte.id, p.publicKey, droitsDe(coffre, compte, aDroit));
    return { publique: await C.exporterPublique(p.publicKey), emballage: emb, enveloppes: env, privee8: p8 };
  }

  /** Clés (et clés maîtresses) que chaque compte actif doit détenir : { id: { cles: [...], maitresses } }. */
  function attendus(coffre, comptes, aDroit) {
    var res = {};
    comptes.forEach(function (c) { if (c.actif && coffre.agents[c.id]) res[c.id] = droitsDe(coffre, c, aDroit); });
    return res;
  }

  /**
   * Comptes dont le trousseau est incomplet (enveloppe manquante pour une génération ou une clé maîtresse dues) :
   * [{ id, cles: [noms] }]. Un compte actif sans clé personnelle (désactivé puis réactivé) en fait partie.
   */
  function incomplets(coffre, comptes, aDroit) {
    var a = attendus(coffre, comptes, aDroit), res = [];
    var tient = {};
    (coffre.enveloppes || []).forEach(function (e) { tient[e.pour + '|' + e.cle + '|' + e.g] = true; });
    comptes.forEach(function (c) {
      if (!c.actif) return;
      if (!coffre.agents[c.id]) { res.push({ id: c.id, cles: ['clé personnelle'] }); return; }
      var manque = a[c.id].cles.filter(function (nom) {
        for (var g = 1; g <= coffre.cles[nom].courante; g++) if (!tient[c.id + '|' + nom + '|' + g] && !perdue(coffre.cles[nom], g)) return true;
        return a[c.id].maitresses && !tient[c.id + '|' + nom + '|m'];
      });
      if (manque.length) res.push({ id: c.id, cles: manque });
    });
    return res;
  }

  /**
   * Applique les droits actuels au coffre (réservé à qui détient les clés maîtresses : l'administrateur).
   * - Un détenteur qui perd une clé (rôle retiré, compte désactivé, module désactivé pour ses services) : nouvelle
   *   génération de cette clé, remise aux seuls détenteurs restants (décision du porteur : automatique).
   * - Un administrateur qui perd ce rôle : en plus, nouvelle clé maîtresse (les générations antérieures restent
   *   remises explicitement) ; la copie sous scellé est alors à refaire.
   * Les enveloppes de tous les comptes actifs et de la clé de secours sont recalculées. Retourne
   * { change, generations: [noms], maitresses: [noms] } ; `change` faux si rien n'était à faire.
   */
  async function appliquerDroits(trousseau, coffre, comptes, aDroit, options) {
    var tout = !!(options && options.tout);   // renouvellement de toutes les clés (restauration, compromission)
    var a = attendus(coffre, comptes, aDroit), noms = Object.keys(coffre.cles);
    var res = { change: false, generations: [], maitresses: [] };
    var tenait = {};   // nom → { pour: true } d'après les enveloppes actuelles (hors secours)
    noms.forEach(function (nom) { tenait[nom] = { gen: {}, m: {} }; });
    (coffre.enveloppes || []).forEach(function (e) {
      if (e.pour === SECOURS || !tenait[e.cle]) return;
      if (e.g === 'm') tenait[e.cle].m[e.pour] = true; else tenait[e.cle].gen[e.pour] = true;
    });
    for (var i = 0; i < noms.length; i++) {
      var nom = noms[i], jeu = trousseau[nom];
      if (!jeu || !jeu.maitresse) throw new Error('Seul un administrateur peut appliquer les droits aux clés.');
      var perd = tout || Object.keys(tenait[nom].gen).some(function (id) { return !a[id] || a[id].cles.indexOf(nom) < 0; });
      var perdMaitresse = tout || Object.keys(tenait[nom].m).some(function (id) { return !a[id] || !a[id].maitresses; });
      if (perd || perdMaitresse) {
        // Renouvellement après restauration : au-dessus de toute génération déjà employée (`depuis`), un même numéro
        // ne désigne jamais deux clés différentes
        var nouvelle = Math.max(coffre.cles[nom].courante, (options && options.depuis && options.depuis[nom]) || 0) + 1;
        if (perdMaitresse) {
          for (var g = 1; g < nouvelle; g++) {
            if (perdue(coffre.cles[nom], g)) { if (jeu.octets[g]) { jeu.octets[g].fill(0); delete jeu.octets[g]; } continue; }
            if (await jeu.octetsDe(g)) continue;
            if (!tout) throw new Error('Génération ' + g + ' de la clé « ' + nom + ' » absente de votre trousseau.');
            if (!perdue(coffre.cles[nom], g)) (coffre.cles[nom].perdues = coffre.cles[nom].perdues || []).push(g);   // saisies de cette génération illisibles
          }
          jeu.maitresse.fill(0); jeu.maitresse = C.nouvelleMaitresse(); jeu.base = nouvelle;
          coffre.cles[nom].base = nouvelle; delete coffre.cles[nom].origine;
          res.maitresses.push(nom);
        }
        coffre.cles[nom].courante = nouvelle; jeu.courante = nouvelle;
        res.generations.push(nom);
      }
    }
    // Enveloppes voulues : comparées aux enveloppes actuelles pour ne réécrire le coffre que si nécessaire
    var voulu = {};
    Object.keys(a).forEach(function (id) {
      a[id].cles.forEach(function (nom) {
        for (var g = 1; g <= coffre.cles[nom].courante; g++) if (!perdue(coffre.cles[nom], g)) voulu[id + '|' + nom + '|' + g] = true;
        if (a[id].maitresses) voulu[id + '|' + nom + '|m'] = true;
      });
    });
    var actuel = {};
    (coffre.enveloppes || []).forEach(function (e) { if (e.pour !== SECOURS) actuel[e.pour + '|' + e.cle + '|' + e.g] = true; });
    var memes = Object.keys(voulu).length === Object.keys(actuel).length && Object.keys(voulu).every(function (k) { return actuel[k]; });
    if (memes && !res.generations.length) return res;
    res.change = true;
    var env = await enveloppesSecours(trousseau, coffre, await C.importerPublique(coffre.agents[SECOURS].publique));
    var ids = Object.keys(a);
    for (var j = 0; j < ids.length; j++) {
      var garde = (coffre.enveloppes || []).filter(function (e) { return e.pour === ids[j]; });
      var manque = Object.keys(voulu).filter(function (k) { return k.indexOf(ids[j] + '|') === 0 && !garde.some(function (e) { return ids[j] + '|' + e.cle + '|' + e.g === k; }); });
      var enTrop = garde.some(function (e) { return !voulu[ids[j] + '|' + e.cle + '|' + e.g]; });
      if (!manque.length && !enTrop && !res.generations.length) { env = env.concat(garde); continue; }
      env = env.concat(await enveloppesPour(trousseau, coffre, ids[j], await C.importerPublique(coffre.agents[ids[j]].publique), a[ids[j]]));
    }
    coffre.enveloppes = env;
    return res;
  }

  /**
   * Clé d'un module déclaré après la création du coffre (module Patients, étape 5) : nouvelle clé maîtresse, génération 1.
   * Réservé à qui détient les clés maîtresses ; la remise suit (appliquerDroits).
   */
  function ajouterCle(trousseau, coffre, nom) {
    if (coffre.cles[nom]) return false;
    if (!trousseau[PLATEFORME] || !trousseau[PLATEFORME].maitresse) throw new Error('Seul un administrateur peut créer la clé d’un module.');
    coffre.cles[nom] = { courante: 1 };
    trousseau[nom] = nouveauJeu(nom, 1, {}, C.nouvelleMaitresse());
    return true;
  }

  /** Nouvelle clé de secours (nouveau code) : réservée à qui détient les clés maîtresses. Retourne l'emballage. */
  async function nouveauSecours(trousseau, coffre, code, id, ancre) {
    var noms = Object.keys(coffre.cles);
    noms.forEach(function (n) { if (!trousseau[n] || !trousseau[n].maitresse) throw new Error('Seul un administrateur peut renouveler le code de secours.'); });
    var sec = await C.nouvellePaire(), sec8 = await C.exporterPrivee(sec.privateKey);
    var emb = await C.emballerCodeSecours(C.paquet(sec8, ancre), code);
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
    noms.forEach(function (nom) { var o = {}; o[1] = origine.slice(); t[nom] = nouveauJeu(nom, 2, o, C.nouvelleMaitresse(), 2); cles[nom] = { courante: 2, base: 2 }; });
    origine.fill(0);
    var coffre = { format: 'SIC-coffre', version: 2, creeLe: ancien.creeLe, migreLe: new Date().toISOString(), agents: {}, emballages: [], cles: cles, enveloppes: [] };
    if (ancien.formation) coffre.formation = ancien.formation;   // clé du jeu protégée par l'ancienne clé : génération 1 d'Isocont
    var sec = await C.nouvellePaire(), sec8 = await C.exporterPrivee(sec.privateKey);
    coffre.agents[SECOURS] = { publique: await C.exporterPublique(sec.publicKey) };
    var embSec = await C.emballerCodeSecours(C.paquet(sec8, options.ancre), options.codeSecours);
    embSec.id = options.id(); embSec.userId = null;
    sec8.fill(0);
    coffre.emballages.push(embSec);
    coffre.enveloppes = coffre.enveloppes.concat(await enveloppesSecours(t, coffre, sec.publicKey));
    var provisoires = [], privee8 = null;
    for (var i = 0; i < comptes.length; i++) {
      var c = comptes[i];
      if (!c.actif) continue;   // compte désactivé : clé personnelle créée à sa réactivation (réinitialisation)
      var lui = c.id === options.adminId, mdp = lui ? options.motDePasseAdmin : options.provisoire();
      var a = await nouvelAgent(t, coffre, c, mdp, lui ? undefined : C.ITERATIONS_PROVISOIRE, options.aDroit, options.ancre);
      a.emballage.id = options.id(); a.emballage.userId = c.id; a.emballage.login = c.login;
      coffre.agents[c.id] = { publique: a.publique };
      coffre.emballages.push(a.emballage);
      coffre.enveloppes = coffre.enveloppes.concat(a.enveloppes);
      if (lui) privee8 = a.privee8; else { a.privee8.fill(0); provisoires.push({ compte: c, motDePasse: mdp }); }
    }
    if (!privee8) throw new Error('Compte administrateur introuvable parmi les comptes actifs.');
    return { coffre: coffre, trousseau: t, privee8: privee8, provisoires: provisoires };
  }

  return {
    PLATEFORME: PLATEFORME, migrerCoffre: migrerCoffre, enveloppesSecours: enveloppesSecours, SECOURS: SECOURS, jeuV1: jeuV1, nouveauJeu: nouveauJeu, droitsDe: droitsDe, enveloppesPour: enveloppesPour,
    ouvrir: ouvrir, manquantes: manquantes, effacer: effacer, creerCoffre: creerCoffre, nouvelAgent: nouvelAgent,
    appliquerDroits: appliquerDroits, incomplets: incomplets, perdue: perdue, ajouterCle: ajouterCle, copier: copier, contexte: contexte, nouveauSecours: nouveauSecours, baseDe: baseDe
  };
});
