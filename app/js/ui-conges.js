// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Congés — interface (0.44.0, décisions du porteur du 12 novembre 2026). Logique : module-conges.js.
 * Onglets : Mes congés (soldes, demandes), Tableau du service (à la journée ou à la semaine, règles, totaux), À valider
 * (validateurs), Tableaux et périodes (tableaux, périodes et blocages, droits et quotités : validateurs et cadre).
 * Administration → Congés : types et droits, validateurs, jours fériés, couleurs, options, message d'avertissement.
 * Fiche d'un agent (Équipe) : onglet « Congés » (quotité, droits et soldes de l'année). Agenda : congés validés lus
 * comme des absences.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, C = SIC.conges, CR = SIC.crypto;
  var vue = { tableau: '', mode: '', ref: '', annee: 0 };

  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function o() { return C.options(cfg()); }
  function st() { try { return (s() && s().etatModule('conges')) || C.reduire([]); } catch (e) { return C.reduire([]); } }
  function moi() { return s().compteEffectif(); }
  function peut(t) { return s().peut(t) && !s().apercu; }
  /**
   * Agents : les comptes, et les agents sans compte qui ont des congés ou une quotité dans le module (ancien agent, jeu
   * de démonstration), avec le rôle et le service notés dans leur dernière demande.
   */
  var memoAgents = { st: null, n: -1, l: [] };
  function comptes() {
    var base = (s().comptes || []).filter(function (c) { return c.id !== 'secours'; }), e = st();
    if (memoAgents.st === e && memoAgents.n === base.length) return memoAgents.l;
    var vus = {}, res = base.slice();
    base.forEach(function (c) { vus[c.id] = 1; });
    Object.keys(e.conges).map(function (k) { return e.conges[k]; }).sort(function (a, b) { return String(b.modifie).localeCompare(String(a.modifie)); }).forEach(function (c) {
      if (vus[c.agent] || !c.agent) return;
      vus[c.agent] = 1; res.push({ id: c.agent, nom: c.nom || c.agent, roles: Array.isArray(c.roles) ? c.roles : [], services: c.service ? [c.service] : [], actif: true, sansCompte: true });
    });
    memoAgents = { st: e, n: base.length, l: res };
    return res;
  }
  function agent(id) { return comptes().filter(function (c) { return c.id === id; })[0] || (moi() && moi().id === id ? moi() : null); }
  function auj() { return C.jourLocal(Date.now()); }
  function info(a) { return { service: ((a && a.services) || [])[0] || '', roles: (a && a.roles) || [], aujourdhui: auj() }; }
  function jourFr(j) { return String(j || '').split('-').reverse().join('/'); }
  var JS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function jourLong(j) { var d = C.jourSemaine(j); return JS[d] + ' ' + +j.slice(8) + ' ' + MOIS[+j.slice(5, 7) - 1] + ' ' + j.slice(0, 4); }
  function periodeFr(c) { return c.debut === c.fin ? jourLong(c.debut) : jourLong(c.debut) + ' → ' + jourLong(c.fin); }
  function nb(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function libType(code) { var t = C.type(cfg(), code); return t ? t.libelle : code; }
  function abrevType(code) { var t = C.type(cfg(), code); return t ? t.abrev : code; }
  function libRole(r) { try { return SIC.modules.obtenir('isocont').droits.libRole(cfg(), r); } catch (e) { return r; } }
  function validateurDe(a) { return !!a && (s().roles().indexOf('ADMIN') >= 0 || C.valide(cfg(), moi(), a)) && peut('CONGE_DECISION'); }
  function gereDroits(a) { var m = moi(); return !!a && peut('DROITS_CONGES') && (s().roles().indexOf('ADMIN') >= 0 || (a.id !== m.id && (m.services || []).some(function (x) { return (a.services || []).indexOf(x) >= 0; }))); }
  function id() { return 'CG' + CR.hex(CR.aleatoire(5)); }
  function alerte() { var a = o().alerte; return a.active ? h('p', { class: 'alerte cg-avertissement', role: 'note', text: a.texte }) : null; }
  function teinte(el, statut) { var c = o().couleurs[statut]; if (c) el.style.backgroundColor = c; return el; }
  function badge(statut) { return teinte(h('span', { class: 'badge cg-badge cg-' + statut, text: C.STATUTS[statut] || statut }), statut); }
  function nomDe(c) { var a = agent(c.agent); return (a && a.nom) || c.nom || c.agent; }

  // ------------------------------------------------------------ Informations de l'agent (décisions)
  function avisVus() { var p = s().preferences || {}; return Array.isArray(p.avisCongesVus) ? p.avisCongesVus : []; }
  function mesAvis() { try { return C.avisPour(st(), moi().id, avisVus()); } catch (e) { return []; } }
  async function marquerVus(ids) { try { await s().enregistrerPreference('avisCongesVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }
  var GENRES = { valide: 'a validé', refuse: 'a refusé', annule: 'a annulé' };
  function bandeauAvis() {
    var av = mesAvis();
    if (!av.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' décisions sur vos congés' : 'Une décision sur votre congé' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Vu')),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        var c = st().conges[a.conge], m = a.genre === 'refuse' ? (c.decision || {}).motif : a.genre === 'annule' ? (c.annulation || {}).motif : '';
        return h('li', { text: s().nomAuteur(a.par) + ' ' + GENRES[a.genre] + ' votre congé (' + libType(c.type) + ', ' + periodeFr(c) + ')' + (m ? ' : ' + m : '') + '.' });
      })));
  }

  // ------------------------------------------------------------ Mes congés
  function annees() { var a = new Date().getFullYear(); return [a - 1, a, a + 1]; }
  function anneeVue() { return vue.annee || new Date().getFullYear(); }
  function cartesSoldes(a, an) {
    var so = C.soldes(st(), cfg(), a.id, an, info(a));
    return h('div', { class: 'cg-cartes' }, o().types.filter(function (t) { return t.actif && so[t.code]; }).map(function (t) {
      var x = so[t.code], tot = Math.max(x.droit, x.valide + x.demande + x.souhait, 1);
      function part(v, statut) { var e = h('span', {}); e.style.width = (v / tot * 100) + '%'; return teinte(e, statut); }
      var detail = t.ferie ? (x.mode === 'office' ? 'Posés d’office (service fermé ou rôle qui ne travaille pas ces jours-là) : ' + nb(x.office) + ' jour(s)' : x.mode === 'recuperer' ? 'Fériés travaillés, à récupérer : ' + nb(x.acquis) + ' passé(s) à ce jour · ' + nb(x.valide) + ' récupéré(s) · ' + nb(x.demande) + ' demandé(s)' : 'Droits saisis par le cadre selon le planning')
        : nb(x.valide) + ' validé(s) · ' + nb(x.demande) + ' demandé(s)' + (x.souhait ? ' · ' + nb(x.souhait) + ' en souhait' : '');
      return h('div', { class: 'cg-carte' }, h('div', { class: 'barre' }, h('b', { text: t.libelle }), h('span', { class: 'espace' }), h('span', { class: 'muted', text: nb(x.droit) + ' j en ' + an + (x.saisi !== null ? ' (saisi)' : '') })),
        h('div', { class: 'cg-jauge', 'aria-hidden': 'true' }, part(x.valide, 'valide'), part(x.demande, 'demande'), part(x.souhait, 'souhait')),
        h('small', { class: 'muted', text: detail }),
        h('div', { class: 'cg-reste' }, h('b', { text: nb(x.reste) + ' j' }), h('span', { class: 'muted', text: ' restants après les demandes' })),
        !t.ferie && x.quotite < 100 ? h('small', { class: 'muted', text: 'Proratisé : quotité moyenne de l’année ' + nb(x.quotite) + ' %' }) : null);
    }));
  }
  /** Demande déposée après la date limite d'une période de dépôt : non prioritaire, vue de l'agent et du validateur seulement. */
  function badgeTardive(c) { return h('span', { class: 'badge cg-badge-tardive', title: 'Déposée après la date limite de « ' + c.tardive.libelle + ' » : non prioritaire, visible de l’agent et du validateur seulement jusqu’à la validation.', text: 'Non prioritaire (déposée après le ' + jourFr(c.tardive.limite) + ')' }); }
  function badgeQuotite(a) {
    var q = C.quotiteLe(st(), a.id, auj());
    return q.quotite < 100 || q.nonTravailles.length ? h('span', { class: 'badge', text: 'Temps partiel ' + q.quotite + ' %' + (q.nonTravailles.length ? ' — ' + q.nonTravailles.map(function (d) { return JS[d].replace('.', ''); }).join(', ') + ' : RTP habituel' : '') }) : null;
  }
  function ligneConge(c, avecAgent) {
    var lui = c.agent === moi().id, a = agent(c.agent), v = validateurDe(a);
    var actions = [];
    if ((lui || v) && (c.statut === 'souhait' || c.statut === 'demande') && !s().apercu) {
      actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleDemande(c); } }, 'Modifier'));
      if (c.statut === 'souhait') actions.push(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { envoyer(c); } }, 'Envoyer la demande'));
    }
    if (v && c.statut === 'demande' && !lui) actions.push(h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(c, 'valide'); } }, 'Valider'), h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleRefus(c); } }, 'Refuser…'));
    if (((lui && (c.statut === 'souhait' || c.statut === 'demande')) || (v && c.statut !== 'annule' && c.statut !== 'refuse')) && !s().apercu) actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { annuler(c); } }, c.statut === 'souhait' ? 'Supprimer' : 'Annuler…'));
    var m = c.statut === 'refuse' ? (c.decision || {}).motif : c.statut === 'annule' ? (c.annulation || {}).motif : '';
    return h('tr', {}, avecAgent ? h('td', {}, h('b', { text: nomDe(c) })) : null, h('td', { text: libType(c.type) }), h('td', { text: periodeFr(c) + (c.demiDebut ? ' (après-midi)' : '') + (c.demiFin ? ' (jusqu’au matin)' : '') }),
      h('td', { text: nb(C.decompte(st(), cfg(), c)) + ' j' }), h('td', {}, badge(c.statut), c.statut === 'demande' && c.tardive ? h('div', {}, badgeTardive(c)) : null, m ? h('div', {}, h('small', { class: 'muted', text: m })) : null),
      h('td', { class: 'muted', text: c.decision ? (c.statut === 'valide' ? 'Validé' : 'Refusé') + ' par ' + (c.decision.nom || s().nomAuteur(c.decision.par)) + ' le ' + new Date(c.decision.le).toLocaleDateString('fr-FR') : c.demandeLe ? 'Demandé le ' + new Date(c.demandeLe).toLocaleDateString('fr-FR') : '' }),
      h('td', {}, h('div', { class: 'actions gauche' }, actions)));
  }
  function vueMesConges() {
    var a = moi(), an = anneeVue(), l = C.congesDe(st(), a.id).filter(function (c) { return c.debut.slice(0, 4) === String(an) || c.fin.slice(0, 4) === String(an); });
    var selAn = h('select', { class: 'cg-annee', 'aria-label': 'Année', onchange: function () { vue.annee = +selAn.value; U.rendreContenu(); } }, annees().map(function (x) { return h('option', { value: x, text: String(x), selected: x === an }); }));
    return h('div', { class: 'pile' }, bandeauAvis(),
      h('div', { class: 'barre' }, h('h1', { text: 'Mes congés' }), selAn, o().afficherTempsPartiel ? badgeQuotite(a) : null, h('span', { class: 'espace' }),
        h('button', { class: 'btn', type: 'button', onclick: function () { U.App.onglet = 'tableau'; U.rendreContenu(); } }, 'Voir le tableau du service'),
        peut('CONGE') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleDemande(null); } }, '+ Nouvelle demande') : null),
      alerte(), cartesSoldes(a, an),
      h('section', { class: 'panneau' }, h('h2', { text: 'Mes demandes ' + an }),
        l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Type', 'Période', 'Jours', 'Statut', 'Suivi', ''].map(function (x) { return h('th', { text: x }); }))),
          h('tbody', {}, l.slice().reverse().map(function (c) { return ligneConge(c, false); })))) : h('p', { class: 'muted', text: 'Aucune demande pour ' + an + '.' }),
        h('small', { class: 'muted', text: 'Un congé validé apparaît dans l’Agenda du service comme une absence. Un congé validé s’annule avec le validateur. Aucun motif médical, aucun arrêt de travail dans ce module.' })));
  }

  // ------------------------------------------------------------ Demande (nouvelle ou modifiée)
  function agentsValides() { return comptes().filter(function (c) { return c.actif !== false && validateurDe(c); }); }
  function modaleDemande(c, pre) {
    pre = pre || {};
    var nouveau = !c, x = Object.assign({ agent: moi().id, type: 'CA', debut: '', fin: '', demiDebut: false, demiFin: false, commentaire: '' }, c || {}, pre);
    var pourAutres = agentsValides();
    var selAgent = pourAutres.length && nouveau ? h('select', { 'aria-label': 'Agent' }, [moi()].concat(pourAutres.filter(function (y) { return y.id !== moi().id; })).map(function (y) { return h('option', { value: y.id, text: y.nom + (y.id === moi().id ? ' (moi)' : ''), selected: y.id === x.agent }); })) : null;
    var types = o().types.filter(function (t) { return t.actif && !(t.ferie && false); });
    var selType = h('select', { 'aria-label': 'Type de congé' });
    var deb = h('input', { type: 'date', value: x.debut, 'aria-label': 'Du' }), fin = h('input', { type: 'date', value: x.fin, 'aria-label': 'Au' });
    var dd = h('input', { type: 'checkbox', checked: !!x.demiDebut }), df = h('input', { type: 'checkbox', checked: !!x.demiFin });
    var com = h('input', { type: 'text', maxlength: 300, value: x.commentaire || '', placeholder: 'Facultatif, sans motif médical', 'aria-label': 'Commentaire pour le validateur' });
    var zone = h('div', { class: 'pile cg-verif', 'aria-live': 'polite' });
    function agentChoisi() { return agent(selAgent ? selAgent.value : x.agent) || moi(); }
    function remplirTypes() {
      var a = agentChoisi(), an = +(deb.value || auj()).slice(0, 4), so = C.soldes(st(), cfg(), a.id, an, info(a)), v = selType.value || x.type;
      U.vider(selType); types.forEach(function (t) { var r = so[t.code]; selType.appendChild(h('option', { value: t.code, text: t.libelle + (r ? ' — ' + nb(r.reste) + ' j restants' : ''), selected: t.code === v })); });
    }
    function courant() { var a = agentChoisi(); return { id: (c && c.id) || 'nouveau', agent: a.id, service: (c && c.service) || info(a).service, type: selType.value, debut: deb.value, fin: fin.value || deb.value, demiDebut: dd.checked, demiFin: df.checked }; }
    function verifier() {
      U.vider(zone);
      var y = courant(), a = agentChoisi();
      if (!y.debut) return;
      if (!fin.value) fin.value = deb.value;
      if (y.fin < y.debut) { zone.appendChild(h('p', { class: 'alerte', text: 'La date de fin est avant la date de début.' })); return; }
      var v = C.verifier(st(), cfg(), y, { comptes: comptes(), aujourdhui: auj() });
      zone.appendChild(h('p', { class: 'info', text: nb(v.jours) + ' jour(s) décompté(s)' + (v.soldeApres !== undefined ? ' ; solde de « ' + libType(y.type) + ' » après la demande : ' + nb(v.soldeApres) + ' jour(s)' : '') + '.' + ' Jours fériés non décomptés' + (C.quotiteLe(st(), a.id, y.debut).quotite < 100 ? ' ; pendant un congé, aucune RTP n’est posée : tous les jours ouvrés sont décomptés.' : '.') }));
      if (v.soldeApres < 0) zone.appendChild(h('p', { class: 'alerte', text: 'Le solde deviendrait négatif.' }));
      var pts = [];
      v.bloquees.forEach(function (p) { pts.push(h('li', { class: 'cg-bloque', text: 'Période bloquée par le validateur : ' + p.libelle + ' (du ' + jourFr(p.debut) + ' au ' + jourFr(p.fin) + ')' + (validateurDe(a) ? ' — vous pouvez la saisir en tant que validateur.' : ' : demande impossible sur ces dates.') })); });
      v.eviter.forEach(function (p) { pts.push(h('li', { text: 'Période à éviter : ' + p.libelle + ' (du ' + jourFr(p.debut) + ' au ' + jourFr(p.fin) + ').' })); });
      if (v.horsDelai) pts.push(h('li', { text: 'Hors délai : moins de ' + o().delaiMois + ' mois avant le début (signalé au validateur, non bloquant).' }));
      var dejaTardive = c && c.statut === 'demande' ? c.tardive : null, tardive = dejaTardive || (!(c && c.statut === 'demande') ? v.tardive : null);
      if (tardive) pts.push(h('li', { class: 'cg-tardive-avis', text: 'Date limite de dépôt dépassée pour « ' + tardive.libelle + ' » (avant le ' + jourFr(tardive.limite) + ') : votre demande reste possible mais n’est pas prioritaire. Elle n’apparaît qu’à vous et au validateur jusqu’à sa validation.' }));
      (v.limites || []).forEach(function (p) { zone.appendChild(h('p', { class: 'info', text: '« ' + p.libelle + ' » : demandes à déposer avant le ' + jourFr(p.limite) + ' pour être prioritaires.' })); });
      v.regles.forEach(function (r) { pts.push(h('li', { text: (r.regle.bloquante ? 'Règle bloquante' : 'Règle') + ' du tableau « ' + r.nom + ' » : jusqu’à ' + r.max + ' ' + (r.regle.pour === '*' ? 'agents' : libRole(r.regle.pour)) + ' en congé en même temps (' + r.regle.max + ' au plus), les ' + r.jours.map(jourFr).join(', ') + '.' })); });
      if (pts.length) zone.appendChild(h('div', { class: 'alerte' }, h('b', { text: 'À vérifier :' }), h('ul', {}, pts)));
      var vals = C.validateurs(cfg(), comptes(), a);
      zone.appendChild(h('small', { class: 'muted', text: 'Validateur : ' + libRole(C.roleValidateur(cfg(), a.roles)) + (vals.length ? ' (' + vals.map(function (y) { return y.nom; }).join(', ') + ')' : ' — aucun compte ne porte ce rôle dans les services de l’agent : l’administrateur valide') + '.' }));
    }
    [deb, fin, dd, df, selType].forEach(function (e) { e.addEventListener('change', function () { if (e === deb) remplirTypes(); verifier(); }); });
    if (selAgent) selAgent.addEventListener('change', function () { remplirTypes(); verifier(); });
    remplirTypes(); verifier();
    async function enregistrer(statut) {
      var y = courant();
      var d = { id: (c && c.id) || id(), agent: y.agent, nom: (agent(y.agent) || {}).nom || '', roles: ((agent(y.agent) || {}).roles || []).filter(function (r) { return r !== 'ADMIN'; }), service: y.service, type: y.type, debut: y.debut, fin: y.fin, demiDebut: y.demiDebut, demiFin: y.demiFin, commentaire: com.value.trim(), statut: statut };
      await s().enregistrer('CONGE', d);
      U.toast(statut === 'souhait' ? 'Souhait enregistré.' : 'Demande envoyée au validateur.');
    }
    var boutons = [{ texte: 'Annuler' }];
    if (o().souhaits && (!c || c.statut === 'souhait')) boutons.push({ texte: 'Enregistrer en souhait', action: function () { return enregistrer('souhait'); } });
    boutons.push({ texte: c && c.statut === 'demande' ? 'Enregistrer la demande' : 'Envoyer la demande', classe: 'primaire', action: function () { return enregistrer('demande'); } });
    U.modale(nouveau ? 'Nouvelle demande de congé' : 'Modifier le congé', h('div', { class: 'pile' },
      selAgent ? h('label', {}, 'Agent', selAgent) : null,
      h('label', {}, 'Type de congé', selType),
      h('div', { class: 'grille-2' }, h('label', {}, 'Du', deb), h('label', {}, 'Au', fin),
        h('label', { class: 'case' }, dd, h('span', { text: 'Le premier jour : après-midi seulement' })), h('label', { class: 'case' }, df, h('span', { text: 'Le dernier jour : matin seulement' }))),
      h('label', {}, 'Commentaire pour le validateur', com), zone, alerte(),
      o().souhaits ? h('small', { class: 'muted', text: 'Un souhait reste visible de vous et du validateur seulement, sans demande envoyée ; il se transforme en demande quand vous le décidez.' }) : null), boutons);
  }
  async function envoyer(c) { try { await s().enregistrer('CONGE', { id: c.id, statut: 'demande' }); U.toast('Demande envoyée au validateur.'); } catch (e) { alert(e.message); } }
  async function decider(c, decision, motif) { try { await s().enregistrer('CONGE_DECISION', { conge: c.id, decision: decision, motif: motif || '', nom: moi().nom }); U.toast(decision === 'valide' ? 'Congé validé.' : 'Demande refusée.'); } catch (e) { alert(e.message); } }
  function modaleRefus(c) {
    var m = h('input', { type: 'text', maxlength: 300, placeholder: 'Ex. : effectif minimal (vu par l’agent, sans donnée de santé)', 'aria-label': 'Motif du refus' });
    U.modale('Refuser la demande de ' + nomDe(c), h('div', { class: 'pile' }, h('p', { text: libType(c.type) + ', ' + periodeFr(c) + '.' }), h('label', {}, 'Motif', m)),
      [{ texte: 'Annuler' }, { texte: 'Refuser la demande', classe: 'primaire', action: async function () { if (!m.value.trim()) throw new Error('Indiquez le motif.'); await s().enregistrer('CONGE_DECISION', { conge: c.id, decision: 'refuse', motif: m.value.trim(), nom: moi().nom }); U.toast('Demande refusée.'); } }], { focus: m });
  }
  function annuler(c) {
    if (c.statut === 'souhait' || (c.statut === 'demande' && c.agent === moi().id)) {
      if (!confirm((c.statut === 'souhait' ? 'Supprimer ce souhait' : 'Annuler cette demande') + ' (' + periodeFr(c) + ') ?')) return;
      s().enregistrer('CONGE_ANNULATION', { conge: c.id, motif: '' }).then(function () { U.toast('Annulé.'); }, function (e) { alert(e.message); });
      return;
    }
    var m = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Motif de l’annulation' });
    U.modale('Annuler le congé de ' + nomDe(c), h('div', { class: 'pile' }, h('p', { text: libType(c.type) + ', ' + periodeFr(c) + ' — ' + C.STATUTS[c.statut] + '.' }), h('label', {}, 'Motif (vu par l’agent)', m)),
      [{ texte: 'Retour' }, { texte: 'Annuler le congé', classe: 'primaire', action: async function () { await s().enregistrer('CONGE_ANNULATION', { conge: c.id, motif: m.value.trim() }); U.toast('Congé annulé.'); } }], { focus: m });
  }
  function modaleConge(c) {
    var a = agent(c.agent), lui = c.agent === moi().id, v = validateurDe(a), voitType = lui || v;
    var x = voitType ? C.verifier(st(), cfg(), c, { comptes: comptes(), aujourdhui: auj() }) : null;
    var boutons = [{ texte: 'Fermer' }];
    if ((lui || v) && (c.statut === 'souhait' || c.statut === 'demande')) boutons.push({ texte: 'Modifier', action: function () { setTimeout(function () { modaleDemande(c); }, 0); } });
    if (lui && c.statut === 'souhait') boutons.push({ texte: 'Envoyer la demande', action: function () { return envoyer(c); } });
    if (v && !lui && c.statut === 'demande') { boutons.push({ texte: 'Refuser…', action: function () { setTimeout(function () { modaleRefus(c); }, 0); } }); boutons.push({ texte: 'Valider', classe: 'primaire', action: function () { return decider(c, 'valide'); } }); }
    if ((lui && (c.statut === 'souhait' || c.statut === 'demande')) || (v && (c.statut === 'valide' || c.statut === 'demande'))) boutons.splice(1, 0, { texte: 'Annuler le congé…', action: function () { setTimeout(function () { annuler(c); }, 0); } });
    U.modale('Congé de ' + nomDe(c), h('div', { class: 'pile' },
      h('div', { class: 'barre' }, badge(c.statut), h('span', { class: 'muted', text: c.demandeLe ? 'demandé le ' + new Date(c.demandeLe).toLocaleDateString('fr-FR') : '' })),
      h('p', { text: (voitType ? libType(c.type) : 'Congé') + ', ' + periodeFr(c) + (voitType ? ' — ' + nb(C.decompte(st(), cfg(), c)) + ' jour(s) décompté(s)' : '') + '.' }),
      c.statut === 'demande' && c.tardive ? h('p', { class: 'alerte' }, badgeTardive(c), h('span', { text: ' Demande déposée après la date limite : elle passe après les demandes déposées à temps, et n’est visible que de l’agent et du validateur jusqu’à sa validation.' })) : null,
      voitType && c.commentaire ? h('p', { class: 'muted', text: 'Commentaire : ' + c.commentaire }) : null,
      c.decision && c.decision.motif ? h('p', { class: 'muted', text: 'Motif : ' + c.decision.motif }) : null,
      x && (x.regles.length || x.bloquees.length || x.horsDelai) ? h('div', { class: 'alerte' }, h('ul', {}, x.regles.map(function (r) { return h('li', { text: 'Règle « ' + (r.regle.pour === '*' ? 'agents' : libRole(r.regle.pour)) + ' : ' + r.regle.max + ' au plus » : jusqu’à ' + r.max + ' les ' + r.jours.map(jourFr).join(', ') + '.' }); })
        .concat(x.bloquees.map(function (p) { return h('li', { text: 'Sur une période bloquée : ' + p.libelle + '.' }); })).concat(x.horsDelai ? [h('li', { text: 'Demande hors délai.' })] : []))) : null,
      voitType && x && x.soldeApres !== undefined ? h('small', { class: 'muted', text: 'Solde de « ' + libType(c.type) + ' » après ce congé : ' + nb(x.soldeApres) + ' jour(s).' }) : null), boutons);
  }

  // ------------------------------------------------------------ Tableau du service
  function mesServices() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function tableauxVisibles() {
    var sv = mesServices();
    return Object.keys(st().tableaux).map(function (k) { return st().tableaux[k]; }).filter(function (t) { return !t.supprime && sv.indexOf(t.service) >= 0 && (t.visible !== false || peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0); })
      .sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); });
  }
  function lundiDe(iso) { var d = C.jourSemaine(iso); return C.plusJours(iso, d === 0 ? -6 : 1 - d); }
  function classePeriode(j, tete) {
    var p = j.periodes.filter(function (x) { return x.effet === 'bloquee'; })[0] || j.periodes.filter(function (x) { return x.effet === 'eviter'; })[0] || j.periodes[0];
    return p ? 'cg-p-' + p.effet : j.horsDelai && tete ? 'cg-p-delai' : '';
  }
  function couleurPeriode(el, j) { var p = j.periodes.filter(function (x) { return x.couleur; })[0]; if (p && p.effet === 'info') { el.style.backgroundColor = p.couleur; el.style.backgroundColor = 'color-mix(in srgb, ' + p.couleur + ' 45%, transparent)'; } return el; }
  function legende(t) {
    var stt = ['souhait', 'demande', 'valide', 'refuse'].filter(function (k) { return k !== 'souhait' || (o().souhaits && t.souhaits !== false); });
    var ps = C.periodes(st(), t.service, t.debut, t.fin);
    return h('div', { class: 'cg-legende' }, h('b', { text: 'Statut :' }), stt.map(function (k) { return h('span', {}, teinte(h('span', { class: 'cg-pastille cg-' + k }), k), C.STATUTS[k]); }),
      o().feries.afficher ? h('span', {}, teinte(h('span', { class: 'cg-pastille cg-ferie' }), 'ferie'), 'Férié posé d’office') : null,
      o().afficherTempsPartiel ? h('span', {}, h('span', { class: 'cg-pastille cg-nt' }), 'RTP habituel (temps partiel, hors congé)') : null,
      peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0 || ps.some(function (p) { return p.effet === 'limite'; }) ? h('span', {}, h('span', { class: 'cg-pastille cg-pastille-tardive' }), 'Demande non prioritaire (déposée après la date limite)') : null,
      ps.length ? h('b', { text: 'Périodes :' }) : null, ps.map(function (p) { return h('span', {}, couleurPeriode(h('span', { class: 'cg-pastille cg-p-' + p.effet }), { periodes: [p] }), p.libelle + (p.effet === 'bloquee' ? ' (bloquée)' : p.effet === 'eviter' ? ' (à éviter)' : p.effet === 'limite' ? ' (dépôt avant le ' + jourFr(p.limite) + ')' : '')); }),
      o().delaiMois ? h('span', {}, h('span', { class: 'cg-pastille cg-p-delai' }), 'Hors délai de demande (' + o().delaiMois + ' mois)') : null,
      h('span', {}, h('span', { class: 'cg-pastille cg-pastille-regle' }), 'Règle non respectée'));
  }
  function vueTableau() {
    var ts = tableauxVisibles(), valideur = peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0;
    if (!ts.length) return h('div', { class: 'pile' }, alerte(), h('section', { class: 'panneau vide' }, h('p', { text: 'Aucun tableau de congés pour ' + (U.App.service === '*' ? 'vos services' : U.libService(U.App.service)) + '.' }),
      peut('TABLEAU_CONGES') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleTableau(null); } }, '+ Créer un tableau') : h('p', { class: 'muted', text: 'Le cadre ou le validateur crée les tableaux de l’année.' })));
    var t = ts.filter(function (x) { return x.id === vue.tableau; })[0] || ts.filter(function (x) { return x.debut <= auj() && x.fin >= auj(); })[0] || ts[0];
    vue.tableau = t.id;
    var res = t.resolution || 'deux', mode = res === 'jour' ? 'jour' : res === 'semaine' ? 'semaine' : (vue.mode || 'jour');
    var sel = h('select', { 'aria-label': 'Tableau', onchange: function () { vue.tableau = sel.value; vue.ref = ''; U.rendreContenu(); } }, ts.map(function (x) { return h('option', { value: x.id, text: x.nom + (x.nom.indexOf(U.libService(x.service)) >= 0 ? '' : ' — ' + U.libService(x.service)), selected: x.id === t.id }); }));
    var debut, fin;
    if (mode === 'jour') {
      var ref = vue.ref && vue.ref >= t.debut && vue.ref <= t.fin ? vue.ref : (auj() >= t.debut && auj() <= t.fin ? auj() : t.debut);
      debut = lundiDe(ref) < t.debut ? t.debut : lundiDe(ref); fin = C.plusJours(debut, 34) > t.fin ? t.fin : C.plusJours(debut, 34);
    } else { debut = t.debut; fin = t.fin; }
    var g = C.grille(st(), cfg(), t, comptes(), debut, fin, auj());
    function aller(k) { vue.ref = C.plusJours(debut, k); U.rendreContenu(); }
    var grille = mode === 'jour' ? grilleJours(t, g) : grilleSemaines(t, g);
    return h('div', { class: 'pile' }, alerte(),
      h('div', { class: 'barre' }, h('label', { class: 'en-ligne' }, 'Tableau', sel),
        res === 'deux' ? h('div', { class: 'actions gauche cg-bascule', role: 'group', 'aria-label': 'Résolution' },
          h('button', { class: 'btn petit' + (mode === 'semaine' ? ' actif' : ''), type: 'button', 'aria-pressed': mode === 'semaine' ? 'true' : 'false', onclick: function () { vue.mode = 'semaine'; U.rendreContenu(); } }, 'Semaine'),
          h('button', { class: 'btn petit' + (mode === 'jour' ? ' actif' : ''), type: 'button', 'aria-pressed': mode === 'jour' ? 'true' : 'false', onclick: function () { vue.mode = 'jour'; U.rendreContenu(); } }, 'Jour')) : null,
        mode === 'jour' ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Période précédente', disabled: debut <= t.debut, onclick: function () { aller(-35); } }, '‹') : null,
        h('b', { text: jourFr(debut) + ' → ' + jourFr(fin) }),
        mode === 'jour' ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Période suivante', disabled: fin >= t.fin, onclick: function () { aller(35); } }, '›') : null,
        h('span', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { imprimer(t, grille.cloneNode(true)); } }, 'Imprimer'),
        peut('PERIODE_CONGES') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modalePeriode(null, { service: t.service, effet: 'bloquee' }); } }, 'Bloquer une période…') : null,
        peut('TABLEAU_CONGES') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleTableau(t); } }, 'Régler ce tableau') : null,
        peut('CONGE') ? h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { modaleDemande(null); } }, '+ Demande') : null),
      legende(t), grille,
      g.depassements.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Règles non respectées' }), h('ul', {}, g.depassements.map(function (d) {
        return h('li', { class: 'cg-alerte-regle', text: (d.regle.pour === '*' ? 'Agents' : libRole(d.regle.pour)) + ' : ' + d.regle.max + ' au plus en congé en même temps' + (d.regle.bloquante ? ' (bloquante)' : ' (non bloquante)') + ' — non respectée les ' + d.jours.map(jourFr).join(', ') + '.' });
      })), h('small', { class: 'muted', text: 'Les règles comptent les congés demandés et validés et les fériés posés d’office ; les souhaits sont comptés à part.' })) : null,
      valideur ? null : h('small', { class: 'muted', text: 'Vous voyez les noms et les périodes de vos collègues, sans le type de congé ; un clic sur une case libre de votre ligne prépare une demande.' }));
  }
  function caseConge(t, a, cel, j, premier) {
    var lui = a.compte.id === moi().id, v = validateurDe(a.compte), voit = lui || v, c = cel.conge;
    var montreSouhait = c && c.statut === 'souhait' && (lui || (v && t.souhaits !== false));
    // Demande non prioritaire (déposée après la date limite) : vue de l'agent et du validateur seulement
    if (c && c.statut === 'demande' && c.tardive && !voit) c = null;
    var nt = cel.nonTravaille && o().afficherTempsPartiel;
    var el = h('div', { class: 'cg-case ' + classePeriode(j) + (j.semaine === 0 || j.semaine === 6 ? ' cg-we' : '') });
    couleurPeriode(el, j);
    if (nt && !(c && c.statut !== 'refuse')) { el.className = 'cg-case cg-nt'; el.title = 'RTP habituel (temps partiel)'; }
    else if (c && (c.statut !== 'souhait' || montreSouhait) && (c.statut !== 'refuse' || voit)) {
      el.className = 'cg-case cg-' + c.statut + (c.statut === 'demande' && c.tardive ? ' cg-tardive' : ''); teinte(el, c.statut);
      el.title = a.compte.nom + ' — ' + (voit ? libType(c.type) + ' — ' : '') + C.STATUTS[c.statut] + (c.statut === 'demande' && c.tardive ? ' — non prioritaire (déposée après le ' + jourFr(c.tardive.limite) + ')' : '');
      if (j.iso === c.debut || premier) el.appendChild(h('span', { text: voit ? abrevType(c.type) : '' }));
      el.addEventListener('click', function () { modaleConge(c); }); el.tabIndex = 0; el.setAttribute('role', 'button');
    } else if (cel.ferieOffice && o().feries.afficher) { el.className = 'cg-case cg-ferie'; teinte(el, 'ferie'); el.title = 'Férié posé d’office : ' + cel.ferie; el.appendChild(h('span', { text: 'F' })); }
    else if (lui && peut('CONGE')) { el.classList.add('cg-libre'); el.title = 'Demander un congé à partir du ' + jourFr(j.iso); el.tabIndex = 0; el.setAttribute('role', 'button'); el.addEventListener('click', function () { modaleDemande(null, { debut: j.iso, fin: j.iso }); }); }
    else if (v && peut('CONGE') && !lui) { el.classList.add('cg-libre'); el.title = 'Saisir un congé pour ' + a.compte.nom; el.addEventListener('click', function () { modaleDemande(null, { agent: a.compte.id, debut: j.iso, fin: j.iso }); }); }
    if (j.ferie && !el.classList.contains('cg-ferie') && o().feries.afficher) el.classList.add('cg-col-ferie');
    return el;
  }
  /** Case de total : nombre en congé (règle non respectée en rouge), et « (+n) » des demandes non prioritaires pour le validateur. */
  function caseTotal(v, max, k) {
    var e = h('div', { class: 'cg-case ' + (max !== null && v > max ? 'cg-total-depasse' : v || k ? '' : 'cg-zero') }, h('span', { text: v ? String(v) : k ? '0' : '·' }));
    if (k) { e.classList.add('cg-avec-np'); e.appendChild(h('small', { class: 'cg-total-np', text: '(+' + k + ')' })); e.title = k + ' demande(s) non prioritaire(s) en plus, non comptée(s) dans les règles'; }
    return e;
  }
  function grilleJours(t, g) {
    var n = g.jours.length, colonnes = 'minmax(170px, 210px) repeat(' + n + ', minmax(26px, 1fr))';
    function ligne(cls) { var r = h('div', { class: 'cg-ligne ' + (cls || '') }); r.style.gridTemplateColumns = colonnes; return r; }
    var tete = ligne('cg-tete'); tete.appendChild(h('div', { class: 'cg-nom', text: 'Agent' }));
    g.jours.forEach(function (j, i) {
      var d = h('div', { class: 'cg-jour ' + classePeriode(j, true) + (j.ferie && o().feries.afficher ? ' cg-col-ferie' : '') + (j.semaine === 0 || j.semaine === 6 ? ' cg-we' : ''), title: (j.ferie ? 'Férié : ' + j.ferie + '. ' : '') + j.periodes.map(function (p) { return p.libelle; }).join(', ') },
        h('small', { text: j.ferie && o().feries.afficher ? 'férié' : JS[j.semaine] }), h('b', { text: String(+j.iso.slice(8)) }), h('small', { text: +j.iso.slice(8) === 1 || i === 0 ? MOIS[+j.iso.slice(5, 7) - 1] : '' }));
      couleurPeriode(d, j); tete.appendChild(d);
    });
    var bloc = h('div', { class: 'cg-grille', role: 'table', 'aria-label': 'Tableau des congés' }, tete), role = null;
    var dep = {}; g.depassements.forEach(function (x) { x.jours.forEach(function (iso) { (dep[iso] = dep[iso] || []).push(x.regle.pour); }); });
    g.agents.forEach(function (a) {
      if (a.role !== role) { role = a.role; var rg = g.regles.filter(function (r) { return r.pour === a.role; })[0]; bloc.appendChild(h('div', { class: 'cg-groupe', text: (libRole(a.role) || 'Autres') + (rg ? ' — règle : ' + rg.max + ' au plus en congé en même temps' + (rg.bloquante ? ' (bloquante)' : '') : '') })); }
      var r = ligne(), q = C.quotiteLe(st(), a.compte.id, g.jours[0].iso);
      r.appendChild(h('div', { class: 'cg-nom' }, U.equipe && U.equipe.lien ? U.equipe.lien(a.compte.id, a.compte.nom) : h('b', { text: a.compte.nom }), o().afficherTempsPartiel && q.quotite < 100 ? h('small', { class: 'muted', text: ' ' + q.quotite + ' %' }) : null));
      a.cases.forEach(function (cel, i) {
        var j = g.jours[i], e = caseConge(t, a, cel, j, i === 0);
        if ((dep[j.iso] || []).some(function (p) { return p === '*' || (a.compte.roles || []).indexOf(p) >= 0; })) e.classList.add('cg-depasse');
        r.appendChild(e);
      });
      bloc.appendChild(r);
    });
    if (t.totaux !== false) {
      var lignesT = g.regles.filter(function (x) { return x.pour !== '*'; }).map(function (x) { return [x.pour, 'Total ' + libRole(x.pour), x.max]; });
      var rt = g.regles.filter(function (x) { return x.pour === '*'; })[0];
      lignesT.push(['*', 'Total en congé', rt ? rt.max : null]);
      if (o().souhaits && t.souhaits !== false && (peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0)) lignesT.push(['souhaits', 'dont souhaits (non comptés)', null]);
      // Demandes non prioritaires (déposées après la date limite) : comptées à part, entre parenthèses, pour le validateur seulement
      var voitNP = peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0, np = (g.comptes.nonPrioritaires) || {};
      lignesT.forEach(function (x) {
        var r = ligne('cg-total'); r.appendChild(h('div', { class: 'cg-nom', text: x[1] }));
        (g.comptes[x[0]] || []).forEach(function (v, i) { r.appendChild(caseTotal(v, x[2], voitNP && np[x[0]] ? np[x[0]][i] : 0)); });
        bloc.appendChild(r);
      });
    }
    return h('div', { class: 'cg-defile' }, bloc);
  }
  function grilleSemaines(t, g) {
    var sem = [];
    g.jours.forEach(function (j, i) { var l = lundiDe(j.iso); if (!sem.length || sem[sem.length - 1].lundi !== l) sem.push({ lundi: l, idx: [] }); sem[sem.length - 1].idx.push(i); });
    var colonnes = 'minmax(160px, 200px) repeat(' + sem.length + ', minmax(22px, 1fr))';
    function ligne(cls) { var r = h('div', { class: 'cg-ligne ' + (cls || '') }); r.style.gridTemplateColumns = colonnes; return r; }
    function numSemaine(iso) { var d = new Date(C.versJour(iso) * 864e5), j = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - j + 3); var p = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - p) / 864e5 - 3 + ((p.getUTCDay() + 6) % 7)) / 7); }
    var tete = ligne('cg-tete'); tete.appendChild(h('div', { class: 'cg-nom', text: 'Agent / semaine' }));
    var dernierMois = '';
    sem.forEach(function (x) {
      var m = MOIS[+x.lundi.slice(5, 7) - 1], js = x.idx.map(function (i) { return g.jours[i]; }), p = js.filter(function (j) { return classePeriode(j); })[0];
      var d = h('div', { class: 'cg-jour ' + (p ? classePeriode(p) : ''), title: 'Semaine du ' + jourFr(x.lundi) }, h('small', { text: m !== dernierMois ? m : '' }), h('b', { text: String(numSemaine(x.lundi)) }));
      if (p) couleurPeriode(d, p); dernierMois = m; tete.appendChild(d);
    });
    var bloc = h('div', { class: 'cg-grille cg-semaines', role: 'table', 'aria-label': 'Tableau des congés à la semaine' }, tete), role = null;
    g.agents.forEach(function (a) {
      if (a.role !== role) { role = a.role; bloc.appendChild(h('div', { class: 'cg-groupe', text: libRole(a.role) || 'Autres' })); }
      var r = ligne(), lui = a.compte.id === moi().id, v = validateurDe(a.compte);
      r.appendChild(h('div', { class: 'cg-nom' }, h('b', { text: a.compte.nom })));
      sem.forEach(function (x) {
        var cels = x.idx.map(function (i) { return a.cases[i]; }), vus = cels.filter(function (c) { return c.conge && (c.statut === 'valide' || (c.statut === 'demande' && (!c.conge.tardive || lui || v)) || (c.statut === 'souhait' && (lui || v))); });
        var pire = ['demande', 'valide', 'souhait'].filter(function (k) { return vus.some(function (c) { return c.statut === k; }); })[0];
        var e = h('div', { class: 'cg-case' + (pire ? ' cg-' + pire : '') }, vus.length ? String(vus.length) : '');
        if (vus.some(function (c) { return c.statut === 'demande' && c.conge.tardive; })) e.classList.add('cg-tardive');
        if (pire) { teinte(e, pire); e.title = a.compte.nom + ' : ' + vus.length + ' jour(s) de congé dans la semaine'; e.tabIndex = 0; e.setAttribute('role', 'button'); e.addEventListener('click', function () { vue.mode = 'jour'; vue.ref = x.lundi; U.rendreContenu(); }); }
        if (g.depassements.some(function (d) { return (d.regle.pour === '*' || (a.compte.roles || []).indexOf(d.regle.pour) >= 0) && x.idx.some(function (i) { return d.jours.indexOf(g.jours[i].iso) >= 0; }); })) e.classList.add('cg-depasse');
        r.appendChild(e);
      });
      bloc.appendChild(r);
    });
    if (t.totaux !== false) {
      var voitNP = peut('CONGE_DECISION') || s().roles().indexOf('ADMIN') >= 0, np = (g.comptes.nonPrioritaires) || {};
      var lignesT = g.regles.filter(function (x) { return x.pour !== '*'; }).map(function (x) { return [x.pour, libRole(x.pour) + ' (max. simultanés)', x.max]; });
      var rt = g.regles.filter(function (x) { return x.pour === '*'; })[0];
      lignesT.push(['*', 'Tous (max. simultanés)', rt ? rt.max : null]);
      lignesT.forEach(function (x) {
        var r = ligne('cg-total'); r.appendChild(h('div', { class: 'cg-nom', text: x[1] }));
        sem.forEach(function (w) { var v = Math.max.apply(null, w.idx.map(function (i) { return (g.comptes[x[0]] || [])[i] || 0; })), k = voitNP && np[x[0]] ? Math.max.apply(null, w.idx.map(function (i) { return np[x[0]][i] || 0; })) : 0; r.appendChild(caseTotal(v, x[2], k)); });
        bloc.appendChild(r);
      });
    }
    return h('div', { class: 'pile' }, h('div', { class: 'cg-defile' }, bloc), h('small', { class: 'muted', text: 'Chiffre d’une case : jours de congé de l’agent dans la semaine ; un clic ouvre la semaine à la journée. Totaux : le plus grand nombre d’agents en congé le même jour de la semaine.' }));
  }
  function imprimer(t, grille) {
    U.imprimer(h('article', { class: 'cg-impression' }, h('h1', { text: t.nom + ' — ' + U.libService(t.service) }), legende(t), grille, h('p', { class: 'muted', text: 'Imprimé le ' + new Date().toLocaleDateString('fr-FR') + ' — document interne, données personnelles des agents.' })));
  }

  // ------------------------------------------------------------ À valider
  function vueAValider() {
    var l = C.aValider(st(), cfg(), comptes(), moi());
    return h('div', { class: 'pile' }, h('h1', { text: 'Demandes à valider (' + l.length + ')' }), alerte(),
      !l.length ? h('p', { class: 'muted', text: 'Aucune demande en attente de votre validation.' }) : h('section', { class: 'panneau' }, h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Agent', 'Type', 'Période', 'Jours', 'Solde après', 'Demandé le', 'Points d’attention', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, l.map(function (c) {
          var a = agent(c.agent) || { id: c.agent, roles: [], services: [c.service] }, v = C.verifier(st(), cfg(), c, { comptes: comptes(), aujourdhui: auj() }), q = C.quotiteLe(st(), c.agent, c.debut);
          var pts = v.regles.map(function (r) { return h('span', { class: 'badge cg-badge-regle', text: (r.regle.pour === '*' ? 'Agents' : libRole(r.regle.pour)) + ' : ' + r.max + ' en même temps' }); })
            .concat(v.bloquees.map(function (p) { return h('span', { class: 'badge cg-badge-bloque', text: 'Période bloquée' }); }))
            .concat(v.eviter.map(function (p) { return h('span', { class: 'badge', text: 'À éviter : ' + p.libelle }); }))
            .concat(v.horsDelai ? [h('span', { class: 'badge', text: 'Hors délai' })] : []).concat(c.tardive ? [badgeTardive(c)] : []);
          return h('tr', {}, h('td', {}, h('b', { text: nomDe(c) }), h('div', {}, h('small', { class: 'muted', text: libRole(C.rolePrincipal(a.roles)) + (o().afficherTempsPartiel && q.quotite < 100 ? ' · ' + q.quotite + ' %' : '') }))),
            h('td', { text: libType(c.type) }), h('td', { text: periodeFr(c) }), h('td', { text: nb(v.jours) + ' j' }), h('td', { text: v.soldeApres !== undefined ? nb(v.soldeApres) + ' j' : '—' }),
            h('td', { class: 'muted', text: c.demandeLe ? new Date(c.demandeLe).toLocaleDateString('fr-FR') : '' }), h('td', {}, pts.length ? h('div', { class: 'actions gauche' }, pts) : h('small', { class: 'muted', text: 'Aucun' }), c.commentaire ? h('div', {}, h('small', { class: 'muted', text: '« ' + c.commentaire + ' »' })) : null),
            h('td', {}, h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(c, 'valide'); } }, 'Valider'),
              h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleRefus(c); } }, 'Refuser…'),
              h('button', { class: 'btn petit', type: 'button', onclick: function () { var t = tableauxVisibles().filter(function (x) { return x.service === c.service && x.debut <= c.debut && x.fin >= c.debut; })[0]; if (t) vue.tableau = t.id; vue.mode = 'jour'; vue.ref = c.debut; U.App.onglet = 'tableau'; U.rendreContenu(); } }, 'Voir au tableau'))));
        })))), h('small', { class: 'muted', text: 'Vous validez les demandes des agents dont vous êtes le validateur (réglage « Validateurs » : selon le rôle de l’agent, dans vos services). L’agent est informé de la décision ; un congé validé devient une absence dans l’Agenda.' })));
  }

  // ------------------------------------------------------------ Tableaux, périodes, droits et quotités (validateurs, cadre)
  function servicesGeres() { var a = s().roles().indexOf('ADMIN') >= 0; return U.tousServices().filter(function (x) { return a || (moi().services || []).indexOf(x.code) >= 0; }); }
  function rolesProposes() { return ['IDE', 'AS', 'SECRETAIRE', 'CADRE', 'MEDECIN'].concat((SIC.modules.obtenir('isocont').droits.rolesConfig(cfg()) || []).map(function (r) { return r.code; }).filter(function (c) { return /^R_/.test(c); })); }
  function modaleTableau(t, pre) {
    var x = Object.assign({ service: (servicesGeres()[0] || {}).code, nom: '', debut: new Date().getFullYear() + 1 + '-01-01', fin: new Date().getFullYear() + 1 + '-12-31', resolution: 'deux', roles: [], visible: true, souhaits: true, totaux: true, regles: [] }, t || {}, pre || {});
    var sv = h('select', { 'aria-label': 'Service' }, servicesGeres().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === x.service }); }));
    var nom = h('input', { type: 'text', maxlength: 80, value: x.nom, placeholder: 'Ex. : Année 2027, Été 2027…', 'aria-label': 'Nom du tableau' });
    var deb = h('input', { type: 'date', value: x.debut, 'aria-label': 'Début' }), fin = h('input', { type: 'date', value: x.fin, 'aria-label': 'Fin' });
    var res = h('select', { 'aria-label': 'Résolution' }, [['deux', 'Jour et semaine (au choix à l’affichage)'], ['semaine', 'Semaine seulement'], ['jour', 'Jour seulement']].map(function (y) { return h('option', { value: y[0], text: y[1], selected: x.resolution === y[0] }); }));
    var roles = rolesProposes().map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: (x.roles || []).indexOf(r) >= 0 }) }; });
    var vis = h('input', { type: 'checkbox', checked: x.visible !== false }), sou = h('input', { type: 'checkbox', checked: x.souhaits !== false }), tot = h('input', { type: 'checkbox', checked: x.totaux !== false });
    var zr = h('div', { class: 'pile' }), regles = (x.regles || []).map(function (r) { return Object.assign({}, r); });
    function dessinerRegles() {
      U.vider(zr);
      regles.forEach(function (r, i) {
        var pour = h('select', { 'aria-label': 'Règle ' + (i + 1) + ' : pour' }, [['*', 'Tous les agents du tableau']].concat(rolesProposes().map(function (c) { return [c, libRole(c)]; })).map(function (y) { return h('option', { value: y[0], text: y[1], selected: r.pour === y[0] }); }));
        var max = h('input', { type: 'number', min: 0, max: 200, value: r.max, class: 'champ-court', 'aria-label': 'Règle ' + (i + 1) + ' : maximum' });
        var bl = h('input', { type: 'checkbox', checked: !!r.bloquante });
        pour.addEventListener('change', function () { r.pour = pour.value; }); max.addEventListener('change', function () { r.max = +max.value; }); bl.addEventListener('change', function () { r.bloquante = bl.checked; });
        zr.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: 'Au plus' }), max, h('span', { text: 'en congé en même temps :' }), pour, h('label', { class: 'case' }, bl, h('span', { text: 'bloquante' })),
          h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la règle', onclick: function () { regles.splice(i, 1); dessinerRegles(); } }, '✕')));
      });
      zr.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { regles.push({ pour: 'IDE', max: 3, bloquante: false }); dessinerRegles(); } }, '+ Règle'),
        h('small', { class: 'muted', text: 'Non bloquante par défaut : les jours concernés sont encadrés en rouge et signalés à la demande ; bloquante : la demande est refusée ces jours-là (le validateur peut toujours saisir).' })));
    }
    dessinerRegles();
    var boutons = [{ texte: 'Annuler' }];
    if (t) boutons.push({ texte: 'Supprimer le tableau', classe: 'danger', action: async function () { if (!confirm('Supprimer le tableau « ' + t.nom + ' » ? Les congés ne sont pas touchés.')) return false; await s().enregistrer('TABLEAU_CONGES', { id: t.id, service: t.service, supprime: true }); vue.tableau = ''; } });
    if (t) boutons.push({ texte: 'Dupliquer pour l’année suivante', action: function () { setTimeout(function () { modaleTableau(null, { service: t.service, nom: t.nom.replace(/\d{4}/, function (a) { return String(+a + 1); }), debut: C.plusJours(t.debut, 365), fin: C.plusJours(t.fin, 365), resolution: t.resolution, roles: t.roles, visible: t.visible, souhaits: t.souhaits, totaux: t.totaux, regles: t.regles }); }, 0); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { id: (t && t.id) || 'TC' + CR.hex(CR.aleatoire(4)), service: sv.value, nom: nom.value.trim(), debut: deb.value, fin: fin.value, resolution: res.value, roles: roles.filter(function (y) { return y.cb.checked; }).map(function (y) { return y.r; }),
        visible: vis.checked, souhaits: sou.checked, totaux: tot.checked, regles: regles.map(function (r) { return { pour: r.pour, max: Math.round(+r.max), bloquante: !!r.bloquante }; }) };
      await s().enregistrer('TABLEAU_CONGES', d); vue.tableau = d.id; U.toast('Tableau enregistré.');
    } });
    U.modale(t ? 'Régler le tableau' : 'Nouveau tableau de congés', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nom), h('label', {}, 'Service', sv), h('label', {}, 'Du', deb), h('label', {}, 'Au', fin), h('label', {}, 'Résolution', res)),
      h('fieldset', {}, h('legend', { text: 'Agents du tableau (aucune case : tous les agents du service)' }), h('div', { class: 'actions gauche' }, roles.map(function (y) { return h('label', { class: 'case' }, y.cb, h('span', { text: libRole(y.r) })); }))),
      h('label', { class: 'case' }, vis, h('span', { text: 'Visible par les agents du tableau (noms et périodes, sans le type de congé)' })),
      h('label', { class: 'case' }, sou, h('span', { text: 'Montrer les souhaits au validateur dans ce tableau' + (o().souhaits ? '' : ' (souhaits désactivés pour l’établissement)') })),
      h('label', { class: 'case' }, tot, h('span', { text: 'Totaux en bas du tableau' })),
      h('fieldset', {}, h('legend', { text: 'Règles du tableau' }), zr)), boutons, { large: true });
  }
  function modalePeriode(p, pre) {
    var x = Object.assign({ service: (servicesGeres()[0] || {}).code, libelle: '', debut: '', fin: '', effet: 'info', couleur: '#e4eefb', roles: [] }, p || {}, pre || {});
    var admin = s().roles().indexOf('ADMIN') >= 0;
    var sv = h('select', { 'aria-label': 'Service' }, (admin ? [h('option', { value: '*', text: 'Tout l’établissement', selected: x.service === '*' })] : []).concat(servicesGeres().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === x.service }); })));
    var lib = h('input', { type: 'text', maxlength: 80, value: x.libelle, placeholder: 'Ex. : Vacances scolaires (zone…), Visite de certification', 'aria-label': 'Libellé' });
    var deb = h('input', { type: 'date', value: x.debut, 'aria-label': 'Du' }), fin = h('input', { type: 'date', value: x.fin, 'aria-label': 'Au' });
    var eff = h('select', { 'aria-label': 'Effet' }, Object.keys(C.EFFETS).map(function (k) { return h('option', { value: k, text: C.EFFETS[k], selected: x.effet === k }); }));
    var coul = h('input', { type: 'color', value: x.couleur || '#e4eefb', 'aria-label': 'Couleur (information)' });
    var lim = h('input', { type: 'date', value: x.limite || '', 'aria-label': 'Date limite de dépôt' }), zLim = h('label', {}, 'Date limite de dépôt (incluse)', lim);
    function majEffet() { zLim.hidden = eff.value !== 'limite'; }
    eff.addEventListener('change', majEffet); majEffet();
    var roles = rolesProposes().map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: (x.roles || []).indexOf(r) >= 0 }) }; });
    var boutons = [{ texte: 'Annuler' }];
    if (p) boutons.push({ texte: p.effet === 'bloquee' ? 'Lever le blocage' : 'Supprimer la période', classe: 'danger', action: async function () { await s().enregistrer('PERIODE_CONGES', { id: p.id, service: p.service, supprime: true }); U.toast('Période retirée.'); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { id: (p && p.id) || 'PC' + CR.hex(CR.aleatoire(4)), service: sv.value, libelle: lib.value.trim(), debut: deb.value, fin: fin.value || deb.value, effet: eff.value, couleur: coul.value, limite: eff.value === 'limite' ? lim.value : '', roles: roles.filter(function (y) { return y.cb.checked; }).map(function (y) { return y.r; }) };
      if (d.effet === 'bloquee') {
        var deja = Object.keys(st().conges).map(function (k) { return st().conges[k]; }).filter(function (c) { return c.service === d.service && c.statut === 'valide' && c.debut <= d.fin && c.fin >= d.debut; });
        if (deja.length && !confirm(deja.length + ' congé(s) déjà validé(s) sur cette période : ils restent validés (' + deja.map(nomDe).join(', ') + '). Bloquer la période pour les nouvelles demandes ?')) return false;
      }
      await s().enregistrer('PERIODE_CONGES', d); U.toast(d.effet === 'bloquee' ? 'Période bloquée.' : 'Période enregistrée.');
    } });
    U.modale(p ? 'Période' : x.effet === 'bloquee' ? 'Bloquer une période' : 'Nouvelle période', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Libellé (affiché aux agents)', lib), h('label', {}, 'Pour', sv), h('label', {}, 'Du', deb), h('label', {}, 'Au', fin), h('label', {}, 'Effet', eff), h('label', {}, 'Couleur (information)', coul), zLim),
      h('fieldset', {}, h('legend', { text: 'Rôles concernés (aucune case : tous)' }), h('div', { class: 'actions gauche' }, roles.map(function (y) { return h('label', { class: 'case' }, y.cb, h('span', { text: libRole(y.r) })); }))),
      h('small', { class: 'muted', text: 'Bloquée : aucune demande ni souhait possible ces jours-là (le validateur peut toujours saisir) ; les congés déjà validés restent. Dépôt avant une date limite (ex. congés d’été à poser avant le 31 mars) : après cette date, une demande reste possible mais elle est non prioritaire, avec un avertissement, et n’apparaît qu’à l’agent et au validateur jusqu’à sa validation. Tracée au journal ; se lève à tout moment.' })), boutons);
  }
  function panneauTableaux() {
    var sv = servicesGeres().map(function (x) { return x.code; }), ts = Object.keys(st().tableaux).map(function (k) { return st().tableaux[k]; }).filter(function (t) { return !t.supprime && sv.indexOf(t.service) >= 0; });
    return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Tableaux' }), h('span', { class: 'espace' }), peut('TABLEAU_CONGES') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleTableau(null); } }, '+ Tableau') : null),
      ts.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Tableau', 'Service', 'Période', 'Résolution', 'Règles', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, ts.map(function (t) { return h('tr', {}, h('td', {}, h('b', { text: t.nom }), t.visible === false ? h('small', { class: 'muted', text: ' (non visible des agents)' }) : null), h('td', { text: U.libService(t.service) }), h('td', { text: jourFr(t.debut) + ' → ' + jourFr(t.fin) }),
          h('td', { text: { deux: 'jour et semaine', semaine: 'semaine', jour: 'jour' }[t.resolution || 'deux'] }), h('td', { text: C.regles(t).map(function (r) { return (r.pour === '*' ? 'tous' : libRole(r.pour)) + ' ≤ ' + r.max + (r.bloquante ? ' (bloquante)' : ''); }).join(' ; ') || '—' }),
          h('td', {}, h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.tableau = t.id; U.App.onglet = 'tableau'; U.rendreContenu(); } }, 'Ouvrir'), peut('TABLEAU_CONGES') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleTableau(t); } }, 'Régler') : null))); })))) : h('p', { class: 'muted', text: 'Aucun tableau.' }));
  }
  function panneauPeriodes() {
    var sv = servicesGeres().map(function (x) { return x.code; }), ps = Object.keys(st().periodes).map(function (k) { return st().periodes[k]; }).filter(function (p) { return !p.supprime && (p.service === '*' || sv.indexOf(p.service) >= 0); }).sort(function (a, b) { return a.debut.localeCompare(b.debut); });
    return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Périodes colorées et blocages' }), h('span', { class: 'espace' }),
      peut('PERIODE_CONGES') ? h('button', { class: 'btn', type: 'button', onclick: function () { modalePeriode(null, { effet: 'bloquee' }); } }, 'Bloquer une période…') : null,
      peut('PERIODE_CONGES') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modalePeriode(null); } }, '+ Période') : null),
      ps.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Période', 'Pour', 'Dates', 'Effet', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, ps.map(function (p) { return h('tr', {}, h('td', {}, couleurPeriode(h('span', { class: 'cg-pastille cg-p-' + p.effet }), { periodes: [p] }), p.libelle), h('td', { text: p.service === '*' ? 'Établissement' : U.libService(p.service) }), h('td', { text: jourFr(p.debut) + ' → ' + jourFr(p.fin) }), h('td', { text: p.effet === 'limite' ? 'Dépôt avant le ' + jourFr(p.limite) + ' (après : non prioritaire)' : C.EFFETS[p.effet] }),
          h('td', {}, (p.service !== '*' || s().roles().indexOf('ADMIN') >= 0) && peut('PERIODE_CONGES') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modalePeriode(p); } }, 'Modifier') : null)); })))) : h('p', { class: 'muted', text: 'Aucune période.' }),
      h('small', { class: 'muted', text: 'Périodes de l’établissement (vacances scolaires…) : administrateur ; périodes et blocages d’un service : son cadre ou son validateur. Délai préalable de demande : ' + o().delaiMois + ' mois (Administration → Congés).' }));
  }
  function panneauDroits() {
    var an = anneeVue(), sv = servicesGeres().map(function (x) { return x.code; }), types = o().types.filter(function (t) { return t.actif; });
    var ags = comptes().filter(function (c) { return c.actif !== false && (c.services || []).some(function (x) { return sv.indexOf(x) >= 0; }) && !(c.roles || []).every(function (r) { return r === 'ADMIN' || r === 'INTERVENANT'; }); }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
    var champs = [];
    var selAn = h('select', { class: 'cg-annee', 'aria-label': 'Année', onchange: function () { vue.annee = +selAn.value; U.rendreContenu(); } }, annees().map(function (x) { return h('option', { value: x, text: String(x), selected: x === an }); }));
    return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Droits et quotités' }), selAn),
      alerte(),
      h('small', { class: 'muted', text: 'Droit calculé = droit à temps plein × quotité moyenne de l’année (la quotité peut changer en cours d’année), arrondi au ' + (o().arrondi === 1 ? 'jour' : 'demi-jour') + ' supérieur ; jours fériés : selon le service et le rôle. Une valeur saisie remplace le calcul ; videz-la pour revenir au calcul.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, [h('th', { text: 'Agent' }), h('th', { text: 'Quotité' })].concat(types.map(function (t) { return h('th', { text: t.abrev }); }), [h('th')]))),
        h('tbody', {}, ags.map(function (a) {
          var dr = C.droitsAnnee(st(), cfg(), a.id, an, info(a)), q = C.quotiteLe(st(), a.id, auj()), ok = gereDroits(a);
          return h('tr', {}, h('td', {}, U.equipe && U.equipe.lien ? U.equipe.lien(a.id, a.nom) : h('b', { text: a.nom }), h('div', {}, h('small', { class: 'muted', text: libRole(C.rolePrincipal(a.roles)) }))),
            h('td', {}, h('span', { text: q.quotite + ' %' + (q.nonTravailles.length ? ' (' + q.nonTravailles.map(function (d) { return JS[d]; }).join(', ') + ')' : '') }), C.historiqueQuotite(st(), a.id).length > 1 ? h('small', { class: 'muted', text: ' · changée en cours d’année' }) : null),
            types.map(function (t) {
              var x = dr[t.code] || {}, inp = h('input', { type: 'number', min: 0, max: 400, step: 0.5, value: x.saisi !== null && x.saisi !== undefined ? x.saisi : '', placeholder: nb(x.calcule || 0), class: 'champ-court', disabled: !ok || t.ferie && false, 'aria-label': t.libelle + ' ' + an + ' — ' + a.nom });
              champs.push({ a: a, t: t, inp: inp, avant: x.saisi });
              return h('td', {}, inp);
            }),
            h('td', {}, ok ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleQuotite(a); } }, 'Quotité…') : null));
        })))),
      peut('DROITS_CONGES') ? h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          var parAgent = {};
          champs.forEach(function (c) { var v = c.inp.value === '' ? null : +c.inp.value; if (v !== (c.avant === undefined ? null : c.avant)) (parAgent[c.a.id] = parAgent[c.a.id] || { a: c.a, d: {} }).d[c.t.code] = v; });
          var ks = Object.keys(parAgent);
          for (var i = 0; i < ks.length; i++) await s().enregistrer('DROITS_CONGES', { agent: ks[i], annee: an, droits: parAgent[ks[i]].d, service: info(parAgent[ks[i]].a).service });
          U.toast(ks.length ? 'Droits enregistrés (' + ks.length + ' agent' + (ks.length > 1 ? 's' : '') + ').' : 'Aucun changement.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer les droits')) : null);
  }
  function modaleQuotite(a) {
    var hist = C.historiqueQuotite(st(), a.id), q = C.quotiteLe(st(), a.id, auj());
    var dep = h('input', { type: 'date', value: auj(), 'aria-label': 'À partir du' }), qt = h('input', { type: 'number', min: 10, max: 100, step: 5, value: q.quotite, class: 'champ-court', 'aria-label': 'Quotité (%)' });
    var cases = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return { d: d, cb: h('input', { type: 'checkbox', checked: q.nonTravailles.indexOf(d) >= 0 }) }; });
    U.modale('Quotité de travail — ' + a.nom, h('div', { class: 'pile' },
      hist.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Depuis', 'Quotité', 'RTP habituel', ''].map(function (x) { return h('th', { text: x }); }))), h('tbody', {}, hist.map(function (x) {
        return h('tr', {}, h('td', { text: jourFr(x.depuis) }), h('td', { text: x.quotite + ' %' }), h('td', { text: (x.nonTravailles || []).map(function (d) { return JS[d]; }).join(', ') || '—' }),
          h('td', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (confirm('Retirer ce changement de quotité ?')) s().enregistrer('QUOTITE', { agent: a.id, depuis: x.depuis, supprime: true, service: info(a).service }).then(function () { U.toast('Retiré.'); }, function (e) { alert(e.message); }); } }, 'Retirer')));
      }))) : h('p', { class: 'muted', text: 'Temps plein (aucune quotité enregistrée).' }),
      h('h3', { text: 'Nouveau changement' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'À partir du', dep), h('label', {}, 'Quotité (%)', qt)),
      h('fieldset', {}, h('legend', { text: 'Jour(s) de RTP habituel(s), facultatif (affichage seulement)' }), h('div', { class: 'actions gauche' }, cases.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: JS[c.d] })); }))),
      h('small', { class: 'muted', text: 'Les droits de l’année sont recalculés au prorata des jours passés à chaque quotité ; les RTP (récupérations de temps partiel) sont annualisées : pendant un congé, aucune RTP n’est posée et tous les jours ouvrés sont décomptés. Le jour de RTP habituel est facultatif et sert seulement à l’affichage dans les tableaux (si l’option est activée).' })),
    [{ texte: 'Fermer' }, { texte: 'Enregistrer le changement', classe: 'primaire', action: async function () {
      await s().enregistrer('QUOTITE', { agent: a.id, depuis: dep.value, quotite: +qt.value, nonTravailles: cases.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.d; }), service: info(a).service });
      U.toast('Quotité enregistrée.');
    } }]);
  }
  function vueReglages() {
    return h('div', { class: 'pile' }, h('h1', { text: 'Tableaux et périodes' }),
      U.ongletsLocaux([['tableaux', 'Tableaux', panneauTableaux()], ['periodes', 'Périodes et blocages', panneauPeriodes()], peut('DROITS_CONGES') ? ['droits', 'Droits et quotités', panneauDroits] : null], { cle: 'conges-reglages', libelle: 'Rubriques' }));
  }

  // ------------------------------------------------------------ Fiche d'un agent (Équipe) : onglet « Congés »
  function voitFiche(a) { var m = moi(); return !!a && s().ouvert && s().ouvert('conges') && (a.id === m.id || gereDroits(a) || validateurDe(a) || s().roles().indexOf('ADMIN') >= 0); }
  function sectionAgent(idAgent) {
    var a = agent(idAgent); if (!a || !voitFiche(a)) return null;
    var an = new Date().getFullYear(), q = C.quotiteLe(st(), a.id, auj()), hist = C.historiqueQuotite(st(), a.id);
    var prochains = C.congesDe(st(), a.id, { actifs: true }).filter(function (c) { return c.fin >= auj(); }).slice(0, 8);
    return h('div', { class: 'pile cg-fiche' }, alerte(),
      h('div', { class: 'barre' }, h('b', { text: 'Quotité de travail : ' + q.quotite + ' %' + (q.nonTravailles.length ? ' — RTP habituel : ' + q.nonTravailles.map(function (d) { return JS[d]; }).join(', ') : '') }),
        hist.length > 1 ? h('small', { class: 'muted', text: ' (' + hist.length + ' changements : ' + hist.map(function (x) { return x.quotite + ' % au ' + jourFr(x.depuis); }).join(', ') + ')' }) : null, h('span', { class: 'espace' }),
        gereDroits(a) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleQuotite(a); } }, 'Changer la quotité…') : null),
      h('h3', { text: 'Droits et soldes ' + an }), cartesSoldes(a, an),
      h('h3', { text: 'Congés à venir' }),
      prochains.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, prochains.map(function (c) { return h('tr', {}, h('td', { text: libType(c.type) }), h('td', { text: periodeFr(c) }), h('td', { text: nb(C.decompte(st(), cfg(), c)) + ' j' }), h('td', {}, badge(c.statut))); })))) : h('p', { class: 'muted', text: 'Aucun congé à venir.' }),
      validateurDe(a) || gereDroits(a) ? h('small', { class: 'muted', text: 'Validateur : ' + libRole(C.roleValidateur(cfg(), a.roles)) + '.' }) : null);
  }

  // ------------------------------------------------------------ Administration → Congés
  function panneauxAdmin() {
    var v = JSON.parse(JSON.stringify((cfg().conges) || {})), op = o();
    function enregistrer(maj) { return async function () { var n = JSON.parse(JSON.stringify(cfg().conges || {})); maj(n); await U.enregistrerConfig([['conges', n]]); U.rendreContenu(); }; }
    // Types de congés
    var types = op.types.map(function (t) { return Object.assign({}, t); }), zt = h('tbody');
    function dessinerTypes() {
      U.vider(zt);
      types.forEach(function (t, i) {
        var lib = h('input', { type: 'text', maxlength: 60, value: t.libelle, 'aria-label': 'Libellé du type ' + (i + 1) }), ab = h('input', { type: 'text', maxlength: 6, value: t.abrev, class: 'champ-court', 'aria-label': 'Abréviation du type ' + (i + 1) });
        var un = h('select', { 'aria-label': 'Unité du type ' + (i + 1), disabled: t.ferie }, Object.keys(C.UNITES).map(function (k) { return h('option', { value: k, text: C.UNITES[k], selected: t.unite === k }); }));
        var dr = h('input', { type: 'number', min: 0, max: 400, step: 0.5, value: t.droit === null ? '' : t.droit, class: 'champ-court', disabled: t.ferie, placeholder: t.ferie ? 'calculé' : 'aucun', 'aria-label': 'Droit à temps plein du type ' + (i + 1) });
        var ac = h('input', { type: 'checkbox', checked: t.actif !== false, 'aria-label': 'Type ' + (i + 1) + ' actif' });
        lib.addEventListener('input', function () { t.libelle = lib.value; }); ab.addEventListener('input', function () { t.abrev = ab.value; }); un.addEventListener('change', function () { t.unite = un.value; });
        dr.addEventListener('change', function () { t.droit = dr.value === '' ? null : +dr.value; }); ac.addEventListener('change', function () { t.actif = ac.checked; });
        zt.appendChild(h('tr', {}, h('td', {}, lib), h('td', {}, ab, h('small', { class: 'muted', text: ' ' + t.code })), h('td', {}, un), h('td', {}, dr, t.ferie ? h('small', { class: 'muted', text: ' selon service et rôle' }) : null), h('td', {}, h('label', { class: 'case' }, ac, h('span', { text: 'actif' })))));
      });
    }
    dessinerTypes();
    var nouveauType = h('input', { type: 'text', maxlength: 60, placeholder: 'Ex. : Fractionnement, Compte épargne-temps…', 'aria-label': 'Nouveau type de congé' });
    var pTypes = h('section', { class: 'panneau' }, h('h2', { text: 'Types de congés et droits à temps plein' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Libellé', 'Abréviation', 'Compté en', 'Droit à temps plein (jours par an)', ''].map(function (x) { return h('th', { text: x }); }))), zt)),
      h('div', { class: 'actions gauche' }, nouveauType, h('button', { class: 'btn', type: 'button', onclick: function () {
        var l = nouveauType.value.trim(); if (!l) return;
        var code = l.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'T'; var k = 2, c0 = code; while (types.some(function (t) { return t.code === code; })) code = c0.slice(0, 6) + k++;
        types.push({ code: code, libelle: l, abrev: code.slice(0, 4), unite: 'ouvres', droit: null, actif: true }); nouveauType.value = ''; dessinerTypes();
      } }, '+ Type de congé')),
      h('small', { class: 'muted', text: 'Un type déjà utilisé ne se supprime pas : décochez « actif ». Le droit de chaque agent est proratisé selon sa quotité, et le cadre peut le corriger (Congés → Tableaux et périodes → Droits et quotités).' }),
      U.boutonEnregistrer(enregistrer(function (n) { n.types = types.map(function (t) { return { code: t.code, libelle: String(t.libelle || '').trim() || t.code, abrev: String(t.abrev || '').trim() || t.code, unite: t.unite, droit: t.droit, actif: t.actif !== false, ferie: !!t.ferie }; }); })));
    // Validateurs
    var roles = ['IDE', 'AS', 'SECRETAIRE', 'CADRE', 'CADRE_SUP', 'MEDECIN', 'MEDECIN_CHEF_SERVICE'].concat((SIC.modules.obtenir('isocont').droits.rolesConfig(cfg()) || []).map(function (r) { return r.code; }).filter(function (c) { return /^R_/.test(c); })).concat(['*']);
    var validables = ['CADRE', 'CADRE_SUP', 'DIRECTEUR_SOINS', 'MEDECIN_CHEF_SERVICE', 'MEDECIN_CHEF_POLE'];
    var selsV = roles.map(function (r) { return { r: r, sel: h('select', { 'aria-label': 'Validateur des demandes : ' + (r === '*' ? 'autres rôles' : libRole(r)) }, validables.map(function (x) { return h('option', { value: x, text: libRole(x), selected: op.validateurs[r] === x }); })) }; });
    var pVal = h('section', { class: 'panneau' }, h('h2', { text: 'Validateurs selon le rôle' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, [h('th', { text: 'Demande d’un…' }), h('th', { text: 'Validée par (dans les services de l’agent)' })])),
        h('tbody', {}, selsV.map(function (x) { return h('tr', {}, h('td', { text: x.r === '*' ? 'Autre rôle' : libRole(x.r) }), h('td', {}, x.sel)); })))),
      h('small', { class: 'muted', text: 'Le validateur doit avoir l’accès « Valider ou refuser les demandes » (Rôles et accès) et un service commun avec l’agent (le directeur des soins valide pour tous les services). Pendant son absence, un prêt de droits ; à défaut, l’administrateur.' }),
      U.boutonEnregistrer(enregistrer(function (n) { n.validateurs = {}; selsV.forEach(function (x) { n.validateurs[x.r] = x.sel.value; }); })));
    // Jours fériés
    var aff = h('input', { type: 'checkbox', checked: op.feries.afficher });
    var locaux = op.feries.locaux.map(function (x) { return Object.assign({}, x); }), zl = h('div', { class: 'pile' });
    function dessinerLocaux() {
      U.vider(zl);
      locaux.forEach(function (x, i) {
        var d = h('input', { type: 'text', maxlength: 10, value: x.date, placeholder: 'MM-JJ ou AAAA-MM-JJ', class: 'champ-court', 'aria-label': 'Date du férié local ' + (i + 1) }), l = h('input', { type: 'text', maxlength: 60, value: x.libelle, 'aria-label': 'Libellé du férié local ' + (i + 1) });
        d.addEventListener('input', function () { x.date = d.value.trim(); }); l.addEventListener('input', function () { x.libelle = l.value; });
        zl.appendChild(h('div', { class: 'actions gauche' }, d, l, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer', onclick: function () { locaux.splice(i, 1); dessinerLocaux(); } }, '✕')));
      });
      zl.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { locaux.push({ date: '12-26', libelle: 'Férié local' }); dessinerLocaux(); } }, '+ Férié local'));
    }
    dessinerLocaux();
    var pFeries = h('section', { class: 'panneau' }, h('h2', { text: 'Jours fériés' }),
      h('p', { class: 'muted', text: 'Fériés nationaux ' + new Date().getFullYear() + ' : ' + C.feries(new Date().getFullYear(), cfg()).map(function (f) { return jourFr(f.date).slice(0, 5) + ' ' + f.libelle; }).join(', ') + '.' }),
      h('label', { class: 'case' }, aff, h('span', { text: 'Afficher les fériés dans les tableaux' })),
      h('b', { text: 'Fériés locaux (ex. 26 décembre et Vendredi saint en Alsace-Moselle) :' }), zl,
      U.boutonEnregistrer(enregistrer(function (n) { n.feries = { afficher: aff.checked, locaux: locaux.filter(function (x) { return /^(\d{4}-)?\d{2}-\d{2}$/.test(x.date); }) }; })));
    // Options, couleurs, avertissement
    var delai = h('input', { type: 'number', min: 0, max: 12, value: op.delaiMois, class: 'champ-court', 'aria-label': 'Délai préalable de demande (mois)' });
    var tpa = h('input', { type: 'checkbox', checked: op.afficherTempsPartiel });
    var sou = h('input', { type: 'checkbox', checked: op.souhaits }), arr = h('select', { 'aria-label': 'Arrondi des droits proratisés' }, [['0.5', 'au demi-jour supérieur'], ['1', 'au jour supérieur']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: String(op.arrondi) === x[0] }); }));
    var couls = Object.keys(C.COULEURS_DEFAUT).map(function (k) { return { k: k, inp: h('input', { type: 'color', value: op.couleurs[k], 'aria-label': 'Couleur : ' + (C.STATUTS[k] || 'Férié posé d’office') }) }; });
    var pOptions = h('section', { class: 'panneau' }, h('h2', { text: 'Options et couleurs' }),
      h('label', { class: 'en-ligne' }, 'Délai préalable de demande', delai, h('span', { text: 'mois (hors délai : signalé, non bloquant ; 0 : aucun)' })),
      h('label', { class: 'case' }, sou, h('span', { text: 'Souhaits activés (brouillons visibles de l’agent et du validateur)' })),
      h('label', { class: 'case' }, tpa, h('span', { text: 'Afficher la quotité et les RTP habituels du temps partiel dans les tableaux, la liste « À valider » et « Mes congés » (sinon : seulement dans la fiche de l’agent et « Droits et quotités »)' })),
      h('label', { class: 'en-ligne' }, 'Arrondi des droits proratisés', arr),
      h('div', { class: 'actions gauche' }, couls.map(function (c) { return h('label', { class: 'en-ligne' }, c.inp, h('span', { text: C.STATUTS[c.k] || 'Férié posé d’office' })); })),
      U.boutonEnregistrer(enregistrer(function (n) { n.delaiMois = +delai.value; n.souhaits = sou.checked; n.afficherTempsPartiel = tpa.checked; n.arrondi = +arr.value; n.couleurs = {}; couls.forEach(function (c) { n.couleurs[c.k] = c.inp.value; }); })));
    var act = h('input', { type: 'checkbox', checked: op.alerte.active }), txt = h('textarea', { rows: 3, maxlength: 600, 'aria-label': 'Message d’avertissement' }); txt.value = op.alerte.texte;
    var pAlerte = h('section', { class: 'panneau' }, h('h2', { text: 'Message d’avertissement' }),
      h('label', { class: 'case' }, act, h('span', { text: 'Afficher le message dans Mes congés, les tableaux, les demandes et la fiche de l’agent' })), txt,
      U.boutonEnregistrer(enregistrer(function (n) { n.alerte = { active: act.checked, texte: txt.value.trim() || C.ALERTE_DEFAUT }; })));
    return [['conges', 'Congés', [pTypes, pVal, pFeries, panneauReglesFeries(true), pOptions, pAlerte]]];
  }
  /** Jours fériés selon le service et le rôle : l'administrateur pour tous les services, le cadre pour les siens. */
  function panneauReglesFeries(admin) {
    var rf = JSON.parse(JSON.stringify(o().regleFeries)), roles = ['IDE', 'AS', 'SECRETAIRE', 'CADRE', 'MEDECIN'], svs = (admin ? [{ code: '*', libelle: 'Établissement (par défaut)' }] : []).concat(admin ? U.tousServices() : servicesGeres());
    var sels = [];
    var t = h('table', {}, h('thead', {}, h('tr', {}, [h('th', { text: 'Service' })].concat(roles.map(function (r) { return h('th', { text: libRole(r) }); })))),
      h('tbody', {}, svs.map(function (sv) {
        return h('tr', {}, h('td', { text: sv.libelle }), roles.map(function (r) {
          var cur = (rf[sv.code] || {})[r] || '', sel = h('select', { 'aria-label': 'Fériés : ' + sv.libelle + ', ' + libRole(r) }, [h('option', { value: '', text: sv.code === '*' ? 'Posé d’office (par défaut)' : 'Comme l’établissement' })].concat(Object.keys(C.MODES_FERIES).map(function (k) { return h('option', { value: k, text: C.MODES_FERIES[k], selected: cur === k }); })));
          sels.push({ sv: sv.code, r: r, sel: sel });
          return h('td', {}, sel);
        }));
      })));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Jours fériés selon le service et le rôle' }),
      h('p', { class: 'muted', text: 'Les jours fériés font partie des droits à congés. Posé d’office : service fermé ou rôle qui ne travaille pas ces jours-là (ex. hôpital de jour, CMP ; médecins en hospitalisation complète). Travaillé → à récupérer : chaque férié sur un jour de travail ouvre un jour à poser (ex. IDE et AS en hospitalisation complète). Selon le planning : droits saisis par le cadre.' }),
      h('div', { class: 'table-wrap' }, t),
      U.boutonEnregistrer(async function () {
        var n = JSON.parse(JSON.stringify(cfg().conges || {})); n.regleFeries = n.regleFeries || {};
        sels.forEach(function (x) { var m = n.regleFeries[x.sv] = n.regleFeries[x.sv] || {}; if (x.sel.value) m[x.r] = x.sel.value; else delete m[x.r]; });
        await U.enregistrerConfig([['conges', n]]); U.rendreContenu();
      }));
  }

  // ------------------------------------------------------------ Agenda : congés validés lus comme des absences
  var memo = { cle: null, l: [] };
  /** État de l'Agenda complété des congés validés (absences « congé »), sans écrire dans le journal de l'Agenda. */
  function agendaAvecConges(stAg) {
    if (!stAg || !s() || !s().ouvert || !s().ouvert('conges')) return stAg;
    var sc = st(), cle = sc;
    if (memo.cle !== cle || memo.ag !== stAg) {
      var abs = Object.assign({}, stAg.absences || {});
      C.absences(sc, -8.64e15, 8.64e15).forEach(function (a) { abs[a.id] = a; });
      memo = { cle: cle, ag: stAg, l: Object.assign({}, stAg, { absences: abs }) };
    }
    return memo.l;
  }

  // ------------------------------------------------------------ Journal, pastille, contrat
  var LIB = { CONGE: 'Congés : demande ou souhait', CONGE_DECISION: 'Congés : décision', CONGE_ANNULATION: 'Congés : annulation', TABLEAU_CONGES: 'Congés : tableau', PERIODE_CONGES: 'Congés : période ou blocage', DROITS_CONGES: 'Congés : droits de l’année', QUOTITE: 'Congés : quotité de travail' };
  function resume(e) {
    var d = e.data || {}, c = st().conges[d.id || d.conge];
    switch (e.type) {
      case 'CONGE': return (d.statut === 'demande' ? 'Demande de congé' : d.statut === 'souhait' ? 'Souhait de congé' : 'Congé modifié') + (c ? ' : ' + nomDe(c) + ', ' + periodeFr(c) : '');
      case 'CONGE_DECISION': return (d.decision === 'valide' ? 'Congé validé' : 'Congé refusé') + (c ? ' : ' + nomDe(c) + ', ' + periodeFr(c) : '') + (d.motif ? ' (' + d.motif + ')' : '');
      case 'CONGE_ANNULATION': return 'Congé annulé' + (c ? ' : ' + nomDe(c) + ', ' + periodeFr(c) : '');
      case 'TABLEAU_CONGES': return (d.supprime ? 'Tableau supprimé' : 'Tableau « ' + (d.nom || (st().tableaux[d.id] || {}).nom || '') + ' »');
      case 'PERIODE_CONGES': return d.supprime ? 'Période retirée' : (d.effet === 'bloquee' ? 'Période bloquée : ' : 'Période : ') + (d.libelle || '') + (d.debut ? ' (' + jourFr(d.debut) + ' → ' + jourFr(d.fin) + ')' : '');
      case 'DROITS_CONGES': return 'Droits ' + d.annee + ' de ' + ((agent(d.agent) || {}).nom || d.agent) + ' : ' + Object.keys(d.droits || {}).map(function (k) { return abrevType(k) + ' ' + (d.droits[k] === null ? 'calculé' : d.droits[k]); }).join(', ');
      case 'QUOTITE': return 'Quotité de ' + ((agent(d.agent) || {}).nom || d.agent) + (d.supprime ? ' : changement du ' + jourFr(d.depuis) + ' retiré' : ' : ' + d.quotite + ' % à partir du ' + jourFr(d.depuis));
    }
    return LIB[e.type] || e.type;
  }
  SIC.modules.completerInterface('conges', {
    vues: { 'mes-conges': vueMesConges, tableau: vueTableau, 'a-valider': vueAValider, reglages: vueReglages },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le congé, le tableau ou le réglage revient à son état précédent.'; } },
    admin: { onglets: function () { return panneauxAdmin(); }, cadre: function () { return [panneauReglesFeries(false)]; } },
    informations: function () {
      var res = [];
      try {
        mesAvis().forEach(function (a) { var c = st().conges[a.conge]; res.push({ id: 'cg-a-' + a.id, niveau: a.genre === 'valide' ? '' : 'warn', titre: s().nomAuteur(a.par) + ' ' + GENRES[a.genre] + ' votre congé (' + libType(c.type) + ', ' + periodeFr(c) + ')', detail: a.genre === 'refuse' ? (c.decision || {}).motif || '' : '', ouvrir: function () { modaleConge(c); }, vu: function () { return marquerVus([a.id]); } }); });
        if (peut('CONGE_DECISION')) { var n = C.aValider(st(), cfg(), comptes(), moi()).length; if (n) res.push({ id: 'cg-v', niveau: 'warn', titre: n + ' demande(s) de congé à valider', ouvrir: function () { U.ouvrirFenetre('conges'); U.App.onglet = 'a-valider'; U.rendreContenu(); } }); }
      } catch (e) { /* module illisible */ }
      return res;
    },
    pastille: function () { try { return mesAvis().length + (peut('CONGE_DECISION') ? C.aValider(st(), cfg(), comptes(), moi()).length : 0); } catch (e) { return 0; } }
  });
  U.conges = { ouvrirConge: function (k) { var c = st().conges[k]; if (c) modaleConge(c); }, sectionAgent: sectionAgent, voitFiche: voitFiche, modaleDemande: modaleDemande, agendaAvecConges: agendaAvecConges };
})();
