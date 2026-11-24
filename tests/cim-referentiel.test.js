// SPDX-License-Identifier: EUPL-1.2
// Liste des codes CIM importée par l'établissement (0.82.0, 16 novembre 2026). Extraits fictifs ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js'), validations: require('../app/js/validations.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const CIM = require('../app/js/cim.js');
const K = require('../app/js/module-clinique.js');

// Fichier au format de la nomenclature de l'ATIH (Windows-1252), libellés fictifs
function enAnsi(t) { return Uint8Array.from(Array.from(t).map((c) => c === 'é' ? 0xe9 : c === 'è' ? 0xe8 : c === 'œ' ? 0x9c : c.charCodeAt(0))); }
const ATIH = 'F20   |3|SCHIZO (FICTIF)|Schizophrénie (libellé fictif)\r\nF200  |0|SCHIZO PARANO (FICTIF)|Schizophrénie paranoïde (fictif)\r\nF102  |0|DEP ALCOOL (FICTIF)|Dépendance à l\'alcool (fictif)\r\nV01   |2|CAUSE EXT (FICTIF)|Cause externe (fictif)\r\nZ5300+|0|PROCED (FICTIF)|Procédure non effectuée (fictif)\r\nlignes illisibles\r\n';

test('Nomenclature de l’ATIH : codes avec point, type, libellé complet, encodage Windows-1252', () => {
  const r = CIM.lire(enAnsi(ATIH));
  assert.equal(r.format, 'nomenclature de l’ATIH');
  assert.equal(r.nombre, 5);
  assert.equal(r.rejetes, 1);
  const i = CIM.indexer(r.codes);
  assert.deepEqual(CIM.trouver(i, 'f200'), { code: 'F20.0', libelle: 'Schizophrénie paranoïde (fictif)', type: '0' });
  assert.equal(CIM.trouver(i, 'F20').type, '3');
  assert.equal(CIM.trouver(i, 'V01').type, '2');
  assert.equal(CIM.trouver(i, 'Z53.00+').code, 'Z53.00+');
  assert.equal(CIM.trouver(i, 'F99'), null);
});

test('Terminologie au format JSON (CodeSystem) : concepts imbriqués, version et éditeur', () => {
  const cs = { resourceType: 'CodeSystem', version: '2026 (fictif)', publisher: 'Éditeur fictif', concept: [
    { code: 'F20-F29', display: 'Chapitre fictif', concept: [{ code: 'F20', display: 'Schizophrénie (fictif)', concept: [{ code: 'F20.0', display: 'Paranoïde (fictif)' }] }] },
    { code: 'F32.1', display: 'Épisode dépressif moyen (fictif)' }] };
  const r = CIM.lire(new TextEncoder().encode(JSON.stringify(cs)));
  assert.deepEqual(r.codes.map((c) => c[0]), ['F20', 'F20.0', 'F32.1']);
  assert.equal(r.rejetes, 1, 'le bloc de chapitres n’est pas un code');
  assert.equal(r.version, '2026 (fictif)');
  assert.throws(() => CIM.lire('{"resourceType":"ValueSet"}'), /CodeSystem/);
  assert.throws(() => CIM.lire('{ illisible'), /illisible/);
});

// Terminologie RDF (SKOS) de l'Agence du numérique en santé : structure seulement, codes et libellés fictifs
const RDF = '<?xml version="1.0"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:skos="http://www.w3.org/2004/02/skos/core#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:terms="http://purl.org/dc/terms/">\n'
  + '  <rdf:Description rdf:about="x/F20.0">\n    <rdfs:label xml:lang="en">Paranoid (fictitious)</rdfs:label>\n    <rdfs:label xml:lang="fr">Schizophrénie paranoïde (fictif) &amp; autre</rdfs:label>\n    <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>\n    <dc:type>category</dc:type>\n    <skos:notation>F20.0</skos:notation>\n    <skos:altLabel xml:lang="fr">Synonyme (fictif)</skos:altLabel>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/F20-F29">\n    <rdfs:label xml:lang="fr">Bloc fictif</rdfs:label>\n    <dc:type>block</dc:type>\n    <skos:notation>F20-F29</skos:notation>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/V">\n    <rdfs:label xml:lang="fr">Chapitre fictif</rdfs:label>\n    <dc:type>chapter</dc:type>\n    <skos:notation>V</skos:notation>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/X47.2+0">\n    <rdfs:label xml:lang="fr">Code avec extension (fictif)</rdfs:label>\n    <dc:type>category</dc:type>\n    <skos:notation>X47.2+0</skos:notation>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/X47.20">\n    <rdfs:label xml:lang="fr">Code voisin (fictif)</rdfs:label>\n    <dc:type>category</dc:type>\n    <skos:notation>X47.20</skos:notation>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/F03.+1">\n    <rdfs:label xml:lang="fr">Code au point suivi de + (fictif)</rdfs:label>\n    <dc:type>category</dc:type>\n    <skos:notation>F03.+1</skos:notation>\n  </rdf:Description>\n'
  + '  <rdf:Description rdf:about="x/ontologie">\n    <owl:versionInfo>2025 (fictif)</owl:versionInfo>\n    <terms:publisher rdf:resource="https://esante.gouv.fr/"/>\n  </rdf:Description>\n</rdf:RDF>\n';

test('Terminologie RDF (SKOS) de l’Agence du numérique en santé : catégories seules, libellé français, version (24 novembre 2026)', () => {
  const r = CIM.lire(new TextEncoder().encode(RDF));
  assert.equal(r.format, 'terminologie RDF (SKOS)');
  assert.deepEqual(r.codes.map((c) => c[0]), ['F03.+1', 'F20.0', 'X47.2+0', 'X47.20']);
  assert.equal(r.doublons, 0, 'X47.2+0 et X47.20 sont deux codes');
  assert.equal(r.version, '2025 (fictif)');
  assert.match(r.editeur, /Agence du numérique en santé/);
  const i = CIM.indexer(r.codes);
  assert.equal(CIM.trouver(i, 'f200').libelle, 'Schizophrénie paranoïde (fictif) & autre');
  assert.equal(CIM.trouver(i, 'X472+0').libelle, 'Code avec extension (fictif)');
  assert.equal(CIM.trouver(i, 'X4720').libelle, 'Code voisin (fictif)');
  assert.deepEqual(CIM.chercher(i, 'X47.2').map((x) => x.code), ['X47.2+0', 'X47.20']);
  assert.equal(CIM.trouver(i, 'F20.0+').code, 'F20.0', 'signe final (dague) ignoré');
  assert.throws(() => CIM.lire('<?xml version="1.0"?><racine><rien/></racine>'), /skos:notation/);
  // Taille : le fichier officiel de 2026 dépasse 40 Mo
  assert.doesNotThrow(() => { try { CIM.lire(new Uint8Array(45 * 1024 * 1024)); } catch (e) { if (/volumineux/.test(e.message)) throw e; } });
});

test('Plusieurs codes à la fois : codes avec « + » au milieu (X47.2+0) distincts de leurs voisins', () => {
  const l = K.separerCim('X47.2+0 Extension (fictif) ; X47.20 Voisin (fictif), F03.+1');
  assert.deepEqual(l.map((x) => x.code), ['X47.2+0', 'X47.20', 'F03.+1']);
});

test('Tableau code ; libellé : en-tête ignoré, doublons, rien de reconnu', () => {
  const r = CIM.lire('Code;Libellé\nF20.0;Paranoïde (fictif)\nF200;Doublon (fictif)\n"F41.1";"Anxiété ""généralisée"" (fictif)"\nZ59.0\tSans abri (fictif)\n');
  assert.deepEqual(r.codes.map((c) => c[0]), ['F20.0', 'F41.1', 'Z59.0']);
  assert.equal(r.doublons, 1);
  assert.equal(CIM.indexer(r.codes).liste[1][1], 'Anxiété "généralisée" (fictif)');
  assert.throws(() => CIM.lire('rien;ici\n'), /Aucun code CIM/);
});

test('Recherche : par début de code, puis par mots du libellé sans accents', () => {
  const i = CIM.indexer(CIM.lire(enAnsi(ATIH)).codes);
  assert.deepEqual(CIM.chercher(i, 'F20').map((x) => x.code), ['F20', 'F20.0']);
  assert.deepEqual(CIM.chercher(i, 'f20.0').map((x) => x.code), ['F20.0']);
  assert.deepEqual(CIM.chercher(i, 'paranoide schizo').map((x) => x.code), ['F20.0']);
  assert.deepEqual(CIM.chercher(i, 'ALCOOL').map((x) => x.code), ['F10.2']);
  assert.deepEqual(CIM.chercher(i, ''), []);
  assert.deepEqual(CIM.chercher(null, 'F20'), []);
  assert.equal(CIM.chercher(i, 'fictif', 2).length, 2);
});

test('Module Données cliniques : liste en service, remplacée puis retirée ; réservée à l’administrateur', () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 16, h)).toISOString();
  const st = K.reduire([
    { id: 'r1', at: at(8), by: 'adm', type: 'CLINIQUE_REFERENTIEL', data: { piece: 'PJ1', version: '2025', nombre: 10, format: 'f', nomFichier: 'a.txt' } },
    { id: 'r2', at: at(9), by: 'adm', type: 'CLINIQUE_REFERENTIEL', data: { piece: 'PJ2', version: '2026', nombre: 12, format: 'f', nomFichier: 'b.txt' } }]);
  assert.equal(st.referentiel.piece, 'PJ2');
  assert.equal(st.referentielsPrecedents.length, 1);
  const st2 = K.reduire([{ id: 'r1', at: at(8), by: 'adm', type: 'CLINIQUE_REFERENTIEL', data: { piece: 'PJ1', nombre: 10 } }, { id: 'r3', at: at(10), by: 'adm', type: 'CLINIQUE_REFERENTIEL', data: { retirer: true } }]);
  assert.equal(st2.referentiel, null);
  assert.throws(() => K.controler('CLINIQUE_REFERENTIEL', { nombre: 0 }, { etat: st }), /vide/);
  assert.throws(() => K.controler('CLINIQUE_REFERENTIEL', { retirer: true }, { etat: st2 }), /Aucune liste/);
  K.controler('CLINIQUE_REFERENTIEL', { piece: 'PJ3', nombre: 3 }, { etat: st, config: {} });
  const cfg = SIC.model.normaliserConfig ? SIC.model.normaliserConfig({}) : {};
  assert.equal(K.droits.peut(['ADMIN'], 'CLINIQUE_REFERENTIEL', cfg), true);
  for (const r of ['IDE', 'CADRE', 'MEDECIN']) assert.equal(K.droits.peut([r], 'CLINIQUE_REFERENTIEL', cfg), false, r);
  assert.equal(K.droits.peut(['IDE'], 'CLINIQUE_STAFF', cfg), true);
});
