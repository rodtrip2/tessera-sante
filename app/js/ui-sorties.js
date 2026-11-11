// SPDX-License-Identifier: EUPL-1.2
/*
 * Sortie envisagée ou actée d'un patient (0.21.0) : fenêtre commune à la fiche patient, à la Vue d'ensemble et à
 * l'Agenda. Modèle : sorties.js ; saisie `SEJOUR` du module Patients (chaque changement est gardé).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, SO = SIC.sorties;
  function session() { return U.App.session; }
  function peut() { try { return session().peut('SEJOUR') && !session().apercu; } catch (e) { return false; } }
  function nom(p) { return ((p.nom || '?') + ' ' + (p.prenom || '')).trim(); }

  /** Fenêtre de la sortie d'un patient (séjour en cours). `puis()` après un enregistrement. */
  function modale(p, puis) {
    var sj = SO.sejourEnCours(p);
    if (!sj) { alert('Ce patient n’a pas de séjour en cours.'); return; }
    var v = sj.sortiePrevue || {}, lecture = !peut(), dis = lecture ? { disabled: true } : {};
    var etat = SO.etat(v), zone = h('div', { class: 'pile' });
    var debut = h('input', Object.assign({ type: 'date', value: v.debut || '' }, dis)), fin = h('input', Object.assign({ type: 'date', value: v.fin || '' }, dis));
    var heure = h('input', Object.assign({ type: 'time', value: v.heure || '' }, dis));
    var precision = h('input', Object.assign({ type: 'text', maxlength: 80, value: v.precision || '', placeholder: 'ex. la semaine prochaine, après la synthèse' }, dis));
    var radios = Object.keys(SO.ETATS).map(function (k) {
      var rb = h('input', Object.assign({ type: 'radio', name: 'etat-sortie', checked: etat === k, onchange: function () { etat = k; dessiner(); } }, dis));
      return h('label', { class: 'case' }, rb, h('span', { text: k === 'actee' ? 'Actée : date arrêtée par le médecin avec le patient' : 'Envisagée : pas encore confirmée' }));
    });
    function dessiner() {
      U.vider(zone);
      if (etat === 'actee') zone.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Date de sortie', debut), h('label', {}, 'Heure (facultatif)', heure)));
      else zone.appendChild(h('div', { class: 'pile' }, h('div', { class: 'grille-2' }, h('label', {}, 'Jour, ou début de la fourchette', debut), h('label', {}, 'Fin de la fourchette (facultatif)', fin)),
        h('small', { class: 'muted', text: 'Un jour précis, une fourchette de dates, ou seulement une approximation ci-dessous.' })));
      zone.appendChild(h('label', {}, etat === 'actee' ? 'Précision (facultatif)' : 'Approximation ou précision', precision));
    }
    dessiner();
    var hist = (sj.historiqueSortiePrevue || []).slice().reverse().map(function (x) { return h('li', {}, U.court(Date.parse(x.le)) + ' — ' + session().nomAuteur(x.par) + ' : ' + (x.valeur ? SO.libelle(x.valeur) : 'retirée')); });
    async function ecrire(val, msg) { await session().enregistrer('SEJOUR', { patientId: p.id, sejourId: sj.id, sortiePrevue: val }); U.toast(msg); }
    U.modale('Sortie — ' + nom(p), h('div', { class: 'pile' }, h('div', { class: 'pile' }, radios), zone,
      h('small', { class: 'muted', text: 'Organisation de la sortie seulement : aucune donnée clinique. Chaque changement est gardé avec son auteur et sa date.' }),
      hist.length ? h('details', {}, h('summary', { text: 'Historique (' + hist.length + ')' }), h('ul', {}, hist)) : null), [
      { texte: lecture ? 'Fermer' : 'Annuler' },
      !lecture && sj.sortiePrevue ? { texte: 'Retirer', classe: 'danger', action: async function () { await ecrire(null, 'Sortie retirée.'); if (puis) puis(); } } : null,
      lecture ? null : { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var val = SO.normaliser({ etat: etat, debut: debut.value, fin: fin.value, heure: heure.value, precision: precision.value });
        if (!val) throw new Error('Indiquez une date, une fourchette ou une approximation.');
        var nouvelleDate = val.etat === 'actee' && (SO.etat(v) !== 'actee' || v.debut !== val.debut);
        await ecrire(val, val.etat === 'actee' ? 'Sortie actée enregistrée.' : 'Sortie envisagée enregistrée.');
        // Sortie actée : événement de l'agenda avec sa check-list, proposé ou créé d'office selon le réglage du service
        if (nouvelleDate && U.agenda && U.agenda.evenementSortie) setTimeout(function () { U.agenda.evenementSortie(p, val, sj); }, 0);
        if (puis) puis();
      } }].filter(Boolean));
  }
  /** Ligne de la fiche patient : la sortie en clair et le bouton qui ouvre la fenêtre. */
  function ligneFiche(p, puis) {
    var sj = SO.sejourEnCours(p);
    if (!sj) return null;
    return h('div', { class: 'barre' }, h('b', { text: 'Sortie : ' }), h('span', { text: sj.sortiePrevue ? SO.libelle(sj.sortiePrevue) : 'non renseignée' }),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { modale(p, puis); } }, peut() ? (sj.sortiePrevue ? 'Modifier…' : 'Sortie envisagée ou actée…') : 'Voir…'));
  }
  U.sorties = { modale: modale, ligneFiche: ligneFiche };
})();
