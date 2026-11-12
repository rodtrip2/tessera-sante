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
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'), require('./agenda-participants.js'), require('./agenda-permissions.js'));
  else (root.SIC = root.SIC || {}).agenda = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.agendaParticipants, root.SIC.agendaPermissions);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, P, Pm) {
  'use strict';

  var TYPES = ['RDV', 'OCCURRENCE', 'COMMENTAIRE', 'CHECK', 'INSCRIPTION', 'PATIENT_INSCRIT', 'VALIDATION', 'TRANSPORT', 'TACHE', 'TACHE_EQUIPE', 'TACHE_AJUSTEMENT', 'TACHE_FAITE', 'ABSENCE', 'ALERTE', 'ALERTE_VUE', 'TACHE_PERSO'];
  // Types d'éléments (décisions du porteur du 7 novembre 2026 : entretien médical ou infirmier, individuel ou avec la
  // famille ; permission de sortie demandée puis validée, distincte de la sortie du patient)
  // Audience JLD (services de psychiatrie) et Examen : décisions du porteur du 8 novembre 2026
  var NATURES = { accompagnement: 'Accompagnement', entretien: 'Entretien', examen: 'Examen', activite: 'Activité thérapeutique', reunion: 'Réunion',
    audience: 'Audience JLD', permission: 'Permission de sortie', sortie: 'Sortie du patient', autre: 'Autre événement' };
  // Éléments ajoutables à tout événement (décision du 8 novembre 2026) : patients, transports, accompagnateurs, permission
  // à faire valider, validation médicale ou autre
  var TRANSPORTS = { vsl: 'VSL', taxi: 'Taxi', ambulance: 'Ambulance', vehicule: 'Véhicule du service', autre: 'Autre transport' };
  var TYPES_VALIDATION = { permission: 'Permission de sortie', medicale: 'Validation médicale', autre: 'Autre validation' };
  var EXAMENS = ['Prise de sang', 'Radiographie', 'Scanner', 'IRM', 'Échographie', 'Électrocardiogramme (ECG)', 'Électroencéphalogramme (EEG)', 'Consultation spécialisée', 'Soins dentaires', 'Autre examen'];
  var ENTRETIENS = { medical: 'médical', infirmier: 'infirmier' };
  var AVEC = { individuel: 'individuel', famille: 'avec la famille' };
  var STATUTS_PERMISSION = { demande: 'Permission de sortie (demande)', validee: 'Permission validée' };
  // Couleurs proposées par type (réglables par l'établissement, Administration → Agenda)
  var COULEURS_DEFAUT = { accompagnement: '#2c5c9b', entretien: '#0f7c8c', examen: '#b0457a', activite: '#2e7d4f', reunion: '#6b3fa0', audience: '#3d4f5c', permission: '#9a6a00',
    sortie: '#b3261e', autre: '#545c57', tache: '#6b5a3a', alerte: '#b3261e' };
  // Délai de validation médicale d'une permission, en heures avant son début, selon le mode d'hospitalisation (décision du
  // porteur : 48 h pour les SDRE, jusqu'au dernier moment pour les soins libres ; autres modes proposés, réglables)
  var DELAIS_PERMISSION_DEFAUT = { SDRE: 48, SDT: 24, SDTU: 24, SPI: 24, SL: 0, 'SL mineur': 0 };
  // Répétitions (décisions du porteur du 7 et du 8 novembre 2026) : tous les N jours ; chaque semaine ou toutes les N
  // semaines, jours cochés (ex. le mercredi tous les 15 jours) ; chaque mois ou tous les N mois à la même date ; un jour
  // repéré par son rang dans le mois, le trimestre, le semestre ou l'année (ex. 1er dimanche du trimestre, dernier
  // vendredi du mois, dernier week-end du mois, 1er jour ouvré du mois, dernier jour de l'année)
  var REGULARITES = { aucune: 'Une seule fois', jour: 'Tous les jours (ou tous les N jours)', semaine: 'Chaque semaine (jours cochés, ou toutes les N semaines)',
    mois: 'Chaque mois à la même date (ou tous les N mois)', rangPeriode: 'Un jour repéré dans le mois, le trimestre, le semestre ou l’année' };
  var RANGS = { 1: '1er', 2: '2e', 3: '3e', 4: '4e', 5: '5e', '-1': 'dernier', '-2': 'avant-dernier' };
  var PERIODES = { mois: 'mois', trimestre: 'trimestre', semestre: 'semestre', annee: 'année' };
  var MOIS_PERIODE = { mois: 1, trimestre: 3, semestre: 6, annee: 12 };
  // Jour repéré : jour de la semaine (0 dimanche … 6 samedi), week-end (samedi et dimanche), jour ouvré (lundi à vendredi), jour
  var GENRES_JOUR = { weekend: 'week-end', ouvre: 'jour ouvré', jour: 'jour' };
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
    var couleurs = {};
    Object.keys(COULEURS_DEFAUT).forEach(function (k) { var c = (a.couleurs || {})[k]; couleurs[k] = /^#[0-9a-fA-F]{6}$/.test(c || '') ? c.toLowerCase() : COULEURS_DEFAUT[k]; });
    var delais = {};
    Object.keys(DELAIS_PERMISSION_DEFAUT).concat(Object.keys(a.delaisPermission || {})).forEach(function (k) {
      var v = (a.delaisPermission || {})[k];
      delais[k] = v === undefined || v === null || v === '' || !isFinite(+v) ? DELAIS_PERMISSION_DEFAUT[k] : Math.max(0, Math.min(168, Math.round(+v)));
    });
    return { identite: IDENTITES[a.identite] ? a.identite : 'initiales', typesAlertesEtablissement: etab && etab.length ? etab : TYPES_ALERTE_DEFAUT.slice(), couleurs: couleurs, delaisPermission: delais,
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
  /**
   * Répétition validée : { type, intervalle (jour : 1 à 60 ; semaine : 1 à 8 ; mois : 1 à 12 ; rangPeriode : 1 à 12 périodes),
   * jours: [0..6] (semaine), rang (1 à 5, -1 dernier, -2 avant-dernier), jour (0..6 | 'weekend' | 'ouvre' | 'jour') et
   * periode (mois | trimestre | semestre | annee) pour « rangPeriode », jusquAu: 'AAAA-MM-JJ' | '' }.
   * Les répétitions « rangMois » et « weekendMois » de la version 0.10.0 sont lues comme « rangPeriode » sur le mois.
   */
  function regularite(v) {
    var r = Object.assign({}, v || {});
    if (r.type === 'rangMois') { r.type = 'rangPeriode'; r.periode = 'mois'; }
    if (r.type === 'weekendMois') { r.type = 'rangPeriode'; r.periode = 'mois'; r.jour = 'weekend'; }
    var type = REGULARITES[r.type] ? r.type : 'aucune';
    var jours = Array.isArray(r.jours) ? r.jours.map(Number).filter(function (j) { return j >= 0 && j <= 6; }) : [];
    var res = { type: type, jours: jours, jusquAu: depuisISO(r.jusquAu) ? r.jusquAu : '' };
    var max = { jour: 60, semaine: 8, mois: 12, rangPeriode: 12 }[type];
    if (max && +r.intervalle > 1) res.intervalle = Math.min(max, Math.round(+r.intervalle));
    if (type === 'rangPeriode') {
      res.rang = RANGS[String(r.rang)] ? +r.rang : 1;
      res.jour = GENRES_JOUR[r.jour] ? r.jour : (+r.jour >= 0 && +r.jour <= 6 && r.jour !== '' && r.jour !== null && r.jour !== undefined ? Math.round(+r.jour) : 1);
      res.periode = PERIODES[r.periode] ? r.periode : 'mois';
    }
    return res;
  }
  function lundiDe(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
  /** Numéro de la période (mois, trimestre…) qui contient la date, et ses bornes [debut, fin[ (ms, minuit local). */
  function periodeDe(d, periode) {
    var n = MOIS_PERIODE[periode], m0 = Math.floor(d.getMonth() / n) * n;
    return { index: d.getFullYear() * (12 / n) + m0 / n, debut: new Date(d.getFullYear(), m0, 1).getTime(), fin: new Date(d.getFullYear(), m0 + n, 1).getTime() };
  }
  /** Le jour convient-il au genre repéré (jour de la semaine, samedi d'un week-end, jour ouvré, tout jour) ? */
  function convient(d, jour) {
    if (jour === 'jour') return true;
    if (jour === 'ouvre') return d.getDay() >= 1 && d.getDay() <= 5;
    if (jour === 'weekend') return d.getDay() === 6;   // un week-end est repéré par son samedi
    return d.getDay() === jour;
  }
  /** Rang du jour dans sa période parmi les jours qui conviennent (`rang` > 0 depuis le début, < 0 depuis la fin). */
  function aLeRangDans(t, r) {
    var d = new Date(t);
    if (!convient(d, r.jour)) return false;
    var p = periodeDe(d, r.periode), k = 0;
    if (r.rang > 0) { for (var x = p.debut; x <= t; x = plusJours(x, 1)) if (convient(new Date(x), r.jour)) k++; return k === r.rang; }
    for (var y = t; y < p.fin; y = plusJours(y, 1)) if (convient(new Date(y), r.jour)) k++;
    return k === -r.rang;
  }
  /**
   * Dates (AAAA-MM-JJ) des occurrences d'une répétition à partir du jour `premier` (ms), dans [debut, fin[ (ms).
   * Semaine sans jour coché : le jour de la première occurrence. Mois : même quantième (mois trop courts sautés).
   * Intervalle compté depuis la première occurrence (jour, semaine, mois ou période qui la contient).
   */
  function datesOccurrences(premier, reg, debut, fin) {
    var r = regularite(reg), res = [], j0 = depuisISO(jourISO(premier)), limite = r.jusquAu ? plusJours(depuisISO(r.jusquAu), 1) : Infinity;
    if (r.type === 'aucune') return j0 < fin && plusJours(j0, 1) > debut ? [jourISO(j0)] : [];
    var d0 = new Date(j0), depart = Math.max(j0, depuisISO(jourISO(debut))), jours = r.jours.length ? r.jours : [d0.getDay()], pas = r.intervalle || 1;
    function retenu(t) {
      var d = new Date(t);
      switch (r.type) {
        case 'jour': return Math.round((t - j0) / 864e5) % pas === 0;
        case 'semaine': return jours.indexOf(d.getDay()) >= 0 && Math.round((lundiDe(t) - lundiDe(j0)) / (7 * 864e5)) % pas === 0;
        case 'mois': return d.getDate() === d0.getDate() && ((d.getFullYear() - d0.getFullYear()) * 12 + d.getMonth() - d0.getMonth()) % pas === 0;
        case 'rangPeriode':
          var ok = function (x) { return aLeRangDans(x, r) && (periodeDe(new Date(x), r.periode).index - periodeDe(d0, r.periode).index) % pas === 0; };
          if (r.jour === 'weekend' && d.getDay() === 0) { var sam = plusJours(t, -1); return sam >= j0 && ok(sam); }   // dimanche qui suit le samedi retenu
          return ok(t);
      }
      return false;
    }
    for (var t = depart, n = 0; t < fin && t < limite && n < 800; t = plusJours(t, 1), n++) if (retenu(t)) res.push(jourISO(t));
    return res;
  }
  // Réglages propres à une date d'un élément répété (décision du porteur du 8 novembre 2026 : patients, accompagnateurs,
  // transports, check-list… peuvent changer à chaque date ; une date peut être décalée ou annulée)
  var CHAMPS_OCCURRENCE = ['debut', 'fin', 'lieu', 'salle', 'titre', 'patients', 'professionnels', 'accompagnateurs', 'consigneAccompagnateurs', 'participation', 'transports', 'validations', 'checklist', 'annulee', 'motifAnnulation'];
  /**
   * Élément tel qu'il est à une date : réglages de toutes les dates, remplacés par ceux propres à cette date
   * (`surcharges[occurrence]`). `surchargee` : liste des champs propres à la date (vide : aucun).
   */
  function rdvOccurrence(r, occurrence) {
    var sc = r && r.surcharges && r.surcharges[occurrence];
    if (!sc) return r;
    var m = Object.assign({}, r), propres = [];
    CHAMPS_OCCURRENCE.forEach(function (k) { if (sc[k] !== undefined && k !== 'debut' && k !== 'fin' && k !== 'annulee' && k !== 'motifAnnulation') { m[k] = sc[k]; propres.push(k); } });
    if (sc.debut !== undefined) propres.push('debut');
    m.surchargee = propres; m.annulee = !!sc.annulee; m.motifAnnulation = sc.motifAnnulation || '';
    return m;
  }
  /**
   * Occurrences d'un élément qui chevauchent [debut, fin[ : { occurrence, debut, fin, annulee } (même heure, même durée,
   * sauf date décalée). `occurrence` reste la date prévue par la répétition, même si la date est décalée : elle repère les
   * inscriptions, réservations, validations et check-lists de cette date.
   */
  function occurrences(r, debut, fin) {
    var duree = (r.fin || r.debut) - r.debut, b = new Date(r.debut), exc = r.exceptions || [], sc = r.surcharges || {};
    function aLHeure(j) { var d = new Date(depuisISO(j)); d.setHours(b.getHours(), b.getMinutes(), 0, 0); return d.getTime(); }   // heure locale gardée
    var reg = regularite(r.regularite);
    if (reg.type === 'aucune') return r.debut < fin && (r.fin || r.debut) >= debut ? [{ occurrence: jourISO(r.debut), debut: r.debut, fin: r.fin || null, annulee: false }] : [];
    // Marge de 7 jours : une date décalée peut entrer dans la période, ou en sortir
    return datesOccurrences(r.debut, reg, plusJours(debut, -Math.ceil(duree / 864e5) - 8), plusJours(fin, 8)).filter(function (j) { return exc.indexOf(j) < 0; })
      .map(function (j) {
        var d0 = aLHeure(j), o = { occurrence: j, debut: d0, fin: r.fin ? d0 + duree : null, annulee: false }, s0 = sc[j];
        if (s0) {
          if (typeof s0.debut === 'number') { o.debut = s0.debut; o.fin = typeof s0.fin === 'number' ? s0.fin : (r.fin ? s0.debut + duree : null); }
          o.annulee = !!s0.annulee;
        }
        return o;
      })
      .filter(function (o) { return o.debut < fin && (o.fin || o.debut) >= debut; });
  }

  var NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function liste(js) { return js.length > 1 ? js.slice(0, -1).join(', ') + ' et ' + js[js.length - 1] : js[0]; }
  /**
   * Répétition en clair : « chaque mardi et vendredi », « le mercredi, tous les 15 jours », « le 1er dimanche du
   * trimestre », « le dernier week-end du mois », « tous les 3 jours »…
   */
  function libelleRepetition(v) {
    var r = regularite(v), t, n = r.intervalle || 1;
    if (r.type === 'aucune') return 'une seule fois';
    if (r.type === 'jour') t = n > 1 ? 'tous les ' + n + ' jours' : 'chaque jour';
    else if (r.type === 'semaine') {
      var js = [1, 2, 3, 4, 5, 6, 0].filter(function (j) { return r.jours.indexOf(j) >= 0; }).map(function (j) { return NOMS_JOURS[j]; });
      if (n === 1) t = js.length ? 'chaque ' + liste(js) : 'chaque semaine';
      else t = (js.length ? 'le ' + liste(js) + ', ' : '') + (n === 2 ? 'tous les 15 jours' : 'toutes les ' + n + ' semaines');
    }
    else if (r.type === 'mois') t = n > 1 ? 'tous les ' + n + ' mois, même date' : 'chaque mois, même date';
    else {
      var quoi = typeof r.jour === 'number' ? NOMS_JOURS[r.jour] : GENRES_JOUR[r.jour];
      t = 'le ' + RANGS[String(r.rang)] + ' ' + quoi + ' ' + (r.periode === 'annee' ? 'de l’année' : 'du ' + PERIODES[r.periode]) + (n > 1 ? ', un ' + PERIODES[r.periode] + ' sur ' + n : '');
    }
    return t + (r.jusquAu ? ' jusqu’au ' + r.jusquAu.split('-').reverse().join('/') : '');
  }

  // ------------------------------------------------------------ Accompagnateurs (décision du 7 novembre 2026)
  /**
   * Accompagnateurs d'une occurrence : nombre nécessaire (sans les nommer), professionnels déjà prévus, agents inscrits
   * eux-mêmes. { requis, prevus, inscrits: [{ agent, nom, le }], total, manque }.
   */
  function accompagnateurs(r, occurrence) {
    // Depuis la 0.21.0 : rubrique « Quel(s) professionnel(s) ? » (agenda-participants.js) ; mêmes champs qu'avant
    // (requis, prevus, inscrits, total, manque, consigne), plus la liste d'attente, les propositions, les demandes et les refus
    return P.professionnels(rdvOccurrence(r, occurrence), occurrence);
  }
  /** Patients d'une date : inscrits, liste d'attente, minimum manquant (0.21.0). */
  function placesPatients(r, occurrence) { return P.patients(rdvOccurrence(r, occurrence)); }
  /**
   * Réglages de l'Agenda par service (0.21.0, principe du porteur : réglables par le cadre dans l'administration) :
   * `config.agendaReglages` = { '*': réglages de l'établissement, <service>: ce que le service remplace }. L'administrateur
   * écrit partout, le cadre seulement pour ses services (`controlerCadreReglages`).
   */
  function reglagesService(config, service) {
    var v = (config && config.agendaReglages) || {};
    return Object.assign({}, v['*'] || {}, service && service !== '*' && v[service] ? v[service] : {});
  }
  function controlerCadreReglages(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }
  /**
   * Tâches suggérées selon la prise en charge des patients (0.21.0, décision du porteur du 11 novembre 2026) : règles
   * « type de professionnel ou de structure → tâche, délai d'anticipation (jours), événements concernés (sortie,
   * permission), obligatoire ou non », réglées par service. Une tâche suggérée est proposée, jamais ajoutée d'office ;
   * une tâche obligatoire l'est, et seul le cadre la retire. `tachesObligatoiresBloquent` (faux par défaut) : la
   * dernière étape d'une permission attend que les tâches obligatoires soient faites.
   */
  var SUGGESTIONS_DEFAUT = [
    { type: 'idel', tache: 'Appeler l’infirmier libéral', delai: 2, pour: ['sortie', 'permission'] },
    { type: 'foyer', tache: 'Prévenir le foyer ou le lieu de vie', delai: 2, pour: ['sortie', 'permission'] },
    { type: 'hdj', tache: 'Prévenir l’hôpital de jour', delai: 1, pour: ['sortie'] },
    { type: 'cmp', tache: 'Prendre rendez-vous au centre médico-psychologique', delai: 2, pour: ['sortie'] }];
  var EVENEMENTS_SUGGESTION = { sortie: 'Sortie du patient', permission: 'Permission de sortie' };
  function suggestions(config, service) {
    var v = reglagesService(config, service).suggestions;
    if (!Array.isArray(v)) return SUGGESTIONS_DEFAUT.map(function (x) { return Object.assign({}, x); });
    return v.filter(function (x) { return x && typeof x.type === 'string' && String(x.tache || '').trim(); }).slice(0, 60).map(function (x) {
      return { type: x.type, tache: String(x.tache).trim().slice(0, 100), delai: delaiValide(x.delai), obligatoire: !!x.obligatoire,
        pour: (Array.isArray(x.pour) ? x.pour : []).filter(function (k) { return EVENEMENTS_SUGGESTION[k]; }) };
    });
  }
  /**
   * Tâches suggérées pour un événement : `base` (sortie, permission…), `entrees` : intervenants des patients de
   * l'événement [{ type, nom, contact, patient (désignation affichée) }]. [{ libelle, delai, obligatoire }], sans doublon.
   */
  function tachesSuggerees(config, service, base, entrees) {
    var res = [], vus = {};
    suggestions(config, service).forEach(function (rg) {
      if (rg.pour.indexOf(base) < 0) return;
      (entrees || []).filter(function (e) { return e && e.type === rg.type; }).forEach(function (e) {
        var lib = (rg.tache + ' : ' + e.nom + (e.contact ? ' (' + e.contact + ')' : '') + (e.patient ? ' — ' + e.patient : '')).slice(0, 120);
        if (!vus[lib]) { vus[lib] = 1; res.push({ libelle: lib, delai: rg.delai, obligatoire: rg.obligatoire }); }
      });
    });
    return res;
  }
  /** Rôles qui confirment les demandes d'inscription, en plus de l'auteur et des organisateurs (cadre par défaut). */
  /** Partage proposé à la création d'un événement de plusieurs services : 'invites' (par défaut) ou 'co'. */
  function partageDefaut(config, service) { return reglagesService(config, service).partageDefaut === 'co' ? 'co' : 'invites'; }
  var PARTAGES = { invites: 'Services invités : ils inscrivent leurs patients et leurs agents, sans modifier l’événement', co: 'Services co-organisateurs : chacun peut modifier l’événement' };
  function rolesConfirmation(config, service) { var v = reglagesService(config, service).rolesConfirmation; return Array.isArray(v) && v.length ? v.filter(function (x) { return typeof x === 'string'; }) : P.ROLES_CONFIRMATION_DEFAUT.slice(); }
  /**
   * Ce qui attend une réponse de l'agent (0.21.0) : propositions d'un collègue et invitations sans réponse, pour les dates
   * des `jours` prochains jours. [{ rdv, occurrence, debut, situation }].
   */
  function aRepondre(st, fiches, compte, services, maintenant, jours) {
    return elements(st, fiches, services, maintenant, plusJours(maintenant, jours || 30)).filter(function (x) { return !x.externe && !x.annulee; })
      .map(function (x) { return { rdv: x.rdv, occurrence: x.occurrence, debut: x.debut, situation: P.situation(rdvOccurrence(x.rdv, x.occurrence), x.occurrence, compte) }; })
      .filter(function (x) { return x.situation.etat === 'propose' || x.situation.etat === 'invite'; });
  }
  /** Demandes d'inscription que l'agent peut confirmer ou refuser (auteur, organisateur, cadre, rôle réglé). */
  function aConfirmer(st, fiches, config, compte, services, maintenant, jours) {
    var res = [];
    elements(st, fiches, services, maintenant, plusJours(maintenant, jours || 30)).forEach(function (x) {
      if (x.externe || x.annulee || !x.accompagnateurs.demandes.length || !P.peutConfirmer(rdvOccurrence(x.rdv, x.occurrence), compte, rolesConfirmation(config, x.rdv.service))) return;
      x.accompagnateurs.demandes.forEach(function (d) { if (d.agent !== compte.id) res.push({ rdv: x.rdv, occurrence: x.occurrence, debut: x.debut, demande: d }); });
    });
    return res;
  }
  /** Événements des `jours` prochains jours où il manque des patients (minimum de places non atteint). */
  function patientsManquants(st, fiches, services, maintenant, jours) {
    return elements(st, fiches, services, maintenant, plusJours(maintenant, jours || 7)).filter(function (x) { return !x.externe && !x.annulee && placesPatients(x.rdv, x.occurrence).manque > 0; });
  }

  // ------------------------------------------------------------ Permissions de sortie (décision du 7 novembre 2026)
  /** Mode d'hospitalisation d'une fiche en vigueur à une date (ms) : le dernier fixé avant elle, sinon le premier connu. */
  function modeAu(fiche, date) {
    var ms = (fiche && fiche.modes) || [], m = ms.length ? ms[0].mode : '';
    ms.forEach(function (x) { if (x.date <= date) m = x.mode; });
    return m;
  }
  /** Délai de validation (heures avant le début) d'un mode : réglage, sinon 24 h pour un mode sans consentement, 0 sinon. */
  function delaiPermission(config, mode) {
    var d = optionsAgenda(config).delaisPermission;
    if (d[mode] !== undefined) return d[mode];
    var def = ((config && config.modesHospitalisation) || []).filter(function (x) { return x.code === mode; })[0];
    return def && def.contrainte ? 24 : 0;
  }
  /**
   * Processus de validation d'une permission (0.21.0) pour les modes d'hospitalisation de ses patients, selon les
   * réglages du service. Tant que le processus fourni n'est pas remplacé, le délai réglé par mode (`delaisPermission`,
   * réglage d'avant la 0.21.0) reste celui de son étape à délai : envoi à l'ARS, signature du médecin, bon signé.
   */
  var ETAPE_A_DELAI = { sdre: 'envoye', contrainte: 'medecin', libre: 'signe' };
  function processusPermission(config, service, modes) {
    var pr = Pm.processusPour(config, reglagesService(config, service), modes);
    if (!pr.regle) pr.etapes.forEach(function (e) { if (e.code === ETAPE_A_DELAI[pr.famille]) e.delai = delaiPermission(config, pr.mode); });
    return pr;
  }
  /** Tâches des étapes : 'suggerees' (par défaut : proposées sur la permission) ou 'office' (ajoutées à la check-list à la création). */
  function tachesPermission(config, service) { return reglagesService(config, service).tachesPermission === 'office' ? 'office' : 'suggerees'; }
  /**
   * Validations d'un élément : celles ajoutées (`validations`), ou, pour une permission de sortie enregistrée sans elles,
   * la validation de la permission. [{ id, type: permission | medicale | autre, libelle, delai (heures, hors permission) }].
   */
  function validationsDe(r) {
    if (Array.isArray(r.validations)) return r.validations.filter(function (v) { return v && v.id && TYPES_VALIDATION[v.type]; });
    return r.nature === 'permission' ? [{ id: 'permission', type: 'permission', libelle: '' }] : [];
  }
  /**
   * État des validations d'une occurrence : échéance (début moins le délai : selon le mode d'hospitalisation des patients
   * pour une permission, délai choisi sinon, 24 h par défaut), validée ou refusée (qui, signataire), niveau d'alerte.
   */
  function etatValidations(r, occurrence, debut, fiches, config, maintenant) {
    return validationsDe(r).map(function (v) {
      var delai, modes = [];
      if (v.type === 'permission') {
        delai = 0;
        (r.patients || []).forEach(function (pid) { var m = modeAu((fiches || {})[pid], debut); if (m) modes.push(m); delai = Math.max(delai, delaiPermission(config, m)); });
      } else delai = v.delai === undefined || v.delai === null || v.delai === '' ? 24 : Math.max(0, Math.min(336, Math.round(+v.delai) || 0));
      var f = (r.validees || {})[occurrence + '|' + v.id];
      if (!f && v.id === 'permission' && !Array.isArray(r.validations) && r.statut === 'validee') f = { statut: 'validee', nom: (r.validation && r.validation.par) || '', le: r.validation && r.validation.le };   // 0.10.0
      var ech = debut - delai * 36e5;
      var res = { id: v.id, type: v.type, libelle: v.libelle || TYPES_VALIDATION[v.type], delai: delai, modes: modes, echeance: ech, fait: f || null,
        niveau: f ? f.statut : (maintenant === undefined ? 'attente' : (maintenant > ech ? 'retard' : (ech - maintenant < 864e5 ? 'proche' : 'attente'))) };
      // Permission : étapes du processus du mode (0.21.0) ; l'échéance est celle de la prochaine étape à délai
      if (v.type === 'permission') {
        var ep = Pm.etat(processusPermission(config, r.service, modes), (r.suivis || {})[occurrence + '|' + v.id], f || null, debut, maintenant);
        res.permission = ep;
        if (!f) { res.niveau = ep.niveau; if (ep.prochaineEcheance) { res.echeance = ep.prochaineEcheance.quand; res.delai = ep.prochaineEcheance.etape.delai; } }
      }
      return res;
    });
  }
  /** Statut d'une permission de sortie pour une occurrence : 'validee', 'refusee' ou 'demande'. */
  function statutPermission(r, occurrence) {
    var vs = etatValidations(r, occurrence, 0, {}, {}).filter(function (v) { return v.type === 'permission'; });
    if (!vs.length) return r.statut === 'validee' ? 'validee' : 'demande';
    if (vs.some(function (v) { return v.fait && v.fait.statut === 'refusee'; })) return 'refusee';
    return vs.every(function (v) { return v.fait && v.fait.statut === 'validee'; }) ? 'validee' : 'demande';
  }
  /**
   * Validations à obtenir dans les services : occurrences qui commencent dans les 15 jours (ou depuis moins de 24 h), non
   * validées ni refusées. [{ rdv, occurrence, debut, validation, echeance, niveau, modes, delai }], par échéance.
   */
  function aFaireValider(st, fiches, config, services, maintenant) {
    var res = [];
    elements(st, fiches, services, maintenant - 864e5, plusJours(maintenant, 15)).forEach(function (x) {
      if (x.externe) return;
      etatValidations(x.rdv, x.occurrence, x.debut, fiches, config, maintenant).forEach(function (v) {
        if (v.fait) return;
        res.push({ rdv: x.rdv, occurrence: x.occurrence, debut: x.debut, validation: v, echeance: v.echeance, niveau: v.niveau, modes: v.modes, delai: v.delai });
      });
    });
    return res.sort(function (a, b) { return a.echeance - b.echeance; });
  }
  /** Permissions de sortie à faire valider (validations de type « permission »). */
  function permissionsAValider(st, fiches, config, services, maintenant) {
    return aFaireValider(st, fiches, config, services, maintenant).filter(function (x) { return x.validation.type === 'permission'; });
  }
  /** Transports d'une occurrence : [{ id, type, nombre, precision, reserve: { par, le } | null }]. */
  function etatTransports(r, occurrence) {
    return (Array.isArray(r.transports) ? r.transports : []).filter(function (t) { return t && t.id; }).map(function (t) {
      return { id: t.id, type: TRANSPORTS[t.type] ? t.type : 'autre', nombre: Math.max(1, Math.round(+t.nombre || 1)), precision: t.precision || '', vehicule: t.vehicule || null, reserve: (r.reservations || {})[occurrence + '|' + t.id] || null };
    });
  }
  // ------------------------------------------------------------ Catégories d'événements et préréglages (8 novembre 2026)
  /**
   * Préréglages proposés pour chaque type fourni, appliqués à la création d'un élément (décision du porteur : catégories
   * ajoutées par l'administrateur, préréglages modifiables, pour l'établissement et par service) :
   * duree (minutes), heure ('HH:MM' de début proposée), lieu, titre, patients (section affichée), accompagnateurs (nombre),
   * transports [{ type, nombre, precision }], validations [{ type, libelle, delai }], checklist (code d'un modèle),
   * attente (transparence sans patient prévu), dureeMax (heures, alerte au-delà), psychiatrie (services de psychiatrie seulement).
   */
  var PREREGLAGES_DEFAUT = {
    accompagnement: { duree: 120, patients: true, accompagnateurs: 1 },
    entretien: { duree: 45, patients: true },
    examen: { duree: 90, patients: true, accompagnateurs: 1, transports: [{ type: 'vsl', nombre: 1 }] },
    activite: { duree: 60, patients: true },
    reunion: { duree: 60, patients: false },
    audience: { duree: 150, patients: true, accompagnateurs: 1, transports: [{ type: 'vsl', nombre: 1 }], attente: true, psychiatrie: true },
    permission: { duree: 480, patients: true, validations: [{ type: 'permission', libelle: '' }], dureeMax: 48 },
    sortie: { duree: 30, patients: true, checklist: 'sortie' },
    autre: { duree: 60, patients: false }
  };
  function nettoyerPrereglages(v) {
    // Une valeur vide ou nulle est gardée : au niveau d'un service, elle retire le préréglage de l'établissement
    var x = v || {}, r = {};
    function nb(k, max) { if (x[k] !== undefined && x[k] !== null && x[k] !== '' && isFinite(+x[k]) && +x[k] >= 0) r[k] = Math.min(max, Math.round(+x[k])); }
    nb('duree', 14 * 1440); nb('accompagnateurs', 20); nb('dureeMax', 24 * 30);
    if (typeof x.heure === 'string' && (x.heure === '' || /^\d{2}:\d{2}$/.test(x.heure))) r.heure = x.heure;
    ['lieu', 'titre', 'checklist'].forEach(function (k) { if (typeof x[k] === 'string') r[k] = x[k].trim().slice(0, 120); });
    ['patients', 'attente', 'psychiatrie', 'inscriptionFixe'].forEach(function (k) { if (typeof x[k] === 'boolean') r[k] = x[k]; });
    // Places et façon de s'inscrire proposées (0.21.0) ; `inscriptionFixe` : la façon de s'inscrire ne se change pas sur l'événement
    if (x.participation && typeof x.participation === 'object') { var g = P.reglage({ participation: x.participation }); r.participation = { mode: g.mode, nombre: g.nombre, max: g.max, libre: g.libre, aConfirmer: g.aConfirmer }; }
    else if (x.participation === null) r.participation = null;
    if (Array.isArray(x.transports)) r.transports = x.transports.filter(function (t) { return t && TRANSPORTS[t.type]; }).map(function (t) { return { type: t.type, nombre: Math.max(1, Math.min(9, Math.round(+t.nombre || 1))), precision: String(t.precision || '').slice(0, 100) }; });
    if (Array.isArray(x.validations)) r.validations = x.validations.filter(function (t) { return t && TYPES_VALIDATION[t.type]; }).map(function (t) { var o = { type: t.type, libelle: String(t.libelle || '').slice(0, 80) }; if (t.type !== 'permission') o.delai = Math.max(0, Math.min(336, Math.round(+t.delai || 24))); return o; });
    return r;
  }
  /**
   * Catégories d'événements d'un service, dans l'ordre : types fournis puis catégories ajoutées, avec les réglages de
   * l'établissement (`config.agenda.categories['*']`) puis ceux du service (`categories[service]`) :
   * { code, libelle, base (type fourni dont elle reprend le comportement), couleur, prereglages, fournie, actif }.
   */
  function categories(config, service) {
    var a = (config && config.agenda) || {}, conf = a.categories || {}, couleursAnciennes = a.couleurs || {};
    var attenteAncienne = Array.isArray(a.attenteSansPatient) ? a.attenteSansPatient : null;
    var liste = Object.keys(NATURES).map(function (k) {
      var pr = JSON.parse(JSON.stringify(PREREGLAGES_DEFAUT[k] || {}));
      if (attenteAncienne) pr.attente = attenteAncienne.indexOf(k) >= 0;   // réglage de la 0.11.2
      return { code: k, libelle: NATURES[k], base: k, couleur: /^#[0-9a-fA-F]{6}$/.test(couleursAnciennes[k] || '') ? couleursAnciennes[k].toLowerCase() : COULEURS_DEFAUT[k], prereglages: pr, fournie: true, actif: true };
    });
    function appliquer(niveau) {
      var c = conf[niveau] || {};
      Object.keys(c).forEach(function (code) {
        var d = c[code] || {}, ex = liste.filter(function (x) { return x.code === code; })[0];
        if (!ex) {
          if (!/^[a-z][a-z0-9-]{1,30}$/.test(code) || !String(d.libelle || '').trim()) return;
          var base = NATURES[d.base] ? d.base : 'autre';
          ex = { code: code, libelle: '', base: base, couleur: COULEURS_DEFAUT[base], prereglages: JSON.parse(JSON.stringify(PREREGLAGES_DEFAUT[base] || {})), fournie: false, actif: true };
          liste.push(ex);
        }
        if (String(d.libelle || '').trim()) ex.libelle = String(d.libelle).trim().slice(0, 60);
        if (/^#[0-9a-fA-F]{6}$/.test(d.couleur || '')) ex.couleur = d.couleur.toLowerCase();
        if (typeof d.actif === 'boolean') ex.actif = d.actif;
        if (d.prereglages) ex.prereglages = Object.assign(ex.prereglages, nettoyerPrereglages(d.prereglages));
      });
    }
    appliquer('*');
    if (service) appliquer(service);
    return liste;
  }
  /** Catégorie d'un code (inconnue : comportement « autre événement », libellé le code). */
  function categorie(config, code, service) {
    return categories(config, service).filter(function (c) { return c.code === code; })[0] || { code: code, libelle: NATURES[code] || code || 'Élément', base: NATURES[code] ? code : 'autre', couleur: COULEURS_DEFAUT[code] || COULEURS_DEFAUT.autre, prereglages: {}, fournie: false, actif: false };
  }
  function baseDe(config, code, service) { return categorie(config, code, service).base; }

  /**
   * Élément « en attente » : aucun patient prévu, pour un type où l'établissement l'a activé (`config.agenda.attenteSansPatient`,
   * audience JLD par défaut ; décisions du porteur du 8 novembre 2026) : affiché en transparence, sans rappel de transport
   * ni d'accompagnateur.
   */
  var ATTENTE_DEFAUT = ['audience'];
  function typesEnAttente(config, service) { return categories(config, service).filter(function (c) { return c.prereglages.attente; }).map(function (c) { return c.code; }); }
  function enAttente(r, config) { return typesEnAttente(config, r.service).indexOf(r.nature) >= 0 && !(r.patients || []).length; }
  /** Transports à réserver pour les occurrences des `jours` prochains jours (15 par défaut) ; « proche » à moins de 24 h. */
  function transportsAReserver(st, fiches, services, maintenant, jours, config) {
    var res = [];
    elements(st, fiches, services, maintenant - 36e5, plusJours(maintenant, jours || 15)).forEach(function (x) {
      if (x.externe || enAttente(x.rdv, config)) return;
      etatTransports(x.rdv, x.occurrence).forEach(function (t) { if (!t.reserve) res.push({ rdv: x.rdv, occurrence: x.occurrence, debut: x.debut, transport: t, niveau: x.debut - maintenant < 864e5 ? 'proche' : 'attente' }); });
    });
    return res.sort(function (a, b) { return a.debut - b.debut; });
  }
  /** Occurrences des `jours` prochains jours (7 par défaut) où il manque des accompagnateurs. */
  function accompagnateursManquants(st, fiches, services, maintenant, jours, config) {
    return elements(st, fiches, services, maintenant, plusJours(maintenant, jours || 7)).filter(function (x) { return !x.externe && !enAttente(x.rdv, config) && x.accompagnateurs.manque > 0; });
  }
  /**
   * Informations reçues par un agent (inscrit ou désinscrit comme accompagnateur par un collègue) qu'il n'a pas encore
   * marquées vues (`vues` : identifiants), pour des occurrences d'aujourd'hui ou à venir.
   */
  function avisPour(st, agent, vues, maintenant) {
    var auj = jourISO(maintenant || Date.now()), v = vues || [];
    return (st.avis || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0 && String(a.occurrence) >= auj && st.rdv[a.rdv] && !st.rdv[a.rdv].supprime; })
      .sort(function (a, b) { return String(a.occurrence).localeCompare(String(b.occurrence)); });
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
      return { id: it.id, libelle: it.libelle, delai: delai, echeance: ech, obligatoire: !!it.obligatoire, fait: c || null, alerte: !c && ech !== null && maintenant !== undefined && maintenant >= ech };
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

  /**
   * Alertes de l'équipe des services (décision du porteur : saisies par l'équipe, visibles jusqu'à « vu ») :
   * non supprimées, non vues (ou vues depuis moins de `joursVues` jours si demandé), triées par date limite.
   * `depassee` : date limite passée. Libellé : celui du type (liste du service ou de l'établissement), ou le libellé libre.
   */
  function alertesEquipe(st, config, services, maintenant, joursVues) {
    var aujourdhui = jourISO(maintenant);
    return Object.keys(st.alertes || {}).map(function (k) { return st.alertes[k]; }).filter(function (a) {
      if (a.supprime || services.indexOf(a.service) < 0) return false;
      if (!a.vue) return true;
      return joursVues > 0 && Date.parse(a.vue.le) >= maintenant - joursVues * 864e5;
    }).map(function (a) {
      var t = optionsAgenda(config, a.service).typesAlertes.concat(optionsAgenda(config).typesAlertesEtablissement).filter(function (x) { return x.code === a.type; })[0];
      return Object.assign({}, a, { titre: a.type === 'autre' || !t ? (a.libelle || 'Alerte') : t.libelle, depassee: !a.vue && !!a.avant && a.avant < aujourdhui });
    }).sort(function (a, b) { return !!a.vue - !!b.vue || String(a.avant || '9999').localeCompare(String(b.avant || '9999')) || String(a.heure || '').localeCompare(String(b.heure || '')) || String(a.cree).localeCompare(String(b.cree)); });
  }
  /** Une alerte concerne-t-elle l'agent (`compte` : id, roles) ? Personne visée, rôle visé, ou toute l'équipe (pour vide). */
  function alertePour(a, compte) {
    var p = a.pour || {};
    if (p.agent) return p.agent === compte.id;
    if (p.role) return (compte.roles || []).indexOf(p.role) >= 0;
    if (p.groupe) return (compte.groupes || []).indexOf(p.groupe) >= 0;   // groupe d'agents (compte.groupes : codes, groupes.js)
    return true;
  }
  /** Réunions des services dans les `jours` à venir (7 par défaut), à partir de maintenant. */
  function reunionsAVenir(st, fiches, services, maintenant, jours) {
    return elements(st, fiches, services, maintenant, plusJours(maintenant, jours || 7)).filter(function (x) { return x.rdv.nature === 'reunion' && !x.externe && x.debut >= maintenant - 36e5; });
  }

  /**
   * « Mon agenda » (décision du porteur : vue dans Tessera seulement, tous services confondus) : éléments où l'agent
   * est prévu, tâches qui lui reviennent (affectées à lui, ou sans affectation et pour son rôle ou toute l'équipe),
   * ses absences, alertes qui le visent (personne ou rôle). `services` : tous les services de l'agent.
   */
  function monAgenda(st, fiches, config, compte, services, debut, fin, maintenant) {
    var els = elements(st, fiches, services, debut, fin).filter(function (x) { return !x.externe && ((x.rdv.professionnels || []).some(function (p) { return p.id === compte.id; }) || x.accompagnateurs.inscrits.some(function (i) { return i.agent === compte.id; })); });
    var taches = tachesDues(st, services, debut, fin).filter(function (x) { return x.affecte ? x.affecte.agent === compte.id : tachePour(x.tache, compte); });
    var abs = absences(st, debut, fin).filter(function (a) { return a.agent === compte.id; });
    var al = alertesEquipe(st, config, services, maintenant || debut).filter(function (a) { return a.pour && (a.pour.agent || a.pour.role || a.pour.groupe) && alertePour(a, compte); });
    return { elements: els, taches: taches, absences: abs, alertes: al };
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
    var p = t.pour || {}, roles = p.roles || [], agents = p.agents || [], groupes = p.groupes || [];
    if (!roles.length && !agents.length && !groupes.length) return true;
    return !!compte && (agents.indexOf(compte.id) >= 0 || (compte.roles || []).some(function (r) { return roles.indexOf(r) >= 0; }) || (compte.groupes || []).some(function (g) { return groupes.indexOf(g) >= 0; }));
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
  function prevusAbsents(st, r, o, absPeriode) {
    // Sans professionnel désigné, rien à chercher ; `absPeriode` : absences de la période affichée, lues une fois (0.21.1)
    if (!(r.professionnels || []).some(function (p) { return p.id; })) return [];
    var f = o.fin || o.debut + 1;
    var abs = absPeriode ? absPeriode.filter(function (a) { return a.debut < f && (a.fin || a.debut) >= o.debut; }) : absences(st, o.debut, f);
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
  /**
   * Salles occupées par les événements (0.25.0), lues par Salles et bureaux : chaque date d'un événement qui a une salle
   * (réglage de la date compris). [{ ref: 'agenda|<id>|<date>', salle, debut, fin, titre, genre, service, par }].
   */
  function occupationsSalles(st, debut, fin) {
    var res = [];
    Object.keys(st.rdv).forEach(function (k) {
      var base = st.rdv[k];
      if (base.supprime) return;
      occurrences(base, debut, fin).forEach(function (o) {
        if (o.annulee) return;
        var r = rdvOccurrence(base, o.occurrence);
        if (!r.salle) return;
        res.push({ ref: 'agenda|' + base.id + '|' + o.occurrence, salle: r.salle, debut: o.debut, fin: o.fin || o.debut + 36e5, titre: r.titre || (NATURES[r.nature] || 'Événement'), genre: 'agenda', service: r.service, par: base.par, nature: r.nature });
      });
    });
    return res;
  }
  /**
   * Prochains événements de chaque patient (tableau de transmissions, 0.30.0) : { patientId: [{ debut, fin, titre, nature,
   * service }] } pour les occurrences non annulées qui commencent dans [debut, fin[, triées par date.
   */
  function evenementsPatients(st, debut, fin) {
    var res = {};
    Object.keys((st && st.rdv) || {}).forEach(function (k) {
      var base = st.rdv[k];
      if (base.supprime) return;
      occurrences(base, debut, fin).forEach(function (o) {
        if (o.annulee || o.debut < debut) return;
        var r = rdvOccurrence(base, o.occurrence);
        (r.patients || []).forEach(function (pid) { (res[pid] = res[pid] || []).push({ debut: o.debut, fin: o.fin, titre: r.titre || NATURES[r.nature] || 'Événement', nature: r.nature, service: r.service }); });
      });
    });
    Object.keys(res).forEach(function (pid) { res[pid].sort(function (a, b) { return a.debut - b.debut; }); });
    return res;
  }
  function elements(st, fiches, services, debut, fin, avecAnnulees) {
    var res = [], absPeriode = null;
    function absDe() { return absPeriode || (absPeriode = absences(st, debut - 15 * 864e5, fin + 15 * 864e5)); }   // marge : éléments de 14 jours au plus
    Object.keys(st.rdv).forEach(function (k) {
      var base = st.rdv[k];
      if (base.supprime) return;
      var externe = services.indexOf(base.service) < 0, partage = null;
      // Événement de plusieurs services (0.21.0) : un service co-organisateur ou invité le voit comme l'un des siens
      if (externe && (base.services || []).some(function (c) { return services.indexOf(c) >= 0; })) { partage = base.partage === 'co' ? 'co' : 'invites'; externe = false; }
      if (externe && base.nature === 'reunion') return;
      occurrences(base, debut, fin).forEach(function (o) {
        // Dates annulées : seulement pour l'affichage de l'agenda (jamais dans les alertes ni Mon agenda)
        if (o.annulee && !avecAnnulees) return;
        var r = rdvOccurrence(base, o.occurrence), concernes = r.patients || [];
        if (externe) {
          concernes = concernes.filter(function (pid) { return services.indexOf(serviceDuPatient(fiches[pid])) >= 0; });
          if (!concernes.length) return;
        }
        // Service invité : il ne voit nommément que ses patients (les autres sont comptés)
        if (partage === 'invites') concernes = concernes.filter(function (pid) { return services.indexOf(serviceDuPatient(fiches[pid])) >= 0; });
        res.push({ rdv: r, externe: externe, partage: partage, patients: concernes, occurrence: o.occurrence, debut: o.debut, fin: o.fin, annulee: o.annulee, checklist: etatChecklist(r, o.occurrence), absents: prevusAbsents(st, r, o, (o.debut >= debut - 15 * 864e5 && (o.fin || o.debut) <= fin + 15 * 864e5) ? absDe() : null),
          accompagnateurs: accompagnateurs(r, o.occurrence) });
      });
    });
    return res.sort(function (a, b) { return a.debut - b.debut || String(a.rdv.titre).localeCompare(String(b.rdv.titre)); });
  }

  // Accès cochables dans « Rôles et accès » (rangés dans config.roles[CODE].accesModules.agenda)
  var ACCES = [
    { code: 'agenda.consulter', libelle: 'Consulter l’agenda du service', types: [] },
    { code: 'agenda.planifier', libelle: 'Planifier : accompagnements, entretiens, examens, activités, réunions, audiences, permissions, sorties ; réserver les transports', types: ['PATIENT_INSCRIT', 'RDV', 'OCCURRENCE', 'TRANSPORT'] },
    { code: 'agenda.valider', libelle: 'Enregistrer les validations : permission signée, validation médicale ou autre', types: ['VALIDATION'] },
    { code: 'agenda.inscrire', libelle: 'Inscrire ou désinscrire un collègue comme accompagnateur (chacun s’inscrit lui-même sans cet accès)', types: ['INSCRIPTION'] },
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
    IDE: ['RDV', 'OCCURRENCE', 'PATIENT_INSCRIT', 'TRANSPORT', 'VALIDATION', 'INSCRIPTION', 'TACHE_AJUSTEMENT', 'TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK', 'ALERTE', 'ALERTE_VUE'],
    AS: ['INSCRIPTION', 'TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK', 'ALERTE', 'ALERTE_VUE'],
    SECRETAIRE: ['RDV', 'OCCURRENCE', 'PATIENT_INSCRIT', 'TRANSPORT', 'VALIDATION', 'INSCRIPTION', 'TACHE_EQUIPE', 'TACHE_FAITE', 'CHECK'],
    // Médecin (0.28.1) : reçoit les alertes (et en envoie), s'inscrit aux événements, valide les permissions
    MEDECIN: ['INSCRIPTION', 'VALIDATION', 'ALERTE', 'ALERTE_VUE'],
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
        ['nature', 'titre', 'debut', 'fin', 'lieu', 'salle', 'service', 'patients', 'professionnels', 'motif', 'supprime', 'regularite', 'exceptions', 'checklist',
          'entretien', 'accompagnateurs', 'consigneAccompagnateurs', 'participation', 'services', 'partage', 'statut', 'validation', 'examen', 'transports', 'validations'].forEach(function (k) { if (d[k] !== undefined) r[k] = d[k]; });
        r.evts.push(e.id);
        st.rdv[d.id] = r;
        break;
      case 'OCCURRENCE':
        // Réglages propres à une date d'un élément répété : remplacés (null : retour aux réglages de toutes les dates),
        // annulation de la date (rétablie par annulee: false) ; `reset` : la date reprend tous les réglages communs
        var ro = st.rdv[d.rdv];
        if (!ro || !d.occurrence) break;
        ro.surcharges = ro.surcharges || {};
        if (d.reset) { delete ro.surcharges[d.occurrence]; break; }
        var so = Object.assign({}, ro.surcharges[d.occurrence] || {});
        CHAMPS_OCCURRENCE.forEach(function (c) { if (d[c] === null || (c === 'annulee' && d[c] === false)) delete so[c]; else if (d[c] !== undefined) so[c] = d[c]; });
        if (!so.annulee) delete so.motifAnnulation;
        if (Object.keys(so).length) ro.surcharges[d.occurrence] = so; else delete ro.surcharges[d.occurrence];
        break;
      case 'COMMENTAIRE':
        // Commentaire sur un élément, y compris d'un autre service (décision du porteur : le service du patient commente)
        var rc = st.rdv[d.rdv];
        if (!rc || !d.id) break;
        rc.commentaires = (rc.commentaires || []).filter(function (x) { return x.id !== d.id; });
        rc.commentaires.push({ id: d.id, texte: d.texte || '', service: d.service || null, par: e.by, le: e.at, evt: e.id });
        break;
      case 'PATIENT_INSCRIT':
        // Patient inscrit (ou retiré) par un service invité à un événement de plusieurs services (0.21.0) : la liste des
        // patients de l'événement, ou celle de la date pour un événement répété ; les autres réglages ne changent pas
        var rp = st.rdv[d.rdv];
        if (!rp || !d.patient) break;
        var repete = regularite(rp.regularite).type !== 'aucune' && d.occurrence;
        var lp = (repete ? ((rp.surcharges || {})[d.occurrence] || {}).patients || rp.patients : rp.patients) || [];
        lp = lp.filter(function (p) { return p !== d.patient; });
        if (!d.retrait) lp.push(d.patient);
        if (repete) { rp.surcharges = rp.surcharges || {}; rp.surcharges[d.occurrence] = Object.assign({}, rp.surcharges[d.occurrence] || {}, { patients: lp }); }
        else rp.patients = lp;
        break;
      case 'INSCRIPTION':
        // Agent qui s'inscrit (ou se désinscrit) comme accompagnateur d'une occurrence
        var ri = st.rdv[d.rdv];
        if (!ri || !d.agent || !d.occurrence) break;
        ri.participations = ri.participations || {};
        var avantI = (ri.participations[d.occurrence] || []).filter(function (x) { return x.agent === d.agent; })[0];
        ri.participations[d.occurrence] = P.appliquer(ri.participations[d.occurrence], d, e);
        // Information de l'agent dans sa session (décisions des 8 et 11 novembre 2026) : inscrit ou désinscrit par un
        // collègue (sans confirmation : saisies d'avant la 0.21.0), demande confirmée ou refusée ; la proposition d'un
        // collègue n'est pas un avis : elle attend une réponse (`aRepondre`). L'agent qui refuse une proposition : avis à
        // celui qui l'avait proposé, avec le motif.
        if (e.by && e.by !== d.agent) {
          if (d.etat !== 'propose') st.avis.push({ id: e.id, agent: d.agent, par: e.by, le: e.at, rdv: d.rdv, occurrence: d.occurrence, retrait: !!d.retrait,
            genre: d.retrait ? 'retrait' : d.etat === 'refuse' ? 'refus' : avantI && avantI.etat === 'demande' ? 'confirmation' : 'inscription', motif: d.etat === 'refuse' ? String(d.motif || '') : '' });
        } else if (avantI && avantI.etat === 'propose' && avantI.par && avantI.par !== d.agent && !d.retrait) {
          st.avis.push({ id: e.id, agent: avantI.par, par: e.by, le: e.at, rdv: d.rdv, occurrence: d.occurrence, genre: d.etat === 'refuse' ? 'propositionRefusee' : 'propositionAcceptee', motif: d.etat === 'refuse' ? String(d.motif || '') : '' });
        }
        break;
      case 'VALIDATION':
        // Validation d'une occurrence (permission signée, validation médicale ou autre) ; `statut` 'attente' la retire
        var rv = st.rdv[d.rdv];
        if (!rv || !d.validation || !d.occurrence) break;
        rv.validees = rv.validees || {};
        var kv = d.occurrence + '|' + d.validation;
        // Étape d'une permission (0.21.0) : suivi de la date ; la dernière étape vaut validation
        if (d.statut === 'etape') {
          rv.suivis = rv.suivis || {};
          rv.suivis[kv] = Pm.appliquer(rv.suivis[kv], d, e);
          if (d.finale) rv.validees[kv] = { statut: 'validee', nom: d.nom || '', par: e.by, le: e.at, evt: e.id }; else delete rv.validees[kv];
          break;
        }
        if (d.statut === 'attente') { delete rv.validees[kv]; if (rv.suivis) delete rv.suivis[kv]; }
        else rv.validees[d.occurrence + '|' + d.validation] = { statut: d.statut === 'refusee' ? 'refusee' : 'validee', nom: d.nom || '', par: e.by, le: e.at, evt: e.id };
        break;
      case 'TRANSPORT':
        // Transport d'une occurrence réservé (ou remis « à réserver »)
        var rt = st.rdv[d.rdv];
        if (!rt || !d.transport || !d.occurrence) break;
        rt.reservations = rt.reservations || {};
        if (d.statut === 'reserve') rt.reservations[d.occurrence + '|' + d.transport] = { precision: d.precision || '', par: e.by, le: e.at, evt: e.id };
        else delete rt.reservations[d.occurrence + '|' + d.transport];
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
        ['type', 'libelle', 'patientId', 'service', 'avant', 'heure', 'pour', 'precision', 'supprime'].forEach(function (k) { if (d[k] !== undefined) al[k] = d[k]; });
        st.alertes[d.id] = al;
        break;
      case 'TACHE_PERSO':
        // Tâche personnelle (0.26.3) : contenu chiffré par la clé personnelle de l'agent, dernier état gardé
        if (!d.id || !d.agent) break;
        if (st.perso[d.id] && st.perso[d.id].agent !== d.agent) break;
        st.perso[d.id] = { id: d.id, agent: d.agent, chiffre: typeof d.chiffre === 'string' ? d.chiffre : '', supprime: !!d.supprime, cree: (st.perso[d.id] && st.perso[d.id].cree) || e.at, le: e.at, evt: e.id };
        break;
      case 'ALERTE_VUE':
        if (st.alertes[d.alerte]) st.alertes[d.alerte].vue = d.annule ? null : { par: e.by, le: e.at, evt: e.id };
        break;
    }
  }
  function reduire(evts) {
    return N.reduire(evts, { cle: 'agenda', etat: function () { return { rdv: {}, taches: {}, absences: {}, alertes: {}, avis: [], perso: {} }; }, appliquer: appliquer });
  }

  /** Services sur lesquels agit une saisie de l'Agenda (activation du module par service). */
  function cibles(st, e) {
    var d = e.data || {}, x = null;
    if (e.type === 'TACHE_FAITE') x = st && st.taches && st.taches[d.tache];
    else if (['OCCURRENCE', 'CHECK', 'COMMENTAIRE', 'INSCRIPTION', 'PATIENT_INSCRIT', 'VALIDATION', 'TRANSPORT'].indexOf(e.type) >= 0) x = d.service ? null : st && st.rdv && st.rdv[d.rdv];
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
    if (type === 'INSCRIPTION') return !!compte && !!data && data.agent === compte.id;   // chacun s'inscrit lui-même
    if (type === 'TACHE_PERSO') return !!compte && !!data && data.agent === compte.id;   // sa propre liste de tâches
    return type === 'ABSENCE' && !!compte && !!data && data.agent === compte.id;
  }
  /** Tâches personnelles d'un agent (contenu chiffré), hors retirées. */
  function tachesPerso(st, agent) { return Object.keys((st && st.perso) || {}).map(function (k) { return st.perso[k]; }).filter(function (t) { return t.agent === agent && !t.supprime; }); }

  /**
   * Contrôles propres à l'Agenda avant l'enregistrement (décision du porteur du 7 novembre 2026) : une tâche du service
   * ne se modifie ni ne se supprime par une saisie d'équipe ; un ajustement ne change que ce que permet le réglage ;
   * une tâche d'équipe récurrente demande le réglage, ou le droit de régler les tâches. ctx : { etat, config, peut }.
   */
  function controler(type, d, ctx) {
    if (type === 'TACHE_PERSO') {
      var tp = ctx.etat && ctx.etat.perso && ctx.etat.perso[d.id], c = ctx.compte;
      if (!d.id || !c || d.agent !== c.id) throw new Error('Une tâche personnelle n’appartient qu’à son agent.');
      if (tp && tp.agent !== c.id) throw new Error('Une tâche personnelle n’appartient qu’à son agent.');
      if (!d.supprime && (typeof d.chiffre !== 'string' || !d.chiffre || d.chiffre.length > 40000)) throw new Error('Tâche personnelle mal formée.');
      return;
    }
    var st = ctx.etat || { taches: {} }, t = d && (st.taches[d.id] || st.taches[d.tache]), o = optionsTaches(ctx.config);
    // Étape d'une permission (0.21.0) : étape du processus indiqué, enregistrée par un rôle permis
    if (type === 'VALIDATION' && d.statut === 'etape') {
      var rvp = st.rdv && st.rdv[d.rdv], rg = reglagesService(ctx.config, rvp && rvp.service), cle = String(d.processus || '');
      var prc = Pm.processus(ctx.config, rg, cle.indexOf('mode:') === 0 ? cle.slice(5) : cle === 'sdre' ? 'SDRE' : '');
      if (cle && cle.indexOf('mode:') !== 0 && Pm.DEFAUT[cle]) prc = { etapes: (rg.processPermissions && rg.processPermissions[cle] && Pm.etapes(rg.processPermissions[cle].etapes)) || Pm.DEFAUT[cle] };
      Pm.controler(prc, d, (ctx.compte && ctx.compte.roles) || []);
      if (d.finale && rvp && rg.tachesObligatoiresBloquent) {
        var reste = etatChecklist(rdvOccurrence(rvp, d.occurrence), d.occurrence).items.filter(function (it) { return it.obligatoire && !it.fait; });
        if (reste.length) throw new Error('Tâche obligatoire à faire avant de valider la permission : ' + reste.map(function (it) { return it.libelle; }).join(' ; ') + '.');
      }
    }
    // Événement de plusieurs services (0.21.0) : un agent d'un autre service ne le modifie que si son service est
    // co-organisateur (ou si l'établissement permet de modifier les éléments des autres services) ; un service invité
    // inscrit ses patients et ses agents, sans modifier l'événement
    var svAgent = (ctx.compte && ctx.compte.services) || [], cible = st.rdv && st.rdv[type === 'RDV' ? d.id : d.rdv];
    if (cible && svAgent.length && svAgent.indexOf(cible.service) < 0 && (type === 'RDV' || type === 'OCCURRENCE' || type === 'PATIENT_INSCRIT')) {
      var lie = (cible.services || []).some(function (c) { return svAgent.indexOf(c) >= 0; });
      if (type === 'PATIENT_INSCRIT') { if (!lie) throw new Error('Votre service ne participe pas à cet événement.'); }
      else if (!(lie && cible.partage === 'co') && !optionsAgenda(ctx.config).modifAutresServices) throw new Error(lie ? 'Votre service est invité à cet événement : il y inscrit ses patients et ses agents, sans le modifier.' : 'Cet événement appartient à un autre service.');
    }
    if (type === 'RDV' && cible && d.service && d.service !== cible.service && svAgent.length && svAgent.indexOf(cible.service) < 0) throw new Error('Seul le service organisateur change le service de l’événement.');
    // Inscription d'un professionnel (0.21.0) : selon le réglage de l'événement (libre, à confirmer, invitation, places)
    if (type === 'INSCRIPTION' && ctx.compte && st.rdv && st.rdv[d.rdv] && d.occurrence) {
      P.controler(rdvOccurrence(st.rdv[d.rdv], d.occurrence), d.occurrence, d, { compte: ctx.compte, rolesConfirmation: rolesConfirmation(ctx.config, st.rdv[d.rdv].service), peutInscrire: ctx.peut('INSCRIPTION') });
    }
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
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { agendaReglages: controlerCadreReglages } },
    // Onglet « Tâches du service » : affiché à qui peut régler les tâches (décision du porteur du 7 novembre 2026)
    vues: { onglets: [{ code: 'agenda', libelle: 'Agenda' }, { code: 'alertes', libelle: 'Alertes' }, { code: 'mon-agenda', libelle: 'Mon agenda' }, { code: 'mes-taches', libelle: 'Mes tâches' }, { code: 'taches', libelle: 'Tâches récurrentes', droit: ['TACHE', 'TACHE_AJUSTEMENT'] }] },
    migrations: [],
    fournitures: [
      // Lue par Salles et bureaux (0.25.0) : salles occupées par les événements
      { nom: 'agenda.occupations', version: 1, acces: 'lecture', champs: ['ref', 'salle', 'debut', 'fin', 'titre', 'genre', 'service', 'par'],
        lire: function (st, o) { return occupationsSalles(st, o.debut, o.fin); } }
    ],
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }, { fourniture: 'isocont.echeancesJLD', version: 1, obligatoire: false }]
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, tachesPerso: tachesPerso, NATURES: NATURES, CATEGORIES_ABSENCE: CATEGORIES_ABSENCE, ACCES: ACCES, droits: D,
    IDENTITES: IDENTITES, TYPES_ALERTE_DEFAUT: TYPES_ALERTE_DEFAUT, optionsAgenda: optionsAgenda, identite: identite, serviceDuPatient: serviceDuPatient, elements: elements,
    REGULARITES: REGULARITES, RANGS: RANGS, PERIODES: PERIODES, GENRES_JOUR: GENRES_JOUR, ENTRETIENS: ENTRETIENS, AVEC: AVEC, STATUTS_PERMISSION: STATUTS_PERMISSION, COULEURS_DEFAUT: COULEURS_DEFAUT, DELAIS_PERMISSION_DEFAUT: DELAIS_PERMISSION_DEFAUT,
    libelleRepetition: libelleRepetition, accompagnateurs: accompagnateurs, placesPatients: placesPatients, rolesConfirmation: rolesConfirmation, reglagesService: reglagesService, suggestions: suggestions, tachesSuggerees: tachesSuggerees, SUGGESTIONS_DEFAUT: SUGGESTIONS_DEFAUT, EVENEMENTS_SUGGESTION: EVENEMENTS_SUGGESTION, processusPermission: processusPermission, tachesPermission: tachesPermission, permissions: Pm, partageDefaut: partageDefaut, PARTAGES: PARTAGES, controlerCadreReglages: controlerCadreReglages, aRepondre: aRepondre, aConfirmer: aConfirmer, patientsManquants: patientsManquants, participants: P, modeAu: modeAu, delaiPermission: delaiPermission, permissionsAValider: permissionsAValider,
    enAttente: enAttente, PREREGLAGES_DEFAUT: PREREGLAGES_DEFAUT, categories: categories, categorie: categorie, baseDe: baseDe, nettoyerPrereglages: nettoyerPrereglages, typesEnAttente: typesEnAttente, ATTENTE_DEFAUT: ATTENTE_DEFAUT, CHAMPS_OCCURRENCE: CHAMPS_OCCURRENCE, rdvOccurrence: rdvOccurrence, TRANSPORTS: TRANSPORTS, TYPES_VALIDATION: TYPES_VALIDATION, EXAMENS: EXAMENS, validationsDe: validationsDe, etatValidations: etatValidations, statutPermission: statutPermission,
    aFaireValider: aFaireValider, etatTransports: etatTransports, transportsAReserver: transportsAReserver, accompagnateursManquants: accompagnateursManquants, avisPour: avisPour, CHECKLISTS_DEFAUT: CHECKLISTS_DEFAUT, regularite: regularite, datesOccurrences: datesOccurrences, occurrences: occurrences,
    alertesEquipe: alertesEquipe, alertePour: alertePour, occupationsSalles: occupationsSalles, evenementsPatients: evenementsPatients, reunionsAVenir: reunionsAVenir, monAgenda: monAgenda,
    etatChecklist: etatChecklist, checklists: checklists, alertesChecklists: alertesChecklists, optionsTaches: optionsTaches, AJUSTABLES: AJUSTABLES, affectation: affectation, controler: controler, tachePour: tachePour, tachesDues: tachesDues, absences: absences, prevusAbsents: prevusAbsents, jourISO: jourISO, depuisISO: depuisISO };
});
