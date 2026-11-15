# Kit de déploiement — Tessera Santé

Tout ce qu'il faut pour présenter, valider, installer et exploiter Tessera Santé dans un établissement de santé. Les documents existent en Markdown (modifiables) et en PDF (dossier [`pdf/`](pdf/) ; présentation et fiche technique : dossier [`docs/`](../docs/)).

Tessera Santé réunit un **socle commun** (connexion, comptes, services, droits, chiffrement, stockage, sauvegardes, journal) et des **modules** activés service par service : **Patients** (fiche commune), **Isolement et contention**, **Agenda du service**, **Véhicules**, **Suivi médical**, **Vue d'ensemble**, **Demandes de travaux**, **Messagerie**, **Salles et bureaux**, **Informations du service**, **Équipe**, **Documents**, **Congés**, **Contrôles**, **Retours sur Tessera**, **Formations**, **Heures supplémentaires** et **Données cliniques**. Les fonctions qui demandent un avis (données du personnel, données cliniques…) sont livrées **désactivées** ; l'onglet « Validations » de l'administration les range par interlocuteur.

| Document | Pour qui | Usage |
| --- | --- | --- |
| [Fiche projet](../docs/fiche-projet.md) | Direction, direction des soins, encadrement, instances | Présenter le projet et obtenir les décisions |
| [Fiche technique](../docs/fiche-technique.md) | Service informatique (DSI ou direction du numérique, selon l'établissement), responsable de la sécurité informatique (RSSI) | Architecture, sécurité, prérequis, recette technique |
| [03 — Guide d'installation](03-guide-installation.md) | Service informatique, administrateur fonctionnel | Mise en service pas à pas, modules, comptes, imports |
| [04 — Procédures de secours](04-procedures-secours.md) | Administrateur, cadres, service informatique | Mots de passe, clés, départs, compromission, panne, restauration ; fiche papier dégradée |
| [05 — Éléments RGPD et analyse d'impact (AIPD)](05-elements-rgpd-aipd.md) | Délégué à la protection des données (DPO, référent RGPD) | Fiches du registre des traitements (une par module) et préparation de l'analyse d'impact |
| [06 — Guide utilisateur](06-guide-utilisateur.md) | Tous les agents, cadres, administrateur | Connexion, modules, fiche patient, agenda, isolement et contention, journal |
| [07 — Reprise à partir du registre](07-modele-import-registre.md) | Administrateur fonctionnel, cadres | Format du registre à importer, reconstitution des mesures, contrôles avant import |
| [08 — Guide pratique IDE et AS (isolement et contention)](08-guide-ide-as.md) | IDE, aides-soignant(e)s | Les gestes du quotidien : créer une mesure, pause et reprise, tiers, décompte et envoi au JLD, surveillance, fin |
| [09 — Dossier de secours copié par robocopy](09-dossier-secours-robocopy.md) | Service informatique | Copie automatique des données vers un second serveur (script `outils/miroir-robocopy.ps1`), retour après une panne |
| [10 — Travail hors réseau](10-travail-hors-reseau.md) | Service informatique, administrateur, délégué à la protection des données | Postes désignés : outil disponible sans réseau, copie locale des données, conduite en cas de panne |
| [12 — Guide du module Isolement et contention](12-guide-isolement-contention.md) | IDE, AS, secrétariat, cadres, administrateur | Échéances, mesures, pauses, tiers, JLD, décompte, surveillance, registre, statistiques, réglages du module |
| [11 — Import de la liste des patients](11-import-liste-patients.md) | Administrateur fonctionnel, secrétariat, administrateur du DPI | Export du dossier patient informatisé (DPI), attribution des colonnes, contrôles |

## Parcours de déploiement

1. **Présenter** la fiche projet à la direction des soins, la fiche technique au service informatique et au responsable de la sécurité informatique, les éléments RGPD (05) au délégué à la protection des données.
2. **Valider** (onglet « Validations » : une fonction soumise à avis s'active sur accord hiérarchique pour le pilote, après information du délégué à la protection des données pour les données cliniques et du personnel, puis après avis) : mode d'hébergement, modules ouverts et services concernés, registre des traitements (un traitement par module), analyse d'impact, statut du registre légal de l'isolement et de la contention.
3. **Installer** selon le guide (03) et faire la recette.
4. **Former** les équipes avec le guide utilisateur (06), le guide du module Isolement et contention (12) et le guide pratique des IDE et AS (08) ; imprimer les procédures de secours (04).
5. **Piloter** dans une unité, puis étendre service par service et module par module ; les agents font remonter défauts et idées par le bouton « Signaler ».
6. **Mettre à jour** : une version stable est publiée par une étiquette signée `vX.Y.Z` ; fermer Tessera sur tous les postes, déposer la nouvelle version, rouvrir (tous les postes en même temps : le rangement des saisies peut changer d'une version à l'autre). Versions bêta et de développement : essais seulement, dans un dossier d'essai.

Pour adapter les documents à votre établissement (référents, chemins du partage, adresse intranet), modifiez les fichiers Markdown puis régénérez les PDF : `python3 scripts/docs-pdf.py`.
