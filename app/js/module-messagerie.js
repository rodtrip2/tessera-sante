// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Messagerie — contrat déclaré au registre des modules (0.23.0, décisions du porteur du 11 novembre 2026).
 *
 * Informations d'organisation entre agents (aucune donnée clinique, aucun message personnel). Destinataires : un ou
 * plusieurs services, groupes d'agents, un rôle dans un service, des agents nommés, tout l'établissement ; appartenance
 * calculée à la lecture (un agent qui rejoint un groupe reçoit les messages encore affichés). Plusieurs services ou tout
 * l'établissement : cadre et administrateur. Message important (en tête jusqu'à la lecture), accusé de lecture
 * automatique ou à confirmer (« J'ai lu »), suivi des lectures et relance, réponses (à l'auteur, à tous, aucune),
 * affichage jusqu'à une date (30 jours par défaut), retrait par l'auteur (pas de modification), archives, conservation
 * 12 mois. Éléments rattachés des autres modules (lien seulement : le détail est lu à la volée, et seulement par les
 * agents qui ont accès au module). Pièces jointes (option de l'établissement, désactivée par défaut) : fichiers chiffrés
 * par la clé du module, rangés à part (`modules\messagerie\pieces\`), jamais dans la saisie.
 * Chiffrement réservé aux destinataires, consultation tracée par le cadre et rôle auditeur : version 0.24.0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'), require('./groupes.js'));
  else (root.SIC = root.SIC || {}).messagerie = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.groupes);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, G) {
  'use strict';

  var TYPES = ['MESSAGE', 'MESSAGE_REPONSE', 'MESSAGE_LU', 'MESSAGE_RETRAIT', 'MESSAGE_ARCHIVE', 'MESSAGE_RELANCE', 'VOTE', 'SONDAGE_CLOTURE', 'CONSULTATION'];
  // Sondages (décisions du porteur du 11 novembre 2026) : choix unique, choix multiples, dates ; résultats publics (les
  // destinataires voient les chiffres, après avoir voté ou à la clôture) ou privés (l'auteur seul) ; noms masqués en option
  var GENRES_SONDAGE = { unique: 'Choix unique', multiple: 'Choix multiples', dates: 'Dates (chacun coche les dates qui lui conviennent)' };
  var MAX_OPTIONS = 10;
  // Chiffrement réservé aux destinataires (0.24.0, décision du porteur du 11 novembre 2026) : réglage de l'établissement
  var CHIFFREMENTS = { desactive: 'Désactivé', choix: 'Au choix de l’auteur (case décochée au départ)', choixCoche: 'Au choix de l’auteur (case cochée au départ)', impose: 'Imposé pour tous les messages' };
  var MOTIFS_CONSULTATION = ['Signalement ou plainte', 'Enquête interne ou administrative', 'Demande d’un agent concerné', 'Autre (à préciser)'];
  var GENRES_DEST = ['agent', 'groupe', 'role', 'service', 'etablissement'];
  var ACCUSES = { auto: 'Automatique à l’ouverture', confirmer: 'À confirmer (« J’ai lu »)' };
  var REPONSES = { auteur: 'À l’auteur seulement', tous: 'À tous les destinataires', aucune: 'Pas de réponse' };
  // Modules dont on peut rattacher un élément (décision du 11 novembre 2026, liste à compléter plus tard)
  var RATTACHABLES = { salles: 'Salles et bureaux', agenda: 'Agenda', vehicules: 'Véhicules', travaux: 'Demandes de travaux', suivi: 'Suivi médical', patients: 'Patients' };
  // Modules qui peuvent afficher leurs informations dans l'onglet Informations (réglage de l'établissement, désactivé par défaut)
  var INFORMATIONS = { agenda: 'Agenda (réponses attendues, informations)', vehicules: 'Véhicules (informations sur vos réservations)', travaux: 'Demandes de travaux (urgences, suivi de vos demandes)', suivi: 'Suivi médical (alertes)', salles: 'Salles et bureaux (décisions sur vos demandes, arbitrages)' };
  var TYPES_PIECES_DEFAUT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'txt', 'csv'];
  var AFFICHABLES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  var MAX_PIECES = 10, MAX_RATTACHES = 10;
  var JOUR = /^\d{4}-\d{2}-\d{2}$/;

  function texte(v, n) { return String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, n || 150); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function plusJours(jour, n) { var p = String(jour).split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + n); return jourISO(d.getTime()); }
  function ext(nom) { var m = /\.([a-z0-9]{1,8})$/i.exec(String(nom || '')); return m ? m[1].toLowerCase() : ''; }

  /**
   * Réglages (`config.messagerie` = { '*': établissement, <service>: ce que le cadre règle pour son service }).
   * Établissement : modules affichés dans l'onglet Informations, pièces jointes (désactivées), taille et types des
   * fichiers, conservation (mois). Service : durée d'affichage proposée à la rédaction (jours).
   */
  function options(config, service) {
    var v = (config && config.messagerie) || {}, et = v['*'] || {}, sv = service && service !== '*' ? v[service] || {} : {};
    var aff = Math.round(+(sv.affichageJours !== undefined ? sv.affichageJours : et.affichageJours)), taille = +et.tailleMaxMo, cons = Math.round(+et.conservationMois);
    var info = {};
    Object.keys(INFORMATIONS).forEach(function (k) { info[k] = !!(et.informations && et.informations[k] === true); });
    var types = Array.isArray(et.typesPieces) ? et.typesPieces.map(function (x) { return String(x).toLowerCase().replace(/^\./, ''); }).filter(function (x) { return /^[a-z0-9]{1,8}$/.test(x); }) : [];
    return {
      affichageJours: isFinite(aff) && aff >= 1 && aff <= 365 ? aff : 30,
      conservationMois: isFinite(cons) && cons >= 1 && cons <= 120 ? cons : 12,
      informations: info,
      piecesJointes: et.piecesJointes === true,
      tailleMaxMo: isFinite(taille) && taille > 0 && taille <= 50 ? taille : 5,
      typesPieces: types.length ? types : TYPES_PIECES_DEFAUT.slice(),
      chiffrement: CHIFFREMENTS[et.chiffrement] ? et.chiffrement : 'desactive',
      consultation: et.consultation !== false
    };
  }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, m = d.message ? st.messages[d.message] : null;
    switch (e.type) {
      case 'MESSAGE':
        if (!d.id || st.messages[d.id]) break;
        st.messages[d.id] = { id: d.id, par: e.by, nom: d.nom || '', cree: e.at, evt: e.id, objet: d.objet || '', texte: d.texte || '',
          destinataires: Array.isArray(d.destinataires) ? d.destinataires : [], services: Array.isArray(d.services) ? d.services : [],
          important: !!d.important, accuse: ACCUSES[d.accuse] ? d.accuse : 'auto', reponses: REPONSES[d.reponses] ? d.reponses : 'auteur',
          jusquau: JOUR.test(d.jusquau || '') ? d.jusquau : '', rattaches: Array.isArray(d.rattaches) ? d.rattaches : [], pieces: Array.isArray(d.pieces) ? d.pieces : [],
          lectures: {}, reponsesListe: [], archives: {}, relances: [], retire: null, sondage: sondageDe(d.sondage), consultations: [] };
        if (d.chiffre && typeof d.chiffre === 'object') st.messages[d.id].chiffre = d.chiffre;
        break;
      case 'VOTE':
        // Dernier vote de l'agent : il remplace le précédent ; vote après la clôture ignoré
        if (!m || !m.sondage || m.sondage.close || (m.sondage.cloture && jourISO(Date.parse(e.at)) > m.sondage.cloture)) break;
        var ids = m.sondage.options.map(function (o) { return o.id; });
        var choix = (Array.isArray(d.choix) ? d.choix : []).filter(function (c, i, t) { return ids.indexOf(c) >= 0 && t.indexOf(c) === i; });
        if (m.sondage.genre === 'unique') choix = choix.slice(0, 1);
        m.sondage.votes[e.by] = { choix: choix, autre: m.sondage.autre ? String(d.autre || '').slice(0, 200) : '', le: e.at, nom: d.nom || '' };
        var lv = m.lectures[e.by] || (m.lectures[e.by] = { ouvert: e.at });
        lv.vu = lv.vu && lv.vu > e.at ? lv.vu : e.at;
        break;
      case 'CONSULTATION':
        // Consultation d'un message chiffré par le cadre ou un auditeur : toujours gardée ; montrée à l'auteur et aux
        // destinataires seulement si le consultant l'a choisi
        if (m) m.consultations.push({ par: e.by, nom: d.nom || '', le: e.at, motif: d.motif || '', precision: d.precision || '', informer: d.informer === true });
        break;
      case 'SONDAGE_CLOTURE':
        if (m && m.sondage && !m.sondage.close) m.sondage.close = { par: e.by, le: e.at };
        break;
      case 'MESSAGE_LU':
        if (!m) break;
        var l = m.lectures[e.by] || (m.lectures[e.by] = { ouvert: e.at });
        l.vu = e.at;
        if (d.confirme && !l.confirme) l.confirme = e.at;
        break;
      case 'MESSAGE_REPONSE':
        if (!m || !d.id || m.reponsesListe.some(function (r) { return r.id === d.id; })) break;
        var rp = { id: d.id, par: e.by, nom: d.nom || '', le: e.at, texte: d.texte || '', evt: e.id };
        if (d.chiffre) rp.chiffre = d.chiffre;
        // Réponse de l'auteur à un seul agent (`a`) : visible par l'auteur et cet agent ; sinon au groupe des destinataires
        if (e.by === m.par && typeof d.a === 'string' && d.a) { rp.a = d.a; rp.nomA = d.nomA || ''; }
        m.reponsesListe.push(rp);
        // Écrire une réponse vaut lecture du message et des réponses précédentes
        var lr = m.lectures[e.by] || (m.lectures[e.by] = { ouvert: e.at });
        lr.vu = e.at;
        break;
      case 'MESSAGE_RETRAIT':
        if (m && !m.retire) m.retire = { par: e.by, le: e.at, motif: d.motif || '' };
        break;
      case 'MESSAGE_ARCHIVE':
        if (m) { if (d.archive === false) delete m.archives[e.by]; else m.archives[e.by] = e.at; }
        break;
      case 'MESSAGE_RELANCE':
        if (m) m.relances.push({ par: e.by, le: e.at });
        break;
    }
  }
  /** Sondage d'un message, validé à la lecture (null sans sondage). */
  function sondageDe(x) {
    if (!x || typeof x !== 'object' || !Array.isArray(x.options)) return null;
    var vus = {}, genre = GENRES_SONDAGE[x.genre] ? x.genre : 'unique';
    var options = x.options.filter(function (o) { return o && /^o[0-9a-z]{1,12}$/.test(o.id || '') && !vus[o.id] && (vus[o.id] = 1); }).slice(0, MAX_OPTIONS).map(function (o) {
      var r = { id: o.id, libelle: texte(o.libelle, 120) };
      if (genre === 'dates') { r.jour = JOUR.test(o.jour || '') ? o.jour : ''; r.heure = /^\d{2}:\d{2}$/.test(o.heure || '') ? o.heure : ''; }
      return r;
    });
    return { question: texte(x.question, 200), genre: genre, options: options, autre: x.autre === true && genre !== 'dates', resultats: x.resultats === 'prive' ? 'prive' : 'public',
      anonyme: x.anonyme === true, cloture: JOUR.test(x.cloture || '') ? x.cloture : '', votes: {}, close: null };
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'messagerie', etat: function () { return { messages: {} }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Destinataires
  /** Le compte ({ id, roles, services }) est-il destinataire du message ? `groupes` : codes de ses groupes. */
  function estDestinataire(m, compte, groupes) {
    if (!m || !compte) return false;
    var roles = compte.roles || [], sv = compte.services || [], gr = groupes || [];
    return (m.destinataires || []).some(function (d) {
      switch (d && d.genre) {
        case 'agent': return d.code === compte.id;
        case 'groupe': return gr.indexOf(d.code) >= 0;
        case 'role': return roles.indexOf(d.code) >= 0 && sv.indexOf(d.service) >= 0;
        case 'service': return sv.indexOf(d.code) >= 0;
        case 'etablissement': return true;
      }
      return false;
    });
  }
  /** Services concernés par une liste de destinataires (contrôle d'activation, cloisonnement) ; groupes : leurs services. */
  function servicesDe(destinataires, config) {
    var res = [];
    function aj(s) { if (s && res.indexOf(s) < 0) res.push(s); }
    (destinataires || []).forEach(function (d) {
      if (d.genre === 'service') aj(d.code);
      else if (d.genre === 'role') aj(d.service);
      else if (d.genre === 'groupe') { var g = G.liste(config).filter(function (x) { return x.code === d.code; })[0]; if (g) g.services.forEach(aj); }
    });
    return res;
  }
  /** Agents attendus (comptes actifs) pour un message, et membres de groupes sans compte : { agents: [comptes], sansCompte: [{ id, nom }] }. */
  function destinatairesResolus(m, comptes, config) {
    var actifs = (comptes || []).filter(function (c) { return c && c.actif !== false && c.id !== 'secours' && c.id !== m.par; }).map(function (c) { return normaliser(c, config); });
    var agents = actifs.filter(function (c) { return estDestinataire(m, c, G.de(config, c.id)); });
    var ids = (comptes || []).map(function (c) { return c.id; }), sansCompte = [], vus = {};
    (m.destinataires || []).forEach(function (d) {
      if (d.genre === 'groupe') { var g = G.liste(config).filter(function (x) { return x.code === d.code; })[0]; if (g) g.membres.forEach(function (x) { if (ids.indexOf(x.id) < 0 && !vus[x.id]) { vus[x.id] = 1; sansCompte.push({ id: x.id, nom: x.nom }); } }); }
      if (d.genre === 'agent' && ids.indexOf(d.code) < 0 && !vus[d.code]) { vus[d.code] = 1; sansCompte.push({ id: d.code, nom: d.nom || d.code }); }
    });
    return { agents: agents, sansCompte: sansCompte };
  }
  /** Suivi des lectures : { confirmes, ouverts, nonOuverts, sansCompte } (listes d'agents), selon l'accusé demandé. */
  function suiviLectures(m, comptes, config) {
    var r = destinatairesResolus(m, comptes, config), res = { confirmes: [], ouverts: [], nonOuverts: [], sansCompte: [] };
    // Membre de groupe ou agent nommé sans compte (aujourd'hui) qui a pourtant lu : compte retiré depuis, lecture gardée
    r.sansCompte.forEach(function (x) { if (m.lectures[x.id]) r.agents.push(x); else res.sansCompte.push(x); });
    r.agents.forEach(function (c) {
      var l = m.lectures[c.id];
      if (!l) res.nonOuverts.push(c);
      else if (m.accuse === 'confirmer' && !l.confirme) res.ouverts.push(c);
      else res.confirmes.push(c);
    });
    return res;
  }
  /** L'agent (auteur ou destinataire) voit-il ce message ? */
  function concerne(m, compte, groupes) { return !!m && !!compte && (m.par === compte.id || estDestinataire(m, compte, groupes)); }

  // ------------------------------------------------------------ Lecture
  function conserve(m, config, maintenant) {
    var lim = new Date(maintenant); lim.setMonth(lim.getMonth() - options(config).conservationMois);
    return Date.parse(m.cree) >= lim.getTime();
  }
  /**
   * Réponses visibles par l'agent. L'auteur voit tout. Réponses de l'auteur : au groupe (tous les destinataires) ou à un
   * seul agent (`a`, visible par lui seul). Réponses des destinataires : à tous si le message le permet, sinon à l'auteur
   * seulement (chacun voit les siennes).
   */
  function reponsesVisibles(m, compte) {
    if (!m || !compte) return [];
    if (m.par === compte.id) return m.reponsesListe.slice();
    return m.reponsesListe.filter(function (r) {
      if (r.par === compte.id) return true;
      if (r.par === m.par) return !r.a || r.a === compte.id;
      return m.reponses === 'tous';
    });
  }
  /**
   * Situation d'un message pour l'agent : lu (ouvert), confirmé, à confirmer, nouvelles réponses, relancé (relance après
   * sa dernière lecture alors qu'il n'a pas lu ou pas confirmé), en tête (important ou relancé, pas encore lu ou confirmé).
   */
  function situation(m, compte, maintenant) {
    var l = m.lectures[compte.id] || null, auteur = m.par === compte.id;
    var aConfirmer = !auteur && m.accuse === 'confirmer' && !(l && l.confirme);
    var lu = auteur || !!l;
    var vu = l ? l.vu : auteur ? m.cree : '';
    var nouvellesReponses = reponsesVisibles(m, compte).filter(function (r) { return r.par !== compte.id && (!vu || r.le > vu); }).length;
    var derniereRelance = m.relances.length ? m.relances[m.relances.length - 1].le : '';
    var sd = m.sondage, ouvert = !!sd && sondageOuvert(m, maintenant), aVoter = !!sd && ouvert && !auteur && !sd.votes[compte.id];
    // Relance : pas encore lu (ou pas confirmé) ; pour un sondage ouvert, pas encore voté
    var relance = !auteur && !!derniereRelance && (!l || (m.accuse === 'confirmer' ? !l.confirme : false) || aVoter);
    var attente = !auteur && (m.accuse === 'confirmer' ? !(l && l.confirme) : !l);
    return { lu: lu, confirme: !!(l && l.confirme), aConfirmer: aConfirmer, nouvellesReponses: nouvellesReponses, relance: relance,
      enTete: (attente || aVoter) && (m.important || relance), nonLu: !lu || nouvellesReponses > 0, archive: !!m.archives[compte.id], aVoter: aVoter };
  }
  /**
   * Messages de l'agent. `onglet` : 'recus' (affichés : pas retirés, pas archivés, avant leur date de fin ou encore en
   * attente de lecture s'ils sont importants), 'envoyes', 'archives' (archivés par l'agent ou dont l'affichage est fini).
   * Tri : en tête d'abord (reçus), puis du plus récent au plus ancien. `filtre` : 'nonlus' | 'importants'. `recherche` :
   * texte cherché dans l'objet, le texte, l'auteur et les réponses visibles.
   */
  function liste(st, compte, groupes, config, maintenant, onglet, o) {
    o = o || {};
    var auj = jourISO(maintenant), q = String(o.recherche || '').toLowerCase().trim();
    var res = Object.keys((st && st.messages) || {}).map(function (k) { return st.messages[k]; }).filter(function (m) {
      if (!conserve(m, config, maintenant)) return false;
      if (onglet === 'envoyes') return m.par === compte.id;
      if (m.par === compte.id || !estDestinataire(m, compte, groupes) || m.retire) return false;
      var s = situation(m, compte, maintenant), fini = m.jusquau && m.jusquau < auj && !s.enTete;
      return onglet === 'archives' ? s.archive || fini : !s.archive && !fini;
    }).map(function (m) { return Object.assign({ situation: situation(m, compte, maintenant) }, m); });
    if (o.filtre === 'nonlus') res = res.filter(function (m) { return m.situation.nonLu || m.situation.aConfirmer || m.situation.aVoter; });
    if (o.filtre === 'sondages') res = res.filter(function (m) { return !!m.sondage; });
    if (o.filtre === 'importants') res = res.filter(function (m) { return m.important; });
    if (q) res = res.filter(function (m) {
      return [m.objet, m.texte, m.nom].concat(reponsesVisibles(m, compte).map(function (r) { return r.texte + ' ' + r.nom; })).join(' ').toLowerCase().indexOf(q) >= 0;
    });
    return res.sort(function (a, b) {
      if (onglet === 'recus' && a.situation.enTete !== b.situation.enTete) return a.situation.enTete ? -1 : 1;
      return String(b.cree).localeCompare(String(a.cree));
    });
  }
  /** Le sondage est-il ouvert (pas clos par l'auteur, date de clôture pas dépassée) ? */
  function sondageOuvert(m, maintenant) {
    var sd = m && m.sondage;
    return !!sd && !sd.close && !m.retire && (!sd.cloture || jourISO(maintenant || Date.now()) <= sd.cloture);
  }
  /**
   * Résultats d'un sondage pour l'agent : { ouvert, monVote, visibles (chiffres), noms (qui a voté quoi : l'auteur, sauf
   * vote anonyme), options: [{ id, libelle, n, noms }], autres: [{ texte, nom }], votants }. Résultats publics : visibles
   * des destinataires après leur vote, et de tous à la clôture ; privés : de l'auteur seul.
   */
  function resultats(m, compte, maintenant) {
    var sd = m && m.sondage;
    if (!sd || !compte) return null;
    var auteur = m.par === compte.id, ouvert = sondageOuvert(m, maintenant), monVote = sd.votes[compte.id] || null;
    var visibles = auteur || (sd.resultats === 'public' && (!!monVote || !ouvert));
    var noms = auteur && !sd.anonyme;
    var ids = Object.keys(sd.votes);
    var opts = sd.options.map(function (o) {
      var qui = ids.filter(function (a) { return sd.votes[a].choix.indexOf(o.id) >= 0; });
      return { id: o.id, libelle: o.libelle, jour: o.jour, heure: o.heure, n: qui.length, noms: noms ? qui.map(function (a) { return sd.votes[a].nom || a; }) : [] };
    });
    var autres = sd.autre ? ids.filter(function (a) { return sd.votes[a].autre; }).map(function (a) { return { texte: sd.votes[a].autre, nom: noms ? sd.votes[a].nom || a : '' }; }) : [];
    return { ouvert: ouvert, monVote: monVote, visibles: visibles, noms: noms, options: visibles ? opts : [], autres: visibles ? autres : [], votants: visibles ? ids.length : null,
      max: visibles ? Math.max.apply(null, [0].concat(opts.map(function (o) { return o.n; }))) : 0 };
  }
  /** Participation (auteur et cadre) : { ont: [agents], nont: [agents] } parmi les destinataires attendus ; noms vides si anonyme. */
  function participation(m, comptes, config) {
    var r = destinatairesResolus(m, comptes, config), sd = m.sondage || { votes: {} }, res = { ont: [], nont: [] };
    r.sansCompte.forEach(function (x) { if (sd.votes[x.id]) r.agents.push(x); });
    r.agents.forEach(function (c) { (sd.votes[c.id] ? res.ont : res.nont).push(c); });
    return res;
  }
  /** Nombre de messages qui attendent l'agent (reçus non lus ou à confirmer, nouvelles réponses à ses messages). */
  function enAttente(st, compte, groupes, config, maintenant) {
    return liste(st, compte, groupes, config, maintenant, 'recus').filter(function (m) { return m.situation.nonLu || m.situation.aConfirmer || m.situation.aVoter; }).length
      + liste(st, compte, groupes, config, maintenant, 'envoyes').filter(function (m) { return !m.retire && m.situation.nouvellesReponses > 0; }).length;
  }
  /** Messages qui rattachent un élément (module, id), lisibles par l'agent : section « Messages » d'un élément. */
  function messagesDe(st, compte, groupes, module, id) {
    return Object.keys((st && st.messages) || {}).map(function (k) { return st.messages[k]; })
      .filter(function (m) { return !m.retire && concerne(m, compte, groupes) && m.rattaches.some(function (r) { return r.module === module && r.id === id; }); });
  }
  /** Pièce jointe affichable dans l'application (images, PDF) ; les autres fichiers sont téléchargés après avertissement. */
  function affichable(p) { return AFFICHABLES[ext(p && p.nom)] || null; }

  /**
   * Compte vu par la messagerie : ses services d'affectation ; sans affectation (administrateur, encadrement de tout
   * l'établissement), les services qu'il voit (convention commune de Tessera : aucun service = tous).
   */
  function normaliser(compte, config) {
    if (!compte) return compte;
    var sv = compte.services && compte.services.length ? compte.services : D.servicesDe(compte, config || {});
    return Object.assign({}, compte, { services: sv });
  }

  // ------------------------------------------------------------ Clés du chiffrement réservé aux destinataires (0.24.0)
  // Noms : m-s.<service>, m-r.<rôle>.<service>, m-g.<groupe>, m-a.<agent>, m-c.<service> (consultation par le cadre ou
  // l'auteur d'un service). Créées par l'administrateur quand l'établissement active le chiffrement, remises par la
  // règle `aDroitCle` (les services et les rôles sont traités comme des groupes).
  function nomCle(d) {
    switch (d && d.genre) {
      case 'service': return ['m-s.' + d.code];
      case 'role': return ['m-r.' + d.code + '.' + d.service];
      case 'groupe': return ['m-g.' + d.code];
      case 'agent': return ['m-a.' + d.code];
    }
    return [];
  }
  /** Clés à créer : tout service (et ses rôles, et sa clé de consultation), tout groupe actif, tout compte actif. */
  function clesNecessaires(config, comptes, roles) {
    var o = options(config);
    if (o.chiffrement === 'desactive') return [];
    var res = [], svs = (config.services || []).map(function (x) { return x.code; });
    svs.forEach(function (sv) {
      res.push('m-s.' + sv);
      (roles || M.ROLES_DE_SERVICE).forEach(function (r) { res.push('m-r.' + r + '.' + sv); });
      if (o.consultation) res.push('m-c.' + sv);
    });
    G.liste(config).filter(function (g) { return g.actif; }).forEach(function (g) { res.push('m-g.' + g.code); });
    (comptes || []).filter(function (c) { return c && c.actif !== false && c.id !== 'secours'; }).forEach(function (c) { res.push('m-a.' + c.id); });
    return res;
  }
  /**
   * Remise d'une clé de la messagerie à un compte. `acces` : { messagerie (accès au module), consulter (droit de
   * consultation tracée) }. Le rôle d'administrateur n'y donne aucun droit propre (il détient techniquement toutes les
   * clés, comme pour chaque module : la lecture ne lui est proposée qu'en destinataire ou par une consultation tracée).
   */
  function aDroitCle(nom, compte, config, acces) {
    if (!compte || !acces) return false;
    var c = normaliser(compte, config), sv = c.services || [], p = String(nom).split('.'), genre = p[0];
    if (genre === 'm-c') return !!acces.consulter && options(config).consultation && sv.indexOf(p[1]) >= 0;
    if (!acces.messagerie) return false;
    if (genre === 'm-a') return p.slice(1).join('.') === c.id;
    if (genre === 'm-s') return sv.indexOf(p[1]) >= 0;
    if (genre === 'm-r') return (c.roles || []).indexOf(p[1]) >= 0 && sv.indexOf(p[2]) >= 0;
    if (genre === 'm-g') return G.de(config, c.id).indexOf(p.slice(1).join('.')) >= 0;
    return false;
  }
  /**
   * Clés pour lesquelles un message chiffré est emballé : ses destinataires (tout l'établissement : chaque service),
   * l'auteur, et la consultation des services concernés et de ceux de l'auteur.
   */
  function clesPourMessage(dest, auteur, config, comptes) {
    var res = [], o = options(config);
    function aj(n) { if (res.indexOf(n) < 0) res.push(n); }
    (dest || []).forEach(function (d) {
      if (d.genre === 'etablissement') (config.services || []).forEach(function (x) { aj('m-s.' + x.code); });
      else nomCle(d).forEach(aj);
    });
    if (auteur) aj('m-a.' + auteur.id);
    if (o.consultation) {
      // Agents nommés : services de chacun (`comptes`), pour que le cadre de leur service puisse consulter
      var svsAgents = [];
      (dest || []).forEach(function (d) { if (d.genre === 'agent') { var c = (comptes || []).filter(function (x) { return x.id === d.code; })[0]; if (c) svsAgents = svsAgents.concat(normaliser(c, config).services || []); } });
      servicesDe(dest, config).concat((normaliser(auteur, config) || {}).services || [], svsAgents).forEach(function (sv) { aj('m-c.' + sv); });
    }
    return res;
  }

  // ------------------------------------------------------------ Contrôles
  function estEncadrement(compte) { var r = (compte && compte.roles) || []; return r.indexOf('CADRE') >= 0 || r.indexOf('ADMIN') >= 0; }
  /**
   * Destinataires permis à l'auteur : un agent sans fonction d'encadrement écrit à ses services, à ses groupes (dont il
   * est membre, ou groupes de ses services), à un rôle de ses services, à des agents nommés, et à un seul service à la
   * fois ; plusieurs services ou tout l'établissement : cadre et administrateur.
   */
  function controlerDestinataires(dest, compte, config) {
    if (!Array.isArray(dest) || !dest.length) throw new Error('Choisissez au moins un destinataire.');
    if (dest.length > 50) throw new Error('Trop de destinataires (50 au plus).');
    dest.forEach(function (d) {
      if (!d || GENRES_DEST.indexOf(d.genre) < 0) throw new Error('Destinataire mal formé.');
      if (d.genre !== 'etablissement' && !texte(d.code, 60)) throw new Error('Destinataire mal formé.');
      if (d.genre === 'role' && !texte(d.service, 60)) throw new Error('Indiquez le service du rôle.');
    });
    if (estEncadrement(compte)) return;
    var sv = (compte && compte.services) || [], mesGroupes = (compte && compte.groupes) || [];
    dest.forEach(function (d) {
      if (d.genre === 'etablissement') throw new Error('Écrire à tout l’établissement est réservé au cadre et à l’administrateur.');
      if (d.genre === 'service' && sv.indexOf(d.code) < 0) throw new Error('Vous ne pouvez écrire qu’à vos services.');
      if (d.genre === 'role' && sv.indexOf(d.service) < 0) throw new Error('Vous ne pouvez écrire qu’à un rôle de vos services.');
      if (d.genre === 'groupe') {
        var g = G.liste(config).filter(function (x) { return x.code === d.code; })[0];
        if (!g || !(mesGroupes.indexOf(g.code) >= 0 || (g.services.length && g.services.every(function (s) { return sv.indexOf(s) >= 0; })))) throw new Error('Vous ne pouvez écrire qu’à vos groupes.');
      }
    });
    var svsDest = [];
    dest.forEach(function (d) { var s = d.genre === 'service' ? d.code : d.genre === 'role' ? d.service : null; if (s && svsDest.indexOf(s) < 0) svsDest.push(s); });
    if (svsDest.length > 1) throw new Error('Écrire à plusieurs services est réservé au cadre et à l’administrateur.');
  }
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { messages: {} }, config = (ctx && ctx.config) || {}, compte = normaliser(ctx && ctx.compte, config), m;
    if (type === 'MESSAGE') {
      if (!d.id || st.messages[d.id]) throw new Error('Message déjà enregistré.');
      var oc = options(config);
      if (oc.chiffrement === 'impose' && !d.chiffre) throw new Error('L’établissement impose le chiffrement réservé aux destinataires.');
      if (d.chiffre) {
        // Contenu chiffré (objet, texte, éléments rattachés, pièces jointes, libellés du sondage) : contrôlé avant le chiffrement
        if (oc.chiffrement === 'desactive') throw new Error('Le chiffrement réservé aux destinataires n’est pas activé dans cet établissement.');
        if (typeof d.chiffre.ct !== 'string' || !d.chiffre.cles || typeof d.chiffre.cles !== 'object' || !Object.keys(d.chiffre.cles).length) throw new Error('Message chiffré mal formé.');
        if (d.objet || d.texte || (d.pieces && d.pieces.length) || (d.rattaches && d.rattaches.length)) throw new Error('Message chiffré : le contenu ne doit pas être en clair.');
        controlerDestinataires(d.destinataires, compte, config);
        if (d.sondage && !(ctx && typeof ctx.peut === 'function' && ctx.peut('SONDAGE_CLOTURE'))) throw new Error('Votre rôle ne permet pas de créer un sondage (réglage de l’établissement : cadre et administrateur par défaut).');
        return;
      }
      if (!texte(d.objet)) throw new Error('Indiquez l’objet du message.');
      if (String(d.objet).length > 150) throw new Error('Objet trop long (150 caractères au plus).');
      if (!String(d.texte || '').trim()) throw new Error('Le message est vide.');
      if (String(d.texte).length > 5000) throw new Error('Message trop long (5 000 caractères au plus).');
      controlerDestinataires(d.destinataires, compte, config);
      if (d.accuse !== undefined && !ACCUSES[d.accuse]) throw new Error('Accusé de lecture inconnu.');
      if (d.reponses !== undefined && !REPONSES[d.reponses]) throw new Error('Choix des réponses inconnu.');
      if (d.jusquau && !JOUR.test(d.jusquau)) throw new Error('Date de fin d’affichage invalide.');
      var r = d.rattaches || [];
      if (!Array.isArray(r) || r.length > MAX_RATTACHES) throw new Error('Dix éléments rattachés au plus.');
      r.forEach(function (x) { if (!x || !RATTACHABLES[x.module] || !texte(x.id, 80) || !texte(x.genre, 40)) throw new Error('Élément rattaché mal formé.'); });
      if (d.sondage) {
        if (!(ctx && typeof ctx.peut === 'function' && ctx.peut('SONDAGE_CLOTURE'))) throw new Error('Votre rôle ne permet pas de créer un sondage (réglage de l’établissement : cadre et administrateur par défaut).');
        var sd = d.sondage, n0 = Array.isArray(sd.options) ? sd.options.length : 0;
        if (!GENRES_SONDAGE[sd.genre]) throw new Error('Type de sondage inconnu.');
        if (n0 < 2 || n0 > MAX_OPTIONS) throw new Error('Un sondage propose de 2 à 10 réponses.');
        var vusO = {};
        sd.options.forEach(function (x) {
          if (!x || !/^o[0-9a-z]{1,12}$/.test(x.id || '') || vusO[x.id]) throw new Error('Réponse du sondage mal formée.');
          vusO[x.id] = 1;
          if (sd.genre === 'dates' ? !JOUR.test(x.jour || '') : !texte(x.libelle)) throw new Error(sd.genre === 'dates' ? 'Indiquez chaque date proposée.' : 'Une réponse du sondage est vide.');
        });
        if (sd.cloture && !JOUR.test(sd.cloture)) throw new Error('Date de clôture invalide.');
      }
      var p = d.pieces || [], o = options(config);
      if (!Array.isArray(p)) throw new Error('Pièces jointes mal formées.');
      if (p.length && !o.piecesJointes) throw new Error('Les pièces jointes ne sont pas activées dans cet établissement.');
      if (p.length > MAX_PIECES) throw new Error('Dix pièces jointes au plus.');
      p.forEach(function (x) {
        if (!x || !/^PJ[0-9a-f]{8,32}$/.test(x.id || '') || !texte(x.nom, 200)) throw new Error('Pièce jointe mal formée.');
        if (o.typesPieces.indexOf(ext(x.nom)) < 0) throw new Error('Type de fichier non autorisé : ' + x.nom + ' (autorisés : ' + o.typesPieces.join(', ') + ').');
        if (!(+x.taille > 0) || +x.taille > o.tailleMaxMo * 1048576) throw new Error('Fichier trop volumineux : ' + x.nom + ' (' + o.tailleMaxMo + ' Mo au plus).');
      });
      return;
    }
    m = st.messages[d.message];
    if (!m) throw new Error('Message introuvable.');
    var groupes = (compte && compte.groupes) || [];
    if (type === 'MESSAGE_RETRAIT') {
      if (m.retire) throw new Error('Message déjà retiré.');
      if (!compte || (m.par !== compte.id && (compte.roles || []).indexOf('ADMIN') < 0)) throw new Error('Seul l’auteur retire son message.');
      return;
    }
    if (m.retire) throw new Error('Ce message a été retiré par son auteur.');
    if (type === 'MESSAGE_REPONSE') {
      if (m.reponses === 'aucune') throw new Error('L’auteur n’attend pas de réponse à ce message.');
      if (!concerne(m, compte, groupes)) throw new Error('Ce message ne vous est pas adressé.');
      if (d.a !== undefined && d.a !== '' && (!compte || m.par !== compte.id)) throw new Error('Seul l’auteur répond à un agent en particulier.');
      if (m.chiffre && !d.chiffre) throw new Error('Message chiffré : la réponse doit l’être aussi.');
      if (!d.chiffre && !String(d.texte || '').trim()) throw new Error('La réponse est vide.');
      if (String(d.texte || '').length > 2000) throw new Error('Réponse trop longue (2 000 caractères au plus).');
      return;
    }
    if (type === 'MESSAGE_LU' && !concerne(m, compte, groupes)) throw new Error('Ce message ne vous est pas adressé.');
    if (type === 'MESSAGE_ARCHIVE' && !concerne(m, compte, groupes)) throw new Error('Ce message ne vous est pas adressé.');
    if (type === 'VOTE') {
      if (!m.sondage) throw new Error('Ce message n’a pas de sondage.');
      if (!sondageOuvert(m, ctx && ctx.maintenant)) throw new Error('Le sondage est clos.');
      if (!concerne(m, compte, groupes)) throw new Error('Ce message ne vous est pas adressé.');
      var ok = (d.choix || []).filter(function (c) { return m.sondage.options.some(function (x) { return x.id === c; }); });
      if (!ok.length && !(m.sondage.autre && String(d.autre || '').trim())) throw new Error('Choisissez au moins une réponse.');
      if (m.sondage.genre === 'unique' && ok.length > 1) throw new Error('Une seule réponse possible.');
      return;
    }
    if (type === 'CONSULTATION') {
      if (!m.chiffre) throw new Error('Seul un message chiffré se consulte : les autres sont lisibles par les destinataires.');
      if (MOTIFS_CONSULTATION.indexOf(d.motif) < 0) throw new Error('Choisissez le motif de la consultation.');
      if (!texte(d.precision, 500)) throw new Error('Précisez le motif de la consultation.');
      if (concerne(m, compte, groupes)) throw new Error('Ce message vous est adressé : ouvrez-le simplement.');
      if (!options(config).consultation) throw new Error('La consultation par le cadre n’est pas activée dans cet établissement.');
      return;
    }
    if (type === 'SONDAGE_CLOTURE') {
      if (!m.sondage) throw new Error('Ce message n’a pas de sondage.');
      if (m.sondage.close) throw new Error('Le sondage est déjà clos.');
      if (!compte || (m.par !== compte.id && (compte.roles || []).indexOf('ADMIN') < 0)) throw new Error('Seul l’auteur clôt son sondage.');
      return;
    }
    if (type === 'MESSAGE_RELANCE' && !(compte && (m.par === compte.id || estEncadrement(compte)))) throw new Error('Seuls l’auteur et le cadre relancent un message.');
  }
  /**
   * Réglages écrits par le cadre (`config.messagerie`) : seulement l'entrée de ses services (durée d'affichage) ; les
   * réglages de l'établissement (onglet Informations, pièces jointes, conservation) restent à l'administrateur.
   */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) {
      if (JSON.stringify(a[k]) === JSON.stringify(nouveau[k])) return true;
      return k !== '*' && sv.indexOf(k) >= 0 && (!nouveau[k] || Object.keys(nouveau[k]).every(function (c) { return c === 'affichageJours'; }));
    });
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'messagerie.lire', libelle: 'Lire les messages reçus, confirmer la lecture, archiver, répondre aux sondages', types: ['MESSAGE_LU', 'MESSAGE_ARCHIVE', 'VOTE'] },
    { code: 'messagerie.ecrire', libelle: 'Écrire, répondre, relancer et retirer ses messages', types: ['MESSAGE', 'MESSAGE_REPONSE', 'MESSAGE_RELANCE', 'MESSAGE_RETRAIT'] },
    { code: 'messagerie.sondage', libelle: 'Créer des sondages et les clore', types: ['SONDAGE_CLOTURE'] },
    { code: 'messagerie.consulter', libelle: 'Consulter un message chiffré qui ne vous est pas adressé (motif obligatoire, inscrit au journal) : cadre, auditeur', types: ['CONSULTATION'] }
  ];
  // Droits proposés : tous les rôles lisent et écrivent ; l'appartenance aux services et aux groupes fait le reste
  // Sondages : cadre (et administrateur) par défaut, réglable dans Rôles et accès (décision du porteur du 11 novembre 2026)
  var SANS_SONDAGE = TYPES.filter(function (t) { return t !== 'SONDAGE_CLOTURE' && t !== 'CONSULTATION'; });
  var DROITS = { IDE: SANS_SONDAGE.slice(), AS: SANS_SONDAGE.slice(), SECRETAIRE: SANS_SONDAGE.slice(), CADRE: TYPES.slice() };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: [], module: 'messagerie', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.messagerie : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {};
    if (e.type === 'MESSAGE') return Array.isArray(d.services) ? d.services : [];
    // Lecture, réponse, archive d'un message déjà envoyé : pas de contrôle d'activation (le service a pu être désactivé depuis)
    return [];
  }

  var contrat = {
    id: 'messagerie',
    libelle: 'Messagerie',
    version: '0.1.0',
    icone: 'MS',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { messagerie: controlerCadre } },
    vues: { onglets: [{ code: 'recus', libelle: 'Reçus' }, { code: 'envoyes', libelle: 'Envoyés' }, { code: 'informations', libelle: 'Informations' }, { code: 'archives', libelle: 'Archives' },
      { code: 'consultation', libelle: 'Consultation', droit: 'CONSULTATION' }] },
    migrations: [],
    fournitures: [],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, ACCUSES: ACCUSES, REPONSES: REPONSES, RATTACHABLES: RATTACHABLES, INFORMATIONS: INFORMATIONS,
    TYPES_PIECES_DEFAUT: TYPES_PIECES_DEFAUT, MAX_PIECES: MAX_PIECES, MAX_RATTACHES: MAX_RATTACHES,
    options: options, estDestinataire: estDestinataire, servicesDe: servicesDe, destinatairesResolus: destinatairesResolus, suiviLectures: suiviLectures,
    CHIFFREMENTS: CHIFFREMENTS, MOTIFS_CONSULTATION: MOTIFS_CONSULTATION, clesNecessaires: clesNecessaires, aDroitCle: aDroitCle, clesPourMessage: clesPourMessage,
    GENRES_SONDAGE: GENRES_SONDAGE, MAX_OPTIONS: MAX_OPTIONS, sondageOuvert: sondageOuvert, resultats: resultats, participation: participation,
    concerne: concerne, reponsesVisibles: reponsesVisibles, situation: situation, liste: liste, enAttente: enAttente, messagesDe: messagesDe,
    affichable: affichable, ext: ext, normaliser: normaliser, controler: controler, controlerDestinataires: controlerDestinataires, controlerCadre: controlerCadre, jourISO: jourISO, plusJours: plusJours };
});
