// SPDX-License-Identifier: EUPL-1.2
// Module Véhicules (0.14.0, décision du porteur du 8 novembre 2026) : disponibilité, prêts, mises à disposition, signalements ; npm test
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
const V = require('../app/js/module-vehicules.js');
const j = (s, h) => V.depuisISO(s) + (h || 0) * 36e5;
let n = 0;
const ev = (type, data, by) => ({ id: 'e' + (++n), at: '2026-11-08T08:00:' + String(n % 60).padStart(2, '0') + 'Z', by: by || 'c', type, data });

test('Disponibilité : service d’affectation, chevauchement, prêt exclusif, mise à disposition, hors service', () => {
  const evts = [
    ev('VEHICULE', { id: 'V1', type: 'automobile', nom: 'Clio (fictif)', immatriculation: 'AA-123-AA', places: 5, parking: 'Parking P2', service: 'U1' }),
    ev('VEHICULE', { id: 'V2', type: 'minibus', nom: 'Minibus (fictif)', places: 9, service: 'U2' }),
    ev('RESERVATION', { id: 'R1', vehicule: 'V1', debut: j('2026-11-10', 9), fin: j('2026-11-10', 12), service: 'U1', agent: 'a', nom: 'A (fictif)', motif: 'Rendez-vous' }),
    ev('PRET', { id: 'P1', vehicule: 'V1', mode: 'pret', services: ['U2'], debut: '2026-11-16', fin: '2026-11-18' }),
    ev('PRET', { id: 'P2', vehicule: 'V2', mode: 'partage', services: [], debut: '2026-11-14', fin: '2026-11-15' })
  ];
  let st = V.reduire(evts);
  assert.ok(V.peutReserver(st, 'V1', 'U1', j('2026-11-10', 13), j('2026-11-10', 15)).ok);
  const c = V.peutReserver(st, 'V1', 'U1', j('2026-11-10', 11), j('2026-11-10', 13));
  assert.ok(!c.ok && /déjà réservé/.test(c.raison) && c.conflits.length === 1);
  assert.ok(V.peutReserver(st, 'V1', 'U1', j('2026-11-10', 11), j('2026-11-10', 13), 'R1').ok, 'modifier sa propre réservation');
  assert.ok(!V.peutReserver(st, 'V1', 'U2', j('2026-11-10', 13), j('2026-11-10', 15)).ok, 'autre service sans prêt');
  // Prêt exclusif : l'emprunteur réserve, le service d'affectation non
  assert.ok(V.peutReserver(st, 'V1', 'U2', j('2026-11-17', 9), j('2026-11-17', 17)).ok);
  assert.match(V.peutReserver(st, 'V1', 'U1', j('2026-11-17', 9), j('2026-11-17', 17)).raison, /prêté/);
  assert.ok(!V.peutReserver(st, 'V1', 'U2', j('2026-11-18', 9), j('2026-11-19', 17)).ok, 'le prêt doit couvrir toute la période');
  // Mise à disposition à tous : le service d'affectation garde le véhicule
  assert.ok(V.peutReserver(st, 'V2', 'U1', j('2026-11-14', 10), j('2026-11-15', 18)).ok);
  assert.ok(V.peutReserver(st, 'V2', 'U2', j('2026-11-14', 10), j('2026-11-14', 18)).ok);
  assert.deepEqual(V.vehiculesPour(st, ['U1'], j('2026-11-14'), j('2026-11-16')).map((v) => v.id), ['V1', 'V2']);
  assert.deepEqual(V.vehiculesPour(st, ['U1'], j('2026-11-10'), j('2026-11-11')).map((v) => v.id), ['V1']);
  // Annulation, hors service
  evts.push(ev('RESERVATION', { id: 'R1', annulee: true }));
  evts.push(ev('VEHICULE', { id: 'V2', actif: false }));
  st = V.reduire(evts);
  assert.ok(V.peutReserver(st, 'V1', 'U1', j('2026-11-10', 11), j('2026-11-10', 13)).ok);
  assert.match(V.peutReserver(st, 'V2', 'U2', j('2026-11-20', 10), j('2026-11-20', 12)).raison, /hors service/);
  // Contrôle avant enregistrement
  assert.throws(() => V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'R9', vehicule: 'V1', service: 'U1', debut: j('2026-11-17', 9), fin: j('2026-11-17', 10) }, { etat: st }), /indisponible/);
});

test('Réservation liée à un événement de l’agenda, signalements, données ajoutées, fourniture lue par l’Agenda', () => {
  const evts = [
    ev('VEHICULE', { id: 'V1', nom: 'Clio (fictif)', service: 'U1', complements: { 'carte-carburant': 'oui' } }),
    ev('RESERVATION', { id: 'R1', vehicule: 'V1', debut: j('2026-11-12', 9), fin: j('2026-11-12', 11), service: 'U1', lien: { rdv: 'RD1', occurrence: '2026-11-12', transport: 't1' } }),
    ev('SIGNALEMENT', { id: 'S1', vehicule: 'V1', type: 'plein', texte: '' }),
    ev('SIGNALEMENT', { id: 'S2', vehicule: 'V1', type: 'voyant', texte: 'Voyant orange (fictif)' }),
    ev('SIGNALEMENT_FAIT', { signalement: 'S1' })
  ];
  const st = V.reduire(evts);
  assert.deepEqual(V.reservationsLiees(st, 'RD1', '2026-11-12').map((r) => r.id), ['R1']);
  assert.deepEqual(V.signalementsOuverts(st, 'V1').map((s) => s.id), ['S2']);
  const dispo = globalThis.SIC.modules.lire('vehicules.disponibles', st, { service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12) });
  assert.deepEqual(dispo.map((d) => [d.id, d.ok, d.signalements]), [['V1', false, 1]]);
  assert.ok(globalThis.SIC.modules.lire('vehicules.disponibles', st, { service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12), exclure: 'R1' })[0].ok);
  const o = V.options({ vehicules: { champs: [{ id: 'carte-carburant', libelle: 'Carte carburant à bord', type: 'ouiNon' }] } });
  assert.equal(o.types.length, V.TYPES_VEHICULE_DEFAUT.length);
  assert.equal(V.libValeur(o.champs[0], V.valeurChamp(o.champs[0], 'oui')), 'Oui');
  // Annuler sa propre réservation sans l'accès « Réserver »
  assert.ok(V.contrat.saisies.permisPourSoi('RESERVATION', { id: 'R1', annulee: true }, { id: 'c' }, { etat: st }));
  assert.ok(!V.contrat.saisies.permisPourSoi('RESERVATION', { id: 'R1', annulee: true }, { id: 'x' }, { etat: st }));
});

test('Message de conflit avec le libellé du service ; jeu de démonstration du module Véhicules', () => {
  const st = V.reduire([
    ev('VEHICULE', { id: 'V1', nom: 'Clio (fictif)', service: 'U1' }),
    ev('RESERVATION', { id: 'R1', vehicule: 'V1', debut: j('2026-11-12', 9), fin: j('2026-11-12', 11), service: 'U1' })
  ]);
  assert.throws(() => V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'R2', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12) },
    { etat: st, config: { services: [{ code: 'U1', libelle: 'Unité 1 (fictive)' }] } }), /Unité 1 \(fictive\)/);
  require('../app/js/demo.js');
  const evts = globalThis.SIC.donneesFictives({}).map((e, i) => Object.assign({ id: 'd' + i, v: 1, by: 'demo' }, e));
  const d = V.reduire(evts);
  assert.equal(Object.keys(d.vehicules).length, 3);
  assert.ok(Object.values(d.reservations).some((r) => r.lien && r.lien.transport === 'tm'), 'réservation liée à l’agenda');
  assert.equal(Object.keys(d.prets).length, 2);
  assert.equal(V.signalementsOuverts(d).length, 2);
  assert.ok(d.reservations.RV006.supplantee && d.reservations.RV005.statut === 'pre');
  assert.equal(V.avisPour(d, { agent: 'cadre', servicesInformes: ['U1'] }, [], Date.now()).length, 1);
});

test('Pré-réservation : avertit sans bloquer, réservation forcée en la désignant, auteur, cadre et secrétaire informés', () => {
  const evts = [
    ev('VEHICULE', { id: 'V1', nom: 'Clio (fictif)', service: 'U1' }),
    Object.assign(ev('RESERVATION', { id: 'P1', statut: 'pre', vehicule: 'V1', debut: j('2026-11-12', 9), fin: j('2026-11-12', 11), service: 'U1', agent: 'a1', nom: 'Agent A (fictif)', motif: 'Visite à domicile' }), { by: 'a1' })
  ];
  let st = V.reduire(evts);
  const p = V.peutReserver(st, 'V1', 'U1', j('2026-11-12', 10), j('2026-11-12', 12));
  assert.ok(p.ok);
  assert.deepEqual(p.pre.map((x) => x.id), ['P1']);
  assert.match(p.avertissement, /pré-réservé par Agent A \(fictif\).*Visite à domicile/);
  const ctx = { etat: st };
  // Sans désigner la pré-réservation : refus ; une autre pré-réservation est permise
  assert.throws(() => V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'R1', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12) }, ctx), /Confirmez pour forcer/);
  V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'P2', statut: 'pre', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12) }, ctx);
  V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'R1', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12), supplante: ['P1'] }, ctx);
  // Une réservation ferme bloque une pré-réservation
  const evts2 = evts.concat([Object.assign(ev('RESERVATION', { id: 'R1', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 10), fin: j('2026-11-12', 12), nom: 'Agent B (fictif)', supplante: ['P1'] }), { by: 'b1' })]);
  st = V.reduire(evts2);
  assert.ok(st.reservations.P1.supplantee && st.reservations.P1.supplantee.reservation === 'R1');
  assert.deepEqual(V.reservationsActives(st, 'V1', j('2026-11-12', 0), j('2026-11-13', 0)).map((r) => r.id), ['R1']);
  assert.throws(() => V.contrat.saisies.controler('RESERVATION', { motif: 'Test (fictif)', id: 'P3', statut: 'pre', vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 11), fin: j('2026-11-12', 13) }, { etat: st }), /indisponible/);
  // Informés : l'auteur de la pré-réservation, le cadre et la secrétaire du service ; pas l'auteur de la réservation forcée
  const now = j('2026-11-10', 8);
  assert.equal(V.avisPour(st, { agent: 'a1', servicesInformes: [] }, [], now).length, 1);
  assert.equal(V.avisPour(st, { agent: 'cadre', servicesInformes: ['U1'] }, [], now).length, 1);
  assert.equal(V.avisPour(st, { agent: 'cadre', servicesInformes: ['U2'] }, [], now).length, 0);
  assert.equal(V.avisPour(st, { agent: 'b1', servicesInformes: ['U1'] }, [], now).length, 0);
  const vu = V.avisPour(st, { agent: 'a1' }, [], now)[0].id;
  assert.equal(V.avisPour(st, { agent: 'a1' }, [vu], now).length, 0);
});

test('Motif obligatoire pour une réservation comme pour une pré-réservation', () => {
  const st = V.reduire([ev('VEHICULE', { id: 'V1', nom: 'Clio (fictif)', service: 'U1' })]);
  for (const statut of ['ferme', 'pre']) {
    assert.throws(() => V.contrat.saisies.controler('RESERVATION', { id: 'R1', statut, vehicule: 'V1', service: 'U1', debut: j('2026-11-12', 9), fin: j('2026-11-12', 10), motif: ' ' }, { etat: st }), /motif/);
  }
  // L'annulation ne demande pas de motif
  V.contrat.saisies.controler('RESERVATION', { id: 'R1', annulee: true }, { etat: st });
});

test('Agenda : tâche et alerte adressées à un groupe d’agents', () => {
  const A = globalThis.SIC.agenda || require('../app/js/module-agenda.js');
  assert.ok(A.tachePour({ pour: { roles: [], agents: [], groupes: ['nuit'] } }, { id: 'a1', roles: ['IDE'], groupes: ['nuit'] }));
  assert.ok(!A.tachePour({ pour: { roles: [], agents: [], groupes: ['nuit'] } }, { id: 'a2', roles: ['IDE'], groupes: ['jour'] }));
  assert.ok(A.alertePour({ pour: { groupe: 'nuit' } }, { id: 'a1', groupes: ['nuit'] }));
  assert.ok(!A.alertePour({ pour: { groupe: 'nuit' } }, { id: 'a2', groupes: [] }));
});
