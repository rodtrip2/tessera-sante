// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Équipe — contrat déclaré au registre des modules (0.27.0, lot C, décisions du porteur du 11 novembre 2026).
 *
 * Fiches des agents : téléphone et courriel professionnels (visibles de tous les agents), téléphone et courriel
 * personnels (chiffrés pour le seul agent, le cadre de ses services et l'administrateur, avec l'accord de l'agent).
 * Numéro personnel des médecins de la liste commune : chiffré pour le cadre et le médecin chef de service (rôle à
 * venir). L'agent remplit sa fiche ; le cadre complète celles des agents de ses services. Journal `modules\equipe\`.
 * Les parties chiffrées sont des enveloppes (session.chiffrerEnveloppe) : le module n'en voit que le contenu opaque.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).equipe = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['COORDONNEES', 'COORDONNEES_MEDECIN'];
  var TEL = /^[0-9+().\s-]{2,30}$/, MAIL = /^[^\s@]{1,80}@[^\s@]{1,80}$/;

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function enveloppe(x) { return x && typeof x === 'object' && x.cles && typeof x.ct === 'string' ? { cles: x.cles, ct: x.ct } : null; }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, x;
    if (e.type === 'COORDONNEES' && d.agent) {
      x = st.agents[d.agent] || (st.agents[d.agent] = { agent: d.agent, telPro: '', mailPro: '', fonction: '', perso: null, accord: false });
      ['telPro', 'mailPro', 'fonction'].forEach(function (k) { if (d[k] !== undefined) x[k] = texte(d[k], k === 'mailPro' ? 120 : 80); });
      if (d.perso !== undefined) x.perso = enveloppe(d.perso);
      if (d.accord !== undefined) x.accord = !!d.accord;
      if (!x.accord) x.perso = null;   // sans l'accord de l'agent, ses coordonnées personnelles ne sont plus lues
      x.le = e.at; x.par = e.by;
    }
    if (e.type === 'COORDONNEES_MEDECIN' && d.medecin) {
      x = st.medecins[d.medecin] || (st.medecins[d.medecin] = { medecin: d.medecin, perso: null });
      if (d.perso !== undefined) x.perso = enveloppe(d.perso);
      x.le = e.at; x.par = e.by;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'equipe', etat: function () { return { agents: {}, medecins: {} }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function fiche(st, agent) { return (st && st.agents && st.agents[agent]) || { agent: agent, telPro: '', mailPro: '', fonction: '', perso: null, accord: false }; }
  /** Clés qui lisent les coordonnées personnelles d'un agent : ses services, et sa clé de liste (relecture par lui-même). */
  function clesAgent(agent, services) { return (services || []).map(function (s) { return 'e-p.' + s; }).concat(agent ? ['t-a.' + agent] : []); }
  /** Clés qui lisent le numéro personnel d'un médecin : ses services (aucun : tous les services de l'établissement). */
  function clesMedecin(medecin, tousServices) {
    var svs = medecin && medecin.services && medecin.services.length ? medecin.services : (tousServices || []);
    return svs.map(function (s) { return 'e-m.' + s; });
  }
  /** Le compte gère-t-il la fiche (lui-même, cadre d'un service de l'agent, administrateur) ? */
  function gere(compte, agent, servicesAgent) {
    var r = (compte && compte.roles) || [];
    if (!compte) return false;
    if (compte.id === agent || r.indexOf('ADMIN') >= 0) return true;
    return r.indexOf('CADRE') >= 0 && (servicesAgent || []).some(function (s) { return (compte.services || []).indexOf(s) >= 0; });
  }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var c = ctx && ctx.compte, r = (c && c.roles) || [];
    if (type === 'COORDONNEES') {
      if (!d.agent) throw new Error('Agent manquant.');
      if (!c || (c.id !== d.agent && r.indexOf('ADMIN') < 0 && r.indexOf('CADRE') < 0)) throw new Error('Seuls l’agent, le cadre de ses services et l’administrateur modifient sa fiche.');
      if (d.telPro && !TEL.test(d.telPro)) throw new Error('Téléphone professionnel invalide.');
      if (d.mailPro && !MAIL.test(d.mailPro)) throw new Error('Courriel professionnel invalide.');
      if (d.perso && !enveloppe(d.perso)) throw new Error('Coordonnées personnelles mal chiffrées.');
      if (d.perso && d.accord === false) throw new Error('Coordonnées personnelles sans l’accord de l’agent.');
      if (d.perso && c.id !== d.agent && d.accord === undefined && !(ctx.etat && ctx.etat.agents[d.agent] && ctx.etat.agents[d.agent].accord)) throw new Error('L’agent n’a pas donné son accord pour ses coordonnées personnelles.');
      if (d.accord !== undefined && c.id !== d.agent && r.indexOf('ADMIN') < 0) throw new Error('Seul l’agent donne ou retire son accord.');
      return;
    }
    if (type === 'COORDONNEES_MEDECIN') {
      if (!d.medecin) throw new Error('Médecin manquant.');
      if (d.perso && !enveloppe(d.perso)) throw new Error('Numéro personnel mal chiffré.');
    }
  }
  /** L'agent tient sa propre fiche sans accès particulier. */
  function permisPourSoi(type, data, compte) { return type === 'COORDONNEES' && !!compte && !!data && data.agent === compte.id; }

  var ACCES = [
    { code: 'equipe.consulter', libelle: 'Consulter l’annuaire de l’équipe (coordonnées professionnelles)', types: [] },
    { code: 'equipe.fiches', libelle: 'Compléter les fiches des agents de ses services (cadre)', types: ['COORDONNEES'] },
    { code: 'equipe.medecins', libelle: 'Tenir le numéro personnel des médecins de ses services (cadre, médecin chef de service)', types: ['COORDONNEES_MEDECIN'] }
  ];
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: { CADRE: TYPES.slice() }, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'equipe', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.equipe : undefined; },
    appartenance: 'role'
  });
  function cibles() { return []; }

  var contrat = {
    id: 'equipe',
    libelle: 'Équipe',
    version: '0.1.0',
    icone: 'EQ',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: cibles },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'annuaire', libelle: 'Annuaire' }, { code: 'ma-fiche', libelle: 'Ma fiche' }, { code: 'medecins', libelle: 'Médecins', droit: 'COORDONNEES_MEDECIN' }] },
    migrations: [],
    fournitures: [
      // Numéro et courriel professionnels d'un agent, pour la petite fiche de contact des autres modules
      { nom: 'equipe.contact', version: 1, acces: 'lecture', champs: ['telPro', 'mailPro', 'fonction'], lire: function (st, o) { var f = fiche(st, o.agent); return { telPro: f.telPro, mailPro: f.mailPro, fonction: f.fonction }; } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, fiche: fiche, clesAgent: clesAgent, clesMedecin: clesMedecin, gere: gere, controler: controler, permisPourSoi: permisPourSoi, TEL: TEL, MAIL: MAIL };
});
