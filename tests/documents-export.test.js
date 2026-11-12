// SPDX-License-Identifier: EUPL-1.2
// Documents : exports Word, RTF, PDF, Excel, CSV ; droit d'exporter (0.40.0). Données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = {};
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js'); SIC.groupes = require('../app/js/groupes.js');
const DM = require('../app/js/module-documents.js'), T = require('../app/js/tableur.js'), X = require('../app/js/documents-export.js'), XL = require('../app/js/xlsx.js');

const m = { p: 'a1', n: 'Agent A (fictif)', le: '2026-11-12T10:00:00.000Z' };
const texte = DM.contenu({ blocs: [{ t: 'h1', runs: [{ x: 'Titre (fictif)' }] }, { t: 'p', runs: [{ x: 'Bonjour ' }, { x: 'gras', g: true }, { x: ' ajouté', ins: m }, { x: ' retiré', del: m }] },
  { t: 'li', liste: 'ol', runs: [{ x: 'Un' }] }, { t: 'table', entete: true, lignes: [[{ runs: [{ x: 'A' }] }, { runs: [{ x: 'B & C' }] }]] }, { t: 'saut' }], page: { pied: { droite: 'Page {page}' } } });
async function fichiersZip(o) { const z = XL.lireZip(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength)), r = {}; for (const k of Object.keys(z)) r[k] = new TextDecoder().decode(await z[k]()); return r; }

test('Word : paragraphes, titres, listes, tableau, saut de page, champ PAGE, révisions selon le choix', async () => {
  const f = await fichiersZip(X.docx(texte, { titre: 'Essai (fictif)' }, { suivi: 'marques' }));
  const d = f['word/document.xml'];
  assert.ok(f['[Content_Types].xml'] && f['word/styles.xml'] && f['word/numbering.xml']);
  assert.match(d, /<w:pStyle w:val="Titre1"\/>/); assert.match(d, /<w:b\/>/); assert.match(d, /<w:numId w:val="2"\/>/); assert.match(d, /<w:tbl>/); assert.match(d, /B &amp; C/); assert.match(d, /w:type="page"/);
  assert.match(d, /<w:ins w:id="\d+" w:author="Agent A \(fictif\)"/); assert.match(d, /<w:delText xml:space="preserve"> retiré<\/w:delText>/);
  assert.match(f['word/footer1.xml'], /PAGE/);
  const fin = (await fichiersZip(X.docx(texte, {}, { suivi: 'final' })))['word/document.xml'];
  assert.doesNotMatch(fin, /<w:ins |retiré/); assert.match(fin, / ajouté/);
});

test('RTF et PDF', () => {
  const r = X.rtf(texte, { titre: 'Essai (fictif)' });
  assert.match(r, /^\{\\rtf1\\ansi/); assert.match(r, /\\b gras/); assert.match(r, /\\trowd/); assert.match(r, /\\page/); assert.doesNotMatch(r, /retir/); assert.match(r, /\\u233\?/);   // « é »
  const p = X.pdfTexte(texte, { titre: 'Essai (fictif)' }, {});
  assert.equal(new TextDecoder().decode(p.slice(0, 5)), '%PDF-');
  assert.ok((new TextDecoder('latin1').decode(p).match(/\/Type \/Page /g) || []).length >= 2);   // saut de page
});

test('Excel : valeurs, formules en anglais avec résultats, formats, structure ; relu par le lecteur de Tessera', async () => {
  const c = T.contenu({ feuilles: [{ nom: 'Lits', cellules: { A1: { v: 'Total (fictif)', s: { g: true } }, A2: { v: 2 }, A3: { v: 3, s: { fmt: 'eur' } }, A4: { f: '=SOMME(A2:A3)' }, B1: { v: T.serieDepuis(2026, 11, 12), s: { fmt: 'date' } }, B4: { f: '=SI(A4>4;"oui";"non")' } },
    fusions: [{ l: 5, c: 0, nl: 1, nc: 2 }], figer: { l: 1 }, filtre: { l: 0, c1: 0, c2: 1, masques: {} }, validations: [{ plage: { l1: 1, c1: 0, l2: 3, c2: 0 }, genre: 'nombre', min: 0 }], conditions: [{ plage: { l1: 1, c1: 0, l2: 3, c2: 0 }, op: '>', v1: 2, style: { f: 'rose' } }] }, { nom: 'Réglages', cellules: { A1: { f: '=Lits!A4*2' } } }] });
  const o = X.xlsx(c, { titre: 'Essai (fictif)' }, {});
  const f = await fichiersZip(o), s1 = f['xl/worksheets/sheet1.xml'];
  assert.match(s1, /<f>SUM\(A2:A3\)<\/f><v>5<\/v>/); assert.match(s1, /<c r="B4" t="str"><f>IF\(A4&gt;4,&quot;oui&quot;,&quot;non&quot;\)<\/f><v>oui<\/v>/);
  assert.match(s1, /<mergeCell ref="A6:B6"\/>/); assert.match(s1, /state="frozen"/); assert.match(s1, /<autoFilter /); assert.match(s1, /<dataValidation type="decimal"/); assert.match(s1, /<cfRule type="cellIs"/);
  assert.match(f['xl/worksheets/sheet2.xml'], /<f>Lits!A4\*2<\/f><v>10<\/v>/); assert.match(f['xl/styles.xml'], /dd\/mm\/yyyy/);
  const lu = await XL.lire(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength));
  assert.deepEqual(lu.feuilles.Lits.slice(0, 4).map((l) => l[0]), ['Total (fictif)', 2, 3, 5]);
});

test('CSV : séparateur « ; », virgule décimale, dates, valeurs calculées, BOM', () => {
  const c = T.contenu({ feuilles: [{ cellules: { A1: { v: 'Nom; prénom' }, B1: { v: 2.5 }, C1: { v: T.serieDepuis(2026, 1, 2), s: { fmt: 'date' } }, A2: { f: '=B1*2' } } }] });
  assert.equal(X.csv(c, 0), '﻿"Nom; prénom";2,5;02/01/2026\r\n5;;\r\n');
  assert.equal(new TextDecoder().decode(X.pdfTableur(c, {}, {}).slice(0, 5)), '%PDF-');
});

test('Formules : traduction en anglais et retour en français', () => {
  assert.equal(T.versAnglais('=SI(SOMME(A1:A3;2,5)>10;"a;b";Réglages!B1)'), "IF(SUM(A1:A3,2.5)>10,\"a;b\",'Réglages'!B1)");
  assert.equal(T.depuisAnglais('IF(SUM(A1:A3,2.5)>10,"a,b",Sheet2!B1)'), '=SI(SOMME(A1:A3;2,5)>10;"a,b";Sheet2!B1)');
  assert.equal(T.depuisAnglais('XLOOKUP(A1,B:B,C:C)'), null);
});

test('Droit d’exporter : réglé par document par celui qui le gère (« modifier » par défaut), export inscrit au journal', () => {
  const at = new Date().toISOString();
  let st = DM.reduire([{ id: 'e1', at, by: 'a1', type: 'DOC', data: { id: 'DC00000020', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }, { genre: 'agent', code: 'i2', droit: 'modifier' }] } }]);
  const lecteur = { id: 'i1', roles: ['IDE'], services: ['U1'] }, modif = { id: 'i2', roles: ['IDE'], services: [] };
  assert.equal(DM.peutExporter(st.docs.DC00000020, lecteur, {}), false); assert.equal(DM.peutExporter(st.docs.DC00000020, modif, {}), true);
  assert.throws(() => DM.controler('DOC_OPTIONS', { doc: 'DC00000020', export: 'lire' }, { etat: st, compte: modif, config: {} }), /gère/);
  st = DM.reduire([{ id: 'e1', at, by: 'a1', type: 'DOC', data: { id: 'DC00000020', partage: [{ genre: 'service', code: 'U1', droit: 'lire' }] } }, { id: 'e2', at, by: 'a1', type: 'DOC_OPTIONS', data: { doc: 'DC00000020', export: 'lire' } },
    { id: 'e3', at, by: 'i1', type: 'DOC_EXPORT', data: { doc: 'DC00000020', format: 'pdf', version: 'v1' } }]);
  assert.equal(DM.peutExporter(st.docs.DC00000020, lecteur, {}), true); assert.equal(st.docs.DC00000020.exports.length, 1);
  assert.equal(DM.permisPourSoi('DOC_EXPORT', { doc: 'DC00000020' }, lecteur, { etat: st, config: {} }), true);
});
