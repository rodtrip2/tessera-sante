# Kit de déploiement — Tessera Santé

Tout ce qu'il faut pour présenter, valider, installer et exploiter Tessera Santé dans un établissement de santé. Les documents existent en Markdown (modifiables) et en PDF (dossier [`pdf/`](pdf/) ; présentation et fiche technique : dossier [`docs/`](../docs/)).

Tessera Santé réunit un **socle commun** (connexion, comptes, services, droits, chiffrement, stockage, sauvegardes, journal) et des **modules** activés service par service : **Patients** (fiche commune), **Isolement et contention**, **Agenda du service**, **Véhicules**, **Suivi médical**, **Vue d'ensemble**, **Demandes de travaux**, **Messagerie**, **Salles et bureaux**, **Informations du service**, **Équipe**, **Documents**, **Congés**, **Contrôles**, **Retours sur Tessera**, **Formations**, **Heures supplémentaires** et **Données cliniques**. Les fonctions qui demandent un avis (données du personnel, données cliniques…) sont livrées **désactivées** ; l'onglet « Validations » de l'administration les range par interlocuteur.

| Document | Pour qui | Usage |
| --- | --- | --- |
| [Fiche projet](../docs/fiche-projet.md) | Direction, direction des soins, encadrement, instances | Présenter le projet et obtenir les décisions |
| [Fiche technique](../docs/fiche-technique.md) | Service informatique (DSI ou direction du numérique, selon l'établissement), responsable de la sécurité informatique (RSSI) | Architecture, sécurité, prérequis, recette technique |
| [03 — Guide d'installation](03-guide-installation.md) | Service informatique, administrateur fonctionnel | Mise en service pas à pas, modules, comptes, imports ; application sur le partage protégée (scripts `outils/mettre-a-jour-outil.ps1` et `outils/verifier-outil.ps1`) |
| [04 — Procédures de secours](04-procedures-secours.md) | Administrateur, cadres, service informatique | Mots de passe, clés, départs, compromission, panne, restauration ; fiche papier dégradée |
| [05 — Éléments RGPD et analyse d'impact (AIPD)](05-elements-rgpd-aipd.md) | Délégué à la protection des données (DPO, référent RGPD) | Fiches du registre des traitements (une par module) et préparation de l'analyse d'impact |
| [06 — Guide utilisateur](06-guide-utilisateur.md) | Tous les agents, cadres, administrateur | Connexion, modules, fiche patient, agenda, isolement et contention, journal |
| [07 — Reprise à partir du registre](07-modele-import-registre.md) | Administrateur fonctionnel, cadres | Format du registre à importer, reconstitution des mesures, contrôles avant import |
| [08 — Guide pratique IDE et AS (isolement et contention)](08-guide-ide-as.md) | IDE, aides-soignant(e)s | Les gestes du quotidien : créer une mesure, pause et reprise, tiers, décompte et envoi au juge, surveillance, fin |
| [09 — Dossier de secours copié par robocopy](09-dossier-secours-robocopy.md) | Service informatique | Copie automatique des données vers un second serveur (script `outils/miroir-robocopy.ps1`), retour après une panne |
| [10 — Travail hors réseau](10-travail-hors-reseau.md) | Service informatique, administrateur, délégué à la protection des données | Postes désignés : outil disponible sans réseau, copie locale des données, conduite en cas de panne |
| [12 — Guide du module Isolement et contention](12-guide-isolement-contention.md) | IDE, AS, secrétariat, cadres, administrateur | Échéances, mesures, pauses, tiers, juge, décompte, surveillance, registre, statistiques, réglages du module |
| [11 — Import de la liste des patients](11-import-liste-patients.md) | Administrateur fonctionnel, secrétariat, administrateur du DPI | Export du dossier patient informatisé (DPI), attribution des colonnes, contrôles |
| [13 — Fiche pour le délégué à la protection des données](13-fiche-delegue-protection-donnees.md) | Délégué à la protection des données (DPO, référent RGPD) | Traitements, comparaison avec les fichiers bureautiques, avis attendus |
| [14 — Fiche pour le responsable de la sécurité informatique](14-fiche-responsable-securite-informatique.md) | Responsable de la sécurité informatique (RSSI) | Modèle de sécurité, corrections de l'audit, limites, points à arbitrer |
| [15 — Fiche pour le service informatique](15-fiche-service-informatique.md) | Service informatique | Infrastructure, exploitation, préparation, mises à jour |
| [16 — Fiche pour les ressources humaines](16-fiche-ressources-humaines.md) | Direction des ressources humaines | Équipe, congés, formations, heures, entretiens ; avis attendus |
| [17 — Fiche pour la direction des soins et la commission médicale](17-fiche-direction-soins-commission-medicale.md) | Direction des soins, commission médicale d'établissement (CME), chefs de pôle | Qualité et sécurité des soins, isolement et contention, décisions attendues |
| [18 — Fiche pour la direction juridique](18-fiche-direction-juridique.md) | Direction des affaires juridiques | Registre légal, preuve, communications, licence, conditions de création |
| [19 — Fiche pour les représentants du personnel](19-fiche-representants-personnel.md) | Représentants du personnel | Ce qui est tracé ou non, protections des agents, conditions de travail |
| [20 — Isolement et contention : calculs et registre](20-calculs-isolement-contention.md) | Cadres, psychiatres, IDE, secrétaires, direction des soins, département d'information médicale, direction juridique | Cumul sur 15 jours, échéances du juge (cycles, délai de sept jours), pauses, inscription au registre ; logigrammes et exemple complet |
