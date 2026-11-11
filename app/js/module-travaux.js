// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Demandes de travaux et de réparation — contrat déclaré au registre des modules (0.22.0, demande du porteur du
 * 8 novembre 2026, décisions du 11 novembre 2026).
 *
 * Bons de travaux par service, visibles par tous les agents du service : type de travaux, lieu (liste du service,
 * chambre, précision), gravité, urgence (« immédiate » : appel aux services techniques, numéro réglé pour
 * l'établissement), description sans donnée sur un patient. Suivi : à transmettre → transmise (référence du bon des
 * services techniques, facultative) → programmée (date d'intervention) → réalisée → confirmée par le cadre ; refusée par
 * les services techniques, doublon, annulée, rouverte. Commentaires datés. L'auteur est informé dans sa session quand sa
 * demande est réalisée, confirmée ou rouverte. Chambre indisponible pendant les travaux (option désactivée par défaut) :
 * lue par la Vue d'ensemble (places disponibles), la liste des patients par chambre ; intervention programmée : lue par
 * l'Agenda. Journal `modules\travaux\`, clé propre, activation par service. Aucune donnée clinique.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).travaux = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['TRAVAUX', 'TRAVAUX_ETAPE', 'TRAVAUX_CONFIRMATION', 'TRAVAUX_COMMENTAIRE'];
  // Listes proposées (décisions du porteur du 11 novembre 2026), réglables par l'administrateur et par le cadre pour ses services
  var TYPES_DEFAUT = [['plomberie', 'Plomberie'], ['electricite', 'Électricité'], ['serrurerie', 'Serrurerie'], ['menuiserie', 'Menuiserie'], ['chauffage', 'Chauffage et ventilation'],
    ['informatique', 'Informatique et téléphonie'], ['mobilier', 'Mobilier'], ['nettoyage', 'Nettoyage particulier'], ['autre', 'Autre']].map(function (x) { return { code: x[0], libelle: x[1] }; });
  var GRAVITES_DEFAUT = [{ code: 'gene', libelle: 'Gêne' }, { code: 'degradation', libelle: 'Dégradation' }, { code: 'danger', libelle: 'Danger pour la sécurité' }];
  var URGENCES_DEFAUT = [{ code: 'immediate', libelle: 'Immédiate', appel: true }, { code: 'non', libelle: 'Non urgente' }];
  var LIEUX_DEFAUT = [['soins', 'Salle de soins'], ['office', 'Office'], ['salon', 'Salon'], ['medical', 'Bureau médical'], ['infirmier', 'Bureau infirmier'], ['couloir', 'Couloir'],
    ['sanitaires', 'Sanitaires communs'], ['exterieur', 'Extérieur (cour, jardin)']].map(function (x) { return { code: x[0], libelle: x[1] }; });
  var ETAPES = { transmettre: 'À transmettre', transmise: 'Transmise aux services techniques', programmee: 'Intervention programmée', realisee: 'Réalisée, à confirmer',
    confirmee: 'Réalisée et confirmée', refusee: 'Refusée par les services techniques', doublon: 'Doublon', annulee: 'Annulée', rouverte: 'Rouverte' };
  var OUVERTES = ['transmettre', 'transmise', 'programmee', 'rouverte'];
  var TRAITEES = ['confirmee', 'refusee', 'doublon', 'annulee'];
  // Étapes enregistrées par les rôles qui suivent les demandes, et les états d'où elles partent
  var DEPUIS = { transmise: OUVERTES, programmee: OUVERTES, realisee: OUVERTES, refusee: ['transmise', 'programmee', 'rouverte'], doublon: OUVERTES, annulee: OUVERTES };
  var JOUR = /^\d{4}-\d{2}-\d{2}$/;

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function liste(v, defaut, avecAppel) {
    var vus = {}, l = Array.isArray(v) ? v.filter(function (t) { return t && /^[a-z0-9-]{1,40}$/.test(t.code || '') && texte(t.libelle) && !vus[t.code] && (vus[t.code] = 1); })
      .map(function (t) { var o = { code: t.code, libelle: texte(t.libelle, 80) }; if (avecAppel && t.appel) o.appel = true; return o; }) : [];
    return l.length ? l : defaut.map(function (x) { return Object.assign({}, x); });
  }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /**
   * Réglages (`config.travaux` = { '*': établissement, <service>: ce que le service remplace }) : types, gravités,
   * urgences (`appel` : appel immédiat aux services techniques), lieux, délai d'affichage des demandes traitées (jours),
   * case « chambre indisponible » proposée (désactivée par défaut), nom de l'auteur sur le bon (non par défaut) ;
   * numéro des services techniques : établissement seulement.
   */
  function options(config, service) {
    var v = (config && config.travaux) || {}, et = v['*'] || {}, sv = service && service !== '*' ? v[service] || {} : {}, r = Object.assign({}, et, sv);
    var delai = Math.round(+r.delaiAffichage);
    return {
      types: liste(r.types, TYPES_DEFAUT), gravites: liste(r.gravites, GRAVITES_DEFAUT), urgences: liste(r.urgences, URGENCES_DEFAUT, true), lieux: liste(r.lieux, LIEUX_DEFAUT),
      delaiAffichage: isFinite(delai) && delai >= 0 && delai <= 365 ? delai : 30,
      chambreIndisponible: r.chambreIndisponible === true, salleIndisponible: r.salleIndisponible === true, auteurSurBon: r.auteurSurBon === true,
      telephone: texte(et.telephone, 40)
    };
  }
  function lib(l, code) { var x = (l || []).filter(function (y) { return y.code === code; })[0]; return x ? x.libelle : (code || ''); }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, t;
    switch (e.type) {
      case 'TRAVAUX':
        if (!d.id) break;
        t = st.demandes[d.id];
        if (!t) t = st.demandes[d.id] = { id: d.id, cree: e.at, par: e.by, etat: 'transmettre', etapes: [], commentaires: [], evts: [] };
        ['service', 'type', 'lieu', 'chambre', 'salle', 'salleNom', 'salleIndisponible', 'precisionLieu', 'gravite', 'urgence', 'description', 'chambreIndisponible', 'lits', 'nom'].forEach(function (k) { if (d[k] !== undefined) t[k] = d[k]; });
        t.modifie = e.at; t.evts.push(e.id);
        break;
      case 'TRAVAUX_ETAPE':
        t = st.demandes[d.demande];
        if (!t || !ETAPES[d.etape]) break;
        t.etapes.push({ etape: d.etape, reference: d.reference || '', date: d.date || '', motif: d.motif || '', doublonDe: d.doublonDe || '', par: e.by, le: e.at, evt: e.id });
        t.etat = d.etape;
        if (d.reference) t.reference = d.reference;
        if (d.etape === 'programmee') t.datePrevue = d.date || '';   // gardée ensuite pour l'historique ; l'Agenda ne lit que l'état « programmée »
        if (d.etape === 'doublon') t.doublonDe = d.doublonDe;
        if (TRAITEES.indexOf(d.etape) >= 0) t.traiteeLe = e.at; else delete t.traiteeLe;
        if (d.etape === 'realisee') t.realiseeLe = e.at;
        if (d.etape === 'realisee' && t.par !== e.by) st.avis.push({ id: e.id, agent: t.par, par: e.by, le: e.at, demande: t.id, genre: 'realisee' });
        break;
      case 'TRAVAUX_CONFIRMATION':
        t = st.demandes[d.demande];
        if (!t) break;
        var et = d.rouvrir ? 'rouverte' : 'confirmee';
        t.etapes.push({ etape: et, motif: d.motif || '', par: e.by, le: e.at, evt: e.id });
        t.etat = et;
        if (et === 'confirmee') t.traiteeLe = e.at; else { delete t.traiteeLe; delete t.realiseeLe; }
        if (t.par !== e.by) st.avis.push({ id: e.id, agent: t.par, par: e.by, le: e.at, demande: t.id, genre: et, motif: d.motif || '' });
        break;
      case 'TRAVAUX_COMMENTAIRE':
        t = st.demandes[d.demande];
        if (!t || !d.id) break;
        t.commentaires = t.commentaires.filter(function (c) { return c.id !== d.id; });
        t.commentaires.push({ id: d.id, texte: d.texte || '', par: e.by, le: e.at, evt: e.id });
        break;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'travaux', etat: function () { return { demandes: {}, avis: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function ouverte(t) { return OUVERTES.indexOf(t.etat) >= 0 || t.etat === 'realisee'; }
  function urgente(t, config) { return ouverte(t) && t.etat !== 'realisee' && !!(options(config, t.service).urgences.filter(function (u) { return u.code === t.urgence; })[0] || {}).appel; }
  /**
   * Demandes des services, de la plus récente à la plus ancienne. Sans `historique` : demandes ouvertes ou réalisées à
   * confirmer, et demandes traitées depuis moins que le délai d'affichage du service (`grisee`) ; avec : toutes.
   * `filtre` : { type, lieu, etat: 'ouvertes' | 'traitees' | code d'étape }.
   */
  function demandes(st, config, services, maintenant, o) {
    o = o || {};
    var f = o.filtre || {};
    return Object.keys((st && st.demandes) || {}).map(function (k) { return st.demandes[k]; })
      .filter(function (t) {
        if (services.indexOf(t.service) < 0) return false;
        var traitee = TRAITEES.indexOf(t.etat) >= 0;
        if (!o.historique && traitee && Date.parse(t.traiteeLe) < maintenant - options(config, t.service).delaiAffichage * 864e5) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.lieu && t.lieu !== f.lieu) return false;
        if (f.etat === 'ouvertes' && traitee) return false;
        if (f.etat === 'traitees' && !traitee) return false;
        if (f.etat && f.etat !== 'ouvertes' && f.etat !== 'traitees' && t.etat !== f.etat) return false;
        return true;
      })
      .map(function (t) { return Object.assign({}, t, { traitee: TRAITEES.indexOf(t.etat) >= 0, urgente: urgente(t, config) }); })
      .sort(function (a, b) { return String(b.cree).localeCompare(String(a.cree)); });
  }
  /** Demandes urgentes (appel immédiat) pas encore réalisées, dans les services. */
  function urgentes(st, config, services) {
    return Object.keys((st && st.demandes) || {}).map(function (k) { return st.demandes[k]; }).filter(function (t) { return services.indexOf(t.service) >= 0 && urgente(t, config); });
  }
  /** Informations reçues par l'auteur d'une demande (réalisée, confirmée, rouverte), pas encore vues. */
  function avisPour(st, agent, vus) {
    var v = vus || [];
    return ((st && st.avis) || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0 && st.demandes[a.demande]; });
  }
  /** Chambres indisponibles pendant des travaux (demande ouverte avec la case cochée) : [{ service, chambre, lits, demande }]. */
  function chambresIndisponibles(st, services, config) {
    return Object.keys((st && st.demandes) || {}).map(function (k) { return st.demandes[k]; })
      .filter(function (t) { return (!services || services.indexOf(t.service) >= 0) && t.chambreIndisponible && t.chambre && ouverte(t) && (!config || options(config, t.service).chambreIndisponible); })
      .map(function (t) { return { service: t.service, chambre: String(t.chambre), lits: Math.max(1, Math.round(+t.lits || 1)), demande: t.id, type: t.type }; });
  }
  /** Interventions programmées entre deux jours (ISO, inclus), pour les demandes encore ouvertes. */
  function interventions(st, services, debut, fin) {
    return Object.keys((st && st.demandes) || {}).map(function (k) { return st.demandes[k]; })
      .filter(function (t) { return services.indexOf(t.service) >= 0 && t.etat === 'programmee' && t.datePrevue && t.datePrevue >= debut && t.datePrevue <= fin; })
      .map(function (t) { return { demande: t.id, service: t.service, jour: t.datePrevue, type: t.type, lieu: t.lieu, chambre: t.chambre || '', precisionLieu: t.precisionLieu || '' }; });
  }
  /**
   * Salles et bureaux indisponibles pendant des travaux (0.25.1 : demande ouverte sur une salle, case cochée, case
   * proposée par le réglage du service, désactivée par défaut) : [{ salle, demande, type, service, depuis }], lu par Salles.
   */
  function sallesIndisponibles(st, config) {
    return Object.keys(st.demandes).map(function (k) { return st.demandes[k]; })
      .filter(function (t) { return t.lieu === 'salle' && t.salle && t.salleIndisponible && ouverte(t) && (!config || options(config, t.service).salleIndisponible); })
      .map(function (t) { return { salle: t.salle, demande: t.id, type: t.type, service: t.service, depuis: t.cree, titre: lib(options(config || {}, t.service).types, t.type) || 'Travaux' }; });
  }
  /** Lieu en clair : « Chambre 12 », « Salle de soins — robinet du fond ». */
  function libLieu(t, config) {
    var o = options(config, t.service), l = t.lieu === 'chambre' ? 'Chambre ' + (t.chambre || '?') : t.lieu === 'salle' ? (t.salleNom || 'Salle') : lib(o.lieux, t.lieu) || (t.lieu === 'autre' ? 'Autre lieu' : '');
    return [l, t.precisionLieu || ''].filter(Boolean).join(' — ');
  }

  // ------------------------------------------------------------ Contrôles
  /** Contrôle avant l'enregistrement : champs d'une demande, étape permise depuis l'état en cours, motifs obligatoires. */
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { demandes: {} }, t;
    if (type === 'TRAVAUX') {
      t = st.demandes[d.id];
      if (!t && !d.service) throw new Error('Indiquez le service.');
      if (!t || d.type !== undefined) { if (!texte(d.type)) throw new Error('Choisissez le type de travaux.'); }
      if (!t || d.lieu !== undefined) { if (!texte(d.lieu)) throw new Error('Indiquez le lieu.'); if (d.lieu === 'salle' && !texte(d.salle)) throw new Error('Choisissez la salle ou le bureau.'); if (d.lieu === 'chambre' && !texte(d.chambre)) throw new Error('Indiquez le numéro de la chambre.'); }
      if (!t || d.urgence !== undefined) { if (!texte(d.urgence)) throw new Error('Indiquez l’urgence.'); }
      if (!t || d.description !== undefined) { if (!texte(d.description, 2000)) throw new Error('Décrivez le problème en quelques mots.'); }
      if (d.description !== undefined && String(d.description).length > 2000) throw new Error('Description trop longue (2 000 caractères au plus).');
      if (t && TRAITEES.indexOf(t.etat) >= 0) throw new Error('Cette demande est traitée : rouvrez-la pour la modifier.');
      return;
    }
    t = st.demandes[d.demande];
    if (!t) throw new Error('Demande introuvable.');
    if (type === 'TRAVAUX_ETAPE') {
      if (!DEPUIS[d.etape]) throw new Error('Étape inconnue.');
      if (DEPUIS[d.etape].indexOf(t.etat) < 0) throw new Error('Étape « ' + ETAPES[d.etape] + ' » impossible : la demande est « ' + ETAPES[t.etat] + ' ».');
      if (d.etape === 'programmee' && !JOUR.test(d.date || '')) throw new Error('Indiquez la date de l’intervention.');
      if ((d.etape === 'refusee' || d.etape === 'annulee') && !texte(d.motif)) throw new Error('Indiquez le motif.');
      if (d.etape === 'doublon') { var p = st.demandes[d.doublonDe]; if (!p || p.id === t.id) throw new Error('Choisissez la demande dont celle-ci est le doublon.'); }
      return;
    }
    if (type === 'TRAVAUX_CONFIRMATION') {
      if (d.rouvrir) {
        if (['realisee', 'confirmee', 'refusee'].indexOf(t.etat) < 0) throw new Error('Seule une demande réalisée, confirmée ou refusée se rouvre.');
        if (!texte(d.motif)) throw new Error('Indiquez pourquoi la demande est rouverte.');
      } else if (t.etat !== 'realisee') throw new Error('Seule une demande réalisée se confirme.');
    }
    if (type === 'TRAVAUX_COMMENTAIRE' && !texte(d.texte, 1000)) throw new Error('Commentaire vide.');
  }
  /** L'auteur annule sa propre demande tant qu'elle est ouverte, sans l'accès « suivre les demandes ». */
  function permisPourSoi(type, data, compte, ctx) {
    if (type !== 'TRAVAUX_ETAPE' || !compte || !data || data.etape !== 'annulee' || !ctx || !ctx.etat) return false;
    var t = ctx.etat.demandes && ctx.etat.demandes[data.demande];
    return !!t && t.par === compte.id;
  }
  /**
   * Réglages écrits par le cadre (`config.travaux`) : seulement ceux de ses services ; les réglages de l'établissement
   * (dont le numéro des services techniques) restent à l'administrateur.
   */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'travaux.consulter', libelle: 'Consulter les demandes de travaux du service', types: [] },
    { code: 'travaux.signaler', libelle: 'Faire une demande de travaux, la compléter, la commenter', types: ['TRAVAUX', 'TRAVAUX_COMMENTAIRE'] },
    { code: 'travaux.suivre', libelle: 'Suivre les demandes : transmettre aux services techniques, programmer, marquer réalisée, refusée, doublon ou annulée', types: ['TRAVAUX_ETAPE'] },
    { code: 'travaux.confirmer', libelle: 'Confirmer la réalisation d’une demande ou la rouvrir', types: ['TRAVAUX_CONFIRMATION'] }
  ];
  // Droits proposés (décision du porteur du 11 novembre 2026) : tous signalent ; secrétaire et cadre suivent ; le cadre confirme
  var DROITS = {
    IDE: ['TRAVAUX', 'TRAVAUX_COMMENTAIRE'],
    AS: ['TRAVAUX', 'TRAVAUX_COMMENTAIRE'],
    SECRETAIRE: ['TRAVAUX', 'TRAVAUX_COMMENTAIRE', 'TRAVAUX_ETAPE'],
    CADRE: TYPES.slice()
  };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'travaux', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.travaux : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, t = e.type === 'TRAVAUX' ? null : st && st.demandes && st.demandes[d.demande];
    var sv = d.service || (t && t.service) || (e.type === 'TRAVAUX' && st && st.demandes && st.demandes[d.id] && st.demandes[d.id].service);
    return sv ? [sv] : [];
  }

  var contrat = {
    id: 'travaux',
    libelle: 'Demandes de travaux',
    version: '0.1.0',
    icone: 'TR',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi,
      services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { travaux: controlerCadre } },
    vues: { onglets: [{ code: 'demandes', libelle: 'Demandes' }, { code: 'historique', libelle: 'Historique' }] },
    migrations: [],
    fournitures: [
      // Lue par la Vue d'ensemble (places disponibles) et la liste des patients par chambre
      { nom: 'travaux.chambres', version: 1, acces: 'lecture', champs: ['service', 'chambre', 'lits', 'demande', 'type'],
        lire: function (st, o) { return chambresIndisponibles(st, o && o.services, o && o.config); } },
      // Lue par l'Agenda : interventions programmées
      // Lue par Salles et bureaux (0.25.1) : salles indisponibles pendant des travaux
      { nom: 'travaux.salles', version: 1, acces: 'lecture', champs: ['salle', 'demande', 'type', 'service', 'depuis', 'titre'], lire: function (st, o) { return sallesIndisponibles(st, o && o.config); } },
      { nom: 'travaux.interventions', version: 1, acces: 'lecture', champs: ['demande', 'service', 'jour', 'type', 'lieu', 'chambre', 'precisionLieu'],
        lire: function (st, o) { return interventions(st, o.services, o.debut, o.fin); } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, ETAPES: ETAPES, OUVERTES: OUVERTES, TRAITEES: TRAITEES, DEPUIS: DEPUIS,
    TYPES_DEFAUT: TYPES_DEFAUT, GRAVITES_DEFAUT: GRAVITES_DEFAUT, URGENCES_DEFAUT: URGENCES_DEFAUT, LIEUX_DEFAUT: LIEUX_DEFAUT,
    options: options, lib: lib, libLieu: libLieu, demandes: demandes, urgentes: urgentes, urgente: urgente, ouverte: ouverte, avisPour: avisPour,
    chambresIndisponibles: chambresIndisponibles, sallesIndisponibles: sallesIndisponibles, interventions: interventions, controler: controler, controlerCadre: controlerCadre, jourISO: jourISO };
});
