// SPDX-License-Identifier: EUPL-1.2
// Module Patients, première sous-étape (0.6.0) : journal et clé propres, lecture à la volée par Isocont ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Dossier simulé : sous-ensemble de l'API File System Access utilisé par store.js
class Fichier {
  constructor(name) { this.name = name; this.kind = 'file'; this.data = new Uint8Array(); this.modifie = 0; }
  async getFile() { const d = this.data; return { size: d.length, lastModified: this.modifie, arrayBuffer: async () => d.slice().buffer }; }
  async createWritable() { let tampon; return { write: async (o) => { tampon = new Uint8Array(o); }, close: async () => { this.data = tampon; this.modifie = Date.now() + (Fichier.horloge = (Fichier.horloge || 0) + 1); } }; }
}
class Repertoire {
  constructor(name) { this.name = name; this.kind = 'directory'; this.e = new Map(); }
  async getDirectoryHandle(n, o) { return this.obtenir(n, o, Repertoire); }
  async getFileHandle(n, o) { return this.obtenir(n, o, Fichier); }
  obtenir(n, o, Type) {
    if (!this.e.has(n)) { if (!(o && o.create)) throw Object.assign(new Error('introuvable'), { name: 'NotFoundError' }); this.e.set(n, new Type(n)); }
    return this.e.get(n);
  }
  async *values() { for (const v of [...this.e.values()]) yield v; }
  async *keys() { for (const k of [...this.e.keys()]) yield k; }
  async removeEntry(n) { this.e.delete(n); }
  async isSameEntry(o) { return o === this; }
}

globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
globalThis.SIC.model = require('../app/js/model.js');
globalThis.SIC.modules = require('../app/js/modules.js');
require('../app/js/module-isocont.js');
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;
const C = globalThis.SIC.crypto;
const M = globalThis.SIC.model;

async function nouveauDossier() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  const code = await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  return { racine, admin, code };
}
async function connecter(racine) {
  const s = new Session(new Dossier(racine, 'reseau'));
  await s.chargerCoffre();
  await s.connexionMotDePasse('admin', 'mot de passe solide');
  return s;
}
/** Noms des fichiers de saisie d'un journal (chemin depuis la racine : ['socle'] ou ['modules', 'isocont']). */
function saisiesDe(racine, chemin) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) { if (!rep.e.has(p)) return []; rep = rep.e.get(p); }
  const res = [];
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else res.push(v.name.replace(/\.enc$/, '')); } })(rep);
  return res;
}
const SOCLE = ['socle'], ISOCONT = ['modules', 'isocont'];

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };
const mesure = (id, pid) => ({ mesureId: id, patientId: pid || 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
const PATIENTS = ['modules', 'patients'];
function fichier(racine, chemin, id) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) { if (!rep.e.has(p)) return null; rep = rep.e.get(p); }
  let trouve = null;
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else if (v.name === id + '.enc') trouve = v; } })(rep);
  return trouve;
}
async function equipe() {
  const { racine, admin, code } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }] });
  await admin.creerComptes([
    { nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'Sans rôle (fictif)', login: 'sans', motDePasse: 'mot de passe sans', roles: [], services: ['U1'] }]);
  return { racine, admin, code, id: (login) => admin.comptes.find((c) => c.login === login).id };
}

test('Fiche patient : saisie écrite dans le journal du module Patients, sous sa propre clé ; Isocont la lit à la volée', async () => {
  const { racine, id } = await equipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.deepEqual(a.journauxActifs.map((j) => j.nom), ['socle', 'patients', 'isocont']);
  const p = await a.enregistrer('PATIENT', { patientId: 'P1', ipp: '9001 (fictif)', nom: 'MARTIN (fictif)', prenom: 'Lou', naissance: '1990-02-03', service: 'U1' });
  const m = await a.enregistrer('MESURE_DEBUT', mesure('M1', 'P1'));
  assert.ok(fichier(racine, PATIENTS, p.id), 'fiche dans modules\\patients');
  assert.ok(!fichier(racine, SOCLE, p.id) && !fichier(racine, ISOCONT, p.id));
  assert.ok(fichier(racine, ISOCONT, m.id) && !fichier(racine, PATIENTS, m.id));
  // Chiffrée par la clé de Patients : la clé d'Isocont ne l'ouvre pas
  const donnees = fichier(racine, PATIENTS, p.id).data;
  await assert.rejects(C.dechiffrerJSON(a.trousseau.isocont, donnees, 'evt:' + p.id + '.enc'));
  assert.equal((await C.dechiffrerJSON(a.trousseau.patients, donnees, 'evt:' + p.id + '.enc')).id, p.id);
  // Reconstitution identique : Isocont voit la fiche (âge, IPP au registre)
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.equal(a2.etat.patients.P1.ipp, '9001 (fictif)');
  assert.equal(a2.etat.mesures.M1.patientId, 'P1');
  // Annulation d'une saisie de la fiche : dans le journal de la saisie visée
  const ad = await connecter(racine);
  const ann = await ad.enregistrer('ANNULATION', { cible: p.id, motif: 'erreur (fictif)' });
  assert.ok(fichier(racine, PATIENTS, ann.id));
  assert.ok(!ad.etat.patients.P1 || !ad.etat.patients.P1.ipp);
  // Sans droit à un module qui dépend de Patients : ni la clé de Patients, ni la lecture de son journal
  const sans = await co(racine, 'sans', 'mot de passe sans');
  assert.ok(!sans.journauxActifs.some((j) => j.nom === 'patients'));
  assert.ok(!sans.coffre.enveloppes.some((e) => e.pour === id('sans') && e.cle === 'patients'));
});

test('Retrait du droit à Isocont : nouvelle génération de la clé de Patients aussi', async () => {
  const { admin, id } = await equipe();
  await admin.modifierRoles(id('ide.a'), [], true, ['U1']);
  assert.equal(admin.coffre.cles.patients.courante, 2);
  assert.equal(admin.coffre.cles.isocont.courante, 2);
  assert.ok(!admin.coffre.enveloppes.some((e) => e.pour === id('ide.a') && e.cle === 'patients'));
});

test('Coffre créé avant le module Patients : fiches dans le journal d’Isocont en attendant, clé créée à la connexion de l’administrateur', async () => {
  const { racine, admin } = await equipe();
  await admin.modifierCoffre(async (cf) => { delete cf.cles.patients; cf.enveloppes = cf.enveloppes.filter((e) => e.cle !== 'patients'); });
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.deepEqual(a.journauxActifs.map((j) => j.nom), ['socle', 'isocont']);
  const p1 = await a.enregistrer('PATIENT', { patientId: 'P1', nom: 'ANCIEN (fictif)', service: 'U1' });
  assert.ok(fichier(racine, ISOCONT, p1.id), 'comme avant, dans le journal d’Isocont');
  const ad = await connecter(racine);
  assert.equal(ad.coffre.cles.patients.courante, 1);
  assert.equal(ad.etatAttestation().anomalies.length, 0);
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.deepEqual(a2.journauxActifs.map((j) => j.nom), ['socle', 'patients', 'isocont']);
  const p2 = await a2.enregistrer('PATIENT', { patientId: 'P2', nom: 'NOUVEAU (fictif)', service: 'U1' });
  assert.ok(fichier(racine, PATIENTS, p2.id));
  assert.ok(a2.etat.patients.P1 && a2.etat.patients.P2, 'anciennes et nouvelles fiches lues');
  // Poste resté ouvert : reçoit la clé à la relecture du coffre, journaux relus
  a.dernierCoffre = 0; await a.synchroniser();
  assert.deepEqual(a.journauxActifs.map((j) => j.nom), ['socle', 'patients', 'isocont']);
  assert.ok(a.etat.patients.P2);
});

test('Lots : fiches dans le journal de Patients, mesures dans celui d’Isocont, liés ; annulés et rétablis ensemble', async () => {
  const { racine } = await equipe();
  const ad = await connecter(racine);
  const t = Date.now() - 7200e3;
  const lot = await ad.enregistrerLot([
    { type: 'PATIENT', at: new Date(t).toISOString(), data: { patientId: 'PL', ipp: '5005 (fictif)', nom: 'LOT (fictif)', naissance: '1970-07-07', service: 'U1' } },
    { type: 'MODE_HOSPI', at: new Date(t).toISOString(), data: { patientId: 'PL', date: t, mode: 'SDT' } },
    { type: 'MESURE_DEBUT', at: new Date(t).toISOString(), data: mesure('ML', 'PL') }], { libelle: 'Import (fictif)' });
  const lots = ad.evts.filter((e) => e.type === 'LOT');
  assert.equal(lots.length, 2);
  assert.equal(lots[0].data.lien, lots[1].data.lien);
  const lp = lots.find((e) => e.data.journal === 'patients');
  assert.ok(fichier(racine, PATIENTS, lp.id) && fichier(racine, ISOCONT, lot.id));
  assert.deepEqual(lp.data.evenements.map((x) => x.type), ['PATIENT', 'MODE_HOSPI']);
  assert.equal(ad.etat.mesures.ML.patientId, 'PL');
  assert.equal(ad.etat.patients.PL.modes.length, 1);
  // Annulation du lot d'Isocont : celui de Patients l'est aussi
  const ann = await ad.enregistrer('ANNULATION', { cible: lot.id, motif: 'import à refaire (fictif)' });
  assert.ok(!ad.etat.mesures.ML && !ad.etat.patients.PL);
  const conj = ad.evts.find((e) => e.type === 'ANNULATION' && e.data.origine === ann.id);
  assert.ok(conj && fichier(racine, PATIENTS, conj.id));
  // « Rétablir » : les deux lots reviennent
  await ad.enregistrer('ANNULATION', { cible: ann.id, motif: 'rétabli (fictif)' });
  assert.ok(ad.etat.mesures.ML && ad.etat.patients.PL);
  const relu = await connecter(racine);
  assert.ok(relu.etat.mesures.ML && relu.etat.patients.PL.ipp === '5005 (fictif)');
});

test('Fiche : historique daté des changements (protection, détenu, service), valeur en vigueur à une date', async () => {
  const P = require('../app/js/module-patients.js');
  const at = (j) => new Date(Date.UTC(2026, 0, j)).toISOString();
  const st = P.reduire([
    { id: '1', at: at(1), by: 'u', type: 'PATIENT', data: { patientId: 'P', nom: 'X (fictif)', protection: '' , service: 'U1' } },
    { id: '2', at: at(10), by: 'u', type: 'PATIENT', data: { patientId: 'P', protection: 'Curatelle' } },
    { id: '3', at: at(20), by: 'u', type: 'PATIENT', data: { patientId: 'P', protection: 'Tutelle', service: 'U2' } }]);
  const f = st.fiches.P;
  assert.equal(f.protection, 'Tutelle');
  assert.deepEqual(f.historique.protection.map((x) => x.valeur), ['', 'Curatelle', 'Tutelle']);
  assert.equal(P.valeurAu(f, 'protection', Date.UTC(2026, 0, 15)), 'Curatelle');
  assert.equal(P.valeurAu(f, 'service', Date.UTC(2026, 0, 5)), 'U1');
  // Isocont lit la fourniture qu'on lui passe (lecture à la volée), sans reconstituer la fiche
  const etat = M.reduire([{ id: '9', at: at(2), by: 'u', type: 'MESURE_DEBUT', data: Object.assign(mesure('M9', 'Q'), { debut: Date.UTC(2026, 0, 2) }) }],
    { patients: { fiches: { Q: { id: 'Q', ipp: '42 (fictif)', modes: [] } }, fusions: {} } });
  assert.equal(etat.patients.Q.ipp, '42 (fictif)');
});

test('Fiche commune : nom de naissance, sexe, médecins et référents datés, séjours successifs, réglages par service', async () => {
  const P = require('../app/js/module-patients.js');
  const at = (j) => new Date(Date.UTC(2026, 2, j)).toISOString();
  const st = P.reduire([
    { id: '1', at: at(1), by: 'u', type: 'PATIENT', data: { patientId: 'P', nom: 'DURAND (fictif)', nomNaissance: 'MARTIN (fictif)', sexe: 'F', medecin1: 'Dr A (fictif)', referents: [{ id: 'u1', nom: 'IDE A (fictif)' }] } },
    { id: '2', at: at(2), by: 'u', type: 'SEJOUR', data: { patientId: 'P', sejourId: 'S1', iep: '111 (fictif)', entree: '2026-03-02', service: 'U1', chambre: '412', lit: 'U' } },
    { id: '3', at: at(9), by: 'u', type: 'SEJOUR', data: { patientId: 'P', sejourId: 'S1', sortie: '2026-03-09' } },
    { id: '4', at: at(20), by: 'u', type: 'SEJOUR', data: { patientId: 'P', sejourId: 'S2', iep: '222 (fictif)', entree: '2026-03-20', service: 'U1', chambre: '410', lit: 'P' } },
    { id: '5', at: at(21), by: 'u', type: 'PATIENT', data: { patientId: 'P', medecin1: 'Dr B (fictif)', referents: [{ id: 'u1', nom: 'IDE A (fictif)' }, { id: null, nom: 'Mme C (fictif)' }] } },
    { id: '6', at: at(22), by: 'u', type: 'PATIENT', data: { patientId: 'Q', nom: 'DURAND (fictif)' } },
    { id: '7', at: at(22), by: 'u', type: 'SEJOUR', data: { patientId: 'Q', sejourId: 'S3', entree: '2025-12-01', sortie: '2025-12-10' } },
    { id: '8', at: at(23), by: 'u', type: 'FUSION', data: { garde: 'P', absorbe: 'Q' } }]);
  const f = st.fiches.P;
  assert.equal(f.nomNaissance, 'MARTIN (fictif)');
  assert.equal(f.sexe, 'F');
  assert.deepEqual(f.sejours.map((x) => x.id), ['S3', 'S1', 'S2']);            // fusion : séjours réunis, par date d'entrée
  assert.equal(P.sejourEnCours(f).iep, '222 (fictif)');
  assert.equal(f.sejours.find((x) => x.id === 'S1').sortie, '2026-03-09');
  assert.deepEqual(f.historique.medecin1.map((x) => x.valeur), ['Dr A (fictif)', 'Dr B (fictif)']);
  assert.equal(P.valeurAu(f, 'medecin1', Date.UTC(2026, 2, 10)), 'Dr A (fictif)');
  assert.equal(f.historique.referents.length, 2);
  // Réglages par service : psychiatrie par défaut, libellés modifiables
  assert.deepEqual(P.optionsFiche({}, 'U1'), { psychiatrie: true, medecin1: 'Psychiatre de 1re ligne', medecin2: 'Psychiatre de 2e ligne' });
  assert.deepEqual(P.optionsFiche({ fichePatient: { services: { U2: { psychiatrie: false, medecin2: 'Médecin traitant' } } } }, 'U2'), { psychiatrie: false, medecin1: 'Médecin de 1re ligne', medecin2: 'Médecin traitant' });
});

test('Séjour : saisie du module Patients, permise aux IDE, secrétaire et cadre ; refusée à l’AS', async () => {
  const { racine, admin } = await equipe();
  await admin.creerComptes([{ nom: 'AS (fictif)', login: 'as.a', motDePasse: 'mot de passe as a', roles: ['AS'], services: ['U1'] }]);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.enregistrer('PATIENT', { patientId: 'P1', nom: 'SEJOUR (fictif)', service: 'U1' });
  const e = await a.enregistrer('SEJOUR', { patientId: 'P1', sejourId: 'S1', entree: '2026-11-01', service: 'U1', chambre: '412', lit: 'U' });
  assert.ok(fichier(racine, PATIENTS, e.id));
  assert.equal(a.etat.patients.P1.sejours[0].chambre, '412');
  const as = await co(racine, 'as.a', 'mot de passe as a');
  await assert.rejects(as.enregistrer('SEJOUR', { patientId: 'P1', sejourId: 'S2', entree: '2026-11-02' }), /rôle/);
  await assert.rejects(as.enregistrer('PATIENT', { patientId: 'P1', nom: 'X' }), /rôle/);
  assert.equal(as.etat.patients.P1.nom, 'SEJOUR (fictif)');                   // l'AS lit la fiche
});

test('Reprise de l’historique puis liste du DPI : deux lots liés, calculs identiques à un lot unique, fiche complétée par l’IPP, relance sans doublon', async () => {
  const R = require('../app/js/import-registre.js');
  const IP = require('../app/js/import-patients.js');
  const { racine } = await equipe();
  const ad = await connecter(racine);
  const REG = [
    'N° registre;Cat.;IPP;Âge;Mode;Date début;Heure début;Date fin;Heure fin;Lieu;Psychiatre;Soignants',
    'A1;A;000001;35;SDT;02/01/2026;08:00;02/01/2026;12:00;CSI 1;Dr Exemple (fictif);Agent A (fictif) (IDE)',
    'C2;C;000001;35;SDT;02/01/2026;12:00;02/01/2026;18:00;CSI 1;Dr Exemple (fictif);Agent A (fictif) (IDE)',
    'B3;B;000002;50;SPI;10/01/2026;09:00;10/01/2026;15:00;Chambre 3;Dr Autre (fictif);'].join('\r\n');
  const lignes = R.lireCSV(REG), g = R.deviner(lignes), maintenant = Date.now();
  const prep = R.preparer({ lignes, ligneEntete: g.ligneEntete, correspondance: g.correspondance }, ad.etat, { maintenant, serviceParDefaut: 'U1' });
  const avant = ad.evts.slice();
  const lot = await ad.enregistrerLot(prep.evenements, { libelle: 'Import du registre (fictif)' });
  const lots = ad.evts.filter((e) => e.type === 'LOT');
  assert.deepEqual(lots.map((e) => e.data.journal).sort(), ['isocont', 'patients']);
  // Calculs identiques à ceux d'un lot unique (comme avant la séparation des journaux)
  const unique = M.reduire(avant.concat([{ id: 'zLOT', at: lot.at, by: ad.utilisateur.id, type: 'LOT', data: { evenements: prep.evenements } }]));
  const reg = (st) => M.registre(st, 'U1', 2026, maintenant).map((e) => [e.numero, e.categorie, e.debut, e.fin]);
  assert.deepEqual(reg(ad.etat), reg(unique));
  assert.deepEqual(Object.values(ad.etat.patients).map((p) => p.ipp).sort(), ['000001', '000002']);
  // Fiches de l'historique : source « import », complétées par la liste du DPI (rattachées par l'IPP)
  const p1 = Object.values(ad.etat.patients).find((p) => p.ipp === '000001');
  assert.equal(p1.sources.ipp, 'import');
  const LISTE = ['IPP;IEP;Sexe;Nom prénom;Né·e le;Entrée;RM;Loc.', '000001;8001;F;MARTIN ZOE Née MARTIN;01/02/1991;01/11/2026;UHP1;HD412-U'].join('\r\n');
  const l2 = IP.lireCSV(LISTE), m2 = IP.appliquerModele(l2, null); m2.unites = { UHP1: 'U1' };
  const an = IP.analyser(l2, m2, ad.etat.patients, {});
  assert.equal(an.lignes[0].fiche.id, p1.id);
  await ad.enregistrerLot(IP.saisies(an, {}).evenements, { libelle: 'Liste du DPI (fictif)' });
  const f = ad.etat.patients[p1.id];
  assert.equal(f.nom, 'MARTIN'); assert.equal(f.prenom, 'Zoe'); assert.equal(f.sexe, 'F');
  assert.equal(f.sejours[0].chambre, '412');
  assert.equal(ad.etat.mesures[Object.keys(ad.etat.mesures).find((k) => ad.etat.mesures[k].patientId === p1.id)].patientId, p1.id);
  // Relance de l'import du registre : aucun doublon
  const prep2 = R.preparer({ lignes, ligneEntete: g.ligneEntete, correspondance: g.correspondance }, ad.etat, { maintenant, serviceParDefaut: 'U1' });
  assert.equal(prep2.rapport.mesures, 0);
  assert.equal(prep2.rapport.patients, 0);
  // Durée de conservation : séjour en cours (Patients) retient le patient malgré une mesure ancienne
  const loin = new Date(maintenant); loin.setFullYear(loin.getFullYear() + 3);
  assert.deepEqual(M.auDelaConservation(ad.etat, 1, loin.getTime()).map((x) => x.patient.ipp), ['000002']);
});
