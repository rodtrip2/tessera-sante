// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — règle des mots de passe (0.75.0 ; constat S3 de l'audit du 15 novembre 2026, décision du porteur du même jour :
 * règle renforcée appliquée d'office, réglable par l'administrateur).
 *
 * Le coffre est sur le partage : qui peut le copier peut essayer des mots de passe sans limite d'essais. La règle
 * renforcée suit la recommandation de la CNIL pour un mot de passe employé seul (délibération n° 2022-100 du
 * 21 juillet 2022, entropie d'au moins 80 bits), par l'un de ces trois moyens :
 *   - 12 caractères au moins, avec majuscules, minuscules, chiffres et caractères spéciaux ;
 *   - 14 caractères au moins, avec trois de ces quatre familles ;
 *   - une phrase d'au moins 7 mots.
 * S'y ajoute le refus des mots de passe courants ou devinables (liste, identifiant, nom, suites, répétitions).
 * Règle simple (au choix de l'administrateur) : 12 caractères au moins, mêmes refus.
 * Les mots de passe déjà choisis restent valables jusqu'à leur changement. Aucune dépendance, testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).motsDePasse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var REGLES = { renforcee: 'Renforcée (recommandation de la CNIL)', simple: 'Simple (12 caractères au moins)' };
  // Mots de passe et bases de mots de passe parmi les plus courants (France et international), sans accent ni chiffre final
  var COURANTS = ('motdepasse password passw0rd azerty azertyuiop qwerty qwertyuiop qwertz bonjour soleil doudou chouchou loulou ' +
    'jetaime iloveyou marseille nicolas camille chocolat princesse amour coucou football welcome bienvenue admin administrateur ' +
    'administrator root secret letmein dragon monkey master superman batman hopital hospital sante infirmier infirmiere cadre ' +
    'tessera tesserasante isocont isolement contention psychiatrie service urgence changeme changezmoi provisoire temporaire ' +
    'motdepasseprovisoire abcdef abcdefgh azertyqsdfgh aqwzsx aqwzsxedc wxcvbn qsdfgh qsdfghjklm poiuytreza mdp motpasse pass ' +
    'sesame ouvretoi trustno1 sunshine princess starwars michael jennifer julien thomas pierre marie alexandre').split(' ');
  var SUITES = ['abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', '01234567890123456789', '98765432109876543210',
    'azertyuiopqsdfghjklmwxcvbn', 'qwertyuiopasdfghjklzxcvbnm', 'qwertzuiopasdfghjklyxcvbnm', 'aqwzsxedcrfvtgbyhnujikolpm'];

  function sansAccent(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** Formes de comparaison : minuscules, sans accent ni séparateur ; chiffres des extrémités ôtés ; écriture « l33t » ramenée aux lettres. */
  function simple(t) { return sansAccent(t).toLowerCase().replace(/[^a-z0-9@€!|$]/g, ''); }
  function leet(t) { return t.replace(/[@4]/g, 'a').replace(/[3€]/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z0-9]/g, ''); }
  function formes(t) {
    var s = simple(t), nu = s.replace(/[^a-z0-9]/g, ''), coeur = s.replace(/^[0-9!|$@€]+/, '').replace(/[0-9!|$@€]+$/, '');
    var r = [nu, nu.replace(/^[0-9]+/, '').replace(/[0-9]+$/, ''), leet(s), leet(coeur)];
    return r.filter(function (x, i) { return x && r.indexOf(x) === i; });
  }
  function base(t) { return simple(t).replace(/[^a-z0-9]/g, ''); }
  function familles(mdp) {
    return { majuscule: /[A-ZÀ-ÖØ-Þ]/.test(mdp), minuscule: /[a-zß-öø-ÿ]/.test(mdp), chiffre: /[0-9]/.test(mdp), special: /[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(mdp) };
  }
  function nbFamilles(mdp) { var f = familles(mdp); return (f.majuscule ? 1 : 0) + (f.minuscule ? 1 : 0) + (f.chiffre ? 1 : 0) + (f.special ? 1 : 0); }
  /** Mots d'une phrase de passe : séparés par des espaces, tirets ou ponctuation ; deux caractères au moins chacun. */
  function mots(mdp) { return String(mdp).split(/[\s\-_.,;:'’/]+/).filter(function (m) { return m.length >= 2; }); }
  function motsDistincts(mdp) { var v = {}; mots(mdp).forEach(function (m) { v[sansAccent(m).toLowerCase()] = 1; }); return Object.keys(v).length; }

  /** Part du mot de passe couverte par des suites (clavier, alphabet, chiffres) d'au moins 4 caractères. */
  function partSuites(mdp) {
    var t = sansAccent(mdp).toLowerCase(), couvert = 0, i = 0;
    while (i < t.length) {
      var long = 0;
      for (var s = 0; s < SUITES.length; s++) {
        for (var n = Math.min(t.length - i, 12); n >= 4 && n > long; n--) if (SUITES[s].indexOf(t.substr(i, n)) >= 0) long = n;
      }
      if (long) { couvert += long; i += long; } else i++;
    }
    return t.length ? couvert / t.length : 0;
  }
  /** Raison du refus d'un mot de passe courant ou devinable, ou chaîne vide. `ctx` : { login, nom, etablissement }. */
  function devinable(mdp, ctx) {
    var b = base(mdp), fs = formes(mdp);
    if (!b) return 'Ce mot de passe est trop simple.';
    var distincts = {}; String(mdp).split('').forEach(function (c) { distincts[c] = 1; });
    if (Object.keys(distincts).length < 5) return 'Ce mot de passe répète trop les mêmes caractères.';
    if (/^(.{1,4})\1+$/.test(String(mdp))) return 'Ce mot de passe répète le même motif.';
    for (var j = 0; j < fs.length; j++) {
      if (COURANTS.indexOf(fs[j]) >= 0) return 'Ce mot de passe est parmi les plus courants : choisissez-en un autre.';
      // Un mot courant répété ou complété de quelques caractères (« Soleil2026! », « azertyazerty »)
      for (var i = 0; i < COURANTS.length; i++) {
        var c = COURANTS[i];
        if (c.length >= 5 && fs[j].indexOf(c) >= 0 && fs[j].split(c).join('').replace(/[0-9]/g, '').length <= 4) return 'Ce mot de passe repose sur un mot très courant (« ' + c + ' ») : choisissez-en un autre.';
      }
    }
    if (partSuites(mdp) >= 0.6) return 'Ce mot de passe suit l’ordre du clavier, de l’alphabet ou des chiffres.';
    var propres = [];
    [ctx && ctx.login, ctx && ctx.nom, ctx && ctx.etablissement].forEach(function (v) {
      sansAccent(v).toLowerCase().split(/[^a-z0-9]+/).forEach(function (m) { if (m.length >= 4) propres.push(m); });
      var entier = base(v); if (entier.length >= 4) propres.push(entier);
    });
    for (var k = 0; k < propres.length; k++) {
      if (b.indexOf(base(propres[k])) >= 0 && b.split(base(propres[k])).join('').length <= 6) return 'Ce mot de passe reprend votre nom, votre identifiant ou le nom de l’établissement.';
    }
    return '';
  }

  function regleDe(v) { return v === 'simple' ? 'simple' : 'renforcee'; }
  /** Consigne à afficher sous le champ, selon la règle. */
  function consigne(regle) {
    return regleDe(regle) === 'simple'
      ? '12 caractères au moins. Les mots de passe courants ou devinables sont refusés.'
      : 'Au choix : 12 caractères au moins avec majuscules, minuscules, chiffres et caractères spéciaux ; ou 14 caractères au moins avec trois de ces quatre familles ; ou une phrase d’au moins 7 mots. Les mots de passe courants ou devinables sont refusés.';
  }
  /** Raison du refus (chaîne vide si le mot de passe est accepté). */
  function refus(mdp, ctx, regle) {
    mdp = String(mdp === undefined || mdp === null ? '' : mdp);
    if (mdp.length > 200) return 'Mot de passe trop long (200 caractères au plus).';
    if (mdp.length < 12) return 'Le mot de passe doit comporter au moins 12 caractères.';
    if (regleDe(regle) === 'renforcee') {
      var n = nbFamilles(mdp), phrase = motsDistincts(mdp) >= 7;
      if (!((mdp.length >= 12 && n === 4) || (mdp.length >= 14 && n >= 3) || phrase)) {
        var f = familles(mdp), manque = [];
        if (!f.majuscule) manque.push('une majuscule'); if (!f.minuscule) manque.push('une minuscule'); if (!f.chiffre) manque.push('un chiffre'); if (!f.special) manque.push('un caractère spécial');
        return 'Mot de passe insuffisant. ' + (mdp.length >= 14 && n === 2 ? 'Ajoutez ' + manque.slice(0, 1).join('') + ' (ou ' + manque.slice(1).join(', ou ') + ')' : mdp.length < 14 && n === 3 ? 'Ajoutez ' + manque.join(', ') + ', ou allongez-le à 14 caractères' : 'Ajoutez ' + manque.join(', ')) + ' — ou choisissez une phrase d’au moins 7 mots.';
      }
    }
    return devinable(mdp, ctx);
  }
  /** Lève une erreur en clair si le mot de passe est refusé. */
  function verifier(mdp, ctx, regle) { var r = refus(mdp, ctx, regle); if (r) throw new Error(r); return true; }

  return { REGLES: REGLES, regleDe: regleDe, consigne: consigne, refus: refus, verifier: verifier, devinable: devinable, familles: familles, mots: mots };
});
