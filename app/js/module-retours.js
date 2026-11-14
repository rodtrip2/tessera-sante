// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Retours sur Tessera — contrat déclaré au registre des modules (lot O, phase 1 du plan d'action du porteur,
 * 14 novembre 2026).
 *
 * Pendant le pilote, chaque agent signale un défaut ou propose une amélioration depuis n'importe quelle fenêtre
 * (bouton « Signaler » de l'en-tête). Le retour reprend d'office la fenêtre et l'onglet ouverts, la version de
 * Tessera, le navigateur et les rôles de l'agent ; texte libre, sans donnée de patient (rappel à la saisie). Le cadre
 * (ses services) et l'administrateur (tous) suivent les retours : nouveau, retenu, écarté, fait, avec une réponse à
 * l'auteur, informé dans sa session. Liste exportable pour le porteur (aucune connexion sortante : le fichier est
 * transmis à la main). Journal `modules\retours\`, clé propre, activation par service. Retours signés : le journal
 * garde toujours l'auteur d'une saisie, un retour anonyme n'est donc pas proposé.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).retours = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['RETOUR', 'RETOUR_SUIVI'];
  var NATURES = { defaut: 'Défaut', idee: 'Amélioration' };
  var ETATS = { nouveau: 'Nouveau', retenu: 'Retenu', ecarte: 'Écarté', fait: 'Fait' };
  var MAX_TEXTE = 2000;

  function texte(v, n) { return String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, n || 120); }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, r;
    switch (e.type) {
      case 'RETOUR':
        if (!d.id || st.retours[d.id]) break;
        st.retours[d.id] = { id: d.id, cree: e.at, par: e.by, nom: texte(d.nom, 80), service: d.service || '', nature: NATURES[d.nature] ? d.nature : 'defaut', texte: d.texte || '',
          ecran: d.ecran && typeof d.ecran === 'object' ? { fenetre: texte(d.ecran.fenetre, 80), onglet: texte(d.ecran.onglet, 80) } : { fenetre: '', onglet: '' },
          version: texte(d.version, 40), navigateur: texte(d.navigateur, 200), roles: Array.isArray(d.roles) ? d.roles.slice(0, 12).map(function (x) { return texte(x, 30); }) : [],
          etat: 'nouveau', reponse: '', suivi: [] };
        break;
      case 'RETOUR_SUIVI':
        r = st.retours[d.retour];
        if (!r || !ETATS[d.etat]) break;
        r.suivi.push({ etat: d.etat, reponse: d.reponse || '', par: e.by, nom: texte(d.nom, 80), le: e.at, evt: e.id });
        r.etat = d.etat;
        if (d.reponse) r.reponse = d.reponse;
        r.modifie = e.at;
        if (r.par !== e.by) st.avis.push({ id: e.id, agent: r.par, par: e.by, nom: texte(d.nom, 80), le: e.at, retour: r.id, etat: d.etat, reponse: d.reponse || '' });
        break;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'retours', etat: function () { return { retours: {}, avis: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  /**
   * Retours visibles, du plus récent au plus ancien : ceux de l'agent (`agent`), et, pour qui les suit (`suivre`),
   * ceux des services donnés. `filtre` : { etat, nature }.
   */
  function liste(st, o) {
    o = o || {};
    var f = o.filtre || {}, services = o.services || [];
    return Object.keys((st && st.retours) || {}).map(function (k) { return st.retours[k]; })
      .filter(function (r) {
        if (!(r.par === o.agent || (o.suivre && (o.tous || services.indexOf(r.service) >= 0)))) return false;
        if (f.etat && r.etat !== f.etat) return false;
        if (f.nature && r.nature !== f.nature) return false;
        return true;
      })
      .sort(function (a, b) { return String(b.cree).localeCompare(String(a.cree)); });
  }
  /** Informations reçues par l'auteur (changement d'état, réponse), pas encore vues. */
  function avisPour(st, agent, vus) {
    var v = vus || [];
    return ((st && st.avis) || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0 && st.retours[a.retour]; });
  }
  /** Retours à traiter (état « nouveau ») dans les services suivis. */
  function aTraiter(st, services, tous) {
    return Object.keys((st && st.retours) || {}).map(function (k) { return st.retours[k]; }).filter(function (r) { return r.etat === 'nouveau' && (tous || services.indexOf(r.service) >= 0); });
  }
  /** Lignes de l'export (CSV) : une ligne par retour, sans l'historique du suivi. */
  function lignesExport(retours, nomAuteur) {
    var n = nomAuteur || function (x) { return x; };
    return [['Numéro', 'Date', 'Auteur', 'Rôles', 'Service', 'Nature', 'Fenêtre', 'Onglet', 'Version', 'Navigateur', 'Texte', 'État', 'Réponse']].concat(retours.map(function (r) {
      return [numero(r), String(r.cree).slice(0, 10), r.nom || n(r.par), r.roles.join(' '), r.service, NATURES[r.nature], r.ecran.fenetre, r.ecran.onglet, r.version, r.navigateur, r.texte, ETATS[r.etat], r.reponse];
    }));
  }
  function numero(r) { return 'RT-' + String(r.id).replace(/^R(T-)?/i, '').slice(-6).toUpperCase(); }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { retours: {} };
    if (type === 'RETOUR') {
      if (!d.id) throw new Error('Retour sans identifiant.');
      if (st.retours[d.id]) throw new Error('Ce retour est déjà enregistré : il ne se modifie pas.');
      if (!d.service) throw new Error('Indiquez le service.');
      if (!NATURES[d.nature]) throw new Error('Choisissez : défaut ou amélioration.');
      if (!texte(d.texte, MAX_TEXTE)) throw new Error('Décrivez le défaut ou l’idée en quelques mots.');
      if (String(d.texte).length > MAX_TEXTE) throw new Error('Texte trop long (2 000 caractères au plus).');
      return;
    }
    if (type === 'RETOUR_SUIVI') {
      var r = st.retours[d.retour];
      if (!r) throw new Error('Retour introuvable.');
      if (!ETATS[d.etat]) throw new Error('État inconnu.');
      if (d.etat === r.etat && !texte(d.reponse, MAX_TEXTE)) throw new Error('Rien à enregistrer : changez l’état ou écrivez une réponse.');
      if (d.etat === 'ecarte' && !texte(d.reponse, MAX_TEXTE) && !r.reponse) throw new Error('Expliquez à l’auteur pourquoi le retour est écarté.');
      if (d.reponse !== undefined && String(d.reponse).length > MAX_TEXTE) throw new Error('Réponse trop longue (2 000 caractères au plus).');
    }
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'retours.signaler', libelle: 'Signaler un défaut ou proposer une amélioration de Tessera', types: ['RETOUR'] },
    { code: 'retours.suivre', libelle: 'Suivre les retours des agents : retenir, écarter, marquer fait, répondre, exporter', types: ['RETOUR_SUIVI'] }
  ];
  // Tous les rôles signalent ; le cadre suit les retours de ses services, l'administrateur tous
  var SIGNALER = ['RETOUR'], DROITS = {};
  ['IDE', 'AS', 'SECRETAIRE', 'MEDECIN', 'MEDECIN_CHEF_SERVICE', 'MEDECIN_CHEF_POLE', 'ADMIN_GARDE', 'DIRECTEUR_SOINS', 'INTERVENANT'].forEach(function (r) { DROITS[r] = SIGNALER.slice(); });
  DROITS.CADRE = TYPES.slice(); DROITS.CADRE_SUP = TYPES.slice();
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: TYPES.slice(), rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'retours', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.retours : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, r = e.type === 'RETOUR' ? null : st && st.retours && st.retours[d.retour];
    var sv = d.service || (r && r.service);
    return sv ? [sv] : [];
  }

  var contrat = {
    id: 'retours',
    libelle: 'Retours sur Tessera',
    version: '0.1.0',
    icone: 'RT',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'retours', libelle: 'Retours' }] },
    migrations: [],
    fournitures: [],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, NATURES: NATURES, ETATS: ETATS,
    liste: liste, avisPour: avisPour, aTraiter: aTraiter, lignesExport: lignesExport, numero: numero, controler: controler };
});
