# Guide utilisateur

*Tessera Santé — connexion, modules, fiche patient, agenda du service, journal. À lire en 15 minutes. Le module Isolement et contention a son propre guide (document 12) et un guide pratique illustré pour les IDE et AS (document 08).*

Tessera ne remplace pas le dossier patient informatisé (DPI) : le dossier clinique y reste. **N'écrivez aucune donnée clinique dans Tessera** (motif d'un accompagnement, symptôme, traitement) : seulement ce qui sert à organiser et à tracer.

## 1. Se connecter

1. Ouvrir le lien ou l'icône de Tessera Santé (Edge ou Chrome).
2. Cliquer *Reprendre* (ou, la première fois, *Ouvrir le dossier réseau du service* et choisir le dossier indiqué par votre cadre). Autoriser l'accès si le navigateur le demande.
3. Saisir votre identifiant et votre mot de passe, laisser **Données réelles** coché, puis *Se connecter*.
4. **Première connexion** (ou après une réinitialisation) : choisissez aussitôt votre mot de passe personnel, d'au moins 12 caractères (une courte phrase est facile à retenir). Bouton *Mot de passe* pour le changer ensuite.
5. La session se verrouille seule après quelques minutes sans activité ; pensez à *Verrouiller* en quittant le poste. Un compte est personnel : ne le prêtez pas.

À l'ouverture de votre session, l'outil vérifie que le coffre des clés est bien celui signé par l'administrateur. S'il affiche une alerte sur l'intégrité du coffre, ne saisissez rien et prévenez votre cadre ou l'administrateur.

## 2. L'écran

- **En-tête** : liste des services (seulement ceux qui vous sont affectés), votre nom et vos rôles, *Mot de passe*, *Exports*, *☾ Sombre* / *☀ Clair* (affichage mémorisé pour votre compte), *À propos*, *Verrouiller*.
- **Barre des modules**, en bas de l'écran (comme la barre des tâches de Windows) : un bouton par module ouvert à vos rôles, avec son icône — *Patients*, *Isolement et contention*, *Agenda du service*, *Administration* (administrateur). Un clic ouvre la fenêtre du module ; l'onglet que vous y aviez laissé est retrouvé.
- **Fenêtre du module** : son nom et son icône, puis **ses propres onglets** — par exemple *Liste des patients* pour Patients ; *Agenda*, *Alertes*, *Mon agenda*, *Tâches récurrentes* pour l'Agenda ; *Patients* (statistiques par patient), *Tableau de bord*, *Mesures*, *JLD*… pour l'isolement et la contention. Le *Journal* est le dernier onglet de chaque fenêtre.
- **Onglet Journal** : les saisies que votre rôle vous permet de voir (section 6).

Vous voyez un module dans un service si le module y est **activé**, si vous êtes **affecté** au service et si votre **rôle** y donne accès. S'il vous manque un module ou un service, demandez à l'administrateur.

## 3. Patients : la fiche commune

La fiche patient est partagée par tous les modules : une correction faite ici vaut partout.

- **Liste des patients** (fenêtre *Patients*), réglable par chacun :
  - *Patients* : hospitalisés, hospitalisés et sorties récentes (7 derniers jours par défaut), ou tous ;
  - *Présentation* : en liste, ou **par chambre** ;
  - *Tri* (ou clic sur l'en-tête d'une colonne), *recherche* (nom, IPP, chambre), *Filtres* (mode d'hospitalisation, médecin, référent) ;
  - *Couleur selon le mode* : couleur de la ligne ou du texte selon le mode d'hospitalisation (couleurs réglées par l'établissement) ;
  - *Colonnes…* : colonnes affichées et leur ordre (IPP, âge, unité, chambre et lit, entrée, sortie, mode, médecins, référents, psychologue, suivi social, protection… et, si vous avez accès à l'isolement et la contention, mesures en cours, cumuls sur 15 jours et vigilance) ;
  - *Affichage* : affichages proposés par l'établissement pour votre service et votre métier (par exemple « Par chambre », « Isolement et contention ») et **vos affichages** (*Enregistrer cet affichage…*, gardés pour votre compte sur tous les postes).
- **Statistiques d'isolement et de contention par patient** et *Fiches peut-être en double* : onglet *Patients* de la fenêtre *Isolement et contention* (inchangé) ; la fusion est réservée au cadre de santé (*Fusionner…*).
- **+ Nouvelle fiche** (IDE, secrétaire, cadre par défaut ; l'AS consulte) : nom, prénom, nom de naissance, sexe, date de naissance, identifiant permanent du patient (IPP), service ; selon le service, médecins de 1re et 2e ligne, référents soignants, **psychologue référent**, **suivi par l'assistant(e) social(e) du service** (oui ou non, nom facultatif), **données complémentaires** réglées par l'établissement pour le service (chacun saisit celles que son rôle permet), protection juridique, et en psychiatrie le **mode d'hospitalisation** (avec sa date de début). Le mode fait partie de la fiche : il est lu par tous les modules.
- **Fiche** : *Modifier* les champs ; mode d'hospitalisation actuel et *Historique et changement…* (changement daté, rétroactif possible) ; **séjours** (*+ Nouveau séjour* : numéro de séjour ou IEP, entrée, sortie, unité, chambre et lit ; le séjour en cours est affiché en tête) ; **historique** de chaque champ (qui, quand, ancienne → nouvelle valeur).
- **Agenda du patient** (dans la fiche) : les éléments des 60 prochains jours qui le concernent ; *+ Événement pour ce patient* ouvre l'ajout à l'agenda avec le patient déjà choisi.
- **Importer la liste du DPI…** : reprise de la liste des patients présents exportée du dossier patient informatisé (document 11).
- **Exporter ses données (droit d'accès)** (cadre, administrateur) : toutes les données du patient, tous modules confondus, sans le nom des professionnels ; l'export est tracé au journal.

## 4. Agenda du service

### Consulter

- Onglet *Agenda* : vue **Semaine** ou **Jour**, flèches ◀ ▶ et *Aujourd'hui*, filtre par type (accompagnement, entretien, activité thérapeutique, réunion, permission de sortie, sortie du patient, autre événement, tâches).
- **Semaine** : en haut de chaque jour, une ligne **« Sans heure »** (alertes, échéances JLD, permissions à faire valider, tâches sans heure, absences, éléments sur plusieurs jours comme une permission de week-end) ; dessous, une **grille horaire** où chaque élément est placé à son heure, ceux qui se chevauchent côte à côte ; une ligne rouge marque l'heure actuelle. Un clic sur le nom d'un jour ouvre la journée.
- **Jour** : une **colonne par type** (accompagnements, entretiens, activités, réunions, sorties et permissions, tâches), chacune avec sa ligne « sans heure » ; absents et alertes du jour en tête.
- Chaque élément a la **couleur de son type** (légende sous la grille ; couleurs réglables par l'établissement) et montre la plage horaire, les patients désignés selon le réglage — initiales par défaut —, les professionnels prévus, les accompagnateurs, la check-list, la répétition (↻). Survolez un élément pour le lire en entier.
- Un élément marqué du nom d'un **autre service** concerne un patient hospitalisé chez vous (par exemple un accompagnement par l'équipe d'une autre unité) : il se consulte ici et se modifie dans l'agenda de son service. Vous pouvez toujours y **ajouter un commentaire**.
- En tête, un **résumé** signale les alertes de l'équipe, les échéances du juge des libertés et de la détention (JLD) sous 72 h et les points de check-list en retard : *Voir les alertes*.

### Planifier (accès « Planifier » : IDE, secrétaire, cadre par défaut)

*+ Nouveau* : choisissez ce que vous ajoutez — un événement (catégories du service : accompagnement, entretien, examen, activité, réunion, audience JLD, permission de sortie, sortie du patient, autre, et celles ajoutées par l'établissement ; les préréglages de la catégorie remplissent durée, lieu, transports…) ou une **tâche** (tâche de l'équipe ; tâche du service pour les rôles qui règlent les tâches). Pour un événement : intitulé, **jour et heure de début, jour et heure de fin** (un élément peut durer plusieurs jours, par exemple une permission de 48 h ; une alerte prévient au-delà de la durée maximale de la catégorie), lieu, service, patients du service (recherche), professionnels prévus (comptes du service, ou nom libre pour un intervenant extérieur). Un professionnel prévu qui a saisi une absence ce jour-là est signalé sur l'élément.

- **Entretien** : médical ou infirmier, individuel ou avec la famille ; un ou plusieurs professionnels prévus. L'intitulé est facultatif.
- **Accompagnateurs nécessaires** : indiquez combien d'accompagnateurs il faut, sans les nommer. Les agents **s'inscrivent** eux-mêmes (bouton *S'inscrire* sur l'élément, date par date) et peuvent *Me désinscrire* ; l'élément affiche « Accompagnateurs 1/2 » (en orange tant qu'il en manque). Les professionnels prévus comptent. Dans l'élément ouvert, *Inscrire un collègue…* (IDE, AS, secrétaire, cadre par défaut) inscrit ou désinscrit un collègue : **il en est informé dans sa session** (bandeau en tête de l'agenda et de *Mon agenda*, pastille rouge sur le bouton *Agenda du service* de la barre des modules) jusqu'à ce qu'il clique *Vu*.
- **Permission de sortie** : notez la **demande** du patient (statut « Permission de sortie (demande) »). Une alerte « Faire valider la permission » s'affiche dans l'agenda et dans l'onglet *Alertes* jusqu'à la validation médicale, attendue avant le début selon le mode d'hospitalisation (par défaut 48 h avant pour un patient en SDRE, 24 h pour SDT, SDTU et SPI, jusqu'au dernier moment en soins libres ; réglable) ; elle passe en rouge une fois l'échéance dépassée. Une fois la permission signée, ouvrez-la, choisissez « Permission validée » et le médecin signataire.
- **Examen** : type d'examen (liste proposée ou texte libre), lieu ; cochez *VSL à prévoir* et *Patient accompagné* si besoin.
- **Audience JLD** (services de psychiatrie) : patients convoqués, VSL à réserver (un ou plusieurs), soignants à prévoir.
- **Ajouter** (barre sous la répétition, pour tout événement) : *+ Patients*, *+ Transport* (VSL, taxi, ambulance, véhicule du service ; nombre, précision), *+ Accompagnateur* (nombre à trouver ; un accompagnateur désigné se coche dans *Professionnels prévus*), *+ Permission à faire valider*, *+ Validation (médicale ou autre)* avec son intitulé et son délai. Une fois l'élément enregistré, ouvrez-le à la bonne date pour *Marquer réservé* un transport ou enregistrer une validation (*Validée (signée)…*, *Refusée…*, avec le nom du signataire). Tant que ce n'est pas fait, l'agenda affiche « Réserver : … » ou « Faire valider … ».
- **Élément répété ouvert à une date** : choisissez en haut de la fenêtre **cette date seulement** (par défaut) ou **toutes les dates**. Pour une date, vous réglez ses patients, professionnels prévus, accompagnateurs, transports, validations, check-list, horaires (vous pouvez la décaler, même à un autre jour) et lieu ; « Date modifiée » s'affiche sur l'élément. *Annuler cette date…* la garde barrée dans l'agenda (ex. « aucun patient convoqué ») ; *Rétablir cette date* ; *Reprendre les réglages communs*. Le type, le service et la répétition se changent pour toutes les dates. Exemple : l'audience JLD chaque mercredi de 9 h 30 à midi, créée sans patient (elle s'affiche alors en transparence ; l'établissement choisit les catégories concernées dans *Administration → Agenda du service → Catégories d'événements*, audience JLD par défaut), puis complétée chaque semaine avec les patients convoqués, les VSL et les soignants.
- **Répétition** : tous les jours ou tous les N jours ; chaque semaine ou toutes les N semaines, jours cochés (ex. **le mercredi tous les 15 jours**, mardi et vendredi) ; chaque mois ou tous les N mois à la même date ; ou **un jour repéré** : *Le* [1er, 2e… dernier, avant-dernier] [lundi… dimanche, week-end, jour ouvré, jour] [du mois, du trimestre, du semestre, de l'année] (ex. **1er dimanche du trimestre**, **dernier vendredi du mois**, dernier week-end du mois). La répétition choisie s'affiche en toutes lettres sous les champs. Jusqu'à une date ou sans fin. Une modification s'applique à toutes les dates. *Retirer cette date* supprime une seule date ; *Retirer cette date et les suivantes* arrête la répétition à partir de la date ouverte.
- **Check-list** (ex. sortie d'un patient) : *Ajouter un modèle…* reprend une liste réglée par l'établissement ; on peut ajouter des points libres. Chaque point a un **délai** (le jour même, la veille, 2 jours avant…) : non coché à temps, il passe « en retard » (rouge). Les points se cochent après l'enregistrement, date par date (qui et quand sont gardés).

### Tâches

- Les tâches s'ajoutent **dans l'agenda** (*+ Nouveau*). Elles apparaissent chaque jour dû : à leur heure dans la grille, ou dans la ligne « sans heure ». Cochez-les quand elles sont faites (nom et heure gardés) ; un clic sur leur nom les modifie si votre rôle le permet. Une tâche affectée à un agent porte son nom (« → nom »).
- Onglet *Tâches récurrentes* (rôles qui règlent ou ajustent les tâches) : la liste des tâches du service et des tâches récurrentes :
  - **tâche du service** (créée par le cadre ou un rôle qui règle les tâches) : vous la cochez ; avec l'accès « Ajuster les tâches du service » (IDE par défaut), vous pouvez **affecter un agent** pour une date ou certains jours de la répétition (bouton *Affecter* dans l'agenda, ou *Ajuster*), et selon le réglage changer l'heure ou la précision. Vous ne pouvez pas la supprimer ;
  - **tâche de l'équipe** (*+ Nouveau → Tâche de l'équipe* dans l'agenda) : toute l'équipe peut la modifier ou la supprimer ; ponctuelle seulement, sauf si l'établissement permet les tâches récurrentes.

### Absences

*+ Absence* (agenda ou *Mon agenda*) : chacun saisit les siennes ; le cadre saisit celles de l'équipe. Premier et dernier jour ; **motif facultatif** (congé, formation, réunion extérieure, autre), jamais de motif médical.

### Alertes

Onglet *Alertes* :

- **Alertes de l'équipe** (*+ Nouvelle alerte*) : type (liste du service : à voir par le médecin, par le psychologue… ou « Autre » avec un intitulé), patient du service facultatif, « à faire avant le » (date, heure), pour toute l'équipe, un rôle ou une personne, précision sans donnée clinique. L'alerte reste affichée jusqu'à **Vu** (qui, quand) ; *Remettre à voir* si besoin. Elle passe en rouge une fois la date dépassée.
- **Échéances JLD** (si votre rôle a l'accès aux envois au JLD) : prochaine démarche de chaque mesure d'isolement ou de contention en cours, dépassée ou dans les 72 heures, calculée par le module Isolement et contention. L'envoi se trace dans ce module (onglet *JLD*).
- **Permissions et validations à obtenir** : échéance de chaque validation (selon le mode d'hospitalisation pour une permission) ; un clic ouvre l'élément.
- **Transports à réserver** (15 jours) et **accompagnateurs à trouver** (7 jours, avec *S'inscrire*).
- **Points de check-list en retard** et **réunions des 7 prochains jours** : un clic ouvre l'élément.

### Mon agenda

Votre semaine, tous vos services réunis : éléments où vous êtes prévu(e) ou inscrit(e) comme accompagnateur, tâches qui vous sont affectées ou qui reviennent à votre rôle, vos absences, et les alertes qui vous sont adressées. Cette vue reste dans Tessera : rien n'est copié dans un autre agenda.

## 5. Véhicules de l'établissement

Fenêtre *Véhicules* (icône de voiture ; la pastille compte les signalements en cours).

- **Véhicules** : une carte par véhicule du service (et des véhicules prêtés ou mis à disposition par un autre service) : immatriculation, places, parking, informations ajoutées par l'établissement, signalements en cours, prêts, prochaines réservations.
- **Réserver** : choisissez le service, le véhicule, le départ et le retour ; l'écran indique aussitôt si le véhicule est **disponible** (ou pourquoi il ne l'est pas : déjà réservé, prêté, hors service). Motif court, sans donnée clinique. Vous pouvez annuler votre propre réservation.
- **Pré-réserver** (Nature : « Pré-réservation », motif obligatoire) : le véhicule reste réservable. Qui réserve sur ce créneau voit votre nom et votre motif et peut forcer la réservation ; vous en êtes alors informé(e), ainsi que le cadre et la secrétaire du service (bandeau dans la fenêtre Véhicules, à marquer « Vu »). *Confirmer la réservation* transforme une pré-réservation en réservation.
- **Depuis l'agenda** : dans un événement, *+ Transport* puis « Véhicule du service » et choix du véhicule (disponibilité affichée selon les horaires). À l'enregistrement, le véhicule est réservé et le transport passe « réservé » ; si le véhicule est déjà pris, vous êtes averti(e) avant d'enregistrer. La réservation suit l'événement : horaires ou véhicule changés, date annulée, événement supprimé. Pour un événement répété, les dates des 4 prochaines semaines sont réservées d'office, les suivantes avec *Réserver le véhicule* à la date.
- **Réservations** : planning sur 7 jours, une ligne par véhicule ; réservation en pointillé = faite depuis l'agenda ; « + » réserve le véhicule ce jour-là.
- **Signalements** : *Signaler…* (faire le plein, voyant allumé, à nettoyer, entretien à prévoir, dégât, information) ; *Fait* quand c'est réglé.
- **Cadre** : *+ Nouveau véhicule*, *Modifier* (décochez « En service » pendant une immobilisation), *Prêter ou mettre à disposition…* (prêt : seul le service emprunteur réserve pendant la période ; mise à disposition : d'autres services peuvent aussi réserver). *Administration → Véhicules* : types de véhicules, informations ajoutées (oui ou non, texte, liste, date, nombre), types de signalements.

## 6. Isolement et contention

Voir le guide du module (document 12) et le guide pratique des IDE et AS (document 08).

## 7. Journal, corrections et annulations

- Onglet *Journal* : chaque saisie, avec son auteur, son heure, le patient et l'élément concernés, l'ancienne et la nouvelle valeur. Selon votre rôle : journal complet, saisies de vos services, ou vos propres saisies seulement.
- Rien n'est jamais effacé : une correction ou une annulation est elle-même une saisie. *Annuler* sur une ligne (rôles autorisés : cadre pour les saisies de soin et d'organisation, administrateur pour les réglages et les imports) demande un motif ; *Rétablir* défait une annulation faite par erreur.
- *Saisies en conflit à arbitrer* : deux agents ont modifié la même donnée au même moment ; un cadre choisit celle à garder.

## 8. Mode formation

Sur l'écran de connexion, choisissez **Mode formation** au lieu de *Données réelles* : vous retrouvez votre compte, vos rôles et vos services avec un jeu de données **entièrement fictif**, pour vous entraîner. Un **bandeau violet** reste affiché : n'y saisissez jamais de donnée réelle. Pour revenir : *Passer aux données réelles*.

## 9. Cadre de santé et administrateur

- **Organisation de l'administration** (fenêtre *Administration*) : onglet *Réglages généraux* (comptes et sécurité, établissement et services, sauvegardes et exports, à propos), puis **un onglet par module** (*Isolement et contention*, *Patients*, *Agenda du service*), chacun avec ses rubriques.
- **Rôles et accès** (*Administration → Réglages généraux → Comptes et sécurité*) : les accès sont groupés par module, en langage courant. Droits proposés par défaut :

  | Rôle | Patients | Agenda | Isolement et contention |
  | --- | --- | --- | --- |
  | IDE | Créer et corriger les fiches, mode d'hospitalisation | Planifier ; ajuster les tâches du service ; tâches de l'équipe ; cocher tâches et check-lists ; alertes | Mesures, pauses, tiers, envois au JLD, surveillance |
  | AS | Consulter (le mode d'hospitalisation se saisit avec la mesure) | Tâches de l'équipe ; cocher tâches et check-lists ; alertes | Comme l'IDE, sauf les fiches patient |
  | Secrétaire | Créer et corriger les fiches, mode d'hospitalisation | Planifier ; tâches de l'équipe ; cocher tâches et check-lists | Envois au JLD, recours |
  | Cadre de santé | Tout, dont fusion | Tout, dont régler les tâches du service et les absences de l'équipe | Tout, dont corrections, annulations, statistiques |

  Tout se modifie : rôles fournis, rôles créés par l'établissement (ex. « Direction des soins », « Consultation »), onglets masqués, niveau du journal. Un rôle sans aucun accès dans un module n'y entre pas et n'en reçoit pas la clé. *Affichage* (en-tête, administrateur) montre l'outil tel qu'un rôle le voit, sans rien enregistrer.
- **Modules activés par service** (*Administration → Réglages généraux → Établissement et services*) : désactiver un module dans un service conserve ses données en consultation.
- **Données complémentaires de la fiche patient** (*Administration → Patients → Données complémentaires*) : tableau des données propres à l'établissement ou à certains services (ex. sorties libres, éducateur référent, repas favori) : nom, **type de valeur attendu** (oui ou non, texte court, liste de choix, date, nombre, professionnel), services concernés, rôles qui la saisissent (par défaut ceux qui ont l'accès aux fiches ; on peut l'ouvrir par exemple aux aides-soignants), rôles qui la voient. Elles apparaissent dans la fiche, comme colonnes et filtres de la liste des patients, et dans l'export du droit d'accès. **Aucune donnée clinique** ; une donnée qui n'est plus utilisée se masque (ses valeurs restent au journal). Chaque donnée ajoutée est à inscrire à la fiche du registre des traitements.
- **Affichages par défaut de la liste des patients** (*Administration → Patients → Liste des patients*) : pour chaque affichage, nom, services et métiers concernés, périmètre, présentation, tri, couleur selon le mode et **colonnes affichées** (à cocher et à ordonner), ou *Reprendre l'affichage en cours* ; durée des sorties récentes ; couleur de chaque mode.
- **Catégories d'événements** (*Administration → Agenda du service → Catégories d'événements*) : pour l'établissement, puis si besoin pour un service (qui hérite de l'établissement) : nom, couleur, catégorie proposée ou masquée, et **préréglages** appliqués à la création (durée, heure de début, durée maximale avec alerte au-delà, lieu, intitulé, section Patients, accompagnateurs à trouver, transports, permission et validations, check-list, transparence sans patient prévu, services de psychiatrie seulement). *Ajouter une catégorie* (ex. « Consultation dentaire », comme un examen) ; un service peut avoir ses propres catégories.
- **Réglages de l'Agenda** (*Administration → Agenda du service → Réglages de l'agenda*) : désignation des patients, modification des éléments d'un autre service, ajustement des tâches du service, tâches récurrentes de l'équipe, modèles de check-lists et délais, types d'alertes (de l'établissement, ou propres à un service).
- **Intégrité du coffre** (*Administration → Comptes et sécurité*, administrateur) : « Coffre attesté » en temps normal ; conduite à tenir en cas d'alerte ou de compromission : procédures de secours (document 04).
- **Sauvegardes et exports**, dossier de secours, travail hors réseau, exports, export et import des réglages : guide d'installation (03), procédures de secours (04), documents 09 et 10.

## 10. En cas de problème

- *Dossier inaccessible* ou application indisponible : procédure dégradée papier (document 04), puis ressaisie avec les heures réelles.
- *Mot de passe oublié* : demandez une réinitialisation à l'administrateur ; il vous remettra un mot de passe provisoire.
- *Erreur de saisie* : prévenez votre cadre, qui corrige avec un motif tracé.
- *Module ou service absent* : demandez à l'administrateur de vérifier vos services et les accès de votre rôle.
