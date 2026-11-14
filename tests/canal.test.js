// SPDX-License-Identifier: EUPL-1.2
// Versions stable, bêta et développement (demande du porteur du 13 novembre 2026, lot H) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
const { detecter, LIBELLES } = require('../app/js/canal.js');

class Fichier { constructor(n) { this.name = n; this.kind = 'file'; this.data = null; } async createWritable() { const f = this; return { write: async (d) => { f.data = d; }, close: async () => {} }; } }
class Repertoire {
  constructor() { this.e = new Map(); }
  async getFileHandle(n, o) { if (!this.e.has(n)) { if (!(o && o.create)) throw Object.assign(new Error('introuvable'), { name: 'NotFoundError' }); this.e.set(n, new Fichier(n)); } return this.e.get(n); }
  async *keys() { for (const k of [...this.e.keys()]) yield k; }
}

test('Version déduite de l’adresse : stable, bêta, développement', () => {
  assert.equal(detecter('/tessera-sante/app/'), 'stable');
  assert.equal(detecter('/tessera-sante/app/index.html'), 'stable');
  assert.equal(detecter('/tessera-sante/beta/app/'), 'beta');
  assert.equal(detecter('/tessera-sante/dev/app/sw.js'), 'dev');
  assert.equal(detecter('/tessera-sante/dev/app'), 'dev');
  assert.equal(detecter('/intranet/tessera/app/'), 'stable');
  assert.equal(detecter('/tessera-sante/developpement/app/'), 'stable', 'seuls les dossiers « beta » et « dev » comptent');
  assert.equal(detecter(''), 'stable');
  assert.equal(detecter(undefined), 'stable');
  assert.deepEqual(Object.keys(LIBELLES), ['stable', 'beta', 'dev']);
  assert.equal(globalThis.SIC.CANAL, 'stable', 'sous Node (sans adresse) : version stable');
  assert.equal(globalThis.SIC.suffixeCanal, '');
});

test('Bêta et développement : un dossier réseau doit être un dossier d’essai', async () => {
  globalThis.SIC.crypto = globalThis.SIC.crypto || require('../app/js/crypto.js');
  require('../app/js/store.js');
  const D = globalThis.SIC.Dossier;
  // Version stable : aucun contrôle
  const donnees = new Repertoire(); await donnees.getFileHandle('coffre.json', { create: true });
  assert.equal(await D.verifierEssai(donnees, 'stable'), 'stable');
  // Dossier qui contient des données sans marque : refusé, rien n'est écrit
  await assert.rejects(D.verifierEssai(donnees, 'beta'), /dossier d’essai/);
  await assert.rejects(D.verifierEssai(donnees, 'dev'), /version de développement/);
  assert.ok(!donnees.e.has('ESSAI-LISEZMOI.txt'));
  // Dossier vide : marqué comme dossier d'essai, puis accepté
  const vide = new Repertoire();
  assert.equal(await D.verifierEssai(vide, 'beta'), 'marque');
  assert.ok(vide.e.has('ESSAI-LISEZMOI.txt'));
  await vide.getFileHandle('coffre.json', { create: true });
  assert.equal(await D.verifierEssai(vide, 'dev'), 'essai');
});
