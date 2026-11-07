# Tessera Santé

Plateforme de suivi et d'organisation d'un service de soins : un socle commun (connexion unique, comptes, services, droits, chiffrement, sauvegardes, traçabilité) et des modules activés par service.

| Module | Rôle |
| --- | --- |
| Patients | Fiche commune qui relie les modules entre eux (la liste des patients reste disponible dans le DPI) : identité, séjour, chambre, médecins de 1re et 2e ligne, référents soignants. Import de la liste des patients exportée du DPI. |
| Isolement et contention (Isocont) | Suivi légal des mesures (article L. 3222-5-1 du code de la santé publique) : échéances et envois au juge des libertés et de la détention, registre, rapport annuel. |
| Agenda du service | Accompagnements, activités, réunions et sorties (répétition, check-lists), tâches du service, absences, alertes (dont les échéances JLD des mesures en cours), « Mon agenda ». |

Projet en cours de présentation :

- [Fiche projet](docs/fiche-projet.md) ([PDF](docs/fiche-projet.pdf)), pour la direction des soins ;
- [Fiche technique](docs/fiche-technique.md) ([PDF](docs/fiche-technique.pdf)), pour le service informatique et le responsable de la sécurité informatique.

Pour déployer : [kit de déploiement](kit/README.md) (guide d'installation, procédures de secours, éléments RGPD, guides utilisateur, imports ; PDF dans `kit/pdf/`). Démonstration (données fictives) : https://rodtrip2.github.io/tessera-sante/.

Pour le développement : [architecture](docs/architecture.md) ([PDF](docs/architecture.pdf)) et consignes du projet (`CLAUDE.md`).

Pistes gardées pour plus tard, hors du périmètre soumis à validation : [évolutions futures](docs/evolutions-futures.md).

Le module Isocont reprend l'application [Suivi-mesures-isocont](https://github.com/rodtrip2/Suivi-mesures-isocont).

**Aucune donnée réelle** dans ce dépôt. Les données ne quittent jamais le réseau de l'établissement.

© 2026 Roddy Ricart et les contributeurs du projet — droits d'auteur. Logiciel libre sous licence publique de l'Union européenne (EUPL-1.2), voir `LICENSE`. Il n'est pas un dispositif médical.
