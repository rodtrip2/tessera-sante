// SPDX-License-Identifier: EUPL-1.2
// Documents, tableur : saisie, formules, calcul, formats, insertion et suppression, recopie, tri (0.35.0). Données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/js/tableur.js');

const classeur = (cases, autres) => T.contenu({ feuilles: [{ nom: 'Lits', cellules: cases }].concat(autres || []) });
const val = (c, k, fi) => { const p = T.lire(k); return T.calculer(c, { maintenant: Date.parse('2026-11-12T10:00:00') }).valeur(fi || 0, p.l, p.c); };

test('Adresses : lettres de colonnes et noms de cases', () => {
  assert.equal(T.lettres(0), 'A'); assert.equal(T.lettres(25), 'Z'); assert.equal(T.lettres(26), 'AA'); assert.equal(T.lettres(99), 'CV');
  assert.equal(T.indexColonne('AB'), 27); assert.deepEqual(T.lire('C12'), { l: 11, c: 2 }); assert.equal(T.lire('12'), null);
});

test('Saisie : nombres à virgule, pourcentages, euros, dates, heures, textes, formules', () => {
  assert.deepEqual(T.saisir('12,5'), { v: 12.5 });
  assert.deepEqual(T.saisir('1 250'), { v: 1250 });
  assert.deepEqual(T.saisir('15 %'), { v: 0.15, fmt: 'pct' });
  assert.deepEqual(T.saisir('12 €'), { v: 12, fmt: 'eur' });
  assert.deepEqual(T.saisir('12/11/2026'), { v: T.serieDepuis(2026, 11, 12), fmt: 'date' });
  assert.equal(T.saisir('31/02/2026').v, '31/02/2026');
  assert.deepEqual(T.saisir('8h30'), { v: 8.5 / 24, fmt: 'heure' });
  assert.deepEqual(T.saisir("'0612"), { v: '0612' });
  assert.deepEqual(T.saisir('=A1+1'), { f: '=A1+1' });
  assert.deepEqual(T.saisir(''), { vide: true });
  assert.equal(T.texteSaisie({ v: '0612' }), "'0612");
  assert.equal(T.texteSaisie({ v: 0.15, s: { fmt: 'pct' } }), '15 %');
});

test('Formules : opérations, priorités, textes, comparaisons, fonctions en français', () => {
  const c = classeur({ A1: { v: 10 }, A2: { v: 20 }, A3: { v: 30 }, B1: { v: 'Unité 1 (fictif)' }, C1: { f: '=SOMME(A1:A3)' }, C2: { f: '=MOYENNE(A1:A3)' }, C3: { f: '=A1+A2*2^2-1' },
    C4: { f: '=SI(A1>5;"oui";"non")' }, C5: { f: '="Total : "&C1' }, C6: { f: '=NB.SI(A1:A3;">15")' }, C7: { f: '=SOMME.SI(A1:A3;">=20")' }, C8: { f: '=ARRONDI(10/3;2)' }, C9: { f: '=A1/0' },
    C10: { f: '=SIERREUR(A1/0;"—")' }, C11: { f: '=INCONNUE(1)' }, C12: { f: '=MAX(A:A)-MIN(A1:A3)' }, C13: { f: '=50%*A2' }, C14: { f: '=ET(A1>0;A2>0)' }, C15: { f: '=NBVAL(A1:B3)' },
    C16: { f: '=RECHERCHEV(20;A1:B3;1;FAUX)' }, C17: { f: '=MAJUSCULE(GAUCHE(B1;5))' }, C18: { f: '=1,5+1' } });
  assert.equal(val(c, 'C1'), 60); assert.equal(val(c, 'C2'), 20); assert.equal(val(c, 'C3'), 89); assert.equal(val(c, 'C4'), 'oui');
  assert.equal(val(c, 'C5'), 'Total : 60'); assert.equal(val(c, 'C6'), 2); assert.equal(val(c, 'C7'), 50); assert.equal(val(c, 'C8'), 3.33);
  assert.deepEqual(val(c, 'C9'), { err: '#DIV/0!' }); assert.equal(val(c, 'C10'), '—'); assert.deepEqual(val(c, 'C11'), { err: '#NOM?' });
  assert.equal(val(c, 'C12'), 20); assert.equal(val(c, 'C13'), 10); assert.equal(val(c, 'C14'), true); assert.equal(val(c, 'C15'), 4);
  assert.equal(val(c, 'C16'), 20); assert.equal(val(c, 'C17'), 'UNITÉ'); assert.equal(val(c, 'C18'), 2.5);
  assert.equal(T.verifier('=SOMME(A1:A3'), '« ) » attendu.'); assert.match(T.verifier('=TRUC(1)'), /inconnue/); assert.equal(T.verifier('=SOMME(A1:A3)'), null);
});

test('Formules : références circulaires, autres feuilles, dates', () => {
  const c = classeur({ A1: { f: '=B1' }, B1: { f: '=A1+1' }, A2: { f: "='Feuille d''été'!A1*2" }, A3: { f: '=Stats!B2' }, A4: { v: T.serieDepuis(2026, 11, 1), s: { fmt: 'date' } }, A5: { f: '=AUJOURDHUI()-A4' }, A6: { f: '=DATE(2026;12;25)' } },
    [{ nom: "Feuille d'été", cellules: { A1: { v: 21 } } }]);
  assert.equal(c.feuilles[1].nom, 'Feuille dété');   // apostrophe retirée du nom
  assert.deepEqual(val(c, 'A1'), { err: '#CYCLE!' });
  assert.deepEqual(val(c, 'A3'), { err: '#REF!' });
  assert.equal(val(c, 'A5'), 11);
  assert.equal(T.afficher(val(c, 'A6'), { fmt: 'date' }), '25/12/2026');
  const c2 = classeur({ A1: { f: "='Été 2026'!A1*2" } }, [{ nom: 'Été 2026', cellules: { A1: { v: 21 } } }]);
  assert.equal(val(c2, 'A1'), 42);
});

test('Affichage : formats nombre, pourcentage, euros, heure, décimales, milliers', () => {
  assert.equal(T.afficher(1234.5, {}), '1234,5');
  assert.equal(T.afficher(1234.5, { fmt: 'nombre', dec: 1, mil: true }), '1 234,5');
  assert.equal(T.afficher(0.256, { fmt: 'pct', dec: 1 }), '25,6 %');
  assert.equal(T.afficher(12, { fmt: 'eur' }), '12,00 €');
  assert.equal(T.afficher(8.5 / 24, { fmt: 'heure' }), '08:30');
  assert.equal(T.afficher(true, {}), 'VRAI');
  assert.equal(T.alignement(3, {}), 'd'); assert.equal(T.alignement('x', {}), 'g');
});

test('Insertion et suppression de lignes et de colonnes : cases déplacées, références à jour', () => {
  let c = classeur({ A1: { v: 1 }, A2: { v: 2 }, A3: { v: 3 }, B1: { f: '=SOMME(A1:A3)' }, B2: { f: '=A3*2' }, B3: { f: '=$A$2' } }, [{ nom: 'Autre', cellules: { A1: { f: '=Lits!A3' } } }]);
  c.feuilles[0].fusions = [{ l: 0, c: 3, nl: 3, nc: 1 }];
  let d = T.inserer(c, 0, 'l', 1, 2);   // deux lignes avant la ligne 2
  assert.equal(d.feuilles[0].cellules.A4.v, 2); assert.equal(d.feuilles[0].cellules.B1.f, '=SOMME(A1:A5)'); assert.equal(d.feuilles[0].cellules.B4.f, '=A5*2');
  assert.equal(d.feuilles[0].cellules.B5.f, '=$A$4'); assert.equal(d.feuilles[1].cellules.A1.f, '=Lits!A5'); assert.deepEqual(d.feuilles[0].fusions, [{ l: 0, c: 3, nl: 5, nc: 1 }]);
  assert.equal(val(d, 'B1'), 6);
  d = T.inserer(c, 0, 'l', 2, -1);      // suppression de la ligne 3
  assert.equal(d.feuilles[0].cellules.B1.f, '=SOMME(A1:A2)'); assert.equal(d.feuilles[0].cellules.B2.f, '=#REF!*2'); assert.equal(d.feuilles[1].cellules.A1.f, '=#REF!');
  assert.deepEqual(val(d, 'B2'), { err: '#REF!' });
  d = T.inserer(c, 0, 'c', 0, 1);       // une colonne avant A
  assert.equal(d.feuilles[0].cellules.C1.f, '=SOMME(B1:B3)'); assert.equal(d.feuilles[1].cellules.A1.f, '=Lits!B3');
});

test('Recopie (références relatives décalées), feuilles renommées ou supprimées, tri', () => {
  assert.equal(T.decaler('=A1+$B$1+$C2+D$3', 1, 1), '=B2+$B$1+$C3+E$3');
  assert.equal(T.decaler('=A1', -1, 0), '=#REF!');
  let c = classeur({ A1: { v: 5 } }, [{ nom: 'Calculs', cellules: { A1: { f: '=Lits!A1*2' } } }]);
  c = T.renommerFeuille(c, 0, 'Lits 2026');
  assert.equal(c.feuilles[1].cellules.A1.f, "='Lits 2026'!A1*2"); assert.equal(val(c, 'A1', 1), 10);
  assert.throws(() => T.renommerFeuille(c, 1, 'lits 2026'), /déjà/);
  const s = T.supprimerFeuille(c, 0); assert.equal(s.feuilles[0].cellules.A1.f, '=#REF!*2');
  const t = T.trier(classeur({ A1: { v: 'Chambre 3' }, B1: { v: 3 }, C1: { f: '=B1*10' }, A2: { v: 'Chambre 1' }, B2: { v: 1 }, C2: { f: '=B2*10' }, A3: { v: 'Chambre 2' }, B3: { v: 2 }, C3: { f: '=B3*10' } }), 0, { l1: 0, l2: 2, c1: 0, c2: 2 }, 1, false);
  assert.deepEqual(['A1', 'A2', 'A3'].map((k) => t.feuilles[0].cellules[k].v), ['Chambre 1', 'Chambre 2', 'Chambre 3']);
  assert.equal(t.feuilles[0].cellules.C1.f, '=B1*10'); assert.equal(val(t, 'C3'), 30);
});

test('Modèle validé, collage depuis un tableur, comparaison des versions', () => {
  const c = T.contenu({ feuilles: [{ nom: 'A', cellules: { A1: { v: 'x', s: { g: true, p: 'inconnue', fmt: 'date', dec: 9 } }, ZZZ9999: { v: 1 }, B1: { f: 'pas une formule' } }, largeurs: { 0: 5000, 1: 120 } }, { nom: 'a' }] });
  assert.deepEqual(c.feuilles[0].cellules.A1, { v: 'x', s: { g: true, fmt: 'date' } }); assert.equal(c.feuilles[0].cellules.ZZZ9999, undefined); assert.equal(c.feuilles[0].cellules.B1, undefined);
  assert.deepEqual(c.feuilles[0].largeurs, { 1: 120 }); assert.equal(c.feuilles[1].nom, 'a (2)'); assert.equal(c.page.orientation, 'paysage');
  assert.deepEqual(T.lireTSV('a\tb\n"c\td"\t2\n'), [['a', 'b'], ['c\td', '2']]);
  assert.equal(T.ecrireTSV([['a', 'b\tc'], ['1', '']]), 'a\t"b\tc"\n1\t');
  const v1 = classeur({ A1: { v: 1 }, A2: { v: 'x' } }), v2 = classeur({ A1: { v: 2 }, A3: { f: '=A1' } });
  assert.deepEqual(T.comparer(v1, v2).map((x) => x.texte), ['Lits!A1 : 1 → 2', 'Lits!A2 : x', 'Lits!A3 : =A1']);
});

test('Mise en forme conditionnelle : comparaisons, texte, dates passées ou proches, première règle', () => {
  const now = Date.parse('2026-11-12T10:00:00'), j = T.serieDepuis(2026, 11, 12);
  const f = T.feuille({ conditions: [{ plage: { l1: 0, c1: 0, l2: 9, c2: 0 }, op: '>', v1: 10, style: { f: 'rose', g: true } }, { plage: { l1: 0, c1: 0, l2: 9, c2: 0 }, op: '>', v1: 5, style: { f: 'jaune' } },
    { plage: { l1: 0, c1: 1, l2: 9, c2: 1 }, op: 'passe', style: { c: 'rouge' } }, { plage: { l1: 0, c1: 2, l2: 9, c2: 2 }, op: 'proche', v1: 30, style: { f: 'orange' } },
    { plage: { l1: 0, c1: 3, l2: 9, c2: 3 }, op: 'contient', v1: 'urgent', style: { g: true } }, { plage: { l1: 0, c1: 4, l2: 9, c2: 4 }, op: 'entre', v1: '01/11/2026', v2: '30/11/2026', style: { f: 'vert' } },
    { plage: { l1: 0, c1: 0, l2: 0, c2: 0 }, op: '>', v1: 1, style: {} }] });
  assert.equal(f.conditions.length, 6);   // règle sans mise en forme écartée
  assert.deepEqual(T.styleConditionnel(f, 0, 0, 12, now), { f: 'rose', g: true });
  assert.deepEqual(T.styleConditionnel(f, 0, 0, 7, now), { f: 'jaune' });
  assert.equal(T.styleConditionnel(f, 0, 0, 3, now), null);
  assert.equal(T.styleConditionnel(f, 20, 0, 12, now), null);
  assert.deepEqual(T.styleConditionnel(f, 0, 1, j - 1, now), { c: 'rouge' }); assert.equal(T.styleConditionnel(f, 0, 1, j, now), null);
  assert.deepEqual(T.styleConditionnel(f, 0, 2, j + 20, now), { f: 'orange' }); assert.equal(T.styleConditionnel(f, 0, 2, j + 40, now), null);
  assert.deepEqual(T.styleConditionnel(f, 0, 3, 'Très URGENT (fictif)', now), { g: true });
  assert.deepEqual(T.styleConditionnel(f, 0, 4, j, now), { f: 'vert' });
});

test('Validation des saisies : liste de choix, nombre, date, longueur ; bloquante ou avertissement', () => {
  const f = T.feuille({ validations: [{ plage: { l1: 1, c1: 0, l2: 50, c2: 0 }, genre: 'liste', valeurs: ['Jour', 'Nuit', ' '] }, { plage: { l1: 1, c1: 1, l2: 50, c2: 1 }, genre: 'nombre', min: 0, max: 20, bloquant: false },
    { plage: { l1: 1, c1: 2, l2: 50, c2: 2 }, genre: 'date', min: T.serieDepuis(2026, 1, 1) }, { plage: { l1: 1, c1: 3, l2: 50, c2: 3 }, genre: 'texte', max: 5, message: 'Initiales seulement (fictif)' }, { plage: { l1: 0, c1: 0, l2: 0, c2: 0 }, genre: 'liste', valeurs: [] }] });
  assert.equal(f.validations.length, 4); assert.deepEqual(f.validations[0].valeurs, ['Jour', 'Nuit']); assert.equal(f.validations[1].bloquant, false);
  const v = (l, c) => T.validationDe(f, l, c);
  assert.equal(T.controlerSaisie(v(1, 0), T.saisir('nuit')), null); assert.match(T.controlerSaisie(v(1, 0), T.saisir('Soir')), /Jour, Nuit/);
  assert.equal(T.controlerSaisie(v(1, 1), T.saisir('12')), null); assert.match(T.controlerSaisie(v(1, 1), T.saisir('25')), /entre 0 et 20/); assert.match(T.controlerSaisie(v(1, 1), T.saisir('abc')), /nombre/);
  assert.equal(T.controlerSaisie(v(1, 2), T.saisir('12/11/2026')), null); assert.match(T.controlerSaisie(v(1, 2), T.saisir('12/11/2025')), /au moins 01\/01\/2026/);
  assert.equal(T.controlerSaisie(v(1, 3), T.saisir('ABCDEF')), 'Initiales seulement (fictif)');
  assert.equal(T.controlerSaisie(v(1, 0), T.saisir('')), null);
  assert.equal(T.conforme(v(1, 1), 30), false); assert.equal(T.conforme(v(1, 1), 3), true);
  assert.equal(v(0, 1), null);
});

test('Filtre : lignes masquées selon les valeurs affichées, valeurs de la colonne, plages suivent les insertions', () => {
  let c = T.contenu({ feuilles: [{ cellules: { A1: { v: 'Équipe' }, B1: { v: 'Heures' }, A2: { v: 'Jour' }, B2: { v: 7 }, A3: { v: 'Nuit' }, B3: { v: 10 }, A4: { v: 'Jour' }, B4: { v: 7 }, A5: { v: '' } , B5: { v: 1 } },
    filtre: { l: 0, c1: 0, c2: 1, masques: { 0: ['Nuit'], 5: ['x'] } }, conditions: [{ plage: { l1: 1, c1: 1, l2: 4, c2: 1 }, op: '>', v1: 8, style: { f: 'rose' } }] }] });
  assert.deepEqual(c.feuilles[0].filtre.masques, { 0: ['Nuit'] });
  const calc = T.calculer(c);
  assert.deepEqual(T.lignesMasquees(c, 0, calc), { 2: true });
  assert.deepEqual(T.valeursColonne(c, 0, 0, calc), ['Jour', 'Nuit', '']);
  assert.deepEqual(T.valeursColonne(c, 0, 1, calc), ['1', '7', '10']);
  const d = T.inserer(c, 0, 'l', 0, 1);
  assert.equal(d.feuilles[0].filtre.l, 1); assert.deepEqual(d.feuilles[0].conditions[0].plage, { l1: 2, c1: 1, l2: 5, c2: 1 });
  const e = T.inserer(c, 0, 'c', 0, -1);
  assert.equal(e.feuilles[0].filtre.c2, 0); assert.deepEqual(e.feuilles[0].filtre.masques, {});
  const g = T.inserer(c, 0, 'l', 1, -4);
  assert.equal(g.feuilles[0].conditions.length, 0);   // plage supprimée entièrement : règle retirée
});
