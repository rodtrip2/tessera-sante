// SPDX-License-Identifier: EUPL-1.2
/*
 * Suivi médical — planning des psychologues (0.25.0, décisions du porteur du 11 novembre 2026). Logique : module-suivi.js
 * (`PRESENCE_PSY`, `ENTRETIEN_PREVU`, `semainePsy`). Présences habituelles ou ponctuelles, absences avec remplaçant,
 * jours modifiés dans une série, salle occupée ; entretiens prévus seuls ou à l'intérieur d'une présence (dates et
 * heures seulement, aucun contenu). Saisie : psychologues (rôle à créer dans Rôles et accès avec l'accès « planning des
 * psychologues »), secrétaire et cadre.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, S = SIC.suivi, C = SIC.crypto, PSY = SIC.psychologues;
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var vue = { lundi: null, psy: '' };

  function s() { return U.App.session; }
  function st() { return (s() && s().etatModule('suivi')) || S.reduire([]); }
  function cfg() { return U.config(); }
  function peut(t) { return s().peut(t) && !s().apercu; }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function serviceCourant() { return U.App.service !== '*' ? U.App.service : (U.services()[0] || {}).code; }
  function lundiDe(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return S.jourISO(d.getTime()); }
  function jourFr(j) { var d = new Date(S.depuisISO(j)); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function plus(j, n) { return S.jourISO(S.plusJours(S.depuisISO(j), n)); }
  function minutes(x) { var p = String(x).split(':'); return +p[0] * 60 + +p[1]; }
  function psys() { return PSY ? PSY.proposes(cfg(), {}) : []; }
  function idPsy(n) { var m = PSY && PSY.parNom(cfg(), n); return m ? m.id : null; }
  function fiches() { return (U.st() && U.st().patients) || {}; }
  /** Patient en initiales (comme l'agenda par défaut) : « M. D. ». */
  function initiales(p) { if (!p) return 'Patient'; var a = String(p.prenom || '').trim(), b = String(p.nom || '').trim(); return ((a ? a[0].toUpperCase() + '. ' : '') + (b ? b[0].toUpperCase() + '.' : '')).trim() || 'Patient'; }
  function nomSalle(id) { var e = s().ouvert('salles') ? s().etatModule('salles') : null; return id && e && e.salles[id] ? e.salles[id].nom : ''; }

  // ------------------------------------------------------------ Grille de la semaine
  function vuePlanning() {
    var lundi = vue.lundi || lundiDe(Date.now()), sem = S.semainePsy(st(), cfg(), lundi, servicesAffiches(), vue.psy || null).slice(0, 5), pxH = 48, H0 = 8, H1 = 19;
    var sel = h('select', { 'aria-label': 'Psychologue', onchange: function () { vue.psy = sel.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Tous les psychologues' })].concat(psys().map(function (p) { return h('option', { value: p.nom, text: p.nom, selected: p.nom === vue.psy }); })));
    var grille = h('div', { class: 'sb-grille' });
    grille.style.gridTemplateColumns = '56px repeat(5, minmax(150px, 1fr))';
    grille.appendChild(h('div'));
    sem.forEach(function (j) { grille.appendChild(h('div', { class: 'sb-tete' }, h('b', { text: jourFr(j.jour) }))); });
    var hc = h('div', { class: 'sb-heures' }); hc.style.height = (H1 - H0) * pxH + 'px';
    for (var k = H0; k < H1; k++) { var t = h('span', { text: k + ' h' }); t.style.top = (k - H0) * pxH + 'px'; hc.appendChild(t); }
    grille.appendChild(hc);
    sem.forEach(function (j) {
      var col = h('div', { class: 'sb-col' }); col.style.height = (H1 - H0) * pxH + 'px'; col.style.backgroundSize = '100% ' + pxH + 'px';
      // Éléments qui se chevauchent (absence et jour retiré, présences de deux psychologues) : côte à côte
      var voies = [], groupe = [], finG = -1;
      function fermer() { var n = Math.max.apply(null, groupe.map(function (g) { return g.voie; }).concat([0])) + 1; groupe.forEach(function (g) { g.n = n; }); groupe = []; voies = []; }
      j.items.forEach(function (it) {
        var d0 = minutes(it.de), d1 = minutes(it.a);
        if (d0 >= finG) { fermer(); finG = -1; }
        var v = 0; while (voies[v] !== undefined && voies[v] > d0) v++;
        voies[v] = d1; it.voie = v; groupe.push(it); finG = Math.max(finG, d1);
      });
      fermer();
      j.items.forEach(function (it) {
        var a = Math.max(minutes(it.de), H0 * 60), b = Math.min(minutes(it.a), H1 * 60);
        if (b <= a) return;
        var cl = it.genre === 'absence' || it.genre === 'retire' ? 'sb-simple psy-absence' : it.genre === 'entretien' ? 'sb-psy psy-entretien' : 'sb-psy';
        var p = it.patient ? fiches()[it.patient] : null;
        var titre = it.genre === 'entretien' ? it.de + ' · ' + initiales(p) : it.genre === 'retire' ? it.psychologue + ' — retiré ce jour' : it.psychologue + (it.genre === 'absence' ? ' — absent(e)' : '') + (it.modifie ? ' *' : '');
        var detail = it.genre === 'absence' ? (it.precision || 'Absence') + (it.remplacant ? ' · remplacé(e) par ' + it.remplacant : '') : it.genre === 'entretien' ? 'Entretien prévu' + (it.salle ? ' · ' + nomSalle(it.salle) : '') : it.genre === 'retire' ? 'Jour retiré de la série' : [U.libService(it.service), nomSalle(it.salle), it.precision].filter(Boolean).join(' · ');
        var el = h('button', { type: 'button', class: 'sb-bloc ' + cl, onclick: function () { ouvrir(it, j.jour); } }, h('b', { text: titre }), h('span', { text: detail }),
          (it.entretiens || []).map(function (e) { return h('span', { class: 'psy-ent', text: e.de + ' · ' + initiales(fiches()[e.patient]) + (e.salle && e.salle !== it.salle ? ' · ' + nomSalle(e.salle) : '') }); }));
        el.style.top = (a - H0 * 60) / 60 * pxH + 'px'; el.style.height = Math.max(20, (b - a) / 60 * pxH - 2) + 'px';
        if (it.n > 1) { el.style.left = 'calc(' + (100 * it.voie / it.n) + '% + 2px)'; el.style.right = 'auto'; el.style.width = 'calc(' + (100 / it.n) + '% - 4px)'; }
        col.appendChild(el);
      });
      grille.appendChild(col);
    });
    return h('div', { class: 'pile' },
      h('div', { class: 'barre' }, sel,
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Semaine précédente', onclick: function () { vue.lundi = plus(lundi, -7); U.rendreContenu(); } }, '◀'),
        h('b', { text: 'Semaine du ' + jourFr(lundi) + ' au ' + jourFr(plus(lundi, 4)) }),
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Semaine suivante', onclick: function () { vue.lundi = plus(lundi, 7); U.rendreContenu(); } }, '▶'),
        h('div', { class: 'espace' }),
        peut('ENTRETIEN_PREVU') ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleEntretien(null, { jour: lundi }); } }, '+ Entretien prévu') : null,
        peut('PRESENCE_PSY') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modalePresence(null, { jour: lundi }); } }, '+ Présence ou absence') : null),
      psys().length ? null : h('p', { class: 'alerte', text: 'Aucun psychologue dans la liste commune : ajoutez-les dans l’onglet « Psychologues ».' }),
      h('div', { class: 'sb-defile' }, grille),
      h('small', { class: 'muted', text: 'Une présence peut contenir des entretiens prévus ; un entretien prévu peut aussi être saisi seul. La salle choisie est réservée dans Salles et bureaux. Patients en initiales ; dates et heures seulement, aucune donnée clinique. * jour modifié dans une série.' }));
  }
  function ouvrir(it, jour) {
    var ps = st().presencesPsy, en = st().entretiensPrevus;
    if (it.genre === 'entretien') { modaleEntretien(en[it.id]); return; }
    var p = ps[it.id];
    if (!p) return;
    var serie = p.repetition !== 'date', acts = [{ texte: 'Fermer' }];
    if (peut('ENTRETIEN_PREVU') && it.genre === 'presence') acts.push({ texte: 'Ajouter un entretien', action: function () { setTimeout(function () { modaleEntretien(null, { jour: jour, presence: p.id, psychologue: S.psyDe(cfg(), p), de: it.de, salle: p.salle, service: p.service }); }, 0); } });
    if (peut('PRESENCE_PSY')) {
      if (it.genre === 'retire') acts.push({ texte: 'Rétablir ce jour', action: async function () { await s().enregistrer('PRESENCE_PSY', { id: p.id, sauf: (p.sauf || []).filter(function (x) { return x !== jour; }), service: p.service }); U.toast('Jour rétabli.'); } });
      else if (serie) {
        acts.push({ texte: 'Modifier ce jour seulement', action: function () { setTimeout(function () { modalePresence(null, { jourSeul: { serie: p, jour: jour } }); }, 0); } });
        acts.push({ texte: 'Retirer ce jour seulement', action: async function () { await s().enregistrer('PRESENCE_PSY', { id: p.id, sauf: (p.sauf || []).concat([jour]).sort(), service: p.service }); U.toast('Ce jour est retiré de la série.'); } });
      }
      acts.push({ texte: serie ? 'Modifier toute la série' : 'Modifier', classe: 'primaire', action: function () { setTimeout(function () { modalePresence(p); }, 0); } });
    }
    U.modale(S.psyDe(cfg(), p) + ' — ' + jourFr(jour), h('div', { class: 'pile' },
      h('p', { text: (p.nature === 'absence' ? 'Absence' : 'Présence') + ' de ' + (p.de || '09:00') + ' à ' + (p.a || '17:00') + (p.service ? ' — ' + U.libService(p.service) : '') + (p.salle ? ' — ' + nomSalle(p.salle) : '') }),
      p.precision ? h('p', { class: 'muted', text: p.precision }) : null,
      (it.entretiens || []).length ? h('ul', { class: 'liste-simple' }, it.entretiens.map(function (e) { return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(function () { modaleEntretien(en[e.id]); }, 0); } }, e.de + '–' + e.a + ' · ' + initiales(fiches()[e.patient]))); })) : null), acts);
  }

  // ------------------------------------------------------------ Présence ou absence
  function modalePresence(p, init) {
    var ini = init || {}, seul = ini.jourSeul || null;
    var x = seul ? Object.assign({}, seul.serie, { id: null, repetition: 'date', debut: seul.jour, fin: '', jours: [], sauf: undefined }) : (p || {});
    var nature = x.nature || 'presence';
    var selPsy = h('select', { 'aria-label': 'Psychologue' }, [h('option', { value: '', text: '— Choisir le psychologue —' })].concat(psys().map(function (m) { return h('option', { value: m.nom, text: m.nom, selected: m.nom === (x.psychologue ? S.psyDe(cfg(), x) : vue.psy) }); })));
    var selSv = h('select', { 'aria-label': 'Service' }, U.services().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || serviceCourant()) }); }));
    var natP = h('input', { type: 'radio', name: 'nat-psy', checked: nature === 'presence' }), natA = h('input', { type: 'radio', name: 'nat-psy', checked: nature === 'absence' });
    var rep = h('select', { 'aria-label': 'Répétition' }, Object.keys(S.REPETITIONS).map(function (k) { return h('option', { value: k, text: S.REPETITIONS[k], selected: (x.repetition || 'semaine') === k }); }));
    var joursChoisis = (x.jours && x.jours.length ? x.jours : ini.jour ? [new Date(S.depuisISO(ini.jour)).getDay()] : [1]).slice();
    var cases = [1, 2, 3, 4, 5, 6, 0].map(function (d) { var cb = h('input', { type: 'checkbox', checked: joursChoisis.indexOf(d) >= 0, onchange: function () { joursChoisis = cb.checked ? joursChoisis.concat([d]) : joursChoisis.filter(function (y) { return y !== d; }); } }); return h('label', { class: 'case' }, cb, h('span', { text: JOURS[d] })); });
    var debut = h('input', { type: 'date', value: x.debut || ini.jour || S.jourISO(Date.now()), 'aria-label': 'À partir du' }), fin = h('input', { type: 'date', value: x.fin || '', 'aria-label': 'Jusqu’au' });
    var de = h('input', { type: 'time', step: 900, value: x.de || '09:00', 'aria-label': 'De' }), a = h('input', { type: 'time', step: 900, value: x.a || '12:00', 'aria-label': 'À' });
    var prec = h('input', { type: 'text', maxlength: 100, value: x.precision || '', placeholder: 'ex. groupe de parole, formation, congé', 'aria-label': 'Précision' });
    var remp = h('select', { 'aria-label': 'Remplaçant' }, [h('option', { value: '', text: '— Pas de remplaçant —' })].concat(psys().map(function (m) { return h('option', { value: m.nom, text: m.nom, selected: x.remplacant && m.nom === x.remplacant }); })));
    var selSalle = U.salles && s().ouvert('salles') ? U.salles.selecteur({ service: function () { return selSv.value; }, valeur: x.salle || '', exclure: x.id ? 'psy|' + x.id : null,
      periode: function () { var SA = SIC.salles; return debut.value && de.value && a.value ? [SA.instant(debut.value, de.value), SA.instant(debut.value, a.value)] : null; } }) : null;
    if (selSalle) { selSv.addEventListener('change', function () { selSalle.remplir(); }); [debut, de, a].forEach(function (c) { c.addEventListener('change', function () { selSalle.maj(); }); }); }
    var zJours = h('div', { class: 'actions gauche', hidden: rep.value === 'date' }, cases);
    rep.addEventListener('change', function () { zJours.hidden = rep.value === 'date'; });
    var boutons = [{ texte: 'Annuler' }];
    if (p) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () { if (!confirm('Supprimer cette ' + (p.nature === 'absence' ? 'absence' : 'présence') + ' ?')) return false; await s().enregistrer('PRESENCE_PSY', { id: p.id, supprime: true, service: p.service }); U.toast('Supprimé.'); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var nat = natA.checked ? 'absence' : 'presence';
      var d = { id: x.id || 'PP' + C.hex(C.aleatoire(5)), psychologue: selPsy.value, psychologueId: idPsy(selPsy.value), nature: nat, service: selSv.value, repetition: rep.value, debut: debut.value,
        fin: rep.value === 'date' ? '' : fin.value, jours: rep.value === 'date' ? [] : joursChoisis.slice().sort(), de: de.value, a: a.value, precision: prec.value.trim(),
        remplacant: nat === 'absence' ? remp.value : '', remplacantId: nat === 'absence' && remp.value ? idPsy(remp.value) : null, salle: selSalle && nat === 'presence' ? selSalle.valeur() : '' };
      var demandes = [];
      if (d.salle) {
        var SA = SIC.salles, per = [], jj = d.debut;
        for (var n = 0; n < 56 && per.length < 40; n++, jj = plus(jj, 1)) if (S.couvre(d, jj) && jj >= S.jourISO(Date.now() - 864e5)) per.push({ ref: 'psy|' + d.id + '|' + jj, debut: SA.instant(jj, d.de), fin: SA.instant(jj, d.a) });
        demandes = U.salles.verifier({ salle: d.salle, service: d.service, titre: d.psychologue, genre: 'psy', periodes: per, exclure: 'psy|' + d.id });
      }
      if (seul) { d.repetition = 'date'; d.jours = []; d.fin = ''; d.remplace = seul.serie.id; await s().enregistrer('PRESENCE_PSY', { id: seul.serie.id, sauf: (seul.serie.sauf || []).concat([seul.jour]).sort(), service: seul.serie.service }); }
      await s().enregistrer('PRESENCE_PSY', d);
      if (demandes.length) await U.salles.envoyer(demandes);
      if (U.salles) U.salles.synchroniser(true);
      U.toast(seul ? 'Ce jour est modifié ; la série ne change pas les autres jours.' : 'Enregistré.');
    } });
    U.modale(seul ? 'Modifier ce jour seulement (' + jourFr(seul.jour) + ')' : p ? 'Modifier — ' + S.psyDe(cfg(), p) : 'Présence ou absence d’un psychologue', h('div', { class: 'pile' },
      h('div', { class: 'actions gauche' }, h('label', { class: 'case' }, natP, h('span', { text: 'Présence' })), h('label', { class: 'case' }, natA, h('span', { text: 'Absence' }))),
      h('div', { class: 'grille-2' }, h('label', {}, 'Psychologue', selPsy), h('label', {}, 'Service', selSv), h('label', {}, 'Répétition', rep), h('div', {}, h('b', { text: 'Jours' }), zJours),
        h('label', {}, rep.value === 'date' ? 'Date' : 'À partir du', debut), h('label', {}, 'Jusqu’au (facultatif)', fin), h('label', {}, 'De', de), h('label', {}, 'À', a)),
      h('label', {}, 'Remplacé(e) par (absence, facultatif)', remp), h('label', {}, 'Précision (facultatif)', prec),
      selSalle ? h('label', {}, 'Salle occupée (présence, facultatif)', selSalle.noeud) : null), boutons, { large: true });
  }

  // ------------------------------------------------------------ Entretien prévu
  function modaleEntretien(e, init) {
    var ini = init || {}, x = e || ini;
    var selPsy = h('select', { 'aria-label': 'Psychologue' }, [h('option', { value: '', text: '— Choisir le psychologue —' })].concat(psys().map(function (m) { return h('option', { value: m.nom, text: m.nom, selected: m.nom === (x.psychologue ? (e ? S.psyDe(cfg(), x) : x.psychologue) : vue.psy) }); })));
    var sv = x.service || serviceCourant(), patients = S.hospitalises(fiches(), [sv]);
    var selPat = h('select', { 'aria-label': 'Patient' }, [h('option', { value: '', text: '— Choisir le patient —' })].concat(patients.map(function (p) { return h('option', { value: p.id, text: S.identite(p, Date.now()), selected: p.id === x.patient }); })));
    var jour = h('input', { type: 'date', value: x.jour || S.jourISO(Date.now()), 'aria-label': 'Jour' }), de = h('input', { type: 'time', step: 900, value: x.de || '10:00', 'aria-label': 'De' }), a = h('input', { type: 'time', step: 900, value: x.a || (x.de ? String(Math.min(23, +x.de.slice(0, 2) + 1)).padStart(2, '0') + x.de.slice(2) : '11:00'), 'aria-label': 'À' });
    var selSalle = U.salles && s().ouvert('salles') ? U.salles.selecteur({ service: function () { return sv; }, valeur: x.salle || '', exclure: e ? 'entretien|' + e.id : (x.presence ? 'psy|' + x.presence : null),
      periode: function () { var SA = SIC.salles; return jour.value && de.value && a.value ? [SA.instant(jour.value, de.value), SA.instant(jour.value, a.value)] : null; } }) : null;
    if (selSalle) [jour, de, a].forEach(function (c) { c.addEventListener('change', function () { selSalle.maj(); }); });
    var pres = x.presence && st().presencesPsy[x.presence];
    var boutons = [{ texte: 'Annuler' }];
    if (e && peut('ENTRETIEN_PREVU')) boutons.push({ texte: 'Annuler l’entretien', classe: 'danger', action: async function () { if (!confirm('Annuler cet entretien prévu ?')) return false; await s().enregistrer('ENTRETIEN_PREVU', { id: e.id, annule: true, service: e.service }); U.toast('Entretien annulé.'); } });
    if (peut('ENTRETIEN_PREVU')) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { id: (e && e.id) || 'EP' + C.hex(C.aleatoire(5)), psychologue: selPsy.value, psychologueId: idPsy(selPsy.value), patient: selPat.value, jour: jour.value, de: de.value, a: a.value, presence: x.presence || '', salle: selSalle ? selSalle.valeur() : (x.salle || ''), service: sv };
      var demandes = [];
      // Dans la présence et sa salle : la salle est déjà réservée par la présence
      if (d.salle && !(pres && pres.salle === d.salle && S.couvre(pres, d.jour))) demandes = U.salles.verifier({ salle: d.salle, service: sv, titre: 'Entretien prévu — ' + d.psychologue, genre: 'entretien',
        periodes: [{ ref: 'entretien|' + d.id + '|' + d.jour, debut: SIC.salles.instant(d.jour, d.de), fin: SIC.salles.instant(d.jour, d.a) }], exclure: ['entretien|' + d.id].concat(x.presence ? ['psy|' + x.presence] : []) });
      await s().enregistrer('ENTRETIEN_PREVU', d);
      if (demandes.length) await U.salles.envoyer(demandes);
      if (U.salles) U.salles.synchroniser(true);
      U.toast('Entretien prévu enregistré.');
    } });
    U.modale(e ? 'Entretien prévu' : 'Nouvel entretien prévu', h('div', { class: 'pile' },
      pres ? h('p', { class: 'info', text: 'Dans la présence de ' + S.psyDe(cfg(), pres) + ' (' + (pres.de || '09:00') + '–' + (pres.a || '17:00') + (pres.salle ? ', ' + nomSalle(pres.salle) : '') + ').' }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Psychologue', selPsy), h('label', {}, 'Patient', selPat), h('label', {}, 'Jour', jour), h('div', { class: 'grille-2' }, h('label', {}, 'De', de), h('label', {}, 'À', a))),
      selSalle ? h('label', {}, 'Salle (facultatif)', selSalle.noeud) : null,
      h('small', { class: 'muted', text: 'Date et heure seulement : le contenu de l’entretien reste dans le dossier du patient.' })), boutons);
  }

  var c = SIC.modules.obtenir('suivi');
  c.interface.vues = Object.assign({}, c.interface.vues, { 'planning-psy': vuePlanning });
  U.psychologuesPlanning = { vue: vuePlanning, modalePresence: modalePresence, modaleEntretien: modaleEntretien };
})();
