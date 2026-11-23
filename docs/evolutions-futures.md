# Évolutions futures

Évolutions étudiées avec le porteur du projet et gardées pour plus tard. Elles ne font pas partie du périmètre soumis à validation (fiche projet) ; chacune reste à retravailler et à valider avant tout développement. **Ne restent ici que les parties non faites** : le document a été nettoyé le 13 novembre 2026, puis le 23 novembre 2026 (version 0.88.3), à la demande du porteur. Le détail de ce qui est fait est dans `CHANGELOG.md` et `docs/historique-decisions.md`.

## Lots de développement

Depuis le 13 novembre 2026, un avis ne bloque plus le développement : une fonction soumise à avis est développée, livrée désactivée et rangée dans l'onglet « Validations » de l'administration, par interlocuteur (règles : `CLAUDE.md` § 2). La colonne « Avis préalable » dit donc quel avis l'établissement devra obtenir pour l'activer.

### État au 23 novembre 2026

Les cinq phases du plan d'action du 13 novembre 2026 sont réalisées (versions 0.46 à 0.69, stable 0.70.0), ainsi que les contrôles périodiques (0.86.0), les audits internes (0.87.0 et 0.88.0) et les suites du test de charge sur la connexion, le recalcul et la mémoire (0.85.0). **Lots entièrement réalisés, retirés du document** : A (liens entre modules, barre des modules avec favoris, échanges d'agenda par fichier .ics), B (surveillance et contrôle des chambres de soins intensifs, module Contrôles), I (dossiers, étiquettes, favoris et liens avec une tâche). **Parties réalisées retirées des autres lots** : formations et heures supplémentaires (C), suivi des modifications de la mise en forme des paragraphes et modèles remplis automatiquement (D), rôles selon le service, cadre supérieur suivant un pôle et réglages du Suivi médical ouverts au cadre et aux médecins chefs (E), entretiens des agents et droit d'accès des modules arrêtés (F), accès réglable, bris de glace, feuille de staff et notes cliniques (G), versions stable, bêta et développement et messageries Zimbra sans connexion (H), contrôles périodiques (K), recherche partout (N), retours des agents et mesure d'usage (O), audits internes et formalités d'admission et de sortie (P).

**Gardé pour plus tard** (à développer sur demande du porteur) : reliquats des lots C, D, E et F ; module Signalement et export du droit d'accès des agents (F) ; colonnes cliniques de la Vue d'ensemble (G) ; lot H hors canaux ; effets personnels, tabac et argent de poche (K) ; étudiants, intégration, tableau de bord (L) ; formulaires sur mesure, indicateur d'activité (M) ; écran du poste de soins, accessibilité, modèles partagés (N) ; import automatique de la liste des patients (O) ; plans d'action (P) ; montée en charge (R).

**Écartées pour le moment** : trame et roulement du personnel, remplacements (J) ; réunions, questionnaire de sortie (L) ; renforts entre services (M) ; commandes et stocks, matériel remis par poste, budget des activités (Q) ; échéances des certificats légaux (fin du document). Elles restent décrites ci-dessous.

| Lot | Reste à faire | Avis préalable | Ampleur |
| --- | --- | --- | --- |
| **C. Temps de travail** | Articulation avec le logiciel de gestion du temps de travail : mode « planification seulement », lecture de ses exports (comparaison des soldes, pointage de l'étape « Enregistré »), export réglable pour la saisie | Délégué à la protection des données (imports et exports de données du personnel) | Moyenne |
| **D. Documents, suite** | Graphiques dans l'export et l'import Excel ; fichiers joints (PDF, scans) avec ouverture sans téléchargement ; photos jointes aux demandes de travaux | Fichiers joints : responsable de la sécurité informatique (politique de sécurité de la page) ; photos : délégué à la protection des données | Petite (graphiques) à moyenne |
| **E. Rôles et droits, suite** | Droits par domaine des référents (si un établissement le demande) ; administrateur de garde limité à ses périodes de garde | Responsable de la sécurité informatique pour ce qui change la remise des clés | Petite à moyenne |
| **F. Données du personnel et conformité** | Notes libres du cadre sur un agent (si le porteur le souhaite) ; export du droit d'accès des agents ; module Signalement (lanceur d'alerte) | Délégué à la protection des données ; direction des ressources humaines ; direction juridique (signalement) | Moyenne à grande |
| **G. Données cliniques** | Colonnes cliniques dans la Vue d'ensemble ; import depuis l'export du DPI plutôt qu'une saisie en double | Ceux de la fonction « données cliniques » (délégué, responsable de la sécurité informatique, direction des soins, commission médicale) | Petite à moyenne |
| **H. Socle, déploiement et liens avec le système d'information** | Connexion rapide (plusieurs clés par agent, carte CPS, badge FIDO2, code PIN sur poste personnel) ; protection du dossier de données contre les modifications et suppressions accidentelles ; connexion avec la session Windows ; stockage sur un partage autre que SMB ; messageries Zimbra en connexion directe et synchronisation avec Exchange ou Microsoft 365 | Service informatique (DSI ou direction du numérique, selon l'établissement), responsable de la sécurité informatique (RSSI) ; Zimbra et Exchange : délégué à la protection des données | Moyenne à grande |
| **J. Planning du personnel et remplacements** *(écarté pour le moment)* | Trame et roulement des agents par cycle, effectif minimum par poste et alerte de sous-effectif ; postes à pourvoir après une absence, appel aux volontaires, suivi des remplacements | Délégué à la protection des données ; direction des ressources humaines | Grande |
| **K. Effets personnels** | Inventaire des effets personnels des patients (dépôt, retrait, restitution, à deux agents) ; tabac et argent de poche gérés par le service (distributions, solde) | Délégué à la protection des données (données liées au patient, non cliniques) | Moyenne |
| **L. Encadrement, réunions et pilotage** | Stages des étudiants et parcours d'intégration des nouveaux arrivants ; tableau de bord du cadre et rapport d'activité annuel ; *écartés pour le moment* : réunions, questionnaire de sortie anonyme | Étudiants et nouveaux arrivants : délégué à la protection des données ; tableau de bord : aucun s'il ne montre que des chiffres agrégés | Petite à moyenne |
| **M. Formulaires, renforts et activité** | Formulaires et demandes créés par le cadre, avec leur circuit de validation ; indicateur d'activité du poste ; *écartés pour le moment* : renforts entre services | Aucun (rappel « aucune donnée clinique » à la création d'un formulaire) | Moyenne |
| **N. Affichage, accessibilité et partage** | Écran du poste de soins en lecture seule ; accessibilité (clavier, lecteur d'écran, audit RGAA, déclaration) ; modèles partagés entre établissements | Écran du poste : responsable de la sécurité informatique et délégué à la protection des données ; autres : aucun | Moyenne |
| **O. Réussir le pilote** | Import automatique de la liste des patients depuis un dossier de dépôt | Service informatique et délégué à la protection des données, et décision du porteur sur la règle des fichiers importés | Moyenne |
| **P. Qualité** | Plans d'action (un écart d'audit pourra créer une action) | Aucun | Petite à moyenne |
| **Q. Logistique du service** *(écarté pour le moment)* | Commandes et stocks ; matériel remis par poste ; budget des activités | Aucun ; budget : règles de la régie de l'établissement | Petite à moyenne |
| **R. Montée en charge** | Chargement par année, vérification des signatures gardée sur le poste, quotas, espacement des versions, garde-fou, tableau de la place occupée, lecture complète du partage, regroupement des mois clos | Responsable de la sécurité informatique pour la vérification gardée sur le poste | Petite à moyenne |

Dépendances : la connexion avec la session Windows et Zimbra en connexion directe (H) supposent un hébergement sur le serveur interne, après la phase pilote sur GitHub. Le lot J s'appuie sur le module Congés et sur les Formations et Heures supplémentaires ; l'indicateur d'activité (M) nourrit l'effectif minimum (J) et le tableau de bord (L) ; les formulaires (M) reprennent les champs ajoutés communs ; les modèles partagés (N) reprennent l'export des réglages ; les plans d'action (P) reprennent « Mes tâches » et les écarts des audits.
## C. Temps de travail

### Articulation avec le logiciel de gestion du temps de travail de l'établissement (13 novembre 2026)

Tessera doit convenir à **tout établissement**, quel que soit son logiciel de gestion du temps (AgileTime, Octime, Horoquartz, solution maison…) et la façon dont il est utilisé. Ce logiciel reste **la référence** (avertissement réglable, déjà en place dans le module Congés) ; Tessera ne s'y connecte jamais directement (aucune connexion sortante) et ne remplace ni la paie, ni le pointage. Cas particulier du CHHA : AgileTime, sans accès des agents (« self-service ») ni pointeuse ; les congés et les heures sont saisis par l'encadrement ou le secrétariat.

*Réalisé : étape « enregistrée dans le logiciel de gestion du temps » des Formations (0.64.0) ; heures payées à saisir en priorité dans ce logiciel et export des Heures supplémentaires (0.65.0) ; avertissement réglable des Congés.* Restent, à généraliser aux trois domaines :

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

## D. Documents, suite

### Graphiques du tableur : export et import Excel (reliquat, décision du porteur du 14 novembre 2026)

*Réalisé : graphiques du tableur (0.61.0 : histogramme, courbes, secteurs, impression) ; export de chaque graphique en PDF (0.78.0).* Reste : graphiques repris dans l'export et l'import Excel (`.xlsx`), et dans l'export PDF de la feuille entière s'il ne les reprend pas déjà (à vérifier au moment du développement).

### Fichiers joints (étudiés le 6 novembre 2026)

*Réalisé : module Documents (0.34.0 à 0.42.0) et modèles remplis automatiquement (phase 3). Restent :*

- **Fichiers joints** (PDF, scans, images) rattachés à une fiche patient ou à une mesure : décision ou ordonnance du juge des libertés et de la détention (JLD), avis d'audience, accusé de réception d'une saisine ; décision de tutelle ou de curatelle ; compte rendu rattaché à l'agenda. Chiffrés comme les documents ; **aucun document clinique** (observations, comptes rendus médicaux, courriers médicaux : ils relèvent du DPI).
- **Ouverture sans téléchargement** : fichier déchiffré en mémoire et affiché dans le navigateur (PDF dans la visionneuse d'Edge et de Chrome, images) ; aucune copie en clair écrite sur le poste. Demande d'assouplir légèrement la politique de sécurité de la page (affichage de fichiers créés en mémoire), **sans ouvrir aucune connexion réseau** : avis du responsable de la sécurité informatique (RSSI).
- **Téléchargement** : droit distinct, tracé ; un document affiché peut toujours être imprimé ou capturé (Tessera protège le stockage et les accès, pas l'usage qu'une personne autorisée fait de ce qu'elle voit).
- **À trancher** : taille maximale d'un fichier et place totale par service (sauvegardes, copie locale des postes) ; durée de conservation des fichiers joints ; avis du délégué à la protection des données sur ce traitement.

### Demandes de travaux : photos jointes (11 novembre 2026)

Joindre une photo à une demande de travaux (fuite, dégradation). Stockage chiffré des images comme dans les documents ; **risque de photographier un patient** à étudier avec le délégué à la protection des données (rappel à la prise de vue, recadrage, droit de suppression).

## E. Rôles et droits, suite

- **Référents : droits par domaine** (par exemple le référent pharmacie confirme les demandes de travaux de la pharmacie), à décider domaine par domaine ; aujourd'hui la mention seulement. **Décision du porteur (14 novembre 2026)** : à voir selon l'établissement ; rien n'est développé tant qu'un établissement ne le demande pas.
- **Administrateur de garde : limitation aux périodes de garde** (planning des gardes), au lieu d'un rôle permanent ; option **désactivable, désactivée par défaut** (décision du porteur du 13 novembre 2026).
- Avis du responsable de la sécurité informatique pour tout ce qui change la remise des clés.

## F. Données du personnel et conformité

### Notes libres du cadre sur un agent (reliquat, demande du porteur du 8 novembre 2026)

*Réalisé : module Équipe (0.27.0, 0.28.0, 0.44.0) et entretiens des agents (0.66.0).* Reste, si le porteur le souhaite : notes libres du cadre sur un agent, **données de ressources humaines** (mêmes garanties que les entretiens : lecture par le cadre seul, partage choisi, avis du délégué à la protection des données et de la direction des ressources humaines, frontière avec le dossier administratif de l'agent).

### Export du droit d'accès des agents (décision du porteur du 15 novembre 2026)

- **Besoin** : un agent qui exerce son droit d'accès (RGPD) reçoit, en un export, les données le concernant tenues dans Tessera : fiche de l'Équipe et données ajoutées d'agent, congés et droits, formations, heures supplémentaires, entretiens partagés ou non, réservations de véhicules, saisies faites par lui (auteur au journal), données des fonctions désactivées (masquées mais conservées).
- **Règles déjà prévues** : les entretiens marqués « retiré de l'export du droit d'accès » par le cadre (éléments concernant d'autres agents, motif enregistré) en sont exclus ; les informations concernant un tiers sont à exclure (point à valider listé dans `CLAUDE.md` § 7).
- **À trancher** : qui produit l'export (administrateur, sur demande tracée ; le contenu chiffré pour le seul cadre impose que l'auteur, ou une clé de consultation tracée, l'ouvre) ; format (PDF lisible, plus un fichier de données) ; délai et traçabilité de la demande ; avis du délégué à la protection des données.

### Module Signalement (lanceur d'alerte, demande du porteur, 11 novembre 2026)

Permettre à un agent de signaler un fait (atteinte, manquement, danger) de façon confidentielle, avec un suivi par la personne chargée de recueillir les signalements.

- **Cadre légal** : procédure de recueil des signalements des lanceurs d'alerte (loi du 9 décembre 2016 dite « Sapin II », modifiée par la loi du 21 mars 2022) ; l'établissement a déjà sa procédure et son référent : Tessera ne la remplace pas, il peut seulement offrir un canal interne conforme à celle-ci. **À valider avec la direction juridique et le délégué à la protection des données avant tout développement.**
- **Confidentialité** : contenu chiffré pour le seul référent (sur le modèle du chiffrement réservé aux destinataires de la messagerie) ; **l'administrateur ne doit pas pouvoir lire**, ce que le trousseau actuel ne garantit pas (il détient toutes les clés) : clé hors du trousseau de l'administrateur à concevoir ; identité de l'auteur protégée, possibilité d'un signalement anonyme (limites : le journal en ajout seul garde l'auteur de chaque saisie) ; aucune consultation par le cadre.
- **Suivi** : accusé de réception, échanges entre l'auteur et le référent, retour sur les suites données, délais légaux ; journal des accès.
- **À trancher** : faisabilité au regard de l'anonymat et de l'administrateur ; à distinguer de la déclaration des événements indésirables (outil qualité de l'établissement).

## G. Données cliniques

*Réalisé (0.67.0 à 0.69.0, 0.78.0, 0.82.0) : rôles selon le service, accès réglable et bris de glace, module Données cliniques (feuille de staff, codes CIM et liste de référence importée par l'établissement, dépendance, notes cliniques), soumis à avis et livré désactivé.* Restent :

- **Colonnes cliniques dans la Vue d'ensemble** (codes CIM, motif, projet, dépendance), lues à la volée dans le module Données cliniques, selon les mêmes droits.
- **Import depuis l'export du DPI** plutôt qu'une saisie en double, à étudier (structure de l'export, place par rapport au DPI).

## H. Socle, déploiement et liens avec le système d'information

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

### Messageries Zimbra en connexion directe, synchronisation avec Exchange (demandes du porteur, 13 novembre 2026)

*Réalisé : option 1, sans connexion (boîtes du service dans l'annuaire, « Écrire à… », import d'un agenda .ics).* Restent :

- **Option 2 — connexion directe** (lire et envoyer depuis Tessera) :
  - lève le principe « aucune connexion sortante » pour une seule adresse, celle du serveur Zimbra interne (CSP `connect-src` limitée à ce serveur) ; configuration de Zimbra par le service informatique pour accepter les requêtes de Tessera ;
  - accès aux boîtes partagées : délégation Zimbra ou jeton d'accès plutôt que mots de passe gardés dans Tessera ; à trancher avec le responsable de la sécurité informatique (RSSI) ;
  - courriels affichés à la volée, jamais enregistrés dans Tessera (ils contiennent souvent des informations sur les patients ; aucune donnée clinique dans Tessera) ;
  - avis préalable du service informatique, du responsable de la sécurité informatique et du délégué à la protection des données (DPO, référent RGPD) ; mise à jour de la fiche technique.
- **Synchronisation avec Exchange ou Microsoft 365** (au lieu des échanges par fichier .ics) : suppose aussi un hébergement de Tessera sur un serveur interne et l'ouverture de `connect-src` à ce seul serveur ; même avis.

### Connexion rapide sans mot de passe : carte CPS, badge, code PIN (demande du porteur, 13 novembre 2026)

*Réalisé : connexion par clé de sécurité FIDO2 (WebAuthn, extension PRF), second facteur exigible par rôle et code de la clé exigible (0.75.0, livrés désactivés).* Restent :

- **Plusieurs clés par agent** (une de secours), relevé aussi par l'audit du 15 novembre 2026 ; essai avec une vraie YubiKey.
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

## K. Effets personnels des patients

### Inventaire des effets personnels des patients (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : tracer les objets déposés par un patient à l'admission ou pendant le séjour (argent, papiers, téléphone, objets retirés pour sa sécurité), leur retrait et leur restitution, aujourd'hui souvent sur papier et source de litiges.
- **Fonctionnement envisagé** : inventaire par séjour (fiche patient), une ligne par objet (description, lieu de rangement : coffre, vestiaire…) ; dépôt, retrait temporaire et restitution, chacun daté et validé par **deux agents** ; restitution à la sortie rappelée ; inventaire imprimable pour signature du patient ; aucun motif clinique (la raison d'un retrait d'objet reste dans le DPI).
- **À trancher** : argent et valeurs (souvent gérés par la régie de l'établissement : simple mention ou inventaire détaillé) ; durée de conservation après la sortie ; accès du patient à cet inventaire par le droit d'accès.

### Tabac et argent de poche gérés par le service (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : dans de nombreux services de psychiatrie, l'équipe garde et distribue le tabac ou l'argent de poche de certains patients, à leur demande ou selon le projet de soins ; le suivi est souvent tenu sur un cahier.
- **Fonctionnement envisagé** : par patient et par séjour, dépôts (paquets, somme), distributions datées (agent, quantité), **solde** affiché ; distribution rythmée par un rappel facultatif dans l'agenda ; validation à deux agents réglable pour l'argent ; relevé imprimable pour le patient ou son représentant ; même mécanisme que l'inventaire des effets personnels.
- **Aucune donnée clinique** : ni motif de la gestion par l'équipe, ni lien avec un traitement ; ces éléments restent dans le dossier patient informatisé (DPI).
- **À trancher** : articulation avec la régie de l'établissement et les mesures de protection juridique (curatelle, tutelle) ; réglage du rythme et des quantités par patient ou simple trace ; avis du délégué à la protection des données.

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

### Questionnaire de sortie anonyme (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : recueillir l'avis des patients sur leur séjour (accueil, information, respect de l'intimité, activités, repas), souvent sur papier et rarement exploité.
- **Fonctionnement envisagé** : questionnaire réglable par l'établissement (modèle proposé), rempli par le patient sur une tablette ou un poste du service en **mode anonyme** (aucun compte, aucune identité, aucun lien avec la fiche patient, heure arrondie au jour), puis l'écran revient à l'accueil ; réponses chiffrées avec la clé du service ; résultats agrégés au tableau de bord du cadre, seulement au-delà d'un nombre minimal de réponses, pour qu'on ne puisse pas reconnaître un patient.
- **À trancher** : articulation avec le questionnaire national de satisfaction ou celui de l'établissement (ne pas faire doublon) ; réponses libres (risque d'identification ou de contenu clinique) ; verrouillage du poste pendant la saisie.

## M. Formulaires, renforts et activité

### Formulaires et demandes sur mesure (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : beaucoup de petites demandes du service (matériel, changement de poste, proposition d'activité, demande de documentation…) n'appellent pas chacune un module. Le cadre les crée lui-même, ce qui adapte Tessera à tout établissement sans développement.
- **Fonctionnement envisagé** :
  - le cadre (ou l'administrateur pour l'établissement) crée un **formulaire** à partir des types des champs ajoutés communs (texte, date ou période, choix, choix multiple, case à cocher, nombre, liste d'agents ou de salles) ;
  - **circuit de validation** réglable : une ou plusieurs étapes (cadre, cadre supérieur, secrétaire…), avec accord, refus motivé ou demande de précision ; l'auteur suit l'état de sa demande ;
  - qui peut remplir et qui voit les demandes : par rôle et par service ; pastille pour les demandes à traiter ; tableau des demandes, filtres, export ;
  - action possible à la validation : tâche dans « Mes tâches », rendez-vous dans l'agenda, message à l'auteur ;
  - chaque demande et chaque décision est une saisie du journal du module, chiffrée avec sa clé.
- **Aucune donnée clinique** : rappel à la création du formulaire et à la saisie ; pas de rattachement à un patient dans un premier temps.
- **À trancher** : formulaires communs à l'établissement et propres à un service ; modèles proposés par défaut ; durée de conservation des demandes.

### Renforts entre services (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : chiffrer les renforts donnés et reçus pour argumenter les effectifs auprès du pôle et de la direction des soins.
- **Fonctionnement envisagé** : saisie d'un renfort (date, poste, durée, nombre d'agents par rôle, service donneur et receveur, motif choisi dans une liste : sous-effectif, accompagnement, situation de violence, surveillance renforcée…) ; aucun nom de patient ; nom des agents facultatif (réglage) ; totaux par période et par service, au tableau de bord.
- **À trancher** : saisie par le service donneur, receveur ou les deux (avec rapprochement) ; liste des motifs par défaut ; lien avec les remplacements (lot J) et les heures supplémentaires (lot C).

### Indicateur d'activité du poste (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : objectiver l'activité d'un poste à partir de ce que Tessera sait déjà, sans nouvelle saisie.
- **Fonctionnement envisagé** : pour chaque poste et chaque jour, un relevé calculé à la volée : entrées et sorties, accompagnements et permissions, mesures d'isolement et de contention en cours, transferts, renforts reçus, contrôles faits ; pondérations réglables par le cadre pour un indicateur synthétique ; mis en regard de l'effectif présent (lot J) ; affiché au tableau de bord.
- **Aucune donnée clinique** : l'indicateur ne mesure pas la charge en soins (qui relève du dossier de soins) mais l'activité d'organisation ; à présenter comme tel.
- **À trancher** : éléments retenus par défaut ; pondérations ; affichage par agent (proposé : non).

## N. Affichage, accessibilité et partage

### Écran du poste de soins (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : afficher en continu, sur un écran du poste de soins, ce que l'équipe consulte sans cesse : tâches du poste, rendez-vous et accompagnements du jour, places disponibles, contrôles à faire.
- **Fonctionnement envisagé** : mode « affichage » ouvert par un agent, en lecture seule, réglé par le cadre (vues et blocs affichés) ; **identités réduites** (initiales et chambre, ou rien) quel que soit le réglage de l'agenda ; actualisation automatique ; verrouillage d'un geste et fermeture automatique à heure fixe ou à la fin du poste ; aucun bouton de saisie.
- **À trancher** : écran visible des patients et des visiteurs ou non (emplacement) ; compte dédié ou session d'un agent ; avis du responsable de la sécurité informatique et du délégué à la protection des données.

### Accessibilité (proposition retenue par le porteur, 13 novembre 2026)

*Réalisé (0.81.0) : contrastes conformes en thèmes clair et sombre, textes de 12 px au moins, noms lus par les outils d'accessibilité alignés sur le texte affiché. Reste le travail ci-dessous (constat J6 de l'audit du 15 novembre 2026).*

- **Besoin** : rendre Tessera utilisable au clavier seul, avec un lecteur d'écran, et lisible pour les agents malvoyants ou daltoniens. Les établissements publics ont des obligations d'accessibilité numérique, applications internes comprises (portée exacte à confirmer avec le service informatique de l'établissement) ; c'est aussi un argument pour la validation.
- **Fonctionnement envisagé** : audit des écrans selon le référentiel général d'amélioration de l'accessibilité (RGAA) ; navigation au clavier dans les fenêtres, onglets, tableaux et grilles ; libellés lus par les lecteurs d'écran ; contrastes vérifiés en thèmes clair et sombre ; couleurs jamais seules porteuses d'information (le noir et blanc avec symboles existe déjà pour l'impression) ; taille du texte réglable par l'agent ; tests automatiques ajoutés au parcours des écrans.
- **À trancher** : niveau visé ; déclaration d'accessibilité à publier.

### Modèles partagés entre établissements (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : dans l'esprit open source du projet, permettre à un établissement de reprendre ce qu'un autre a déjà construit.
- **Fonctionnement envisagé** : export en fichier d'un **modèle** (check-list de contrôle, vue de la Vue d'ensemble, formules, formulaire, rubriques des informations du service, données ajoutées, couleurs), sans aucune donnée de patient ni d'agent et sans nom d'établissement ; import avec aperçu et choix des éléments, comme l'import des réglages existant ; bibliothèque de modèles fictifs dans le dépôt, alimentée par les établissements qui le souhaitent.
- **À trancher** : format et version des modèles (compatibilité entre versions de Tessera) ; relecture des modèles proposés avant leur ajout au dépôt public.

## O. Réussir le pilote

### Import automatique de la liste des patients (proposition retenue par le porteur, 13 novembre 2026)

- **Besoin** : éviter l'import à la main de l'export du dossier patient informatisé (DPI), pour que la liste des patients soit à jour à chaque prise de poste.
- **Fonctionnement envisagé** : le service informatique dépose à heure fixe l'export du DPI dans un **dossier de dépôt** du partage, distinct du dossier de données ; à la connexion d'un agent qui a le droit d'importer, Tessera lit le fichier (modèle d'import mémorisé), montre les changements (entrées, sorties, changements de chambre) et les applique après confirmation, ou d'office si le réglage le permet ; aucune connexion sortante.
- **Point de principe** : la règle actuelle veut que les fichiers importés soient lus dans le navigateur et jamais copiés sur le partage. Ici le fichier, **en clair**, est déposé sur le partage par le service informatique (pas par Tessera) : à décider par le porteur, avec des garanties (dossier aux droits restreints, fichier remplacé à chaque dépôt, suppression après lecture si possible, contenu limité aux colonnes utiles).
- **À trancher** : fréquence du dépôt ; application d'office ou après confirmation ; avis du service informatique et du délégué à la protection des données.

## P. Qualité

### Plans d'action (proposition retenue par le porteur, 13 novembre 2026)

- Actions d'amélioration du service (suite d'un audit, d'une visite de certification, d'un retour d'expérience, d'un projet de service), avec origine, responsable, échéance, avancement et preuve jointe (document) ; chaque action peut devenir une tâche de « Mes tâches » ; vue d'ensemble pour le cadre et le cadre supérieur ; export. Aucun contenu d'événement indésirable (il reste dans l'outil de déclaration de l'établissement) : seulement le numéro et l'action décidée.
- **Lien avec les audits internes** (0.87.0) : un écart pourra créer une action d'un plan d'action (aujourd'hui, il est ajouté à « Mes tâches »).

## Q. Logistique du service

### Commandes et stocks (proposition retenue par le porteur, 13 novembre 2026)

- **Fonctionnement envisagé** : listes types par circuit (magasin, dotation de pharmacie, linge, fournitures de bureau), avec quantité habituelle et seuil ; inventaire rapide (quantités restantes), commande proposée et **prête à imprimer ou à exporter** (aucun envoi automatique) ; jour de commande rappelé dans l'agenda ; suivi des livraisons et des manquants ; **péremptions** signalées (lien avec les contrôles périodiques du lot K).
- **Aucune donnée clinique** : dotation de service seulement, aucun traitement nominatif.
- **À trancher** : circuits retenus ; qui commande (rôle) ; articulation avec le logiciel de commande de l'établissement.

### Matériel remis par poste (proposition retenue par le porteur, 13 novembre 2026)

- **Fonctionnement envisagé** : liste du matériel du service remis aux agents à la prise de poste (trousseaux de clés, téléphones, dispositifs d'alarme du travailleur isolé, badges) ; remise et restitution d'un geste, par l'agent ; matériel non restitué signalé en fin de poste ; matériel en panne signalé, avec lien possible vers une demande de travaux ; historique.
- **À trancher** : remise nominative ou par poste ; durée de conservation de l'historique.

### Budget des activités (proposition retenue par le porteur, 13 novembre 2026)

- **Fonctionnement envisagé** : enveloppe annuelle des activités et sorties thérapeutiques ; dépenses par activité (date, objet, montant, justificatif joint quand les fichiers joints existeront, lot D) ; solde et consommation par période ; avances et retours de monnaie validés à deux agents ; export pour la régie.
- **À trancher** : règles de la régie de l'établissement ; lien avec les activités de l'agenda.

## R. Montée en charge et place sur le partage (test de charge du 16 novembre 2026)

Suites du test de charge (`docs/test-de-charge.md`), versées ici à la demande du porteur du 16 novembre 2026. La version 0.85.0 a déjà traité la connexion, le recalcul et la mémoire.

### Chargement par année

- **Fonctionnement envisagé** : chaque poste charge l'année en cours et la précédente ; les années plus anciennes sont lues à la demande, pour le registre, les statistiques et le droit d'accès. La fiche patient garde ce qu'il faut de l'historique (séjours, modes).
- **Pourquoi** : la mémoire et le temps de connexion croissent avec le nombre de services et d'années, car chaque poste charge tout l'établissement. Vers 10 services sur 5 ans (2,6 millions de saisies), il faudrait environ 2,8 Go, près de la limite d'un onglet de navigateur.
- **À trancher** : à décider avant un déploiement de plus de quelques services ; autre possibilité : un dossier par pôle.

### Vérification des signatures gardée sur le poste

- **Fonctionnement envisagé** : le poste garde l'empreinte des saisies déjà vérifiées ; à la connexion suivante, seules les saisies nouvelles ou modifiées sont vérifiées.
- **Gain attendu** : connexion beaucoup plus courte au bout de quelques années.
- **À trancher** : choix de sécurité à soumettre au responsable de la sécurité informatique (où garder ces empreintes, comment empêcher leur falsification sur le poste).

### Quotas des documents et des pièces jointes

- **Fonctionnement envisagé** :
  - **par agent**, réglable par l'administrateur : place des versions de documents, des images et des pièces jointes sur un mois glissant (proposé : 200 Mo), message à 80 %, puis refus d'une nouvelle version ou pièce, sans rien perdre de ce qui est en cours ;
  - **par service** (proposé : 2 Go par an), avec une alerte à l'administrateur et au cadre ;
  - **exceptions** par agent, rôle sans quota ;
  - **jamais de quota** sur Isolement et contention, les décisions du juge, les fiches patient, les congés et les heures.
- **Pourquoi** : les saisies ordinaires ne pèsent presque rien ; seuls les documents (un gros classeur modifié toute une journée peut écrire plusieurs centaines de Mo) et les pièces jointes peuvent remplir le partage.
- **À trancher** : valeurs par défaut ; agents et rôles exemptés.

### Espacement des versions des gros documents

- **Fonctionnement envisagé** : au-delà de 200 Ko, enregistrement automatique au plus toutes les 2 minutes (l'enregistrement manuel reste immédiat).
- **Gain attendu** : place d'un gros classeur divisée par 8, sans quota.

### Garde-fou anti-emballement

- **Fonctionnement envisagé** : au-delà d'un débit anormal (proposé : 2 000 saisies par heure pour un même agent), les saisies non dues sont suspendues et l'administrateur est alerté ; les saisies dues (Isolement et contention, juge) ne sont jamais bloquées.

### Tableau de la place occupée

- **Fonctionnement envisagé** : pour l'administrateur (*Sauvegardes et exports*), place occupée par module, par service, et par agent pour les documents et les pièces jointes, avec son évolution et une alerte avant la limite du partage.

### Lecture complète du partage

- **À mesurer sur place** avec le service informatique : la lecture complète, toutes les 10 minutes, liste tous les fichiers (2,6 millions à 10 services sur 5 ans).
- **Piste** : lecture complète des 3 derniers mois toutes les 10 minutes, et de tout l'historique une fois par jour.

### Regroupement des mois clos

- **Fonctionnement envisagé** : les fichiers des mois clos rangés dans une archive unique, pour diviser le nombre de fichiers (sauvegarde, antivirus, copie de secours) et la place perdue en blocs de 4 Ko (place occupée 4 fois le contenu).
- **À trancher** : touche au principe « fichiers jamais modifiés » ; décision à prendre avec le service informatique et le responsable de la sécurité informatique.

## Écartée pour l'instant

### Agenda : échéances des certificats légaux

Calcul des échéances des certificats médicaux des soins sans consentement (24 heures, 72 heures, huitième jour, mensuels…) à partir du mode d'hospitalisation, affichées dans les alertes « à voir par le médecin ». Écarté pour l'instant (décision du porteur du 7 novembre 2026 : alertes saisies par l'équipe) ; règles à valider avec la direction des affaires juridiques avant tout développement.
