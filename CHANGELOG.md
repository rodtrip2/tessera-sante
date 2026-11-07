# Journal des modifications — Tessera Santé

## 0.5.0 — 7 novembre 2026

Étape 4 (trousseau) terminée : **attestation du coffre**, renouvellement des clés après une restauration, option « compromission ». Décisions du porteur du 7 novembre 2026 : un agent qui garde un accès en écriture au partage fait partie de la menace couverte ; renouvellement obligatoire après une restauration ; bouton pour tout renouveler.

- Le coffre est signé par l'administrateur à chaque modification (parties publiques des agents, générations et empreintes des clés, droits des comptes, compteur). L'empreinte de la clé de signature est gardée dans chaque emballage, protégé par le mot de passe, la clé de sécurité ou le code de secours.
- Chaque agent vérifie la signature à l'ouverture de sa session et n'accepte que les générations attestées : une fausse génération glissée dans le coffre est ignorée. Connexion refusée sur un coffre modifié hors de l'outil.
- Avant toute remise de clé, l'administrateur vérifie les comptes (rôles, services, activité), les clés personnelles et la clé de secours : un rôle ajouté ou une clé personnelle substituée hors de l'outil bloque toute remise. Une clé personnelle créée par l'agent lui-même porte une preuve de continuité.
- Version antérieure du coffre recopiée : détectée par les postes qui ont vu une version plus récente et par l'historique du coffre.
- *Comptes et sécurité → Intégrité du coffre* (et bandeau rouge pour l'administrateur) : état attesté, anomalies, réparations : *Renouveler les clés*, *Nouvelle clé personnelle* d'un compte, *Nouveau code de secours*, *Remettre la dernière version attestée*.
- Après toute restauration du coffre (historique, copie sous scellé, copie complète) : les agents ne se connectent pas tant que l'administrateur n'a pas renouvelé toutes les clés (nouvelles clés maîtresses, génération au-dessus de toute génération déjà employée ; les saisies existantes restent lisibles).
- *Tout renouveler* en cas de compromission : clés, clés d'attestation, code de secours, nouvelle clé personnelle et mot de passe provisoire pour chaque compte (l'administrateur garde le sien), fiches de remise.
- Dossiers d'essai d'avant 0.5.0 : attestation établie à la connexion d'un administrateur.
- Journal : libellés des traces du trousseau (génération, passage au trousseau, attestation, renouvellement, compromission) ; une trace de passage au trousseau ne fait plus échouer l'affichage de sa ligne.
- Nouveau test `tests/attestation.test.js` (183 au vert) ; panneau, réparation et compromission vérifiés dans Chrome.

## 0.4.5 — 7 novembre 2026

Étape 4 (trousseau) : **corrections après une relecture indépendante** du code des clés.

- Un compte temporaire arrivé à expiration est traité comme désactivé pour les clés (nouvelle génération, plus de remise) ; la connexion par clé de sécurité est refusée pour un compte expiré ou désactivé.
- Chaque changement de son mot de passe crée une nouvelle clé personnelle : l'ancienne, même copiée, n'ouvre plus les clés remises ensuite. Les clés de sécurité de l'agent sont alors retirées ; l'écran de changement de mot de passe le signale.
- Retrait de sa propre clé de sécurité : le mot de passe est redemandé et la clé personnelle renouvelée (une clé perdue puis retrouvée n'ouvre plus rien). La clé d'un autre agent se retire en réinitialisant son mot de passe.
- Avant chaque écriture du coffre, le trousseau du poste est confronté au coffre relu : clés changées entre-temps → trousseau rouvert ; clé personnelle retirée ou remplacée → verrouillage. Une écriture interrompue ne laisse plus de clé à moitié installée.
- La génération courante d'une clé ne recule jamais ; une enveloppe illisible n'empêche plus d'ouvrir les autres.
- Copie sous scellé signalée « à refaire » aussi quand une clé maîtresse a changé.
- Point ouvert, à trancher par le porteur : signature (attestation) du coffre par l'administrateur, contre un agent qui garderait un accès en écriture au partage (`docs/architecture.md` § 4).
- Nouveau test `tests/trousseau-revue.test.js` (173 au vert) ; retrait d'une clé vérifié dans Chrome.

## 0.4.4 — 7 novembre 2026

Étape 4 (trousseau), quatrième sous-étape : **remise et retrait des clés selon les droits**. Un droit = une clé est désormais effectif.

- La clé d'Isocont n'est remise qu'aux comptes qui ont un rôle d'Isocont et au moins un service où le module est activé (cadre et administrateur selon les règles d'activation ; l'administrateur a toujours toutes les clés). Un agent sans cette clé ne lit pas le journal d'Isocont et en est informé ; les réglages communs (services, établissement) restent lisibles.
- Retrait d'un rôle, désactivation d'un compte, module désactivé pour les services d'un agent : nouvelle génération de la clé concernée, automatique, remise aux seuls détenteurs restants ; l'agent retiré ne lit pas les saisies postérieures, même avec une clé gardée. Retrait du rôle d'administrateur : nouvelle clé maîtresse ; le code de secours lit toujours toutes les générations.
- Premier changement de mot de passe : l'agent crée sa propre clé personnelle, que l'administrateur n'a jamais connue.
- Postes ouverts : trousseau relu quand le coffre change ; accès retiré ou clés renouvelées → verrouillage avec message.
- *Comptes et sécurité* : « Clés à réémettre » liste les comptes au trousseau incomplet, avec réémission.
- Défaut trouvé et corrigé pendant le développement (jamais publié) : une copie de travail du trousseau partageait les octets des clés et pouvait les effacer. Garde-fou ajouté : une clé aux octets tous nuls est refusée.
- Nouveau test `tests/trousseau-droits.test.js` (166 au vert) ; vérification dans Chrome.

## 0.4.3 — 7 novembre 2026

Étape 4 (trousseau), troisième sous-étape : **migration d'un coffre version 1**.

- *Administration → Comptes et sécurité* : panneau « Protection des données : passage au trousseau de clés » pour un dossier encore protégé par une clé unique (dossiers d'essai, sauvegardes d'Isocont reprises). La fenêtre demande le mot de passe de l'administrateur, le code de secours actuel (facultatif) et la confirmation qu'une copie complète a été faite et essayée.
- Aucune saisie n'est modifiée : l'ancienne clé devient la génération 1 de la clé de plateforme et de la clé d'Isocont ; les saisies à venir utilisent une génération 2 propre à chacune. L'administrateur garde son mot de passe ; les autres comptes actifs reçoivent un mot de passe provisoire (fiches de remise). Code de secours repris s'il est saisi, sinon nouveau code affiché. Clés de sécurité à réenregistrer, copie sous scellé à refaire.
- Un poste resté connecté pendant la migration se verrouille et demande une reconnexion.
- « Revenir à la clé unique » : tant que l'ancien coffre est dans l'historique, l'administrateur peut le remettre en place (les saisies faites depuis la migration deviennent illisibles).
- Tests de migration (dossier fictif de la 0.4.0, code repris ou nouveau, jeu de formation, poste resté connecté, retour arrière) ; parcours complet vérifié dans Chrome.

## 0.4.2 — 7 novembre 2026

Étape 4 (trousseau), deuxième sous-étape : **coffre version 2 et trousseau en mémoire**, sans changement à l'écran.

- Un dossier neuf est créé en coffre version 2 (`trousseau.js`) : clé de plateforme et clé d'Isocont tirées de clés maîtresses, clé personnelle de l'administrateur, clé de secours ouverte par le code de secours. Plus aucune clé de données unique.
- Connexion par mot de passe, YubiKey ou code de secours : ouverture de la clé personnelle (ou de secours), puis des enveloppes. Journal du socle, comptes et préférences chiffrés par la clé de plateforme ; journal d'Isocont par la clé du module ; jeu de formation sous la clé du module ; fichiers au nouvel en-tête « SIC2 ».
- Comptes : clé personnelle créée à la création du compte ; à la réinitialisation par l'administrateur, nouvelle clé personnelle et nouvelles enveloppes ; changement de mot de passe par l'agent sans changer sa clé. Code de secours renouvelé : nouvelle clé de secours, l'ancien code n'ouvre plus rien.
- À ce stade, tous les comptes reçoivent toutes les clés de droit (la remise selon les rôles vient en 0.4.4) ; les administrateurs et la clé de secours reçoivent les clés maîtresses.
- Un coffre version 1 (dossier de la 0.4.0) s'ouvre et s'utilise exactement comme avant jusqu'à sa migration (0.4.3).
- Nouveau test `tests/trousseau-session.test.js` ; vérification dans Chrome, identique à la version précédente.

## 0.4.1 — 7 novembre 2026

Étape 4 du plan d'architecture (trousseau), première sous-étape : **briques de chiffrement**, sans effet à l'écran.

- Décisions du porteur sur le trousseau reportées dans `docs/architecture.md` § 4 (clés maîtresses et clé de secours, nouvelle génération automatique, aucun rechiffrement à la migration, YubiKey de secours conservée, nouvelle paire créée par l'agent).
- `crypto.js` : clés personnelles (paires ECDH P-256, partie privée rouverte non exportable), enveloppes d'une clé pour la partie publique d'un agent (ECDH éphémère, HKDF-SHA-256, AES-GCM, liées à leur contexte), générations tirées d'une clé maîtresse, en-tête de fichier « SIC2 » portant le numéro de génération (fichiers actuels lus comme génération 1). Les emballages par mot de passe, code de secours et clé de sécurité peuvent emballer la partie privée d'une clé personnelle.
- Nouveau test `tests/trousseau-crypto.test.js` ; briques vérifiées aussi dans Chrome.

## 0.4.0 — 7 novembre 2026

**Étape 3 du plan d'architecture terminée** : comptes et services au socle, activation des modules par service.

- **Modules activés par service** (*Administration → Établissement et services*, nouveau panneau) : l'administrateur coche, service par service, les modules activés. Réglage enregistré au journal du socle, annulable. Sans réglage, le module est activé pour tous les services (comportement d'origine).
- **Service où le module est désactivé** : données conservées ; aucune saisie possible (refus expliqué) ; consultation par le cadre de santé et l'administrateur seulement, le service étant marqué « consultation seule » dans la liste de l'en-tête ; les autres agents ne le voient plus. Un agent dont tous les services sont désactivés en est informé.
- Dès qu'un module est désactivé pour un service, un service créé ensuite est à activer dans le panneau.
- Règles au socle (`droits.js`), services sur lesquels agit une saisie déclarés par le module (`saisies.cibles`).
- Tests : activation, services visibles, refus des saisies, consultation par l'encadrement, réactivation.

## 0.3.1 — 7 novembre 2026

Étape 3 du plan d'architecture, première partie : **journal du socle et rangement par journal**, sans changement de fonctionnement à l'écran.

- **Rangement** : `socle\` (journal du socle) et `modules\isocont\` (journal d'Isocont, jeu de formation dans `modules\isocont\formation\`), chacun avec ses saisies, ses repères d'intégrité, ses instantanés et sa quarantaine. Plus rien n'est écrit à la racine en dehors du coffre, des préférences et des exports.
- **Aiguillage des saisies** : traces des comptes et des clés, prises d'acte d'intégrité et réglages communs (établissement, services, rôles) au journal du socle ; annulation dans le journal de la saisie visée ; tout le reste au journal du module. L'état d'Isocont se reconstitue à partir des deux journaux.
- **Intégrité journal par journal** : chaînage et repères propres à chaque journal ; une prise d'acte ne couvre que le journal concerné ; chemins complets affichés pour le service informatique.
- **Copies, réparation, quarantaine, dossier de secours, déplacement** : adaptés au rangement par journal. Une copie de sauvegarde d'Isocont (`evenements\` à la racine) se restaure dans `modules\isocont\`.
- Nouveau test `tests/journaux.test.js` ; tests de session adaptés au nouveau rangement (chemins seulement).
- Vérification dans Chrome, comparée à Isocont 1.67 : écrans, saisies, journal, administration et rôles identiques ; rangement et intégrité contrôlés dans le stockage de démonstration.

## 0.3.0 — 7 novembre 2026

**Étape 2 du plan d'architecture : contrat de module et registre des modules**, sans changement de fonctionnement.

- `modules.js` (socle) : registre des modules. Chaque module déclare son contrat (identité, accès, droits, saisies, réglages, onglets, migrations, formation, fournitures, besoins), contrôlé à la déclaration ; son fichier d'interface y ajoute ses vues, les libellés du journal et ses panneaux d'administration. Le registre signale les besoins non satisfaits et les migrations à faire.
- `module-isocont.js` : contrat d'Isocont. La fourniture `isocont.echeancesJLD` (v1) est décrite ; son calcul sera branché avec l'Agenda (étape 6). Aucun besoin tant que le module Patients n'existe pas.
- `droits.js` devient un moule : le socle porte les règles des rôles, des accès et de la visibilité du journal ; les accès cochables, les rôles fournis et leurs droits historiques sont des données d'Isocont (`model.js`).
- La session, la coquille (onglets, vues, journal, administration), *Rôles et accès*, l'export des réglages et le mode formation lisent le contrat du module au lieu du modèle d'Isocont.
- Nouveau test `tests/modules.test.js` : contrat d'Isocont identique à ce qu'exposait le modèle, contrats incomplets refusés, besoins satisfaits par un faux fournisseur, migrations.
- Vérification dans Chrome, comparée à Isocont 1.67 : vues, fenêtres, journal, administration (démonstration et formation), aperçu de chaque rôle et modification d'un rôle identiques.

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


