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
    // Tri par horodatage d'abord (comparaison simple, tri stable) ; le rang du chaînage n'est calculé que pour les
    // saisies de même horodatage (test de charge du 16 novembre 2026 : l'index de toutes les saisies par horodatage
    // coûtait l'essentiel du tri). Résultat identique au tri complet sur (horodatage, rang, identifiant).
    var res = evts.slice().sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    for (var i = 0; i < res.length;) {
      var j = i + 1;
      while (j < res.length && res[j].at === res[i].at) j++;
      if (j - i > 1) {
        var groupe = res.slice(i, j), meme = {}, rangs = {};
        groupe.forEach(function (e) { meme[e.id] = e; });
        var rang = function (e, n) {
          if (rangs[e.id] !== undefined) return rangs[e.id];
          var r = 0;
          if (n < 1000) {
            if (e.lot && meme[e.lot]) r = rang(meme[e.lot], n + 1);
            else if (e.prec && meme[e.prec]) r = rang(meme[e.prec], n + 1) + 1;
          }
          rangs[e.id] = r;
          return r;
        };
        groupe.sort(function (a, b) {
          var ra = rang(a, 0), rb = rang(b, 0);
          if (ra !== rb) return ra - rb;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        for (var k = 0; k < groupe.length; k++) res[i + k] = groupe[k];
      }
      i = j;
    }
    return res;
  }

  /**
   * Garde des index (0.77.0, constat S10 de l'audit) : les états sont des objets indexés par des identifiants lus dans
   * les saisies (patient, mesure, clé de réglage…). Un identifiant « __proto__ », « constructor » ou « prototype »
   * modifierait le prototype de l'index au lieu d'y ranger une entrée : une saisie qui en porte un est écartée.
   */
  var RESERVES = { __proto__: null };
  ['__proto__', 'constructor', 'prototype'].forEach(function (k) { RESERVES[k] = true; });
  function identifiantSur(v) { return typeof v !== 'string' || RESERVES[v] !== true; }
  function saisieSure(e) {
    if (!e || typeof e !== 'object' || !identifiantSur(e.id) || !identifiantSur(e.type) || !identifiantSur(e.by)) return false;
    var d = e.data;
    if (!d || typeof d !== 'object') return true;
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      if (RESERVES[k] === true) return false;
      var v = d[k];
      if (typeof v !== 'string' || RESERVES[v] !== true) continue;   // valeur ordinaire : rien à vérifier (cas courant)
      if (k === 'id' || k === 'cle' || k === 'cible' || /Id$/.test(k)) return false;
    }
    return true;
  }

  /** Un lot (import, données de démonstration) est un fichier unique contenant plusieurs saisies. */
  function deplier(evts) {
    var res = [];
    evts.forEach(function (e) {
      if (!saisieSure(e)) return;
      if (e.type !== 'LOT') { res.push(e); return; }
      res.push(e);
      (e.data.evenements || []).forEach(function (s, i) {
        var x = { id: e.id + '.' + String(i).padStart(5, '0'), at: s.at || e.at, by: s.by || e.by, type: s.type, data: s.data, lot: e.id };
        if (saisieSure(x)) res.push(x);
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
    if (m.entree === evts && evts.length === m.n && m.tries) return m.tries;   // même journal, déjà trié (chaque module le demande)
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
  // Comparaison des débuts de journal partagée entre modules (même journal précédent, même journal nouveau) : faite une
  // fois par recalcul au lieu d'une fois par module (test de charge du 16 novembre 2026)
  var memoPrefixe = { a: null, b: null, na: -1, nb: -1, ok: false };
  function prefixe(a, na, b) {
    if (memoPrefixe.a === a && memoPrefixe.b === b && memoPrefixe.na === na && memoPrefixe.nb === b.length) return memoPrefixe.ok;
    var ok = true;
    for (var i = 0; i < na; i++) if (b[i] !== a[i]) { ok = false; break; }
    memoPrefixe = { a: a, b: b, na: na, nb: b.length, ok: ok };
    return ok;
  }
  function nouvellesSaisies(m, evts) {
    if (!m || !suivis || !suivis.has(evts) || !suivis.has(m.entree) || evts.length < m.n) return null;
    if (!prefixe(m.entree, m.n, evts)) return null;
    return evts.slice(m.n);
  }
  /**
   * Partie commune à tous les modules (test de charge du 16 novembre 2026) : index des saisies par identifiant, journal,
   * annulations, maillons manquants du chaînage et saisies à appliquer ne dépendent que des saisies, pas du module. Ils
   * sont calculés une fois par recalcul et partagés par les états de tous les modules (lecture seule) : avant, chacun des
   * 18 modules en tenait sa propre copie (temps et mémoire multipliés d'autant).
   */
  var memoCommun = { tries: null, commun: null };
  function communDe(tries) {
    if (memoCommun.tries === tries) return memoCommun.commun;
    var parId = {}, contre = {}, annules = {}, bruts = [], journal = [], applicables = [];
    tries.forEach(function (e) {
      parId[e.id] = e;
      if (e.type === 'ANNULATION' && e.data && e.data.cible) (contre[e.data.cible] = contre[e.data.cible] || []).push(e);
    });
    // Annulations d'abord (elles neutralisent leur cible, quelle que soit leur date). Une annulation peut elle-même être
    // annulée (« Rétablir ») : seule une annulation qui n'est pas neutralisée produit son effet.
    var memo = {};
    function effective(a, n) {
      if (memo[a.id] !== undefined) return memo[a.id];
      if (n > 50) return true;
      var r = !(contre[a.id] || []).some(function (x) { return effective(x, n + 1); });
      memo[a.id] = r;
      return r;
    }
    tries.forEach(function (e) {
      if (e.type === 'ANNULATION' && e.data && e.data.cible && effective(e, 0)) annules[e.data.cible] = e;
    });
    tries.forEach(function (e) {
      // Chaînage : chaque saisie cite la précédente du même agent ; un maillon absent signale un fichier supprimé.
      if (!e.lot && e.prec && !parId[e.prec]) bruts.push({ evt: e.id, manque: e.prec, by: e.by });
      if (!e.lot) journal.push(e);
      if (e.type === 'ANNULATION' || e.type === 'LOT' || annules[e.id] || (e.lot && annules[e.lot])) return;
      applicables.push(e);
    });
    var c = { parId: parId, annules: annules, manquantsBruts: bruts, journal: journal, applicables: applicables, dernier: tries.length ? tries[tries.length - 1].at : '' };
    memoCommun = { tries: tries, commun: c };
    return c;
  }
  /**
   * Suite commune d'un recalcul incrémental : journal prolongé et index complété une fois pour tous les modules (mêmes
   * saisies nouvelles, même journal de départ).
   */
  var memoSuite = { base: null, cle: '', res: null };
  function suiteCommune(base, tries) {
    var cle = tries.length + '|' + (tries.length ? tries[0].id + '|' + tries[tries.length - 1].id : '');
    if (memoSuite.base === base.journal && memoSuite.cle === cle) return memoSuite.res;
    var parId = base.parId;
    tries.forEach(function (e) { parId[e.id] = e; });   // ajout seulement : un état plus ancien reste juste
    var res = { parId: parId, journal: base.journal.concat(tries.filter(function (e) { return !e.lot; })) };
    memoSuite = { base: base.journal, cle: cle, res: res };
    return res;
  }
  function poursuivre(m, nouvelles, def) {
    var dep = deplier(nouvelles), dernier = m.dernier;
    if (!dep.every(function (e) { return e.at > dernier && e.type !== 'ANNULATION' && e.type !== 'INTEGRITE'; })) return null;
    if (def.complet && def.complet(dep)) return null;
    var st = Object.assign({}, m.st), tries = trierEvenements(dep);
    if (def.rafraichir) def.rafraichir(st);
    var sc = suiteCommune(st, tries);
    st.parId = sc.parId; st.journal = sc.journal;
    var bruts = st.manquantsBruts.filter(function (x) { return !st.parId[x.manque]; });
    tries.forEach(function (e) { if (!e.lot && e.prec && !st.parId[e.prec]) bruts.push({ evt: e.id, manque: e.prec, by: e.by }); });
    st.manquantsBruts = bruts;
    tries.forEach(function (e) {
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
    var tries = trierMemorise(evts), c = communDe(tries);
    // Index, annulations et journal communs à tous les modules (lecture seule)
    st.parId = c.parId; st.annules = c.annules; st.journal = c.journal;
    st.manquants = c.manquantsBruts.slice();
    // Application dans l'ordre chronologique de saisie.
    var appl = c.applicables, ap = def.appliquer;
    for (var i = 0; i < appl.length; i++) ap(st, appl[i]);
    st.manquantsBruts = c.manquantsBruts.slice();
    finirManquants(st);
    if (cle && suivis && suivis.has(evts)) memoEtats[cle] = { entree: evts, n: evts.length, st: st, dernier: c.dernier };
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

  /**
   * Chemin d'un fichier de saisie d'après son nom (date de l'horodatage en tête de l'identifiant) : dossier du jour
   * (rangement de la 0.33.0) ; `ancien` : dossier du mois (saisies écrites avant).
   */
  function cheminEvenement(nom, ancien) {
    var m = /^(\d{4})(\d{2})(\d{2})T/.exec(nom || '');
    return m ? 'evenements/' + m[1] + '/' + m[2] + '/' + (ancien ? '' : m[3] + '/') + nom : nom;
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
    cloner: cloner, trierEvenements: trierEvenements, deplier: deplier, saisieSure: saisieSure, reduire: reduire, suivre: suivre, oublierEtats: oublierEtats, appliquerIntegrite: appliquerIntegrite,
    detecterConflit: detecterConflit, cheminEvenement: cheminEvenement, filtrerIntegrite: filtrerIntegrite, annulabilite: annulabilite
  };
});
