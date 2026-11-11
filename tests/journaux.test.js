// SPDX-License-Identifier: EUPL-1.2
// Journaux du socle et des modules (étape 3 du plan d'architecture) : rangement, aiguillage des saisies,
// chaînage et intégrité par journal, copies et dossier de secours : npm test
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
globalThis.SIC.comptes = require('../app/js/comptes.js');

globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
globalThis.SIC.model = require('../app/js/model.js');
globalThis.SIC.modules = require('../app/js/modules.js');
require('../app/js/module-isocont.js');
globalThis.SIC.comptes = require('../app/js/comptes.js');
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

test('Aiguillage : saisies du socle (comptes, réglages communs) et du module rangées chacune dans son journal', async () => {
  const { racine, admin } = await nouveauDossier();
  const sv = await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'Unité 1 (fictive)' }] });
  const etab = await admin.enregistrer('CONFIG', { cle: 'etablissement', valeur: 'Établissement (fictif)' });
  const lieu = await admin.enregistrer('CONFIG', { cle: 'pauses', valeur: { active: true } });
  const m = await admin.enregistrer('MESURE_DEBUT', { mesureId: 'M1', patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
  await admin.creerCompte({ nom: 'IDE (fictif)', login: 'ide', motDePasse: 'autre mot de passe', roles: ['IDE'], services: ['U1'] });
  const socle = saisiesDe(racine, SOCLE), isocont = saisiesDe(racine, ISOCONT);
  assert.ok(socle.includes(sv.id) && socle.includes(etab.id));
  assert.ok(isocont.includes(lieu.id) && isocont.includes(m.id));
  assert.equal(socle.length, 3);                                   // services, établissement, trace de création du compte
  assert.ok(!racine.e.has('evenements'));                          // plus rien à la racine
  // Chaînage propre à chaque journal : la première saisie du module ne cite pas une saisie du socle
  assert.equal(lieu.prec, null);
  assert.equal(etab.prec, sv.id);
  // L'état du module se reconstitue avec les réglages communs du socle
  const s = await connecter(racine);
  assert.deepEqual(s.etat.config.services.map((x) => x.code), ['U1']);
  assert.equal(s.etat.config.etablissement, 'Établissement (fictif)');
  assert.ok(s.etat.mesures.M1);
  // Une annulation va dans le journal de la saisie annulée
  const ann = await s.enregistrer('ANNULATION', { cible: etab.id, motif: 'test (fictif)' });
  assert.ok(saisiesDe(racine, SOCLE).includes(ann.id));
  assert.equal(s.etat.config.etablissement, '');
  const ann2 = await s.enregistrer('ANNULATION', { cible: m.id, motif: 'test (fictif)' });
  assert.ok(saisiesDe(racine, ISOCONT).includes(ann2.id));
  assert.ok(!s.etat.mesures.M1);
});

test('Intégrité journal par journal : repères distincts, prise d’acte limitée au journal concerné', async () => {
  const { racine, admin } = await nouveauDossier();
  const a = await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1' }] });
  const b = await admin.enregistrer('MESURE_DEBUT', { mesureId: 'M1', patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
  assert.equal(admin.anomaliesIntegrite(), false);
  // Disparition de la dernière saisie du socle
  const mois = a.at.slice(0, 7).split('-');
  racine.e.get('socle').e.get('evenements').e.get(mois[0]).e.get(mois[1]).e.delete(a.id + '.enc');
  const s = await connecter(racine);
  let r = await s.verifierIntegrite();
  assert.deepEqual(r.reperes.map((x) => [x.journal, x.dernierManquant]), [['socle', true]]);
  await s.prendreActeIntegrite('Fichier perdu sans copie (test fictif)');
  assert.equal(s.anomaliesIntegrite(), false);
  // La prise d'acte du socle ne couvre pas une disparition dans le journal du module
  racine.e.get('modules').e.get('isocont').e.get('evenements').e.get(mois[0]).e.get(mois[1]).e.delete(b.id + '.enc');
  const t = await connecter(racine);
  r = await t.verifierIntegrite();
  assert.ok(t.anomaliesIntegrite());
  assert.deepEqual(r.reperes.map((x) => x.journal), ['isocont']);
});

test('Copie complète : les deux journaux, restaurée à l’identique ; copie au format d’Isocont reprise dans modules/isocont', async () => {
  const { racine, admin } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1' }] });
  await admin.enregistrer('MESURE_DEBUT', { mesureId: 'M1', patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
  const copie = await admin.copieComplete();
  assert.ok(copie.fichiers.some((f) => f.chemin.startsWith('socle/evenements/')));
  assert.ok(copie.fichiers.some((f) => f.chemin.startsWith('modules/isocont/evenements/')));
  const vide = new Repertoire('Restauration');
  await new Dossier(vide, 'reseau').restaurerCopie(JSON.parse(JSON.stringify(copie)));
  const s = await connecter(vide);
  assert.deepEqual(s.etat.config.services.map((x) => x.code), ['U1']);
  assert.ok(s.etat.mesures.M1);
  // Ancien rangement (Isocont : evenements/ à la racine) : repris dans le journal du module
  const ancienne = JSON.parse(JSON.stringify(copie));
  ancienne.fichiers.forEach((f) => { f.chemin = f.chemin.replace(/^(socle|modules\/isocont)\//, ''); });
  const vide2 = new Repertoire('Reprise Isocont');
  await new Dossier(vide2, 'reseau').restaurerCopie(ancienne);
  assert.ok(!vide2.e.has('evenements'));
  const s2 = await connecter(vide2);
  assert.deepEqual(s2.etat.config.services.map((x) => x.code), ['U1']);
  assert.ok(s2.etat.mesures.M1);
  assert.equal(saisiesDe(vide2, ISOCONT).length, copie.fichiers.length);
  // Un chemin étranger est ignoré
  const piege = JSON.parse(JSON.stringify(copie));
  piege.fichiers.push({ chemin: 'modules/../coffre.json', contenu: piege.fichiers[0].contenu });
  const vide3 = new Repertoire('Piège');
  assert.equal(await new Dossier(vide3, 'reseau').restaurerCopie(piege), piege.fichiers.length);
  assert.ok(!vide3.e.has('..'));
});

test('Dossier de secours : journaux copiés, instantanés et jeu de formation exclus', async () => {
  const { racine, admin } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1' }] });
  await admin.enregistrer('MESURE_DEBUT', { mesureId: 'M1', patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
  const iso = racine.e.get('modules').e.get('isocont');
  await (await iso.getDirectoryHandle('instantanes', { create: true })).getFileHandle('2020-01.enc', { create: true });
  await (await iso.getDirectoryHandle('formation', { create: true })).getFileHandle('FORMATION-LISEZMOI.txt', { create: true });
  const secoursRep = new Repertoire('Secours');
  await admin.synchroniserMiroir(new Dossier(secoursRep, 'reseau'));
  const isoS = secoursRep.e.get('modules').e.get('isocont');
  assert.ok(secoursRep.e.get('socle').e.has('evenements') && isoS.e.has('evenements'));
  assert.ok(!isoS.e.has('instantanes') && !isoS.e.has('formation'));
  const s = await connecter(secoursRep);
  assert.ok(s.etat.mesures.M1);
});

test('Activation du module par service : réglage du socle, services visibles, saisies refusées, consultation par l’encadrement', async () => {
  const { racine, admin } = await nouveauDossier();
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'Unité 1 (fictive)' }, { code: 'U2', libelle: 'Unité 2 (fictive)' }] });
  await admin.enregistrer('MESURE_DEBUT', { mesureId: 'M2', patientId: 'P', service: 'U2', typeMesure: 'Isolement', debut: Date.now() - 3600e3, csi: true });
  await admin.creerComptes([
    { nom: 'IDE (fictif)', login: 'ide', motDePasse: 'mot de passe ide 1', roles: ['IDE'], services: ['U1', 'U2'] },
    { nom: 'Cadre (fictif)', login: 'cadre', motDePasse: 'mot de passe cadre', roles: ['CADRE'], services: ['U1', 'U2'] }
  ]);
  const co = async (login, mdp) => { const s = new Session(new Dossier(racine, 'reseau')); await s.chargerCoffre(); await s.connexionMotDePasse(login, mdp); return s; };
  // Sans réglage : activé partout (comportement d'origine)
  let ide = await co('ide', 'mot de passe ide 1');
  assert.deepEqual(ide.mesServices(), ['U1', 'U2']);
  // Désactivation pour U2 : saisie de l'administrateur au journal du socle
  const r = await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: { isocont: { tous: false, services: ['U1'] } } });
  assert.ok(saisiesDe(racine, SOCLE).includes(r.id));
  ide = await co('ide', 'mot de passe ide 1');
  const cadre = await co('cadre', 'mot de passe cadre');
  assert.deepEqual(ide.mesServices(), ['U1']);                       // l'IDE ne voit plus U2
  assert.deepEqual(cadre.mesServices(), ['U1', 'U2']);               // l'encadrement consulte U2
  assert.deepEqual(admin.mesServices(), ['U1', 'U2']);
  assert.deepEqual(M.droits.servicesInactifs(cadre.etat.config), ['U2']);
  // Aucune saisie dans U2, même pour le cadre ; U1 inchangé
  await assert.rejects(cadre.enregistrer('MESURE_DEBUT', { mesureId: 'M3', patientId: 'P', service: 'U2', typeMesure: 'Isolement', debut: Date.now(), csi: true }), /désactivé pour le service Unité 2/);
  await assert.rejects(cadre.enregistrer('MESURE_FIN', { mesureId: 'M2', fin: Date.now() }), /consultation seule/);
  await cadre.enregistrer('MESURE_DEBUT', { mesureId: 'M1', patientId: 'P', service: 'U1', typeMesure: 'Isolement', debut: Date.now(), csi: true });
  assert.ok(cadre.etat.mesures.M2 && cadre.etat.mesures.M1);         // données de U2 conservées
  // Un service créé ensuite reste à activer ; la réactivation de tous les services rend le réglage d'origine
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: admin.etat.config.services.concat([{ code: 'U3', libelle: 'Unité 3 (fictive)' }]) });
  assert.equal(M.droits.serviceActif(admin.etat.config, 'U3'), false);
  await admin.enregistrer('CONFIG', { cle: 'modulesServices', valeur: {} });
  assert.deepEqual(M.droits.servicesInactifs(admin.etat.config), []);
});

test('Lecture rapide : seuls les mois récents sont parcourus ; la lecture complète rattrape un mois clos (0.21.1)', async () => {
  const { Dossier } = globalThis.SIC, C = globalThis.SIC.crypto;
  const racine = new Repertoire('racine'), d = new Dossier(racine, 'reseau');
  const cle = await C.importerCle(C.b64(C.aleatoire(32)));
  const maintenant = new Date(), mois = (n) => { const x = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - n, 10, 8)); return x.toISOString(); };
  const ecrire = (at, n) => d.ecrireEvenement(cle, { v: 1, id: at.replace(/[-:]/g, '').replace(/\.\d+/, '') + '_a1_' + n, at, by: 'a1', type: 'NOTE', data: {} });
  await ecrire(mois(3), '00000001'); await ecrire(mois(0), '00000002');
  const connus = new Set();
  assert.equal((await d.lireNouveaux(cle, connus)).evenements.length, 2);   // lecture complète
  await ecrire(mois(3), '00000003'); await ecrire(mois(1), '00000004'); await ecrire(mois(0), '00000005');
  const rapide = await d.lireNouveaux(cle, connus, { recents: true });
  assert.deepEqual(rapide.evenements.map(e => e.id.slice(-8)).sort(), ['00000004', '00000005']);   // le mois clos n'est pas parcouru
  const complete = await d.lireNouveaux(cle, connus);
  assert.deepEqual(complete.evenements.map(e => e.id.slice(-8)), ['00000003']);   // rattrapé par la lecture complète
});
