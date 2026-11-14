// SPDX-License-Identifier: EUPL-1.2
// Module Contrôles : CSI libres et surveillance des CSI (lot B, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
const K = require('../app/js/module-controles.js');

let n = 0;
const ev = (by, type, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 14, 8, n)).toISOString(), by, type, data });
const L = (j, h, m) => new Date(2026, 10, j, h, m || 0).getTime();
const cfg = { services: [{ code: 'U1' }], lieuxCSI: { U1: ['CSI 1 (fictif)', 'CSI 2 (fictif)'] },
  periodes: [{ code: 'M', libelle: 'Matin', debut: '07:00', fin: '14:00' }, { code: 'AM', libelle: 'Après-midi', debut: '14:00', fin: '21:00' }, { code: 'N', libelle: 'Nuit', debut: '21:00', fin: '07:00' }] };
const items = (nc) => K.LISTE_PROVISOIRE.map(l => ({ libelle: l, ok: l !== nc }));

test('Réglages : liste provisoire, remplacement par service, modèles désactivables', () => {
  const o = K.options(cfg, 'U1');
  assert.equal(o.csiLibre.provisoire, true);
  assert.equal(o.csiLibre.deuxAgents, true);
  const c2 = Object.assign({}, cfg, { controles: { '*': { csiLibre: { liste: ['Point A', 'Point B'] } }, U1: { csiLibre: { deuxAgents: false }, surveillance: { actif: false } } } });
  const o2 = K.options(c2, 'U1');
  assert.deepEqual(o2.csiLibre.liste, ['Point A', 'Point B']);
  assert.equal(o2.csiLibre.deuxAgents, false);
  assert.equal(o2.surveillance.actif, false);
  assert.equal(K.options(c2, 'U2').surveillance.actif, true);
});

test('Échéances : CSI occupée → surveillance, libre → contrôle à deux, états et retards', () => {
  const maintenant = L(14, 10);   // matin du 14
  const occ = [{ lieu: 'CSI 1 (fictif)', debut: L(13, 18), fin: null }];
  let st = K.reduire([
    ev('a', 'CONTROLE', { id: 'C1', modele: 'csiLibre', service: 'U1', lieu: 'CSI 2 (fictif)', date: '2026-11-14', poste: 'M', items: items(''), deuxAgents: true }),
    ev('b', 'CONTROLE', { id: 'C2', modele: 'csiLibre', service: 'U1', lieu: 'CSI 2 (fictif)', date: '2026-11-13', poste: 'AM', items: items('Éclairage fonctionnel'), ecart: 'Ampoule (fictif)', deuxAgents: true }),
    ev('c', 'CONTROLE_CONFIRME', { controle: 'C2' }),
    ev('b', 'CONTROLE_CONFIRME', { controle: 'C2' })   // ignoré : déjà confirmé
  ]);
  const e = K.echeances(st, cfg, { service: 'U1', occupations: occ, maintenant, jours: 1 });
  const cour = e.filter(x => x.date === '2026-11-14' && x.poste === 'M');
  assert.deepEqual(cour.map(x => [x.lieu, x.modele, x.etat]), [['CSI 1 (fictif)', 'surveillance', 'aFaire'], ['CSI 2 (fictif)', 'csiLibre', 'aConfirmer']]);
  const am = e.filter(x => x.date === '2026-11-13' && x.poste === 'AM');
  assert.deepEqual(am.map(x => [x.lieu, x.modele, x.etat]), [['CSI 1 (fictif)', 'surveillance', 'retard'], ['CSI 2 (fictif)', 'csiLibre', 'fait']]);   // occupée depuis 18 h
  assert.equal(st.controles.C2.confirmePar, 'c');
  assert.ok(K.nonConforme(st.controles.C2));
  assert.equal(K.aFaire(e).length, 2);
  assert.ok(K.retards(e).length >= 1);
  // Annulation : le contrôle redevient à faire
  st = K.reduire([ev('a', 'CONTROLE', { id: 'C9', modele: 'csiLibre', service: 'U1', lieu: 'CSI 2 (fictif)', date: '2026-11-14', poste: 'M', items: items(''), deuxAgents: false }), ev('a', 'CONTROLE_ANNULE', { controle: 'C9', motif: 'Erreur de chambre' })]);
  assert.equal(K.echeances(st, cfg, { service: 'U1', occupations: [], maintenant, jours: 1 }).filter(x => x.date === '2026-11-14' && x.poste === 'M' && x.lieu === 'CSI 2 (fictif)')[0].etat, 'aFaire');
  assert.equal(K.registre(st, { services: ['U1'] }).length, 1);
  assert.equal(K.lignesExport(K.registre(st, {}))[1][12], 'oui (Erreur de chambre)');
});

test('Contrôles des saisies : liste complète, écart commenté, second agent distinct, annulation', () => {
  const st = K.reduire([ev('a', 'CONTROLE', { id: 'C1', modele: 'csiLibre', service: 'U1', lieu: 'CSI 2 (fictif)', date: '2026-11-14', poste: 'M', items: items(''), deuxAgents: true })]);
  const ctx = (id, peut) => ({ etat: st, compte: { id }, peut: t => !!peut && t === 'CONTROLE_ANNULE_TOUS' });
  const base = { id: 'C2', modele: 'csiLibre', service: 'U1', lieu: 'CSI 1 (fictif)', date: '2026-11-14', poste: 'M' };
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { items: [] }), ctx('b')), /Cochez/);
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { items: items('Éclairage fonctionnel') }), ctx('b')), /écart/);
  assert.doesNotThrow(() => K.controler('CONTROLE', Object.assign({}, base, { items: items('Éclairage fonctionnel'), ecart: 'Ampoule' }), ctx('b')));
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { id: 'C3', lieu: 'CSI 2 (fictif)', items: items('') }), ctx('b')), /déjà fait/);
  assert.doesNotThrow(() => K.controler('CONTROLE', { id: 'C4', modele: 'surveillance', service: 'U1', lieu: 'CSI 1 (fictif)', date: '2026-11-14', poste: 'M' }, ctx('b')));
  assert.throws(() => K.controler('CONTROLE_CONFIRME', { controle: 'C1' }, ctx('a')), /propre compte/);
  assert.doesNotThrow(() => K.controler('CONTROLE_CONFIRME', { controle: 'C1' }, ctx('b')));
  assert.throws(() => K.controler('CONTROLE_ANNULE', { controle: 'C1', motif: 'x' }, ctx('b')), /Seul/);
  assert.doesNotThrow(() => K.controler('CONTROLE_ANNULE', { controle: 'C1', motif: 'x' }, ctx('b', true)));
  assert.throws(() => K.controler('CONTROLE_ANNULE', { controle: 'C1' }, ctx('a')), /motif/);
});

test('Module désactivé par défaut : activé seulement dans les services choisis', () => {
  const D = K.droits;
  assert.deepEqual(D.activation({}), []);
  assert.equal(D.serviceChoisi({}, 'U1'), false);
  assert.equal(D.serviceActif({ modulesServices: { controles: { tous: false, services: ['U1'] } } }, 'U1'), true);
  assert.equal(D.activation({ modulesServices: { controles: { tous: true } } }), null);
  const v = SIC.modules.ecrireActivation({}, 'controles', ['U1'], true);
  assert.deepEqual(v.controles, { tous: true });
  assert.equal(SIC.modules.ecrireActivation({}, 'retours', ['U1'], true).retours, undefined);   // module actif par défaut : réglage d'origine
  assert.equal(K.controlerCadre({}, { U1: { csiLibre: { deuxAgents: false } } }, { roles: ['CADRE'], services: ['U1'] }), true);
  assert.equal(K.controlerCadre({}, { '*': {} }, { roles: ['CADRE'], services: ['U1'] }), false);
});

test('Occupation des CSI lue dans Isocont, segments compris', () => {
  require('../app/js/module-isocont.js');
  const st = { mesures: {
    M1: { service: 'U1', lieu: 'CSI 1', csi: true, debut: 100, fin: null, segments: [{ debut: 100, service: 'U1', lieu: 'Chambre 8', csi: false }, { debut: 200, service: 'U1', lieu: 'CSI 1', csi: true }] },
    M2: { service: 'U1', lieu: 'CSI 2', csi: true, debut: 50, fin: 80 }, M3: { service: 'U2', lieu: 'CSI A', csi: true, debut: 10, fin: null }, M4: { service: 'U1', lieu: 'CSI 2', csi: true, debut: 10, fin: null, annulee: true } } };
  assert.deepEqual(SIC.modules.lire('isocont.occupationsCSI', st, { services: ['U1'], depuis: 60 }), [{ service: 'U1', lieu: 'CSI 1', debut: 200, fin: null }, { service: 'U1', lieu: 'CSI 2', debut: 50, fin: 80 }]);
});
