// SPDX-License-Identifier: EUPL-1.2
/*
 * Dossier des données fixé par le service informatique (26 novembre 2026, demande du porteur).
 *
 * Le script de mise à jour (`mettre-a-jour-outil.ps1 -Donnees '\\serveur\partage\…'`) inscrit dans la page de la
 * copie de l'établissement l'identité des données (date de création de leur coffre) et leur chemin, dans la balise
 * `<meta name="tessera-donnees" content="<creeLe>|<chemin>">` (vide dans la version publiée). Le navigateur ne peut
 * pas ouvrir un dossier à partir d'un chemin : l'agent le désigne une fois par poste, et cette copie de Tessera
 * n'ouvre alors que ces données (dossier habituel, dossier de secours, copie locale du poste, nouvel emplacement
 * après un déplacement), sans mode démonstration ni déblocage dans Tessera. Le changement passe par le script.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { var D = factory(); (root.SIC = root.SIC || {}).donneesFixees = D; D.actuelles = D.lirePage(root.document); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /** Contenu de la balise : « <date de création du coffre>|<chemin> » → { creeLe, chemin } ou null (règle absente). */
  function lire(contenu) {
    var t = String(contenu || '').trim(), i = t.indexOf('|'), cree = (i < 0 ? t : t.slice(0, i)).trim();
    if (!/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(cree)) return null;
    return { creeLe: cree, chemin: i < 0 ? '' : t.slice(i + 1).trim().slice(0, 400) };
  }
  function lirePage(doc) {
    try { var m = doc && doc.querySelector('meta[name="tessera-donnees"]'); return m ? lire(m.getAttribute('content')) : null; } catch (e) { return null; }
  }
  /** Coffre d'un dossier conforme à la règle (mêmes données) ; sans règle, tout dossier l'est. */
  function conforme(coffre, regle) { return !regle || !!(coffre && coffre.creeLe === regle.creeLe); }
  /** Message de refus d'un dossier, d'après son coffre (null : dossier vide ou sans coffre lisible). */
  function refus(coffre, regle) {
    var ou = regle.chemin ? ' (« ' + regle.chemin + ' »)' : '';
    return coffre
      ? 'Ce dossier contient d’autres données. Cette copie de Tessera n’ouvre que les données de l’établissement' + ou + ', fixées par le service informatique.'
      : 'Ce dossier ne contient pas les données de l’établissement. Choisissez le dossier des données' + ou + ', fixé par le service informatique.';
  }
  return { lire: lire, lirePage: lirePage, conforme: conforme, refus: refus, actuelles: null };
});
