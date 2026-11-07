// SPDX-License-Identifier: EUPL-1.2
// Module Agenda, sous-étape 6.1 (0.8.0) : plusieurs modules affichés, droits, clé et journal de l’Agenda ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Dossier simulé : sous-ensemble de l'API File System Access utilisé par store.js
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
require('../app/js/module-isocont.js');
require('../app/js/module-agenda.js');
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;
const C = globalThis.SIC.crypto;
const M = globalThis.SIC.model;

async function nouveauDossier() {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  const code = await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  return { racine, admin, code };
}
async function connecter(racine) {
  const s = new Session(new Dossier(racine, 'reseau'));
  await s.chargerCoffre();
  await s.connexionMotDePasse('admin', 'mot de passe solide');
  return s;
}
/** Noms des fichiers de saisie d'un journal (chemin depuis la racine : ['socle'] ou ['modules', 'isocont']). */
function saisiesDe(racine, chemin) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) { if (!rep.e.has(p)) return []; rep = rep.e.get(p); }
  const res = [];
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else res.push(v.name.replace(/\.enc$/, '')); } })(rep);
  return res;
}
const SOCLE = ['socle'], ISOCONT = ['modules', 'isocont'];

const co = async (racine, login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };
const AGENDA = ['modules', 'agenda'];
function fichier(racine, chemin, id) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) { if (!rep.e.has(p)) return null; rep = rep.e.get(p); }
  let trouve = null;
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else if (v.name === id + '.enc') trouve = v; } })(rep);
  return trouve;
}
async function equipe() {
  const { racine, admin } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }] });
  await admin.enregistrer('CONFIG', { cle: 'roles', valeur: { R_DIR: { libelle: 'Direction (fictif)', acces: [], services: false } } });
  await admin.creerComptes([
    { nom: 'IDE A (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'AS A (fictif)', login: 'as.a', motDePasse: 'mot de passe as a', roles: ['AS'], services: ['U1'] },
    { nom: 'Direction (fictif)', login: 'dir', motDePasse: 'mot de passe dir', roles: ['R_DIR'], services: [] }]);
  return { racine, admin, id: (login) => admin.comptes.find((c) => c.login === login).id };
}
const rdv = (id, sv) => ({ id, nature: 'accompagnement', titre: 'Rendez-vous extérieur (fictif)', debut: Date.now() + 3600e3, fin: Date.now() + 7200e3, service: sv || 'U1', patients: [], professionnels: [] });

test('Agenda : accès par défaut des rôles fournis, saisie de ses propres absences', () => {
  const A = SIC.modules.obtenir('agenda');
  const peut = (r, t) => A.droits.peut([r], t, {});
  assert.ok(peut('IDE', 'RDV') && peut('IDE', 'TACHE_FAITE') && peut('IDE', 'ALERTE') && !peut('IDE', 'ABSENCE'));
  assert.ok(!peut('AS', 'RDV') && peut('AS', 'TACHE_FAITE') && peut('AS', 'ALERTE_VUE'));
  assert.ok(peut('SECRETAIRE', 'RDV') && !peut('SECRETAIRE', 'ALERTE'));
  assert.ok(peut('CADRE', 'ABSENCE'));
  assert.ok(A.droits.membre(['IDE'], {}) && A.droits.membre(['ADMIN'], {}));
  assert.ok(!A.droits.membre(['R_DIR'], { roles: { R_DIR: { libelle: 'D', acces: [] } } }), 'rôle créé sans accès à l’Agenda');
  assert.ok(A.saisies.permisPourSoi('ABSENCE', { agent: 'u1' }, { id: 'u1' }));
  assert.ok(!A.saisies.permisPourSoi('ABSENCE', { agent: 'u2' }, { id: 'u1' }));
});

test('Agenda : clé, journal et état propres ; modules accessibles ; absences pour soi seulement', async () => {
  const { racine, id } = await equipe();
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  assert.deepEqual(a.journauxActifs.map((j) => j.nom), ['socle', 'patients', 'isocont', 'agenda']);
  assert.deepEqual(a.modulesAccessibles().map((m) => m.id), ['isocont', 'agenda']);
  const e = await a.enregistrer('RDV', rdv('R1'));
  assert.ok(fichier(racine, AGENDA, e.id));
  assert.equal(a.etatModule('agenda').rdv.R1.titre, 'Rendez-vous extérieur (fictif)');
  assert.ok(!a.etat.rdv, 'Isocont ne reconstitue pas l’agenda');
  await a.enregistrer('ABSENCE', { id: 'B1', agent: id('ide.a'), nom: 'IDE A (fictif)', debut: Date.now(), fin: Date.now() + 864e5, categorie: 'formation', service: 'U1' });
  await assert.rejects(a.enregistrer('ABSENCE', { id: 'B2', agent: id('as.a'), nom: 'AS A (fictif)', debut: Date.now(), categorie: 'conge', service: 'U1' }), /rôle/);
  const as = await co(racine, 'as.a', 'mot de passe as a');
  await assert.rejects(as.enregistrer('RDV', rdv('R2')), /rôle/);
  assert.ok(as.etatModule('agenda').absences.B1);
  // Rôle créé sans accès à l'Agenda : ni clé, ni module
  const dir = await co(racine, 'dir', 'mot de passe dir');
  assert.ok(!dir.journauxActifs.some((j) => j.nom === 'agenda'));
  assert.deepEqual(dir.modulesAccessibles().map((m) => m.id), ['isocont']);
  assert.equal(dir.choisirModule('agenda'), false);
  assert.equal(a.choisirModule('agenda'), true);
  assert.equal(a.moduleAffiche(), 'agenda');
  assert.deepEqual(a.mesServices(), ['U1']);
});

test('Agenda : activation par service, accès retirés au rôle (nouvelle génération de la clé)', async () => {
  const { racine, admin, id } = await equipe();
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: { agenda: { tous: false, services: ['U2'] } } });
  const a = await co(racine, 'ide.a', 'mot de passe ide a');
  await assert.rejects(a.enregistrer('RDV', rdv('R1', 'U1')), /désactivé/);
  assert.deepEqual(a.modulesAccessibles().map((m) => m.id), ['isocont'], 'Agenda activé pour aucun de ses services');
  const g = admin.coffre.cles.agenda.courante;
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: {} });
  const roles = JSON.parse(JSON.stringify(admin.etat.config.roles || {}));
  roles.AS = Object.assign({}, roles.AS || { libelle: 'AS', acces: SIC.model.accesDefaut('AS') }, { accesModules: { agenda: [] } });
  await admin.enregistrer('CONFIG', { cle: 'roles', valeur: roles });
  assert.ok(admin.coffre.cles.agenda.courante > g);
  assert.ok(!admin.coffre.enveloppes.some((e) => e.pour === id('as.a') && e.cle === 'agenda' && e.g === admin.coffre.cles.agenda.courante));
  assert.ok(admin.coffre.enveloppes.some((e) => e.pour === id('as.a') && e.cle === 'isocont'), 'Isocont inchangé pour l’AS');
});

test('Agenda du service : éléments de la période, patient d’un autre service affiché en lecture, identité selon le réglage', () => {
  const A = require('../app/js/module-agenda.js');
  const t0 = new Date(2026, 10, 9).getTime(), H = 3600e3;
  const fiches = {
    P1: { id: 'P1', nom: 'DURAND', prenom: 'Alice', ipp: '1001', service: 'U1', sejours: [{ id: 'S', entree: '2026-11-01', service: 'U1' }] },
    P2: { id: 'P2', nom: 'MARTIN', prenom: 'Jean-Paul', ipp: '1002', service: 'U2' } };
  const st = A.reduire([
    { id: 'a', at: '2026-11-08T10:00:00.000Z', by: 'u', type: 'RDV', data: { id: 'R1', nature: 'accompagnement', titre: 'Consultation extérieure (fictif)', debut: t0 + 10 * H, fin: t0 + 11 * H, service: 'U1', patients: ['P1'] } },
    { id: 'b', at: '2026-11-08T10:00:01.000Z', by: 'u', type: 'RDV', data: { id: 'R2', nature: 'activite', titre: 'Atelier (fictif)', debut: t0 + 14 * H, fin: t0 + 15 * H, service: 'U2', patients: ['P1', 'P2'] } },
    { id: 'c', at: '2026-11-08T10:00:02.000Z', by: 'u', type: 'RDV', data: { id: 'R3', nature: 'reunion', titre: 'Staff U2 (fictif)', debut: t0 + 9 * H, fin: t0 + 10 * H, service: 'U2' } },
    { id: 'd', at: '2026-11-08T10:00:03.000Z', by: 'u', type: 'RDV', data: { id: 'R4', nature: 'accompagnement', titre: 'Annulé (fictif)', debut: t0 + 16 * H, service: 'U1', patients: ['P1'] } },
    { id: 'e', at: '2026-11-08T10:00:04.000Z', by: 'u', type: 'RDV', data: { id: 'R4', supprime: true } },
    { id: 'f', at: '2026-11-08T10:00:05.000Z', by: 'u', type: 'RDV', data: { id: 'R5', nature: 'accompagnement', titre: 'Autre jour (fictif)', debut: t0 + 34 * H, service: 'U1' } }]);
  const els = A.elements(st, fiches, ['U1'], t0, t0 + 24 * H);
  assert.deepEqual(els.map((x) => [x.rdv.id, x.externe, x.patients]), [['R1', false, ['P1']], ['R2', true, ['P1']]]);
  assert.deepEqual(A.elements(st, fiches, ['U2'], t0, t0 + 24 * H).map((x) => x.rdv.id), ['R3', 'R2']);
  assert.equal(A.identite(fiches.P2, 'initiales'), 'JP.M.');   // prénom composé
  assert.equal(A.identite(fiches.P1, 'ipp'), 'IPP 1001');
  assert.equal(A.identite(fiches.P1, 'nom'), 'DURAND Alice');
  assert.equal(A.identite(fiches.P1, 'aucune'), 'patient');
  assert.equal(A.optionsAgenda({}).identite, 'initiales');
  assert.equal(A.optionsAgenda({}).typesAlertes[0].libelle, 'À voir par le médecin');
  const o = A.optionsAgenda({ agenda: { identite: 'xx', typesAlertes: [{ code: 'a', libelle: ' Bilan social ' }, { code: 'b', libelle: '' }], typesAlertesServices: { U2: [{ code: 'c', libelle: 'Préparer la sortie' }] } } }, 'U1');
  assert.equal(o.identite, 'initiales');
  assert.deepEqual(o.typesAlertes, [{ code: 'a', libelle: 'Bilan social' }]);       // liste de l'établissement
  assert.equal(o.modifAutresServices, false);                                         // lecture seule par défaut
  assert.deepEqual(A.optionsAgenda({ agenda: { typesAlertesServices: { U2: [{ code: 'c', libelle: 'Préparer la sortie' }] } } }, 'U2').typesAlertes, [{ code: 'c', libelle: 'Préparer la sortie' }]);   // liste propre au service
});

test('Commentaire sur un élément d’un autre service : permis sans accès particulier, gardé avec l’élément', async () => {
  const { racine, admin } = await equipe();
  await admin.enregistrer('RDV', Object.assign(rdv('RB', 'U2'), { nature: 'activite', patients: [] }));
  const as = await co(racine, 'as.a', 'mot de passe as a');                          // l'AS ne planifie pas
  await assert.rejects(as.enregistrer('RDV', { id: 'RB', titre: 'modifié', service: 'U2' }), /rôle/);
  await as.enregistrer('COMMENTAIRE', { id: 'K1', rdv: 'RB', texte: 'Patient prévenu de l’horaire (fictif)', service: 'U1' });
  const c = as.etatModule('agenda').rdv.RB.commentaires;
  assert.equal(c.length, 1);
  assert.equal(c[0].service, 'U1');
});

test('Répétition : chaque semaine (jours choisis), jusqu’au, occurrence retirée, chaque mois, changement d’heure', () => {
  const A = require('../app/js/module-agenda.js');
  const L = (a, m, j, h, mi) => new Date(a, m - 1, j, h || 0, mi || 0).getTime();
  const r = { id: 'R', debut: L(2026, 11, 2, 10), fin: L(2026, 11, 2, 11, 30), regularite: { type: 'semaine', jours: [1, 4], jusquAu: '2026-11-19' }, exceptions: ['2026-11-12'] };
  const o = A.occurrences(r, L(2026, 11, 1), L(2026, 12, 1));
  assert.deepEqual(o.map((x) => x.occurrence), ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-16', '2026-11-19']);
  assert.equal(new Date(o[1].debut).getHours(), 10);
  assert.equal(o[1].fin - o[1].debut, 90 * 60000);
  assert.deepEqual(A.datesOccurrences(L(2026, 1, 31), { type: 'mois' }, L(2026, 1, 1), L(2026, 6, 1)), ['2026-01-31', '2026-03-31', '2026-05-31']);
  // Chaque jour à 9 h, à travers le passage à l'heure d'hiver (25 octobre 2026) : toujours 9 h locales
  const q = A.occurrences({ debut: L(2026, 10, 24, 9), fin: L(2026, 10, 24, 10), regularite: { type: 'jour' } }, L(2026, 10, 24), L(2026, 10, 27));
  assert.deepEqual(q.map((x) => new Date(x.debut).getHours()), [9, 9, 9]);
  assert.deepEqual(A.occurrences({ debut: L(2026, 11, 2, 10), regularite: {} }, L(2026, 11, 2), L(2026, 11, 3)).map((x) => x.occurrence), ['2026-11-02']);
});

test('Check-list d’un événement (sortie) : points cochés par occurrence ; modèles ; tâches dues et faites ; professionnel prévu absent', () => {
  const A = require('../app/js/module-agenda.js');
  const L = (a, m, j, h) => new Date(a, m - 1, j, h || 0).getTime();
  assert.deepEqual(A.checklists({})[0].items.length, 5);
  const ev = (id, type, data) => ({ id, at: '2026-11-0' + (1 + (id.charCodeAt(0) % 8)) + 'T08:00:00.000Z', by: 'u', type, data });
  const st = A.reduire([
    ev('a', 'RDV', { id: 'S1', nature: 'sortie', titre: 'Sortie (fictif)', debut: L(2026, 11, 10, 14), service: 'U1', patients: ['P1'], professionnels: [{ id: 'u1', nom: 'IDE A (fictif)' }],
      checklist: [{ id: 'i1', libelle: 'Lettre de sortie' }, { id: 'i2', libelle: 'Ordonnance' }] }),
    ev('b', 'CHECK', { rdv: 'S1', item: 'i1', occurrence: '2026-11-10' }),
    ev('c', 'TACHE', { id: 'T1', titre: 'Vérifier le chariot d’urgence (fictif)', service: 'U1', debut: '2026-11-01', regularite: { type: 'semaine', jours: [1] }, heure: '08:00', pour: { roles: ['IDE'] } }),
    ev('d', 'TACHE_FAITE', { tache: 'T1', occurrence: '2026-11-09' }),
    ev('e', 'ABSENCE', { id: 'B1', agent: 'u1', nom: 'IDE A (fictif)', debut: L(2026, 11, 10), fin: L(2026, 11, 11) })]);
  const els = A.elements(st, {}, ['U1'], L(2026, 11, 10), L(2026, 11, 11));
  assert.equal(els[0].checklist.reste, 1);
  assert.equal(els[0].checklist.items[0].fait.par, 'u');
  assert.deepEqual(els[0].absents.map((p) => p.id), ['u1']);
  const dues = A.tachesDues(st, ['U1'], L(2026, 11, 9), L(2026, 11, 17));
  assert.deepEqual(dues.map((x) => [x.occurrence, !!x.fait]), [['2026-11-09', true], ['2026-11-16', false]]);
  assert.ok(A.tachePour(st.taches.T1, { id: 'x', roles: ['IDE'] }) && !A.tachePour(st.taches.T1, { id: 'y', roles: ['AS'] }));
  assert.equal(A.absences(st, L(2026, 11, 10), L(2026, 11, 11))[0].categorie, undefined);   // motif facultatif
});
