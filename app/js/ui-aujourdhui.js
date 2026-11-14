// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — page « Aujourd'hui » et recherche générale (0.26.4, lot A, décisions du porteur du 11 novembre 2026).
 *
 * « Aujourd'hui » : fenêtre ouverte à la connexion, qui regroupe Mon agenda du jour, Mes tâches à faire aujourd'hui
 * (ou en retard), ce que les modules demandent à l'agent et les salles qu'il a réservées ce jour. Chaque bloc mène à
 * son module ; rien n'est copié.
 * Recherche générale (bouton « Rechercher », Ctrl + K) : patients, événements, demandes, réservations, salles…
 * (éléments que l'agent pourrait rattacher à un message : ceux des modules dont il a la clé et de ses services),
 * messages, agents, contacts des Informations du service. Lecture à la volée, rien n'est enregistré.
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h;
  function s() { return U.App.session; }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function aller(fenetre, onglet) { return function () { U.ouvrirFenetre(fenetre); if (onglet) { U.App.onglet = onglet; U.rendreContenu(); } }; }
  function bloc(titre, contenu, lien, libLien) {
    return h('section', { class: 'panneau aj-bloc' }, h('div', { class: 'barre' }, h('h2', { text: titre }), h('div', { class: 'espace' }),
      lien ? h('button', { class: 'btn petit', type: 'button', onclick: lien }, libLien || 'Ouvrir') : null), contenu);
  }

  function vueAujourdhui() {
    var maintenant = Date.now(), auj = jourISO(maintenant), blocs = [];
    var d = new Date(maintenant);
    var titre = 'Aujourd’hui, ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    // Fonctions activées sans avis (13 novembre 2026) : rappel au cadre et à la direction seulement
    try { var rv = U.validations && U.validations.blocRappel(); if (rv) blocs.push(rv); } catch (e) { /* sans validations */ }
    // Mon agenda du jour
    try {
      var j = U.monJour ? U.monJour(maintenant) : null;
      if (j) blocs.push(bloc('Mon agenda', h('div', { class: 'pile' }, j.absent ? h('p', { class: 'info', text: 'Vous êtes noté(e) absent(e) aujourd’hui.' }) : null,
        j.taches.length ? h('div', { class: 'agenda-taches' }, j.taches) : null, j.elements.length ? j.elements : null,
        !j.taches.length && !j.elements.length ? h('p', { class: 'muted', text: 'Rien de prévu pour vous aujourd’hui dans l’agenda.' }) : null,
        j.alertes ? h('p', { class: 'muted', text: j.alertes + ' alerte' + (j.alertes > 1 ? 's' : '') + ' vous ' + (j.alertes > 1 ? 'sont adressées' : 'est adressée') + ' : voir Mon agenda.' }) : null), aller('agenda', 'mon-agenda'), 'Mon agenda'));
    } catch (e) { /* sans agenda */ }
    // Mes tâches
    try {
      if (U.mesTaches) {
        var ts = U.mesTaches.taches().filter(function (t) { return !t.fait; }), dues = ts.filter(function (t) { return t.echeance && t.echeance <= auj; });
        blocs.push(bloc('Mes tâches', dues.length ? h('ul', { class: 'liste-simple' }, dues.map(function (t) {
          return h('li', { class: t.echeance < auj ? 'texte-bad' : '' }, h('b', { text: t.titre }), ' — ' + (t.echeance < auj ? 'en retard (' + t.echeance.split('-').reverse().join('/') + ')' : 'aujourd’hui' + (t.heure ? ' à ' + t.heure : '')));
        })) : h('p', { class: 'muted', text: ts.length ? 'Rien pour aujourd’hui ; ' + ts.length + ' tâche' + (ts.length > 1 ? 's' : '') + ' à faire plus tard ou sans date.' : 'Votre liste est vide.' }), aller('agenda', 'mes-taches'), 'Mes tâches'));
      }
    } catch (e) { /* sans liste */ }
    // Ce que les modules demandent (informations non traitées)
    try {
      var dm = U.mesTaches && U.mesTaches.demandes ? U.mesTaches.demandes() : [];
      blocs.push((function (b) { b.classList.add('aj-large'); return b; })(bloc('Ce qui vous attend', dm.length ? h('ul', { class: 'mt-liste' }, dm.slice(0, 8).map(function (i) {
        return h('li', { class: 'mt-demande ' + (i.niveau || '') }, h('span', { class: 'ms-module ms-module-' + i.module, text: i.libModule }),
          h('div', { class: 'mt-corps' }, h('b', { text: i.titre }), i.detail ? h('small', { class: 'muted', text: i.detail }) : null),
          i.ouvrir ? h('button', { class: 'btn petit', type: 'button', onclick: function () { i.ouvrir(); } }, 'Ouvrir') : null);
      }).concat(dm.length > 8 ? [h('li', { class: 'muted', text: '… et ' + (dm.length - 8) + ' autre(s) : voir Mes tâches.' })] : [])) : h('p', { class: 'muted', text: 'Rien ne vous attend dans les modules.' }))));
    } catch (e) { /* sans informations */ }
    // Salles réservées ce jour
    try {
      if (U.salles && s().ouvert('salles')) {
        var l = U.salles.miennes(minuit(maintenant), minuit(maintenant) + 864e5);
        if (l.length) blocs.push(bloc('Mes salles aujourd’hui', h('ul', { class: 'liste-simple' }, l.map(function (o) { return h('li', {}, h('b', { text: hm(o.debut) + '–' + hm(o.fin) }), ' ' + U.salles.nomSalle(o.salle) + ' — ' + o.titre + (o.etat ? ' (' + o.etat + ')' : '')); })), aller('salles', 'mes'), 'Salles'));
      }
    } catch (e) { /* sans salles */ }
    return h('div', { class: 'pile' }, h('div', { class: 'barre' }, h('h1', { text: titre }), h('div', { class: 'espace' }),
      h('button', { class: 'btn', type: 'button', onclick: function () { modaleRecherche(); } }, 'Rechercher… (Ctrl + K)')), h('div', { class: 'aj-grille' }, blocs));
  }

  // ------------------------------------------------------------ Recherche générale
  function sources(q) {
    var res = [];
    try { if (U.messagerie && U.messagerie.elements) res = res.concat(U.messagerie.elements()); } catch (e) { /* sans éléments */ }
    try { if (U.messagerie && U.messagerie.chercher) res = res.concat(U.messagerie.chercher(q)); } catch (e) { /* sans messages */ }
    try {
      ((s() && s().comptes) || []).filter(function (c) { return c.actif && c.id !== 'secours'; }).forEach(function (c) {
        res.push({ module: 'agents', libModule: 'Agent', titre: c.nom, detail: (c.roles || []).join(', ') + ((c.services || []).length ? ' — ' + c.services.map(U.libService).join(', ') : ''),
          ouvrir: U.equipe && s().ouvert('equipe') ? function () { U.equipe.contact(c.id, c.nom); } : U.messagerie && U.messagerie.peutEnvoyer && U.messagerie.peutEnvoyer() ? function () { U.messagerie.nouveau({ destinataires: ['agent|' + c.id] }); } : null,
          libOuvrir: U.equipe && s().ouvert('equipe') ? 'Coordonnées' : 'Écrire' });
      });
    } catch (e) { /* sans comptes */ }
    try {
      if (U.infos && s().ouvert('infos')) ['*'].concat(U.services().map(function (x) { return x.code; })).forEach(function (sv) {
        U.infos.contacts(sv).forEach(function (c) { res.push({ module: 'infos', libModule: 'Contact', titre: c.nom + (c.numero ? ' — ' + c.numero : ''), detail: [c.fonction, c.rubrique].filter(Boolean).join(' · '), ouvrir: function () { U.ouvrirFenetre('infos'); U.App.onglet = 'annuaire'; U.rendreContenu(); } }); });
      });
    } catch (e) { /* sans contacts */ }
    return res;
  }
  function modaleRecherche() {
    var champ = h('input', { type: 'search', placeholder: 'Patient, événement, salle, message, agent, contact…', 'aria-label': 'Rechercher dans Tessera', class: 'aj-recherche' });
    var zone = h('div', { class: 'pile aj-resultats', role: 'list' }), base = null, minuteur = null;
    function maj() {
      var q = champ.value.trim();
      U.vider(zone);
      if (q.length < 2) { zone.appendChild(h('p', { class: 'muted', text: 'Tapez au moins deux lettres. La recherche porte sur ce que vous pouvez consulter, dans vos services.' })); return; }
      if (!base) base = sources('');
      var tous = base.concat(U.messagerie && U.messagerie.chercher ? U.messagerie.chercher(q) : []), vus = {};
      var l = tous.filter(function (x) { var k = x.module + '|' + x.titre + '|' + x.detail; if (vus[k]) return false; vus[k] = 1; return SIC.tri.correspond(x.titre + ' ' + x.detail + ' ' + x.libModule, q); });
      if (!l.length) { zone.appendChild(h('p', { class: 'muted', text: 'Aucun résultat.' })); return; }
      l.slice(0, 40).forEach(function (x) {
        zone.appendChild(h('div', { class: 'aj-resultat', role: 'listitem' }, h('span', { class: 'ms-module ms-module-' + x.module, text: x.libModule }),
          h('div', { class: 'mt-corps' }, h('b', { text: x.titre }), x.detail ? h('small', { class: 'muted', text: x.detail }) : null),
          x.ouvrir ? h('button', { class: 'btn petit', type: 'button', onclick: function () { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(x.ouvrir, 0); } }, x.libOuvrir || 'Ouvrir') : null));
      });
      if (l.length > 40) zone.appendChild(h('p', { class: 'muted', text: (l.length - 40) + ' autre(s) résultat(s) : précisez la recherche.' }));
    }
    champ.addEventListener('input', function () { clearTimeout(minuteur); minuteur = setTimeout(maj, 150); });
    maj();
    U.modale('Rechercher', h('div', { class: 'pile' }, champ, zone), [{ texte: 'Fermer' }], { large: true, focus: champ });
  }

  U.vueAujourdhui = vueAujourdhui;
  U.modaleRecherche = modaleRecherche;
  U.recherche = { sources: sources };
})();
