# Évolutions futures

Évolutions étudiées avec le porteur du projet et gardées pour plus tard. Elles ne font pas partie du périmètre soumis à validation (fiche projet) ; chacune reste à retravailler et à valider avant tout développement.

| Évolution | Origine | Niveau | Ampleur du développement |
| --- | --- | --- | --- |
| Documents et outils de bureautique | Tessera Santé, 6 novembre 2026 | Idée à retravailler | Grande |
| Connexion avec la session Windows | Suivi-mesures-isocont, 2 novembre 2026 | Étude technique faite, à adapter au socle | Moyenne (dépend du service informatique) |
| Stockage sur un partage autre que SMB | Suivi-mesures-isocont, 2 novembre 2026 | Demande, à étudier | Moyenne à grande |
| Rangement des saisies par jour sur le partage | Test de charge, 11 novembre 2026 | À décider après un essai sur le partage de l’établissement | Moyenne |
| Agenda : échéances des certificats légaux | Tessera Santé, 7 novembre 2026 | Écartée pour l'instant | Petite à moyenne (règles juridiques à valider) |
| Module Messagerie | Tessera Santé, 8 novembre 2026 | **Réalisé en 0.23.0**, chiffrement réservé aux destinataires en 0.24.0 | Moyenne |
| Module Demandes de travaux et de réparation | Tessera Santé, 8 novembre 2026 | **Réalisé en 0.22.0** | Moyenne |
| Demandes de travaux : photos jointes | Tessera Santé, 11 novembre 2026 | Piste : stockage chiffré des images, risque de photographier un patient à étudier avec le délégué à la protection des données | Moyenne |
| Planning d'occupation des bureaux | Tessera Santé, 8 novembre 2026 | **Réalisé en 0.25.0** (module Salles et bureaux) | Petite à moyenne |
| Feuille de staff : codes CIM, motif d'hospitalisation, projet thérapeutique, codage de la dépendance | Tessera Santé, 8 et 11 novembre 2026 | Feuille de staff réalisée en 0.19.0 sans ces colonnes ; **données cliniques** (décision préalable ; option « donnée clinique » par donnée disponible) | Petite (liste CIM à embarquer) |
| Notes par patient : notes cliniques | Tessera Santé, 8 novembre 2026 | Notes organisationnelles réalisées en 0.19.0 ; **données cliniques** (décision préalable) | Petite |
| Module Agents (fiches des agents et des psychiatres) | Tessera Santé, 8 novembre 2026 | Demande, à préciser ; une première fiche agent avec données ajoutées existe depuis la 0.20.0 ; **données du personnel** (avis préalable) | Moyenne à grande |
| Planning des psychologues | Tessera Santé, 9 novembre 2026 | **Réalisé en 0.25.0** | Petite à moyenne |
| Rôles d'encadrement : cadre supérieur de santé, médecin chef de service, médecin chef de pôle | Tessera Santé, 8 et 11 novembre 2026 | **Réalisé en 0.27.2 et 0.27.3** (pôles, cadre supérieur, médecins chefs en lecture) ; reste : réglages du Suivi médical ouverts au cadre et aux médecins chefs | Moyenne |
| Tri des colonnes d'un tableau par clic sur le titre | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.26.0** (avec filtre rapide, taille d'affichage, hauteur des lignes, raccourcis clavier) | Petite |
| Liste de tâches personnelle, reliée aux autres modules | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.26.3** (« Mes tâches ») | Moyenne |
| Page d'accueil de l'administration : modules activés ou désactivés | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.26.1** | Petite |
| Informations du service | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.26.2** (livret d'accueil : plus tard) | Petite à moyenne |
| Rôles de référents (escarres, pharmacie, restriction des libertés…) | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.27.1** (liste et contact) ; reste : droits par domaine | Moyenne |
| Rôles d'intervenants extérieurs, informations limitées | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; touche aux clés et aux droits (avis du responsable de la sécurité informatique) | Moyenne |
| « Information d'un tiers » dans la messagerie et les données patient ; vérification avant l'export du droit d'accès | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; **règle d'exclusion à valider** (délégué à la protection des données) | Moyenne |
| Module Demandes de congés | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; **données du personnel** (avis du délégué à la protection des données) | Grande |
| Prêt de droits pendant une absence | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; touche aux clés et aux droits (avis du responsable de la sécurité informatique) | Moyenne |
| Module Signalement (lanceur d'alerte) | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; **cadre légal et confidentialité renforcée** (avis du délégué à la protection des données et de la direction juridique) | Moyenne à grande |
| Fiches agents : téléphones et courriels professionnels et personnels ; numéro professionnel accessible dans les autres modules | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.27.0** (module Équipe) ; reste : fiche de contact à brancher dans l'agenda, les salles, la messagerie ; complète le module Agents ; **données du personnel** (coordonnées personnelles : avis du délégué à la protection des données) | Petite à moyenne |
| Rôles « Administrateur de garde » et « Directeur des soins », accès réglables | Tessera Santé, 11 novembre 2026 | **Réalisé en 0.27.3** (identité en initiales pour l'administrateur de garde) ; reste : périodes de garde | Petite à moyenne |
| Accès aux données cliniques réglable par rôle et par service, limité aux patients présents, « bris de glace » | Tessera Santé, 11 novembre 2026 | Demande, à préciser ; suppose la levée de la règle « aucune donnée clinique » ; touche aux clés (avis du responsable de la sécurité informatique) | Moyenne à grande |
| Isocont : tâche de surveillance de la CSI dans l'agenda | Tessera Santé, 11 novembre 2026 | Demande, à préciser | Petite à moyenne |
| Contrôle de conformité des CSI libres, une fois par poste, par deux agents, avec check-list | Tessera Santé, 11 novembre 2026 | Demande, à préciser (contenu de la check-list) | Moyenne |


## Lots proposés (11 novembre 2026)

Regroupement des évolutions encore ouvertes, pour choisir le prochain lot. Un lot « sans avis préalable » peut être développé tout de suite (données fictives, options désactivées par défaut) ; les autres attendent une décision ou un avis avant le développement, même si leur étude peut commencer.

| Lot | Contenu | Avis préalable | Ampleur |
| --- | --- | --- | --- |
| **A. Confort et accueil** | Tri des colonnes ; page d'accueil de l'administration (modules activés ou désactivés) ; informations du service ; liste de tâches personnelle reliée aux autres modules | Aucun | Moyenne |
| **B. Chambres de soins intensifs (CSI)** | Tâche de surveillance de la CSI (Isocont) dans l'agenda ; contrôle de conformité des CSI libres par poste, à deux agents, avec check-list | Aucun pour les rappels et la check-list (aucune donnée clinique) ; check-list à rédiger avec le porteur | Moyenne |
| **C. Équipe et rôles** | Fiches agents (téléphones, courriels, numéro professionnel dans les autres modules) ; référents par domaine avec contact direct ; rôles d'encadrement (cadre supérieur, médecins chefs de service et de pôle) ; administrateur de garde ; directeur des soins | Coordonnées personnelles et données des agents : délégué à la protection des données ; le reste sans avis | Grande (peut être découpé : C1 fiches et référents, C2 rôles) |
| **D. Accès particuliers** | Intervenants extérieurs aux informations limitées ; prêt de droits pendant une absence | Responsable de la sécurité informatique (clés et droits) | Moyenne |
| **E. Droit d'accès des patients** | Case « information d'un tiers » (messagerie, données patient) ; vérification avant l'export du droit d'accès | Délégué à la protection des données (règle d'exclusion) | Moyenne |
| **F. Données cliniques** | Accès réglable par rôle et service, limité aux patients présents, « bris de glace » ; feuille de staff (CIM, motif, projet thérapeutique, dépendance) ; notes cliniques | Levée de la règle « aucune donnée clinique », délégué à la protection des données (analyse d'impact), responsable de la sécurité informatique, direction des soins, commission médicale d'établissement | Grande |
| **G. Nouveaux modules du personnel et de l'établissement** | Demandes de congés ; signalement (lanceur d'alerte) | Délégué à la protection des données, direction des ressources humaines, direction juridique | Grande |
| **H. Socle technique et documents** | Rangement des saisies par jour (après essai sur le partage) ; connexion avec la session Windows ; stockage autre que SMB ; documents et outils de bureautique ; photos jointes aux demandes de travaux | Service informatique ; photos : délégué à la protection des données | Grande |

Dépendances : le contact direct des référents (C) s'appuie sur le numéro professionnel des fiches agents ; le « bris de glace » (F) suppose le modèle des rôles et des services de C ; le prêt de droits (D) et les rôles de garde (C) gagnent à être conçus ensemble. Écartée pour l'instant : échéances des certificats légaux dans l'agenda.

*Réalisés dans la 0.19.0 (module Vue d'ensemble, `docs/architecture.md` § 7 quinquies) : la **feuille de staff** sans données cliniques (vue partagée, colonnes réglables, places disponibles, sorties prévues, feuille préparée, complétée puis close en instantané conservé) et des **notes datées par patient** comme donnée ajoutée (rubriques réglables par service et par rôle, notes courtes et organisationnelles). Restent ci-dessous les codes CIM et le projet thérapeutique (données cliniques).*

*Réalisés dans la 0.17.0 (module Suivi médical, `docs/architecture.md` § 7 quater) : planning des présences médicales, suivi des entretiens médicaux et des contrats de soins (dates seulement), patients suivis par médecin.*

**Règle « aucune donnée clinique ».** Deux demandes du 8 novembre 2026 (feuille de staff avec codes CIM et projet thérapeutique, notes par patient) portent sur des **données cliniques**, que Tessera exclut aujourd'hui (le dossier patient informatisé, DPI, reste la référence clinique). Avant tout développement, il faudra : une décision explicite du porteur de lever cette règle pour ces modules ; l'avis du délégué à la protection des données (DPO, référent RGPD), avec une analyse d'impact (AIPD) mise à jour ; l'avis du responsable de la sécurité informatique (RSSI) et du service informatique (DSI ou direction du numérique, selon l'établissement), y compris sur l'hébergement (partage du réseau de l'hôpital) et sur la sauvegarde ; l'accord de la direction des soins et de la commission médicale d'établissement (CME) sur le partage avec le DPI (risque de double saisie et de divergence). Le chiffrement par module et la clé remise aux seuls agents habilités s'appliqueraient comme ailleurs.

## Documents et outils de bureautique (étudiés le 6 novembre 2026)

*Idée à retravailler.*

**Besoin.** Mieux protéger les documents du service et les documents personnels des agents. La gestion des partages Windows laisse parfois à désirer dans les établissements : droits hérités ou trop larges, dossiers oubliés. Des documents sensibles peuvent alors être accessibles à des personnes qui n'ont pas à les lire.

**Ce que Tessera apporterait par rapport au partage**

- Chaque fichier est **chiffré sur le poste** avant d'être rangé sur le partage : copié hors de l'outil, il reste illisible.
- L'accès suit le **service et le rôle** de l'agent, plus finement que les droits Windows.
- **Chaque dépôt, consultation, téléchargement et suppression est tracé** au journal.
- Les versions précédentes d'un document sont conservées.

### Ce qui pourrait être rangé

| Espace | Contenu | Chiffrement |
| --- | --- | --- |
| Pièces jointes | Rattachées à une fiche patient ou à une mesure : décision ou ordonnance du JLD, avis d'audience, accusé de réception d'une saisine ; décision de tutelle ou de curatelle ; compte rendu rattaché à l'agenda | Clé du module concerné |
| Documents du service | Protocoles, procédures, plannings, comptes rendus de réunion, documents d'encadrement | Clé du module Documents, par service et par rôle |
| Documents personnels | Documents de travail propres à un agent | **Clé personnelle de l'agent** : illisibles pour tout autre compte, administrateur compris |

**Limite à poser d'emblée : aucun document clinique** (observations, comptes rendus médicaux, courriers médicaux). Ils relèvent du DPI.

### Ouvrir un document sans le télécharger

Le fichier est déchiffré **en mémoire** et affiché dans le navigateur ; aucune copie en clair n'est écrite sur le poste.

| Type de fichier | Ouverture dans l'outil |
| --- | --- |
| PDF | Oui, visionneuse intégrée à Edge et Chrome |
| Images, scans (JPEG, PNG) | Oui |
| Texte, CSV | Oui (CSV affiché en tableau) |
| Word (.docx) | Lecture seule, mise en page approximative, par une petite bibliothèque de conversion intégrée |
| Excel (.xlsx) | Lecture seule, valeurs sans mise en forme fine, même principe |
| PowerPoint, anciens formats (.doc, .xls) | Non : téléchargement nécessaire |

**Modifier un document Office** suppose de le télécharger : le navigateur ne peut pas confier un fichier à Word ou Excel sans l'écrire sur le disque. Circuit envisagé : télécharger, modifier, redéposer (l'ancienne version est gardée), supprimer la copie locale. Le téléchargement serait un **droit distinct**, tracé, avec un rappel de suppression au moment du redépôt.

### Outils de bureautique légers

Recréer un traitement de texte ou un tableur complet n'aurait pas de sens : travail considérable, contraire à la règle « sans dépendance » du projet, et en concurrence avec les logiciels de bureautique déjà présents. Trois outils légers, qui s'appuient sur les données de la plateforme, ont en revanche une vraie valeur :

1. **Modèles de documents remplis automatiquement** à partir des fiches patient et des mesures (courrier d'information du tiers, fiche de liaison, bordereau d'envoi au JLD), produits en PDF avec le papier à en-tête de l'établissement par le générateur PDF déjà écrit.
2. **Notes et documents de service** en texte mis en forme simplement (consignes, comptes rendus), avec historique des versions et verrouillage pendant la modification pour éviter les modifications simultanées.
3. **Tableaux simples** de suivi (listes à cocher, colonnes définies), sans formules complexes ; export vers Excel pour les calculs.

### Limites

- Un document affiché peut toujours être imprimé, capturé ou enregistré depuis la visionneuse PDF du navigateur : Tessera protège le stockage et les accès, pas l'usage qu'une personne autorisée fait de ce qu'elle voit.
- Les fichiers sont déchiffrés entièrement en mémoire : une **taille maximale** est à fixer (scans lourds, vidéos exclues).
- La place prise sur le partage, les sauvegardes et la copie locale des postes hors réseau augmente nettement : à dimensionner avec le service informatique.
- L'affichage des PDF et des images dans l'outil demande d'assouplir légèrement la politique de sécurité de la page (affichage de fichiers créés en mémoire), **sans ouvrir aucune connexion réseau**.
- Un espace de documents du service peut faire doublon avec l'intranet ou la gestion documentaire qualité de l'établissement : sa plus-value (chiffrement, droits par rôle, traçabilité) doit être présentée clairement.

### Questions à trancher

1. Ordre de priorité. Proposé : pièces jointes, puis modèles de documents, puis notes de service, puis espace de documents du service et documents personnels.
2. Documents personnels : perdus si l'agent perd ses moyens de connexion (confidentialité maximale), ou récupérables par le code de secours de l'établissement (plus sûr, moins confidentiel) ?
3. Lecture des fichiers Word et Excel dans l'outil : accepter deux petites bibliothèques libres, copiées dans le dépôt, vérifiées par empreinte et sans accès réseau (exception à la règle « sans dépendance ») ?
4. Taille maximale d'un fichier et place totale par service.
5. Durée de conservation des documents et des versions, et sort des documents personnels au départ d'un agent.
6. Avis du délégué à la protection des données sur ce nouveau traitement, et du responsable de la sécurité informatique sur l'assouplissement de la politique de sécurité de la page.

## Connexion avec la session Windows (étudiée le 2 novembre 2026)

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

## Stockage sur un partage autre que SMB (demande du porteur, 2 novembre 2026)

*Demande faite pour Suivi-mesures-isocont, reprise ici ; elle relève désormais du socle (couche de stockage commune à tous les modules).*

Demande : pouvoir enregistrer les données (ou le dossier de secours) ailleurs que sur un partage réseau Windows (SMB), par exemple un espace documentaire de l'établissement, un serveur WebDAV ou un stockage objet.

- **Contrainte actuelle** : l'outil n'écrit que dans un dossier ouvert par le navigateur (API *File System Access*), donc un dossier visible dans l'Explorateur : partage SMB, lecteur réseau, ou dossier synchronisé (client OneDrive / SharePoint, qui synchronise ensuite vers le serveur). Ce dernier cas fonctionne déjà dans Isocont, sous réserve de validation du service informatique (délais de synchronisation, conflits).
- **Partage accessible seulement par le web** (WebDAV, API d'une gestion électronique de documents) : il faudrait que la page envoie des requêtes à ce serveur, donc ouvrir la politique de sécurité (`connect-src` vers ce seul serveur, au lieu de `'none'`), gérer l'authentification (session Windows, jeton) et adapter le stockage du socle derrière une interface commune (lister, lire, écrire sans écraser). Les données resteraient chiffrées sur le poste avant l'envoi.
- **Lien avec les documents** : si l'évolution « Documents et outils de bureautique » est retenue, le volume stocké augmente ; le choix du support de stockage en tiendra compte.
- **À trancher avant développement** : type de partage visé par les établissements intéressés ; accord du responsable de la sécurité informatique sur l'ouverture de `connect-src` ; usage comme stockage principal ou seulement comme dossier de secours.

## Agenda : échéances des certificats légaux

Calcul des échéances des certificats médicaux des soins sans consentement (24 heures, 72 heures, huitième jour, mensuels…) à partir du mode d'hospitalisation, affichées dans les alertes « à voir par le médecin ». Écarté pour l'instant (décision du porteur du 7 novembre 2026 : alertes saisies par l'équipe) ; règles à valider avec la direction des affaires juridiques avant tout développement.

## Module Messagerie (demande du porteur, 8 novembre 2026) — réalisé en 0.23.0

*Réalisé en 0.23.0 avec les décisions du 11 novembre 2026 (`docs/a-documenter.md`) ; chiffrement réservé aux destinataires, consultation tracée et rôle auditeur prévus en 0.24.0.*

Échanger des informations d'organisation avec un ou plusieurs **groupes d'agents** (équipe de nuit, groupe de travail…, voir *Administration → Groupes d'agents*) ou **services**, sans passer par la messagerie de l'établissement. **Aucune donnée clinique**, comme dans les autres modules.

- **Destinataires** : un ou plusieurs services, un ou plusieurs groupes, des agents nommés ; un agent qui rejoint le groupe ou le service ensuite voit les messages encore en cours (réglage à trancher).
- **Accusé de lecture** selon le réglage (établissement, service ou message) : **automatique** à l'ouverture du message, ou **lecture à confirmer** par l'agent (« J'ai lu »). L'auteur voit qui a lu et qui n'a pas encore lu.
- **Message important** : il reste affiché (bandeau, pastille sur l'icône du module) et **ne sort de la liste qu'après la validation de lecture** par l'agent ; l'auteur ou le cadre voit les agents qui ne l'ont pas encore validé.
- **Fonctionnement** : journal `modules\messagerie\` en ajout seul (un message, une lecture, une validation = une saisie datée, jamais modifiée) ; clé propre ; lecture sur le partage, comme le reste de Tessera : pas d'envoi par courriel, pas de notification hors de l'outil.
- **À trancher avant développement** : durée de conservation des messages et des accusés ; possibilité de répondre (fil de discussion) ou information descendante seulement ; pièces jointes (liées à l'évolution « Documents ») ; rôles qui peuvent écrire à tout l'établissement ; lien avec l'information du cadre et de la secrétaire déjà faite par le module Véhicules (pré-réservation remplacée).

## Module Demandes de travaux et de réparation (demande du porteur, 8 novembre 2026) — réalisé en 0.22.0

*Réalisé en 0.22.0 avec les décisions du 11 novembre 2026 (`docs/a-documenter.md`). Reste une piste : joindre une photo à une demande (stockage chiffré des images ; avis du délégué à la protection des données sur le risque de photographier un patient).*

Bons de travaux par service, **visibles par tous les agents du service**, pour signaler une réparation ou une intervention et suivre sa réalisation.

- **Contenu d'une demande** : **type de travaux** (liste réglable : plomberie, électricité, serrurerie, menuiserie, chauffage, informatique et téléphonie, nettoyage particulier, autre…), **lieu** (liste des lieux du service et texte), **numéro de chambre** si nécessaire, **gravité** (ex. gêne, dégradation, danger) et **urgence** (ex. dans la journée, dans la semaine, à programmer), partie en **texte libre** (description, sans donnée sur un patient), auteur et date.
- **Suivi** : à transmettre, transmise aux services techniques (référence de leur bon, facultative), en cours, réalisée ; commentaires datés ; demande en double rattachée à la première.
- **Confirmation de la réalisation par le cadre** : la demande « réalisée » ne sort de la liste qu'après la confirmation du cadre (ou d'un rôle autorisé), qui peut la rouvrir si l'intervention n'est pas satisfaisante.
- **Affichage** (précisions du porteur du 8 novembre 2026) : liste par service, **de la demande la plus récente à la plus ancienne** ; les demandes **déjà traitées** restent affichées, **indiquées comme telles et en grisé**, pendant un **délai d'affichage réglable (30 jours par défaut)**, puis sortent de la liste (elles restent au journal et dans un historique consultable) ; urgence et gravité marquées par un badge ; filtres (type, lieu, état) ; pastille sur l'icône du module pour les demandes urgentes ; une chambre concernée par une intervention en cours pourrait être signalée dans la liste des patients par chambre (à trancher).
- **Fonctionnement** : journal `modules\travaux\` en ajout seul, clé propre, activation par service ; les services techniques n'ayant pas accès à Tessera, un export (PDF ou tableau) du bon peut leur être remis, ou la référence de leur propre outil notée dans la demande.
- **À trancher avant développement** : listes de types, de gravités et d'urgences proposées par défaut ; délai d'affichage des demandes traitées réglé par l'établissement ou par service ; rôles qui créent, transmettent et confirment ; lien éventuel avec l'outil de gestion des services techniques de l'établissement (sans connexion sortante, donc par export seulement).

## Planning d'occupation des bureaux (demande du porteur, 8 novembre 2026) — réalisé en 0.25.0

*Réalisé en 0.25.0 (module Salles et bureaux) avec les décisions du 11 novembre 2026 (`docs/a-documenter.md`).*

Réserver les bureaux et salles du service (bureau d'entretien, salle de réunion, bureau du médecin, salle des familles…) comme les véhicules.

- **Contenu** : liste des bureaux par service (nom, capacité, équipement), planning par jour et par semaine, réservation ponctuelle ou répétée (consultation hebdomadaire d'un médecin), prêt à un autre service.
- **Lien avec l'Agenda** : un entretien ou une réunion pourrait réserver son bureau, avec vérification de la disponibilité, comme le véhicule d'un événement.
- **Réutilisation** : le module Véhicules fournit déjà le modèle (parc, prêts, réservations, pré-réservations, contrôle de disponibilité) ; une base commune « ressources réservables » est envisageable.
- **À trancher** : module distinct ou ressources génériques (véhicules, bureaux, matériel) ; qui gère la liste des bureaux.

## Feuille de staff pluridisciplinaire (demande du porteur, 8 novembre 2026) — réalisée en 0.19.0 sans données cliniques

*Réalisée dans le module Vue d'ensemble (0.19.0) : vue partagée, colonnes réglables, places disponibles, sorties prévues, préparation, clôture en instantané. Restent les codes CIM et le projet thérapeutique, données cliniques : l'option « donnée clinique » (administrateur, après avertissement, clé propre) permettrait de les ajouter donnée par donnée après les avis prévus.*

*Données cliniques : voir la règle en tête de document. Aujourd'hui faite dans un classeur Excel, moins sécurisé (pas de chiffrement, pas de traçabilité, copies possibles).*

Feuille récapitulative du staff : un **instantané à un jour donné, conservé** (on retrouve la feuille du staff de telle date telle qu'elle était).

- **Contenu par patient** : chambre, mode d'hospitalisation, médecins et référents, **codes CIM** (classification internationale des maladies), **projet thérapeutique**, **fenêtre de sortie envisagée** (ex. semaine prochaine, date) et colonnes propres au service.
- **Colonnes modifiables** (comme les données complémentaires de la fiche patient : ajout, masquage, ordre, par service) ; en tête, les **places disponibles** du service (lits, chambres libres, sorties prévues).
- **Instantané** : la feuille du jour est préparée à partir des données de Tessera puis complétée pendant le staff ; « Clore la feuille » la fige et l'enregistre au journal (une saisie, jamais modifiée) ; la feuille suivante reprend les valeurs de la précédente. Export PDF ou impression.
- **À trancher** : codes CIM saisis à la main ou liste de référence (à embarquer dans l'application, sans connexion sortante) ; qui voit la feuille (rôles) ; durée de conservation des feuilles closes ; place par rapport au DPI.
- **Demande du 11 novembre 2026** : ajouter une colonne **code CIM**, le **motif d'hospitalisation**, le **projet thérapeutique** et le **codage de la dépendance** (grille à préciser : celle du recueil d'informations médicalisé en psychiatrie, RIM-P, ou une grille propre à l'établissement). Toutes sont des **données cliniques** : elles relèvent de l'option « donnée clinique » (administrateur, après avertissement, clé propre) et des avis préalables ; leur import depuis l'export du DPI, plutôt qu'une saisie en double, est à étudier.

## Notes par patient (demande du porteur, 8 novembre 2026) — réalisées en 0.19.0 pour les notes organisationnelles

*Type « liste de notes » des données ajoutées (0.19.0) : rubriques ajoutées ou masquées par l'établissement ou le cadre, rôles qui lisent et écrivent, importance, retrait par l'auteur ou le cadre (la note reste dans l'historique), droit d'accès. Les notes cliniques restent soumises à la règle ci-dessus.*

*Données cliniques possibles : voir la règle en tête de document.*

Notes datées attachées au patient, organisées en **rubriques (items)** que l'établissement ou le service peut **ajouter ou masquer** (ex. « Projet de sortie », « Démarches sociales », « Famille », « Points de vigilance »).

- **Fonctionnement** : chaque note est une saisie datée et signée (journal en ajout seul ; une correction est une nouvelle note) ; rubriques réglables par service et par rôle (qui écrit, qui lit), comme les données complémentaires de la fiche patient.
- **À trancher** : frontière avec les transmissions du DPI (éviter un second dossier de soins) ; durée de conservation ; export dans le cadre du droit d'accès du patient.

## Module Agents (demande du porteur, 8 novembre 2026)

Fiches des agents du service et des psychiatres, **gérées par le cadre**, avec des champs ajoutés par l'établissement.

- **Contenu** : une fiche par agent (lien avec son compte Tessera quand il en a un) et par psychiatre (lien avec la liste commune des médecins, dont il reprendrait l'identité stable) : nom, fonction, services, groupes d'agents, et des **champs ajoutés** dont le format est choisi à leur création : texte libre, date, numéro de téléphone, notes (texte long), **entretiens** (liste datée : date, type, auteur, compte rendu court).
- **Gestion** : création et modification par le cadre pour les agents de ses services (cadre supérieur de santé pour son pôle, administrateur pour tous) ; chaque champ a ses rôles qui lisent et qui écrivent, comme les données complémentaires de la fiche patient ; un agent pourrait voir sa propre fiche (à trancher).
- **Déjà en place (0.20.0)** : fiche d'un agent (*Administration → Comptes → Fiche*, membres des groupes sans compte) avec des **données ajoutées** sous clé propre, réservées au cadre par défaut, et colonnes des vues « Agents » de la Vue d'ensemble ; le module Agents les reprendrait.
- **Lien avec l'existant** : comptes (Administration), groupes d'agents, liste commune des médecins (le module Agents pourrait l'absorber à terme), agenda (absences, entretiens planifiés).
- **Données du personnel** : les entretiens et notes sur un agent sont des **données de ressources humaines** ; avant tout développement : avis du délégué à la protection des données (DPO, référent RGPD) et de la direction des ressources humaines, inscription au registre des traitements, durée de conservation, droit d'accès de l'agent à sa fiche, frontière avec le dossier administratif de l'agent et les outils de la direction des ressources humaines (éviter un dossier parallèle).
- **À trancher avant développement** : champs par défaut ; types de champs proposés ; qui lit les entretiens et les notes ; l'agent voit-il sa fiche ; journal en ajout seul (une correction est une nouvelle saisie) et clé propre au module, remise aux seuls rôles habilités.

## Rôles d'encadrement : cadre supérieur de santé, médecin chef de service, médecin chef de pôle (demandes du porteur, 8 et 11 novembre 2026)

**Médecin chef de service et médecin chef de pôle** (demande du 11 novembre 2026) : rôles médicaux d'encadrement, sur le modèle du cadre et du cadre supérieur. Proposition : le chef de service valide ce qui relève des médecins de son service (par exemple les demandes de congés des médecins, piste « Demandes de congés », et les réglages du Suivi médical) ; le chef de pôle fait de même pour les services de son pôle. À trancher : accès aux données patients, lien avec la liste commune des médecins (un médecin chef est-il un compte Tessera ?), création d'un rôle « médecin » (point déjà ouvert pour le Suivi médical), notion de pôle commune à ces rôles et au cadre supérieur.

**Cadre supérieur de santé** : un rôle aux droits **entre ceux du cadre et ceux de l'administrateur**.

- **Proposition de périmètre** : tout ce que fait le cadre, pour **tous les services de son pôle** (ou des services qui lui sont affectés) ; réglages des modules par service (catégories de l'agenda, véhicules, suivi médical) ; groupes d'agents et destinataires des informations sur l'ensemble de ses services ; lecture des journaux de ses services ; validation de ce que le cadre confirme (médecins non répertoriés, intérimaires…).
- **Restent à l'administrateur** : coffre et clés, comptes et droits techniques, activation des modules, réglages généraux de l'établissement, sauvegardes et restauration.
- **Fonctionnement** : nouveau rôle fourni (comme IDE, AS, secrétaire, cadre), avec ses accès par défaut dans chaque module et réglables dans *Rôles et accès* ; notion de pôle (regroupement de services) à ajouter aux réglages si elle est retenue.
- **À trancher avant développement** : pôle ou liste de services ; peut-il créer des comptes pour ses services ; voit-il les données patients de tous ses services ou seulement les tableaux de bord ; ce qu'il valide à la place du cadre.

## Rangement des saisies par jour sur le partage (test de charge, 11 novembre 2026)

Le test de charge (`scripts/charge.cjs`, données fictives) estime environ 1 700 saisies par service et par mois, chacune dans un fichier chiffré du dossier du mois (`evenements/AAAA/MM/`). Depuis la 0.21.1, chaque poste ouvert ne relit toutes les 5 secondes que les dossiers du mois en cours et du mois précédent, et parcourt tout l'historique à la connexion puis toutes les 10 minutes. Pour trois services, cela fait encore environ 10 000 fichiers listés toutes les 5 secondes par poste.

- **À mesurer d'abord sur place** : durée de la liste d'un dossier de 5 000 à 10 000 fichiers sur le partage de l'établissement, avec plusieurs postes ouverts (dossier rempli par le script, données fictives). Si elle reste courte, rien à changer.
- **Piste** : un sous-dossier par jour (`evenements/AAAA/MM/JJ/`) ; la lecture rapide ne parcourrait que les jours récents (quelques centaines de fichiers).
- **Ce qui serait touché** : lecture et écriture des saisies (`store.js`), instantanés mensuels, contrôle d'intégrité (fichiers disparus), dossier de secours et script robocopy, déplacement du dossier, restauration ; lecture des deux rangements pendant la transition (les saisies déjà écrites ne sont jamais déplacées, le journal étant en ajout seul).
- **Alternative à étudier** : un fichier d'index par poste, mis à jour à chaque saisie, lu à la place de la liste du dossier.

## Tri des colonnes d'un tableau (demande du porteur, 11 novembre 2026)

Trier un tableau en cliquant sur le titre d'une colonne (un clic : ordre croissant, un second : décroissant), dans tous les tableaux de la plateforme.

- **Fonctionnement envisagé** : une aide commune de l'interface, comme la largeur des colonnes (`ui.js` `activerLargeurs`) ; tri selon le type de la colonne (texte, nombre, date, durée) ; flèche dans le titre ; accessible au clavier (titre en bouton, `aria-sort`).
- **À trancher** : tri retenu sur le poste (comme la largeur des colonnes) ou oublié en quittant l'écran ; tableaux qui ont déjà un ordre réglé (Vue d'ensemble, liste des patients par chambre, groupes) : le clic remplace-t-il l'ordre réglé le temps de l'écran ; tableaux imprimés et exportés dans l'ordre affiché ou dans l'ordre d'origine.

## Module Demandes de congés (demande du porteur, 11 novembre 2026)

Demander et valider les congés des agents et des médecins, avec un tableau annuel.

- **Tableau annuel** : vue à la semaine et vue à la journée ; sélection des agents concernés dans le tableau (service, groupe, rôle, agents nommés).
- **Décompte** : nombre de congés auxquels chaque agent a droit (congés annuels, RTT, jours fériés…) et solde après chaque demande.
- **Validation par le responsable** : cadre pour les paramédicaux, chef de pôle pour les médecins (rôle « chef de pôle » à créer, ou rôle réglé dans *Rôles et accès*) ; demande, validation ou refus motivé, information de l'agent.
- **À trancher** : règles de décompte (propres à chaque établissement et à chaque statut : à régler par l'établissement plutôt que codées) ; lien avec le logiciel de gestion du temps de l'établissement (Tessera ne doit pas devenir la référence : export ou simple aide à la planification ?) ; lien avec les absences de l'Agenda et les présences du Suivi médical ; visibilité (un agent voit-il les congés de ses collègues ?) ; durée de conservation.
- **Données du personnel** : inscription au registre des traitements, avis du délégué à la protection des données ; clé propre (cadre et responsable), comme les données des agents (0.20.0).

## Prêt de droits pendant une absence (demande du porteur, 11 novembre 2026)

Confier pour une durée limitée les droits d'un agent absent à un autre (un cadre qui part en congé confie ses validations à un collègue ou au cadre supérieur).

- **Fonctionnement envisagé** : délégation datée (début, fin), choisie par l'agent ou par l'administrateur ; rôles et services prêtés, ou seulement certains accès (validations des permissions, confirmation des travaux, consultation de la messagerie…) ; fin automatique à la date prévue ; chaque saisie faite au titre de la délégation garde le nom de celui qui l'a faite et la mention « pour le compte de… ».
- **Clés** : un droit = une clé : le délégataire reçoit les clés des droits prêtés, retirées à la fin (nouvelle génération, comme tout retrait de droit) ; remise par la session de l'administrateur, comme aujourd'hui. Les messages chiffrés adressés personnellement à l'agent absent ne font pas partie du prêt, sauf décision contraire.
- **À trancher** : qui peut prêter (l'agent lui-même, le cadre supérieur, l'administrateur) ; prêt partiel ou complet ; information des équipes ; lien avec le rôle « cadre supérieur de santé ». Avis du responsable de la sécurité informatique.

## Module Signalement (lanceur d'alerte, demande du porteur, 11 novembre 2026)

Permettre à un agent de signaler un fait (atteinte, manquement, danger) de façon confidentielle, avec un suivi par la personne chargée de recueillir les signalements.

- **Cadre légal** : procédure de recueil des signalements des lanceurs d'alerte (loi du 9 décembre 2016 dite « Sapin II », modifiée par la loi du 21 mars 2022) ; l'établissement a déjà sa procédure et son référent : Tessera ne la remplace pas, il peut seulement offrir un canal interne conforme à celle-ci. **À valider avec la direction juridique et le délégué à la protection des données avant tout développement.**
- **Confidentialité** : contenu chiffré pour le seul référent (sur le modèle du chiffrement réservé aux destinataires de la messagerie) ; **l'administrateur ne doit pas pouvoir lire**, ce que le trousseau actuel ne garantit pas (il détient toutes les clés) : clé hors du trousseau de l'administrateur à concevoir ; identité de l'auteur protégée, possibilité d'un signalement anonyme (limites : le journal en ajout seul garde l'auteur de chaque saisie) ; aucune consultation par le cadre.
- **Suivi** : accusé de réception, échanges entre l'auteur et le référent, retour sur les suites données, délais légaux ; journal des accès.
- **À trancher** : faisabilité au regard de l'anonymat et de l'administrateur ; à distinguer de la déclaration des événements indésirables (outil qualité de l'établissement).

## Liste de tâches personnelle, reliée aux autres modules (demande du porteur, 11 novembre 2026)

Une liste de tâches propre à chaque agent (« à faire »), qui reprend aussi ce que les autres modules lui demandent.

- **Fonctionnement envisagé** : tâches personnelles (titre, échéance, rappel, fait / pas fait), visibles du seul agent ; rattachement d'un élément d'un autre module (événement ou tâche de l'agenda, demande de travaux, réservation, message), sur le modèle des éléments rattachés de la messagerie (lien seulement, détail réservé à qui a accès au module) ; tâches reçues des modules (réponses attendues de l'agenda, tâches de la check-list d'une permission, demandes à arbitrer, messages à confirmer) affichées à part et cochées dans leur module.
- **Clé** : clé propre à l'agent (comme la clé `m-a` de la messagerie), pour que personne d'autre ne lise sa liste.
- **À trancher** : lien avec les tâches de l'agenda (une tâche de service attribuée à l'agent y figure-t-elle ?) ; partage d'une tâche avec un collègue ; place dans l'interface (fenêtre à part, ou onglet de la messagerie à côté de *Informations*).

## Page d'accueil de l'administration : modules activés ou désactivés (demande du porteur, 11 novembre 2026)

Une page principale de la fenêtre *Administration* avec l'icône de chaque module.

- **Fonctionnement envisagé** : icône, nom et état de chaque module (activé ou désactivé, services où il l'est) ; activer ou désactiver directement depuis la page (administrateur ; services : comme l'activation actuelle) ; un clic sur l'icône ouvre l'onglet des réglages du module ; clés du module créées à l'activation comme aujourd'hui.
- **À trancher** : activation pour tous les services d'un clic, ou choix des services ; confirmation avant de désactiver un module qui a des données (rien n'est effacé, le module est seulement masqué).

## Informations du service (demande du porteur, 11 novembre 2026)

Une page d'informations pratiques sur chaque service, tenue par le cadre et consultable par les agents.

- **Contenu proposé** : coordonnées (téléphones, adresses de messagerie, poste de soins), horaires (visites, repas, relèves), organisation (secteurs, chambres, équipes), consignes et procédures du service, numéros utiles (services techniques, sécurité, pharmacie, garde), référents (voir la piste ci-dessous) ; rubriques ajoutées ou masquées par le cadre.
- **À trancher** : contenu exact attendu ; une page par service ou aussi pour l'établissement ; lien avec l'accueil des nouveaux agents (livret d'accueil) ; documents joints (procédures en PDF, sur le modèle des pièces jointes de la messagerie).

## Rôles de référents (demande du porteur, 11 novembre 2026)

Désigner, par service, les agents référents d'un domaine (escarres, pharmacie, restriction des libertés, hygiène, douleur…), avec une liste que tous les agents consultent.

- **Fonctionnement envisagé** : domaines de référence réglables par le cadre (liste proposée par défaut, ajout et masquage) ; un ou plusieurs référents par domaine et par service, choisis parmi les comptes ou les membres des groupes ; liste consultable par les agents (page du service ou fenêtre dédiée) ; lien direct pour les contacter : écrire un message (messagerie), téléphone s'il est renseigné.
- **Droits** : un domaine peut donner des droits (par exemple le référent pharmacie confirme les demandes de travaux de la pharmacie) ; à décider domaine par domaine, sinon le référent n'a que la mention dans la liste.
- **À trancher** : distinction avec les groupes d'agents (un domaine pourrait être un groupe particulier) ; référents de l'établissement en plus de ceux des services.

## Rôles d'intervenants extérieurs, informations limitées (demande du porteur, 11 novembre 2026)

Donner un accès limité à des intervenants qui ne sont pas agents du service (intervenants associatifs, enseignants, intervenants libéraux, étudiants…).

- **Fonctionnement envisagé** : rôle (ou famille de rôles) « intervenant extérieur », sans accès par défaut à aucun module ; accès choisis un par un dans *Rôles et accès* (par exemple : l'agenda de ses activités seulement, la messagerie avec certains destinataires) ; identité des patients réduite (initiales) ou absente ; durée de validité du compte (date de fin, comme les intérimaires de la liste des médecins).
- **Clés** : un droit = une clé : l'intervenant ne reçoit que les clés de ses accès ; une limitation à l'intérieur d'un module (ne voir que ses activités) relève de l'interface, sauf clé propre à concevoir. Avis du responsable de la sécurité informatique.
- **À trancher** : types d'intervenants et accès par défaut de chacun ; signature d'une charte de confidentialité ; qui crée ces comptes (administrateur, cadre pour ses services).

## « Information d'un tiers » dans la messagerie et les données patient ; vérification avant l'export du droit d'accès (demande du porteur, 11 novembre 2026)

Le droit d'accès d'un patient exclut les informations qui concernent un tiers ou qui proviennent d'un tiers (point déjà à faire valider : `CLAUDE.md` § 7). Il faut pouvoir les marquer.

- **Messagerie** : quand un patient figure dans un message (fiche rattachée, mention), case « information d'un tiers » cochée par l'auteur pour exclure ce message des données du patient (export du droit d'accès) ; aujourd'hui la messagerie n'est pas reprise dans l'export : la case prépare une éventuelle reprise.
- **Données patient** : case « information d'un tiers » sur chaque élément qui peut l'être (note, donnée ajoutée, intervenant de la prise en charge, réponse d'une vue d'ensemble), pour qu'il ne soit pas exporté.
- **Vérification avant l'export** : l'export du droit d'accès affiche d'abord la liste des éléments retenus et écartés (tiers, donnée clinique, commentaire interne), que l'agent vérifie, coche ou décoche, avant de produire le fichier ; la vérification est inscrite au journal.
- **À valider** : règle d'exclusion et qui en décide (délégué à la protection des données, direction des usagers) ; trace des choix faits à l'export.

## Fiches agents : coordonnées (demande du porteur, 11 novembre 2026)

Complète le module Agents (ci-dessus) et la fiche agent existante (données ajoutées, 0.20.0).

- **Contenu** : téléphone professionnel, téléphone personnel, courriel professionnel, courriel personnel, par agent ; champs proposés par défaut, masquables par l'établissement.
- **Numéro professionnel accessible facilement** : affiché d'un clic là où l'agent apparaît (agenda : accompagnateurs et participants ; messagerie : destinataires ; liste des référents ; Vue d'ensemble : vue « Équipe » ; salles : auteur d'une réservation si le réglage le permet).
- **Coordonnées personnelles** : réservées au cadre (et à l'agent lui-même) par défaut, clé propre ; usage limité aux rappels et aux urgences de service. Avis du délégué à la protection des données, information des agents, saisie par l'agent lui-même ou avec son accord.
- **À trancher** : l'agent saisit-il ses propres coordonnées ; qui voit le numéro personnel (cadre, administrateur de garde).

## Rôles « Administrateur de garde » et « Directeur des soins » (demande du porteur, 11 novembre 2026)

Nouveaux rôles fournis, avec leurs accès réglables dans *Rôles et accès* comme les autres.

- **Administrateur de garde** : rôle d'astreinte de direction, sans droits techniques (ni coffre, ni comptes, ni réglages) ; proposition : lecture des tableaux de bord et des alertes de l'établissement (Isocont : patients en soins libres mis en isolement ou en contention, information « sans délai » déjà prévue par les alertes), destinataire des informations d'Isocont, lecture de l'occupation des lits ; accès limité à la période de garde à étudier (planning des gardes, ou rôle permanent).
- **Directeur des soins** : lecture de tous les services (tableaux de bord, registres, statistiques, Vue d'ensemble), destinataire des informations ; pas de saisie par défaut.
- **Clés** : un droit = une clé : un accès à l'établissement entier remet les clés des modules concernés ; un accès « tableaux de bord seulement » demanderait des données agrégées sans clé de module (à concevoir).
- **À trancher** : accès par défaut de chaque rôle ; identité des patients affichée ou réduite (initiales) ; lien avec les rôles d'encadrement (pôle).

## Accès aux données cliniques réglable, « bris de glace » (demande du porteur, 11 novembre 2026)

*Suppose la levée de la règle « aucune donnée clinique » (en tête de document) et ses avis.*

- **Réglage** : accès aux données cliniques choisi par rôle et par service (lecture, écriture) ; option « patients présents seulement » (patients hospitalisés dans le service ce jour), désactivée ou activée selon le rôle.
- **Bris de glace** : option, réglable par rôle et service (désactivée par défaut), qui permet à un agent sans accès de lire les données cliniques d'un patient pour une **durée limitée** (par exemple une heure ou la fin du poste), avec **justification obligatoire**, inscription au journal et **notification du cadre** (onglet Informations, message) ; consultation tracée sur le modèle de la messagerie chiffrée (0.24.0).
- **Clés** : avec « un droit = une clé », un accès limité aux patients présents ou un bris de glace ne peut pas reposer sur la seule interface si l'agent détient la clé ; à concevoir avec le responsable de la sécurité informatique (clé par patient ou par séjour, remise temporaire par un tiers de confiance, ou garantie par l'application seulement, comme la consultation tracée).
- **À trancher** : durée du bris de glace ; qui est notifié (cadre, cadre de garde) ; relecture des bris de glace (revue périodique par le cadre ou le délégué à la protection des données).

## Isocont : tâche de surveillance de la CSI dans l'agenda (demande du porteur, 11 novembre 2026)

Quand une mesure est en cours dans une chambre de soins intensifs (CSI), une tâche de surveillance apparaît dans l'agenda du service.

- **Fonctionnement envisagé** : tâche lue à la volée dans Isocont (aucune copie dans l'agenda), répétée selon une fréquence réglable par l'établissement ou le service (par exemple toutes les heures, ou par poste), pour les rôles choisis (IDE, AS) ; cochée « faite » par l'agent avec l'heure ; retard signalé.
- **Aucune donnée clinique** : la tâche rappelle et trace le passage (heure, agent) ; le contenu de la surveillance reste dans le dossier patient informatisé (DPI). Lien avec les traces de surveillance déjà prévues pour les mesures hors CSI (réglage qualité d'Isocont) à étudier pour ne pas faire deux fois la même saisie.
- **À trancher** : fréquences par défaut (isolement, contention) ; tâche par mesure ou par CSI ; trace inscrite au journal d'Isocont ou de l'agenda (un module n'écrit pas dans le journal d'un autre).

## Contrôle de conformité des CSI libres (demande du porteur, 11 novembre 2026)

Vérifier une fois par poste, à deux agents, qu'une chambre de soins intensifs (CSI) inoccupée est prête et conforme.

- **Fonctionnement envisagé** : liste des CSI du service (lieux d'isolement déjà déclarés dans Isocont) ; pour chaque CSI libre, une tâche par poste (matin, après-midi, nuit, horaires réglables) ; **check-list** réglable par l'établissement ou le service (par exemple : matelas et literie, absence d'objet dangereux, éclairage, appel malade, sanitaires, visibilité par l'oculus, matériel de contention complet et vérifié, horloge visible) ; validation par **deux agents** (le second confirme avec son propre compte) ; écart signalé au cadre, avec lien possible vers une demande de travaux.
- **Traçabilité** : chaque contrôle est une saisie datée et signée ; historique consultable et exportable (preuve pour les visites de certification ou du Contrôleur général des lieux de privation de liberté, CGLPL).
- **À trancher** : contenu de la check-list par défaut ; ce qui se passe si le contrôle n'est pas fait (alerte au cadre) ; module d'accueil (Isocont ou agenda) ; contrôle aussi à la libération de la CSI.


## Graphiques dans le tableur (demande du porteur, 12 novembre 2026)

- **Besoin** : graphiques dans les tableurs du module Documents (courbes, histogrammes, secteurs) tirés d'une plage de cases, mis à jour avec les valeurs et imprimés avec la feuille.
- **Décision** : mis de côté le 12 novembre 2026, à développer plus tard (après l'édition simultanée et l'import et l'export Office).
- **Pistes** : dessin en SVG construit dans le navigateur (aucune bibliothèque externe) ; plage, type, titre et couleurs enregistrés dans la feuille ; reprise des graphiques des fichiers `.xlsx` à l'import.

## Suivi des modifications : style, alignement, retrait et listes (demande du porteur, 12 novembre 2026)

- **Besoin** : avec le suivi des modifications activé, marquer aussi (auteur, date, à accepter ou refuser) le changement de style d'un paragraphe (titre, paragraphe), de son alignement, de son retrait et le passage en liste à puces ou numérotée, comme la mise en forme du texte.
- **Décision** : à développer plus tard (12 novembre 2026).
- **Pistes** : marque de bloc « mise en forme du paragraphe » gardant l'état d'avant (type, alignement, retrait, liste) ; refus : état d'avant rétabli ; export Word en `w:pPrChange`.

## Droit d'accès : données des modules arrêtés (accord du porteur, 12 novembre 2026)

- **Besoin** : l'export du droit d'accès d'un patient reprend aussi les données des modules arrêtés depuis l'accueil de l'administration (données conservées, obligation légale).
- **Décision** : principe accepté le 12 novembre 2026, mis de côté pour plus tard ; à confirmer avec le délégué à la protection des données (DPO, référent RGPD).
- **Pistes** : vérification de l'export module par module (aujourd'hui, la messagerie et les modules lus par l'export le sont déjà) ; mention « module arrêté » dans le fichier exporté.

## Planification des demandes de formation (demande du porteur, 12 novembre 2026)

- **Besoin** : même principe que la planification des congés : chaque agent planifie ses demandes de formation ; validateur selon le type d'agent ; tableau annuel du service à la semaine ou à la journée, périodes colorées, règles (agents absents en même temps), totaux, couleurs selon le statut.
- **Décision** : à développer plus tard, après le module Congés (12 novembre 2026), en reprenant ses tableaux et ses règles.
- **Pistes** : lien avec le plan de formation de l'établissement et les formations obligatoires (AFGSU, incendie…) suivies dans l'Équipe ou un tableur ; départs en formation visibles dans l'Agenda comme les absences.
