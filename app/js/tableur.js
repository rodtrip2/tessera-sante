// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — tableur (0.35.0, étape 2). Logique seule, testable sous Node : modèle d'un classeur (feuilles,
 * cases, mises en forme, largeurs, hauteurs, fusions, volets figés), saisie d'une case, formules en français à la façon
 * d'un tableur courant (« =SOMME(A1:A10) », arguments séparés par « ; », virgule décimale acceptée), calcul de toutes
 * les cases avec détection des références circulaires, formats d'affichage (nombre, pourcentage, euros, date, heure),
 * insertion et suppression de lignes et de colonnes avec mise à jour des références, recopie d'une formule (références
 * relatives décalées), tri. Interprète écrit à la main : aucune évaluation de code (politique de sécurité).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).tableur = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_LIGNES = 2000, MAX_COLONNES = 100, MAX_FEUILLES = 20, MAX_CASES = 40000, MAX_TEXTE = 4000;
  var POLICES = { arial: 1, calibri: 1, cambria: 1, georgia: 1, times: 1, verdana: 1, tahoma: 1, trebuchet: 1, courier: 1 };
  var TAILLES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
  var COULEURS = { gris: 1, rouge: 1, orange: 1, vert: 1, bleu: 1, violet: 1, marron: 1 };
  var FONDS = { jaune: 1, vert: 1, bleu: 1, rose: 1, gris: 1, orange: 1, violet: 1 };
  var FORMATS = { std: 'Standard', nombre: 'Nombre', pct: 'Pourcentage', eur: 'Euros', date: 'Date', heure: 'Heure', texte: 'Texte' };
  var ERREURS = ['#DIV/0!', '#REF!', '#NOM?', '#VALEUR!', '#CYCLE!', '#N/A', '#NOMBRE!'];

  function texte(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, n || 120); }

  // ------------------------------------------------------------ Adresses
  function lettres(c) { var s = ''; c++; while (c > 0) { var r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; }
  function indexColonne(l) { var n = 0; l = l.toUpperCase(); for (var i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64); return n - 1; }
  function nom(l, c) { return lettres(c) + (l + 1); }
  function lire(n) { var m = /^([A-Z]{1,3})(\d{1,5})$/.exec(String(n || '').toUpperCase()); return m ? { l: +m[2] - 1, c: indexColonne(m[1]) } : null; }

  // ------------------------------------------------------------ Modèle
  function style(s) {
    if (!s || typeof s !== 'object') return null;
    var x = {};
    ['g', 'i', 's', 'b', 'r', 'bd', 'mil'].forEach(function (k) { if (s[k] === true) x[k] = true; });
    if (POLICES[s.p]) x.p = s.p;
    if (TAILLES.indexOf(+s.z) >= 0) x.z = +s.z;
    if (COULEURS[s.c]) x.c = s.c;
    if (FONDS[s.f]) x.f = s.f;
    if (s.al === 'g' || s.al === 'c' || s.al === 'd') x.al = s.al;
    if (FORMATS[s.fmt] && s.fmt !== 'std') x.fmt = s.fmt;
    if (s.dec !== undefined && +s.dec >= 0 && +s.dec <= 6) x.dec = Math.round(+s.dec);
    return Object.keys(x).length ? x : null;
  }
  function caseValide(x) {
    if (!x || typeof x !== 'object') return null;
    var r = {};
    if (typeof x.f === 'string' && x.f.charAt(0) === '=') r.f = texte(x.f, MAX_TEXTE);
    else if (typeof x.v === 'number' && isFinite(x.v)) r.v = x.v;
    else if (typeof x.v === 'string' && x.v !== '') r.v = texte(x.v, MAX_TEXTE);
    var s = style(x.s); if (s) r.s = s;
    return r.f !== undefined || r.v !== undefined || r.s ? r : null;
  }
  function nomFeuille(n, i) { var x = texte(n, 31).replace(/[\[\]:*?\/\\!']/g, '').trim(); return x || 'Feuille' + (i + 1); }
  function feuille(f, i) {
    f = f || {};
    var cs = {}, n = 0;
    Object.keys(f.cellules || {}).forEach(function (k) {
      var a = lire(k); if (!a || a.l >= MAX_LIGNES || a.c >= MAX_COLONNES || n >= MAX_CASES) return;
      var x = caseValide(f.cellules[k]); if (x) { cs[nom(a.l, a.c)] = x; n++; }
    });
    function tailles(o, min, max) { var r = {}; Object.keys(o || {}).forEach(function (k) { var v = Math.round(+o[k]); if (/^\d+$/.test(k) && v >= min && v <= max) r[k] = v; }); return r; }
    var fusions = (Array.isArray(f.fusions) ? f.fusions : []).map(function (u) { return { l: Math.round(+u.l), c: Math.round(+u.c), nl: Math.round(+u.nl), nc: Math.round(+u.nc) }; })
      .filter(function (u) { return u.l >= 0 && u.c >= 0 && u.nl >= 1 && u.nc >= 1 && (u.nl > 1 || u.nc > 1) && u.l + u.nl <= MAX_LIGNES && u.c + u.nc <= MAX_COLONNES; });
    // Fusions qui se chevauchent : la première est gardée
    var gardees = []; fusions.forEach(function (u) { if (!gardees.some(function (g) { return chevauche(g, u); })) gardees.push(u); });
    return { nom: nomFeuille(f.nom, i), cellules: cs, largeurs: tailles(f.largeurs, 24, 800), hauteurs: tailles(f.hauteurs, 16, 400), fusions: gardees.slice(0, 500),
      figer: { l: f.figer && f.figer.l ? 1 : 0, c: f.figer && f.figer.c ? 1 : 0 } };
  }
  function chevauche(a, b) { return a.l < b.l + b.nl && b.l < a.l + a.nl && a.c < b.c + b.nc && b.c < a.c + a.nc; }
  function zones(z) { z = z || {}; return { gauche: texte(z.gauche, 160), centre: texte(z.centre, 160), droite: texte(z.droite, 160) }; }
  function marge(v, d) { var n = Math.round(+v); return n >= 5 && n <= 50 ? n : d; }
  function page(p) {
    p = p || {};
    var m = p.marges || {};
    return { orientation: p.orientation === 'portrait' ? 'portrait' : 'paysage', marges: { h: marge(m.h, 12), b: marge(m.b, 12), g: marge(m.g, 10), d: marge(m.d, 10) },
      ajuster: p.ajuster !== false, quadrillage: p.quadrillage !== false, repeter: p.repeter === true,
      entete: zones(p.entete || {}), pied: zones(p.pied || { gauche: '{titre}', droite: 'Page {page}' }) };
  }
  /** Classeur validé : { v, genre: 'tableur', feuilles, page }. Noms de feuilles uniques. */
  function contenu(c) {
    c = c || {};
    var fs = (Array.isArray(c.feuilles) && c.feuilles.length ? c.feuilles : [{}]).slice(0, MAX_FEUILLES).map(feuille), vus = {};
    fs.forEach(function (f, i) { var n = f.nom, k = 2; while (vus[n.toLowerCase()]) n = f.nom.slice(0, 28) + ' (' + (k++) + ')'; f.nom = n; vus[n.toLowerCase()] = true; });
    return { v: 1, genre: 'tableur', feuilles: fs, page: page(c.page) };
  }
  function etendue(f) {
    var l = 0, c = 0;
    Object.keys(f.cellules).forEach(function (k) { var a = lire(k); if (f.cellules[k].v !== undefined || f.cellules[k].f !== undefined || f.cellules[k].s) { l = Math.max(l, a.l + 1); c = Math.max(c, a.c + 1); } });
    f.fusions.forEach(function (u) { l = Math.max(l, u.l + u.nl); c = Math.max(c, u.c + u.nc); });
    return { l: l, c: c };
  }

  // ------------------------------------------------------------ Dates (numéro de série, comme les tableurs courants)
  var ORIGINE = Date.UTC(1899, 11, 30);
  function serieDepuis(a, m, j) { return Math.round((Date.UTC(a, m - 1, j) - ORIGINE) / 864e5); }
  function dateDe(serie) { var d = new Date(ORIGINE + Math.floor(serie) * 864e5); return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, j: d.getUTCDate() }; }
  function aujourdhui(maintenant) { var d = new Date(maintenant || Date.now()); return serieDepuis(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

  // ------------------------------------------------------------ Saisie d'une case
  /**
   * Texte tapé par l'agent → { v } ou { f }, et un format proposé (date, heure, pourcentage, euros) si la case n'en a pas.
   * « '… » force un texte ; « =… » est une formule.
   */
  function saisir(t) {
    t = String(t == null ? '' : t);
    if (t === '') return { vide: true };
    if (t.charAt(0) === "'") return { v: t.slice(1) };
    if (t.charAt(0) === '=' && t.length > 1) return { f: t };
    var s = t.trim().replace(/[  ]/g, ' ');
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (m) { var a = +m[3] < 100 ? 2000 + +m[3] : +m[3], mo = +m[2], j = +m[1], d = new Date(Date.UTC(a, mo - 1, j)); if (d.getUTCMonth() === mo - 1 && d.getUTCDate() === j) return { v: serieDepuis(a, mo, j), fmt: 'date' }; }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return { v: serieDepuis(+m[1], +m[2], +m[3]), fmt: 'date' };
    m = /^(\d{1,2})[:h](\d{2})$/.exec(s);
    if (m && +m[1] < 24 && +m[2] < 60) return { v: (+m[1] * 60 + +m[2]) / 1440, fmt: 'heure' };
    var n = nombreTexte(s);
    if (n !== null) return n;
    return { v: t };
  }
  function nombreTexte(s) {
    var fmt = null, x = s;
    if (/%$/.test(x)) { fmt = 'pct'; x = x.slice(0, -1).trim(); }
    else if (/€$/.test(x) || /^€/.test(x)) { fmt = 'eur'; x = x.replace(/€/g, '').trim(); }
    x = x.replace(/ /g, '');
    if (!/^[-+]?(\d+([.,]\d+)?|[.,]\d+)$/.test(x)) return null;
    var v = +x.replace(',', '.');
    if (fmt === 'pct') v = v / 100;
    return fmt ? { v: v, fmt: fmt } : { v: v };
  }
  /** Texte d'une case dans la barre de saisie (formule, date, heure, pourcentage restitués comme tapés). */
  function texteSaisie(x) {
    if (!x) return '';
    if (x.f !== undefined) return x.f;
    if (x.v === undefined) return '';
    if (typeof x.v === 'number') {
      var f = x.s && x.s.fmt;
      if (f === 'date') return afficher(x.v, { fmt: 'date' });
      if (f === 'heure') return afficher(x.v, { fmt: 'heure' });
      if (f === 'pct') return String(+(x.v * 100).toPrecision(12)).replace('.', ',') + ' %';
      return String(+x.v.toPrecision(15)).replace('.', ',');
    }
    var s = String(x.v);
    return saisir(s).v === s ? s : "'" + s;   // texte qui ressemble à un nombre : apostrophe
  }

  // ------------------------------------------------------------ Formules : jetons
  function Err(code) { return { err: code }; }
  function estErr(v) { return !!(v && typeof v === 'object' && v.err); }
  var RE_FEUILLE = /^(?:'((?:[^']|'')+)'|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*))!/;
  var RE_CASE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,5})(?![A-Za-z0-9_(.])/;
  var RE_COLS = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(.!])/;
  var RE_LIGNES = /^(\$?)(\d{1,5}):(\$?)(\d{1,5})(?![0-9.,])/;
  function lireCase(m) { return { absC: !!m[1], c: indexColonne(m[2]), absL: !!m[3], l: +m[4] - 1 }; }
  /** Jetons d'une formule (sans le « = »), avec leur position (pour réécrire les références). */
  function jetons(t) {
    var res = [], i = 0, n = t.length;
    while (i < n) {
      var c = t[i], reste = t.slice(i), m;
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        var j = i + 1, s = '';
        while (j < n) { if (t[j] === '"') { if (t[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += t[j]; j++; }
        if (j >= n) throw new Error('Guillemet fermant manquant.');
        res.push({ t: 'txt', v: s, a: i, b: j + 1 }); i = j + 1; continue;
      }
      // Référence (avec ou sans feuille) : case, plage, colonnes, lignes
      var fm = RE_FEUILLE.exec(reste), dec = 0, nf = null;
      if (fm) { nf = fm[1] !== undefined ? fm[1].replace(/''/g, "'") : fm[2]; dec = fm[0].length; }
      var r2 = reste.slice(dec), ref = null, lg = 0;
      if ((m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,5}):(\$?)([A-Za-z]{1,3})(\$?)(\d{1,5})(?![A-Za-z0-9_(.])/.exec(r2))) { ref = { genre: 'plage', d: lireCase([0, m[1], m[2], m[3], m[4]]), f: lireCase([0, m[5], m[6], m[7], m[8]]) }; lg = m[0].length; }
      else if ((m = RE_CASE.exec(r2))) { ref = { genre: 'case', d: lireCase(m) }; lg = m[0].length; }
      else if ((m = RE_COLS.exec(r2))) { ref = { genre: 'cols', d: { absC: !!m[1], c: indexColonne(m[2]) }, f: { absC: !!m[3], c: indexColonne(m[4]) } }; lg = m[0].length; }
      else if ((m = RE_LIGNES.exec(r2)) && (fm || !/^\d/.test(r2) || /:/.test(m[0]))) { ref = { genre: 'lignes', d: { absL: !!m[1], l: +m[2] - 1 }, f: { absL: !!m[3], l: +m[4] - 1 } }; lg = m[0].length; }
      if (ref) { ref.feuille = nf; res.push({ t: 'ref', v: ref, a: i, b: i + dec + lg }); i += dec + lg; continue; }
      if (fm) throw new Error('Référence attendue après « ' + fm[0] + ' ».');
      if (c === '#') { var e = ERREURS.filter(function (x) { return reste.toUpperCase().indexOf(x) === 0; })[0]; if (e) { res.push({ t: 'err', v: e, a: i, b: i + e.length }); i += e.length; continue; } }
      m = /^(\d+([.,]\d+)?|[.,]\d+)([eE][-+]?\d+)?/.exec(reste);
      if (m) { res.push({ t: 'num', v: +m[0].replace(',', '.'), a: i, b: i + m[0].length }); i += m[0].length; continue; }
      m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(reste);
      if (m) { res.push({ t: 'id', v: m[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), a: i, b: i + m[0].length }); i += m[0].length; continue; }
      m = /^(<=|>=|<>|[-+*\/^&=<>();%:])/.exec(reste);
      if (m) { res.push({ t: 'op', v: m[0], a: i, b: i + m[0].length }); i += m[0].length; continue; }
      throw new Error('Caractère inattendu « ' + c + ' ».');
    }
    return res;
  }

  // ------------------------------------------------------------ Formules : arbre
  function analyser(formule) {
    var ts = jetons(String(formule || '').replace(/^=/, '')), k = 0;
    function voir() { return ts[k]; }
    function op(v) { var x = ts[k]; return x && x.t === 'op' && x.v === v; }
    function attendre(v) { if (!op(v)) throw new Error('« ' + v + ' » attendu.'); k++; }
    function comparaison() { var g = concat(); while (voir() && voir().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(voir().v) >= 0) { var o = ts[k++].v; g = { op: o, g: g, d: concat() }; } return g; }
    function concat() { var g = somme(); while (op('&')) { k++; g = { op: '&', g: g, d: somme() }; } return g; }
    function somme() { var g = produit(); while (op('+') || op('-')) { var o = ts[k++].v; g = { op: o, g: g, d: produit() }; } return g; }
    function produit() { var g = puissance(); while (op('*') || op('/')) { var o = ts[k++].v; g = { op: o, g: g, d: puissance() }; } return g; }
    function puissance() { var g = unaire(); while (op('^')) { k++; g = { op: '^', g: g, d: unaire() }; } return g; }
    function unaire() { if (op('-')) { k++; return { op: 'neg', g: unaire() }; } if (op('+')) { k++; return unaire(); } return pourcent(); }
    function pourcent() { var g = primaire(); while (op('%')) { k++; g = { op: '%', g: g }; } return g; }
    function primaire() {
      var x = ts[k++];
      if (!x) throw new Error('Formule incomplète.');
      if (x.t === 'num') return { n: x.v };
      if (x.t === 'txt') return { s: x.v };
      if (x.t === 'err') return { e: x.v };
      if (x.t === 'ref') return { ref: x.v };
      if (x.t === 'op' && x.v === '(') { var e = comparaison(); attendre(')'); return e; }
      if (x.t === 'id') {
        if (x.v === 'VRAI' && !op('(')) return { b: true };
        if (x.v === 'FAUX' && !op('(')) return { b: false };
        if (!op('(')) throw new Error('Nom inconnu « ' + x.v + ' ».');
        k++;
        var args = [];
        if (!op(')')) { for (;;) { if (op(';') || op(')')) args.push({ vide: true }); else args.push(comparaison()); if (op(';')) { k++; continue; } break; } }
        attendre(')');
        return { fn: x.v, args: args };
      }
      throw new Error('« ' + x.v + ' » inattendu.');
    }
    var arbre = comparaison();
    if (k < ts.length) throw new Error('« ' + ts[k].v + ' » inattendu.');
    return arbre;
  }

  // ------------------------------------------------------------ Calcul
  function nombre(v) {
    if (estErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var s = saisir(String(v));
    return typeof s.v === 'number' ? s.v : Err('#VALEUR!');
  }
  function chaine(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'number') return String(+v.toPrecision(15)).replace('.', ',');
    return String(v);
  }
  function booleen(v) { if (estErr(v)) return v; if (typeof v === 'boolean') return v; if (v === null || v === undefined || v === '') return false; if (typeof v === 'number') return v !== 0; var u = String(v).toUpperCase(); if (u === 'VRAI') return true; if (u === 'FAUX') return false; return Err('#VALEUR!'); }
  function comparer(a, b) {
    var ta = typeof a === 'number' || a === null || a === undefined ? 0 : typeof a === 'string' ? 1 : 2, tb = typeof b === 'number' || b === null || b === undefined ? 0 : typeof b === 'string' ? 1 : 2;
    if ((a === null || a === undefined) && typeof b === 'string') { a = ''; ta = 1; }
    if ((b === null || b === undefined) && typeof a === 'string') { b = ''; tb = 1; }
    if (ta !== tb) return ta - tb;
    if (ta === 0) return (a || 0) - (b || 0);
    if (ta === 1) { var x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  /** Valeurs « à plat » des arguments (plages comprises), pour SOMME, MOYENNE… : { nombres, toutes, erreur }. */
  function aPlat(vals) {
    var res = { nombres: [], toutes: [], erreur: null };
    vals.forEach(function (v) {
      if (v && v.plage) v.plage.forEach(function (l) { l.forEach(function (x) { if (estErr(x)) res.erreur = res.erreur || x; else { res.toutes.push(x); if (typeof x === 'number') res.nombres.push(x); } }); });
      else if (estErr(v)) res.erreur = res.erreur || v;
      else { res.toutes.push(v); var n = nombre(v); if (!estErr(n) && v !== null && v !== undefined && v !== '') res.nombres.push(n); }
    });
    return res;
  }
  /** Critère de NB.SI, SOMME.SI : « >10 », « <>abc », « =5 », « texte » (joker « * » et « ? »). */
  function critere(c) {
    var s = typeof c === 'string' ? c : null, o = '=', v = c;
    if (s !== null) { var m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(s); if (m) { o = m[1]; v = m[2]; } var n = saisir(v); if (typeof n.v === 'number' && v !== '') v = n.v; }
    var re = typeof v === 'string' && /[*?]/.test(v) ? new RegExp('^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
    return function (x) {
      if (re) { var ok = typeof x === 'string' && re.test(x); return o === '<>' ? !ok : ok; }
      if (v === '' && o === '=') return x === null || x === undefined || x === '';
      if (v === '' && o === '<>') return !(x === null || x === undefined || x === '');
      if (typeof v === 'number' && typeof x !== 'number') return o === '<>';
      var r = comparer(x === undefined ? null : x, v);
      return o === '=' ? r === 0 : o === '<>' ? r !== 0 : o === '<' ? r < 0 : o === '>' ? r > 0 : o === '<=' ? r <= 0 : r >= 0;
    };
  }
  function arrondir(n, d) { var p = Math.pow(10, d); return Math.round((n + (n >= 0 ? 1e-12 : -1e-12)) * p) / p; }
  function premiereErr() { for (var i = 0; i < arguments.length; i++) if (estErr(arguments[i])) return arguments[i]; return null; }
  function seul(v) { return v && v.plage ? (v.plage[0] && v.plage[0].length ? v.plage[0][0] : null) : v; }
  var FONCTIONS = {
    SOMME: function (a) { var p = aPlat(a); return p.erreur || p.nombres.reduce(function (s, x) { return s + x; }, 0); },
    MOYENNE: function (a) { var p = aPlat(a); return p.erreur || (p.nombres.length ? p.nombres.reduce(function (s, x) { return s + x; }, 0) / p.nombres.length : Err('#DIV/0!')); },
    MIN: function (a) { var p = aPlat(a); return p.erreur || (p.nombres.length ? Math.min.apply(null, p.nombres) : 0); },
    MAX: function (a) { var p = aPlat(a); return p.erreur || (p.nombres.length ? Math.max.apply(null, p.nombres) : 0); },
    NB: function (a) { return aPlat(a).nombres.length; },
    NBVAL: function (a) { return aPlat(a).toutes.filter(function (x) { return x !== null && x !== undefined && x !== ''; }).length; },
    'NB.VIDE': function (a) { return aPlat(a).toutes.filter(function (x) { return x === null || x === undefined || x === ''; }).length; },
    'NB.SI': function (a) { var p = aPlat([a[0]]), f = critere(seul(a[1])); return p.toutes.filter(f).length; },
    'SOMME.SI': function (a) {
      var plage = a[0] && a[0].plage ? a[0].plage : [[seul(a[0])]], somme = a[2] && a[2].plage ? a[2].plage : plage, f = critere(seul(a[1])), s = 0;
      plage.forEach(function (l, i) { l.forEach(function (x, j) { if (f(x)) { var y = somme[i] && somme[i][j]; if (typeof y === 'number') s += y; } }); });
      return s;
    },
    'MOYENNE.SI': function (a) {
      var plage = a[0] && a[0].plage ? a[0].plage : [[seul(a[0])]], moy = a[2] && a[2].plage ? a[2].plage : plage, f = critere(seul(a[1])), s = 0, n = 0;
      plage.forEach(function (l, i) { l.forEach(function (x, j) { if (f(x)) { var y = moy[i] && moy[i][j]; if (typeof y === 'number') { s += y; n++; } } }); });
      return n ? s / n : Err('#DIV/0!');
    },
    SI: null, SIERREUR: null, ET: null, OU: null,   // évaluation paresseuse (ci-dessous)
    NON: function (a) { var b = booleen(seul(a[0])); return estErr(b) ? b : !b; },
    ARRONDI: function (a) { var n = nombre(seul(a[0])), d = nombre(seul(a[1])); return premiereErr(n, d) || arrondir(n, Math.round(d)); },
    'ARRONDI.SUP': function (a) { var n = nombre(seul(a[0])), d = Math.round(nombre(seul(a[1])) || 0), p = Math.pow(10, d); return premiereErr(n) || (n >= 0 ? Math.ceil(n * p - 1e-9) : -Math.ceil(-n * p - 1e-9)) / p; },
    'ARRONDI.INF': function (a) { var n = nombre(seul(a[0])), d = Math.round(nombre(seul(a[1])) || 0), p = Math.pow(10, d); return premiereErr(n) || (n >= 0 ? Math.floor(n * p + 1e-9) : -Math.floor(-n * p + 1e-9)) / p; },
    ENT: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || Math.floor(n); },
    ABS: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || Math.abs(n); },
    MOD: function (a) { var n = nombre(seul(a[0])), d = nombre(seul(a[1])); return premiereErr(n, d) || (d === 0 ? Err('#DIV/0!') : n - d * Math.floor(n / d)); },
    RACINE: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || (n < 0 ? Err('#NOMBRE!') : Math.sqrt(n)); },
    PUISSANCE: function (a) { var n = nombre(seul(a[0])), d = nombre(seul(a[1])); return premiereErr(n, d) || Math.pow(n, d); },
    CONCATENER: function (a) { var p = aPlat(a); return p.erreur || p.toutes.map(chaine).join(''); },
    CONCAT: function (a) { return FONCTIONS.CONCATENER(a); },
    GAUCHE: function (a) { var s = seul(a[0]), n = a[1] && !a[1].vide ? nombre(seul(a[1])) : 1; return premiereErr(s, n) || chaine(s).slice(0, Math.max(0, n)); },
    DROITE: function (a) { var s = seul(a[0]), n = a[1] && !a[1].vide ? nombre(seul(a[1])) : 1; return premiereErr(s, n) || (n <= 0 ? '' : chaine(s).slice(-n)); },
    STXT: function (a) { var s = seul(a[0]), d = nombre(seul(a[1])), n = nombre(seul(a[2])); return premiereErr(s, d, n) || chaine(s).substr(Math.max(0, d - 1), Math.max(0, n)); },
    NBCAR: function (a) { var s = seul(a[0]); return premiereErr(s) || chaine(s).length; },
    MAJUSCULE: function (a) { var s = seul(a[0]); return premiereErr(s) || chaine(s).toUpperCase(); },
    MINUSCULE: function (a) { var s = seul(a[0]); return premiereErr(s) || chaine(s).toLowerCase(); },
    SUPPRESPACE: function (a) { var s = seul(a[0]); return premiereErr(s) || chaine(s).trim().replace(/\s+/g, ' '); },
    ESTVIDE: function (a) { var s = seul(a[0]); return s === null || s === undefined || s === ''; },
    ESTNUM: function (a) { return typeof seul(a[0]) === 'number'; },
    ESTERREUR: function (a) { return estErr(seul(a[0])); },
    AUJOURDHUI: function (a, ctx) { return aujourdhui(ctx.maintenant); },
    DATE: function (a) { var y = nombre(seul(a[0])), m = nombre(seul(a[1])), j = nombre(seul(a[2])); return premiereErr(y, m, j) || Math.round((Date.UTC(y, m - 1, j) - ORIGINE) / 864e5); },
    ANNEE: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || dateDe(n).a; },
    MOIS: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || dateDe(n).m; },
    JOUR: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || dateDe(n).j; },
    JOURSEM: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || ((Math.floor(n) + 6) % 7) + 1; },   // 1 = dimanche
    JOURS: function (a) { var f = nombre(seul(a[0])), d = nombre(seul(a[1])); return premiereErr(f, d) || Math.floor(f) - Math.floor(d); },
    HEURE: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || Math.floor((n - Math.floor(n)) * 24 + 1e-9); },
    MINUTE: function (a) { var n = nombre(seul(a[0])); return premiereErr(n) || Math.floor(((n - Math.floor(n)) * 1440 + 1e-6) % 60); },
    RECHERCHEV: function (a) {
      var v = seul(a[0]), t = a[1] && a[1].plage, c = nombre(seul(a[2])), approx = a[3] && !a[3].vide ? booleen(seul(a[3])) : true;
      if (!t || estErr(c) || c < 1 || c > (t[0] || []).length) return Err('#REF!');
      var trouve = -1;
      for (var i = 0; i < t.length; i++) { var r = comparer(t[i][0], v); if (r === 0) { trouve = i; break; } if (approx === true && r < 0) trouve = i; if (approx === true && r > 0) break; }
      return trouve < 0 ? Err('#N/A') : (t[trouve][c - 1] === undefined ? null : t[trouve][c - 1]);
    }
  };
  var LIBELLES_FONCTIONS = Object.keys(FONCTIONS).sort();

  /**
   * Calcul d'un classeur : valeur de chaque case de chaque feuille (formules évaluées), références circulaires
   * signalées « #CYCLE! ». Retourne { valeur(feuille, l, c), erreurs }. `options.maintenant` : AUJOURDHUI().
   */
  function calculer(classeur, options) {
    var c = classeur, maintenant = options && options.maintenant, memo = c.feuilles.map(function () { return {}; }), enCours = {};
    var index = {}; c.feuilles.forEach(function (f, i) { index[f.nom.toLowerCase()] = i; });
    var arbres = {};
    function arbre(fi, k, f) { var cle = fi + '|' + k; if (arbres[cle] === undefined) { try { arbres[cle] = analyser(f); } catch (e) { arbres[cle] = { e: '#NOM?', message: e.message }; } } return arbres[cle]; }
    function valeur(fi, l, col) {
      var f = c.feuilles[fi]; if (!f) return Err('#REF!');
      if (l < 0 || col < 0 || l >= MAX_LIGNES || col >= MAX_COLONNES) return Err('#REF!');
      var k = nom(l, col), x = f.cellules[k];
      if (!x) return null;
      if (x.f === undefined) return x.v === undefined ? null : x.v;
      if (memo[fi][k] !== undefined) return memo[fi][k];
      var cle = fi + '|' + k;
      if (enCours[cle]) return Err('#CYCLE!');
      enCours[cle] = true;
      var r;
      try { r = evaluer(arbre(fi, k, x.f), fi); } catch (e) { r = Err('#VALEUR!'); }
      delete enCours[cle];
      if (r && r.plage) r = seul(r);
      if (typeof r === 'number' && !isFinite(r)) r = Err('#NOMBRE!');
      if (r === undefined) r = null;
      memo[fi][k] = r;
      return r;
    }
    function feuilleDe(ref, fi) { if (!ref.feuille) return fi; var i = index[ref.feuille.toLowerCase()]; return i === undefined ? -1 : i; }
    function plage(ref, fi) {
      var g = feuilleDe(ref, fi); if (g < 0) return Err('#REF!');
      var f = c.feuilles[g], e = etendue(f), l1, l2, c1, c2;
      if (ref.genre === 'plage') { l1 = Math.min(ref.d.l, ref.f.l); l2 = Math.max(ref.d.l, ref.f.l); c1 = Math.min(ref.d.c, ref.f.c); c2 = Math.max(ref.d.c, ref.f.c); }
      else if (ref.genre === 'cols') { c1 = Math.min(ref.d.c, ref.f.c); c2 = Math.max(ref.d.c, ref.f.c); l1 = 0; l2 = e.l - 1; }
      else { l1 = Math.min(ref.d.l, ref.f.l); l2 = Math.max(ref.d.l, ref.f.l); c1 = 0; c2 = e.c - 1; }
      if (l2 - l1 > MAX_LIGNES || c2 - c1 > MAX_COLONNES) return Err('#REF!');
      var res = [];
      for (var i = l1; i <= l2; i++) { var ligne = []; for (var j = c1; j <= c2; j++) ligne.push(valeur(g, i, j)); res.push(ligne); }
      return { plage: res };
    }
    function evaluer(a, fi) {
      if (a.n !== undefined) return a.n;
      if (a.s !== undefined) return a.s;
      if (a.b !== undefined) return a.b;
      if (a.e !== undefined) return Err(a.e);
      if (a.vide) return null;
      if (a.ref) {
        if (a.ref.genre === 'case') { var g = feuilleDe(a.ref, fi); return g < 0 ? Err('#REF!') : valeur(g, a.ref.d.l, a.ref.d.c); }
        return plage(a.ref, fi);
      }
      if (a.fn) {
        var nomf = a.fn;
        if (nomf === 'SI') {
          var cnd = booleen(seul(evaluer(a.args[0] || { vide: true }, fi)));
          if (estErr(cnd)) return cnd;
          var br = cnd ? a.args[1] : a.args[2];
          return br && !br.vide ? seul(evaluer(br, fi)) : (cnd ? true : false);
        }
        if (nomf === 'SIERREUR') { var v0 = seul(evaluer(a.args[0] || { vide: true }, fi)); return estErr(v0) ? seul(evaluer(a.args[1] || { vide: true }, fi)) : v0; }
        if (nomf === 'ET' || nomf === 'OU') {
          var vs = a.args.map(function (x) { return evaluer(x, fi); }), p = aPlat(vs);
          if (p.erreur) return p.erreur;
          var bs = p.toutes.filter(function (x) { return x !== null && x !== ''; }).map(booleen);
          var e2 = bs.filter(estErr)[0]; if (e2) return e2;
          return nomf === 'ET' ? bs.every(Boolean) : bs.some(Boolean);
        }
        var fn = FONCTIONS[nomf];
        if (!fn) return Err('#NOM?');
        return fn(a.args.map(function (x) { return evaluer(x, fi); }), { maintenant: maintenant });
      }
      if (a.op === 'neg') { var n0 = nombre(seul(evaluer(a.g, fi))); return estErr(n0) ? n0 : -n0; }
      if (a.op === '%') { var n1 = nombre(seul(evaluer(a.g, fi))); return estErr(n1) ? n1 : n1 / 100; }
      var x = seul(evaluer(a.g, fi)), y = seul(evaluer(a.d, fi));
      var er = premiereErr(x, y); if (er) return er;
      if (a.op === '&') return chaine(x) + chaine(y);
      if (['=', '<>', '<', '>', '<=', '>='].indexOf(a.op) >= 0) {
        var r = comparer(x, y);
        return a.op === '=' ? r === 0 : a.op === '<>' ? r !== 0 : a.op === '<' ? r < 0 : a.op === '>' ? r > 0 : a.op === '<=' ? r <= 0 : r >= 0;
      }
      var nx = nombre(x), ny = nombre(y); er = premiereErr(nx, ny); if (er) return er;
      if (a.op === '+') return nx + ny;
      if (a.op === '-') return nx - ny;
      if (a.op === '*') return nx * ny;
      if (a.op === '/') return ny === 0 ? Err('#DIV/0!') : nx / ny;
      if (a.op === '^') return Math.pow(nx, ny);
      return Err('#VALEUR!');
    }
    return {
      valeur: valeur,
      /** Message d'une formule mal écrite (null si elle se lit). */
      probleme: function (fi, k) { var x = c.feuilles[fi] && c.feuilles[fi].cellules[k]; if (!x || x.f === undefined) return null; var a = arbre(fi, k, x.f); return a.message || null; }
    };
  }
  /** Vérifie une formule tapée : null si elle se lit, sinon le message. */
  function verifier(formule) {
    try { var a = analyser(formule), inconnue = null; (function voir(n) { if (!n || inconnue) return; if (n.fn && !(n.fn in FONCTIONS)) inconnue = n.fn; ['g', 'd'].forEach(function (k) { voir(n[k]); }); (n.args || []).forEach(voir); })(a); return inconnue ? 'Fonction inconnue « ' + inconnue + ' ».' : null; } catch (e) { return e.message; }
  }

  // ------------------------------------------------------------ Affichage
  function groupes(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function decimales(n, d, mil) { var s = Math.abs(n).toFixed(d), p = s.split('.'); return (n < 0 && +s !== 0 ? '-' : '') + (mil ? groupes(p[0]) : p[0]) + (p[1] ? ',' + p[1] : ''); }
  /** Texte affiché d'une valeur selon le format de la case. */
  function afficher(v, s) {
    s = s || {};
    if (v === null || v === undefined) return '';
    if (estErr(v)) return v.err;
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'string') return v;
    var f = s.fmt || 'std', d = s.dec;
    if (f === 'texte') return chaine(v);
    if (f === 'date') { var x = dateDe(v); return String(x.j).padStart(2, '0') + '/' + String(x.m).padStart(2, '0') + '/' + x.a; }
    if (f === 'heure') { var mn = Math.round((v - Math.floor(v)) * 1440) % 1440; return String(Math.floor(mn / 60)).padStart(2, '0') + ':' + String(mn % 60).padStart(2, '0'); }
    if (f === 'pct') return decimales(v * 100, d === undefined ? 0 : d, s.mil) + ' %';
    if (f === 'eur') return decimales(v, d === undefined ? 2 : d, s.mil !== false) + ' €';
    if (f === 'nombre') return decimales(v, d === undefined ? 2 : d, !!s.mil);
    if (d !== undefined) return decimales(v, d, !!s.mil);
    var t = Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(6) : String(+v.toPrecision(12));
    t = t.replace('.', ',');
    return s.mil ? t.replace(/^-?\d+/, function (m) { return groupes(m); }) : t;
  }
  /** Alignement par défaut : nombres à droite, textes à gauche, booléens et erreurs au centre. */
  function alignement(v, s) { if (s && s.al) return s.al; if (typeof v === 'number') return 'd'; if (typeof v === 'boolean' || estErr(v)) return 'c'; return 'g'; }

  // ------------------------------------------------------------ Réécriture des références
  function ecrireRef(ref) {
    function q(n) { return /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'"; }
    var p = ref.feuille ? q(ref.feuille) + '!' : '';
    function cs(x) { return (x.absC ? '$' : '') + lettres(x.c) + (x.absL ? '$' : '') + (x.l + 1); }
    if (ref.genre === 'case') return p + cs(ref.d);
    if (ref.genre === 'plage') return p + cs(ref.d) + ':' + cs(ref.f);
    if (ref.genre === 'cols') return p + (ref.d.absC ? '$' : '') + lettres(ref.d.c) + ':' + (ref.f.absC ? '$' : '') + lettres(ref.f.c);
    return p + (ref.d.absL ? '$' : '') + (ref.d.l + 1) + ':' + (ref.f.absL ? '$' : '') + (ref.f.l + 1);
  }
  /** Réécrit chaque référence d'une formule : `fn(ref)` renvoie la référence modifiée, ou null pour « #REF! ». */
  function reecrire(formule, fn) {
    var t = String(formule), corps = t.replace(/^=/, ''), ts;
    try { ts = jetons(corps); } catch (e) { return t; }
    var res = '', pos = 0;
    ts.forEach(function (x) {
      if (x.t !== 'ref') return;
      var r = fn(JSON.parse(JSON.stringify(x.v)));
      res += corps.slice(pos, x.a) + (r ? ecrireRef(r) : '#REF!');
      pos = x.b;
    });
    return '=' + res + corps.slice(pos);
  }
  /** Recopie d'une formule de (dl, dc) cases : les références relatives sont décalées. */
  function decaler(formule, dl, dc) {
    return reecrire(formule, function (r) {
      function d(x) { if (x.l !== undefined && !x.absL) x.l += dl; if (x.c !== undefined && !x.absC) x.c += dc; return (x.l === undefined || (x.l >= 0 && x.l < MAX_LIGNES)) && (x.c === undefined || (x.c >= 0 && x.c < MAX_COLONNES)); }
      return d(r.d) && (!r.f || d(r.f)) ? r : null;
    });
  }
  /**
   * Insertion (n > 0) ou suppression (n < 0) de lignes (axe 'l') ou de colonnes (axe 'c') à partir de l'index `a` dans
   * la feuille `fi` : cases, largeurs, hauteurs et fusions déplacées ; références de toutes les feuilles mises à jour.
   */
  function inserer(classeur, fi, axe, a, n) {
    var c = JSON.parse(JSON.stringify(classeur)), f = c.feuilles[fi], nomF = f.nom.toLowerCase(), suppr = n < 0, k = Math.abs(n);
    var lim = axe === 'l' ? MAX_LIGNES : MAX_COLONNES;
    function deplace(i) { if (i < a) return i; if (suppr) return i < a + k ? null : i - k; return i + k < lim ? i + k : null; }
    // Cases
    var cs = {};
    Object.keys(f.cellules).forEach(function (key) { var p = lire(key), i = deplace(p[axe]); if (i === null) return; var q = { l: p.l, c: p.c }; q[axe] = i; cs[nom(q.l, q.c)] = f.cellules[key]; });
    f.cellules = cs;
    var tl = axe === 'l' ? 'hauteurs' : 'largeurs', nt = {};
    Object.keys(f[tl]).forEach(function (key) { var i = deplace(+key); if (i !== null) nt[i] = f[tl][key]; });
    f[tl] = nt;
    var nl = axe === 'l' ? 'l' : 'c', nn = axe === 'l' ? 'nl' : 'nc';
    f.fusions = f.fusions.map(function (u) {
      var d = u[nl], e = u[nl] + u[nn] - 1;
      if (!suppr) { if (d >= a) d += k; if (e >= a) e += k; }
      else { var d2 = d >= a + k ? d - k : d >= a ? a : d, e2 = e >= a + k ? e - k : e >= a ? a - 1 : e; d = d2; e = e2; }
      if (e < d) return null;
      var v = Object.assign({}, u); v[nl] = d; v[nn] = e - d + 1; return v.nl > 1 || v.nc > 1 ? v : null;
    }).filter(Boolean);
    // Références
    c.feuilles.forEach(function (g, gi) {
      Object.keys(g.cellules).forEach(function (key) {
        var x = g.cellules[key]; if (x.f === undefined) return;
        x.f = reecrire(x.f, function (r) {
          var cible = r.feuille ? r.feuille.toLowerCase() === nomF : gi === fi;
          if (!cible) return r;
          if ((axe === 'l' && r.genre === 'cols') || (axe === 'c' && r.genre === 'lignes')) return r;
          if (r.genre === 'case') { var i = deplace(r.d[axe]); if (i === null) return null; r.d[axe] = i; return r; }
          var d = Math.min(r.d[axe], r.f[axe]), e = Math.max(r.d[axe], r.f[axe]);
          if (!suppr) { if (d >= a) d += k; if (e >= a) e += k; if (e >= lim) e = lim - 1; if (d >= lim) return null; }
          else { if (d >= a && e < a + k) return null; d = d >= a + k ? d - k : d >= a ? a : d; e = e >= a + k ? e - k : e >= a ? a - 1 : e; }
          r.d[axe] = d; r.f[axe] = e; return r;
        });
      });
    });
    return c;
  }
  /** Nouveau nom d'une feuille : références des autres feuilles réécrites. */
  function renommerFeuille(classeur, fi, nouveau) {
    var c = JSON.parse(JSON.stringify(classeur)), ancien = c.feuilles[fi].nom.toLowerCase(), n = nomFeuille(nouveau, fi);
    if (c.feuilles.some(function (f, i) { return i !== fi && f.nom.toLowerCase() === n.toLowerCase(); })) throw new Error('Une autre feuille porte déjà ce nom.');
    c.feuilles[fi].nom = n;
    c.feuilles.forEach(function (g) { Object.keys(g.cellules).forEach(function (k) { var x = g.cellules[k]; if (x.f !== undefined) x.f = reecrire(x.f, function (r) { if (r.feuille && r.feuille.toLowerCase() === ancien) r.feuille = n; return r; }); }); });
    return c;
  }
  /** Suppression d'une feuille : ses références deviennent « #REF! ». */
  function supprimerFeuille(classeur, fi) {
    if (classeur.feuilles.length <= 1) throw new Error('Un classeur garde au moins une feuille.');
    var c = JSON.parse(JSON.stringify(classeur)), ancien = c.feuilles[fi].nom.toLowerCase();
    c.feuilles.splice(fi, 1);
    c.feuilles.forEach(function (g) { Object.keys(g.cellules).forEach(function (k) { var x = g.cellules[k]; if (x.f !== undefined) x.f = reecrire(x.f, function (r) { return r.feuille && r.feuille.toLowerCase() === ancien ? null : r; }); }); });
    return c;
  }
  /**
   * Tri des lignes l1..l2 (colonnes c1..c2) d'une feuille selon la colonne `col` (valeurs calculées) ; les formules
   * déplacées voient leurs références relatives décalées comme une recopie.
   */
  function trier(classeur, fi, plage, col, decroissant, options) {
    var c = JSON.parse(JSON.stringify(classeur)), f = c.feuilles[fi], calc = calculer(classeur, options), lignes = [];
    for (var i = plage.l1; i <= plage.l2; i++) { var cases = {}; for (var j = plage.c1; j <= plage.c2; j++) { var k = nom(i, j); if (f.cellules[k]) cases[j] = f.cellules[k]; delete f.cellules[k]; } lignes.push({ origine: i, cle: calc.valeur(fi, i, col), cases: cases }); }
    lignes.sort(function (a, b) {
      var va = a.cle, vb = b.cle, ea = va === null || va === '' || estErr(va), eb = vb === null || vb === '' || estErr(vb);
      if (ea || eb) return ea === eb ? a.origine - b.origine : ea ? 1 : -1;   // vides et erreurs à la fin
      var r = comparer(va, vb); return (decroissant ? -r : r) || a.origine - b.origine;
    });
    lignes.forEach(function (x, n) {
      var cible = plage.l1 + n;
      Object.keys(x.cases).forEach(function (j) { var y = JSON.parse(JSON.stringify(x.cases[j])); if (y.f !== undefined) y.f = decaler(y.f, cible - x.origine, 0); f.cellules[nom(cible, +j)] = y; });
    });
    return c;
  }

  // ------------------------------------------------------------ Texte, comparaison, collage
  /** Texte d'une feuille (cases non vides, valeurs calculées) : recherche, comparaison des versions. */
  function textesCases(classeur, options) {
    var calc = calculer(classeur, options), res = [];
    classeur.feuilles.forEach(function (f, fi) {
      Object.keys(f.cellules).sort(function (a, b) { var x = lire(a), y = lire(b); return x.l - y.l || x.c - y.c; }).forEach(function (k) {
        var x = f.cellules[k]; if (x.v === undefined && x.f === undefined) return;
        var p = lire(k); res.push({ feuille: f.nom, nom: k, saisie: texteSaisie(x), valeur: afficher(calc.valeur(fi, p.l, p.c), x.s) });
      });
    });
    return res;
  }
  /** Comparaison de deux versions : cases ajoutées, modifiées, retirées (« Feuille!B3 : 12 → 15 »). */
  function comparerClasseurs(a, b) {
    var ta = {}, tb = {}, res = [];
    textesCases(a).forEach(function (x) { ta[x.feuille + '!' + x.nom] = x.saisie; });
    textesCases(b).forEach(function (x) { tb[x.feuille + '!' + x.nom] = x.saisie; });
    var cles = Object.keys(Object.assign({}, ta, tb)).sort(function (x, y) { var p = x.split('!'), q = y.split('!'); if (p[0] !== q[0]) return p[0] < q[0] ? -1 : 1; var u = lire(p[1]), v = lire(q[1]); return u.l - v.l || u.c - v.c; });
    cles.forEach(function (k) {
      if (ta[k] === undefined) res.push({ etat: 'ajout', texte: k + ' : ' + tb[k] });
      else if (tb[k] === undefined) res.push({ etat: 'retrait', texte: k + ' : ' + ta[k] });
      else if (ta[k] !== tb[k]) res.push({ etat: 'modifie', texte: k + ' : ' + ta[k] + ' → ' + tb[k] });
    });
    var fa = a.feuilles.map(function (f) { return f.nom; }), fb = b.feuilles.map(function (f) { return f.nom; });
    fb.filter(function (n) { return fa.indexOf(n) < 0; }).forEach(function (n) { res.unshift({ etat: 'ajout', texte: 'Feuille ajoutée : ' + n }); });
    fa.filter(function (n) { return fb.indexOf(n) < 0; }).forEach(function (n) { res.unshift({ etat: 'retrait', texte: 'Feuille retirée : ' + n }); });
    return res;
  }
  /** Texte copié depuis un tableur (colonnes séparées par des tabulations, guillemets) → lignes de textes. */
  function lireTSV(t) {
    var lignes = [], ligne = [], champ = '', i = 0, q = false; t = String(t || '').replace(/\r\n?/g, '\n');
    if (t.slice(-1) === '\n') t = t.slice(0, -1);
    while (i < t.length) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { champ += '"'; i += 2; continue; } q = false; i++; continue; } champ += ch; i++; continue; }
      if (ch === '"' && champ === '') { q = true; i++; continue; }
      if (ch === '\t') { ligne.push(champ); champ = ''; i++; continue; }
      if (ch === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; i++; continue; }
      champ += ch; i++;
    }
    ligne.push(champ); lignes.push(ligne);
    return lignes.slice(0, MAX_LIGNES).map(function (l) { return l.slice(0, MAX_COLONNES); });
  }
  function ecrireTSV(lignes) { return lignes.map(function (l) { return l.map(function (x) { x = String(x == null ? '' : x); return /[\t\n"]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join('\t'); }).join('\n'); }

  return { MAX_LIGNES: MAX_LIGNES, MAX_COLONNES: MAX_COLONNES, MAX_FEUILLES: MAX_FEUILLES, FORMATS: FORMATS, TAILLES: TAILLES, FONCTIONS: LIBELLES_FONCTIONS,
    lettres: lettres, indexColonne: indexColonne, nom: nom, lire: lire, style: style, caseValide: caseValide, feuille: feuille, contenu: contenu, page: page, etendue: etendue, chevauche: chevauche,
    serieDepuis: serieDepuis, dateDe: dateDe, saisir: saisir, texteSaisie: texteSaisie, analyser: analyser, verifier: verifier, calculer: calculer, afficher: afficher, alignement: alignement, estErr: estErr,
    reecrire: reecrire, decaler: decaler, inserer: inserer, renommerFeuille: renommerFeuille, supprimerFeuille: supprimerFeuille, trier: trier,
    textesCases: textesCases, comparer: comparerClasseurs, lireTSV: lireTSV, ecrireTSV: ecrireTSV };
});
