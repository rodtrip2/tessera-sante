// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — attestation du coffre (étape 4, version 0.5.0 ; décision du porteur du 7 novembre 2026 : un agent qui garde
 * un accès en écriture au partage et la clé de plateforme fait partie de la menace couverte).
 *
 * Le coffre est en clair sur le partage : parties publiques des agents, générations des clés, enveloppes, comptes
 * chiffrés par la clé de plateforme (que tout agent détient). Sans contrôle, un agent pourrait y substituer une partie
 * publique, se donner des rôles ou glisser une fausse génération, et se faire remettre des clés. L'attestation l'empêche :
 *
 *   coffre.attestation = { publique, temoin, privees, etat, signature }
 *     publique  clé ECDSA P-256 de signature ; son empreinte (« ancre ») est gardée dans chaque emballage, protégé par
 *               le mot de passe, la clé de sécurité ou le code de secours : une autre clé de signature est refusée
 *     temoin    partie publique ECDH du témoin (preuve de continuité des clés personnelles créées par les agents)
 *     privees   parties privées (signature, témoin), chiffrées par une clé tirée de la clé maîtresse de plateforme :
 *               seuls l'administrateur et la clé de secours les ouvrent
 *     etat      texte JSON signé : { format, version, coffre (date de création), n (compteur), le, secours, agents,
 *               cles, empreintes (de chaque génération), maitresses (empreinte de chaque clé maîtresse), comptes }
 *               ; `comptes` est un code d'authentification des droits des comptes (rôles, services, activité, fin de
 *               validité), calculé avec une clé tirée de la clé de signature (aucun rôle lisible en clair)
 *
 * Tout agent vérifie la signature et l'ancre à l'ouverture de son trousseau, et n'accepte que les générations dont
 * l'empreinte est attestée ; la génération d'écriture est celle de l'état signé. L'administrateur vérifie en plus les
 * comptes, les parties publiques et la clé de secours avant toute remise de clé, puis signe le nouvel état.
 * Une clé personnelle créée par l'agent lui-même (changement de mot de passe) est accompagnée d'une preuve de continuité :
 * code d'authentification tiré d'un échange ECDH entre son ancienne partie privée et le témoin.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crypto.js'));
  else (root.SIC = root.SIC || {}).attestation = factory(root.SIC.crypto);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var FORMAT = 'Tessera-attestation';
  var enc = new TextEncoder();

  /** Texte canonique (clés triées) : la signature porte sur une écriture unique de l'état. */
  function canonique(v) {
    if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canonique(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }

  async function empreinteGeneration(nom, g, octets) {
    return C.hex(await C.sha256(C.concat(enc.encode('Tessera empreinte|' + nom + '|' + g + '|'), octets)));
  }

  /** Nouvelles clés d'attestation : { publique, temoin, sign8, temoin8 } (parties privées à effacer après usage). */
  async function creerCles() {
    var s = await C.nouvellePaireSignature(), t = await C.nouvellePaire();
    return { publique: s.publique, sign8: s.prive8, temoin: await C.exporterPublique(t.publicKey), temoin8: await C.exporterPrivee(t.privateKey) };
  }
  function effacerCles(cles) { if (cles) { if (cles.sign8) cles.sign8.fill(0); if (cles.temoin8) cles.temoin8.fill(0); } }
  function copierCles(cles) { return cles && { publique: cles.publique, temoin: cles.temoin, sign8: cles.sign8.slice(), temoin8: cles.temoin8.slice() }; }

  async function clePrivees(maitresse) { return C.importerCleOctets(await C.deriverOctets(maitresse, 'cles privees')); }

  /** Ouvre les parties privées d'attestation avec la clé maîtresse de plateforme. */
  async function ouvrirCles(coffre, maitressePlateforme) {
    var a = coffre && coffre.attestation;
    if (!a || !a.privees || !maitressePlateforme) return null;
    try {
      var o = await C.dechiffrerJSON(await clePrivees(maitressePlateforme), C.deb64(a.privees), 'attestation');
      // Parties publiques recalculées depuis les parties privées : une clé publique remplacée dans le coffre est ignorée
      var sign8 = C.deb64(o.sign8), temoin8 = C.deb64(o.temoin8);
      return { publique: await C.publiqueDePrivee(sign8, 'ECDSA'), temoin: await C.publiqueDePrivee(temoin8, 'ECDH'), sign8: sign8, temoin8: temoin8 };
    } catch (e) { return null; }
  }

  /** Droits des comptes qui décident de la remise des clés, sous forme canonique. */
  function droitsComptes(comptes) {
    return canonique((comptes || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).map(function (c) {
      return { id: c.id, roles: (c.roles || []).slice().sort(), services: (c.services || []).slice().sort(), actif: !!c.actif, fin: c.finValidite || '' };
    }));
  }
  async function macComptes(cles, comptes) { return C.hmac(await C.deriverOctets(cles.sign8, 'comptes'), droitsComptes(comptes)); }

  /** Lit l'état signé (sans le vérifier). */
  function etatDe(coffre) {
    var a = coffre && coffre.attestation;
    if (!a || typeof a.etat !== 'string') return null;
    try { return JSON.parse(a.etat); } catch (e) { return null; }
  }

  /**
   * Signe l'état du coffre (réservé à qui détient les clés d'attestation et les clés maîtresses : l'administrateur,
   * la clé de secours). `trousseau` : jeux des clés de droit (empreintes de toutes les générations, clé maîtresse de
   * plateforme pour rechiffrer les parties privées). Efface les preuves de continuité, désormais couvertes.
   * info : { n, par }.
   */
  async function signer(cles, trousseau, coffre, comptes, info) {
    var empreintes = {}, maitresses = {}, publiques = {}, noms = Object.keys(coffre.cles).sort();
    for (var i = 0; i < noms.length; i++) {
      var nom = noms[i], jeu = trousseau[nom];
      if (!jeu || !jeu.maitresse) throw new Error('Attestation impossible : clé maîtresse « ' + nom + ' » absente.');
      empreintes[nom] = {};
      for (var g = 1; g <= coffre.cles[nom].courante; g++) {
        if (coffre.cles[nom].perdues && coffre.cles[nom].perdues.indexOf(g) >= 0) continue;
        var o = await jeu.octetsDe(g);
        if (!o) throw new Error('Attestation impossible : génération ' + g + ' de la clé « ' + nom + ' » absente.');
        empreintes[nom][g] = await empreinteGeneration(nom, g, o);
        // Clés de la messagerie (0.24.0) : partie publique de chaque génération, signée avec l'état, pour écrire aux
        // destinataires sans détenir leur clé
        if (/^(m-|e-|d-|t-a\.)/.test(nom)) (publiques[nom] = publiques[nom] || {})[g] = (await C.paireDepuisOctets(o, nom + ':' + g)).publique;
      }
      maitresses[nom] = await empreinteGeneration(nom, 'm', jeu.maitresse);
    }
    var agents = {};
    Object.keys(coffre.agents).forEach(function (id) {
      if (id === 'secours') return;
      agents[id] = coffre.agents[id].publique;
      delete coffre.agents[id].preuves;
    });
    var cl = {};
    noms.forEach(function (n) { cl[n] = { courante: coffre.cles[n].courante, base: coffre.cles[n].base || undefined, perdues: coffre.cles[n].perdues && coffre.cles[n].perdues.length ? coffre.cles[n].perdues.slice().sort(function (a, b) { return a - b; }) : undefined }; });
    var etat = {
      format: FORMAT, version: 1, coffre: coffre.creeLe, n: info.n, le: new Date().toISOString(), par: info.par || null,
      secours: coffre.agents.secours ? coffre.agents.secours.publique : null, temoin: cles.temoin, agents: agents, cles: cl,
      empreintes: empreintes, maitresses: maitresses, comptes: await macComptes(cles, comptes)
    };
    if (Object.keys(publiques).length) etat.publiques = publiques;   // absent sans clé de messagerie : état inchangé
    var texte = canonique(etat);
    coffre.attestation = {
      publique: cles.publique, temoin: cles.temoin,
      privees: C.b64(await C.chiffrerJSON(await clePrivees(trousseau.plateforme.maitresse), { sign8: C.b64(cles.sign8), temoin8: C.b64(cles.temoin8) }, 'attestation')),
      etat: texte, signature: await C.signer(cles.sign8, texte)
    };
    return etat;
  }

  /**
   * Vérification faite par tout agent. `ancre` : empreinte gardée dans son emballage (null pour un emballage d'avant
   * 0.5.0). Retourne { etat (null si l'attestation n'est pas utilisable), anomalies: [{ code, texte, bloquante }] }.
   */
  async function verifier(coffre, ancre) {
    var a = coffre && coffre.attestation, an = [];
    function pb(code, texte, bloquante) { an.push({ code: code, texte: texte, bloquante: !!bloquante }); }
    if (!a) {
      pb('absente', ancre ? 'L’attestation du coffre a été retirée hors de l’outil.' : 'Le coffre n’est pas encore attesté par un administrateur.', !!ancre);
      return { etat: null, anomalies: an };
    }
    var etat = etatDe(coffre);
    if (!etat || etat.format !== FORMAT || !(await C.verifierSignature(a.publique, a.etat, a.signature))) {
      pb('signature', 'La signature de l’état du coffre est invalide : le coffre a été modifié hors de l’outil.', true);
      return { etat: null, anomalies: an };
    }
    if (ancre && ancre !== (await C.ancreDe(a.publique))) {
      pb('ancre', 'Le coffre est signé par une clé d’attestation inconnue : il a été remplacé ou modifié hors de l’outil.', true);
      return { etat: null, anomalies: an };
    }
    if (etat.coffre !== coffre.creeLe) pb('coffre', 'L’attestation provient d’un autre dossier.', true);
    var memes = Object.keys(etat.cles).length === Object.keys(coffre.cles || {}).length && Object.keys(etat.cles).every(function (n) { return coffre.cles[n] && coffre.cles[n].courante === etat.cles[n].courante && (coffre.cles[n].base || undefined) === (etat.cles[n].base || undefined); });
    if (!memes) pb('cles', 'Les générations de clés du coffre diffèrent de l’état attesté (seules les générations attestées sont utilisées).', false);
    if (coffre.restaureLe && coffre.restaureLe > etat.le) pb('restaure', 'Le coffre a été restauré : l’administrateur doit renouveler les clés avant toute saisie.', true);
    return { etat: an.some(function (x) { return x.code === 'coffre'; }) ? null : etat, anomalies: an };
  }

  /** Une génération (ou une clé maîtresse, g = 'm') reçue est-elle celle de l'état attesté ? */
  async function generationAttestee(etat, nom, g, octets) {
    if (!etat) return true;
    var attendu = g === 'm' ? etat.maitresses && etat.maitresses[nom] : etat.empreintes && etat.empreintes[nom] && etat.empreintes[nom][g];
    return !!attendu && attendu === (await empreinteGeneration(nom, g, octets));
  }

  /** Preuve de continuité d'une clé personnelle créée par l'agent : ancienne partie privée → nouvelle partie publique. */
  async function preuve(ancienne8, anciennePublique, temoin, id, nouvelle) {
    var k = await C.secretPartage(ancienne8, temoin);
    var mac = await C.hmac(await C.deriverOctets(k, 'continuite'), id + '|' + anciennePublique + '|' + nouvelle);
    k.fill(0);
    return { de: anciennePublique, vers: nouvelle, mac: mac };
  }
  async function preuveValide(cles, id, p) {
    try {
      var k = await C.secretPartage(cles.temoin8, p.de);
      var ok = p.mac === (await C.hmac(await C.deriverOctets(k, 'continuite'), id + '|' + p.de + '|' + p.vers));
      k.fill(0);
      return ok;
    } catch (e) { return false; }
  }

  /**
   * Vérification de l'administrateur, avant toute remise de clé : droits des comptes, parties publiques (preuves de
   * continuité acceptées), clé de secours, générations. Retourne la liste des anomalies (toutes bloquantes pour lui).
   */
  async function verifierAdmin(cles, coffre, etat, comptes) {
    var an = [];
    function pb(code, texte) { an.push({ code: code, texte: texte, bloquante: true }); }
    if (coffre.attestation && coffre.attestation.publique !== cles.publique) pb('ancre', 'Le coffre est signé par une clé d’attestation inconnue : il a été remplacé ou modifié hors de l’outil.');
    if (!etat) return an;
    if (etat.comptes !== (await macComptes(cles, comptes))) pb('comptes', 'Les rôles, services ou l’activité des comptes ont été modifiés hors de l’outil.');
    if ((coffre.agents.secours && coffre.agents.secours.publique) !== etat.secours) pb('secours', 'La clé de secours a été remplacée hors de l’outil.');
    var ids = {};
    Object.keys(coffre.agents).concat(Object.keys(etat.agents)).forEach(function (id) { if (id !== 'secours') ids[id] = true; });
    var noms = [];
    for (var id in ids) {
      var a = coffre.agents[id], att = etat.agents[id];
      if (!a || !att) { noms.push(id); continue; }
      if (a.publique === att) continue;
      // Chaîne de preuves : de la partie publique attestée jusqu'à l'actuelle
      var cur = att, chaine = a.preuves || [], ok = true;
      for (var i = 0; i < chaine.length && ok; i++) { ok = chaine[i].de === cur && (await preuveValide(cles, id, chaine[i])); cur = chaine[i].vers; }
      if (!ok || cur !== a.publique) noms.push(id);
    }
    if (noms.length) an.push({ code: 'agents', texte: 'Clé personnelle ajoutée, retirée ou remplacée hors de l’outil pour ' + noms.length + ' compte(s).', bloquante: true, comptes: noms });
    var memes = Object.keys(etat.cles).length === Object.keys(coffre.cles).length && Object.keys(etat.cles).every(function (n) { return coffre.cles[n] && coffre.cles[n].courante === etat.cles[n].courante; });
    if (!memes) pb('cles', 'Les générations de clés du coffre diffèrent de l’état attesté.');
    return an;
  }

  return {
    FORMAT: FORMAT, canonique: canonique, creerCles: creerCles, effacerCles: effacerCles, copierCles: copierCles, ouvrirCles: ouvrirCles,
    signer: signer, verifier: verifier, verifierAdmin: verifierAdmin, etatDe: etatDe, generationAttestee: generationAttestee,
    empreinteGeneration: empreinteGeneration, preuve: preuve, preuveValide: preuveValide, macComptes: macComptes
  };
});
