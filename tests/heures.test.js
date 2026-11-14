// SPDX-License-Identifier: EUPL-1.2
// Module Heures supplémentaires (lot C, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const HS = require('../app/js/module-heures.js');
const V = require('../app/js/validations.js');

let n = 0;
const ev = (by, type, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 10, 8, n)).toISOString(), by, type, data });
const cadre = { id: 'c1', roles: ['CADRE'], services: ['U1'] }, ide = { id: 'i1', roles: ['IDE'], services: ['U1'] }, ide2 = { id: 'i2', roles: ['IDE'], services: ['U2'] }, sec = { id: 's1', roles: ['SECRETAIRE'], services: ['U1'] };
const cadre2 = { id: 'c2', roles: ['CADRE'], services: ['U1'] }, sup = { id: 'cs', roles: ['CADRE_SUP'], services: ['U1'] };
const comptes = [cadre, cadre2, ide, ide2, sec, sup];
const decl = (by, id, date, minutes, extra) => ev(by, 'HEURES_DECLARATION', Object.assign({ id, date, debut: '', fin: '', minutes, motif: 'depassement', service: 'U1', nom: 'Agent (fictif)' }, extra || {}));

test('Durées : horaires (passage de minuit), lecture « 1:30 », « 1h30 », « 90 », affichage en heures et minutes', () => {
  assert.equal(HS.duree('19:00', '20:30'), 90);
  assert.equal(HS.duree('21:00', '07:00'), 600);
  assert.equal(HS.duree('25:00', '07:00'), null);
  assert.deepEqual(['1:30', '1h30', '1 h 30', '90', '2h', '0:45', '1:75', 'abc', ''].map(HS.lireDuree), [90, 90, 90, 90, 120, 45, null, null, null]);
  assert.deepEqual([HS.hm(90), HS.hm(45), HS.hm(120), HS.hm(-150), HS.hm(65)], ['1 h 30', '45 min', '2 h', '−2 h 30', '1 h 05']);
});

test('Réglages : motifs par défaut, paiement désactivé par défaut, plafond validé, validateurs des Congés repris', () => {
  const o = HS.options({});
  assert.equal(o.paiement, false);
  assert.equal(o.plafondMensuel, null);
  assert.ok(o.motifs.some((m) => m.code === 'rappel'));
  assert.equal(o.etapeGtt, true);
  assert.deepEqual(o.rolesGtt, ['CADRE', 'SECRETAIRE']);
  assert.equal(HS.options({ heures: { plafondMensuel: -5 } }).plafondMensuel, null);
  assert.equal(HS.options({ heures: { motifs: [{ libelle: '' }] } }).motifs.length, HS.MOTIFS_DEFAUT.length);
  assert.equal(HS.options({ conges: { validateurs: { IDE: 'CADRE_SUP' } } }).validateurs.IDE, 'CADRE_SUP');
  assert.equal(HS.valide({}, cadre, ide), true);
  assert.equal(HS.valide({}, cadre, ide2), false);    // autre service
  assert.equal(HS.valide({}, cadre, cadre2), false);  // le cadre est validé par le cadre supérieur
  assert.equal(HS.valide({}, sup, cadre2), true);
  assert.equal(HS.valide({}, cadre, cadre), false);   // jamais soi-même
});

test('Déclaration, décision en récupération (en partie), récupération, solde, correction, avis à l’agent', () => {
  const evts = [decl('i1', 'D1', '2026-11-02', 90), decl('i1', 'D2', '2026-11-05', 60),
    ev('c1', 'HEURES_DECISION', { declaration: 'D1', decision: 'recuperation', minutes: 90 }),
    ev('c1', 'HEURES_DECISION', { declaration: 'D2', decision: 'recuperation', minutes: 45, motif: 'D’après le planning (fictif)' }),
    ev('i1', 'HEURES_RECUP', { id: 'R1', date: '2026-11-20', minutes: 60, service: 'U1' }),
    ev('c1', 'HEURES_RECUP_DECISION', { recup: 'R1', decision: 'valide' }),
    ev('i1', 'HEURES_RECUP', { id: 'R2', date: '2026-11-25', minutes: 30, service: 'U1' }),
    ev('c1', 'HEURES_CORRECTION', { agent: 'i1', annee: '2026', minutes: 120, motif: 'Reprise du solde (fictif)' })];
  const st = HS.reduire(evts);
  assert.equal(st.declarations.D2.retenues, 45);
  const so = HS.solde(st, 'i1', 2026);
  assert.deepEqual([so.acquises, so.recuperees, so.demandees, so.corrections, so.calcule, so.solde, so.disponible], [135, 60, 30, 120, 75, 195, 165]);
  assert.equal(HS.avisPour(st, 'i1', []).length, 3);
  assert.equal(HS.avisPour(st, 'i1', [st.avis[0].id]).length, 2);
  assert.deepEqual(HS.aValider(st, {}, comptes, cadre).map((x) => x.id), ['R2']);
  assert.deepEqual(HS.deAgent(st, 'i1', 2026).map((x) => x.id), ['R2', 'R1', 'D2', 'D1']);
  // Récupération au-delà du disponible refusée
  assert.throws(() => HS.controler('HEURES_RECUP', { id: 'R3', date: '2026-12-01', minutes: 200 }, { etat: st, config: {}, compte: ide }), /solde disponible/);
  assert.doesNotThrow(() => HS.controler('HEURES_RECUP', { id: 'R3', date: '2026-12-01', minutes: 165 }, { etat: st, config: {}, compte: ide }));
});

test('Contrôles : saisie, durée et horaires, motif, refus motivé, validateur, paiement et plafond, annulation, enregistrement', () => {
  const ctx = (compte, config, st) => ({ etat: st || HS.reduire([]), config: config || {}, compte, comptes });
  assert.throws(() => HS.controler('HEURES_DECLARATION', { id: 'X', date: '', minutes: 60, motif: 'rappel' }, ctx(ide)), /date/);
  assert.throws(() => HS.controler('HEURES_DECLARATION', { id: 'X', date: '2026-11-02', minutes: 0, motif: 'rappel' }, ctx(ide)), /durée/);
  assert.throws(() => HS.controler('HEURES_DECLARATION', { id: 'X', date: '2026-11-02', debut: '19:00', fin: '20:00', minutes: 90, motif: 'rappel' }, ctx(ide)), /horaires/);
  assert.throws(() => HS.controler('HEURES_DECLARATION', { id: 'X', date: '2026-11-02', minutes: 60, motif: 'inconnu' }, ctx(ide)), /motif/);
  assert.doesNotThrow(() => HS.controler('HEURES_DECLARATION', { id: 'X', date: '2026-11-02', debut: '19:00', fin: '20:00', minutes: 60, motif: 'rappel' }, ctx(ide)));
  const st = HS.reduire([decl('i1', 'D1', '2026-11-02', 300), decl('i1', 'D2', '2026-11-09', 300), decl('i2', 'D3', '2026-11-03', 60, { service: 'U2' })]);
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D1', decision: 'refuse' }, ctx(cadre, {}, st)), /motif du refus/);
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D3', decision: 'recuperation' }, ctx(cadre, {}, st)), /ne validez pas/);
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D1', decision: 'recuperation', minutes: 400 }, ctx(cadre, {}, st)), /Durée retenue/);
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D1', decision: 'paiement' }, ctx(cadre, {}, st)), /n’autorise pas/);
  const cfg = { heures: { paiement: true, plafondMensuel: 420 } };
  assert.doesNotThrow(() => HS.controler('HEURES_DECISION', { declaration: 'D1', decision: 'paiement' }, ctx(cadre, cfg, st)));
  const st2 = HS.reduire([decl('i1', 'D1', '2026-11-02', 300), decl('i1', 'D2', '2026-11-09', 300), ev('c1', 'HEURES_DECISION', { declaration: 'D1', decision: 'paiement', minutes: 300 })]);
  assert.equal(HS.payeesDuMois(st2, 'i1', '2026-11'), 300);
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D2', decision: 'paiement' }, ctx(cadre, cfg, st2)), /Plafond mensuel/);
  assert.doesNotThrow(() => HS.controler('HEURES_DECISION', { declaration: 'D2', decision: 'paiement', minutes: 120 }, ctx(cadre, cfg, st2)));
  assert.throws(() => HS.controler('HEURES_DECISION', { declaration: 'D1', decision: 'recuperation' }, ctx(cadre, cfg, st2)), /Déjà décidé/);
  // Annulation par l'agent seulement, tant que la demande n'est pas décidée
  assert.throws(() => HS.controler('HEURES_ANNULATION', { objet: 'D2' }, ctx(cadre, {}, st2)), /Seul l’agent/);
  assert.doesNotThrow(() => HS.controler('HEURES_ANNULATION', { objet: 'D2' }, ctx(ide, {}, st2)));
  assert.throws(() => HS.controler('HEURES_ANNULATION', { objet: 'D1' }, ctx(ide, {}, st2)), /pas encore décidée/);
  // Enregistrement dans le logiciel de gestion du temps : rôles réglés, une seule fois
  assert.doesNotThrow(() => HS.controler('HEURES_ENREGISTREE', { objet: 'D1' }, ctx(sec, {}, st2)));
  assert.throws(() => HS.controler('HEURES_ENREGISTREE', { objet: 'D1' }, ctx(ide, {}, st2)), /Votre rôle/);
  assert.throws(() => HS.controler('HEURES_ENREGISTREE', { objet: 'D1' }, ctx(sec, { heures: { etapeGtt: false } }, st2)), /non utilisée/);
  assert.throws(() => HS.controler('HEURES_ENREGISTREE', { objet: 'D2' }, ctx(sec, {}, st2)), /acceptée/);
  const st3 = HS.reduire([decl('i1', 'D1', '2026-11-02', 300), ev('c1', 'HEURES_DECISION', { declaration: 'D1', decision: 'recuperation' }), ev('s1', 'HEURES_ENREGISTREE', { objet: 'D1' })]);
  assert.equal(st3.declarations.D1.gtt.par, 's1');
  assert.throws(() => HS.controler('HEURES_ENREGISTREE', { objet: 'D1' }, ctx(sec, {}, st3)), /Déjà/);
  assert.deepEqual(HS.aEnregistrer(st2, {}, ['SECRETAIRE'], ['U1']).map((x) => x.id), ['D1']);
  assert.deepEqual(HS.aEnregistrer(st2, {}, ['IDE'], ['U1']), []);
  // Correction de solde : motif obligatoire, validateur seulement
  assert.throws(() => HS.controler('HEURES_CORRECTION', { agent: 'i1', annee: '2026', minutes: 60, motif: '' }, ctx(cadre, {}, st)), /motif/);
  assert.throws(() => HS.controler('HEURES_CORRECTION', { agent: 'i2', annee: '2026', minutes: 60, motif: 'x' }, ctx(cadre, {}, st)), /ne validez pas/);
  assert.doesNotThrow(() => HS.controler('HEURES_CORRECTION', { agent: 'i1', annee: '2026', minutes: -60, motif: 'x' }, ctx(cadre, {}, st)));
});

test('Droits pour soi, totaux, export, fonction soumise à avis livrée désactivée', () => {
  const st = HS.reduire([decl('i1', 'D1', '2026-03-02', 90, { motif: 'rappel' }), decl('i1', 'D2', '2026-03-09', 60), decl('c1', 'D3', '2026-04-01', 30),
    ev('c1', 'HEURES_DECISION', { declaration: 'D1', decision: 'recuperation' }), ev('cs', 'HEURES_DECISION', { declaration: 'D3', decision: 'recuperation' })]);
  assert.equal(HS.permisPourSoi('HEURES_DECISION', { declaration: 'D2', decision: 'recuperation' }, cadre, { etat: st, config: {}, comptes }), true);
  assert.equal(HS.permisPourSoi('HEURES_DECISION', { declaration: 'D2', decision: 'recuperation' }, ide, { etat: st, config: {}, comptes }), false);
  assert.equal(HS.permisPourSoi('HEURES_DECLARATION', {}, cadre, { etat: st, config: {}, comptes }), false);
  const t = HS.totaux(st, 2026, ['U1']);
  assert.deepEqual([t.agents.i1.recuperation, t.agents.c1.recuperation, t.mois['03'], t.mois['04'], t.motifs.rappel], [90, 30, 90, 30, 90]);
  const l = HS.lignesExport([st.declarations.D1, st.declarations.D2], {}, (x) => 'Unité ' + x);
  assert.equal(l.length, 3);
  assert.deepEqual([l[1][1], l[1][2], l[1][6], l[1][8], l[1][9], l[2][9]], ['Unité U1', 'Heures supplémentaires', '1 h 30', 'Rappel sur un repos', 'Accepté en récupération', 'À valider']);
  assert.equal(V.etat({}, 'heures').etat, 'desactive');
  assert.equal(V.moduleAutorise('heures', {}), false);
  assert.equal(V.moduleAutorise('heures', { validations: { etats: { heures: { etat: 'accord', date: '2026-11-14', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-13' } } } }), true);
  assert.equal(HS.contrat.id, 'heures');
  assert.ok(HS.contrat.vues.onglets.find((o) => o.code === 'a-valider').droit.includes('HEURES_DECISION'));
});
