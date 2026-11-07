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
  var vue = { mode: 'semaine', ref: minuit(Date.now()), nature: '', alertesVues: false };
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
  // Affichages retenus par le porteur le 7 novembre 2026 : semaine « A » (ligne « sans heure » par jour au-dessus d'une
  // grille horaire), jour « B » (une colonne par type d'élément, avec sa ligne « sans heure »).
  var PX_HEURE = 44;
  var CATEGORIES_JOUR = [['accompagnement', 'Accompagnements'], ['entretien', 'Entretiens'], ['activite', 'Activités'], ['reunion', 'Réunions'],
    ['sorties', 'Sorties et permissions'], ['tache', 'Tâches'], ['autre', 'Autres']];
  function categorieJour(nature) { return nature === 'sortie' || nature === 'permission' ? 'sorties' : (A.NATURES[nature] ? nature : 'autre'); }
  function couleurs() { return opts().couleurs; }
  function teinter(el, couleur) { if (couleur) el.style.setProperty('--c', couleur); return el; }   // CSSOM (CSP sans style en ligne)
  /** Libellé d'un élément : son intitulé, sinon son type (« Entretien infirmier avec la famille », « Permission validée »). */
  function libelleElement(r) {
    if (r.titre) return r.titre;
    if (r.nature === 'entretien') { var e = r.entretien || {}; return 'Entretien' + (A.ENTRETIENS[e.type] ? ' ' + A.ENTRETIENS[e.type] : '') + (e.avec === 'famille' ? ' avec la famille' : ''); }
    if (r.nature === 'permission') return A.STATUTS_PERMISSION[r.statut === 'validee' ? 'validee' : 'demande'];
    return A.NATURES[r.nature] || 'Élément';
  }
  function memeJour(a, b) { return minuit(a) === minuit(b); }
  /** Puce de la ligne « sans heure » : alerte, échéance JLD, validation, tâche sans heure, absence, élément sur plusieurs jours. */
  function puce(genre, texte, action, couleur, titre) {
    var el = h(action ? 'button' : 'div', { class: 'ag-puce ag-' + genre, type: action ? 'button' : null, title: titre || texte, onclick: action || null }, h('span', { text: texte }));
    return teinter(el, couleur);
  }

  /** Bouton « S'inscrire » / « Me désinscrire » comme accompagnateur d'une occurrence. */
  function boutonInscription(x, petit) {
    var acc = x.accompagnateurs, moi = U.App.session.compteEffectif();
    if (!acc || !acc.requis || x.externe || U.App.session.apercu) return null;
    var inscrit = acc.inscrits.some(function (i) { return i.agent === moi.id; }), prevu = (x.rdv.professionnels || []).some(function (p) { return p.id === moi.id; });
    if (prevu || (!inscrit && !acc.manque)) return null;
    return h('button', { class: 'btn ' + (petit ? 'petit ag-inscrire' : 'petit') + (inscrit ? '' : ' primaire'), type: 'button', onclick: async function (ev) {
      ev.stopPropagation();
      try {
        await U.App.session.enregistrer('INSCRIPTION', { rdv: x.rdv.id, occurrence: x.occurrence, agent: moi.id, nom: moi.nom, retrait: inscrit ? true : undefined, service: x.rdv.service });
        U.toast(inscrit ? 'Vous n’êtes plus inscrit(e).' : 'Vous êtes inscrit(e) comme accompagnateur.');
      } catch (e) { alert(e.message); }
    } }, inscrit ? 'Me désinscrire' : 'S’inscrire');
  }
  function badgeAccompagnateurs(x) {
    var acc = x.accompagnateurs;
    if (!acc || !acc.requis) return null;
    return h('span', { class: 'badge ' + (acc.manque ? 'warn' : 'ok'), title: acc.inscrits.length ? 'Inscrits : ' + acc.inscrits.map(function (i) { return i.nom; }).join(', ') : 'Aucun inscrit', text: 'Accompagnateurs ' + acc.total + '/' + acc.requis });
  }
  function ouvrirElement(x) {
    var modifiable = peut('RDV') && (!x.externe || opts().modifAutresServices);
    modaleElement(x.rdv, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence);
  }
  /** Bloc d'un élément dans la grille horaire. */
  function blocElement(x, jour) {
    var r = x.rdv, plage = (x.debut < jour ? '…' : hm(x.debut)) + (x.fin ? '–' + (x.fin >= plusJours(jour, 1) ? '…' : hm(x.fin)) : '');
    var cl = x.checklist.items.length ? A.etatChecklist(r, x.occurrence, Date.now()) : null;
    var el = h('article', { class: 'ag-bloc nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : '') + (r.nature === 'permission' && r.statut !== 'validee' ? ' demande' : ''), tabindex: 0, role: 'button',
      'aria-label': (A.NATURES[r.nature] || '') + ' ' + libelleElement(r) + ' ' + plage, onclick: function () { ouvrirElement(x); }, onkeydown: function (ev) { if (ev.key === 'Enter') ouvrirElement(x); } },
      h('div', { class: 'ag-bloc-tete' }, h('b', { text: plage + ' ' + libelleElement(r) })),
      x.patients.length ? h('div', { class: 'ag-ligne', text: nomsPatients(x.patients).join(', ') }) : null,
      r.lieu ? h('div', { class: 'ag-ligne muted', text: r.lieu }) : null,
      (r.professionnels || []).length ? h('div', { class: 'ag-ligne muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') }) : null,
      h('div', { class: 'ag-badges' },
        r.nature === 'permission' ? h('span', { class: 'badge ' + (r.statut === 'validee' ? 'ok' : 'warn'), text: r.statut === 'validee' ? 'Validée' : 'Demande' }) : null,
        x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : null,
        badgeAccompagnateurs(x), boutonInscription(x, true),
        cl ? h('span', { class: 'badge ' + (cl.alertes ? 'bad' : (cl.reste ? 'warn' : 'ok')), text: 'Check-list ' + (cl.items.length - cl.reste) + '/' + cl.items.length }) : null,
        x.absents.length ? h('span', { class: 'badge bad', text: 'Absent(e) : ' + x.absents.map(function (p) { return p.nom; }).join(', ') }) : null,
        A.regularite(r.regularite).type !== 'aucune' ? h('span', { class: 'ag-repete', title: A.libelleRepetition(r.regularite), text: '↻' }) : null));
    return teinter(el, couleurs()[r.nature] || couleurs().autre);
  }
  /** Bloc d'une tâche à heure fixe dans la grille. */
  function blocTache(x) { return teinter(h('div', { class: 'ag-bloc ag-bloc-tache' }, ligneTache(x)), couleurs().tache); }
  function debutTache(x) { var d = new Date(A.depuisISO(x.occurrence)), m = /^(\d{2}):(\d{2})$/.exec(x.tache.heure || ''); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }

  /**
   * Grille horaire : colonnes [{ titre, aujourdhui, bande: [nœuds], items: [{ debut, fin, noeud }] }], journée `jour` de
   * chaque colonne. Les éléments qui se chevauchent se partagent la largeur de la colonne.
   */
  function grille(colonnes, h0, h1, maintenant) {
    var racine = h('div', { class: 'ag-grille' });
    racine.style.setProperty('--n', String(colonnes.length));
    racine.appendChild(h('div', { class: 'ag-rangee ag-entetes' }, h('div', { class: 'ag-coin' }), colonnes.map(function (c) { return h('div', { class: 'ag-titre-col' + (c.aujourdhui ? ' aujourdhui' : '') + (c.classe ? ' ' + c.classe : '') }, c.titre); })));
    racine.appendChild(h('div', { class: 'ag-rangee ag-bande' }, h('div', { class: 'ag-coin' }, h('small', { text: 'Sans heure' })), colonnes.map(function (c) { return h('div', { class: 'ag-cellule-bande' + (c.aujourdhui ? ' aujourdhui' : '') }, c.bande); })));
    var hauteur = (h1 - h0) * PX_HEURE, corps = h('div', { class: 'ag-rangee ag-corps' });
    corps.style.setProperty('--hauteur', hauteur + 'px');
    var heures = h('div', { class: 'ag-heures' });
    for (var k = h0; k < h1; k++) { var l = h('div', { class: 'ag-heure', text: k + ' h' }); l.style.top = ((k - h0) * PX_HEURE) + 'px'; heures.appendChild(l); }
    corps.appendChild(heures);
    colonnes.forEach(function (c) {
      var col = h('div', { class: 'ag-colonne' + (c.aujourdhui ? ' aujourdhui' : '') });
      for (var k2 = h0 + 1; k2 < h1; k2++) { var t = h('div', { class: 'ag-trait' }); t.style.top = ((k2 - h0) * PX_HEURE) + 'px'; col.appendChild(t); }
      var base = c.jour + h0 * 36e5;
      // Répartition des chevauchements : groupes d'éléments qui se recouvrent, une sous-colonne par élément simultané
      var items = c.items.slice().sort(function (a, b) { return a.debut - b.debut || b.fin - a.fin; }), groupe = [], finGroupe = -Infinity;
      function placer() {
        var voies = [];
        groupe.forEach(function (it) { var v = 0; while (voies[v] !== undefined && voies[v] > it.debut) v++; voies[v] = it.fin; it.voie = v; });
        groupe.forEach(function (it) {
          var n = voies.length, haut = Math.max(0, (it.debut - base) / 36e5 * PX_HEURE), bas = Math.min(hauteur, (it.fin - base) / 36e5 * PX_HEURE);
          it.noeud.style.top = haut + 'px'; it.noeud.style.height = Math.max(22, bas - haut - 2) + 'px';
          it.noeud.style.left = 'calc(' + (100 * it.voie / n) + '% + 2px)'; it.noeud.style.width = 'calc(' + (100 / n) + '% - 4px)';
          col.appendChild(it.noeud);
        });
        groupe = []; finGroupe = -Infinity;
      }
      items.forEach(function (it) { if (it.debut >= finGroupe && groupe.length) placer(); groupe.push(it); finGroupe = Math.max(finGroupe, it.fin); });
      if (groupe.length) placer();
      if (c.aujourdhui && maintenant >= base && maintenant < base + hauteur / PX_HEURE * 36e5) { var m = h('div', { class: 'ag-maintenant' }); m.style.top = ((maintenant - base) / 36e5 * PX_HEURE) + 'px'; col.appendChild(m); }
      corps.appendChild(col);
    });
    racine.appendChild(corps);
    return h('div', { class: 'ag-defile' }, racine);
  }

  /** Éléments de la période, répartis : à heure fixe (dans la grille) ou sur plusieurs jours (ligne « sans heure »). */
  function itemsDuJour(els, dues, j0) {
    var j1 = plusJours(j0, 1), res = { heures: [], bande: [] };
    els.forEach(function (x) {
      if (!(x.debut < j1 && (x.fin || x.debut) >= j0)) return;
      var fin = x.fin || x.debut + 30 * 6e4;
      if (memeJour(x.debut, fin - 1)) res.heures.push({ x: x, debut: x.debut, fin: Math.max(fin, x.debut + 30 * 6e4) });
      else res.bande.push(x);
    });
    dues.forEach(function (t) { if (t.occurrence === A.jourISO(j0)) { if (/^\d{2}:\d{2}$/.test(t.tache.heure || '')) { var d = debutTache(t); res.heures.push({ t: t, debut: d, fin: d + 30 * 6e4 }); } else res.bande.push(t); } });
    return res;
  }
  function puceElementLong(x, j0) {
    var r = x.rdv, lib = (x.debut < j0 ? '… ' : hm(x.debut) + ' ') + libelleElement(r) + (x.patients.length ? ' — ' + nomsPatients(x.patients).join(', ') : '') + (x.fin && x.fin > plusJours(j0, 1) ? ' …' : (x.fin ? ' → ' + hm(x.fin) : ''));
    return puce('element', lib, function () { ouvrirElement(x); }, couleurs()[r.nature] || couleurs().autre);
  }
  function puceTache(t) { return teinter(h('div', { class: 'ag-puce ag-tache-bande' }, ligneTache(t)), couleurs().tache); }
  /** Repères de la période (alertes, échéances JLD, permissions à valider, check-lists en retard), par jour. */
  function reperesParJour(debut, n, maintenant) {
    var svs = servicesAffiches(), res = {}, aujourdhui = A.jourISO(maintenant);
    function ajouter(jourIso, noeud) { (res[jourIso] = res[jourIso] || []).push(noeud); }
    function jourDe(t, enRetard) { var iso = A.jourISO(t); return enRetard && iso < aujourdhui ? aujourdhui : iso; }
    A.alertesEquipe(st(), U.config(), svs, maintenant).forEach(function (a) {
      var iso = a.avant && a.avant >= aujourdhui ? a.avant : aujourdhui;
      ajouter(iso, puce('alerte', a.titre + (a.patientId ? ' — ' + A.identite(fiches()[a.patientId], opts().identite) : '') + (a.heure && a.avant === iso ? ' (' + a.heure + ')' : ''), allerAuxAlertes, couleurs().alerte));
    });
    (echeancesJLD(maintenant, svs) || []).forEach(function (j) { ajouter(jourDe(j.date, true), puce('jld', 'JLD : ' + j.libelle.toLowerCase() + ' — ' + A.identite(fiches()[j.patientId], opts().identite) + ' ' + hm(j.date), allerAuxAlertes)); });
    A.permissionsAValider(st(), fiches(), U.config(), svs, maintenant).forEach(function (p) {
      ajouter(jourDe(p.echeance, true), puce('validation' + (p.niveau === 'retard' ? ' retard' : ''), 'Faire valider la permission — ' + nomsPatients(p.rdv.patients || []).join(', ') + ' (avant ' + libJour(p.echeance) + ' ' + hm(p.echeance) + ')', function () { modaleElement(p.rdv, null, !peut('RDV'), null, false, p.occurrence); }));
    });
    A.alertesChecklists(st(), fiches(), svs, maintenant).forEach(function (c) { ajouter(aujourdhui, puce('alerte', 'Check-list en retard : ' + c.item.libelle + ' (' + libelleElement(c.rdv) + ')', function () { modaleElement(c.rdv, null, !peut('RDV'), null, false, c.occurrence); }, couleurs().alerte)); });
    return res;
  }
  function puceAbsence(a) { return puce('absence', 'Absent(e) : ' + (a.nom || '') + (a.categorie ? ' (' + (A.CATEGORIES_ABSENCE[a.categorie] || a.categorie).toLowerCase() + ')' : ''), function () { modaleAbsence(a); }); }
  function bornesHeures(items) {
    var h0 = 7, h1 = 21;
    items.forEach(function (it) { var d = new Date(it.debut), f = new Date(it.fin - 1); if (memeJour(it.debut, it.fin - 1)) { h0 = Math.min(h0, d.getHours()); h1 = Math.max(h1, f.getHours() + 1); } });
    return [Math.max(0, h0), Math.min(24, h1)];
  }
  function noeudItem(it, j0) { return it.x ? blocElement(it.x, j0) : blocTache(it.t); }

  function vueAgenda(maintenant) {
    var semaine = vue.mode !== 'jour', debut = semaine ? lundi(vue.ref) : vue.ref, n = semaine ? 7 : 1, fin = plusJours(debut, n), svs = servicesAffiches();
    var els = vue.nature === 'tache' ? [] : A.elements(st(), fiches(), svs, debut, fin).filter(function (x) { return !vue.nature || x.rdv.nature === vue.nature; });
    var dues = !vue.nature || vue.nature === 'tache' ? A.tachesDues(st(), svs, debut, fin) : [];
    var abs = A.absences(st(), debut, fin).filter(function (a) { return !a.service || svs.indexOf(a.service) >= 0; });
    var reperes = reperesParJour(debut, n, maintenant);
    var selNature = h('select', { 'aria-label': 'Type d’élément', onchange: function () { vue.nature = selNature.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Tous les éléments' })].concat(Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: vue.nature === k }); }), [h('option', { value: 'tache', text: 'Tâches', selected: vue.nature === 'tache' })]));
    function mode(m, lib) { return h('button', { class: 'btn petit' + (vue.mode === m ? ' primaire' : ''), type: 'button', 'aria-pressed': String(vue.mode === m), onclick: function () { vue.mode = m; try { localStorage.setItem('sic-agenda-mode', m); } catch (e) { /* */ } U.rendreContenu(); } }, lib); }
    var pas = semaine ? 7 : 1;
    var titre = semaine ? 'Semaine du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) + ' ' + new Date(debut).getFullYear() : libJour(debut) + ' ' + new Date(debut).getFullYear();
    var tous = [], colonnes = [];
    if (semaine) {
      for (var i = 0; i < 7; i++) {
        var j0 = plusJours(debut, i), r = itemsDuJour(els, dues, j0), iso = A.jourISO(j0);
        var absJour = abs.filter(function (a) { return a.debut < plusJours(j0, 1) && (a.fin || a.debut) >= j0; });
        tous = tous.concat(r.heures);
        colonnes.push({ jour: j0, titre: h('button', { class: 'btn lien', type: 'button', title: 'Voir la journée', onclick: (function (t) { return function () { vue.mode = 'jour'; vue.ref = t; U.rendreContenu(); }; })(j0) }, libJour(j0)),
          aujourdhui: j0 === minuit(maintenant), classe: [0, 6].indexOf(new Date(j0).getDay()) >= 0 ? 'weekend' : '',
          bande: (reperes[iso] || []).concat(absJour.map(puceAbsence), r.bande.map(function (x) { return x.tache ? puceTache(x) : puceElementLong(x, j0); })),
          items: r.heures.map(function (it) { return { debut: it.debut, fin: it.fin, noeud: noeudItem(it, j0) }; }) });
      }
    } else {
      var rj = itemsDuJour(els, dues, debut), isoJ = A.jourISO(debut);
      tous = rj.heures;
      CATEGORIES_JOUR.forEach(function (c) {
        var hs = rj.heures.filter(function (it) { return it.t ? c[0] === 'tache' : categorieJour(it.x.rdv.nature) === c[0]; });
        var bs = rj.bande.filter(function (x) { return x.tache ? c[0] === 'tache' : categorieJour(x.rdv.nature) === c[0]; });
        if (c[0] === 'autre' && !hs.length && !bs.length) return;
        if (vue.nature && !hs.length && !bs.length) return;
        var cle = c[0] === 'sorties' ? 'permission' : c[0];
        colonnes.push({ jour: debut, titre: teinter(h('span', { class: 'ag-titre-cat', text: c[1] }), couleurs()[cle] || couleurs().autre), aujourdhui: debut === minuit(maintenant), classe: 'categorie',
          bande: bs.map(function (x) { return x.tache ? puceTache(x) : puceElementLong(x, debut); }),
          items: hs.map(function (it) { return { debut: it.debut, fin: it.fin, noeud: noeudItem(it, debut) }; }) });
      });
      var absJ = abs.filter(function (a) { return a.debut < plusJours(debut, 1) && (a.fin || a.debut) >= debut; });
      var reperesJour = (reperes[isoJ] || []);
    }
    var b = bornesHeures(tous);
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Agenda du service' }),
        peut('RDV') || peut('TACHE_EQUIPE') || peut('TACHE') ? h('button', { class: 'btn primaire', onclick: function () { modaleAjout(semaine ? null : vue.ref); } }, '+ Nouveau') : null,
        h('button', { class: 'btn', onclick: function () { modaleAbsence(null); } }, '+ Absence'),
        h('div', { class: 'espace' }), h('label', { class: 'en-ligne nowrap' }, 'Afficher', selNature), mode('jour', 'Jour'), mode('semaine', 'Semaine')),
      resumeAlertes(maintenant),
      h('div', { class: 'barre' },
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Précédent', onclick: function () { vue.ref = plusJours(vue.ref, -pas); U.rendreContenu(); } }, '◀'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = minuit(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Suivant', onclick: function () { vue.ref = plusJours(vue.ref, pas); U.rendreContenu(); } }, '▶'),
        h('b', { text: titre })),
      !semaine && (absJ.length || reperesJour.length) ? h('div', { class: 'ag-repères-jour' }, absJ.map(puceAbsence), reperesJour) : null,
      grille(colonnes, b[0], b[1], maintenant),
      legende(),
      h('p', { class: 'muted' }, h('small', { text: 'Organisation du service, sans donnée clinique (le contenu des accompagnements, entretiens et activités reste dans le dossier du patient). Patients désignés selon le réglage de l’établissement (' + A.IDENTITES[opts().identite].toLowerCase() + '). Un élément marqué d’un autre service concerne un patient hospitalisé ici : il se consulte, il se modifie dans l’agenda de son service.' })));
  }
  function legende() {
    var c = couleurs();
    return h('div', { class: 'ag-legende' }, Object.keys(A.NATURES).map(function (k) { return teinter(h('span', { class: 'ag-cle' + (k === 'permission' ? ' demande' : '') }, h('i'), A.NATURES[k]), c[k]); }),
      teinter(h('span', { class: 'ag-cle' }, h('i'), 'Tâche'), c.tache), teinter(h('span', { class: 'ag-cle' }, h('i'), 'Alerte'), c.alerte));
  }

  /** « + Nouveau » : un seul point d'entrée pour les événements et les tâches (décision du porteur du 7 novembre 2026). */
  function modaleAjout(jour) {
    var choix = [];
    if (peut('RDV')) Object.keys(A.NATURES).forEach(function (k) { choix.push({ lib: A.NATURES[k], couleur: couleurs()[k], action: function () { modaleElement(null, jour, false, null, false, null, k); } }); });
    if (peut('TACHE_EQUIPE')) choix.push({ lib: 'Tâche de l’équipe', couleur: couleurs().tache, action: function () { modaleTache(null, 'TACHE_EQUIPE', jour); } });
    if (peut('TACHE')) choix.push({ lib: 'Tâche du service (récurrente)', couleur: couleurs().tache, action: function () { modaleTache(null, 'TACHE', jour); } });
    var dlg;
    var grilleChoix = h('div', { class: 'ag-choix' }, choix.map(function (c) {
      return teinter(h('button', { class: 'btn ag-choix-btn', type: 'button', onclick: function () { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(c.action, 0); } }, h('i'), c.lib), c.couleur);
    }));
    dlg = U.modale('Ajouter à l’agenda', h('div', { class: 'pile' }, grilleChoix), [{ texte: 'Annuler' }]);
  }

  /** Champs de la répétition (événements et tâches) ; `lire()` rend la répétition saisie. */
  function champsRepetition(reg, dis, permises) {
    var types = Object.keys(A.REGULARITES).filter(function (k) { return !permises || permises.indexOf(k) >= 0 || k === reg.type; });
    var selReg = h('select', Object.assign({ onchange: function () { maj(); } }, dis || {}), types.map(function (k) { return h('option', { value: k, text: A.REGULARITES[k], selected: reg.type === k }); }));
    var JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (j) { return { j: j, cb: h('input', Object.assign({ type: 'checkbox', checked: reg.jours.indexOf(j) >= 0 }, dis || {})) }; });
    var intervalle = h('select', Object.assign({ 'aria-label': 'Fréquence' }, dis || {}), [1, 2, 3, 4].map(function (k) { return h('option', { value: k, text: k === 1 ? 'chaque semaine' : 'toutes les ' + k + ' semaines', selected: (reg.intervalle || 1) === k }); }));
    var rang = h('select', Object.assign({ 'aria-label': 'Rang dans le mois' }, dis || {}), Object.keys(A.RANGS).sort(function (a, b) { return (+a < 0 ? 9 : +a) - (+b < 0 ? 9 : +b); }).map(function (k) { return h('option', { value: k, text: A.RANGS[k], selected: String(reg.rang || 1) === k }); }));
    var jour = h('select', Object.assign({ 'aria-label': 'Jour de la semaine' }, dis || {}), [1, 2, 3, 4, 5, 6, 0].map(function (k) { return h('option', { value: k, text: JOURS_LONGS[k], selected: (reg.jour === undefined ? 1 : reg.jour) === k }); }));
    var jusquAu = h('input', Object.assign({ type: 'date', value: reg.jusquAu }, dis || {}));
    var zoneSemaine = h('div', { class: 'pile' }, h('div', { class: 'actions gauche' }, casesJours.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JOURS[c.j] })); })), h('label', { class: 'en-ligne' }, 'Fréquence', intervalle));
    var lRang = h('label', { class: 'en-ligne' }, 'Le', rang), lJour = h('label', { class: 'en-ligne nowrap' }, jour, h('span', { text: 'du mois' }));
    var zoneMois = h('div', { class: 'actions gauche' }, lRang, lJour);
    var lWeekend = h('span', { text: 'week-end du mois (samedi et dimanche)' });
    zoneMois.appendChild(lWeekend);
    var zoneJusqu = h('label', {}, 'Jusqu’au (vide : sans fin)', jusquAu);
    function maj() {
      var t = selReg.value;
      zoneSemaine.hidden = t !== 'semaine'; zoneMois.hidden = t !== 'rangMois' && t !== 'weekendMois';
      lJour.hidden = t !== 'rangMois'; lWeekend.hidden = t !== 'weekendMois'; zoneJusqu.hidden = t === 'aucune';
    }
    maj();
    return {
      noeuds: [h('div', { class: 'grille-2' }, h('label', {}, 'Répétition', selReg), zoneJusqu), zoneSemaine, zoneMois],
      select: selReg,
      lire: function () {
        var t = selReg.value;
        return A.regularite({ type: t, jours: t === 'semaine' ? casesJours.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }) : [],
          intervalle: t === 'semaine' ? +intervalle.value : undefined, rang: +rang.value, jour: +jour.value, jusquAu: t === 'aucune' ? '' : jusquAu.value });
      }
    };
  }

  function carteElement(x, jour, avecService) {
    var r = x.rdv;
    var plage = (x.debut < jour ? '…' : hm(x.debut)) + (x.fin ? ' – ' + (x.fin >= plusJours(jour, 1) ? '…' : hm(x.fin)) : '');
    var modifiable = peut('RDV') && (!x.externe || opts().modifAutresServices);
    return h('article', { class: 'agenda-element nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : ''), tabindex: 0, role: 'button',
      'aria-label': (A.NATURES[r.nature] || '') + ' ' + (r.titre || '') + ' ' + plage,
      onclick: function () { modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); },
      onkeydown: function (ev) { if (ev.key === 'Enter') modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); } },
      h('div', { class: 'agenda-plage', text: plage }),
      h('div', {}, h('span', { class: 'badge', text: A.NATURES[r.nature] || 'Élément' }), x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : (avecService ? h('span', { class: 'badge', text: U.libService(r.service) }) : null)),
      h('b', { text: r.titre || '' }),
      r.lieu ? h('div', {}, h('small', { text: r.lieu })) : null,
      x.patients.length ? h('div', {}, h('small', { text: (x.patients.length > 1 ? 'Patients : ' : 'Patient : ') + nomsPatients(x.patients).join(', ') })) : null,
      (r.professionnels || []).length ? h('div', {}, h('small', { class: 'muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') })) : null,
      (r.commentaires || []).length ? h('div', {}, h('small', { class: 'muted', text: r.commentaires.length + ' commentaire(s)' })) : null,
      x.checklist.items.length ? (function () {
        var e = A.etatChecklist(r, x.occurrence, Date.now());
        return h('div', {}, h('span', { class: 'badge ' + (e.reste ? 'warn' : 'ok'), text: 'Check-list : ' + (e.items.length - e.reste) + '/' + e.items.length }),
          e.alertes ? h('span', { class: 'badge bad', text: e.alertes + (e.alertes > 1 ? ' points en retard' : ' point en retard') }) : null);
      })() : null,
      x.absents.length ? h('div', {}, h('span', { class: 'badge bad', text: 'Absent(e) : ' + x.absents.map(function (p) { return p.nom; }).join(', ') })) : null,
      A.regularite(r.regularite).type !== 'aucune' ? h('div', {}, h('small', { class: 'muted', text: '↻ ' + libRepetition(r.regularite) })) : null);
  }

  /** Fenêtre d'un élément : création (r nul), modification, ou consultation (lecture seule / autre service). */
  function modaleElement(r, jour, lecture, patientsVisibles, externe, occurrence, natureInitiale) {
    var x = r || {}, nouveau = !r, dis = lecture ? { disabled: true } : {};
    var reg = A.regularite(x.regularite), checklist = (x.checklist || []).map(function (it) { return { id: it.id, libelle: it.libelle, delai: it.delai === undefined ? null : it.delai }; });
    var sv = h('select', dis, (lecture ? U.tousServices() : U.services()).map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === (x.service || (U.App.service !== '*' ? U.App.service : '')) }); }));
    var nature = h('select', dis, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: (x.nature || natureInitiale || 'accompagnement') === k }); }));
    var titre = h('input', Object.assign({ type: 'text', maxlength: 120, value: x.titre || '', placeholder: 'ex. Rendez-vous extérieur, atelier, synthèse' }, dis));
    // Entretien : médical ou infirmier, individuel ou avec la famille ; un ou plusieurs professionnels prévus
    var ent = x.entretien || {};
    var selEnt = h('select', dis, Object.keys(A.ENTRETIENS).map(function (k) { return h('option', { value: k, text: 'Entretien ' + A.ENTRETIENS[k], selected: (ent.type || 'medical') === k }); }));
    var selAvec = h('select', dis, Object.keys(A.AVEC).map(function (k) { return h('option', { value: k, text: A.AVEC[k][0].toUpperCase() + A.AVEC[k].slice(1), selected: (ent.avec || 'individuel') === k }); }));
    var zoneEnt = h('div', { class: 'grille-2' }, h('label', {}, 'Entretien', selEnt), h('label', {}, 'Avec', selAvec));
    // Accompagnateurs nécessaires (sans les nommer) : les agents s'inscrivent eux-mêmes
    var nbAcc = h('input', Object.assign({ type: 'number', min: 0, max: 20, step: 1, value: x.accompagnateurs || 0, class: 'champ-court' }, dis));
    var zoneAcc = h('label', { class: 'en-ligne' }, 'Accompagnateurs nécessaires', nbAcc, h('small', { class: 'muted', text: '(0 : aucun ; les agents s’inscrivent eux-mêmes, les professionnels prévus comptent)' }));
    // Permission de sortie : demande, puis validée une fois signée par le médecin
    var selStatut = h('select', dis, Object.keys(A.STATUTS_PERMISSION).map(function (k) { return h('option', { value: k, text: A.STATUTS_PERMISSION[k], selected: (x.statut || 'demande') === k }); }));
    var listePsy = 'psy-' + C.hex(C.aleatoire(3));
    var validePar = h('input', Object.assign({ type: 'text', maxlength: 80, value: (x.validation && x.validation.par) || '', list: listePsy, placeholder: 'Médecin signataire' }, dis));
    var zonePerm = h('div', { class: 'pile' }, h('div', { class: 'grille-2' }, h('label', {}, 'Statut', selStatut), h('label', {}, 'Signée par', validePar)),
      h('datalist', { id: listePsy }, (U.config().psychiatres || []).map(function (n) { return h('option', { value: n }); })),
      h('small', { class: 'muted', id: 'aide-permission' }));
    function majPermission() {
      var aide = zonePerm.querySelector('small'), ids = patients, d0 = date.value && hDebut.value ? new Date(date.value + 'T' + hDebut.value).getTime() : null;
      if (!aide) return;
      var delai = 0, modes = [];
      ids.forEach(function (pid) { var m = A.modeAu(fiches()[pid], d0 || Date.now()); if (m) { modes.push(m); delai = Math.max(delai, A.delaiPermission(U.config(), m)); } });
      aide.textContent = selStatut.value === 'validee' ? (x.validation && x.validation.le ? 'Validée le ' + U.date(Date.parse(x.validation.le)) + '.' : 'La validation est enregistrée avec la date du jour.') :
        'Validation médicale attendue ' + (delai ? delai + ' h avant le début' : 'au plus tard au début de la permission') + (modes.length ? ' (mode : ' + modes.join(', ') + ')' : ' (choisissez le patient)') + '. Une alerte s’affiche dans l’agenda jusqu’à la validation.';
    }
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
        var cb = h('input', { type: 'checkbox', checked: patients.indexOf(p.id) >= 0, onchange: function () { patients = cb.checked ? patients.concat([p.id]) : patients.filter(function (i) { return i !== p.id; }); majPermission(); } });
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
    var rep = champsRepetition(reg, dis);
    // Zones selon le type d'élément
    var zonePatients;
    function majNature() {
      var n = nature.value;
      zoneEnt.hidden = n !== 'entretien'; zonePerm.hidden = n !== 'permission'; zoneAcc.hidden = n === 'reunion' || n === 'entretien';
      if (zonePatients) zonePatients.hidden = n === 'reunion';
      titre.placeholder = n === 'entretien' ? 'Facultatif (ex. entretien de pré-sortie)' : (n === 'permission' ? 'Facultatif (ex. permission week-end)' : 'ex. Rendez-vous extérieur, atelier, synthèse');
      majPermission();
    }
    nature.addEventListener('change', majNature);
    [date, hDebut].forEach(function (c) { c.addEventListener('change', majPermission); });
    // Check-list (décision du porteur : points à réaliser avant l'événement, ex. sortie d'un patient)
    var zoneCheck = h('div', { class: 'pile' });
    function dessinerChecklist() {
      U.vider(zoneCheck);
      var etat = r && occurrence ? A.etatChecklist(st().rdv[x.id] || x, occurrence, Date.now()) : null, peutCocher = !nouveau && occurrence && peut('CHECK');
      checklist.forEach(function (it, i) {
        var f = etat && etat.items.filter(function (y) { return y.id === it.id; })[0];
        var cb = h('input', { type: 'checkbox', checked: !!(f && f.fait), disabled: !peutCocher || !f, onchange: async function () {
          try { await U.App.session.enregistrer('CHECK', { rdv: x.id, item: it.id, occurrence: occurrence, fait: cb.checked, service: externe ? (U.App.service !== '*' ? U.App.service : U.App.session.mesServices()[0]) : x.service }); dessinerChecklist(); }
          catch (e) { cb.checked = !cb.checked; alert(e.message); }
        } });
        var selDelai = lecture ? null : selectDelai(it.delai, function (v) { it.delai = v; });
        zoneCheck.appendChild(h('div', { class: 'agenda-point' }, h('label', { class: 'case' }, cb, h('span', { text: it.libelle })),
          lecture ? (it.delai !== null && it.delai !== undefined ? h('small', { class: 'muted', text: libDelai(it.delai) }) : null) : selDelai,
          f && f.alerte ? h('span', { class: 'badge bad', text: 'En retard (attendu ' + (f.delai ? 'le ' + libJour(f.echeance) : 'le jour même') + ')' }) : null,
          f && f.fait ? h('small', { class: 'muted', text: U.App.session.nomAuteur(f.fait.par) + ', ' + U.date(Date.parse(f.fait.le)) }) : null,
          !lecture ? h('button', { class: 'btn petit', type: 'button', onclick: function () { checklist.splice(i, 1); dessinerChecklist(); } }, 'Retirer') : null));
      });
      if (!checklist.length) zoneCheck.appendChild(h('small', { class: 'muted', text: 'Aucune check-list.' }));
      if (!lecture) {
        var modeles = A.checklists(U.config());
        var selModele = h('select', { 'aria-label': 'Modèle de check-list' }, [h('option', { value: '', text: 'Ajouter un modèle…' })].concat(modeles.map(function (m) { return h('option', { value: m.code, text: m.libelle }); })));
        selModele.addEventListener('change', function () {
          var m = modeles.filter(function (y) { return y.code === selModele.value; })[0];
          if (m) m.items.forEach(function (it) { if (!checklist.some(function (y) { return y.libelle === it.libelle; })) checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: it.libelle, delai: it.delai }); });
          dessinerChecklist();
        });
        var libre = h('input', { type: 'text', maxlength: 120, placeholder: 'Autre point à réaliser' }), delaiLibre = null, selLibre = selectDelai(null, function (v) { delaiLibre = v; });
        zoneCheck.appendChild(h('div', { class: 'agenda-point' }, selModele, libre, selLibre, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (libre.value.trim()) { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: libre.value.trim(), delai: delaiLibre }); dessinerChecklist(); } } }, 'Ajouter')));
        if (!nouveau) zoneCheck.appendChild(h('small', { class: 'muted', text: 'Les points se cochent après l’enregistrement, élément par élément (pour un élément répété : à chaque date).' }));
      }
    }
    dessinerChecklist();
    // Inscriptions des accompagnateurs pour la date affichée
    var zoneInscrits = null;
    if (!nouveau && occurrence && (x.accompagnateurs || 0) > 0) {
      var xo = { rdv: st().rdv[x.id] || x, occurrence: occurrence, externe: externe };
      xo.accompagnateurs = A.accompagnateurs(xo.rdv, occurrence);
      zoneInscrits = h('div', { class: 'pile' }, h('b', { text: 'Accompagnateurs le ' + occurrence.split('-').reverse().join('/') }),
        h('div', { class: 'barre' }, badgeAccompagnateurs(xo), boutonInscription(xo, false)),
        h('small', { class: 'muted', text: xo.accompagnateurs.inscrits.length ? 'Inscrits : ' + xo.accompagnateurs.inscrits.map(function (i) { return i.nom; }).join(', ') : 'Aucun agent inscrit pour l’instant.' }));
    }
    var boutons = [{ texte: lecture ? 'Fermer' : 'Annuler' }];
    if (!lecture && !nouveau && occurrence && A.regularite(x.regularite).type !== 'aucune') boutons.push({ texte: 'Retirer cette date', action: async function () {
      if (!confirm('Retirer l’occurrence du ' + occurrence.split('-').reverse().join('/') + ' ? Les autres dates sont gardées.')) return false;
      await U.App.session.enregistrer('RDV', { id: x.id, exceptions: (x.exceptions || []).concat([occurrence]), service: x.service });
      U.toast('Date retirée.');
    } });
    if (!lecture && !nouveau && occurrence && A.regularite(x.regularite).type !== 'aucune' && occurrence > A.jourISO(x.debut)) boutons.push({ texte: 'Retirer cette date et les suivantes', action: async function () {
      if (!confirm('Arrêter la répétition : retirer le ' + occurrence.split('-').reverse().join('/') + ' et toutes les dates suivantes ? Les dates précédentes sont gardées.')) return false;
      var rg = A.regularite(x.regularite); rg.jusquAu = A.jourISO(plusJours(A.depuisISO(occurrence), -1));
      await U.App.session.enregistrer('RDV', { id: x.id, regularite: rg, service: x.service });
      U.toast('Dates retirées à partir du ' + occurrence.split('-').reverse().join('/') + '.');
    } });
    if (!lecture && !nouveau) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer « ' + (x.titre || 'cet élément') + ' » de l’agenda ?')) return false;
      await U.App.session.enregistrer('RDV', { id: x.id, supprime: true, service: x.service });
      U.toast('Élément supprimé.');
    } });
    if (!lecture) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim() && ['entretien', 'permission'].indexOf(nature.value) < 0) throw new Error('Indiquez un intitulé.');
      if (nature.value === 'permission' && selStatut.value === 'validee' && !validePar.value.trim()) throw new Error('Indiquez le médecin qui a signé la permission.');
      if (!date.value || !hDebut.value) throw new Error('Indiquez la date et l’heure de début.');
      var d0 = new Date(date.value + 'T' + hDebut.value).getTime(), d1 = hFin.value ? new Date(date.value + 'T' + hFin.value).getTime() : null;
      if (d1 !== null && d1 <= d0) throw new Error('L’heure de fin doit suivre l’heure de début.');
      var rg = rep.lire();
      if (rg.jusquAu && rg.jusquAu < date.value) throw new Error('La date de fin de répétition précède la première date.');
      if (rg.type === 'semaine' && !rg.jours.length) rg.jours = [new Date(d0).getDay()];
      var nv = nature.value;
      var d = { id: x.id || 'R' + C.hex(C.aleatoire(6)), nature: nv, titre: titre.value.trim(), debut: d0, fin: d1, lieu: lieu.value.trim(), service: sv.value,
        patients: nv === 'reunion' ? [] : patients, professionnels: profs, regularite: rg, checklist: checklist,
        accompagnateurs: nv === 'reunion' || nv === 'entretien' ? 0 : Math.max(0, Math.min(20, Math.round(+nbAcc.value || 0))) };
      if (nv === 'entretien') d.entretien = { type: selEnt.value, avec: selAvec.value };
      if (nv === 'permission') {
        d.statut = selStatut.value;
        if (selStatut.value === 'validee') d.validation = { par: validePar.value.trim(), le: (x.statut === 'validee' && x.validation && x.validation.le) || new Date().toISOString() };
        else if (x.validation) d.validation = null;
      }
      if (!nouveau && (x.accompagnateurs || 0) === d.accompagnateurs) delete d.accompagnateurs;
      if (nouveau && !d.accompagnateurs) delete d.accompagnateurs;
      if (!nouveau) Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k])) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      await U.App.session.enregistrer('RDV', d);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
    } });
    U.modale(nouveau ? 'Nouvel élément de l’agenda' : (lecture ? libelleElement(x) + (externe ? ' — ' + U.libService(x.service) : '') : 'Modifier l’élément'), h('div', { class: 'pile' },
      externe ? h('p', { class: 'muted', text: 'Élément de l’agenda du service ' + U.libService(x.service) + ', qui concerne un patient hospitalisé dans votre service' + (lecture ? ' : consultation et commentaires.' : '.') }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', nature), h('label', {}, 'Service', sv)),
      zoneEnt, zonePerm,
      h('label', {}, 'Intitulé', titre),
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'Début', hDebut), h('label', {}, 'Fin', hFin)),
      h('label', {}, 'Lieu', lieu),
      rep.noeuds, zoneAcc, zoneInscrits,
      occurrence && reg.type !== 'aucune' ? h('small', { class: 'muted', text: 'Date affichée : ' + occurrence.split('-').reverse().join('/') + '. Une modification s’applique à toutes les dates.' }) : null,
      h('div', { class: 'pile' }, h('b', { text: 'Check-list (à réaliser avant l’événement)' }), zoneCheck),
      zonePatients = h('div', { class: 'pile' }, h('b', { text: 'Patients' }), zonePat),
      h('div', { class: 'pile' }, h('b', { text: 'Professionnels prévus' }), zonePro),
      nouveau ? null : h('div', { class: 'pile' }, h('b', { text: 'Commentaires' }), zoneCom),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : le motif et le contenu de la prise en charge restent dans le dossier du patient.' })), boutons, { large: true });
    majNature();
  }

  function libRepetition(v) { return A.libelleRepetition(v); }

  // Délai d'alerte d'un point de check-list (jours avant l'événement)
  var DELAIS = [[null, 'Sans alerte'], [0, 'Le jour même'], [1, 'La veille'], [2, '2 jours avant'], [3, '3 jours avant'], [5, '5 jours avant'], [7, '7 jours avant'], [14, '14 jours avant']];
  function libDelai(v) { var x = DELAIS.filter(function (d) { return d[0] === v; })[0]; return x ? x[1] : v + ' jours avant'; }
  function selectDelai(v, f) {
    var opts0 = DELAIS.slice(); if (v !== null && v !== undefined && !DELAIS.some(function (d) { return d[0] === v; })) opts0.push([v, v + ' jours avant']);
    var s = h('select', { class: 'delai', 'aria-label': 'Alerte si non fait', onchange: function () { f(s.value === '' ? null : +s.value); } }, opts0.map(function (d) { return h('option', { value: d[0] === null ? '' : String(d[0]), text: d[1], selected: d[0] === (v === undefined ? null : v) }); }));
    return s;
  }

  /** Tâche due un jour : case « faite » (accès « Cocher »), qui et quand ; agent affecté ; « Affecter » pour qui ajuste. */
  function ligneTache(x) {
    var t = x.tache, moi = U.App.session.compteEffectif(), pourMoi = x.affecte ? x.affecte.agent === moi.id : A.tachePour(t, moi);
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
          var p = t.pour || {}, pour = (p.roles || []).map(function (r) { return SIC.modules.obtenir('agenda').droits.libRole(U.config(), r); }).concat((p.agents || []).map(function (id) { return U.App.session.nomAuteur(id); }));
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
        pour: { roles: casesRoles.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; }), agents: (pour.agents || []) } });
      U.toast(t ? 'Tâche modifiée.' : 'Tâche ajoutée.');
    } });
    U.modale((t ? 'Modifier la tâche' : 'Nouvelle tâche') + (equipe ? ' de l’équipe' : ' du service'), h('div', { class: 'pile' },
      h('p', { class: 'muted', text: equipe ? 'Tâche de l’équipe : toute l’équipe peut la modifier ou la supprimer.' + (recurrentes ? '' : ' Les tâches récurrentes sont réglées par les rôles qui règlent les tâches du service.') : 'Tâche du service : seuls les rôles qui règlent les tâches la modifient ou la suppriment ; les autres la cochent et l’ajustent selon le réglage.' }),
      h('label', {}, 'Tâche', titre), h('label', {}, 'Précision', consigne),
      h('div', { class: 'grille-3' }, h('label', {}, 'Service', sv), h('label', {}, 'Première date', debut), h('label', {}, 'Heure (facultatif)', heure)),
      rep.noeuds,
      h('div', { class: 'pile' }, h('b', { text: 'Pour (aucune case : toute l’équipe du service)' }), h('div', { class: 'actions gauche' }, casesRoles.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.libelle })); })))), boutons, { large: true });
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
  function libAvant(a) { return a.avant ? 'avant le ' + a.avant.split('-').reverse().join('/') + (a.heure ? ' ' + a.heure : '') : 'sans date limite'; }
  function libPour(a) {
    var p = a.pour || {};
    if (p.agent) return p.nom || U.App.session.nomAuteur(p.agent);
    if (p.role) return SIC.modules.obtenir('agenda').droits.libRole(U.config(), p.role);
    return 'toute l’équipe';
  }
  /** Échéances JLD lues à la volée chez Isocont : seulement pour qui a l'accès aux envois au JLD et la clé d'Isocont. */
  function echeancesJLD(maintenant, services) {
    var s = U.App.session;
    if (!s.peut('JLD')) return null;
    var etat = s.etatModule('isocont');
    return etat ? SIC.modules.lire('isocont.echeancesJLD', etat, { maintenant: maintenant, services: services }) || [] : null;
  }
  function allerAuxAlertes() { U.App.onglet = 'alertes'; U.rendreContenu(); }

  /** Ligne de résumé en tête de l'agenda : alertes de l'équipe, échéances JLD, points de check-list en retard. */
  function resumeAlertes(maintenant) {
    var svs = servicesAffiches(), al = A.alertesEquipe(st(), U.config(), svs, maintenant), jld = echeancesJLD(maintenant, svs) || [], cl = A.alertesChecklists(st(), fiches(), svs, maintenant);
    var parts = [];
    if (al.length) parts.push(al.length + (al.length > 1 ? ' alertes de l’équipe' : ' alerte de l’équipe') + (al.some(function (a) { return a.depassee; }) ? ' (dont en retard)' : ''));
    if (jld.length) parts.push(jld.length + (jld.length > 1 ? ' échéances' : ' échéance') + ' JLD sous 72 h');
    if (cl.length) parts.push(cl.length + (cl.length > 1 ? ' points de check-list en retard' : ' point de check-list en retard'));
    var pv = A.permissionsAValider(st(), fiches(), U.config(), svs, maintenant);
    if (pv.length) parts.push(pv.length + (pv.length > 1 ? ' permissions à faire valider' : ' permission à faire valider') + (pv.some(function (p) { return p.niveau === 'retard'; }) ? ' (dont en retard)' : ''));
    if (!parts.length) return null;
    var grave = jld.some(function (j) { return j.statut === 'depasse' || j.statut === 'proche'; }) || al.some(function (a) { return a.depassee; }) || cl.length || pv.some(function (p) { return p.niveau !== 'attente'; });
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
        var pv = A.permissionsAValider(st(), fiches(), U.config(), svs, maintenant);
        return h('section', { class: 'panneau' }, h('h2', { text: 'Permissions de sortie à faire valider' }),
          pv.length ? h('ul', { class: 'liste-simple' }, pv.map(function (p) {
            return h('li', {}, h('span', { class: 'badge ' + (p.niveau === 'retard' ? 'bad' : (p.niveau === 'proche' ? 'warn' : '')), text: p.niveau === 'retard' ? 'En retard' : 'Avant le ' + libJour(p.echeance) + ' ' + hm(p.echeance) }), ' ',
              h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(p.rdv, null, !peut('RDV'), null, false, p.occurrence); } }, libelleElement(p.rdv) + ' — ' + nomsPatients(p.rdv.patients || []).join(', ')),
              h('span', { text: ' (' + libJour(p.debut) + ' ' + hm(p.debut) + (p.modes.length ? ', ' + p.modes.join(', ') : '') + ')' }));
          })) : h('p', { class: 'muted', text: 'Aucune permission en attente de validation.' }),
          h('small', { class: 'muted', text: 'Validation médicale attendue avant le début de la permission, selon le mode d’hospitalisation (réglage de l’établissement). La permission passe en « validée » une fois signée.' }));
      })(),
      h('section', { class: 'panneau' }, h('h2', { text: 'Points de check-list en retard' }),
        cl.length ? h('ul', { class: 'liste-simple' }, cl.map(function (c) {
          return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(c.rdv, null, !peut('RDV'), null, false, c.occurrence); } }, c.rdv.titre || 'Élément'),
            h('span', { text: ' (' + libJour(c.debut) + ' ' + hm(c.debut) + ') : ' + c.item.libelle + ' — attendu ' + (c.item.delai ? 'le ' + libJour(c.item.echeance) : 'le jour même') }));
        })) : h('p', { class: 'muted', text: 'Aucun point en retard.' })),
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
      var pour = pv.indexOf('r:') === 0 ? { role: pv.slice(2) } : (pv.indexOf('a:') === 0 ? { agent: pv.slice(2), nom: (comptes.filter(function (c) { return c.id === pv.slice(2); })[0] || {}).nom || '' } : null);
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
    var s = U.App.session, moi = s.compteEffectif(), svs = s.mesServices().map(function (x) { return x.code || x; });
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
      m.alertes.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Alertes qui me sont adressées' }), h('div', { class: 'pile' }, m.alertes.map(function (a) { return carteAlerte(a, svs.length > 1); }))) : null,
      h('div', { class: 'barre' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, -7); U.rendreContenu(); } }, '◀'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = minuit(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = plusJours(vue.ref, 7); U.rendreContenu(); } }, '▶'),
        h('b', { text: 'Semaine du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) + ' ' + new Date(debut).getFullYear() })),
      h('div', { class: 'agenda-semaine' }, colonnes),
      h('p', { class: 'muted' }, h('small', { text: 'Tous vos services réunis : accompagnements, activités et réunions où vous êtes prévu(e), tâches qui vous sont affectées ou qui reviennent à votre rôle, vos absences. Cette vue reste dans Tessera : aucune copie hors de l’outil.' })));
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
    var modelesCL = A.checklists(U.config()).map(function (c) { return { code: c.code, libelle: c.libelle, items: c.items.map(function (it) { return { libelle: it.libelle, delai: it.delai }; }) }; });
    var ot = A.optionsTaches(U.config());
    var casesAj = Object.keys(A.AJUSTABLES).map(function (k) { return { k: k, cb: h('input', { type: 'checkbox', checked: ot.ajustables.indexOf(k) >= 0 }) }; });
    var cbEqRec = h('input', { type: 'checkbox', checked: ot.equipeRecurrentes });
    // Couleurs par type (décision du porteur du 7 novembre 2026 : personnalisables)
    var LIB_COULEURS = Object.assign({}, A.NATURES, { tache: 'Tâche', alerte: 'Alerte' });
    var champsCouleurs = Object.keys(A.COULEURS_DEFAUT).map(function (k) { return { k: k, c: h('input', { type: 'color', value: o.couleurs[k], 'aria-label': 'Couleur : ' + LIB_COULEURS[k] }) }; });
    // Délais de validation médicale des permissions, par mode d'hospitalisation
    var modes = (U.config().modesHospitalisation || []).map(function (m) { return m.code; });
    Object.keys(o.delaisPermission).forEach(function (k) { if (modes.indexOf(k) < 0) modes.push(k); });
    var champsDelais = modes.map(function (m) { return { m: m, c: h('input', { type: 'number', min: 0, max: 168, step: 1, class: 'champ-court', value: A.delaiPermission(U.config(), m), 'aria-label': 'Délai de validation : ' + m }) }; });
    var zoneCL = h('div', { class: 'pile' });
    function dessinerCL() {
      U.vider(zoneCL);
      modelesCL.forEach(function (c, i) {
        var lib = h('input', { type: 'text', maxlength: 80, value: c.libelle, 'aria-label': 'Nom du modèle de check-list', oninput: function () { c.libelle = lib.value; } });
        var lignes = c.items.map(function (it, k) {
          var champ = h('input', { type: 'text', maxlength: 120, value: it.libelle, 'aria-label': 'Point à réaliser', oninput: function () { it.libelle = champ.value; } });
          return h('div', { class: 'agenda-point' }, champ, selectDelai(it.delai, function (v) { it.delai = v; }),
            h('button', { class: 'btn petit', type: 'button', disabled: k === 0, title: 'Monter', onclick: function () { c.items.splice(k - 1, 0, c.items.splice(k, 1)[0]); dessinerCL(); } }, '▲'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { c.items.splice(k, 1); dessinerCL(); } }, 'Retirer'));
        });
        zoneCL.appendChild(h('fieldset', { class: 'role' }, h('legend', { text: c.libelle || 'Nouveau modèle' }), h('label', {}, 'Nom', lib),
          h('div', { class: 'pile' }, h('b', { text: 'Points à réaliser et alerte si non fait' }), lignes),
          h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { c.items.push({ libelle: '', delai: null }); dessinerCL(); } }, '+ Ajouter un point'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { modelesCL.splice(i, 1); dessinerCL(); } }, 'Retirer ce modèle'))));
      });
      zoneCL.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modelesCL.push({ code: 'c' + Date.now().toString(36), libelle: '', items: [{ libelle: '', delai: null }] }); dessinerCL(); } }, '+ Ajouter un modèle de check-list')));
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
        zone.appendChild(h('div', { class: 'agenda-point' }, champ,
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
      h('h3', { text: 'Couleurs des éléments' }),
      h('div', { class: 'ag-couleurs' }, champsCouleurs.map(function (x) { return h('label', { class: 'en-ligne' }, x.c, h('span', { text: LIB_COULEURS[x.k] })); })),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { champsCouleurs.forEach(function (x) { x.c.value = A.COULEURS_DEFAUT[x.k]; }); } }, 'Couleurs proposées'),
      h('h3', { text: 'Permissions de sortie : validation médicale' }),
      h('p', { class: 'muted', text: 'Délai, en heures avant le début de la permission, avant lequel la validation (signature du médecin) est attendue, selon le mode d’hospitalisation du patient. Une alerte s’affiche dans l’agenda jusqu’à la validation ; 0 : jusqu’au dernier moment.' }),
      h('div', { class: 'ag-couleurs' }, champsDelais.map(function (x) { return h('label', { class: 'en-ligne' }, h('span', { text: x.m }), x.c, h('span', { text: 'h' })); })),
      h('h3', { text: 'Tâches' }),
      h('p', { class: 'muted', text: 'Les tâches du service, réglées par les rôles qui en ont l’accès, ne sont supprimées que par eux. Les rôles qui ont l’accès « Ajuster les tâches du service » peuvent changer :' }),
      h('div', { class: 'pile' }, casesAj.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: A.AJUSTABLES[c.k] })); })),
      h('label', { class: 'case' }, cbEqRec, h('span', { text: 'Permettre à l’équipe de créer des tâches récurrentes (sinon : ponctuelles seulement, les récurrentes étant réglées par les rôles qui règlent les tâches)' })),
      h('h3', { text: 'Modèles de check-lists' }),
      h('p', { class: 'muted', text: 'Pour chaque point, le moment où il devient en retard s’il n’est pas coché (ex. infirmier libéral prévenu 2 jours avant la sortie, transport commandé la veille, ordonnance le jour même).' }), zoneCL,
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
        var cl = modelesCL.map(function (c) { return { code: c.code, libelle: String(c.libelle || '').trim(), items: c.items.map(function (it) { return { libelle: String(it.libelle || '').trim(), delai: it.delai === undefined ? null : it.delai }; }).filter(function (it) { return it.libelle; }) }; }).filter(function (c) { return c.libelle && c.items.length; });
        if (JSON.stringify(cl) !== JSON.stringify(A.CHECKLISTS_DEFAUT)) valeur.checklists = cl;
        var ajs = casesAj.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.k; });
        if (JSON.stringify(ajs) !== JSON.stringify(['affectation']) || cbEqRec.checked) valeur.taches = { ajustables: ajs, equipeRecurrentes: cbEqRec.checked };
        var cs = {}; champsCouleurs.forEach(function (x) { if (x.c.value.toLowerCase() !== A.COULEURS_DEFAUT[x.k]) cs[x.k] = x.c.value.toLowerCase(); });
        if (Object.keys(cs).length) valeur.couleurs = cs;
        var ds = {}; champsDelais.forEach(function (x) { var v = Math.max(0, Math.min(168, Math.round(+x.c.value || 0))); if (v !== A.DELAIS_PERMISSION_DEFAUT[x.m] && !(A.DELAIS_PERMISSION_DEFAUT[x.m] === undefined && v === A.delaiPermission({ modesHospitalisation: U.config().modesHospitalisation }, x.m))) ds[x.m] = v; });
        if (Object.keys(ds).length) valeur.delaisPermission = ds;
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { RDV: 'Agenda : élément', COMMENTAIRE: 'Agenda : commentaire', CHECK: 'Agenda : check-list', INSCRIPTION: 'Agenda : inscription d’un accompagnateur', TACHE: 'Agenda : tâche du service', TACHE_EQUIPE: 'Agenda : tâche de l’équipe', TACHE_AJUSTEMENT: 'Agenda : tâche ajustée', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE: 'Agenda : alerte', ALERTE_VUE: 'Agenda : alerte vue' };
  function resume(e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV':
        if (d.supprime) return 'Élément supprimé de l’agenda (' + U.libService(d.service) + ')';
        if (d.statut === 'validee' && !d.nature) return 'Permission de sortie validée' + (d.validation && d.validation.par ? ' (signée par ' + d.validation.par + ')' : '');
        return (A.NATURES[d.nature] || 'Élément modifié') + (d.entretien ? ' ' + (A.ENTRETIENS[d.entretien.type] || '') + (d.entretien.avec === 'famille' ? ' avec la famille' : '') : '') + (d.nature === 'permission' ? ' (' + (d.statut === 'validee' ? 'validée' : 'demande') + ')' : '') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.debut ? ' le ' + U.date(d.debut) : '') + (d.service ? ' — ' + U.libService(d.service) : '') + ((d.patients || []).length ? ', ' + d.patients.length + ' patient(s)' : '');
      case 'INSCRIPTION': var ri = st().rdv[d.rdv]; return (d.retrait ? 'Désinscription de ' : 'Inscription de ') + (d.nom || U.App.session.nomAuteur(d.agent)) + ' comme accompagnateur : « ' + (ri ? libelleElement(ri) : 'élément') + ' » le ' + String(d.occurrence || '').split('-').reverse().join('/');
      case 'COMMENTAIRE': var rr = st().rdv[d.rdv]; return 'Commentaire sur ' + (rr ? '« ' + (rr.titre || '') + ' »' : 'un élément') + (d.service ? ' (' + U.libService(d.service) + ')' : '') + ' : ' + (d.texte || '');
      case 'CHECK': var rk = st().rdv[d.rdv], it = rk && (rk.checklist || []).filter(function (y) { return y.id === d.item; })[0]; return 'Check-list de « ' + (rk ? rk.titre : '') + ' » (' + String(d.occurrence || '').split('-').reverse().join('/') + ') : ' + (it ? it.libelle : 'point') + (d.fait === false ? ' décoché' : ' fait');
      case 'TACHE_AJUSTEMENT': var ta = st().taches[d.tache];
        return 'Tâche « ' + (ta ? ta.titre : '') + ' » ajustée' + (d.occurrence || (d.jours || []).length ? ' : ' + (d.agent ? d.nom + ' affecté(e)' : 'affectation retirée') + ' ' + (d.occurrence ? 'le ' + d.occurrence.split('-').reverse().join('/') : 'les ' + d.jours.map(function (j) { return JOURS[j]; }).join(', ')) : '') + (d.heure !== undefined ? ', heure ' + (d.heure || 'retirée') : '') + (d.consigne !== undefined ? ', précision modifiée' : '');
      case 'TACHE_EQUIPE':
      case 'TACHE': return (d.supprime ? 'Tâche supprimée' : 'Tâche') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.regularite ? ', ' + libRepetition(d.regularite) : '');
      case 'TACHE_FAITE': return (d.annule ? 'Tâche décochée' : 'Tâche faite') + ' (échéance ' + (d.occurrence || '') + ')';
      case 'ABSENCE': return (d.supprime ? 'Absence supprimée : ' : 'Absence : ') + (d.nom || '') + (d.debut ? ' du ' + U.date(d.debut) : '') + (d.fin ? ' au ' + U.date(d.fin) : '') + (d.categorie ? ' (' + (A.CATEGORIES_ABSENCE[d.categorie] || d.categorie).toLowerCase() + ')' : '');
      case 'ALERTE': var tl = A.optionsAgenda(U.config(), d.service).typesAlertes.filter(function (t) { return t.code === d.type; })[0];
        return (d.supprime ? 'Alerte supprimée' : 'Alerte') + (d.libelle ? ' « ' + d.libelle + ' »' : (tl ? ' « ' + tl.libelle + ' »' : '')) + (d.patientId ? ' — ' + A.identite(fiches()[d.patientId], opts().identite) : '') + (d.avant ? ' avant le ' + d.avant.split('-').reverse().join('/') : '') + (d.service ? ' (' + U.libService(d.service) + ')' : '');
      case 'ALERTE_VUE': var av = st().alertes[d.alerte], tv = av && A.optionsAgenda(U.config(), av.service).typesAlertes.filter(function (t) { return t.code === av.type; })[0];
        return (d.annule ? 'Alerte remise à voir' : 'Alerte marquée vue') + (av ? ' « ' + (av.libelle || (tv ? tv.libelle : 'alerte')) + ' »' + (av.patientId ? ' — ' + A.identite(fiches()[av.patientId], opts().identite) : '') : '');
    }
    return e.type;
  }

  SIC.modules.completerInterface('agenda', {
    vues: { agenda: vueAgenda, taches: vueTaches, alertes: vueAlertes, 'mon-agenda': vueMonAgenda },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’élément de l’agenda revient à son état précédent.'; } },
    admin: { onglets: function () { return [['agenda', 'Agenda', [panneauReglages()]]]; } }
  });
  U.agenda = { modaleElement: modaleElement };
})();
