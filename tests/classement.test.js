// SPDX-License-Identifier: EUPL-1.2
// Classement personnel des messages et des documents (lot I, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
const K = require('../app/js/classement.js');

test('Lecture validée : étiquettes, dossiers d’un seul niveau, éléments d’un module connu', () => {
  const n = K.normaliser({ etiquettes: [{ id: 'e1', libelle: '  À relire  ', couleur: 'rouge' }, { id: 'e2', libelle: 'X', couleur: 'fuchsia' }, { id: '!', libelle: 'Mauvais' }],
    dossiers: { messagerie: [{ id: 'd1', libelle: 'Pharmacie' }, { id: 'd2', libelle: 'Commandes', parent: 'd1' }, { id: 'd3', libelle: 'Trop profond', parent: 'd2' }, { id: 'd4', libelle: 'Orphelin', parent: 'zz' }] },
    elements: { 'messagerie|M1': { favori: true, etiquettes: ['e1', 'c-qualite'], dossier: 'd2' }, 'messagerie|M2': { dossier: 'inconnu' }, 'agenda|A1': { favori: true } } });
  assert.deepEqual(n.etiquettes.map((e) => [e.id, e.libelle, e.couleur]), [['e1', 'À relire', 'rouge'], ['e2', 'X', 'gris']]);
  assert.deepEqual(n.dossiers.messagerie.map((d) => [d.id, d.parent]), [['d1', ''], ['d2', 'd1'], ['d3', ''], ['d4', '']]);
  assert.deepEqual(n.dossiers.documents, []);
  assert.deepEqual(Object.keys(n.elements), ['messagerie|M1'], 'élément sans classement utile et module inconnu écartés');
  assert.deepEqual(K.element(n, 'messagerie', 'M1'), { favori: true, etiquettes: ['e1', 'c-qualite'], dossier: 'd2' });
  assert.deepEqual(K.element(n, 'documents', 'X'), { favori: false, etiquettes: [], dossier: '' });
});

test('Favori, étiquettes, dossier : marquer puis démarquer, rien de vide gardé', () => {
  let c = K.creerDossier({}, 'documents', 'Protocoles').classement;
  c = K.marquer(c, 'documents', 'D1', { favori: true, etiquettes: ['e1', 'e1', 'c-qualite'], dossier: 'd1' });
  assert.deepEqual(K.element(c, 'documents', 'D1'), { favori: true, etiquettes: ['e1', 'c-qualite'], dossier: 'd1' });
  c = K.marquer(c, 'documents', 'D1', { favori: false, etiquettes: [], dossier: '' });
  assert.deepEqual(c.elements, {});
  assert.throws(() => K.marquer(c, 'documents', 'D1', { dossier: 'd9' }), /Dossier inconnu/);
  assert.throws(() => K.marquer(c, 'agenda', 'A1', { favori: true }), /inconnu/);
});

test('Étiquettes personnelles : création, doublon, modification, suppression retirée des éléments', () => {
  let r = K.creerEtiquette({}, 'Urgent', 'rouge');
  assert.equal(r.id, 'e1');
  assert.throws(() => K.creerEtiquette(r.classement, 'urgent', 'vert'), /existe déjà/);
  assert.throws(() => K.creerEtiquette(r.classement, '   ', 'vert'), /nom/);
  let c = K.marquer(r.classement, 'messagerie', 'M1', { etiquettes: ['e1'] });
  c = K.modifierEtiquette(c, 'e1', 'Très urgent', 'orange');
  assert.deepEqual([c.etiquettes[0].libelle, c.etiquettes[0].couleur], ['Très urgent', 'orange']);
  c = K.supprimerEtiquette(c, 'e1');
  assert.deepEqual([c.etiquettes.length, c.elements], [0, {}]);
});

test('Étiquettes communes : établissement puis services de l’agent, posées pour soi', () => {
  const config = { etiquettesCommunes: { '*': [{ code: 'qualite', libelle: 'Qualité (fictif)', couleur: 'vert' }], U1: [{ code: 'pharma', libelle: 'Pharmacie', couleur: 'bleu' }, { code: 'qualite', libelle: 'Doublon' }], U2: [{ code: 'u2', libelle: 'Unité 2' }] } };
  assert.deepEqual(K.communes(config, ['U1']).map((e) => e.id), ['c-qualite', 'c-pharma']);
  const tout = K.etiquettes(K.creerEtiquette({}, 'Perso').classement, config, ['U1']);
  assert.deepEqual(tout.map((e) => [e.id, !!e.commune]), [['c-qualite', true], ['c-pharma', true], ['e1', false]]);
});

test('Dossiers : sous-dossier d’un niveau, doublon, suppression qui remet le contenu à la racine', () => {
  let r = K.creerDossier({}, 'messagerie', 'Formations'), c = r.classement;
  const s = K.creerDossier(c, 'messagerie', 'Incendie', 'd1'); c = s.classement;
  assert.throws(() => K.creerDossier(c, 'messagerie', 'Trop', s.id), /sous-dossier/);
  assert.throws(() => K.creerDossier(c, 'messagerie', 'formations'), /existe déjà/);
  assert.doesNotThrow(() => K.creerDossier(c, 'messagerie', 'Incendie'), 'même nom ailleurs (racine) permis');
  c = K.marquer(c, 'messagerie', 'M1', { dossier: 'd1' });
  c = K.marquer(c, 'messagerie', 'M2', { dossier: s.id, favori: true });
  assert.equal(K.contenu(c, 'messagerie', 'd1'), 1);
  c = K.supprimerDossier(c, 'messagerie', 'd1');
  assert.deepEqual(c.dossiers.messagerie.map((d) => [d.id, d.parent]), [[s.id, '']], 'sous-dossier remis à la racine');
  assert.deepEqual([K.element(c, 'messagerie', 'M1').dossier, K.element(c, 'messagerie', 'M2').dossier], ['', s.id], 'messages gardés, hors dossier');
  c = K.renommerDossier(c, 'messagerie', s.id, 'Sécurité incendie');
  assert.equal(c.dossiers.messagerie[0].libelle, 'Sécurité incendie');
});

test('Filtres : favoris, étiquette, hors dossier (réception), dossier avec ses sous-dossiers', () => {
  let c = K.creerDossier({}, 'messagerie', 'A').classement;
  c = K.creerDossier(c, 'messagerie', 'A1', 'd1').classement;
  c = K.marquer(c, 'messagerie', 'M1', { favori: true, etiquettes: ['e1'] });
  c = K.marquer(c, 'messagerie', 'M2', { dossier: 'd1' });
  c = K.marquer(c, 'messagerie', 'M3', { dossier: 'd2', etiquettes: ['e1'] });
  const ids = ['M1', 'M2', 'M3', 'M4'];
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, { favoris: true }), ['M1']);
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, { etiquette: 'e1' }), ['M1', 'M3']);
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, { dossier: '-' }), ['M1', 'M4']);
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, { dossier: 'd1' }), ['M2']);
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, { dossier: 'd1', avecSous: true }), ['M2', 'M3']);
  assert.deepEqual(K.filtrer(c, 'messagerie', ids, {}), ids);
});
