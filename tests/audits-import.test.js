// SPDX-License-Identifier: EUPL-1.2
// Audits internes : import d'un tableau de synthèse mensuel et résultats sur l'année (0.88.0). Données fictives ; npm test
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

// Feuille de synthèse fictive, à la manière d'un classeur tenu par un service : un premier tableau vide, puis le
// tableau rempli (mois en première colonne, critères en colonnes, commentaires, colonnes de calcul sans en-tête)
const L = [];
L[0] = ['Audit sur 5 dossiers (fictif)'];
L[2] = [null, 'Critère A (fictif)', 'Critère B (fictif)', 'Critère C (fictif)'];
['Octobre n-1 %', 'Novembre n-1 %', 'Janvier %', 'Février %'].forEach((m, i) => { L[3 + i] = [m]; });
L[9] = [null, null, null, null, null, null, 'Sorties M-1'];
L[10] = [null, 'Critère A (fictif)', 'Critère B (fictif)', 'Questionnaire de satisfaction (fictif)', 'Utilisation d’un espace (fictif)', 'Réfrigérateur (fictif)\n1 = OK; 0=KO', null, null];
L[11] = ['Octobre n-1 %', 0.6, 0.4, null, null, 'OK'];
L[12] = ['Novembre n-1 %'];
L[13] = ['Janvier %', 0.4, 1, 0.0869, null, 'OK', null, 23];
L[14] = ['Février %', 0.8, 0.6, '#DIV/0!', 9, 'KO', 'réserve mélangée (fictif)', 20];
L[15] = ['Mars %', 1, 0.2, '3/12', 8, 'OK', null, 28];
L[16] = ['Décembre %'];

test('Mois reconnus en première colonne', () => {
  assert.deepEqual(A.moisDe('Février %'), { mois: 2, decalage: 0, annee: null });
  assert.deepEqual(A.moisDe('Octobre n-1 %'), { mois: 10, decalage: -1, annee: null });
  assert.deepEqual(A.moisDe('aout 2025'), { mois: 8, decalage: 0, annee: 2025 });
  assert.deepEqual(A.moisDe('Sept.'), { mois: 9, decalage: 0, annee: null });
  assert.equal(A.moisDe('Nb Sorties'), null);
  assert.equal(A.moisDe(12), null);
});

test('Lecture de la synthèse : bloc rempli, en-tête, types proposés', () => {
  const s = A.lireSynthese(L);
  assert.equal(s.ligneEntete, 10);
  assert.deepEqual(s.mois.map(m => m.mois), [10, 11, 1, 2, 3, 12]);
  const t = {}; s.colonnes.forEach(k => { t[k.libelle] = k.type; });
  assert.equal(t['Critère A (fictif)'], 'ratio');
  assert.equal(t['Questionnaire de satisfaction (fictif)'], 'ratio');
  assert.equal(t['Utilisation d’un espace (fictif)'], 'indicateur');
  assert.equal(t['Réfrigérateur (fictif) 1 = OK; 0=KO'], 'reponse');
  assert.equal(s.colonnes.find(k => k.col === 6).type, 'commentaire');
  assert.equal(s.colonnes.find(k => k.col === 7).type, 'ignorer');   // calcul sans en-tête
  assert.throws(() => A.lireSynthese([['Rien'], ['à lire']]), /Aucun tableau mensuel/);
});

test('Valeurs importées selon le type', () => {
  assert.deepEqual(A.valeurImportee(0.4, 'ratio'), { pourcentage: 40 });
  assert.deepEqual(A.valeurImportee(80, 'ratio'), { pourcentage: 80 });
  assert.deepEqual(A.valeurImportee('3/12', 'ratio'), { conformes: 3, evalues: 12 });
  assert.deepEqual(A.valeurImportee('60 %', 'ratio'), { pourcentage: 60 });
  assert.equal(A.valeurImportee('#DIV/0!', 'ratio'), null);
  assert.deepEqual(A.valeurImportee('KO', 'reponse'), { reponse: 'non' });
  assert.deepEqual(A.valeurImportee(9, 'indicateur'), { valeur: 9 });
});

test('Préparation : grille créée, un audit par mois, n-1, mois vides et déjà importés écartés', () => {
  const s = A.lireSynthese(L), types = {};
  const g = A.grilleDepuisSynthese(s, types, 'ga-flash', 'Audit mensuel (fictif)');
  assert.deepEqual(g.criteres.map(k => k.mode), ['ratio', 'ratio', 'ratio', 'indicateur', 'reponse']);
  const corr = A.correspondance(s, g);
  assert.equal(corr[1], 0); assert.equal(corr[6], -1);
  const o = { annee: 2026, service: 'U1', grille: g, correspondances: corr, types, fichier: 'synthese-fictive.xlsx', maintenant: Date.UTC(2026, 10, 17) };
  const p = A.preparerImport({ audits: {} }, s, o);
  assert.deepEqual(p.audits.map(a => a.date), ['2025-10-01', '2026-01-01', '2026-02-01', '2026-03-01']);
  const fev = p.audits[2];
  assert.equal(fev.commentaire, 'réserve mélangée (fictif)');
  assert.equal(fev.items[2].reponse, 'na');                         // #DIV/0! : non évalué
  assert.equal(fev.items[3].valeur, 9);
  assert.equal(fev.items[4].reponse, 'non');
  assert.deepEqual([fev.items[0].pourcentage, fev.items[1].pourcentage], [80, 60]);
  for (const a of p.audits) assert.doesNotThrow(() => A.controler('AUDIT', Object.assign({ id: 'AU-' + a.date }, a), { etat: { audits: {} }, maintenant: o.maintenant }));
  // Réimport du même classeur : mois déjà importés écartés
  let n = 0;
  const st = A.reduire(p.audits.map(a => ({ v: 1, id: 'e' + (++n), at: '2026-11-17T09:0' + n + ':00.000Z', by: 'c1', type: 'AUDIT', data: Object.assign({ id: 'AU-' + n }, a) })));
  const p2 = A.preparerImport(st, s, o);
  assert.equal(p2.audits.length, 0);
  assert.equal(p2.ignores.length, 4);
  assert.match(p2.ignores[0].raison, /déjà importé/);
  // Mois à venir : écarté
  const p3 = A.preparerImport({ audits: {} }, s, Object.assign({}, o, { maintenant: Date.UTC(2026, 1, 10) }));
  assert.deepEqual(p3.audits.map(a => a.date), ['2025-10-01', '2026-01-01', '2026-02-01']);
  assert.deepEqual(p3.ignores.map(x => x.mois), ['mars 2026']);
});

test('Résultats sur l’année : douze mois, proportions, indicateurs, taux moyen', () => {
  const s = A.lireSynthese(L), g = A.grilleDepuisSynthese(s, {}, 'ga-flash', 'Audit mensuel (fictif)');
  const p = A.preparerImport({ audits: {} }, s, { annee: 2026, service: 'U1', grille: g, correspondances: A.correspondance(s, g), types: {}, fichier: 'f.xlsx', maintenant: Date.UTC(2026, 10, 17) });
  let n = 0;
  const st = A.reduire(p.audits.map(a => ({ v: 1, id: 'e' + (++n), at: '2026-11-17T09:0' + n + ':00.000Z', by: 'c1', type: 'AUDIT', data: Object.assign({ id: 'AU-' + n }, a) })));
  const r = A.resultats(st, { grille: 'ga-flash', annee: '2026' });
  assert.equal(r.periodes.length, 12);
  assert.equal(r.periodes[0].court, 'janv.');
  assert.equal(r.periodes[3].taux, null);
  // janvier : 40, 100, 8,69…, OK (100) → moyenne 62
  assert.equal(r.periodes[0].taux, Math.round((40 + 100 + 8.7 + 100) / 4));
  const crA = r.criteres.find(c => c.libelle === 'Critère A (fictif)');
  assert.deepEqual([crA.parPeriode['2026-01'], crA.parPeriode['2026-02'], crA.parPeriode['2026-03']], [40, 80, 100]);
  assert.equal(crA.taux, Math.round((40 + 80 + 100) / 3));
  const q = r.criteres.find(c => c.libelle === 'Questionnaire de satisfaction (fictif)');
  assert.equal(q.parPeriode['2026-03'], 25);                         // 3 sur 12
  assert.equal(r.indicateurs.length, 1);
  assert.deepEqual(r.indicateurs[0].parPeriode, { '2026-02': 9, '2026-03': 8 });
  assert.equal(A.taux(st.audits['AU-3'].items).non, 3);            // février : 80 %, 60 %, KO
  assert.equal(A.libelleReponse(st.audits['AU-4'].items[2]), '3 sur 12 (25 %)');
  assert.equal(A.ecarts(st.audits['AU-4']).length, 2);
});

test('Saisie d’une proportion : nombres entiers, conformes ≤ vérifiés', () => {
  const g = A.grille({ id: 'ga-p', criteres: [{ libelle: 'Lettre de liaison (fictif)', mode: 'ratio' }, { libelle: 'Utilisations (fictif)', mode: 'indicateur' }] });
  const cfg = { audits: { U1: { grilles: [g] } } }, ctx = { etat: { audits: {} }, config: cfg, compte: { id: 'c1', roles: ['CADRE'] }, maintenant: Date.UTC(2026, 10, 17) };
  const base = { id: 'AU-p', service: 'U1', grille: 'ga-p', date: '2026-11-16' };
  assert.doesNotThrow(() => A.controler('AUDIT', Object.assign({ items: [{ libelle: 'L', mode: 'ratio', conformes: 3, evalues: 5 }, { libelle: 'U', mode: 'indicateur', valeur: 2 }] }, base), ctx));
  assert.throws(() => A.controler('AUDIT', Object.assign({ items: [{ libelle: 'L', mode: 'ratio', conformes: 6, evalues: 5 }] }, base), ctx), /plus de dossiers conformes/);
  assert.throws(() => A.controler('AUDIT', Object.assign({ items: [{ libelle: 'L', mode: 'ratio', conformes: 1.5, evalues: 5 }] }, base), ctx), /entiers/);
  assert.throws(() => A.controler('AUDIT', Object.assign({ items: [{ libelle: 'L', mode: 'ratio' }] }, base), ctx), /rien à auditer/);
  assert.deepEqual(A.taux([A.item({ mode: 'ratio', conformes: 3, evalues: 5 })]), { oui: 0, non: 1, na: 0, taux: 60 });
});

test('Libellés : indication « 1 = OK ; 0 = KO » retirée du critère créé', () => {
  const g = A.grilleDepuisSynthese(A.lireSynthese(L), {}, 'ga-x', 'x');
  assert.equal(g.criteres[4].libelle, 'Réfrigérateur (fictif)');
});
