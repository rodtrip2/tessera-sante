// SPDX-License-Identifier: EUPL-1.2
/*
 * Test de charge (données fictives) : une année d'activité de plusieurs services, puis mesure des temps de calcul.
 *
 *   node scripts/charge.cjs [nombre de services, défaut 3] [jours, défaut 365]
 *
 * Mesure, sous Node (les navigateurs récents donnent des ordres de grandeur proches) :
 * - le déchiffrement d'une saisie (AES-GCM) et d'un instantané mensuel ;
 * - la reconstitution de l'état de chaque module à partir de toutes les saisies (`reduire`), refaite à chaque
 *   synchronisation qui apporte une saisie (`Session.recalculer`) ;
 * - quelques calculs d'affichage de l'Agenda (semaine, alertes) et de la Vue d'ensemble.
 * Ne mesure pas l'accès au partage réseau (liste des dossiers, lecture des fichiers) : à mesurer sur place.
 * Volumes par service et par jour : voir VOLUMES ci-dessous (hypothèses, à ajuster).
 */
'use strict';
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
const { performance } = require('node:perf_hooks');
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
const S = SIC.suivi = require(R + 'module-suivi.js');
const Vh = require(R + 'module-vehicules.js');
const V = require(R + 'module-vue.js');
const C = SIC.crypto;

const NB_SERVICES = +process.argv[2] || 3, JOURS = +process.argv[3] || 365, LITS = 20;
// Hypothèses de volume, par service et par jour (moyennes)
const VOLUMES = {
  admissions: LITS / 30,        // durée moyenne de séjour 30 jours
  fiche: 3,                     // corrections de fiche, référents, médecins
  sortiePrevue: 1,
  valeurs: 8,                   // cases de la Vue d'ensemble, données ajoutées, notes
  mesures: 0.5,                 // isolement ou contention (début, information du tiers, JLD, fin, entretien)
  tachesFaites: 15,             // tâches du service cochées
  rdv: 3, occurrence: 1, check: 5, inscription: 3, validation: 1, commentaire: 1, alerte: 2, absence: 0.3,
  suivi: 5, presence: 0.3, reservation: 1
};

let seq = 0;
const t0 = new Date(2026, 0, 1, 8).getTime();
function ev(jour, type, data, by) {
  const at = new Date(t0 + jour * 864e5 + (seq % 600) * 6e4).toISOString();
  return { v: 1, id: at.replace(/[-:]/g, '').replace(/\.\d+/, '') + '_' + (by || 'a1') + '_' + (++seq).toString(16).padStart(8, '0'), at, by: by || 'a1', type, data };
}
function nb(moyenne, jour) { const base = Math.floor(moyenne), reste = moyenne - base; return base + (((jour * 7919 + seq) % 1000) / 1000 < reste ? 1 : 0); }
function iso(jour) { const d = new Date(t0 + jour * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function generer() {
  const evts = [];
  for (let s = 1; s <= NB_SERVICES; s++) {
    const sv = 'U' + s, presents = [];
    let nP = 0, nM = 0, nR = 0;
    // Tâches du service (15 tâches quotidiennes)
    for (let k = 0; k < 15; k++) evts.push(ev(0, 'TACHE', { id: sv + 'T' + k, niveau: 'service', titre: 'Tâche ' + k + ' (fictif)', service: sv, regularite: { type: 'jour' }, debut: iso(0) }));
    for (let j = 0; j < JOURS; j++) {
      for (let a = nb(VOLUMES.admissions, j); a > 0; a--) {
        const id = sv + 'P' + (++nP);
        evts.push(ev(j, 'PATIENT', { patientId: id, nom: 'PATIENT' + nP + ' (fictif)', prenom: 'X', naissance: '1980-01-01', service: sv, ipp: '9' + s + String(nP).padStart(6, '0') }));
        evts.push(ev(j, 'MODE_HOSPI', { patientId: id, mode: nP % 3 ? 'SL' : 'SDT', date: t0 + j * 864e5 }));
        evts.push(ev(j, 'SEJOUR', { patientId: id, sejourId: 'S' + id, entree: iso(j), service: sv, chambre: String(nP % LITS + 1) }));
        presents.push(id);
      }
      while (presents.length > LITS) { const id = presents.shift(); evts.push(ev(j, 'SEJOUR', { patientId: id, sejourId: 'S' + id, sortie: iso(j) })); }
      const p = k => presents[(j + k) % presents.length];
      for (let i = nb(VOLUMES.fiche, j); i > 0; i--) evts.push(ev(j, 'PATIENT', { patientId: p(i), referents: [{ id: null, nom: 'IDE ' + i + ' (fictif)' }] }));
      for (let i = nb(VOLUMES.sortiePrevue, j); i > 0; i--) evts.push(ev(j, 'SEJOUR', { patientId: p(i + 3), sejourId: 'S' + p(i + 3), sortiePrevue: { etat: 'envisagee', debut: iso(j + 7) } }));
      for (let i = nb(VOLUMES.valeurs, j); i > 0; i--) evts.push(ev(j, 'VALEUR', { entite: 'patient', id: p(i), champ: 'note-' + (i % 3), valeur: 'Valeur ' + j + ' (fictif)', journal: 'patients' }));
      for (let i = nb(VOLUMES.mesures, j); i > 0; i--) {
        const m = sv + 'M' + (++nM);
        evts.push(ev(j, 'MESURE_DEBUT', { mesureId: m, patientId: p(i), service: sv, typeMesure: 'Isolement', debut: t0 + j * 864e5, lieu: 'CSI 1', csi: true, psychiatre: 'Dr A (fictif)', modeHospi: '' }));
        evts.push(ev(j, 'TIERS', { mesureId: m, cycle: 1, statut: 'INFORME', personne: 'Mère', informateur: 'PSYCHIATRE', date: t0 + j * 864e5 + 36e5 }));
        evts.push(ev(j, 'MESURE_FIN', { mesureId: m, fin: t0 + j * 864e5 + 10 * 36e5, psychiatre: 'Dr A (fictif)' }));
      }
      for (let k = 0; k < VOLUMES.tachesFaites; k++) evts.push(ev(j, 'TACHE_FAITE', { tache: sv + 'T' + k, occurrence: iso(j), service: sv }));
      for (let i = nb(VOLUMES.rdv, j); i > 0; i--) {
        const r = sv + 'R' + (++nR);
        evts.push(ev(j, 'RDV', { id: r, nature: i % 2 ? 'accompagnement' : 'activite', titre: 'Événement ' + nR + ' (fictif)', debut: t0 + (j + 2) * 864e5 + 6 * 36e5, fin: t0 + (j + 2) * 864e5 + 8 * 36e5, service: sv, patients: [p(i)], professionnels: [],
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
      for (let i = nb(VOLUMES.reservation, j); i > 0; i--) evts.push(ev(j, 'RESERVATION', { id: sv + 'RV' + seq, vehicule: 'VH1', debut: t0 + (j + 1) * 864e5 + 9 * 36e5, fin: t0 + (j + 1) * 864e5 + 11 * 36e5, service: sv, motif: 'Rendez-vous extérieur', agent: 'a1', nom: 'Agent (fictif)' }));
    }
  }
  return evts;
}

function chrono(libelle, f, n) {
  n = n || 3; let r, meilleur = Infinity;
  for (let i = 0; i < n; i++) { const d = performance.now(); r = f(); meilleur = Math.min(meilleur, performance.now() - d); }
  console.log('  ' + libelle.padEnd(58) + Math.round(meilleur).toString().padStart(7) + ' ms');
  return { r, ms: meilleur };
}

(async () => {
  const evts = generer();
  const parType = {};
  evts.forEach(e => { parType[e.type] = (parType[e.type] || 0) + 1; });
  const octets = Buffer.byteLength(JSON.stringify(evts));
  console.log(`\n${NB_SERVICES} service(s), ${JOURS} jours : ${evts.length} saisies (${Math.round(evts.length / NB_SERVICES / JOURS)} par service et par jour), ${(octets / 1048576).toFixed(1)} Mo de JSON en clair`);
  console.log('  ' + Object.keys(parType).sort((a, b) => parType[b] - parType[a]).slice(0, 8).map(k => k + ' ' + parType[k]).join(', '));

  console.log('\nChiffrement (AES-GCM, Web Crypto de Node)');
  const cle = await C.importerCle(C.b64 ? C.b64(crypto.getRandomValues(new Uint8Array(32))) : Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'));
  const ech = evts.slice(0, 2000), chiffres = [];
  for (const e of ech) chiffres.push(await C.chiffrerJSON(cle, e, 'evt:' + e.id + '.enc'));
  let d = performance.now();
  for (let i = 0; i < ech.length; i++) await C.dechiffrerJSON(cle, chiffres[i], 'evt:' + ech[i].id + '.enc');
  const parFichier = (performance.now() - d) / ech.length;
  const mois = evts.filter(e => e.at.slice(0, 7) === '2026-03');
  const snap = await C.chiffrerJSON(cle, { mois: '2026-03', evenements: mois }, 'snap');
  d = performance.now(); await C.dechiffrerJSON(cle, snap, 'snap'); const tSnap = performance.now() - d;
  console.log(`  déchiffrement d'une saisie : ${parFichier.toFixed(3)} ms, soit ${Math.round(parFichier * evts.length / 1000)} s pour toutes, une par une`);
  console.log(`  instantané d'un mois clos (${mois.length} saisies, ${(snap.length / 1048576).toFixed(1)} Mo) : ${Math.round(tSnap)} ms ; une année en instantanés : ~${Math.round(tSnap * 12 * (JOURS / 365))} ms`);

  console.log('\nReconstitution de l\'état (refaite à chaque synchronisation qui apporte une saisie)');
  const mods = SIC.modules.liste();
  let total = 0;
  const etats = {};
  mods.forEach(m => { const x = chrono('module ' + m.id, () => m.saisies.reduire(evts)); etats[m.id] = x.r; total += x.ms; });
  console.log('  ' + 'total, état déjà trié (meilleur cas)'.padEnd(58) + Math.round(total).toString().padStart(7) + ' ms');
  // Cas réel : une saisie arrive (poste ou synchronisation), puis tous les modules sont recalculés une fois ; le journal
  // est celui de la session (recalcul incrémental, 0.21.2) ; le premier recalcul est complet
  require(R + 'noyau-journal.js').suivre(evts); mods.forEach(m => m.saisies.reduire(evts));
  let pire = 0;
  for (let k = 0; k < 3; k++) {
    evts.push(ev(JOURS + 2 + k, 'TACHE_FAITE', { tache: 'U1T0', occurrence: iso(JOURS + 2 + k), service: 'U1' }));
    const d0 = performance.now(); mods.forEach(m => m.saisies.reduire(evts)); pire = Math.max(pire, performance.now() - d0);
  }
  console.log('  ' + 'total après l\'arrivée d\'une saisie (cas réel, incrémental)'.padEnd(58) + Math.round(pire).toString().padStart(7) + ' ms');
  const copie = evts.slice(); copie.reverse(); let d1 = performance.now(); mods.forEach(m => m.saisies.reduire(copie));
  console.log('  ' + 'total sans tri mémorisé (première lecture, ordre quelconque)'.padEnd(58) + Math.round(performance.now() - d1).toString().padStart(7) + ' ms');
  const parMois = Math.round(evts.length / (JOURS / 30.4));
  console.log(`\nPartage réseau (non mesuré ici) : ~${parMois} fichiers par mois ; lecture rapide toutes les 5 s : mois en cours et précédent (~${2 * parMois} entrées listées) ; lecture complète toutes les 10 min : ${evts.length} entrées.`);

  console.log('\nCalculs d\'affichage (fin de période)');
  const st = etats.agenda, fp = SIC.modules.lire ? null : null;
  const fiches = (etats.patients && etats.patients.fiches) || {}, svs = Array.from({ length: NB_SERVICES }, (_, i) => 'U' + (i + 1));
  const fin = t0 + (JOURS - 3) * 864e5, config = { services: svs.map(c => ({ code: c, libelle: c + ' (fictif)' })) };
  chrono('Agenda : éléments d\'une semaine (tous services)', () => A.elements(st, fiches, svs, fin, fin + 7 * 864e5));
  chrono('Agenda : résumé des alertes (validations, transports, professionnels)', () => { A.aFaireValider(st, fiches, config, svs, fin); A.transportsAReserver(st, fiches, svs, fin, 7, config); A.accompagnateursManquants(st, fiches, svs, fin, 7, config); A.alertesChecklists(st, fiches, svs, fin); });
  chrono('Agenda : tâches dues d\'une semaine', () => A.tachesDues ? A.tachesDues(st, svs, fin, fin + 7 * 864e5) : null);
  console.log(`  (${Object.keys(st.rdv).length} événements, ${Object.keys(fiches).length} fiches patient, ${Object.values(fiches).filter(f => (f.sejours || []).some(x => !x.sortie)).length} patients présents)\n`);
})().catch(e => { console.error(e); process.exit(1); });
