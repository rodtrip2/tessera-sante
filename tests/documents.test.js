// SPDX-License-Identifier: EUPL-1.2
// Documents : contenu, partage, circuit de validation, clés par document (0.34.0). Données fictives : npm test
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
globalThis.SIC.noyauJournal = require('../app/js/noyau-journal.js');
const DM = require('../app/js/module-documents.js');
globalThis.SIC.documents = DM;
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };

async function equipe() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.creerComptes([
    { nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'IDE B (fictif)', login: 'ide.b', motDePasse: 'mot de passe ide b', roles: ['IDE'], services: ['U2'] },
    { nom: 'Cadre U1 (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1'] }]);
  const id = (login) => admin.comptes.find((c) => c.login === login).id;
  await admin.creerClesManquantes();
  return { racine, admin, id };
}
const contenu = (t) => DM.contenu({ blocs: [{ t: 'h1', runs: [{ x: 'Titre (fictif)' }] }, { t: 'p', runs: [{ x: t, g: true, p: 'arial', z: 14 }] }] });

test('Contenu : blocs et morceaux validés, rien hors du modèle', () => {
  const c = DM.contenu({ blocs: [{ t: 'script', runs: [{ x: 'x' }] }, { t: 'p', runs: [{ x: 'a', g: true }, { x: 'b', g: true }, { x: 'c', p: 'inconnue', z: 99, c: '#f00' }], al: 'z', r: 12 },
    { t: 'li', liste: 'ol', n: 9, runs: [{ x: 'un' }] }, { t: 'table', lignes: [[{ runs: [{ x: 'A' }] }, { runs: [] }]], entete: true }, { t: 'saut' }], page: { marges: { h: 1 }, police: 'xx', interligne: 7 } });
  assert.equal(c.blocs[0].t, 'p');
  assert.deepEqual(c.blocs[1].runs[0], { x: 'ab', g: true });   // morceaux de même forme fusionnés
  assert.ok(!c.blocs[1].runs[1].p && !c.blocs[1].runs[1].z && !c.blocs[1].runs[1].c);
  assert.equal(c.page.marges.h, 20); assert.equal(c.page.police, 'calibri'); assert.equal(c.page.interligne, 1.15);
  assert.ok(c.blocs.some((b) => b.t === 'table') && c.blocs.some((b) => b.t === 'saut'));
  assert.match(DM.texteContenu(c), /ab/);
});

test('Comparaison de deux versions : paragraphes ajoutés et retirés', () => {
  const a = DM.contenu({ blocs: [{ t: 'p', runs: [{ x: 'un' }] }, { t: 'p', runs: [{ x: 'deux' }] }] });
  const b = DM.contenu({ blocs: [{ t: 'p', runs: [{ x: 'un' }] }, { t: 'p', runs: [{ x: 'trois' }] }] });
  const d = DM.comparer(a, b);
  assert.deepEqual(d.map((x) => x.etat).sort(), ['ajout', 'egal', 'retrait']);
});

test('Partage et droits : auteur gère, partage par service, rôle, agent ; gérer réservé à un agent nommé', () => {
  const doc = { auteur: 'a1', partage: DM.partage([{ genre: 'service', code: 'U1', droit: 'lire' }, { genre: 'role', code: 'IDE', service: 'U1', droit: 'modifier' }, { genre: 'service', code: 'U2', droit: 'gerer' }]) };
  assert.equal(DM.droitDe(doc, { id: 'a1', roles: [], services: [] }), 'gerer');
  assert.equal(DM.droitDe(doc, { id: 'x', roles: ['IDE'], services: ['U1'] }), 'modifier');
  assert.equal(DM.droitDe(doc, { id: 'x', roles: ['AS'], services: ['U1'] }), 'lire');
  assert.ok(DM.droitDe(doc, { id: 'x', roles: ['IDE'], services: ['U2'] }) !== 'gerer');
  assert.deepEqual(DM.clesDocument('a1', doc.partage).slice(0, 3), ['k-a.a1', 'k-s.U1', 'k-r.IDE.U1']);
  assert.equal(DM.retraitDe(doc.partage, doc.partage.slice(1)), true);
  assert.equal(DM.retraitDe(doc.partage.slice(1), doc.partage), false);
});

test('Circuit : version, demande, validation, modifié, à réviser, corbeille puis effacement échu', () => {
  const t0 = Date.parse('2026-01-01T10:00:00Z'), at = (j) => new Date(t0 + j * 864e5).toISOString();
  const ev = [{ id: 'e1', at: at(0), by: 'a1', type: 'DOC', data: { id: 'DC00000001', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }] } },
    { id: 'e2', at: at(0), by: 'a1', type: 'DOC_VERSION', data: { doc: 'DC00000001', g: 1, ct: 'x' } },
    { id: 'e3', at: at(1), by: 'a1', type: 'DOC_STATUT', data: { doc: 'DC00000001', statut: 'a-valider', message: 'svp' } }];
  let st = DM.reduire(ev);
  assert.equal(DM.statut(st.docs.DC00000001, t0).statut, 'a-valider');
  assert.equal(DM.aValider(st, { id: 'c', roles: ['CADRE'], services: ['U1'] }).length, 1);
  ev.push({ id: 'e4', at: at(2), by: 'c', type: 'DOC_VALIDATION', data: { doc: 'DC00000001', version: 'e2', revision: '2026-06-01' } });
  st = DM.reduire(ev);
  assert.equal(DM.statut(st.docs.DC00000001, t0).statut, 'valide');
  assert.equal(DM.statut(st.docs.DC00000001, Date.parse('2026-06-02T10:00:00Z')).statut, 'a-reviser');
  ev.push({ id: 'e5', at: at(3), by: 'a1', type: 'DOC_VERSION', data: { doc: 'DC00000001', g: 1, ct: 'y' } });
  st = DM.reduire(ev);
  assert.equal(st.docs.DC00000001.statut.statut, 'modifie');
  assert.equal(DM.enVigueur(st.docs.DC00000001).id, 'e2');   // la version validée reste en vigueur
  ev.push({ id: 'e6', at: at(4), by: 'a1', type: 'DOC_CORBEILLE', data: { doc: 'DC00000001', corbeille: true } });
  st = DM.reduire(ev);
  assert.equal(DM.visibles(st, { id: 'a1', roles: [], services: [] }, {}, {}).length, 0);
  assert.equal(DM.visibles(st, { id: 'a1', roles: [], services: [] }, {}, { corbeille: true }).length, 1);
  assert.equal(DM.aEffacer(st, t0 + 20 * 864e5).length, 0);
  assert.equal(DM.aEffacer(st, t0 + 35 * 864e5).length, 1);
  assert.equal(DM.joursAvantEffacement(st.docs.DC00000001, t0 + 24 * 864e5), 10);
  ev.push({ id: 'e7', at: at(35), by: 'x', type: 'DOC_EFFACE', data: { doc: 'DC00000001' } });
  st = DM.reduire(ev);
  assert.ok(st.docs.DC00000001.efface && st.docs.DC00000001.versions.every((v) => v.ct === null));
});

test('Contrôles : modèle par le cadre ou l’administrateur, modification selon le droit, effacement avant échéance réservé', () => {
  const st = DM.reduire([{ id: 'e1', at: new Date().toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC00000002', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }] } }]);
  const ide = { id: 'i', roles: ['IDE'], services: ['U1'] }, cadre = { id: 'c', roles: ['CADRE'], services: ['U1'] };
  assert.throws(() => DM.controler('DOC', { id: 'DC00000003', modele: true, services: ['U1'] }, { etat: st, compte: ide, config: {} }), /modèles/);
  DM.controler('DOC', { id: 'DC00000003', modele: true, services: ['U1'] }, { etat: st, compte: cadre, config: {} });
  assert.throws(() => DM.controler('DOC', { id: 'DC00000003', modele: true, services: ['U2'] }, { etat: st, compte: cadre, config: {} }), /vos services/);
  assert.throws(() => DM.controler('DOC_VERSION', { doc: 'DC00000002', ct: 'x' }, { etat: st, compte: ide, config: {} }), /modifier/);
  assert.equal(DM.permisPourSoi('DOC_VERSION', { doc: 'DC00000002' }, { id: 'a1', roles: [], services: [] }, { etat: st, config: {} }), true);
  assert.equal(DM.partage([{ genre: 'service', code: 'U1', droit: 'gerer' }])[0].droit, 'modifier');   // gérer : agent nommé seulement
  assert.throws(() => DM.controler('DOC_PARTAGE', { doc: 'DC00000002', partage: [] }, { etat: st, compte: ide, config: {} }), /gère/);
  assert.throws(() => DM.controler('DOC_EFFACE', { doc: 'DC00000002' }, { etat: st, compte: ide, config: {} }), /corbeille/);
});

test('Clés de document : une clé par document, lue par les seuls destinataires ; retrait = nouvelle génération ; effacement = clé détruite', async () => {
  const { racine, admin, id } = await equipe();
  const cles = Object.keys(admin.coffre.cles).filter((n) => /^k-/.test(n));
  assert.ok(cles.includes('k-a.' + id('ide.a')) && cles.includes('k-s.U1') && cles.includes('k-r.IDE.U2'));
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  // Document privé de l'IDE A
  await a.creerCleDocument('DC0000000a', ['k-a.' + id('ide.a')]);
  const v1 = await a.chiffrerDocument('DC0000000a', { meta: DM.meta({ titre: 'Privé (fictif)' }), contenu: contenu('secret (fictif)') });
  assert.equal(v1.g, 1);
  assert.equal((await a.dechiffrerDocument('DC0000000a', v1.g, v1.ct)).meta.titre, 'Privé (fictif)');
  const fichier = JSON.stringify(await a.dossier.lireClesDocument('DC0000000a'));
  assert.ok(!/secret/.test(fichier));
  const c = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(await c.dechiffrerDocument('DC0000000a', v1.g, v1.ct), null);   // non partagé : illisible, même pour le cadre
  const ad = await co(racine, 'admin', 'mot de passe solide');
  assert.equal(await ad.dechiffrerDocument('DC0000000a', v1.g, v1.ct), null);  // ni pour l'administrateur
  // Partage avec le service U1 : le cadre lit l'historique ; l'IDE B (U2) non
  await a.partagerCleDocument('DC0000000a', ['k-a.' + id('ide.a'), 'k-s.U1'], false);
  const c2 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal((await c2.dechiffrerDocument('DC0000000a', v1.g, v1.ct)).meta.titre, 'Privé (fictif)');
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  assert.equal(await b.dechiffrerDocument('DC0000000a', v1.g, v1.ct), null);
  // Retrait du service : nouvelle génération ; la version suivante est illisible pour le cadre
  const r = await a.partagerCleDocument('DC0000000a', ['k-a.' + id('ide.a')], true);
  assert.equal(r.generation, 2);
  const v2 = await a.chiffrerDocument('DC0000000a', { meta: DM.meta({ titre: 'Suite (fictif)' }), contenu: contenu('suite') });
  assert.equal(v2.g, 2);
  const c3 = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal(await c3.dechiffrerDocument('DC0000000a', v2.g, v2.ct), null);
  assert.equal(await c3.dechiffrerDocument('DC0000000a', v1.g, v1.ct), null);   // emballage retiré pour toutes les générations
  // Effacement : fichier de clés détruit, marque d'effacement qui empêche toute réécriture
  await a.effacerCleDocument('DC0000000a');
  const a2 = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.equal(await a2.dechiffrerDocument('DC0000000a', v2.g, v2.ct), null);
  assert.equal(await a2.dossier.lireClesDocument('DC0000000a'), null);
  await assert.rejects(a2.dossier.ecrireClesDocument('DC0000000a', { id: 'DC0000000a', v: 1, courante: 1, gens: {} }));
});

test('Saisies du module : un document créé, versionné, partagé dans le journal du module', async () => {
  const { racine, id } = await equipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.creerCleDocument('DC0000000b', ['k-a.' + id('ide.a')]);
  await a.enregistrer('DOC', { id: 'DC0000000b', modele: false, partage: [], services: [], depuis: '' });
  const v = await a.chiffrerDocument('DC0000000b', { meta: DM.meta({ titre: 'T (fictif)' }), contenu: contenu('x') });
  await a.enregistrer('DOC_VERSION', { doc: 'DC0000000b', g: v.g, ct: v.ct });
  await a.partagerCleDocument('DC0000000b', ['k-a.' + id('ide.a'), 'k-r.IDE.U1'], false);
  await a.enregistrer('DOC_PARTAGE', { doc: 'DC0000000b', partage: [{ genre: 'role', code: 'IDE', service: 'U1', droit: 'modifier' }] });
  const st = a.etatModule('documents');
  assert.equal(st.docs.DC0000000b.versions.length, 1);
  assert.equal(st.docs.DC0000000b.partage.length, 1);
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  await assert.rejects(b.enregistrer('DOC_VERSION', { doc: 'DC0000000b', g: 1, ct: 'x' }));
});
