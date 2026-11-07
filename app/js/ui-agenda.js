// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Agenda du service — interface (étape 6, docs/architecture.md § 7 bis). Sous-étape 6.1 : onglet « Agenda »
 * (liste des éléments à venir, en attendant les vues jour et semaine) et libellés du journal.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda;

  function st() { return (U.App.session && U.App.session.etatModule('agenda')) || { rdv: {}, taches: {}, absences: {}, alertes: {} }; }
  function dansService(sv) { return U.App.service === '*' ? U.App.session.mesServices().indexOf(sv) >= 0 || !sv : sv === U.App.service; }

  function vueAgenda(maintenant) {
    var etat = st();
    var aVenir = Object.keys(etat.rdv).map(function (k) { return etat.rdv[k]; })
      .filter(function (r) { return !r.supprime && (r.fin || r.debut) >= maintenant && dansService(r.service); })
      .sort(function (a, b) { return a.debut - b.debut; });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Agenda du service' })),
      h('p', { class: 'muted', text: 'Organisation du service : accompagnements, activités thérapeutiques, réunions, tâches, absences et alertes. La planification arrive dans les prochaines versions ; aucune donnée clinique n’y est enregistrée.' }),
      aVenir.length ? h('ul', {}, aVenir.map(function (r) { return h('li', { text: U.date(r.debut) + ' — ' + (A.NATURES[r.nature] || r.nature) + ' : ' + (r.titre || '') }); }))
        : h('div', { class: 'panneau vide', text: 'Rien de prévu.' }));
  }

  var LIB = { RDV: 'Agenda : rendez-vous', TACHE: 'Agenda : tâche', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE_MEDECIN: 'Agenda : à voir par le médecin', ALERTE_VUE: 'Agenda : alerte vue' };
  function resume(e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV': return (d.supprime ? 'Supprimé : ' : '') + (A.NATURES[d.nature] || 'Élément') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.debut ? ' le ' + U.date(d.debut) : '');
      case 'TACHE': return (d.supprime ? 'Tâche supprimée' : 'Tâche') + (d.titre ? ' « ' + d.titre + ' »' : '');
      case 'TACHE_FAITE': return (d.annule ? 'Tâche décochée' : 'Tâche faite') + ' (échéance ' + (d.occurrence || '') + ')';
      case 'ABSENCE': return (d.supprime ? 'Absence supprimée : ' : 'Absence : ') + (d.nom || '') + (d.debut ? ' du ' + U.date(d.debut) : '') + (d.fin ? ' au ' + U.date(d.fin) : '') + (d.categorie ? ' (' + (A.CATEGORIES_ABSENCE[d.categorie] || d.categorie).toLowerCase() + ')' : '');
      case 'ALERTE_MEDECIN': return (d.supprime ? 'Alerte supprimée' : 'À voir par le médecin') + (d.avant ? ' avant le ' + U.date(d.avant) : '');
      case 'ALERTE_VUE': return 'Alerte « à voir par le médecin » marquée vue';
    }
    return e.type;
  }

  SIC.modules.completerInterface('agenda', {
    vues: { agenda: vueAgenda },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’élément de l’agenda revient à son état précédent.'; } }
  });
})();
