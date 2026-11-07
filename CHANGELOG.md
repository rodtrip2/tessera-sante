# Journal des modifications — Tessera Santé

## 0.1.0 — 7 novembre 2026

Première version de Tessera Santé, sans changement de fonctionnement par rapport à Isocont 1.67.

- **Reprise du code d'Isocont** : application, tests et outils du kit repris à l'identique du dépôt `rodtrip2/Suivi-mesures-isocont` (version 1.67.0, commit 7064f81). L'historique des deux dépôts est relié : le parcours de chaque fichier repris reste consultable depuis Tessera.
- **Étape 1 du plan d'architecture, premier découpage** (`docs/architecture.md` § 11) : le modèle est séparé en trois fichiers.
  - `noyau-journal.js` (socle) : ordre des saisies, lots, annulations et rétablissements, chaînage, conflits, prises d'acte d'intégrité. Aucune règle métier : le module fournit son état initial et l'application de ses saisies.
  - `droits.js` (socle) : rôles, accès, services visibles, visibilité du journal et des onglets.
  - `model.js` : modèle d'Isocont, avec la même interface qu'avant ; les 139 tests repris passent sans modification.
- Numérotation propre à Tessera à partir de 0.1.0 (Isocont s'arrête à 1.67.0).

Reste pour terminer l'étape 1 : découpage de `session.js` et de `ui.js`.
