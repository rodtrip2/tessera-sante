// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — champs ajoutés (0.18.0, décisions du porteur du 9 novembre 2026, plan « Vue d'ensemble »).
 *
 * Mécanisme commun des données ajoutées par l'établissement ou par le cadre : données complémentaires de la fiche
 * patient (0.13.0), données ajoutées des véhicules (0.14.0), puis colonnes de la Vue d'ensemble. Le socle ne connaît
 * aucune règle métier : il décrit des types de valeurs, leur contrôle, leur affichage et les droits réglés pour chaque
 * donnée.
 *
 * Définition d'une donnée (réglage commun `champsAjoutes`, journal du socle ; repris de `patientsChamps` tant qu'il
 * n'existe pas) : { id, libelle, type, entite (patient | medecin), module (module de rattachement : ses valeurs sont
 * rangées dans son journal, chiffrées par sa clé), choix, services ([] : tous), saisie (rôles qui modifient ; [] : ceux qui
 * écrivent déjà dans le module), lecture (rôles qui voient ; [] : tous), actif (false : masquée, jamais effacée),
 * protection ('interface' : droits plus restreints que le module, appliqués par l'écran ; 'cle' : clé propre à la donnée,
 * remise aux seuls rôles réglés), tiers (information concernant un tiers : exclue des exports remis au patient),
 * clinique (option « donnée clinique », activée par l'administrateur seul, après avertissement ; clé propre obligatoire),
 * modele et libre (check-list : éléments fixés par la donnée, éléments libres permis), tri (notes), formule (calcul),
 * par (auteur de la définition : administrateur ou cadre, services du cadre) }.
 *
 * Valeurs : saisie `COMPLEMENT` du module Patients (donnée d'un patient rattachée au module Patients, sans clé propre :
 * mécanisme de 0.13.0 inchangé) ou saisie `VALEUR` (toute autre donnée), rangée dans le journal du module de
 * rattachement, ou dans celui de la clé propre (`d-<id>`). Notes et check-lists se construisent saisie après saisie
 * (`op` : ajout, retrait, case cochée) : rien n'est jamais effacé, un retrait masque.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).champs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = {
    ouiNon: 'Case à cocher (oui ou non)', texte: 'Texte court', liste: 'Liste de choix', choixMultiple: 'Choix multiple', date: 'Date',
    dateFenetre: 'Date ou période', nombre: 'Nombre', telephone: 'Numéro de téléphone', professionnel: 'Professionnel',
    notes: 'Liste de notes', checklist: 'Check-list', formule: 'Calcul (formule)'
  };
  /** Types d'origine (0.13.0), seuls proposés aux véhicules. */
  var TYPES_SIMPLES = ['ouiNon', 'texte', 'liste', 'date', 'nombre'];
  /** Types dont la valeur se construit par opérations (ajout, retrait, case cochée). */
  var CUMULATIFS = { notes: 1, checklist: 1 };
  var ENTITES = { patient: 'Patient', medecin: 'Médecin', agent: 'Agent' };
  /*
   * Données d'un agent (0.20.0, décision du porteur du 9 novembre 2026, en attendant le module Agents) : données du
   * personnel, toujours sous clé propre, visibles et modifiées par le cadre seul par défaut ; avertissement à la création.
   */
  var AVERTISSEMENT_AGENT = 'Données du personnel : à limiter au strict nécessaire à l’organisation du service (ni donnée de santé, ni évaluation, ni appréciation). Avant usage : avis du délégué à la protection des données, inscription au registre des traitements, information des agents et, selon l’établissement, des représentants du personnel. La donnée est protégée par une clé propre, remise aux seuls rôles cochés (le cadre par défaut).';
  var IMPORTANCES = { info: 'Information', important: 'Important', urgent: 'Urgent' };
  var PROTECTIONS = { interface: 'Droits appliqués par l’écran (plus restreints que le module)', cle: 'Clé propre à la donnée' };
  // Libellés qui évoquent une donnée clinique (rappel à la création : aucune donnée clinique dans Tessera)
  var MOTS_CLINIQUES = ['traitement', 'diagnostic', 'pathologie', 'symptome', 'medicament', 'antecedent', 'maladie', 'trouble', 'posologie', 'allergie', 'addiction', 'suicid', 'delire', 'hallucination', 'psychose'];
  var MOTIF_ID = /^[a-z][a-z0-9-]{1,30}$/;
  var MOTIF_JOUR = /^\d{4}-\d{2}-\d{2}$/;

  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }
  function liste(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : []; }
  function cloner(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

  /** Définition validée à la lecture ; null si elle est inutilisable. */
  function normaliser(c, defaut) {
    if (!c || !MOTIF_ID.test(c.id || '') || !texte(c.libelle) || !TYPES[c.type]) return null;
    var d = defaut || {}, entite = ENTITES[c.entite] ? c.entite : (d.entite || 'patient');
    var x = {
      id: c.id, libelle: texte(c.libelle, 60), type: c.type, entite: entite,
      module: entite === 'agent' ? 'vue' : MOTIF_ID.test(c.module || '') ? c.module : (d.module || (entite === 'medecin' ? 'suivi' : 'patients')),
      choix: c.type === 'liste' || c.type === 'choixMultiple' ? (Array.isArray(c.choix) ? c.choix.map(function (v) { return texte(v, 60); }).filter(Boolean) : []) : [],
      services: liste(c.services), saisie: liste(c.saisie), lecture: liste(c.lecture), actif: c.actif !== false,
      protection: c.clinique === true || c.protection === 'cle' || entite === 'agent' ? 'cle' : 'interface', tiers: c.tiers === true, clinique: c.clinique === true
    };
    // Donnée d'un agent : le cadre seul par défaut (rôles qui la voient et la modifient)
    if (entite === 'agent') { if (!x.lecture.length) x.lecture = ['CADRE']; if (!x.saisie.length) x.saisie = ['CADRE']; }
    if (c.type === 'checklist') {
      x.modele = (Array.isArray(c.modele) ? c.modele : []).filter(function (e) { return e && MOTIF_ID.test(e.id || '') && texte(e.libelle); })
        .map(function (e) { return { id: e.id, libelle: texte(e.libelle, 80), actif: e.actif !== false }; });
      x.libre = c.libre === true || !x.modele.length;
    }
    if (c.type === 'notes') x.tri = c.tri === 'asc' ? 'asc' : 'desc';
    if (c.type === 'formule') x.formule = texte(c.formule, 500);
    if (c.par && typeof c.par === 'object') x.par = { role: c.par.role === 'CADRE' ? 'CADRE' : 'ADMIN', services: liste(c.par.services) };
    return x;
  }

  /**
   * Définitions de l'établissement. `champsAjoutes` fait foi dès qu'il existe (tableau, même vide) ; avant, les données
   * complémentaires de la fiche patient (`patientsChamps`, 0.13.0) sont reprises telles quelles.
   * options : { tous (y compris masquées), service, entite, module, type }.
   */
  function definitions(config, options) {
    var o = options || {}, src = config && Array.isArray(config.champsAjoutes) ? config.champsAjoutes : ((config && config.patientsChamps) || []).map(function (c) { return Object.assign({}, c, { entite: 'patient', module: 'patients' }); });
    var vus = {};
    return (Array.isArray(src) ? src : []).map(function (c) { return normaliser(c); }).filter(function (c) {
      if (!c || vus[c.id]) return false;
      vus[c.id] = true;
      if (!o.tous && !c.actif) return false;
      if (o.service && c.services.length && c.services.indexOf(o.service) < 0) return false;
      if (o.entite && c.entite !== o.entite) return false;
      if (o.module && c.module !== o.module) return false;
      if (o.type && c.type !== o.type) return false;
      return true;
    });
  }
  function definition(config, id) { return definitions(config, { tous: true }).filter(function (c) { return c.id === id; })[0] || null; }

  // ------------------------------------------------------------ Droits réglés pour chaque donnée
  function aRole(l, roles) { return !l.length || (roles || []).some(function (r) { return r === 'ADMIN' || l.indexOf(r) >= 0; }); }
  function peutVoir(champ, roles) { return aRole(champ.lecture, roles); }
  /** `peutModule` : l'agent écrit déjà dans le module de rattachement (règle d'une donnée sans rôles de saisie précisés). */
  function peutSaisir(champ, roles, peutModule) {
    if (champ.type === 'formule') return false;
    if ((roles || []).indexOf('ADMIN') >= 0) return true;
    return champ.saisie.length ? aRole(champ.saisie, roles) && peutVoir(champ, roles) : !!peutModule && peutVoir(champ, roles);
  }
  /** Nom de la clé propre d'une donnée protégée (null : clé du module de rattachement). */
  function cleDe(champ) { return champ && champ.protection === 'cle' ? 'd-' + champ.id : null; }
  /** Clés propres à créer et à remettre : [{ nom, champ }]. */
  function clesPropres(config) { return definitions(config, { tous: true }).filter(function (c) { return c.protection === 'cle'; }).map(function (c) { return { nom: cleDe(c), champ: c }; }); }
  /** Un compte a-t-il droit à la clé propre d'une donnée (rôle qui la voit ou la saisit ; administrateur toujours) ? */
  function aDroitCle(champ, roles) {
    roles = roles || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    var l = champ.lecture.concat(champ.saisie);
    return l.length > 0 && roles.some(function (r) { return l.indexOf(r) >= 0; });
  }
  /** Journal qui reçoit les valeurs d'une donnée : clé propre, sinon module de rattachement. */
  function journalDe(champ) { return cleDe(champ) || champ.module; }
  /** Saisie qui porte la valeur : COMPLEMENT (fiche patient, module Patients, sans clé propre, 0.13.0) ou VALEUR. */
  function typeSaisie(champ) { return champ.entite === 'patient' && champ.module === 'patients' && champ.protection !== 'cle' ? 'COMPLEMENT' : 'VALEUR'; }

  // ------------------------------------------------------------ Valeurs
  function telephone(v) {
    var t = String(v).trim().replace(/[.\-\s/()]+/g, ' ').replace(/\s+/g, ' ');
    var chiffres = t.replace(/[^0-9]/g, '');
    if (!/^\+?[0-9 ]+$/.test(t) || chiffres.length < 3 || chiffres.length > 20) return null;
    // Numéro français à dix chiffres : groupé par deux
    if (/^0\d{9}$/.test(chiffres) && t.charAt(0) !== '+') return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
    return t;
  }
  /** Valeur conforme au type, ou erreur. '' ou null : retire la valeur. Notes et check-lists : voir `operation`. */
  function valeur(champ, v) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
    switch (champ.type) {
      case 'ouiNon': if (v === true || v === false) return v; if (v === 'oui') return true; if (v === 'non') return false; break;
      case 'texte': return texte(v, 200) || null;
      case 'liste': if (champ.choix.indexOf(String(v)) >= 0) return String(v); break;
      case 'choixMultiple':
        var l = (Array.isArray(v) ? v : [v]).map(String);
        if (l.every(function (x) { return champ.choix.indexOf(x) >= 0; })) return champ.choix.filter(function (x) { return l.indexOf(x) >= 0; });
        break;
      case 'date': if (MOTIF_JOUR.test(v)) return v; break;
      case 'dateFenetre':
        if (typeof v === 'string' && MOTIF_JOUR.test(v)) return { debut: v };
        if (v && typeof v === 'object' && (MOTIF_JOUR.test(v.debut || '') || texte(v.precision))) {
          var f = {};
          if (MOTIF_JOUR.test(v.debut || '')) f.debut = v.debut;
          if (MOTIF_JOUR.test(v.fin || '')) { if (f.debut && v.fin < f.debut) throw new Error('« ' + champ.libelle + ' » : la fin précède le début.'); f.fin = v.fin; }
          if (texte(v.precision)) f.precision = texte(v.precision, 80);
          return f;
        }
        break;
      case 'nombre': if (isFinite(+v)) return +v; break;
      case 'telephone': var t = telephone(v); if (t) return t; break;
      case 'professionnel': if (v && typeof v === 'object' && texte(v.nom)) return { id: v.id || null, nom: texte(v.nom, 80) }; break;
      case 'notes': case 'checklist': throw new Error('« ' + champ.libelle + ' » : se modifie élément par élément.');
      case 'formule': throw new Error('« ' + champ.libelle + ' » : valeur calculée, non modifiable.');
    }
    throw new Error('« ' + champ.libelle + ' » : valeur attendue — ' + TYPES[champ.type].toLowerCase() + '.');
  }

  /**
   * Opération sur une note ou une check-list, contrôlée avant l'enregistrement :
   *   notes     { ajout: { id, texte, importance } } | { retrait: id }
   *   checklist { cocher: { element, fait } } | { ajout: { id, libelle } } (si la donnée permet des éléments libres) | { retrait: id }
   */
  function operation(champ, op) {
    if (!op || typeof op !== 'object') throw new Error('Opération absente.');
    if (champ.type === 'notes') {
      if (op.ajout) {
        if (!MOTIF_ID.test(op.ajout.id || '')) throw new Error('Note : identifiant manquant.');
        if (!texte(op.ajout.texte)) throw new Error('La note est vide.');
        return { ajout: { id: op.ajout.id, texte: texte(op.ajout.texte, 300), importance: IMPORTANCES[op.ajout.importance] ? op.ajout.importance : 'info' } };
      }
      if (op.retrait && typeof op.retrait === 'string') return { retrait: op.retrait };
    }
    if (champ.type === 'checklist') {
      if (op.cocher && typeof op.cocher.element === 'string') return { cocher: { element: op.cocher.element, fait: op.cocher.fait !== false } };
      if (op.ajout) {
        if (!champ.libre) throw new Error('« ' + champ.libelle + ' » : la check-list suit son modèle (aucun élément libre).');
        if (!MOTIF_ID.test(op.ajout.id || '') || !texte(op.ajout.libelle)) throw new Error('Élément de check-list incomplet.');
        return { ajout: { id: op.ajout.id, libelle: texte(op.ajout.libelle, 80) } };
      }
      if (op.retrait && typeof op.retrait === 'string') return { retrait: op.retrait };
    }
    throw new Error('« ' + champ.libelle + ' » : opération inconnue.');
  }

  /**
   * Applique une opération à la valeur actuelle (réduction du journal : l'opération se décrit elle-même, la définition
   * n'est pas nécessaire). `e` : la saisie (date et auteur).
   */
  function appliquerOperation(actuel, op, e) {
    var le = e && e.at, par = e && e.by;
    if (op.ajout && op.ajout.texte !== undefined) {
      var n = Array.isArray(actuel) ? actuel.slice() : [];
      if (!n.some(function (x) { return x.id === op.ajout.id; })) n.push({ id: op.ajout.id, texte: op.ajout.texte, importance: op.ajout.importance || 'info', le: le, par: par });
      return n;
    }
    if (op.retrait && Array.isArray(actuel)) {
      return actuel.map(function (x) { return x.id === op.retrait && !x.retire ? Object.assign({}, x, { retire: { le: le, par: par } }) : x; });
    }
    var c = actuel && !Array.isArray(actuel) && typeof actuel === 'object' ? { elements: (actuel.elements || []).slice(), coches: Object.assign({}, actuel.coches || {}) } : { elements: [], coches: {} };
    if (op.cocher) c.coches[op.cocher.element] = { fait: op.cocher.fait !== false, le: le, par: par };
    else if (op.ajout && op.ajout.libelle !== undefined) { if (!c.elements.some(function (x) { return x.id === op.ajout.id; })) c.elements.push({ id: op.ajout.id, libelle: op.ajout.libelle, le: le, par: par }); }
    else if (op.retrait) c.elements = c.elements.map(function (x) { return x.id === op.retrait && !x.retire ? Object.assign({}, x, { retire: { le: le, par: par } }) : x; });
    return c;
  }

  /** Notes affichées (retirées masquées), triées selon la donnée ; `toutes` : y compris les notes retirées. */
  function notes(champ, v, toutes) {
    var l = (Array.isArray(v) ? v : []).filter(function (x) { return toutes || !x.retire; });
    var asc = champ && champ.tri === 'asc';
    return l.slice().sort(function (a, b) { return asc ? String(a.le).localeCompare(String(b.le)) : String(b.le).localeCompare(String(a.le)); });
  }
  /** Importance la plus haute des notes affichées ('' sans note). */
  function importanceMax(v) {
    var ordre = ['info', 'important', 'urgent'], m = -1;
    notes(null, v).forEach(function (x) { m = Math.max(m, ordre.indexOf(x.importance)); });
    return m < 0 ? '' : ordre[m];
  }
  /**
   * Check-list d'une entité : éléments du modèle (actifs, ou retirés mais déjà cochés) puis éléments libres non retirés,
   * chacun avec son état ; avancement { faits, total }.
   */
  function checklist(champ, v) {
    var c = v && typeof v === 'object' && !Array.isArray(v) ? v : { elements: [], coches: {} }, coches = c.coches || {};
    var els = ((champ && champ.modele) || []).filter(function (e) { return e.actif || (coches[e.id] && coches[e.id].fait); }).map(function (e) { return { id: e.id, libelle: e.libelle, modele: true }; })
      .concat((c.elements || []).filter(function (e) { return !e.retire; }).map(function (e) { return { id: e.id, libelle: e.libelle, libre: true, le: e.le, par: e.par }; }));
    els.forEach(function (e) { var k = coches[e.id]; e.fait = !!(k && k.fait); if (k) { e.cocheLe = k.le; e.cochePar = k.par; } });
    return { elements: els, faits: els.filter(function (e) { return e.fait; }).length, total: els.length };
  }

  function jourFr(j) { return String(j || '').split('-').reverse().join('/'); }
  /** Libellé d'une valeur (tableaux, exports). */
  function lib(champ, v) {
    if (v === null || v === undefined || v === '') return '';
    switch (champ.type) {
      case 'ouiNon': return v ? 'Oui' : 'Non';
      case 'date': return jourFr(v);
      case 'dateFenetre':
        if (!v || typeof v !== 'object') return '';
        var d = v.debut ? (v.fin && v.fin !== v.debut ? 'du ' + jourFr(v.debut) + ' au ' + jourFr(v.fin) : jourFr(v.debut)) : '';
        return [d, v.precision || ''].filter(Boolean).join(' — ');
      case 'professionnel': return v.nom || '';
      case 'choixMultiple': return Array.isArray(v) ? v.join(', ') : String(v);
      case 'notes': var n = notes(champ, v); return n.length ? n.map(function (x) { return (x.importance !== 'info' ? '[' + IMPORTANCES[x.importance] + '] ' : '') + x.texte; }).join(' | ') : '';
      case 'checklist': var k = checklist(champ, v); return k.total ? k.faits + '/' + k.total : '';
      default: return String(v);
    }
  }
  /** Valeur comparable (tri, filtres, formules) : nombre, texte ou date ISO. */
  function brute(champ, v) {
    if (v === null || v === undefined) return null;
    switch (champ.type) {
      case 'ouiNon': return v ? 1 : 0;
      case 'dateFenetre': return v && v.debut ? v.debut : null;
      case 'professionnel': return v.nom || null;
      case 'choixMultiple': return Array.isArray(v) ? v.join(', ') : v;
      case 'notes': return notes(champ, v).length;
      case 'checklist': var k = checklist(champ, v); return k.total ? k.faits / k.total : null;
      default: return v;
    }
  }

  function libelleClinique(libelle) {
    var t = String(libelle || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return MOTS_CLINIQUES.filter(function (m) { return t.indexOf(m) >= 0; });
  }
  function identifiant(libelle, existants) {
    var code = String(libelle || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'donnee';
    if (!/^[a-z]/.test(code)) code = 'd-' + code;
    var base = code, n = 2;
    while ((existants || []).indexOf(code) >= 0) code = base.slice(0, 26) + '-' + n++;
    return code;
  }

  // ------------------------------------------------------------ Valeurs VALEUR (journal du module de rattachement)
  /**
   * Valeurs portées par les saisies `VALEUR` : { patient: { id: { champ: valeur } }, medecin: { ... } }, avec l'historique
   * daté de chaque valeur (`historique[entite][id][champ]`). `annules` : saisies annulées (réduction du journal).
   */
  function reduireValeurs(evts, annules) {
    var res = { patient: {}, medecin: {}, agent: {}, historique: { patient: {}, medecin: {}, agent: {} } };
    // Lots (démonstration, imports) dépliés comme par la réduction du journal : mêmes identifiants
    var tous = [];
    (evts || []).forEach(function (e) {
      if (e.type !== 'LOT') { tous.push(e); return; }
      (e.data && e.data.evenements || []).forEach(function (x, i) { if (x.type === 'VALEUR') tous.push({ id: e.id + '.' + String(i).padStart(5, '0'), at: x.at || e.at, by: x.by || e.by, type: x.type, data: x.data, lot: e.id }); });
    });
    tous.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id < b.id ? -1 : 1); }).forEach(function (e) {
      if (e.type !== 'VALEUR' || (annules && (annules[e.id] || (e.lot && annules[e.lot])))) return;
      var d = e.data || {};
      if (!ENTITES[d.entite] || !d.id || !d.champ) return;
      var parE = res[d.entite], v = parE[d.id] = parE[d.id] || {};
      if (d.op) v[d.champ] = appliquerOperation(v[d.champ], d.op, e);
      else if (d.valeur === null || d.valeur === undefined) delete v[d.champ];
      else v[d.champ] = cloner(d.valeur);
      var h = res.historique[d.entite][d.id] = res.historique[d.entite][d.id] || {};
      (h[d.champ] = h[d.champ] || []).push({ le: e.at, par: e.by, valeur: d.op ? null : (d.valeur === undefined ? null : d.valeur), op: d.op || null, evt: e.id });
    });
    return res;
  }

  /**
   * Saisie `VALEUR` ou `COMPLEMENT` permise selon les rôles réglés pour la donnée (et non selon les accès des modules) :
   * contrôle commun (session et module Patients). ctx : { config, peutModule(champ) }. Lève une erreur explicite.
   */
  function controlerSaisie(type, data, roles, ctx) {
    var c = data && definition(ctx.config, data.champ);
    if (!c) throw new Error('Donnée inconnue.');
    if (!c.actif) throw new Error('« ' + c.libelle + ' » n’est plus proposée.');
    if (typeSaisie(c) !== type) throw new Error('« ' + c.libelle + ' » : saisie mal rangée.');
    if (type === 'VALEUR' && (data.entite !== c.entite || !data.id)) throw new Error('« ' + c.libelle + ' » : ' + ENTITES[c.entite].toLowerCase() + ' attendu.');
    if (!peutSaisir(c, roles, ctx.peutModule ? ctx.peutModule(c) : false)) throw new Error('Votre rôle ne modifie pas « ' + c.libelle + ' ».');
    if (CUMULATIFS[c.type]) operation(c, data.op);
    else { if (data.op) throw new Error('« ' + c.libelle + ' » : opération inattendue.'); valeur(c, data.valeur); }
    return c;
  }

  // ------------------------------------------------------------ Définitions réglées par le cadre
  /**
   * Le cadre ajoute, modifie ou masque les données de ses services (décision du porteur du 9 novembre 2026) ; les
   * données de l'établissement, celles des autres services et l'option « donnée clinique » restent à l'administrateur.
   * Renvoie true ou lève une erreur.
   */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0) throw new Error('Seuls le cadre et l’administrateur règlent les données ajoutées.');
    if (!Array.isArray(nouveau)) throw new Error('Liste des données attendue.');
    var avant = {}, apres = {};
    (Array.isArray(ancien) ? ancien : []).forEach(function (c) { if (c && c.id) avant[c.id] = c; });
    nouveau.forEach(function (c) { if (c && c.id) apres[c.id] = c; });
    function siens(c) { var s = liste(c && c.services); return s.length > 0 && s.every(function (x) { return sv.indexOf(x) >= 0; }); }
    Object.keys(avant).forEach(function (id) {
      if (!apres[id]) throw new Error('Une donnée enregistrée ne se supprime pas : masquez-la.');
      if (JSON.stringify(avant[id]) !== JSON.stringify(apres[id]) && !siens(avant[id])) throw new Error('« ' + (avant[id].libelle || id) + ' » : réglée par l’administrateur ou par le cadre d’un autre service.');
    });
    Object.keys(apres).forEach(function (id) {
      var c = apres[id], a = avant[id];
      if (JSON.stringify(a) === JSON.stringify(c)) return;
      if (!siens(c)) throw new Error('« ' + (c.libelle || id) + ' » : choisissez un ou plusieurs de vos services.');
      if (c.clinique === true && !(a && a.clinique === true)) throw new Error('L’option « donnée clinique » est réservée à l’administrateur.');
      if (a && a.type !== c.type) throw new Error('« ' + (c.libelle || id) + ' » : le type d’une donnée enregistrée ne change pas.');
      if (a && (a.protection || 'interface') !== (c.protection || 'interface')) throw new Error('« ' + (c.libelle || id) + ' » : la protection d’une donnée enregistrée ne change pas.');
    });
    return true;
  }
  /** Contrôle de la liste entière (administrateur comme cadre) : identifiants uniques, type et protection inchangés. */
  function controlerListe(ancien, nouveau) {
    var vus = {}, avant = {};
    (Array.isArray(ancien) ? ancien : []).forEach(function (c) { if (c && c.id) avant[c.id] = c; });
    (nouveau || []).forEach(function (c) {
      if (!normaliser(c)) throw new Error('Donnée incomplète : nom, type et identifiant requis.');
      if (vus[c.id]) throw new Error('Identifiant en double : ' + c.id + '.');
      vus[c.id] = true;
      var a = avant[c.id];
      if (a && a.type !== c.type) throw new Error('« ' + c.libelle + ' » : le type d’une donnée enregistrée ne change pas.');
      if (a && normaliser(a) && normaliser(a).protection !== normaliser(c).protection) throw new Error('« ' + c.libelle + ' » : la protection d’une donnée enregistrée ne change pas.');
      if ((c.type === 'liste' || c.type === 'choixMultiple') && !(c.choix || []).length) throw new Error('« ' + c.libelle + ' » : indiquez les choix proposés.');
      if (c.type === 'formule' && !texte(c.formule)) throw new Error('« ' + c.libelle + ' » : indiquez la formule.');
    });
    return true;
  }

  return {
    TYPES: TYPES, TYPES_SIMPLES: TYPES_SIMPLES, CUMULATIFS: CUMULATIFS, ENTITES: ENTITES, AVERTISSEMENT_AGENT: AVERTISSEMENT_AGENT, IMPORTANCES: IMPORTANCES, PROTECTIONS: PROTECTIONS,
    normaliser: normaliser, definitions: definitions, definition: definition, peutVoir: peutVoir, peutSaisir: peutSaisir,
    cleDe: cleDe, clesPropres: clesPropres, aDroitCle: aDroitCle, journalDe: journalDe, typeSaisie: typeSaisie,
    valeur: valeur, operation: operation, appliquerOperation: appliquerOperation, notes: notes, importanceMax: importanceMax, checklist: checklist,
    lib: lib, brute: brute, telephone: telephone, libelleClinique: libelleClinique, identifiant: identifiant,
    reduireValeurs: reduireValeurs, controlerSaisie: controlerSaisie, controlerCadre: controlerCadre, controlerListe: controlerListe
  };
});
