// SPDX-License-Identifier: EUPL-1.2
/*
 * Équipe — onglet « Entretiens » (phase 4, lot F, décisions du porteur du 15 novembre 2026). Logique : module-equipe.js.
 * Le cadre de l'agent mène et écrit l'entretien ; il le lit seul, sauf partage choisi avec un ou plusieurs supérieurs et,
 * s'il le souhaite, avec l'agent (signature et observations). Contenu chiffré pour les seuls lecteurs (clés de liste).
 * Fonction soumise à avis (onglet « Validations ») : l'onglet est masqué tant qu'elle est désactivée.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, E = SIC.equipe, C = SIC.crypto;
  var cache = {}, filtreAgent = '';

  function s() { return U.App.session; }
  function st() { try { return (s().ouvert('equipe') && s().etatModule('equipe')) || E.reduire([]); } catch (e) { return E.reduire([]); } }
  function cfg() { return U.config(); }
  function moi() { return Object.assign({}, s().compteEffectif() || {}, { roles: s().roles() }); }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function lecture() { return !!s().apercu; }
  function fr(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function agents() { return U.equipe && U.equipe.agents ? U.equipe.agents() : []; }
  function auteur(o) { return o.c.nomAuteur || nomDe(o.x.auteur); }
  function nomDe(id, repli) { var a = agents().filter(function (x) { return x.id === id; })[0]; return a ? a.nom : repli || s().nomAuteur(id); }

  // ------------------------------------------------------------ Lecture des enveloppes
  async function contenu(x) {
    var k = s().utilisateur.id + '|' + x.id + '|' + x.maj;   // jamais partagé entre deux sessions du même poste
    if (!(k in cache)) { try { cache[k] = await s().ouvrirEnveloppe('entretien:' + x.id, x.env); } catch (e) { cache[k] = null; } }
    return cache[k];
  }
  async function observations(x, sg) {
    if (!sg || !sg.env) return null;
    var k = s().utilisateur.id + '|sig|' + x.id + '|' + sg.le;
    if (!(k in cache)) { try { cache[k] = await s().ouvrirEnveloppe('entretien-sig:' + x.id, sg.env); } catch (e) { cache[k] = null; } }
    return cache[k];
  }
  async function lisibles() {
    var l = E.entretiensLisibles(st(), moi().id), res = [];
    for (var i = 0; i < l.length; i++) { var c = await contenu(l[i]); if (c) res.push({ x: l[i], c: c }); }
    return res;
  }

  // ------------------------------------------------------------ Formulaire
  function modaleEntretien(existant) {
    var c0 = existant ? existant.c : {}, x0 = existant ? existant.x : null, m = moi();
    var possibles = agents().filter(function (a) { return E.menePour(cfg(), m, a); });
    if (x0 && !possibles.some(function (a) { return a.id === c0.agent; })) possibles.unshift({ id: c0.agent, nom: c0.nomAgent || nomDe(c0.agent), roles: [], services: [], compte: true });
    if (!possibles.length) { U.toast('Aucun agent dont vous êtes le cadre (règle des validateurs des Congés).'); return; }
    var agent = h('select', { 'aria-label': 'Agent', disabled: !!x0 }, [h('option', { value: '', text: '— Choisir —' })].concat(possibles.map(function (a) { return h('option', { value: a.id, text: a.nom, selected: a.id === c0.agent }); })));
    var date = h('input', { type: 'date', value: c0.date || SIC.model.dateLocaleISO(Date.now()), 'aria-label': 'Date de l’entretien' });
    var libresVus = {};
    Object.keys(cache).forEach(function (k) { var v = cache[k]; if (v && v.typeLibre) libresVus[v.typeLibre] = 1; });
    var type = h('select', { 'aria-label': 'Type d’entretien' }, [h('option', { value: '', text: '— Choisir —' })].concat(E.typesEntretien().map(function (t) { return h('option', { value: t.code, text: t.libelle, selected: t.code === c0.type }); }),
      [h('option', { value: '__libre', text: 'Autre type (à écrire)…', selected: !!c0.typeLibre })]));
    var dl = h('datalist', { id: 'en-types-libres' }, Object.keys(libresVus).map(function (t) { return h('option', { value: t }); }));
    var libre = h('input', { type: 'text', maxlength: 80, list: 'en-types-libres', 'aria-label': 'Autre type d’entretien', value: c0.typeLibre || '', hidden: !c0.typeLibre });
    type.addEventListener('change', function () { libre.hidden = type.value !== '__libre'; if (!libre.hidden) libre.focus(); });
    var presents = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Personnes présentes', value: c0.presents || '', placeholder: 'ex. cadre supérieur, représentant choisi par l’agent' });
    var cr = h('textarea', { rows: 8, maxlength: 4000, 'aria-label': 'Compte rendu' }); cr.value = c0.compteRendu || '';
    var suites = h('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'Suites, objectifs, prochain point' }); suites.value = c0.suites || '';
    var zoneSup = h('div', { class: 'actions gauche' });
    var partage = h('input', { type: 'checkbox', checked: !!c0.partageAgent }), sign = h('input', { type: 'checkbox', checked: !!c0.signatureDemandee });
    var hors = h('input', { type: 'checkbox', checked: !!c0.horsDroitAcces }), motifHors = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Motif du retrait du droit d’accès', value: c0.motifHorsDroitAcces || '', hidden: !c0.horsDroitAcces, placeholder: 'ex. éléments concernant d’autres agents' });
    hors.addEventListener('change', function () { motifHors.hidden = !hors.checked; });
    var notePartage = h('small', { class: 'muted' });
    function majAgent() {
      var a = possibles.filter(function (y) { return y.id === agent.value; })[0], sup = E.superieursPossibles(s().comptes || [], m.id, agent.value);
      U.vider(zoneSup);
      if (!sup.length) zoneSup.appendChild(h('small', { class: 'muted', text: 'Aucun supérieur avec un compte.' }));
      sup.forEach(function (c) { zoneSup.appendChild(h('label', { class: 'case' }, h('input', { type: 'checkbox', value: c.id, checked: (c0.superieurs || []).indexOf(c.id) >= 0 }), h('span', { text: c.nom }))); });
      var sansCompte = a && a.compte === false;
      partage.disabled = sign.disabled = sansCompte;
      if (sansCompte) { partage.checked = sign.checked = false; }
      notePartage.textContent = sansCompte ? 'L’agent n’a pas de compte : partage et signature impossibles.' : '';
    }
    agent.addEventListener('change', majAgent); majAgent();
    partage.addEventListener('change', function () { if (!partage.checked) sign.checked = false; });
    sign.addEventListener('change', function () { if (sign.checked) partage.checked = true; });
    U.modale(x0 ? 'Modifier l’entretien ou son partage' : 'Nouvel entretien', h('div', { class: 'pile' }, dl,
      h('div', { class: 'grille-2' }, h('label', {}, 'Agent', agent), h('label', {}, 'Date', date)),
      h('label', {}, 'Type d’entretien', type), libre,
      h('label', {}, 'Personnes présentes (facultatif)', presents),
      h('label', {}, 'Compte rendu', cr),
      h('label', {}, 'Suites, objectifs, prochain point (facultatif)', suites),
      h('fieldset', { class: 'hs-horaire' }, h('legend', { text: 'Partage' }),
        h('p', { class: 'muted', text: 'Par défaut, vous seul lisez cet entretien. L’administrateur ne le lit pas.' }),
        h('p', { text: 'Partager avec un ou plusieurs supérieurs :' }), zoneSup,
        h('label', { class: 'case' }, partage, h('span', { text: 'Partager avec l’agent (il le lit dans son onglet « Entretiens »)' })),
        h('label', { class: 'case' }, sign, h('span', { text: 'Demander à l’agent de signer (il peut ajouter ses observations)' })), notePartage),
      h('fieldset', { class: 'hs-horaire' }, h('legend', { text: 'Droit d’accès de l’agent' }),
        h('label', { class: 'case' }, hors, h('span', { text: 'Retirer cet entretien de l’export du droit d’accès (éléments concernant d’autres agents)' })), motifHors),
      x0 && E.signature(x0) ? h('p', { class: 'hs-paie', text: 'L’agent a signé cette version : une modification lui demandera une nouvelle signature.' }) : null,
      h('small', { class: 'muted', text: 'Données du personnel : écrivez des faits, sans donnée de santé de l’agent ni donnée clinique d’un patient.' })),
      [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var a = possibles.filter(function (y) { return y.id === agent.value; })[0];
        var sup = Array.prototype.slice.call(zoneSup.querySelectorAll('input:checked')).map(function (i) { return i.value; });
        var c = E.contenuEntretien({ agent: agent.value, nomAgent: a ? a.nom : '', nomAuteur: m.nom || '', date: date.value, type: type.value === '__libre' ? '' : type.value, typeLibre: type.value === '__libre' ? libre.value : '',
          presents: presents.value, compteRendu: cr.value, suites: suites.value, superieurs: sup, partageAgent: partage.checked, signatureDemandee: sign.checked, horsDroitAcces: hors.checked, motifHorsDroitAcces: motifHors.value });
        var noms = E.clesEntretien(m.id, c), manq = s().clesEnveloppeManquantes(noms);
        if (manq.length) throw new Error('Clé de lecture pas encore créée pour : ' + manq.map(function (n) { return nomDe(n.slice(4)); }).join(', ') + ' (elle le sera à la prochaine connexion d’un administrateur).');
        var id = x0 ? x0.id : 'EN-' + C.hex(C.aleatoire(8));
        var env = await s().chiffrerEnveloppe('entretien:' + id, noms, c);
        await s().enregistrer(x0 ? 'ENTRETIEN_AGENT_MAJ' : 'ENTRETIEN_AGENT', { id: id, env: env, signataire: c.signatureDemandee ? c.agent : '' });
        U.toast(x0 ? 'Entretien mis à jour.' : 'Entretien enregistré' + (c.signatureDemandee ? ' : signature demandée à l’agent.' : '.'));
      } }]);
  }
  function modaleLecture(o) {
    var x = o.x, c = o.c, sg = E.signature(x), zoneObs = h('div');
    if (sg) observations(x, sg).then(function (ob) { if (ob && ob.observations) zoneObs.appendChild(h('div', {}, h('b', { text: 'Observations de l’agent : ' }), h('span', { class: 'en-texte', text: ob.observations }))); });
    var lecteurs = Object.keys(x.env.cles || {}).map(function (n) { return n.slice(4); }).filter(function (id) { return id !== x.auteur; }).map(function (id) { return id === c.agent ? 'l’agent' : nomDe(id); });
    U.modale(E.libTypeEntretien(c) + ' — ' + (c.nomAgent || nomDe(c.agent)) + ' — ' + fr(c.date), h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Mené par ' + auteur(o) + ' ; écrit le ' + fr(x.le) + (x.maj !== x.le ? ', modifié le ' + fr(x.maj) : '') + '. Lu par : l’auteur' + (lecteurs.length ? ', ' + lecteurs.join(', ') : ' seul') + '.' }),
      c.presents ? h('p', { text: 'Présents : ' + c.presents }) : null,
      h('div', {}, h('b', { text: 'Compte rendu' }), h('p', { class: 'en-texte', text: c.compteRendu })),
      c.suites ? h('div', {}, h('b', { text: 'Suites' }), h('p', { class: 'en-texte', text: c.suites })) : null,
      c.signatureDemandee ? h('p', { text: sg ? 'Signé par l’agent le ' + fr(sg.le) + '.' : 'Signature de l’agent demandée, pas encore faite.' }) : null, zoneObs,
      c.horsDroitAcces ? h('p', { class: 'muted', text: 'Retiré de l’export du droit d’accès : ' + c.motifHorsDroitAcces }) : null),
      [{ texte: 'Fermer' }]);
  }
  function modaleSigner(o) {
    var obs = h('textarea', { rows: 4, maxlength: 2000, 'aria-label': 'Vos observations' }), lu = h('input', { type: 'checkbox' });
    U.modale('Signer l’entretien du ' + fr(o.c.date), h('div', { class: 'pile' },
      h('p', { class: 'muted', text: E.libTypeEntretien(o.c) + ', mené par ' + auteur(o) + '.' }),
      h('div', {}, h('b', { text: 'Compte rendu' }), h('p', { class: 'en-texte', text: o.c.compteRendu })),
      o.c.suites ? h('div', {}, h('b', { text: 'Suites' }), h('p', { class: 'en-texte', text: o.c.suites })) : null,
      h('label', {}, 'Vos observations (facultatif)', obs),
      h('label', { class: 'case' }, lu, h('span', { text: 'J’ai pris connaissance de ce compte rendu (la signature ne vaut pas accord sur son contenu).' }))),
      [{ texte: 'Annuler' }, { texte: 'Signer', classe: 'primaire', action: async function () {
        if (!lu.checked) throw new Error('Cochez « J’ai pris connaissance ».');
        var noms = Object.keys(o.x.env.cles || {}).filter(function (n) { return !s().clesEnveloppeManquantes([n]).length; });
        var env = await s().chiffrerEnveloppe('entretien-sig:' + o.x.id, noms, { observations: obs.value.trim().slice(0, 2000) });
        await s().enregistrer('ENTRETIEN_AGENT_SIGNATURE', { id: o.x.id, env: env });
        U.toast('Entretien signé.');
      } }]);
  }

  // ------------------------------------------------------------ Vue
  function tableau(l, avecAgent) {
    return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Date', avecAgent ? 'Agent' : null, 'Type', 'Mené par', 'Partage', 'Signature', ''].filter(function (t) { return t !== null; }).map(function (t) { return h('th', { text: t }); }))),
      h('tbody', {}, l.map(function (o) {
        var x = o.x, c = o.c, sg = E.signature(x), nsup = (c.superieurs || []).length;
        return h('tr', {}, h('td', { text: fr(c.date) }), avecAgent ? h('td', { text: c.nomAgent || nomDe(c.agent) }) : null, h('td', {}, E.libTypeEntretien(c), c.horsDroitAcces ? ' ' : null, c.horsDroitAcces ? h('span', { class: 'badge', title: c.motifHorsDroitAcces, text: 'hors droit d’accès' }) : null),
          h('td', { text: auteur(o) }), h('td', { text: [c.partageAgent ? 'l’agent' : '', nsup ? nsup + ' supérieur' + (nsup > 1 ? 's' : '') : ''].filter(Boolean).join(' et ') || 'aucun' }),
          h('td', {}, c.signatureDemandee ? h('span', { class: 'badge ' + (sg ? 'ok' : 'warn'), text: sg ? 'signé le ' + fr(sg.le) : 'à signer' }) : '—'),
          h('td', { class: 'actions-ligne' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleLecture(o); } }, 'Lire'),
            x.auteur === moi().id && !lecture() && peut('ENTRETIEN_AGENT_MAJ') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleEntretien(o); } }, 'Modifier, partager') : null));
      }))));
  }
  function vue() {
    var m = moi(), zone = h('div', { class: 'pile' }, h('p', { class: 'muted', text: 'Ouverture des entretiens…' }));
    var racine = h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Entretiens' }), h('div', { class: 'espace' }),
      !lecture() && peut('ENTRETIEN_AGENT') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleEntretien(null); } }, '+ Nouvel entretien') : null), zone);
    lisibles().then(function (l) {
      U.vider(zone);
      var miens = l.filter(function (o) { return o.c.agent === m.id; }), autres = l.filter(function (o) { return o.c.agent !== m.id; });
      var aSigner = miens.filter(function (o) { return o.x.signataire === m.id && !E.signature(o.x); });
      if (aSigner.length) zone.appendChild(h('section', { class: 'panneau' }, h('h2', { text: 'À signer (' + aSigner.length + ')' }), h('ul', { class: 'liste-simple' }, aSigner.map(function (o) {
        return h('li', {}, E.libTypeEntretien(o.c) + ' du ' + fr(o.c.date) + ', mené par ' + auteur(o) + ' ', lecture() ? null : h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { modaleSigner(o); } }, 'Lire et signer'));
      }))));
      if (miens.length) zone.appendChild(h('section', { class: 'panneau' }, h('h2', { text: 'Mes entretiens partagés avec moi' }), tableau(miens, false)));
      if (peut('ENTRETIEN_AGENT') || autres.length) {
        var ags = {}; autres.forEach(function (o) { ags[o.c.agent] = o.c.nomAgent || nomDe(o.c.agent); });
        var filtre = h('select', { 'aria-label': 'Filtrer par agent', onchange: function () { filtreAgent = filtre.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous les agents' })].concat(Object.keys(ags).sort(function (a, b) { return ags[a].localeCompare(ags[b], 'fr'); }).map(function (k) { return h('option', { value: k, text: ags[k], selected: k === filtreAgent }); })));
        var vis = autres.filter(function (o) { return !filtreAgent || o.c.agent === filtreAgent; });
        zone.appendChild(h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Entretiens menés ou partagés avec moi (' + vis.length + ')' }), h('div', { class: 'espace' }), filtre),
          vis.length ? tableau(vis, true) : h('p', { class: 'muted', text: 'Aucun entretien.' }),
          h('small', { class: 'muted', text: 'Chaque entretien n’est lu que par son auteur et les personnes avec qui il l’a partagé. Données du personnel : fonction soumise à avis (onglet « Validations »).' })));
      }
      if (!zone.childNodes.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucun entretien partagé avec vous.' }));
    });
    return racine;
  }

  // ------------------------------------------------------------ Branchement à l'interface de l'Équipe
  var ct = SIC.modules.obtenir('equipe'), itf = ct.interface || {};
  itf.vues = Object.assign({}, itf.vues, { entretiens: vue });
  var LIB = { ENTRETIEN_AGENT: 'Équipe : entretien d’un agent (chiffré)', ENTRETIEN_AGENT_MAJ: 'Équipe : entretien modifié ou partage changé (chiffré)', ENTRETIEN_AGENT_SIGNATURE: 'Équipe : entretien signé par l’agent' };
  var j0 = itf.journal || {};
  itf.journal = Object.assign({}, j0, {
    resume: function (e) { return LIB[e.type] ? (e.type === 'ENTRETIEN_AGENT_SIGNATURE' ? 'Signature d’un entretien' : 'Entretien (contenu chiffré pour ses seuls lecteurs)') : j0.resume ? j0.resume(e) : e.type; },
    action: function (e) { return LIB[e.type] || (j0.action ? j0.action(e) : e.type); },
    libelleType: function (t) { return LIB[t] || (j0.libelleType ? j0.libelleType(t) : t); }
  });
  var inf0 = itf.informations;
  itf.informations = function () {
    var res = inf0 ? inf0() : [];
    try {
      if (E.fonctionActive(cfg())) {
        var l = E.aSigner(st(), moi().id);
        if (l.length) res = res.concat([{ id: 'en-s-' + l.map(function (x) { return x.id + x.maj; }).join(','), niveau: 'warn', titre: 'Entretien à lire et signer : ' + l.length, ouvrir: function () { U.App.ongletsFenetres.equipe = 'entretiens'; U.ouvrirFenetre('equipe'); } }]);
      }
    } catch (e) { /* module illisible */ }
    return res;
  };
  var p0 = itf.pastille;
  itf.pastille = function () { var n = 0; try { n = E.fonctionActive(cfg()) ? E.aSigner(st(), moi().id).length : 0; } catch (e) { n = 0; } return (p0 ? p0() : 0) + n; };
  ct.interface = itf;
  U.entretiens = { vue: vue };
})();
