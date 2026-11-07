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
