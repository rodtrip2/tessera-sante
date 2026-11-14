// SPDX-License-Identifier: EUPL-1.2
// Module Retours sur Tessera (lot O, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
const R = require('../app/js/module-retours.js');

let n = 0;
const ev = (by, type, data, jour) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, jour || 1, 8, n)).toISOString(), by, type, data });
const retour = (id, by, plus, jour) => ev(by, 'RETOUR', Object.assign({ id, service: 'U1', nature: 'defaut', texte: 'Bouton grisé (fictif)', ecran: { fenetre: 'Patients', onglet: 'Fiches' }, version: '0.48.0', navigateur: 'Edge 131', roles: ['IDE'] }, plus || {}), jour);
const suivi = (by, d, jour) => ev(by, 'RETOUR_SUIVI', Object.assign({ retour: 'R1', service: 'U1' }, d), jour);
const ctl = (evts, type, d) => () => R.controler(type, d, { etat: R.reduire(evts) });

test('Signalement : écran, version, navigateur et rôles repris ; état « nouveau »', () => {
  const st = R.reduire([retour('R1', 'ide1')]);
  const r = st.retours.R1;
  assert.deepEqual([r.etat, r.par, r.nature, r.ecran.fenetre, r.ecran.onglet, r.version, r.navigateur, r.roles], ['nouveau', 'ide1', 'defaut', 'Patients', 'Fiches', '0.48.0', 'Edge 131', ['IDE']]);
  assert.match(R.numero(r), /^RT-/);
  // Un retour ne se modifie pas : une seconde saisie au même identifiant est ignorée et refusée au contrôle
  assert.equal(R.reduire([retour('R1', 'ide1'), retour('R1', 'ide1', { texte: 'Autre (fictif)' })]).retours.R1.texte, 'Bouton grisé (fictif)');
  assert.throws(ctl([retour('R1', 'ide1')], 'RETOUR', { id: 'R1', service: 'U1', nature: 'defaut', texte: 'x' }), /déjà enregistré/);
});

test('Contrôles du signalement : service, nature, texte, longueur', () => {
  const base = { id: 'R9', service: 'U1', nature: 'idee', texte: 'Une idée (fictif)' };
  assert.doesNotThrow(ctl([], 'RETOUR', base));
  assert.throws(ctl([], 'RETOUR', Object.assign({}, base, { service: '' })), /service/);
  assert.throws(ctl([], 'RETOUR', Object.assign({}, base, { nature: 'autre' })), /défaut ou amélioration/);
  assert.throws(ctl([], 'RETOUR', Object.assign({}, base, { texte: '   ' })), /quelques mots/);
  assert.throws(ctl([], 'RETOUR', Object.assign({}, base, { texte: 'x'.repeat(2001) })), /trop long/);
});

test('Suivi : retenu, écarté avec explication, fait ; réponse lue par l’auteur', () => {
  const evts = [retour('R1', 'ide1')];
  assert.throws(ctl(evts, 'RETOUR_SUIVI', { retour: 'R1', etat: 'ecarte' }), /pourquoi/);
  assert.throws(ctl(evts, 'RETOUR_SUIVI', { retour: 'R1', etat: 'nouveau' }), /Rien à enregistrer/);
  assert.throws(ctl(evts, 'RETOUR_SUIVI', { retour: 'R1', etat: 'ferme' }), /inconnu/);
  assert.throws(ctl(evts, 'RETOUR_SUIVI', { retour: 'R2', etat: 'fait' }), /introuvable/);
  const tout = evts.concat([suivi('cadre1', { etat: 'retenu', reponse: 'Transmis au porteur (fictif)' }), suivi('cadre1', { etat: 'fait' })]);
  const st = R.reduire(tout);
  assert.deepEqual([st.retours.R1.etat, st.retours.R1.reponse, st.retours.R1.suivi.length], ['fait', 'Transmis au porteur (fictif)', 2]);
  assert.equal(R.avisPour(st, 'ide1').length, 2);
  assert.equal(R.avisPour(st, 'ide1', [st.avis[0].id]).length, 1);
  // L'auteur qui suit son propre retour (cadre) ne s'informe pas lui-même
  assert.equal(R.reduire([retour('R1', 'cadre1'), suivi('cadre1', { etat: 'retenu' })]).avis.length, 0);
});

test('Visibilité : l’auteur voit ses retours ; le cadre ceux de ses services ; l’administrateur tous', () => {
  const st = R.reduire([retour('R1', 'ide1'), retour('R2', 'ide2', { service: 'U2', nature: 'idee' }), retour('R3', 'ide1', { service: 'U2' })]);
  const ids = (o) => R.liste(st, o).map((r) => r.id).sort();
  assert.deepEqual(ids({ agent: 'ide1' }), ['R1', 'R3']);
  assert.deepEqual(ids({ agent: 'ide2' }), ['R2']);
  assert.deepEqual(ids({ agent: 'cadre1', suivre: true, services: ['U1'] }), ['R1']);
  assert.deepEqual(ids({ agent: 'admin', suivre: true, tous: true }), ['R1', 'R2', 'R3']);
  assert.deepEqual(ids({ agent: 'admin', suivre: true, tous: true, filtre: { nature: 'idee' } }), ['R2']);
  assert.deepEqual(ids({ agent: 'ide1', suivre: false, tous: true }), ['R1', 'R3'], 'sans le droit de suivre, seulement les siens');
  assert.equal(R.aTraiter(st, ['U2']).length, 2);
  assert.equal(R.aTraiter(st, [], true).length, 3);
});

test('Export : une ligne par retour, auteur en clair, aucun historique', () => {
  const st = R.reduire([retour('R1', 'ide1'), suivi('cadre1', { etat: 'retenu', reponse: 'Oui (fictif)' })]);
  const l = R.lignesExport(R.liste(st, { agent: 'x', suivre: true, tous: true }), (id) => id === 'ide1' ? 'IDE 1 (fictif)' : id);
  assert.equal(l.length, 2);
  assert.deepEqual([l[1][2], l[1][5], l[1][11], l[1][12]], ['IDE 1 (fictif)', 'Défaut', 'Retenu', 'Oui (fictif)']);
});

test('Contrat : tous les rôles signalent, le cadre et l’administrateur suivent', () => {
  const D = R.droits;
  assert.equal(SIC.modules.obtenir('retours').libelle, 'Retours sur Tessera');
  ['IDE', 'AS', 'SECRETAIRE', 'MEDECIN', 'INTERVENANT'].forEach((r) => assert.ok(D.peut([r], 'RETOUR', {}), r));
  ['IDE', 'AS', 'SECRETAIRE'].forEach((r) => assert.ok(!D.peut([r], 'RETOUR_SUIVI', {}), r));
  assert.ok(D.peut(['CADRE'], 'RETOUR_SUIVI', {}));
  assert.ok(D.peut(['ADMIN'], 'RETOUR_SUIVI', {}));
});
