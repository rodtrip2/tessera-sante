// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Formations — contrat déclaré au registre des modules (lot C, phase 4 du plan d'action du porteur,
 * 14 novembre 2026 ; décision : module propre).
 *
 * Le cadre (ses services) ou l'administrateur (établissement) renseigne les **formations ouvertes à l'inscription**
 * (intitulé, dates, lieu, nombre de places, public visé, date limite) ; les agents **s'inscrivent** ; le validateur de
 * l'agent (règle des Congés : cadre pour les IDE, AS et secrétaires, cadre supérieur pour les cadres…) **valide, refuse
 * ou met sur liste d'attente** ; une place libérée (désistement, refus après validation) est **proposée au suivant** de
 * la liste. Étape « Enregistré dans le logiciel de gestion du temps » (désactivable), confirmée par les rôles choisis
 * par l'établissement. Tableau annuel des départs ; départs validés visibles dans l'Agenda comme des absences.
 * Données du personnel : fonction **soumise à avis** (délégué à la protection des données, ressources humaines),
 * livrée désactivée (onglet « Validations »). Journal `modules\formations\`, clé propre. Aucune donnée de santé.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).formations = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['FORMATION_SESSION', 'FORMATION_INSCRIPTION', 'FORMATION_DECISION', 'FORMATION_DESISTEMENT', 'FORMATION_ENREGISTREE'];
  var JOUR = /^\d{4}-\d{2}-\d{2}$/;
  var STATUTS = { demande: 'Demandée, à valider', valide: 'Validée', attente: 'Liste d’attente', refuse: 'Refusée', desiste: 'Désistement' };
  var VALIDATEURS_DEFAUT = { IDE: 'CADRE', AS: 'CADRE', SECRETAIRE: 'CADRE', CADRE: 'CADRE_SUP', CADRE_SUP: 'DIRECTEUR_SOINS', MEDECIN: 'MEDECIN_CHEF_SERVICE', MEDECIN_CHEF_SERVICE: 'MEDECIN_CHEF_POLE', '*': 'CADRE' };
  var PRESEANCE = ['DIRECTEUR_SOINS', 'MEDECIN_CHEF_POLE', 'MEDECIN_CHEF_SERVICE', 'MEDECIN', 'CADRE_SUP', 'CADRE', 'SECRETAIRE', 'IDE', 'AS'];
  var TOUS_SERVICES = ['DIRECTEUR_SOINS', 'ADMIN'];

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }

  // ------------------------------------------------------------ Réglages
  /**
   * `config.formations` : { etapeGtt (oui par défaut), rolesGtt (rôles qui confirment l'enregistrement dans le logiciel
   * de gestion du temps : cadre et secrétaire par défaut), validateurs (comme les Congés, sinon ceux du module Congés) }.
   */
  function options(config) {
    var f = (config && config.formations) || {}, cg = (config && config.conges && config.conges.validateurs) || null;
    var roles = Array.isArray(f.rolesGtt) ? f.rolesGtt.filter(function (r) { return typeof r === 'string' && r; }) : ['CADRE', 'SECRETAIRE'];
    return { etapeGtt: f.etapeGtt !== false, rolesGtt: roles.length ? roles : ['CADRE'], validateurs: Object.assign({}, VALIDATEURS_DEFAUT, cg || {}, f.validateurs || {}) };
  }
  function rolePrincipal(roles) { roles = roles || []; return PRESEANCE.filter(function (r) { return roles.indexOf(r) >= 0; })[0] || roles[0] || ''; }
  /** Le compte `v` décide-t-il des inscriptions de l'agent `a` : rôle validateur, service commun (ou tous), jamais lui-même. */
  function valide(config, v, a) {
    if (!v || !a || v.id === a.id) return false;
    var vs = options(config).validateurs, r = vs[rolePrincipal(a.roles)] || vs['*'] || 'CADRE', rv = v.roles || [];
    if (rv.indexOf('ADMIN') >= 0) return true;
    if (rv.indexOf(r) < 0) return false;
    if (TOUS_SERVICES.indexOf(r) >= 0) return true;
    return (v.services || []).some(function (s) { return (a.services || []).indexOf(s) >= 0; });
  }
  function confirmeGtt(config, roles) { var o = options(config); return o.etapeGtt && (roles || []).some(function (r) { return r === 'ADMIN' || o.rolesGtt.indexOf(r) >= 0; }); }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, s, i;
    switch (e.type) {
      case 'FORMATION_SESSION':
        if (!d.id) break;
        s = st.sessions[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['intitule', 'debut', 'fin', 'lieu', 'places', 'public', 'service', 'limite', 'precision', 'annulee'].forEach(function (k) { if (d[k] !== undefined) s[k] = d[k]; });
        s.modifie = e.at;
        st.sessions[d.id] = s;
        break;
      case 'FORMATION_INSCRIPTION':
        if (!d.id || st.inscriptions[d.id] || !st.sessions[d.session]) break;
        st.inscriptions[d.id] = { id: d.id, session: d.session, agent: e.by, nom: texte(d.nom, 80), roles: Array.isArray(d.roles) ? d.roles.slice(0, 10) : [], service: d.service || '', commentaire: texte(d.commentaire, 300), le: e.at, statut: 'demande', historique: [] };
        break;
      case 'FORMATION_DECISION':
        i = st.inscriptions[d.inscription];
        if (!i || !STATUTS[d.decision] || d.decision === 'demande' || d.decision === 'desiste') break;
        i.statut = d.decision; i.motif = texte(d.motif, 300); i.decidePar = e.by; i.decideLe = e.at;
        if (d.decision === 'attente') i.attenteLe = i.attenteLe || e.at; else delete i.attenteLe;
        i.historique.push({ statut: d.decision, par: e.by, nom: texte(d.nom, 80), le: e.at, motif: texte(d.motif, 300) });
        if (i.agent !== e.by) st.avis.push({ id: e.id, agent: i.agent, inscription: i.id, statut: d.decision, le: e.at, motif: texte(d.motif, 300) });
        break;
      case 'FORMATION_DESISTEMENT':
        i = st.inscriptions[d.inscription];
        if (!i || i.statut === 'desiste') break;
        i.statutAvant = i.statut; i.statut = 'desiste'; i.historique.push({ statut: 'desiste', par: e.by, nom: texte(d.nom, 80), le: e.at, motif: texte(d.motif, 300) });
        delete i.attenteLe;
        break;
      case 'FORMATION_ENREGISTREE':
        i = st.inscriptions[d.inscription];
        if (!i || i.statut !== 'valide') break;
        i.gtt = { par: e.by, nom: texte(d.nom, 80), le: e.at };
        break;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'formations', etat: function () { return { sessions: {}, inscriptions: {}, avis: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function inscriptionsDe(st, session) { return Object.keys((st && st.inscriptions) || {}).map(function (k) { return st.inscriptions[k]; }).filter(function (i) { return i.session === session; }); }
  /** Places : { places, validees, libres, attente: [inscriptions dans l'ordre de la liste d'attente] }. */
  function places(st, session) {
    var s = st.sessions[session] || {}, l = inscriptionsDe(st, session), n = Math.max(0, Math.round(+s.places) || 0);
    var val = l.filter(function (i) { return i.statut === 'valide'; }).length;
    var att = l.filter(function (i) { return i.statut === 'attente'; }).sort(function (a, b) { return String(a.attenteLe).localeCompare(String(b.attenteLe)) || String(a.le).localeCompare(String(b.le)); });
    return { places: n, validees: val, libres: n ? Math.max(0, n - val) : null, attente: att };
  }
  function rang(st, insc) { var p = places(st, insc.session); var k = p.attente.indexOf(insc); return k >= 0 ? k + 1 : null; }
  /** Places libérées proposées au suivant : sessions à venir avec des places libres et une liste d'attente. */
  function propositions(st, aujourdhui) {
    return Object.keys((st && st.sessions) || {}).map(function (k) { return st.sessions[k]; }).filter(function (s) { return !s.annulee && (!aujourdhui || String(s.debut) >= aujourdhui); })
      .map(function (s) { var p = places(st, s.id); return p.libres && p.attente.length ? { session: s, suivant: p.attente[0], libres: p.libres } : null; }).filter(Boolean);
  }
  /** Sessions ouvertes à l'inscription d'un agent (services : les siens ; '' : établissement), à venir, non annulées. */
  function ouvertes(st, services, aujourdhui) {
    return Object.keys((st && st.sessions) || {}).map(function (k) { return st.sessions[k]; })
      .filter(function (s) { return !s.annulee && String(s.debut) >= (aujourdhui || '') && (!s.service || (services || []).indexOf(s.service) >= 0); })
      .sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
  }
  /** Agent d'une inscription : son compte, sinon les rôles et le service notés à l'inscription. */
  function agentDe(i, comptes) { return (comptes || []).filter(function (c) { return c.id === i.agent; })[0] || { id: i.agent, roles: i.roles || [], services: i.service ? [i.service] : [] }; }
  function inscriptionsAgent(st, agent) { return Object.keys((st && st.inscriptions) || {}).map(function (k) { return st.inscriptions[k]; }).filter(function (i) { return i.agent === agent; }); }
  /** À décider par le compte `v` (comptes : pour retrouver l'agent). */
  function aDecider(st, config, comptes, v) {
    return Object.keys((st && st.inscriptions) || {}).map(function (k) { return st.inscriptions[k]; }).filter(function (i) { var s = st.sessions[i.session]; return i.statut === 'demande' && s && !s.annulee && valide(config, v, agentDe(i, comptes)); });
  }
  function aEnregistrer(st, config, roles, services) {
    if (!confirmeGtt(config, roles)) return [];
    return Object.keys((st && st.inscriptions) || {}).map(function (k) { return st.inscriptions[k]; }).filter(function (i) { return i.statut === 'valide' && !i.gtt && (!services || !i.service || services.indexOf(i.service) >= 0); });
  }
  /** Départs en formation validés (absences lues par l'Agenda) : { id, agent, nom, debut, fin (ms), categorie, service, source }. */
  function departs(st, debut, fin) {
    return Object.keys((st && st.inscriptions) || {}).map(function (k) { return st.inscriptions[k]; }).filter(function (i) { return i.statut === 'valide'; }).map(function (i) {
      var s = st.sessions[i.session]; if (!s || s.annulee || !JOUR.test(s.debut || '')) return null;
      var p = s.debut.split('-'), q = (JOUR.test(s.fin || '') ? s.fin : s.debut).split('-');
      return { id: 'fo-' + i.id, agent: i.agent, nom: i.nom, debut: new Date(+p[0], +p[1] - 1, +p[2]).getTime(), fin: new Date(+q[0], +q[1] - 1, +q[2] + 1).getTime() - 1, categorie: 'formation', service: i.service, source: 'formations', titre: s.intitule };
    }).filter(function (a) { return a && a.debut < fin && a.fin >= debut; });
  }
  /** Tableau annuel des départs : { agents: [{ agent, nom, mois: [[{ inscription, session }]×12] }] } (formations validées). */
  function tableauAnnuel(st, an, services) {
    var res = {};
    Object.keys((st && st.inscriptions) || {}).forEach(function (k) {
      var i = st.inscriptions[k], s = st.sessions[i.session];
      if (i.statut !== 'valide' || !s || s.annulee || String(s.debut).slice(0, 4) !== String(an)) return;
      if (services && i.service && services.indexOf(i.service) < 0) return;
      var r = res[i.agent] = res[i.agent] || { agent: i.agent, nom: i.nom, mois: [[], [], [], [], [], [], [], [], [], [], [], []] };
      r.mois[+String(s.debut).slice(5, 7) - 1].push({ inscription: i, session: s });
    });
    return Object.keys(res).map(function (k) { return res[k]; }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
  }
  function avisPour(st, agent, vus) { var v = vus || []; return ((st && st.avis) || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0; }); }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { sessions: {}, inscriptions: {} }, cfg = (ctx && ctx.config) || {}, moi = ctx && ctx.compte, comptes = (ctx && ctx.comptes) || [];
    var roles = (moi && moi.roles) || [];
    if (type === 'FORMATION_SESSION') {
      var ex = st.sessions[d.id];
      if (!d.id) throw new Error('Formation sans identifiant.');
      if (!ex && !texte(d.intitule)) throw new Error('Indiquez l’intitulé de la formation.');
      var deb = d.debut !== undefined ? d.debut : ex && ex.debut, fin = d.fin !== undefined ? d.fin : ex && ex.fin;
      if (!JOUR.test(deb || '')) throw new Error('Indiquez la date de début.');
      if (fin && (!JOUR.test(fin) || fin < deb)) throw new Error('La date de fin précède la date de début.');
      if (d.places !== undefined && d.places !== null && d.places !== '' && !(Math.round(+d.places) >= 0 && +d.places <= 500)) throw new Error('Nombre de places : de 0 (sans limite) à 500.');
      var sv = d.service !== undefined ? d.service : ex && ex.service;
      if (roles.indexOf('ADMIN') < 0 && (!sv || (moi.services || []).indexOf(sv) < 0)) throw new Error('Le cadre renseigne les formations de ses services ; l’administrateur, celles de l’établissement.');
      return;
    }
    if (type === 'FORMATION_INSCRIPTION') {
      var s = st.sessions[d.session];
      if (!d.id || st.inscriptions[d.id]) throw new Error('Inscription déjà enregistrée.');
      if (!s || s.annulee) throw new Error('Formation introuvable ou annulée.');
      var auj = (ctx && ctx.aujourdhui) || (function () { var x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })();
      if (s.limite && JOUR.test(s.limite) && auj > s.limite) throw new Error('La date limite d’inscription est passée.');
      if (moi && Object.keys(st.inscriptions).some(function (k) { var i = st.inscriptions[k]; return i.session === d.session && i.agent === moi.id && i.statut !== 'desiste' && i.statut !== 'refuse'; })) throw new Error('Vous êtes déjà inscrit(e) à cette formation.');
      if (String(d.commentaire || '').length > 300) throw new Error('Commentaire trop long (300 caractères au plus).');
      return;
    }
    var i = st.inscriptions[d.inscription];
    if (!i) throw new Error('Inscription introuvable.');
    var agent = agentDe(i, comptes);
    if (type === 'FORMATION_DECISION') {
      if (['valide', 'attente', 'refuse'].indexOf(d.decision) < 0) throw new Error('Décision inconnue.');
      if (i.statut === 'desiste') throw new Error('L’agent s’est désisté.');
      if (moi && !valide(cfg, moi, agent)) throw new Error('Vous ne validez pas les formations de cet agent.');
      if (d.decision === 'refuse' && !texte(d.motif, 300)) throw new Error('Indiquez le motif du refus.');
      if (d.decision === 'valide' && i.statut !== 'valide') { var p = places(st, i.session); if (p.places && p.validees >= p.places) throw new Error('Plus de place : mettez l’agent sur liste d’attente, ou augmentez le nombre de places.'); }
      return;
    }
    if (type === 'FORMATION_DESISTEMENT') {
      if (i.statut === 'desiste') throw new Error('Désistement déjà enregistré.');
      if (moi && moi.id !== i.agent && !valide(cfg, moi, agent)) throw new Error('Seul l’agent ou son validateur enregistre un désistement.');
      return;
    }
    if (type === 'FORMATION_ENREGISTREE') {
      if (!options(cfg).etapeGtt) throw new Error('Étape non utilisée par l’établissement.');
      if (i.statut !== 'valide') throw new Error('Seule une inscription validée s’enregistre dans le logiciel de gestion du temps.');
      if (i.gtt) throw new Error('Déjà enregistrée.');
      if (moi && !confirmeGtt(cfg, roles)) throw new Error('Votre rôle ne confirme pas l’enregistrement dans le logiciel de gestion du temps.');
    }
  }
  /** Saisies permises hors des droits du rôle : décision par le validateur réglé, enregistrement par les rôles choisis. */
  function permisPourSoi(type, data, compte, ctx) {
    if (!compte || !ctx) return false;
    if (type !== 'FORMATION_DECISION' && type !== 'FORMATION_DESISTEMENT' && type !== 'FORMATION_ENREGISTREE') return false;
    try { controler(type, data, { etat: ctx.etat, config: ctx.config, compte: compte, comptes: ctx.comptes || [] }); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'formations.inscrire', libelle: 'S’inscrire aux formations ouvertes, se désister', types: ['FORMATION_INSCRIPTION', 'FORMATION_DESISTEMENT'] },
    { code: 'formations.gerer', libelle: 'Renseigner les formations ouvertes de ses services ; décider des inscriptions des agents dont on est le validateur', types: ['FORMATION_SESSION', 'FORMATION_DECISION', 'FORMATION_ENREGISTREE'] }
  ];
  var INSCRIRE = ['FORMATION_INSCRIPTION', 'FORMATION_DESISTEMENT'];
  var DROITS = { IDE: INSCRIRE, AS: INSCRIRE, SECRETAIRE: INSCRIRE.concat(['FORMATION_ENREGISTREE']), MEDECIN: INSCRIRE, CADRE: TYPES.slice(), CADRE_SUP: TYPES.slice(), MEDECIN_CHEF_SERVICE: INSCRIRE.concat(['FORMATION_DECISION']), MEDECIN_CHEF_POLE: INSCRIRE.concat(['FORMATION_DECISION']), DIRECTEUR_SOINS: INSCRIRE.concat(['FORMATION_DECISION']) };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: ['FORMATION_SESSION', 'FORMATION_DECISION', 'FORMATION_ENREGISTREE'], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'formations', rolesEncadrement: ['CADRE', 'CADRE_SUP'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.formations : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, i = d.inscription && st && st.inscriptions ? st.inscriptions[d.inscription] : null, s = st && st.sessions ? st.sessions[d.session || d.id] : null;
    var sv = d.service || (i && i.service) || (s && s.service);
    return sv ? [sv] : [];
  }
  /** Réglages par le cadre : aucun (établissement : administrateur) ; les formations ouvertes sont des saisies. */
  var contrat = {
    id: 'formations',
    libelle: 'Formations',
    version: '0.1.0',
    icone: 'FO',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'ouvertes', libelle: 'Formations ouvertes' }, { code: 'miennes', libelle: 'Mes inscriptions' }, { code: 'decider', libelle: 'Inscriptions à décider', droit: ['FORMATION_DECISION', 'FORMATION_ENREGISTREE'] }, { code: 'tableau', libelle: 'Tableau annuel' }] },
    migrations: [],
    fournitures: [{ nom: 'formations.departs', version: 1, acces: 'lecture', champs: ['agent', 'nom', 'debut', 'fin', 'service'], lire: function (st, o) { return departs(st, o.debut, o.fin); } }],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, STATUTS: STATUTS, options: options, valide: valide, confirmeGtt: confirmeGtt,
    agentDe: agentDe, places: places, rang: rang, propositions: propositions, ouvertes: ouvertes, inscriptionsAgent: inscriptionsAgent, inscriptionsDe: inscriptionsDe, aDecider: aDecider, aEnregistrer: aEnregistrer,
    departs: departs, tableauAnnuel: tableauAnnuel, avisPour: avisPour, controler: controler, permisPourSoi: permisPourSoi };
});
