// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Retours sur Tessera — interface (lot O, 14 novembre 2026). Logique : module-retours.js.
 * Bouton « Signaler » de l'en-tête (toutes les fenêtres) ; fenêtre « Retours sur Tessera » : ses propres retours, et
 * pour le cadre et l'administrateur les retours à suivre (états, réponse à l'auteur, export).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, R = SIC.retours, C = SIC.crypto;
  var filtre = { etat: '', nature: '' };

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('retours') && s().etatModule('retours')) || { retours: {}, avis: [] }; }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return s().compteEffectif(); }
  function admin() { return s().roles().indexOf('ADMIN') >= 0; }
  function servicesSuivis() { return U.services().map(function (x) { return x.code; }); }
  function dateFr(iso) { return iso ? new Date(Date.parse(iso)).toLocaleDateString('fr-FR') : ''; }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var CLASSE = { nouveau: 'warn', retenu: '', ecarte: '', fait: 'ok' };

  /** Le bouton « Signaler » est-il proposé ? Module ouvert et droit de signaler, hors aperçu. */
  function disponible() { try { return !!s() && !s().apercu && s().ouvert('retours') && peut('RETOUR'); } catch (e) { return false; } }

  /** Écran ouvert au moment du signalement : fenêtre et onglet, en clair. */
  function ecranOuvert() {
    var id = U.App.fenetre, m = SIC.modules.obtenir(id);
    var fen = (m && m.libelle) || { admin: 'Administration', patients: 'Patients', aujourdhui: 'Aujourd’hui' }[id] || String(id || '');
    var b = document.querySelector('nav.onglets button[aria-current="page"]') || document.querySelector('nav.onglets button.actif');
    return { fenetre: fen, onglet: b ? b.textContent.trim().slice(0, 80) : String(U.App.onglet || '') };
  }
  function navigateur() {
    var ua = navigator.userAgent || '', m = /Edg\/(\d+)/.exec(ua) || null;
    if (m) return 'Edge ' + m[1];
    m = /Chrome\/(\d+)/.exec(ua); if (m) return 'Chrome ' + m[1];
    m = /Firefox\/(\d+)/.exec(ua); if (m) return 'Firefox ' + m[1];
    return ua.slice(0, 80);
  }

  /** Fenêtre de signalement, ouverte depuis l'en-tête. */
  function modaleSignaler() {
    if (!disponible()) return;
    var ecran = ecranOuvert(), services = U.services(), nom = 'nature-retour';
    var rDefaut = h('input', { type: 'radio', name: nom, value: 'defaut', checked: true }), rIdee = h('input', { type: 'radio', name: nom, value: 'idee' });
    var txt = h('textarea', { rows: 6, maxlength: 2000, placeholder: 'Ce qui ne va pas (ce que vous faisiez, ce qui s’est passé, ce que vous attendiez) ou votre idée.' });
    var sel = services.length > 1 ? h('select', { 'aria-label': 'Service' }, services.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === U.App.service }); })) : null;
    var contenu = h('div', { class: 'pile' },
      h('fieldset', {}, h('legend', { text: 'Il s’agit…' }), h('label', { class: 'case' }, rDefaut, ' d’un défaut (erreur, blocage, affichage)'), h('label', { class: 'case' }, rIdee, ' d’une amélioration (idée, besoin)')),
      h('label', {}, 'Description', txt),
      h('p', { class: 'alerte', text: 'Aucune donnée sur un patient (ni nom, ni initiales, ni numéro de chambre) : décrivez l’écran et la manipulation.' }),
      sel ? h('label', {}, 'Service', sel) : null,
      h('small', { class: 'muted', text: 'Joint automatiquement : ' + ecran.fenetre + (ecran.onglet ? ' → ' + ecran.onglet : '') + ', version ' + SIC.VERSION + ', ' + navigateur() + '. Le retour est signé de votre nom ; le cadre et l’administrateur le suivent et peuvent vous répondre.' }));
    return U.modale('Signaler un défaut ou proposer une amélioration', contenu, [
      { texte: 'Annuler' },
      { texte: 'Envoyer', classe: 'primaire', action: async function () {
        var service = sel ? sel.value : (services[0] || {}).code;
        await s().enregistrer('RETOUR', { id: 'R' + C.hex(C.aleatoire(6)), service: service, nature: rIdee.checked ? 'idee' : 'defaut', texte: txt.value.trim(),
          ecran: ecran, version: SIC.VERSION + (SIC.CANAL && SIC.CANAL !== 'stable' ? ' (' + SIC.libelleCanal.toLowerCase() + ')' : ''), navigateur: navigateur(), roles: (moi() && moi().roles) || [], nom: (moi() && moi().nom) || '' });
        U.toast('Merci : votre retour est enregistré.');
      } }
    ], { focus: txt });
  }

  // ------------------------------------------------------------ Liste
  function avisVus() { var p = s().preferences || {}; return Array.isArray(p.avisRetoursVus) ? p.avisRetoursVus : []; }
  function mesAvis() { try { return R.avisPour(st(), moi().id, avisVus()); } catch (e) { return []; } }
  async function marquerVus(ids) { try { await s().enregistrerPreference('avisRetoursVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }

  function retoursVisibles(f) { return R.liste(st(), { agent: moi().id, suivre: peut('RETOUR_SUIVI'), tous: admin(), services: servicesSuivis(), filtre: f }); }

  function carte(r) {
    var mien = r.par === moi().id;
    return h('article', { class: 'panneau retour-carte' },
      h('div', { class: 'barre' }, h('b', { text: R.numero(r) + ' — ' + R.NATURES[r.nature] }), h('div', { class: 'espace' }),
        h('span', { class: 'badge ' + CLASSE[r.etat], text: R.ETATS[r.etat] })),
      h('p', { text: r.texte }),
      h('small', { class: 'muted', text: dateFr(r.cree) + ' · ' + (mien ? 'vous' : r.nom || s().nomAuteur(r.par)) + ' · ' + U.libService(r.service) + ' · ' + [r.ecran.fenetre, r.ecran.onglet].filter(Boolean).join(' → ') + ' · version ' + r.version }),
      r.reponse ? h('p', { class: 'info', text: 'Réponse : ' + r.reponse }) : null,
      peut('RETOUR_SUIVI') && !s().apercu ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleSuivi(r); } }, 'Suivre…')) : null);
  }

  function vueRetours() {
    var suivre = peut('RETOUR_SUIVI'), ls = retoursVisibles(filtre), av = mesAvis();
    function selF(cle, libelle, valeurs) {
      return h('label', {}, libelle, h('select', { onchange: function (ev) { filtre[cle] = ev.target.value; U.rendreContenu(); } },
        [h('option', { value: '', text: 'Tous' })].concat(Object.keys(valeurs).map(function (k) { return h('option', { value: k, text: valeurs[k], selected: filtre[cle] === k }); }))));
    }
    return h('div', {},
      av.length ? h('section', { class: 'panneau ag-avis', role: 'status' }, h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' réponses à vos retours' : 'Une réponse à votre retour' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Marquer vu')),
        h('ul', { class: 'liste-simple' }, av.map(function (a) { var r = st().retours[a.retour]; return h('li', { text: R.numero(r) + ' : ' + R.ETATS[a.etat].toLowerCase() + (a.reponse ? ' — ' + a.reponse : '') + ' (' + (a.nom || s().nomAuteur(a.par)) + ', ' + dateFr(a.le) + ')' }); }))) : null,
      h('div', { class: 'barre' }, h('h1', { text: suivre ? 'Retours des agents' : 'Mes retours' }), h('div', { class: 'espace' }),
        disponible() ? h('button', { class: 'btn primaire', type: 'button', onclick: modaleSignaler }, '+ Signaler') : null),
      h('div', { class: 'actions gauche' }, selF('etat', 'État', R.ETATS), selF('nature', 'Nature', R.NATURES), h('div', { class: 'espace' }),
        suivre ? h('button', { class: 'btn petit', type: 'button', onclick: function () { exporterListe(ls); } }, 'Exporter (tableur)') : null),
      ls.length ? h('div', { class: 'pile' }, ls.map(carte)) : h('p', { class: 'muted', text: 'Aucun retour' + (filtre.etat || filtre.nature ? ' pour ces filtres.' : '.') }),
      h('small', { class: 'muted', text: suivre ? 'Retours de vos services' + (admin() ? ' (tous les services pour l’administrateur)' : '') + ' et les vôtres, du plus récent au plus ancien. L’export sert à transmettre la liste au porteur du projet ; il ne contient aucune donnée de patient si les retours n’en contiennent pas.' : 'Vos retours et les réponses du cadre ou de l’administrateur.' }));
  }

  function modaleSuivi(r) {
    var sel = h('select', { 'aria-label': 'État du retour' }, Object.keys(R.ETATS).map(function (k) { return h('option', { value: k, text: R.ETATS[k], selected: r.etat === k }); }));
    var rep = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'Réponse lue par l’auteur (facultative, obligatoire pour écarter un retour)' });
    var contenu = h('div', { class: 'pile' }, h('p', {}, h('b', { text: R.numero(r) + ' — ' + R.NATURES[r.nature] })), h('p', { text: r.texte }),
      h('small', { class: 'muted', text: (r.nom || s().nomAuteur(r.par)) + ' (' + r.roles.join(', ') + ') · ' + dateFr(r.cree) + ' · ' + [r.ecran.fenetre, r.ecran.onglet].filter(Boolean).join(' → ') + ' · version ' + r.version + ' · ' + r.navigateur }),
      r.suivi.length ? h('ul', { class: 'liste-simple' }, r.suivi.map(function (x) { return h('li', { text: dateFr(x.le) + ' — ' + R.ETATS[x.etat] + ' (' + (x.nom || s().nomAuteur(x.par)) + ')' + (x.reponse ? ' : ' + x.reponse : '') }); })) : null,
      h('label', {}, 'État', sel), h('label', {}, 'Réponse à l’auteur', rep));
    return U.modale('Suivre le retour ' + R.numero(r), contenu, [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var d = { retour: r.id, service: r.service, etat: sel.value, nom: (moi() && moi().nom) || '' };
        if (rep.value.trim()) d.reponse = rep.value.trim();
        await s().enregistrer('RETOUR_SUIVI', d);
        U.toast('Suivi enregistré.');
      } }
    ], { focus: sel });
  }

  function exporterListe(ls) {
    var lignes = R.lignesExport(ls, function (id) { return s().nomAuteur(id); });
    var csv = '﻿' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('retours', 'retours_tessera_' + jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }

  // ------------------------------------------------------------ Journal
  var LIB = { RETOUR: 'Retours : signalement', RETOUR_SUIVI: 'Retours : suivi' };
  function resume(e) {
    var d = e.data || {}, r = st().retours[d.id || d.retour], nom = r ? R.numero(r) : 'retour';
    if (e.type === 'RETOUR') return 'Nouveau retour ' + nom + ' (' + (R.NATURES[d.nature] || '') + ') : ' + (d.texte || '');
    if (e.type === 'RETOUR_SUIVI') return nom + ' : ' + (R.ETATS[d.etat] || d.etat) + (d.reponse ? ' — ' + d.reponse : '');
    return e.type;
  }

  SIC.modules.completerInterface('retours', {
    vues: { retours: vueRetours },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le retour revient à son état précédent.'; } },
    informations: function () {
      var res = [];
      try {
        if (peut('RETOUR_SUIVI')) R.aTraiter(st(), servicesSuivis(), admin()).forEach(function (r) {
          res.push({ id: 'rt-n-' + r.id, niveau: '', titre: 'Retour à suivre : ' + R.numero(r) + ' (' + R.NATURES[r.nature].toLowerCase() + ')', detail: r.texte.slice(0, 120), ouvrir: function () { modaleSuivi(r); } });
        });
        mesAvis().forEach(function (a) {
          var r = st().retours[a.retour];
          res.push({ id: 'rt-a-' + a.id, niveau: '', titre: 'Réponse à votre retour ' + R.numero(r) + ' : ' + R.ETATS[a.etat].toLowerCase(), detail: a.reponse, vu: function () { return marquerVus([a.id]); } });
        });
      } catch (e) { /* module illisible : rien à afficher */ }
      return res;
    },
    pastille: function () { try { return (peut('RETOUR_SUIVI') ? R.aTraiter(st(), servicesSuivis(), admin()).length : 0) + mesAvis().length; } catch (e) { return 0; } }
  });
  U.retours = { modaleSignaler: modaleSignaler, disponible: disponible };
})();
