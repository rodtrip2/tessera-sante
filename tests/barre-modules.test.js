// SPDX-License-Identifier: EUPL-1.2
// Barre des modules : favoris épinglés et menu des autres modules (lot A, 14 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
const B = require('../app/js/barre-modules.js');

const dispo = ['aujourdhui', 'patients', 'isocont', 'agenda', 'vehicules', 'messagerie', 'equipe', 'admin'];

test('Option désactivée par défaut ; favoris proposés selon le rôle, remplaçables par l’établissement', () => {
  assert.equal(B.options({}).active, false);
  assert.deepEqual(B.options({}).defauts.IDE, ['aujourdhui', 'patients', 'agenda', 'isocont', 'messagerie']);
  const o = B.options({ barreModules: { active: true, defauts: { IDE: ['agenda', 'agenda', 'Mauvais!'], cadre: ['x'] } } });
  assert.deepEqual([o.active, o.defauts.IDE, o.defauts.cadre], [true, ['agenda'], undefined]);
});

test('Épinglés : choix de l’agent, sinon favoris de ses rôles, sinon tous ses modules ; limités aux fenêtres ouvertes à l’agent', () => {
  assert.deepEqual(B.epingles({}, null, ['IDE'], dispo), ['aujourdhui', 'patients', 'agenda', 'isocont', 'messagerie']);
  assert.deepEqual(B.epingles({}, null, ['IDE', 'SECRETAIRE'], dispo), ['aujourdhui', 'patients', 'agenda', 'isocont', 'messagerie'], 'union sans doublon, suivi absent des fenêtres');
  assert.deepEqual(B.epingles({}, null, ['CADRE'], dispo), dispo, 'rôle sans favoris : toute la barre');
  assert.deepEqual(B.epingles({}, ['equipe', 'inconnu', 'agenda'], ['IDE'], dispo), ['equipe', 'agenda'], 'choix personnel, dans son ordre');
  assert.deepEqual(B.epingles({}, [], ['IDE'], dispo), [], 'liste personnelle vide : rien d’épinglé');
});

test('Barre : fenêtre ouverte non épinglée ajoutée tant qu’elle est ouverte', () => {
  assert.deepEqual(B.boutons(['agenda', 'patients'], 'vehicules'), [{ id: 'agenda', temporaire: false }, { id: 'patients', temporaire: false }, { id: 'vehicules', temporaire: true }]);
  assert.deepEqual(B.boutons(['agenda'], 'agenda'), [{ id: 'agenda', temporaire: false }]);
});

test('Épingler, désépingler, réordonner ; pastille du menu', () => {
  let l = B.epingler(['agenda'], 'patients', true);
  assert.deepEqual(l, ['agenda', 'patients']);
  assert.deepEqual(B.epingler(l, 'agenda', false), ['patients']);
  assert.deepEqual(B.deplacer(['a1', 'b1', 'c1'], 'c1', -1), ['a1', 'c1', 'b1']);
  assert.deepEqual(B.deplacer(['a1', 'b1'], 'a1', -1), ['a1', 'b1'], 'déjà en tête');
  assert.equal(B.pastilleMenu(['agenda'], { agenda: 3, vehicules: 2, messagerie: 4 }), 6);
});
