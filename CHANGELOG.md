# Journal des modifications — Tessera Santé

## 0.9.2 — 7 novembre 2026

- **Nouvelle icône** (choix du porteur) : rosace de tesselles sur le fond vert de l'outil, en plusieurs teintes accordées (verts, bleu pétrole, vert sauge, quelques tesselles ambre) ; les tesselles claires dessinent un T. Version simplifiée pour les petites tailles (onglet du navigateur), où le T reste lisible. Produite par `scripts/icone.py` (icône Windows, PNG de l'en-tête et de l'application installée).
- Captures du guide pratique IDE et AS refaites.

## 0.9.1 — 7 novembre 2026

Décisions du porteur du 7 novembre 2026.

- **Mode d'hospitalisation dans la fiche patient** (il servira à d'autres modules) : l'accès « Fiches patient » comprend désormais le mode d'hospitalisation ; à la création d'une fiche (service de psychiatrie), mode et date de début ; dans la fiche, mode actuel et *Historique et changement…*. La secrétaire le saisit par défaut ; un rôle créé par l'établissement qui a les fiches sans les mesures le saisit aussi. L'IDE et l'AS le saisissent toujours avec la mesure.
- **Sexe** : valeurs Féminin, Masculin, Indéterminé validées.
- Test des droits mis à jour (209 au vert) ; fiche vérifiée dans Chrome.

## 0.9.0 — 7 novembre 2026

Étape 7 : **kit de déploiement**. Toutes les étapes du plan de développement sont faites.

- Dossier `kit/` (Markdown modifiable, PDF dans `kit/pdf/`) :
  - 03 guide d'installation (dossier unique pour tous les modules, activation par service, rôles et accès par module, comptes, reprise des données, recette par module) ;
  - 04 procédures de secours (départ d'un agent et retrait d'un droit, compromission et « Tout renouveler », coffre modifié ou restauré, procédure dégradée de l'agenda) ;
  - 05 éléments RGPD et analyse d'impact : **une fiche du registre des traitements par module** (fiche patient, isolement et contention, agenda), risques et mesures (un droit = une clé, coffre attesté) ;
  - 06 guide utilisateur de la plateforme (connexion, écran, fiche patient, agenda, alertes, Mon agenda, journal, droits par défaut) ; 12 guide du module Isolement et contention ; 08 guide pratique IDE et AS avec captures refaites dans Tessera ;
  - 07 reprise à partir du registre, 09 dossier de secours par robocopy, 10 travail hors réseau, 11 import de la liste des patients du DPI.
- Chemins d'exemple, raccourci et tâches planifiées renommés « TesseraSante » (assistant robocopy, scripts du kit) ; page d'accueil du dépôt qui ouvre l'application (`index.html`).
- `scripts/docs-pdf.py` produit aussi les PDF du kit ; `scripts/captures-guide-ide-as.py` adapté à Tessera.

## 0.8.5 — 7 novembre 2026

Étape 6 (module Agenda), dernière sous-étape : **alertes et « Mon agenda »**. L'étape 6 est terminée.

- **Onglet Alertes** :
  - *alertes de l'équipe* : type de la liste du service (ou « Autre » avec un intitulé), patient du service facultatif, « à faire avant le » (date, heure), pour toute l'équipe, un rôle ou une personne, précision sans donnée clinique ; affichées jusqu'à **Vu** (qui, quand ; *Remettre à voir* possible), en rouge une fois la date passée ; option pour revoir les alertes vues depuis 7 jours ;
  - *échéances JLD* : prochaine démarche non tracée de chaque mesure en cours (information, saisine, décision attendue), dépassée ou dans les 72 heures, **calculée à la volée par le module Isolement et contention** (jamais recopiée) ; affichée seulement à qui a l'accès aux envois au JLD ;
  - *points de check-list en retard* (selon le délai de chaque point) et *réunions des 7 prochains jours*, qui ouvrent l'élément.
- Résumé en tête de l'agenda (« 2 alertes de l'équipe · 1 échéance JLD sous 72 h… ») avec *Voir les alertes*.
- **Onglet Mon agenda** : la semaine de l'agent, tous ses services réunis : éléments où il est prévu, tâches qui lui sont affectées ou qui reviennent à son rôle, ses absences, alertes qui lui sont adressées (personne ou rôle). Vue dans Tessera seulement.
- Journal : alerte et « vu » décrits avec le type et le patient (selon la désignation réglée).
- Nouveaux tests (alertes, réunions, Mon agenda, fourniture des échéances JLD ; 209 au vert) ; écrans vérifiés dans Chrome.

## 0.8.4 — 7 novembre 2026

Agenda : décisions du porteur du 7 novembre 2026 sur les tâches, les check-lists et la répétition.

- **Retirer cette date et les suivantes** : arrête la répétition d'un événement à partir d'une date (les dates précédentes sont gardées), à côté de *Retirer cette date*.
- **Deux niveaux de tâches**, chacun avec ses droits :
  - *tâche du service*, créée par les rôles qui règlent les tâches (cadre par défaut) : les autres rôles la cochent et, avec l'accès « Ajuster les tâches du service » (IDE et cadre par défaut), l'**ajustent** dans les limites du réglage : **agent affecté** à une date ou à certains jours de la répétition (affichage « → nom » dans l'agenda, bouton *Affecter*), et si l'établissement le permet heure et précision ; **seuls les rôles qui règlent les tâches la suppriment** ;
  - *tâche de l'équipe*, créée par un agent (accès « Tâches de l'équipe » : IDE, AS, secrétaire, cadre) : modifiable et supprimable par toute l'équipe ; ponctuelle seulement, sauf réglage.
  - Contrôles faits avant l'enregistrement (une saisie de l'équipe ne peut ni modifier ni supprimer une tâche du service) ; réglages dans *Administration → Agenda* ; onglet *Tâches du service* ouvert à qui a l'un des trois accès.
- **Délai d'alerte pour chaque point de check-list** (jour même, veille, 2, 3, 5, 7 ou 14 jours avant, ou sans alerte). Modèle « Sortie du patient » fourni : infirmier libéral prévenu 2 jours avant ; rendez-vous au centre médico-psychologique et transport la veille ; lettre de sortie et ordonnance le jour même. Point non coché à sa date : « en retard » sur l'élément et dans sa check-list. Les alertes de l'agenda (sous-étape suivante) reprendront ces points.
- Nouveaux tests (délais, tâches du service et de l'équipe, ajustement, contrôles par la session ; 207 au vert) ; écrans vérifiés dans Chrome.

## 0.8.3 — 7 novembre 2026

Étape 6 (module Agenda), troisième sous-étape : **tâches, absences, répétition et check-lists**. Décisions du porteur du 7 novembre 2026.

- **Icône** : mosaïque de neuf tesselles, sans initiales (« TS » est trop connoté en psychiatrie) ; l'en-tête affiche l'icône.
- **Onglet « Tâches du service »**, affiché seulement à qui a l'accès « Régler les tâches » (cadre par défaut) : tâches ponctuelles ou récurrentes (chaque jour, certains jours, chaque mois, jusqu'à une date), heure facultative, précision, pour certains rôles ou toute l'équipe. Elles apparaissent chaque jour dû dans l'agenda ; l'agent les coche « faites » (nom et heure gardés).
- **Absences** : *+ Absence* dans l'agenda ; chacun saisit les siennes, le cadre celles de l'équipe ; **motif facultatif** (« non précisé » possible) ; affichées dans l'agenda ; un professionnel prévu sur un élément pendant son absence est signalé.
- **Répétition d'un événement** : chaque jour, chaque semaine (jours choisis), chaque mois, jusqu'à une date ou sans fin ; même heure locale au changement d'heure ; *Retirer cette date* pour une seule occurrence.
- **Check-list d'un événement** (ex. sortie d'un patient : lettre de sortie, ordonnance, infirmier libéral, rendez-vous au centre médico-psychologique, transport) : modèles réglables dans *Administration → Agenda*, points libres ; points cochés pour chaque date (qui, quand) ; avancement affiché sur l'élément (« Check-list : 1/5 »).
- Nouveaux types d'événements : sortie ou permission, autre événement.
- Accès de l'Agenda revus : « Planifier » (événements), « Régler les tâches » (nouveau), « Cocher les tâches faites et les check-lists ».
- Nouveaux tests (répétition, changement d'heure, check-list, tâches dues, absences ; 204 au vert) ; écrans vérifiés dans Chrome (dont l'onglet masqué pour l'AS).

## 0.8.2 — 7 novembre 2026

Décisions du porteur du 7 novembre 2026 sur l'Agenda et le nom de l'application.

- **Tessera Santé** : nouveau nom affiché dans l'en-tête, l'onglet du navigateur, l'application installée (icône « TS ») et *À propos* (présentation de la plateforme et de ses modules ; liens vers le dépôt `rodtrip2/tessera-sante` et ses formulaires de signalement, ajoutés au dépôt).
- Élément d'un autre service concernant un patient du service : lecture seule par défaut, **modification permise par un réglage** (*Administration → Agenda*) ; le service du patient peut **toujours ajouter un commentaire** (tout agent de l'Agenda, information d'organisation sans donnée clinique ; retrait par annulation depuis le journal).
- **Types d'alertes par service** : la liste de l'établissement s'applique à tous les services, sauf à ceux qui ont leur propre liste.
- Nouveau test (commentaire sans accès particulier, listes par service ; 202 au vert) ; commentaire, réglages et nouveau nom vérifiés dans Chrome.

## 0.8.1 — 7 novembre 2026

Étape 6 (module Agenda), deuxième sous-étape : **agenda du service**. Besoins complétés par le porteur le 7 novembre 2026 (types d'alertes paramétrables, patient suivi par un autre service).

- Onglet *Agenda* : vues jour et semaine, navigation (précédent, aujourd'hui, suivant), filtre par type. *+ Nouveau* (accès « Planifier ») : accompagnement, activité thérapeutique ou réunion ; intitulé, date, heures de début et de fin, lieu, service, patients du service (recherche), professionnels prévus (comptes du service ou nom libre). Modification et suppression depuis l'élément.
- Patient suivi par un autre service : l'accompagnement ou l'activité d'un service B qui concerne un patient hospitalisé dans le service A s'affiche dans l'agenda de A, marqué du nom de B, en lecture seule et avec les seuls patients de A.
- Patients désignés selon le réglage de l'établissement : initiales par défaut, ou aucune, IPP, nom complet.
- *Administration → Agenda* : identité affichée ; types d'alertes (« À voir par le médecin », psychologue, service social, rendez-vous à organiser, information à transmettre), modifiables, à compléter par l'établissement ; « Autre » toujours proposé à la saisie. Réglage `agenda` au journal du socle (export des réglages, jeu de formation, libellé du journal).
- Les alertes de l'Agenda deviennent génériques (saisie `ALERTE` avec son type) ; leurs écrans viennent avec la sous-étape 4.
- Nouveaux tests (éléments de la période, autre service, identité, réglages ; 201 au vert) ; vues, saisie, élément d'un autre service et réglages vérifiés dans Chrome.

## 0.8.0 — 7 novembre 2026

Étape 6 (module Agenda), première sous-étape : **plusieurs modules affichés** et **module Agenda déclaré**. Besoins de l'Agenda et décisions du porteur consignés dans `docs/architecture.md` § 7 bis.

- Onglet *Accueil* et liste *Module* dans l'en-tête dès que deux modules sont ouverts à l'agent ; le module choisi est retenu sur le poste. Les onglets *Patients*, *Journal* et *Administration* restent communs.
- Module *Agenda du service* : journal (`modules\agenda\`) et clé propres, activation par service, accès dans *Rôles et accès* (consulter ; planifier ; cocher les tâches faites ; alertes « à voir par le médecin » ; absences de l'équipe). Chacun peut saisir ses propres absences. Accès par défaut proposés : IDE (planifier, tâches, alertes), AS (tâches, alertes), secrétaire (planifier, tâches), cadre (tout). Un rôle créé par l'établissement n'entre dans l'Agenda que si un accès lui est coché ; sinon il n'en reçoit pas la clé.
- Droits d'une saisie décidés par le module qui la déclare ; services visibles selon le module affiché ; libellés du journal propres à l'Agenda.
- Onglet *Agenda* : éléments à venir (les écrans de planification arrivent aux sous-étapes suivantes).
- Nouveau test `tests/agenda.test.js` (200 au vert) ; accueil, changement de module, journal et *Rôles et accès* vérifiés dans Chrome.

## 0.7.0 — 7 novembre 2026

Étape 5 (module Patients) terminée : **reprise de l'historique sur les deux modules**.

- Imports du registre et du classeur : fiches patient dans le journal de Patients, mesures dans celui d'Isocont, en deux lots liés (annulés et rétablis ensemble) ; registre et calculs identiques à ceux d'un import en un seul lot (vérifié par test). Relancer l'import ne crée pas de doublon.
- Les fiches créées par la reprise de l'historique sont marquées comme importées : la liste du DPI importée ensuite les complète (rattachement par l'IPP ; séjour, chambre et lit, sexe, prénom). Ordre conseillé : historique, puis liste du DPI.
- Droit d'accès : l'export réunit la fiche complète (nom de naissance, sexe, médecins, référents), les séjours, les modes d'hospitalisation, les changements datés et les mesures.
- Durée de conservation : calculée sur la dernière activité dans tous les modules (fin de la dernière mesure, sortie du dernier séjour) ; un séjour en cours retient le patient. Signalement seulement, aucune suppression.
- Nouveau test de bout en bout (registre, puis liste du DPI, relance, conservation ; 197 au vert) ; export du droit d'accès vérifié dans Chrome.

## 0.6.4 — 7 novembre 2026

Étape 5 (module Patients), quatrième sous-étape : **import de la liste des patients exportée du DPI**.

- Onglet *Patients → Importer la liste du DPI…* (accès « Fiches patient ») : fichier CSV ou Excel lu sur le poste, jamais copié sur le partage.
- Colonnes proposées d'après leur titre et modifiables ; « Non fourni par l'export : à renseigner dans Tessera » pour un champ sans colonne (jamais modifié par l'import). Colonnes découpées : « Nom prénom » (règles validées pour l'export de Sillage : nom de naissance après « Né » / « Née », nom d'usage, prénom) et « Loc. » (chambre et lit). Le médecin responsable et les commentaires ne sont jamais proposés.
- Unités de l'export rattachées aux services (ou écartées), valeurs du sexe à faire correspondre.
- Aperçu : nouveaux patients, fiches et séjours mis à jour, valeurs corrigées dans Tessera gardées (écart signalé), doublons possibles à confirmer (réadmission sans IPP), découpages du nom à vérifier et corriger, lignes en erreur, patients absents de la liste (sortie proposée, jamais appliquée d'office).
- Fiche retrouvée par l'IPP, puis par le numéro de séjour ; un second import identique n'enregistre rien.
- Enregistrement en un lot annulable (journal du module Patients) ; modèle d'import mémorisé (établissement ou service ; noms de colonnes et correspondances, aucune donnée de patient), dans l'export des réglages.
- Nouveaux tests (`tests/import-patients.test.js` ; 196 au vert) ; import d'un fichier fictif en Windows-1252 vérifié dans Chrome.

## 0.6.3 — 7 novembre 2026

Étape 5 (module Patients), troisième sous-étape terminée : **fiche commune complète et séjours**.

- Fiche patient : nom d'usage et nom de naissance, sexe, médecins de 1re et 2e ligne, référents soignants (comptes du service ou nom libre). Chaque changement de médecin, de référents, de protection, du statut de détenu ou de service est gardé avec sa date.
- Séjours successifs : numéro de séjour (IEP), entrée, sortie, unité, chambre et lit ; la liste des patients montre le séjour en cours.
- Onglet *Patients* : *+ Nouvelle fiche* pour un patient sans mesure ; bouton *Fiche* ouvert à tous (lecture seule sans l'accès « Fiches patient ») ; *Mode* réservé aux services de psychiatrie.
- *Administration → Établissement et services → Fiche patient par service* : service de psychiatrie (par défaut ; sinon ni mode d'hospitalisation ni case « patient détenu » sur la fiche, et « Médecin » au lieu de « Psychiatre »), libellés des médecins modifiables. Réglage `fichePatient` (journal du socle, export des réglages, jeu de formation, libellé du journal).
- Journal : libellés des nouveaux champs et des séjours.
- Nouveaux tests (champs, séjours, fusion des séjours, réglages par service, droits ; 191 au vert) ; création d'une fiche, d'un séjour et réglage vérifiés dans Chrome.

## 0.6.2 — 7 novembre 2026

Étape 5 (module Patients), troisième sous-étape, première partie : **droits de la fiche patient et onglet en tête**. Décisions du porteur du 7 novembre 2026.

- Créer ou corriger une fiche patient : IDE, secrétaire et cadre par défaut. **L'AS ne crée plus de fiche** : dans la fenêtre *Nouvelle mesure*, elle choisit une fiche existante ; si la date de naissance manque, un IDE, la secrétaire ou le cadre la complète. La secrétaire peut désormais créer et corriger les fiches (onglet *Patients*). Réglable dans *Rôles et accès* (accès « Fiches patient : créer et corriger »).
- Le mode d'hospitalisation reste saisi avec la mesure : il passe dans l'accès « Début et fin des mesures, changement de lieu, mode d'hospitalisation ». Un rôle créé par l'établissement qui avait l'accès aux fiches sans celui des mesures ne saisit plus le mode.
- La fiche suit le patient lors d'un transfert, même sans le droit de corriger les fiches.
- L'onglet *Patients* appartient au module Patients et s'affiche en tête de la barre d'onglets.
- Tests mis à jour (189 au vert) ; fenêtre *Nouvelle mesure* vue avec le rôle AS dans Chrome.

## 0.6.1 — 7 novembre 2026

Étape 5 (module Patients), deuxième sous-étape : **la fiche patient est tenue par le module Patients**. Aucun changement de calcul : registre, cumuls et échéances identiques.

- Isocont ne reconstitue plus la fiche : il lit à la volée les fiches calculées par Patients (identité, protection, détenu, service, modes d'hospitalisation, fiches fusionnées).
- Historique daté, jamais écrasé : chaque changement de protection juridique, du statut de détenu et du service est gardé avec sa date ; il figure dans l'export du droit d'accès (« Changements de la fiche »).
- Imports et jeu de démonstration : rangés en un lot par journal (réglages communs, fiches patient, mesures), liés. Annuler l'un des lots depuis le journal annule les autres ; « Rétablir » les rétablit ensemble. Le journal indique les lots liés.
- Nouveaux tests (lots liés, annulation et rétablissement conjoints, historique daté, fourniture lue par Isocont ; 189 au vert) ; création d'une mesure pour un nouveau patient vérifiée dans Chrome (fiche et mode dans le journal de Patients, mesure dans celui d'Isocont).

## 0.6.0 — 7 novembre 2026

Étape 5 (module Patients), première sous-étape : **journal et clé propres au module Patients**. Aucun changement à l'écran pour les agents.

- Nouveau module de référence *Patients* (`module-patients.js`) : les saisies de la fiche patient (création et correction, mode d'hospitalisation, fusion de fiches) sont écrites dans son propre journal (`modules\patients\`), chiffrées par sa propre clé. Isocont les lit à la volée et calcule registre, cumuls et échéances comme avant.
- La clé de Patients est remise à qui a droit à Isocont (et à l'administrateur) ; retrait du droit à Isocont : nouvelle génération de la clé de Patients aussi. Un compte sans droit à Isocont ne lit plus les fiches.
- Dossier créé avant cette version : la clé de Patients est créée à la connexion de l'administrateur ; en attendant, les fiches s'écrivent dans le journal d'Isocont, comme avant, et restent lues ensuite.
- Registre des modules : ordre de chargement (Patients avant Isocont), module de chaque type de saisie, modules dépendants, dépendance circulaire refusée.
- *Modules activés par service* : les modules de référence n'y figurent pas (ils suivent les modules qui en dépendent).
- Restent dans le journal d'Isocont jusqu'à la sous-étape suivante : les imports et le jeu de démonstration (enregistrés en un lot).
- Nouveau test `tests/patients-journal.test.js` (187 au vert) ; vérification dans Chrome.

## 0.5.0 — 7 novembre 2026

Étape 4 (trousseau) terminée : **attestation du coffre**, renouvellement des clés après une restauration, option « compromission ». Décisions du porteur du 7 novembre 2026 : un agent qui garde un accès en écriture au partage fait partie de la menace couverte ; renouvellement obligatoire après une restauration ; bouton pour tout renouveler.

- Le coffre est signé par l'administrateur à chaque modification (parties publiques des agents, générations et empreintes des clés, droits des comptes, compteur). L'empreinte de la clé de signature est gardée dans chaque emballage, protégé par le mot de passe, la clé de sécurité ou le code de secours.
- Chaque agent vérifie la signature à l'ouverture de sa session et n'accepte que les générations attestées : une fausse génération glissée dans le coffre est ignorée. Connexion refusée sur un coffre modifié hors de l'outil.
- Avant toute remise de clé, l'administrateur vérifie les comptes (rôles, services, activité), les clés personnelles et la clé de secours : un rôle ajouté ou une clé personnelle substituée hors de l'outil bloque toute remise. Une clé personnelle créée par l'agent lui-même porte une preuve de continuité.
- Version antérieure du coffre recopiée : détectée par les postes qui ont vu une version plus récente et par l'historique du coffre.
- *Comptes et sécurité → Intégrité du coffre* (et bandeau rouge pour l'administrateur) : état attesté, anomalies, réparations : *Renouveler les clés*, *Nouvelle clé personnelle* d'un compte, *Nouveau code de secours*, *Remettre la dernière version attestée*.
- Après toute restauration du coffre (historique, copie sous scellé, copie complète) : les agents ne se connectent pas tant que l'administrateur n'a pas renouvelé toutes les clés (nouvelles clés maîtresses, génération au-dessus de toute génération déjà employée ; les saisies existantes restent lisibles).
- *Tout renouveler* en cas de compromission : clés, clés d'attestation, code de secours, nouvelle clé personnelle et mot de passe provisoire pour chaque compte (l'administrateur garde le sien), fiches de remise.
- Dossiers d'essai d'avant 0.5.0 : attestation établie à la connexion d'un administrateur.
- Journal : libellés des traces du trousseau (génération, passage au trousseau, attestation, renouvellement, compromission) ; une trace de passage au trousseau ne fait plus échouer l'affichage de sa ligne.
- Nouveau test `tests/attestation.test.js` (183 au vert) ; panneau, réparation et compromission vérifiés dans Chrome.

## 0.4.5 — 7 novembre 2026

Étape 4 (trousseau) : **corrections après une relecture indépendante** du code des clés.

- Un compte temporaire arrivé à expiration est traité comme désactivé pour les clés (nouvelle génération, plus de remise) ; la connexion par clé de sécurité est refusée pour un compte expiré ou désactivé.
- Chaque changement de son mot de passe crée une nouvelle clé personnelle : l'ancienne, même copiée, n'ouvre plus les clés remises ensuite. Les clés de sécurité de l'agent sont alors retirées ; l'écran de changement de mot de passe le signale.
- Retrait de sa propre clé de sécurité : le mot de passe est redemandé et la clé personnelle renouvelée (une clé perdue puis retrouvée n'ouvre plus rien). La clé d'un autre agent se retire en réinitialisant son mot de passe.
- Avant chaque écriture du coffre, le trousseau du poste est confronté au coffre relu : clés changées entre-temps → trousseau rouvert ; clé personnelle retirée ou remplacée → verrouillage. Une écriture interrompue ne laisse plus de clé à moitié installée.
- La génération courante d'une clé ne recule jamais ; une enveloppe illisible n'empêche plus d'ouvrir les autres.
- Copie sous scellé signalée « à refaire » aussi quand une clé maîtresse a changé.
- Point ouvert, à trancher par le porteur : signature (attestation) du coffre par l'administrateur, contre un agent qui garderait un accès en écriture au partage (`docs/architecture.md` § 4).
- Nouveau test `tests/trousseau-revue.test.js` (173 au vert) ; retrait d'une clé vérifié dans Chrome.

## 0.4.4 — 7 novembre 2026

Étape 4 (trousseau), quatrième sous-étape : **remise et retrait des clés selon les droits**. Un droit = une clé est désormais effectif.

- La clé d'Isocont n'est remise qu'aux comptes qui ont un rôle d'Isocont et au moins un service où le module est activé (cadre et administrateur selon les règles d'activation ; l'administrateur a toujours toutes les clés). Un agent sans cette clé ne lit pas le journal d'Isocont et en est informé ; les réglages communs (services, établissement) restent lisibles.
- Retrait d'un rôle, désactivation d'un compte, module désactivé pour les services d'un agent : nouvelle génération de la clé concernée, automatique, remise aux seuls détenteurs restants ; l'agent retiré ne lit pas les saisies postérieures, même avec une clé gardée. Retrait du rôle d'administrateur : nouvelle clé maîtresse ; le code de secours lit toujours toutes les générations.
- Premier changement de mot de passe : l'agent crée sa propre clé personnelle, que l'administrateur n'a jamais connue.
- Postes ouverts : trousseau relu quand le coffre change ; accès retiré ou clés renouvelées → verrouillage avec message.
- *Comptes et sécurité* : « Clés à réémettre » liste les comptes au trousseau incomplet, avec réémission.
- Défaut trouvé et corrigé pendant le développement (jamais publié) : une copie de travail du trousseau partageait les octets des clés et pouvait les effacer. Garde-fou ajouté : une clé aux octets tous nuls est refusée.
- Nouveau test `tests/trousseau-droits.test.js` (166 au vert) ; vérification dans Chrome.

## 0.4.3 — 7 novembre 2026

Étape 4 (trousseau), troisième sous-étape : **migration d'un coffre version 1**.

- *Administration → Comptes et sécurité* : panneau « Protection des données : passage au trousseau de clés » pour un dossier encore protégé par une clé unique (dossiers d'essai, sauvegardes d'Isocont reprises). La fenêtre demande le mot de passe de l'administrateur, le code de secours actuel (facultatif) et la confirmation qu'une copie complète a été faite et essayée.
- Aucune saisie n'est modifiée : l'ancienne clé devient la génération 1 de la clé de plateforme et de la clé d'Isocont ; les saisies à venir utilisent une génération 2 propre à chacune. L'administrateur garde son mot de passe ; les autres comptes actifs reçoivent un mot de passe provisoire (fiches de remise). Code de secours repris s'il est saisi, sinon nouveau code affiché. Clés de sécurité à réenregistrer, copie sous scellé à refaire.
- Un poste resté connecté pendant la migration se verrouille et demande une reconnexion.
- « Revenir à la clé unique » : tant que l'ancien coffre est dans l'historique, l'administrateur peut le remettre en place (les saisies faites depuis la migration deviennent illisibles).
- Tests de migration (dossier fictif de la 0.4.0, code repris ou nouveau, jeu de formation, poste resté connecté, retour arrière) ; parcours complet vérifié dans Chrome.

## 0.4.2 — 7 novembre 2026

Étape 4 (trousseau), deuxième sous-étape : **coffre version 2 et trousseau en mémoire**, sans changement à l'écran.

- Un dossier neuf est créé en coffre version 2 (`trousseau.js`) : clé de plateforme et clé d'Isocont tirées de clés maîtresses, clé personnelle de l'administrateur, clé de secours ouverte par le code de secours. Plus aucune clé de données unique.
- Connexion par mot de passe, YubiKey ou code de secours : ouverture de la clé personnelle (ou de secours), puis des enveloppes. Journal du socle, comptes et préférences chiffrés par la clé de plateforme ; journal d'Isocont par la clé du module ; jeu de formation sous la clé du module ; fichiers au nouvel en-tête « SIC2 ».
- Comptes : clé personnelle créée à la création du compte ; à la réinitialisation par l'administrateur, nouvelle clé personnelle et nouvelles enveloppes ; changement de mot de passe par l'agent sans changer sa clé. Code de secours renouvelé : nouvelle clé de secours, l'ancien code n'ouvre plus rien.
- À ce stade, tous les comptes reçoivent toutes les clés de droit (la remise selon les rôles vient en 0.4.4) ; les administrateurs et la clé de secours reçoivent les clés maîtresses.
- Un coffre version 1 (dossier de la 0.4.0) s'ouvre et s'utilise exactement comme avant jusqu'à sa migration (0.4.3).
- Nouveau test `tests/trousseau-session.test.js` ; vérification dans Chrome, identique à la version précédente.

## 0.4.1 — 7 novembre 2026

Étape 4 du plan d'architecture (trousseau), première sous-étape : **briques de chiffrement**, sans effet à l'écran.

- Décisions du porteur sur le trousseau reportées dans `docs/architecture.md` § 4 (clés maîtresses et clé de secours, nouvelle génération automatique, aucun rechiffrement à la migration, YubiKey de secours conservée, nouvelle paire créée par l'agent).
- `crypto.js` : clés personnelles (paires ECDH P-256, partie privée rouverte non exportable), enveloppes d'une clé pour la partie publique d'un agent (ECDH éphémère, HKDF-SHA-256, AES-GCM, liées à leur contexte), générations tirées d'une clé maîtresse, en-tête de fichier « SIC2 » portant le numéro de génération (fichiers actuels lus comme génération 1). Les emballages par mot de passe, code de secours et clé de sécurité peuvent emballer la partie privée d'une clé personnelle.
- Nouveau test `tests/trousseau-crypto.test.js` ; briques vérifiées aussi dans Chrome.

## 0.4.0 — 7 novembre 2026

**Étape 3 du plan d'architecture terminée** : comptes et services au socle, activation des modules par service.

- **Modules activés par service** (*Administration → Établissement et services*, nouveau panneau) : l'administrateur coche, service par service, les modules activés. Réglage enregistré au journal du socle, annulable. Sans réglage, le module est activé pour tous les services (comportement d'origine).
- **Service où le module est désactivé** : données conservées ; aucune saisie possible (refus expliqué) ; consultation par le cadre de santé et l'administrateur seulement, le service étant marqué « consultation seule » dans la liste de l'en-tête ; les autres agents ne le voient plus. Un agent dont tous les services sont désactivés en est informé.
- Dès qu'un module est désactivé pour un service, un service créé ensuite est à activer dans le panneau.
- Règles au socle (`droits.js`), services sur lesquels agit une saisie déclarés par le module (`saisies.cibles`).
- Tests : activation, services visibles, refus des saisies, consultation par l'encadrement, réactivation.

## 0.3.1 — 7 novembre 2026

Étape 3 du plan d'architecture, première partie : **journal du socle et rangement par journal**, sans changement de fonctionnement à l'écran.

- **Rangement** : `socle\` (journal du socle) et `modules\isocont\` (journal d'Isocont, jeu de formation dans `modules\isocont\formation\`), chacun avec ses saisies, ses repères d'intégrité, ses instantanés et sa quarantaine. Plus rien n'est écrit à la racine en dehors du coffre, des préférences et des exports.
- **Aiguillage des saisies** : traces des comptes et des clés, prises d'acte d'intégrité et réglages communs (établissement, services, rôles) au journal du socle ; annulation dans le journal de la saisie visée ; tout le reste au journal du module. L'état d'Isocont se reconstitue à partir des deux journaux.
- **Intégrité journal par journal** : chaînage et repères propres à chaque journal ; une prise d'acte ne couvre que le journal concerné ; chemins complets affichés pour le service informatique.
- **Copies, réparation, quarantaine, dossier de secours, déplacement** : adaptés au rangement par journal. Une copie de sauvegarde d'Isocont (`evenements\` à la racine) se restaure dans `modules\isocont\`.
- Nouveau test `tests/journaux.test.js` ; tests de session adaptés au nouveau rangement (chemins seulement).
- Vérification dans Chrome, comparée à Isocont 1.67 : écrans, saisies, journal, administration et rôles identiques ; rangement et intégrité contrôlés dans le stockage de démonstration.

## 0.3.0 — 7 novembre 2026

**Étape 2 du plan d'architecture : contrat de module et registre des modules**, sans changement de fonctionnement.

- `modules.js` (socle) : registre des modules. Chaque module déclare son contrat (identité, accès, droits, saisies, réglages, onglets, migrations, formation, fournitures, besoins), contrôlé à la déclaration ; son fichier d'interface y ajoute ses vues, les libellés du journal et ses panneaux d'administration. Le registre signale les besoins non satisfaits et les migrations à faire.
- `module-isocont.js` : contrat d'Isocont. La fourniture `isocont.echeancesJLD` (v1) est décrite ; son calcul sera branché avec l'Agenda (étape 6). Aucun besoin tant que le module Patients n'existe pas.
- `droits.js` devient un moule : le socle porte les règles des rôles, des accès et de la visibilité du journal ; les accès cochables, les rôles fournis et leurs droits historiques sont des données d'Isocont (`model.js`).
- La session, la coquille (onglets, vues, journal, administration), *Rôles et accès*, l'export des réglages et le mode formation lisent le contrat du module au lieu du modèle d'Isocont.
- Nouveau test `tests/modules.test.js` : contrat d'Isocont identique à ce qu'exposait le modèle, contrats incomplets refusés, besoins satisfaits par un faux fournisseur, migrations.
- Vérification dans Chrome, comparée à Isocont 1.67 : vues, fenêtres, journal, administration (démonstration et formation), aperçu de chaque rôle et modification d'un rôle identiques.

## 0.2.0 — 7 novembre 2026

**Étape 1 du plan d'architecture terminée** (découper sans changer le comportement).

- **Administration** : la coquille garde le cadre (sous-onglets) et les éléments communs (comptes, rôles, moyens de déblocage, choix du dossier, mode formation, établissement et services, dossier des exports, sauvegardes, réglages, à propos). Les panneaux d'Isocont (appellation des lieux, surveillance, tiers, organisation JLD, règles et pauses, alertes, cas particuliers, registre et statistiques, décompte JLD, reprise des données, archive annuelle) passent dans `ui-isocont.js`, que la coquille lit par `SIC.ui.admin`, dans le même ordre qu'avant.
- Bilan du découpage : `model.js` → `noyau-journal.js`, `droits.js`, `exports-rangement.js` + modèle d'Isocont ; `session.js` → session du socle (un seul point d'appel au module) ; `ui.js` → coquille + `ui-isocont.js` (vues, fenêtres, libellés du journal, panneaux d'administration).
- Vérification dans Chrome, comparée à Isocont 1.67 : chaque sous-onglet de l'administration identique (données de démonstration et mode formation), réglage enregistré depuis un panneau déplacé.

## 0.1.4 — 7 novembre 2026

Étape 1 du plan d'architecture, découpage de l'interface (deuxième bloc d'écran).

- **Journal** : l'affichage (liste, conflits à arbitrer, annulation et rétablissement) reste dans la coquille ; les libellés des saisies d'Isocont (résumés, colonne « Action », effet d'une annulation) passent dans `ui-isocont.js`, que la coquille lit par `SIC.ui.journal`.
- **Correction (défaut de la 0.1.3)** : l'export du registre en PDF et en CSV depuis l'onglet *Registre* ne se faisait plus (aide `exporter` non reprise dans `ui-isocont.js`). Nouveau test `tests/interface-noms.test.js` : tout nom de la coquille employé par un fichier d'interface d'un module doit y être importé.
- Vérification dans Chrome, comparée à Isocont 1.67 : journal, fenêtre d'annulation, annulation enregistrée et export du registre identiques.

## 0.1.3 — 7 novembre 2026

Étape 1 du plan d'architecture, découpage de l'interface (premier bloc d'écran), sans changement de fonctionnement.

- `ui-isocont.js` (module Isocont) : tableau de bord, mesures, JLD, surveillance, registre et fenêtres de saisie (nouvelle mesure, fin, pause, reprise, tiers, JLD, détail, lieu, correction, proposition, professionnels), sortis de `ui.js`. Les vues sont déclarées auprès de la coquille (`SIC.ui.vues`), comme l'étaient déjà *Patients* et *Statistiques*.
- `ui.js` garde la coquille : outils d'affichage, accueil, connexion, en-tête, onglets, fenêtres, exports, thème ; le journal et l'administration seront découpés aux blocs suivants.
- Vérification dans Chrome : écrans et fenêtres identiques à Isocont 1.67, saisie enregistrée normalement.

## 0.1.2 — 7 novembre 2026

Étape 1 du plan d'architecture, deuxième découpage, sans changement de fonctionnement.

- `exports-rangement.js` (socle) : dossier des exports, sous-dossier par service, chemin Windows, conservation et purge, sortis du modèle d'Isocont.
- `session.js` devient la session du socle : droits, journal et exports viennent des fichiers du socle ; la reconstitution de l'état et les réglages par défaut passent par un seul point d'appel au module (`moduleActif()`, le modèle d'Isocont jusqu'au registre des modules de l'étape 2).

## 0.1.1 — 7 novembre 2026

- **Correction : ordre des saisies enregistrées dans la même milliseconde.** À horodatage égal, les saisies étaient classées par leur identifiant, dont la fin est aléatoire : plusieurs saisies enregistrées d'un coup par un même agent (début puis fin d'une mesure, pause d'un isolement et de sa contention, transfert de plusieurs mesures) pouvaient être appliquées dans le désordre, une saisie pouvant alors être ignorée. Elles suivent désormais le chaînage (chaque saisie passe après celle qu'elle cite). Défaut hérité d'Isocont 1.67, révélé par un test qui échouait environ une fois sur dix ; nouveau test `tests/noyau-journal.test.js`.

## 0.1.0 — 7 novembre 2026

Première version de Tessera Santé, sans changement de fonctionnement par rapport à Isocont 1.67.

- **Reprise du code d'Isocont** : application, tests et outils du kit repris à l'identique du dépôt `rodtrip2/Suivi-mesures-isocont` (version 1.67.0, commit 7064f81). L'historique des deux dépôts est relié : le parcours de chaque fichier repris reste consultable depuis Tessera.
- **Étape 1 du plan d'architecture, premier découpage** (`docs/architecture.md` § 11) : le modèle est séparé en trois fichiers.
  - `noyau-journal.js` (socle) : ordre des saisies, lots, annulations et rétablissements, chaînage, conflits, prises d'acte d'intégrité. Aucune règle métier : le module fournit son état initial et l'application de ses saisies.
  - `droits.js` (socle) : rôles, accès, services visibles, visibilité du journal et des onglets.
  - `model.js` : modèle d'Isocont, avec la même interface qu'avant ; les 139 tests repris passent sans modification.
- Numérotation propre à Tessera à partir de 0.1.0 (Isocont s'arrête à 1.67.0).


