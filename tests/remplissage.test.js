// SPDX-License-Identifier: EUPL-1.2
// Modèles remplis automatiquement (lot D, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
const R = require('../app/js/remplissage.js');

const patient = { id: 'P01', nom: 'ALPHA', prenom: 'Camille', sexe: 'F', naissance: '1990-06-15', ipp: '000123 (fictif)', medecin1: 'Dr Arnaud', medecin1Id: 'm1', referents: ['Agent A', 'Agent B'],
  modes: [{ date: 1, mode: 'SL' }, { date: 2, mode: 'SDT' }], sejours: [{ id: 'S1', entree: '2026-01-02', sortie: '2026-01-20' }, { id: 'S2', entree: '2026-11-10', iep: '9001 (fictif)', chambre: '12', lit: 'P' }] };
const maintenant = new Date(2026, 10, 14, 9, 5).getTime();
const v = R.valeurs({ patient, service: 'Unité 1 (fictive)', etablissement: 'Établissement fictif', agent: 'Agent C (fictif)', maintenant,
  libMode: c => ({ SDT: 'Soins à la demande d’un tiers' })[c] || c, libMedecin: (n, id) => id === 'm1' ? 'Dr Arnaud Pierre (fictif)' : n, mesure: { type: 'Isolement', debut: new Date(2026, 10, 13, 22, 30).getTime(), lieu: 'CSI 1' } });

test('Valeurs : identité, séjour en cours, mode, médecin, mesure, général', () => {
  assert.equal(v[R.cle('Nom')], 'ALPHA');
  assert.equal(v[R.cle('Âge')], '36 ans');
  assert.equal(v[R.cle('Date d’entrée')], '10/11/2026');
  assert.equal(v[R.cle('Chambre')], '12 P');
  assert.equal(v[R.cle('Mode d’hospitalisation')], 'Soins à la demande d’un tiers');
  assert.equal(v[R.cle('Médecin de 1re ligne')], 'Dr Arnaud Pierre (fictif)');
  assert.equal(v[R.cle('Début de la mesure')], '13/11/2026 à 22 h 30');
  assert.equal(v[R.cle('Date du jour')], '14/11/2026');
  assert.equal(v[R.cle('Référents')], 'Agent A, Agent B');
  assert.equal(R.cle("date d'entree"), R.cle('Date d’entrée'));
});

test('Remplissage : paragraphes, tableaux, onglets, tableur (jamais les formules), champs restants', () => {
  const texte = { blocs: [{ t: 'p', runs: [{ x: 'Patient : {{Prénom}} {{ NOM }}, entré le {{date d\'entree}}' }, { x: ' — {{Inconnu}}', g: true }] },
    { t: 'table', lignes: [[{ runs: [{ x: '{{IPP}}' }] }, { runs: [{ x: '{{Lieu de la mesure}}' }] }]] }] };
  const r = R.remplir(texte, v);
  assert.equal(r.contenu.blocs[0].runs[0].x, 'Patient : Camille ALPHA, entré le 10/11/2026');
  assert.equal(r.contenu.blocs[0].runs[1].x, ' — {{Inconnu}}');
  assert.equal(r.contenu.blocs[1].lignes[0][1].runs[0].x, 'CSI 1');
  assert.deepEqual(r.restants, ['Inconnu']);
  assert.equal(texte.blocs[0].runs[0].x.indexOf('{{'), 10);   // l'original n'est pas modifié
  const ong = R.remplir({ onglets: [{ id: 'o1', blocs: [{ t: 'p', runs: [{ x: '{{Service}}' }] }] }] }, v);
  assert.equal(ong.contenu.onglets[0].blocs[0].runs[0].x, 'Unité 1 (fictive)');
  const tab = R.remplir({ genre: 'tableur', feuilles: [{ cellules: { A1: { v: '{{Nom}}' }, A2: { f: '="{{Nom}}"' }, A3: { v: 12 } } }] }, v);
  assert.equal(tab.contenu.feuilles[0].cellules.A1.v, 'ALPHA');
  assert.equal(tab.contenu.feuilles[0].cellules.A2.f, '="{{Nom}}"');
  // Sans patient : les champs du patient restent à compléter
  const sans = R.remplir(texte, R.valeurs({ service: 'U1', maintenant }));
  assert.ok(sans.restants.indexOf('Prénom') >= 0 && sans.restants.indexOf('IPP') >= 0);
  assert.deepEqual(R.champsDe(texte), ['Prénom', 'NOM', 'date d\'entree', 'Inconnu', 'IPP', 'Lieu de la mesure']);
});
