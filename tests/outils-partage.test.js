// SPDX-License-Identifier: EUPL-1.2
// Scripts de mise à jour et de contrôle de l'application hébergée sur un partage (kit/outils) : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const OUTILS = path.join(__dirname, '..', 'kit', 'outils');
const SCRIPTS = ['mettre-a-jour-outil.ps1', 'verifier-outil.ps1'];
const lire = (n) => fs.readFileSync(path.join(OUTILS, n), 'utf8');

test('Outils du partage : scripts présents, en UTF-8 avec BOM (accents lus par Windows PowerShell 5.1), sous licence', () => {
  SCRIPTS.forEach((n) => {
    const s = lire(n);
    assert.ok(s.startsWith('﻿'), n + ' : BOM absent');
    assert.match(s, /^﻿# SPDX-License-Identifier: EUPL-1\.2/, n);
  });
});

test('Outils du partage : aucune syntaxe réservée à PowerShell 7 (postes en Windows PowerShell 5.1)', () => {
  SCRIPTS.forEach((n) => {
    const code = lire(n).split('\n').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/'[^']*'/g, "''")).join('\n');
    assert.doesNotMatch(code, /\s\?\?=?\s/, n + ' : opérateur ??');
    assert.doesNotMatch(code, /\s(&&|\|\|)\s/, n + ' : chaînage && ou ||');
    assert.doesNotMatch(code, /\s-Parallel\b/, n + ' : ForEach-Object -Parallel');
  });
});

test('Outils du partage : la liste des empreintes publiée est lue en entier par les scripts', () => {
  const lignes = fs.readFileSync(path.join(__dirname, '..', 'app', 'EMPREINTES-SHA256.txt'), 'utf8').trim().split('\n');
  const motif = /^([0-9A-Fa-f]{64})\s+app\/(.+)$/; // motif des deux scripts
  SCRIPTS.forEach((n) => assert.ok(lire(n).includes("'^([0-9A-Fa-f]{64})\\s+app/(.+)$'"), n + ' : motif de lecture modifié'));
  const fichiers = lignes.slice(1).map((l) => motif.exec(l));
  assert.ok(fichiers.length > 10);
  fichiers.forEach((m, i) => {
    assert.ok(m, 'ligne illisible : ' + lignes[i + 1]);
    assert.doesNotMatch(m[2], /(^|\/)\.\.(\/|$)|^[/\\]|:/, 'chemin refusé par les scripts : ' + m[2]);
    assert.match(m[2], /^[\x20-\x7E]+$/, 'nom hors ASCII, téléchargement non garanti : ' + m[2]);
  });
});

test('Outils du partage : codes de sortie documentés', () => {
  assert.match(lire('mettre-a-jour-outil.ps1'), /0 = mise à jour faite ou déjà à jour ; 1 = source inaccessible ; 2 = contrôle refusé ou erreur ;\s*#\s*3 = version plus ancienne/);
  assert.match(lire('verifier-outil.ps1'), /0 = conforme ; 1 = dossier ou référence inaccessible ; 2 = écart constaté/);
});
