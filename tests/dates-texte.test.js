// SPDX-License-Identifier: EUPL-1.2
// Date et heure lues dans un texte (lien d'un passage vers un nouvel événement, 24 novembre 2026). Données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../app/js/dates-texte.js');
const now = new Date(2026, 10, 24, 0, 30).getTime();
const lire = (t) => { const r = D.extraire(t, now); if (!r) return null; const d = new Date(r.debut), f = r.fin ? new Date(r.fin) : null; return [d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes(), f ? f.getHours() + ':' + f.getMinutes() : '', r.heure, r.titre]; };

test('Dates du texte : formats numériques et en lettres, heures, plages ; titre = le reste du texte', () => {
  assert.deepEqual(lire('Réunion institutionnelle le 3 décembre à 14h30'), ['2026-12-3 14:30', '', true, 'Réunion institutionnelle']);
  assert.deepEqual(lire('Formation AFGSU du 12/01/2027 de 9h à 17h'), ['2027-1-12 9:0', '17:0', true, 'Formation AFGSU']);
  assert.deepEqual(lire('mardi 1er décembre 10:00 - réunion de pôle'), ['2026-12-1 10:0', '', true, 'Réunion de pôle']);
  assert.deepEqual(lire('Point avec la famille demain à 15 h'), ['2026-11-25 15:0', '', true, 'Point avec la famille']);
  assert.deepEqual(lire('Synthèse 2026-12-05 14h-15h30 salle 2'), ['2026-12-5 14:0', '15:30', true, 'Synthèse salle 2']);
  assert.deepEqual(lire('Visite le 12.03.27'), ['2027-3-12 10:0', '', false, 'Visite']);
  assert.deepEqual(lire('Relire le protocole avant le 30/11'), ['2026-11-30 10:0', '', false, 'Relire le protocole']);
});
test('Dates du texte : sans année, la prochaine date ; date impossible ou absente : rien', () => {
  assert.equal(lire('Commission des menus 15 nov.')[0], '2027-11-15 10:0');
  assert.equal(lire('Commission le 24/11')[0], '2026-11-24 10:0');   // aujourd'hui compte comme à venir
  assert.equal(D.extraire('Le 31/02 à 10h', now), null);
  assert.equal(D.extraire('Rien de daté ici', now), null);
  assert.equal(D.extraire('', now), null);
  assert.equal(lire('Le 3/12 à 25h')[2], false);   // heure impossible : ignorée
});
