// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Heures supplémentaires — contrat déclaré au registre des modules (lot C, phase 4, 14 novembre 2026 ;
 * décisions du porteur : module propre, heures et minutes, confirmation par les rôles réglés par l'établissement).
 *
 * L'agent déclare ses heures supplémentaires (date, horaires ou durée, motif d'une liste réglable, commentaire court,
 * sans donnée clinique ni nom de patient) et demande ses récupérations ; le validateur (règle des Congés) accepte en
 * récupération ou en heures payées (si l'établissement l'autorise, dans un plafond mensuel réglable), en partie, ou
 * refuse avec un motif ; les rôles choisis confirment l'enregistrement dans le logiciel de gestion du temps, qui reste
 * la référence (Tessera ne calcule pas la paie). Solde d'heures à récupérer par agent et par année, corrigé par le
 * validateur (le calcul restant affiché). Données du personnel : fonction **soumise à avis**, livrée désactivée.
 * Journal `modules\heures\`, clé propre.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).heures = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['HEURES_DECLARATION', 'HEURES_DECISION', 'HEURES_RECUP', 'HEURES_RECUP_DECISION', 'HEURES_ENREGISTREE', 'HEURES_ANNULATION', 'HEURES_CORRECTION'];
  var JOUR = /^\d{4}-\d{2}-\d{2}$/, HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var STATUTS = { demande: 'À valider', recuperation: 'Accepté en récupération', paiement: 'Accepté en heures payées', valide: 'Récupération validée', refuse: 'Refusé', annule: 'Annulé' };
  var MOTIFS_DEFAUT = [{ code: 'depassement', libelle: 'Dépassement d’horaire' }, { code: 'rappel', libelle: 'Rappel sur un repos' }, { code: 'reunion', libelle: 'Réunion' },
    { code: 'formation', libelle: 'Formation' }, { code: 'remplacement', libelle: 'Remplacement' }, { code: 'autre', libelle: 'Autre' }];
  var VALIDATEURS_DEFAUT = { IDE: 'CADRE', AS: 'CADRE', SECRETAIRE: 'CADRE', CADRE: 'CADRE_SUP', CADRE_SUP: 'DIRECTEUR_SOINS', MEDECIN: 'MEDECIN_CHEF_SERVICE', MEDECIN_CHEF_SERVICE: 'MEDECIN_CHEF_POLE', '*': 'CADRE' };
  var PRESEANCE = ['DIRECTEUR_SOINS', 'MEDECIN_CHEF_POLE', 'MEDECIN_CHEF_SERVICE', 'MEDECIN', 'CADRE_SUP', 'CADRE', 'SECRETAIRE', 'IDE', 'AS'];
  var TOUS_SERVICES = ['DIRECTEUR_SOINS', 'ADMIN'];

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function minutesDe(hhmm) { var m = HEURE.exec(hhmm || ''); return m ? +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5) : null; }
  /** Durée d'après les horaires (passage de minuit compris), en minutes. */
  function duree(debut, fin) { var a = minutesDe(debut), b = minutesDe(fin); if (a === null || b === null) return null; var d = b - a; return d <= 0 ? d + 1440 : d; }
  /** « 1 h 05 », « 45 min », « −2 h 30 ». */
  function hm(min) { var n = Math.round(+min || 0), s = n < 0 ? '−' : '', a = Math.abs(n), h = Math.floor(a / 60), m = a % 60; return s + (h ? h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '') : m + ' min'); }
  /** « 1:30 », « 1h30 », « 90 » (minutes) → minutes ; null si illisible. */
  function lireDuree(t) {
    var s = String(t || '').trim().toLowerCase().replace(/\s+/g, '');
    var m = /^(\d{1,3})(?:[:h](\d{1,2})?)?$/.exec(s);
    if (!m) return null;
    if (/[:h]/.test(s)) { var mm = +(m[2] || 0); return mm < 60 ? +m[1] * 60 + mm : null; }
    return +m[1];
  }

  // ------------------------------------------------------------ Réglages
  function options(config) {
    var x = (config && config.heures) || {}, cg = (config && config.conges && config.conges.validateurs) || null;
    var motifs = (Array.isArray(x.motifs) ? x.motifs : MOTIFS_DEFAUT).map(function (m) { return m && texte(m.libelle, 60) ? { code: texte(m.code, 30) || texte(m.libelle, 30).toLowerCase(), libelle: texte(m.libelle, 60) } : null; }).filter(Boolean);
    var roles = Array.isArray(x.rolesGtt) ? x.rolesGtt.filter(function (r) { return typeof r === 'string' && r; }) : ['CADRE', 'SECRETAIRE'];
    var pl = Math.round(+x.plafondMensuel);
    return { motifs: motifs.length ? motifs : MOTIFS_DEFAUT.slice(), paiement: x.paiement === true, plafondMensuel: pl > 0 && pl <= 20000 ? pl : null,
      etapeGtt: x.etapeGtt !== false, rolesGtt: roles.length ? roles : ['CADRE'], validateurs: Object.assign({}, VALIDATEURS_DEFAUT, cg || {}, x.validateurs || {}) };
  }
  function rolePrincipal(roles) { roles = roles || []; return PRESEANCE.filter(function (r) { return roles.indexOf(r) >= 0; })[0] || roles[0] || ''; }
  function valide(config, v, a) {
    if (!v || !a || v.id === a.id) return false;
    var vs = options(config).validateurs, r = vs[rolePrincipal(a.roles)] || vs['*'] || 'CADRE', rv = v.roles || [];
    if (rv.indexOf('ADMIN') >= 0) return true;
    if (rv.indexOf(r) < 0) return false;
    if (TOUS_SERVICES.indexOf(r) >= 0) return true;
    return (v.services || []).some(function (s) { return (a.services || []).indexOf(s) >= 0; });
  }
  function confirmeGtt(config, roles) { var o = options(config); return o.etapeGtt && (roles || []).some(function (r) { return r === 'ADMIN' || o.rolesGtt.indexOf(r) >= 0; }); }
  function agentDe(x, comptes) { return (comptes || []).filter(function (c) { return c.id === x.agent; })[0] || { id: x.agent, roles: x.roles || [], services: x.service ? [x.service] : [] }; }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, x;
    switch (e.type) {
      case 'HEURES_DECLARATION':
        if (!d.id || st.declarations[d.id]) break;
        st.declarations[d.id] = { id: d.id, genre: 'declaration', agent: e.by, nom: texte(d.nom, 80), roles: Array.isArray(d.roles) ? d.roles.slice(0, 10) : [], service: d.service || '', date: d.date, debut: d.debut || '', fin: d.fin || '',
          minutes: Math.round(+d.minutes) || 0, motif: texte(d.motif, 30), commentaire: texte(d.commentaire, 200), le: e.at, statut: 'demande', retenues: null };
        break;
      case 'HEURES_RECUP':
        if (!d.id || st.recups[d.id]) break;
        st.recups[d.id] = { id: d.id, genre: 'recup', agent: e.by, nom: texte(d.nom, 80), roles: Array.isArray(d.roles) ? d.roles.slice(0, 10) : [], service: d.service || '', date: d.date, debut: d.debut || '', fin: d.fin || '',
          minutes: Math.round(+d.minutes) || 0, commentaire: texte(d.commentaire, 200), le: e.at, statut: 'demande' };
        break;
      case 'HEURES_DECISION':
        x = st.declarations[d.declaration];
        if (!x || x.statut !== 'demande' || ['recuperation', 'paiement', 'refuse'].indexOf(d.decision) < 0) break;
        x.statut = d.decision; x.retenues = d.decision === 'refuse' ? 0 : Math.max(0, Math.min(x.minutes, Math.round(+d.minutes) || x.minutes)); x.motifDecision = texte(d.motif, 200); x.decidePar = e.by; x.decideLe = e.at;
        if (x.agent !== e.by) st.avis.push({ id: e.id, agent: x.agent, objet: x.id, statut: d.decision, le: e.at, motif: texte(d.motif, 200) });
        break;
      case 'HEURES_RECUP_DECISION':
        x = st.recups[d.recup];
        if (!x || x.statut !== 'demande' || ['valide', 'refuse'].indexOf(d.decision) < 0) break;
        x.statut = d.decision; x.motifDecision = texte(d.motif, 200); x.decidePar = e.by; x.decideLe = e.at;
        if (x.agent !== e.by) st.avis.push({ id: e.id, agent: x.agent, objet: x.id, statut: d.decision, le: e.at, motif: texte(d.motif, 200) });
        break;
      case 'HEURES_ANNULATION':
        x = st.declarations[d.objet] || st.recups[d.objet];
        if (x && x.statut === 'demande') { x.statut = 'annule'; x.annuleLe = e.at; }
        break;
      case 'HEURES_ENREGISTREE':
        x = st.declarations[d.objet] || st.recups[d.objet];
        if (x && ['recuperation', 'paiement', 'valide'].indexOf(x.statut) >= 0 && !x.gtt) x.gtt = { par: e.by, nom: texte(d.nom, 80), le: e.at };
        break;
      case 'HEURES_CORRECTION':
        if (!d.agent || !/^\d{4}$/.test(String(d.annee))) break;
        (st.corrections[d.agent + '|' + d.annee] = st.corrections[d.agent + '|' + d.annee] || []).push({ minutes: Math.round(+d.minutes) || 0, motif: texte(d.motif, 200), par: e.by, le: e.at });
        break;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'heures', etat: function () { return { declarations: {}, recups: {}, corrections: {}, avis: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function tous(st) { var d = (st && st.declarations) || {}, r = (st && st.recups) || {}; return Object.keys(d).map(function (k) { return d[k]; }).concat(Object.keys(r).map(function (k) { return r[k]; })); }
  function deAgent(st, agent, an) { return tous(st).filter(function (x) { return x.agent === agent && (!an || String(x.date).slice(0, 4) === String(an)); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.le).localeCompare(String(a.le)); }); }
  /**
   * Solde d'heures à récupérer d'un agent pour une année (minutes) : heures acceptées en récupération − récupérations
   * validées (− demandées, pour le disponible) + corrections du validateur. { acquises, recuperees, demandees, corrections, calcule, solde, disponible }.
   */
  function solde(st, agent, an) {
    var l = deAgent(st, agent, an), acq = 0, rec = 0, dem = 0;
    l.forEach(function (x) {
      if (x.genre === 'declaration' && x.statut === 'recuperation') acq += x.retenues || 0;
      if (x.genre === 'recup' && x.statut === 'valide') rec += x.minutes;
      if (x.genre === 'recup' && x.statut === 'demande') dem += x.minutes;
    });
    var cor = ((st && st.corrections && st.corrections[agent + '|' + an]) || []).reduce(function (s, c) { return s + c.minutes; }, 0);
    return { acquises: acq, recuperees: rec, demandees: dem, corrections: cor, calcule: acq - rec, solde: acq - rec + cor, disponible: acq - rec + cor - dem };
  }
  /** Heures payées acceptées pour un agent sur un mois (AAAA-MM), en minutes. */
  function payeesDuMois(st, agent, mois, sauf) { return tous(st).filter(function (x) { return x.genre === 'declaration' && x.agent === agent && x.statut === 'paiement' && String(x.date).slice(0, 7) === mois && x.id !== sauf; }).reduce(function (s, x) { return s + (x.retenues || 0); }, 0); }
  function aValider(st, config, comptes, v) { return tous(st).filter(function (x) { return x.statut === 'demande' && valide(config, v, agentDe(x, comptes)); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }); }
  function aEnregistrer(st, config, roles, services) {
    if (!confirmeGtt(config, roles)) return [];
    return tous(st).filter(function (x) { return ['recuperation', 'paiement', 'valide'].indexOf(x.statut) >= 0 && !x.gtt && (!services || !x.service || services.indexOf(x.service) >= 0); });
  }
  /** Totaux d'une année : par agent, par mois et par motif (minutes acceptées, déclarations seulement). */
  function totaux(st, an, services) {
    var r = { agents: {}, mois: {}, motifs: {} };
    tous(st).forEach(function (x) {
      if (x.genre !== 'declaration' || (x.statut !== 'recuperation' && x.statut !== 'paiement') || String(x.date).slice(0, 4) !== String(an)) return;
      if (services && x.service && services.indexOf(x.service) < 0) return;
      var a = r.agents[x.agent] = r.agents[x.agent] || { agent: x.agent, nom: x.nom, recuperation: 0, paiement: 0 };
      a[x.statut] += x.retenues || 0;
      var mo = String(x.date).slice(5, 7); r.mois[mo] = (r.mois[mo] || 0) + (x.retenues || 0);
      r.motifs[x.motif] = (r.motifs[x.motif] || 0) + (x.retenues || 0);
    });
    return r;
  }
  function lignesExport(liste, config, libService) {
    var o = options(config), ls = libService || function (x) { return x; }, lib = function (c) { var m = o.motifs.filter(function (y) { return y.code === c; })[0]; return m ? m.libelle : c; };
    return [['Agent', 'Service', 'Nature', 'Date', 'Début', 'Fin', 'Durée déclarée', 'Durée retenue', 'Motif', 'État', 'Enregistrée dans le logiciel']].concat(liste.map(function (x) {
      return [x.nom, ls(x.service), x.genre === 'recup' ? 'Récupération' : 'Heures supplémentaires', x.date, x.debut, x.fin, hm(x.minutes), x.genre === 'declaration' && x.retenues !== null ? hm(x.retenues) : '', x.genre === 'declaration' ? lib(x.motif) : '', STATUTS[x.statut], x.gtt ? String(x.gtt.le).slice(0, 10) : ''];
    }));
  }
  function avisPour(st, agent, vus) { var v = vus || []; return ((st && st.avis) || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0; }); }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { declarations: {}, recups: {} }, cfg = (ctx && ctx.config) || {}, moi = ctx && ctx.compte, comptes = (ctx && ctx.comptes) || [], o = options(cfg);
    if (type === 'HEURES_DECLARATION' || type === 'HEURES_RECUP') {
      if (!d.id || (st.declarations || {})[d.id] || (st.recups || {})[d.id]) throw new Error('Saisie déjà enregistrée.');
      if (!JOUR.test(d.date || '')) throw new Error('Indiquez la date.');
      if ((d.debut || d.fin) && (!HEURE.test(d.debut || '') || !HEURE.test(d.fin || ''))) throw new Error('Horaires : heure de début et heure de fin (hh:mm).');
      var min = Math.round(+d.minutes);
      if (!(min >= 1 && min <= 24 * 60)) throw new Error('Indiquez une durée entre 1 minute et 24 heures.');
      if (d.debut && duree(d.debut, d.fin) !== min) throw new Error('La durée ne correspond pas aux horaires.');
      if (String(d.commentaire || '').length > 200) throw new Error('Commentaire trop long (200 caractères au plus).');
      if (type === 'HEURES_DECLARATION' && !o.motifs.some(function (m) { return m.code === d.motif; })) throw new Error('Choisissez le motif.');
      if (type === 'HEURES_RECUP' && moi) { var s = solde(st, moi.id, String(d.date).slice(0, 4)); if (min > s.disponible) throw new Error('Récupération supérieure à votre solde disponible (' + hm(Math.max(0, s.disponible)) + ').'); }
      return;
    }
    if (type === 'HEURES_CORRECTION') {
      if (!d.agent || !/^\d{4}$/.test(String(d.annee))) throw new Error('Agent ou année manquant.');
      if (!(Math.abs(Math.round(+d.minutes)) <= 100000) || !Math.round(+d.minutes)) throw new Error('Indiquez la correction en heures et minutes.');
      if (!texte(d.motif, 200)) throw new Error('Indiquez le motif de la correction.');
      if (moi && !valide(cfg, moi, agentDe({ agent: d.agent, roles: d.roles, service: d.service }, comptes))) throw new Error('Vous ne validez pas les heures de cet agent.');
      return;
    }
    var x = (st.declarations || {})[d.declaration || d.objet] || (st.recups || {})[d.recup || d.objet];
    if (!x) throw new Error('Saisie introuvable.');
    var agent = agentDe(x, comptes);
    if (type === 'HEURES_DECISION' || type === 'HEURES_RECUP_DECISION') {
      if (x.statut !== 'demande') throw new Error('Déjà décidé ou annulé.');
      if (moi && !valide(cfg, moi, agent)) throw new Error('Vous ne validez pas les heures de cet agent.');
      if (d.decision === 'refuse' && !texte(d.motif, 200)) throw new Error('Indiquez le motif du refus.');
      if (type === 'HEURES_RECUP_DECISION' && ['valide', 'refuse'].indexOf(d.decision) < 0) throw new Error('Décision inconnue.');
      if (type === 'HEURES_DECISION') {
        if (['recuperation', 'paiement', 'refuse'].indexOf(d.decision) < 0) throw new Error('Décision inconnue.');
        var ret = d.minutes === undefined ? x.minutes : Math.round(+d.minutes);
        if (d.decision !== 'refuse' && !(ret >= 1 && ret <= x.minutes)) throw new Error('Durée retenue : entre 1 minute et la durée déclarée.');
        if (d.decision === 'paiement') {
          if (!o.paiement) throw new Error('L’établissement n’autorise pas le paiement des heures supplémentaires dans Tessera.');
          if (o.plafondMensuel && payeesDuMois(st, x.agent, String(x.date).slice(0, 7), x.id) + ret > o.plafondMensuel) throw new Error('Plafond mensuel d’heures payées dépassé (' + hm(o.plafondMensuel) + ') : acceptez en récupération, ou en partie.');
        }
      }
      return;
    }
    if (type === 'HEURES_ANNULATION') {
      if (x.statut !== 'demande') throw new Error('Seule une demande pas encore décidée s’annule.');
      if (moi && moi.id !== x.agent) throw new Error('Seul l’agent annule sa demande.');
      return;
    }
    if (type === 'HEURES_ENREGISTREE') {
      if (!o.etapeGtt) throw new Error('Étape non utilisée par l’établissement.');
      if (['recuperation', 'paiement', 'valide'].indexOf(x.statut) < 0) throw new Error('Seule une saisie acceptée s’enregistre dans le logiciel.');
      if (x.gtt) throw new Error('Déjà enregistrée.');
      if (moi && !confirmeGtt(cfg, moi.roles)) throw new Error('Votre rôle ne confirme pas l’enregistrement dans le logiciel de gestion du temps.');
    }
  }
  function permisPourSoi(type, data, compte, ctx) {
    if (!compte || !ctx || ['HEURES_DECISION', 'HEURES_RECUP_DECISION', 'HEURES_ENREGISTREE', 'HEURES_CORRECTION'].indexOf(type) < 0) return false;
    try { controler(type, data, { etat: ctx.etat, config: ctx.config, compte: compte, comptes: ctx.comptes || [] }); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------------ Droits et contrat
  var DECLARER = ['HEURES_DECLARATION', 'HEURES_RECUP', 'HEURES_ANNULATION'], DECIDER = ['HEURES_DECISION', 'HEURES_RECUP_DECISION', 'HEURES_CORRECTION'];
  var ACCES = [
    { code: 'heures.declarer', libelle: 'Déclarer ses heures supplémentaires, demander ses récupérations, annuler une demande', types: DECLARER },
    { code: 'heures.valider', libelle: 'Décider des heures et des récupérations des agents dont on est le validateur ; corriger leur solde', types: DECIDER },
    { code: 'heures.enregistrer', libelle: 'Confirmer l’enregistrement dans le logiciel de gestion du temps (rôles réglés par l’établissement)', types: ['HEURES_ENREGISTREE'] }
  ];
  var DROITS = { IDE: DECLARER, AS: DECLARER, SECRETAIRE: DECLARER.concat(['HEURES_ENREGISTREE']), MEDECIN: DECLARER, CADRE: TYPES.slice(), CADRE_SUP: TYPES.slice(),
    MEDECIN_CHEF_SERVICE: DECLARER.concat(DECIDER), MEDECIN_CHEF_POLE: DECLARER.concat(DECIDER), DIRECTEUR_SOINS: DECLARER.concat(DECIDER) };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: DECIDER.concat(['HEURES_ENREGISTREE']), rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'heures', rolesEncadrement: ['CADRE', 'CADRE_SUP'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.heures : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, x = st && ((st.declarations || {})[d.declaration || d.objet] || (st.recups || {})[d.recup || d.objet]);
    var sv = d.service || (x && x.service);
    return sv ? [sv] : [];
  }
  var contrat = {
    id: 'heures',
    libelle: 'Heures supplémentaires',
    version: '0.1.0',
    icone: 'HS',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'mes-heures', libelle: 'Mes heures' }, { code: 'a-valider', libelle: 'À valider', droit: DECIDER.concat(['HEURES_ENREGISTREE']) }, { code: 'totaux', libelle: 'Totaux', droit: DECIDER.concat(['HEURES_ENREGISTREE']) }] },
    migrations: [],
    fournitures: [],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, STATUTS: STATUTS, MOTIFS_DEFAUT: MOTIFS_DEFAUT, options: options, valide: valide, confirmeGtt: confirmeGtt, agentDe: agentDe,
    duree: duree, hm: hm, lireDuree: lireDuree, solde: solde, deAgent: deAgent, aValider: aValider, aEnregistrer: aEnregistrer, totaux: totaux, payeesDuMois: payeesDuMois, lignesExport: lignesExport,
    avisPour: avisPour, controler: controler, permisPourSoi: permisPourSoi };
});
