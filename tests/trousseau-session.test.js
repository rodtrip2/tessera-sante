// SPDX-License-Identifier: EUPL-1.2
// Trousseau dans la session (étape 4, version 0.4.2) : coffre version 2, connexion, comptes, secours, coffre version 1 : npm test
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


const enc = new TextEncoder(), dec = new TextDecoder();
async function premierFichier(racine, chemin) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) rep = rep.e.get(p);
  const res = [];
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else res.push(v); } })(rep);
  return res[0];
}
const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };
const mesure = (id) => ({ mesureId: id, patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });

test('Coffre version 2 : clés distinctes par journal, aucune clé de données en clair, secours limité aux clés maîtresses', async () => {
  const { racine, admin, code } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }] });
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  const cf = admin.coffre;
  assert.equal(cf.version, 2);
  assert.deepEqual(Object.keys(cf.cles).sort(), ['isocont', 'plateforme']);
  assert.deepEqual(Object.keys(cf.agents).sort(), [admin.utilisateur.id, 'secours'].sort());
  const pour = (qui) => cf.enveloppes.filter((e) => e.pour === qui).map((e) => e.cle + ':' + e.g).sort();
  assert.deepEqual(pour(admin.utilisateur.id), ['isocont:1', 'isocont:m', 'plateforme:1', 'plateforme:m']);
  assert.deepEqual(pour('secours'), ['isocont:m', 'plateforme:m']);
  assert.ok(cf.emballages.every((e) => ['mdp', 'secours'].includes(e.methode)));
  // Fichiers « SIC2 » génération 1, chacun lisible avec sa seule clé
  const fs = await premierFichier(racine, SOCLE), fi = await premierFichier(racine, ISOCONT);
  assert.equal(dec.decode(fs.data.slice(0, 4)), 'SIC2');
  assert.equal(C.generationFichier(fi.data), 1);
  const nomI = fi.name;
  await assert.rejects(C.dechiffrerJSON(admin.trousseau.plateforme, fi.data, 'evt:' + nomI));   // la clé de plateforme ne lit pas Isocont
  assert.equal((await C.dechiffrerJSON(admin.trousseau.isocont, fi.data, 'evt:' + nomI)).type, 'MESURE_DEBUT');
  assert.deepEqual(await SIC.trousseau.manquantes(admin.trousseau), []);
  // Code de secours : ouvre tout (clés maîtresses → générations)
  const sec = new Session(new Dossier(racine, 'reseau')); await sec.chargerCoffre(); await sec.connexionCodeSecours(code);
  assert.ok(sec.etat.mesures.M1);
  assert.deepEqual(sec.etat.config.services.map((x) => x.code), ['U1']);
});

test('Comptes : clé personnelle à la création, réinitialisation par l’administrateur (nouvelle paire), changement par l’agent', async () => {
  const { racine, admin } = await nouveauDossier();
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  await admin.creerComptes([{ nom: 'IDE (fictif)', login: 'ide', motDePasse: 'mot de passe ide 1', roles: ['IDE'], services: ['U1'] }]);
  const id = admin.comptes.find((c) => c.login === 'ide').id;
  const enveloppes = () => admin.coffre.enveloppes.filter((e) => e.pour === id).map((e) => e.cle + ':' + e.g).sort();
  assert.deepEqual(enveloppes(), ['isocont:1', 'plateforme:1']);              // générations seulement, pas de clé maîtresse
  let ide = await co(racine, 'ide', 'mot de passe ide 1');
  assert.ok(ide.etat.mesures.M1);
  assert.equal(ide.trousseau.isocont.maitresse, null);
  // L'agent change son mot de passe : même paire, nouvel emballage
  const pub1 = admin.coffre.agents[id].publique;
  await ide.changerMonMotDePasse('mot de passe ide 2');
  await assert.rejects(co(racine, 'ide', 'mot de passe ide 1'), /incorrect/);
  ide = await co(racine, 'ide', 'mot de passe ide 2');
  assert.ok(ide.etat.mesures.M1);
  // Réinitialisation par l'administrateur : nouvelle clé personnelle, anciennes enveloppes remplacées
  await admin.reinitialiserMotDePasse(id, 'provisoire 2026 ide');
  assert.notEqual(admin.coffre.agents[id].publique, pub1);
  assert.deepEqual(enveloppes(), ['isocont:1', 'plateforme:1']);
  await assert.rejects(co(racine, 'ide', 'mot de passe ide 2'), /incorrect/);
  ide = await co(racine, 'ide', 'provisoire 2026 ide');
  assert.ok(ide.utilisateur.mdpProvisoire && ide.etat.mesures.M1);
  // Un administrateur ajouté reçoit les clés maîtresses ; un compte désactivé perd ses enveloppes
  await admin.modifierRoles(id, ['IDE', 'ADMIN'], true, ['U1']);
  assert.deepEqual(enveloppes(), ['isocont:1', 'isocont:m', 'plateforme:1', 'plateforme:m']);
  await admin.modifierRoles(id, ['IDE'], false, ['U1']);
  assert.deepEqual(enveloppes(), []);
  await assert.rejects(co(racine, 'ide', 'provisoire 2026 ide'), /incorrect/);
});

test('Code de secours renouvelé : l’ancien n’ouvre plus rien ; copie sous scellé restaurée et ouverte par le code', async () => {
  const { racine, admin, code } = await nouveauDossier();
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  const scelle = await admin.copieSousScelle();
  assert.ok(!scelle.emballages.some((e) => e.methode === 'mdp'));
  // Restauration de la copie sous scellé dans un dossier qui a perdu son coffre
  const perdu = new Repertoire('Coffre perdu');
  const d = new Dossier(perdu, 'reseau');
  for (const [nom, v] of racine.e) if (nom !== 'coffre.json' && nom !== 'coffre-historique') perdu.e.set(nom, v);
  await d.restaurerCoffre(scelle);
  const s = new Session(d); await s.chargerCoffre(); await s.connexionCodeSecours(code);
  assert.ok(s.etat.mesures.M1);
  // Nouveau code : l'ancien est refusé, le nouveau ouvre toutes les clés
  const nouveau = await admin.nouveauCodeSecours();
  const t1 = new Session(new Dossier(racine, 'reseau')); await t1.chargerCoffre();
  await assert.rejects(t1.connexionCodeSecours(code), /incorrect/);
  await t1.connexionCodeSecours(nouveau);
  assert.ok(t1.etat.mesures.M1);
  assert.equal(admin.coffre.enveloppes.filter((e) => e.pour === 'secours').length, 2);
  assert.equal(await Session.verifierAdministrateur(new Dossier(racine, 'reseau'), '', nouveau), 'code de secours');
  assert.equal(await Session.verifierAdministrateur(new Dossier(racine, 'reseau'), 'admin', 'mot de passe solide'), 'Admin (fictif)');
});

test('Coffre version 1 (dossier de la 0.4.0) : ouvert et utilisé comme avant, fichiers au format d’origine', async () => {
  const racine = new Repertoire('Dossier 0.4.0');
  const d = new Dossier(racine, 'reseau');
  // Coffre tel que l'écrivait la 0.4.0 : une clé de données emballée par mot de passe et par code de secours
  const cle = await C.nouvelleCleDonnees(), code = C.nouveauCodeSecours();
  const compte = { id: 'u0000adm', login: 'admin', nom: 'Admin (fictif)', roles: ['CADRE', 'ADMIN'], actif: true };
  const embMdp = Object.assign(await C.emballerMotDePasse(cle, 'mot de passe solide', 1000), { id: 'k1', userId: compte.id, login: 'admin' });
  const embSec = Object.assign(await C.emballerCodeSecours(cle, code), { id: 'k2', userId: null });
  await d.ecrireCoffre({ format: 'SIC-coffre', version: 1, creeLe: new Date().toISOString(), emballages: [embMdp, embSec], comptes: C.b64(await C.chiffrerJSON(cle, { comptes: [compte] }, 'comptes')) }, undefined);
  const admin = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(admin.coffre.version, 1);
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  const f = await premierFichier(racine, ISOCONT);
  assert.equal(dec.decode(f.data.slice(0, 4)), 'SIC1');                       // format d'origine, lisible par la 0.4.0
  assert.equal((await C.dechiffrerJSON(cle, f.data, 'evt:' + f.name)).type, 'MESURE_DEBUT');
  await admin.creerComptes([{ nom: 'IDE (fictif)', login: 'ide', motDePasse: 'mot de passe ide 1', roles: ['IDE'], services: ['U1'] }]);
  const ide = await co(racine, 'ide', 'mot de passe ide 1');
  assert.ok(ide.etat.mesures.M1);
  const nouveau = await admin.nouveauCodeSecours();
  const sec = new Session(new Dossier(racine, 'reseau')); await sec.chargerCoffre(); await sec.connexionCodeSecours(nouveau);
  assert.ok(sec.etat.mesures.M1);
  assert.equal(admin.coffre.version, 1);
});
