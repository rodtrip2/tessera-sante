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
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./modules.js'));
  else factory(root.SIC.noyauJournal, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, registre) {
  'use strict';

  var CHAMPS = ['ipp', 'nom', 'prenom', 'naissance', 'protection', 'service', 'detenu'];

  /** Fiche reconstituée : identité, protection, détenu, service, modes d'hospitalisation datés, fiches fusionnées. */
  function appliquer(st, e) {
    var d = e.data || {}, id = d.patientId && st.fusions[d.patientId] ? cible(st, d.patientId) : d.patientId;
    switch (e.type) {
      case 'PATIENT':
        var p = st.fiches[id] || { id: id, modes: [] };
        CHAMPS.forEach(function (k) { if (d[k] !== undefined) p[k] = d[k]; });
        st.fiches[id] = p;
        break;
      case 'MODE_HOSPI':
        var pt = st.fiches[id];
        if (pt) { pt.modes.push({ date: d.date, mode: d.mode, evt: e.id, by: e.by }); pt.modes.sort(function (a, b) { return a.date - b.date; }); }
        break;
      case 'FUSION':
        var g = cible(st, d.garde), a = cible(st, d.absorbe), pg = st.fiches[g], pa = st.fiches[a];
        if (!pg || !pa || g === a) break;
        CHAMPS.forEach(function (k) { if (!pg[k] && pa[k]) pg[k] = pa[k]; });
        pg.modes = pg.modes.concat(pa.modes).sort(function (x, y) { return x.date - y.date; });
        delete st.fiches[a];
        st.fusions[a] = g;
        break;
    }
  }
  function cible(st, id) { var n = 0; while (st.fusions[id] && n++ < 50) id = st.fusions[id]; return id; }

  function reduire(evts) {
    return N.reduire(evts, { etat: function () { return { fiches: {}, fusions: {} }; }, appliquer: appliquer });
  }

  var contrat = {
    id: 'patients',
    libelle: 'Patients',
    version: '0.1.0',
    icone: 'PA',
    reference: true,            // module de référence, sans écran propre à cette sous-étape

    acces: [],                  // les saisies de la fiche sont permises par les accès des modules qui en dépendent
    saisies: {
      types: ['PATIENT', 'MODE_HOSPI', 'FUSION'],
      champ: function () { return null; },   // conflits : comme dans Isocont, aucune saisie de la fiche n'en crée
      reduire: reduire
    },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [] },
    migrations: [],
    fournitures: [
      { nom: 'patients.fiches', version: 1, acces: 'lecture',
        champs: ['id', 'ipp', 'nom', 'prenom', 'naissance', 'protection', 'detenu', 'service', 'modes'] }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire };
});
