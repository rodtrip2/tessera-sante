// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Patients — contrat déclaré au registre des modules (étape 5 du plan d'architecture, docs/architecture.md § 7).
 *
 * Module de référence : la fiche commune relie les modules qui concernent des patients. Première sous-étape (0.6.0) :
 * les saisies de la fiche (PATIENT, MODE_HOSPI, FUSION) sont écrites dans son propre journal (modules\patients\),
 * chiffrées par sa propre clé, remise à qui a droit à un module qui en dépend (Isocont). Isocont les lit à la volée,
 * par la session, et reconstitue son état comme avant. Les écrans, les champs nouveaux et l'import de la liste du DPI
 * viennent aux sous-étapes suivantes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./modules.js'), require('./champs.js'));
  else factory(root.SIC.noyauJournal, root.SIC.modules, root.SIC.champs);
})(typeof self !== 'undefined' ? self : this, function (N, registre, CH) {
  'use strict';

  // Fiche commune (décision du 5 novembre 2026) : nom (nom d'usage, affiché), nom de naissance, sexe ; médecins de
  // 1re et 2e ligne et référents soignants saisis dans Tessera (distincts du médecin responsable du DPI)
  // Psychologue référent et suivi par l'assistant(e) social(e) du service : ajoutés le 7 novembre 2026 (décision du porteur) ;
  // `suiviAS` : { suivi: true | false, nom: '' } (nom facultatif)
  var CHAMPS = ['ipp', 'nom', 'prenom', 'nomNaissance', 'sexe', 'naissance', 'protection', 'service', 'detenu', 'medecin1', 'medecin2', 'medecin1Id', 'medecin2Id', 'referents', 'psychologue', 'psychologueId', 'suiviAS', 'decoupageNom'];
  var COMPLETES_A_LA_FUSION = ['ipp', 'nom', 'prenom', 'naissance', 'protection', 'service', 'nomNaissance', 'sexe', 'medecin1', 'medecin2', 'psychologue', 'suiviAS'];
  /** Champs dont les changements sont gardés, datés, dans l'historique de la fiche (jamais écrasés). */
  var DATES = ['protection', 'detenu', 'service', 'medecin1', 'medecin2', 'referents', 'psychologue', 'suiviAS'];
  var SEXES = { F: 'Féminin', M: 'Masculin', I: 'Indéterminé' };
  function egal(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }

  /**
   * Fiche reconstituée : identité, protection, détenu, service, modes d'hospitalisation datés, fiches fusionnées, et
   * historique daté des changements (`historique[champ]` : [{ le, valeur, evt }]). Même contenu que la fiche
   * qu'Isocont reconstituait lui-même jusqu'à la version 0.6.0.
   */
  function appliquer(st, e) {
    var d = e.data || {}, id = d.patientId && st.fusions[d.patientId] ? cible(st, d.patientId) : d.patientId;
    switch (e.type) {
      case 'PATIENT':
        var p = st.fiches[id] || { id: id, modes: [] };
        CHAMPS.forEach(function (k) {
          if (d[k] === undefined) return;
          if (DATES.indexOf(k) >= 0 && !egal(p[k], d[k])) {
            var h = (p.historique = p.historique || {})[k] = (p.historique && p.historique[k]) || [];
            h.push({ le: e.at, valeur: d[k], evt: e.id });
          }
          p[k] = d[k];
          // Source de chaque champ : import de la liste du DPI ou saisie dans Tessera (une saisie n'est pas écrasée
          // par un import ultérieur)
          (p.sources = p.sources || {})[k] = /^import/.test(d.origine || '') ? 'import' : 'saisie';
        });
        st.fiches[id] = p;
        break;
      case 'COMPLEMENT':
        // Donnée propre au service ajoutée par l'administrateur (8 novembre 2026), datée comme les autres champs ; null la retire
        var pc = st.fiches[id];
        if (!pc || !d.champ) break;
        pc.complements = Object.assign({}, pc.complements || {});
        // Notes et check-lists (0.18.0) : la valeur se construit opération après opération (ajout, retrait, case cochée)
        if (d.op) pc.complements[d.champ] = CH.appliquerOperation(pc.complements[d.champ], d.op, e);
        else if (d.valeur === null || d.valeur === undefined || d.valeur === '') delete pc.complements[d.champ]; else pc.complements[d.champ] = d.valeur;
        var hc = (pc.historique = pc.historique || {})['c:' + d.champ] = (pc.historique['c:' + d.champ] || []);
        hc.push({ le: e.at, valeur: d.op ? null : (d.valeur === undefined ? null : d.valeur), op: d.op || undefined, par: e.by, evt: e.id });
        break;
      case 'INTERVENANT':
        // Répertoire commun des professionnels ou structures de la prise en charge (0.21.0)
        if (!d.id) break;
        var iv = st.intervenants[d.id] || { id: d.id, cree: e.at, par: e.by };
        ['type', 'nom', 'contact', 'commentaire', 'champs', 'supprime'].forEach(function (k) { if (d[k] !== undefined) iv[k] = d[k]; });
        iv.modifie = e.at;
        st.intervenants[d.id] = iv;
        break;
      case 'PRISE_EN_CHARGE':
        // Intervenant rattaché à la fiche d'un patient, avec un commentaire propre à ce patient ; `retire` le détache
        var pp = st.fiches[id];
        if (!pp || !d.lien) break;
        var lpc = (pp.priseEnCharge || []).filter(function (l) { return l.lien !== d.lien; });
        if (!d.retire) lpc.push({ lien: d.lien, intervenant: d.intervenant, commentaire: d.commentaire || '', le: e.at, par: e.by });
        pp.priseEnCharge = lpc;
        break;
      case 'SEJOUR':
        // Séjours successifs (décision du 7 novembre 2026) : un par numéro de séjour, complété saisie après saisie
        var ps = st.fiches[id];
        if (!ps || !d.sejourId) break;
        ps.sejours = ps.sejours || [];
        var sj = ps.sejours.filter(function (x) { return x.id === d.sejourId; })[0];
        if (!sj) { sj = { id: d.sejourId }; ps.sejours.push(sj); }
        ['iep', 'entree', 'sortie', 'service', 'chambre', 'lit'].forEach(function (k) { if (d[k] !== undefined) sj[k] = d[k]; });
        // Sortie prévisionnelle (0.18.0, décision du porteur du 9 novembre 2026) : date ou période, précision courte ;
        // chaque changement est gardé, daté
        if (d.sortiePrevue !== undefined) {
          if (!egal(sj.sortiePrevue, d.sortiePrevue)) (sj.historiqueSortiePrevue = sj.historiqueSortiePrevue || []).push({ le: e.at, par: e.by, valeur: d.sortiePrevue, evt: e.id });
          if (d.sortiePrevue === null) delete sj.sortiePrevue; else sj.sortiePrevue = d.sortiePrevue;
        }
        sj.evts = (sj.evts || []).concat([e.id]);
        ps.sejours.sort(function (a, b) { return String(a.entree || '').localeCompare(String(b.entree || '')); });
        break;
      case 'MODE_HOSPI':
        var pt = st.fiches[id];
        if (pt) { pt.modes.push({ date: d.date, mode: d.mode, evt: e.id, by: e.by }); pt.modes.sort(function (a, b) { return a.date - b.date; }); }
        break;
      case 'FUSION':
        var g = cible(st, d.garde), a = cible(st, d.absorbe), pg = st.fiches[g], pa = st.fiches[a];
        if (!pg || !pa || g === a) break;
        COMPLETES_A_LA_FUSION.forEach(function (k) { if (!pg[k] && pa[k]) pg[k] = pa[k]; });
        if (pa.complements) { pg.complements = Object.assign({}, pa.complements, pg.complements || {}); }
        pg.modes = pg.modes.concat(pa.modes).sort(function (x, y) { return x.date - y.date; });
        if (pa.sejours) pg.sejours = (pg.sejours || []).concat(pa.sejours).sort(function (x, y) { return String(x.entree || '').localeCompare(String(y.entree || '')); });
        pg.fusionnes = (pg.fusionnes || []).concat([{ id: a, ipp: pa.ipp || '', nom: pa.nom || '', prenom: pa.prenom || '', naissance: pa.naissance || '', evt: e.id, motif: d.motif || '' }], pa.fusionnes || []);
        delete st.fiches[a];
        st.fusions[a] = g;
        break;
    }
  }
  function cible(st, id) { var n = 0; while (st.fusions[id] && n++ < 50) id = st.fusions[id]; return id; }

  // ------------------------------------------------------------ Données complémentaires (décision du porteur du 8 novembre 2026)
  /*
   * Données ajoutées à la fiche (0.13.0), passées au mécanisme commun des champs ajoutés (champs.js, 0.18.0) : ce sont
   * les données d'un patient rattachées au module Patients sans clé propre, dont les valeurs sont des saisies
   * `COMPLEMENT` de ce module. Les autres données ajoutées (autre module, clé propre) sont des saisies `VALEUR`.
   */
  var TYPES_CHAMP = {};
  Object.keys(CH.TYPES).forEach(function (k) { if (k !== 'formule') TYPES_CHAMP[k] = CH.TYPES[k]; });
  function champsComplementaires(config, options) {
    return CH.definitions(config, Object.assign({}, options || {}, { entite: 'patient', module: 'patients' })).filter(function (c) { return CH.typeSaisie(c) === 'COMPLEMENT' && c.type !== 'formule'; });
  }
  var peutVoirChamp = CH.peutVoir;
  /** `peutFiche` : l'agent a l'accès aux fiches patient (règle des données sans rôles de saisie précisés). */
  function peutSaisirChamp(champ, roles, peutFiche) { return CH.peutSaisir(champ, roles, peutFiche); }
  var valeurChamp = CH.valeur, libValeurChamp = CH.lib, libelleClinique = CH.libelleClinique;
  /**
   * Saisie d'une donnée complémentaire permise selon les rôles réglés pour cette donnée (et non selon les accès des
   * modules) : le module Patients la contrôle lui-même. ctx : { config, peut }.
   */
  function permisPourSoi(type, data, compte, ctx) {
    if (type !== 'COMPLEMENT' || !compte || !data || !ctx) return false;
    try { CH.controlerSaisie('COMPLEMENT', data, compte.roles, { config: ctx.config, peutModule: function () { return !!(ctx.peut && ctx.peut('PATIENT')); } }); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------------ Réglages écrits par le cadre (0.18.0)
  /** Données ajoutées : le cadre règle celles de ses services (champs.js, controlerCadre) ; contrôle de la liste entière. */
  function cadreChamps(ancien, nouveau, compte) {
    try { CH.controlerListe(ancien, nouveau); return CH.controlerCadre(ancien, nouveau, compte); } catch (e) { return false; }
  }
  function CO() { return (typeof self !== 'undefined' && self.SIC && self.SIC.couleurs) || require('./couleurs.js'); }
  /** Réglages des données (couleurs, délais) : le cadre règle ceux de ses services, l'établissement reste à l'administrateur. */
  function cadreReglagesDonnees(ancien, nouveau, compte) { return CO().controlerCadre(ancien, nouveau, compte); }
  /** Capacité d'accueil (0.18.2) : le cadre règle celle de ses services. */
  function cadreIntervenants(ancien, nouveau, compte) { var K = (typeof self !== 'undefined' && self.SIC && self.SIC.intervenants) || require('./intervenants.js'); return K.controlerCadre(ancien, nouveau, compte); }
  function cadreLargeurs(ancien, nouveau, compte) { var K = (typeof self !== 'undefined' && self.SIC && self.SIC.largeurs) || require('./largeurs.js'); return K.controlerCadre(ancien, nouveau, compte); }
  function cadreCapacites(ancien, nouveau, compte) { var K = (typeof self !== 'undefined' && self.SIC && self.SIC.capacites) || require('./capacites.js'); return K.controlerCadre(ancien, nouveau, compte); }

  function reduire(evts) {
    return N.reduire(evts, { cle: 'patients', etat: function () { return { fiches: {}, fusions: {}, intervenants: {} }; }, appliquer: appliquer });
  }

  /** Séjour en cours d'une fiche (le dernier sans date de sortie), ou null. */
  function sejourEnCours(fiche) {
    var s = (fiche && fiche.sejours) || [], r = null;
    s.forEach(function (x) { if (!x.sortie) r = x; });
    return r;
  }

  /**
   * Réglages de la fiche pour un service (`config.fichePatient.services[code]`, décision du 7 novembre 2026) :
   * service de psychiatrie (par défaut oui : mode légal et patient détenu affichés), libellés des médecins.
   */
  function optionsFiche(config, service) {
    var r = ((config && config.fichePatient && config.fichePatient.services) || {})[service] || {};
    var psy = r.psychiatrie !== false, base = psy ? 'Psychiatre' : 'Médecin';
    function lib(v, d) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : d; }
    return { psychiatrie: psy, medecin1: lib(r.medecin1, base + ' de 1re ligne'), medecin2: lib(r.medecin2, base + ' de 2e ligne') };
  }

  /** Valeur d'un champ daté en vigueur à une date (ms) : la dernière fixée avant elle, sinon la première connue. */
  function valeurAu(fiche, champ, date) {
    var h = fiche && fiche.historique && fiche.historique[champ];
    if (!h || !h.length) return fiche ? fiche[champ] : undefined;
    var v = h[0].valeur;
    h.forEach(function (x) { if (Date.parse(x.le) <= date) v = x.valeur; });
    return v;
  }

  /**
   * Fourniture `patients.fiches` v1, lue à la volée : fiches en vigueur et fusions, calculées à partir des saisies
   * de la fiche (les autres saisies sont ignorées). Lecture seule : le consommateur reçoit des copies.
   */
  function fiches(evts) {
    var st = reduire(evts);
    return JSON.parse(JSON.stringify({ fiches: st.fiches, fusions: st.fusions }));
  }

  var contrat = {
    id: 'patients',
    libelle: 'Patients',
    version: '0.1.0',
    icone: 'PA',
    reference: true,            // module de référence : son onglet s'affiche en tête de celui du module affiché

    acces: [],                  // les saisies de la fiche sont permises par les accès des modules qui en dépendent
    saisies: {
      types: ['PATIENT', 'MODE_HOSPI', 'FUSION', 'SEJOUR', 'COMPLEMENT', 'INTERVENANT', 'PRISE_EN_CHARGE'],
      champ: function () { return null; },   // conflits : comme dans Isocont, aucune saisie de la fiche n'en crée
      permisPourSoi: permisPourSoi,
      reduire: reduire
    },
    // Réglages que le cadre écrit pour ses services (contrôle appelé par la session avant l'enregistrement)
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { champsAjoutes: cadreChamps, reglagesDonnees: cadreReglagesDonnees, capacites: cadreCapacites, largeursColonnes: cadreLargeurs, intervenants: cadreIntervenants } },
    // Fenêtre du module Patients (décision du porteur du 7 novembre 2026) : liste réglable des patients (ui-liste-patients.js)
    vues: { onglets: [{ code: 'fiches', libelle: 'Liste des patients' }] },
    migrations: [],
    fournitures: [
      { nom: 'patients.fiches', version: 1, acces: 'lecture', calculer: fiches,
        champs: ['id', 'ipp', 'nom', 'prenom', 'nomNaissance', 'sexe', 'naissance', 'protection', 'detenu', 'service', 'medecin1', 'medecin2', 'medecin1Id', 'medecin2Id', 'referents', 'psychologue', 'psychologueId', 'suiviAS', 'complements', 'sejours', 'modes', 'priseEnCharge', 'fusionnes', 'historique'] }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  var api = { TYPES_CHAMP: TYPES_CHAMP, champsComplementaires: champsComplementaires, peutVoirChamp: peutVoirChamp, peutSaisirChamp: peutSaisirChamp, valeurChamp: valeurChamp, libValeurChamp: libValeurChamp, libelleClinique: libelleClinique, permisPourSoi: permisPourSoi,
    contrat: contrat, reduire: reduire, fiches: fiches, valeurAu: valeurAu, sejourEnCours: sejourEnCours, optionsFiche: optionsFiche, SEXES: SEXES };
  if (typeof self !== 'undefined' && self.SIC) self.SIC.patients = api;
  return api;
});
