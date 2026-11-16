// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — neutralisation des fichiers CSV exportés (0.77.0, constat S7 de l'audit du 15 novembre 2026).
 *
 * Un tableur (Excel, LibreOffice) interprète comme une formule une cellule qui commence par « = », « + », « - » ou
 * « @ ». Un nom, un motif ou une note saisis dans Tessera et commençant ainsi seraient exécutés à l'ouverture de
 * l'export (« injection de formule ») : appel d'une autre feuille, d'un lien, voire d'une commande sur les versions
 * anciennes. Chaque cellule de texte concernée est précédée d'une apostrophe, que le tableur n'affiche pas et qui
 * fait lire la cellule comme du texte. Les nombres (« -3,5 », « +2 ») et les tirets seuls restent tels quels.
 * Format des exports de Tessera : séparateur « ; », guillemets doublés, marque d'ordre des octets. Sans dépendance.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).csv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOM = '﻿';
  /** Cellule neutralisée : apostrophe devant un texte qui serait lu comme une formule. */
  function cellule(v) {
    var s = v === undefined || v === null ? '' : String(v);
    if (!/^[=+\-@\t\r＝＋－＠]/.test(s)) return s;
    if (/^[-+]?\d+(?:[.,]\d+)?\s*%?$/.test(s) || /^[-–—]+$/.test(s)) return s;   // nombre, tiret seul
    return '\'' + s;
  }
  /** Lecture d'un CSV « ; » (guillemets doublés, retours à la ligne dans les guillemets). */
  function lire(texte) {
    var t = String(texte || ''), lignes = [], ligne = [], champ = '', guil = false, i = 0;
    if (t.charAt(0) === BOM) i = 1;
    for (; i < t.length; i++) {
      var c = t.charAt(i);
      if (guil) {
        if (c === '"') { if (t.charAt(i + 1) === '"') { champ += '"'; i++; } else guil = false; }
        else champ += c;
      } else if (c === '"') guil = true;
      else if (c === ';') { ligne.push(champ); champ = ''; }
      else if (c === '\r' && t.charAt(i + 1) === '\n') { /* fin de ligne au \n */ }
      else if (c === '\n' || c === '\r') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
      else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }
  /** Écriture d'un CSV « ; » avec marque d'ordre des octets ; chaque cellule neutralisée et entre guillemets. */
  function ecrire(lignes) {
    return BOM + lignes.map(function (l) { return l.map(function (v) { return '"' + cellule(v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
  }
  /** CSV déjà construit, neutralisé (sans effet sur un fichier sans cellule à risque, sinon réécrit). */
  function neutraliser(texte) {
    var lignes = lire(texte), risque = lignes.some(function (l) { return l.some(function (v) { return cellule(v) !== v; }); });
    return risque ? ecrire(lignes) : String(texte);
  }
  function neutraliserOctets(octets) {
    var t = new TextDecoder().decode(octets), n = neutraliser(t);
    return n === t ? octets : new TextEncoder().encode(n);
  }

  return { cellule: cellule, lire: lire, ecrire: ecrire, neutraliser: neutraliser, neutraliserOctets: neutraliserOctets };
});
