// SPDX-License-Identifier: EUPL-1.2
// Module Salles et bureaux (0.25.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
const S = require('../app/js/module-salles.js');

let n = 0;
const ev = (by, type, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 10, 8, n)).toISOString(), by, type, data });
const cadre = { id: 'cadre', roles: ['CADRE'], services: ['U1'] }, ide = { id: 'ide', roles: ['IDE'], services: ['U1'] }, admin = { id: 'adm', roles: ['ADMIN'], services: [] };
const L = '2026-11-16';   // lundi
const at = (h) => S.instant(L, h);
const base = () => [
  ev('cadre', 'SALLE', { id: 'S1', nom: 'Bureau d’entretien 1', type: 'entretien', capacite: 4, service: 'U1' }),
  ev('cadre', 'SALLE', { id: 'S2', nom: 'Salle des familles', type: 'familles', capacite: 6, service: 'U1', validation: true }),
  ev('adm', 'SALLE', { id: 'S3', nom: 'Salle d’activités', type: 'activites', capacite: 12, service: '', services: ['U1', 'U2'] }),
  ev('adm', 'SALLE_FERMETURE', { id: 'F1', salle: 'S3', jour: '2026-11-01', de: '12:00', a: '13:30', repetition: { type: 'semaine', jours: [0, 1, 2, 3, 4, 5, 6] }, motif: 'Repas' }),
  ev('cadre', 'SALLE_PRET', { id: 'P1', salle: 'S1', jour: '2026-11-03', repetition: { type: 'semaine', jours: [2] }, services: ['U2'], motif: 'Consultations U2' })];

test('Accès : service propriétaire, salle commune, prêt répété à un autre service', () => {
  const st = S.reduire(base());
  assert.deepEqual(S.sallesDuService(st, 'U2').map((s) => s.id).sort(), ['S1', 'S3']);
  assert.equal(S.acces(st, 'S1', 'U1', L).ok, true);
  assert.equal(S.acces(st, 'S1', 'U1', '2026-11-17').ok, false);   // mardi : prêtée à l'Unité 2
  assert.equal(S.acces(st, 'S1', 'U2', '2026-11-17').ok, true);
  assert.equal(S.acces(st, 'S1', 'U2', L).ok, false);
  assert.equal(S.acces(st, 'S3', 'U2', L).ok, true);
  assert.equal(S.gere(st.salles.S1, cadre), true);
  assert.equal(S.gere(st.salles.S3, cadre), false);   // commune : administrateur
});

test('Occupations : réservations simples, fermeture répétée, autres plannings ; disponibilité et salles libres', () => {
  const evts = base().concat([ev('ide', 'SALLE_RESERVATION', { id: 'R1', salle: 'S1', jour: L, de: '09:00', a: '10:30', titre: 'Inventaire', service: 'U1', repetition: { type: 'semaine', jours: [1] } })]);
  const st = S.reduire(evts);
  const sources = [{ ref: 'agenda|RDV1|' + L, salle: 'S3', debut: at('14:00'), fin: at('15:30'), titre: 'Atelier', genre: 'agenda', service: 'U1', par: 'ide' }];
  const occ = S.occupations(st, sources, at('00:00'), at('23:59'));
  assert.deepEqual(occ.occupations.map((o) => o.ref.split('|')[0] + ':' + o.salle).sort(), ['agenda:S3', 'ferme:S3', 'salles:S1']);
  assert.equal(S.disponibilite(st, occ, 'S1', 'U1', at('10:00'), at('11:00')).ok, false);
  assert.equal(S.disponibilite(st, occ, 'S1', 'U1', at('10:30'), at('11:00')).ok, true);
  assert.equal(S.disponibilite(st, occ, 'S3', 'U1', at('12:30'), at('13:00')).fermee, true);
  // Modifier l'atelier : sa propre occupation ne compte pas
  assert.equal(S.disponibilite(st, occ, 'S3', 'U1', at('14:00'), at('15:00'), 'agenda|RDV1').ok, true);
  assert.deepEqual(S.libres(st, occ, 'U1', at('14:00'), at('15:00')).map((s) => s.id), ['S1', 'S2']);
  assert.equal(S.disponibilite(st, occ, 'S2', 'U1', at('9:00'), at('10:00')).validation, true);
  // Série : une date retirée
  const st2 = S.reduire(evts.concat([ev('ide', 'SALLE_RESERVATION', { id: 'R1', sauf: ['2026-11-23'] })]));
  assert.equal(S.occupations(st2, [], S.instant('2026-11-23', '00:00'), S.instant('2026-11-24', '00:00')).occupations.filter((o) => o.genre === 'simple').length, 0);
  assert.equal(S.occupations(st2, [], S.instant('2026-11-30', '00:00'), S.instant('2026-12-01', '00:00')).occupations.filter((o) => o.genre === 'simple').length, 1);
});

test('Conflit et arbitrage : demande en attente, attribution, salle retirée ou déplacée, informations', () => {
  const sources = [{ ref: 'agenda|ATELIER|' + L, salle: 'S1', debut: at('13:30'), fin: at('14:30'), titre: 'Atelier mémoire', genre: 'agenda', service: 'U1', par: 'agentD' },
    { ref: 'agenda|REUNION|' + L, salle: 'S1', debut: at('13:30'), fin: at('14:30'), titre: 'Réunion de service', genre: 'agenda', service: 'U1', par: 'cadre' }];
  const dem = { id: 'D1', salle: 'S1', ref: 'agenda|REUNION|' + L, debut: at('13:30'), fin: at('14:30'), titre: 'Réunion de service', genre: 'agenda', service: 'U1', motif: 'Seule salle avec écran',
    conflits: [{ ref: 'agenda|ATELIER|' + L, par: 'agentD', titre: 'Atelier mémoire' }], nom: 'Cadre' };
  let evts = base().concat([ev('cadre', 'SALLE_DEMANDE', dem)]);
  let st = S.reduire(evts), occ = S.occupations(st, sources, at('00:00'), at('23:59'));
  // En attente : la réunion n'occupe pas la salle, l'atelier la garde
  assert.deepEqual([occ.occupations.filter((o) => o.salle === 'S1').map((o) => o.titre), occ.enAttente.map((o) => o.titre)], [['Atelier mémoire'], ['Réunion de service']]);
  assert.deepEqual(S.aArbitrer(st, cadre).map((d) => d.id), ['D1']);
  assert.deepEqual(S.aArbitrer(st, ide), []);
  assert.throws(() => S.controler('SALLE_DECISION', { demande: 'D1', accepte: true }, { etat: st, compte: ide }), /gestionnaire/);
  // Attribuée à la réunion, l'atelier déplacé dans la salle d'activités
  st = S.reduire(evts.concat([ev('cadre', 'SALLE_DECISION', { demande: 'D1', accepte: true, proposition: 'S3', message: 'La salle d’activités convient (fictif)' })]));
  occ = S.occupations(st, sources, at('00:00'), at('23:59'));
  const atelier = occ.occupations.filter((o) => o.titre === 'Atelier mémoire')[0];
  assert.deepEqual([atelier.salle, atelier.deplacee, occ.occupations.filter((o) => o.salle === 'S1').map((o) => o.titre), occ.enAttente.length], ['S3', 'S1', ['Réunion de service'], 0]);
  assert.deepEqual(S.avisPour(st, 'agentD').map((a) => a.genre), ['deplacee']);
  assert.deepEqual(S.avisPour(st, 'adm').length, 0);
  // Refus : la réunion reste sans salle (refusée), l'atelier garde la sienne
  st = S.reduire(evts.concat([ev('adm', 'SALLE_DECISION', { demande: 'D1', accepte: false, message: 'Atelier prévu de longue date' })]));
  occ = S.occupations(st, sources, at('00:00'), at('23:59'));
  assert.deepEqual([occ.occupations.filter((o) => o.salle === 'S1').map((o) => o.titre), occ.refusees.map((o) => o.titre), S.avisPour(st, 'cadre').map((a) => a.genre)], [['Atelier mémoire'], ['Réunion de service'], ['refusee']]);
  // L'auteur retire sa demande
  st = S.reduire(evts);
  assert.equal(S.contrat.saisies.permisPourSoi('SALLE_DECISION', { demande: 'D1', retirer: true }, cadre, { etat: st }), true);
});

test('Contrôles : quart d’heure, salle soumise à validation, salle commune créée par l’administrateur', () => {
  const st = S.reduire(base());
  const ctl = (type, d, compte) => () => S.controler(type, d, { etat: st, compte });
  assert.throws(ctl('SALLE_RESERVATION', { id: 'X', salle: 'S1', jour: L, de: '09:10', a: '10:00', titre: 'x' }, ide), /quart/);
  assert.throws(ctl('SALLE_RESERVATION', { id: 'X', salle: 'S2', jour: L, de: '09:00', a: '10:00', titre: 'x' }, ide), /validation/);
  assert.doesNotThrow(ctl('SALLE_RESERVATION', { id: 'X', salle: 'S2', jour: L, de: '09:00', a: '10:00', titre: 'x' }, cadre));
  assert.throws(ctl('SALLE', { id: 'S9', nom: 'Commune', service: '' }, cadre), /administrateur/);
  assert.throws(ctl('SALLE', { id: 'S9', nom: 'Autre', service: 'U2' }, cadre), /cadre du service/);
  assert.throws(ctl('SALLE_DEMANDE', { id: 'D9', salle: 'S1', ref: 'agenda|A|' + L, debut: at('9:00'), fin: at('10:00') }, ide), /motif/);
  assert.equal(S.options({}).debut, '07:00');
  assert.equal(S.controlerCadre({}, { U1: { debut: '08:00' } }, cadre), true);
  assert.equal(S.controlerCadre({}, { '*': { debut: '08:00' } }, cadre), false);
});
