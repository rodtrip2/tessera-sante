# Tessera Santé — test de charge, espace disque et quotas

*Test du 16 novembre 2026 (version 0.84.1), complété par les améliorations de la version 0.85.0 (§ 3 bis), sur données fictives. Destinataires : porteur du projet, service informatique (DSI ou direction du numérique, selon l'établissement), responsable de la sécurité informatique (RSSI). Script : `scripts/charge.cjs`, relançable à volonté avec d'autres hypothèses.*

## 1. En bref

- **Espace disque** : environ **300 Mo par service et par an** sur le partage, modules d'organisation tous utilisés, pièces jointes désactivées (réglage par défaut). Le double avec le dossier de secours. Avec les pièces jointes de la messagerie, compter **+ 450 Mo par service et par an** (2 pièces de 600 Ko par jour).
- **Nombre de fichiers** : environ **53 000 fichiers par service et par an**. Ce nombre, plus que la place, est la première limite : sauvegarde, antivirus et lecture du dossier par chaque poste.
- **Temps de réponse en usage courant** : bons. Après une saisie, l'écran se met à jour en 10 à 400 ms selon la taille de l'établissement.
- **Trois points bloquants au-delà de quelques services et années**, traités en version 0.85.0 (§ 3 bis) :
  1. la **première lecture** d'un poste à la connexion (vérification de chaque saisie) : deux fois plus rapide ;
  2. le **recalcul complet** fait toutes les 10 minutes (l'écran se figeait plusieurs secondes) : trois fois plus court, et une fois par heure seulement ;
  3. la **mémoire** du navigateur, chaque poste chargeant les données de **tous les services** sur toutes les années : divisée par trois à quatre.
- **Quotas** : inutiles pour les saisies ordinaires. **Utiles pour les documents et les pièces jointes**, seuls capables de remplir le partage. Ils doivent être réglables par agent et par service, et **ne jamais bloquer** une saisie d'Isolement et contention.

## 2. Méthode

Le script génère l'activité quotidienne de plusieurs services, jour après jour, sur plusieurs années. Il utilise les vrais calculs de Tessera (les mêmes fichiers que l'application). Il mesure :

- la **taille réelle** des fichiers, sur un échantillon de chaque type de saisie chiffré (AES-GCM) et signé (ECDSA P-256) comme dans l'application ;
- la **place occupée sur un disque**, par blocs de 4 Ko (taille habituelle sur un serveur de fichiers Windows). Elle a été vérifiée en écrivant pour de vrai une année d'un service : 51 187 fichiers, 19 Mo de contenu, 214 Mo occupés ;
- le **temps de calcul** d'un poste : lecture, reconstitution de l'état de chaque module, écrans les plus lourds ;
- la **mémoire** occupée.

Tout est mesuré sous Node, sur un poste de développement à 2 cœurs. Un poste hospitalier peut être 2 à 3 fois plus lent. **L'accès au partage réseau n'est pas mesuré** : il reste à mesurer sur place (§ 7).

### Hypothèses par service (unité de 20 lits, 35 agents), par jour

| Domaine | Hypothèse quotidienne |
| --- | --- |
| Patients, Vue d'ensemble | 0,7 admission, 3 corrections de fiche, 1 sortie prévue, 8 valeurs ajoutées |
| Isolement et contention | 0,5 mesure (début, tiers, pause une fois sur trois, juge pour les mesures longues, fin, entretien), 6 traces de surveillance |
| Agenda, Suivi médical, Véhicules | 15 tâches cochées, 3 événements, 13 actions sur les événements, 2 alertes, 5 suivis, 1 réservation |
| Messagerie | 4 messages, 12 lectures confirmées par message, 2 réponses |
| Documents | 0,2 document créé, 4 versions enregistrées (70 % de 8 Ko, 25 % de 40 Ko, 5 % de 300 Ko), 0,02 image de 400 Ko |
| Congés, heures, formations | 1,2 demande de congé, 2 déclarations d'heures, 0,2 inscription en formation (chacune avec sa décision) |
| Contrôles des CSI, travaux, salles… | 6 contrôles confirmés par un second agent, 0,3 demande de travaux, 2 réservations de salle, 2 exports |
| Options | données cliniques : 3 feuilles de staff, 8 notes ; pièces jointes : 2 par jour, 600 Ko |

Soit **144 saisies par service et par jour** (154 avec les données cliniques), environ **53 000 par an**. La messagerie en représente le tiers, à cause des lectures confirmées : chaque lecteur écrit une saisie.

## 3. Résultats

| Établissement simulé | Saisies | Place sur le partage | Calcul de la première lecture | Recalcul complet | Après une saisie | Mémoire |
| --- | --- | --- | --- | --- | --- | --- |
| 1 service, 1 an | 53 000 | 0,3 Go | 10 s | 0,8 s | 10 ms | 0,2 Go |
| 1 service, 10 ans | 528 000 | 3,0 Go | 95 s | 9 s | 120 ms | 1,5 Go |
| 3 services, 3 ans | 475 000 | 2,7 Go | 87 s | 8 s | 110 ms | 1,4 Go |
| 5 services, 3 ans | 791 000 | 4,5 Go | 141 s | 17 s | 390 ms | 2,6 Go |
| 10 services, 2 ans | 1 055 000 | 6,0 Go | 196 s | 22 s | 420 ms | 2,9 Go |

*Première lecture : temps de calcul seul (déchiffrement 0,07 ms et vérification de la signature 0,16 ms par saisie), sans le temps d'accès au partage. Recalcul complet : à la connexion, toutes les 10 minutes, et après une saisie arrivée en retard, une annulation ou une correction de fiche patient.*

**Écrans** (10 services, 2 ans) :

| Écran | Temps |
| --- | --- |
| Registre d'un service | 50 ms |
| Statistiques de l'année | 0,7 s |
| Onglet Patients | 0,1 s |
| Onglet Juge | 0,1 s |
| Agenda de la semaine | 0,1 s |
| Alertes de l'Agenda | 0,3 s |

**Défaut corrigé pendant le test** : le registre d'un service prenait 0,4 s dès un an d'activité, et davantage avec chaque année et chaque service. Il parcourait toutes les traces de surveillance de l'établissement pour chacune de ses entrées. Les traces sont désormais rangées par service et par jour, et le registre est passé de 424 ms à 8 ms. L'alerte au cadre des numéros décalés, qui recalculait le registre à chaque affichage de la barre des modules, garde désormais son résultat tant que les données ne changent pas.

## 3 bis. Améliorations de la version 0.85.0 (demande du porteur du 16 novembre 2026)

| Mesure | 3 services, 3 ans : avant | après | 10 services, 2 ans : avant | après |
| --- | --- | --- | --- | --- |
| Calcul de la connexion | 87 s | 50 s | 217 s | 110 s |
| Recalcul complet (connexion, saisie en retard, annulation) | 8,2 s | 2,4 s | 22 s | 7,5 s |
| Recalcul de garantie | 8,2 s toutes les 10 min | 1,2 s une fois par heure | 22 s toutes les 10 min | 4,6 s une fois par heure |
| Après une saisie | 110 ms | 70 ms | 420 ms | 220 ms |
| Mémoire | 1,8 Go | 0,5 Go | 3,7 Go | 1,1 Go |

*La mémoire « avant » compte les contenus des documents (environ 0,35 Go à 3 services sur 3 ans), que la première mesure du § 3 ne comptait pas. Le temps de connexion ne comprend toujours pas la lecture du partage : la lecture par lots devrait la raccourcir bien davantage sur un vrai partage réseau, où chaque fichier attend la réponse du serveur.*

Ce qui a changé, sans rien changer aux résultats :

1. **Connexion** :
   - les fichiers d'un mois sont lus sur le partage par lots de 32 en parallèle, au lieu d'un par un ;
   - les signatures sont vérifiées par lots de 64 en parallèle. Le gain mesuré est de 2,5 sur 2 cœurs ; il sera plus grand sur un poste qui en a davantage ;
   - les saisies écartées et les fichiers illisibles restent signalés de la même façon.
2. **Recalcul** :
   - l'index des saisies, le journal, les annulations et les maillons manquants du chaînage sont calculés une fois pour tous les modules ; avant, chacun des 18 modules en tenait sa propre copie ;
   - le tri des saisies est plus rapide ;
   - la comparaison du journal et la copie des fiches patient sont faites une fois par recalcul, et non une fois par module ;
   - le recalcul complet de garantie, fait jusqu'ici à chaque lecture complète du partage (toutes les 10 minutes), n'a plus lieu qu'**une fois par heure**. Une saisie arrivée en retard, une annulation ou une correction de fiche patient déclenchent toujours un recalcul complet aussitôt.
3. **Mémoire** :
   - les anciennes versions des documents ne gardent plus leur contenu en mémoire. Seules les 3 dernières versions de chaque document et les versions validées le gardent. Les autres sont relues sur le partage quand l'agent les ouvre, avec leur signature vérifiée. Rien ne change sur le partage ;
   - l'index commun du point 2 divise aussi la mémoire des états par six.

Ces améliorations sont couvertes par des tests : tous les tests existants (dont ceux qui comparent le recalcul incrémental au recalcul complet), plus un test de l'allègement et de la relecture des versions.

**Ce qui reste** : la mémoire et le temps de connexion croissent toujours avec le nombre de services et d'années, car chaque poste charge tout l'établissement. Vers 10 services sur 5 ans (2,6 millions de saisies), il faut compter environ 2,8 Go, près de la limite d'un onglet de navigateur. Il faudra alors **ne charger que l'année en cours et la précédente**, et lire les années plus anciennes à la demande (registre, statistiques, droit d'accès) : c'est un changement de fond, à décider avant un déploiement de cette taille. La vérification des signatures pourrait aussi être gardée en mémoire sur le poste, entre deux connexions ; c'est un choix de sécurité à soumettre au responsable de la sécurité informatique.

## 4. Espace disque nécessaire par service

| Poste | Par service et par an | Remarque |
| --- | --- | --- |
| Fichiers de saisies | 245 Mo occupés (59 Mo de contenu) | Une saisie moyenne fait moins de 400 octets (hors documents) mais occupe un bloc entier de 4 Ko sur le disque : la place occupée est environ 4 fois le contenu |
| — dont messagerie | 77 Mo | Surtout les lectures confirmées |
| — dont Agenda | 47 Mo | |
| — dont documents | 45 Mo | Chaque enregistrement est une version complète du document |
| — dont Isolement et contention | 12 Mo | Mesures et traces de surveillance |
| Instantanés mensuels | 59 Mo | Copie groupée des mois clos, pour une lecture rapide |
| **Total sur le partage** | **≈ 300 Mo** | |
| Dossier de secours (serveur ou poste) | ≈ 300 Mo de plus | Une copie complète par dossier de secours |
| Données cliniques (option) | + 15 Mo | |
| Pièces jointes de la messagerie (option) | + 450 Mo | 2 pièces de 600 Ko par jour |
| Dossier des exports | selon l'usage | Décomptes, registres, statistiques en PDF ou CSV, purgeables (*Sauvegardes et exports*) |

**Pour dimensionner le partage**, avec une marge de 50 % pour les usages plus intenses que l'hypothèse :

| Établissement | 1 an | 5 ans | 10 ans |
| --- | --- | --- | --- |
| 1 service | 0,5 Go | 2,5 Go | 5 Go |
| 5 services | 2,5 Go | 12 Go | 25 Go |
| 10 services | 5 Go | 25 Go | 50 Go |
| 20 services | 10 Go | 50 Go | 100 Go |

Il faut doubler ces chiffres pour chaque dossier de secours. Avec les pièces jointes, ajouter environ 0,7 Go par service et par an (marge comprise).

**Nombre de fichiers** : environ 53 000 par service et par an, jamais supprimés (journal en ajout seul). Un établissement de 10 services en compte ainsi 2,6 millions au bout de 5 ans. C'est ce nombre qui pèse sur :

- la **sauvegarde** du serveur : une sauvegarde fichier par fichier est lente ;
- l'**antivirus**, qui examine chaque fichier ;
- l'**outil de copie robocopy** du dossier de secours ;
- la **lecture complète** que chaque poste fait toutes les 10 minutes (§ 6).

## 5. Quotas pour les agents : nécessité et proposition

**Les saisies ordinaires n'en ont pas besoin.** Une saisie pèse moins de 400 octets ; même très actif, un agent n'écrit que quelques Mo par an. Leur volume dépend de l'organisation du service, pas d'un agent. Un quota ne protégerait rien, et un blocage pourrait empêcher une saisie due : une mesure d'isolement, une décision du juge, le registre légal.

**Les documents et les pièces jointes, eux, peuvent remplir le partage** :

- un **classeur** proche de la taille maximale (1,8 Mo par version), modifié toute une journée avec un enregistrement automatique après 15 s sans frappe (3 s en édition à plusieurs), peut produire **plusieurs centaines de Mo par jour**, jamais supprimés ;
- une **image** de document peut atteindre 3 Mo, et un message jusqu'à 10 pièces de 5 Mo (jusqu'à 50 Mo chacune si l'établissement relève la taille) ;
- **aucune limite** ne porte aujourd'hui sur le total par agent ou par service.

**Proposition**, à décider par le porteur :

1. **Quota par agent**, réglable par l'administrateur : place des versions de documents, des images et des pièces jointes écrites par l'agent sur un mois glissant. Valeur proposée : 200 Mo par mois. Message à 80 % ; au-delà, l'enregistrement d'une **nouvelle** version ou pièce est refusé avec un message clair, sans rien perdre de ce qui est en cours d'écriture.
2. **Quota par service**, réglable, avec une alerte à l'administrateur et au cadre. Valeur proposée : 2 Go par an.
3. **Exceptions** réglables par agent (secrétariat, cadre qui tient les plannings) et rôle sans quota.
4. **Jamais de quota** sur Isolement et contention, les décisions du juge, les fiches patient, les congés et les heures : ce sont des saisies dues, et elles ne pèsent presque rien.
5. **Garde-fou anti-emballement** : au-delà d'un débit anormal (proposé : 2 000 saisies par heure pour un même agent), les saisies non dues sont suspendues et l'administrateur est alerté.
6. **Espacement des versions des gros documents** : au-delà de 200 Ko, un enregistrement automatique au plus toutes les 2 minutes (l'enregistrement manuel restant immédiat). Cela divise par 8 la place prise par un gros classeur, sans quota.
7. **Tableau de la place occupée**, pour l'administrateur (*Sauvegardes et exports*) : par module, par service, par agent pour les documents et les pièces jointes, avec l'évolution.

Le service informatique peut aussi poser un quota sur le partage lui-même (gestionnaire de ressources du serveur de fichiers Windows). Ce quota est utile comme filet de sécurité, mais il est **aveugle** : une fois atteint, il bloquerait toutes les saisies, registre légal compris. Il doit donc rester large, avec une alerte avant la limite.

## 6. Points à traiter avant un déploiement à plusieurs services

| N° | Point | Effet constaté | Piste |
| --- | --- | --- | --- |
| 1 | Première lecture d'un poste : chaque saisie était vérifiée l'une après l'autre (**traité en 0.85.0 : lecture et vérification par lots**) | 1 min 30 à 3 min de calcul à 3 à 10 services sur 2 à 3 ans, plus le temps de lecture du partage | Vérifier les signatures par lots en parallèle (gain mesuré : × 3 sur 2 cœurs, davantage sur 4 ou 8) ; garder sur le poste la liste des saisies déjà vérifiées ; faire ce travail en arrière-plan |
| 2 | Recalcul complet toutes les 10 minutes (**traité en 0.85.0 : index commun, une fois par heure**) | 8 à 22 s pendant lesquelles l'écran ne répond plus | Chaque module ne traiterait que ses propres saisies, avec un index commun des saisies au lieu d'un index par module (aujourd'hui 18 copies). Gain attendu : plusieurs fois plus rapide, mémoire divisée par 3 à 5 |
| 3 | Mémoire : chaque poste charge tous les services et toutes les années (**réduite en 0.85.0 ; chargement par année à décider au-delà de 10 services sur 4 à 5 ans**) | 1,4 Go à 3 services sur 3 ans, 2,9 Go à 10 services sur 2 ans ; un onglet de navigateur est limité vers 4 Go | Charger l'année en cours et la précédente, et lire les années plus anciennes à la demande (registre, statistiques, droit d'accès). Ou un dossier par pôle |
| 4 | Lecture complète du partage toutes les 10 minutes | Elle liste tous les fichiers : 2,6 millions à 10 services sur 5 ans. Sur un partage réseau, cela peut prendre plus de 10 minutes | À mesurer sur place (§ 7). Piste : lecture complète des 3 derniers mois toutes les 10 minutes, et de tout l'historique une fois par jour |
| 5 | Nombre de fichiers (blocs de 4 Ko) | Place occupée 4 fois le contenu ; sauvegarde et antivirus ralentis | Regrouper les mois clos dans une archive, ce qui touche au principe « fichiers jamais modifiés » : décision à prendre avec le service informatique et le responsable de la sécurité informatique |
| 6 | Volume des documents et pièces jointes | Seul poste qui peut croître sans limite | Quotas et espacement des versions (§ 5) |

**Depuis la version 0.85.0**, Tessera reste utilisable jusqu'à environ 10 services sur 2 à 3 ans. La connexion est encore longue à cette taille (environ 2 minutes de calcul, plus la lecture du partage), avec un gel de quelques secondes une fois par heure. **Au-delà**, il faudra charger les données par année (point 3).

## 7. À mesurer sur place, avec le service informatique

- Le temps de lecture du dossier sur le vrai partage. Le script peut écrire une année réelle d'un service (`--disque`), à copier sur le partage, puis il suffit d'ouvrir Tessera sur ce dossier.
- La durée de la sauvegarde et de l'analyse antivirus du dossier.
- Le temps de connexion sur un poste hospitalier courant.

```
node --expose-gc --max-old-space-size=6000 scripts/charge.cjs \
  <services> <années> [--clinique] [--pieces] \
  [--disque <dossier>] [--json <fichier>]
```
