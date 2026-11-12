// SPDX-License-Identifier: EUPL-1.2
// Congés (0.44.0) : fériés, décompte, quotité, droits, soldes, tableaux, règles, validateurs, contrôles. Données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
globalThis.SIC = {};
SIC.noyauJournal = require('../app/js/noyau-journal.js'); SIC.model = require('../app/js/model.js'); SIC.modules = require('../app/js/modules.js');
const C = require('../app/js/module-conges.js');

let n = 0;
const ev = (type, data, by, at) => ({ id: 'e' + String(++n).padStart(4, '0'), at: at || new Date(Date.UTC(2026, 10, 12, 10, 0, n)).toISOString(), by: by || 'cadre', type, data });
const ide = { id: 'ide', nom: 'IDE (fictif)', roles: ['IDE'], services: ['U1'] };
const ide2 = { id: 'ide2', nom: 'IDE 2 (fictif)', roles: ['IDE'], services: ['U1'] };
const ide3 = { id: 'ide3', nom: 'IDE 3 (fictif)', roles: ['IDE'], services: ['U1'] };
const as = { id: 'as', nom: 'AS (fictif)', roles: ['AS'], services: ['U1'] };
const sec = { id: 'sec', nom: 'Secrétaire (fictif)', roles: ['SECRETAIRE'], services: ['U1'] };
const cadre = { id: 'cadre', nom: 'Cadre (fictif)', roles: ['CADRE'], services: ['U1'] };
const cadre2 = { id: 'cadre2', nom: 'Cadre U2 (fictif)', roles: ['CADRE'], services: ['U2'] };
const sup = { id: 'sup', nom: 'Cadre sup (fictif)', roles: ['CADRE', 'CADRE_SUP'], services: ['U1', 'U2'] };
const med = { id: 'med', nom: 'Médecin (fictif)', roles: ['MEDECIN'], services: ['U1'] };
const chef = { id: 'chef', nom: 'Chef (fictif)', roles: ['MEDECIN_CHEF_SERVICE'], services: ['U1'] };
const comptes = [ide, ide2, ide3, as, sec, cadre, cadre2, sup, med, chef];
const config = { conges: { regleFeries: { U1: { IDE: 'recuperer', AS: 'recuperer' } } } };

test('Jours fériés : 11 fériés nationaux (Pâques, Ascension, Pentecôte), fériés locaux', () => {
  assert.equal(C.paques(2027), '2027-03-28'); assert.equal(C.paques(2026), '2026-04-05');
  const f = C.feries(2027, {});
  assert.equal(f.length, 11); assert.ok(f.some((x) => x.date === '2027-05-06' && x.libelle === 'Ascension')); assert.ok(f.some((x) => x.date === '2027-05-17'));
  const l = C.feries(2027, { conges: { feries: { locaux: [{ date: '12-26', libelle: 'Saint-Étienne (fictif)' }, { date: '2026-06-01', libelle: 'Autre année' }] } } });
  assert.equal(l.length, 12); assert.ok(l.some((x) => x.date === '2027-12-26'));
});

test('Décompte : jours ouvrés, fériés exclus, demi-journées, temps partiel (pas de RTP pendant un congé)', () => {
  let st = C.reduire([]);
  const c = { agent: 'ide', type: 'CA', debut: '2026-12-21', fin: '2026-12-27' };   // lun. → dim., 25 déc. férié
  assert.equal(C.decompte(st, {}, c), 4);
  assert.equal(C.decompte(st, {}, Object.assign({}, c, { demiDebut: true })), 3.5);
  assert.equal(C.decompte(st, {}, { agent: 'ide', type: 'CA', debut: '2026-12-21', fin: '2026-12-21', demiDebut: true, demiFin: true }), 0.5);
  // 80 %, RTP habituel le mercredi : pendant un congé, aucune RTP n'est posée, le mercredi est décompté (12 novembre 2026)
  st = C.reduire([ev('QUOTITE', { agent: 'ide', depuis: '2026-01-01', quotite: 80, nonTravailles: [3], service: 'U1' })]);
  assert.equal(C.decompte(st, {}, c), 4);
  assert.equal(C.decompte(st, {}, { agent: 'ide', type: 'CA', debut: '2026-12-23', fin: '2026-12-23' }), 1);
  assert.equal(C.rtpHabituel(st, 'ide', '2026-12-23'), true); assert.equal(C.rtpHabituel(st, 'ide', '2026-12-22'), false);
});

test('Droits : proratisés selon la quotité, qui change en cours d’année ; saisie du cadre ; arrondi au demi-jour', () => {
  let st = C.reduire([]);
  assert.equal(C.droitsAnnee(st, {}, 'ide', 2027, ide).CA.droit, 25);
  st = C.reduire([ev('QUOTITE', { agent: 'ide', depuis: '2027-01-01', quotite: 80, nonTravailles: [3] })]);
  assert.equal(C.droitsAnnee(st, {}, 'ide', 2027, ide).CA.droit, 20); assert.equal(C.droitsAnnee(st, {}, 'ide', 2027, ide).RTT.droit, 12);
  // 100 % jusqu'au 30 juin, 50 % ensuite : quotité moyenne ≈ 74,8 % → 25 × 0,748 = 18,7 → 19
  st = C.reduire([ev('QUOTITE', { agent: 'ide', depuis: '2027-07-01', quotite: 50, nonTravailles: [3, 4, 5] })]);
  const d = C.droitsAnnee(st, {}, 'ide', 2027, ide);
  assert.equal(d.CA.droit, 19); assert.ok(d.CA.quotite > 74 && d.CA.quotite < 76);
  assert.equal(C.quotiteLe(st, 'ide', '2027-06-30').quotite, 100); assert.equal(C.quotiteLe(st, 'ide', '2027-07-01').quotite, 50);
  st = C.reduire([ev('DROITS_CONGES', { agent: 'ide', annee: 2027, droits: { CA: 22 } })]);
  assert.equal(C.droitsAnnee(st, {}, 'ide', 2027, ide).CA.droit, 22); assert.equal(C.droitsAnnee(st, {}, 'ide', 2027, ide).CA.calcule, 25);
  assert.equal(C.droitsAnnee(st, { conges: { arrondi: 1 } }, 'ide', 2027, ide).CA.saisi, 22);
});

test('Jours fériés dans les droits : posés d’office ou à récupérer selon le service et le rôle', () => {
  const st = C.reduire([]);
  assert.equal(C.modeFeries(config, 'U1', ['IDE']), 'recuperer'); assert.equal(C.modeFeries(config, 'U1', ['MEDECIN']), 'office'); assert.equal(C.modeFeries(config, 'HDJ', ['IDE']), 'office');
  // 2027 : 7 fériés en semaine (1er mai, 8 mai, 25 déc. un samedi ; 15 août un dimanche)
  const s1 = C.soldes(st, config, 'ide', 2027, { service: 'U1', roles: ['IDE'], aujourdhui: '2027-06-01' });
  assert.equal(s1.JF.mode, 'recuperer'); assert.equal(s1.JF.droit, 7); assert.equal(s1.JF.valide, 0); assert.equal(s1.JF.acquis, 4);
  const s2 = C.soldes(st, config, 'med', 2027, { service: 'U1', roles: ['MEDECIN'] });
  assert.equal(s2.JF.office, 7); assert.equal(s2.JF.reste, 0);
});

test('Soldes : validés, demandés, souhaits ; annulés et refusés non comptés', () => {
  const st = C.reduire([
    ev('CONGE', { id: 'c1', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-07-05', fin: '2027-07-09', statut: 'demande' }, 'ide'),
    ev('CONGE_DECISION', { conge: 'c1', decision: 'valide' }),
    ev('CONGE', { id: 'c2', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-08-02', fin: '2027-08-03', statut: 'demande' }, 'ide'),
    ev('CONGE', { id: 'c3', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-09-06', fin: '2027-09-06', statut: 'souhait' }, 'ide'),
    ev('CONGE', { id: 'c4', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-10-04', fin: '2027-10-08', statut: 'demande' }, 'ide'),
    ev('CONGE_DECISION', { conge: 'c4', decision: 'refuse', motif: 'Effectif (fictif)' })]);
  const s = C.soldes(st, {}, 'ide', 2027, { service: 'U1', roles: ['IDE'] }).CA;
  assert.deepEqual([s.droit, s.valide, s.demande, s.souhait, s.reste], [25, 5, 2, 1, 18]);
  assert.equal(st.conges.c1.statut, 'valide'); assert.equal(st.avis.length, 2);
  assert.equal(C.absences(st, new Date(2027, 6, 1).getTime(), new Date(2027, 7, 1).getTime()).length, 1);
});

test('Tableau : grille, comptes par rôle, règles non respectées, fériés posés d’office, RTP habituels', () => {
  const evts = [ev('TABLEAU_CONGES', { id: 't1', service: 'U1', nom: 'Fêtes (fictif)', debut: '2026-12-21', fin: '2027-01-03', regles: [{ pour: 'IDE', max: 2 }, { pour: '*', max: 4 }] }),
    ev('QUOTITE', { agent: 'ide3', depuis: '2026-01-01', quotite: 80, nonTravailles: [3] })];
  [['ide', 'valide'], ['ide2', 'demande'], ['ide3', 'demande'], ['as', 'souhait']].forEach((x, i) => evts.push(ev('CONGE', { id: 'g' + i, agent: x[0], service: 'U1', type: 'CA', debut: '2026-12-28', fin: '2026-12-31', statut: x[1] === 'souhait' ? 'souhait' : 'demande' }, x[0])));
  evts.push(ev('CONGE_DECISION', { conge: 'g0', decision: 'valide' }));
  const st = C.reduire(evts), t = st.tableaux.t1, g = C.grille(st, config, t, comptes, t.debut, t.fin, '2026-11-12');
  const i28 = g.jours.findIndex((j) => j.iso === '2026-12-28'), i30 = g.jours.findIndex((j) => j.iso === '2026-12-30'), i25 = g.jours.findIndex((j) => j.iso === '2026-12-25');
  assert.equal(g.comptes.IDE[i28], 3); assert.equal(g.comptes.IDE[i30], 3, 'RTP habituel du mercredi compris dans le congé : l’IDE à 80 % est en congé');
  assert.equal(g.comptes.souhaits[i28], 1);
  assert.ok(g.depassements.some((d) => d.regle.pour === 'IDE' && d.jours.indexOf('2026-12-28') >= 0 && d.jours.indexOf('2026-12-30') >= 0));
  assert.equal(g.jours[i25].ferie, 'Noël');
  const ls = g.agents.find((a) => a.compte.id === 'sec');
  assert.equal(ls.cases[i25].ferieOffice, true); assert.equal(g.agents.find((a) => a.compte.id === 'ide').cases[i25].ferieOffice, false);
  assert.ok(g.agents.find((a) => a.compte.id === 'ide3').cases[i30].nonTravaille);
  assert.ok(!g.agents.some((a) => a.compte.id === 'cadre2'), 'agents du service seulement');
});

test('Vérification d’une demande : période bloquée, à éviter, hors délai, règle du tableau, solde après', () => {
  const st = C.reduire([ev('PERIODE_CONGES', { id: 'p1', service: 'U1', libelle: 'Certification (fictif)', debut: '2027-06-07', fin: '2027-06-11', effet: 'bloquee' }),
    ev('PERIODE_CONGES', { id: 'p2', service: '*', libelle: 'Formation (fictif)', debut: '2027-06-14', fin: '2027-06-18', effet: 'eviter' }, 'admin'),
    ev('TABLEAU_CONGES', { id: 't1', service: 'U1', nom: 'Été (fictif)', debut: '2027-06-01', fin: '2027-08-31', regles: [{ pour: 'IDE', max: 1, bloquante: false }] }),
    ev('CONGE', { id: 'x', agent: 'ide2', service: 'U1', type: 'CA', debut: '2027-06-14', fin: '2027-06-18', statut: 'demande' }, 'ide2')]);
  const v = C.verifier(st, {}, { id: 'n', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-06-10', fin: '2027-06-15' }, { comptes, aujourdhui: '2027-05-20' });
  assert.equal(v.jours, 4); assert.equal(v.bloquees.length, 1); assert.equal(v.eviter.length, 1); assert.equal(v.horsDelai, true);
  assert.equal(v.regles.length, 1); assert.deepEqual(v.regles[0].jours, ['2027-06-14', '2027-06-15']); assert.equal(v.soldeApres, 21);
  assert.equal(C.verifier(st, {}, { id: 'n', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-07-05', fin: '2027-07-06' }, { comptes, aujourdhui: '2027-01-02' }).horsDelai, false);
});

test('Validateur selon le rôle : cadre pour IDE, AS, secrétaire ; cadre supérieur pour le cadre ; médecin chef ; même service', () => {
  assert.equal(C.roleValidateur({}, ['IDE']), 'CADRE'); assert.equal(C.roleValidateur({}, ['CADRE', 'CADRE_SUP']), 'DIRECTEUR_SOINS'); assert.equal(C.roleValidateur({}, ['MEDECIN']), 'MEDECIN_CHEF_SERVICE');
  assert.equal(C.valide({}, cadre, ide), true); assert.equal(C.valide({}, cadre2, ide), false, 'autre service');
  assert.equal(C.valide({}, cadre, cadre), false, 'jamais soi-même'); assert.equal(C.valide({}, sup, cadre), true); assert.equal(C.valide({}, cadre, cadre2), false);
  assert.equal(C.valide({}, chef, med), true); assert.equal(C.valide({}, cadre, med), false);
  assert.deepEqual(C.validateurs({}, comptes, ide).map((c) => c.id), ['cadre', 'sup']);
  assert.equal(C.valide({ conges: { validateurs: { IDE: 'CADRE_SUP' } } }, cadre, ide), false);
});

test('Contrôles : dates, type, souhaits désactivés, période bloquée, règle bloquante, décision, annulation', () => {
  let st = C.reduire([ev('PERIODE_CONGES', { id: 'p1', service: 'U1', libelle: 'Bloquée (fictif)', debut: '2027-06-07', fin: '2027-06-11', effet: 'bloquee' }),
    ev('TABLEAU_CONGES', { id: 't1', service: 'U1', nom: 'Été (fictif)', debut: '2027-06-01', fin: '2027-08-31', regles: [{ pour: 'IDE', max: 1, bloquante: true }] }),
    ev('CONGE', { id: 'x', agent: 'ide2', service: 'U1', type: 'CA', debut: '2027-07-05', fin: '2027-07-09', statut: 'demande' }, 'ide2')]);
  const ctx = (compte, cfg) => ({ etat: st, config: cfg || {}, compte, comptes, aujourdhui: '2026-11-12' });
  const base = { id: 'n1', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-06-21', fin: '2027-06-25', statut: 'demande' };
  assert.doesNotThrow(() => C.controler('CONGE', base, ctx(ide)));
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { fin: '2027-06-01' }), ctx(ide)), /avant/);
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { type: 'XX' }), ctx(ide)), /type/);
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { statut: 'souhait' }), ctx(ide, { conges: { souhaits: false } })), /souhaits/);
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { debut: '2027-06-09', fin: '2027-06-10' }), ctx(ide)), /bloquée/);
  assert.doesNotThrow(() => C.controler('CONGE', Object.assign({}, base, { debut: '2027-06-09', fin: '2027-06-10' }), ctx(cadre)), 'le validateur saisit sur une période bloquée');
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { debut: '2027-07-06', fin: '2027-07-07' }), ctx(ide)), /bloquante/);
  assert.doesNotThrow(() => C.controler('CONGE', Object.assign({}, base, { debut: '2027-07-06', fin: '2027-07-07', statut: 'souhait' }), ctx(ide)), 'souhait : règle signalée seulement');
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { agent: 'ide2' }), ctx(ide)), /valide/);
  assert.throws(() => C.controler('CONGE', Object.assign({}, base, { debut: '2027-06-26', fin: '2027-06-27' }), ctx(ide)), /Aucun jour/);
  assert.throws(() => C.controler('CONGE_DECISION', { conge: 'x', decision: 'refuse' }, ctx(cadre)), /motif/);
  assert.throws(() => C.controler('CONGE_DECISION', { conge: 'x', decision: 'valide' }, ctx(cadre2)), /validateur/);
  assert.throws(() => C.controler('CONGE_DECISION', { conge: 'x', decision: 'valide' }, ctx(ide2)), /propres/);
  assert.doesNotThrow(() => C.controler('CONGE_DECISION', { conge: 'x', decision: 'valide' }, ctx(cadre)));
  assert.equal(C.permisPourSoi('CONGE_ANNULATION', { conge: 'x' }, ide2, { etat: st }), true);
  st = C.reduire(st._evts || []);
  const st2 = C.reduire([ev('CONGE', { id: 'y', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-07-05', fin: '2027-07-06', statut: 'demande' }, 'ide'), ev('CONGE_DECISION', { conge: 'y', decision: 'valide' })]);
  assert.throws(() => C.controler('CONGE_ANNULATION', { conge: 'y' }, { etat: st2, config: {}, compte: ide, comptes }), /validateur/);
  assert.throws(() => C.controler('CONGE', { id: 'y', fin: '2027-07-07' }, { etat: st2, config: {}, compte: ide, comptes }), /ne se modifie plus/);
  assert.throws(() => C.controler('CONGE_ANNULATION', { conge: 'y' }, { etat: st2, config: {}, compte: cadre, comptes }), /motif/);
  assert.throws(() => C.controler('QUOTITE', { agent: 'ide', depuis: '2027-01-01', quotite: 80 }, { etat: st2, config: {}, compte: ide, comptes }), /cadre/);
  assert.doesNotThrow(() => C.controler('QUOTITE', { agent: 'ide', depuis: '2027-01-01', quotite: 80, nonTravailles: [3] }, { etat: st2, config: {}, compte: cadre, comptes }));
  assert.throws(() => C.controler('PERIODE_CONGES', { id: 'p9', service: '*', libelle: 'x', debut: '2027-01-01', fin: '2027-01-02', effet: 'info' }, { etat: st2, config: {}, compte: cadre, comptes }), /administrateur/);
});

test('Réglages : types ajoutés, validateurs, couleurs, message d’avertissement ; le cadre règle les fériés de ses services', () => {
  const o = C.options({ conges: { types: [{ code: 'CA', libelle: 'Congés annuels', droit: 27 }, { code: 'CET', libelle: 'Compte épargne-temps', droit: null }], alerte: { active: true } } });
  assert.deepEqual(o.types.map((t) => t.code), ['CA', 'CET', 'JF']); assert.equal(o.types[0].droit, 27);
  assert.equal(o.alerte.active, true); assert.match(o.alerte.texte, /seul le logiciel de gestion du temps/);
  assert.equal(C.options({}).alerte.active, false); assert.equal(C.options({}).souhaits, true);
  const a = { regleFeries: { U1: { IDE: 'recuperer' } } };
  assert.equal(C.controlerCadre(a, { regleFeries: { U1: { IDE: 'office' } } }, cadre), true);
  assert.equal(C.controlerCadre(a, { regleFeries: { U1: { IDE: 'recuperer' }, U2: { IDE: 'office' } } }, cadre), false);
  assert.equal(C.controlerCadre(a, Object.assign({}, a, { delaiMois: 2 }), cadre), false);
});

test('Date limite de dépôt (0.44.1) : demande tardive non prioritaire, non comptée, à valider en dernier ; contrôle ; temps partiel masqué par défaut', () => {
  const p = ev('PERIODE_CONGES', { id: 'pe', service: 'U1', libelle: 'Congés d’été (fictif)', debut: '2027-07-01', fin: '2027-08-31', effet: 'limite', limite: '2027-03-31' });
  const t = ev('TABLEAU_CONGES', { id: 't1', service: 'U1', nom: 'Été (fictif)', debut: '2027-07-01', fin: '2027-08-31', regles: [{ pour: 'IDE', max: 1 }] });
  const st = C.reduire([p, t,
    ev('CONGE', { id: 'a', agent: 'ide', service: 'U1', type: 'CA', debut: '2027-07-12', fin: '2027-07-16', statut: 'demande' }, 'ide', '2027-03-20T08:00:00.000Z'),
    ev('CONGE', { id: 'b', agent: 'ide2', service: 'U1', type: 'CA', debut: '2027-07-12', fin: '2027-07-16', statut: 'demande' }, 'ide2', '2027-04-02T08:00:00.000Z'),
    ev('CONGE', { id: 'c', agent: 'ide3', service: 'U1', type: 'CA', debut: '2027-09-06', fin: '2027-09-07', statut: 'demande' }, 'ide3', '2027-04-02T08:00:01.000Z')]);
  assert.equal(st.conges.a.tardive, null); assert.equal(st.conges.b.tardive.limite, '2027-03-31'); assert.equal(st.conges.c.tardive, null, 'hors de la période');
  assert.equal(C.limiteDepassee(st, st.conges.a, '2027-03-31'), null, 'la date limite est incluse');
  const g = C.grille(st, config, st.tableaux.t1, comptes, '2027-07-01', '2027-08-31', '2027-04-02'), i = g.jours.findIndex((j) => j.iso === '2027-07-12');
  assert.equal(g.comptes.IDE[i], 1, 'la demande tardive n’est pas comptée'); assert.equal(g.comptes.tardives[i], 1); assert.equal(g.comptes.nonPrioritaires.IDE[i], 1, 'non prioritaires comptées à part, par rôle'); assert.equal(g.depassements.length, 0);
  const l = C.aValider(st, {}, comptes, cadre); assert.deepEqual(l.map((c) => c.id).slice(-1), ['b'], 'non prioritaire en dernier');
  const v = C.verifier(st, {}, { id: 'n', agent: 'as', service: 'U1', type: 'CA', debut: '2027-08-02', fin: '2027-08-03' }, { comptes, aujourdhui: '2027-04-10' });
  assert.equal(v.tardive.id, 'pe');
  const v2 = C.verifier(st, {}, { id: 'n', agent: 'as', service: 'U1', type: 'CA', debut: '2027-08-02', fin: '2027-08-03' }, { comptes, aujourdhui: '2027-02-10' });
  assert.equal(v2.tardive, null); assert.equal(v2.limites[0].limite, '2027-03-31');
  const ctx = { etat: C.reduire([]), config: {}, compte: cadre, comptes, aujourdhui: '2026-11-12' };
  assert.throws(() => C.controler('PERIODE_CONGES', { id: 'q', service: 'U1', libelle: 'Été (fictif)', debut: '2027-07-01', fin: '2027-08-31', effet: 'limite' }, ctx), /date limite/);
  assert.throws(() => C.controler('PERIODE_CONGES', { id: 'q', service: 'U1', libelle: 'Été (fictif)', debut: '2027-07-01', fin: '2027-08-31', effet: 'limite', limite: '2027-07-15' }, ctx), /date limite/);
  assert.doesNotThrow(() => C.controler('PERIODE_CONGES', { id: 'q', service: 'U1', libelle: 'Été (fictif)', debut: '2027-07-01', fin: '2027-08-31', effet: 'limite', limite: '2027-03-31' }, ctx));
  assert.equal(C.options({}).afficherTempsPartiel, false); assert.equal(C.options({ conges: { afficherTempsPartiel: true } }).afficherTempsPartiel, true);
});
