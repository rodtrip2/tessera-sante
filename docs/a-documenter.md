# À documenter (fichier de travail)

Mise à jour des documents reportable (décision du porteur du 11 novembre 2026) : la fusion dans `main` peut se faire sans elle (`CLAUDE.md` § 6). Ce fichier garde tout ce qu'il faudra écrire, pour ne rien perdre. **Chaque nouveau développement y ajoute ses lignes**, sur `main` comme dans une branche. Il est vidé quand le porteur demande la mise à jour des documents.

*Vidé le 17 novembre 2026 (version 0.87.1) : le contenu des versions 0.86 et 0.87 est repris dans les documents de référence et gardé en détail dans `docs/historique-decisions.md`.*

## 0.88.0 — Audits : import d'un tableau mensuel, évolution sur l'année (17 novembre 2026)

Demande du porteur du 17 novembre 2026 : importer le tableau d'audit mensuel tenu par le service (classeur de synthèse) sans reprendre le fichier ni ses données, et rendre les résultats sur l'année en graphiques.

- `docs/architecture.md` § 7 nonies : modes des critères (`reponse`, `ratio`, `indicateur`), taux d'un audit = moyenne des critères évalués ; import (`lireSynthese`, `preparerImport`, `grilleDepuisSynthese`, `correspondance` dans `module-audits.js` ; fichier lu dans le navigateur, jamais copié ; `origine`, `fichier`) ; résultats sur l'année (`resultats(st, { annee })`, `parPeriode`, `indicateurs`) ; graphiques par `SIC.tableur.dessinGraphique` (options `yMax`, `etiquettes`) et `U.tableur.svgGraphique`.
- `docs/fiche-projet.md` : import des tableaux d'audit existants, graphiques de l'année.
- Kit : guide de l'utilisateur (importer un tableau d'audit, évolution sur l'année) ; capture `audits-annee`.
- Points à valider : date retenue pour un mois importé (le 1er) ; seuils des couleurs (90 % et 70 %).
