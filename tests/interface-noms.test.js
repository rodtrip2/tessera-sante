// SPDX-License-Identifier: EUPL-1.2
// Découpage de l'interface (étape 1) : chaque nom de la coquille (ui.js) employé par un fichier d'interface d'un module
// doit y être déclaré ou importé de SIC.ui. Un oubli ne se voit qu'à l'usage (ex. export du registre en PDF, 0.1.3) : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = path.join(__dirname, '..', 'app', 'js');
const MODULES = ['ui-isocont.js'];

/** Texte sans commentaires ni chaînes (les noms cités dans un texte ne comptent pas). */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** Noms déclarés au premier niveau de la fonction englobante (indentation de deux espaces). */
function declares(src) {
  const noms = new Set();
  code(src).split('\n').forEach((l) => {
    let m = /^ {2}(?:async )?function (\w+)/.exec(l);
    if (m) { noms.add(m[1]); return; }
    m = /^ {2}var (.*)$/.exec(l);
    if (!m) return;
    let prof = 0, cour = '';
    for (const ch of m[1] + ',') {
      if ('([{'.includes(ch)) prof++;
      else if (')]}'.includes(ch)) prof--;
      if (ch === ',' && prof === 0) { const n = /^\s*(\w+)/.exec(cour); if (n) noms.add(n[1]); cour = ''; } else cour += ch;
    }
  });
  return noms;
}

/** Vrai si `nom` est employé comme variable (ni propriété `x.nom`, ni clé d'objet `nom:`). */
function emploie(src, nom) {
  return new RegExp('(?<![\\w.$])' + nom + '\\b(?!\\s*:(?!:))').test(code(src));
}

test('Interface : les noms de la coquille employés par les modules y sont importés', () => {
  const coquille = fs.readFileSync(path.join(JS, 'ui.js'), 'utf8');
  const deCoquille = declares(coquille);
  assert.ok(deCoquille.has('exporter') && deCoquille.has('modale') && deCoquille.has('h'));
  MODULES.forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    const propres = declares(src);
    const manquants = [...deCoquille].filter((n) => !propres.has(n) && emploie(src, n));
    assert.deepEqual(manquants, [], f + ' : noms de ui.js employés sans import');
  });
});

test('Interface : la coquille n’emploie pas directement les noms d’un module', () => {
  const coquille = fs.readFileSync(path.join(JS, 'ui.js'), 'utf8');
  const deCoquille = declares(coquille);
  MODULES.forEach((f) => {
    const propres = declares(fs.readFileSync(path.join(JS, f), 'utf8'));
    const manquants = [...propres].filter((n) => !deCoquille.has(n) && emploie(coquille, n));
    assert.deepEqual(manquants, [], 'ui.js emploie des noms de ' + f + ' (passer par SIC.ui)');
  });
});
