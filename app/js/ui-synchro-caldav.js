// SPDX-License-Identifier: EUPL-1.2
/*
 * Synchronisation de Mes tâches et de Mon agenda avec l'agenda de la messagerie (Zimbra…), puis le téléphone par
 * DAVx5 (24 novembre 2026, décisions du porteur : tâches personnelles et partagées, agenda personnel et rendez-vous
 * partagés, Mon agenda, dans les deux sens ; fréquence réglable ; mot de passe
 * mémorisable mais redemandé dès que le serveur le refuse ; adresse du serveur autorisée par le script de mise à jour).
 *
 * Fonction soumise à avis « synchro-caldav », livrée désactivée (onglet Validations). Chaque agent la règle pour
 * lui-même (bouton « Synchronisation… » de Mes tâches et de Mon agenda) ; ses réglages vont dans ses préférences,
 * rangées chiffrées sur le partage, jamais au journal. Le mot de passe de la messagerie est gardé en mémoire pendant
 * la session ; s'il le choisit, l'agent le fait mémoriser, chiffré par sa clé de liste (lisible de lui seul).
 * Synchronisation à l'ouverture de Tessera, puis à la fréquence choisie par l'agent (3 minutes par défaut, de 1 minute à
 * une heure, ou à la demande seulement) tant que Tessera est ouvert, et à la demande.
 * Logique et protocole : caldav.js. Mode démonstration : serveur simulé dans le navigateur (données fictives).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, D = SIC.caldav, A = SIC.agenda;
  var CODE = 'synchro-caldav', USAGE = 'caldav', INTERVALLE_DEFAUT = 3;
  var INTERVALLES = [[1, 'Toutes les minutes'], [2, 'Toutes les 2 minutes'], [3, 'Toutes les 3 minutes'], [5, 'Toutes les 5 minutes'], [10, 'Toutes les 10 minutes'], [15, 'Toutes les 15 minutes'], [30, 'Toutes les 30 minutes'], [60, 'Toutes les heures'], [0, 'À la demande seulement (bouton « Synchroniser maintenant »)']];
  var etat = { essai: 0, mdp: null, enCours: false, derniere: null, resume: null, erreur: null, mdpRefuse: false, demande: false, couche: null, coucheVisible: true, simule: null };

  function s() { return U.App.session; }
  function demo() { return !!(U.App.dossier && U.App.dossier.mode === 'demo'); }
  function prefs() { return (s() && s().preferences) || {}; }
  function reglages() { var c = prefs().caldav; return c && typeof c === 'object' && c.actif ? c : null; }
  function disponible() {
    try { return !!s() && !!s().cle && !s().apercu && SIC.validations.actif(U.config(), CODE) && !!U.mesTaches && U.mesTaches.disponible(); }
    catch (e) { return false; }
  }

  // ------------------------------------------------------------ Serveur autorisé
  /** Serveur simulé du mode démonstration (données fictives), avec un agenda déjà rempli. */
  function simule() {
    if (etat.simule) return etat.simule;
    var srv = D.serveurSimule({ agents: [{ identifiant: 'agent.demo@chu.fictif', motDePasse: 'demo' }] });
    var j = function (n, hh, mm) { var d = new Date(); d.setHours(hh, mm || 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    srv.ajouter('/dav/agent.demo@chu.fictif/Calendar/demo-1.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:demo-1\r\nDTSTART:' + j(1, 12, 30) + '\r\nDTEND:' + j(1, 13, 30) + '\r\nSUMMARY:Déjeuner avec l’équipe de nuit (fictif)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
    srv.ajouter('/dav/agent.demo@chu.fictif/Calendar/demo-2.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:demo-2\r\nDTSTART:' + j(2, 8, 0) + '\r\nDTEND:' + j(2, 9, 0) + '\r\nSUMMARY:Commission des soins (fictif)\r\nLOCATION:Direction des soins\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
    etat.simule = srv;
    return srv;
  }
  /** Adresses que cette copie de Tessera peut joindre : celles ajoutées à la règle connect-src par le script de mise à jour. */
  function origines() {
    if (demo()) return [simule().origine];
    var m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return D.origines(m ? m.getAttribute('content') : '');
  }
  function client(r, mdp) {
    return D.Client({ adresse: r.adresse, identifiant: r.identifiant, motDePasse: mdp, fetch: demo() ? simule().fetch : self.fetch.bind(self) });
  }

  // ------------------------------------------------------------ Mot de passe
  async function mdpMemorise(r) {
    if (!r.mdpChiffre || etat.mdpRefuse) return null;
    try { var o = await s().dechiffrerPersonnel(USAGE, r.mdpChiffre); return o && typeof o.mdp === 'string' ? o.mdp : null; } catch (e) { return null; }
  }
  /** Fenêtre de saisie du mot de passe (refusé, ou ni gardé en mémoire ni mémorisé). Rend vrai si une synchronisation a réussi. */
  function demanderMdp(message) {
    var r = reglages();
    if (!r) return Promise.resolve(false);
    var champ = h('input', { type: 'password', autocomplete: 'off', maxlength: 200, 'aria-label': 'Mot de passe de la messagerie' });
    var memo = h('input', { type: 'checkbox', checked: !!r.mdpChiffre });
    return U.modale('Mot de passe de la messagerie', h('div', { class: 'pile' },
      h('p', { text: message || 'Saisissez le mot de passe de votre messagerie (' + r.identifiant + ') pour synchroniser vos tâches et votre agenda.' }),
      h('label', {}, 'Mot de passe', champ),
      h('label', { class: 'case' }, memo, h('span', { text: 'Le mémoriser (chiffré par votre clé de liste, lisible de vous seul ; redemandé s’il est refusé, par exemple après son changement)' }))),
    [{ texte: 'Plus tard' }, { texte: 'Synchroniser', classe: 'primaire', action: async function () {
      if (!champ.value) { champ.focus(); throw new Error('Indiquez le mot de passe.'); }
      await client(r, champ.value).maison();   // refusé : le message s'affiche dans la fenêtre
      etat.mdp = champ.value; etat.mdpRefuse = false;
      await enregistrerReglages(Object.assign({}, r, { mdpChiffre: memo.checked ? await s().chiffrerPersonnel(USAGE, { mdp: champ.value }) : '' }));
      await synchroniser({ interactif: true });
    } }], { focus: champ }).then(function (x) { return !!x; });
  }

  // ------------------------------------------------------------ Synchronisation
  async function enregistrerReglages(r) { await s().enregistrerPreference('caldav', r); }
  function sansMemoire(r) { var c = Object.assign({}, r); delete c.memTaches; delete c.memEvts; return c; }
  /** Intervalle de synchronisation choisi par l'agent, en minutes (0 : à la demande seulement). */
  function intervalle(r) { var v = r && r.intervalle; return INTERVALLES.some(function (x) { return x[0] === v; }) ? v : INTERVALLE_DEFAUT; }
  function evenements(debut, fin) {
    var I = U.agendaInt, svs = s().mesServices().map(function (x) { return x.code || x; }), o = A.echangesIcs(U.config(), svs);
    if (!I || !I.evenementsExport || !o.exporter) return [];
    return I.evenementsExport(debut, fin, ['agenda', 'absences', 'salles'], o.services);
  }
  /** Élément de l'Agenda d'une clé d'export (agenda-<id>-<date>) : { r, occurrence, repete } ou null. */
  function elementDe(cle) {
    var m = /^agenda-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(cle || ''), e = null;
    try { e = s().etatModule('agenda'); } catch (x) { e = null; }
    var r = m && e && e.rdv && e.rdv[m[1]];
    return r && !r.supprime ? { r: r, occurrence: m[2], repete: A.regularite(r.regularite).type !== 'aucune' } : null;
  }
  /**
   * Agenda pour la synchronisation, dans les deux sens : rendez-vous personnels et partagés (tout modifiable), éléments
   * de Mon agenda (seul l'horaire revient, s'il est permis à l'agent ; absences et salles remises comme dans Tessera).
   */
  var agendaSynchro = {
    lister: async function (debut, fin) {
      var res = U.mesRdv && U.mesRdv.disponible() ? await U.mesRdv.pourSynchro.lister(debut) : [];
      evenements(debut, fin).forEach(function (e) {
        var x = elementDe(e.cle), modifiable = false;
        try { modifiable = !!x && s().peut(x.repete ? 'OCCURRENCE' : 'RDV'); } catch (er) { modifiable = false; }
        res.push({ cle: e.cle, genre: 'service', debut: e.debut, fin: e.fin, journee: !!e.journee, titre: e.titre || '', lieu: e.lieu || '', note: '', modifiable: modifiable });
      });
      return res;
    },
    enregistrer: async function (cle, x, loc) {
      if (loc.genre === 'perso') return U.mesRdv.pourSynchro.enregistrer(cle, x);
      var el = elementDe(cle);
      if (!el || !loc.modifiable) throw new Error('Horaire non modifiable.');
      if (el.repete) await s().enregistrer('OCCURRENCE', { rdv: el.r.id, occurrence: el.occurrence, debut: x.debut, fin: x.fin });
      else await s().enregistrer('RDV', { id: el.r.id, service: el.r.service, debut: x.debut, fin: x.fin });
    },
    creer: function (x) { return U.mesRdv.pourSynchro.creer(x); },
    retirer: function (cle) { return U.mesRdv.pourSynchro.retirer(cle); }
  };
  function texteResume(x) {
    var t = x.taches, e = x.evenements, l = [];
    if (t.envoyees) l.push(t.envoyees + ' tâche(s) envoyée(s)');
    if (t.recues) l.push(t.recues + ' modifiée(s) sur le téléphone');
    if (t.creees) l.push(t.creees + ' ajoutée(s) depuis le téléphone');
    if (t.retireesIci) l.push(t.retireesIci + ' supprimée(s) sur le téléphone, retirée(s) de vos tâches');
    if (t.retireesLa) l.push(t.retireesLa + ' retirée(s) du téléphone');
    if (t.reportees) l.push(t.reportees + ' reportée(s) à la prochaine fois');
    if (e.envoyes) l.push(e.envoyes + ' événement(s) envoyé(s)');
    if (e.recus) l.push(e.recus + ' événement(s) modifié(s) sur le téléphone');
    if (e.crees) l.push(e.crees + ' rendez-vous ajouté(s) depuis le téléphone');
    if (e.retiresIci) l.push(e.retiresIci + ' rendez-vous supprimé(s) sur le téléphone, retiré(s) de Mon agenda');
    if (e.retires) l.push(e.retires + ' événement(s) retiré(s) du téléphone');
    if (e.remis) l.push(e.remis + ' changement(s) d’un élément du service non repris (remis comme dans Tessera)');
    if (e.reportes) l.push(e.reportes + ' événement(s) reporté(s) à la prochaine fois');
    return l.join(' ; ');
  }
  /**
   * Une synchronisation. `o.interactif` : demandée par l'agent (messages affichés, mot de passe demandé aussitôt).
   * En arrière-plan, un mot de passe refusé est redemandé une fois par session, quand aucune fenêtre n'est ouverte ; un
   * mot de passe ni gardé ni mémorisé est demandé par un bandeau.
   */
  async function synchroniser(o) {
    o = o || {};
    var r = reglages();
    if (!r || !disponible() || etat.enCours) return null;
    var mdp = etat.mdp || await mdpMemorise(r);
    if (!mdp) {
      // Mot de passe ni gardé ni mémorisé : demandé par le bandeau de Mes tâches et de Mon agenda, sans fenêtre imposée
      if (o.interactif) return demanderMdp(etat.mdpRefuse ? 'Le mot de passe a été refusé par la messagerie (il a peut-être changé). Saisissez le nouveau.' : null);
      return null;
    }
    etat.enCours = true; etat.essai = Date.now();
    try {
      var res = await D.synchroniser({ client: client(r, mdp), config: r, taches: U.mesTaches.pourSynchro, agenda: agendaSynchro, nomAgent: s().compteEffectif().nom, maintenant: Date.now() });
      etat.mdp = mdp; etat.erreur = null; etat.derniere = Date.now(); etat.resume = res.resume;
      etat.couche = r.afficher && res.resume.affiches ? { nom: r.nomAffiche || 'Agenda de la messagerie', evenements: res.resume.affiches } : null;
      if (JSON.stringify(res.config) !== JSON.stringify(r)) { try { await enregistrerReglages(res.config); } catch (e) { /* réglages repris à la prochaine fois */ } }
      var txt = texteResume(res.resume);
      if (o.interactif) U.toast('Synchronisation faite' + (txt ? ' : ' + txt : ' : rien à changer') + '.');
      else if (res.resume.taches.recues || res.resume.taches.creees || res.resume.taches.retireesIci || res.resume.evenements.recus || res.resume.evenements.crees || res.resume.evenements.retiresIci) U.toast('Messagerie : ' + txt + '.');
      U.rendreContenu();
      return res.resume;
    } catch (e) {
      if (e.code === 'auth') {
        etat.mdp = null; etat.mdpRefuse = true; etat.erreur = 'Mot de passe refusé par la messagerie.';
        etat.enCours = false;
        if (o.interactif) return demanderMdp('Le mot de passe a été refusé par la messagerie (il a peut-être changé). Saisissez le nouveau.');
        if (!etat.demande && !document.querySelector('dialog[open]')) { etat.demande = true; demanderMdp('Le mot de passe de votre messagerie a été refusé (il a peut-être changé). Saisissez le nouveau pour reprendre la synchronisation.'); }
        else U.toast('Synchronisation arrêtée : mot de passe de la messagerie refusé. « Synchronisation… » pour le ressaisir.');
        U.rendreContenu();
        return null;
      }
      etat.erreur = e.message;
      if (o.interactif) throw e;
      return null;
    } finally { etat.enCours = false; }
  }

  // ------------------------------------------------------------ Réglages de l'agent
  function modaleReglages() {
    var r0 = reglages() || {}, ors = origines();
    if (!ors.length) {
      return U.modale('Synchronisation avec la messagerie', h('div', { class: 'pile' },
        h('p', { text: 'Cette copie de Tessera n’est autorisée à joindre aucun serveur de messagerie : Tessera ne se connecte à aucune adresse tant que le service informatique (DSI ou direction du numérique, selon l’établissement) ne l’a pas autorisée.' }),
        h('p', { class: 'muted', text: 'Le service informatique ajoute l’adresse du serveur d’agenda de l’établissement lors de la mise à jour de Tessera (script mettre-a-jour-outil.ps1, paramètre -Zimbra) et règle le serveur pour qu’il accepte les échanges avec Tessera. Voir le guide d’installation, § 3 ter.' })),
        [{ texte: 'Fermer' }]);
    }
    var origine = h('select', { 'aria-label': 'Serveur' }, ors.map(function (x) { return h('option', { value: x, text: x, selected: r0.adresse && D.autorisee(r0.adresse, [x]) }); }));
    var ident = h('input', { type: 'text', autocomplete: 'username', maxlength: 200, value: r0.identifiant || (demo() ? 'agent.demo@chu.fictif' : ''), 'aria-label': 'Identifiant de la messagerie' });
    var adresse = h('input', { type: 'text', maxlength: 300, value: r0.adresse || '', 'aria-label': 'Adresse de votre agenda' });
    var mdp = h('input', { type: 'password', autocomplete: 'off', maxlength: 200, 'aria-label': 'Mot de passe de la messagerie', placeholder: r0.actif ? 'Inchangé' : '' });
    var memo = h('input', { type: 'checkbox', checked: !!r0.mdpChiffre });
    var taches = h('input', { type: 'checkbox', checked: r0.actif ? !!r0.taches : true }), agenda = h('input', { type: 'checkbox', checked: r0.actif ? !!r0.agenda : true });
    var frequence = h('select', { 'aria-label': 'Fréquence de la synchronisation' }, INTERVALLES.map(function (x) { return h('option', { value: String(x[0]), text: x[1], selected: x[0] === intervalle(r0) }); }));
    var afficher = h('select', { 'aria-label': 'Agenda de la messagerie à afficher dans Mon agenda' }, h('option', { value: '', text: 'Ne pas afficher' }));
    if (r0.afficher) afficher.appendChild(h('option', { value: r0.afficher, text: r0.nomAffiche || 'Agenda choisi', selected: true }));
    var zoneTest = h('div', { class: 'muted' });
    function adresseProposee() { return D.adresseZimbra(origine.value, ident.value); }
    function majAdresse(force) { if (force || !adresse.value || !D.autorisee(adresse.value, [origine.value])) adresse.value = ident.value.trim() ? adresseProposee() : ''; }
    ident.addEventListener('change', function () { if (!r0.adresse || adresse.value === D.adresseZimbra(origine.value, r0.identifiant || '')) majAdresse(true); });
    origine.addEventListener('change', function () { majAdresse(true); });
    if (!adresse.value && ident.value) majAdresse(true);
    async function motDePasse() { return mdp.value || etat.mdp || (r0.actif ? await mdpMemorise(r0) : null) || ''; }
    function lu() {
      var a = adresse.value.trim(), id = ident.value.trim();
      if (!id) { ident.focus(); throw new Error('Indiquez votre identifiant de messagerie.'); }
      if (!D.autorisee(a, ors)) throw new Error('L’adresse doit être sur le serveur autorisé (' + ors.join(', ') + ').');
      return { adresse: a.replace(/\/?$/, '/'), identifiant: id };
    }
    async function tester() {
      var x = lu(), m = await motDePasse();
      if (!m) { mdp.focus(); throw new Error('Indiquez le mot de passe de votre messagerie.'); }
      var c = client(x, m), maison = await c.maison(), liste = await c.agendas(maison), ev = liste.filter(function (a) { return a.composants.indexOf('VEVENT') >= 0 && !/^Tessera — /.test(a.nom); });
      var choix = afficher.value;
      U.vider(afficher).appendChild(h('option', { value: '', text: 'Ne pas afficher' }));
      ev.forEach(function (a) { afficher.appendChild(h('option', { value: a.href, text: a.nom, selected: a.href === choix })); });
      zoneTest.textContent = 'Connexion réussie : ' + liste.length + ' agenda(s) trouvé(s).';
      return { x: x, m: m, liste: liste };
    }
    var boutons = [{ texte: 'Annuler' }];
    if (r0.actif) boutons.push({ texte: 'Arrêter la synchronisation', classe: 'danger', action: async function () {
      if (!await SIC.ui.confirmer('Arrêter la synchronisation ? Ce qui a déjà été copié reste dans l’agenda de votre messagerie (« Tessera — tâches », « Tessera — agenda ») : supprimez ces agendas dans la messagerie si vous n’en voulez plus. Le mot de passe mémorisé est effacé.')) return false;
      await enregistrerReglages(null);
      etat.mdp = null; etat.couche = null; etat.resume = null; etat.derniere = null; etat.erreur = null;
      U.toast('Synchronisation arrêtée.'); U.rendreContenu();
    } });
    boutons.push({ texte: 'Tester la connexion', action: async function () { await tester(); return false; } });
    boutons.push({ texte: 'Enregistrer et synchroniser', classe: 'primaire', action: async function () {
      if (!taches.checked && !agenda.checked && !afficher.value) throw new Error('Choisissez au moins une chose à synchroniser.');
      var t = await tester(), memeCompte = r0.actif && r0.adresse === t.x.adresse && r0.identifiant === t.x.identifiant;
      var nomAff = afficher.value ? (t.liste.filter(function (a) { return a.href === afficher.value; })[0] || {}).nom || '' : '';
      var r = Object.assign({}, memeCompte ? r0 : {}, t.x, { actif: true, taches: taches.checked, agenda: agenda.checked, afficher: afficher.value, nomAffiche: nomAff, intervalle: +frequence.value,
        mdpChiffre: memo.checked ? (mdp.value || !r0.mdpChiffre ? await s().chiffrerPersonnel(USAGE, { mdp: t.m }) : r0.mdpChiffre) : '' });
      if (!memeCompte) { r.agendas = {}; r.memTaches = {}; r.memEvts = {}; }
      etat.mdp = t.m; etat.mdpRefuse = false; etat.demande = false;
      await enregistrerReglages(r);
      await synchroniser({ interactif: true });
    } });
    var info = etat.derniere ? h('p', { class: 'info', text: 'Dernière synchronisation : ' + U.date(etat.derniere) + (etat.resume ? ' — ' + (texteResume(etat.resume) || 'rien à changer') : '') }) : null;
    return U.modale('Synchronisation avec la messagerie', h('div', { class: 'pile' },
      info,
      h('p', { text: 'Vos tâches et votre agenda sont copiés dans l’agenda de votre messagerie, puis sur votre téléphone par l’application DAVx5 (ou tout logiciel d’agenda compatible CalDAV), avec le compte que vous y utilisez déjà.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Serveur autorisé', origine), h('label', {}, 'Identifiant de la messagerie', ident)),
      h('label', {}, 'Adresse de votre agenda (proposée d’après l’identifiant)', adresse),
      h('label', {}, 'Mot de passe de la messagerie', mdp),
      h('label', { class: 'case' }, memo, h('span', { text: 'Mémoriser le mot de passe (chiffré par votre clé de liste, lisible de vous seul ; jamais écrit au journal ; redemandé s’il est refusé, par exemple après son changement). Sinon, il est demandé à chaque ouverture de Tessera.' })),
      h('fieldset', { class: 'pile' }, h('legend', { text: 'À synchroniser' }),
        h('label', { class: 'case' }, taches, h('span', { text: 'Mes tâches, personnelles et partagées : liste « Tessera — tâches », modifiable sur le téléphone (titre, échéance, rappel, note, faite) ; les changements reviennent dans Tessera, pour tous les participants d’une tâche partagée.' })),
        h('label', { class: 'case' }, agenda, h('span', { text: 'Mon agenda : agenda « Tessera — agenda », dans les deux sens. Vos rendez-vous personnels et partagés : tout se modifie sur le téléphone, et un événement créé sur le téléphone dans cet agenda devient un rendez-vous personnel. Les éléments du service où vous êtes prévu(e) (sans identité de patient : type, lieu, horaire), vos absences et vos salles, de la semaine passée aux deux mois à venir : seul l’horaire d’un élément que vous pouvez modifier dans Tessera revient du téléphone ; le reste est remis comme dans Tessera.' })),
        h('label', {}, 'Afficher dans Mon agenda l’agenda de la messagerie (lecture seule, visible de vous seul(e), jamais copié sur le partage)', afficher)),
      h('label', {}, 'Fréquence de la synchronisation (quand Tessera est ouvert)', frequence),
      zoneTest,
      h('p', { class: 'muted', text: 'La synchronisation se fait quand Tessera est ouvert : à l’ouverture, puis à la fréquence choisie, et à la demande. Aucune donnée clinique dans les tâches et les rendez-vous. Un téléphone qui les reçoit doit être verrouillé par un code.' }),
      demo() ? h('p', { class: 'info', text: 'Mode démonstration : serveur simulé dans ce navigateur (identifiant agent.demo@chu.fictif, mot de passe « demo »), données fictives.' }) : null),
    boutons, { large: true, focus: r0.actif ? null : ident });
  }

  // ------------------------------------------------------------ Affichage
  function bouton() {
    if (!disponible()) return null;
    var r = reglages();
    return h('button', { class: 'btn', type: 'button', title: 'Synchroniser avec l’agenda de la messagerie et le téléphone', onclick: modaleReglages }, r ? (etat.enCours ? 'Synchronisation…' : '⟳ Synchronisation') : 'Synchroniser avec la messagerie…');
  }
  function etatAffiche() {
    var r = reglages();
    if (!disponible() || !r) return null;
    if (etat.mdpRefuse || (!etat.mdp && !r.mdpChiffre)) return h('p', { class: 'alerte' }, (etat.mdpRefuse ? 'Synchronisation arrêtée : mot de passe de la messagerie refusé. ' : 'Synchronisation en attente du mot de passe de la messagerie. '),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { demanderMdp(); } }, 'Saisir le mot de passe'));
    if (etat.erreur) return h('p', { class: 'alerte', text: 'Synchronisation impossible : ' + etat.erreur });
    if (!etat.derniere) return null;
    return h('p', { class: 'muted' }, h('small', {}, 'Synchronisé avec la messagerie à ' + U.date(etat.derniere).slice(-5) + (intervalle(r) ? ' (' + INTERVALLES.filter(function (x) { return x[0] === intervalle(r); })[0][1].toLowerCase() + ')' : ' (à la demande)') + '. ',
      h('button', { class: 'btn lien petit', type: 'button', onclick: function () { synchroniser({ interactif: true }).catch(function (e) { SIC.ui.alerte(e.message); }); } }, 'Synchroniser maintenant')));
  }
  function couche() { return disponible() && reglages() && etat.couche ? { nom: etat.couche.nom, evenements: etat.couche.evenements, visible: etat.coucheVisible } : null; }

  // ------------------------------------------------------------ Démarrage (après la connexion)
  function demarrer(minuteurs) {
    etat.mdp = null; etat.mdpRefuse = false; etat.demande = false; etat.derniere = null; etat.resume = null; etat.erreur = null; etat.couche = null; etat.essai = 0;
    setTimeout(function () { synchroniser().catch(function () {}); }, 8000);
    // Fréquence choisie par l'agent (24 novembre 2026) : contrôle toutes les 20 secondes du temps écoulé depuis le dernier essai
    if (minuteurs) minuteurs.push(setInterval(function () {
      var r = reglages(), n = intervalle(r);
      if (r && n > 0 && document.visibilityState === 'visible' && etat.essai && Date.now() - etat.essai >= n * 60000) synchroniser().catch(function () {});
    }, 20000));
  }

  U.synchroCaldav = { disponible: disponible, synchroniser: synchroniser, modaleReglages: modaleReglages, bouton: bouton, etatAffiche: etatAffiche, couche: couche,
    basculerCouche: function () { etat.coucheVisible = !etat.coucheVisible; U.rendreContenu(); }, demarrer: demarrer, origines: origines, _etat: etat };
})();
