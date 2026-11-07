// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Isocont — contrat déclaré au registre des modules (étape 2 du plan d'architecture, docs/architecture.md § 3).
 * Les règles restent dans rules.js et model.js ; l'interface (vues, libellés du journal, panneaux d'administration)
 * s'ajoute au contrat depuis ui-isocont.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./module-patients.js'); module.exports = factory(require('./model.js'), require('./modules.js'), root); }
  else factory(root.SIC.model, root.SIC.modules, root);
})(typeof self !== 'undefined' ? self : this, function (M, registre, root) {
  'use strict';

  var contrat = {
    // Identité
    id: 'isocont',
    libelle: 'Isolement et contention',
    version: '1.67.1',          // règles d'Isocont reprises (Suivi-mesures-isocont 1.67.1)
    icone: 'IC',

    // Accès cochables pour les rôles, et droits liés (règles du socle, données du module : model.js)
    acces: M.ACCES,
    droits: M.droits,

    // Saisies : types propres au module, champ logique pour les conflits, reconstitution de l'état
    saisies: {
      // (PATIENT, MODE_HOSPI, FUSION : saisies du module Patients, lues à la volée et reconstituées ici comme avant)
      types: ['MESURE_DEBUT', 'MESURE_FIN', 'PAUSE', 'REPRISE', 'TIERS', 'JLD', 'RECOURS',
        'PROFESSIONNEL', 'INFORMATION', 'TRANSFERT', 'SOMATIQUE', 'SOMATIQUE_RETOUR', 'ENTRETIEN', 'PROPOSITION', 'CORRECTION',
        'REFUS_PROPOSITION', 'STATS'],
      champ: M.champ,
      services: M.servicesSaisie,   // services concernés par une saisie (visibilité du journal)
      cibles: M.servicesCibles,     // services sur lesquels une saisie agit (activation du module par service)
      reduire: M.reduire
    },

    // Réglages : valeurs par défaut, groupes de l'export des réglages, réglages jamais exportés
    reglages: { defaut: M.CONFIG_DEFAUT, groupes: M.GROUPES_REGLAGES, exclus: M.REGLAGES_EXCLUS },

    // Vues : onglets du module (« Journal » et « Administration » appartiennent au socle)
    vues: {
      onglets: [
        // (onglet « Patients » : déclaré par le module Patients, affiché en tête ; décision du porteur du 7 novembre 2026)
        { code: 'tableau', libelle: 'Tableau de bord' }, { code: 'mesures', libelle: 'Mesures' },
        { code: 'jld', libelle: 'JLD' }, { code: 'surveillance', libelle: 'Surveillance CSI' }, { code: 'registre', libelle: 'Registre' },
        { code: 'stats', libelle: 'Statistiques' }
      ].map(function (o) { o.masquable = M.ONGLETS_MASQUABLES.indexOf(o.code) >= 0; return o; })
    },

    // Migrations : aucune pour l'instant (le paramétrage d'Isocont 1.67 est repris tel quel)
    migrations: [],

    // Jeu de formation : données fictives générées à partir du paramétrage réel (demo.js)
    formation: { generer: function (config) { return root.SIC.donneesFictives({ config: config }); } },

    // Fournitures : lues à la volée par d'autres modules (calcul à brancher avec l'Agenda, étape 6)
    fournitures: [
      { nom: 'isocont.echeancesJLD', version: 1, acces: 'jld',
        champs: ['date', 'nature', 'typeMesure', 'service', 'mesure', 'statut'] }
    ],

    // Besoins : la fiche commune du module Patients (étape 5), indispensable
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }]
  };

  registre.declarer(contrat);
  return { contrat: contrat };
});
