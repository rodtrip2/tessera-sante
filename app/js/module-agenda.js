// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Agenda du service — contrat déclaré au registre des modules (étape 6, docs/architecture.md § 7 bis).
 *
 * Organisation du service, aucune donnée clinique : accompagnements, activités thérapeutiques et réunions (`RDV`,
 * selon `nature`), tâches ponctuelles ou régulières (`TACHE`, `TACHE_FAITE`), absences des professionnels (`ABSENCE`),
 * alertes « à voir par le médecin » (`ALERTE_MEDECIN`, `ALERTE_VUE`). Journal `modules\agenda\`, clé propre, activation
 * par service ; lecture à la volée des fiches (Patients) et des échéances JLD (Isocont), jamais d'écriture ailleurs.
 *
 * Sous-étape 6.1 : contrat, droits et reconstitution de l'état ; les écrans viennent aux sous-étapes suivantes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).agenda = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['RDV', 'TACHE', 'TACHE_FAITE', 'ABSENCE', 'ALERTE_MEDECIN', 'ALERTE_VUE'];
  var NATURES = { accompagnement: 'Accompagnement', activite: 'Activité thérapeutique', reunion: 'Réunion' };
  var CATEGORIES_ABSENCE = { conge: 'Congé', formation: 'Formation', exterieur: 'Réunion extérieure', autre: 'Autre' };

  // Accès cochables dans « Rôles et accès » (rangés dans config.roles[CODE].accesModules.agenda)
  var ACCES = [
    { code: 'agenda.consulter', libelle: 'Consulter l’agenda du service', types: [] },
    { code: 'agenda.planifier', libelle: 'Planifier : accompagnements, activités, réunions, tâches', types: ['RDV', 'TACHE'] },
    { code: 'agenda.taches', libelle: 'Cocher les tâches faites', types: ['TACHE_FAITE'] },
    { code: 'agenda.alertes', libelle: 'Alertes « à voir par le médecin » : créer, marquer vu', types: ['ALERTE_MEDECIN', 'ALERTE_VUE'] },
    { code: 'agenda.absences', libelle: 'Saisir les absences de l’équipe (chacun saisit les siennes)', types: ['ABSENCE'] }
  ];
  // Accès par défaut des rôles fournis (proposition, réglable par l'établissement)
  var DROITS = {
    IDE: ['RDV', 'TACHE', 'TACHE_FAITE', 'ALERTE_MEDECIN', 'ALERTE_VUE'],
    AS: ['TACHE_FAITE', 'ALERTE_MEDECIN', 'ALERTE_VUE'],
    SECRETAIRE: ['RDV', 'TACHE', 'TACHE_FAITE'],
    CADRE: TYPES.slice()
  };

  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'agenda', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.agenda : undefined; },
    appartenance: 'acces'
  });

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV':
        if (!d.id) break;
        var r = st.rdv[d.id] || { id: d.id, cree: e.at, par: e.by, evts: [] };
        ['nature', 'titre', 'debut', 'fin', 'lieu', 'service', 'patients', 'professionnels', 'motif', 'supprime'].forEach(function (k) { if (d[k] !== undefined) r[k] = d[k]; });
        r.evts.push(e.id);
        st.rdv[d.id] = r;
        break;
      case 'TACHE':
        if (!d.id) break;
        var t = st.taches[d.id] || { id: d.id, cree: e.at, par: e.by, faites: {}, evts: [] };
        ['titre', 'service', 'echeance', 'heure', 'regularite', 'jours', 'jusquAu', 'pour', 'supprime'].forEach(function (k) { if (d[k] !== undefined) t[k] = d[k]; });
        t.evts.push(e.id);
        st.taches[d.id] = t;
        break;
      case 'TACHE_FAITE':
        var tf = st.taches[d.tache];
        if (tf && d.occurrence) tf.faites[d.occurrence] = d.annule ? undefined : { par: e.by, le: e.at, evt: e.id };
        break;
      case 'ABSENCE':
        if (!d.id) break;
        var a = st.absences[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['agent', 'nom', 'debut', 'fin', 'categorie', 'service', 'supprime'].forEach(function (k) { if (d[k] !== undefined) a[k] = d[k]; });
        st.absences[d.id] = a;
        break;
      case 'ALERTE_MEDECIN':
        if (!d.id) break;
        var al = st.alertes[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['patientId', 'service', 'avant', 'medecin', 'motif', 'supprime'].forEach(function (k) { if (d[k] !== undefined) al[k] = d[k]; });
        st.alertes[d.id] = al;
        break;
      case 'ALERTE_VUE':
        if (st.alertes[d.alerte]) st.alertes[d.alerte].vue = { par: e.by, le: e.at, evt: e.id };
        break;
    }
  }
  function reduire(evts) {
    return N.reduire(evts, { etat: function () { return { rdv: {}, taches: {}, absences: {}, alertes: {} }; }, appliquer: appliquer });
  }

  /** Services sur lesquels agit une saisie de l'Agenda (activation du module par service). */
  function cibles(st, e) {
    var d = e.data || {}, x = null;
    if (e.type === 'TACHE_FAITE') x = st && st.taches && st.taches[d.tache];
    else if (e.type === 'ALERTE_VUE') x = st && st.alertes && st.alertes[d.alerte];
    var sv = d.service || (x && x.service);
    return sv ? [sv] : [];
  }

  /** Une saisie que chacun peut faire pour lui-même : ses propres absences (décision du porteur). */
  function permisPourSoi(type, data, compte) {
    return type === 'ABSENCE' && !!compte && !!data && data.agent === compte.id;
  }

  var contrat = {
    id: 'agenda',
    libelle: 'Agenda du service',
    version: '0.1.0',
    icone: 'AG',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, permisPourSoi: permisPourSoi,
      services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'agenda', libelle: 'Agenda' }] },
    migrations: [],
    fournitures: [],
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }, { fourniture: 'isocont.echeancesJLD', version: 1, obligatoire: false }]
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, NATURES: NATURES, CATEGORIES_ABSENCE: CATEGORIES_ABSENCE, ACCES: ACCES, droits: D };
});
