// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Formations — interface (lot C, 14 novembre 2026). Logique : module-formations.js.
 * Formations ouvertes (inscription), mes inscriptions (état, rang sur la liste d'attente, désistement), inscriptions à
 * décider (valider, liste d'attente, refuser ; place libérée proposée au suivant ; enregistrement dans le logiciel de
 * gestion du temps), tableau annuel des départs ; départs validés lus par l'Agenda comme des absences.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, F = SIC.formations, C = SIC.crypto;
  var annee = new Date().getFullYear();

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('formations') && s().etatModule('formations')) || { sessions: {}, inscriptions: {}, avis: [] }; }
  function cfg() { return U.config(); }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return s().compteEffectif() || {}; }
  function lecture() { return !!s().apercu; }
  function auj() { return SIC.model.dateLocaleISO(Date.now()); }
  function fr(iso) { return iso ? String(iso).split('-').reverse().join('/') : ''; }
  function dates(x) { return x.fin && x.fin !== x.debut ? 'du ' + fr(x.debut) + ' au ' + fr(x.fin) : 'le ' + fr(x.debut); }
  function services() { return U.services().map(function (x) { return x.code; }); }
  function gestionnaire() { return peut('FORMATION_SESSION') || s().roles().indexOf('ADMIN') >= 0; }
  var CLASSE = { demande: 'warn', valide: 'ok', attente: 'warn', refuse: 'bad', desiste: '' };
  function badge(i) { var r = i.statut === 'attente' ? F.rang(st(), i) : null; return h('span', { class: 'badge ' + CLASSE[i.statut], text: F.STATUTS[i.statut] + (r ? ' (rang ' + r + ')' : '') }); }
  function vus() { return (s().preferences && s().preferences.formationsVus) || []; }
  async function marquerVus(ids) { try { await s().enregistrerPreference('formationsVus', vus().concat(ids).slice(-300)); } catch (e) { /* sans conséquence */ } }

  // ------------------------------------------------------------ Saisies
  function modaleSession(x) {
    var nouveau = !x, admin = s().roles().indexOf('ADMIN') >= 0, svs = (moi().services || []);
    var intitule = h('input', { type: 'text', maxlength: 120, value: x ? x.intitule : '', 'aria-label': 'Intitulé' });
    var debut = h('input', { type: 'date', value: x ? x.debut : '' }), fin = h('input', { type: 'date', value: x ? (x.fin || '') : '' }), limite = h('input', { type: 'date', value: x ? (x.limite || '') : '' });
    var lieu = h('input', { type: 'text', maxlength: 80, value: x ? (x.lieu || '') : '', 'aria-label': 'Lieu' }), places = h('input', { type: 'number', min: 0, max: 500, value: x ? (x.places || '') : '', class: 'champ-court', 'aria-label': 'Places' });
    var pub = h('input', { type: 'text', maxlength: 120, value: x ? (x.public || '') : '', placeholder: 'ex. IDE et AS', 'aria-label': 'Public visé' });
    var precision = h('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Précisions' }); precision.value = x ? (x.precision || '') : '';
    var sv = h('select', { 'aria-label': 'Service', disabled: !nouveau }, (admin ? [h('option', { value: '', text: 'Établissement (tous les services)' })] : []).concat((admin ? U.tousServices() : U.services().filter(function (v) { return svs.indexOf(v.code) >= 0; })).map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: x ? x.service === v.code : U.App.service === v.code }); })));
    var boutons = [{ texte: 'Annuler' }];
    if (!nouveau && !x.annulee) boutons.push({ texte: 'Annuler la formation', classe: 'danger', action: async function () { if (!confirm('Annuler cette formation ? Les inscrits la verront annulée.')) return false; await s().enregistrer('FORMATION_SESSION', { id: x.id, annulee: true, service: x.service }); U.toast('Formation annulée.'); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { id: x ? x.id : 'FS-' + C.hex(C.aleatoire(6)), intitule: intitule.value.trim(), debut: debut.value, fin: fin.value || '', lieu: lieu.value.trim(), places: places.value === '' ? 0 : Math.round(+places.value),
        public: pub.value.trim(), limite: limite.value || '', precision: precision.value.trim(), service: x ? x.service : sv.value };
      await s().enregistrer('FORMATION_SESSION', d);
      U.toast(nouveau ? 'Formation ouverte à l’inscription.' : 'Formation modifiée.');
    } });
    U.modale(nouveau ? 'Nouvelle formation ouverte à l’inscription' : 'Modifier la formation', h('div', { class: 'pile' },
      h('label', {}, 'Intitulé', intitule), h('div', { class: 'grille-3' }, h('label', {}, 'Du', debut), h('label', {}, 'Au (facultatif)', fin), h('label', {}, 'Inscription jusqu’au (facultatif)', limite)),
      h('div', { class: 'grille-3' }, h('label', {}, 'Lieu', lieu), h('label', {}, 'Places (0 : sans limite)', places), h('label', {}, 'Public visé', pub)),
      h('label', {}, 'Service', sv), h('label', {}, 'Précisions (organisme, horaires…)', precision)), boutons);
  }
  function inscrire(x) {
    var com = h('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Commentaire' });
    U.modale('S’inscrire : ' + x.intitule, h('div', { class: 'pile' }, h('p', { text: dates(x) + (x.lieu ? ', ' + x.lieu : '') }), h('label', {}, 'Commentaire pour le validateur (facultatif)', com)),
      [{ texte: 'Annuler' }, { texte: 'M’inscrire', classe: 'primaire', action: async function () {
        var sv = x.service || (moi().services || [])[0] || '';
        await s().enregistrer('FORMATION_INSCRIPTION', { id: 'FI-' + C.hex(C.aleatoire(6)), session: x.id, service: sv, commentaire: com.value.trim(), nom: moi().nom || '', roles: s().roles() });
        U.toast('Inscription envoyée à votre validateur.');
      } }]);
  }
  function decider(i, decision) {
    var motif = h('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Motif' }), x = st().sessions[i.session];
    var lib = { valide: 'Valider l’inscription', attente: 'Mettre sur liste d’attente', refuse: 'Refuser l’inscription' }[decision];
    U.modale(lib, h('div', { class: 'pile' }, h('p', { text: (i.nom || s().nomAuteur(i.agent)) + ' — ' + (x ? x.intitule + ', ' + dates(x) : '') }), i.commentaire ? h('p', { class: 'muted', text: 'Commentaire : ' + i.commentaire }) : null,
      h('label', {}, decision === 'refuse' ? 'Motif (obligatoire, communiqué à l’agent)' : 'Message à l’agent (facultatif)', motif)),
      [{ texte: 'Annuler' }, { texte: lib, classe: decision === 'refuse' ? 'danger' : 'primaire', action: async function () { await s().enregistrer('FORMATION_DECISION', { inscription: i.id, decision: decision, motif: motif.value.trim(), service: i.service, nom: moi().nom || '' }); U.toast('Décision enregistrée.'); } }]);
  }
  async function desister(i) {
    if (!confirm('Enregistrer le désistement ? La place sera proposée au suivant de la liste d’attente.')) return;
    try { await s().enregistrer('FORMATION_DESISTEMENT', { inscription: i.id, service: i.service, nom: moi().nom || '' }); U.toast('Désistement enregistré.'); U.rendreContenu(); } catch (e) { U.toast(e.message); }
  }
  async function enregistree(i) {
    try { await s().enregistrer('FORMATION_ENREGISTREE', { inscription: i.id, service: i.service, nom: moi().nom || '' }); U.toast('Enregistrée dans le logiciel de gestion du temps.'); U.rendreContenu(); } catch (e) { U.toast(e.message); }
  }

  // ------------------------------------------------------------ Vues
  function vueOuvertes() {
    var l = F.ouvertes(st(), services(), gestionnaire() ? '' : auj()), mes = F.inscriptionsAgent(st(), moi().id);
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Formations ouvertes à l’inscription' }), h('div', { class: 'espace' }),
        gestionnaire() && !lecture() ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleSession(null); } }, '+ Nouvelle formation') : null),
      l.length ? h('div', { class: 'fo-grille' }, l.map(function (x) {
        var p = F.places(st(), x.id), mien = mes.filter(function (i) { return i.session === x.id && i.statut !== 'desiste'; })[0], passee = x.debut < auj(), close = x.limite && auj() > x.limite;
        return h('article', { class: 'fo-carte' + (x.annulee ? ' annulee' : '') },
          h('div', { class: 'barre' }, h('b', { text: x.intitule }), h('div', { class: 'espace' }), x.annulee ? h('span', { class: 'badge bad', text: 'Annulée' }) : mien ? badge(mien) : null),
          h('div', { class: 'muted', text: dates(x) + (x.lieu ? ' — ' + x.lieu : '') + (x.service ? ' — ' + U.libService(x.service) : ' — établissement') }),
          x.public ? h('div', { text: 'Public : ' + x.public }) : null,
          h('div', { text: (p.places ? p.validees + ' / ' + p.places + ' place(s) attribuée(s)' : p.validees + ' inscrit(s) validé(s), sans limite de places') + (p.attente.length ? ', ' + p.attente.length + ' en liste d’attente' : '') }),
          x.limite ? h('small', { class: close ? 'texte-alerte' : 'muted', text: 'Inscription jusqu’au ' + fr(x.limite) }) : null,
          x.precision ? h('small', { class: 'muted', text: x.precision }) : null,
          h('div', { class: 'actions gauche' },
            !mien && !x.annulee && !passee && !close && peut('FORMATION_INSCRIPTION') && !lecture() ? h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { inscrire(x); } }, 'M’inscrire') : null,
            gestionnaire() && !lecture() && (s().roles().indexOf('ADMIN') >= 0 || (moi().services || []).indexOf(x.service) >= 0) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleSession(x); } }, 'Modifier') : null,
            gestionnaire() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { listeInscrits(x); } }, 'Inscrits (' + F.inscriptionsDe(st(), x.id).filter(function (i) { return i.statut !== 'desiste'; }).length + ')') : null));
      })) : h('p', { class: 'muted', text: 'Aucune formation ouverte à l’inscription pour le moment.' }));
  }
  function listeInscrits(x) {
    var l = F.inscriptionsDe(st(), x.id);
    U.modale('Inscrits : ' + x.intitule, l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, l.map(function (i) {
      return h('tr', {}, h('td', { text: i.nom || s().nomAuteur(i.agent) }), h('td', {}, badge(i)), h('td', { class: 'muted', text: i.gtt ? 'Enregistrée dans le logiciel le ' + new Date(Date.parse(i.gtt.le)).toLocaleDateString('fr-FR') : '' }));
    })))) : h('p', { class: 'muted', text: 'Aucune inscription.' }), [{ texte: 'Fermer' }]);
  }
  function vueMiennes() {
    var l = F.inscriptionsAgent(st(), moi().id).sort(function (a, b) { return String(b.le).localeCompare(String(a.le)); }), av = F.avisPour(st(), moi().id, vus());
    if (av.length) setTimeout(function () { marquerVus(av.map(function (a) { return a.id; })); }, 1500);
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Mes inscriptions' })),
      l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Formation', 'Dates', 'État', 'Message', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (i) {
          var x = st().sessions[i.session] || {};
          return h('tr', {}, h('td', { text: (x.intitule || '') + (x.annulee ? ' (annulée)' : '') }), h('td', { text: x.debut ? dates(x) : '' }), h('td', {}, badge(i)), h('td', { class: 'muted', text: i.motif || '' }),
            h('td', {}, i.statut !== 'desiste' && i.statut !== 'refuse' && !lecture() && peut('FORMATION_DESISTEMENT') && String(x.debut) >= auj() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { desister(i); } }, 'Me désister') : null));
        })))) : h('p', { class: 'muted', text: 'Vous n’êtes inscrit(e) à aucune formation.' }));
  }
  function vueDecider() {
    var c = moi(), ad = F.aDecider(st(), cfg(), s().comptes || [], Object.assign({}, c, { roles: s().roles() })), pr = F.propositions(st(), auj()).filter(function (p) { return F.valide(cfg(), Object.assign({}, c, { roles: s().roles() }), F.agentDe(p.suivant, s().comptes)); });
    var ae = F.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services());
    function ligne(i, actions) { var x = st().sessions[i.session] || {}; return h('tr', {}, h('td', { text: i.nom || s().nomAuteur(i.agent) }), h('td', { text: x.intitule || '' }), h('td', { text: x.debut ? dates(x) : '' }), h('td', { class: 'muted', text: i.commentaire || '' }), h('td', { class: 'actions-ligne' }, actions)); }
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Inscriptions à décider' })),
      pr.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Places libérées : proposer au suivant de la liste d’attente' }), h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, pr.map(function (p) {
        return ligne(p.suivant, lecture() ? [] : [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(p.suivant, 'valide'); } }, 'Valider (place libérée)')]);
      }))))) : null,
      h('section', { class: 'panneau' }, h('h2', { text: 'Demandes à décider (' + ad.length + ')' }), ad.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, ad.map(function (i) {
        return ligne(i, lecture() ? [] : [h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { decider(i, 'valide'); } }, 'Valider'), h('button', { class: 'btn petit', type: 'button', onclick: function () { decider(i, 'attente'); } }, 'Liste d’attente'), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { decider(i, 'refuse'); } }, 'Refuser')]);
      })))) : h('p', { class: 'muted', text: 'Aucune demande à décider.' })),
      F.options(cfg()).etapeGtt && F.confirmeGtt(cfg(), s().roles()) ? h('section', { class: 'panneau' }, h('h2', { text: 'À enregistrer dans le logiciel de gestion du temps (' + ae.length + ')' }), ae.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, ae.map(function (i) {
        return ligne(i, lecture() ? [] : [h('button', { class: 'btn petit', type: 'button', onclick: function () { enregistree(i); } }, 'Enregistrée')]);
      })))) : h('p', { class: 'muted', text: 'Rien à enregistrer.' })) : null);
  }
  function vueTableau() {
    var lignes = F.tableauAnnuel(st(), annee, s().roles().indexOf('ADMIN') >= 0 ? null : services()), mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Départs en formation ' + annee }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { annee--; U.rendreContenu(); } }, '◀ ' + (annee - 1)), h('button', { class: 'btn petit', type: 'button', onclick: function () { annee++; U.rendreContenu(); } }, (annee + 1) + ' ▶')),
      lignes.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'fo-tableau' }, h('thead', {}, h('tr', {}, [h('th', { text: 'Agent' })].concat(mois.map(function (m) { return h('th', { text: m }); })))),
        h('tbody', {}, lignes.map(function (r) { return h('tr', {}, [h('td', { text: r.nom || s().nomAuteur(r.agent) })].concat(r.mois.map(function (l) { return h('td', {}, l.map(function (x) { return h('div', { class: 'fo-depart', title: x.session.intitule + ' ' + dates(x.session), text: fr(x.session.debut).slice(0, 5) + ' ' + x.session.intitule.slice(0, 18) }); })); }))); })))) : h('p', { class: 'muted', text: 'Aucun départ en formation validé en ' + annee + '.' }));
  }

  // ------------------------------------------------------------ Réglages (administrateur)
  function panneauReglages() {
    var o = F.options(cfg()), etape = h('input', { type: 'checkbox', checked: o.etapeGtt });
    var roles = SIC.model.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: o.rolesGtt.indexOf(r.code) >= 0 }) }; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Formations' }),
      h('label', { class: 'case' }, etape, h('span', { text: 'Étape « Enregistrée dans le logiciel de gestion du temps » après la validation' })),
      h('p', { class: 'muted', text: 'Rôles qui confirment l’enregistrement (liste « À enregistrer ») :' }),
      h('div', { class: 'actions gauche' }, roles.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: x.r.libelle })); })),
      h('small', { class: 'muted', text: 'Le validateur d’une inscription est celui des Congés (cadre pour les IDE, AS et secrétaires ; cadre supérieur pour les cadres…). Données du personnel : fonction soumise à avis (onglet « Validations »).' }),
      U.boutonEnregistrer(async function () { await U.enregistrerConfig([['formations', { etapeGtt: etape.checked, rolesGtt: roles.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r.code; }) }]]); }));
  }

  // ------------------------------------------------------------ Informations, pastille, Agenda
  function informations() {
    var res = [];
    try {
      var c = Object.assign({}, moi(), { roles: s().roles() });
      F.avisPour(st(), c.id, vus()).forEach(function (a) { var i = st().inscriptions[a.inscription], x = i && st().sessions[i.session]; res.push({ id: 'fo-a-' + a.id, niveau: a.statut === 'refuse' ? 'bad' : '', titre: 'Formation « ' + (x ? x.intitule : '') + ' » : ' + F.STATUTS[a.statut].toLowerCase(), detail: a.motif || '', vu: function () { return marquerVus([a.id]); }, ouvrir: function () { U.App.ongletsFenetres.formations = 'miennes'; U.ouvrirFenetre('formations'); } }); });
      var ad = F.aDecider(st(), cfg(), s().comptes || [], c);
      if (ad.length) res.push({ id: 'fo-d-' + ad.length, niveau: 'warn', titre: 'Inscriptions aux formations à décider : ' + ad.length, ouvrir: function () { U.App.ongletsFenetres.formations = 'decider'; U.ouvrirFenetre('formations'); } });
      var pr = F.propositions(st(), auj()).filter(function (p) { return F.valide(cfg(), c, F.agentDe(p.suivant, s().comptes)); });
      if (pr.length) res.push({ id: 'fo-p-' + pr.map(function (p) { return p.suivant.id; }).join(','), niveau: 'warn', titre: 'Place libérée en formation : à proposer au suivant (' + pr.length + ')', ouvrir: function () { U.App.ongletsFenetres.formations = 'decider'; U.ouvrirFenetre('formations'); } });
      var ae = F.aEnregistrer(st(), cfg(), s().roles(), s().roles().indexOf('ADMIN') >= 0 ? null : services());
      if (ae.length) res.push({ id: 'fo-g-' + ae.length, niveau: '', titre: 'Formations à enregistrer dans le logiciel de gestion du temps : ' + ae.length, ouvrir: function () { U.App.ongletsFenetres.formations = 'decider'; U.ouvrirFenetre('formations'); } });
    } catch (e) { /* module illisible */ }
    return res;
  }
  var memo = { st: null, ag: null, l: null };
  /** Agenda : départs en formation validés ajoutés aux absences, sans écrire dans le journal de l'Agenda. */
  function agendaAvecFormations(stAg) {
    if (!stAg || !s() || !s().ouvert || !s().ouvert('formations')) return stAg;
    var sf = st();
    if (memo.st !== sf || memo.ag !== stAg) {
      var abs = Object.assign({}, stAg.absences || {});
      F.departs(sf, -8.64e15, 8.64e15).forEach(function (a) { abs[a.id] = a; });
      memo = { st: sf, ag: stAg, l: Object.assign({}, stAg, { absences: abs }) };
    }
    return memo.l;
  }
  var LIB = { FORMATION_SESSION: 'Formation ouverte ou modifiée', FORMATION_INSCRIPTION: 'Inscription à une formation', FORMATION_DECISION: 'Décision sur une inscription', FORMATION_DESISTEMENT: 'Désistement', FORMATION_ENREGISTREE: 'Enregistrée dans le logiciel de gestion du temps' };
  function resume(e) {
    var d = e.data || {}, i = d.inscription ? st().inscriptions[d.inscription] : null, x = st().sessions[d.session || d.id || (i && i.session)];
    return (x ? x.intitule : d.intitule || '') + (d.decision ? ' — ' + F.STATUTS[d.decision] : '') + (d.annulee ? ' — annulée' : '') + (d.motif ? ' — ' + d.motif : '');
  }
  SIC.modules.completerInterface('formations', {
    vues: { ouvertes: vueOuvertes, miennes: vueMiennes, decider: vueDecider, tableau: vueTableau },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La saisie est retirée.'; } },
    admin: { onglets: function () { return [['formations', 'Formations', [panneauReglages()]]]; } },
    informations: informations,
    pastille: function () { try { return informations().length; } catch (e) { return 0; } }
  });
  U.formations = { informations: informations, agendaAvecFormations: agendaAvecFormations };
})();
