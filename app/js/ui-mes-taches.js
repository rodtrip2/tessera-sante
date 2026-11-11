// SPDX-License-Identifier: EUPL-1.2
/*
 * Mes tâches — liste de tâches personnelle de l'agent (0.26.3, lot A, décisions du porteur du 11 novembre 2026).
 *
 * Onglet « Mes tâches » de la fenêtre de l'Agenda, à côté de « Mon agenda ». Trois rubriques : mes tâches (titre,
 * échéance, heure, rappel, note courte, élément d'un autre module rattaché) ; ce que les modules me demandent (leurs
 * informations : réponses attendues, demandes à arbitrer, tâches attribuées… à traiter dans leur module ; messages qui
 * attendent) ; les tâches faites, gardées un mois à l'écran. Contenu chiffré par la clé personnelle de l'agent
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
  function disponible() { try { return !!s() && s().detientCle && s().detientCle('agenda') && s().aClePersonnelle && s().aClePersonnelle() && !s().apercu; } catch (e) { return false; } }
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
      Promise.all(manque.map(function (t) { return s().dechiffrerPersonnel(USAGE, t.chiffre).then(function (c) { cache[t.evt] = c || { illisible: true }; }); }))
        .then(function () { enCours = false; U.rendreContenu(); }, function () { enCours = false; });
    }
    return liste.filter(function (t) { return cache[t.evt]; }).map(function (t) { return Object.assign({ id: t.id, cree: t.cree, le: t.le }, cache[t.evt]); });
  }
  /** Jour du rappel d'une tâche (AAAA-MM-JJ) ou '' ; une tâche faite n'a plus de rappel. */
  function jourRappel(t) { return !t.fait && t.echeance && t.rappel !== '' && t.rappel != null && /^\d+$/.test(String(t.rappel)) ? plusJours(t.echeance, -(+t.rappel)) : ''; }
  function aRappeler(maintenant) { var auj = jourISO(maintenant || Date.now()); return taches().filter(function (t) { var r = jourRappel(t); return r && r <= auj; }); }

  // ------------------------------------------------------------ Écriture
  async function enregistrer(id, contenu) {
    var c = Object.assign({}, contenu); delete c.id; delete c.cree; delete c.le; delete c.illisible;
    await s().enregistrer('TACHE_PERSO', { id: id, agent: moi().id, chiffre: await s().chiffrerPersonnel(USAGE, c) });
  }
  async function retirer(t) { await s().enregistrer('TACHE_PERSO', { id: t.id, agent: moi().id, supprime: true }); }
  async function cocher(t, fait) {
    try { await enregistrer(t.id, Object.assign({}, t, { fait: fait, faitLe: fait ? new Date().toISOString() : '' })); U.toast(fait ? 'Tâche faite.' : 'Tâche remise à faire.'); }
    catch (e) { alert(e.message); }
  }

  function modaleTache(t, init) {
    var nouveau = !t;
    t = t || Object.assign({ titre: '', echeance: '', heure: '', rappel: '', note: '', element: null }, init || {});
    var titre = h('input', { type: 'text', maxlength: 150, value: t.titre || '', 'aria-label': 'Tâche' });
    var ech = h('input', { type: 'date', value: t.echeance || '', 'aria-label': 'Échéance' }), heure = h('input', { type: 'time', step: 300, value: t.heure || '', 'aria-label': 'Heure' });
    var rappel = h('select', { 'aria-label': 'Rappel' }, RAPPELS.map(function (x) { return h('option', { value: x[0], text: x[1], selected: String(t.rappel == null ? '' : t.rappel) === x[0] }); }));
    var note = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Note' }); note.value = t.note || '';
    if (nouveau && U.dernierChoix) U.dernierChoix('taches.rappel', rappel, !(init && init.rappel));
    var element = t.element || null, zoneE = h('div', { class: 'pile' });
    function majElement() {
      U.vider(zoneE);
      if (element && U.messagerie && U.messagerie.ligneRattache) zoneE.appendChild(U.messagerie.ligneRattache(element, function () { element = null; majElement(); }));
      else if (U.messagerie && U.messagerie.modaleRattacher) zoneE.appendChild(h('div', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { U.messagerie.modaleRattacher(function (r) { element = r; majElement(); }); } }, '+ Rattacher un élément d’un module')));
    }
    majElement();
    U.modale(nouveau ? 'Nouvelle tâche' : 'Modifier la tâche', h('div', { class: 'pile' },
      h('label', {}, 'Tâche', titre),
      h('div', { class: 'grille-2' }, h('label', {}, 'Échéance (facultatif)', ech), h('label', {}, 'Heure (facultatif)', heure)),
      h('label', {}, 'Rappel (dans l’onglet Informations et la pastille de l’Agenda)', rappel),
      (U.plusOptions || function (o) { return h('div', { class: 'pile' }, [].slice.call(arguments, 1)); })(!!(t.note || t.element), h('label', {}, 'Note (facultatif ; aucune donnée clinique)', note),
        h('h3', { text: 'Élément rattaché' }), zoneE),
      h('small', { class: 'muted', text: 'Votre liste est chiffrée par votre clé personnelle : personne d’autre ne la lit, administrateur compris. Pour confier une tâche à un collègue, envoyez-lui un message avec l’élément rattaché.' })),
    [{ texte: 'Annuler' }, nouveau ? null : { texte: 'Retirer', classe: 'danger', action: async function () { if (!confirm('Retirer cette tâche de votre liste ?')) return false; await retirer(t); U.toast('Tâche retirée.'); } },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        if (!titre.value.trim()) { titre.focus(); throw new Error('Indiquez la tâche.'); }
        if (rappel.value && !ech.value) throw new Error('Un rappel demande une échéance.');
        await enregistrer(t.id || 'TP' + C.hex(C.aleatoire(6)), { titre: titre.value.trim(), echeance: ech.value, heure: heure.value, rappel: rappel.value, note: note.value.trim(), element: element, fait: !!t.fait, faitLe: t.faitLe || '' });
        U.toast(nouveau ? 'Ajouté à votre liste.' : 'Tâche enregistrée.');
      } }].filter(Boolean), { focus: nouveau ? titre : null });
  }

  // ------------------------------------------------------------ Vue
  function ligneTache(t) {
    var auj = jourISO(Date.now()), retard = !t.fait && t.echeance && t.echeance < auj, rap = jourRappel(t);
    var cb = h('input', { type: 'checkbox', checked: !!t.fait, 'aria-label': (t.fait ? 'Remettre à faire : ' : 'Faite : ') + (t.titre || ''), onchange: function () { cocher(t, cb.checked); } });
    return h('li', { class: 'mt-tache' + (t.fait ? ' faite' : '') + (retard ? ' retard' : '') },
      cb,
      h('div', { class: 'mt-corps' },
        h('button', { class: 'btn lien mt-titre', type: 'button', onclick: function () { modaleTache(t); } }, t.illisible ? 'Tâche illisible (clé personnelle renouvelée)' : t.titre || '(sans titre)'),
        h('small', { class: 'muted', text: [t.echeance ? 'Échéance ' + jourFr(t.echeance) + (t.heure ? ' à ' + t.heure : '') : '', retard ? 'en retard' : '', rap && !t.fait ? 'rappel le ' + jourFr(rap) : '', t.fait && t.faitLe ? 'faite le ' + U.date(Date.parse(t.faitLe)).slice(0, 10) : ''].filter(Boolean).join(' · ') }),
        t.note ? h('div', { class: 'mt-note', text: t.note }) : null,
        t.element && U.messagerie && U.messagerie.ligneRattache ? U.messagerie.ligneRattache(t.element) : null));
  }
  /** Ce que les modules demandent à l'agent : leurs informations (traitées dans leur module), messages qui attendent. */
  function demandes() {
    var res = [];
    SIC.modules.liste().forEach(function (m) {
      var f = m.interface && m.interface.informations;
      if (typeof f !== 'function' || !s().detientCle || !s().detientCle(m.id)) return;
      try { (f({ sansPerso: true }) || []).forEach(function (i) { res.push(Object.assign({ module: m.id, libModule: m.libelle }, i)); }); } catch (e) { /* module sans informations */ }
    });
    try {
      var ms = SIC.modules.obtenir('messagerie'), n = ms && ms.interface && ms.interface.pastille && s().detientCle('messagerie') ? ms.interface.pastille() : 0;
      if (n) res.unshift({ id: 'mt-messagerie', module: 'messagerie', libModule: 'Messagerie', niveau: 'warn', titre: n + ' message' + (n > 1 ? 's' : '') + ' ou information' + (n > 1 ? 's' : '') + ' vous attendent', ouvrir: function () { U.ouvrirFenetre('messagerie'); } });
    } catch (e) { /* sans messagerie */ }
    return res;
  }
  function vueMesTaches() {
    if (!disponible()) return h('section', { class: 'panneau' }, h('h2', { text: 'Mes tâches' }), h('p', { class: 'muted', text: s().apercu ? 'Aperçu de l’affichage d’un rôle : la liste personnelle n’est pas affichée.' : 'Votre liste demande votre clé personnelle : reconnectez-vous avec votre propre compte.' }));
    var toutes = taches(), auj = jourISO(Date.now()), limite = Date.now() - GARDE_FAITES * J;
    var aFaire = toutes.filter(function (t) { return !t.fait; }).sort(function (a, b) { return (a.echeance || '9999') < (b.echeance || '9999') ? -1 : (a.echeance || '9999') > (b.echeance || '9999') ? 1 : String(a.heure || '').localeCompare(String(b.heure || '')) || String(a.cree).localeCompare(String(b.cree)); });
    var faites = toutes.filter(function (t) { return t.fait && (vueFaites || Date.parse(t.faitLe || t.le) >= limite); }).sort(function (a, b) { return String(b.faitLe || '').localeCompare(String(a.faitLe || '')); });
    var dm = demandes();
    var aujourdhui = aFaire.filter(function (t) { return t.echeance && t.echeance <= auj; }).length;
    return h('div', { class: 'pile' },
      h('section', { class: 'panneau' },
        h('div', { class: 'barre' }, h('h2', { text: 'Mes tâches' + (aFaire.length ? ' (' + aFaire.length + ')' : '') }), h('div', { class: 'espace' }),
          h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleTache(null); } }, '+ Tâche')),
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
    setTimeout(function () { modaleTache(null, { titre: titre || '', element: { module: module, genre: genre, id: id, service: service || '' } }); }, 0);
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
  U.mesTaches = { demandes: demandes, bouton: bouton, boutonModale: boutonModale, nouvelle: function (init) { modaleTache(null, init); }, taches: taches, aRappeler: aRappeler, jourRappel: jourRappel };
})();
