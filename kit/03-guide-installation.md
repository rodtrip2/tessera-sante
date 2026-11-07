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

## 2. Créer le dossier de données (service informatique)

1. Créer un dossier vide sur un partage sauvegardé, par exemple `\\serveur\donnees\TesseraSante`.
2. Droits NTFS : **Modifier** pour le groupe des utilisateurs de l'outil (agents des unités concernées, secrétariat, cadres) ; retirer l'héritage des groupes plus larges. Un seul dossier sert à tous les modules : chaque module y a son propre journal (`modules\patients`, `modules\isocont`, `modules\agenda`), chiffré avec sa propre clé, remise aux seuls agents qui y ont droit.
3. Vérifier que le dossier est inclus dans les sauvegardes, avec ces exigences minimales :
   - sauvegarde **au moins quotidienne** du dossier, versions conservées **30 jours ou plus** ;
   - **une copie hors ligne ou non modifiable** (protection contre un rançongiciel) ;
   - droits du dossier limités aux comptes des agents habilités (pas de suppression possible par d'autres utilisateurs) ;
   - test de restauration annuel (voir les procédures de secours, document 04).
4. Rendre le dossier accessible depuis les postes : lecteur réseau mappé ou chemin UNC.

## 3. Publier l'application (service informatique)

**Intranet (recommandé)** — copier le contenu de `app/` dans un site web statique servi en HTTPS, par exemple `https://intranet.etablissement.fr/tessera/`. Ajouter les en-têtes conseillés dans la fiche technique (section 4, *Serveur web*). Diffuser le lien sur les postes (favori, raccourci).

**Raccourci et icône, dans une fenêtre séparée.** L'application fournit son icône (`app/img/icone.ico`, rosace de tesselles) et se déclare comme application : installée, elle s'ouvre **dans sa propre fenêtre**, sans onglets ni barre d'adresse. Quatre façons de la mettre à disposition :

- **depuis l'outil** (HTTPS) : bouton *Installer comme application* (en-tête, écran d'accueil ou de connexion), affiché quand Edge ou Chrome le permet ;
- **stratégie Edge déployée par le service informatique** (recommandé, HTTPS) : la stratégie `WebAppInstallForceList` installe l'outil sur les postes choisis, avec un raccourci sur le bureau. Valeur (JSON) : `[{"url": "https://intranet.etablissement.fr/tessera/", "default_launch_container": "window", "create_desktop_shortcut": true}]` (Chrome : même stratégie) ;
- **raccourci Windows** (toutes situations) : clic droit sur le bureau → *Nouveau → Raccourci*, cible `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=https://intranet.etablissement.fr/tessera/`, puis *Propriétés → Changer d'icône* et choisir `icone.ico` ;
- **stratégie de groupe** : raccourci déployé sur les postes concernés (préférence *Raccourcis*, champ *Fichier d'icône* pointant vers `\\serveur\partage\tessera\img\icone.ico`).

**Repli sans serveur web** — copier `app/` dans un dossier en lecture seule du partage et ouvrir `index.html` avec Edge ou Chrome. Les clés de sécurité ne fonctionnent pas dans ce mode.

**Travail hors réseau** (facultatif, postes désignés) : voir le document 10.

**Démonstration** — https://rodtrip2.github.io/tessera-sante/, en *mode démonstration* uniquement, sans aucune donnée réelle. Ouverte depuis cette page, l'application vérifie qu'il s'agit de la dernière version publiée et propose de recharger la page sinon. Sur l'intranet ou un partage, la mise à jour reste faite par le service informatique, après contrôle des empreintes.

Test sur un poste type : ouvrir le lien, cliquer *Ouvrir le dossier réseau du service*, choisir le dossier créé à l'étape 2. L'écran *Initialiser le dossier* doit s'afficher.

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

## 6. Paramétrer (administrateur)

Onglet *Administration* : l'onglet général porte les éléments communs ; chaque module a son propre sous-onglet (*Agenda*, et pour Isocont les sous-onglets *Règles et pauses*, *Alertes*, *Cas particuliers*, *Registre et statistiques*, *Décompte JLD*, *Reprise des données*).

| Section | À renseigner |
| --- | --- |
| Établissement et services | Nom de l'établissement (en-tête des documents), services (code ; libellé). **Modules activés par service** : par défaut chaque module est ouvert dans tous les services ; décocher ceux qui ne servent pas (par exemple l'isolement et la contention dans un service qui n'y a pas recours). Désactiver un module dans un service conserve ses données en consultation. |
| Fiche patient | Pour chaque service : service de psychiatrie ou non (champs propres à la psychiatrie, comme le mode d'hospitalisation), libellés des médecins et des référents soignants. |
| Rôles et accès | Rôles fournis (IDE, AS, secrétaire, cadre de santé ; administrateur fixe) et rôles propres à l'établissement. Les accès sont **groupés par module** : un rôle sans aucun accès dans un module n'y entre pas et n'en reçoit pas la clé. Droits proposés par défaut : voir le guide utilisateur (06). |
| Comptes | Un compte par agent, avec ses rôles et ses **services affectés**. Pour toute une équipe : *Créer des comptes en lot…* (ci-dessous). Chaque compte reçoit un mot de passe provisoire tiré au hasard ; l'agent le remplace à sa première connexion. Comptes temporaires (intérimaires, stagiaires) : date de fin de validité. |
| Agenda | Désignation des patients dans l'agenda (initiales par défaut, IPP, nom complet, ou « patient ») ; modification des éléments d'un autre service (non par défaut) ; ce que les autres rôles peuvent ajuster sur les tâches du service ; modèles de check-lists et délai d'alerte de chaque point ; types d'alertes (liste de l'établissement, listes propres à certains services). |
| Isolement et contention | Lieux d'isolement par service et leur appellation, liste des psychiatres, organisation des envois au juge des libertés et de la détention (JLD), postes de surveillance, pauses (levées temporaires), masques du décompte JLD, alertes de l'établissement, cas particuliers. Règles légales : valeurs conformes aux textes, à ne modifier qu'en cas d'évolution réglementaire. Détail des réglages : `docs/consignes-isocont.md`. |

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

1. **Historique de l'isolement et de la contention**, à partir du **registre du service** : *Administration → Reprise des données → Importer un registre…* (document 07). L'import crée aussi les fiches patient correspondantes. Cas particulier : les établissements qui utilisaient le classeur Excel « Suivi_Isolement_Contention » disposent d'un import spécifique (*Importer un classeur V1.3…*), qui reprend en plus les cycles JLD, l'information des tiers et la surveillance.
2. **Liste des patients présents**, exportée du dossier patient informatisé (DPI) : onglet *Patients → Importer la liste…* (document 11). Elle complète les fiches (séjour, unité, chambre) et crée celles des patients présents sans mesure.

Chaque import est un lot unique, annulable depuis le journal, et ne crée pas de doublon s'il est relancé. Le fichier importé est lu dans le navigateur, jamais copié sur le partage.

## 8. Recette avant production

- [ ] Deux postes connectés en même temps : une saisie sur l'un apparaît sur l'autre en moins de 10 secondes.
- [ ] Un compte IDE ne voit que ses services, et seulement les modules activés dans ces services et ouverts à son rôle.
- [ ] Un rôle sans accès à un module ne voit pas ce module (barre des modules en bas de l'écran).
- [ ] Fiche patient : création, correction, séjour ; import d'une liste de test (patients fictifs), puis annulation du lot.
- [ ] Isolement et contention : création d'une mesure de test, information du tiers, envoi JLD, décompte imprimé, fin de mesure ; échéances JLD vérifiées sur un cas connu (isolement débuté le 1er à 8 h 45 sans cumul antérieur : information avant le 3 à 8 h 45, saisine avant le 4, décision avant le 5).
- [ ] Agenda : élément répété, check-list, tâche du service cochée par un IDE, absence ; l'échéance JLD de la mesure de test apparaît dans l'onglet *Alertes* pour un rôle qui a l'accès aux envois au JLD, et pas pour un rôle qui ne l'a pas.
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
