// SPDX-License-Identifier: EUPL-1.2
// Messagerie : chiffrement réservé aux destinataires, consultation tracée (0.24.0). Données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

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
globalThis.SIC.groupes = require('../app/js/groupes.js');
require('../app/js/module-isocont.js');
const MS = require('../app/js/module-messagerie.js');
globalThis.SIC.messagerie = MS;
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };

async function equipe() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.creerComptes([
    { nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U2'] },
    { nom: 'Cadre U1 (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1'] }]);
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  await admin.enregistrer('CONFIG', { cle: 'groupes', valeur: [{ code: 'nuit', libelle: 'Nuit (fictif)', services: ['U1'], membres: [{ id: id('ide.a'), nom: 'IDE A' }] }] });
  await admin.enregistrer('CONFIG', { cle: 'messagerie', valeur: { '*': { chiffrement: 'choix' } } });
  await admin.creerClesManquantes();
  return { racine, admin, id };
}

test('Chiffrement désactivé par défaut : aucune clé de la messagerie', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.creerClesManquantes();
  assert.deepEqual(Object.keys(admin.coffre.cles).filter((n) => /^m-/.test(n)), []);
});

test('Message chiffré : écrit par un non-membre, lu par les seuls destinataires ; consultation tracée par le cadre', async () => {
  const { racine, admin, id } = await equipe();
  const noms = Object.keys(admin.coffre.cles).filter((n) => /^m-/.test(n));
  assert.ok(noms.includes('m-s.U1') && noms.includes('m-g.nuit') && noms.includes('m-r.IDE.U2') && noms.includes('m-c.U1') && noms.includes('m-a.' + id('ide.a')));
  // Remise : l'IDE A (U1, groupe de nuit) a ses clés, pas celles de l'Unité 2 ni de la consultation
  const cles = (login) => [...new Set(admin.coffre.enveloppes.filter((e) => e.pour === id(login) && /^m-/.test(e.cle)).map((e) => e.cle))].sort();
  assert.deepEqual(cles('ide.a'), ['m-a.' + id('ide.a'), 'm-g.nuit', 'm-r.IDE.U1', 'm-s.U1'].sort());
  assert.ok(cles('cadre').includes('m-c.U1') && !cles('cadre').includes('m-c.U2'));
  // Le cadre de l'Unité 1 écrit au groupe de nuit, dont il n'est pas membre (partie publique attestée)
  const c = await co(racine, 'cadre', 'mot de passe cadre');
  const dest = [{ genre: 'groupe', code: 'nuit' }];
  const nomsMsg = MS.clesPourMessage(dest, c.compteEffectif(), c.etat.config, c.comptes);
  assert.deepEqual(nomsMsg.sort(), ['m-a.' + id('cadre'), 'm-c.U1', 'm-g.nuit'].sort());
  const chiffre = await c.chiffrerMessage('MS1', nomsMsg, { objet: 'Clés de la réserve (fictif)', texte: 'Secret d’organisation (fictif)' });
  await c.enregistrer('MESSAGE', { id: 'MS1', nom: 'Cadre U1', destinataires: dest, services: ['U1'], objet: '', texte: '', chiffre: chiffre });
  assert.ok(!JSON.stringify(chiffre).includes('réserve'));
  // L'auteur relit son message dans une nouvelle session
  const c2 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal((await c2.ouvrirMessage('MS1', chiffre)).objet, 'Clés de la réserve (fictif)');
  // Le membre du groupe lit ; l'IDE de l'Unité 2 ne lit pas
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.equal((await a.ouvrirMessage('MS1', chiffre)).texte, 'Secret d’organisation (fictif)');
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  assert.equal(await b.ouvrirMessage('MS1', chiffre), null);
  // Réponse chiffrée avec la clé du message
  const rep = await a.chiffrerPourMessage('MS1', { texte: 'Bien reçu (fictif)' }, 'R1');
  assert.equal((await c2.dechiffrerPourMessage('MS1', rep, 'R1')).texte, 'Bien reçu (fictif)');
  // L'administrateur (qui détient techniquement toutes les clés) ne l'ouvre pas : il n'est pas destinataire
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(await ad.ouvrirMessage('MS1', chiffre), null);
  // Un message en clair n'est pas accepté quand l'établissement impose le chiffrement
  await admin.enregistrer('CONFIG', { cle: 'messagerie', valeur: { '*': { chiffrement: 'impose' } } });
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a');
  await assert.rejects(a2.enregistrer('MESSAGE', { id: 'MS2', objet: 'En clair', texte: 'x', destinataires: [{ genre: 'service', code: 'U1' }], services: ['U1'] }), /impose/);
});

test('Consultation tracée par le cadre ; après réinitialisation du mot de passe et « Tout renouveler », les messages restent lisibles', async () => {
  const { racine, admin, id } = await equipe();
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  const dest = [{ genre: 'agent', code: id('ide.a') }];
  const noms = MS.clesPourMessage(dest, b.compteEffectif(), b.etat.config, b.comptes);
  assert.ok(noms.includes('m-c.U1') && noms.includes('m-c.U2'));   // services de l'agent nommé et de l'auteur
  const chiffre = await b.chiffrerMessage('MS9', noms, { objet: 'Avant (fictif)', texte: 'x' });
  await b.enregistrer('MESSAGE', { id: 'MS9', nom: 'IDE B', destinataires: dest, services: [], objet: '', texte: '', chiffre: chiffre });
  // Le cadre de l'Unité 1 : rien sans consultation tracée, puis lecture après la saisie de la consultation
  const c = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(await c.ouvrirMessage('MS9', chiffre, { consultation: true }), null);
  await assert.rejects(c.enregistrer('CONSULTATION', { message: 'MS9', motif: 'Signalement ou plainte', precision: '' }), /Précisez/);
  await c.enregistrer('CONSULTATION', { message: 'MS9', motif: 'Signalement ou plainte', precision: 'Signalement du 11 novembre (fictif)', informer: false, nom: 'Cadre U1' });
  assert.equal(await c.ouvrirMessage('MS9', chiffre), null);   // sans demander la consultation
  assert.equal((await c.ouvrirMessage('MS9', chiffre, { consultation: true })).objet, 'Avant (fictif)');
  assert.equal(c.etatModule('messagerie').messages.MS9.consultations.length, 1);
  // Réinitialisation du mot de passe par l'administrateur, puis « Tout renouveler »
  await admin.reinitialiserMotDePasse(id('ide.a'), 'provisoire 2026 a');
  const a = await co(racine, 'ide.a', 'provisoire 2026 a');
  assert.equal((await a.ouvrirMessage('MS9', chiffre)).objet, 'Avant (fictif)');
  const r = await admin.renouvelerTout('mot de passe solide');
  const a2 = await co(racine, 'ide.a', r.provisoires.find((x) => x.login === 'ide.a').motDePasse);
  assert.equal((await a2.ouvrirMessage('MS9', chiffre)).objet, 'Avant (fictif)');
});
