// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Agenda du service — contrat déclaré au registre des modules (étape 6, docs/architecture.md § 7 bis).
 *
 * Organisation du service, aucune donnée clinique : accompagnements, activités thérapeutiques et réunions (`RDV`,
 * selon `nature`), tâches ponctuelles ou régulières (`TACHE`, `TACHE_FAITE`), absences des professionnels (`ABSENCE`),
 * alertes de types réglables par l'établissement (`ALERTE`, `ALERTE_VUE`). Journal `modules\agenda\`, clé propre, activation
 * par service ; lecture à la volée des fiches (Patients) et des échéances JLD (Isocont), jamais d'écriture ailleurs.
 *
 * Sous-étape 6.1 : contrat, droits et reconstitution de l'état ; les écrans viennent aux sous-étapes suivantes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).agenda = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['RDV', 'COMMENTAIRE', 'TACHE', 'TACHE_FAITE', 'ABSENCE', 'ALERTE', 'ALERTE_VUE'];
  var NATURES = { accompagnement: 'Accompagnement', activite: 'Activité thérapeutique', reunion: 'Réunion' };
  var CATEGORIES_ABSENCE = { conge: 'Congé', formation: 'Formation', exterieur: 'Réunion extérieure', autre: 'Autre' };
  // Identité du patient affichée dans l'agenda (décision du 4 novembre 2026 ; défaut proposé : initiales)
  var IDENTITES = { aucune: 'Aucune (« patient »)', initiales: 'Initiales', ipp: 'IPP', nom: 'Nom complet' };
  // Types d'alertes fournis (décision du 7 novembre 2026 : liste modifiable, types ajoutés, « Autre » libre à la saisie)
  var TYPES_ALERTE_DEFAUT = [
    { code: 'medecin', libelle: 'À voir par le médecin' }, { code: 'psychologue', libelle: 'À voir par le psychologue' },
    { code: 'social', libelle: 'À voir par l’assistant(e) de service social' }, { code: 'rdv', libelle: 'Rendez-vous à organiser' },
    { code: 'transmission', libelle: 'Information à transmettre' }
  ];

  function listeTypes(v) {
    return Array.isArray(v) ? v.filter(function (t) { return t && t.code && String(t.libelle || '').trim(); })
      .map(function (t) { return { code: String(t.code).slice(0, 40), libelle: String(t.libelle).trim().slice(0, 80) }; }) : null;
  }
  /**
   * Réglages de l'Agenda (`config.agenda`, journal du socle), validés à la lecture. `service` : la liste des types
   * d'alertes propre au service si elle existe (décision du porteur du 7 novembre 2026), sinon celle de l'établissement.
   * `modifAutresServices` : modifier un élément d'un autre service qui concerne un patient du service (faux par défaut :
   * lecture seule et commentaires).
   */
  function optionsAgenda(config, service) {
    var a = (config && config.agenda) || {}, parService = {};
    Object.keys(a.typesAlertesServices || {}).forEach(function (k) { var l = listeTypes(a.typesAlertesServices[k]); if (l && l.length) parService[k] = l; });
    var etab = listeTypes(a.typesAlertes);
    return { identite: IDENTITES[a.identite] ? a.identite : 'initiales', typesAlertesEtablissement: etab && etab.length ? etab : TYPES_ALERTE_DEFAUT.slice(),
      typesAlertes: (service && parService[service]) || (etab && etab.length ? etab : TYPES_ALERTE_DEFAUT.slice()), typesAlertesServices: parService,
      modifAutresServices: a.modifAutresServices === true };
  }

  /** Désignation d'un patient selon le réglage : initiales, IPP, nom complet, ou « patient ». */
  function identite(fiche, mode) {
    if (!fiche) return 'patient';
    if (mode === 'nom') return ((fiche.nom || '') + ' ' + (fiche.prenom || '')).trim() || 'patient';
    if (mode === 'ipp') return fiche.ipp ? 'IPP ' + fiche.ipp : 'patient (sans IPP)';
    if (mode === 'aucune') return 'patient';
    var ini = function (s) { return String(s || '').split(/[\s-]+/).filter(function (x) { return /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(x); }).map(function (x) { return x[0].toUpperCase(); }).join(''); };
    return (ini(fiche.prenom) + '.' + ini(fiche.nom) + '.').replace(/^\./, '') || 'patient';
  }

  /** Service où le patient est hospitalisé : unité du séjour en cours, sinon service de la fiche. */
  function serviceDuPatient(fiche) {
    var s = (fiche && fiche.sejours) || [], cours = null;
    s.forEach(function (x) { if (!x.sortie) cours = x; });
    return (cours && cours.service) || (fiche && fiche.service) || null;
  }

  /**
   * Éléments de l'agenda des services `services` qui chevauchent [debut, fin[ : ceux des services eux-mêmes, et ceux
   * d'un autre service qui concernent un patient hospitalisé dans l'un d'eux (décision du porteur du 7 novembre 2026 :
   * affichés en lecture seule, avec les seuls patients concernés). Triés par heure de début.
   */
  function elements(st, fiches, services, debut, fin) {
    var res = [];
    Object.keys(st.rdv).forEach(function (k) {
      var r = st.rdv[k];
      if (r.supprime || !(r.debut < fin) || !((r.fin || r.debut) >= debut)) return;
      if (services.indexOf(r.service) >= 0) { res.push({ rdv: r, externe: false, patients: r.patients || [] }); return; }
      if (r.nature === 'reunion') return;
      var concernes = (r.patients || []).filter(function (pid) { return services.indexOf(serviceDuPatient(fiches[pid])) >= 0; });
      if (concernes.length) res.push({ rdv: r, externe: true, patients: concernes });
    });
    return res.sort(function (a, b) { return a.rdv.debut - b.rdv.debut || String(a.rdv.titre).localeCompare(String(b.rdv.titre)); });
  }

  // Accès cochables dans « Rôles et accès » (rangés dans config.roles[CODE].accesModules.agenda)
  var ACCES = [
    { code: 'agenda.consulter', libelle: 'Consulter l’agenda du service', types: [] },
    { code: 'agenda.planifier', libelle: 'Planifier : accompagnements, activités, réunions, tâches', types: ['RDV', 'TACHE'] },
    { code: 'agenda.taches', libelle: 'Cocher les tâches faites', types: ['TACHE_FAITE'] },
    { code: 'agenda.alertes', libelle: 'Alertes (à voir par le médecin…) : créer, marquer vue', types: ['ALERTE', 'ALERTE_VUE'] },
    { code: 'agenda.absences', libelle: 'Saisir les absences de l’équipe (chacun saisit les siennes)', types: ['ABSENCE'] }
  ];
  // Accès par défaut des rôles fournis (proposition, réglable par l'établissement)
  var DROITS = {
    IDE: ['RDV', 'TACHE', 'TACHE_FAITE', 'ALERTE', 'ALERTE_VUE'],
    AS: ['TACHE_FAITE', 'ALERTE', 'ALERTE_VUE'],
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
      case 'COMMENTAIRE':
        // Commentaire sur un élément, y compris d'un autre service (décision du porteur : le service du patient commente)
        var rc = st.rdv[d.rdv];
        if (!rc || !d.id) break;
        rc.commentaires = (rc.commentaires || []).filter(function (x) { return x.id !== d.id; });
        rc.commentaires.push({ id: d.id, texte: d.texte || '', service: d.service || null, par: e.by, le: e.at, evt: e.id });
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
      case 'ALERTE':
        if (!d.id) break;
        var al = st.alertes[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['type', 'libelle', 'patientId', 'service', 'avant', 'pour', 'motif', 'supprime'].forEach(function (k) { if (d[k] !== undefined) al[k] = d[k]; });
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

  /**
   * Saisies permises sans accès particulier à qui a un rôle dans l'Agenda (et donc sa clé) : ses propres absences, et
   * un commentaire sur un élément (décisions du porteur du 7 novembre 2026).
   */
  function permisPourSoi(type, data, compte) {
    if (type === 'COMMENTAIRE') return !!compte && !!data && !data.supprime;   // retrait : annulation depuis le journal
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
  return { contrat: contrat, reduire: reduire, NATURES: NATURES, CATEGORIES_ABSENCE: CATEGORIES_ABSENCE, ACCES: ACCES, droits: D,
    IDENTITES: IDENTITES, TYPES_ALERTE_DEFAUT: TYPES_ALERTE_DEFAUT, optionsAgenda: optionsAgenda, identite: identite, serviceDuPatient: serviceDuPatient, elements: elements };
});
