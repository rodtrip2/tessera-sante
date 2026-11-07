// SPDX-License-Identifier: EUPL-1.2
// Non-régression de la revue indépendante du trousseau (0.4.5) : npm test
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

const lireFichier = (racine, evt) => fichierDe(racine, evt).data;

test('I1 — Écriture du coffre en échec après un changement de clé maîtresse : rien n’est installé, aucune saisie perdue', async () => {
  const { racine, admin, code } = await nouveauDossier();
  await admin.creerComptes([{ nom: 'Admin 2 (fictif)', login: 'admin2', motDePasse: 'mot de passe admin 2', roles: ['CADRE', 'ADMIN'], services: [] }]);
  const id2 = admin.comptes.find((c) => c.login === 'admin2').id;
  const maitresse = admin.trousseau.isocont.maitresse.slice();
  const ecrire = admin.dossier.ecrireCoffre.bind(admin.dossier);
  admin.dossier.ecrireCoffre = async () => { throw new Error('modification concurrente (simulée)'); };
  await assert.rejects(admin.modifierRoles(id2, ['CADRE'], true, ['U1']), /simulée/);
  admin.dossier.ecrireCoffre = ecrire;
  assert.equal(admin.trousseau.isocont.courante, 1);
  assert.deepEqual(admin.trousseau.isocont.maitresse, maitresse);
  const e = await admin.enregistrer('MESURE_DEBUT', mesure('M7'));
  assert.equal(C.generationFichier(lireFichier(racine, e)), 1);
  const sec = new Session(new Dossier(racine, 'reseau')); await sec.chargerCoffre(); await sec.connexionCodeSecours(code);
  assert.ok(sec.etat.mesures.M7);
});

test('I2 — Poste ouvert : un changement de mot de passe ou le retour du mode formation suit la nouvelle génération', async () => {
  const { racine, admin, id } = await dossierEquipe();
  await admin.creerComptes([{ nom: 'IDE C (fictif)', login: 'ide.c', motDePasse: 'mot de passe ide c', roles: ['IDE'], services: ['U1'] }]);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  const af = await co(racine, 'ide.c', 'mot de passe ide c');   // autre agent : un changement de clé de A verrouillerait ses autres postes
  await admin.creerFormation([{ type: 'PATIENT', data: { patientId: 'PF', nom: 'Patient (fictif)' } }], 'Jeu (fictif)');
  af.coffre = await af.dossier.lireCoffre(); await af.ouvrirFormation();
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);              // génération 2
  // A change son mot de passe dans la minute : son trousseau est confronté au coffre avant l'écriture
  await a.changerMonMotDePasse('mot de passe personnel a');
  const e = await a.enregistrer('MESURE_DEBUT', mesure('M5'));
  // Même agent sur un autre poste : sa clé personnelle a changé, ce poste se verrouille
  const ailleurs = await co(racine, 'ide.a', 'mot de passe personnel a');
  await a.changerMonMotDePasse('mot de passe personnel a2');
  let message = null; ailleurs.sur((x, info) => { if (info.source === 'verrou') message = info.message; });
  ailleurs.dernierCoffre = 0; await ailleurs.synchroniser();
  assert.match(message, /renouvelées/);
  assert.equal(C.generationFichier(lireFichier(racine, e)), 2);
  // Retour du mode formation : génération 2 d'Isocont reprise du coffre
  await af.fermerFormation();
  assert.equal(af.trousseau.isocont.courante, 2);
  const e2 = await af.enregistrer('MESURE_DEBUT', mesure('M6'));
  assert.equal(C.generationFichier(lireFichier(racine, e2)), 2);
});

test('I3 — Compte temporaire expiré : traité comme désactivé, nouvelle génération sans lui', async () => {
  const { admin } = await dossierEquipe();
  await admin.creerComptes([{ nom: 'Intérim (fictif)', login: 'interim', motDePasse: 'mot de passe interim', roles: ['IDE'], services: ['U1'], finValidite: '2026-11-30' }]);
  const idI = admin.comptes.find((c) => c.login === 'interim').id;
  assert.ok(admin.coffre.enveloppes.some((e) => e.pour === idI && e.cle === 'isocont'));
  await admin.modifierCoffre(async (cf, comptes) => { comptes.find((c) => c.id === idI).finValidite = '2026-01-01'; });
  const r = await admin.appliquerDroits();
  assert.deepEqual(r.generations.sort(), ['isocont', 'patients', 'plateforme']);
  assert.ok(!admin.coffre.enveloppes.some((e) => e.pour === idI));
  assert.deepEqual(admin.trousseauxIncomplets(), []);
});

test('I4 — Ancien mot de passe retrouvé dans l’historique du coffre : il n’ouvre plus aucune clé', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.changerMonMotDePasse('mot de passe personnel a');
  await a.changerMonMotDePasse('mot de passe personnel a2');           // l'ancien emballage est dans l'historique
  const versions = await new Dossier(racine, 'reseau').versionsCoffre();
  let p8 = null;
  for (const v of versions) {
    const emb = v.coffre && v.coffre.emballages.find((e) => e.userId === id('ide.a') && e.methode === 'mdp');
    if (emb && !p8) p8 = await C.deballerMotDePasse(emb, 'mot de passe personnel a', true).catch(() => null);
  }
  assert.ok(p8, 'emballage de l’ancien mot de passe retrouvé dans l’historique');
  const t = await SIC.trousseau.ouvrir(await new Dossier(racine, 'reseau').lireCoffre(), id('ide.a'), await C.importerPrivee(C.ouvrirPaquet(p8).prive8));
  assert.equal(await t.plateforme.cle(t.plateforme.courante), null);
  assert.equal(await t.isocont.cle(t.isocont.courante), null);
  // Un compte désactivé perd sa clé personnelle ; réactivé, il est signalé jusqu'à la réinitialisation
  await admin.modifierRoles(id('ide.b'), ['IDE'], false, ['U2']);
  assert.ok(!admin.coffre.agents[id('ide.b')]);
  await admin.modifierRoles(id('ide.b'), ['IDE'], true, ['U2']);
  assert.deepEqual(admin.trousseauxIncomplets().map((x) => x.cles), [['clé personnelle']]);
  await admin.reinitialiserMotDePasse(id('ide.b'), 'provisoire 2026 b');
  assert.deepEqual(admin.trousseauxIncomplets(), []);
});

test('C2 (parade partielle) — Génération courante remise en arrière dans le coffre : on écrit toujours avec la plus haute reçue', async () => {
  const { racine, admin, id } = await dossierEquipe();
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);              // génération 2
  const d = new Dossier(racine, 'reseau');
  const cf = await d.lireCoffre(); cf.cles.isocont.courante = 1;
  await d.ecrireCoffre(cf, cf.rev);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  const e = await a.enregistrer('MESURE_DEBUT', mesure('M8'));
  assert.equal(C.generationFichier(lireFichier(racine, e)), 2);
});

test('M1 — Une enveloppe abîmée n’empêche pas la connexion ni l’ouverture des autres clés', async () => {
  const { racine, admin, id } = await dossierEquipe();
  await admin.modifierCoffre(async (cf) => {
    const e = cf.enveloppes.find((x) => x.pour === id('ide.a') && x.cle === 'isocont');
    cf.enveloppes.push(Object.assign({}, e, { g: 7, ct: e.ct.replace(/^.{8}/, 'AAAAAAAA') }));
  });
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.etat.mesures.M1);
  assert.equal(a.trousseau.isocont.illisibles, 1);
});
