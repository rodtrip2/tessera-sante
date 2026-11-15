// SPDX-License-Identifier: EUPL-1.2
// Accès aux données cliniques et bris de glace (phase 5, 15 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { validations: require('../app/js/validations.js') });
const AC = require('../app/js/acces-clinique.js');
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.modules = require('../app/js/modules.js'); SIC.champs = require('../app/js/champs.js'); SIC.formalites = require('../app/js/formalites.js');
const P = require('../app/js/module-patients.js');

const ACTIF = { validations: { etats: { 'bris-de-glace': { etat: 'accord', date: '2026-11-15', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-14' } } } };
const local = (h, m) => new Date(2026, 10, 15, h, m || 0).getTime();
const POSTES = [{ debut: '07:00', fin: '14:00' }, { debut: '14:00', fin: '21:00' }, { debut: '21:00', fin: '07:00' }];

test('Réglages : défauts, par service, rôles du bris de glace seulement si la fonction est activée', () => {
  assert.deepEqual(AC.options({}, 'U1'), { presents: [], bris: { roles: ['IDE', 'AS'], duree: 'poste' } });
  const cfg = Object.assign({ accesClinique: { '*': { presents: ['AS'], bris: { roles: ['IDE'], duree: 60 } }, U2: { bris: { roles: ['AS'], duree: 5 } } } }, ACTIF);
  assert.deepEqual(AC.options(cfg, 'U1'), { presents: ['AS'], bris: { roles: ['IDE'], duree: 60 } });
  assert.deepEqual(AC.options(cfg, 'U2'), { presents: [], bris: { roles: ['AS'], duree: 'poste' } });   // durée invalide : défaut
  assert.deepEqual(AC.rolesBris(cfg).sort(), ['AS', 'IDE']);
  assert.deepEqual(AC.rolesBris({ accesClinique: cfg.accesClinique }), []);     // fonction désactivée (onglet Validations)
  assert.equal(AC.peutBriser(cfg, ['IDE'], 'U1'), true);
  assert.equal(AC.peutBriser(cfg, ['IDE'], 'U2'), false);
});

test('Durée : jusqu’à la fin du poste en cours (passage de minuit compris), ou en minutes', () => {
  assert.equal(AC.fin(local(10, 30), 'poste', POSTES), local(14));
  assert.equal(AC.fin(local(23, 0), 'poste', POSTES), new Date(2026, 10, 16, 7, 0).getTime());
  assert.equal(AC.fin(local(10, 0), 60, POSTES), local(11));
  assert.equal(AC.fin(local(10, 0), 'poste', []), local(18));   // sans poste : 8 heures
});

test('Accès : rôle lecteur, limité aux patients présents, bris de glace en cours', () => {
  const cfg = Object.assign({ accesClinique: { '*': { presents: ['AS'] } } }, ACTIF);
  const bris = { B1: { id: 'B1', agent: 'a2', patientId: 'P1', fin: new Date(local(14)).toISOString() } };
  const base = { config: cfg, service: 'U1', bris, patientId: 'P1', maintenant: local(10) };
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['IDE'], lecteur: true, present: false, agent: 'a1' })), { ok: true, raison: 'role' });
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['AS'], lecteur: true, present: true, agent: 'a1' })), { ok: true, raison: 'role' });
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['AS'], lecteur: true, present: false, agent: 'a1' })), { ok: false, raison: 'absent' });
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['AS'], lecteur: true, present: false, agent: 'a2' })), { ok: true, raison: 'bris' });
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['IDE', 'AS'], lecteur: true, present: false, agent: 'a1' })), { ok: true, raison: 'role' });   // un rôle non limité suffit
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['SECRETAIRE'], lecteur: false, present: true, agent: 'a2' })), { ok: true, raison: 'bris' });
  assert.deepEqual(AC.acces(Object.assign({}, base, { roles: ['SECRETAIRE'], lecteur: false, present: true, agent: 'a2', maintenant: local(15) })), { ok: false, raison: 'aucun' });   // bris échu
});

test('Saisies du module Patients : bris de glace justifié, fin par l’agent, relecture par le cadre du service', () => {
  let n = 0;
  const ev = (by, type, data) => ({ v: 1, id: 'e' + (++n), at: new Date(local(10, n)).toISOString(), by, type, data });
  const d = { id: 'BG1', patientId: 'P1', service: 'U1', justification: 'Patient agité, transmissions urgentes (fictif)', debut: new Date(local(10)).toISOString(), fin: new Date(local(14)).toISOString() };
  const ide = { id: 'a1', roles: ['IDE'], services: ['U1'] }, sec = { id: 's1', roles: ['SECRETAIRE'], services: ['U1'] }, cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] }, cadre2 = { id: 'c2', roles: ['CADRE'], services: ['U2'] };
  assert.throws(() => P.controler('BRIS_GLACE', d, { config: {}, compte: ide }), /désactivée/);
  assert.throws(() => P.controler('BRIS_GLACE', Object.assign({}, d, { justification: 'urgent' }), { config: ACTIF, compte: ide }), /Justifiez/);
  assert.throws(() => P.controler('BRIS_GLACE', d, { config: ACTIF, compte: sec }), /rôle/);
  assert.doesNotThrow(() => P.controler('BRIS_GLACE', d, { config: ACTIF, compte: ide }));
  assert.equal(P.contrat.saisies.permisPourSoi('BRIS_GLACE', d, ide, { config: ACTIF, etat: {} }), true);
  const st = P.reduire([ev('a1', 'BRIS_GLACE', d)]);
  assert.equal(st.bris.BG1.agent, 'a1');
  assert.ok(AC.brisEnCours(st.bris, 'a1', 'P1', local(11)));
  assert.throws(() => P.controler('BRIS_GLACE_FIN', { bris: 'BG1' }, { config: ACTIF, compte: cadre, etat: st }), /Seul l’agent/);
  assert.throws(() => P.controler('BRIS_GLACE_RELU', { bris: 'BG1' }, { config: ACTIF, compte: cadre2, etat: st }), /cadre du service/);
  assert.doesNotThrow(() => P.controler('BRIS_GLACE_RELU', { bris: 'BG1' }, { config: ACTIF, compte: cadre, etat: st }));
  const st2 = P.reduire([ev('a1', 'BRIS_GLACE', d), ev('a1', 'BRIS_GLACE_FIN', { bris: 'BG1' }), ev('c1', 'BRIS_GLACE_RELU', { bris: 'BG1', commentaire: 'Justifié (fictif)' })]);
  assert.equal(AC.brisEnCours(st2.bris, 'a1', 'P1', local(11)), null);
  assert.equal(st2.bris.BG1.relu.par, 'c1');
  assert.equal(AC.aRelire(st2.bris, ['U1']).length, 0);
  assert.equal(AC.duMois(st2.bris, '2026-11', ['U1']).length, 1);
  assert.throws(() => P.controler('BRIS_GLACE_RELU', { bris: 'BG1' }, { config: ACTIF, compte: cadre, etat: st2 }), /Déjà relu/);
});
