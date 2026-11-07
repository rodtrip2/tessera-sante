// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — rangement des exports (étape 1 du plan d'architecture) : dossier des exports, sous-dossier par service,
 * chemin Windows, durée de conservation et purge. Repris sans changement du modèle d'Isocont ; le réglage
 * `config.exports` passera au journal du socle à l'étape 3.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).exportsRangement = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var J = 24 * 3600 * 1000;

  /** Durées de conservation proposées pour les exports (jours ; 0 = aucune purge). */
  var CONSERVATION_EXPORTS = [0, 31, 92, 183, 366, 731, 1096, 1827];
  /** Réglages des exports, validés : { dossier, conservationJours }. */
  function optionsExports(config) {
    var v = (config && config.exports) || {}, j = Math.round(+v.conservationJours);
    var reseau = String(v.cheminReseau || '').trim().replace(/[\\/]+$/, '');
    return { dossier: dossierExports(config), conservationJours: isFinite(j) && j > 0 ? Math.min(j, 3653) : 0, cheminReseau: reseau };
  }
  /** Sous-dossier des exports d'un service (code nettoyé) ; « Etablissement » pour un export qui couvre plusieurs services. */
  var DOSSIER_ETABLISSEMENT = 'Etablissement';
  function dossierExportService(service) {
    var c = String(service || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_ .()-]+/g, '_').trim().slice(0, 40);
    return c && c !== '.' && c !== '..' ? c : DOSSIER_ETABLISSEMENT;
  }
  /** Chemin Windows d'un dossier d'exports (ex. \\serveur\partage\SuiviIsoCont\exports\U1), ou '' si le chemin réseau n'est pas renseigné. */
  function cheminWindowsExports(config, sousDossiers) {
    var o = optionsExports(config);
    if (!o.cheminReseau) return '';
    return [o.cheminReseau].concat(o.dossier.split('/'), sousDossiers || []).join('\\');
  }
  /** Exports à purger : fichiers modifiés depuis plus de `conservationJours` (liste de { chemin, modifieLe… }). */
  function exportsAPurger(fichiers, conservationJours, maintenant) {
    if (!conservationJours) return [];
    var limite = maintenant - conservationJours * J;
    return (fichiers || []).filter(function (f) { return f.modifieLe < limite; });
  }

  /** Dossier des exports (chemin relatif au dossier des données), « exports » par défaut. */
  function dossierExports(config) {
    var d = String(((config && config.exports) || {}).dossier || '').trim();
    return d || 'exports';
  }

  return {
    CONSERVATION_EXPORTS: CONSERVATION_EXPORTS, DOSSIER_ETABLISSEMENT: DOSSIER_ETABLISSEMENT, optionsExports: optionsExports,
    dossierExportService: dossierExportService, cheminWindowsExports: cheminWindowsExports, exportsAPurger: exportsAPurger, dossierExports: dossierExports
  };
});
