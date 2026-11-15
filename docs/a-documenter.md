# À documenter (fichier de travail)

Mise à jour des documents reportable (décision du porteur du 11 novembre 2026) : la fusion dans `main` peut se faire sans elle (`CLAUDE.md` § 6). Ce fichier garde tout ce qu'il faudra écrire, pour ne rien perdre. **Chaque nouveau développement y ajoute ses lignes**, sur `main` comme dans une branche. Il est vidé quand le porteur demande la mise à jour des documents.

*Vidé le 15 novembre 2026 (version stable 0.70.0) : le contenu des versions 0.21 à 0.69 est repris dans les documents de référence et gardé en détail dans `docs/historique-decisions.md`.*

## 0.71.0 — Remises de clés confirmées par l'administrateur (15 novembre 2026)

Décision : accord du porteur du 15 novembre 2026, à la suite de l'audit du même jour (constat S1 ; liste des constats : document de projet `claude/audit-2026-11-15-constats.md`).

- **`docs/architecture.md` § 4** : corriger la phrase « au plus la clé d'un module où il a déjà un rôle » (fausse depuis les prêts de droits, 0.31.0, et les rôles par service, 0.67.0). Décrire la règle nouvelle : une clé qu'un compte ne détient pas encore n'est remise d'office que si elle découle d'un acte de l'administrateur dans sa session (`acte`, `approbation`, `nonTenues` dans `session.js` ; option `approuve` de `T.appliquerDroits`, résultat `enAttente`) ; sinon elle attend sa confirmation (`remisesAConfirmer`, `confirmerRemises`). Droits amenés par une lecture du dossier pendant un acte : en attente. Comptes d'intervenants demandés : `demandesComptesAConfirmer`, `confirmerDemandesComptes` (plus de traitement à la connexion). Le rôle d'administrateur ne vient jamais d'un réglage (`comptesPourClesAvec`). « Tout renouveler » : clés détenues rendues, clés en attente toujours en attente. Réinitialisation du mot de passe : clés détenues ou approuvées seulement ; changement par l'agent : clés qu'il tient.
- **`docs/architecture.md` (état du plan)** : signature des saisies par une clé personnelle attestée (correction de fond du constat S1), à inscrire comme étape à venir.
- **`docs/fiche-technique.md`** : § sur la remise des clés et § des limites connues : la remise n'est plus « protégée par l'attestation » seule ; ajouter la confirmation ; limite qui demeure (auteur d'une saisie non prouvé, affichage des rôles modifiable par un réglage forgé dans les modules dont l'agent détient déjà la clé).
- **Saisie nouvelle au journal** : trace `COMPTE` d'action `REMISES_CLES` ({ remises: [{ login, cle, motif }], libelle }) ; libellé ajouté à `LIB_COMPTE` (`ui-isocont.js`).
- **Écrans** : panneau « Clés à remettre » (remplace « Clés à réémettre ») dans *Administration → Réglages généraux → Comptes* ; bandeau de rappel pour l'administrateur ; textes des prêts de droits, des demandes de comptes d'intervenants et des rôles par service. Guides et kit à reprendre : guide de l'administrateur (connexion : vérifier « Clés à remettre »), fiche du responsable de la sécurité informatique (rôles par service réglés par le cadre : remise désormais confirmée).
- **Jeu de démonstration** : remises confirmées d'emblée après la création des clés (`demo.js`).
- **Points à valider par le porteur** : libellés du panneau ; faut-il pouvoir refuser une demande ou une remise depuis ce panneau (aujourd'hui : ne pas confirmer) ; faut-il prévenir le cadre que son prêt attend la confirmation.

