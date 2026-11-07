// Import de la liste des patients du DPI (module Patients, 0.6.4) : données entièrement fictives ; npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const IP = require('../app/js/import-patients.js');
const P = require('../app/js/module-patients.js');

// Export « patients présents » au format décrit (séparateur ;) — tout est fictif
const CSV = [
  'Liste des patients présents (fictif)',
  'IEP;Sexe;Nom prénom;Né·e le;Entrée;RM;RH;Loc.;Médecin responsable;Commentaires',
  '7001;F;DURAND ALICE Née MARTIN;03/04/1980;01/11/2026;UHP1;UHP1;HD412-U;Dr X (fictif);texte libre',
  '7002;M;LEROY JEAN-PAUL Né LEROY;12/12/1975;02/11/2026;UHP1;UHP1;HD410-P;;',
  '7003;F;DE LA FONTAINE MARIE Née DE LA FONTAINE;01/01/1990;03/11/2026;UHP2;UHP2;HD401-F;;',
  '7004;F;BERNARD DUPONT CLAIRE Née ROUX;05/05/1985;04/11/2026;UHP1;UHP1;HD405-U;;',
  '7005;M;PETIT LUC Né PETIT;07/07/1970;05/11/2026;CONSULT;CONSULT;;;',
  '7006;X;SANS UNITE Né SANS;07/07/1970;05/11/2026;ZZZ;ZZZ;;;'
].join('\r\n');

test('Découpage du nom (règles du porteur) et de la localisation', () => {
  assert.deepEqual(IP.decouperNom('DURAND ALICE Née MARTIN'), { nom: 'DURAND', prenom: 'Alice', nomNaissance: 'MARTIN', regle: 3, ambigu: false });
  assert.deepEqual(IP.decouperNom('LEROY JEAN-PAUL Né LEROY'), { nom: 'LEROY', prenom: 'Jean-Paul', nomNaissance: 'LEROY', regle: 2, ambigu: false });
  assert.deepEqual(IP.decouperNom('DE LA FONTAINE MARIE Née DE LA FONTAINE'), { nom: 'DE LA FONTAINE', prenom: 'Marie', nomNaissance: 'DE LA FONTAINE', regle: 2, ambigu: false });
  const d = IP.decouperNom('BERNARD DUPONT CLAIRE Née ROUX');
  assert.equal(d.prenom, 'Claire'); assert.equal(d.nom, 'BERNARD DUPONT'); assert.equal(d.ambigu, true);   // règle 3, plus de deux mots
  assert.deepEqual(IP.decouperLoc('HD412-U'), { chambre: '412', lit: 'U', reconnu: true });
  assert.deepEqual(IP.decouperLoc('HD401-F'), { chambre: '401', lit: 'F', reconnu: true });
  assert.equal(IP.decouperLoc('couloir B').reconnu, false);
  assert.equal(IP.lireJour('03/04/1980'), '1980-04-03');
  assert.equal(IP.lireJour('31/13/1980'), null);
});

function preparer(fiches, unites) {
  const lignes = IP.lireCSV(CSV);
  const m = IP.appliquerModele(lignes, null);
  m.unites = unites || { UHP1: 'U1', UHP2: 'U2', CONSULT: '' };
  return { lignes, m, a: IP.analyser(lignes, m, fiches || {}, { aujourdhui: '2026-11-07' }) };
}

test('Attribution proposée : en-tête repérée sous un titre, colonnes découpées, médecin et commentaires jamais proposés', () => {
  const { m } = preparer();
  assert.equal(m.entete, 1);
  assert.equal(m.colonnes.iep, 'IEP');
  assert.equal(m.colonnes.nomComplet, 'Nom prénom');
  assert.equal(m.colonnes.naissance, 'Né·e le');
  assert.equal(m.colonnes.unite, 'RM');
  assert.equal(m.colonnes.loc, 'Loc.');
  assert.equal(m.colonnes.ipp, null);
  assert.ok(!Object.values(m.colonnes).includes('Médecin responsable') && !Object.values(m.colonnes).includes('Commentaires'));
});

test('Aperçu sur une liste vierge : nouveaux, ambigus, unité écartée, unité sans service, sexe non reconnu', () => {
  const { a } = preparer();
  const st = (n) => a.lignes.find((r) => r.n === n);
  assert.equal(st(3).statut, 'nouveau');
  assert.deepEqual(st(3).valeurs, { iep: '7001', nom: 'DURAND', prenom: 'Alice', nomNaissance: 'MARTIN', sexe: 'F', naissance: '1980-04-03', entree: '2026-11-01', chambre: '412', lit: 'U', service: 'U1' });
  assert.equal(st(6).decoupage.ambigu, true);
  assert.equal(st(7).statut, 'ignoree');                              // CONSULT : écartée
  assert.equal(st(8).statut, 'erreur');                               // ZZZ : sans service
  assert.deepEqual(a.services.sort(), ['U1', 'U2']);
  const s = IP.saisies(a, {}, { at: '2026-11-07T10:00:00.000Z' });
  assert.equal(s.resume.creees, 4);
  assert.equal(s.evenements.filter((e) => e.type === 'SEJOUR').length, 4);
  const pat = s.evenements.find((e) => e.type === 'PATIENT' && e.data.nom === 'BERNARD DUPONT');
  assert.equal(pat.data.decoupageNom, 'BERNARD DUPONT CLAIRE Née ROUX'); // découpage validé gardé pour la fiche
  assert.ok(s.evenements.every((e) => e.data.origine === 'import-dpi'));
  // Découpage corrigé par l'agent avant l'import
  const s2 = IP.saisies(a, { noms: { 6: { nom: 'BERNARD', prenom: 'dupont claire', nomNaissance: 'ROUX' } } });
  assert.ok(s2.evenements.find((e) => e.type === 'PATIENT' && e.data.nom === 'BERNARD' && e.data.prenom === 'Dupont Claire'));
});

test('Second import : rattachement par séjour, rien de nouveau ; saisie manuelle jamais écrasée ; absents proposés à la sortie', () => {
  const at = (j) => new Date(Date.UTC(2026, 10, j)).toISOString();
  let evts = [], k = 0;
  const premier = IP.saisies(preparer().a, {}, { at: at(5) });
  premier.evenements.forEach((e) => evts.push(Object.assign({ id: 'e' + (++k), by: 'u' }, e)));
  // Correction manuelle de la date de naissance d'ALICE dans Tessera ; patient fictif présent hors de la liste
  const alice = Object.values(P.reduire(evts).fiches).find((f) => f.prenom === 'Alice');
  evts.push({ id: 'm1', at: at(6), by: 'u', type: 'PATIENT', data: { patientId: alice.id, naissance: '1980-04-04' } });
  evts.push({ id: 'm2', at: at(6), by: 'u', type: 'PATIENT', data: { patientId: 'PZ', nom: 'PARTI (fictif)', service: 'U1' } });
  evts.push({ id: 'm3', at: at(6), by: 'u', type: 'SEJOUR', data: { patientId: 'PZ', sejourId: 'SZ', entree: '2026-10-01', service: 'U1' } });
  const fiches = P.fiches(evts).fiches;
  const { a } = preparer(fiches);
  const r3 = a.lignes.find((r) => r.n === 3);
  assert.equal(r3.fiche.id, alice.id);
  assert.equal(r3.statut, 'identique');
  assert.deepEqual(r3.ecarts.map((x) => x.champ), ['naissance']);     // signalé, non écrasé
  assert.equal(a.lignes.find((r) => r.n === 6).decoupage.valide, true);
  assert.deepEqual(a.absents.map((x) => x.fiche.id), ['PZ']);
  const s = IP.saisies(a, {});
  assert.equal(s.evenements.length, 0, 'rien à enregistrer');
  const s2 = IP.saisies(a, { sorties: { PZ: '2026-11-07' } });
  assert.deepEqual(s2.evenements.map((e) => [e.type, e.data.sejourId, e.data.sortie]), [['SEJOUR', 'SZ', '2026-11-07']]);
  // Changement de chambre au troisième import
  const csv3 = IP.lireCSV(CSV.replace('HD412-U', 'HD414-P'));
  const m3 = IP.appliquerModele(csv3, IP.modeleAMemoriser(Object.assign({}, preparer().m)));
  const a3 = IP.analyser(csv3, m3, fiches, {});
  const l3 = a3.lignes.find((r) => r.n === 3);
  assert.equal(l3.statut, 'modifie');
  assert.deepEqual(l3.sejour.changements.map((x) => [x.champ, x.apres]), [['chambre', '414'], ['lit', 'P']]);
});

test('Doublon possible (réadmission sans IPP, nouveau numéro de séjour) : rattaché seulement après confirmation', () => {
  const fiches = { PA: { id: 'PA', nom: 'DURAND', prenom: 'Alice', nomNaissance: 'MARTIN', sexe: 'F', naissance: '1980-04-03', service: 'U1', modes: [], sejours: [{ id: 'S0', iep: '6000', entree: '2026-01-01', sortie: '2026-02-01', service: 'U1' }] } };
  const { a } = preparer(fiches);
  const r = a.lignes.find((x) => x.n === 3);
  assert.equal(r.statut, 'doublon');
  assert.deepEqual(r.candidats.map((x) => x.id), ['PA']);
  assert.equal(IP.saisies(a, {}).resume.attente, 1);
  const s = IP.saisies(a, { doublons: { 3: 'PA' } });
  const sej = s.evenements.find((e) => e.type === 'SEJOUR' && e.data.patientId === 'PA');
  assert.equal(sej.data.iep, '7001');                                 // nouveau séjour sur la fiche existante
  assert.ok(!s.evenements.some((e) => e.type === 'PATIENT' && e.data.patientId === 'PA'), 'fiche identique');
});
