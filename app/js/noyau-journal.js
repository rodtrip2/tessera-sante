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
  /**
   * Tri mémorisé (0.21.1, test de charge du 11 novembre 2026) : à chaque recalcul, tous les modules reconstituent leur
   * état à partir des mêmes saisies ; le tri, qui coûtait l'essentiel du temps, est fait une fois et partagé. Quand de
   * nouvelles saisies s'ajoutent à la fin (synchronisation, saisie du poste) et sont toutes postérieures aux autres,
   * seules elles sont triées ; sinon tout est retrié. Résultat identique au tri complet ; le tableau rendu n'est jamais
   * modifié par `reduire`.
   */
  var memoTri = { entree: null, n: 0, tries: null };
  function trierMemorise(evts) {
    var m = memoTri, tries = null;
    if (m.entree && evts.length >= m.n && m.n > 0) {
      var prefixe = m.entree === evts || evts[0] === m.entree[0];
      for (var i = 0; prefixe && i < m.n; i++) if (evts[i] !== m.entree[i]) prefixe = false;
      if (prefixe && evts.length === m.n) tries = m.tries;
      else if (prefixe) {
        var nouveaux = deplier(evts.slice(m.n)), dernier = m.tries[m.tries.length - 1];
        if (!dernier || nouveaux.every(function (e) { return e.at > dernier.at; })) tries = m.tries.concat(trierEvenements(nouveaux));
      }
    }
    if (!tries) tries = trierEvenements(deplier(evts));
    memoTri = { entree: evts, n: evts.length, tries: tries };
    return tries;
  }

  /**
   * Recalcul incrémental (0.21.2, décision du porteur du 11 novembre 2026, test de charge) : l'état d'un module est gardé
   * entre deux recalculs ; quand les saisies nouvelles s'ajoutent à la fin du journal suivi par la session et sont toutes
   * postérieures aux autres, elles sont appliquées à l'état précédent au lieu de tout recalculer. Recalcul complet si une
   * saisie arrive en retard, si une annulation ou une prise d'acte d'intégrité arrive, si le module le demande
   * (`def.complet(nouvelles)`), pour tout autre tableau de saisies (simulation, import, test), et à chaque lecture
   * complète des journaux (`oublierEtats`, toutes les 10 minutes) : un écart éventuel ne dure pas.
   * Seuls les tableaux marqués par `suivre` (le journal de la session) en profitent ; un état rendu a toujours une
   * nouvelle identité. Condition : `def.cle` (nom du module) ; `def.rafraichir(st)` remet ce qui vient d'ailleurs.
   */
  var suivis = typeof WeakSet === 'function' ? new WeakSet() : null, memoEtats = {};
  function suivre(evts) { if (suivis && evts) suivis.add(evts); return evts; }
  function oublierEtats() { memoEtats = {}; }
  function finirManquants(st) {
    var acq = st.integrite.manquants;
    st.manquantsAcquis = st.manquantsBruts.filter(function (x) { return acq[x.manque]; });
    st.manquants = st.manquantsBruts.filter(function (x) { return !acq[x.manque]; });
  }
  function nouvellesSaisies(m, evts) {
    if (!m || !suivis || !suivis.has(evts) || !suivis.has(m.entree) || evts.length < m.n) return null;
    for (var i = 0; i < m.n; i++) if (evts[i] !== m.entree[i]) return null;
    return evts.slice(m.n);
  }
  function poursuivre(m, nouvelles, def) {
    var dep = deplier(nouvelles), dernier = m.dernier;
    if (!dep.every(function (e) { return e.at > dernier && e.type !== 'ANNULATION' && e.type !== 'INTEGRITE'; })) return null;
    if (def.complet && def.complet(dep)) return null;
    var st = Object.assign({}, m.st), tries = trierEvenements(dep);
    if (def.rafraichir) def.rafraichir(st);
    tries.forEach(function (e) { st.parId[e.id] = e; });
    var bruts = st.manquantsBruts.filter(function (x) { return !st.parId[x.manque]; });
    tries.forEach(function (e) { if (!e.lot && e.prec && !st.parId[e.prec]) bruts.push({ evt: e.id, manque: e.prec, by: e.by }); });
    st.manquantsBruts = bruts;
    tries.forEach(function (e) {
      if (!e.lot) st.journal.push(e);
      if (e.type === 'LOT' || st.annules[e.id] || (e.lot && st.annules[e.lot])) return;
      def.appliquer(st, e);
    });
    finirManquants(st);
    return { st: st, dernier: tries.length ? tries[tries.length - 1].at : dernier };
  }

  function reduire(evts, def) {
    var cle = def.cle, m = cle ? memoEtats[cle] : null, nouvelles = nouvellesSaisies(m, evts);
    if (nouvelles) {
      var suite = nouvelles.length ? poursuivre(m, nouvelles, def) : { st: Object.assign({}, m.st), dernier: m.dernier };
      if (suite) {
        if (!nouvelles.length && def.rafraichir) def.rafraichir(suite.st);
        memoEtats[cle] = { entree: evts, n: evts.length, st: suite.st, dernier: suite.dernier };
        return suite.st;
      }
    }
    var st = etatCommun(def.etat());
    var tries = trierMemorise(evts);

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
    st.manquantsBruts = st.manquants.slice();
    finirManquants(st);
    if (cle && suivis && suivis.has(evts)) memoEtats[cle] = { entree: evts, n: evts.length, st: st, dernier: tries.length ? tries[tries.length - 1].at : '' };
    return st;
  }

  /** Clé d'un repère d'agent : propre à chaque journal (« socle/u1 », « isocont/u1 ») ; l'agent seul si un seul journal. */
  function cleRepere(r) { return (r.journal ? r.journal + '/' : '') + r.agent; }

  /** Prise d'acte d'anomalies d'intégrité irrécupérables (saisie INTEGRITE : administrateur, motif obligatoire). */
  function appliquerIntegrite(st, e) {
    var d = e.data || {}, ig = st.integrite;
    (d.reperes || []).forEach(function (r) {
      if (!r || !r.agent) return;
      var k = cleRepere(r), prec = ig.reperes[k] || { ecart: 0 };
      ig.reperes[k] = { ecart: Math.max(prec.ecart || 0, +r.ecart || 0), dernier: r.dernier || prec.dernier || '', illisible: !!r.illisible || !!prec.illisible };
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
      var a = ig.reperes[cleRepere(r)], ok;
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
    cloner: cloner, trierEvenements: trierEvenements, deplier: deplier, reduire: reduire, suivre: suivre, oublierEtats: oublierEtats, appliquerIntegrite: appliquerIntegrite,
    detecterConflit: detecterConflit, cheminEvenement: cheminEvenement, filtrerIntegrite: filtrerIntegrite, annulabilite: annulabilite
  };
});
