// SPDX-License-Identifier: EUPL-1.2
// Tri et filtre des tableaux (0.26.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/js/tri.js');

test('Valeurs : dates, heures, nombres, texte, cases vides', () => {
  assert.equal(T.valeur('12/11/2026').type, 'date');
  assert.ok(T.valeur('12/11/2026 08:30').v > T.valeur('12/11/2026').v);
  assert.equal(T.valeur('2026-11-12').type, 'date');
  assert.equal(T.valeur('08:30').v, 510);
  assert.equal(T.valeur('3,5 j').v, 3.5);
  assert.equal(T.valeur('1 250').v, 1250);
  assert.equal(T.valeur('—').type, 'vide');
  assert.equal(T.valeur('Chambre 12').type, 'texte');
});

test('Tri : ordre du français, chiffres naturels, vides à la fin dans les deux sens, stable', () => {
  const l = ['Chambre 10', '', 'chambre 2', 'Écureuil (fictif)', 'abeille'];
  assert.deepEqual(T.trier(l, (x) => x, 1), ['abeille', 'chambre 2', 'Chambre 10', 'Écureuil (fictif)', '']);
  assert.deepEqual(T.trier(l, (x) => x, -1), ['Écureuil (fictif)', 'Chambre 10', 'chambre 2', 'abeille', '']);
  const d = ['02/01/2027', '15/12/2026', '—', '01/01/2027'];
  assert.deepEqual(T.trier(d, (x) => x, 1), ['15/12/2026', '01/01/2027', '02/01/2027', '—']);
  assert.deepEqual(T.trier([['a', 1], ['b', 1], ['c', 0]], (x) => String(x[1]), 1).map((x) => x[0]), ['c', 'a', 'b']);
});

test('Clics successifs et préférence : croissant, décroissant, ordre d’origine', () => {
  let t = T.suivant(null, 'nom');
  assert.deepEqual(t, { col: 'nom', sens: 1 });
  t = T.suivant(t, 'nom'); assert.equal(t.sens, -1);
  assert.equal(T.suivant(t, 'nom'), null);
  assert.deepEqual(T.suivant(t, 'date'), { col: 'date', sens: 1 });
  let p = T.regler({}, 'tri/agenda/x', { col: 'nom', sens: -1 });
  assert.deepEqual(T.preference(p), { 'tri/agenda/x': { col: 'nom', sens: -1 } });
  p = T.regler(p, 'tri/agenda/x', null);
  assert.deepEqual(p, {});
  assert.deepEqual(T.preference({ x: { col: 'a', sens: 3 } }), {});
});

test('Filtre rapide : tous les mots, sans accents ni casse', () => {
  assert.equal(T.correspond('Réunion de service — Salle Écoute', 'reunion ecoute'), true);
  assert.equal(T.correspond('Réunion de service', 'reunion atelier'), false);
  assert.equal(T.correspond('x', '  '), true);
});

test('Export CSV dans l’ordre de l’écran ; tri à l’intérieur des groupes de la Vue d’ensemble', () => {
  const csv = '﻿Titre — 12/11/2026\r\n\r\nNuméro;Lieu;Demandée le\r\nT2;"Salle; B";02/11/2026\r\nT1;Chambre 3;10/11/2026\r\n\r\nPied';
  const r = T.lireCsv(T.ordonnerCsv(csv, { titre: 'Demandée le', sens: -1 }));
  assert.deepEqual(r.slice(3, 5).map((l) => l[0]), ['T1', 'T2']);
  assert.equal(r[4][1], 'Salle; B');
  assert.deepEqual(r[r.length - 1], ['Pied']);
  assert.equal(T.ordonnerCsv(csv, { titre: 'Inconnue', sens: 1 }), csv);
  const vue = T.ecrireCsv([['Groupe', 'Patient'], ['A', 'Zoé (fictif)'], ['A', 'Alice (fictif)'], ['B', 'Yves (fictif)'], ['B', 'Bruno (fictif)']]);
  assert.deepEqual(T.lireCsv(T.ordonnerCsv(vue, { titre: 'Patient', sens: 1 })).slice(1).map((l) => l[1]), ['Alice (fictif)', 'Zoé (fictif)', 'Bruno (fictif)', 'Yves (fictif)']);
});
