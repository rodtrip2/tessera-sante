// SPDX-License-Identifier: EUPL-1.2
// Second facteur et règles de connexion (0.75.0, constat S3 de l'audit) : mot de passe et clé de sécurité, règles
// attestées. La clé de sécurité est simulée (secret fixe par clé) ; données fictives, dossier en mémoire.
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
const DLm = require('../app/js/delegations.js');

const jour = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const C = globalThis.SIC.crypto;
// Clés de sécurité simulées : chaque clé « branchée » a un secret ; `branchee` désigne celle que l'agent présente
const cles = {}; let branchee = null, creations = 0;
C.webauthnDisponible = () => true;
C.creerCleSecurite = async (identifiant, libelle, uv) => {
  if (!branchee) throw new Error('Aucune clé présentée.');
  const id = 'cred-' + (++creations), sel = C.aleatoire(16), secret = C.aleatoire(32);
  cles[id] = { secret, porteur: branchee, uv: !!uv };
  return { idCredential: id, selPRF: 'x', sel: C.b64(sel), libelle, rpId: 'test', uv: !!uv, k: await C.cleDepuisPRF(secret, sel) };
};
C.evaluerCles = async (liste) => {
  const cle = liste.find((e) => cles[e.idCredential] && cles[e.idCredential].porteur === branchee);
  if (!cle) throw new Error('Clé non reconnue.');
  return { cle, k: await C.cleDepuisPRF(cles[cle.idCredential].secret, C.deb64(cle.sel)) };
};
async function co(racine, login, mdp) { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; }
async function equipe() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'A', libelle: 'A (fictif)' }] });
  await admin.creerComptes([{ nom: 'Cadre A (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['A'] },
    { nom: 'IDE A (fictif)', login: 'ide', motDePasse: 'mot de passe ide', roles: ['IDE'], services: ['A'] }]);
  return { racine, admin };
}

test('Second facteur : la connexion demande la clé puis le mot de passe ; l’un sans l’autre n’ouvre rien', async () => {
  const { racine } = await equipe();
  branchee = 'cle-cadre';
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(cadre.secondFacteurAEnregistrer(), false, 'non exigé par défaut');
  await cadre.activerSecondFacteur('mot de passe cadre', 'YubiKey (fictive)');
  const embs = cadre.coffre.emballages.filter((e) => e.userId === cadre.utilisateur.id);
  assert.equal(embs.length, 1); assert.ok(embs[0].cle2 && embs[0].methode === 'mdp');
  // Sans la clé (aucune, ou celle d'un autre) : refus, même avec le bon mot de passe
  branchee = null;
  await assert.rejects(co(racine, 'cadre', 'mot de passe cadre'), /Clé non reconnue/);
  branchee = 'autre-cle';
  await assert.rejects(co(racine, 'cadre', 'mot de passe cadre'), /Clé non reconnue/);
  // Avec la clé mais un mauvais mot de passe : refus
  branchee = 'cle-cadre';
  await assert.rejects(co(racine, 'cadre', 'mauvais mot de passe'), /incorrect/);
  // Les deux : session ouverte, clés du trousseau intactes, saisies signées vérifiées
  const c2 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(c2.connexionDouble, true);
  assert.equal(c2.detientCle('isocont'), true);
  assert.deepEqual(c2.saisiesEcartees(), []);
  assert.ok(c2.evts.some((e) => e.type === 'COMPTE' && e.data.action === 'SECOND_FACTEUR'));
  // L'enveloppe du mot de passe n'est pas atteignable sans la clé : le mot de passe seul n'ouvre pas l'emballage
  await assert.rejects(C.deballerMotDePasse(embs[0], 'mot de passe cadre', true));
  // Une clé qui ouvrirait seule la session n'est pas permise à ce compte
  await assert.rejects(c2.ajouterCleSecurite('seule (fictive)'), /seule la session/);
});

test('Changement de mot de passe : la clé associée est gardée ; réinitialisation par l’administrateur : mot de passe provisoire seul', async () => {
  const { racine, admin } = await equipe();
  branchee = 'cle-cadre';
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.activerSecondFacteur('mot de passe cadre', 'YubiKey (fictive)');
  await cadre.changerMonMotDePasse('nouveau mot de passe cadre');
  await assert.rejects(co(racine, 'cadre', 'mot de passe cadre'), /incorrect/);
  const c2 = await co(racine, 'cadre', 'nouveau mot de passe cadre');
  assert.equal(c2.connexionDouble, true);
  branchee = null;
  await assert.rejects(co(racine, 'cadre', 'nouveau mot de passe cadre'), /Clé non reconnue/);
  // Clé perdue : l'administrateur réinitialise ; l'agent se connecte avec le mot de passe provisoire
  const id = admin.comptes.find((c) => c.login === 'cadre').id;
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.reinitialiserMotDePasse(id, 'provisoire cadre 2026');
  const c3 = await co(racine, 'cadre', 'provisoire cadre 2026');
  assert.equal(c3.connexionDouble, false);
});

test('Règles de connexion : réglées par l’administrateur, attestées ; second facteur exigé par rôle', async () => {
  const { racine, admin } = await equipe();
  assert.deepEqual(admin.politiqueConnexion(), { regleMdp: 'renforcee', secondFacteur: [], codeCle: false });
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await assert.rejects(ide.reglerConnexion({ secondFacteur: [] }), /administrateur/);
  await admin.reglerConnexion({ regleMdp: 'renforcee', secondFacteur: ['CADRE', 'ADMIN'], codeCle: true });
  assert.ok(admin.evts.some((e) => e.type === 'COMPTE' && e.data.action === 'CONNEXION_REGLES'));
  assert.equal(admin.secondFacteurAEnregistrer(), true, 'l’administrateur lui-même est concerné');
  branchee = 'cle-cadre';
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(cadre.politiqueConnexion().codeCle, true);
  assert.equal(cadre.secondFacteurAEnregistrer(), true);
  await cadre.activerSecondFacteur('mot de passe cadre', 'YubiKey (fictive)');
  assert.equal(cadre.secondFacteurAEnregistrer(), false);
  assert.equal(cadre.coffre.emballages.find((e) => e.userId === cadre.utilisateur.id).cle2.uv, true, 'code de la clé exigé à l’enregistrement');
  assert.equal((await co(racine, 'ide', 'mot de passe ide')).secondFacteurAEnregistrer(), false, 'rôle non concerné');
  const etat = admin.etatSecondFacteur();
  await admin.synchroniser();
  assert.deepEqual(admin.etatSecondFacteur().map((x) => [x.login, x.exige, x.double]), [['admin', true, false], ['cadre', true, true], ['ide', false, false]]);
  void etat;
  // Coffre modifié hors de l'outil pour lever l'exigence : sans effet, les règles attestées font foi et sont réécrites
  const d = new Dossier(racine, 'reseau'), cf = await d.lireCoffre();
  cf.connexion = { regleMdp: 'simple', secondFacteur: [], codeCle: false };
  await d.ecrireCoffre(cf, cf.rev);
  const c2 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.deepEqual(c2.politiqueConnexion().secondFacteur, ['ADMIN', 'CADRE']);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.creerComptes([{ nom: 'AS A (fictif)', login: 'as', motDePasse: 'mot de passe as', roles: ['AS'], services: ['A'] }]);
  assert.deepEqual(ad.coffre.connexion.secondFacteur, ['ADMIN', 'CADRE']);
  assert.equal(ad.etatAttestation().anomalies.filter((x) => x.bloquante).length, 0);
});

test('Enveloppe double : la clé puis le mot de passe, dans cet ordre', async () => {
  const k = await C.cleDepuisPRF(C.aleatoire(32), C.aleatoire(16)), autre = await C.cleDepuisPRF(C.aleatoire(32), C.aleatoire(16));
  const secret = C.aleatoire(48), emb = await C.emballerMotDePasse(secret, 'un mot de passe (fictif)', 1000);
  await C.surEmballer(emb, { idCredential: 'c', selPRF: 's', sel: 'x', rpId: 'test', k });
  assert.deepEqual(new Uint8Array(await C.deballerDouble(emb, k, 'un mot de passe (fictif)', true)), secret);
  await assert.rejects(C.deballerDouble(emb, autre, 'un mot de passe (fictif)', true));
  await assert.rejects(C.deballerDouble(emb, k, 'autre', true));
});
