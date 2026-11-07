// SPDX-License-Identifier: EUPL-1.2
// Module Patients, liste réglable (0.10.0, décisions du porteur du 7 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../app/js/liste-patients.js');
const P = require('../app/js/module-patients.js');

const maintenant = new Date(2026, 10, 9, 10).getTime();   // 9 novembre 2026
const fiches = {
  A: { id: 'A', nom: 'ALPHA (fictif)', prenom: 'Lou', ipp: '1', service: 'U1', modes: [{ date: 0, mode: 'SDT' }], sejours: [{ id: 's', entree: '2026-10-01', service: 'U1', chambre: '12', lit: 'P' }], medecin1: 'Dr X (fictif)', psychologue: 'Mme P (fictif)' },
  B: { id: 'B', nom: 'BRAVO (fictif)', prenom: 'Sam', ipp: '2', service: 'U1', modes: [{ date: 0, mode: 'SL' }], sejours: [{ id: 's', entree: '2026-10-20', sortie: '2026-11-06', service: 'U1', chambre: '2' }] },
  C: { id: 'C', nom: 'CHARLIE (fictif)', prenom: 'Noa', ipp: '3', service: 'U1', modes: [{ date: 0, mode: 'SDRE' }], sejours: [{ id: 's', entree: '2026-08-01', sortie: '2026-09-01', service: 'U1', chambre: '3' }] },
  D: { id: 'D', nom: 'DELTA (fictif)', prenom: 'Eden', ipp: '4', service: 'U2', modes: [], sejours: [{ id: 's', entree: '2026-11-01', service: 'U2', chambre: '2' }] },
  E: { id: 'E', nom: 'ECHO (fictif)', prenom: 'Alix', ipp: '5', service: 'U1', modes: [{ date: 0, mode: 'SPI' }] }   // sans séjour : hospitalisé
};
const ids = (ls) => ls.map((l) => l.p.id);

test('Périmètre : hospitalisés, avec les sorties récentes (7 jours par défaut), tous ; service', () => {
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'hospitalises' }, { maintenant, services: ['U1'] })), ['A', 'E']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'recents' }, { maintenant, services: ['U1'] })), ['A', 'B', 'E']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'recents' }, { maintenant, services: ['U1'], joursRecents: 2 })), ['A', 'E']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'tous' }, { maintenant, services: ['U1'] })), ['A', 'B', 'C', 'E']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'tous' }, { maintenant })), ['A', 'B', 'C', 'D', 'E']);
});

test('Tri, recherche, filtres, affichage par chambre (ordre naturel des numéros)', () => {
  const r = { perimetre: 'tous', tri: 'chambre' };
  assert.deepEqual(ids(L.lignes(fiches, r, { maintenant })), ['B', 'D', 'C', 'A', 'E']);
  assert.deepEqual(ids(L.lignes(fiches, Object.assign({}, r, { sens: -1 }), { maintenant })), ['E', 'A', 'C', 'B', 'D']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'tous' }, { maintenant, recherche: 'brav' })), ['B']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'tous', filtres: { modes: ['SDT', 'SDRE'] } }, { maintenant })), ['A', 'C']);
  assert.deepEqual(ids(L.lignes(fiches, { perimetre: 'tous', filtres: { referent: 'Mme P (fictif)' } }, { maintenant })), ['A']);
  const g = L.parChambre(L.lignes(fiches, { perimetre: 'tous', regroupement: 'chambre' }, { maintenant }));
  assert.deepEqual(g.map((x) => x.chambre), ['2', '3', '12', '']);
  assert.deepEqual(g[0].lignes.map((l) => l.p.id), ['B', 'D']);
});

test('Réglages : affichage validé, vues par défaut par service et métier, couleurs des modes', () => {
  const r = L.reglage({ perimetre: 'x', colonnes: ['mode', 'inconnue', 'mode'], coloration: 'ligne' });
  assert.equal(r.perimetre, 'hospitalises'); assert.deepEqual(r.colonnes, ['patient', 'mode']); assert.equal(r.coloration, 'ligne');
  // Fournies : la vue « Isolement et contention » en fait partie
  assert.ok(L.options({}).vues.some((v) => v.id === 'isocont'));
  const config = { patientsListe: { joursRecents: 14, couleursModes: { SDT: '#ABCDEF', SL: 'vert' }, vues: [
    { id: 'v1', nom: 'IDE de U1', services: ['U1'], roles: ['IDE'], reglage: { perimetre: 'recents' } },
    { id: 'v2', nom: 'Tous', services: [], roles: [], reglage: {} },
    { id: 'v3', nom: 'Secrétariat', services: [], roles: ['SECRETAIRE'], reglage: { perimetre: 'tous' } }] } };
  const o = L.options(config);
  assert.equal(o.joursRecents, 14); assert.equal(o.couleursModes.SDT, '#abcdef'); assert.equal(o.couleursModes.SL, L.COULEURS_MODES_DEFAUT.SL);
  assert.deepEqual(L.vuesPour(config, ['U1'], ['IDE']).map((v) => v.id), ['v1', 'v2']);
  assert.deepEqual(L.vuesPour(config, ['U2'], ['SECRETAIRE']).map((v) => v.id), ['v2', 'v3']);
});

test('Fiche : psychologue référent et suivi par l’assistant(e) social(e), datés dans l’historique', () => {
  const st = P.reduire([
    { id: 'e1', at: '2026-11-01T08:00:00Z', by: 'u', type: 'PATIENT', data: { patientId: 'A', nom: 'ALPHA (fictif)', psychologue: 'Mme P (fictif)', suiviAS: { suivi: true, nom: '' } } },
    { id: 'e2', at: '2026-11-05T08:00:00Z', by: 'u', type: 'PATIENT', data: { patientId: 'A', psychologue: 'M. Q (fictif)', suiviAS: { suivi: true, nom: 'Mme S (fictif)' } } }
  ]);
  const f = st.fiches.A;
  assert.equal(f.psychologue, 'M. Q (fictif)');
  assert.deepEqual(f.suiviAS, { suivi: true, nom: 'Mme S (fictif)' });
  assert.equal(f.historique.psychologue.length, 2);
  assert.equal(P.valeurAu(f, 'psychologue', Date.parse('2026-11-03T00:00:00Z')), 'Mme P (fictif)');
});
