// SPDX-License-Identifier: EUPL-1.2
// Module Demandes de travaux (0.22.0). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
const T = require('../app/js/module-travaux.js');

let n = 0;
const ev = (by, type, data, jour) => ({ v: 1, id: 'e' + String(++n).padStart(5, '0'), at: new Date(Date.UTC(2026, 10, jour || 1, 8, n)).toISOString(), by, type, data });
const demande = (plus) => ev('ide1', 'TRAVAUX', Object.assign({ id: 'D1', service: 'U1', type: 'plomberie', lieu: 'chambre', chambre: '12', gravite: 'degradation', urgence: 'non', description: 'Fuite sous le lavabo (fictif)', nom: 'IDE 1 (fictif)' }, plus || {}));
const etape = (by, d, jour) => ev(by, 'TRAVAUX_ETAPE', Object.assign({ demande: 'D1', service: 'U1' }, d), jour);
const ctl = (evts, type, d) => () => T.controler(type, d, { etat: T.reduire(evts) });

test('Réglages : listes par défaut, service qui remplace l’établissement, numéro des services techniques', () => {
  const o = T.options({}, 'U1');
  assert.deepEqual([o.urgences.map(u => u.code), o.urgences[0].appel, o.delaiAffichage, o.chambreIndisponible, o.auteurSurBon, o.telephone], [['immediate', 'non'], true, 30, false, false, '']);
  assert.equal(o.types.length, 9);
  const cfg = { travaux: { '*': { telephone: '4444', delaiAffichage: 15 }, U2: { urgences: [{ code: 'jour', libelle: 'Dans la journée', appel: true }, { code: 'sem', libelle: 'Dans la semaine' }], telephone: '9999', chambreIndisponible: true } } };
  assert.deepEqual([T.options(cfg, 'U1').delaiAffichage, T.options(cfg, 'U2').urgences.map(u => u.code), T.options(cfg, 'U2').telephone, T.options(cfg, 'U2').chambreIndisponible], [15, ['jour', 'sem'], '4444', true]);
  // Le cadre règle ses services, jamais l'établissement
  const cadre = { roles: ['CADRE'], services: ['U2'] };
  assert.equal(T.controlerCadre(cfg.travaux, Object.assign({}, cfg.travaux, { U2: { delaiAffichage: 7 } }), cadre), true);
  assert.equal(T.controlerCadre(cfg.travaux, Object.assign({}, cfg.travaux, { '*': { telephone: '1' } }), cadre), false);
  assert.equal(T.controlerCadre(cfg.travaux, Object.assign({}, cfg.travaux, { U1: { delaiAffichage: 7 } }), cadre), false);
});

test('Suivi : étapes, confirmation par le cadre, réouverture, information de l’auteur', () => {
  const evts = [demande(), etape('sec1', { etape: 'transmise', reference: '' }), etape('sec1', { etape: 'programmee', date: '2026-11-20' }), etape('sec1', { etape: 'realisee' })];
  let st = T.reduire(evts), d = st.demandes.D1;
  assert.deepEqual([d.etat, d.datePrevue, d.etapes.length, st.avis.map(a => [a.agent, a.genre])], ['realisee', '2026-11-20', 3, [['ide1', 'realisee']]]);
  assert.ok(T.ouverte(d));   // réalisée : reste en cours jusqu'à la confirmation
  st = T.reduire(evts.concat([ev('cadre', 'TRAVAUX_CONFIRMATION', { demande: 'D1', service: 'U1' })]));
  assert.deepEqual([st.demandes.D1.etat, !!st.demandes.D1.traiteeLe, st.avis.length], ['confirmee', true, 2]);
  st = T.reduire(evts.concat([ev('cadre', 'TRAVAUX_CONFIRMATION', { demande: 'D1', service: 'U1' }), ev('cadre', 'TRAVAUX_CONFIRMATION', { demande: 'D1', rouvrir: true, motif: 'Fuite revenue', service: 'U1' })]));
  assert.deepEqual([st.demandes.D1.etat, st.demandes.D1.traiteeLe, st.avis[2].genre, st.avis[2].motif], ['rouverte', undefined, 'rouverte', 'Fuite revenue']);
  assert.equal(T.avisPour(st, 'ide1', [st.avis[0].id]).length, 2);
  // Pas d'information quand l'auteur fait lui-même l'étape
  assert.equal(T.reduire([demande(), etape('ide1', { etape: 'realisee' })]).avis.length, 0);
});

test('Contrôles : champs obligatoires, étapes permises, motifs, doublon, annulation par l’auteur', () => {
  assert.throws(ctl([], 'TRAVAUX', { id: 'D9', service: 'U1', type: 'plomberie', lieu: 'chambre', urgence: 'non', description: 'x' }), /numéro de la chambre/);
  assert.throws(ctl([], 'TRAVAUX', { id: 'D9', service: 'U1', type: 'plomberie', lieu: 'office', urgence: 'non', description: ' ' }), /Décrivez/);
  assert.doesNotThrow(ctl([], 'TRAVAUX', { id: 'D9', service: 'U1', type: 'plomberie', lieu: 'office', urgence: 'non', description: 'Robinet (fictif)' }));
  const base = [demande()];
  assert.throws(ctl(base, 'TRAVAUX_ETAPE', { demande: 'D1', etape: 'programmee' }), /date/);
  assert.throws(ctl(base, 'TRAVAUX_ETAPE', { demande: 'D1', etape: 'refusee', motif: 'x' }), /impossible/);   // pas encore transmise
  assert.throws(ctl(base, 'TRAVAUX_ETAPE', { demande: 'D1', etape: 'annulee' }), /motif/);
  assert.throws(ctl(base, 'TRAVAUX_CONFIRMATION', { demande: 'D1' }), /réalisée se confirme/);
  assert.throws(ctl(base, 'TRAVAUX_ETAPE', { demande: 'D1', etape: 'doublon', doublonDe: 'D1' }), /doublon/);
  const deux = base.concat([ev('as1', 'TRAVAUX', { id: 'D2', service: 'U1', type: 'plomberie', lieu: 'chambre', chambre: '12', urgence: 'non', description: 'Même fuite (fictif)' })]);
  assert.doesNotThrow(ctl(deux, 'TRAVAUX_ETAPE', { demande: 'D2', etape: 'doublon', doublonDe: 'D1' }));
  const fini = base.concat([etape('sec1', { etape: 'annulee', motif: 'Erreur' })]);
  assert.throws(ctl(fini, 'TRAVAUX', { id: 'D1', description: 'autre' }), /rouvrez/);
  assert.throws(ctl(fini, 'TRAVAUX_CONFIRMATION', { demande: 'D1', rouvrir: true, motif: 'x' }), /réalisée, confirmée ou refusée/);
  // L'auteur annule sa propre demande sans l'accès « suivre »
  const permis = T.contrat.saisies.permisPourSoi;
  assert.ok(permis('TRAVAUX_ETAPE', { demande: 'D1', etape: 'annulee' }, { id: 'ide1' }, { etat: T.reduire(base) }));
  assert.ok(!permis('TRAVAUX_ETAPE', { demande: 'D1', etape: 'annulee' }, { id: 'as9' }, { etat: T.reduire(base) }));
  assert.ok(!permis('TRAVAUX_ETAPE', { demande: 'D1', etape: 'realisee' }, { id: 'ide1' }, { etat: T.reduire(base) }));
  // Droits proposés : tous signalent, secrétaire et cadre suivent, le cadre confirme
  const D = T.droits;
  assert.ok(D.peut(['AS'], 'TRAVAUX', {}) && !D.peut(['AS'], 'TRAVAUX_ETAPE', {}) && D.peut(['SECRETAIRE'], 'TRAVAUX_ETAPE', {}) && !D.peut(['SECRETAIRE'], 'TRAVAUX_CONFIRMATION', {}) && D.peut(['CADRE'], 'TRAVAUX_CONFIRMATION', {}));
});

test('Liste : récentes d’abord, traitées en grisé pendant le délai puis dans l’historique, filtres, urgentes', () => {
  const evts = [demande(), ev('as1', 'TRAVAUX', { id: 'D2', service: 'U1', type: 'electricite', lieu: 'office', urgence: 'immediate', description: 'Prise arrachée (fictif)' }, 3),
    ev('as1', 'TRAVAUX', { id: 'D3', service: 'U2', type: 'electricite', lieu: 'office', urgence: 'non', description: 'Ampoule (fictif)' }, 4),
    etape('sec1', { etape: 'annulee', motif: 'Réparé par l’équipe' }, 2)];
  const st = T.reduire(evts), cfg = { travaux: { '*': { delaiAffichage: 30 } } };
  const t = Date.UTC(2026, 10, 10);
  let l = T.demandes(st, cfg, ['U1'], t);
  assert.deepEqual(l.map(x => [x.id, x.traitee, x.urgente]), [['D2', false, true], ['D1', true, false]]);
  assert.deepEqual(T.demandes(st, cfg, ['U1'], Date.UTC(2026, 11, 15)).map(x => x.id), ['D2']);   // délai écoulé
  assert.deepEqual(T.demandes(st, cfg, ['U1'], Date.UTC(2026, 11, 15), { historique: true }).map(x => x.id), ['D2', 'D1']);
  assert.deepEqual(T.demandes(st, cfg, ['U1', 'U2'], t, { filtre: { type: 'electricite', etat: 'ouvertes' } }).map(x => x.id), ['D3', 'D2']);
  assert.deepEqual(T.urgentes(st, cfg, ['U1', 'U2']).map(x => x.id), ['D2']);
  assert.equal(T.libLieu(st.demandes.D1, cfg), 'Chambre 12');
});

test('Chambre indisponible (option) et interventions programmées : lues par les autres modules', () => {
  const evts = [demande({ chambreIndisponible: true, lits: 2 }), etape('sec1', { etape: 'programmee', date: '2026-11-20' })];
  const st = T.reduire(evts);
  assert.deepEqual(T.chambresIndisponibles(st, ['U1'], {}), []);   // option désactivée par défaut
  const cfg = { travaux: { U1: { chambreIndisponible: true } } };
  assert.deepEqual(T.chambresIndisponibles(st, ['U1'], cfg), [{ service: 'U1', chambre: '12', lits: 2, demande: 'D1', type: 'plomberie' }]);
  assert.deepEqual(SIC.modules.lire('travaux.chambres', st, { services: ['U1'], config: cfg }).length, 1);
  assert.deepEqual(T.interventions(st, ['U1'], '2026-11-16', '2026-11-22').map(x => x.jour), ['2026-11-20']);
  const fini = T.reduire(evts.concat([etape('sec1', { etape: 'realisee' }), ev('cadre', 'TRAVAUX_CONFIRMATION', { demande: 'D1', service: 'U1' })]));
  assert.deepEqual([T.chambresIndisponibles(fini, ['U1'], cfg).length, T.interventions(fini, ['U1'], '2026-11-16', '2026-11-22').length], [0, 0]);
});

test('Salle indisponible pendant les travaux (0.25.1) : case proposée par le réglage, désactivée par défaut', () => {
  const T = require('../app/js/module-travaux.js');
  const e = { v: 1, id: 'x1', at: '2026-11-10T08:00:00.000Z', by: 'a', type: 'TRAVAUX', data: { id: 'TRS', service: 'U1', type: 'electricite', lieu: 'salle', salle: 'SA-1', salleNom: 'Salon', salleIndisponible: true, gravite: 'gene', urgence: 'non', description: 'x' } };
  const st = T.reduire([e]);
  assert.deepEqual(T.sallesIndisponibles(st, {}), []);
  assert.deepEqual(T.sallesIndisponibles(st, { travaux: { U1: { salleIndisponible: true } } }).map((x) => x.salle), ['SA-1']);
  assert.equal(T.libLieu(st.demandes.TRS, {}), 'Salon');
  assert.throws(() => T.contrat.saisies.controler('TRAVAUX', { id: 'TRZ', service: 'U1', type: 'electricite', lieu: 'salle', gravite: 'gene', urgence: 'non', description: 'x' }, { etat: st, config: {} }), /salle/);
});

test('Salle fermée pendant des travaux (0.25.2) : jusqu’à la fin des travaux, ou jusqu’au jour indiqué', () => {
  const T = require('../app/js/module-travaux.js');
  const d = { id: 'TRJ', service: 'U1', type: 'electricite', lieu: 'salle', salle: 'SA-1', salleNom: 'Salon', salleIndisponible: true, gravite: 'gene', urgence: 'non', description: 'x' };
  const cfg = { travaux: { U1: { salleIndisponible: true } } };
  let st = T.reduire([{ v: 1, id: 'y1', at: '2026-11-10T08:00:00.000Z', by: 'a', type: 'TRAVAUX', data: d }]);
  assert.equal(T.sallesIndisponibles(st, cfg)[0].jusquau, '');
  st = T.reduire([{ v: 1, id: 'y1', at: '2026-11-10T08:00:00.000Z', by: 'a', type: 'TRAVAUX', data: Object.assign({}, d, { salleJusquau: '2026-11-20' }) }]);
  assert.equal(T.sallesIndisponibles(st, cfg)[0].jusquau, '2026-11-20');
  assert.throws(() => T.contrat.saisies.controler('TRAVAUX', Object.assign({}, d, { id: 'TRK', salleJusquau: '20/11' }), { etat: st, config: cfg }), /réouverture/);
});
