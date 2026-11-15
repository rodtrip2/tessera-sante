// SPDX-License-Identifier: EUPL-1.2
// Contrôle des droits de l'auteur à la lecture (0.73.0, constat S1 de l'audit du 15 novembre 2026) : un réglage signé
// par un agent qui n'avait pas le droit de l'écrire n'est pas appliqué. Données fictives, dossier en mémoire.
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
async function co(racine, login, mdp) { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; }
async function equipe() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'A', libelle: 'A (fictif)' }, { code: 'B', libelle: 'B (fictif)' }] });
  await admin.creerComptes([
    { nom: 'Cadre A (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['A'] },
    { nom: 'Cadre B (fictif)', login: 'cadre.b', motDePasse: 'mot de passe cadre b', roles: ['CADRE'], services: ['B'] },
    { nom: 'IDE A (fictif)', login: 'ide', motDePasse: 'mot de passe ide', roles: ['IDE'], services: ['A'] }]);
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  return { racine, admin, id };
}

test('Réglage écrit sous son propre nom par un agent sans ce droit : non appliqué, signalé, même sur son poste', async () => {
  const { racine } = await equipe();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await assert.rejects(ide.enregistrer('CONFIG', { cle: 'etablissement', valeur: 'Hors droit (fictif)' }), /rôle/);
  await ide.enregistrer('CONFIG', { cle: 'etablissement', valeur: 'Hors droit (fictif)' }, undefined, { sansControle: true });
  assert.notEqual(ide.etat.config.etablissement, 'Hors droit (fictif)', 'pas appliqué sur le poste de l’auteur');
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.notEqual(ad.etat.config.etablissement, 'Hors droit (fictif)');
  assert.deepEqual(ad.saisiesEcartees(), [], 'signature valide : pas écartée');
  const h = ad.reglagesHorsDroit();
  assert.equal(h.length, 1); assert.equal(h[0].cle, 'etablissement');
});

test('Cadre : ses réglages permis sont appliqués, ce qui dépasse ses droits ne l’est pas', async () => {
  const { racine, id } = await equipe();
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  // Permis : rôle IDE dans son service pour l'IDE ; prêt de ses propres droits
  await cadre.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [id('ide')]: { A: ['AS'] } } });
  // Hors droit, sans passer par l'écran : rôle de cadre attribué (réservé à l'administrateur) ; prêt des droits du cadre B
  await cadre.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [id('ide')]: { A: ['CADRE'] } } }, undefined, { sansControle: true });
  await cadre.enregistrer('CONFIG', { cle: 'delegations', valeur: { prets: [{ id: 'pret-b', de: id('cadre.b'), a: id('ide'), debut: jour(0), fin: jour(5), roles: ['CADRE'], services: ['B'], par: id('cadre'), le: new Date().toISOString() }] } }, undefined, { sansControle: true });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.deepEqual(ad.etat.config.rolesServices, { [id('ide')]: { A: ['AS'] } }, 'le réglage permis reste en vigueur');
  assert.deepEqual((ad.etat.config.delegations || { prets: [] }).prets, []);
  assert.deepEqual(ad.reglagesHorsDroit().map((x) => x.cle).sort(), ['delegations', 'rolesServices']);
  assert.equal(ad.remisesAConfirmer().filter((r) => r.login === 'ide' && r.motif === 'pret').length, 0, 'aucune remise d’après le prêt hors droit');
});

test('Réglages permis appliqués ; ils le restent après un changement de rôles ou un départ de leur auteur', async () => {
  const { racine, admin, id } = await equipe();
  await admin.enregistrer('CONFIG', { cle: 'etablissement', valeur: 'Par l’administrateur (fictif)' });
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(cadre.etat.config.etablissement, 'Par l’administrateur (fictif)');
  await cadre.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [id('ide')]: { A: ['AS'] } } });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.deepEqual(ad.etat.config.rolesServices, { [id('ide')]: { A: ['AS'] } });
  assert.deepEqual(ad.reglagesHorsDroit(), []);
  // Fin de faisant fonction puis départ : le réglage écrit quand il ou elle était cadre reste en vigueur
  await ad.modifierRoles(id('cadre'), ['IDE'], true, ['A']);
  await ad.modifierRoles(id('cadre'), ['IDE'], false, ['A']);
  const ide = await co(racine, 'ide', 'mot de passe ide');
  assert.deepEqual(ide.etat.config.rolesServices, { [id('ide')]: { A: ['AS'] } });
  assert.deepEqual(ide.reglagesHorsDroit(), []);
});

test('Agent devenu cadre : ce qu’il a écrit avant ne devient pas permis après coup', async () => {
  const { racine, id } = await equipe();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await ide.enregistrer('CONFIG', { cle: 'groupes', valeur: [{ id: 'g1', nom: 'Groupe (fictif)', service: 'A', agents: [] }] }, undefined, { sansControle: true });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.modifierRoles(id('ide'), ['CADRE'], true, ['A']);
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(cadre.reglagesHorsDroit().length, 1);
});

test('Contrôle avec les comptes et la date du réglage : compte d’intervenant créé depuis, agent changé de service', async () => {
  const { racine, id } = await equipe();
  const cadre = await co(racine, 'cadre', 'mot de passe cadre');
  await cadre.demanderCompteIntervenant({ nom: 'Bénévole (fictif)', login: 'benevole', type: 'benevole', services: ['A'], finValidite: jour(30), motDePasse: 'mot de passe provisoire' });
  await cadre.enregistrer('CONFIG', { cle: 'rolesServices', valeur: { [id('ide')]: { A: ['AS'] } } });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.confirmerDemandesComptes();
  assert.ok(ad.comptes.some((c) => c.login === 'benevole'));
  await ad.modifierRoles(id('ide'), ['IDE'], true, ['A', 'B']);
  await ad.modifierRoles(id('ide'), ['IDE'], true, ['B']);   // l'IDE quitte le service A
  const ad2 = await co(racine, 'admin', 'mot de passe solide');
  assert.deepEqual(ad2.reglagesHorsDroit(), [], 'demande et rôle par service restent permis');
  assert.deepEqual(ad2.etat.config.rolesServices, { [id('ide')]: { A: ['AS'] } });
});

// ---------------------------------------------------------------- Autres saisies (0.74.0)
require('../app/js/module-agenda.js');
const mesure = (id, service) => ({ mesureId: id, patientId: 'P1', service, typeMesure: 'isolement', debut: Date.now() - 36e5, lieu: 'CSI (fictif)', csi: true });
async function equipe2() {
  const e = await equipe();
  await e.admin.creerComptes([{ nom: 'Secrétaire A (fictif)', login: 'sec', motDePasse: 'mot de passe sec', roles: ['SECRETAIRE'], services: ['A'] },
    { nom: 'AS A (fictif)', login: 'as', motDePasse: 'mot de passe as', roles: ['AS'], services: ['A'] }]);
  await e.admin.enregistrer('PATIENT', { patientId: 'P1', nom: 'DUPONT (fictif)', prenom: 'Jean', naissance: '1980-01-01', service: 'A' });
  await e.admin.confirmerRemises();
  return e;
}

test('Saisie d’un module écrite sans le rôle qui la permet : non appliquée, signalée ; les saisies permises restent', async () => {
  const { racine } = await equipe2();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await ide.enregistrer('MESURE_DEBUT', mesure('M1', 'A'));
  const as = await co(racine, 'as', 'mot de passe as');
  await assert.rejects(as.enregistrer('PATIENT', { patientId: 'P2', nom: 'FORGÉ (fictif)', prenom: 'X', service: 'A' }), /rôle/);
  await as.enregistrer('PATIENT', { patientId: 'P2', nom: 'FORGÉ (fictif)', prenom: 'X', service: 'A' }, undefined, { sansControle: true });
  assert.ok(!as.etat.patients.P2, 'pas appliquée sur le poste de l’auteur');
  // La fiche suit le patient transféré : écrite par l'écran du transfert sans le droit de corriger les fiches
  await as.enregistrer('PATIENT', { patientId: 'P1', service: 'B' }, undefined, { sansControle: true });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.ok(ad.etat.mesures.M1, 'mesure de l’IDE appliquée');
  assert.ok(!ad.etat.patients.P2);
  assert.equal(ad.etat.patients.P1.service, 'B');
  assert.deepEqual(ad.saisiesHorsDroit().map((x) => x.type), ['PATIENT']);
  assert.deepEqual(ad.saisiesEcartees(), []);
});

test('Annulation écrite sans en avoir le droit : n’annule rien ; annulation immédiate de sa propre saisie : permise', async () => {
  const { racine, admin } = await equipe2();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  const m1 = await ide.enregistrer('MESURE_DEBUT', mesure('M1', 'A'));
  const m2 = await ide.enregistrer('MESURE_DEBUT', mesure('M2', 'A'));
  await ide.enregistrer('ANNULATION', { cible: m2.id, immediate: true });   // la sienne, dans les deux minutes
  const reglage = admin.evts.find((e) => e.type === 'CONFIG' && e.data.cle === 'services');
  const as = await co(racine, 'as', 'mot de passe as');
  await as.enregistrer('ANNULATION', { cible: m1.id, motif: 'forgée (fictif)' }, undefined, { sansControle: true });
  await as.enregistrer('ANNULATION', { cible: reglage.id, motif: 'forgée (fictif)' }, undefined, { sansControle: true });
  await as.enregistrer('ANNULATION', { cible: m1.id, immediate: true }, undefined, { sansControle: true });   // pas la sienne
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.ok(ad.etat.mesures.M1, 'la mesure n’est pas annulée');
  assert.ok(!ad.etat.mesures.M2, 'annulation immédiate par l’auteur appliquée');
  assert.equal(ad.etat.config.services.length, 2, 'le réglage n’est pas annulé');
  assert.equal(ad.saisiesHorsDroit().filter((x) => x.type === 'ANNULATION').length, 3);
});

test('Droits à la date de la saisie : rôle retiré ensuite, rôle reçu ensuite', async () => {
  const { racine, id } = await equipe2();
  const ide = await co(racine, 'ide', 'mot de passe ide');
  await ide.enregistrer('MESURE_DEBUT', mesure('M1', 'A'));
  const sec = await co(racine, 'sec', 'mot de passe sec');
  await sec.enregistrer('MESURE_DEBUT', mesure('M9', 'A'), undefined, { sansControle: true, at: new Date(Date.now() - 36e5).toISOString() });   // une heure avant le changement de rôle
  const ad = await co(racine, 'admin', 'mot de passe solide');
  await ad.modifierRoles(id('ide'), ['SECRETAIRE'], true, ['A']);          // l'IDE change de fonction
  await ad.modifierRoles(id('sec'), ['IDE'], true, ['A']);                 // la secrétaire devient IDE après coup
  const ad2 = await co(racine, 'admin', 'mot de passe solide');
  assert.ok(ad2.etat.mesures.M1, 'saisie permise à l’époque : gardée');
  assert.ok(!ad2.etat.mesures.M9, 'saisie hors droit à l’époque : toujours refusée');
  assert.deepEqual(ad2.saisiesHorsDroit().map((x) => x.type), ['MESURE_DEBUT']);
});

test('Agenda : sa propre absence permise, celle d’un autre non ; lot écrit par un agent qui n’importe pas', async () => {
  const { racine, id } = await equipe2();
  const sans = await co(racine, 'sec', 'mot de passe sec');
  const jourISO = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const abs = (agent, i) => ({ id: 'AB' + i, agent, du: jourISO(1), au: jourISO(2), categorie: 'conge' });
  await sans.enregistrer('ABSENCE', abs(id('sec'), 1), undefined, { sansControle: true });
  await sans.enregistrer('ABSENCE', abs(id('ide'), 2), undefined, { sansControle: true });
  await sans.enregistrer('LOT', { evenements: [{ type: 'PATIENT', data: { patientId: 'P7', nom: 'LOT (fictif)', prenom: 'X', service: 'A' } }], libelle: 'forgé (fictif)' }, undefined, { sansControle: true });
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.deepEqual(ad.saisiesHorsDroit().map((x) => x.type).sort(), ['ABSENCE', 'LOT']);
  assert.ok(!ad.etat.patients.P7);
});

test('Contrat des modules : tout module qui permet des saisies « pour soi » déclare celles qui dépendent de l’état', () => {
  ['agenda', 'conges', 'equipe', 'heures', 'documents', 'formations', 'salles', 'travaux', 'suivi', 'vue', 'vehicules', 'patients'].forEach((n) => {
    try { require('../app/js/module-' + n + '.js'); } catch (e) { /* dépendances de l'interface absentes sous Node */ }
  });
  SIC.modules.liste().forEach((m) => {
    if (m.saisies && m.saisies.permisPourSoi) assert.ok(Array.isArray(m.saisies.pourSoiSelonEtat), m.id + ' : `pourSoiSelonEtat` à déclarer');
  });
});
