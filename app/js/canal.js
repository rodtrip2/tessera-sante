// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — version stable, bêta ou de développement (demande du porteur du 13 novembre 2026, lot H).
 *
 * Le même site publie trois versions : la version stable à l'adresse habituelle (…/app/), la version bêta sous
 * …/beta/app/ et la version de développement sous …/dev/app/ (état de `main`, republié à chaque envoi). La version
 * est déduite de l'adresse de la page (ou du service worker) ; rien n'est réglé à la main.
 *
 * Chaque version garde ses propres réglages du navigateur (dossier mémorisé, stockage de démonstration, cache hors
 * réseau) grâce au suffixe `SIC.suffixeCanal`. La bêta et la version de développement n'ouvrent qu'un dossier d'essai
 * (store.js) : un essai ne peut pas écrire dans les données du service.
 */
(function (root) {
  'use strict';
  /** Version d'après le chemin de l'adresse : 'stable', 'beta' ou 'dev'. */
  function detecter(chemin) {
    var m = /\/(beta|dev)\/app(\/|$)/.exec(String(chemin || ''));
    return m ? m[1] : 'stable';
  }
  var LIBELLES = { stable: 'Version stable', beta: 'Version bêta', dev: 'Version de développement' };
  var canal = detecter(root && root.location && root.location.pathname);
  var SIC = root.SIC = root.SIC || {};
  SIC.CANAL = canal;
  SIC.suffixeCanal = canal === 'stable' ? '' : '-' + canal;
  SIC.libelleCanal = LIBELLES[canal];
  if (typeof module === 'object' && module.exports) module.exports = { detecter: detecter, LIBELLES: LIBELLES };
})(typeof self !== 'undefined' ? self : this);
