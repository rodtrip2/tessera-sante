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

  function st() { return App.session && App.session.etat; }
  function config() { return st() ? st().config : M.CONFIG_DEFAUT; }
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
      logoEtablissement() ? h('img', { class: 'logo-etab', src: logoEtablissement(), alt: '' }) : h('div', { class: 'logo', 'aria-hidden': 'true', text: 'IC' }),
      h('div', {}, h('b', { text: 'Suivi des mesures d’isolement et de contention' }), h('small', { text: sousTitre || ('Version ' + SIC.VERSION) })));
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
    App.session.sur(function (s, info) { if (App.session.cle) apresNotification(info); });
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
    var s = App.session, tous = M.voitTousServices(s.roles(), config());
    var vis = {};
    (tous ? tousServices() : services()).forEach(function (x) { vis[M.dossierExportService(x.code)] = x.libelle; });
    if (tous || s.peut('STATS') || s.peut('EXPORT_PATIENT') || s.peut('CONFIG')) vis[M.DOSSIER_ETABLISSEMENT] = 'Établissement (plusieurs services)';
    return { libelles: vis, tous: tous };
  }

  /** Fenêtre « Exports » : fichiers du dossier des exports (services de l'agent), à ouvrir, télécharger ou (administrateur) supprimer. */
  function modaleExports() {
    var s = App.session, zone = h('div', { class: 'pile' }, h('div', { class: 'muted', text: 'Lecture du dossier des exports…' }));
    var vis = dossiersExportsVisibles();
    var filtreSv = h('select', { 'aria-label': 'Service', class: 'champ-moyen' }, h('option', { value: '', text: 'Tous mes services' }), Object.keys(vis.libelles).map(function (k) { return h('option', { value: k, text: vis.libelles[k], selected: App.service !== '*' && M.dossierExportService(App.service) === k }); }));
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
      var chemin = M.cheminWindowsExports(config(), sous);
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
    var dossier = M.dossierExports(config()), nomDossier = App.dossier && App.dossier.handle && App.dossier.handle.name;
    modale('Exports', h('div', { class: 'pile' },
      M.optionsExports(config()).conservationJours ? h('p', { class: 'muted', text: 'Durée de conservation fixée par l’établissement : ' + M.optionsExports(config()).conservationJours + ' jours ; les fichiers plus anciens sont supprimés automatiquement.' }) : null,
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
    if (!s || !s.etat || !M.optionsExports(s.etat.config).conservationJours) return;
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
      if (App.session && App.session.cle && document.visibilityState === 'visible' && !saisieEnCours() && App.onglet !== 'admin') rendreContenu();
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

  var ONGLETS = [
    ['tableau', 'Tableau de bord'], ['mesures', 'Mesures'], ['patients', 'Patients'], ['jld', 'JLD'], ['surveillance', 'Surveillance CSI'],
    ['registre', 'Registre'], ['stats', 'Statistiques'], ['journal', 'Journal'], ['admin', 'Administration']
  ];

  /** Liste « Affichage » de l'en-tête (administrateur) : voir l'outil comme un agent portant un autre rôle. */
  function selApercu(s) {
    if ((s.utilisateur.roles || []).indexOf('ADMIN') < 0) return null;
    var sel = h('select', { 'aria-label': 'Affichage selon le rôle', title: 'Voir l’outil comme un agent portant ce rôle (aucune saisie n’est enregistrée pendant l’aperçu)', onchange: function () {
      try { s.definirApercu(sel.value || null); } catch (e) { alert(e.message); }
      if (s.apercu && App.onglet === 'admin') App.onglet = 'tableau';
      rendreContenu();
    } }, h('option', { value: '', text: 'Affichage : le mien' }),
      M.rolesConfig(config()).filter(function (r) { return !r.admin; }).map(function (r) { return h('option', { value: r.code, text: 'Affichage : ' + r.libelle, selected: !!s.apercu && s.apercu.code === r.code }); }));
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
    if (info && info.source === 'synchro' && (App.onglet === 'admin' || saisieEnCours())) {
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
    setTimeout(function () { if (App.miseAJourEnAttente && App.onglet !== 'admin' && !saisieEnCours() && App.session && App.session.cle) rendreContenu(); }, 300);
  });

  var vueAffichee = null;
  function rendreContenu() {
    if (!zoneContenu || !document.body.contains(zoneContenu)) return;
    // Même onglet : on garde la position de défilement de la page et des tableaux
    var cleVue = App.onglet + '|' + App.service + (App.onglet === 'admin' ? '|' + App.sousOngletAdmin : '');
    var memeVue = vueAffichee === cleVue;
    var pos = memeVue ? { x: window.scrollX, y: window.scrollY, h: zoneContenu.offsetHeight, zones: Array.prototype.map.call(zoneContenu.querySelectorAll('.table-wrap, .apercu-document, .apercu-registre'), function (z) { return [z.scrollLeft, z.scrollTop]; }) } : null;
    rendreContenuBrut();
    vueAffichee = App.onglet + '|' + App.service + (App.onglet === 'admin' ? '|' + App.sousOngletAdmin : '');
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
    var maintenant = Date.now();
    var estAdmin = s.roles().indexOf('ADMIN') >= 0;
    var nivJournal = M.niveauJournal(s.roles(), config());
    // Rôle « registre seulement » : un seul onglet, le registre tel qu'il s'affiche habituellement
    var anonyme = M.registreSeul(s.roles(), config());
    // Onglets affichés : réglage des rôles (Rôles et accès), journal selon son niveau, administration pour l'administrateur
    function affichable(o) {
      if (o === 'admin') return estAdmin;
      if (o === 'journal') return nivJournal !== 'aucun' && !anonyme;
      if (anonyme) return o === 'registre';
      return M.ongletVisible(s.roles(), config(), o);
    }
    if (!affichable(App.onglet)) App.onglet = (ONGLETS.filter(function (o) { return affichable(o[0]); })[0] || ['aucun'])[0];
    var conflits = nivJournal === 'aucun' ? 0 : conflitsVisibles().length;
    // Pages de tableaux : toute la largeur de l'écran (les pages de réglage gardent une largeur de lecture)
    zoneContenu.classList.toggle('large', ['tableau', 'mesures', 'patients', 'jld', 'surveillance', 'registre', 'journal', 'stats'].indexOf(App.onglet) >= 0);
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
      mesSv.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: App.service === x.code }); }));
    if (App.service === '*') selService.value = '*';
    var age = s.derniereSynchro ? Math.round((maintenant - s.derniereSynchro) / 1000) : null;
    zoneEntete.appendChild(h('div', { class: 'entete-haut' }, marque(etablissement() || App.dossier.nom), h('div', { class: 'espace' }), mesSv.length ? selService : null,
      h('div', { class: 'statut-synchro', title: s.evts.length + ' saisies dans le journal' }, h('span', { class: 'point' }), age !== null ? 'Synchronisé' : '—'),
      h('div', { class: 'utilisateur' }, h('b', { text: s.utilisateur.nom }), s.utilisateur.roles.map(function (r) { return M.libRole(config(), r); }).join(' · ')),
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
      App.onglet === 'admin' ? h('small', { text: ' (les modifications non enregistrées de cette page seront perdues)' }) : null));
    if (s.apercu) zoneEntete.appendChild(h('div', { class: 'bandeau-apercu', role: 'status' },
      h('span', { text: 'Aperçu de l’affichage du rôle « ' + s.apercu.libelle + ' », sur tous les services : aucune saisie n’est enregistrée. Choisissez un service dans la liste pour voir ce qu’un agent de ce service voit.' }),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { s.definirApercu(null); rendreContenu(); } }, 'Revenir à mon affichage')));
    var bl = SIC.ui.miroir.bandeauLocal(); if (bl) zoneEntete.appendChild(bl);
    var nav = h('nav', { class: 'onglets', 'aria-label': 'Sections' });
    ONGLETS.forEach(function (o) {
      if (!affichable(o[0])) return;
      nav.appendChild(h('button', { 'aria-current': App.onglet === o[0] ? 'page' : null, onclick: function () { App.onglet = o[0]; rendreContenu(); } },
        lieu(o[1]), o[0] === 'journal' && conflits ? h('span', { class: 'pastille', text: conflits }) : null));
    });
    zoneEntete.appendChild(nav);

    zoneContenu.style.minHeight = zoneContenu.offsetHeight + 'px';   // évite que la page se replie pendant la reconstruction
    vider(zoneContenu);
    var vues = { aucun: function () { return h('p', { class: 'muted', text: 'Aucun onglet n’est ouvert à vos rôles : demandez à l’administrateur de vérifier vos accès.' }); }, journal: vueJournal, admin: vueAdmin };
    var vue = vues[App.onglet] || SIC.ui.vues[App.onglet] || SIC.ui.vues.tableau;
    if (!mesSv.length && !estAdmin) { zoneContenu.appendChild(h('div', { class: 'panneau vide', text: 'Aucun service ne vous est affecté. Demandez à l’administrateur de vous en attribuer un.' })); return; }
    try { zoneContenu.appendChild(vue(maintenant)); }
    catch (e) { zoneContenu.appendChild(h('div', { class: 'erreur', text: 'Erreur d’affichage : ' + e.message })); console.error(e); }
  }

  // ---------------------------------------------------------------- Journal
  // ---------------------------------------------------------------- Annulation depuis le journal
  function boutonAnnulationJournal(etat, e) {
    var a = M.annulabilite(etat, e);
    if (!a || !App.session.peut(a.droit) || !App.session.peut('ANNULATION')) return null;
    return h('button', { class: 'btn petit', title: a.action === 'retablir' ? 'Annuler cette annulation : la saisie d’origine produit de nouveau son effet' : 'Annuler cette saisie (motif obligatoire ; elle reste au journal)', onclick: function () { modaleAnnulationJournal(e, a); } }, a.action === 'retablir' ? 'Rétablir' : 'Annuler');
  }
  function modaleAnnulationJournal(e, a) {
    var motif = h('textarea', { rows: 2, placeholder: a.action === 'retablir' ? 'Ex. : annulation faite par erreur' : 'Ex. : saisie en double, erreur de patient…' });
    var cible = a.cible;
    var effet = a.action === 'retablir' ? 'La saisie annulée produit de nouveau son effet.' : (SIC.ui.journal.effetAnnulation(cible) || 'La saisie cesse de produire son effet (échéances, registre et statistiques sont recalculés).');
    modale(a.action === 'retablir' ? 'Rétablir une saisie annulée' : 'Annuler une saisie', h('div', { class: 'pile' },
      h('div', { class: 'recap' },
        h('div', {}, h('b', { text: SIC.ui.journal.libelleType(cible.type) + ' — ' }), date(Date.parse(cible.at)) + ', ' + App.session.nomAuteur(cible.by)),
        h('div', { text: SIC.ui.journal.resume(cible) })),
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
  function journalVisible() { return M.journalVisible(st(), App.session.compteEffectif(), config()); }
  /** Conflits dont les deux saisies sont visibles par l'agent connecté. */
  function conflitsVisibles() {
    var etat = st();
    if (M.niveauJournal(App.session.roles(), config()) === 'complet') return etat.conflits;
    var vis = {}; journalVisible().forEach(function (e) { vis[e.id] = 1; });
    return etat.conflits.filter(function (c) { return vis[c.retenu] || vis[c.concurrent]; });
  }

  function vueJournal() {
    var etat = st(), niveau = M.niveauJournal(App.session.roles(), config());
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
          h('div', {}, h('b', { text: 'Appliquée : ' }), SIC.ui.journal.resume(a), ' — ', App.session.nomAuteur(a.by), ' ', choix(a, b)),
          h('div', {}, h('b', { text: 'Concurrente : ' }), SIC.ui.journal.resume(b), ' — ', App.session.nomAuteur(b.by), ' ', choix(b, a)));
      })) : null;
    var complet = niveau === 'complet';
    var manquants = complet && etat.manquants.length ? h('div', { class: 'erreur', text: etat.manquants.length + ' saisie(s) manquante(s) dans le dossier (fichier supprimé ou non encore synchronisé) : ' + etat.manquants.map(function (x) { return x.manque; }).join(', ') + '. Détail, réparation depuis une copie ou prise d’acte : Administration → Sauvegardes et exports.' }) : null;
    var rejetes = complet && App.session.rejetes.length ? h('div', { class: 'erreur', text: App.session.rejetes.length + ' fichier(s) illisible(s) ou altéré(s) ignoré(s) : ' + App.session.rejetes.map(function (r) { return r.nom; }).join(', ') }) : null;

    var lignes = visibles.slice().reverse().slice(0, 400);
    var portee = complet ? null : h('p', { class: 'muted', text: niveau === 'siennes' ? 'Vous voyez vos propres saisies (réglage de vos rôles).' : 'Vous voyez les saisies concernant vos services et vos propres saisies (réglage de vos rôles).' });
    SIC.ui.journal.preparer();
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
            h('td', {}, SIC.ui.journal.action(e)),
            h('td', {}, SIC.ui.journal.resume(e)),
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
    modale('Changer mon mot de passe', h('div', { class: 'pile' }, h('label', {}, 'Nouveau mot de passe (12 caractères minimum)', a), h('label', {}, 'Confirmation', b)), [
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

  function vueAdmin() {
    var s = App.session, cfg = config();
    var comptes = h('section', { class: 'panneau' }, h('h2', { text: 'Comptes' }),
      h('p', { class: 'muted', text: 'Un compte peut cumuler plusieurs rôles. Les services affectés limitent ce que l’agent voit, à la connexion comme à la création d’une mesure ; un administrateur voit tous les services.' }),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Nom', 'Identifiant', 'Rôles', 'Services', 'État', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, s.comptes.map(function (c) {
          var admin = M.voitTousServices(c.roles, config());
          return h('tr', { class: c.actif ? '' : 'ancienne' },
            h('td', { text: c.nom }), h('td', { class: 'mono', text: c.login }),
            h('td', { text: c.roles.map(function (r) { return M.libRole(config(), r); }).join(', ') }),
            h('td', {}, admin ? h('small', { text: c.roles.indexOf('ADMIN') >= 0 ? 'Tous (administrateur)' : 'Tous' }) : ((c.services || []).length ? (c.services || []).map(libService).join(', ') : h('span', { class: 'badge warn', text: 'aucun' }))),
            h('td', {}, h('span', { class: 'badge ' + (c.actif ? 'ok' : ''), text: c.actif ? 'actif' : 'désactivé' }), (function () {
              var v = SIC.comptes.validite(c, Date.now());
              if (!c.actif || !v.temporaire) return null;
              var fin = c.finValidite.split('-').reverse().join('/');
              return h('div', {}, h('span', { class: 'badge ' + (v.expire ? 'bad' : v.bientot ? 'warn' : ''), title: 'Compte temporaire : dernier jour d’accès le ' + fin, text: v.expire ? 'expiré le ' + fin : v.bientot ? 'expire le ' + fin + ' (' + v.jours + ' j)' : 'jusqu’au ' + fin }));
            })(), c.actif && c.mdpProvisoire ? h('div', {}, h('span', { class: 'badge warn', title: 'Le mot de passe sera changé à la prochaine connexion', text: 'mot de passe provisoire' })) : null,
              c.formation === false ? h('div', {}, h('span', { class: 'badge', text: 'sans mode formation' })) : null),
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
            if (!confirm('Retirer cette clé de sécurité ?')) return;
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

    // -- Dossier des exports
    var tExports = h('input', { type: 'text', maxlength: 120, value: M.dossierExports(cfg), placeholder: 'exports' });
    var oExp = M.optionsExports(cfg);
    var tReseau = h('input', { type: 'text', maxlength: 200, value: oExp.cheminReseau, placeholder: '\\\\serveur\\partage\\SuiviIsoCont' });
    function libConservation(j) { return !j ? 'Aucune purge automatique' : j < 365 ? Math.round(j / 30.5) + ' mois' : Math.round(j / 365.25) + ' an' + (Math.round(j / 365.25) > 1 ? 's' : ''); }
    var selConservation = h('select', {}, M.CONSERVATION_EXPORTS.map(function (j) { return h('option', { value: j, text: libConservation(j), selected: j === oExp.conservationJours }); }));
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
      h('small', { class: 'muted', text: 'Ex. \\\\serveur\\partage\\SuiviIsoCont ou Z:\\SuiviIsoCont. La fenêtre « Exports » propose alors de copier le chemin du dossier de chaque service et explique comment créer un raccourci sur le bureau. Le navigateur ne connaît pas ce chemin : il est à recopier depuis l’Explorateur.' }),
      h('label', {}, 'Durée de conservation des exports', selConservation), h('div', {}, h('b', {}, apercuPurge)),
      h('small', { class: 'muted', text: 'Purge automatique : à la première connexion de la journée sur chaque poste, les fichiers du dossier des exports plus anciens que cette durée (date d’enregistrement) sont supprimés, et la purge est inscrite au journal. La durée est à fixer avec le délégué à la protection des données ; elle ne concerne que les exports, jamais les données de l’outil ni le registre.' }),
      h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: async function () {
        var j = M.optionsExports(config()).conservationJours;
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
        if (j && j < M.optionsExports(config()).conservationJours || (j && !M.optionsExports(config()).conservationJours)) {
          var l = await App.session.purgerExports({ simulation: true, conservationJours: j });
          if (l.length && !confirm('Avec une conservation de ' + libConservation(j) + ', ' + l.length + ' fichier(s) existant(s) seront supprimés à la prochaine purge automatique (première connexion de la journée). Enregistrer ?')) return;
        }
        var reseau = tReseau.value.trim().replace(/[\\/]+$/, '');
        if (reseau && !/^(\\\\[^\\/]+[\\/][^\\/]+|[A-Za-z]:[\\/]?)/.test(reseau)) throw new Error('Chemin réseau inattendu : il commence par \\\\serveur\\partage ou par une lettre de lecteur (Z:\\…).');
        await enregistrerConfig([['exports', { dossier: SIC.cheminExport(v).join('/'), conservationJours: j, cheminReseau: reseau }]]);
      }));

    // -- Organisation des envois au JLD (texte affiché en tête de l'onglet JLD)
    var tOrgJLD = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Ex. : envois assurés par la secrétaire en semaine, par l’IDE le week-end et en son absence.' }, String(cfg.organisationJLD || ''));
    var pOrgJLD = h('section', { class: 'panneau' }, h('h2', { text: 'Organisation des envois au JLD' }),
      h('p', { class: 'muted', text: 'Rappel affiché en tête de l’onglet JLD : qui fait les envois au juge, selon la politique de l’établissement. Laissez vide pour ne rien afficher. Les droits de saisie des envois se règlent par les rôles des comptes.' }),
      h('label', {}, 'Texte affiché', tOrgJLD),
      boutonEnregistrer(async function () { await enregistrerConfig([['organisationJLD', tOrgJLD.value.trim()]]); }));

    // -- Appellation des lieux dédiés à l'isolement
    var lieuAct = M.libLieu(cfg), lieuxProp = M.LIEUX_ISOLEMENT;
    var iCourt = h('input', { type: 'text', maxlength: 12, value: lieuAct.court }), iLong = h('input', { type: 'text', maxlength: 60, value: lieuAct.long }), iLongs = h('input', { type: 'text', maxlength: 60, value: lieuAct.longs });
    var indexAct = lieuxProp.map(function (x) { return x.court + '|' + x.long; }).indexOf(lieuAct.court + '|' + lieuAct.long);
    var selLieuNom = h('select', { onchange: function () { var x = lieuxProp[+selLieuNom.value]; if (x) { iCourt.value = x.court; iLong.value = x.long; iLongs.value = x.longs; } majApercuLieu(); } },
      lieuxProp.map(function (x, i) { return h('option', { value: i, text: x.long + ' (' + x.court + ')', selected: i === indexAct }); }),
      h('option', { value: 'autre', text: 'Autre appellation…', selected: indexAct < 0 }));
    var apercuLieu = h('small', { class: 'muted' });
    function majApercuLieu() {
      var v = { lieuIsolement: { court: iCourt.value, long: iLong.value, longs: iLongs.value } };
      apercuLieu.textContent = 'Aperçu : ' + M.txtLieu(v, '« Surveillance CSI » · « Contention hors CSI » · « Chambres de soins intensifs du service »');
    }
    [iCourt, iLong, iLongs].forEach(function (i) { i.addEventListener('input', function () { selLieuNom.value = 'autre'; majApercuLieu(); }); });
    majApercuLieu();
    var pLieuNom = h('section', { class: 'panneau' }, h('h2', { text: 'Appellation des lieux dédiés à l’isolement' }),
      h('p', { class: 'muted', text: 'Nom utilisé dans les textes de l’outil (onglets, alertes, registre, statistiques, décompte) : « chambre de soins intensifs (CSI) » par défaut. Les noms des lieux saisis ci-dessus (ex. « CSI 1 ») ne sont pas modifiés. Les règles de calcul et le registre restent identiques.' }),
      h('label', {}, 'Appellation', selLieuNom),
      h('div', { class: 'grille-3' }, h('label', {}, 'Sigle (court, pour les onglets et colonnes)', iCourt), h('label', {}, 'Libellé au singulier', iLong), h('label', {}, 'Libellé au pluriel', iLongs)),
      apercuLieu,
      boutonEnregistrer(async function () {
        if (!iCourt.value.trim() || !iLong.value.trim()) throw new Error('Le sigle et le libellé sont obligatoires.');
        await enregistrerConfig([['lieuIsolement', { court: iCourt.value.trim(), long: iLong.value.trim(), longs: iLongs.value.trim() || iLong.value.trim() }]]);
      }));

    // -- Surveillance
    var tPer = zoneTexte((cfg.periodes || []).map(function (p) { return p.code + ' ; ' + p.libelle + ' ; ' + p.debut + ' ; ' + p.fin; }).join('\n'), 3);
    // -- Information du tiers : fonctions proposées (le psychiatre est toujours en tête)
    var infoTiers = M.informateursTiers(cfg).filter(function (f) { return !f.psychiatre; });
    var tTiers = h('textarea', { rows: 4 }, infoTiers.map(function (f) { return f.libelle; }).join('\n'));
    var pTiers = h('section', { class: 'panneau' }, h('h2', { text: 'Information du tiers : qui peut la réaliser' }),
      h('p', { class: 'muted', text: 'L’article L. 3222-5-1 confie l’information de la famille ou du proche au médecin. « Le psychiatre » est donc toujours proposé en premier ; ajoutez ici les autres fonctions qui peuvent la réaliser dans votre établissement (une par ligne), par exemple : IDE, cadre de santé, médecin de garde, assistant de service social. Le nom de la personne peut être précisé à chaque saisie.' }),
      SIC.ui.extraitLoiTiers(true),
      h('label', {}, 'Autres fonctions proposées (une par ligne)', tTiers),
      boutonEnregistrer(async function () {
        var vus = {}, v = [];
        lignesDe(tTiers).forEach(function (l) {
          var cle = l.toLowerCase();
          if (vus[cle] || /^(le )?psychiatre$/i.test(l)) return; vus[cle] = 1;
          var ancien = infoTiers.filter(function (f) { return f.libelle.toLowerCase() === cle; })[0];
          v.push({ code: ancien ? ancien.code : 'F:' + l, libelle: l });
        });
        await enregistrerConfig([['informateursTiers', v]]);
      }));

    var lignesPS = [];
    Object.keys(cfg.periodesService || {}).forEach(function (sv) { (cfg.periodesService[sv] || []).forEach(function (p) { lignesPS.push(sv + ' ; ' + p.code + ' ; ' + p.libelle + ' ; ' + p.debut + ' ; ' + p.fin); }); });
    var tPerSv = zoneTexte(lignesPS.join('\n'), 3);
    var rolesSurv = M.optionsSurveillance(cfg).rolesListe, cbRolesSurv = {};
    var casesRolesSurv = h('div', { class: 'cases-ligne' }, M.rolesConfig(cfg).filter(function (r) { return !r.admin; }).map(function (r) {
      cbRolesSurv[r.code] = h('input', { type: 'checkbox', checked: rolesSurv.indexOf(r.code) >= 0 });
      return h('label', { class: 'case' }, cbRolesSurv[r.code], h('span', { text: r.libelle }));
    }));
    var minPoste = h('select', {}, [1, 2, 3, 4, 5, 6].map(function (n) { return h('option', { value: n, text: String(n), selected: n === M.optionsSurveillance(cfg).minParPoste }); }));
    var pSurv = h('section', { class: 'panneau' }, h('h2', { text: lieu('Postes de surveillance en CSI') }),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Postes par défaut (code ; libellé ; début ; fin)', tPer),
        h('label', {}, 'Postes propres à un service (service ; code ; libellé ; début ; fin)', tPerSv)),
      h('small', { class: 'muted', text: 'Un service qui a ses propres postes n’utilise pas les postes par défaut. Ne changez pas le code d’un poste déjà utilisé.' }),
      h('label', { class: 'en-ligne' }, 'Professionnels attendus par poste (minimum)', minPoste),
      h('fieldset', {}, h('legend', { text: 'Agents proposés dans la liste de la fenêtre « Ajouter » (comptes portant ces rôles, affectés au service)' }), casesRolesSurv),
      h('small', { class: 'muted', text: lieu('En dessous de ce nombre, le poste est signalé « à renseigner » (onglet Surveillance CSI et tableau de bord).') }),
      boutonEnregistrer(async function () {
        var pers = lignesDe(tPer).map(function (l) { return periodeDepuis(l.split(';').map(function (v) { return v.trim(); }), l); });
        var parSv = {};
        lignesDe(tPerSv).forEach(function (l) { var x = l.split(';').map(function (v) { return v.trim(); }); if (x.length !== 5) throw new Error('Poste mal formé : ' + l); (parSv[x[0]] = parSv[x[0]] || []).push(periodeDepuis(x.slice(1), l)); });
        await enregistrerConfig([['periodes', pers], ['periodesService', parSv], ['surveillance', { minParPoste: +minPoste.value, rolesListe: Object.keys(cbRolesSurv).filter(function (k) { return cbRolesSurv[k].checked; }) }]]);
      }));

    // -- Règles légales
    var champs = [['seuilInfo15j', 'Information du JLD : seuil de cumul sur 15 jours (h)'], ['seuilSaisine15j', 'Saisine du JLD : seuil de cumul sur 15 jours (h)'], ['seuilDecision15j', 'Décision du JLD : seuil de cumul sur 15 jours (h)'],
      ['intervalleCycle', 'Intervalle entre deux cycles (h)'], ['rythmeLongCycle', 'Rythme des mesures longues à partir du cycle (0 = désactivé)'], ['rythmeLongInfoSaisine', 'Rythme long : information et saisine (h)'], ['rythmeLongDecision', 'Rythme long : décision (h)'], ['seuilJaune', 'Alerte « échéance proche » (h avant)']];
    var entrees = {};
    var tbody = h('tbody', {}, champs.map(function (c) {
      return h('tr', {}, h('td', { text: c[1] }), ['Isolement', 'Contention'].map(function (t) {
        var p = R.params(t, cfg.parametres);
        var inp = h('input', { type: 'number', min: 0, step: 1, value: p[c[0]], class: 'champ-court' });
        entrees[t + c[0]] = inp;
        return h('td', {}, inp, p[c[0]] !== R.PARAMETRES_DEFAUT[t][c[0]] ? h('small', { class: 'muted', text: ' (défaut ' + R.PARAMETRES_DEFAUT[t][c[0]] + ')' }) : null);
      }));
    }));
    var delaiMode = h('input', { type: 'number', min: 0, max: 72, value: cfg.delaiModeHospiHeures == null ? 12 : cfg.delaiModeHospiHeures });
    var inact = h('input', { type: 'number', min: 2, max: 60, value: cfg.inactiviteMinutes || 10 });
    var pRegles = h('section', { class: 'panneau' }, h('h2', { text: 'Règles légales et sécurité' }),
      h('div', { class: 'alerte', text: 'Les valeurs par défaut traduisent l’article L. 3222-5-1 du code de la santé publique et la circulaire du 25 mars 2022. Ne les modifiez qu’en cas d’évolution des textes, après avis de la direction.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Paramètre' }), h('th', { text: 'Isolement' }), h('th', { text: 'Contention' }))), tbody)),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Registre : passage des soins libres à une hospitalisation sous contrainte retenu s’il survient dans les … heures suivant le début', delaiMode),
        h('label', {}, 'Verrouillage automatique après inactivité (minutes)', inact)),
      boutonEnregistrer(async function () {
        var par = {};
        ['Isolement', 'Contention'].forEach(function (t) {
          champs.forEach(function (c) {
            var v = +entrees[t + c[0]].value;
            if (!isFinite(v) || v < 0) throw new Error('Valeur invalide : ' + c[1] + ' (' + t + ')');
            if (v !== R.PARAMETRES_DEFAUT[t][c[0]]) { par[t] = par[t] || {}; par[t][c[0]] = v; }
          });
        });
        await enregistrerConfig([['parametres', par], ['delaiModeHospiHeures', Math.max(0, +delaiMode.value || 0)], ['inactiviteMinutes', Math.max(2, Math.min(60, +inact.value || 10))]]);
      }));

    // -- Pauses (levées temporaires)
    var op = M.optionsPauses(cfg);
    var cbActive = h('input', { type: 'checkbox', checked: op.active });
    var cbRetr = h('input', { type: 'checkbox', checked: op.retrancher });
    var radPortee = function (v, texte) { var r = h('input', { type: 'radio', name: 'portee-pauses', value: v, checked: op.portee === v }); return h('label', { class: 'case' }, r, h('span', { text: texte })); };
    var blocPortee = h('div', { class: 'pile retrait' },
      h('b', { text: 'Où déduire les pauses ?' }),
      radPortee('jld', 'Pour les délais JLD seulement (échéances, cumuls sur 15 jours, décompte) : le registre et les statistiques gardent la durée réelle, levées temporaires comprises'),
      radPortee('partout', 'Partout : délais JLD, et aussi registre anonymisé et statistiques (durées hors pauses)'));
    var radCS = function (v, texte) { return h('label', { class: 'case' }, h('input', { type: 'radio', name: 'contention-seule', value: v, checked: op.contentionSeule === v }), h('span', { text: texte })); };
    var blocCS = h('div', { class: 'pile retrait' },
      h('b', { text: 'Registre : pause de la contention seule (le patient reste à l’isolement)' }),
      radCS('isolement', 'Compter ce temps en isolement seul : il forme une entrée A supplémentaire (durée de l’isolement exacte, une entrée de plus)'),
      radCS('contention', 'Le laisser dans l’entrée de contention (C), sans le déduire (pas d’entrée supplémentaire)'),
      h('small', { class: 'muted', text: lieu('Une pause commune à la contention et à l’isolement (le patient quitte le lieu d’isolement) est toujours déduite.') }));
    blocPortee.appendChild(blocCS);
    function majCS() { blocCS.hidden = ((blocPortee.querySelector('input[name=portee-pauses]:checked') || {}).value) !== 'partout'; }
    blocPortee.addEventListener('change', majCS); majCS();
    var cbCol = h('input', { type: 'checkbox', checked: op.colonneRegistre });
    var cbVerrou = h('input', { type: 'checkbox', checked: op.verrouContention });
    var cbAuto = h('input', { type: 'checkbox', checked: op.repriseAuto });
    var nAlerte = h('input', { type: 'number', min: 0, max: M.PAUSE_MAX_HEURES, step: 0.5, value: op.alerteHeures, class: 'champ-court' });
    var nRefus = h('input', { type: 'number', min: 1, max: M.PAUSE_MAX_HEURES, step: 0.5, value: op.refusHeures, class: 'champ-court' });
    var avertRetr = h('div', { class: 'alerte', text: 'Déduire les pauses reporte les échéances JLD de la durée des pauses. Ce choix relève d’une lecture des textes à valider par la direction (et, si possible, avec le JLD) : la loi prévoit qu’une mesure reprise moins de 48 h après la fin de la précédente s’y ajoute, ce qui plaide pour laisser courir la durée. Le réglage s’applique à toutes les mesures, y compris passées, et il est tracé dans le journal.' });
    var reglagesPause = h('div', { class: 'pile' },
      h('label', { class: 'case' }, cbRetr, h('span', { text: 'Déduire la durée des pauses du cumul' })),
      h('div', { class: 'pile retrait' }, avertRetr, blocPortee, h('small', { class: 'muted', text: 'Une pause sans reprise saisie n’est déduite que jusqu’à son heure de reprise prévue.' })),
      h('label', { class: 'case' }, cbVerrou, h('span', { text: 'Interdire la pause de l’isolement seul quand une contention est en cours : la contention doit être mise en pause elle aussi, ou terminée dans la même saisie' })),
      h('label', { class: 'case' }, cbCol, h('span', { text: 'Afficher les levées temporaires dans le registre anonymisé (colonne : nombre et durée), et dans son export' })),
      h('label', { class: 'case' }, cbAuto, h('span', { text: 'Reprise automatique à l’heure prévue (sans saisie de la reprise)' })),
      h('small', { class: 'muted', text: 'Sans reprise automatique, une reprise prévue dépassée et non saisie est signalée en rouge. Avec elle, la mesure reprend d’elle-même ; une reprise plus tôt que prévu se saisit avec le bouton Reprise, et un patient qui ne réintègre pas la mesure doit faire l’objet d’une fin de mesure.' }),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Alerte : pause de plus de … heures (0 = aucune alerte)', nAlerte),
        h('label', {}, 'Refus : pause de … heures ou plus (' + M.PAUSE_MAX_HEURES + ' h au maximum)', nRefus)),
      h('small', { class: 'muted', text: 'Le refus ne peut pas dépasser ' + M.PAUSE_MAX_HEURES + ' h : une interruption de 48 h ou plus n’est pas une levée temporaire, c’est une fin de mesure.' }));
    var infoInactive = h('div', { class: 'info', text: 'La levée temporaire est désactivée : le bouton « Pause » n’apparaît plus dans la page des mesures. Les pauses déjà saisies restent visibles dans l’historique et comptées dans la durée des mesures ; une pause en cours peut encore être reprise.' });
    function majPauses() {
      if (cbRetr.checked) cbActive.checked = true;
      cbActive.disabled = cbRetr.checked;
      reglagesPause.hidden = !cbActive.checked; infoInactive.hidden = cbActive.checked;
      avertRetr.parentNode.hidden = !cbRetr.checked;
    }
    cbActive.addEventListener('change', majPauses); cbRetr.addEventListener('change', majPauses);
    var pPauses = h('section', { class: 'panneau' }, h('h2', { text: 'Pauses (levées temporaires)' }),
      h('label', { class: 'case' }, cbActive, h('span', { text: 'Activer la levée temporaire (bouton « Pause » dans la page des mesures)' })),
      h('small', { class: 'muted', text: 'Ne peut être désactivée que si les pauses ne sont pas déduites.' }),
      infoInactive, reglagesPause,
      boutonEnregistrer(async function () {
        var a = +nAlerte.value, r = +nRefus.value;
        if (!isFinite(r) || r <= 0 || r > M.PAUSE_MAX_HEURES) throw new Error('Le seuil de refus doit être compris entre 0 et ' + M.PAUSE_MAX_HEURES + ' h.');
        if (!isFinite(a) || a < 0 || (a && a >= r)) throw new Error('Le seuil d’alerte doit être inférieur au seuil de refus (0 pour aucune alerte).');
        var portee = (blocPortee.querySelector('input[name=portee-pauses]:checked') || {}).value || 'jld';
        var contentionSeule = (blocCS.querySelector('input:checked') || {}).value || 'isolement';
        var avant = M.optionsPauses(cfg);
        var msgs = [];
        if (cbRetr.checked !== avant.retrancher) msgs.push(cbRetr.checked ? 'Déduire les pauses va reporter les échéances JLD de toutes les mesures concernées.' : 'Ne plus déduire les pauses va avancer les échéances JLD des mesures concernées.');
        if (cbRetr.checked && portee !== avant.portee) msgs.push(portee === 'partout' ? 'Les durées du registre et des statistiques seront désormais hors pauses.' : 'Le registre et les statistiques reprendront les durées réelles.');
        if (cbRetr.checked && portee === 'partout' && contentionSeule !== avant.contentionSeule) msgs.push(contentionSeule === 'isolement' ? 'Les pauses de contention seule formeront des entrées A au registre.' : 'Les pauses de contention seule resteront dans l’entrée C du registre.');
        if (cbActive.checked !== avant.active) msgs.push(cbActive.checked ? 'Le bouton « Pause » sera disponible dans la page des mesures.' : 'Le bouton « Pause » disparaîtra de la page des mesures.');
        if (msgs.length && !confirm(msgs.join('\n') + '\nConfirmer ?')) return false;
        await enregistrerConfig([['pauses', { active: cbActive.checked, retrancher: cbRetr.checked, portee: portee, contentionSeule: contentionSeule, verrouContention: cbVerrou.checked, colonneRegistre: cbCol.checked, repriseAuto: cbAuto.checked, alerteHeures: a, refusHeures: r }]]);
      }));
    majPauses();

    if (!App.sousOngletAdmin) { try { App.sousOngletAdmin = localStorage.getItem('sic-admin') || ''; } catch (e) { App.sousOngletAdmin = ''; } }
    var pMasques = SIC.ui.actions.panneauMasquesDecompte && App.sousOngletAdmin === 'decompte' ? SIC.ui.actions.panneauMasquesDecompte() : null;

    // -- Colonnes annuelles de l'onglet Patients
    var colsP = M.colonnesPatients(cfg).map(function (c) { return { libelle: c.libelle, categories: c.categories.slice(), alerte: c.alerte }; });
    var corpsCols = h('tbody');
    function dessinerColsP() {
      vider(corpsCols);
      colsP.forEach(function (c, i) {
        var lib = h('input', { type: 'text', value: c.libelle, oninput: function () { c.libelle = lib.value; } });
        corpsCols.appendChild(h('tr', {},
          h('td', {}, lib),
          ['A', 'B', 'C', 'D', 'E'].map(function (k) {
            var cb = h('input', { type: 'checkbox', checked: c.categories.indexOf(k) >= 0, 'aria-label': 'Catégorie ' + k, title: lieu(M.LIB_CATEGORIES[k]), onchange: function () { c.categories = ['A', 'B', 'C', 'D', 'E'].filter(function (x) { return x === k ? cb.checked : c.categories.indexOf(x) >= 0; }); } });
            return h('td', { class: 'centre' }, cb);
          }),
          h('td', { class: 'centre' }, h('input', { type: 'checkbox', checked: c.alerte, 'aria-label': 'Alerte si différent de 0', onchange: function (ev) { c.alerte = ev.target.checked; } })),
          h('td', {}, h('button', { class: 'btn petit', onclick: function () { colsP.splice(i, 1); dessinerColsP(); } }, 'Retirer'))));
      });
    }
    dessinerColsP();
    var pColsP = h('section', { class: 'panneau' }, h('h2', { text: 'Onglet Patients : statistiques annuelles' }),
      h('p', { class: 'muted', text: lieu('Chaque colonne regroupe des catégories du registre et affiche, pour l’année choisie, le nombre d’entrées et leur durée cumulée. Rappel : une contention en CSI et l’isolement qui l’accompagne forment une seule entrée en catégorie C, alors que le juge compte une mesure d’isolement et une mesure de contention (colonne « Mesures (JLD) », toujours affichée).') }),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { text: 'Libellé de la colonne' }), ['A', 'B', 'C', 'D', 'E'].map(function (k) { return h('th', { class: 'centre', title: lieu(M.LIB_CATEGORIES[k]), text: k }); }), h('th', { class: 'centre', text: 'Devrait rester à 0' }), h('th'))),
        corpsCols)),
      h('small', { class: 'muted', text: Object.keys(M.LIB_CATEGORIES).map(function (k) { return k + ' : ' + lieu(M.LIB_CATEGORIES[k]); }).join(' · ') }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { colsP.push({ libelle: '', categories: [], alerte: false }); dessinerColsP(); } }, '+ Ajouter une colonne'),
        h('button', { class: 'btn', onclick: function () { colsP = M.CONFIG_DEFAUT.colonnesPatients.map(function (c) { return { libelle: c.libelle, categories: c.categories.slice(), alerte: c.alerte }; }); dessinerColsP(); } }, 'Colonnes par défaut')),
      boutonEnregistrer(async function () {
        var v = colsP.map(function (c) { return { libelle: String(c.libelle || '').trim(), categories: c.categories, alerte: !!c.alerte }; });
        v.forEach(function (c, i) {
          if (!c.libelle) throw new Error('Colonne ' + (i + 1) + ' : indiquez un libellé.');
          if (!c.categories.length) throw new Error('Colonne « ' + c.libelle + ' » : cochez au moins une catégorie.');
        });
        await enregistrerConfig([['colonnesPatients', v]]);
      }));

    // -- Registre
    var lignesC = [];
    Object.keys(cfg.compteursRegistre || {}).forEach(function (sv) { Object.keys(cfg.compteursRegistre[sv]).forEach(function (an) { lignesC.push(sv + ' ; ' + an + ' ; ' + cfg.compteursRegistre[sv][an]); }); });
    var tComp = zoneTexte(lignesC.join('\n'), 3);
    var pDocs = h('section', { class: 'panneau' }, h('h2', { text: 'Registre' }),
      h('label', {}, 'Dernier numéro utilisé dans le registre antérieur à l’outil (service ; année ; numéro)', tComp),
      boutonEnregistrer(async function () {
        var comp = {};
        lignesDe(tComp).forEach(function (l) { var x = l.split(';').map(function (v) { return v.trim(); }); if (x.length !== 3 || !/^\d{4}$/.test(x[1]) || !/^\d+$/.test(x[2])) throw new Error('Ligne mal formée : ' + l); comp[x[0]] = comp[x[0]] || {}; comp[x[0]][x[1]] = +x[2]; });
        await enregistrerConfig([['compteursRegistre', comp]]);
      }),
      blocNumerotationImportee());

    /** Années contenant des mesures importées déjà numérotées dans le classeur : numérotation conservée ou recalculée. */
    function blocNumerotationImportee() {
      var groupes = {};
      M.listeMesures(st()).forEach(function (m) {
        if (!m.numeroOrigine) return;
        var an = new Date(m.debut).getFullYear(), k = m.service + '|' + an;
        groupes[k] = groupes[k] || { service: m.service, annee: an, n: 0 }; groupes[k].n++;
      });
      var liste = Object.keys(groupes).sort().map(function (k) { return groupes[k]; });
      if (!liste.length) return null;
      var fige = cfg.registreFige || {}, anneeCourante = new Date().getFullYear();
      async function basculer(g, figer) {
        var passee = g.annee < anneeCourante;
        var msg = figer ? 'Revenir à la numérotation d’origine pour ' + libService(g.service) + ' ' + g.annee + ' ? Les numéros attribués par l’outil à ces mesures seront remplacés par ceux de leur document d’origine.'
          : 'Recalculer selon les règles de l’outil les entrées de ' + libService(g.service) + ' ' + g.annee + ' ?' + (passee ? '\n\nATTENTION : année passée. Les numéros, les catégories et le nombre d’entrées du registre peuvent changer, et avec eux les statistiques et rapports déjà produits pour cette année.' : '');
        var cpt = M.compteurPour(st(), g.service, g.annee, figer, Date.now());
        if (cpt != null) msg += '\n\nLe compteur du registre de cette année passera à ' + cpt + (figer ? ' (dernier numéro du document importé).' : ' (dernier numéro du document importé moins les entrées que l’outil numérotera lui-même).');
        if (!confirm(msg)) return;
        var v = JSON.parse(JSON.stringify(fige));
        if (figer) { v[g.service] = v[g.service] || {}; v[g.service][g.annee] = true; }
        else if (v[g.service]) { delete v[g.service][g.annee]; if (!Object.keys(v[g.service]).length) delete v[g.service]; }
        await App.session.enregistrer('CONFIG', { cle: 'registreFige', valeur: v });
        if (cpt != null) {
          var comp = JSON.parse(JSON.stringify(cfg.compteursRegistre || {}));
          comp[g.service] = comp[g.service] || {}; comp[g.service][g.annee] = cpt;
          await App.session.enregistrer('CONFIG', { cle: 'compteursRegistre', valeur: comp });
        }
        toast(figer ? 'Numérotation d’origine rétablie.' : 'Entrées recalculées selon les règles de l’outil.');
      }
      return h('div', { class: 'pile' },
        h('h3', { text: 'Mesures importées déjà numérotées (classeur ou registre d’origine)' }),
        h('p', { class: 'muted' }, h('small', { text: lieu('« D’origine » : chaque mesure importée garde la catégorie et le numéro de son document d’origine (classeur : une entrée par mesure ; registre : ses lignes à l’identique), et l’outil numérote les autres mesures en sautant ces numéros. « Outil » : les entrées sont recalculées selon les règles de l’outil (catégories A à E, une contention en CSI et son isolement formant une entrée C). Recalculer une année passée peut modifier les statistiques déjà produites.') })),
        h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Service', 'Année', 'Mesures importées numérotées', 'Numérotation', ''].map(function (t) { return h('th', { text: t }); }))),
          h('tbody', {}, liste.map(function (g) {
            var estFige = !!(fige[g.service] && fige[g.service][g.annee]);
            return h('tr', {},
              h('td', { text: libService(g.service) }), h('td', { text: String(g.annee) }), h('td', { text: String(g.n) }),
              h('td', {}, h('span', { class: 'badge ' + (estFige ? '' : 'ok'), text: estFige ? 'D’origine (conservée)' : 'Outil (recalculée)' })),
              h('td', { class: 'actions-ligne' }, h('button', { class: 'btn petit' + (!estFige && false ? '' : ''), onclick: function () { basculer(g, !estFige); } }, estFige ? 'Recalculer selon les règles de l’outil' : 'Revenir à la numérotation d’origine')));
          })))));
    }

    var pImport = SIC.ui.actions.importer ? h('section', { class: 'panneau' }, h('h2', { text: 'Reprise des données existantes' }),
      h('h3', { text: 'À partir du registre du service (tout outil)' }),
      h('p', { class: 'muted', text: 'Le registre est le seul document obligatoirement tenu sous forme numérique : exportez-le de votre outil actuel (CSV ou Excel), puis indiquez la correspondance des colonnes. Les mesures sont reconstituées à partir des entrées ; les cycles JLD et l’information des tiers ne figurant pas au registre, ils ne sont pas repris.' }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { SIC.ui.actions.importerRegistre(); } }, 'Importer un registre…'),
        h('button', { class: 'btn', onclick: function () {
          var a = h('a', { href: URL.createObjectURL(new Blob([SIC.importRegistre.modeleCSV()], { type: 'text/csv;charset=utf-8' })), download: 'modele-registre-import.csv' });
          document.body.appendChild(a); a.click(); a.remove();
        } }, 'Télécharger le modèle de registre (CSV)')),
      h('details', {}, h('summary', { text: 'Cas particulier : classeur Excel « Suivi_Isolement_Contention » (V1.3)' }),
        h('p', { class: 'muted', text: 'Uniquement pour les établissements qui utilisaient ce classeur, outil Excel dont est issu le projet. Il reprend en plus les cycles JLD, l’information des tiers, la surveillance poste par poste et le paramétrage. Un import relancé ne crée pas de doublon.' }),
        h('button', { class: 'btn', onclick: function () { SIC.ui.actions.importer('v13'); } }, 'Importer un classeur V1.3…'))) : null;

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
        h('div', { text: 'Licence : EUPL-1.2 — code source : github.com/rodtrip2/Suivi-mesures-isocont' })));

    if (s.formation) {
      // Les comptes et les clés sont ceux des données réelles : ils ne se gèrent pas depuis le jeu de formation.
      var note = h('section', { class: 'panneau' }, h('h2', { text: 'Administration en mode formation' }),
        h('p', { text: 'Le paramétrage ci-dessous ne concerne que le jeu de formation. Les comptes, les clés de sécurité et l’import se gèrent depuis les données réelles.' }));
      return sousOngletsAdmin([
        ['services', 'Établissement et services', [note, pServices, pLieuNom, pSurv, pTiers, pOrgJLD]],
        ['regles', 'Règles et pauses', [note, pRegles, pPauses]],
        ['alertes', 'Alertes', [note, SIC.ui.alertes.panneauAdmin()]],
        ['cas', 'Cas particuliers', [note, SIC.ui.cas.panneauAdmin()]],
        ['registre', 'Registre et statistiques', [note, pDocs, pColsP, SIC.ui.methode.panneauAdmin(), SIC.ui.qualite.panneauAdmin()]],
        ['decompte', 'Décompte JLD', [note, pMasques]],
        ['sauvegardes', 'Sauvegardes et exports', [note, pExports]],
        ['apropos', 'À propos', [SIC.ui.apropos.panneau(), infos]]
      ]);
    }
    return sousOngletsAdmin([
      ['comptes', 'Comptes et sécurité', [comptes, SIC.ui.roles.panneau(), deblocage, SIC.ui.verrou.panneau(), SIC.ui.formation.sectionAdmin()]],
      ['services', 'Établissement et services', [pServices, pLieuNom, SIC.ui.listes.panneauModes(), pSurv, SIC.ui.listes.panneauListes(), pTiers, pOrgJLD, SIC.ui.listes.panneauVigilance(), SIC.ui.listes.panneauAccueil()]],
      ['regles', 'Règles et pauses', [pRegles, pPauses]],
      ['alertes', 'Alertes', [SIC.ui.alertes.panneauAdmin()]],
      ['cas', 'Cas particuliers', [SIC.ui.cas.panneauAdmin()]],
      ['registre', 'Registre et statistiques', [pDocs, pColsP, SIC.ui.methode.panneauAdmin(), SIC.ui.qualite.panneauAdmin()]],
      ['decompte', 'Décompte JLD', [pMasques]],
      ['reprise', 'Reprise des données', [pImport]],
      ['sauvegardes', 'Sauvegardes et exports', [SIC.ui.sauvegarde.panneau(), SIC.ui.miroir.panneau(), pExports, SIC.ui.qualite.panneauArchive(), SIC.ui.reglages.panneau()]],
      ['apropos', 'À propos', [SIC.ui.apropos.panneau(), infos, SIC.ui.version.panneau(), demo]]
    ]);

    /** Sous-onglets de l'administration : seul le contenu du sous-onglet choisi est affiché. */
    function sousOngletsAdmin(liste) {
      if (!liste.some(function (x) { return x[0] === App.sousOngletAdmin; })) App.sousOngletAdmin = liste[0][0];
      var actif = liste.filter(function (x) { return x[0] === App.sousOngletAdmin; })[0];
      var nav = h('nav', { class: 'sous-onglets', 'aria-label': 'Rubriques de l’administration' }, liste.map(function (x) {
        return h('button', { type: 'button', 'aria-current': x[0] === App.sousOngletAdmin ? 'page' : null, onclick: function () {
          App.sousOngletAdmin = x[0];
          try { localStorage.setItem('sic-admin', x[0]); } catch (e) { /* stockage indisponible */ }
          rendreContenu();
        } }, x[1]);
      }));
      return h('div', {}, h('h1', { text: 'Administration' }), nav, h('div', { class: 'contenu-sous-onglet' }, actif[2]));
    }
  }

  function casesRoles(actuels) {
    var bloc = h('div', { class: 'pile' });
    var cases = {};
    M.rolesConfig(config()).forEach(function (r) {
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
      var tous = M.voitTousServices(choisis, config());
      note.hidden = !tous;
      Object.keys(cases).forEach(function (k) { cases[k].disabled = tous; });
    }
    Object.keys(roles.cases).forEach(function (r) { roles.cases[r].addEventListener('change', maj); }); maj();
    bloc.valeur = function (rolesChoisis) {
      var v = Object.keys(cases).filter(function (k) { return cases[k].checked; });
      var exige = M.exigeService(rolesChoisis, config());
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
    boutonEnregistrer: boutonEnregistrer, enregistrerConfig: enregistrerConfig, changerDossier: function () { return changerDossier(); },
    lieu: lieu, exporter: exporter, telechargerOctets: telechargerOctets, rendreContenu: rendreContenu,
    demarrer: demarrer, verrouiller: verrouiller,
    retenirAccueil: function () { retenirAccueil(); }
  };
})();
