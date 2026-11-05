# Fiche projet — Tessera Santé

*Plateforme de suivi et d'organisation d'un service de soins : patients, mesures d'isolement et de contention, agenda du service. Logiciel libre (licence EUPL-1.2), gratuit. Document présenté au cadre supérieur de santé et au directeur des soins.*

*Porteur : Roddy Ricart, faisant fonction cadre de santé (pôle santé mentale, UHP). Version du 5 novembre 2026.*

| En bref | |
| --- | --- |
| **Objet** | Réunir dans un seul outil, avec **une seule connexion**, ce dont un service a besoin au quotidien et que le dossier patient informatisé (DPI) ne couvre pas : le suivi légal des mesures d'isolement et de contention et l'agenda du service. Ces modules s'appuient sur une **fiche patient commune** : la liste des patients du service est disponible dans le DPI, mais Tessera en a besoin pour relier ses modules entre eux. |
| **Trois modules** | **Patients** (fiche commune), **Isolement et contention** (Isocont), **Agenda du service**. D'autres pourront s'ajouter, chacun après validation. |
| **Pour qui** | Infirmiers, aides-soignants, secrétariat médical, cadres de santé ; direction des soins pour le pilotage et le rapport annuel. |
| **Coût** | Aucun coût de licence. Développement réalisé par le porteur sur son temps personnel. Mise en place : quelques heures du service informatique (DSI ou direction du numérique, selon l'établissement), une formation courte des équipes. |
| **Où sont les données** | Dans un dossier du réseau de l'établissement, chiffrées. Rien n'est envoyé à l'extérieur. |
| **Ce que l'outil ne fait pas** | Il ne remplace ni le DPI, ni la prescription médicale, ni la surveillance clinique, ni les transmissions. Il ne contient aucune donnée clinique. |

## 1. Contexte

**Une obligation légale exigeante.** L'article L. 3222-5-1 du code de la santé publique encadre strictement l'isolement et la contention en psychiatrie : décisions médicales pour des durées limitées, renouvellements, information du juge des libertés et de la détention (JLD) puis saisine au-delà de seuils de durée cumulée, information des proches, et tenue d'un **registre** dans chaque établissement. Ce registre, sans données nominatives, est consultable par la commission départementale des soins psychiatriques (CDSP), le Contrôleur général des lieux de privation de liberté (CGLPL) et les parlementaires ; il alimente un **rapport annuel**. Les délais reposent sur des calculs délicats (cumul sur quinze jours glissants, mesures qui se succèdent, rythme particulier des mesures longues). Une erreur ou un retard peut conduire le juge à ordonner la mainlevée de la mesure.

**Une organisation du service mal outillée.** La liste des patients du service est disponible dans le DPI. En revanche, quel psychiatre suit tel patient en première ligne, quels soignants sont ses référents, quelles échéances tombent dans la semaine : ces informations sont dispersées entre des tableaux, des cahiers et la mémoire des équipes.

**Des outils bureautiques fragiles.** Les équipes compensent avec des tableaux et des classeurs Excel. À l'UHP, un classeur Excel avec macros suit les mesures d'isolement et de contention. Ces fichiers se verrouillent quand deux postes y saisissent en même temps, se corrompent, sont mal protégés, et chaque nouvel outil ajoute un fichier, un mot de passe, une procédure.

**Ce que fait le DPI, et ce qu'il ne fait pas.** Le DPI couvre de plus en plus la prescription et la surveillance infirmière des mesures. En revanche, le suivi des durées cumulées, le calendrier des communications au JLD, le registre et la vue d'organisation du service y sont souvent absents ou insuffisants.

## 2. Le projet

Tessera Santé est une plateforme composée d'un **socle commun** et de **modules**.

- **Le socle** gère ce qui est commun : connexion, comptes, services, droits, chiffrement, sauvegardes, traçabilité, impression, administration.
- **Chaque module** répond à un besoin précis et s'y branche.

| Principe | Ce que cela veut dire pour les équipes |
| --- | --- |
| Une seule connexion | Un identifiant et un mot de passe (ou une clé de sécurité) ouvrent tous les modules auxquels l'agent a droit. |
| Modules par service | L'établissement choisit quels modules sont ouverts dans quel service. |
| Droits par rôle | Dans chaque module, l'agent ne voit et ne fait que ce que son rôle permet. Un agent pourra, si besoin, avoir un rôle différent selon le service. |
| Modules qui communiquent | Un module affiche une information calculée par un autre : par exemple, les échéances JLD dans l'agenda du service. |
| Administration unique | Un onglet général pour les éléments communs, un onglet par module. |
| Ouverture | La fiche patient et le socle ne supposent pas la psychiatrie : d'autres disciplines pourront utiliser la plateforme. |

Le nom vient de la *tessera hospitalis* romaine, le jeton d'hospitalité qui garantissait l'accueil chez un hôte. Une *tessera* est aussi une pièce de mosaïque, comme chaque module.

## 3. Module Patients

La fiche patient est commune à tous les modules : elle relie Isocont, l'Agenda et les modules à venir, qui s'appuient tous sur elle. Elle ne remplace pas la liste des patients du DPI : elle en reprend l'essentiel par import et y ajoute ce que le DPI ne porte pas. Elle concerne tous les patients du service, qu'ils fassent ou non l'objet d'une mesure.

| Information | Source |
| --- | --- |
| IPP (identifiant permanent du patient), nom, prénom, noms de naissance et d'usage, date de naissance, sexe | Liste des patients exportée du DPI, ou saisie |
| Séjour : entrée, sortie, unité ; chambre | Liste exportée du DPI, ou saisie |
| Médecin de 1re ligne, médecin de 2e ligne | Saisie dans Tessera |
| Référents soignants (un ou plusieurs) | Saisie dans Tessera, parmi les agents du service |
| Protection juridique, patient détenu, mode d'hospitalisation et son historique | Saisie dans Tessera |

- **Import de la liste des patients du DPI** : un agent exporte la liste en CSV depuis le DPI et l'importe dans Tessera. Les colonnes sont attribuées au moment de l'import, car l'export diffère d'un DPI à l'autre ; ce choix est mémorisé pour les imports suivants. Une information que l'export ne fournit pas se saisit dans Tessera. Un aperçu montre les patients nouveaux, les changements, les doublons possibles et les patients absents de la liste (la sortie est proposée, jamais appliquée d'office).
- **Médecins et référents saisis dans Tessera** : le médecin référent inscrit au DPI n'est pas toujours celui qui suit le patient au moment présent. Ils pourront être importés plus tard si le DPI les porte.
- **Historique** : un changement de médecin, de référent ou de mode d'hospitalisation est daté ; rien n'est écrasé.
- **Doublons et fusion** de fiches, avec aperçu de l'effet sur les autres modules.
- **Droit d'accès d'un patient** : un seul export réunit ses données de tous les modules.

## 4. Module Isolement et contention (Isocont)

| Fonction | Détail |
| --- | --- |
| Report des décisions médicales | L'IDE ou l'AS reporte le début et la fin de chaque mesure (psychiatre décisionnaire, date, heure, lieu), les levées temporaires et leur reprise. |
| Échéances JLD | Calcul automatique des dates limites d'information, de saisine et de décision, cycle par cycle, avec alertes visuelles. Calculs vérifiés par des tests automatiques. |
| Envois JLD | Secrétariat (et IDE le week-end) : enregistrement des informations, saisines et décisions reçues ; repérage des envois hors délai. |
| Décompte JLD | Document imprimable ou PDF détaillant la durée cumulée, à joindre à la saisine, à la présentation de l'établissement. |
| Information des proches | Traçabilité par cycle : qui a informé, quel proche, ou pourquoi personne n'a pu l'être. |
| Surveillance en chambre de soins intensifs (CSI) | Professionnels présents par poste, nécessaires au registre. |
| Registre | Conforme à l'article L. 3222-5-1 : IPP, âge, mode d'hospitalisation, début, durée, psychiatre, soignants ; catégories A à E ; numérotation annuelle ; impression et export. Version occultée pour les demandes de communication d'un tiers (commission d'accès aux documents administratifs, CADA). |
| Rapport annuel | Indicateurs « L'isolement et la contention en chiffres » (année N et N-1), suivi réglementaire, export pseudonymisé. |
| Vigilance | Tableau de bord : échéances proches ou dépassées, proches à informer, patients en soins libres, mineurs, cumuls élevés. |
| Alertes de l'établissement | Par exemple : informer sans délai le cadre de garde quand un patient en soins libres est mis en isolement, avec traçabilité de l'information. |
| Reprise de l'historique | Mise en production sans aucune donnée, puis import de l'historique : registre du service quel que soit l'outil d'origine, ou classeur Excel existant. L'import crée à la fois les fiches patient et les mesures, avec aperçu avant de confirmer ; il est annulable. |

## 5. Module Agenda du service

- **Calendrier du service** où apparaissent automatiquement les **échéances JLD** des mesures en cours, calculées par le module Isocont et toujours à jour.
- Selon le choix de l'établissement, l'agenda affiche le patient par la référence de la mesure, ses initiales, son IPP ou son nom ; un clic ouvre la mesure pour qui y a accès.
- Le contenu détaillé de l'agenda (autres événements du service) sera défini avec les équipes.

## 6. Organisation et rôles

| Rôle | Dans l'outil |
| --- | --- |
| IDE et aide-soignant(e) (AS) | Fiches patient (selon le réglage), report des décisions de début, de fin et de pause, information des proches, surveillance en CSI, envois JLD le week-end. |
| Secrétaire | Fiches patient (selon le réglage), envois et suivi JLD, décomptes. |
| Cadre de santé | Organisation du service, corrections tracées, registre, statistiques. |
| Administrateur | Comptes, services, modules ouverts par service, rôles, paramétrage, imports, clés de secours. Rôle cumulable avec celui de cadre, mais séparable. |
| Psychiatres | Non utilisateurs à ce stade : décision et prescription restent dans le DPI. |
| Service informatique | Dossier réseau, publication de l'application, sauvegardes, postes. |
| Délégué à la protection des données (DPO, référent RGPD) | Registre des traitements, analyse d'impact. |

Les rôles et leurs droits sont modifiables par l'établissement. Chaque agent ne voit que les services qui lui sont affectés. Les comptes temporaires (intérimaires, stagiaires) expirent automatiquement.

## 7. Sécurité et conformité

- **Les données restent dans l'établissement**, sur un dossier du réseau, chiffrées (AES-256) sur le poste avant d'y être écrites.
- **Aucun serveur à installer, aucune connexion sortante** : l'application est un ensemble de fichiers qui ne peuvent rien envoyer sur Internet. Elle fonctionne avec Edge ou Chrome.
- **Un module, une clé de chiffrement** : un agent ne peut déchiffrer que les modules auxquels il a accès. Quand un droit est retiré, l'agent perd l'accès aux nouvelles saisies ; les autres agents gardent l'accès à tout l'historique.
- **Accès nominatifs**, mot de passe personnel imposé à la première connexion, verrouillage automatique, clés matérielles (YubiKey) et code de secours papier pour l'administration.
- **Traçabilité** : chaque saisie est nominative, horodatée, jamais effacée ; les corrections et annulations sont elles-mêmes tracées. Plusieurs postes saisissent en même temps sans perte.
- **Sauvegardes et secours** : copies complètes, dossier de secours, travail hors réseau, procédure dégradée papier.
- **Hébergement de données de santé** : les données n'étant confiées à aucun prestataire, la certification d'hébergeur de données de santé (HDS) ne devrait pas s'appliquer ; la qualification revient au délégué à la protection des données et au service informatique.
- **RGPD** : un traitement par module, à inscrire au registre des traitements ; une analyse d'impact est probablement requise (données de santé de personnes vulnérables). **Aucune donnée réelle avant l'avis du service informatique et du délégué à la protection des données.**

## 8. Bénéfices attendus et indicateurs de suivi

| Bénéfice | Indicateur proposé |
| --- | --- |
| Moins de communications au JLD hors délai | Nombre de cycles avec au moins une communication hors délai |
| Registre complet et conforme | Part des entrées avec soignants renseignés ; délai de production du registre |
| Rapport annuel produit sans ressaisie | Temps consacré à sa préparation |
| Meilleure information des proches | Part des mesures avec information renseignée |
| Organisation du service lisible | Part des patients présents avec médecin de 1re ligne et référent renseignés |
| Un outil au lieu de plusieurs | Nombre de tableaux et fichiers de suivi abandonnés |
| Fiabilité | Nombre d'incidents (perte de saisie, fichier inaccessible) |

## 9. État d'avancement

- **Module Isocont** : développé sous forme d'application web, documenté (guides, fiche technique, éléments RGPD), vérifié par des tests automatiques. Il n'a jamais été utilisé avec des données réelles.
- **Socle commun, modules Patients et Agenda** : architecture définie, à construire en reprenant le code d'Isocont.

## 10. Démarche

| Étape | Contenu |
| --- | --- |
| 1. Présentation | Cette fiche au cadre supérieur de santé et au directeur des soins. |
| 2. Construction | Socle commun, modules Patients et Agenda, intégration d'Isocont. Chaque étape aboutit à une version vérifiée. |
| 3. Validation | Fiche technique revue par le service informatique et le responsable de la sécurité informatique (RSSI) ; registre des traitements et analyse d'impact par le délégué à la protection des données. |
| 4. Installation et paramétrage | Dossier réseau, publication, services, comptes, clés de secours ; import de l'historique et de la liste des patients. Environ une demi-journée du service informatique et une demi-journée de paramétrage. |
| 5. Pilote à l'UHP | En parallèle des outils actuels, avec comparaison des échéances. 1 à 2 mois. L'outil peut être utilisé dans sa **version publiée sur GitHub** : le porteur garde la maîtrise des évolutions jusqu'à maturité des modules, sans solliciter le service informatique à chaque version. Seul le code y est hébergé ; les données restent sur le réseau de l'établissement. Double authentification activée sur le compte GitHub. |
| 6. Bilan et généralisation | Bilan présenté à la direction des soins ; installation sur l'intranet de l'établissement une fois les modules mûrs ; autres unités, abandon des outils antérieurs. |

Formation : 20 à 30 minutes par agent, avec un **mode formation** sur données fictives.

## 11. Risques et parades

| Risque | Parade |
| --- | --- |
| Maintenance dépendante d'une seule personne | Logiciel libre, documenté et testé, repris par toute équipe ou tout autre établissement. |
| Extension sans limite du périmètre | Chaque nouveau module validé avant développement ; aucune donnée clinique. |
| Confusion avec le DPI | Périmètre écrit et rappelé : le DPI reste la référence clinique. |
| Charge de saisie | Import de la liste des patients du DPI ; saisie limitée à ce que le DPI ne fournit pas. |
| Perte des moyens de déverrouillage | Clés matérielles d'administration dont une au coffre, code de secours papier scellé, procédure testée chaque année. |
| Indisponibilité du réseau | Travail hors réseau, procédure dégradée papier, ressaisie avec les heures réelles. |
| Outil non reconnu comme support du registre | Décision institutionnelle avant la mise en production. |

## 12. Logiciel libre et gouvernance

Le code est publié sous **licence publique de l'Union européenne (EUPL-1.2)** : chaque établissement peut l'utiliser, l'étudier, l'adapter et le redistribuer. Il est fourni sans garantie et sans support commercial. Un établissement peut déployer une version qu'il a lui-même vérifiée et figée.

Le logiciel n'est pas un dispositif médical : il n'émet aucune recommandation clinique et n'intervient pas dans la décision.

## 13. Décisions attendues

- [ ] Accord de la direction des soins pour poursuivre le projet Tessera Santé.
- [ ] Validation du périmètre : modules Patients, Isolement et contention, Agenda du service.
- [ ] Accord pour présenter le projet au service informatique, au responsable de la sécurité informatique et au délégué à la protection des données.
- [ ] Reconnaissance de l'outil comme support du registre prévu à l'article L. 3222-5-1, ou articulation avec le registre existant.
- [ ] Accord pour un pilote à l'UHP, une fois ces validations obtenues.
- [ ] Désignation de l'administrateur fonctionnel et des détenteurs des clés de secours.

**Roddy Ricart — Faisant fonction cadre de santé** — **Date :** ........ / ........ / ................

---
*Sources : [article L. 3222-5-1 du code de la santé publique](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048447133) ; [Agence du numérique en santé, champ d'application de l'hébergement de données de santé](https://esante.gouv.fr/faq/quel-est-le-champ-dapplication-de-la-legislation-relative-lhebergement-de-donnees-de-sante-caractere-personnel) ; [CNIL, liste des traitements pour lesquels une analyse d'impact est requise](https://www.cnil.fr/sites/default/files/atoms/files/liste-traitements-avec-aipd-requise-v2.pdf). Ce document ne constitue pas un avis juridique.*
