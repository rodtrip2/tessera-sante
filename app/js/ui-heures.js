// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Heures supplémentaires — interface (lot C, 14 novembre 2026). Logique : module-heures.js.
 * Mes heures (solde, déclarations, récupérations), À valider (décisions, enregistrement dans le logiciel de gestion du
 * temps, soldes et corrections), Totaux (agents, mois, motifs ; export).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, HS = SIC.heures, C = SIC.crypto;
  var annee = new Date().getFullYear();

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('heures') && s().etatModule('heures')) || { declarations: {}, recups: {}, corrections: {}, avis: [] }; }
  function cfg() { return U.config(); }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return Object.assign({}, s().compteEffectif() || {}, { roles: s().roles() }); }
  function lecture() { return !!s().apercu; }
  function fr(iso) { return iso ? String(iso).split('-').reverse().join('/') : ''; }
  function services() { return U.services().map(function (x) { return x.code; }); }
  function libMotif(c) { var m = HS.options(cfg()).motifs.filter(function (x) { return x.code === c; })[0]; return m ? m.libelle : c; }
  var CLASSE = { demande: 'warn', recuperation: 'ok', paiement: 'ok', valide: 'ok', refuse: 'bad', annule: '' };
  function vus() { return (s().preferences && s().preferences.heuresVus) || []; }
  async function marquerVus(ids) { try { await s().enregistrerPreference('heuresVus', vus().concat(ids).slice(-300)); } catch (e) { /* sans conséquence */ } }
  function quand(x) { return fr(x.date) + (x.debut ? ' ' + x.debut + '–' + x.fin : ''); }

  // ------------------------------------------------------------ Saisies
  /** Déclaration d'heures ou demande de récupération : date, horaires ou durée (heures et minutes). */
  function modaleSaisie(genre) {
    var recup = genre === 'recup', o = HS.options(cfg());
    var date = h('input', { type: 'date', value: SIC.model.dateLocaleISO(Date.now()) }), debut = h('input', { type: 'time' }), fin = h('input', { type: 'time' });
    var dureeCh = h('input', { type: 'text', placeholder: 'ex. 1:30', class: 'champ-court', 'aria-label': 'Durée (heures:minutes)' });
    var motif = recup ? null : h('select', { 'aria-label': 'Motif' }, [h('option', { value: '', text: '— Choisir —' })].concat(o.motifs.map(function (m) { return h('option', { value: m.code, text: m.libelle }); })));
    var com = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Commentaire', placeholder: 'Sans donnée clinique ni nom de patient' });
    function majDuree() { var d = HS.duree(debut.value, fin.value); if (d !== null) dureeCh.value = Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0'); }
    debut.addEventListener('change', majDuree); fin.addEventListener('change', majDuree);
    var so = HS.solde(st(), moi().id, annee);
    U.modale(recup ? 'Demander une récupération' : 'Déclarer des heures supplémentaires', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'De (facultatif)', debut), h('label', {}, 'À (facultatif)', fin)),
      h('label', { class: 'en-ligne' }, 'Durée (heures:minutes)', dureeCh),
      motif ? h('label', {}, 'Motif', motif) : h('p', { class: 'muted', text: 'Solde disponible : ' + HS.hm(Math.max(0, so.disponible)) + '.' }),
      h('label', {}, 'Commentaire (facultatif)', com),
      h('small', { class: 'muted', text: 'Le logiciel de gestion du temps de l’établissement reste la référence : Tessera ne calcule pas la paie.' })),
      [{ texte: 'Annuler' }, { texte: recup ? 'Demander' : 'Déclarer', classe: 'primaire', action: async function () {
        var min = HS.lireDuree(dureeCh.value);
        if (min === null) throw new Error('Durée illisible : écrivez par exemple 1:30, 1h30 ou 90 (minutes).');
        if ((debut.value || fin.value) && HS.duree(debut.value, fin.value) !== min) throw new Error('La durée ne correspond pas aux horaires.');
        var c = moi();
        await s().enregistrer(recup ? 'HEURES_RECUP' : 'HEURES_DECLARATION', { id: (recup ? 'HR-' : 'HD-') + C.hex(C.aleatoire(6)), date: date.value, debut: debut.value || '', fin: fin.value || '', minutes: min, motif: motif ? motif.value : undefined,
          commentaire: com.value.trim(), service: U.App.service !== '*' && (c.services || []).indexOf(U.App.service) >= 0 ? U.App.service : (c.services || [])[0] || '', nom: c.nom || '', roles: c.roles });
        U.toast(recup ? 'Récupération demandée à votre validateur.' : 'Heures déclarées : envoyées à votre validateur.');
      } }]);
  }
  function decider(x, decision) {
    var o = HS.options(cfg()), recup = x.genre === 'recup', motif = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Motif' });
    var ret = h('input', { type: 'text', value: Math.floor(x.minutes / 60) + ':' + String(x.minutes % 60).padStart(2, '0'), class: 'champ-court', 'aria-label': 'Durée retenue' });
    var choix = !recup && decision !== 'refuse' ? h('select', { 'aria-label': 'Acceptées en' }, [h('option', { value: 'recuperation', text: 'Récupération', selected: decision === 'recuperation' })].concat(o.paiement ? [h('option', { value: 'paiement', text: 'Heures payées', selected: decision === 'paiement' })] : [])) : null;
    var titre = decision === 'refuse' ? 'Refuser' : recup ? 'Valider la récupération' : 'Accepter les heures';
    U.modale(titre, h('div', { class: 'pile' }, h('p', { text: (x.nom || s().nomAuteur(x.agent)) + ' — ' + quand(x) + ' — ' + HS.hm(x.minutes) + (recup ? ' (récupération)' : ' — ' + libMotif(x.motif)) }),
      x.commentaire ? h('p', { class: 'muted', text: 'Commentaire : ' + x.commentaire }) : null,
      choix ? h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Acceptées en', choix), h('label', { class: 'en-ligne' }, 'Durée retenue', ret)) : null,
      choix && o.plafondMensuel ? h('small', { class: 'muted', text: 'Plafond mensuel des heures payées : ' + HS.hm(o.plafondMensuel) + ' (déjà acceptées ce mois : ' + HS.hm(HS.payeesDuMois(st(), x.agent, String(x.date).slice(0, 7))) + ').' }) : null,
      h('label', {}, decision === 'refuse' ? 'Motif (obligatoire, communiqué à l’agent)' : 'Message à l’agent (facultatif)', motif)),
      [{ texte: 'Annuler' }, { texte: titre, classe: decision === 'refuse' ? 'danger' : 'primaire', action: async function () {
        if (recup) { await s().enregistrer('HEURES_RECUP_DECISION', { recup: x.id, decision: decision === 'refuse' ? 'refuse' : 'valide', motif: motif.value.trim(), service: x.service, nom: moi().nom || '' }); }
        else {
          var m = decision === 'refuse' ? 0 : HS.lireDuree(ret.value);
          if (decision !== 'refuse' && m === null) throw new Error('Durée retenue illisible (ex. 1:30).');
          await s().enregistrer('HEURES_DECISION', { declaration: x.id, decision: decision === 'refuse' ? 'refuse' : choix.value, minutes: m, motif: motif.value.trim(), service: x.service, nom: moi().nom || '' });
        }
        U.toast('Décision enregistrée.');
      } }]);
  }
  function corriger(agent) {
    var so = HS.solde(st(), agent.id, annee), val = h('input', { type: 'text', placeholder: 'ex. 2:00 ou -1:30', class: 'champ-court', 'aria-label': 'Correction' }), motif = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Motif' });
    U.modale('Corriger le solde : ' + agent.nom, h('div', { class: 'pile' }, h('p', { text: 'Solde calculé ' + annee + ' : ' + HS.hm(so.calcule) + (so.corrections ? ' ; corrections déjà faites : ' + HS.hm(so.corrections) : '') + ' ; solde retenu : ' + HS.hm(so.solde) + '.' }),
      h('label', { class: 'en-ligne' }, 'Correction (heures:minutes, négative avec « - »)', val), h('label', {}, 'Motif (ex. reprise du solde du logiciel de gestion du temps)', motif)),
      [{ texte: 'Annuler' }, { texte: 'Corriger', classe: 'primaire', action: async function () {
        var neg = /^\s*-/.test(val.value), m = HS.lireDuree(val.value.replace(/^\s*-/, ''));
        if (m === null || !m) throw new Error('Correction illisible (ex. 2:00 ou -1:30).');
        await s().enregistrer('HEURES_CORRECTION', { agent: agent.id, annee: String(annee), minutes: neg ? -m : m, motif: motif.value.trim(), service: (agent.services || [])[0] || '', roles: agent.roles || [] });
        U.toast('Solde corrigé.');
      } }]);
  }
  async function simple(type, d, msg) { try { await s().enregistrer(type, d); U.toast(msg); U.rendreContenu(); } catch (e) { U.toast(e.message); } }

  // ------------------------------------------------------------ Vues
  function tableau(l, colonnes, actions) {
    return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, colonnes.map(function (c) { return h('th', { text: c[0] }); }).concat([h('th')]))),
      h('tbody', {}, l.map(function (x) { return h('tr', {}, colonnes.map(function (c) { return h('td', {}, c[1](x)); }).concat([h('td', { class: 'actions-ligne' }, actions ? actions(x) : null)])); }))));
  }
  function badge(x) { return h('span', { class: 'badge ' + CLASSE[x.statut], text: HS.STATUTS[x.statut] + (x.genre === 'declaration' && x.retenues !== null && x.retenues !== x.minutes && x.statut !== 'refuse' ? ' (' + HS.hm(x.retenues) + ' retenues)' : '') }); }
  function vueMesHeures() {
    var c = moi(), so = HS.solde(st(), c.id, annee), l = HS.deAgent(st(), c.id, annee), av = HS.avisPour(st(), c.id, vus());
    if (av.length) setTimeout(function () { marquerVus(av.map(function (a) { return a.id; })); }, 1500);
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Mes heures ' + annee }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { annee--; U.rendreContenu(); } }, '◀'), h('button', { class: 'btn petit', type: 'button', onclick: function () { annee++; U.rendreContenu(); } }, '▶'),
        !lecture() && peut('HEURES_DECLARATION') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleSaisie('declaration'); } }, '+ Déclarer des heures') : null,
        !lecture() && peut('HEURES_RECUP') ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleSaisie('recup'); } }, '+ Demander une récupération') : null),
      h('div', { class: 'hs-solde' }, [['Acquises en récupération', so.acquises], ['Récupérées', so.recuperees], ['Demandées, à valider', so.demandees], ['Corrections du cadre', so.corrections], ['Solde', so.solde], ['Disponible', so.disponible]].map(function (x) {
        return h('div', { class: 'hs-case' }, h('small', { class: 'muted', text: x[0] }), h('b', { text: HS.hm(x[1]) }));
      })),
      h('small', { class: 'muted', text: 'Le logiciel de gestion du temps de l’établissement reste la référence ; le solde affiché ici n’est qu’une indication.' }),
      l.length ? tableau(l, [['Date', quand], ['Nature', function (x) { return x.genre === 'recup' ? 'Récupération' : 'Heures supplémentaires — ' + libMotif(x.motif); }], ['Durée', function (x) { return HS.hm(x.minutes); }], ['État', badge],
        ['Message', function (x) { return x.motifDecision || ''; }], ['Logiciel', function (x) { return x.gtt ? 'enregistrée' : ''; }]],
        function (x) { return x.statut === 'demande' && !lecture() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { simple('HEURES_ANNULATION', { objet: x.id, service: x.service }, 'Demande annulée.'); } }, 'Annuler') : null; })
        : h('p', { class: 'muted', text: 'Aucune saisie en ' + annee + '.' }));
  }
  function vueAValider() {
    var c = moi(), av = HS.aValider(st(), cfg(), s().comptes || [], c), o = HS.options(cfg()), ae = HS.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services());
    // Agents dont on est le validateur : comptes actifs, et agents vus dans les saisies (repris d'un autre outil, sans compte)
    var vusIds = {}, e = st(), agents = (s().comptes || []).filter(function (a) { return a.actif !== false; }).map(function (a) { vusIds[a.id] = 1; return a; });
    Object.keys(e.declarations).map(function (k) { return e.declarations[k]; }).concat(Object.keys(e.recups).map(function (k) { return e.recups[k]; })).forEach(function (x) {
      if (!vusIds[x.agent]) { vusIds[x.agent] = 1; agents.push(Object.assign(HS.agentDe(x, s().comptes), { nom: x.nom || s().nomAuteur(x.agent) })); }
    });
    Object.keys(e.corrections).forEach(function (k) { var id = k.split('|')[0]; if (!vusIds[id]) { vusIds[id] = 1; agents.push({ id: id, nom: s().nomAuteur(id), roles: [], services: [] }); } });
    agents = agents.filter(function (a) { return HS.valide(cfg(), c, a); }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Heures à valider' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Demandes (' + av.length + ')' }), av.length ? tableau(av, [['Agent', function (x) { return x.nom || s().nomAuteur(x.agent); }], ['Date', quand], ['Nature', function (x) { return x.genre === 'recup' ? 'Récupération' : libMotif(x.motif); }], ['Durée', function (x) { return HS.hm(x.minutes); }], ['Commentaire', function (x) { return x.commentaire; }]],
        function (x) {
          if (lecture()) return null;
          if (x.genre === 'recup') return [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(x, 'valide'); } }, 'Valider'), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(x, 'refuse'); } }, 'Refuser')];
          return [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(x, 'recuperation'); } }, 'En récupération'), o.paiement ? h('button', { class: 'btn petit', type: 'button', onclick: function () { decider(x, 'paiement'); } }, 'En heures payées') : null, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(x, 'refuse'); } }, 'Refuser')];
        }) : h('p', { class: 'muted', text: 'Aucune demande à valider.' })),
      HS.confirmeGtt(cfg(), s().roles()) ? h('section', { class: 'panneau' }, h('h2', { text: 'À enregistrer dans le logiciel de gestion du temps (' + ae.length + ')' }), ae.length ? tableau(ae, [['Agent', function (x) { return x.nom || s().nomAuteur(x.agent); }], ['Date', quand], ['Nature', function (x) { return x.genre === 'recup' ? 'Récupération' : HS.STATUTS[x.statut]; }], ['Durée', function (x) { return HS.hm(x.genre === 'recup' ? x.minutes : x.retenues); }]],
        function (x) { return lecture() ? null : h('button', { class: 'btn petit', type: 'button', onclick: function () { simple('HEURES_ENREGISTREE', { objet: x.id, service: x.service, nom: moi().nom || '' }, 'Enregistrée dans le logiciel de gestion du temps.'); } }, 'Enregistrée'); })
        : h('p', { class: 'muted', text: 'Rien à enregistrer.' })) : null,
      agents.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Soldes ' + annee + ' des agents' }), tableau(agents.map(function (a) { return { a: a, so: HS.solde(st(), a.id, annee) }; }),
        [['Agent', function (x) { return x.a.nom; }], ['Calculé', function (x) { return HS.hm(x.so.calcule); }], ['Corrections', function (x) { return HS.hm(x.so.corrections); }], ['Solde', function (x) { return HS.hm(x.so.solde); }]],
        function (x) { return lecture() || !peut('HEURES_CORRECTION') ? null : h('button', { class: 'btn petit', type: 'button', onclick: function () { corriger(x.a); } }, 'Corriger…'); })) : null);
  }
  function vueTotaux() {
    var t = HS.totaux(st(), annee, s().roles().indexOf('ADMIN') >= 0 ? null : services()), ags = Object.keys(t.agents).map(function (k) { return t.agents[k]; }), mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    function exporter() {
      var e = st(), l = Object.keys(e.declarations).map(function (k) { return e.declarations[k]; }).concat(Object.keys(e.recups).map(function (k) { return e.recups[k]; })).filter(function (x) { return String(x.date).slice(0, 4) === String(annee) && (s().roles().indexOf('ADMIN') >= 0 || !x.service || services().indexOf(x.service) >= 0); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      var csv = '﻿' + HS.lignesExport(l, cfg(), U.libService).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
      U.exporter('registres', 'heures_supplementaires_' + annee + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
    }
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Totaux ' + annee }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { annee--; U.rendreContenu(); } }, '◀'), h('button', { class: 'btn petit', type: 'button', onclick: function () { annee++; U.rendreContenu(); } }, '▶'),
        h('button', { class: 'btn', type: 'button', onclick: exporter }, 'Exporter (CSV)')),
      h('section', { class: 'panneau' }, h('h2', { text: 'Par agent (heures acceptées)' }), ags.length ? tableau(ags, [['Agent', function (x) { return x.nom; }], ['En récupération', function (x) { return HS.hm(x.recuperation); }], ['Payées', function (x) { return HS.hm(x.paiement); }]]) : h('p', { class: 'muted', text: 'Aucune heure acceptée.' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Par mois' }), h('div', { class: 'table-wrap' }, h('table', {}, h('tr', {}, mois.map(function (m) { return h('th', { text: m }); })), h('tr', {}, mois.map(function (m, i) { return h('td', { text: HS.hm(t.mois[String(i + 1).padStart(2, '0')] || 0) }); }))))),
      h('section', { class: 'panneau' }, h('h2', { text: 'Par motif' }), h('ul', { class: 'liste-simple' }, Object.keys(t.motifs).map(function (k) { return h('li', { text: libMotif(k) + ' : ' + HS.hm(t.motifs[k]) }); }))));
  }

  // ------------------------------------------------------------ Réglages (administrateur)
  function panneauReglages() {
    var o = HS.options(cfg()), motifs = h('textarea', { rows: 6, 'aria-label': 'Motifs, un par ligne' }); motifs.value = o.motifs.map(function (m) { return m.libelle; }).join('\n');
    var pay = h('input', { type: 'checkbox', checked: o.paiement }), plaf = h('input', { type: 'text', value: o.plafondMensuel ? Math.floor(o.plafondMensuel / 60) + ':' + String(o.plafondMensuel % 60).padStart(2, '0') : '', placeholder: 'sans plafond', class: 'champ-court', 'aria-label': 'Plafond mensuel' });
    var etape = h('input', { type: 'checkbox', checked: o.etapeGtt });
    var roles = SIC.model.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: o.rolesGtt.indexOf(r.code) >= 0 }) }; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Heures supplémentaires' }),
      h('label', {}, 'Motifs proposés, un par ligne', motifs),
      h('label', { class: 'case' }, pay, h('span', { text: 'Le validateur peut accepter des heures payées (règles de l’établissement, à voir avec les ressources humaines)' })),
      h('label', { class: 'en-ligne' }, 'Plafond mensuel des heures payées par agent (heures:minutes)', plaf),
      h('label', { class: 'case' }, etape, h('span', { text: 'Étape « Enregistrée dans le logiciel de gestion du temps » après la décision' })),
      h('p', { class: 'muted', text: 'Rôles qui confirment l’enregistrement :' }), h('div', { class: 'actions gauche' }, roles.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: x.r.libelle })); })),
      h('small', { class: 'muted', text: 'Validateur : celui des Congés (cadre pour les IDE, AS et secrétaires ; cadre supérieur pour les cadres…). Données du personnel : fonction soumise à avis (onglet « Validations »). Tessera ne calcule pas la paie.' }),
      U.boutonEnregistrer(async function () {
        var pl = plaf.value.trim() ? HS.lireDuree(plaf.value) : null;
        if (plaf.value.trim() && !pl) throw new Error('Plafond illisible (ex. 20:00).');
        var ms = motifs.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (l) { var ex = o.motifs.filter(function (m) { return m.libelle === l; })[0]; return { code: ex ? ex.code : l.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30), libelle: l }; });
        await U.enregistrerConfig([['heures', { motifs: ms, paiement: pay.checked, plafondMensuel: pl, etapeGtt: etape.checked, rolesGtt: roles.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r.code; }) }]]);
      }));
  }

  // ------------------------------------------------------------ Informations, journal
  function informations() {
    var res = [];
    try {
      var c = moi();
      HS.avisPour(st(), c.id, vus()).forEach(function (a) { var x = st().declarations[a.objet] || st().recups[a.objet]; res.push({ id: 'hs-a-' + a.id, niveau: a.statut === 'refuse' ? 'bad' : '', titre: (x && x.genre === 'recup' ? 'Récupération du ' : 'Heures du ') + (x ? fr(x.date) : '') + ' : ' + HS.STATUTS[a.statut].toLowerCase(), detail: a.motif || '', vu: function () { return marquerVus([a.id]); }, ouvrir: function () { U.App.ongletsFenetres.heures = 'mes-heures'; U.ouvrirFenetre('heures'); } }); });
      var av = HS.aValider(st(), cfg(), s().comptes || [], c);
      if (av.length) res.push({ id: 'hs-v-' + av.length, niveau: 'warn', titre: 'Heures et récupérations à valider : ' + av.length, ouvrir: function () { U.App.ongletsFenetres.heures = 'a-valider'; U.ouvrirFenetre('heures'); } });
      var ae = HS.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services());
      if (ae.length) res.push({ id: 'hs-g-' + ae.length, niveau: '', titre: 'Heures à enregistrer dans le logiciel de gestion du temps : ' + ae.length, ouvrir: function () { U.App.ongletsFenetres.heures = 'a-valider'; U.ouvrirFenetre('heures'); } });
    } catch (e) { /* module illisible */ }
    return res;
  }
  var LIB = { HEURES_DECLARATION: 'Heures déclarées', HEURES_DECISION: 'Décision sur des heures', HEURES_RECUP: 'Récupération demandée', HEURES_RECUP_DECISION: 'Décision sur une récupération', HEURES_ENREGISTREE: 'Enregistrée dans le logiciel de gestion du temps', HEURES_ANNULATION: 'Demande annulée', HEURES_CORRECTION: 'Solde corrigé' };
  function resume(e) {
    var d = e.data || {}, x = st().declarations[d.declaration || d.objet || d.id] || st().recups[d.recup || d.objet || d.id];
    if (e.type === 'HEURES_CORRECTION') return s().nomAuteur(d.agent) + ' ' + d.annee + ' : ' + HS.hm(d.minutes) + ' — ' + (d.motif || '');
    return (x ? (x.nom || '') + ', ' + fr(x.date) + ', ' + HS.hm(x.minutes) : (d.date ? fr(d.date) + ', ' + HS.hm(d.minutes) : '')) + (d.decision ? ' — ' + HS.STATUTS[d.decision] : '') + (d.motif && e.type !== 'HEURES_DECLARATION' ? ' — ' + d.motif : '');
  }
  SIC.modules.completerInterface('heures', {
    vues: { 'mes-heures': vueMesHeures, 'a-valider': vueAValider, totaux: vueTotaux },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La saisie est retirée.'; } },
    admin: { onglets: function () { return [['heures', 'Heures supplémentaires', [panneauReglages()]]]; } },
    informations: informations,
    pastille: function () { try { return informations().length; } catch (e) { return 0; } }
  });
  U.heures = { informations: informations };
})();
