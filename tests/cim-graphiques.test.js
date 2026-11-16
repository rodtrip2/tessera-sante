// SPDX-License-Identifier: EUPL-1.2
// Plusieurs codes CIM dans un seul champ et graphiques vectoriels en PDF (0.78.0, 16 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js'), validations: require('../app/js/validations.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const K = require('../app/js/module-clinique.js');
const P = require('../app/js/pdf.js');

test('CIM : codes séparés, libellés repris, séparateurs indifférents', () => {
  assert.deepEqual(K.separerCim('F20.0 Schizophrénie paranoïde ; F10.2, Z59.0 Sans abri'), [
    { code: 'F20.0', libelle: 'Schizophrénie paranoïde' }, { code: 'F10.2', libelle: '' }, { code: 'Z59.0', libelle: 'Sans abri' }]);
  assert.deepEqual(K.separerCim('f200;f102 ;Z590').map((c) => c.code), ['F200', 'F102', 'Z590']);
  assert.deepEqual(K.separerCim('F32.1 - épisode dépressif moyen\nF41.1 anxiété généralisée').map((c) => c.libelle), ['épisode dépressif moyen', 'anxiété généralisée']);
  assert.deepEqual(K.separerCim('F20.0 F10.2 U07.1').map((c) => c.code), ['F20.0', 'F10.2', 'U07.1']);
  assert.deepEqual(K.separerCim('F10.24 ; F19.2+').map((c) => c.code), ['F10.24', 'F19.2+']);
});

test('CIM : doublons ignorés, code dans un libellé non séparé, rien de reconnu', () => {
  assert.deepEqual(K.separerCim('F20.0 ; F200 Schizophrénie'), [{ code: 'F20.0', libelle: 'Schizophrénie' }]);
  assert.deepEqual(K.separerCim('D51.0 Anémie par carence en vitamine B12 ; E11.9'), [
    { code: 'D51.0', libelle: 'Anémie par carence en vitamine B12' }, { code: 'E11.9', libelle: '' }]);
  assert.deepEqual(K.separerCim('aucun code ici, A1, 20.0'), []);
  assert.deepEqual(K.separerCim(''), []);
  assert.ok(K.separerCim(Array.from({ length: 80 }, (_, i) => 'F' + String(10 + i).padStart(2, '0')).join(';')).length <= 50);
});

test('Graphique PDF : tracés SVG relus (arcs en courbes de Bézier, commandes relatives)', () => {
  const a = P.segmentsTrace('M10,10 L50,10 A40,40 0 0 1 10,50 Z');
  assert.deepEqual(a[0], ['M', 10, 10]);
  assert.equal(a[2][0], 'C');
  assert.ok(Math.abs(a[2][5] - 10) < 1e-9 && Math.abs(a[2][6] - 50) < 1e-9);
  assert.ok(Math.abs(a[2][1] - 50) < 1e-6 && Math.abs(a[2][2] - 32.0914) < 1e-3, 'point de contrôle d’un quart de cercle');
  assert.deepEqual(P.segmentsTrace('m5 5 h10 v10 z'), [['M', 5, 5], ['L', 15, 5], ['L', 15, 15], ['Z']]);
  assert.deepEqual(P.segmentsTrace('n’importe quoi'), []);
  assert.deepEqual(P.couleurDessin('#f00'), [1, 0, 0]);
  assert.equal(P.couleurDessin('none'), null);
});

test('Graphique PDF : dessin réduit à la page, formes et textes écrits, flux avancé', () => {
  const doc = new P.Document({});
  const y0 = doc.y;
  doc.dessin({ largeur: 720, hauteur: 200, elements: [
    { e: 'line', x1: 44, y1: 170, x2: 710, y2: 170, trait: [0.8, 0.8, 0.8], ep: 1 },
    { e: 'rect', x: 50, y: 100, w: 20, h: 70, fond: '#1f77b4' },
    { e: 'polyline', pts: '50,150 100,120 150,130', trait: '#ff7f0e', ep: 2 },
    { e: 'circle', cx: 300, cy: 100, r: 30, fond: [0.2, 0.6, 0.2] },
    { e: 'path', d: 'M300,100 L330,100 A30,30 0 0 1 300,130 Z', fond: '#d62728', trait: '#ffffff' },
    { e: 'text', x: 360, y: 186, t: 'Févr.', ancre: 'middle', taille: 11 },
    { e: 'text', x: 0, y: 0, t: '   ' }, { e: 'inconnu' }, null] }, { apres: 0 });
  const ops = doc.page.ops.join('\n');
  assert.match(ops, / re f Q/);
  assert.match(ops, / c /);
  assert.match(ops, /\(F\S*vr\.\) Tj/);
  assert.ok(Math.abs((y0 - doc.y) - 200 * (doc.largeurUtile / 720)) < 0.01, 'hauteur proportionnelle à la largeur utile');
  const o = doc.octets();
  assert.ok(o.length > 500 && String.fromCharCode.apply(null, o.slice(0, 5)) === '%PDF-');
  // Dessin vide ou mal formé : rien n'est écrit
  const d2 = new P.Document({}), y2 = d2.y;
  d2.dessin({ largeur: 0, hauteur: 10, elements: [] });
  assert.equal(d2.y, y2);
});

test('Graphique PDF : noir et blanc respecté, hauteur plafonnée', () => {
  const doc = new P.Document({ nb: true }), y0 = doc.y;
  doc.dessin({ largeur: 100, hauteur: 400, elements: [{ e: 'rect', x: 0, y: 0, w: 10, h: 10, fond: [1, 0, 0] }] }, { hauteurMax: 100, apres: 0 });
  assert.ok(Math.abs(y0 - doc.y - 100) < 0.01);
  assert.match(doc.page.ops.join('\n'), /0\.3 0\.3 0\.3 rg/);
});
