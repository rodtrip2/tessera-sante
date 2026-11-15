// SPDX-License-Identifier: EUPL-1.2
// Signature des saisies (0.72.0, correctif de fond du constat S1 de l'audit du 15 novembre 2026) : une saisie écrite au
// nom d'un autre, non signée ou altérée est écartée à la lecture. Données fictives, dossier en mémoire.
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
const SG = require('../app/js/signatures.js');

async function co(racine, login, mdp) { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; }
async function equipe(options) {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  if (options && options.ancien) globalThis.SIC.signatures = Object.assign({}, SG, { publiqueAgent: async () => null });   // coffre d'avant 0.72.0
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'A', libelle: 'A (fictif)' }] });
  await admin.creerComptes([
    { nom: 'Cadre A (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['A'] },
    { nom: 'IDE A (fictif)', login: 'ide', motDePasse: 'mot de passe ide', roles: ['IDE'], services: ['A'] }]);
  if (options && options.ancien) delete globalThis.SIC.signatures;
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  return { racine, admin, id };
}
const etab = (s) => s.etat.config.etablissement;

test('Coffre neuf : signature exigée dès la création, clés des comptes attestées', async () => {
  const { racine, admin, id } = await equipe();
  const e = admin.etatSignatures();
  assert.ok(e.exigee, 'exigence inscrite dans l’état attesté');
  assert.deepEqual(e.comptesSansCle, []);
  assert.ok(admin.evts.every((x) => typeof x.sig === 'string'), 'toutes les saisies sont signées');
  // Une saisie légitime du cadre est lue par l'IDE
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.enregistrer('CONFIG', { cle: 'groupes', valeur: [] }).catch(() => {});
  const ide = await co(racine, 'ide', 'mot de passe ide');
  assert.equal(ide.saisiesEcartees().length, 0);
  assert.ok(ide.etatSignatures().exigee);
  void id;
});

test('Réglage écrit au nom du cadre par un autre agent : écarté chez tous les autres, signalé', async () => {
  const { racine, id } = await equipe();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await ide.enregistrer('CONFIG', { cle: 'etablissement', valeur: 'Forgé (fictif)' }, undefined, { sansControle: true, by: id('cadre') });
  for (const [login, mdp] of [['admin', 'mot de passe solide'], ['cadre', 'mot de passe cadre']]) {
    const s = await co(racine, login, mdp);
    assert.notEqual(etab(s), 'Forgé (fictif)', login + ' : réglage forgé non appliqué');
    const ec = s.saisiesEcartees();
    assert.equal(ec.length, 1);
    assert.equal(ec[0].raison, 'au-nom-d-un-autre');
    assert.equal(ec[0].by, id('cadre')); assert.equal(ec[0].sg, id('ide'));
  }
});

test('Saisie non signée, altérée, ou signée par une clé glissée dans le coffre : écartée', async () => {
  const { racine, admin, id } = await equipe();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  const d = await ide.dossier.journal('socle', true);
  const at = new Date().toISOString();
  // 1. Non signée
  await d.ecrireEvenement(ide.cle, { v: 1, id: SIC.horodatageCompact(at) + '_' + id('cadre') + '_aaaa0001', at, by: id('cadre'), type: 'CONFIG', data: { cle: 'etablissement', valeur: 'Non signé (fictif)' }, prec: null });
  // 2. Saisie légitime de l'administrateur, valeur changée après signature
  const vraie = admin.evts.find((e) => e.type === 'CONFIG' && e.data.cle === 'services');
  const alteree = JSON.parse(JSON.stringify(vraie)); alteree.id = vraie.id.replace(/_[^_]+$/, '_bbbb0002'); alteree.data.valeur = [{ code: 'X', libelle: 'Altéré (fictif)' }];
  await d.ecrireEvenement(ide.cle, alteree);
  // 3. Clé de l'IDE glissée parmi celles du cadre, saisie « du cadre » signée par l'IDE sans le dire
  await ide.modifierCoffre(async (cf) => { cf.agents[id('cadre')].sig.push({ p: (await SG.paireAgent(ide.privee8)).publique }); });
  const fausse = { v: 1, id: SIC.horodatageCompact(at) + '_' + id('cadre') + '_cccc0003', at, by: id('cadre'), type: 'CONFIG', data: { cle: 'etablissement', valeur: 'Clé glissée (fictif)' }, prec: null };
  await SG.signerSaisie(fausse, await SG.paireAgent(ide.privee8), id('cadre'));
  await d.ecrireEvenement(ide.cle, fausse);
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.ok(!['Non signé (fictif)', 'Clé glissée (fictif)'].includes(etab(cadre)));
  assert.ok(!cadre.etat.config.services.some((x) => x.code === 'X'));
  assert.deepEqual(cadre.saisiesEcartees().map((x) => x.raison).sort(), ['non-signee', 'signature', 'signature']);
  // L'administrateur n'atteste pas la clé glissée (aucune preuve valide) et le signale
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.ok(ad.etatSignatures().nonVerifiees.some((x) => x.id === id('cadre')));
  assert.equal(ad.saisiesEcartees().length, 3);
});

test('Changement de mot de passe (lien signé) et réinitialisation par l’administrateur : saisies toujours vérifiées', async () => {
  const { racine, id } = await equipe();
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.changerMonMotDePasse('nouveau mot de passe cadre');
  const cadre2 = await co(racine, 'cadre', 'nouveau mot de passe cadre');
  await cadre2.enregistrer('CONFIG', { cle: 'groupes', valeur: [] }).catch(() => {});
  await cadre2.tracer('ESSAI', { libelle: 'saisie après changement (fictif)' });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.reinitialiserMotDePasse(id('ide'), 'provisoire ide 2026');
  const ide = await co(racine, 'ide', 'provisoire ide 2026');
  await ide.tracer('ESSAI', { libelle: 'saisie après réinitialisation (fictif)' });
  await ide.changerMonMotDePasse('mot de passe personnel ide');
  const ide2 = await co(racine, 'ide', 'mot de passe personnel ide');
  await ide2.tracer('ESSAI', { libelle: 'saisie après le premier changement (fictif)' });
  for (const s of [await co(racine, 'admin', 'mot de passe solide'), await co(racine, 'cadre', 'nouveau mot de passe cadre')]) {
    assert.deepEqual(s.saisiesEcartees(), []);
    assert.equal(s.evts.filter((e) => e.type === 'COMPTE' && e.data.action === 'ESSAI').length, 3);
  }
});

test('Coffre d’avant 0.72.0 : saisies anciennes acceptées, clés inscrites puis attestées, exigence décidée par l’administrateur', async () => {
  const { racine, admin, id } = await equipe({ ancien: true });
  assert.equal(admin.etatSignatures().exigee, null);
  const ide = await co(racine, 'ide', 'mot de passe ide');
  // Saisie ancienne (non signée) écrite avant l'exigence
  const at = new Date().toISOString();
  await (await ide.dossier.journal('socle', true)).ecrireEvenement(ide.cle, { v: 1, id: SIC.horodatageCompact(at) + '_' + id('ide') + '_dddd0004', at, by: id('ide'), type: 'COMPTE', data: { action: 'ESSAI', libelle: 'ancienne (fictif)' }, prec: null });
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(cadre.saisiesEcartees().length, 0);
  assert.ok(cadre.etatSignatures().anciennes >= 1);
  assert.equal(cadre.etatSignatures().exigee, null);
  // Avant la connexion de l'administrateur, les clés inscrites par preuve ne sont pas attestées : exigence refusée
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.deepEqual(ad.etatSignatures().comptesSansCle, [], 'clés inscrites par preuve, attestées à la connexion de l’administrateur');
  await ad.exigerSignatures();
  assert.ok(ad.etatSignatures().exigee);
  assert.ok(ad.evts.some((e) => e.type === 'COMPTE' && e.data.action === 'SIGNATURES_EXIGEES'));
  // Exigence en vigueur : la saisie non signée est écartée, les autres restent ; l'exigence ne se retire pas
  const cadre2 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.deepEqual(cadre2.saisiesEcartees().map((x) => x.raison), ['non-signee']);
  await cadre2.tracer('ESSAI', { libelle: 'signée (fictif)' });
  const ide2 = await co(racine, 'ide', 'mot de passe ide');
  assert.ok(ide2.evts.some((e) => e.type === 'COMPTE' && e.data.libelle === 'signée (fictif)'));
  assert.ok(ide2.etatSignatures().exigee);
});

test('Exigence refusée tant qu’un compte actif n’a pas de clé attestée', async () => {
  const { racine } = await equipe({ ancien: true });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await assert.rejects(ad.exigerSignatures(), /sans clé de signature attestée/);
});

test('Module de signature : vérification sans exigence (saisie ancienne, clé inconnue) et avec', async () => {
  const k = await SG.paireAgent(new Uint8Array(32).fill(7)), autre = await SG.paireAgent(new Uint8Array(32).fill(9));
  const evt = await SG.signerSaisie({ v: 1, id: 'x', at: '2026-11-15T10:00:00.000Z', by: 'u1', type: 'CONFIG', data: { cle: 'a', valeur: 1 } }, k, 'u1');
  const ctx = (strict, cles, enAttente) => ({ strict, admins: ['adm'], cles: { u1: { cles: cles || [], enAttente: enAttente || [] } } });
  assert.equal(await SG.verifierSaisie(evt, ctx(true, [k.publique])), 'ok');
  assert.equal(await SG.verifierSaisie(evt, ctx(true, [autre.publique])), 'signature');
  assert.equal(await SG.verifierSaisie(evt, ctx(true, [], [k.publique])), 'signature', 'clé en attente : refusée sous exigence');
  assert.equal(await SG.verifierSaisie(evt, ctx(false, [], [k.publique])), 'provisoire');
  assert.equal(await SG.verifierSaisie(evt, ctx(false)), 'provisoire', 'sans exigence, signataire sans clé connue');
  assert.equal(await SG.verifierSaisie(evt, ctx(false, [autre.publique])), 'signature', 'clé connue, signature fausse');
  const sans = Object.assign({}, evt); delete sans.sig;
  assert.equal(await SG.verifierSaisie(sans, ctx(false)), 'ancienne');
  assert.equal(await SG.verifierSaisie(sans, ctx(true)), 'non-signee');
  const parAdmin = await SG.signerSaisie({ v: 1, id: 'y', at: 'z', by: 'u1', type: 'LOT', data: {} }, k, 'adm');
  assert.equal(parAdmin.sg, 'adm');
  assert.equal(await SG.verifierSaisie(parAdmin, Object.assign(ctx(true), { cles: { adm: { cles: [k.publique], enAttente: [] } } })), 'ok', 'administrateur : au nom d’un autre permis');
  const parAgent = await SG.signerSaisie({ v: 1, id: 'z', at: 'z', by: 'u1', type: 'CONFIG', data: {} }, autre, 'u2');
  assert.equal(await SG.verifierSaisie(parAgent, Object.assign(ctx(true), { cles: { u2: { cles: [autre.publique], enAttente: [] } } })), 'au-nom-d-un-autre');
  // Chaîne de liens : clé reliée à une clé attestée
  const l = await SG.lien(k, 'u1', autre.publique);
  const v = await SG.clesValides({ agents: { u1: { sig: [{ p: k.publique }, l] } } }, { signatures: { u1: [k.publique] } });
  assert.deepEqual(v.u1.cles, [k.publique, autre.publique]);
  const faux = Object.assign({}, l, { de: autre.publique });
  const v2 = await SG.clesValides({ agents: { u1: { sig: [faux] } } }, { signatures: { u1: [k.publique] } });
  assert.deepEqual(v2.u1.cles, [k.publique]);
});
