// SPDX-License-Identifier: EUPL-1.2
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/js/groupes.js');

const nuit = { code: 'nuit', libelle: 'Équipe de nuit (fictif)', services: ['U1'], membres: [{ id: 'a1', nom: 'Agent A (fictif)' }] };
const etab = { code: 'qualite', libelle: 'Groupe qualité (fictif)', services: [], membres: [{ id: 'a1', nom: 'Agent A (fictif)' }, { id: 'a2', nom: 'Agent B (fictif)' }] };

test('Groupes d’agents : lecture validée, groupes d’un agent, groupes d’un service', () => {
  const cfg = { groupes: [nuit, etab, { code: 'Mauvais code', libelle: 'x' }, { code: 'jour', libelle: 'Équipe de jour (fictif)', services: ['U2'], membres: [{ id: 'a1' }], actif: false }] };
  assert.deepEqual(G.liste(cfg).map((g) => g.code), ['nuit', 'qualite', 'jour']);
  assert.deepEqual(G.de(cfg, 'a1'), ['nuit', 'qualite']);   // groupe inactif ignoré
  assert.deepEqual(G.pourService(cfg, 'U2').map((g) => g.code), ['qualite']);
  assert.equal(G.libelle(cfg, 'nuit'), 'Équipe de nuit (fictif)');
});

test('Groupes d’agents : le cadre ne modifie que les groupes de ses services, l’administrateur tous', () => {
  const cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] }, admin = { id: 'ad', roles: ['ADMIN'] }, ide = { id: 'i1', roles: ['IDE'], services: ['U1'] };
  const modif = Object.assign({}, nuit, { membres: nuit.membres.concat([{ id: 'a3', nom: 'Agent C (fictif)' }]) });
  assert.ok(G.controler([nuit, etab], [modif, etab], cadre));
  assert.ok(G.controler([nuit, etab], [nuit, etab, { code: 'travail', libelle: 'Groupe de travail (fictif)', services: ['U1'], membres: [] }], cadre));
  assert.throws(() => G.controler([nuit, etab], [nuit], cadre), /administrateur ou le cadre/);   // retirer un groupe de l'établissement
  assert.throws(() => G.controler([nuit], [nuit, { code: 'u2', libelle: 'U2 (fictif)', services: ['U2'], membres: [] }], cadre), /cadre de ses services/);
  assert.throws(() => G.controler([nuit], [Object.assign({}, nuit, { services: ['U1', 'U2'] })], cadre), /cadre/);
  assert.ok(G.controler([nuit, etab], [], admin));
  assert.equal(G.modifiable(nuit, ide), false);
});
