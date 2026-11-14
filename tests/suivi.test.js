// SPDX-License-Identifier: EUPL-1.2
// Module Suivi médical et liste commune des médecins (décisions du porteur du 8 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
globalThis.SIC.model = require('../app/js/model.js');
globalThis.SIC.modules = require('../app/js/modules.js');
require('../app/js/module-patients.js');
require('../app/js/module-isocont.js');
const MED = require('../app/js/medecins.js');
const S = require('../app/js/module-suivi.js');
let n = 0;
const ev = (type, data) => ({ id: 'e' + String(++n).padStart(3, '0'), at: '2026-11-08T08:' + String(n).padStart(2, '0') + ':00Z', by: 'u1', type, data });
const t = (iso, h) => S.depuisISO(iso) + (h || 0) * 36e5;

const config = {
  medecins: { liste: [
    { nom: 'Dr ALPHA (fictif)', fonction: 'psychiatre', services: ['U1'] },
    { nom: 'Dr BRAVO (fictif)', fonction: 'psychiatre', services: ['U1', 'U2'] },
    { nom: 'Dr DELTA (fictif)', fonction: 'somaticien', services: ['U1'] },
    { nom: 'Dr ECHO (fictif)', fonction: 'psychiatre', statut: 'interimaire', services: ['U1'], debut: '2026-11-09', fin: '2026-11-15' }] },
  psychiatres: ['Dr ALPHA (fictif)', 'Dr ANCIEN (fictif)'],
  suiviMedical: { lieux: [{ code: 'UMP', libelle: 'Urgences médico-psychologiques (fictif)' }],
    gardes: [{ code: 'nuit', libelle: 'Garde de nuit', debut: '17:30', fin: '08:30', lieu: '' }, { code: 'jour', libelle: 'Garde de jour', debut: '08:30', fin: '17:30', lieu: 'UMP' }] }
};

test('Liste commune des médecins : reprise de l’ancienne liste, intérimaires, gestion par le cadre et la secrétaire', () => {
  const l = MED.liste(config);
  assert.deepEqual(l.map((m) => m.nom), ['Dr ALPHA (fictif)', 'Dr BRAVO (fictif)', 'Dr DELTA (fictif)', 'Dr ECHO (fictif)', 'Dr ANCIEN (fictif)']);
  assert.equal(MED.parNom(config, 'dr ancien (fictif)').fonction, 'psychiatre');
  assert.ok(!MED.noms(config, { date: t('2026-11-20') }).includes('Dr ECHO (fictif)'));   // intérimaire hors période
  assert.ok(MED.noms(config, { date: t('2026-11-10'), service: 'U1' }).includes('Dr ECHO (fictif)'));
  assert.ok(!MED.noms(config, { service: 'U2' }).includes('Dr ALPHA (fictif)'));
  assert.deepEqual(MED.psychiatres(l), ['Dr ALPHA (fictif)', 'Dr BRAVO (fictif)', 'Dr ECHO (fictif)', 'Dr ANCIEN (fictif)']);
  assert.ok(MED.controler(config, 'medecins', config.medecins, { roles: ['SECRETAIRE'] }));
  assert.throws(() => MED.controler(config, 'medecins', { liste: config.medecins.liste.slice(1) }, { roles: ['IDE'] }), /non répertorié/);
  assert.throws(() => MED.controler(config, 'psychiatres', [], { roles: ['IDE'] }), /gérée par/);
  assert.throws(() => MED.controler(config, 'medecins', Object.assign({}, config.medecins, { gestion: ['IDE'] }), { roles: ['CADRE'] }), /administrateur/);
  assert.ok(MED.controler(config, 'medecins', Object.assign({}, config.medecins, { gestion: ['IDE'] }), { roles: ['ADMIN'] }));
});

test('Présences : répétitions, absence prioritaire avec remplaçant, garde rattachée à un lieu, couverture', () => {
  const st = S.reduire([
    ev('PRESENCE', { id: 'p1', medecin: 'Dr ALPHA (fictif)', service: 'U1', nature: 'presence', jours: [1, 2, 3], moments: ['matin', 'apresmidi'], repetition: 'semaine', debut: '2026-11-02' }),
    ev('PRESENCE', { id: 'p2', medecin: 'Dr BRAVO (fictif)', service: 'U1', nature: 'presence', jours: [4], moments: ['matin'], repetition: 'quinzaine', debut: '2026-11-05' }),
    ev('PRESENCE', { id: 'p3', medecin: 'Dr ALPHA (fictif)', nature: 'absence', jours: [3], moments: ['apresmidi'], repetition: 'date', debut: '2026-11-11', remplacant: 'Dr ECHO (fictif)', precision: 'Formation' }),
    ev('PRESENCE', { id: 'p4', medecin: 'Dr BRAVO (fictif)', nature: 'garde', garde: 'jour', jours: [1], repetition: 'semaine', debut: '2026-11-02' }),
    ev('PRESENCE', { id: 'p5', medecin: 'Dr DELTA (fictif)', service: 'U1', nature: 'presence', jours: [2], moments: ['matin'], repetition: 'semaine', debut: '2026-11-02' })
  ]);
  assert.equal(S.couvre(st.presences.p2, '2026-11-12'), false);   // une semaine sur deux
  assert.equal(S.couvre(st.presences.p2, '2026-11-19'), true);
  assert.equal(S.situation(st, config, 'Dr ALPHA (fictif)', 'U1', '2026-11-11', 'matin').etat, 'present');
  const abs = S.situation(st, config, 'Dr ALPHA (fictif)', 'U1', '2026-11-11', 'apresmidi');
  assert.deepEqual([abs.etat, abs.remplacant], ['absent', 'Dr ECHO (fictif)']);
  assert.equal(S.situation(st, config, 'Dr BRAVO (fictif)', 'UMP', '2026-11-09', 'apresmidi').etat, 'garde');   // garde de jour aux UMP
  assert.equal(S.situation(st, config, 'Dr BRAVO (fictif)', 'U1', '2026-11-09', 'matin').etat, '');
  const g = S.grilleLieu(st, config, 'U1', '2026-11-09');
  const cov = (j, m) => g.couverture.find((c) => c.jour === j && c.moment === m);
  assert.equal(cov('2026-11-11', 'apresmidi').psychiatres, 1);   // le remplaçant compte
  assert.equal(cov('2026-11-12', 'matin').psychiatres, 0);
  assert.equal(cov('2026-11-12', 'matin').alerte, true);
  assert.equal(cov('2026-11-14', 'matin').alerte, false);        // samedi : pas d'alerte
  assert.equal(cov('2026-11-10', 'matin').somaticien, 1);
  assert.ok(g.lignes.some((l) => l.medecin.nom === 'Dr ECHO (fictif)'));   // intérimaire du service : sa ligne
  assert.equal(S.gardesDuJour(st, config, '2026-11-09')[0].libelle, 'Garde de jour 08h30–17h30');
  const sm = S.semaineMedecin(st, config, 'Dr ALPHA (fictif)', '2026-11-09');
  assert.deepEqual(sm.lignes.map((l) => l.lieu), ['U1']);
  assert.equal(sm.absences[2].items.length, 1);
  assert.throws(() => S.contrat.saisies.controler('PRESENCE', { id: 'x', medecin: 'Dr A', nature: 'presence', service: 'U1', debut: '2026-11-09', repetition: 'semaine', jours: [] }, { config, etat: st }), /jour de la semaine/);
  assert.throws(() => S.contrat.saisies.controler('PRESENCE', { id: 'x', medecin: 'Dr A', nature: 'garde', garde: 'inconnue', debut: '2026-11-09', repetition: 'date' }, { config, etat: st }), /type de garde/);
});

test('Entretiens et contrats : délais selon la durée d’hospitalisation, retards, identité « NOM Prénom (ch., J) »', () => {
  const fiches = {
    A: { id: 'A', nom: 'ALPHA (fictif)', prenom: 'Camille', medecin1: 'Dr ALPHA (fictif)', medecin2: '', sejours: [{ id: 's', entree: '2026-11-04', service: 'U1', chambre: '3' }] },
    B: { id: 'B', nom: 'BRAVO (fictif)', prenom: 'Dominique', medecin1: 'Dr ALPHA (fictif)', medecin2: 'Dr BRAVO (fictif)', sejours: [{ id: 's', entree: '2026-10-01', service: 'U1', chambre: '12' }] },
    C: { id: 'C', nom: 'CHARLIE (fictif)', prenom: 'Sacha', medecin1: '', medecin2: '', sejours: [{ id: 's', entree: '2026-11-07', service: 'U1' }] },
    D: { id: 'D', nom: 'DELTA (fictif)', prenom: 'Lou', medecin1: 'Dr INCONNU (fictif)', sejours: [{ id: 's', entree: '2026-10-01', sortie: '2026-10-20', service: 'U1' }] }
  };
  const st = S.reduire([
    ev('SUIVI', { id: 's1', patient: 'A', service: 'U1', date: '2026-11-05', medecin: 'Dr ALPHA (fictif)', quoi: 'lesdeux' }),
    ev('SUIVI', { id: 's2', patient: 'B', service: 'U1', date: '2026-10-28', medecin: 'Dr ALPHA (fictif)', quoi: 'entretien' }),
    ev('SUIVI', { id: 's3', patient: 'B', service: 'U1', date: '2026-11-06', medecin: 'Dr BRAVO (fictif)', quoi: 'contrat' }),
    ev('SUIVI', { id: 's4', patient: 'B', service: 'U1', date: '2026-11-07', medecin: 'Dr BRAVO (fictif)', quoi: 'entretien' }),
    ev('SUIVI', { id: 's4', annule: true })
  ]);
  const now = t('2026-11-08', 15);
  assert.deepEqual(S.delais(config, 3), { jusqua: 7, entretien: 2, contrat: 7 });
  assert.deepEqual(S.delais(config, 40), { jusqua: null, entretien: 14, contrat: 30 });
  const a = S.suiviPatient(st, config, fiches.A, now);
  assert.deepEqual([a.jour, a.entretien.jours, a.entretien.retard, a.contrat.retard], [4, 3, true, false]);   // J4 : entretien tous les 2 jours
  const b = S.suiviPatient(st, config, fiches.B, now);
  assert.deepEqual([b.jour, b.entretien.date, b.entretien.retard, b.contrat.date], [38, '2026-10-28', false, '2026-11-06']);   // entretien annulé ignoré
  const c = S.suiviPatient(st, config, fiches.C, now);
  assert.deepEqual([c.entretien.date, c.entretien.retard, c.contrat.retard], [null, false, false]);   // J1 : premier entretien attendu sous 1 jour
  assert.equal(S.identite(fiches.B, now), 'BRAVO (fictif) Dominique (ch. 12, J38)');
  assert.equal(S.identite(fiches.C, now), 'CHARLIE (fictif) Sacha (J1)');
  // Patients par médecin : 1re et 2e ligne, non attribués aux deux niveaux, patient sorti ignoré
  const pm = S.parMedecin(st, config, fiches, 'U1', now);
  assert.deepEqual(pm.nonAttribues.l1.map((x) => x.patient.id), ['C']);
  assert.deepEqual(pm.nonAttribues.l2.map((x) => x.patient.id), ['A', 'C']);
  const alpha = pm.lignes.find((l) => l.medecin.nom === 'Dr ALPHA (fictif)');
  assert.deepEqual([alpha.l1.map((x) => x.patient.id), alpha.l2.length], [['A', 'B'], 0]);
  assert.ok(pm.lignes.some((l) => l.medecin.nom === 'Dr DELTA (fictif)'));   // affecté au service, sans patient
  assert.ok(!pm.lignes.some((l) => l.medecin.nom === 'Dr INCONNU (fictif)'));
  const al = S.alertes(st, config, fiches, ['U1'], now);
  assert.deepEqual(al.map((x) => x.type + (x.niveau || '') + x.suivi.patient.id).sort(), ['entretienA', 'nonAttribue1C', 'nonAttribue2A', 'nonAttribue2C']);
  assert.throws(() => S.contrat.saisies.controler('SUIVI', { id: 'x', patient: 'A', date: '2099-01-01' }, { config }), /futur/);
});

test('Renommage d’un médecin ou rattachement à un compte : les anciennes saisies suivent', () => {
  // Avant : Dr ALPHA ; saisies sous ce nom (fiche patient, présence, entretien), et une présence portant son identifiant
  const avant = { medecins: { liste: [{ id: 'm-alpha', nom: 'Dr ALPHA (fictif)', fonction: 'psychiatre', services: ['U1'] }, { id: 'm-bravo', nom: 'Dr BRAVO (fictif)', fonction: 'psychiatre', services: ['U1'] }] } };
  const renomme = MED.renommer(MED.liste(avant)[0], 'Dr ALPHA-NOUVEAU (fictif)');
  assert.deepEqual([renomme.id, renomme.nom, renomme.anciensNoms], ['m-alpha', 'Dr ALPHA-NOUVEAU (fictif)', ['Dr ALPHA (fictif)']]);
  const apres = { medecins: { liste: [Object.assign(renomme, { compte: 'compte-42' }), MED.liste(avant)[1]] } };
  assert.equal(MED.nomActuel(apres, 'Dr ALPHA (fictif)'), 'Dr ALPHA-NOUVEAU (fictif)');
  assert.equal(MED.resoudre(apres, 'nom effacé', 'm-alpha'), 'Dr ALPHA-NOUVEAU (fictif)');   // l'identifiant prime
  assert.equal(MED.parCompte(apres, 'compte-42').id, 'm-alpha');
  assert.ok(MED.meme(apres, 'Dr ALPHA (fictif)', 'Dr ALPHA-NOUVEAU (fictif)'));
  assert.equal(MED.renommer(renomme, 'Dr ALPHA (fictif)').anciensNoms.indexOf('Dr ALPHA (fictif)'), -1);   // retour à l'ancien nom : pas de doublon
  const st = S.reduire([
    ev('PRESENCE', { id: 'p1', medecin: 'Dr ALPHA (fictif)', service: 'U1', nature: 'presence', jours: [1], repetition: 'semaine', debut: '2026-11-02' }),
    ev('PRESENCE', { id: 'p2', medecin: 'Dr BRAVO (fictif)', nature: 'absence', jours: [2], repetition: 'semaine', debut: '2026-11-02', remplacant: 'Dr ALPHA (fictif)' }),
    ev('SUIVI', { id: 's1', patient: 'A', service: 'U1', date: '2026-11-07', medecin: 'Dr ALPHA (fictif)', medecinId: 'm-alpha', quoi: 'entretien' })
  ]);
  assert.equal(S.situation(st, apres, 'Dr ALPHA-NOUVEAU (fictif)', 'U1', '2026-11-09', 'matin').etat, 'present');
  assert.equal(S.situation(st, apres, 'Dr BRAVO (fictif)', 'U1', '2026-11-10', 'matin').remplacant, 'Dr ALPHA-NOUVEAU (fictif)');
  assert.ok(S.grilleLieu(st, apres, 'U1', '2026-11-09').lignes.every((l) => l.medecin.nom !== 'Dr ALPHA (fictif)'));   // une seule ligne, au nom actuel
  const fiches = { A: { id: 'A', nom: 'A (fictif)', prenom: 'X', medecin1: 'Dr ALPHA (fictif)', sejours: [{ id: 's', entree: '2026-11-01', service: 'U1' }] } };
  const pm = S.parMedecin(st, apres, fiches, 'U1', t('2026-11-08', 12));
  assert.deepEqual(pm.lignes.find((l) => l.medecin.nom === 'Dr ALPHA-NOUVEAU (fictif)').l1.map((x) => x.patient.id), ['A']);
  assert.equal(pm.nonAttribues.l1.length, 0);
  assert.equal(S.suiviPatient(st, apres, fiches.A, t('2026-11-08', 12)).entretien.medecin, 'Dr ALPHA-NOUVEAU (fictif)');
  // Liste des patients : filtre et tri au nom actuel
  const L = require('../app/js/liste-patients.js');
  const ls = L.lignes(fiches, { perimetre: 'hospitalises', filtres: { medecin: 'Dr ALPHA-NOUVEAU (fictif)', modes: [] } }, { maintenant: t('2026-11-08', 12), nomMedecin: (n) => MED.nomActuel(apres, n) });
  assert.equal(ls.length, 1);
});

test('Médecin non répertorié : ajouté par tout agent, à confirmer ; confirmé, réuni ou refusé par le cadre ou la secrétaire', () => {
  const base = { medecins: { liste: [{ id: 'm-alpha', nom: 'Dr ALPHA (fictif)', fonction: 'psychiatre', services: ['U1'] }] } };
  const ide = { id: 'ide1', roles: ['IDE'] };
  const propose = { id: 'm-zulu-1a', nom: 'Dr ZULU (fictif)', fonction: 'psychiatre', services: ['U1'], aConfirmer: true, propose: { par: 'ide1', nom: 'IDE (fictif)', le: '2026-11-08T10:00:00Z', service: 'U1' } };
  const avecPropose = { medecins: { liste: base.medecins.liste.concat([propose]) } };
  assert.ok(MED.controler(base, 'medecins', avecPropose.medecins, ide));
  assert.throws(() => MED.controler(base, 'medecins', { liste: base.medecins.liste.concat([Object.assign({}, propose, { aConfirmer: false })]) }, ide), /non répertorié/);   // pas de fiche confirmée
  assert.throws(() => MED.controler(base, 'medecins', { liste: base.medecins.liste.concat([Object.assign({}, propose, { propose: Object.assign({}, propose.propose, { par: 'autre' }) })]) }, ide), /non répertorié/);
  assert.throws(() => MED.controler(base, 'medecins', { liste: [Object.assign({}, base.medecins.liste[0], { nom: 'Dr X' }), propose] }, ide), /non répertorié/);   // modifier un médecin existant
  // Utilisable aussitôt, marqué à confirmer ; pas dans l'ancienne liste des psychiatres
  assert.ok(MED.noms(avecPropose, { service: 'U1' }).includes('Dr ZULU (fictif)'));
  assert.deepEqual(MED.aConfirmer(avecPropose).map((m) => m.nom), ['Dr ZULU (fictif)']);
  assert.deepEqual(MED.psychiatres(MED.liste(avecPropose)), ['Dr ALPHA (fictif)']);
  // Réunir avec un médecin existant : le nom saisi devient un ancien nom, les saisies suivent
  const reunie = { medecins: { liste: MED.reunir(MED.liste(avecPropose), 'Dr ZULU (fictif)', 'm-alpha') } };
  assert.deepEqual(MED.liste(reunie).map((m) => m.nom), ['Dr ALPHA (fictif)']);
  assert.equal(MED.nomActuel(reunie, 'Dr ZULU (fictif)'), 'Dr ALPHA (fictif)');
  // Noms à rattacher : noms saisis hors liste, sauf ceux laissés tels quels
  const noms = [{ nom: 'Dr ALPHA (fictif)', source: 'fiches patients' }, { nom: 'Dr YANKEE (fictif)', source: 'fiches patients' }, { nom: 'Dr YANKEE (fictif)', source: 'isolement et contention' }, { nom: 'Dr XRAY (fictif)', source: 'présences' }];
  assert.deepEqual(MED.nonRattaches(base, noms).map((x) => [x.nom, Object.keys(x.sources).length]), [['Dr XRAY (fictif)', 1], ['Dr YANKEE (fictif)', 2]]);
  const refus = { medecins: { liste: base.medecins.liste, refuses: ['Dr XRAY (fictif)'] } };
  assert.ok(MED.estRefuse(refus, 'dr xray (fictif)'));
  assert.deepEqual(MED.nonRattaches(refus, noms).map((x) => x.nom), ['Dr YANKEE (fictif)']);
  assert.throws(() => MED.controler(base, 'medecins', { liste: base.medecins.liste, refuses: ['Dr Y'] }, ide), /non répertorié/);
  // Patients par médecin : l'identifiant enregistré dans la fiche prime sur le nom
  const fiches = { A: { id: 'A', nom: 'A (fictif)', prenom: 'X', medecin1: 'nom ancien quelconque', medecin1Id: 'm-alpha', sejours: [{ id: 's', entree: '2026-11-01', service: 'U1' }] } };
  const pm = S.parMedecin(S.reduire([]), base, fiches, 'U1', t('2026-11-08', 12));
  assert.deepEqual(pm.lignes.find((l) => l.medecin.id === 'm-alpha').l1.map((x) => x.patient.id), ['A']);
});

test('Série : modifier ou retirer un seul jour sans toucher au reste de la série (0.20.0)', () => {
  const st = S.reduire([
    ev('PRESENCE', { id: 's1', medecin: 'Dr ALPHA (fictif)', service: 'U1', nature: 'presence', jours: [1, 2], moments: ['matin', 'apresmidi'], repetition: 'semaine', debut: '2026-11-02' }),
    ev('PRESENCE', { id: 's1', sauf: ['2026-11-09', '2026-11-10'], service: 'U1' }),
    ev('PRESENCE', { id: 'j1', medecin: 'Dr ALPHA (fictif)', service: 'U1', nature: 'presence', moments: ['matin'], repetition: 'date', debut: '2026-11-09', remplace: 's1' })
  ]);
  assert.equal(S.couvre(st.presences.s1, '2026-11-09'), false);   // jour écarté
  assert.equal(S.couvre(st.presences.s1, '2026-11-16'), true);    // les autres jours restent
  assert.equal(st.presences.s1.jours.length, 2);                   // la série n'est pas réécrite
  const lundi = S.situation(st, config, 'Dr ALPHA (fictif)', 'U1', '2026-11-09', 'matin');
  assert.deepEqual([lundi.etat, lundi.modifie], ['ponctuel', true]);
  assert.equal(lundi.modifications[0].remplacement.id, 'j1');
  const apm = S.situation(st, config, 'Dr ALPHA (fictif)', 'U1', '2026-11-09', 'apresmidi');
  assert.deepEqual([apm.etat, apm.modifie], ['', true]);          // série retirée ce jour, remplacement le matin seulement
  const mardi = S.modifications(st, config, 'Dr ALPHA (fictif)', '2026-11-10', 'matin');
  assert.deepEqual([mardi.length, mardi[0].remplacement], [1, null]);   // jour retiré
  assert.equal(S.situation(st, config, 'Dr ALPHA (fictif)', 'U1', '2026-11-16', 'matin').modifie, false);
  assert.throws(() => S.contrat.saisies.controler('PRESENCE', { id: 's1', sauf: ['9 novembre'], service: 'U1' }, { config, etat: st }), /mal formés/);
});

test('Planning des psychologues (0.25.0) : présences, entretiens prévus dans une présence, salles occupées', () => {
  const S = require('../app/js/module-suivi.js');
  const ev2 = (type, data, i) => ({ v: 1, id: 'p' + i, at: '2026-11-10T08:0' + i + ':00.000Z', by: 'sec', type, data });
  const st = S.reduire([
    ev2('PRESENCE_PSY', { id: 'PP1', psychologue: 'Mme Petit (fictif)', service: 'U1', nature: 'presence', jours: [1], repetition: 'semaine', debut: '2026-11-02', de: '09:00', a: '12:00', salle: 'S1' }, 1),
    ev2('ENTRETIEN_PREVU', { id: 'EP1', psychologue: 'Mme Petit (fictif)', patient: 'P01', jour: '2026-11-16', de: '09:30', a: '10:15', presence: 'PP1', salle: 'S1', service: 'U1' }, 2),
    ev2('ENTRETIEN_PREVU', { id: 'EP2', psychologue: 'Mme Petit (fictif)', patient: 'P02', jour: '2026-11-18', de: '14:00', a: '15:00', salle: 'S2', service: 'U1' }, 3),
    ev2('PRESENCE', { id: 'PM1', medecin: 'Dr Arnaud (fictif)', service: 'U1', nature: 'presence', jours: [1], moments: ['apresmidi'], repetition: 'semaine', debut: '2026-11-02', salle: 'S3' }, 4)]);
  const sem = S.semainePsy(st, {}, '2026-11-16', ['U1']);
  assert.deepEqual([sem[0].items.map((i) => i.genre), sem[0].items[0].entretiens.map((e) => e.patient), sem[2].items.map((i) => i.genre)], [['presence'], ['P01'], ['entretien']]);
  const debut = new Date(2026, 10, 16).getTime(), fin = new Date(2026, 10, 19).getTime();
  const occ = S.occupationsSalles(st, {}, debut, fin);
  assert.deepEqual(occ.map((o) => o.ref.split('|')[0] + ':' + o.salle).sort(), ['entretien:S2', 'psy:S1', 'suivi:S3']);   // entretien dans la présence : pas en double
  assert.throws(() => S.contrat.saisies.controler('ENTRETIEN_PREVU', { id: 'X', psychologue: 'Mme Petit', patient: 'P01', jour: '2026-11-16', de: '10:00', a: '09:00' }, { etat: st, config: {} }), /Heures/);
  assert.deepEqual([S.droits.peut(['SECRETAIRE'], 'PRESENCE_PSY', {}), S.droits.peut(['IDE'], 'PRESENCE_PSY', {})], [true, false]);
});

test('Salles des présences (14 novembre 2026) : compte relié au médecin ou au psychologue sur l’occupation', () => {
  globalThis.self = globalThis; globalThis.SIC = globalThis.SIC || {}; SIC.medecins = require('../app/js/medecins.js');
  const S2 = require('../app/js/module-suivi.js');
  const config = { medecins: [{ id: 'm-a', nom: 'Dr A (fictif)', fonction: 'psychiatre', compte: 'u-a' }, { id: 'm-b', nom: 'Dr B (fictif)', fonction: 'psychiatre' }],
    psychologues: { liste: [{ id: 'p-c', nom: 'Mme C (fictif)', fonction: 'clinicien', compte: 'u-c' }] } };
  const ev2 = (type, data, i) => ({ v: 1, id: 'q' + i, at: '2026-11-10T08:0' + i + ':00.000Z', by: 'sec', type, data });
  const st = S2.reduire([
    ev2('PRESENCE', { id: 'PA', medecin: 'Dr A (fictif)', service: 'U1', nature: 'presence', jours: [1], moments: ['matin'], repetition: 'semaine', debut: '2026-11-02', salle: 'S1' }, 1),
    ev2('PRESENCE', { id: 'PB', medecin: 'Dr B (fictif)', medecinId: 'm-b', service: 'U1', nature: 'presence', jours: [1], moments: ['matin'], repetition: 'semaine', debut: '2026-11-02', salle: 'S2' }, 2),
    ev2('PRESENCE_PSY', { id: 'PC', psychologue: 'Mme C (fictif)', psychologueId: 'p-c', service: 'U1', nature: 'presence', jours: [1], repetition: 'semaine', debut: '2026-11-02', de: '14:00', a: '16:00', salle: 'S3' }, 3)]);
  const occ = S2.occupationsSalles(st, config, new Date(2026, 10, 16).getTime(), new Date(2026, 10, 17).getTime());
  const par = Object.fromEntries(occ.map((o) => [o.salle, o.compte]));
  assert.deepEqual(par, { S1: 'u-a', S2: '', S3: 'u-c' }, 'nom seul (Dr A) ou identifiant (Mme C) : compte retrouvé ; médecin sans compte : vide');
  // Relevé des salles (agents sans la clé du Suivi médical) : le compte est gardé
  const SA = require('../app/js/module-salles.js');
  if (SA.contenuReflet) assert.equal(SA.contenuReflet(occ).filter((o) => o.compte === 'u-a').length, 1);
});

test('Rôle Médecin (0.28.1) : le médecin relié à un compte saisit ses propres présences, jamais celles d’un autre', () => {
  globalThis.self = globalThis; globalThis.SIC = globalThis.SIC || {}; SIC.medecins = require('../app/js/medecins.js');
  const S2 = require('../app/js/module-suivi.js');
  const config = { medecins: [{ id: 'm-a', nom: 'Dr A (fictif)', fonction: 'psychiatre', compte: 'u-a' }, { id: 'm-b', nom: 'Dr B (fictif)', fonction: 'psychiatre' }] };
  const st = S2.reduire([{ v: 1, id: 'p1', at: '2026-11-11T08:00:00.000Z', by: 'sec', type: 'PRESENCE', data: { id: 'PB', medecin: 'Dr B (fictif)', medecinId: 'm-b', service: 'U1', nature: 'presence', repetition: 'date', debut: '2026-11-12' } }]);
  const ctx = { config, etat: st }, a = { id: 'u-a', roles: ['MEDECIN'] };
  assert.equal(S2.medecinDuCompte(config, a).id, 'm-a');
  assert.equal(S2.permisPourSoi('PRESENCE', { id: 'PA', medecin: 'Dr A (fictif)', medecinId: 'm-a', service: 'U1' }, a, ctx), true);
  assert.equal(S2.permisPourSoi('PRESENCE', { id: 'PX', medecin: 'Dr B (fictif)', medecinId: 'm-b', service: 'U1' }, a, ctx), false);
  assert.equal(S2.permisPourSoi('PRESENCE', { id: 'PB', medecinId: 'm-a' }, a, ctx), false);   // présence d'un autre médecin
  assert.equal(S2.permisPourSoi('PRESENCE', { id: 'PB', supprime: true }, a, ctx), false);
  assert.equal(S2.permisPourSoi('PRESENCE', { id: 'PA', medecinId: 'm-a' }, { id: 'u-z', roles: ['MEDECIN'] }, ctx), false);   // compte sans médecin relié
});

test('Délais par service (14 novembre 2026) : remplacement par service, contrôle du cadre et des médecins chefs', () => {
  const cfg = { services: [{ code: 'U1', libelle: 'U1' }, { code: 'U2', libelle: 'U2' }], suiviMedical: { premierEntretien: 2, tranches: [{ jusqua: 7, entretien: 3, contrat: 10 }, { jusqua: null, entretien: 7, contrat: 30 }],
    services: { U1: { premierEntretien: 1, tranches: [{ jusqua: null, entretien: 2, contrat: 5 }], gardes: [] } } } };
  assert.equal(S.options(cfg, 'U1').premierEntretien, 1);
  assert.equal(S.options(cfg, 'U1').tranches[0].entretien, 2);
  assert.equal(S.options(cfg, 'U2').premierEntretien, 2);
  assert.equal(S.options(cfg).tranches.length, 2);
  assert.equal(S.options(cfg, 'U1').gardes.length, S.options(cfg).gardes.length);   // les gardes restent à l'établissement
  const base = cfg.suiviMedical, avec = (sv, v) => Object.assign({}, base, { services: Object.assign({}, base.services, { [sv]: v }) });
  const cadreU2 = { roles: ['CADRE'], services: ['U2'] }, chef = { roles: ['MEDECIN_CHEF_SERVICE'], services: ['U1'] }, ide = { roles: ['IDE'], services: ['U2'] };
  assert.equal(S.controlerReglages(base, avec('U2', { premierEntretien: 3 }), cadreU2), true);
  assert.equal(S.controlerReglages(base, avec('U1', { premierEntretien: 3 }), cadreU2), false);   // service d'un autre
  assert.equal(S.controlerReglages(base, avec('U1', { premierEntretien: 3 }), chef), true);
  assert.equal(S.controlerReglages(base, avec('U2', { premierEntretien: 3 }), ide), false);
  assert.equal(S.controlerReglages(base, avec('U2', { gardes: [] }), cadreU2), false);   // clé réservée à l'établissement
  assert.equal(S.controlerReglages(base, Object.assign({}, base, { premierEntretien: 9 }), cadreU2), false);
  assert.equal(S.controlerReglages(base, Object.assign({}, base, { premierEntretien: 9 }), { roles: ['ADMIN'] }), true);
});

test('Comptes qui suivent un pôle : écarts entre leurs services et ceux du pôle', () => {
  const M = require('../app/js/model.js');
  const cfg = { services: [{ code: 'U1' }, { code: 'U2' }, { code: 'U3' }], poles: [{ code: 'P1', libelle: 'Pôle 1', services: ['U1', 'U2'] }], comptesPoles: { c1: 'P1', c3: 'P9' } };
  const comptes = [{ id: 'c1', nom: 'Cadre sup', actif: true, services: ['U1', 'U3'] }, { id: 'c2', nom: 'Autre', actif: true, services: ['U1'] }, { id: 'c3', nom: 'Pôle disparu', actif: true, services: ['U1'] }];
  const e = M.ecartsPoles(cfg, comptes);
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].compte.id, e[0].ajoutes, e[0].retires, e[0].services], ['c1', ['U2'], ['U3'], ['U1', 'U2']]);
  assert.equal(M.poleSuivi(cfg, 'c3'), null);
  assert.equal(M.ecartsPoles(cfg, [{ id: 'c1', actif: true, services: ['U2', 'U1'] }]).length, 0);
});
