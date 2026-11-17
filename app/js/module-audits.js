// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Audits internes — contrat déclaré au registre des modules (lot P, demande du porteur du 17 novembre 2026).
 *
 * Un audit = une grille remplie une fois (décision du porteur) : chaque critère est « conforme », « non conforme » ou
 * « non concerné », avec un court commentaire ; taux de conformité = conformes / (conformes + non conformes), par
 * audit, par période (mois, trimestre, année) et par critère. Grilles réglées par l'établissement (niveau « * », pour
 * tous les services) et par le cadre pour ses services ; modèles proposés (décision du porteur) : circuit du
 * médicament, tenue du dossier du patient, isolement et contention, à adapter par l'établissement.
 * Auditeurs (décision du porteur) : le cadre du service et les agents qu'il désigne (`audits[service].auditeurs`).
 * Les écarts peuvent devenir des tâches de « Mes tâches » (plans d'action plus tard, décision du porteur).
 *
 * Tenue du dossier : l'audit porte sur le dossier d'un patient (référence du séjour, jamais son nom) ; fonction soumise
 * à avis (« audit-dossier », onglet Validations), livrée désactivée. Isolement et contention : référence de la mesure
 * au registre. Aucune autre donnée de patient.
 * Journal `modules\audits\`, clé propre ; module **désactivé par défaut**, activé service par service.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'), require('./validations.js'));
  else (root.SIC = root.SIC || {}).audits = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.validations);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, V) {
  'use strict';

  var TYPES = ['AUDIT', 'AUDIT_ANNULE'];
  var REPONSES = { oui: 'Conforme', non: 'Non conforme', na: 'Non concerné' };
  /**
   * Modes d'un critère (0.88.0, audits « flash » sur plusieurs dossiers, importés d'un classeur de synthèse) :
   * réponse (conforme / non conforme / non concerné), proportion (X dossiers conformes sur N vérifiés, ou pourcentage
   * importé) et indicateur chiffré (nombre relevé, hors du taux de conformité : ex. utilisations d'un espace).
   */
  var MODES = { reponse: 'Conforme / non conforme / non concerné', ratio: 'Proportion : X conformes sur N vérifiés (ou pourcentage)', indicateur: 'Indicateur chiffré (hors du taux de conformité)' };
  var MAX_NOMBRE = 100000;
  var MAX_CRITERES = 80, MAX_COMMENTAIRE = 300, MAX_TEXTE = 1000;
  var FONCTION_DOSSIER = 'audit-dossier';

  // Modèles proposés (décision du porteur du 17 novembre 2026), à adapter à la procédure de l'établissement
  function c(rubrique, libelle) { return { rubrique: rubrique, libelle: libelle }; }
  var MODELES = {
    medicament: { libelle: 'Circuit du médicament dans l’unité', theme: 'Médicament', reference: '', dossier: false, criteres: [
      c('Stockage', 'Armoire ou chariot à pharmacie fermé à clé, clé détenue par un infirmier'),
      c('Stockage', 'Médicaments rangés par dénomination commune, dans leur conditionnement d’origine'),
      c('Stockage', 'Aucun médicament périmé'),
      c('Stockage', 'Flacons multidoses datés à l’ouverture'),
      c('Stockage', 'Réfrigérateur : relevé de température à jour'),
      c('Stupéfiants', 'Coffre fermé, registre des stupéfiants à jour et concordant avec le stock'),
      c('Préparation', 'Piluliers identifiés (nom, prénom, date de naissance), préparés selon la prescription en cours'),
      c('Préparation', 'Aucun médicament déconditionné sans identification (nom, dosage, lot, péremption)'),
      c('Administration', 'Prescription consultée au moment de l’administration'),
      c('Administration', 'Identité du patient vérifiée avant l’administration'),
      c('Administration', 'Administration tracée en temps réel dans le dossier'),
      c('Administration', 'Prise observée ou refus tracé'),
      c('Retours', 'Médicaments non utilisés ou périmés retournés à la pharmacie selon la procédure')
    ] },
    dossier: { libelle: 'Tenue du dossier du patient', theme: 'Dossier', reference: 'Référence du séjour ou du dossier (jamais le nom)', dossier: true, criteres: [
      c('Identification', 'Identité complète et vérifiée (identitovigilance)'),
      c('Identification', 'Personne de confiance proposée et tracée'),
      c('Identification', 'Personne à prévenir renseignée'),
      c('Admission', 'Mode d’hospitalisation et pièces légales présents (certificats, décisions)'),
      c('Admission', 'Information du patient sur ses droits tracée'),
      c('Admission', 'Recueil de données d’entrée complet'),
      c('Projet de soins', 'Projet de soins formalisé et réévalué'),
      c('Projet de soins', 'Observation médicale d’entrée et suivi médical tracés'),
      c('Soins', 'Transmissions ciblées à chaque poste'),
      c('Soins', 'Évaluation de la douleur tracée'),
      c('Soins', 'Examen somatique d’entrée tracé'),
      c('Sortie', 'Préparation de la sortie tracée (lettre de liaison, rendez-vous)')
    ] },
    isocont: { libelle: 'Isolement et contention : respect des règles', theme: 'Isolement et contention', reference: 'Numéro de la mesure au registre', dossier: false, criteres: [
      c('Décision', 'Décision prise par un psychiatre, motivée, avec date et heure'),
      c('Décision', 'Mesure de dernier recours, alternatives tentées et tracées'),
      c('Renouvellements', 'Renouvellements dans les délais (isolement : 12 h ; contention : 6 h)'),
      c('Renouvellements', 'Deux évaluations médicales par 24 heures'),
      c('Juge', 'Information du juge et des proches dès 48 h d’isolement ou 24 h de contention'),
      c('Juge', 'Saisine du juge avant 72 h d’isolement ou 48 h de contention, puis à chaque échéance'),
      c('Information', 'Patient informé des motifs de la mesure et des voies de recours'),
      c('Surveillance', 'Surveillance somatique et psychique tracée selon la prescription'),
      c('Surveillance', 'Hydratation, alimentation, hygiène et élimination tracées'),
      c('Lieu', 'Chambre d’isolement conforme (contrôle de la CSI tracé)'),
      c('Registre', 'Mesure inscrite au registre (identité, médecin, dates et heures, durée)'),
      c('Fin', 'Levée de la mesure tracée'),
      c('Fin', 'Entretien proposé au patient après la mesure')
    ] }
  };

  // ------------------------------------------------------------ Réglages : grilles et auditeurs
  function texte(v, n) { return String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, n || 200); }
  function critere(x) { return { libelle: texte(x && x.libelle, 160), rubrique: texte(x && x.rubrique, 60), aide: texte(x && x.aide, 200), mode: MODES[x && x.mode] ? x.mode : 'reponse' }; }
  function nombre(v) { if (v === null || v === undefined || v === '') return null; var n = +v; return isFinite(n) && n >= 0 && n <= MAX_NOMBRE ? Math.round(n * 100) / 100 : null; }
  /** Élément d'un audit, validé : `reponse` (oui, non, na), ou `conformes` / `evalues` / `pourcentage` (proportion), ou `valeur` (indicateur). */
  function item(x) {
    x = x || {};
    var it = { libelle: texte(x.libelle, 160), rubrique: texte(x.rubrique, 60), mode: MODES[x.mode] ? x.mode : 'reponse', reponse: REPONSES[x.reponse] ? x.reponse : 'na', commentaire: texte(x.commentaire, MAX_COMMENTAIRE) };
    if (it.mode === 'ratio') {
      it.conformes = nombre(x.conformes); it.evalues = nombre(x.evalues);
      var pc = nombre(x.pourcentage); it.pourcentage = pc === null ? null : Math.min(100, pc);
      if (it.evalues === null || it.conformes === null || it.conformes > it.evalues) { it.conformes = null; it.evalues = null; }
      var t = tauxItem(it); it.reponse = t === null ? 'na' : t >= 100 ? 'oui' : 'non';
    }
    if (it.mode === 'indicateur') { it.valeur = nombre(x.valeur); it.reponse = 'na'; }
    return it;
  }
  /** Taux d'un élément (0 à 100, null si non évaluable) : conforme 100, non conforme 0, proportion X / N ou pourcentage. */
  function tauxItem(i) {
    if (!i) return null;
    if (i.mode === 'indicateur') return null;
    if (i.mode === 'ratio') { if (i.evalues > 0) return 100 * i.conformes / i.evalues; return i.pourcentage === null || i.pourcentage === undefined ? null : i.pourcentage; }
    return i.reponse === 'oui' ? 100 : i.reponse === 'non' ? 0 : null;
  }
  /** Grille réglée, validée à la lecture (`id` de la forme « ga-… »). */
  function grille(x) {
    if (!x || typeof x !== 'object' || !/^ga-[a-z0-9-]{1,24}$/.test(String(x.id || ''))) return null;
    var cr = (Array.isArray(x.criteres) ? x.criteres : []).map(critere).filter(function (k) { return k.libelle; }).slice(0, MAX_CRITERES);
    return { id: x.id, libelle: texte(x.libelle, 80) || 'Audit', theme: texte(x.theme, 60), modele: MODELES[x.modele] ? x.modele : 'libre', actif: x.actif !== false,
      reference: texte(x.reference, 60), dossier: !!x.dossier, criteres: cr.length ? cr : [{ libelle: 'Critère à vérifier', rubrique: '', aide: '' }] };
  }
  function niveau(config, cle) { return (config && config.audits && config.audits[cle]) || {}; }
  /** Grilles d'un service : celles de l'établissement puis celles du service (inactives comprises). `etab` : niveau « * » seul. */
  function grilles(config, service) {
    var l = [], vus = {};
    [['*', 'etablissement']].concat(service && service !== '*' ? [[service, 'service']] : []).forEach(function (n) {
      (Array.isArray(niveau(config, n[0]).grilles) ? niveau(config, n[0]).grilles : []).map(grille).filter(Boolean).forEach(function (g) {
        if (vus[g.id] || l.length >= 60) return;
        vus[g.id] = 1; g.niveau = n[1]; l.push(g);
      });
    });
    return l;
  }
  /** Audit du dossier autorisé (fonction soumise à avis activée) ? */
  function dossierAutorise(config) { return !!V && V.actif(config || {}, FONCTION_DOSSIER); }
  /** Grilles utilisables d'un service : actives, et celle du dossier seulement quand la fonction est activée. */
  function grillesActives(config, service) { var ok = dossierAutorise(config); return grilles(config, service).filter(function (g) { return g.actif && (!g.dossier || ok); }); }
  function grilleDe(config, service, id) { return grilles(config, service).filter(function (g) { return g.id === id; })[0] || null; }
  /** Nouvelle grille depuis un modèle (ou vide : « libre »). */
  function depuisModele(code, id) {
    var m = MODELES[code];
    return grille(Object.assign({ id: id, modele: m ? code : 'libre', actif: true }, m ? JSON.parse(JSON.stringify(m)) : { libelle: 'Nouvel audit', criteres: [{ libelle: 'Critère à vérifier' }] }));
  }
  /** Agents désignés comme auditeurs d'un service par le cadre (identifiants de comptes). */
  function auditeurs(config, service) { var a = niveau(config, service).auditeurs; return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x; }).slice(0, 100) : []; }
  var ROLES_AUDITEURS = ['ADMIN', 'CADRE', 'CADRE_SUP'];
  /** Le compte peut-il auditer ce service ? Cadre, cadre supérieur, administrateur, ou agent désigné par le cadre. */
  function peutAuditer(config, service, compte) {
    if (!compte) return false;
    if ((compte.roles || []).some(function (r) { return ROLES_AUDITEURS.indexOf(r) >= 0; })) return true;
    return auditeurs(config, service).indexOf(compte.id) >= 0;
  }
  /** Le cadre règle les grilles et les auditeurs de ses services ; le niveau « * » reste à l'administrateur. */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  // ------------------------------------------------------------ Saisies
  function appliquer(st, e) {
    var d = e.data || {};
    if (e.type === 'AUDIT') {
      st.audits[d.id] = { id: d.id, service: d.service, grille: d.grille, libelle: texte(d.libelle, 80), theme: texte(d.theme, 60), date: d.date, reference: texte(d.reference, 60),
        items: (Array.isArray(d.items) ? d.items : []).slice(0, MAX_CRITERES).map(item),
        commentaire: texte(d.commentaire, MAX_TEXTE), par: e.auteur, nom: texte(d.nom, 80), le: e.at, annule: null,
        origine: d.origine === 'import' ? 'import' : 'saisie', fichier: d.origine === 'import' ? texte(d.fichier, 120) : '' };
      return;
    }
    if (e.type === 'AUDIT_ANNULE') { var a = st.audits[d.audit]; if (a && !a.annule) a.annule = { par: e.auteur, nom: texte(d.nom, 80), le: e.at, motif: texte(d.motif, 300) }; }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'audits', etat: function () { return { audits: {} }; }, appliquer: appliquer }); }

  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { audits: {} }, compte = ctx && ctx.compte, config = ctx && ctx.config;
    if (type === 'AUDIT') {
      if (!d.id || st.audits[d.id]) throw new Error('Audit déjà enregistré : il ne se modifie pas (l’annuler puis le refaire).');
      if (!d.service || !d.grille) throw new Error('Indiquez le service et la grille.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))) throw new Error('Indiquez la date de l’audit.');
      var auj = M.dateLocaleISO((ctx && ctx.maintenant) || Date.now());
      if (d.date > auj) throw new Error('La date de l’audit ne peut pas être dans l’avenir.');
      if (config) {
        var g = grilleDe(config, d.service, d.grille);
        if (!g) throw new Error('Grille d’audit inconnue pour ce service.');
        if (g.dossier && !dossierAutorise(config)) throw new Error('L’audit de la tenue du dossier est désactivé par l’établissement (onglet « Validations »).');
        if (g.reference && !texte(d.reference, 60)) throw new Error('Indiquez : ' + g.reference + '.');
        if (compte && !peutAuditer(config, d.service, compte)) throw new Error('Seuls le cadre et les agents qu’il a désignés comme auditeurs réalisent les audits de ce service.');
      }
      if (String(d.reference || '').length > 60) throw new Error('Référence trop longue (60 caractères au plus).');
      if (!Array.isArray(d.items) || !d.items.length) throw new Error('La grille est vide.');
      if (d.items.length > MAX_CRITERES) throw new Error('Grille trop longue.');
      d.items.forEach(function (x) {
        if (!x) throw new Error('Critère vide.');
        var m = MODES[x.mode] ? x.mode : 'reponse';
        if (m === 'reponse' && !REPONSES[x.reponse]) throw new Error('Répondez à chaque critère : conforme, non conforme ou non concerné.');
        if (m === 'ratio') {
          var vide = function (v) { return v === null || v === undefined || v === ''; };
          if (!vide(x.evalues) || !vide(x.conformes)) {
            if (nombre(x.evalues) === null || nombre(x.conformes) === null || Math.round(x.evalues) !== +x.evalues || Math.round(x.conformes) !== +x.conformes) throw new Error('« ' + texte(x.libelle, 60) + ' » : nombres entiers attendus (conformes sur vérifiés).');
            if (+x.conformes > +x.evalues) throw new Error('« ' + texte(x.libelle, 60) + ' » : plus de dossiers conformes que de dossiers vérifiés.');
          }
          if (!vide(x.pourcentage) && (nombre(x.pourcentage) === null || +x.pourcentage > 100)) throw new Error('« ' + texte(x.libelle, 60) + ' » : pourcentage entre 0 et 100 attendu.');
        }
        if (m === 'indicateur' && !(x.valeur === null || x.valeur === undefined || x.valeur === '') && nombre(x.valeur) === null) throw new Error('« ' + texte(x.libelle, 60) + ' » : nombre attendu.');
      });
      if (d.items.every(function (x) { return tauxItem(item(x)) === null; }) && !d.items.some(function (x) { return x.mode === 'indicateur' && nombre(x.valeur) !== null; })) throw new Error('Aucun critère évalué : rien à auditer.');
      if (d.origine === 'import' && !texte(d.fichier, 120)) throw new Error('Audit importé : nom du fichier attendu.');
      if (d.items.some(function (x) { return String(x.commentaire || '').length > MAX_COMMENTAIRE; })) throw new Error('Commentaire d’un critère trop long (300 caractères au plus).');
      if (String(d.commentaire || '').length > MAX_TEXTE) throw new Error('Commentaire trop long (1 000 caractères au plus).');
      return;
    }
    if (type === 'AUDIT_ANNULE') {
      var a = st.audits[d.audit];
      if (!a) throw new Error('Audit introuvable.');
      if (a.annule) throw new Error('Cet audit est déjà annulé.');
      if (!texte(d.motif, 300)) throw new Error('Indiquez le motif de l’annulation.');
      if (ctx && ctx.compte && ctx.compte.id !== a.par && ctx.peut && !ctx.peut('AUDIT_ANNULE_TOUS')) throw new Error('Seuls l’auteur de l’audit et l’encadrement l’annulent.');
    }
  }

  // ------------------------------------------------------------ Lecture et calculs
  function valides(st) { return Object.keys((st && st.audits) || {}).map(function (k) { return st.audits[k]; }).filter(function (a) { return !a.annule; }); }
  /**
   * Comptes d'un audit : { oui, non, na, taux }. Un élément est conforme quand son taux vaut 100, non conforme en dessous,
   * non concerné quand il n'est pas évaluable (indicateurs exclus). Taux de l'audit = moyenne des taux de ses éléments
   * évaluables (0 à 100, arrondi à l'unité ; null si rien d'évaluable) : pour des réponses conforme / non conforme, c'est
   * conformes / (conformes + non conformes).
   */
  function taux(items) {
    var r = { oui: 0, non: 0, na: 0 }, somme = 0;
    (items || []).forEach(function (x) {
      var i = x && x.mode ? x : item(x);
      if (i.mode === 'indicateur') return;
      var t = tauxItem(i);
      if (t === null) r.na++; else { somme += t; if (t >= 100) r.oui++; else r.non++; }
    });
    r.taux = r.oui + r.non ? Math.round(somme / (r.oui + r.non)) : null;
    return r;
  }
  /** Écarts d'un audit : éléments évaluables sous 100 %. */
  function ecarts(a) { return (a.items || []).filter(function (x) { var t = tauxItem(x); return t !== null && t < 100; }); }
  function indicateurs(a) { return (a.items || []).filter(function (x) { return x.mode === 'indicateur' && x.valeur !== null && x.valeur !== undefined; }); }
  /** Audits (annulés compris), du plus récent au plus ancien ; `f` : { services, grille, du, au, annules }. */
  function liste(st, f) {
    f = f || {};
    return Object.keys((st && st.audits) || {}).map(function (k) { return st.audits[k]; }).filter(function (a) {
      if (!f.annules && a.annule) return false;
      if (f.services && f.services.indexOf(a.service) < 0) return false;
      if (f.grille && a.grille !== f.grille) return false;
      if (f.du && a.date < f.du) return false;
      if (f.au && a.date > f.au) return false;
      return true;
    }).sort(function (p, q) { return p.date < q.date ? 1 : p.date > q.date ? -1 : String(q.le).localeCompare(String(p.le)); });
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /** Période d'une date : 'mois' (2026-11), 'trimestre' (2026-T4), 'annee' (2026). */
  function periode(date, par) {
    var a = date.slice(0, 4), m = +date.slice(5, 7);
    if (par === 'annee') return { code: a, libelle: a };
    if (par === 'trimestre') { var t = Math.ceil(m / 3); return { code: a + '-T' + t, libelle: (t === 1 ? '1er' : t + 'e') + ' trimestre ' + a }; }
    return { code: date.slice(0, 7), libelle: MOIS[m - 1] + ' ' + a };
  }
  function arrondi(v) { return v === null ? null : Math.round(v); }
  /** Agrégat d'éléments d'un même critère : somme des proportions quand toutes ont leurs nombres, sinon moyenne des taux. */
  function agreger(liste) {
    var r = { oui: 0, non: 0, na: 0, conformes: 0, evalues: 0, somme: 0, n: 0, comptes: true };
    liste.forEach(function (i) {
      var t = tauxItem(i);
      if (t === null) { r.na++; return; }
      if (t >= 100) r.oui++; else r.non++;
      r.somme += t; r.n++;
      if (i.mode === 'ratio' && i.evalues > 0) { r.conformes += i.conformes; r.evalues += i.evalues; } else if (i.mode === 'ratio') r.comptes = false;
    });
    var t = r.n ? (r.comptes && r.evalues ? 100 * r.conformes / r.evalues : r.somme / r.n) : null;
    return { oui: r.oui, non: r.non, na: r.na, taux: arrondi(t), conformes: r.comptes && r.evalues ? r.conformes : null, evalues: r.comptes && r.evalues ? r.evalues : null };
  }
  /**
   * Résultats d'une grille (ou de toutes) sur une période. Taux global : moyenne des taux des éléments évaluables
   * (conformes / (conformes + non conformes) pour des réponses) ; par période ; par critère (du moins conforme au plus
   * conforme), avec son taux à chaque période (`parPeriode`) ; indicateurs chiffrés (somme par période).
   * `f` : { services, grille, du, au, par, annee } — `annee` : les douze mois de l'année, mois sans audit compris.
   */
  function resultats(st, f) {
    f = f || {};
    var par = f.annee ? 'mois' : (f.par || 'mois'), ff = Object.assign({}, f);
    if (f.annee) { ff.du = f.annee + '-01-01'; ff.au = f.annee + '-12-31'; }
    var ls = liste(st, ff), parP = {}, parC = {}, tous = [];
    if (f.annee) for (var m = 1; m <= 12; m++) { var code = f.annee + '-' + String(m).padStart(2, '0'); parP[code] = { code: code, libelle: MOIS[m - 1] + ' ' + f.annee, court: MOIS_COURTS[m - 1], audits: 0, items: [] }; }
    ls.forEach(function (a) {
      var p = periode(a.date, par), x = parP[p.code] = parP[p.code] || { code: p.code, libelle: p.libelle, court: par === 'mois' ? MOIS_COURTS[+a.date.slice(5, 7) - 1] + ' ' + a.date.slice(2, 4) : p.libelle, audits: 0, items: [] };
      x.audits++;
      a.items.forEach(function (i) {
        var k = (i.rubrique || '') + '|' + i.libelle, y = parC[k] = parC[k] || { libelle: i.libelle, rubrique: i.rubrique, mode: i.mode || 'reponse', items: [], parPeriode: {} };
        if (i.mode === 'indicateur') { if (i.valeur !== null && i.valeur !== undefined) y.parPeriode[p.code] = (y.parPeriode[p.code] || 0) + i.valeur; return; }
        y.items.push(i); (y.pp = y.pp || {})[p.code] = (y.pp[p.code] || []).concat([i]);
        x.items.push(i); tous.push(i);
      });
    });
    function moyenne(l) { var t = l.map(tauxItem).filter(function (v) { return v !== null; }); return t.length ? Math.round(t.reduce(function (a, b) { return a + b; }, 0) / t.length) : null; }
    function compte(l) { var r = { oui: 0, non: 0, na: 0 }; l.forEach(function (i) { var t = tauxItem(i); if (t === null) r.na++; else if (t >= 100) r.oui++; else r.non++; }); return r; }
    var g = compte(tous); g.taux = moyenne(tous);
    var criteres = Object.keys(parC).map(function (k) {
      var y = parC[k];
      if (y.mode === 'indicateur') return { libelle: y.libelle, rubrique: y.rubrique, mode: 'indicateur', parPeriode: y.parPeriode, taux: null, oui: 0, non: 0, na: 0 };
      var r = agreger(y.items), pp = {};
      Object.keys(y.pp || {}).forEach(function (c) { pp[c] = agreger(y.pp[c]).taux; });
      return Object.assign({ libelle: y.libelle, rubrique: y.rubrique, mode: y.mode, parPeriode: pp }, r);
    });
    return {
      audits: ls.length, global: g,
      periodes: Object.keys(parP).sort().map(function (k) { var x = parP[k], c = compte(x.items); return { code: x.code, libelle: x.libelle, court: x.court, audits: x.audits, oui: c.oui, non: c.non, na: c.na, taux: moyenne(x.items) }; }),
      criteres: criteres.filter(function (c) { return c.mode !== 'indicateur'; }).sort(function (p, q) { return (p.taux === null ? 101 : p.taux) - (q.taux === null ? 101 : q.taux) || p.libelle.localeCompare(q.libelle); }),
      indicateurs: criteres.filter(function (c) { return c.mode === 'indicateur'; })
    };
  }
  /** Lignes de l'export (CSV) : une ligne par critère de chaque audit. */
  function lignesExport(ls, libService) {
    var t = [['Date', 'Service', 'Audit', 'Référence', 'Auditeur', 'Taux de conformité (%)', 'Rubrique', 'Critère', 'Réponse', 'Commentaire du critère', 'Commentaire de l’audit', 'Annulé']];
    ls.forEach(function (a) {
      var tx = taux(a.items).taux;
      a.items.forEach(function (i) {
        t.push([a.date, libService ? libService(a.service) : a.service, a.libelle, a.reference, a.nom, tx === null ? '' : tx, i.rubrique, i.libelle, libelleReponse(i), i.commentaire, a.commentaire, a.annule ? 'oui (' + a.annule.motif + ')' : '']);
      });
    });
    return t;
  }

  /** Réponse d'un élément en clair : « Conforme », « 3 sur 5 (60 %) », « 40 % », « 9 » (indicateur). */
  function libelleReponse(i) {
    if (i.mode === 'indicateur') return i.valeur === null || i.valeur === undefined ? '—' : String(i.valeur).replace('.', ',');
    if (i.mode === 'ratio') { var t = tauxItem(i); if (t === null) return 'Non évalué'; return (i.evalues > 0 ? i.conformes + ' sur ' + i.evalues + ' (' + Math.round(t) + ' %)' : Math.round(t) + ' %'); }
    return REPONSES[i.reponse];
  }

  // ------------------------------------------------------------ Import d'un tableau de synthèse (0.88.0)
  /*
   * Classeur tenu par le service : une feuille de synthèse, une ligne par mois (« Janvier », « Février % »,
   * « Octobre n-1 % »…), une colonne par critère (pourcentage en fraction ou en %, « OK » / « KO », nombre), une colonne
   * de commentaires éventuelle. Le fichier est lu dans le navigateur, jamais copié sur le partage ; Tessera n'en garde
   * que les valeurs saisies comme audits (un par mois). Exemple fictif : tests/audits-import.test.js.
   */
  var NOMS_MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  function sansAccent(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  /** Mois d'un libellé de ligne : { mois (1 à 12), decalage (-1 pour « n-1 ») } ou null. */
  function moisDe(v) {
    if (typeof v !== 'string') return null;
    var t = sansAccent(v).replace(/[%:]/g, ' ').replace(/\s+/g, ' ').trim(), m = /^([a-z]+)\.?(?:\s+(n\s*-\s*1|\d{4}))?\s*$/.exec(t);
    if (!m) return null;
    var k = NOMS_MOIS.indexOf(m[1]);
    if (k < 0) k = NOMS_MOIS.map(function (x) { return x.slice(0, 4); }).indexOf(m[1].slice(0, 4)) >= 0 && m[1].length >= 3 ? NOMS_MOIS.map(function (x) { return x.slice(0, m[1].length); }).indexOf(m[1]) : -1;
    if (k < 0) return null;
    return { mois: k + 1, decalage: m[2] && /n/.test(m[2]) ? -1 : 0, annee: m[2] && /^\d{4}$/.test(m[2]) ? +m[2] : null };
  }
  function vide(v) { return v === null || v === undefined || (typeof v === 'string' && (!v.trim() || /^#/.test(v.trim()))); }
  function estOkKo(v) { return typeof v === 'string' && /^(ok|ko|oui|non|c|nc|conforme|non conforme)$/i.test(v.trim()); }
  /** Type proposé pour une colonne : 'ratio' (fractions ou pourcentages), 'reponse' (OK / KO), 'indicateur', 'commentaire', 'ignorer'. */
  function typeColonne(valeurs, libelle) {
    var vs = valeurs.filter(function (v) { return !vide(v); });
    if (!vs.length) return libelle ? 'ratio' : 'ignorer';
    if (vs.every(estOkKo)) return 'reponse';
    var prop = /^\s*\d+\s*(?:\/|sur)\s*\d+\s*$|^\s*\d+(?:[.,]\d+)?\s*%\s*$/i;
    if (libelle && vs.every(function (v) { return (typeof v === 'number' && v >= 0 && v <= 1) || (typeof v === 'string' && prop.test(v)); })) return 'ratio';
    var nb = vs.filter(function (v) { return typeof v === 'number'; });
    if (nb.length === vs.length) {
      if (!libelle) return 'ignorer';
      if (nb.every(function (v) { return v >= 0 && v <= 1; })) return 'ratio';
      if (/%|pourcent/i.test(libelle) && nb.every(function (v) { return v >= 0 && v <= 100; })) return 'ratio';
      return 'indicateur';
    }
    return 'commentaire';
  }
  /**
   * Lit une feuille de synthèse (`lignes` : tableau de lignes de valeurs, tel que SIC.xlsx le rend). Repère le bloc de
   * lignes de mois le plus rempli et sa ligne d'en-tête (libellés des critères). Rend
   * { ligneEntete, colonnes: [{ col, libelle, type }], mois: [{ ligne, mois, decalage, annee, valeurs: { col: v } }] }.
   */
  function lireSynthese(lignes) {
    var blocs = [], cour = null;
    (lignes || []).forEach(function (l, r) {
      var m = l && moisDe(l[0]);
      if (m) { if (!cour) { cour = { debut: r, lignes: [] }; blocs.push(cour); } cour.lignes.push(Object.assign({ ligne: r }, m)); }
      else cour = null;
    });
    function rempli(b) { return b.lignes.reduce(function (n, x) { return n + (lignes[x.ligne] || []).slice(1).filter(function (v) { return !vide(v); }).length; }, 0); }
    var bloc = blocs.filter(function (b) { return b.lignes.length >= 2; }).sort(function (p, q) { return rempli(q) - rempli(p); })[0];
    if (!bloc || !rempli(bloc)) throw new Error('Aucun tableau mensuel reconnu : la première colonne doit porter les mois (Janvier, Février…), une ligne par mois.');
    var entete = -1;
    for (var r = bloc.debut - 1; r >= Math.max(0, bloc.debut - 4); r--) {
      if ((lignes[r] || []).slice(1).filter(function (v) { return typeof v === 'string' && v.trim(); }).length >= 2) { entete = r; break; }
    }
    if (entete < 0) throw new Error('Ligne des critères introuvable au-dessus des mois.');
    var largeur = 0;
    bloc.lignes.concat([{ ligne: entete }]).forEach(function (x) { largeur = Math.max(largeur, (lignes[x.ligne] || []).length); });
    var colonnes = [];
    for (var c = 1; c < Math.min(largeur, 120); c++) {
      var lib = texte(lignes[entete][c], 160).replace(/\s*\n\s*/g, ' ');
      var vals = bloc.lignes.map(function (x) { return (lignes[x.ligne] || [])[c]; });
      if (!lib && vals.every(vide)) continue;
      if (!lib) { var dessus = entete > 0 ? texte((lignes[entete - 1] || [])[c], 60) : ''; lib = dessus ? '(' + dessus + ')' : ''; }
      colonnes.push({ col: c, libelle: lib, type: typeColonne(vals, lib && lib.charAt(0) !== '(' ? lib : '') });
    }
    return { ligneEntete: entete, colonnes: colonnes, mois: bloc.lignes.map(function (x) {
      var v = {}; colonnes.forEach(function (k) { var val = (lignes[x.ligne] || [])[k.col]; if (!vide(val)) v[k.col] = typeof val === 'string' ? val.trim() : val; });
      return { ligne: x.ligne, mois: x.mois, decalage: x.decalage, annee: x.annee, valeurs: v };
    }) };
  }
  /** Valeur importée → élément d'audit selon le type de la colonne (null si vide ou illisible). */
  function valeurImportee(v, type) {
    if (vide(v)) return null;
    if (type === 'reponse') { if (estOkKo(v)) return { reponse: /^(ok|oui|c|conforme)$/i.test(v.trim()) ? 'oui' : 'non' }; if (v === 1 || v === 0) return { reponse: v ? 'oui' : 'non' }; return null; }
    if (type === 'ratio') {
      if (typeof v === 'string') { var m = /^(\d+)\s*(?:\/|sur)\s*(\d+)$/i.exec(v.trim()); if (m && +m[1] <= +m[2]) return { conformes: +m[1], evalues: +m[2] }; var p = /^(\d+(?:[.,]\d+)?)\s*%$/.exec(v.trim()); if (p) v = +p[1].replace(',', '.') / 100; else return null; }
      if (typeof v !== 'number' || !(v >= 0)) return null;
      var pc = v <= 1 ? v * 100 : v;
      return pc <= 100 ? { pourcentage: Math.round(pc * 10) / 10 } : null;
    }
    if (type === 'indicateur') return typeof v === 'number' && v >= 0 ? { valeur: Math.round(v * 100) / 100 } : null;
    return null;
  }
  /**
   * Prépare les audits à enregistrer d'après une synthèse lue et les choix de l'agent : `o` { annee, service, grille
   * (grille cible), correspondances ({ col: index du critère de la grille, ou -1 }), types ({ col: type }), fichier, jour }.
   * Un audit par mois ayant au moins une valeur ; les mois déjà importés pour cette grille et ce service (`st`) sont
   * signalés et écartés. Rend { audits: [données AUDIT], ignores: [{ mois, raison }] }.
   */
  function preparerImport(st, synthese, o) {
    var g = o.grille, res = { audits: [], ignores: [] }, auj = M.dateLocaleISO(o.maintenant || Date.now());
    var deja = {};
    liste(st, { services: [o.service], grille: g.id }).forEach(function (a) { if (a.origine === 'import') deja[a.date.slice(0, 7)] = a; });
    var commentaires = synthese.colonnes.filter(function (k) { return (o.types[k.col] || k.type) === 'commentaire'; });
    synthese.mois.forEach(function (x) {
      var an = x.annee || (o.annee + x.decalage), date = an + '-' + String(x.mois).padStart(2, '0') + '-' + String(Math.min(28, Math.max(1, o.jour || 1))).padStart(2, '0'), lib = MOIS[x.mois - 1] + ' ' + an;
      if (date > auj) { if (Object.keys(x.valeurs).length) res.ignores.push({ mois: lib, raison: 'mois à venir' }); return; }
      var items = g.criteres.map(function (k) { return { libelle: k.libelle, rubrique: k.rubrique, mode: k.mode, reponse: 'na', commentaire: '' }; }), n = 0;
      synthese.colonnes.forEach(function (k) {
        var idx = o.correspondances[k.col], type = o.types[k.col] || k.type;
        if (!(idx >= 0) || !items[idx] || type === 'commentaire' || type === 'ignorer') return;
        var crit = g.criteres[idx], val = valeurImportee(x.valeurs[k.col], crit.mode === 'reponse' ? 'reponse' : crit.mode === 'indicateur' ? 'indicateur' : 'ratio');
        if (!val) return;
        Object.assign(items[idx], val); n++;
      });
      if (!n) return;
      if (deja[date.slice(0, 7)]) { res.ignores.push({ mois: lib, raison: 'déjà importé le ' + String(deja[date.slice(0, 7)].le).slice(0, 10).split('-').reverse().join('/') + ' (annuler cet audit pour le réimporter)' }); return; }
      var com = commentaires.map(function (k) { return x.valeurs[k.col]; }).filter(function (v) { return !vide(v); }).map(String).join(' ; ').slice(0, MAX_TEXTE);
      res.audits.push({ service: o.service, grille: g.id, libelle: g.libelle, theme: g.theme, date: date, reference: '', items: items, commentaire: com, origine: 'import', fichier: texte(o.fichier, 120) || 'classeur', mois: lib });
    });
    return res;
  }
  /** Grille créée d'après les colonnes d'une synthèse (critères dans l'ordre des colonnes ; commentaires et colonnes ignorées exclus). */
  function grilleDepuisSynthese(synthese, types, id, libelle) {
    var cr = synthese.colonnes.filter(function (k) { var t = types[k.col] || k.type; return t === 'ratio' || t === 'reponse' || t === 'indicateur'; })
      .map(function (k) { var t = types[k.col] || k.type; return { libelle: k.libelle.replace(/^\((.*)\)$/, '$1').replace(/\s*\(?\s*1\s*=\s*ok\s*;?\s*0\s*=\s*ko\s*\)?\s*$/i, '').trim() || 'Critère', rubrique: '', mode: t }; });
    return grille({ id: id, modele: 'libre', actif: true, libelle: libelle || 'Audit mensuel', theme: 'Audit importé', criteres: cr });
  }
  /** Correspondance proposée colonne → critère de la grille (libellés comparés sans accents ni ponctuation). */
  function correspondance(synthese, g) {
    function cle(t) { return sansAccent(t).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
    var r = {}, pris = {};
    synthese.colonnes.forEach(function (k) {
      var c = cle(k.libelle), idx = -1;
      g.criteres.forEach(function (cr, i) { if (idx < 0 && !pris[i] && c && (cle(cr.libelle) === c || cle(cr.libelle).indexOf(c) === 0 || c.indexOf(cle(cr.libelle)) === 0)) idx = i; });
      if (idx >= 0) pris[idx] = 1;
      r[k.col] = idx;
    });
    return r;
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'audits.faire', libelle: 'Réaliser les audits (cadre et agents désignés auditeurs par le cadre), annuler les siens', types: ['AUDIT', 'AUDIT_ANNULE'] },
    { code: 'audits.encadrer', libelle: 'Annuler tout audit du service, exporter les résultats', types: ['AUDIT_ANNULE_TOUS'] }
  ];
  var FAIRE = ['AUDIT', 'AUDIT_ANNULE'];
  var DROITS = { IDE: FAIRE.slice(), AS: FAIRE.slice(), CADRE: FAIRE.concat(['AUDIT_ANNULE_TOUS']), CADRE_SUP: FAIRE.concat(['AUDIT_ANNULE_TOUS']), DIRECTEUR_SOINS: [] };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: TYPES.concat(['AUDIT_ANNULE_TOUS']), rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'audits', rolesEncadrement: ['CADRE', 'CADRE_SUP'], inactifParDefaut: true,
    lireAcces: function (r) { return r.accesModules ? r.accesModules.audits : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, a = e.type === 'AUDIT' ? null : st && st.audits && st.audits[d.audit];
    var sv = d.service || (a && a.service);
    return sv ? [sv] : [];
  }

  var contrat = {
    id: 'audits',
    libelle: 'Audits internes',
    version: '0.1.0',
    icone: 'AU',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { audits: controlerCadre } },
    vues: { onglets: [{ code: 'audits', libelle: 'Audits' }, { code: 'resultats', libelle: 'Résultats' }, { code: 'registre', libelle: 'Registre' }] },
    migrations: [],
    fournitures: [],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, REPONSES: REPONSES, MODES: MODES, MOIS: MOIS,
    item: item, tauxItem: tauxItem, libelleReponse: libelleReponse, indicateurs: indicateurs,
    moisDe: moisDe, lireSynthese: lireSynthese, valeurImportee: valeurImportee, preparerImport: preparerImport, grilleDepuisSynthese: grilleDepuisSynthese, correspondance: correspondance, MODELES: MODELES, FONCTION_DOSSIER: FONCTION_DOSSIER,
    grille: grille, grilles: grilles, grillesActives: grillesActives, grilleDe: grilleDe, depuisModele: depuisModele, dossierAutorise: dossierAutorise,
    auditeurs: auditeurs, peutAuditer: peutAuditer, controlerCadre: controlerCadre, controler: controler,
    valides: valides, taux: taux, ecarts: ecarts, liste: liste, periode: periode, resultats: resultats, lignesExport: lignesExport };
});
