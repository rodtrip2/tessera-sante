// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Agenda du service — interface (étape 6, docs/architecture.md § 7 bis). Logique : module-agenda.js.
 * Sous-étape 6.2 : agenda du service (jour, semaine) : accompagnements, activités thérapeutiques, réunions ; éléments
 * d'un autre service qui concernent les patients du service (lecture seule) ; réglages (identité, types d'alertes).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto, P = SIC.agendaParticipants;
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
  /** Étape de validation d'une permission, dans la couleur réglée pour l'étape (0.21.0) ; le délai dépassé est signalé. */
  function etatPermissionDe(r, occurrence, debut) {
    var v = A.etatValidations(r, occurrence, debut, fiches(), U.config(), Date.now()).filter(function (y) { return y.type === 'permission'; })[0];
    return v ? v.permission : null;
  }
  function pastilleEtape(x) {
    var ep = etatPermissionDe(x.rdv, x.occurrence, x.debut);
    if (!ep) return null;
    var pe = ep.prochaineEcheance, retard = ep.niveau === 'retard';
    var el = h('span', { class: 'badge ag-etape-badge' + (retard ? ' retard' : ''), title: ep.processus.etapes.map(function (e, i) { return (i <= ep.index && !ep.refusee ? '✓ ' : '· ') + e.libelle; }).join('\n') + (ep.mention ? '\n' + ep.mention : '') + (pe ? '\nÀ faire : ' + (pe.etape.tache || pe.etape.libelle) + ' avant ' + libJour(pe.quand) + ' ' + hm(pe.quand) : ''),
      text: ep.libelle + (retard ? ' — délai dépassé' : '') + (ep.mention ? ' *' : '') });
    return teinter(el, ep.couleur);
  }
  var occurrenceCourante = null;   // occurrence du bloc en cours de dessin (statut de la permission de cette date)
  function statutAffiche(r) { return A.statutPermission(r, occurrenceCourante || ''); }
  function memeJour(a, b) { return minuit(a) === minuit(b); }
  /** Puce de la ligne « sans heure » : alerte, échéance JLD, validation, tâche sans heure, absence, élément sur plusieurs jours. */
  function puce(genre, texte, action, couleur, titre) {
    var el = h(action ? 'button' : 'div', { class: 'ag-puce ag-' + genre, type: action ? 'button' : null, title: titre || texte, onclick: action || null }, h('span', { text: texte }));
    return teinter(el, couleur);
  }

  function moiG() { var c = U.App.session.compteEffectif(); return Object.assign({}, c, { groupes: SIC.groupes ? SIC.groupes.de(U.config(), c.id) : [] }); }
  /** Bouton rapide d'une date selon la situation de l'agent : s'inscrire, demander, accepter une proposition ou une invitation, se retirer. */
  function boutonInscription(x, petit) {
    var acc = x.accompagnateurs, moi = moiG();
    if (!acc || x.externe || U.App.session.apercu) return null;
    var sit = P.situation(A.rdvOccurrence(x.rdv, x.occurrence), x.occurrence, moi), a = sit.actions;
    var quoi = a.indexOf('accepter') >= 0 ? ['inscrit', sit.etat === 'propose' ? 'Accepter la proposition' : 'Accepter l’invitation', 'Vous participez.'] : a.indexOf('inscrire') >= 0 ? ['inscrit', acc.complet ? 'S’inscrire (attente)' : 'S’inscrire', acc.complet ? 'Vous êtes en liste d’attente.' : 'Vous êtes inscrit(e).']
      : a.indexOf('demander') >= 0 ? ['demande', 'Demander à participer', 'Demande envoyée aux organisateurs.'] : a.indexOf('retirer') >= 0 ? [null, sit.etat === 'demande' ? 'Retirer ma demande' : sit.etat === 'attente' ? 'Quitter la liste d’attente' : 'Me désinscrire', 'Vous n’êtes plus inscrit(e).'] : null;
    if (!quoi) return null;
    return h('button', { class: 'btn ' + (petit ? 'petit ag-inscrire' : 'petit') + (quoi[0] ? ' primaire' : ''), type: 'button', onclick: async function (ev) {
      ev.stopPropagation();
      try {
        await U.App.session.enregistrer('INSCRIPTION', { rdv: x.rdv.id, occurrence: x.occurrence, agent: moi.id, nom: moi.nom, retrait: quoi[0] ? undefined : true, etat: quoi[0] || undefined, service: x.rdv.service });
        U.toast(quoi[2]);
      } catch (e) { alert(e.message); }
    } }, quoi[1]);
  }
  function badgeAccompagnateurs(x) {
    var acc = x.accompagnateurs;
    if (!acc || (!acc.requis && !acc.max && !acc.ouvert)) return null;
    var detail = [acc.consigne ? 'Consigne : ' + acc.consigne : '', acc.inscrits.length ? 'Inscrits : ' + acc.inscrits.map(function (i) { return i.nom; }).join(', ') : 'Aucun inscrit',
      acc.attente.length ? 'Liste d’attente : ' + acc.attente.map(function (i) { return i.nom; }).join(', ') : '', acc.demandes.length ? acc.demandes.length + ' demande(s) à confirmer' : '', acc.proposes.length ? acc.proposes.length + ' proposition(s) sans réponse' : ''].filter(Boolean).join('\n');
    return h('span', { class: 'badge ' + (acc.manque ? 'warn' : 'ok'), title: detail, text: 'Professionnels ' + P.libellePlaces(acc) + (acc.attente.length ? ' (+' + acc.attente.length + ' en attente)' : '') });
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
      r.salle && U.salles && U.App.session.detientCle('salles') ? h('div', { class: 'ag-ligne muted ag-salle', text: 'Salle : ' + U.salles.libelle('agenda|' + r.id + '|' + x.occurrence, r.salle) }) : null,
      (r.professionnels || []).length ? h('div', { class: 'ag-ligne muted', text: r.professionnels.map(function (p) { return p.nom; }).join(', ') }) : null,
      h('div', { class: 'ag-badges' },
        x.annulee ? h('span', { class: 'badge bad', text: 'Annulée' + (r.motifAnnulation ? ' : ' + r.motifAnnulation : '') }) : null,
        !x.annulee && A.enAttente(r, U.config()) ? h('span', { class: 'badge', text: 'Aucun patient prévu' }) : null,
        (r.surchargee || []).length && !x.annulee ? h('span', { class: 'badge', title: 'Réglages propres à cette date : ' + r.surchargee.map(function (k) { return LIB_CHAMPS[k] || k; }).join(', '), text: 'Date modifiée' }) : null,
        sp ? pastilleEtape(x) || h('span', { class: 'badge ' + (sp === 'validee' ? 'ok' : (sp === 'refusee' ? 'bad' : 'warn')), text: sp === 'validee' ? 'Validée' : (sp === 'refusee' ? 'Refusée' : 'Demande') }) : null,
        (function () { var vs = A.etatValidations(r, x.occurrence, x.debut, fiches(), U.config(), Date.now()).filter(function (v) { return v.type !== 'permission' || !sp; }); var att = vs.filter(function (v) { return !v.fait; });
          return vs.length ? h('span', { class: 'badge ' + (att.some(function (v) { return v.niveau === 'retard'; }) ? 'bad' : (att.length ? 'warn' : 'ok')), title: vs.map(function (v) { return v.libelle + (v.fait ? ' : ' + (v.fait.statut === 'validee' ? 'validée' : 'refusée') : ' : à faire valider'); }).join(' ; '), text: att.length ? att.length + ' à valider' : 'Validé' }) : null; })(),
        A.etatTransports(r, x.occurrence).map(function (t) { return h('span', { class: 'badge ' + (t.reserve ? 'ok' : 'warn'), text: (t.nombre > 1 ? t.nombre + ' ' : '') + A.TRANSPORTS[t.type] + (t.reserve ? ' réservé' : ' à réserver') }); }),
        x.externe || x.partage ? h('span', { class: 'badge warn', text: U.libService(r.service) }) : ((r.services || []).length ? h('span', { class: 'badge', title: 'Avec ' + r.services.map(function (c) { return U.libService(c); }).join(', '), text: '+' + r.services.length + ' service' + (r.services.length > 1 ? 's' : '') }) : null),
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
  /** Couleur d'une sortie selon les règles de la donnée « patients.sortiePrevue » (réglages des données, par service). */
  function couleurSortie(x, service, maintenant) {
    var CO = SIC.couleurs;
    if (!CO) return null;
    var reg = CO.reglages(U.config(), 'patients.sortiePrevue', service, { regles: SIC.sorties.REGLES_DEFAUT });
    return CO.evaluer(reg.regles, { valeur: x.valeur.debut || null, cle: x.etat, maintenant: maintenant });
  }
  /** Événement « Sortie du patient » de l'agenda pour ce patient ce jour-là, s'il existe. */
  function evenementDeSortie(patientId, jourIso) {
    var d0 = A.depuisISO(jourIso);
    return A.elements(st(), fiches(), U.services().map(function (v) { return v.code; }), d0, plusJours(d0, 1)).filter(function (x) { return !x.externe && baseNature(x.rdv.nature, x.rdv.service) === 'sortie' && (x.rdv.patients || []).indexOf(patientId) >= 0; })[0] || null;
  }
  function ouvrirSortie(p, x) {
    var ev = x.etat === 'actee' ? evenementDeSortie(p.id, x.jour) : null;
    if (ev) return ouvrirElement(ev);
    U.sorties.modale(p, function () { U.rendreContenu(); });
  }
  /**
   * Sortie actée (0.21.0) : événement « Sortie du patient » avec sa check-list (modèle du type d'événement, tâches
   * suggérées par la prise en charge), **proposé** ou **créé d'office** selon le réglage du service.
   */
  async function evenementSortie(p, val, sj) {
    var service = A.serviceDuPatient(p) || (sj && sj.service) || serviceVue();
    if (!peut('RDV') || !A.droits.serviceActif(U.config(), service) || evenementDeSortie(p.id, val.debut)) return;
    var office = A.reglagesService(U.config(), service).sortieEvenement === 'office';
    var d0 = new Date(val.debut + 'T' + (val.heure || '11:00')).getTime();
    if (!office) {
      if (!confirm('Créer l’événement « Sortie du patient » dans l’agenda, avec sa check-list ?')) return;
      return modaleElement(null, d0, false, null, false, null, { nature: 'sortie', service: service, patients: [p.id], heure: val.heure || '11:00', heureFixee: true });
    }
    var pr = cat('sortie', service).prereglages || {}, liste = [], modele = A.checklists(U.config()).filter(function (c) { return c.code === pr.checklist; })[0];
    if (modele) modele.items.forEach(function (it) { liste.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: it.libelle, delai: it.delai }); });
    var ep = null; try { ep = U.App.session.etatModule('patients'); } catch (e) { ep = null; }
    if (ep && SIC.intervenants) A.tachesSuggerees(U.config(), service, 'sortie', SIC.intervenants.dePatient(ep, (ep.fiches || {})[p.id]).map(function (l) { return { type: l.intervenant.type, nom: l.intervenant.nom, contact: l.intervenant.contact }; }))
      .forEach(function (t) { if (!liste.some(function (y) { return y.libelle === t.libelle; })) { var o = { id: 'i' + C.hex(C.aleatoire(4)), libelle: t.libelle, delai: t.delai }; if (t.obligatoire) o.obligatoire = true; liste.push(o); } });
    try {
      await U.App.session.enregistrer('RDV', { id: 'R' + C.hex(C.aleatoire(6)), nature: 'sortie', titre: pr.titre || '', debut: d0, fin: d0 + (pr.duree || 30) * 6e4, lieu: pr.lieu || '', service: service, patients: [p.id], professionnels: [], checklist: liste });
      U.toast('Événement de sortie ajouté à l’agenda, avec sa check-list.');
    } catch (e) { alert(e.message); }
  }
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
    // Sorties envisagées ou actées des patients des services affichés (0.21.0), lues à la volée dans les fiches : la
    // sortie actée à sa date, l'envisagée au premier jour de sa fourchette ; couleur réglée pour la donnée
    if (SIC.sorties) {
      var fs = {}, tous = fiches();
      Object.keys(tous).forEach(function (k) { if (svs.indexOf(A.serviceDuPatient(tous[k])) >= 0) fs[k] = tous[k]; });
      SIC.sorties.parJour(fs, A.jourISO(debut), A.jourISO(plusJours(debut, n - 1))).sorties.forEach(function (x) {
        var p = tous[x.patientId], coul = couleurSortie(x, A.serviceDuPatient(p), maintenant);
        var el = puce('sortie-patient', (x.etat === 'actee' ? 'Sortie actée' + (x.heure ? ' ' + x.heure : '') : 'Sortie envisagée' + (x.valeur.fin ? ' (jusqu’au ' + x.valeur.fin.split('-').reverse().join('/') + ')' : '')) + ' — ' + A.identite(p, opts().identite),
          function () { ouvrirSortie(p, x); }, null, SIC.sorties.libelle(x.valeur) + (coul && coul.libelle ? ' — ' + coul.libelle : ''));
        if (coul) el.insertBefore(h('span', { class: 'marque-couleur pastille-couleur cpv-' + coul.couleur, 'data-symbole': coul.symbole, 'aria-hidden': 'true' }), el.firstChild);
        ajouter(x.jour, el);
      });
    }
    // Interventions programmées des demandes de travaux (0.22.0), lues à la volée si l'agent a la clé du module
    try {
      var stT = U.App.session.detientCle && U.App.session.detientCle('travaux') ? U.App.session.etatModule('travaux') : null;
      (stT ? SIC.modules.lire('travaux.interventions', stT, { services: svs, debut: A.jourISO(debut), fin: A.jourISO(plusJours(debut, n - 1)) }) || [] : []).forEach(function (x) {
        var t = stT.demandes[x.demande], T = SIC.travaux;
        ajouter(x.jour, puce('travaux', 'Travaux : ' + T.lib(T.options(U.config(), x.service).types, x.type) + ' — ' + T.libLieu(t, U.config()), function () { if (U.travaux) U.travaux.modaleDemande(t); }));
      });
    } catch (e) { /* module des travaux absent ou illisible : rien à afficher */ }
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
  /** Ce qui attend une réponse de l'agent (propositions, invitations) et les demandes qu'il peut confirmer (0.21.0). */
  function mesReponses() {
    var s = U.App.session, c = s && s.compteEffectif && s.compteEffectif();
    if (!c || s.apercu || !s.etatModule('agenda')) return { repondre: [], confirmer: [] };
    var svs = U.services().map(function (x) { return x.code; }), moi = moiG();
    return { repondre: A.aRepondre(st(), fiches(), moi, svs, Date.now(), 30), confirmer: A.aConfirmer(st(), fiches(), U.config(), moi, svs, Date.now(), 30) };
  }
  function bandeauReponses() {
    var m = mesReponses(), moi = moiG();
    if (!m.repondre.length && !m.confirmer.length) return null;
    async function ecrire(x, agent, nom, o) {
      try { await U.App.session.enregistrer('INSCRIPTION', { rdv: x.rdv.id, occurrence: x.occurrence, agent: agent, nom: nom, etat: o.etat, motif: o.motif || undefined, service: x.rdv.service }); U.toast(o.etat === 'refuse' ? 'Refus enregistré.' : 'Enregistré.'); }
      catch (e) { alert(e.message); }
    }
    function lien(x) { return h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleElement(x.rdv, null, !peut('RDV'), null, false, x.occurrence); } }, libelleElement(x.rdv)); }
    function quand(x) { return h('span', { text: ' — ' + libJour(x.debut) + ' ' + hm(x.debut) + ' ' }); }
    return h('section', { class: 'panneau ag-avis ag-reponses', role: 'status' }, h('h2', { text: 'Votre réponse est attendue' }),
      h('ul', { class: 'liste-simple' },
        m.repondre.map(function (x) {
          return h('li', {}, h('span', { text: x.situation.etat === 'propose' ? U.App.session.nomAuteur(x.situation.par) + ' vous propose de participer : ' : 'Vous êtes invité(e) : ' }), lien(x), quand(x),
            h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { ecrire(x, moi.id, moi.nom, { etat: 'inscrit' }); } }, 'Accepter'), ' ',
            h('button', { class: 'btn petit', type: 'button', onclick: function () { var mo = prompt('Motif du refus (facultatif, court, sans donnée de santé) :'); if (mo !== null) ecrire(x, moi.id, moi.nom, { etat: 'refuse', motif: mo.trim() }); } }, 'Refuser…'));
        }),
        m.confirmer.map(function (x) {
          return h('li', {}, h('span', { text: (x.demande.nom || U.App.session.nomAuteur(x.demande.agent)) + ' demande à participer : ' }), lien(x), quand(x),
            h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { ecrire(x, x.demande.agent, x.demande.nom, { etat: 'inscrit' }); } }, 'Confirmer'), ' ',
            h('button', { class: 'btn petit', type: 'button', onclick: function () { var mo = prompt('Motif du refus (court, sans donnée de santé) :'); if (mo && mo.trim()) ecrire(x, x.demande.agent, x.demande.nom, { etat: 'refuse', motif: mo.trim() }); } }, 'Refuser…'));
        })));
  }
  function bandeauAvis() {
    var av = mesAvis(), rep = bandeauReponses();
    if (!av.length) return rep;
    return h('div', { class: 'pile' }, rep, bandeauInfos(av));
  }
  function bandeauInfos(av) {
    return h('section', { class: 'panneau ag-avis', role: 'status' }, h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' informations pour vous' : 'Une information pour vous' }), h('div', { class: 'espace' }),
      av.length > 1 ? h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Tout marquer vu') : null),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        var r = st().rdv[a.rdv], o = r ? A.occurrences(r, A.depuisISO(a.occurrence), plusJours(A.depuisISO(a.occurrence), 1))[0] : null;
        var quoi = { retrait: ' vous a désinscrit(e) : ', refus: ' a refusé votre demande' + (a.motif ? ' (' + a.motif + ')' : '') + ' : ', confirmation: ' a confirmé votre demande : ',
          propositionRefusee: ' a refusé votre proposition' + (a.motif ? ' (' + a.motif + ')' : '') + ' : ', propositionAcceptee: ' a accepté votre proposition : ' }[a.genre || (a.retrait ? 'retrait' : '')] || ' vous a inscrit(e) : ';
        return h('li', {}, h('span', { text: U.App.session.nomAuteur(a.par) + quoi }),
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
      // Salle réservée (Salles et bureaux, 0.25.0), après arbitrage
      r.salle && U.salles && U.App.session.detientCle('salles') ? h('div', {}, h('small', { class: 'ag-salle', text: 'Salle : ' + U.salles.libelle('agenda|' + r.id + '|' + x.occurrence, r.salle) })) : null,
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
    // Événement de plusieurs services (0.21.0) vu depuis un service qui n'en est pas l'organisateur : co-organisateur
    // (il modifie) ou invité (il inscrit ses patients et ses agents, sans modifier)
    var mesSv = U.services().map(function (v) { return v.code; });
    var partageVu = r && mesSv.indexOf(r.service) < 0 && (r.services || []).some(function (c) { return mesSv.indexOf(c) >= 0; }) ? (r.partage === 'co' ? 'co' : 'invites') : null;
    if (partageVu === 'invites') { lecture = true; patientsVisibles = (r.patients || []).filter(function (pid) { return mesSv.indexOf(A.serviceDuPatient(fiches()[pid])) >= 0; }); }
    var repete = !!r && !!occurrence && A.regularite(r.regularite).type !== 'aucune';
    // Portée de la modification d'un élément répété : cette date seulement (par défaut) ou toutes les dates (décision du 8 novembre 2026)
    var portee = repete ? (ini.portee || 'date') : 'toutes', parDate = portee === 'date';
    var occ = parDate ? A.occurrences(r, plusJours(A.depuisISO(occurrence), -8), plusJours(A.depuisISO(occurrence), 9)).filter(function (o) { return o.occurrence === occurrence; })[0] : null;
    var x = r ? (parDate ? Object.assign({}, A.rdvOccurrence(r, occurrence), occ ? { debut: occ.debut, fin: occ.fin } : {}) : r) : {};
    var nouveau = !r, dis = lecture ? { disabled: true } : {};
    function courant() { var b = st().rdv[x.id] || r || x; return occurrence ? A.rdvOccurrence(b, occurrence) : b; }
    var reg = A.regularite(x.regularite), checklist = (x.checklist || []).map(function (it) { var o = { id: it.id, libelle: it.libelle, delai: it.delai === undefined ? null : it.delai }; if (it.obligatoire) o.obligatoire = true; return o; });
    var serviceInitial = x.service || ini.service || (U.App.service !== '*' ? U.App.service : '');
    var disCommun = parDate ? { disabled: true, title: 'Commun à toutes les dates : choisissez « toutes les dates » pour le changer' } : dis;
    var svChoix = lecture || partageVu ? U.tousServices() : U.services();
    var sv = h('select', partageVu ? { disabled: true, title: 'Seul le service organisateur change le service de l’événement' } : disCommun, svChoix.map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === serviceInitial }); }));
    // Autres services de l'événement, et leur place : invités ou co-organisateurs (choix proposé réglé par le cadre)
    var autresSv = (x.services || []).slice(), partage = x.partage || A.partageDefaut(U.config(), serviceInitial);
    var zoneSv = h('div', { class: 'pile' });
    function svTous() { return [sv.value].concat(autresSv.filter(function (c) { return c !== sv.value; })); }
    function dessinerServices() {
      U.vider(zoneSv);
      var autres = U.tousServices().filter(function (v) { return v.code !== sv.value && (autresSv.indexOf(v.code) >= 0 || A.droits.serviceActif(U.config(), v.code)); });
      if (!autres.length) { zoneSv.hidden = true; return; }
      zoneSv.hidden = false;
      var fige = lecture || parDate || !!partageVu;
      if (fige) {
        if (!autresSv.length) { zoneSv.hidden = true; return; }
        zoneSv.appendChild(h('p', { text: 'Avec ' + autresSv.map(function (c) { return U.libService(c); }).join(', ') + ' — ' + (partage === 'co' ? 'services co-organisateurs' : 'services invités') + (partageVu ? ' (organisé par ' + U.libService(x.service) + ')' : '') }));
        return;
      }
      zoneSv.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: 'Avec d’autres services :' }), autres.map(function (v) {
        var cb = h('input', { type: 'checkbox', checked: autresSv.indexOf(v.code) >= 0, onchange: function () { autresSv = cb.checked ? autresSv.concat([v.code]) : autresSv.filter(function (c) { return c !== v.code; }); dessinerServices(); dessinerPatients(); dessinerPros(); } });
        return h('label', { class: 'case' }, cb, h('span', { text: v.libelle }));
      })));
      if (autresSv.length) {
        var selP = h('select', { 'aria-label': 'Place des autres services', onchange: function () { partage = selP.value; } }, Object.keys(A.PARTAGES).map(function (k) { return h('option', { value: k, text: A.PARTAGES[k], selected: partage === k }); }));
        zoneSv.appendChild(selP);
      }
    }
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
    var base = x.debut || ini.debut || (jour || minuit(Date.now())) + 10 * 3600e3;
    var date = h('input', Object.assign({ type: 'date', value: jourISO(base) }, dis));
    // Jour de fin (décision du 8 novembre 2026) : un élément peut durer plusieurs jours (ex. permission de 48 h)
    var dateFin = h('input', Object.assign({ type: 'date', value: jourISO(x.fin || base) }, dis));
    date.addEventListener('change', function () { if (!dateFin.value || dateFin.value < date.value) dateFin.value = date.value; });
    var hDebut = h('input', Object.assign({ type: 'time', value: hm(base) }, dis)), hFin = h('input', Object.assign({ type: 'time', value: x.fin ? hm(x.fin) : ini.fin ? hm(ini.fin) : hm(base + 3600e3) }, dis));
    var lieu = h('input', Object.assign({ type: 'text', maxlength: 80, value: x.lieu || '', placeholder: 'ex. Salle d’activités, extérieur' }, dis));
    // Salle réservée (module Salles et bureaux, 0.25.0) : disponibilité affichée, conflit arbitré par le gestionnaire
    var avecSalles = !!(U.salles && s.detientCle && s.detientCle('salles')), selSalle = null;
    var patients = (x.patients || ini.patients || []).slice(), profs = (x.professionnels || []).map(function (p) { return { id: p.id || null, nom: p.nom }; });
    var transports = (Array.isArray(x.transports) ? x.transports : []).map(function (t) { return Object.assign({}, t); });
    var validations = A.validationsDe(x).map(function (v) { return Object.assign({}, v); });
    // Places et inscriptions (« Quel(s) professionnel(s) ? », « Quel(s) patient(s) ? ») ; `partFixe` : façon de s'inscrire fixée par le type d'événement
    function sansAncien(g) { var o = Object.assign({}, g); delete o.ancien; return o; }
    var partAvant = sansAncien(P.reglage(x)), part = JSON.parse(JSON.stringify(partAvant)), partFixe = !nouveau && !!(cat(x.nature, x.service).prereglages || {}).inscriptionFixe;
    var consigneAcc = String(x.consigneAccompagnateurs || '');
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
      part = sansAncien(P.reglage({ participation: pr.participation ? Object.assign({}, pr.participation, { nombre: pr.accompagnateurs || 0 }) : undefined, accompagnateurs: pr.accompagnateurs || 0 })); partFixe = !!pr.inscriptionFixe;
      transports = (pr.transports || []).map(function (t) { return { id: 't' + C.hex(C.aleatoire(3)), type: t.type, nombre: t.nombre, precision: t.precision || '' }; });
      validations = (pr.validations || []).map(function (v) { return Object.assign({ id: (v.type === 'permission' ? 'p' : 'v') + C.hex(C.aleatoire(3)) }, v); });
      if (pr.checklist && checklist && !checklist.length) {
        var m = A.checklists(U.config()).filter(function (c) { return c.code === pr.checklist; })[0];
        if (m) m.items.forEach(function (it) { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: it.libelle, delai: it.delai }); });
      }
      if (visibles) { visibles.patients = pr.patients !== false; visibles.transports = transports.length > 0; visibles.validations = validations.length > 0; }
    }
    var visibles = null;
    if (nouveau) prereglerNature(natureInitiale);
    visibles = { patients: !!patients.length || (nouveau ? cat(natureInitiale, serviceInitial).prereglages.patients !== false : ['reunion', 'autre'].indexOf(baseNature(natureInitiale, serviceInitial)) < 0), transports: !!transports.length, validations: !!validations.length };

    // -- Patients
    var zonePat = h('div', { class: 'pile' }), recherche = '';
    function fichesDuService() {
      var f = fiches();
      return Object.keys(f).map(function (k) { return f[k]; }).filter(function (p) { return svTous().indexOf(A.serviceDuPatient(p)) >= 0 || patients.indexOf(p.id) >= 0; })
        .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
    }
    function dessinerPatients() {
      U.vider(zonePat);
      if (lecture) {
        var ids = patientsVisibles || patients, ppl = P.patients({ patients: patients, participation: part });
        zonePat.appendChild(h('p', { text: ids.length ? nomsPatients(ids.filter(function (i) { return ppl.attente.indexOf(i) < 0; })).join(', ') || '—' : 'Aucun patient.' }));
        var att = ids.filter(function (i) { return ppl.attente.indexOf(i) >= 0; });
        if (att.length) zonePat.appendChild(h('p', { text: 'Liste d’attente : ' + nomsPatients(att).join(', ') }));
        if (ppl.min || ppl.max) zonePat.appendChild(h('small', { class: 'muted', text: 'Places : ' + (ppl.min ? 'au moins ' + ppl.min : '') + (ppl.min && ppl.max ? ', ' : '') + (ppl.max ? ppl.max + ' au plus' : '') + (ppl.manque ? ' — il manque ' + ppl.manque + ' patient(s)' : '') }));
        if (patientsVisibles && patientsVisibles.length < patients.length) zonePat.appendChild(h('small', { class: 'muted', text: 'Seuls les patients hospitalisés dans votre service sont nommés' + (partageVu ? ' (' + (patients.length - patientsVisibles.length) + ' autre(s) patient(s) inscrit(s))' : '') + '.' }));
        // Service invité : il inscrit ou retire ses propres patients, sans modifier l'événement
        if (partageVu === 'invites' && peut('PATIENT_INSCRIT') && !s.apercu && !nouveau) {
          var f0 = fiches(), miens = Object.keys(f0).map(function (k) { return f0[k]; }).filter(function (p) { return mesSv.indexOf(A.serviceDuPatient(p)) >= 0; }).sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
          zonePat.appendChild(h('b', { class: 'ag-sous-titre', text: 'Inscrire les patients de votre service' }));
          zonePat.appendChild(h('div', { class: 'grille-2 liste-cases' }, miens.slice(0, 60).map(function (p) {
            var cb = h('input', { type: 'checkbox', checked: patients.indexOf(p.id) >= 0, onchange: async function () {
              try {
                await s.enregistrer('PATIENT_INSCRIT', { rdv: x.id, occurrence: occurrence || undefined, patient: p.id, retrait: cb.checked ? undefined : true, service: x.service });
                patients = cb.checked ? patients.concat([p.id]) : patients.filter(function (i) { return i !== p.id; });
                patientsVisibles = patients.filter(function (pid) { return mesSv.indexOf(A.serviceDuPatient(fiches()[pid])) >= 0; });
                U.toast(cb.checked ? 'Patient inscrit.' : 'Patient retiré.'); dessinerPatients();
              } catch (e) { cb.checked = !cb.checked; alert(e.message); }
            } });
            var rg = ppl.attente.indexOf(p.id);
            return h('label', { class: 'case' }, cb, h('span', { text: (p.nom || '?') + ' ' + (p.prenom || '') }), rg >= 0 ? h('span', { class: 'badge warn', text: 'attente n° ' + (rg + 1) }) : null);
          })));
        }
        return;
      }
      var q = recherche.trim().toLowerCase(), liste = fichesDuService().filter(function (p) { return !q || ((p.nom || '') + ' ' + (p.prenom || '') + ' ' + (p.ipp || '')).toLowerCase().indexOf(q) >= 0; });
      // Places (0.21.0) : minimum (alerte s'il manque des patients) et maximum (au-delà : liste d'attente, dans l'ordre d'inscription)
      var pl = P.patients({ patients: patients, participation: part });
      var pMin = h('input', { type: 'number', min: 0, max: 200, step: 1, value: part.patientsMin || '', class: 'champ-court', placeholder: 'sans', 'aria-label': 'Minimum de patients', onchange: function () { part.patientsMin = Math.max(0, Math.round(+pMin.value || 0)); dessinerPatients(); } });
      var pMax = h('input', { type: 'number', min: 0, max: 200, step: 1, value: part.patientsMax || '', class: 'champ-court', placeholder: 'sans', 'aria-label': 'Maximum de patients', onchange: function () { part.patientsMax = Math.max(0, Math.round(+pMax.value || 0)); dessinerPatients(); } });
      zonePat.appendChild(h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Places : au moins', pMin), h('label', { class: 'en-ligne' }, 'au plus', pMax),
        h('span', { class: 'badge ' + (pl.manque ? 'warn' : 'ok'), text: pl.inscrits.length + (pl.max ? '/' + pl.max : '') + ' patient(s)' + (pl.attente.length ? ' + ' + pl.attente.length + ' en attente' : '') + (pl.manque ? ' — il en manque ' + pl.manque : '') })));
      if (pl.attente.length) zonePat.appendChild(h('div', { class: 'actions gauche' }, h('small', { class: 'muted', text: 'Liste d’attente : ' + nomsPatients(pl.attente).join(', ') + '. Le premier prend la place si un patient est retiré.' }),
        pl.attente.map(function (id) { return h('button', { class: 'btn petit', type: 'button', onclick: function () { patients = [id].concat(patients.filter(function (i) { return i !== id; })); dessinerPatients(); } }, 'Donner une place à ' + nomsPatients([id])[0]); })));
      var champ = h('input', { type: 'search', placeholder: 'Rechercher un patient du service', value: recherche, oninput: function () { recherche = champ.value; dessinerPatients(); var c = zonePat.querySelector('input[type=search]'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } } });
      zonePat.appendChild(champ);
      zonePat.appendChild(h('div', { class: 'grille-2 liste-cases' }, liste.slice(0, 40).map(function (p) {
        var cb = h('input', { type: 'checkbox', checked: patients.indexOf(p.id) >= 0, onchange: function () { patients = cb.checked ? patients.concat([p.id]) : patients.filter(function (i) { return i !== p.id; }); dessinerValidations(); dessinerPatients(); dessinerChecklist(); } });
        var rang = pl.attente.indexOf(p.id);
        return h('label', { class: 'case' }, cb, h('span', { text: (p.nom || '?') + ' ' + (p.prenom || '') + (p.ipp ? ' — IPP ' + p.ipp : '') }), rang >= 0 ? h('span', { class: 'badge warn', text: 'attente n° ' + (rang + 1) }) : null);
      })));
      if (liste.length > 40) zonePat.appendChild(h('small', { class: 'muted', text: liste.length - 40 + ' autre(s) : précisez la recherche.' }));
    }
    // -- « Quel(s) professionnel(s) ? » (0.21.0, décisions du porteur du 11 novembre 2026) : désignés, places, façons de
    //    pourvoir les places (inscription libre ou à confirmer, invitations), puis inscriptions de la date affichée
    var zonePro = h('div', { class: 'pile' });
    function dessinerPros() {
      U.vider(zonePro);
      zonePro.appendChild(h('b', { class: 'ag-sous-titre', text: 'Désignés (sans confirmation)' }));
      if (lecture) { zonePro.appendChild(h('p', { text: profs.length ? profs.map(function (p) { return p.nom; }).join(', ') : '—' })); return; }
      var comptes = (s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && (!(c.services || []).length || (c.services || []).some(function (v) { return svTous().indexOf(v) >= 0; }) || profs.some(function (p) { return p.id === c.id; })); })
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
    function nomCible(i) {
      if (i.t === 'role') return 'Rôle : ' + (SIC.model.libRole(U.config(), i.id) || i.nom || i.id);
      if (i.t === 'groupe') { var g = SIC.groupes ? SIC.groupes.liste(U.config()).filter(function (y) { return y.code === i.id; })[0] : null; return 'Groupe : ' + (g ? g.libelle : i.nom || i.id); }
      var c = (s.comptes || []).filter(function (y) { return y.id === i.id; })[0]; return c ? c.nom : i.nom || i.id;
    }
    function resumePlaces() {
      var t = [];
      if (part.nombre) t.push((part.mode === 'min' ? 'au moins ' : 'exactement ') + part.nombre + (part.mode === 'min' && part.max ? ' (' + part.max + ' au plus)' : ''));
      t.push(part.aConfirmer ? 'inscription à confirmer' : part.libre ? 'inscription libre' : part.invites.length ? 'sur invitation' : 'pas d’inscription');
      if (part.invites.length) t.push('invités : ' + part.invites.map(nomCible).join(', '));
      return t.join(' · ');
    }
    var zoneAcc = h('div', { class: 'pile' });
    function dessinerAccompagnateurs() {
      U.vider(zoneAcc);
      zoneAcc.appendChild(h('b', { class: 'ag-sous-titre', text: 'Places et inscriptions' }));
      if (lecture) {
        zoneAcc.appendChild(h('p', { text: resumePlaces() }));
        if (consigneAcc) zoneAcc.appendChild(h('p', { text: 'Consigne : ' + consigneAcc }));
      } else {
        var fx = partFixe ? { disabled: true } : {};
        var selMode = h('select', { 'aria-label': 'Nombre de professionnels demandé', onchange: function () { if (!selMode.value) part.nombre = 0; else { part.mode = selMode.value; part.nombre = Math.max(1, part.nombre); } dessinerAccompagnateurs(); majVisibles(); } },
          [['', 'Sans nombre demandé'], ['exact', 'Exactement'], ['min', 'Au moins']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (part.nombre ? part.mode : '') === o[0] }); }));
        var nb = h('input', { type: 'number', min: 1, max: 200, step: 1, value: part.nombre || '', class: 'champ-court', 'aria-label': 'Nombre', oninput: function () { part.nombre = Math.max(0, Math.min(200, Math.round(+nb.value || 0))); } });
        var mx = h('input', { type: 'number', min: 1, max: 200, step: 1, value: part.max || '', class: 'champ-court', 'aria-label': 'Maximum', placeholder: 'sans', oninput: function () { part.max = Math.max(0, Math.min(200, Math.round(+mx.value || 0))); } });
        zoneAcc.appendChild(h('div', { class: 'actions gauche' }, selMode, part.nombre ? nb : null, part.nombre ? h('span', { text: 'professionnel(s), désignés compris' }) : null,
          part.nombre && part.mode === 'min' ? h('label', { class: 'en-ligne' }, 'Maximum', mx) : null));
        if (part.nombre && part.mode === 'exact') zoneAcc.appendChild(h('small', { class: 'muted', text: 'Au-delà de ce nombre, les agents passent en liste d’attente.' }));
        var selIns = h('select', Object.assign({ 'aria-label': 'Inscription des agents', onchange: function () { part.libre = selIns.value === 'libre'; part.aConfirmer = selIns.value === 'confirmer'; dessinerAccompagnateurs(); } }, fx),
          [['', 'Pas d’inscription : désignés et invités seulement'], ['libre', 'Inscription libre'], ['confirmer', 'Inscription à confirmer par un organisateur']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (part.aConfirmer ? 'confirmer' : part.libre ? 'libre' : '') === o[0] }); }));
        zoneAcc.appendChild(h('label', {}, 'Les autres agents', selIns));
        if (partFixe) zoneAcc.appendChild(h('small', { class: 'muted', text: 'Façon de s’inscrire fixée pour ce type d’événement (réglage de l’administration).' }));
        // Invitations : agents, groupes d'agents, rôles
        var deja = function (t, id) { return part.invites.some(function (i) { return i.t === t && i.id === id; }); };
        var comptesI = (s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && !deja('agent', c.id) && !profs.some(function (p) { return p.id === c.id; }); }).sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
        var groupesI = SIC.groupes ? SIC.groupes.pourService(U.config(), sv.value).filter(function (g) { return !deja('groupe', g.code); }) : [];
        var rolesI = SIC.model.rolesConfig(U.config()).filter(function (r) { return r.code !== 'ADMIN' && !deja('role', r.code); });
        var selInv = h('select', Object.assign({ 'aria-label': 'Inviter', onchange: function () {
          var v = selInv.value.split('|'); if (v.length < 2) return;
          part.invites.push({ t: v[0], id: v[1], nom: selInv.options[selInv.selectedIndex].text }); dessinerAccompagnateurs();
        } }, fx), [h('option', { value: '', text: '+ Inviter un agent, un groupe ou un rôle…' }),
          h('optgroup', { label: 'Agents' }, comptesI.map(function (c) { return h('option', { value: 'agent|' + c.id, text: c.nom }); })),
          groupesI.length ? h('optgroup', { label: 'Groupes d’agents' }, groupesI.map(function (g) { return h('option', { value: 'groupe|' + g.code, text: g.libelle }); })) : null,
          h('optgroup', { label: 'Rôles' }, rolesI.map(function (r) { return h('option', { value: 'role|' + r.code, text: r.libelle || r.code }); }))]);
        zoneAcc.appendChild(h('div', { class: 'actions gauche' }, part.invites.map(function (i) {
          return h('span', { class: 'badge' }, nomCible(i) + ' ', partFixe ? null : h('button', { class: 'btn lien', type: 'button', 'aria-label': 'Retirer l’invitation', onclick: function () { part.invites = part.invites.filter(function (y) { return y !== i; }); dessinerAccompagnateurs(); } }, '✕'));
        }), selInv));
        if (part.invites.length) zoneAcc.appendChild(h('small', { class: 'muted', text: 'Les invités acceptent ou refusent depuis leur agenda.' + (P.plafond(part) ? ' Les places vont aux premiers qui acceptent, les suivants passent en liste d’attente.' : '') }));
        if (part.aConfirmer) {
          var selOrg = h('select', { 'aria-label': 'Ajouter un organisateur', onchange: function () { if (selOrg.value) { part.organisateurs.push(selOrg.value); dessinerAccompagnateurs(); } } },
            [h('option', { value: '', text: '+ Organisateur…' })].concat((s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && part.organisateurs.indexOf(c.id) < 0; }).sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); }).map(function (c) { return h('option', { value: c.id, text: c.nom }); })));
          zoneAcc.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: 'Confirment les demandes : l’auteur, le cadre' + (part.organisateurs.length ? ' et' : '') }),
            part.organisateurs.map(function (id) { return h('span', { class: 'badge' }, nomCible({ t: 'agent', id: id }) + ' ', h('button', { class: 'btn lien', type: 'button', 'aria-label': 'Retirer l’organisateur', onclick: function () { part.organisateurs = part.organisateurs.filter(function (y) { return y !== id; }); dessinerAccompagnateurs(); } }, '✕')); }), selOrg));
        }
        var consigne = h('input', { type: 'text', maxlength: 120, value: consigneAcc, placeholder: 'Consigne (facultatif) : ex. 1 IDE le matin, 1 AS l’après-midi, un éducateur', 'aria-label': 'Consigne pour les professionnels', oninput: function () { consigneAcc = consigne.value; } });
        zoneAcc.appendChild(h('label', {}, 'Consigne', consigne));
      }
      if (nouveau || !occurrence) return;
      // Inscriptions de la date affichée
      var etatR = courant(), acc = A.accompagnateurs(etatR, occurrence), peutAutres = peut('INSCRIPTION') && !s.apercu && !externe;
      var moiG = Object.assign({}, moi, { groupes: SIC.groupes ? SIC.groupes.de(U.config(), moi.id) : [] });
      var confirme = P.peutConfirmer(etatR, moiG, A.rolesConfirmation(U.config(), etatR.service)) && !s.apercu && !externe, cadre = (moi.roles || []).indexOf('CADRE') >= 0 && !s.apercu;
      zoneAcc.appendChild(h('div', {}, h('b', { text: 'Le ' + occurrence.split('-').reverse().join('/') + ' : ' }), badgeAccompagnateurs({ accompagnateurs: acc }) || h('span', { text: acc.total + ' professionnel(s)' })));
      function ligne(i, suffixe, boutons) {
        return h('div', { class: 'barre' }, h('span', { text: (i.nom || s.nomAuteur(i.agent)) + (suffixe || '') }), boutons);
      }
      function groupe(titreG, l, f) { if (!l.length) return; zoneAcc.appendChild(h('small', { class: 'muted', text: titreG })); l.forEach(function (i, k) { zoneAcc.appendChild(f(i, k)); }); }
      groupe('Inscrits', acc.inscrits, function (i) {
        var lui = i.agent === moi.id;
        return ligne(i, i.demandePar && i.demandePar !== i.agent ? ' (proposé(e) par ' + s.nomAuteur(i.demandePar) + ')' : i.par && i.par !== i.agent ? ' (inscrit(e) par ' + s.nomAuteur(i.par) + ')' : '',
          lui || peutAutres ? h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(i.agent, i.nom, { retrait: true }); } }, lui ? 'Me désinscrire' : 'Désinscrire') : null);
      });
      groupe('Liste d’attente (le premier prend la place en cas de désistement)', acc.attente, function (i, k) {
        var lui = i.agent === moi.id;
        return ligne(i, ' — n° ' + (k + 1), [cadre ? h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(i.agent, i.nom, { etat: 'inscrit', prioritaire: true }); } }, 'Passer en tête') : null,
          lui || peutAutres ? h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(i.agent, i.nom, { retrait: true }); } }, lui ? 'Me retirer' : 'Retirer') : null]);
      });
      groupe('Proposés par un collègue, en attente de leur réponse', acc.proposes, function (i) {
        return ligne(i, ' (par ' + s.nomAuteur(i.par) + ')', peutAutres && i.agent !== moi.id ? h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(i.agent, i.nom, { retrait: true }); } }, 'Retirer') : null);
      });
      groupe('Demandes à confirmer', acc.demandes, function (i) {
        return ligne(i, '', confirme && i.agent !== moi.id ? [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(i.agent, i.nom, { etat: 'inscrit' }); } }, 'Confirmer'),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { var m = prompt('Motif du refus (court, sans donnée de santé) :'); if (m && m.trim()) inscrire(i.agent, i.nom, { etat: 'refuse', motif: m.trim() }); } }, 'Refuser…')] : null);
      });
      groupe('Refus', acc.refus, function (i) { return ligne(i, i.motif ? ' — ' + i.motif : ''); });
      // Ce que je peux faire pour moi
      var sit = P.situation(etatR, occurrence, moiG), actions = h('div', { class: 'actions gauche' });
      if (!externe && !s.apercu) {
        if (sit.etat === 'propose') actions.appendChild(h('span', { text: s.nomAuteur(sit.par) + ' vous propose de participer :' }));
        if (sit.etat === 'invite') actions.appendChild(h('span', { text: 'Vous êtes invité(e) :' }));
        if (sit.etat === 'demande') actions.appendChild(h('span', { class: 'badge', text: 'Votre demande attend la confirmation d’un organisateur' }));
        if (sit.etat === 'refuse' && sit.motif) actions.appendChild(h('span', { class: 'muted', text: 'Refus : ' + sit.motif }));
        sit.actions.forEach(function (a) {
          if (a === 'inscrire') actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(moi.id, moi.nom, { etat: 'inscrit' }); } }, acc.complet ? 'M’inscrire en liste d’attente' : 'M’inscrire'));
          if (a === 'demander') actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(moi.id, moi.nom, { etat: 'demande' }); } }, 'Demander à participer'));
          if (a === 'accepter') actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(moi.id, moi.nom, { etat: 'inscrit' }); } }, acc.complet ? 'Accepter (liste d’attente)' : 'Accepter'));
          if (a === 'refuser') actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { var m = prompt('Motif du refus (facultatif, court, sans donnée de santé) :'); if (m !== null) inscrire(moi.id, moi.nom, { etat: 'refuse', motif: m.trim() }); } }, 'Refuser…'));
          if (a === 'retirer' && sit.etat === 'demande') actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { inscrire(moi.id, moi.nom, { retrait: true }); } }, 'Retirer ma demande'));
        });
      }
      if (peutAutres) {
        var pris = acc.inscrits.concat(acc.attente, acc.proposes, acc.demandes).map(function (i) { return i.agent; });
        var choix = (s.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && c.id !== moi.id && pris.indexOf(c.id) < 0 && !(etatR.professionnels || []).some(function (p) { return p.id === c.id; }) && (!(c.services || []).length || (c.services || []).indexOf(etatR.service) >= 0 || (etatR.services || []).some(function (v) { return (c.services || []).indexOf(v) >= 0; })); })
          .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
        var selCol = h('select', { 'aria-label': 'Collègue à proposer' }, [h('option', { value: '', text: 'Proposer un collègue…' })].concat(choix.map(function (c) { return h('option', { value: c.id, text: c.nom }); })));
        actions.appendChild(selCol);
        actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { var c = choix.filter(function (y) { return y.id === selCol.value; })[0]; if (c) inscrire(c.id, c.nom, { etat: 'propose' }); } }, 'Proposer'));
      }
      zoneAcc.appendChild(actions);
      if (peutAutres) zoneAcc.appendChild(h('small', { class: 'muted', text: 'Le collègue proposé est averti dans sa session : il confirme, ou refuse avec un motif. Pour l’inscrire sans confirmation, cochez-le parmi les désignés.' }));
    }
    async function inscrire(agent, nom, o) {
      try {
        await s.enregistrer('INSCRIPTION', { rdv: x.id, occurrence: occurrence, agent: agent, nom: nom, retrait: o.retrait ? true : undefined, etat: o.retrait ? undefined : o.etat, motif: o.motif || undefined, prioritaire: o.prioritaire, service: x.service });
        U.toast(o.retrait ? 'Retrait enregistré.' : o.etat === 'propose' ? 'Proposition envoyée au collègue.' : o.etat === 'demande' ? 'Demande envoyée aux organisateurs.' : o.etat === 'refuse' ? 'Refus enregistré.' : 'Inscription enregistrée.');
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
          !nouveau && occurrence && v.type === 'permission' && e.permission ? zoneEtapes(v, e) : !nouveau && occurrence ? h('div', { class: 'barre' },
            fait ? h('span', { class: 'badge ' + (fait.statut === 'validee' ? 'ok' : 'bad'), text: (fait.statut === 'validee' ? 'Validée' : 'Refusée') + (fait.nom ? ' par ' + fait.nom : '') + (fait.le ? ', ' + U.date(Date.parse(fait.le)) : '') })
              : h('span', { class: 'badge ' + (e.niveau === 'retard' ? 'bad' : 'warn'), text: (e.niveau === 'retard' ? 'En retard — ' : 'À faire valider — ') + 'avant ' + libJour(e.echeance) + ' ' + hm(e.echeance) }),
            peut('VALIDATION') && !externe ? (fait ? h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'attente'); } }, 'Remettre en attente')
              : [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { valider(v.id, 'validee'); } }, 'Validée (signée)…'), h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'refusee'); } }, 'Refusée…')]) : null) : null));
      });
      if (!lecture) zoneVal.appendChild(h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { validations.push({ id: 'p' + C.hex(C.aleatoire(3)), type: 'permission' }); dessinerValidations(); } }, '+ Permission à faire valider'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { validations.push({ id: 'v' + C.hex(C.aleatoire(3)), type: 'medicale', delai: 24 }); dessinerValidations(); } }, '+ Validation médicale ou autre')));
    }
    // Étapes de validation de la permission (0.21.0) : processus du mode d'hospitalisation, réglé par service
    function zoneEtapes(v, e) {
      var ep = e.permission, es = ep.processus.etapes, PM = A.permissions, roles = moi.roles || [];
      var permis = function (et) { return peut('VALIDATION') && !externe && !s.apercu && PM.rolesEtape(et).some(function (r) { return roles.indexOf(r) >= 0; }); };
      var fil = h('div', { class: 'ag-etapes' }, es.map(function (et, i) {
        return teinter(h('span', { class: 'ag-etape' + (ep.refusee ? ' avenir' : i < ep.index ? ' faite' : i === ep.index ? ' courante' : ' avenir'), title: (et.tache ? 'À faire : ' + et.tache : '') + (et.delai !== undefined ? (et.tache ? ' — ' : '') + (et.delai ? et.delai + ' h avant le début' : 'au plus tard au début') : ''), text: (i < ep.index && !ep.refusee ? '✓ ' : '') + et.libelle }), et.couleur);
      }), ep.refusee ? teinter(h('span', { class: 'ag-etape courante', text: 'Refusée' }), PM.COULEUR_REFUS) : null);
      var infos = [h('small', { class: 'muted', text: 'Processus : ' + (PM.FAMILLES[ep.processus.famille] || '') + (e.modes && e.modes.length ? ' (mode : ' + e.modes.join(', ') + ')' : ' (selon le mode d’hospitalisation des patients)') + '.' })];
      if (ep.mention) infos.push(h('p', { class: 'ag-mention', text: ep.mention }));
      if (!ep.terminee && !ep.refusee) ep.taches.forEach(function (t) {
        var dep = t.echeance !== null && Date.now() > t.echeance, deja = checklist.some(function (it) { return it.libelle === t.libelle; });
        infos.push(h('div', { class: 'barre' }, h('span', { class: 'badge ' + (dep ? 'bad' : 'warn'), text: t.libelle + (t.echeance !== null ? ' — avant ' + libJour(t.echeance) + ' ' + hm(t.echeance) + (dep ? ' (délai dépassé)' : '') : '') }),
          deja || lecture ? (deja ? h('small', { class: 'muted', text: 'dans la check-list' }) : null) : h('button', { class: 'btn petit', type: 'button', onclick: function () { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: t.libelle, delai: t.delaiJours }); dessinerChecklist(); dessinerValidations(); U.toast('Ajouté à la check-list : enregistrez l’événement.'); } }, 'Ajouter à la check-list')));
      });
      var actions = h('div', { class: 'actions gauche' }), sv0 = ep.suivante;
      async function ecrire(d, msg) {
        try { await s.enregistrer('VALIDATION', Object.assign({ rdv: x.id, validation: v.id, occurrence: occurrence, processus: ep.processus.cle, service: x.service }, d)); U.toast(msg); dessinerValidations(); }
        catch (err) { alert(err.message); }
      }
      function passer(et, extra) {
        var finale = et.code === es[es.length - 1].code, nom = '';
        if (finale || /sign/i.test(et.libelle)) { nom = prompt('« ' + et.libelle + ' » — par (facultatif) :', ''); if (nom === null) return; }
        ecrire(Object.assign({ statut: 'etape', etape: et.code, finale: finale || undefined, nom: nom.trim() || undefined }, extra || {}), 'Étape enregistrée : ' + et.libelle + '.');
      }
      if (sv0 && permis(sv0)) {
        if (sv0.retour) {
          actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { passer(sv0, { retourARS: 'accord' }); } }, 'Accord reçu'));
          [['complement', 'Demande d’éléments complémentaires…'], ['avis', 'Demande d’un 2e avis…']].forEach(function (o) {
            actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () {
              var m = prompt(PM.RETOURS[o[0]] + ' — précision (courte, sans donnée de santé) :', ''); if (!m || !m.trim()) return;
              var ret = PM.etapeApresDemande(ep.processus);
              ecrire({ statut: 'etape', etape: ret.code, retourARS: o[0], mention: PM.RETOURS[o[0]] + ' : ' + m.trim() }, 'Demande notée : retour à « ' + ret.libelle + ' ».');
            } }, o[1]));
          });
        } else actions.appendChild(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { passer(sv0); } }, 'Étape suivante : ' + sv0.libelle));
      } else if (sv0 && peut('VALIDATION') && !externe) actions.appendChild(h('small', { class: 'muted', text: 'Étape suivante (« ' + sv0.libelle + ' ») enregistrée par : ' + PM.rolesEtape(sv0).map(function (r) { return SIC.model.libRole(U.config(), r) || r; }).join(', ') + '.' }));
      if (peut('VALIDATION') && !externe && !s.apercu) {
        if (!ep.terminee && !ep.refusee) actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'refusee'); } }, 'Refusée…'));
        if (ep.index > 0 && !ep.refusee && !ep.terminee) actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { ecrire({ statut: 'etape', etape: es[ep.index - 1].code }, 'Retour à l’étape précédente.'); } }, 'Revenir à l’étape précédente'));
        if (ep.terminee || ep.refusee) actions.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { valider(v.id, 'attente'); } }, 'Remettre en attente'));
      }
      var hist = ep.historique.length ? h('details', {}, h('summary', { text: 'Historique des étapes' }), h('ul', { class: 'liste-simple' }, ep.historique.map(function (hh) {
        var et = es.filter(function (y) { return y.code === hh.etape; })[0];
        return h('li', {}, h('small', { class: 'muted', text: U.date(Date.parse(hh.le)) + ' — ' + s.nomAuteur(hh.par) + ' : ' }), (et ? et.libelle : hh.etape) + (hh.nom ? ' (par ' + hh.nom + ')' : '') + (hh.mention ? ' — ' + hh.mention : ''));
      }))) : null;
      return h('div', { class: 'pile' }, fil, infos, actions, hist);
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
    var retirees = {};
    /** Tâches suggérées par la prise en charge des patients de l'événement (répertoire du module Patients, lu à la volée). */
    function suggestionsPrise() {
      if (!SIC.intervenants || !visibles || !visibles.patients) return [];
      var ep = null; try { ep = s.etatModule('patients'); } catch (e) { ep = null; }
      if (!ep) return [];
      var entrees = [], plusieurs = patients.length > 1;
      patients.forEach(function (pid) {
        SIC.intervenants.dePatient(ep, (ep.fiches || {})[pid]).forEach(function (l) { entrees.push({ type: l.intervenant.type, nom: l.intervenant.nom, contact: l.intervenant.contact, patient: plusieurs ? nomsPatients([pid])[0] : '' }); });
      });
      return A.tachesSuggerees(U.config(), sv.value, baseNature(nature.value, sv.value), entrees);
    }
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
          it.obligatoire ? h('span', { class: 'badge warn', title: 'Tâche réglée comme obligatoire : seul le cadre la retire', text: 'Obligatoire' }) : null,
          !lecture && (!it.obligatoire || (moi.roles || []).indexOf('CADRE') >= 0) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { if (it.obligatoire) retirees[it.libelle] = 1; checklist.splice(i, 1); dessinerChecklist(); } }, 'Retirer') : null));
      });
      // Tâches suggérées selon la prise en charge des patients (0.21.0) : proposées ; les obligatoires sont ajoutées d'office
      if (!lecture) {
        var sug = suggestionsPrise().filter(function (t) { return !checklist.some(function (y) { return y.libelle === t.libelle; }); });
        sug.filter(function (t) { return t.obligatoire && !retirees[t.libelle]; }).forEach(function (t) { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: t.libelle, delai: t.delai, obligatoire: true }); });
        if (sug.some(function (t) { return t.obligatoire && !retirees[t.libelle]; })) return dessinerChecklist();
        if (sug.length) zoneCheck.appendChild(h('div', { class: 'pile ag-suggestions' }, h('small', { class: 'muted', text: 'Suggestions selon la prise en charge des patients :' }), sug.map(function (t) {
          return h('div', { class: 'barre' }, h('span', { text: t.libelle + (t.delai !== null ? ' — ' + libDelai(t.delai).toLowerCase() : '') }),
            h('button', { class: 'btn petit', type: 'button', onclick: function () { checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: t.libelle, delai: t.delai }); dessinerChecklist(); } }, 'Ajouter à la check-list'));
        })));
      }
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
    var secPatients = section('Quel(s) patient(s) ?', zonePat), secTransports = section('Transports', zoneTr), secVal = section('Permission et validations', zoneVal);
    var barreAjout = h('div', { class: 'actions gauche ag-ajouter' });
    function majVisibles() {
      secPatients.hidden = !visibles.patients; secTransports.hidden = !visibles.transports; secVal.hidden = !visibles.validations;
      U.vider(barreAjout);
      if (lecture) { barreAjout.hidden = true; return; }
      barreAjout.appendChild(h('span', { class: 'muted', text: 'Ajouter :' }));
      [['patients', '+ Patients', function () { visibles.patients = true; }],
        ['transports', '+ Transport', function () { visibles.transports = true; if (!transports.length) transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); dessinerTransports(); }],
        ['permission', '+ Permission à faire valider', function () { visibles.validations = true; validations.push({ id: 'p' + C.hex(C.aleatoire(3)), type: 'permission' }); dessinerValidations(); }],
        ['validation', '+ Validation (médicale ou autre)', function () { visibles.validations = true; validations.push({ id: 'v' + C.hex(C.aleatoire(3)), type: 'medicale', delai: 24 }); dessinerValidations(); }]]
          .forEach(function (b) { if (visibles[b[0]]) return; barreAjout.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { b[2](); majVisibles(); } }, b[1])); });
      cbVSL.checked = transports.some(function (t) { return t.type === 'vsl'; }); cbAccomp.checked = part.nombre > 0 || profs.length > 0;
    }
    cbVSL.addEventListener('change', function () {
      if (cbVSL.checked) { if (!transports.some(function (t) { return t.type === 'vsl'; })) transports.push({ id: 't' + C.hex(C.aleatoire(3)), type: 'vsl', nombre: 1 }); visibles.transports = true; }
      else { transports = transports.filter(function (t) { return t.type !== 'vsl'; }); visibles.transports = transports.length > 0; }
      dessinerTransports(); majVisibles();
    });
    cbAccomp.addEventListener('change', function () { part.nombre = cbAccomp.checked ? Math.max(1, part.nombre) : 0; if (cbAccomp.checked && !part.libre && !part.aConfirmer && !part.invites.length) part.libre = true; dessinerAccompagnateurs(); majVisibles(); });
    function majNature(changement) {
      var b = baseCat();
      zoneEnt.hidden = b !== 'entretien'; zoneExamen.hidden = b !== 'examen'; zoneAudience.hidden = b !== 'audience';
      titre.placeholder = ['entretien', 'permission', 'examen', 'audience'].indexOf(b) >= 0 || !A.NATURES[nature.value] ? 'Facultatif' : 'ex. Rendez-vous extérieur, atelier, synthèse';
      if (nouveau && changement) prereglerNature(nature.value);
      dessinerTransports(); dessinerAccompagnateurs(); dessinerValidations(); dessinerChecklist(); majVisibles();
    }
    nature.addEventListener('change', function () { majNature(true); });
    sv.addEventListener('change', function () { dessinerServices(); dessinerPatients(); dessinerPros(); });
    [date, hDebut].forEach(function (c) { c.addEventListener('change', dessinerValidations); });
    [date, hDebut, dateFin, hFin, sv].forEach(function (c) { c.addEventListener('change', function () { if (transports.some(function (t) { return t.type === 'vehicule'; })) dessinerTransports(); }); });
    if (!nouveau) dessinerCommentaires();
    dessinerServices(); dessinerPatients(); dessinerPros(); dessinerChecklist();

    var boutons = [{ texte: lecture || repete ? 'Fermer' : 'Annuler' }];
    // « Envoyer par message » (messagerie, 0.23.0) : nouveau message avec l'événement rattaché
    if (!nouveau && U.messagerie && U.messagerie.peutEnvoyer()) boutons.push(U.messagerie.boutonModale('agenda', 'evenement', r.id, r.service));
    if (!nouveau && U.mesTaches) { var bml = U.mesTaches.boutonModale('agenda', 'evenement', r.id, r.service, r.titre || ''); if (bml) boutons.push(bml); }
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
      var d = { id: x.id || 'R' + C.hex(C.aleatoire(6)), nature: nv, titre: titre.value.trim(), debut: d0, fin: d1, lieu: lieu.value.trim(), salle: selSalle ? selSalle.valeur() : (x.salle || ''), service: sv.value,
        patients: visibles.patients ? patients : [], professionnels: profs, regularite: rg, checklist: checklist,
        services: autresSv.filter(function (c) { return c !== sv.value; }), partage: autresSv.length ? partage : '',
        accompagnateurs: Math.min(20, part.nombre), consigneAccompagnateurs: consigneAcc.trim(),
        participation: sansAncien(P.reglage({ participation: Object.assign({}, part, visibles.patients ? {} : { patientsMin: 0, patientsMax: 0 }) })),
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
      // Tâches des étapes d'une permission ajoutées d'office à la check-list à la création (réglage du service, 0.21.0)
      if (nouveau && A.tachesPermission(U.config(), sv.value) === 'office') {
        A.etatValidations(d, jourISO(d0), d0, fiches(), U.config()).forEach(function (ev0) {
          if (ev0.permission) ev0.permission.taches.forEach(function (t) { if (!d.checklist.some(function (it) { return it.libelle === t.libelle; })) d.checklist.push({ id: 'i' + C.hex(C.aleatoire(4)), libelle: t.libelle, delai: t.delaiJours }); });
        });
      }
      if (bv === 'entretien') d.entretien = { type: selEnt.value, avec: selAvec.value };
      if (bv === 'examen') d.examen = { type: typeExamen.value.trim() };
      if (parDate) {
        // Cette date seulement : champs modifiés par rapport à cette date, rangés comme réglages propres à la date
        var od = { rdv: x.id, occurrence: occurrence, service: r.service }, n0 = 0;
        ['titre', 'lieu', 'salle', 'patients', 'professionnels', 'accompagnateurs', 'consigneAccompagnateurs', 'participation', 'transports', 'validations', 'checklist'].forEach(function (k) {
          var av = k === 'participation' ? partAvant : x[k] === undefined ? (Array.isArray(d[k]) ? [] : (k === 'accompagnateurs' ? 0 : '')) : x[k];
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
      if (!nouveau && JSON.stringify(d.participation) === JSON.stringify(partAvant)) delete d.participation;
      if (!d.services.length && !(x.services || []).length) delete d.services;
      if ((d.partage || '') === (x.partage || '')) delete d.partage;
      if (partageVu) delete d.service;
      if (!nouveau && d.accompagnateurs === Math.min(20, partAvant.nombre)) delete d.accompagnateurs;
      if (nouveau && JSON.stringify(d.participation) === JSON.stringify(sansAncien(P.reglage({ participation: {} })))) delete d.participation;
      if (nouveau) ['accompagnateurs', 'consigneAccompagnateurs', 'transports', 'validations'].forEach(function (k) { if (!d[k] || (Array.isArray(d[k]) && !d[k].length)) delete d[k]; });
      if (!nouveau && Object.keys(d).length <= 2 && d.service === x.service) return true;
      // Salle : dates des 8 prochaines semaines vérifiées (conflits, salle à valider) avant d'enregistrer
      var demandesSalle = [];
      if (selSalle && selSalle.valeur() && (nouveau || selSalle.valeur() !== (x.salle || '') || d.debut !== undefined)) {
        var periodesS = (parDate || rg.type === 'aucune') ? [{ ref: 'agenda|' + (x.id || d.id) + '|' + (parDate ? occurrence : jourISO(d0)), debut: d0, fin: d1 }]
          : A.occurrences(Object.assign({}, x, d, { id: d.id }), Math.max(Date.now() - 864e5, d0 - 1), Math.max(Date.now(), d0) + 56 * 864e5).filter(function (o) { return !o.annulee; }).map(function (o) { return { ref: 'agenda|' + d.id + '|' + o.occurrence, debut: o.debut, fin: o.fin || o.debut + 36e5 }; });
        demandesSalle = U.salles.verifier({ salle: selSalle.valeur(), service: sv.value || x.service, titre: d.titre || libNature(nv, sv.value), genre: 'agenda', periodes: periodesS, exclure: 'agenda|' + d.id });
      }
      await s.enregistrer('RDV', d);
      if (demandesSalle.length) await U.salles.envoyer(demandesSalle);
      if (U.salles) U.salles.synchroniser(true);
      U.toast(nouveau ? 'Ajouté à l’agenda.' : 'Élément modifié.');
      signalerEchecs(await suivreVehicules(d.id, { dates: rg.type === 'aucune' ? [jourISO(d0)] : [], forcer: forcerVehicules }));
    } });
    if (avecSalles) {
      selSalle = U.salles.selecteur({ service: function () { return sv.value || x.service || ini.service; }, valeur: x.salle || ini.salle || '', lecture: lecture, exclure: x.id ? 'agenda|' + x.id : null,
        periode: function () { var d0 = new Date(date.value + 'T' + (hDebut.value || '00:00')).getTime(), d1 = new Date((dateFin.value || date.value) + 'T' + (hFin.value || '00:00')).getTime(); return isFinite(d0) && d1 > d0 ? [d0, d1] : null; } });
      [date, dateFin, hDebut, hFin].forEach(function (c0) { c0.addEventListener('change', function () { selSalle.maj(); }); });
      if (sv && sv.addEventListener) sv.addEventListener('change', function () { selSalle.remplir(); });
    }
    U.modale(nouveau ? 'Nouvel élément de l’agenda' : (lecture ? libelleElement(x) + (externe ? ' — ' + U.libService(x.service) : '') : (parDate ? 'Modifier le ' + occurrence.split('-').reverse().join('/') : 'Modifier l’élément')), h('div', { class: 'pile' },
      externe ? h('p', { class: 'muted', text: 'Élément de l’agenda du service ' + U.libService(x.service) + ', qui concerne un patient hospitalisé dans votre service' + (lecture ? ' : consultation et commentaires.' : '.') }) : null,
      repete && !lecture ? h('fieldset', { class: 'ag-portee' }, h('legend', { text: 'Élément répété (' + A.libelleRepetition(r.regularite) + ') : modifier' }),
        h('div', { class: 'actions gauche' }, [['date', 'cette date seulement (' + occurrence.split('-').reverse().join('/') + ')'], ['toutes', 'toutes les dates']].map(function (o) {
          var rb = h('input', { type: 'radio', name: 'portee-' + x.id, checked: portee === o[0], onchange: function () { fermerPuisAgenda(function () { modaleElement(r, jour, lecture, patientsVisibles, externe, occurrence, Object.assign({}, ini, { portee: o[0] })); }); } });
          return h('label', { class: 'case' }, rb, h('span', { text: o[1] }));
        })),
        parDate ? h('small', { class: 'muted', text: (x.annulee ? 'Date annulée' + (x.motifAnnulation ? ' : ' + x.motifAnnulation : '') + '. ' : '') + (propres.length ? 'Réglages propres à cette date : ' + propres.join(', ') + '. ' : '') + 'Patients, accompagnateurs, transports, validations, check-list, horaires et lieu se règlent pour cette date ; le type, le service et la répétition sont communs à toutes les dates.' }) :
          h('small', { class: 'muted', text: 'Les dates qui ont leurs propres réglages les gardent.' })) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', nature), h('label', {}, partageVu || autresSv.length ? 'Service organisateur' : 'Service', sv)), zoneSv,
      zoneEnt, zoneExamen, zoneAudience,
      h('label', {}, 'Intitulé', titre),
      h('div', { class: 'grille-4' }, h('label', {}, 'Jour de début', date), h('label', {}, 'Heure de début', hDebut), h('label', {}, 'Jour de fin', dateFin), h('label', {}, 'Heure de fin', hFin)),
      h('label', {}, 'Lieu', lieu),
      selSalle ? h('label', {}, 'Salle réservée', selSalle.noeud) : null,
      (function () {
        // Salle de cette date après arbitrage, ou demande en attente
        if (!x.id || !avecSalles || !occurrence) return null;
        var lib = U.salles.libelle('agenda|' + x.id + '|' + occurrence, x.salle), simple = U.salles.libelle('', x.salle);
        return lib && lib !== simple ? h('p', { class: 'info', text: 'Salle de cette date : ' + lib + '.' }) : null;
      })(),
      parDate ? null : rep.noeuds,

      barreAjout, secPatients,
      section('Quel(s) professionnel(s) ?', h('div', { class: 'pile' }, zonePro, zoneAcc)), secTransports, secVal,
      section('Check-list (à réaliser avant l’événement)', zoneCheck),
      nouveau ? null : section('Commentaires', zoneCom),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : le motif et le contenu de la prise en charge restent dans le dossier du patient.' })), boutons, { large: true });
    majNature();
  }

  function libRepetition(v) { return A.libelleRepetition(v); }
  var LIB_CHAMPS = { debut: 'horaires', lieu: 'lieu', titre: 'intitulé', patients: 'patients', professionnels: 'professionnels prévus', accompagnateurs: 'nombre de professionnels', participation: 'places et inscriptions', consigneAccompagnateurs: 'consigne des accompagnateurs', transports: 'transports', validations: 'validations', checklist: 'check-list' };
  function fermerPuisAgenda(fn) { var dlg = document.querySelector('dialog[open]'); if (dlg) dlg.dispatchEvent(new Event('cancel')); setTimeout(fn, 0); }

  // Délai d'alerte d'un point de check-list (jours avant l'événement)
  var LIB = { OCCURRENCE: 'Agenda : réglage d’une date', VALIDATION: 'Agenda : validation', TRANSPORT: 'Agenda : transport', RDV: 'Agenda : élément', COMMENTAIRE: 'Agenda : commentaire', CHECK: 'Agenda : check-list', INSCRIPTION: 'Agenda : inscription d’un professionnel', PATIENT_INSCRIT: 'Agenda : patient inscrit par un service invité', TACHE: 'Agenda : tâche du service', TACHE_EQUIPE: 'Agenda : tâche de l’équipe', TACHE_AJUSTEMENT: 'Agenda : tâche ajustée', TACHE_FAITE: 'Agenda : tâche faite', ABSENCE: 'Agenda : absence', ALERTE: 'Agenda : alerte', ALERTE_VUE: 'Agenda : alerte vue' };
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
      case 'INSCRIPTION': var ri = st().rdv[d.rdv]; return (e.by && e.by !== d.agent ? U.App.session.nomAuteur(e.by) + ' : ' : '') + (d.retrait ? 'retrait de ' : d.etat === 'propose' ? 'proposition à ' : d.etat === 'demande' ? 'demande de participation de ' : d.etat === 'refuse' ? 'refus' + (d.motif ? ' (' + d.motif + ')' : '') + ' pour ' : (d.prioritaire ? 'passage en tête de ' : 'inscription de ')) + (d.nom || U.App.session.nomAuteur(d.agent)) + ' : « ' + (ri ? libelleElement(ri) : 'élément') + ' » le ' + String(d.occurrence || '').split('-').reverse().join('/');
      case 'PATIENT_INSCRIT': var rpi = st().rdv[d.rdv]; return (d.retrait ? 'Patient retiré de « ' : 'Patient inscrit à « ') + (rpi ? libelleElement(rpi) : 'élément') + ' »' + (d.occurrence ? ' le ' + String(d.occurrence).split('-').reverse().join('/') : '') + ' : ' + nomsPatients([d.patient])[0];
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
    admin: { onglets: function () { return [['agenda-categories', 'Catégories d’événements', [panneauCategories()]], ['agenda', 'Réglages de l’agenda', [panneauReglages()]], ['agenda-services', 'Organisation par service', [I.panneauReglagesService()]]]; },
      // Réglages ouverts au cadre pour ses services : onglet « Agenda du service » de sa fenêtre Administration (0.21.0)
      cadre: function () { return [I.panneauReglagesService()]; } },
    // Onglet Informations de la messagerie (0.23.0, réglage de l'établissement) : réponses attendues, inscriptions à
    // confirmer, informations reçues
    informations: function () {
      var res = [];
      try {
        var m = mesReponses(), jourDe = function (x) { return libJour(x.debut) + ' ' + hm(x.debut); };
        m.repondre.forEach(function (x) {
          res.push({ id: 'ag-r-' + x.rdv.id + '-' + x.occurrence, niveau: 'warn', titre: 'Réponse attendue : ' + libelleElement(x.rdv) + ' — ' + jourDe(x),
            detail: x.situation.etat === 'propose' ? 'Un collègue vous propose comme accompagnateur.' : 'Vous êtes invité(e) comme accompagnateur.', ouvrir: function () { modaleElement(x.rdv, null, !peut('RDV'), null, false, x.occurrence); } });
        });
        m.confirmer.forEach(function (x) {
          res.push({ id: 'ag-c-' + x.rdv.id + '-' + x.occurrence + '-' + x.demande.agent, niveau: 'warn', titre: 'Inscription à confirmer : ' + (x.demande.nom || U.App.session.nomAuteur(x.demande.agent)) + ' — ' + libelleElement(x.rdv),
            detail: jourDe(x), ouvrir: function () { modaleElement(x.rdv, null, !peut('RDV'), null, false, x.occurrence); } });
        });
        mesAvis().forEach(function (a) {
          var r = st().rdv[a.rdv];
          if (!r) return;
          res.push({ id: 'ag-a-' + a.id, niveau: '', titre: U.App.session.nomAuteur(a.par) + ({ retrait: ' vous a désinscrit(e) : ', refus: ' a refusé votre demande : ', confirmation: ' a confirmé votre demande : ' }[a.genre || (a.retrait ? 'retrait' : '')] || ' vous a inscrit(e) : ') + libelleElement(r),
            detail: String(a.occurrence).split('-').reverse().join('/') + (a.motif ? ' — ' + a.motif : ''), ouvrir: function () { modaleElement(r, null, !peut('RDV'), null, false, a.occurrence); }, vu: function () { return marquerVus([a.id]); } });
        });
      } catch (e) { /* module illisible : rien à afficher */ }
      return res;
    },
    // Pastille de la barre des modules : informations reçues non vues
    pastille: function () { try { var m = mesReponses(); return mesAvis().length + m.repondre.length + m.confirmer.length; } catch (e) { return 0; } }
  });
  U.agenda = { evenementSortie: evenementSortie, modaleElement: modaleElement, modaleAjout: modaleAjout, sectionPatient: sectionPatient, aVenirPour: aVenirPour, suivreVehicules: suivreVehicules };
})();
