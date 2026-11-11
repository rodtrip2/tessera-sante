// SPDX-License-Identifier: EUPL-1.2
// Chambres et lits (0.29.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../app/js/chambres.js');

const config = { lieuxCSI: { U1: ['CSI 1'], U2: ['CSI A', 'CSI B'] }, chambres: { U1: { pieces: [
  { nom: '417', lits: ['P', 'F'] }, { nom: '412', lits: [] }, { nom: 'CSI 1', type: 'csi' }, { nom: 'Bureau', type: 'piece', nature: 'bureau', lits: ['X'] }, { nom: '417', lits: ['Z'] }] } } };
const sej = (id, service, chambre, lit, sortie) => ({ id, sejours: [{ id: 'S' + id, service, entree: '2026-11-01', chambre, lit, sortie }] });

test('Liste, lits, libellés, CSI (reprise des lieux d’isolement tant que la liste n’est pas réglée)', () => {
  assert.deepEqual(K.lits(config, 'U1').map((l) => l.libelle), ['417 P', '417 F', '412', 'CSI 1']);   // pièce sans lit ; nom en double écarté
  assert.equal(K.lits(config, 'U1').find((l) => l.libelle === 'CSI 1').csi, true);
  assert.deepEqual(K.lieuxCSI(config, 'U1'), ['CSI 1']);
  assert.deepEqual(K.lieuxCSI(config, 'U2'), ['CSI A', 'CSI B']);   // liste pas encore réglée
  assert.deepEqual(K.listeDepart(config, 'U2').pieces.map((p) => [p.nom, p.type]), [['CSI A', 'csi'], ['CSI B', 'csi']]);
  assert.equal(K.liste(config, 'U3'), null);
});

test('Import : rattachement aux lits existants', () => {
  assert.equal(K.trouver(config, 'U1', '417', 'P').libelle, '417 P');
  assert.equal(K.trouver(config, 'U1', '417P', '').libelle, '417 P');
  assert.equal(K.trouver(config, 'U1', '417-f', '').libelle, '417 F');
  assert.equal(K.trouver(config, 'U1', '412', '').libelle, '412');
  assert.equal(K.trouver(config, 'U1', '417', ''), null);   // chambre double sans lit : à rattacher à la main
  assert.equal(K.trouver(config, 'U1', '999', ''), null);
});

test('Occupation : un lit, un patient ; conflits ; lits libres ; ordre d’écriture d’une cascade', () => {
  const fiches = { A: sej('A', 'U1', '417', 'P'), B: sej('B', 'U1', '417', 'P'), C: sej('C', 'U1', '412', ''), D: sej('D', 'U1', '417', 'F', '2026-11-05') };
  assert.deepEqual(K.conflits(fiches, 'U1'), [{ cle: '417|P', patients: ['A', 'B'] }]);
  assert.equal(K.occupant(fiches, 'U1', '412', '', 'X').patient, 'C');
  assert.equal(K.occupant(fiches, 'U1', '417', 'F'), null);   // patient sorti
  assert.deepEqual(K.libres(config, fiches, 'U1').map((l) => l.libelle), ['417 F', 'CSI 1']);
  assert.deepEqual(K.libres(config, fiches, 'U1', ['C']).map((l) => l.libelle), ['417 F', '412', 'CSI 1']);
  assert.deepEqual(K.ordreEcriture([{ patient: 'A' }, { patient: 'B' }, { patient: 'C' }]).map((m) => m.patient), ['C', 'B', 'A']);
});

test('Historique des lits d’un séjour (module Patients)', () => {
  globalThis.self = globalThis; globalThis.SIC = globalThis.SIC || {};
  const P = require('../app/js/module-patients.js');
  const ev = (n, data) => ({ v: 1, id: 'e' + n, at: '2026-11-0' + n + 'T08:00:00.000Z', by: 'u', type: n === 1 ? 'PATIENT' : 'SEJOUR', data });
  const st = P.reduire([ev(1, { patientId: 'P1', nom: 'ALPHA (fictif)', prenom: 'Camille' }), ev(2, { patientId: 'P1', sejourId: 'S1', entree: '2026-11-02', service: 'U1', chambre: '18', lit: 'P' }),
    ev(3, { patientId: 'P1', sejourId: 'S1', chambre: '12', lit: 'P' }), ev(4, { patientId: 'P1', sejourId: 'S1', sortiePrevue: null })]);
  const s = st.fiches.P1.sejours[0];
  assert.deepEqual(K.historique(s).map((m) => m.chambre + ' ' + m.lit), ['18 P', '12 P']);
});

test('Import du DPI : lits rattachés à la liste du service, lit inconnu signalé, correspondance mémorisée', () => {
  globalThis.self = globalThis; globalThis.SIC = globalThis.SIC || {}; SIC.chambres = K;
  const IP = require('../app/js/import-patients.js');
  const lignes = [['Nom', 'Prénom', 'Loc.'], ['ALPHA (fictif)', 'Camille', '417P'], ['BRAVO (fictif)', 'Dominique', 'X12'], ['CHARLIE (fictif)', 'Sacha', '412']];
  const modele = IP.appliquerModele(lignes, null);
  let a = IP.analyser(lignes, modele, {}, { service: 'U1', config });
  const v = (n) => a.lignes.find((r) => r.valeurs.nom === n);
  assert.deepEqual([v('ALPHA (FICTIF)').valeurs.chambre, v('ALPHA (FICTIF)').valeurs.lit], ['417', 'P']);
  assert.ok(v('BRAVO (FICTIF)').litInconnu);
  modele.lits = { 'U1|12|': '417|F' };   // « X12 » découpé en chambre 12
  a = IP.analyser(lignes, modele, {}, { service: 'U1', config });
  assert.deepEqual([v('BRAVO (FICTIF)').valeurs.chambre, v('BRAVO (FICTIF)').valeurs.lit], ['417', 'F']);
  assert.deepEqual(IP.modeleAMemoriser(modele).lits, { 'U1|12|': '417|F' });
});
