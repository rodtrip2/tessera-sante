// SPDX-License-Identifier: EUPL-1.2
// Mesure d'usage anonyme (lot O, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
const G = require('../app/js/usage.js');
const V = require('../app/js/validations.js');

const maintenant = Date.parse('2026-11-18T10:00:00+01:00');   // mercredi, semaine 47
const mods = [{ id: 'agenda', libelle: 'Agenda (fictif)' }, { id: 'travaux', libelle: 'Travaux (fictif)' }];
const saisie = (module, iso, by) => ({ module, at: new Date(Date.parse(iso)).toISOString(), by });

test('Semaines : lundi à lundi, numéros ISO, la semaine en cours en dernier', () => {
  assert.equal(G.numeroSemaine(Date.parse('2026-01-01T12:00:00+01:00')), 1);
  assert.equal(G.numeroSemaine(Date.parse('2026-11-16T12:00:00+01:00')), 47);
  assert.equal(G.numeroSemaine(Date.parse('2026-12-31T12:00:00+01:00')), 53);
  const m = G.mesurer([], mods, maintenant, { semaines: 4 });
  assert.equal(m.semaines.length, 4);
  assert.match(m.semaines[3].libelle, /^S47 \(16\/11\)$/);
  assert.match(m.semaines[0].libelle, /^S44 /);
});

test('Comptes par module et par semaine ; saisies hors période ou d’un module inconnu ignorées', () => {
  const l = [
    saisie('agenda', '2026-11-16T08:00:00+01:00', 'a1'), saisie('agenda', '2026-11-18T09:00:00+01:00', 'a2'), saisie('travaux', '2026-11-10T09:00:00+01:00', 'a1'),
    saisie('agenda', '2026-11-15T23:30:00+01:00', 'a3'),   // dimanche soir : semaine précédente
    saisie('agenda', '2026-01-05T09:00:00+01:00', 'a1'),   // hors période
    saisie('inconnu', '2026-11-17T09:00:00+01:00', 'a1')
  ];
  const m = G.mesurer(l, mods, maintenant, { semaines: 4 });
  assert.deepEqual(m.modules[0].comptes, [0, 0, 1, 2]);
  assert.deepEqual(m.modules[1].comptes, [0, 0, 1, 0]);
  assert.deepEqual([m.modules[0].total, m.modules[1].total], [3, 1]);
});

test('Agents ayant saisi : nombre seulement, masqué sous le seuil, jamais d’identité', () => {
  const l = ['a1', 'a2', 'a3', 'a1'].map((by) => saisie('agenda', '2026-11-17T09:00:00+01:00', by)).concat([saisie('agenda', '2026-11-10T09:00:00+01:00', 'a1'), saisie('travaux', '2026-11-10T10:00:00+01:00', 'a2')]);
  const m = G.mesurer(l, mods, maintenant, { semaines: 2 });
  assert.deepEqual(m.agents, [null, 3]);
  assert.ok(!JSON.stringify(m).includes('a1'), 'aucun identifiant d’agent dans la mesure');
  const csv = G.lignesExport(m);
  assert.deepEqual(csv[csv.length - 1].slice(0, 3), ['Agents ayant saisi', 'moins de 3', 3]);
});

test('Fonction soumise à avis, livrée désactivée (représentants du personnel, délégué)', () => {
  const f = V.fonction('mesure-usage');
  assert.deepEqual([f.existante, f.interlocuteurs], [false, ['representants', 'dpo']]);
  assert.equal(V.etat({}, 'mesure-usage').etat, 'desactive');
  assert.equal(V.actif({}, 'mesure-usage'), false);
  assert.ok(!V.aRappeler({}).some((x) => x.code === 'mesure-usage'), 'désactivée : pas de rappel');
});
