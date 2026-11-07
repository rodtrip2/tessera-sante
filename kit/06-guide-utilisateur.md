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

- **En-tête** : liste *Module* (si plusieurs modules vous sont ouverts), liste des services (seulement ceux qui vous sont affectés), votre nom et vos rôles, *Mot de passe*, *Exports*, *☾ Sombre* / *☀ Clair* (affichage mémorisé pour votre compte), *À propos*, *Verrouiller*.
- **Onglet Accueil** : les modules ouverts à vos rôles dans vos services ; un clic ouvre le module.
- **Onglet Patients** : commun à tous les modules (section 3).
- **Onglets du module affiché** : par exemple *Agenda*, *Alertes*, *Mon agenda*, *Tâches du service* pour l'Agenda ; *Tableau de bord*, *Mesures*, *JLD*… pour l'isolement et la contention.
- **Onglet Journal** : les saisies que votre rôle vous permet de voir (section 6).

Vous voyez un module dans un service si le module y est **activé**, si vous êtes **affecté** au service et si votre **rôle** y donne accès. S'il vous manque un module ou un service, demandez à l'administrateur.

## 3. Patients : la fiche commune

La fiche patient est partagée par tous les modules : une correction faite ici vaut partout.

- **Liste** : patients de vos services, recherche, badges (patient détenu, protection juridique…). *Fiches peut-être en double* : deux fiches qui se ressemblent sont signalées ; la fusion est réservée au cadre de santé (*Fusionner…*).
- **+ Nouvelle fiche** (IDE, secrétaire, cadre par défaut ; l'AS consulte) : nom, prénom, nom de naissance, sexe, date de naissance, identifiant permanent du patient (IPP), service ; selon le service, médecins de 1re et 2e ligne, référents soignants, protection juridique, et en psychiatrie le mode d'hospitalisation.
- **Fiche** : *Modifier* les champs ; **séjours** (*+ Nouveau séjour* : numéro de séjour ou IEP, entrée, sortie, unité, chambre et lit ; le séjour en cours est affiché en tête) ; **historique** de chaque champ (qui, quand, ancienne → nouvelle valeur).
- **Importer la liste du DPI…** : reprise de la liste des patients présents exportée du dossier patient informatisé (document 11).
- **Exporter ses données (droit d'accès)** (cadre, administrateur) : toutes les données du patient, tous modules confondus, sans le nom des professionnels ; l'export est tracé au journal.

## 4. Agenda du service

### Consulter

- Onglet *Agenda* : vue **Jour** ou **Semaine**, flèches ◀ ▶ et *Aujourd'hui*, filtre par type (accompagnement, activité thérapeutique, réunion, sortie ou permission, autre événement).
- Chaque jour montre les **absences** des professionnels, les **tâches** dues et les **éléments** (plage horaire, patients désignés selon le réglage — initiales par défaut —, professionnels prévus, check-list, répétition).
- Un élément marqué du nom d'un **autre service** concerne un patient hospitalisé chez vous (par exemple un accompagnement par l'équipe d'une autre unité) : il se consulte ici et se modifie dans l'agenda de son service. Vous pouvez toujours y **ajouter un commentaire**.
- En tête, un **résumé** signale les alertes de l'équipe, les échéances du juge des libertés et de la détention (JLD) sous 72 h et les points de check-list en retard : *Voir les alertes*.

### Planifier (accès « Planifier » : IDE, secrétaire, cadre par défaut)

*+ Nouveau* : type, intitulé, date, heures de début et de fin, lieu, service, patients du service (recherche), professionnels prévus (comptes du service, ou nom libre pour un intervenant extérieur). Un professionnel prévu qui a saisi une absence ce jour-là est signalé sur l'élément.

- **Répétition** : chaque jour, chaque semaine (jours choisis) ou chaque mois, jusqu'à une date ou sans fin. Une modification s'applique à toutes les dates. *Retirer cette date* supprime une seule date ; *Retirer cette date et les suivantes* arrête la répétition à partir de la date ouverte.
- **Check-list** (ex. sortie d'un patient) : *Ajouter un modèle…* reprend une liste réglée par l'établissement ; on peut ajouter des points libres. Chaque point a un **délai** (le jour même, la veille, 2 jours avant…) : non coché à temps, il passe « en retard » (rouge). Les points se cochent après l'enregistrement, date par date (qui et quand sont gardés).

### Tâches

- Les tâches dues apparaissent chaque jour dans l'agenda : cochez-les quand elles sont faites (nom et heure gardés). Une tâche affectée à un agent porte son nom (« → nom »).
- Onglet *Tâches du service* :
  - **tâche du service** (créée par le cadre ou un rôle qui règle les tâches) : vous la cochez ; avec l'accès « Ajuster les tâches du service » (IDE par défaut), vous pouvez **affecter un agent** pour une date ou certains jours de la répétition (bouton *Affecter* dans l'agenda, ou *Ajuster*), et selon le réglage changer l'heure ou la précision. Vous ne pouvez pas la supprimer ;
  - **tâche de l'équipe** (*+ Tâche de l'équipe*) : toute l'équipe peut la modifier ou la supprimer ; ponctuelle seulement, sauf si l'établissement permet les tâches récurrentes.

### Absences

*+ Absence* (agenda ou *Mon agenda*) : chacun saisit les siennes ; le cadre saisit celles de l'équipe. Premier et dernier jour ; **motif facultatif** (congé, formation, réunion extérieure, autre), jamais de motif médical.

### Alertes

Onglet *Alertes* :

- **Alertes de l'équipe** (*+ Nouvelle alerte*) : type (liste du service : à voir par le médecin, par le psychologue… ou « Autre » avec un intitulé), patient du service facultatif, « à faire avant le » (date, heure), pour toute l'équipe, un rôle ou une personne, précision sans donnée clinique. L'alerte reste affichée jusqu'à **Vu** (qui, quand) ; *Remettre à voir* si besoin. Elle passe en rouge une fois la date dépassée.
- **Échéances JLD** (si votre rôle a l'accès aux envois au JLD) : prochaine démarche de chaque mesure d'isolement ou de contention en cours, dépassée ou dans les 72 heures, calculée par le module Isolement et contention. L'envoi se trace dans ce module (onglet *JLD*).
- **Points de check-list en retard** et **réunions des 7 prochains jours** : un clic ouvre l'élément.

### Mon agenda

Votre semaine, tous vos services réunis : éléments où vous êtes prévu(e), tâches qui vous sont affectées ou qui reviennent à votre rôle, vos absences, et les alertes qui vous sont adressées. Cette vue reste dans Tessera : rien n'est copié dans un autre agenda.

## 5. Isolement et contention

Voir le guide du module (document 12) et le guide pratique des IDE et AS (document 08).

## 6. Journal, corrections et annulations

- Onglet *Journal* : chaque saisie, avec son auteur, son heure, le patient et l'élément concernés, l'ancienne et la nouvelle valeur. Selon votre rôle : journal complet, saisies de vos services, ou vos propres saisies seulement.
- Rien n'est jamais effacé : une correction ou une annulation est elle-même une saisie. *Annuler* sur une ligne (rôles autorisés : cadre pour les saisies de soin et d'organisation, administrateur pour les réglages et les imports) demande un motif ; *Rétablir* défait une annulation faite par erreur.
- *Saisies en conflit à arbitrer* : deux agents ont modifié la même donnée au même moment ; un cadre choisit celle à garder.

## 7. Mode formation

Sur l'écran de connexion, choisissez **Mode formation** au lieu de *Données réelles* : vous retrouvez votre compte, vos rôles et vos services avec un jeu de données **entièrement fictif**, pour vous entraîner. Un **bandeau violet** reste affiché : n'y saisissez jamais de donnée réelle. Pour revenir : *Passer aux données réelles*.

## 8. Cadre de santé et administrateur

- **Rôles et accès** (*Administration → Comptes et sécurité*) : les accès sont groupés par module, en langage courant. Droits proposés par défaut :

  | Rôle | Patients | Agenda | Isolement et contention |
  | --- | --- | --- | --- |
  | IDE | Créer et corriger les fiches | Planifier ; ajuster les tâches du service ; tâches de l'équipe ; cocher tâches et check-lists ; alertes | Mesures, pauses, tiers, envois au JLD, surveillance |
  | AS | Consulter | Tâches de l'équipe ; cocher tâches et check-lists ; alertes | Comme l'IDE, sauf les fiches patient |
  | Secrétaire | Créer et corriger les fiches | Planifier ; tâches de l'équipe ; cocher tâches et check-lists | Envois au JLD, recours |
  | Cadre de santé | Tout, dont fusion | Tout, dont régler les tâches du service et les absences de l'équipe | Tout, dont corrections, annulations, statistiques |

  Tout se modifie : rôles fournis, rôles créés par l'établissement (ex. « Direction des soins », « Consultation »), onglets masqués, niveau du journal. Un rôle sans aucun accès dans un module n'y entre pas et n'en reçoit pas la clé. *Affichage* (en-tête, administrateur) montre l'outil tel qu'un rôle le voit, sans rien enregistrer.
- **Modules activés par service** (*Administration → Établissement et services*) : désactiver un module dans un service conserve ses données en consultation.
- **Réglages de l'Agenda** (*Administration → Agenda*) : désignation des patients, modification des éléments d'un autre service, ajustement des tâches du service, tâches récurrentes de l'équipe, modèles de check-lists et délais, types d'alertes (de l'établissement, ou propres à un service).
- **Intégrité du coffre** (*Administration → Comptes et sécurité*, administrateur) : « Coffre attesté » en temps normal ; conduite à tenir en cas d'alerte ou de compromission : procédures de secours (document 04).
- **Sauvegardes et exports**, dossier de secours, travail hors réseau, exports, export et import des réglages : guide d'installation (03), procédures de secours (04), documents 09 et 10.

## 9. En cas de problème

- *Dossier inaccessible* ou application indisponible : procédure dégradée papier (document 04), puis ressaisie avec les heures réelles.
- *Mot de passe oublié* : demandez une réinitialisation à l'administrateur ; il vous remettra un mot de passe provisoire.
- *Erreur de saisie* : prévenez votre cadre, qui corrige avec un motif tracé.
- *Module ou service absent* : demandez à l'administrateur de vérifier vos services et les accès de votre rôle.
