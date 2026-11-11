// SPDX-License-Identifier: EUPL-1.2
// Module Informations du service (0.26.2). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
const I = require('../app/js/module-infos.js');

let n = 0;
const ev = (by, data) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, 11, 8, n)).toISOString(), by, type: 'INFO_RUBRIQUE', data });
const cadre = { id: 'cadre', roles: ['CADRE'], services: ['U1'] }, ide = { id: 'ide', roles: ['IDE'], services: ['U1'] }, admin = { id: 'adm', roles: ['ADMIN'], services: [] };

test('Rubriques : rangées, masquées, retirées ; établissement et service séparés ; contacts', () => {
  const st = I.reduire([
    ev('cadre', { id: 'R2', service: 'U1', titre: 'Horaires', ordre: 2, texte: 'Visites 13 h 30 (fictif)' }),
    ev('cadre', { id: 'R1', service: 'U1', titre: 'Coordonnées du service', ordre: 1, contacts: [{ nom: 'Poste de soins (fictif)', numero: '4501' }, { nom: '', numero: '' }] }),
    ev('cadre', { id: 'R3', service: 'U1', titre: 'Brouillon', ordre: 3, masquee: true }),
    ev('cadre', { id: 'R4', service: 'U1', titre: 'Ancienne', ordre: 4 }), ev('cadre', { id: 'R4', supprime: true }),
    ev('adm', { id: 'E1', service: '*', titre: 'Numéros utiles', contacts: [{ nom: 'Sécurité (fictif)', numero: '1818' }] })]);
  assert.deepEqual(I.rubriques(st, 'U1').map((r) => r.id), ['R1', 'R2']);
  assert.deepEqual(I.rubriques(st, 'U1', true).map((r) => r.id), ['R1', 'R2', 'R3']);
  assert.equal(st.rubriques.R1.contacts.length, 1);   // contact vide écarté
  assert.deepEqual(I.contacts(st, '*').map((c) => c.rubrique), ['Numéros utiles']);
  assert.equal(I.ordreSuivant(st, 'U1'), 4);
  assert.ok(I.proposees(st, 'U1').every((r) => r.titre !== 'Coordonnées du service'));
});

test('Contrôles : le cadre tient ses services, l’administrateur l’établissement ; pièces jointes selon le réglage', () => {
  const st = I.reduire([]);
  const ok = (compte, d, config) => I.controler('INFO_RUBRIQUE', d, { etat: st, compte, config: config || {} });
  assert.doesNotThrow(() => ok(cadre, { id: 'X', service: 'U1', titre: 'Horaires' }));
  assert.throws(() => ok(cadre, { id: 'X', service: 'U2', titre: 'Horaires' }), /cadre du service/);
  assert.throws(() => ok(cadre, { id: 'X', service: '*', titre: 'Numéros' }), /administrateur/);
  assert.throws(() => ok(ide, { id: 'X', service: 'U1', titre: 'Horaires' }), /cadre/);
  assert.doesNotThrow(() => ok(admin, { id: 'X', service: '*', titre: 'Numéros' }));
  assert.throws(() => ok(cadre, { id: 'X', service: 'U1', titre: '' }), /titre/);
  assert.throws(() => ok(cadre, { id: 'X', service: 'U1', titre: 'T', pieces: [{ id: 'PJ1', nom: 'a.pdf' }] }), /pièces jointes/);
  assert.doesNotThrow(() => ok(cadre, { id: 'X', service: 'U1', titre: 'T', pieces: [{ id: 'PJ1', nom: 'a.pdf' }] }, { infos: { piecesJointes: true } }));
  assert.deepEqual(I.options({}), { piecesJointes: false, tailleMaxMo: 5 });
});
