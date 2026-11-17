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
  function critere(x) { return { libelle: texte(x && x.libelle, 160), rubrique: texte(x && x.rubrique, 60), aide: texte(x && x.aide, 200) }; }
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
        items: (Array.isArray(d.items) ? d.items : []).slice(0, MAX_CRITERES).map(function (x) { return { libelle: texte(x.libelle, 160), rubrique: texte(x.rubrique, 60), reponse: REPONSES[x.reponse] ? x.reponse : 'na', commentaire: texte(x.commentaire, MAX_COMMENTAIRE) }; }),
        commentaire: texte(d.commentaire, MAX_TEXTE), par: e.auteur, nom: texte(d.nom, 80), le: e.at, annule: null };
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
      if (d.items.some(function (x) { return !x || !REPONSES[x.reponse]; })) throw new Error('Répondez à chaque critère : conforme, non conforme ou non concerné.');
      if (d.items.every(function (x) { return x.reponse === 'na'; })) throw new Error('Tous les critères sont « non concerné » : rien à auditer.');
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
  /** Comptes d'un audit : { oui, non, na, taux (0 à 100, arrondi à l'unité ; null si rien d'évaluable) }. */
  function taux(items) {
    var r = { oui: 0, non: 0, na: 0 };
    (items || []).forEach(function (x) { r[REPONSES[x.reponse] ? x.reponse : 'na']++; });
    r.taux = r.oui + r.non ? Math.round(100 * r.oui / (r.oui + r.non)) : null;
    return r;
  }
  function ecarts(a) { return (a.items || []).filter(function (x) { return x.reponse === 'non'; }); }
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
  /** Période d'une date : 'mois' (2026-11), 'trimestre' (2026-T4), 'annee' (2026). */
  function periode(date, par) {
    var a = date.slice(0, 4), m = +date.slice(5, 7);
    if (par === 'annee') return { code: a, libelle: a };
    if (par === 'trimestre') { var t = Math.ceil(m / 3); return { code: a + '-T' + t, libelle: (t === 1 ? '1er' : t + 'e') + ' trimestre ' + a }; }
    return { code: date.slice(0, 7), libelle: MOIS[m - 1] + ' ' + a };
  }
  /**
   * Résultats d'une grille (ou de toutes) sur une période : taux global (conformes / évaluables, tous audits confondus),
   * taux par période et par critère (du moins conforme au plus conforme). `f` : { services, grille, du, au, par }.
   */
  function resultats(st, f) {
    f = f || {};
    var ls = liste(st, f), parP = {}, parC = {}, global = { oui: 0, non: 0, na: 0 };
    ls.forEach(function (a) {
      var p = periode(a.date, f.par || 'mois'), x = parP[p.code] = parP[p.code] || { code: p.code, libelle: p.libelle, audits: 0, oui: 0, non: 0, na: 0 };
      x.audits++;
      a.items.forEach(function (i) {
        x[i.reponse]++; global[i.reponse]++;
        var k = (i.rubrique || '') + '|' + i.libelle, y = parC[k] = parC[k] || { libelle: i.libelle, rubrique: i.rubrique, oui: 0, non: 0, na: 0 };
        y[i.reponse]++;
      });
    });
    function avecTaux(x) { x.taux = x.oui + x.non ? Math.round(100 * x.oui / (x.oui + x.non)) : null; return x; }
    return {
      audits: ls.length, global: avecTaux(global),
      periodes: Object.keys(parP).sort().map(function (k) { return avecTaux(parP[k]); }),
      criteres: Object.keys(parC).map(function (k) { return avecTaux(parC[k]); }).sort(function (p, q) { return (p.taux === null ? 101 : p.taux) - (q.taux === null ? 101 : q.taux) || p.libelle.localeCompare(q.libelle); })
    };
  }
  /** Lignes de l'export (CSV) : une ligne par critère de chaque audit. */
  function lignesExport(ls, libService) {
    var t = [['Date', 'Service', 'Audit', 'Référence', 'Auditeur', 'Taux de conformité (%)', 'Rubrique', 'Critère', 'Réponse', 'Commentaire du critère', 'Commentaire de l’audit', 'Annulé']];
    ls.forEach(function (a) {
      var tx = taux(a.items).taux;
      a.items.forEach(function (i) {
        t.push([a.date, libService ? libService(a.service) : a.service, a.libelle, a.reference, a.nom, tx === null ? '' : tx, i.rubrique, i.libelle, REPONSES[i.reponse], i.commentaire, a.commentaire, a.annule ? 'oui (' + a.annule.motif + ')' : '']);
      });
    });
    return t;
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
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, REPONSES: REPONSES, MODELES: MODELES, FONCTION_DOSSIER: FONCTION_DOSSIER,
    grille: grille, grilles: grilles, grillesActives: grillesActives, grilleDe: grilleDe, depuisModele: depuisModele, dossierAutorise: dossierAutorise,
    auditeurs: auditeurs, peutAuditer: peutAuditer, controlerCadre: controlerCadre, controler: controler,
    valides: valides, taux: taux, ecarts: ecarts, liste: liste, periode: periode, resultats: resultats, lignesExport: lignesExport };
});
