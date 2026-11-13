# Évolutions futures

Évolutions étudiées avec le porteur du projet et gardées pour plus tard. Elles ne font pas partie du périmètre soumis à validation (fiche projet) ; chacune reste à retravailler et à valider avant tout développement. Les évolutions déjà réalisées ont été retirées de ce document le 13 novembre 2026 (leur détail est dans `CHANGELOG.md` et `docs/a-documenter.md`) ; ne restent que les parties non faites.

## Lots de développement (13 novembre 2026)

Un lot « sans avis préalable » peut être développé tout de suite (données fictives, options désactivées par défaut) ; les autres attendent une décision ou un avis avant le développement, même si leur étude peut commencer.

| Lot | Contenu | Avis préalable | Ampleur |
| --- | --- | --- | --- |
| **A. Liens entre modules et confort** | Barre des modules avec favoris épinglés et menu des autres modules ; contact d'un clic dans l'agenda, les salles, la messagerie et la Vue d'ensemble ; salles des présences dans « Mon agenda », colonne « salle » de la Vue d'ensemble ; messageries Zimbra sans connexion (annuaire des boîtes, « Écrire à… », import d'un agenda .ics) | Aucun | Petite à moyenne |
| **B. Chambres de soins intensifs (CSI)** | Tâche de surveillance de la CSI dans l'agenda (Isocont) ; contrôle de conformité des CSI libres par poste, à deux agents, avec check-list | Aucun (aucune donnée clinique) ; check-list à rédiger avec le porteur | Moyenne |
| **C. Temps de travail : formations et heures supplémentaires** | Demandes de formation sur le modèle du module Congés (tableaux, périodes, règles, totaux, validation selon le rôle, départs visibles dans l'Agenda) ; déclaration des heures supplémentaires et des heures récupérées, validation du cadre (récupération ou paiement), puis confirmation de l'enregistrement dans le logiciel de gestion du temps de travail ; articulation réglable avec ce logiciel (Tessera recueille les demandes, ou sert à la planification seulement), lecture de ses exports et export pour la saisie | Données du personnel : délégué à la protection des données (registre des traitements) ; heures payées : direction des ressources humaines | Moyenne |
| **D. Documents, suite** | Graphiques dans le tableur ; suivi des modifications du style de paragraphe, de l'alignement, du retrait et des listes ; modèles remplis automatiquement à partir des fiches ; fichiers joints (PDF, scans) avec ouverture sans téléchargement ; photos jointes aux demandes de travaux | Graphiques, suivi, modèles : aucun ; fichiers joints : responsable de la sécurité informatique (politique de sécurité de la page) ; photos : délégué à la protection des données | Moyenne à grande (peut être découpé : D1 sans avis, D2 fichiers et photos) |
| **E. Rôles et droits, suite** | Rôles selon le service (écran) ; droits par domaine des référents ; périodes de garde de l'administrateur de garde ; cadre supérieur affecté à un pôle ; réglages du Suivi médical ouverts au cadre et aux médecins chefs | Responsable de la sécurité informatique pour ce qui change la remise des clés | Moyenne |
| **F. Données du personnel et conformité** | Entretiens et notes de ressources humaines dans les fiches des agents ; module Signalement (lanceur d'alerte) ; données des modules arrêtés dans l'export du droit d'accès | Délégué à la protection des données ; direction des ressources humaines ; direction juridique (signalement) | Moyenne à grande |
| **G. Données cliniques** | Accès réglable par rôle et service, limité aux patients présents, « bris de glace » ; feuille de staff (CIM, motif, projet thérapeutique, dépendance) ; notes cliniques | Levée de la règle « aucune donnée clinique », délégué à la protection des données (analyse d'impact), responsable de la sécurité informatique, direction des soins, commission médicale d'établissement | Grande |
| **H. Socle, déploiement et liens avec le système d'information** | Versions stable, bêta et développement ; connexion rapide sans mot de passe (clé de sécurité physique, badge FIDO2, code PIN, carte CPS) ; protection du dossier de données contre les modifications et suppressions accidentelles ; connexion avec la session Windows ; stockage sur un partage autre que SMB ; messageries Zimbra avec connexion directe | Service informatique (DSI ou direction du numérique, selon l'établissement), responsable de la sécurité informatique (RSSI) ; Zimbra : délégué à la protection des données | Moyenne à grande |
| **I. Classement dans la Messagerie et les Documents** | Dossiers, étiquettes en couleur, favoris et liens avec une tâche, dans les deux modules | Aucun (aucune donnée clinique ; classement personnel chiffré par la clé de l'agent) | Moyenne |
| **J. Planning du personnel et remplacements** | Trame et roulement des agents par cycle, effectif minimum par poste et alerte de sous-effectif, nourris par les Congés (puis les formations et heures supplémentaires du lot C) ; postes à pourvoir après une absence, appel aux volontaires, suivi des remplacements | Données du personnel : délégué à la protection des données (registre des traitements) ; direction des ressources humaines (règles du temps de travail) | Grande |
| **K. Contrôles périodiques et effets personnels** | Mécanisme commun de contrôles à check-list et périodicité (chariot d'urgence, défibrillateur, réfrigérateur à médicaments, extincteurs, CSI libres du lot B), registre imprimable ; inventaire des effets personnels des patients (dépôt, retrait, restitution, à deux agents) | Contrôles : aucun ; effets personnels : délégué à la protection des données (donnée liée au patient, non clinique) | Moyenne |
| **L. Encadrement, réunions et pilotage** | Stages des étudiants et parcours d'intégration des nouveaux arrivants ; réunions (ordre du jour, présents, décisions, actions envoyées dans « Mes tâches ») ; tableau de bord du cadre et rapport d'activité annuel | Réunions : aucun ; étudiants et nouveaux arrivants : délégué à la protection des données ; tableau de bord : aucun s'il ne montre que des chiffres agrégés | Petite (réunions) à moyenne |

Dépendances : le lot C reprend les tableaux et les règles du module Congés ; les rôles selon le service (E) précèdent utilement le « bris de glace » (G) ; la connexion avec la session Windows et Zimbra en connexion directe (H) supposent un hébergement sur le serveur interne, après la phase pilote sur GitHub. Le lot I s'appuie sur les tâches de l'Agenda (« Mes tâches ») et peut suivre le lot A. Le lot J s'appuie sur le module Congés et sur le lot C ; le contrôle des CSI libres (lot B) peut être construit directement sur le mécanisme commun du lot K ; les actions des réunions (lot L) reprennent « Mes tâches », comme le lot I. Écartée pour l'instant : échéances des certificats légaux dans l'agenda (fin du document).

## A. Liens entre modules et confort

### Liens entre modules (reliquats signalés pendant les développements)

- **Contact d'un clic** (fiche de contact de l'Équipe) à brancher là où un agent apparaît : agenda (accompagnateurs, participants), salles (auteur d'une réservation, si le réglage le permet), messagerie (destinataires), Vue d'ensemble (vue « Équipe »).
- **Salles et bureaux** : salles des présences dans « Mon agenda » ; colonne « salle » dans la Vue d'ensemble.
- **Messageries Zimbra, option 1** (sans connexion) : voir le lot H.

### Barre des modules : favoris épinglés et menu des autres modules (demande du porteur, 13 novembre 2026)

- **Besoin** : avec une quinzaine de modules, la barre du bas déborde (surtout sur téléphone). Chaque agent épingle ses modules favoris dans la barre ; les autres sont dans un menu qui s'ouvre par un bouton (sur le modèle de l'ancien menu « Démarrer » de Windows).
- **Fonctionnement** :
  - bouton « Modules » à gauche de la barre : liste de tous les modules auxquels l'agent a accès, avec icône, nom et pastille (nombre d'éléments à traiter), recherche par nom ; Patients et Administration y figurent aussi ;
  - épingler ou désépingler depuis le menu (et par un appui long ou un clic droit sur une icône de la barre), réordonner les modules épinglés par glisser-déposer ;
  - une fenêtre ouverte d'un module non épinglé apparaît dans la barre tant qu'elle est ouverte ;
  - la pastille du bouton « Modules » totalise celles des modules non épinglés, pour ne rien manquer.
- **Réglages** : choix personnel gardé pour l'agent ; l'établissement peut proposer des favoris par défaut selon le rôle (ex. IDE : Patients, Agenda, Isolement et contention ; secrétaire : Agenda, Suivi médical, Messagerie). Option désactivée par défaut au départ (la barre actuelle reste) si elle change trop les habitudes.
- **À trancher** : nombre maximal de modules épinglés selon la largeur de l'écran ; place des modules arrêtés (masqués du menu, comme aujourd'hui).

## B. Chambres de soins intensifs (CSI)

### Isocont : tâche de surveillance de la CSI dans l'agenda (demande du porteur, 11 novembre 2026)

Quand une mesure est en cours dans une chambre de soins intensifs (CSI), une tâche de surveillance apparaît dans l'agenda du service.

- **Fonctionnement envisagé** : tâche lue à la volée dans Isocont (aucune copie dans l'agenda), répétée selon une fréquence réglable par l'établissement ou le service (par exemple toutes les heures, ou par poste), pour les rôles choisis (IDE, AS) ; cochée « faite » par l'agent avec l'heure ; retard signalé.
- **Aucune donnée clinique** : la tâche rappelle et trace le passage (heure, agent) ; le contenu de la surveillance reste dans le dossier patient informatisé (DPI). Lien avec les traces de surveillance déjà prévues pour les mesures hors CSI (réglage qualité d'Isocont) à étudier pour ne pas faire deux fois la même saisie.
- **À trancher** : fréquences par défaut (isolement, contention) ; tâche par mesure ou par CSI ; trace inscrite au journal d'Isocont ou de l'agenda (un module n'écrit pas dans le journal d'un autre).

### Contrôle de conformité des CSI libres (demande du porteur, 11 novembre 2026)

Vérifier une fois par poste, à deux agents, qu'une chambre de soins intensifs (CSI) inoccupée est prête et conforme.

- **Fonctionnement envisagé** : liste des CSI du service (lieux d'isolement déjà déclarés dans Isocont) ; pour chaque CSI libre, une tâche par poste (matin, après-midi, nuit, horaires réglables) ; **check-list** réglable par l'établissement ou le service (par exemple : matelas et literie, absence d'objet dangereux, éclairage, appel malade, sanitaires, visibilité par l'oculus, matériel de contention complet et vérifié, horloge visible) ; validation par **deux agents** (le second confirme avec son propre compte) ; écart signalé au cadre, avec lien possible vers une demande de travaux.
- **Traçabilité** : chaque contrôle est une saisie datée et signée ; historique consultable et exportable (preuve pour les visites de certification ou du Contrôleur général des lieux de privation de liberté, CGLPL).
- **À trancher** : contenu de la check-list par défaut ; ce qui se passe si le contrôle n'est pas fait (alerte au cadre) ; module d'accueil (Isocont ou agenda) ; contrôle aussi à la libération de la CSI.

## C. Temps de travail : formations et heures supplémentaires

### Planification des demandes de formation (demande du porteur, 12 novembre 2026)

- **Besoin** : même principe que la planification des congés : chaque agent planifie ses demandes de formation ; validateur selon le type d'agent ; tableau annuel du service à la semaine ou à la journée, périodes colorées, règles (agents absents en même temps), totaux, couleurs selon le statut.
- **Décision** : à développer plus tard, après le module Congés (12 novembre 2026), en reprenant ses tableaux et ses règles.
- **Pistes** : lien avec le plan de formation de l'établissement et les formations obligatoires (AFGSU, incendie…) suivies dans l'Équipe ou un tableur ; départs en formation visibles dans l'Agenda comme les absences.

### Articulation avec le logiciel de gestion du temps de travail de l'établissement (13 novembre 2026)

Tessera doit convenir à **tout établissement**, quel que soit son logiciel de gestion du temps (AgileTime, Octime, Horoquartz, solution maison…) et la façon dont il est utilisé. Ce logiciel reste **la référence** (avertissement réglable, déjà en place dans le module Congés) ; Tessera ne s'y connecte jamais directement (aucune connexion sortante) et ne remplace ni la paie, ni le pointage. Cas particulier du CHHA : AgileTime, sans accès des agents (« self-service ») ni pointeuse ; les congés et les heures sont saisis par l'encadrement ou le secrétariat.

- **Mode de fonctionnement réglable par l'établissement** (pour les congés, les heures supplémentaires et les formations) :
  1. **Tessera recueille les demandes** (établissement dont les agents n'ont pas accès au logiciel, comme au CHHA) : l'agent demande dans Tessera, le cadre valide, puis une **étape « Enregistré dans le logiciel de gestion du temps »** (date, auteur) clôt la demande ; liste « À enregistrer » pour la personne chargée de la saisie ; étape désactivable ;
  2. **Tessera sert à la planification seulement** (établissement dont les agents font leurs demandes dans le logiciel) : tableaux, périodes, règles, souhaits et date limite de dépôt dans Tessera ; la demande officielle se fait dans le logiciel ; rappel « à déposer dans le logiciel » une fois le souhait arbitré ;
  3. **module non utilisé** pour ce domaine (arrêt du module ou de l'onglet, comme aujourd'hui).
- **Lecture des exports du logiciel** (Excel ou CSV), lus dans le navigateur et jamais copiés sur le partage, avec **attribution des colonnes à l'import et modèle d'import mémorisé**, comme l'import de la liste des patients du DPI (aucun format propre à un éditeur en dur) :
  - comparer les soldes de congés, de RTT et de RTP calculés dans Tessera aux soldes officiels et signaler les écarts (le cadre corrige, le calcul restant affiché) ;
  - vérifier qu'une demande validée dans Tessera figure bien dans le logiciel (pointage automatique de l'étape « Enregistré ») ;
  - reprendre les absences et le planning exportés pour l'Agenda et les tableaux de congés.
- **Export depuis Tessera** des congés et des heures validés, dans un fichier dont l'établissement règle les colonnes, pour faciliter la saisie (ou l'import, si le logiciel le permet) dans le logiciel de gestion du temps.
- **Avant le développement** : formats d'export disponibles dans le logiciel de l'établissement (noms des colonnes seulement, aucune donnée réelle dans le dépôt) ; avis du délégué à la protection des données pour les imports et exports de données du personnel.

### Heures supplémentaires et heures récupérées (demande du porteur, 13 novembre 2026)

- **Besoin** : l'agent déclare ses heures supplémentaires (dépassement d'horaire, rappel sur un repos) et les heures qu'il récupère ; le cadre valide, puis confirme qu'elles sont enregistrées dans le logiciel de gestion du temps de travail, qui reste la référence (même avertissement réglable que pour les congés).
- **Circuit** :
  1. **Déclaration par l'agent** : date, heures de début et de fin (ou durée), motif dans une liste réglable (dépassement, rappel, réunion, formation, remplacement…) et commentaire court, **sans donnée clinique** ni nom de patient ;
  2. **Validation du cadre** (validateur selon le rôle, comme pour les congés) : accepter **en récupération** ou **en heures supplémentaires payées** (si l'établissement l'autorise et selon les plafonds réglables), accepter en partie, ou refuser avec un motif ;
  3. **Confirmation de l'enregistrement** dans le logiciel de gestion du temps de travail, par le cadre ou le secrétariat chargé de la saisie (date et auteur gardés) ; la déclaration est alors close.
- **Heures récupérées** : demandées comme un congé (dans le module Congés ou ici, à trancher), décomptées du solde d'heures à récupérer ; solde par agent et par année, avec correction possible du cadre (le calcul restant affiché pour référence, comme les droits à congés).
- **Suivi** : liste « À valider » et « À enregistrer » pour le cadre, pastilles dans la barre des modules, totaux par agent, par mois et par motif ; export pour la saisie dans le logiciel de gestion du temps de travail.
- **Avant le développement** : avis du délégué à la protection des données (données du personnel, registre des traitements, durée de conservation) ; règles de l'établissement sur le paiement des heures supplémentaires, les plafonds et les majorations, à voir avec la direction des ressources humaines (Tessera ne calcule pas la paie).
- **À trancher** : module propre ou onglet du module Congés ; unité (heures et minutes, ou centièmes) ; qui confirme l'enregistrement dans le logiciel de gestion du temps de travail.

## D. Documents, suite

### Graphiques dans le tableur (demande du porteur, 12 novembre 2026)

- **Besoin** : graphiques dans les tableurs du module Documents (courbes, histogrammes, secteurs) tirés d'une plage de cases, mis à jour avec les valeurs et imprimés avec la feuille.
- **Décision** : mis de côté le 12 novembre 2026, à développer plus tard (après l'édition simultanée et l'import et l'export Office).
- **Pistes** : dessin en SVG construit dans le navigateur (aucune bibliothèque externe) ; plage, type, titre et couleurs enregistrés dans la feuille ; reprise des graphiques des fichiers `.xlsx` à l'import.

### Suivi des modifications : style, alignement, retrait et listes (demande du porteur, 12 novembre 2026)

- **Besoin** : avec le suivi des modifications activé, marquer aussi (auteur, date, à accepter ou refuser) le changement de style d'un paragraphe (titre, paragraphe), de son alignement, de son retrait et le passage en liste à puces ou numérotée, comme la mise en forme du texte.
- **Décision** : à développer plus tard (12 novembre 2026).
- **Pistes** : marque de bloc « mise en forme du paragraphe » gardant l'état d'avant (type, alignement, retrait, liste) ; refus : état d'avant rétabli ; export Word en `w:pPrChange`.

### Fichiers joints et modèles remplis automatiquement (étudiés le 6 novembre 2026)

*Réalisé : module Documents (0.34.0 à 0.42.0) — documents texte et tableurs chiffrés, une clé par document, partage par agent, service, rôle ou groupe, versions, validation, modèles, rattachement à un patient, un agent ou une salle, corbeille, édition simultanée et suivi des modifications, onglets, exports et imports Office, images et masques de fond. Restent :*

- **Fichiers joints** (PDF, scans, images) rattachés à une fiche patient ou à une mesure : décision ou ordonnance du juge des libertés et de la détention (JLD), avis d'audience, accusé de réception d'une saisine ; décision de tutelle ou de curatelle ; compte rendu rattaché à l'agenda. Chiffrés comme les documents ; **aucun document clinique** (observations, comptes rendus médicaux, courriers médicaux : ils relèvent du DPI).
- **Ouverture sans téléchargement** : fichier déchiffré en mémoire et affiché dans le navigateur (PDF dans la visionneuse d'Edge et de Chrome, images) ; aucune copie en clair écrite sur le poste. Demande d'assouplir légèrement la politique de sécurité de la page (affichage de fichiers créés en mémoire), **sans ouvrir aucune connexion réseau** : avis du responsable de la sécurité informatique (RSSI).
- **Téléchargement** : droit distinct, tracé ; un document affiché peut toujours être imprimé ou capturé (Tessera protège le stockage et les accès, pas l'usage qu'une personne autorisée fait de ce qu'elle voit).
- **Modèles remplis automatiquement** à partir des fiches patient et des mesures (courrier d'information du tiers, fiche de liaison, bordereau d'envoi au JLD), sur le papier à en-tête de l'établissement (masques de fond déjà en place).
- **À trancher** : taille maximale d'un fichier et place totale par service (sauvegardes, copie locale des postes) ; durée de conservation des fichiers joints ; avis du délégué à la protection des données sur ce traitement.

### Demandes de travaux : photos jointes (11 novembre 2026)

Joindre une photo à une demande de travaux (fuite, dégradation). Stockage chiffré des images comme dans les documents ; **risque de photographier un patient** à étudier avec le délégué à la protection des données (rappel à la prise de vue, recadrage, droit de suppression).

## E. Rôles et droits, suite

### Rôles et droits : reliquats des lots C et D (11 et 12 novembre 2026)

*Réalisés : fiches des agents et contact d'un clic, référents, pôles et cadre supérieur, médecins chefs, administrateur de garde, directeur des soins, rôle Médecin (0.27.0 à 0.28.1) ; intervenants extérieurs, charte, prêt de droits pendant une absence (0.31.0).* Restent :

- **Rôles selon le service** (écran) : prévus dans le modèle de données ; aujourd'hui un rôle vaut pour tous les services du compte, y compris un rôle prêté pour un seul service (limite signalée à la saisie du prêt).
- **Référents : droits par domaine** (par exemple le référent pharmacie confirme les demandes de travaux de la pharmacie), à décider domaine par domaine ; aujourd'hui la mention seulement.
- **Administrateur de garde : limitation aux périodes de garde** (planning des gardes), au lieu d'un rôle permanent.
- **Cadre supérieur** : suivi automatique des changements de son pôle (affectation du compte à un pôle plutôt qu'aux services cochés), si le porteur le souhaite.
- **Suivi médical** : réglages ouverts au cadre et aux médecins chefs (à vérifier au moment du lot).
- Avis du responsable de la sécurité informatique pour tout ce qui change la remise des clés.

## F. Données du personnel et conformité

### Fiches des agents : entretiens et notes de ressources humaines (demande du porteur, 8 novembre 2026)

*Réalisé : module Équipe (0.27.0 et 0.28.0) avec annuaire, fiches, coordonnées, données ajoutées par l'établissement (accès par rôle, accès de l'agent à sa propre valeur), et onglet « Congés et droits » (0.44.0).*

- **Reste** : entretiens avec l'agent (liste datée : date, type, auteur, compte rendu court) et notes du cadre sur un agent, qui sont des **données de ressources humaines**.
- **Avant tout développement** : avis du délégué à la protection des données (DPO, référent RGPD) et de la direction des ressources humaines, inscription au registre des traitements, durée de conservation, droit d'accès de l'agent, frontière avec le dossier administratif de l'agent et les outils de la direction des ressources humaines (éviter un dossier parallèle).
- **À trancher** : qui lit les entretiens et les notes ; l'agent voit-il ces rubriques ; clé propre remise aux seuls rôles habilités (mécanisme des données ajoutées).

### Module Signalement (lanceur d'alerte, demande du porteur, 11 novembre 2026)

Permettre à un agent de signaler un fait (atteinte, manquement, danger) de façon confidentielle, avec un suivi par la personne chargée de recueillir les signalements.

- **Cadre légal** : procédure de recueil des signalements des lanceurs d'alerte (loi du 9 décembre 2016 dite « Sapin II », modifiée par la loi du 21 mars 2022) ; l'établissement a déjà sa procédure et son référent : Tessera ne la remplace pas, il peut seulement offrir un canal interne conforme à celle-ci. **À valider avec la direction juridique et le délégué à la protection des données avant tout développement.**
- **Confidentialité** : contenu chiffré pour le seul référent (sur le modèle du chiffrement réservé aux destinataires de la messagerie) ; **l'administrateur ne doit pas pouvoir lire**, ce que le trousseau actuel ne garantit pas (il détient toutes les clés) : clé hors du trousseau de l'administrateur à concevoir ; identité de l'auteur protégée, possibilité d'un signalement anonyme (limites : le journal en ajout seul garde l'auteur de chaque saisie) ; aucune consultation par le cadre.
- **Suivi** : accusé de réception, échanges entre l'auteur et le référent, retour sur les suites données, délais légaux ; journal des accès.
- **À trancher** : faisabilité au regard de l'anonymat et de l'administrateur ; à distinguer de la déclaration des événements indésirables (outil qualité de l'établissement).

### Droit d'accès : données des modules arrêtés (accord du porteur, 12 novembre 2026)

- **Besoin** : l'export du droit d'accès d'un patient reprend aussi les données des modules arrêtés depuis l'accueil de l'administration (données conservées, obligation légale).
- **Décision** : principe accepté le 12 novembre 2026, mis de côté pour plus tard ; à confirmer avec le délégué à la protection des données (DPO, référent RGPD).
- **Pistes** : vérification de l'export module par module (aujourd'hui, la messagerie et les modules lus par l'export le sont déjà) ; mention « module arrêté » dans le fichier exporté.

## G. Données cliniques

**Règle « aucune donnée clinique ».** Deux demandes du 8 novembre 2026 (feuille de staff avec codes CIM et projet thérapeutique, notes par patient) portent sur des **données cliniques**, que Tessera exclut aujourd'hui (le dossier patient informatisé, DPI, reste la référence clinique). Avant tout développement, il faudra : une décision explicite du porteur de lever cette règle pour ces modules ; l'avis du délégué à la protection des données (DPO, référent RGPD), avec une analyse d'impact (AIPD) mise à jour ; l'avis du responsable de la sécurité informatique (RSSI) et du service informatique (DSI ou direction du numérique, selon l'établissement), y compris sur l'hébergement (partage du réseau de l'hôpital) et sur la sauvegarde ; l'accord de la direction des soins et de la commission médicale d'établissement (CME) sur le partage avec le DPI (risque de double saisie et de divergence). Le chiffrement par module et la clé remise aux seuls agents habilités s'appliqueraient comme ailleurs.

### Accès aux données cliniques réglable, « bris de glace » (demande du porteur, 11 novembre 2026)

*Suppose la levée de la règle « aucune donnée clinique » (en tête de document) et ses avis.*

- **Réglage** : accès aux données cliniques choisi par rôle et par service (lecture, écriture) ; option « patients présents seulement » (patients hospitalisés dans le service ce jour), désactivée ou activée selon le rôle.
- **Bris de glace** : option, réglable par rôle et service (désactivée par défaut), qui permet à un agent sans accès de lire les données cliniques d'un patient pour une **durée limitée** (par exemple une heure ou la fin du poste), avec **justification obligatoire**, inscription au journal et **notification du cadre** (onglet Informations, message) ; consultation tracée sur le modèle de la messagerie chiffrée (0.24.0).
- **Clés** : avec « un droit = une clé », un accès limité aux patients présents ou un bris de glace ne peut pas reposer sur la seule interface si l'agent détient la clé ; à concevoir avec le responsable de la sécurité informatique (clé par patient ou par séjour, remise temporaire par un tiers de confiance, ou garantie par l'application seulement, comme la consultation tracée).
- **À trancher** : durée du bris de glace ; qui est notifié (cadre, cadre de garde) ; relecture des bris de glace (revue périodique par le cadre ou le délégué à la protection des données).

### Feuille de staff : codes CIM, motif d'hospitalisation, projet thérapeutique, codage de la dépendance (demandes du porteur, 8 et 11 novembre 2026)

*La feuille de staff sans données cliniques est réalisée (0.19.0, module Vue d'ensemble). Restent ces colonnes, qui sont des données cliniques.*

- **Contenu** : colonne **code CIM** (classification internationale des maladies), **motif d'hospitalisation**, **projet thérapeutique**, **codage de la dépendance** (grille à préciser : celle du recueil d'informations médicalisé en psychiatrie, RIM-P, ou une grille propre à l'établissement).
- **Fonctionnement** : option « donnée clinique » des données ajoutées (administrateur, après avertissement, clé propre), donnée par donnée, après les avis prévus ; import depuis l'export du DPI plutôt qu'une saisie en double, à étudier.
- **À trancher** : codes CIM saisis à la main ou liste de référence (à embarquer dans l'application, sans connexion sortante) ; qui voit ces colonnes ; place par rapport au DPI.

### Notes cliniques par patient (demande du porteur, 8 novembre 2026)

*Les notes organisationnelles sont réalisées (0.19.0, type « liste de notes » des données ajoutées).* Restent les notes cliniques, soumises à la règle « aucune donnée clinique » (en tête de ce lot) ; frontière avec les transmissions du DPI (éviter un second dossier de soins) ; durée de conservation ; export dans le cadre du droit d'accès du patient.

## H. Socle, déploiement et liens avec le système d'information

### Versions stable, bêta et développement (demande du porteur, 13 novembre 2026)

- **Besoin** : garder une version stable à l'adresse actuelle, et publier en parallèle une version bêta et une version de développement (« live ») avec les développements du jour, pour tester avant diffusion.
- **Décision** : à développer plus tard (13 novembre 2026). Trois canaux : la version de développement mise à jour à chaque envoi remplace la « nightly » d'abord envisagée, inutile puisque l'application n'a pas d'étape de construction (accord du porteur du 13 novembre 2026).
- **Pistes** :
  - trois canaux sur le même site GitHub Pages : la racine pour la version stable (étiquette de version figée), `/beta/` pour la version candidate, `/dev/` pour l'état de `main`, republié à chaque envoi ; publication assemblée par une action GitHub (pas de dépendance ajoutée à l'application) ;
  - circuit : développement sur `main` (développement) → version candidate `0.x.y-beta.n` (bêta) → version stable après essai ; correctifs urgents sur la stable ;
  - bandeau visible « Version bêta » ou « Version de développement — essais seulement », numéro de version et empreintes propres à chaque canal ;
  - **protection des données du service** : une bêta ou une version de développement peut introduire un format de saisie que la stable ne sait pas lire ; elles s'ouvrent en mode démonstration ou sur un dossier d'essai, et l'application refuse (ou avertit) d'ouvrir un dossier déjà écrit par une version plus récente ;
  - application installée (mode application) et mémoire du navigateur séparées par canal (une adresse chacun) ;
  - même schéma possible plus tard sur le serveur interne de l'établissement.

### Connexion avec la session Windows (étudiée le 2 novembre 2026)

*Étude faite pour Suivi-mesures-isocont, reprise ici ; elle relève désormais du socle et devra être adaptée au trousseau de clés de la plateforme (clé personnelle de chaque agent).*

**Besoin** : permettre aux établissements qui le souhaitent de se connecter avec l'identifiant Windows de l'agent, l'administrateur gérant les identifiants autorisés et leurs accès.

**Principe retenu à l'étude**

- Possible uniquement avec un hébergement sur le serveur web interne (IIS), mode conseillé pour la production ; impossible avec GitHub Pages ou une ouverture depuis le partage réseau (une page web ne connaît pas seule l'utilisateur Windows). Cette évolution viendrait donc **après la phase pilote sur GitHub**.
- **Identité** : authentification Windows activée dans IIS (transparente dans Edge et Chrome) ; une page `.stm` fournie avec l'outil renvoie l'identifiant (`<!--#echo var="AUTH_USER" -->`, fonction « Server Side Includes » d'IIS, sans code serveur ; à vérifier en recette selon la version d'IIS). Référence : [IIS, directive #echo](https://learn.microsoft.com/en-us/previous-versions/iis/6.0-sdk/ms525581(v=vs.90)).
- **Ouverture des données** : les données restent chiffrées. Une clé générée par l'administrateur est déposée sur le serveur IIS dans un dossier réservé, par autorisation d'URL d'IIS, à un groupe Windows défini par le service informatique (ex. « GG_TesseraSante »). Dans l'étude d'origine, cette clé ouvrait la clé de données unique ; **avec le socle, elle devra ouvrir la clé personnelle de l'agent** (par exemple une enveloppe par agent), afin que chacun ne reçoive que les clés de ses modules. Mécanisme à retravailler. Une copie du partage seule reste illisible.
- **Identifiants autorisés** : chaque identifiant Windows (`DOMAINE\login`) est associé à un compte de la plateforme (rôles par module, services, date de fin), saisi un par un ou collé en lot ; un identifiant absent de la liste est refusé.
- **Connexion** : bouton « Se connecter avec ma session Windows (DOMAINE\login) » à l'écran d'accueil ; saisies tracées au nom de l'agent.
- **Deux contrôles à tenir ensemble** : le groupe Windows (service informatique) donne l'accès technique, la liste de la plateforme (administrateur) donne les rôles, les modules et les services. Le groupe ne doit contenir que les agents autorisés.
- **Départ d'un agent** : renouvellement de la clé déposée sur le serveur (à redéposer), comme le code de secours.
- **Sécurité de la page** : la politique de sécurité devra autoriser les requêtes vers le serveur de l'outil lui-même (`connect-src 'self'` au lieu de `'none'`), à signaler au responsable de la sécurité informatique.
- **Tests** : authentification Windows simulée pour les tests automatiques ; procédure de recette à ajouter à la fiche technique.

**Questions à trancher avant développement**

1. Garder les autres moyens de connexion à côté de Windows (mot de passe, clé de sécurité, code de secours) ? Recommandé : oui (intérimaires sans compte Windows, panne de l'annuaire, secours).
2. Connexion automatique à l'ouverture ou par un bouton ? Recommandé : bouton (poste partagé, session Windows pas toujours celle de l'agent présent).
3. Liste des identifiants saisie par l'administrateur, ou demande d'accès par un membre du groupe, validée ensuite par l'administrateur ?

### Stockage sur un partage autre que SMB (demande du porteur, 2 novembre 2026)

*Demande faite pour Suivi-mesures-isocont, reprise ici ; elle relève désormais du socle (couche de stockage commune à tous les modules).*

Demande : pouvoir enregistrer les données (ou le dossier de secours) ailleurs que sur un partage réseau Windows (SMB), par exemple un espace documentaire de l'établissement, un serveur WebDAV ou un stockage objet.

- **Contrainte actuelle** : l'outil n'écrit que dans un dossier ouvert par le navigateur (API *File System Access*), donc un dossier visible dans l'Explorateur : partage SMB, lecteur réseau, ou dossier synchronisé (client OneDrive / SharePoint, qui synchronise ensuite vers le serveur). Ce dernier cas fonctionne déjà dans Isocont, sous réserve de validation du service informatique (délais de synchronisation, conflits).
- **Partage accessible seulement par le web** (WebDAV, API d'une gestion électronique de documents) : il faudrait que la page envoie des requêtes à ce serveur, donc ouvrir la politique de sécurité (`connect-src` vers ce seul serveur, au lieu de `'none'`), gérer l'authentification (session Windows, jeton) et adapter le stockage du socle derrière une interface commune (lister, lire, écrire sans écraser). Les données resteraient chiffrées sur le poste avant l'envoi.
- **Lien avec les documents** : le module Documents (0.34.0) et les fichiers joints à venir (lot D) augmentent le volume stocké ; le choix du support de stockage en tiendra compte.
- **À trancher avant développement** : type de partage visé par les établissements intéressés ; accord du responsable de la sécurité informatique sur l'ouverture de `connect-src` ; usage comme stockage principal ou seulement comme dossier de secours.

### Messageries Zimbra du service (demande du porteur, 13 novembre 2026)

- **Besoin** : relier Tessera aux messageries Zimbra du service. Cas de départ (cas particulier du CHHA) : une boîte pour les paramédicaux, une par médecin et par cadre, une pour les secrétaires. Usage précis à préciser avec le porteur (voir qu'un courriel est arrivé, écrire depuis la bonne boîte, relier un courriel à une demande ou à un rendez-vous…).
- **Décision** : gardé pour plus tard avec deux options (13 novembre 2026) ; commencer de préférence par l'option 1.
- **Option 1 — sans connexion** (compatible avec les principes actuels, aucune validation particulière) :
  - annuaire des boîtes du service dans l'Équipe (quelle boîte pour qui, par rôle) ;
  - boutons « Écrire à… » qui ouvrent la messagerie avec destinataire et objet préremplis (lien `mailto:`), depuis une demande de travaux, une permission, un congé, une réservation… sans contenu clinique ;
  - raccourci vers la bonne boîte du webmail Zimbra ;
  - import d'un agenda Zimbra exporté (.ics) dans l'Agenda, lu dans le navigateur et jamais copié sur le partage.
- **Option 2 — connexion directe** (lire et envoyer depuis Tessera) :
  - lève le principe « aucune connexion sortante » pour une seule adresse, celle du serveur Zimbra interne (CSP `connect-src` limitée à ce serveur) ; configuration de Zimbra par le service informatique pour accepter les requêtes de Tessera ;
  - accès aux boîtes partagées : délégation Zimbra ou jeton d'accès plutôt que mots de passe gardés dans Tessera ; à trancher avec le responsable de la sécurité informatique (RSSI) ;
  - courriels affichés à la volée, jamais enregistrés dans Tessera (ils contiennent souvent des informations sur les patients ; aucune donnée clinique dans Tessera) ;
  - avis préalable du service informatique, du responsable de la sécurité informatique et du délégué à la protection des données (DPO, référent RGPD) ; mise à jour de la fiche technique.

### Connexion rapide sans mot de passe : clé de sécurité, code PIN, carte CPS (demande du porteur, 13 novembre 2026)

- **Besoin** : se connecter vite au poste de soins, sans retaper un long mot de passe, par un moyen physique sûr : clé de sécurité (YubiKey ou équivalent), carte de professionnel de santé (CPS), éventuellement un code PIN court.
- **Contrainte de Tessera** : le mot de passe ne sert pas seulement à entrer, il **ouvre la clé personnelle de l'agent**, qui ouvre ses autres clés (« un droit = une clé »). Un moyen de connexion sans mot de passe doit donc fournir un secret capable d'ouvrir cette clé, **sur le poste, sans serveur et sans connexion sortante** ; une simple preuve « c'est bien lui » ne suffit pas.
- **Clé de sécurité FIDO2 (YubiKey, Windows Hello)** — la piste la plus solide :
  - la norme WebAuthn, avec son extension PRF (« hmac-secret » sur les clés FIDO2), fait produire par la clé un secret propre à l'agent et à Tessera, utilisé pour emballer une seconde copie de sa clé personnelle ; rien de secret n'est stocké sur le partage ;
  - la clé demande un geste (toucher) et peut exiger son propre code PIN, vérifié par la clé elle-même (bloquée après quelques erreurs) : le code PIN court devient sûr ;
  - fonctionne dans Edge et Chrome récents, hors ligne ; demande une adresse fixe en HTTPS (hébergement interne, pas les chemins de fichiers) ; à tester avec les clés et les postes de l'établissement ;
  - enregistrement d'une ou deux clés par agent (une de secours), retrait par l'agent ou l'administrateur, perte d'une clé : connexion par mot de passe ou code de secours, puis retrait ; tout est tracé au journal (sans aucun secret).
- **Code PIN seul** : acceptable **seulement sur un poste personnel**, avec une clé non exportable gardée par le navigateur de ce poste et un nombre d'essais limité ; **déconseillé sur les postes de soins partagés** (risque de deviner un code court). À trancher avec le responsable de la sécurité informatique (RSSI).
- **Carte CPS** :
  - **CPS4 (en cours de déploiement par l'Agence du numérique en santé, ANS)** : elle intègre un volet **clé de sécurité FIDO2** ; elle pourrait donc servir comme une clé de sécurité (ci-dessus), carte insérée dans le lecteur (les documents de l'ANS divergent sur l'usage sans contact du volet FIDO2 : à vérifier). **À tester** : que le volet FIDO2 accepte l'enregistrement auprès de Tessera (et pas seulement de Pro Santé Connect) et qu'il fournisse l'extension « hmac-secret » (PRF), indispensable pour ouvrir les clés ; lecteurs à jour sur les postes ;
  - **CPS3 et précédentes** : pas de FIDO2 ; un site web ne peut pas lire la carte directement. Certificat de la carte présenté au serveur interne qui héberge Tessera (authentification par certificat client, lecteur et logiciel de la carte installés par le service informatique) : prouve l'identité mais **n'ouvre pas les clés**, à combiner avec une clé FIDO2 ou le mot de passe ;
  - **e-CPS / Pro Santé Connect** : passe par les serveurs de l'ANS, donc une **connexion hors de l'hôpital**, contraire aux principes actuels : écartée sauf décision contraire ;
  - tous les agents n'ont pas de carte CPS : un autre moyen (clé ou badge FIDO2, mot de passe) reste nécessaire.
- **Badge RFID de l'établissement** (question du porteur, 13 novembre 2026) : la plupart des badges d'accès (125 kHz, MIFARE) ne contiennent qu'un numéro, lu par le lecteur comme s'il était tapé au clavier ; ce numéro n'est **pas secret** (copiable en quelques secondes avec un lecteur bon marché) et ne peut pas ouvrir les clés. Usage possible seulement pour **remplir l'identifiant** (badge + mot de passe ou code PIN), sans gain de sécurité. Voie sûre : un **badge FIDO2** (carte qui réunit la technologie d'accès aux portes et une clé de sécurité FIDO2 sans contact), lu par un lecteur NFC sur le poste : même fonctionnement que la clé de sécurité ci-dessus, un seul objet pour les portes et Tessera ; à étudier avec le service informatique et les services techniques (gestion des badges).
- **Verrouillage rapide** : avec ces moyens, déverrouiller la session en cours (après « Verrouiller » ou une absence) devient un simple geste ; durée avant verrouillage réglable par l'établissement.
- **Avant le développement** : avis du responsable de la sécurité informatique et du service informatique (DSI ou direction du numérique, selon l'établissement) : moyens retenus, fourniture des clés, lecteurs de carte, hébergement en HTTPS ; mise à jour de la fiche technique (nouvelle façon d'ouvrir la clé personnelle).
- **À trancher** : clé de sécurité obligatoire ou au choix de l'agent ; mot de passe gardé en secours (proposé : oui) ; prise en charge des clés par l'établissement.

### Protection du dossier de données contre les modifications et suppressions accidentelles (demande du porteur, 13 novembre 2026)

- **Besoin** : empêcher qu'un agent (ou un programme) modifie ou supprime par erreur des fichiers du dossier de Tessera sur le partage. Aujourd'hui, Tessera **détecte** ces incidents (contrôle d'intégrité à la connexion puis toutes les 15 minutes : saisies disparues, fichiers illisibles, trous du chaînage) et permet la **réparation** depuis une sauvegarde ou le dossier de secours, mais ne les empêche pas : les agents ont le droit NTFS « Modifier » sur tout le dossier.
- **Protections sans changement de Tessera** (réglages du serveur par le service informatique, à ajouter au kit et à la fiche technique) :
  1. **dossier difficile à trouver** : partage caché (nom terminé par `$`), affichage limité aux ayants droit (énumération basée sur l'accès), aucun lecteur réseau monté pour ce dossier (choisi une seule fois dans Tessera) ;
  2. **retour en arrière rapide** : clichés instantanés du serveur (« Versions précédentes » de Windows, par exemple toutes les heures), dossier de secours par robocopy sans suppression (déjà dans le kit), sauvegardes de l'établissement si possible non modifiables pendant une durée donnée (protection aussi contre un rançongiciel) ;
  3. **traçabilité** : audit Windows des suppressions sur le dossier (qui a supprimé quoi) ; filtrage des types de fichiers déposés dans le dossier.
- **Protection par les droits, avec une évolution de Tessera** (la plus efficace) :
  - le journal est en ajout seul : les agents pourraient **créer et lire les fichiers, sans pouvoir supprimer ni modifier ceux des autres** (droits NTFS spéciaux, suppression réservée au compte d'administration du serveur) ;
  - prérequis : **séparer dans Tessera les fichiers jamais réécrits** (saisies du journal) **des fichiers réécrits** (coffre et son historique, repères des agents, instantanés, copies locales…), rangés dans des sous-dossiers distincts aux droits différents ; reprise des dossiers existants par une migration ;
  - **à tester avec le service informatique** : droits exacts nécessaires au navigateur (la File System Access API écrit un fichier provisoire puis le renomme), comportement sur le partage et dans le dossier de secours, absence de régression des mécanismes existants (saisie simultanée, réparation, quarantaine).
- **Avant le développement** : avis du service informatique et du responsable de la sécurité informatique ; mise à jour de la fiche technique (§ 5, dossier de données et droits) et du kit.

## I. Classement dans la Messagerie et les Documents

### Dossiers, étiquettes, favoris et liens avec une tâche (demande du porteur, 13 novembre 2026)

- **Besoin** : ranger les messages et les documents, les retrouver vite et les relier au travail à faire. Les deux modules ont aujourd'hui des boîtes (Messagerie) et des espaces de partage (Documents), avec rattachement à un patient, un agent, une salle…, mais ni dossiers, ni étiquettes, ni favoris.
- **Dossiers** :
  - Messagerie : dossiers et sous-dossiers personnels pour classer ses messages reçus et envoyés (un message rangé disparaît de la boîte de réception, sans être supprimé) ;
  - Documents : dossiers dans un espace partagé (service, rôle, groupe), visibles de ceux qui ont accès à l'espace, et dossiers personnels ; déplacer un document ne change pas qui peut le lire (le partage reste celui du document) ;
  - glisser-déposer et action « Déplacer vers… » ; dossier vide supprimable, dossier non vide : demande de confirmation, contenu remis à la racine (jamais supprimé).
- **Étiquettes en couleur** :
  - plusieurs étiquettes par message ou document, filtres et recherche par étiquette ;
  - étiquettes personnelles, et étiquettes communes définies par le cadre pour un service (liste et couleurs dans les réglages), comme les couleurs déjà réglables des autres modules ; couleurs lisibles en thème clair et sombre.
- **Favoris** : étoile sur un message ou un document, liste « Favoris » en tête ; personnelle.
- **Liens avec une tâche** :
  - « Créer une tâche » depuis un message ou un document (tâche de l'Agenda, « Mes tâches », avec échéance et personne chargée), l'élément étant rattaché à la tâche ;
  - rattacher un message ou un document à une tâche existante ; la tâche affiche ses éléments liés (lus à la volée, selon les droits de chacun) et l'élément affiche ses tâches ;
  - tâche terminée : rappel discret sur l'élément (« tâche faite »), sans le déplacer.
- **Confidentialité** : le classement personnel (dossiers, étiquettes, favoris) est chiffré avec la clé personnelle de l'agent et invisible des autres ; les dossiers et étiquettes partagés sont chiffrés avec la clé de l'espace ou du service ; un nom de dossier ou d'étiquette ne doit pas contenir de donnée clinique (rappel à la saisie). Aucune règle du socle ne change.
- **À trancher** : dossiers partagés dans la Messagerie (boîte du service) ou seulement personnels ; nombre maximal d'étiquettes ; qui crée les étiquettes communes (cadre, administrateur) ; tâche liée visible de l'expéditeur du message.

## J. Planning du personnel et remplacements

Pistes proposées le 13 novembre 2026 lors d'un tour d'horizon des besoins non couverts, inscrites à la demande du porteur, qui choisira plus tard lesquelles développer.

### Trame et roulement du personnel (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : construire et tenir le planning des agents du service, aujourd'hui souvent fait dans un tableur à part, avec les absences connues de Tessera sous les yeux.
- **Fonctionnement envisagé** :
  - **trame** par cycle (une à plusieurs semaines), réglable par le cadre : postes (matin, après-midi, nuit, journée, horaires réglables), roulement des agents ou des équipes, jours de repos ;
  - **effectif minimum** par poste et par jour (par rôle : IDE, AS…), réglé par le cadre ; **alerte de sous-effectif** quand les absences (Congés, et plus tard formations et récupérations du lot C) font passer un poste sous le minimum ;
  - planning prévisionnel généré à partir de la trame, puis ajusté à la main (échanges de postes, demandes de l'agent, validation du cadre) ; chaque changement est une saisie datée ;
  - chaque agent voit son propre planning (« Mon agenda ») ; le cadre voit celui du service ; impression et export ;
  - articulation réglable avec le logiciel de gestion du temps de travail de l'établissement, comme pour le lot C : Tessera sert à la **préparation** du planning, le logiciel de l'établissement reste la référence ; export pour la saisie.
- **À trancher** : règles du temps de travail à contrôler (repos quotidien et hebdomadaire, durée maximale, temps partiel) ou simple affichage ; place des échanges de postes entre agents ; lien avec la trame prévisionnelle déjà préparée dans un tableur par certains cadres (import).

### Remplacements (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : trouver vite un remplaçant après une absence imprévue et garder la trace de qui a dépanné.
- **Fonctionnement envisagé** : un poste découvert (absence saisie, sous-effectif) devient un **poste à pourvoir** ; le cadre ou l'administrateur de garde l'envoie aux agents choisis (selon le rôle, sans dépasser les règles de repos si elles sont contrôlées) par la Messagerie ; premier volontaire retenu après confirmation du cadre ; planning mis à jour ; suivi des remplacements faits par agent (équité, lien avec les heures supplémentaires du lot C).
- **À trancher** : appel ouvert à tous ou à une liste ; délai de réponse ; agents d'autres services du pôle ; ce qui est visible des autres agents (proposé : rien, sauf le poste pourvu).

## K. Contrôles périodiques et effets personnels

### Contrôles périodiques à check-list (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : tracer les vérifications régulières du service, souvent tenues sur des feuilles papier : chariot d'urgence, défibrillateur, température du réfrigérateur à médicaments, extincteurs, trousse d'urgence, CSI libres (lot B).
- **Fonctionnement envisagé** :
  - **mécanisme commun** : un contrôle = un objet (ou un lieu) + une **check-list** + une **périodicité** (par poste, par jour, par semaine, après chaque utilisation…) + les rôles qui le font ; contrôles réglés par le cadre pour ses services, modèles proposés par l'établissement ;
  - tâche dans l'agenda à l'échéance ; contrôle fait par un ou **deux agents** (le second confirme avec son compte) ; valeurs saisies si besoin (température, date de péremption) avec seuils d'alerte ;
  - **écart** signalé au cadre, avec lien possible vers une demande de travaux ; **retard** signalé ;
  - **registre** consultable, imprimable et exportable par contrôle et par période (preuve pour la certification).
- **Lien avec le lot B** : le contrôle de conformité des CSI libres devient un cas du mécanisme commun.
- **À trancher** : modèles fournis par défaut ; module d'accueil (nouveau module ou Agenda) ; durée de conservation du registre.

### Inventaire des effets personnels des patients (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : tracer les objets déposés par un patient à l'admission ou pendant le séjour (argent, papiers, téléphone, objets retirés pour sa sécurité), leur retrait et leur restitution, aujourd'hui souvent sur papier et source de litiges.
- **Fonctionnement envisagé** : inventaire par séjour (fiche patient), une ligne par objet (description, lieu de rangement : coffre, vestiaire…) ; dépôt, retrait temporaire et restitution, chacun daté et validé par **deux agents** ; restitution à la sortie rappelée ; inventaire imprimable pour signature du patient ; aucun motif clinique (la raison d'un retrait d'objet reste dans le DPI).
- **À trancher** : argent et valeurs (souvent gérés par la régie de l'établissement : simple mention ou inventaire détaillé) ; durée de conservation après la sortie ; accès du patient à cet inventaire par le droit d'accès.

## L. Encadrement, réunions et pilotage

### Étudiants et nouveaux arrivants (proposition retenue par le porteur, 13 novembre 2026)

- **Stages** : étudiants accueillis (dates, école, année, tuteur et maître de stage), échéances des bilans à rendre, rappel au tuteur ; aucun contenu d'évaluation dans un premier temps (le portfolio reste celui de l'école).
- **Parcours d'intégration** : check-list réglable par le cadre pour un nouvel agent (visite du service, procédures lues, accès informatiques, formations obligatoires à suivre), cochée au fil des jours, avec un référent.
- **Échéances des formations obligatoires** (AFGSU, incendie…) : les données ajoutées des agents en portent déjà une partie ; tableau des échéances et rappel.
- **À trancher** : compte Tessera pour les étudiants (rôle « étudiant », droits limités) ou simple liste ; avis du délégué à la protection des données.

### Réunions (proposition retenue par le porteur, 13 novembre 2026)

- **Fonctionnement envisagé** : réunion de l'agenda (staff, réunion d'équipe, réunion institutionnelle) avec **ordre du jour** préparé à plusieurs, **présents**, **décisions** et **actions** ; chaque action devient une tâche de « Mes tâches » avec un responsable et une échéance, suivie à la réunion suivante ; compte rendu dans les Documents, diffusé par la Messagerie.
- **Confidentialité** : aucun contenu clinique ; rappel à la saisie quand la réunion concerne des patients.
- **À trancher** : modèles d'ordre du jour ; qui rédige et valide le compte rendu.

### Tableau de bord du cadre et rapport d'activité (proposition retenue par le porteur, 13 novembre 2026)

- **Fonctionnement envisagé** : indicateurs croisés lus à la volée dans les modules, selon les droits du cadre : occupation et places disponibles, durées de séjour, mesures d'isolement et de contention (statistiques d'Isocont), absences et remplacements, délais de traitement des demandes de travaux, contrôles en retard ; période réglable ; **rapport d'activité annuel** prêt à imprimer, complété par le cadre ; chiffres agrégés seulement, sans nom de patient.
- **À trancher** : indicateurs par défaut ; vue pour le cadre supérieur de santé (pôle) et la direction des soins.

## Écartée pour l'instant

### Agenda : échéances des certificats légaux

Calcul des échéances des certificats médicaux des soins sans consentement (24 heures, 72 heures, huitième jour, mensuels…) à partir du mode d'hospitalisation, affichées dans les alertes « à voir par le médecin ». Écarté pour l'instant (décision du porteur du 7 novembre 2026 : alertes saisies par l'équipe) ; règles à valider avec la direction des affaires juridiques avant tout développement.
