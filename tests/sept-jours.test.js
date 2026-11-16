// SPDX-License-Identifier: EUPL-1.2
// Délai de sept jours (0.76.0, constat J2 de l'audit, décision du porteur du 16 novembre 2026) : après deux décisions
// de maintien d'un isolement, échéances comptées aussi depuis la précédente décision du juge (art. L. 3222-5-1, II ;
// Cass. avis, 6 mars 2024, n° 23-70.017), l'échéance la plus proche étant retenue. Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../app/js/rules.js');
const H = R.H;
const debut = Date.UTC(2026, 10, 1, 8, 0);
const mesure = (jld, type) => ({ id: 'M1', patientId: 'P1', type: type || 'Isolement', debut, jld: jld || {} });

test('Deux premiers cycles : inchangés, depuis le début de la mesure', () => {
  const m = mesure({ 1: { DECISION: { date: debut + 50 * H } } });
  for (const opt of [undefined, { septJours: 'decision' }]) {
    const e1 = R.echeances([m], m, 1, null, opt), e2 = R.echeances([m], m, 2, null, opt);
    assert.equal(e1.decision, debut + 96 * H);
    assert.equal(e2.decision, debut + 192 * H);
    assert.ok(!e2.depuisDecision && !e2.decisionManquante);
  }
});

test('Troisième cycle : sept jours depuis la décision du juge, échéance la plus proche', () => {
  // Décision de maintien du cycle 2 rendue à la 150e heure, bien avant la 192e
  const d2 = debut + 150 * H, m = mesure({ 2: { DECISION: { date: d2 } } });
  const ancien = R.echeances([m], m, 3, null, { septJours: 'debut' });
  assert.equal(ancien.saisine, debut + 192 * H + 144 * H);
  assert.equal(ancien.decision, debut + 192 * H + 168 * H);
  const e = R.echeances([m], m, 3, null, { septJours: 'decision' });
  assert.equal(e.decision, d2 + 168 * H, 'expiration 168 h après la décision');
  assert.equal(e.saisine, d2 + 144 * H, 'saisine au moins 24 h avant');
  assert.equal(e.info, e.saisine);
  assert.equal(e.depuisDecision, d2);
  // Décision rendue à la dernière heure : les deux calculs coïncident
  const m2 = mesure({ 2: { DECISION: { date: debut + 192 * H } } });
  assert.equal(R.echeances([m2], m2, 3, null, { septJours: 'decision' }).decision, debut + 360 * H);
});

test('Cycle suivant : depuis la décision du cycle 3 ; décision non saisie : début de la mesure et avertissement', () => {
  const d3 = debut + 300 * H, m = mesure({ 2: { DECISION: { date: debut + 150 * H } }, 3: { DECISION: { date: d3 } } });
  assert.equal(R.echeances([m], m, 4, null, { septJours: 'decision' }).decision, d3 + 168 * H);
  const sans = mesure({});
  const e = R.echeances([sans], sans, 3, null, { septJours: 'decision' });
  assert.equal(e.decisionManquante, true);
  assert.equal(e.decision, debut + 360 * H);
});

test('Contention : non concernée (pas de rythme des mesures longues)', () => {
  const m = mesure({ 2: { DECISION: { date: debut + 100 * H } } }, 'Contention');
  const a = R.echeances([m], m, 3, null, { septJours: 'decision' }), b = R.echeances([m], m, 3, null, { septJours: 'debut' });
  assert.deepEqual(a, b);
});

test('Réglage de l’établissement : recommandé par défaut, méthode du classeur au choix', () => {
  const M = require('../app/js/model.js');
  assert.equal(M.optionsCas({}).septJours, 'decision');
  assert.equal(M.optionsCas({ casParticuliers: { septJours: 'debut' } }).septJours, 'debut');
  assert.equal(M.optionsCas({ casParticuliers: { septJours: 'nimporte' } }).septJours, 'decision');
});
