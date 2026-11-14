// SPDX-License-Identifier: EUPL-1.2
// Droit d'accès : données de l'Agenda et du Suivi médical, modules arrêtés compris (phase 4, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const A = require('../app/js/module-agenda.js');
SIC.medecins = require('../app/js/medecins.js');
const S = require('../app/js/module-suivi.js');

let n = 0;
const ev = (type, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 10, 8, n)).toISOString(), by: 'a1', type, data });

test('Agenda : événements du patient, intitulé seulement s’il est seul, dates d’un événement répété, supprimé signalé', () => {
  const st = A.reduire([
    ev('RDV', { id: 'R1', nature: 'entretien', titre: 'Entretien famille de P01 (fictif)', debut: Date.UTC(2026, 10, 12, 9), fin: Date.UTC(2026, 10, 12, 10), service: 'U1', patients: ['P01'] }),
    ev('RDV', { id: 'R2', nature: 'activite', titre: 'Atelier avec P01 et P02 (fictif)', debut: Date.UTC(2026, 10, 13, 14), service: 'U1', patients: ['P01', 'P02'] }),
    ev('RDV', { id: 'R3', nature: 'activite', titre: 'Piscine (fictif)', debut: Date.UTC(2026, 10, 3, 14), service: 'U1', patients: [], regularite: { type: 'semaine', jours: [2] } }),
    ev('PATIENT_INSCRIT', { rdv: 'R3', patient: 'P01', occurrence: '2026-11-17' }),
    ev('RDV', { id: 'R4', nature: 'examen', debut: Date.UTC(2026, 10, 14, 9), service: 'U1', patients: ['P02'] }),
    ev('RDV', { id: 'R5', nature: 'accompagnement', debut: Date.UTC(2026, 10, 15, 9), service: 'U1', patients: ['P01'] }), ev('RDV', { id: 'R5', supprime: true })
  ]);
  const l = A.droitAcces(st, 'P01');
  assert.deepEqual(l.map((x) => [x.nature, x.titre, x.supprime]), [['Activité thérapeutique', 'Piscine (fictif)', false], ['Entretien', 'Entretien famille de P01 (fictif)', false], ['Activité thérapeutique', '', false], ['Accompagnement', '', true]]);
  assert.deepEqual(l[0].dates, ['2026-11-17']);
  assert.equal(l[0].repete, true);
  assert.equal(A.droitAcces(st, 'P09').length, 0);
});

test('Suivi médical : entretiens et contrats du patient, saisie annulée écartée', () => {
  const st = S.reduire([ev('SUIVI', { id: 'S1', patient: 'P01', service: 'U1', date: '2026-11-10', medecin: 'Dr Arnaud (fictif)', quoi: 'entretien' }), ev('SUIVI', { id: 'S2', patient: 'P01', service: 'U1', date: '2026-11-12', quoi: 'contrat' }),
    ev('SUIVI', { id: 'S2', annule: true }), ev('SUIVI', { id: 'S3', patient: 'P02', service: 'U1', date: '2026-11-12', quoi: 'entretien' })]);
  assert.deepEqual(S.suivisDe(st, 'P01').map((x) => x.id), ['S1']);
});
