// SPDX-License-Identifier: EUPL-1.2
// Sortie envisagée ou actée (0.21.0). Données fictives.
const test = require('node:test');
const assert = require('node:assert/strict');
const SO = require('../app/js/sorties.js');
const CO = require('../app/js/couleurs.js');
const Pt = require('../app/js/module-patients.js');

test('Sortie : envisagée (jour, fourchette ou approximation) ou actée (date précise, heure)', () => {
  assert.deepEqual(SO.normaliser({ debut: '2026-11-20' }), { etat: 'envisagee', debut: '2026-11-20' });   // saisie d'avant la 0.21.0
  assert.deepEqual(SO.normaliser({ etat: 'envisagee', debut: '2026-11-16', fin: '2026-11-20', precision: ' après la synthèse ' }), { etat: 'envisagee', debut: '2026-11-16', fin: '2026-11-20', precision: 'après la synthèse' });
  assert.deepEqual(SO.normaliser({ etat: 'envisagee', precision: 'la semaine prochaine' }), { etat: 'envisagee', precision: 'la semaine prochaine' });
  assert.equal(SO.normaliser({ etat: 'envisagee' }), null);
  assert.deepEqual(SO.normaliser({ etat: 'actee', debut: '2026-11-14', heure: '11:00', fin: '2026-11-20' }), { etat: 'actee', debut: '2026-11-14', heure: '11:00' });
  assert.throws(() => SO.normaliser({ etat: 'actee', precision: 'bientôt' }), /date précise/);
  assert.throws(() => SO.normaliser({ debut: '2026-11-20', fin: '2026-11-10' }), /précède/);
  assert.equal(SO.libelle({ etat: 'actee', debut: '2026-11-14', heure: '11:00' }), 'Actée : 14/11/2026 à 11:00');
  assert.equal(SO.libelle({ debut: '2026-11-16', fin: '2026-11-20', precision: 'après la synthèse' }), 'Envisagée : du 16/11/2026 au 20/11/2026 — après la synthèse');
  assert.equal(SO.libelle({ precision: 'la semaine prochaine' }), 'Envisagée : la semaine prochaine');
});

test('Sortie : couleur selon l’état, réglable ; affichage jour par jour', () => {
  const t0 = Date.UTC(2026, 10, 11, 9);
  const coul = (v, regles) => (CO.evaluer(regles || SO.REGLES_DEFAUT, { valeur: v.debut || null, cle: SO.etat(v), maintenant: t0 }) || {}).couleur;
  assert.equal(coul({ etat: 'actee', debut: '2026-11-14' }), 'vert');
  assert.equal(coul({ debut: '2026-11-16', fin: '2026-11-20' }), 'jaune');
  assert.equal(coul({ precision: 'la semaine prochaine' }), 'jaune');
  assert.equal(coul({ etat: 'actee', debut: '2026-11-09' }), 'rouge');   // date passée
  assert.equal(coul({ etat: 'actee', debut: '2026-11-14' }, [{ si: { op: 'egal', valeur: 'actee' }, couleur: 'bleu', rendu: 'fond' }]), 'bleu');   // réglée
  let n = 0;
  const ev = (type, data) => ({ id: 's' + (++n), at: new Date(Date.UTC(2026, 10, 1, 8, n)).toISOString(), by: 'ide1', type, data });
  const st = Pt.reduire([
    ev('PATIENT', { patientId: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1' }), ev('SEJOUR', { patientId: 'P1', sejourId: 'S1', entree: '2026-10-01', service: 'U1' }),
    ev('SEJOUR', { patientId: 'P1', sejourId: 'S1', sortiePrevue: { debut: '2026-11-16', fin: '2026-11-20' } }),
    ev('SEJOUR', { patientId: 'P1', sejourId: 'S1', sortiePrevue: { etat: 'actee', debut: '2026-11-14', heure: '11:00' } }),
    ev('PATIENT', { patientId: 'P2', nom: 'BRAVO', prenom: 'Deux (fictif)', service: 'U1' }), ev('SEJOUR', { patientId: 'P2', sejourId: 'S2', entree: '2026-10-05', service: 'U1' }),
    ev('SEJOUR', { patientId: 'P2', sejourId: 'S2', sortiePrevue: { etat: 'envisagee', precision: 'la semaine prochaine' } })]);
  assert.equal(SO.sejourEnCours(st.fiches.P1).historiqueSortiePrevue.length, 2);   // chaque changement gardé
  const r = SO.parJour(st.fiches, '2026-11-09', '2026-11-15');
  assert.deepEqual(r.sorties.map(x => [x.patientId, x.jour, x.etat, x.heure]), [['P1', '2026-11-14', 'actee', '11:00']]);
  assert.deepEqual(r.sansDate.map(x => x.patientId), ['P2']);
  assert.equal(SO.parJour(st.fiches, '2026-11-16', '2026-11-22').sorties.length, 0);
});
