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

  // ------------------------------------------------------------ Information du cadre d'un agent ajouté à un groupe d'un autre service
  function avisVus() { var p = U.App.session.preferences || {}; return Array.isArray(p.avisGroupesVus) ? p.avisGroupesVus : []; }
  function mesAvis() { try { return G.avisMembresExterieurs(U.config(), U.App.session.comptes || [], moi(), avisVus()); } catch (e) { return []; } }
  function mesAjouts() { try { return G.avisAjouts(U.config(), U.App.session.compteEffectif(), avisVus()); } catch (e) { return []; } }
  /** Bandeau affiché dans toutes les fenêtres : l'agent a été ajouté à un groupe d'agents. */
  function bandeauAjouts() {
    var av = mesAjouts();
    if (!av.length || U.App.session.apercu) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? 'Vous avez été ajouté(e) à ' + av.length + ' groupes d’agents' : 'Vous avez été ajouté(e) à un groupe d’agents' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Vu')),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        return h('li', { text: '« ' + a.groupe.libelle + ' »' + (a.groupe.services.length ? ' (' + a.groupe.services.map(U.libService).join(', ') + ')' : ' (tout l’établissement)') + ', par ' + (a.membre.ajoute.nom || U.App.session.nomAuteur(a.membre.ajoute.par)) + ', le ' + U.date(Date.parse(a.membre.ajoute.le)) + '. Les tâches et alertes adressées à ce groupe apparaissent dans « Mon agenda ».' });
      })));
  }
  async function marquerVus(ids) { try { await U.App.session.enregistrerPreference('avisGroupesVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }
  function bandeauAvis() {
    var av = mesAvis();
    if (!av.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' agents de vos services ajoutés à un groupe' : 'Un agent de vos services ajouté à un groupe' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Tout marquer vu')),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        return h('li', {}, h('span', { text: (a.membre.nom || U.App.session.nomAuteur(a.membre.id)) + ' (' + a.servicesAgent.map(U.libService).join(', ') + ') a été ajouté(e) au groupe « ' + a.groupe.libelle + ' » (' + a.groupe.services.map(U.libService).join(', ') + ') par ' + (a.membre.ajoute.nom || U.App.session.nomAuteur(a.membre.ajoute.par)) + ', le ' + U.date(Date.parse(a.membre.ajoute.le)) + '. ' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus([a.id]); } }, 'Vu'));
      })));
  }

  function vueGroupes() {
    var cfg = U.config(), groupes = G.liste(cfg), mien = moi();
    var visibles = estAdmin() ? groupes : groupes.filter(function (g) { return !g.services.length || g.services.some(function (s) { return (mien.services || []).indexOf(s) >= 0; }); });
    return h('div', {}, bandeauAvis(),
      h('div', { class: 'barre' }, h('h1', { text: 'Groupes d’agents' }),
        h('button', { class: 'btn primaire', onclick: function () { modaleGroupe(null); } }, '+ Nouveau groupe')),
      h('p', { class: 'muted', text: 'En plus de leur affectation à un ou plusieurs services, les agents peuvent être réunis en groupes : équipe de jour, équipe de nuit, groupe de travail… Une tâche ou une alerte de l’agenda peut être adressée à un groupe ; ses membres la retrouvent dans « Mon agenda ». Le cadre crée et modifie les groupes de ses services ; il peut y ajouter des agents d’autres services, dont le cadre est alors informé. Un groupe de tout l’établissement est créé par l’administrateur.' }),
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
      // Tous les agents actifs (décision du 8 novembre 2026) : ceux des services du groupe d'abord, puis ceux des autres
      // services (leur cadre est informé de l'ajout) ; membres déjà inscrits gardés
      var tous = comptesActifs().map(function (c) { return { id: c.id, nom: c.nom || c.id, services: c.services || [] }; });
      membres.forEach(function (m) { if (!tous.some(function (c) { return c.id === m.id; })) tous.push({ id: m.id, nom: m.nom || U.App.session.nomAuteur(m.id), services: [] }); });
      tous.sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      var duGroupe = function (c) { return !choisis.length || !c.services.length || c.services.some(function (x) { return choisis.indexOf(x) >= 0; }); };
      function cases(l) {
        return h('div', { class: 'grille-3' }, l.map(function (c) {
          var cb = h('input', { type: 'checkbox', checked: membres.some(function (m) { return m.id === c.id; }), onchange: function () {
            membres = cb.checked ? membres.concat([{ id: c.id, nom: c.nom || '', ajoute: { par: mien.id, nom: mien.nom || '', le: new Date().toISOString() } }]) : membres.filter(function (m) { return m.id !== c.id; });
          } });
          return h('label', { class: 'case' }, cb, h('span', { text: c.nom + (duGroupe(c) || !c.services.length ? '' : ' (' + c.services.map(U.libService).join(', ') + ')') }));
        }));
      }
      var a = tous.filter(duGroupe), b = tous.filter(function (c) { return !duGroupe(c); });
      zoneMembres.appendChild(a.length ? cases(a) : h('p', { class: 'muted', text: 'Aucun agent affecté à ces services.' }));
      if (b.length) zoneMembres.appendChild(h('details', { open: b.some(function (c) { return membres.some(function (m) { return m.id === c.id; }); }) },
        h('summary', { text: 'Agents d’autres services (' + b.length + ') — leur cadre sera informé de l’ajout' }), cases(b)));
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
  U.pastilleGroupes = function () { return mesAvis().length; };
  U.bandeauAjoutsGroupes = bandeauAjouts;
})();
