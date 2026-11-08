// SPDX-License-Identifier: EUPL-1.2
/*
 * Groupes d'agents — interface (décision du porteur du 8 novembre 2026). Logique et contrôle : groupes.js.
 * Fenêtre Administration, onglet « Groupes d'agents » : ouvert à l'administrateur (tous les groupes) et au cadre
 * (groupes de ses services ; les groupes de l'établissement et des autres services sont affichés sans modification).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, G = SIC.groupes, C = SIC.crypto;

  function moi() { return U.App.session.utilisateur; }
  function estAdmin() { return (moi().roles || []).indexOf('ADMIN') >= 0; }
  function libServices(g) { return g.services.length ? g.services.map(U.libService).join(', ') : 'tout l’établissement'; }
  function comptesActifs() { return (U.App.session.comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours'; }); }

  function vueGroupes() {
    var cfg = U.config(), groupes = G.liste(cfg), mien = moi();
    var visibles = estAdmin() ? groupes : groupes.filter(function (g) { return !g.services.length || g.services.some(function (s) { return (mien.services || []).indexOf(s) >= 0; }); });
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Groupes d’agents' }),
        h('button', { class: 'btn primaire', onclick: function () { modaleGroupe(null); } }, '+ Nouveau groupe')),
      h('p', { class: 'muted', text: 'En plus de leur affectation à un ou plusieurs services, les agents peuvent être réunis en groupes : équipe de jour, équipe de nuit, groupe de travail… Une tâche ou une alerte de l’agenda peut être adressée à un groupe ; ses membres la retrouvent dans « Mon agenda ». Le cadre crée et modifie les groupes de ses services ; un groupe de tout l’établissement est créé par l’administrateur.' }),
      visibles.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Groupe', 'Services', 'Membres', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, visibles.map(function (g) {
          var modif = G.modifiable(g, mien);
          return h('tr', { class: g.actif ? '' : 'ancienne' }, h('td', {}, h('b', { text: g.libelle }), g.actif ? null : h('span', { class: 'badge', text: 'inactif' })),
            h('td', { text: libServices(g) }),
            h('td', { text: g.membres.length ? g.membres.map(function (m) { return m.nom || U.App.session.nomAuteur(m.id); }).join(', ') : '—' }),
            h('td', { class: 'actions-ligne' }, modif ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleGroupe(g); } }, 'Modifier') : h('small', { class: 'muted', text: 'Lecture seule' })));
        })))) : h('div', { class: 'panneau vide', text: 'Aucun groupe pour vos services.' }));
  }

  function modaleGroupe(g) {
    var x = g || { code: '', libelle: '', services: [], membres: [], actif: true }, mien = moi();
    var libelle = h('input', { type: 'text', maxlength: 60, value: x.libelle, placeholder: 'ex. Équipe de nuit, Groupe de travail qualité' });
    var servicesPossibles = estAdmin() ? U.tousServices() : U.tousServices().filter(function (s) { return (mien.services || []).indexOf(s.code) >= 0; });
    var choisis = x.services.slice(), membres = x.membres.map(function (m) { return Object.assign({}, m); });
    var zoneSv = h('div', { class: 'actions gauche' }), zoneMembres = h('div', { class: 'pile' });
    servicesPossibles.forEach(function (s) {
      var cb = h('input', { type: 'checkbox', checked: choisis.indexOf(s.code) >= 0, onchange: function () { choisis = cb.checked ? choisis.concat([s.code]) : choisis.filter(function (c) { return c !== s.code; }); dessinerMembres(); } });
      zoneSv.appendChild(h('label', { class: 'case' }, cb, h('span', { text: s.libelle })));
    });
    var actif = h('input', { type: 'checkbox', checked: x.actif !== false });
    function dessinerMembres() {
      U.vider(zoneMembres);
      // Agents affectés à l'un des services du groupe (tous les agents pour un groupe de l'établissement), et membres déjà inscrits
      var candidats = comptesActifs().filter(function (c) { return !choisis.length || !(c.services || []).length || (c.services || []).some(function (s) { return choisis.indexOf(s) >= 0; }); });
      membres.forEach(function (m) { if (!candidats.some(function (c) { return c.id === m.id; })) candidats.push({ id: m.id, nom: m.nom || U.App.session.nomAuteur(m.id) }); });
      candidats.sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      if (!candidats.length) return zoneMembres.appendChild(h('p', { class: 'muted', text: 'Aucun agent affecté à ces services.' }));
      zoneMembres.appendChild(h('div', { class: 'grille-3' }, candidats.map(function (c) {
        var cb = h('input', { type: 'checkbox', checked: membres.some(function (m) { return m.id === c.id; }), onchange: function () {
          membres = cb.checked ? membres.concat([{ id: c.id, nom: c.nom || '' }]) : membres.filter(function (m) { return m.id !== c.id; });
        } });
        return h('label', { class: 'case' }, cb, h('span', { text: c.nom || c.id }));
      })));
    }
    dessinerMembres();
    var boutons = [{ texte: 'Annuler' }];
    function enregistrerListe(liste) { return U.enregistrerConfig([['groupes', liste]]); }
    if (g) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer le groupe « ' + g.libelle + ' » ? Les tâches et alertes qui lui étaient adressées reviennent à toute l’équipe du service. Pour le garder sans l’utiliser, décochez plutôt « Groupe actif ».')) return false;
      await enregistrerListe(G.liste(U.config()).filter(function (y) { return y.code !== g.code; }));
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var nom = libelle.value.trim();
      if (!nom) throw new Error('Indiquez le nom du groupe.');
      if (!estAdmin() && !choisis.length) throw new Error('Choisissez au moins un de vos services.');
      var liste = G.liste(U.config()), code = x.code;
      if (!code) {
        code = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'groupe';
        while (liste.some(function (y) { return y.code === code; })) code = code.slice(0, 32) + '-' + C.hex(C.aleatoire(2));
      }
      var nouveau = { code: code, libelle: nom, services: choisis, membres: membres, actif: actif.checked };
      var i = liste.map(function (y) { return y.code; }).indexOf(code);
      if (i >= 0) liste[i] = nouveau; else liste.push(nouveau);
      await enregistrerListe(liste);
    } });
    U.modale(g ? 'Modifier le groupe' : 'Nouveau groupe d’agents', h('div', { class: 'pile' },
      h('label', {}, 'Nom du groupe', libelle),
      h('div', {}, h('b', { text: 'Services' + (estAdmin() ? ' (aucun : tout l’établissement)' : '') }), zoneSv),
      h('div', {}, h('b', { text: 'Membres' }), zoneMembres),
      h('label', { class: 'case' }, actif, h('span', { text: 'Groupe actif (proposé pour les tâches et les alertes)' }))), boutons, { large: true });
  }

  U.vueGroupes = vueGroupes;
})();
