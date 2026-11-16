// SPDX-License-Identifier: EUPL-1.2
/*
 * Test de charge (données fictives) : plusieurs services en usage quotidien pendant plusieurs années, tous modules.
 *
 *   node --max-old-space-size=6000 scripts/charge.cjs [services, défaut 3] [années, défaut 1] [options]
 *     --clinique       données cliniques activées (désactivées par défaut dans Tessera)
 *     --pieces         pièces jointes de la messagerie activées (désactivées par défaut)
 *     --disque <dir>   écrit aussi les fichiers chiffrés de la première année du premier service dans <dir> (mesure réelle
 *                      de la place occupée et du temps de lecture du dossier)
 *     --json <fichier> ajoute le résultat (une ligne JSON) à <fichier>
 *
 * Mesure, sous Node (ordres de grandeur proches d'un navigateur récent ; un poste hospitalier peut être 2 à 3 fois plus
 * lent) :
 * - le volume : saisies par module, octets chiffrés et signés par saisie (échantillon réel AES-GCM + ECDSA P-256),
 *   place occupée sur un disque à blocs de 4 Ko (NTFS, ext4), instantanés mensuels, documents, pièces jointes ;
 * - la première lecture d'un poste : déchiffrement et vérification de signature des saisies ;
 * - la reconstitution de l'état de chaque module (complète, puis après l'arrivée d'une saisie) et la mémoire occupée ;
 * - les calculs d'affichage les plus lourds (registre, statistiques, échéances du juge, Agenda).
 * Ne mesure pas l'accès au partage réseau (liste des dossiers, lecture des fichiers) : à mesurer sur place.
 * Volumes par service et par jour : VOLUMES ci-dessous (hypothèses, à ajuster).
 */
'use strict';
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
const { performance } = require('node:perf_hooks');
const fs = require('node:fs'), path = require('node:path');
const R = '../app/js/';
globalThis.SIC = { rules: require(R + 'rules.js'), crypto: require(R + 'crypto.js') };
SIC.model = require(R + 'model.js');
SIC.modules = require(R + 'modules.js');
SIC.champs = require(R + 'champs.js');
SIC.couleurs = require(R + 'couleurs.js');
SIC.patients = require(R + 'module-patients.js');
require(R + 'module-isocont.js');
SIC.medecins = require(R + 'medecins.js');
SIC.agendaParticipants = require(R + 'agenda-participants.js');
SIC.agendaPermissions = require(R + 'agenda-permissions.js');
const A = SIC.agenda = require(R + 'module-agenda.js');
SIC.suivi = require(R + 'module-suivi.js');
require(R + 'module-vehicules.js');
require(R + 'module-vue.js');
['messagerie', 'documents', 'conges', 'heures', 'formations', 'controles', 'travaux', 'salles', 'infos', 'equipe', 'retours', 'clinique']
  .forEach(m => require(R + 'module-' + m + '.js'));
const M = SIC.model, C = SIC.crypto, SG = require(R + 'signatures.js'), N = require(R + 'noyau-journal.js');

const args = process.argv.slice(2), opt = n => args.indexOf(n) >= 0, val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const positionnels = args.filter((a, i) => !/^--/.test(a) && !/^--/.test(args[i - 1] || ''));
const NB_SERVICES = +positionnels[0] || 3, ANNEES = +positionnels[1] || 1, JOURS = Math.round(365 * ANNEES), LITS = 20, AGENTS = 35;
const CLINIQUE = opt('--clinique'), PIECES = opt('--pieces'), DISQUE = val('--disque'), JSON_SORTIE = val('--json');

// Hypothèses de volume, par service et par jour (moyennes) : unité de 20 lits, 35 agents, usage quotidien de tous les modules
const VOLUMES = {
  // Patients et Vue d'ensemble
  admissions: LITS / 30, fiche: 3, sortiePrevue: 1, valeurs: 8,
  // Isolement et contention : mesures (début, tiers, juge, pause, fin, entretien), surveillance (2 agents × 3 postes)
  mesures: 0.5, professionnels: 6,
  // Agenda, Suivi médical, Véhicules
  tachesFaites: 15, rdv: 3, occurrence: 1, check: 5, inscription: 3, validation: 1, commentaire: 1, alerte: 2, absence: 0.3,
  suivi: 5, presence: 0.3, reservation: 1,
  // Messagerie : messages, lectures confirmées (≈ 12 lecteurs par message), réponses
  messages: 4, lecteurs: 12, reponses: 2,
  // Documents : créations, versions (enregistrement automatique après 15 s sans frappe), partages, images
  documents: 0.2, versions: 4, partages: 0.2, images: 0.02,
  // Congés, heures supplémentaires, formations (35 agents)
  conges: 1.2, heures: 2, formations: 0.2,
  // Contrôles des CSI (2 CSI × 3 postes, confirmés par un second agent), travaux, salles, équipe, retours
  controles: 6, travaux: 0.3, salles: 2, equipe: 0.2, retours: 0.05, exports: 2,
  // Données cliniques (option) : feuille de staff hebdomadaire, notes
  staff: CLINIQUE ? LITS / 7 : 0, notes: CLINIQUE ? 8 : 0,
  // Pièces jointes de la messagerie (option) : nombre par jour, taille moyenne
  pieces: PIECES ? 0.5 : 0
};
// Tailles des contenus chiffrés (caractères base64) : documents (70 % courts, 25 % moyens, 5 % longs ou classeurs)
const TAILLE_VERSION = k => (k % 20 === 0 ? 300000 : k % 4 === 0 ? 40000 : 8000), TAILLE_IMAGE = 400000, TAILLE_PIECE = 600 * 1024;

let seq = 0;
const t0 = new Date(2026, 0, 1, 8).getTime(), H = 36e5, J = 864e5;
const SIG = 'M'.repeat(86) + '==';   // signature ECDSA P-256 en base64 (88 caractères) : même taille que la vraie
function ev(jour, type, data, by) {
  const at = new Date(t0 + jour * J + (seq % 600) * 6e4).toISOString();
  by = by || ('a' + (seq % AGENTS));
  return { v: 1, id: at.replace(/[-:]/g, '').replace(/\.\d+/, '') + '_' + by + '_' + (++seq).toString(16).padStart(8, '0'), at, by, type, data, prec: null, sig: SIG };
}
function nb(moyenne, jour) { const base = Math.floor(moyenne), reste = moyenne - base; return base + (((jour * 7919 + seq * 31) % 1000) / 1000 < reste ? 1 : 0); }
function iso(jour) { const d = new Date(t0 + jour * J); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const contenu = n => 'x'.repeat(n);   // contenu chiffré (déjà base64 dans la saisie)

function generer() {
  const evts = [], piecesOctets = [];
  for (let s = 1; s <= NB_SERVICES; s++) {
    const sv = 'U' + s, presents = [];
    let nP = 0, nM = 0, nR = 0, nMs = 0, nD = 0, nV = 0, nC = 0;
    for (let k = 0; k < 15; k++) evts.push(ev(0, 'TACHE', { id: sv + 'T' + k, niveau: 'service', titre: 'Tâche ' + k + ' (fictif)', service: sv, regularite: { type: 'jour' }, debut: iso(0) }));
    for (let k = 0; k < 3; k++) evts.push(ev(0, 'SALLE', { id: sv + 'S' + k, nom: 'Salle ' + k + ' (fictif)', service: sv }));
    for (let j = 0; j < JOURS; j++) {
      // --- Patients
      for (let a = nb(VOLUMES.admissions, j); a > 0; a--) {
        const id = sv + 'P' + (++nP);
        evts.push(ev(j, 'PATIENT', { patientId: id, nom: 'PATIENT' + nP + ' (fictif)', prenom: 'X', naissance: '1980-01-01', service: sv, ipp: '9' + s + String(nP).padStart(6, '0') }));
        evts.push(ev(j, 'MODE_HOSPI', { patientId: id, mode: nP % 3 ? 'SL' : 'SDT', date: t0 + j * J }));
        evts.push(ev(j, 'SEJOUR', { patientId: id, sejourId: 'S' + id, entree: iso(j), service: sv, chambre: String(nP % LITS + 1) }));
        presents.push(id);
      }
      while (presents.length > LITS) { const id = presents.shift(); evts.push(ev(j, 'SEJOUR', { patientId: id, sejourId: 'S' + id, sortie: iso(j) })); }
      const p = k => presents[(j + k) % presents.length];
      for (let i = nb(VOLUMES.fiche, j); i > 0; i--) evts.push(ev(j, 'PATIENT', { patientId: p(i), referents: [{ id: null, nom: 'IDE ' + i + ' (fictif)' }] }));
      for (let i = nb(VOLUMES.sortiePrevue, j); i > 0; i--) evts.push(ev(j, 'SEJOUR', { patientId: p(i + 3), sejourId: 'S' + p(i + 3), sortiePrevue: { etat: 'envisagee', debut: iso(j + 7) } }));
      for (let i = nb(VOLUMES.valeurs, j); i > 0; i--) evts.push(ev(j, 'VALEUR', { entite: 'patient', id: p(i), champ: 'note-' + (i % 3), valeur: 'Valeur ' + j + ' (fictif)', journal: 'patients' }));
      // --- Isolement et contention
      for (let i = nb(VOLUMES.mesures, j); i > 0; i--) {
        const m = sv + 'M' + (++nM), deb = t0 + j * J + 2 * H, duree = (nM % 10 === 0 ? 80 : nM % 3 === 0 ? 30 : 10) * H, type = nM % 4 === 0 ? 'Contention' : 'Isolement';
        evts.push(ev(j, 'MESURE_DEBUT', { mesureId: m, patientId: p(i), service: sv, typeMesure: type, debut: deb, lieu: 'CSI ' + (1 + nM % 2), csi: true, psychiatre: 'Dr A (fictif)', modeHospi: '' }));
        evts.push(ev(j, 'TIERS', { mesureId: m, cycle: 1, statut: 'INFORME', personne: 'Mère', informateur: 'PSYCHIATRE', date: deb + H }));
        if (nM % 3 === 0) { evts.push(ev(j, 'PAUSE', { mesureId: m, debut: deb + 5 * H, reprisePrevue: deb + 6 * H, psychiatre: 'Dr A (fictif)', motif: 'Repas' })); evts.push(ev(j, 'REPRISE', { mesureId: m, date: deb + 6 * H })); }
        if (duree > 48 * H) { evts.push(ev(j + 2, 'JLD', { mesureId: m, cycle: 1, nature: 'INFO', date: deb + 47 * H })); evts.push(ev(j + 3, 'JLD', { mesureId: m, cycle: 1, nature: 'SAISINE', date: deb + 70 * H })); }
        evts.push(ev(j, 'MESURE_FIN', { mesureId: m, fin: deb + duree, psychiatre: 'Dr A (fictif)' }));
        if (nM % 2) evts.push(ev(j + 1, 'ENTRETIEN', { mesureId: m, realise: true, date: deb + duree + 20 * H }));
      }
      for (let i = nb(VOLUMES.professionnels, j); i > 0; i--) evts.push(ev(j, 'PROFESSIONNEL', { service: sv, date: iso(j), periode: ['M', 'AM', 'N'][i % 3], nom: 'Agent ' + i + ' (fictif)', fonction: i % 2 ? 'IDE' : 'AS' }));
      // --- Agenda, Suivi médical, Véhicules
      for (let k = 0; k < VOLUMES.tachesFaites; k++) evts.push(ev(j, 'TACHE_FAITE', { tache: sv + 'T' + k, occurrence: iso(j), service: sv }));
      for (let i = nb(VOLUMES.rdv, j); i > 0; i--) {
        const r = sv + 'R' + (++nR);
        evts.push(ev(j, 'RDV', { id: r, nature: i % 2 ? 'accompagnement' : 'activite', titre: 'Événement ' + nR + ' (fictif)', debut: t0 + (j + 2) * J + 6 * H, fin: t0 + (j + 2) * J + 8 * H, service: sv, patients: [p(i)], professionnels: [],
          participation: { mode: 'exact', nombre: 2, libre: true }, checklist: [{ id: 'c1', libelle: 'Point (fictif)', delai: 1 }], regularite: nR % 20 ? { type: 'aucune' } : { type: 'semaine', jours: [2] } }));
      }
      const rdv = k => sv + 'R' + Math.max(1, nR - k);
      for (let i = nb(VOLUMES.occurrence, j); i > 0; i--) evts.push(ev(j, 'OCCURRENCE', { rdv: rdv(i), occurrence: iso(j + 2), lieu: 'Autre lieu (fictif)', service: sv }));
      for (let i = nb(VOLUMES.check, j); i > 0; i--) evts.push(ev(j, 'CHECK', { rdv: rdv(i), item: 'c1', occurrence: iso(j + 2), fait: true, service: sv }));
      for (let i = nb(VOLUMES.inscription, j); i > 0; i--) evts.push(ev(j, 'INSCRIPTION', { rdv: rdv(i), occurrence: iso(j + 2), agent: 'a' + i, nom: 'Agent ' + i + ' (fictif)', etat: 'inscrit', service: sv }, 'a' + i));
      for (let i = nb(VOLUMES.validation, j); i > 0; i--) evts.push(ev(j, 'VALIDATION', { rdv: rdv(i), validation: 'pv', occurrence: iso(j + 2), statut: 'etape', etape: 'orale', processus: 'libre', service: sv }));
      for (let i = nb(VOLUMES.commentaire, j); i > 0; i--) evts.push(ev(j, 'COMMENTAIRE', { rdv: rdv(i), id: 'K' + seq, texte: 'Commentaire (fictif)', service: sv }));
      for (let i = nb(VOLUMES.alerte, j); i > 0; i--) { const id = sv + 'A' + seq; evts.push(ev(j, 'ALERTE', { id, type: 'medecin', patientId: p(i), avant: iso(j + 1), service: sv })); evts.push(ev(j + 1, 'ALERTE_VUE', { alerte: id, service: sv })); }
      for (let i = nb(VOLUMES.absence, j); i > 0; i--) evts.push(ev(j, 'ABSENCE', { id: sv + 'B' + seq, agent: 'a' + (j % 9), nom: 'Agent (fictif)', debut: iso(j + 5), fin: iso(j + 6), service: sv }));
      for (let i = nb(VOLUMES.suivi, j); i > 0; i--) evts.push(ev(j, 'SUIVI', { id: sv + 'E' + seq, patient: p(i), service: sv, date: iso(j), medecin: 'Dr A (fictif)', quoi: i % 2 ? 'entretien' : 'contrat' }));
      for (let i = nb(VOLUMES.presence, j); i > 0; i--) evts.push(ev(j, 'PRESENCE', { id: sv + 'PM' + seq, medecin: 'Dr A (fictif)', service: sv, nature: 'presence', jours: [1, 2], moments: ['matin'], repetition: 'semaine', debut: iso(j) }));
      for (let i = nb(VOLUMES.reservation, j); i > 0; i--) evts.push(ev(j, 'RESERVATION', { id: sv + 'RV' + seq, vehicule: 'VH1', debut: t0 + (j + 1) * J + 9 * H, fin: t0 + (j + 1) * J + 11 * H, service: sv, motif: 'Rendez-vous extérieur', agent: 'a1', nom: 'Agent (fictif)' }));
      // --- Messagerie (messages chiffrés pour leurs destinataires : contenu `ct`)
      for (let i = nb(VOLUMES.messages, j); i > 0; i--) {
        const id = sv + 'MS' + (++nMs), pj = [];
        for (let q = nb(VOLUMES.pieces, j + i); q > 0; q--) { pj.push({ id: 'pj' + seq, nom: 'piece.pdf', taille: TAILLE_PIECE }); piecesOctets.push(TAILLE_PIECE); }
        evts.push(ev(j, 'MESSAGE', { id, nom: 'Agent (fictif)', destinataires: [{ type: 'service', id: sv }], services: [sv], chiffre: true, ct: contenu(1400), pieces: pj }));
        for (let l = 0; l < VOLUMES.lecteurs; l++) evts.push(ev(j, 'MESSAGE_LU', { message: id }, 'a' + ((nMs + l) % AGENTS)));
      }
      for (let i = nb(VOLUMES.reponses, j); i > 0; i--) evts.push(ev(j, 'MESSAGE_REPONSE', { message: sv + 'MS' + Math.max(1, nMs - i), ct: contenu(600) }));
      // --- Documents (contenus chiffrés : chaque enregistrement est une version complète)
      for (let i = nb(VOLUMES.documents, j); i > 0; i--) evts.push(ev(j, 'DOC', { id: 'DC' + s + String(++nD).padStart(7, '0'), titreCt: contenu(120), services: [sv], g: 1 }));
      for (let i = nb(VOLUMES.versions, j); i > 0 && nD; i--) evts.push(ev(j, 'DOC_VERSION', { doc: 'DC' + s + String(1 + (nV % nD)).padStart(7, '0'), g: 1, ct: contenu(TAILLE_VERSION(++nV)), nom: 'Agent (fictif)', base: '' }));
      for (let i = nb(VOLUMES.partages, j); i > 0 && nD; i--) evts.push(ev(j, 'DOC_PARTAGE', { doc: 'DC' + s + String(nD).padStart(7, '0'), avec: [{ type: 'service', id: sv }] }));
      for (let i = nb(VOLUMES.images, j); i > 0 && nD; i--) evts.push(ev(j, 'DOC_IMAGE', { doc: 'DC' + s + String(nD).padStart(7, '0'), id: 'im' + seq.toString(16).padStart(8, '0'), ct: contenu(TAILLE_IMAGE) }));
      // --- Congés, heures, formations
      for (let i = nb(VOLUMES.conges, j); i > 0; i--) { const id = sv + 'CG' + (++nC); evts.push(ev(j, 'CONGE', { id, agent: 'a' + (nC % AGENTS), service: sv, type: 'CA', debut: iso(j + 30), fin: iso(j + 34), statut: 'demande' })); evts.push(ev(j + 2, 'CONGE_DECISION', { conge: id, decision: 'valide' })); }
      for (let i = nb(VOLUMES.heures, j); i > 0; i--) { const id = sv + 'HS' + seq; evts.push(ev(j, 'HEURES_DECLARATION', { id, service: sv, date: iso(j), minutes: 60, motif: 'Remplacement (fictif)' })); evts.push(ev(j + 1, 'HEURES_DECISION', { declaration: id, decision: 'recuperation', minutes: 60 })); }
      for (let i = nb(VOLUMES.formations, j); i > 0; i--) { const id = sv + 'FI' + seq; evts.push(ev(j, 'FORMATION_INSCRIPTION', { id, session: 'FS1', service: sv, nom: 'Agent (fictif)' })); evts.push(ev(j + 3, 'FORMATION_DECISION', { inscription: id, decision: 'acceptee' })); }
      // --- Contrôles des CSI, travaux, salles, équipe, retours, traces d'export
      for (let i = nb(VOLUMES.controles, j); i > 0; i--) { const id = sv + 'CT' + seq; evts.push(ev(j, 'CONTROLE', { id, modele: 'csiLibre', service: sv, lieu: 'CSI ' + (1 + i % 2) + ' (fictif)', date: iso(j), poste: ['M', 'AM', 'N'][i % 3], items: Array.from({ length: 12 }, (_, q) => ({ libelle: 'Point ' + q, ok: true })), deuxAgents: true })); evts.push(ev(j, 'CONTROLE_CONFIRME', { controle: id })); }
      for (let i = nb(VOLUMES.travaux, j); i > 0; i--) { const id = sv + 'TR' + seq; evts.push(ev(j, 'TRAVAUX', { id, service: sv, type: 'plomberie', lieu: 'chambre', chambre: '12', urgence: 'non', description: 'Fuite du lavabo (fictif)' })); evts.push(ev(j + 2, 'TRAVAUX_ETAPE', { demande: id, etape: 'faite' })); }
      for (let i = nb(VOLUMES.salles, j); i > 0; i--) evts.push(ev(j, 'SALLE_RESERVATION', { id: sv + 'SR' + seq, salle: sv + 'S' + (i % 3), jour: iso(j + 1), de: '09:00', a: '10:30', titre: 'Réunion (fictif)', service: sv }));
      for (let i = nb(VOLUMES.equipe, j); i > 0; i--) evts.push(ev(j, 'COORDONNEES', { agent: 'a' + (j % AGENTS), telephone: '0000 (fictif)' }));
      for (let i = nb(VOLUMES.retours, j); i > 0; i--) evts.push(ev(j, 'RETOUR', { id: sv + 'RT' + seq, service: sv, nature: 'idee', texte: 'Idée (fictif)' }));
      for (let i = nb(VOLUMES.exports, j); i > 0; i--) evts.push(ev(j, 'COMPTE', { action: 'EXPORT', libelle: 'Décompte du juge (PDF)', service: sv }));
      // --- Données cliniques (option)
      for (let i = nb(VOLUMES.staff, j); i > 0; i--) evts.push(ev(j, 'CLINIQUE_STAFF', { patientId: p(i), sejour: 'S' + p(i), service: sv, ct: contenu(2500) }));
      for (let i = nb(VOLUMES.notes, j); i > 0; i--) evts.push(ev(j, 'CLINIQUE_NOTE', { patientId: p(i), sejour: 'S' + p(i), service: sv, id: 'CN' + seq, ct: contenu(700) }));
    }
  }
  return { evts, piecesOctets };
}

function chrono(libelle, f, n) {
  n = n || 3; let r, meilleur = Infinity;
  for (let i = 0; i < n; i++) { const d = performance.now(); r = f(); meilleur = Math.min(meilleur, performance.now() - d); }
  console.log('  ' + libelle.padEnd(66) + Math.round(meilleur).toString().padStart(8) + ' ms');
  return { r, ms: meilleur };
}
const Mo = o => (o / 1048576).toFixed(1) + ' Mo', Go = o => (o / 1073741824).toFixed(2) + ' Go';
const BLOC = 4096, alloue = o => Math.ceil(o / BLOC) * BLOC;
const MODULE_DE = {};

(async () => {
  const res = { services: NB_SERVICES, annees: ANNEES, clinique: CLINIQUE, pieces: PIECES };
  const g0 = performance.now(), { evts, piecesOctets } = generer();
  res.saisies = evts.length;
  console.log(`\n${NB_SERVICES} service(s) × ${ANNEES} an(s)${CLINIQUE ? ', données cliniques' : ''}${PIECES ? ', pièces jointes' : ''} : ${evts.length.toLocaleString('fr-FR')} saisies, soit ${Math.round(evts.length / NB_SERVICES / JOURS)} par service et par jour (${Math.round(performance.now() - g0)} ms de génération)`);

  // ------------------------------------------------------------------ Volume par module
  const mods = SIC.modules.liste(), typeModule = {};
  mods.forEach(m => ((m.saisies && m.saisies.types) || []).forEach(t => { typeModule[t] = m.id; }));
  const parModule = {}, parType = {};
  evts.forEach(e => { const m = typeModule[e.type] || 'socle'; parModule[m] = (parModule[m] || 0) + 1; parType[e.type] = (parType[e.type] || 0) + 1; });
  console.log('  par module : ' + Object.keys(parModule).sort((a, b) => parModule[b] - parModule[a]).map(k => k + ' ' + parModule[k].toLocaleString('fr-FR')).join(', '));
  res.parModule = parModule;

  // ------------------------------------------------------------------ Octets réels : chiffrement et signature d'un échantillon par type
  console.log('\nVolume sur le partage (chiffrement AES-GCM et signature ECDSA réels, échantillon par type de saisie)');
  const cle = await C.importerCleOctets(crypto.getRandomValues(new Uint8Array(32)));
  const paire = await SG.paireAgent(crypto.getRandomValues(new Uint8Array(32)));
  const tailleType = {}, echantillon = {};
  for (const e of evts) { (echantillon[e.type] = echantillon[e.type] || []); if (echantillon[e.type].length < 40) echantillon[e.type].push(e); }
  let tSigne = 0, nSigne = 0, tVerif = 0, tDechiffre = 0, nLu = 0;
  const signes = [];
  for (const t of Object.keys(echantillon)) {
    let somme = 0, sommeAlloc = 0;
    for (const e0 of echantillon[t]) {
      const e = Object.assign({}, e0); delete e.sig;
      let d = performance.now(); await SG.signerSaisie(e, paire); tSigne += performance.now() - d; nSigne++;
      const octets = await C.chiffrerJSON(cle, e, 'evt:' + e.id + '.enc');
      somme += octets.length; sommeAlloc += alloue(octets.length);
      signes.push({ e, octets });
    }
    tailleType[t] = { moyenne: somme / echantillon[t].length, alloue: sommeAlloc / echantillon[t].length };
  }
  const ctx = { cles: { }, strict: true, admins: [], attestees: true };
  for (const x of signes) ctx.cles[x.e.by] = { cles: [paire.publique], enAttente: [] };
  for (const x of signes) {
    let d = performance.now(); const e = await C.dechiffrerJSON(cle, x.octets, 'evt:' + x.e.id + '.enc'); tDechiffre += performance.now() - d;
    d = performance.now(); const v = await SG.verifierSaisie(e, ctx); tVerif += performance.now() - d; nLu++;
    if (v !== 'ok') throw new Error('Vérification de signature : ' + v);
  }
  let logique = 0, alloc = 0, logiqueHorsDocs = 0, allocHorsDocs = 0;
  const parModuleOctets = {};
  for (const t of Object.keys(parType)) {
    const n = parType[t], tt = tailleType[t];
    logique += n * tt.moyenne; alloc += n * tt.alloue;
    const m = typeModule[t] || 'socle'; parModuleOctets[m] = (parModuleOctets[m] || 0) + n * tt.alloue;
    if (m !== 'documents') { logiqueHorsDocs += n * tt.moyenne; allocHorsDocs += n * tt.alloue; }
  }
  const instantanes = logique;          // un instantané par mois clos : copie consolidée des saisies du mois
  const pieces = piecesOctets.reduce((a, b) => a + alloue(b + 36), 0);
  const total = alloc + instantanes + pieces;
  const parServiceAn = total / NB_SERVICES / ANNEES;
  console.log(`  saisie moyenne : ${Math.round(logique / evts.length)} octets (hors documents : ${Math.round(logiqueHorsDocs / (evts.length - (parModule.documents || 0)))}) ; place occupée par fichier (blocs de 4 Ko) : ${Math.round(alloc / evts.length)} octets`);
  console.log(`  fichiers de saisies : ${Go(logique)} de contenu, ${Go(alloc)} occupés sur le disque (${(alloc / logique).toFixed(1)} × le contenu)`);
  console.log(`  instantanés mensuels : ${Go(instantanes)} ; pièces jointes : ${Go(pieces)}`);
  console.log(`  total : ${Go(total)}, soit ${Mo(parServiceAn)} par service et par an ; documents : ${Mo((parModuleOctets.documents || 0) / NB_SERVICES / ANNEES)} par service et par an`);
  console.log('  place occupée par module, par service et par an : ' + Object.keys(parModuleOctets).sort((a, b) => parModuleOctets[b] - parModuleOctets[a]).map(k => k + ' ' + Mo(parModuleOctets[k] / NB_SERVICES / ANNEES)).join(', '));
  console.log(`  fichiers : ${(evts.length + piecesOctets.length).toLocaleString('fr-FR')} (+ ${12 * ANNEES} instantanés par journal), soit ${Math.round((evts.length + piecesOctets.length) / NB_SERVICES / ANNEES).toLocaleString('fr-FR')} par service et par an`);
  Object.assign(res, { octetsSaisies: logique, octetsAlloues: alloc, octetsInstantanes: instantanes, octetsPieces: pieces, octetsTotal: total, moParServiceAn: parServiceAn / 1048576,
    moDocumentsParServiceAn: (parModuleOctets.documents || 0) / NB_SERVICES / ANNEES / 1048576, fichiers: evts.length + piecesOctets.length,
    moParModuleServiceAn: Object.fromEntries(Object.keys(parModuleOctets).map(k => [k, +(parModuleOctets[k] / NB_SERVICES / ANNEES / 1048576).toFixed(2)])) });

  // ------------------------------------------------------------------ Première lecture d'un poste
  const msDech = tDechiffre / nLu, msVerif = tVerif / nLu;
  const recents = Math.round(evts.length / (JOURS / 30.4) * 1.5);   // mois en cours et moitié du précédent : fichiers lus un à un
  console.log('\nPremière lecture d\'un poste (hors accès au partage)');
  console.log(`  déchiffrement d'une saisie : ${msDech.toFixed(3)} ms ; vérification de sa signature : ${msVerif.toFixed(3)} ms ; signature à l'écriture : ${(tSigne / nSigne).toFixed(2)} ms`);
  const tPremiere = evts.length * (msDech * 0.3 + msVerif) / 1000;   // mois clos : instantanés (déchiffrement groupé, environ 3 fois moins cher par saisie)
  console.log(`  toutes les saisies (${evts.length.toLocaleString('fr-FR')}) : ~${tPremiere.toFixed(1)} s de calcul ; fichiers lus un à un (mois récents) : ~${recents.toLocaleString('fr-FR')}`);
  Object.assign(res, { msDechiffre: msDech, msVerif: msVerif, sPremiereLecture: tPremiere });

  // ------------------------------------------------------------------ Reconstitution de l'état
  console.log('\nReconstitution de l\'état des modules');
  if (global.gc) global.gc();
  const memAvant = process.memoryUsage().heapUsed;
  let totalMs = 0; const etats = {}, parModuleMs = {};
  mods.forEach(m => { const x = chrono('module ' + m.id, () => m.saisies.reduire(evts), 1); etats[m.id] = x.r; totalMs += x.ms; parModuleMs[m.id] = Math.round(x.ms); });
  console.log('  ' + 'total, recalcul complet (premier calcul après la lecture)'.padEnd(66) + Math.round(totalMs).toString().padStart(8) + ' ms');
  N.suivre(evts); mods.forEach(m => m.saisies.reduire(evts));
  let pire = 0;
  for (let k = 0; k < 3; k++) {
    evts.push(ev(JOURS + 10 + k, 'TACHE_FAITE', { tache: 'U1T0', occurrence: iso(JOURS + 10 + k), service: 'U1' }));   // après toutes les autres (incrémental)
    const d0 = performance.now(); mods.forEach(m => m.saisies.reduire(evts)); pire = Math.max(pire, performance.now() - d0);
  }
  console.log('  ' + 'total après l\'arrivée d\'une saisie (recalcul incrémental)'.padEnd(66) + Math.round(pire).toString().padStart(8) + ' ms');
  const copie = evts.slice().reverse(); let d1 = performance.now(); mods.forEach(m => m.saisies.reduire(copie));
  const sansTri = performance.now() - d1;
  console.log('  ' + 'total sans tri mémorisé (première lecture, ordre quelconque)'.padEnd(66) + Math.round(sansTri).toString().padStart(8) + ' ms');
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  console.log(`  mémoire : ${Mo(mem.heapUsed)} occupés (saisies et états des modules), dont ~${Mo(mem.heapUsed - memAvant)} pour les états`);
  Object.assign(res, { msRecalculComplet: totalMs, msIncremental: pire, msSansTri: sansTri, moMemoire: mem.heapUsed / 1048576, msParModule: parModuleMs });

  // ------------------------------------------------------------------ Calculs d'affichage
  console.log('\nCalculs d\'affichage (fin de période)');
  const svs = Array.from({ length: NB_SERVICES }, (_, i) => 'U' + (i + 1)), fin = t0 + (JOURS - 3) * J;
  const config = { services: svs.map(c => ({ code: c, libelle: c + ' (fictif)' })) };
  const st = etats.isocont, an = new Date(fin).getFullYear();
  res.registre = chrono('Isolement : registre de l\'année d\'un service', () => M.registre(st, 'U1', an, fin)).ms;
  res.statistiques = chrono('Isolement : statistiques de l\'année, tous services', () => M.statistiquesAnnee(st, svs, an, fin)).ms;
  res.statsPatients = chrono('Isolement : onglet Patients de l\'année, tous services', () => M.statistiquesPatients(st, svs, an, fin)).ms;
  res.decalages = chrono('Isolement : numéros décalés (alerte au cadre), un service', () => M.decalagesRegistre(st, 'U1', an, fin, fin - 7 * J)).ms;
  const enCours = M.listeMesures(st).slice(-20);
  res.suiviJLD = chrono('Isolement : échéances du juge de 20 mesures (onglet Juge)', () => enCours.forEach(m => M.suiviJLD(st, m, fin))).ms;
  res.decompte = chrono('Isolement : décompte du juge d\'une mesure', () => M.decompte(st, enCours[enCours.length - 1], fin)).ms;
  const sa = etats.agenda, fiches = (etats.patients && etats.patients.fiches) || {};
  res.agendaSemaine = chrono('Agenda : éléments d\'une semaine (tous services)', () => A.elements(sa, fiches, svs, fin, fin + 7 * J)).ms;
  res.agendaAlertes = chrono('Agenda : résumé des alertes', () => { A.aFaireValider(sa, fiches, config, svs, fin); A.transportsAReserver(sa, fiches, svs, fin, 7, config); A.accompagnateursManquants(sa, fiches, svs, fin, 7, config); A.alertesChecklists(sa, fiches, svs, fin); }).ms;

  // ------------------------------------------------------------------ Fichiers réels sur disque (facultatif)
  if (DISQUE) {
    console.log(`\nÉcriture réelle des saisies de la première année du service U1 dans ${DISQUE}`);
    const choix = evts.filter(e => e.at < '2027' && ((e.data && (e.data.service === 'U1' || (e.data.services || [])[0] === 'U1')) || /U1/.test(JSON.stringify(e.data).slice(0, 200))));
    let ecrits = 0, octets = 0; const d0 = performance.now();
    for (const e0 of choix) {
      const e = Object.assign({}, e0); delete e.sig; await SG.signerSaisie(e, paire);
      const o = await C.chiffrerJSON(cle, e, 'evt:' + e.id + '.enc'), [a, m, j] = e.at.slice(0, 10).split('-');
      const dir = path.join(DISQUE, 'evenements', a, m, j); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, e.id + '.enc'), o); ecrits++; octets += o.length;
    }
    const dEcr = performance.now() - d0, d2 = performance.now();
    let listes = 0; (function parcourir(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { if (x.isDirectory()) parcourir(path.join(d, x.name)); else listes++; } })(path.join(DISQUE, 'evenements'));
    const dListe = performance.now() - d2;
    console.log(`  ${ecrits.toLocaleString('fr-FR')} fichiers, ${Mo(octets)} de contenu, écrits en ${Math.round(dEcr / 1000)} s ; liste des dossiers (disque local) : ${Math.round(dListe)} ms pour ${listes.toLocaleString('fr-FR')} fichiers`);
    Object.assign(res, { disqueFichiers: ecrits, disqueOctets: octets, disqueMsListe: dListe });
  }
  if (JSON_SORTIE) fs.appendFileSync(JSON_SORTIE, JSON.stringify(res) + '\n');
  console.log('');
})().catch(e => { console.error(e); process.exit(1); });
