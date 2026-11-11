// SPDX-License-Identifier: EUPL-1.2
// Équipe : fiches des agents, coordonnées personnelles chiffrées, numéro personnel des médecins (0.27.0). Données fictives : npm test
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
globalThis.SIC.equipe = require('../app/js/module-equipe.js');
const MS = require('../app/js/module-messagerie.js');
globalThis.SIC.messagerie = MS;
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };



test('Équipe : l’agent chiffre ses coordonnées personnelles pour le cadre de son service ; numéro personnel d’un médecin', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.creerComptes([{ nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U1'] },
    { nom: 'Cadre U1 (fictif)', login: 'cadre1', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1'] },
    { nom: 'Cadre U2 (fictif)', login: 'cadre2', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U2'] }]);
  await admin.creerClesManquantes();
  const E = SIC.equipe;
  const a = await co(racine, 'ide.a', 'mot de passe ide a'); a.choisirModule('equipe');
  const ida = a.utilisateur.id;
  const perso = await a.chiffrerEnveloppe('fiche:' + ida, E.clesAgent(ida, ['U1']), { tel: '06 00 00 00 01 (fictif)' });
  assert.ok(!JSON.stringify(perso).includes('06 00'));
  await a.enregistrer('COORDONNEES', { agent: ida, telPro: '4511', accord: true, perso });
  const lire = async (login, mdp, opt) => { const x = await co(racine, login, mdp); return x.ouvrirEnveloppe('fiche:' + ida, x.etatModule('equipe').agents[ida].perso, opt); };
  assert.equal((await lire('ide.a', 'mot de passe ide a')).tel, '06 00 00 00 01 (fictif)');
  assert.equal((await lire('cadre1', 'mot de passe cadre')).tel, '06 00 00 00 01 (fictif)');
  assert.equal(await lire('cadre2', 'mot de passe cadre'), null);   // cadre d'un autre service
  assert.equal(await lire('ide.b', 'mot de passe ide b'), null);    // collègue du même service
  assert.equal((await lire('admin', 'mot de passe solide', { admin: true })).tel, '06 00 00 00 01 (fictif)');
  // Un collègue ne modifie pas la fiche ; l'accord ne se donne que par l'agent
  const b = await co(racine, 'ide.b', 'mot de passe ide b'); b.choisirModule('equipe');
  await assert.rejects(b.enregistrer('COORDONNEES', { agent: ida, telPro: '9999' }), /rôle|fiche/);
  const c1 = await co(racine, 'cadre1', 'mot de passe cadre'); c1.choisirModule('equipe');
  await assert.rejects(c1.enregistrer('COORDONNEES', { agent: ida, accord: false }), /accord/);
  await c1.enregistrer('COORDONNEES', { agent: ida, telPro: '4512' });
  assert.equal(c1.etatModule('equipe').agents[ida].telPro, '4512');
  // Mot de passe oublié : l'agent relit ses coordonnées (clé de liste du trousseau)
  await admin.reinitialiserMotDePasse(ida, 'provisoire 2026 a');
  assert.equal((await lire('ide.a', 'provisoire 2026 a')).tel, '06 00 00 00 01 (fictif)');
  // Numéro personnel d'un médecin de l'Unité 1 : cadre de l'Unité 1 (ni l'IDE, ni le cadre d'un autre service)
  const mp = await c1.chiffrerEnveloppe('medecin:m1', E.clesMedecin({ services: ['U1'] }), { tel: '06 00 00 00 10' });
  await c1.enregistrer('COORDONNEES_MEDECIN', { medecin: 'm1', perso: mp });
  const lireM = async (login, mdp) => { const x = await co(racine, login, mdp); return x.ouvrirEnveloppe('medecin:m1', x.etatModule('equipe').medecins.m1.perso); };
  assert.equal((await lireM('cadre1', 'mot de passe cadre')).tel, '06 00 00 00 10');
  assert.equal(await lireM('ide.b', 'mot de passe ide b'), null);
  assert.equal(await lireM('cadre2', 'mot de passe cadre'), null);
  await assert.rejects(b.enregistrer('COORDONNEES_MEDECIN', { medecin: 'm1', perso: null }), /rôle/);
});

test('Référents : domaines proposés, ajoutés, masqués ; titulaires et suppléants ; tenus par le cadre du service', () => {
  const E = SIC.equipe;
  let n = 0;
  const ev = (by, type, data) => ({ v: 1, id: 'r' + (++n), at: new Date(Date.UTC(2026, 10, 11, 9, n)).toISOString(), by, type, data });
  const st = E.reduire([
    ev('c', 'REFERENTS', { service: 'U1', domaine: 'plaies', titulaires: [{ id: 'a', nom: 'Agent A (fictif)' }], suppleants: [] }),
    ev('c', 'DOMAINE_REFERENT', { service: 'U1', code: 'p-sport', libelle: 'Activité physique adaptée' }),
    ev('c', 'REFERENTS', { service: 'U1', domaine: 'p-sport', titulaires: [], suppleants: [{ id: 'b', nom: 'Agent B (fictif)' }] }),
    ev('c', 'DOMAINE_REFERENT', { service: 'U1', code: 'douleur', masque: true }),
    ev('c', 'REFERENTS', { service: 'U1', domaine: 'douleur', titulaires: [{ id: 'a', nom: 'Agent A (fictif)' }] })]);
  assert.deepEqual(E.referents(st, 'U1').map((r) => r.domaine), ['plaies', 'p-sport']);   // domaine masqué : non affiché
  assert.ok(E.domaines(st, 'U1', true).some((d) => d.code === 'douleur' && d.masque));
  assert.equal(E.referents(st, 'U2').length, 0);
  assert.deepEqual(E.referentDe(st, 'b'), [{ service: 'U1', libelle: 'Activité physique adaptée', suppleant: true }]);
  const ctl = (compte, d) => E.controler('REFERENTS', d, { etat: st, compte });
  assert.doesNotThrow(() => ctl({ id: 'c', roles: ['CADRE'], services: ['U1'] }, { service: 'U1', domaine: 'hygiene' }));
  assert.throws(() => ctl({ id: 'c', roles: ['CADRE'], services: ['U1'] }, { service: 'U2', domaine: 'hygiene' }), /cadre du service/);
  assert.throws(() => ctl({ id: 'c', roles: ['CADRE'], services: ['U1'] }, { service: '*', domaine: 'identito' }), /administrateur/);
  assert.throws(() => ctl({ id: 'i', roles: ['IDE'], services: ['U1'] }, { service: 'U1', domaine: 'hygiene' }), /cadre/);
});
