# Fiche pour le délégué à la protection des données — Tessera Santé

*Destinataire : délégué à la protection des données (DPO, référent RGPD) de l'établissement. Objet : présenter les traitements de Tessera Santé, ce qu'ils changent par rapport aux fichiers Word et Excel rangés aujourd'hui sur les partages du réseau, et les points sur lesquels votre avis est attendu. Version du 16 novembre 2026 (Tessera 0.77).*

| En bref | |
| --- | --- |
| **Ce que c'est** | Un outil d'organisation d'un service de soins (suivi légal de l'isolement et de la contention, agenda, tâches, équipe, documents…), fait d'un socle commun et de modules activés service par service. Logiciel libre (licence EUPL-1.2), sans serveur ni prestataire. |
| **Où sont les données** | Dans un dossier du réseau de l'établissement, **chiffrées sur le poste** avant d'y être écrites. Aucune donnée n'est envoyée à l'extérieur : la page ne peut ouvrir aucune connexion. |
| **Ce que l'outil ne fait pas** | Il ne remplace pas le dossier patient informatisé (DPI), qui reste la référence clinique. Les données cliniques (feuille de staff, notes) sont **désactivées par défaut** et ne s'activent que sur décision de l'établissement, après votre information. |
| **Ce qui vous est demandé** | Un avis sur les traitements (un par module), la préparation de l'analyse d'impact (AIPD), les durées de conservation et les fonctions soumises à avis. **Aucune donnée réelle avant votre avis et celui du service informatique.** |

## 1. Ce que vous cherchez, ce que vous gardez sous votre contrôle

Votre rôle est de vérifier que chaque traitement a une finalité claire, ne collecte que le nécessaire, protège les données, respecte les droits des personnes et figure au registre. Tessera a été construit pour que ces vérifications soient possibles et que vos décisions soient appliquées par l'outil lui-même :

- **chaque module est un traitement distinct**, avec sa fiche de registre proposée (document 05 du kit) ;
- **les fonctions qui demandent votre avis sont livrées désactivées** (données cliniques, bris de glace, entretiens des agents, formations, heures supplémentaires, mesure d'usage) et rangées par interlocuteur dans l'onglet « Validations » de l'administration ; les **données cliniques et les données du personnel** exigent au minimum de vous avoir informé avant leur activation sur des données réelles ;
- un avis négatif rendu en cours de pilote **désactive la fonction** : les données déjà saisies sont masquées, conservées, reprises dans l'export du droit d'accès, puis purgeables à la fin de leur durée de conservation ;
- chaque changement d'état d'une fonction est inscrit au journal avec sa date, son auteur et sa référence (votre avis, par exemple).

## 2. Ce qui change par rapport aux fichiers Word et Excel sur le partage

Aujourd'hui, les services suivent une partie de leur organisation dans des tableaux Excel et des documents Word rangés sur des partages réseau : suivi des mesures d'isolement, listes de patients avec leurs référents, plannings, fiches d'entretien des agents, comptes rendus de réunion. Ces fichiers contiennent souvent des données de santé ou des données du personnel.

| Exigence du RGPD | Fichiers Word et Excel sur un partage | Tessera Santé |
| --- | --- | --- |
| **Confidentialité** (art. 32) | Lisibles par toute personne qui a des droits sur le dossier, y compris les comptes techniques et les administrateurs du serveur ; un fichier copié sur une clé USB ou envoyé par courriel est lisible partout | Chiffrement AES-256 sur le poste ; **un droit = une clé** : sans rôle dans un module, un agent ne peut pas en lire les données, même avec un accès au dossier ; un fichier copié reste illisible |
| **Minimisation** (art. 5) | Colonnes ajoutées au fil du temps, copies multiples du même tableau, informations cliniques glissées dans des fichiers d'organisation | Champs définis par module ; fiche patient commune au lieu de copies ; rappel « aucune donnée clinique » dans les modules d'organisation ; identité des patients réduite aux initiales dans l'agenda par défaut |
| **Limitation de la conservation** | Fichiers gardés indéfiniment, faute de savoir qui les a créés et pourquoi ; anciennes versions dispersées | Durées réglables par donnée ; exports purgés après 31 jours par défaut ; données d'une fonction désactivée purgeables à la fin de leur durée |
| **Intégrité, exactitude** | Modification ou suppression d'une ligne sans trace ; « dernière modification par » seul indice ; fichier corrompu ou verrouillé quand deux postes l'ouvrent | Journal en ajout seul : chaque saisie est **nominative, horodatée, signée par son auteur**, jamais effacée ; corrections et annulations sont elles-mêmes tracées avec leur motif ; plusieurs postes saisissent en même temps sans perte |
| **Droits des personnes** (art. 15 à 21) | Recherche manuelle du nom dans tous les fichiers, sans certitude d'exhaustivité | **Export du droit d'accès** d'un patient, module par module, y compris les modules arrêtés, avec vérification élément par élément (information concernant un tiers, échange interne) |
| **Registre** (art. 30) | Traitements souvent absents du registre, car non identifiés | Un traitement par module, fiche proposée ; données ajoutées par l'établissement à inscrire avant usage |
| **Habilitations** | Droits accordés au dossier entier, rarement revus ; un agent parti garde l'accès tant que son compte n'est pas fermé | Comptes nominatifs, rôles par module et par service, comptes temporaires datés ; au retrait d'un droit, nouvelle clé : l'agent retiré ne lit plus les saisies suivantes |
| **Sécurité des accès** | Mot de passe du réseau seul ; mots de passe Office partagés quand un fichier est protégé | Mot de passe personnel conforme à la recommandation de la CNIL (délibération n° 2022-100) ; clé de sécurité exigible en plus pour les rôles choisis ; verrouillage après inactivité |

## 3. La traçabilité informatisée des tâches, au service de la qualité des soins

Le cœur de Tessera est la traçabilité des actions d'un service : échéances légales des mesures d'isolement et de contention, information des proches, tâches et check-lists de l'équipe, alertes, accompagnements, contrôles. Pour vous, cette traçabilité a deux faces :

- **elle protège les patients** : une échéance de communication au juge, une information des proches, une surveillance ou un contrôle qui ne sont pas faits apparaissent, au lieu de rester invisibles dans un tableau ; le registre légal se produit sans ressaisie ;
- **elle concerne aussi les agents** : chaque saisie porte le nom de son auteur. Tessera ne trace pas les consultations courantes (sauf le bris de glace et la lecture d'un message chiffré), la mesure d'usage est désactivée par défaut, et l'établissement peut fixer par écrit que le journal ne sert pas à l'évaluation individuelle. Ce point est présenté aux représentants du personnel (document 19).

## 4. Garanties techniques utiles à votre analyse

- **Pas d'hébergeur** : les données restent sur l'infrastructure de l'établissement ; la certification d'hébergeur de données de santé (HDS) ne devrait pas s'appliquer, sous réserve de votre qualification avec le service informatique.
- **Aucune connexion sortante** : politique de sécurité du contenu `connect-src 'none'` ; aucun script ni service extérieur.
- **Fichiers importés** (export du DPI, registre) : lus dans le navigateur, jamais copiés sur le partage.
- **Saisies falsifiées** : une saisie altérée, écrite au nom d'un autre agent ou hors des droits de son auteur est écartée sur tous les postes et signalée à l'administrateur.
- **Exports** (PDF, CSV) : seule sortie en clair ; rangés dans un dossier dédié, tracés, purgés après 31 jours par défaut.

## 5. Limites à connaître

- Le contrôle des rôles se fait sur le poste, sans serveur. Entre modules, la séparation est cryptographique ; **entre services d'un même module**, elle repose sur l'interface : un agent du module techniquement compétent pourrait lire les données d'un autre service du même module, sans pouvoir y écrire hors de ses droits ni effacer la trace de ses saisies.
- La consultation d'une fiche n'est pas tracée (sauf bris de glace et messages chiffrés).
- Un fichier exporté ou imprimé sort du chiffrement.
- La perte simultanée de tous les moyens de déverrouillage rend les données irrécupérables (contrepartie d'un chiffrement effectif) : deux clés d'administration et un code de secours sous scellé y répondent.

## 6. Points sur lesquels votre avis est attendu

- [ ] Fiches du registre des traitements, une par module (document 05) ; inscription des données ajoutées par l'établissement.
- [ ] Analyse d'impact : nécessité (liste de la CNIL), périmètre, gravité et vraisemblance des risques.
- [ ] Durées de conservation : réservations de véhicules, instantanés de la Vue d'ensemble, registres des contrôles et des bris de glace, exports (31 jours proposés).
- [ ] Droit d'accès : données des modules arrêtés, documents rattachés, formalités ; exclusion des informations concernant un tiers.
- [ ] Option « donnée clinique » des données ajoutées, données cliniques du séjour et bris de glace : conditions d'activation (information préalable, registre, conservation).
- [ ] Données du personnel : formations, heures supplémentaires, entretiens des agents ; frontière avec le dossier administratif (avec les ressources humaines).
- [ ] Mesure d'usage anonyme de l'outil (nombre de saisies par module et par semaine, jamais l'identité des agents ; avec les représentants du personnel).
- [ ] Agenda exporté en fichier `.ics` vers une messagerie éventuellement hébergée hors de l'établissement.
- [ ] Usage de GitHub Pages pendant le pilote (seul le code y est servi, aucune donnée n'y transite).
- [ ] Information des patients et des agents (mentions proposées au document 05, § 4).

## 7. Documents de référence

Fiche technique (`docs/fiche-technique.md`) ; éléments RGPD et analyse d'impact (document 05) ; travail hors réseau (document 10) ; fiche projet (`docs/fiche-projet.md`).
