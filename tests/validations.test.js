// SPDX-License-Identifier: EUPL-1.2
// Fonctions soumises à avis, onglet « Validations » (décision du porteur du 13 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
const V = require('../app/js/validations.js');
globalThis.SIC = Object.assign(globalThis.SIC || {}, { validations: V });
const registre = require('../app/js/modules.js');
const champs = require('../app/js/champs.js');
const M = require('../app/js/model.js');
const Droits = require('../app/js/droits.js');

const avec = (etats) => ({ validations: { etats } });

test('Catalogue : codes uniques, interlocuteurs connus, catégories et états valides', () => {
  const codes = V.CATALOGUE.map((f) => f.code);
  assert.equal(new Set(codes).size, codes.length);
  V.CATALOGUE.forEach((f) => {
    assert.ok(f.interlocuteurs.length, f.code);
    f.interlocuteurs.forEach((i) => assert.ok(V.interlocuteur(i), f.code + ' : ' + i));
    assert.ok(['clinique', 'personnel', 'autre'].includes(f.categorie), f.code);
    assert.ok(f.libelle && f.description, f.code);
  });
  assert.deepEqual(Object.keys(V.ETATS), ['desactive', 'accord', 'avis']);
  assert.ok(!codes.includes('isocont'), 'Isocont reste hors du mécanisme (registre légal)');
});

test('États par défaut : fonctions existantes activées (accord, sans date), rien enregistré', () => {
  V.CATALOGUE.filter((f) => f.existante).forEach((f) => {
    const e = V.etat({}, f.code);
    assert.equal(e.etat, 'accord');
    assert.equal(e.defaut, true);
    assert.ok(V.actif({}, f.code));
  });
  assert.equal(V.etat({}, 'inconnue'), null);
  assert.ok(V.actif({}, 'inconnue'), 'un code inconnu ne bloque jamais');
});

test('Lecture validée : codes inconnus, états et dates invalides écartés', () => {
  const n = V.normaliser({ etats: { conges: { etat: 'avis', date: '2026-11-20', auteur: '  DPO   (fictif) ', reference: 'x' }, inconnue: { etat: 'avis' }, vehicules: { etat: 'ouvert' }, 'donnee-clinique': { etat: 'desactive', date: '2026-13-40' } } });
  assert.deepEqual(Object.keys(n.etats).sort(), ['conges', 'donnee-clinique']);
  assert.equal(n.etats.conges.auteur, 'DPO (fictif)');
  assert.equal(n.etats['donnee-clinique'].date, '');
  assert.deepEqual(V.normaliser(null), { etats: {} });
});

test('Changer : date et auteur exigés pour activer ; information du délégué pour les données cliniques et du personnel', () => {
  assert.throws(() => V.changer({}, 'vehicules', { etat: 'accord', auteur: 'Cadre supérieur (fictif)' }), /date/);
  assert.throws(() => V.changer({}, 'vehicules', { etat: 'avis', date: '2026-11-14' }), /qui a rendu/);
  assert.throws(() => V.changer({}, 'vehicules', { etat: 'ouvert' }), /état/);
  assert.throws(() => V.changer({}, 'inconnue', { etat: 'desactive' }), /inconnue/);
  // Données du personnel et données cliniques : accord hiérarchique seulement après information du délégué
  assert.throws(() => V.changer({}, 'conges', { etat: 'accord', date: '2026-11-14', auteur: 'Directeur des soins (fictif)' }), /délégué à la protection des données/);
  assert.throws(() => V.changer({}, 'donnee-clinique', { etat: 'accord', date: '2026-11-14', auteur: 'Directeur des soins (fictif)' }), /données cliniques/);
  const v = V.changer({}, 'conges', { etat: 'accord', date: '2026-11-14', auteur: 'Directeur des soins (fictif)', dpoInforme: '2026-11-10' });
  assert.equal(v.etats.conges.dpoInforme, '2026-11-10');
  // Autre catégorie : pas d'exigence ; désactiver ne demande rien et efface l'information du délégué
  assert.ok(V.changer({}, 'vehicules', { etat: 'accord', date: '2026-11-14', auteur: 'Cadre supérieur (fictif)' }).etats.vehicules);
  const d = V.changer({ validations: v }, 'conges', { etat: 'desactive', dpoInforme: '2026-11-10' });
  assert.equal(d.etats.conges.etat, 'desactive');
  assert.equal(d.etats.conges.dpoInforme, '');
});

test('Rappel : fonctions sur accord hiérarchique ; visible du cadre et de la direction, jamais des autres agents', () => {
  const tous = V.CATALOGUE.filter((f) => f.existante).length;
  assert.equal(V.aRappeler({}).length, tous);
  const c = avec({ conges: { etat: 'avis', date: '2026-11-14', auteur: 'DPO (fictif)' }, vehicules: { etat: 'desactive' } });
  assert.equal(V.aRappeler(c).length, tous - 2);
  ['ADMIN', 'CADRE', 'CADRE_SUP', 'DIRECTEUR_SOINS'].forEach((r) => assert.ok(V.voitRappel([r]), r));
  ['IDE', 'AS', 'SECRETAIRE', 'MEDECIN', 'INTERVENANT', 'ADMIN_GARDE'].forEach((r) => assert.ok(!V.voitRappel([r]), r));
  assert.ok(!V.voitRappel([]));
});

test('Rangement par interlocuteur : une fonction figure chez chacun, même état partout', () => {
  const g = V.parInterlocuteur(avec({ conges: { etat: 'avis', date: '2026-11-14', auteur: 'DPO (fictif)' } }));
  const dpo = g.find((x) => x.interlocuteur.code === 'dpo'), rh = g.find((x) => x.interlocuteur.code === 'rh');
  assert.ok(dpo.fonctions.some((x) => x.fonction.code === 'conges' && x.etat.etat === 'avis'));
  assert.ok(rh.fonctions.some((x) => x.fonction.code === 'conges' && x.etat.etat === 'avis'));
  assert.ok(g.every((x) => x.fonctions.length), 'interlocuteurs sans fonction écartés');
  assert.deepEqual(g.map((x) => x.interlocuteur.code), V.INTERLOCUTEURS.map((i) => i.code).filter((c) => g.some((x) => x.interlocuteur.code === c)), 'ordre des interlocuteurs');
});

test('Module masqué quand sa fonction est désactivée (données conservées : le module est seulement hors service)', () => {
  const c = avec({ conges: { etat: 'desactive' } });
  assert.equal(V.moduleAutorise('conges', c), false);
  assert.equal(V.moduleAutorise('conges', {}), true);
  assert.equal(V.moduleAutorise('agenda', c), true);
  // Registre des modules : enService suit l'onglet « Validations »
  const acces = [{ code: 'lire', libelle: 'Consulter', types: ['CONGE_TEST'] }];
  registre.declarer({ id: 'conges', libelle: 'Congés (fictif)', version: '0.1.0', acces, saisies: { types: ['CONGE_TEST'], reduire: () => ({ config: {} }) }, reglages: { defaut: {} }, vues: { onglets: [{ code: 'c', libelle: 'C' }] },
    droits: Droits.creer({ roles: { AGENT: 'Agent', ADMIN: 'Administrateur' }, rolesFournis: ['AGENT'], droits: { AGENT: ['CONGE_TEST'] }, acces, module: 'conges' }) });
  assert.equal(registre.enService('conges', {}), true);
  assert.equal(registre.enService('conges', c), false);
});

test('Données ajoutées masquées : option « donnée clinique » et données du personnel', () => {
  const defs = [
    { id: 'clin', libelle: 'Projet de soins (fictif)', type: 'texte', entite: 'patient', clinique: true },
    { id: 'afgsu', libelle: 'AFGSU valable jusqu’au (fictif)', type: 'date', entite: 'agent' },
    { id: 'repas', libelle: 'Régime (fictif)', type: 'texte', entite: 'patient' }
  ];
  const ids = (cfg) => champs.definitions(Object.assign({ champsAjoutes: defs }, cfg)).map((c) => c.id);
  assert.deepEqual(ids({}), ['clin', 'afgsu', 'repas']);
  assert.deepEqual(ids(avec({ 'donnee-clinique': { etat: 'desactive' } })), ['afgsu', 'repas']);
  assert.deepEqual(ids(avec({ 'donnees-personnel': { etat: 'desactive' } })), ['clin', 'repas']);
  // Administration (option tous) : les définitions restent listées, pour être gérées
  assert.equal(champs.definitions(Object.assign({ champsAjoutes: defs }, avec({ 'donnee-clinique': { etat: 'desactive' } })), { tous: true }).length, 3);
});

test('Réglage `validations` : valeur par défaut, jamais exporté vers un autre établissement, résumé du journal', () => {
  assert.deepEqual(M.CONFIG_DEFAUT.validations, {});
  const f = M.exporterReglages(Object.assign({}, M.CONFIG_DEFAUT, { validations: { etats: { conges: { etat: 'desactive' } } } }), null, {});
  assert.ok(!JSON.stringify(f).includes('"validations"'));
  assert.equal(V.resume({}), 'états par défaut');
  assert.match(V.resume({ etats: { vehicules: { etat: 'avis', date: '2026-11-14', auteur: 'DPO (fictif)' } } }), /Véhicules.*activé après avis \(2026-11-14, DPO \(fictif\)\)/);
});
