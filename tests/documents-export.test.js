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

const I = require('../app/js/documents-import.js');
test('Import Word : aller-retour d’un document exporté (titres, mises en forme, listes, tableau, saut, révisions)', async () => {
  const o = X.docx(texte, { titre: 'Essai (fictif)' }, { suivi: 'marques' });
  const r = await I.importer('Essai (fictif).docx', o);
  assert.equal(r.titre, 'Essai (fictif)');
  const b = r.contenu.blocs;
  assert.deepEqual(b.map((x) => x.t), ['h1', 'p', 'li', 'table', 'saut']);
  assert.equal(b[1].runs.find((x) => x.x === 'gras').g, true);
  assert.equal(b[1].runs.find((x) => x.x === ' ajouté').ins.n, 'Agent A (fictif)'); assert.ok(b[1].runs.find((x) => x.x === ' retiré').del);
  assert.equal(b[2].liste, 'ol'); assert.equal(b[3].entete, true); assert.equal(DM.texteBloc(b[3]), 'A | B & C');
});

test('Import Excel : aller-retour (valeurs, formules traduites, formats, fusions, volets, filtre, validations, conditions)', async () => {
  const c = T.contenu({ feuilles: [{ nom: 'Lits', cellules: { A1: { v: 'Titre (fictif)', s: { g: true, f: 'jaune' } }, A2: { v: 2 }, A3: { v: 3.5, s: { fmt: 'eur' } }, A4: { f: '=SOMME(A2:A3)' }, B2: { v: T.serieDepuis(2026, 11, 12), s: { fmt: 'date' } }, B4: { f: '=SI(A4>4;"oui";"non")' }, C4: { f: '=A4*Réglages!A1' } },
    largeurs: { 0: 140 }, fusions: [{ l: 0, c: 0, nl: 1, nc: 2 }], figer: { l: 1 }, filtre: { l: 0, c1: 0, c2: 1, masques: {} }, validations: [{ plage: { l1: 1, c1: 2, l2: 9, c2: 2 }, genre: 'liste', valeurs: ['Jour', 'Nuit'] }],
    conditions: [{ plage: { l1: 1, c1: 0, l2: 3, c2: 0 }, op: '>', v1: 3, style: { f: 'rose' } }] }, { nom: 'Réglages', cellules: { A1: { v: 2 } } }] });
  const r = await I.importer('Lits.xlsx', X.xlsx(c, {}, {}));
  const f = r.contenu.feuilles[0];
  assert.deepEqual(r.contenu.feuilles.map((x) => x.nom), ['Lits', 'Réglages']);
  assert.equal(f.cellules.A4.f, '=SOMME(A2:A3)'); assert.equal(f.cellules.B4.f, '=SI(A4>4;"oui";"non")'); assert.equal(f.cellules.C4.f, "=A4*'Réglages'!A1");
  assert.deepEqual(f.cellules.A1.s, { g: true, f: 'jaune' }); assert.equal(f.cellules.A3.s.fmt, 'eur'); assert.equal(f.cellules.B2.s.fmt, 'date'); assert.equal(f.largeurs[0], 140);
  assert.deepEqual(f.fusions, [{ l: 0, c: 0, nl: 1, nc: 2 }]); assert.equal(f.figer.l, 1); assert.equal(f.filtre.c2, 1);
  assert.deepEqual(f.validations[0].valeurs, ['Jour', 'Nuit']); assert.equal(f.conditions[0].op, '>'); assert.equal(f.conditions[0].style.f, 'rose');
  const calc = T.calculer(r.contenu); assert.equal(calc.valeur(0, 3, 0), 5.5); assert.equal(calc.valeur(0, 3, 2), 11);
});

test('Import CSV et formats refusés', async () => {
  const r = await I.importer('liste.csv', new TextEncoder().encode('﻿Nom;Montant;Date\r\n"Dupont; fictif";12,5;03/11/2026\r\n'));
  assert.equal(r.contenu.feuilles[0].cellules.A2.v, 'Dupont; fictif'); assert.equal(r.contenu.feuilles[0].cellules.B2.v, 12.5); assert.equal(r.contenu.feuilles[0].cellules.C2.s.fmt, 'date');
  await assert.rejects(I.importer('ancien.doc', new Uint8Array(4)), /réenregistrer/);
});

// ------------------------------------------------------------ Images et masques de fond (0.42.0)
// Petite image JPEG valide (1 × 1 pixel) et PNG (1 × 1 pixel), fictives
const JPEG = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const avecImages = DM.contenu({ blocs: [{ t: 'p', runs: [{ x: 'Avant (fictif)' }] }, { t: 'img', id: 'im0000a1a1a1', l: 60, al: 'c', leg: 'Plan (fictif)' }, { t: 'p', runs: [{ x: 'Après' }] }],
  page: { masque: { image: 'im0000e1e1e1', pages: 'premiere', opacite: 0.5, source: 'mqetab01', nom: 'En-tête (fictif)' } } });
const imgs = { im0000a1a1a1: { type: 'png', octets: PNG, jpeg: JPEG, largeur: 1200, hauteur: 700 }, im0000e1e1e1: { type: 'jpeg', octets: JPEG, jpeg: JPEG, largeur: 1654, hauteur: 2339 } };

test('Images : bloc validé (largeur, alignement, légende), masque de page validé', () => {
  assert.deepEqual(DM.bloc({ t: 'img', id: 'im00ab12', l: 300, al: 'x' }), { t: 'img', id: 'im00ab12', l: 50, al: 'c' });
  assert.equal(DM.bloc({ t: 'img', id: '../x' }), null);
  assert.equal(avecImages.blocs[1].leg, 'Plan (fictif)');
  assert.deepEqual(avecImages.page.masque, { image: 'im0000e1e1e1', pages: 'premiere', opacite: 0.5, source: 'mqetab01', nom: 'En-tête (fictif)' });
  assert.equal(DM.page({ masque: { image: 'nimporte' } }).masque, undefined);
  assert.equal(DM.page({ masque: { image: 'im0000e1e1e1', opacite: 7 } }).masque.opacite, 1);
  assert.equal(DM.texteBloc(avecImages.blocs[1]).indexOf('[image'), 0);
});

test('Export Word : image en ligne (word/media), masque ancré derrière le texte dans l’en-tête de la 1re page, opacité', async () => {
  const f = await fichiersZip(X.docx(avecImages, { titre: 'Images (fictif)' }, { images: imgs }));
  const d = f['word/document.xml'];
  assert.match(d, /<wp:inline/); assert.match(d, /r:embed="rIdImg1"/); assert.match(d, /Plan \(fictif\)/); assert.match(d, /<w:titlePg\/>/); assert.match(d, /w:type="first" r:id="rIdHeader2"/);
  assert.ok(f['word/media/image1.png'] !== undefined && f['word/media/image2.jpeg'] !== undefined);
  assert.match(f['word/header2.xml'], /behindDoc="1"/); assert.match(f['word/header2.xml'], /alphaModFix amt="50000"/); assert.doesNotMatch(f['word/header1.xml'], /<w:drawing/);
  assert.match(f['word/_rels/header2.xml.rels'], /media\/image2\.jpeg/); assert.match(f['[Content_Types].xml'], /Extension="png"/);
  // Toutes les pages : masque dans l'en-tête par défaut
  const g = await fichiersZip(X.docx(DM.contenu(Object.assign({}, avecImages, { page: Object.assign({}, avecImages.page, { masque: Object.assign({}, avecImages.page.masque, { pages: 'toutes' }) }) })), {}, { images: imgs }));
  assert.match(g['word/header1.xml'], /behindDoc="1"/); assert.ok(!g['word/header2.xml']);
  // Sans les octets de l'image : repère texte
  assert.match((await fichiersZip(X.docx(avecImages, {}, {})))['word/document.xml'], /\[image\]/);
});

test('Export RTF et PDF avec images ; masque de fond du PDF avec son opacité', () => {
  const r = X.rtf(avecImages, {}, { images: imgs });
  assert.match(r, /\\pict\\pngblip\\picw1200\\pich700/); assert.match(r, /Plan \(fictif\)/);
  const pdf = new TextDecoder('latin1').decode(X.pdfTexte(avecImages, { titre: 'Images (fictif)' }, { images: imgs }));
  assert.match(pdf, /\/Im1 Do/); assert.match(pdf, /\/Fond Do/); assert.match(pdf, /\/GSfond gs/); assert.match(pdf, /\/ca 0\.5/);
  assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 2);
});

test('Import Word : images reprises (bloc, largeur, légende) et octets rendus pour être chiffrés', async () => {
  const r = await I.importer('Images (fictif).docx', X.docx(avecImages, { titre: 'Images (fictif)' }, { images: imgs }));
  const im = r.contenu.blocs.filter((b) => b.t === 'img');
  assert.equal(im.length, 1); assert.equal(im[0].l, 60); assert.equal(im[0].al, 'c'); assert.equal(im[0].leg, 'Plan (fictif)');
  assert.ok(DM.ID_IMAGE.test(im[0].id)); assert.equal(r.images[im[0].id].type, 'image/png'); assert.deepEqual(Array.from(r.images[im[0].id].octets), Array.from(PNG));
  assert.ok(!r.alertes.some((a) => /image/.test(a)));
});
