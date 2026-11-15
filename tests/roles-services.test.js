// SPDX-License-Identifier: EUPL-1.2
// Rôles selon le service (phase 5, 15 novembre 2026). Données fictives ; npm test
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
const RS = require('../app/js/roles-services.js');
const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };

test('Rôles selon le service : rôles du service, ensemble des rôles, compte vu dans un service', () => {
  const cfg = { rolesServices: { a: { U2: ['CADRE'], U9: ['IDE'], U1: ['ADMIN'] } } };
  const a = { id: 'a', roles: ['IDE', 'ADMIN_GARDE'], services: ['U1', 'U2'] };
  assert.deepEqual(RS.normaliser(cfg.rolesServices), { a: { U2: ['CADRE'], U9: ['IDE'] } });   // ADMIN n'est pas un rôle de service
  assert.deepEqual(RS.rolesDans(a, cfg, 'U1'), ['IDE', 'ADMIN_GARDE']);
  assert.deepEqual(RS.rolesDans(a, cfg, 'U2'), ['ADMIN_GARDE', 'CADRE']);     // rôle de service remplacé, rôle d'établissement gardé
  assert.deepEqual(RS.rolesDans(a, cfg, 'U9'), ['IDE', 'ADMIN_GARDE']);       // pas affecté à U9 : réglage sans effet
  assert.deepEqual(RS.rolesDans(a, cfg, '*'), ['IDE', 'ADMIN_GARDE']);
  assert.deepEqual(RS.rolesTous(a, cfg), ['IDE', 'ADMIN_GARDE', 'CADRE']);
  assert.equal(RS.aDesRoles(cfg, a), true);
  assert.equal(RS.aDesRoles({}, a), false);
  assert.deepEqual(RS.compteDans(a, cfg, 'U2'), Object.assign({}, a, { roles: ['ADMIN_GARDE', 'CADRE'], services: ['U2'] }));
  assert.deepEqual(RS.rolesDans({ id: 'b', roles: ['IDE'], services: ['U1'] }, { rolesServices: { b: { U1: ['CADRE_SUP'] } } }, 'U1'), ['CADRE_SUP', 'CADRE']);
  assert.deepEqual(RS.avec({ rolesServices: {} }, 'a', 'U2', ['AS']), { a: { U2: ['AS'] } });
  assert.deepEqual(RS.avec({ rolesServices: { a: { U2: ['AS'] } } }, 'a', 'U2', null), {});
});

test('Rôles selon le service : réglés par l’administrateur, et par le cadre pour ses services (rôles de soins seulement)', () => {
  const admin = { id: 'ad', roles: ['ADMIN'], services: [] }, cadre = { id: 'c', roles: ['CADRE'], services: ['U1'] };
  const comptes = [{ id: 'a', nom: 'Agent A (fictif)', roles: ['AS'], services: ['U1', 'U2'] }, cadre];
  assert.ok(RS.controler({}, { a: { U2: ['CADRE'] } }, admin, comptes));
  assert.ok(RS.controler({}, { a: { U1: ['IDE'] } }, cadre, comptes));
  assert.throws(() => RS.controler({}, { a: { U1: ['CADRE'] } }, cadre, comptes), /administrateur seulement/);
  assert.throws(() => RS.controler({}, { a: { U2: ['IDE'] } }, cadre, comptes), /ne réglez pas/);
  assert.throws(() => RS.controler({ a: { U1: ['CADRE'] } }, {}, cadre, comptes), /administrateur seulement/);   // retirer un rôle d'encadrement
  assert.throws(() => RS.controler({}, { a: { U3: ['IDE'] } }, admin, comptes), /pas affecté/);
  assert.throws(() => RS.controler({}, { c: { U1: ['IDE'] } }, cadre, comptes.concat([])), /propres rôles|ne réglez/);
  assert.equal(RS.peutRegler(cadre, comptes[0]), true);
  assert.equal(RS.peutRegler(cadre, { id: 'x', roles: ['IDE'], services: ['U2'] }), false);
  assert.deepEqual(RS.attribuables(cadre, 'U1'), ['IDE', 'AS', 'SECRETAIRE', 'INTERVENANT']);
});

test('Rôles selon le service : chaque saisie est contrôlée avec les rôles du service qu’elle concerne', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.creerComptes([{ nom: 'AS A (fictif)', login: 'as.a', motDePasse: 'mot de passe as a', roles: ['AS'], services: ['U1', 'U2'] },
    { nom: 'Cadre U2 (fictif)', login: 'cadre2', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U2'] }]);
  const ida = admin.comptes.find((c) => c.login === 'as.a').id;
  // L'aide-soignant ne crée pas de fiche patient ; le cadre de l'Unité 2 lui donne le rôle IDE dans son service
  const a0 = await co(racine, 'as.a', 'mot de passe as a');
  await assert.rejects(a0.enregistrer('PATIENT', { patientId: 'P0', nom: 'ESSAI (fictif)', service: 'U2' }), /rôle/);
  const c2 = await co(racine, 'cadre2', 'mot de passe cadre');
  await assert.rejects(c2.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [ida]: { U1: ['IDE'] } } }), /rôle/);
  await assert.rejects(c2.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [ida]: { U2: ['CADRE'] } } }), /rôle/);
  await c2.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [ida]: { U2: ['IDE'] } } });
  await admin.synchroniser(); await admin.appliquerDroits();
  const a = await co(racine, 'as.a', 'mot de passe as a');
  assert.deepEqual(a.roles().slice().sort(), ['AS', 'IDE']);           // « Tous les services » : ensemble des rôles
  a.serviceCourant = 'U1'; assert.deepEqual(a.roles(), ['AS']);
  a.serviceCourant = 'U2'; assert.deepEqual(a.roles(), ['IDE']);
  a.serviceCourant = '*';
  await a.enregistrer('PATIENT', { patientId: 'P2', nom: 'DEUX (fictif)', service: 'U2' });
  await assert.rejects(a.enregistrer('PATIENT', { patientId: 'P1', nom: 'UN (fictif)', service: 'U1' }), /rôle dans le service U1 \(fictif\)/);
});
