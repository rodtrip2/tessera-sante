// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — signature des saisies (0.72.0 ; correctif de fond du constat S1 de l'audit du 15 novembre 2026).
 *
 * Le journal du socle est chiffré par la clé de plateforme, que tout agent détient : sans signature, un agent pouvait
 * écrire une saisie (un réglage, une annulation…) au nom d'un autre. Désormais chaque saisie est signée par son auteur :
 *
 *   clé de signature   paire ECDSA P-256 tirée de la clé personnelle de l'agent (rien n'est stocké en plus) ; elle
 *                      change avec la clé personnelle (changement de mot de passe)
 *   coffre.agents[id].sig = [{ p, de, s, m }]
 *                      clés de signature de l'agent : `p` partie publique ; `de` + `s` : lien signé par la clé
 *                      précédente (changement de mot de passe par l'agent) ; `m` : preuve tirée de sa clé personnelle
 *                      et du témoin de l'attestation (compte d'avant 0.72.0), vérifiable par l'administrateur seul
 *   état attesté       `signatures` { id: [p…] } clés attestées par l'administrateur ; `admins` comptes administrateurs
 *                      (seuls à écrire au nom d'un autre : données fictives, imports) ; `saisiesSignees` date à partir
 *                      de laquelle toute saisie doit être signée (coffre créé à partir de 0.72.0, ou exigence décidée
 *                      par l'administrateur)
 *   saisie             `sig` : signature du texte canonique de la saisie (sans `sig`) ; `sg` : signataire, s'il diffère
 *                      de l'auteur `by`
 *
 * Toute session vérifie chaque saisie lue : clé attestée, ou reliée à une clé attestée par une chaîne de liens signés.
 * Une saisie non signée (exigence en vigueur), signée par une clé inconnue, ou écrite au nom d'un autre par un agent
 * qui n'est pas administrateur, est écartée (masquée, jamais supprimée) et signalée.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crypto.js'), require('./attestation.js'));
  else (root.SIC = root.SIC || {}).signatures = factory(root.SIC.crypto, root.SIC.attestation);
})(typeof self !== 'undefined' ? self : this, function (C, A) {
  'use strict';

  /** Clé de signature d'un agent, tirée de sa clé personnelle : { prive8 (à effacer), publique }. */
  function paireAgent(privee8) { return C.paireSignatureDepuisOctets(privee8, 'saisies'); }
  /** Partie publique seule de la clé de signature tirée d'une clé personnelle (la partie privée est effacée). */
  async function publiqueAgent(privee8) { var k = await paireAgent(privee8); k.prive8.fill(0); return k.publique; }
  function texteLien(id, p, de) { return 'Tessera lien de signature|' + id + '|' + p + '|' + (de || ''); }
  function texteSaisie(evt) { var x = {}; Object.keys(evt).forEach(function (k) { if (k !== 'sig') x[k] = evt[k]; }); return A.canonique(x); }

  /** Signe une saisie (modifiée en place) : `signataire` = compte de la session (inscrit dans `sg` s'il diffère de l'auteur). */
  async function signerSaisie(evt, cle, signataire) {
    delete evt.sig;
    if (signataire && signataire !== evt.by) evt.sg = signataire; else delete evt.sg;
    evt.sig = await C.signer(cle.prive8, texteSaisie(evt));
    return evt;
  }
  /** Lien d'une nouvelle clé de signature, signé par la précédente (changement de mot de passe par l'agent). */
  async function lien(ancienne, id, nouvelle) {
    return { p: nouvelle, de: ancienne.publique, s: await C.signer(ancienne.prive8, texteLien(id, nouvelle, ancienne.publique)) };
  }
  /** Preuve d'une clé de signature tirée de la clé personnelle et du témoin (compte d'avant 0.72.0). */
  async function preuve(privee8, temoin, id, p) {
    var k = await C.secretPartage(privee8, temoin), m = await C.hmac(await C.deriverOctets(k, 'signature des saisies'), id + '|' + p);
    k.fill(0);
    return { p: p, m: m };
  }
  async function preuveValide(temoin8, publiqueAgent, id, e) {
    try {
      var k = await C.secretPartage(temoin8, publiqueAgent), ok = e.m === (await C.hmac(await C.deriverOctets(k, 'signature des saisies'), id + '|' + e.p));
      k.fill(0);
      return ok;
    } catch (x) { return false; }
  }

  /**
   * Clés valides de chaque compte : attestées, puis reliées par une chaîne de liens signés (vérifiable par tous).
   * Retourne { id: { cles: [p…], enAttente: [p…] } } ; `enAttente` : clés que seul l'administrateur peut vérifier.
   */
  async function clesValides(coffre, etat) {
    var res = {}, att = (etat && etat.signatures) || {}, ids = {};
    Object.keys((coffre && coffre.agents) || {}).concat(Object.keys(att)).forEach(function (id) { ids[id] = true; });
    for (var id in ids) {
      var cles = (att[id] || []).slice(), entrees = (coffre.agents && coffre.agents[id] && Array.isArray(coffre.agents[id].sig)) ? coffre.agents[id].sig : [], change = true;
      while (change) {
        change = false;
        for (var i = 0; i < entrees.length; i++) {
          var e = entrees[i];
          if (!e || typeof e.p !== 'string' || cles.indexOf(e.p) >= 0 || !e.de || cles.indexOf(e.de) < 0 || typeof e.s !== 'string') continue;
          if (await C.verifierSignatureRapide(e.de, texteLien(id, e.p, e.de), e.s)) { cles.push(e.p); change = true; }
        }
      }
      res[id] = { cles: cles, enAttente: entrees.filter(function (e) { return e && typeof e.p === 'string' && cles.indexOf(e.p) < 0; }).map(function (e) { return e.p; }) };
    }
    return res;
  }

  /**
   * Clés à attester (administrateur, à la signature de l'état) : celles déjà valides, celles dont la preuve tirée du
   * témoin est valide, et `nouvelles` ({ id: p }) posées par l'administrateur lui-même. Comptes retirés : clés gardées
   * (leurs saisies passées restent vérifiables). Retourne { signatures, nonVerifiees: [id…] }.
   */
  async function aAttester(coffre, etat, temoin8, nouvelles) {
    var valides = await clesValides(coffre, etat), sig = {}, non = [];
    for (var id in valides) {
      var l = valides[id].cles.slice(), a = coffre.agents && coffre.agents[id];
      if (nouvelles && nouvelles[id]) [].concat(nouvelles[id]).forEach(function (p) { if (l.indexOf(p) < 0) l.push(p); });
      var entrees = a && Array.isArray(a.sig) ? a.sig : [];
      for (var i = 0; i < entrees.length; i++) {
        var e = entrees[i];
        if (!e || l.indexOf(e.p) >= 0) continue;
        if (e.m && temoin8 && a && a.publique && (await preuveValide(temoin8, a.publique, id, e))) l.push(e.p);
        else non.push(id);
      }
      if (l.length) sig[id] = l;
    }
    if (nouvelles) Object.keys(nouvelles).forEach(function (id) { if (!sig[id]) sig[id] = [].concat(nouvelles[id]); });
    return { signatures: sig, nonVerifiees: non.filter(function (x, i, t) { return t.indexOf(x) === i; }) };
  }

  /**
   * Contexte de vérification des saisies d'une session : { cles, strict, admins }. `etat` : état attesté (null pour un
   * coffre non attesté : vérification sans exigence).
   */
  async function contexte(coffre, etat) {
    return { cles: await clesValides(coffre, etat), strict: !!(etat && etat.saisiesSignees), admins: (etat && etat.admins) || [], attestees: !!(etat && etat.signatures) };
  }
  /**
   * Vérifie une saisie lue. Retourne 'ok', 'provisoire' (clé que seul l'administrateur peut vérifier, exigence pas
   * encore en vigueur), 'ancienne' (non signée, exigence pas en vigueur) ou un motif d'écart : 'non-signee',
   * 'au-nom-d-un-autre', 'signature'.
   */
  async function verifierSaisie(evt, ctx) {
    if (!evt || typeof evt !== 'object') return 'signature';
    if (!evt.sig) return ctx.strict ? 'non-signee' : 'ancienne';
    var sg = evt.sg || evt.by;
    if (evt.sg && evt.sg !== evt.by && ctx.admins.indexOf(evt.sg) < 0) return 'au-nom-d-un-autre';
    var k = ctx.cles[sg] || { cles: [], enAttente: [] }, texte = texteSaisie(evt), i;
    for (i = 0; i < k.cles.length; i++) if (await C.verifierSignatureRapide(k.cles[i], texte, evt.sig)) return 'ok';
    if (!ctx.strict) for (i = 0; i < k.enAttente.length; i++) if (await C.verifierSignatureRapide(k.enAttente[i], texte, evt.sig)) return 'provisoire';
    // Sans exigence : un signataire dont aucune clé n'est connue (coffre pas encore relu, compte d'avant 0.72.0) est
    // accepté comme une saisie ancienne ; une signature fausse pour une clé connue est écartée
    if (!ctx.strict && !k.cles.length && !k.enAttente.length) return 'provisoire';
    return 'signature';
  }
  var LIB_ECART = {
    'non-signee': 'saisie non signée',
    'au-nom-d-un-autre': 'saisie écrite au nom d’un autre agent',
    signature: 'signature invalide ou clé de signature inconnue'
  };

  return {
    paireAgent: paireAgent, publiqueAgent: publiqueAgent, texteSaisie: texteSaisie, texteLien: texteLien, signerSaisie: signerSaisie, lien: lien, preuve: preuve, preuveValide: preuveValide,
    clesValides: clesValides, aAttester: aAttester, contexte: contexte, verifierSaisie: verifierSaisie, LIB_ECART: LIB_ECART
  };
});
