// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Équipe — contrat déclaré au registre des modules (0.27.0, lot C, décisions du porteur du 11 novembre 2026).
 *
 * Fiches des agents : téléphone et courriel professionnels (visibles de tous les agents), téléphone et courriel
 * personnels (chiffrés pour le seul agent, le cadre de ses services et l'administrateur, avec l'accord de l'agent).
 * Numéro personnel des médecins de la liste commune : chiffré pour le cadre et le médecin chef de service (rôle à
 * venir). L'agent remplit sa fiche ; le cadre complète celles des agents de ses services. Journal `modules\equipe\`.
 * Les parties chiffrées sont des enveloppes (session.chiffrerEnveloppe) : le module n'en voit que le contenu opaque.
 *
 * Entretiens des agents (phase 4, lot F, décisions du porteur du 15 novembre 2026) : entretiens de suivi, de recadrage,
 * de reprise, d'intégration… menés par le cadre de l'agent (son validateur), lus par lui seul ; il choisit de les
 * partager avec un ou plusieurs supérieurs et, s'il le souhaite, avec l'agent, à qui il peut demander de signer (avec
 * ses observations). Tout le contenu (agent concerné, date, type, compte rendu, partage) est dans une enveloppe chiffrée
 * pour les clés de liste (`t-a.<compte>`) des seuls lecteurs : l'administrateur, qui détient techniquement les clés,
 * n'ouvre pas. Le cadre peut retirer un entretien de l'export du droit d'accès de l'agent quand il concerne d'autres
 * agents (motif). Données du personnel : fonction « entretiens » soumise à avis, livrée désactivée.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).equipe = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['COORDONNEES', 'COORDONNEES_MEDECIN', 'REFERENTS', 'DOMAINE_REFERENT', 'VALEUR_SOI', 'ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ', 'ENTRETIEN_AGENT_SIGNATURE'];
  var TYPES_ENTRETIEN_DEFAUT = [{ code: 'suivi', libelle: 'Entretien de suivi' }, { code: 'recadrage', libelle: 'Recadrage' }, { code: 'reprise', libelle: 'Retour d’absence, reprise' },
    { code: 'integration', libelle: 'Intégration, fin de période (essai, stage)' }];
  // Rôles qui mènent un entretien (validateur de l'agent, règle des Congés) et parmi lesquels choisir les supérieurs
  var ROLES_ENTRETIEN = ['CADRE', 'CADRE_SUP', 'DIRECTEUR_SOINS', 'MEDECIN_CHEF_SERVICE', 'MEDECIN_CHEF_POLE'];
  var VALIDATEURS_DEFAUT = { IDE: 'CADRE', AS: 'CADRE', SECRETAIRE: 'CADRE', CADRE: 'CADRE_SUP', CADRE_SUP: 'DIRECTEUR_SOINS', MEDECIN: 'MEDECIN_CHEF_SERVICE', MEDECIN_CHEF_SERVICE: 'MEDECIN_CHEF_POLE', '*': 'CADRE' };
  var PRESEANCE = ['DIRECTEUR_SOINS', 'MEDECIN_CHEF_POLE', 'MEDECIN_CHEF_SERVICE', 'MEDECIN', 'CADRE_SUP', 'CADRE', 'SECRETAIRE', 'IDE', 'AS'];
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
    // Valeur d'une donnée ajoutée d'agent ouverte à l'agent lui-même (0.28.0) : enveloppe pour la clé propre de la donnée
    // (`d-<champ>`, ses rôles lecteurs) et la clé de liste de l'agent (`t-a.<agent>`)
    if (e.type === 'VALEUR_SOI' && d.champ && d.agent) st.soi[d.agent + '|' + d.champ] = { champ: d.champ, agent: d.agent, env: enveloppe(d.env), le: e.at, par: e.by };
    // Entretiens : métadonnées minimales en clair (identifiant, auteur, dates) ; tout le reste dans l'enveloppe
    if (e.type === 'ENTRETIEN_AGENT' && d.id && !st.entretiens[d.id] && enveloppe(d.env)) st.entretiens[d.id] = { id: d.id, auteur: e.by, le: e.at, maj: e.at, env: enveloppe(d.env), signataire: d.signataire || '', signatures: [] };
    if (e.type === 'ENTRETIEN_AGENT_MAJ' && (x = st.entretiens[d.id]) && x.auteur === e.by && enveloppe(d.env)) { x.env = enveloppe(d.env); x.maj = e.at; x.signataire = d.signataire || ''; }
    if (e.type === 'ENTRETIEN_AGENT_SIGNATURE' && (x = st.entretiens[d.id]) && x.signataire === e.by && !x.signatures.some(function (y) { return y.par === e.by && y.maj === x.maj; })) x.signatures.push({ par: e.by, le: e.at, maj: x.maj, env: enveloppe(d.env) });
    if (e.type === 'COORDONNEES_MEDECIN' && d.medecin) {
      x = st.medecins[d.medecin] || (st.medecins[d.medecin] = { medecin: d.medecin, perso: null });
      if (d.perso !== undefined) x.perso = enveloppe(d.perso);
      x.le = e.at; x.par = e.by;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'equipe', etat: function () { return { agents: {}, medecins: {}, domaines: {}, referents: {}, soi: {}, entretiens: {} }; }, appliquer: appliquer }); }

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

  // ------------------------------------------------------------ Entretiens
  function rolePrincipal(roles) { roles = roles || []; return PRESEANCE.filter(function (r) { return roles.indexOf(r) >= 0; })[0] || roles[0] || ''; }
  /** Le compte mène-t-il les entretiens de l'agent (son validateur, règle et réglage des Congés ; jamais soi-même) ? */
  function menePour(config, v, a) {
    if (!v || !a || v.id === a.id) return false;
    var vs = Object.assign({}, VALIDATEURS_DEFAUT, (config && config.conges && config.conges.validateurs) || {}), r = vs[rolePrincipal(a.roles)] || vs['*'] || 'CADRE', rv = v.roles || [];
    if (rv.indexOf(r) < 0) return false;
    if (['DIRECTEUR_SOINS', 'ADMIN'].indexOf(r) >= 0) return true;
    return (v.services || []).some(function (s) { return (a.services || []).indexOf(s) >= 0; });
  }
  /** Supérieurs proposés pour le partage : comptes actifs d'encadrement, sauf l'auteur et l'agent. */
  function superieursPossibles(comptes, auteur, agent) {
    return (comptes || []).filter(function (c) { return c && c.actif !== false && c.id !== auteur && c.id !== agent && c.id !== 'secours' && (c.roles || []).some(function (r) { return ROLES_ENTRETIEN.indexOf(r) >= 0; }); });
  }
  /** Clés lectrices d'un entretien : l'auteur, les supérieurs choisis, l'agent s'il est partagé avec lui. */
  function clesEntretien(auteur, contenu) {
    var r = ['t-a.' + auteur];
    (contenu.superieurs || []).forEach(function (id) { if (r.indexOf('t-a.' + id) < 0) r.push('t-a.' + id); });
    if (contenu.partageAgent && contenu.agent && r.indexOf('t-a.' + contenu.agent) < 0) r.push('t-a.' + contenu.agent);
    return r;
  }
  function typesEntretien() { return TYPES_ENTRETIEN_DEFAUT.slice(); }
  /** Contenu d'un entretien (déchiffré par l'interface) normalisé et vérifié ; lève une erreur lisible. */
  function contenuEntretien(c) {
    c = c || {};
    if (!c.agent) throw new Error('Choisissez l’agent.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) throw new Error('Indiquez la date de l’entretien.');
    var type = texte(c.type, 30), libre = texte(c.typeLibre, 80);
    if (!type && !libre) throw new Error('Choisissez le type d’entretien ou écrivez-le.');
    if (!texte(c.compteRendu, 4000)) throw new Error('Écrivez le compte rendu.');
    if (c.signatureDemandee && !c.partageAgent) throw new Error('Pour demander la signature de l’agent, partagez l’entretien avec lui.');
    if (c.horsDroitAcces && !texte(c.motifHorsDroitAcces, 200)) throw new Error('Indiquez pourquoi l’entretien est retiré du droit d’accès (ex. il concerne d’autres agents).');
    return { agent: String(c.agent), nomAgent: texte(c.nomAgent, 80), nomAuteur: texte(c.nomAuteur, 80), date: c.date, type: libre ? '' : type, typeLibre: libre, presents: texte(c.presents, 200), compteRendu: String(c.compteRendu).slice(0, 4000).trim(),
      suites: String(c.suites || '').slice(0, 2000).trim(), superieurs: (Array.isArray(c.superieurs) ? c.superieurs : []).map(String).slice(0, 10), partageAgent: !!c.partageAgent, signatureDemandee: !!c.signatureDemandee,
      horsDroitAcces: !!c.horsDroitAcces, motifHorsDroitAcces: c.horsDroitAcces ? texte(c.motifHorsDroitAcces, 200) : '' };
  }
  function libTypeEntretien(c) { if (!c) return ''; if (c.typeLibre) return c.typeLibre; var t = TYPES_ENTRETIEN_DEFAUT.filter(function (x) { return x.code === c.type; })[0]; return t ? t.libelle : c.type; }
  /** Signature de l'agent sur la version courante de l'entretien (une nouvelle version demande une nouvelle signature). */
  function signature(x) { return x ? x.signatures.filter(function (y) { return y.maj === x.maj; })[0] || null : null; }
  /** Entretiens dont le compte est lecteur (d'après les clés de l'enveloppe ; le contenu reste à ouvrir). */
  function entretiensLisibles(st, compteId) { var k = 't-a.' + compteId; return Object.keys((st && st.entretiens) || {}).map(function (i) { return st.entretiens[i]; }).filter(function (x) { return x.env && x.env.cles && x.env.cles[k]; }).sort(function (a, b) { return String(b.le).localeCompare(String(a.le)); }); }
  /** Signatures attendues de l'agent : entretiens dont il est signataire, version courante pas encore signée. */
  function aSigner(st, compteId) { return entretiensLisibles(st, compteId).filter(function (x) { return x.signataire === compteId && !signature(x); }); }
  function fonctionActive(config) { var V = (typeof self !== 'undefined' && self.SIC && self.SIC.validations) || null; return !V || !config || V.actif(config, 'entretiens'); }

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
    if (type === 'VALEUR_SOI') {
      var CH = (typeof self !== 'undefined' && self.SIC && self.SIC.champs) || null, def = CH ? CH.definition(ctx.config || {}, d.champ) : null;
      if (!d.agent || !d.champ || !enveloppe(d.env)) throw new Error('Valeur mal formée.');
      if (!def || def.entite !== 'agent') throw new Error('Donnée d’agent inconnue.');
      if (c.id === d.agent) { if (def.soi !== 'ecriture') throw new Error('« ' + def.libelle + ' » ne se modifie pas par l’agent lui-même.'); return; }
      if (!def.soi) throw new Error('« ' + def.libelle + ' » n’est pas ouverte à l’agent.');
      if (r.indexOf('ADMIN') < 0 && !r.some(function (x) { return (def.saisie || []).indexOf(x) >= 0; })) throw new Error('Vous ne modifiez pas « ' + def.libelle + ' ».');
      return;
    }
    if (type === 'REFERENTS' || type === 'DOMAINE_REFERENT') {
      if (!d.service) throw new Error('Indiquez le service.');
      if (!gereReferents(c, d.service)) throw new Error(d.service === ETABLISSEMENT ? 'Seul l’administrateur tient les référents de l’établissement.' : 'Seul le cadre du service (ou l’administrateur) tient ses référents.');
      if (type === 'REFERENTS' && !d.domaine) throw new Error('Choisissez le domaine.');
      if (type === 'DOMAINE_REFERENT' && (!/^[a-z0-9-]{2,40}$/.test(d.code || '') || (d.libelle !== undefined && !texte(d.libelle)))) throw new Error('Indiquez le nom du domaine.');
      return;
    }
    if (type === 'ENTRETIEN_AGENT' || type === 'ENTRETIEN_AGENT_MAJ' || type === 'ENTRETIEN_AGENT_SIGNATURE') {
      if (ctx && ctx.config && !fonctionActive(ctx.config)) throw new Error('Entretiens des agents : fonction désactivée par l’établissement (onglet « Validations »).');
      var en = (ctx && ctx.etat && ctx.etat.entretiens) || {}, x = en[d.id];
      if (!d.id || !enveloppe(d.env)) throw new Error('Entretien mal chiffré.');
      if (type === 'ENTRETIEN_AGENT') {
        if (x) throw new Error('Entretien déjà enregistré.');
        if (c && !r.some(function (y) { return ROLES_ENTRETIEN.indexOf(y) >= 0; })) throw new Error('Seul le cadre de l’agent (ou son supérieur) mène un entretien.');
        if (c && !d.env.cles['t-a.' + c.id]) throw new Error('L’auteur doit pouvoir relire l’entretien.');
      }
      if (type === 'ENTRETIEN_AGENT_MAJ') {
        if (!x) throw new Error('Entretien introuvable.');
        if (c && x.auteur !== c.id) throw new Error('Seul l’auteur modifie l’entretien ou son partage.');
        if (c && !d.env.cles['t-a.' + c.id]) throw new Error('L’auteur doit pouvoir relire l’entretien.');
      }
      if ((type === 'ENTRETIEN_AGENT' || type === 'ENTRETIEN_AGENT_MAJ') && d.signataire && !d.env.cles['t-a.' + d.signataire]) throw new Error('Pour demander la signature de l’agent, partagez l’entretien avec lui.');
      if (type === 'ENTRETIEN_AGENT_SIGNATURE') {
        if (!x) throw new Error('Entretien introuvable.');
        if (c && x.signataire !== c.id) throw new Error('Seul l’agent à qui la signature est demandée signe l’entretien.');
        if (signature(x)) throw new Error('Entretien déjà signé.');
      }
      return;
    }
    if (type === 'COORDONNEES_MEDECIN') {
      if (!d.medecin) throw new Error('Médecin manquant.');
      if (d.perso && !enveloppe(d.perso)) throw new Error('Numéro personnel mal chiffré.');
    }
  }
  /** L'agent tient sa propre fiche sans accès particulier. */
  function permisPourSoi(type, data, compte, ctx) {
    if (!compte || !data) return false;
    if (type === 'COORDONNEES') return data.agent === compte.id;
    // Signature d'un entretien par l'agent concerné (le contrôle vérifie qu'elle lui est demandée)
    if (type === 'ENTRETIEN_AGENT_SIGNATURE') { var x = ctx && ctx.etat && ctx.etat.entretiens && ctx.etat.entretiens[data.id]; return !!x && x.signataire === compte.id; }
    if (type !== 'VALEUR_SOI') return false;
    if (data.agent === compte.id) return true;
    // Copie pour l'agent écrite par un rôle qui modifie la donnée (le contrôle vérifie le réglage)
    var CH = (typeof self !== 'undefined' && self.SIC && self.SIC.champs) || null, def = CH && ctx ? CH.definition(ctx.config || {}, data.champ) : null;
    return !!def && (compte.roles || []).some(function (r) { return (def.saisie || []).indexOf(r) >= 0; });
  }

  var ACCES = [
    { code: 'equipe.consulter', libelle: 'Consulter l’annuaire de l’équipe (coordonnées professionnelles)', types: [] },
    { code: 'equipe.fiches', libelle: 'Compléter les fiches des agents de ses services (cadre)', types: ['COORDONNEES'] },
    { code: 'equipe.referents', libelle: 'Tenir la liste des référents de ses services (cadre)', types: ['REFERENTS', 'DOMAINE_REFERENT'] },
    { code: 'equipe.medecins', libelle: 'Tenir le numéro personnel des médecins de ses services (cadre, médecin chef de service)', types: ['COORDONNEES_MEDECIN'] },
    { code: 'equipe.entretiens', libelle: 'Mener les entretiens des agents dont on est le cadre (ou le supérieur), les partager', types: ['ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ'] }
  ];
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: { CADRE: TYPES.filter(function (t) { return t !== 'ENTRETIEN_AGENT_SIGNATURE'; }), CADRE_SUP: ['ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ'], DIRECTEUR_SOINS: ['ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ'], MEDECIN_CHEF_SERVICE: ['COORDONNEES_MEDECIN', 'ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ'], MEDECIN_CHEF_POLE: ['COORDONNEES_MEDECIN', 'ENTRETIEN_AGENT', 'ENTRETIEN_AGENT_MAJ'] }, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
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
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { boitesMail: controlerBoites } },
    vues: { onglets: [{ code: 'annuaire', libelle: 'Annuaire' }, { code: 'referents', libelle: 'Référents' }, { code: 'ma-fiche', libelle: 'Ma fiche' }, { code: 'entretiens', libelle: 'Entretiens', visible: fonctionActive }, { code: 'prets', libelle: 'Prêts de droits' }, { code: 'medecins', libelle: 'Médecins', droit: 'COORDONNEES_MEDECIN' }] },
    migrations: [],
    fournitures: [
      // Numéro et courriel professionnels d'un agent, pour la petite fiche de contact des autres modules
      { nom: 'equipe.contact', version: 1, acces: 'lecture', champs: ['telPro', 'mailPro', 'fonction'], lire: function (st, o) { var f = fiche(st, o.agent); return { telPro: f.telPro, mailPro: f.mailPro, fonction: f.fonction }; } }
    ],
    besoins: [],
    indispensable: true   // annuaire et prêts de droits (0.43.0) : jamais arrêté
  };
  contrat.fournitures.push({ nom: 'equipe.referents', version: 1, acces: 'lecture', champs: ['domaine', 'libelle', 'titulaires', 'suppleants', 'precision'], lire: function (st, o) { return referents(st, o.service); } });

  /** Boîtes aux lettres du service (`config.boitesMail`, lot A, 14 novembre 2026) : le cadre change seulement celles de ses services. */
  function controlerBoites(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }
  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, ETABLISSEMENT: ETABLISSEMENT, DOMAINES_DEFAUT: DOMAINES_DEFAUT, domaines: domaines, referents: referents, referentDe: referentDe, gereReferents: gereReferents, fiche: fiche, clesAgent: clesAgent, TYPES_ENTRETIEN_DEFAUT: TYPES_ENTRETIEN_DEFAUT, ROLES_ENTRETIEN: ROLES_ENTRETIEN, menePour: menePour, superieursPossibles: superieursPossibles, clesEntretien: clesEntretien, typesEntretien: typesEntretien,
    contenuEntretien: contenuEntretien, libTypeEntretien: libTypeEntretien, signature: signature, entretiensLisibles: entretiensLisibles, aSigner: aSigner, fonctionActive: fonctionActive, clesMedecin: clesMedecin, gere: gere, controler: controler, controlerBoites: controlerBoites, permisPourSoi: permisPourSoi, TEL: TEL, MAIL: MAIL };
});
