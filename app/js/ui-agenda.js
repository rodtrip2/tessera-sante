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
    var dues = A.tachesDues(st(), servicesAffiches(), debut, fin), abs = A.absences(st(), debut, fin).filter(function (a) { return !a.service || servicesAffiches().indexOf(a.service) >= 0; });
    var selNature = h('select', { 'aria-label': 'Type d’élément', onchange: function () { vue.nature = selNature.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Tous les éléments' })].concat(Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: vue.nature === k }); })));
    function mode(m, lib) { return h('button', { class: 'btn petit' + (vue.mode === m ? ' primaire' : ''), type: 'button', 'aria-pressed': String(vue.mode === m), onclick: function () { vue.mode = m; try { localStorage.setItem('sic-agenda-mode', m); } catch (e) { /* */ } U.rendreContenu(); } }, lib); }
    var pas = vue.mode === 'jour' ? 1 : 7;
    var titre = vue.mode === 'jour' ? libJour(debut) + ' ' + new Date(debut).getFullYear() : 'Semaine du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) + ' ' + new Date(debut).getFullYear();
    var colonnes = [];
    for (var i = 0; i < n; i++) {
      var j0 = plusJours(debut, i), j1 = plusJours(debut, i + 1);
      var duJour = els.filter(function (x) { return x.debut < j1 && (x.fin || x.debut) >= j0; });
      var tachesJour = dues.filter(function (x) { return x.occurrence === A.jourISO(j0); }), absJour = abs.filter(function (a) { return a.debut < j1 && (a.fin || a.debut) >= j0; });
      colonnes.push(h('section', { class: 'agenda-jour' + (j0 === minuit(maintenant) ? ' aujourdhui' : '') },
        h('h3', { text: libJour(j0) }),
        absJour.length ? h('div', { class: 'agenda-absents' }, absJour.map(function (a) { return h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleAbsence(a); } }, 'Absent(e) : ' + (a.nom || '') + (a.categorie ? ' (' + (A.CATEGORIES_ABSENCE[a.categorie] || a.categorie).toLowerCase() + ')' : '')); })) : null,
        tachesJour.length ? h('div', { class: 'agenda-taches' }, tachesJour.map(ligneTache)) : null,
        duJour.length ? duJour.map(function (x) { return carteElement(x, j0); }) : (tachesJour.length || absJour.length ? null : h('p', { class: 'muted', text: '—' }))));
    }
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Agenda du service' }),
        peut('RDV') ? h('button', { class: 'btn primaire', onclick: function () { modaleElement(null, vue.mode === 'jour' ? vue.ref : null); } }, '+ Nouveau') : null,
        h('button', { class: 'btn', onclick: function () { modaleAbsence(null); } }, '+ Absence'),
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
    var plage = (x.debut < jour ? '…' : hm(x.debut)) + (x.fin ? ' – ' + (x.fin >= plusJours(jour, 1) ? '…' : hm(x.fin)) : '');
    var modifiable = peut('RDV') && (!x.externe || opts().modifAutresServices);
    return h('article', { class: 'agenda-element nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : ''), tabindex: 0, role: 'button',
      'aria-label': (A.NATURES[r.nature] || '') + ' ' + (r.titre || '') + ' ' + plage,
      onclick: function () { modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); },
      onkeydown: function (ev) { if (ev.key === 'Enter') modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); } },
      h('div', { class: 'agenda-plage', text: plage }),
      h('div', {}, h('span', { class: 'badge', text: A.NATURES[r.nature] || 'Élément' }), x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : null),
      h('b', { text: r.titre || '' }),
      r.lieu ? h('div', {}, h('small', { text: r.lieu })) : null,
      x.patients.length ? h('div', {}, h('small', { text: (x.patients.length > 1 ? 'Patients : ' : 'Patient : ') + nomsPatients(x.patients).join(', ') })) : null,
      (r.professionnels || []).length ? h('div', {}, h('small', { class: 'muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') })) : null,
      (r.commentaires || []).length ? h('div', {}, h('small', { class: 'muted', text: r.commentaires.length + ' commentaire(s)' })) : null,
      x.checklist.items.length ? h('div', {}, h('span', { class: 'badge ' + (x.checklist.reste ? 'warn' : 'ok'), text: 'Check-list : ' + (x.checklist.items.length - x.checklist.reste) + '/' + x.checklist.items.length })) : null,
      x.absents.length ? h('div', {}, h('span', { class: 'badge bad', text: 'Absent(e) : ' + x.absents.map(function (p) { return p.nom; }).join(', ') })) : null,
      A.regularite(r.regularite).type !== 'aucune' ? h('div', {}, h('small', { class: 'muted', text: '↻ ' + libRepetition(r.regularite) })) : null);
  }

  /** Fenêtre d'un élément : création (r nul), modification, ou consultation (lecture seule / autre service). */
  function modaleElement(r, jour, lecture, patientsVisibles, externe, occurrence) {
    var x = r || {}, nouveau = !r, dis = lecture ? { disabled: true } : {};
    var reg = A.regularite(x.regularite), checklist = (x.checklist || []).map(function (it) { return { id: it.id, libelle: it.libelle }; });
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
    // Commentaires (tout agent de l'Agenda, y compris sur un élément d'un autre service)
    var zoneCom = h('div', { class: 'pile' });
    function dessinerCommentaires() {
      U.vider(zoneCom);
      var etatR = st().rdv[x.id] || x, liste = etatR.commentaires || [];
      zoneCom.appendChild(liste.length ? h('ul', {}, liste.map(function (c) { return h('li', {}, h('small', { class: 'muted', text: U.date(Date.parse(c.le)) + ' — ' + U.App.session.nomAuteur(c.par) + (c.service ? ' (' + U.libService(c.service) + ')' : '') + ' : ' }), c.texte); }))
        : h('small', { class: 'muted', text: 'Aucun commentaire.' }));
      var txt = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Information d’organisation (pas de donnée clinique)' });
      var monService = U.App.service !== '*' ? U.App.service : (U.App.session.mesServices()[0] || null);
      zoneCom.appendChild(h('div', { class: 'barre' }, txt, h('button', { class: 'btn petit', type: 'button', onclick: async function () {
        if (!txt.value.trim()) return;
        try {
          await U.App.session.enregistrer('COMMENTAIRE', { id: 'K' + C.hex(C.aleatoire(5)), rdv: x.id, texte: txt.value.trim(), service: monService });
          dessinerCommentaires();
        } catch (e) { alert(e.message); }
      } }, 'Ajouter le commentaire')));
    }
    if (!nouveau) dessinerCommentaires();
    sv.addEventListener('change', function () { dessinerPatients(); dessinerPros(); });
    dessinerPatients(); dessinerPros();
    // Répétition (décision du porteur du 7 novembre 2026)
    var selReg = h('select', Object.assign({ onchange: function () { majReg(); } }, dis), Object.keys(A.REGULARITES).map(function (k) { return h('option', { value: k, text: A.REGULARITES[k], selected: reg.type === k }); }));
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (j) { return { j: j, cb: h('input', Object.assign({ type: 'checkbox', checked: reg.jours.indexOf(j) >= 0 }, dis)) }; });
    var jusquAu = h('input', Object.assign({ type: 'date', value: reg.jusquAu }, dis));
    var zoneJours = h('div', { class: 'actions gauche' }, casesJours.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JOURS[c.j] })); }));
    var zoneJusqu = h('label', {}, 'Jusqu’au (vide : sans fin)', jusquAu);
    function majReg() { zoneJours.hidden = selReg.value !== 'semaine'; zoneJusqu.hidden = selReg.value === 'aucune'; }
    majReg();
    // Check-list (décision du porteur : points à réaliser avant l'événement, ex. sortie d'un patient)
    var zoneCheck = h('div', { class: 'pile' });
    function dessinerChecklist() {
      U.vider(zoneCheck);
      var etat = r && occurrence ? A.etatChecklist(st().rdv[x.id] || x, occurrence) : null, peutCocher = !nouveau && occurrence && peut('CHECK');
      checklist.forEach(function (it, i) {
        var f = etat && etat.items.filter(function (y) { return y.id === it.id; })[0];
        var cb = h('input', { type: 'checkbox', checked: !!(f && f.fait), disabled: !peutCocher || !f, onchange: async function () {
          try { await U.App.session.enregistrer('CHECK', { rdv: x.id, item: it.id, occurrence: occurrence, fait: cb.checked, service: externe ? (U.App.service !== '*' ? U.App.service : U.App.session.mesServices()[0]) : x.service }); dessinerChecklist(); }
          catch (e) { cb.checked = !cb.checked; alert(e.message); }
        } });
        zoneCheck.appendChild(h('div', { class: 'barre' }, h('label', { class: 'case' }, cb, h('span', { text: it.libelle })),
          f && f.fait ? h('small', { class: 'muted', text: U.App.session.nomAuteur(f.fait.par) + ', ' + U.date(Date.parse(f.fait.le)) }) : null,
          !lecture ? h('button', { class: 'btn petit', type: 'button', onclick: function () { checklist.splice(i, 1); dessinerChecklist(); } }, 'Retirer') : null));
      });
      if (!checklist.length) zoneCheck.appendChild(h('small', { class: 'muted', text: 'Aucune check-list.' }));
      if (!lecture) {
        var modeles = A.checklists(U.config());
        var selModele = h('select', { 'aria-label': 'Modèle de check-list' }, [h('option', { value: '', text: 'Ajouter un modèle…' })].concat(modeles.map(function (m) { return h('option', { value: m.code, text: m.libelle }); })));
        selModele.addEventListener('change', function () {
          var m = modeles.filter(function (y) { return y.code === selModele.value; })[0];
          if (m) m.items.forEach(function (lib) { if (!checklist.some(function (y) { return y.libelle === lib; })) checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: lib }); });
          dessinerChecklist();
        });
        var libre = h('input', { type: 'text', maxlength: 120, placeholder: 'Autre point à réaliser' });
        zoneCheck.appendChild(h('div', { class: 'barre' }, selModele, libre, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (libre.value.trim()) { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: libre.value.trim() }); dessinerChecklist(); } } }, 'Ajouter')));
        if (!nouveau) zoneCheck.appendChild(h('small', { class: 'muted', text: 'Les points se cochent après l’enregistrement, élément par élément (pour un élément répété : à chaque date).' }));
      }
    }
    dessinerChecklist();
    var boutons = [{ texte: lecture ? 'Fermer' : 'Annuler' }];
    if (!lecture && !nouveau && occurrence && A.regularite(x.regularite).type !== 'aucune') boutons.push({ texte: 'Retirer cette date', action: async function () {
      if (!confirm('Retirer l’occurrence du ' + occurrence.split('-').reverse().join('/') + ' ? Les autres dates sont gardées.')) return false;
      await U.App.session.enregistrer('RDV', { id: x.id, exceptions: (x.exceptions || []).concat([occurrence]), service: x.service });
      U.toast('Date retirée.');
    } });
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
      var rg = { type: selReg.value, jours: selReg.value === 'semaine' ? casesJours.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }) : [], jusquAu: selReg.value === 'aucune' ? '' : jusquAu.value };
      if (rg.jusquAu && rg.jusquAu < date.value) throw new Error('La date de fin de répétition précède la première date.');
      var d = { id: x.id || 'R' + C.hex(C.aleatoire(6)), nature: nature.value, titre: titre.value.trim(), debut: d0, fin: d1, lieu: lieu.value.trim(), service: sv.value,
        patients: nature.value === 'reunion' ? [] : patients, professionnels: profs, regularite: A.regularite(rg), checklist: checklist };
      if (!nouveau) Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k])) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      await U.App.session.enregistrer('RDV', d);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
    } });
    U.modale(nouveau ? 'Nouvel élément de l’agenda' : (lecture ? (A.NATURES[x.nature] || 'Élément') + (externe ? ' — ' + U.libService(x.service) : '') : 'Modifier l’élément'), h('div', { class: 'pile' },
      externe ? h('p', { class: 'muted', text: 'Élément de l’agenda du service ' + U.libService(x.service) + ', qui concerne un patient hospitalisé dans votre service' + (lecture ? ' : consultation et commentaires.' : '.') }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', nature), h('label', {}, 'Service', sv)),
      h('label', {}, 'Intitulé', titre),
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'Début', hDebut), h('label', {}, 'Fin', hFin)),
      h('label', {}, 'Lieu', lieu),
      h('div', { class: 'grille-2' }, h('label', {}, 'Répétition', selReg), zoneJusqu), zoneJours,
      occurrence && reg.type !== 'aucune' ? h('small', { class: 'muted', text: 'Date affichée : ' + occurrence.split('-').reverse().join('/') + '. Une modification s’applique à toutes les dates.' }) : null,
      h('div', { class: 'pile' }, h('b', { text: 'Check-list (à réaliser avant l’événement)' }), zoneCheck),
      h('div', { class: 'pile' }, h('b', { text: 'Patients' + (lecture ? '' : ' (accompagnements et activités)') }), zonePat),
      h('div', { class: 'pile' }, h('b', { text: 'Professionnels prévus' }), zonePro),
      nouveau ? null : h('div', { class: 'pile' }, h('b', { text: 'Commentaires' }), zoneCom),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : le motif et le contenu de la prise en charge restent dans le dossier du patient.' })), boutons, { large: true });
  }

  function libRepetition(v) {
    var r = A.regularite(v);
    if (r.type === 'aucune') return 'une seule fois';
    var t = r.type === 'semaine' ? 'chaque ' + (r.jours.length ? [1, 2, 3, 4, 5, 6, 0].filter(function (j) { return r.jours.indexOf(j) >= 0; }).map(function (j) { return JOURS[j]; }).join(', ') : 'semaine') : A.REGULARITES[r.type].toLowerCase();
    return t + (r.jusquAu ? ' jusqu’au ' + r.jusquAu.split('-').reverse().join('/') : '');
  }

  /** Tâche due un jour : case « faite » (accès « Cocher »), qui et quand. */
  function ligneTache(x) {
    var t = x.tache, moi = U.App.session.compteEffectif(), pourMoi = A.tachePour(t, moi);
    var cb = h('input', { type: 'checkbox', checked: !!x.fait, disabled: !peut('TACHE_FAITE'), 'aria-label': 'Tâche faite : ' + t.titre, onchange: async function () {
      try { await U.App.session.enregistrer('TACHE_FAITE', { tache: t.id, occurrence: x.occurrence, annule: !cb.checked }); }
      catch (e) { cb.checked = !cb.checked; alert(e.message); }
    } });
    return h('div', { class: 'agenda-tache' + (x.fait ? ' faite' : '') + (pourMoi ? '' : ' autre') },
      h('label', { class: 'case' }, cb, h('span', { text: (t.heure ? t.heure + ' ' : '') + t.titre })),
      x.fait ? h('small', { class: 'muted', text: ' ' + U.App.session.nomAuteur(x.fait.par) + ', ' + hm(Date.parse(x.fait.le)) }) : null);
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
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Tâches du service' }), h('button', { class: 'btn primaire', onclick: function () { modaleTache(null); } }, '+ Nouvelle tâche')),
      h('p', { class: 'muted', text: 'Tâches ponctuelles ou récurrentes du service. Elles apparaissent chaque jour où elles sont dues dans l’agenda, où les agents les cochent « faites » (nom et heure gardés).' }),
      liste.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Tâche', 'Service', 'Répétition', 'Heure', 'Pour', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, liste.map(function (t) {
          var p = t.pour || {}, pour = (p.roles || []).map(function (r) { return SIC.modules.obtenir('agenda').droits.libRole(U.config(), r); }).concat((p.agents || []).map(function (id) { return U.App.session.nomAuteur(id); }));
          return h('tr', {}, h('td', {}, h('b', { text: t.titre }), t.consigne ? h('div', {}, h('small', { class: 'muted', text: t.consigne })) : null),
            h('td', { text: U.libService(t.service) }), h('td', { text: 'à partir du ' + String(t.debut || '').split('-').reverse().join('/') + ', ' + libRepetition(t.regularite) }),
            h('td', { text: t.heure || '—' }), h('td', { text: pour.length ? pour.join(', ') : 'toute l’équipe' }),
            h('td', { class: 'actions-ligne' }, h('button', { class: 'btn petit', onclick: function () { modaleTache(t); } }, 'Modifier')));
        })))) : h('div', { class: 'panneau vide', text: 'Aucune tâche.' }));
  }

  function modaleTache(t) {
    var x = t || {}, reg = A.regularite(x.regularite || { type: 'jour' }), pour = x.pour || {};
    var titre = h('input', { type: 'text', maxlength: 120, value: x.titre || '', placeholder: 'ex. Vérifier le chariot d’urgence' });
    var consigne = h('input', { type: 'text', maxlength: 200, value: x.consigne || '', placeholder: 'Précision (facultatif, pas de donnée clinique)' });
    var sv = h('select', {}, U.services().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || (U.App.service !== '*' ? U.App.service : '')) }); }));
    var debut = h('input', { type: 'date', value: x.debut || A.jourISO(Date.now()) }), heure = h('input', { type: 'time', value: x.heure || '' });
    var selReg = h('select', { onchange: function () { majReg(); } }, Object.keys(A.REGULARITES).map(function (k) { return h('option', { value: k, text: A.REGULARITES[k], selected: reg.type === k }); }));
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (j) { return { j: j, cb: h('input', { type: 'checkbox', checked: reg.jours.indexOf(j) >= 0 }) }; });
    var jusquAu = h('input', { type: 'date', value: reg.jusquAu });
    var zoneJours = h('div', { class: 'actions gauche' }, casesJours.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JOURS[c.j] })); }));
    var zoneJusqu = h('label', {}, 'Jusqu’au (vide : sans fin)', jusquAu);
    function majReg() { zoneJours.hidden = selReg.value !== 'semaine'; zoneJusqu.hidden = selReg.value === 'aucune'; }
    majReg();
    var D = SIC.modules.obtenir('agenda').droits;
    var casesRoles = D.rolesConfig(U.config()).filter(function (r) { return !r.admin; }).map(function (r) { return { code: r.code, cb: h('input', { type: 'checkbox', checked: (pour.roles || []).indexOf(r.code) >= 0 }), libelle: r.libelle }; });
    var boutons = [{ texte: 'Annuler' }];
    if (t) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer la tâche « ' + x.titre + ' » ? Les dates déjà cochées restent au journal.')) return false;
      await U.App.session.enregistrer('TACHE', { id: x.id, supprime: true, service: x.service });
      U.toast('Tâche supprimée.');
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim()) throw new Error('Indiquez la tâche.');
      if (!debut.value) throw new Error('Indiquez la première date.');
      var rg = A.regularite({ type: selReg.value, jours: selReg.value === 'semaine' ? casesJours.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }) : [], jusquAu: selReg.value === 'aucune' ? '' : jusquAu.value });
      await U.App.session.enregistrer('TACHE', { id: x.id || 'T' + C.hex(C.aleatoire(5)), titre: titre.value.trim(), consigne: consigne.value.trim(), service: sv.value, debut: debut.value, heure: heure.value || '', regularite: rg,
        pour: { roles: casesRoles.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; }), agents: (pour.agents || []) } });
      U.toast(t ? 'Tâche modifiée.' : 'Tâche ajoutée.');
    } });
    U.modale(t ? 'Modifier la tâche' : 'Nouvelle tâche', h('div', { class: 'pile' },
      h('label', {}, 'Tâche', titre), h('label', {}, 'Précision', consigne),
      h('div', { class: 'grille-3' }, h('label', {}, 'Service', sv), h('label', {}, 'Première date', debut), h('label', {}, 'Heure (facultatif)', heure)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Répétition', selReg), zoneJusqu), zoneJours,
      h('div', { class: 'pile' }, h('b', { text: 'Pour (aucune case : toute l’équipe du service)' }), h('div', { class: 'actions gauche' }, casesRoles.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.libelle })); })))), boutons, { large: true });
  }

  // ------------------------------------------------------------ Réglages (Administration → Agenda)
  function panneauReglages() {
    var o = opts(), copie = function (l) { return l.map(function (t) { return { code: t.code, libelle: t.libelle }; }); };
    // Listes de types d'alertes : celle de l'établissement, et celles propres à certains services (décision du porteur)
    var listes = { '*': copie(o.typesAlertesEtablissement) }, propres = {};
    U.tousServices().forEach(function (s) { propres[s.code] = !!o.typesAlertesServices[s.code]; listes[s.code] = copie(o.typesAlertesServices[s.code] || o.typesAlertesEtablissement); });
    var portee = '*', types = listes['*'];
    var selId = h('select', {}, Object.keys(A.IDENTITES).map(function (k) { return h('option', { value: k, text: A.IDENTITES[k], selected: o.identite === k }); }));
    var cbModif = h('input', { type: 'checkbox', checked: o.modifAutresServices });
    var selPortee = h('select', { 'aria-label': 'Liste des types d’alertes', onchange: function () { portee = selPortee.value; types = listes[portee]; dessiner(); } },
      [h('option', { value: '*', text: 'Liste de l’établissement' })].concat(U.tousServices().map(function (s) { return h('option', { value: s.code, text: 'Service ' + s.libelle }); })));
    // Modèles de check-lists proposés sur les événements (ex. sortie d'un patient)
    var modelesCL = A.checklists(U.config()).map(function (c) { return { code: c.code, libelle: c.libelle, texte: c.items.join('\n') }; });
    var zoneCL = h('div', { class: 'pile' });
    function dessinerCL() {
      U.vider(zoneCL);
      modelesCL.forEach(function (c, i) {
        var lib = h('input', { type: 'text', maxlength: 80, value: c.libelle, 'aria-label': 'Nom du modèle de check-list', oninput: function () { c.libelle = lib.value; } });
        var items = h('textarea', { rows: 5, 'aria-label': 'Points du modèle, un par ligne', oninput: function () { c.texte = items.value; } }, c.texte);
        zoneCL.appendChild(h('fieldset', { class: 'role' }, h('legend', { text: c.libelle || 'Nouveau modèle' }), h('label', {}, 'Nom', lib), h('label', {}, 'Points à réaliser (un par ligne)', items),
          h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { modelesCL.splice(i, 1); dessinerCL(); } }, 'Retirer ce modèle'))));
      });
      zoneCL.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modelesCL.push({ code: 'c' + Date.now().toString(36), libelle: '', texte: '' }); dessinerCL(); } }, '+ Ajouter un modèle de check-list')));
    }
    dessinerCL();
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      types = listes[portee];
      if (portee !== '*') {
        var cbPropre = h('input', { type: 'checkbox', checked: propres[portee], onchange: function () { propres[portee] = cbPropre.checked; if (cbPropre.checked && !listes[portee].length) listes[portee] = copie(listes['*']); dessiner(); } });
        zone.appendChild(h('label', { class: 'case' }, cbPropre, h('span', { text: 'Liste propre à ce service (sinon : liste de l’établissement)' })));
        if (!propres[portee]) { zone.appendChild(h('p', { class: 'muted', text: listes['*'].map(function (t) { return t.libelle; }).join(' · ') })); return; }
      }
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
      h('label', { class: 'case' }, cbModif, h('span', { text: 'Permettre de modifier un élément d’un autre service qui concerne un patient du service (sinon : consultation et commentaires seulement)' })),
      h('h3', { text: 'Modèles de check-lists' }), zoneCL,
      h('h3', { text: 'Types d’alertes' }),
      h('p', { class: 'muted', text: 'Liste proposée à la création d’une alerte, dans cet ordre ; « Autre » (libellé libre) est toujours proposé en dernier. Un service peut avoir sa propre liste. Retirer un type n’efface pas les alertes déjà créées.' }),
      selPortee, zone,
      U.boutonEnregistrer(async function () {
        function nettoyer(l) { return l.map(function (t) { return { code: t.code, libelle: String(t.libelle || '').trim() }; }).filter(function (t) { return t.libelle; }); }
        var etab = nettoyer(listes['*']);
        if (!etab.length) throw new Error('Gardez au moins un type d’alerte dans la liste de l’établissement.');
        var valeur = {};
        if (selId.value !== 'initiales') valeur.identite = selId.value;
        if (JSON.stringify(etab) !== JSON.stringify(A.TYPES_ALERTE_DEFAUT)) valeur.typesAlertes = etab;
        Object.keys(propres).forEach(function (k) {
          if (!propres[k]) return;
          var l = nettoyer(listes[k]);
          if (!l.length) throw new Error('La liste propre au service ' + U.libService(k) + ' est vide : décochez « Liste propre » ou ajoutez un type.');
          (valeur.typesAlertesServices = valeur.typesAlertesServices || {})[k] = l;
        });
        if (cbModif.checked) valeur.modifAutresServices = true;
        var cl = modelesCL.map(function (c) { return { code: c.code, libelle: String(c.libelle || '').trim(), items: String(c.texte || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean) }; }).filter(function (c) { return c.libelle && c.items.length; });
        if (JSON.stringify(cl) !== JSON.stringify(A.CHECKLISTS_DEFAUT)) valeur.checklists = cl;
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { RDV: 'Agenda : élément', COMMENTAIRE: 'Agenda : commentaire', CHECK: 'Agenda : check-list', TACHE: 'Agenda : tâche', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE: 'Agenda : alerte', ALERTE_VUE: 'Agenda : alerte vue' };
  function resume(e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV':
        if (d.supprime) return 'Élément supprimé de l’agenda (' + U.libService(d.service) + ')';
        return (A.NATURES[d.nature] || 'Élément modifié') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.debut ? ' le ' + U.date(d.debut) : '') + (d.service ? ' — ' + U.libService(d.service) : '') + ((d.patients || []).length ? ', ' + d.patients.length + ' patient(s)' : '');
      case 'COMMENTAIRE': var rr = st().rdv[d.rdv]; return 'Commentaire sur ' + (rr ? '« ' + (rr.titre || '') + ' »' : 'un élément') + (d.service ? ' (' + U.libService(d.service) + ')' : '') + ' : ' + (d.texte || '');
      case 'CHECK': var rk = st().rdv[d.rdv], it = rk && (rk.checklist || []).filter(function (y) { return y.id === d.item; })[0]; return 'Check-list de « ' + (rk ? rk.titre : '') + ' » (' + String(d.occurrence || '').split('-').reverse().join('/') + ') : ' + (it ? it.libelle : 'point') + (d.fait === false ? ' décoché' : ' fait');
      case 'TACHE': return (d.supprime ? 'Tâche supprimée' : 'Tâche') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.regularite ? ', ' + libRepetition(d.regularite) : '');
      case 'TACHE_FAITE': return (d.annule ? 'Tâche décochée' : 'Tâche faite') + ' (échéance ' + (d.occurrence || '') + ')';
      case 'ABSENCE': return (d.supprime ? 'Absence supprimée : ' : 'Absence : ') + (d.nom || '') + (d.debut ? ' du ' + U.date(d.debut) : '') + (d.fin ? ' au ' + U.date(d.fin) : '') + (d.categorie ? ' (' + (A.CATEGORIES_ABSENCE[d.categorie] || d.categorie).toLowerCase() + ')' : '');
      case 'ALERTE': return (d.supprime ? 'Alerte supprimée' : 'Alerte') + (d.libelle ? ' « ' + d.libelle + ' »' : '') + (d.avant ? ' avant le ' + U.date(d.avant) : '');
      case 'ALERTE_VUE': return 'Alerte marquée vue';
    }
    return e.type;
  }

  SIC.modules.completerInterface('agenda', {
    vues: { agenda: vueAgenda, taches: vueTaches },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’élément de l’agenda revient à son état précédent.'; } },
    admin: { onglets: function () { return [['agenda', 'Agenda', [panneauReglages()]]]; } }
  });
  U.agenda = { modaleElement: modaleElement };
})();
