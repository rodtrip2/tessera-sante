// SPDX-License-Identifier: EUPL-1.2
// Impression en couleur ou en noir et blanc (0.18.1, décision du porteur du 9 novembre 2026) : PDF ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDF = require('../app/js/pdf.js');

function texteDe(o) { return Buffer.from(o).toString('latin1'); }

test('PDF en noir et blanc : couleurs ramenées au gris, page désaturée (papier à en-tête compris) ; couleur par défaut', () => {
  const c = new PDF.Document({ titre: 'Essai (fictif)' });
  c.paragraphe('Texte rouge', { rgb: [1, 0, 0] });
  c.rect(10, 10, 50, 20, [0, 0.5, 1]);
  const tc = texteDe(c.octets());
  assert.ok(tc.includes('1 0 0 rg'), 'couleur gardée par défaut');
  assert.ok(!tc.includes('/Saturation'));
  const nb = new PDF.Document({ titre: 'Essai (fictif)', nb: true });
  nb.paragraphe('Texte rouge', { rgb: [1, 0, 0] });
  nb.rect(10, 10, 50, 20, [0, 0.5, 1]);
  const tn = texteDe(nb.octets());
  assert.ok(!tn.includes('1 0 0 rg'), 'plus de rouge');
  assert.ok(tn.includes('0.3 0.3 0.3 rg'), 'rouge ramené à sa luminance');
  assert.ok(tn.includes('/BM /Saturation') && tn.includes('/GSnb gs'), 'page entière désaturée');
});
