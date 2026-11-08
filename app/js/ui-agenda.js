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
  var CATEGORIES_JOUR = [['accompagnement', 'Accompagnements'], ['entretien', 'Entretiens'], ['examen', 'Examens'], ['activite', 'Activités'], ['reunion', 'Réunions'], ['audience', 'Audiences JLD'],
    ['sorties', 'Sorties et permissions'], ['tache', 'Tâches'], ['autre', 'Autres']];
  // Catégories d'événements (types fournis et catégories ajoutées par l'établissement ou le service, 8 novembre 2026)
  function cat(code, service) { return A.categorie(U.config(), code, service); }
  function libNature(code, service) { return cat(code, service).libelle; }
  function couleurNature(code, service) { return cat(code, service).couleur || couleurs().autre; }
  function baseNature(code, service) { return cat(code, service).base; }
  function serviceVue() { return U.App.service !== '*' ? U.App.service : (U.services()[0] || {}).code; }
  function categorieJour(nature, service) { var b = baseNature(nature, service); return b === 'sortie' || b === 'permission' ? 'sorties' : (b === 'tache' ? 'tache' : b); }
  function couleurs() { return opts().couleurs; }
  function teinter(el, couleur) { if (couleur) el.style.setProperty('--c', couleur); return el; }   // CSSOM (CSP sans style en ligne)
  /** Libellé d'un élément : son intitulé, sinon son type (« Entretien infirmier avec la famille », « Permission validée »). */
  function libelleElement(r) {
    if (r.titre) return r.titre;
    var b = baseNature(r.nature, r.service), propre = A.NATURES[r.nature] ? null : libNature(r.nature, r.service);
    if (propre) return propre + (b === 'examen' && r.examen && r.examen.type ? ' : ' + r.examen.type : '');
    if (b === 'entretien') { var e = r.entretien || {}; return 'Entretien' + (A.ENTRETIENS[e.type] ? ' ' + A.ENTRETIENS[e.type] : '') + (e.avec === 'famille' ? ' avec la famille' : ''); }
    if (b === 'permission') return A.STATUTS_PERMISSION[statutAffiche(r) === 'validee' ? 'validee' : 'demande'];
    if (b === 'examen') return 'Examen' + (r.examen && r.examen.type ? ' : ' + r.examen.type : '');
    return libNature(r.nature, r.service) || 'Élément';
  }
  var occurrenceCourante = null;   // occurrence du bloc en cours de dessin (statut de la permission de cette date)
  function statutAffiche(r) { return A.statutPermission(r, occurrenceCourante || ''); }
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
    occurrenceCourante = x.occurrence;
    var r = x.rdv, sp = baseNature(r.nature, r.service) === 'permission' ? A.statutPermission(r, x.occurrence) : null, plage = (x.debut < jour ? '…' : hm(x.debut)) + (x.fin ? '–' + (x.fin >= plusJours(jour, 1) ? '…' : hm(x.fin)) : '');
    var cl = x.checklist.items.length ? A.etatChecklist(r, x.occurrence, Date.now()) : null;
    var el = h('article', { class: 'ag-bloc nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : '') + (sp && sp !== 'validee' ? ' demande' : '') + (x.annulee ? ' annulee' : '') + (A.enAttente(r, U.config()) ? ' en-attente' : ''), tabindex: 0, role: 'button',
      'aria-label': libNature(r.nature, r.service) + ' ' + libelleElement(r) + ' ' + plage, onclick: function () { ouvrirElement(x); }, onkeydown: function (ev) { if (ev.key === 'Enter') ouvrirElement(x); } },
      h('div', { class: 'ag-bloc-tete' }, h('b', { text: plage + ' ' + libelleElement(r) })),
      x.patients.length ? h('div', { class: 'ag-ligne', text: nomsPatients(x.patients).join(', ') }) : null,
      r.lieu ? h('div', { class: 'ag-ligne muted', text: r.lieu }) : null,
      (r.professionnels || []).length ? h('div', { class: 'ag-ligne muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') }) : null,
      h('div', { class: 'ag-badges' },
        x.annulee ? h('span', { class: 'badge bad', text: 'Annulée' + (r.motifAnnulation ? ' : ' + r.motifAnnulation : '') }) : null,
        !x.annulee && A.enAttente(r, U.config()) ? h('span', { class: 'badge', text: 'Aucun patient prévu' }) : null,
        (r.surchargee || []).length && !x.annulee ? h('span', { class: 'badge', title: 'Réglages propres à cette date : ' + r.surchargee.map(function (k) { return LIB_CHAMPS[k] || k; }).join(', '), text: 'Date modifiée' }) : null,
        sp ? h('span', { class: 'badge ' + (sp === 'validee' ? 'ok' : (sp === 'refusee' ? 'bad' : 'warn')), text: sp === 'validee' ? 'Validée' : (sp === 'refusee' ? 'Refusée' : 'Demande') }) : null,
        (function () { var vs = A.etatValidations(r, x.occurrence, x.debut, fiches(), U.config(), Date.now()).filter(function (v) { return v.type !== 'permission' || !sp; }); var att = vs.filter(function (v) { return !v.fait; });
          return vs.length ? h('span', { class: 'badge ' + (att.some(function (v) { return v.niveau === 'retard'; }) ? 'bad' : (att.length ? 'warn' : 'ok')), title: vs.map(function (v) { return v.libelle + (v.fait ? ' : ' + (v.fait.statut === 'validee' ? 'validée' : 'refusée') : ' : à faire valider'); }).join(' ; '), text: att.length ? att.length + ' à valider' : 'Validé' }) : null; })(),
        A.etatTransports(r, x.occurrence).map(function (t) { return h('span', { class: 'badge ' + (t.reserve ? 'ok' : 'warn'), text: (t.nombre > 1 ? t.nombre + ' ' : '') + A.TRANSPORTS[t.type] + (t.reserve ? ' réservé' : ' à réserver') }); }),
        x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : null,
        x.annulee || A.enAttente(r, U.config()) ? null : [badgeAccompagnateurs(x), boutonInscription(x, true)],
        cl ? h('span', { class: 'badge ' + (cl.alertes ? 'bad' : (cl.reste ? 'warn' : 'ok')), text: 'Check-list ' + (cl.items.length - cl.reste) + '/' + cl.items.length }) : null,
        x.absents.length ? h('span', { class: 'badge bad', text: 'Absent(e) : ' + x.absents.map(function (p) { return p.nom; }).join(', ') }) : null,
        A.regularite(r.regularite).type !== 'aucune' ? h('span', { class: 'ag-repete', title: A.libelleRepetition(r.regularite), text: '↻' }) : null));
    return teinter(el, couleurNature(r.nature, r.service));
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
    return puce('element', lib, function () { ouvrirElement(x); }, couleurNature(r.nature, r.service));
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
    A.aFaireValider(st(), fiches(), U.config(), svs, maintenant).forEach(function (p) {
      var quoi = p.validation.type === 'permission' ? 'la permission' : '« ' + p.validation.libelle + ' »';
      ajouter(jourDe(p.echeance, true), puce('validation' + (p.niveau === 'retard' ? ' retard' : ''), 'Faire valider ' + quoi + ' — ' + (nomsPatients(p.rdv.patients || []).join(', ') || libelleElement(p.rdv)) + ' (avant ' + libJour(p.echeance) + ' ' + hm(p.echeance) + ')', function () { modaleElement(p.rdv, null, !peut('RDV'), null, false, p.occurrence); }));
    });
    A.transportsAReserver(st(), fiches(), svs, maintenant, 7, U.config()).forEach(function (t) {
      ajouter(aujourdhui, puce('transport' + (t.niveau === 'proche' ? ' retard' : ''), 'Réserver : ' + (t.transport.nombre > 1 ? t.transport.nombre + ' ' : '') + A.TRANSPORTS[t.transport.type] + ' — ' + libelleElement(t.rdv) + ' (' + libJour(t.debut) + ' ' + hm(t.debut) + ')', function () { modaleElement(t.rdv, null, !peut('RDV'), null, false, t.occurrence); }));
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

  // ------------------------------------------------------------ Informations reçues (décision du 8 novembre 2026)
  /** Inscriptions et désinscriptions faites par un collègue, pas encore marquées vues (préférence du compte, tous postes). */
  function avisVus() { var p = U.App.session.preferences || {}; return Array.isArray(p.avisVus) ? p.avisVus : []; }
  function mesAvis() { var s = U.App.session; return s && s.compteEffectif && s.etatModule('agenda') ? A.avisPour(st(), s.compteEffectif().id, avisVus(), Date.now()) : []; }
  async function marquerVus(ids) {
    var s = U.App.session;
    try { await s.enregistrerPreference('avisVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); }
  }
  function bandeauAvis() {
    var av = mesAvis();
    if (!av.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' }, h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' informations pour vous' : 'Une information pour vous' }), h('div', { class: 'espace' }),
      av.length > 1 ? h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Tout marquer vu') : null),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        var r = st().rdv[a.rdv], o = r ? A.occurrences(r, A.depuisISO(a.occurrence), plusJours(A.depuisISO(a.occurrence), 1))[0] : null;
        return h('li', {}, h('span', { text: U.App.session.nomAuteur(a.par) + (a.retrait ? ' vous a désinscrit(e)' : ' vous a inscrit(e)') + ' comme accompagnateur : ' }),
          r ? h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(r, null, !peut('RDV'), null, false, a.occurrence); } }, libelleElement(r)) : 'élément',
          h('span', { text: ' — ' + (o ? libJour(o.debut) + ' ' + hm(o.debut) : a.occurrence.split('-').reverse().join('/')) + ' ' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus([a.id]); } }, 'Vu'));
      })));
  }

  // ------------------------------------------------------------ Agenda du patient (fiche patient, 8 novembre 2026)
  /** Éléments à venir (60 jours) qui concernent un patient, dans les services de l'agenda de l'agent. */
  function aVenirPour(patientId, maintenant) {
    var s = U.App.session, svs = SIC.modules.obtenir('agenda').droits.servicesDe(s.compteEffectif(), U.config());
    return A.elements(st(), fiches(), svs, maintenant || Date.now(), plusJours(maintenant || Date.now(), 60)).filter(function (x) { return x.patients.indexOf(patientId) >= 0; }).slice(0, 20);
  }
  /** Section « Agenda du patient » de la fiche : éléments à venir, « + Événement pour ce patient ». */
  function sectionPatient(p, fermerPuis) {
    var s = U.App.session;
    if (!s.detientCle || !s.detientCle('agenda') || !s.etatModule('agenda')) return null;
    var els = aVenirPour(p.id), sv = A.serviceDuPatient(p);
    return h('div', { class: 'pile' }, h('div', { class: 'barre' }, h('b', { text: 'Agenda du patient (60 prochains jours)' }), h('div', { class: 'espace' }),
      peut('RDV') ? h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { fermerPuis(function () { modaleAjout(null, { patients: [p.id], service: sv && U.services().some(function (v) { return v.code === sv; }) ? sv : undefined }); }); } }, '+ Événement pour ce patient') : null),
      els.length ? h('ul', { class: 'liste-simple' }, els.map(function (x) {
        return h('li', {}, teinter(h('span', { class: 'ag-cle' }, h('i')), couleurNature(x.rdv.nature, x.rdv.service)), ' ',
          h('button', { class: 'btn lien', type: 'button', onclick: function () { fermerPuis(function () { ouvrirElement(x); }); } }, libelleElement(x.rdv)),
          h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) + (x.externe ? ' (' + U.libService(x.rdv.service) + ')' : '') }));
      })) : h('small', { class: 'muted', text: 'Rien de prévu.' }));
  }

  function vueAgenda(maintenant) {
    var semaine = vue.mode !== 'jour', debut = semaine ? lundi(vue.ref) : vue.ref, n = semaine ? 7 : 1, fin = plusJours(debut, n), svs = servicesAffiches();
    var els = vue.nature === 'tache' ? [] : A.elements(st(), fiches(), svs, debut, fin, true).filter(function (x) { return !vue.nature || x.rdv.nature === vue.nature; });
    var dues = !vue.nature || vue.nature === 'tache' ? A.tachesDues(st(), svs, debut, fin) : [];
    var abs = A.absences(st(), debut, fin).filter(function (a) { return !a.service || svs.indexOf(a.service) >= 0; });
    var reperes = reperesParJour(debut, n, maintenant);
    var selNature = h('select', { 'aria-label': 'Type d’élément', onchange: function () { vue.nature = selNature.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Tous les éléments' })].concat(A.categories(U.config(), U.App.service !== '*' ? U.App.service : null).filter(function (c) { return c.actif; }).map(function (c) { return h('option', { value: c.code, text: c.libelle, selected: vue.nature === c.code }); }), [h('option', { value: 'tache', text: 'Tâches', selected: vue.nature === 'tache' })]));
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
        var hs = rj.heures.filter(function (it) { return it.t ? c[0] === 'tache' : categorieJour(it.x.rdv.nature, it.x.rdv.service) === c[0]; });
        var bs = rj.bande.filter(function (x) { return x.tache ? c[0] === 'tache' : categorieJour(x.rdv.nature, x.rdv.service) === c[0]; });
        if (c[0] === 'autre' && !hs.length && !bs.length) return;
        if (vue.nature && !hs.length && !bs.length) return;
        var cle = c[0] === 'sorties' ? 'permission' : c[0];
        colonnes.push({ jour: debut, titre: teinter(h('span', { class: 'ag-titre-cat', text: c[1] }), cle === 'tache' ? couleurs().tache : couleurNature(cle, serviceVue())), aujourdhui: debut === minuit(maintenant), classe: 'categorie',
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
      bandeauAvis(),
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
    return h('div', { class: 'ag-legende' }, A.categories(U.config(), U.App.service !== '*' ? U.App.service : null).filter(function (k) { return k.actif; }).map(function (k) { return teinter(h('span', { class: 'ag-cle' + (k.base === 'permission' ? ' demande' : '') }, h('i'), k.libelle), k.couleur); }),
      teinter(h('span', { class: 'ag-cle' }, h('i'), 'Tâche'), c.tache), teinter(h('span', { class: 'ag-cle' }, h('i'), 'Alerte'), c.alerte));
  }


  /** Le service est-il un service de psychiatrie (audience JLD proposée) ? */
  function servicePsy(code) { return SIC.patients.optionsFiche(U.config(), code).psychiatrie; }
  /** Catégories proposées à la création dans un service : actives, et réservées à la psychiatrie seulement dans ces services. */
  function naturesPour(service) {
    var sv = service || serviceVue();
    return A.categories(U.config(), sv).filter(function (c) { return c.actif && (!c.prereglages.psychiatrie || servicePsy(sv)); }).map(function (c) { return c.code; });
  }

  /** « + Nouveau » : un seul point d'entrée pour les événements et les tâches. `init` : { patients, service } (fiche patient). */
  function modaleAjout(jour, init) {
    var choix = [];
    if (peut('RDV')) naturesPour(init && init.service).forEach(function (k) { choix.push({ lib: libNature(k, (init && init.service) || serviceVue()), couleur: couleurNature(k, (init && init.service) || serviceVue()), action: function () { modaleElement(null, jour, false, null, false, null, Object.assign({ nature: k }, init || {})); } }); });
    if (!init && peut('TACHE_EQUIPE')) choix.push({ lib: 'Tâche de l’équipe', couleur: couleurs().tache, action: function () { modaleTache(null, 'TACHE_EQUIPE', jour); } });
    if (!init && peut('TACHE')) choix.push({ lib: 'Tâche du service (récurrente)', couleur: couleurs().tache, action: function () { modaleTache(null, 'TACHE', jour); } });
    var grilleChoix = h('div', { class: 'ag-choix' }, choix.map(function (c) {
      return teinter(h('button', { class: 'btn ag-choix-btn', type: 'button', onclick: function () { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(c.action, 0); } }, h('i'), c.lib), c.couleur);
    }));
    U.modale(init && init.patients && init.patients.length ? 'Ajouter à l’agenda — ' + nomsPatients(init.patients).join(', ') : 'Ajouter à l’agenda', h('div', { class: 'pile' }, grilleChoix), [{ texte: 'Annuler' }]);
  }

  /**
   * Champs de la répétition (événements et tâches) ; `lire()` rend la répétition saisie. Tous les N jours ; jours cochés
   * chaque semaine ou toutes les N semaines ; même date tous les N mois ; « le [rang] [jour] du [mois, trimestre…] ».
   */
  function champsRepetition(reg, dis, permises) {
    reg = A.regularite(reg);
    var d0 = dis || {};
    var types = Object.keys(A.REGULARITES).filter(function (k) { return !permises || permises.indexOf(k) >= 0 || k === reg.type; });
    var selReg = h('select', Object.assign({ onchange: function () { maj(); } }, d0), types.map(function (k) { return h('option', { value: k, text: A.REGULARITES[k], selected: reg.type === k }); }));
    var JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (j) { return { j: j, cb: h('input', Object.assign({ type: 'checkbox', checked: reg.jours.indexOf(j) >= 0 }, d0)) }; });
    function choixIntervalle(n, lib) { return h('select', Object.assign({ 'aria-label': 'Fréquence' }, d0), Array.apply(null, { length: n }).map(function (_, i) { return h('option', { value: i + 1, text: lib(i + 1), selected: (reg.intervalle || 1) === i + 1 }); })); }
    var intJour = choixIntervalle(30, function (k) { return k === 1 ? 'chaque jour' : 'tous les ' + k + ' jours'; });
    var intSem = choixIntervalle(8, function (k) { return k === 1 ? 'chaque semaine' : (k === 2 ? 'toutes les 2 semaines (tous les 15 jours)' : 'toutes les ' + k + ' semaines'); });
    var intMois = choixIntervalle(12, function (k) { return k === 1 ? 'chaque mois' : 'tous les ' + k + ' mois'; });
    var rang = h('select', Object.assign({ 'aria-label': 'Rang' }, d0), ['1', '2', '3', '4', '5', '-1', '-2'].map(function (k) { return h('option', { value: k, text: A.RANGS[k], selected: String(reg.rang || 1) === k }); }));
    var jour = h('select', Object.assign({ 'aria-label': 'Jour' }, d0), [1, 2, 3, 4, 5, 6, 0].map(function (k) { return h('option', { value: String(k), text: JOURS_LONGS[k], selected: reg.jour === k || (reg.jour === undefined && k === 1) }); })
      .concat(Object.keys(A.GENRES_JOUR).map(function (k) { return h('option', { value: k, text: A.GENRES_JOUR[k] + (k === 'weekend' ? ' (samedi et dimanche)' : (k === 'ouvre' ? ' (lundi à vendredi)' : '')), selected: reg.jour === k }); })));
    var periode = h('select', Object.assign({ 'aria-label': 'Période' }, d0), Object.keys(A.PERIODES).map(function (k) { return h('option', { value: k, text: k === 'annee' ? 'de l’année' : 'du ' + A.PERIODES[k], selected: (reg.periode || 'mois') === k }); }));
    var intPer = h('select', Object.assign({ 'aria-label': 'Une période sur' }, d0), [1, 2, 3, 4, 6, 12].map(function (k) { return h('option', { value: k, text: k === 1 ? 'chaque période' : 'une période sur ' + k, selected: (reg.intervalle || 1) === k }); }));
    var jusquAu = h('input', Object.assign({ type: 'date', value: reg.jusquAu }, d0));
    var apercu = h('small', { class: 'muted' });
    var zoneJour = h('label', { class: 'en-ligne' }, 'Fréquence', intJour);
    var zoneSemaine = h('div', { class: 'pile' }, h('div', { class: 'actions gauche' }, casesJours.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JOURS[c.j] })); })), h('label', { class: 'en-ligne' }, 'Fréquence', intSem));
    var zoneMois = h('label', { class: 'en-ligne' }, 'Fréquence', intMois);
    var zoneRang = h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Le', rang), jour, periode, intPer);
    var zoneJusqu = h('label', {}, 'Jusqu’au (vide : sans fin)', jusquAu);
    function lire() {
      var t = selReg.value;
      return A.regularite({ type: t, jours: t === 'semaine' ? casesJours.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }) : [],
        intervalle: t === 'jour' ? +intJour.value : t === 'semaine' ? +intSem.value : t === 'mois' ? +intMois.value : t === 'rangPeriode' ? +intPer.value : undefined,
        rang: +rang.value, jour: /^\d$/.test(jour.value) ? +jour.value : jour.value, periode: periode.value, jusquAu: t === 'aucune' ? '' : jusquAu.value });
    }
    function maj() {
      var t = selReg.value;
      zoneJour.hidden = t !== 'jour'; zoneSemaine.hidden = t !== 'semaine'; zoneMois.hidden = t !== 'mois'; zoneRang.hidden = t !== 'rangPeriode'; zoneJusqu.hidden = t === 'aucune';
      apercu.textContent = t === 'aucune' ? '' : 'Répétition : ' + A.libelleRepetition(lire()) + '.';
    }
    [intJour, intSem, intMois, rang, jour, periode, intPer, jusquAu].concat(casesJours.map(function (c) { return c.cb; })).forEach(function (c) { c.addEventListener('change', maj); });
    maj();
    return { noeuds: [h('div', { class: 'grille-2' }, h('label', {}, 'Répétition', selReg), zoneJusqu), zoneJour, zoneSemaine, zoneMois, zoneRang, apercu], select: selReg, lire: lire };
  }

  function carteElement(x, jour, avecService) {
    var r = x.rdv;
    var plage = (x.debut < jour ? '…' : hm(x.debut)) + (x.fin ? ' – ' + (x.fin >= plusJours(jour, 1) ? '…' : hm(x.fin)) : '');
    var modifiable = peut('RDV') && (!x.externe || opts().modifAutresServices);
    return h('article', { class: 'agenda-element nature-' + (r.nature || 'autre') + (x.externe ? ' externe' : ''), tabindex: 0, role: 'button',
      'aria-label': libNature(r.nature, r.service) + ' ' + (r.titre || '') + ' ' + plage,
      onclick: function () { modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); },
      onkeydown: function (ev) { if (ev.key === 'Enter') modaleElement(r, null, !modifiable, x.externe ? x.patients : null, x.externe, x.occurrence); } },
      h('div', { class: 'agenda-plage', text: plage }),
      h('div', {}, teinter(h('span', { class: 'badge mode-hospi', text: libNature(r.nature, r.service) }), couleurNature(r.nature, r.service)), x.externe ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : (avecService ? h('span', { class: 'badge', text: U.libService(r.service) }) : null)),
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

  /**
   * Fenêtre d'un élément : création (r nul), modification, ou consultation (lecture seule / autre service). `init` :
   * { nature, patients, service } pour une création. Éléments ajoutables à tout événement (décision du porteur du
   * 8 novembre 2026) : patients, transports, accompagnateurs (désignés ou non), permission à faire valider, validation.
   */
  function modaleElement(r, jour, lecture, patientsVisibles, externe, occurrence, init) {
    // Toujours l'élément enregistré (réglages de toutes les dates), même ouvert depuis une date qui a ses propres réglages
    if (r && r.id && st().rdv[r.id]) r = st().rdv[r.id];
    var ini = init || {}, s = U.App.session, moi = s.compteEffectif();
    var repete = !!r && !!occurrence && A.regularite(r.regularite).type !== 'aucune';
    // Portée de la modification d'un élément répété : cette date seulement (par défaut) ou toutes les dates (décision du 8 novembre 2026)
    var portee = repete ? (ini.portee || 'date') : 'toutes', parDate = portee === 'date';
    var occ = parDate ? A.occurrences(r, plusJours(A.depuisISO(occurrence), -8), plusJours(A.depuisISO(occurrence), 9)).filter(function (o) { return o.occurrence === occurrence; })[0] : null;
    var x = r ? (parDate ? Object.assign({}, A.rdvOccurrence(r, occurrence), occ ? { debut: occ.debut, fin: occ.fin } : {}) : r) : {};
    var nouveau = !r, dis = lecture ? { disabled: true } : {};
    function courant() { var b = st().rdv[x.id] || r || x; return occurrence ? A.rdvOccurrence(b, occurrence) : b; }
    var reg = A.regularite(x.regularite), checklist = (x.checklist || []).map(function (it) { return { id: it.id, libelle: it.libelle, delai: it.delai === undefined ? null : it.delai }; });
    var serviceInitial = x.service || ini.service || (U.App.service !== '*' ? U.App.service : '');
    var disCommun = parDate ? { disabled: true, title: 'Commun à toutes les dates : choisissez « toutes les dates » pour le changer' } : dis;
    var sv = h('select', disCommun, (lecture ? U.tousServices() : U.services()).map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === serviceInitial }); }));
    var natureInitiale = x.nature || ini.nature || 'accompagnement';
    var codesNature = naturesPour(serviceInitial || null); if (codesNature.indexOf(natureInitiale) < 0) codesNature.push(natureInitiale);
    var nature = h('select', disCommun, codesNature.map(function (k) { return h('option', { value: k, text: libNature(k, serviceInitial), selected: natureInitiale === k }); }));
    function baseCat() { return baseNature(nature.value, sv.value); }
    var titre = h('input', Object.assign({ type: 'text', maxlength: 120, value: x.titre || '' }, dis));
    // Entretien : médical ou infirmier, individuel ou avec la famille
    var ent = x.entretien || {};
    var selEnt = h('select', dis, Object.keys(A.ENTRETIENS).map(function (k) { return h('option', { value: k, text: 'Entretien ' + A.ENTRETIENS[k], selected: (ent.type || 'medical') === k }); }));
    var selAvec = h('select', dis, Object.keys(A.AVEC).map(function (k) { return h('option', { value: k, text: A.AVEC[k][0].toUpperCase() + A.AVEC[k].slice(1), selected: (ent.avec || 'individuel') === k }); }));
    var zoneEnt = h('div', { class: 'grille-2' }, h('label', {}, 'Entretien', selEnt), h('label', {}, 'Avec', selAvec));
    // Examen : type d'examen (liste proposée ou texte libre) ; VSL et accompagnement par les éléments ajoutables
    var listeEx = 'ex-' + C.hex(C.aleatoire(3));
    var typeExamen = h('input', Object.assign({ type: 'text', maxlength: 80, list: listeEx, value: (x.examen && x.examen.type) || '', placeholder: 'ex. Scanner, prise de sang, consultation spécialisée' }, dis));
    var cbVSL = h('input', Object.assign({ type: 'checkbox' }, dis)), cbAccomp = h('input', Object.assign({ type: 'checkbox' }, dis));
    var zoneExamen = h('div', { class: 'pile' }, h('label', {}, 'Type d’examen', typeExamen), h('datalist', { id: listeEx }, A.EXAMENS.map(function (e) { return h('option', { value: e }); })),
      h('div', { class: 'actions gauche' }, h('label', { class: 'case' }, cbVSL, h('span', { text: 'VSL à prévoir' })), h('label', { class: 'case' }, cbAccomp, h('span', { text: 'Patient accompagné' }))));
    var zoneAudience = h('p', { class: 'muted', text: 'Audience devant le juge des libertés et de la détention (JLD) : patients convoqués, VSL à réserver et soignants à prévoir ci-dessous.' });
    var base = x.debut || (jour || minuit(Date.now())) + 10 * 3600e3;
    var date = h('input', Object.assign({ type: 'date', value: jourISO(base) }, dis));
    // Jour de fin (décision du 8 novembre 2026) : un élément peut durer plusieurs jours (ex. permission de 48 h)
    var dateFin = h('input', Object.assign({ type: 'date', value: jourISO(x.fin || base) }, dis));
    date.addEventListener('change', function () { if (!dateFin.value || dateFin.value < date.value) dateFin.value = date.value; });
    var hDebut = h('input', Object.assign({ type: 'time', value: hm(base) }, dis)), hFin = h('input', Object.assign({ type: 'time', value: x.fin ? hm(x.fin) : hm(base + 3600e3) }, dis));
    var lieu = h('input', Object.assign({ type: 'text', maxlength: 80, value: x.lieu || '', placeholder: 'ex. Salle d’activités, extérieur' }, dis));
    var patients = (x.patients || ini.patients || []).slice(), profs = (x.professionnels || []).map(function (p) { return { id: p.id || null, nom: p.nom }; });
    var transports = (Array.isArray(x.transports) ? x.transports : []).map(function (t) { return Object.assign({}, t); });
    var validations = A.validationsDe(x).map(function (v) { return Object.assign({}, v); });
    var nbAcc = Math.max(0, Math.round(+x.accompagnateurs || 0));
    // Préréglages d'une création selon le type (Audience : un VSL et un soignant ; permission : validation de la permission)
    // Préréglages de la catégorie à la création (durée, heure, lieu, intitulé, accompagnateurs, transports, validations, check-list)
    function prereglerNature(n) {
      if (!nouveau) return;
      var pr = cat(n, sv ? sv.value : serviceInitial).prereglages || {};
      if (pr.heure && hDebut && !ini.heureFixee) hDebut.value = pr.heure;
      if (pr.duree && hDebut && hDebut.value && date && date.value) {
        var t0 = new Date(date.value + 'T' + hDebut.value).getTime(), t1 = t0 + pr.duree * 6e4;
        hFin.value = hm(t1); dateFin.value = jourISO(t1);
      }
      if (pr.lieu && lieu && !lieu.value.trim()) lieu.value = pr.lieu;
      if (pr.titre && titre && !titre.value.trim()) titre.value = pr.titre;
      nbAcc = pr.accompagnateurs || 0;
      transports = (pr.transports || []).map(function (t) { return { id: 't' + C.hex(C.aleatoire(3)), type: t.type, nombre: t.nombre, precision: t.precision || '' }; });
      validations = (pr.validations || []).map(function (v) { return Object.assign({ id: (v.type === 'permission' ? 'p' : 'v') + C.hex(C.aleatoire(3)) }, v); });
      if (pr.checklist && checklist && !checklist.length) {
        var m = A.checklists(U.config()).filter(function (c) { return c.code === pr.checklist; })[0];
        if (m) m.items.forEach(function (it) { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: it.libelle, delai: it.delai }); });
      }
      if (visibles) { visibles.patients = pr.patients !== false; visibles.transports = transports.length > 0; visibles.accompagnateurs = nbAcc > 0; visibles.validations = validations.length > 0; }
    }
    var visibles = null;
    if (nouveau) prereglerNature(natureInitiale);
    visibles = { patients: !!patients.length || (nouveau ? cat(natureInitiale, serviceInitial).prereglages.patients !== false : ['reunion', 'autre'].indexOf(baseNature(natureInitiale, serviceInitial)) < 0), transports: !!transports.length, accompagnateurs: nbAcc > 0, validations: !!validations.length };

    // -- Patients
    var zonePat = h('div', { class: 'pile' }), recherche = '';
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
        var cb = h('input', { type: 'checkbox', checked: patients.indexOf(p.id) >= 0, onchange: function () { patients = cb.checked ? patients.concat([p.id]) : patients.filter(function (i) { return i !== p.id; }); dessinerValidations(); } });
        return h('label', { class: 'case' }, cb, h('span', { text: (p.nom || '?') + ' ' + (p.prenom || '') + (p.ipp ? ' — IPP ' + p.ipp : '') }));
      })));
      if (liste.length > 40) zonePat.appendChild(h('small', { class: 'muted', text: liste.length - 40 + ' autre(s) : précisez la recherche.' }));
    }
    // -- Professionnels prévus (accompagnateurs désignés)
    var zonePro = h('div', { class: 'pile' });
    function dessinerPros() {
      U.vider(zonePro);
      if (lecture) { zonePro.appendChild(h('p', { text: profs.length ? profs.map(function (p) { return p.nom; }).join(', ') : '—' })); return; }
      var comptes = (s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && (!(c.services || []).length || (c.services || []).indexOf(sv.value) >= 0 || profs.some(function (p) { return p.id === c.id; })); })
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
    // -- Accompagnateurs non désignés et inscriptions (date affichée)
    var zoneAcc = h('div', { class: 'pile' });
    function dessinerAccompagnateurs() {
      U.vider(zoneAcc);
      var champ = h('input', Object.assign({ type: 'number', min: 0, max: 20, step: 1, value: nbAcc, class: 'champ-court', 'aria-label': 'Accompagnateurs à trouver', oninput: function () { nbAcc = Math.max(0, Math.min(20, Math.round(+champ.value || 0))); } }, dis));
      zoneAcc.appendChild(h('label', { class: 'en-ligne' }, 'Accompagnateurs nécessaires', champ, h('small', { class: 'muted', text: 'sans les nommer : les agents s’inscrivent ; les professionnels prévus comptent' })));
      if (nouveau || !occurrence) return;
      var etatR = courant(), acc = A.accompagnateurs(etatR, occurrence), peutAutres = peut('INSCRIPTION') && !s.apercu && !externe;
      zoneAcc.appendChild(h('div', {}, h('b', { text: 'Le ' + occurrence.split('-').reverse().join('/') + ' : ' }), badgeAccompagnateurs({ accompagnateurs: acc })));
      acc.inscrits.forEach(function (i) {
        var lui = i.agent === moi.id;
        zoneAcc.appendChild(h('div', { class: 'barre' }, h('span', { text: i.nom + (i.par && i.par !== i.agent ? ' (inscrit(e) par ' + s.nomAuteur(i.par) + ')' : '') }),
          lui || peutAutres ? h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(i.agent, i.nom, true); } }, lui ? 'Me désinscrire' : 'Désinscrire') : null));
      });
      var dejaMoi = acc.inscrits.some(function (i) { return i.agent === moi.id; }) || (etatR.professionnels || []).some(function (p) { return p.id === moi.id; });
      var actions = h('div', { class: 'actions gauche' });
      if (!dejaMoi && !externe && !s.apercu) actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(moi.id, moi.nom, false); } }, 'M’inscrire'));
      if (peutAutres) {
        var choix = (s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && c.id !== moi.id && !acc.inscrits.some(function (i) { return i.agent === c.id; }) && (!(c.services || []).length || (c.services || []).indexOf(etatR.service) >= 0); })
          .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
        var selCol = h('select', { 'aria-label': 'Collègue à inscrire' }, [h('option', { value: '', text: 'Inscrire un collègue…' })].concat(choix.map(function (c) { return h('option', { value: c.id, text: c.nom }); })));
        actions.appendChild(selCol);
        actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { var c = choix.filter(function (y) { return y.id === selCol.value; })[0]; if (c) inscrire(c.id, c.nom, false); } }, 'Inscrire'));
      }
      zoneAcc.appendChild(actions);
      if (peutAutres) zoneAcc.appendChild(h('small', { class: 'muted', text: 'Le collègue inscrit ou désinscrit en est informé dans sa session (Agenda et Mon agenda).' }));
    }
    async function inscrire(agent, nom, retrait) {
      try {
        await s.enregistrer('INSCRIPTION', { rdv: x.id, occurrence: occurrence, agent: agent, nom: nom, retrait: retrait ? true : undefined, service: x.service });
        U.toast(retrait ? 'Désinscription enregistrée.' : 'Inscription enregistrée.');
        dessinerAccompagnateurs();
      } catch (e) { alert(e.message); }
    }
    // -- Transports (VSL, taxi…) et leur réservation pour la date affichée
    var zoneTr = h('div', { class: 'pile' });
    function dessinerTransports() {
      U.vider(zoneTr);
      var etatR = courant(), reserves = occurrence && !nouveau ? A.etatTransports(etatR, occurrence) : [];
      transports.forEach(function (t, i) {
        var selT = h('select', Object.assign({ 'aria-label': 'Transport', onchange: function () { t.type = selT.value; } }, dis), Object.keys(A.TRANSPORTS).map(function (k) { return h('option', { value: k, text: A.TRANSPORTS[k], selected: (t.type || 'vsl') === k }); }));
        var nb = h('input', Object.assign({ type: 'number', min: 1, max: 9, value: t.nombre || 1, class: 'champ-court', 'aria-label': 'Nombre', oninput: function () { t.nombre = Math.max(1, Math.min(9, Math.round(+nb.value || 1))); } }, dis));
        var prec = h('input', Object.assign({ type: 'text', maxlength: 100, value: t.precision || '', placeholder: 'Précision (aller-retour, horaire de prise en charge…)', oninput: function () { t.precision = prec.value; } }, dis));
        var e = reserves.filter(function (y) { return y.id === t.id; })[0];
        zoneTr.appendChild(h('div', { class: 'agenda-point' }, selT, nb, prec,
          e ? (e.reserve ? h('span', { class: 'badge ok', title: 'Par ' + s.nomAuteur(e.reserve.par) + ', ' + U.date(Date.parse(e.reserve.le)), text: 'Réservé' + (e.reserve.precision ? ' : ' + e.reserve.precision : '') }) : h('span', { class: 'badge warn', text: 'À réserver' })) : null,
          e && peut('TRANSPORT') && !externe ? h('button', { class: 'btn petit', type: 'button', onclick: function () { reserver(t.id, !e.reserve); } }, e.reserve ? 'Remettre à réserver' : 'Marquer réservé…') : null,
          lecture ? null : h('button', { class: 'btn petit danger', type: 'button', onclick: function () { transports.splice(i, 1); if (!transports.length) visibles.transports = false; majVisibles(); dessinerTransports(); } }, 'Retirer')));
      });
      if (!lecture) zoneTr.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); dessinerTransports(); } }, '+ Autre transport')));
      if (!nouveau && occurrence && transports.length) zoneTr.appendChild(h('small', { class: 'muted', text: 'Réservation pour le ' + occurrence.split('-').reverse().join('/') + '. Un transport ajouté ou modifié se réserve après l’enregistrement.' }));
    }
    async function reserver(id, oui) {
      var prec = oui ? prompt('Réservation (facultatif : société, numéro de réservation, horaire) :', '') : '';
      if (prec === null) return;
      try { await s.enregistrer('TRANSPORT', { rdv: x.id, transport: id, occurrence: occurrence, statut: oui ? 'reserve' : 'a-reserver', precision: (prec || '').trim(), service: x.service }); U.toast(oui ? 'Transport réservé.' : 'Transport remis à réserver.'); dessinerTransports(); }
      catch (e) { alert(e.message); }
    }
    // -- Validations : permission à faire valider (délai selon le mode), validation médicale ou autre (délai choisi)
    var zoneVal = h('div', { class: 'pile' });
    function dessinerValidations() {
      U.vider(zoneVal);
      var d0 = date.value && hDebut.value ? new Date(date.value + 'T' + hDebut.value).getTime() : Date.now();
      var etatR = Object.assign({}, courant(), { patients: patients, validations: validations });
      var etats = A.etatValidations(etatR, occurrence || jourISO(d0), d0, fiches(), U.config(), Date.now());
      validations.forEach(function (v, i) {
        var e = etats.filter(function (y) { return y.id === v.id; })[0] || {};
        var selV = h('select', Object.assign({ 'aria-label': 'Validation', onchange: function () { v.type = selV.value; dessinerValidations(); } }, dis), Object.keys(A.TYPES_VALIDATION).map(function (k) { return h('option', { value: k, text: A.TYPES_VALIDATION[k], selected: v.type === k }); }));
        var lib = h('input', Object.assign({ type: 'text', maxlength: 80, value: v.libelle || '', placeholder: v.type === 'permission' ? 'Précision (facultatif)' : 'ex. Avis du psychiatre, accord du tuteur', oninput: function () { v.libelle = lib.value; } }, dis));
        var delai = v.type === 'permission' ? null : h('input', Object.assign({ type: 'number', min: 0, max: 336, value: v.delai === undefined ? 24 : v.delai, class: 'champ-court', 'aria-label': 'Délai en heures', oninput: function () { v.delai = Math.max(0, Math.min(336, Math.round(+delai.value || 0))); } }, dis));
        var fait = !nouveau && occurrence ? e.fait : null;
        zoneVal.appendChild(h('div', { class: 'pile ag-validation' },
          h('div', { class: 'agenda-point' }, selV, lib, delai ? h('label', { class: 'en-ligne nowrap' }, delai, h('span', { text: 'h avant' })) : null,
            lecture ? null : h('button', { class: 'btn petit danger', type: 'button', onclick: function () { validations.splice(i, 1); if (!validations.length) visibles.validations = false; majVisibles(); dessinerValidations(); } }, 'Retirer')),
          h('small', { class: 'muted', text: v.type === 'permission' ? 'Validation médicale attendue ' + (e.delai ? e.delai + ' h avant le début' : 'au plus tard au début') + (e.modes && e.modes.length ? ' (mode : ' + e.modes.join(', ') + ')' : ' (selon le mode d’hospitalisation des patients)') + '.' : 'Validation attendue ' + (e.delai ? e.delai + ' h avant le début' : 'au plus tard au début') + '.' }),
          !nouveau && occurrence ? h('div', { class: 'barre' },
            fait ? h('span', { class: 'badge ' + (fait.statut === 'validee' ? 'ok' : 'bad'), text: (fait.statut === 'validee' ? 'Validée' : 'Refusée') + (fait.nom ? ' par ' + fait.nom : '') + (fait.le ? ', ' + U.date(Date.parse(fait.le)) : '') })
              : h('span', { class: 'badge ' + (e.niveau === 'retard' ? 'bad' : 'warn'), text: (e.niveau === 'retard' ? 'En retard — ' : 'À faire valider — ') + 'avant ' + libJour(e.echeance) + ' ' + hm(e.echeance) }),
            peut('VALIDATION') && !externe ? (fait ? h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'attente'); } }, 'Remettre en attente')
              : [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { valider(v.id, 'validee'); } }, 'Validée (signée)…'), h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'refusee'); } }, 'Refusée…')]) : null) : null));
      });
      if (!lecture) zoneVal.appendChild(h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { validations.push({ id: 'p' + C.hex(C.aleatoire(3)), type: 'permission' }); dessinerValidations(); } }, '+ Permission à faire valider'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { validations.push({ id: 'v' + C.hex(C.aleatoire(3)), type: 'medicale', delai: 24 }); dessinerValidations(); } }, '+ Validation médicale ou autre')));
    }
    async function valider(id, statut) {
      var nom = '';
      if (statut !== 'attente') {
        nom = prompt(statut === 'validee' ? 'Validée (signée) par :' : 'Refusée par :', (U.config().psychiatres || [])[0] || '');
        if (nom === null) return;
        if (!nom.trim()) { alert('Indiquez qui a validé ou refusé.'); return; }
      }
      try { await s.enregistrer('VALIDATION', { rdv: x.id, validation: id, occurrence: occurrence, statut: statut, nom: nom.trim(), service: x.service }); U.toast(statut === 'attente' ? 'Remise en attente.' : (statut === 'validee' ? 'Validation enregistrée.' : 'Refus enregistré.')); dessinerValidations(); }
      catch (e) { alert(e.message); }
    }
    // Commentaires (tout agent de l'Agenda, y compris sur un élément d'un autre service)
    var zoneCom = h('div', { class: 'pile' });
    function dessinerCommentaires() {
      U.vider(zoneCom);
      var etatR = st().rdv[x.id] || x, liste = etatR.commentaires || [];
      zoneCom.appendChild(liste.length ? h('ul', {}, liste.map(function (c) { return h('li', {}, h('small', { class: 'muted', text: U.date(Date.parse(c.le)) + ' — ' + s.nomAuteur(c.par) + (c.service ? ' (' + U.libService(c.service) + ')' : '') + ' : ' }), c.texte); }))
        : h('small', { class: 'muted', text: 'Aucun commentaire.' }));
      var txt = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Information d’organisation (pas de donnée clinique)' });
      var monService = U.App.service !== '*' ? U.App.service : (s.mesServices()[0] || null);
      zoneCom.appendChild(h('div', { class: 'barre' }, txt, h('button', { class: 'btn petit', type: 'button', onclick: async function () {
        if (!txt.value.trim()) return;
        try { await s.enregistrer('COMMENTAIRE', { id: 'K' + C.hex(C.aleatoire(5)), rdv: x.id, texte: txt.value.trim(), service: monService }); dessinerCommentaires(); } catch (e) { alert(e.message); }
      } }, 'Ajouter le commentaire')));
    }
    var rep = champsRepetition(reg, parDate ? { disabled: true } : dis);
    // Check-list (points à réaliser avant l'événement, ex. sortie d'un patient)
    var zoneCheck = h('div', { class: 'pile' });
    function dessinerChecklist() {
      U.vider(zoneCheck);
      var etat = r && occurrence ? A.etatChecklist(courant(), occurrence, Date.now()) : null, peutCocher = !nouveau && occurrence && peut('CHECK');
      checklist.forEach(function (it, i) {
        var f = etat && etat.items.filter(function (y) { return y.id === it.id; })[0];
        var cb = h('input', { type: 'checkbox', checked: !!(f && f.fait), disabled: !peutCocher || !f, onchange: async function () {
          try { await s.enregistrer('CHECK', { rdv: x.id, item: it.id, occurrence: occurrence, fait: cb.checked, service: externe ? (U.App.service !== '*' ? U.App.service : s.mesServices()[0]) : x.service }); dessinerChecklist(); }
          catch (e) { cb.checked = !cb.checked; alert(e.message); }
        } });
        zoneCheck.appendChild(h('div', { class: 'agenda-point' }, h('label', { class: 'case' }, cb, h('span', { text: it.libelle })),
          lecture ? (it.delai !== null && it.delai !== undefined ? h('small', { class: 'muted', text: libDelai(it.delai) }) : null) : selectDelai(it.delai, function (v) { it.delai = v; }),
          f && f.alerte ? h('span', { class: 'badge bad', text: 'En retard (attendu ' + (f.delai ? 'le ' + libJour(f.echeance) : 'le jour même') + ')' }) : null,
          f && f.fait ? h('small', { class: 'muted', text: s.nomAuteur(f.fait.par) + ', ' + U.date(Date.parse(f.fait.le)) }) : null,
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
      }
    }
    // Sections ajoutables et barre « Ajouter »
    function section(titreS, contenu) { return h('div', { class: 'pile ag-section' }, h('b', { text: titreS }), contenu); }
    var secPatients = section('Patients', zonePat), secTransports = section('Transports', zoneTr), secAcc = section('Accompagnateurs à trouver', zoneAcc), secVal = section('Permission et validations', zoneVal);
    var barreAjout = h('div', { class: 'actions gauche ag-ajouter' });
    function majVisibles() {
      secPatients.hidden = !visibles.patients; secTransports.hidden = !visibles.transports; secAcc.hidden = !visibles.accompagnateurs; secVal.hidden = !visibles.validations;
      U.vider(barreAjout);
      if (lecture) { barreAjout.hidden = true; return; }
      barreAjout.appendChild(h('span', { class: 'muted', text: 'Ajouter :' }));
      [['patients', '+ Patients', function () { visibles.patients = true; }],
        ['transports', '+ Transport', function () { visibles.transports = true; if (!transports.length) transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); dessinerTransports(); }],
        ['accompagnateurs', '+ Accompagnateur', function () { visibles.accompagnateurs = true; if (!nbAcc) nbAcc = 1; dessinerAccompagnateurs(); }],
        ['permission', '+ Permission à faire valider', function () { visibles.validations = true; validations.push({ id: 'p' + C.hex(C.aleatoire(3)), type: 'permission' }); dessinerValidations(); }],
        ['validation', '+ Validation (médicale ou autre)', function () { visibles.validations = true; validations.push({ id: 'v' + C.hex(C.aleatoire(3)), type: 'medicale', delai: 24 }); dessinerValidations(); }]]
        .forEach(function (b) { if (visibles[b[0]] && b[0] !== 'accompagnateurs') return; barreAjout.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { b[2](); majVisibles(); } }, b[1])); });
      cbVSL.checked = transports.some(function (t) { return t.type === 'vsl'; }); cbAccomp.checked = nbAcc > 0 || profs.length > 0;
    }
    cbVSL.addEventListener('change', function () {
      if (cbVSL.checked) { if (!transports.some(function (t) { return t.type === 'vsl'; })) transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); visibles.transports = true; }
      else { transports = transports.filter(function (t) { return t.type !== 'vsl'; }); visibles.transports = transports.length > 0; }
      dessinerTransports(); majVisibles();
    });
    cbAccomp.addEventListener('change', function () { nbAcc = cbAccomp.checked ? Math.max(1, nbAcc) : 0; visibles.accompagnateurs = nbAcc > 0; dessinerAccompagnateurs(); majVisibles(); });
    function majNature(changement) {
      var b = baseCat();
      zoneEnt.hidden = b !== 'entretien'; zoneExamen.hidden = b !== 'examen'; zoneAudience.hidden = b !== 'audience';
      titre.placeholder = ['entretien', 'permission', 'examen', 'audience'].indexOf(b) >= 0 || !A.NATURES[nature.value] ? 'Facultatif' : 'ex. Rendez-vous extérieur, atelier, synthèse';
      if (nouveau && changement) prereglerNature(nature.value);
      dessinerTransports(); dessinerAccompagnateurs(); dessinerValidations(); dessinerChecklist(); majVisibles();
    }
    nature.addEventListener('change', function () { majNature(true); });
    sv.addEventListener('change', function () { dessinerPatients(); dessinerPros(); });
    [date, hDebut].forEach(function (c) { c.addEventListener('change', dessinerValidations); });
    if (!nouveau) dessinerCommentaires();
    dessinerPatients(); dessinerPros(); dessinerChecklist();

    var boutons = [{ texte: lecture || repete ? 'Fermer' : 'Annuler' }];
    var propres = (x.surchargee || []).map(function (k) { return LIB_CHAMPS[k] || k; });
    if (!lecture && parDate && x.annulee) boutons.push({ texte: 'Rétablir cette date', action: async function () {
      await s.enregistrer('OCCURRENCE', { rdv: x.id, occurrence: occurrence, annulee: false, service: x.service });
      U.toast('Date rétablie.');
    } });
    else if (!lecture && parDate) boutons.push({ texte: 'Annuler cette date…', action: async function () {
      var motif = prompt('Annuler le ' + occurrence.split('-').reverse().join('/') + ' (la date reste affichée, barrée). Motif (facultatif) :', baseNature(x.nature, x.service) === 'audience' ? 'Aucun patient convoqué' : '');
      if (motif === null) return false;
      await s.enregistrer('OCCURRENCE', { rdv: x.id, occurrence: occurrence, annulee: true, motifAnnulation: motif.trim(), service: x.service });
      U.toast('Date annulée.');
    } });
    if (!lecture && parDate && propres.length) boutons.push({ texte: 'Reprendre les réglages communs', action: async function () {
      if (!confirm('Le ' + occurrence.split('-').reverse().join('/') + ' reprend les réglages de toutes les dates (' + propres.join(', ') + ' propres à cette date seront oubliés) ?')) return false;
      await s.enregistrer('OCCURRENCE', { rdv: x.id, occurrence: occurrence, reset: true, service: x.service });
      U.toast('Réglages communs repris pour cette date.');
    } });
    if (!lecture && !nouveau && repete && !parDate) boutons.push({ texte: 'Retirer cette date', action: async function () {
      if (!confirm('Retirer définitivement l’occurrence du ' + occurrence.split('-').reverse().join('/') + ' ? Les autres dates sont gardées.')) return false;
      await s.enregistrer('RDV', { id: x.id, exceptions: (r.exceptions || []).concat([occurrence]), service: x.service });
      U.toast('Date retirée.');
    } });
    if (!lecture && !nouveau && repete && !parDate && occurrence > A.jourISO(r.debut)) boutons.push({ texte: 'Arrêter à cette date', action: async function () {
      if (!confirm('Arrêter la répétition : retirer le ' + occurrence.split('-').reverse().join('/') + ' et toutes les dates suivantes ? Les dates précédentes sont gardées.')) return false;
      var rg = A.regularite(r.regularite); rg.jusquAu = A.jourISO(plusJours(A.depuisISO(occurrence), -1));
      await s.enregistrer('RDV', { id: x.id, regularite: rg, service: x.service });
      U.toast('Dates retirées à partir du ' + occurrence.split('-').reverse().join('/') + '.');
    } });
    if (!lecture && !nouveau && !parDate) boutons.push({ texte: repete ? 'Supprimer toutes les dates' : 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer « ' + libelleElement(x) + ' »' + (repete ? ' et toutes ses dates' : '') + ' de l’agenda ?')) return false;
      await s.enregistrer('RDV', { id: x.id, supprime: true, service: x.service });
      U.toast('Élément supprimé.');
    } });
    if (!lecture) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var nv = nature.value;
      var bv = baseCat(), cv = cat(nv, sv.value);
      if (!titre.value.trim() && ['entretien', 'permission', 'examen', 'audience'].indexOf(bv) < 0 && A.NATURES[nv]) throw new Error('Indiquez un intitulé.');
      if (cv.prereglages.psychiatrie && !servicePsy(sv.value)) throw new Error('« ' + cv.libelle + ' » est réservé aux services de psychiatrie (Administration → Patients → Fiche patient par service).');
      if (bv === 'examen' && !typeExamen.value.trim()) throw new Error('Indiquez le type d’examen.');
      if (!date.value || !hDebut.value) throw new Error('Indiquez la date et l’heure de début.');
      var d0 = new Date(date.value + 'T' + hDebut.value).getTime(), d1 = hFin.value ? new Date((dateFin.value || date.value) + 'T' + hFin.value).getTime() : null;
      if (d1 !== null && d1 <= d0) throw new Error('La fin doit suivre le début (vérifiez le jour et l’heure de fin).');
      if (d1 !== null && d1 - d0 > 14 * 864e5) throw new Error('Un élément ne dure pas plus de 14 jours.');
      if (d1 !== null && cv.prereglages.dureeMax && d1 - d0 > cv.prereglages.dureeMax * 36e5 && !confirm('Durée de ' + Math.round((d1 - d0) / 36e5) + ' h, au-delà des ' + cv.prereglages.dureeMax + ' h prévues pour « ' + cv.libelle + ' ». Enregistrer quand même ?')) return false;
      var rg = rep.lire();
      if (rg.jusquAu && rg.jusquAu < date.value) throw new Error('La date de fin de répétition précède la première date.');
      if (parDate) rg = A.regularite(r.regularite);
      if (rg.type === 'semaine' && !rg.jours.length) rg.jours = [new Date(d0).getDay()];
      if (validations.some(function (v) { return v.type !== 'permission' && !String(v.libelle || '').trim(); })) throw new Error('Précisez l’intitulé de chaque validation médicale ou autre (ex. avis du psychiatre).');
      var d = { id: x.id || 'R' + C.hex(C.aleatoire(6)), nature: nv, titre: titre.value.trim(), debut: d0, fin: d1, lieu: lieu.value.trim(), service: sv.value,
        patients: visibles.patients ? patients : [], professionnels: profs, regularite: rg, checklist: checklist,
        accompagnateurs: visibles.accompagnateurs ? nbAcc : 0,
        transports: visibles.transports ? transports.map(function (t) { return { id: t.id, type: t.type || 'vsl', nombre: Math.max(1, Math.round(+t.nombre || 1)), precision: String(t.precision || '').trim() }; }) : [],
        validations: visibles.validations ? validations.map(function (v) { var o = { id: v.id, type: v.type, libelle: String(v.libelle || '').trim() }; if (v.type !== 'permission') o.delai = v.delai === undefined ? 24 : v.delai; return o; }) : [] };
      if (bv === 'entretien') d.entretien = { type: selEnt.value, avec: selAvec.value };
      if (bv === 'examen') d.examen = { type: typeExamen.value.trim() };
      if (parDate) {
        // Cette date seulement : champs modifiés par rapport à cette date, rangés comme réglages propres à la date
        var od = { rdv: x.id, occurrence: occurrence, service: r.service }, n0 = 0;
        ['titre', 'lieu', 'patients', 'professionnels', 'accompagnateurs', 'transports', 'validations', 'checklist'].forEach(function (k) {
          var av = x[k] === undefined ? (Array.isArray(d[k]) ? [] : (k === 'accompagnateurs' ? 0 : '')) : x[k];
          if (JSON.stringify(d[k]) !== JSON.stringify(av)) { od[k] = d[k]; n0++; }
        });
        if (d0 !== x.debut || d1 !== (x.fin || null)) { od.debut = d0; od.fin = d1; n0++; }
        if (!n0) return true;
        await s.enregistrer('OCCURRENCE', od);
        U.toast('Modifié pour le ' + occurrence.split('-').reverse().join('/') + ' seulement.');
        return;
      }
      if (!nouveau) Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k])) delete d[k]; });
      if (!nouveau && Array.isArray(d.validations) && !Array.isArray(x.validations) && !d.validations.length && !A.validationsDe(x).length) delete d.validations;
      if (nouveau) ['accompagnateurs', 'transports', 'validations'].forEach(function (k) { if (!d[k] || (Array.isArray(d[k]) && !d[k].length)) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      await s.enregistrer('RDV', d);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
    } });
    U.modale(nouveau ? 'Nouvel élément de l’agenda' : (lecture ? libelleElement(x) + (externe ? ' — ' + U.libService(x.service) : '') : (parDate ? 'Modifier le ' + occurrence.split('-').reverse().join('/') : 'Modifier l’élément')), h('div', { class: 'pile' },
      externe ? h('p', { class: 'muted', text: 'Élément de l’agenda du service ' + U.libService(x.service) + ', qui concerne un patient hospitalisé dans votre service' + (lecture ? ' : consultation et commentaires.' : '.') }) : null,
      repete && !lecture ? h('fieldset', { class: 'ag-portee' }, h('legend', { text: 'Élément répété (' + A.libelleRepetition(r.regularite) + ') : modifier' }),
        h('div', { class: 'actions gauche' }, [['date', 'cette date seulement (' + occurrence.split('-').reverse().join('/') + ')'], ['toutes', 'toutes les dates']].map(function (o) {
          var rb = h('input', { type: 'radio', name: 'portee-' + x.id, checked: portee === o[0], onchange: function () { fermerPuisAgenda(function () { modaleElement(r, jour, lecture, patientsVisibles, externe, occurrence, Object.assign({}, ini, { portee: o[0] })); }); } });
          return h('label', { class: 'case' }, rb, h('span', { text: o[1] }));
        })),
        parDate ? h('small', { class: 'muted', text: (x.annulee ? 'Date annulée' + (x.motifAnnulation ? ' : ' + x.motifAnnulation : '') + '. ' : '') + (propres.length ? 'Réglages propres à cette date : ' + propres.join(', ') + '. ' : '') + 'Patients, accompagnateurs, transports, validations, check-list, horaires et lieu se règlent pour cette date ; le type, le service et la répétition sont communs à toutes les dates.' }) :
          h('small', { class: 'muted', text: 'Les dates qui ont leurs propres réglages les gardent.' })) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', nature), h('label', {}, 'Service', sv)),
      zoneEnt, zoneExamen, zoneAudience,
      h('label', {}, 'Intitulé', titre),
      h('div', { class: 'grille-4' }, h('label', {}, 'Jour de début', date), h('label', {}, 'Heure de début', hDebut), h('label', {}, 'Jour de fin', dateFin), h('label', {}, 'Heure de fin', hFin)),
      h('label', {}, 'Lieu', lieu),
      parDate ? null : rep.noeuds,

      barreAjout, secPatients,
      section('Professionnels prévus (accompagnateurs désignés)', zonePro), secAcc, secTransports, secVal,
      section('Check-list (à réaliser avant l’événement)', zoneCheck),
      nouveau ? null : section('Commentaires', zoneCom),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : le motif et le contenu de la prise en charge restent dans le dossier du patient.' })), boutons, { large: true });
    majNature();
  }

  function libRepetition(v) { return A.libelleRepetition(v); }
  var LIB_CHAMPS = { debut: 'horaires', lieu: 'lieu', titre: 'intitulé', patients: 'patients', professionnels: 'professionnels prévus', accompagnateurs: 'accompagnateurs', transports: 'transports', validations: 'validations', checklist: 'check-list' };
  function fermerPuisAgenda(fn) { var dlg = document.querySelector('dialog[open]'); if (dlg) dlg.dispatchEvent(new Event('cancel')); setTimeout(fn, 0); }

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
    var pv = A.aFaireValider(st(), fiches(), U.config(), svs, maintenant), tr = A.transportsAReserver(st(), fiches(), svs, maintenant, 7, U.config()), am = A.accompagnateursManquants(st(), fiches(), svs, maintenant, 7, U.config());
    if (pv.length) parts.push(pv.length + (pv.length > 1 ? ' validations à obtenir' : ' validation à obtenir') + (pv.some(function (p) { return p.niveau === 'retard'; }) ? ' (dont en retard)' : ''));
    if (tr.length) parts.push(tr.length + (tr.length > 1 ? ' transports à réserver' : ' transport à réserver'));
    if (am.length) parts.push(am.length + (am.length > 1 ? ' éléments sans tous leurs accompagnateurs' : ' élément sans tous ses accompagnateurs'));
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
          h('section', { class: 'panneau' }, h('h2', { text: 'Accompagnateurs à trouver (7 jours)' }),
            am.length ? h('ul', { class: 'liste-simple' }, am.map(function (x) {
              return h('li', {}, badgeAccompagnateurs(x), ' ', h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirElement(x); } }, libelleElement(x.rdv)),
                h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) + ' ' }), boutonInscription(x, true));
            })) : h('p', { class: 'muted', text: 'Tous les accompagnateurs sont trouvés.' })));
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
      bandeauAvis(),
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
    var LIB_COULEURS = { tache: 'Tâche', alerte: 'Alerte' };
    var champsCouleurs = Object.keys(LIB_COULEURS).map(function (k) { return { k: k, c: h('input', { type: 'color', value: o.couleurs[k], 'aria-label': 'Couleur : ' + LIB_COULEURS[k] }) }; });
    // Délais de validation médicale des permissions, par mode d'hospitalisation
    var modes = (U.config().modesHospitalisation || []).map(function (m) { return m.code; });
    Object.keys(o.delaisPermission).forEach(function (k) { if (modes.indexOf(k) < 0) modes.push(k); });
    var champsDelais = modes.map(function (m) { return { m: m, c: h('input', { type: 'number', min: 0, max: 168, step: 1, class: 'champ-court', value: A.delaiPermission(U.config(), m), 'aria-label': 'Délai de validation : ' + m }) }; });
    // Types affichés en transparence tant qu'aucun patient n'est prévu (audience JLD par défaut)
    var attente = A.typesEnAttente(U.config());
    var casesAttente = Object.keys(A.NATURES).filter(function (k) { return k !== 'reunion'; }).map(function (k) { return { k: k, cb: h('input', { type: 'checkbox', checked: attente.indexOf(k) >= 0 }) }; });
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
      h('h3', { text: 'Couleurs des tâches et des alertes' }),
      h('p', { class: 'muted', text: 'La couleur de chaque catégorie d’événement se règle dans « Catégories d’événements ».' }),
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
        // Catégories (onglet voisin) et anciens réglages qu'elles reprennent : conservés tels quels
        var ancien = U.config().agenda || {};
        if (ancien.categories) valeur.categories = ancien.categories;
        if (ancien.attenteSansPatient) valeur.attenteSansPatient = ancien.attenteSansPatient;
        Object.keys(ancien.couleurs || {}).forEach(function (k) { if (A.NATURES[k]) (valeur.couleurs = valeur.couleurs || {})[k] = ancien.couleurs[k]; });
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Catégories d'événements (Administration → Agenda)
  /**
   * Catégories et préréglages (décision du porteur du 8 novembre 2026) : types fournis et catégories ajoutées, pour
   * l'établissement ou pour un service (un service hérite de l'établissement et peut s'en écarter, masquer une catégorie
   * ou en ajouter). Seuls les écarts avec le niveau au-dessus sont enregistrés (`config.agenda.categories[niveau]`).
   */
  var niveauCategories = '*';
  function panneauCategories() {
    var cfg = U.config(), ag = cfg.agenda || {};
    var selNiveau = h('select', { 'aria-label': 'Niveau des réglages', onchange: function () { niveauCategories = selNiveau.value; U.rendreContenu(); } },
      [h('option', { value: '*', text: 'Établissement (tous les services)', selected: niveauCategories === '*' })].concat(U.tousServices().map(function (v) { return h('option', { value: v.code, text: 'Service ' + v.libelle, selected: niveauCategories === v.code }); })));
    // Niveau au-dessus : types fournis pour l'établissement, réglages de l'établissement pour un service
    var cfgParent = niveauCategories === '*' ? { agenda: { couleurs: {} } } : { agenda: Object.assign({}, ag, { categories: { '*': (ag.categories || {})['*'] || {} } }) };
    var parent = A.categories(cfgParent, niveauCategories === '*' ? null : niveauCategories);
    var liste = JSON.parse(JSON.stringify(A.categories(cfg, niveauCategories === '*' ? null : niveauCategories)));
    var modeles = A.checklists(cfg);
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      liste.forEach(function (c, i) {
        var pr = c.prereglages;
        var lib = h('input', { type: 'text', maxlength: 60, value: c.libelle, 'aria-label': 'Nom de la catégorie', oninput: function () { c.libelle = lib.value; } });
        var coul = h('input', { type: 'color', value: c.couleur, 'aria-label': 'Couleur', oninput: function () { c.couleur = coul.value; } });
        var actif = h('input', { type: 'checkbox', checked: c.actif, onchange: function () { c.actif = actif.checked; } });
        function nombre(k, max, aria) { var n = h('input', { type: 'number', min: 0, max: max, class: 'champ-court', value: pr[k] || '', 'aria-label': aria, oninput: function () { pr[k] = n.value === '' ? undefined : Math.max(0, Math.min(max, Math.round(+n.value))); } }); return n; }
        function texte(k, ph) { var t = h('input', { type: 'text', maxlength: 120, value: pr[k] || '', placeholder: ph, oninput: function () { pr[k] = t.value; } }); return t; }
        function coche(k, lib2) { var cb = h('input', { type: 'checkbox', checked: !!pr[k], onchange: function () { pr[k] = cb.checked; } }); return h('label', { class: 'case' }, cb, h('span', { text: lib2 })); }
        var duree = h('input', { type: 'number', min: 0, max: 20160, step: 5, class: 'champ-court', value: pr.duree || '', 'aria-label': 'Durée en minutes', oninput: function () { pr.duree = +duree.value || undefined; } });
        var heure = h('input', { type: 'time', value: pr.heure || '', 'aria-label': 'Heure de début proposée', oninput: function () { pr.heure = heure.value || undefined; } });
        var selCL = h('select', { 'aria-label': 'Check-list proposée', onchange: function () { pr.checklist = selCL.value || undefined; } }, [h('option', { value: '', text: 'Aucune' })].concat(modeles.map(function (m) { return h('option', { value: m.code, text: m.libelle, selected: pr.checklist === m.code }); })));
        var zTr = h('div', { class: 'actions gauche' });
        function dessinerTr() {
          U.vider(zTr);
          (pr.transports = pr.transports || []).forEach(function (t, k) {
            var st0 = h('select', { 'aria-label': 'Transport', onchange: function () { t.type = st0.value; } }, Object.keys(A.TRANSPORTS).map(function (x) { return h('option', { value: x, text: A.TRANSPORTS[x], selected: t.type === x }); }));
            var nb = h('input', { type: 'number', min: 1, max: 9, value: t.nombre || 1, class: 'champ-court', 'aria-label': 'Nombre', oninput: function () { t.nombre = +nb.value || 1; } });
            zTr.appendChild(h('span', { class: 'en-ligne' }, st0, nb, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le transport', onclick: function () { pr.transports.splice(k, 1); dessinerTr(); } }, '×')));
          });
          zTr.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { pr.transports.push({ type: 'vsl', nombre: 1 }); dessinerTr(); } }, '+ Transport'));
        }
        dessinerTr();
        var zVal = h('div', { class: 'actions gauche' });
        function dessinerVal() {
          U.vider(zVal);
          (pr.validations = pr.validations || []).forEach(function (v, k) {
            var sv0 = h('select', { 'aria-label': 'Validation', onchange: function () { v.type = sv0.value; dessinerVal(); } }, Object.keys(A.TYPES_VALIDATION).map(function (x) { return h('option', { value: x, text: A.TYPES_VALIDATION[x], selected: v.type === x }); }));
            var lv = h('input', { type: 'text', maxlength: 80, value: v.libelle || '', placeholder: 'Intitulé', 'aria-label': 'Intitulé de la validation', oninput: function () { v.libelle = lv.value; } });
            var dv = v.type === 'permission' ? null : h('input', { type: 'number', min: 0, max: 336, value: v.delai === undefined ? 24 : v.delai, class: 'champ-court', 'aria-label': 'Délai en heures', oninput: function () { v.delai = +dv.value; } });
            zVal.appendChild(h('span', { class: 'en-ligne' }, sv0, lv, dv, dv ? h('small', { text: 'h avant' }) : null, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la validation', onclick: function () { pr.validations.splice(k, 1); dessinerVal(); } }, '×')));
          });
          zVal.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { pr.validations.push({ type: 'medicale', libelle: '', delai: 24 }); dessinerVal(); } }, '+ Validation'));
        }
        dessinerVal();
        var selBase = c.fournie ? null : h('select', { 'aria-label': 'Comportement repris', onchange: function () { c.base = selBase.value; } }, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: c.base === k }); }));
        zone.appendChild(teinter(h('details', { class: 'ag-categorie' + (c.actif ? '' : ' inactive') },
          h('summary', {}, h('span', { class: 'ag-cle' }, h('i'), c.libelle || 'Nouvelle catégorie'), c.fournie ? h('small', { class: 'muted', text: ' (fournie)' }) : h('small', { class: 'muted', text: ' (ajoutée, comme « ' + A.NATURES[c.base] + ' »)' }), c.actif ? null : h('span', { class: 'badge', text: 'masquée' })),
          h('div', { class: 'pile' },
            h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Nom', lib), h('label', { class: 'en-ligne' }, 'Couleur', coul), h('label', { class: 'case' }, actif, h('span', { text: 'Proposée' })),
              selBase ? h('label', { class: 'en-ligne' }, 'Comportement de', selBase) : null),
            h('b', { text: 'Préréglages à la création' }),
            h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Durée', duree, h('small', { text: 'min' })), h('label', { class: 'en-ligne' }, 'Début proposé', heure),
              h('label', { class: 'en-ligne' }, 'Durée maximale', nombre('dureeMax', 720, 'Durée maximale en heures'), h('small', { text: 'h (alerte au-delà)' }))),
            h('div', { class: 'grille-2' }, h('label', {}, 'Lieu', texte('lieu', 'ex. Salle d’audience')), h('label', {}, 'Intitulé', texte('titre', 'ex. Audience du mercredi'))),
            h('div', { class: 'actions gauche' }, coche('patients', 'Section Patients affichée'), h('label', { class: 'en-ligne' }, 'Accompagnateurs à trouver', nombre('accompagnateurs', 20, 'Accompagnateurs')),
              coche('attente', 'Transparente sans patient prévu'), coche('psychiatrie', 'Services de psychiatrie seulement')),
            h('div', {}, h('small', { class: 'muted', text: 'Transports' }), zTr),
            h('div', {}, h('small', { class: 'muted', text: 'Permission et validations' }), zVal),
            h('label', { class: 'en-ligne' }, 'Check-list', selCL),
            h('div', { class: 'actions gauche' },
              h('button', { class: 'btn petit', type: 'button', disabled: i === 0, onclick: function () { liste.splice(i - 1, 0, liste.splice(i, 1)[0]); dessiner(); } }, '▲ Monter'),
              c.fournie || parent.some(function (p) { return p.code === c.code; }) ? h('button', { class: 'btn petit', type: 'button', onclick: function () {
                var p = parent.filter(function (y) { return y.code === c.code; })[0]; if (p) { liste[i] = JSON.parse(JSON.stringify(p)); dessiner(); }
              } }, niveauCategories === '*' ? 'Préréglages fournis' : 'Reprendre les réglages de l’établissement') :
                h('button', { class: 'btn petit danger', type: 'button', onclick: function () { if (confirm('Retirer la catégorie « ' + c.libelle + ' » ? Les éléments déjà créés gardent leur catégorie (affichés comme « autre événement »). Pour seulement ne plus la proposer, décochez « Proposée ».')) { liste.splice(i, 1); dessiner(); } } }, 'Retirer')))), c.couleur));
      });
    }
    dessiner();
    var nomNouv = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Consultation dentaire, atelier jardin' });
    var baseNouv = h('select', { 'aria-label': 'Comportement repris' }, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: 'comme « ' + A.NATURES[k] + ' »', selected: k === 'autre' }); }));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Catégories d’événements' }),
      h('p', { class: 'muted', text: 'Catégories proposées par « + Nouveau » dans l’agenda, leur couleur et leurs préréglages (appliqués à la création, modifiables ensuite sur l’élément). Réglez d’abord l’établissement ; un service hérite de ces réglages et peut s’en écarter, masquer une catégorie ou en ajouter une.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', selNiveau),
      zone,
      h('div', { class: 'actions gauche ag-ajouter' }, h('span', { class: 'muted', text: 'Ajouter une catégorie :' }), nomNouv, baseNouv,
        h('button', { class: 'btn petit', type: 'button', onclick: function () {
          var n = nomNouv.value.trim(); if (!n) return nomNouv.focus();
          var code = (n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'categorie');
          if (!/^[a-z]/.test(code)) code = 'c-' + code;
          while (liste.some(function (c) { return c.code === code; }) || A.NATURES[code]) code = code.slice(0, 26) + '-' + C.hex(C.aleatoire(1));
          var p0 = JSON.parse(JSON.stringify(A.PREREGLAGES_DEFAUT[baseNouv.value] || {}));
          liste.push({ code: code, libelle: n, base: baseNouv.value, couleur: A.COULEURS_DEFAUT[baseNouv.value], prereglages: p0, fournie: false, actif: true });
          nomNouv.value = ''; dessiner();
        } }, 'Ajouter')),
      U.boutonEnregistrer(async function () {
        // Écarts avec le niveau au-dessus seulement
        var ecarts = {};
        liste.forEach(function (c) {
          if (!String(c.libelle || '').trim()) throw new Error('Chaque catégorie doit avoir un nom.');
          var p = parent.filter(function (y) { return y.code === c.code; })[0], e = {}, pr = A.nettoyerPrereglages(c.prereglages);
          if (!p) { e = { libelle: c.libelle.trim(), base: c.base, couleur: c.couleur, actif: c.actif, prereglages: pr }; }
          else {
            if (c.libelle.trim() !== p.libelle) e.libelle = c.libelle.trim();
            if (c.couleur !== p.couleur) e.couleur = c.couleur;
            if (c.actif !== p.actif) e.actif = c.actif;
            var pp = A.nettoyerPrereglages(p.prereglages), diff = {};
            Object.keys(pr).concat(Object.keys(pp)).forEach(function (k) { if (JSON.stringify(pr[k]) !== JSON.stringify(pp[k])) diff[k] = pr[k] === undefined ? (Array.isArray(pp[k]) ? [] : (typeof pp[k] === 'boolean' ? false : (typeof pp[k] === 'number' ? 0 : ''))) : pr[k]; });
            if (Object.keys(diff).length) e.prereglages = diff;
          }
          if (Object.keys(e).length) ecarts[c.code] = e;
        });
        var valeur = JSON.parse(JSON.stringify(ag)), cats = valeur.categories || {};
        if (Object.keys(ecarts).length) cats[niveauCategories] = ecarts; else delete cats[niveauCategories];
        valeur.categories = cats;
        if (Object.keys(cats).length === 0) delete valeur.categories;
        // Couleurs et transparence par type des versions précédentes : désormais portées par les catégories
        if (niveauCategories === '*') { delete valeur.attenteSansPatient; Object.keys(valeur.couleurs || {}).forEach(function (k) { if (A.NATURES[k]) delete valeur.couleurs[k]; }); }
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { OCCURRENCE: 'Agenda : réglage d’une date', VALIDATION: 'Agenda : validation', TRANSPORT: 'Agenda : transport', RDV: 'Agenda : élément', COMMENTAIRE: 'Agenda : commentaire', CHECK: 'Agenda : check-list', INSCRIPTION: 'Agenda : inscription d’un accompagnateur', TACHE: 'Agenda : tâche du service', TACHE_EQUIPE: 'Agenda : tâche de l’équipe', TACHE_AJUSTEMENT: 'Agenda : tâche ajustée', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE: 'Agenda : alerte', ALERTE_VUE: 'Agenda : alerte vue' };
  function resume(e) {
    var d = e.data || {};
    switch (e.type) {
      case 'RDV':
        if (d.supprime) return 'Élément supprimé de l’agenda (' + U.libService(d.service) + ')';
        if (d.statut === 'validee' && !d.nature) return 'Permission de sortie validée' + (d.validation && d.validation.par ? ' (signée par ' + d.validation.par + ')' : '');
        return (d.nature ? libNature(d.nature, d.service) : 'Élément modifié') + (d.entretien ? ' ' + (A.ENTRETIENS[d.entretien.type] || '') + (d.entretien.avec === 'famille' ? ' avec la famille' : '') : '') + (d.nature === 'permission' ? ' (' + (d.statut === 'validee' ? 'validée' : 'demande') + ')' : '') + (d.titre ? ' « ' + d.titre + ' »' : '') + (d.debut ? ' le ' + U.date(d.debut) : '') + (d.service ? ' — ' + U.libService(d.service) : '') + ((d.patients || []).length ? ', ' + d.patients.length + ' patient(s)' : '');
      case 'OCCURRENCE': var roc = st().rdv[d.rdv], jo = String(d.occurrence || '').split('-').reverse().join('/');
        if (d.reset) return '« ' + (roc ? libelleElement(roc) : 'élément') + ' » du ' + jo + ' : retour aux réglages de toutes les dates';
        if (d.annulee === true) return '« ' + (roc ? libelleElement(roc) : 'élément') + ' » du ' + jo + ' annulé' + (d.motifAnnulation ? ' (' + d.motifAnnulation + ')' : '');
        if (d.annulee === false) return '« ' + (roc ? libelleElement(roc) : 'élément') + ' » du ' + jo + ' rétabli';
        return '« ' + (roc ? libelleElement(roc) : 'élément') + ' » du ' + jo + ', cette date seulement : ' + A.CHAMPS_OCCURRENCE.filter(function (k) { return d[k] !== undefined && k !== 'fin'; }).map(function (k) { return LIB_CHAMPS[k] || k; }).join(', ') + ((d.patients || []).length ? ' (' + d.patients.length + ' patient(s))' : '');
      case 'VALIDATION': var rv = st().rdv[d.rdv], vv = rv && A.validationsDe(rv).filter(function (y) { return y.id === d.validation; })[0];
        return (vv ? (vv.libelle || A.TYPES_VALIDATION[vv.type]) : 'Validation') + ' — « ' + (rv ? libelleElement(rv) : 'élément') + ' » le ' + String(d.occurrence || '').split('-').reverse().join('/') + ' : ' + (d.statut === 'attente' ? 'remise en attente' : (d.statut === 'refusee' ? 'refusée' : 'validée') + (d.nom ? ' par ' + d.nom : ''));
      case 'TRANSPORT': var rtr = st().rdv[d.rdv], tt = rtr && (rtr.transports || []).filter(function (y) { return y.id === d.transport; })[0];
        return (tt ? A.TRANSPORTS[tt.type] || 'Transport' : 'Transport') + ' — « ' + (rtr ? libelleElement(rtr) : 'élément') + ' » le ' + String(d.occurrence || '').split('-').reverse().join('/') + ' : ' + (d.statut === 'reserve' ? 'réservé' + (d.precision ? ' (' + d.precision + ')' : '') : 'remis à réserver');
      case 'INSCRIPTION': var ri = st().rdv[d.rdv]; return (e.by && e.by !== d.agent ? U.App.session.nomAuteur(e.by) + ' : ' : '') + (d.retrait ? 'désinscription de ' : 'inscription de ') + (d.nom || U.App.session.nomAuteur(d.agent)) + ' comme accompagnateur : « ' + (ri ? libelleElement(ri) : 'élément') + ' » le ' + String(d.occurrence || '').split('-').reverse().join('/');
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
    admin: { onglets: function () { return [['agenda-categories', 'Catégories d’événements', [panneauCategories()]], ['agenda', 'Réglages de l’agenda', [panneauReglages()]]]; } },
    // Pastille de la barre des modules : informations reçues non vues
    pastille: function () { try { return mesAvis().length; } catch (e) { return 0; } }
  });
  U.agenda = { modaleElement: modaleElement, modaleAjout: modaleAjout, sectionPatient: sectionPatient, aVenirPour: aVenirPour };
})();
