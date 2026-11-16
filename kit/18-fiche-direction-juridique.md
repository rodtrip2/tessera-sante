# Fiche pour la direction juridique — Tessera Santé

*Destinataire : direction des affaires juridiques de l'établissement. Objet : présenter les questions de droit soulevées par Tessera Santé (registre légal, droits des patients et des agents, preuve, conservation, licence, conditions de création), ce que l'outil change par rapport aux fichiers Word et Excel des services, et les points sur lesquels votre avis est attendu. Version du 16 novembre 2026 (Tessera 0.77).*

| En bref | |
| --- | --- |
| **Ce que c'est** | Un outil d'organisation d'un service de soins, dont un module suit les mesures d'isolement et de contention (art. L. 3222-5-1 du code de la santé publique) et produit le registre légal. |
| **Licence** | Logiciel libre sous licence publique de l'Union européenne (EUPL-1.2), fourni sans garantie ni support commercial. |
| **Données** | Restent dans l'établissement, chiffrées ; aucun prestataire, aucune transmission extérieure. |
| **Ce qui vous est demandé** | Avis sur le statut du registre, la valeur des traces, les communications, la conservation, l'information des proches, la licence et les conditions de création du logiciel (§ 6). |

## 1. Ce que vous cherchez, ce que vous gardez sous votre contrôle

Vous cherchez à sécuriser l'établissement : conformité aux textes, preuve en cas de contentieux, maîtrise des communications, responsabilité. Tessera ne tranche aucune de ces questions à votre place : il les rend explicites et applique les choix de l'établissement.

- **Les règles légales sont documentées** (règles métier du module, validées une à une) et **les choix d'interprétation sont des réglages** de l'établissement, avec une note explicative (déduction des pauses, délai de sept jours, désignation du juge, passage en soins somatiques).
- **Les données restent la propriété et sous la responsabilité de l'établissement**, sur son infrastructure.
- **L'outil est une aide** : les décisions restent médicales, judiciaires ou administratives ; l'outil calcule, rappelle et trace.

## 2. Ce qui change par rapport aux fichiers Word et Excel sur le partage

| Question juridique | Fichiers Word et Excel sur un partage | Tessera Santé |
| --- | --- | --- |
| **Preuve d'une action** (information du juge, des proches, surveillance) | Cellule modifiable sans trace, auteur inconnu, date incertaine | Saisie nominative, horodatée, **signée par la clé de son auteur**, jamais effacée ; correction et annulation tracées avec motif ; historique complet |
| **Respect des délais légaux** | Calcul manuel ; erreur de formule invisible | Calcul documenté et testé ; alertes avant l'échéance ; méthode prudente retenue en cas de doute |
| **Registre** (art. L. 3222-5-1) | Reconstitué, complétude incertaine | Produit à partir des saisies ; version pour communication |
| **Communication de documents administratifs** (code des relations entre le public et l'administration, CRPA ; commission d'accès aux documents administratifs, CADA) | Occultations faites à la main | Version du registre préparée pour la communication |
| **Droit d'accès des patients** (art. 15 du RGPD ; art. L. 1111-7 du code de la santé publique pour le dossier médical, qui reste dans le DPI) | Recherche manuelle dans des fichiers dispersés | Export par patient, module par module, avec vérification des informations concernant un tiers |
| **Confidentialité, secret professionnel** | Fichiers lisibles par toute personne ayant des droits sur le dossier | Chiffrement ; lecture réservée aux rôles habilités |
| **Conservation et effacement** | Fichiers conservés sans règle | Durées réglables ; journal en ajout seul (l'effacement et l'archivage restent à concevoir pour la fin des durées de conservation) |

## 3. La traçabilité des tâches, une sécurité juridique

La traçabilité informatisée des tâches d'un service améliore la qualité des soins : ce qui doit être fait est rappelé, ce qui a été fait est daté. Elle constitue aussi, pour l'établissement, une **preuve organisée** de la diligence des équipes : respect des délais de communication au juge, information des proches, surveillance, contrôles. À l'inverse, elle révèle les manquements : c'est sa raison d'être en matière de qualité, et un point à expliquer aux équipes (usage du journal : document 19).

## 4. Points de droit propres au module Isolement et contention

- **Désignation du juge** : depuis le 1er septembre 2024, le texte désigne le magistrat du siège du tribunal judiciaire ; l'appellation affichée est réglable (« juge » par défaut, « JLD » conservé au choix).
- **Délai de sept jours** (art. L. 3222-5-1, II ; Cass., avis, 6 mars 2024, n° 23-70.017) : pour l'isolement, après deux décisions de maintien, l'outil compte le délai aussi depuis la précédente décision du juge et retient l'échéance la plus proche ; un message type au greffe du tribunal, intégré à l'outil, permet de faire confirmer le point de départ (heure de l'ordonnance, de sa notification ou de sa réception).
- **Nouvelle mesure dans les 48 heures après une mainlevée** : signalée, avec rappel des éléments nouveaux exigés.
- **Information des proches** : portée pratique de la décision n° 2024-1127 QPC pour les majeurs protégés (tuteur ou curateur), à confirmer.
- **Pauses** (levées temporaires) : déduction ou non de leur durée, à décider par l'établissement.

## 5. Licence et conditions de création

- **Licence EUPL-1.2** : chaque établissement peut utiliser, étudier, adapter et redistribuer le logiciel ; absence de garantie ; compatibilité avec la politique de l'établissement en matière de logiciels libres à confirmer.
- **Conditions de création** : Tessera Santé a été développé par le porteur (faisant fonction cadre de santé) chez lui, sur son temps personnel et avec ses propres moyens (quelques consultations et essais sur un poste de l'établissement). Le module Isolement et contention reprend la logique de calcul d'un classeur Excel que le porteur a créé au travail et qu'utilise aujourd'hui son service ; ce classeur n'a pas été publié. Une **annexe descriptive à la fiche projet** retrace ces conditions ; la qualification des droits qui en découlent vous revient.

## 6. Points sur lesquels votre avis est attendu

- [ ] Statut du registre produit par Tessera (support officiel ou articulation avec le registre existant) ; version communiquée au titre du CRPA.
- [ ] Valeur probante des saisies signées et du journal ; conservation des registres (contrôles, bris de glace).
- [ ] Point de départ du délai de sept jours (avec le greffe) ; acceptation du décompte au format CSV par le greffe.
- [ ] Information des proches des majeurs protégés (décision n° 2024-1127 QPC).
- [ ] Droit d'accès : exclusion des informations concernant un tiers ; données des modules arrêtés.
- [ ] Licence EUPL-1.2 et conditions de création du logiciel (annexe à la fiche projet).
- [ ] Liste des codes CIM : conditions d'utilisation du fichier officiel par l'établissement (licence CC BY-NC-ND 3.0 IGO indiquée par l'Agence du numérique en santé, droits de l'Organisation mondiale de la santé) ; Tessera ne la fournit pas, l'établissement l'importe.
- [ ] Usage de GitHub Pages pendant le pilote (conditions d'utilisation du service ; seul le code y est servi).

## 7. Documents de référence

Fiche projet et son annexe ; règles métier du module Isolement et contention (`docs/consignes-isocont.md`) ; guide du module (document 12) ; éléments RGPD (document 05).
