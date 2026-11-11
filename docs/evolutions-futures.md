# Évolutions futures

Évolutions étudiées avec le porteur du projet et gardées pour plus tard. Elles ne font pas partie du périmètre soumis à validation (fiche projet) ; chacune reste à retravailler et à valider avant tout développement.

| Évolution | Origine | Niveau | Ampleur du développement |
| --- | --- | --- | --- |
| Documents et outils de bureautique | Tessera Santé, 6 novembre 2026 | Idée à retravailler | Grande |
| Connexion avec la session Windows | Suivi-mesures-isocont, 2 novembre 2026 | Étude technique faite, à adapter au socle | Moyenne (dépend du service informatique) |
| Stockage sur un partage autre que SMB | Suivi-mesures-isocont, 2 novembre 2026 | Demande, à étudier | Moyenne à grande |
| Rangement des saisies par jour sur le partage | Test de charge, 11 novembre 2026 | À décider après un essai sur le partage de l’établissement | Moyenne |
| Agenda : échéances des certificats légaux | Tessera Santé, 7 novembre 2026 | Écartée pour l'instant | Petite à moyenne (règles juridiques à valider) |
| Module Messagerie | Tessera Santé, 8 novembre 2026 | **Réalisé en 0.23.0** ; chiffrement réservé aux destinataires prévu en 0.24.0 | Moyenne |
| Module Demandes de travaux et de réparation | Tessera Santé, 8 novembre 2026 | **Réalisé en 0.22.0** | Moyenne |
| Demandes de travaux : photos jointes | Tessera Santé, 11 novembre 2026 | Piste : stockage chiffré des images, risque de photographier un patient à étudier avec le délégué à la protection des données | Moyenne |
| Planning d'occupation des bureaux | Tessera Santé, 8 novembre 2026 | Demande, à préciser | Petite à moyenne |
| Feuille de staff : codes CIM et projet thérapeutique | Tessera Santé, 8 novembre 2026 | Feuille de staff réalisée en 0.19.0 sans ces colonnes ; **données cliniques** (décision préalable ; option « donnée clinique » par donnée disponible) | Petite (liste CIM à embarquer) |
| Notes par patient : notes cliniques | Tessera Santé, 8 novembre 2026 | Notes organisationnelles réalisées en 0.19.0 ; **données cliniques** (décision préalable) | Petite |
| Module Agents (fiches des agents et des psychiatres) | Tessera Santé, 8 novembre 2026 | Demande, à préciser ; une première fiche agent avec données ajoutées existe depuis la 0.20.0 ; **données du personnel** (avis préalable) | Moyenne à grande |
| Planning des psychologues | Tessera Santé, 9 novembre 2026 | Piste : liste commune des psychologues réalisée en 0.20.0, planning sur le modèle des présences médicales | Petite à moyenne |
| Rôle Cadre supérieur de santé | Tessera Santé, 8 novembre 2026 | Demande, à préciser | Moyenne |

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

## Planning d'occupation des bureaux (demande du porteur, 8 novembre 2026)

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

## Rôle Cadre supérieur de santé (demande du porteur, 8 novembre 2026)

Un rôle aux droits **entre ceux du cadre et ceux de l'administrateur**.

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

