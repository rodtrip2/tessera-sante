// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Informations du service — contrat déclaré au registre des modules (0.26.2, lot A, décisions du porteur du
 * 11 novembre 2026).
 *
 * Page d'informations pratiques de chaque service, tenue par le cadre et consultée par tous les agents du service ;
 * page de l'établissement (service « * »), tenue par l'administrateur, affichée au-dessus. Rubriques ajoutées, masquées,
 * rangées ; chacune a un texte, une liste de contacts (nom, fonction, numéro, courriel, compte de l'agent pour lui
 * écrire un message) et des pièces jointes (PDF…, si le réglage les autorise ; désactivées par défaut). Aucune donnée
 * de patient. Journal `modules\infos\`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).infos = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['INFO_RUBRIQUE'];
  var ETABLISSEMENT = '*';
  // Rubriques proposées à un service qui n'en a pas encore (décision du porteur du 11 novembre 2026)
  var RUBRIQUES_DEFAUT = [['coordonnees', 'Coordonnées du service'], ['horaires', 'Horaires (visites, repas, relèves)'], ['organisation', 'Organisation (secteurs, chambres, équipes)'],
    ['consignes', 'Consignes et procédures du service'], ['numeros', 'Numéros utiles (services techniques, sécurité, pharmacie, garde)']].map(function (x, i) { return { code: x[0], titre: x[1], ordre: i + 1 }; });
  var MAX = { titre: 120, texte: 6000, contacts: 60, pieces: 12, nom: 80, fonction: 80, numero: 30, courriel: 120 };

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function texteLong(v, n) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, n || MAX.texte); }

  /** Réglages (`config.infos`) : pièces jointes (désactivées par défaut), taille maximale d'un fichier. */
  function options(config) {
    var v = (config && config.infos) || {};
    var t = Math.round(+v.tailleMaxMo);
    return { piecesJointes: v.piecesJointes === true, tailleMaxMo: t >= 1 && t <= 20 ? t : 5 };
  }

  // ------------------------------------------------------------ Reconstitution de l'état
  function contact(c) {
    if (!c || typeof c !== 'object') return null;
    var x = { nom: texte(c.nom, MAX.nom), fonction: texte(c.fonction, MAX.fonction), numero: texte(c.numero, MAX.numero), courriel: texte(c.courriel, MAX.courriel), agent: texte(c.agent, 60) };
    return x.nom || x.numero ? x : null;
  }
  function appliquer(st, e) {
    var d = e.data || {};
    if (e.type !== 'INFO_RUBRIQUE' || !d.id) return;
    var x = st.rubriques[d.id] || (st.rubriques[d.id] = { id: d.id, service: d.service || ETABLISSEMENT, cree: e.at, par: e.by, titre: '', texte: '', contacts: [], pieces: [], ordre: 99, masquee: false, supprime: false });
    if (d.titre !== undefined) x.titre = texte(d.titre, MAX.titre);
    if (d.texte !== undefined) x.texte = texteLong(d.texte);
    if (Array.isArray(d.contacts)) x.contacts = d.contacts.map(contact).filter(Boolean).slice(0, MAX.contacts);
    if (Array.isArray(d.pieces)) x.pieces = d.pieces.filter(function (p) { return p && p.id && p.nom; }).slice(0, MAX.pieces).map(function (p) { return { id: String(p.id), nom: texte(p.nom, 160), taille: +p.taille || 0 }; });
    if (d.ordre !== undefined && isFinite(+d.ordre)) x.ordre = +d.ordre;
    if (d.masquee !== undefined) x.masquee = !!d.masquee;
    if (d.supprime !== undefined) x.supprime = !!d.supprime;
    x.modifie = e.at; x.modifiePar = e.by;
  }
  function reduire(evts) {
    return N.reduire(evts, { cle: 'infos', etat: function () { return { rubriques: {} }; }, appliquer: appliquer });
  }

  // ------------------------------------------------------------ Lecture
  /** Le compte tient-il la page (service : cadre du service ; établissement : administrateur) ? */
  function gere(compte, service) {
    var roles = (compte && compte.roles) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    return service !== ETABLISSEMENT && roles.indexOf('CADRE') >= 0 && ((compte.services || []).indexOf(service) >= 0);
  }
  /** Rubriques d'une page (service ou établissement), rangées ; les rubriques masquées ne sont rendues qu'avec `masquees`. */
  function rubriques(st, service, masquees) {
    return Object.keys((st && st.rubriques) || {}).map(function (k) { return st.rubriques[k]; })
      .filter(function (r) { return !r.supprime && r.service === service && (masquees || !r.masquee); })
      .sort(function (a, b) { return a.ordre - b.ordre || String(a.titre).localeCompare(String(b.titre), 'fr'); });
  }
  /** Rubriques proposées qui manquent encore à la page (titres proposés par défaut). */
  function proposees(st, service) {
    var titres = rubriques(st, service, true).map(function (r) { return r.titre.toLowerCase(); });
    return RUBRIQUES_DEFAUT.filter(function (r) { return titres.indexOf(r.titre.toLowerCase()) < 0; });
  }
  /** Contacts de toutes les rubriques visibles d'une page (annuaire du service). */
  function contacts(st, service) {
    var res = [];
    rubriques(st, service).forEach(function (r) { r.contacts.forEach(function (c) { res.push(Object.assign({ rubrique: r.titre }, c)); }); });
    return res;
  }
  /** Ordre de la rubrique placée après la dernière de la page. */
  function ordreSuivant(st, service) { var r = rubriques(st, service, true); return r.length ? r[r.length - 1].ordre + 1 : 1; }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || reduire([]), compte = ctx && ctx.compte, x = st.rubriques[d.id], service = x ? x.service : d.service;
    if (!d.id) throw new Error('Identifiant de la rubrique manquant.');
    if (!service) throw new Error('Indiquez le service.');
    if (!gere(compte, service)) throw new Error(service === ETABLISSEMENT ? 'Seul l’administrateur tient la page de l’établissement.' : 'Seul le cadre du service (ou l’administrateur) tient la page du service.');
    if (d.supprime) return;
    if (!x && !texte(d.titre)) throw new Error('Indiquez le titre de la rubrique.');
    if (d.titre !== undefined && !texte(d.titre)) throw new Error('Indiquez le titre de la rubrique.');
    if (d.texte !== undefined && String(d.texte).length > MAX.texte) throw new Error('Texte trop long (6 000 caractères au plus).');
    if (Array.isArray(d.contacts)) {
      if (d.contacts.length > MAX.contacts) throw new Error('Trop de contacts dans la rubrique (60 au plus).');
      d.contacts.forEach(function (c) { if (c && !texte(c.nom) && texte(c.numero)) throw new Error('Indiquez le nom de chaque contact.'); });
    }
    if (Array.isArray(d.pieces) && d.pieces.length > MAX.pieces) throw new Error('Trop de pièces jointes (12 au plus).');
    if (Array.isArray(d.pieces) && d.pieces.length && !options(ctx && ctx.config).piecesJointes && !(x && x.pieces.length >= d.pieces.length)) throw new Error('Les pièces jointes ne sont pas autorisées (réglage de l’administrateur).');
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'infos.consulter', libelle: 'Consulter les informations de ses services et de l’établissement', types: [] },
    { code: 'infos.gerer', libelle: 'Tenir la page de ses services (cadre) : rubriques, contacts, pièces jointes', types: ['INFO_RUBRIQUE'] }
  ];
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: { CADRE: TYPES.slice() }, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'infos', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.infos : undefined; },
    appartenance: 'role'
  });
  function cibles(st, e) { var d = e.data || {}, x = st && st.rubriques && st.rubriques[d.id], sv = x ? x.service : d.service; return sv && sv !== ETABLISSEMENT ? [sv] : []; }
  /** Réglages écrits par l'administrateur seulement (`config.infos`). */
  function controlerCadre(ancien, nouveau, compte) { return ((compte && compte.roles) || []).indexOf('ADMIN') >= 0; }

  var contrat = {
    id: 'infos',
    libelle: 'Informations du service',
    version: '0.1.0',
    icone: 'IS',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { infos: controlerCadre } },
    vues: { onglets: [{ code: 'page', libelle: 'Informations' }, { code: 'annuaire', libelle: 'Contacts' }] },
    migrations: [],
    fournitures: [
      // Lue par les autres modules (référents, Mon agenda) : contacts d'une page
      { nom: 'infos.contacts', version: 1, acces: 'lecture', champs: ['nom', 'fonction', 'numero', 'courriel', 'agent', 'rubrique'], lire: function (st, o) { return contacts(st, o.service); } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, ETABLISSEMENT: ETABLISSEMENT, RUBRIQUES_DEFAUT: RUBRIQUES_DEFAUT, MAX: MAX,
    options: options, gere: gere, rubriques: rubriques, proposees: proposees, contacts: contacts, ordreSuivant: ordreSuivant, controler: controler, controlerCadre: controlerCadre };
});
