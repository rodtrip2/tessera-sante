// SPDX-License-Identifier: EUPL-1.2
// Agenda 0.10.0 (décisions du porteur du 7 novembre 2026) : répétitions étendues, accompagnateurs à inscrire,
// entretiens, permissions de sortie à faire valider selon le mode d'hospitalisation, couleurs ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
globalThis.SIC.model = require('../app/js/model.js');
globalThis.SIC.modules = require('../app/js/modules.js');
require('../app/js/module-patients.js');
require('../app/js/module-isocont.js');
const A = require('../app/js/module-agenda.js');
const j = (s) => A.depuisISO(s);

test('Répétition : 1er mardi du mois, dernier week-end du mois, mardi et vendredi, toutes les 2 semaines', () => {
  // Novembre 2026 : 1er mardi le 3 ; décembre : le 1er
  assert.deepEqual(A.datesOccurrences(j('2026-11-03'), { type: 'rangMois', rang: 1, jour: 2 }, j('2026-11-01'), j('2027-01-01')), ['2026-11-03', '2026-12-01']);
  // Dernier vendredi
  assert.deepEqual(A.datesOccurrences(j('2026-11-01'), { type: 'rangMois', rang: -1, jour: 5 }, j('2026-11-01'), j('2027-01-01')), ['2026-11-27', '2026-12-25']);
  // Dernier week-end : samedi et dimanche (le dimanche 1er novembre 2026 suit le samedi 31 octobre)
  assert.deepEqual(A.datesOccurrences(j('2026-10-01'), { type: 'weekendMois', rang: -1 }, j('2026-10-01'), j('2026-12-01')), ['2026-10-31', '2026-11-01', '2026-11-28', '2026-11-29']);
  // Mardi et vendredi
  assert.deepEqual(A.datesOccurrences(j('2026-11-09'), { type: 'semaine', jours: [2, 5] }, j('2026-11-09'), j('2026-11-23')), ['2026-11-10', '2026-11-13', '2026-11-17', '2026-11-20']);
  // Toutes les deux semaines, le lundi
  assert.deepEqual(A.datesOccurrences(j('2026-11-09'), { type: 'semaine', jours: [1], intervalle: 2 }, j('2026-11-09'), j('2026-12-08')), ['2026-11-09', '2026-11-23', '2026-12-07']);
  // Répétition d'avant 0.10.0 : inchangée (pas de champs ajoutés)
  assert.deepEqual(A.regularite({ type: 'semaine', jours: [1] }), { type: 'semaine', jours: [1], jusquAu: '' });
  assert.equal(A.libelleRepetition({ type: 'rangMois', rang: 1, jour: 2 }), 'le 1er mardi du mois');
  assert.equal(A.libelleRepetition({ type: 'weekendMois', rang: -1 }), 'le dernier week-end du mois');
  assert.equal(A.libelleRepetition({ type: 'semaine', jours: [5, 2] }), 'chaque mardi et vendredi');
});

test('Accompagnateurs : nombre nécessaire, prévus, inscriptions et désinscriptions (chacun pour soi)', () => {
  const st = A.reduire([
    { id: 'e1', at: '2026-11-07T08:00:00Z', by: 'u1', type: 'RDV', data: { id: 'R1', nature: 'accompagnement', titre: 'Piscine', debut: j('2026-11-10') + 14 * 36e5, fin: j('2026-11-10') + 16 * 36e5, service: 'U1', accompagnateurs: 2, professionnels: [{ id: 'u1', nom: 'IDE A (fictif)' }] } },
    { id: 'e2', at: '2026-11-07T08:01:00Z', by: 'u2', type: 'INSCRIPTION', data: { rdv: 'R1', occurrence: '2026-11-10', agent: 'u2', nom: 'AS B (fictif)' } },
    { id: 'e3', at: '2026-11-07T08:02:00Z', by: 'u3', type: 'INSCRIPTION', data: { rdv: 'R1', occurrence: '2026-11-10', agent: 'u3', nom: 'IDE C (fictif)' } },
    { id: 'e4', at: '2026-11-07T08:03:00Z', by: 'u3', type: 'INSCRIPTION', data: { rdv: 'R1', occurrence: '2026-11-10', agent: 'u3', retrait: true } }
  ]);
  const a = A.accompagnateurs(st.rdv.R1, '2026-11-10');
  assert.deepEqual([a.requis, a.prevus, a.inscrits.length, a.total, a.manque], [2, 1, 1, 2, 0]);
  assert.equal(A.accompagnateurs(st.rdv.R1, '2026-11-11').manque, 1);
  const permis = A.contrat.saisies.permisPourSoi;
  assert.ok(permis('INSCRIPTION', { agent: 'u2' }, { id: 'u2' }));
  assert.ok(!permis('INSCRIPTION', { agent: 'u3' }, { id: 'u2' }), 'on n’inscrit pas un autre agent');
});

test('Permission de sortie : échéance de validation selon le mode (48 h SDRE, 24 h SDT, dernier moment SL), validée', () => {
  const fiches = {
    P1: { id: 'P1', service: 'U1', modes: [{ date: 0, mode: 'SDRE' }] },
    P2: { id: 'P2', service: 'U1', modes: [{ date: 0, mode: 'SL' }] },
    P3: { id: 'P3', service: 'U1', modes: [{ date: 0, mode: 'SDT' }] }
  };
  const maintenant = j('2026-11-09') + 9 * 36e5, debut = j('2026-11-11') + 14 * 36e5;   // mercredi 14 h
  const evts = ['P1', 'P2', 'P3'].map((p, i) => ({ id: 'e' + i, at: '2026-11-07T08:00:0' + i + 'Z', by: 'u1', type: 'RDV', data: { id: 'R' + p, nature: 'permission', statut: 'demande', titre: 'Permission (fictif)', debut, fin: debut + 4 * 36e5, service: 'U1', patients: [p] } }));
  const config = { modesHospitalisation: globalThis.SIC.model.CONFIG_DEFAUT.modesHospitalisation };
  let l = A.permissionsAValider(A.reduire(evts), fiches, config, ['U1'], maintenant);
  const par = Object.fromEntries(l.map((x) => [x.rdv.id, x]));
  assert.equal(par.RP1.echeance, debut - 48 * 36e5); assert.equal(par.RP1.niveau, 'proche');
  assert.equal(par.RP3.echeance, debut - 24 * 36e5); assert.equal(par.RP3.niveau, 'attente');
  assert.equal(par.RP2.echeance, debut);
  assert.equal(A.permissionsAValider(A.reduire(evts), fiches, config, ['U1'], debut - 47 * 36e5).find((x) => x.rdv.id === 'RP1').niveau, 'retard');
  // Délai réglé par l'établissement
  config.agenda = { delaisPermission: { SDT: 72 } };
  assert.equal(A.permissionsAValider(A.reduire(evts), fiches, config, ['U1'], maintenant).find((x) => x.rdv.id === 'RP3').niveau, 'retard');
  // Validée (signée) : plus d'alerte
  evts.push({ id: 'v', at: '2026-11-09T10:00:00Z', by: 'u1', type: 'RDV', data: { id: 'RP1', statut: 'validee', validation: { par: 'Dr A (fictif)', le: '2026-11-09T10:00:00Z' }, service: 'U1' } });
  l = A.permissionsAValider(A.reduire(evts), fiches, config, ['U1'], maintenant);
  assert.ok(!l.some((x) => x.rdv.id === 'RP1'));
});

test('Couleurs par type : défaut, personnalisées, valeur invalide ignorée ; entretien médical ou infirmier gardé', () => {
  const o = A.optionsAgenda({ agenda: { couleurs: { entretien: '#123ABC', reunion: 'rouge' } } });
  assert.equal(o.couleurs.entretien, '#123abc');
  assert.equal(o.couleurs.reunion, A.COULEURS_DEFAUT.reunion);
  assert.equal(o.couleurs.tache, A.COULEURS_DEFAUT.tache);
  const st = A.reduire([{ id: 'e', at: '2026-11-07T08:00:00Z', by: 'u', type: 'RDV', data: { id: 'R', nature: 'entretien', entretien: { type: 'infirmier', avec: 'famille' }, professionnels: [{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }], debut: 1, service: 'U1' } }]);
  assert.deepEqual(st.rdv.R.entretien, { type: 'infirmier', avec: 'famille' });
  assert.equal(st.rdv.R.professionnels.length, 2);
});
