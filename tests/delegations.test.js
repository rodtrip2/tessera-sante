// SPDX-License-Identifier: EUPL-1.2
// Accès particuliers (lot D, 0.31.0) : prêts de droits, intervenants extérieurs, charte. Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DL = require('../app/js/delegations.js');
const M = require('../app/js/model.js');

const j = (n) => DL.jourISO(Date.now() + n * 864e5);
const comptes = [
  { id: 'ide', nom: 'IDE (fictif)', roles: ['IDE'], services: ['U1'] },
  { id: 'cadre', nom: 'Cadre (fictif)', roles: ['CADRE'], services: ['U1'] },
  { id: 'cadre2', nom: 'Cadre 2 (fictif)', roles: ['CADRE'], services: ['U2'] },
  { id: 'ide2', nom: 'IDE 2 (fictif)', roles: ['IDE'], services: ['U1', 'U2'] },
  { id: 'admin', nom: 'Admin (fictif)', roles: ['ADMIN'], services: [] },
  { id: 'interv', nom: 'Intervenant (fictif)', roles: ['INTERVENANT'], services: ['U1'] }
];
const C = (id) => comptes.find((c) => c.id === id);
const pret = (o) => DL.pret(Object.assign({ id: 'p-1', de: 'cadre', a: 'ide', debut: j(0), fin: j(7), roles: ['CADRE'], services: ['U1'] }, o));

test('Prêt : qui prête quoi (agent ses droits, cadre ses services, administrateur tout sauf l’administration)', () => {
  assert.ok(DL.controlerPret(pret(), C('cadre'), comptes));                       // le cadre prête les siens
  assert.throws(() => DL.controlerPret(pret(), C('ide2'), comptes), /propres droits/);   // un IDE ne prête pas ceux du cadre
  assert.ok(DL.controlerPret(pret({ de: 'ide', a: 'ide2', roles: ['IDE'] }), C('cadre'), comptes));   // cadre : agent de ses services
  assert.throws(() => DL.controlerPret(pret({ de: 'ide', a: 'ide2', roles: ['IDE'] }), C('cadre2'), comptes));
  assert.throws(() => DL.controlerPret(pret({ de: 'ide', roles: ['CADRE'], a: 'ide2' }), C('ide'), comptes), /rôles de/);
  assert.equal(DL.pret({ id: 'p-x', de: 'a', a: 'b', roles: ['ADMIN', 'IDE'] }).roles.join(), 'IDE');   // jamais l'administration
  assert.ok(DL.controlerPret(pret({ de: 'ide', a: 'ide2', roles: ['SECRETAIRE'] }), C('admin'), comptes));   // administrateur : tout rôle
  assert.throws(() => DL.controlerPret(pret({ a: 'interv' }), C('admin'), comptes), /intervenant/);
  assert.throws(() => DL.controlerPret(pret({ fin: j(200) }), C('cadre'), comptes), /six mois/);
  assert.throws(() => DL.controlerPret(pret({ a: 'cadre' }), C('cadre'), comptes), /propres droits/);
});

test('Prêt en cours : rôles et services ajoutés au délégataire, « pour le compte de », fin automatique', () => {
  const config = { delegations: { prets: [pret(), pret({ id: 'p-2', debut: j(-10), fin: j(-1) }), pret({ id: 'p-3', annule: true })] } };
  const c = DL.appliquer(C('ide'), config, Date.now());
  assert.deepEqual([c.roles, c.services, c.pretsRecus.length], [['IDE', 'CADRE'], ['U1'], 1]);
  assert.equal(DL.appliquer(C('ide2'), config, Date.now()), C('ide2'));   // rien reçu : compte inchangé
  const peut = (rs) => rs.indexOf('CADRE') >= 0;   // saisie réservée au cadre
  assert.equal(DL.pourLeCompteDe(C('ide'), config, Date.now(), peut).de, 'cadre');
  assert.equal(DL.pourLeCompteDe(C('ide'), config, Date.now(), () => true), null);   // ses rôles suffisent
  assert.equal(DL.appliquer(C('ide'), config, Date.now() + 9 * 864e5).roles.join(), 'IDE');   // après la fin
  // Clés : le module Isocont compte le rôle prêté (M.peut du rôle cadre)
  assert.ok(M.peut(c.roles, 'CORRECTION', {}) && !M.peut(C('ide').roles, 'CORRECTION', {}));
});

test('Réglage des prêts : contrôle des changements par agent', () => {
  const avant = { prets: [pret()] };
  assert.ok(DL.controler(avant, { prets: [pret(), pret({ id: 'p-9', de: 'ide', a: 'ide2', roles: ['IDE'] })] }, C('ide'), comptes));
  assert.ok(!DL.controler(avant, { prets: [pret({ annule: true })] }, C('ide2'), comptes));   // un autre agent n'annule pas
  assert.ok(DL.controler(avant, { prets: [pret({ annule: true })] }, C('cadre'), comptes));
  assert.ok(!DL.controler(avant, { prets: [] }, C('ide'), comptes));
  assert.ok(DL.controler(avant, { prets: [] }, C('admin'), comptes));
});

test('Intervenant extérieur : aucun module par défaut, agenda en consultation, initiales, sans journal', () => {
  const rc = M.rolesConfig({}).find((r) => r.code === 'INTERVENANT');
  assert.deepEqual([rc.acces, rc.identite, rc.journal], [[], 'initiales', 'aucun']);
  assert.equal(M.droits.membre(['INTERVENANT'], {}), false);   // Isocont : n'y entre pas par son seul rôle
  const A = require('../app/js/module-agenda.js');
  const ra = A.droits.rolesConfig({}).find((r) => r.code === 'INTERVENANT');
  assert.deepEqual(ra.acces, ['agenda.consulter']);
  assert.ok(A.droits.membre(['INTERVENANT'], {}));
  assert.ok(A.limiteAuxSiens(['INTERVENANT']) && !A.limiteAuxSiens(['IDE']) && !A.limiteAuxSiens([]));
  // Accès coché par l'établissement : il entre dans le module
  assert.ok(M.droits.membre(['INTERVENANT'], { roles: { INTERVENANT: { acces: ['alertes'] } } }));
});

test('Demandes de comptes d’intervenants : par le cadre pour ses services, annulées par leur auteur', () => {
  const d = { id: 'dc-1', action: 'creer', etat: 'attente', login: 'benevole.a', nom: 'Bénévole A (fictif)', type: 'benevole', services: ['U1'], finValidite: j(90), publique: { publique: 'x' }, emb: { sel: 'x' }, par: 'cadre', le: 'x' };
  assert.ok(DL.controlerDemande(DL.demande(d), C('cadre'), comptes));
  assert.throws(() => DL.controlerDemande(DL.demande(Object.assign({}, d, { services: ['U2'] })), C('cadre'), comptes), /vos services/);
  assert.throws(() => DL.controlerDemande(DL.demande(Object.assign({}, d, { finValidite: j(400) })), C('cadre'), comptes), /un an/);
  assert.throws(() => DL.controlerDemande(DL.demande(d), C('ide'), comptes), /cadre/);
  assert.throws(() => DL.controlerDemande(DL.demande(Object.assign({}, d, { login: 'ide' })), C('cadre'), [{ login: 'ide' }].concat(comptes)), /existe/);
  assert.ok(DL.controlerDemandes({ demandes: [] }, { demandes: [d] }, C('cadre'), comptes));
  assert.ok(!DL.controlerDemandes({ demandes: [] }, { demandes: [Object.assign({}, d, { etat: 'faite' })] }, C('cadre'), comptes));
  assert.ok(DL.controlerDemandes({ demandes: [d] }, { demandes: [Object.assign({}, d, { etat: 'annulee' })] }, C('cadre'), comptes));
  assert.ok(!DL.controlerDemandes({ demandes: [d] }, { demandes: [] }, C('cadre'), comptes));
  assert.ok(!DL.controlerDemandes({ demandes: [d] }, { demandes: [Object.assign({}, d, { etat: 'annulee' })] }, C('cadre2'), comptes));
  // Modification : seulement un compte d'intervenant de ses services
  assert.ok(DL.controlerDemande(DL.demande({ id: 'dc-2', action: 'modifier', compte: 'interv', services: ['U1'], finValidite: j(30) }), C('cadre'), comptes));
  assert.throws(() => DL.controlerDemande(DL.demande({ id: 'dc-3', action: 'modifier', compte: 'ide', services: ['U1'], finValidite: j(30) }), C('cadre'), comptes), /intervenants/);
});

test('Charte : présentée à l’intervenant tant que la version n’est pas acceptée', () => {
  const config = { charteIntervenants: { texte: 'Charte (fictive)', version: 2 } };
  assert.ok(DL.charteAAccepter(C('interv'), config, null));
  assert.ok(DL.charteAAccepter(C('interv'), config, { version: 1 }));
  assert.ok(!DL.charteAAccepter(C('interv'), config, { version: 2 }));
  assert.ok(!DL.charteAAccepter(C('ide'), config, null));
  assert.ok(!DL.charteAAccepter(C('interv'), { charteIntervenants: { texte: '', version: 0 } }, null));
});
