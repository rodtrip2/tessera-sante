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
    saisies: { types: ['NOTE_' + String(id).toUpperCase()], reduire: () => ({ config: {} }) }, reglages: { defaut: {} }, vues: { onglets: [{ code: 'notes', libelle: 'Notes' }] }
  }, autres || {});
}

test('Isocont : contrat déclaré au registre, identique à ce que le modèle exposait', () => {
  assert.equal(registre.actif(), contrat);
  assert.equal(registre.obtenir('isocont'), contrat);
  assert.equal(contrat.acces, M.ACCES);
  assert.equal(contrat.reglages.defaut, M.CONFIG_DEFAUT);
  assert.equal(contrat.reglages.groupes, M.GROUPES_REGLAGES);
  assert.equal(contrat.saisies.reduire, M.reduire);
  assert.deepEqual(registre.onglets().filter((o) => o.masquable).map((o) => o.code).sort(), M.ONGLETS_MASQUABLES.slice().sort());
  assert.deepEqual(registre.onglets().map((o) => o.code).slice(0, 2), ['patients', 'tableau']);   // Patients en tête
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
  contrat.acces.forEach((a) => a.types.forEach((t) => assert.ok(contrat.saisies.types.includes(t) || actions.includes(t) || (registre.moduleDuType(t) || {}).id === 'patients', t)));
  assert.deepEqual(registre.besoinsManquants(), []);
});

test('Module Patients : module de référence, saisies de la fiche, chargé avant Isocont, fiche reconstituée', () => {
  const P = registre.obtenir('patients');
  assert.ok(P.reference && P.vues.onglets.length === 2)   // liste des patients, plan du service (0.29.1);
  assert.deepEqual(registre.affiches().map((m) => m.id), ['isocont']);
  assert.deepEqual(registre.ordre().map((m) => m.id), ['patients', 'isocont']);
  assert.equal(registre.moduleDuType('PATIENT').id, 'patients');
  assert.equal(registre.moduleDuType('MESURE_DEBUT').id, 'isocont');
  assert.equal(registre.moduleDuType('COMPTE'), null);
  assert.deepEqual(registre.dependants('patients').map((m) => m.id), ['isocont']);
  const at = (h) => new Date(Date.UTC(2026, 10, 1, h)).toISOString();
  const st = P.saisies.reduire([
    { id: '1', at: at(1), by: 'u', type: 'PATIENT', data: { patientId: 'P1', ipp: '100 (fictif)', nom: 'DUPONT (fictif)', naissance: '1980-01-01' } },
    { id: '2', at: at(2), by: 'u', type: 'MODE_HOSPI', data: { patientId: 'P1', date: 1, mode: 'SDT' } },
    { id: '3', at: at(3), by: 'u', type: 'PATIENT', data: { patientId: 'P2', nom: 'DUPONT (fictif)', protection: 'Tutelle' } },
    { id: '4', at: at(4), by: 'u', type: 'FUSION', data: { garde: 'P1', absorbe: 'P2' } },
    { id: '5', at: at(5), by: 'u', type: 'PATIENT', data: { patientId: 'P2', detenu: true } }]);
  assert.deepEqual(Object.keys(st.fiches), ['P1']);
  assert.equal(st.fiches.P1.protection, 'Tutelle');
  assert.equal(st.fiches.P1.detenu, true);                      // saisie sur l'ancienne fiche redirigée
  assert.equal(st.fiches.P1.modes.length, 1);
  // Un type de saisie ne peut être déclaré que par un module ; dépendance circulaire refusée
  const r = registre.nouveau();
  r.declarer(moduleFictif('notes'));
  assert.throws(() => r.declarer(moduleFictif('autres', { saisies: { types: ['NOTE_NOTES'], reduire: () => ({}) } })), /déjà déclaré par « notes »/);
  const r2 = registre.nouveau();
  r2.declarer(moduleFictif('aaa', { besoins: [{ fourniture: 'bbb.liste', version: 1 }], fournitures: [{ nom: 'aaa.liste', version: 1, champs: [] }] }));
  r2.declarer(moduleFictif('bbb', { besoins: [{ fourniture: 'aaa.liste', version: 1 }], fournitures: [{ nom: 'bbb.liste', version: 1, champs: [] }] }));
  assert.throws(() => r2.ordre(), /circulaire/);
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
