// SPDX-License-Identifier: EUPL-1.2
/*
 * Agenda du service — participants d'un événement (0.21.0, décisions du porteur du 11 novembre 2026).
 *
 * Rubrique « Quel(s) professionnel(s) ? » (remplace « professionnels prévus » et « accompagnateurs à trouver ») :
 * - agents **désignés** par celui qui planifie (`professionnels`, sans confirmation) ;
 * - **places** : nombre demandé, qui est un minimum ou un nombre exact, et maximum facultatif ;
 * - façons de pourvoir les places, qui se combinent : **inscription libre**, **inscription à confirmer** (par l'auteur,
 *   un organisateur, le cadre ou un rôle réglé), **invitation** (agents, groupes d'agents, rôles) ;
 * - un agent inscrit par un collègue est **proposé** : il confirme, ou refuse avec un motif ;
 * - au-delà du maximum : **liste d'attente**, le premier prend la place en cas de désistement ; le cadre peut faire
 *   passer un agent en tête.
 * Rubrique « Quel(s) patient(s) ? » : minimum et maximum de places ; au-delà du maximum, liste d'attente (dans l'ordre
 * de la liste) ; sous le minimum, alerte.
 *
 * Réglage d'un événement : `participation` = { mode: 'min' | 'exact', nombre, max, libre, aConfirmer, invites:
 * [{ t: 'agent' | 'groupe' | 'role', id, nom }], organisateurs: [identifiants], patientsMin, patientsMax }. Sans lui,
 * l'ancien réglage vaut : `accompagnateurs` = nombre exact, inscription libre.
 * Participations d'une date (`participations[date]`) : [{ agent, nom, etat: inscrit | propose | demande | refuse, motif,
 * par, le, evt, prioritaire }]. Aucune règle de droit ici : fonctions pures, testées sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).agendaParticipants = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ETATS = { inscrit: 'Inscrit', propose: 'Proposé, à confirmer par l’agent', demande: 'Demande à confirmer', refuse: 'Refusé' };
  var MODES = { min: 'Au moins', exact: 'Exactement' };
  var CIBLES = { agent: 'Agent', groupe: 'Groupe d’agents', role: 'Rôle' };
  var ROLES_CONFIRMATION_DEFAUT = ['CADRE'];

  function entier(v, max) { var n = Math.round(+v); return isFinite(n) && n > 0 ? Math.min(n, max || 200) : 0; }
  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }

  /** Réglage de participation d'un événement (ou d'une date), validé ; reprend l'ancien nombre d'accompagnateurs. */
  function reglage(r) {
    var p = r && r.participation, ancien = entier(r && r.accompagnateurs, 20);
    if (!p || typeof p !== 'object') return { mode: 'exact', nombre: ancien, max: 0, libre: ancien > 0, aConfirmer: false, invites: [], organisateurs: [], patientsMin: 0, patientsMax: 0, ancien: true };
    var nombre = entier(p.nombre), max = entier(p.max);
    return {
      mode: p.mode === 'min' ? 'min' : 'exact', nombre: nombre, max: max && max >= nombre ? max : 0,
      libre: !!p.libre, aConfirmer: !!p.aConfirmer,
      invites: (Array.isArray(p.invites) ? p.invites : []).filter(function (i) { return i && CIBLES[i.t] && i.id; }).slice(0, 60).map(function (i) { return { t: i.t, id: String(i.id), nom: texte(i.nom) }; }),
      organisateurs: (Array.isArray(p.organisateurs) ? p.organisateurs : []).map(String).filter(Boolean).slice(0, 20),
      patientsMin: entier(p.patientsMin), patientsMax: entier(p.patientsMax) && entier(p.patientsMax) >= entier(p.patientsMin) ? entier(p.patientsMax) : 0
    };
  }
  /** Nombre de places au plus : le nombre exact, sinon le maximum (0 : sans limite). */
  function plafond(g) { return g.mode === 'exact' ? g.nombre : g.max; }

  /** L'agent (compte, avec ses rôles et ses groupes) est-il invité ? */
  function invite(g, compte) {
    if (!compte) return false;
    var roles = compte.roles || [], groupes = compte.groupes || [];
    return g.invites.some(function (i) { return i.t === 'agent' ? i.id === compte.id : i.t === 'role' ? roles.indexOf(i.id) >= 0 : groupes.indexOf(i.id) >= 0; });
  }

  /**
   * Professionnels d'une date : désignés, inscrits (dans la limite des places), liste d'attente, proposés (à confirmer par
   * l'agent), demandes (à confirmer par un organisateur), refus. `r` : l'événement tel qu'il est à cette date.
   */
  function professionnels(r, occurrence) {
    var g = reglage(r), tout = ((r.participations || {})[occurrence] || []).slice();
    var designes = (r.professionnels || []).slice();
    var ids = designes.map(function (p) { return p.id; }).filter(Boolean);
    tout = tout.filter(function (x) { return ids.indexOf(x.agent) < 0; });   // un agent désigné ne compte qu'une fois
    var ok = tout.filter(function (x) { return x.etat === 'inscrit'; }).sort(function (a, b) { return (b.prioritaire ? 1 : 0) - (a.prioritaire ? 1 : 0) || (a.le || 0) - (b.le || 0); });
    var max = plafond(g), libres = max ? Math.max(0, max - designes.length) : Infinity;
    var inscrits = ok.slice(0, libres), attente = ok.slice(inscrits.length);
    var total = designes.length + inscrits.length;
    return {
      reglage: g, requis: g.nombre, mode: g.mode, max: max, designes: designes, prevus: designes.length, inscrits: inscrits, attente: attente,
      proposes: tout.filter(function (x) { return x.etat === 'propose'; }), demandes: tout.filter(function (x) { return x.etat === 'demande'; }),
      refus: tout.filter(function (x) { return x.etat === 'refuse'; }),
      total: total, manque: Math.max(0, g.nombre - total), complet: !!max && total >= max,
      ouvert: g.libre || g.aConfirmer || g.invites.length > 0,
      consigne: texte(r.consigneAccompagnateurs, 200)
    };
  }

  /** Patients d'une date : inscrits dans la limite des places, liste d'attente (ordre de la liste), minimum manquant. */
  function patients(r) {
    var g = reglage(r), l = (r.patients || []).slice(), max = g.patientsMax;
    var inscrits = max ? l.slice(0, max) : l, attente = max ? l.slice(max) : [];
    return { min: g.patientsMin, max: max, inscrits: inscrits, attente: attente, manque: Math.max(0, g.patientsMin - inscrits.length), complet: !!max && inscrits.length >= max };
  }

  /** L'agent peut-il confirmer ou refuser les demandes d'inscription : auteur, organisateur, cadre ou rôle réglé. */
  function peutConfirmer(r, compte, rolesConfirmation) {
    if (!r || !compte) return false;
    var g = reglage(r), roles = compte.roles || [], rc = Array.isArray(rolesConfirmation) && rolesConfirmation.length ? rolesConfirmation : ROLES_CONFIRMATION_DEFAUT;
    return r.par === compte.id || g.organisateurs.indexOf(compte.id) >= 0 || roles.some(function (x) { return rc.indexOf(x) >= 0 || x === 'CADRE'; });
  }

  /**
   * Situation d'un agent pour une date : { etat: designe | inscrit | attente (rang) | propose | demande | refuse | invite |
   * '', actions: [inscrire | demander | accepter | refuser | retirer] }.
   */
  function situation(r, occurrence, compte) {
    var p = professionnels(r, occurrence), g = p.reglage, id = compte && compte.id;
    function dans(l) { return l.filter(function (x) { return x.agent === id; })[0]; }
    if (!id) return { etat: '', actions: [] };
    if (p.designes.some(function (x) { return x.id === id; })) return { etat: 'designe', actions: [] };
    if (dans(p.inscrits)) return { etat: 'inscrit', actions: ['retirer'] };
    var a = dans(p.attente);
    if (a) return { etat: 'attente', rang: p.attente.indexOf(a) + 1, actions: ['retirer'] };
    var pr = dans(p.proposes);
    if (pr) return { etat: 'propose', par: pr.par, actions: ['accepter', 'refuser'] };
    if (dans(p.demandes)) return { etat: 'demande', actions: ['retirer'] };
    var inv = invite(g, compte), ref = dans(p.refus);
    if (ref && !inv && !g.libre && !g.aConfirmer) return { etat: 'refuse', motif: ref.motif, actions: [] };
    if (inv) return { etat: ref ? 'refuse' : 'invite', motif: ref && ref.motif, actions: ref ? ['accepter'] : ['accepter', 'refuser'] };
    // Ancien réglage : inscription seulement tant qu'il manque quelqu'un (comportement d'avant la 0.21.0)
    if (g.ancien) return { etat: '', actions: g.libre && p.manque ? ['inscrire'] : [] };
    if (g.aConfirmer) return { etat: ref ? 'refuse' : '', motif: ref && ref.motif, actions: ['demander'] };
    if (g.libre) return { etat: '', actions: ['inscrire'] };
    return { etat: ref ? 'refuse' : '', actions: [] };
  }

  /**
   * Contrôle d'une saisie `INSCRIPTION` avant son enregistrement. `d` : { agent, etat, retrait, motif, prioritaire } ;
   * `ctx` : { compte (avec rôles et groupes), cible (compte de l'agent inscrit, pour l'invitation), rolesConfirmation,
   * peutInscrire (accès « inscrire un collègue ») }. Lève une erreur en clair si la saisie n'est pas permise.
   */
  function controler(r, occurrence, d, ctx) {
    var c = ctx.compte || {}, soi = d.agent === c.id, p = professionnels(r, occurrence), g = p.reglage;
    function dans(l) { return l.some(function (x) { return x.agent === d.agent; }); }
    if (d.etat && !ETATS[d.etat]) throw new Error('État d’inscription inconnu.');
    if (d.retrait) { if (!soi && !ctx.peutInscrire && !peutConfirmer(r, c, ctx.rolesConfirmation)) throw new Error('Vous ne pouvez pas désinscrire un collègue.'); return; }
    var etat = d.etat || 'inscrit';
    if (etat === 'refuse' && !texte(d.motif, 200) && !soi) throw new Error('Indiquez le motif du refus.');
    if (soi) {
      if (d.prioritaire) throw new Error('Seul le cadre fait passer un agent en tête de la liste.');
      var attendu = dans(p.proposes) || invite(g, c);
      if (etat === 'refuse') { if (!attendu) throw new Error('Il n’y a ni proposition ni invitation à refuser.'); return; }
      if (attendu || dans(p.inscrits) || dans(p.attente)) { if (etat !== 'inscrit') throw new Error('Inscription attendue.'); return; }
      if (g.aConfirmer) { if (etat !== 'demande') throw new Error('Cette inscription doit être confirmée par un organisateur.'); return; }
      if (g.libre) { if (etat !== 'inscrit') throw new Error('Inscription attendue.'); return; }
      throw new Error('Les inscriptions ne sont pas ouvertes pour cet événement.');
    }
    var conf = peutConfirmer(r, c, ctx.rolesConfirmation);
    if (d.prioritaire !== undefined && (c.roles || []).indexOf('CADRE') < 0) throw new Error('Seul le cadre modifie l’ordre de la liste d’attente.');
    if (dans(p.demandes)) { if (!conf) throw new Error('Cette demande est confirmée par l’auteur, un organisateur ou le cadre.'); if (etat !== 'inscrit' && etat !== 'refuse') throw new Error('Confirmez ou refusez la demande.'); return; }
    if (d.prioritaire !== undefined && (dans(p.inscrits) || dans(p.attente))) return;   // le cadre réordonne
    if (etat !== 'propose') throw new Error('Un collègue inscrit par un autre agent confirme lui-même son inscription.');
    if (!ctx.peutInscrire && !conf) throw new Error('Vous ne pouvez pas inscrire un collègue.');
  }

  /** Applique une saisie `INSCRIPTION` aux participations d'une date ; renvoie la nouvelle liste. */
  function appliquer(liste, d, e) {
    var l = (liste || []).filter(function (x) { return x.agent !== d.agent; }), avant = (liste || []).filter(function (x) { return x.agent === d.agent; })[0];
    if (d.retrait) return l;
    var etat = ETATS[d.etat] ? d.etat : 'inscrit';
    var x = { agent: d.agent, nom: d.nom || (avant && avant.nom) || '', etat: etat, le: e.at, par: e.by, evt: e.id };
    // Le rang d'attente est celui de la première inscription : une confirmation ne fait pas reculer
    if (avant && avant.etat === 'inscrit' && etat === 'inscrit') x.le = avant.le;
    if (avant && (avant.etat === 'propose' || avant.etat === 'demande')) x.demandePar = avant.par;
    if (etat === 'refuse') x.motif = texte(d.motif, 200);
    var pr = d.prioritaire !== undefined ? !!d.prioritaire : !!(avant && avant.prioritaire);
    if (pr && etat === 'inscrit') x.prioritaire = true;
    l.push(x);
    return l;
  }

  /** Libellé court des places : « 2/3 », « 2/3 à 5 », « 2 (au moins 3) ». */
  function libellePlaces(p) {
    if (!p.requis && !p.max) return String(p.total);
    if (p.mode === 'exact') return p.total + '/' + p.requis;
    return p.total + '/' + (p.requis || 0) + (p.max ? ' à ' + p.max : ' au moins');
  }

  return { ETATS: ETATS, MODES: MODES, CIBLES: CIBLES, ROLES_CONFIRMATION_DEFAUT: ROLES_CONFIRMATION_DEFAUT, reglage: reglage, plafond: plafond, invite: invite,
    professionnels: professionnels, patients: patients, peutConfirmer: peutConfirmer, situation: situation, controler: controler, appliquer: appliquer, libellePlaces: libellePlaces };
});
