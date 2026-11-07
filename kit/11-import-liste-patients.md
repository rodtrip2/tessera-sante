# Import de la liste des patients du dossier patient informatisé

*Pour l'administrateur fonctionnel, le secrétariat et l'administrateur du dossier patient informatisé (DPI) de l'établissement.*

Tessera ne remplace pas le DPI : la fiche patient commune en reprend l'essentiel (identité, séjour, unité, chambre) et y ajoute ce que le DPI ne porte pas (médecins de 1re et 2e ligne, référents soignants, mode d'hospitalisation en psychiatrie). Plutôt que de tout saisir, un agent habilité importe régulièrement la **liste des patients présents** exportée du DPI.

## 1. Préparer l'export (administrateur du DPI)

Une requête ou un état « patients présents » du DPI, exporté en **CSV ou Excel**, une ligne par patient. Colonnes utiles (noms libres, l'outil les reconnaît ou on les attribue à la main) :

| Champ de la fiche | Colonne attendue | Remarque |
| --- | --- | --- |
| IPP (identifiant permanent du patient) | `IPP` | **Fortement conseillé** : sans lui, une réadmission arrive comme un nouveau patient et doit être rattachée à la main |
| Numéro de séjour (IEP) | `IEP`, `NDA` | Change à chaque séjour |
| Nom, prénom, nom de naissance | trois colonnes, ou une seule à découper | Ex. « DUPONT MARIE Née MARTIN » |
| Sexe | `Sexe` | Valeurs du DPI à faire correspondre une fois |
| Date de naissance | `Né(e) le`, `Date de naissance` | JJ/MM/AAAA |
| Date d'entrée | `Entrée` | JJ/MM/AAAA |
| Unité | `RM`, `UM`, `UF` | Code du DPI, à faire correspondre aux services de Tessera |
| Chambre et lit | une colonne à découper (`Loc.`), ou deux colonnes | Ex. `HD412-U` = chambre 412, lit U |

**Ne pas exporter** de commentaires libres ni d'élément clinique : l'outil ignore de toute façon le médecin responsable et les commentaires, mais le fichier transite par le poste de l'agent.

*Exemple : l'export « patients présents » du DPI Sillage* (cas particulier, utilisé au CHHA) : séparateur `;`, encodage Windows-1252, colonnes `IEP`, `Sexe`, `Nom prénom`, `Né·e le`, `Entrée`, `RM`, `RH`, `Loc.`, `Médecin responsable`, `Commentaires`. Il ne contient pas l'IPP : son ajout est à demander à l'administrateur du DPI.

## 2. Importer (agent habilité : IDE, secrétaire ou cadre par défaut)

Onglet *Patients → Importer la liste du DPI…* :

1. **Choisir le fichier.** Il est lu sur le poste et **n'est jamais copié sur le partage**. Supprimez-le de votre poste après l'import.
2. **Attribuer les colonnes.** Pour chaque champ de la fiche, l'outil propose une colonne ; corriger si besoin. Une même colonne peut servir à plusieurs champs (nom complet découpé). Un champ sans colonne est marqué « Non fourni par l'export : à renseigner dans Tessera » : l'import n'y touchera jamais.
3. **Faire correspondre les unités et le sexe.** Chaque code d'unité du DPI est rattaché à un service, ou écarté de l'import (par exemple les unités qui n'utilisent pas Tessera).
4. **Vérifier l'aperçu** :
   - patients nouveaux, fiches modifiées (ancienne → nouvelle valeur), séjours mis à jour ;
   - **même patient probable** (nom, prénom, nom de naissance, date de naissance, sexe) : choisir *Même patient que…*, *Autre patient : nouvelle fiche* ou *Ne pas importer cette ligne* ;
   - noms au découpage incertain (plus de deux mots sans repère) : vérifier nom et prénom ;
   - champs corrigés à la main dans Tessera depuis le dernier import : **jamais écrasés**, l'écart est signalé ;
   - patients absents de la liste : une sortie est proposée, jamais appliquée d'office.
5. **Enregistrer.** L'import forme un seul lot, tracé au journal et **annulable en une fois**.

Le **modèle d'import** (colonnes attribuées, correspondances) est mémorisé pour l'établissement, ou pour un service si son export diffère : les imports suivants se font en quelques clics. Il fait partie de l'export des réglages.

## 3. Fréquence et ordre

- À la mise en service, après la reprise de l'historique de l'isolement et de la contention (document 07), qui a déjà créé les fiches des patients concernés.
- Ensuite, aussi souvent que l'organisation le demande (chaque jour ouvré, ou à chaque entrée) : chaque import ne fait que compléter et mettre à jour.

## 4. Contrôles conseillés au premier import

- [ ] Une fiche de test connue (patient fictif dans un fichier de test) : nom, prénom, nom de naissance, date de naissance, séjour et chambre corrects.
- [ ] Un patient réadmis : rattaché à sa fiche existante, pas de doublon.
- [ ] Une correction faite à la main dans Tessera, puis un nouvel import : la correction est conservée et l'écart signalé.
- [ ] Annulation du lot de test depuis le journal.
