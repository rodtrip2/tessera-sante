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

  var TYPES = ['RDV', 'COMMENTAIRE', 'CHECK', 'TACHE', 'TACHE_EQUIPE', 'TACHE_AJUSTEMENT', 'TACHE_FAITE', 'ABSENCE', 'ALERTE', 'ALERTE_VUE'];
  var NATURES = { accompagnement: 'Accompagnement', activite: 'Activité thérapeutique', reunion: 'Réunion', sortie: 'Sortie ou permission', autre: 'Autre événement' };
  var REGULARITES = { aucune: 'Une seule fois', jour: 'Chaque jour', semaine: 'Chaque semaine (jours choisis)', mois: 'Chaque mois (même date)' };
  // Modèle de check-list fourni (décision du porteur du 7 novembre 2026 : exemple de la sortie d'un patient), modifiable
  // Chaque point porte son délai d'alerte en jours avant l'événement (0 : le jour même ; null : sans alerte), exemple du porteur
  var CHECKLISTS_DEFAUT = [{ code: 'sortie', libelle: 'Sortie du patient', items: [
    { libelle: 'Infirmier(ère) libéral(e) prévenu(e)', delai: 2 }, { libelle: 'Rendez-vous au centre médico-psychologique (CMP)', delai: 1 },
    { libelle: 'Transport commandé (VSL, taxi, ambulance)', delai: 1 }, { libelle: 'Lettre de sortie', delai: 0 }, { libelle: 'Ordonnance', delai: 0 }] }];
  // Tâches du service : ce que les rôles qui « ajustent » peuvent changer (décision du porteur : paramétrable)
  var AJUSTABLES = { affectation: 'Affecter un agent (une date, ou certains jours de la répétition)', heure: 'Changer l’heure', consigne: 'Changer la précision' };
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

  // ------------------------------------------------------------ Répétition (événements et tâches)
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function depuisISO(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function plusJours(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }   // heures d'été comprises
  /** Répétition validée : { type: aucune | jour | semaine | mois, jours: [0..6] (semaine), jusquAu: 'AAAA-MM-JJ' | '' }. */
  function regularite(v) {
    var r = v || {}, type = REGULARITES[r.type] ? r.type : 'aucune';
    var jours = Array.isArray(r.jours) ? r.jours.map(Number).filter(function (j) { return j >= 0 && j <= 6; }) : [];
    return { type: type, jours: jours, jusquAu: depuisISO(r.jusquAu) ? r.jusquAu : '' };
  }
  /**
   * Dates (AAAA-MM-JJ) des occurrences d'une répétition à partir du jour `premier` (ms), dans [debut, fin[ (ms).
   * Semaine sans jour choisi : le jour de la première occurrence. Mois : même quantième (mois trop courts sautés).
   */
  function datesOccurrences(premier, reg, debut, fin) {
    var r = regularite(reg), res = [], j0 = depuisISO(jourISO(premier)), limite = r.jusquAu ? plusJours(depuisISO(r.jusquAu), 1) : Infinity;
    if (r.type === 'aucune') return j0 < fin && plusJours(j0, 1) > debut ? [jourISO(j0)] : [];
    var depart = Math.max(j0, depuisISO(jourISO(debut))), jours = r.jours.length ? r.jours : [new Date(j0).getDay()];
    for (var t = depart, n = 0; t < fin && t < limite && n < 400; t = plusJours(t, 1), n++) {
      var d = new Date(t);
      if (r.type === 'jour' || (r.type === 'semaine' && jours.indexOf(d.getDay()) >= 0) || (r.type === 'mois' && d.getDate() === new Date(j0).getDate())) res.push(jourISO(t));
    }
    return res;
  }
  /** Occurrences d'un élément qui chevauchent [debut, fin[ : { occurrence, debut, fin } (même heure, même durée). */
  function occurrences(r, debut, fin) {
    var duree = (r.fin || r.debut) - r.debut, b = new Date(r.debut), exc = r.exceptions || [];
    function aLHeure(j) { var d = new Date(depuisISO(j)); d.setHours(b.getHours(), b.getMinutes(), 0, 0); return d.getTime(); }   // heure locale gardée
    var reg = regularite(r.regularite);
    if (reg.type === 'aucune') return r.debut < fin && (r.fin || r.debut) >= debut ? [{ occurrence: jourISO(r.debut), debut: r.debut, fin: r.fin || null }] : [];
    return datesOccurrences(r.debut, reg, plusJours(debut, -Math.ceil(duree / 864e5) - 1), fin).filter(function (j) { return exc.indexOf(j) < 0; })
        .map(function (j) { var d0 = aLHeure(j); return { occurrence: j, debut: d0, fin: r.fin ? d0 + duree : null }; })
      .filter(function (o) { return o.debut < fin && (o.fin || o.debut) >= debut; });
  }

  function delaiValide(v) { return v === null || v === undefined || v === '' ? null : Math.max(0, Math.min(30, Math.round(+v) || 0)); }
  /**
   * Check-list d'une occurrence : points, cochés ou non (qui, quand), date d'alerte de chaque point (jour de
   * l'événement moins son délai) et, si `maintenant` est donné, points en alerte (non faits, date d'alerte atteinte).
   */
  function etatChecklist(r, occurrence, maintenant) {
    var jour = depuisISO(occurrence);
    var items = (r.checklist || []).map(function (it) {
      var c = (r.coches || {})[occurrence + '|' + it.id], delai = delaiValide(it.delai), ech = delai === null || jour === null ? null : plusJours(jour, -delai);
      return { id: it.id, libelle: it.libelle, delai: delai, echeance: ech, fait: c || null, alerte: !c && ech !== null && maintenant !== undefined && maintenant >= ech };
    });
    return { items: items, reste: items.filter(function (x) { return !x.fait; }).length, alertes: items.filter(function (x) { return x.alerte; }).length };
  }

  /** Modèles de check-lists (`config.agenda.checklists`), validés : [{ code, libelle, items: [{ libelle, delai }] }]. */
  function checklists(config) {
    var a = (config && config.agenda) || {};
    function item(x) { return typeof x === 'string' ? { libelle: x.trim().slice(0, 120), delai: null } : { libelle: String((x && x.libelle) || '').trim().slice(0, 120), delai: delaiValide(x && x.delai) }; }
    var l = Array.isArray(a.checklists) ? a.checklists.filter(function (c) { return c && c.code && String(c.libelle || '').trim() && Array.isArray(c.items); })
      .map(function (c) { return { code: String(c.code), libelle: String(c.libelle).trim().slice(0, 80), items: c.items.map(item).filter(function (x) { return x.libelle; }) }; }) : null;
    return l || CHECKLISTS_DEFAUT.map(function (c) { return { code: c.code, libelle: c.libelle, items: c.items.map(item) }; });
  }

  /**
   * Points de check-list en alerte dans les services : événements des 15 prochains jours (et du jour), points non faits
   * dont la date d'alerte est atteinte. [{ rdv, occurrence, debut, item }], par date d'alerte.
   */
  function alertesChecklists(st, fiches, services, maintenant) {
    var res = [];
    elements(st, fiches, services, plusJours(depuisISO(jourISO(maintenant)), 0), plusJours(maintenant, 16)).forEach(function (x) {
      if (x.externe && !(x.rdv.checklist || []).length) return;
      etatChecklist(x.rdv, x.occurrence, maintenant).items.forEach(function (it) { if (it.alerte) res.push({ rdv: x.rdv, occurrence: x.occurrence, debut: x.debut, item: it }); });
    });
    return res.sort(function (a, b) { return a.item.echeance - b.item.echeance || a.debut - b.debut; });
  }

  /** Réglages des tâches (`config.agenda.taches`) : ce que les rôles qui ajustent peuvent changer ; tâches d'équipe récurrentes. */
  function optionsTaches(config) {
    var t = ((config && config.agenda) || {}).taches || {};
    var aj = Array.isArray(t.ajustables) ? t.ajustables.filter(function (k) { return AJUSTABLES[k]; }) : ['affectation'];
    return { ajustables: aj, equipeRecurrentes: t.equipeRecurrentes === true };
  }

  // ------------------------------------------------------------ Tâches du service
  /** La tâche est-elle pour cet agent (rôles ou agents désignés ; sans désignation : toute l'équipe du service) ? */
  function tachePour(t, compte) {
    var p = t.pour || {}, roles = p.roles || [], agents = p.agents || [];
    if (!roles.length && !agents.length) return true;
    return !!compte && (agents.indexOf(compte.id) >= 0 || (compte.roles || []).some(function (r) { return roles.indexOf(r) >= 0; }));
  }
  /** Agent affecté à une date d'une tâche : affectation de la date, sinon du jour de la semaine, sinon aucun. */
  function affectation(t, occurrence) {
    var a = (t.affectations || {})[occurrence];
    if (a !== undefined) return a && a.agent ? a : null;
    var j = depuisISO(occurrence) === null ? null : new Date(depuisISO(occurrence)).getDay(), aj = j === null ? null : (t.affectationsJours || {})[j];
    return aj && aj.agent ? aj : null;
  }
  /** Tâches des services dues dans [debut, fin[ : { tache, occurrence (AAAA-MM-JJ), fait: { par, le } | null, affecte }. */
  function tachesDues(st, services, debut, fin) {
    var res = [];
    Object.keys(st.taches).forEach(function (k) {
      var t = st.taches[k], d0 = depuisISO(t.debut);
      if (t.supprime || services.indexOf(t.service) < 0 || d0 === null) return;
      datesOccurrences(d0, t.regularite, debut, fin).forEach(function (j) { res.push({ tache: t, occurrence: j, fait: t.faites[j] || null, affecte: affectation(t, j) }); });
    });
    return res.sort(function (a, b) { return a.occurrence.localeCompare(b.occurrence) || String(a.tache.heure || '99').localeCompare(String(b.tache.heure || '99')) || String(a.tache.titre).localeCompare(String(b.tache.titre)); });
  }

  // ------------------------------------------------------------ Absences
  /** Absences des services (ou de leurs professionnels) qui chevauchent [debut, fin[. Motif facultatif. */
  function absences(st, debut, fin) {
    return Object.keys(st.absences).map(function (k) { return st.absences[k]; })
      .filter(function (a) { return !a.supprime && a.debut < fin && (a.fin || a.debut) >= debut; })
      .sort(function (a, b) { return a.debut - b.debut; });
  }
  /** Professionnels prévus sur une occurrence et absents pendant celle-ci (comptes désignés). */
  function prevusAbsents(st, r, o) {
    var abs = absences(st, o.debut, o.fin || o.debut + 1);
    return (r.professionnels || []).filter(function (p) { return p.id && abs.some(function (a) { return a.agent === p.id; }); });
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
      if (r.supprime) return;
      var externe = services.indexOf(r.service) < 0, concernes = r.patients || [];
      if (externe) {
        if (r.nature === 'reunion') return;
        concernes = concernes.filter(function (pid) { return services.indexOf(serviceDuPatient(fiches[pid])) >= 0; });
        if (!concernes.length) return;
      }
      occurrences(r, debut, fin).forEach(function (o) {
        res.push({ rdv: r, externe: externe, patients: concernes, occurrence: o.occurrence, debut: o.debut, fin: o.fin, checklist: etatChecklist(r, o.occurrence), absents: prevusAbsents(st, r, o) });
      });
    });
    return res.sort(function (a, b) { return a.debut - b.debut || String(a.rdv.titre).localeCompare(String(b.rdv.titre)); });
  }

  // Accès cochables dans « Rôles et accès » (rangés dans config.roles[CODE].accesModules.agenda)
  var ACCES = [
    { code: 'agenda.consulter', libelle: 'Consulter l’agenda du service', types: [] },
    { code: 'agenda.planifier', libelle: 'Planifier : accompagnements, activités, réunions, sorties, événements', types: ['RDV'] },
    { code: 'agenda.reglerTaches', libelle: 'Régler les tâches du service (ponctuelles et récurrentes ; seuls ces rôles les suppriment)', types: ['TACHE'] },
    { code: 'agenda.ajusterTaches', libelle: 'Ajuster les tâches du service (affecter un agent, et ce que permet le réglage)', types: ['TACHE_AJUSTEMENT'] },
    { code: 'agenda.tachesEquipe', libelle: 'Créer, modifier et supprimer les tâches de l’équipe (ponctuelles ; récurrentes si le réglage le permet)', types: ['TACHE_EQUIPE'] },
    { code: 'agenda.taches', libelle: 'Cocher les tâches faites et les check-lists', types: ['TACHE_FAITE', 'CHECK'] },
    { code: 'agenda.alertes', libelle: 'Alertes (à voir par le médecin…) : créer, marquer vue', types: ['ALERTE', 'ALERTE_VUE'] },
    { code: 'agenda.absences', libelle: 'Saisir les absences de l’équipe (chacun saisit les siennes)', types: ['ABSENCE'] }
  ];
  // Accès par défaut des rôles fournis (proposition, réglable par l'établissement)
  var DROITS = {
    // Régler les tâches du service : cadre seulement par défaut (proposition, réglable dans « Rôles et accès »)
    IDE: ['RDV', 'TACHE_AJUSTEMENT', 'TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK', 'ALERTE', 'ALERTE_VUE'],
    AS: ['TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK', 'ALERTE', 'ALERTE_VUE'],
    SECRETAIRE: ['RDV', 'TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK'],
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
        ['nature', 'titre', 'debut', 'fin', 'lieu', 'service', 'patients', 'professionnels', 'motif', 'supprime', 'regularite', 'exceptions', 'checklist'].forEach(function (k) { if (d[k] !== undefined) r[k] = d[k]; });
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
      case 'CHECK':
        // Point de check-list coché (ou décoché) pour une occurrence de l'élément
        var rk = st.rdv[d.rdv];
        if (!rk || !d.item) break;
        rk.coches = rk.coches || {};
        var cle = (d.occurrence || '') + '|' + d.item;
        if (d.fait === false) delete rk.coches[cle]; else rk.coches[cle] = { par: e.by, le: e.at, evt: e.id };
        break;
      case 'TACHE':
      case 'TACHE_EQUIPE':
        // Tâche du service (réglée par le cadre : protégée) ou tâche d'équipe (créée par un agent : modifiable par tous) ;
        // une saisie d'équipe ne touche jamais une tâche du service
        if (!d.id) break;
        var niveau = e.type === 'TACHE' ? 'service' : 'equipe', t = st.taches[d.id];
        if (t && t.niveau === 'service' && niveau === 'equipe') break;
        t = t || { id: d.id, cree: e.at, par: e.by, faites: {}, affectations: {}, affectationsJours: {}, evts: [], niveau: niveau };
        if (niveau === 'service') t.niveau = 'service';
        ['titre', 'service', 'debut', 'heure', 'regularite', 'pour', 'consigne', 'supprime'].forEach(function (k) { if (d[k] !== undefined) t[k] = d[k]; });
        t.evts.push(e.id);
        st.taches[d.id] = t;
        break;
      case 'TACHE_AJUSTEMENT':
        // Ajustement d'une tâche du service par un autre rôle : affectation (une date ou des jours de la répétition), heure, précision
        var ta = st.taches[d.tache];
        if (!ta) break;
        if (d.occurrence) ta.affectations[d.occurrence] = d.agent ? { agent: d.agent, nom: d.nom || '' } : null;
        (d.jours || []).forEach(function (j) { ta.affectationsJours[j] = d.agent ? { agent: d.agent, nom: d.nom || '' } : null; });
        if (d.heure !== undefined) ta.heure = d.heure;
        if (d.consigne !== undefined) ta.consigne = d.consigne;
        ta.evts.push(e.id);
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
    else if (e.type === 'CHECK' || e.type === 'COMMENTAIRE') x = d.service ? null : st && st.rdv && st.rdv[d.rdv];
    else if (e.type === 'TACHE_AJUSTEMENT') x = st && st.taches && st.taches[d.tache];
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

  /**
   * Contrôles propres à l'Agenda avant l'enregistrement (décision du porteur du 7 novembre 2026) : une tâche du service
   * ne se modifie ni ne se supprime par une saisie d'équipe ; un ajustement ne change que ce que permet le réglage ;
   * une tâche d'équipe récurrente demande le réglage, ou le droit de régler les tâches. ctx : { etat, config, peut }.
   */
  function controler(type, d, ctx) {
    var st = ctx.etat || { taches: {} }, t = d && (st.taches[d.id] || st.taches[d.tache]), o = optionsTaches(ctx.config);
    if (type === 'TACHE_EQUIPE') {
      if (t && t.niveau === 'service') throw new Error('Cette tâche est une tâche du service : seuls les rôles qui règlent les tâches la modifient ou la suppriment.');
      var inchangee = t && JSON.stringify(regularite(t.regularite)) === JSON.stringify(regularite(d.regularite));
      if (d.regularite && regularite(d.regularite).type !== 'aucune' && !inchangee && !o.equipeRecurrentes && !ctx.peut('TACHE')) throw new Error('Les tâches récurrentes sont réglées par les rôles qui règlent les tâches du service.');
    }
    if (type === 'TACHE_AJUSTEMENT') {
      if (!t || t.niveau !== 'service') throw new Error('Tâche du service introuvable.');
      var demandes = [];
      if (d.occurrence || (d.jours || []).length) demandes.push('affectation');
      if (d.heure !== undefined) demandes.push('heure');
      if (d.consigne !== undefined) demandes.push('consigne');
      var refus = demandes.filter(function (k) { return o.ajustables.indexOf(k) < 0; });
      if (refus.length) throw new Error('Le réglage de l’établissement ne permet pas d’ajuster : ' + refus.map(function (k) { return AJUSTABLES[k].toLowerCase(); }).join(', ') + '.');
    }
  }

  var contrat = {
    id: 'agenda',
    libelle: 'Agenda du service',
    version: '0.1.0',
    icone: 'AG',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, permisPourSoi: permisPourSoi, controler: controler,
      services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    // Onglet « Tâches du service » : affiché à qui peut régler les tâches (décision du porteur du 7 novembre 2026)
    vues: { onglets: [{ code: 'agenda', libelle: 'Agenda' }, { code: 'taches', libelle: 'Tâches du service', droit: ['TACHE', 'TACHE_AJUSTEMENT', 'TACHE_EQUIPE'] }] },
    migrations: [],
    fournitures: [],
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }, { fourniture: 'isocont.echeancesJLD', version: 1, obligatoire: false }]
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, NATURES: NATURES, CATEGORIES_ABSENCE: CATEGORIES_ABSENCE, ACCES: ACCES, droits: D,
    IDENTITES: IDENTITES, TYPES_ALERTE_DEFAUT: TYPES_ALERTE_DEFAUT, optionsAgenda: optionsAgenda, identite: identite, serviceDuPatient: serviceDuPatient, elements: elements,
    REGULARITES: REGULARITES, CHECKLISTS_DEFAUT: CHECKLISTS_DEFAUT, regularite: regularite, datesOccurrences: datesOccurrences, occurrences: occurrences,
    etatChecklist: etatChecklist, checklists: checklists, alertesChecklists: alertesChecklists, optionsTaches: optionsTaches, AJUSTABLES: AJUSTABLES, affectation: affectation, controler: controler, tachePour: tachePour, tachesDues: tachesDues, absences: absences, prevusAbsents: prevusAbsents, jourISO: jourISO, depuisISO: depuisISO };
});
