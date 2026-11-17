// SPDX-License-Identifier: EUPL-1.2
// Module Audits internes (lot P, 17 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
SIC.validations = require('../app/js/validations.js');
const A = require('../app/js/module-audits.js');
const V = SIC.validations;

let n = 0;
const ev = (by, type, data, t) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(t || Date.UTC(2026, 10, 16, 8, n)).toISOString(), by, type, data });
const gm = A.depuisModele('medicament', 'ga-med');
const gi = A.depuisModele('isocont', 'ga-iso');
const gd = A.depuisModele('dossier', 'ga-dos');
const cfg = { services: [{ code: 'U1' }, { code: 'U2' }], audits: { '*': { grilles: [gm] }, U1: { grilles: [gi, gd, { id: 'mauvais', libelle: 'x' }], auditeurs: ['a1'] } } };
const avecDossier = Object.assign({}, cfg, { validations: { etats: { 'audit-dossier': { etat: 'accord', date: '2026-11-17', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-16' } } } });
const rep = (g, non, na) => g.criteres.map((k, i) => ({ libelle: k.libelle, rubrique: k.rubrique, reponse: (non || []).indexOf(i) >= 0 ? 'non' : (na || []).indexOf(i) >= 0 ? 'na' : 'oui', commentaire: '' }));
const ctx = (st, compte, config) => ({ etat: st, config: config || cfg, compte: compte, peut: () => false, maintenant: Date.UTC(2026, 10, 17, 10) });
const ide = { id: 'a1', roles: ['IDE'], services: ['U1'] }, autre = { id: 'a2', roles: ['IDE'], services: ['U1'] }, cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] };

test('Grilles : modèles proposés, établissement puis service, validation à la lecture', () => {
  assert.deepEqual(A.grilles(cfg, 'U1').map(g => g.id), ['ga-med', 'ga-iso', 'ga-dos']);
  assert.deepEqual(A.grilles(cfg, 'U2').map(g => g.id), ['ga-med']);
  assert.equal(A.grilles(cfg, 'U1')[0].niveau, 'etablissement');
  assert.equal(gd.dossier, true);
  assert.ok(gd.reference.length > 0);
  assert.ok(gi.reference.indexOf('registre') >= 0);
  assert.ok(gm.criteres.length >= 10 && gm.criteres.every(k => k.libelle && k.rubrique));
  assert.equal(A.grille({ id: 'ga-x' }).criteres.length, 1);
  assert.equal(A.grille({ id: 'x' }), null);
});

test('Tenue du dossier : fonction soumise à avis, livrée désactivée', () => {
  assert.equal(V.etat({}, 'audit-dossier').etat, 'desactive');
  assert.deepEqual(A.grillesActives(cfg, 'U1').map(g => g.id), ['ga-med', 'ga-iso']);
  assert.deepEqual(A.grillesActives(avecDossier, 'U1').map(g => g.id), ['ga-med', 'ga-iso', 'ga-dos']);
  const d = { id: 'AU-1', service: 'U1', grille: 'ga-dos', date: '2026-11-17', reference: 'Séjour 900001 (fictif)', items: rep(gd) };
  assert.throws(() => A.controler('AUDIT', d, ctx({ audits: {} }, ide)), /désactivé/);
  assert.doesNotThrow(() => A.controler('AUDIT', d, ctx({ audits: {} }, ide, avecDossier)));
  assert.throws(() => A.controler('AUDIT', Object.assign({}, d, { reference: '' }), ctx({ audits: {} }, ide, avecDossier)), /Référence du séjour/);
});

test('Auditeurs : le cadre et les agents désignés', () => {
  const d = { id: 'AU-2', service: 'U1', grille: 'ga-med', date: '2026-11-16', items: rep(gm) };
  assert.doesNotThrow(() => A.controler('AUDIT', d, ctx({ audits: {} }, ide)));
  assert.doesNotThrow(() => A.controler('AUDIT', d, ctx({ audits: {} }, cadre)));
  assert.throws(() => A.controler('AUDIT', d, ctx({ audits: {} }, autre)), /auditeurs/);
  assert.equal(A.peutAuditer(cfg, 'U2', ide), false);
  assert.deepEqual(A.auditeurs(cfg, 'U1'), ['a1']);
});

test('Saisie : réponses complètes, date, référence, rien d’évaluable', () => {
  const base = { id: 'AU-3', service: 'U1', grille: 'ga-iso', date: '2026-11-16', reference: 'Mesure n° 14 du registre (fictif)', items: rep(gi) };
  assert.doesNotThrow(() => A.controler('AUDIT', base, ctx({ audits: {} }, ide)));
  assert.throws(() => A.controler('AUDIT', Object.assign({}, base, { reference: '' }), ctx({ audits: {} }, ide)), /registre/);
  assert.throws(() => A.controler('AUDIT', Object.assign({}, base, { date: '2026-11-18' }), ctx({ audits: {} }, ide)), /avenir/);
  assert.throws(() => A.controler('AUDIT', Object.assign({}, base, { items: base.items.map((x, i) => i ? x : Object.assign({}, x, { reponse: '' })) }), ctx({ audits: {} }, ide)), /chaque critère/);
  assert.throws(() => A.controler('AUDIT', Object.assign({}, base, { items: base.items.map(x => Object.assign({}, x, { reponse: 'na' })) }), ctx({ audits: {} }, ide)), /rien à auditer/);
  assert.throws(() => A.controler('AUDIT', Object.assign({}, base, { grille: 'ga-inconnue' }), ctx({ audits: {} }, ide)), /inconnue/);
});

test('Taux de conformité : par audit, par période et par critère ; annulation', () => {
  const evts = [
    ev('a1', 'AUDIT', { id: 'AU-a', service: 'U1', grille: 'ga-med', libelle: gm.libelle, date: '2026-09-10', items: rep(gm, [0, 1], [2]), nom: 'Agent A (fictif)' }),
    ev('a1', 'AUDIT', { id: 'AU-b', service: 'U1', grille: 'ga-med', libelle: gm.libelle, date: '2026-10-12', items: rep(gm, [1]), nom: 'Agent A (fictif)' }),
    ev('c1', 'AUDIT', { id: 'AU-c', service: 'U1', grille: 'ga-med', libelle: gm.libelle, date: '2026-11-05', items: rep(gm), nom: 'Cadre (fictif)' }),
    ev('c1', 'AUDIT', { id: 'AU-d', service: 'U1', grille: 'ga-med', libelle: gm.libelle, date: '2026-11-06', items: rep(gm, [0, 1, 3, 4]) }),
    ev('c1', 'AUDIT_ANNULE', { audit: 'AU-d', service: 'U1', motif: 'Doublon (fictif)' })
  ];
  const st = A.reduire(evts);
  const nb = gm.criteres.length;
  assert.deepEqual(A.taux(st.audits['AU-a'].items), { oui: nb - 3, non: 2, na: 1, taux: Math.round(100 * (nb - 3) / (nb - 1)) });
  assert.equal(st.audits['AU-d'].annule.motif, 'Doublon (fictif)');
  assert.deepEqual(A.liste(st, {}).map(a => a.id), ['AU-c', 'AU-b', 'AU-a']);
  assert.equal(A.liste(st, { annules: true }).length, 4);
  const r = A.resultats(st, { grille: 'ga-med', par: 'mois' });
  assert.equal(r.audits, 3);
  assert.deepEqual(r.periodes.map(p => p.code), ['2026-09', '2026-10', '2026-11']);
  assert.equal(r.periodes[2].taux, 100);
  assert.equal(r.criteres[0].libelle, gm.criteres[1].libelle);   // le moins conforme d'abord (2 écarts sur 3)
  assert.equal(r.criteres[0].taux, 33);
  assert.equal(r.global.non, 3);
  assert.deepEqual(A.resultats(st, { par: 'trimestre' }).periodes.map(p => p.libelle), ['3e trimestre 2026', '4e trimestre 2026']);
  assert.equal(A.resultats(st, { du: '2026-11-01' }).audits, 1);
  assert.throws(() => A.controler('AUDIT_ANNULE', { audit: 'AU-d', motif: 'x' }, ctx(st, cadre)), /déjà annulé/);
  assert.throws(() => A.controler('AUDIT_ANNULE', { audit: 'AU-a', motif: 'Erreur (fictif)' }, ctx(st, autre)), /auteur/);
  assert.throws(() => A.controler('AUDIT', { id: 'AU-a', service: 'U1', grille: 'ga-med', date: '2026-11-01', items: rep(gm) }, ctx(st, ide)), /déjà enregistré/);
  const csv = A.lignesExport(A.liste(st, { annules: true }), (s) => s);
  assert.equal(csv.length, 1 + 4 * nb);
  assert.equal(csv[0][5], 'Taux de conformité (%)');
});

test('Réglages : le cadre règle ses services, pas l’établissement', () => {
  assert.equal(A.controlerCadre({}, { U1: { grilles: [gm] } }, cadre), true);
  assert.equal(A.controlerCadre({}, { U2: { grilles: [gm] } }, cadre), false);
  assert.equal(A.controlerCadre({}, { '*': { grilles: [gm] } }, cadre), false);
  assert.equal(A.controlerCadre({}, { '*': { grilles: [gm] } }, { roles: ['ADMIN'] }), true);
  assert.equal(A.contrat.id, 'audits');
  assert.equal(A.droits.serviceActif({}, 'U1'), false);   // module désactivé par défaut
});
