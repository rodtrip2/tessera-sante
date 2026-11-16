// SPDX-License-Identifier: EUPL-1.2
// Remises de clés à confirmer (correctif du 15 novembre 2026, constat S1 de l'audit) : un réglage écrit par un autre agent,
// même forgé au nom du cadre, ne donne aucune clé sans la confirmation de l'administrateur. Données fictives, dossier en mémoire.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

class Fichier {
  constructor(name) { this.name = name; this.kind = 'file'; this.data = new Uint8Array(); this.modifie = 0; }
  async getFile() { const d = this.data; return { size: d.length, lastModified: this.modifie, arrayBuffer: async () => d.slice().buffer }; }
  async createWritable() { let t; return { write: async (o) => { t = new Uint8Array(o); }, close: async () => { this.data = t; this.modifie = Date.now() + (Fichier.h = (Fichier.h || 0) + 1); } }; }
}
class Repertoire {
  constructor(name) { this.name = name; this.kind = 'directory'; this.e = new Map(); }
  async getDirectoryHandle(n, o) { return this.obtenir(n, o, Repertoire); }
  async getFileHandle(n, o) { return this.obtenir(n, o, Fichier); }
  obtenir(n, o, Type) { if (!this.e.has(n)) { if (!(o && o.create)) throw Object.assign(new Error('introuvable'), { name: 'NotFoundError' }); this.e.set(n, new Type(n)); } return this.e.get(n); }
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

test('S6 — écart d’horloge signalé après deux écritures au-delà de 5 minutes, tracé une fois', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  const ecrire = Dossier.prototype.ecrireFichier;
  let ecart = 0;
  Dossier.prototype.ecrireFichier = async function (...a) { await ecrire.apply(this, a); this.ecartHorloge = { ecart, le: Date.now() }; };
  test.after(() => { Dossier.prototype.ecrireFichier = ecrire; });
  await admin.tracer('ESSAI', { libelle: 'horloge juste (fictif)' });
  assert.equal(admin.ecartHorlogeSignale(), null);
  ecart = 12 * 60000;   // le poste avance de 12 minutes
  await admin.tracer('ESSAI', { libelle: 'premier écart (fictif)' });
  assert.equal(admin.ecartHorlogeSignale(), null, 'une seule mesure : pas encore signalé');
  await admin.tracer('ESSAI', { libelle: 'second écart (fictif)' });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(admin.ecartHorlogeSignale(), { minutes: 12 });
  await admin.tracer('ESSAI', { libelle: 'troisième écart (fictif)' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(admin.evts.filter((e) => e.type === 'COMPTE' && e.data.action === 'HORLOGE').length, 1, 'tracé une fois par session');
  ecart = 30000;        // remis à l'heure
  await admin.tracer('ESSAI', { libelle: 'horloge corrigée (fictif)' });
  assert.equal(admin.ecartHorlogeSignale(), null);
});
