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

test('Outils du partage : lanceur en un double-clic (fins de ligne CRLF, vérification avant installation)', () => {
  const brut = fs.readFileSync(path.join(OUTILS, 'mettre-a-jour-tessera.cmd'), 'utf8');
  assert.ok(!/[^\r]\n/.test(brut), 'fins de ligne LF : cmd.exe exige CRLF (.gitattributes)');
  assert.match(brut, /%~dp0mettre-a-jour-outil\.ps1"/);
  const simulation = brut.indexOf('-Simulation'), choix = brut.indexOf('choice /C ON');
  assert.ok(simulation > 0 && choix > simulation, 'la vérification doit précéder la question');
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.gitattributes'), 'utf8'), /^\*\.cmd text eol=crlf$/m);
});

test('Outils du partage : sans paramètre, les scripts visent le dossier « app » situé à côté d’eux', () => {
  assert.match(lire('mettre-a-jour-outil.ps1'), /\$Destination = Join-Path \$PSScriptRoot 'app'/);
  assert.match(lire('verifier-outil.ps1'), /\$Dossier = Join-Path \$PSScriptRoot 'app'/);
  assert.match(lire('mettre-a-jour-outil.ps1'), /Read-Host 'Taper O pour confirmer'/, 'première installation confirmée');
});

test('Outils du partage : adaptation locale -Zimbra (règle connect-src de index.html), reprise et contrôlée', () => {
  const maj = lire('mettre-a-jour-outil.ps1'), ver = lire('verifier-outil.ps1');
  const index = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  // La page publiée n'autorise aucune connexion : la règle exacte que le script remplace y figure une fois
  assert.equal(index.split("connect-src 'none'").length, 2);
  assert.ok(!index.startsWith('﻿'), 'index.html sans BOM (empreinte recalculée sans BOM)');
  assert.match(maj, /\[string\[\]\]\$Zimbra = @\(\)/);
  assert.match(maj, /\[switch\]\$SansZimbra/);
  assert.match(maj, /ADAPTATION-LOCALE\.txt/);
  assert.match(maj, /Appliquer-Adaptation \$nouveau \$ORIGINES \$DONNEES\s+\$ecarts = Controler-Dossier \$nouveau \$ORIGINES/);
  assert.match(maj, /\$ORIGINES = Lire-Adaptation/);   // reprise aux mises à jour suivantes (double-clic)
  assert.match(ver, /ADAPTATION-LOCALE\.txt/);
  assert.match(ver, /connect-src 'none'/);
  // Même normalisation dans les deux scripts
  const norm = /\[regex\]::Replace\(\$t, 'connect-src\\s\+\[\^;"\]\*', "connect-src 'none'"\)/;
  assert.match(maj, norm);
  assert.match(ver, norm);
});

test('Outils du partage : dossier des données fixé (-Donnees), repris, contrôlé, et copie du poste ou cache du navigateur acceptant l’adaptation', () => {
  const maj = lire('mettre-a-jour-outil.ps1'), ver = lire('verifier-outil.ps1'), cop = lire('copie-locale-outil.ps1');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'app', 'sw.js'), 'utf8');
  assert.match(maj, /\[string\]\$Donnees = ''/);
  assert.match(maj, /\[switch\]\$SansDonnees/);
  assert.match(maj, /"creeLe"/);
  assert.match(maj, /\$DONNEES = Lire-Donnees/);   // reprise aux mises à jour suivantes
  assert.match(maj, /Appliquer-Adaptation \$nouveau \$ORIGINES \$DONNEES\s+\$ecarts = Controler-Dossier \$nouveau \$ORIGINES \$DONNEES/);
  // Même normalisation de la balise dans les trois scripts et dans la mise en cache du navigateur
  const vide = '<meta name="tessera-donnees" content="">';
  [maj, ver, cop].forEach((t) => { assert.ok(t.includes(vide)); assert.match(t, /connect-src 'none'/); });
  assert.ok(sw.includes(vide) && /sansAdaptation\(octets\)/.test(sw));
  // Copie du poste : adaptation acceptée seulement si elle est celle notée par la mise à jour
  assert.match(cop, /ADAPTATION-LOCALE\.txt/);
  assert.match(cop, /\[string\]\$Reference = ''/);
});

test('Installation en un fichier : le .cmd télécharge et contrôle le script ; outils contrôlés par leur liste d’empreintes, à jour', () => {
  const cmd = lire('mettre-a-jour-tessera.cmd'), maj = lire('mettre-a-jour-outil.ps1');
  // Le script est téléchargé et comparé à la liste avant la vérification de la version
  const iTel = cmd.indexOf("EMPREINTES-OUTILS.txt"), iSim = cmd.indexOf('-Simulation %*');
  assert.ok(iTel > 0 && iTel < iSim);
  assert.match(cmd, /Get-FileHash -LiteralPath \(Join-Path \$t 'script\.ps1'\) -Algorithm SHA256\)\.Hash -ne \$h/);
  assert.match(cmd, /-SansConfirmation %\*/);
  assert.match(cmd, /mettre-a-jour-tessera\.cmd\.nouveau" \(move \/y/);
  assert.ok(!/\r?\n[^\r\n]*"[^"\r\n]*[éèàç][^"\r\n]*"[^\r\n]*-Command/.test(cmd), 'commande PowerShell de l’amorce sans accent');
  assert.match(maj, /function Mettre-A-Jour-Outils/);
  assert.match(maj, /\[switch\]\$SansOutils/);
  assert.match(maj, /\[switch\]\$SansConfirmation/);
  // Liste des outils à jour (régénérée par node scripts/empreintes.mjs, contrôlée à la publication)
  const crypto = require('crypto');
  const dir = path.join(__dirname, '..', 'kit', 'outils');
  const liste = fs.readFileSync(path.join(dir, 'EMPREINTES-OUTILS.txt'), 'utf8').split('\n').filter((l) => /^[0-9A-F]{64}  /.test(l));
  const noms = fs.readdirSync(dir).filter((n) => n !== 'EMPREINTES-OUTILS.txt').sort();
  assert.deepEqual(liste.map((l) => l.slice(66)), noms);
  liste.forEach((l) => assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, l.slice(66)))).digest('hex').toUpperCase(), l.slice(0, 64), l.slice(66)));
});
