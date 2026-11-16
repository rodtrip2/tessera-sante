// SPDX-License-Identifier: EUPL-1.2
// Constats S4, S6, S7, S8, S10 et J1 de l'audit du 15 novembre 2026 (0.77.0) : exports, horloge du poste, CSV,
// garde des index, archives, désignation du juge. Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CSV = require('../app/js/csv.js');
const M = require('../app/js/model.js');
const N = require('../app/js/noyau-journal.js');
const X = require('../app/js/exports-rangement.js');

test('S7 — cellules lues comme formules neutralisées, nombres et tirets intacts', () => {
  assert.equal(CSV.cellule('=HYPERLINK("http://exemple.invalid")'), '\'=HYPERLINK("http://exemple.invalid")');
  assert.equal(CSV.cellule('+33 6 00 00 00 00 (fictif)'), '\'+33 6 00 00 00 00 (fictif)');
  assert.equal(CSV.cellule('@SOMME(A1)'), '\'@SOMME(A1)');
  assert.equal(CSV.cellule('-cmd|calc'), '\'-cmd|calc');
  assert.equal(CSV.cellule('-3,5'), '-3,5');
  assert.equal(CSV.cellule('+2'), '+2');
  assert.equal(CSV.cellule('—'), '—');
  assert.equal(CSV.cellule('DUPONT (fictif)'), 'DUPONT (fictif)');
  const brut = '﻿"Nom";"Motif"\r\n"=1+1";"Agitation; mise en chambre"\r\n"DUPONT (fictif)";"ligne 1\nligne 2"';
  const n = CSV.neutraliser(brut);
  assert.deepEqual(CSV.lire(n), [['Nom', 'Motif'], ['\'=1+1', 'Agitation; mise en chambre'], ['DUPONT (fictif)', 'ligne 1\nligne 2']]);
  assert.equal(CSV.neutraliser(n), n, 'idempotent');
  const sain = '﻿"a";"b"\r\n"1";"2"';
  assert.equal(CSV.neutraliser(sain), sain, 'fichier sans risque inchangé');
});

test('J1 — désignation du juge : « juge » par défaut, sigle conservé sur réglage, saisie inchangée', () => {
  assert.deepEqual(M.libelleJuge({}), { court: 'juge', long: 'magistrat du siège du tribunal judiciaire' });
  assert.equal(M.texteJuge('Envoi au JLD', {}), 'Envoi au juge');
  assert.equal(M.texteJuge('Décomptes JLD (PDF)', {}), 'Décomptes juge (PDF)');
  assert.equal(M.texteJuge('Le juge des libertés et de la détention statue', {}), 'Le magistrat du siège du tribunal judiciaire statue');
  assert.equal(M.texteJuge('JLDX et JLD', {}), 'JLDX et juge', 'mot entier seulement');
  assert.equal(M.texteJuge('Envoi au JLD', { libelleJuge: { court: 'JLD' } }), 'Envoi au JLD');
  assert.equal(M.texteJuge('Envoi au JLD', { libelleJuge: { court: 'magistrat', long: 'magistrat du siège' } }), 'Envoi au magistrat');
});

test('S4 — exports purgés après 31 jours par défaut ; « aucune purge » reste possible', () => {
  assert.equal(X.optionsExports(M.reduire([]).config).conservationJours, 31);
  assert.equal(X.optionsExports({ exports: { conservationJours: 0 } }).conservationJours, 0);
});

test('S10 — identifiants réservés (« __proto__ »…) : saisie écartée, prototype intact', () => {
  const evts = [
    { id: 'a1', at: '2026-11-16T08:00:00.000Z', by: 'u1', type: 'CONFIG', data: { cle: '__proto__', valeur: { pollue: true } } },
    { id: 'a2', at: '2026-11-16T08:01:00.000Z', by: 'u1', type: 'PATIENT', data: { patientId: 'constructor', nom: 'X (fictif)' } },
    { id: 'a3', at: '2026-11-16T08:02:00.000Z', by: 'u1', type: 'LOT', data: { evenements: [{ type: 'PATIENT', data: { patientId: 'prototype' } }, { type: 'PATIENT', data: { patientId: 'P9', nom: 'Y (fictif)' } }] } },
    { id: 'a4', at: '2026-11-16T08:03:00.000Z', by: 'u1', type: 'CONFIG', data: { cle: 'etablissement', valeur: 'Hôpital (fictif)' } }
  ];
  const d = N.deplier(evts);
  assert.deepEqual(d.map((e) => e.id), ['a3', 'a3.00001', 'a4']);
  const st = M.reduire(evts);
  assert.equal(st.config.etablissement, 'Hôpital (fictif)');
  assert.equal(({}).pollue, undefined);
  assert.equal(Object.getPrototypeOf(st.config), Object.prototype);
});

test('S10 — archive piégée : décompression plafonnée', async () => {
  const XL = require('../app/js/xlsx.js');
  // ZIP minimal d'une entrée « deflate » annonçant 600 Mo décompressés : refusée sans décompresser
  const nom = Buffer.from('xl/workbook.xml'), donnees = Buffer.from([3, 0]);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(donnees.length, 18); local.writeUInt32LE(600 * 1048576, 22); local.writeUInt16LE(nom.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(donnees.length, 20); central.writeUInt32LE(600 * 1048576, 24); central.writeUInt16LE(nom.length, 28); central.writeUInt32LE(0, 42);
  const debutCentral = local.length + nom.length + donnees.length;
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(central.length + nom.length, 12); fin.writeUInt32LE(debutCentral, 16);
  const zip = Buffer.concat([local, nom, donnees, central, nom, fin]);
  await assert.rejects(async () => { await XL.lire(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length)); }, /refusé/);
});

test('J1 — « JLD » en tête de texte : majuscule (onglet, titre de colonne)', () => {
  assert.equal(M.texteJuge('JLD', {}), 'Juge');
  assert.equal(M.texteJuge('JLD : saisine', {}), 'Juge : saisine');
});
