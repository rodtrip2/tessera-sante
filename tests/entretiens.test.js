// SPDX-License-Identifier: EUPL-1.2
// Équipe : entretiens des agents (lot F, 15 novembre 2026). Données fictives : npm test
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
globalThis.SIC.validations = require('../app/js/validations.js');
require('../app/js/module-isocont.js');
globalThis.SIC.agenda = require('../app/js/module-agenda.js');
globalThis.SIC.equipe = require('../app/js/module-equipe.js');
const MS = require('../app/js/module-messagerie.js');
globalThis.SIC.messagerie = MS;
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };



const ACCORD = { validations: { etats: { entretiens: { etat: 'accord', date: '2026-11-15', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-14' } } } };

test('Entretiens : chiffrés pour l’auteur seul, partage avec un supérieur puis avec l’agent, signature, administrateur exclu', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.creerComptes([{ nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U1'] },
    { nom: 'Cadre U1 (fictif)', login: 'cadre1', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1'] },
    { nom: 'Cadre bis U1 (fictif)', login: 'cadre1b', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1'] },
    { nom: 'Cadre supérieur (fictif)', login: 'cs', motDePasse: 'mot de passe cadre sup', roles: ['CADRE', 'CADRE_SUP'], services: ['U1', 'U2'] }]);
  await admin.creerClesManquantes();
  const E = SIC.equipe;
  const c1 = await co(racine, 'cadre1', 'mot de passe cadre'); c1.choisirModule('equipe');
  const ida = c1.comptes.find((c) => c.nom === 'IDE A (fictif)').id, ics = c1.comptes.find((c) => c.nom === 'Cadre supérieur (fictif)').id;
  const contenu = E.contenuEntretien({ agent: ida, nomAgent: 'IDE A (fictif)', date: '2026-11-10', type: 'recadrage', compteRendu: 'Retards répétés (fictif).' });
  const env = await c1.chiffrerEnveloppe('entretien:EN1', E.clesEntretien(c1.utilisateur.id, contenu), contenu);
  assert.ok(!JSON.stringify(env).includes('Retards') && !JSON.stringify(env).includes('recadrage'));
  // Fonction désactivée par défaut : refusée
  await assert.rejects(c1.enregistrer('ENTRETIEN_AGENT', { id: 'EN1', env }), /désactivée/);
  await admin.enregistrer('CONFIG', { cle: 'validations', valeur: ACCORD.validations });
  const c1b = await co(racine, 'cadre1', 'mot de passe cadre'); c1b.choisirModule('equipe');
  await c1b.enregistrer('ENTRETIEN_AGENT', { id: 'EN1', env, signataire: '' });
  const lire = async (login, mdp, opt) => { const x = await co(racine, login, mdp); const en = x.etatModule('equipe').entretiens.EN1; return x.ouvrirEnveloppe('entretien:EN1', en.env, opt); };
  assert.equal((await lire('cadre1', 'mot de passe cadre')).type, 'recadrage');
  assert.equal(await lire('cadre1b', 'mot de passe cadre'), null);           // autre cadre du service
  assert.equal(await lire('cs', 'mot de passe cadre sup'), null);            // supérieur, pas encore partagé
  assert.equal(await lire('ide.a', 'mot de passe ide a'), null);             // l'agent, pas encore partagé
  assert.equal(await lire('admin', 'mot de passe solide'), null);            // l'administrateur n'ouvre pas
  // Partage avec le supérieur et l'agent, signature demandée
  const c2 = E.contenuEntretien(Object.assign({}, contenu, { superieurs: [ics], partageAgent: true, signatureDemandee: true }));
  const env2 = await c1b.chiffrerEnveloppe('entretien:EN1', E.clesEntretien(c1b.utilisateur.id, c2), c2);
  const b = await co(racine, 'ide.b', 'mot de passe ide b'); b.choisirModule('equipe');
  await assert.rejects(b.enregistrer('ENTRETIEN_AGENT_MAJ', { id: 'EN1', env: env2, signataire: ida }), /rôle|auteur/);
  await c1b.enregistrer('ENTRETIEN_AGENT_MAJ', { id: 'EN1', env: env2, signataire: ida });
  assert.equal((await lire('cs', 'mot de passe cadre sup')).compteRendu, 'Retards répétés (fictif).');
  assert.equal((await lire('ide.a', 'mot de passe ide a')).signatureDemandee, true);
  assert.equal(await lire('ide.b', 'mot de passe ide b'), null);
  // Signature : seul l'agent concerné, une fois par version
  const a = await co(racine, 'ide.a', 'mot de passe ide a'); a.choisirModule('equipe');
  assert.equal(E.aSigner(a.etatModule('equipe'), ida).length, 1);
  const obs = await a.chiffrerEnveloppe('entretien-sig:EN1', Object.keys(env2.cles), { observations: 'Je conteste un retard (fictif).' });
  await assert.rejects(b.enregistrer('ENTRETIEN_AGENT_SIGNATURE', { id: 'EN1', env: obs }), /rôle|signature/);
  await a.enregistrer('ENTRETIEN_AGENT_SIGNATURE', { id: 'EN1', env: obs });
  const st = a.etatModule('equipe');
  assert.equal(E.aSigner(st, ida).length, 0);
  assert.equal(E.signature(st.entretiens.EN1).par, ida);
  await assert.rejects(a.enregistrer('ENTRETIEN_AGENT_SIGNATURE', { id: 'EN1', env: obs }), /déjà signé/);
  const cs = await co(racine, 'cs', 'mot de passe cadre sup');
  assert.equal((await cs.ouvrirEnveloppe('entretien-sig:EN1', cs.etatModule('equipe').entretiens.EN1.signatures[0].env)).observations, 'Je conteste un retard (fictif).');
});

test('Entretiens : contenu vérifié, cadre de l’agent (validateurs des Congés), supérieurs proposés, fonction soumise à avis', () => {
  const E = SIC.equipe, V = SIC.validations;
  assert.throws(() => E.contenuEntretien({ agent: 'a', date: '2026-11-10', type: '', compteRendu: 'x' }), /type/);
  assert.throws(() => E.contenuEntretien({ agent: 'a', date: '2026-11-10', type: 'suivi', compteRendu: '' }), /compte rendu/);
  assert.throws(() => E.contenuEntretien({ agent: 'a', date: '2026-11-10', type: 'suivi', compteRendu: 'x', signatureDemandee: true }), /partagez/);
  assert.throws(() => E.contenuEntretien({ agent: 'a', date: '2026-11-10', type: 'suivi', compteRendu: 'x', horsDroitAcces: true }), /droit d’accès/);
  const c = E.contenuEntretien({ agent: 'a', date: '2026-11-10', typeLibre: 'Point sur le projet (fictif)', compteRendu: 'x', horsDroitAcces: true, motifHorsDroitAcces: 'Autre agent cité (fictif)' });
  assert.equal(E.libTypeEntretien(c), 'Point sur le projet (fictif)');
  assert.deepEqual(E.typesEntretien().map((t) => t.code), ['suivi', 'recadrage', 'reprise', 'integration']);
  assert.deepEqual(E.clesEntretien('c1', { agent: 'a', superieurs: ['cs', 'c1'], partageAgent: true }), ['t-a.c1', 't-a.cs', 't-a.a']);
  const cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] }, ide = { id: 'a', roles: ['IDE'], services: ['U1'] }, cadre2 = { id: 'c2', roles: ['CADRE'], services: ['U1'] }, sup = { id: 'cs', roles: ['CADRE_SUP'], services: ['U1'] };
  assert.equal(E.menePour({}, cadre, ide), true);
  assert.equal(E.menePour({}, cadre, cadre2), false);
  assert.equal(E.menePour({}, sup, cadre2), true);
  assert.equal(E.menePour({}, cadre, { id: 'x', roles: ['IDE'], services: ['U2'] }), false);
  assert.deepEqual(E.superieursPossibles([cadre, ide, cadre2, sup, { id: 'd', roles: ['DIRECTEUR_SOINS'], services: [] }], 'c1', 'a').map((x) => x.id), ['c2', 'cs', 'd']);
  assert.equal(V.etat({}, 'entretiens').etat, 'desactive');
  assert.equal(E.fonctionActive({}), false);
  assert.equal(E.fonctionActive(ACCORD), true);
  assert.equal(E.contrat.vues.onglets.find((o) => o.code === 'entretiens').visible({}), false);
});
