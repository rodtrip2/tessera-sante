# À documenter (fichier de travail)

Mise à jour des documents reportée à la demande du porteur (11 novembre 2026) pour avancer sur le développement ; la fusion dans `main` peut se faire sans elle (`CLAUDE.md` § 6). Ce fichier garde tout ce qu'il faudra écrire, pour ne rien perdre. **Chaque nouveau développement y ajoute ses lignes**, sur `main` comme dans une branche. Il est vidé quand le porteur demande la mise à jour des documents.

Le détail des décisions est aussi dans le document de projet claude.ai `claude/plan-agenda-participants-permissions-sorties.md`.

## Version 0.21.0 (branche `agenda-participants`, fusionnée le 11 novembre 2026 sans documentation)

| Sujet | Décisions du porteur (11 novembre 2026) | Fichiers, saisies, réglages |
| --- | --- | --- |
| Interface de l'Agenda découpée | Sans changement visible | `ui-agenda.js`, `ui-agenda-taches.js`, `ui-agenda-admin.js` ; aides partagées `SIC.ui.agendaInt` |
| « Quel(s) professionnel(s) ? » | Remplace « professionnels prévus » et « accompagnateurs à trouver ». Désignés (sans confirmation) ; nombre demandé : exactement ou au moins, maximum facultatif ; inscription libre, à confirmer, invitations (agents, groupes, rôles), qui se combinent ; un type d'événement peut fixer la façon de s'inscrire. Collègue proposé : confirme ou refuse avec motif. Demande d'un agent : confirmée par l'auteur, un organisateur, le cadre ou un rôle réglé. Au-delà des places : liste d'attente, le premier prend la place ; le cadre fait passer en tête | `agenda-participants.js` ; `participation` de l'événement ; `INSCRIPTION` avec `etat` (inscrit, propose, demande, refuse), `motif`, `prioritaire` ; avis (`genre`) ; bandeau « Votre réponse est attendue » ; réglage `rolesConfirmation` ; préréglages de catégorie `participation`, `inscriptionFixe` |
| « Quel(s) patient(s) ? » | Minimum et maximum de places ; au-delà : liste d'attente ; sous le minimum : alerte (« Patients à inscrire ») | `participation.patientsMin`, `patientsMax` ; `A.placesPatients`, `A.patientsManquants` |
| Événements de plusieurs services | Services co-organisateurs (modifient) ou invités (inscrivent leurs patients et leurs agents, sans modifier) ; l'invité ne voit nommément que ses patients ; choix proposé réglé par service | `services`, `partage` de l'événement ; saisie `PATIENT_INSCRIT` ; contrôles dans `controler` ; réglage `partageDefaut` |
| Permissions : étapes de validation | Processus par mode d'hospitalisation, réglable : étapes (nom, couleur, délai, tâche, rôles qui l'enregistrent, IDE, secrétaire et cadre par défaut). Fournis : soins libres (demandée, validation orale, bon signé) ; SDT, SDTU, SPI (certificat signé par le médecin puis par le directeur, qui fait office de bon) ; SDRE (certificat à signer, envoyé à l'ARS 48 h avant, retour de l'ARS). Retour de l'ARS : accord ; refus ; demande d'éléments complémentaires ou de 2e avis, avec retour à « certificat à signer » et mention. Tâches suggérées (ou ajoutées d'office, réglage). Ancien délai par mode (`delaisPermission`) repris tant que le processus fourni n'est pas remplacé | `agenda-permissions.js` ; `VALIDATION` avec `statut: 'etape'`, `etape`, `processus`, `retourARS`, `mention`, `finale` ; `suivis` de l'événement ; réglages `processPermissions`, `tachesPermission` |
| Professionnels ou structures de la prise en charge | Rubrique de la fiche patient : type (IDEL, foyer, HDJ, CMP…), nom, contact, commentaire, champs ajoutés ; répertoire commun ; saisie par IDE, secrétaire, cadre (accès « Fiches patient ») ; types et champs réglés par l'administrateur ou le cadre | `intervenants.js`, `ui-intervenants.js` ; saisies `INTERVENANT`, `PRISE_EN_CHARGE` (module Patients) ; réglage commun `intervenants` ; onglet *Administration → Patients → Prise en charge* |
| Tâches suggérées | Règle « type → tâche, délai d'anticipation, sortie et / ou permission » par service ; proposée, jamais ajoutée d'office ; tâche obligatoire ajoutée d'office, retirée par le cadre seul, alerte ; blocage de la dernière étape d'une permission en option (désactivé par défaut) | `A.suggestions`, `A.tachesSuggerees` ; réglages `suggestions`, `tachesObligatoiresBloquent` ; `obligatoire` sur un point de check-list |
| Sorties envisagées ou actées | Une seule donnée du séjour : envisagée (jour, fourchette ou approximation) ou actée (date arrêtée par le médecin avec le patient, heure facultative) ; sorties déjà saisies : envisagées ; couleurs par état réglées à part (envisagée, actée, date passée), reprises dans la Vue d'ensemble et l'agenda ; sortie actée : événement de sortie et check-list proposés, ou créés d'office (réglage) | `sorties.js`, `ui-sorties.js` ; `sortiePrevue.etat`, `heure` ; colonne « Sortie envisagée ou actée » (ancien nom gardé pour les formules) ; réglage `sortieEvenement` ; couleurs dans `reglagesDonnees['patients.sortiePrevue']` |
| Réglages par service ouverts au cadre | Principe permanent du porteur : modifiables par le cadre dans l'administration quand c'est possible | Réglage commun `agendaReglages` { '*', <service> } contrôlé par `controlerCadreReglages` ; onglet *Organisation par service* ; le cadre trouve *Patients* et *Agenda du service* dans sa fenêtre Administration (`interface.admin.cadre`) |
| Export du droit d'accès | Décision du porteur : la prise en charge y figure par le type et le nom de chaque professionnel ou structure, sans les coordonnées ni les commentaires internes du service | `intervenants.pourExport`, `ui-qualite.js` (`exporterPatient`) |
| Parcours des écrans versionné | Suggestion de la relecture, acceptée | `tests/ecrans/parcours.py`, `npm run ecrans` (serveur local sur le port 8765) |

## Version 0.21.1 (test de charge, 11 novembre 2026)

Test de charge sur données fictives (`node scripts/charge.cjs [services] [jours]`) : environ 56 saisies par service et par jour (hypothèses en tête du script), soit ~20 000 par service et par an. Mesures sous Node (poste de développement ; un poste hospitalier peut être 2 à 3 fois plus lent) :

| Volume | Recalcul après une saisie, avant → après | Résumé des alertes de l'Agenda, avant → après |
| --- | --- | --- |
| 1 service, 1 an (20 500 saisies) | ~250 ms → 88 ms | 18 ms |
| 3 services, 1 an (61 500) | 700 ms → 230 ms | 88 ms |
| 6 services, 1 an (123 000) | — → 820 ms | 258 ms |
| 3 services, 3 ans (185 000) | — → 1 100 ms | 400 ms → 111 ms |

Déchiffrement : 0,06 ms par saisie ; instantané d'un mois clos : 6 ms. Non mesuré : l'accès au partage réseau (à mesurer sur place).

Améliorations faites (sans changement de résultat, tests d'équivalence) :
- **Tri mémorisé** (`noyau-journal.js`, `trierMemorise`) : le tri des saisies, qui coûtait l'essentiel du recalcul, est fait une fois pour tous les modules ; les saisies ajoutées à la fin ne trient qu'elles-mêmes.
- **Lecture rapide** (`store.js` `lireNouveaux` option `recents`, `session.js` `LECTURE_COMPLETE`) : toutes les 5 s, seuls le mois en cours et le précédent sont listés sur le partage ; lecture complète à la connexion puis toutes les 10 minutes (rattrape une saisie arrivée tard dans un mois clos : poste hors réseau, dossier de secours).
- **Absences lues une fois par période affichée** dans l'Agenda (`prevusAbsents`).

Restes (décision du porteur à prendre) : le recalcul reste proportionnel à tout l'historique (~1 s à 3 ans pour 3 services) ; piste : **recalcul incrémental** (n'appliquer que les nouvelles saisies, recalcul complet sur une annulation ou une saisie en retard). Le partage réseau liste encore ~10 000 fichiers toutes les 5 s pour 3 services ; piste : un sous-dossier par jour. À documenter : fiche technique (performances, lecture rapide), architecture (§ journal).

## Par document

- **`docs/architecture.md`** : § 7 bis (Agenda) : remplacer les lignes « Accompagnateurs » et « Consigne des accompagnateurs » par les deux rubriques ; ajouter événements de plusieurs services, étapes des permissions, tâches suggérées, sorties dans l'agenda, organisation par service. § 7 (Patients) : prise en charge et répertoire ; sortie envisagée ou actée. § 7 quinquies : colonne renommée, couleurs par état. Tableau des décisions (11 novembre 2026) ; état du plan (ligne 0.21.0).
- **`docs/fiche-projet.md`** : Agenda (inscriptions, invitations, liste d'attente, plusieurs services, étapes des permissions avec leurs couleurs, tâches suggérées) ; fiche patient (prise en charge) ; sorties envisagées ou actées ; version.
- **`docs/fiche-technique.md`** : nouveaux fichiers et saisies, réglage `agendaReglages` et son contrôle, passage à « existant » ; parcours des écrans dans la procédure de vérification.
- **`kit/05-elements-rgpd-aipd.md`** : traitement de l'Agenda : inscriptions, refus motivés (motif court, sans donnée de santé), listes d'attente des agents ; traitement des patients : répertoire des professionnels et structures extérieurs (personnes concernées : ces professionnels, coordonnées professionnelles), rattachement aux patients ; délai et étapes des permissions (dont mention d'une demande de l'ARS, sans donnée clinique).
- **`kit/06-guide-utilisateur.md`** : Agenda (les deux rubriques, réponse attendue, liste d'attente, plusieurs services, étapes des permissions, tâches suggérées), fiche patient (prise en charge, sortie), administration (organisation par service, prise en charge).
- **`kit/08-guide-ide-as.md`** : écran de l'événement changé ; captures à régénérer (`python3 scripts/captures-guide-ide-as.py`).
- **`docs/evolutions-futures.md`** : rien de réalisé à retirer ; ajouter si besoin les restes ci-dessous.
- **`CLAUDE.md`** § 7 : nouveaux points à valider (ci-dessous). Le § 6 est déjà à jour (parcours des écrans, documentation reportable).
- **`kit/05-elements-rgpd-aipd.md`** et guide utilisateur : l'export du droit d'accès contient la prise en charge (type et nom).
- **`CHANGELOG.md`** : entrée 0.21.0 (version et empreintes déjà faites à la fusion) ; PDF (`python3 scripts/docs-pdf.py`) ; empreintes (`node scripts/empreintes.mjs`).

## Points à faire valider (pour CLAUDE.md § 7 et le kit)

- **Export du droit d'accès** : la prise en charge y figure par le type et le nom (décision du porteur du 11 novembre 2026), sans coordonnées ni commentaires internes ; à faire confirmer par le délégué à la protection des données.
- Répertoire des professionnels et structures extérieurs : inscription au registre des traitements, durée de conservation.
- Inscriptions, refus motivés et listes d'attente des agents : information des agents.
- Processus des permissions : relecture par les médecins et le secrétariat, surtout en SDRE et selon l'évolution annoncée par l'ARS.

## Restes connus

- Ancien format des permissions et ancien nombre d'accompagnateurs : lus pour les saisies existantes (journal en ajout seul), plus proposés à la saisie.
- Identifiants stables des largeurs de colonnes (hors liste des patients) : non faits.
