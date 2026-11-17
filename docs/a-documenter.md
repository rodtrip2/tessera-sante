# À documenter (fichier de travail)

Mise à jour des documents reportable (décision du porteur du 11 novembre 2026) : la fusion dans `main` peut se faire sans elle (`CLAUDE.md` § 6). Ce fichier garde tout ce qu'il faudra écrire, pour ne rien perdre. **Chaque nouveau développement y ajoute ses lignes**, sur `main` comme dans une branche. Il est vidé quand le porteur demande la mise à jour des documents.

*Vidé le 16 novembre 2026 (version 0.81.1) : le contenu des versions 0.71 à 0.81 est repris dans les documents de référence et gardé en détail dans `docs/historique-decisions.md`.*

## 0.86.0 — Contrôles périodiques (17 novembre 2026)

Décisions du porteur du 17 novembre 2026 : modèles par défaut chariot d'urgence, réfrigérateur à médicaments, sac ou trousse d'urgence (pas de modèle défibrillateur) ; affichage dans l'Agenda et Aujourd'hui ; valeur hors des seuils : écart seulement (pas de second relevé imposé) ; péremptions : alerte avant (30 jours, réglable), écart si dépassée.

- `docs/architecture.md` : module Contrôles (§ 7 sexies) — contrôles périodiques, saisie `CONTROLE_UTILISATION`, fourniture `controles.periodiques` (lue par l'Agenda), réglage `controles[service].periodiques` (cadre pour ses services) ; état du plan (lot K en partie fait).
- `docs/fiche-projet.md` : fonction ajoutée aux contrôles (matériel d'urgence, chaîne du froid).
- Kit : guide du cadre (régler un contrôle périodique), guide IDE / AS (faire un contrôle, signaler une utilisation) ; captures `controles-periodiques`, `controles-periodiques-reglages`.
- Points à valider : modèles et listes à remplacer par la procédure de l'établissement (pharmacie, référent du matériel d'urgence) ; seuils de température ; conservation du registre (celle des contrôles des CSI).

## 0.87.0 — Audits internes (17 novembre 2026)

Décisions du porteur du 17 novembre 2026 : audits seuls (plans d'action plus tard ; écarts vers « Mes tâches ») ; grilles par défaut : circuit du médicament, tenue du dossier, isolement et contention ; une grille remplie une fois par audit ; auditeurs : le cadre et les agents qu'il désigne.

- `docs/architecture.md` : nouveau module `audits` (§ 7 sexies) — journal `modules\audits\`, clé propre, désactivé par défaut ; saisies `AUDIT`, `AUDIT_ANNULE` ; réglage `audits` (`'*'` : grilles de l'établissement ; service : grilles et auditeurs, réglé par le cadre) ; fonction soumise à avis `audit-dossier` ; élément rattachable `audits/audit` (Mes tâches, messagerie) ; état du plan (lot P en partie fait).
- `docs/fiche-projet.md` : module Audits internes.
- `docs/fiche-technique.md` : module (clé propre, référence du séjour sans nom).
- Kit : document du délégué à la protection des données et de la direction des soins (`kit/13`, `kit/17`) — audit de la tenue du dossier : finalité, référence pseudonyme, conservation ; guide du cadre (grilles, auditeurs, résultats) ; captures `audits`, `audits-resultats`.
- Points à valider : grilles à remplacer par celles de l'établissement (pharmacie, qualité, référent isolement et contention) ; audit du dossier (avis) ; durée de conservation des audits.
- `CLAUDE.md` : § 1 (liste des modules : Audits internes) et § 7 (fonction soumise à avis « audit-dossier » : délégué à la protection des données, direction des soins et commission médicale).
