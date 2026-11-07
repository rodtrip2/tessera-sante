# Évolutions futures

Évolutions étudiées avec le porteur du projet et gardées pour plus tard. Elles ne font pas partie du périmètre soumis à validation (fiche projet) ; chacune reste à retravailler et à valider avant tout développement.

| Évolution | Origine | Niveau |
| --- | --- | --- |
| Documents et outils de bureautique | Tessera Santé, 6 novembre 2026 | Idée à retravailler |
| Connexion avec la session Windows | Suivi-mesures-isocont, 2 novembre 2026 | Étude technique faite, à adapter au socle |
| Stockage sur un partage autre que SMB | Suivi-mesures-isocont, 2 novembre 2026 | Demande, à étudier |

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
