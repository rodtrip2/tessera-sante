// SPDX-License-Identifier: EUPL-1.2
// Agenda : « Quel(s) professionnel(s) ? » et « Quel(s) patient(s) ? » (0.21.0). Données fictives.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/js/module-agenda.js');
const P = require('../app/js/agenda-participants.js');

const OCC = '2026-11-20';
let n = 0;
const ev = (by, type, data) => ({ id: 'e' + (++n), at: new Date(Date.UTC(2026, 10, 12, 8, n)).toISOString(), by, type, data });
const rdv = (participation, plus) => ev('auteur', 'RDV', Object.assign({ id: 'R1', nature: 'accompagnement', titre: 'Sortie au marché (fictif)', debut: Date.UTC(2026, 10, 20, 9), fin: Date.UTC(2026, 10, 20, 11), service: 'U1', patients: [], professionnels: [{ id: 'ide1', nom: 'IDE 1 (fictif)' }], participation }, plus || {}));
const insc = (by, agent, plus) => ev(by, 'INSCRIPTION', Object.assign({ rdv: 'R1', occurrence: OCC, agent, nom: agent + ' (fictif)' }, plus || {}));
const pros = st => A.accompagnateurs(st.rdv.R1, OCC);
const ids = l => l.map(x => x.agent);

test('Ancien réglage : le nombre d’accompagnateurs reste un nombre exact, inscription libre', () => {
  const st = A.reduire([rdv(undefined, { accompagnateurs: 2 }), insc('as1', 'as1')]);
  const p = pros(st);
  assert.deepEqual([p.requis, p.mode, p.prevus, p.total, p.manque, p.complet], [2, 'exact', 1, 2, 0, true]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, []);   // complet : plus d'inscription (comme avant)
});

test('Nombre exact : au-delà, liste d’attente ; le premier prend la place en cas de désistement', () => {
  const evts = [rdv({ mode: 'exact', nombre: 3, libre: true }), insc('as1', 'as1'), insc('as2', 'as2'), insc('as3', 'as3'), insc('as4', 'as4')];
  let p = pros(A.reduire(evts));
  assert.deepEqual([ids(p.inscrits), ids(p.attente), p.total, p.manque], [['as1', 'as2'], ['as3', 'as4'], 3, 0]);
  assert.deepEqual(P.situation(A.reduire(evts).rdv.R1, OCC, { id: 'as4' }), { etat: 'attente', rang: 2, actions: ['retirer'] });
  p = pros(A.reduire(evts.concat([insc('as1', 'as1', { retrait: true })])));
  assert.deepEqual([ids(p.inscrits), ids(p.attente)], [['as2', 'as3'], ['as4']]);
  // Le cadre fait passer un agent en tête
  p = pros(A.reduire(evts.concat([insc('cadre', 'as4', { etat: 'inscrit', prioritaire: true })])));
  assert.deepEqual([ids(p.inscrits), ids(p.attente)], [['as4', 'as1'], ['as2', 'as3']]);
});

test('Minimum et maximum : il manque du monde sous le minimum, attente au-delà du maximum', () => {
  const g = { mode: 'min', nombre: 3, max: 4, libre: true };
  let p = pros(A.reduire([rdv(g), insc('as1', 'as1')]));
  assert.deepEqual([p.manque, p.complet, P.libellePlaces(p)], [1, false, '2/3 à 4']);
  p = pros(A.reduire([rdv(g), insc('as1', 'as1'), insc('as2', 'as2'), insc('as3', 'as3'), insc('as4', 'as4')]));
  assert.deepEqual([p.total, p.complet, ids(p.attente)], [4, true, ['as4']]);
  p = pros(A.reduire([rdv({ mode: 'min', nombre: 1, libre: true }), insc('as1', 'as1'), insc('as2', 'as2')]));
  assert.deepEqual([p.total, p.attente.length, p.complet], [3, 0, false]);   // sans maximum : pas de limite
});

test('Inscrit par un collègue : proposé, il confirme ou refuse avec motif ; celui qui l’a proposé est informé', () => {
  const base = [rdv({ mode: 'exact', nombre: 2, libre: true }), insc('ide2', 'as1', { etat: 'propose' })];
  let st = A.reduire(base);
  assert.deepEqual([pros(st).total, ids(pros(st).proposes)], [1, ['as1']]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as1' }).actions, ['accepter', 'refuser']);
  assert.equal(st.avis.length, 0);   // une proposition attend une réponse, ce n'est pas un avis
  st = A.reduire(base.concat([insc('as1', 'as1', { etat: 'inscrit' })]));
  assert.deepEqual([pros(st).total, st.avis[0].agent, st.avis[0].genre], [2, 'ide2', 'propositionAcceptee']);
  st = A.reduire(base.concat([insc('as1', 'as1', { etat: 'refuse', motif: 'En formation ce jour-là' })]));
  assert.deepEqual([pros(st).total, pros(st).refus[0].motif, st.avis[0].genre, st.avis[0].motif], [1, 'En formation ce jour-là', 'propositionRefusee', 'En formation ce jour-là']);
});

test('Inscription à confirmer : demande, confirmée ou refusée par l’auteur, un organisateur, le cadre ou un rôle réglé', () => {
  const g = { mode: 'min', nombre: 2, aConfirmer: true, organisateurs: ['ide9'] };
  const base = [rdv(g), insc('as1', 'as1', { etat: 'demande' })];
  let st = A.reduire(base);
  assert.deepEqual([pros(st).total, ids(pros(st).demandes)], [1, ['as1']]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, ['demander']);
  const r = st.rdv.R1;
  assert.ok(P.peutConfirmer(r, { id: 'auteur', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'ide9', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'c', roles: ['CADRE'] }));
  assert.ok(!P.peutConfirmer(r, { id: 'x', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'x', roles: ['SECRETAIRE'] }, ['SECRETAIRE']));
  assert.deepEqual(A.rolesConfirmation({ agendaReglages: { '*': { rolesConfirmation: ['CADRE'] }, U1: { rolesConfirmation: ['CADRE', 'SECRETAIRE'] } } }, 'U1'), ['CADRE', 'SECRETAIRE']);
  assert.deepEqual(A.rolesConfirmation({}, 'U1'), ['CADRE']);
  // Réglages par service : le cadre n'écrit que pour ses services
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  assert.equal(A.controlerCadreReglages({ '*': { a: 1 } }, { '*': { a: 1 }, U1: { rolesConfirmation: ['CADRE', 'IDE'] } }, cadre), true);
  assert.equal(A.controlerCadreReglages({ '*': { a: 1 } }, { '*': { a: 2 } }, cadre), false);
  assert.equal(A.controlerCadreReglages({}, { U2: { a: 1 } }, cadre), false);
  assert.equal(A.controlerCadreReglages({}, { '*': { a: 1 } }, { roles: ['ADMIN'] }), true);
  st = A.reduire(base.concat([insc('auteur', 'as1', { etat: 'inscrit' })]));
  assert.deepEqual([pros(st).total, st.avis[0].genre], [2, 'confirmation']);
  st = A.reduire(base.concat([insc('auteur', 'as1', { etat: 'refuse', motif: 'Effectif du service' })]));
  assert.deepEqual([pros(st).total, st.avis[0].genre, st.avis[0].motif], [1, 'refus', 'Effectif du service']);
});

test('Invitation : agent, groupe ou rôle ; accepter ou refuser ; mélange avec l’inscription libre', () => {
  const g = P.reglage({ participation: { mode: 'exact', nombre: 2, invites: [{ t: 'agent', id: 'as1' }, { t: 'groupe', id: 'nuit' }, { t: 'role', id: 'AS' }, { t: 'x', id: 'y' }] } });
  assert.equal(g.invites.length, 3);
  assert.ok(P.invite(g, { id: 'as1' }) && P.invite(g, { id: 'z', groupes: ['nuit'] }) && P.invite(g, { id: 'z', roles: ['AS'] }) && !P.invite(g, { id: 'z', roles: ['IDE'] }));
  const st = A.reduire([rdv({ mode: 'exact', nombre: 2, invites: [{ t: 'agent', id: 'as1' }] })]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as1' }), { etat: 'invite', motif: undefined, actions: ['accepter', 'refuser'] });
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, []);   // sur invitation seulement
  const st2 = A.reduire([rdv({ mode: 'exact', nombre: 2, libre: true, invites: [{ t: 'agent', id: 'as1' }] })]);
  assert.deepEqual(P.situation(st2.rdv.R1, OCC, { id: 'as2' }).actions, ['inscrire']);   // invitation et inscription libre
});

test('Contrôle avant enregistrement', () => {
  const ctl = (g, f, d, compte, peutInscrire) => () => P.controler(A.reduire([rdv(g)].concat(f())).rdv.R1, OCC, Object.assign({ rdv: 'R1', occurrence: OCC }, d), { compte, peutInscrire });
  const libre = { mode: 'exact', nombre: 2, libre: true }, conf = { mode: 'min', nombre: 2, aConfirmer: true }, ferme = { mode: 'exact', nombre: 2 };
  assert.doesNotThrow(ctl(libre, () => [], { agent: 'as1' }, { id: 'as1' }));
  assert.throws(ctl(ferme, () => [], { agent: 'as1' }, { id: 'as1' }), /pas ouvertes/);
  assert.throws(ctl(conf, () => [], { agent: 'as1', etat: 'inscrit' }, { id: 'as1' }), /confirmée par un organisateur/);
  assert.doesNotThrow(ctl(conf, () => [], { agent: 'as1', etat: 'demande' }, { id: 'as1' }));
  assert.throws(ctl(libre, () => [], { agent: 'as1', etat: 'inscrit' }, { id: 'ide2', roles: ['IDE'] }, true), /confirme lui-même/);
  assert.doesNotThrow(ctl(libre, () => [], { agent: 'as1', etat: 'propose' }, { id: 'ide2', roles: ['IDE'] }, true));
  assert.throws(ctl(libre, () => [], { agent: 'as1', etat: 'propose' }, { id: 'ash', roles: ['ASH'] }, false), /inscrire un collègue/);
  const dem = () => [insc('as1', 'as1', { etat: 'demande' })];
  assert.throws(ctl(conf, dem, { agent: 'as1', etat: 'inscrit' }, { id: 'ide2', roles: ['IDE'] }, true), /auteur, un organisateur ou le cadre/);
  assert.doesNotThrow(ctl(conf, dem, { agent: 'as1', etat: 'inscrit' }, { id: 'auteur', roles: ['IDE'] }, true));
  assert.throws(ctl(conf, dem, { agent: 'as1', etat: 'refuse' }, { id: 'c', roles: ['CADRE'] }, true), /motif/);
  assert.throws(ctl(libre, () => [insc('as1', 'as1')], { agent: 'as1', etat: 'inscrit', prioritaire: true }, { id: 'ide2', roles: ['IDE'] }, true), /Seul le cadre/);
  assert.doesNotThrow(ctl(libre, () => [insc('as1', 'as1')], { agent: 'as1', etat: 'inscrit', prioritaire: true }, { id: 'c', roles: ['CADRE'] }, true));
});

test('Patients : maximum de places et liste d’attente, minimum et alerte ; réglage propre à une date', () => {
  const st = A.reduire([rdv({ mode: 'exact', nombre: 1, patientsMin: 2, patientsMax: 3 }, { patients: ['P1', 'P2', 'P3', 'P4'] })]);
  let pp = A.placesPatients(st.rdv.R1, OCC);
  assert.deepEqual([pp.inscrits, pp.attente, pp.manque, pp.complet], [['P1', 'P2', 'P3'], ['P4'], 0, true]);
  const st2 = A.reduire([rdv({ mode: 'exact', nombre: 1, patientsMin: 2 }, { patients: ['P1'] }), ev('auteur', 'OCCURRENCE', { rdv: 'R1', occurrence: OCC, participation: { mode: 'exact', nombre: 1, patientsMin: 3 } })]);
  pp = A.placesPatients(st2.rdv.R1, OCC);
  assert.deepEqual([pp.min, pp.manque], [3, 2]);
  const fiches = { P1: { id: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1' } };
  assert.equal(A.patientsManquants(st2, fiches, ['U1'], Date.UTC(2026, 10, 18), 7).length, 1);
});

test('À répondre et à confirmer', () => {
  const st = A.reduire([rdv({ mode: 'min', nombre: 2, aConfirmer: true, invites: [{ t: 'role', id: 'AS' }] }), insc('ide2', 'ide3', { etat: 'propose' }), insc('ide4', 'ide4', { etat: 'demande' })]);
  const t0 = Date.UTC(2026, 10, 15);
  assert.equal(A.aRepondre(st, {}, { id: 'ide3', roles: ['IDE'] }, ['U1'], t0)[0].situation.etat, 'propose');
  assert.equal(A.aRepondre(st, {}, { id: 'as7', roles: ['AS'] }, ['U1'], t0)[0].situation.etat, 'invite');
  assert.equal(A.aRepondre(st, {}, { id: 'ide8', roles: ['IDE'] }, ['U1'], t0).length, 0);
  assert.deepEqual(A.aConfirmer(st, {}, {}, { id: 'auteur', roles: ['IDE'] }, ['U1'], t0).map(x => x.demande.agent), ['ide4']);
  assert.equal(A.aConfirmer(st, {}, {}, { id: 'ide8', roles: ['IDE'] }, ['U1'], t0).length, 0);
});
