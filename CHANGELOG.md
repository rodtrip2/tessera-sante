# Journal des modifications — Tessera Santé

## 0.2.0 — 7 novembre 2026

**Étape 1 du plan d'architecture terminée** (découper sans changer le comportement).

- **Administration** : la coquille garde le cadre (sous-onglets) et les éléments communs (comptes, rôles, moyens de déblocage, choix du dossier, mode formation, établissement et services, dossier des exports, sauvegardes, réglages, à propos). Les panneaux d'Isocont (appellation des lieux, surveillance, tiers, organisation JLD, règles et pauses, alertes, cas particuliers, registre et statistiques, décompte JLD, reprise des données, archive annuelle) passent dans `ui-isocont.js`, que la coquille lit par `SIC.ui.admin`, dans le même ordre qu'avant.
- Bilan du découpage : `model.js` → `noyau-journal.js`, `droits.js`, `exports-rangement.js` + modèle d'Isocont ; `session.js` → session du socle (un seul point d'appel au module) ; `ui.js` → coquille + `ui-isocont.js` (vues, fenêtres, libellés du journal, panneaux d'administration).
- Vérification dans Chrome, comparée à Isocont 1.67 : chaque sous-onglet de l'administration identique (données de démonstration et mode formation), réglage enregistré depuis un panneau déplacé.

## 0.1.4 — 7 novembre 2026

Étape 1 du plan d'architecture, découpage de l'interface (deuxième bloc d'écran).

- **Journal** : l'affichage (liste, conflits à arbitrer, annulation et rétablissement) reste dans la coquille ; les libellés des saisies d'Isocont (résumés, colonne « Action », effet d'une annulation) passent dans `ui-isocont.js`, que la coquille lit par `SIC.ui.journal`.
- **Correction (défaut de la 0.1.3)** : l'export du registre en PDF et en CSV depuis l'onglet *Registre* ne se faisait plus (aide `exporter` non reprise dans `ui-isocont.js`). Nouveau test `tests/interface-noms.test.js` : tout nom de la coquille employé par un fichier d'interface d'un module doit y être importé.
- Vérification dans Chrome, comparée à Isocont 1.67 : journal, fenêtre d'annulation, annulation enregistrée et export du registre identiques.

## 0.1.3 — 7 novembre 2026

Étape 1 du plan d'architecture, découpage de l'interface (premier bloc d'écran), sans changement de fonctionnement.

- `ui-isocont.js` (module Isocont) : tableau de bord, mesures, JLD, surveillance, registre et fenêtres de saisie (nouvelle mesure, fin, pause, reprise, tiers, JLD, détail, lieu, correction, proposition, professionnels), sortis de `ui.js`. Les vues sont déclarées auprès de la coquille (`SIC.ui.vues`), comme l'étaient déjà *Patients* et *Statistiques*.
- `ui.js` garde la coquille : outils d'affichage, accueil, connexion, en-tête, onglets, fenêtres, exports, thème ; le journal et l'administration seront découpés aux blocs suivants.
- Vérification dans Chrome : écrans et fenêtres identiques à Isocont 1.67, saisie enregistrée normalement.

## 0.1.2 — 7 novembre 2026

Étape 1 du plan d'architecture, deuxième découpage, sans changement de fonctionnement.

- `exports-rangement.js` (socle) : dossier des exports, sous-dossier par service, chemin Windows, conservation et purge, sortis du modèle d'Isocont.
- `session.js` devient la session du socle : droits, journal et exports viennent des fichiers du socle ; la reconstitution de l'état et les réglages par défaut passent par un seul point d'appel au module (`moduleActif()`, le modèle d'Isocont jusqu'au registre des modules de l'étape 2).

## 0.1.1 — 7 novembre 2026

- **Correction : ordre des saisies enregistrées dans la même milliseconde.** À horodatage égal, les saisies étaient classées par leur identifiant, dont la fin est aléatoire : plusieurs saisies enregistrées d'un coup par un même agent (début puis fin d'une mesure, pause d'un isolement et de sa contention, transfert de plusieurs mesures) pouvaient être appliquées dans le désordre, une saisie pouvant alors être ignorée. Elles suivent désormais le chaînage (chaque saisie passe après celle qu'elle cite). Défaut hérité d'Isocont 1.67, révélé par un test qui échouait environ une fois sur dix ; nouveau test `tests/noyau-journal.test.js`.

## 0.1.0 — 7 novembre 2026

Première version de Tessera Santé, sans changement de fonctionnement par rapport à Isocont 1.67.

- **Reprise du code d'Isocont** : application, tests et outils du kit repris à l'identique du dépôt `rodtrip2/Suivi-mesures-isocont` (version 1.67.0, commit 7064f81). L'historique des deux dépôts est relié : le parcours de chaque fichier repris reste consultable depuis Tessera.
- **Étape 1 du plan d'architecture, premier découpage** (`docs/architecture.md` § 11) : le modèle est séparé en trois fichiers.
  - `noyau-journal.js` (socle) : ordre des saisies, lots, annulations et rétablissements, chaînage, conflits, prises d'acte d'intégrité. Aucune règle métier : le module fournit son état initial et l'application de ses saisies.
  - `droits.js` (socle) : rôles, accès, services visibles, visibilité du journal et des onglets.
  - `model.js` : modèle d'Isocont, avec la même interface qu'avant ; les 139 tests repris passent sans modification.
- Numérotation propre à Tessera à partir de 0.1.0 (Isocont s'arrête à 1.67.0).


