// SPDX-License-Identifier: EUPL-1.2
// Attestation du coffre (0.5.0) : un agent qui garde un accès en écriture au partage ne se fait remettre aucune clé ; npm test
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

const A = require('../app/js/attestation.js');
const T = globalThis.SIC.trousseau;
const co = async (racine, login, mdp, memoire) => { const s = new Session(new Dossier(racine, 'reseau')); if (memoire) s.memoirePoste = memoire; await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };
const mesure = (id) => ({ mesureId: id, patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
const memoirePoste = () => { const m = new Map(); return { lire: (k) => m.get(k) || null, ecrire: (k, v) => m.set(k, v) }; };
function fichierDe(racine, evt) {
  const m = evt.at.slice(0, 7).split('-');
  return racine.e.get('modules').e.get('isocont').e.get('evenements').e.get(m[0]).e.get(m[1]).e.get(evt.id + '.enc');
}
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
const codes = (s) => s.etatAttestation().anomalies.map((x) => x.code);

test('Attestation : coffre neuf signé, ancre dans chaque emballage, empreintes de toutes les générations', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const cf = await new Dossier(racine, 'reseau').lireCoffre();
  const r = await A.verifier(cf, await C.ancreDe(cf.attestation.publique));
  assert.deepEqual(r.anomalies, []);
  assert.ok(r.etat.n >= 2 && r.etat.agents[id('ide.a')] && r.etat.empreintes.isocont[1] && r.etat.maitresses.plateforme);
  assert.ok(!/IDE|ADMIN/.test(cf.attestation.etat), 'aucun rôle lisible en clair');
  const emb = cf.emballages.find((e) => e.userId === id('ide.a') && e.methode === 'mdp');
  const p = C.ouvrirPaquet(await C.deballerMotDePasse(emb, 'mot de passe ide a', true));
  assert.equal(p.ancre, await C.ancreDe(cf.attestation.publique));
  const sec = cf.emballages.find((e) => e.methode === 'secours');
  assert.ok(sec);
  assert.deepEqual(codes(admin), []);
});

test('C1 — Partie publique d’un agent substituée sur le partage : aucune remise de clé, réparation par une nouvelle clé personnelle', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  const p = await C.nouvellePaire();
  cf.agents[id('ide.b')].publique = await C.exporterPublique(p.publicKey);   // paire connue de l'agent malveillant
  const ecrit = await d.ecrireCoffre(cf, cf.rev);
  await assert.rejects(admin.modifierRoles(id('sans'), ['IDE'], true, ['U1']), /hors de l’outil/);
  assert.ok(codes(admin).includes('agents'));
  assert.equal((await d.lireCoffre()).rev, ecrit.rev, 'coffre non réécrit');
  await admin.reinitialiserMotDePasse(id('ide.b'), 'provisoire b 2026', { reparation: true });
  assert.deepEqual(codes(admin), []);
  await admin.modifierRoles(id('sans'), ['IDE'], true, ['U1']);
  const b = await co(racine, 'ide.b', 'provisoire b 2026');
  assert.ok(b.etat.mesures.M1);
});

test('C3 — Rôle d’administrateur ajouté à son propre compte avec la clé de plateforme : refusé, dernière version attestée remise', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const x = await co(racine, 'ide.a', 'mot de passe ide a');
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  const o = await C.dechiffrerJSON(x.cle, C.deb64(cf.comptes), 'comptes');
  o.comptes.find((c) => c.login === 'ide.a').roles = ['IDE', 'ADMIN'];
  cf.comptes = C.b64(await C.chiffrerJSON(x.cle, o, 'comptes'));
  await d.ecrireCoffre(cf, cf.rev);
  await assert.rejects(admin.appliquerDroits(), /hors de l’outil/);
  assert.ok(!(await d.lireCoffre()).enveloppes.some((e) => e.pour === id('ide.a') && e.g === 'm'), 'aucune clé maîtresse remise');
  assert.ok(codes(admin).includes('comptes'));
  // Connexion de l'administrateur malgré l'anomalie (réparation), puis remise de la dernière version attestée
  const ad = await connecter(racine);
  assert.ok(codes(ad).includes('comptes'));
  await ad.remettreDerniereAttestee();
  assert.deepEqual(codes(ad), []);
  assert.deepEqual(ad.comptes.find((c) => c.login === 'ide.a').roles, ['IDE']);
  assert.ok(!ad.coffre.enveloppes.some((e) => e.pour === id('ide.a') && e.g === 'm'));
  assert.ok(ad.coffre.cles.isocont.courante >= 2, 'clés renouvelées');
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.etat.mesures.M1, 'historique toujours lisible');
});

test('C2 — Fausse génération glissée par un agent retiré : ignorée, l’agent écrit avec la génération attestée', async () => {
  const { racine, admin, id } = await dossierEquipe();
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);              // ide.b perd Isocont : génération 2
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  const faux = C.aleatoire(32), pour = id('ide.a');
  cf.cles.isocont.courante = 3;
  cf.enveloppes.push(Object.assign({ cle: 'isocont', g: 3, pour: pour }, await C.envelopper(faux, await C.importerPublique(cf.agents[pour].publique), T.contexte('isocont', 3, pour))));
  await d.ecrireCoffre(cf, cf.rev);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.equal(a.trousseau.isocont.courante, 2);
  assert.equal(a.trousseau.isocont.rejetees, 1);
  assert.ok(codes(a).includes('cles'));
  const evt = await a.enregistrer('MESURE_DEBUT', mesure('M2'));
  assert.equal(C.generationFichier(fichierDe(racine, evt).data), 2);
});

test('Clé d’attestation remplacée : connexion des agents refusée, l’administrateur répare', async () => {
  const { racine, admin } = await dossierEquipe();
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  const autre = await A.creerCles();
  cf.attestation.publique = autre.publique;
  cf.attestation.signature = await C.signer(autre.sign8, cf.attestation.etat);
  await d.ecrireCoffre(cf, cf.rev);
  await assert.rejects(co(racine, 'ide.a', 'mot de passe ide a'), /clé d’attestation inconnue/);
  const ad = await connecter(racine);
  assert.ok(codes(ad).includes('ancre'));
  await assert.rejects(ad.modifierRoles(ad.comptes.find((c) => c.login === 'sans').id, ['IDE'], true, ['U1']), /hors de l’outil/);
  await ad.remettreDerniereAttestee();
  assert.deepEqual(codes(ad), []);
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.etat.mesures.M1);
  // Attestation retirée : refusée aux agents dont l'emballage porte l'ancre
  const cf2 = await d.lireCoffre(); delete cf2.attestation; await d.ecrireCoffre(cf2, cf2.rev);
  await assert.rejects(co(racine, 'ide.a', 'mot de passe ide a'), /retirée/);
});

test('Clé personnelle créée par l’agent : preuve de continuité acceptée ; preuve forgée refusée', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.changerMonMotDePasse('mot de passe personnel a');
  await a.changerMonMotDePasse('mot de passe personnel a2');
  assert.equal((await new Dossier(racine, 'reseau').lireCoffre()).agents[id('ide.a')].preuves.length, 2);
  await admin.modifierRoles(id('sans'), ['IDE'], true, ['U1']);            // accepté : chaîne de preuves valide
  assert.ok(!admin.coffre.agents[id('ide.a')].preuves, 'preuves couvertes par la nouvelle signature');
  // Un agent forge une « preuve » pour un autre compte avec sa propre partie privée
  const x = await co(racine, 'ide.b', 'mot de passe ide b');
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  const p = await C.nouvellePaire(), pub = await C.exporterPublique(p.publicKey);
  const pr = await A.preuve(x.privee8, cf.agents[id('sans')].publique, x.controle.etat.temoin, id('sans'), pub);
  cf.agents[id('sans')] = { publique: pub, preuves: [pr] };
  await d.ecrireCoffre(cf, cf.rev);
  await assert.rejects(admin.modifierRoles(id('sans'), ['IDE'], true, ['U1', 'U2']), /hors de l’outil/);
  assert.deepEqual(admin.etatAttestation().anomalies.find((x) => x.code === 'agents').comptes, [id('sans')]);
});

test('Version antérieure du coffre recopiée sur le partage : détectée (poste, historique), dernière version attestée remise', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const d = new Dossier(racine, 'reseau');
  const vieux = JSON.parse(JSON.stringify(await d.lireCoffre()));         // ide.b encore IDE
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);                // génération 2, ide.b retiré
  const mem = memoirePoste();
  const a = await co(racine, 'ide.a', 'mot de passe ide a', mem);
  const actuel = await d.lireCoffre();
  vieux.rev = actuel.rev; await d.ecrireCoffre(vieux, actuel.rev);        // recopie par ide.b
  await assert.rejects(co(racine, 'ide.a', 'mot de passe ide a', mem), /version antérieure/);
  a.dernierCoffre = 0; await a.synchroniser();
  assert.equal(a.utilisateur, null, 'poste ouvert verrouillé');
  const ad = await connecter(racine);
  assert.ok(codes(ad).includes('ancienne'));
  await ad.remettreDerniereAttestee();
  assert.deepEqual(ad.comptes.find((c) => c.login === 'ide.b').roles, []);
  assert.ok(ad.coffre.cles.isocont.courante >= 3, 'au-dessus de toute génération employée');
  assert.ok(!ad.coffre.enveloppes.some((e) => e.pour === id('ide.b') && e.cle === 'isocont'));
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a', mem);
  assert.ok(a2.etat.mesures.M1);
});

test('Restauration du coffre : génération renouvelée au-dessus de l’historique, saisies antérieures lisibles', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const d = new Dossier(racine, 'reseau');
  const ancienne = (await d.versionsCoffre()).find((v) => v.coffre.cles.isocont.courante === 1).coffre;
  await admin.modifierRoles(id('ide.b'), [], true, ['U2']);                // génération 2
  await admin.enregistrer('MESURE_DEBUT', mesure('M3'));                   // écrite en génération 2
  racine.e.delete('coffre.json');
  await d.restaurerCoffre(ancienne);
  const ad = await connecter(racine);
  assert.deepEqual(codes(ad).sort(), ['ancienne', 'restaure']);   // une version plus récente figure dans l'historique
  await ad.renouvelerCles();
  assert.equal(ad.coffre.cles.isocont.courante, 3);
  assert.ok(!ad.coffre.cles.isocont.perdues, 'génération 2 retrouvée (même clé maîtresse) et attestée');
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.etat.mesures.M1 && a.etat.mesures.M3);
});

test('Compromission : tout renouveler (clés, attestation, code de secours, mots de passe provisoires)', async () => {
  const { racine, admin, code, id } = await dossierEquipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  const avant = admin.coffre.attestation.publique;
  await assert.rejects(admin.renouvelerTout('mauvais'), /incorrect/);
  const r = await admin.renouvelerTout('mot de passe solide');
  assert.ok(r.codeSecours && r.codeSecours !== code);
  assert.deepEqual(r.provisoires.map((p) => p.login).sort(), ['ide.a', 'ide.b', 'sans']);
  assert.notEqual(admin.coffre.attestation.publique, avant);
  assert.deepEqual(codes(admin), []);
  await assert.rejects(co(racine, 'ide.a', 'mot de passe ide a'), /incorrect/);
  a.dernierCoffre = 0; await a.synchroniser();
  assert.equal(a.utilisateur, null, 'ancien poste verrouillé');
  const a2 = await co(racine, 'ide.a', r.provisoires.find((p) => p.login === 'ide.a').motDePasse);
  assert.ok(a2.etat.mesures.M1, 'historique lisible');
  await connecter(racine);                                                 // l'administrateur garde son mot de passe
  const sec = new Session(new Dossier(racine, 'reseau')); await sec.chargerCoffre();
  await assert.rejects(sec.connexionCodeSecours(code), /incorrect/);
  await sec.connexionCodeSecours(r.codeSecours);
});

test('Coffre d’avant 0.5.0 (sans attestation) : attestation établie à la connexion de l’administrateur, emballage ancré', async () => {
  const { racine, admin, id } = await dossierEquipe();
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  delete cf.attestation;
  const emb = cf.emballages.find((e) => e.userId === admin.utilisateur.id && e.methode === 'mdp');
  Object.assign(emb, await C.emballerMotDePasse(admin.privee8.slice(), 'mot de passe solide'), { id: emb.id, userId: emb.userId, login: emb.login });
  await d.ecrireCoffre(cf, cf.rev);
  const ad = await connecter(racine);
  const apres = await d.lireCoffre();
  assert.ok(apres.attestation);
  const e2 = apres.emballages.find((e) => e.userId === ad.utilisateur.id && e.methode === 'mdp');
  assert.equal(C.ouvrirPaquet(await C.deballerMotDePasse(e2, 'mot de passe solide', true)).ancre, await C.ancreDe(apres.attestation.publique));
  assert.deepEqual(codes(ad), []);
});
