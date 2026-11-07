# Architecture de Tessera Santé

*Document de référence pour le développement. Repris de la fiche d'architecture établie avec le porteur du 4 au 7 novembre 2026 ; à tenir à jour à chaque décision. Les fiches projet et technique en sont les versions destinées à la direction des soins et au service informatique.*

## 1. Objet et principes

Le code de **Suivi-mesures-isocont** (dépôt `rodtrip2/Suivi-mesures-isocont`) devient le premier module de la plateforme Tessera Santé : un **socle commun** (connexion, comptes, services, droits, chiffrement, stockage, sauvegardes, journal) et des **modules** métier qui s'y branchent. Une seule connexion ouvre les modules auxquels le compte a droit.

- **Aucun recul sur les garanties d'Isocont** : application statique, aucune connexion sortante, données chiffrées, journal en ajout seul, saisie simultanée sans perte.
- **Un droit = une clé** : un compte ne peut déchiffrer que les modules auxquels il a accès.
- **Frontière nette** : le socle ne connaît aucune règle métier ; un module ne touche ni au coffre, ni aux clés, ni aux comptes.
- **Modules par service** : l'établissement choisit quels modules sont ouverts dans quel service.
- **Échanges déclarés** : un module ne lit jamais le journal d'un autre ; il demande au socle une information que l'autre module a déclarée comme fournie.
- **Isocont fonctionne à chaque étape** du développement : chaque étape est une version publiable, sans perte de données.
- **Mêmes conventions** qu'Isocont : sans dépendance ni étape de construction, logique testable sous Node.
- **Ouverture** : la fiche patient et le socle ne supposent pas la psychiatrie.

## 2. État des lieux du code d'Isocont

Une dizaine de fichiers sont déjà indépendants du métier ; le mode formation applique déjà le principe d'un jeu de données à clé propre. Trois fichiers centraux (`model.js`, `session.js`, `ui.js`) mêlent socle et métier et doivent être découpés.

Trois constats :

1. **Une seule clé de données pour tout** : `coffre.json` enveloppe une clé unique (mot de passe, YubiKey, code de secours) qui chiffre les comptes et toutes les saisies.
2. **Services, rôles et accès vivent dans le journal d'Isocont** (saisies `CONFIG` : `config.services`, `config.roles`, `M.ACCES`) : ils passent au socle.
3. **Le mode formation est le bon patron** : sous-dossier `formation/`, clé propre enveloppée dans `coffre.formation`, bascule `dossierActif` / `cleActive` dans `Session`. Un module reprend cette mécanique.

| Fichier d'Isocont | Lignes (nov. 2026) | Destination | Ce qui change |
| --- | --- | --- | --- |
| `crypto.js` | 194 | Socle, tel quel | Ajouter les clés personnelles (ECDH) |
| `comptes.js` | 141 | Socle, tel quel | — |
| `xlsx.js`, `pdf.js` | 149, 277 | Socle, tel quel | Bibliothèques partagées |
| `theme.js`, `ui-version.js`, `ui-hors-reseau.js`, `ui-verrou.js`, `sw.js` | 13 à 117 | Socle, tel quel | Libellés à généraliser |
| `store.js` | 699 | Socle, à adapter | Arborescence par module, noms réservés |
| `session.js` | 684 | À découper | Coffre, connexion, intégrité, miroir, exports, préférences → socle ; `enregistrer`, `recalculer`, `peut` appellent le module |
| `model.js` | 2 412 | À découper | Rôles, accès, services, réduction du journal, annulations, conflits, chaînage → socle (environ un cinquième) ; le reste → Isocont |
| `ui.js` | 2 823 | À découper | Accueil, connexion, en-tête, navigation, cadre de l'administration → socle ; vues métier → Isocont |
| `ui-comptes.js`, `ui-roles.js`, `ui-formation.js` | 67 à 150 | Socle | `ui-roles.js` lit les accès déclarés par chaque module au lieu de `M.ACCES` |
| `ui-sauvegarde.js`, `ui-miroir.js`, `ui-reglages.js`, `ui-pdf-etab.js`, `ui-apropos.js` | 54 à 355 | Socle | Appels au modèle remplacés par le contrat de module |
| `rules.js`, `import-v13.js`, `import-registre.js`, `demo.js`, `ui-patients.js`, `ui-decompte.js`, `ui-stats.js`, `ui-registre-cada.js`, `ui-alertes.js`, `ui-cas.js`, `ui-parcours.js`, `ui-qualite.js`, `ui-methode.js`, `ui-import.js` | — | Module Isocont (fiches patient → module Patients) | Pas de changement de fond |

## 3. Architecture cible

```
  Socle commun
  ┌──────────────┬─────────────────────┬──────────────────────────┐
  │ Trousseau    │ Comptes et services │ Journal commun           │
  │ (clés)       │ (rôles par module)  │ (annulations, conflits,  │
  │              │                     │  chaînage)               │
  ├──────────────┼─────────────────────┼──────────────────────────┤
  │ Stockage     │ Exports et PDF      │ Coquille (accueil,       │
  │ (coffre,     │ (papier à en-tête,  │  navigation, cadre de    │
  │  sauvegardes)│  thème, fenêtres)   │  l'administration)       │
  └──────┬───────┴──────────┬──────────┴─────────────┬────────────┘
         │ contexte + sa seule clé                   │
         ▼                  ▼                         ▼
   Module Isocont  ◄─── Module Patients        Module Agenda
   (dépend de           (fiche commune,        (échéances JLD lues
    Patients)            import du DPI)          chez Isocont)
```

**Ce que le socle fournit au module (le contexte)**

- L'agent connecté, ses services autorisés et `peut(acces)` pour ce module.
- `enregistrer(type, data, base)` : écrit une saisie chiffrée avec la clé du module, chaînée et horodatée par le socle.
- La réduction générique du journal : tri, annulations et rétablissements, chaînage, détection des conflits (le module dit seulement quel champ une saisie modifie).
- `exporter`, le générateur PDF avec papier à en-tête, l'aide `h()`, les fenêtres, le thème.

**Ce que le module déclare (son contrat)**

| Élément | Contenu | Exemple pour Isocont |
| --- | --- | --- |
| Identité | identifiant, libellé, version, icône | `isocont`, « Isolement et contention » |
| Accès | accès cochables pour les rôles | les 16 accès actuels de `M.ACCES` |
| Saisies | types, champ logique pour les conflits, fonction d'application | `MESURE_DEBUT`, `JLD`, `PAUSE`… |
| Réglages | valeurs par défaut, validation, groupes exportables | `CONFIG_DEFAUT`, `M.GROUPES_REGLAGES` |
| Vues | onglets et sous-onglets d'administration, chacun lié à un accès | Tableau de bord, Mesures, JLD, Registre… |
| Migrations | étapes numérotées et idempotentes | reprise des réglages actuels |
| Formation | génération d'un jeu fictif (facultatif) | `demo.js` |
| Fournitures | nom, version, champs renvoyés, accès requis | `isocont.echeancesJLD` v1 |
| Besoins | fourniture attendue, facultative ou non | `patients` (obligatoire) |

Les saisies propres au socle (`COMPTE`, réglages de l'établissement et des services, activation des modules, `INTEGRITE`) restent dans le journal du socle. Tant qu'un seul module est actif, l'écran d'accueil des modules est sauté.

**Administration unique** : un onglet général pour les éléments communs (comptes, services, activation des modules, sécurité, sauvegardes) et un onglet par module, fourni par le module.

## 4. Comptes, droits et clés

| Clé | Qui la détient | Ce qu'elle ouvre |
| --- | --- | --- |
| Clé personnelle (paire ECDH P-256, Web Crypto) | l'agent : partie privée emballée par son mot de passe ou sa YubiKey ; partie publique en clair dans le coffre | son trousseau |
| Clé de plateforme (AES-GCM 256) | tous les comptes actifs | comptes, services, rôles affectés, journal du socle (aucune donnée de patient) |
| Clé d'un module (AES-GCM 256, par générations) | les agents qui y ont droit, et l'administrateur | les saisies et réglages de ce module |
| Code de secours (**un seul pour la plateforme**) | l'établissement, sous scellé | la clé de plateforme et toutes les clés de module |

- **Remise d'une clé** : l'administrateur chiffre la clé du module avec la partie publique de l'agent (ECDH + HKDF-SHA-256), sans connaître son mot de passe, sur le poste, sans serveur.
- **Rôles** : chaque module définit ses rôles à partir de ses accès ; le socle affecte au compte ses services (communs à tous les modules) et, module par module, ses rôles. Sans rôle dans un module, pas de clé et pas d'affichage.
- **Retrait d'un droit** : suppression de l'enveloppe, puis **nouvelle génération** de la clé du module pour les saisies à venir. Toutes les générations sont remises aux agents qui gardent l'accès et à tout nouvel agent : ils lisent tout l'historique ; seul l'agent retiré ne reçoit pas la nouvelle.
- **Isocont à la migration** : sa clé de module peut être l'actuelle clé de données (pas de rechiffrement). L'outil n'étant pas déployé, la mise en production part toutefois d'un dossier vide.
- **Mode formation** : propre à chaque module, clé du jeu fictif enveloppée par la clé du module.

## 5. Modules par service

Un agent voit un module dans un service si : le module est **activé pour ce service**, l'agent est **affecté à ce service**, et il a **un rôle dans ce module**. Activation réglée par l'administrateur, tracée au journal du socle.

- **Clés** : l'agent reçoit la clé d'un module dès qu'un de ses services l'active.
- **Cloisonnement entre services d'un même module : par l'interface** (décision du porteur, pour simplifier les transferts de patients). Une clé par module et par service a été écartée.
- **Rôle selon le service** : prévu dans le modèle de données dès le départ (rôle affecté par module et par service) ; écran de réglage plus tard.
- **Désactivation d'un module pour un service** : données conservées, plus de saisie, consultation par le cadre et l'administrateur.

## 6. Échanges entre modules

| Mode | Fonctionnement | État |
| --- | --- | --- |
| Lecture à la volée | le socle demande au module fournisseur de calculer, sur le poste, avec sa clé déjà dans le trousseau de l'agent ; rien n'est écrit | **retenu** |
| Publication | le fournisseur réécrit un extrait minimal chiffré par une clé d'échange du service (`echanges/<module>/<service>.enc`) | prévu dans le contrat, **désactivé par défaut** ; activation après avis du délégué à la protection des données |

- Exemple : `isocont.echeancesJLD` v1 (date et heure, nature : information, saisine, décision ; type de mesure ; service ; référence de la mesure ; statut), consommé par l'Agenda, facultatif pour lui. Les échéances restent calculées par le moteur légal (`M.suiviJLD`, `rules.echeances`) depuis le début de la mesure.
- **Identité du patient dans l'agenda** : au choix de l'établissement, aucune, initiales, IPP ou nom complet (le plus exposant, à réserver aux services qui en ont besoin). Par défaut : la référence de la mesure ; un clic ouvre la mesure pour qui y a accès.
- **Lecture seule** : un module n'écrit jamais dans un autre.
- **Mise à jour** : le socle signale « module X a changé » (`Session.sur`), le consommateur se rafraîchit.
- **Garde-fous** : interfaces numérotées, pas de dépendance circulaire, tests sous Node avec un faux fournisseur.

## 7. Module Patients

Module de référence, partagé par tous les modules qui concernent des patients, avec ou sans mesure. La liste des patients existe dans le DPI ; la fiche commune sert à **relier les modules entre eux**.

**Ce qui change de place**

| Élément | Aujourd'hui dans Isocont | Demain |
| --- | --- | --- |
| Identité (IPP, nom, prénom, date de naissance) | saisie `PATIENT` | Patients |
| Protection juridique, patient détenu | saisie `PATIENT` | Patients |
| Mode d'hospitalisation et historique daté | saisie `MODE_HOSPI` | Patients |
| Fusion de fiches, doublons | `FUSION`, `M.doublonsPossibles` | Patients ; les modules rattachent leurs données à la fiche conservée |
| Droit d'accès d'un patient | `M.donneesPatient`, Isocont seul | le socle réunit l'export de tous les modules |
| Durée de conservation | `M.auDelaConservation`, d'après les mesures | Patients, d'après la dernière activité dans tous les modules |
| Cumuls, âge au début, mode retenu au registre, alertes | moteur Isocont | restent dans Isocont, qui lit la fiche |

**Champs de la fiche** (décision du 5 novembre 2026)

| Champ | Source |
| --- | --- |
| IPP, nom, prénom, noms de naissance et d'usage, date de naissance, sexe | import du DPI ou saisie |
| Séjour : entrée, sortie, unité ; chambre et lit | import du DPI ou saisie |
| Médecin de 1re ligne, médecin de 2e ligne | saisie dans Tessera (distincts du médecin responsable du DPI) ; importables plus tard si le DPI les porte |
| Référents soignants (plusieurs) | saisie dans Tessera, parmi les comptes du service, nom libre possible |
| Protection juridique, patient détenu, mode d'hospitalisation | saisie dans Tessera |

**Règles**

- **Dépendance forte** : Isocont et l'Agenda ne fonctionnent pas sans Patients ; le socle charge Patients d'abord ; un agent qui a accès à un module lié aux patients reçoit la clé de Patients en lecture.
- **Lecture et écriture distinctes** : créer ou corriger une fiche est un accès du module Patients, paramétrable (IDE, secrétaire et cadre par défaut).
- **Commun ou propre** : Patients ne garde que ce qui sert à plusieurs modules ; un module peut déclarer un champ supplémentaire, activé par l'administrateur. Aucune donnée clinique.
- **Libellés réglables par service** (« Psychiatre de 1re ligne » en psychiatrie, « Médecin de 1re ligne » ailleurs) ; liste des médecins du service reprise de `config.psychiatres` et passée au socle. Champs propres à la psychiatrie (mode légal, détenu) activés par service.
- **Historique daté, jamais écrasé** : un changement de mode, de protection, de médecin ou de référent est une saisie datée ; les calculs d'Isocont lisent la valeur en vigueur à la date de la mesure.
- **Fusion** : faite dans Patients, signalée aux modules, qui recalculent ; aperçu de l'impact sur tous les modules.

## 8. Imports

### Liste des patients exportée du DPI (décisions des 4 au 7 novembre 2026)

Export CSV fait par un agent depuis le DPI, importé dans Tessera (requête planifiée et flux HL7 PAM écartés pour l'instant). Fichier lu dans le navigateur, jamais copié sur le partage.

1. **Lecture** : CSV ou Excel ; UTF-8 puis Windows-1252 (comme `ui-import.js`) ; ligne d'en-tête repérée ; lignes vides ignorées.
2. **Attribution des colonnes** : pour chaque champ, une colonne ou « Non fourni par l'export : à renseigner dans Tessera » (choix automatique pour un champ sans colonne). **Une colonne peut être attribuée à plusieurs champs et découpée.**
3. **Correspondance des valeurs** : sexe, codes d'unité du DPI vers les services, formats de date.
4. **Aperçu** : patients nouveaux, fiches modifiées (ancienne → nouvelle valeur), doublons possibles, lignes de découpage ambiguës, patients absents de la liste.
5. **Enregistrement** en un lot annulable, tracé.

- **Modèle d'import mémorisé** (par établissement, ou par service si les exports diffèrent), dans l'export des réglages.
- **Source de chaque champ** : un champ « à renseigner dans Tessera » n'est jamais touché par l'import ; une correction manuelle d'un champ importé n'est pas écrasée (écart signalé).
- **Patients absents de la liste** : sortie proposée, jamais appliquée d'office.

**Export « patients présents » de Sillage** (exemple fourni le 7 novembre 2026, colonnes confirmées par le porteur) : séparateur `;`, encodage Windows-1252.

| Colonne | Champ | Remarque |
| --- | --- | --- |
| `IEP` | Numéro de séjour | Identifiant d'épisode, change à chaque séjour |
| `Sexe` | Sexe | `F` / `M` |
| `Nom prénom` | Nom, prénom, nom de naissance | « NOM PRENOM Née NOMNAISSANCE » ; tout en majuscules sauf `Né` / `Née`, mot-clé toujours présent |
| `Né·e le` | Date de naissance | JJ/MM/AAAA |
| `Entrée` | Date d'entrée | JJ/MM/AAAA |
| `RM`, `RH` | Unité médicale, unité d'hébergement | Codes d'unité, à faire correspondre aux services |
| `Loc.` | Chambre et lit | `HD412-U` = chambre 412, lit U (unique) ; P = côté porte, F = côté fenêtre |
| `Médecin responsable` | Non importé par défaut | Distinct des médecins de 1re et 2e ligne |
| `Commentaires` | Non importé | Texte libre, risque de données cliniques |

**Découpage du nom** : (1) ce qui suit `Né` / `Née` est le nom de naissance ; (2) si le texte avant le mot-clé commence par le nom de naissance, ce nom est le nom d'usage et le reste le prénom ; (3) sinon, le dernier mot est le prénom (trait d'union conservé) ; (4) toute ligne découpée par la règle 3 avec plus de deux mots est signalée ; le découpage validé est gardé pour la fiche. Prénom affiché avec initiale majuscule, nom en capitales.

**IEP et IPP** : sans IPP dans l'export, une réadmission arrive avec un nouvel IEP et doit être rattachée par la détection des doublons (nom, prénom, nom de naissance, date de naissance, sexe), avec confirmation. Le registre exige l'identifiant du patient : ajout de l'IPP à l'export à demander à l'administrateur de Sillage ; à défaut, saisie dans Tessera.

### Reprise de l'historique des mesures (décision du 5 novembre 2026)

Mise en production **à partir de zéro donnée**. Les deux imports d'Isocont sont conservés et peuplent à la fois Patients et Isocont :

- import à partir du **registre du service** (CSV ou Excel de n'importe quel outil) et, comme cas particulier, **import du classeur V1.3** ; mécanique inchangée (services absents, compteurs, contrôle de numérotation, aperçu, décisions par mesure) ;
- **deux lots** (Patients : identité, protection, mode et historique ; Isocont : mesures, pauses, JLD, tiers, surveillance) liés par un identifiant d'import commun : annulation conjointe, pas de doublon si relancé ; Isocont transmet ses propositions de fiches à Patients, qui les enregistre lui-même ;
- rattachement par l'IPP, puis par la détection des doublons ;
- **ordre conseillé** : historique des mesures, puis liste des patients présents (qui complète séjour et chambre) ;
- contrôle : cumuls, échéances et registre recalculés, comparés au document importé.

## 9. Stockage sur le partage

```
TesseraSante\
  coffre.json                  clés publiques, enveloppes, comptes chiffrés, révision
  coffre-historique\           30 dernières versions du coffre
  socle\evenements\AAAA\MM\    saisies du socle
  reperes\  preferences\  quarantaine\
  modules\patients\evenements\AAAA\MM\
  modules\isocont\evenements\AAAA\MM\   (+ instantanes\, formation\)
  modules\agenda\evenements\AAAA\MM\
  echanges\                    seulement si la publication est activée
  exports\<service>\<catégorie>\
```

- Sauvegardes, dossier de secours, copie sous scellé et réparation travaillent sur l'ensemble du dossier.
- Contrôle d'intégrité journal par journal : socle, puis chaque module.

## 10. Hébergement

- **Phase pilote** : version publiée par le porteur sur GitHub Pages (`https://rodtrip2.github.io/tessera-sante/`) ; seul le code y est hébergé ; le porteur maîtrise les évolutions jusqu'à maturité des modules ; **double authentification activée sur le compte GitHub**, branche principale protégée. Usage avec des données réelles soumis à l'accord du service informatique, du responsable de la sécurité informatique et du délégué à la protection des données.
- **À maturité** : copie d'une version étiquetée sur l'intranet HTTPS de l'établissement ; clés de sécurité à réenregistrer (liées au nom de domaine) ; données inchangées.

## 11. Plan de développement

Sept étapes, chacune publiable seule avec tous les tests au vert.

1. **Découper sans changer le comportement.** `model.js` → `noyau-journal.js` (réduction, annulations, chaînage, conflits) + `droits.js` (rôles, accès, services) + modèle Isocont. `session.js` → session du socle + appels au module. `ui.js` → coquille + vues Isocont. Les tests existants passent sans modification.
2. **Contrat de module et registre des modules** (`SIC.modules` ou équivalent). Isocont se déclare ; `ui-roles.js`, les réglages et la formation lisent ce que le module déclare. Interface identique.
3. **Comptes et services au socle.** Réglages `services` et `roles` au journal du socle ; activation des modules par service.
4. **Trousseau.** Clés personnelles, clé de plateforme, clés de module par générations ; code de secours unique.
5. **Module Patients.** Fiches, modes, séjours, fusion et doublons sortent d'Isocont ; import de la liste du DPI ; imports du registre et du classeur adaptés pour peupler les deux modules ; registre, cumuls et échéances identiques avant / après.
6. **Module Agenda.** Frontière, activation par service, premier échange (échéances JLD en lecture à la volée), écran d'accueil des modules.
7. **Kit de déploiement.** Fiche technique, éléments RGPD (un traitement par module), guides d'installation et d'utilisation.

**État du plan** (au 7 novembre 2026) :

| Étape | État |
| --- | --- |
| Reprise du code d'Isocont 1.67 | Faite : historique d'Isocont relié à celui de Tessera (commit de fusion), 139 tests repris au vert |
| 1. Découper | **Faite (0.2.0).** `model.js` → `noyau-journal.js` (tri, lots, annulations et rétablissements, chaînage, conflits, intégrité), `droits.js` (rôles, accès, services, visibilité du journal et des onglets), `exports-rangement.js` (rangement et purge des exports) + modèle d'Isocont, même interface. `session.js` → session du socle, seul point d'appel au module : `moduleActif()` (reconstitution de l'état, réglages par défaut). `ui.js` → coquille + `ui-isocont.js` : vues et fenêtres, libellés du journal (`SIC.ui.journal`), panneaux d'administration (`SIC.ui.admin`). Correction en chemin : ordre des saisies d'une même milliseconde (0.1.1). Garde-fou : `tests/interface-noms.test.js` |
| 2. Contrat de module et registre | **Faite (0.3.0).** `modules.js` : registre (déclaration contrôlée du contrat, interface ajoutée par le fichier d'interface du module, besoins non satisfaits, migrations à faire). `module-isocont.js` : contrat d'Isocont (identité, accès, droits, saisies, réglages, onglets, migrations — aucune —, formation, fourniture `isocont.echeancesJLD` v1 décrite, besoins — aucun avant le module Patients). `droits.js` devient un moule (`creer`) : règles au socle, accès et rôles fournis par le module. Session, coquille (onglets, vues, journal, administration), *Rôles et accès*, export des réglages et mode formation lisent le contrat. Interface identique (comparée dans Chrome à Isocont 1.67) |
| 3 à 7 | À faire |

Restent propres à Isocont dans la coquille : quelques aides d'affichage liées aux patients et aux mesures (`patient`, `lieu`, réglages d'affichage de l'accueil), à reprendre avec le module Patients (étape 5) ; textes (titre, « Informations techniques », fichier lisez-moi du jeu de formation), à généraliser avec l'écran d'accueil des modules (étape 6). À l'étape 3 : le panneau « Règles légales et sécurité » d'Isocont porte aussi le verrouillage après inactivité, réglage du socle.

Points de vigilance : `ui.js` est le découpage le plus long, à faire par blocs d'écran ; la mise en place du trousseau (étape 4) doit être testée sur une copie complète avant tout dossier réel.

## 12. Décisions du porteur

| Question | Décision | Date |
| --- | --- | --- |
| Nom et dépôt | Tessera Santé, dépôt `rodtrip2/tessera-sante` (aucun résultat à l'INPI) | 4–5 nov. 2026 |
| Retrait d'un droit | Nouvelle génération de clé ; les autres agents et les nouveaux gardent tout l'historique | 4 nov. 2026 |
| Rôles et réglages | Administration unique : onglet général + un onglet par module | 4 nov. 2026 |
| Données d'Isocont | Déplacées sous `modules\isocont\` (outil non déployé) | 4 nov. 2026 |
| Code de secours | Un seul pour la plateforme | 4 nov. 2026 |
| Premier module nouveau | L'Agenda, après Patients | 4 nov. 2026 |
| Connexion Windows | Au niveau du socle, plus tard (voir `evolutions-futures.md`) | 4 nov. 2026 |
| Cloisonnement entre services | Par l'interface | 4 nov. 2026 |
| Rôle selon le service | Pas dès le départ, mais prévu dans le modèle | 4 nov. 2026 |
| Échanges entre modules | Lecture à la volée ; publication activable plus tard | 4 nov. 2026 |
| Identité dans l'agenda | Au choix : aucune, initiales, IPP, nom complet | 4 nov. 2026 |
| Création des fiches patient | Paramétrable ; IDE, secrétaire, cadre par défaut | 4 nov. 2026 |
| Patients sans mesure | Saisie manuelle et import CSV exporté du DPI | 4 nov. 2026 |
| Champs de la fiche | Voir § 7 | 5 nov. 2026 |
| Colonnes de l'import | Attribuées à l'import ; champ non fourni → saisi dans Tessera ; colonne découpable | 5–6 nov. 2026 |
| Reprise de l'historique | Départ à zéro, imports du registre et du classeur peuplant Patients et Isocont | 5 nov. 2026 |
| Hébergement du pilote | GitHub Pages, double authentification | 5 nov. 2026 |
| Export de Sillage | Colonnes et règles du § 8 | 7 nov. 2026 |
| Lien avec le dépôt d'Isocont | Code repris de la version 1.67 avec son historique (commit de fusion) ; numérotation propre à Tessera à partir de 0.1.0 | 7 nov. 2026 |

**Questions restantes** : ajout de l'IPP à l'export de Sillage (à demander à l'administrateur du DPI) ; contenu de l'Agenda au-delà des échéances JLD (à définir avec les équipes) ; devenir du dépôt `Suivi-mesures-isocont` une fois Tessera en service.
