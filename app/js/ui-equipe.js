// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Équipe — interface (0.27.0, lot C). Logique : module-equipe.js. Onglets : Annuaire (agents de ses services,
 * coordonnées professionnelles), Ma fiche (l'agent tient ses coordonnées ; personnelles avec son accord), Médecins
 * (numéro personnel, cadre et médecin chef de service). Petite fiche de contact ouverte d'un clic sur un nom dans les
 * autres modules : U.equipe.contact(id), U.equipe.lien(id, nom).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, E = SIC.equipe;
  var persoCache = {};

  function s() { return U.App.session; }
  function st() { try { return (s().detientCle('equipe') && s().etatModule('equipe')) || E.reduire([]); } catch (e) { return E.reduire([]); } }
  function moi() { return s().compteEffectif(); }
  function compte() { return Object.assign({}, moi(), { roles: s().roles() }); }
  function libRoles(roles) { var cfg = U.config(), d = SIC.modules.obtenir('equipe').droits, l = {}; try { d.rolesConfig(cfg).forEach(function (r) { l[r.code] = r.libelle; }); } catch (e) { /* libellés bruts */ } return (roles || []).filter(function (r) { return r !== 'ADMIN'; }).map(function (r) { return l[r] || r; }).join(', '); }
  /** Agents connus : comptes actifs, puis membres des groupes d'agents sans compte. [{ id, nom, roles, services, compte }] */
  function agents() {
    var res = [], vus = {};
    ((s() && s().comptes) || []).filter(function (c) { return c.actif && c.id !== 'secours'; }).forEach(function (c) { vus[c.id] = 1; res.push({ id: c.id, nom: c.nom, roles: c.roles || [], services: c.services || [], compte: true }); });
    ((U.config().groupes) || []).forEach(function (g) {
      if (!g || g.actif === false) return;
      (g.membres || []).forEach(function (m) {
        if (!m || !m.id) return;
        if (vus[m.id]) { var a = res.filter(function (x) { return x.id === m.id; })[0]; (g.services || []).forEach(function (sv) { if (!a.compte && a.services.indexOf(sv) < 0) a.services.push(sv); }); return; }
        vus[m.id] = 1; res.push({ id: m.id, nom: m.nom || m.id, roles: [], services: (g.services || []).slice(), compte: false });
      });
    });
    return res.sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr'); });
  }
  function agent(id) { return agents().filter(function (a) { return a.id === id; })[0] || null; }
  function copier(t) { try { navigator.clipboard.writeText(t).then(function () { U.toast('Copié : ' + t); }, function () { prompt('Copiez :', t); }); } catch (e) { prompt('Copiez :', t); } }
  function boutonCopie(t, titre) { return t ? h('button', { class: 'btn lien is-numero', type: 'button', title: titre || 'Copier', onclick: function () { copier(t); } }, t) : h('span', { class: 'muted', text: '—' }); }
  function peutEcrire() { return U.messagerie && U.messagerie.peutEnvoyer && U.messagerie.peutEnvoyer(); }

  // ------------------------------------------------------------ Coordonnées personnelles (enveloppes)
  async function lirePerso(a) {
    var f = E.fiche(st(), a.id);
    if (!f.perso || !f.accord) return null;
    var k = s().utilisateur.id + '|' + a.id + '|' + f.le;   // jamais partagé entre deux sessions du même poste
    if (!(k in persoCache)) persoCache[k] = await s().ouvrirEnveloppe('fiche:' + a.id, f.perso, { admin: true });
    return persoCache[k];
  }
  async function lirePersoMedecin(m) {
    var f = st().medecins[m.id];
    if (!f || !f.perso) return null;
    var k = s().utilisateur.id + '|m|' + m.id + '|' + f.le;
    if (!(k in persoCache)) persoCache[k] = await s().ouvrirEnveloppe('medecin:' + m.id, f.perso);
    return persoCache[k];
  }

  // ------------------------------------------------------------ Petite fiche de contact (tous les modules)
  function contact(id, nom) {
    var a = agent(id) || { id: id, nom: nom || id, roles: [], services: [], compte: false }, f = E.fiche(st(), id), zonePerso = h('div', { class: 'pile' });
    var c = compte(), gere = E.gere(c, id, a.services) && !s().apercu;
    U.modale(a.nom, h('div', { class: 'pile eq-contact' },
      h('div', { class: 'grille-2' },
        h('div', {}, h('small', { class: 'muted', text: 'Fonction' }), h('div', { text: f.fonction || libRoles(a.roles) || '—' })),
        h('div', {}, h('small', { class: 'muted', text: 'Services' }), h('div', { text: a.services.map(U.libService).join(', ') || '—' })),
        h('div', {}, h('small', { class: 'muted', text: 'Téléphone professionnel' }), h('div', {}, boutonCopie(f.telPro, 'Copier le numéro'))),
        h('div', {}, h('small', { class: 'muted', text: 'Courriel professionnel' }), h('div', {}, boutonCopie(f.mailPro, 'Copier l’adresse')))),
      zonePerso),
    [{ texte: 'Fermer' },
      a.compte && peutEcrire() && id !== moi().id ? { texte: 'Écrire', classe: 'primaire', action: function () { setTimeout(function () { U.messagerie.nouveau({ destinataires: ['agent|' + id] }); }, 0); } } : null,
      gere ? { texte: id === moi().id ? 'Ma fiche' : 'Modifier', action: function () { setTimeout(function () { if (id === moi().id) { U.ouvrirFenetre('equipe'); U.App.onglet = 'ma-fiche'; U.rendreContenu(); } else modaleFiche(a); }, 0); } } : null,
      U.champs && U.champs.ficheAgent && s().roles().some(function (r) { return r === 'CADRE' || r === 'ADMIN'; }) ? { texte: 'Données ajoutées', action: function () { setTimeout(function () { U.champs.ficheAgent(a); }, 0); } } : null].filter(Boolean));
    if (f.perso && f.accord) lirePerso(a).then(function (p) {
      if (!p) return;
      zonePerso.appendChild(h('div', { class: 'eq-perso' }, h('small', { class: 'muted', text: 'Coordonnées personnelles — rappels et urgences de service seulement, avec l’accord de l’agent' }),
        h('div', { class: 'grille-2' }, h('div', {}, h('small', { class: 'muted', text: 'Téléphone personnel' }), h('div', {}, boutonCopie(p.tel))), h('div', {}, h('small', { class: 'muted', text: 'Courriel personnel' }), h('div', {}, boutonCopie(p.mail))))));
    });
  }
  /** Nom cliquable qui ouvre la fiche de contact d'un agent (texte simple sans module Équipe). */
  function lien(id, nom) {
    if (!id || !SIC.modules.obtenir('equipe') || !s().detientCle('equipe')) return h('span', { text: nom || '' });
    return h('button', { class: 'btn lien eq-lien', type: 'button', title: 'Coordonnées', onclick: function (ev) { ev.stopPropagation(); contact(id, nom); } }, nom || (agent(id) || {}).nom || id);
  }

  // ------------------------------------------------------------ Saisie d'une fiche
  function champ(lib, val, type, aria) { return h('input', { type: type || 'text', maxlength: 120, value: val || '', 'aria-label': aria || lib }); }
  async function enregistrerFiche(a, v) {
    var d = { agent: a.id, telPro: v.telPro, mailPro: v.mailPro, fonction: v.fonction };
    if (v.accord !== undefined) d.accord = v.accord;
    if (v.perso !== undefined) {
      if (v.perso && (v.perso.tel || v.perso.mail)) d.perso = await s().chiffrerEnveloppe('fiche:' + a.id, E.clesAgent(a.id, a.services).filter(function (n) { return !s().clesEnveloppeManquantes([n]).length; }), v.perso);
      else d.perso = null;
    }
    await s().enregistrer('COORDONNEES', d);
  }
  function modaleFiche(a) {
    var f = E.fiche(st(), a.id);
    var tp = champ('Téléphone professionnel', f.telPro, 'tel'), mp = champ('Courriel professionnel', f.mailPro, 'email'), fo = champ('Fonction (facultatif)', f.fonction);
    U.modale('Fiche de ' + a.nom, h('div', { class: 'pile' }, h('div', { class: 'grille-2' }, h('label', {}, 'Téléphone professionnel', tp), h('label', {}, 'Courriel professionnel', mp), h('label', {}, 'Fonction (facultatif)', fo)),
      h('small', { class: 'muted', text: f.accord ? 'L’agent a donné son accord pour ses coordonnées personnelles : il les saisit lui-même dans « Ma fiche ».' : 'Coordonnées personnelles : l’agent les saisit lui-même dans « Ma fiche », avec son accord.' })),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () { await enregistrerFiche(a, { telPro: tp.value.trim(), mailPro: mp.value.trim(), fonction: fo.value.trim() }); U.toast('Fiche enregistrée.'); } }]);
  }

  // ------------------------------------------------------------ Vues
  function mesServices() { return U.services().map(function (x) { return x.code; }); }
  function vueAnnuaire() {
    var mes = mesServices(), voitTout = s().roles().indexOf('ADMIN') >= 0, c = compte();
    var l = agents().filter(function (a) { return voitTout || a.services.some(function (x) { return mes.indexOf(x) >= 0; }) || a.id === moi().id; });
    if (U.App.service !== '*') l = l.filter(function (a) { return a.services.indexOf(U.App.service) >= 0; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Annuaire de l’équipe' + (U.App.service !== '*' ? ' — ' + U.libService(U.App.service) : '') }),
      h('p', { class: 'muted', text: 'Coordonnées professionnelles des agents de vos services. Un clic sur un nom ouvre sa fiche de contact ; un clic sur un numéro le copie.' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'eq-annuaire' },
        h('thead', {}, h('tr', {}, ['Nom', 'Fonction', 'Services', 'Téléphone pro', 'Courriel pro', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (a) {
          var f = E.fiche(st(), a.id);
          return h('tr', {}, h('td', {}, lien(a.id, a.nom), a.compte ? null : h('small', { class: 'muted', text: ' (sans compte)' })), h('td', { text: f.fonction || libRoles(a.roles) }),
            h('td', { text: a.services.map(U.libService).join(', ') }), h('td', { class: 'nowrap' }, boutonCopie(f.telPro, 'Copier le numéro')), h('td', {}, boutonCopie(f.mailPro, 'Copier l’adresse')),
            h('td', { class: 'actions-ligne' }, a.id !== moi().id && E.gere(c, a.id, a.services) && s().peut('COORDONNEES') && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleFiche(a); } }, 'Modifier') : null));
        })))));
  }
  function vueMaFiche() {
    var a = agent(moi().id) || { id: moi().id, nom: moi().nom, roles: moi().roles || [], services: moi().services || [], compte: true }, f = E.fiche(st(), a.id);
    var tp = champ('Téléphone professionnel', f.telPro, 'tel'), mp = champ('Courriel professionnel', f.mailPro, 'email'), fo = champ('Fonction', f.fonction);
    var tpe = champ('Téléphone personnel', '', 'tel'), mpe = champ('Courriel personnel', '', 'email');
    var accord = h('input', { type: 'checkbox', checked: !!f.accord }), zone = h('div', { class: 'pile' });
    function maj() { zone.hidden = !accord.checked; }
    accord.addEventListener('change', maj); maj();
    if (f.perso && f.accord) lirePerso(a).then(function (p) { if (p) { tpe.value = p.tel || ''; mpe.value = p.mail || ''; } });
    var lecteurs = 'le cadre de ' + (a.services.length > 1 ? 'vos services' : 'votre service') + ' et l’administrateur';
    zone.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Téléphone personnel', tpe), h('label', {}, 'Courriel personnel', mpe)));
    zone.appendChild(h('small', { class: 'muted', text: 'Chiffrées pour vous, ' + lecteurs + ' seulement.' }));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Ma fiche' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Téléphone professionnel', tp), h('label', {}, 'Courriel professionnel', mp), h('label', {}, 'Fonction (facultatif)', fo)),
      h('small', { class: 'muted', text: 'Vos coordonnées professionnelles sont visibles de tous les agents de l’établissement.' }),
      h('h3', { text: 'Coordonnées personnelles (facultatif)' }),
      h('label', { class: 'case' }, accord, h('span', { text: 'J’accepte que ' + lecteurs + ' disposent de mes coordonnées personnelles, pour me joindre en cas de rappel ou d’urgence de service. Je peux retirer cet accord à tout moment.' })),
      zone,
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          if (tp.value.trim() && !E.TEL.test(tp.value.trim())) throw new Error('Téléphone professionnel invalide.');
          await enregistrerFiche(a, { telPro: tp.value.trim(), mailPro: mp.value.trim(), fonction: fo.value.trim(), accord: accord.checked, perso: accord.checked ? { tel: tpe.value.trim(), mail: mpe.value.trim() } : null });
          U.toast('Fiche enregistrée.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }
  function vueMedecins() {
    var MED = SIC.medecins, mes = mesServices(), admin = s().roles().indexOf('ADMIN') >= 0;
    var l = (MED ? MED.liste(U.config()) : []).filter(function (m) { return admin || !m.services.length || m.services.some(function (x) { return mes.indexOf(x) >= 0; }); });
    var tbody = h('tbody');
    l.forEach(function (m) {
      var cell = h('td', { class: 'nowrap' }, h('span', { class: 'muted', text: '—' }));
      tbody.appendChild(h('tr', {}, h('td', { text: m.nom }), h('td', { text: (MED.FONCTIONS || {})[m.fonction] || m.fonction || '' }), h('td', { text: m.services.length ? m.services.map(U.libService).join(', ') : 'Tous' }), cell,
        h('td', { class: 'actions-ligne' }, s().peut('COORDONNEES_MEDECIN') && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleMedecin(m); } }, 'Modifier') : null)));
      lirePersoMedecin(m).then(function (p) { if (p && p.tel) { U.vider(cell); cell.appendChild(boutonCopie(p.tel, 'Copier le numéro')); } });
    });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Médecins : numéro personnel' }),
      h('p', { class: 'muted', text: 'Numéro personnel des médecins de vos services, chiffré pour le cadre et le médecin chef de service seulement. À n’utiliser que pour les urgences de service.' }),
      l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Médecin', 'Fonction', 'Services', 'Numéro personnel', ''].map(function (t) { return h('th', { text: t }); }))), tbody)) : h('p', { class: 'muted', text: 'Aucun médecin dans vos services.' }));
  }
  function modaleMedecin(m) {
    var tel = champ('Numéro personnel', '', 'tel');
    lirePersoMedecin(m).then(function (p) { if (p) tel.value = p.tel || ''; });
    U.modale('Numéro personnel — ' + m.nom, h('div', { class: 'pile' }, h('label', {}, 'Numéro personnel', tel),
      h('small', { class: 'muted', text: 'Chiffré pour le cadre et le médecin chef de service des services du médecin. Vide : retire le numéro.' })),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var v = tel.value.trim();
      if (v && !E.TEL.test(v)) throw new Error('Numéro invalide.');
      var noms = E.clesMedecin(m, U.tousServices().map(function (x) { return x.code; })).filter(function (n) { return !s().clesEnveloppeManquantes([n]).length; });
      if (v && !noms.length) throw new Error('Les clés des services du médecin ne sont pas encore créées : elles le seront à la prochaine connexion de l’administrateur.');
      await s().enregistrer('COORDONNEES_MEDECIN', { medecin: m.id, perso: v ? await s().chiffrerEnveloppe('medecin:' + m.id, noms, { tel: v }) : null });
      U.toast('Numéro enregistré.');
    } }]);
  }

  // ------------------------------------------------------------ Journal
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'COORDONNEES') { var a = agent(d.agent); return 'Fiche de ' + (a ? a.nom : d.agent) + (d.accord === false ? ' — accord retiré pour les coordonnées personnelles' : d.perso ? ' — coordonnées personnelles (chiffrées)' : ''); }
    if (e.type === 'COORDONNEES_MEDECIN') { var m = SIC.medecins && SIC.medecins.liste(U.config()).filter(function (x) { return x.id === d.medecin; })[0]; return 'Numéro personnel de ' + (m ? m.nom : d.medecin) + (d.perso ? ' (chiffré)' : ' retiré'); }
    return e.type;
  }
  var LIB = { COORDONNEES: 'Équipe : fiche d’un agent', COORDONNEES_MEDECIN: 'Équipe : numéro personnel d’un médecin' };

  SIC.modules.completerInterface('equipe', {
    vues: { annuaire: vueAnnuaire, 'ma-fiche': vueMaFiche, medecins: vueMedecins },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La fiche revient à son état précédent.'; } }
  });
  U.equipe = { contact: contact, lien: lien, agents: agents };
})();
