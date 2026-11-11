// SPDX-License-Identifier: EUPL-1.2
// Mes tâches : liste personnelle chiffrée par la clé personnelle de l'agent (0.26.3). Données fictives : npm test
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
globalThis.SIC.agenda = require('../app/js/module-agenda.js');
const MS = require('../app/js/module-messagerie.js');
globalThis.SIC.messagerie = MS;
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };


test('Mes tâches : contenu lisible par le seul agent (pas l’administrateur), saisie refusée pour un autre agent', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }] });
  await admin.creerComptes([{ nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U1'] }]);
  await admin.creerClesManquantes();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.ok(a.aClePersonnelle());
  const ch = await a.chiffrerPersonnel('taches', { titre: 'Appeler la pharmacie (fictif)', echeance: '2026-11-20' });
  assert.ok(!ch.includes('pharmacie'));
  a.choisirModule('agenda');
  await a.enregistrer('TACHE_PERSO', { id: 'TP1', agent: a.utilisateur.id, chiffre: ch });
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.equal((await a2.dechiffrerPersonnel('taches', ch)).titre, 'Appeler la pharmacie (fictif)');
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  assert.equal(await b.dechiffrerPersonnel('taches', ch), null);
  b.choisirModule('agenda');
  await assert.rejects(b.enregistrer('TACHE_PERSO', { id: 'TP1', agent: a.utilisateur.id, chiffre: ch }), /rôle|agent/);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(await ad.dechiffrerPersonnel('taches', ch), null);
  const st = SIC.agenda.reduire([{ v: 1, id: 'x1', at: '2026-11-11T08:00:00.000Z', by: 'u', type: 'TACHE_PERSO', data: { id: 'T', agent: 'u', chiffre: 'abc' } },
    { v: 1, id: 'x2', at: '2026-11-11T09:00:00.000Z', by: 'v', type: 'TACHE_PERSO', data: { id: 'T', agent: 'v', chiffre: 'def' } }]);
  assert.equal(st.perso.T.chiffre, 'abc');   // une tâche n'appartient qu'à son agent
  assert.equal(SIC.agenda.tachesPerso(st, 'u').length, 1);
});
