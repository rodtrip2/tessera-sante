// SPDX-License-Identifier: EUPL-1.2
// Règle des mots de passe (0.75.0, constat S3 de l'audit) : règle renforcée (CNIL), règle simple, refus des mots de passe
// courants ou devinables. Mots de passe d'exemple inventés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MP = require('../app/js/mots-de-passe.js');
const ok = (m, ctx, r) => assert.equal(MP.refus(m, ctx, r), '', m);
const non = (m, motif, ctx, r) => assert.match(MP.refus(m, ctx, r), motif, m);

test('Règle renforcée : trois moyens d’atteindre le niveau demandé', () => {
  ok('Tr0mbone!Vert');                       // 12 caractères, quatre familles
  ok('grenouille-Bleue-42');                 // 14 caractères au moins, trois familles (ou plus)
  ok('trombonevertcarotte27X');              // 14 caractères, trois familles sans caractère spécial
  ok('le chat gris dort sur le vieux banc'); // phrase de sept mots au moins
  ok('k7mp-2qxa-9fht-w3cd');                 // mot de passe provisoire tiré au hasard
  non('Tr0mbone!Ve', /au moins 12/);
  non('trombonevertcarotte', /insuffisant/); // une seule famille
  non('trombone vert carotte', /insuffisant/);   // trois mots, deux familles
  non('Trombonevert1', /insuffisant/);       // 13 caractères, trois familles : 14 demandés
  non('un un un un un un un un', /insuffisant|répète/);   // sept mots identiques : pas une phrase
});

test('Règle simple : 12 caractères, mêmes refus', () => {
  ok('trombone vert carotte', null, 'simple');
  non('trombone', /au moins 12/, null, 'simple');
  non('motdepasse123', /courant/, null, 'simple');
});

test('Mots de passe courants ou devinables refusés', () => {
  non('Motdepasse2026!', /courant/);
  non('P@ssw0rd-P@ssw0rd', /courant/);
  non('Azertyuiop123!', /courant|clavier/);
  non('Soleil2026!!xx', /courant/);
  non('Abcdefgh1234!', /courant|clavier|alphabet/);
  non('Aa1!Aa1!Aa1!Aa1!', /répète/);
  non('aaaaaaaaaaaaA1!', /répète/);
  non('Jean.Dupont-2026!', /nom|identifiant/, { login: 'jean.dupont', nom: 'Jean DUPONT' });
  non('Hopital-Fictif-2026', /établissement/, { etablissement: 'Hôpital fictif' });
  ok('Jean-aime-les-Carottes-27', { login: 'jean.dupont', nom: 'Jean DUPONT' });   // le prénom n'est qu'une petite part
});

test('Consigne et règle par défaut', () => {
  assert.equal(MP.regleDe(undefined), 'renforcee');
  assert.equal(MP.regleDe('simple'), 'simple');
  assert.match(MP.consigne(), /7 mots/);
  assert.throws(() => MP.verifier('court'), /12 caractères/);
});
