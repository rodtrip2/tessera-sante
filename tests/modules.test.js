// SPDX-License-Identifier: EUPL-1.2
// Registre des modules et contrat d'Isocont (étape 2 du plan d'architecture) : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const registre = require('../app/js/modules.js');
const M = require('../app/js/model.js');
const { contrat } = require('../app/js/module-isocont.js');
const Droits = require('../app/js/droits.js');

function moduleFictif(id, autres) {
  return Object.assign({
    id, libelle: 'Module ' + id + ' (fictif)', version: '0.1.0', acces: [{ code: 'lire', libelle: 'Consulter', types: ['NOTE'] }],
    droits: Droits.creer({ roles: { AGENT: 'Agent', ADMIN: 'Administrateur' }, rolesFournis: ['AGENT'], droits: { AGENT: ['NOTE'] }, acces: [{ code: 'lire', libelle: 'Consulter', types: ['NOTE'] }] }),
    saisies: { types: ['NOTE'], reduire: () => ({ config: {} }) }, reglages: { defaut: {} }, vues: { onglets: [{ code: 'notes', libelle: 'Notes' }] }
  }, autres || {});
}

test('Isocont : contrat déclaré au registre, identique à ce que le modèle exposait', () => {
  assert.equal(registre.actif(), contrat);
  assert.equal(registre.obtenir('isocont'), contrat);
  assert.equal(contrat.acces, M.ACCES);
  assert.equal(contrat.reglages.defaut, M.CONFIG_DEFAUT);
  assert.equal(contrat.reglages.groupes, M.GROUPES_REGLAGES);
  assert.equal(contrat.saisies.reduire, M.reduire);
  assert.deepEqual(contrat.vues.onglets.filter((o) => o.masquable).map((o) => o.code), M.ONGLETS_MASQUABLES);
  // Droits liés aux données d'Isocont : mêmes réponses que l'interface historique du modèle
  const cfg = { roles: { IDE: { journal: 'siennes' }, R_DIR: { libelle: 'Direction (fictif)', acces: ['stats'], services: false } } };
  for (const r of ['IDE', 'AS', 'SECRETAIRE', 'CADRE', 'ADMIN', 'R_DIR']) {
    for (const t of ['MESURE_DEBUT', 'JLD', 'CONFIG', 'STATS', 'EDITION_CADA', 'ANNULATION']) assert.equal(contrat.droits.peut([r], t, cfg), M.peut([r], t, cfg));
    assert.equal(contrat.droits.niveauJournal([r], cfg), M.niveauJournal([r], cfg));
  }
  assert.deepEqual(M.accesDefaut('CADRE').slice(-1), ['communication']);   // registre communiqué : cadre par défaut
  assert.equal(M.niveauJournal(['CADRE'], {}), 'complet');
  // Chaque accès ouvre des saisies du module ou des actions connues
  const actions = ['ANNULATION', 'EDITION_CADA', 'EXPORT_PATIENT'];
  contrat.acces.forEach((a) => a.types.forEach((t) => assert.ok(contrat.saisies.types.includes(t) || actions.includes(t), t)));
  assert.deepEqual(registre.besoinsManquants(), []);
});

test('Registre : contrats incomplets ou incohérents refusés', () => {
  const r = registre.nouveau();
  assert.throws(() => r.declarer(moduleFictif('Notes')), /identifiant/);
  assert.throws(() => r.declarer(moduleFictif('notes', { version: '1' })), /version/);
  assert.throws(() => r.declarer(moduleFictif('notes', { saisies: { types: [] } })), /reduire/);
  assert.throws(() => r.declarer(moduleFictif('notes', { vues: { onglets: [{ code: 'journal', libelle: 'Journal' }] } })), /réservé/);
  assert.throws(() => r.declarer(moduleFictif('notes', { acces: [{ code: 'a', libelle: 'A', types: [] }, { code: 'a', libelle: 'B', types: [] }] })), /double/);
  assert.throws(() => r.declarer(moduleFictif('notes', { migrations: [{ numero: 2, appliquer() {} }] })), /numérotées/);
  assert.throws(() => r.declarer(moduleFictif('notes', { fournitures: [{ nom: 'autre.liste', version: 1, champs: [] }] })), /mal nommée/);
  assert.throws(() => r.declarer(moduleFictif('notes', { fournitures: [{ nom: 'notes.liste', version: 1, champs: [], publication: true }] })), /publication/);
  assert.throws(() => r.declarer(moduleFictif('notes', { besoins: [{ fourniture: 'notes.liste', version: 1 }] })), /lui-même/);
  r.declarer(moduleFictif('notes'));
  assert.throws(() => r.declarer(moduleFictif('notes')), /déjà déclaré/);
  assert.throws(() => r.completerInterface('agenda', {}), /non déclaré/);
  assert.equal(r.completerInterface('notes', { vues: {} }).interface.vues !== undefined, true);
});

test('Registre : besoins satisfaits par un faux fournisseur, versions, migrations à faire', () => {
  const r = registre.nouveau();
  r.declarer(moduleFictif('agenda', { besoins: [{ fourniture: 'faux.echeances', version: 2, obligatoire: false }] }));
  assert.deepEqual(r.besoinsManquants(), [{ module: 'agenda', fourniture: 'faux.echeances', version: 2, obligatoire: false }]);
  r.declarer(moduleFictif('faux', { fournitures: [{ nom: 'faux.echeances', version: 1, champs: ['date'] }] }));
  assert.equal(r.besoinsManquants().length, 1);           // version 1 fournie, version 2 attendue
  const r2 = registre.nouveau();
  r2.declarer(moduleFictif('faux', { fournitures: [{ nom: 'faux.echeances', version: 2, champs: ['date'] }] }));
  r2.declarer(moduleFictif('agenda', { besoins: [{ fourniture: 'faux.echeances', version: 2 }] }));
  assert.deepEqual(r2.besoinsManquants(), []);
  assert.equal(r2.actif().id, 'faux');
  const r3 = registre.nouveau();
  r3.declarer(moduleFictif('notes', { migrations: [{ numero: 1, libelle: 'a', appliquer() {} }, { numero: 2, libelle: 'b', appliquer() {} }] }));
  assert.deepEqual(r3.migrationsAFaire('notes', 1).map((m) => m.numero), [2]);
  assert.deepEqual(r3.migrationsAFaire('notes', 0).map((m) => m.numero), [1, 2]);
});
