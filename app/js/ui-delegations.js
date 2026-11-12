// SPDX-License-Identifier: EUPL-1.2
/*
 * Accès particuliers — interface (lot D, 0.31.0, décisions du porteur du 12 novembre 2026). Logique : delegations.js.
 * Prêts de droits (onglet « Prêts de droits » de la fenêtre Équipe ; administration : tous les prêts) ; intervenants
 * extérieurs (cadre pour ses services, administrateur pour tous) ; charte de confidentialité (administrateur), acceptée
 * par l'intervenant à sa première connexion ; bandeaux « Vous remplacez… » et « Pendant votre absence… ».
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, DL = SIC.delegations, C = SIC.crypto;
  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function moi() { return s().utilisateur; }
  function roles() { return (moi() && moi().roles) || []; }
  function estAdmin() { return roles().indexOf('ADMIN') >= 0; }
  function estCadre() { return roles().indexOf('CADRE') >= 0 || roles().indexOf('CADRE_SUP') >= 0; }
  function comptes() { return (s().comptes || []).filter(function (c) { return c.id !== 'secours'; }); }
  function compte(id) { return comptes().filter(function (c) { return c.id === id; })[0] || null; }
  /** Nom d'un agent : son compte, sinon un membre d'un groupe d'agents (agents sans compte de la démonstration). */
  function nom(id) {
    var c = compte(id); if (c) return c.nom;
    var m = null; (cfg().groupes || []).forEach(function (g) { (g.membres || []).forEach(function (x) { if (x.id === id && !m) m = x.nom; }); });
    return m || id;
  }
  function jourFr(j) { return j ? j.split('-').reverse().join('/') : ''; }
  function aujourdhui() { return DL.jourISO(Date.now()); }
  function plusJours(n) { return DL.jourISO(Date.now() + n * 864e5); }
  function libRole(r) { try { return SIC.modules.obtenir('isocont').droits.libRole(cfg(), r); } catch (e) { return r; } }
  function rolesEtab() { try { return SIC.modules.obtenir('isocont').droits.rolesConfig(cfg()).filter(function (r) { return !r.admin && DL.NON_PRETABLES.indexOf(r.code) < 0; }); } catch (e) { return []; } }
  function estIntervenant(c) { return (c.roles || []).indexOf('INTERVENANT') >= 0; }
  async function enregistrerPrets(l) { await s().enregistrer('CONFIG', { cle: 'delegations', valeur: { prets: l } }); }
  function pretsBruts() { var x = cfg().delegations; return JSON.parse(JSON.stringify(x && Array.isArray(x.prets) ? x.prets : [])); }

  // ------------------------------------------------------------ Prêts de droits
  /** Prêts que l'agent voit : les siens (donnés ou reçus) ; le cadre, ceux de ses services ; l'administrateur, tous. */
  function pretsVisibles() {
    var mes = moi().services || [];
    return DL.prets(cfg()).filter(function (d) { return estAdmin() || d.de === moi().id || d.a === moi().id || (estCadre() && d.services.some(function (x) { return mes.indexOf(x) >= 0; })); })
      .sort(function (a, b) { return b.debut.localeCompare(a.debut); });
  }
  function etatPret(d) { var j = aujourdhui(); return d.annule ? 'annulé' : d.fin < j ? 'terminé' : d.debut > j ? 'à venir' : 'en cours'; }
  function peutGerer(d) { try { DL.controlerPret(d, moi(), comptes()); return true; } catch (e) { return false; } }
  function modalePret() {
    var admin = estAdmin(), cadre = estCadre(), mes = moi().services || [];
    // Prêteurs possibles : soi-même ; le cadre, les agents de ses services ; l'administrateur, tous (hors intervenants)
    var preteurs = comptes().filter(function (c) { return c.actif !== false && !estIntervenant(c) && (c.roles || []).indexOf('ADMIN') < 0 && (c.id === moi().id || admin || (cadre && (c.services || []).some(function (x) { return mes.indexOf(x) >= 0; }))); });
    if (!preteurs.length) preteurs = [moi()];
    var selDe = h('select', { 'aria-label': 'Agent absent (qui prête)' }, preteurs.map(function (c) { return h('option', { value: c.id, text: c.nom + (c.id === moi().id ? ' (vous)' : ''), selected: c.id === moi().id }); }));
    var selA = h('select', { 'aria-label': 'Agent qui remplace' });
    var zoneRoles = h('div', { class: 'actions gauche' }), zoneSv = h('div', { class: 'actions gauche' }), avert = h('div');
    var debut = h('input', { type: 'date', value: aujourdhui(), 'aria-label': 'Début du prêt' }), fin = h('input', { type: 'date', value: plusJours(7), 'aria-label': 'Fin du prêt' });
    var motif = h('input', { type: 'text', maxlength: 120, placeholder: 'ex. congés annuels (facultatif)', 'aria-label': 'Motif' });
    var cbR = [], cbS = [];
    function dessiner() {
      var de = compte(selDe.value) || moi();
      U.vider(selA);
      comptes().filter(function (c) { return c.actif !== false && c.id !== de.id && !estIntervenant(c); }).sort(function (a, b) { return a.nom.localeCompare(b.nom); })
        .forEach(function (c) { selA.appendChild(h('option', { value: c.id, text: c.nom })); });
      U.vider(zoneRoles); U.vider(zoneSv); cbR = []; cbS = [];
      var rs = admin ? rolesEtab().map(function (r) { return r.code; }) : (de.roles || []).filter(function (r) { return DL.NON_PRETABLES.indexOf(r) < 0; });
      rs.forEach(function (r) { var cb = h('input', { type: 'checkbox', value: r, checked: (de.roles || []).indexOf(r) >= 0 && !admin, 'aria-label': 'Rôle prêté : ' + libRole(r) }); cbR.push(cb); zoneRoles.appendChild(h('label', { class: 'case' }, cb, h('span', { text: libRole(r) }))); });
      var svs = (admin ? U.tousServices().map(function (x) { return x.code; }) : (de.services || [])).filter(function (x) { return admin || de.id === moi().id || mes.indexOf(x) >= 0; });
      svs.forEach(function (x) { var cb = h('input', { type: 'checkbox', value: x, checked: true, 'aria-label': 'Service prêté : ' + U.libService(x) }); cb.addEventListener('change', avertir); cbS.push(cb); zoneSv.appendChild(h('label', { class: 'case' }, cb, h('span', { text: U.libService(x) }))); });
      avertir();
    }
    function avertir() {
      U.vider(avert);
      var a = compte(selA.value), choisis = cbS.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      var autres = a ? (a.services || []).filter(function (x) { return choisis.indexOf(x) < 0; }) : [];
      if (autres.length) avert.appendChild(h('p', { class: 'alerte', text: 'Le rôle prêté vaudra aussi dans ses autres services (' + autres.map(U.libService).join(', ') + ') : un rôle vaut pour tous les services du compte.' }));
    }
    selDe.addEventListener('change', dessiner); selA.addEventListener('change', avertir);
    dessiner();
    U.modale('Prêter des droits', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Pendant une absence, un collègue reçoit vos rôles dans les services choisis. Ses saisies faites grâce au prêt portent « pour le compte de » l’absent. Les clés des données sont remises par la session de l’administrateur (aussitôt s’il est connecté, sinon à sa prochaine connexion) et retirées à la fin du prêt. Vos messages personnels ne sont pas prêtés.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Agent absent', selDe), h('label', {}, 'Remplacé par', selA)),
      h('fieldset', {}, h('legend', { text: 'Rôles prêtés' }), zoneRoles),
      h('fieldset', {}, h('legend', { text: 'Services' }), zoneSv), avert,
      h('div', { class: 'grille-3' }, h('label', {}, 'Du', debut), h('label', {}, 'Au (inclus)', fin), h('label', {}, 'Motif', motif))),
      [{ texte: 'Annuler' }, { texte: 'Prêter', classe: 'primaire', action: async function () {
        var d = { id: 'pr' + C.hex(C.aleatoire(4)), de: selDe.value, a: selA.value, debut: debut.value, fin: fin.value, roles: cbR.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
          services: cbS.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }), motif: motif.value.trim(), par: moi().id, le: new Date().toISOString() };
        DL.controlerPret(DL.pret(d), moi(), comptes());
        await enregistrerPrets(pretsBruts().concat([d]));
        U.toast('Droits prêtés à ' + nom(d.a) + ' du ' + jourFr(d.debut) + ' au ' + jourFr(d.fin) + '.');
      } }], { large: true });
  }
  async function annulerPret(d) {
    if (!confirm('Mettre fin au prêt de ' + nom(d.de) + ' à ' + nom(d.a) + ' ?')) return;
    var l = pretsBruts().map(function (x) { return x.id === d.id ? Object.assign({}, x, { annule: true, annulePar: moi().id }) : x; });
    try { await enregistrerPrets(l); U.toast('Prêt terminé : les clés seront retirées par la session de l’administrateur.'); U.rendreContenu(); } catch (e) { alert(e.message); }
  }
  function tablePrets(l) {
    if (!l.length) return h('p', { class: 'muted', text: 'Aucun prêt de droits.' });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table-prets' },
      h('thead', {}, h('tr', {}, ['Agent absent', 'Remplacé par', 'Rôles', 'Services', 'Du', 'Au', 'État', ''].map(function (t) { return h('th', { text: t }); }))),
      h('tbody', {}, l.map(function (d) {
        var e = etatPret(d);
        return h('tr', { class: e === 'en cours' ? 'pret-en-cours' : (e === 'annulé' || e === 'terminé' ? 'muted' : '') },
          h('td', { text: nom(d.de) }), h('td', { text: nom(d.a) }), h('td', { text: d.roles.map(libRole).join(', ') }), h('td', { text: d.services.map(U.libService).join(', ') || '—' }),
          h('td', { text: jourFr(d.debut) }), h('td', { text: jourFr(d.fin) }), h('td', {}, h('span', { class: 'badge', text: e }), d.motif ? h('div', {}, h('small', { class: 'muted', text: d.motif })) : null),
          h('td', { class: 'actions-ligne' }, (e === 'en cours' || e === 'à venir') && peutGerer(d) && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: function () { annulerPret(d); } }, e === 'à venir' ? 'Annuler' : 'Mettre fin') : null));
      }))));
  }
  function vuePrets() {
    var l = pretsVisibles();
    return h('div', { class: 'pile' },
      h('div', { class: 'barre' }, h('h1', { text: 'Prêts de droits' }), h('div', { class: 'espace' }), s().apercu ? null : h('button', { class: 'btn primaire', type: 'button', onclick: modalePret }, '+ Prêter des droits')),
      h('p', { class: 'muted', text: 'Pendant une absence, confiez vos rôles à un collègue pour une durée limitée (six mois au plus). ' + (estCadre() ? 'Comme cadre, vous prêtez aussi les droits des agents de vos services. ' : '') + 'Le prêt prend fin seul à la date prévue.' }),
      tablePrets(l));
  }

  // ------------------------------------------------------------ Bandeaux
  function cleVu(d) { return 'sic-pret-vu:' + moi().id + ':' + d.id; }
  function bandeau() {
    if (!moi() || s().apercu) return null;
    var recus = DL.actifs(cfg(), moi().id, Date.now()), j = aujourdhui();
    var revenus = DL.prets(cfg()).filter(function (d) { var f = DL.jourISO(Date.now() - 8 * 864e5); return d.de === moi().id && !d.annule && d.fin < j && d.fin >= f; }).filter(function (d) { try { return !localStorage.getItem(cleVu(d)); } catch (e) { return true; } });
    if (!recus.length && !revenus.length) return null;
    return h('div', { class: 'pile' },
      recus.map(function (d) { return h('div', { class: 'info bandeau-pret' }, h('b', { text: 'Vous remplacez ' + nom(d.de) }), ' jusqu’au ' + jourFr(d.fin) + ' : ' + d.roles.map(libRole).join(', ') + (d.services.length ? ' (' + d.services.map(U.libService).join(', ') + ')' : '') + '. Vos saisies faites à ce titre portent « pour le compte de ' + nom(d.de) + ' ».'); }),
      revenus.map(function (d) {
        var n = (s().evts || []).filter(function (e) { return e.pour === moi().id && e.by === d.a; }).length;
        return h('div', { class: 'info bandeau-pret' }, h('b', { text: 'Pendant votre absence' }), ', ' + nom(d.a) + ' vous a remplacé(e) du ' + jourFr(d.debut) + ' au ' + jourFr(d.fin) + (n ? ' : ' + n + ' saisie' + (n > 1 ? 's' : '') + ' pour votre compte (journal).' : '.') + ' ',
          h('button', { class: 'btn petit', type: 'button', onclick: function () { try { localStorage.setItem(cleVu(d), '1'); } catch (e) { /* */ } U.rendreContenu(); } }, 'Vu'));
      }));
  }

  // ------------------------------------------------------------ Intervenants extérieurs
  function intervenantsVisibles() {
    var mes = moi().services || [];
    return comptes().filter(function (c) { return estIntervenant(c) && (estAdmin() || (c.services || []).some(function (x) { return mes.indexOf(x) >= 0; })); }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
  }
  function demandesVisibles() { return DL.demandes(cfg()).filter(function (d) { return estAdmin() || d.par === moi().id; }).sort(function (a, b) { return b.le.localeCompare(a.le); }).slice(0, 30); }
  function servicesChoix() { return estAdmin() ? U.tousServices() : U.tousServices().filter(function (x) { return (moi().services || []).indexOf(x.code) >= 0; }); }
  function modaleIntervenant() {
    var nomI = h('input', { type: 'text', maxlength: 80, placeholder: 'Prénom NOM', 'aria-label': 'Nom de l’intervenant' });
    var login = h('input', { type: 'text', maxlength: 40, 'aria-label': 'Identifiant' });
    nomI.addEventListener('input', function () { if (!login.dataset.modifie) login.value = SIC.comptes.identifiantDepuisNom(nomI.value); });
    login.addEventListener('input', function () { login.dataset.modifie = '1'; });
    var type = h('select', { 'aria-label': 'Type d’intervenant' }, Object.keys(DL.TYPES_INTERVENANT).map(function (k) { return h('option', { value: k, text: DL.TYPES_INTERVENANT[k] }); }));
    var svs = servicesChoix().map(function (x, i) { return { code: x.code, cb: h('input', { type: 'checkbox', checked: i === 0 || servicesChoix().length === 1, 'aria-label': 'Service : ' + x.libelle }), libelle: x.libelle }; });
    var fin = h('input', { type: 'date', value: plusJours(90), min: aujourdhui(), max: plusJours(DL.VALIDITE_MAX_JOURS), 'aria-label': 'Dernier jour d’accès' });
    U.modale('Nouvel intervenant extérieur', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Compte daté, sans accès par défaut sauf l’agenda des activités où l’intervenant est inscrit ou invité ; patients en initiales. Accès réglables dans « Rôles et accès » (rôle « Intervenant extérieur »).' + (cfg().charteIntervenants && cfg().charteIntervenants.texte ? ' La charte de confidentialité lui sera présentée à sa première connexion.' : '') }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nomI), h('label', {}, 'Identifiant', login)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', type), h('label', {}, 'Dernier jour d’accès', fin)),
      h('fieldset', {}, h('legend', { text: 'Services' }), h('div', { class: 'actions gauche' }, svs.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: x.libelle })); }))),
      estAdmin() ? null : h('p', { class: 'info', text: 'Le compte sera créé à la prochaine connexion de l’administrateur (il signe le coffre des clés). Vous verrez alors son état ici.' })),
      [{ texte: 'Annuler' }, { texte: 'Créer', classe: 'primaire', action: async function () {
        var mdp = C.nouveauMotDePasseProvisoire();
        await s().demanderCompteIntervenant({ nom: nomI.value, login: login.value, type: type.value, services: svs.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.code; }), finValidite: fin.value, motDePasse: mdp, aleatoire: true });
        setTimeout(function () {
          U.modale('Mot de passe provisoire', h('div', { class: 'pile' },
            h('p', { text: 'Remettez ce mot de passe provisoire à l’intervenant, en main propre. Il le changera à sa première connexion. Il n’est écrit nulle part.' }),
            h('p', { class: 'code-secours', text: mdp }), h('p', { class: 'muted', text: 'Identifiant : ' + login.value.trim().toLowerCase() })), [{ texte: 'J’ai noté le mot de passe', classe: 'primaire' }]);
        }, 0);
      } }]);
  }
  function modaleModifier(c) {
    var fin = h('input', { type: 'date', value: c.finValidite || plusJours(90), min: aujourdhui(), max: plusJours(DL.VALIDITE_MAX_JOURS), 'aria-label': 'Nouveau dernier jour d’accès' });
    U.modale('Intervenant : ' + c.nom, h('div', { class: 'pile' }, h('label', {}, 'Dernier jour d’accès', fin),
      estAdmin() ? null : h('p', { class: 'muted', text: 'Appliqué à la prochaine connexion de l’administrateur.' })),
      [{ texte: 'Annuler' },
        { texte: 'Mettre fin au compte', classe: 'danger', action: async function () { if (!confirm('Mettre fin au compte de ' + c.nom + ' ?')) return false; await s().demanderModificationIntervenant(c.id, { actif: false }); U.toast('Fin du compte demandée.'); } },
        { texte: 'Prolonger', classe: 'primaire', action: async function () { await s().demanderModificationIntervenant(c.id, { finValidite: fin.value }); U.toast('Prolongation enregistrée.'); } }]);
  }
  async function annulerDemande(d) {
    var v = JSON.parse(JSON.stringify(cfg().comptesDemandes || { demandes: [] }));
    v.demandes = v.demandes.map(function (x) { return x.id === d.id ? Object.assign({}, x, { etat: 'annulee' }) : x; });
    try { await s().enregistrer('CONFIG', { cle: 'comptesDemandes', valeur: v }); U.rendreContenu(); } catch (e) { alert(e.message); }
  }
  var LIB_DEMANDE = { attente: 'en attente de l’administrateur', faite: 'faite', annulee: 'annulée', refusee: 'refusée' };
  function panneauIntervenants() {
    var l = intervenantsVisibles(), ds = demandesVisibles();
    return h('section', { class: 'panneau pile' }, h('div', { class: 'barre' }, h('h2', { text: 'Intervenants extérieurs' }), h('div', { class: 'espace' }), s().apercu ? null : h('button', { class: 'btn primaire', type: 'button', onclick: modaleIntervenant }, '+ Intervenant')),
      h('p', { class: 'muted', text: 'Bénévoles, enseignants, intervenants libéraux, étudiants… : comptes datés (un an au plus, prolongeables), sans accès par défaut sauf l’agenda de leurs activités ; patients en initiales.' }),
      l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Intervenant', 'Type', 'Services', 'Dernier jour d’accès', 'État', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (c) {
          var v = SIC.comptes.validite(c, Date.now());
          return h('tr', {}, h('td', { text: c.nom + ' (' + c.login + ')' }), h('td', { text: DL.TYPES_INTERVENANT[(c.intervenant || {}).type] || '—' }), h('td', { text: (c.services || []).map(U.libService).join(', ') }),
            h('td', { text: jourFr(c.finValidite) || '—' }), h('td', {}, h('span', { class: 'badge', text: c.actif === false ? 'désactivé' : v.expire ? 'expiré' : v.bientot ? 'bientôt expiré' : 'actif' })),
            h('td', { class: 'actions-ligne' }, s().apercu ? null : h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleModifier(c); } }, 'Prolonger ou finir')));
        })))) : h('p', { class: 'muted', text: 'Aucun intervenant extérieur.' }),
      ds.length ? h('details', { open: ds.some(function (d) { return d.etat === 'attente'; }) }, h('summary', { text: 'Demandes (' + ds.length + ')' }), h('ul', { class: 'liste-simple' }, ds.map(function (d) {
        return h('li', {}, (d.action === 'creer' ? 'Création de ' : 'Modification de ') + (d.nom || d.login) + ' — ' + LIB_DEMANDE[d.etat] + (d.message ? ' (' + d.message + ')' : '') + ' ',
          d.etat === 'attente' && d.par === moi().id && !estAdmin() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { annulerDemande(d); } }, 'Annuler') : null);
      }))) : null);
  }
  function panneauCharte() {
    var c = DL.charte(cfg()), zone = h('textarea', { rows: 10, maxlength: 8000, 'aria-label': 'Texte de la charte', value: c.texte });
    zone.value = c.texte;
    return h('section', { class: 'panneau pile' }, h('h2', { text: 'Charte de confidentialité des intervenants extérieurs' }),
      h('p', { class: 'muted', text: 'Texte rédigé par l’établissement, présenté à chaque intervenant à sa première connexion ; son acceptation est datée et inscrite au journal. Une nouvelle version enregistrée est de nouveau présentée à tous. Vide : aucune charte.' + (c.version ? ' Version actuelle : ' + c.version + '.' : '') }),
      zone, h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try { await U.enregistrerConfig([['charteIntervenants', { texte: zone.value.trim(), version: zone.value.trim() ? c.version + 1 : 0 }]]); U.toast('Charte enregistrée.'); } catch (e) { alert(e.message); }
      } }, 'Enregistrer la charte')));
  }
  /** Charte à accepter (intervenant) : panneau qui remplace tout affichage tant qu'elle n'est pas acceptée. */
  function charte() {
    var p = s().preferences || {};
    if (!DL.charteAAccepter(moi(), cfg(), p.charte)) return null;
    var c = DL.charte(cfg()), cb = h('input', { type: 'checkbox', 'aria-label': 'J’ai lu la charte et je m’engage à la respecter' });
    return h('section', { class: 'panneau pile charte' }, h('h1', { text: 'Charte de confidentialité' }),
      h('div', { class: 'charte-texte', text: c.texte }),
      h('label', { class: 'case' }, cb, h('span', { text: 'J’ai lu la charte et je m’engage à la respecter.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        if (!cb.checked) return U.toast('Cochez la case pour accepter la charte.');
        try { await s().enregistrerPreference('charte', { version: c.version, le: new Date().toISOString() }); await s().tracer('CHARTE', { version: c.version, libelle: 'charte de confidentialité acceptée' }); U.rendreContenu(); } catch (e) { alert(e.message); }
      } }, 'J’accepte')));
  }

  // ------------------------------------------------------------ Branchement
  var eq = SIC.modules.obtenir('equipe');
  if (eq && eq.interface && eq.interface.vues) eq.interface.vues.prets = vuePrets;
  SIC.modules.completerInterface('equipe', {
    admin: {
      onglets: function () { return [['equipe-intervenants', 'Intervenants extérieurs', [panneauIntervenants(), panneauCharte()]], ['equipe-prets', 'Prêts de droits', [h('section', { class: 'panneau pile' }, h('div', { class: 'barre' }, h('h2', { text: 'Prêts de droits' }), h('div', { class: 'espace' }), h('button', { class: 'btn primaire', type: 'button', onclick: modalePret }, '+ Prêter des droits')), tablePrets(pretsVisibles()))]]]; },
      cadre: function () { return [panneauIntervenants()]; }
    }
  });
  U.delegations = { vuePrets: vuePrets, bandeau: bandeau, charte: charte, panneauIntervenants: panneauIntervenants, modalePret: modalePret };
})();
