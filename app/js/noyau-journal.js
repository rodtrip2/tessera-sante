// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — noyau du journal (étape 1 du plan d'architecture).
 * Mécanismes communs à tous les modules, sans aucune règle métier :
 * - ordre des saisies (horodatage, puis identifiant) et dépliage des lots (imports, données de démonstration) ;
 * - annulations et rétablissements (une annulation peut elle-même être annulée) ;
 * - chaînage : chaque saisie cite la précédente du même agent, un maillon absent signale un fichier supprimé ;
 * - détection des conflits : deux saisies concurrentes sur la même donnée, la seconde n'est pas appliquée ;
 * - prises d'acte d'anomalies d'intégrité (saisies INTEGRITE) et filtrage du contrôle d'intégrité.
 * Aucune saisie n'est jamais modifiée : corrections et annulations sont elles-mêmes des saisies.
 * Le module fournit son état initial et sa fonction d'application (voir `reduire`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).noyauJournal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cloner(o) { return JSON.parse(JSON.stringify(o)); }

  /**
   * Ordre d'application des saisies : horodatage, puis, à horodatage égal (même milliseconde), ordre de saisie
   * donné par le chaînage (une saisie passe après celle qu'elle cite dans `prec`), puis identifiant.
   * Sans le chaînage, plusieurs saisies enregistrées d'un coup par un agent (ex. fin d'une mesure juste après
   * son début) pouvaient être appliquées dans le désordre, l'identifiant finissant par une partie aléatoire.
   * Les saisies d'un lot gardent le rang du lot.
   */
  function trierEvenements(evts) {
    var parAt = {};
    evts.forEach(function (e) { (parAt[e.at] = parAt[e.at] || {})[e.id] = e; });
    var rangs = {};
    function rang(e, n) {
      if (rangs[e.id] !== undefined) return rangs[e.id];
      var meme = parAt[e.at] || {}, r = 0;
      if (n < 1000) {
        if (e.lot && meme[e.lot]) r = rang(meme[e.lot], n + 1);
        else if (e.prec && meme[e.prec]) r = rang(meme[e.prec], n + 1) + 1;
      }
      rangs[e.id] = r;
      return r;
    }
    return evts.slice().sort(function (a, b) {
      if (a.at !== b.at) return a.at < b.at ? -1 : 1;
      var ra = rang(a, 0), rb = rang(b, 0);
      if (ra !== rb) return ra - rb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  /** Un lot (import, données de démonstration) est un fichier unique contenant plusieurs saisies. */
  function deplier(evts) {
    var res = [];
    evts.forEach(function (e) {
      if (e.type !== 'LOT') { res.push(e); return; }
      res.push(e);
      (e.data.evenements || []).forEach(function (s, i) {
        res.push({ id: e.id + '.' + String(i).padStart(5, '0'), at: s.at || e.at, by: s.by || e.by, type: s.type, data: s.data, lot: e.id });
      });
    });
    return res;
  }

  /** État commun à tout journal réduit (ajouté après l'état propre au module). */
  function etatCommun(st) {
    st.conflits = []; st.annules = {}; st.journal = []; st.parId = {}; st.manquants = [];
    // Anomalies d'intégrité dont l'administrateur a pris acte (saisies INTEGRITE) : elles ne déclenchent plus d'alerte.
    st.integrite = { reperes: {}, manquants: {}, fichiers: {}, historique: [] };
    st.manquantsAcquis = [];
    return st;
  }

  /**
   * Reconstitue l'état à partir des saisies déchiffrées.
   * `def.etat()` : état initial propre au module ; `def.appliquer(st, e)` : application d'une saisie retenue.
   * Ajoute à l'état : conflits, annules, journal, parId, manquants, integrite, manquantsAcquis.
   */
  function reduire(evts, def) {
    var st = etatCommun(def.etat());
    var tries = trierEvenements(deplier(evts));

    // 1) Annulations d'abord (elles neutralisent leur cible, quelle que soit leur date). Une annulation peut
    //    elle-même être annulée (« Rétablir ») : seule une annulation qui n'est pas neutralisée produit son effet.
    var contre = {};
    tries.forEach(function (e) {
      st.parId[e.id] = e;
      if (e.type === 'ANNULATION' && e.data && e.data.cible) (contre[e.data.cible] = contre[e.data.cible] || []).push(e);
    });
    var memo = {};
    function effective(a, n) {
      if (memo[a.id] !== undefined) return memo[a.id];
      if (n > 50) return true;
      var r = !(contre[a.id] || []).some(function (x) { return effective(x, n + 1); });
      memo[a.id] = r;
      return r;
    }
    tries.forEach(function (e) {
      if (e.type === 'ANNULATION' && e.data && e.data.cible && effective(e, 0)) st.annules[e.data.cible] = e;
    });

    // Chaînage : chaque saisie cite la précédente du même agent ; un maillon absent signale un fichier supprimé.
    tries.forEach(function (e) {
      if (!e.lot && e.prec && !st.parId[e.prec]) st.manquants.push({ evt: e.id, manque: e.prec, by: e.by });
    });

    // 2) Application dans l'ordre chronologique de saisie.
    tries.forEach(function (e) {
      if (!e.lot) st.journal.push(e);
      if (e.type === 'ANNULATION' || e.type === 'LOT' || st.annules[e.id] || (e.lot && st.annules[e.lot])) return;
      def.appliquer(st, e);
    });
    var acq = st.integrite.manquants;
    st.manquantsAcquis = st.manquants.filter(function (x) { return acq[x.manque]; });
    st.manquants = st.manquants.filter(function (x) { return !acq[x.manque]; });
    return st;
  }

  /** Prise d'acte d'anomalies d'intégrité irrécupérables (saisie INTEGRITE : administrateur, motif obligatoire). */
  function appliquerIntegrite(st, e) {
    var d = e.data || {}, ig = st.integrite;
    (d.reperes || []).forEach(function (r) {
      if (!r || !r.agent) return;
      var prec = ig.reperes[r.agent] || { ecart: 0 };
      ig.reperes[r.agent] = { ecart: Math.max(prec.ecart || 0, +r.ecart || 0), dernier: r.dernier || prec.dernier || '', illisible: !!r.illisible || !!prec.illisible };
    });
    (d.manquants || []).forEach(function (id) { ig.manquants[id] = e.id; });
    (d.fichiers || []).forEach(function (nom) { ig.fichiers[nom] = e.id; });
    ig.historique.push({ evt: e.id, at: e.at, by: e.by, motif: d.motif || '', reperes: (d.reperes || []).length, manquants: (d.manquants || []).length, fichiers: (d.fichiers || []).length });
  }

  /**
   * Vrai si `e` entre en conflit avec une saisie que son auteur n'avait pas vue : elle n'est alors pas appliquée.
   * `objet` : donnée suivie (avec `id`, `version`, `champs`) ; `c` : champ logique modifié (null : pas de contrôle) ;
   * `cle` : nom de l'identifiant de l'objet dans la liste des conflits (ex. « mesureId »).
   */
  function detecterConflit(st, objet, c, e, cle) {
    if (!c) return false;
    var precedent = objet.champs[c];
    if (precedent && typeof e.base === 'number' && e.base < precedent.version && precedent.by !== e.by) {
      var conflit = {};
      conflit[cle || 'objet'] = objet.id;
      conflit.champ = c; conflit.retenu = precedent.id; conflit.concurrent = e.id;
      st.conflits.push(conflit);
      return true;
    }
    objet.champs[c] = { id: e.id, by: e.by, version: objet.version + 1 };
    return false;
  }

  /** Chemin d'un fichier de saisie d'après son nom (le mois vient de l'horodatage en tête de l'identifiant). */
  function cheminEvenement(nom) {
    var m = /^(\d{4})(\d{2})\d{2}T/.exec(nom || '');
    return m ? 'evenements/' + m[1] + '/' + m[2] + '/' + nom : nom;
  }

  /**
   * Retire du résultat du contrôle d'intégrité les anomalies dont l'administrateur a pris acte (`st.integrite`).
   * Une anomalie nouvelle (écart plus grand, autre fichier) reste signalée. `res.acquis` = anomalies écartées.
   */
  function filtrerIntegrite(res, ig) {
    ig = ig || { reperes: {}, manquants: {}, fichiers: {} };
    var out = Object.assign({}, res), acquis = 0;
    function idDe(nom) { return String(nom).replace(/\.enc$/, ''); }
    out.reperes = (res.reperes || []).filter(function (r) {
      var a = ig.reperes[r.agent], ok;
      if (r.illisible) ok = !!(a && a.illisible);
      else ok = !!a && (r.attendu - r.present) <= (a.ecart || 0) && (!r.dernierManquant || a.dernier === r.dernier);
      if (ok) acquis++;
      return !ok;
    });
    out.disparus = (res.disparus || []).filter(function (nom) { var ok = !!(ig.manquants[idDe(nom)] || ig.fichiers[nom]); if (ok) acquis++; return !ok; });
    out.fichiersIllisibles = (res.fichiersIllisibles || []).filter(function (f) { var ok = !!ig.fichiers[f.nom]; if (ok) acquis++; return !ok; });
    out.illisibles = out.fichiersIllisibles.length;
    out.acquis = acquis + (res.manquantsAcquis || 0);
    return out;
  }

  /**
   * Annulation depuis le journal : ce qu'il est possible d'annuler (ou de rétablir) et avec quel droit.
   * Retourne null si la saisie ne s'annule pas (trace de compte, saisie déjà annulée), sinon
   * { action: 'annuler' | 'retablir', droit: 'ANNULATION' | 'CONFIG', cible }.
   * Paramétrage, imports (lots) et décisions d'intégrité : administrateur (droit CONFIG) ; autres saisies : droit ANNULATION.
   */
  var TYPES_ANNUL_ADMIN = { CONFIG: 1, LOT: 1, INTEGRITE: 1 };
  function annulabilite(st, e) {
    if (!e || e.type === 'COMPTE' || e.lot) return null;
    if (e.type === 'ANNULATION') {
      var cible = st.parId[e.data && e.data.cible];
      if (!cible || st.annules[e.id] || st.annules[cible.id] !== e) return null;
      return { action: 'retablir', droit: TYPES_ANNUL_ADMIN[cible.type] ? 'CONFIG' : 'ANNULATION', cible: cible };
    }
    if (st.annules[e.id]) return null;
    return { action: 'annuler', droit: TYPES_ANNUL_ADMIN[e.type] ? 'CONFIG' : 'ANNULATION', cible: e };
  }

  return {
    cloner: cloner, trierEvenements: trierEvenements, deplier: deplier, reduire: reduire, appliquerIntegrite: appliquerIntegrite,
    detecterConflit: detecterConflit, cheminEvenement: cheminEvenement, filtrerIntegrite: filtrerIntegrite, annulabilite: annulabilite
  };
});
