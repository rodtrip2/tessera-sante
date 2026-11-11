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
    return h('span', { class: 'badge ' + (acc.manque ? 'warn' : 'ok'), title: (acc.consigne ? 'Consigne : ' + acc.consigne + '\n' : '') + (acc.inscrits.length ? 'Inscrits : ' + acc.inscrits.map(function (i) { return i.nom; }).join(', ') : 'Aucun inscrit'), text: 'Accompagnateurs ' + acc.total + '/' + acc.requis });
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
  // ------------------------------------------------------------ Véhicules du service (module Véhicules, décision du 8 novembre 2026)
  // Disponibilités lues à la volée (fourniture « vehicules.disponibles ») ; réservation liée à l'élément, à la date et au transport.
  var HORIZON_VEHICULES = 28;   // jours : dates d'un élément répété réservées d'office ; au-delà, « Réserver le véhicule » à la date
  function etatVehicules() { var s = U.App.session; try { return s && s.detientCle && s.detientCle('vehicules') ? s.etatModule('vehicules') : null; } catch (e) { return null; } }
  function vehiculesDispo(service, debut, fin, exclure) { var e = etatVehicules(); return e ? (SIC.modules.lire('vehicules.disponibles', e, { service: service, debut: debut, fin: fin, exclure: exclure, libService: U.libService }) || []) : null; }
  function vehiculesLies(rdv, occurrence) { var e = etatVehicules(); return e ? (SIC.modules.lire('vehicules.liees', e, { rdv: rdv, occurrence: occurrence }) || []) : []; }
  function peutReserverVehicule() { try { return !!etatVehicules() && U.App.session.peut('RESERVATION'); } catch (e) { return false; } }
  function finVehicule(debut, fin) { return fin && fin > debut ? fin : debut + 2 * 36e5; }
  /** Accorde les réservations liées à un élément avec ses dates et ses transports « Véhicule du service ». Rend les dates en échec. */
  async function suivreVehicules(rdvId, options) {
    var o = options || {}, s = U.App.session, moi = s.compteEffectif(), echecs = [];
    if (!etatVehicules()) return echecs;
    var r0 = st().rdv[rdvId], lies = vehiculesLies(rdvId), maintenant = Date.now();
    var voulu = {};   // occurrence|transport → { vehicule, debut, fin, occurrence, transport, nouveau }
    if (r0 && !r0.supprime) {
      var finPlage = plusJours(maintenant, HORIZON_VEHICULES);
      lies.forEach(function (x) { if (x.fin > finPlage) finPlage = x.fin + 864e5; });
      A.occurrences(r0, maintenant - 864e5, finPlage).forEach(function (oc) {
        if (oc.annulee) return;
        var ro = A.rdvOccurrence(r0, oc.occurrence), d1 = finVehicule(oc.debut, oc.fin);
        if (d1 < maintenant) return;
        (ro.transports || []).forEach(function (t) {
          if (t.type !== 'vehicule' || !t.vehicule) return;
          if (o.seulement && (o.seulement.occurrence !== oc.occurrence || (o.seulement.transport && o.seulement.transport !== t.id))) return;
          voulu[oc.occurrence + '|' + t.id] = { vehicule: t.vehicule, debut: oc.debut, fin: d1, occurrence: oc.occurrence, transport: t.id, auto: o.seulement || oc.debut < plusJours(maintenant, HORIZON_VEHICULES) || (o.dates || []).indexOf(oc.occurrence) >= 0 };
        });
      });
    }
    // Réservations liées devenues inutiles ou différentes : annulées (passées : gardées)
    for (var i = 0; i < lies.length; i++) {
      var x = lies[i], cle = x.lien.occurrence + '|' + x.lien.transport, v = voulu[cle];
      if (o.seulement && (x.lien.occurrence !== o.seulement.occurrence || (o.seulement.transport && x.lien.transport !== o.seulement.transport))) continue;
      if (v && v.vehicule === x.vehicule && v.debut === x.debut && v.fin === x.fin) { delete voulu[cle]; continue; }
      if (x.fin < maintenant) continue;
      try {
        await s.enregistrer('RESERVATION', { id: x.id, annulee: true, motifAnnulation: r0 && !r0.supprime ? 'Élément de l’agenda modifié' : 'Élément de l’agenda supprimé', service: x.service });
        if (v) await s.enregistrer('TRANSPORT', { rdv: rdvId, transport: x.lien.transport, occurrence: x.lien.occurrence, statut: 'a-reserver', precision: '', service: r0.service });
      } catch (e) { echecs.push(x.lien.occurrence.split('-').reverse().join('/') + ' : ' + e.message); }
    }
    // Réservations à inscrire (disponibilité vérifiée par le module Véhicules à l'enregistrement)
    var aFaire = Object.keys(voulu).map(function (k) { return voulu[k]; }).filter(function (v) { return v.auto; });
    if (aFaire.length && !peutReserverVehicule()) return echecs.concat(['vous n’avez pas le droit de réserver les véhicules : transport resté « à réserver »']);
    for (var j = 0; j < aFaire.length; j++) {
      var w = aFaire[j], ev = etatVehicules(), vh = ev && ev.vehicules[w.vehicule];
      try {
        // Véhicule pré-réservé : réservation forcée après avertissement (déjà donné à l'enregistrement d'une seule date)
        var pv = SIC.vehicules.peutReserver(ev, w.vehicule, r0.service, w.debut, w.fin, null, U.libService), supplante;
        if (pv.ok && pv.pre && pv.pre.length) {
          if (!o.forcer && !confirm(w.occurrence.split('-').reverse().join('/') + ' : véhicule ' + pv.avertissement + '.\n\nForcer la réservation ? L’auteur de la pré-réservation et les personnes désignées pour son service (par défaut le cadre et la secrétaire) en seront informés.')) { echecs.push(w.occurrence.split('-').reverse().join('/') + ' : ' + pv.avertissement); continue; }
          supplante = pv.pre.map(function (z) { return z.id; });
        }
        await s.enregistrer('RESERVATION', { id: 'RV' + C.hex(C.aleatoire(5)), vehicule: w.vehicule, debut: w.debut, fin: w.fin, service: r0.service, agent: moi.id, nom: moi.nom, statut: 'ferme', supplante: supplante,
          motif: 'Agenda : ' + libNature(r0.nature, r0.service), lien: { rdv: rdvId, occurrence: w.occurrence, transport: w.transport } });
        await s.enregistrer('TRANSPORT', { rdv: rdvId, transport: w.transport, occurrence: w.occurrence, statut: 'reserve', precision: SIC.vehicules.libelleVehicule(vh), service: r0.service });
      } catch (e) { echecs.push(w.occurrence.split('-').reverse().join('/') + ' : ' + e.message.replace(/^Véhicule indisponible : /, '')); }
    }
    return echecs;
  }
  function signalerEchecs(echecs) { if (echecs.length) alert('Réservation du véhicule non faite :\n' + echecs.join('\n') + '\n\nLe transport reste « à réserver » à ces dates.'); }

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
    var nbAcc = Math.max(0, Math.round(+x.accompagnateurs || 0)), consigneAcc = String(x.consigneAccompagnateurs || '');
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
      // Consigne en texte libre (décision du porteur du 8 novembre 2026) : indicative, n'empêche aucune inscription
      var consigne = h('input', Object.assign({ type: 'text', maxlength: 120, value: consigneAcc, placeholder: 'Consigne (facultatif) : ex. 1 IDE le matin, 1 AS l’après-midi, un éducateur', 'aria-label': 'Consigne pour les accompagnateurs', oninput: function () { consigneAcc = consigne.value; } }, dis));
      zoneAcc.appendChild(lecture ? (consigneAcc ? h('p', { text: 'Consigne : ' + consigneAcc }) : h('span')) : h('label', {}, 'Consigne pour les accompagnateurs', consigne));
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
        var selT = h('select', Object.assign({ 'aria-label': 'Transport', onchange: function () { t.type = selT.value; if (t.type === 'vehicule' || t.vehicule) dessinerTransports(); } }, dis), Object.keys(A.TRANSPORTS).map(function (k) { return h('option', { value: k, text: A.TRANSPORTS[k], selected: (t.type || 'vsl') === k }); }));
        var nb = h('input', Object.assign({ type: 'number', min: 1, max: 9, value: t.nombre || 1, class: 'champ-court', 'aria-label': 'Nombre', oninput: function () { t.nombre = Math.max(1, Math.min(9, Math.round(+nb.value || 1))); } }, dis));
        var prec = h('input', Object.assign({ type: 'text', maxlength: 100, value: t.precision || '', placeholder: 'Précision (aller-retour, horaire de prise en charge…)', oninput: function () { t.precision = prec.value; } }, dis));
        var e = reserves.filter(function (y) { return y.id === t.id; })[0];
        var estVh = (t.type || 'vsl') === 'vehicule', zoneVh = estVh ? choixVehicule(t) : null;
        if (estVh) { nb.hidden = true; t.nombre = 1; }
        zoneTr.appendChild(h('div', { class: 'agenda-point' }, selT, nb, zoneVh, prec,
          e ? (e.reserve ? h('span', { class: 'badge ok', title: 'Par ' + s.nomAuteur(e.reserve.par) + ', ' + U.date(Date.parse(e.reserve.le)), text: 'Réservé' + (e.reserve.precision ? ' : ' + e.reserve.precision : '') }) : h('span', { class: 'badge warn', text: 'À réserver' })) : null,
          e && estVh && !externe && (t.vehicule === e.vehicule) && t.vehicule && peutReserverVehicule() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { reserverVehicule(t.id, !e.reserve); } }, e.reserve ? 'Annuler la réservation du véhicule' : 'Réserver le véhicule') : null,
          e && !estVh && peut('TRANSPORT') && !externe ? h('button', { class: 'btn petit', type: 'button', onclick: function () { reserver(t.id, !e.reserve); } }, e.reserve ? 'Remettre à réserver' : 'Marquer réservé…') : null,
          lecture ? null : h('button', { class: 'btn petit danger', type: 'button', onclick: function () { transports.splice(i, 1); if (!transports.length) visibles.transports = false; majVisibles(); dessinerTransports(); } }, 'Retirer')));
      });
      if (!lecture) zoneTr.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); dessinerTransports(); } }, '+ Autre transport')));
      if (!nouveau && occurrence && transports.length) zoneTr.appendChild(h('small', { class: 'muted', text: 'Réservation pour le ' + occurrence.split('-').reverse().join('/') + '. Un transport ajouté ou modifié se réserve après l’enregistrement.' }));
    }
    // Véhicule du service : choix parmi les véhicules du service (ou prêtés, mis à disposition), disponibilité sur les horaires saisis
    function periodeSaisie() {
      var d0 = new Date(date.value + 'T' + hDebut.value).getTime(), d1 = hFin.value ? new Date((dateFin.value || date.value) + 'T' + hFin.value).getTime() : null;
      return [d0, finVehicule(d0, d1)];
    }
    function choixVehicule(t) {
      if (lecture || externe) {
        var ev = etatVehicules(), vv = ev && t.vehicule ? ev.vehicules[t.vehicule] : null;
        return h('span', { class: 'badge', text: vv ? SIC.vehicules.libelleVehicule(vv) : (t.vehicule ? 'Véhicule choisi' : 'Véhicule à choisir') });
      }
      var p = periodeSaisie(), lie = vehiculesLies(x.id, occurrence || jourISO(p[0])).filter(function (y) { return y.lien.transport === t.id; })[0];
      var liste = vehiculesDispo(sv.value, p[0], p[1], lie && lie.id);
      if (liste === null) return h('small', { class: 'muted', text: 'Module Véhicules non accessible : le transport reste à réserver auprès du service qui gère le véhicule.' });
      if (t.vehicule && !liste.some(function (y) { return y.id === t.vehicule; })) liste.push({ id: t.vehicule, libelle: 'Véhicule choisi (hors de ceux du service)', ok: false, raison: 'plus réservable par ce service' });
      var sel = h('select', { 'aria-label': 'Véhicule', onchange: function () { t.vehicule = sel.value || null; dessinerTransports(); } },
        [h('option', { value: '', text: liste.length ? '— Choisir le véhicule —' : 'Aucun véhicule pour ce service' })].concat(liste.map(function (y) {
          return h('option', { value: y.id, text: y.libelle + (y.places ? ' — ' + y.places + ' pl.' : '') + (y.ok ? '' : ' — indisponible'), selected: y.id === t.vehicule });
        })));
      var y = liste.filter(function (z) { return z.id === t.vehicule; })[0];
      return h('span', { class: 'en-ligne' }, sel, y ? h('span', { class: 'badge ' + (y.ok ? (y.avertissement ? 'warn' : 'ok') : 'bad'), title: y.ok ? (y.signalements ? y.signalements + ' signalement(s) en cours (onglet Véhicules)' : '') : y.raison, text: y.ok ? (y.avertissement ? 'Attention, ' + y.avertissement : (repete && !parDate ? 'Libre ce jour' : 'Disponible')) + (y.signalements ? ' · ' + y.signalements + ' signalement(s)' : '') : 'Indisponible : ' + y.raison }) : null);
    }
    async function reserverVehicule(id, oui) {
      try {
        if (oui) signalerEchecs(await suivreVehicules(x.id, { seulement: { occurrence: occurrence, transport: id } }));
        else {
          var lies = vehiculesLies(x.id, occurrence).filter(function (y) { return y.lien.transport === id; });
          for (var i = 0; i < lies.length; i++) await s.enregistrer('RESERVATION', { id: lies[i].id, annulee: true, motifAnnulation: 'Annulée depuis l’agenda', service: lies[i].service });
          await s.enregistrer('TRANSPORT', { rdv: x.id, transport: id, occurrence: occurrence, statut: 'a-reserver', precision: '', service: x.service });
          U.toast('Réservation du véhicule annulée.');
        }
        dessinerTransports();
      } catch (e) { alert(e.message); }
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
    [date, hDebut, dateFin, hFin, sv].forEach(function (c) { c.addEventListener('change', function () { if (transports.some(function (t) { return t.type === 'vehicule'; })) dessinerTransports(); }); });
    if (!nouveau) dessinerCommentaires();
    dessinerPatients(); dessinerPros(); dessinerChecklist();

    var boutons = [{ texte: lecture || repete ? 'Fermer' : 'Annuler' }];
    var propres = (x.surchargee || []).map(function (k) { return LIB_CHAMPS[k] || k; });
    if (!lecture && parDate && x.annulee) boutons.push({ texte: 'Rétablir cette date', action: async function () {
      await s.enregistrer('OCCURRENCE', { rdv: x.id, occurrence: occurrence, annulee: false, service: x.service });
      U.toast('Date rétablie.');
      signalerEchecs(await suivreVehicules(x.id, { seulement: { occurrence: occurrence } }));
    } });
    else if (!lecture && parDate) boutons.push({ texte: 'Annuler cette date…', action: async function () {
      var motif = prompt('Annuler le ' + occurrence.split('-').reverse().join('/') + ' (la date reste affichée, barrée). Motif (facultatif) :', baseNature(x.nature, x.service) === 'audience' ? 'Aucun patient convoqué' : '');
      if (motif === null) return false;
      await s.enregistrer('OCCURRENCE', { rdv: x.id, occurrence: occurrence, annulee: true, motifAnnulation: motif.trim(), service: x.service });
      U.toast('Date annulée.');
      signalerEchecs(await suivreVehicules(x.id, { seulement: { occurrence: occurrence } }));
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
      signalerEchecs(await suivreVehicules(x.id, { seulement: { occurrence: occurrence } }));
    } });
    if (!lecture && !nouveau && repete && !parDate && occurrence > A.jourISO(r.debut)) boutons.push({ texte: 'Arrêter à cette date', action: async function () {
      if (!confirm('Arrêter la répétition : retirer le ' + occurrence.split('-').reverse().join('/') + ' et toutes les dates suivantes ? Les dates précédentes sont gardées.')) return false;
      var rg = A.regularite(r.regularite); rg.jusquAu = A.jourISO(plusJours(A.depuisISO(occurrence), -1));
      await s.enregistrer('RDV', { id: x.id, regularite: rg, service: x.service });
      U.toast('Dates retirées à partir du ' + occurrence.split('-').reverse().join('/') + '.');
      signalerEchecs(await suivreVehicules(x.id));
    } });
    if (!lecture && !nouveau && !parDate) boutons.push({ texte: repete ? 'Supprimer toutes les dates' : 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer « ' + libelleElement(x) + ' »' + (repete ? ' et toutes ses dates' : '') + ' de l’agenda ?')) return false;
      await s.enregistrer('RDV', { id: x.id, supprime: true, service: x.service });
      U.toast('Élément supprimé.');
      signalerEchecs(await suivreVehicules(x.id));
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
        consigneAccompagnateurs: visibles.accompagnateurs ? consigneAcc.trim() : '',
        transports: visibles.transports ? transports.map(function (t) { var o = { id: t.id, type: t.type || 'vsl', nombre: Math.max(1, Math.round(+t.nombre || 1)), precision: String(t.precision || '').trim() }; if (o.type === 'vehicule' && t.vehicule) o.vehicule = t.vehicule; return o; }) : [],
        validations: visibles.validations ? validations.map(function (v) { var o = { id: v.id, type: v.type, libelle: String(v.libelle || '').trim() }; if (v.type !== 'permission') o.delai = v.delai === undefined ? 24 : v.delai; return o; }) : [] };
      // Véhicule du service : disponibilité vérifiée avant d'enregistrer (une date : élément simple ou « cette date seulement »)
      var forcerVehicules = false;
      if (parDate || rg.type === 'aucune') {
        var occV = parDate ? occurrence : jourISO(d0);
        d.transports.filter(function (t) { return t.type === 'vehicule' && t.vehicule; }).forEach(function (t) {
          var lie = vehiculesLies(x.id, occV).filter(function (y) { return y.lien.transport === t.id; })[0], dispo = vehiculesDispo(sv.value, d0, finVehicule(d0, d1), lie && lie.id);
          var y = dispo && dispo.filter(function (z) { return z.id === t.vehicule; })[0];
          if (dispo && (!y || !y.ok) && !confirm('Véhicule indisponible' + (y ? ' : ' + y.raison : '') + '.\nEnregistrer quand même (le transport restera « à réserver ») ?')) throw new Error('Choisissez un autre véhicule ou d’autres horaires.');
          if (y && y.ok && y.avertissement) {
            if (!confirm('Véhicule ' + y.avertissement + '.\n\nForcer la réservation ? L’auteur de la pré-réservation et les personnes désignées pour son service (par défaut le cadre et la secrétaire) en seront informés.\n(Annuler : revenir à l’événement.)')) throw new Error('Choisissez un autre véhicule ou d’autres horaires, ou forcez la réservation.');
            forcerVehicules = true;
          }
        });
      }
      if (bv === 'entretien') d.entretien = { type: selEnt.value, avec: selAvec.value };
      if (bv === 'examen') d.examen = { type: typeExamen.value.trim() };
      if (parDate) {
        // Cette date seulement : champs modifiés par rapport à cette date, rangés comme réglages propres à la date
        var od = { rdv: x.id, occurrence: occurrence, service: r.service }, n0 = 0;
        ['titre', 'lieu', 'patients', 'professionnels', 'accompagnateurs', 'consigneAccompagnateurs', 'transports', 'validations', 'checklist'].forEach(function (k) {
          var av = x[k] === undefined ? (Array.isArray(d[k]) ? [] : (k === 'accompagnateurs' ? 0 : '')) : x[k];
          if (JSON.stringify(d[k]) !== JSON.stringify(av)) { od[k] = d[k]; n0++; }
        });
        if (d0 !== x.debut || d1 !== (x.fin || null)) { od.debut = d0; od.fin = d1; n0++; }
        if (!n0) return true;
        await s.enregistrer('OCCURRENCE', od);
        U.toast('Modifié pour le ' + occurrence.split('-').reverse().join('/') + ' seulement.');
        signalerEchecs(await suivreVehicules(x.id, { seulement: { occurrence: occurrence }, forcer: forcerVehicules }));
        return;
      }
      if (!nouveau) Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k])) delete d[k]; });
      if (!nouveau && Array.isArray(d.validations) && !Array.isArray(x.validations) && !d.validations.length && !A.validationsDe(x).length) delete d.validations;
      if (!nouveau && !d.consigneAccompagnateurs && !x.consigneAccompagnateurs) delete d.consigneAccompagnateurs;
      if (nouveau) ['accompagnateurs', 'consigneAccompagnateurs', 'transports', 'validations'].forEach(function (k) { if (!d[k] || (Array.isArray(d[k]) && !d[k].length)) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      await s.enregistrer('RDV', d);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
      signalerEchecs(await suivreVehicules(d.id, { dates: rg.type === 'aucune' ? [jourISO(d0)] : [], forcer: forcerVehicules }));
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
  var LIB_CHAMPS = { debut: 'horaires', lieu: 'lieu', titre: 'intitulé', patients: 'patients', professionnels: 'professionnels prévus', accompagnateurs: 'accompagnateurs', consigneAccompagnateurs: 'consigne des accompagnateurs', transports: 'transports', validations: 'validations', checklist: 'check-list' };
  function fermerPuisAgenda(fn) { var dlg = document.querySelector('dialog[open]'); if (dlg) dlg.dispatchEvent(new Event('cancel')); setTimeout(fn, 0); }

  // Délai d'alerte d'un point de check-list (jours avant l'événement)
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

  // Aides partagées avec ui-agenda-taches.js et ui-agenda-admin.js, qui y ajoutent leurs fonctions
  var I = U.agendaInt = { badgeAccompagnateurs: badgeAccompagnateurs, bandeauAvis: bandeauAvis, boutonInscription: boutonInscription, carteElement: carteElement, cat: cat, champsRepetition: champsRepetition, couleurs: couleurs, fiches: fiches, grille: grille, hm: hm, libJour: libJour, libRepetition: libRepetition, libelleElement: libelleElement, lundi: lundi, minuit: minuit, modaleElement: modaleElement, nomsPatients: nomsPatients, opts: opts, ouvrirElement: ouvrirElement, peut: peut, plusJours: plusJours, resume: resume, servicesAffiches: servicesAffiches, st: st, teinter: teinter, vue: vue };
  function libDelai() { return I.libDelai.apply(null, arguments); }
  function selectDelai() { return I.selectDelai.apply(null, arguments); }
  function ligneTache() { return I.ligneTache.apply(null, arguments); }
  function modaleAbsence() { return I.modaleAbsence.apply(null, arguments); }
  function vueTaches() { return I.vueTaches.apply(null, arguments); }
  function modaleTache() { return I.modaleTache.apply(null, arguments); }
  function echeancesJLD() { return I.echeancesJLD.apply(null, arguments); }
  function allerAuxAlertes() { return I.allerAuxAlertes.apply(null, arguments); }
  function resumeAlertes() { return I.resumeAlertes.apply(null, arguments); }
  function vueAlertes() { return I.vueAlertes.apply(null, arguments); }
  function vueMonAgenda() { return I.vueMonAgenda.apply(null, arguments); }
  function panneauReglages() { return I.panneauReglages.apply(null, arguments); }
  function panneauCategories() { return I.panneauCategories.apply(null, arguments); }
  SIC.modules.completerInterface('agenda', {
    vues: { agenda: vueAgenda, taches: vueTaches, alertes: vueAlertes, 'mon-agenda': vueMonAgenda },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’élément de l’agenda revient à son état précédent.'; } },
    admin: { onglets: function () { return [['agenda-categories', 'Catégories d’événements', [panneauCategories()]], ['agenda', 'Réglages de l’agenda', [panneauReglages()]]]; } },
    // Pastille de la barre des modules : informations reçues non vues
    pastille: function () { try { return mesAvis().length; } catch (e) { return 0; } }
  });
  U.agenda = { modaleElement: modaleElement, modaleAjout: modaleAjout, sectionPatient: sectionPatient, aVenirPour: aVenirPour, suivreVehicules: suivreVehicules };
})();
