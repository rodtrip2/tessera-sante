// SPDX-License-Identifier: EUPL-1.2
// Remise et retrait des clés selon les droits (étape 4, version 0.4.4) : npm test
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

/** Fichier de saisie d'un événement (journal d'Isocont). */
function fichierDe(racine, evt) {
  const m = evt.at.slice(0, 7).split('-');
  return racine.e.get('modules').e.get('isocont').e.get('evenements').e.get(m[0]).e.get(m[1]).e.get(evt.id + '.enc');
}
const genIsocont = (s) => s.coffre.cles.isocont.courante;
async function dossierEquipe() {
  const { racine, admin, code } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  await admin.creerComptes([
    { nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U2'] },
    { nom: 'Sans rôle (fictif)', login: 'sans', motDePasse: 'mot de passe sans', roles: [], services: ['U1'] }]);
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  return { racine, admin, code, id };
}

test('Remise selon les droits : sans rôle dans Isocont, pas de clé du module ni de lecture de son journal', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const cles = (login) => [...new Set(admin.coffre.enveloppes.filter((e) => e.pour === id(login)).map((e) => e.cle))].sort();
  assert.deepEqual(cles('ide.a'), ['isocont', 'patients', 'plateforme']);   // Patients : suit le droit à Isocont
  assert.deepEqual(cles('sans'), ['plateforme']);
  const sans = await co(racine, 'sans', 'mot de passe sans');
  assert.equal(sans.accesModule(), false);
  assert.deepEqual(sans.journauxActifs.map((j) => j.nom), ['socle']);
  assert.equal(sans.rejetes.length, 0);                                  // le journal d'Isocont n'est même pas lu
  assert.ok(!sans.etat.mesures.M1);
  assert.deepEqual(sans.etat.config.services.map((x) => x.code), ['U1', 'U2']);   // réglages communs : socle
  await assert.rejects(sans.enregistrer('MESURE_DEBUT', mesure('M9')), /rôle ne permet pas|clé du module/);
  assert.deepEqual(admin.trousseauxIncomplets(), []);
});

test('Retrait d’un rôle : nouvelle génération ; l’agent retiré ne lit pas les saisies postérieures, les autres si', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  const cleB1 = await b.trousseau.isocont.cle(1);                       // ce que B détenait
  assert.equal(genIsocont(admin), 1);
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);              // B n'a plus de rôle dans Isocont
  assert.equal(genIsocont(admin), 2);
  assert.equal(admin.coffre.cles.plateforme.courante, 1);                // il garde la clé de plateforme
  const e2 = await admin.enregistrer('MESURE_DEBUT', mesure('M2'));
  const f2 = fichierDe(racine, e2);
  assert.equal(C.generationFichier(f2.data), 2);
  await assert.rejects(C.dechiffrerJSON(() => cleB1, f2.data, 'evt:' + f2.name));   // même avec la clé qu'il avait gardée
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.etat.mesures.M1 && a.etat.mesures.M2);                     // A lit l'ancienne et la nouvelle génération
  // Le poste de B resté ouvert relit son trousseau : il n'a plus accès au module
  b.dernierCoffre = 0; await b.synchroniser();
  assert.equal(b.accesModule(), false);
  assert.ok(!b.etat.mesures.M1);
});

test('Désactivation d’un compte, module désactivé pour un service : nouvelles générations, encadrement conservé', async () => {
  const { racine, admin, id } = await dossierEquipe();
  await admin.creerComptes([{ nom: 'Cadre (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U2'] }]);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  // Module désactivé pour U2 : B (IDE de U2) perd la clé, le cadre de U2 la garde
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: { isocont: { tous: false, services: ['U1'] } } });
  assert.equal(genIsocont(admin), 2);
  const tient = (login) => admin.coffre.enveloppes.some((e) => e.pour === id(login) && e.cle === 'isocont' && e.g === 2);
  assert.deepEqual([tient('ide.a'), tient('ide.b'), tient('cadre')], [true, false, true]);
  // Réactivation du module : B la retrouve (toutes les générations), sans nouvelle génération
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: {} });
  assert.equal(genIsocont(admin), 2);
  assert.ok(tient('ide.b'));
  // Désactivation du compte de A : nouvelle génération de chaque clé, poste de A verrouillé à sa synchronisation
  let message = null;
  a.sur((s, info) => { if (info.source === 'verrou') message = info.message; });
  await admin.modifierRoles(id('ide.a'), ['IDE'], false, ['U1']);
  assert.deepEqual([admin.coffre.cles.plateforme.courante, genIsocont(admin)], [2, 3]);
  assert.ok(!admin.coffre.enveloppes.some((e) => e.pour === id('ide.a')));
  a.dernierCoffre = 0; await a.synchroniser();
  assert.match(message, /accès a été retiré/);
  assert.equal(a.cle, null);
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  assert.ok(b.etat.mesures.M1);
});

test('Retrait d’un administrateur : nouvelle clé maîtresse ; le code de secours lit toujours toutes les générations', async () => {
  const { racine, admin, code } = await nouveauDossier();
  await admin.enregistrer('MESURE_DEBUT', mesure('M1'));
  await admin.creerComptes([{ nom: 'Admin 2 (fictif)', login: 'admin2', motDePasse: 'mot de passe admin 2', roles: ['CADRE', 'ADMIN'], services: [] }]);
  const id2 = admin.comptes.find((c) => c.login === 'admin2').id;
  const a2 = await co(racine, 'admin2', 'mot de passe admin 2');
  const ancienneMaitresse = a2.trousseau.isocont.maitresse.slice();
  await admin.modifierRoles(id2, ['CADRE'], true, ['U1']);
  assert.deepEqual(admin.coffre.cles.isocont, { courante: 2, base: 2 });
  assert.notDeepEqual(admin.trousseau.isocont.maitresse, ancienneMaitresse);
  assert.ok(!admin.coffre.enveloppes.some((e) => e.pour === id2 && e.g === 'm'));
  const e2 = await admin.enregistrer('MESURE_DEBUT', mesure('M2'));
  // L'ancienne clé maîtresse ne produit pas la nouvelle génération
  const f2 = fichierDe(racine, e2);
  const devinee = await C.importerCleOctets(await C.octetsGeneration(ancienneMaitresse, 'isocont', 2));
  await assert.rejects(C.dechiffrerJSON(() => devinee, f2.data, 'evt:' + f2.name));
  // Secours : génération 1 (remise explicitement) et génération 2 (nouvelle clé maîtresse)
  assert.ok(admin.coffre.enveloppes.some((e) => e.pour === 'secours' && e.cle === 'isocont' && e.g === 1));
  const sec = new Session(new Dossier(racine, 'reseau')); await sec.chargerCoffre(); await sec.connexionCodeSecours(code);
  assert.ok(sec.etat.mesures.M1 && sec.etat.mesures.M2);
  // L'ancien administrateur, devenu cadre, lit toujours le module (génération 2 remise)
  const cadre = await co(racine, 'admin2', 'mot de passe admin 2');
  assert.ok(cadre.etat.mesures.M2);
  assert.equal(cadre.trousseau.isocont.maitresse, null);
});

test('Premier changement de mot de passe : l’agent crée sa propre clé personnelle ; trousseau incomplet réémis', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const pub0 = admin.coffre.agents[id('ide.a')].publique;
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.utilisateur.mdpProvisoire);
  await a.changerMonMotDePasse('mot de passe personnel a');
  assert.notEqual(a.coffre.agents[id('ide.a')].publique, pub0);
  assert.equal(a.utilisateur.mdpProvisoire, false);
  await a.enregistrer('MESURE_DEBUT', mesure('M3'));                      // la session continue avec la nouvelle clé
  const a2 = await co(racine, 'ide.a', 'mot de passe personnel a');
  assert.ok(a2.etat.mesures.M1 && a2.etat.mesures.M3);
  // Chaque changement par l'agent : nouvelle clé personnelle (un ancien mot de passe resté dans l'historique n'ouvre plus rien)
  const pub1 = a2.coffre.agents[id('ide.a')].publique;
  await a2.changerMonMotDePasse('mot de passe personnel a2');
  assert.notEqual(a2.coffre.agents[id('ide.a')].publique, pub1);
  const a3 = await co(racine, 'ide.a', 'mot de passe personnel a2');
  assert.ok(a3.etat.mesures.M3);
  // Enveloppe perdue (coffre modifié à la main) : signalée, puis réémise par l'administrateur
  await admin.modifierCoffre(async (cf) => { cf.enveloppes = cf.enveloppes.filter((e) => !(e.pour === id('ide.b') && e.cle === 'isocont')); });
  assert.deepEqual(admin.trousseauxIncomplets().map((x) => [x.nom, x.cles]), [['IDE B (fictif)', ['isocont']]]);
  const r = await admin.appliquerDroits();
  assert.equal(r.change, true);
  assert.deepEqual(r.generations, []);
  assert.deepEqual(admin.trousseauxIncomplets(), []);
  assert.equal((await admin.appliquerDroits()).change, false);            // plus rien à faire : coffre non réécrit
});

test('Copie sous scellé : à refaire après un changement de clé maîtresse ; résumé du trousseau', async () => {
  const { racine, admin } = await nouveauDossier();
  await admin.creerComptes([{ nom: 'Admin 2 (fictif)', login: 'admin2', motDePasse: 'mot de passe admin 2', roles: ['CADRE', 'ADMIN'], services: [] },
    { nom: 'Sans rôle (fictif)', login: 'sans', motDePasse: 'mot de passe sans', roles: [], services: [] }]);
  await admin.copieSousScelle();
  assert.equal(admin.etatScelle().aJour, true);
  const id2 = admin.comptes.find((c) => c.login === 'admin2').id, idS = admin.comptes.find((c) => c.login === 'sans').id;
  let r = admin.resumeTrousseau();
  assert.deepEqual(r.cles, { plateforme: 1, patients: 1, isocont: 1 });
  assert.deepEqual(r.comptes[id2], { cles: ['isocont', 'patients', 'plateforme'], maitresses: true });
  assert.deepEqual(r.comptes[idS], { cles: ['plateforme'], maitresses: false });
  // Nouvelle génération sans changement de clé maîtresse : la copie reste valable
  await admin.modifierRoles(idS, ['SECRETAIRE'], true, ['U1']);
  await admin.modifierRoles(idS, [], true, ['U1']);
  assert.equal(admin.coffre.cles.isocont.courante, 2);
  assert.equal(admin.etatScelle().aJour, true);
  // Retrait d'un administrateur : nouvelle clé maîtresse, copie à refaire
  await admin.modifierRoles(id2, ['CADRE'], true, ['U1']);
  assert.equal(admin.etatScelle().aJour, false);
  await admin.copieSousScelle();
  assert.equal(admin.etatScelle().aJour, true);
  r = admin.resumeTrousseau();
  assert.equal(r.comptes[id2].maitresses, false);
});
