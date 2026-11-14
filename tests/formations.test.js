// SPDX-License-Identifier: EUPL-1.2
// Module Formations (lot C, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const F = require('../app/js/module-formations.js');
const V = require('../app/js/validations.js');

let n = 0;
const ev = (by, type, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 10, 8, n)).toISOString(), by, type, data });
const cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] }, ide = { id: 'i1', roles: ['IDE'], services: ['U1'] }, ide2 = { id: 'i2', roles: ['IDE'], services: ['U1'] }, sec = { id: 's1', roles: ['SECRETAIRE'], services: ['U1'] };
const comptes = [cadre, ide, ide2, sec, { id: 'i3', roles: ['IDE'], services: ['U1'] }];

test('Sessions, inscriptions, places, liste d’attente, place libérée proposée au suivant, départs', () => {
  const evts = [ev('c1', 'FORMATION_SESSION', { id: 'S1', intitule: 'AFGSU (fictif)', debut: '2026-12-01', fin: '2026-12-02', places: 1, service: 'U1' }),
    ev('i1', 'FORMATION_INSCRIPTION', { id: 'I1', session: 'S1', service: 'U1', nom: 'Agent A' }), ev('i2', 'FORMATION_INSCRIPTION', { id: 'I2', session: 'S1', service: 'U1', nom: 'Agent B' }),
    ev('i3', 'FORMATION_INSCRIPTION', { id: 'I3', session: 'S1', service: 'U1', nom: 'Agent C' }),
    ev('c1', 'FORMATION_DECISION', { inscription: 'I1', decision: 'valide' }), ev('c1', 'FORMATION_DECISION', { inscription: 'I3', decision: 'attente' }), ev('c1', 'FORMATION_DECISION', { inscription: 'I2', decision: 'attente' })];
  let st = F.reduire(evts);
  assert.deepEqual(F.places(st, 'S1').attente.map((i) => i.id), ['I3', 'I2']);
  assert.equal(F.rang(st, st.inscriptions.I2), 2);
  assert.throws(() => F.controler('FORMATION_DECISION', { inscription: 'I3', decision: 'valide' }, { etat: st, config: {}, compte: cadre, comptes }), /Plus de place/);
  assert.equal(F.propositions(st, '2026-11-10').length, 0);
  st = F.reduire(evts.concat([ev('i1', 'FORMATION_DESISTEMENT', { inscription: 'I1' })]));
  const pr = F.propositions(st, '2026-11-10');
  assert.deepEqual([pr.length, pr[0].suivant.id], [1, 'I3']);
  assert.doesNotThrow(() => F.controler('FORMATION_DECISION', { inscription: 'I3', decision: 'valide' }, { etat: st, config: {}, compte: cadre, comptes }));
  st = F.reduire(evts.concat([ev('c1', 'FORMATION_DECISION', { inscription: 'I3', decision: 'valide' })]).filter((e) => !(e.type === 'FORMATION_DECISION' && e.data.inscription === 'I1')));
  const dep = F.departs(st, new Date(2026, 11, 1).getTime(), new Date(2026, 11, 3).getTime());
  assert.deepEqual(dep.map((a) => [a.agent, a.categorie, a.source]), [['i3', 'formation', 'formations']]);
  assert.equal(F.tableauAnnuel(st, 2026, ['U1'])[0].mois[11].length, 1);
  assert.equal(st.avis.filter((a) => a.agent === 'i3').length, 2);   // liste d'attente puis validée
});

test('Contrôles : validateur, motif du refus, déjà inscrit, date limite, désistement, enregistrement dans le logiciel', () => {
  const st = F.reduire([ev('c1', 'FORMATION_SESSION', { id: 'S1', intitule: 'X', debut: '2026-12-01', places: 0, service: 'U1', limite: '2026-11-01' }),
    ev('c1', 'FORMATION_SESSION', { id: 'S2', intitule: 'Y', debut: '2026-12-05', places: 0, service: 'U1' }),
    ev('i1', 'FORMATION_INSCRIPTION', { id: 'I1', session: 'S2', service: 'U1', roles: ['IDE'] })]);
  const ctx = (c) => ({ etat: st, config: {}, compte: c, comptes, aujourdhui: '2026-11-10' });
  assert.throws(() => F.controler('FORMATION_INSCRIPTION', { id: 'I9', session: 'S1' }, ctx(ide2)), /date limite/);
  assert.throws(() => F.controler('FORMATION_INSCRIPTION', { id: 'I9', session: 'S2' }, ctx(ide)), /déjà inscrit/);
  assert.throws(() => F.controler('FORMATION_DECISION', { inscription: 'I1', decision: 'valide' }, ctx(ide2)), /ne validez pas/);
  assert.throws(() => F.controler('FORMATION_DECISION', { inscription: 'I1', decision: 'refuse' }, ctx(cadre)), /motif/);
  assert.throws(() => F.controler('FORMATION_DESISTEMENT', { inscription: 'I1' }, ctx(ide2)), /Seul l’agent/);
  assert.doesNotThrow(() => F.controler('FORMATION_DESISTEMENT', { inscription: 'I1' }, ctx(ide)));
  assert.throws(() => F.controler('FORMATION_SESSION', { id: 'S3', intitule: 'Z', debut: '2026-12-01', service: 'U2' }, ctx(cadre)), /ses services/);
  const st2 = F.reduire(st.__evts || []);
  const v = F.reduire([ev('c1', 'FORMATION_SESSION', { id: 'S2', intitule: 'Y', debut: '2026-12-05', service: 'U1' }), ev('i1', 'FORMATION_INSCRIPTION', { id: 'I1', session: 'S2', service: 'U1' }), ev('c1', 'FORMATION_DECISION', { inscription: 'I1', decision: 'valide' })]);
  assert.equal(F.aEnregistrer(v, {}, ['SECRETAIRE'], ['U1']).length, 1);
  assert.equal(F.aEnregistrer(v, { formations: { rolesGtt: ['CADRE'] } }, ['SECRETAIRE'], ['U1']).length, 0);
  assert.equal(F.aEnregistrer(v, { formations: { etapeGtt: false } }, ['CADRE'], ['U1']).length, 0);
  assert.doesNotThrow(() => F.controler('FORMATION_ENREGISTREE', { inscription: 'I1' }, { etat: v, config: {}, compte: sec, comptes }));
  assert.equal(F.permisPourSoi('FORMATION_ENREGISTREE', { inscription: 'I1' }, sec, { etat: v, config: {}, comptes }), true);
  assert.equal(st2.sessions !== undefined, true);
});

test('Fonction soumise à avis : livrée désactivée, module masqué tant qu’elle l’est', () => {
  assert.equal(V.etat({}, 'formations').etat, 'desactive');
  assert.equal(V.moduleAutorise('formations', {}), false);
  assert.equal(V.moduleAutorise('formations', { validations: { etats: { formations: { etat: 'accord', date: '2026-11-14', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-13' } } } }), true);
});
