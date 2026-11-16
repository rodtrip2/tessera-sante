# Fiche pour la direction des soins et la commission médicale — Tessera Santé

*Destinataires : directeur des soins, cadres supérieurs de santé, président de la commission médicale d'établissement (CME) et chefs de pôle. Objet : ce que Tessera Santé apporte à la qualité et à la sécurité des soins, en particulier pour l'isolement et la contention, ce qu'il change par rapport aux fichiers Word et Excel des services, et les décisions attendues. Présentation générale : fiche projet (`docs/fiche-projet.md`). Version du 16 novembre 2026 (Tessera 0.77).*

| En bref | |
| --- | --- |
| **Finalité** | Outiller l'organisation d'un service de soins là où le dossier patient informatisé (DPI) ne le fait pas : suivi légal de l'isolement et de la contention, agenda et tâches du service, suivi médical, transmissions organisationnelles, contrôles. |
| **Place du DPI** | Le DPI reste la référence clinique : prescription, observation, surveillance clinique. Tessera n'émet aucune recommandation clinique et n'est pas un dispositif médical. |
| **Données cliniques** | Développées (feuille de staff, notes) mais **désactivées par défaut**, activables fonction par fonction et service par service, après les avis prévus. |
| **Décisions attendues** | Poursuite du projet, périmètre du pilote, statut du registre, données cliniques, réglages par défaut (§ 6). |

## 1. Ce que vous cherchez, ce que vous gardez sous votre contrôle

Vous répondez de la qualité et de la sécurité des soins, du respect des droits des patients et de l'organisation des équipes. Tessera vous laisse les choix structurants :

- **modules et fonctions activés service par service** ; les fonctions sensibles (données cliniques, bris de glace) sont livrées désactivées et rangées dans l'onglet « Validations » ;
- **règles de l'établissement en réglages** : délais d'alerte du suivi médical, désignation des patients dans l'agenda, déduction ou non des pauses, méthode de calcul du délai de sept jours, désignation du juge, alertes de l'établissement ;
- **indicateurs** produits à partir des saisies, sans ressaisie (rapport annuel, cumuls, échéances hors délai).

## 2. Ce qui change par rapport aux fichiers Word et Excel des services

| Besoin | Fichiers Word et Excel sur un partage | Tessera Santé |
| --- | --- | --- |
| **Échéances légales de l'isolement et de la contention** | Calcul manuel ou classeur à macros ; erreur de formule invisible ; fichier verrouillé quand deux soignants y saisissent | Échéances de l'information et de la saisine du juge calculées automatiquement (cumul sur 15 jours, mesures longues, délai de sept jours depuis la décision), couleurs d'alerte, plusieurs postes en même temps |
| **Registre légal** (art. L. 3222-5-1 du code de la santé publique) | Ressaisi ou reconstitué en fin d'année ; complétude incertaine | Produit à partir des saisies, par service et par année ; version pour communication ; trame du rapport annuel |
| **Information des proches** | Notée ou non selon les habitudes | Rappel cycle par cycle, avec l'échéance |
| **Qui suit qui** | Médecin de première ligne et référents dans des tableaux disparates | Fiche patient commune : médecins de 1re et 2e ligne, référents ; patients par médecin |
| **Organisation du service** | Plannings, check-lists et consignes sur papier ou dans des fichiers multiples | Agenda, tâches et check-lists, alertes, accompagnements, permissions, transmissions organisationnelles |
| **Fiabilité de l'information** | Version du fichier incertaine ; modification sans trace | Saisies nominatives, horodatées, signées, jamais effacées ; corrections avec motif |
| **Confidentialité** | Fichiers lisibles par toute personne ayant des droits sur le dossier | Chiffrement ; chaque agent ne lit que les modules de son rôle |

## 3. La traçabilité informatisée des tâches, au service de la qualité des soins

Tracer les tâches d'un service, ce n'est pas ajouter de l'administratif : c'est rendre visible ce qui doit être fait, par qui et pour quand, et garder la preuve de ce qui a été fait.

- **Sécurité des patients** : une échéance légale, une surveillance, une information des proches, une check-list de sortie ou un contrôle de chambre de soins intensifs (CSI) qui n'ont pas été faits apparaissent en alerte au lieu de passer inaperçus.
- **Continuité entre les équipes** : les tâches, alertes et transmissions organisationnelles se transmettent d'un poste à l'autre sans dépendre de la mémoire ni d'un cahier.
- **Respect des droits des patients** : le contrôle du juge, l'information des proches et le registre reposent sur des données fiables et datées.
- **Démarche qualité et certification** : la traçabilité est exploitable pour les revues de pertinence, l'analyse des événements indésirables, les évaluations de pratiques et la préparation de la certification par la Haute Autorité de santé (HAS) ; les indicateurs se produisent sans ressaisie.
- **Moins de charge** : la liste des patients s'importe du DPI ; les décomptes destinés au juge se produisent en un clic.

## 4. Points de vigilance

- **Double saisie avec le DPI** : Tessera se limite à ce que le DPI ne fait pas ou fait mal ; les données cliniques ne doivent être activées que si elles comblent un manque réel.
- **Statut du registre** : l'utilisation du registre produit par Tessera comme support officiel relève d'une décision de l'établissement.
- **Bris de glace** (accès à un patient non présent dans son service) : justifié, limité à la fin du poste, tracé, relu chaque mois par le cadre ; garanti par l'application et la traçabilité, pas par une clé par patient (choix du porteur).
- **Délai de sept jours** : calcul recommandé (compté aussi depuis la précédente décision du juge, échéance la plus proche retenue) ; un message type au greffe du tribunal permet de faire confirmer le point de départ.
- **Audit du 15 novembre 2026** : sécurité, droit, fonctionnalités et ergonomie ; les points bloquants avant toute donnée réelle sont corrigés.

## 5. Démarche proposée

Présentation, avis du service informatique, du responsable de la sécurité informatique et du délégué à la protection des données, installation, pilote de un à deux mois dans une unité en parallèle des outils actuels (comparaison des échéances), bilan, puis extension module par module.

## 6. Décisions attendues

- [ ] Poursuite du projet et périmètre du pilote (proposé : Patients, Isolement et contention, Agenda du service).
- [ ] Reconnaissance du registre produit par Tessera comme support du registre légal, ou articulation avec le registre existant.
- [ ] Données cliniques du séjour, accès réglable aux données cliniques et bris de glace : activation ou non, services concernés (avec le délégué à la protection des données et le responsable de la sécurité informatique ; analyse d'impact).
- [ ] Rôle « médecin » quand les médecins utiliseront Tessera ; droits par défaut du suivi médical (présences : secrétaire et cadre ; entretiens : IDE et cadre) ; délais d'alerte selon la durée d'hospitalisation.
- [ ] Agenda : identité des patients affichée par défaut (proposé : initiales) ; délais de validation des permissions pour les soins sans consentement (proposé : 24 h).
- [ ] Isolement et contention : déduction des pauses, méthode du délai de sept jours (méthode recommandée par défaut), formulation des alertes, règle en cas de passage en soins somatiques.
- [ ] Contrôles : check-list des CSI (fournie par le porteur).
- [ ] Désignation de l'administrateur fonctionnel et des détenteurs des clés de secours.

## 7. Documents de référence

Fiche projet ; guide du module Isolement et contention (document 12) ; guide pratique IDE et AS (document 08) ; éléments RGPD (document 05).
