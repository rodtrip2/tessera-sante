// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Salles et bureaux — contrat déclaré au registre des modules (0.25.0, décisions du porteur du 11 novembre 2026,
 * maquette validée le même jour).
 *
 * Salles d'un service ou communes (plusieurs services, établissement) : type, capacité, équipement, accessibilité,
 * réservation soumise à validation (option, désactivée par défaut). Prêt à un autre service (ponctuel ou répété),
 * fermetures ponctuelles ou répétées (repas…), réservations simples (sans participants, répétables).
 * Occupation lue à la volée dans les autres plannings, sans jamais écrire dans leur journal : événements de l'Agenda qui
 * ont une salle, présences médicales et des psychologues, entretiens prévus (Suivi médical). Chaque occupation porte une
 * référence « module|identifiant|jour ».
 * Conflit : la salle libre se réserve tout de suite ; sur une salle prise, demande en conflit (motif), arbitrée par le
 * gestionnaire de la salle (cadre du service propriétaire ; administrateur pour une salle commune), sans priorité
 * automatique. Une décision attribue la salle à une occupation et retire (ou déplace dans une salle libre) les autres :
 * elle est rangée ici (`attributions`), jamais dans le journal de l'autre module. Journal `modules\salles\`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).salles = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['SALLE', 'SALLE_PRET', 'SALLE_FERMETURE', 'SALLE_RESERVATION', 'SALLE_DEMANDE', 'SALLE_DECISION'];
  var TYPES_SALLE_DEFAUT = [['entretien', 'Bureau d’entretien'], ['reunion', 'Salle de réunion'], ['medical', 'Bureau médical'], ['familles', 'Salle des familles'],
    ['activites', 'Salle d’activités'], ['psychologue', 'Bureau du psychologue'], ['autre', 'Autre']].map(function (x) { return { code: x[0], libelle: x[1] }; });
  var GENRES = { agenda: 'Événement de l’agenda', medical: 'Présence médicale', psy: 'Présence d’un psychologue', entretien: 'Entretien prévu', simple: 'Réservation simple', ferme: 'Indisponible' };
  var JOUR = /^\d{4}-\d{2}-\d{2}$/, HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function depuisISO(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function plusJours(j, n) { var t = depuisISO(j), d = new Date(t); d.setDate(d.getDate() + n); return jourISO(d.getTime()); }
  /** Instant d'un jour (ISO) à une heure 'HH:MM' (heure locale). */
  function instant(j, h) { var t = depuisISO(j), p = String(h || '00:00').split(':'); var d = new Date(t); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0); return d.getTime(); }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  /**
   * Réglages (`config.salles` = { '*': établissement, <service>: ce que le cadre règle }) : types de salles, plage
   * affichée (7 h – 21 h), horaires des demi-journées des présences (matin 8 h 30 – 12 h 30, après-midi 13 h 30 – 17 h 30).
   */
  function options(config, service) {
    var v = (config && config.salles) || {}, et = v['*'] || {}, sv = service && service !== '*' ? v[service] || {} : {}, r = Object.assign({}, et, sv);
    var types = Array.isArray(et.types) ? et.types.filter(function (t) { return t && /^[a-z0-9-]{1,40}$/.test(t.code || '') && texte(t.libelle); }).map(function (t) { return { code: t.code, libelle: texte(t.libelle, 80) }; }) : [];
    var h = function (x, d) { return HEURE.test(x || '') ? x : d; };
    var debut = h(r.debut, '07:00'), fin = h(r.fin, '21:00');
    if (fin <= debut) { debut = '07:00'; fin = '21:00'; }
    return { types: types.length ? types : TYPES_SALLE_DEFAUT.map(function (t) { return Object.assign({}, t); }), debut: debut, fin: fin,
      matin: [h(r.matinDebut, '08:30'), h(r.matinFin, '12:30')], apresmidi: [h(r.apresmidiDebut, '13:30'), h(r.apresmidiFin, '17:30')] };
  }
  function libType(config, code) { var t = options(config).types.filter(function (x) { return x.code === code; })[0]; return t ? t.libelle : code || ''; }

  // ------------------------------------------------------------ Répétition (réservations simples, fermetures, prêts)
  /** Répétition validée : { type: 'aucune' | 'semaine', jours: [0..6], jusqua: 'AAAA-MM-JJ' | '' }. */
  function repetition(r) {
    var x = r && typeof r === 'object' ? r : {};
    return { type: x.type === 'semaine' ? 'semaine' : 'aucune', jours: Array.isArray(x.jours) ? x.jours.filter(function (j) { return j >= 0 && j <= 6; }) : [], jusqua: JOUR.test(x.jusqua || '') ? x.jusqua : '' };
  }
  /** L'élément (jour de départ, répétition, `sauf`) vaut-il pour ce jour ? */
  function couvre(x, j) {
    if (!x || !x.jour || j < x.jour || (Array.isArray(x.sauf) && x.sauf.indexOf(j) >= 0)) return false;
    var r = repetition(x.repetition);
    if (r.type === 'aucune') return j === x.jour || (!!x.jusquau && j <= x.jusquau);   // période continue (fermeture, prêt)
    if (r.jusqua && j > r.jusqua) return false;
    return r.jours.indexOf(new Date(depuisISO(j)).getDay()) >= 0;
  }
  function joursEntre(debut, fin) { var res = [], j = jourISO(debut), f = jourISO(fin - 1); for (var i = 0; j <= f && i < 400; i++) { res.push(j); j = plusJours(j, 1); } return res; }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, x;
    switch (e.type) {
      case 'SALLE':
        if (!d.id) break;
        x = st.salles[d.id] || (st.salles[d.id] = { id: d.id, cree: e.at, par: e.by });
        ['nom', 'type', 'capacite', 'equipement', 'accessible', 'service', 'services', 'validation', 'actif', 'supprime', 'precision'].forEach(function (k) { if (d[k] !== undefined) x[k] = d[k]; });
        break;
      case 'SALLE_PRET':
      case 'SALLE_FERMETURE':
      case 'SALLE_RESERVATION':
        if (!d.id) break;
        var coll = e.type === 'SALLE_PRET' ? st.prets : e.type === 'SALLE_FERMETURE' ? st.fermetures : st.reservations;
        x = coll[d.id] || (coll[d.id] = { id: d.id, cree: e.at, par: e.by, sauf: [] });
        ['salle', 'jour', 'jusquau', 'de', 'a', 'repetition', 'services', 'service', 'titre', 'motif', 'nom', 'supprime', 'annulee', 'travaux'].forEach(function (k) { if (d[k] !== undefined) x[k] = d[k]; });
        if (Array.isArray(d.sauf)) x.sauf = d.sauf.slice();
        if (d.annulee) x.annulation = { par: e.by, le: e.at, motif: d.motifAnnulation || '' };
        break;
      case 'SALLE_DEMANDE':
        // Demande en conflit (ou sur une salle soumise à validation) : ouverte jusqu'à la décision du gestionnaire
        if (!d.id || st.demandes[d.id]) break;
        st.demandes[d.id] = { id: d.id, par: e.by, nom: d.nom || '', le: e.at, salle: d.salle, ref: d.ref, debut: d.debut, fin: d.fin, titre: d.titre || '', service: d.service || '',
          motif: d.motif || '', genre: d.genre || 'simple', conflits: Array.isArray(d.conflits) ? d.conflits : [], validation: !!d.validation, statut: 'ouverte', retiree: false };
        break;
      case 'SALLE_DECISION':
        x = st.demandes[d.demande];
        if (!x || x.statut !== 'ouverte') break;
        if (d.retirer) { x.statut = 'retiree'; x.decision = { par: e.by, le: e.at }; break; }
        x.statut = d.accepte ? 'acceptee' : 'refusee';
        x.decision = { par: e.by, le: e.at, message: d.message || '', proposition: d.proposition || '' };
        if (d.accepte) {
          st.attributions[x.ref] = { salle: x.salle, demande: x.id, par: e.by, le: e.at };
          x.conflits.forEach(function (c) {
            st.attributions[c.ref] = { salle: d.proposition || null, demande: x.id, par: e.by, le: e.at, depuis: x.salle };
            if (c.par) st.avis.push({ id: e.id + '|' + c.ref, agent: c.par, genre: d.proposition ? 'deplacee' : 'retiree', demande: x.id, ref: c.ref, titre: c.titre || '', le: e.at, par: e.by, proposition: d.proposition || '', message: d.message || '' });
          });
        }
        if (x.par !== e.by) st.avis.push({ id: e.id, agent: x.par, genre: d.accepte ? 'acceptee' : 'refusee', demande: x.id, ref: x.ref, titre: x.titre, le: e.at, par: e.by, proposition: d.accepte ? '' : d.proposition || '', message: d.message || '' });
        break;
    }
  }
  function reduire(evts) {
    return N.reduire(evts, { cle: 'salles', etat: function () { return { salles: {}, prets: {}, fermetures: {}, reservations: {}, demandes: {}, attributions: {}, avis: [] }; }, appliquer: appliquer });
  }

  // ------------------------------------------------------------ Salles, accès, gestion
  function sallesActives(st) { return Object.keys((st && st.salles) || {}).map(function (k) { return st.salles[k]; }).filter(function (s) { return !s.supprime; }); }
  /** Salle commune : sans service propriétaire ; `services` vides = tout l'établissement. */
  function commune(s) { return !!s && !s.service; }
  /** Salles visibles d'un service : les siennes, les communes qui le comprennent, celles qui lui sont prêtées un jour. */
  function sallesDuService(st, service) {
    return sallesActives(st).filter(function (s) {
      if (s.service === service) return true;
      if (commune(s)) return !(s.services || []).length || s.services.indexOf(service) >= 0;
      return Object.keys(st.prets).some(function (k) { var p = st.prets[k]; return !p.supprime && p.salle === s.id && (p.services || []).indexOf(service) >= 0; });
    }).sort(function (a, b) { return (a.service === service ? 0 : 1) - (b.service === service ? 0 : 1) || String(a.nom).localeCompare(String(b.nom)); });
  }
  /** Le compte gère-t-il la salle (liste, fermetures, prêts, arbitrage) ? Cadre du service propriétaire ; commune : administrateur. */
  function gere(s, compte) {
    var roles = (compte && compte.roles) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    return !!s && !commune(s) && roles.indexOf('CADRE') >= 0 && ((compte.services || []).indexOf(s.service) >= 0);
  }
  /** Prêt de la salle en vigueur ce jour : { pret } ou null. */
  function pretDuJour(st, salle, j) {
    return Object.keys(st.prets).map(function (k) { return st.prets[k]; }).filter(function (p) { return !p.supprime && p.salle === salle && couvre(p, j); })[0] || null;
  }
  /**
   * Le service peut-il occuper la salle ce jour ? Service propriétaire (sauf pendant un prêt à un autre service),
   * service d'une salle commune, service emprunteur pendant un prêt. { ok, raison }.
   */
  function acces(st, salle, service, j, libService) {
    var s = st.salles[salle], ls = libService || String;
    if (!s || s.supprime) return { ok: false, raison: 'salle introuvable' };
    if (s.actif === false) return { ok: false, raison: 'salle hors service' };
    var p = pretDuJour(st, salle, j);
    if (p) return (p.services || []).indexOf(service) >= 0 ? { ok: true, pret: p } : { ok: false, raison: 'prêtée à ' + (p.services || []).map(ls).join(', ') + ' ce jour' };
    if (s.service === service) return { ok: true };
    if (commune(s) && (!(s.services || []).length || s.services.indexOf(service) >= 0)) return { ok: true };
    return { ok: false, raison: 'salle de ' + ls(s.service) };
  }

  // ------------------------------------------------------------ Occupations
  /**
   * Occupations sur [debut, fin[ (instants) : réservations simples, fermetures, demandes acceptées, et occupations
   * venues des autres plannings (`sources` : [{ ref, salle, debut, fin, titre, service, genre, par }]). Les décisions
   * d'arbitrage s'appliquent (`attributions` : salle retirée, ou déplacée) ; une occupation qui attend une décision ou
   * dont la demande a été refusée n'occupe pas la salle (elle est rendue à part : `enAttente`, `refusees`).
   * Retourne { occupations: [{ ref, salle, debut, fin, titre, genre, service, par, deplacee }], enAttente, refusees }.
   */
  function occupations(st, sources, debut, fin) {
    var res = [], vus = {}, attente = [], refusees = [], dem = Object.keys(st.demandes).map(function (k) { return st.demandes[k]; });
    var parRef = {};
    dem.forEach(function (d) { (parRef[d.ref] = parRef[d.ref] || []).push(d); });
    function ajouter(o) {
      var a = st.attributions[o.ref], ds = parRef[o.ref] || [];
      var ouverte = ds.filter(function (d) { return d.statut === 'ouverte'; })[0], acceptee = ds.filter(function (d) { return d.statut === 'acceptee'; }).pop();
      if (a) { if (!a.salle) return; o = Object.assign({}, o, { salle: a.salle, deplacee: a.depuis && a.depuis !== a.salle ? a.depuis : '' }); }
      else if (ouverte) { attente.push(Object.assign({}, o, { demande: ouverte.id, salle: ouverte.salle })); return; }
      else if (ds.some(function (d) { return d.statut === 'refusee'; }) && !acceptee) { refusees.push(o); return; }
      if (vus[o.ref]) return;
      vus[o.ref] = 1; res.push(o);
    }
    var jours = joursEntre(debut, fin);
    Object.keys(st.reservations).forEach(function (k) {
      var r = st.reservations[k];
      if (r.annulee || r.supprime) return;
      jours.forEach(function (j) { if (couvre(r, j)) ajouter({ ref: 'salles|' + r.id + '|' + j, salle: r.salle, debut: instant(j, r.de), fin: instant(j, r.a), titre: r.titre || 'Réservation', genre: 'simple', service: r.service, par: r.par, nom: r.nom || '' }); });
    });
    Object.keys(st.fermetures).forEach(function (k) {
      var f = st.fermetures[k];
      if (f.supprime) return;
      jours.forEach(function (j) { if (couvre(f, j)) res.push({ ref: 'ferme|' + f.id + '|' + j, salle: f.salle, debut: instant(j, f.de || '00:00'), fin: f.a ? instant(j, f.a) : instant(plusJours(j, 1), '00:00'), titre: f.motif || 'Indisponible', genre: 'ferme', service: '', par: f.par }); });
    });
    (sources || []).forEach(function (o) { if (o && o.ref) ajouter(Object.assign({}, o)); });
    // Demandes acceptées sans occupation d'origine visible (réservation simple demandée, ou source sans salle) : la demande occupe
    dem.forEach(function (d) {
      if (d.statut === 'acceptee' && !vus[d.ref] && st.attributions[d.ref] && st.attributions[d.ref].salle === d.salle) { vus[d.ref] = 1; res.push({ ref: d.ref, salle: d.salle, debut: d.debut, fin: d.fin, titre: d.titre, genre: d.genre, service: d.service, par: d.par, nom: d.nom }); }
      if (d.statut === 'ouverte' && !attente.some(function (x) { return x.demande === d.id; })) attente.push({ ref: d.ref, salle: d.salle, debut: d.debut, fin: d.fin, titre: d.titre, genre: d.genre, service: d.service, par: d.par, demande: d.id, nom: d.nom });
    });
    var dans = function (o) { return o.debut < fin && o.fin > debut; };
    return { occupations: res.filter(dans), enAttente: attente.filter(dans), refusees: refusees.filter(dans) };
  }
  /** Occupations de la salle qui chevauchent [debut, fin[ (hors `exclure`, une référence ou une liste). */
  function conflits(occ, salle, debut, fin, exclure) {
    var ex = [].concat(exclure || []);
    return (occ.occupations || occ).filter(function (o) { return o.salle === salle && o.debut < fin && o.fin > debut && ex.indexOf(o.ref) < 0 && !ex.some(function (r) { return r && o.ref.indexOf(r + '|') === 0; }); });
  }
  /**
   * La salle est-elle libre pour le service sur [debut, fin[ ? { ok, raison, conflits, fermee, validation }.
   * `exclure` : référence(s) de l'occupation que l'on modifie (préfixe accepté : « agenda|R12 » couvre toutes ses dates).
   */
  function disponibilite(st, occ, salle, service, debut, fin, exclure, libService) {
    if (!(fin > debut)) return { ok: false, raison: 'la fin doit suivre le début', conflits: [] };
    var s = st.salles[salle];
    var jours = joursEntre(debut, fin);
    for (var i = 0; i < jours.length; i++) { var a = acces(st, salle, service, jours[i], libService); if (!a.ok) return { ok: false, raison: a.raison, conflits: [], acces: false }; }
    var c = conflits(occ, salle, debut, fin, exclure), fermee = c.filter(function (o) { return o.genre === 'ferme'; });
    if (fermee.length) return { ok: false, raison: 'salle indisponible : ' + fermee.map(function (o) { return o.titre; }).join(', '), conflits: c, fermee: true };
    if (c.length) return { ok: false, raison: 'déjà occupée : ' + c.map(function (o) { return o.titre + ' de ' + hm(o.debut) + ' à ' + hm(o.fin); }).join(' ; '), conflits: c };
    return { ok: true, raison: '', conflits: [], validation: !!(s && s.validation) };
  }
  /** Salles libres pour le service sur [debut, fin[, de capacité suffisante (facultative). */
  function libres(st, occ, service, debut, fin, capacite, exclure) {
    return sallesDuService(st, service).filter(function (s) { return s.actif !== false && (!capacite || !s.capacite || +s.capacite >= capacite) && disponibilite(st, occ, s.id, service, debut, fin, exclure).ok; });
  }
  /** Demandes ouvertes que le compte arbitre (salles qu'il gère), des plus anciennes aux plus récentes. */
  function aArbitrer(st, compte) {
    return Object.keys(st.demandes).map(function (k) { return st.demandes[k]; }).filter(function (d) { return d.statut === 'ouverte' && gere(st.salles[d.salle], compte); })
      .sort(function (a, b) { return String(a.le).localeCompare(String(b.le)); });
  }
  /** Informations pour un agent (décision sur sa demande, occupation retirée ou déplacée), non vues. */
  function avisPour(st, agent, vus) { var v = vus || []; return (st.avis || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0; }); }
  /** Salle effective d'une occupation d'un autre module (après arbitrage) : identifiant, null si retirée, undefined si aucune décision. */
  function salleDe(st, ref) { var a = st && st.attributions && st.attributions[ref]; return a ? a.salle : undefined; }
  /** Demande ouverte ou refusée pour une référence : { statut, demande } ou null. */
  function demandeDe(st, ref) {
    var ds = Object.keys((st && st.demandes) || {}).map(function (k) { return st.demandes[k]; }).filter(function (d) { return d.ref === ref && d.statut !== 'retiree'; });
    return ds.length ? ds[ds.length - 1] : null;
  }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || reduire([]), compte = ctx && ctx.compte, s;
    if (type === 'SALLE') {
      var x = Object.assign({}, st.salles[d.id] || {}, d);
      if (!d.id) throw new Error('Identifiant de la salle manquant.');
      if (d.supprime) { if (!gere(st.salles[d.id], compte)) throw new Error('Seul le gestionnaire de la salle la retire.'); return; }
      if (!texte(x.nom)) throw new Error('Indiquez le nom de la salle.');
      if (x.capacite !== undefined && x.capacite !== '' && !(+x.capacite >= 0 && +x.capacite <= 500)) throw new Error('Capacité invalide.');
      if (!x.service && !(compte && (compte.roles || []).indexOf('ADMIN') >= 0)) throw new Error('Une salle commune est créée par l’administrateur.');
      if (x.service && !gere(x, compte)) throw new Error('Seul le cadre du service (ou l’administrateur) gère ses salles.');
      if (st.salles[d.id] && !gere(st.salles[d.id], compte)) throw new Error('Seul le gestionnaire de la salle la modifie.');
      return;
    }
    if (type === 'SALLE_PRET' || type === 'SALLE_FERMETURE' || type === 'SALLE_RESERVATION') {
      var coll = type === 'SALLE_PRET' ? st.prets : type === 'SALLE_FERMETURE' ? st.fermetures : st.reservations, y = Object.assign({}, coll[d.id] || {}, d);
      s = st.salles[y.salle];
      if (!s) throw new Error('Choisissez la salle.');
      if (!JOUR.test(y.jour || '')) throw new Error('Indiquez le jour.');
      if (y.jusquau && (!JOUR.test(y.jusquau) || y.jusquau < y.jour)) throw new Error('La fin de la période précède son début.');
      var r = repetition(y.repetition);
      if (r.type === 'semaine' && !r.jours.length) throw new Error('Choisissez au moins un jour de la semaine.');
      if (type !== 'SALLE_PRET' && (y.de || y.a || type === 'SALLE_RESERVATION')) {
        if (!HEURE.test(y.de || '') || !HEURE.test(y.a || '') || y.a <= y.de) throw new Error('Heures de début et de fin invalides (la fin suit le début).');
        if (!/:(00|15|30|45)$/.test(y.de) || !/:(00|15|30|45)$/.test(y.a)) throw new Error('Réservation par quart d’heure.');
      }
      if (type === 'SALLE_PRET') { if (!(y.services || []).length) throw new Error('Choisissez le service emprunteur.'); if (!gere(s, compte)) throw new Error('Seul le gestionnaire de la salle la prête.'); }
      if (type === 'SALLE_FERMETURE' && !gere(s, compte) && !y.travaux) throw new Error('Seul le gestionnaire de la salle la ferme.');
      if (type === 'SALLE_RESERVATION') {
        if (coll[d.id] && coll[d.id].par !== (compte && compte.id) && !gere(s, compte)) throw new Error('Seuls l’auteur et le gestionnaire de la salle modifient la réservation.');
        if (!coll[d.id] && !texte(y.titre)) throw new Error('Indiquez l’objet de la réservation.');
        if (!coll[d.id] && s.validation && !gere(s, compte)) throw new Error('Salle soumise à validation : faites une demande.');
      }
      return;
    }
    if (type === 'SALLE_DEMANDE') {
      s = st.salles[d.salle];
      if (!s) throw new Error('Choisissez la salle.');
      if (!d.id || st.demandes[d.id]) throw new Error('Demande déjà enregistrée.');
      if (typeof d.ref !== 'string' || !/^[a-z]+\|/.test(d.ref)) throw new Error('Demande mal formée.');
      if (!(d.fin > d.debut)) throw new Error('La fin doit suivre le début.');
      if (!d.validation && !texte(d.motif)) throw new Error('Indiquez le motif de la demande.');
      return;
    }
    if (type === 'SALLE_DECISION') {
      var dm = st.demandes[d.demande];
      if (!dm || dm.statut !== 'ouverte') throw new Error('Demande déjà traitée.');
      if (d.retirer) { if (!compte || dm.par !== compte.id) throw new Error('Seul l’auteur retire sa demande.'); return; }
      if (!gere(st.salles[dm.salle], compte)) throw new Error('Seul le gestionnaire de la salle arbitre.');
      if (d.proposition && !st.salles[d.proposition]) throw new Error('Salle proposée introuvable.');
    }
  }
  /** L'auteur retire sa propre demande sans le droit d'arbitrer. */
  function permisPourSoi(type, data, compte, ctx) {
    if (type !== 'SALLE_DECISION' || !data || !data.retirer || !compte || !ctx || !ctx.etat) return false;
    var dm = ctx.etat.demandes && ctx.etat.demandes[data.demande];
    return !!dm && dm.par === compte.id;
  }
  /** Réglages écrits par le cadre (`config.salles`) : l'entrée de ses services seulement (plage affichée, horaires). */
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
    { code: 'salles.consulter', libelle: 'Consulter le planning des salles et bureaux', types: [] },
    { code: 'salles.reserver', libelle: 'Réserver une salle, demander une salle prise (arbitrage)', types: ['SALLE_RESERVATION', 'SALLE_DEMANDE'] },
    { code: 'salles.gerer', libelle: 'Gérer les salles du service : liste, fermetures, prêts, arbitrage des demandes', types: ['SALLE', 'SALLE_PRET', 'SALLE_FERMETURE', 'SALLE_DECISION'] }
  ];
  // Droits proposés (décision du porteur du 11 novembre 2026) : IDE, AS, secrétaires et cadres réservent ; le cadre gère et arbitre
  var DROITS = { IDE: ['SALLE_RESERVATION', 'SALLE_DEMANDE'], AS: ['SALLE_RESERVATION', 'SALLE_DEMANDE'], SECRETAIRE: ['SALLE_RESERVATION', 'SALLE_DEMANDE'], CADRE: TYPES.slice() };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'salles', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.salles : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, s = null;
    if (e.type === 'SALLE') s = Object.assign({}, st && st.salles && st.salles[d.id], d);
    else if (e.type === 'SALLE_DECISION') { var dm = st && st.demandes && st.demandes[d.demande]; s = dm && st.salles[dm.salle]; }
    else { var x = (st && (st.reservations[d.id] || st.fermetures[d.id] || st.prets[d.id])) || d; s = st && st.salles && st.salles[d.salle || x.salle]; }
    return s && s.service ? [s.service] : [];
  }

  var contrat = {
    id: 'salles',
    libelle: 'Salles et bureaux',
    version: '0.1.0',
    icone: 'SB',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { salles: controlerCadre } },
    vues: { onglets: [{ code: 'journee', libelle: 'Journée' }, { code: 'salle', libelle: 'Par salle' }, { code: 'mes', libelle: 'Mes réservations' },
      { code: 'arbitrer', libelle: 'À arbitrer', droit: 'SALLE_DECISION' }, { code: 'liste', libelle: 'Salles du service' }] },
    migrations: [],
    fournitures: [
      // Lue par l'Agenda, le Suivi médical et la Vue d'ensemble : salles d'un service, disponibilité, salle effective après arbitrage
      { nom: 'salles.salles', version: 1, acces: 'lecture', champs: ['id', 'nom', 'type', 'capacite', 'service', 'validation'], lire: function (st, o) { return sallesDuService(st, o.service); } },
      { nom: 'salles.attribution', version: 1, acces: 'lecture', champs: ['salle'], lire: function (st, o) { return salleDe(st, o.ref); } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, GENRES: GENRES, TYPES_SALLE_DEFAUT: TYPES_SALLE_DEFAUT,
    options: options, libType: libType, repetition: repetition, couvre: couvre, sallesActives: sallesActives, sallesDuService: sallesDuService, commune: commune, gere: gere,
    acces: acces, pretDuJour: pretDuJour, occupations: occupations, conflits: conflits, disponibilite: disponibilite, libres: libres, aArbitrer: aArbitrer, avisPour: avisPour,
    salleDe: salleDe, demandeDe: demandeDe, controler: controler, controlerCadre: controlerCadre, jourISO: jourISO, depuisISO: depuisISO, plusJours: plusJours, instant: instant, hm: hm };
});
