// SPDX-License-Identifier: EUPL-1.2
// Module Vue d'ensemble (0.19, plan relu par le porteur le 9 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
globalThis.SIC.model = require('../app/js/model.js');
globalThis.SIC.modules = require('../app/js/modules.js');
globalThis.SIC.champs = require('../app/js/champs.js');
globalThis.SIC.couleurs = require('../app/js/couleurs.js');
require('../app/js/module-patients.js');
require('../app/js/module-isocont.js');
globalThis.SIC.medecins = require('../app/js/medecins.js');
const S = require('../app/js/module-suivi.js');
const V = require('../app/js/module-vue.js');

const maintenant = new Date(2026, 10, 9, 12).getTime();
const fiche = (id, nom, entree, extra) => Object.assign({ id, nom: nom + ' (fictif)', prenom: 'X', naissance: '1980-01-01', modes: [{ date: 0, mode: 'SDT' }], service: 'U1',
  sejours: [{ id: 'S' + id, entree, service: 'U1', chambre: id.slice(1) }] }, extra || {});
const config = {
  services: [{ code: 'U1', libelle: 'U1 (fictif)' }, { code: 'U2', libelle: 'U2 (fictif)' }],
  medecins: { liste: [{ id: 'm-alpha', nom: 'Dr ALPHA (fictif)', services: ['U1'], initiales: 'AL' }] },
  capacites: { services: { U1: { lits: 10 } } },
  champsAjoutes: [
    { id: 'accueil', libelle: 'Check-list d’entrée', type: 'checklist', entite: 'patient', module: 'patients', modele: [{ id: 'aa', libelle: 'A' }, { id: 'bb', libelle: 'B' }] },
    { id: 'jours-sortie', libelle: 'Jours avant la sortie', type: 'formule', formule: 'SIERREUR(-JOURS([Sortie prévisionnelle]); "")', entite: 'patient', module: 'patients' }],
  reglagesDonnees: { 'patients.medecin1': { '*': { regles: [{ si: { op: 'egal', valeur: 'm-alpha' }, couleur: 'bleu', rendu: 'pastille' }, { si: { op: 'vide' }, couleur: 'rouge' }] } } }
};
const fiches = {
  P1: fiche('P1', 'UN', '2026-11-05', { medecin1: 'Dr ALPHA (fictif)', complements: { accueil: { elements: [], coches: { aa: { fait: true } } } } }),
  P2: fiche('P2', 'DEUX', '2026-07-01'),
  P3: fiche('P3', 'TROIS', '2026-10-20', { sejours: [{ id: 'SP3', entree: '2026-10-20', service: 'U1', chambre: '3', sortiePrevue: { debut: '2026-11-12' } }] })
};
const ctx = { config, maintenant, fiches, services: ['U1'], valeurs: { patient: {}, medecin: {} }, suivi: S.reduire([]), suiviModule: S, hospitalises: Object.values(fiches), libService: (c) => c };

test('Vues : vues proposées, visibilité par rôle et service, réglage par le cadre pour ses services seulement', () => {
  assert.deepEqual(V.vues({}).map((v) => v.id), ['medicale', 'staff', 'medecins', 'equipe']);
  const cfg = { vuesEnsemble: { vues: [
    { id: 'u1', nom: 'Staff U1', services: ['U1'], colonnes: ['patient'] },
    { id: 'u2', nom: 'Staff U2', services: ['U2'], roles: ['CADRE'], colonnes: ['patient'] },
    { id: 'etab', nom: 'Établissement', services: [], colonnes: ['patient'] }] } };
  assert.deepEqual(V.vuesPour(cfg, { roles: ['IDE'], services: ['U1'] }).map((v) => v.id), ['u1', 'etab']);
  assert.deepEqual(V.vuesPour(cfg, { roles: ['IDE'], services: ['U2'] }).map((v) => v.id), ['etab'], 'vue réservée au cadre');
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  const modif = JSON.parse(JSON.stringify(cfg.vuesEnsemble)); modif.vues[0].nom = 'Staff du lundi';
  assert.ok(V.controlerCadre(cfg.vuesEnsemble, modif, cadre));
  const etab = JSON.parse(JSON.stringify(cfg.vuesEnsemble)); etab.vues[2].nom = 'Autre';
  assert.ok(!V.controlerCadre(cfg.vuesEnsemble, etab, cadre), 'vue d’établissement : administrateur');
  assert.ok(V.peutClore(V.normaliser({ id: 'x', nom: 'X' }), cadre), 'clôture : cadre par défaut');
  assert.ok(!V.peutClore(V.normaliser({ id: 'x', nom: 'X' }), { roles: ['IDE'] }));
  assert.ok(V.peutClore(V.normaliser({ id: 'x', nom: 'X', instantane: { roles: ['IDE'] } }), { roles: ['IDE'] }), 'réglable par le cadre');
});

test('Vue : colonnes, couleurs selon les réglages des données, initiales, check-list, formule, groupes à la date et l’heure près, synthèse', () => {
  const v = V.normaliser({ id: 'staff', nom: 'Staff', services: ['U1'], tri: { colonne: 'entree', sens: -1 }, synthese: ['effectif', 'places', 'sorties', 'ageMoyen'],
    colonnes: [{ code: 'patient' }, { code: 'medecin1', affichage: 'initiales' }, { code: 'sortiePrevue' }, { code: 'c:accueil' }, { code: 'c:jours-sortie' }],
    groupes: [{ id: 'g1', titre: 'Entrés depuis le 4/11 14 h', conditions: [{ colonne: 'entree', op: 'apresLe', valeur: '2026-11-04T14:00' }] },
      { id: 'g2', titre: 'Plus de 90 jours', conditions: [{ colonne: 'entree', op: 'depuisPlusDe', n: 90 }] }], autres: { titre: 'Autres' } });
  const cat = V.catalogue('patients', ctx), cols = v.colonnes.map((c) => V.colonneDe(cat, c.code));
  const ls = V.lignes(v, ctx);
  const l1 = ls.find((l) => l.id === 'P1'), l3 = ls.find((l) => l.id === 'P3');
  const med = V.cellule(cols[1], l1, ctx, v.colonnes[1], cols);
  assert.equal(med.lib, 'AL', 'initiales réglées dans la fiche du médecin');
  assert.equal(med.couleur.couleur, 'bleu', 'couleur par psychiatre (identifiant stable)');
  assert.equal(V.cellule(cols[1], l3, ctx, v.colonnes[1], cols).couleur.couleur, 'rouge', 'sans médecin');
  assert.equal(V.cellule(cols[3], l1, ctx, v.colonnes[3], cols).lib, '1/2');
  assert.equal(V.cellule(cols[3], l3, ctx, v.colonnes[3], cols).lib, '0/2', 'avancement d’après le modèle');
  assert.equal(V.cellule(cols[4], l3, ctx, v.colonnes[4], cols).lib, '3', 'formule : jours avant la sortie');
  assert.equal(V.cellule(cols[4], l1, ctx, v.colonnes[4], cols).lib, '—', 'formule : erreur rattrapée (SIERREUR)');
  const gs = V.ranger(v, ls, cat, ctx, cols);
  assert.deepEqual(gs.map((g) => [g.titre, g.lignes.map((l) => l.id)]), [['Entrés depuis le 4/11 14 h', ['P1']], ['Plus de 90 jours', ['P2']], ['Autres', ['P3']]]);
  const sy = V.synthese(v, ls, ctx);
  assert.equal(sy.find((x) => x.code === 'places').valeur, '7');
  assert.equal(sy.find((x) => x.code === 'sorties').detail, '1 dans les 7 jours');
  // Règle propre à la vue évaluée avant les réglages de la donnée
  const vc = Object.assign({}, v.colonnes[1], { regles: [{ si: { op: 'rempli' }, couleur: 'vert', rendu: 'fond' }] });
  assert.equal(V.cellule(cols[1], l1, ctx, vc, cols).couleur.couleur, 'vert');
});

test('Instantané : parts rangées par journal des colonnes (Patients, Suivi médical, clé propre), identité et synthèse avec les patients', () => {
  const cfg = Object.assign({}, config, { champsAjoutes: config.champsAjoutes.concat([{ id: 'vig', libelle: 'Vigilance', type: 'texte', entite: 'patient', module: 'patients', protection: 'cle', lecture: ['IDE'] }]) });
  const c2 = Object.assign({}, ctx, { config: cfg, valeurs: { patient: { P1: { vig: 'Point organisationnel (fictif)' } }, medecin: {} } });
  const v = V.normaliser({ id: 'staff', nom: 'Staff', services: ['U1'], synthese: ['effectif'], colonnes: [{ code: 'patient' }, { code: 'dernierEntretien' }, { code: 'c:vig' }] });
  const cat = V.catalogue('patients', c2), cols = v.colonnes.map((c) => ({ col: V.colonneDe(cat, c.code), vcol: c }));
  const gs = V.ranger(v, V.lignes(v, c2), cat, c2, cols.map((x) => x.col));
  const p = V.preparerInstantane(v, gs, cols, c2, 'I1');
  assert.deepEqual(p.parts.map((x) => x.journal).sort(), ['d-vig', 'patients', 'suivi']);
  const pv = p.parts.find((x) => x.journal === 'd-vig').data;
  assert.equal(pv.valeurs.P1['c:vig'].lib, 'Point organisationnel (fictif)');
  assert.ok(!pv.identites && !pv.synthese, 'la part protégée ne porte que sa colonne');
  const pp = p.parts.find((x) => x.journal === 'patients').data;
  assert.equal(pp.identites.P1, 'UN (fictif) X');
  assert.equal(pp.synthese[0].valeur, '3');
  assert.deepEqual(p.entete.ordre, ['patient', 'dernierEntretien', 'c:vig']);
  // Reconstitution : parts et annotations réunies par l'identifiant de l'instantané
  const st = V.reduire([{ id: 'e1', at: '2026-11-09T10:00:00Z', by: 'u', type: 'INSTANTANE_PART', data: pp }, { id: 'e2', at: '2026-11-09T10:00:01Z', by: 'u', type: 'INSTANTANE', data: p.entete },
    { id: 'e3', at: '2026-11-09T11:00:00Z', by: 'u', type: 'INSTANTANE_NOTE', data: { instantane: 'I1', texte: 'Annotation (fictive)' } }]);
  const i = V.instantanes(st, 'staff')[0];
  assert.deepEqual(Object.keys(i.parts), ['patients']);
  assert.equal(i.notes.length, 1);
});

test('Vue des médecins et de l’équipe : lignes, colonnes du Suivi médical et de l’Agenda, membres des groupes sans compte', () => {
  const c2 = Object.assign({}, ctx, { comptes: [{ id: 'u-ide', nom: 'IDE (fictif)', roles: ['IDE'], services: ['U1'], actif: true }],
    config: Object.assign({}, config, { groupes: [{ code: 'jour', libelle: 'Équipe de jour', services: ['U1'], membres: [{ id: 'u-ide', nom: 'IDE (fictif)' }, { id: 'demo-a', nom: 'Agent A (fictif)' }] }] }) });
  const vm = V.normaliser({ id: 'm', nom: 'Médecins', lignes: 'medecins', colonnes: ['nom', 'initiales', 'patients1'] });
  const lm = V.lignes(vm, c2), catm = V.catalogue('medecins', c2);
  assert.deepEqual(lm.map((l) => l.id), ['m-alpha']);
  assert.equal(V.cellule(V.colonneDe(catm, 'patients1'), lm[0], c2).lib, '1');
  const va = V.normaliser({ id: 'a', nom: 'Équipe', lignes: 'agents', colonnes: ['nom', 'groupes'] });
  const la = V.lignes(va, c2), cata = V.catalogue('agents', c2);
  assert.deepEqual(la.map((l) => l.id), ['demo-a', 'u-ide']);
  assert.equal(V.cellule(V.colonneDe(cata, 'groupes'), la[1], c2).lib, 'Équipe de jour');
});

test('Instantanés : durée de conservation réglée par l’établissement', () => {
  const i = { entete: { le: '2025-01-15T10:00:00Z' } };
  assert.equal(V.conservationMois({}), 0);
  assert.ok(!V.auDelaConservation({}, i, maintenant), 'sans limite par défaut');
  assert.ok(V.auDelaConservation({ vuesEnsemble: { conservationMois: 12 } }, i, maintenant));
  assert.ok(!V.auDelaConservation({ vuesEnsemble: { conservationMois: 24 } }, i, maintenant));
});

test('Largeur des colonnes : réglée en pixels (40 à 800), automatique sinon, gardée dans l’instantané', () => {
  const v = V.normaliser({ id: 'l', nom: 'L', services: ['U1'], colonnes: [{ code: 'patient', largeur: 180 }, { code: 'chambre', largeur: 5 }, { code: 'mode', largeur: '120' }] });
  assert.deepEqual(v.colonnes.map((c) => c.largeur), [180, 0, 120]);
  const cat = V.catalogue('patients', ctx), cols = v.colonnes.map((c) => ({ col: V.colonneDe(cat, c.code), vcol: c }));
  const p = V.preparerInstantane(v, V.ranger(v, V.lignes(v, ctx), cat, ctx, cols.map((x) => x.col)), cols, ctx, 'I9');
  assert.deepEqual(p.entete.largeurs, { patient: 180, mode: 120 });
});
