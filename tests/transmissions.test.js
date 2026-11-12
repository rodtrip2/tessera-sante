// SPDX-License-Identifier: EUPL-1.2
// Tableau de transmissions (0.30.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/js/transmissions.js');
const V = require('../app/js/module-vue.js');

test('Mise en page : modèle, valeurs par défaut, validation', () => {
  const t = T.normaliser(undefined);
  assert.deepEqual(t.cases.map((c) => c.id), ['patient', 'consignes', 'evenements', 'notes']);
  assert.equal(t.cases[3].notes, true);
  assert.deepEqual([t.impression.faces, t.impression.orientation, t.impression.taches], [4, 'portrait', 'suite']);
  const x = T.normaliser({ police: 99, hauteurLigne: 20, cases: [{ id: 'A', titre: 'x', elements: [{ code: 'patient', gras: true }, { code: 'mode', taille: 50 }, { code: '' }] }], impression: { faces: 0, orientation: 'biais', taches: 'page' } });
  assert.equal(x.police, 8);
  assert.equal(x.hauteurLigne, 20);
  assert.equal(x.cases[0].id, 'k0');   // identifiant invalide remplacé
  assert.deepEqual(x.cases[0].elements.map((e) => [e.code, e.gras, e.ligne, e.taille]), [['patient', true, false, 0], ['mode', false, true, 0]]);
  assert.deepEqual([x.impression.faces, x.impression.orientation, x.impression.taches], [4, 'portrait', 'page']);
  assert.deepEqual(T.codes(T.modele({ consignes: ['c:consignes'] })).slice(-2), ['c:consignes', 'evenements']);
});

test('En-tête et pied de page : champs remplacés', () => {
  assert.equal(T.remplir('{service} — poste : {poste} — {inconnu}', { service: 'Unité 1 (fictive)', poste: 'Matin' }), 'Unité 1 (fictive) — poste : Matin — {inconnu}');
  assert.equal(T.remplir('Imprimé par {agent}', {}), 'Imprimé par');
});

test('Impression : pagination et échelle pour tenir sur le nombre de faces', () => {
  assert.equal(T.paginer(100, 20, [30, 30, 30]), 2);   // 80 utiles : deux lignes, puis une
  assert.equal(T.paginer(100, 20, [30, 30], { hauteur: 50, nouvellePage: true }), 2);
  assert.equal(T.paginer(100, 20, [30], { hauteur: 30 }), 1);   // tâches à la suite, place restante suffisante
  assert.equal(T.paginer(100, 20, [30], { hauteur: 80 }), 2);
  // 40 lignes de 20 : à l'échelle e, lignes de 20 e et en-tête de 20 e ; 4 pages de 100
  const e = T.echelle(4, 100, (k) => ({ repete: 20 * k, lignes: Array(40).fill(20 * k) }));
  assert.ok(e < 1 && e > 0.4, String(e));
  assert.ok(T.paginer(100, 20 * e, Array(40).fill(20 * e)) <= 4);
  assert.equal(T.echelle(4, 100, () => ({ repete: 10, lignes: [10, 10] })), 1);
  assert.deepEqual(T.zoneUtile({ orientation: 'portrait', numero: true }), { l: 198, h: 282 });
});

test('Tâches du poste : jour, nuit jusqu’au lendemain, tâches sans heure', () => {
  const t = (titre, heure, occurrence) => ({ tache: { titre, heure, service: 'U1' }, occurrence });
  const dues = [t('Matin', '08:00', '2026-11-12'), t('Soir', '19:00', '2026-11-12'), t('Nuit', '23:00', '2026-11-12'), t('Aube', '05:30', '2026-11-13'), t('Journée', '', '2026-11-12')];
  assert.deepEqual(T.tachesDuPoste(dues, '2026-11-12', { debut: '07:00', fin: '14:00' }, '2026-11-13').map((x) => x.titre), ['Matin', 'Journée']);
  assert.deepEqual(T.tachesDuPoste(dues, '2026-11-12', { debut: '21:00', fin: '07:00' }, '2026-11-13').map((x) => x.titre), ['Nuit', 'Aube']);
  const per = [{ code: 'M', debut: '07:00', fin: '14:00' }, { code: 'AM', debut: '14:00', fin: '21:00' }, { code: 'N', debut: '21:00', fin: '07:00' }];
  assert.equal(T.posteDe(per, new Date(2026, 10, 12, 3, 0).getTime()).code, 'N');
  assert.equal(T.posteDe(per, new Date(2026, 10, 12, 15, 0).getTime()).code, 'AM');
});

test('Vue de type transmissions : colonnes déduites des cases, gardée par le cadre', () => {
  const v = V.normaliser({ id: 'tr', nom: 'Transmissions', type: 'transmissions', lignes: 'patients', services: ['U1'], transmissions: T.modele({ consignes: ['c:consignes'] }) });
  assert.equal(v.type, 'transmissions');
  assert.ok(v.colonnes.some((c) => c.code === 'c:consignes') && v.colonnes.some((c) => c.code === 'evenements'));
  assert.equal(V.normaliser({ id: 'x', nom: 'X', type: 'transmissions', lignes: 'medecins' }).type, undefined);
  // Colonne « Prochains événements » : lue dans l'Agenda
  const cat = V.catalogue('patients', { config: {}, maintenant: Date.now(), evenements: (id) => id === 'P1' ? [{ debut: 1, quand: 'jeu. 14/11 10:00', titre: 'Entretien (fictif)' }] : [] });
  const c = V.colonneDe(cat, 'evenements');
  assert.equal(c.lire({ p: { id: 'P1' } }).lib, 'jeu. 14/11 10:00 Entretien (fictif)');
  assert.equal(c.lire({ p: { id: 'P2' } }).lib, '—');
});

test('Agenda : prochains événements par patient', () => {
  const A = require('../app/js/module-agenda.js');
  const d = new Date(2026, 10, 12, 0, 0).getTime();
  const st = { rdv: { r1: { id: 'r1', nature: 'entretien', titre: 'Entretien (fictif)', debut: d + 10 * 36e5, fin: d + 11 * 36e5, patients: ['P1'], service: 'U1' },
    r2: { id: 'r2', nature: 'activite', titre: '', debut: d + 30 * 36e5, patients: ['P1', 'P2'], service: 'U1' }, r3: { id: 'r3', nature: 'examen', debut: d + 5 * 864e5, patients: ['P1'], service: 'U1' } } };
  const ev = A.evenementsPatients(st, d, d + 3 * 864e5);
  assert.deepEqual(ev.P1.map((e) => e.titre), ['Entretien (fictif)', 'Activité thérapeutique']);
  assert.equal(ev.P2.length, 1);
});

test('Formats de date (12 novembre 2026)', () => {
  const n = new Date(2026, 10, 12).getTime();
  assert.deepEqual(['date', 'courte', 'jourMois', 'jours', 'jourMoisJours', 'longue'].map((f) => T.formaterDate('2026-10-03', f, { maintenant: n })), ['03/10/2026', '03/10/26', '03/10', '40 j', '03/10 (40 j)', '3 oct. 2026']);
  assert.equal(T.formaterDate('2026-09-13', 'jours', { maintenant: n, j: true }), 'J60');
  assert.equal(T.formaterDate('à faire', 'date'), null);
  assert.equal(T.formaterDate('2026-10-03', ''), null);
  assert.equal(T.element({ code: 'entree', format: 'bizarre' }, 0).format, '');
});

test('Suivi social et mesure de protection en oui ou non (12 novembre 2026)', () => {
  const cat = V.catalogue('patients', { config: {}, maintenant: Date.now() });
  const as = V.colonneDe(cat, 'suiviASOuiNon'), pr = V.colonneDe(cat, 'protectionOuiNon');
  assert.equal(as.lire({ p: { suiviAS: { suivi: true, nom: 'M. Social (fictif)' } } }).lib, 'Oui');   // sans le nom
  assert.equal(as.lire({ p: { suiviAS: { suivi: false } } }).lib, 'Non');
  assert.equal(pr.lire({ p: { protection: 'Curatelle (fictif)' } }).lib, 'Oui (Curatelle (fictif))');
  assert.equal(pr.lire({ p: {} }).lib, 'Non');
  assert.ok(T.codes(T.modele()).includes('suiviASOuiNon') && T.codes(T.modele()).includes('protectionOuiNon'));
});
