// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Patients — import de la liste des patients exportée du dossier patient informatisé (DPI)
 * (docs/architecture.md § 8 ; décisions du porteur des 4 au 7 novembre 2026). Fonctions pures, testables sous Node.
 *
 * Fichier lu dans le navigateur, jamais copié sur le partage. Étapes : lecture (CSV ou Excel), attribution des
 * colonnes (une colonne peut être découpée : « Nom prénom » → nom, prénom, nom de naissance ; « Loc. » → chambre et
 * lit), correspondance des valeurs (sexe, unités du DPI → services), aperçu (nouveaux, modifiés, doublons possibles,
 * découpages ambigus, patients absents), puis saisies `PATIENT` et `SEJOUR` enregistrées en un lot annulable.
 *
 * Règles : un champ sans colonne n'est jamais touché ; une valeur corrigée à la main dans Tessera n'est pas écrasée
 * (écart signalé) ; un patient absent de la liste n'est jamais sorti d'office (sortie proposée) ; un doublon possible
 * n'est rattaché qu'après confirmation. L'export « Médecin responsable » et les commentaires ne sont pas proposés.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xlsx.js'));
  else (root.SIC = root.SIC || {}).importPatients = factory(root.SIC.xlsx);
})(typeof self !== 'undefined' ? self : this, function (X) {
  'use strict';

  var ORIGINE = 'import-dpi';
  var CHAMPS = [
    { cle: 'ipp', libelle: 'IPP (identifiant du patient)', syn: ['ipp', 'n ipp', 'numero ipp', 'identifiant patient', 'identifiant permanent'] },
    { cle: 'iep', libelle: 'Numéro de séjour (IEP)', syn: ['iep', 'n iep', 'numero de sejour', 'numero sejour', 'nda', 'sejour'] },
    { cle: 'nomComplet', libelle: 'Nom, prénom et nom de naissance (une colonne, découpée)', syn: ['nom prenom', 'nom et prenom', 'patient', 'identite', 'nom prenom naissance'] },
    { cle: 'nom', libelle: 'Nom', syn: ['nom', 'nom d usage', 'nom usuel', 'nom marital'] },
    { cle: 'prenom', libelle: 'Prénom', syn: ['prenom', 'prenoms'] },
    { cle: 'nomNaissance', libelle: 'Nom de naissance', syn: ['nom de naissance', 'nom naissance', 'nom de jeune fille'] },
    { cle: 'sexe', libelle: 'Sexe', syn: ['sexe', 'genre'] },
    { cle: 'naissance', libelle: 'Date de naissance', syn: ['ne e le', 'ne le', 'nee le', 'date de naissance', 'naissance', 'ddn', 'ne e'] },
    { cle: 'entree', libelle: 'Date d’entrée', syn: ['entree', 'date d entree', 'date entree', 'admission', 'date d admission'] },
    { cle: 'unite', libelle: 'Unité (code du DPI, à faire correspondre aux services)', syn: ['rm', 'um', 'unite', 'unite medicale', 'service', 'uf'] },
    { cle: 'loc', libelle: 'Chambre et lit (une colonne, découpée)', syn: ['loc', 'localisation', 'chambre lit', 'chambre et lit'] },
    { cle: 'chambre', libelle: 'Chambre', syn: ['chambre', 'n chambre'] },
    { cle: 'lit', libelle: 'Lit', syn: ['lit', 'n lit'] }
  ];
  var CHAMPS_FICHE = ['ipp', 'nom', 'prenom', 'nomNaissance', 'sexe', 'naissance', 'service'];
  var LIB = { ipp: 'IPP', nom: 'nom', prenom: 'prénom', nomNaissance: 'nom de naissance', sexe: 'sexe', naissance: 'date de naissance', service: 'service', entree: 'entrée', chambre: 'chambre', lit: 'lit', iep: 'numéro de séjour' };

  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function txt(v) { return v == null ? '' : String(v).trim(); }

  /** Ligne d'en-tête (la plus riche en noms connus parmi les 15 premières) et colonnes proposées, par nom d'en-tête. */
  function deviner(lignes) {
    var meilleure = 0, score = -1;
    for (var i = 0; i < Math.min(lignes.length, 15); i++) {
      var n = (lignes[i] || []).filter(function (x) { var k = norm(x); return CHAMPS.some(function (c) { return c.syn.indexOf(k) >= 0; }); }).length;
      if (n > score) { score = n; meilleure = i; }
    }
    var entetes = (lignes[meilleure] || []).map(txt), colonnes = {};
    CHAMPS.forEach(function (c) { var e = entetes.filter(function (x) { return c.syn.indexOf(norm(x)) >= 0; })[0]; colonnes[c.cle] = e || null; });
    // « Nom prénom » découpé : les colonnes séparées n'ont pas lieu d'être proposées en plus
    if (colonnes.nomComplet) ['nom', 'prenom', 'nomNaissance'].forEach(function (k) { if (colonnes[k] === colonnes.nomComplet) colonnes[k] = null; });
    if (colonnes.loc) ['chambre', 'lit'].forEach(function (k) { if (colonnes[k] === colonnes.loc) colonnes[k] = null; });
    return { entete: meilleure, entetes: entetes, colonnes: colonnes };
  }

  /** Prénom affiché : initiale majuscule de chaque partie (trait d'union et espaces conservés). */
  function prenomAffiche(s) { return txt(s).toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  /**
   * Découpage de « NOM PRENOM Née NOMNAISSANCE » (règles du porteur) : (1) après « Né » / « Née », le nom de
   * naissance ; (2) si le texte avant commence par le nom de naissance, c'est le nom d'usage, le reste le prénom ;
   * (3) sinon le dernier mot est le prénom ; (4) règle 3 avec plus de deux mots : découpage ambigu, à valider.
   */
  function decouperNom(brut) {
    var mots = txt(brut).split(/\s+/).filter(Boolean), k = -1;
    mots.forEach(function (m, i) { if (k < 0 && i > 0 && /^N[ée]e?$/.test(m) && m !== 'NE' && m !== 'NEE') k = i; });
    var avant = k >= 0 ? mots.slice(0, k) : mots, naiss = k >= 0 ? mots.slice(k + 1) : [];
    var r = { nom: '', prenom: '', nomNaissance: naiss.join(' ').toUpperCase(), regle: 3, ambigu: false };
    if (naiss.length && avant.length > naiss.length && naiss.every(function (m, i) { return avant[i].toUpperCase() === m.toUpperCase(); })) {
      r.nom = avant.slice(0, naiss.length).join(' ').toUpperCase(); r.prenom = prenomAffiche(avant.slice(naiss.length).join(' ')); r.regle = 2;
    } else {
      r.nom = avant.slice(0, Math.max(1, avant.length - 1)).join(' ').toUpperCase();
      r.prenom = avant.length > 1 ? prenomAffiche(avant[avant.length - 1]) : '';
      r.ambigu = avant.length > 2 || !r.prenom;
    }
    return r;
  }

  /** « HD412-U » → chambre 412, lit U ; une valeur non reconnue est gardée telle quelle comme chambre. */
  function decouperLoc(brut) {
    var s = txt(brut), m = /^[A-Za-z]*\s*(\d+[A-Za-z]?)\s*(?:[-\/ ]\s*([A-Za-z0-9]{1,3}))?$/.exec(s);
    if (!s) return { chambre: '', lit: '', reconnu: true };
    return m ? { chambre: m[1], lit: (m[2] || '').toUpperCase(), reconnu: true } : { chambre: s, lit: '', reconnu: false };
  }

  /** Date au format AAAA-MM-JJ : JJ/MM/AAAA, AAAA-MM-JJ ou nombre Excel ; null si illisible. */
  function lireJour(v) {
    if (v == null || txt(v) === '') return '';
    var t = typeof v === 'number' ? X.serieVersDate(v) : null, s = txt(v), m;
    if (t == null && (m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s))) {
      var an = +m[3] < 100 ? (+m[3] > 30 ? 1900 : 2000) + +m[3] : +m[3];
      if (+m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return null;
      return an + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    }
    if (t == null && (m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
    if (t == null) return null;
    var d = new Date(t);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function lireSexe(v, table) {
    var s = txt(v);
    if (!s) return '';
    if (table && table[s] !== undefined) return table[s];
    var n = norm(s);
    if (/^(f|fem|feminin|femme)$/.test(n)) return 'F';
    if (/^(m|h|masc|masculin|homme)$/.test(n)) return 'M';
    if (/^(i|indetermine|inconnu)$/.test(n)) return 'I';
    return null;
  }

  /** Valeurs distinctes d'une colonne (pour la correspondance des unités et du sexe). */
  function valeursDistinctes(lignes, modele, cle) {
    var e = modele.colonnes[cle], idx = (lignes[modele.entete] || []).map(txt).indexOf(e), vus = {};
    if (!e || idx < 0) return [];
    lignes.slice(modele.entete + 1).forEach(function (l) { var v = txt(l[idx]); if (v) vus[v] = (vus[v] || 0) + 1; });
    return Object.keys(vus).sort().map(function (v) { return { valeur: v, lignes: vus[v] }; });
  }

  function sejourDe(fiche, iep, entree, service) {
    var s = (fiche && fiche.sejours) || [];
    if (iep) return s.filter(function (x) { return x.iep === iep; })[0] || null;
    return s.filter(function (x) { return x.entree === entree && (!service || x.service === service); })[0] || null;
  }

  /** Fiches proches d'une ligne sans IPP connu : même nom (ou nom de naissance), prénom et date de naissance. */
  function proches(v, fiches) {
    return fiches.filter(function (f) {
      if (!v.naissance || f.naissance !== v.naissance) return false;
      if (norm(f.prenom) !== norm(v.prenom)) return false;
      var noms = [norm(f.nom), norm(f.nomNaissance)].filter(Boolean), siens = [norm(v.nom), norm(v.nomNaissance)].filter(Boolean);
      if (!siens.some(function (x) { return noms.indexOf(x) >= 0; })) return false;
      return !v.sexe || !f.sexe || v.sexe === f.sexe;
    });
  }

  /**
   * Aperçu. `fiches` : fiches en vigueur (fourniture du module Patients). Options : { aujourdhui: 'AAAA-MM-JJ' }.
   * Retourne { lignes, absents, services, compte } ; chaque ligne : { n, valeurs, statut, fiche, candidats,
   * changements, ecarts, sejour, decoupage, erreurs }. Statuts : nouveau, modifie, identique, doublon, erreur, ignoree.
   */
  function analyser(lignes, modele, fiches, options) {
    options = options || {};
    var entetes = (lignes[modele.entete] || []).map(txt);
    function col(cle) { var e = modele.colonnes[cle]; return e ? entetes.indexOf(e) : -1; }
    var c = {}; CHAMPS.forEach(function (x) { c[x.cle] = col(x.cle); });
    var liste = Object.keys(fiches || {}).map(function (k) { return fiches[k]; });
    var res = [], services = {}, vus = {};
    lignes.slice(modele.entete + 1).forEach(function (l, i) {
      var r = { n: modele.entete + i + 2, valeurs: {}, erreurs: [], changements: [], ecarts: [], candidats: [], decoupage: null, statut: '' };
      function cel(k) { return c[k] >= 0 ? l[c[k]] : undefined; }
      var v = r.valeurs;
      ['ipp', 'iep', 'nom', 'prenom', 'nomNaissance'].forEach(function (k) { if (c[k] >= 0) v[k] = txt(cel(k)); });
      if (v.nom !== undefined) v.nom = v.nom.toUpperCase();
      if (v.nomNaissance !== undefined) v.nomNaissance = v.nomNaissance.toUpperCase();
      if (v.prenom !== undefined) v.prenom = prenomAffiche(v.prenom);
      if (c.nomComplet >= 0) {
        var brut = txt(cel('nomComplet')), d = decouperNom(brut);
        r.decoupage = { brut: brut, regle: d.regle, ambigu: d.ambigu };
        if (v.nom === undefined || !v.nom) v.nom = d.nom;
        if (v.prenom === undefined || !v.prenom) v.prenom = d.prenom;
        if (v.nomNaissance === undefined || !v.nomNaissance) v.nomNaissance = d.nomNaissance;
      }
      if (c.sexe >= 0) { var sx = lireSexe(cel('sexe'), modele.sexes); if (sx === null) r.erreurs.push('sexe non reconnu : « ' + txt(cel('sexe')) + ' »'); else v.sexe = sx; }
      ['naissance', 'entree'].forEach(function (k) { if (c[k] < 0) return; var j = lireJour(cel(k)); if (j === null) r.erreurs.push(LIB[k] + ' illisible : « ' + txt(cel(k)) + ' »'); else v[k] = j; });
      if (c.loc >= 0) { var lo = decouperLoc(cel('loc')); v.chambre = lo.chambre; v.lit = lo.lit; if (!lo.reconnu) r.erreurs.push('chambre et lit non découpés : « ' + txt(cel('loc')) + ' » gardé comme chambre'); }
      if (c.chambre >= 0) v.chambre = txt(cel('chambre'));
      if (c.lit >= 0) v.lit = txt(cel('lit')).toUpperCase();
      if (c.unite >= 0) {
        var u = txt(cel('unite')), sv = (modele.unites || {})[u];
        if (sv === '') { r.statut = 'ignoree'; res.push(r); return; }           // unité écartée de l'import
        if (!sv) { r.statut = 'erreur'; r.erreurs.push('unité « ' + u + ' » sans service correspondant'); res.push(r); return; }
        v.service = sv;
      } else if (options.service) v.service = options.service;
      if (!v.nom) { r.statut = 'erreur'; r.erreurs.push('nom absent'); res.push(r); return; }
      if (v.service) services[v.service] = true;
      // Lits existants (0.29.0) : chambre et lit de l'export rattachés à la liste du service (correspondance mémorisée,
      // sinon reconnaissance « 417 P », « 417P »…) ; un lit non reconnu est signalé pour être rattaché à la main
      var K = (typeof self !== 'undefined' && self.SIC && self.SIC.chambres) || null;
      if (K && options.config && v.service && (v.chambre || v.lit) && K.liste(options.config, v.service)) {
        var brut = K.cle(v.chambre || '', v.lit || ''), cor = (modele.lits || {})[v.service + '|' + brut], t = null;
        if (cor && cor !== '__garder') t = { chambre: cor.split('|')[0], lit: cor.split('|')[1] || '' };
        else if (!cor) t = K.trouver(options.config, v.service, v.chambre, v.lit);
        if (t) { v.chambre = t.chambre; v.lit = t.lit; }
        else if (cor !== '__garder') r.litInconnu = { service: v.service, brut: brut, libelle: K.libelle(v.chambre || '', v.lit || '') };
      }
      // Fiche du patient : IPP, puis numéro de séjour, puis doublons possibles (confirmation)
      var f = null;
      if (v.ipp) f = liste.filter(function (x) { return x.ipp === v.ipp; })[0] || null;
      if (!f && v.iep) f = liste.filter(function (x) { return sejourDe(x, v.iep); })[0] || null;
      if (!f && !v.ipp) { r.candidats = proches(v, liste); if (r.candidats.length) r.statut = 'doublon'; }
      else if (!f && v.ipp) { r.candidats = proches(v, liste).filter(function (x) { return !x.ipp; }); if (r.candidats.length) r.statut = 'doublon'; }
      // Découpage déjà validé pour cette fiche : repris tel quel
      if (f && r.decoupage && f.decoupageNom === r.decoupage.brut) { v.nom = f.nom; v.prenom = f.prenom; v.nomNaissance = f.nomNaissance; r.decoupage.ambigu = false; r.decoupage.valide = true; }
      r.fiche = f;
      if (f) comparer(r, f);
      if (!r.statut) r.statut = !f ? 'nouveau' : (r.changements.length || r.sejour && r.sejour.changements.length ? 'modifie' : 'identique');
      if (f) vus[f.id] = true;
      res.push(r);
    });
    // Absents : séjour en cours dans un service de l'import, patient absent de la liste
    var absents = liste.filter(function (f) {
      if (vus[f.id]) return false;
      var s = (f.sejours || []).filter(function (x) { return !x.sortie; });
      return s.some(function (x) { return services[x.service || f.service]; });
    }).map(function (f) { return { fiche: f, sejours: (f.sejours || []).filter(function (x) { return !x.sortie && services[x.service || f.service]; }), sortie: options.aujourdhui || '' }; });
    var compte = {};
    res.forEach(function (r) { compte[r.statut] = (compte[r.statut] || 0) + 1; });
    return { lignes: res, absents: absents, services: Object.keys(services), compte: compte };
  }

  /** Changements d'une ligne par rapport à sa fiche ; une valeur saisie à la main dans Tessera n'est pas écrasée. */
  function comparer(r, f) {
    var v = r.valeurs;
    r.changements = []; r.ecarts = [];
    CHAMPS_FICHE.forEach(function (k) {
      if (v[k] === undefined || v[k] === '' || (f[k] || '') === v[k]) return;
      var manuel = f.sources && f.sources[k] === 'saisie' && f[k];
      (manuel ? r.ecarts : r.changements).push({ champ: k, libelle: LIB[k], avant: f[k] || '', apres: v[k] });
    });
    var sj = sejourDe(f, v.iep, v.entree, v.service);
    r.sejour = { existant: sj, changements: [] };
    if (v.iep || v.entree) {
      ['iep', 'entree', 'service', 'chambre', 'lit'].forEach(function (k) {
        if (v[k] === undefined || v[k] === '') return;
        if (!sj || (sj[k] || '') !== v[k]) r.sejour.changements.push({ champ: k, libelle: LIB[k], avant: sj ? sj[k] || '' : '', apres: v[k] });
      });
    }
  }

  function id(prefixe) { return prefixe + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase(); }

  /**
   * Saisies à enregistrer (lot du module Patients). decisions : { doublons: { n: idFiche | 'nouveau' | 'ignorer' },
   * noms: { n: { nom, prenom, nomNaissance } } (découpage validé), sorties: { idFiche: 'AAAA-MM-JJ' } }.
   * Une ligne doublon sans décision n'est pas importée. Retourne { evenements, resume }.
   */
  function saisies(analyse, decisions, options) {
    decisions = decisions || {}; options = options || {};
    var evts = [], resume = { creees: 0, modifiees: 0, sejours: 0, sorties: 0, attente: 0, ignorees: 0 }, at = options.at || new Date().toISOString();
    function pousser(type, data) { evts.push({ type: type, at: at, data: data }); }
    analyse.lignes.forEach(function (r) {
      if (r.statut === 'erreur' || r.statut === 'ignoree') { resume.ignorees++; return; }
      var v = Object.assign({}, r.valeurs), f = r.fiche, nm = decisions.noms && decisions.noms[r.n];
      if (nm) { v.nom = txt(nm.nom).toUpperCase(); v.prenom = prenomAffiche(nm.prenom); v.nomNaissance = txt(nm.nomNaissance).toUpperCase(); }
      if (r.statut === 'doublon') {
        var dd = decisions.doublons && decisions.doublons[r.n];
        if (!dd) { resume.attente++; return; }
        if (dd === 'ignorer') { resume.ignorees++; return; }
        f = dd === 'nouveau' ? null : r.candidats.filter(function (x) { return x.id === dd; })[0];
        if (f) { var copie = { valeurs: v, decoupage: r.decoupage }; comparer(copie, f); r = Object.assign({}, r, { changements: copie.changements, ecarts: copie.ecarts, sejour: copie.sejour }); }
      } else if (nm && f) { var cp = { valeurs: v }; comparer(cp, f); r = Object.assign({}, r, { changements: cp.changements, sejour: cp.sejour }); }
      var pid = f ? f.id : id('P'), data = { patientId: pid, origine: ORIGINE };
      if (!f) {
        CHAMPS_FICHE.forEach(function (k) { if (v[k]) data[k] = v[k]; });
        resume.creees++;
      } else {
        r.changements.forEach(function (x) { data[x.champ] = x.apres; });
        if (r.changements.length) resume.modifiees++;
      }
      if (r.decoupage && (r.decoupage.ambigu || nm) && (!f || f.decoupageNom !== r.decoupage.brut)) data.decoupageNom = r.decoupage.brut;
      if (Object.keys(data).length > 2) pousser('PATIENT', data);
      // Séjour : par numéro de séjour, sinon par date d'entrée
      if (v.iep || v.entree) {
        var sj = f ? sejourDe(f, v.iep, v.entree, v.service) : null, sd = { patientId: pid, sejourId: sj ? sj.id : (v.iep ? 'iep:' + v.iep : id('S')), origine: ORIGINE };
        ['iep', 'entree', 'service', 'chambre', 'lit'].forEach(function (k) { if (v[k] !== undefined && v[k] !== '' && (!sj || (sj[k] || '') !== v[k])) sd[k] = v[k]; });
        if (Object.keys(sd).length > 3) { pousser('SEJOUR', sd); resume.sejours++; }
      }
    });
    analyse.absents.forEach(function (a) {
      var date = decisions.sorties && decisions.sorties[a.fiche.id];
      if (!date) return;
      a.sejours.forEach(function (s) { pousser('SEJOUR', { patientId: a.fiche.id, sejourId: s.id, sortie: date, origine: ORIGINE }); });
      resume.sorties++;
    });
    return { evenements: evts, resume: resume };
  }

  /** Modèle d'import à mémoriser (sans aucune donnée de patient : noms des colonnes et correspondances). */
  function modeleAMemoriser(m) {
    return { colonnes: Object.assign({}, m.colonnes), unites: Object.assign({}, m.unites || {}), sexes: Object.assign({}, m.sexes || {}), lits: Object.assign({}, m.lits || {}) };
  }
  /** Modèle mémorisé appliqué à un fichier : en-têtes retrouvés par leur nom, ligne d'en-tête redevinée. */
  function appliquerModele(lignes, memorise) {
    var g = deviner(lignes);
    if (!memorise) return { entete: g.entete, colonnes: g.colonnes, unites: {}, sexes: {}, lits: {} };
    var colonnes = {};
    CHAMPS.forEach(function (c) { var e = memorise.colonnes && memorise.colonnes[c.cle]; colonnes[c.cle] = e && g.entetes.indexOf(e) >= 0 ? e : (e === null ? null : g.colonnes[c.cle]); });
    return { entete: g.entete, colonnes: colonnes, unites: Object.assign({}, memorise.unites || {}), sexes: Object.assign({}, memorise.sexes || {}), lits: Object.assign({}, memorise.lits || {}) };
  }

  return {
    ORIGINE: ORIGINE, CHAMPS: CHAMPS, deviner: deviner, decouperNom: decouperNom, decouperLoc: decouperLoc, lireJour: lireJour,
    lireSexe: lireSexe, valeursDistinctes: valeursDistinctes, analyser: analyser, saisies: saisies,
    modeleAMemoriser: modeleAMemoriser, appliquerModele: appliquerModele, prenomAffiche: prenomAffiche, lireCSV: X.lireCSV
  };
});
