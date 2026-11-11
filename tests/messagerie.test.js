// SPDX-License-Identifier: EUPL-1.2
// Module Messagerie (0.23.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
SIC.groupes = require('../app/js/groupes.js');
const MS = require('../app/js/module-messagerie.js');

let n = 0;
const ev = (by, type, data, jour) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, jour || 1, 8, n)).toISOString(), by, type, data });
const config = { groupes: [
  { code: 'nuit-u1', libelle: 'Équipe de nuit', services: ['U1'], membres: [{ id: 'as1', nom: 'AS 1 (fictif)' }, { id: 'ancien', nom: 'Agent parti (fictif)' }] },
  { code: 'qualite', libelle: 'Groupe qualité', services: ['U1', 'U2'], membres: [{ id: 'ide2', nom: 'IDE 2 (fictif)' }] }] };
const cadre = { id: 'cadre', roles: ['CADRE'], services: ['U1'] };
const ide1 = { id: 'ide1', roles: ['IDE'], services: ['U1'] };
const ide2 = { id: 'ide2', roles: ['IDE'], services: ['U2'] };
const as1 = { id: 'as1', roles: ['AS'], services: ['U1'] };
const comptes = [cadre, ide1, ide2, as1];
const gr = (c) => SIC.groupes.de(config, c.id);
const message = (plus, by, jour) => ev(by || 'cadre', 'MESSAGE', Object.assign({ id: 'M1', objet: 'Clés de la pharmacie (fictif)', texte: 'Nouvelle procédure (fictif)', nom: 'Cadre (fictif)',
  destinataires: [{ genre: 'service', code: 'U1' }], services: ['U1'], important: false, accuse: 'auto', reponses: 'auteur', jusquau: '2026-12-01', rattaches: [], pieces: [] }, plus || {}), jour);
const NOV = (j) => Date.UTC(2026, 10, j, 12);

test('Destinataires : service, rôle dans un service, groupe (appartenance à la lecture), agent, établissement', () => {
  const m = (d) => ({ destinataires: d });
  assert.equal(MS.estDestinataire(m([{ genre: 'service', code: 'U1' }]), ide1, []), true);
  assert.equal(MS.estDestinataire(m([{ genre: 'service', code: 'U1' }]), ide2, []), false);
  assert.equal(MS.estDestinataire(m([{ genre: 'role', code: 'AS', service: 'U1' }]), as1, []), true);
  assert.equal(MS.estDestinataire(m([{ genre: 'role', code: 'AS', service: 'U1' }]), ide1, []), false);
  assert.equal(MS.estDestinataire(m([{ genre: 'groupe', code: 'qualite' }]), ide2, gr(ide2)), true);
  assert.equal(MS.estDestinataire(m([{ genre: 'agent', code: 'ide2' }]), ide2, []), true);
  assert.equal(MS.estDestinataire(m([{ genre: 'etablissement' }]), ide2, []), true);
  assert.deepEqual(MS.servicesDe([{ genre: 'groupe', code: 'qualite' }, { genre: 'role', code: 'AS', service: 'U1' }], config).sort(), ['U1', 'U2']);
});

test('Contrôle des destinataires : un agent écrit à ses services, ses groupes, un seul service ; plusieurs services et l’établissement au cadre', () => {
  const ctl = (compte, dest) => () => MS.controlerDestinataires(dest, Object.assign({ groupes: gr(compte) }, compte), config);
  assert.doesNotThrow(ctl(ide1, [{ genre: 'service', code: 'U1' }, { genre: 'agent', code: 'ide2' }]));
  assert.throws(ctl(ide1, [{ genre: 'service', code: 'U2' }]), /vos services/);
  assert.throws(ctl(ide1, [{ genre: 'etablissement' }]), /cadre/);
  assert.doesNotThrow(ctl(ide2, [{ genre: 'groupe', code: 'qualite' }]));   // membre du groupe
  assert.doesNotThrow(ctl(ide1, [{ genre: 'groupe', code: 'nuit-u1' }]));   // groupe de son service
  assert.throws(ctl(ide2, [{ genre: 'groupe', code: 'nuit-u1' }]), /vos groupes/);
  assert.throws(ctl(ide1, []), /au moins un/);
  const cadre2 = { id: 'c2', roles: ['CADRE'], services: ['U1'] };
  assert.doesNotThrow(ctl(cadre2, [{ genre: 'service', code: 'U1' }, { genre: 'service', code: 'U2' }, { genre: 'etablissement' }]));
});

test('Lecture, confirmation « J’ai lu », message important en tête, relance, suivi des lectures', () => {
  const evts = [message({ important: true, accuse: 'confirmer', destinataires: [{ genre: 'service', code: 'U1' }, { genre: 'groupe', code: 'nuit-u1' }] })];
  let st = MS.reduire(evts);
  let r = MS.liste(st, ide1, gr(ide1), config, NOV(2), 'recus');
  assert.deepEqual([r.length, r[0].situation.enTete, r[0].situation.aConfirmer, r[0].situation.nonLu], [1, true, true, true]);
  // Ouvert sans confirmer : reste en tête
  evts.push(ev('ide1', 'MESSAGE_LU', { message: 'M1' }, 2));
  st = MS.reduire(evts);
  r = MS.liste(st, ide1, gr(ide1), config, NOV(2), 'recus');
  assert.deepEqual([r[0].situation.lu, r[0].situation.enTete], [true, true]);
  evts.push(ev('ide1', 'MESSAGE_LU', { message: 'M1', confirme: true }, 2));
  st = MS.reduire(evts);
  r = MS.liste(st, ide1, gr(ide1), config, NOV(2), 'recus');
  assert.deepEqual([r[0].situation.confirme, r[0].situation.enTete, r[0].situation.aConfirmer], [true, false, false]);
  const s = MS.suiviLectures(st.messages.M1, comptes, config);
  assert.deepEqual([s.confirmes.map(c => c.id), s.ouverts.length, s.nonOuverts.map(c => c.id), s.sansCompte.map(c => c.id)], [['ide1'], 0, ['as1'], ['ancien']]);
  // Relance : l'AS qui n'a pas lu voit le message relancé en tête
  evts.push(ev('cadre', 'MESSAGE_RELANCE', { message: 'M1' }, 3));
  st = MS.reduire(evts);
  assert.equal(MS.liste(st, as1, gr(as1), config, NOV(3), 'recus')[0].situation.relance, true);
  assert.equal(MS.liste(st, ide1, gr(ide1), config, NOV(3), 'recus')[0].situation.relance, false);
  assert.equal(MS.enAttente(st, as1, gr(as1), config, NOV(3)), 1);
});

test('Affichage jusqu’à une date, archives, retrait, conservation de 12 mois', () => {
  const evts = [message({ jusquau: '2026-11-05' }), message({ id: 'M2', important: true, jusquau: '2026-11-05' })];
  let st = MS.reduire(evts);
  // Après la date : le message ordinaire passe aux archives ; l'important non lu reste affiché
  assert.deepEqual(MS.liste(st, ide1, gr(ide1), config, NOV(10), 'recus').map(m => m.id), ['M2']);
  assert.deepEqual(MS.liste(st, ide1, gr(ide1), config, NOV(10), 'archives').map(m => m.id), ['M1']);
  evts.push(ev('ide1', 'MESSAGE_LU', { message: 'M2' }, 6), ev('as1', 'MESSAGE_ARCHIVE', { message: 'M2' }, 2));
  st = MS.reduire(evts);
  assert.deepEqual(MS.liste(st, ide1, gr(ide1), config, NOV(10), 'recus').map(m => m.id), []);
  assert.deepEqual(MS.liste(st, as1, gr(as1), config, NOV(3), 'recus').map(m => m.id), ['M1']);
  evts.push(ev('cadre', 'MESSAGE_RETRAIT', { message: 'M1', motif: 'Erreur de date (fictif)' }, 3));
  st = MS.reduire(evts);
  assert.deepEqual(MS.liste(st, as1, gr(as1), config, NOV(3), 'recus').map(m => m.id), []);
  assert.equal(MS.liste(st, cadre, gr(cadre), config, NOV(3), 'envoyes').filter(m => m.retire).length, 1);
  assert.throws(() => MS.controler('MESSAGE_REPONSE', { message: 'M1', texte: 'ok' }, { etat: st, compte: Object.assign({ groupes: [] }, ide1), config }), /retiré/);
  assert.throws(() => MS.controler('MESSAGE_RETRAIT', { message: 'M2' }, { etat: st, compte: Object.assign({ groupes: [] }, ide1), config }), /auteur/);
  // 12 mois plus tard : plus affiché nulle part
  assert.equal(MS.liste(st, cadre, gr(cadre), config, Date.UTC(2027, 11, 2), 'envoyes').length, 0);
});

test('Réponses : à l’auteur seulement, à tous, aucune ; nouvelles réponses pour l’auteur ; recherche', () => {
  const evts = [message(), ev('ide1', 'MESSAGE_REPONSE', { message: 'M1', id: 'R1', texte: 'Bien noté (fictif)', nom: 'IDE 1' }, 2), ev('as1', 'MESSAGE_REPONSE', { message: 'M1', id: 'R2', texte: 'Où est la boîte ? (fictif)', nom: 'AS 1' }, 2)];
  let st = MS.reduire(evts), m = st.messages.M1;
  assert.deepEqual([MS.reponsesVisibles(m, cadre).length, MS.reponsesVisibles(m, ide1).map(r => r.id)], [2, ['R1']]);
  // L'auteur qui répond : visible par tous les destinataires
  const stA = MS.reduire(evts.concat([ev('cadre', 'MESSAGE_REPONSE', { message: 'M1', id: 'R3', texte: 'Au poste de soins (fictif)' }, 2)]));
  assert.deepEqual(MS.reponsesVisibles(stA.messages.M1, ide1).map(r => r.id), ['R1', 'R3']);
  assert.equal(MS.liste(st, cadre, gr(cadre), config, NOV(3), 'envoyes')[0].situation.nouvellesReponses, 2);
  assert.equal(MS.enAttente(st, cadre, gr(cadre), config, NOV(3)), 1);
  evts.push(ev('cadre', 'MESSAGE_LU', { message: 'M1' }, 3));
  st = MS.reduire(evts);
  assert.equal(MS.liste(st, cadre, gr(cadre), config, NOV(3), 'envoyes')[0].situation.nouvellesReponses, 0);
  // Recherche : l'IDE ne trouve pas le texte de la réponse de l'AS, qui ne lui est pas visible
  assert.equal(MS.liste(st, ide1, gr(ide1), config, NOV(3), 'recus', { recherche: 'boîte' }).length, 0);
  assert.equal(MS.liste(st, as1, gr(as1), config, NOV(3), 'recus', { recherche: 'boîte' }).length, 1);
  const st2 = MS.reduire([message({ reponses: 'tous' }), evts[1], evts[2]]);
  assert.equal(MS.reponsesVisibles(st2.messages.M1, ide1).length, 2);
  const st3 = MS.reduire([message({ reponses: 'aucune' })]);
  assert.throws(() => MS.controler('MESSAGE_REPONSE', { message: 'M1', texte: 'ok' }, { etat: st3, compte: Object.assign({ groupes: [] }, ide1), config }), /pas de réponse/);
  // Un agent qui n'est pas destinataire ne répond pas
  assert.throws(() => MS.controler('MESSAGE_REPONSE', { message: 'M1', texte: 'ok' }, { etat: st, compte: Object.assign({ groupes: [] }, ide2), config }), /pas adressé/);
});

test('Pièces jointes : désactivées par défaut, types et taille réglés par l’établissement ; éléments rattachés', () => {
  const d = (plus) => Object.assign({ id: 'MX', objet: 'Objet', texte: 'Texte', destinataires: [{ genre: 'service', code: 'U1' }], services: ['U1'] }, plus);
  const ctl = (data, cfg) => () => MS.controler('MESSAGE', data, { etat: { messages: {} }, compte: Object.assign({ groupes: [] }, ide1), config: cfg || config });
  const pj = { id: 'PJ0123456789abcdef', nom: 'procedure.pdf', taille: 2048 };
  assert.equal(MS.options({}).piecesJointes, false);
  assert.throws(ctl(d({ pieces: [pj] })), /pas activées/);
  const cfg = Object.assign({ messagerie: { '*': { piecesJointes: true, tailleMaxMo: 1 } } }, config);
  assert.doesNotThrow(ctl(d({ pieces: [pj] }), cfg));
  assert.throws(ctl(d({ pieces: [Object.assign({}, pj, { nom: 'script.exe' })] }), cfg), /non autorisé/);
  assert.throws(ctl(d({ pieces: [Object.assign({}, pj, { taille: 3 * 1048576 })] }), cfg), /trop volumineux/);
  assert.equal(MS.affichable({ nom: 'photo.JPG' }), 'image/jpeg');
  assert.equal(MS.affichable({ nom: 'feuille.docx' }), null);
  assert.doesNotThrow(ctl(d({ rattaches: [{ module: 'agenda', genre: 'tache', id: 'TA001', service: 'U1' }] })));
  assert.throws(ctl(d({ rattaches: [{ module: 'isocont', genre: 'mesure', id: 'X' }] })), /mal formé/);
  const st = MS.reduire([message({ rattaches: [{ module: 'travaux', genre: 'demande', id: 'TR001', service: 'U1' }] })]);
  assert.equal(MS.messagesDe(st, ide1, [], 'travaux', 'TR001').length, 1);
  assert.equal(MS.messagesDe(st, ide2, [], 'travaux', 'TR001').length, 0);
});

test('Réglages : le cadre règle la durée d’affichage de ses services, l’établissement reste à l’administrateur', () => {
  const a = { '*': { piecesJointes: false }, U1: { affichageJours: 15 } };
  assert.equal(MS.options({ messagerie: a }, 'U1').affichageJours, 15);
  assert.equal(MS.options({ messagerie: a }, 'U2').affichageJours, 30);
  assert.equal(MS.controlerCadre(a, Object.assign({}, a, { U1: { affichageJours: 7 } }), cadre), true);
  assert.equal(MS.controlerCadre(a, Object.assign({}, a, { '*': { piecesJointes: true } }), cadre), false);
  assert.equal(MS.controlerCadre(a, Object.assign({}, a, { U2: { affichageJours: 7 } }), cadre), false);
  assert.equal(MS.controlerCadre(a, Object.assign({}, a, { U1: { piecesJointes: true } }), cadre), false);
  assert.deepEqual(MS.options({ messagerie: { '*': { informations: { travaux: true } } } }).informations, { agenda: false, vehicules: false, travaux: true, suivi: false });
});
