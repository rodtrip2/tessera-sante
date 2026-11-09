// SPDX-License-Identifier: EUPL-1.2
// Formules des colonnes calculées (0.19.2, décisions du porteur du 9 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../app/js/formules.js');

const maintenant = new Date(2026, 10, 9, 12).getTime();
const ligne = { 'Date d’entrée': '2026-11-01', 'Mode': 'SDT', 'Sorties libres': true, 'Âge': 41, 'Médecin de 1re ligne': '', 'Check-list': 0.5, 'Naissance': '1985-11-10' };
const ctx = { maintenant, valeur: (n) => { if (!(n in ligne)) { const e = new Error('Colonne inconnue « ' + n + ' ».'); e.formule = true; throw e; } return ligne[n]; } };

test('Formules : dates, conditions, textes, nombres', () => {
  assert.equal(F.evaluer('JOURS([Date d’entrée])', ctx), 8);
  assert.equal(F.evaluer('"J" & JOURS([Date d’entrée])', ctx), 'J8');
  assert.equal(F.evaluer('AJOUTER_JOURS([Date d’entrée]; 30)', ctx), '2026-12-01');
  assert.equal(F.evaluer('[Date d’entrée] + 7', ctx), '2026-11-08');
  assert.equal(F.evaluer('AUJOURDHUI() - [Date d’entrée]', ctx), 8);
  assert.equal(F.evaluer('AGE([Naissance])', ctx), 40, 'anniversaire demain');
  assert.equal(F.evaluer('SI([Mode]="sdt"; "Tiers"; "Autre")', ctx), 'Tiers', 'comparaison sans majuscules');
  assert.equal(F.evaluer('SI(ET([Sorties libres]; [Âge] >= 18); "oui"; "non")', ctx), 'oui');
  assert.equal(F.evaluer('SI(ESTVIDE([Médecin de 1re ligne]); "À attribuer")', ctx), 'À attribuer');
  assert.equal(F.evaluer('ARRONDI([Check-list] * 100)', ctx), 50);
  assert.equal(F.evaluer('NB([Mode]; [Médecin de 1re ligne]; [Âge])', ctx), 2);
  assert.equal(F.evaluer('2 + 3 * 4 - 10 / 5', ctx), 12);
  assert.equal(F.evaluer('1,5 * 2', ctx), 3, 'virgule décimale');
  assert.equal(F.evaluer('CONTIENT("Piscine, Jardin"; "jardin")', ctx), true);
  assert.equal(F.evaluer('SIERREUR(JOURS([Médecin de 1re ligne]); "—")', ctx), '—');
  assert.deepEqual(F.references('SI([Mode]="SDT"; JOURS([Date d’entrée]))'), ['Mode', 'Date d’entrée']);
});

test('Formules : erreurs explicites, formules prêtes', () => {
  assert.throws(() => F.analyser('SI([Mode]="SDT"; 1'), /« \) » attendu/);
  assert.throws(() => F.analyser('JOUR([Date d’entrée]'), /« \) » attendu/);
  assert.throws(() => F.analyser('INCONNUE(1)'), /Fonction inconnue/);
  assert.throws(() => F.analyser('JOURS()'), /1 à 2 argument/);
  assert.throws(() => F.evaluer('JOURS([Mode])', ctx), /date attendue/);
  assert.throws(() => F.evaluer('1 / 0', ctx), /Division par zéro/);
  assert.throws(() => F.evaluer('[Absente] + 1', ctx), /Colonne inconnue/);
  assert.throws(() => F.verifier('[Absente] + 1', ['Mode']), /Colonne inconnue/);
  assert.equal(F.depuisPrete('jours-depuis', { date: 'Date d’entrée' }), 'JOURS([Date d’entrée])');
  assert.equal(F.depuisPrete('renseignees', { a: 'Mode', b: 'Âge' }), 'NB([Mode]; [Âge])');
  assert.equal(F.depuisPrete('echeance', { date: 'Date d’entrée', n: 30 }), 'AJOUTER_JOURS([Date d’entrée]; 30)');
  assert.equal(F.evaluer(F.depuisPrete('si-vide', { a: 'Médecin de 1re ligne', texte: 'À attribuer' }), ctx), 'À attribuer');
  assert.throws(() => F.depuisPrete('jours-depuis', {}), /Choisissez/);
});
