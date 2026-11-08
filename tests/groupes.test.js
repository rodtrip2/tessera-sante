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

test('Groupes d’agents : agent d’un autre service ajouté par le cadre, son cadre est informé', () => {
  const comptes = [
    { id: 'c1', nom: 'Cadre U1 (fictif)', roles: ['CADRE'], services: ['U1'] },
    { id: 'c2', nom: 'Cadre U2 (fictif)', roles: ['CADRE'], services: ['U2'] },
    { id: 'i2', nom: 'IDE U2 (fictif)', roles: ['IDE'], services: ['U2'] },
    { id: 'i1', nom: 'IDE U1 (fictif)', roles: ['IDE'], services: ['U1'] }
  ];
  const g = { code: 'qualite-u1', libelle: 'Qualité (fictif)', services: ['U1'], membres: [
    { id: 'i1', nom: 'IDE U1 (fictif)', ajoute: { par: 'c1', le: '2026-11-08T03:00:00Z' } },
    { id: 'i2', nom: 'IDE U2 (fictif)', ajoute: { par: 'c1', le: '2026-11-08T03:01:00Z' } }] };
  const cfg = { groupes: [g] };
  // Le cadre de l'Unité 1 peut l'enregistrer (le groupe reste de ses services)
  assert.ok(G.controler([], [g], comptes[0]));
  const av = G.avisMembresExterieurs(cfg, comptes, comptes[1], []);
  assert.deepEqual(av.map((a) => a.membre.id), ['i2']);
  assert.equal(G.avisMembresExterieurs(cfg, comptes, comptes[0], []).length, 0);   // auteur de l'ajout
  assert.equal(G.avisMembresExterieurs(cfg, comptes, comptes[2], []).length, 0);   // pas cadre
  assert.equal(G.avisMembresExterieurs(cfg, comptes, comptes[1], [av[0].id]).length, 0);
  assert.equal(G.liste(cfg)[0].membres[1].ajoute.par, 'c1');
});

test('Groupes d’agents : l’agent ajouté par un autre est informé', () => {
  const cfg = { groupes: [{ code: 'nuit', libelle: 'Équipe de nuit (fictif)', services: ['U1'], membres: [
    { id: 'i1', nom: 'IDE (fictif)', ajoute: { par: 'c1', le: '2026-11-08T03:00:00Z' } },
    { id: 'c1', nom: 'Cadre (fictif)', ajoute: { par: 'c1', le: '2026-11-08T03:00:00Z' } }] }] };
  const av = G.avisAjouts(cfg, { id: 'i1' }, []);
  assert.equal(av.length, 1);
  assert.equal(G.avisAjouts(cfg, { id: 'c1' }, []).length, 0);   // s'ajoute lui-même
  assert.equal(G.avisAjouts(cfg, { id: 'i1' }, [av[0].id]).length, 0);
});
