// SPDX-License-Identifier: EUPL-1.2
// Dossier des données fixé par le service informatique (26 novembre 2026, -Donnees du script de mise à jour) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

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

const F = require('../app/js/donnees-fixees.js');

test('Règle lue dans la page : date de création du coffre et chemin ; absente ou mal formée : choix libre', () => {
  assert.deepEqual(F.lire('2026-11-20T08:15:00.123Z|\\\\serveur\\partage\\Tessera\\donnees (fictif)'), { creeLe: '2026-11-20T08:15:00.123Z', chemin: '\\\\serveur\\partage\\Tessera\\donnees (fictif)' });
  assert.equal(F.lire(''), null);
  assert.equal(F.lire('n’importe quoi|x'), null);
  assert.equal(F.conforme({ creeLe: '2026-11-20T08:15:00.123Z' }, F.lire('2026-11-20T08:15:00.123Z|x')), true);
  assert.equal(F.conforme({ creeLe: '2025-01-01T00:00:00.000Z' }, F.lire('2026-11-20T08:15:00.123Z|x')), false);
  assert.equal(F.conforme(null, null), true, 'sans règle, tout dossier');
  // La page publiée porte la balise vide (que le script remplit) et charge la règle avant le stockage
  const index = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.equal(index.split('<meta name="tessera-donnees" content="">').length, 2);
  assert.ok(index.indexOf('js/donnees-fixees.js') < index.indexOf('js/store.js'));
});

test('Dossier fixé : mêmes données ouvertes ; autres données, dossier vide et démonstration refusés', async () => {
  const racine = new Repertoire('donnees');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  const autre = new Repertoire('autres');
  await new Session(new Dossier(autre, 'reseau')).initialiser({ nom: 'Admin 2 (fictif)', login: 'admin2', motDePasse: 'mot de passe solide 2' });
  const vide = new Repertoire('vide');
  SIC.donneesFixees = Object.assign({}, F, { actuelles: { creeLe: admin.coffre.creeLe, chemin: '\\\\serveur\\donnees (fictif)' } });
  try {
    assert.equal(Dossier.donneesFixees().chemin, '\\\\serveur\\donnees (fictif)');
    await new Dossier(racine, 'reseau').verifierDonneesFixees();
    await assert.rejects(new Dossier(autre, 'reseau').verifierDonneesFixees(), /autres données/);
    await assert.rejects(new Dossier(vide, 'reseau').verifierDonneesFixees(), /ne contient pas les données/);
    await assert.rejects(Dossier.demo(), /démonstration indisponible/);
    // Coffre abîmé dans le dossier des données : ouvert pour l'écran de restauration, jamais pour une initialisation
    const abime = new Repertoire('abime');
    await abime.getDirectoryHandle('evenements', { create: true });
    const d = new Dossier(abime, 'reseau');
    assert.equal(await d.anomalie(), 'sans-coffre');
    await d.verifierDonneesFixees();
  } finally { SIC.donneesFixees = null; }
  await new Dossier(autre, 'reseau').verifierDonneesFixees();   // sans règle : choix libre
});
