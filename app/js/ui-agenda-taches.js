// SPDX-License-Identifier: EUPL-1.2
/*
 * Agenda du service — réglages et catégories d’événements (administration).
 * Suite de ui-agenda.js (découpage de la 0.21.0, sans changement de comportement) : les aides communes viennent de
 * `SIC.ui.agendaInt`, les fonctions de ce fichier y sont ajoutées.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto, I = U.agendaInt;
  var vue = I.vue;
  var st = I.st;
  var fiches = I.fiches;
  var opts = I.opts;
  var minuit = I.minuit;
  var lundi = I.lundi;
  var plusJours = I.plusJours;
  var hm = I.hm;
  var libJour = I.libJour;
  var servicesAffiches = I.servicesAffiches;
  var nomsPatients = I.nomsPatients;
  var peut = I.peut;
  var cat = I.cat;
  var libelleElement = I.libelleElement;
  var boutonInscription = I.boutonInscription;
  var badgeAccompagnateurs = I.badgeAccompagnateurs;
  var ouvrirElement = I.ouvrirElement;
  var grille = I.grille;
  var bandeauAvis = I.bandeauAvis;
  var champsRepetition = I.champsRepetition;
  var carteElement = I.carteElement;
  var modaleElement = I.modaleElement;
  var libRepetition = I.libRepetition;
  var resume = I.resume;

  var DELAIS = [[null, 'Sans alerte'], [0, 'Le jour même'], [1, 'La veille'], [2, '2 jours avant'], [3, '3 jours avant'], [5, '5 jours avant'], [7, '7 jours avant'], [14, '14 jours avant']];
  function libDelai(v) { var x = DELAIS.filter(function (d) { return d[0] === v; })[0]; return x ? x[1] : v + ' jours avant'; }
  function selectDelai(v, f) {
    var opts0 = DELAIS.slice(); if (v !== null && v !== undefined && !DELAIS.some(function (d) { return d[0] === v; })) opts0.push([v, v + ' jours avant']);
    var s = h('select', { class: 'delai', 'aria-label': 'Alerte si non fait', onchange: function () { f(s.value === '' ? null : +s.value); } }, opts0.map(function (d) { return h('option', { value: d[0] === null ? '' : String(d[0]), text: d[1], selected: d[0] === (v === undefined ? null : v) }); }));
    return s;
  }

  /** Tâche due un jour : case « faite » (accès « Cocher »), qui et quand ; agent affecté ; « Affecter » pour qui ajuste. */
  function ligneTache(x) {
    var t = x.tache, moi = moiAvecGroupes(), pourMoi = x.affecte ? x.affecte.agent === moi.id : A.tachePour(t, moi);
    var peutAffecter = t.niveau === 'service' && peut('TACHE_AJUSTEMENT') && A.optionsTaches(U.config()).ajustables.indexOf('affectation') >= 0;
    var cb = h('input', { type: 'checkbox', checked: !!x.fait, disabled: !peut('TACHE_FAITE'), 'aria-label': 'Tâche faite : ' + t.titre, onchange: async function () {
      try { await U.App.session.enregistrer('TACHE_FAITE', { tache: t.id, occurrence: x.occurrence, annule: !cb.checked }); }
      catch (e) { cb.checked = !cb.checked; alert(e.message); }
    } });
    // Modifier la tâche depuis l'agenda : tâche de l'équipe (accès « Tâches de l'équipe »), tâche du service (« Régler les tâches »)
    var modifiable = t.niveau === 'service' ? peut('TACHE') : (peut('TACHE_EQUIPE') || peut('TACHE'));
    return h('div', { class: 'agenda-tache' + (x.fait ? ' faite' : '') + (pourMoi ? '' : ' autre') },
      h('label', { class: 'case' }, cb, modifiable ? null : h('span', { text: (t.heure ? t.heure + ' ' : '') + t.titre })),
      modifiable ? h('button', { class: 'btn lien tache-titre', type: 'button', title: 'Modifier la tâche', onclick: function () { modaleTache(t, t.niveau === 'service' ? 'TACHE' : 'TACHE_EQUIPE'); } }, (t.heure ? t.heure + ' ' : '') + t.titre) : null,
      x.affecte ? h('small', { class: 'muted', text: ' → ' + (x.affecte.nom || U.App.session.nomAuteur(x.affecte.agent)) }) : null,
      x.fait ? h('small', { class: 'muted', text: ' ' + U.App.session.nomAuteur(x.fait.par) + ', ' + hm(Date.parse(x.fait.le)) }) : null,
      peutAffecter && !x.fait ? h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleAjustement(t, x.occurrence); } }, 'Affecter') : null);
  }

  /** Absence (motif facultatif) : chacun la sienne ; l'équipe avec l'accès « Absences de l'équipe ». */
  function modaleAbsence(a) {
    var x = a || {}, moi = U.App.session.utilisateur, equipe = peut('ABSENCE');
    var lecture = !!a && !equipe && x.agent !== moi.id;
    var comptes = equipe ? (U.App.session.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours'; }).sort(function (p, q) { return (p.nom || '').localeCompare(q.nom || ''); }) : [moi];
    var selAgent = h('select', lecture || !equipe ? { disabled: true } : {}, comptes.map(function (c) { return h('option', { value: c.id, text: c.nom, selected: (x.agent || moi.id) === c.id }); }));
    var debut = h('input', { type: 'date', value: x.debut ? A.jourISO(x.debut) : A.jourISO(vue.ref), disabled: lecture }), fin = h('input', { type: 'date', value: x.fin ? A.jourISO(x.fin - 1) : A.jourISO(vue.ref), disabled: lecture });
    var cat = h('select', { disabled: lecture }, [h('option', { value: '', text: 'Non précisé' })].concat(Object.keys(A.CATEGORIES_ABSENCE).map(function (k) { return h('option', { value: k, text: A.CATEGORIES_ABSENCE[k], selected: x.categorie === k }); })));
    var boutons = [{ texte: lecture ? 'Fermer' : 'Annuler' }];
    if (a && !lecture) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      await U.App.session.enregistrer('ABSENCE', { id: x.id, agent: x.agent, supprime: true, service: x.service });
      U.toast('Absence supprimée.');
    } });
    if (!lecture) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!debut.value || !fin.value) throw new Error('Indiquez le premier et le dernier jour d’absence.');
      if (fin.value < debut.value) throw new Error('Le dernier jour précède le premier.');
      var c = comptes.filter(function (y) { return y.id === selAgent.value; })[0] || moi;
      var monService = U.App.service !== '*' ? U.App.service : ((c.services || [])[0] || U.App.session.mesServices()[0] || null);
      await U.App.session.enregistrer('ABSENCE', { id: x.id || 'B' + C.hex(C.aleatoire(5)), agent: c.id, nom: c.nom, debut: A.depuisISO(debut.value), fin: plusJours(A.depuisISO(fin.value), 1), categorie: cat.value || null, service: x.service || monService });
      U.toast('Absence enregistrée.');
    } });
    U.modale(a ? 'Absence' : 'Nouvelle absence', h('div', { class: 'pile' },
      h('label', {}, 'Professionnel', selAgent),
      h('div', { class: 'grille-2' }, h('label', {}, 'Premier jour', debut), h('label', {}, 'Dernier jour', fin)),
      h('label', {}, 'Motif (facultatif)', cat),
      h('small', { class: 'muted', text: equipe ? 'Vous pouvez saisir les absences de l’équipe.' : 'Vous saisissez vos propres absences ; celles de l’équipe sont saisies par le cadre.' + ' Jamais de motif médical.' })), boutons);
  }

  // ------------------------------------------------------------ Tâches du service (onglet réservé : régler les tâches)
  function vueTaches() {
    var etat = st(), svs = servicesAffiches();
    var liste = Object.keys(etat.taches).map(function (k) { return etat.taches[k]; }).filter(function (t) { return !t.supprime && svs.indexOf(t.service) >= 0; })
      .sort(function (a, b) { return String(a.heure || '99').localeCompare(String(b.heure || '99')) || String(a.titre).localeCompare(String(b.titre)); });
    var ot = A.optionsTaches(U.config());
    function actions(t) {
      if (t.niveau === 'service') {
        if (peut('TACHE')) return h('button', { class: 'btn petit', onclick: function () { modaleTache(t, 'TACHE'); } }, 'Modifier');
        if (peut('TACHE_AJUSTEMENT') && ot.ajustables.length) return h('button', { class: 'btn petit', onclick: function () { modaleAjustement(t, null); } }, 'Ajuster');
        return null;
      }
      return peut('TACHE_EQUIPE') || peut('TACHE') ? h('button', { class: 'btn petit', onclick: function () { modaleTache(t, 'TACHE_EQUIPE'); } }, 'Modifier') : null;
    }
    liste = liste.filter(function (t) { return t.niveau === 'service' || A.regularite(t.regularite).type !== 'aucune'; });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Tâches récurrentes' }),
        peut('TACHE') ? h('button', { class: 'btn primaire', onclick: function () { modaleTache(null, 'TACHE'); } }, '+ Tâche du service') : null),
      h('p', { class: 'muted', text: 'Liste des tâches du service et des tâches récurrentes. Les tâches ponctuelles s’ajoutent directement dans l’agenda (+ Nouveau). Les tâches apparaissent chaque jour où elles sont dues dans l’agenda, où les agents les cochent « faites » (nom et heure gardés). Une tâche du service est réglée par les rôles qui règlent les tâches : les autres rôles la cochent, l’ajustent si le réglage le permet (agent affecté, heure, précision), mais ne la suppriment pas. Une tâche de l’équipe se modifie et se supprime par toute l’équipe.' }),
      liste.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Tâche', 'Type', 'Service', 'Répétition', 'Heure', 'Pour', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, liste.map(function (t) {
          var p = t.pour || {}, pour = (p.roles || []).map(function (r) { return SIC.modules.obtenir('agenda').droits.libRole(U.config(), r); }).concat((p.agents || []).map(function (id) { return U.App.session.nomAuteur(id); })).concat((p.groupes || []).map(function (g) { return 'groupe ' + SIC.groupes.libelle(U.config(), g); }));
          var aj = Object.keys(t.affectationsJours || {}).filter(function (j) { return t.affectationsJours[j]; }).map(function (j) { return JOURS[j] + ' : ' + t.affectationsJours[j].nom; });
          if (aj.length) pour = pour.concat(['affectée (' + aj.join(', ') + ')']);
          return h('tr', {}, h('td', {}, h('b', { text: t.titre }), t.consigne ? h('div', {}, h('small', { class: 'muted', text: t.consigne })) : null),
            h('td', {}, h('span', { class: 'badge' + (t.niveau === 'service' ? '' : ' ok'), text: t.niveau === 'service' ? 'Service' : 'Équipe' })),
            h('td', { text: U.libService(t.service) }), h('td', { text: 'à partir du ' + String(t.debut || '').split('-').reverse().join('/') + ', ' + libRepetition(t.regularite) }),
            h('td', { text: t.heure || '—' }), h('td', { text: pour.length ? pour.join(', ') : 'toute l’équipe' }),
            h('td', { class: 'actions-ligne' }, actions(t)));
        })))) : h('div', { class: 'panneau vide', text: 'Aucune tâche.' }));
  }

  function modaleTache(t, type, jour) {
    var equipe = type === 'TACHE_EQUIPE', recurrentes = !equipe || A.optionsTaches(U.config()).equipeRecurrentes || peut('TACHE');
    var x = t || {}, reg = A.regularite(x.regularite || { type: recurrentes ? 'jour' : 'aucune' }), pour = x.pour || {};
    var titre = h('input', { type: 'text', maxlength: 120, value: x.titre || '', placeholder: 'ex. Vérifier le chariot d’urgence' });
    var consigne = h('input', { type: 'text', maxlength: 200, value: x.consigne || '', placeholder: 'Précision (facultatif, pas de donnée clinique)' });
    var sv = h('select', {}, U.services().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || (U.App.service !== '*' ? U.App.service : '')) }); }));
    var debut = h('input', { type: 'date', value: x.debut || A.jourISO(jour || Date.now()) }), heure = h('input', { type: 'time', value: x.heure || '' });
    var rep = champsRepetition(reg, null, recurrentes ? null : ['aucune']);
    var D = SIC.modules.obtenir('agenda').droits;
    var casesRoles = D.rolesConfig(U.config()).filter(function (r) { return !r.admin; }).map(function (r) { return { code: r.code, cb: h('input', { type: 'checkbox', checked: (pour.roles || []).indexOf(r.code) >= 0 }), libelle: r.libelle }; });
    // Groupes d'agents du service (équipe de nuit, groupe de travail…), décision du 8 novembre 2026
    var zoneGroupes = h('div', { class: 'actions gauche' }), casesGroupes = [];
    function dessinerGroupes() {
      var coches = casesGroupes.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; }).concat(casesGroupes.length ? [] : (pour.groupes || []));
      U.vider(zoneGroupes);
      casesGroupes = (SIC.groupes ? SIC.groupes.pourService(U.config(), sv.value) : []).map(function (g) { return { code: g.code, cb: h('input', { type: 'checkbox', checked: coches.indexOf(g.code) >= 0 }), libelle: g.libelle }; });
      casesGroupes.forEach(function (c) { zoneGroupes.appendChild(h('label', { class: 'case' }, c.cb, h('span', { text: 'Groupe : ' + c.libelle }))); });
    }
    sv.addEventListener('change', dessinerGroupes);
    dessinerGroupes();
    var boutons = [{ texte: 'Annuler' }];
    if (t) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer la tâche « ' + x.titre + ' » ? Les dates déjà cochées restent au journal.')) return false;
      await U.App.session.enregistrer(type, { id: x.id, supprime: true, service: x.service });
      U.toast('Tâche supprimée.');
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim()) throw new Error('Indiquez la tâche.');
      if (!debut.value) throw new Error('Indiquez la première date.');
      var rg = rep.lire();
      if (rg.type === 'semaine' && !rg.jours.length) rg.jours = [new Date(A.depuisISO(debut.value)).getDay()];
      await U.App.session.enregistrer(type, { id: x.id || 'T' + C.hex(C.aleatoire(5)), titre: titre.value.trim(), consigne: consigne.value.trim(), service: sv.value, debut: debut.value, heure: heure.value || '', regularite: rg,
        pour: { roles: casesRoles.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; }), agents: (pour.agents || []), groupes: casesGroupes.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; }) } });
      U.toast(t ? 'Tâche modifiée.' : 'Tâche ajoutée.');
    } });
    U.modale((t ? 'Modifier la tâche' : 'Nouvelle tâche') + (equipe ? ' de l’équipe' : ' du service'), h('div', { class: 'pile' },
      h('p', { class: 'muted', text: equipe ? 'Tâche de l’équipe : toute l’équipe peut la modifier ou la supprimer.' + (recurrentes ? '' : ' Les tâches récurrentes sont réglées par les rôles qui règlent les tâches du service.') : 'Tâche du service : seuls les rôles qui règlent les tâches la modifient ou la suppriment ; les autres la cochent et l’ajustent selon le réglage.' }),
      h('label', {}, 'Tâche', titre), h('label', {}, 'Précision', consigne),
      h('div', { class: 'grille-3' }, h('label', {}, 'Service', sv), h('label', {}, 'Première date', debut), h('label', {}, 'Heure (facultatif)', heure)),
      rep.noeuds,
      h('div', { class: 'pile' }, h('b', { text: 'Pour (aucune case : toute l’équipe du service)' }), h('div', { class: 'actions gauche' }, casesRoles.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.libelle })); })), zoneGroupes)), boutons, { large: true });
  }

  /**
   * Ajustement d'une tâche du service par un rôle qui ne la règle pas (décision du porteur) : agent affecté à une date
   * ou à certains jours de la répétition, heure et précision si le réglage le permet. Jamais de suppression.
   */
  function modaleAjustement(t, occurrence) {
    var o = A.optionsTaches(U.config()), aj = function (k) { return o.ajustables.indexOf(k) >= 0; }, reg = A.regularite(t.regularite);
    var comptes = (U.App.session.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && (!(c.services || []).length || (c.services || []).indexOf(t.service) >= 0); })
      .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
    var actuel = occurrence ? A.affectation(t, occurrence) : null;
    var selAgent = h('select', {}, [h('option', { value: '', text: 'Personne (retirer l’affectation)' })].concat(comptes.map(function (c) { return h('option', { value: c.id, text: c.nom, selected: !!(actuel && actuel.agent === c.id) }); })));
    var date = h('input', { type: 'date', value: occurrence || A.jourISO(Date.now()) });
    var portee = h('select', { 'aria-label': 'Portée de l’affectation' }, [h('option', { value: 'date', text: 'Cette date seulement' })].concat(reg.type !== 'aucune' ? [h('option', { value: 'jours', text: 'Certains jours de la répétition' })] : []));
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (j) { return { j: j, cb: h('input', { type: 'checkbox', checked: occurrence ? new Date(A.depuisISO(occurrence)).getDay() === j : false }) }; });
    var zoneJours = h('div', { class: 'actions gauche' }, casesJours.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JOURS[c.j] })); }));
    var zoneDate = h('label', {}, 'Date', date);
    function majPortee() { zoneJours.hidden = portee.value !== 'jours'; zoneDate.hidden = portee.value !== 'date'; }
    portee.addEventListener('change', majPortee); majPortee();
    var heure = h('input', { type: 'time', value: t.heure || '' }), consigne = h('input', { type: 'text', maxlength: 200, value: t.consigne || '' });
    var boutons = [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { tache: t.id, service: t.service }, agent = comptes.filter(function (c) { return c.id === selAgent.value; })[0];
      if (aj('affectation')) {
        var change = portee.value === 'jours' ? true : (actuel ? actuel.agent : '') !== selAgent.value || !occurrence || date.value !== occurrence;
        if (change) {
          if (portee.value === 'date') { if (!date.value) throw new Error('Indiquez la date.'); d.occurrence = date.value; }
          else { d.jours = casesJours.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }); if (!d.jours.length) throw new Error('Cochez au moins un jour.'); }
          d.agent = agent ? agent.id : null; d.nom = agent ? agent.nom : '';
        }
      }
      if (aj('heure') && heure.value !== (t.heure || '')) d.heure = heure.value;
      if (aj('consigne') && consigne.value.trim() !== (t.consigne || '')) d.consigne = consigne.value.trim();
      if (Object.keys(d).length <= 2) return true;
      await U.App.session.enregistrer('TACHE_AJUSTEMENT', d);
      U.toast('Tâche ajustée.');
    } }];
    U.modale('Ajuster la tâche « ' + t.titre + ' »', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Tâche du service (' + libRepetition(t.regularite) + '). Vous pouvez l’ajuster dans les limites du réglage de l’établissement ; seuls les rôles qui règlent les tâches la modifient entièrement ou la suppriment.' }),
      aj('affectation') ? h('fieldset', { class: 'role' }, h('legend', { text: 'Agent affecté' }), h('div', { class: 'grille-2' }, h('label', {}, 'Agent', selAgent), h('label', {}, 'Pour', portee)), zoneDate, zoneJours,
        h('small', { class: 'muted', text: 'L’affectation d’une date l’emporte sur celle des jours de la répétition.' })) : null,
      aj('heure') ? h('label', {}, 'Heure', heure) : null,
      aj('consigne') ? h('label', {}, 'Précision (pas de donnée clinique)', consigne) : null), boutons, { large: true });
  }

  // ------------------------------------------------------------ Alertes (sous-étape 6.4)
  function patientsDuService(service, garder) {
    var f = fiches();
    return Object.keys(f).map(function (k) { return f[k]; }).filter(function (p) { return A.serviceDuPatient(p) === service || p.id === garder; })
      .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
  }
  /** Compte de l'agent avec ses groupes d'agents (groupes.js) : tâches et alertes adressées à un groupe. */
  function moiAvecGroupes() { var c = U.App.session.compteEffectif(); return Object.assign({}, c, { groupes: SIC.groupes ? SIC.groupes.de(U.config(), c.id) : [] }); }
  function libAvant(a) { return a.avant ? 'avant le ' + a.avant.split('-').reverse().join('/') + (a.heure ? ' ' + a.heure : '') : 'sans date limite'; }
  function libPour(a) {
    var p = a.pour || {};
    if (p.agent) return p.nom || U.App.session.nomAuteur(p.agent);
    if (p.role) return SIC.modules.obtenir('agenda').droits.libRole(U.config(), p.role);
    if (p.groupe) return 'le groupe ' + (SIC.groupes ? SIC.groupes.libelle(U.config(), p.groupe) : p.groupe);
    return 'toute l’équipe';
  }
  /** Échéances JLD lues à la volée chez Isocont : seulement pour qui a l'accès aux envois au JLD et la clé d'Isocont. */
  function echeancesJLD(maintenant, services) {
    var s = U.App.session;
    if (!s.peut('JLD') || (s.ouvert && !s.ouvert('isocont'))) return null;
    var etat = s.etatModule('isocont');
    return etat ? SIC.modules.lire('isocont.echeancesJLD', etat, { maintenant: maintenant, services: services }) || [] : null;
  }
  /** Alertes du module Suivi médical (retards d'entretien et de contrat, patients non attribués), lues à la volée. */
  function alertesSuivi(maintenant, services) {
    var s = U.App.session;
    if (!s.ouvert || !s.ouvert('suivi')) return [];
    var etat = s.etatModule('suivi');
    return etat ? SIC.modules.lire('suivi.alertes', etat, { config: U.config(), fiches: fiches(), services: services, maintenant: maintenant }) || [] : [];
  }
  function allerAuSuivi() { if (U.ouvrirFenetre) U.ouvrirFenetre('suivi'); }
  function allerAuxAlertes() { U.App.onglet = 'alertes'; U.rendreContenu(); }

  /** Ligne de résumé en tête de l'agenda : alertes de l'équipe, échéances JLD, points de check-list en retard. */
  function resumeAlertes(maintenant) {
    var svs = servicesAffiches(), al = A.alertesEquipe(st(), U.config(), svs, maintenant), jld = echeancesJLD(maintenant, svs) || [], cl = A.alertesChecklists(st(), fiches(), svs, maintenant);
    var parts = [];
    if (al.length) parts.push(al.length + (al.length > 1 ? ' alertes de l’équipe' : ' alerte de l’équipe') + (al.some(function (a) { return a.depassee; }) ? ' (dont en retard)' : ''));
    if (jld.length) parts.push(jld.length + (jld.length > 1 ? ' échéances' : ' échéance') + ' JLD sous 72 h');
    if (cl.length) parts.push(cl.length + (cl.length > 1 ? ' points de check-list en retard' : ' point de check-list en retard'));
    var pv = A.aFaireValider(st(), fiches(), U.config(), svs, maintenant), tr = A.transportsAReserver(st(), fiches(), svs, maintenant, 7, U.config()), am = A.accompagnateursManquants(st(), fiches(), svs, maintenant, 7, U.config());
    if (pv.length) parts.push(pv.length + (pv.length > 1 ? ' validations à obtenir' : ' validation à obtenir') + (pv.some(function (p) { return p.niveau === 'retard'; }) ? ' (dont en retard)' : ''));
    if (tr.length) parts.push(tr.length + (tr.length > 1 ? ' transports à réserver' : ' transport à réserver'));
    if (am.length) parts.push(am.length + (am.length > 1 ? ' événements où il manque des professionnels' : ' événement où il manque des professionnels'));
    var pmq = A.patientsManquants(st(), fiches(), svs, maintenant, 7);
    if (pmq.length) parts.push(pmq.length + (pmq.length > 1 ? ' événements où il manque des patients' : ' événement où il manque des patients'));
    var sm = alertesSuivi(maintenant, svs);
    if (sm.length) parts.push(sm.length + (sm.length > 1 ? ' points de suivi médical à voir' : ' point de suivi médical à voir'));
    if (!parts.length) return null;
    var grave = jld.some(function (j) { return j.statut === 'depasse' || j.statut === 'proche'; }) || al.some(function (a) { return a.depassee; }) || cl.length || pv.some(function (p) { return p.niveau !== 'attente'; }) || tr.some(function (t) { return t.niveau === 'proche'; });
    return h('div', { class: 'agenda-resume-alertes' + (grave ? ' grave' : '') }, h('span', { text: parts.join(' · ') }),
      h('button', { class: 'btn petit', type: 'button', onclick: allerAuxAlertes }, 'Voir les alertes'));
  }

  function carteAlerte(a, avecService) {
    var f = fiches()[a.patientId];
    return h('article', { class: 'agenda-alerte' + (a.depassee ? ' depassee' : '') + (a.vue ? ' vue' : '') },
      h('div', { class: 'barre' }, h('b', { text: a.titre }), a.patientId ? h('span', { class: 'badge', text: A.identite(f, opts().identite) }) : null,
        avecService ? h('span', { class: 'badge', text: U.libService(a.service) }) : null,
        h('span', { class: 'badge ' + (a.depassee ? 'bad' : (a.vue ? 'ok' : 'warn')), text: a.vue ? 'Vue' : (a.depassee ? 'En retard, ' : '') + libAvant(a) }),
        h('div', { class: 'espace' }),
        peut('ALERTE_VUE') ? h('button', { class: 'btn petit' + (a.vue ? '' : ' primaire'), type: 'button', onclick: async function () {
          try { await U.App.session.enregistrer('ALERTE_VUE', { alerte: a.id, annule: a.vue ? true : undefined, service: a.service }); U.rendreContenu(); } catch (e) { alert(e.message); }
        } }, a.vue ? 'Remettre à voir' : 'Vu') : null,
        peut('ALERTE') && !a.vue ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleAlerte(a); } }, 'Modifier') : null),
      a.precision ? h('div', { text: a.precision }) : null,
      h('small', { class: 'muted', text: 'Pour ' + libPour(a) + ' — signalée par ' + U.App.session.nomAuteur(a.par) + ', ' + U.date(Date.parse(a.cree)) + (a.vue ? ' — vue par ' + U.App.session.nomAuteur(a.vue.par) + ', ' + U.date(Date.parse(a.vue.le)) : '') }));
  }

  function vueAlertes(maintenant) {
    var svs = servicesAffiches(), plusieurs = svs.length > 1;
    var al = A.alertesEquipe(st(), U.config(), svs, maintenant, vue.alertesVues ? 7 : 0);
    var jld = echeancesJLD(maintenant, svs), cl = A.alertesChecklists(st(), fiches(), svs, maintenant), reu = A.reunionsAVenir(st(), fiches(), svs, maintenant, 7);
    var cbVues = h('input', { type: 'checkbox', checked: vue.alertesVues, onchange: function () { vue.alertesVues = cbVues.checked; U.rendreContenu(); } });
    var TYPES_MESURE = { Isolement: 'Isolement', Contention: 'Contention' };
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Alertes' }), peut('ALERTE') ? h('button', { class: 'btn primaire', onclick: function () { modaleAlerte(null); } }, '+ Nouvelle alerte') : null),
      h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Alertes de l’équipe' }), h('div', { class: 'espace' }), h('label', { class: 'case' }, cbVues, h('span', { text: 'Montrer les alertes vues depuis 7 jours' }))),
        al.length ? h('div', { class: 'pile' }, al.map(function (a) { return carteAlerte(a, plusieurs); })) : h('p', { class: 'muted', text: 'Aucune alerte à voir.' }),
        h('small', { class: 'muted', text: 'Signalées par l’équipe (ex. patient à voir par le médecin), affichées jusqu’à « Vu ». Information d’organisation : le motif clinique reste dans le dossier du patient.' })),
      jld === null ? null : h('section', { class: 'panneau' }, h('h2', { text: 'Échéances JLD (dépassées ou dans les 72 heures)' }),
        jld.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Échéance', 'Démarche', 'Mesure', 'Patient'].concat(plusieurs ? ['Service'] : []).map(function (t) { return h('th', { text: t }); }))),
          h('tbody', {}, jld.map(function (j) {
            return h('tr', {}, h('td', {}, h('span', { class: 'badge ' + (j.statut === 'depasse' ? 'bad' : (j.statut === 'proche' ? 'warn' : '')), text: U.date(j.date) + (j.statut === 'depasse' ? ' (dépassée)' : '') })),
              h('td', { text: j.libelle }), h('td', { text: (TYPES_MESURE[j.typeMesure] || j.typeMesure) + (j.cycle > 1 ? ', cycle ' + j.cycle : '') }),
              h('td', { text: A.identite(fiches()[j.patientId], opts().identite) }), plusieurs ? h('td', { text: U.libService(j.service) }) : null);
          })))) : h('p', { class: 'muted', text: 'Aucune échéance JLD dans les 72 heures.' }),
        h('small', { class: 'muted', text: 'Calculées par le module Isolement et contention depuis le début de chaque mesure, toujours à jour. L’envoi se trace dans ce module (onglet JLD).' })),
      (function () {
        var pv = A.aFaireValider(st(), fiches(), U.config(), svs, maintenant);
        return h('section', { class: 'panneau' }, h('h2', { text: 'Permissions et validations à obtenir' }),
          pv.length ? h('ul', { class: 'liste-simple' }, pv.map(function (p) {
            return h('li', {}, h('span', { class: 'badge ' + (p.niveau === 'retard' ? 'bad' : (p.niveau === 'proche' ? 'warn' : '')), text: p.niveau === 'retard' ? 'En retard' : 'Avant le ' + libJour(p.echeance) + ' ' + hm(p.echeance) }), ' ',
              h('b', { text: p.validation.libelle + ' : ' }),
              h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(p.rdv, null, !peut('RDV'), null, false, p.occurrence); } }, libelleElement(p.rdv) + (p.rdv.patients && p.rdv.patients.length ? ' — ' + nomsPatients(p.rdv.patients).join(', ') : '')),
              h('span', { text: ' (' + libJour(p.debut) + ' ' + hm(p.debut) + (p.modes.length ? ', ' + p.modes.join(', ') : '') + ')' }));
          })) : h('p', { class: 'muted', text: 'Aucune validation en attente.' }),
          h('small', { class: 'muted', text: 'Permission de sortie : validation médicale attendue avant le début selon le mode d’hospitalisation (réglage de l’établissement). Autres validations : délai choisi sur l’élément. Ouvrez l’élément pour enregistrer la validation (qui a signé).' }));
      })(),
      (function () {
        var tr = A.transportsAReserver(st(), fiches(), svs, maintenant, 15, U.config()), am = A.accompagnateursManquants(st(), fiches(), svs, maintenant, 7, U.config());
        return h('div', { class: 'grille-2' },
          h('section', { class: 'panneau' }, h('h2', { text: 'Transports à réserver (15 jours)' }),
            tr.length ? h('ul', { class: 'liste-simple' }, tr.map(function (t) {
              return h('li', {}, h('span', { class: 'badge ' + (t.niveau === 'proche' ? 'bad' : 'warn'), text: (t.transport.nombre > 1 ? t.transport.nombre + ' ' : '') + A.TRANSPORTS[t.transport.type] }), ' ',
                h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(t.rdv, null, !peut('RDV'), null, false, t.occurrence); } }, libelleElement(t.rdv)),
                h('span', { text: ' — ' + libJour(t.debut) + ' ' + hm(t.debut) + (t.transport.precision ? ' (' + t.transport.precision + ')' : '') }));
            })) : h('p', { class: 'muted', text: 'Aucun transport à réserver.' })),
          h('section', { class: 'panneau' }, h('h2', { text: 'Professionnels à trouver (7 jours)' }),
            am.length ? h('ul', { class: 'liste-simple' }, am.map(function (x) {
              return h('li', {}, badgeAccompagnateurs(x), ' ', h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirElement(x); } }, libelleElement(x.rdv)),
                h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) + ' ' }), boutonInscription(x, true));
            })) : h('p', { class: 'muted', text: 'Aucun professionnel ne manque.' }),
            (function () {
              var pm = A.patientsManquants(st(), fiches(), svs, maintenant, 7);
              return pm.length ? h('div', { class: 'pile' }, h('h2', { text: 'Patients à inscrire (7 jours)' }), h('ul', { class: 'liste-simple' }, pm.map(function (x) {
                var pp = A.placesPatients(x.rdv, x.occurrence);
                return h('li', {}, h('span', { class: 'badge warn', text: 'Patients ' + pp.inscrits.length + '/' + pp.min }), ' ', h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirElement(x); } }, libelleElement(x.rdv)), h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) }));
              }))) : null;
            })()));
      })(),
      h('section', { class: 'panneau' }, h('h2', { text: 'Points de check-list en retard' }),
        cl.length ? h('ul', { class: 'liste-simple' }, cl.map(function (c) {
          return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(c.rdv, null, !peut('RDV'), null, false, c.occurrence); } }, c.rdv.titre || 'Élément'),
            h('span', { text: ' (' + libJour(c.debut) + ' ' + hm(c.debut) + ') : ' + c.item.libelle + ' — attendu ' + (c.item.delai ? 'le ' + libJour(c.item.echeance) : 'le jour même') }));
        })) : h('p', { class: 'muted', text: 'Aucun point en retard.' })),
      (function () {
        var sm = alertesSuivi(maintenant, svs);
        if (!U.App.session.ouvert || !U.App.session.ouvert('suivi')) return null;
        var lib = { entretien: 'entretien médical en retard', contrat: 'contrat de soins à réévaluer', nonAttribue: 'sans médecin' };
        return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'À voir par le médecin (Suivi médical)' }), h('div', { class: 'espace' }), h('button', { class: 'btn petit', type: 'button', onclick: allerAuSuivi }, 'Ouvrir le Suivi médical')),
          sm.length ? h('ul', { class: 'liste-simple' }, sm.map(function (x) {
            return h('li', {}, h('b', { text: SIC.suivi.identite(x.suivi.patient, maintenant) }), h('span', { text: ' — ' + lib[x.type] + (x.niveau ? ' de ' + (x.niveau === 1 ? '1re' : '2e') + ' ligne' : '') + (plusieurs ? ' (' + U.libService(x.service) + ')' : '') }));
          })) : h('p', { class: 'muted', text: 'Rien en retard.' }));
      })(),
      h('section', { class: 'panneau' }, h('h2', { text: 'Réunions des 7 prochains jours' }),
        reu.length ? h('ul', { class: 'liste-simple' }, reu.map(function (x) {
          return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(x.rdv, null, !peut('RDV'), null, false, x.occurrence); } }, x.rdv.titre || 'Réunion'),
            h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) + (x.rdv.lieu ? ', ' + x.rdv.lieu : '') + (plusieurs ? ' (' + U.libService(x.rdv.service) + ')' : '') }));
        })) : h('p', { class: 'muted', text: 'Aucune réunion prévue.' })));
  }

  /** Alerte de l'équipe : type de la liste du service (ou « Autre »), patient du service facultatif, date limite, personne visée. */
  function modaleAlerte(a) {
    var x = a || {}, nouveau = !a;
    var sv = h('select', {}, U.services().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || (U.App.service !== '*' ? U.App.service : '')) }); }));
    var selType = h('select', {}), libre = h('input', { type: 'text', maxlength: 80, value: x.type === 'autre' ? x.libelle || '' : '', placeholder: 'Intitulé de l’alerte' });
    var selPatient = h('select', {}), selPour = h('select', {});
    var zoneLibre = h('label', {}, 'Intitulé', libre);
    function remplir() {
      U.vider(selType);
      A.optionsAgenda(U.config(), sv.value).typesAlertes.concat([{ code: 'autre', libelle: 'Autre (intitulé libre)' }]).forEach(function (t) { selType.appendChild(h('option', { value: t.code, text: t.libelle, selected: t.code === x.type })); });
      if (x.type && !Array.prototype.some.call(selType.options, function (o) { return o.value === x.type; })) selType.appendChild(h('option', { value: x.type, text: x.titre || x.type, selected: true }));
      U.vider(selPatient); selPatient.appendChild(h('option', { value: '', text: 'Aucun patient en particulier' }));
      patientsDuService(sv.value, x.patientId).forEach(function (p) { selPatient.appendChild(h('option', { value: p.id, text: ((p.nom || '') + ' ' + (p.prenom || '')).trim() + (p.ipp ? ' — IPP ' + p.ipp : ''), selected: p.id === x.patientId })); });
      U.vider(selPour); selPour.appendChild(h('option', { value: '', text: 'Toute l’équipe' }));
      var D = SIC.modules.obtenir('agenda').droits, p = x.pour || {};
      D.rolesConfig(U.config()).filter(function (r) { return !r.admin; }).forEach(function (r) { selPour.appendChild(h('option', { value: 'r:' + r.code, text: 'Rôle : ' + r.libelle, selected: p.role === r.code })); });
      (SIC.groupes ? SIC.groupes.pourService(U.config(), sv.value) : []).forEach(function (g) { selPour.appendChild(h('option', { value: 'g:' + g.code, text: 'Groupe : ' + g.libelle, selected: p.groupe === g.code })); });
      (U.App.session.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && (!(c.services || []).length || (c.services || []).indexOf(sv.value) >= 0); })
        .sort(function (m, n) { return (m.nom || '').localeCompare(n.nom || ''); })
        .forEach(function (c) { selPour.appendChild(h('option', { value: 'a:' + c.id, text: c.nom, selected: p.agent === c.id })); });
      majType();
    }
    function majType() { zoneLibre.hidden = selType.value !== 'autre'; }
    selType.addEventListener('change', majType); sv.addEventListener('change', remplir);
    var avant = h('input', { type: 'date', value: x.avant || '' }), heure = h('input', { type: 'time', value: x.heure || '' });
    var precision = h('input', { type: 'text', maxlength: 160, value: x.precision || '', placeholder: 'ex. avant la sortie de vendredi (pas de donnée clinique)' });
    remplir();
    var boutons = [{ texte: 'Annuler' }];
    if (!nouveau) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer cette alerte ?')) return false;
      await U.App.session.enregistrer('ALERTE', { id: x.id, supprime: true, service: x.service });
      U.toast('Alerte supprimée.');
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (selType.value === 'autre' && !libre.value.trim()) throw new Error('Indiquez l’intitulé de l’alerte.');
      var pv = selPour.value, comptes = U.App.session.comptes || [];
      var pour = pv.indexOf('r:') === 0 ? { role: pv.slice(2) } : pv.indexOf('g:') === 0 ? { groupe: pv.slice(2) } : (pv.indexOf('a:') === 0 ? { agent: pv.slice(2), nom: (comptes.filter(function (c) { return c.id === pv.slice(2); })[0] || {}).nom || '' } : null);
      var d = { id: x.id || 'L' + C.hex(C.aleatoire(6)), type: selType.value, libelle: selType.value === 'autre' ? libre.value.trim() : '', service: sv.value, patientId: selPatient.value || null,
        avant: avant.value || '', heure: avant.value ? heure.value || '' : '', pour: pour, precision: precision.value.trim() };
      await U.App.session.enregistrer('ALERTE', d);
      U.toast(nouveau ? 'Alerte ajoutée.' : 'Alerte modifiée.');
    } });
    U.modale(nouveau ? 'Nouvelle alerte' : 'Modifier l’alerte', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Service', sv), h('label', {}, 'Type', selType)), zoneLibre,
      h('label', {}, 'Patient (facultatif)', selPatient),
      h('div', { class: 'grille-3' }, h('label', {}, 'À faire avant le (facultatif)', avant), h('label', {}, 'Heure', heure), h('label', {}, 'Pour', selPour)),
      h('label', {}, 'Précision (facultatif)', precision),
      h('small', { class: 'muted', text: 'Information d’organisation, sans donnée clinique : le motif reste dans le dossier du patient. L’alerte reste affichée jusqu’à ce qu’un agent la marque « Vu ».' })), boutons, { large: true });
  }

  // ------------------------------------------------------------ Mon agenda (sous-étape 6.4)
  function vueMonAgenda(maintenant) {
    var s = U.App.session, moi = moiAvecGroupes(), svs = s.mesServices().map(function (x) { return x.code || x; });
    var debut = lundi(vue.ref), fin = plusJours(debut, 7), m = A.monAgenda(st(), fiches(), U.config(), moi, svs, debut, fin, maintenant);
    var colonnes = [];
    for (var i = 0; i < 7; i++) {
      var j0 = plusJours(debut, i), j1 = plusJours(debut, i + 1), iso = A.jourISO(j0);
      var els = m.elements.filter(function (x) { return x.debut < j1 && (x.fin || x.debut) >= j0; }), ts = m.taches.filter(function (x) { return x.occurrence === iso; });
      var abs = m.absences.filter(function (a) { return a.debut < j1 && (a.fin || a.debut) >= j0; });
      colonnes.push(h('section', { class: 'agenda-jour' + (j0 === minuit(maintenant) ? ' aujourdhui' : '') }, h('h3', { text: libJour(j0) }),
        abs.length ? h('div', { class: 'agenda-absents' }, h('span', { text: 'Absent(e)' + (abs[0].categorie ? ' (' + (A.CATEGORIES_ABSENCE[abs[0].categorie] || '').toLowerCase() + ')' : '') })) : null,
        ts.length ? h('div', { class: 'agenda-taches' }, ts.map(ligneTache)) : null,
        els.length ? els.map(function (x) { return carteElement(x, j0, svs.length > 1); }) : (ts.length || abs.length ? null : h('p', { class: 'muted', text: '—' }))));
    }
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Mon agenda' }), h('div', { class: 'espace' }), h('button', { class: 'btn', onclick: function () { modaleAbsence(null); } }, '+ Absence')),
      bandeauAvis(),
      m.alertes.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Alertes qui me sont adressées' }), h('div', { class: 'pile' }, m.alertes.map(function (a) { return carteAlerte(a, svs.length > 1); }))) : null,
      // Salles réservées par l'agent cette semaine (Salles et bureaux, 0.25.1) ; celles de ses événements figurent sur leur carte
      (function () {
        if (!U.salles || !s.ouvert('salles')) return null;
        var l = U.salles.miennes(debut, fin);
        return l.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Mes salles cette semaine' }), h('ul', { class: 'liste-simple' }, l.map(function (o) {
          return h('li', {}, h('b', { text: libJour(minuit(o.debut)) + ' ' + hm(o.debut) + '–' + hm(o.fin) }), ' ' + U.salles.nomSalle(o.salle) + ' — ' + o.titre + (o.etat ? ' (' + o.etat + ')' : ''));
        }))) : null;
      })(),
      h('div', { class: 'barre' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, -7); U.rendreContenu(); } }, '◀'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = minuit(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, 7); U.rendreContenu(); } }, '▶'),
        h('b', { text: 'Semaine du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) + ' ' + new Date(debut).getFullYear() })),
      h('div', { class: 'agenda-semaine' }, colonnes),
      h('p', { class: 'muted' }, h('small', { text: 'Tous vos services réunis : accompagnements, activités et réunions où vous êtes prévu(e), tâches qui vous sont affectées ou qui reviennent à votre rôle, vos absences. Cette vue reste dans Tessera : aucune copie hors de l’outil.' })));
  }

  // ------------------------------------------------------------ Réglages (Administration → Agenda)

  I.libDelai = libDelai;
  I.selectDelai = selectDelai;
  I.ligneTache = ligneTache;
  I.modaleAbsence = modaleAbsence;
  I.vueTaches = vueTaches;
  I.modaleTache = modaleTache;
  I.echeancesJLD = echeancesJLD;
  I.allerAuxAlertes = allerAuxAlertes;
  I.resumeAlertes = resumeAlertes;
  I.vueAlertes = vueAlertes;
  I.vueMonAgenda = vueMonAgenda;
  /** Page « Aujourd'hui » (0.26.4) : ce que Mon agenda prévoit pour l'agent ce jour (cartes, tâches, absence, alertes). */
  U.monJour = function (maintenant) {
    var s = U.App.session;
    if (!s.ouvert('agenda')) return null;
    var moi = moiAvecGroupes(), svs = s.mesServices().map(function (x) { return x.code || x; }), j0 = minuit(maintenant), j1 = plusJours(j0, 1);
    var m = A.monAgenda(st(), fiches(), U.config(), moi, svs, j0, j1, maintenant);
    return { elements: m.elements.filter(function (x) { return x.debut < j1 && (x.fin || x.debut) >= j0; }).map(function (x) { return carteElement(x, j0, svs.length > 1); }),
      taches: m.taches.filter(function (x) { return x.occurrence === A.jourISO(j0); }).map(ligneTache), absent: m.absences.some(function (a) { return a.debut < j1 && (a.fin || a.debut) >= j0; }), alertes: m.alertes.length };
  };
})();
