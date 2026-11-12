// SPDX-License-Identifier: EUPL-1.2
/*
 * Données fictives de démonstration. Aucun nom réel : patients, soignants et
 * psychiatres sont inventés et marqués comme tels.
 */
(function (root) {
  'use strict';
  var SIC = root.SIC = root.SIC || {};
  var H = 3600 * 1000, J = 24 * H;

  /**
   * Saisies fictives, relatives à l'instant présent.
   * options.config : paramétrage réel à reprendre (jeu de formation) ; sinon, paramétrage de démonstration.
   */
  SIC.donneesFictives = function (options) {
    options = options || {};
    var reel = options.config || null;
    var now = Date.now();
    var arrondi = function (ms) { return Math.round(ms / (15 * 60000)) * 15 * 60000; };
    var t = function (h) { return arrondi(now + h * H); };
    var seq = 0;
    var file = [];
    function ajouter(at, type, data, by) { file.push({ at: at, type: type, data: data, n: seq++, by: by }); }

    var cfg = function (cle, valeur) { ajouter(t(-24 * 300), 'CONFIG', { cle: cle, valeur: valeur }); };
    var U1 = 'U1', U2 = 'U2', CSI1 = 'CSI 1', CSI2 = 'CSI 2', CSIA = 'CSI A';
    var periodes = [['M', 7], ['AM', 14], ['N', 21]];
    if (reel) {
      // Jeu de formation : mêmes services, CSI et postes que les données réelles, contenu fictif.
      ['services', 'modulesServices', 'fichePatient', 'importPatients', 'patientsListe', 'patientsChamps', 'champsAjoutes', 'reglagesDonnees', 'capacites', 'vuesEnsemble', 'psychologues', 'largeursColonnes', 'vehicules', 'vehiculesInformation', 'travaux', 'messagerie', 'salles', 'infos', 'poles', 'chambres', 'delegations', 'charteIntervenants', 'groupes', 'medecins', 'suiviMedical', 'agenda', 'lieuxCSI', 'periodes', 'periodesService', 'modesHospitalisation', 'parametres', 'delaiModeHospiHeures', 'decompte', 'inactiviteMinutes', 'pauses', 'imagesDecompte', 'colonnesPatients', 'casParticuliers', 'qualite', 'statsMethode', 'informateursTiers', 'lieuIsolement', 'organisationJLD', 'verificationVersion', 'listes', 'vigilance', 'affichage', 'roles', 'surveillance', 'exports'].forEach(function (k) {
        if (reel[k] !== undefined) cfg(k, reel[k]);
      });
      // Alertes : seules les mesures saisies pendant la formation les déclenchent.
      if (reel.alertes !== undefined) cfg('alertes', reel.alertes.map(function (r) { return Object.assign({}, r, { depuis: r.active ? now : 0 }); }));
      cfg('etablissement', ((reel.etablissement || '') + ' — FORMATION').replace(/^ — /, ''));
      var svs = (reel.services || []).map(function (x) { return x.code; });
      if (!svs.length) { svs = ['U1']; cfg('services', [{ code: 'U1', libelle: 'Unité 1 (fictive)' }]); }
      U1 = svs[0]; U2 = svs[1] || svs[0];
      var l1 = ((reel.lieuxCSI || {})[U1] || []), l2 = ((reel.lieuxCSI || {})[U2] || []);
      CSI1 = l1[0] || 'CSI 1'; CSI2 = l1[1] || l1[0] || 'CSI 2'; CSIA = l2[0] || 'CSI A';
      var lieux = JSON.parse(JSON.stringify(reel.lieuxCSI || {}));
      [[U1, CSI1], [U1, CSI2], [U2, CSIA]].forEach(function (x) { lieux[x[0]] = lieux[x[0]] || []; if (lieux[x[0]].indexOf(x[1]) < 0) lieux[x[0]].push(x[1]); });
      cfg('lieuxCSI', lieux);
      periodes = SIC.model.periodesDe(reel, U1).map(function (p) { return [p.code, +p.debut.split(':')[0]]; });
    } else {
      cfg('services', [{ code: 'U1', libelle: 'Unité 1 (fictive)' }, { code: 'U2', libelle: 'Unité 2 (fictive)' }]);
      cfg('etablissement', 'Établissement fictif de démonstration');
      cfg('poles', [{ code: 'PSM', libelle: 'Pôle santé mentale (fictif)', services: ['U1', 'U2'] }]);   // 0.27.2
      // Chambres et lits (0.29.0) : Unité 1 (chambres doubles et simples, deux CSI, pièces dont un espace d'apaisement
      // utilisé par les patients), Unité 2 (chambres simples, une CSI) ; plan du service en grille
      var ch = function (nom, lits, x, y, w) { return { id: 'c' + nom, nom: nom, type: 'chambre', lits: lits, x: x, y: y, w: w || 1, h: 1 }; };
      cfg('chambres', {
        U1: { colonnes: 8, pieces: [ch('8', ['P', 'F'], 0, 0), ch('10', ['P', 'F'], 1, 0), ch('12', ['P', 'F'], 2, 0), ch('14', [], 3, 0), ch('16', [], 4, 0), ch('18', ['P', 'F'], 5, 0),
          { id: 'csi1', nom: 'CSI 1', type: 'csi', x: 6, y: 0 }, { id: 'csi2', nom: 'CSI 2', type: 'csi', x: 7, y: 0 },
          { id: 'poste', nom: 'Poste de soins', type: 'piece', nature: 'poste', x: 0, y: 2, w: 2 }, { id: 'apais', nom: 'Espace d’apaisement', type: 'piece', nature: 'apaisement', usage: true, x: 2, y: 2, w: 2 },
          { id: 'bur', nom: 'Bureau médical', type: 'piece', nature: 'bureau', x: 4, y: 2 }, { id: 'sam', nom: 'Salle à manger', type: 'piece', nature: 'repas', usage: true, x: 5, y: 2, w: 3 }] },
        U2: { colonnes: 6, pieces: [ch('A1', [], 0, 0), ch('A3', [], 1, 0), ch('A5', [], 2, 0), ch('A7', [], 3, 0), { id: 'csia', nom: 'CSI A', type: 'csi', x: 5, y: 0 },
          { id: 'off', nom: 'Office', type: 'piece', nature: 'office', x: 0, y: 2, w: 2 }] }
      });
      cfg('lieuxCSI', { U1: ['CSI 1', 'CSI 2'], U2: ['CSI A'] });
      // Accès particuliers (0.31.0) : prêts de droits (en cours, reçu par l'agent connecté ; à venir, donné par lui ; terminé
      // pendant son absence) et charte de confidentialité des intervenants extérieurs (fictifs)
      var idMoi = options.moi && options.moi.id, jD = function (n) { return SIC.model.dateLocaleISO(Date.now() + n * 864e5); };
      if (idMoi) cfg('delegations', { prets: [
        { id: 'pr-demo1', de: 'demo-d', a: idMoi, debut: jD(-2), fin: jD(5), roles: ['IDE'], services: ['U1'], motif: 'Congés annuels (fictif)', par: 'demo-d', le: new Date(Date.now() - 3 * 864e5).toISOString() },
        { id: 'pr-demo2', de: idMoi, a: 'demo-a', debut: jD(20), fin: jD(34), roles: ['CADRE'], services: ['U1'], motif: 'Formation (fictif)', par: idMoi, le: new Date(Date.now() - 864e5).toISOString() },
        { id: 'pr-demo3', de: idMoi, a: 'demo-c', debut: jD(-9), fin: jD(-2), roles: ['CADRE'], services: ['U2'], motif: 'Congés (fictif)', par: idMoi, le: new Date(Date.now() - 12 * 864e5).toISOString() }] });
      cfg('charteIntervenants', { version: 1, texte: 'Charte de confidentialité (fictive, à rédiger par l’établissement)\n\n1. Je respecte le secret professionnel et la vie privée des patients rencontrés.\n2. Je ne communique à personne les informations vues dans Tessera Santé.\n3. Je ne prends ni photo ni note nominative.\n4. Mon compte est personnel : je ne le prête pas et je verrouille l’écran en partant.' });
      // Agenda : audiences JLD et activités thérapeutiques en transparence tant qu'aucun patient n'y est prévu
      // Fiche patient : données complémentaires (sorties libres saisies aussi par les AS dans l'Unité 1 ; éducateur référent
      // visible des IDE et cadres ; repas favori en liste de choix ; une donnée masquée)
      cfg('patientsChamps', [
        { id: 'sorties-libres', libelle: 'Sorties libres', type: 'ouiNon', services: ['U1'], saisie: ['IDE', 'AS', 'CADRE'], lecture: [] },
        { id: 'educateur', libelle: 'Éducateur référent', type: 'professionnel', services: [], saisie: [], lecture: ['IDE', 'CADRE', 'SECRETAIRE'] },
        { id: 'repas', libelle: 'Repas favori', type: 'liste', choix: ['Pâtes', 'Couscous', 'Poisson', 'Végétarien'], services: [], saisie: ['IDE', 'AS', 'CADRE'], lecture: [] },
        { id: 'activite-preferee', libelle: 'Activité préférée', type: 'texte', services: [], saisie: [], lecture: [], actif: false }]);
      // Données ajoutées communes (0.18.0) : reprise des données complémentaires ci-dessus, puis téléphone d'un proche
      // (information concernant un tiers), activités en choix multiple, démarches en notes, check-list d'entrée (modèle et
      // éléments libres), sortie envisagée en période ; pour les médecins, téléphone professionnel (Suivi médical) ;
      // une donnée sous clé propre (vigilance organisationnelle, IDE et cadres) ; fictives
      cfg('champsAjoutes', [
        { id: 'sorties-libres', libelle: 'Sorties libres', type: 'ouiNon', entite: 'patient', module: 'patients', services: ['U1'], saisie: ['IDE', 'AS', 'CADRE'], lecture: [] },
        { id: 'educateur', libelle: 'Éducateur référent', type: 'professionnel', entite: 'patient', module: 'patients', services: [], saisie: [], lecture: ['IDE', 'CADRE', 'SECRETAIRE'] },
        { id: 'repas', libelle: 'Repas favori', type: 'liste', choix: ['Pâtes', 'Couscous', 'Poisson', 'Végétarien'], entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'AS', 'CADRE'], lecture: [] },
        { id: 'activite-preferee', libelle: 'Activité préférée', type: 'texte', entite: 'patient', module: 'patients', services: [], saisie: [], lecture: [], actif: false },
        { id: 'tel-proche', libelle: 'Téléphone de la personne à prévenir', type: 'telephone', entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'CADRE', 'SECRETAIRE'], lecture: ['IDE', 'CADRE', 'SECRETAIRE'], tiers: true },
        { id: 'activites', libelle: 'Activités thérapeutiques', type: 'choixMultiple', choix: ['Piscine', 'Jardin', 'Musique', 'Cuisine', 'Sport adapté'], entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'AS', 'CADRE'], lecture: [] },
        // Consignes du tableau de transmissions (0.30.0) : choix réglés par le cadre, précisions en texte libre (fictifs)
        { id: 'consignes', libelle: 'Consignes', type: 'choixMultiple', choix: ['Repas en chambre', 'Temps en chambre de 17 h à 18 h', 'Sorties accompagnées', 'Visites en salle des familles', 'Téléphone à la demande'], entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'CADRE'], lecture: [] },
        { id: 'consignes-precisions', libelle: 'Précisions sur les consignes', type: 'texte', entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'CADRE'], lecture: [] },
        { id: 'demarches', libelle: 'Démarches et rendez-vous', type: 'notes', entite: 'patient', module: 'patients', services: [], saisie: ['IDE', 'AS', 'CADRE', 'SECRETAIRE'], lecture: [], tri: 'desc' },
        { id: 'accueil', libelle: 'Check-list d’entrée', type: 'checklist', entite: 'patient', module: 'patients', services: ['U1'], saisie: ['IDE', 'AS', 'CADRE'], lecture: [], libre: true, par: { role: 'CADRE', services: ['U1'] },
          modele: [{ id: 'inventaire', libelle: 'Inventaire des effets personnels' }, { id: 'livret', libelle: 'Livret d’accueil remis' }, { id: 'droits', libelle: 'Information sur les droits' }, { id: 'personne-confiance', libelle: 'Personne de confiance recueillie' }] },
        { id: 'projet-sortie', libelle: 'Projet de sortie', type: 'texte', entite: 'patient', module: 'suivi', services: [], saisie: ['IDE', 'CADRE'], lecture: [] },
        { id: 'vigilance-orga', libelle: 'Vigilance organisationnelle', type: 'notes', entite: 'patient', module: 'patients', protection: 'cle', services: [], saisie: ['IDE', 'CADRE'], lecture: ['IDE', 'CADRE'] },
        // Réservée au pôle du patient (0.32.0) : informations très sensibles, une clé par pôle (fictive)
        { id: 'info-sensible', libelle: 'Information très sensible (pôle)', type: 'notes', entite: 'patient', module: 'patients', perimetre: 'pole', services: [], saisie: ['IDE', 'CADRE'], lecture: ['IDE', 'CADRE'] },
        { id: 'jours-avant-sortie', libelle: 'Jours avant la sortie', type: 'formule', formule: 'SIERREUR(-JOURS([Sortie prévisionnelle]); "")', entite: 'patient', module: 'patients', services: ['U1'], saisie: [], lecture: [], par: { role: 'CADRE', services: ['U1'] } },
        // Données des agents (0.20.0) : données du personnel, clé propre, cadre seul par défaut (fictives)
        { id: 'afgsu', libelle: 'Formation aux gestes d’urgence (AFGSU) valable jusqu’au', type: 'date', entite: 'agent', services: [], saisie: ['CADRE'], lecture: ['CADRE'], soi: 'lecture' },
        // Ouverte à l'agent lui-même en écriture (0.28.0) : il la tient dans « Ma fiche »
        { id: 'tenue', libelle: 'Taille de tenue', type: 'liste', choix: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], entite: 'agent', services: [], saisie: ['CADRE'], lecture: ['CADRE'], soi: 'ecriture' },
        { id: 'habilitations', libelle: 'Habilitations', type: 'choixMultiple', choix: ['Conduite d’un véhicule', 'Accompagnement des sorties', 'Référent hygiène', 'Tuteur de stage'], entite: 'agent', services: [], saisie: ['CADRE'], lecture: ['CADRE'] },
        { id: 'tel-pro', libelle: 'Téléphone professionnel', type: 'telephone', entite: 'medecin', module: 'suivi', services: [], saisie: ['CADRE', 'SECRETAIRE'], lecture: [] },
        { id: 'jours-presence', libelle: 'Jours de présence habituels', type: 'choixMultiple', choix: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], entite: 'medecin', module: 'suivi', services: [], saisie: ['CADRE', 'SECRETAIRE'], lecture: [] }]);
      // Réglages des données (0.18.0) : une couleur par psychiatre de 1re ligne, sortie prévisionnelle proche, check-list
      // d'entrée selon l'avancement, délai de la donnée « Projet de sortie » ; l'Unité 2 a ses propres couleurs (fictifs)
      cfg('reglagesDonnees', {
        'patients.medecin1': { '*': { regles: [
          { si: { op: 'egal', valeur: 'm-arnaud' }, couleur: 'bleu', rendu: 'pastille', libelle: 'Dr Arnaud (fictif)' },
          { si: { op: 'egal', valeur: 'm-benoit' }, couleur: 'violet', rendu: 'pastille', libelle: 'Dr Benoît (fictif)' },
          { si: { op: 'egal', valeur: 'm-chen' }, couleur: 'turquoise', rendu: 'pastille', libelle: 'Dr Chen (fictif)' },
          { si: { op: 'vide' }, couleur: 'rouge', rendu: 'fond', libelle: 'Sans médecin de 1re ligne' }] },
          U2: { regles: [{ si: { op: 'egal', valeur: 'm-diallo' }, couleur: 'brun', rendu: 'pastille', libelle: 'Dr Diallo (fictif)' }, { si: { op: 'vide' }, couleur: 'rouge', rendu: 'fond', libelle: 'Sans médecin de 1re ligne' }] } },
        'patients.sortiePrevue': { '*': { regles: [{ si: { op: 'depuisPlusDe', n: 0 }, couleur: 'rouge', rendu: 'fond', libelle: 'Date de sortie passée' }, { si: { op: 'egal', valeur: 'actee' }, couleur: 'vert', rendu: 'fond', libelle: 'Sortie actée (date arrêtée avec le patient)' }, { si: { op: 'egal', valeur: 'envisagee' }, couleur: 'jaune', rendu: 'fond', libelle: 'Sortie envisagée (à confirmer)' }] } },
        'c:accueil': { '*': { regles: [{ si: { op: 'complete' }, couleur: 'vert', rendu: 'fond', libelle: 'Check-list complète' }, { si: { op: 'avancementMoins', n: 50 }, couleur: 'orange', rendu: 'fond', libelle: 'Moins de la moitié faite' }] } },
        'c:afgsu': { '*': { regles: [{ si: { op: 'depuisPlusDe', n: 0 }, couleur: 'rouge', rendu: 'fond', libelle: 'Formation à renouveler' }, { si: { op: 'dansMoinsDe', n: 60 }, couleur: 'orange', rendu: 'fond', libelle: 'À renouveler dans les 2 mois' }] } },
        'c:demarches': { '*': { regles: [{ si: { op: 'importance', valeur: 'urgent' }, couleur: 'rouge', rendu: 'texte', libelle: 'Note urgente' }, { si: { op: 'importance', valeur: 'important' }, couleur: 'orange', rendu: 'texte', libelle: 'Note importante' }] } }
      });
      // Capacité d'accueil (0.18.2, fictive) : deux lits fermés pour travaux dans l'Unité 1, un lit réservé dans l'Unité 2
      var jC = function (n) { return SIC.model.dateLocaleISO(now + n * J); };
      cfg('capacites', { services: {
        U1: { lits: 8, chambresSeules: 4, chambresDoubles: 2, fermetures: [{ id: 'f1', debut: jC(-3), fin: jC(10), lits: 2, motif: 'Travaux de peinture (fictif)' }], reserves: [] },
        U2: { lits: 6, chambresSeules: 6, chambresDoubles: 0, fermetures: [], reserves: [{ id: 'r1', debut: jC(-2), fin: jC(5), lits: 1, motif: 'Permission longue (fictif)' }] } } });
      // Vue d'ensemble (0.19, fictive) : vue médicale de l'établissement, feuille du staff de l'Unité 1 (groupes : entrés depuis
      // dix jours, entrés depuis une date et une heure, présents depuis plus de 30 jours ; notes, check-list, calcul),
      // médecins (téléphone et jours de présence ajoutés), équipe ; une colonne réservée aux IDE et cadres
      cfg('vuesEnsemble', { vues: [
        { id: 'medicale', nom: 'Vue médicale', lignes: 'patients', services: [], roles: [], perimetre: 'hospitalises', tri: { colonne: 'chambre', sens: 1 },
          colonnes: [{ code: 'patient' }, { code: 'chambre' }, { code: 'entree' }, { code: 'mode' }, { code: 'medecin1', affichage: 'initiales' }, { code: 'psychologue' }, { code: 'suiviAS' }, { code: 'dernierEntretien' }, { code: 'contrat' }, { code: 'sortiePrevue' }],
          groupes: [], synthese: ['effectif', 'places', 'sorties'] },
        { id: 'staff-u1', nom: 'Staff Unité 1', lignes: 'patients', services: ['U1'], roles: [], perimetre: 'hospitalises', tri: { colonne: 'entree', sens: -1 }, par: { role: 'CADRE', services: ['U1'] },
          colonnes: [{ code: 'patient' }, { code: 'chambre' }, { code: 'jours' }, { code: 'mode' }, { code: 'medecin1' }, { code: 'referents' }, { code: 'c:demarches' }, { code: 'c:accueil' }, { code: 'c:jours-avant-sortie' }, { code: 'sortiePrevue' },
            { code: 'c:activites', roles: ['IDE', 'CADRE'], regles: [{ si: { op: 'vide' }, couleur: 'gris', rendu: 'fond', libelle: 'Aucune activité' }] }],
          groupes: [{ id: 'entrants', titre: 'Entrés depuis le ' + jC(-9).split('-').reverse().join('/') + ' 14 h', combinaison: 'toutes', conditions: [{ colonne: 'entree', op: 'apresLe', valeur: jC(-9) + 'T14:00' }] },
            { id: 'tres-longs', titre: 'Présents depuis plus de 90 jours', combinaison: 'toutes', conditions: [{ colonne: 'entree', op: 'depuisPlusDe', n: 90 }] },
            { id: 'longs', titre: 'Présents depuis plus de 30 jours', combinaison: 'toutes', conditions: [{ colonne: 'entree', op: 'depuisPlusDe', n: 30 }] }],
          autres: { titre: 'Autres patients' }, synthese: ['effectif', 'places', 'sorties', 'parMode', 'parMedecin', 'ageMoyen'], instantane: { roles: ['CADRE'] } },
        // Tableau de transmissions de l'Unité 1 (0.30.0) : modèle du cadre, plusieurs données par case, consignes, événements, notes
        { id: 'transmissions-u1', nom: 'Transmissions Unité 1', type: 'transmissions', lignes: 'patients', services: ['U1'], roles: [], perimetre: 'hospitalises', tri: { colonne: 'chambre', sens: 1 }, par: { role: 'CADRE', services: ['U1'] },
          transmissions: (SIC.transmissions || (typeof require === 'function' ? require('./transmissions.js') : null)).modele({ consignes: ['c:sorties-libres', 'c:consignes', 'c:consignes-precisions'] }), groupes: [], synthese: [] },
        { id: 'medecins', nom: 'Médecins', lignes: 'medecins', services: [], roles: [], colonnes: [{ code: 'nom' }, { code: 'initiales' }, { code: 'fonction' }, { code: 'statut' }, { code: 'presence' }, { code: 'c:tel-pro' }, { code: 'c:jours-presence' }, { code: 'patients1' }, { code: 'patients2' }, { code: 'retards' }], groupes: [], synthese: [] },
        { id: 'equipe', nom: 'Équipe', lignes: 'agents', services: [], roles: ['CADRE'], colonnes: [{ code: 'nom' }, { code: 'roles' }, { code: 'groupes' }, { code: 'referent' }, { code: 'absence' }, { code: 'taches' }, { code: 'c:afgsu' }, { code: 'c:habilitations' }], groupes: [], synthese: [] }] });
      // Véhicules : deux données ajoutées par l'administrateur (fictives)
      cfg('vehicules', { champs: [{ id: 'carte-carburant', libelle: 'Carte carburant à bord', type: 'ouiNon' }, { id: 'revision', libelle: 'Prochaine révision', type: 'date' },
        { id: 'equipement', libelle: 'Équipement', type: 'liste', choix: ['Rampe d’accès', 'Siège enfant', 'Galerie de toit'] }] });
      // Groupes d'agents (équipes de jour et de nuit de l'Unité 1, groupe de travail commun aux deux unités ; fictifs)
      var moiG = options.moi && options.moi.id ? [{ id: options.moi.id, nom: options.moi.nom || '' }] : [];
      cfg('groupes', [
        { code: 'equipe-jour-u1', libelle: 'Équipe de jour', services: ['U1'], membres: [{ id: 'demo-a', nom: 'Agent A (fictif)' }, { id: 'demo-c', nom: 'Agent C (fictif)' }].concat(moiG) },
        { code: 'equipe-nuit-u1', libelle: 'Équipe de nuit', services: ['U1'], membres: [{ id: 'demo-b', nom: 'Agent B (fictif)' }, { id: 'demo-d', nom: 'Agent D (fictif)' }] },
        { code: 'groupe-qualite', libelle: 'Groupe de travail qualité', services: ['U1', 'U2'], membres: [{ id: 'demo-b', nom: 'Agent B (fictif)' }].concat(moiG) }]);
      // Information des pré-réservations remplacées : l'Unité 2 informe le cadre et le groupe qualité (sans la secrétaire)
      // Demandes de travaux (0.22.0) : numéro des services techniques ; case « chambre indisponible » proposée en Unité 1
      cfg('travaux', { '*': { telephone: '5555 (fictif)' }, U1: { chambreIndisponible: true, salleIndisponible: true } });
      cfg('vehiculesInformation', { U2: { roles: ['CADRE'], groupes: ['groupe-qualite'], agents: [] } });
      // Catégories : préréglages de l'établissement, une catégorie ajoutée pour tous, une propre à l'Unité 2 (fictives)
      cfg('agenda', { categories: {
        '*': { activite: { prereglages: { attente: true } }, examen: { prereglages: { lieu: 'Hôpital général (fictif)' } },
          'consultation-dentaire': { libelle: 'Consultation dentaire', base: 'examen', couleur: '#8a5a2b', prereglages: { duree: 45, lieu: 'Cabinet dentaire (fictif)', accompagnateurs: 1, transports: [{ type: 'taxi', nombre: 1 }] } } },
        U2: { 'atelier-jardin': { libelle: 'Atelier jardin', base: 'activite', couleur: '#4f7d2e', prereglages: { duree: 90, lieu: 'Jardin thérapeutique', accompagnateurs: 1, attente: true } } } } });
      // Démonstration : information du cadre ou de l'administrateur de garde pour un patient en soins libres (Unité 1)
      cfg('alertes', SIC.model.CONFIG_DEFAUT.alertes.map(function (r) {
        return r.declencheur === 'soins-libres' ? Object.assign({}, r, { active: true, services: ['U1'], depuis: now }) : Object.assign({}, r, { depuis: r.active ? now : 0 });
      }));
    }
    cfg('psychiatres', ['Dr Arnaud (fictif)', 'Dr Benoît (fictif)', 'Dr Chen (fictif)', 'Dr Diallo (fictif)']);
    // Liste commune des médecins et module Suivi médical (0.17.0) : somaticien, vacataire, intérimaire ; urgences
    // médico-psychologiques comme lieu de présence sans patient, où compte la garde de jour (fictifs)
    var lundiISO = function (n) { var d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + n); return SIC.model.dateLocaleISO(d.getTime()); };
    // Liste commune des psychologues (0.20.0, fictive) : titulaire, neuropsychologue, intérimaire ; une fiche à confirmer
    if (!(reel && reel.psychologues)) cfg('psychologues', { liste: [
      { id: 'p-martin', nom: 'Mme Martin (fictif)', fonction: 'clinicien', services: [U1], statut: 'titulaire', initiales: 'MM' },
      { id: 'p-leroy', nom: 'M. Leroy (fictif)', fonction: 'neuropsychologue', services: [], statut: 'titulaire' },
      { id: 'p-nguyen', nom: 'Mme Nguyen (fictif)', fonction: 'clinicien', services: [U2], statut: 'interimaire', debut: SIC.model.dateLocaleISO(now - 20 * J), fin: SIC.model.dateLocaleISO(now + 40 * J) },
      { id: 'p-propose', nom: 'Mme Petit (fictif)', fonction: 'clinicien', services: [U1], statut: 'titulaire', aConfirmer: true, propose: { par: 'demo-a', nom: 'Agent A (fictif)', le: new Date(now - 2 * J).toISOString(), service: U1 } }] });
    if (!(reel && reel.medecins)) cfg('medecins', { liste: [
      { id: 'm-arnaud', nom: 'Dr Arnaud (fictif)', fonction: 'psychiatre', services: [U1], statut: 'titulaire', initiales: 'AR' },
      { id: 'm-benoit', nom: 'Dr Benoît (fictif)', fonction: 'psychiatre', services: [U1, U2], statut: 'titulaire' },
      { id: 'm-chen', nom: 'Dr Chen (fictif)', fonction: 'psychiatre', services: [U1], statut: 'vacataire' },
      { id: 'm-diallo', nom: 'Dr Diallo (fictif)', fonction: 'psychiatre', services: [U2], statut: 'titulaire' },
      { id: 'm-esposito', nom: 'Dr Esposito (fictif)', fonction: 'somaticien', services: [U1, U2], statut: 'titulaire' },
      { id: 'm-fontaine', nom: 'Dr Fontaine (fictif)', fonction: 'psychiatre', services: [U1], statut: 'interimaire', debut: lundiISO(-7), fin: lundiISO(11) }] });
    if (!(reel && reel.suiviMedical)) cfg('suiviMedical', { lieux: [{ code: 'UMP', libelle: 'Urgences médico-psychologiques (fictif)' }],
      gardes: [{ code: 'nuit', libelle: 'Garde de nuit', debut: '17:30', fin: '08:30', lieu: '' }, { code: 'jour', libelle: 'Garde de jour', debut: '08:30', fin: '17:30', lieu: 'UMP' },
        { code: 'astreinte', libelle: 'Astreinte', debut: '18:30', fin: '08:30', lieu: '' }] });

    var patients = [
      ['P01', '900101', 'ALPHA', 'Camille', 'SDT', U1, 41],
      ['P02', '900102', 'BRAVO', 'Dominique', 'SPI', U1, 33],
      ['P03', '900103', 'CHARLIE', 'Sacha', 'SL', U1, 48],
      ['P04', '900104', 'DELTA', 'Alix', 'SDRE', U2, 66],
      ['P05', '900105', 'ECHO', 'Noa', 'SDTU', U1, 16],
      ['P06', '900106', 'FOXTROT', 'Eden', 'SDT', U2, 27]
    ];
    patients.forEach(function (p, i) {
      var dn = new Date(now); dn.setFullYear(dn.getFullYear() - p[6]); dn.setMonth((i * 5) % 12, 3 + i * 4);
      if (dn.getTime() > now - p[6] * 365.25 * J) dn.setFullYear(dn.getFullYear() - 1);   // âge révolu = p[6]
      ajouter(t(-24 * 280 + i), 'PATIENT', { patientId: p[0], ipp: p[1], nom: p[2] + ' (fictif)', prenom: p[3], naissance: SIC.model.dateLocaleISO(dn.getTime()), protection: i === 3 ? 'Curatelle' : '', service: p[5] });
      ajouter(t(-24 * 280 + i), 'MODE_HOSPI', { patientId: p[0], mode: p[4], date: t(-24 * 400) });
    });

    // Fiche commune enrichie (0.10.0) : séjours avec chambre et lit, psychologue référent, suivi par l'assistant(e) social(e),
    // référents ; deux patients sortis (récemment, et il y a trois semaines) pour la liste des patients
    var jISO = function (h) { return SIC.model.dateLocaleISO(t(h)); };
    var complements = {
      // Médecins de 1re et 2e ligne (Suivi médical, 0.17.0) : un patient sans médecin de 1re ligne par unité, plusieurs sans 2e ligne
      P01: { chambre: '12', lit: 'P', entree: -24 * 40, psychologue: 'Mme Psy (fictif)', suiviAS: { suivi: true, nom: 'M. Social (fictif)' }, referents: [{ id: null, nom: 'Agent A (fictif)' }], medecin1: 'Dr Arnaud (fictif)', medecin2: 'Dr Benoît (fictif)' },
      P02: { chambre: '14', lit: '', entree: -24 * 35, psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', referents: [{ id: null, nom: 'Agent C (fictif)' }], medecin1: 'Dr Benoît (fictif)', medecin2: 'Dr Arnaud (fictif)' },
      P03: { chambre: '8', lit: 'F', entree: -24 * 60, suiviAS: { suivi: false, nom: '' }, medecin1: 'Dr Chen (fictif)' },
      P04: { chambre: 'A3', lit: '', entree: -24 * 20, psychologue: 'Mme Nguyen (fictif)', psychologueId: 'p-nguyen', suiviAS: { suivi: true, nom: '' }, medecin1: 'Dr Diallo (fictif)', medecin2: 'Dr Benoît (fictif)' },
      P05: { chambre: '10', lit: 'P', entree: -24 * 8, referents: [{ id: null, nom: 'Agent E (fictif)' }], medecin1: '', medecin2: 'Dr Fontaine (fictif)' },
      P06: { chambre: 'A5', lit: '', entree: -24 * 12, medecin1: '' }
    };
    patients.forEach(function (p) {
      var c = complements[p[0]];
      ajouter(t(-24 * 279), 'PATIENT', { patientId: p[0], medecin1: c.medecin1, medecin2: c.medecin2 || '', referents: c.referents || [], psychologue: c.psychologue || '', psychologueId: c.psychologueId || '', suiviAS: c.suiviAS || null });
      ajouter(t(c.entree), 'SEJOUR', { patientId: p[0], sejourId: 'S' + p[0], iep: '7' + p[1], entree: jISO(c.entree), service: p[5], chambre: p[0] === 'P01' ? '18' : c.chambre, lit: c.lit });
    });
    ajouter(t(-24 * 20), 'PATIENT', { patientId: 'P02', protection: 'Curatelle renforcée' });   // mesure de protection dans l'Unité 1 (tableau de transmissions)
    ajouter(t(-24 * 10), 'SEJOUR', { patientId: 'P01', sejourId: 'SP01', chambre: '12', lit: 'P' });   // changement de chambre (historique des lits, 0.29.0)
    [['P07', '900107', 'GOLF', 'Ilan', 'SL', U1, 52, -24 * 15, -24 * 3, '6'], ['P08', '900108', 'HOTEL', 'Maé', 'SDT', U1, 29, -24 * 50, -24 * 21, '3']].forEach(function (p) {
      ajouter(t(p[7]), 'PATIENT', { patientId: p[0], ipp: p[1], nom: p[2] + ' (fictif)', prenom: p[3], naissance: SIC.model.dateLocaleISO(now - p[6] * 365.25 * J - 40 * J), service: p[5], medecin1: 'Dr Arnaud (fictif)' });
      ajouter(t(p[7]), 'MODE_HOSPI', { patientId: p[0], mode: p[4], date: t(p[7]) });
      ajouter(t(p[8]), 'SEJOUR', { patientId: p[0], sejourId: 'S' + p[0], iep: '7' + p[1], entree: jISO(p[7]), sortie: jISO(p[8]), service: p[5], chambre: p[9] });
    });
    // Données complémentaires (fictives)
    [['P01', 'sorties-libres', false], ['P03', 'sorties-libres', true], ['P05', 'sorties-libres', true], ['P01', 'educateur', { id: null, nom: 'M. Éducateur (fictif)' }],
      ['P02', 'repas', 'Couscous'], ['P03', 'repas', 'Végétarien'], ['P04', 'educateur', { id: null, nom: 'Mme Éducatrice (fictif)' }]].forEach(function (x) {
      ajouter(t(-24 * 5), 'COMPLEMENT', { patientId: x[0], champ: x[1], valeur: x[2] });
    });
    // Données ajoutées (0.18.0, fictives) : téléphone d'un proche, activités, démarches en notes (dont une retirée), check-list
    // d'entrée en cours, projet de sortie (rangé dans le Suivi médical), téléphone et jours de présence d'un médecin ;
    // sorties prévisionnelles (date, période, précision seule) gardées avec le séjour
    if (!reel) {
      ajouter(t(-24 * 5), 'COMPLEMENT', { patientId: 'P01', champ: 'tel-proche', valeur: '06 00 00 00 01' });
      ajouter(t(-24 * 5), 'COMPLEMENT', { patientId: 'P01', champ: 'activites', valeur: ['Piscine', 'Musique'] });
      ajouter(t(-24 * 3), 'COMPLEMENT', { patientId: 'P01', champ: 'consignes', valeur: ['Repas en chambre', 'Temps en chambre de 17 h à 18 h'] });
      ajouter(t(-24 * 3), 'COMPLEMENT', { patientId: 'P03', champ: 'consignes', valeur: ['Sorties accompagnées', 'Téléphone à la demande'] });
      ajouter(t(-24 * 2), 'COMPLEMENT', { patientId: 'P03', champ: 'consignes-precisions', valeur: 'Appel à la famille le soir après 19 h (fictif)' });
      ajouter(t(-24 * 1), 'COMPLEMENT', { patientId: 'P05', champ: 'consignes', valeur: ['Visites en salle des familles'] });
      ajouter(t(-24 * 5), 'COMPLEMENT', { patientId: 'P03', champ: 'activites', valeur: ['Jardin'] });
      ajouter(t(-24 * 4), 'COMPLEMENT', { patientId: 'P01', champ: 'demarches', op: { ajout: { id: 'nd1', texte: 'Dossier MDPH à compléter (fictif)', importance: 'important' } } });
      ajouter(t(-24 * 3), 'COMPLEMENT', { patientId: 'P01', champ: 'demarches', op: { ajout: { id: 'nd2t', texte: 'La sœur signale des difficultés de logement (fictif)', importance: 'info', tiers: true } } });   // information d'un tiers (0.32.0)
      ajouter(t(-24 * 2), 'COMPLEMENT', { patientId: 'P01', champ: 'demarches', op: { ajout: { id: 'nd2', texte: 'Rendez-vous banque jeudi (fictif)', importance: 'info' } } });
      ajouter(t(-24 * 3), 'COMPLEMENT', { patientId: 'P02', champ: 'demarches', op: { ajout: { id: 'nd3', texte: 'Appeler le mandataire avant vendredi (fictif)', importance: 'urgent' } } });
      ajouter(t(-24 * 6), 'COMPLEMENT', { patientId: 'P03', champ: 'demarches', op: { ajout: { id: 'nd4', texte: 'Carte vitale retrouvée (fictif)', importance: 'info' } } });
      ajouter(t(-24 * 1), 'COMPLEMENT', { patientId: 'P03', champ: 'demarches', op: { retrait: 'nd4' } });
      ['inventaire', 'livret', 'droits'].forEach(function (k) { ajouter(t(-24 * 8 + 1), 'COMPLEMENT', { patientId: 'P05', champ: 'accueil', op: { cocher: { element: k, fait: true } } }); });
      ajouter(t(-24 * 8 + 2), 'COMPLEMENT', { patientId: 'P05', champ: 'accueil', op: { ajout: { id: 'ea1', libelle: 'Autorisation parentale de sortie (fictif)' } } });
      ajouter(t(-24 * 40 + 2), 'COMPLEMENT', { patientId: 'P01', champ: 'accueil', op: { cocher: { element: 'inventaire', fait: true } } });
      ajouter(t(-24 * 2), 'VALEUR', { entite: 'patient', id: 'P03', champ: 'projet-sortie', valeur: 'Retour à domicile avec suivi CMP (fictif)', journal: 'suivi' });
      ajouter(t(-24 * 2), 'VALEUR', { entite: 'patient', id: 'P04', champ: 'projet-sortie', valeur: 'Orientation en appartement thérapeutique (fictif)', journal: 'suivi' });
      ajouter(t(-24 * 30), 'VALEUR', { entite: 'medecin', id: 'm-arnaud', champ: 'tel-pro', valeur: '01 00 00 00 11', journal: 'suivi' });
      ajouter(t(-24 * 30), 'VALEUR', { entite: 'medecin', id: 'm-benoit', champ: 'tel-pro', valeur: '01 00 00 00 12', journal: 'suivi' });
      ajouter(t(-24 * 30), 'VALEUR', { entite: 'medecin', id: 'm-arnaud', champ: 'jours-presence', valeur: ['Lundi', 'Mardi', 'Jeudi'], journal: 'suivi' });
    }
    // Professionnels ou structures participant à la prise en charge (0.21.0) : répertoire commun et fiches des patients ;
    // l'agenda en tire des tâches suggérées (ex. « Appeler l'infirmier libéral » avant une sortie ou une permission)
    [['IV001', 'idel', 'Cabinet infirmier du Centre (fictif)', '02 00 00 00 01', 'Passages matin et soir ; prévenir 48 h avant'],
      ['IV002', 'foyer', 'Foyer Les Tilleuls (fictif)', '02 00 00 00 02', 'Référente : éducatrice du foyer (fictif)'],
      ['IV003', 'hdj', 'Hôpital de jour du secteur (fictif)', '02 00 00 00 03', ''],
      ['IV004', 'cmp', 'Centre médico-psychologique du secteur (fictif)', '02 00 00 00 04', '']].forEach(function (i) {
      ajouter(t(-24 * 20), 'INTERVENANT', { id: i[0], type: i[1], nom: i[2], contact: i[3], commentaire: i[4], champs: {} });
    });
    [['P03', 'IV001', 'Prévenir le cabinet de la date de sortie'], ['P03', 'IV004', ''], ['P01', 'IV002', ''], ['P01', 'IV003', 'Mardi et jeudi'], ['P05', 'IV001', '']].forEach(function (l, i) {
      // Information d'un tiers (0.32.0) : le foyer de P01, signalé par la famille, exclu du droit d'accès
      ajouter(t(-24 * 19), 'PRISE_EN_CHARGE', { patientId: l[0], lien: 'LD' + i, intervenant: l[1], commentaire: l[2], tiers: l[0] === 'P01' && l[1] === 'IV002' });
    });
    // Sorties (0.21.0) : une sortie actée (date et heure arrêtées avec le patient), une envisagée en fourchette, une approximation seule
    ajouter(t(-24 * 3), 'SEJOUR', { patientId: 'P03', sejourId: 'SP03', sortiePrevue: { etat: 'actee', debut: jISO(24 * 3), heure: '11:00' } });
    ajouter(t(-24 * 2), 'SEJOUR', { patientId: 'P01', sejourId: 'SP01', sortiePrevue: { debut: jISO(24 * 6), fin: jISO(24 * 10), precision: 'après la synthèse (fictif)' } });
    ajouter(t(-24 * 1), 'SEJOUR', { patientId: 'P04', sejourId: 'SP04', sortiePrevue: { precision: 'selon place en appartement thérapeutique (fictif)' } });
    // Plan du service (0.29.1) : placements temporaires, chambre gardée (CSI en chambre ouverte dans l'Unité 2, alors
    // qu'une mesure y est en cours : point à régler signalé ; espace d'apaisement dans l'Unité 1) ; les patients en mesure
    // apparaissent dans leur CSI et, estompés, dans leur chambre
    ajouter(t(-3), 'SEJOUR', { patientId: 'P06', sejourId: 'SP06', placement: { piece: 'CSI A' } });
    ajouter(t(-1), 'SEJOUR', { patientId: 'P05', sejourId: 'SP05', placement: { piece: 'Espace d’apaisement' } });
    // Rappel : P01 soins sans consentement (SDT), P03 soins libres, P04 SDRE (Unité 2)

    var nMes = 0;
    function mesure(patientId, service, type, debutH, finH, lieu, psy, opts) {
      opts = opts || {};
      var id = 'M' + String(++nMes).padStart(3, '0');
      var csi = lieu.indexOf('Chambre ') !== 0;   // les lieux hors CSI sont écrits « Chambre n »
      ajouter(t(debutH), 'MESURE_DEBUT', { mesureId: id, patientId: patientId, service: service, typeMesure: type, debut: t(debutH), lieu: csi ? lieu : 'Chambre ' + lieu.replace(/^Chambre /, ''), csi: csi, psychiatre: psy, exception: !!opts.exception, modeHospi: '' });
      if (opts.tiers) ajouter(t(debutH + 1), 'TIERS', { mesureId: id, cycle: 1, statut: opts.tiers, personne: opts.personne || '', informateur: opts.informateur || 'PSYCHIATRE', nomInformateur: opts.informateur === 'IDE' ? '' : psy, date: t(debutH + 1) });
      (opts.jld || []).forEach(function (j) { ajouter(t(j[2]), 'JLD', { mesureId: id, cycle: j[0], nature: j[1], date: t(j[2]), decision: j[3] || null }); });
      (opts.pauses || []).forEach(function (pz) {
        ajouter(t(pz[0]), 'PAUSE', { mesureId: id, debut: t(pz[0]), reprisePrevue: t(pz[1]), psychiatre: psy, motif: pz[3] || '' });
        if (pz[2] !== null) ajouter(t(pz[2]), 'REPRISE', { mesureId: id, date: t(pz[2]) });
      });
      if (finH !== null) ajouter(t(finH), 'MESURE_FIN', { mesureId: id, fin: t(finH), psychiatre: psy });
      return id;
    }

    // Historique de l'année (registre) — Unité 1
    var debutAnnee = (new Date(new Date(now).getFullYear(), 0, 1).getTime() - now) / H;
    var hist = Math.min(-24 * 20, debutAnnee + 24 * 20);
    mesure('P03', U1, 'Isolement', hist, hist + 18, CSI1, 'Dr Arnaud (fictif)', { tiers: 'INFORME', personne: 'Mère' });
    mesure('P02', U1, 'Isolement', hist + 24 * 30, hist + 24 * 31 + 6, CSI2, 'Dr Benoît (fictif)', { tiers: 'TENTATIVE', informateur: 'IDE' });
    mesure('P02', U1, 'Contention', hist + 24 * 30 + 4, hist + 24 * 30 + 10, CSI2, 'Dr Benoît (fictif)', { tiers: 'INFORME', personne: 'Frère' });
    mesure('P05', U1, 'Contention', hist + 24 * 60, hist + 24 * 60 + 3, 'Chambre 12', 'Dr Chen (fictif)', { exception: true, tiers: 'PAS_DE_TIERS' });
    mesure('P01', U1, 'Isolement', hist + 24 * 90, hist + 24 * 90 + 9, 'Chambre 8', 'Dr Arnaud (fictif)', { tiers: 'REFUS_PATIENT' });

    // Mesures récentes
    // ALPHA : isolement terminé il y a 10 jours (20 h), puis isolement en cours depuis 60 h
    mesure('P01', U1, 'Isolement', -24 * 10 - 20, -24 * 10, CSI1, 'Dr Arnaud (fictif)', { tiers: 'INFORME', personne: 'Sœur' });
    mesure('P01', U1, 'Isolement', -60, null, CSI1, 'Dr Arnaud (fictif)', {
      tiers: 'INFORME', personne: 'Sœur',
      jld: [[1, 'INFO', -33], [1, 'SAISINE', -10]],
      pauses: [[-28, -27, -27, 'Repas'], [-8, -7.5, -7.25, 'Hygiène, douche']]
    });
    // BRAVO : isolement depuis 26 h, contention en CSI depuis 20 h
    mesure('P02', U1, 'Isolement', -26, null, CSI2, 'Dr Benoît (fictif)', { tiers: 'INFORME', personne: 'Frère' });
    mesure('P02', U1, 'Contention', -20, null, CSI2, 'Dr Benoît (fictif)');
    // CHARLIE : isolement hors CSI terminé il y a 3 jours
    mesure('P03', U1, 'Isolement', -24 * 3 - 10, -24 * 3, 'Chambre 14', 'Dr Chen (fictif)', { tiers: 'PAS_DE_TIERS' });
    // DELTA (Unité 2) : isolement long, maintien du JLD au cycle 1
    mesure('P04', U2, 'Isolement', -110, null, CSIA, 'Dr Diallo (fictif)', {
      tiers: 'INFORME', personne: 'Curateur',
      jld: [[1, 'INFO', -64], [1, 'SAISINE', -40], [1, 'DECISION', -16, 'MAINTIEN']],
      pauses: [[-0.75, 1.25, null, 'Visite']]
    });

    // Professionnels en CSI — Unité 1, derniers postes (certains incomplets)
    var noms = [['Agent A (fictif)', 'IDE'], ['Agent B (fictif)', 'AS'], ['Agent C (fictif)', 'IDE'], ['Agent D (fictif)', 'AS'], ['Agent E (fictif)', 'IDE']];
    for (var jour = 2; jour >= 0; jour--) {
      var d = new Date(now - jour * J);
      var dateISO = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      periodes.forEach(function (p, i) {
        var debutPoste = new Date(d.getFullYear(), d.getMonth(), d.getDate(), p[1]).getTime();
        if (debutPoste > now - 2 * H) return;
        var nb = (jour === 0 && i > 0) ? 1 : 2;
        for (var k = 0; k < nb; k++) {
          var a = noms[(jour * 3 + i + k) % noms.length];
          ajouter(debutPoste + H + k * 60000, 'PROFESSIONNEL', { service: U1, date: dateISO, periode: p[0], nom: a[0], fonction: a[1] });
        }
      });
    }

    // ------------------------------------------------------------ Agenda (0.10.0) : un exemple de chaque cas de figure
    var minuitAuj = new Date(now); minuitAuj.setHours(0, 0, 0, 0);
    var jour = function (n, heure, minute) { var d = new Date(minuitAuj.getTime()); d.setDate(d.getDate() + n); d.setHours(heure || 0, minute || 0, 0, 0); return d.getTime(); };
    var lundi = (function () { var d = new Date(minuitAuj.getTime()); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; })();
    var lundiDe = function (n, heure, minute) { var d = new Date(lundi.getTime()); d.setDate(d.getDate() + n); d.setHours(heure || 0, minute || 0, 0, 0); return d.getTime(); };
    var avant = t(-24 * 3), nR = 0;
    function rdv(d) { d.id = 'RD' + String(++nR).padStart(3, '0'); ajouter(avant, 'RDV', d); return d.id; }
    var profA = { id: null, nom: 'Agent A (fictif)' }, profC = { id: null, nom: 'Agent C (fictif)' };
    // Réunions répétées : chaque jour ouvré, chaque lundi, le 1er mardi du mois
    rdv({ nature: 'reunion', titre: 'Transmissions', debut: lundiDe(-14, 9), fin: lundiDe(-14, 9, 30), lieu: 'Salle de soins', service: U1, regularite: { type: 'semaine', jours: [1, 2, 3, 4, 5] } });
    rdv({ nature: 'reunion', titre: 'Synthèse clinique', debut: lundiDe(-14, 14), fin: lundiDe(-14, 15), lieu: 'Salle de réunion', service: U1, regularite: { type: 'semaine', jours: [1] } });
    rdv({ nature: 'reunion', titre: 'Réunion institutionnelle', debut: lundiDe(-35, 14), fin: lundiDe(-35, 15, 30), lieu: 'Salle de réunion', service: U1, regularite: { type: 'rangPeriode', rang: 1, jour: 2, periode: 'mois' } });
    rdv({ nature: 'reunion', titre: 'Réunion de pôle', debut: lundiDe(-100, 10), fin: lundiDe(-100, 12), lieu: 'Salle du pôle (fictive)', service: U1, regularite: { type: 'rangPeriode', rang: 1, jour: 4, periode: 'trimestre' } });
    // Accompagnement avec un accompagnateur à trouver (bouton « S'inscrire »)
    rdv({ nature: 'accompagnement', titre: 'Consultation extérieure', debut: jour(1, 10), fin: jour(1, 12), lieu: 'Hôpital général (fictif)', service: U1, patients: ['P03'], accompagnateurs: 1 });
    // Activité répétée mardi et vendredi, deux accompagnateurs, un agent déjà inscrit cette semaine
    var piscine = rdv({ nature: 'activite', titre: 'Piscine', debut: lundiDe(-6, 14), fin: lundiDe(-6, 16), lieu: 'Piscine municipale (fictive)', service: U1, patients: ['P01', 'P05'], accompagnateurs: 2, consigneAccompagnateurs: '1 IDE et 1 AS de préférence', regularite: { type: 'semaine', jours: [2, 5] } });
    ajouter(avant, 'INSCRIPTION', { rdv: piscine, occurrence: SIC.model.dateLocaleISO(lundiDe(1, 12)), agent: 'demo-b', nom: 'Agent B (fictif)', service: U1 });
    // « Quel(s) professionnel(s) ? » et « Quel(s) patient(s) ? » (0.21.0) :
    // - sortie avec exactement 3 professionnels (un désigné), inscription libre, liste d'attente ; 3 à 4 patients, un en attente
    var marche = rdv({ nature: 'accompagnement', titre: 'Marché de Noël (fictif)', debut: jour(3, 9, 30), fin: jour(3, 12), lieu: 'Centre-ville (fictif)', service: U1, patients: ['P01', 'P02', 'P03', 'P05', 'P07'], professionnels: [profA],
      participation: { mode: 'exact', nombre: 3, libre: true, patientsMin: 3, patientsMax: 4 }, consigneAccompagnateurs: '1 IDE au moins' });
    var occMarche = SIC.model.dateLocaleISO(jour(3));
    ['demo-b', 'demo-c', 'demo-d'].forEach(function (id, i) { ajouter(avant + i * 6e4, 'INSCRIPTION', { rdv: marche, occurrence: occMarche, agent: id, nom: 'Agent ' + id.slice(-1).toUpperCase() + ' (fictif)', etat: 'inscrit', service: U1 }); });
    // - activité où il manque des patients (au moins 4), inscription à confirmer : une demande à confirmer, un collègue proposé sans réponse
    var relax = rdv({ nature: 'activite', titre: 'Relaxation', debut: jour(2, 10), fin: jour(2, 11), lieu: 'Salle d’activités', service: U1, patients: ['P02', 'P05'],
      participation: { mode: 'min', nombre: 2, max: 3, aConfirmer: true, patientsMin: 4 } });
    ajouter(avant, 'INSCRIPTION', { rdv: relax, occurrence: SIC.model.dateLocaleISO(jour(2)), agent: 'demo-c', nom: 'Agent C (fictif)', etat: 'demande', service: U1 });
    ajouter(avant, 'INSCRIPTION', { rdv: relax, occurrence: SIC.model.dateLocaleISO(jour(2)), agent: 'demo-b', nom: 'Agent B (fictif)', etat: 'propose', service: U1 });
    // - réunion sur invitation (un groupe d'agents et un rôle), deux places : l'agent connecté y est invité
    rdv({ nature: 'reunion', titre: 'Groupe de travail : accueil des familles', debut: jour(4, 14), fin: jour(4, 15), lieu: 'Salle de réunion', service: U1,
      participation: { mode: 'exact', nombre: 2, invites: [{ t: 'groupe', id: 'equipe-jour-u1', nom: 'Équipe de jour' }, { t: 'role', id: 'CADRE', nom: 'Cadre de santé' }] } });
    // - événements de plusieurs services (0.21.0) : l'Unité 2 invitée (elle inscrit ses patients et ses agents) ; l'Unité 1 co-organisatrice
    rdv({ nature: 'activite', titre: 'Tournoi de pétanque inter-unités (fictif)', debut: jour(5, 14), fin: jour(5, 16), lieu: 'Parc de l’établissement', service: U1, services: [U2], partage: 'invites', patients: ['P01', 'P03', 'P04'],
      participation: { mode: 'min', nombre: 3, libre: true, patientsMax: 8 } });
    rdv({ nature: 'reunion', titre: 'Réunion des deux unités', debut: jour(6, 11), fin: jour(6, 12), lieu: 'Salle du pôle (fictive)', service: U2, services: [U1], partage: 'co' });
    rdv({ nature: 'activite', titre: 'Atelier terre', debut: lundiDe(2, 10, 30), fin: lundiDe(2, 11, 30), lieu: 'Salle d’activités', service: U1, patients: ['P01', 'P02', 'P05'], professionnels: [profC], regularite: { type: 'semaine', jours: [3], intervalle: 2 } });
    // Activité sans patient inscrit pour l'instant (transparente, réglage de démonstration)
    rdv({ nature: 'activite', titre: 'Atelier cuisine', debut: jour(2, 15), fin: jour(2, 17), lieu: 'Cuisine thérapeutique', service: U1, patients: [], accompagnateurs: 1 });
    rdv({ nature: 'consultation-dentaire', examen: { type: 'Soins dentaires' }, titre: '', debut: jour(1, 14), fin: jour(1, 14, 45), lieu: 'Cabinet dentaire (fictif)', service: U1, patients: ['P05'], accompagnateurs: 1, transports: [{ id: 'tx', type: 'taxi', nombre: 1 }] });
    rdv({ nature: 'atelier-jardin', titre: '', debut: jour(3, 10), fin: jour(3, 11, 30), lieu: 'Jardin thérapeutique', service: U2, patients: [], accompagnateurs: 1 });
    // Entretiens : médical avec la famille (deux professionnels), infirmier individuel
    rdv({ nature: 'entretien', entretien: { type: 'medical', avec: 'famille' }, titre: '', debut: jour(1, 11), fin: jour(1, 12), lieu: 'Bureau médical', service: U1, patients: ['P01'], professionnels: [{ id: null, nom: 'Dr Arnaud (fictif)' }, profA] });
    rdv({ nature: 'entretien', entretien: { type: 'infirmier', avec: 'individuel' }, titre: '', debut: jour(0, 15), fin: jour(0, 15, 45), lieu: 'Bureau infirmier', service: U1, patients: ['P05'], professionnels: [profC] });
    // Permissions : demande d'un patient en SDRE (validation 48 h avant), demande en SDT, permission de week-end validée
    // Étapes de validation (0.21.0) : SDRE, certificat envoyé puis demande d'un 2e avis par l'ARS (retour à « certificat
    // en attente de signature », délai de 48 h dépassé) ; SDT, validation orale obtenue, certificat à faire signer
    // Jours gardés dans la semaine affichée (vérification à l'écran quel que soit le jour du lancement)
    var resteSemaine = (7 - new Date(now).getDay()) % 7, jSdre = Math.max(1, Math.min(2, resteSemaine)), jSdt = Math.max(1, Math.min(4, resteSemaine));
    var permSdre = rdv({ nature: 'permission', titre: '', debut: jour(jSdre, 14), fin: jour(jSdre, 18), service: U2, patients: ['P04'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    [['orale'], ['asigner'], ['envoye'], ['asigner', 'avis', 'Demande d’un 2e avis : avis d’un second psychiatre attendu (fictif)']].forEach(function (e, i) {
      ajouter(avant + (i + 1) * 6e4, 'VALIDATION', { rdv: permSdre, validation: 'pv', occurrence: SIC.model.dateLocaleISO(jour(jSdre)), statut: 'etape', etape: e[0], processus: 'sdre', retourARS: e[1], mention: e[2], service: U2 });
    });
    var permSdt = rdv({ nature: 'permission', titre: 'Permission en famille', debut: jour(jSdt, 10), fin: jour(jSdt, 17), service: U1, patients: ['P01'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    ajouter(avant + 6e4, 'VALIDATION', { rdv: permSdt, validation: 'pv', occurrence: SIC.model.dateLocaleISO(jour(jSdt)), statut: 'etape', etape: 'orale', processus: 'contrainte', service: U1 });
    var samedi = (6 - new Date(now).getDay() + 7) % 7 || 7;
    var permWe = rdv({ nature: 'permission', titre: 'Permission de week-end', debut: jour(samedi, 10), fin: jour(samedi + 1, 18), service: U2, patients: ['P06'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    ajouter(avant, 'VALIDATION', { rdv: permWe, validation: 'pv', occurrence: SIC.model.dateLocaleISO(jour(samedi)), statut: 'validee', nom: 'Dr Diallo (fictif)', service: U2 });
    // Examen (VSL à réserver, patient accompagné) ; audience JLD (deux patients, deux VSL réservés, soignants à prévoir)
    rdv({ nature: 'examen', examen: { type: 'Scanner' }, titre: '', debut: jour(2, 9, 30), fin: jour(2, 11), lieu: 'Hôpital général (fictif), imagerie', service: U1, patients: ['P02'], accompagnateurs: 1, transports: [{ id: 'tv', type: 'vsl', nombre: 1, precision: 'Aller-retour' }] });
    // Audience JLD chaque mercredi 9 h 30 - 12 h (réglages propres à chaque date : patients, VSL, accompagnateurs ; une date
    // décalée, une date annulée faute de patient convoqué ; sans patient prévu, la date s'affiche en transparence)
    var mercredi = function (n) { return lundiDe(2 + 7 * n); };
    var audience = rdv({ nature: 'audience', titre: '', debut: lundiDe(-12, 9, 30), fin: lundiDe(-12, 12), lieu: 'Salle d’audience de l’hôpital (fictive)', service: U1, patients: [], accompagnateurs: 1, transports: [], regularite: { type: 'semaine', jours: [3] } });
    var occ1 = SIC.model.dateLocaleISO(mercredi(1)), occ2 = SIC.model.dateLocaleISO(mercredi(2)), occ3 = SIC.model.dateLocaleISO(mercredi(3));
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ1, patients: ['P01', 'P02'], accompagnateurs: 2, professionnels: [profA], transports: [{ id: 'ta', type: 'vsl', nombre: 2, precision: 'Départ 9 h' }], service: U1 });
    ajouter(avant, 'TRANSPORT', { rdv: audience, transport: 'ta', occurrence: occ1, statut: 'reserve', precision: 'Ambulances du centre (fictif), n° 1234', service: U1 });
    if (options.moi && options.moi.id) ajouter(avant, 'INSCRIPTION', { rdv: audience, occurrence: occ1, agent: options.moi.id, nom: options.moi.nom || '', service: U1 });
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ2, annulee: true, motifAnnulation: 'Aucun patient convoqué', service: U1 });
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ3, debut: mercredi(3) + 864e5 + 14 * 36e5, fin: mercredi(3) + 864e5 + 16 * 36e5, patients: ['P04'], transports: [{ id: 'tb', type: 'vsl', nombre: 1 }], service: U1 });
    // Demandes de travaux (0.22.0) : une urgence immédiate, une chambre indisponible avec intervention programmée (agenda,
    // places disponibles), une réalisée à confirmer (l'agent connecté, auteur, en est informé), une confirmée récemment
    // (en grisé), une rouverte, un doublon, un refus, une ancienne (historique seulement), une en Unité 2
    (function () {
      var moiT = options.moi && options.moi.id, nT = 0;
      function dt(h0, d, by) { d.id = 'TR' + String(++nT).padStart(3, '0'); d.service = d.service || U1; ajouter(t(h0), 'TRAVAUX', d, by); return d.id; }
      function et(h0, id, d, svc) { ajouter(t(h0), 'TRAVAUX_ETAPE', Object.assign({ demande: id, service: svc || U1 }, d)); }
      function cf(h0, id, d) { ajouter(t(h0), 'TRAVAUX_CONFIRMATION', Object.assign({ demande: id, service: U1 }, d)); }
      function com(h0, id, texte, by) { ajouter(t(h0), 'TRAVAUX_COMMENTAIRE', { demande: id, id: 'K' + nT + '-' + h0, texte: texte, service: U1 }, by); }
      var jH = function (n) { return jISO(24 * n); };
      var ancienne = dt(-24 * 70, { type: 'menuiserie', lieu: 'salon', gravite: 'gene', urgence: 'non', description: 'Porte de placard qui ne ferme plus (fictif)', nom: 'Agent A (fictif)' });
      et(-24 * 65, ancienne, { etape: 'realisee' }); cf(-24 * 64, ancienne, {});
      var refus = dt(-24 * 20, { type: 'mobilier', lieu: 'office', gravite: 'gene', urgence: 'non', description: 'Demande d’un second réfrigérateur pour l’office (fictif)', nom: 'Agent C (fictif)' });
      et(-24 * 19, refus, { etape: 'transmise', reference: 'BT-2026-0398 (fictif)' }); et(-24 * 15, refus, { etape: 'refusee', motif: 'Relève d’une demande d’équipement, pas de travaux (fictif)' });
      var confirmee = dt(-24 * 9, { type: 'menuiserie', lieu: 'chambre', chambre: '5', gravite: 'degradation', urgence: 'non', description: 'Poignée de fenêtre cassée (fictif)', nom: 'Agent B (fictif)' });
      et(-24 * 8, confirmee, { etape: 'transmise', reference: '' }); et(-24 * 6, confirmee, { etape: 'realisee' }); cf(-24 * 5, confirmee, {});
      var rouverte = dt(-24 * 12, { type: 'chauffage', lieu: 'salon', gravite: 'gene', urgence: 'non', description: 'Radiateur froid côté fenêtre (fictif)', nom: 'Agent A (fictif)' });
      et(-24 * 11, rouverte, { etape: 'transmise', reference: 'BT-2026-0402 (fictif)' }); et(-24 * 7, rouverte, { etape: 'realisee' });
      cf(-24 * 3, rouverte, { rouvrir: true, motif: 'Le radiateur est de nouveau froid (fictif)' });
      com(-24 * 2, rouverte, 'Les services techniques passent à nouveau cette semaine (fictif).');
      var fuite = dt(-24 * 4, { type: 'plomberie', lieu: 'chambre', chambre: '12', precisionLieu: 'lavabo', gravite: 'degradation', urgence: 'non', description: 'Fuite d’eau sous le lavabo ; le sol reste mouillé (fictif)', chambreIndisponible: true, lits: 1, nom: 'Agent C (fictif)' });
      et(-24 * 3, fuite, { etape: 'transmise', reference: 'BT-2026-0412 (fictif)' }); et(-24 * 2, fuite, { etape: 'programmee', date: jH(2) });
      com(-24 * 2, fuite, 'Patient changé de chambre en attendant (fictif).');
      var doublon = dt(-24 * 3, { type: 'plomberie', lieu: 'chambre', chambre: '12', gravite: 'degradation', urgence: 'non', description: 'Lavabo qui fuit (fictif)', nom: 'Agent D (fictif)' });
      et(-24 * 3 + 2, doublon, { etape: 'doublon', doublonDe: fuite });
      var serrure = dt(-24 * 5, { type: 'serrurerie', lieu: 'office', gravite: 'degradation', urgence: 'non', description: 'La serrure de l’office accroche, la clé force (fictif)', nom: (options.moi && options.moi.nom) || 'Agent (fictif)' }, moiT || undefined);
      et(-24 * 4, serrure, { etape: 'transmise', reference: '' }); et(-20, serrure, { etape: 'realisee' });
      dt(-3, { type: 'electricite', lieu: 'soins', precisionLieu: 'prise près du chariot', gravite: 'danger', urgence: 'immediate', description: 'Prise murale arrachée, fils apparents ; zone balisée (fictif)', nom: 'Agent B (fictif)' });
      var u2 = dt(-24 * 2, { service: U2, type: 'informatique', lieu: 'medical', gravite: 'gene', urgence: 'non', description: 'Imprimante du bureau médical hors service (fictif)', nom: 'Agent D (fictif)' });
      et(-24 * 1, u2, { etape: 'transmise', reference: 'INFO-7781 (fictif)' }, U2);
    })();

    // Véhicules de l'établissement (0.14.0) : trois véhicules fictifs, un prêt, une mise à disposition, réservations directes
    // et depuis l'agenda (une réservée, une à réserver), signalements en cours et fait
    var vh = function (d) { ajouter(t(-24 * 60), 'VEHICULE', d); return d.id; };
    var clio = vh({ id: 'VH001', nom: 'Citadine blanche (fictif)', type: 'automobile', immatriculation: 'XX-001-XX', places: 5, parking: 'Parking P2, place 14 (fictif)', service: U1, actif: true,
      precision: 'Clés au bureau infirmier', complements: { 'carte-carburant': true, revision: SIC.model.dateLocaleISO(jour(40)) } });
    var minibus = vh({ id: 'VH002', nom: 'Minibus 9 places (fictif)', type: 'minibus', immatriculation: 'XX-002-XX', places: 9, parking: 'Parking du pôle (fictif)', service: U1, actif: true, complements: { 'carte-carburant': true, equipement: 'Galerie de toit' } });
    var adapte = vh({ id: 'VH003', nom: 'Ludospace adapté (fictif)', type: 'adapte', immatriculation: 'XX-003-XX', places: 4, parking: 'Parking P1 (fictif)', service: U2, actif: true, complements: { equipement: 'Rampe d’accès' } });
    ajouter(t(-24 * 2), 'PRET', { id: 'PR001', vehicule: adapte, mode: 'partage', services: [U1], debut: SIC.model.dateLocaleISO(jour(0)), fin: SIC.model.dateLocaleISO(jour(14)), motif: 'Pendant les travaux du parking (fictif)' });
    ajouter(t(-24 * 2), 'PRET', { id: 'PR002', vehicule: minibus, mode: 'pret', services: [U2], debut: SIC.model.dateLocaleISO(jour(5)), fin: SIC.model.dateLocaleISO(jour(6)), motif: 'Séjour thérapeutique de l’Unité 2 (fictif)' });
    var resa = function (d) { ajouter(avant, 'RESERVATION', Object.assign({ agent: 'demo-b', nom: 'Agent B (fictif)' }, d)); };
    resa({ id: 'RV001', vehicule: clio, debut: jour(-2, 14), fin: jour(-2, 16), service: U1, motif: 'Achats pour l’atelier cuisine' });
    resa({ id: 'RV002', vehicule: clio, debut: jour(2, 13, 30), fin: jour(2, 15), service: U1, motif: 'Achats pour l’atelier cuisine' });
    resa({ id: 'RV003', vehicule: adapte, debut: jour(1, 9), fin: jour(1, 12), service: U2, motif: 'Rendez-vous extérieur', agent: 'demo-d', nom: 'Agent D (fictif)' });
    var marche = rdv({ nature: 'activite', titre: 'Sortie au marché', debut: jour(1, 9), fin: jour(1, 11, 30), lieu: 'Marché du centre-ville (fictif)', service: U1, patients: ['P01', 'P05'], accompagnateurs: 1, consigneAccompagnateurs: 'Un éducateur ou un AS du matin', professionnels: [profC],
      transports: [{ id: 'tm', type: 'vehicule', nombre: 1, vehicule: minibus }] });
    resa({ id: 'RV004', vehicule: minibus, debut: jour(1, 9), fin: jour(1, 11, 30), service: U1, motif: 'Agenda : Activité', lien: { rdv: marche, occurrence: SIC.model.dateLocaleISO(jour(1)), transport: 'tm' } });
    ajouter(avant, 'TRANSPORT', { rdv: marche, transport: 'tm', occurrence: SIC.model.dateLocaleISO(jour(1)), statut: 'reserve', precision: 'Minibus 9 places (fictif) (XX-002-XX)', service: U1 });
    rdv({ nature: 'accompagnement', titre: 'Démarches à la mairie', debut: jour(4, 14), fin: jour(4, 16), lieu: 'Mairie (fictif)', service: U1, patients: ['P02'], accompagnateurs: 1, transports: [{ id: 'tc', type: 'vehicule', nombre: 1, vehicule: clio }] });
    // Pré-réservations : une en cours (le véhicule reste réservable : la démarche à la mairie ci-dessus le montre), une
    // remplacée par une réservation forcée (information de l'auteur, du cadre et de la secrétaire)
    resa({ id: 'RV005', statut: 'pre', vehicule: clio, debut: jour(4, 13), fin: jour(4, 17), service: U1, motif: 'Visite à domicile, à confirmer', agent: 'demo-d', nom: 'Agent D (fictif)' });
    resa({ id: 'RV006', statut: 'pre', vehicule: minibus, debut: jour(2, 10), fin: jour(2, 12), service: U1, motif: 'Sortie au parc, à confirmer', agent: 'demo-d', nom: 'Agent D (fictif)' });
    ajouter(t(-10), 'RESERVATION', { id: 'RV007', statut: 'ferme', vehicule: minibus, debut: jour(2, 9, 30), fin: jour(2, 12), service: U1, motif: 'Rendez-vous extérieur', agent: 'demo-b', nom: 'Agent B (fictif)', supplante: ['RV006'] });
    ajouter(t(-20), 'SIGNALEMENT', { id: 'SG001', vehicule: clio, type: 'plein', texte: 'Reste un quart du réservoir' });
    ajouter(t(-30), 'SIGNALEMENT', { id: 'SG002', vehicule: minibus, type: 'voyant', texte: 'Voyant orange de pression des pneus' });
    ajouter(t(-24 * 4), 'SIGNALEMENT', { id: 'SG003', vehicule: minibus, type: 'nettoyage', texte: 'Sièges arrière' });
    ajouter(t(-24 * 3), 'SIGNALEMENT_FAIT', { signalement: 'SG003' });
    // Suivi médical (0.17.0) : présences habituelles et ponctuelles, absence remplacée, gardes (dont garde de jour aux
    // urgences), une demi-journée sans psychiatre en Unité 1 (mercredi après-midi) ; entretiens et contrats de soins
    // à jour, en retard, jamais faits
    var pm = 0, presence = function (d) { ajouter(t(-24 * 20), 'PRESENCE', Object.assign({ id: 'PM' + String(++pm).padStart(3, '0'), repetition: 'semaine', debut: lundiISO(-21), moments: ['matin', 'apresmidi'], precision: '' }, d)); };
    presence({ medecin: 'Dr Arnaud (fictif)', service: U1, nature: 'presence', jours: [1, 2, 5], salle: 'SA-MED' });
    presence({ medecin: 'Dr Arnaud (fictif)', service: U1, nature: 'presence', jours: [3], moments: ['matin'] });
    presence({ medecin: 'Dr Benoît (fictif)', service: U1, nature: 'presence', jours: [2], moments: ['apresmidi'] });
    presence({ medecin: 'Dr Benoît (fictif)', service: U1, nature: 'presence', jours: [4] });
    presence({ medecin: 'Dr Benoît (fictif)', service: U2, nature: 'presence', jours: [1, 3], moments: ['matin'] });
    presence({ medecin: 'Dr Chen (fictif)', service: U1, nature: 'presence', jours: [3], moments: ['matin'], precision: 'Vacation' });
    presence({ medecin: 'Dr Diallo (fictif)', service: U2, nature: 'presence', jours: [1, 2, 3, 4, 5], moments: ['matin'] });
    presence({ medecin: 'Dr Diallo (fictif)', service: U2, nature: 'presence', jours: [1, 4], moments: ['apresmidi'] });
    presence({ medecin: 'Dr Esposito (fictif)', service: U1, nature: 'presence', jours: [1, 4, 5], moments: ['matin'] });
    presence({ medecin: 'Dr Esposito (fictif)', service: U2, nature: 'presence', jours: [2], moments: ['matin'] });
    presence({ medecin: 'Dr Chen (fictif)', service: U1, nature: 'presence', repetition: 'date', debut: lundiISO(4), jours: [], moments: ['apresmidi'], precision: 'Staff' });
    presence({ medecin: 'Dr Arnaud (fictif)', nature: 'absence', repetition: 'date', debut: lundiISO(4), jours: [], service: U1, precision: 'Formation', remplacant: 'Dr Fontaine (fictif)' });
    presence({ medecin: 'Dr Chen (fictif)', nature: 'garde', garde: 'jour', jours: [1], moments: [], service: U1 });
    presence({ medecin: 'Dr Benoît (fictif)', nature: 'garde', garde: 'nuit', repetition: 'date', debut: lundiISO(1), jours: [], moments: [], service: U1 });
    presence({ medecin: 'Dr Diallo (fictif)', nature: 'garde', garde: 'astreinte', jours: [3], moments: [], service: U2 });
    // Jours modifiés dans une série (0.20.0) : la série du Dr Esposito en Unité 1 (PM009) est remplacée jeudi par un
    // après-midi et retirée vendredi, sans changer les autres semaines (marqués « * » dans la grille)
    ajouter(t(-24 * 2), 'PRESENCE', { id: 'PM009', sauf: [lundiISO(3), lundiISO(4)], service: U1 });
    presence({ medecin: 'Dr Esposito (fictif)', service: U1, nature: 'presence', repetition: 'date', debut: lundiISO(3), jours: [], moments: ['apresmidi'], precision: 'Décalé l’après-midi', remplace: 'PM009' });
    var sv0 = 0, suivi = function (p, n, medecin, quoi, svc) { ajouter(t(-24 * n + 2), 'SUIVI', { id: 'SV' + String(++sv0).padStart(3, '0'), patient: p, service: svc || U1, date: SIC.model.dateLocaleISO(t(-24 * n)), medecin: medecin, quoi: quoi }); };
    suivi('P01', 20, 'Dr Arnaud (fictif)', 'contrat'); suivi('P01', 3, 'Dr Arnaud (fictif)', 'entretien');
    suivi('P02', 16, 'Dr Benoît (fictif)', 'entretien'); suivi('P02', 10, 'Dr Benoît (fictif)', 'contrat');
    suivi('P03', 40, 'Dr Chen (fictif)', 'contrat'); suivi('P03', 5, 'Dr Chen (fictif)', 'entretien');
    suivi('P05', 2, 'Dr Arnaud (fictif)', 'entretien');
    suivi('P04', 1, 'Dr Diallo (fictif)', 'lesdeux', U2);

    // Sortie du patient avec sa check-list (un point déjà fait)
    var sortie = rdv({ nature: 'sortie', titre: 'Sortie', debut: jour(3, 11), fin: jour(3, 11, 30), service: U1, patients: ['P03'], validations: [{ id: 'va', type: 'medicale', libelle: 'Avis du psychiatre pour la sortie', delai: 48 }],
      checklist: SIC.agenda && SIC.agenda.CHECKLISTS_DEFAUT ? SIC.agenda.CHECKLISTS_DEFAUT[0].items.map(function (it, i) { return { id: 'c' + i, libelle: it.libelle, delai: it.delai }; }) : [] });
    ajouter(avant, 'CHECK', { rdv: sortie, item: 'c0', occurrence: SIC.model.dateLocaleISO(jour(3)), fait: true, service: U1 });
    // Tâches du service (récurrentes) et de l'équipe (ponctuelle)
    var nT = 0;
    function tache(type, d) { d.id = 'TA' + String(++nT).padStart(3, '0'); d.pour = d.pour || { roles: [], agents: [] }; ajouter(avant, type, d); }
    tache('TACHE', { titre: 'Vérification du réfrigérateur à pharmacie', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '08:00', regularite: { type: 'jour' } });
    tache('TACHE', { titre: 'Commande de pharmacie', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '', regularite: { type: 'semaine', jours: [1] }, consigne: 'Avant midi' });
    tache('TACHE', { titre: 'Piluliers de la semaine', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '16:00', regularite: { type: 'semaine', jours: [2, 5] }, pour: { roles: ['IDE'], agents: [] } });
    tache('TACHE', { titre: 'Contrôle du chariot d’urgence', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-35)), heure: '10:00', regularite: { type: 'rangPeriode', rang: -1, jour: 5, periode: 'mois' } });
    tache('TACHE', { titre: 'Inventaire du linge', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-35)), heure: '', regularite: { type: 'rangPeriode', rang: -1, jour: 'weekend', periode: 'mois' } });
    tache('TACHE', { titre: 'Audit des dossiers de soins', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-100)), heure: '', regularite: { type: 'rangPeriode', rang: 1, jour: 1, periode: 'trimestre' } });
    tache('TACHE', { titre: 'Contrôle des issues de secours', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '23:00', regularite: { type: 'semaine', jours: [0] }, pour: { roles: [], agents: [], groupes: ['equipe-nuit-u1'] } });
    tache('TACHE_EQUIPE', { titre: 'Préparer la réunion du groupe qualité', service: U1, debut: SIC.model.dateLocaleISO(jour(2)), heure: '', regularite: { type: 'aucune' }, pour: { roles: [], agents: [], groupes: ['groupe-qualite'] } });
    tache('TACHE_EQUIPE', { titre: 'Ranger la réserve', service: U1, debut: SIC.model.dateLocaleISO(now), heure: '', regularite: { type: 'aucune' } });
    // Absence, alertes (dont une en retard)
    ajouter(avant, 'ABSENCE', { id: 'AB001', agent: 'demo-d', nom: 'Agent D (fictif)', debut: jour(1), fin: jour(3), categorie: 'conge', service: U1 });
    ajouter(avant, 'ALERTE', { id: 'AL001', type: 'medecin', libelle: '', patientId: 'P02', service: U1, avant: SIC.model.dateLocaleISO(jour(1)), heure: '12:00', pour: null, precision: '' });
    ajouter(avant, 'ALERTE', { id: 'AL002', type: 'transmission', libelle: '', patientId: 'P01', service: U1, avant: SIC.model.dateLocaleISO(jour(-1)), heure: '', pour: null, precision: 'Famille à rappeler (fictif)' });
    ajouter(avant, 'ALERTE', { id: 'AL004', type: 'autre', libelle: 'Relire la procédure de sortie avant la réunion', patientId: null, service: U1, avant: SIC.model.dateLocaleISO(jour(3)), heure: '', pour: { groupe: 'groupe-qualite' }, precision: '' });
    ajouter(avant, 'ALERTE', { id: 'AL003', type: 'rdv', libelle: '', patientId: 'P04', service: U2, avant: '', heure: '', pour: null, precision: '' });

    // Salles et bureaux (0.25.0) : salles de l'Unité 1 (dont une soumise à validation), salle commune fermée pendant les repas,
    // bureau prêté à l'Unité 2 le mardi, réservation simple répétée, événements de l'agenda et présences qui occupent une
    // salle, demande en conflit à arbitrer, réservation à valider ; planning des psychologues avec entretiens prévus
    (function () {
      var jD = function (n) { return SIC.model.dateLocaleISO(jour(n)); }, lun = function (n) { return SIC.model.dateLocaleISO(lundiDe(n)); };
      var salle = function (d) { ajouter(t(-24 * 90), 'SALLE', d); };
      salle({ id: 'SA-E1', nom: 'Bureau d’entretien 1', type: 'entretien', capacite: 4, accessible: true, service: U1 });
      salle({ id: 'SA-E2', nom: 'Bureau d’entretien 2', type: 'entretien', capacite: 3, service: U1 });
      salle({ id: 'SA-MED', nom: 'Bureau médical', type: 'medical', capacite: 2, service: U1 });
      salle({ id: 'SA-REU', nom: 'Salle de réunion', type: 'reunion', capacite: 14, equipement: 'Écran, visioconférence', service: U1 });
      salle({ id: 'SA-FAM', nom: 'Salle des familles', type: 'familles', capacite: 6, accessible: true, service: U1, validation: true });
      salle({ id: 'SA-ACT', nom: 'Salle d’activités', type: 'activites', capacite: 12, accessible: true, service: '', services: [U1, U2] });
      salle({ id: 'SA-PSY2', nom: 'Bureau du psychologue', type: 'psychologue', capacite: 3, service: U2 });
      salle({ id: 'SA-DET', nom: 'Salon des patients', type: 'autre', capacite: 10, service: U1 });
      // Demande de travaux sur une salle, case « salle indisponible » cochée : salle fermée jusqu'à la fin des travaux
      ajouter(t(-24), 'TRAVAUX', { id: 'TR-SAL', service: U1, type: 'electricite', lieu: 'salle', salle: 'SA-DET', salleNom: 'Salon des patients', salleIndisponible: true, precisionLieu: 'Plafonnier', gravite: 'gene', urgence: 'non', description: 'Plafonnier qui grésille, à vérifier avant usage (fictif)', nom: 'Agent B (fictif)' }, 'demo-b');
      if (options.moi && options.moi.id) ajouter(t(-24), 'SALLE_RESERVATION', { id: 'SR-MOI', salle: 'SA-REU', jour: SIC.model.dateLocaleISO(jour(3)), de: '08:00', a: '09:00', titre: 'Préparation du staff', service: U1, nom: options.moi.nom || '', repetition: { type: 'aucune', jours: [] } }, options.moi.id);
      ajouter(t(-24 * 80), 'SALLE_FERMETURE', { id: 'SF-REPAS', salle: 'SA-ACT', jour: lun(-28), de: '12:00', a: '13:30', repetition: { type: 'semaine', jours: [0, 1, 2, 3, 4, 5, 6] }, motif: 'Repas' });
      ajouter(t(-24 * 80), 'SALLE_FERMETURE', { id: 'SF-REPAS2', salle: 'SA-ACT', jour: lun(-28), de: '18:30', a: '19:30', repetition: { type: 'semaine', jours: [0, 1, 2, 3, 4, 5, 6] }, motif: 'Repas du soir' });
      ajouter(t(-24 * 40), 'SALLE_PRET', { id: 'SP-U2', salle: 'SA-E1', jour: lun(-14), repetition: { type: 'semaine', jours: [2] }, services: [U2], motif: 'Consultations de l’Unité 2 le mardi' });
      ajouter(t(-24 * 10), 'SALLE_RESERVATION', { id: 'SR-INV', salle: 'SA-MED', jour: lun(0), de: '16:00', a: '17:00', titre: 'Inventaire de la pharmacie', service: U1, nom: 'Cadre de santé (fictif)', repetition: { type: 'semaine', jours: [1] } }, 'demo-cadre');
      rdv({ nature: 'reunion', titre: 'Staff Unité 1', debut: lundiDe(-7, 10), fin: lundiDe(-7, 11, 30), lieu: '', salle: 'SA-REU', service: U1, patients: [], regularite: { type: 'semaine', jours: [1] } });
      rdv({ nature: 'activite', titre: 'Atelier cuisine', debut: jour(1, 10), fin: jour(1, 11, 30), salle: 'SA-ACT', service: U1, patients: ['P01', 'P05'], accompagnateurs: 2, transports: [] });
      rdv({ nature: 'entretien', titre: 'Entretien infirmier', debut: jour(0, 9), fin: jour(0, 10, 30), salle: 'SA-E1', service: U1, patients: ['P02'], transports: [] });
      // Conflit : l'atelier mémoire occupe la salle de réunion ; la réunion de service la demande (à arbitrer par le cadre)
      var atelier = rdv({ nature: 'activite', titre: 'Atelier mémoire', debut: jour(2, 13, 30), fin: jour(2, 14, 30), salle: 'SA-REU', service: U1, patients: ['P03'], transports: [] });
      var reunion = rdv({ nature: 'reunion', titre: 'Réunion de service', debut: jour(2, 13, 30), fin: jour(2, 14, 30), salle: 'SA-REU', service: U1, patients: [], transports: [] });
      ajouter(t(-2), 'SALLE_DEMANDE', { id: 'SD-REU', salle: 'SA-REU', ref: 'agenda|' + reunion + '|' + jD(2), debut: jour(2, 13, 30), fin: jour(2, 14, 30), titre: 'Réunion de service', genre: 'agenda', service: U1,
        motif: 'Seule salle avec écran ; réunion prévue de longue date (fictif)', conflits: [{ ref: 'agenda|' + atelier + '|' + jD(2), par: 'demo', titre: 'Atelier mémoire' }], nom: 'Agent B (fictif)' }, 'demo-b');
      ajouter(t(-5), 'SALLE_DEMANDE', { id: 'SD-FAM', salle: 'SA-FAM', ref: 'salles|SD-FAM|' + jD(3), debut: jour(3, 15), fin: jour(3, 16, 30), titre: 'Rencontre avec une famille', genre: 'simple', service: U1, motif: '', validation: true, conflits: [], nom: 'Agent C (fictif)' }, 'demo-c');
      // Planning des psychologues
      var pp = function (d) { ajouter(t(-24 * 30), 'PRESENCE_PSY', d); return d.id; };
      var pm = pp({ id: 'PP-M1', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', service: U1, nature: 'presence', jours: [1], repetition: 'semaine', debut: lun(-14), de: '09:00', a: '12:30', salle: 'SA-E2' });
      pp({ id: 'PP-M3', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', service: U1, nature: 'presence', jours: [3], repetition: 'semaine', debut: lun(-14), de: '09:30', a: '12:00', salle: 'SA-E1' });
      pp({ id: 'PP-L', psychologue: 'M. Leroy (fictif)', psychologueId: 'p-leroy', service: U1, nature: 'presence', jours: [4], repetition: 'semaine', debut: lun(-14), de: '13:30', a: '17:00', precision: 'Bilans neuropsychologiques', salle: 'SA-E2' });
      pp({ id: 'PP-N', psychologue: 'Mme Nguyen (fictif)', psychologueId: 'p-nguyen', service: U2, nature: 'presence', jours: [1, 4], repetition: 'semaine', debut: lun(-14), de: '14:00', a: '17:00', salle: 'SA-PSY2' });
      pp({ id: 'PP-ABS', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', service: U1, nature: 'absence', jours: [], repetition: 'date', debut: lun(9), precision: 'Formation', remplacant: 'M. Leroy (fictif)', remplacantId: 'p-leroy' });
      ajouter(t(-24 * 3), 'PRESENCE_PSY', { id: 'PP-M3', sauf: [lun(9)], service: U1 });
      var ep = function (d) { ajouter(t(-24 * 2), 'ENTRETIEN_PREVU', d); };
      ep({ id: 'EP-1', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', patient: 'P01', jour: lun(7), de: '09:30', a: '10:15', presence: pm, salle: 'SA-E2', service: U1 });
      ep({ id: 'EP-2', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', patient: 'P02', jour: lun(7), de: '11:00', a: '11:45', presence: pm, salle: 'SA-E2', service: U1 });
      ep({ id: 'EP-3', psychologue: 'Mme Martin (fictif)', psychologueId: 'p-martin', patient: 'P03', jour: lun(9), de: '14:00', a: '15:00', salle: 'SA-E1', service: U1 });
    })();
    // Informations du service (0.26.2) : page de l'établissement (numéros utiles), page de l'Unité 1 remplie (coordonnées
    // avec un contact relié au compte connecté, horaires, consignes, rubrique masquée en préparation) ; Unité 2 vide
    (function () {
      var moiI = options.moi && options.moi.id;
      var ir = function (d, by) { ajouter(t(-24 * 20), 'INFO_RUBRIQUE', d, by || moiI || 'demo'); };
      ir({ id: 'IR-E1', service: '*', titre: 'Numéros utiles de l’établissement', ordre: 1, texte: 'Numéros internes fictifs de démonstration.',
        contacts: [{ nom: 'Services techniques (fictif)', fonction: 'Dépannage, travaux', numero: '4210' }, { nom: 'Sécurité incendie (fictif)', fonction: 'Urgence', numero: '18 18' },
          { nom: 'Pharmacie (fictif)', fonction: 'Du lundi au vendredi, 8 h 30 – 17 h', numero: '4350' }, { nom: 'Administrateur de garde (fictif)', fonction: 'Nuits, week-ends et jours fériés', numero: '06 00 00 00 00' }] }, 'demo');
      ir({ id: 'IR-U1', service: U1, titre: 'Coordonnées du service', ordre: 1, texte: 'Unité 1 (fictive) — bâtiment B, 2e étage.\nPoste de soins ouvert jour et nuit.',
        contacts: [{ nom: 'Poste de soins (fictif)', fonction: 'IDE de jour et de nuit', numero: '4501' }, { nom: 'Secrétariat médical (fictif)', fonction: '9 h – 17 h', numero: '4502', courriel: 'secretariat.u1@exemple.invalid' }]
          .concat(moiI ? [{ nom: (options.moi.nom || 'Cadre de santé') , fonction: 'Cadre de santé', numero: '4500', agent: moiI }] : []) });
      ir({ id: 'IR-U2', service: U1, titre: 'Horaires (visites, repas, relèves)', ordre: 2, texte: 'Visites : 13 h 30 – 19 h (fictif).\nRepas : 12 h et 18 h 30.\nRelèves : 6 h 45, 13 h 45, 20 h 45.' });
      ir({ id: 'IR-U3', service: U1, titre: 'Consignes et procédures du service', ordre: 3, texte: 'Inventaire du chariot d’urgence chaque lundi (fictif).\nClés de la CSI au poste de soins, jamais dans une poche.' });
      ir({ id: 'IR-U4', service: U1, titre: 'Livret d’accueil des nouveaux agents', ordre: 4, texte: 'En préparation (fictif).', masquee: true });
    })();
    // Référents (0.27.1) : Unité 1 (plaies et escarres, pharmacie avec suppléant, restriction des libertés tenue par
    // l'agent connecté, domaine ajouté par le cadre, douleur masquée), établissement (identitovigilance)
    (function () {
      var moiR = options.moi && options.moi.id ? { id: options.moi.id, nom: options.moi.nom || 'Cadre de santé' } : null;
      var rf = function (d) { ajouter(t(-24 * 15), d.code ? 'DOMAINE_REFERENT' : 'REFERENTS', d, moiR ? moiR.id : 'demo'); };
      rf({ service: U1, domaine: 'plaies', titulaires: [{ id: 'demo-a', nom: 'Agent A (fictif)' }], suppleants: [], precision: 'Avis sur les pansements complexes, du lundi au vendredi' });
      rf({ service: U1, domaine: 'pharmacie', titulaires: [{ id: 'demo-c', nom: 'Agent C (fictif)' }], suppleants: [{ id: 'demo-b', nom: 'Agent B (fictif)' }], precision: '' });
      if (moiR) rf({ service: U1, domaine: 'libertes', titulaires: [moiR], suppleants: [], precision: '' });
      rf({ service: U1, code: 'p-sport', libelle: 'Activité physique adaptée', masque: false });
      rf({ service: U1, domaine: 'p-sport', titulaires: [{ id: 'demo-d', nom: 'Agent D (fictif)' }], suppleants: [], precision: 'Créneaux du mercredi' });
      rf({ service: U1, code: 'douleur', masque: true });
      rf({ service: '*', domaine: 'identito', titulaires: [{ id: 'demo-b', nom: 'Agent B (fictif)' }], suppleants: [], precision: 'Cellule d’identitovigilance de l’établissement (fictive)' });
    })();
    // Rôle « Psychologue » (rôle créé par l'administrateur) : planning des psychologues, salles, messagerie (fictif)
    if (!reel) cfg('roles', { PSYCHOLOGUE: { libelle: 'Psychologue', services: true, accesModules: { suivi: ['suivi.consulter', 'suivi.psychologues'], salles: ['salles.consulter', 'salles.reserver'], messagerie: ['messagerie.lire', 'messagerie.ecrire'], agenda: [] } } });

    // Messagerie (0.23.0) : message important à confirmer avec éléments rattachés (demande de travaux, tâche, accès
    // réservé pour qui n'a pas le module), message à un groupe avec réponses à tous, message envoyé par l'agent connecté
    // (suivi des lectures, réponse reçue), message relancé, message de tout l'établissement, fiche patient rattachée,
    // message ancien (archives), message retiré ; informations des autres modules affichées dans l'onglet Informations
    (function () {
      var moiM = options.moi && options.moi.id, nM = 0, jM = function (n) { return SIC.model.dateLocaleISO(now + n * J); };
      function msg(h0, by, d) {
        d.id = 'MS' + String(++nM).padStart(3, '0');
        d = Object.assign({ important: false, accuse: 'auto', reponses: 'auteur', jusquau: jM(15), rattaches: [], pieces: [] }, d);
        d.services = SIC.messagerie ? SIC.messagerie.servicesDe(d.destinataires, { groupes: [{ code: 'groupe-qualite', libelle: 'q', services: [U1, U2], membres: [] }, { code: 'equipe-nuit-u1', libelle: 'n', services: [U1], membres: [] }] }) : [];
        ajouter(t(h0), 'MESSAGE', d, by); return d.id;
      }
      function lu(h0, id, by, confirme) { ajouter(t(h0), 'MESSAGE_LU', { message: id, confirme: !!confirme }, by); }
      function rep(h0, id, by, nom, texte) { ajouter(t(h0), 'MESSAGE_REPONSE', { message: id, id: 'R' + nM + '-' + (-h0), texte: texte, nom: nom }, by); }
      var cles = msg(-26, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Nouvelle procédure de remise des clés de la pharmacie', important: true, accuse: 'confirmer',
        texte: 'À partir de lundi, les clés de la pharmacie du service ne sont plus remises de main à main.\nElles sont rangées dans la boîte à code du poste de soins ; le code est donné par le cadre ou l’IDE coordinateur.\nMerci de noter chaque emprunt sur la feuille fixée à l’intérieur de la boîte. (fictif)',
        destinataires: [{ genre: 'service', code: U1 }], jusquau: jM(30),
        rattaches: [{ module: 'agenda', genre: 'tache', id: 'TA002', service: U1 }, { module: 'travaux', genre: 'demande', id: 'TR007', service: U1 }] });
      lu(-25, cles, 'demo-a', true); lu(-24, cles, 'demo-c', false);
      rep(-23, cles, 'demo-a', 'Agent A (fictif)', 'Bien noté. Faut-il garder une clé de secours au bureau infirmier ? (fictif)');
      var qualite = msg(-30, 'demo-b', { nom: 'Agent B (fictif)', objet: 'Réunion du groupe qualité : ordre du jour', reponses: 'tous',
        texte: 'Je propose de revoir la procédure de sortie et la grille d’audit des dossiers. Ajoutez vos points en réponse. (fictif)', destinataires: [{ genre: 'groupe', code: 'groupe-qualite' }] });
      if (moiM) { lu(-29, qualite, moiM); rep(-28, qualite, moiM, options.moi.nom || '', 'Je prépare la grille d’audit pour la réunion. (fictif)'); }
      rep(-4, qualite, 'demo-b', 'Agent B (fictif)', 'Merci ! J’ajoute aussi le point sur les check-lists d’entrée. (fictif)');
      if (moiM) {
        var envoi = msg(-48, moiM, { nom: options.moi.nom || '', objet: 'Nuit du 15 au 16 : renfort prévu', accuse: 'confirmer',
          texte: 'Un renfort AS de la suppléance arrive à 21 h. Merci de lui présenter le service et le circuit des clés. (fictif)',
          destinataires: [{ genre: 'groupe', code: 'equipe-nuit-u1' }, { genre: 'agent', code: 'demo-c', nom: 'Agent C (fictif)' }] });
        lu(-40, envoi, 'demo-b', true); lu(-30, envoi, 'demo-c', false);
        rep(-6, envoi, 'demo-b', 'Agent B (fictif)', 'Bien reçu, je l’accueille à son arrivée. (fictif)');
      }
      var relance = msg(-24 * 3, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Inscriptions à la formation incendie', texte: 'Merci de vous inscrire avant vendredi sur la feuille du secrétariat. (fictif)',
        destinataires: [{ genre: 'service', code: U1 }], reponses: 'aucune' });
      ajouter(t(-20), 'MESSAGE_RELANCE', { message: relance }, 'demo-cadre');
      msg(-8, 'demo-admin', { nom: 'Administrateur (fictif)', objet: 'Coupure du réseau informatique dimanche matin', texte: 'Le réseau sera coupé dimanche de 6 h à 8 h pour maintenance. Tessera reste utilisable en mode hors réseau. (fictif)',
        destinataires: [{ genre: 'etablissement', code: '*' }], reponses: 'aucune', rattaches: [{ module: 'vehicules', genre: 'reservation', id: 'RV004', service: U1 }] });
      msg(-5, 'demo-a', { nom: 'Agent A (fictif)', objet: 'Accompagnement de M. Durand demain', texte: 'Le rendez-vous est confirmé ; prévoir le minibus. (fictif)',
        destinataires: [{ genre: 'role', code: 'IDE', service: U1 }, { genre: 'role', code: 'CADRE', service: U1 }], rattaches: [{ module: 'patients', genre: 'fiche', id: 'P01', service: U1 }] });
      // Information d'un tiers (0.32.0) : appel de la famille, exclu des données remises au patient
      msg(-4, 'demo-b', { nom: 'Agent B (fictif)', objet: 'Appel de la sœur de Mme Alpha', texte: 'Sa sœur a appelé pour prévenir de son déménagement ; elle demande à être rappelée. (fictif)', tiers: true,
        destinataires: [{ genre: 'role', code: 'CADRE', service: U1 }], rattaches: [{ module: 'patients', genre: 'fiche', id: 'P01', service: U1 }] });
      var ancien = msg(-24 * 40, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Planning des congés d’été', texte: 'Les demandes sont à rendre avant la fin du mois. (fictif)', destinataires: [{ genre: 'service', code: U1 }], jusquau: jM(-10) });
      if (moiM) lu(-24 * 39, ancien, moiM);
      // Sondages (0.23.0) : dates à remplir par l'agent connecté, choix unique public déjà voté (résultats visibles),
      // choix multiples privé à noms masqués avec réponse « Autre » envoyé par l'agent connecté, sondage clos
      function vote(h0, id, by, nom, choix, autre) { ajouter(t(h0), 'VOTE', { message: id, choix: choix, autre: autre || '', nom: nom }, by); }
      var dateQ = msg(-10, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Date de la prochaine réunion du groupe qualité', texte: 'Cochez les dates qui vous conviennent. (fictif)',
        destinataires: [{ genre: 'groupe', code: 'groupe-qualite' }], reponses: 'aucune',
        sondage: { genre: 'dates', resultats: 'public', cloture: jM(5), options: [{ id: 'o1', jour: jM(8), heure: '14:00', libelle: '' }, { id: 'o2', jour: jM(9), heure: '10:00', libelle: '' }, { id: 'o3', jour: jM(10), heure: '14:00', libelle: 'Salle du pôle' }] } });
      vote(-9, dateQ, 'demo-b', 'Agent B (fictif)', ['o1', 'o3']);
      var horaire = msg(-24 * 2, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Horaire de la réunion de service', texte: 'Quel horaire préférez-vous pour la réunion mensuelle ? (fictif)',
        destinataires: [{ genre: 'service', code: U1 }], reponses: 'aucune',
        sondage: { genre: 'unique', question: 'Horaire préféré', resultats: 'public', cloture: jM(3), options: [{ id: 'o1', libelle: '13 h 30 (relève)' }, { id: 'o2', libelle: '14 h 30' }, { id: 'o3', libelle: '16 h' }] } });
      vote(-40, horaire, 'demo-a', 'Agent A (fictif)', ['o1']); vote(-30, horaire, 'demo-c', 'Agent C (fictif)', ['o1']);
      if (moiM) vote(-20, horaire, moiM, options.moi.nom || '', ['o2']);
      if (moiM) {
        var themes = msg(-24 * 3, moiM, { nom: options.moi.nom || '', objet: 'Thèmes de la prochaine formation de l’équipe de nuit', texte: 'Plusieurs choix possibles. Les noms sont masqués. (fictif)',
          destinataires: [{ genre: 'groupe', code: 'equipe-nuit-u1' }], reponses: 'aucune',
          sondage: { genre: 'multiple', resultats: 'prive', anonyme: true, autre: true, cloture: '', options: [{ id: 'o1', libelle: 'Gestion de l’agressivité' }, { id: 'o2', libelle: 'Gestes d’urgence' }, { id: 'o3', libelle: 'Isolement et contention : cadre légal' }] } });
        vote(-60, themes, 'demo-b', 'Agent B (fictif)', ['o1', 'o3']); vote(-50, themes, 'demo-d', 'Agent D (fictif)', ['o3'], 'Sommeil et travail de nuit (fictif)');
      }
      var clos = msg(-24 * 12, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Repas de fin d’année : quel jour ?', texte: 'Merci pour vos réponses. (fictif)', destinataires: [{ genre: 'service', code: U1 }], reponses: 'aucune', jusquau: jM(10),
        sondage: { genre: 'unique', resultats: 'public', cloture: '', options: [{ id: 'o1', libelle: 'Jeudi 18 décembre' }, { id: 'o2', libelle: 'Vendredi 19 décembre' }] } });
      vote(-24 * 11, clos, 'demo-a', 'Agent A (fictif)', ['o2']); vote(-24 * 11 + 3, clos, 'demo-c', 'Agent C (fictif)', ['o2']); vote(-24 * 10, clos, 'demo-b', 'Agent B (fictif)', ['o1']);
      ajouter(t(-24 * 9), 'SONDAGE_CLOTURE', { message: clos }, 'demo-cadre');
      var retire = msg(-24 * 2, 'demo-cadre', { nom: 'Cadre de santé (fictif)', objet: 'Réunion de service jeudi', texte: 'Réunion à 14 h. (fictif)', destinataires: [{ genre: 'service', code: U1 }] });
      ajouter(t(-24 * 2 + 1), 'MESSAGE_RETRAIT', { message: retire, motif: 'Réunion reportée (fictif)' }, 'demo-cadre');
    })();
    if (!reel) cfg('messagerie', { '*': { informations: { agenda: true, vehicules: true, travaux: true, suivi: true }, piecesJointes: true, chiffrement: 'choixCoche' }, U1: { affichageJours: 15 } });

    file.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
    return file.map(function (x, i) { return { at: new Date(Math.min(x.at, now) + i).toISOString(), by: x.by || 'demo', type: x.type, data: x.data }; });
  };

  SIC.chargerDemo = async function (session) {
    // L'agent qui crée la démonstration est inscrit par les « données fictives » à une audience : information reçue
    var u = session.utilisateur || {};
    await session.enregistrerLot(SIC.donneesFictives({ moi: { id: u.id, nom: u.nom } }), { libelle: 'Données fictives de démonstration', by: 'demo', sansControle: true });
    // Messagerie (0.23.0) : un message avec deux pièces jointes fictives (une image affichée dans l'application, un texte
    // téléchargé après avertissement), écrites chiffrées avant la saisie qui les cite
    if (session.enregistrerPiece && !session.formation) {
      try {
        var png = SIC.crypto.deb64('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAVElEQVR42u3WsQ0AIAgEQDZxMAsXdwATl3ABLI0Fl1CScNXz0UZPZ+6Vzuv9AAICKgf6dfi2DwQEVA8kqYGAgPQhrwMISB+S1EBAQPqQ1wEEVBp0AOAC5OIP3b9UAAAAAElFTkSuQmCC');
        var txt = new TextEncoder().encode('Feuille des emprunts de clés (fictif)\nDate ; Heure ; Agent ; Retour\n');
        var pj1 = await session.enregistrerPiece('messagerie', png), pj2 = await session.enregistrerPiece('messagerie', txt);
        await session.enregistrerLot([{ at: new Date(Date.now() - 3 * 36e5).toISOString(), by: 'demo-cadre', type: 'MESSAGE', data: { id: 'MS900', nom: 'Cadre de santé (fictif)',
          objet: 'Plan de la boîte à code et feuille des emprunts', texte: 'Ci-joint le plan d’emplacement de la boîte à code et la feuille des emprunts à imprimer. (fictif)',
          destinataires: [{ genre: 'service', code: 'U1' }], services: ['U1'], important: false, accuse: 'auto', reponses: 'auteur', jusquau: SIC.model.dateLocaleISO(Date.now() + 15 * 864e5),
          rattaches: [], pieces: [{ id: pj1, nom: 'plan-boite-a-code (fictif).png', taille: png.length }, { id: pj2, nom: 'feuille-emprunts (fictif).txt', taille: txt.length }] } }],
          { libelle: 'Message fictif avec pièces jointes', by: 'demo', sansControle: true });
      } catch (e) { /* démonstration sans pièces jointes */ }
    }
    // Données sous clé propre (0.20.0) : la clé de chaque donnée est créée d'abord, puis ses valeurs fictives sont écrites
    // dans son journal (vigilance organisationnelle, données des agents)
    if (session.creerClesManquantes && !session.formation) {
      try {
        await session.creerClesManquantes();
        var now = Date.now(), J = 864e5, at = function (h) { return new Date(now + h * 36e5).toISOString(); }, jC = function (n) { return SIC.model.dateLocaleISO(now + n * J); };
        var v = [
          { at: at(-30), by: 'demo', type: 'VALEUR', data: { entite: 'patient', id: 'P01', champ: 'vigilance-orga', op: { ajout: { id: 'nv1', texte: 'Ne pas programmer de sortie le jeudi, jour de visite (fictif)', importance: 'important' } } } },
          { at: at(-28), by: 'demo', type: 'VALEUR', data: { entite: 'patient', id: 'P01', champ: 'info-sensible', perimetre: 'PSM', op: { ajout: { id: 'ns1', texte: 'Mesure de protection de l’enfance en cours pour la fratrie : ne rien dire aux visiteurs (fictif)', importance: 'urgent' } } } },
          { at: at(-40), by: 'demo', type: 'VALEUR', data: { entite: 'agent', id: 'demo-a', champ: 'afgsu', valeur: jC(120) } },
          { at: at(-40), by: 'demo', type: 'VALEUR', data: { entite: 'agent', id: 'demo-b', champ: 'afgsu', valeur: jC(-10) } },
          { at: at(-40), by: 'demo', type: 'VALEUR', data: { entite: 'agent', id: 'demo-a', champ: 'habilitations', valeur: ['Conduite d’un véhicule', 'Tuteur de stage'] } },
          { at: at(-40), by: 'demo', type: 'VALEUR', data: { entite: 'agent', id: 'demo-c', champ: 'habilitations', valeur: ['Accompagnement des sorties'] } }];
        await session.enregistrerLot(v, { libelle: 'Données fictives sous clé propre', by: 'demo', sansControle: true });
        // Messagerie chiffrée pour les seuls destinataires (0.24.0) : un message au service avec une réponse chiffrée,
        // un message à l'équipe de nuit (dont l'agent connecté n'est pas membre) : il ne peut que le consulter, tracé
        var MSG = SIC.messagerie, cfgD = session.etat && session.etat.config;
        if (MSG && session.chiffrerMessage && cfgD && MSG.options(cfgD).chiffrement !== 'desactive') {
          var lot = [], moiC = session.compteEffectif();
          var chiffre = async function (id, by, nom, dest, contenu, h0) {
            var auteur = { id: by, roles: ['IDE'], services: ['U1'] }, d = { id: id, nom: nom, destinataires: dest, services: MSG.servicesDe(dest, cfgD), important: false, accuse: 'auto', reponses: 'tous',
              jusquau: jC(15), objet: '', texte: '', rattaches: [], pieces: [] };
            // Auteurs fictifs sans compte : pas de clé d'agent (seules les clés existantes servent)
            d.chiffre = await session.chiffrerMessage(id, MSG.clesPourMessage(dest, auteur, cfgD, []).filter(function (n) { return !session.clesMessagerieManquantes([n]).length; }));
            d.chiffre.ct = await session.contenuMessage(id, contenu);
            lot.push({ at: at(h0), by: by, type: 'MESSAGE', data: d });
          };
          await chiffre('MS950', 'demo-cadre', 'Cadre de santé (fictif)', [{ genre: 'service', code: 'U1' }], { objet: 'Entretiens annuels : planning confidentiel', texte: 'Le planning des entretiens annuels est affiché au bureau du cadre. Merci de ne pas le diffuser. (fictif)', rattaches: [], pieces: [] }, -6);
          lot.push({ at: at(-5), by: 'demo-a', type: 'MESSAGE_REPONSE', data: { message: 'MS950', id: 'R950', nom: 'Agent A (fictif)', texte: '', chiffre: await session.chiffrerPourMessage('MS950', { texte: 'Je passerai jeudi matin. (fictif)' }, 'r:R950') } });
          await chiffre('MS951', 'demo-b', 'Agent B (fictif)', [{ genre: 'groupe', code: 'equipe-nuit-u1' }], { objet: 'Désaccord sur le planning de nuit', texte: 'Échange entre agents de nuit, chiffré pour l’équipe seulement. (fictif)', rattaches: [], pieces: [] }, -30);
          if (moiC) await session.enregistrerLot(lot, { libelle: 'Messages chiffrés fictifs', by: 'demo', sansControle: true });
          session.clesMessages = {};   // l'agent connecté n'est pas l'auteur : il ouvre ce qui lui est adressé, consulte le reste
        }
        // Mes tâches (0.26.3) : liste personnelle de l'agent connecté, chiffrée par sa clé de liste (échéance proche avec
        // rappel, tâche en retard rattachée à une demande de travaux, tâche sans date, tâche faite hier)
        var moiT = session.compteEffectif && session.compteEffectif();
        // Équipe (0.27.0) : coordonnées professionnelles d'agents fictifs ; coordonnées personnelles chiffrées (agent B avec
        // son accord, agent connecté) ; numéro personnel d'un médecin (cadre et médecin chef de service)
        if (moiT && session.chiffrerEnveloppe && SIC.equipe) {
          var EQ = SIC.equipe, lotE = [], dispo = function (noms) { return noms.filter(function (n) { return !session.clesEnveloppeManquantes([n]).length; }); };
          var fiche = async function (by, d, perso, svs) { if (perso) d.perso = await session.chiffrerEnveloppe('fiche:' + d.agent, dispo(EQ.clesAgent(d.agent, svs)), perso); lotE.push({ at: at(-30), by: by, type: 'COORDONNEES', data: d }); };
          await fiche('demo', { agent: 'demo-a', telPro: '4511', mailPro: 'agent.a@exemple.invalid', fonction: 'IDE de jour' });
          await fiche('demo', { agent: 'demo-b', telPro: '4512', mailPro: 'agent.b@exemple.invalid', fonction: 'IDE de nuit', accord: true }, { tel: '06 00 00 00 01', mail: 'agent.b.perso@exemple.invalid' }, ['U1']);
          await fiche('demo', { agent: 'demo-c', telPro: '4513', fonction: 'Aide-soignante' });
          await fiche(moiT.id, { agent: moiT.id, telPro: '4500', mailPro: 'cadre.u1@exemple.invalid', fonction: 'Cadre de santé', accord: true }, { tel: '06 00 00 00 02', mail: '' }, moiT.services && moiT.services.length ? moiT.services : ['U1', 'U2']);
          // Donnée ajoutée tenue par l'agent lui-même (taille de tenue) : copie chiffrée pour la clé de la donnée et sa clé de liste
          var envSoi = async function (ag, champ, v) { var n = dispo(['d-' + champ, 't-a.' + ag]); if (n.length) lotE.push({ at: at(-20), by: ag === moiT.id ? moiT.id : 'demo', type: 'VALEUR_SOI', data: { agent: ag, champ: champ, env: await session.chiffrerEnveloppe('soi:' + ag + ':' + champ, n, { v: v }) } }); };
          await envSoi(moiT.id, 'tenue', 'M');
          await envSoi('demo-b', 'tenue', 'L');
          var noms = dispo(['e-m.U1']);
          if (noms.length) lotE.push({ at: at(-30), by: 'demo', type: 'COORDONNEES_MEDECIN', data: { medecin: 'm-arnaud', perso: await session.chiffrerEnveloppe('medecin:m-arnaud', noms, { tel: '06 00 00 00 10' }) } });
          await session.enregistrerLot(lotE, { libelle: 'Fiches fictives de l’équipe', by: 'demo', sansControle: true });
        }
        // Documents (0.34.0) : chaque document a sa propre clé, créée avant ses versions chiffrées. Règlement de salle validé
        // (date de révision), procédure à valider, modèle du cadre, document rattaché à un patient, document à réviser,
        // document d'un autre agent partagé avec l'agent connecté, document dans la corbeille
        var DMd = SIC.documents, SVd = (moiT && moiT.services && moiT.services[0]) || 'U1';
        if (moiT && DMd && session.creerCleDocument && !session.clesDocumentManquantes(['k-a.' + moiT.id]).length) {
          var p = function (texte, o) { return Object.assign({ t: 'p', runs: [{ x: texte }] }, o || {}); }, ti = function (n, texte) { return { t: 'h' + n, runs: [{ x: texte }] }; };
          var li = function (texte, liste) { return { t: 'li', liste: liste || 'ul', runs: [{ x: texte }] }; };
          var mqA = { p: 'demo-a', n: 'Agent A (fictif)', le: at(-48) };
          var docD = async function (o) {
            var id = 'DC' + SIC.crypto.hex(SIC.crypto.aleatoire(8)), auteur = o.auteur || moiT.id, part = DMd.partage(o.partage || []);
            await session.creerCleDocument(id, DMd.clesDocument(auteur, part).filter(function (n) { return !session.clesDocumentManquantes([n]).length; }));
            var lotD = [{ at: at(o.h), by: auteur, type: 'DOC', data: { id: id, nom: o.nom || moiT.nom, genre: o.genre || 'texte', modele: !!o.modele, partage: part, services: o.services || [], depuis: '' } }];
            for (var i = 0; i < o.versions.length; i++) {
              var vv = o.versions[i], c = await session.chiffrerDocument(id, { meta: DMd.meta({ titre: o.titre, rattaches: o.rattaches || [] }), contenu: DMd.contenu(vv.contenu) });
              lotD.push({ at: at(vv.h), by: vv.par || auteur, type: 'DOC_VERSION', data: { doc: id, g: c.g, ct: c.ct, nom: vv.par === 'demo-a' ? 'Agent A (fictif)' : (o.nom || moiT.nom) } });
            }
            var e = await session.enregistrerLot(lotD, { libelle: 'Document fictif : ' + o.titre, by: 'demo', sansControle: true });
            var suite = (o.suite || []).map(function (x) { var d = Object.assign({ doc: id }, x.data); if (x.data.version !== undefined) d.version = e.id + '.' + String(x.data.version + 1).padStart(5, '0'); return { at: at(x.h), by: x.par || auteur, type: x.type, data: d }; });
            if (suite.length) await session.enregistrerLot(suite, { libelle: 'Suivi du document fictif : ' + o.titre, by: 'demo', sansControle: true });
          };
          var regl = { blocs: [ti(1, 'Règlement d’utilisation de la salle de réunion (fictif)'), p('La salle de réunion est réservée dans Tessera (module Salles et bureaux). Elle accueille au plus 14 personnes.'),
            ti(2, 'Avant la réunion'), li('Réserver au moins la veille.'), li('Prévenir le cadre pour toute réunion avec des personnes extérieures.'),
            ti(2, 'Après la réunion'), li('Éteindre l’écran et la visioconférence.'), li('Remettre les tables en place et fermer la fenêtre.'),
            { t: 'table', entete: true, lignes: [[{ runs: [{ x: 'Créneau', g: true }] }, { runs: [{ x: 'Usage prioritaire', g: true }] }], [{ runs: [{ x: 'Mardi 14 h – 15 h' }] }, { runs: [{ x: 'Synthèse clinique hebdomadaire (organisation)' }] }], [{ runs: [{ x: 'Jeudi 9 h – 10 h' }] }, { runs: [{ x: 'Réunion d’équipe' }] }]] },
            p('Document d’exemple, entièrement fictif.', { al: 'd' })], page: { entete: { gauche: '{service}', centre: '', droite: '{version}' } } };
          await docD({ titre: 'Règlement d’utilisation de la salle de réunion (fictif)', h: -24 * 40, partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            rattaches: [{ module: 'salles', genre: 'salle', id: 'SA-REU', libelle: 'Salle ou bureau : Salle de réunion', service: SVd }],
            versions: [{ h: -24 * 40, contenu: { blocs: regl.blocs.slice(0, 6) } }, { h: -24 * 35, contenu: regl }],
            suite: [{ h: -24 * 34, type: 'DOC_VALIDATION', data: { version: 1, revision: jC(330), message: '' } }] });
          await docD({ titre: 'Procédure d’accueil d’un nouvel agent (fictif)', h: -24 * 6, partage: [{ genre: 'role', code: 'IDE', service: SVd, droit: 'modifier' }],
            versions: [{ h: -24 * 6, contenu: { blocs: [ti(1, 'Accueil d’un nouvel agent (fictif)'), p('Le premier jour, l’agent est accueilli par le cadre puis par son tuteur.'), li('Remise du badge et des clés', 'ol'), li('Visite du service', 'ol'), li('Présentation de Tessera', 'ol')] } },
              // Suivi des modifications (0.37.0) : ajouts et suppression de l'agent A, à accepter ou refuser
              { h: -24 * 2, par: 'demo-a', contenu: { blocs: [ti(1, 'Accueil d’un nouvel agent (fictif)'), { t: 'p', runs: [{ x: 'Le premier jour, l’agent est accueilli par le cadre ' }, { x: 'puis par son tuteur', del: mqA }, { x: 'puis présenté à l’équipe par son tuteur', ins: mqA }, { x: '.' }] },
                li('Remise du badge et des clés', 'ol'), { t: 'li', liste: 'ol', runs: [{ x: 'Visite du service' }, { x: ' et des sorties de secours', ins: mqA }] }, li('Présentation de Tessera', 'ol'), { t: 'li', liste: 'ol', runs: [{ x: 'Lecture du livret d’accueil', ins: mqA }] }] } }],
            suite: [{ h: -24 * 3, par: 'demo-a', type: 'DOC_OPTIONS', data: { suivi: true, simultane: false } }, { h: -24 * 2 + 1, par: 'demo-a', type: 'DOC_STATUT', data: { statut: 'a-valider', message: 'J’ai ajouté les sorties de secours et le livret, en suivi des modifications. (fictif)' } }] });
          await docD({ titre: 'Compte rendu de réunion d’équipe (modèle fictif)', h: -24 * 60, modele: true, services: [SVd], partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            versions: [{ h: -24 * 60, contenu: { blocs: [ti(1, 'Compte rendu de réunion d’équipe'), p('Date : …   Animateur : …   Présents : …'), ti(2, 'Points abordés'), li(''), ti(2, 'Décisions'), li(''), ti(2, 'Prochaine réunion'), p('…')], page: { pied: { gauche: '{titre}', centre: '{date}', droite: 'Page {page}' } } } }] });
          await docD({ titre: 'Organisation de la sortie à la médiathèque (fictif)', h: -24 * 3,
            rattaches: [{ module: 'patients', genre: 'fiche', id: 'P01', libelle: 'Patient : ALPHA Camille', service: SVd }],
            versions: [{ h: -24 * 3, contenu: { blocs: [ti(2, 'Sortie à la médiathèque — jeudi (fictif)'), p('Départ 14 h, retour 16 h 30. Deux accompagnateurs ; véhicule réservé.'), p('Organisation seulement : aucune donnée clinique.', { al: 'c' })] } }] });
          await docD({ titre: 'Protocole de gestion des clés du service (fictif)', h: -24 * 400, partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            versions: [{ h: -24 * 400, contenu: { blocs: [ti(1, 'Gestion des clés du service (fictif)'), p('Les clés sont rangées dans la boîte à code ; chaque emprunt est noté sur la feuille des emprunts.')] } }],
            suite: [{ h: -24 * 399, type: 'DOC_VALIDATION', data: { version: 0, revision: jC(-5), message: '' } }] });
          await docD({ titre: 'Planning des formations AFGSU (fictif)', h: -24 * 9, auteur: 'demo-a', nom: 'Agent A (fictif)', partage: [{ genre: 'agent', code: moiT.id, droit: 'modifier' }], suite: [{ h: -24 * 9, par: 'demo-a', type: 'DOC_OPTIONS', data: { simultane: true, suivi: false } }],
            versions: [{ h: -24 * 9, contenu: { blocs: [ti(1, 'Formations aux gestes et soins d’urgence (fictif)'), p('Sessions prévues : 3 et 17 du mois prochain. Inscriptions auprès de l’agent A.')] } }] });
          // Validation supplémentaire demandée à l'agent connecté par un autre cadre (0.34.1)
          await docD({ titre: 'Charte d’utilisation du téléphone du service (fictif)', h: -24 * 4, auteur: 'demo-a', nom: 'Agent A (fictif)', partage: [{ genre: 'service', code: SVd, droit: 'lire' }, { genre: 'agent', code: moiT.id, droit: 'lire' }],
            versions: [{ h: -24 * 4, par: 'demo-a', contenu: { blocs: [ti(1, 'Téléphone du service (fictif)'), p('Le téléphone portable du service reste dans le bureau infirmier ; il est rechargé chaque nuit.'), li('Appels professionnels seulement'), li('Messages effacés à la fin de chaque poste')] } }],
            suite: [{ h: -24 * 3, par: 'demo-a', type: 'DOC_STATUT', data: { statut: 'a-valider', message: '' } },
              { h: -24 * 2, par: 'demo-cadre', type: 'DOC_VALIDATION', data: { nom: 'Cadre de santé (fictif)', version: 0, revision: jC(365), message: 'Validé pour l’unité ; avis du cadre de pôle demandé. (fictif)', supplementaire: moiT.id } }] });
          // Document d'un agent dont le compte a été retiré : gestion transférée au cadre (0.34.1)
          await docD({ titre: 'Fiches réflexes de l’équipe de nuit (fictif)', h: -24 * 120, auteur: 'demo-ancien', nom: 'Ancien agent (fictif)', partage: [{ genre: 'agent', code: moiT.id, droit: 'gerer' }],
            versions: [{ h: -24 * 120, contenu: { blocs: [ti(1, 'Fiches réflexes — nuit (fictif)'), p('Appel du médecin de garde : numéro affiché au bureau infirmier.')] } }],
            suite: [{ h: -24 * 30, par: 'demo', type: 'DOC_TRANSFERT', data: { vers: [moiT.id] } }] });
          // Tableur (0.35.0) : budget des activités avec formules, formats, titre fusionné, 1re ligne figée, deux feuilles
          var TBd = SIC.tableur, sd = TBd.serieDepuis, aujd = new Date(now), an = aujd.getFullYear(), mo = aujd.getMonth() + 1;
          var gT = { g: true, f: 'vert', bd: true, al: 'c' }, eur = { fmt: 'eur' }, dt = { fmt: 'date' };
          var cases = { A1: { v: 'Budget des activités du service (fictif)', s: { g: true, z: 14 } },
            A2: { v: 'Activité', s: gT }, B2: { v: 'Date', s: gT }, C2: { v: 'Participants', s: gT }, D2: { v: 'Coût unitaire', s: gT }, E2: { v: 'Total', s: gT }, F2: { v: 'Part du budget', s: gT } };
          [['Sortie au marché', 3, 6, 4.5], ['Atelier cuisine', 8, 5, 7.2], ['Médiathèque', 12, 8, 0], ['Piscine', 17, 4, 3.8], ['Cinéma', 23, 6, 6.5]].forEach(function (x, i) {
            var l = i + 3; cases['A' + l] = { v: x[0] }; cases['B' + l] = { v: sd(an, mo, Math.min(28, x[1])), s: dt }; cases['C' + l] = { v: x[2] }; cases['D' + l] = { v: x[3], s: eur };
            cases['E' + l] = { f: '=C' + l + '*D' + l, s: eur }; cases['F' + l] = { f: '=SIERREUR(E' + l + '/$E$9;0)', s: { fmt: 'pct', dec: 1 } };
          });
          Object.assign(cases, { A9: { v: 'Total', s: { g: true, bd: true } }, C9: { f: '=SOMME(C3:C7)', s: { g: true, bd: true } }, E9: { f: '=SOMME(E3:E7)', s: { g: true, bd: true, fmt: 'eur' } },
            A10: { v: 'Budget mensuel' }, E10: { f: '=Réglages!B1', s: eur }, A11: { v: 'Reste' }, E11: { f: '=E10-E9', s: { g: true, fmt: 'eur', c: 'vert' } },
            A12: { v: 'Activités sans coût' }, E12: { f: '=NB.SI(D3:D7;0)' } });
          await docD({ titre: 'Budget des activités (fictif)', genre: 'tableur', h: -24 * 5, partage: [{ genre: 'role', code: 'IDE', service: SVd, droit: 'modifier' }],
            versions: [{ h: -24 * 5, contenu: { genre: 'tableur', feuilles: [{ nom: 'Activités', cellules: cases, largeurs: { 0: 170, 1: 95, 2: 95, 3: 105, 4: 95, 5: 115 }, fusions: [{ l: 0, c: 0, nl: 1, nc: 6 }], figer: { l: 0 } },
              { nom: 'Réglages', cellules: { A1: { v: 'Budget mensuel' }, B1: { v: 150, s: eur }, A2: { v: 'Mis à jour le' }, B2: { v: sd(an, mo, 1), s: dt } }, largeurs: { 0: 140 } }], page: { entete: { gauche: '{service}', centre: '{titre}', droite: '{date}' } } } }] });
          // Suivi des formations (0.36.0) : échéances en couleur (date passée, dans les 60 jours), liste de choix, filtre
          var jd = TBd.serieDepuis(an, mo, aujd.getDate()), cf = { A1: { v: 'Agent', s: gT }, B1: { v: 'Formation', s: gT }, C1: { v: 'Échéance', s: gT }, D1: { v: 'Statut', s: gT } };
          [['Agent A (fictif)', 'AFGSU', 200, 'À jour'], ['Agent B (fictif)', 'AFGSU', -10, 'À planifier'], ['Agent C (fictif)', 'Incendie', 25, 'Inscrit'], ['Agent D (fictif)', 'Incendie', 400, 'À jour'],
            ['Agent A (fictif)', 'Gestes et postures', 45, 'À planifier'], ['Agent C (fictif)', 'AFGSU', -40, 'Inscrit']].forEach(function (x, i) {
            var l = i + 2; cf['A' + l] = { v: x[0] }; cf['B' + l] = { v: x[1] }; cf['C' + l] = { v: jd + x[2], s: dt }; cf['D' + l] = { v: x[3] };
          });
          await docD({ titre: 'Suivi des formations obligatoires (fictif)', genre: 'tableur', h: -24 * 7, partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            versions: [{ h: -24 * 7, contenu: { genre: 'tableur', feuilles: [{ nom: 'Formations', cellules: cf, largeurs: { 0: 160, 1: 160, 2: 110, 3: 120 }, figer: { l: 1 },
              conditions: [{ plage: { l1: 1, c1: 2, l2: 200, c2: 2 }, op: 'passe', style: { f: 'rose', c: 'rouge', g: true } }, { plage: { l1: 1, c1: 2, l2: 200, c2: 2 }, op: 'proche', v1: 60, style: { f: 'orange' } },
                { plage: { l1: 1, c1: 3, l2: 200, c2: 3 }, op: '=', v1: 'À jour', style: { c: 'vert' } }],
              validations: [{ plage: { l1: 1, c1: 3, l2: 200, c2: 3 }, genre: 'liste', valeurs: ['À jour', 'À planifier', 'Inscrit'] }, { plage: { l1: 1, c1: 2, l2: 200, c2: 2 }, genre: 'date', bloquant: true }],
              filtre: { l: 0, c1: 0, c2: 3, masques: {} } }] } }] });
          await docD({ titre: 'Inventaire du matériel (modèle fictif)', genre: 'tableur', h: -24 * 50, modele: true, services: [SVd], partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            versions: [{ h: -24 * 50, contenu: { genre: 'tableur', feuilles: [{ nom: 'Inventaire', cellules: { A1: { v: 'Matériel', s: gT }, B1: { v: 'Quantité', s: gT }, C1: { v: 'Seuil', s: gT }, D1: { v: 'À commander', s: gT },
              D2: { f: '=SI(B2<C2;"oui";"")' }, D3: { f: '=SI(B3<C3;"oui";"")' }, D4: { f: '=SI(B4<C4;"oui";"")' } }, largeurs: { 0: 200 }, figer: { l: 1 } }] } }] });
          // Onglets (0.39.0) : livret d'accueil en trois onglets
          await docD({ titre: 'Livret d’accueil du service (fictif)', h: -24 * 15, partage: [{ genre: 'service', code: SVd, droit: 'lire' }],
            versions: [{ h: -24 * 15, contenu: { onglets: [
              { id: 'presentation', titre: 'Présentation', blocs: [ti(1, 'Bienvenue dans le service (fictif)'), p('Le service accueille des patients adultes. Ce livret présente l’organisation de l’équipe.')] },
              { id: 'organisation', titre: 'Organisation', blocs: [ti(2, 'Horaires des équipes'), li('Matin : 6 h 45 – 14 h 15'), li('Après-midi : 13 h 45 – 21 h 15'), li('Nuit : 21 h – 7 h'), ti(2, 'Transmissions'), p('Transmissions orales à chaque relève, au bureau infirmier.')] },
              { id: 'contacts', titre: 'Contacts utiles', blocs: [{ t: 'table', entete: true, lignes: [[{ runs: [{ x: 'Qui', g: true }] }, { runs: [{ x: 'Poste', g: true }] }], [{ runs: [{ x: 'Cadre de santé' }] }, { runs: [{ x: '4500' }] }], [{ runs: [{ x: 'Secrétariat' }] }, { runs: [{ x: '4520' }] }]] }, p('Numéros fictifs.')] }] } }] });
          await docD({ titre: 'Ancienne note sur les visites (fictif)', h: -24 * 90,
            versions: [{ h: -24 * 90, contenu: { blocs: [p('Note remplacée par le règlement intérieur. (fictif)')] } }],
            suite: [{ h: -24 * 25, type: 'DOC_CORBEILLE', data: { corbeille: true } }] });
        }
        if (moiT && session.aClePersonnelle && session.aClePersonnelle()) {
          var lotT = [], nT = 0;
          var tp = async function (h0, contenu) { lotT.push({ at: at(h0), by: moiT.id, type: 'TACHE_PERSO', data: { id: 'TP-DEMO' + (++nT), agent: moiT.id, chiffre: await session.chiffrerPersonnel('taches', contenu) } }); };
          await tp(-20, { titre: 'Préparer le planning de décembre (fictif)', echeance: jC(2), heure: '', rappel: '2', note: 'Penser aux congés de fin d’année.', element: null, fait: false, faitLe: '' });
          await tp(-48, { titre: 'Relancer les services techniques pour le salon (fictif)', echeance: jC(-1), heure: '10:00', rappel: '0', note: '', element: { module: 'travaux', genre: 'demande', id: 'TR-SAL', service: 'U1' }, fait: false, faitLe: '' });
          await tp(-10, { titre: 'Lire la nouvelle note de service (fictif)', echeance: '', heure: '', rappel: '', note: '', element: null, fait: false, faitLe: '' });
          await tp(-72, { titre: 'Commander les badges des stagiaires (fictif)', echeance: jC(-2), heure: '', rappel: '', note: '', element: null, fait: true, faitLe: at(-24) });
          await session.enregistrerLot(lotT, { libelle: 'Tâches personnelles fictives', by: moiT.id, sansControle: true });
        }
      } catch (e) { if (typeof console !== 'undefined') console.warn('Démonstration incomplète : ' + e.message); /* démonstration sans ces valeurs */ }
    }
  };
})(typeof self !== 'undefined' ? self : this);
