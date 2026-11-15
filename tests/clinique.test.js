// SPDX-License-Identifier: EUPL-1.2
// Données cliniques du séjour : feuille de staff clinique, dépendance AVQ, notes (phase 5, 15 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js'), validations: require('../app/js/validations.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const K = require('../app/js/module-clinique.js');
const ACTIF = { validations: { etats: { 'dossier-clinique': { etat: 'accord', date: '2026-11-15', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-14' } } } };
let n = 0;
const ev = (by, type, data) => ({ v: 1, id: 'e' + (++n), at: new Date(Date.UTC(2026, 10, 10, 8, n)).toISOString(), by, type, data });

test('Feuille de staff : codes CIM libres, motif, projet, dépendance AVQ (score), versions gardées', () => {
  const st = K.reduire([ev('i1', 'CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S2', service: 'U1', cim: [{ code: 'f20.0', libelle: 'Code fictif' }, { code: '' }], motif: 'Motif fictif', avq: { habillage: 2, deplacement: 1, alimentation: 1, continence: 1, comportement: 3, communication: 5 } }),
    ev('m1', 'CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S2', projet: 'Projet fictif', avq: { habillage: 2, deplacement: 1, alimentation: 1, continence: 1, comportement: 3, communication: 2 } })]);
  const x = K.sejour(st, 'P1', 'S2');
  assert.deepEqual(x.staff.cim, [{ code: 'F20.0', libelle: 'Code fictif' }]);
  assert.equal(x.staff.motif, 'Motif fictif');            // gardé quand la saisie suivante ne le reprend pas
  assert.equal(x.staff.projet, 'Projet fictif');
  assert.equal(K.score(x.staff.avq), 10);
  assert.equal(K.score({ habillage: 1 }), null);
  assert.equal(x.historique.length, 1);
  assert.equal(x.historique[0].avq.communication, undefined);   // cotation 5 refusée à la lecture
});

test('Séjour précédent rappelé pour référence (codes CIM et dépendance)', () => {
  const st = K.reduire([ev('i1', 'CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S1', cim: [{ code: 'F31.1' }], avq: { habillage: 1 } })]);
  const fiche = { id: 'P1', sejours: [{ id: 'S2', entree: '2026-11-01' }, { id: 'S1', entree: '2025-03-01', sortie: '2025-04-01' }, { id: 'S0', entree: '2024-01-01', sortie: '2024-02-01' }] };
  const p = K.precedent(st, fiche, 'S2');
  assert.equal(p.sejour.id, 'S1');
  assert.equal(p.staff.cim[0].code, 'F31.1');
  assert.equal(K.precedent(st, fiche, 'S1'), null);     // aucun séjour renseigné avant
});

test('Notes cliniques : ajoutées, retirées (masquées, jamais effacées) par l’auteur ou le cadre ; contrôles', () => {
  const evts = [ev('i1', 'CLINIQUE_NOTE', { patientId: 'P1', sejour: 'S2', id: 'N1', texte: 'Note fictive' }), ev('i1', 'CLINIQUE_NOTE', { patientId: 'P1', sejour: 'S2', id: 'N2', texte: 'Autre note fictive' })];
  let st = K.reduire(evts);
  const ide2 = { id: 'i2', roles: ['IDE'] }, cadre = { id: 'c1', roles: ['CADRE'] };
  assert.throws(() => K.controler('CLINIQUE_NOTE_RETRAIT', { patientId: 'P1', sejour: 'S2', id: 'N1', motif: 'x' }, { config: ACTIF, compte: ide2, etat: st }), /auteur/);
  assert.throws(() => K.controler('CLINIQUE_NOTE_RETRAIT', { patientId: 'P1', sejour: 'S2', id: 'N1', motif: '' }, { config: ACTIF, compte: cadre, etat: st }), /motif/);
  assert.doesNotThrow(() => K.controler('CLINIQUE_NOTE_RETRAIT', { patientId: 'P1', sejour: 'S2', id: 'N1', motif: 'Mauvais patient (fictif)' }, { config: ACTIF, compte: cadre, etat: st }));
  st = K.reduire(evts.concat([ev('c1', 'CLINIQUE_NOTE_RETRAIT', { patientId: 'P1', sejour: 'S2', id: 'N1', motif: 'Mauvais patient (fictif)' })]));
  assert.deepEqual(K.notesVisibles(K.sejour(st, 'P1', 'S2')).map((x) => x.id), ['N2']);
  assert.equal(K.sejour(st, 'P1', 'S2').notes.length, 2);
  assert.throws(() => K.controler('CLINIQUE_NOTE', { patientId: 'P1', sejour: 'S2', id: 'N3', texte: '' }, { config: ACTIF, etat: st }), /note/);
  assert.throws(() => K.controler('CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S2', avq: { habillage: 7 } }, { config: ACTIF, etat: st }), /1 à 4/);
  assert.throws(() => K.controler('CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S2', cim: [{ code: '', libelle: 'Sans code' }] }, { config: ACTIF, etat: st }), /Code CIM/);
  assert.throws(() => K.controler('CLINIQUE_STAFF', { patientId: 'P1', sejour: 'S2' }, { config: {}, etat: st }), /désactivée/);
});

test('Droits par défaut : IDE, cadre et médecins ; ni aide-soignant ni secrétaire ; fonction soumise à avis', () => {
  const D = K.droits, cfg = {};
  assert.equal(D.peut(['IDE'], K.LECTURE, cfg), true);
  assert.equal(D.peut(['MEDECIN'], 'CLINIQUE_NOTE', cfg), true);
  assert.equal(D.peut(['AS'], K.LECTURE, cfg), false);
  assert.equal(D.peut(['SECRETAIRE'], 'CLINIQUE_STAFF', cfg), false);
  assert.equal(D.membre(['AS'], cfg), false);
  assert.equal(SIC.validations.moduleAutorise('clinique', {}), false);
  assert.equal(SIC.validations.moduleAutorise('clinique', ACTIF), true);
});
