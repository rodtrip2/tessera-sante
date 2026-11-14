// SPDX-License-Identifier: EUPL-1.2
// Échanges d'agenda par fichier .ics et messageries du service sans connexion (lot A, 14 novembre 2026) ; npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
const I = require('../app/js/ics.js');
const Mx = require('../app/js/messageries.js');

const L = (a, mo, j, hh, mi) => new Date(a, mo - 1, j, hh || 0, mi || 0).getTime();

test('Export : UID stable, horaires UTC, journée entière, échappement, annulés', () => {
  const t = I.ecrire([
    { cle: 'agenda-R1-2026-11-17', debut: L(2026, 11, 17, 10), fin: L(2026, 11, 17, 11), titre: 'Réunion; synthèse, équipe', lieu: 'Salle 2' },
    { cle: 'absence-A1', debut: L(2026, 11, 20), fin: L(2026, 11, 22), journee: true, titre: 'Absence' }
  ], { nom: 'Tessera (fictif)', maintenant: L(2026, 11, 14, 9), annules: [{ cle: 'agenda-R0-2026-11-18', debut: L(2026, 11, 18, 14), fin: L(2026, 11, 18, 15), titre: 'Entretien' }] });
  assert.match(t, /^BEGIN:VCALENDAR\r\n/);
  assert.match(t, /UID:tessera-agenda-R1-2026-11-17@tessera-sante/);
  assert.ok(t.includes('SUMMARY:Réunion\\; synthèse\\, équipe'));
  assert.match(t, /DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261122/);
  assert.match(t, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(t, /SUMMARY:Annulé : Entretien\r\nSTATUS:CANCELLED|STATUS:CANCELLED/);
  assert.equal((t.match(/BEGIN:VEVENT/g) || []).length, 3);
  // Relu tel quel (l'annulé n'est pas repris)
  const lu = I.lire(t, L(2026, 11, 1), L(2026, 12, 1));
  assert.equal(lu.length, 2);
  assert.equal(lu[0].objet, 'Réunion; synthèse, équipe');
  assert.equal(lu[0].debut, L(2026, 11, 17, 10));
  assert.equal(lu[1].journee, true);
});

test('Comparaison avec le dernier export : retirés dans la période annulés, mémoire gardée', () => {
  const prec = { a: { debut: L(2026, 11, 17, 10), fin: L(2026, 11, 17, 11), titre: 'Réunion' }, b: { debut: L(2026, 11, 18, 10), fin: L(2026, 11, 18, 11), titre: 'Entretien' }, c: { debut: L(2027, 2, 1, 10), fin: L(2027, 2, 1, 11), titre: 'Plus tard' } };
  const r = I.comparer(prec, [{ cle: 'a', debut: L(2026, 11, 17, 10), fin: L(2026, 11, 17, 11), titre: 'Réunion' }], L(2026, 11, 16), L(2026, 11, 23));
  assert.deepEqual(r.annules.map(x => x.cle), ['b']);
  assert.ok(r.memoire.a && r.memoire.c && !r.memoire.b);
});

test('Import : lignes repliées, fuseau, durée, répétition hebdomadaire avec exception et occurrence modifiée', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VTIMEZONE', 'TZID:Romance Standard Time', 'BEGIN:STANDARD', 'DTSTART:16010101T030000', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', 'UID:x1', 'SUMMARY:Comité de pilotage qualité avec un objet très long qui dépasse soixante-quinze', '  caractères (fictif)',
    'DTSTART;TZID=Romance Standard Time:20261116T090000', 'DURATION:PT1H30M', 'LOCATION:Salle du conseil', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6',
    'EXDATE;TZID=Romance Standard Time:20261119T090000', 'DESCRIPTION:non repris', 'BEGIN:VALARM', 'SUMMARY:alarme', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x1', 'RECURRENCE-ID;TZID=Romance Standard Time:20261123T090000', 'SUMMARY:Comité déplacé', 'DTSTART;TZID=Romance Standard Time:20261123T140000', 'DTEND;TZID=Romance Standard Time:20261123T150000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x2', 'SUMMARY:Annulé', 'STATUS:CANCELLED', 'DTSTART:20261117T080000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x3', 'SUMMARY:Formation', 'DTSTART;VALUE=DATE:20261125', 'DTEND;VALUE=DATE:20261126', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const l = I.lire(ics, L(2026, 11, 16), L(2026, 12, 1));
  const comites = l.filter(e => /^Comité de pilotage/.test(e.objet));
  assert.equal(comites[0].objet, 'Comité de pilotage qualité avec un objet très long qui dépasse soixante-quinze caractères (fictif)');
  assert.deepEqual(comites.map(e => e.debut), [L(2026, 11, 16, 9), L(2026, 11, 26, 9), L(2026, 11, 30, 9)]);   // 19 exclu, 23 remplacé
  assert.equal(comites[0].fin, L(2026, 11, 16, 10, 30));
  assert.equal(comites[0].lieu, 'Salle du conseil');
  assert.ok(l.some(e => e.objet === 'Comité déplacé' && e.debut === L(2026, 11, 23, 14)));
  assert.ok(!l.some(e => e.objet === 'Annulé'));
  assert.ok(l.some(e => e.objet === 'Formation' && e.journee));
  assert.ok(!l.some(e => 'description' in e));
});

test('Répétitions quotidienne, mensuelle, jusqu’au', () => {
  assert.equal(I.occurrences(L(2026, 11, 1, 8), 'FREQ=DAILY;INTERVAL=2;UNTIL=20261107T235959Z', {}, L(2026, 11, 1), L(2026, 12, 1)).length, 4);
  assert.deepEqual(I.occurrences(L(2026, 1, 31, 8), 'FREQ=MONTHLY', {}, L(2026, 1, 1), L(2026, 5, 1)), [L(2026, 1, 31, 8), L(2026, 3, 31, 8)]);
});

test('Boîtes aux lettres : normalisation, rôles, mailto, texte du réglage, contrôle du cadre', () => {
  const cfg = { boitesMail: { '*': [{ libelle: 'Services techniques', adresse: 'st@hopital.example' }, { adresse: 'pas une adresse' }],
    U1: [{ libelle: 'Paramédicaux', adresse: 'IDE.U1@hopital.example', roles: ['ide', 'AS'], webmail: 'javascript:alert(1)' }, { libelle: 'Doublon', adresse: 'st@hopital.example' }] } };
  const b = Mx.boites(cfg, ['U1']);
  assert.deepEqual(b.map(x => x.adresse), ['st@hopital.example', 'ide.u1@hopital.example']);
  assert.equal(b[1].webmail, '');
  assert.deepEqual(Mx.boitesPour(cfg, ['U1'], ['SECRETAIRE']).map(x => x.adresse), ['st@hopital.example']);
  assert.equal(Mx.boitesPour(cfg, ['U1'], ['IDE']).length, 2);
  assert.equal(Mx.mailto('st@hopital.example', 'Demande DT-1 — Plomberie & robinet'), 'mailto:st@hopital.example?subject=Demande%20DT-1%20%E2%80%94%20Plomberie%20%26%20robinet');
  assert.equal(Mx.mailto('n’importe quoi', 'x'), '');
  const l = Mx.depuisTexte('Secrétariat | sec@hopital.example | SECRETAIRE | https://webmail.hopital.example\nIllisible | rien');
  assert.equal(l.length, 1);
  assert.equal(Mx.versTexte(l), 'Secrétariat | sec@hopital.example | SECRETAIRE | https://webmail.hopital.example');
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  assert.equal(Mx.controler({}, { U1: l }, cadre), true);
  assert.equal(Mx.controler({}, { '*': l }, cadre), false);
  assert.equal(Mx.controler({}, { U2: l }, { roles: ['IDE'], services: ['U2'] }), false);
});

test('Échanges .ics réglés par service (agenda)', () => {
  globalThis.SIC = globalThis.SIC || {};
  const A = require('../app/js/module-agenda.js');
  assert.deepEqual(A.echangesIcs({}, ['U1']), { exporter: true, services: ['U1'], importer: true, garder: false });
  const cfg = { agendaReglages: { '*': { icsGarder: true }, U2: { icsExport: false, icsImport: false } } };
  assert.deepEqual(A.echangesIcs(cfg, ['U1', 'U2']), { exporter: true, services: ['U1'], importer: true, garder: true });
  assert.deepEqual(A.echangesIcs(cfg, ['U2']), { exporter: false, services: [], importer: false, garder: false });
});
