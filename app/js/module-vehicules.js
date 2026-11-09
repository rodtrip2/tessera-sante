// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Véhicules de l'établissement — contrat déclaré au registre des modules (décision du porteur du 8 novembre 2026).
 *
 * Parc des véhicules (automobile, minibus…) : caractéristiques (places, immatriculation, parking, données ajoutées par
 * l'administrateur), service d'affectation, prêt à un autre service ou mise à disposition pour la réservation pendant une
 * période, réservations (directes, ou depuis un événement de l'Agenda, après vérification de la disponibilité),
 * signalements (faire le plein, voyant allumé, à nettoyer…). Aucune donnée clinique. Journal `modules\vehicules\`, clé
 * propre, activation par service. L'Agenda lit les disponibilités à la volée (fourniture `vehicules.disponibles`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).vehicules = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['VEHICULE', 'PRET', 'RESERVATION', 'SIGNALEMENT', 'SIGNALEMENT_FAIT'];
  var TYPES_VEHICULE_DEFAUT = [{ code: 'automobile', libelle: 'Automobile' }, { code: 'minibus', libelle: 'Minibus' }, { code: 'utilitaire', libelle: 'Utilitaire' }, { code: 'adapte', libelle: 'Véhicule adapté (fauteuil)' }];
  var TYPES_SIGNALEMENT_DEFAUT = [{ code: 'plein', libelle: 'Faire le plein' }, { code: 'voyant', libelle: 'Voyant allumé' }, { code: 'nettoyage', libelle: 'À nettoyer' },
    { code: 'entretien', libelle: 'Entretien ou contrôle à prévoir' }, { code: 'degat', libelle: 'Dégât ou anomalie constatée' }, { code: 'info', libelle: 'Information' }];
  var MODES_PRET = { pret: 'Prêt (réservé au service emprunteur)', partage: 'Mise à disposition (réservable aussi par d’autres services)' };
  var STATUTS = { ferme: 'Réservation', pre: 'Pré-réservation' };
  var TYPES_CHAMP = { ouiNon: 'Oui ou non', texte: 'Texte court', liste: 'Liste de choix', date: 'Date', nombre: 'Nombre' };

  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function depuisISO(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function plusJours(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }

  function liste(v, defaut) {
    var l = Array.isArray(v) ? v.filter(function (t) { return t && t.code && String(t.libelle || '').trim(); }).map(function (t) { return { code: String(t.code).slice(0, 40), libelle: String(t.libelle).trim().slice(0, 80) }; }) : [];
    return l.length ? l : defaut.slice();
  }
  /**
   * Réglages (`config.vehicules`) : types de véhicules, types de signalements, données ajoutées aux véhicules
   * ({ id, libelle, type, choix, actif }), comme les données complémentaires de la fiche patient.
   */
  function options(config) {
    var v = (config && config.vehicules) || {};
    var champs = (Array.isArray(v.champs) ? v.champs : []).filter(function (c) { return c && /^[a-z][a-z0-9-]{1,30}$/.test(c.id || '') && String(c.libelle || '').trim() && TYPES_CHAMP[c.type]; })
      .map(function (c) { return { id: c.id, libelle: String(c.libelle).trim().slice(0, 60), type: c.type, choix: c.type === 'liste' && Array.isArray(c.choix) ? c.choix.map(String).filter(Boolean) : [], actif: c.actif !== false }; });
    return { types: liste(v.types, TYPES_VEHICULE_DEFAUT), signalements: liste(v.signalements, TYPES_SIGNALEMENT_DEFAUT), champs: champs };
  }
  // Contrôle et affichage des valeurs : mécanisme commun des champs ajoutés (champs.js, 0.18.0), types d'origine
  function CH() { return (typeof self !== 'undefined' && self.SIC && self.SIC.champs) || require('./champs.js'); }
  function valeurChamp(c, v) { return CH().valeur(c, v); }
  function libValeur(c, v) { return CH().lib(c, v); }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {};
    switch (e.type) {
      case 'VEHICULE':
        if (!d.id) break;
        var v = st.vehicules[d.id] || { id: d.id, cree: e.at, par: e.by, evts: [] };
        ['type', 'nom', 'immatriculation', 'places', 'parking', 'service', 'complements', 'precision', 'actif', 'supprime'].forEach(function (k) { if (d[k] !== undefined) v[k] = d[k]; });
        v.evts.push(e.id);
        st.vehicules[d.id] = v;
        break;
      case 'PRET':
        if (!d.id) break;
        var p = st.prets[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['vehicule', 'mode', 'services', 'debut', 'fin', 'motif', 'supprime'].forEach(function (k) { if (d[k] !== undefined) p[k] = d[k]; });
        st.prets[d.id] = p;
        break;
      case 'RESERVATION':
        if (!d.id) break;
        var r = st.reservations[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['vehicule', 'debut', 'fin', 'service', 'agent', 'nom', 'motif', 'lien', 'annulee', 'statut'].forEach(function (k) { if (d[k] !== undefined) r[k] = d[k]; });
        if (d.annulee) r.annulation = { par: e.by, le: e.at, motif: d.motifAnnulation || '' };
        st.reservations[d.id] = r;
        // Réservation forcée sur une pré-réservation (décision du porteur du 8 novembre 2026) : la pré-réservation est
        // remplacée ; son auteur et les destinataires réglés pour son service (vehiculesInformation) en sont informés
        if (Array.isArray(d.supplante) && !d.annulee) d.supplante.forEach(function (id) {
          var pre = st.reservations[id];
          if (!pre || pre.statut !== 'pre' || pre.annulee || pre.supplantee || id === d.id) return;
          pre.supplantee = { reservation: d.id, par: e.by, le: e.at, nom: r.nom || '', service: r.service };
          st.avis.push({ id: e.id + '|' + id, pre: id, reservation: d.id, le: e.at, par: e.by });
        });
        break;
      case 'SIGNALEMENT':
        if (!d.id) break;
        var s = st.signalements[d.id] || { id: d.id, cree: e.at, par: e.by, fait: null };
        ['vehicule', 'type', 'texte', 'supprime'].forEach(function (k) { if (d[k] !== undefined) s[k] = d[k]; });
        st.signalements[d.id] = s;
        break;
      case 'SIGNALEMENT_FAIT':
        if (st.signalements[d.signalement]) st.signalements[d.signalement].fait = d.annule ? null : { par: e.by, le: e.at, precision: d.precision || '' };
        break;
    }
  }
  function reduire(evts) {
    return N.reduire(evts, { etat: function () { return { vehicules: {}, prets: {}, reservations: {}, signalements: {}, avis: [] }; }, appliquer: appliquer });
  }

  // ------------------------------------------------------------ Disponibilité
  function libelleVehicule(v) { return v ? ((v.nom || 'Véhicule') + (v.immatriculation ? ' (' + v.immatriculation + ')' : '')) : 'Véhicule'; }
  /** Prêts et mises à disposition en vigueur d'un véhicule qui chevauchent [debut, fin[ (jours entiers, fin comprise). */
  function pretsDe(st, vehicule, debut, fin) {
    return Object.keys(st.prets).map(function (k) { return st.prets[k]; }).filter(function (p) {
      if (p.supprime || p.vehicule !== vehicule) return false;
      var a = depuisISO(p.debut), b = p.fin ? plusJours(depuisISO(p.fin), 1) : Infinity;
      return a !== null && a < fin && b > debut;
    });
  }
  function couvre(p, debut, fin) { var a = depuisISO(p.debut), b = p.fin ? plusJours(depuisISO(p.fin), 1) : Infinity; return a <= debut && b >= fin; }
  function libPeriode(p) { return 'du ' + String(p.debut).split('-').reverse().join('/') + (p.fin ? ' au ' + String(p.fin).split('-').reverse().join('/') : ' (sans fin)'); }
  function reservationsActives(st, vehicule, debut, fin, exclure) {
    return Object.keys(st.reservations).map(function (k) { return st.reservations[k]; }).filter(function (r) {
      return !r.annulee && !r.supplantee && r.vehicule === vehicule && r.id !== exclure && r.debut < fin && r.fin > debut;
    }).sort(function (a, b) { return a.debut - b.debut; });
  }
  /**
   * Le service peut-il réserver le véhicule sur [debut, fin[ ? Service d'affectation, sauf pendant un prêt à un autre
   * service ; autre service : seulement pendant un prêt ou une mise à disposition qui couvre toute la période et le
   * comprend (mise à disposition sans service désigné : tous les services). Puis aucune réservation qui chevauche.
   * Retourne { ok, raison, conflits }. `libService(code)` facultatif pour les messages.
   */
  function peutReserver(st, vehicule, service, debut, fin, exclure, libService) {
    var v = st.vehicules[vehicule], ls = libService || function (c) { return c; };
    if (!v || v.supprime) return { ok: false, raison: 'véhicule introuvable', conflits: [] };
    if (v.actif === false) return { ok: false, raison: 'véhicule hors service', conflits: [] };
    if (!(fin > debut)) return { ok: false, raison: 'la fin doit suivre le début', conflits: [] };
    var prets = pretsDe(st, vehicule, debut, fin), droit;
    if (service === v.service) {
      var pret = prets.filter(function (p) { return p.mode === 'pret'; })[0];
      droit = pret ? { ok: false, raison: 'prêté à ' + (pret.services || []).map(ls).join(', ') + ' ' + libPeriode(pret) } : { ok: true };
    } else {
      var ouvert = prets.filter(function (p) { return couvre(p, debut, fin) && (p.mode === 'pret' ? (p.services || []).indexOf(service) >= 0 : (!(p.services || []).length || p.services.indexOf(service) >= 0)); })[0];
      droit = ouvert ? { ok: true } : { ok: false, raison: 'véhicule de ' + ls(v.service) + ', non prêté ni mis à disposition de ce service pour toute la période' };
    }
    if (!droit.ok) return { ok: false, raison: droit.raison, conflits: [] };
    var conflits = reservationsActives(st, vehicule, debut, fin, exclure);
    var fermes = conflits.filter(function (r) { return r.statut !== 'pre'; }), pres = conflits.filter(function (r) { return r.statut === 'pre'; });
    if (fermes.length) return { ok: false, raison: 'déjà réservé ' + fermes.map(function (r) { return 'de ' + heure(r.debut) + ' à ' + heure(r.fin) + ' (' + ls(r.service) + ')'; }).join(', '), conflits: fermes, pre: pres };
    // Pré-réservations : n'empêchent pas de réserver, après avertissement
    return { ok: true, raison: '', conflits: [], pre: pres, avertissement: pres.length ? libPre(pres, ls) : '' };
  }
  function libPre(pres, ls) {
    return 'pré-réservé ' + pres.map(function (r) { return 'par ' + (r.nom || 'un agent') + ' (' + (ls || String)(r.service) + ') de ' + heure(r.debut) + ' à ' + heure(r.fin) + (r.motif ? ' : ' + r.motif : ''); }).join(' ; ');
  }
  /**
   * Destinataires de l'information d'une pré-réservation remplacée, par service (décision du porteur du 8 novembre 2026) :
   * rôles (cadre et secrétaire par défaut), groupes d'agents, agents nommés ; réglés par le cadre du service.
   * L'auteur de la pré-réservation est toujours informé (il n'est pas réglable). Réglage `vehiculesInformation`.
   */
  var INFORMATION_DEFAUT = { roles: ['CADRE', 'SECRETAIRE'], groupes: [], agents: [] };
  function information(config, service) {
    var x = config && config.vehiculesInformation && config.vehiculesInformation[service];
    if (!x || typeof x !== 'object') return { roles: INFORMATION_DEFAUT.roles.slice(), groupes: [], agents: [] };
    var chaines = function (l) { return Array.isArray(l) ? l.filter(function (y) { return typeof y === 'string'; }) : []; };
    return { roles: chaines(x.roles), groupes: chaines(x.groupes),
      agents: Array.isArray(x.agents) ? x.agents.filter(function (a) { return a && typeof a.id === 'string'; }).map(function (a) { return { id: a.id, nom: String(a.nom || '') }; }) : [] };
  }
  /** Le cadre ne change que les destinataires de ses services ; l'administrateur, tous. Lève une erreur sinon. */
  function controlerInformation(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0) throw new Error('Seuls le cadre du service et l’administrateur règlent les destinataires.');
    var a = ancien || {}, n = nouveau || {};
    Object.keys(a).concat(Object.keys(n)).forEach(function (c) {
      if (JSON.stringify(a[c]) !== JSON.stringify(n[c]) && sv.indexOf(c) < 0) throw new Error('Destinataires du service ' + c + ' : réglés par le cadre de ce service.');
    });
    return true;
  }
  /**
   * Informations sur les pré-réservations remplacées par une réservation forcée, pour un agent (`qui` : { agent, roles,
   * groupes, services }) : auteur de la pré-réservation, puis destinataires réglés pour son service. `vus` : déjà vus.
   */
  function avisPour(st, qui, vus, maintenant, config) {
    var v = vus || [], limite = (maintenant || Date.now()) - 864e5, q = qui || {};
    return (st.avis || []).map(function (a) { return Object.assign({ preReservation: st.reservations[a.pre], reservationForcee: st.reservations[a.reservation] }, a); }).filter(function (a) {
      var p = a.preReservation;
      if (!p || v.indexOf(a.id) >= 0 || p.fin < limite || a.par === q.agent) return false;
      if (p.agent === q.agent || p.par === q.agent) return true;
      var inf = information(config, p.service);
      if (inf.agents.some(function (x) { return x.id === q.agent; })) return true;
      if ((q.services || []).indexOf(p.service) < 0) return false;
      return (q.roles || []).some(function (r) { return inf.roles.indexOf(r) >= 0; }) || (q.groupes || []).some(function (g) { return inf.groupes.indexOf(g) >= 0; });
    }).sort(function (a, b) { return String(b.le).localeCompare(String(a.le)); });
  }
  function heure(t) { var d = new Date(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  /** Véhicules qui concernent les services (affectés, prêtés ou mis à disposition à un moment de [debut, fin[). */
  function vehiculesPour(st, services, debut, fin) {
    return Object.keys(st.vehicules).map(function (k) { return st.vehicules[k]; }).filter(function (v) {
      if (v.supprime) return false;
      if (services.indexOf(v.service) >= 0) return true;
      return pretsDe(st, v.id, debut === undefined ? -Infinity : debut, fin === undefined ? Infinity : fin).some(function (p) { return p.mode === 'partage' && !(p.services || []).length || (p.services || []).some(function (s) { return services.indexOf(s) >= 0; }); });
    }).sort(function (a, b) { return String(a.service).localeCompare(String(b.service)) || String(a.nom).localeCompare(String(b.nom)); });
  }
  /** Signalements non faits d'un véhicule (tous véhicules si `vehicule` est nul). */
  function signalementsOuverts(st, vehicule) {
    return Object.keys(st.signalements).map(function (k) { return st.signalements[k]; }).filter(function (s) { return !s.supprime && !s.fait && (!vehicule || s.vehicule === vehicule); })
      .sort(function (a, b) { return String(b.cree).localeCompare(String(a.cree)); });
  }
  /** Réservations de véhicules qui concernent les services, qui chevauchent [debut, fin[. */
  function reservations(st, services, debut, fin) {
    var ids = vehiculesPour(st, services, debut, fin).map(function (v) { return v.id; });
    return Object.keys(st.reservations).map(function (k) { return st.reservations[k]; })
      .filter(function (r) { return !r.annulee && !r.supplantee && ids.indexOf(r.vehicule) >= 0 && r.debut < fin && r.fin > debut; }).sort(function (a, b) { return a.debut - b.debut; });
  }
  /** Réservations liées à un élément de l'Agenda (et à une date, si donnée), non annulées. */
  function reservationsLiees(st, rdv, occurrence) {
    return Object.keys(st.reservations).map(function (k) { return st.reservations[k]; }).filter(function (r) { return !r.annulee && r.lien && r.lien.rdv === rdv && (!occurrence || r.lien.occurrence === occurrence); });
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'vehicules.consulter', libelle: 'Consulter les véhicules et leurs réservations', types: [] },
    { code: 'vehicules.reserver', libelle: 'Réserver ou pré-réserver un véhicule (directement ou depuis un événement de l’agenda), forcer une réservation sur une pré-réservation, annuler une réservation', types: ['RESERVATION'] },
    { code: 'vehicules.signaler', libelle: 'Signaler (plein, voyant, nettoyage…) et marquer fait', types: ['SIGNALEMENT', 'SIGNALEMENT_FAIT'] },
    { code: 'vehicules.gerer', libelle: 'Gérer le parc : véhicules, caractéristiques, prêts et mises à disposition', types: ['VEHICULE', 'PRET'] }
  ];
  var DROITS = {
    IDE: ['RESERVATION', 'SIGNALEMENT', 'SIGNALEMENT_FAIT'],
    AS: ['RESERVATION', 'SIGNALEMENT', 'SIGNALEMENT_FAIT'],
    SECRETAIRE: ['RESERVATION', 'SIGNALEMENT', 'SIGNALEMENT_FAIT'],
    CADRE: TYPES.slice()
  };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'vehicules', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.vehicules : undefined; },
    appartenance: 'acces'
  });

  /** Services sur lesquels agit une saisie (activation du module par service). */
  function cibles(st, e) {
    var d = e.data || {}, x = null;
    if (e.type === 'PRET' || e.type === 'SIGNALEMENT') x = st && st.vehicules && st.vehicules[d.vehicule];
    else if (e.type === 'SIGNALEMENT_FAIT') { var sg = st && st.signalements && st.signalements[d.signalement]; x = sg && st.vehicules[sg.vehicule]; }
    var sv = (e.type === 'RESERVATION' || e.type === 'VEHICULE') ? d.service || (st && st.reservations && st.reservations[d.id] && st.reservations[d.id].service) || (st && st.vehicules && st.vehicules[d.id] && st.vehicules[d.id].service) : (x && x.service);
    return sv ? [sv] : [];
  }
  /**
   * Contrôle avant l'enregistrement d'une réservation (non annulée) : disponibilité et droit du service, recalculés sur
   * l'état à jour du module (deux postes ne réservent pas le même créneau sans le voir).
   */
  function controler(type, d, ctx) {
    if (type !== 'RESERVATION' || !d || d.annulee) return;
    var st = ctx.etat || { vehicules: {}, prets: {}, reservations: {} }, ex = st.reservations[d.id];
    var r = Object.assign({}, ex || {}, d);
    // Motif obligatoire, pour une réservation comme pour une pré-réservation (décision du porteur du 8 novembre 2026)
    if (!String(r.motif || '').trim()) throw new Error('Indiquez le motif de la ' + (r.statut === 'pre' ? 'pré-réservation' : 'réservation') + '.');
    var svs = (ctx.config && Array.isArray(ctx.config.services)) ? ctx.config.services : [];
    var lib = function (c) { var x = svs.filter(function (y) { return y && y.code === c; })[0]; return x ? x.libelle : c; };
    var p = peutReserver(st, r.vehicule, r.service, r.debut, r.fin, r.id, lib);
    if (!p.ok) throw new Error('Véhicule indisponible : ' + p.raison + '.');
    // Réserver sur une pré-réservation n'est possible qu'en la désignant (réservation forcée après avertissement)
    if (r.statut !== 'pre') {
      var nonVues = (p.pre || []).filter(function (x) { return (d.supplante || []).indexOf(x.id) < 0; });
      if (nonVues.length) throw new Error('Véhicule ' + libPre(nonVues, lib) + '. Confirmez pour forcer la réservation.');
    }
  }
  /** Annuler sa propre réservation est permis sans l'accès « Réserver ». */
  function permisPourSoi(type, data, compte, ctx) {
    if (type !== 'RESERVATION' || !compte || !data || !data.annulee || !ctx || !ctx.etat) return false;
    var r = ctx.etat.reservations && ctx.etat.reservations[data.id];
    return !!r && (r.agent === compte.id || r.par === compte.id);
  }

  var contrat = {
    id: 'vehicules',
    libelle: 'Véhicules',
    version: '0.1.0',
    icone: 'VE',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi,
      services: function (st, e) { return cibles(st, e); } },
    // Réglages que le cadre écrit pour ses services (contrôle appelé par la session avant l'enregistrement)
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { vehiculesInformation: controlerInformation } },
    vues: { onglets: [{ code: 'parc', libelle: 'Véhicules' }, { code: 'planning', libelle: 'Réservations' }, { code: 'signalements', libelle: 'Signalements' }] },
    migrations: [],
    fournitures: [
      // Lue par l'Agenda : véhicules réservables par un service sur une période, avec leur disponibilité
      { nom: 'vehicules.disponibles', version: 1, acces: 'lecture', champs: ['id', 'libelle', 'places', 'service', 'ok', 'raison', 'signalements', 'avertissement', 'pre'],
        lire: function (st, o) {
          var debut = o.debut, fin = o.fin;
          return vehiculesPour(st, [o.service], debut, fin).filter(function (v) { return v.actif !== false; }).map(function (v) {
            var p = peutReserver(st, v.id, o.service, debut, fin, o.exclure, o.libService);
            return { id: v.id, libelle: libelleVehicule(v), places: v.places || null, service: v.service, ok: p.ok, raison: p.raison, signalements: signalementsOuverts(st, v.id).length,
              avertissement: p.avertissement || '', pre: (p.pre || []).map(function (x) { return x.id; }) };
          });
        } },
      { nom: 'vehicules.liees', version: 1, acces: 'lecture', champs: ['id', 'vehicule', 'debut', 'fin', 'lien'],
        lire: function (st, o) { return reservationsLiees(st, o.rdv, o.occurrence).map(function (r) { return Object.assign({ libelle: libelleVehicule(st.vehicules[r.vehicule]) }, r); }); } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, options: options, valeurChamp: valeurChamp, libValeur: libValeur, TYPES_CHAMP: TYPES_CHAMP, MODES_PRET: MODES_PRET,
    TYPES_VEHICULE_DEFAUT: TYPES_VEHICULE_DEFAUT, TYPES_SIGNALEMENT_DEFAUT: TYPES_SIGNALEMENT_DEFAUT,
    libelleVehicule: libelleVehicule, pretsDe: pretsDe, peutReserver: peutReserver, vehiculesPour: vehiculesPour, signalementsOuverts: signalementsOuverts,
    reservations: reservations, reservationsLiees: reservationsLiees, reservationsActives: reservationsActives, avisPour: avisPour, information: information, controlerInformation: controlerInformation, STATUTS: STATUTS, libPeriode: libPeriode, jourISO: jourISO, depuisISO: depuisISO };
});
