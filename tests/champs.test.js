// SPDX-License-Identifier: EUPL-1.2
// Champs ajoutés communs, réglages attachés aux données, initiales des médecins (0.18.0, décisions du 9 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';

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
globalThis.SIC.champs = require('../app/js/champs.js');
globalThis.SIC.couleurs = require('../app/js/couleurs.js');
const P = require('../app/js/module-patients.js');
require('../app/js/module-isocont.js');
globalThis.SIC.medecins = require('../app/js/medecins.js');
require('../app/js/module-suivi.js');
require('../app/js/module-vue.js');
globalThis.SIC.comptes = require('../app/js/comptes.js');
globalThis.SIC.trousseau = require('../app/js/trousseau.js');
require('../app/js/store.js');
require('../app/js/session.js');
const { Dossier, Session } = globalThis.SIC;
const CH = globalThis.SIC.champs, CO = globalThis.SIC.couleurs, MED = globalThis.SIC.medecins;

function saisiesDe(racine, chemin) {
  let rep = racine;
  for (const p of chemin.concat(['evenements'])) { if (!rep.e.has(p)) return []; rep = rep.e.get(p); }
  const res = [];
  (function parcourir(r) { for (const v of r.e.values()) { if (v.kind === 'directory') parcourir(v); else res.push(v.name); } })(rep);
  return res;
}
async function connecter(racine, login, mdp) {
  const s = new Session(new Dossier(racine, 'reseau'));
  await s.chargerCoffre();
  await s.connexionMotDePasse(login, mdp);
  return s;
}

test('Champs : reprise des données complémentaires de 0.13.0, nouveaux types, contrôle des valeurs', () => {
  const ancien = { patientsChamps: [{ id: 'sorties', libelle: 'Sorties libres', type: 'ouiNon', services: ['U1'] }] };
  assert.deepEqual(CH.definitions(ancien).map((c) => [c.id, c.entite, c.module]), [['sorties', 'patient', 'patients']]);
  assert.deepEqual(P.champsComplementaires(ancien).map((c) => c.id), ['sorties'], 'la fiche patient garde ses données');
  // Dès que champsAjoutes existe (même vide), il fait foi
  assert.equal(CH.definitions({ patientsChamps: ancien.patientsChamps, champsAjoutes: [] }).length, 0);
  const tel = { id: 'tel', libelle: 'Téléphone de la personne à prévenir', type: 'telephone' };
  assert.equal(CH.valeur(tel, '0612345678'), '06 12 34 56 78');
  assert.equal(CH.valeur(tel, '+33 6.12.34.56.78'), '+33 6 12 34 56 78');
  assert.throws(() => CH.valeur(tel, 'pas un numéro'), /téléphone/);
  const multi = CH.normaliser({ id: 'activites', libelle: 'Activités', type: 'choixMultiple', choix: ['Piscine', 'Jardin', 'Musique'] });
  assert.deepEqual(CH.valeur(multi, ['Musique', 'Piscine']), ['Piscine', 'Musique'], 'ordre des choix');
  assert.throws(() => CH.valeur(multi, ['Tennis']), /choix multiple/i);
  const fen = CH.normaliser({ id: 'sortie', libelle: 'Sortie', type: 'dateFenetre' });
  assert.deepEqual(CH.valeur(fen, { debut: '2026-11-16', fin: '2026-11-20', precision: 'après audience' }), { debut: '2026-11-16', fin: '2026-11-20', precision: 'après audience' });
  assert.equal(CH.lib(fen, { debut: '2026-11-16', fin: '2026-11-20' }), 'du 16/11/2026 au 20/11/2026');
  assert.throws(() => CH.valeur(fen, { debut: '2026-11-20', fin: '2026-11-16' }), /précède/);
  // Option « donnée clinique » : clé propre obligatoire
  assert.equal(CH.normaliser({ id: 'x-clin', libelle: 'X', type: 'texte', clinique: true }).protection, 'cle');
  assert.equal(CH.cleDe(CH.normaliser({ id: 'x-clin', libelle: 'X', type: 'texte', clinique: true })), 'd-x-clin');
});

test('Champs : notes et check-lists construites saisie après saisie, rien n’est effacé', () => {
  const n = CH.normaliser({ id: 'notes', libelle: 'Notes du staff', type: 'notes', tri: 'asc' });
  assert.throws(() => CH.operation(n, { ajout: { id: 'n1', texte: '  ' } }), /vide/);
  let v;
  v = CH.appliquerOperation(v, CH.operation(n, { ajout: { id: 'n1', texte: 'Appeler la tutelle (fictif)', importance: 'important' } }), { at: '2026-11-09T08:00:00Z', by: 'u1' });
  v = CH.appliquerOperation(v, CH.operation(n, { ajout: { id: 'n2', texte: 'Rendez-vous assistante sociale', importance: 'urgent' } }), { at: '2026-11-09T09:00:00Z', by: 'u2' });
  assert.equal(CH.importanceMax(v), 'urgent');
  v = CH.appliquerOperation(v, { retrait: 'n2' }, { at: '2026-11-09T10:00:00Z', by: 'u1' });
  assert.deepEqual(CH.notes(n, v).map((x) => x.id), ['n1']);
  assert.equal(CH.notes(n, v, true).length, 2, 'la note retirée reste au journal');
  assert.equal(CH.importanceMax(v), 'important');
  const c = CH.normaliser({ id: 'entree', libelle: 'Check-list d’entrée', type: 'checklist', modele: [{ id: 'inventaire', libelle: 'Inventaire' }, { id: 'livret', libelle: 'Livret d’accueil' }] });
  assert.equal(c.libre, false, 'avec un modèle, les éléments libres sont à autoriser');
  assert.throws(() => CH.operation(c, { ajout: { id: 'x1', libelle: 'Autre' } }), /modèle/);
  const libre = CH.normaliser(Object.assign({}, c, { libre: true }));
  let k;
  k = CH.appliquerOperation(k, CH.operation(libre, { cocher: { element: 'inventaire', fait: true } }), { at: '2026-11-09T08:00:00Z', by: 'u1' });
  k = CH.appliquerOperation(k, CH.operation(libre, { ajout: { id: 'x1', libelle: 'Photo d’identité' } }), { at: '2026-11-09T08:05:00Z', by: 'u1' });
  const etat = CH.checklist(libre, k);
  assert.deepEqual([etat.faits, etat.total], [1, 3]);
  assert.equal(CH.lib(libre, k), '1/3');
});

test('Champs : définitions réglées par le cadre pour ses services seulement', () => {
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  const a = [{ id: 'etab', libelle: 'Donnée de l’établissement', type: 'texte', services: [] }];
  assert.ok(CH.controlerCadre(a, a.concat([{ id: 'u1', libelle: 'Donnée U1', type: 'texte', services: ['U1'] }]), cadre));
  assert.throws(() => CH.controlerCadre(a, [{ id: 'etab', libelle: 'Renommée', type: 'texte', services: [] }], cadre), /administrateur/);
  assert.throws(() => CH.controlerCadre(a, a.concat([{ id: 'u2', libelle: 'U2', type: 'texte', services: ['U2'] }]), cadre), /vos services/);
  assert.throws(() => CH.controlerCadre(a, a.concat([{ id: 'c', libelle: 'C', type: 'texte', services: ['U1'], clinique: true }]), cadre), /administrateur/);
  assert.throws(() => CH.controlerCadre(a, [], cadre), /masquez/);
  assert.ok(CH.controlerCadre(a, [], { roles: ['ADMIN'] }));
});

test('Couleurs : règles évaluées dans l’ordre, réglage du service prioritaire, délai selon la durée d’hospitalisation, légende', () => {
  const config = { reglagesDonnees: {
    'patients.medecin1': { '*': { regles: [{ si: { op: 'egal', valeur: 'm-alpha' }, couleur: 'bleu', rendu: 'pastille', libelle: 'Dr ALPHA (fictif)' }] }, U2: { regles: [{ si: { op: 'egal', valeur: 'm-alpha' }, couleur: 'violet' }] } },
    'c:bilan': { '*': { delai: { tranches: [{ jusqua: 7, jours: 2 }, { jusqua: null, jours: 10 }] }, regles: CO.reglesEcheance() } } } };
  const r1 = CO.reglages(config, 'patients.medecin1', 'U1');
  assert.equal(r1.source, 'etablissement');
  assert.equal(CO.evaluer(r1.regles, { valeur: 'Dr ALPHA (fictif)', cle: 'm-alpha' }).couleur, 'bleu');
  assert.equal(CO.evaluer(CO.reglages(config, 'patients.medecin1', 'U2').regles, { cle: 'm-alpha' }).couleur, 'violet');
  assert.equal(CO.reglages(config, 'inconnue', 'U1', { regles: [{ si: { op: 'toujours' }, couleur: 'gris' }] }).source, 'defaut');
  // Délai : 2 jours au début du séjour, 10 jours ensuite
  const r = CO.reglages(config, 'c:bilan', 'U1'), maintenant = new Date(2026, 10, 9, 12).getTime();
  assert.equal(CO.evaluer(r.regles, CO.contexteDate('2026-11-06', r.delai, 3, maintenant)).couleur, 'rouge');      // 3 jours > 2
  assert.equal(CO.evaluer(r.regles, CO.contexteDate('2026-11-06', r.delai, 30, maintenant)).couleur, 'vert');      // 3 jours ≤ 10, échéance dans 7
  assert.equal(CO.evaluer(r.regles, CO.contexteDate('2026-10-31', r.delai, 30, maintenant)).couleur, 'orange');    // 9 jours : échéance dans 1
  // Règles propres à une vue évaluées en premier
  assert.equal(CO.evaluer(r.regles, CO.contexteDate('2026-11-06', r.delai, 30, maintenant), [{ si: { op: 'depuisPlusDe', n: 2 }, couleur: 'brun' }]).couleur, 'brun');
  assert.ok(CO.legende(r.regles).some((l) => l.libelle === 'Délai dépassé' && l.symbole === '■'));
  // Cadre : seulement ses services
  assert.ok(CO.controlerCadre(config.reglagesDonnees, Object.assign({}, config.reglagesDonnees, { 'c:x': { U1: { regles: [] } } }), { roles: ['CADRE'], services: ['U1'] }));
  assert.ok(!CO.controlerCadre(config.reglagesDonnees, Object.assign({}, config.reglagesDonnees, { 'c:x': { '*': { regles: [] } } }), { roles: ['CADRE'], services: ['U1'] }));
});

test('Médecins : initiales proposées d’après le nom, modifiables', () => {
  assert.equal(MED.proposerInitiales('Dr Jeanne Dupont (fictif)'), 'JD');
  assert.equal(MED.proposerInitiales('Dr Arnaud (fictif)'), 'ARN');
  const cfg = { medecins: { liste: [{ id: 'm-a', nom: 'Dr Arnaud (fictif)', initiales: 'A.R.' }, { id: 'm-b', nom: 'Dr Benoît Chen (fictif)' }] } };
  assert.equal(MED.initiales(cfg, null, 'm-a'), 'A.R.');
  assert.equal(MED.initiales(cfg, 'Dr Benoît Chen (fictif)'), 'BC');
});

test('Valeurs ajoutées (VALEUR) : journal du module de rattachement, clé propre remise aux seuls rôles réglés, sortie prévisionnelle datée', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }] });
  await admin.enregistrer('CONFIG', { cle: 'medecins', valeur: { liste: [{ id: 'm-alpha', nom: 'Dr ALPHA (fictif)', services: ['U1'] }] } });
  await admin.enregistrer('CONFIG', { cle: 'champsAjoutes', valeur: [
    { id: 'tel-pro', libelle: 'Téléphone professionnel', type: 'telephone', entite: 'medecin', module: 'suivi', saisie: ['CADRE', 'SECRETAIRE'] },
    { id: 'projet', libelle: 'Projet de sortie', type: 'notes', entite: 'patient', module: 'patients', protection: 'cle', lecture: ['IDE', 'CADRE'], saisie: ['IDE', 'CADRE'] },
    { id: 'sorties', libelle: 'Sorties libres', type: 'ouiNon', entite: 'patient', module: 'patients' }] });
  await admin.creerComptes([
    { nom: 'IDE (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] },
    { nom: 'AS (fictif)', login: 'as.b', motDePasse: 'mot de passe as b', roles: ['AS'], services: ['U1'] },
    { nom: 'Secrétaire (fictif)', login: 'sec.c', motDePasse: 'mot de passe sec c', roles: ['SECRETAIRE'], services: ['U1'] }]);
  await admin.enregistrer('PATIENT', { patientId: 'P1', nom: 'MARTIN (fictif)', service: 'U1' });
  await admin.enregistrer('SEJOUR', { patientId: 'P1', sejourId: 'S1', entree: '2026-11-01', service: 'U1' });
  // L'administrateur se reconnecte : la clé propre de « Projet de sortie » est créée et remise selon les rôles réglés
  const a2 = await connecter(racine, 'admin', 'mot de passe solide');
  assert.ok(a2.coffre.cles['d-projet'], 'clé propre créée');
  const ide = await connecter(racine, 'ide.a', 'mot de passe ide a');
  const as = await connecter(racine, 'as.b', 'mot de passe as b');
  const detient = (x, n) => !!(x.trousseau[n] && Object.keys(x.trousseau[n].octets || {}).length);
  assert.ok(detient(ide, 'd-projet') && !detient(as, 'd-projet'), 'clé remise à l’IDE, pas à l’AS');
  await ide.enregistrer('VALEUR', { entite: 'patient', id: 'P1', champ: 'projet', op: { ajout: { id: 'n1', texte: 'Visite de l’appartement thérapeutique (fictif)', importance: 'important' } } });
  assert.equal(saisiesDe(racine, ['modules', 'd-projet']).length, 1, 'valeur rangée dans le journal de la clé propre');
  await assert.rejects(as.enregistrer('VALEUR', { entite: 'patient', id: 'P1', champ: 'projet', op: { ajout: { id: 'n2', texte: 'x' } } }), /clé|rôle/);
  // Donnée d'un médecin rattachée au Suivi médical : saisie selon les rôles réglés
  const sec = await connecter(racine, 'sec.c', 'mot de passe sec c');
  await sec.enregistrer('VALEUR', { entite: 'medecin', id: 'm-alpha', champ: 'tel-pro', valeur: '0123456789' });
  await assert.rejects(ide.enregistrer('VALEUR', { entite: 'medecin', id: 'm-alpha', champ: 'tel-pro', valeur: '0123456789' }), /rôle ne modifie pas/);
  await assert.rejects(sec.enregistrer('VALEUR', { entite: 'medecin', id: 'm-alpha', champ: 'tel-pro', valeur: 'abc' }), /téléphone/);
  assert.equal(saisiesDe(racine, ['modules', 'suivi']).length, 1);
  // Sortie prévisionnelle : partie du séjour, historique daté
  await ide.enregistrer('SEJOUR', { patientId: 'P1', sejourId: 'S1', sortiePrevue: { debut: '2026-11-20', precision: 'après la synthèse (fictif)' } });
  await ide.enregistrer('SEJOUR', { patientId: 'P1', sejourId: 'S1', sortiePrevue: { debut: '2026-11-23', fin: '2026-11-27' } });
  await ide.synchroniser();
  const sj = ide.etat.patients.P1.sejours[0];
  assert.deepEqual(sj.sortiePrevue, { debut: '2026-11-23', fin: '2026-11-27' });
  assert.equal(sj.historiqueSortiePrevue.length, 2);
  // Lecture : l'IDE lit la note protégée ; l'AS ne la voit pas (journal illisible pour lui) ; tous lisent le téléphone
  assert.equal(CH.notes(null, ide.valeurs().patient.P1.projet).length, 1);
  await as.synchroniser();
  assert.ok(!(as.valeurs().patient.P1 || {}).projet);
  await ide.synchroniser();
  assert.equal(ide.valeurs().medecin['m-alpha']['tel-pro'], '01 23 45 67 89');
  // Retrait d'une note : par son auteur ou le cadre seulement
  await a2.creerComptes([{ nom: 'IDE 2 (fictif)', login: 'ide.d', motDePasse: 'mot de passe ide d', roles: ['IDE'], services: ['U1'] }]);
  const ide2 = await connecter(racine, 'ide.d', 'mot de passe ide d');
  await assert.rejects(ide2.enregistrer('VALEUR', { entite: 'patient', id: 'P1', champ: 'projet', op: { retrait: 'n1' } }), /auteur/);
  await ide.synchroniser();
  await ide.enregistrer('VALEUR', { entite: 'patient', id: 'P1', champ: 'projet', op: { retrait: 'n1' } });
  // COMPLEMENT : notes et check-lists aussi dans la fiche patient (module Patients)
  await ide.enregistrer('COMPLEMENT', { patientId: 'P1', champ: 'sorties', valeur: true });
  await ide.synchroniser();
  assert.equal(ide.etat.patients.P1.complements.sorties, true);
});

test('Capacité d’accueil (0.18.2) : lits ouverts, fermetures et réservations datées, places disponibles, réglage du cadre', () => {
  const K = require('../app/js/capacites.js');
  const cfg = { capacites: { services: {
    U1: { lits: 20, chambresSeules: 12, chambresDoubles: 4, fermetures: [{ id: 'f1', debut: '2026-11-01', fin: '2026-11-15', lits: 2, motif: 'Travaux (fictif)' }], reserves: [{ id: 'r1', debut: '2026-11-08', lits: 1, motif: 'Permission longue' }] },
    U2: { lits: 15 } } } };
  assert.deepEqual(K.situation(cfg, ['U1'], '2026-11-09', 16), { lits: 20, fermes: 2, reserves: 1, presents: 16, motifs: ['Travaux (fictif)'], ouverts: 18, places: 1 });
  assert.equal(K.situation(cfg, ['U1'], '2026-11-20', 19).places, 0, 'fermeture terminée, réservation sans fin');
  assert.equal(K.situation(cfg, ['U1', 'U2'], '2026-11-20', 30).places, 4);
  assert.equal(K.situation(cfg, ['U3'], '2026-11-20', 3), null, 'capacité non renseignée');
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  assert.ok(K.controlerCadre(cfg.capacites, { services: Object.assign({}, cfg.capacites.services, { U1: { lits: 22 } }) }, cadre));
  assert.ok(!K.controlerCadre(cfg.capacites, { services: Object.assign({}, cfg.capacites.services, { U2: { lits: 10 } }) }, cadre));
});

test('Instantané de la Vue d’ensemble : parts rangées dans le journal de chaque donnée, clôture selon les rôles réglés pour la vue', async () => {
  const racine = new Repertoire('TesseraSante');
  const admin = new Session(new Dossier(racine, 'reseau'));
  await admin.initialiser({ nom: 'Admin (fictif)', login: 'admin', motDePasse: 'mot de passe solide' });
  await admin.enregistrer('CONFIG', { cle: 'services', valeur: [{ code: 'U1', libelle: 'U1 (fictif)' }] });
  await admin.enregistrer('CONFIG', { cle: 'vuesEnsemble', valeur: { vues: [{ id: 'staff', nom: 'Staff (fictif)', services: ['U1'], colonnes: ['patient'] }, { id: 'ouverte', nom: 'Ouverte (fictif)', services: ['U1'], colonnes: ['patient'], instantane: { roles: ['IDE'] } }] } });
  await admin.creerComptes([{ nom: 'IDE (fictif)', login: 'ide.a', motDePasse: 'mot de passe ide a', roles: ['IDE'], services: ['U1'] }]);
  const a2 = await connecter(racine, 'admin', 'mot de passe solide');
  assert.ok(a2.coffre.cles.vue, 'clé du module Vue d’ensemble créée');
  await a2.enregistrer('INSTANTANE_PART', { instantane: 'I1', vue: 'staff', journal: 'patients', colonnes: [{ code: 'patient', libelle: 'Patient' }], valeurs: {}, identites: {} });
  await a2.enregistrer('INSTANTANE_PART', { instantane: 'I1', vue: 'staff', journal: 'suivi', colonnes: [], valeurs: {} });
  await a2.enregistrer('INSTANTANE', { id: 'I1', vue: 'staff', nom: 'Staff (fictif)', groupes: [], ordre: ['patient'] });
  assert.equal(saisiesDe(racine, ['modules', 'patients']).length, 1);
  assert.equal(saisiesDe(racine, ['modules', 'suivi']).length, 1);
  assert.equal(saisiesDe(racine, ['modules', 'vue']).length, 1);
  const ide = await connecter(racine, 'ide.a', 'mot de passe ide a');
  await assert.rejects(ide.enregistrer('INSTANTANE', { id: 'I2', vue: 'staff', nom: 'Staff', groupes: [], ordre: [] }), /rôle/, 'clôture : cadre par défaut');
  await ide.enregistrer('INSTANTANE', { id: 'I3', vue: 'ouverte', nom: 'Ouverte', groupes: [], ordre: [] });
  await ide.synchroniser();
  assert.deepEqual(Object.keys(ide.etatModule('vue').instantanes).sort(), ['I1', 'I3']);
});

test('Liste commune des psychologues (0.20.0) : liste séparée, mêmes réglages que les médecins', () => {
  const PS = MED.psychologues;
  assert.equal(PS.CLE, 'psychologues');
  const cfg = { psychiatres: ['Dr Ancien (fictif)'], psychologues: { liste: [{ id: 'p-a', nom: 'Mme A (fictif)', fonction: 'neuropsychologue', anciensNoms: ['Mme Avant (fictif)'] }] } };
  assert.deepEqual(PS.liste(cfg).map((m) => m.nom), ['Mme A (fictif)'], 'sans reprise de l’ancienne liste des psychiatres');
  assert.equal(PS.resoudre(cfg, 'Mme Avant (fictif)'), 'Mme A (fictif)', 'ancien nom suivi');
  assert.equal(PS.initiales(cfg, null, 'p-a'), 'A');
  assert.equal(PS.slug('Mme Durand'), 'p-mme-durand');
  // Un agent qui ne gère pas la liste ajoute seulement un psychologue non répertorié, à confirmer
  const ide = { id: 'u1', roles: ['IDE'] };
  const ajout = { liste: cfg.psychologues.liste.concat([{ id: 'p-b', nom: 'M. B (fictif)', aConfirmer: true, propose: { par: 'u1' } }]) };
  assert.ok(PS.controler(cfg, 'psychologues', ajout, ide));
  assert.throws(() => PS.controler(cfg, 'psychologues', { liste: [] }, ide), /psychologue non répertorié/);
  assert.ok(PS.controler(cfg, 'psychologues', { liste: [] }, { roles: ['SECRETAIRE'] }), 'gestion : cadre et secrétaire');
});

test('Données d’un agent (0.20.0) : clé propre obligatoire, cadre seul par défaut', () => {
  const c = CH.normaliser({ id: 'afgsu', libelle: 'AFGSU', type: 'date', entite: 'agent', protection: 'interface' });
  assert.equal(c.protection, 'cle');
  assert.equal(CH.cleDe(c), 'd-afgsu');
  assert.deepEqual([c.lecture, c.saisie], [['CADRE'], ['CADRE']]);
  assert.equal(CH.typeSaisie(c), 'VALEUR');
  assert.ok(CH.aDroitCle(c, ['CADRE']) && !CH.aDroitCle(c, ['IDE']));
  const r = CH.reduireValeurs([{ id: 'e1', at: '2026-11-09T10:00:00Z', by: 'u', type: 'VALEUR', data: { entite: 'agent', id: 'u-ide', champ: 'afgsu', valeur: '2027-01-01' } }]);
  assert.equal(r.agent['u-ide'].afgsu, '2027-01-01');
});
