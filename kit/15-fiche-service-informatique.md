# Fiche pour le service informatique — Tessera Santé

*Destinataire : service informatique (DSI ou direction du numérique, selon l'établissement). Objet : ce que Tessera Santé demande à l'infrastructure, ce qu'il change par rapport aux fichiers Word et Excel des partages, et ce qu'il faut préparer. Détail : fiche technique (`docs/fiche-technique.md`) et guide d'installation (document 03). Version du 26 novembre 2026 (Tessera 0.95.1).*

| En bref | |
| --- | --- |
| **À installer** | Rien sur les postes ; un dossier de fichiers statiques sur un serveur web de l'intranet, en HTTPS (pendant le pilote : la version publiée sur GitHub Pages), ou, sans serveur web, dans un dossier du partage en lecture seule pour les agents. |
| **À créer** | Un dossier de données sur un partage sauvegardé, droits NTFS « Modifier » pour le groupe des utilisateurs. |
| **Postes** | Edge ou Chrome récents ; clés FIDO2 (YubiKey série 5) si le second facteur est retenu. |
| **Charge estimée** | Environ une demi-journée pour l'installation et la recette ; mises à jour par simple remplacement du dossier `app`. |
| **Ce qui vous est demandé** | Avis sur l'installation, la sauvegarde et l'exploitation ; points du § 6. |

## 1. Ce que vous cherchez, ce que vous gardez sous votre contrôle

Un outil de plus ne doit pas devenir une charge d'exploitation ni une brèche. Tessera a été conçu pour s'appuyer sur ce que vous administrez déjà :

- **pas de serveur applicatif, pas de base de données, pas de compte de service** : rien à superviser en dehors du serveur web et du partage ;
- **pas de connexion sortante**, pas de flux à ouvrir dans le pare-feu ;
- **le partage reste le vôtre** : droits NTFS, sauvegardes, restauration, supervision de l'espace ;
- **les versions sont vérifiables** : empreintes SHA-256 de chaque fichier publiées ; vous déployez la version que vous avez vérifiée ;
- **pas d'appel au support à chaque évolution** pendant le pilote : le porteur publie, les postes proposent de recharger la page.

## 2. Ce qui change par rapport aux fichiers Word et Excel sur le partage

| Sujet d'exploitation | Fichiers Word et Excel | Tessera Santé |
| --- | --- | --- |
| **Fichier verrouillé ou corrompu** | « Fichier en cours d'utilisation », copies « de conflit », classeur abîmé, appel au support | Une saisie = un petit fichier, jamais réécrit ; plusieurs postes saisissent en même temps ; conflits détectés et arbitrés par le cadre, sans perte |
| **Restauration** | Fichier entier restauré à la veille : saisies du jour perdues pour tout le monde | Restauration fichier par fichier ; liste exacte des fichiers manquants ou illisibles fournie par l'outil ; réparation depuis une copie complète |
| **Droits** | Demandes de droits dossier par dossier, rarement revues | Un seul dossier par périmètre ; les droits fins (module, service, rôle) sont gérés dans l'outil par l'administrateur fonctionnel et appliqués par le chiffrement |
| **Sauvegardes** | Données de santé en clair dans les sauvegardes | Sauvegardes chiffrées de fait |
| **Macros et compatibilité** | Classeurs à macros à maintenir d'une version d'Office à l'autre, alertes de sécurité | Aucune macro ; navigateur standard |
| **Postes sans réseau** | Fichier inaccessible | Travail hors réseau possible sur des postes désignés (outil en cache, copie locale chiffrée) ; procédure dégradée papier |
| **Volume** | Classeurs lourds, copies multiples | Petits fichiers chiffrés, regroupés par mois en instantanés ; rangement par jour |

## 3. La traçabilité informatisée des tâches

Pour les services de soins, Tessera rend visibles les tâches à faire et garde la trace de celles qui ont été faites (échéances légales, check-lists, alertes, contrôles), au profit de la continuité et de la qualité des soins. Pour vous, la même traçabilité facilite le diagnostic : le contrôle d'intégrité signale les fichiers disparus, illisibles ou les trous du chaînage, journal par journal, et l'outil produit un message type à adresser au service informatique en cas d'anomalie (document 04).

## 4. Ce qu'il faut préparer

1. **Serveur web** (production) : service de fichiers statiques en HTTPS, certificat reconnu par les postes, en-têtes de la fiche technique (§ 4), `Cache-Control: no-cache` sur `index.html` et les scripts.
2. **Dossier de données** : `\\serveur\donnees\TesseraSante` (exemple), un par périmètre de confidentialité ; droits NTFS « Modifier » au groupe des utilisateurs, aucun aux autres (création, écriture et suppression du fichier temporaire permises).
3. **Exports** : le sous-dossier `exports\` reçoit des fichiers **en clair** (décomptes, registres, CSV) ; droits NTFS réservés aux agents concernés, par service si besoin ; purge après 31 jours par défaut.
4. **Sauvegardes** : au moins quotidiennes, versions conservées 30 jours ou plus, une copie hors ligne ou non modifiable ; `coffre.json` indispensable ; test de restauration annuel.
5. **Horloge des postes** : synchronisation horaire active ; Tessera signale un écart de plus de 5 minutes avec le serveur du partage (les échéances légales en dépendent).
6. **Clés de sécurité** (si retenues) : modèle compatible PRF, ports USB autorisés, **test obligatoire sur un poste type**.
7. **Facultatif** : dossier de secours copié par robocopy (document 09) ; postes désignés pour le travail hors réseau, disque chiffré (document 10).
8. **Phase pilote** : `https://rodtrip2.github.io` autorisé par le proxy pour les postes concernés.
9. **Sans serveur web, application sur le partage** (guide d'installation, § 3 bis à 3 quater) : installation et mises à jour par le seul fichier `mettre-a-jour-tessera.cmd` (il télécharge le script, contrôle chaque fichier, met aussi à jour les outils) ; dossier de l'application séparé du dossier des données, **Lecture et exécution** pour les agents, **Modifier** pour un petit groupe de mise à jour (compte dédié, jamais le compte habituel d'un agent) ; contrôle quotidien des empreintes par une tâche planifiée (`verifier-outil.ps1`, journal *Application* de Windows) ; audit Windows des écritures sur ce dossier. Facultatif : **dossier des données fixé** (`-Donnees`) pour que cette copie n'ouvre que les données de l'établissement.
10. **Synchronisation avec l'agenda de la messagerie** (facultatif, fonction soumise à avis, guide d'installation § 3 ter) : adresse du serveur CalDAV ajoutée à cette copie par `-Zimbra` ; serveur de messagerie réglé pour accepter les échanges avec Tessera (en-têtes CORS sur `/dav/`, réponses aux requêtes `OPTIONS`) ; copie servie par l'intranet conseillée (origine `null` d'une copie ouverte depuis le partage).

## 5. Mises à jour

- Pendant le pilote : versions publiées par le porteur sur GitHub Pages ; une version stable ou bêta n'est publiée que si les tests passent, si son commit porte une signature vérifiée et après son approbation.
- En production : télécharger la version, vérifier les empreintes (`Get-FileHash -Algorithm SHA256`), remplacer le dossier `app`. Les données ne sont pas touchées ; le format est versionné et lu par les versions suivantes.
- Application sur le partage : `outils/mettre-a-jour-tessera.cmd` déposé **seul** dans le dossier (il télécharge et contrôle le script, vérifie la version, fait confirmer, installe ou met à jour l'application et les outils), ou script `outils/mettre-a-jour-outil.ps1` en ligne de commande (téléchargement ou archive, contrôle de chaque fichier, refus d'une version plus ancienne, échange instantané des dossiers, ancienne version gardée, retour arrière `-Revenir`, journal des mises à jour). Au moindre écart, rien n'est remplacé. Adaptations propres à l'établissement (`-Zimbra`, `-Donnees`) reprises à chaque mise à jour et contrôlées chaque jour.

## 6. Points à valider

- [ ] Hébergement : GitHub Pages pendant le pilote, puis serveur web de l'intranet ; adresse retenue.
- [ ] Emplacement du dossier de données, groupe d'utilisateurs, droits NTFS du sous-dossier des exports.
- [ ] Politique de sauvegarde et test de restauration.
- [ ] Synchronisation horaire des postes.
- [ ] Clés de sécurité : modèle, achat, ports USB, essai sur un poste type.
- [ ] Dossier de secours et postes hors réseau (facultatifs).
- [ ] Application sur le partage (si retenue) : dossier et groupe de mise à jour, compte dédié, tâche planifiée du contrôle quotidien, audit des écritures ; dossier des données fixé ou non.
- [ ] Synchronisation avec l'agenda de la messagerie (si retenue) : adresse du serveur, réglage CORS, prise en charge des agendas et des tâches (CalDAV, VTODO) par la version de la messagerie, fréquence acceptable par le serveur.
- [ ] Qualification de l'hébergement (pas de prestataire, donc a priori pas de certification d'hébergeur de données de santé, HDS), avec le délégué à la protection des données.
- [ ] Recette technique (fiche technique, § 14).

## 7. Documents de référence

Fiche technique ; guide d'installation (03) ; procédures de secours (04) ; dossier de secours robocopy (09) ; travail hors réseau (10) ; import de la liste des patients (11).
