// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Suivi médical — contrat déclaré au registre des modules (décisions du porteur du 8 novembre 2026, maquettes
 * validées le même jour).
 *
 * - Présences médicales (`PRESENCE`) : présences, absences (avec remplaçant) et gardes ou astreintes des médecins de la
 *   liste commune (medecins.js), par service ou lieu de présence (ex. urgences médico-psychologiques, sans patient),
 *   par demi-journée, répétées chaque semaine, toutes les deux semaines, ou pour une date.
 * - Entretiens médicaux et contrats de soins (`SUIVI`) : seules les DATES sont gardées (qui, quand ; aucun contenu),
 *   délais d'alerte selon la durée d'hospitalisation du patient, saisie en une fois des patients vus le même jour.
 * - Patients suivis par médecin : lecture de la fiche patient (médecins de 1re et 2e ligne) ; l'attribution depuis le
 *   tableau est une saisie du module Patients faite par l'interface (ce module n'écrit jamais dans un autre journal).
 * Journal `modules\suivi\`, clé propre, activation par service.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'), require('./medecins.js'));
  else (root.SIC = root.SIC || {}).suivi = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.medecins);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, MED) {
  'use strict';

  var TYPES = ['PRESENCE', 'SUIVI'];
  var NATURES = { presence: 'Présence', absence: 'Absence', garde: 'Garde ou astreinte' };
  var MOMENTS = { matin: 'Matin', apresmidi: 'Après-midi' };
  var REPETITIONS = { semaine: 'Chaque semaine', quinzaine: 'Toutes les 2 semaines', date: 'Une seule date' };
  var QUOI = { entretien: 'Entretien médical', contrat: 'Réévaluation du contrat de soins', lesdeux: 'Entretien et réévaluation du contrat' };
  var TRANCHES_DEFAUT = [{ jusqua: 7, entretien: 2, contrat: 7 }, { jusqua: 30, entretien: 7, contrat: 15 }, { jusqua: null, entretien: 14, contrat: 30 }];
  var GARDES_DEFAUT = [{ code: 'nuit', libelle: 'Garde de nuit', debut: '17:30', fin: '08:30', lieu: '' }, { code: 'jour', libelle: 'Garde de jour', debut: '08:30', fin: '17:30', lieu: '' },
    { code: 'astreinte', libelle: 'Astreinte', debut: '18:30', fin: '08:30', lieu: '' }];

  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function depuisISO(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function plusJours(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function joursEntre(a, b) { return Math.round((depuisISO(jourISO(b)) - depuisISO(jourISO(a))) / 864e5); }
  function entier(v, min, max, d) { var n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : d; }
  function heure(v, d) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d; }

  // ------------------------------------------------------------ Réglages
  /** Réglages du module, validés à la lecture (`config.suiviMedical`). */
  function options(config) {
    var x = (config && config.suiviMedical) || {};
    var tr = Array.isArray(x.tranches) ? x.tranches.map(function (t) {
      return { jusqua: t && t.jusqua !== null && t.jusqua !== undefined && t.jusqua !== '' ? entier(t.jusqua, 0, 3650, null) : null, entretien: entier(t && t.entretien, 1, 365, 7), contrat: entier(t && t.contrat, 1, 365, 30) };
    }).filter(function (t, i, l) { return t.jusqua !== null || i === l.length - 1; }) : [];
    if (!tr.length) tr = TRANCHES_DEFAUT.map(function (t) { return Object.assign({}, t); });
    tr.sort(function (a, b) { return (a.jusqua === null ? 1e9 : a.jusqua) - (b.jusqua === null ? 1e9 : b.jusqua); });
    tr[tr.length - 1].jusqua = null;   // la dernière tranche vaut au-delà
    var gardes = Array.isArray(x.gardes) ? x.gardes.filter(function (g) { return g && g.code && String(g.libelle || '').trim(); }).map(function (g) {
      return { code: String(g.code).slice(0, 30), libelle: String(g.libelle).trim().slice(0, 60), debut: heure(g.debut, '08:30'), fin: heure(g.fin, '17:30'), lieu: typeof g.lieu === 'string' ? g.lieu : '' };
    }) : GARDES_DEFAUT.map(function (g) { return Object.assign({}, g); });
    var lieux = Array.isArray(x.lieux) ? x.lieux.filter(function (l) { return l && /^[A-Za-z0-9_-]{1,20}$/.test(l.code || '') && String(l.libelle || '').trim(); }).map(function (l) { return { code: l.code, libelle: String(l.libelle).trim().slice(0, 80) }; }) : [];
    return { tranches: tr, premierEntretien: entier(x.premierEntretien, 0, 30, 1), nonAttribueApres: entier(x.nonAttribueApres, 0, 30, 0),
      gardes: gardes, lieux: lieux, alerteCouverture: x.alerteCouverture !== false };
  }
  /** Délais (entretien, contrat) qui s'appliquent au jour d'hospitalisation `j` (J0 = jour d'entrée). */
  function delais(config, j) {
    var tr = options(config).tranches;
    return tr.filter(function (t) { return t.jusqua === null || j <= t.jusqua; })[0] || tr[tr.length - 1];
  }
  function libGarde(g) { return g.libelle + ' ' + g.debut.replace(':', 'h') + '–' + g.fin.replace(':', 'h'); }

  // ------------------------------------------------------------ Journal
  function appliquer(st, e) {
    var d = e.data || {};
    switch (e.type) {
      case 'PRESENCE':
        if (!d.id) return;
        if (d.supprime) { if (st.presences[d.id]) st.presences[d.id].supprime = true; return; }
        var p = Object.assign({}, st.presences[d.id] || { id: d.id, par: e.by, cree: e.at });
        ['medecin', 'medecinId', 'service', 'nature', 'garde', 'jours', 'moments', 'repetition', 'debut', 'fin', 'precision', 'remplacant', 'remplacantId'].forEach(function (k) { if (d[k] !== undefined) p[k] = d[k]; });
        p.modifie = e.at; st.presences[d.id] = p;
        return;
      case 'SUIVI':
        if (!d.id) return;
        if (d.annule) { if (st.suivis[d.id]) st.suivis[d.id].annule = { par: e.by, le: e.at }; return; }
        st.suivis[d.id] = { id: d.id, patient: d.patient, service: d.service || '', date: d.date, medecin: d.medecin || '', medecinId: d.medecinId || null, quoi: QUOI[d.quoi] ? d.quoi : 'entretien', par: e.by, le: e.at };
        return;
    }
  }
  function reduire(evts) { return N.reduire(evts, { etat: function () { return { presences: {}, suivis: {} }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Présences
  /** La présence s'applique-t-elle à ce jour (ISO) ? Selon les jours de la semaine, la répétition et la période. */
  function couvre(p, j) {
    if (!p || p.supprime || !p.debut || j < p.debut || (p.fin && j > p.fin)) return false;
    if (p.repetition === 'date') return j === p.debut;
    var t = depuisISO(j), jours = Array.isArray(p.jours) ? p.jours : [];
    if (jours.indexOf(new Date(t).getDay()) < 0) return false;
    if (p.repetition === 'quinzaine') {
      var semaine = function (x) { var d = new Date(x); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
      return Math.round((semaine(t) - semaine(depuisISO(p.debut))) / (7 * 864e5)) % 2 === 0;
    }
    return true;
  }
  function moments(p) { var m = Array.isArray(p.moments) && p.moments.length ? p.moments : ['matin', 'apresmidi']; return m.filter(function (x) { return MOMENTS[x]; }); }
  /** Médecin d'une présence, ramené à son nom actuel (identifiant d'abord, puis nom actuel ou ancien). */
  function medecinDe(config, p) { return MED.resoudre(config, p.medecin, p.medecinId); }
  function presencesActives(st) { return Object.keys(st.presences || {}).map(function (k) { return st.presences[k]; }).filter(function (p) { return !p.supprime; }); }

  /**
   * Situation d'un médecin pour un lieu (service ou lieu de présence), un jour et un moment :
   * { etat: 'present'|'ponctuel'|'absent'|'garde'|'', remplacant, precision, garde }. L'absence l'emporte ; une garde dont
   * le type est rattaché à ce lieu compte comme une présence (ex. garde de jour aux urgences médico-psychologiques).
   */
  function situation(st, config, medecin, lieu, j, moment) {
    var ps = presencesActives(st).filter(function (p) { return medecinDe(config, p) === medecin && couvre(p, j) && moments(p).indexOf(moment) >= 0; });
    var abs = ps.filter(function (p) { return p.nature === 'absence'; })[0];
    if (abs) return { etat: 'absent', remplacant: abs.remplacant ? MED.resoudre(config, abs.remplacant, abs.remplacantId) : '', precision: abs.precision || '' };
    var pr = ps.filter(function (p) { return p.nature === 'presence' && p.service === lieu; })[0];
    if (pr) return { etat: pr.repetition === 'date' ? 'ponctuel' : 'present', precision: pr.precision || '' };
    var gardes = options(config).gardes;
    var g = ps.filter(function (p) { if (p.nature !== 'garde') return false; var t = gardes.filter(function (x) { return x.code === p.garde; })[0]; return !!t && t.lieu === lieu; })[0];
    if (g) return { etat: 'garde', precision: g.precision || '', garde: g.garde };
    return { etat: '' };
  }
  /** Médecins à afficher pour un lieu sur une période : ceux qui y ont une présence (ou une garde rattachée), et ceux de la liste commune affectés à ce service. */
  function medecinsDuLieu(st, config, lieu, j0, j1) {
    var gardes = options(config).gardes, noms = {};
    presencesActives(st).forEach(function (p) {
      var t = p.nature === 'garde' ? gardes.filter(function (x) { return x.code === p.garde; })[0] : null;
      if ((p.nature === 'presence' && p.service === lieu) || (t && t.lieu === lieu)) {
        for (var j = j0; j <= j1; j = jourISO(plusJours(depuisISO(j), 1))) if (couvre(p, j)) { noms[medecinDe(config, p)] = true; break; }
      }
    });
    MED.proposes(config, { date: depuisISO(j0) }).forEach(function (m) { if (m.services.indexOf(lieu) >= 0) noms[m.nom] = true; });
    return Object.keys(noms).map(function (n) { return MED.parNom(config, n) || MED.normaliser({ nom: n, fonction: 'autre' }); })
      .sort(function (a, b) { return (a.fonction === 'psychiatre' ? 0 : 1) - (b.fonction === 'psychiatre' ? 0 : 1) || a.nom.localeCompare(b.nom); });
  }
  /**
   * Grille d'une semaine pour un lieu : { jours: [ISO], lignes: [{ medecin, cases: [{ jour, moment, ...situation }] }],
   * couverture: [{ jour, moment, psychiatres, somaticien }], gardes: [{ jour, items }] }. Un remplaçant compte comme psychiatre
   * présent s'il est psychiatre dans la liste commune (ou hors liste).
   */
  function grilleLieu(st, config, lieu, lundi) {
    var jours = []; for (var i = 0; i < 7; i++) jours.push(jourISO(plusJours(depuisISO(lundi), i)));
    var meds = medecinsDuLieu(st, config, lieu, jours[0], jours[6]);
    var lignes = meds.map(function (m) {
      var cases = [];
      jours.forEach(function (j) { Object.keys(MOMENTS).forEach(function (mo) { cases.push(Object.assign({ jour: j, moment: mo }, situation(st, config, m.nom, lieu, j, mo))); }); });
      return { medecin: m, cases: cases };
    });
    var couverture = [];
    jours.forEach(function (j, ij) {
      Object.keys(MOMENTS).forEach(function (mo, im) {
        var psy = 0, soma = 0;
        lignes.forEach(function (l) {
          var c = l.cases[ij * 2 + im];
          var present = c.etat === 'present' || c.etat === 'ponctuel' || c.etat === 'garde';
          if (present && l.medecin.fonction === 'psychiatre') psy++;
          if (present && l.medecin.fonction === 'somaticien') soma++;
          if (c.etat === 'absent' && c.remplacant) { var r = MED.parNom(config, c.remplacant); if (!r || r.fonction === 'psychiatre') psy++; }
        });
        var ouvre = new Date(depuisISO(j)).getDay() % 6 !== 0;
        couverture.push({ jour: j, moment: mo, psychiatres: psy, somaticien: soma, alerte: options(config).alerteCouverture && ouvre && psy === 0 });
      });
    });
    var gardes = jours.map(function (j) { return { jour: j, items: gardesDuJour(st, config, j) }; });
    return { jours: jours, lignes: lignes, couverture: couverture, gardes: gardes };
  }
  /** Gardes et astreintes d'un jour (tous lieux) : [{ medecin, type, libelle, lieu }]. */
  function gardesDuJour(st, config, j) {
    var types = options(config).gardes;
    return presencesActives(st).filter(function (p) { return p.nature === 'garde' && couvre(p, j); }).map(function (p) {
      var t = types.filter(function (x) { return x.code === p.garde; })[0] || { libelle: 'Garde', debut: '', fin: '', lieu: '' };
      return { medecin: medecinDe(config, p), type: p.garde, libelle: t.debut ? libGarde(t) : t.libelle, lieu: t.lieu, id: p.id };
    }).sort(function (a, b) { return a.libelle.localeCompare(b.libelle); });
  }
  /** Semaine d'un médecin dans tous ses lieux : { jours, lignes: [{ lieu, cases: [{ jour, moments: [...] }] }], absences, gardes }. */
  function semaineMedecin(st, config, medecin, lundi) {
    var jours = []; for (var i = 0; i < 7; i++) jours.push(jourISO(plusJours(depuisISO(lundi), i)));
    var ps = presencesActives(st).filter(function (p) { return medecinDe(config, p) === medecin; });
    var lieux = {}; ps.forEach(function (p) { if (p.nature === 'presence' && jours.some(function (j) { return couvre(p, j); })) lieux[p.service] = true; });
    var lignes = Object.keys(lieux).sort().map(function (l) {
      return { lieu: l, cases: jours.map(function (j) { return { jour: j, moments: Object.keys(MOMENTS).map(function (mo) { return { moment: mo, s: situation(st, config, medecin, l, j, mo) }; }) }; }) };
    });
    var absences = jours.map(function (j) { var a = ps.filter(function (p) { return p.nature === 'absence' && couvre(p, j); }); return { jour: j, items: a }; });
    var gardes = jours.map(function (j) { return { jour: j, items: gardesDuJour(st, config, j).filter(function (g) { return g.medecin === medecin; }) }; });
    return { jours: jours, lignes: lignes, absences: absences, gardes: gardes, presences: ps };
  }

  // ------------------------------------------------------------ Entretiens et contrats de soins
  function suivisDe(st, patient) {
    return Object.keys(st.suivis || {}).map(function (k) { return st.suivis[k]; }).filter(function (x) { return x.patient === patient && !x.annule; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.le).localeCompare(String(a.le)); });
  }
  /** Derniers entretien et réévaluation du contrat d'un patient : { entretien, contrat } (saisies ou null). */
  function derniers(st, patient) {
    var l = suivisDe(st, patient);
    return { entretien: l.filter(function (x) { return x.quoi === 'entretien' || x.quoi === 'lesdeux'; })[0] || null,
      contrat: l.filter(function (x) { return x.quoi === 'contrat' || x.quoi === 'lesdeux'; })[0] || null };
  }
  function sejourEnCours(p) { var r = null; ((p && p.sejours) || []).forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  function serviceDe(p) { var s = sejourEnCours(p); return (s && s.service) || (p && p.service) || ''; }
  /** Jour d'hospitalisation (J0 = jour d'entrée du séjour en cours), ou null sans date d'entrée. */
  function jourHospitalisation(p, maintenant) { var s = sejourEnCours(p); return s && s.entree ? Math.max(0, joursEntre(depuisISO(s.entree), maintenant)) : null; }
  /** « NOM Prénom (ch. 12, J24) » : chambre et jour d'hospitalisation toujours après le nom (décision du porteur). */
  function identite(p, maintenant) {
    if (!p) return 'Patient inconnu';
    var s = sejourEnCours(p), j = jourHospitalisation(p, maintenant), x = [];
    if (s && s.chambre) x.push('ch. ' + s.chambre);
    if (j !== null) x.push('J' + j);
    return ((p.nom || '?') + ' ' + (p.prenom || '')).trim() + (x.length ? ' (' + x.join(', ') + ')' : '');
  }
  /**
   * Suivi d'un patient : jour d'hospitalisation, délais applicables, dernier entretien et dernier contrat avec le nombre de
   * jours écoulés et le retard. Sans entretien : retard au-delà du délai du premier entretien après l'entrée ; sans
   * contrat : retard au-delà du délai de réévaluation de sa tranche.
   */
  function suiviPatient(st, config, p, maintenant) {
    var j = jourHospitalisation(p, maintenant), dl = delais(config, j === null ? 0 : j), d = derniers(st, p.id), o = options(config);
    function un(x, delai, sansRetardAvant) {
      if (!x) return { date: null, jours: null, retard: j !== null && j > sansRetardAvant, delai: delai };
      var n = joursEntre(depuisISO(x.date), maintenant);
      return { date: x.date, jours: n, retard: n > delai, delai: delai, medecin: MED.resoudre(config, x.medecin, x.medecinId) };
    }
    return { patient: p, jour: j, delais: dl, entretien: un(d.entretien, dl.entretien, o.premierEntretien), contrat: un(d.contrat, dl.contrat, dl.contrat) };
  }
  /** Patients hospitalisés d'un ou plusieurs services (séjour en cours). */
  function hospitalises(fiches, services) {
    return Object.keys(fiches || {}).map(function (k) { return fiches[k]; }).filter(function (p) { return p && !p.fusionneDans && sejourEnCours(p) && services.indexOf(serviceDe(p)) >= 0; })
      .sort(function (a, b) { return ((a.nom || '') + (a.prenom || '')).localeCompare((b.nom || '') + (b.prenom || '')); });
  }
  function suivis(st, config, fiches, services, maintenant) { return hospitalises(fiches, services).map(function (p) { return suiviPatient(st, config, p, maintenant); }); }

  // ------------------------------------------------------------ Patients par médecin
  /**
   * Tableau par médecin d'un service : { nonAttribues: { l1, l2 }, lignes: [{ medecin, l1, l2 }] } ; chaque case liste
   * les suivis des patients (suiviPatient). Non attribué : sans médecin à ce niveau, après le délai réglé (jours depuis
   * l'entrée). Les médecins de la liste commune affectés au service ont leur ligne même sans patient ; un nom de fiche
   * absent de la liste a aussi la sienne.
   */
  function parMedecin(st, config, fiches, service, maintenant) {
    var o = options(config), ls = suivis(st, config, fiches, [service], maintenant), lignes = {};
    function ligne(nom) { return lignes[nom] = lignes[nom] || { medecin: MED.parNom(config, nom) || MED.normaliser({ nom: nom, fonction: 'autre', horsListe: true }), horsListe: !MED.parNom(config, nom), l1: [], l2: [] }; }
    MED.proposes(config, { date: maintenant, service: service }).filter(function (m) { return m.services.indexOf(service) >= 0; }).forEach(function (m) { ligne(m.nom); });
    var na = { l1: [], l2: [] };
    ls.forEach(function (x) {
      var p = x.patient;
      [['medecin1', 'l1'], ['medecin2', 'l2']].forEach(function (k) {
        var nom = MED.resoudre(config, p[k[0]], p[k[0] + 'Id']);   // identifiant, ou nom actuel ou ancien : la fiche suit le médecin
        if (nom) ligne(nom)[k[1]].push(x);
        else if (x.jour === null || x.jour >= o.nonAttribueApres) na[k[1]].push(x);
      });
    });
    return { nonAttribues: na, lignes: Object.keys(lignes).map(function (k) { return lignes[k]; }).sort(function (a, b) {
      return (a.medecin.fonction === 'psychiatre' ? 0 : 1) - (b.medecin.fonction === 'psychiatre' ? 0 : 1) || a.medecin.nom.localeCompare(b.medecin.nom); }) };
  }
  /** Alertes du module pour des services : retards d'entretien et de contrat, patients non attribués (1re et 2e ligne). */
  function alertes(st, config, fiches, services, maintenant) {
    var res = [];
    services.forEach(function (sv) {
      var t = parMedecin(st, config, fiches, sv, maintenant);
      t.nonAttribues.l1.forEach(function (x) { res.push({ type: 'nonAttribue', niveau: 1, service: sv, suivi: x }); });
      t.nonAttribues.l2.forEach(function (x) { res.push({ type: 'nonAttribue', niveau: 2, service: sv, suivi: x }); });
    });
    suivis(st, config, fiches, services, maintenant).forEach(function (x) {
      if (x.entretien.retard) res.push({ type: 'entretien', service: serviceDe(x.patient), suivi: x });
      if (x.contrat.retard) res.push({ type: 'contrat', service: serviceDe(x.patient), suivi: x });
    });
    return res;
  }

  // ------------------------------------------------------------ Contrat
  var ACCES = [
    { code: 'suivi.consulter', libelle: 'Consulter les présences médicales, les entretiens et contrats de soins, les patients par médecin', types: [] },
    { code: 'suivi.presences', libelle: 'Saisir les présences, absences, gardes et astreintes des médecins', types: ['PRESENCE'] },
    { code: 'suivi.entretiens', libelle: 'Cocher les entretiens médicaux et les réévaluations du contrat de soins', types: ['SUIVI'] }
  ];
  // Rôles par défaut (maquette validée) : secrétaire et cadre saisissent les présences ; IDE et cadre cochent les
  // entretiens. Réglables dans Rôles et accès. Les médecins n'utilisent pas encore Tessera.
  var DROITS = { IDE: ['SUIVI'], SECRETAIRE: ['PRESENCE'], CADRE: TYPES.slice() };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'suivi', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.suivi : undefined; },
    appartenance: 'acces'
  });
  function lieuxCodes(config) { return options(config).lieux.map(function (l) { return l.code; }); }
  /** Services sur lesquels agit une saisie : le service de la présence (un lieu sans patient n'en est pas un), celui du patient. */
  function cibles(st, e) {
    var d = e.data || {}, x = e.type === 'PRESENCE' ? (d.service !== undefined ? d : st && st.presences && st.presences[d.id]) : (d.service !== undefined ? d : st && st.suivis && st.suivis[d.id]);
    return x && x.service ? [x.service] : [];
  }
  function controler(type, d, ctx) {
    if (!d || d.supprime || d.annule) return;
    if (type === 'SUIVI') {
      if (!d.patient || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Patient et date requis.');
      if (d.date > jourISO(Date.now())) throw new Error('La date ne peut pas être dans le futur.');
    }
    if (type === 'PRESENCE') {
      var p = Object.assign({}, (ctx.etat && ctx.etat.presences && ctx.etat.presences[d.id]) || {}, d);
      if (!String(p.medecin || '').trim()) throw new Error('Choisissez le médecin.');
      if (!NATURES[p.nature]) throw new Error('Nature inconnue.');
      if (p.nature === 'presence' && !p.service) throw new Error('Choisissez le service ou le lieu.');
      if (p.nature === 'garde' && !options(ctx.config).gardes.some(function (g) { return g.code === p.garde; })) throw new Error('Choisissez le type de garde.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.debut || '')) throw new Error('Indiquez le premier jour.');
      if (p.fin && p.fin < p.debut) throw new Error('Le dernier jour précède le premier.');
      if (p.repetition !== 'date' && !(p.jours || []).length) throw new Error('Choisissez au moins un jour de la semaine.');
    }
  }
  var contrat = {
    id: 'suivi',
    libelle: 'Suivi médical',
    version: '0.1.0',
    icone: 'SM',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'presences', libelle: 'Présences médicales' }, { code: 'entretiens', libelle: 'Entretiens et contrats de soins' }, { code: 'medecins', libelle: 'Patients par médecin' }, { code: 'liste', libelle: 'Médecins' }] },
    migrations: [],
    fournitures: [
      // Lue par la liste des patients et par l'agenda : derniers entretien et contrat d'un patient, alertes du module
      { nom: 'suivi.patient', version: 1, acces: 'lecture', champs: ['jour', 'delais', 'entretien', 'contrat'],
        lire: function (st, o) { return suiviPatient(st, o.config, o.patient, o.maintenant || Date.now()); } },
      { nom: 'suivi.alertes', version: 1, acces: 'lecture', champs: ['type', 'niveau', 'service', 'suivi'],
        lire: function (st, o) { return alertes(st, o.config, o.fiches, o.services, o.maintenant || Date.now()); } }
    ],
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }]
  };
  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, NATURES: NATURES, MOMENTS: MOMENTS, REPETITIONS: REPETITIONS, QUOI: QUOI, TRANCHES_DEFAUT: TRANCHES_DEFAUT, GARDES_DEFAUT: GARDES_DEFAUT,
    options: options, delais: delais, libGarde: libGarde, couvre: couvre, situation: situation, grilleLieu: grilleLieu, gardesDuJour: gardesDuJour, semaineMedecin: semaineMedecin,
    medecinsDuLieu: medecinsDuLieu, medecinDe: medecinDe, derniers: derniers, suivisDe: suivisDe, suiviPatient: suiviPatient, jourHospitalisation: jourHospitalisation, identite: identite, hospitalises: hospitalises,
    suivis: suivis, parMedecin: parMedecin, alertes: alertes, serviceDe: serviceDe, lieuxCodes: lieuxCodes, jourISO: jourISO, depuisISO: depuisISO, plusJours: plusJours };
});
