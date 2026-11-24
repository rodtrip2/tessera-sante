// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — fonctions soumises à avis (décision du porteur du 13 novembre 2026, CLAUDE.md § 2).
 *
 * Une fonction qui demande un avis (délégué à la protection des données, responsable de la sécurité informatique,
 * ressources humaines, direction des soins…) peut être développée sans attendre l'avis, mais l'établissement doit
 * pouvoir la désactiver. Ce fichier tient :
 *   - le catalogue de ces fonctions, chacune rattachée à ses interlocuteurs ;
 *   - leur état dans l'établissement (réglage `validations`, saisie CONFIG du journal du socle) : « désactivé »,
 *     « activé sur accord hiérarchique (pilote) » ou « activé après avis », avec date, auteur et référence ;
 *   - les contrôles utilisés par le reste de l'application (module masqué, données ajoutées masquées).
 *
 * Fonctions nouvelles : livrées désactivées. Fonctions déjà développées avant la décision : activées par défaut
 * (« accord hiérarchique », sans date), pour ne rien changer à l'existant. Isocont n'y figure pas (registre légal).
 * Une fonction désactivée masque ses écrans : ses données sont conservées, jamais supprimées, et restent reprises
 * dans l'export du droit d'accès.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).validations = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Interlocuteurs, dans l'ordre d'affichage de l'onglet « Validations ». */
  var INTERLOCUTEURS = [
    { code: 'dpo', libelle: 'Délégué à la protection des données (DPO, référent RGPD)' },
    { code: 'rssi', libelle: 'Responsable de la sécurité informatique (RSSI)' },
    { code: 'si', libelle: 'Service informatique (DSI ou direction du numérique, selon l’établissement)' },
    { code: 'rh', libelle: 'Direction des ressources humaines' },
    { code: 'soins', libelle: 'Direction des soins et commission médicale d’établissement (CME)' },
    { code: 'juridique', libelle: 'Direction juridique' },
    { code: 'representants', libelle: 'Représentants du personnel' }
  ];

  /**
   * Catalogue. `categorie` : 'clinique' ou 'personnel' (pendant le pilote, l'accord hiérarchique suppose d'avoir
   * informé le délégué à la protection des données), sinon 'autre'. `existante` : fonction développée avant la
   * décision du 13 novembre 2026 (activée par défaut). `modules` : modules masqués quand la fonction est désactivée.
   * `champs` : données ajoutées masquées ('clinique' : option « donnée clinique » ; 'agent' : données du personnel).
   * `ou` : où se trouvent les réglages propres à la fonction dans l'application.
   */
  var CATALOGUE = [
    { code: 'conges', libelle: 'Module Congés : demandes, droits et soldes des agents', categorie: 'personnel', interlocuteurs: ['dpo', 'rh'], existante: true, modules: ['conges'],
      description: 'Données du personnel (absences, droits à congés, soldes). Désactivé : la fenêtre Congés est masquée ; les demandes et décisions sont conservées.',
      ou: 'Administration → Congés' },
    { code: 'donnees-personnel', libelle: 'Données du personnel ajoutées aux fiches des agents', categorie: 'personnel', interlocuteurs: ['dpo', 'rh', 'representants'], existante: true, champs: ['agent'],
      description: 'Données ajoutées par l’établissement dans la fiche des agents (Équipe, vues « Agents » de la Vue d’ensemble). Désactivé : ces données sont masquées partout ; elles sont conservées.',
      ou: 'Administration → Réglages généraux → données ajoutées (agents)' },
    { code: 'vehicules', libelle: 'Module Véhicules : réservations et signalements', categorie: 'autre', interlocuteurs: ['dpo'], existante: true, modules: ['vehicules'],
      description: 'Réservations nominatives des véhicules de l’établissement (agent, trajet, horaires). Base légale et durée de conservation à confirmer. Désactivé : la fenêtre Véhicules est masquée ; les réservations sont conservées.',
      ou: 'Administration → Véhicules de l’établissement' },
    { code: 'donnee-clinique', libelle: 'Option « donnée clinique » des données ajoutées', categorie: 'clinique', interlocuteurs: ['dpo', 'rssi', 'soins'], existante: true, champs: ['clinique'],
      description: 'Données ajoutées marquées « donnée clinique » par l’administrateur (clé propre obligatoire). Désactivé : ces données sont masquées partout ; elles sont conservées.',
      ou: 'Administration → Réglages généraux → données ajoutées' },
    { code: 'formations', libelle: 'Module Formations : inscriptions des agents, décisions, départs en formation', categorie: 'personnel', interlocuteurs: ['dpo', 'rh'], existante: false, modules: ['formations'],
      description: 'Données du personnel (formations demandées, décisions, liste d’attente, départs). Désactivé : la fenêtre Formations est masquée ; les inscriptions sont conservées. Pendant le pilote, activation sur accord hiérarchique après information du délégué à la protection des données.',
      ou: 'Administration → Formations' },
    { code: 'heures', libelle: 'Module Heures supplémentaires : déclarations, récupérations, décisions, soldes', categorie: 'personnel', interlocuteurs: ['dpo', 'rh'], existante: false, modules: ['heures'],
      description: 'Données du personnel (heures supplémentaires déclarées, motifs, décisions, récupérations, soldes et corrections). Tessera ne calcule pas la paie : le logiciel de gestion du temps reste la référence. Désactivé : la fenêtre Heures supplémentaires est masquée ; les saisies sont conservées. Pendant le pilote, activation sur accord hiérarchique après information du délégué à la protection des données.',
      ou: 'Administration → Heures supplémentaires' },
    { code: 'entretiens', libelle: 'Entretiens des agents (suivi, recadrage, reprise, intégration)', categorie: 'personnel', interlocuteurs: ['dpo', 'rh', 'representants'], existante: false,
      description: 'Comptes rendus d’entretiens menés par le cadre de l’agent, lus par lui seul et, à son choix, par un ou plusieurs supérieurs et par l’agent (signature possible, avec ses observations). Contenu chiffré pour les seuls lecteurs ; l’administrateur ne le lit pas. Retrait possible de l’export du droit d’accès quand un entretien concerne d’autres agents. À articuler avec le dossier administratif de l’agent (éviter un dossier parallèle). Désactivé : l’onglet Entretiens est masqué ; les entretiens sont conservés.',
      ou: 'Équipe → Entretiens' },
    { code: 'bris-de-glace', libelle: 'Bris de glace : lecture temporaire des données cliniques d’un patient', categorie: 'clinique', interlocuteurs: ['dpo', 'rssi', 'soins'], existante: false,
      description: 'Un agent sans accès aux données cliniques d’un patient les lit pour une durée limitée (fin du poste par défaut), avec une justification obligatoire ; tracé au journal, cadre du service et administrateur de garde informés, relecture mensuelle par le cadre, export pour le délégué à la protection des données. Accès garanti par l’application et la traçabilité (la clé des données cliniques est remise aux rôles qui peuvent y recourir). Désactivé : plus de nouveau bris de glace ; la liste reste consultable.',
      ou: 'Administration → Patients → Données cliniques' },
    { code: 'dossier-clinique', libelle: 'Données cliniques du séjour : feuille de staff clinique (codes CIM, motif, projet thérapeutique, dépendance) et notes cliniques', categorie: 'clinique', interlocuteurs: ['dpo', 'rssi', 'soins'], existante: false, modules: ['clinique'],
      description: 'Données de santé rattachées au séjour, écrites et lues par les rôles réglés (IDE, cadre, médecins par défaut), avec les limites communes (patients présents, bris de glace). Le dossier patient informatisé reste la référence clinique : risque de double saisie et de divergence à examiner avec la direction des soins et la commission médicale. Désactivé : la fenêtre Données cliniques est masquée ; les données sont conservées.',
      ou: 'Administration → Rôles et accès ; Données cliniques' },
    { code: 'audit-dossier', libelle: 'Audits de la tenue du dossier du patient', categorie: 'clinique', interlocuteurs: ['dpo', 'soins'], existante: false,
      description: 'Audit interne réalisé sur le dossier d’un patient (grille « Tenue du dossier » du module Audits internes) : la saisie garde la référence du séjour, jamais le nom, et les réponses aux critères. Le dossier patient informatisé reste la référence ; l’audit en vérifie la tenue. Désactivé : la grille est masquée et ne peut plus être remplie ; les audits faits sont conservés.',
      ou: 'Administration → Audits internes' },
    { code: 'documents-fichiers', libelle: 'Documents : fichiers joints gardés tels quels (PDF, images, Word, Excel…)', categorie: 'autre', interlocuteurs: ['dpo', 'rssi'], existante: false,
      description: 'Fichiers déposés dans le module Documents sans conversion, seuls ou par lots : chiffrés par la clé propre de chaque document, rangés à part des saisies sur le partage, privés jusqu’à leur partage ; rattachables à un agent, un patient ou une salle sans être partagés avec eux. Images et PDF affichés dans l’application, autres fichiers téléchargés (droit d’export du document, tracé au journal). Taille maximale et types acceptés réglés par l’établissement. Points à examiner : nature des fichiers déposés (aucune donnée clinique ; documents concernant des agents ou des patients), durée de conservation, place occupée sur le partage, fichiers en clair une fois téléchargés. Désactivé : l’import en lots convertit seulement Word et Excel ; les fichiers déjà déposés restent conservés et lisibles par ceux qui y ont accès.',
      ou: 'Documents → Importer des fichiers ; Administration → Documents' },
    { code: 'synchro-caldav', libelle: 'Synchronisation de Mes tâches et de Mon agenda avec l’agenda de la messagerie (Zimbra…) et le téléphone (DAVx5)', categorie: 'autre', interlocuteurs: ['dpo', 'rssi', 'si'], existante: false,
      description: 'Chaque agent qui le choisit relie Tessera à son agenda de la messagerie de l’établissement (protocole CalDAV) : ses tâches personnelles et partagées y sont copiées dans une liste « Tessera — tâches », modifiables sur le téléphone (application DAVx5) et reprises dans Tessera ; les événements de Mon agenda y sont copiés en lecture seule (« Tessera — agenda », sans identité de patient : type, lieu, horaire) ; l’agenda de la messagerie peut être affiché dans Mon agenda. Le navigateur échange directement avec le serveur de messagerie de l’établissement, dont l’adresse est autorisée sur place par le script de mise à jour (aucune autre connexion). Mot de passe de la messagerie saisi par l’agent, gardé en mémoire pendant la session ou, s’il le choisit, chiffré par sa clé de liste (jamais écrit au journal), redemandé quand le serveur le refuse. Points à examiner : copie des tâches (sans donnée clinique) sur le serveur de messagerie et sur le téléphone de l’agent (téléphone professionnel ou personnel, verrouillage, perte), messagerie hébergée dans l’établissement ou non, mémorisation du mot de passe, ouverture de la règle de connexion de la page vers ce seul serveur, réglage du serveur de messagerie (échanges entre origines). Désactivé : la synchronisation s’arrête ; ce qui a été copié reste dans l’agenda de la messagerie jusqu’à ce que l’agent le supprime.',
      ou: 'Agenda → Mes tâches → Synchronisation ; Administration → Validations' },
    { code: 'mesure-usage', libelle: 'Mesure d’usage anonyme', categorie: 'autre', interlocuteurs: ['representants', 'dpo'], existante: false,
      description: 'Nombre de saisies par module et par semaine, et nombre d’agents ayant saisi (jamais leur identité ; masqué sous 3 agents), calculés à partir du journal, pour évaluer le pilote. Information des agents et des représentants du personnel avant activation.',
      ou: 'Administration → Mesure d’usage' }
  ];

  var ETATS = { desactive: 'Désactivé', accord: 'Activé sur accord hiérarchique (pilote)', avis: 'Activé après avis' };
  /** Rôles qui voient le rappel d'une fonction activée sur accord hiérarchique seulement : le cadre et la direction. */
  var ROLES_RAPPEL = ['ADMIN', 'CADRE', 'CADRE_SUP', 'DIRECTEUR_SOINS'];
  var MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function texte(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max || 200) : ''; }
  function dateValide(v) { return typeof v === 'string' && MOTIF_DATE.test(v) && !isNaN(Date.parse(v + 'T12:00:00Z')) ? v : ''; }
  function interlocuteur(code) { return INTERLOCUTEURS.filter(function (i) { return i.code === code; })[0] || null; }
  function fonction(code) { return CATALOGUE.filter(function (f) { return f.code === code; })[0] || null; }

  /** Réglage lu et validé : { etats: { code: { etat, date, auteur, reference, dpoInforme } } }, codes inconnus écartés. */
  function normaliser(v) {
    var src = v && typeof v === 'object' && v.etats && typeof v.etats === 'object' ? v.etats : {}, etats = {};
    Object.keys(src).forEach(function (code) {
      var e = src[code];
      if (!fonction(code) || !e || !ETATS[e.etat]) return;
      etats[code] = { etat: e.etat, date: dateValide(e.date), auteur: texte(e.auteur, 120), reference: texte(e.reference, 300), dpoInforme: dateValide(e.dpoInforme) };
    });
    return { etats: etats };
  }

  /** État d'une fonction dans l'établissement ; `defaut` : rien n'a encore été enregistré pour elle. */
  function etat(config, code) {
    var f = fonction(code);
    if (!f) return null;
    var e = normaliser(config && config.validations).etats[code];
    if (e) return Object.assign({ defaut: false }, e);
    return { etat: f.existante ? 'accord' : 'desactive', date: '', auteur: '', reference: '', dpoInforme: '', defaut: true };
  }
  /** La fonction est-elle activée ? Un code absent du catalogue n'est jamais bloqué. */
  function actif(config, code) { var e = etat(config, code); return !e || e.etat !== 'desactive'; }
  /** Un module est masqué quand une fonction du catalogue qui le désigne est désactivée. */
  function moduleAutorise(id, config) {
    return CATALOGUE.every(function (f) { return !f.modules || f.modules.indexOf(id) < 0 || actif(config, f.code); });
  }
  /** Une donnée ajoutée (définition normalisée de champs.js) est-elle affichée ? */
  function champAutorise(def, config) {
    if (!def) return true;
    return CATALOGUE.every(function (f) {
      if (!f.champs || actif(config, f.code)) return true;
      if (f.champs.indexOf('clinique') >= 0 && def.clinique === true) return false;
      if (f.champs.indexOf('agent') >= 0 && def.entite === 'agent') return false;
      return true;
    });
  }

  /** Fonctions rangées par interlocuteur (une fonction figure chez chacun de ses interlocuteurs), groupes vides écartés. */
  function parInterlocuteur(config) {
    return INTERLOCUTEURS.map(function (i) {
      return { interlocuteur: i, fonctions: CATALOGUE.filter(function (f) { return f.interlocuteurs.indexOf(i.code) >= 0; }).map(function (f) { return { fonction: f, etat: etat(config, f.code) }; }) };
    }).filter(function (g) { return g.fonctions.length; });
  }
  /** Fonctions activées sur accord hiérarchique seulement (rappel au cadre et à la direction). */
  function aRappeler(config) {
    return CATALOGUE.filter(function (f) { return etat(config, f.code).etat === 'accord'; });
  }
  /** Le rappel est-il montré à ces rôles ? Jamais aux autres agents. */
  function voitRappel(roles) { return (roles || []).some(function (r) { return ROLES_RAPPEL.indexOf(r) >= 0; }); }

  /**
   * Nouvel état d'une fonction ; renvoie la nouvelle valeur du réglage `validations` (la saisie CONFIG est faite par
   * l'appelant). `saisie` : { etat, date, auteur, reference, dpoInforme }. Contrôles : date et auteur de l'accord ou
   * de l'avis ; pour une donnée clinique ou du personnel activée sur accord hiérarchique, date à laquelle le délégué
   * à la protection des données a été informé.
   */
  function changer(config, code, saisie) {
    var f = fonction(code);
    if (!f) throw new Error('Fonction inconnue : ' + code + '.');
    var s = saisie || {}, e = { etat: s.etat, date: dateValide(s.date), auteur: texte(s.auteur, 120), reference: texte(s.reference, 300), dpoInforme: dateValide(s.dpoInforme) };
    if (!ETATS[e.etat]) throw new Error('Choisissez un état.');
    if (e.etat !== 'desactive') {
      if (!e.date) throw new Error(e.etat === 'avis' ? 'Indiquez la date de l’avis.' : 'Indiquez la date de l’accord hiérarchique.');
      if (!e.auteur) throw new Error(e.etat === 'avis' ? 'Indiquez qui a rendu l’avis.' : 'Indiquez qui a donné l’accord.');
    }
    if (e.etat === 'accord' && (f.categorie === 'clinique' || f.categorie === 'personnel') && !e.dpoInforme)
      throw new Error('Pendant le pilote, une fonction portant sur des ' + (f.categorie === 'clinique' ? 'données cliniques' : 'données du personnel') + ' n’est activée sur accord hiérarchique qu’après avoir informé le délégué à la protection des données : indiquez la date de cette information.');
    if (e.etat !== 'accord') e.dpoInforme = e.etat === 'avis' ? e.dpoInforme : '';
    var v = normaliser(config && config.validations);
    v.etats[code] = e;
    return v;
  }

  /** Résumé lisible du réglage (journal). */
  function resume(v) {
    var n = normaliser(v), codes = Object.keys(n.etats);
    if (!codes.length) return 'états par défaut';
    return codes.map(function (c) { var e = n.etats[c]; return fonction(c).libelle + ' : ' + ETATS[e.etat].toLowerCase() + (e.date ? ' (' + e.date + (e.auteur ? ', ' + e.auteur : '') + ')' : ''); }).join(' ; ');
  }

  return {
    INTERLOCUTEURS: INTERLOCUTEURS, CATALOGUE: CATALOGUE, ETATS: ETATS, ROLES_RAPPEL: ROLES_RAPPEL,
    interlocuteur: interlocuteur, fonction: fonction, normaliser: normaliser, etat: etat, actif: actif,
    moduleAutorise: moduleAutorise, champAutorise: champAutorise, parInterlocuteur: parInterlocuteur,
    aRappeler: aRappeler, voitRappel: voitRappel, changer: changer, resume: resume
  };
});
