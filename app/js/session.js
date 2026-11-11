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
  var T = socle('trousseau', './trousseau.js'), A = socle('attestation', './attestation.js');
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
  /** Module qui décide des droits d'une saisie : celui qui déclare le type (hors modules de référence), sinon le module principal. */
  function moduleDe(type) {
    var m = SIC.modules && SIC.modules.moduleDuType ? SIC.modules.moduleDuType(type) : null;
    return m && !m.reference && m.droits ? m : moduleActif();
  }
  /** Module affiché par l'interface (choisi par l'agent, étape 6) ; à défaut le module principal. */
  function moduleAffiche(s) {
    var m = s.moduleChoisi && SIC.modules && SIC.modules.obtenir(s.moduleChoisi);
    return m && !m.reference && m.droits ? m : moduleActif();
  }
  function etatDe(s, m) { return !m || m === moduleActif() ? s.etat : (s.etats && s.etats[m.id]) || null; }
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
  var REGLAGES_SOCLE = { etablissement: 1, services: 1, roles: 1, modulesServices: 1, fichePatient: 1, importPatients: 1, patientsListe: 1, patientsChamps: 1, vehicules: 1, vehiculesInformation: 1, agenda: 1, groupes: 1, medecins: 1, suiviMedical: 1,
    champsAjoutes: 1, reglagesDonnees: 1, capacites: 1, vuesEnsemble: 1, psychologues: 1, largeursColonnes: 1 };
  /** Champs ajoutés (0.18.0) : définitions, droits réglés pour chaque donnée, clés propres (`d-<id>`). */
  function CH() { return socle('champs', './champs.js'); }
  /** Clés propres à une donnée détenues par la session (journaux `modules\d-<id>\`). */
  function clesPropresDetenues(s) { return Object.keys(s.trousseau || {}).filter(function (n) { return /^d-/.test(n) && aCle(s, n); }).sort(); }

  function nouveauJournal(nom, dossier, cle) { return { nom: nom, dossier: dossier, cle: cle, evts: [], connus: new Set(), rejetes: [], reperesLus: {} }; }
  /** Journaux du jeu de données actif. */
  /**
   * Journaux du jeu de données actif : le socle, puis chaque module dont la session détient la clé, fournisseurs
   * d'abord (Patients avant Isocont, étape 5). Le module affiché reconstitue son état à partir de tous.
   */
  function journaux(s) {
    if (!s.journauxActifs) {
      s.journauxActifs = s.formation ? [nouveauJournal('formation', s.donnees, s.cleDonnees)]
        : [nouveauJournal(SOCLE, null, s.cle)].concat(modulesOrdre().filter(function (m) { return aCle(s, m.id); }).map(function (m) { return nouveauJournal(m.id, null, s.trousseau[m.id]); }))
          .concat(clesPropresDetenues(s).map(function (n) { return nouveauJournal(n, null, s.trousseau[n]); }));
    }
    return s.journauxActifs;
  }
  function modulesOrdre() { return SIC.modules && SIC.modules.ordre ? SIC.modules.ordre() : [{ id: idModule() }]; }
  /** La session détient-elle la clé d'un module (coffre version 1 : la clé unique vaut pour tous) ? */
  function aCle(s, nom) {
    var j = s.trousseau && s.trousseau[nom];
    if (!j) return false;
    if (!v2(s) || j.v1) return true;
    return !!j.maitresse || Object.keys(j.octets).length > 0;
  }
  function signatureCles(s) { return modulesOrdre().map(function (m) { return aCle(s, m.id) ? m.id : ''; }).concat(clesPropresDetenues(s)).join('|'); }
  /** Dossier d'un journal (créé à la première saisie) ; null s'il n'existe pas encore et `creer` est faux. */
  async function dossierJournal(s, j, creer) {
    if (!j.dossier) j.dossier = await s.dossier.journal(j.nom, creer);
    return j.dossier;
  }
  /** Préfixe des chemins d'un journal depuis le dossier des données (affiché au service informatique). */
  function prefixeJournal(s, nom) { return s.formation ? '' : SIC.Dossier.cheminJournal(nom).join('/') + '/'; }
  /**
   * Journal qui reçoit une saisie : celui de la saisie visée pour une annulation, le socle pour ses saisies, sinon le
   * module qui déclare le type de saisie (fiche patient → module Patients), à défaut le module affiché.
   */
  function journalPour(s, js, type, data) {
    if (js.length === 1 && js[0].nom !== SOCLE) return js[0];   // jeu de formation : un seul journal
    if (type === 'ANNULATION' && data && data.cible) {
      var vise = js.filter(function (j) { return j.evts.some(function (e) { return e.id === data.cible; }); })[0];
      if (vise) return vise;
    }
    if (TYPES_SOCLE[type] || (type === 'CONFIG' && data && REGLAGES_SOCLE[data.cle])) return js[0];
    // Valeur d'une donnée ajoutée (0.18.0) : journal de sa clé propre, sinon du module de rattachement
    if (type === 'VALEUR' && CH()) {
      // Définition connue, sinon journal indiqué dans la saisie (lot qui crée la donnée et ses valeurs : démonstration, import)
      var def = CH().definition(config(s), data && data.champ), nomJ = def ? CH().journalDe(def) : (data && typeof data.journal === 'string' ? data.journal : null);
      var jv = nomJ && js.filter(function (x) { return x.nom === nomJ; })[0];
      if (!jv) throw new Error(def && CH().cleDe(def) && !(s.coffre && s.coffre.cles && s.coffre.cles[nomJ]) ? 'La clé propre de « ' + def.libelle + ' » n’est pas encore créée : elle le sera à la prochaine connexion d’un administrateur.' : 'Vous n’avez pas la clé de « ' + (def ? def.libelle : 'cette donnée') + ' » : saisie impossible.');
      return jv;
    }
    // Part d'un instantané de la Vue d'ensemble (0.19.5) : rangée dans le journal des colonnes qu'elle porte (Patients,
    // Suivi médical, clé propre d'une donnée…), chiffrée par sa clé : chacun ne revoit que ce qu'il pouvait voir
    if (type === 'INSTANTANE_PART' && data && typeof data.journal === 'string') {
      var jp = js.filter(function (x) { return x.nom === data.journal; })[0];
      if (!jp) throw new Error('Clé du journal « ' + data.journal + ' » absente : part de l’instantané impossible à enregistrer.');
      return jp;
    }
    var m = SIC.modules && SIC.modules.moduleDuType ? SIC.modules.moduleDuType(type) : null;
    // Clé du module pas encore créée (coffre d'avant ce module, en attente de l'administrateur) : module affiché, comme avant
    if (m && v2(s) && s.coffre && !s.coffre.cles[m.id]) m = null;
    var nom = m ? m.id : idModule(), j = js.filter(function (x) { return x.nom === nom; })[0];
    if (!j) throw new Error('Vous n’avez pas la clé du module « ' + ((m || moduleActif()).libelle || nom) + ' » : saisie impossible.');
    return j;
  }
  /**
   * Activation du module par service (architecture § 5) : aucune saisie du module ne peut toucher un service où il
   * est désactivé (données conservées, consultation seule). Les saisies du socle ne sont pas concernées.
   */
  function controlerActivation(s, type, data) {
    var m = moduleDe(type), cfg = config(s);
    var jv = null;
    try { jv = journalPour(s, journaux(s), type, data); } catch (e) { jv = null; }   // clé absente : le motif d'activation prime
    if (!s.etat || !m.saisies.cibles || (jv && jv.nom === SOCLE)) return;
    var inactifs = m.saisies.cibles(etatDe(s, m) || {}, { type: type, data: data || {} }).filter(function (c) { return !m.droits.serviceActif(cfg, c); });
    if (inactifs.length) {
      var lib = inactifs.map(function (c) { var x = (cfg.services || []).filter(function (v) { return v.code === c; })[0]; return x ? x.libelle : c; }).join(', ');
      throw new Error('Le module « ' + (m.libelle || m.id) + ' » est désactivé pour ' + (inactifs.length > 1 ? 'les services ' : 'le service ') + lib + ' : consultation seule, aucune saisie possible.');
    }
  }
  /** Contrôles propres au module avant l'enregistrement (contrat : `saisies.controler(type, data, ctx)`), ex. tâches de l'Agenda. */
  function controlerModule(s, type, data) {
    var m = moduleDe(type);
    if (!m || !m.saisies || typeof m.saisies.controler !== 'function') return;
    var c = s.compteEffectif && s.compteEffectif(), G = c && socle('groupes', './groupes.js');
    m.saisies.controler(type, data || {}, { etat: etatDe(s, m), config: config(s), peut: function (t) { return s.peut(t); },
      compte: c ? Object.assign({}, c, { groupes: G ? G.de(config(s), c.id) : [] }) : null });
  }
  // ---------------------------------------------------------- Trousseau (étape 4)
  function v2(s) { return !!(s.coffre && s.coffre.version === 2); }
  function idModule() { return moduleActif().id || 'isocont'; }
  function modulesDeclares() { return SIC.modules ? SIC.modules.liste().map(function (m) { return m.id; }) : [idModule()]; }
  /** Clés à créer par l'administrateur : modules déclarés et clés propres des données protégées (0.18.0). */
  function clesDeclarees(s) { return modulesDeclares().concat(CH() && s.etat ? CH().clesPropres(config(s)).map(function (x) { return x.nom; }) : []); }
  /** Trousseau ouvert : `cle` = jeu de la plateforme (comptes, journal du socle, préférences, traces). */
  function installerTrousseau(s, trousseau, privee8, cleV1) {
    s.trousseau = trousseau; s.privee8 = privee8 || null; s.cleV1 = cleV1 || null;
    s.cle = trousseau[T.PLATEFORME];
  }
  /** Coffre version 1 : la clé de données unique tient lieu de toutes les clés de droit (comportement d'origine). */
  function trousseauV1(s, cle) { var j = T.jeuV1(cle), t = {}; t[T.PLATEFORME] = j; t[idModule()] = j; modulesDeclares().forEach(function (n) { t[n] = j; }); installerTrousseau(s, t, null, cle); }
  function jeuModule(s) { return s.trousseau && (s.trousseau[idModule()] || s.trousseau[T.PLATEFORME]); }
  /**
   * Ouvre le trousseau avec le contenu d'un emballage (partie privée et ancre, 0.5.0) : attestation du coffre vérifiée
   * d'abord (signature, ancre, version) ; seules les générations attestées sont acceptées.
   */
  async function ouvrirAvecPrivee(s, pour, octets) {
    var p = C.ouvrirPaquet(octets);
    s.ancre = p.ancre;
    s.controle = await controler(s, s.coffre);
    installerTrousseau(s, await T.ouvrir(s.coffre, pour, await C.importerPrivee(p.prive8), s.controle.etat), p.prive8);
    await ouvrirAttestation(s, s.coffre);
  }

  // ---------------------------------------------------------- Attestation du coffre (0.5.0, attestation.js)
  /** Mémoire du poste : plus haut compteur d'attestation vu pour ce coffre (une version antérieure remise est détectée). */
  function memoire(s) {
    if (s.memoirePoste) return s.memoirePoste;
    try { if (typeof localStorage !== 'undefined') return { lire: function (k) { return localStorage.getItem(k); }, ecrire: function (k, v) { localStorage.setItem(k, v); } }; } catch (e) { /* sans stockage */ }
    return null;
  }
  function nVu(s, coffre) { var m = memoire(s); return m && coffre ? +(m.lire('sic-attestation-n:' + coffre.creeLe) || 0) : 0; }
  function retenirN(s, coffre, n) { var m = memoire(s); if (m && coffre && n > nVu(s, coffre)) m.ecrire('sic-attestation-n:' + coffre.creeLe, String(n)); }
  function bloquantes(r) { return ((r && r.anomalies) || []).filter(function (x) { return x.bloquante; }); }
  /** Vérification faite par tout agent : attestation (attestation.js) et mémoire du poste. */
  async function controler(s, coffre) {
    if (!coffre || coffre.version !== 2) return { etat: null, anomalies: [] };
    var r = await A.verifier(coffre, s.ancre), vu = nVu(s, coffre);
    if (r.etat && r.etat.n < vu) r.anomalies.push({ code: 'ancienne', texte: 'Une version antérieure du coffre a été remise en place : l’administrateur doit renouveler les clés avant toute saisie.', bloquante: true });
    if (!r.etat && vu > 0) r.anomalies.forEach(function (x) { if (x.code === 'absente') { x.bloquante = true; x.texte = 'L’attestation du coffre a été retirée hors de l’outil.'; } });
    return r;
  }
  /** Clés d'attestation ouvertes si la session détient la clé maîtresse de plateforme (administrateur, clé de secours). */
  async function ouvrirAttestation(s, coffre) {
    A.effacerCles(s.attest);
    s.attest = null;
    var j = s.trousseau && s.trousseau[T.PLATEFORME];
    if (v2(s) && j && j.maitresse) s.attest = await A.ouvrirCles(coffre, j.maitresse);
  }
  function attestateur(s) { var j = v2(s) && s.trousseau && s.trousseau[T.PLATEFORME]; return !!(j && j.maitresse); }
  async function ancreSession(s) { return s.ancre || (s.attest ? C.ancreDe(s.attest.publique) : null); }
  /**
   * Ce que disent les versions attestées du coffre (historique et coffre actuel) : plus haut compteur, plus hautes
   * générations employées, empreintes attestées des générations et des clés maîtresses. Seules les versions signées
   * par la clé d'attestation de la session (ou du coffre actuel) comptent.
   */
  async function historiqueAttestations(s, coffre) {
    var res = { n: 0, cles: {}, empreintes: {}, maitresses: {} }, vs = [];
    try { vs = await s.dossier.versionsCoffre(); } catch (e) { vs = []; }
    var publique = s.attest ? s.attest.publique : coffre.attestation && coffre.attestation.publique;
    vs = [{ coffre: coffre }].concat(vs);
    for (var i = 0; i < vs.length; i++) {
      var c = vs[i].coffre;
      if (!c || c.version !== 2 || c.creeLe !== coffre.creeLe) continue;
      var a = c.attestation, e = A.etatDe(c);
      if (!a || !e || a.publique !== publique || !(await C.verifierSignature(a.publique, a.etat, a.signature))) continue;
      res.n = Math.max(res.n, e.n);
      Object.keys(e.cles || {}).forEach(function (n) { res.cles[n] = Math.max(res.cles[n] || 0, e.cles[n].courante || 0); });
      Object.keys(e.empreintes || {}).forEach(function (n) { var m = res.empreintes[n] = res.empreintes[n] || {}; Object.keys(e.empreintes[n]).forEach(function (g) { m[g] = e.empreintes[n][g]; }); });
      Object.keys(e.maitresses || {}).forEach(function (n) { (res.maitresses[n] = res.maitresses[n] || []).push(e.maitresses[n]); });
    }
    return res;
  }
  /**
   * Avant un renouvellement de toutes les clés : seules les générations dont l'empreinte est attestée sont gardées
   * (remises explicitement ensuite) ; les autres sont déclarées perdues. Retourne la plus haute génération employée
   * de chaque clé (le renouvellement crée la suivante).
   */
  async function preparerRenouvellement(s, coffre, trousseau, h) {
    var depuis = {}, noms = Object.keys(coffre.cles);
    for (var i = 0; i < noms.length; i++) {
      var nom = noms[i], c = coffre.cles[nom], jeu = trousseau[nom], max = Math.max(c.courante, h.cles[nom] || 0);
      for (var g = 1; g <= max; g++) {
        if (T.perdue(c, g)) continue;
        var o = await jeu.octetsDe(g), att = h.empreintes[nom] && h.empreintes[nom][g];
        if (o && att && att === (await A.empreinteGeneration(nom, g, o))) continue;
        if (jeu.octets[g]) { jeu.octets[g].fill(0); delete jeu.octets[g]; }
        (c.perdues = c.perdues || []).push(g);
      }
      var okM = jeu.maitresse && (h.maitresses[nom] || []).indexOf(await A.empreinteGeneration(nom, 'm', jeu.maitresse)) >= 0;
      if (!okM) { if (jeu.maitresse) jeu.maitresse.fill(0); jeu.maitresse = C.nouvelleMaitresse(); }   // remplacée par le renouvellement
      depuis[nom] = max;
    }
    return depuis;
  }
  var TOUTES = ['absente', 'signature', 'ancre', 'coffre', 'cles', 'restaure', 'ancienne', 'comptes', 'agents', 'secours'];
  /** Anomalies vues par l'administrateur : celles de tout agent, puis comptes, parties publiques, clé de secours. */
  async function anomaliesAdmin(s, coffre, comptes, historique) {
    var r = await controler(s, coffre);
    var an = r.anomalies.slice();
    if (r.etat && s.attest) an = an.concat(await A.verifierAdmin(s.attest, coffre, r.etat, comptes));
    if (historique && r.etat) {
      var h = await historiqueAttestations(s, coffre);
      if (h.n > r.etat.n && !an.some(function (x) { return x.code === 'ancienne'; })) an.push({ code: 'ancienne', texte: 'Une version antérieure du coffre a été remise en place (une version plus récente figure dans l’historique) : renouvelez les clés.', bloquante: true });
    }
    return { etat: r.etat, anomalies: an };
  }
  /** Signe l'état du coffre à écrire (administrateur) ; crée les clés d'attestation si le coffre n'en a pas encore. */
  async function signerCoffre(s, coffre, trousseau, nMin) {
    if (!s.attestEnAttente && !s.attest) s.attestEnAttente = await A.creerCles();
    var cles = s.attestEnAttente || s.attest, prec = A.etatDe(coffre);
    var n = Math.max(prec ? prec.n : 0, s.controle && s.controle.etat ? s.controle.etat.n : 0, nVu(s, coffre), nMin || 0) + 1;
    return A.signer(cles, trousseau, coffre, s.comptes, { n: n, par: s.utilisateur ? s.utilisateur.id : null });
  }
  /** Réemballe l'emballage de connexion avec l'ancre (emballage d'avant 0.5.0, ou attestation tout juste établie). */
  async function ancrerEmballage(s, emb, secret) {
    var ancre = await ancreSession(s);
    if (!ancre || !s.privee8 || !emb) return;
    var neuf = emb.methode === 'secours' ? await C.emballerCodeSecours(C.paquet(s.privee8, ancre), secret) : await C.emballerMotDePasse(C.paquet(s.privee8, ancre), secret, emb.iterations);
    await s.modifierCoffre(async function (coffre) {
      var e = coffre.emballages.filter(function (x) { return x.id === emb.id; })[0];
      if (e) { e.sel = neuf.sel; e.iterations = neuf.iterations; e.cle = neuf.cle; }
    });
    s.ancre = ancre;
  }
  /**
   * Après l'ouverture d'une session (version 2) : un agent ne se connecte pas sur un coffre dont l'attestation est
   * invalide ; l'administrateur, oui, pour le réparer (aucune remise de clé tant que l'anomalie demeure). Attestation
   * établie au besoin (coffre d'avant 0.5.0) et emballage ancré.
   */
  async function apresOuverture(s, emb, secret) {
    if (!v2(s) || s.formation) return;
    if (attestateur(s)) {
      s.controle = await anomaliesAdmin(s, s.coffre, s.comptes, true);
      if (!s.coffre.attestation && !bloquantes(s.controle).length) { await s.modifierCoffre(async function () {}); await s.tracer('ATTESTATION', { libelle: 'attestation du coffre établie' }); }
    } else {
      var b = bloquantes(s.controle);
      if (b.length) { s.verrouiller(); throw new Error(b[0].texte + ' Connexion impossible : prévenez l’administrateur.'); }
    }
    if (s.controle.etat || s.attest) retenirN(s, s.coffre, (A.etatDe(s.coffre) || {}).n || 0);
    if (!s.ancre && secret && s.coffre.attestation && !bloquantes(s.controle).length) await ancrerEmballage(s, emb, secret);
  }
  /**
   * Après la première lecture des journaux (réglages connus) : l'administrateur crée la clé d'un module déclaré après
   * la création du coffre (module Patients, étape 5) et la remet selon les droits.
   */
  async function apresSynchro(s) {
    if (!v2(s) || s.formation || !attestateur(s) || bloquantes(s.controle).length) return;
    var manquantes = clesDeclarees(s).filter(function (n) { return !s.coffre.cles[n]; });
    if (!manquantes.length) return;
    await s.modifierCoffre(async function (cf, comptes) {
      var t = travail(s);
      manquantes.forEach(function (n) { T.ajouterCle(t, cf, n); });
      await T.appliquerDroits(t, cf, comptesPourCles(comptes), aDroitPour(s));
    });
    oublierJournaux(s);
    await s.synchroniser();
    await s.tracer('CLE_MODULE', { cles: manquantes, libelle: 'clé créée pour ' + manquantes.map(function (n) { var m = SIC.modules && SIC.modules.obtenir(n), d = /^d-/.test(n) && CH() ? CH().definition(config(s), n.slice(2)) : null; return m ? m.libelle : d ? 'la donnée « ' + d.libelle + ' »' : n; }).join(', ') });
  }
  /** Crée les clés manquantes (modules déclarés, clés propres des données) : connexion d'un administrateur, démonstration. */
  Session.prototype.creerClesManquantes = function () { return apresSynchro(this); };
  function nouvelId() { return 'k' + id8(); }
  /** Première génération produite par la clé maîtresse en vigueur, pour chaque clé de droit (copie sous scellé). */
  function basesDe(coffre) {
    if (!coffre || coffre.version !== 2) return null;
    var r = {};
    Object.keys(coffre.cles).sort().forEach(function (n) { r[n] = T.baseDe(coffre.cles[n]); });
    return r;
  }
  /** Résumé du trousseau pour l'affichage : générations, clés de chaque compte (administrateur). */
  function resumeTrousseau(s) {
    if (!v2(s)) return null;
    var cf = s.coffre, parCompte = {};
    (cf.enveloppes || []).forEach(function (e) {
      if (e.g === 'm' || e.pour === T.SECOURS) return;
      (parCompte[e.pour] = parCompte[e.pour] || {})[e.cle] = true;
    });
    var m = {};
    (cf.enveloppes || []).forEach(function (e) { if (e.g === 'm' && e.pour !== T.SECOURS) m[e.pour] = true; });
    var res = { cles: {}, comptes: {} };
    Object.keys(cf.cles).forEach(function (n) { res.cles[n] = cf.cles[n].courante; });
    Object.keys(parCompte).forEach(function (id) { res.comptes[id] = { cles: Object.keys(parCompte[id]).sort(), maitresses: !!m[id] }; });
    return res;
  }

  /**
   * Règle de remise de la clé d'un module (0.4.4) : un rôle dans le module et au moins un service où il est activé
   * (l'encadrement et les rôles « tous services » suivent l'activation du module ; l'administrateur a toujours la clé).
   */
  function aDroitPour(s) {
    var cfg = config(s);
    function regle(m) {
      var d = m.droits, codes = d.rolesConfig(cfg).map(function (r) { return r.code; });
      return function (compte) {
        var roles = compte.roles || [];
        if (!roles.some(function (r) { return codes.indexOf(r) >= 0; })) return false;
        if (d.membre && !d.membre(roles, cfg)) return false;   // module où un rôle n'entre que par ses accès (Agenda)
        if (!d.activation || !d.activation(cfg) || d.consulteInactifs(roles)) return true;
        var svs = d.voitTousServices(roles, cfg) ? (cfg.services || []).map(function (x) { return x.code; }) : (compte.services || []);
        return svs.some(function (c) { return d.serviceActif(cfg, c); });
      };
    }
    var regles = {};
    (SIC.modules ? SIC.modules.liste() : [Object.assign({ id: 'isocont' }, moduleActif())]).forEach(function (m) { if (!m.reference && m.droits) regles[m.id || 'isocont'] = regle(m); });
    return function (nom, compte) {
      if (nom === T.PLATEFORME || (compte.roles || []).indexOf('ADMIN') >= 0) return true;
      if (regles[nom]) return regles[nom](compte);
      // Clé propre d'une donnée (0.18.0) : remise aux seuls rôles qui la voient ou la saisissent (administrateur toujours)
      if (/^d-/.test(nom)) { var dc = CH() && CH().definition(cfg, nom.slice(2)); return !!(dc && dc.protection === 'cle' && dc.actif && CH().aDroitCle(dc, compte.roles)); }
      // Module de référence (Patients) : sa clé suit les droits aux modules qui en dépendent
      var m = SIC.modules && SIC.modules.obtenir(nom);
      if (m && m.reference) return SIC.modules.dependants(nom).some(function (x) { return regles[x.id] && regles[x.id](compte); });
      return true;
    };
  }
  /** Comptes vus par la remise des clés : un compte temporaire expiré est traité comme désactivé (retrait de droit). */
  function comptesPourCles(comptes) {
    var now = Date.now();
    return comptes.map(function (c) { return c.actif && SIC.comptes && SIC.comptes.validite(c, now).expire ? Object.assign({}, c, { actif: false }) : c; });
  }
  /** Trousseau de travail d'une modification du coffre : installé seulement si l'écriture réussit (modifierCoffre). */
  function travail(s) {
    if (!s.trousseauEnAttente) s.trousseauEnAttente = T.copier(s.trousseau);
    return s.trousseauEnAttente;
  }
  function installerJeux(s, t) {
    var ancien = s.trousseau;
    s.trousseau = t; s.cle = t[T.PLATEFORME];
    (s.journauxActifs || []).forEach(function (j) { if (j.nom === SOCLE) j.cle = t[T.PLATEFORME]; else if (t[j.nom]) j.cle = t[j.nom]; });
    if (ancien && ancien !== t) T.effacer(ancien);
  }
  /**
   * Confronte le trousseau en mémoire au coffre relu (générations, clés maîtresses, clé personnelle) et le rouvre au
   * besoin. Retourne false si la session doit être verrouillée (accès retiré, clé personnelle renouvelée ailleurs).
   * Appelée avant toute modification du coffre, à chaque relecture du coffre (mode formation compris) et au retour
   * du mode formation : un poste n'écrit jamais longtemps avec une génération périmée.
   */
  async function confronterTrousseau(s, coffre) {
    if (!coffre || !s.coffre || !s.trousseau || !s.privee8) return true;
    if (coffre.version !== 2) return true;
    var pour = s.utilisateur && s.utilisateur.id === 'secours' ? T.SECOURS : s.utilisateur && s.utilisateur.id;
    var a = coffre.agents && coffre.agents[pour], b = s.coffre.agents && s.coffre.agents[pour];
    if (!a || (b && a.publique !== b.publique)) {
      s.verrouiller();
      s.notifier({ source: 'verrou', message: !a ? 'Votre accès a été retiré : reconnectez-vous ou adressez-vous à l’administrateur.' : 'Vos clés ont été renouvelées : reconnectez-vous.' });
      return false;
    }
    var controle = await controler(s, coffre);
    if (bloquantes(controle).length && !attestateur(s)) {
      s.verrouiller();
      s.notifier({ source: 'verrou', message: bloquantes(controle)[0].texte + ' Prévenez l’administrateur.' });
      return false;
    }
    s.controle = controle;
    if (attestateur(s) && s.attest && controle.etat) {
      try { var cps = (await C.dechiffrerJSON(s.cle, C.deb64(coffre.comptes), 'comptes')).comptes; s.controle = { etat: controle.etat, anomalies: controle.anomalies.concat(await A.verifierAdmin(s.attest, coffre, controle.etat, cps)) }; }
      catch (e) { /* comptes relus ensuite par la synchronisation */ }
    }
    if (!controle.etat && s.coffre.attestation && coffre.attestation) return true;   // administrateur : attestation invalide, trousseau inchangé (réparation)
    if (controle.etat) retenirN(s, coffre, controle.etat.n);
    var identique = (coffre.attestation || {}).signature === (s.coffre.attestation || {}).signature && JSON.stringify(coffre.cles) === JSON.stringify(s.coffre.cles) && JSON.stringify((coffre.enveloppes || []).filter(function (e) { return e.pour === pour; }).map(function (e) { return e.cle + e.g; })) === JSON.stringify((s.coffre.enveloppes || []).filter(function (e) { return e.pour === pour; }).map(function (e) { return e.cle + e.g; }));
    if (identique) return true;
    var t = await T.ouvrir(coffre, pour, await C.importerPrivee(s.privee8), controle.etat);
    if (!(await t[T.PLATEFORME].cle(t[T.PLATEFORME].courante))) {
      T.effacer(t); s.verrouiller();
      s.notifier({ source: 'verrou', message: 'Votre accès a été retiré ou vos clés ne sont plus à jour : reconnectez-vous ou adressez-vous à l’administrateur.' });
      return false;
    }
    // Jamais de recul de la génération d'écriture (coffre restauré ou modifié) : on garde la plus haute détenue
    // (sans attestation seulement : avec, la génération d'écriture est celle de l'état signé)
    if (!controle.etat) for (var n in s.trousseau) {
      if (t[n] && s.trousseau[n].courante > t[n].courante && (await s.trousseau[n].cle(s.trousseau[n].courante))) {
        var g = s.trousseau[n].courante, o = await s.trousseau[n].octetsDe(g);
        if (o) { t[n].octets[g] = o.slice(); t[n].courante = g; }
      }
    }
    var avaient = signatureCles(s);
    installerJeux(s, t);
    await ouvrirAttestation(s, coffre);
    if (avaient !== signatureCles(s)) oublierJournaux(s);   // clé d'un module reçue ou retirée : journaux relus
    return true;
  }

  /** Vrai si la session détient la clé du module (coffre version 1 : toujours). */
  function accesModule(s) {
    if (!v2(s) || s.formation) return true;
    var j = s.trousseau && s.trousseau[idModule()];
    return !!j && (!!j.maitresse || Object.keys(j.octets).length > 0);
  }

  function oublierJournaux(s) {
    s.epoque = (s.epoque || 0) + 1;
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
    var code = C.nouveauCodeSecours(), cles = await A.creerCles(), ancre = await C.ancreDe(cles.publique);
    var r = await T.creerCoffre({ compte: compte, motDePasse: admin.motDePasse, codeSecours: code, modules: modulesDeclares(), id: nouvelId, ancre: ancre });
    installerTrousseau(this, r.trousseau, r.privee8);
    this.comptes = [compte]; this.utilisateur = compte; this.attest = cles; this.ancre = ancre;
    r.coffre.comptes = await chiffrerComptes(this.cle, this.comptes);
    var etat = await A.signer(cles, r.trousseau, r.coffre, this.comptes, { n: 1, par: compte.id });
    this.coffre = await this.dossier.ecrireCoffre(r.coffre, undefined);
    this.controle = { etat: etat, anomalies: [] }; retenirN(this, this.coffre, 1);
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
    await apresOuverture(this, trouve, motDePasse);
    await this.synchroniser();
    await apresSynchro(this);
  };

  Session.prototype.connexionCleSecurite = async function () {
    var embs = this.coffre.emballages.filter(function (e) { return e.methode === 'cle'; });
    var r = await C.deballerCleSecurite(embs, v2(this));
    if (v2(this)) await ouvrirAvecPrivee(this, r.emballage.userId || T.SECOURS, r.cle); else trousseauV1(this, r.cle);
    await lireComptes(this);
    var u = this.comptes.filter(function (c) { return c.id === r.emballage.userId; })[0];
    if (u && SIC.comptes.validite(u, Date.now()).expire) { this.verrouiller(); throw new Error('Ce compte temporaire a expiré : demandez sa prolongation à l’administrateur.'); }
    if (r.emballage.userId && (!u || !u.actif)) { this.verrouiller(); throw new Error('Ce compte est désactivé.'); }
    this.utilisateur = u && u.actif ? u : { id: 'secours', login: 'secours', nom: 'Déblocage par clé de sécurité', roles: ['ADMIN'], actif: true };
    await apresOuverture(this, null, null);
    await this.synchroniser();
    await apresSynchro(this);
  };

  Session.prototype.connexionCodeSecours = async function (code) {
    var emb = this.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
    if (!emb) throw new Error('Aucun code de secours enregistré.');
    var secret;
    try { secret = await C.deballerCodeSecours(emb, code, v2(this)); } catch (e) { throw new Error('Code de secours incorrect.'); }
    if (v2(this)) await ouvrirAvecPrivee(this, T.SECOURS, secret); else trousseauV1(this, secret);
    await lireComptes(this);
    this.utilisateur = { id: 'secours', login: 'secours', nom: 'Déblocage par code de secours', roles: ['ADMIN'], actif: true };
    await apresOuverture(this, emb, code);
    await this.synchroniser();
    await apresSynchro(this);
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
    this.trousseau = null; this.privee8 = null; this.cleV1 = null; this.moduleChoisi = undefined;
    A.effacerCles(this.attest); this.attest = null; this.ancre = null; this.controle = null;
    this.cle = null; this.utilisateur = null; this.comptes = [];
    this.donnees = null; this.cleDonnees = null; this.formation = false; oublierJournaux(this); this.preferences = null;
    this.apercu = null;
  };

  /**
   * Relit le coffre, applique `modif`, réécrit (contrôle de révision). Administrateur (version 2) : l'attestation est
   * vérifiée avant la modification (aucune remise de clé sur un coffre modifié hors de l'outil), puis le nouvel état est
   * signé. `options.reparation` : codes d'anomalies que l'opération répare (elle est alors permise malgré elles).
   */
  Session.prototype.modifierCoffre = async function (modif, options) {
    var coffre = await this.dossier.lireCoffre();
    if (!(await confronterTrousseau(this, coffre))) throw new Error('Session verrouillée : vos clés ont changé.');
    var avant = this.coffre, s = this, permis = (options && options.reparation) || [];
    this.coffre = coffre;
    this.trousseauEnAttente = null; this.priveeEnAttente = null; this.attestEnAttente = null; this.ancreEnAttente = null;
    var signe = null;
    try {
      await lireComptes(this);
      var att = attestateur(this);   // mode formation compris : le coffre et le trousseau sont ceux des données réelles
      if (att) {
        var ctl = await anomaliesAdmin(this, coffre, this.comptes, false);
        var genantes = bloquantes(ctl).filter(function (x) { return permis.indexOf(x.code) < 0; });
        if (genantes.length) throw new Error('Coffre modifié hors de l’outil : ' + genantes.map(function (x) { return x.texte; }).join(' ') + ' Aucune modification possible avant réparation (Administration → Comptes et sécurité).');
        this.controle = ctl;
      } else if (v2(this) && bloquantes(this.controle).length) throw new Error(bloquantes(this.controle)[0].texte);
      await modif(coffre, this.comptes);
      var jeuComptes = this.trousseauEnAttente ? this.trousseauEnAttente[T.PLATEFORME] : this.cle;
      coffre.comptes = await chiffrerComptes(jeuComptes, this.comptes);
      if (att) signe = await signerCoffre(this, coffre, this.trousseauEnAttente || this.trousseau, options && options.nMin);
      this.coffre = await this.dossier.ecrireCoffre(coffre, coffre.rev);
    } catch (e) {
      // Rien n'est installé : ni nouvelle génération, ni nouvelle clé maîtresse (aucune saisie chiffrée avec une clé perdue)
      if (this.trousseauEnAttente) T.effacer(this.trousseauEnAttente);
      if (this.priveeEnAttente) this.priveeEnAttente.fill(0);
      A.effacerCles(this.attestEnAttente);
      this.trousseauEnAttente = null; this.priveeEnAttente = null; this.attestEnAttente = null; this.ancreEnAttente = null; this.coffre = avant;
      throw e;
    }
    if (this.trousseauEnAttente) { installerJeux(this, this.trousseauEnAttente); this.trousseauEnAttente = null; }
    if (this.priveeEnAttente) { if (this.privee8) this.privee8.fill(0); this.privee8 = this.priveeEnAttente; this.priveeEnAttente = null; }
    if (this.attestEnAttente) { if (this.attest !== this.attestEnAttente) A.effacerCles(this.attest); this.attest = this.attestEnAttente; this.attestEnAttente = null; }
    if (this.ancreEnAttente) { this.ancre = this.ancreEnAttente; this.ancreEnAttente = null; }
    if (signe) { this.controle = { etat: signe, anomalies: [] }; retenirN(this, this.coffre, signe.n); }
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
      var agent = null, emb, ancre = v2(s) ? await ancreSession(s) : null;
      if (v2(s)) {
        // Paire et emballage préparés ici (calcul lent) ; enveloppes calculées sur le coffre relu, dans l'écriture
        var paire = await C.nouvellePaire(), p8 = await C.exporterPrivee(paire.privateKey);
        emb = await C.emballerMotDePasse(C.paquet(p8, ancre), c.motDePasse, it); p8.fill(0);
        agent = { publique: await C.exporterPublique(paire.publicKey), cle: paire.publicKey };
      }
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
        if (p.agent) coffre.agents[p.compte.id] = { publique: p.agent.publique };
      });
      for (var k = 0; k < prepares.length; k++) {
        var p = prepares[k];
        if (p.agent) coffre.enveloppes = coffre.enveloppes.concat(await T.enveloppesPour(s.trousseau, coffre, p.compte.id, p.agent.cle, T.droitsDe(coffre, p.compte, aDroitPour(s))));
      }
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
        // Enveloppes : retirées par l'application des droits ci-dessous, qui crée alors les nouvelles générations.
        // Clé personnelle oubliée : à la réactivation, une nouvelle est créée (réinitialisation du mot de passe).
      }
      if (coffre.version === 2) {
        await T.appliquerDroits(travail(s), coffre, comptesPourCles(comptes), aDroitPour(s));   // clés selon les droits, nouvelle génération si retrait
        if (!actif) delete coffre.agents[userId];
      }
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
    var ancre = v2(this) ? await ancreSession(this) : null;
    // Par l'agent lui-même : sa partie privée réemballée. Par l'administrateur (version 2) : il ne connaît pas la partie
    // privée de l'agent, il lui crée une nouvelle clé personnelle et lui remet de nouvelles enveloppes.
    // Premier changement par l'agent (mot de passe provisoire) : il crée sa propre clé personnelle, que l'administrateur
    // n'a jamais connue (décision du porteur) ; il se remet lui-même ses clés.
    // Changement par l'agent : nouvelle clé personnelle à chaque fois (un ancien mot de passe resté dans l'historique
    // du coffre n'ouvre plus qu'une clé sans enveloppe) ; ses clés de sécurité, liées à l'ancienne clé, sont retirées.
    var nouvellePaire = v2(this);
    var emb = v2(this) ? (nouvellePaire ? null : await C.emballerMotDePasse(s.privee8, motDePasse, it)) : await C.emballerMotDePasse(s.cleV1, motDePasse, it);
    await this.modifierCoffre(async function (coffre, comptes) {
      var c = comptes.filter(function (x) { return x.id === userId; })[0];
      if (!c) throw new Error('Compte introuvable.');
      coffre.emballages = coffre.emballages.filter(function (e) { return !(e.methode === 'mdp' && e.userId === userId); });
      if (!emb) {
        var a = await T.nouvelAgent(s.trousseau, coffre, c, motDePasse, it, aDroitPour(s), ancre);
        var ancien = coffre.agents[userId], preuves;
        // Clé personnelle créée par l'agent lui-même (sans les clés d'attestation) : preuve de continuité pour
        // l'administrateur, tirée de son ancienne partie privée (0.5.0)
        if (!provisoire && !attestateur(s) && ancien && s.privee8 && s.controle && s.controle.etat && s.controle.etat.temoin) {
          preuves = (ancien.preuves || []).concat([await A.preuve(s.privee8, ancien.publique, s.controle.etat.temoin, userId, a.publique)]);
        }
        if (provisoire) a.privee8.fill(0); else s.priveeEnAttente = a.privee8;   // installée après l'écriture du coffre
        emb = a.emballage;
        coffre.agents[userId] = preuves ? { publique: a.publique, preuves: preuves } : { publique: a.publique };
        coffre.emballages = coffre.emballages.filter(function (e) { return e.userId !== userId; });   // clés de sécurité de l'ancienne paire
        coffre.enveloppes = coffre.enveloppes.filter(function (e) { return e.pour !== userId; }).concat(a.enveloppes);
      }
      emb.id = nouvelId(); emb.userId = userId; emb.login = c.login;
      coffre.emballages.push(emb);
      c.mdpProvisoire = provisoire;
    }, options && options.reparation ? { reparation: ['agents'] } : undefined);
    var c3 = this.comptes.filter(function (x) { return x.id === userId; })[0];
    await this.tracer(userId === this.utilisateur.id ? 'MDP_CHANGE' : 'MDP_REINIT', { login: c3 ? c3.login : userId });
  };

  Session.prototype.changerMonMotDePasse = function (motDePasse) {
    return this.reinitialiserMotDePasse(this.utilisateur.id, motDePasse);
  };

  /** Trousseau en résumé : { cles: { nom: génération courante }, comptes: { id: { cles, maitresses } } }, ou null (version 1). */
  Session.prototype.resumeTrousseau = function () { return resumeTrousseau(this); };

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
    var blanc = await T.appliquerDroits(jeuxCopie, essai, comptesPourCles(this.comptes), aDroit);
    T.effacer(jeuxCopie);
    if (!blanc.change) return res;
    await this.modifierCoffre(async function (cf, comptes) { res = await T.appliquerDroits(travail(s), cf, comptesPourCles(comptes), aDroit); });
    if (res.generations.length) await this.tracer('GENERATION', { cles: res.generations, maitresses: res.maitresses.length ? res.maitresses : undefined, libelle: 'nouvelle génération de clé après un retrait de droit' });
    return res;
  };

  /** Comptes actifs dont le trousseau est incomplet : [{ id, nom, cles }] (administrateur, coffre version 2). */
  Session.prototype.trousseauxIncomplets = function () {
    if (!v2(this) || this.formation || !this.etat) return [];
    var s = this;
    return T.incomplets(this.coffre, comptesPourCles(this.comptes), aDroitPour(this)).map(function (x) { var c = s.comptes.filter(function (y) { return y.id === x.id; })[0]; return { id: x.id, nom: c ? c.nom : x.id, cles: x.cles }; });
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
    var cles = await A.creerCles(), ancre = await C.ancreDe(cles.publique);
    var r = await T.migrerCoffre(coffre, this.cleV1, this.comptes, { modules: modulesDeclares(), adminId: this.utilisateur.id, motDePasseAdmin: motDePasse, codeSecours: code, provisoire: C.nouveauMotDePasseProvisoire, id: nouvelId, aDroit: aDroitPour(this), ancre: ancre });
    var provisoires = r.provisoires.map(function (p) { p.compte.mdpProvisoire = true; return { nom: p.compte.nom, login: p.compte.login, motDePasse: p.motDePasse, roles: p.compte.roles, services: p.compte.services || [], finValidite: p.compte.finValidite || '' }; });
    r.coffre.comptes = await chiffrerComptes(r.trousseau[T.PLATEFORME], this.comptes);
    var etat = await A.signer(cles, r.trousseau, r.coffre, this.comptes, { n: 1, par: this.utilisateur.id });
    this.coffre = await this.dossier.ecrireCoffre(r.coffre, coffre.rev);
    T.effacer(this.trousseau);
    installerTrousseau(this, r.trousseau, r.privee8);
    this.attest = cles; this.ancre = ancre; this.controle = { etat: etat, anomalies: [] }; retenirN(this, this.coffre, 1);
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
    var emb = await C.emballerCleSecurite(v2(this) ? C.paquet(secret, await ancreSession(this)) : secret, this.utilisateur.login, libelle);
    emb.id = 'k' + id8(); emb.userId = this.utilisateur.id === 'secours' ? null : this.utilisateur.id;
    await this.modifierCoffre(async function (coffre) { coffre.emballages.push(emb); });
    await this.tracer('CLE_AJOUT', { libelle: emb.libelle, rpId: emb.rpId });
    return s;
  };

  /**
   * Retire une clé de sécurité. Trousseau : sa propre clé → nouvelle clé personnelle (mot de passe demandé), pour qu'une
   * clé perdue ne serve plus, même avec l'historique du coffre ; la clé d'un autre agent → par la réinitialisation de
   * son mot de passe ; une YubiKey de secours → retirée (si elle est perdue, renouveler le code de secours).
   */
  Session.prototype.retirerEmballage = async function (idEmb, motDePasse) {
    var s = this, emb = (this.coffre.emballages || []).filter(function (e) { return e.id === idEmb; })[0];
    if (v2(this) && emb && emb.userId) {
      if (emb.userId !== this.utilisateur.id) throw new Error('Pour retirer la clé de sécurité d’un autre agent, réinitialisez son mot de passe : ses clés de sécurité sont alors retirées et sa clé personnelle renouvelée.');
      if (!motDePasse) throw new Error('Votre mot de passe est nécessaire pour renouveler votre clé personnelle.');
      var mien = this.coffre.emballages.filter(function (e) { return e.methode === 'mdp' && e.userId === s.utilisateur.id; });
      var ok = false;
      for (var i = 0; i < mien.length && !ok; i++) { try { await C.deballerMotDePasse(mien[i], motDePasse, true); ok = true; } catch (e) { /* suivant */ } }
      if (!ok) throw new Error('Mot de passe incorrect.');
      await this.reinitialiserMotDePasse(this.utilisateur.id, motDePasse);   // nouvelle paire, clés de sécurité retirées
      await this.tracer('CLE_RETRAIT', { id: idEmb });
      return;
    }
    await this.modifierCoffre(async function (coffre) {
      coffre.emballages = coffre.emballages.filter(function (e) { return e.id !== idEmb; });
    });
    await this.tracer('CLE_RETRAIT', { id: idEmb });
  };

  Session.prototype.nouveauCodeSecours = async function () {
    var s = this, code = C.nouveauCodeSecours();
    if (v2(this)) {
      // Nouvelle clé de secours : clés maîtresses réenveloppées ; l'ancien code et une YubiKey de secours n'ouvrent plus rien
      var ancre = await ancreSession(this);
      await this.modifierCoffre(async function (coffre) { await T.nouveauSecours(s.trousseau, coffre, code, nouvelId(), ancre); }, { reparation: ['secours'] });
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

  // ------------------------------------------------- Attestation : état, réparations, compromission (0.5.0)
  /** État de l'attestation pour l'affichage : { etat, anomalies, attestateur } ou null (coffre version 1). */
  Session.prototype.etatAttestation = function () {
    if (!v2(this)) return null;
    return { etat: this.controle && this.controle.etat, anomalies: (this.controle && this.controle.anomalies) || [], attestateur: attestateur(this) };
  };
  /** Contrôle complet de l'attestation (administrateur : comptes, parties publiques, historique). */
  Session.prototype.controlerAttestation = async function () {
    if (!v2(this)) return null;
    var coffre = await this.dossier.lireCoffre();
    if (attestateur(this)) {
      var cps = this.comptes;
      try { cps = (await C.dechiffrerJSON(this.cle, C.deb64(coffre.comptes), 'comptes')).comptes; } catch (e) { /* comptes en mémoire */ }
      this.controle = await anomaliesAdmin(this, coffre, cps, true);
    } else this.controle = await controler(this, coffre);
    return this.etatAttestation();
  };

  /**
   * Renouvellement de toutes les clés (décision du porteur : après une restauration du coffre, ou une version antérieure
   * remise en place) : nouvelles clés maîtresses et nouvelle génération de chaque clé, au-dessus de toute génération déjà
   * employée ; les générations attestées restent remises aux détenteurs. Les mots de passe ne changent pas.
   */
  Session.prototype.renouvelerCles = async function () {
    if (!attestateur(this) || this.formation) throw new Error('Réservé à un administrateur, sur les données réelles.');
    var s = this, h = await historiqueAttestations(this, await this.dossier.lireCoffre()), res;
    await this.modifierCoffre(async function (cf, comptes) {
      var t = travail(s), depuis = await preparerRenouvellement(s, cf, t, h);
      res = await T.appliquerDroits(t, cf, comptesPourCles(comptes), aDroitPour(s), { tout: true, depuis: depuis });
      delete cf.restaureLe; cf.renouveleLe = new Date().toISOString();
    }, { reparation: ['restaure', 'ancienne', 'cles'], nMin: h.n });
    await this.tracer('RENOUVELLEMENT', { cles: res.generations, libelle: 'renouvellement de toutes les clés' });
    return res;
  };

  /**
   * Remet en place la dernière version du coffre dont l'attestation est intacte (signature, comptes, parties publiques),
   * puis renouvelle toutes les clés. La clé personnelle de l'administrateur qui répare est gardée telle qu'elle est.
   * Les comptes créés ou modifiés depuis cette version sont à refaire. Retourne la date de la version remise.
   */
  Session.prototype.remettreDerniereAttestee = async function () {
    if (!attestateur(this) || !this.attest || this.formation) throw new Error('Réservé à un administrateur, sur les données réelles.');
    // La version attestée au compteur le plus élevé (pas la plus récemment écrite : une version antérieure recopiée
    // par un tiers porte une attestation valide, mais un compteur plus bas)
    var s = this, actuel = await this.dossier.lireCoffre(), vs = await this.dossier.versionsCoffre(), choisi = null, comptesChoisis = null, nChoisi = -1;
    for (var i = 0; i < vs.length; i++) {
      var c = vs[i].coffre;
      if (!vs[i].valide || !c || c.version !== 2 || c.creeLe !== actuel.creeLe || !c.attestation || c.attestation.publique !== this.attest.publique) continue;
      var r = await A.verifier(c, this.ancre);
      if (!r.etat || r.anomalies.some(function (x) { return x.bloquante && x.code !== 'restaure'; })) continue;
      var cps;
      try { cps = (await C.dechiffrerJSON(this.cle, C.deb64(c.comptes), 'comptes')).comptes; } catch (e) { continue; }
      if ((await A.verifierAdmin(this.attest, c, r.etat, cps)).length || r.etat.n <= nChoisi) continue;
      choisi = c; comptesChoisis = cps; nChoisi = r.etat.n;
    }
    if (!choisi) throw new Error('Aucune version attestée du coffre dans l’historique. Utilisez la copie sous scellé (restauration du coffre), puis renouvelez les clés.');
    var h = await historiqueAttestations(this, actuel), etat = A.etatDe(choisi);
    var moi = this.utilisateur.id === 'secours' ? T.SECOURS : this.utilisateur.id, userId = moi === T.SECOURS ? null : moi;
    await this.modifierCoffre(async function (cf, comptes) {
      var rev = cf.rev, mien = cf.agents[moi], mesEmb = cf.emballages.filter(function (e) { return e.userId === userId && (userId || e.methode !== 'mdp'); });
      Object.keys(cf).forEach(function (k) { delete cf[k]; });
      Object.assign(cf, JSON.parse(JSON.stringify(choisi)));
      cf.rev = rev; delete cf.archiveLe; delete cf.restaureLe;
      if (mien) {   // la partie privée de la session reste utilisable
        cf.agents[moi] = { publique: mien.publique };
        cf.emballages = cf.emballages.filter(function (e) { return !(e.userId === userId && (userId || e.methode !== 'mdp')); }).concat(mesEmb);
      }
      comptes.splice.apply(comptes, [0, comptes.length].concat(comptesChoisis));
      var t = travail(s), depuis = await preparerRenouvellement(s, cf, t, h);
      await T.appliquerDroits(t, cf, comptesPourCles(comptes), aDroitPour(s), { tout: true, depuis: depuis });
      cf.renouveleLe = cf.remiseAttesteeLe = new Date().toISOString();
    }, { reparation: TOUTES, nMin: h.n });
    await this.tracer('REMISE_ATTESTEE', { libelle: 'dernière version attestée du coffre remise en place, clés renouvelées', etatDu: etat.le });
    return etat.le;
  };

  /**
   * Compromission (décision du porteur) : tout renouveler. Nouvelles clés maîtresses et générations, nouvelles clés
   * d'attestation, nouveau code de secours, nouvelle clé personnelle pour chaque compte actif : l'administrateur garde son
   * mot de passe (`motDePasse`), les autres reçoivent un mot de passe provisoire ; clés de sécurité à réenregistrer.
   * Retourne { codeSecours, provisoires: [fiches] }.
   */
  Session.prototype.renouvelerTout = async function (motDePasse) {
    if (!attestateur(this) || this.formation) throw new Error('Réservé à un administrateur, sur les données réelles.');
    var s = this, moi = this.utilisateur.id, secours = moi === 'secours';
    if (!secours) {
      var mien = this.coffre.emballages.filter(function (e) { return e.methode === 'mdp' && e.userId === moi; }), ok = false;
      for (var i = 0; i < mien.length && !ok; i++) { try { (await C.deballerMotDePasse(mien[i], motDePasse || '', true)).fill(0); ok = true; } catch (e) { /* suivant */ } }
      if (!ok) throw new Error('Mot de passe incorrect.');
    }
    var cles = await A.creerCles(), ancre = await C.ancreDe(cles.publique), code = C.nouveauCodeSecours();
    var h = await historiqueAttestations(this, await this.dossier.lireCoffre());
    var actifs = comptesPourCles(this.comptes).filter(function (c) { return c.actif; }), nouvelles = {}, provisoires = [];
    for (var k = 0; k < actifs.length; k++) {
      var c = actifs[k], lui = c.id === moi, mdp = lui ? motDePasse : C.nouveauMotDePasseProvisoire();
      var p = await C.nouvellePaire(), p8 = await C.exporterPrivee(p.privateKey);
      var emb = await C.emballerMotDePasse(C.paquet(p8, ancre), mdp, lui ? undefined : C.ITERATIONS_PROVISOIRE);
      emb.id = nouvelId(); emb.userId = c.id; emb.login = c.login;
      nouvelles[c.id] = { publique: await C.exporterPublique(p.publicKey), emb: emb, p8: lui ? p8 : null };
      if (!lui) { p8.fill(0); provisoires.push({ nom: c.nom, login: c.login, motDePasse: mdp, roles: c.roles, services: c.services || [], finValidite: c.finValidite || '' }); }
    }
    await this.modifierCoffre(async function (cf, comptes) {
      var manquants = comptesPourCles(comptes).filter(function (c) { return c.actif && !nouvelles[c.id]; });
      if (manquants.length) throw new Error('Des comptes ont été créés ou réactivés pendant l’opération : recommencez.');
      cf.agents = { secours: cf.agents.secours }; cf.emballages = []; cf.enveloppes = [];
      Object.keys(nouvelles).forEach(function (id) {
        cf.agents[id] = { publique: nouvelles[id].publique }; cf.emballages.push(nouvelles[id].emb);
        var c = comptes.filter(function (x) { return x.id === id; })[0];
        if (c && id !== moi) c.mdpProvisoire = true;
      });
      if (nouvelles[moi]) s.priveeEnAttente = nouvelles[moi].p8;
      s.attestEnAttente = cles; s.ancreEnAttente = ancre;
      var t = travail(s), depuis = await preparerRenouvellement(s, cf, t, h);
      await T.appliquerDroits(t, cf, comptesPourCles(comptes), aDroitPour(s), { tout: true, depuis: depuis });
      await T.nouveauSecours(t, cf, code, nouvelId(), ancre);
      delete cf.restaureLe; cf.renouveleLe = cf.compromissionLe = new Date().toISOString();
    }, { reparation: ['absente', 'cles', 'restaure', 'ancienne', 'agents', 'secours'], nMin: h.n });
    await this.tracer('COMPROMISSION', { libelle: actifs.length + ' compte(s) : nouvelle clé personnelle', nbComptes: actifs.length });
    if (secours) this.verrouiller();   // la clé de secours a changé : reconnexion avec le nouveau code
    return { codeSecours: code, provisoires: provisoires };
  };

  // ---------------------------------------------------------- Journal
  /** Rôles de l'utilisateur : les mêmes dans les données réelles et dans le jeu de formation. */
  Session.prototype.roles = function () { var c = this.compteEffectif(); return c ? c.roles : []; };
  /** Codes des services visibles (tous pour un administrateur). */
  Session.prototype.mesServices = function () { return this.etat ? moduleAffiche(this).droits.servicesDe(this.compteEffectif(), this.etat.config) : []; };

  // ---------------------------------------------------------- Modules affichés (étape 6)
  /**
   * Modules que l'agent peut ouvrir : il y a un rôle (accès du module), en détient la clé, et le module est activé
   * pour l'un de ses services (l'encadrement et l'administrateur consultent aussi les services désactivés).
   */
  Session.prototype.modulesAccessibles = function () {
    var s = this, cfg = config(this), c = this.compteEffectif();
    if (!c || !SIC.modules || !SIC.modules.affiches) return [moduleActif()];
    return SIC.modules.affiches().filter(function (m) {
      if (!m.droits || !aCle(s, m.id)) return false;
      if (m.droits.membre && !m.droits.membre(c.roles, cfg)) return false;
      return m === moduleActif() || m.droits.servicesDe(c, cfg).length > 0 || (c.roles || []).indexOf('ADMIN') >= 0;
    });
  };
  /** Choix du module affiché (identifiant), gardé pour la session ; un module inaccessible est refusé. */
  Session.prototype.choisirModule = function (id) {
    var ok = this.modulesAccessibles().some(function (m) { return m.id === id; });
    this.moduleChoisi = ok ? id : null;
    return ok;
  };
  /** La session détient-elle la clé du module (fenêtre Patients : clé remise à qui a droit à un module qui en dépend) ? */
  Session.prototype.detientCle = function (id) { return aCle(this, id); };
  Session.prototype.moduleAffiche = function () { var m = moduleAffiche(this); return m.id || 'isocont'; };
  /** État reconstitué d'un module (le module principal : `etat`). */
  Session.prototype.etatModule = function (id) { return etatDe(this, SIC.modules ? SIC.modules.obtenir(id) : null); };

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
  Session.prototype.peut = function (type) { return moduleDe(type).droits.peut(this.roles(), type, config(this)); };
  /** Saisie permise à un agent pour lui-même (ses propres absences dans l'Agenda), même sans l'accès correspondant. */
  function permisPourSoi(s, type, data) {
    // Groupes d'agents (décision du 8 novembre 2026) : le cadre modifie les groupes de ses services (contrôle de chaque groupe changé)
    if (type === 'CONFIG' && data && data.cle === 'groupes' && (s.utilisateur.roles || []).indexOf('CADRE') >= 0) {
      var G = socle('groupes', './groupes.js');
      return !!G && G.controler(config(s).groupes, data.valeur, s.utilisateur);
    }
    // Liste commune des médecins (décision du 8 novembre 2026) : gérée aussi par les rôles désignés (cadre et secrétaire
    // par défaut) ; l'ancienne liste `psychiatres` est tenue à jour avec elle
    if (type === 'CONFIG' && data && (data.cle === 'medecins' || data.cle === 'psychiatres')) {
      var MD = socle('medecins', './medecins.js');
      return !!MD && MD.controler(config(s), data.cle, data.valeur, s.utilisateur);
    }
    // Liste commune des psychologues (0.20.0) : mêmes règles que celle des médecins
    if (type === 'CONFIG' && data && data.cle === 'psychologues') {
      var MP = socle('medecins', './medecins.js');
      return !!MP && MP.psychologues.controler(config(s), data.cle, data.valeur, s.utilisateur);
    }
    // Réglages qu'un module ouvre au cadre pour ses services (contrat : reglages.cadre[cle], contrôle du changement)
    if (type === 'CONFIG' && data && (s.utilisateur.roles || []).indexOf('CADRE') >= 0 && SIC.modules && SIC.modules.liste) {
      var mc = SIC.modules.liste().filter(function (x) { return x.reglages && x.reglages.cadre && typeof x.reglages.cadre[data.cle] === 'function'; })[0];
      if (mc) return !!mc.reglages.cadre[data.cle](config(s)[data.cle], data.valeur, s.utilisateur);
    }
    // Module qui déclare le type, y compris un module de référence (données complémentaires de la fiche patient)
    var d = SIC.modules && SIC.modules.moduleDuType ? SIC.modules.moduleDuType(type) : null, m = d && d.saisies && d.saisies.permisPourSoi ? d : moduleDe(type);
    return !!(m.saisies && m.saisies.permisPourSoi && m.saisies.permisPourSoi(type, data, s.utilisateur, { config: config(s), etat: etatDe(s, m), peut: function (t) { return s.peut(t); } }));
  }

  /**
   * Valeur d'une donnée ajoutée (`VALEUR`, 0.18.0) : permise selon les rôles réglés pour la donnée ; sans rôles de saisie
   * précisés, aux rôles qui écrivent déjà dans le module de rattachement. Lève une erreur explicite.
   */
  function ecritDans(s, idModule) {
    var m = SIC.modules && SIC.modules.obtenir(idModule);
    if (!m) return false;
    if (idModule === 'patients') return s.peut('PATIENT');
    return m.saisies.types.some(function (t) { try { return m.droits && m.droits.peut(s.roles(), t, config(s)); } catch (e) { return false; } });
  }
  function controlerValeur(s, data) {
    var c = CH().controlerSaisie('VALEUR', data || {}, s.roles(), { config: config(s), peutModule: function (c) { return ecritDans(s, c.module); } });
    // Valeur enregistrée sous sa forme contrôlée (ex. numéro de téléphone groupé par deux)
    if (data.op) data.op = CH().operation(c, data.op); else data.valeur = CH().valeur(c, data.valeur);
    data.journal = CH().journalDe(c);
  }
  /**
   * Retrait d'une note ou d'un élément libre de check-list (décision du porteur du 9 novembre 2026) : par son auteur, le
   * cadre ou l'administrateur. La note retirée reste dans l'historique.
   */
  function controlerRetrait(s, type, data) {
    var roles = s.roles();
    if (roles.indexOf('ADMIN') >= 0 || roles.indexOf('CADRE') >= 0) return;
    var v = type === 'COMPLEMENT' ? (((s.etat && s.etat.patients && s.etat.patients[data.patientId]) || {}).complements || {})[data.champ]
      : (((s.valeurs()[data.entite] || {})[data.id]) || {})[data.champ];
    var l = Array.isArray(v) ? v : (v && v.elements) || [], x = l.filter(function (e) { return e.id === data.op.retrait; })[0];
    if (x && x.par && x.par !== s.utilisateur.id) throw new Error('Seuls son auteur et le cadre retirent cet élément.');
  }
  /** Valeurs des données ajoutées portées par les saisies `VALEUR` (champs.js, reduireValeurs), recalculées au besoin. */
  Session.prototype.valeurs = function () {
    if (!this._valeurs || this._valeurs.n !== this.evts.length || this._valeurs.etat !== this.etat) {
      this._valeurs = { n: this.evts.length, etat: this.etat, v: CH() ? CH().reduireValeurs(this.evts, this.etat && this.etat.annules) : { patient: {}, medecin: {}, agent: {}, historique: { patient: {}, medecin: {}, agent: {} } } };
    }
    return this._valeurs.v;
  };
  Session.prototype.ecritDans = function (idModule) { return ecritDans(this, idModule); };

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
    if ((type === 'VALEUR' || type === 'COMPLEMENT') && data && data.op && data.op.retrait && !(options && options.sansControle)) controlerRetrait(this, type, data);
    if (type === 'VALEUR') { if (!(options && options.sansControle)) controlerValeur(this, data); }
    else {
      if (!(options && options.sansControle) && !this.peut(type) && !permisPourSoi(this, type, data)) throw new Error("Votre rôle ne permet pas cette action.");
      if (!(options && options.sansControle)) { controlerActivation(this, type, data); controlerModule(this, type, data); }
    }
    var at = (options && options.at) || new Date().toISOString();
    var by = (options && options.by) || this.utilisateur.id;
    var j = options && options.journalLot ? journaux(this).filter(function (x) { return x.nom === options.journalLot; })[0] : journalPour(this, journaux(this), type, data);
    var d = await dossierJournal(this, j, true);
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
    // Saisies liées (lots d'un même import rangés dans plusieurs journaux) : annuler l'un annule les autres. Les
    // annulations produites citent l'annulation d'origine (`origine`) : « Rétablir » l'une les rétablit toutes.
    if (type === 'ANNULATION' && data && data.cible && !(options && options.conjointe)) {
      var visee = this.evts.filter(function (x) { return x.id === data.cible; })[0];
      var autres = visee ? saisiesLiees(this.evts, visee).filter(function (x) { return !(this.etat && this.etat.annules[x.id]); }, this) : [];
      for (var k = 0; k < autres.length; k++) await this.enregistrer('ANNULATION', { cible: autres[k].id, motif: data.motif, origine: evt.id, conjointe: true }, undefined, Object.assign({}, options, { conjointe: true }));
    }
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
    var jeux = journaux(this).map(function (j) { return j.cle; }), illisibles = new Set(this.rejetes.map(function (r) { return r.nom; }));
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
    await this.modifierCoffre(async function (coffre) { coffre.scelle = { creeLe: creeLe, secours: secours.id, bases: basesDe(coffre) }; });
    var copie = JSON.parse(JSON.stringify(this.coffre));
    copie.emballages = copie.emballages.filter(function (e) { return e.methode !== 'mdp'; });
    copie.copieSousScelle = creeLe;
    await this.tracer('SCELLE', { libelle: 'copie du coffre sous scellé' });
    return copie;
  };

  /** État de la copie sous scellé : { creeLe, aJour } (à refaire si le code de secours a été renouvelé). */
  /**
   * État de la copie sous scellé : { creeLe, aJour }. À refaire si le code de secours a été renouvelé, ou (trousseau)
   * si une clé maîtresse a changé depuis (retrait d'un administrateur) : la copie ne couvrirait pas les générations suivantes.
   */
  Session.prototype.etatScelle = function () {
    var sc = this.coffre && this.coffre.scelle, secours = this.coffre && this.coffre.emballages.filter(function (e) { return e.methode === 'secours'; })[0];
    if (!sc) return null;
    var bases = v2(this) ? JSON.stringify(basesDe(this.coffre)) === JSON.stringify(sc.bases || null) : true;
    return { creeLe: sc.creeLe, aJour: !!secours && sc.secours === secours.id && bases };
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
  /** Saisies liées à `v` : autres lots d'un même enregistrement (`lien`), ou annulations conjointes (même `origine`). */
  function saisiesLiees(evts, v) {
    var d = v.data || {};
    if (v.type === 'LOT' && d.lien) return evts.filter(function (x) { return x.id !== v.id && x.type === 'LOT' && x.data && x.data.lien === d.lien; });
    if (v.type === 'ANNULATION') {
      var cle = d.origine || v.id;
      return evts.filter(function (x) { return x.id !== v.id && x.type === 'ANNULATION' && ((x.data && x.data.origine) || x.id) === cle; });
    }
    return [];
  }

  /**
   * Lot de saisies (import, jeu de démonstration, réglages importés). Les saisies de plusieurs modules sont rangées en
   * un lot par journal (fiches patient dans celui de Patients, le reste dans celui du module), liés par un même `lien` :
   * annuler l'un annule les autres. Retourne le lot du module affiché (ou le seul lot).
   */
  Session.prototype.enregistrerLot = async function (evenements, options) {
    var s = this, js = journaux(this), groupes = {}, ordre = [];
    evenements.forEach(function (x) {
      var nom = journalPour(s, js, x.type, x.data).nom;
      if (!groupes[nom]) { groupes[nom] = []; ordre.push(nom); }
      groupes[nom].push(x);
    });
    var libelle = (options && options.libelle) || '';
    if (ordre.length <= 1) return this.enregistrer('LOT', { evenements: evenements, libelle: libelle }, undefined, options);
    // Fournisseurs d'abord (Patients avant Isocont), comme la lecture
    var rang = {}; js.forEach(function (j, i) { rang[j.nom] = i; });
    ordre.sort(function (a, b) { return rang[a] - rang[b]; });
    var lien = 'l' + id8() + id8(), res = null;
    for (var i = 0; i < ordre.length; i++) {
      var e = await this.enregistrer('LOT', { evenements: groupes[ordre[i]], libelle: libelle, lien: lien, journal: ordre[i] }, undefined, Object.assign({}, options, { journalLot: ordre[i] }));
      if (ordre[i] === idModule() || !res) res = e;
    }
    return res;
  };

  Session.prototype.recalculer = function (info) {
    this.etat = moduleActif().saisies.reduire(this.evts);
    // Autres modules affichés dont la session détient la clé : leur propre état (étape 6)
    var s = this, etats = {};
    etats[idModule()] = this.etat;
    if (SIC.modules && SIC.modules.affiches) SIC.modules.affiches().forEach(function (m) {
      if (m !== moduleActif() && aCle(s, m.id)) etats[m.id] = m.saisies.reduire(s.evts);
    });
    this.etats = etats;
    this.notifier(info);
  };

  /**
   * Synchronisation : une seule à la fois (les appels se suivent dans une file). Deux lectures simultanées des mêmes
   * journaux, ou une lecture commencée avant un changement de clés ou de jeu (formation), pouvaient laisser la session
   * sans patients ni mesures jusqu'à la reconnexion (défaut signalé par le porteur le 7 novembre 2026).
   */
  Session.prototype.synchroniser = function () {
    var s = this;
    // Appel fait pendant une synchronisation (jeu de formation changé depuis un autre poste) : lecture immédiate,
    // sinon elle attendrait la fin de celle qui l'a demandée ; les journaux changés écartent l'ancienne lecture.
    if (s.dansSynchro) return synchroniserUneFois(s);
    var suite = (s.fileSynchro || Promise.resolve()).catch(function () {}).then(async function () {
      s.dansSynchro = true;
      try { return await synchroniserUneFois(s); } finally { s.dansSynchro = false; }
    });
    s.fileSynchro = suite;
    return suite;
  };
  async function synchroniserUneFois(s) { return Session.prototype.synchroniserUneFois.call(s); }
  Session.prototype.synchroniserUneFois = async function () {
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
        if (coffre && this.coffre && coffre.rev !== this.coffre.rev && v2(this) && this.privee8) {
          // Coffre modifié ailleurs (droits, générations) : trousseau confronté au coffre ; accès retiré → verrouillage
          if (!(await confronterTrousseau(this, coffre))) return 0;
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
    var js = journaux(this), nouveaux = [], epoque = this.epoque || 0, interruption = null;
    for (var k = 0; k < js.length; k++) {
      var j = js[k], d = null, r;
      try {
        d = await dossierJournal(this, j, false);
        if (!d) continue;   // journal pas encore créé (aucune saisie)
        r = await d.lireNouveaux(j.cle, j.connus);
      } catch (e) { interruption = e; continue; }   // journal momentanément illisible : les autres sont lus quand même
      if (r.interrompu) interruption = new Error(r.interrompu);
      // Fichiers illisibles : liste tenue à jour à chaque lecture (un fichier relu avec succès en sort)
      var lus = {}; r.evenements.forEach(function (e) { lus[e.id + '.enc'] = true; });
      var parNom = {}; j.rejetes.forEach(function (x) { if (!lus[x.nom]) parNom[x.nom] = x; });
      r.rejetes.forEach(function (x) { var a = parNom[x.nom]; x.essais = (a && a.essais || 0) + 1; x.journal = j.nom; parNom[x.nom] = x; });
      j.rejetes = Object.keys(parNom).map(function (n) { return parNom[n]; });
      j.evts = j.evts.concat(r.evenements);
      nouveaux = nouveaux.concat(r.evenements);
    }
    // Journaux oubliés pendant la lecture (clés ou jeu changés) : résultat écarté, la lecture suivante repart de zéro
    if ((this.epoque || 0) !== epoque || this.journauxActifs !== js) return 0;
    this.rejetes = [].concat.apply([], js.map(function (x) { return x.rejetes; }));
    this.interruption = interruption ? String(interruption.message || interruption) : null;
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
    var coffre = await this.dossier.lireCoffre();
    if (!(await confronterTrousseau(this, coffre))) return;
    this.coffre = coffre;
    oublierJournaux(this);
    await this.synchroniser();
  };

  SIC.Session = Session;
})(typeof self !== 'undefined' ? self : this);
