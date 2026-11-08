// SPDX-License-Identifier: EUPL-1.2
/*
 * Interface — coquille de Tessera Santé (socle) : outils d'affichage, accueil, connexion, en-tête, onglets,
 * fenêtres, exports, thème, journal et administration. Vues et fenêtres d'Isocont : ui-isocont.js (étape 1 du plan).
 * Construction du DOM sans innerHTML : aucune donnée saisie n'est jamais
 * interprétée comme du HTML.
 */
(function () {
  'use strict';
  var SIC = self.SIC, M = SIC.model, R = SIC.rules, C = SIC.crypto;
  var H = R.H, J = R.J;

  // ================================================================ Outils
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) ajouterEnfant(el, arguments[i]);
    return el;
  }
  function ajouterEnfant(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { ajouterEnfant(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function vider(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  var fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var fmtCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  var fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  function date(ms) { return typeof ms === 'number' ? fmtDate.format(ms) : '—'; }
  function court(ms) { return typeof ms === 'number' ? fmtCourt.format(ms) : '—'; }
  function duree(heures) {
    if (!isFinite(heures)) return '—';
    var neg = heures < 0; heures = Math.abs(heures);
    var tot = Math.round(heures * 60), j = Math.floor(tot / 1440), hh = Math.floor((tot % 1440) / 60), mm = tot % 60;
    var s = j ? j + ' j ' + hh + ' h' : hh + ' h ' + String(mm).padStart(2, '0');
    return (neg ? '−' : '') + s;
  }
  function relatif(ms, maintenant) {
    var d = (ms - maintenant) / H;
    return d >= 0 ? 'dans ' + duree(d) : 'il y a ' + duree(-d);
  }
  function versSaisie(ms) {
    var d = new Date(ms);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function depuisSaisie(s) { var t = new Date(s).getTime(); if (!isFinite(t)) throw new Error('Date invalide.'); return t; }
  function idMesure() { return 'M' + Date.now().toString(36).toUpperCase() + C.hex(C.aleatoire(2)).toUpperCase(); }

  function toast(msg) {
    var t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }


  // ================================================================ État
  var App = { dossier: null, session: null, onglet: 'tableau', service: '*', minuteurs: [], derniereActivite: Date.now(), message: null };
  try { App.service = localStorage.getItem('sic-service') || '*'; } catch (e) { /* stockage indisponible */ }
  var racine = document.getElementById('app');

  // Socle et module affiché (contrat déclaré au registre des modules, modules.js)
  var X = SIC.exportsRangement, N = SIC.noyauJournal;
  function moduleActif() { return SIC.modules.actif(); }
  /** Éléments d'interface du module (vues, libellés du journal, panneaux d'administration) : ui-isocont.js. */
  function interfaceModule() { return moduleActif().interface || {}; }
  /** Module affiché (choisi par l'agent dans l'en-tête ou l'accueil des modules, étape 6). */
  function moduleAffiche() { return (App.session && SIC.modules.obtenir(App.session.moduleAffiche())) || moduleActif(); }
  /** Libellés du journal d'une saisie : ceux du module qui déclare son type, sinon ceux du module principal. */
  function journalDe(e) { var m = e && SIC.modules.moduleDuType(e.type); return (m && m.interface && m.interface.journal) || interfaceModule().journal; }
  function droits() { return moduleActif().droits; }
  function st() { return App.session && App.session.etat; }
  function config() { return st() ? st().config : moduleActif().reglages.defaut; }
  /** Texte de l'outil avec l'appellation des lieux d'isolement de l'établissement (« CSI » par défaut). */
  function lieu(texte) { return M.txtLieu(config(), texte); }
  function tousServices() { return config().services || []; }
  /** Services visibles par l'utilisateur connecté (tous pour un administrateur). */
  function services() {
    if (!App.session || !App.session.utilisateur || !st()) return tousServices();
    var miens = App.session.mesServices();
    return tousServices().filter(function (x) { return miens.indexOf(x.code) >= 0; });
  }
  function libService(code) { var s = tousServices().filter(function (x) { return x.code === code; })[0]; return s ? s.libelle : code; }
  function patient(id) { return st().patients[M.ciblePatient(st(), id)] || { id: id, nom: '?', prenom: '', modes: [] }; }
  function nomPatient(id) { var p = patient(id); return (p.nom || '?') + ' ' + (p.prenom || ''); }
  function modeActuel(p) { return p.modes && p.modes.length ? p.modes[p.modes.length - 1].mode : ''; }
  function dansService(m) {
    if (App.service !== '*') return m.service === App.service;
    return App.session.mesServices().indexOf(m.service) >= 0;
  }
  function etablissement() { return config().etablissement || ''; }

  function erreurDans(zone, e) {
    vider(zone);
    if (e) zone.appendChild(h('div', { class: 'erreur', role: 'alert', text: e.message || String(e) }));
  }

  // ================================================================ Rendu principal
  function rendre() {
    vider(racine);
    if (App.dossier && App.dossier.mode === 'demo') racine.appendChild(h('div', { class: 'bandeau-demo', text: 'Mode démonstration — données fictives uniquement, stockées dans ce navigateur. Ne saisissez aucune donnée réelle.' }));
    if (!App.dossier) return racine.appendChild(ecranAccueil());
    if (App.deplacement) return racine.appendChild(SIC.ui.miroir.ecranDeplace(App.deplacement));
    if (App.secours) racine.appendChild(h('div', { class: 'bandeau-secours', role: 'alert', text: App.secours === 'local'
      ? 'Hors réseau — copie locale de ce poste. Au retour du réseau : Verrouiller, Changer de dossier, puis « Reprendre » le dossier habituel ; les saisies faites ici seront reprises.'
      : 'Dossier de secours — à n’utiliser que si le dossier principal est inaccessible. Au retour du dossier principal, l’administrateur l’ouvre et synchronise.' }));
    if (!App.session.coffre) return racine.appendChild(App.anomalie ? ecranAnomalie() : ecranInitialisation());
    if (!App.session.cle) return racine.appendChild(ecranConnexion());
    if (App.session.utilisateur && App.session.utilisateur.mdpProvisoire) return racine.appendChild(ecranMotDePasseObligatoire());
    racine.appendChild(ecranApplication());
    vueAffichee = null;
    rendreContenu();   // une fois la page insérée dans le document
  }

  /** Logo de l'établissement : réglage du coffre, ou dernier connu sur ce poste (écran de connexion). */
  function logoEtablissement() {
    var s = App.session;
    if (s && s.etat && s.etat.config) return M.optionsAffichage(s.etat.config).logo;
    return accueilPoste().logo || '';
  }
  /** Contact, consigne et logo de l'établissement retenus sur le poste (affichés avant la connexion, le coffre étant chiffré). */
  function cleAccueil() { return 'sic-accueil:' + ((App.dossier && App.dossier.nom) || ''); }
  function accueilPoste() { try { return JSON.parse(localStorage.getItem(cleAccueil()) || '{}') || {}; } catch (e) { return {}; } }
  function retenirAccueil() {
    var s = App.session; if (!s || !s.etat || s.formation) return;
    var a = M.optionsAffichage(s.etat.config);
    try { localStorage.setItem(cleAccueil(), JSON.stringify({ contact: a.contact, consigne: a.consigne, logo: a.logo })); } catch (e) { /* stockage plein ou indisponible */ }
  }
  function blocAccueil() {
    var a = accueilPoste();
    if (!a.contact && !a.consigne) return null;
    return h('div', { class: 'accueil-etab' },
      a.consigne ? h('p', { class: 'consigne' }, multiligne(a.consigne)) : null,
      a.contact ? h('p', {}, h('b', { text: 'En cas de difficulté : ' }), multiligne(a.contact)) : null);
  }
  function multiligne(t) { var l = String(t).split('\n'); return l.map(function (x, i) { return [x, i < l.length - 1 ? h('br') : null]; }); }

  function marque(sousTitre) {
    return h('div', { class: 'marque' },
      logoEtablissement() ? h('img', { class: 'logo-etab', src: logoEtablissement(), alt: '' }) : h('img', { class: 'logo', src: 'img/icone-256.png', alt: '' }),
      h('div', {}, h('b', { text: 'Tessera Santé' }), h('small', { text: sousTitre || ('Version ' + SIC.VERSION) })));
  }

  // ---------------------------------------------------------------- Accueil
  function ecranAccueil() {
    var zoneErr = h('div');
    if (App.message) { zoneErr.appendChild(h('div', { class: 'info', text: App.message })); App.message = null; }
    var pile = h('div', { class: 'pile' });
    var carte = h('div', { class: 'carte' }, marque(), h('p', { text: 'Les données restent dans un dossier du réseau de l’établissement, chiffrées sur ce poste avant d’y être écrites. Rien n’est envoyé sur Internet.' }), zoneErr, pile);

    async function ouvrir(fn) {
      try { App.dossier = await fn(); await demarrerSession(); }
      catch (e) { if (e.name !== 'AbortError') erreurDans(zoneErr, e); }
    }
    SIC.Dossier.miroirPoste('local').then(function (local) {
      if (!local) return;
      pile.appendChild(h('div', { class: 'separateur', text: 'panne du réseau' }));
      pile.appendChild(h('button', { class: 'btn', title: 'Copie locale des données de ce poste, tenue à jour toutes les 10 minutes', onclick: function () { ouvrir(SIC.Dossier.ouvrirLocal); } }, 'Travailler hors réseau (copie locale de ce poste)'));
    }).catch(function () {});
    Promise.all([SIC.Dossier.precedent(), SIC.Dossier.lireVerrou().catch(function () { return null; })]).then(function (r) {
      var prec = r[0];
      if (prec && !(r[1] && prec.mode === 'demo')) {
        pile.insertBefore(h('button', { class: 'btn primaire', onclick: function () { ouvrir(function () { return SIC.Dossier.rouvrir(prec); }); } }, 'Reprendre : ' + prec.nom), pile.firstChild);
        pile.insertBefore(h('div', { class: 'separateur', text: 'ou' }), pile.children[1]);
      }
    });
    var reseauOk = !!window.showDirectoryPicker;
    var zoneChoix = h('div', { class: 'pile' });
    pile.appendChild(zoneChoix);
    function choixLibres() {
      vider(zoneChoix);
      zoneChoix.appendChild(h('button', { class: 'btn' + (reseauOk ? ' primaire' : ''), disabled: !reseauOk, onclick: function () { ouvrir(SIC.Dossier.choisirReseau); } }, 'Ouvrir le dossier réseau du service…'));
      if (!reseauOk) zoneChoix.appendChild(h('small', { text: 'L’ouverture d’un dossier réseau nécessite Edge ou Chrome à jour.' }));
      zoneChoix.appendChild(h('button', { class: 'btn', onclick: function () { ouvrir(SIC.Dossier.demo); } }, 'Mode démonstration (données fictives)'));
    }
    // Choix du dossier bloqué par l'établissement : seules les mêmes données s'ouvrent sans administrateur,
    // ni autre dossier ni mode démonstration (rien n'est proposé avant de savoir si le poste est bloqué)
    SIC.Dossier.lireVerrou().catch(function () { return null; }).then(function (v) {
      if (!v) { choixLibres(); astuce.hidden = false; return; }
      vider(zoneChoix);
      zoneChoix.appendChild(h('div', { class: 'info', text: 'Choix du dossier bloqué sur ce poste : données de « ' + v.nom + ' ».' }));
      zoneChoix.appendChild(h('button', { class: 'btn', disabled: !reseauOk, title: 'Dossier de secours, nouveau dossier après un déplacement…', onclick: function () { ouvrir(SIC.ui.verrou.ouvrirMemesDonnees); } }, 'Ouvrir un autre dossier de ces mêmes données…'));
      zoneChoix.appendChild(h('button', { class: 'btn lien', onclick: async function () {
        erreurDans(zoneErr, null);
        try { if (await SIC.ui.verrou.debloquer('Pour ouvrir d’autres données ou le mode démonstration.')) choixLibres(); }
        catch (e) { if (e.name !== 'AbortError') erreurDans(zoneErr, e); }
      } }, 'Débloquer le choix du dossier (administrateur)…'));
    }).catch(function () {});
    var astuce = h('small', { hidden: true, text: location.protocol === 'file:' ? 'Application ouverte depuis un fichier : les clés de sécurité (YubiKey) ne sont pas disponibles dans ce mode.' : 'Astuce démonstration : ouvrez un second onglet pour simuler un autre poste et observer la saisie simultanée.' });
    pile.appendChild(astuce);
    pile.appendChild(SIC.ui.horsReseau.boutonInstaller('btn lien'));
    return h('div', { class: 'ecran' }, carte);
  }

  async function demarrerSession() {
    App.session = new SIC.Session(App.dossier);
    App.session.sur(function (s, info) { if (info && info.source === 'verrou') { verrouiller(info.message); return; } if (App.session.cle) apresNotification(info); });
    await App.session.chargerCoffre();
    App.anomalie = App.session.coffre ? null : await App.dossier.anomalie();
    App.deplacement = null; App.secours = false;
    if (App.dossier.mode === 'reseau') {
      try { App.deplacement = await App.dossier.lireDeplacement(); } catch (e) { /* lecture impossible */ }
      try { var em = await App.dossier.lireEtatMiroir(); App.secours = em && em.role === 'secours' ? (em.type || 'serveur') : false; } catch (e) { /* lecture impossible */ }
    }
    rendre();
  }

  /** Dossier sans coffre mais contenant des saisies : jamais proposé à l'initialisation. */
  function ecranAnomalie() {
    var formation = App.anomalie === 'formation';
    return h('div', { class: 'ecran' }, h('div', { class: 'carte' }, marque(App.dossier.nom),
      h('h1', { text: formation ? 'Ce dossier est un jeu de formation' : App.anomalie === 'coffre-illisible' ? 'Coffre illisible' : 'Coffre introuvable' }),
      h('div', { class: 'erreur', text: formation
        ? 'Vous avez ouvert le sous-dossier « formation », qui contient le jeu de données fictives. Ouvrez le dossier principal (le dossier parent) ; le mode formation se choisit ensuite à la connexion.'
        : (App.anomalie === 'coffre-illisible' ? 'Le fichier coffre.json de ce dossier est abîmé' : 'Ce dossier contient des saisies mais pas de fichier coffre.json') + ' : sans coffre, les données ne peuvent pas être lues. Ne réinitialisez pas ce dossier. Restaurez une version précédente du coffre ci-dessous, ou la copie sous scellé ; à défaut, faites restaurer coffre.json depuis la sauvegarde par le service informatique (voir les procédures de secours).' }),
      formation ? null : SIC.ui.sauvegarde.blocRestaurationCoffre(demarrerSession),
      h('div', { class: 'actions' }, h('button', { class: 'btn' + (formation ? ' primaire' : ''), onclick: changerDossier }, 'Choisir un autre dossier'))));
  }

  // ---------------------------------------------------------------- Initialisation
  function ecranInitialisation() {
    var zoneErr = h('div');
    var nom = h('input', { type: 'text', required: true, autocomplete: 'name', placeholder: 'Prénom NOM' });
    var login = h('input', { type: 'text', required: true, autocomplete: 'username', placeholder: 'ex. prenom.nom' });
    var mdp = h('input', { type: 'password', required: true, autocomplete: 'new-password' });
    var mdp2 = h('input', { type: 'password', required: true, autocomplete: 'new-password' });
    var demo = h('input', { type: 'checkbox', checked: App.dossier.mode === 'demo' });
    var bouton = h('button', { class: 'btn primaire', type: 'submit' }, 'Initialiser le dossier');
    var form = h('form', { class: 'pile', onsubmit: async function (ev) {
      ev.preventDefault(); erreurDans(zoneErr, null);
      try {
        if (mdp.value.length < 12) throw new Error('Le mot de passe doit comporter au moins 12 caractères.');
        if (mdp.value !== mdp2.value) throw new Error('Les deux mots de passe ne correspondent pas.');
        bouton.disabled = true; bouton.textContent = 'Chiffrement en cours…';
        var code = await App.session.initialiser({ nom: nom.value, login: login.value, motDePasse: mdp.value });
        if (demo.checked) { bouton.textContent = 'Chargement des données fictives…'; await SIC.chargerDemo(App.session); }
        afficherCodeSecours(code, true);
      } catch (e) { bouton.disabled = false; bouton.textContent = 'Initialiser le dossier'; erreurDans(zoneErr, e); }
    } },
      h('h1', { text: 'Initialiser le dossier' }),
      h('p', { class: 'muted', text: 'Dossier : ' + App.dossier.nom + '. Ce compte sera cadre de santé et administrateur ; les deux rôles pourront être séparés ensuite.' }),
      zoneErr,
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom affiché', nom), h('label', {}, 'Identifiant', login)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Mot de passe (12 caractères minimum)', mdp), h('label', {}, 'Confirmation', mdp2)),
      h('label', { class: 'case' }, demo, h('span', {}, 'Charger des données fictives de démonstration')),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: changerDossier }, 'Changer de dossier'), bouton));
    return h('div', { class: 'ecran' }, h('div', { class: 'carte' }, marque(), form, SIC.ui.sauvegarde.blocRestaurationCopie(demarrerSession)));
  }

  function afficherCodeSecours(code, premiere) {
    vider(racine);
    var ok = h('input', { type: 'checkbox' });
    var suite = h('button', { class: 'btn primaire', disabled: true, onclick: function () { demarrerMinuteurs(); rendre(); } }, 'Continuer');
    ok.addEventListener('change', function () { suite.disabled = !ok.checked; });
    racine.appendChild(h('div', { class: 'ecran' }, h('div', { class: 'carte' }, marque(),
      h('h1', { text: premiere ? 'Code de secours' : 'Nouveau code de secours' }),
      h('p', { text: 'Ce code permet de récupérer les données si tous les mots de passe et clés de sécurité sont perdus. Il ne sera plus jamais affiché.' }),
      h('div', { class: 'code-secours', text: code }),
      h('p', { class: 'muted', text: 'Imprimez-le ou recopiez-le, puis conservez-le sous enveloppe scellée au coffre. Sans lui, une perte de tous les moyens de déblocage rendrait les données définitivement illisibles.' }),
      h('label', { class: 'case' }, ok, h('span', { text: 'J’ai noté le code de secours et je le conserve en lieu sûr.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: function () { window.print(); } }, 'Imprimer'), suite))));
  }

  // ---------------------------------------------------------------- Connexion
  function ecranConnexion() {
    var zoneErr = h('div');
    if (App.message) { zoneErr.appendChild(h('div', { class: 'info', text: App.message })); App.message = null; }
    var login = h('input', { type: 'text', required: true, autocomplete: 'username' });
    var mdp = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
    var bouton = h('button', { class: 'btn primaire', type: 'submit' }, 'Se connecter');
    var choix = SIC.ui.formation.choixConnexion();
    async function apres(jeu) {
      await SIC.ui.formation.appliquerChoix(jeu);   // données réelles ou mode formation
      demarrerMinuteurs(); rendre();
    }
    var form = h('form', { class: 'pile', onsubmit: async function (ev) {
      ev.preventDefault(); erreurDans(zoneErr, null); bouton.disabled = true; bouton.textContent = 'Déverrouillage…';
      try { await App.session.connexionMotDePasse(login.value, mdp.value); App.mdpProvisoireSaisi = mdp.value; await apres(choix.valeur()); }
      catch (e) { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreurDans(zoneErr, e); }
    } }, h('label', {}, 'Identifiant', login), h('label', {}, 'Mot de passe', mdp), choix, bouton);

    var cles = App.session.coffre.emballages.filter(function (e) { return e.methode === 'cle'; });
    var autres = h('div', { class: 'pile' });
    if (cles.length) {
      var dispo = C.webauthnDisponible();
      autres.appendChild(h('button', { class: 'btn', disabled: !dispo, onclick: async function () {
        erreurDans(zoneErr, null);
        try { await App.session.connexionCleSecurite(); await apres(choix.valeur()); } catch (e) { erreurDans(zoneErr, e); }
      } }, 'Déverrouiller avec une clé de sécurité'));
      if (!dispo) autres.appendChild(h('small', { text: 'Clé de sécurité indisponible : la page doit être servie en HTTPS.' }));
    }
    var code = h('input', { type: 'text', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX', autocomplete: 'off' });
    var blocCode = h('div', { class: 'pile', hidden: true }, h('label', {}, 'Code de secours', code),
      h('button', { class: 'btn', onclick: async function () {
        erreurDans(zoneErr, null);
        try { await App.session.connexionCodeSecours(code.value); App.onglet = 'admin'; await apres('reel'); } catch (e) { erreurDans(zoneErr, e); }
      } }, 'Déverrouiller avec le code de secours'));
    autres.appendChild(h('button', { class: 'btn lien', onclick: function () { blocCode.hidden = !blocCode.hidden; } }, 'Mot de passe perdu ? Utiliser le code de secours'));
    autres.appendChild(blocCode);

    return h('div', { class: 'ecran-pile' }, h('div', { class: 'ecran' }, h('div', { class: 'carte' }, marque(App.dossier.nom), blocAccueil(), zoneErr, form,
      h('div', { class: 'separateur', text: 'secours' }), autres,
      h('div', { class: 'actions' }, SIC.ui.horsReseau.boutonInstaller('btn lien'), h('button', { class: 'btn lien', onclick: changerDossier }, 'Changer de dossier')))));
  }

  /** Première connexion ou mot de passe réinitialisé : changement obligatoire avant tout accès. */
  function ecranMotDePasseObligatoire() {
    var zoneErr = h('div');
    var a = h('input', { type: 'password', required: true, autocomplete: 'new-password' });
    var b = h('input', { type: 'password', required: true, autocomplete: 'new-password' });
    var bouton = h('button', { class: 'btn primaire', type: 'submit' }, 'Enregistrer et continuer');
    var form = h('form', { class: 'pile', onsubmit: async function (ev) {
      ev.preventDefault(); erreurDans(zoneErr, null);
      try {
        verifierNouveauMotDePasse(a.value, b.value);
        if (App.mdpProvisoireSaisi && a.value === App.mdpProvisoireSaisi) throw new Error('Choisissez un mot de passe différent du mot de passe provisoire.');
        bouton.disabled = true; bouton.textContent = 'Chiffrement en cours…';
        await App.session.changerMonMotDePasse(a.value);
        App.mdpProvisoireSaisi = null;
        toast('Mot de passe enregistré.');
        rendre();
      } catch (e) { bouton.disabled = false; bouton.textContent = 'Enregistrer et continuer'; erreurDans(zoneErr, e); }
    } },
      h('h1', { text: 'Choisissez votre mot de passe' }),
      h('p', { text: 'Bonjour ' + App.session.utilisateur.nom + '. Vous vous êtes connecté avec un mot de passe provisoire : vous devez le remplacer par un mot de passe personnel avant de continuer.' }),
      zoneErr,
      h('label', {}, 'Nouveau mot de passe (12 caractères minimum)', a),
      h('label', {}, 'Confirmation', b),
      h('small', { class: 'muted', text: 'Conseil : une courte phrase facile à retenir, par exemple quatre mots séparés par des espaces. Ne la notez pas près du poste.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: function () { App.mdpProvisoireSaisi = null; verrouiller(); } }, 'Se déconnecter'), bouton));
    setTimeout(function () { a.focus(); }, 30);
    return h('div', { class: 'ecran-pile' }, SIC.ui.formation.bandeau(), h('div', { class: 'ecran' }, h('div', { class: 'carte' }, marque(etablissement() || App.dossier.nom), form)));
  }

  function verifierNouveauMotDePasse(a, b) {
    if (a.length < 12) throw new Error('Le mot de passe doit comporter au moins 12 caractères.');
    if (a !== b) throw new Error('Les deux saisies diffèrent.');
    if (/^(.)\1+$/.test(a)) throw new Error('Ce mot de passe est trop simple.');
  }

  /**
   * Ouverture de l'outil : si ce poste a déjà un dossier réseau dont l'accès est encore accordé par le navigateur,
   * il est rouvert directement (invite de connexion) ; sinon, écran d'accueil (« Reprendre » demande l'accès).
   */
  async function demarrer() {
    var prec = null;
    try { prec = await SIC.Dossier.precedent(); } catch (e) { prec = null; }
    if (prec && prec.mode === 'reseau' && prec.handle && prec.handle.queryPermission) {
      try {
        if ((await prec.handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          App.dossier = await SIC.Dossier.rouvrir(prec);
          await demarrerSession();
          return;
        }
      } catch (e) {
        App.dossier = null; App.session = null;
        App.message = 'Le dossier « ' + prec.nom + ' » est inaccessible pour le moment (réseau ou partage indisponible). ' + (e && e.message ? '(' + e.message + ')' : '');
      }
    }
    rendre();
  }

  async function changerDossier() {
    arreterMinuteurs();
    if (App.session) App.session.verrouiller();
    // La copie locale n'a jamais remplacé le dossier habituel retenu ; un poste au choix bloqué garde aussi son dossier (« Reprendre »)
    if (App.secours !== 'local' && !(await SIC.Dossier.lireVerrou())) await SIC.Dossier.oublier();
    App.secours = false;
    App.dossier = null; App.session = null;
    rendre();
  }

  function verrouiller(message) {
    retenirAccueil();
    arreterMinuteurs();
    App.session.verrouiller();
    App.message = message || null;
    rendre();
  }

  // ---------------------------------------------------------------- Minuteurs
  // ---------------------------------------------------------------- Exports
  function telechargerOctets(nom, octets, type) {
    var a = h('a', { href: URL.createObjectURL(new Blob([octets], { type: type || 'application/octet-stream' })), download: nom });
    document.body.appendChild(a); a.click(); a.remove();
  }
  /**
   * Enregistre un export dans le dossier des exports (Administration → Sauvegardes et exports) ;
   * en cas d'échec (droits du partage…), le fichier est téléchargé sur le poste, avec un avertissement.
   */
  async function exporter(categorie, nom, contenu, type, options) {
    var octets = typeof contenu === 'string' ? new TextEncoder().encode(contenu) : contenu;
    try {
      var chemin = await App.session.exporter(categorie, nom, octets, options);
      toast('Enregistré dans le dossier des exports : ' + chemin + ' (bouton « Exports » en haut de l’écran).');
      return chemin;
    } catch (e) {
      telechargerOctets(nom, octets, type);
      toast('Dossier des exports inaccessible (' + (e.message || e) + ') : fichier téléchargé sur ce poste, à ranger sur le réseau de l’établissement.');
      return null;
    }
  }
  var LIB_CATEGORIES_EXPORT = { decomptes: 'Décomptes JLD', registres: 'Registres', statistiques: 'Statistiques', communication: 'Registre pour communication', patients: 'Droit d’accès', archives: 'Archives annuelles', reglages: 'Réglages' };
  function typeFichier(nom) { return /\.pdf$/i.test(nom) ? 'application/pdf' : /\.csv$/i.test(nom) ? 'text/csv;charset=utf-8' : /\.json$/i.test(nom) ? 'application/json' : 'application/octet-stream'; }
  function taille(o) { return o < 1024 ? o + ' o' : o < 1048576 ? Math.round(o / 1024) + ' Ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }

  /** Raccourci Windows (.url) vers un dossier réseau : à garder sur le bureau, il ouvre l'Explorateur sur ce dossier. */
  function urlFichier(cheminWindows) {
    var c = cheminWindows.replace(/\\/g, '/');
    var url = /^\/\//.test(c) ? 'file:' + c : 'file:///' + c;
    return url.split('/').map(function (x, i) { return i < 1 || /:$/.test(x) ? x : encodeURIComponent(x).replace(/%24/g, '$'); }).join('/');
  }

  /** Dossiers d'exports visibles par l'agent : ses services ; « Etablissement » si son rôle couvre plusieurs services. */
  function dossiersExportsVisibles() {
    var s = App.session, tous = droits().voitTousServices(s.roles(), config());
    var vis = {};
    (tous ? tousServices() : services()).forEach(function (x) { vis[X.dossierExportService(x.code)] = x.libelle; });
    if (tous || s.peut('STATS') || s.peut('EXPORT_PATIENT') || s.peut('CONFIG')) vis[X.DOSSIER_ETABLISSEMENT] = 'Établissement (plusieurs services)';
    return { libelles: vis, tous: tous };
  }

  /** Fenêtre « Exports » : fichiers du dossier des exports (services de l'agent), à ouvrir, télécharger ou (administrateur) supprimer. */
  function modaleExports() {
    var s = App.session, zone = h('div', { class: 'pile' }, h('div', { class: 'muted', text: 'Lecture du dossier des exports…' }));
    var vis = dossiersExportsVisibles();
    var filtreSv = h('select', { 'aria-label': 'Service', class: 'champ-moyen' }, h('option', { value: '', text: 'Tous mes services' }), Object.keys(vis.libelles).map(function (k) { return h('option', { value: k, text: vis.libelles[k], selected: App.service !== '*' && X.dossierExportService(App.service) === k }); }));
    var filtre = h('select', { 'aria-label': 'Catégorie', class: 'champ-moyen' }, h('option', { value: '', text: 'Toutes les catégories' }), Object.keys(LIB_CATEGORIES_EXPORT).map(function (k) { return h('option', { value: k, text: LIB_CATEGORIES_EXPORT[k] }); }));
    var cherche = h('input', { type: 'search', placeholder: 'Rechercher un fichier', class: 'champ-moyen' });
    var zoneChemin = h('div', { class: 'pile' });
    var liste = [];
    /** Service et catégorie d'un fichier : exports/<service>/<catégorie>/fichier ; ancien rangement exports/<catégorie>/fichier. */
    function parts(f) {
      var p = f.categorie.split('/');
      if (p.length >= 2) return { service: p[0], categorie: p[1] };
      return { service: '', categorie: p[0] };   // ancien rangement, sans service
    }
    function majChemin() {
      vider(zoneChemin);
      var sous = filtreSv.value ? [filtreSv.value] : [];
      var chemin = X.cheminWindowsExports(config(), sous);
      if (!chemin) {
        zoneChemin.appendChild(h('small', { class: 'muted', text: s.peut('CONFIG') ? 'Pour proposer un accès direct au dossier depuis Windows, renseignez le chemin réseau du dossier des données (Administration → Sauvegardes et exports → Dossier des exports).' : 'Accès direct au dossier depuis Windows : demandez à l’administrateur de renseigner le chemin réseau.' }));
        return;
      }
      var nomRaccourci = 'Exports isolement-contention' + (filtreSv.value ? ' - ' + filtreSv.value : '');
      zoneChemin.appendChild(h('div', { class: 'recap' },
        h('div', {}, 'Dossier Windows : ', h('span', { class: 'mono', text: chemin })),
        h('div', { class: 'actions gauche' },
          h('button', { class: 'btn petit', type: 'button', onclick: async function () {
            try { await navigator.clipboard.writeText(chemin); toast('Chemin copié : collez-le dans la barre d’adresse de l’Explorateur Windows.'); }
            catch (e) { prompt('Copiez ce chemin :', chemin); }
          } }, 'Copier le chemin'),
          location.protocol === 'file:' ? h('a', { class: 'btn petit', href: urlFichier(chemin), target: '_blank' }, 'Ouvrir le dossier') : null),
        // Raccourci créé par Windows : un fichier .url téléchargé est bloqué par Edge et Chrome (type de fichier jugé dangereux).
        h('details', { class: 'pile' }, h('summary', { text: 'Créer un raccourci sur le bureau (une fois par poste)' }),
          h('ol', {},
            h('li', { text: 'Cliquez sur « Copier le chemin » ci-dessus.' }),
            h('li', { text: 'Sur le bureau Windows, clic droit → Nouveau → Raccourci.' }),
            h('li', { text: 'Collez le chemin (Ctrl + V) dans « Entrez l’emplacement de l’élément », puis cliquez sur Suivant.' }),
            h('li', { text: 'Nommez le raccourci « ' + nomRaccourci + ' », puis cliquez sur Terminer.' }))),
        h('small', { class: 'muted', text: 'Un navigateur ne peut pas ouvrir lui-même l’Explorateur Windows : copiez le chemin dans la barre d’adresse de l’Explorateur, ou créez une fois le raccourci sur le bureau. Le service informatique peut aussi déployer ce raccourci sur les postes par stratégie de groupe.' })));
    }
    function dessiner() {
      var q = cherche.value.trim().toLowerCase();
      var vus = liste.filter(function (f) {
        var x = parts(f);
        if (!(x.service ? vis.libelles[x.service] !== undefined : vis.tous)) return false;   // fichiers des autres services masqués
        return (!filtreSv.value || x.service === filtreSv.value) && (!filtre.value || x.categorie === filtre.value) && (!q || f.nom.toLowerCase().indexOf(q) >= 0);
      });
      vider(zone);
      if (!vus.length) { zone.appendChild(h('div', { class: 'vide', text: liste.length ? 'Aucun fichier ne correspond.' : 'Aucun export pour le moment.' })); return; }
      zone.appendChild(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Enregistré le', 'Service', 'Catégorie', 'Fichier', 'Taille', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, vus.slice(0, 300).map(function (f) {
          var x = parts(f);
          return h('tr', {},
            h('td', { class: 'nowrap', text: date(f.modifieLe) }),
            h('td', { text: x.service ? (vis.libelles[x.service] || x.service) : '—' }),
            h('td', { text: LIB_CATEGORIES_EXPORT[x.categorie] || x.categorie || '—' }),
            h('td', { class: 'mono', text: f.nom }),
            h('td', { class: 'nowrap', text: taille(f.taille) }),
            h('td', { class: 'actions-ligne' },
              /\.pdf$/i.test(f.nom) ? h('button', { class: 'btn petit', type: 'button', onclick: async function () {
                var w = window.open('', '_blank');
                try { var o = await s.lireExport(f.chemin); var url = URL.createObjectURL(new Blob([o], { type: 'application/pdf' })); if (w) w.location = url; else telechargerOctets(f.nom, o, 'application/pdf'); }
                catch (e) { if (w) w.close(); alert(e.message); }
              } }, 'Ouvrir') : null, ' ',
              h('button', { class: 'btn petit', type: 'button', title: 'Copie sur ce poste (à ne pas conserver hors du réseau de l’établissement)', onclick: async function () {
                try { telechargerOctets(f.nom, await s.lireExport(f.chemin), typeFichier(f.nom)); } catch (e) { alert(e.message); }
              } }, 'Télécharger'), ' ',
              s.peut('CONFIG') ? h('button', { class: 'btn petit danger', type: 'button', onclick: async function () {
                if (!confirm('Supprimer définitivement « ' + f.nom + ' » du dossier des exports ? La suppression est tracée au journal.')) return;
                try { await s.supprimerExport(f.chemin); liste = liste.filter(function (y) { return y !== f; }); dessiner(); toast('Fichier supprimé.'); } catch (e) { alert(e.message); }
              } }, 'Supprimer') : null));
        })))));
      if (vus.length > 300) zone.appendChild(h('small', { class: 'muted', text: 'Affichage limité aux 300 fichiers les plus récents.' }));
    }
    filtreSv.addEventListener('change', function () { dessiner(); majChemin(); });
    filtre.addEventListener('change', dessiner); cherche.addEventListener('input', dessiner);
    majChemin();
    s.listerExports().then(function (l) { liste = l; dessiner(); }).catch(function (e) { vider(zone).appendChild(h('div', { class: 'erreur', text: e.message })); });
    var dossier = X.dossierExports(config()), nomDossier = App.dossier && App.dossier.handle && App.dossier.handle.name;
    modale('Exports', h('div', { class: 'pile' },
      X.optionsExports(config()).conservationJours ? h('p', { class: 'muted', text: 'Durée de conservation fixée par l’établissement : ' + X.optionsExports(config()).conservationJours + ' jours ; les fichiers plus anciens sont supprimés automatiquement.' }) : null,
      h('p', { class: 'muted', text: 'Les décomptes, registres, statistiques et autres exports sont enregistrés automatiquement dans le dossier « ' + dossier + ' »' + (nomDossier ? ' du dossier des données (« ' + nomDossier + ' »)' : '') + (App.session.formation ? ', jeu de formation' : '') + ', un sous-dossier par service. Vous voyez les fichiers de vos services. Ils contiennent des données nominatives : ne les copiez pas hors du réseau de l’établissement.' }),
      zoneChemin,
      h('div', { class: 'actions gauche' }, filtreSv, filtre, cherche),
      zone), [{ texte: 'Fermer' }], { large: true });
  }

  // ---------------------------------------------------------------- Thème clair / sombre
  /** Thème affiché : choix de l'agent (attribut data-theme) ou, à défaut, celui du système. */
  function themeActuel() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function appliquerTheme(t) {
    if (t !== 'light' && t !== 'dark') return;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sic-theme', t); } catch (e) { /* stockage indisponible */ }
    var b = document.getElementById('bouton-theme');
    if (b) majBoutonTheme(b);
  }
  function majBoutonTheme(b) {
    var sombre = themeActuel() === 'dark';
    b.textContent = sombre ? '☀ Clair' : '☾ Sombre';
    b.setAttribute('aria-pressed', sombre ? 'true' : 'false');
    b.title = sombre ? 'Passer à l’affichage clair (choix mémorisé pour votre compte)' : 'Passer à l’affichage sombre (choix mémorisé pour votre compte)';
  }
  function boutonTheme() {
    var b = h('button', { id: 'bouton-theme', class: 'btn petit theme', type: 'button', onclick: function () {
      var t = themeActuel() === 'dark' ? 'light' : 'dark';
      appliquerTheme(t);
      if (App.session && App.session.utilisateur) App.session.enregistrerPreference('theme', t).catch(function () { toast('Thème appliqué sur ce poste ; il n’a pas pu être enregistré pour votre compte.'); });
    } });
    majBoutonTheme(b);
    return b;
  }
  /** Après la connexion : thème enregistré pour l'agent (s'il en a choisi un). */
  function chargerPreferences() {
    var s = App.session;
    if (!s || !s.lirePreferences) return;
    s.lirePreferences().then(function (p) { if (p && p.theme) appliquerTheme(p.theme); }).catch(function () { /* thème du poste */ });
  }

  /** Purge automatique des exports (règle de l'administrateur), une fois par jour et par poste. */
  function purgeAutomatique() {
    var s = App.session;
    if (!s || !s.etat || !X.optionsExports(s.etat.config).conservationJours) return;
    var cle = 'sic-purge-exports' + (s.formation ? '-formation' : ''), jour = M.dateLocaleISO(Date.now());
    try { if (localStorage.getItem(cle) === jour) return; localStorage.setItem(cle, jour); } catch (e) { /* stockage indisponible : purge à chaque connexion */ }
    s.purgerExports().then(function (f) { if (f.length) toast(f.length + ' ancien(s) export(s) supprimé(s) selon la durée de conservation de l’établissement.'); }).catch(function () { /* nouvelle tentative au prochain jour */ });
  }

  function demarrerMinuteurs() {
    chargerPreferences();
    try { SIC.ui.verrou.appliquer(); } catch (e) { /* sans effet sur la session */ }
    try { SIC.ui.miroir.demarrer(); } catch (e) { /* sans effet sur la session */ }
    retenirAccueil();
    setTimeout(purgeAutomatique, 4000);
    arreterMinuteurs();
    App.derniereActivite = Date.now();
    App.minuteurs.push(setInterval(function () {
      if (App.session && App.session.cle && document.visibilityState === 'visible') App.session.synchroniser().catch(function () {});
    }, 5000));
    setTimeout(function () { SIC.ui.sauvegarde.controler(); }, 1500);   // contrôle d'intégrité à la connexion, puis toutes les 15 min
    App.minuteurs.push(setInterval(function () { if (App.session && App.session.cle) SIC.ui.sauvegarde.controler(); }, 15 * 60000));
    App.minuteurs.push(setInterval(function () {   // heures relatives (« dans 3 h ») et échéances qui changent de couleur
      if (App.session && App.session.cle && document.visibilityState === 'visible' && !saisieEnCours() && !estOngletAdmin(App.onglet)) rendreContenu();
    }, 60000));
    App.minuteurs.push(setInterval(function () {
      var limite = (config().inactiviteMinutes || 10) * 60000;
      if (App.session && App.session.cle && Date.now() - App.derniereActivite > limite) verrouiller('Session verrouillée après ' + (config().inactiviteMinutes || 10) + ' minutes d’inactivité.');
    }, 15000));
  }
  function arreterMinuteurs() { App.minuteurs.forEach(clearInterval); App.minuteurs = []; if (SIC.ui.miroir) SIC.ui.miroir.arreter(); }
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { App.derniereActivite = Date.now(); }, true); });

  // ================================================================ Application
  var zoneContenu = null, zoneEntete = null;

  // ---------------------------------------------------------------- Fenêtres des modules (décision du 7 novembre 2026)
  // Une fenêtre par module, avec ses propres onglets ; une barre en bas de l'écran pour passer de l'une à l'autre,
  // chaque module avec son icône. Patients et Administration ont leur fenêtre ; le journal est un onglet de chacune.
  var NS_SVG = 'http://www.w3.org/2000/svg';
  // Icônes dessinées au trait (24 × 24), couleur du texte
  var ICONES = {
    patients: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1', 'M16 3.5a4 4 0 0 1 0 7', 'M19 14.5a6 6 0 0 1 3 5.5v1'],
    isocont: ['M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16', 'M2 21h20', 'M9 10h6v6H9z', 'M12 13v1'],
    agenda: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4', 'M7 14h3v3H7z'],
    admin: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    vehicules: ['M5 17h14v-5l-2-5H7l-2 5z', 'M3 12h18', 'M7 17v2', 'M17 17v2', 'M7.5 14.5h1', 'M15.5 14.5h1'],
    module: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z']
  };
  function icone(id) {
    var svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icone-module'); svg.setAttribute('aria-hidden', 'true');
    (ICONES[id] || ICONES.module).forEach(function (d) { var p = document.createElementNS(NS_SVG, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    return svg;
  }
  /** Fenêtres ouvertes à l'agent : Patients (clé détenue), modules accessibles, Administration (administrateur). */
  function fenetres() {
    var s = App.session, res = [];
    if (!s) return res;
    var ms = s.modulesAccessibles();
    if (ms.length && s.detientCle && s.detientCle('patients') && SIC.modules.obtenir('patients')) res.push({ id: 'patients', libelle: 'Patients' });
    ms.forEach(function (m) { res.push({ id: m.id, libelle: m.libelle }); });
    if (s.roles().indexOf('ADMIN') >= 0) res.push({ id: 'admin', libelle: 'Administration' });
    return res;
  }
  /** Onglets de l'administration (décision du 8 novembre 2026) : réglages généraux, puis un onglet par module. */
  function estOngletAdmin(o) { return o === 'admin' || /^admin-/.test(String(o || '')); }
  function modulesAdmin() {
    return [['isocont', 'Isolement et contention'], ['patients', 'Patients'], ['agenda', 'Agenda du service']].filter(function (x) { return SIC.modules.obtenir(x[0]); })
      .concat(SIC.modules.liste().filter(function (m) { return ['isocont', 'patients', 'agenda'].indexOf(m.id) < 0 && m.interface && m.interface.admin && m.interface.admin.onglets; }).map(function (m) { return [m.id, m.libelle]; }));
  }
  /** Onglets de la fenêtre affichée : ceux du module (son contrat), puis le journal commun. */
  function onglets() {
    if (App.fenetre === 'admin') return [['admin', 'Réglages généraux']].concat(modulesAdmin().map(function (x) { return ['admin-' + x[0], x[1]]; }), [['journal', 'Journal']]);
    var id = App.fenetre === 'patients' ? 'patients' : (App.session ? App.session.moduleAffiche() : null);
    var m = id && SIC.modules.obtenir(id);
    return (m ? m.vues.onglets : SIC.modules.onglets(null)).map(function (o) { return [o.code, o.libelle]; }).concat([['journal', 'Journal']]);
  }
  App.ongletsFenetres = {};
  /** Ouvre la fenêtre d'un module : son dernier onglet affiché, sinon le premier ; choix retenu sur le poste. */
  function ouvrirFenetre(id) {
    var s = App.session;
    if (App.fenetre) App.ongletsFenetres[App.fenetre] = App.onglet;
    if (id !== 'patients' && id !== 'admin' && !s.choisirModule(id)) return;
    App.fenetre = id;
    try { localStorage.setItem('sic-fenetre', id); if (id !== 'patients' && id !== 'admin') localStorage.setItem('sic-module', id); } catch (e) { /* stockage indisponible */ }
    var codes = onglets().map(function (o) { return o[0]; });
    App.onglet = codes.indexOf(App.ongletsFenetres[id]) >= 0 ? App.ongletsFenetres[id] : codes[0];
    rendreContenu();
  }
  // Ancien nom (liens internes) : ouvrir le module, c'est ouvrir sa fenêtre
  function ouvrirModule(id) { ouvrirFenetre(id); }
  /** Barre des modules, en bas de l'écran. */
  function barreModules() {
    var fs = fenetres();
    if (fs.length < 2) return null;
    return h('nav', { class: 'barre-modules', 'aria-label': 'Modules' }, fs.map(function (f) {
      var actif = f.id === App.fenetre;
      var m = SIC.modules.obtenir(f.id), n = m && m.interface && m.interface.pastille ? m.interface.pastille() : 0;
      return h('button', { type: 'button', class: 'bouton-module' + (actif ? ' actif' : ''), 'aria-current': actif ? 'page' : null, title: f.libelle + (n ? ' — ' + n + ' information(s) pour vous' : ''), onclick: function () { ouvrirFenetre(f.id); } },
        icone(f.id), h('span', { text: f.libelle }), n ? h('span', { class: 'pastille', text: String(n) }) : null);
    }));
  }
  /** Fenêtre affichée : bandeau de titre et onglets propres au module. */
  function titreFenetre() {
    var f = fenetres().filter(function (x) { return x.id === App.fenetre; })[0] || { id: App.fenetre, libelle: (SIC.modules.obtenir(App.fenetre) || {}).libelle || '' };
    return h('div', { class: 'fenetre-titre' }, icone(f.id), h('b', { text: f.libelle }));
  }

  /** Liste « Affichage » de l'en-tête (administrateur) : voir l'outil comme un agent portant un autre rôle. */
  function selApercu(s) {
    if ((s.utilisateur.roles || []).indexOf('ADMIN') < 0) return null;
    var sel = h('select', { 'aria-label': 'Affichage selon le rôle', title: 'Voir l’outil comme un agent portant ce rôle (aucune saisie n’est enregistrée pendant l’aperçu)', onchange: function () {
      try { s.definirApercu(sel.value || null); } catch (e) { alert(e.message); }
      if (s.apercu && App.fenetre === 'admin') { App.fenetre = s.moduleAffiche(); App.onglet = onglets()[0][0]; }
      rendreContenu();
    } }, h('option', { value: '', text: 'Affichage : le mien' }),
      droits().rolesConfig(config()).filter(function (r) { return !r.admin; }).map(function (r) { return h('option', { value: r.code, text: 'Affichage : ' + r.libelle, selected: !!s.apercu && s.apercu.code === r.code }); }));
    return sel;
  }

  function ecranApplication() {
    zoneEntete = h('header', { class: 'entete' });
    zoneContenu = h('main', { id: 'contenu' });
    var frag = h('div', {}, zoneEntete, zoneContenu);
    rendreContenu();
    return frag;
  }

  // ---------------------------------------------------------------- Actualisation sans perte de position
  /** Vrai si l'agent est en train de saisir dans la page (champ actif, hors fenêtre). */
  function saisieEnCours() {
    var a = document.activeElement;
    return !!(a && zoneContenu && zoneContenu.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }
  function signalerAttente() {
    var b = document.getElementById('actualisation-attente');
    if (b) b.hidden = !App.miseAJourEnAttente;
  }
  /** Après une synchronisation ou une saisie : n'actualise que ce qui doit l'être, sans ramener la page en haut. */
  function apresNotification(info) {
    if (info && info.source === 'synchro' && !info.nouveaux) { majStatutSynchro(); return; }
    if (info && info.source === 'synchro' && (estOngletAdmin(App.onglet) || saisieEnCours())) {
      // Saisies arrivées d'un autre poste pendant une saisie ou un paramétrage : on ne touche pas au formulaire.
      App.miseAJourEnAttente = true; signalerAttente(); majStatutSynchro(); return;
    }
    rendreContenu();
  }
  function majStatutSynchro() {
    var z = zoneEntete && zoneEntete.querySelector('.statut-synchro');
    if (z && App.session) z.title = App.session.evts.length + ' saisies dans le journal — dernière synchronisation à ' + new Date(App.session.derniereSynchro || Date.now()).toLocaleTimeString('fr-FR');
  }
  document.addEventListener('focusout', function () {
    // Fin de la saisie : appliquer les nouveautés en attente (sauf en administration, où l'agent choisit).
    setTimeout(function () { if (App.miseAJourEnAttente && !estOngletAdmin(App.onglet) && !saisieEnCours() && App.session && App.session.cle) rendreContenu(); }, 300);
  });

  var vueAffichee = null;
  function rendreContenu() {
    if (!zoneContenu || !document.body.contains(zoneContenu)) return;
    // Même onglet : on garde la position de défilement de la page et des tableaux
    var cleVue = App.onglet + '|' + App.service + (estOngletAdmin(App.onglet) ? '|' + App.sousOngletAdmin : '');
    var memeVue = vueAffichee === cleVue;
    var pos = memeVue ? { x: window.scrollX, y: window.scrollY, h: zoneContenu.offsetHeight, zones: Array.prototype.map.call(zoneContenu.querySelectorAll('.table-wrap, .apercu-document, .apercu-registre'), function (z) { return [z.scrollLeft, z.scrollTop]; }) } : null;
    rendreContenuBrut();
    vueAffichee = App.onglet + '|' + App.service + (estOngletAdmin(App.onglet) ? '|' + App.sousOngletAdmin : '');
    App.miseAJourEnAttente = false; signalerAttente();
    if (pos) {
      zoneContenu.querySelectorAll('.table-wrap, .apercu-document, .apercu-registre').forEach(function (z, i) { if (pos.zones[i]) { z.scrollLeft = pos.zones[i][0]; z.scrollTop = pos.zones[i][1]; } });
      window.scrollTo(pos.x, pos.y);
      zoneContenu.style.minHeight = '';
    } else { zoneContenu.style.minHeight = ''; window.scrollTo(0, 0); }
  }

  function rendreContenuBrut() {
    if (!zoneContenu || !document.body.contains(zoneContenu)) return;
    var s = App.session;
    var focus = document.activeElement && document.activeElement.closest && document.activeElement.closest('dialog');
    if (focus) return; // ne pas reconstruire derrière une fenêtre ouverte
    if (s.utilisateur && s.utilisateur.mdpProvisoire) return rendre();
    // Journaux en cours de relecture (clés reçues, jeu de formation ouvert ou fermé) : attente, puis affichage
    if (!s.etat) {
      vider(zoneContenu).appendChild(h('div', { class: 'panneau vide', text: 'Lecture des données en cours…' }));
      s.synchroniser().catch(function () {});
      return;
    }
    // Module affiché retenu sur le poste (étape 6) ; un module devenu inaccessible ramène au module principal
    if (s.moduleChoisi === undefined) { try { s.choisirModule(localStorage.getItem('sic-module') || ''); } catch (e) { s.moduleChoisi = null; } }
    else if (s.moduleChoisi && !s.modulesAccessibles().some(function (m) { return m.id === s.moduleChoisi; })) s.choisirModule(null);
    var maintenant = Date.now();
    var estAdmin = s.roles().indexOf('ADMIN') >= 0;
    // Fenêtre affichée : retenue sur le poste ; l'administration ouverte depuis un lien ouvre sa fenêtre
    var fs = fenetres();
    if (estOngletAdmin(App.onglet) && estAdmin) App.fenetre = 'admin';
    if (!App.fenetre) { try { App.fenetre = localStorage.getItem('sic-fenetre') || ''; } catch (e) { App.fenetre = ''; } }
    if (App.fenetre === 'patients' || App.fenetre === 'admin') { if (!fs.some(function (f) { return f.id === App.fenetre; })) App.fenetre = ''; }
    else if (App.fenetre !== s.moduleAffiche()) App.fenetre = '';
    if (!App.fenetre) App.fenetre = s.moduleAffiche();
    if (estOngletAdmin(App.onglet) && App.fenetre !== 'admin') App.onglet = '';
    var nivJournal = droits().niveauJournal(s.roles(), config());
    // Rôle « registre seulement » : un seul onglet, le registre tel qu'il s'affiche habituellement
    var anonyme = droits().registreSeul(s.roles(), config());
    // Onglets affichés : réglage des rôles (Rôles et accès), journal selon son niveau, administration pour l'administrateur
    // Onglets réservés à un droit (ex. « Tâches du service » : régler les tâches), déclarés par le module affiché
    var droitOnglet = {};
    SIC.modules.onglets(s.moduleAffiche()).forEach(function (o) { if (o.droit) droitOnglet[o.code] = o.droit; });
    function affichable(o) {
      if (estOngletAdmin(o)) return estAdmin;
      if (droitOnglet[o] && !estAdmin && ![].concat(droitOnglet[o]).some(function (t) { return s.peut(t); })) return false;
      if (o === 'journal') return nivJournal !== 'aucun' && !anonyme;
      if (anonyme) return o === 'registre';
      return droits().ongletVisible(s.roles(), config(), o);
    }
    if (!affichable(App.onglet)) App.onglet = (onglets().filter(function (o) { return affichable(o[0]); })[0] || ['aucun'])[0];
    var conflits = nivJournal === 'aucun' ? 0 : conflitsVisibles().length;
    // Pages de tableaux : toute la largeur de l'écran (les pages de réglage gardent une largeur de lecture)
    zoneContenu.classList.toggle('large', ['tableau', 'mesures', 'patients', 'fiches', 'agenda', 'mon-agenda', 'jld', 'surveillance', 'registre', 'journal', 'stats'].indexOf(App.onglet) >= 0);
    if (!s.utilisateur.actif) return verrouiller('Votre compte a été désactivé.');
    var mesSv = services();
    if (App.service !== '*' && !mesSv.some(function (x) { return x.code === App.service; })) App.service = '*';
    if (mesSv.length === 1) App.service = mesSv[0].code;

    // En-tête
    vider(zoneEntete);
    var bandeau = SIC.ui.formation.bandeau();
    if (bandeau) zoneEntete.appendChild(bandeau);
    document.body.classList.toggle('en-formation', !!s.formation);
    var selService = h('select', { 'aria-label': 'Service', onchange: function () { App.service = selService.value; try { localStorage.setItem('sic-service', App.service); } catch (e) { /* */ } rendreContenu(); } },
      mesSv.length > 1 ? h('option', { value: '*', text: estAdmin ? 'Tous les services' : 'Tous mes services' }) : null,
      mesSv.map(function (x) { return h('option', { value: x.code, text: x.libelle + (droits().serviceActif(config(), x.code) ? '' : ' — consultation seule'), selected: App.service === x.code }); }));
    if (App.service === '*') selService.value = '*';
    var age = s.derniereSynchro ? Math.round((maintenant - s.derniereSynchro) / 1000) : null;
    zoneEntete.appendChild(h('div', { class: 'entete-haut' }, marque(etablissement() || App.dossier.nom), h('div', { class: 'espace' }), mesSv.length ? selService : null,
      h('div', { class: 'statut-synchro', title: s.evts.length + ' saisies dans le journal' }, h('span', { class: 'point' }), age !== null ? 'Synchronisé' : '—'),
      h('div', { class: 'utilisateur' }, h('b', { text: s.utilisateur.nom }), s.utilisateur.roles.map(function (r) { return droits().libRole(config(), r); }).join(' · ')),
      selApercu(s),
      s.utilisateur.id !== 'secours' ? h('button', { class: 'btn petit', onclick: modaleMonMotDePasse }, 'Mot de passe') : null,
      anonyme ? null : h('button', { class: 'btn petit', title: 'Fichiers exportés (décomptes, registres, statistiques…)', onclick: modaleExports }, 'Exports'),
      SIC.ui.horsReseau.boutonInstaller(),
      boutonTheme(),
      h('button', { class: 'btn petit', title: 'Licence, crédits, signaler un problème', onclick: function () { SIC.ui.apropos.modale(); } }, 'À propos'),
      h('button', { class: 'btn petit', onclick: function () { verrouiller(); } }, 'Verrouiller')));
    zoneEntete.appendChild(h('div', { id: 'actualisation-attente', class: 'actualisation-attente', hidden: !App.miseAJourEnAttente },
      'Nouvelles saisies depuis un autre poste. ',
      h('button', { class: 'btn petit primaire', onclick: function () { rendreContenu(); } }, 'Actualiser'),
      estOngletAdmin(App.onglet) ? h('small', { text: ' (les modifications non enregistrées de cette page seront perdues)' }) : null));
    if (s.apercu) zoneEntete.appendChild(h('div', { class: 'bandeau-apercu', role: 'status' },
      h('span', { text: 'Aperçu de l’affichage du rôle « ' + s.apercu.libelle + ' », sur tous les services : aucune saisie n’est enregistrée. Choisissez un service dans la liste pour voir ce qu’un agent de ce service voit.' }),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { s.definirApercu(null); rendreContenu(); } }, 'Revenir à mon affichage')));
    var bl = SIC.ui.miroir.bandeauLocal(); if (bl) zoneEntete.appendChild(bl);
    var ea = s.etatAttestation && s.etatAttestation();
    if (ea && ea.attestateur && !s.formation && ea.anomalies.some(function (x) { return x.bloquante; })) zoneEntete.appendChild(h('div', { class: 'bandeau-secours', role: 'alert' },
      h('span', { text: 'Coffre modifié hors de l’outil ou restauré : aucune remise de clé avant réparation. ' }),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { App.onglet = 'admin'; App.sousOngletAdmin = 'comptes'; rendreContenu(); } }, 'Voir')));
    var nav = h('nav', { class: 'onglets', 'aria-label': 'Sections' });
    onglets().forEach(function (o) {
      if (!affichable(o[0])) return;
      nav.appendChild(h('button', { 'aria-current': App.onglet === o[0] ? 'page' : null, onclick: function () { App.onglet = o[0]; rendreContenu(); } },
        lieu(o[1]), o[0] === 'journal' && conflits ? h('span', { class: 'pastille', text: conflits }) : null));
    });
    var barre = barreModules();
    document.body.classList.toggle('avec-barre-modules', !!barre);
    if (barre) zoneEntete.appendChild(barre);

    zoneContenu.style.minHeight = zoneContenu.offsetHeight + 'px';   // évite que la page se replie pendant la reconstruction
    vider(zoneContenu);
    var corps = h('div', { class: 'fenetre-corps' });
    zoneContenu.appendChild(h('section', { class: 'fenetre', 'aria-label': 'Fenêtre du module' }, titreFenetre(), nav, corps));
    var vues = { aucun: function () { return h('p', { class: 'muted', text: 'Aucun onglet n’est ouvert à vos rôles : demandez à l’administrateur de vérifier vos accès.' }); }, journal: vueJournal, admin: function () { return vueAdmin('general'); } };
    modulesAdmin().forEach(function (x) { vues['admin-' + x[0]] = function () { return vueAdmin(x[0]); }; });
    var mAff = moduleAffiche(), vuesAff = (mAff.interface && mAff.interface.vues) || {}, vuesModule = interfaceModule().vues || {};
    var mPat = SIC.modules.obtenir('patients'), vuesPat = (mPat && mPat.interface && mPat.interface.vues) || {};
    var vue = vues[App.onglet] || (App.fenetre === 'patients' ? vuesPat[App.onglet] : null) || vuesAff[App.onglet] || vuesModule[App.onglet] || vuesAff[(mAff.vues.onglets[0] || {}).code] || vues.aucun;
    if (App.fenetre !== 'patients' && mAff === moduleActif() && !s.accesModule() && App.onglet !== 'journal' && !estOngletAdmin(App.onglet)) {
      corps.appendChild(h('div', { class: 'panneau vide', text: 'Les données du module « ' + moduleActif().libelle + ' » ne vous sont pas remises : vous n’y avez pas de rôle, ou il n’est activé pour aucun de vos services. Demandez à l’administrateur si vous devez y avoir accès.' }));
      return;
    }
    var affectes = (s.compteEffectif().services || []).filter(function (c) { return tousServices().some(function (x) { return x.code === c; }); });
    if (!mesSv.length && !estAdmin && affectes.length) { corps.appendChild(h('div', { class: 'panneau vide', text: 'Le module « ' + mAff.libelle + ' » n’est activé pour aucun de vos services. Demandez à l’administrateur de vérifier son activation (Administration → Établissement et services).' })); return; }
    if (!mesSv.length && !estAdmin) { corps.appendChild(h('div', { class: 'panneau vide', text: 'Aucun service ne vous est affecté. Demandez à l’administrateur de vous en attribuer un.' })); return; }
    try { corps.appendChild(vue(maintenant)); }
    catch (e) { corps.appendChild(h('div', { class: 'erreur', text: 'Erreur d’affichage : ' + e.message })); console.error(e); }
  }

  // ---------------------------------------------------------------- Journal
  // ---------------------------------------------------------------- Annulation depuis le journal
  function boutonAnnulationJournal(etat, e) {
    var a = N.annulabilite(etat, e);
    if (!a || !App.session.peut(a.droit) || !App.session.peut('ANNULATION')) return null;
    return h('button', { class: 'btn petit', title: a.action === 'retablir' ? 'Annuler cette annulation : la saisie d’origine produit de nouveau son effet' : 'Annuler cette saisie (motif obligatoire ; elle reste au journal)', onclick: function () { modaleAnnulationJournal(e, a); } }, a.action === 'retablir' ? 'Rétablir' : 'Annuler');
  }
  function modaleAnnulationJournal(e, a) {
    var motif = h('textarea', { rows: 2, placeholder: a.action === 'retablir' ? 'Ex. : annulation faite par erreur' : 'Ex. : saisie en double, erreur de patient…' });
    var cible = a.cible;
    var effet = a.action === 'retablir' ? 'La saisie annulée produit de nouveau son effet.' : ((journalDe(cible).effetAnnulation && journalDe(cible).effetAnnulation(cible)) || 'La saisie cesse de produire son effet (échéances, registre et statistiques sont recalculés).');
    modale(a.action === 'retablir' ? 'Rétablir une saisie annulée' : 'Annuler une saisie', h('div', { class: 'pile' },
      h('div', { class: 'recap' },
        h('div', {}, h('b', { text: journalDe(cible).libelleType(cible.type) + ' — ' }), date(Date.parse(cible.at)) + ', ' + App.session.nomAuteur(cible.by)),
        h('div', { text: journalDe(cible).resume(cible) })),
      h('div', { class: 'alerte', text: effet + ' Rien n’est effacé : la saisie et son annulation restent au journal, et l’annulation peut elle-même être annulée.' }),
      h('label', {}, 'Motif (obligatoire)', motif)), [
      { texte: 'Fermer' },
      { texte: a.action === 'retablir' ? 'Rétablir' : 'Annuler la saisie', classe: a.action === 'retablir' ? 'primaire' : 'danger', action: async function () {
        if (!motif.value.trim()) { motif.focus(); throw new Error('Indiquez le motif.'); }
        await App.session.enregistrer('ANNULATION', { cible: e.id, motif: motif.value.trim() });
        toast(a.action === 'retablir' ? 'Saisie rétablie.' : 'Saisie annulée.');
      } }], { focus: motif });
  }

  /** Saisies du journal visibles par l'agent connecté (niveau de ses rôles, Rôles et accès). */
  function journalVisible() { return droits().journalVisible(st().journal, App.session.compteEffectif(), config(), function (e) { return moduleActif().saisies.services(st(), e); }); }
  /** Conflits dont les deux saisies sont visibles par l'agent connecté. */
  function conflitsVisibles() {
    var etat = st();
    if (droits().niveauJournal(App.session.roles(), config()) === 'complet') return etat.conflits;
    var vis = {}; journalVisible().forEach(function (e) { vis[e.id] = 1; });
    return etat.conflits.filter(function (c) { return vis[c.retenu] || vis[c.concurrent]; });
  }

  function vueJournal() {
    var etat = st(), niveau = droits().niveauJournal(App.session.roles(), config());
    if (niveau === 'aucun') return h('p', { class: 'muted', text: 'Le journal n’est pas accessible avec vos rôles.' });
    var visibles = journalVisible(), conflitsV = conflitsVisibles();
    var conflitsIds = {};
    conflitsV.forEach(function (c) { conflitsIds[c.concurrent] = c; conflitsIds[c.retenu] = c; });
    var peutArbitrer = App.session.peut('ANNULATION');
    var blocConflits = conflitsV.length ? h('section', { class: 'panneau' },
      h('h2', { text: 'Saisies en conflit à arbitrer' }),
      h('p', { class: 'muted', text: 'Deux saisies concurrentes portent sur la même donnée. La première est appliquée ; aucune n’est perdue. Choisissez celle à conserver.' }),
      conflitsV.map(function (c) {
        var a = etat.parId[c.retenu], b = etat.parId[c.concurrent];
        function choix(garder, annuler) {
          return h('button', { class: 'btn petit', disabled: !peutArbitrer, onclick: async function () {
            try { await App.session.enregistrer('ANNULATION', { cible: annuler.id, motif: 'Arbitrage de conflit : saisie de ' + App.session.nomAuteur(garder.by) + ' conservée' }); toast('Conflit arbitré.'); }
            catch (e) { alert(e.message); }
          } }, 'Garder');
        }
        return h('div', { class: 'recap' },
          h('div', {}, h('b', { text: 'Appliquée : ' }), journalDe(a).resume(a), ' — ', App.session.nomAuteur(a.by), ' ', choix(a, b)),
          h('div', {}, h('b', { text: 'Concurrente : ' }), journalDe(b).resume(b), ' — ', App.session.nomAuteur(b.by), ' ', choix(b, a)));
      })) : null;
    var complet = niveau === 'complet';
    var manquants = complet && etat.manquants.length ? h('div', { class: 'erreur', text: etat.manquants.length + ' saisie(s) manquante(s) dans le dossier (fichier supprimé ou non encore synchronisé) : ' + etat.manquants.map(function (x) { return x.manque; }).join(', ') + '. Détail, réparation depuis une copie ou prise d’acte : Administration → Sauvegardes et exports.' }) : null;
    var rejetes = complet && App.session.rejetes.length ? h('div', { class: 'erreur', text: App.session.rejetes.length + ' fichier(s) illisible(s) ou altéré(s) ignoré(s) : ' + App.session.rejetes.map(function (r) { return r.nom; }).join(', ') }) : null;

    var lignes = visibles.slice().reverse().slice(0, 400);
    var portee = complet ? null : h('p', { class: 'muted', text: niveau === 'siennes' ? 'Vous voyez vos propres saisies (réglage de vos rôles).' : 'Vous voyez les saisies concernant vos services et vos propres saisies (réglage de vos rôles).' });
    interfaceModule().journal.preparer();
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Journal des saisies' }), h('div', { class: 'espace' }), h('small', { class: 'muted', text: (complet ? etat.journal.length + ' saisies' : visibles.length + ' saisies affichées') + ', chacune dans un fichier chiffré distinct, jamais modifié.' })),
      portee, rejetes, manquants, blocConflits,
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Saisi le', 'Auteur', 'Action', 'Détail', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, lignes.map(function (e) {
          var annule = etat.annules[e.id];
          return h('tr', { class: annule ? 'ancienne' : '' },
            h('td', { class: 'nowrap', text: date(Date.parse(e.at)) }),
            h('td', { text: App.session.nomAuteur(e.by) }),
            h('td', {}, (journalDe(e).action || interfaceModule().journal.action)(e)),
            h('td', {}, journalDe(e).resume(e)),
            h('td', {}, annule ? h('span', { class: 'badge', text: 'annulée' }) : null, conflitsIds[e.id] ? h('span', { class: 'badge bad', text: 'conflit' }) : null),
            h('td', { class: 'actions-ligne' }, boutonAnnulationJournal(etat, e)));
        })))),
      visibles.length > 400 ? h('p', { class: 'muted', text: 'Affichage limité aux 400 saisies les plus récentes.' }) : null);
  }

  // ================================================================ Fenêtres
  function modale(titre, contenu, boutons, options) {
    return new Promise(function (resoudre) {
      var zoneErr = h('div');
      var d = h('dialog', { 'aria-label': titre, class: options && options.large ? 'large' : null });
      function fermer(v) { d.close(); d.remove(); resoudre(v); rendreContenu(); }
      var pied = h('div', { class: 'pied' });
      boutons.forEach(function (b) {
        pied.appendChild(h('button', { class: 'btn ' + (b.classe || ''), type: 'button', onclick: async function (ev) {
          if (!b.action) return fermer(null);
          var bt = ev.currentTarget; bt.disabled = true; erreurDans(zoneErr, null);
          try { var r = await b.action(); if (r !== false) fermer(r === undefined ? true : r); }
          catch (e) { erreurDans(zoneErr, e); zoneErr.scrollIntoView({ block: 'nearest' }); }
          finally { bt.disabled = false; }
        } }, b.texte));
      });
      d.appendChild(h('div', { class: 'tete' }, h('h2', { text: titre }), h('button', { class: 'btn petit', 'aria-label': 'Fermer', onclick: function () { fermer(null); } }, '✕')));
      d.appendChild(h('div', { class: 'corps' }, zoneErr, contenu));
      d.appendChild(pied);
      d.addEventListener('cancel', function (ev) { ev.preventDefault(); fermer(null); });
      document.body.appendChild(d);
      d.showModal();
      if (options && options.focus) setTimeout(function () { options.focus.focus(); }, 30);
    });
  }

  // ---------------------------------------------------------------- Mot de passe
  function modaleMonMotDePasse() {
    var a = h('input', { type: 'password', autocomplete: 'new-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
    var s = App.session, mesCles = (s.coffre.emballages || []).filter(function (e) { return e.methode === 'cle' && e.userId === s.utilisateur.id; }).length;
    var avis = s.coffre.version === 2 && mesCles ? h('p', { class: 'alerte', text: 'Votre clé personnelle sera renouvelée : vos clés de sécurité (' + mesCles + ') seront retirées et seront à réenregistrer.' }) : null;
    modale('Changer mon mot de passe', h('div', { class: 'pile' }, avis, h('label', {}, 'Nouveau mot de passe (12 caractères minimum)', a), h('label', {}, 'Confirmation', b)), [
      { texte: 'Annuler' },
      { texte: 'Changer', classe: 'primaire', action: async function () {
        verifierNouveauMotDePasse(a.value, b.value);
        await App.session.changerMonMotDePasse(a.value);
        toast('Mot de passe modifié.');
      } }], { focus: a });
  }

  // ================================================================ Administration
  function lignesDe(t) { return t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
  function zoneTexte(valeur, lignes) { return h('textarea', { rows: lignes || 4, class: 'mono', spellcheck: 'false' }, valeur); }
  async function enregistrerConfig(changements) {
    var cfg = config(), n = 0;
    for (var i = 0; i < changements.length; i++) {
      if (JSON.stringify(cfg[changements[i][0]]) !== JSON.stringify(changements[i][1])) { await App.session.enregistrer('CONFIG', { cle: changements[i][0], valeur: changements[i][1] }); n++; if (changements[i][0] === 'affichage') retenirAccueil(); }
    }
    toast(n ? 'Paramétrage enregistré (' + n + ' modification' + (n > 1 ? 's' : '') + ').' : 'Aucune modification.');
  }
  function boutonEnregistrer(fn) {
    return h('div', { class: 'actions' }, h('button', { class: 'btn primaire', onclick: async function (ev) {
      var b = ev.currentTarget; b.disabled = true;
      try { await fn(); } catch (err) { alert(err.message); } finally { b.disabled = false; }
    } }, 'Enregistrer'));
  }
  function periodeDepuis(x, l) {
    if (x.length !== 4 || !/^\d\d:\d\d$/.test(x[2]) || !/^\d\d:\d\d$/.test(x[3])) throw new Error('Période mal formée : ' + l);
    return { code: x[0], libelle: x[1], debut: x[2], fin: x[3] };
  }

  function vueAdmin(groupe) {
    groupe = groupe || 'general';
    var s = App.session, cfg = config();
    // -- Migration vers le trousseau de clés (coffre version 1, étape 4)
    var pTrousseau = null;
    if (s.migrationTrousseauPossible() && !s.formation) {
      pTrousseau = h('section', { class: 'panneau' }, h('h2', { text: 'Protection des données : passage au trousseau de clés' }),
        h('p', { text: 'Ce dossier est protégé par une clé unique, détenue par tous les comptes. Le trousseau donne à chaque droit sa propre clé : un agent ne reçoit que les clés de ce à quoi il a droit, et le code de secours ouvre toujours tout.' }),
        h('ul', {},
          h('li', { text: 'Aucune saisie n’est modifiée : l’historique reste lisible comme aujourd’hui ; seules les saisies à venir sont cloisonnées.' }),
          h('li', { text: 'Vous gardez votre mot de passe. Les autres comptes actifs reçoivent un mot de passe provisoire (fiches de remise à imprimer), à changer à leur prochaine connexion.' }),
          h('li', { text: 'Les clés de sécurité (YubiKey) sont à réenregistrer et la copie du coffre sous scellé est à refaire.' }),
          h('li', { text: 'L’ancien coffre reste dans l’historique du coffre : il peut être remis en place depuis cet onglet (« Revenir à la clé unique »), mais les saisies faites après la migration ne seraient plus lisibles.' })),
        h('div', { class: 'actions' }, h('button', { class: 'btn primaire', onclick: function () { modaleMigrationTrousseau(); } }, 'Passer au trousseau…')));
    }
    else if (s.coffre && s.coffre.migreLe && !s.formation && s.utilisateur.id !== 'secours' && (s.utilisateur.roles || []).indexOf('ADMIN') >= 0) {
      pTrousseau = h('section', { class: 'panneau' }, h('h2', { text: 'Trousseau de clés' }),
        h('p', { class: 'muted', text: 'Trousseau en place depuis le ' + date(Date.parse(s.coffre.migreLe)) + '. En cas de difficulté, l’ancien coffre (clé unique) peut être remis en place tant qu’il figure dans l’historique du coffre.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async function () {
          try {
            if (!(await s.retourAvantTrousseauPossible())) throw new Error('L’ancien coffre ne figure plus dans l’historique du coffre.');
            if (!confirm('Revenir à la clé unique ?\n\nLes saisies faites depuis la migration ne seront plus lisibles. Chaque agent se reconnectera avec son mot de passe d’avant la migration ; les mots de passe provisoires et le code de secours créés à la migration ne serviront plus.')) return;
            await s.revenirAvantTrousseau();
            verrouiller('Ancien coffre remis en place : reconnectez-vous avec votre mot de passe d’avant la migration.');
          } catch (err) { alert(err.message); }
        } }, 'Revenir à la clé unique…')));
    }
    var pAttestation = panneauAttestation(s);
    // -- Trousseaux incomplets (coffre version 2) : clés à réémettre
    var incomplets = s.trousseauxIncomplets ? s.trousseauxIncomplets() : [];
    var pIncomplets = incomplets.length || s.erreurDroits ? h('section', { class: 'panneau' }, h('h2', { text: 'Clés à réémettre' }),
      incomplets.length ? h('div', { class: 'alerte', text: incomplets.length + ' compte(s) n’ont pas toutes les clés auxquelles ils ont droit : ' + incomplets.map(function (x) { return x.nom; }).join(', ') + '.' }) : null,
      s.erreurDroits ? h('div', { class: 'alerte', text: 'Dernière mise à jour des clés en échec : ' + s.erreurDroits }) : null,
      h('p', { class: 'muted', text: 'Un compte réactivé reçoit sa clé personnelle à la réinitialisation de son mot de passe. Pour les autres, la réémission remet les clés manquantes selon les droits actuels.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', onclick: async function () {
        try { s.erreurDroits = null; var r = await s.appliquerDroits(); toast(r.change ? 'Clés réémises.' : 'Aucune clé à réémettre.'); rendreContenu(); } catch (err) { alert(err.message); }
      } }, 'Réémettre les clés'))) : null;
    // Trousseau : clés détenues par chaque compte (coffre version 2)
    var resume = s.resumeTrousseau ? s.resumeTrousseau() : null;
    function libCle(n) { if (n === 'plateforme') return 'Plateforme'; var m = SIC.modules.obtenir(n); return m ? m.libelle : n; }
    function celluleCles(c) {
      var x = resume.comptes[c.id];
      if (!c.actif) return h('td', {}, h('small', { class: 'muted', text: '—' }));
      if (!x) return h('td', {}, h('span', { class: 'badge', text: 'aucune : à réémettre' }));
      var ordre = x.cles.slice().sort(function (a, b) { return a === 'plateforme' ? -1 : b === 'plateforme' ? 1 : 0; });
      return h('td', {}, h('small', { text: ordre.map(libCle).join(', ') + (x.maitresses ? ' · clés maîtresses' : '') }));
    }
    var comptes = h('section', { class: 'panneau' }, h('h2', { text: 'Comptes' }),
      resume ? h('p', { class: 'muted', text: 'Trousseau de clés : ' + Object.keys(resume.cles).map(function (n) { return libCle(n) + ' (génération ' + resume.cles[n] + ')'; }).join(' · ') + '. Un agent ne reçoit que les clés de ce à quoi il a droit ; une nouvelle génération est créée à chaque retrait de droit.' }) : null,
      h('p', { class: 'muted', text: 'Un compte peut cumuler plusieurs rôles. Les services affectés limitent ce que l’agent voit, à la connexion comme à la création d’une mesure ; un administrateur voit tous les services.' }),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Nom', 'Identifiant', 'Rôles', 'Services', 'État'].concat(resume ? ['Clés'] : [], ['']).map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, s.comptes.map(function (c) {
          var admin = droits().voitTousServices(c.roles, config());
          return h('tr', { class: c.actif ? '' : 'ancienne' },
            h('td', { text: c.nom }), h('td', { class: 'mono', text: c.login }),
            h('td', { text: c.roles.map(function (r) { return droits().libRole(config(), r); }).join(', ') }),
            h('td', {}, admin ? h('small', { text: c.roles.indexOf('ADMIN') >= 0 ? 'Tous (administrateur)' : 'Tous' }) : ((c.services || []).length ? (c.services || []).map(libService).join(', ') : h('span', { class: 'badge warn', text: 'aucun' }))),
            h('td', {}, h('span', { class: 'badge ' + (c.actif ? 'ok' : ''), text: c.actif ? 'actif' : 'désactivé' }), (function () {
              var v = SIC.comptes.validite(c, Date.now());
              if (!c.actif || !v.temporaire) return null;
              var fin = c.finValidite.split('-').reverse().join('/');
              return h('div', {}, h('span', { class: 'badge ' + (v.expire ? 'bad' : v.bientot ? 'warn' : ''), title: 'Compte temporaire : dernier jour d’accès le ' + fin, text: v.expire ? 'expiré le ' + fin : v.bientot ? 'expire le ' + fin + ' (' + v.jours + ' j)' : 'jusqu’au ' + fin }));
            })(), c.actif && c.mdpProvisoire ? h('div', {}, h('span', { class: 'badge warn', title: 'Le mot de passe sera changé à la prochaine connexion', text: 'mot de passe provisoire' })) : null,
              c.formation === false ? h('div', {}, h('span', { class: 'badge', text: 'sans mode formation' })) : null),
            resume ? celluleCles(c) : null,
            h('td', { class: 'actions-ligne' },
              h('button', { class: 'btn petit', onclick: function () { modaleCompte(c); } }, 'Modifier'), ' ',
              h('button', { class: 'btn petit', onclick: function () { modaleReinit(c); } }, c.actif ? 'Réinitialiser le mot de passe' : 'Réactiver avec un mot de passe')));
        })))),
      (function () {
        var expires = s.comptes.filter(function (c) { return c.actif && SIC.comptes.validite(c, Date.now()).expire; });
        if (!expires.length) return null;
        return h('div', { class: 'alerte' }, expires.length + ' compte(s) temporaire(s) expiré(s) : ' + expires.map(function (c) { return c.nom; }).join(', ') + '. La connexion leur est déjà refusée ; les désactiver retire aussi leur mot de passe du coffre. ',
          h('button', { class: 'btn petit', onclick: async function () {
            if (!confirm('Désactiver ' + expires.length + ' compte(s) expiré(s) ?')) return;
            for (var i = 0; i < expires.length; i++) await s.modifierRoles(expires[i].id, expires[i].roles, false, expires[i].services || []);
            toast('Comptes expirés désactivés.'); rendreContenu();
          } }, 'Désactiver les comptes expirés'));
      })(),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { if (SIC.ui.actions.comptesEnLot) SIC.ui.actions.comptesEnLot(); } }, 'Créer des comptes en lot…'),
        h('button', { class: 'btn primaire', onclick: function () { modaleCompte(null); } }, '+ Nouveau compte')));

    var embs = s.coffre.emballages;
    var webauthn = C.webauthnDisponible();
    var deblocage = h('section', { class: 'panneau' }, h('h2', { text: 'Moyens de déblocage de la clé de données' }),
      h('p', { class: 'muted', text: 'Gardez au moins deux clés de sécurité d’administration (dont une au coffre) et le code de secours papier. Une clé est liée à l’adresse du site : à enregistrer dans chaque mode de déploiement utilisé.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, embs.map(function (e) {
        var lib = e.methode === 'mdp' ? 'Mot de passe — ' + e.login : e.methode === 'cle' ? (e.libelle || 'Clé de sécurité') + ' — ' + s.nomAuteur(e.userId) + ' — ' + e.rpId : 'Code de secours papier';
        return h('tr', {}, h('td', {}, h('span', { class: 'badge', text: e.methode === 'mdp' ? 'mot de passe' : e.methode === 'cle' ? 'clé de sécurité' : 'secours' })), h('td', { text: lib }),
          h('td', { class: 'actions-ligne' }, e.methode === 'cle' ? h('button', { class: 'btn petit danger', onclick: async function () {
            // Trousseau : sa propre clé → mot de passe demandé, clé personnelle renouvelée (une clé perdue ne sert plus)
            if (s.coffre.version === 2 && e.userId && e.userId === s.utilisateur.id) {
              var mdp = h('input', { type: 'password', autocomplete: 'current-password' });
              modale('Retirer ma clé de sécurité', h('div', { class: 'pile' },
                h('p', { text: 'Votre clé personnelle sera renouvelée : la clé retirée n’ouvrira plus rien, même retrouvée. Vos autres clés de sécurité seront aussi à réenregistrer.' }),
                h('label', {}, 'Votre mot de passe', mdp)),
                [{ texte: 'Annuler' }, { texte: 'Retirer', classe: 'danger', action: async function () { await s.retirerEmballage(e.id, mdp.value); toast('Clé retirée, clé personnelle renouvelée.'); } }], { focus: mdp });
              return;
            }
            if (!confirm(e.userId ? 'Retirer cette clé de sécurité ?' : 'Retirer cette clé de sécurité de secours ?\n\nSi elle est perdue, renouvelez aussi le code de secours : la clé retrouvée ouvrirait encore la clé de secours d’une ancienne version du coffre.')) return;
            try { await s.retirerEmballage(e.id); toast('Clé retirée.'); } catch (err) { alert(err.message); }
          } }, 'Retirer') : null));
      })))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: !webauthn, title: webauthn ? '' : 'Disponible uniquement en HTTPS', onclick: async function () {
          var lib = prompt('Nom de cette clé (ex. « YubiKey cadre », « YubiKey coffre ») :', 'YubiKey');
          if (lib === null) return;
          try { await s.ajouterCleSecurite(lib); toast('Clé de sécurité enregistrée.'); } catch (err) { alert(err.message); }
        } }, 'Enregistrer une clé de sécurité'),
        h('button', { class: 'btn', onclick: async function () {
          if (!confirm('Générer un nouveau code de secours ? L’ancien ne fonctionnera plus.')) return;
          try { var code = await s.nouveauCodeSecours(); arreterMinuteurs(); afficherCodeSecours(code, false); } catch (err) { alert(err.message); }
        } }, 'Nouveau code de secours')),
      webauthn ? null : h('small', { class: 'muted', text: 'Les clés de sécurité nécessitent une page servie en HTTPS (GitHub Pages ou intranet).' }));

    // -- Établissement et services
    var etab = h('input', { type: 'text', value: cfg.etablissement || '', placeholder: 'Nom de l’établissement (en-tête des documents imprimés)' });
    var tServices = zoneTexte(tousServices().map(function (x) { return x.code + ' ; ' + x.libelle; }).join('\n'));
    var tLieux = zoneTexte(Object.keys(cfg.lieuxCSI || {}).map(function (k) { return k + ' : ' + cfg.lieuxCSI[k].join(', '); }).join('\n'));
    var tPsy = zoneTexte((cfg.psychiatres || []).join('\n'), 5);
    var pServices = h('section', { class: 'panneau' }, h('h2', { text: 'Établissement et services' }),
      h('label', {}, 'Établissement', etab),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Services (code ; libellé), un par ligne', tServices),
        h('label', {}, lieu('Chambres de soins intensifs (code service : CSI 1, CSI 2)'), tLieux)),
      h('label', {}, 'Psychiatres proposés à la saisie (un par ligne)', tPsy),
      boutonEnregistrer(async function () {
        var svs = lignesDe(tServices).map(function (l) { var x = l.split(';'); if (x.length < 2 || !x[0].trim()) throw new Error('Service mal formé : ' + l); return { code: x[0].trim(), libelle: x.slice(1).join(';').trim() }; });
        var codes = svs.map(function (x) { return x.code; });
        if (codes.some(function (c, i) { return codes.indexOf(c) !== i; })) throw new Error('Deux services portent le même code.');
        var utilises = M.listeMesures(st()).map(function (m) { return m.service; });
        tousServices().forEach(function (x) { if (codes.indexOf(x.code) < 0 && utilises.indexOf(x.code) >= 0) throw new Error('Le service ' + x.code + ' a des mesures : il ne peut pas être supprimé (renommez son libellé).'); });
        var lieux = {}; lignesDe(tLieux).forEach(function (l) { var x = l.split(':'); if (x.length < 2) throw new Error('Lieu mal formé : ' + l); lieux[x[0].trim()] = x.slice(1).join(':').split(',').map(function (v) { return v.trim(); }).filter(Boolean); });
        await enregistrerConfig([['etablissement', etab.value.trim()], ['services', svs], ['lieuxCSI', lieux], ['psychiatres', lignesDe(tPsy)]]);
      }));

    // -- Activation des modules par service (socle, architecture § 5)
    var casesModules = [];
    var tableModules = h('table', {},
      h('thead', {}, h('tr', {}, [h('th', { text: 'Service' })].concat(SIC.modules.affiches().map(function (m) { return h('th', { text: m.libelle }); })))),
      h('tbody', {}, tousServices().map(function (sv) {
        return h('tr', {}, [h('td', { text: sv.libelle + ' (' + sv.code + ')' })].concat(SIC.modules.affiches().map(function (m) {
          var cb = h('input', { type: 'checkbox', checked: m.droits.serviceActif(cfg, sv.code), 'aria-label': m.libelle + ' — ' + sv.libelle });
          casesModules.push({ module: m, service: sv, cb: cb });
          return h('td', {}, h('label', { class: 'case' }, cb, h('span', { text: 'activé' })));
        })));
      })));
    var encadrement = SIC.modules.affiches().map(function (m) { return (m.droits.ROLES_ENCADREMENT || []).map(function (r) { return droits().libRole(cfg, r).toLowerCase(); }); })[0] || [];
    var pModulesServices = h('section', { class: 'panneau' }, h('h2', { text: 'Modules activés par service' }),
      h('p', { class: 'muted', text: 'Un agent voit un module dans un service si le module y est activé, s’il est affecté au service et s’il a un rôle dans le module. Sans réglage, chaque module est activé pour tous les services, y compris ceux créés ensuite ; dès qu’un module est désactivé pour un service, un service créé ensuite doit être activé ici.' }),
      SIC.modules.liste().some(function (m) { return m.reference; }) ? h('p', { class: 'muted', text: 'Les modules de référence (' + SIC.modules.liste().filter(function (m) { return m.reference; }).map(function (m) { return m.libelle; }).join(', ') + ') ne s’activent pas ici : ils suivent les modules qui en dépendent, et leur clé est remise à qui a droit à l’un d’eux.' }) : null,
      h('p', { class: 'muted', text: 'Désactiver un module pour un service : ses données sont conservées, aucune saisie n’est plus possible dans ce service, et seuls ' + (encadrement.length ? encadrement.join(', ') + ' et l’administrateur' : 'l’administrateur') + ' les consultent.' }),
      tousServices().length ? h('div', { class: 'table-wrap' }, tableModules) : h('p', { class: 'muted', text: 'Créez d’abord les services ci-dessus.' }),
      boutonEnregistrer(async function () {
        var valeur = JSON.parse(JSON.stringify(cfg.modulesServices || {})), desactives = [];
        SIC.modules.affiches().forEach(function (m) {
          var lignes = casesModules.filter(function (c) { return c.module === m; });
          var actifs = lignes.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.service.code; });
          lignes.forEach(function (c) { if (!c.cb.checked && m.droits.serviceActif(cfg, c.service.code)) desactives.push(m.libelle + ' — ' + c.service.libelle); });
          if (actifs.length === lignes.length) delete valeur[m.id];       // tous les services : réglage d'origine
          else valeur[m.id] = { tous: false, services: actifs };
        });
        if (desactives.length && !confirm('Désactiver :\n' + desactives.join('\n') + '\n\nLes données sont conservées, mais plus aucune saisie ne sera possible dans ces services ; seuls ' + (encadrement.length ? encadrement.join(', ') + ' et l’administrateur' : 'l’administrateur') + ' les consulteront. Continuer ?')) return;
        await enregistrerConfig([['modulesServices', valeur]]);
      }));

    // -- Fiche patient par service (module Patients, décision du porteur du 7 novembre 2026)
    var lignesFiche = tousServices().map(function (sv) {
      var o = SIC.patients.optionsFiche(cfg, sv.code), r = ((cfg.fichePatient && cfg.fichePatient.services) || {})[sv.code] || {};
      return { sv: sv, psy: h('input', { type: 'checkbox', checked: o.psychiatrie, 'aria-label': 'Service de psychiatrie : ' + sv.libelle }),
        m1: h('input', { type: 'text', maxlength: 60, value: r.medecin1 || '', placeholder: o.medecin1, 'aria-label': 'Libellé du médecin de 1re ligne' }),
        m2: h('input', { type: 'text', maxlength: 60, value: r.medecin2 || '', placeholder: o.medecin2, 'aria-label': 'Libellé du médecin de 2e ligne' }) };
    });
    var pFiche = h('section', { class: 'panneau' }, h('h2', { text: 'Fiche patient par service' }),
      h('p', { class: 'muted', text: 'Service de psychiatrie : la fiche montre le mode d’hospitalisation et la case « patient détenu », et les médecins s’appellent « psychiatres ». Laissez un libellé vide pour garder celui proposé.' }),
      lignesFiche.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Service', 'Psychiatrie', 'Libellé : médecin de 1re ligne', 'Libellé : médecin de 2e ligne'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, lignesFiche.map(function (l) { return h('tr', {}, h('td', { text: l.sv.libelle + ' (' + l.sv.code + ')' }), h('td', {}, l.psy), h('td', {}, l.m1), h('td', {}, l.m2)); })))) : h('p', { class: 'muted', text: 'Créez d’abord les services ci-dessus.' }),
      boutonEnregistrer(async function () {
        var svs = {};
        lignesFiche.forEach(function (l) {
          var r = {};
          if (!l.psy.checked) r.psychiatrie = false;
          if (l.m1.value.trim()) r.medecin1 = l.m1.value.trim();
          if (l.m2.value.trim()) r.medecin2 = l.m2.value.trim();
          if (Object.keys(r).length) svs[l.sv.code] = r;
        });
        await enregistrerConfig([['fichePatient', Object.keys(svs).length ? { services: svs } : {}]]);
      }));

    // -- Dossier des exports
    var tExports = h('input', { type: 'text', maxlength: 120, value: X.dossierExports(cfg), placeholder: 'exports' });
    var oExp = X.optionsExports(cfg);
    var tReseau = h('input', { type: 'text', maxlength: 200, value: oExp.cheminReseau, placeholder: '\\\\serveur\\partage\\TesseraSante' });
    function libConservation(j) { return !j ? 'Aucune purge automatique' : j < 365 ? Math.round(j / 30.5) + ' mois' : Math.round(j / 365.25) + ' an' + (Math.round(j / 365.25) > 1 ? 's' : ''); }
    var selConservation = h('select', {}, X.CONSERVATION_EXPORTS.map(function (j) { return h('option', { value: j, text: libConservation(j), selected: j === oExp.conservationJours }); }));
    var apercuPurge = h('small', { class: 'muted' });
    function majApercuPurge() {
      var j = +selConservation.value;
      if (!j) { apercuPurge.textContent = 'Les exports sont conservés sans limite : à purger manuellement (bouton « Exports », Supprimer).'; return; }
      apercuPurge.textContent = 'Calcul…';
      App.session.purgerExports({ simulation: true, conservationJours: j }).then(function (l) {
        apercuPurge.textContent = l.length ? l.length + ' fichier(s) ont aujourd’hui plus de ' + libConservation(j) + ' et seront supprimés.' : 'Aucun fichier n’a aujourd’hui plus de ' + libConservation(j) + '.';
      }).catch(function () { apercuPurge.textContent = ''; });
    }
    selConservation.addEventListener('change', majApercuPurge); majApercuPurge();
    var pExports = h('section', { class: 'panneau' }, h('h2', { text: 'Dossier des exports' }),
      h('p', { class: 'muted', text: 'Les décomptes JLD (PDF, CSV), registres, statistiques, registres pour communication, données d’un patient (droit d’accès) et archives sont enregistrés automatiquement dans ce sous-dossier du dossier des données, classés par catégorie, et consultables par le bouton « Exports » en haut de l’écran. Ces fichiers ne sont pas chiffrés : le dossier doit garder les mêmes droits d’accès que le dossier des données. Les copies de sauvegarde et les mots de passe provisoires restent téléchargés à part (ils ne doivent pas rester sur le partage).' }),
      h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: modaleExports }, 'Voir les fichiers exportés')),
      h('label', {}, 'Sous-dossier (ex. « exports », « exports/unite-1 »)', tExports),
      h('label', {}, 'Chemin réseau du dossier des données (facultatif, pour l’accès direct depuis Windows)', tReseau),
      h('small', { class: 'muted', text: 'Ex. \\\\serveur\\partage\\TesseraSante ou Z:\\TesseraSante. La fenêtre « Exports » propose alors de copier le chemin du dossier de chaque service et explique comment créer un raccourci sur le bureau. Le navigateur ne connaît pas ce chemin : il est à recopier depuis l’Explorateur.' }),
      h('label', {}, 'Durée de conservation des exports', selConservation), h('div', {}, h('b', {}, apercuPurge)),
      h('small', { class: 'muted', text: 'Purge automatique : à la première connexion de la journée sur chaque poste, les fichiers du dossier des exports plus anciens que cette durée (date d’enregistrement) sont supprimés, et la purge est inscrite au journal. La durée est à fixer avec le délégué à la protection des données ; elle ne concerne que les exports, jamais les données de l’outil ni le registre.' }),
      h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: async function () {
        var j = X.optionsExports(config()).conservationJours;
        if (!j) return alert('Aucune durée de conservation enregistrée : choisissez une durée puis « Enregistrer ».');
        var l = await App.session.purgerExports({ simulation: true });
        if (!l.length) return toast('Aucun export à purger.');
        if (!confirm('Supprimer ' + l.length + ' fichier(s) de plus de ' + libConservation(j) + ' du dossier des exports ? L’opération est inscrite au journal.')) return;
        var f = await App.session.purgerExports(); toast(f.length + ' fichier(s) supprimé(s).'); majApercuPurge();
      } }, 'Purger maintenant')),
      boutonEnregistrer(async function () {
        var v = tExports.value.trim() || 'exports';
        if (!SIC.cheminExport(v)) throw new Error('Nom de dossier invalide : lettres, chiffres, espaces, tirets, points et « / » entre sous-dossiers ; jamais « .. ».');
        if (['evenements', 'instantanes', 'coffre-historique', 'reperes', 'quarantaine', 'preferences', 'formation'].indexOf(SIC.cheminExport(v)[0].toLowerCase()) >= 0) throw new Error('Ce nom est réservé par l’outil.');
        var j = +selConservation.value;
        if (j && j < X.optionsExports(config()).conservationJours || (j && !X.optionsExports(config()).conservationJours)) {
          var l = await App.session.purgerExports({ simulation: true, conservationJours: j });
          if (l.length && !confirm('Avec une conservation de ' + libConservation(j) + ', ' + l.length + ' fichier(s) existant(s) seront supprimés à la prochaine purge automatique (première connexion de la journée). Enregistrer ?')) return;
        }
        var reseau = tReseau.value.trim().replace(/[\\/]+$/, '');
        if (reseau && !/^(\\\\[^\\/]+[\\/][^\\/]+|[A-Za-z]:[\\/]?)/.test(reseau)) throw new Error('Chemin réseau inattendu : il commence par \\\\serveur\\partage ou par une lettre de lecteur (Z:\\…).');
        await enregistrerConfig([['exports', { dossier: SIC.cheminExport(v).join('/'), conservationJours: j, cheminReseau: reseau }]]);
      }));

    // -- Organisation des envois au JLD (texte affiché en tête de l'onglet JLD)
    // Panneaux du module (onglets propres et contributions aux onglets communs) : ui-isocont.js
    var pModule = interfaceModule().admin.panneaux(!!s.formation);
    // Sous-onglets d'administration des autres modules affichés (Agenda…) : un onglet par module
    // Onglets d'administration des autres modules (Patients, Agenda…), rangés par module
    function ongletsDe(id) { var m = SIC.modules.obtenir(id); return m && m.interface && m.interface.admin && m.interface.admin.onglets ? m.interface.admin.onglets(!!s.formation) : []; }

    var demo = App.dossier.mode === 'demo' ? h('section', { class: 'panneau' }, h('h2', { text: 'Démonstration' }),
      h('p', { class: 'muted', text: 'Efface toutes les données de démonstration de ce navigateur et revient à l’accueil.' }),
      h('button', { class: 'btn danger', onclick: async function () {
        if (!confirm('Effacer toutes les données de démonstration ?')) return;
        arreterMinuteurs(); await App.dossier.vider(); await changerDossier();
      } }, 'Effacer la démonstration')) : null;

    var infos = h('section', { class: 'panneau' }, h('h2', { text: 'Informations techniques' }),
      h('div', { class: 'recap' },
        h('div', { text: 'Version : ' + SIC.VERSION }),
        h('div', { text: 'Dossier : ' + App.dossier.nom + ' (' + (App.dossier.mode === 'demo' ? 'démonstration' : 'réseau') + ')' }),
        h('div', { text: 'Saisies dans le journal : ' + s.evts.length + (s.rejetes.length ? ' — ' + s.rejetes.length + ' fichier(s) illisible(s)' : '') }),
        h('div', { text: 'Coffre : révision ' + s.coffre.rev + ', ' + embs.length + ' moyen(s) de déblocage' }),
        h('div', { text: 'Adresse : ' + location.protocol + '//' + (location.host || '(fichier local)') }),
        h('div', { text: 'Licence : EUPL-1.2 — code source : github.com/rodtrip2/tessera-sante' })));

    var note = s.formation ? h('section', { class: 'panneau' }, h('h2', { text: 'Administration en mode formation' }),
      h('p', { text: 'Le paramétrage ci-dessous ne concerne que le jeu de formation. Les comptes, les clés de sécurité et l’import se gèrent depuis les données réelles.' })) : null;
    function avecNote(liste) { return note ? liste.map(function (o) { return [o[0], o[1], [note].concat(o[2])]; }) : liste; }
    var groupes = {
      general: s.formation ? [['services', 'Établissement et services', [pServices, pModulesServices].concat(pModule.services)], ['sauvegardes', 'Sauvegardes et exports', [pExports].concat(pModule.sauvegardes)], ['apropos', 'À propos', [SIC.ui.apropos.panneau(), infos]]]
        : [['comptes', 'Comptes et sécurité', [pAttestation, pTrousseau, pIncomplets, comptes, SIC.ui.roles.panneau(), deblocage, SIC.ui.verrou.panneau(), SIC.ui.formation.sectionAdmin()].filter(Boolean)],
          ['services', 'Établissement et services', [pServices, pModulesServices].concat(pModule.services)],
          ['sauvegardes', 'Sauvegardes et exports', [SIC.ui.sauvegarde.panneau(), SIC.ui.miroir.panneau(), pExports].concat(pModule.sauvegardes, [SIC.ui.reglages.panneau()])],
          ['apropos', 'À propos', [SIC.ui.apropos.panneau(), infos, SIC.ui.version.panneau(), demo]]],
      isocont: pModule.onglets,
      patients: [['fiche', 'Fiche patient par service', [pFiche]]].concat(ongletsDe('patients'))
    };
    modulesAdmin().forEach(function (x) { if (!groupes[x[0]]) groupes[x[0]] = ongletsDe(x[0]); });
    var titres = { general: 'Réglages généraux' };
    modulesAdmin().forEach(function (x) { titres[x[0]] = 'Administration — ' + x[1]; });
    return sousOngletsAdmin(avecNote(groupes[groupe] || []), titres[groupe] || 'Administration');

    /** Sous-onglets de l'administration : seul le contenu du sous-onglet choisi est affiché. */
    function sousOngletsAdmin(liste, titre) {
      if (!liste.length) return h('div', { class: 'panneau vide', text: 'Aucun réglage pour ce module.' });
      if (!liste.some(function (x) { return x[0] === App.sousOngletAdmin; })) App.sousOngletAdmin = liste[0][0];
      var actif = liste.filter(function (x) { return x[0] === App.sousOngletAdmin; })[0];
      var nav = h('nav', { class: 'sous-onglets', 'aria-label': 'Rubriques de l’administration' }, liste.map(function (x) {
        return h('button', { type: 'button', 'aria-current': x[0] === App.sousOngletAdmin ? 'page' : null, onclick: function () {
          App.sousOngletAdmin = x[0];
          try { localStorage.setItem('sic-admin', x[0]); } catch (e) { /* stockage indisponible */ }
          rendreContenu();
        } }, x[1]);
      }));
      return h('div', {}, h('h1', { text: titre }), liste.length > 1 ? nav : null, h('div', { class: 'contenu-sous-onglet' }, actif[2]));
    }
  }

  /** Fenêtre de migration vers le trousseau : mot de passe de l'administrateur, code de secours actuel (facultatif). */
  // ------------------------------------------------------------ Attestation du coffre (0.5.0)
  /** Libellé lisible d'une date ISO. */
  function dateIso(x) { return x ? date(Date.parse(x)) : '—'; }
  /**
   * Panneau « Intégrité du coffre » (administrateur, trousseau) : état attesté, anomalies et réparations
   * (renouveler les clés, nouvelle clé personnelle d'un compte, nouveau code de secours, dernière version attestée),
   * et « Tout renouveler » en cas de compromission.
   */
  function panneauAttestation(s) {
    var e = s.etatAttestation && s.etatAttestation();
    if (!e || !e.attestateur || s.formation) return null;
    var an = e.anomalies.filter(function (x) { return x.bloquante; }), avis = e.anomalies.filter(function (x) { return !x.bloquante; });
    var codes = an.map(function (x) { return x.code; });
    function action(texte, classe, fn) {
      return h('button', { class: 'btn ' + (classe || ''), onclick: async function (ev) {
        var b = ev.currentTarget; b.disabled = true;
        try { await fn(); } catch (err) { alert(err.message); } finally { b.disabled = false; }
      } }, texte);
    }
    var actions = h('div', { class: 'actions gauche' });
    var seulement = function (liste) { return codes.length && codes.every(function (c) { return liste.indexOf(c) >= 0; }); };
    if (seulement(['restaure', 'ancienne'])) actions.appendChild(action('Renouveler les clés', 'primaire', async function () {
      if (!confirm('Renouveler toutes les clés ?\n\nNouvelles clés maîtresses et nouvelle génération de chaque clé, remises selon les comptes tels qu’ils figurent dans ce coffre : vérifiez d’abord les comptes (un compte retiré depuis la version restaurée doit être désactivé ensuite). Les mots de passe ne changent pas ; la copie sous scellé sera à refaire.')) return;
      await s.renouvelerCles(); toast('Clés renouvelées.'); rendreContenu();
    }));
    var ag = an.filter(function (x) { return x.code === 'agents'; })[0];
    if (ag && seulement(['agents', 'secours'])) (ag.comptes || []).forEach(function (id) {
      var c = s.comptes.filter(function (x) { return x.id === id; })[0];
      if (!c || !c.actif) return;
      actions.appendChild(action('Nouvelle clé personnelle : ' + c.nom, '', async function () {
        if (!confirm('Créer une nouvelle clé personnelle pour ' + c.nom + ' ?\n\nUn mot de passe provisoire lui est attribué (fiche de remise) ; ses clés de sécurité sont retirées.')) return;
        var mdp = C.nouveauMotDePasseProvisoire();
        await s.reinitialiserMotDePasse(id, mdp, { reparation: true, aleatoire: true });
        if (SIC.ui.actions.fichesRemise) SIC.ui.actions.fichesRemise([{ nom: c.nom, login: c.login, motDePasse: mdp, roles: c.roles, services: c.services || [], finValidite: c.finValidite || '' }], 'Nouvelle clé personnelle');
        rendreContenu();
      }));
    });
    if (codes.indexOf('secours') >= 0 && seulement(['agents', 'secours'])) actions.appendChild(action('Nouveau code de secours', '', async function () {
      if (!confirm('Créer un nouveau code de secours ? L’ancien n’ouvrira plus rien.')) return;
      var code = await s.nouveauCodeSecours();
      modale('Nouveau code de secours', h('div', { class: 'pile' }, h('p', { text: 'Notez ce code et conservez-le sous scellé ; refaites la copie du coffre sous scellé.' }), h('div', { class: 'code-secours', text: code })), [{ texte: 'J’ai noté le code', classe: 'primaire' }]);
    }));
    if (codes.length) actions.appendChild(action('Remettre la dernière version attestée…', codes.some(function (c) { return ['restaure', 'ancienne', 'agents', 'secours'].indexOf(c) < 0; }) ? 'primaire' : '', async function () {
      if (!confirm('Remettre en place la dernière version du coffre dont l’attestation est intacte ?\n\nLes comptes, rôles et mots de passe reviennent à cette version : ce qui a été fait depuis (comptes créés, rôles changés, mots de passe) sera à refaire. Votre propre mot de passe est conservé. Toutes les clés sont ensuite renouvelées.')) return;
      var le = await s.remettreDerniereAttestee();
      toast('Version attestée du ' + dateIso(le) + ' remise en place, clés renouvelées.'); rendreContenu();
    }));
    var etat = e.etat;
    var compromission = h('details', { class: 'restauration' }, h('summary', { text: 'En cas de compromission : tout renouveler…' }),
      h('div', { class: 'pile' },
        h('p', { text: 'Si un mot de passe d’administrateur, le code de secours, une clé de sécurité ou une copie du coffre a pu tomber entre de mauvaises mains : nouvelles clés maîtresses et nouvelles générations, nouvelles clés d’attestation, nouveau code de secours, nouvelle clé personnelle pour chaque compte actif.' }),
        h('ul', {},
          h('li', { text: 'Vous gardez votre mot de passe ; les autres comptes reçoivent un mot de passe provisoire (fiches de remise à imprimer).' }),
          h('li', { text: 'Clés de sécurité à réenregistrer ; copie du coffre sous scellé à refaire ; les postes ouverts se verrouillent.' }),
          h('li', { text: 'Les saisies existantes restent lisibles par les agents qui y ont droit.' })),
        h('div', { class: 'actions gauche' }, h('button', { class: 'btn danger', onclick: function () { modaleCompromission(); } }, 'Tout renouveler…'))));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Intégrité du coffre' }),
      an.length ? h('div', { class: 'alerte', role: 'alert' },
        h('b', { text: 'Coffre modifié hors de l’outil ou restauré : aucune remise de clé ni modification des comptes avant réparation.' }),
        h('ul', {}, an.map(function (x) { return h('li', { text: x.texte }); }))) : null,
      avis.map(function (x) { return h('p', { class: 'muted', text: x.texte }); }),
      !an.length && etat ? h('p', { class: 'muted', text: 'Coffre attesté : état n° ' + etat.n + ', signé le ' + dateIso(etat.le) + (etat.par ? ' par ' + s.nomAuteur(etat.par) : '') + '. Chaque agent vérifie la signature à l’ouverture de sa session ; avant toute remise de clé, l’administrateur vérifie aussi les comptes et les clés personnelles.' }) : null,
      actions.childNodes.length ? actions : null,
      h('div', { class: 'actions gauche' }, action('Vérifier maintenant', '', async function () { await s.controlerAttestation(); toast('Vérification faite.'); rendreContenu(); })),
      compromission);
  }

  function modaleCompromission() {
    var s = App.session, secours = s.utilisateur.id === 'secours';
    var mdp = h('input', { type: 'password', autocomplete: 'current-password' }), ok = h('input', { type: 'checkbox' });
    modale('Tout renouveler (compromission)', h('div', { class: 'pile' },
      h('div', { class: 'alerte', text: 'Opération lourde : tous les agents devront se reconnecter avec un mot de passe provisoire, et le code de secours change.' }),
      secours ? h('p', { text: 'Session ouverte par le code de secours : tous les comptes reçoivent un mot de passe provisoire ; vous serez déconnecté et vous reconnecterez avec le nouveau code.' }) : h('label', {}, 'Votre mot de passe', mdp),
      h('label', { class: 'case' }, ok, h('span', { text: 'Je pourrai remettre les fiches et noter le nouveau code de secours tout de suite.' }))),
      [{ texte: 'Annuler' }, { texte: 'Tout renouveler', classe: 'danger', action: async function () {
        if (!ok.checked) throw new Error('Cochez la case pour confirmer.');
        var r = await s.renouvelerTout(mdp.value);
        setTimeout(function () {
          modale('Nouveau code de secours', h('div', { class: 'pile' },
            h('p', { text: 'Tout est renouvelé. Notez ce nouveau code de secours et conservez-le sous scellé : l’ancien n’ouvre plus rien.' }),
            h('div', { class: 'code-secours', text: r.codeSecours }),
            h('p', { class: 'muted', text: 'Refaites ensuite la copie du coffre sous scellé (Sauvegardes et exports) et réenregistrez les clés de sécurité.' })),
            [{ texte: 'J’ai noté le code', classe: 'primaire', action: function () {
              setTimeout(function () {
                if (r.provisoires.length && SIC.ui.actions.fichesRemise) SIC.ui.actions.fichesRemise(r.provisoires, 'Renouvellement complet des clés');
                if (secours) verrouiller('Tout est renouvelé : reconnectez-vous avec le nouveau code de secours.');
              }, 0);
              return true;
            } }]);
          if (!secours) rendreContenu();
        }, 0);
      } }], { focus: secours ? null : mdp });
  }

  function modaleMigrationTrousseau() {
    var mdp = h('input', { type: 'password', autocomplete: 'current-password' });
    var code = h('input', { type: 'text', autocomplete: 'off', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX' });
    var copie = h('input', { type: 'checkbox' });
    modale('Passer au trousseau de clés', h('div', { class: 'pile' },
      h('div', { class: 'alerte', text: 'Avant tout dossier réel : faites une copie complète (Sauvegardes et exports), restaurez-la dans un dossier vide et essayez-y la migration.' }),
      h('label', {}, 'Votre mot de passe', mdp),
      h('label', {}, 'Code de secours actuel (facultatif : laissé vide, un nouveau code est créé)', code),
      h('label', { class: 'case' }, copie, h('span', { text: 'J’ai fait une copie complète des données et je l’ai essayée.' }))),
      [{ texte: 'Annuler' }, { texte: 'Migrer', classe: 'primaire', action: async function () {
        if (!copie.checked) throw new Error('Faites d’abord une copie complète des données et essayez-la.');
        var r = await App.session.migrerVersTrousseau(mdp.value, code.value);
        setTimeout(function () {
          var suite = function () { if (r.provisoires.length && SIC.ui.actions.fichesRemise) SIC.ui.actions.fichesRemise(r.provisoires, 'Passage au trousseau'); };
          if (r.codeSecours) {
            modale('Nouveau code de secours', h('div', { class: 'pile' },
              h('p', { text: 'Le trousseau est en place. Notez ce nouveau code de secours et conservez-le sous scellé : il ouvre toutes les données. L’ancien code n’ouvre plus rien.' }),
              h('div', { class: 'code-secours', text: r.codeSecours }),
              h('p', { class: 'muted', text: 'Refaites ensuite la copie du coffre sous scellé (Sauvegardes et exports).' })),
              [{ texte: 'J’ai noté le code', classe: 'primaire', action: function () { setTimeout(suite, 0); return true; } }]);
          } else { toast('Trousseau en place. Refaites la copie du coffre sous scellé.'); suite(); }
          rendreContenu();
        }, 0);
      } }]);
  }

  function casesRoles(actuels) {
    var bloc = h('div', { class: 'pile' });
    var cases = {};
    droits().rolesConfig(config()).forEach(function (r) {
      cases[r.code] = h('input', { type: 'checkbox', checked: actuels.indexOf(r.code) >= 0 });
      var resume = r.admin ? 'réglages, comptes, imports, annulations' : SIC.ui.roles.resumeAcces(r.acces);
      bloc.appendChild(h('label', { class: 'case' }, cases[r.code], h('span', { text: r.libelle + ' — ' + resume + (!r.admin && !r.services ? ' (tous les services)' : '') })));
    });
    // Rôle retiré par l'administrateur mais encore porté par le compte : affiché pour pouvoir le décocher
    actuels.forEach(function (code) {
      if (cases[code]) return;
      cases[code] = h('input', { type: 'checkbox', checked: true });
      bloc.appendChild(h('label', { class: 'case' }, cases[code], h('span', { class: 'texte-bad', text: code + ' — rôle supprimé : sans effet, à décocher' })));
    });
    bloc.cases = cases;
    bloc.valeur = function () { var v = Object.keys(cases).filter(function (r) { return cases[r].checked; }); if (!v.length) throw new Error('Choisissez au moins un rôle.'); return v; };
    return bloc;
  }

  function casesServices(actuels, roles) {
    var bloc = h('div', { class: 'pile' });
    var cases = {};
    var note = h('small', { class: 'muted', text: 'Ce rôle donne accès à tous les services.' });
    tousServices().forEach(function (x) {
      cases[x.code] = h('input', { type: 'checkbox', checked: actuels.indexOf(x.code) >= 0 });
      bloc.appendChild(h('label', { class: 'case' }, cases[x.code], h('span', { text: x.libelle + ' (' + x.code + ')' })));
    });
    bloc.appendChild(note);
    function maj() {
      var choisis = Object.keys(roles.cases).filter(function (r) { return roles.cases[r].checked; });
      var tous = droits().voitTousServices(choisis, config());
      note.hidden = !tous;
      Object.keys(cases).forEach(function (k) { cases[k].disabled = tous; });
    }
    Object.keys(roles.cases).forEach(function (r) { roles.cases[r].addEventListener('change', maj); }); maj();
    bloc.valeur = function (rolesChoisis) {
      var v = Object.keys(cases).filter(function (k) { return cases[k].checked; });
      var exige = droits().exigeService(rolesChoisis, config());
      if (exige && !v.length) throw new Error('Affectez au moins un service.');
      return v;
    };
    return bloc;
  }

  function modaleCompte(c) {
    var s = App.session;
    var roles = casesRoles(c ? c.roles : ['IDE']);
    var svs = casesServices(c ? (c.services || []) : (App.service !== '*' ? [App.service] : []), roles);
    if (c) {
      var actif = h('input', { type: 'checkbox', checked: c.actif });
      var formation = h('input', { type: 'checkbox', checked: c.formation !== false });
      var finVal = h('input', { type: 'date', value: c.finValidite || '' });
      return modale('Compte — ' + c.nom, h('div', { class: 'pile' },
        h('div', {}, h('b', { text: 'Rôles' }), roles), h('div', {}, h('b', { text: 'Services affectés' }), svs),
        h('label', { class: 'case' }, formation, h('span', { text: 'Accès au mode formation (choix proposé à la connexion)' })),
        h('label', { class: 'case' }, actif, h('span', { text: 'Compte actif (désactiver retire son mot de passe du coffre)' })),
        h('label', {}, 'Dernier jour d’accès (compte temporaire ; vide = sans limite)', finVal)), [
        { texte: 'Annuler' },
        { texte: 'Enregistrer', classe: 'primaire', action: async function () {
          var r = roles.valeur(), sv = svs.valeur(r);
          if (c.id === s.utilisateur.id && r.indexOf('ADMIN') < 0 && !confirm('Vous retirez votre propre rôle d’administrateur. Continuer ?')) return false;
          if (r.indexOf('ADMIN') >= 0 && !actif.checked && s.comptes.filter(function (x) { return x.actif && x.roles.indexOf('ADMIN') >= 0 && x.id !== c.id; }).length === 0) throw new Error('Il doit rester au moins un administrateur actif.');
          await s.modifierRoles(c.id, r, actif.checked, sv, formation.checked, finVal.value); toast('Compte mis à jour.');
        } }]);
    }
    var nom = h('input', { type: 'text' }), login = h('input', { type: 'text', placeholder: 'prenom.nom' });
    var genere = C.nouveauMotDePasseProvisoire();
    var mdp = h('input', { type: 'text', class: 'mono', value: genere, autocomplete: 'off', spellcheck: 'false' });
    var accesForm = h('input', { type: 'checkbox', checked: true });
    var finVal = h('input', { type: 'date', min: M.dateLocaleISO(Date.now()) });
    nom.addEventListener('input', function () { if (!login.dataset.modifie) login.value = SIC.comptes.identifiantDepuisNom(nom.value); });
    login.addEventListener('input', function () { login.dataset.modifie = '1'; });
    modale('Nouveau compte', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom affiché', nom), h('label', {}, 'Identifiant', login)),
      h('label', {}, 'Mot de passe provisoire', mdp),
      h('div', {}, h('b', { text: 'Rôles' }), roles),
      h('div', {}, h('b', { text: 'Services affectés' }), svs),
      h('label', { class: 'case' }, accesForm, h('span', { text: 'Accès au mode formation (choix proposé à la connexion)' })),
      h('label', {}, 'Dernier jour d’accès (compte temporaire : intérimaire, vacataire, stagiaire — facultatif)', finVal),
      h('small', { class: 'muted', text: 'Notez le mot de passe provisoire et remettez-le en main propre : l’agent devra obligatoirement le remplacer à sa première connexion.' })), [
      { texte: 'Annuler' },
      { texte: 'Créer le compte', classe: 'primaire', action: async function () {
        if (!nom.value.trim()) throw new Error('Indiquez le nom.');
        if (mdp.value.length < 12) throw new Error('Mot de passe provisoire : 12 caractères minimum.');
        var r = roles.valeur();
        var c2 = { nom: nom.value, login: login.value || SIC.comptes.identifiantDepuisNom(nom.value), motDePasse: mdp.value, roles: r, services: svs.valeur(r), aleatoire: mdp.value === genere, formation: accesForm.checked, finValidite: finVal.value };
        await s.creerCompte(c2);
        setTimeout(function () { if (SIC.ui.actions.fichesRemise) SIC.ui.actions.fichesRemise([c2], 'Compte créé'); }, 0);
      } }], { focus: nom });
  }

  function modaleReinit(c) {
    var genere = C.nouveauMotDePasseProvisoire();
    var mdp = h('input', { type: 'text', class: 'mono', value: genere, autocomplete: 'off', spellcheck: 'false' });
    var soi = c.id === App.session.utilisateur.id;
    if (soi) return modaleMonMotDePasse();
    modale((c.actif ? 'Réinitialiser le mot de passe — ' : 'Réactiver — ') + c.nom, h('div', { class: 'pile' },
      h('p', { text: 'En cas de perte du mot de passe : l’ancien mot de passe cesse de fonctionner et un mot de passe provisoire le remplace. L’agent devra le changer à sa prochaine connexion. L’opération est tracée.' }),
      h('label', {}, 'Mot de passe provisoire', mdp)), [
      { texte: 'Annuler' },
      { texte: c.actif ? 'Réinitialiser' : 'Réactiver', classe: 'primaire', action: async function () {
        if (mdp.value.length < 12) throw new Error('Mot de passe provisoire : 12 caractères minimum.');
        if (!c.actif) await App.session.modifierRoles(c.id, c.roles, true, c.services || []);
        await App.session.reinitialiserMotDePasse(c.id, mdp.value, { aleatoire: mdp.value === genere });
        var fiche = { nom: c.nom, login: c.login, motDePasse: mdp.value, roles: c.roles, services: c.services || [] };
        setTimeout(function () { if (SIC.ui.actions.fichesRemise) SIC.ui.actions.fichesRemise([fiche], c.actif ? 'Mot de passe réinitialisé' : 'Compte réactivé'); }, 0);
      } }]);
  }

  // ================================================================ Impression
  /** Imprime un document construit à part (décompte, rapport), sans l'interface autour. */
  function imprimer(noeud) {
    var zone = document.getElementById('zone-impression') || document.body.appendChild(h('div', { id: 'zone-impression' }));
    vider(zone).appendChild(noeud);
    document.body.classList.add('mode-impression');
    var fin = function () { document.body.classList.remove('mode-impression'); vider(zone); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    window.print();
  }

  // ================================================================ Partage avec les autres modules
  SIC.ui = {
    vues: (SIC.ui && SIC.ui.vues) || {}, actions: (SIC.ui && SIC.ui.actions) || {},
    h: h, vider: vider, date: date, court: court, duree: duree, relatif: relatif, versSaisie: versSaisie, depuisSaisie: depuisSaisie,
    toast: toast, modale: modale, imprimer: imprimer, erreurDans: erreurDans, fmtJour: fmtJour,
    App: App, st: st, config: config, services: services, tousServices: tousServices, libService: libService, etablissement: etablissement,
    patient: patient, nomPatient: nomPatient, modeActuel: modeActuel, dansService: dansService, idMesure: idMesure,
    boutonEnregistrer: boutonEnregistrer, enregistrerConfig: enregistrerConfig, lignesDe: lignesDe, zoneTexte: zoneTexte, periodeDepuis: periodeDepuis, changerDossier: function () { return changerDossier(); },
    lieu: lieu, exporter: exporter, telechargerOctets: telechargerOctets, rendreContenu: rendreContenu,
    demarrer: demarrer, verrouiller: verrouiller,
    retenirAccueil: function () { retenirAccueil(); }
  };
})();
