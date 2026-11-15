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
const DLm = require('../app/js/delegations.js');

const jour = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const detient = (s, login, cle) => { const c = s.comptes.find((x) => x.login === login); return (s.coffre.enveloppes || []).some((e) => e.pour === c.id && e.cle === cle); };
async function co(racine, login, mdp) { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; }

/** Isocont activé dans le service A seulement ; un cadre en A, deux IDE en B, un compte sans rôle en A. */
async function equipe() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'A', libelle: 'A (fictif)' }, { code: 'B', libelle: 'B (fictif)' }] });
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: { isocont: { tous: false, services: ['A'] } } });
  await admin.creerComptes([
    { nom: 'Cadre A (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['A'] },
    { nom: 'IDE B1 (fictif)', login: 'ide.b1', motDePasse: 'mot de passe ide b1', roles: ['IDE'], services: ['B'] },
    { nom: 'IDE B2 (fictif)', login: 'ide.b2', motDePasse: 'mot de passe ide b2', roles: ['IDE'], services: ['B'] },
    { nom: 'Sans rôle A (fictif)', login: 'sans', motDePasse: 'mot de passe sans', roles: [], services: ['A'] }]);
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  return { racine, admin, id };
}
/**
 * Prêt des droits du cadre à l'IDE, écrit par le cadre lui-même (réglage permis, signé) : depuis 0.72.0 une saisie
 * forgée au nom du cadre est écartée à la lecture (voir signatures-saisies.test.js) ; la remise des clés attend quand
 * même la confirmation de l'administrateur (défense en profondeur, 0.71.0).
 */
async function forgerPret(racine, id) {
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  const pret = { id: 'pret-forge', de: id('cadre'), a: id('ide.b1'), debut: jour(-1), fin: jour(30), roles: ['CADRE'], services: ['A'], motif: 'prêt (fictif)', par: id('cadre'), le: new Date().toISOString() };
  await cadre.enregistrer('CONFIG', { cle: 'delegations', valeur: { prets: [pret] } });
  return cadre;
}
/** Rôle IDE dans le service A pour le compte sans rôle, réglé par le cadre (permis, signé). */
async function roleParCadre(racine, id) {
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [id('sans')]: { A: ['IDE'] } } });
  return cadre;
}

test('Prêt de droits du cadre : aucune clé remise à la connexion de l’administrateur ; remise listée, puis confirmée et tracée', async () => {
  const { racine, admin, id } = await equipe();
  assert.equal(detient(admin, 'ide.b1', 'isocont'), false);
  await forgerPret(racine, id);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(detient(ad, 'ide.b1', 'isocont'), false, 'aucune remise d’office');
  assert.equal(ad.etatAttestation().anomalies.length, 0);
  const att = ad.remisesAConfirmer();
  assert.ok(att.length && att.every((r) => r.login === 'ide.b1' && r.motif === 'pret'), 'seul le compte du faux prêt attend');
  const iso = att.find((r) => r.cle === 'isocont');
  assert.equal(iso.libelle, SIC.modules.obtenir('isocont').libelle);
  assert.match(iso.detail, /prêt de Cadre A \(fictif\)/);
  // L'agent reconnecté n'a toujours pas la clé
  const ide2 = await co(racine, 'ide.b1', 'mot de passe ide b1');
  assert.equal(ide2.detientCle('isocont'), false);
  // Confirmation par l'administrateur (cas d'un prêt réel) : clé remise, inscrite au journal
  const r = await ad.confirmerRemises([{ id: id('ide.b1'), cle: 'isocont' }]);
  assert.equal(r.change, true);
  assert.equal(detient(ad, 'ide.b1', 'isocont'), true);
  assert.ok(ad.evts.some((e) => e.type === 'COMPTE' && e.data.action === 'REMISES_CLES' && e.data.remises.some((x) => x.login === 'ide.b1' && x.cle === 'isocont' && x.motif === 'pret')));
  assert.ok(!ad.remisesAConfirmer().some((x) => x.cle === 'isocont'));
});

test('Acte de l’administrateur : ses propres changements remettent les clés ; ce qui attendait déjà attend encore', async () => {
  const { racine, id } = await equipe();
  await forgerPret(racine, id);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  // Réglage enregistré par l'administrateur : Isocont activé aussi dans le service B
  await ad.enregistrer('CONFIG', { cle: 'modulesServices', valeur: { isocont: { tous: false, services: ['A', 'B'] } } });
  assert.equal(detient(ad, 'ide.b2', 'isocont'), true, 'remise née de l’acte');
  assert.equal(detient(ad, 'ide.b1', 'isocont'), false, 'remise qui attendait avant l’acte');
  assert.deepEqual([...new Set(ad.remisesAConfirmer().map((r) => r.login))], ['ide.b1']);
  // Compte modifié par l'administrateur : nouveau rôle, nouvelles clés
  await ad.modifierRoles(id('sans'), ['IDE'], true, ['A']);
  assert.equal(detient(ad, 'sans', 'isocont'), true);
  // Compte désactivé, réactivé puis mot de passe réinitialisé dans la même session : ses clés reviennent
  await ad.modifierRoles(id('cadre'), ['CADRE'], false, ['A']);
  await ad.modifierRoles(id('cadre'), ['CADRE'], true, ['A']);
  await ad.reinitialiserMotDePasse(id('cadre'), 'provisoire cadre 2026');
  const cadre = await co(racine, 'cadre', 'provisoire cadre 2026');
  assert.equal(cadre.detientCle('isocont'), true);
});

test('Rôle selon le service réglé par le cadre : la remise attend, avec son motif', async () => {
  const { racine, id } = await equipe();
  await roleParCadre(racine, id);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(detient(ad, 'sans', 'isocont'), false);
  assert.ok(ad.remisesAConfirmer().some((r) => r.login === 'sans' && r.cle === 'isocont' && r.motif === 'roleService'));
});

test('Compte d’intervenant demandé : créé seulement après la confirmation de l’administrateur', async () => {
  const { racine } = await equipe();
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.demanderCompteIntervenant({ nom: 'Intervenant (fictif)', login: 'interv', type: 'autre', services: ['A'], finValidite: jour(20), motDePasse: 'provisoire interv 2026' });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.ok(!ad.comptes.some((c) => c.login === 'interv'), 'aucun compte créé d’office');
  const dem = ad.demandesComptesAConfirmer();
  assert.deepEqual(dem.map((d) => [d.login, d.auteur]), [['interv', 'Cadre A (fictif)']]);
  await ad.confirmerDemandesComptes([dem[0].id]);
  assert.ok(ad.comptes.some((c) => c.login === 'interv' && c.actif));
  assert.deepEqual(ad.demandesComptesAConfirmer(), []);
  // Un autre agent ne voit ni les remises ni les demandes à confirmer
  assert.deepEqual([cadre.remisesAConfirmer(), cadre.demandesComptesAConfirmer()], [[], []]);
  await assert.rejects(cadre.confirmerRemises(), /administrateur/);
});

test('Agent dont une clé attend : il change son mot de passe sans erreur, et ne gagne pas la clé', async () => {
  const { racine, id } = await equipe();
  await forgerPret(racine, id);
  const ide = await co(racine, 'ide.b1', 'mot de passe ide b1');
  await co(racine, 'admin', 'mot de passe solide');
  await ide.changerMonMotDePasse('mot de passe personnel b1');
  const ide2 = await co(racine, 'ide.b1', 'mot de passe personnel b1');
  assert.equal(ide2.detientCle('isocont'), false);
});

test('Refus de l’administrateur : le prêt est annulé et marqué refusé, visible du cadre ; aucune clé', async () => {
  const { racine, id } = await equipe();
  await forgerPret(racine, id);
  const ad = await co(racine, 'admin', 'mot de passe solide');
  const att = ad.remisesAConfirmer();
  assert.ok(att.length);
  assert.equal(await ad.refuserRemises(att, 'prêt inconnu du cadre (fictif)'), true);
  assert.equal(ad.remisesAConfirmer().length, 0, 'plus rien n’attend');
  assert.equal(detient(ad, 'ide.b1', 'isocont'), false);
  const p = DLm.prets(ad.etat.config).find((d) => d.id === 'pret-forge');
  assert.ok(p.annule && p.refuse && p.refuseLe, 'prêt annulé et marqué refusé');
  assert.equal(p.refusMotif, 'prêt inconnu du cadre (fictif)');
  assert.ok(ad.evts.some((e) => e.type === 'COMPTE' && e.data.action === 'REMISES_REFUSEES'), 'refus inscrit au journal');
  // Le cadre voit le refus ; plus aucune clé en attente pour l'IDE
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.ok(DLm.prets(cadre.etat.config).find((d) => d.id === 'pret-forge').refuse);
  assert.equal(cadre.remisesEnAttenteDe(id('ide.b1')).length, 0);
});

test('Refus d’un rôle selon le service : plus proposé, visible du cadre, puis levée du refus', async () => {
  const { racine, admin, id } = await equipe();
  await roleParCadre(racine, id);
  const ide = await co(racine, 'ide.b1', 'mot de passe ide b1');
  const ad = await co(racine, 'admin', 'mot de passe solide');
  const att = ad.remisesAConfirmer().filter((r) => r.login === 'sans');
  assert.ok(att.length && att.every((r) => r.motif === 'roleService'));
  await ad.refuserRemises(att, '');
  assert.equal(ad.remisesAConfirmer().filter((r) => r.login === 'sans').length, 0);
  assert.equal(ad.remisesRefusees().length, att.length);
  // « Tout remettre » ne remet pas une clé refusée
  await ad.confirmerRemises();
  assert.equal(detient(ad, 'sans', 'isocont'), false);
  // Le cadre voit le refus pour ce compte
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  const vu = cadre.remisesEnAttenteDe(id('sans'));
  assert.ok(vu.length && vu.every((r) => r.refus && r.motif === 'roleService'));
  // Un agent ne peut pas écrire le réglage des refus par l'écran
  await assert.rejects(ide.enregistrer('CONFIG', { cle: 'remisesRefusees', valeur: { liste: [] } }));
  // Levée du refus : la remise attend de nouveau, puis est confirmée
  await ad.leverRefusRemises(att);
  assert.equal(ad.remisesAConfirmer().filter((r) => r.login === 'sans').length, att.length);
  await ad.confirmerRemises();
  assert.equal(detient(ad, 'sans', 'isocont'), true);
  void admin;
});

test('Cadre informé : la clé du remplaçant attend la confirmation ; demande d’intervenant refusée avec son motif', async () => {
  const { racine, id } = await equipe();
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  // Prêt légitime du cadre à l'IDE B2 (ses propres droits)
  await cadre.enregistrer('CONFIG', { cle: 'delegations', valeur: { prets: [{ id: 'pret-ok', de: id('cadre'), a: id('ide.b2'), debut: jour(0), fin: jour(10), roles: ['CADRE'], services: ['A'], par: id('cadre'), le: new Date().toISOString() }] } });
  const vu = cadre.remisesEnAttenteDe(id('ide.b2'));
  assert.ok(vu.some((r) => r.motif === 'pret' && r.prets.includes('pret-ok') && !r.refus), 'le cadre voit la clé en attente');
  await cadre.demanderCompteIntervenant({ nom: 'Bénévole (fictif)', login: 'benevole', type: 'benevole', services: ['A'], finValidite: jour(30), motDePasse: 'mot de passe provisoire' });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  const d = ad.demandesComptesAConfirmer();
  assert.equal(d.length, 1);
  await ad.refuserDemandesComptes([d[0].id], 'compte non prévu (fictif)');
  assert.equal(ad.demandesComptesAConfirmer().length, 0);
  assert.ok(!ad.comptes.some((c) => c.login === 'benevole'));
  const x = DLm.demandes(ad.etat.config)[0];
  assert.equal(x.etat, 'refusee'); assert.equal(x.message, 'compte non prévu (fictif)'); assert.equal(x.emb, null);
});
