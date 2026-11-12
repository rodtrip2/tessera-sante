// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — accès particuliers (lot D, 0.31.0, décisions du porteur du 12 novembre 2026).
 *
 * 1. Prêt de droits pendant une absence (réglage commun `delegations`) : un agent confie pour une durée limitée tout ou
 *    partie de ses rôles, dans certains de ses services, à un collègue. Prêté par l'agent lui-même, par le cadre (ou le
 *    cadre supérieur) pour ses services, ou par l'administrateur (qui peut prêter tout rôle, y compris un rôle créé pour
 *    un seul accès dans « Rôles et accès »). Jamais le rôle d'administrateur. Un droit = une clé : les clés des rôles
 *    prêtés sont remises par la session d'un administrateur, retirées à la fin du prêt (nouvelle génération). Chaque
 *    saisie faite grâce au prêt porte « pour le compte de… ». Les messages personnels de l'absent ne sont pas prêtés.
 * 2. Intervenants extérieurs (rôle INTERVENANT) : comptes datés demandés par le cadre pour ses services (réglage commun
 *    `comptesDemandes`), créés par la session d'un administrateur ; charte de confidentialité réglable, acceptée à la
 *    première connexion.
 * Logique sans interface, testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).delegations = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DUREE_MAX_JOURS = 186;            // six mois au plus par prêt
  var NON_PRETABLES = ['ADMIN', 'INTERVENANT'];
  var ENCADREMENT = ['CADRE', 'CADRE_SUP'];
  var TYPES_INTERVENANT = { benevole: 'Bénévole ou intervenant associatif', enseignant: 'Enseignant', liberal: 'Intervenant libéral', etudiant: 'Étudiant ou stagiaire', autre: 'Autre intervenant' };
  var VALIDITE_MAX_JOURS = 366;         // compte d'intervenant : un an au plus, prolongeable

  function texte(v, n) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 80); }
  function jour(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
  function liste(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : []; }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ecart(a, b) { var x = a.split('-'), y = b.split('-'); return Math.round((new Date(+y[0], +y[1] - 1, +y[2]) - new Date(+x[0], +x[1] - 1, +x[2])) / 864e5); }
  function roles(c) { return (c && c.roles) || []; }
  function estAdmin(c) { return roles(c).indexOf('ADMIN') >= 0; }
  function estEncadrant(c) { return roles(c).some(function (r) { return ENCADREMENT.indexOf(r) >= 0; }); }
  function inclus(a, b) { return a.every(function (x) { return b.indexOf(x) >= 0; }); }

  // ------------------------------------------------------------ Prêts de droits
  function pret(d) {
    if (!d || !/^[a-z0-9-]{3,40}$/.test(d.id || '') || !texte(d.de, 40) || !texte(d.a, 40)) return null;
    return { id: d.id, de: texte(d.de, 40), a: texte(d.a, 40), debut: jour(d.debut), fin: jour(d.fin), roles: liste(d.roles).filter(function (r) { return NON_PRETABLES.indexOf(r) < 0; }),
      services: liste(d.services), motif: texte(d.motif, 120), par: texte(d.par, 40), le: texte(d.le, 30), annule: d.annule === true, annulePar: texte(d.annulePar, 40) };
  }
  /** Prêts du réglage, validés (les incomplets sont écartés). */
  function prets(config) {
    var x = config && config.delegations, l = x && Array.isArray(x.prets) ? x.prets : [];
    return l.map(pret).filter(function (d) { return d && d.debut && d.fin && d.roles.length; });
  }
  function enCours(d, aujourdhui) { return !d.annule && d.debut <= aujourdhui && aujourdhui <= d.fin; }
  /** Prêts en cours reçus par un agent (ou donnés, `sens` = 'de'), au jour `maintenant`. */
  function actifs(config, agentId, maintenant, sens) {
    var j = jourISO(maintenant || Date.now());
    return prets(config).filter(function (d) { return enCours(d, j) && d[sens || 'a'] === agentId; });
  }
  /**
   * Compte avec les rôles et services prêtés en cours (pour l'affichage, les droits et les clés) ; `pretsRecus` les
   * énumère. Un compte inactif ou expiré ne reçoit rien. Le compte d'origine n'est pas modifié.
   */
  function appliquer(compte, config, maintenant) {
    if (!compte || compte.actif === false) return compte;
    var ds = actifs(config, compte.id, maintenant);
    if (!ds.length) return compte;
    var r = roles(compte).slice(), s = (compte.services || []).slice();
    ds.forEach(function (d) { d.roles.forEach(function (x) { if (r.indexOf(x) < 0) r.push(x); }); d.services.forEach(function (x) { if (s.indexOf(x) < 0) s.push(x); }); });
    return Object.assign({}, compte, { roles: r, services: s, pretsRecus: ds });
  }
  /**
   * Prêt qui permet une saisie que les rôles propres de l'agent ne permettent pas : celui dont il agit « pour le compte » ;
   * `peut(roles)` : la saisie est-elle permise à ces rôles ? null si ses propres rôles suffisent ou si aucun prêt n'aide.
   */
  function pourLeCompteDe(compte, config, maintenant, peut) {
    if (!compte || peut(roles(compte))) return null;
    var ds = actifs(config, compte.id, maintenant);
    for (var i = 0; i < ds.length; i++) if (peut(roles(compte).concat(ds[i].roles))) return ds[i];
    return null;
  }
  /**
   * Prêt permis à l'agent `auteur` ? Erreur en clair sinon. `comptes` : comptes connus (rôles et services du prêteur).
   * Agent : ses propres rôles et services ; cadre et cadre supérieur : rôles du prêteur, services à lui ; administrateur :
   * tout rôle sauf l'administration.
   */
  function controlerPret(d, auteur, comptes) {
    var de = (comptes || []).filter(function (c) { return c.id === d.de; })[0], a = (comptes || []).filter(function (c) { return c.id === d.a; })[0];
    if (!de || !a) throw new Error('Agent inconnu.');
    if (d.de === d.a) throw new Error('Un agent ne se prête pas ses propres droits.');
    if (!d.debut || !d.fin || d.fin < d.debut) throw new Error('Indiquez le début et la fin du prêt (la fin après le début).');
    if (ecart(d.debut, d.fin) > DUREE_MAX_JOURS) throw new Error('Un prêt dure six mois au plus.');
    if (!d.roles.length) throw new Error('Choisissez au moins un rôle à prêter.');
    if (roles(a).indexOf('INTERVENANT') >= 0) throw new Error('Les droits ne se prêtent pas à un intervenant extérieur.');
    if (estAdmin(auteur)) return true;
    if (!inclus(d.roles, roles(de))) throw new Error('Seuls les rôles de ' + de.nom + ' peuvent être prêtés.');
    if (!inclus(d.services, de.services || [])) throw new Error('Seuls les services de ' + de.nom + ' peuvent être prêtés.');
    if (auteur.id === d.de) return true;
    if (estEncadrant(auteur) && d.services.length && inclus(d.services, auteur.services || [])) return true;
    throw new Error('Vous ne pouvez prêter que vos propres droits' + (estEncadrant(auteur) ? ', ou ceux des agents de vos services' : '') + '.');
  }
  /**
   * Contrôle d'un changement du réglage `delegations` par un agent : chaque prêt ajouté, modifié ou annulé doit lui être
   * permis (avant et après le changement). Renvoie vrai ou faux (contrôle de la session avant l'enregistrement).
   */
  function controler(ancien, nouveau, auteur, comptes) {
    if (!nouveau || !Array.isArray(nouveau.prets)) return false;
    if (estAdmin(auteur)) return true;
    var avant = {}, apres = {};
    ((ancien && ancien.prets) || []).forEach(function (d) { if (d && d.id) avant[d.id] = d; });
    nouveau.prets.forEach(function (d) { if (d && d.id) apres[d.id] = d; });
    try {
      Object.keys(apres).forEach(function (id) {
        if (JSON.stringify(avant[id]) === JSON.stringify(apres[id])) return;
        var x = pret(apres[id]); if (!x) throw new Error('Prêt incomplet.');
        if (avant[id]) controlerPret(pret(avant[id]), auteur, comptes);
        if (!x.annule) controlerPret(x, auteur, comptes);
      });
      Object.keys(avant).forEach(function (id) { if (!apres[id]) controlerPret(pret(avant[id]), auteur, comptes); });
    } catch (e) { return false; }
    return true;
  }
  /** Prêts terminés depuis plus d'un an : retirés du réglage (gardés dans le journal). */
  function aRetirer(config, maintenant) {
    var j = jourISO((maintenant || Date.now()) - 366 * 864e5);
    return prets(config).filter(function (d) { return d.fin < j; }).map(function (d) { return d.id; });
  }

  // ------------------------------------------------------------ Intervenants extérieurs : demandes de compte
  function demande(d) {
    if (!d || !/^[a-z0-9-]{3,40}$/.test(d.id || '')) return null;
    return {
      id: d.id, action: d.action === 'modifier' ? 'modifier' : 'creer', etat: ['attente', 'faite', 'annulee', 'refusee'].indexOf(d.etat) >= 0 ? d.etat : 'attente',
      compte: texte(d.compte, 40), login: texte(d.login, 40).toLowerCase(), nom: texte(d.nom, 80), type: TYPES_INTERVENANT[d.type] ? d.type : 'autre',
      services: liste(d.services), finValidite: jour(d.finValidite), actif: d.actif !== false,
      // Préparé par le poste du cadre : partie publique et partie privée emballée par le mot de passe provisoire (jamais le mot de passe)
      publique: d.publique && typeof d.publique === 'object' ? d.publique : null, emb: d.emb && typeof d.emb === 'object' ? d.emb : null,
      par: texte(d.par, 40), le: texte(d.le, 30), traiteLe: texte(d.traiteLe, 30), message: texte(d.message, 200)
    };
  }
  function demandes(config) { var x = config && config.comptesDemandes, l = x && Array.isArray(x.demandes) ? x.demandes : []; return l.map(demande).filter(Boolean); }
  function enAttente(config) { return demandes(config).filter(function (d) { return d.etat === 'attente'; }); }
  /** Demande permise au cadre : intervenant de ses services, date de fin dans l'année. Erreur en clair sinon. */
  function controlerDemande(d, auteur, comptes, maintenant) {
    if (!estEncadrant(auteur) && !estAdmin(auteur)) throw new Error('Réservé au cadre et à l’administrateur.');
    if (!d.services.length) throw new Error('Choisissez au moins un service.');
    if (!estAdmin(auteur) && !inclus(d.services, auteur.services || [])) throw new Error('Choisissez parmi vos services.');
    var auj = jourISO(maintenant || Date.now());
    if (d.actif && (!d.finValidite || d.finValidite < auj)) throw new Error('Indiquez la date de fin du compte (aujourd’hui ou plus tard).');
    if (d.actif && ecart(auj, d.finValidite) > VALIDITE_MAX_JOURS) throw new Error('Un compte d’intervenant vaut un an au plus (prolongeable).');
    if (d.action === 'creer') {
      if (!/^[a-z0-9._-]{2,40}$/.test(d.login)) throw new Error('Identifiant : lettres minuscules, chiffres, point, tiret (2 à 40 caractères).');
      if (!d.nom) throw new Error('Indiquez le nom de l’intervenant.');
      if (!d.publique || !d.emb) throw new Error('Demande incomplète.');
      if ((comptes || []).some(function (c) { return c.login === d.login; })) throw new Error('L’identifiant « ' + d.login + ' » existe déjà.');
    } else {
      var c = (comptes || []).filter(function (x) { return x.id === d.compte; })[0];
      if (!c || roles(c).join() !== 'INTERVENANT') throw new Error('Seuls les comptes d’intervenants extérieurs se modifient ainsi.');
      if (!estAdmin(auteur) && !(c.services || []).some(function (s) { return (auteur.services || []).indexOf(s) >= 0; })) throw new Error('Intervenant d’un autre service.');
    }
    return true;
  }
  /** Contrôle d'un changement du réglage `comptesDemandes` : demandes ajoutées par le cadre, annulées par leur auteur. */
  function controlerDemandes(ancien, nouveau, auteur, comptes) {
    if (!nouveau || !Array.isArray(nouveau.demandes)) return false;
    if (estAdmin(auteur)) return true;
    var avant = {};
    ((ancien && ancien.demandes) || []).forEach(function (d) { if (d && d.id) avant[d.id] = d; });
    var vus = {};
    try {
      nouveau.demandes.forEach(function (x) {
        if (!x || !x.id) throw new Error('Demande sans identifiant.');
        vus[x.id] = 1;
        if (JSON.stringify(avant[x.id]) === JSON.stringify(x)) return;
        var d = demande(x);
        if (!avant[x.id]) { if (d.etat !== 'attente' || d.par !== auteur.id) throw new Error('Demande nouvelle en attente seulement.'); controlerDemande(d, auteur, comptes); return; }
        var a = demande(avant[x.id]);
        // Seule l'annulation d'une demande en attente, par son auteur, est permise au cadre
        if (!(a.etat === 'attente' && d.etat === 'annulee' && a.par === auteur.id && JSON.stringify(Object.assign({}, a, { etat: 'annulee' })) === JSON.stringify(Object.assign({}, d)))) throw new Error('Changement non permis.');
      });
      Object.keys(avant).forEach(function (id) { if (!vus[id]) throw new Error('Une demande ne se supprime pas.'); });
    } catch (e) { return false; }
    return true;
  }

  // ------------------------------------------------------------ Charte de confidentialité
  function charte(config) {
    var c = (config && config.charteIntervenants) || {};
    return { texte: texte(c.texte, 8000), version: Math.max(0, Math.round(+c.version) || 0) };
  }
  /** La charte doit-elle être acceptée par ce compte ? (intervenant, charte rédigée, version pas encore acceptée) */
  function charteAAccepter(compte, config, acceptee) {
    var c = charte(config);
    return !!compte && roles(compte).indexOf('INTERVENANT') >= 0 && !!c.texte && c.version > 0 && !(acceptee && acceptee.version >= c.version);
  }

  return { DUREE_MAX_JOURS: DUREE_MAX_JOURS, NON_PRETABLES: NON_PRETABLES, TYPES_INTERVENANT: TYPES_INTERVENANT, VALIDITE_MAX_JOURS: VALIDITE_MAX_JOURS,
    pret: pret, prets: prets, actifs: actifs, enCours: enCours, appliquer: appliquer, pourLeCompteDe: pourLeCompteDe, controlerPret: controlerPret, controler: controler, aRetirer: aRetirer,
    demande: demande, demandes: demandes, enAttente: enAttente, controlerDemande: controlerDemande, controlerDemandes: controlerDemandes,
    charte: charte, charteAAccepter: charteAAccepter, jourISO: jourISO };
});
