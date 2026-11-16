# Fiche pour le responsable de la sécurité informatique — Tessera Santé

*Destinataire : responsable de la sécurité informatique (RSSI) de l'établissement. Objet : décrire le modèle de sécurité de Tessera Santé, le comparer aux fichiers Word et Excel rangés aujourd'hui sur les partages, rendre compte de l'audit du 15 novembre 2026 et lister les points à arbitrer. Détail technique complet : fiche technique (`docs/fiche-technique.md`). Version du 16 novembre 2026 (Tessera 0.77).*

| En bref | |
| --- | --- |
| **Architecture** | Application statique (HTML, CSS, JavaScript, sans dépendance ni étape de construction), servie par un serveur web ; données dans un dossier d'un partage SMB, lues et écrites par le navigateur (File System Access API, Edge ou Chrome). Aucun serveur applicatif, aucune base de données. |
| **Chiffrement** | AES-GCM 256 sur le poste ; une clé par module et par clé de cloisonnement, remise par ECDH P-256 aux seuls agents qui y ont droit ; coffre des clés signé (ECDSA P-256) par l'administrateur et vérifié par chaque poste. |
| **Réseau** | Aucune connexion sortante : politique de sécurité du contenu `default-src 'none'` et `connect-src 'none'` ; aucun script ni service extérieur. |
| **Audit** | Audit complet de la version 0.70.1 le 15 novembre 2026 ; les constats bloquants avant toute donnée réelle sont corrigés (versions 0.71 à 0.77). |
| **Ce qui vous est demandé** | Avis sur le modèle de menace, la politique de connexion (second facteur), la chaîne de publication et les points du § 6. |

## 1. Ce que vous cherchez, ce que vous gardez sous votre contrôle

Vous cherchez à savoir ce qu'un attaquant peut obtenir, avec quels moyens, et ce que l'établissement garde en main. Avec Tessera :

- **la surface est réduite** : pas de serveur applicatif à maintenir ni à exposer, pas de port ouvert, pas de compte de service, pas de base de données ; la page ne peut rien envoyer sur le réseau ;
- **les données ne quittent pas l'infrastructure** : le partage, ses droits NTFS et ses sauvegardes restent les vôtres ;
- **la version publiée est vérifiable** : code public, non minifié, empreintes SHA-256 de chaque fichier publiées avec chaque version ; en production, l'établissement sert une version qu'il a vérifiée et figée ;
- **les décisions de sécurité sont des réglages attestés** : règle des mots de passe, rôles soumis au second facteur, exigence de signature des saisies sont inscrits dans l'état signé du coffre.

## 2. Ce qui change par rapport aux fichiers Word et Excel sur le partage

| Risque | Fichiers Word et Excel sur un partage | Tessera Santé |
| --- | --- | --- |
| **Copie ou vol du dossier, sauvegarde exfiltrée** | Fichiers lisibles en clair | Fichiers chiffrés (AES-GCM, données associées liées au nom du fichier) ; inexploitables sans moyen de déverrouillage |
| **Administrateur du serveur, compte technique, agent d'un autre service ayant des droits trop larges** | Lecture de tout le dossier | Lecture impossible sans la clé du module, remise personnellement à chaque agent habilité |
| **Rançongiciel, suppression** | Fichier chiffré ou effacé : perte du fichier entier | Une saisie = un fichier, jamais modifié ; suppression détectée (chaînage, repères) ; restauration fichier par fichier ; sauvegardes chiffrées de fait |
| **Falsification** | Modification invisible d'une cellule | Chiffrement authentifié ; **chaque saisie signée** par la clé de son auteur ; saisie altérée, au nom d'un autre ou hors des droits de son auteur à sa date : écartée sur tous les postes et signalée |
| **Macros** | Classeurs avec macros, exécutées sur le poste | Aucun code exécuté depuis les données ; interface construite sans interprétation HTML (jamais `innerHTML`) ; formules neutralisées dans les CSV exportés |
| **Départ d'un agent** | Accès tant que les droits du dossier ne sont pas revus | Retrait du rôle : nouvelle génération de clé ; l'agent retiré ne lit plus les saisies suivantes |
| **Authentification** | Session Windows, parfois mot de passe Office partagé | Compte personnel, mot de passe conforme à la recommandation de la CNIL ; second facteur par clé FIDO2 exigible par rôle |
| **Traçabilité** | « Dernière modification par » | Journal en ajout seul, nominatif, signé, chaîné ; contrôle d'intégrité à la connexion puis toutes les 15 minutes |

## 3. La traçabilité informatisée des tâches, un atout de sécurité

La traçabilité des tâches du service (échéances légales, check-lists, alertes, contrôles) sert d'abord la qualité des soins : ce qui doit être fait est visible, ce qui a été fait est daté et signé. Elle sert aussi la sécurité : chaque action est imputable, une anomalie se repère (saisie écartée, écart d'horloge, trou dans le chaînage, coffre modifié hors de l'outil) et l'administrateur dispose d'un historique fiable pour reconstituer un incident.

## 4. Corrections issues de l'audit du 15 novembre 2026

| Constat | Correction | Version |
| --- | --- | --- |
| Un réglage forgé dans le journal du socle (clé de plateforme détenue par tous) pouvait entraîner la remise d'une clé | Remise d'une clé nouvelle confirmée par l'administrateur (refus possible, cadre prévenu) ; **signature de chaque saisie** (ECDSA P-256, clé tirée de la clé personnelle par HKDF, attestée) ; **droits de l'auteur contrôlés à la lecture**, d'après ses rôles et les réglages à la date de la saisie | 0.71 à 0.74 |
| Publication sans garde-fou | Tests et empreintes bloquants ; signature vérifiée exigée pour les versions stable et bêta ; approbation du porteur ; actions épinglées par empreinte ; droits du jeton par tâche ; branches publiées protégées (suppression, réécriture, signature) ; étiquettes de version réservées | 0.74 |
| Mot de passe seul | Règle de la CNIL appliquée d'office ; second facteur (seconde enveloppe fermée par le secret PRF de la clé autour de l'emballage par mot de passe : sans la clé, aucun essai de mot de passe possible sur une copie du coffre) ; code de la clé exigible | 0.75 |
| Exports en clair conservés sans limite | Purge après 31 jours par défaut ; avertissement | 0.77 |
| Horloge du poste | Écart avec le serveur du partage (date d'écriture du fichier) signalé au-delà de 5 minutes et tracé | 0.77 |
| Injection de formule dans les CSV | Cellules commençant par =, +, - ou @ neutralisées | 0.77 |
| Mots de passe provisoires dans l'export des comptes | Retirés de l'export | 0.77 |
| Robustesse du journal et des imports | Identifiants réservés (« __proto__ »…) écartés ; décompression des classeurs plafonnée | 0.77 |

## 5. Limites assumées

- **Cloisonnement entre services d'un même module** par l'interface (choix du porteur) ; la séparation entre modules est cryptographique.
- **Hors du contrôle des droits à la lecture** : permissions qui dépendent de l'état du module, données ajoutées, contrôles fins (service visé, règles métier) ; ces saisies restent signées et nominatives.
- **Bris de glace, limite « patients présents », lecture tracée d'un message chiffré** : garantis par l'application et la traçabilité, pas par la cryptographie.
- **Métadonnées en clair** : identifiants de connexion dans `coffre.json`, auteur et dates des entretiens chiffrés, liste des détenteurs des clés maîtresses.
- **Essais de mot de passe** : non limités par l'application (pas de serveur) ; PBKDF2-SHA-256 600 000 itérations, règle renforcée et second facteur y répondent.
- **Poste compromis** (enregistreur de frappe) et **exports ouverts sur un poste** : hors du périmètre de l'application.
- **Second facteur** essayé avec l'authentificateur virtuel de Chrome ; essai avec une vraie clé à faire en recette.

## 6. Points à arbitrer

- [ ] Modèle de menace et limites ci-dessus.
- [ ] Rôles pour lesquels le second facteur est exigé (proposé : administrateur, puis cadres) ; code de la clé ; modèle de clé retenu ; ports USB autorisés.
- [ ] Rôles par service réglés par le cadre : remise indirecte de clés, désormais confirmée par l'administrateur.
- [ ] Justification des bris de glace lisible par les détenteurs de la clé du module Patients.
- [ ] Compte qui suit un pôle ; chiffrement réservé aux destinataires de la messagerie ; clés par document.
- [ ] Clé de signature tirée de la clé personnelle ; tolérance d'horloge de 15 minutes pour le contrôle des droits ; seuil d'alerte d'horloge de 5 minutes.
- [ ] Phase pilote sur GitHub Pages (dépôt public, compte du porteur en double authentification, commits signés, approbation des versions) ; passage sur l'intranet ensuite.
- [ ] Postes hors réseau (BitLocker, liste nominative) ; fichiers exportés du DPI ; droits NTFS du sous-dossier des exports.
- [ ] Suites proposées : relecture extérieure du socle, tests d'attaque complémentaires, test de charge, en-tête `require-trusted-types-for 'script'`.

## 7. Documents de référence

Fiche technique (§ 6 cryptographie, § 9 modèle de menace, § 13 limites, § 14 recette) ; procédures de secours (document 04) ; dossier de secours robocopy (document 09) ; travail hors réseau (document 10).
