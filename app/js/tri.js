// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — tri et filtre des tableaux (0.26.0, lot A, décisions du porteur du 11 novembre 2026).
 *
 * Un clic sur le titre d'une colonne trie le tableau (croissant, puis décroissant, puis ordre d'origine), selon le
 * type des valeurs : date (JJ/MM/AAAA, avec ou sans heure), heure, nombre (virgule décimale, unité après le nombre),
 * texte (ordre du français, chiffres dans l'ordre naturel). Les cases vides vont toujours à la fin. Le tri est retenu
 * dans les préférences de l'agent (`tris` : { <tableau>: { col, sens } }) ; à l'export et à l'impression, l'agent
 * choisit l'ordre affiché à l'écran ou l'ordre d'origine. Logique sans interface, testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).tri = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODE = /^[^\u0000-\u001f]{1,160}$/, NB_TABLEAUX = 200;
  var DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\D+(\d{1,2})[:h](\d{2}))?/;
  var ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
  var HEURE = /^(\d{1,2})[:h](\d{2})(?:\s*[–-].*)?$/;
  var NOMBRE = /^[-+]?\d[\d\s  ]*(?:[.,]\d+)?(?:\s*(?:%|[a-zA-Zéèûô°€]{1,12}\.?))?$/;
  var col = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }) : null;

  function nettoyer(t) { return String(t == null ? '' : t).replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' ').trim(); }
  function vide(t) { return t === '' || t === '—' || t === '-' || t === '–'; }
  /** Valeur comparable d'une case : { type: 'date' | 'heure' | 'nombre' | 'texte' | 'vide', v }. */
  function valeur(texte) {
    var t = nettoyer(texte), m;
    if (vide(t)) return { type: 'vide', v: 0 };
    if ((m = DATE.exec(t))) {
      var an = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      return { type: 'date', v: Date.UTC(an, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) };
    }
    if ((m = ISO.exec(t))) return { type: 'date', v: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) };
    if ((m = HEURE.exec(t))) return { type: 'heure', v: +m[1] * 60 + +m[2] };
    if (NOMBRE.test(t)) return { type: 'nombre', v: parseFloat(t.replace(/[\s  ]/g, '').replace(',', '.')) };
    return { type: 'texte', v: t };
  }
  /** Compare deux valeurs (`valeur`) ; types différents : nombres et dates avant le texte. */
  var RANG = { date: 0, heure: 1, nombre: 2, texte: 3 };
  function comparer(a, b) {
    if (a.type !== b.type) return RANG[a.type] - RANG[b.type];
    if (a.type === 'texte') return col ? col.compare(a.v, b.v) : String(a.v).localeCompare(String(b.v));
    return a.v - b.v;
  }
  /**
   * Trie des éléments selon le texte lu par `lire(element)` ; `sens` 1 ou -1 ; tri stable ; vides à la fin dans les
   * deux sens. Renvoie un nouveau tableau.
   */
  function trier(elements, lire, sens) {
    var s = sens === -1 ? -1 : 1;
    return elements.map(function (e, i) { return { e: e, i: i, v: valeur(lire(e)) }; }).sort(function (x, y) {
      var vx = x.v.type === 'vide', vy = y.v.type === 'vide';
      if (vx || vy) return vx === vy ? x.i - y.i : vx ? 1 : -1;
      return s * comparer(x.v, y.v) || x.i - y.i;
    }).map(function (x) { return x.e; });
  }
  /** Sens suivant au clic sur une colonne : croissant → décroissant → ordre d'origine (0). */
  function suivant(actuel, colonne) {
    if (!actuel || actuel.col !== colonne) return { col: colonne, sens: 1 };
    if (actuel.sens === 1) return { col: colonne, sens: -1 };
    return null;
  }
  /** Préférence `tris` validée : { tableau: { col, sens } }. */
  function preference(v) {
    var r = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return r;
    Object.keys(v).slice(0, NB_TABLEAUX).forEach(function (k) {
      var x = v[k];
      if (CODE.test(k) && x && CODE.test(String(x.col || '')) && (x.sens === 1 || x.sens === -1)) r[k] = { col: String(x.col), sens: x.sens };
    });
    return r;
  }
  /** Nouvelle préférence après un clic (`tri` null : ordre d'origine). */
  function regler(v, tableau, tri) {
    var r = preference(v);
    if (!CODE.test(String(tableau || ''))) return r;
    if (tri) r[tableau] = { col: tri.col, sens: tri.sens }; else delete r[tableau];
    return r;
  }
  /** Code d'un titre de colonne (comparaison des en-têtes d'un écran et d'un export). */
  function codeTitre(t) { return nettoyer(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 120); }

  /**
   * Filtre rapide : la ligne contient-elle tous les mots cherchés (sans tenir compte des accents ni de la casse) ?
   */
  function correspond(texte, recherche) {
    var mots = codeTitre(recherche).split(' ').filter(Boolean);
    if (!mots.length) return true;
    var t = codeTitre(texte);
    return mots.every(function (m) { return t.indexOf(m) >= 0; });
  }

  // ---------------------------------------------------------------- CSV : export dans l'ordre affiché
  /** Lecture d'un CSV « ; » (guillemets doublés), marque d'ordre des octets retirée. */
  function lireCsv(texte) {
    var t = String(texte).replace(/^﻿/, ''), lignes = [], l = [], c = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === ';') { l.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; l.push(c); lignes.push(l); l = []; c = ''; }
      else c += ch;
    }
    if (c !== '' || l.length) { l.push(c); lignes.push(l); }
    return lignes;
  }
  function ecrireCsv(lignes) {
    return '﻿' + lignes.map(function (l) { return l.map(function (x) { var s = String(x == null ? '' : x); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';'); }).join('\r\n');
  }
  /**
   * Ligne d'en-tête d'un CSV qui contient la colonne triée (code du titre) : { ligne, colonne } ou null. Les lignes
   * suivantes, jusqu'à une ligne vide, sont les données du tableau.
   */
  function enteteCsv(lignes, colonne) {
    var c = codeTitre(colonne);
    for (var i = 0; i < Math.min(lignes.length, 20); i++) {
      var j = lignes[i].map(codeTitre).indexOf(c);
      if (j >= 0 && lignes[i].length > 1) return { ligne: i, colonne: j };
    }
    return null;
  }
  /** CSV réordonné selon le tri de l'écran ; inchangé si la colonne triée n'y figure pas. */
  function ordonnerCsv(texte, tri) {
    if (!tri) return texte;
    var lignes = lireCsv(texte), e = enteteCsv(lignes, tri.titre || tri.col);
    if (!e) return texte;
    var fin = e.ligne + 1;
    while (fin < lignes.length && lignes[fin].some(function (x) { return x !== ''; })) fin++;
    // Première colonne « Groupe » (Vue d'ensemble) : tri à l'intérieur de chaque groupe, comme à l'écran
    var corps = lignes.slice(e.ligne + 1, fin), g = codeTitre(lignes[e.ligne][0]) === 'groupe' && e.colonne !== 0;
    if (g) {
      var paquets = [];
      corps.forEach(function (l) { var d = paquets[paquets.length - 1]; if (d && d[0][0] === l[0]) d.push(l); else paquets.push([l]); });
      corps = [].concat.apply([], paquets.map(function (d) { return trier(d, function (l) { return l[e.colonne]; }, tri.sens); }));
    } else corps = trier(corps, function (l) { return l[e.colonne]; }, tri.sens);
    return ecrireCsv(lignes.slice(0, e.ligne + 1).concat(corps, lignes.slice(fin)));
  }

  return { valeur: valeur, comparer: comparer, trier: trier, suivant: suivant, preference: preference, regler: regler, codeTitre: codeTitre,
    correspond: correspond, lireCsv: lireCsv, ecrireCsv: ecrireCsv, enteteCsv: enteteCsv, ordonnerCsv: ordonnerCsv };
});
