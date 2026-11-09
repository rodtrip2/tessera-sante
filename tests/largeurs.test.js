// SPDX-License-Identifier: EUPL-1.2
// Largeur des colonnes des tableaux (0.20.0)
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../app/js/largeurs.js');
const L = require('../app/js/liste-patients.js');

test('Largeurs : bornes, carte, réglage d’une colonne', () => {
  assert.equal(K.largeur(39), 0); assert.equal(K.largeur(40), 40); assert.equal(K.largeur(801), 0); assert.equal(K.largeur('120.4'), 120);
  assert.deepEqual(K.carte({ Patient: 150, Mode: 10, '': 100 }), { Patient: 150 });
  assert.deepEqual(K.regler({ Patient: 150 }, 'Mode', 90), { Patient: 150, Mode: 90 });
  assert.deepEqual(K.regler({ Patient: 150 }, 'Patient', 0), {});
  assert.equal(K.codeTitre(' Patient ▲ '), 'Patient');
});

test('Isolement et contention : largeurs de l’établissement, du service, contrôle du cadre', () => {
  let v = K.reglerCommun({}, 'isocont/encours/Patient', ['*'], 'Patient', 200);
  v = K.reglerCommun(v, 'isocont/encours/Patient', ['U1'], 'Patient', 120);
  v = K.reglerCommun(v, 'isocont/encours/Patient', ['*'], 'Mesure', 90);
  const config = { largeursColonnes: v };
  assert.deepEqual(K.pourService(config, 'isocont/encours/Patient', 'U1'), { Patient: 120, Mesure: 90 });   // le service l'emporte
  assert.deepEqual(K.pourService(config, 'isocont/encours/Patient', 'U2'), { Patient: 200, Mesure: 90 });
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  assert.equal(K.controlerCadre(v, K.reglerCommun(v, 'isocont/encours/Patient', ['U1'], 'Mesure', 60), cadre), true);
  assert.equal(K.controlerCadre(v, K.reglerCommun(v, 'isocont/encours/Patient', ['*'], 'Mesure', 60), cadre), false);   // établissement : administrateur
  assert.equal(K.controlerCadre(v, K.reglerCommun(v, 'isocont/encours/Patient', ['U2'], 'Mesure', 60), cadre), false);  // autre service
  assert.equal(K.controlerCadre(v, K.reglerCommun(v, 'x', ['*'], 'Mesure', 60), { roles: ['ADMIN'] }), true);
  assert.equal(K.controlerCadre(v, v, { roles: ['IDE'], services: ['U1'] }), false);
  assert.deepEqual(K.reglerCommun(v, 'isocont/encours/Patient', ['U1'], 'Patient', 0)['isocont/encours/Patient'].U1, undefined);   // retour à l'automatique
});

test('Liste des patients : largeurs gardées avec l’affichage, validées', () => {
  const r = L.reglage({ colonnes: ['patient', 'mode'], largeurs: { patient: 180, mode: 20, inconnue: 100, 'c:telephone': 90 } });
  assert.deepEqual(r.largeurs, { patient: 180, 'c:telephone': 90 });
  assert.deepEqual(L.reglage({}).largeurs, {});
});
