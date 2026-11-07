// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Agenda du service — interface (étape 6, docs/architecture.md § 7 bis). Logique : module-agenda.js.
 * Sous-étape 6.2 : agenda du service (jour, semaine) : accompagnements, activités thérapeutiques, réunions ; éléments
 * d'un autre service qui concernent les patients du service (lecture seule) ; réglages (identité, types d'alertes).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto;
  var JOUR = 864e5, JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var vue = { mode: 'semaine', ref: minuit(Date.now()), nature: '' };
  try { vue.mode = localStorage.getItem('sic-agenda-mode') === 'jour' ? 'jour' : 'semaine'; } catch (e) { /* stockage indisponible */ }

  function st() { return (U.App.session && U.App.session.etatModule('agenda')) || { rdv: {}, taches: {}, absences: {}, alertes: {} }; }
  function fiches() { return (U.st() && U.st().patients) || {}; }
  function opts() { return A.optionsAgenda(U.config()); }
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function lundi(t) { var d = new Date(minuit(t)), j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return d.getTime(); }
  function plusJours(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }   // heures d'été comprises
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function libJour(t) { var d = new Date(t); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function nomsPatients(ids) { var f = fiches(), m = opts().identite; return ids.map(function (id) { return A.identite(f[id], m); }); }
  function peut(t) { return U.App.session.peut(t); }

  // ------------------------------------------------------------ Agenda du service
  function vueAgenda(maintenant) {
    var debut = vue.mode === 'jour' ? vue.ref : lundi(vue.ref), n = vue.mode === 'jour' ? 1 : 7, fin = plusJours(debut, n);
    var els = A.elements(st(), fiches(), servicesAffiches(), debut, fin).filter(function (x) { return !vue.nature || x.rdv.nature === vue.nature; });
    var selNature = h('select', { 'aria-label': 'Type d’élément', onchange: function () { vue.nature = selNature.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Tous les éléments' })].concat(Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: vue.nature === k }); })));
    function mode(m, lib) { return h('button', { class: 'btn petit' + (vue.mode === m ? ' primaire' : ''), type: 'button', 'aria-pressed': String(vue.mode === m), onclick: function () { vue.mode = m; try { localStorage.setItem('sic-agenda-mode', m); } catch (e) { /* */ } U.rendreContenu(); } }, lib); }
    var pas = vue.mode === 'jour' ? 1 : 7;
    var titre = vue.mode === 'jour' ? libJour(debut) + ' ' + new Date(debut).getFullYear() : 'Semaine du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) + ' ' + new Date(debut).getFullYear();
    var colonnes = [];
    for (var i = 0; i < n; i++) {
      var j0 = plusJours(debut, i), j1 = plusJours(debut, i + 1);
      var duJour = els.filter(function (x) { return x.rdv.debut < j1 && (x.rdv.fin || x.rdv.debut) >= j0; });
      colonnes.push(h('section', { class: 'agenda-jour' + (j0 === minuit(maintenant) ? ' aujourdhui' : '') },
        h('h3', { text: libJour(j0) }),
        duJour.length ? duJour.map(function (x) { return carteElement(x, j0); }) : h('p', { class: 'muted', text: '—' })));
    }
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Agenda du service' }),
        peut('RDV') ? h('button', { class: 'btn primaire', onclick: function () { modaleElement(null, vue.mode === 'jour' ? vue.ref : null); } }, '+ Nouveau') : null,
        h('div', { class: 'espace' }), h('label', { class: 'en-ligne nowrap' }, 'Afficher', selNature), mode('jour', 'Jour'), mode('semaine', 'Semaine')),
      h('div', { class: 'barre' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, -pas); U.rendreContenu(); } }, '◀'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = minuit(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, pas); U.rendreContenu(); } }, '▶'),
        h('b', { text: titre })),
      h('div', { class: vue.mode === 'jour' ? 'agenda-un-jour' : 'agenda-semaine' }, colonnes),
      h('p', { class: 'muted' }, h('small', { text: 'Organisation du service, sans donnée clinique (le contenu des accompagnements et des activités reste dans le dossier du patient). Patients désignés selon le réglage de l’établissement (' + A.IDENTITES[opts().identite].toLowerCase() + '). Un élément marqué d’un autre service concerne un patient hospitalisé ici : il se consulte, il se modifie dans l’agenda de son service.' })));
  }

  function carteElement(x, jour) {
    var r = x.rdv;
    var plage = (r.debut < jour ? '…' : hm(r.debut)) + (r.fin ? ' – ' + (r.fin >= plusJours(jour, 1) ? '…' : hm(r.fin)) : '');
    var modifiable = !x.externe && peut('RDV');
    return h('article', { class: 'agenda-element nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : ''), tabindex: 0, role: 'button',
      'aria-label': (A.NATURES[r.nature] || '') + ' ' + (r.titre || '') + ' ' + plage,
      onclick: function () { modaleElement(r, null, !modifiable, x.externe ? x.patients : null); },
      onkeydown: function (ev) { if (ev.key === 'Enter') modaleElement(r, null, !modifiable, x.externe ? x.patients : null); } },
      h('div', { class: 'agenda-plage', text: plage }),
      h('div', {}, h('span', { class: 'badge', text: A.NATURES[r.nature] || 'Élément' }), x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : null),
      h('b', { text: r.titre || '' }),
      r.lieu ? h('div', {}, h('small', { text: r.lieu })) : null,
      x.patients.length ? h('div', {}, h('small', { text: (x.patients.length > 1 ? 'Patients : ' : 'Patient : ') + nomsPatients(x.patients).join(', ') })) : null,
      (r.professionnels || []).length ? h('div', {}, h('small', { class: 'muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') })) : null);
  }

  /** Fenêtre d'un élément : création (r nul), modification, ou consultation (lecture seule / autre service). */
  function modaleElement(r, jour, lecture, patientsVisibles) {
    var x = r || {}, nouveau = !r, dis = lecture ? { disabled: true } : {};
    var sv = h('select', dis, (lecture ? U.tousServices() : U.services()).map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || (U.App.service !== '*' ? U.App.service : '')) }); }));
    var nature = h('select', dis, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: (x.nature || 'accompagnement') === k }); }));
    var titre = h('input', Object.assign({ type: 'text', maxlength: 120, value: x.titre || '', placeholder: 'ex. Rendez-vous extérieur, atelier, synthèse' }, dis));
    var base = x.debut || (jour || minuit(Date.now())) + 10 * 3600e3;
    var date = h('input', Object.assign({ type: 'date', value: jourISO(base) }, dis));
    var hDebut = h('input', Object.assign({ type: 'time', value: hm(base) }, dis)), hFin = h('input', Object.assign({ type: 'time', value: x.fin ? hm(x.fin) : hm(base + 3600e3) }, dis));
    var lieu = h('input', Object.assign({ type: 'text', maxlength: 80, value: x.lieu || '', placeholder: 'ex. Salle d’activités, extérieur' }, dis));
    var patients = (x.patients || []).slice(), profs = (x.professionnels || []).map(function (p) { return { id: p.id || null, nom: p.nom }; });
    var zonePat = h('div', { class: 'pile' }), zonePro = h('div', { class: 'pile' }), recherche = '';
    function fichesDuService() {
      var f = fiches();
      return Object.keys(f).map(function (k) { return f[k]; }).filter(function (p) { return A.serviceDuPatient(p) === sv.value || patients.indexOf(p.id) >= 0; })
        .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
    }
    function dessinerPatients() {
      U.vider(zonePat);
      if (lecture) {
        var ids = patientsVisibles || patients;
        zonePat.appendChild(h('p', { text: ids.length ? nomsPatients(ids).join(', ') : 'Aucun patient.' }));
        if (patientsVisibles && patientsVisibles.length < patients.length) zonePat.appendChild(h('small', { class: 'muted', text: 'Seuls les patients hospitalisés dans votre service sont affichés.' }));
        return;
      }
      var q = recherche.trim().toLowerCase(), liste = fichesDuService().filter(function (p) { return !q || ((p.nom || '') + ' ' + (p.prenom || '') + ' ' + (p.ipp || '')).toLowerCase().indexOf(q) >= 0; });
      var champ = h('input', { type: 'search', placeholder: 'Rechercher un patient du service', value: recherche, oninput: function () { recherche = champ.value; dessinerPatients(); var c = zonePat.querySelector('input[type=search]'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } } });
      zonePat.appendChild(champ);
      zonePat.appendChild(h('div', { class: 'grille-2 liste-cases' }, liste.slice(0, 40).map(function (p) {
        var cb = h('input', { type: 'checkbox', checked: patients.indexOf(p.id) >= 0, onchange: function () { patients = cb.checked ? patients.concat([p.id]) : patients.filter(function (i) { return i !== p.id; }); } });
        return h('label', { class: 'case' }, cb, h('span', { text: (p.nom || '?') + ' ' + (p.prenom || '') + (p.ipp ? ' — IPP ' + p.ipp : '') }));
      })));
      if (liste.length > 40) zonePat.appendChild(h('small', { class: 'muted', text: liste.length - 40 + ' autre(s) : précisez la recherche.' }));
    }
    function dessinerPros() {
      U.vider(zonePro);
      if (lecture) { zonePro.appendChild(h('p', { text: profs.length ? profs.map(function (p) { return p.nom; }).join(', ') : '—' })); return; }
      var comptes = (U.App.session.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && (!(c.services || []).length || (c.services || []).indexOf(sv.value) >= 0 || profs.some(function (p) { return p.id === c.id; })); })
        .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      zonePro.appendChild(h('div', { class: 'grille-2 liste-cases' }, comptes.map(function (c) {
        var cb = h('input', { type: 'checkbox', checked: profs.some(function (p) { return p.id === c.id; }), onchange: function () { profs = cb.checked ? profs.concat([{ id: c.id, nom: c.nom }]) : profs.filter(function (p) { return p.id !== c.id; }); } });
        return h('label', { class: 'case' }, cb, h('span', { text: c.nom }));
      })));
      profs.filter(function (p) { return !p.id; }).forEach(function (p) {
        zonePro.appendChild(h('div', { class: 'barre' }, h('span', { text: p.nom + ' (nom libre)' }), h('button', { class: 'btn petit', type: 'button', onclick: function () { profs = profs.filter(function (y) { return y !== p; }); dessinerPros(); } }, 'Retirer')));
      });
      var libre = h('input', { type: 'text', placeholder: 'Autre professionnel (nom et fonction)' });
      zonePro.appendChild(h('div', { class: 'barre' }, libre, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (libre.value.trim()) { profs.push({ id: null, nom: libre.value.trim() }); dessinerPros(); } } }, 'Ajouter')));
    }
    sv.addEventListener('change', function () { dessinerPatients(); dessinerPros(); });
    dessinerPatients(); dessinerPros();
    var boutons = [{ texte: lecture ? 'Fermer' : 'Annuler' }];
    if (!lecture && !nouveau) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer « ' + (x.titre || 'cet élément') + ' » de l’agenda ?')) return false;
      await U.App.session.enregistrer('RDV', { id: x.id, supprime: true, service: x.service });
      U.toast('Élément supprimé.');
    } });
    if (!lecture) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim()) throw new Error('Indiquez un intitulé.');
      if (!date.value || !hDebut.value) throw new Error('Indiquez la date et l’heure de début.');
      var d0 = new Date(date.value + 'T' + hDebut.value).getTime(), d1 = hFin.value ? new Date(date.value + 'T' + hFin.value).getTime() : null;
      if (d1 !== null && d1 <= d0) throw new Error('L’heure de fin doit suivre l’heure de début.');
      var d = { id: x.id || 'R' + C.hex(C.aleatoire(6)), nature: nature.value, titre: titre.value.trim(), debut: d0, fin: d1, lieu: lieu.value.trim(), service: sv.value,
        patients: nature.value === 'reunion' ? [] : patients, professionnels: profs };
      if (!nouveau) Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k])) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      await U.App.session.enregistrer('RDV', d);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
    } });
    U.modale(nouveau ? 'Nouvel élément de l’agenda' : (lecture ? (A.NATURES[x.nature] || 'Élément') + (patientsVisibles ? ' — ' + U.libService(x.service) : '') : 'Modifier l’élément'), h('div', { class: 'pile' },
      patientsVisibles ? h('p', { class: 'muted', text: 'Élément de l’agenda du service ' + U.libService(x.service) + ', qui concerne un patient hospitalisé dans votre service : consultation seulement.' }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', nature), h('label', {}, 'Service', sv)),
      h('label', {}, 'Intitulé', titre),
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'Début', hDebut), h('label', {}, 'Fin', hFin)),
      h('label', {}, 'Lieu', lieu),
      h('div', { class: 'pile' }, h('b', { text: 'Patients' + (lecture ? '' : ' (accompagnements et activités)') }), zonePat),
      h('div', { class: 'pile' }, h('b', { text: 'Professionnels prévus' }), zonePro),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : le motif et le contenu de la prise en charge restent dans le dossier du patient.' })), boutons, { large: true });
  }

  // ------------------------------------------------------------ Réglages (Administration → Agenda)
  function panneauReglages() {
    var o = opts(), types = o.typesAlertes.map(function (t) { return { code: t.code, libelle: t.libelle }; });
    var selId = h('select', {}, Object.keys(A.IDENTITES).map(function (k) { return h('option', { value: k, text: A.IDENTITES[k], selected: o.identite === k }); }));
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      types.forEach(function (t, i) {
        var champ = h('input', { type: 'text', maxlength: 80, value: t.libelle, 'aria-label': 'Libellé du type d’alerte', oninput: function () { t.libelle = champ.value; } });
        zone.appendChild(h('div', { class: 'barre' }, champ,
          h('button', { class: 'btn petit', type: 'button', disabled: i === 0, title: 'Monter', onclick: function () { types.splice(i - 1, 0, types.splice(i, 1)[0]); dessiner(); } }, '▲'),
          h('button', { class: 'btn petit danger', type: 'button', onclick: function () { types.splice(i, 1); dessiner(); } }, 'Retirer')));
      });
      zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { types.push({ code: 't' + Date.now().toString(36), libelle: '' }); dessiner(); } }, '+ Ajouter un type d’alerte')));
    }
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Agenda du service' }),
      h('label', {}, 'Patient désigné dans l’agenda par', selId),
      h('small', { class: 'muted', text: 'Initiales par défaut. Le nom complet est le plus exposant : à réserver aux services qui en ont besoin (écran visible de l’équipe).' }),
      h('h3', { text: 'Types d’alertes' }),
      h('p', { class: 'muted', text: 'Liste proposée à la création d’une alerte, dans cet ordre ; « Autre » (libellé libre) est toujours proposé en dernier. Retirer un type n’efface pas les alertes déjà créées.' }),
      zone,
      U.boutonEnregistrer(async function () {
        var propres = types.map(function (t) { return { code: t.code, libelle: String(t.libelle || '').trim() }; }).filter(function (t) { return t.libelle; });
        if (!propres.length) throw new Error('Gardez au moins un type d’alerte.');
        var valeur = { identite: selId.value, typesAlertes: propres };
        if (JSON.stringify(valeur) === JSON.stringify({ identite: 'initiales', typesAlertes: A.TYPES_ALERTE_DEFAUT })) valeur = {};
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { RDV: 'Agenda : élément', TACHE: 'Agenda : tâche', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE: 'Agenda : alerte', ALERTE_VUE: 'Agenda : alerte vue' };
  function resume(e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV':
        if (d.supprime) return 'Élément supprimé de l’agenda (' + U.libService(d.service) + ')';
        return (A.NATURES[d.nature] || 'Élément modifié') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.debut ? ' le ' + U.date(d.debut) : '') + (d.service ? ' — ' + U.libService(d.service) : '') + ((d.patients || []).length ? ', ' + d.patients.length + ' patient(s)' : '');
      case 'TACHE': return (d.supprime ? 'Tâche supprimée' : 'Tâche') + (d.titre ? ' « ' + d.titre + ' »' : '');
      case 'TACHE_FAITE': return (d.annule ? 'Tâche décochée' : 'Tâche faite') + ' (échéance ' + (d.occurrence || '') + ')';
      case 'ABSENCE': return (d.supprime ? 'Absence supprimée : ' : 'Absence : ') + (d.nom || '') + (d.debut ? ' du ' + U.date(d.debut) : '') + (d.fin ? ' au ' + U.date(d.fin) : '') + (d.categorie ? ' (' + (A.CATEGORIES_ABSENCE[d.categorie] || d.categorie).toLowerCase() + ')' : '');
      case 'ALERTE': return (d.supprime ? 'Alerte supprimée' : 'Alerte') + (d.libelle ? ' « ' + d.libelle + ' »' : '') + (d.avant ? ' avant le ' + U.date(d.avant) : '');
      case 'ALERTE_VUE': return 'Alerte marquée vue';
    }
    return e.type;
  }

  SIC.modules.completerInterface('agenda', {
    vues: { agenda: vueAgenda },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’élément de l’agenda revient à son état précédent.'; } },
    admin: { onglets: function () { return [['agenda', 'Agenda', [panneauReglages()]]]; } }
  });
  U.agenda = { modaleElement: modaleElement };
})();
