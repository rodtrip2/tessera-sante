# À documenter (fichier de travail)

Mise à jour des documents reportable (décision du porteur du 11 novembre 2026) : la fusion dans `main` peut se faire sans elle (`CLAUDE.md` § 6). Ce fichier garde tout ce qu'il faudra écrire, pour ne rien perdre. **Chaque nouveau développement y ajoute ses lignes**, sur `main` comme dans une branche. Il est vidé quand le porteur demande la mise à jour des documents.

*Vidé le 16 novembre 2026 (version 0.77.1) : le contenu des versions 0.71 à 0.77 est repris dans les documents de référence et gardé en détail dans `docs/historique-decisions.md`.*

## 0.78.0 — 16 novembre 2026 (demandes du porteur du jour)

- **Plusieurs codes CIM dans un seul champ** : `SIC.clinique.separerCim(texte)` (`app/js/module-clinique.js`) → [{ code, libelle }] (50 codes au plus, doublons ignorés, code précédé d'un mot sans séparateur laissé dans le libellé) ; feuille de staff (`app/js/ui-clinique.js`) : zone repliable « Saisir plusieurs codes à la fois », bouton « Séparer en codes », lignes vides remplacées, codes présents non dupliqués. Aucune saisie ni réglage nouveaux. Tests : `tests/cim-graphiques.test.js`. À documenter : `docs/architecture.md` (Données cliniques), guide du module si un guide est écrit.
- **Graphiques en PDF** : `SIC.pdf.Document.prototype.dessin(dessin, options)` (`app/js/pdf.js` : rectangles, traits, lignes brisées, cercles, tracés SVG avec arcs convertis en courbes de Bézier, textes ; cadre élargi pour les textes qui débordent), `segmentsTrace`, `couleurDessin` ; `U.graphiquePdf` (`app/js/ui-graphiques.js` : `svgEnDessin` lit le SVG affiché et ses styles calculés en thème clair, `legendeDe`, `ajouterAuPdf`, `exporter`, `bouton`). Boutons : statistiques d'Isocont (catégorie d'export `statistiques`), fiche patient « Mesures » (heures par mois, frise ; document confidentiel ; catégorie `graphiques`), tableur (chaque graphique, aussi en lecture seule). PDF des statistiques : graphique mensuel ajouté. Nouvelle catégorie d'export « Graphiques » (`LIB_CATEGORIES_EXPORT`). Tests : `tests/cim-graphiques.test.js` ; parcours des écrans : étapes CIM et graphique. À documenter : `docs/fiche-technique.md` (exports : graphiques en PDF, vectoriels, sans image ni bibliothèque), guide utilisateur et guide Isolement et contention (statistiques, fiche patient), guide des documents (tableur).
- Point de vigilance : le PDF d'un graphique de patient est un export nominatif (bandeau « document confidentiel ») ; même régime que les autres exports (purge, droits du sous-dossier).

## 0.79.0 — 16 novembre 2026 (ergonomie, constat E1)

- En-tête sur une rangée : menu « Plus ▾ » (`menuEntete`, `app/js/ui.js`) avec Mot de passe, Exports, Affichage (ancien « Aa »), thème, installation hors réseau, À propos ; Rechercher, Signaler, Verrouiller visibles. Titre de fenêtre et onglets dans `.fenetre-tete`. Messages pour l'agent (`messagesPerso`) : complets dans « Aujourd'hui », repliés ailleurs (`App.messagesOuverts` pour la session). Aucune saisie ni réglage. Parcours et script de captures adaptés (menu).
- À documenter : guides utilisateur (06 : « bouton *Mot de passe* » → menu « Plus » ; Exports ; Affichage), IDE / AS (08 : captures régénérées), installation (03 si un écran y est cité) ; fiche pour les représentants du personnel (19, § 4 ergonomie : E1 fait).

