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

test('Répétitions généralisées (0.11.0) : mercredi tous les 15 jours, 1er dimanche du trimestre, dernier jour ouvré, tous les 3 jours, tous les 2 mois', () => {
  // Mercredi, tous les 15 jours (semaine, intervalle 2)
  assert.deepEqual(A.datesOccurrences(j('2026-11-04'), { type: 'semaine', jours: [3], intervalle: 2 }, j('2026-11-01'), j('2026-12-10')), ['2026-11-04', '2026-11-18', '2026-12-02']);
  assert.equal(A.libelleRepetition({ type: 'semaine', jours: [3], intervalle: 2 }), 'le mercredi, tous les 15 jours');
  // 1er dimanche du trimestre : 4 octobre 2026, 3 janvier 2027, 4 avril 2027
  assert.deepEqual(A.datesOccurrences(j('2026-10-01'), { type: 'rangPeriode', rang: 1, jour: 0, periode: 'trimestre' }, j('2026-10-01'), j('2027-05-01')), ['2026-10-04', '2027-01-03', '2027-04-04']);
  assert.equal(A.libelleRepetition({ type: 'rangPeriode', rang: 1, jour: 0, periode: 'trimestre' }), 'le 1er dimanche du trimestre');
  // Dernier vendredi du mois, dernier jour ouvré du mois, dernier jour de l'année
  assert.deepEqual(A.datesOccurrences(j('2026-11-01'), { type: 'rangPeriode', rang: -1, jour: 5, periode: 'mois' }, j('2026-11-01'), j('2027-01-01')), ['2026-11-27', '2026-12-25']);
  assert.deepEqual(A.datesOccurrences(j('2026-10-01'), { type: 'rangPeriode', rang: -1, jour: 'ouvre', periode: 'mois' }, j('2026-10-01'), j('2027-01-01')), ['2026-10-30', '2026-11-30', '2026-12-31']);
  assert.deepEqual(A.datesOccurrences(j('2026-01-01'), { type: 'rangPeriode', rang: -1, jour: 'jour', periode: 'annee' }, j('2026-06-01'), j('2027-06-01')), ['2026-12-31']);
  assert.equal(A.libelleRepetition({ type: 'rangPeriode', rang: -1, jour: 'ouvre', periode: 'mois' }), 'le dernier jour ouvré du mois');
  // 2e week-end du semestre
  assert.deepEqual(A.datesOccurrences(j('2026-07-01'), { type: 'rangPeriode', rang: 2, jour: 'weekend', periode: 'semestre' }, j('2026-07-01'), j('2027-02-01')), ['2026-07-11', '2026-07-12', '2027-01-09', '2027-01-10']);
  // Tous les 3 jours, tous les 2 mois
  assert.deepEqual(A.datesOccurrences(j('2026-11-01'), { type: 'jour', intervalle: 3 }, j('2026-11-01'), j('2026-11-11')), ['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10']);
  assert.deepEqual(A.datesOccurrences(j('2026-11-15'), { type: 'mois', intervalle: 2 }, j('2026-11-01'), j('2027-04-01')), ['2026-11-15', '2027-01-15', '2027-03-15']);
  // Répétitions de la version 0.10.0 relues à l'identique
  assert.deepEqual(A.regularite({ type: 'rangMois', rang: 1, jour: 2 }), { type: 'rangPeriode', jours: [], jusquAu: '', rang: 1, jour: 2, periode: 'mois' });
});

test('Éléments ajoutables (0.11.0) : transports à réserver, validations médicale et de permission, inscription d’un collègue et information reçue', () => {
  const fiches = { P1: { id: 'P1', service: 'U1', modes: [{ date: 0, mode: 'SDRE' }] } };
  const debut = j('2026-11-12') + 9 * 36e5, maintenant = j('2026-11-09') + 9 * 36e5, occ = '2026-11-12';
  const evts = [{ id: 'e1', at: '2026-11-08T08:00:00Z', by: 'cadre', type: 'RDV', data: { id: 'R1', nature: 'audience', titre: 'Audience (fictif)', debut, fin: debut + 2 * 36e5, service: 'U1', patients: ['P1'],
    transports: [{ id: 't1', type: 'vsl', nombre: 2 }], validations: [{ id: 'v1', type: 'permission' }, { id: 'v2', type: 'medicale', libelle: 'Avis du psychiatre', delai: 72 }], accompagnateurs: 2 } }];
  let st = A.reduire(evts);
  assert.equal(A.transportsAReserver(st, fiches, ['U1'], maintenant).length, 1);
  const v = A.aFaireValider(st, fiches, {}, ['U1'], maintenant);
  assert.deepEqual(v.map((x) => [x.validation.id, x.delai]), [['v2', 72], ['v1', 48]]);
  assert.equal(v[0].niveau, 'proche');
  assert.equal(A.accompagnateursManquants(st, fiches, ['U1'], maintenant).length, 1);
  assert.equal(A.statutPermission(st.rdv.R1, occ), 'demande');
  evts.push({ id: 'e2', at: '2026-11-09T08:00:00Z', by: 'sec', type: 'TRANSPORT', data: { rdv: 'R1', transport: 't1', occurrence: occ, statut: 'reserve', precision: 'Ambulances X (fictif)' } });
  evts.push({ id: 'e3', at: '2026-11-09T08:01:00Z', by: 'sec', type: 'VALIDATION', data: { rdv: 'R1', validation: 'v1', occurrence: occ, statut: 'validee', nom: 'Dr A (fictif)' } });
  evts.push({ id: 'e4', at: '2026-11-09T08:02:00Z', by: 'ide1', type: 'INSCRIPTION', data: { rdv: 'R1', occurrence: occ, agent: 'ide2', nom: 'IDE 2 (fictif)' } });
  evts.push({ id: 'e5', at: '2026-11-09T08:03:00Z', by: 'ide3', type: 'INSCRIPTION', data: { rdv: 'R1', occurrence: occ, agent: 'ide3', nom: 'IDE 3 (fictif)' } });
  st = A.reduire(evts);
  assert.equal(A.transportsAReserver(st, fiches, ['U1'], maintenant).length, 0);
  assert.equal(A.statutPermission(st.rdv.R1, occ), 'validee');
  assert.deepEqual(A.aFaireValider(st, fiches, {}, ['U1'], maintenant).map((x) => x.validation.id), ['v2']);
  assert.equal(A.accompagnateursManquants(st, fiches, ['U1'], maintenant).length, 0);
  // Information reçue seulement par l'agent inscrit par un collègue, jusqu'à « vu »
  assert.deepEqual(A.avisPour(st, 'ide2', [], maintenant).map((a) => [a.par, a.retrait]), [['ide1', false]]);
  assert.equal(A.avisPour(st, 'ide3', [], maintenant).length, 0);
  assert.equal(A.avisPour(st, 'ide2', ['e4'], maintenant).length, 0);
  // Inscrire un collègue demande l'accès ; soi-même, non
  const permis = A.contrat.saisies.permisPourSoi;
  assert.ok(!permis('INSCRIPTION', { agent: 'ide2' }, { id: 'ide1' }));
  assert.ok(A.droits.peut(['IDE'], 'INSCRIPTION', {}) && A.droits.peut(['AS'], 'INSCRIPTION', {}));
  assert.ok(A.droits.peut(['SECRETAIRE'], 'VALIDATION', {}) && !A.droits.peut(['AS'], 'VALIDATION', {}));
});

test('Réglages propres à une date (0.11.1) : patients, VSL et accompagnateurs d’une audience, date décalée, date annulée, retour aux réglages communs', () => {
  const mer = j('2026-11-04') + 9.5 * 36e5;   // mercredi 4 novembre 2026, 9 h 30 - 12 h
  const evts = [{ id: 'e1', at: '2026-11-01T08:00:00Z', by: 'c', type: 'RDV', data: { id: 'A', nature: 'audience', titre: '', debut: mer, fin: mer + 2.5 * 36e5, service: 'U1', patients: [], accompagnateurs: 1, transports: [{ id: 't', type: 'vsl', nombre: 1 }], regularite: { type: 'semaine', jours: [3] } } }];
  const st0 = A.reduire(evts), fiches = { P1: { id: 'P1', service: 'U1', modes: [] }, P2: { id: 'P2', service: 'U1', modes: [] } };
  // Sans patient : en attente, aucun rappel
  assert.ok(A.enAttente(st0.rdv.A));
  assert.equal(A.transportsAReserver(st0, fiches, ['U1'], j('2026-11-09')).length, 0);
  evts.push({ id: 'e2', at: '2026-11-08T08:00:00Z', by: 'c', type: 'OCCURRENCE', data: { rdv: 'A', occurrence: '2026-11-11', patients: ['P1', 'P2'], accompagnateurs: 2, transports: [{ id: 't', type: 'vsl', nombre: 2 }], service: 'U1' } });
  evts.push({ id: 'e3', at: '2026-11-08T08:01:00Z', by: 'c', type: 'OCCURRENCE', data: { rdv: 'A', occurrence: '2026-11-18', debut: j('2026-11-19') + 14 * 36e5, fin: j('2026-11-19') + 16 * 36e5, service: 'U1' } });
  evts.push({ id: 'e4', at: '2026-11-08T08:02:00Z', by: 'c', type: 'OCCURRENCE', data: { rdv: 'A', occurrence: '2026-11-25', annulee: true, motifAnnulation: 'Aucun patient convoqué', service: 'U1' } });
  const st = A.reduire(evts);
  const semaine = (d) => A.elements(st, fiches, ['U1'], j(d), j(d) + 7 * 864e5, true);
  const x11 = semaine('2026-11-09')[0];
  assert.deepEqual(x11.rdv.patients, ['P1', 'P2']); assert.equal(x11.accompagnateurs.requis, 2); assert.equal(A.etatTransports(x11.rdv, x11.occurrence)[0].nombre, 2);
  assert.ok(!A.enAttente(x11.rdv)); assert.deepEqual(x11.rdv.surchargee.sort(), ['accompagnateurs', 'patients', 'transports']);
  assert.equal(A.transportsAReserver(st, fiches, ['U1'], j('2026-11-09')).length, 1);
  // Les autres dates gardent les réglages communs
  assert.deepEqual(semaine('2026-11-02')[0].rdv.patients, []);
  // Date décalée : jeudi 19 à 14 h, repérée par le mercredi 18
  const x18 = semaine('2026-11-16')[0];
  assert.equal(x18.occurrence, '2026-11-18'); assert.equal(x18.debut, j('2026-11-19') + 14 * 36e5);
  // Date annulée : affichée dans l'agenda seulement
  const x25 = semaine('2026-11-23')[0];
  assert.ok(x25.annulee); assert.equal(x25.rdv.motifAnnulation, 'Aucun patient convoqué');
  assert.equal(A.elements(st, fiches, ['U1'], j('2026-11-23'), j('2026-11-30')).length, 0);
  // Retour aux réglages communs, rétablissement
  evts.push({ id: 'e5', at: '2026-11-08T08:03:00Z', by: 'c', type: 'OCCURRENCE', data: { rdv: 'A', occurrence: '2026-11-11', reset: true, service: 'U1' } });
  evts.push({ id: 'e6', at: '2026-11-08T08:04:00Z', by: 'c', type: 'OCCURRENCE', data: { rdv: 'A', occurrence: '2026-11-25', annulee: false, service: 'U1' } });
  const st2 = A.reduire(evts);
  assert.deepEqual(A.elements(st2, fiches, ['U1'], j('2026-11-09'), j('2026-11-16'))[0].rdv.patients, []);
  assert.equal(A.elements(st2, fiches, ['U1'], j('2026-11-23'), j('2026-11-30')).length, 1);
});

test('Transparence sans patient prévu (0.11.2) : audience par défaut, activable par type', () => {
  const act = { nature: 'activite', patients: [] }, aud = { nature: 'audience', patients: [] };
  assert.ok(A.enAttente(aud, {}) && !A.enAttente(act, {}));
  const config = { agenda: { attenteSansPatient: ['activite', 'inconnu'] } };
  assert.deepEqual(A.typesEnAttente(config), ['activite']);
  assert.ok(A.enAttente(act, config) && !A.enAttente(aud, config));
  assert.ok(!A.enAttente({ nature: 'activite', patients: ['P1'] }, config));
});
