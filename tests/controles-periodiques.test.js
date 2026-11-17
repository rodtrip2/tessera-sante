// SPDX-License-Identifier: EUPL-1.2
// Module Contrôles : contrôles périodiques (lot K, 17 novembre 2026). Données fictives ; npm test
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
const ev = (by, type, data, t) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(t || Date.UTC(2026, 10, 16, 8, n)).toISOString(), by, type, data });
const L = (j, h, m) => new Date(2026, 10, j, h, m || 0).getTime();
const chariot = K.depuisModele('chariot', 'cp-chariot');
const frigo = K.depuisModele('refrigerateur', 'cp-frigo');
const trousse = K.depuisModele('trousse', 'cp-trousse');
const cfg = { services: [{ code: 'U1' }], periodes: [{ code: 'M', libelle: 'Matin', debut: '07:00', fin: '14:00' }, { code: 'AM', libelle: 'Après-midi', debut: '14:00', fin: '21:00' }, { code: 'N', libelle: 'Nuit', debut: '21:00', fin: '07:00' }],
  controles: { U1: { periodiques: [chariot, frigo, trousse, { id: 'cp-off', libelle: 'Inactif (fictif)', actif: false, rythme: 'jour' }, { id: 'mauvais id', libelle: 'x' }] } } };
const items = (def, f) => def.points.map((p, i) => {
  const it = { libelle: p.libelle, ok: true, type: p.type };
  if (p.type === 'valeur') Object.assign(it, { valeur: 5, unite: p.unite, min: p.min, max: p.max });
  if (p.type === 'peremption') it.peremption = '2027-06-30';
  if (p.type === 'texte') it.texte = 'S-0042 (fictif)';
  return f ? f(it, i) : it;
});
const ctx = (st, by) => ({ etat: st, config: cfg, compte: { id: by || 'a1' }, peut: () => false });

test('Réglages : modèles proposés, validation à la lecture, rythmes', () => {
  const l = K.periodiques(cfg, 'U1');
  assert.deepEqual(l.map(d => d.id), ['cp-chariot', 'cp-frigo', 'cp-trousse', 'cp-off']);
  assert.equal(chariot.deuxAgents, true);
  assert.equal(chariot.apresUtilisation, true);
  assert.equal(frigo.points[0].type, 'valeur');
  assert.deepEqual([frigo.points[0].min, frigo.points[0].max], [2, 8]);
  assert.equal(K.libelleRythme(chariot), 'Chaque semaine, le lundi ; et après chaque utilisation (dans les 4 h)');
  assert.equal(K.libelleRythme(trousse).startsWith('Chaque mois, le 1'), true);
  assert.equal(K.definition({ id: 'cp-x', rythme: 'inconnu', points: [] }).rythme, 'semaine');
  assert.equal(K.definition({ id: 'cp-x' }).points.length, 1);
});

test('Échéances : chaque jour, chaque semaine (lundi), chaque mois, à chaque poste ; retard après le jour attendu', () => {
  const st = K.reduire([]);
  // Mardi 17 novembre 2026, 10 h : chariot attendu lundi 16 (en retard), réfrigérateur aujourd'hui (à faire), sac le 1er (en retard)
  const e = K.echeancesPeriodiques(st, cfg, { service: 'U1', maintenant: L(17, 10) });
  const de = id => e.filter(x => x.def.id === id).map(x => [x.date, x.etat]);
  assert.deepEqual(de('cp-chariot'), [['2026-11-16', 'retard']]);
  assert.deepEqual(de('cp-frigo').slice(-2), [['2026-11-16', 'retard'], ['2026-11-17', 'aFaire']]);
  assert.deepEqual(de('cp-trousse'), [['2026-11-01', 'retard']]);
  assert.equal(e.some(x => x.def.id === 'cp-off'), false);
  // Rythme par poste
  const c2 = JSON.parse(JSON.stringify(cfg)); c2.controles.U1.periodiques = [Object.assign({}, frigo, { id: 'cp-poste', rythme: 'poste' })];
  const ep = K.echeancesPeriodiques(st, c2, { service: 'U1', maintenant: L(17, 10) });
  assert.equal(ep[ep.length - 1].poste, 'M');
  assert.equal(ep[ep.length - 1].etat, 'aFaire');
});

test('Saisie : valeur hors seuil et péremption dépassée = écart obligatoire ; second agent ; déjà fait', () => {
  const st0 = K.reduire([]);
  const base = { id: 'CT-1', modele: 'periodique', def: 'cp-frigo', service: 'U1', lieu: frigo.libelle, date: '2026-11-17', poste: 'jour', libellePoste: 'Jour', deuxAgents: false, nom: 'Agent A (fictif)' };
  // 9 °C annoncé conforme : refusé
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { items: items(frigo, (it, i) => i === 0 ? Object.assign(it, { valeur: 9 }) : it) }), ctx(st0)), /hors des seuils/);
  // 9 °C non conforme sans écart : refusé ; avec écart : accepté
  const nc = items(frigo, (it, i) => i === 0 ? Object.assign(it, { valeur: 9, ok: false }) : it);
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { items: nc }), ctx(st0)), /écart/);
  K.controler('CONTROLE', Object.assign({}, base, { items: nc, ecart: 'Porte restée ouverte, refermée, cadre prévenu (fictif)' }), ctx(st0));
  // Valeur manquante
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { items: items(frigo, (it, i) => i === 0 ? Object.assign(it, { valeur: '' }) : it) }), ctx(st0)), /valeur relevée/);
  // Péremption dépassée annoncée conforme : refusé
  const bc = Object.assign({}, base, { def: 'cp-chariot', lieu: chariot.libelle, date: '2026-11-16', poste: 'semaine', deuxAgents: true });
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, bc, { items: items(chariot, it => it.type === 'peremption' ? Object.assign(it, { peremption: '2026-11-01' }) : it) }), ctx(st0)), /dépassée/);
  // Contrôle inconnu
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, base, { def: 'cp-inconnu', items: items(frigo) }), ctx(st0)), /inconnu/);
  // Enregistré, puis doublon refusé, confirmation par un second agent
  const st = K.reduire([ev('a1', 'CONTROLE', Object.assign({}, bc, { id: 'CT-2', items: items(chariot) }))]);
  assert.throws(() => K.controler('CONTROLE', Object.assign({}, bc, { id: 'CT-3', items: items(chariot) }), ctx(st)), /déjà fait/);
  assert.throws(() => K.controler('CONTROLE_CONFIRME', { controle: 'CT-2', service: 'U1' }, ctx(st, 'a1')), /propre compte/);
  const e1 = K.echeancesPeriodiques(st, cfg, { service: 'U1', maintenant: L(17, 10) }).find(x => x.def.id === 'cp-chariot');
  assert.equal(e1.etat, 'retard');   // non confirmé, jour passé
  const st2 = K.reduire([ev('a1', 'CONTROLE', Object.assign({}, bc, { id: 'CT-2', items: items(chariot) })), ev('a2', 'CONTROLE_CONFIRME', { controle: 'CT-2', service: 'U1' })]);
  assert.equal(K.echeancesPeriodiques(st2, cfg, { service: 'U1', maintenant: L(17, 10) }).find(x => x.def.id === 'cp-chariot').etat, 'fait');
  assert.match(K.releves(st2.controles['CT-2']), /Numéro du scellé : S-0042 \(fictif\) ; Médicaments : première date de péremption : 30\/06\/2027/);
});

test('Après utilisation : contrôle demandé dans le délai, fait ou en retard', () => {
  const u = ev('a1', 'CONTROLE_UTILISATION', { id: 'UT-1', service: 'U1', def: 'cp-chariot', libelle: chariot.libelle, nom: 'Agent A (fictif)' }, L(17, 9));
  assert.throws(() => K.controler('CONTROLE_UTILISATION', { id: 'UT-2', service: 'U1', def: 'cp-frigo' }, ctx(K.reduire([]))), /après utilisation/);
  const st = K.reduire([u]);
  const a = K.echeancesPeriodiques(st, cfg, { service: 'U1', maintenant: L(17, 10) }).find(x => x.utilisation);
  assert.deepEqual([a.etat, a.poste, a.fin], ['aFaire', 'util-UT-1', L(17, 13)]);
  assert.equal(K.echeancesPeriodiques(st, cfg, { service: 'U1', maintenant: L(17, 14) }).find(x => x.utilisation).etat, 'retard');
  const fait = ev('a1', 'CONTROLE', { id: 'CT-9', modele: 'periodique', def: 'cp-chariot', service: 'U1', lieu: chariot.libelle, date: '2026-11-17', poste: 'util-UT-1', libellePoste: 'Après utilisation', utilisation: 'UT-1', deuxAgents: false, items: items(chariot), nom: 'A' }, L(17, 9, 30));
  assert.equal(K.echeancesPeriodiques(K.reduire([u, fait]), cfg, { service: 'U1', maintenant: L(17, 14) }).find(x => x.utilisation).etat, 'fait');
});

test('Péremptions : dernière date relevée, alerte avant le délai, dépassée', () => {
  const c = (id, le, per) => ev('a1', 'CONTROLE', { id, modele: 'periodique', def: 'cp-trousse', service: 'U1', lieu: trousse.libelle, date: le, poste: 'mois', libellePoste: 'Mois', deuxAgents: false,
    items: items(trousse, it => it.type === 'peremption' ? Object.assign(it, { peremption: per }) : it), nom: 'A' }, new Date(le + 'T10:00:00').getTime());
  const st = K.reduire([c('CT-a', '2026-10-01', '2026-11-05'), c('CT-b', '2026-11-01', '2026-12-10')]);
  const p = K.peremptions(st, cfg, 'U1', L(17, 10));
  assert.deepEqual(p.map(x => [x.peremption, x.etat]), [['2026-12-10', 'proche'], ['2026-12-10', 'proche']]);   // dernier contrôle seulement
  assert.deepEqual(K.peremptions(st, cfg, 'U1', L(11, 10) + 30 * 86400000).map(x => x.etat), ['depassee', 'depassee']);
  assert.equal(K.etatPoint({ type: 'peremption', peremption: '2027-06-30' }, '2026-11-17', 30), '');
});

test('Agenda : contrôles attendus par jour, poste résumé, état', () => {
  const st = K.reduire([]);
  const a = K.pourAgenda(st, cfg, { services: ['U1'], debut: '2026-11-16', fin: '2026-11-22', maintenant: L(17, 10) });
  const chariotL = a.filter(x => x.def === 'cp-chariot');
  assert.deepEqual(chariotL.map(x => [x.jour, x.etat]), [['2026-11-16', 'retard']]);
  assert.equal(a.filter(x => x.def === 'cp-frigo').length, 7);
  assert.equal(a.find(x => x.def === 'cp-frigo' && x.jour === '2026-11-20').etat, 'prevu');
  assert.ok(SIC.modules.lire('controles.periodiques', st, { services: ['U1'], debut: '2026-11-16', fin: '2026-11-16', config: cfg, maintenant: L(17, 10) }).length >= 2);
});

test('Cadre : règle les contrôles périodiques de ses seuls services', () => {
  const ancien = { U1: {}, U2: {} };
  assert.equal(K.controlerCadre(ancien, { U1: { periodiques: [chariot] }, U2: {} }, { roles: ['CADRE'], services: ['U1'] }), true);
  assert.equal(K.controlerCadre(ancien, { U1: {}, U2: { periodiques: [chariot] } }, { roles: ['CADRE'], services: ['U1'] }), false);
});
