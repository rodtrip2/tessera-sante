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
  function libMotif(x) { return HS.libMotif(cfg(), x); }
  var CLASSE = { demande: 'warn', recuperation: 'ok', paiement: 'ok', deduit: 'ok', valide: 'ok', refuse: 'bad', annule: '' };
  function hmm(min) { var a = Math.abs(min); return Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0'); }
  function signe(x) { return x.genre === 'declaration' ? (x.minutes > 0 ? '+' : '') + HS.hm(x.minutes) : HS.hm(x.minutes); }
  function nature(x) { return x.genre === 'recup' ? 'Récupération' : (x.minutes < 0 ? 'Heures en moins' : 'Heures en plus') + ' — ' + libMotif(x); }
  function vus() { return (s().preferences && s().preferences.heuresVus) || []; }
  async function marquerVus(ids) { try { await s().enregistrerPreference('heuresVus', vus().concat(ids).slice(-300)); } catch (e) { /* sans conséquence */ } }
  function quand(x) { return fr(x.date) + (x.prevuDebut || x.repos ? ' — prévu ' + (x.repos ? 'repos' : x.prevuDebut + '–' + x.prevuFin + (x.poste ? ' (' + x.poste + ')' : '')) + ', effectué ' + x.debut + '–' + x.fin : x.debut ? ' ' + x.debut + '–' + x.fin : ''); }
  function serviceDe(c) { return U.App.service !== '*' && (c.services || []).indexOf(U.App.service) >= 0 ? U.App.service : (c.services || [])[0] || ''; }

  // ------------------------------------------------------------ Saisies
  /**
   * Déclaration : horaire prévu (raccourcis : postes du service) puis horaire réellement effectué ; l'écart donne les
   * heures en plus ou en moins (correction du porteur du 15 novembre 2026). Motif de la liste ou motif libre.
   */
  function modaleDeclaration() {
    var o = HS.options(cfg()), c = moi(), sv = serviceDe(c), postes = HS.postesDe(cfg(), sv);
    var date = h('input', { type: 'date', value: SIC.model.dateLocaleISO(Date.now()) });
    var pd = h('input', { type: 'time', 'aria-label': 'Prévu, début' }), pf = h('input', { type: 'time', 'aria-label': 'Prévu, fin' });
    var ed = h('input', { type: 'time', 'aria-label': 'Effectué, début' }), ef = h('input', { type: 'time', 'aria-label': 'Effectué, fin' });
    var poste = '', repos = false, res = h('p', { class: 'hs-ecart muted', role: 'status', text: 'Indiquez l’horaire prévu puis l’horaire effectué.' });
    var motif = h('select', { 'aria-label': 'Motif' }, [h('option', { value: '', text: '— Choisir —' })].concat(o.motifs.map(function (m) { return h('option', { value: m.code, text: m.libelle }); }), [h('option', { value: '__libre', text: 'Autre motif (à écrire)…' })]));
    var libre = h('input', { type: 'text', maxlength: 120, 'aria-label': 'Autre motif', placeholder: 'Motif, sans donnée clinique ni nom de patient', hidden: true });
    motif.addEventListener('change', function () { libre.hidden = motif.value !== '__libre'; if (!libre.hidden) libre.focus(); });
    var com = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Commentaire', placeholder: 'Sans donnée clinique ni nom de patient' });
    function maj() {
      var e = HS.ecart(pd.value, pf.value, ed.value, ef.value, repos);
      res.classList.remove('ok', 'bad');
      if (e === null) { res.textContent = 'Indiquez l’horaire prévu puis l’horaire effectué.'; return; }
      res.textContent = e > 0 ? 'Heures en plus : +' + HS.hm(e) : e < 0 ? 'Heures en moins : ' + HS.hm(e) : 'Aucun écart avec l’horaire prévu.';
      if (e) res.classList.add(e > 0 ? 'ok' : 'bad');
    }
    [pd, pf, ed, ef].forEach(function (x) { x.addEventListener('change', maj); x.addEventListener('input', maj); });
    function choisir(p) { repos = !p; poste = p ? p.libelle : 'Repos'; pd.value = p ? p.debut : ''; pf.value = p ? p.fin : ''; pd.disabled = pf.disabled = repos; }
    pd.addEventListener('change', function () { poste = ''; }); pf.addEventListener('change', function () { poste = ''; });
    var raccourcis = postes.length ? h('div', { class: 'actions gauche' }, h('small', { class: 'muted', text: 'Poste prévu :' }), postes.map(function (p) {
      return h('button', { class: 'btn petit', type: 'button', title: p.debut + '–' + p.fin, onclick: function () {
        choisir(p);
        if (!ed.value && !ef.value) { ed.value = p.debut; ef.value = p.fin; }
        maj(); (ef.value === p.fin ? ef : ed).focus();
      } }, p.libelle + ' (' + p.debut + '–' + p.fin + ')');
    }), h('button', { class: 'btn petit', type: 'button', title: 'Rappel sur un jour de repos : aucun horaire prévu', onclick: function () { choisir(null); maj(); ed.focus(); } }, 'Repos (rappel)'))
      : h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { choisir(null); maj(); ed.focus(); } }, 'Repos (rappel)'));
    U.modale('Déclarer des heures en plus ou en moins', h('div', { class: 'pile' },
      h('label', { class: 'en-ligne' }, 'Date', date),
      h('fieldset', { class: 'hs-horaire' }, h('legend', { text: 'Horaire prévu' }), raccourcis, h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'De', pd), h('label', { class: 'en-ligne' }, 'à', pf))),
      h('fieldset', { class: 'hs-horaire' }, h('legend', { text: 'Horaire réellement effectué' }), h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'De', ed), h('label', { class: 'en-ligne' }, 'à', ef))),
      res,
      h('label', {}, 'Motif', motif), libre,
      h('label', {}, 'Commentaire (facultatif)', com),
      h('small', { class: 'muted', text: 'Le logiciel de gestion du temps de l’établissement reste la référence : Tessera ne calcule pas la paie.' })),
      [{ texte: 'Annuler' }, { texte: 'Déclarer', classe: 'primaire', action: async function () {
        var e = HS.ecart(pd.value, pf.value, ed.value, ef.value, repos);
        if (e === null) throw new Error('Indiquez l’horaire prévu et l’horaire effectué (début et fin).');
        if (!e) throw new Error('L’horaire effectué est identique à l’horaire prévu : aucune heure en plus ni en moins.');
        var lib = motif.value === '__libre';
        if (lib && !libre.value.trim()) throw new Error('Écrivez le motif.');
        await s().enregistrer('HEURES_DECLARATION', { id: 'HD-' + C.hex(C.aleatoire(6)), date: date.value, repos: repos, prevuDebut: repos ? '' : pd.value, prevuFin: repos ? '' : pf.value, poste: poste, debut: ed.value, fin: ef.value, minutes: e,
          motif: lib ? '' : motif.value, motifLibre: lib ? libre.value.trim() : '', commentaire: com.value.trim(), service: sv, nom: c.nom || '', roles: c.roles });
        U.toast((e > 0 ? 'Heures en plus' : 'Heures en moins') + ' déclarées : envoyées à votre validateur.');
      } }]);
  }
  /** Demande de récupération : date, horaires facultatifs ou durée (heures et minutes), dans la limite du disponible. */
  function modaleRecup() {
    var date = h('input', { type: 'date', value: SIC.model.dateLocaleISO(Date.now()) }), debut = h('input', { type: 'time' }), fin = h('input', { type: 'time' });
    var dureeCh = h('input', { type: 'text', placeholder: 'ex. 1:30', class: 'champ-court', 'aria-label': 'Durée (heures:minutes)' });
    var com = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Commentaire' });
    function majDuree() { var d = HS.duree(debut.value, fin.value); if (d !== null) dureeCh.value = hmm(d); }
    debut.addEventListener('change', majDuree); fin.addEventListener('change', majDuree);
    var so = HS.solde(st(), moi().id, annee);
    U.modale('Demander une récupération', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'De (facultatif)', debut), h('label', {}, 'À (facultatif)', fin)),
      h('label', { class: 'en-ligne' }, 'Durée (heures:minutes)', dureeCh),
      h('p', { class: 'muted', text: 'Solde disponible : ' + HS.hm(Math.max(0, so.disponible)) + '.' }),
      h('label', {}, 'Commentaire (facultatif)', com)),
      [{ texte: 'Annuler' }, { texte: 'Demander', classe: 'primaire', action: async function () {
        var min = HS.lireDuree(dureeCh.value);
        if (min === null) throw new Error('Durée illisible : écrivez par exemple 1:30, 1h30 ou 90 (minutes).');
        if ((debut.value || fin.value) && HS.duree(debut.value, fin.value) !== min) throw new Error('La durée ne correspond pas aux horaires.');
        var c = moi();
        await s().enregistrer('HEURES_RECUP', { id: 'HR-' + C.hex(C.aleatoire(6)), date: date.value, debut: debut.value || '', fin: fin.value || '', minutes: min, commentaire: com.value.trim(), service: serviceDe(c), nom: c.nom || '', roles: c.roles });
        U.toast('Récupération demandée à votre validateur.');
      } }]);
  }
  function decider(x, decision) {
    var o = HS.options(cfg()), recup = x.genre === 'recup', moins = !recup && x.minutes < 0, motif = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Motif' });
    var ret = h('input', { type: 'text', value: hmm(x.minutes), class: 'champ-court', 'aria-label': 'Durée retenue' });
    var choix = !recup && !moins && decision !== 'refuse' ? h('select', { 'aria-label': 'Acceptées en' }, [h('option', { value: 'recuperation', text: 'Récupération', selected: decision === 'recuperation' })].concat(o.paiement ? [h('option', { value: 'paiement', text: 'Heures payées', selected: decision === 'paiement' })] : [])) : null;
    var avisPaie = h('p', { class: 'hs-paie', role: 'note', text: 'Heures payées : elles impactent la paie. Saisissez-les en priorité dans le logiciel de gestion du temps ; elles restent en tête de votre liste « À enregistrer » jusqu’à confirmation.', hidden: decision !== 'paiement' });
    if (choix) choix.addEventListener('change', function () { avisPaie.hidden = choix.value !== 'paiement'; });
    var titre = decision === 'refuse' ? 'Refuser' : recup ? 'Valider la récupération' : moins ? 'Valider les heures en moins' : 'Accepter les heures';
    U.modale(titre, h('div', { class: 'pile' }, h('p', { text: (x.nom || s().nomAuteur(x.agent)) + ' — ' + quand(x) }), h('p', { text: nature(x) + ' : ' + signe(x) }),
      x.commentaire ? h('p', { class: 'muted', text: 'Commentaire : ' + x.commentaire }) : null,
      choix ? h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Acceptées en', choix), h('label', { class: 'en-ligne' }, 'Durée retenue', ret)) : null,
      moins && decision !== 'refuse' ? h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Durée déduite du solde', ret)) : null,
      choix ? avisPaie : null,
      choix && o.plafondMensuel ? h('small', { class: 'muted', text: 'Plafond mensuel des heures payées : ' + HS.hm(o.plafondMensuel) + ' (déjà acceptées ce mois : ' + HS.hm(HS.payeesDuMois(st(), x.agent, String(x.date).slice(0, 7))) + ').' }) : null,
      h('label', {}, decision === 'refuse' ? 'Motif (obligatoire, communiqué à l’agent)' : 'Message à l’agent (facultatif)', motif)),
      [{ texte: 'Annuler' }, { texte: titre, classe: decision === 'refuse' ? 'danger' : 'primaire', action: async function () {
        if (recup) { await s().enregistrer('HEURES_RECUP_DECISION', { recup: x.id, decision: decision === 'refuse' ? 'refuse' : 'valide', motif: motif.value.trim(), service: x.service, nom: moi().nom || '' }); U.toast('Décision enregistrée.'); return; }
        var m = decision === 'refuse' ? 0 : HS.lireDuree(ret.value);
        if (decision !== 'refuse' && m === null) throw new Error('Durée retenue illisible (ex. 1:30).');
        var dec = decision === 'refuse' ? 'refuse' : moins ? 'deduit' : choix.value;
        await s().enregistrer('HEURES_DECISION', { declaration: x.id, decision: dec, minutes: m, motif: motif.value.trim(), service: x.service, nom: moi().nom || '' });
        U.toast(dec === 'paiement' ? 'Heures payées acceptées : à saisir en priorité dans le logiciel de gestion du temps (impact sur la paie).' : 'Décision enregistrée.');
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
  function badge(x) { return h('span', { class: 'badge ' + CLASSE[x.statut], text: HS.STATUTS[x.statut] + (x.genre === 'declaration' && x.retenues !== null && x.retenues !== Math.abs(x.minutes) && x.statut !== 'refuse' ? ' (' + HS.hm(x.retenues) + ' retenues)' : '') }); }
  function vueMesHeures() {
    var c = moi(), so = HS.solde(st(), c.id, annee), l = HS.deAgent(st(), c.id, annee), av = HS.avisPour(st(), c.id, vus());
    if (av.length) setTimeout(function () { marquerVus(av.map(function (a) { return a.id; })); }, 1500);
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Mes heures ' + annee }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { annee--; U.rendreContenu(); } }, '◀'), h('button', { class: 'btn petit', type: 'button', onclick: function () { annee++; U.rendreContenu(); } }, '▶'),
        !lecture() && peut('HEURES_DECLARATION') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleDeclaration(); } }, '+ Déclarer des heures en plus ou en moins') : null,
        !lecture() && peut('HEURES_RECUP') ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleRecup(); } }, '+ Demander une récupération') : null),
      h('div', { class: 'hs-solde' }, [['Acquises en récupération', so.acquises], ['Heures en moins', -so.enMoins], ['Récupérées', so.recuperees], ['Demandées, à valider', so.demandees], ['Corrections du cadre', so.corrections], ['Solde', so.solde], ['Disponible', so.disponible]].map(function (x) {
        return h('div', { class: 'hs-case' }, h('small', { class: 'muted', text: x[0] }), h('b', { text: HS.hm(x[1]) }));
      })),
      h('small', { class: 'muted', text: 'Le logiciel de gestion du temps de l’établissement reste la référence ; le solde affiché ici n’est qu’une indication.' }),
      l.length ? tableau(l, [['Date', quand], ['Nature', nature], ['Écart', signe], ['État', badge],
        ['Message', function (x) { return x.motifDecision || ''; }], ['Logiciel', function (x) { return x.gtt ? 'enregistrée' : ''; }]],
        function (x) { return x.statut === 'demande' && !lecture() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { simple('HEURES_ANNULATION', { objet: x.id, service: x.service }, 'Demande annulée.'); } }, 'Annuler') : null; })
        : h('p', { class: 'muted', text: 'Aucune saisie en ' + annee + '.' }));
  }
  function vueAValider() {
    var c = moi(), av = HS.aValider(st(), cfg(), s().comptes || [], c), o = HS.options(cfg()), ae = HS.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services(), c.id);
    // Agents dont on est le validateur : comptes actifs, et agents vus dans les saisies (repris d'un autre outil, sans compte)
    var vusIds = {}, e = st(), agents = (s().comptes || []).filter(function (a) { return a.actif !== false; }).map(function (a) { vusIds[a.id] = 1; return a; });
    Object.keys(e.declarations).map(function (k) { return e.declarations[k]; }).concat(Object.keys(e.recups).map(function (k) { return e.recups[k]; })).forEach(function (x) {
      if (!vusIds[x.agent]) { vusIds[x.agent] = 1; agents.push(Object.assign(HS.agentDe(x, s().comptes), { nom: x.nom || s().nomAuteur(x.agent) })); }
    });
    Object.keys(e.corrections).forEach(function (k) { var id = k.split('|')[0]; if (!vusIds[id]) { vusIds[id] = 1; agents.push({ id: id, nom: s().nomAuteur(id), roles: [], services: [] }); } });
    agents = agents.filter(function (a) { return HS.valide(cfg(), c, a); }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Heures à valider' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Demandes (' + av.length + ')' }), av.length ? tableau(av, [['Agent', function (x) { return x.nom || s().nomAuteur(x.agent); }], ['Date', quand], ['Nature', nature], ['Écart', signe], ['Commentaire', function (x) { return x.commentaire; }]],
        function (x) {
          if (lecture()) return null;
          if (x.genre === 'recup') return [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(x, 'valide'); } }, 'Valider'), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(x, 'refuse'); } }, 'Refuser')];
          if (x.minutes < 0) return [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(x, 'deduit'); } }, 'Valider (déduites)'), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(x, 'refuse'); } }, 'Refuser')];
          return [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(x, 'recuperation'); } }, 'En récupération'), o.paiement ? h('button', { class: 'btn petit', type: 'button', onclick: function () { decider(x, 'paiement'); } }, 'En heures payées') : null, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(x, 'refuse'); } }, 'Refuser')];
        }) : h('p', { class: 'muted', text: 'Aucune demande à valider.' })),
      HS.confirmeGtt(cfg(), s().roles()) || ae.length ? h('section', { class: 'panneau' }, h('h2', { text: 'À enregistrer dans le logiciel de gestion du temps (' + ae.length + ')' }),
        ae.some(function (x) { return x.prioritaire; }) ? h('p', { class: 'hs-paie', text: 'Heures payées en tête : à saisir en priorité, elles impactent la paie.' }) : null,
        ae.length ? tableau(ae, [['Agent', function (x) { return x.nom || s().nomAuteur(x.agent); }], ['Date', quand],
        ['Nature', function (x) { return x.prioritaire ? h('span', {}, h('span', { class: 'badge bad', text: 'Prioritaire : paie' }), ' ' + HS.STATUTS[x.statut]) : x.genre === 'recup' ? 'Récupération' : HS.STATUTS[x.statut]; }],
        ['Durée', function (x) { return x.genre === 'recup' ? HS.hm(x.minutes) : (x.statut === 'deduit' ? '−' : '+') + HS.hm(x.retenues); }]],
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
      h('section', { class: 'panneau' }, h('h2', { text: 'Par agent (heures validées)' }), ags.length ? tableau(ags, [['Agent', function (x) { return x.nom; }], ['En récupération', function (x) { return HS.hm(x.recuperation); }], ['Payées', function (x) { return HS.hm(x.paiement); }], ['En moins', function (x) { return x.deduit ? '−' + HS.hm(x.deduit) : HS.hm(0); }]]) : h('p', { class: 'muted', text: 'Aucune heure acceptée.' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Par mois' }), h('div', { class: 'table-wrap' }, h('table', {}, h('tr', {}, mois.map(function (m) { return h('th', { text: m }); })), h('tr', {}, mois.map(function (m, i) { return h('td', { text: HS.hm(t.mois[String(i + 1).padStart(2, '0')] || 0) }); }))))),
      h('section', { class: 'panneau' }, h('h2', { text: 'Par motif' }), h('ul', { class: 'liste-simple' }, Object.keys(t.motifs).map(function (k) { return h('li', { text: (k.indexOf('libre:') === 0 ? k.slice(6) : libMotif({ motif: k })) + ' : ' + HS.hm(t.motifs[k]) }); }))));
  }

  // ------------------------------------------------------------ Réglages (administrateur)
  function panneauReglages() {
    var o = HS.options(cfg()), motifs = h('textarea', { rows: 6, 'aria-label': 'Motifs, un par ligne' }); motifs.value = o.motifs.map(function (m) { return m.libelle; }).join('\n');
    var pay = h('input', { type: 'checkbox', checked: o.paiement }), plaf = h('input', { type: 'text', value: o.plafondMensuel ? Math.floor(o.plafondMensuel / 60) + ':' + String(o.plafondMensuel % 60).padStart(2, '0') : '', placeholder: 'sans plafond', class: 'champ-court', 'aria-label': 'Plafond mensuel' });
    var etape = h('input', { type: 'checkbox', checked: o.etapeGtt });
    // Postes proposés en raccourci (horaire prévu) : pour l'établissement, ou pour le service affiché
    var cle = U.App.service && U.App.service !== '*' ? U.App.service : '*';
    var postes = h('textarea', { rows: 5, 'aria-label': 'Postes, un par ligne', placeholder: 'Matin;06:45;14:15\nJournée;09:00;17:00\nNuit;21:00;07:00' });
    postes.value = (o.postes[cle] || []).map(function (p) { return p.libelle + ';' + p.debut + ';' + p.fin; }).join('\n');
    var roles = SIC.model.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: o.rolesGtt.indexOf(r.code) >= 0 }) }; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Heures supplémentaires' }),
      h('label', {}, 'Motifs proposés, un par ligne (l’agent peut aussi écrire un autre motif)', motifs),
      h('label', {}, 'Postes proposés en raccourci pour l’horaire prévu — ' + (cle === '*' ? 'établissement' : U.libService(cle)) + ' : « libellé;début;fin », un par ligne', postes),
      h('small', { class: 'muted', text: 'Sans postes réglés : ceux de l’établissement, sinon les postes de surveillance du service. Choisissez un service en haut de l’écran pour régler ses propres postes.' }),
      h('label', { class: 'case' }, pay, h('span', { text: 'Le validateur peut accepter des heures payées (règles de l’établissement, à voir avec les ressources humaines)' })),
      h('label', { class: 'en-ligne' }, 'Plafond mensuel des heures payées par agent (heures:minutes)', plaf),
      h('label', { class: 'case' }, etape, h('span', { text: 'Étape « Enregistrée dans le logiciel de gestion du temps » après la décision' })),
      h('p', { class: 'muted', text: 'Rôles qui confirment l’enregistrement :' }), h('div', { class: 'actions gauche' }, roles.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: x.r.libelle })); })),
      h('small', { class: 'muted', text: 'Validateur : celui des Congés (cadre pour les IDE, AS et secrétaires ; cadre supérieur pour les cadres…). Données du personnel : fonction soumise à avis (onglet « Validations »). Tessera ne calcule pas la paie.' }),
      U.boutonEnregistrer(async function () {
        var pl = plaf.value.trim() ? HS.lireDuree(plaf.value) : null;
        if (plaf.value.trim() && !pl) throw new Error('Plafond illisible (ex. 20:00).');
        var ms = motifs.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (l) { var ex = o.motifs.filter(function (m) { return m.libelle === l; })[0]; return { code: ex ? ex.code : l.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30), libelle: l }; });
        var ps = [], err = '';
        postes.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (l) {
          var t = l.split(';').map(function (x) { return x.trim(); });
          if (t.length !== 3 || !t[0] || !/^\d{2}:\d{2}$/.test(t[1]) || !/^\d{2}:\d{2}$/.test(t[2])) err = err || l; else ps.push({ libelle: t[0], debut: t[1], fin: t[2] });
        });
        if (err) throw new Error('Poste illisible : « ' + err + ' » (écrivez libellé;06:45;14:15).');
        var tous = Object.assign({}, (cfg().heures || {}).postes || {}); if (ps.length) tous[cle] = ps; else delete tous[cle];
        await U.enregistrerConfig([['heures', { motifs: ms, postes: tous, paiement: pay.checked, plafondMensuel: pl, etapeGtt: etape.checked, rolesGtt: roles.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r.code; }) }]]);
      }));
  }

  // ------------------------------------------------------------ Informations, journal
  function informations() {
    var res = [];
    try {
      var c = moi();
      HS.avisPour(st(), c.id, vus()).forEach(function (a) { var x = st().declarations[a.objet] || st().recups[a.objet]; res.push({ id: 'hs-a-' + a.id, niveau: a.statut === 'refuse' ? 'bad' : '', titre: (x && x.genre === 'recup' ? 'Récupération du ' : x && x.minutes < 0 ? 'Heures en moins du ' : 'Heures en plus du ') + (x ? fr(x.date) : '') + ' : ' + HS.STATUTS[a.statut].toLowerCase(), detail: a.motif || '', vu: function () { return marquerVus([a.id]); }, ouvrir: function () { U.App.ongletsFenetres.heures = 'mes-heures'; U.ouvrirFenetre('heures'); } }); });
      var av = HS.aValider(st(), cfg(), s().comptes || [], c);
      if (av.length) res.push({ id: 'hs-v-' + av.length, niveau: 'warn', titre: 'Heures et récupérations à valider : ' + av.length, ouvrir: function () { U.App.ongletsFenetres.heures = 'a-valider'; U.ouvrirFenetre('heures'); } });
      var ae = HS.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services(), c.id), pr = ae.filter(function (x) { return x.prioritaire; });
      if (pr.length) res.push({ id: 'hs-p-' + pr.map(function (x) { return x.id; }).join(','), niveau: 'bad', titre: 'Heures payées à saisir en priorité dans le logiciel de gestion du temps (paie) : ' + pr.length, ouvrir: function () { U.App.ongletsFenetres.heures = 'a-valider'; U.ouvrirFenetre('heures'); } });
      ae = ae.filter(function (x) { return !x.prioritaire; });
      if (ae.length) res.push({ id: 'hs-g-' + ae.length, niveau: '', titre: 'Heures à enregistrer dans le logiciel de gestion du temps : ' + ae.length, ouvrir: function () { U.App.ongletsFenetres.heures = 'a-valider'; U.ouvrirFenetre('heures'); } });
    } catch (e) { /* module illisible */ }
    return res;
  }
  var LIB = { HEURES_DECLARATION: 'Heures en plus ou en moins déclarées', HEURES_DECISION: 'Décision sur des heures', HEURES_RECUP: 'Récupération demandée', HEURES_RECUP_DECISION: 'Décision sur une récupération', HEURES_ENREGISTREE: 'Enregistrée dans le logiciel de gestion du temps', HEURES_ANNULATION: 'Demande annulée', HEURES_CORRECTION: 'Solde corrigé' };
  function resume(e) {
    var d = e.data || {}, x = st().declarations[d.declaration || d.objet || d.id] || st().recups[d.recup || d.objet || d.id];
    if (e.type === 'HEURES_CORRECTION') return s().nomAuteur(d.agent) + ' ' + d.annee + ' : ' + HS.hm(d.minutes) + ' — ' + (d.motif || '');
    return (x ? (x.nom || '') + ', ' + fr(x.date) + ', ' + signe(x) : (d.date ? fr(d.date) + ', ' + HS.hm(d.minutes) : '')) + (d.decision ? ' — ' + HS.STATUTS[d.decision] : '') + (d.motif && e.type !== 'HEURES_DECLARATION' ? ' — ' + d.motif : '');
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
