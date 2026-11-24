// SPDX-License-Identifier: EUPL-1.2
/*
 * Mes tâches — liste de tâches personnelle de l'agent (0.26.3, lot A, décisions du porteur du 11 novembre 2026).
 *
 * Onglet « Mes tâches » de la fenêtre de l'Agenda, à côté de « Mon agenda ». Trois rubriques : mes tâches (titre,
 * échéance, heure, rappel, note courte, élément d'un autre module rattaché) ; ce que les modules me demandent (leurs
 * informations : réponses attendues, demandes à arbitrer, tâches attribuées… à traiter dans leur module ; messages qui
 * attendent) ; les tâches faites, gardées un mois à l'écran. Contenu chiffré par la clé de liste de l'agent (trousseau, 0.26.5)
 * (session.chiffrerPersonnel) : personne d'autre ne le lit, administrateur compris ; le journal de l'Agenda ne garde
 * qu'une saisie opaque (`TACHE_PERSO`). Confier une tâche passe par la messagerie (message avec l'élément rattaché).
 * Rappels : onglet Informations de la messagerie et pastille de l'Agenda. « + Ma liste » depuis un élément d'un module.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto;
  var J = 864e5, USAGE = 'taches', GARDE_FAITES = 30;
  var RAPPELS = [['', 'Pas de rappel'], ['0', 'Le jour de l’échéance'], ['1', 'La veille'], ['2', '2 jours avant'], ['7', 'Une semaine avant']];
  var cache = {}, enCours = false, vueFaites = false;

  function s() { return U.App.session; }
  function st() { try { return s().etatModule('agenda'); } catch (e) { return null; } }
  function moi() { return s().compteEffectif(); }
  function disponible() { try { return !!s() && s().ouvert && s().ouvert('agenda') && s().aClePersonnelle && s().aClePersonnelle() && !s().apercu; } catch (e) { return false; } }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function plusJours(j, n) { var p = j.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return jourISO(d.getTime()); }
  function jourFr(j) { return j ? j.split('-').reverse().join('/') : ''; }

  // ------------------------------------------------------------ Lecture (déchiffrement en mémoire)
  /** Tâches de l'agent déchiffrées : [{ id, cree, le, …contenu }] ; déchiffre en arrière-plan ce qui manque. */
  function taches() {
    var e = st();
    if (!e || !A.tachesPerso || !disponible()) return [];
    var liste = A.tachesPerso(e, moi().id), manque = liste.filter(function (t) { return !cache[t.evt]; });
    if (manque.length && !enCours) {
      enCours = true;
      var anciennes = [];
      Promise.all(manque.map(function (t) { return s().dechiffrerPersonnel(USAGE, t.chiffre).then(function (c) { cache[t.evt] = c || { illisible: true }; if (c && s().formatPersonnelAncien(t.chiffre)) anciennes.push({ id: t.id, c: c }); }); }))
        // Ancien format (0.26.3, clé dérivée de la clé personnelle) : réenregistrée avec la clé de liste du trousseau (0.26.5)
        .then(async function () { for (var i = 0; i < anciennes.length; i++) { try { await enregistrer(anciennes[i].id, anciennes[i].c); } catch (e) { /* reprise à la prochaine ouverture */ } } })
        .then(function () { enCours = false; U.rendreContenu(); }, function () { enCours = false; });
    }
    return liste.filter(function (t) { return cache[t.evt]; }).map(function (t) { return elementsDe(Object.assign({ id: t.id, cree: t.cree, le: t.le }, cache[t.evt])); }).concat(partagees());
  }
  /** Éléments liés d'une tâche : plusieurs depuis le 23 novembre 2026 (`elements`), un seul auparavant (`element`). */
  function elementsDe(t) { var l = Array.isArray(t.elements) ? t.elements : t.element ? [t.element] : []; t.elements = l.filter(Boolean).slice(0, A.MAX_LIENS || 20); delete t.element; return t; }
  /**
   * Tâches partagées (23 novembre 2026) : contenu chiffré pour la clé de liste de chaque participant (enveloppe), lu par
   * eux seuls ; les participants sont connus de l'Agenda (saisie `TACHE_PARTAGEE`).
   */
  var cacheP = {}, enCoursP = false;
  function partagees() {
    var e = st();
    if (!e || !A.tachesPartagees || !disponible()) return [];
    var l = A.tachesPartagees(e, moi().id), manque = l.filter(function (t) { return !cacheP[t.evt]; });
    if (manque.length && !enCoursP) {
      enCoursP = true;
      Promise.all(manque.map(function (t) { return s().ouvrirEnveloppe('tache:' + t.id, t.env).then(function (c) { cacheP[t.evt] = c || { illisible: true }; }, function () { cacheP[t.evt] = { illisible: true }; }); }))
        .then(function () { enCoursP = false; U.rendreContenu(); }, function () { enCoursP = false; });
    }
    return l.filter(function (t) { return cacheP[t.evt]; }).map(function (t) { return elementsDe(Object.assign({ id: t.id, cree: t.cree, le: t.le, partagee: true, participants: t.participants.slice(), auteur: t.auteur, par: t.par }, cacheP[t.evt])); });
  }
  function nomCompte(id) { var c = (s().comptes || []).filter(function (x) { return x.id === id; })[0]; return id === moi().id ? 'vous' : c ? c.nom : (s().nomAuteur ? s().nomAuteur(id) : id); }
  /** Agents avec qui partager une tâche : comptes actifs dont la clé de liste existe. */
  function partageables() { return (s().comptes || []).filter(function (c) { return c.id !== 'secours' && c.id !== moi().id && c.actif !== false && !s().clesEnveloppeManquantes(['t-a.' + c.id]).length; }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); }); }
  /** Jour du rappel d'une tâche (AAAA-MM-JJ) ou '' ; une tâche faite n'a plus de rappel. */
  function jourRappel(t) { return !t.fait && t.echeance && t.rappel !== '' && t.rappel != null && /^\d+$/.test(String(t.rappel)) ? plusJours(t.echeance, -(+t.rappel)) : ''; }
  function aRappeler(maintenant) { var auj = jourISO(maintenant || Date.now()); return taches().filter(function (t) { var r = jourRappel(t); return r && r <= auj; }); }

  // ------------------------------------------------------------ Écriture
  function nettoyer(contenu) { var c = Object.assign({}, contenu); ['id', 'cree', 'le', 'illisible', 'partagee', 'participants', 'auteur', 'par'].forEach(function (k) { delete c[k]; }); if (c.elements) c.elements = A.liens ? A.liens(c.elements) : c.elements; return c; }
  async function enregistrer(id, contenu) {
    if (/^TS/.test(id)) return enregistrerPartagee(id, contenu.participants, contenu);
    await s().enregistrer('TACHE_PERSO', { id: id, agent: moi().id, chiffre: await s().chiffrerPersonnel(USAGE, nettoyer(contenu)) });
  }
  async function enregistrerPartagee(id, participants, contenu) {
    var ps = [moi().id].concat((participants || []).filter(function (x) { return x !== moi().id; })).filter(function (x, i, l) { return l.indexOf(x) === i; });
    var env = await s().chiffrerEnveloppe('tache:' + id, ps.map(function (x) { return 't-a.' + x; }), nettoyer(contenu));
    await s().enregistrer('TACHE_PARTAGEE', { id: id, participants: ps, env: env });
  }
  async function retirer(t) {
    if (t.partagee) {
      // Quitter une tâche partagée : elle reste aux autres participants ; dernier participant : retirée
      var reste = t.participants.filter(function (x) { return x !== moi().id; });
      if (reste.length >= 2) await s().enregistrer('TACHE_PARTAGEE', { id: t.id, participants: reste, env: await s().chiffrerEnveloppe('tache:' + t.id, reste.map(function (x) { return 't-a.' + x; }), nettoyer(t)) });
      else await s().enregistrer('TACHE_PARTAGEE', { id: t.id, participants: t.participants, supprime: true });
      return;
    }
    await s().enregistrer('TACHE_PERSO', { id: t.id, agent: moi().id, supprime: true });
  }
  async function cocher(t, fait) {
    try { await enregistrer(t.id, Object.assign({}, t, { fait: fait, faitLe: fait ? new Date().toISOString() : '', faitPar: fait ? moi().nom : '' })); U.toast(fait ? 'Tâche faite' + (t.partagee ? ' (pour tous les participants).' : '.') : 'Tâche remise à faire.'); }
    catch (e) { SIC.ui.alerte(e.message); }
  }

  function modaleTache(t, init) {
    var nouveau = !t;
    t = elementsDe(t || Object.assign({ titre: '', echeance: '', heure: '', rappel: '', note: '', elements: [] }, init || {}));
    var titre = h('input', { type: 'text', maxlength: 150, value: t.titre || '', 'aria-label': 'Tâche' });
    var ech = h('input', { type: 'date', value: t.echeance || '', 'aria-label': 'Échéance' }), heure = h('input', { type: 'time', step: 300, value: t.heure || '', 'aria-label': 'Heure' });
    var rappel = h('select', { 'aria-label': 'Rappel' }, RAPPELS.map(function (x) { return h('option', { value: x[0], text: x[1], selected: String(t.rappel == null ? '' : t.rappel) === x[0] }); }));
    var note = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Note' }); note.value = t.note || '';
    if (nouveau && U.dernierChoix) U.dernierChoix('taches.rappel', rappel, !(init && init.rappel));
    var elements = t.elements.slice(), zoneE = h('div', { class: 'pile' });
    function majElement() {
      U.vider(zoneE);
      if (U.messagerie && U.messagerie.ligneRattache) elements.forEach(function (x, i) { zoneE.appendChild(U.messagerie.ligneRattache(x, function () { elements.splice(i, 1); majElement(); })); });
      if (U.messagerie && U.messagerie.modaleRattacher && elements.length < (A.MAX_LIENS || 20)) zoneE.appendChild(h('div', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { U.messagerie.modaleRattacher(function (r) { if (!elements.some(function (y) { return y.module === r.module && y.id === r.id && !y.ancre && !y.page; })) elements.push(r); majElement(); }); } }, '+ Lier un élément d’un module')));
    }
    majElement();
    // Partage (23 novembre 2026) : la tâche devient commune aux participants choisis
    var participants = (t.participants || []).filter(function (x) { return x !== moi().id; }), zoneP = h('div', { class: 'pile' }), selP = h('select', { 'aria-label': 'Partager avec' });
    function majP() {
      U.vider(zoneP);
      if (participants.length) zoneP.appendChild(h('div', { class: 'actions gauche' }, participants.map(function (x, i) { return h('span', { class: 'ms-dest' }, nomCompte(x), h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer ' + nomCompte(x), onclick: function () { participants.splice(i, 1); majP(); } }, '✕')); })));
      U.vider(selP).appendChild(h('option', { value: '', text: 'Ajouter un participant…' }));
      partageables().filter(function (c) { return participants.indexOf(c.id) < 0; }).forEach(function (c) { selP.appendChild(h('option', { value: c.id, text: c.nom })); });
      zoneP.appendChild(selP);
    }
    selP.addEventListener('change', function () { if (selP.value) { participants.push(selP.value); majP(); } });
    majP();
    U.modale(nouveau ? 'Nouvelle tâche' : 'Modifier la tâche', h('div', { class: 'pile' },
      h('label', {}, 'Tâche', titre),
      h('div', { class: 'grille-2' }, h('label', {}, 'Échéance (facultatif)', ech), h('label', {}, 'Heure (facultatif)', heure)),
      h('label', {}, 'Rappel (dans l’onglet Informations et la pastille de l’Agenda)', rappel),
      (U.plusOptions || function (o) { return h('div', { class: 'pile' }, [].slice.call(arguments, 1)); })(!!(t.note || t.elements.length), h('label', {}, 'Note (facultatif ; aucune donnée clinique)', note),
        h('h3', { text: 'Éléments liés' }), zoneE),
      h('fieldset', { class: 'pile' }, h('legend', { text: 'Partager la tâche' }), zoneP,
        h('small', { class: 'muted', text: 'Partagée, la tâche est chiffrée pour vous et les participants seuls : chacun la voit dans ses tâches, la modifie et la coche faite pour tous. Les autres agents de l’Agenda savent seulement qu’une tâche réunit ces personnes.' })),
      h('small', { class: 'muted', text: 'Votre liste est chiffrée par votre clé de liste, remise à vous seul : l’application ne l’ouvre pour personne d’autre, administrateur compris, et elle reste lisible après un mot de passe oublié. Pour confier une tâche à un collègue, envoyez-lui un message avec l’élément rattaché.' })),
    [{ texte: 'Annuler' }, nouveau ? null : { texte: t.partagee ? 'Quitter' : 'Retirer', classe: 'danger', action: async function () { if (!await SIC.ui.confirmer(t.partagee ? 'Quitter cette tâche partagée ? Elle reste aux autres participants.' : 'Retirer cette tâche de votre liste ?')) return false; await retirer(t); U.toast(t.partagee ? 'Vous avez quitté la tâche.' : 'Tâche retirée.'); } },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        if (!titre.value.trim()) { titre.focus(); throw new Error('Indiquez la tâche.'); }
        if (rappel.value && !ech.value) throw new Error('Un rappel demande une échéance.');
        var c = { titre: titre.value.trim(), echeance: ech.value, heure: heure.value, rappel: rappel.value, note: note.value.trim(), elements: elements, fait: !!t.fait, faitLe: t.faitLe || '', faitPar: t.faitPar || '' };
        if (participants.length) {
          var idP = t.partagee ? t.id : 'TS' + C.hex(C.aleatoire(6));
          await enregistrerPartagee(idP, participants, c);
          if (t.id && !t.partagee) await s().enregistrer('TACHE_PERSO', { id: t.id, agent: moi().id, supprime: true });
          U.toast('Tâche partagée avec ' + participants.map(nomCompte).join(', ') + '.');
        } else if (t.partagee) {
          // Plus aucun autre participant : la tâche redevient personnelle
          await enregistrer('TP' + C.hex(C.aleatoire(6)), c);
          await s().enregistrer('TACHE_PARTAGEE', { id: t.id, participants: t.participants, supprime: true });
          U.toast('Tâche gardée dans votre seule liste.');
        } else {
          await enregistrer(t.id || 'TP' + C.hex(C.aleatoire(6)), c);
          U.toast(nouveau ? 'Ajouté à votre liste.' : 'Tâche enregistrée.');
        }
      } }].filter(Boolean), { focus: nouveau ? titre : null });
  }

  // ------------------------------------------------------------ Vue
  function ligneTache(t) {
    var auj = jourISO(Date.now()), retard = !t.fait && t.echeance && t.echeance < auj, rap = jourRappel(t);
    var cb = h('input', { type: 'checkbox', checked: !!t.fait, 'aria-label': (t.fait ? 'Remettre à faire : ' : 'Faite : ') + (t.titre || ''), onchange: function () { cocher(t, cb.checked); } });
    return h('li', { class: 'mt-tache' + (t.fait ? ' faite' : '') + (retard ? ' retard' : '') },
      cb,
      h('div', { class: 'mt-corps' },
        h('button', { class: 'btn lien mt-titre', type: 'button', onclick: function () { modaleTache(t); } }, t.illisible ? 'Tâche illisible' : t.titre || '(sans titre)'),
        t.partagee ? h('small', { class: 'mt-partagee', text: 'Partagée avec ' + t.participants.filter(function (x) { return x !== moi().id; }).map(nomCompte).join(', ') }) : null,
        h('small', { class: 'muted', text: [t.echeance ? 'Échéance ' + jourFr(t.echeance) + (t.heure ? ' à ' + t.heure : '') : '', retard ? 'en retard' : '', rap && !t.fait ? 'rappel le ' + jourFr(rap) : '', t.fait && t.faitLe ? 'faite le ' + U.date(Date.parse(t.faitLe)).slice(0, 10) + (t.partagee && t.faitPar ? ' par ' + t.faitPar : '') : ''].filter(Boolean).join(' · ') }),
        t.note ? h('div', { class: 'mt-note', text: t.note }) : null,
        U.messagerie && U.messagerie.ligneRattache ? t.elements.map(function (x) { return U.messagerie.ligneRattache(x); }) : null));
  }
  /** Ce que les modules demandent à l'agent : leurs informations (traitées dans leur module), messages qui attendent. */
  function demandes() {
    var res = [];
    SIC.modules.liste().forEach(function (m) {
      var f = m.interface && m.interface.informations;
      if (typeof f !== 'function' || !s().ouvert || !s().ouvert(m.id)) return;
      try { (f({ sansPerso: true }) || []).forEach(function (i) { res.push(Object.assign({ module: m.id, libModule: m.libelle }, i)); }); } catch (e) { /* module sans informations */ }
    });
    try {
      var ms = SIC.modules.obtenir('messagerie'), n = ms && ms.interface && ms.interface.pastille && s().ouvert('messagerie') ? ms.interface.pastille() : 0;
      if (n) res.unshift({ id: 'mt-messagerie', module: 'messagerie', libModule: 'Messagerie', niveau: 'warn', titre: n + ' message' + (n > 1 ? 's' : '') + ' ou information' + (n > 1 ? 's' : '') + ' vous attendent', ouvrir: function () { U.ouvrirFenetre('messagerie'); } });
    } catch (e) { /* sans messagerie */ }
    return res;
  }
  function vueMesTaches() {
    if (!disponible()) return h('section', { class: 'panneau' }, h('h2', { text: 'Mes tâches' }), h('p', { class: 'muted', text: s().apercu ? 'Aperçu de l’affichage d’un rôle : la liste personnelle n’est pas affichée.' : 'Votre liste demande votre clé de liste : elle est créée à la prochaine connexion de l’administrateur (ou reconnectez-vous avec votre propre compte).' }));
    var toutes = taches(), auj = jourISO(Date.now()), limite = Date.now() - GARDE_FAITES * J;
    var aFaire = toutes.filter(function (t) { return !t.fait; }).sort(function (a, b) { return (a.echeance || '9999') < (b.echeance || '9999') ? -1 : (a.echeance || '9999') > (b.echeance || '9999') ? 1 : String(a.heure || '').localeCompare(String(b.heure || '')) || String(a.cree).localeCompare(String(b.cree)); });
    var faites = toutes.filter(function (t) { return t.fait && (vueFaites || Date.parse(t.faitLe || t.le) >= limite); }).sort(function (a, b) { return String(b.faitLe || '').localeCompare(String(a.faitLe || '')); });
    var dm = demandes();
    var aujourdhui = aFaire.filter(function (t) { return t.echeance && t.echeance <= auj; }).length;
    return h('div', { class: 'pile' },
      h('section', { class: 'panneau' },
        h('div', { class: 'barre' }, h('h2', { text: 'Mes tâches' + (aFaire.length ? ' (' + aFaire.length + ')' : '') }), h('div', { class: 'espace' }),
          U.synchroCaldav ? U.synchroCaldav.bouton() : null,
          h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleTache(null); } }, '+ Tâche')),
        U.synchroCaldav ? U.synchroCaldav.etatAffiche() : null,
        aujourdhui ? h('p', { class: 'info', text: aujourdhui + ' tâche' + (aujourdhui > 1 ? 's' : '') + ' pour aujourd’hui ou en retard.' }) : null,
        enCours && !toutes.length ? h('p', { class: 'muted', text: 'Ouverture de votre liste…' }) : aFaire.length ? h('ul', { class: 'mt-liste' }, aFaire.map(ligneTache)) : h('p', { class: 'muted', text: 'Rien à faire dans votre liste. « + Tâche », ou « + Ma liste » depuis un événement, une demande, une fiche…' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Ce que les modules vous demandent' + (dm.length ? ' (' + dm.length + ')' : '') }),
        h('p', { class: 'muted', text: 'À traiter dans leur module : le bouton « Ouvrir » y mène.' }),
        dm.length ? h('ul', { class: 'mt-liste' }, dm.map(function (i) {
          return h('li', { class: 'mt-demande ' + (i.niveau || '') }, h('span', { class: 'ms-module ms-module-' + i.module, text: i.libModule }),
            h('div', { class: 'mt-corps' }, h('b', { text: i.titre }), i.detail ? h('small', { class: 'muted', text: i.detail }) : null),
            i.ouvrir ? h('button', { class: 'btn petit', type: 'button', onclick: function () { i.ouvrir(); } }, 'Ouvrir') : null);
        })) : h('p', { class: 'muted', text: 'Rien ne vous attend dans les modules.' })),
      h('section', { class: 'panneau' },
        h('div', { class: 'barre' }, h('h2', { text: 'Faites' + (vueFaites ? '' : ' (' + GARDE_FAITES + ' derniers jours)') }), h('div', { class: 'espace' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { vueFaites = !vueFaites; U.rendreContenu(); } }, vueFaites ? 'Les 30 derniers jours' : 'Toutes')),
        faites.length ? h('ul', { class: 'mt-liste' }, faites.map(ligneTache)) : h('p', { class: 'muted', text: 'Aucune tâche faite.' })));
  }

  // ------------------------------------------------------------ Boutons « + Ma liste » et rappels
  function ajouter(module, genre, id, service, titre) {
    var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel'));
    setTimeout(function () { modaleTache(null, { titre: titre || '', elements: [{ module: module, genre: genre, id: id, service: service || '' }] }); }, 0);
  }
  function bouton(module, genre, id, service, titre) { return disponible() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { ajouter(module, genre, id, service, titre); } }, '+ Ma liste') : null; }
  function boutonModale(module, genre, id, service, titre) { return disponible() ? { texte: '+ Ma liste', action: function () { ajouter(module, genre, id, service, titre); return false; } } : null; }

  var ag = SIC.modules.obtenir('agenda'), avant = ag && ag.interface ? { informations: ag.interface.informations, pastille: ag.interface.pastille } : {};
  SIC.modules.completerInterface('agenda', {
    vues: Object.assign({}, (ag && ag.interface && ag.interface.vues) || {}, { 'mes-taches': vueMesTaches }),
    // Rappels de Mes tâches : ajoutés aux informations de l'Agenda (onglet Informations) et à sa pastille
    informations: function (o) {
      var res = [];
      try { res = avant.informations ? avant.informations(o) || [] : []; } catch (e) { res = []; }
      if (o && o.sansPerso) return res;
      try { aRappeler().forEach(function (t) { res.push({ id: 'mt-' + t.id + '-' + (t.echeance || ''), niveau: t.echeance < jourISO(Date.now()) ? 'warn' : '', titre: 'Ma tâche : ' + t.titre, detail: 'Échéance ' + jourFr(t.echeance) + (t.heure ? ' à ' + t.heure : ''), ouvrir: function () { U.ouvrirFenetre('agenda'); U.App.onglet = 'mes-taches'; U.rendreContenu(); } }); }); } catch (e) { /* sans rappel */ }
      return res;
    },
    pastille: function () { var n = 0; try { n = avant.pastille ? avant.pastille() || 0 : 0; } catch (e) { n = 0; } try { n += aRappeler().length; } catch (e) { /* sans rappel */ } return n; }
  });
  /** Tâches de la liste rattachées à un élément (lot I, 14 novembre 2026 : l'élément affiche ses tâches). */
  function liees(module, id) { return taches().filter(function (t) { return t.elements.some(function (x) { return x.module === module && x.id === id; }); }); }
  /** Ajoute un élément à une tâche existante (personnelle ou partagée). */
  async function lierA(t, element) {
    var l = t.elements.slice();
    if (l.length >= (A.MAX_LIENS || 20)) throw new Error('Vingt éléments liés au plus par tâche.');
    l.push(element);
    await enregistrer(t.id, Object.assign({}, t, { elements: l }));
  }
  /** Rappel discret sur un élément : ses tâches, faites ou à faire ; null sans tâche. */
  function rappelElement(module, id) {
    var l = liees(module, id);
    if (!l.length) return null;
    return h('div', { class: 'taches-liees' }, l.map(function (t) {
      return h('button', { class: 'btn lien petit' + (t.fait ? ' fait' : ''), type: 'button', title: 'Ouvrir la tâche', onclick: function (ev) { ev.stopPropagation(); modaleTache(t); } },
        (t.fait ? '✓ Tâche faite : ' : '☐ Tâche : ') + t.titre + (t.echeance && !t.fait ? ' (échéance ' + t.echeance.split('-').reverse().join('/') + ')' : ''));
    }));
  }
  /**
   * Toutes les tâches de l'agent, personnelles et partagées, une fois déchiffrées (synchronisation avec l'agenda de la
   * messagerie, 24 novembre 2026) : les tâches faites depuis plus de 30 jours sont laissées de côté.
   */
  async function chargees() {
    var e = st();
    if (!e || !disponible()) return [];
    await Promise.all(A.tachesPerso(e, moi().id).filter(function (t) { return !cache[t.evt]; }).map(function (t) { return s().dechiffrerPersonnel(USAGE, t.chiffre).then(function (c) { cache[t.evt] = c || { illisible: true }; }, function () { cache[t.evt] = { illisible: true }; }); }));
    await Promise.all(A.tachesPartagees(e, moi().id).filter(function (t) { return !cacheP[t.evt]; }).map(function (t) { return s().ouvrirEnveloppe('tache:' + t.id, t.env).then(function (c) { cacheP[t.evt] = c || { illisible: true }; }, function () { cacheP[t.evt] = { illisible: true }; }); }));
    var limite = Date.now() - GARDE_FAITES * J;
    return taches().filter(function (t) { return !t.illisible && (!t.fait || Date.parse(t.faitLe || t.le) >= limite); });
  }
  var pourSynchro = {
    lister: chargees,
    enregistrer: function (id, c) { return enregistrer(id, c); },
    creer: async function (c) { var id = 'TP' + C.hex(C.aleatoire(6)); await enregistrer(id, c); return id; },
    retirer: async function (id) { var t = taches().filter(function (x) { return x.id === id; })[0]; if (t) await retirer(t); }
  };
  U.mesTaches = { disponible: disponible, liees: liees, rappelElement: rappelElement, demandes: demandes, bouton: bouton, boutonModale: boutonModale, nouvelle: function (init) { modaleTache(null, init); }, ouvrir: function (t) { modaleTache(t); }, lierA: lierA, partageables: partageables, nomCompte: nomCompte, taches: taches, aRappeler: aRappeler, jourRappel: jourRappel, pourSynchro: pourSynchro };
})();
