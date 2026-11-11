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

  var TYPES = ['COORDONNEES', 'COORDONNEES_MEDECIN', 'REFERENTS', 'DOMAINE_REFERENT'];
  var ETABLISSEMENT = '*';
  // Domaines de référence proposés (décision du porteur du 11 novembre 2026), complétés ou masqués par le cadre et l'administrateur
  var DOMAINES_DEFAUT = [['plaies', 'Plaies et escarres'], ['pharmacie', 'Pharmacie'], ['libertes', 'Restriction des libertés (isolement, contention)'], ['hygiene', 'Hygiène'],
    ['douleur', 'Douleur'], ['identito', 'Identitovigilance'], ['materio', 'Matériovigilance'], ['hemo', 'Hémovigilance'], ['incendie', 'Sécurité incendie'],
    ['urgences', 'Urgences vitales'], ['etp', 'Éducation thérapeutique'], ['droits', 'Droits des patients']].map(function (x, i) { return { code: x[0], libelle: x[1], ordre: i + 1 }; });
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
    if (e.type === 'DOMAINE_REFERENT' && d.code && d.service) {
      x = st.domaines[d.service + '|' + d.code] || (st.domaines[d.service + '|' + d.code] = { code: d.code, service: d.service, libelle: '', masque: false });
      if (d.libelle !== undefined) x.libelle = texte(d.libelle, 80);
      if (d.masque !== undefined) x.masque = !!d.masque;
    }
    if (e.type === 'REFERENTS' && d.domaine && d.service) {
      var pers = function (l) { return (Array.isArray(l) ? l : []).filter(function (p) { return p && p.id; }).slice(0, 10).map(function (p) { return { id: String(p.id), nom: texte(p.nom, 80) }; }); };
      st.referents[d.service + '|' + d.domaine] = { service: d.service, domaine: d.domaine, titulaires: pers(d.titulaires), suppleants: pers(d.suppleants), precision: texte(d.precision, 160), le: e.at, par: e.by };
    }
    if (e.type === 'COORDONNEES_MEDECIN' && d.medecin) {
      x = st.medecins[d.medecin] || (st.medecins[d.medecin] = { medecin: d.medecin, perso: null });
      if (d.perso !== undefined) x.perso = enveloppe(d.perso);
      x.le = e.at; x.par = e.by;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'equipe', etat: function () { return { agents: {}, medecins: {}, domaines: {}, referents: {} }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function fiche(st, agent) { return (st && st.agents && st.agents[agent]) || { agent: agent, telPro: '', mailPro: '', fonction: '', perso: null, accord: false }; }
  /** Clés qui lisent les coordonnées personnelles d'un agent : ses services, et sa clé de liste (relecture par lui-même). */
  function clesAgent(agent, services) { return (services || []).map(function (s) { return 'e-p.' + s; }).concat(agent ? ['t-a.' + agent] : []); }
  /** Clés qui lisent le numéro personnel d'un médecin : ses services (aucun : tous les services de l'établissement). */
  function clesMedecin(medecin, tousServices) {
    var svs = medecin && medecin.services && medecin.services.length ? medecin.services : (tousServices || []);
    return svs.map(function (s) { return 'e-m.' + s; });
  }
  /**
   * Domaines d'une page (service, ou « * » : établissement) : domaines proposés, puis ceux ajoutés ; masqués rendus
   * seulement avec `masques`. [{ code, libelle, masque, propre }]
   */
  function domaines(st, service, masques) {
    var res = DOMAINES_DEFAUT.map(function (d) { var x = st.domaines[service + '|' + d.code]; return { code: d.code, libelle: (x && x.libelle) || d.libelle, masque: !!(x && x.masque), propre: false, ordre: d.ordre }; });
    Object.keys(st.domaines || {}).forEach(function (k) {
      var x = st.domaines[k];
      if (x.service !== service || DOMAINES_DEFAUT.some(function (d) { return d.code === x.code; })) return;
      res.push({ code: x.code, libelle: x.libelle || x.code, masque: x.masque, propre: true, ordre: 100 });
    });
    return res.filter(function (d) { return masques || !d.masque; });
  }
  /** Référents d'une page : [{ domaine, libelle, titulaires, suppleants, precision }] pour les domaines visibles qui en ont. */
  function referents(st, service, tous) {
    return domaines(st, service, false).map(function (d) {
      var r = st.referents[service + '|' + d.code] || { titulaires: [], suppleants: [], precision: '' };
      return { domaine: d.code, libelle: d.libelle, titulaires: r.titulaires, suppleants: r.suppleants, precision: r.precision || '' };
    }).filter(function (r) { return tous || r.titulaires.length || r.suppleants.length; });
  }
  /** Domaines où l'agent est référent (titulaire ou suppléant) : [{ service, libelle, suppleant }]. */
  function referentDe(st, agent) {
    var res = [];
    Object.keys(st.referents || {}).forEach(function (k) {
      var r = st.referents[k], d = domaines(st, r.service, false).filter(function (x) { return x.code === r.domaine; })[0];
      if (!d) return;
      if (r.titulaires.some(function (p) { return p.id === agent; })) res.push({ service: r.service, libelle: d.libelle, suppleant: false });
      else if (r.suppleants.some(function (p) { return p.id === agent; })) res.push({ service: r.service, libelle: d.libelle, suppleant: true });
    });
    return res;
  }
  /** Le compte tient la liste des référents (service : cadre du service ; établissement : administrateur) ? */
  function gereReferents(compte, service) {
    var r = (compte && compte.roles) || [];
    if (r.indexOf('ADMIN') >= 0) return true;
    return service !== ETABLISSEMENT && r.indexOf('CADRE') >= 0 && (compte.services || []).indexOf(service) >= 0;
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
    if (type === 'REFERENTS' || type === 'DOMAINE_REFERENT') {
      if (!d.service) throw new Error('Indiquez le service.');
      if (!gereReferents(c, d.service)) throw new Error(d.service === ETABLISSEMENT ? 'Seul l’administrateur tient les référents de l’établissement.' : 'Seul le cadre du service (ou l’administrateur) tient ses référents.');
      if (type === 'REFERENTS' && !d.domaine) throw new Error('Choisissez le domaine.');
      if (type === 'DOMAINE_REFERENT' && (!/^[a-z0-9-]{2,40}$/.test(d.code || '') || (d.libelle !== undefined && !texte(d.libelle)))) throw new Error('Indiquez le nom du domaine.');
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
    { code: 'equipe.referents', libelle: 'Tenir la liste des référents de ses services (cadre)', types: ['REFERENTS', 'DOMAINE_REFERENT'] },
    { code: 'equipe.medecins', libelle: 'Tenir le numéro personnel des médecins de ses services (cadre, médecin chef de service)', types: ['COORDONNEES_MEDECIN'] }
  ];
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: { CADRE: TYPES.slice(), MEDECIN_CHEF_SERVICE: ['COORDONNEES_MEDECIN'], MEDECIN_CHEF_POLE: ['COORDONNEES_MEDECIN'] }, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'equipe', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.equipe : undefined; },
    appartenance: 'role'
  });
  function cibles(st, e) { var d = (e && e.data) || {}; return d.service && d.service !== ETABLISSEMENT ? [d.service] : []; }

  var contrat = {
    id: 'equipe',
    libelle: 'Équipe',
    version: '0.1.0',
    icone: 'EQ',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: cibles },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'annuaire', libelle: 'Annuaire' }, { code: 'referents', libelle: 'Référents' }, { code: 'ma-fiche', libelle: 'Ma fiche' }, { code: 'medecins', libelle: 'Médecins', droit: 'COORDONNEES_MEDECIN' }] },
    migrations: [],
    fournitures: [
      // Numéro et courriel professionnels d'un agent, pour la petite fiche de contact des autres modules
      { nom: 'equipe.contact', version: 1, acces: 'lecture', champs: ['telPro', 'mailPro', 'fonction'], lire: function (st, o) { var f = fiche(st, o.agent); return { telPro: f.telPro, mailPro: f.mailPro, fonction: f.fonction }; } }
    ],
    besoins: []
  };
  contrat.fournitures.push({ nom: 'equipe.referents', version: 1, acces: 'lecture', champs: ['domaine', 'libelle', 'titulaires', 'suppleants', 'precision'], lire: function (st, o) { return referents(st, o.service); } });

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, ETABLISSEMENT: ETABLISSEMENT, DOMAINES_DEFAUT: DOMAINES_DEFAUT, domaines: domaines, referents: referents, referentDe: referentDe, gereReferents: gereReferents, fiche: fiche, clesAgent: clesAgent, clesMedecin: clesMedecin, gere: gere, controler: controler, permisPourSoi: permisPourSoi, TEL: TEL, MAIL: MAIL };
});
