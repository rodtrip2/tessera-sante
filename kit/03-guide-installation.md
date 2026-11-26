# Guide d'installation et de mise en service

*Pour le service informatique — DSI ou direction du numérique, selon l'établissement — (étapes 1 à 3) et l'administrateur fonctionnel, en général un cadre de santé (étapes 4 à 8).*

## 1. Récupérer et vérifier l'application (service informatique)

1. Télécharger la version voulue depuis https://github.com/rodtrip2/tessera-sante (bouton *Code → Download ZIP*, ou page des versions).
2. Seul le dossier `app/` est nécessaire au fonctionnement. Il contient tous les modules : leur ouverture se règle ensuite service par service, sans autre installation.
3. Vérifier les empreintes en PowerShell, depuis le dossier décompressé :

   ```powershell
   Get-ChildItem -Recurse .\app -File | Get-FileHash -Algorithm SHA256 | Format-Table Hash, Path
   ```

   Comparer avec `app/EMPREINTES-SHA256.txt`. Toute différence doit être expliquée avant la mise en service.

   Pour un hébergement sur le partage réseau, le script `outils/mettre-a-jour-outil.ps1` fait ce contrôle fichier par fichier et installe la version (§ 3 bis).

## 2. Créer le dossier de données (service informatique)

1. Créer un dossier vide sur un partage sauvegardé, par exemple `\\serveur\donnees\TesseraSante`.
2. Droits NTFS : **Modifier** pour le groupe des utilisateurs de l'outil (agents des unités concernées, secrétariat, cadres) ; retirer l'héritage des groupes plus larges. Un seul dossier sert à tous les modules : chaque module y a son propre journal (`modules\patients`, `modules\isocont`, `modules\agenda`), chiffré avec sa propre clé, remise aux seuls agents qui y ont droit.
3. Vérifier que le dossier est inclus dans les sauvegardes, avec ces exigences minimales :
   - sauvegarde **au moins quotidienne** du dossier, versions conservées **30 jours ou plus** ;
   - **une copie hors ligne ou non modifiable** (protection contre un rançongiciel) ;
   - droits du dossier limités aux comptes des agents habilités (pas de suppression possible par d'autres utilisateurs) ;
   - test de restauration annuel (voir les procédures de secours, document 04).
4. Rendre le dossier accessible depuis les postes : lecteur réseau mappé ou chemin UNC.
5. **Exports** (`exports\` sous le dossier) : les fichiers exportés (décomptes, registres, CSV) ne sont pas chiffrés ; réserver ce sous-dossier, par des droits NTFS, aux agents qui en ont besoin (par service si besoin). Purge après 31 jours par défaut, réglable.
6. **Horloge des postes** : synchronisation horaire du domaine active ; Tessera signale un écart de plus de 5 minutes avec le serveur du partage.

## 3. Publier l'application (service informatique)

**Intranet (recommandé)** — copier le contenu de `app/` dans un site web statique servi en HTTPS, par exemple `https://intranet.etablissement.fr/tessera/`. Ajouter les en-têtes conseillés dans la fiche technique (section 4, *Serveur web*). Diffuser le lien sur les postes (favori, raccourci).

**Raccourci et icône, dans une fenêtre séparée.** L'application fournit son icône (`app/img/icone.ico`, rosace de tesselles) et se déclare comme application : installée, elle s'ouvre **dans sa propre fenêtre**, sans onglets ni barre d'adresse. Quatre façons de la mettre à disposition :

- **depuis l'outil** (HTTPS) : bouton *Installer comme application* (en-tête, écran d'accueil ou de connexion), affiché quand Edge ou Chrome le permet ;
- **stratégie Edge déployée par le service informatique** (recommandé, HTTPS) : la stratégie `WebAppInstallForceList` installe l'outil sur les postes choisis, avec un raccourci sur le bureau. Valeur (JSON) : `[{"url": "https://intranet.etablissement.fr/tessera/", "default_launch_container": "window", "create_desktop_shortcut": true}]` (Chrome : même stratégie) ;
- **raccourci Windows** (toutes situations) : clic droit sur le bureau → *Nouveau → Raccourci*, cible `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=https://intranet.etablissement.fr/tessera/`, puis *Propriétés → Changer d'icône* et choisir `icone.ico` ;
- **stratégie de groupe** : raccourci déployé sur les postes concernés (préférence *Raccourcis*, champ *Fichier d'icône* pointant vers `\\serveur\partage\tessera\img\icone.ico`).

**Sans serveur web : sur le partage réseau** — l'application est copiée dans un dossier du partage, en lecture seule pour les agents, et ouverte avec Edge ou Chrome (`index.html`). Rien n'est installé sur les postes et rien ne vient d'Internet. Les clés de sécurité ne fonctionnent pas dans ce mode. Mise en place et protection du code : § 3 bis.

**Travail hors réseau** (facultatif, postes désignés) : voir le document 10.

**Démonstration** — https://rodtrip2.github.io/tessera-sante/, en *mode démonstration* uniquement, sans aucune donnée réelle. Ouverte depuis cette page, l'application vérifie qu'il s'agit de la dernière version publiée et propose de recharger la page sinon. Sur l'intranet ou un partage, la mise à jour reste faite par le service informatique, après contrôle des empreintes (script du § 3 bis).

Test sur un poste type : ouvrir le lien, cliquer *Ouvrir le dossier réseau du service*, choisir le dossier créé à l'étape 2. L'écran *Initialiser le dossier* doit s'afficher.

## 3 bis. Hébergement sur le partage réseau : protéger le code (service informatique)

Dans ce mode, le code de l'application est un simple dossier de fichiers. Il doit être **modifiable par un petit nombre de personnes seulement**, et son intégrité **contrôlée de l'extérieur** : une version modifiée de l'application pourrait supprimer sa propre vérification. Deux scripts du kit s'en chargent : `outils/mettre-a-jour-outil.ps1` (installation et mise à jour) et `outils/verifier-outil.ps1` (contrôle quotidien). Ils fonctionnent avec Windows PowerShell 5.1, présent sur tous les postes Windows récents, et avec PowerShell 7.

### Deux dossiers séparés

| Dossier (exemple) | Contenu | Droits NTFS |
| --- | --- | --- |
| `\\serveur\applis\TesseraSante\` (dossier parent) | `app\` (l'application), `app.ancien\` (version précédente), `reference-empreintes\`, journaux des scripts | Agents : **Lecture et exécution**. Groupe « Tessera – mise à jour » (service informatique, éventuellement un compte dédié de l'administrateur fonctionnel) : **Modifier**. Aucun autre droit ; héritage des groupes plus larges retiré |
| `\\serveur\donnees\TesseraSante\` (§ 2) | Données chiffrées | Agents : **Modifier**. **Aucun fichier de l'application** dans ce dossier |

Poser les droits sur le **dossier parent** : `app\` en hérite, et les droits sont conservés à chaque mise à jour (le script reprend aussi les droits du dossier remplacé). Les agents peuvent ainsi utiliser Tessera, mais ne peuvent ni modifier, ni remplacer, ni supprimer un fichier de l'application.

**Compte de mise à jour.** Le compte habituel d'un agent, même cadre, ne doit pas avoir le droit d'écrire dans ce dossier : une session laissée ouverte ou un poste infecté suffirait à modifier le code. Utiliser un compte dédié (ouverture de session ou *Exécuter en tant qu'autre utilisateur*), ou confier la mise à jour au service informatique.

### Première installation et mises à jour

**Le plus simple : en un double-clic.** Copier `outils/mettre-a-jour-outil.ps1` et `outils/mettre-a-jour-tessera.cmd` dans le dossier parent, **à côté** du dossier `app` (jamais dedans : ils seraient signalés comme fichiers en trop) :

```
\\serveur\applis\TesseraSante\
   mettre-a-jour-tessera.cmd
   mettre-a-jour-outil.ps1
   app\
```

Avec le compte de mise à jour (Maj + clic droit sur `mettre-a-jour-tessera.cmd` → *Exécuter en tant qu'autre utilisateur*), lancer `mettre-a-jour-tessera.cmd` : il vérifie d'abord la nouvelle version sans rien remplacer, affiche le résultat, demande *Installer cette version maintenant [O,N]*, puis installe et affiche le compte rendu. Sans dossier `app` à côté de lui, le script propose une première installation, après confirmation. Paramètres facultatifs (archive, canal bêta, proxy) : les ajouter à la fin de la cible d'un raccourci vers `mettre-a-jour-tessera.cmd`, par exemple `mettre-a-jour-tessera.cmd -Archive "C:\Telechargements\tessera.zip"`.

**En ligne de commande** (tâche planifiée, autre emplacement), depuis un poste, avec le compte de mise à jour, dans une fenêtre PowerShell :

```powershell
# Version stable, téléchargée depuis le site publié du projet (accès à Internet par le proxy nécessaire)
powershell -ExecutionPolicy Bypass -File .\mettre-a-jour-outil.ps1 -Destination '\\serveur\applis\TesseraSante\app'

# Ou depuis l'archive ZIP téléchargée à part (GitHub : « Code → Download ZIP » ou page des versions)
powershell -ExecutionPolicy Bypass -File .\mettre-a-jour-outil.ps1 -Destination '\\serveur\applis\TesseraSante\app' -Archive 'C:\Telechargements\tessera-sante-stable.zip'
```

Le script :

1. récupère la version (site publié : `-Canal stable`, par défaut, ou `-Canal beta` ; archive : `-Archive` ; dossier déjà décompressé : `-Source`) ;
2. contrôle **chaque fichier** par son empreinte SHA-256 et refuse tout fichier en trop ; avec `-EmpreinteAttendue`, il vérifie aussi l'empreinte du fichier `EMPREINTES-SHA256.txt` lui-même, communiquée par le porteur ou relevée sur le dépôt ;
3. refuse une version plus ancienne que celle en place (sauf `-Forcer`) ;
4. copie la version à côté de l'actuelle, la contrôle de nouveau, puis échange les deux dossiers : la coupure dure une fraction de seconde, et l'ancienne version est gardée dans `app.ancien` ;
5. range une copie des empreintes dans `reference-empreintes\`, utilisée par le contrôle quotidien, et écrit chaque opération dans `journal-mises-a-jour.log` (date, compte, versions, empreinte de la liste).

Au moindre écart, **rien n'est remplacé** et la version en place reste utilisée. Les agents rechargent la page (F5) ou rouvrent Tessera ; les données ne sont pas touchées.

- **Essai sans rien remplacer** : `-Simulation`.
- **Retour à la version précédente** : `-Revenir` (échange `app` et `app.ancien`, après contrôle de ses empreintes).
- **Copie abîmée ou modifiée** : relancer le script sur la même version ; il constate les écarts et réinstalle.
- **Script bloqué par Windows** (fichier téléchargé) : `Unblock-File .\mettre-a-jour-outil.ps1`, ou `-ExecutionPolicy Bypass` comme ci-dessus.
- Codes de sortie : 0 = fait ou déjà à jour ; 1 = source inaccessible ; 2 = contrôle refusé ou erreur ; 3 = version plus ancienne refusée.

### Contrôle quotidien

Tâche planifiée du service informatique, une fois par jour, avec un compte en **lecture seule** (sans `-Dossier`, le script contrôle le dossier `app` situé à côté de lui) :

```powershell
powershell -ExecutionPolicy Bypass -File C:\Scripts\verifier-outil.ps1 -Dossier '\\serveur\applis\TesseraSante\app' -JournalWindows
```

Le script compare le dossier à la copie de référence et signale tout fichier absent, modifié ou en trop, ainsi qu'un fichier d'empreintes remplacé. Résultat dans `journal-controles.log` et, avec `-JournalWindows`, dans le journal *Application* de Windows (source `TesseraSante` : 1000 = conforme, 1001 = écart, 1002 = dossier inaccessible), pour la supervision. Codes de sortie : 0 = conforme, 1 = inaccessible, 2 = écart. Le script lui-même est rangé hors du partage (par exemple `C:\Scripts\` sur le serveur), là où les agents n'écrivent pas.

**En cas d'écart** : prévenir l'administrateur fonctionnel, ne plus utiliser la copie avant vérification, consulter l'audit Windows (ci-dessous) pour savoir qui a écrit, puis réinstaller la version avec `mettre-a-jour-outil.ps1`.

### Traçabilité des écritures

Activer l'**audit Windows des écritures** (stratégie *Auditer l'accès aux objets* et entrée d'audit *Écriture / Suppression* sur le dossier parent) : toute modification du code indique le compte et l'heure.

### Ce qui reste

Un administrateur du serveur peut toujours modifier le dossier : c'est la limite commune à tout logiciel de l'établissement. Les **données** ont leur propre protection, indépendante de ce dossier : fichiers chiffrés, saisies signées, une saisie fabriquée ou modifiée sur le partage est détectée et écartée.

## 3 ter. Synchronisation avec l'agenda de la messagerie (facultatif, service informatique)

Fonction soumise à avis (« Synchronisation de Mes tâches et de Mon agenda avec l'agenda de la messagerie », onglet *Validations*), **livrée désactivée**. Elle permet à chaque agent qui le choisit de retrouver ses tâches et son agenda Tessera dans l'agenda de la messagerie de l'établissement (Zimbra ou tout serveur CalDAV), puis sur son téléphone avec l'application DAVx5, qu'il utilise peut-être déjà pour sa messagerie :

- **Mes tâches** (personnelles et partagées) : liste « Tessera — tâches », dans les deux sens (une tâche cochée, modifiée, ajoutée ou supprimée sur le téléphone revient dans Tessera) ;
- **Mon agenda** : agenda « Tessera — agenda », dans les deux sens : rendez-vous personnels et partagés (créés, modifiés ou supprimés d'un côté ou de l'autre), éléments du service où l'agent est prévu, **sans identité de patient** (type, lieu, horaire), dont seul l'horaire revient du téléphone, si l'agent peut le modifier dans Tessera ;
- l'agenda de la messagerie peut être affiché dans *Mon agenda* (lecture seule, jamais copié sur le partage).

Le navigateur de l'agent échange **directement** avec le serveur de messagerie, dans le réseau de l'hôpital, pendant que Tessera est ouvert (à l'ouverture, puis à la fréquence choisie par l'agent : de toutes les minutes à toutes les heures, 3 minutes par défaut, ou à la demande seulement) : aucun service extérieur, aucun serveur à installer. Trois réglages sont nécessaires.

**1. Autoriser le serveur dans Tessera.** Par défaut, Tessera ne peut joindre aucune adresse (règle `connect-src 'none'`). Le script de mise à jour ajoute l'adresse du serveur, et elle seule, à cette règle :

```powershell
powershell -ExecutionPolicy Bypass -File .\mettre-a-jour-outil.ps1 -Zimbra 'https://zimbra.etablissement.fr'
```

ou `mettre-a-jour-tessera.cmd -Zimbra https://zimbra.etablissement.fr`. L'adresse est notée dans `reference-empreintes\ADAPTATION-LOCALE.txt` et **reprise automatiquement** aux mises à jour suivantes (double-clic compris) ; `-SansZimbra` la retire. Le contrôle quotidien (`verifier-outil.ps1`) vérifie `index.html` une fois cette adresse retirée, et signale toute adresse différente de celle notée. Rien n'est ajouté au dépôt public : l'adresse reste propre à l'établissement. Pour une copie servie par l'intranet, appliquer le même script au dossier publié (`-Destination`) ou ajouter l'adresse à l'en-tête `Content-Security-Policy` du serveur web.

**2. Laisser le serveur de messagerie répondre à Tessera.** Le navigateur n'accepte la réponse du serveur de messagerie que si celui-ci autorise l'adresse de Tessera (échanges entre origines, « CORS ») : en-têtes `Access-Control-Allow-Origin` (adresse de Tessera, par exemple `https://intranet.etablissement.fr` ; pour une copie ouverte depuis le partage, l'origine envoyée par le navigateur est `null`), `Access-Control-Allow-Methods: GET, PUT, DELETE, PROPFIND, REPORT, MKCALENDAR, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type, Depth, If-Match, If-None-Match`, `Access-Control-Expose-Headers: ETag`, et réponse aux requêtes préalables `OPTIONS` sans authentification, sur les seules adresses `/dav/`. Selon la version de Zimbra, ces en-têtes se règlent dans Zimbra lui-même ou sur le serveur mandataire placé devant lui. Autoriser `null` ouvre le serveur à toute page ouverte depuis un fichier : préférer une copie de Tessera servie par l'intranet pour cette fonction.

**3. Activer la fonction** dans l'onglet *Validations* (administrateur), après avis du délégué à la protection des données (DPO, référent RGPD), du responsable de la sécurité informatique (RSSI) et du service informatique (DSI ou direction du numérique, selon l'établissement), ou sur accord hiérarchique pendant le pilote.

Chaque agent règle ensuite la synchronisation pour lui-même : *Agenda → Mes tâches → Synchroniser avec la messagerie…* (identifiant et mot de passe de sa messagerie ; l'adresse de son agenda est proposée : `https://zimbra.etablissement.fr/dav/<identifiant>/`). Le mot de passe est gardé en mémoire pendant la session ; l'agent peut le faire **mémoriser, chiffré par sa clé de liste** (lisible de lui seul, jamais écrit au journal) ; il est **redemandé** dès que le serveur le refuse, par exemple après son changement. Sur le téléphone, l'agent ajoute à DAVx5 le compte de sa messagerie (adresse `https://zimbra.etablissement.fr/dav/`) et coche les listes « Tessera — tâches » et « Tessera — agenda » ; les tâches s'affichent dans une application de tâches compatible (jtx Board, Tasks.org, OpenTasks).

**Test** : *Tester la connexion* dans la fenêtre de réglage. « Serveur d'agenda injoignable » indique en général l'étape 1 (adresse non autorisée sur cette copie) ou l'étape 2 (en-têtes absents : la console du navigateur, touche F12, mentionne alors « CORS »).

## 3 quater. Fixer le dossier des données (facultatif, service informatique)

Pour une copie de Tessera installée sur le partage par le script de mise à jour (§ 3 bis), le service informatique peut **fixer le dossier des données** : cette copie n'ouvre plus que les données de l'établissement, sur tous les postes, dès la première ouverture.

```powershell
mettre-a-jour-tessera.cmd -Donnees '\\serveur\partage\Tessera\donnees'
```

Le script lit le coffre du dossier indiqué (`coffre.json`, qui doit déjà exister : initialiser le dossier d'abord, § 4) et inscrit dans la page de Tessera la date de création de ce coffre et le chemin. Ensuite :

- l'écran d'accueil affiche le chemin et propose seulement **« Ouvrir le dossier des données… »** et **« Ouvrir une autre copie de ces données… »** (dossier de secours, nouvel emplacement après un déplacement) ;
- un dossier contenant d'autres données, ou un dossier vide, est **refusé** ; plus de **mode démonstration** sur cette copie (le **mode formation**, proposé à la connexion, reste disponible) ; plus de **déblocage par un administrateur** dans Tessera ; le réglage « Choix du dossier sur les postes » de l'administration devient sans objet ;
- la **copie locale des données** (travail hors réseau) contient les mêmes données : elle reste ouverte ;
- le réglage est **repris à chaque mise à jour** (double-clic compris), noté dans `reference-empreintes\ADAPTATION-LOCALE.txt` et **contrôlé chaque jour** par `verifier-outil.ps1` ; `-SansDonnees` le retire ; une nouvelle initialisation des données (nouveau coffre) demande de relancer le script avec `-Donnees`.

**Limites** : le navigateur n'ouvre jamais un dossier à partir de son chemin (règle de sécurité de Chrome et d'Edge) : chaque agent désigne le dossier **une fois par poste**, Tessera s'en souvient ensuite (« Reprendre »). Le réglage ne vaut que pour cette copie de Tessera : une autre copie (par exemple la page publique) peut ouvrir d'autres dossiers ; la barrière reste les **droits Windows** sur les dossiers du partage. Même mécanisme que l'adresse de la messagerie (§ 3 ter) : `-Zimbra` et `-Donnees` se combinent.

**Travail hors réseau** (document 10) : la copie de l'outil sur le poste (`copie-locale-outil.ps1`) et sa mise en cache par le navigateur acceptent la page ainsi adaptée et la reprennent telle quelle (même dossier des données, même adresse de messagerie). `copie-locale-outil.ps1` n'accepte l'adaptation que si elle est celle notée par le script de mise à jour (`reference-empreintes`, à côté du dossier `app` de la source, lisible par le compte qui lance la copie ; autre emplacement : paramètre `-Reference`).

## 4. Initialiser le dossier (administrateur)

1. Sur l'écran *Initialiser le dossier* : nom affiché, identifiant (par exemple `prenom.nom`), mot de passe d'au moins 12 caractères. Ce premier compte est **cadre de santé et administrateur**.
2. Le **code de secours** s'affiche une seule fois : l'imprimer, le placer sous enveloppe scellée, datée et signée, et le remettre au coffre désigné (direction des soins, par exemple). Cocher la case de confirmation.
3. *Administration → Sauvegardes et exports* : télécharger la **copie du coffre sous scellé** et la ranger avec le code de secours.

Le coffre est **attesté** : l'administrateur le signe à chaque changement des comptes ou des droits, et chaque agent vérifie la signature à l'ouverture de sa session. Une modification du coffre faite hors de l'outil, ou une restauration d'une ancienne version, est signalée dans *Administration → Comptes et sécurité → Intégrité du coffre* (conduite à tenir : document 04).

## 5. Sécuriser l'accès d'administration

*Administration → Comptes et sécurité → Moyens de déblocage* (site servi en HTTPS uniquement) :

1. *Enregistrer une clé de sécurité* : brancher la première clé (YubiKey ou équivalent compatible), la nommer, la toucher quand le navigateur le demande.
2. Recommencer avec une seconde clé, à conserver avec le code de secours.
3. Tester : *Verrouiller*, puis *Déverrouiller avec une clé de sécurité*.
4. *Réglages généraux → Comptes → Règles de connexion* : règle des mots de passe (renforcée, d'après la recommandation de la CNIL, par défaut) ; si l'établissement le décide, rôles pour lesquels la **clé de sécurité est exigée en plus du mot de passe** (second facteur, désactivé par défaut ; une clé par agent concerné ; essai sur un poste type obligatoire) et code de la clé exigé.
5. Dossier créé avant la version 0.72.0 : *Signature des saisies → Exiger la signature des saisies* dès que tous les comptes actifs ont une clé de signature (chaque agent s'est connecté une fois).

## 6. Paramétrer (administrateur)

Onglet *Administration* : l'onglet général porte les éléments communs ; chaque module a son propre sous-onglet (*Agenda*, et pour Isocont les sous-onglets *Règles et pauses*, *Alertes*, *Cas particuliers*, *Registre et statistiques*, *Décompte du juge*, *Reprise des données*).

| Section | À renseigner |
| --- | --- |
| Établissement et services | Nom de l'établissement (en-tête des documents), services (code ; libellé). **Modules activés par service** : par défaut chaque module est ouvert dans tous les services ; décocher ceux qui ne servent pas (par exemple l'isolement et la contention dans un service qui n'y a pas recours). Désactiver un module dans un service conserve ses données en consultation. |
| Fiche patient | Pour chaque service : service de psychiatrie ou non (champs propres à la psychiatrie, comme le mode d'hospitalisation), libellés des médecins et des référents soignants. |
| Rôles et accès | Rôles fournis (IDE, AS, secrétaire, cadre de santé ; administrateur fixe) et rôles propres à l'établissement. Les accès sont **groupés par module** : un rôle sans aucun accès dans un module n'y entre pas et n'en reçoit pas la clé. Droits proposés par défaut : voir le guide utilisateur (06). |
| Comptes | Un compte par agent, avec ses rôles et ses **services affectés**. Pour toute une équipe : *Créer des comptes en lot…* (ci-dessous). Chaque compte reçoit un mot de passe provisoire tiré au hasard ; l'agent le remplace à sa première connexion. Comptes temporaires (intérimaires, stagiaires) : date de fin de validité. |
| Agenda | Désignation des patients dans l'agenda (initiales par défaut, IPP, nom complet, ou « patient ») ; modification des éléments d'un autre service (non par défaut) ; ce que les autres rôles peuvent ajuster sur les tâches du service ; modèles de check-lists et délai d'alerte de chaque point ; types d'alertes (liste de l'établissement, listes propres à certains services). |
| Isolement et contention | Lieux d'isolement par service et leur appellation, liste des psychiatres, organisation des envois au juge (magistrat du siège du tribunal judiciaire, anciennement juge des libertés et de la détention, JLD), postes de surveillance, pauses (levées temporaires), masques du décompte du juge, alertes de l'établissement, cas particuliers. Règles légales : valeurs conformes aux textes, à ne modifier qu'en cas d'évolution réglementaire. Détail des réglages : `docs/consignes-isocont.md`. |

### Reprendre un paramétrage préparé ailleurs

*Administration → Sauvegardes et exports → Réglages : export et import.* Le paramétrage peut être préparé dans un dossier d'essai (données fictives), puis exporté (fichier `.json`) et importé dans le dossier des données réelles. À l'import, l'outil montre les rubriques qui changent ; l'administrateur coche celles à reprendre (les règles légales sont décochées par prudence). L'import tient en une ligne du journal, annulable en une fois. Le fichier ne contient ni donnée de patient, ni compte, ni mot de passe.

### Créer les comptes d'une équipe en une fois

1. Préparer la liste dans un tableur, une ligne par agent, colonnes : **Nom affiché**, **Identifiant** (facultatif), **Rôles** (facultatif), **Services** (facultatif). Exemple (fictif) :

   | Nom | Identifiant | Rôles | Services |
   | --- | --- | --- | --- |
   | Marie DUPONT (fictif) | | IDE | U1 |
   | Paul MARTIN (fictif) | | AS | U1, U2 |
   | Jeanne PETIT (fictif) | | Secrétaire | tous |

2. *Administration → Comptes et sécurité → Créer des comptes en lot…* : coller les cellules copiées, ou choisir le fichier CSV. Choisir le rôle et les services par défaut.
3. Vérifier l'aperçu (identifiants proposés, lignes en erreur), puis *Créer les comptes*.
4. **Imprimer les fiches de remise** (identifiant et mot de passe provisoire) et les remettre en main propre. Ces mots de passe ne seront plus affichés.

### Préparer la formation

Le mode formation ne demande aucune installation : un jeu de données entièrement fictif est créé dans le sous-dossier `formation` du dossier de données, à la première connexion en mode formation. Tous les comptes y ont accès par défaut ; décocher *Accès au mode formation* dans la fiche d'un compte pour le retirer.

## 7. Reprendre les données existantes

Tessera démarre **sans aucune donnée**. Deux reprises sont possibles, dans cet ordre :

1. **Historique de l'isolement et de la contention**, à partir du **registre du service** : *Administration → Reprise des données → Importer un registre…* (document 07). L'import crée aussi les fiches patient correspondantes. Cas particulier : les établissements qui utilisaient le classeur Excel « Suivi_Isolement_Contention » disposent d'un import spécifique (*Importer un classeur V1.3…*), qui reprend en plus les cycles juge, l'information des tiers et la surveillance.
2. **Liste des patients présents**, exportée du dossier patient informatisé (DPI) : onglet *Patients → Importer la liste…* (document 11). Elle complète les fiches (séjour, unité, chambre) et crée celles des patients présents sans mesure.

Chaque import est un lot unique, annulable depuis le journal, et ne crée pas de doublon s'il est relancé. Le fichier importé est lu dans le navigateur, jamais copié sur le partage.

## 8. Recette avant production

- [ ] Deux postes connectés en même temps : une saisie sur l'un apparaît sur l'autre en moins de 10 secondes.
- [ ] Un compte IDE ne voit que ses services, et seulement les modules activés dans ces services et ouverts à son rôle.
- [ ] Un rôle sans accès à un module ne voit pas ce module (barre des modules en bas de l'écran).
- [ ] Fiche patient : création, correction, séjour ; import d'une liste de test (patients fictifs), puis annulation du lot.
- [ ] Isolement et contention : création d'une mesure de test, information du tiers, envoi au juge, décompte imprimé, fin de mesure ; échéances du juge vérifiées sur un cas connu (isolement débuté le 1er à 8 h 45 sans cumul antérieur : information avant le 3 à 8 h 45, saisine avant le 4, décision avant le 5).
- [ ] Agenda : élément répété, check-list, tâche du service cochée par un IDE, absence ; l'échéance du juge de la mesure de test apparaît dans l'onglet *Alertes* pour un rôle qui a l'accès aux envois au juge, et pas pour un rôle qui ne l'a pas.
- [ ] Retrait d'un accès à un rôle : l'agent concerné ne lit plus les saisies nouvelles du module à sa connexion suivante.
- [ ] Première connexion d'un agent : le mot de passe provisoire doit être remplacé.
- [ ] Mot de passe oublié : réinitialisation par l'administrateur.
- [ ] Déverrouillage par le code de secours, puis génération d'un nouveau code.
- [ ] *Intégrité du coffre* : « Coffre attesté » affiché.
- [ ] Annulation des saisies de test depuis le journal.
- [ ] Procédure dégradée papier imprimée et rangée dans chaque unité.

## 9. Mise en production

1. Former les agents (30 minutes par module, guide utilisateur et guide pratique).
2. Démarrer par une unité pilote ; pour l'isolement et la contention, en parallèle de l'outil antérieur pendant quelques semaines, en comparant les échéances.
3. Faire le point avec le service informatique, le délégué à la protection des données (DPO, référent RGPD) et l'encadrement avant d'étendre à d'autres services ou d'ouvrir un autre module.
