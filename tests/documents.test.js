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

test('Validation supplémentaire : le cadre valide et la demande à un agent nommé, qui reçoit le document en lecture', () => {
  const t0 = Date.now(), at = (h) => new Date(t0 + h * 36e5).toISOString();
  const cadre = { id: 'c', roles: ['CADRE'], services: ['U1'] }, ds = { id: 'ds', roles: ['DIRECTEUR_SOINS'], services: [] }, autre = { id: 'x', roles: ['CADRE'], services: ['U1'] };
  const ev = [{ id: 'e1', at: at(-5), by: 'a1', type: 'DOC', data: { id: 'DC00000009', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }] } },
    { id: 'e2', at: at(-5), by: 'a1', type: 'DOC_VERSION', data: { doc: 'DC00000009', g: 1, ct: 'x' } },
    { id: 'e3', at: at(-4), by: 'a1', type: 'DOC_STATUT', data: { doc: 'DC00000009', statut: 'a-valider' } }];
  let st = DM.reduire(ev);
  assert.throws(() => DM.controler('DOC_VALIDATION', { doc: 'DC00000009', version: 'e2', supplementaire: 'c' }, { etat: st, compte: cadre, config: {} }), /autre agent/);
  DM.controler('DOC_VALIDATION', { doc: 'DC00000009', version: 'e2', supplementaire: 'ds' }, { etat: st, compte: cadre, config: {} });
  ev.push({ id: 'e4', at: at(-3), by: 'c', type: 'DOC_VALIDATION', data: { doc: 'DC00000009', version: 'e2', revision: DM.jourISO(t0 + 200 * 864e5), supplementaire: 'ds' } });
  st = DM.reduire(ev);
  const d = st.docs.DC00000009;
  assert.equal(DM.statut(d).statut, 'a-valider'); assert.equal(DM.statut(d).attendu, 'ds');
  assert.equal(DM.droitDe(d, ds, {}), 'lire');                                    // document partagé en lecture
  assert.deepEqual(DM.aValider(st, ds, {}).map((x) => x.id), ['DC00000009']);
  assert.deepEqual(DM.aValider(st, autre, {}), []);                                // les autres valideurs ne le voient plus
  assert.equal(DM.peutValider(d, ds, {}), true); assert.equal(DM.peutValider(d, autre, {}), false);
  assert.equal(DM.permisPourSoi('DOC_VALIDATION', { doc: 'DC00000009' }, ds, { etat: st, config: {} }), true);
  assert.throws(() => DM.controler('DOC_VALIDATION', { doc: 'DC00000009', version: 'e2' }, { etat: st, compte: autre, config: {} }), /autre agent/);
  ev.push({ id: 'e5', at: at(-2), by: 'ds', type: 'DOC_VALIDATION', data: { doc: 'DC00000009', version: 'e2' } });
  st = DM.reduire(ev);
  const f = DM.statut(st.docs.DC00000009);
  assert.equal(f.statut, 'valide'); assert.deepEqual(f.etapes.map((x) => x.par), ['c', 'ds']);
  assert.equal(f.revision, DM.jourISO(t0 + 200 * 864e5));                         // date de révision de la 1re étape
});

test('Corbeille : durée réglée par l’administrateur (7 à 365 jours, 30 par défaut)', () => {
  assert.equal(DM.joursCorbeille({}), 30);
  assert.equal(DM.joursCorbeille({ documents: { corbeilleJours: 90 } }), 90);
  assert.equal(DM.joursCorbeille({ documents: { corbeilleJours: 2 } }), 30);
  const t0 = Date.parse('2026-01-01T10:00:00Z');
  const st = DM.reduire([{ id: 'e1', at: new Date(t0).toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC0000000c' } },
    { id: 'e2', at: new Date(t0).toISOString(), by: 'a1', type: 'DOC_CORBEILLE', data: { doc: 'DC0000000c', corbeille: true } }]);
  assert.equal(DM.aEffacer(st, t0 + 40 * 864e5, 90).length, 0);
  assert.equal(DM.aEffacer(st, t0 + 91 * 864e5, 90).length, 1);
  assert.equal(DM.joursAvantEffacement(st.docs.DC0000000c, t0 + 10 * 864e5, 90), 80);
});

test('Compte de l’auteur retiré : gestion transférée au cadre de ses services', () => {
  const comptes = [{ id: 'a1', actif: false, roles: ['IDE'], services: ['U1'] }, { id: 'c1', roles: ['CADRE'], services: ['U1'] }, { id: 'c2', roles: ['CADRE'], services: ['U2'] }, { id: 'i2', roles: ['IDE'], services: ['U1'] }];
  let st = DM.reduire([{ id: 'e1', at: new Date().toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC0000000d' } }]);
  assert.deepEqual(DM.aTransferer(st, comptes, {}), []);                         // privé : transfert désactivé par défaut
  assert.deepEqual(DM.aTransferer(st, comptes, { documents: { transfertPrives: true } }), [{ doc: 'DC0000000d', vers: ['c1'] }]);
  const stP = DM.reduire([{ id: 'e1', at: new Date().toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC0000000d', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }] } }]);
  assert.deepEqual(DM.aTransferer(stP, comptes, {}), [{ doc: 'DC0000000d', vers: ['c1'] }]);   // partagé : transféré
  assert.throws(() => DM.controler('DOC_TRANSFERT', { doc: 'DC0000000d', vers: ['c1'] }, { etat: st, compte: comptes[1], config: {} }), /administrateur/);
  st = DM.reduire([{ id: 'e1', at: new Date().toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC0000000d' } }, { id: 'e2', at: new Date().toISOString(), by: 'adm', type: 'DOC_TRANSFERT', data: { doc: 'DC0000000d', vers: ['c1'] } }]);
  assert.equal(DM.droitDe(st.docs.DC0000000d, comptes[1], {}), 'gerer');
  assert.deepEqual(DM.aTransferer(st, comptes, {}), []);
});

test('Transfert par la session de l’administrateur : le cadre lit le document privé de l’agent parti', async () => {
  const { racine, admin, id } = await equipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.creerCleDocument('DC0000000e', ['k-a.' + id('ide.a')]);
  await a.enregistrer('DOC', { id: 'DC0000000e', modele: false, partage: [], services: [], depuis: '' });
  const v = await a.chiffrerDocument('DC0000000e', { meta: DM.meta({ titre: 'Notes de l’agent parti (fictif)' }), contenu: contenu('x') });
  await a.enregistrer('DOC_VERSION', { doc: 'DC0000000e', g: v.g, ct: v.ct });
  const c = admin.comptes.find((x) => x.login === 'ide.a');
  await admin.modifierRoles(c.id, c.roles, false, c.services);
  await admin.enregistrer('CONFIG', { cle: 'documents', valeur: { transfertPrives: true } });   // option de l'administrateur
  const ad = await co(racine, 'admin', 'mot de passe solide');
  const l = DM.aTransferer(ad.etatModule('documents'), ad.comptes, ad.etat.config);
  assert.deepEqual(l, [{ doc: 'DC0000000e', vers: [id('cadre')] }]);
  await ad.transfererCleDocument('DC0000000e', ['k-a.' + id('cadre')]);
  await ad.enregistrer('DOC_TRANSFERT', { doc: 'DC0000000e', vers: [id('cadre')] });
  assert.equal(await ad.dechiffrerDocument('DC0000000e', v.g, v.ct), null);   // l'administrateur ne garde pas la clé
  const cd = await co(racine, 'cadre', 'mot de passe cadre');
  assert.equal((await cd.dechiffrerDocument('DC0000000e', v.g, v.ct)).meta.titre, 'Notes de l’agent parti (fictif)');
  assert.equal(DM.droitDe(cd.etatModule('documents').docs.DC0000000e, cd.compteEffectif(), cd.etat.config), 'gerer');
});

test('Fusion à trois d’un document texte : changements de chacun gardés, conflit compté', () => {
  const p = (x) => ({ t: 'p', runs: [{ x }] });
  const base = { meta: { titre: 'Procédure (fictif)' }, contenu: { blocs: [p('un'), p('deux'), p('trois'), p('quatre')] } };
  const mien = { meta: { titre: 'Procédure (fictif)' }, contenu: { blocs: [p('un modifié'), p('deux'), p('trois'), p('quatre')] } };
  const autre = { meta: { titre: 'Procédure révisée (fictif)' }, contenu: { blocs: [p('un'), p('deux'), p('trois'), p('quatre'), p('cinq')] } };
  let f = DM.fusionnerVersions(base, mien, autre);
  assert.deepEqual(f.contenu.blocs.map(DM.texteBloc), ['un modifié', 'deux', 'trois', 'quatre', 'cinq']);
  assert.equal(f.meta.titre, 'Procédure révisée (fictif)'); assert.equal(f.conflits, 0);
  const autre2 = { meta: base.meta, contenu: { blocs: [p('un autre'), p('deux'), p('trois')] } };
  f = DM.fusionnerVersions(base, mien, autre2);
  assert.deepEqual(f.contenu.blocs.map(DM.texteBloc), ['un modifié', 'un autre', 'deux', 'trois']);   // conflit : les deux gardés ; « quatre » supprimé par l'autre
  assert.equal(f.conflits, 1);
});

test('Fusion à trois d’un tableur : case par case, feuilles ajoutées', () => {
  const c = (cells, plus) => ({ contenu: { genre: 'tableur', feuilles: [{ nom: 'A', cellules: cells }].concat(plus || []) }, meta: { titre: 'T (fictif)' } });
  const f = DM.fusionnerVersions(c({ A1: { v: 1 }, B1: { v: 2 } }), c({ A1: { v: 10 }, B1: { v: 2 }, C1: { v: 3 } }), c({ A1: { v: 1 }, B1: { v: 20 } }, [{ nom: 'Nouvelle', cellules: { A1: { v: 'x' } } }]));
  assert.deepEqual(f.contenu.feuilles[0].cellules, { A1: { v: 10 }, B1: { v: 20 }, C1: { v: 3 } });
  assert.equal(f.contenu.feuilles[1].nom, 'Nouvelle'); assert.equal(f.conflits, 0);
  const g = DM.fusionnerVersions(c({ A1: { v: 1 } }), c({ A1: { v: 10 } }), c({ A1: { v: 11 } }));
  assert.equal(g.contenu.feuilles[0].cellules.A1.v, 10); assert.equal(g.conflits, 1);
});

test('Suivi des modifications : marques gardées, liste, tout accepter ou refuser ; options du document', () => {
  const m = { p: 'a1', n: 'Agent A (fictif)', le: '2026-11-12T10:00:00.000Z' };
  const c = DM.contenu({ blocs: [{ t: 'p', runs: [{ x: 'Le ' }, { x: 'vieux ', del: m }, { x: 'nouveau ', ins: m }, { x: 'texte' }] }] });
  assert.equal(c.blocs[0].runs.length, 4);
  assert.deepEqual(DM.modificationsSuivies(c).map((x) => x.genre + ':' + x.texte), ['del:vieux ', 'ins:nouveau ']);
  assert.equal(DM.texteBloc(DM.resoudreSuivi(c, true).blocs[0]), 'Le nouveau texte');
  assert.equal(DM.texteBloc(DM.resoudreSuivi(c, false).blocs[0]), 'Le vieux texte');
  assert.equal(DM.modificationsSuivies(DM.resoudreSuivi(c, true)).length, 0);
  const st = DM.reduire([{ id: 'e1', at: new Date().toISOString(), by: 'a1', type: 'DOC', data: { id: 'DC00000011' } }, { id: 'e2', at: new Date().toISOString(), by: 'a1', type: 'DOC_OPTIONS', data: { doc: 'DC00000011', simultane: true, suivi: true } }]);
  assert.equal(st.docs.DC00000011.options.simultane, true); assert.equal(st.docs.DC00000011.options.suivi, true);
  assert.throws(() => DM.controler('DOC_OPTIONS', { doc: 'DC00000011', suivi: false }, { etat: st, compte: { id: 'x', roles: ['IDE'], services: [] }, config: {} }), /modifier/);
});

test('Présence sur un document : vue des seuls agents qui ont la clé, retirée à la fermeture', async () => {
  const { racine, id } = await equipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await a.creerCleDocument('DC00000012', ['k-a.' + id('ide.a'), 'k-s.U1']);
  await a.signalerPresence('DC00000012', { modifie: true });
  const c = await co(racine, 'cadre', 'mot de passe cadre');
  const p = await c.presencesDocument('DC00000012');
  assert.equal(p.length, 1); assert.equal(p[0].nom, 'IDE A (fictif)'); assert.equal(p[0].modifie, true);
  const b = await co(racine, 'ide.b', 'mot de passe ide b');
  assert.deepEqual(await b.presencesDocument('DC00000012'), []);   // sans la clé du document : rien
  assert.deepEqual(await a.presencesDocument('DC00000012'), []);   // sa propre présence n'est pas listée
  await a.retirerPresence('DC00000012');
  assert.deepEqual(await c.presencesDocument('DC00000012'), []);
});

test('Fusion à trois : deux paragraphes différents modifiés en même temps, sans conflit', () => {
  const p = (x) => ({ t: 'p', runs: [{ x }] }), tx = (r) => r.elements.map(DM.texteBloc);
  assert.deepEqual(tx(DM.fusion3([p('1'), p('2')], [p('1A'), p('2')], [p('1'), p('2B')])), ['1A', '2B']);
  assert.deepEqual(tx(DM.fusion3([p('1'), p('2'), p('3')], [p('0'), p('1'), p('2'), p('3')], [p('1'), p('2'), p('3'), p('4')])), ['0', '1', '2', '3', '4']);
  assert.deepEqual(tx(DM.fusion3([p('1'), p('2'), p('3')], [p('1'), p('3')], [p('1'), p('2'), p('3B')])), ['1', '3B']);
  const r = DM.fusion3([p('1')], [p('1A')], [p('1B')]); assert.deepEqual(tx(r), ['1A', '1B']); assert.equal(r.conflits, 1);
  assert.equal(DM.fusion3([p('1')], [p('1A')], [p('1A')]).conflits, 0);
});
