# CLAUDE.md — consignes du projet Tessera Santé

Ce fichier rassemble les consignes du porteur du projet et les conventions de travail. Il fait foi pour toute évolution du code ou de la documentation. En cas de doute sur une règle légale ou un choix fonctionnel, demander au porteur plutôt que supposer.

## 1. Le projet

- **Tessera Santé** : plateforme de suivi et d'organisation d'un service de soins, faite d'un **socle commun** (connexion unique, comptes, services, droits, chiffrement, stockage, sauvegardes, journal) et de **modules** activés par service : **Patients** (fiche commune), **Isolement et contention (Isocont)**, **Agenda du service**.
- Porteur : Roddy Ricart, faisant fonction cadre de santé (CHHA, pôle santé mentale, UHP). Projet réalisé sur son temps libre, **open source sous licence EUPL-1.2** (`LICENSE`).
- Le module Isocont reprend l'application **Suivi-mesures-isocont** (dépôt public `rodtrip2/Suivi-mesures-isocont`, version 1.67), source du code de départ. Ses règles métier, validées une à une par le porteur, s'appliquent au module sans changement : **`docs/consignes-isocont.md`** (copie des consignes de ce dépôt au 7 novembre 2026).
- Le DPI reste la référence clinique. Tessera se limite à ce que le DPI ne fait pas ou fait mal ; **aucune donnée clinique** dans aucun module.
- Le dépôt `rodtrip2/tessera-sante` est **public** (GitHub Pages pour la phase pilote).

**Documents de référence** (à lire avant de développer, à tenir à jour) :

| Document | Contenu |
| --- | --- |
| `docs/architecture.md` | Architecture cible, plan de développement en sept étapes, décisions du porteur — **fait foi pour le développement** |
| `docs/fiche-projet.md` | Présentation à la direction des soins |
| `docs/fiche-technique.md` | Présentation au service informatique et au responsable de la sécurité informatique ; mécanismes marqués « existant » ou « à construire » |
| `docs/evolutions-futures.md` | Pistes gardées pour plus tard : ne pas les développer sans demande du porteur |
| `docs/consignes-isocont.md` | Règles métier du module Isocont |

## 2. Données et sécurité (non négociable)

- **Aucune donnée réelle** dans le dépôt, les tests, la démonstration ou les captures. Toute donnée d'exemple est inventée et marquée « (fictif) ». Aucun fichier fourni par l'établissement (export du DPI, registre) n'est ajouté au dépôt, même anonymisé : on n'en décrit que la structure.
- Pas de données réelles avant validation par le service informatique et le délégué à la protection des données de l'établissement.
- Les données ne quittent jamais le réseau de l'hôpital : application statique, aucune connexion sortante (CSP `connect-src 'none'`), aucun script ni service externe.
- Stockage chiffré sur un partage SMB (File System Access API), AES-GCM 256, journal en ajout seul (un fichier chiffré par saisie, jamais modifié ; corrections et annulations sont elles-mêmes des saisies), saisie simultanée sans perte, chaînage et repères d'intégrité, historique du coffre : mécanismes d'Isocont repris par le socle, **sans régression**.
- **Un droit = une clé** : une clé par module, remise seulement aux agents qui y ont droit ; clé personnelle par agent (ECDH) ; clé de plateforme ; code de secours unique ; générations de clés au retrait d'un droit (détail : `docs/architecture.md` § 4).
- Le socle ne connaît aucune règle métier ; un module ne voit jamais le coffre, les clés ni les comptes, et n'écrit jamais dans le journal d'un autre module.
- Les mots de passe ne sont jamais écrits dans le journal.
- Fichiers importés (export du DPI, registre, classeur) : lus dans le navigateur, jamais copiés sur le partage.

## 3. Organisation et décisions fonctionnelles

- Accès à un module dans un service = module **activé pour le service** + agent **affecté au service** + **rôle dans le module**. Cloisonnement entre services d'un même module par l'interface (décision du porteur). Rôle selon le service : prévu dans le modèle de données, écran plus tard.
- **Administration unique** : onglet général pour les éléments communs, un onglet par module.
- **Échanges entre modules** : lecture à la volée seulement ; la publication est prévue dans le contrat mais désactivée.
- **Module Patients** : fiche commune (champs et règles : `docs/architecture.md` § 7) ; médecins de 1re et 2e ligne et référents soignants saisis dans Tessera ; libellés réglables par service (ouverture à d'autres disciplines que la psychiatrie).
- **Import de la liste des patients du DPI** : colonnes attribuées à l'import, colonne découpable, champ non fourni → saisi dans Tessera, modèle d'import mémorisé ; export de Sillage décrit dans `docs/architecture.md` § 8.
- **Mise en production à partir de zéro donnée**, puis reprise de l'historique par les imports d'Isocont (registre du service, classeur V1.3 comme cas particulier), qui peuplent Patients et Isocont.
- Les options nouvelles sont **désactivées par défaut** quand elles changent un comportement existant, sauf demande contraire du porteur.

## 4. Interface et rédaction

- Interface et documentation en français, vocabulaire du soin et du droit, pas de jargon technique.
- **Sigles** : ne jamais écrire « DSI » seul (lu « Direction des soins infirmiers » à l'hôpital) : « service informatique », première mention « service informatique (DSI ou direction du numérique, selon l'établissement) ». « DPO » : « délégué à la protection des données », première mention « délégué à la protection des données (DPO, référent RGPD) ». « RSSI » : « responsable de la sécurité informatique », première mention « … (RSSI) ». Tout sigle peu connu d'un service de soins est écrit en toutes lettres à sa première mention dans chaque document ou écran (CADA, CDSP, CGLPL, HDS, IPP, IEP, JLD, CSI…).
- Le kit et l'interface s'adressent à **tout établissement** : ne pas présenter les usages du CHHA (classeur V1.3, organisation du JLD, Sillage) comme des références ou des prérequis ; ce sont des cas particuliers, signalés comme tels.
- Les autres règles d'interface d'Isocont (thème clair / sombre par variables CSS, exports par `U.exporter`, appellation des lieux d'isolement par `U.lieu()`, actualisation sans perte de saisie…) s'appliquent à toute la plateforme : `docs/consignes-isocont.md` § 10.

## 5. Architecture et conventions de code

- HTML, CSS et JavaScript **sans dépendance ni étape de construction**. Construction du DOM avec l'aide `h()`, **jamais `innerHTML`** ; styles par classes CSS ou CSSOM, jamais d'attribut `style` ni de `<style>` (CSP).
- La logique métier reste hors de l'interface, testable sous Node ; l'interface ne fait qu'afficher.
- Chaque module déclare son contrat (identité, accès, saisies, réglages, vues, migrations, formation, fournitures, besoins) : `docs/architecture.md` § 3.
- Les paramètres ont une valeur par défaut et sont validés à la lecture ; tout nouveau paramètre va dans le jeu de formation, dans les libellés du journal et dans un groupe de l'export des réglages (ou ses exclusions).
- Sélecteur de dossier (`showDirectoryPicker`) toujours appelé directement par le clic de l'agent, sans fenêtre avant lui.
- Développement par étapes (`docs/architecture.md` § 11) : **chaque étape est une version publiable, tous les tests au vert, Isocont fonctionnel**.

## 6. Procédure après chaque modification

1. Tests unitaires (`npm test`, Node ≥ 20) tous verts ; ajouter des tests pour toute règle nouvelle ou tout défaut corrigé ; les tests repris d'Isocont restent verts.
2. Vérification dans un vrai navigateur (Playwright, mode démonstration, données fictives) des écrans modifiés.
3. Mettre à jour la documentation concernée : `docs/architecture.md` (décisions, état du plan), `docs/fiche-technique.md` (passer un mécanisme de « à construire » à « existant »), `docs/fiche-projet.md`, guides.
4. `CHANGELOG.md` (nouvelle entrée en tête) et numéro de version, dès que l'application existe dans ce dépôt.
5. Régénérer les PDF des documents (`python3 scripts/docs-pdf.py`) et les empreintes SHA-256 de l'application avant publication.
6. **Commit et push sur GitHub après chaque modification** (consigne permanente du porteur). Message en français ; terminer par les lignes d'attribution demandées par l'environnement.
7. Compte rendu au porteur en français : ce qui a changé, ce qui reste à valider de son côté.

## 7. Points à faire valider

- Accord de la direction des soins (fiche projet), avis du service informatique, du responsable de la sécurité informatique et du délégué à la protection des données (fiche technique), y compris pour l'usage de GitHub Pages pendant le pilote.
- Ajout de l'IPP à l'export de Sillage.
- Contenu de l'Agenda au-delà des échéances JLD.
- Devenir du dépôt `Suivi-mesures-isocont` une fois Tessera en service.
- Points propres au module Isocont : `docs/consignes-isocont.md` § 13.
