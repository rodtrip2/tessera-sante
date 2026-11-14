// SPDX-License-Identifier: EUPL-1.2
// Formalités d'admission et de sortie (lot P, 14 novembre 2026). Données fictives ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = Object.assign(globalThis.SIC || {}, { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') });
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const FO = require('../app/js/formalites.js');
const P = require('../app/js/module-patients.js');

const L = (j, h) => new Date(2026, 10, j, h || 0).getTime();
let n = 0;
const ev = (type, data, by) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(L(10, 9) + n * 60000).toISOString(), by: by || 'a1', type, data });

test('Réglages : désactivées par défaut, liste par défaut, remplacement par service, modes', () => {
  assert.equal(FO.options({}, 'U1').active, false);
  assert.equal(FO.options({}, 'U1').liste.length, 7);
  const c = { formalites: { '*': { active: true }, U2: { active: false, liste: [{ libelle: 'Bracelet posé (fictif)', moment: 'admission', delai: 12, modes: ['SDT'] }, { libelle: '', moment: 'admission' }] } } };
  assert.equal(FO.options(c, 'U1').active, true);
  assert.equal(FO.options(c, 'U2').active, false);
  assert.deepEqual(FO.options(c, 'U2').liste.map((f) => [f.libelle, f.delai, f.modes]), [['Bracelet posé (fictif)', 12, ['SDT']]]);
  assert.equal(FO.controlerCadre({}, { U1: { active: true } }, { roles: ['CADRE'], services: ['U1'] }), true);
  assert.equal(FO.controlerCadre({}, { '*': { active: true } }, { roles: ['CADRE'], services: ['U1'] }), false);
});

test('Saisies et états : fait, sans objet, remis à faire, retard après 48 h, sortie attendue à la sortie', () => {
  const st = P.reduire([
    ev('PATIENT', { patientId: 'P01', nom: 'ALPHA', prenom: 'Camille', service: 'U1' }),
    ev('SEJOUR', { patientId: 'P01', sejourId: 'S1', entree: '2026-11-10', service: 'U1' }),
    ev('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'livret', etat: 'fait', nom: 'Agent A (fictif)' }),
    ev('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'confiance', etat: 'sansObjet' }),
    ev('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'droits', etat: 'fait' }), ev('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'droits', etat: null })
  ]);
  const f = st.fiches.P01, cfg = { formalites: { U1: { active: true } } };
  const e = FO.etatSejour(f, f.sejours[0], cfg, L(11, 12));   // 36 h après l'entrée
  const par = Object.fromEntries(e.map((x) => [x.f.id, x.statut]));
  assert.deepEqual(par, { livret: 'fait', droits: 'aFaire', prevenir: 'aFaire', confiance: 'sansObjet', inventaire: 'aFaire', restitution: 'avenir', documents: 'avenir' });
  assert.equal(e[0].nom, 'Agent A (fictif)');
  assert.equal(FO.etatSejour(f, f.sejours[0], cfg, L(12, 1)).filter((x) => x.statut === 'retard').length, 3);
  assert.equal(FO.retards(st.fiches, cfg, ['U1'], L(12, 1)).length, 3);
  assert.equal(FO.retards(st.fiches, {}, ['U1'], L(12, 1)).length, 0);   // option désactivée : aucune alerte
  assert.deepEqual(FO.resume(f, cfg, L(12, 1)), { faites: 2, total: 5, retard: true });
  assert.throws(() => FO.controler({ patientId: 'P01', sejourId: 'S9', formalite: 'livret', etat: 'fait' }, f), /Séjour/);
  // Droits : tout agent qui saisit le mode d'hospitalisation ou les séjours
  const ok = P.contrat.saisies.permisPourSoi('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'livret', etat: 'fait' }, { id: 'as1', roles: ['AS'] }, { config: {}, etat: st, peut: (t) => t === 'MODE_HOSPI' });
  assert.equal(ok, true);
  assert.equal(P.contrat.saisies.permisPourSoi('FORMALITE', { patientId: 'P01', sejourId: 'S1', formalite: 'livret', etat: 'fait' }, { id: 'x', roles: ['MEDECIN'] }, { config: {}, etat: st, peut: () => false }), false);
});
