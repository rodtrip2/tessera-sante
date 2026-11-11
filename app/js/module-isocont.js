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

  /**
   * Fourniture `isocont.echeancesJLD` v1 (lue par l'Agenda) : prochaine échéance JLD non encore tracée de chaque mesure en cours
   * des services demandés, dépassées ou dans les `heures` à venir (72 par défaut). Toujours calculées par le moteur
   * d'Isocont (depuis le début de la mesure), jamais recopiées. options : { maintenant, services, heures }.
   */
  var NATURES_JLD = { info: 'Information du juge', saisine: 'Saisine du juge', decision: 'Décision du juge attendue' };
  function echeancesJLD(st, options) {
    var maintenant = options.maintenant || Date.now(), horizon = maintenant + (options.heures || 72) * 36e5, res = [];
    if (!st || !st.mesures || !M) return res;
    Object.keys(st.mesures).forEach(function (k) {
      var m = st.mesures[k];
      if (typeof m.fin === 'number' || m.annulee || (options.services && options.services.indexOf(m.service) < 0)) return;
      var j = M.suiviJLD(st, m, maintenant);
      // Prochaine démarche seulement (la première non tracée), pour ne pas encombrer l'agenda des étapes suivantes
      var suivante = ['info', 'saisine', 'decision'].filter(function (n) { return j[n] && typeof j[n].echeance === 'number' && typeof j[n].effective !== 'number'; })[0];
      [suivante].forEach(function (n) {
        var e = n && j[n];
        if (!e || e.echeance > horizon) return;
        res.push({ date: e.echeance, nature: n, libelle: NATURES_JLD[n], typeMesure: m.type, service: m.service, mesure: m.id, patientId: m.patientId, cycle: j.cycle, statut: e.statut });
      });
    });
    return res.sort(function (a, b) { return a.date - b.date; });
  }

  /**
   * Mesures en cours (0.29.1, plan du service) : [{ patientId, service, lieu, csi, type, debut }]. Une mesure en soins
   * somatiques est hors du service : non comptée.
   */
  function enCours(st, options) {
    var res = [];
    if (!st || !st.mesures) return res;
    Object.keys(st.mesures).forEach(function (k) {
      var m = st.mesures[k];
      if (typeof m.fin === 'number' || m.annulee || m.somatique || (options.services && options.services.indexOf(m.service) < 0)) return;
      res.push({ patientId: m.patientId, service: m.service, lieu: m.lieu || '', csi: !!m.csi, type: m.type, debut: m.debut });
    });
    return res;
  }

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
        // Onglet « Patients » d'Isocont : statistiques d'isolement et de contention par patient (décision du porteur du
        // 7 novembre 2026 : gardé tel quel dans la fenêtre d'Isocont ; la liste des patients a sa propre fenêtre)
        { code: 'patients', libelle: 'Patients' },
        { code: 'tableau', libelle: 'Tableau de bord' }, { code: 'mesures', libelle: 'Mesures' },
        { code: 'jld', libelle: 'JLD' }, { code: 'surveillance', libelle: 'Surveillance CSI' }, { code: 'registre', libelle: 'Registre' },
        { code: 'stats', libelle: 'Statistiques' }, { code: 'plan', libelle: 'Plan du service' }
      ].map(function (o) { o.masquable = M.ONGLETS_MASQUABLES.indexOf(o.code) >= 0; return o; })
    },

    // Migrations : aucune pour l'instant (le paramétrage d'Isocont 1.67 est repris tel quel)
    migrations: [],

    // Jeu de formation : données fictives générées à partir du paramétrage réel (demo.js)
    formation: { generer: function (config) { return root.SIC.donneesFictives({ config: config }); } },

    // Fournitures : lues à la volée par d'autres modules (calcul à brancher avec l'Agenda, étape 6)
    fournitures: [
      { nom: 'isocont.echeancesJLD', version: 1, acces: 'jld', lire: echeancesJLD,
        champs: ['date', 'nature', 'typeMesure', 'service', 'mesure', 'patientId', 'statut'] },
      { nom: 'isocont.enCours', version: 1, acces: 'lecture', lire: enCours, champs: ['patientId', 'service', 'lieu', 'csi', 'type', 'debut'] }
    ],

    // Besoins : la fiche commune du module Patients (étape 5), indispensable
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }]
  };

  registre.declarer(contrat);
  return { contrat: contrat };
});
