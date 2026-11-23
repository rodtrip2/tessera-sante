// SPDX-License-Identifier: EUPL-1.2
/*
 * Liens entre un document et les tâches ou événements de l'agenda (23 novembre 2026, demande du porteur).
 *
 * Depuis un document : le passage sélectionné (texte), les cases sélectionnées (tableur), une page (fichier joint PDF) ou
 * le document entier est lié à une tâche (personnelle, partagée, de l'équipe ou du service) ou à un événement de
 * l'agenda, nouveau ou existant. Le passage reçoit un repère dans le document ; la tâche ou l'événement garde un lien
 * (document, repère ou page, libellé court choisi par l'agent), jamais le texte du passage. Chacun ne voit que ce qu'il
 * peut déjà lire : un lien vers un document qui ne lui est pas partagé s'affiche « accès réservé ».
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h;
  function s() { return U.App.session; }
  function A() { return SIC.agenda; }
  function agendaOuvert() { try { return !!s().ouvert && s().ouvert('agenda'); } catch (e) { return false; } }
  function stA() { try { return agendaOuvert() ? s().etatModule('agenda') : null; } catch (e) { return null; } }
  function peut(t) { try { return !!s().peut(t); } catch (e) { return false; } }
  function mesServices() { return U.services().map(function (v) { return v.code; }); }
  function memeCible(x, el) { return x && el && x.module === el.module && x.id === el.id && (x.ancre || '') === (el.ancre || '') && (+x.page || 0) === (+el.page || 0); }
  function jourFr(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

  /** Liste d'éléments liés modifiable : { el, valeur() }. Ajout par le choix d'un élément d'un module. */
  function zone(liste, modifiable) {
    var l = (liste || []).slice(), el = h('div', { class: 'pile liens-zone' });
    function dessiner() {
      U.vider(el);
      if (!l.length) el.appendChild(h('p', { class: 'muted', text: 'Aucun élément lié.' }));
      l.forEach(function (x, i) { el.appendChild(U.messagerie && U.messagerie.ligneRattache ? U.messagerie.ligneRattache(x, modifiable ? function () { l.splice(i, 1); dessiner(); } : null) : h('p', { text: x.module + ' : ' + x.id })); });
      if (modifiable && U.messagerie && U.messagerie.modaleRattacher && l.length < (A().MAX_LIENS || 20)) el.appendChild(h('div', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { U.messagerie.modaleRattacher(function (r) { if (!l.some(function (y) { return memeCible(y, r); })) l.push(r); dessiner(); }); } }, '+ Lier un élément d’un module')));
    }
    dessiner();
    return { el: el, valeur: function () { return A().liens(l); } };
  }
  /** Bouton compact « Liens (n) » qui ouvre la liste des éléments liés (vue de l'agenda). */
  function bouton(liste) {
    var l = A().liens(liste);
    if (!l.length) return null;
    return h('button', { class: 'btn lien petit liens-bouton', type: 'button', title: 'Éléments liés', onclick: function (ev) { ev.stopPropagation(); U.modale('Éléments liés', zone(l, false).el, [{ texte: 'Fermer' }]); } }, '🔗 ' + l.length);
  }

  // ------------------------------------------------------------ Cibles : tâches et événements où lier
  function tachesPerso() { try { return U.mesTaches && U.mesTaches.disponible() ? U.mesTaches.taches().filter(function (t) { return !t.fait && !t.illisible; }) : []; } catch (e) { return []; } }
  /** Tâches de l'équipe et du service modifiables par l'agent, dans ses services. */
  function tachesService() {
    var e = stA(), sv = mesServices();
    if (!e) return [];
    return Object.keys(e.taches || {}).map(function (k) { return e.taches[k]; }).filter(function (t) { return !t.supprime && sv.indexOf(t.service) >= 0 && (t.niveau === 'service' ? peut('TACHE') : (peut('TACHE_EQUIPE') || peut('TACHE'))); })
      .sort(function (a, b) { return String(a.titre).localeCompare(String(b.titre)); });
  }
  /** Événements modifiables de l'agent : de ses services, des 30 derniers jours aux 90 prochains (répétés : en cours). */
  function evenements() {
    var e = stA(), sv = mesServices(), m = Date.now();
    if (!e || !peut('RDV')) return [];
    return Object.keys(e.rdv || {}).map(function (k) { return e.rdv[k]; }).filter(function (r) {
      if (r.supprime || sv.indexOf(r.service) < 0) return false;
      var rep = A().regularite(r.regularite).type !== 'aucune', fin = rep ? (r.regularite.jusquAu ? Date.parse(r.regularite.jusquAu + 'T23:59') : Infinity) : (r.fin || r.debut);
      return fin >= m - 30 * 864e5 && r.debut <= m + 90 * 864e5;
    }).sort(function (a, b) { return a.debut - b.debut; });
  }
  function libEvenement(r) {
    var n = (A().NATURES || {})[r.nature] || 'Événement', rep = A().regularite(r.regularite).type !== 'aucune';
    return (r.titre || n) + ' — ' + new Date(r.debut).toLocaleDateString('fr-FR') + ' ' + new Date(r.debut).toTimeString().slice(0, 5) + (rep ? ' (répété)' : '') + ' — ' + U.libService(r.service);
  }

  /**
   * « Lier à… » : `element` (document entier) ; o = { titre, libelle, extrait (montré à l'agent seulement), page (fichier
   * PDF : numéro de page facultatif), avant(libelle) → élément précis (repère posé dans le document) }.
   */
  function modaleLier(element, o) {
    o = o || {};
    var lib = h('input', { type: 'text', maxlength: 120, value: o.libelle || '', placeholder: 'ex. Points à revoir avec l’équipe (sans donnée clinique)', 'aria-label': 'Libellé du lien' });
    var page = o.page ? h('input', { type: 'number', min: 1, max: 9999, class: 'champ-court', 'aria-label': 'Page (facultatif)' }) : null;
    var choix = [];
    function option(code, texte, extra, ok) { if (ok) choix.push({ code: code, texte: texte, extra: extra || null }); }
    var tp = tachesPerso(), ts = tachesService(), ev = evenements();
    var selTp = tp.length ? h('select', { 'aria-label': 'Tâche existante' }, tp.map(function (t) { return h('option', { value: t.id, text: t.titre + (t.partagee ? ' (partagée)' : '') + (t.echeance ? ' — ' + jourFr(t.echeance) : '') }); })) : null;
    var selTs = ts.length ? h('select', { 'aria-label': 'Tâche de l’équipe ou du service' }, ts.map(function (t) { return h('option', { value: t.id, text: t.titre + ' — ' + (t.niveau === 'service' ? 'service' : 'équipe') + ', ' + U.libService(t.service) }); })) : null;
    var selEv = ev.length ? h('select', { 'aria-label': 'Événement existant' }, ev.map(function (r) { return h('option', { value: r.id, text: libEvenement(r) }); })) : null;
    var perso = U.mesTaches && U.mesTaches.disponible && U.mesTaches.disponible();
    option('nouvelle-tache', 'Nouvelle tâche (personnelle, ou partagée avec des collègues)', null, perso);
    option('tache', 'Tâche existante (personnelle ou partagée)', selTp, perso && !!selTp);
    option('nouvelle-equipe', 'Nouvelle tâche de l’équipe', null, agendaOuvert() && peut('TACHE_EQUIPE'));
    option('nouvelle-service', 'Nouvelle tâche du service', null, agendaOuvert() && peut('TACHE'));
    option('tache-service', 'Tâche de l’équipe ou du service existante', selTs, !!selTs);
    option('nouvel-evenement', 'Nouvel événement de l’agenda', null, agendaOuvert() && peut('RDV'));
    option('evenement', 'Événement existant de l’agenda', selEv, !!selEv);
    if (!choix.length) return SIC.ui.alerte('Aucune tâche ni aucun événement accessible : le module Agenda doit être ouvert pour vous.');
    var nom = 'lier-' + Math.random().toString(36).slice(2, 8), coche = choix[0].code;
    var liste = h('div', { class: 'pile' }, choix.map(function (c, i) {
      var rb = h('input', { type: 'radio', name: nom, checked: i === 0, onchange: function () { coche = c.code; } });
      return h('div', { class: 'pile' }, h('label', { class: 'case' }, rb, h('span', { text: c.texte })), c.extra ? h('div', { class: 'liens-choix' }, c.extra) : null);
    }));
    U.modale('Lier à une tâche ou à un événement', h('div', { class: 'pile' },
      h('p', {}, h('b', { text: o.titre || 'Document' }), o.extrait ? h('span', { class: 'muted', text: ' — « ' + o.extrait + ' »' }) : h('span', { class: 'muted', text: o.avant ? '' : ' — document entier' })),
      page ? h('label', {}, 'Page du fichier (facultatif)', page) : null,
      h('label', {}, 'Libellé du lien (facultatif)', lib),
      h('small', { class: 'muted', text: 'La tâche ou l’événement garde un lien vers le document et ce libellé, jamais le texte du passage. Ceux qui n’ont pas accès au document voient « accès réservé ».' }),
      h('fieldset', { class: 'pile' }, h('legend', { text: 'Lier à' }), liste)),
      [{ texte: 'Annuler' }, { texte: 'Lier', classe: 'primaire', action: async function () {
        var l = lib.value.trim(), x = Object.assign({}, element);
        if (o.avant) x = await o.avant(l);
        else if (l) x.libelle = l;
        if (page && +page.value >= 1) { x = Object.assign({}, x, { genre: 'extrait', page: Math.round(+page.value) }); if (!x.libelle) x.libelle = 'Page ' + x.page; }
        var titre = l || (o.titre ? 'Document : ' + o.titre : 'Tâche');
        if (coche === 'nouvelle-tache') { setTimeout(function () { U.mesTaches.nouvelle({ titre: titre, elements: [x] }); }, 0); return; }
        if (coche === 'tache') {
          var t = tp.filter(function (y) { return y.id === selTp.value; })[0];
          if (t.elements.some(function (y) { return memeCible(y, x); })) throw new Error('Déjà lié à cette tâche.');
          await U.mesTaches.lierA(t, x); U.toast('Lié à la tâche « ' + t.titre + ' ».'); return;
        }
        if (coche === 'nouvelle-equipe' || coche === 'nouvelle-service') { setTimeout(function () { U.agendaInt.modaleTache(null, coche === 'nouvelle-service' ? 'TACHE' : 'TACHE_EQUIPE', null, { titre: titre, liens: [x] }); }, 0); return; }
        if (coche === 'tache-service') {
          var ts0 = ts.filter(function (y) { return y.id === selTs.value; })[0], l0 = A().liens(ts0.liens);
          if (l0.some(function (y) { return memeCible(y, x); })) throw new Error('Déjà lié à cette tâche.');
          if (l0.length >= A().MAX_LIENS) throw new Error('Vingt éléments liés au plus.');
          await s().enregistrer(ts0.niveau === 'service' ? 'TACHE' : 'TACHE_EQUIPE', { id: ts0.id, service: ts0.service, liens: l0.concat([x]) });
          U.toast('Lié à la tâche « ' + ts0.titre + ' ».'); return;
        }
        if (coche === 'nouvel-evenement') { setTimeout(function () { U.agenda.modaleElement(null, Date.now(), false, null, false, null, { liens: [x], titre: l }); }, 0); return; }
        if (coche === 'evenement') {
          var r = ev.filter(function (y) { return y.id === selEv.value; })[0], l1 = A().liens(r.liens);
          if (l1.some(function (y) { return memeCible(y, x); })) throw new Error('Déjà lié à cet événement.');
          if (l1.length >= A().MAX_LIENS) throw new Error('Vingt éléments liés au plus.');
          await s().enregistrer('RDV', { id: r.id, service: r.service, liens: l1.concat([x]) });
          U.toast('Lié à l’événement « ' + (r.titre || libEvenement(r)) + ' ».');
        }
      } }]);
  }

  // ------------------------------------------------------------ Ce qui est lié à un document (lecture, selon les droits)
  /** Tâches et événements visibles de l'agent liés au document `id` (au repère `ancre` si donné) : [{ type, titre, detail, lien, ouvrir }]. */
  function liesA(id, ancre) {
    var res = [];
    function vise(x) { return x.module === 'documents' && x.id === id && (ancre === undefined || (x.ancre || '') === (ancre || '')); }
    try {
      (U.mesTaches && U.mesTaches.disponible() ? U.mesTaches.taches() : []).forEach(function (t) {
        t.elements.filter(vise).forEach(function (x) { res.push({ type: t.partagee ? 'Tâche partagée' : 'Ma tâche', titre: t.titre, detail: (t.fait ? 'faite' : t.echeance ? 'échéance ' + jourFr(t.echeance) : '') + (x.libelle ? ' — ' + x.libelle : ''), lien: x, ouvrir: function () { U.mesTaches.ouvrir(t); } }); });
      });
    } catch (e) { /* liste indisponible */ }
    var e = stA(), sv = mesServices();
    if (e) {
      Object.keys(e.taches || {}).map(function (k) { return e.taches[k]; }).filter(function (t) { return !t.supprime && sv.indexOf(t.service) >= 0; }).forEach(function (t) {
        A().liens(t.liens).filter(vise).forEach(function (x) { res.push({ type: t.niveau === 'service' ? 'Tâche du service' : 'Tâche de l’équipe', titre: t.titre, detail: U.libService(t.service) + (x.libelle ? ' — ' + x.libelle : ''), lien: x, ouvrir: (t.niveau === 'service' ? peut('TACHE') : (peut('TACHE_EQUIPE') || peut('TACHE'))) ? function () { U.agendaInt.modaleTache(t, t.niveau === 'service' ? 'TACHE' : 'TACHE_EQUIPE'); } : null }); });
      });
      Object.keys(e.rdv || {}).map(function (k) { return e.rdv[k]; }).filter(function (r) { return !r.supprime && (sv.indexOf(r.service) >= 0 || (r.services || []).some(function (c) { return sv.indexOf(c) >= 0; })); }).forEach(function (r) {
        A().liens(r.liens).filter(vise).forEach(function (x) { res.push({ type: 'Événement', titre: libEvenement(r), detail: x.libelle || '', lien: x, ouvrir: function () { U.agenda.modaleElement(r, r.debut, !peut('RDV')); } }); });
      });
    }
    return res;
  }
  function listeLies(l) {
    if (!l.length) return h('p', { class: 'muted', text: 'Aucune tâche ni aucun événement que vous pouvez voir n’y est lié.' });
    return h('ul', { class: 'liste-simple liens-lies' }, l.map(function (x) {
      return h('li', {}, h('span', { class: 'badge', text: x.type }), ' ', h('b', { text: x.titre }), x.detail ? h('small', { class: 'muted', text: ' — ' + x.detail }) : null,
        x.ouvrir ? h('button', { class: 'btn petit', type: 'button', onclick: function () { var d = document.querySelectorAll('dialog[open]'); if (d.length) d[d.length - 1].dispatchEvent(new Event('cancel')); setTimeout(x.ouvrir, 0); } }, 'Ouvrir') : null);
    }));
  }
  /** Liens d'un passage ou de cases (clic sur le passage surligné). */
  function modaleLiensAncre(id, ancre) { U.modale('Liens du passage', h('div', { class: 'pile' }, listeLies(liesA(id, ancre))), [{ texte: 'Fermer' }]); }
  /**
   * Passages et cases repérés d'un document, avec leurs liens visibles ; `aller(ancre)` montre le passage. Les repères
   * sans lien visible peuvent venir de tâches d'autres agents : ils ne sont pas retirés d'office.
   */
  function modaleLiensDocument(id, contenu, aller) {
    var an = SIC.documents.ancres(contenu), ids = Object.keys(an);
    U.modale('Liens du document', h('div', { class: 'pile' },
      h('h3', { text: 'Document entier' }), listeLies(liesA(id, '')),
      h('h3', { text: 'Passages et cases repérés (' + ids.length + ')' }),
      ids.length ? h('ul', { class: 'liste-simple' }, ids.map(function (k) {
        var l = liesA(id, k);
        return h('li', { class: 'pile' }, h('div', {}, h('span', { class: 'doc-ancre', text: an[k].extrait || '(passage vide)' }), ' ',
          aller ? h('button', { class: 'btn petit', type: 'button', onclick: function () { var d = document.querySelectorAll('dialog[open]'); d[d.length - 1].dispatchEvent(new Event('cancel')); setTimeout(function () { aller(k); }, 0); } }, 'Aller au passage') : null), listeLies(l));
      })) : h('p', { class: 'muted', text: 'Aucun passage repéré : sélectionnez un passage (ou des cases), puis « Lier à… ».' }),
      h('small', { class: 'muted', text: 'Un repère peut aussi servir à une tâche d’un collègue que vous ne voyez pas.' })),
      [{ texte: 'Fermer' }], { large: true });
  }

  U.liens = { zone: zone, bouton: bouton, modaleLier: modaleLier, liesA: liesA, modaleLiensAncre: modaleLiensAncre, modaleLiensDocument: modaleLiensDocument };
})();
