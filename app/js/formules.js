// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — formules des colonnes calculées (0.19.2, décisions du porteur du 9 novembre 2026, plan « Vue d'ensemble »).
 *
 * Syntaxe proche d'Excel, fonctions en français, colonnes désignées par leur nom entre crochets, arguments séparés par
 * « ; » : SI([Mode]="SDT"; "tiers"; ""), JOURS([Date d'entrée]), [Lits] - [Présents]. Valeurs : nombres, textes, dates
 * (AAAA-MM-JJ), vrai ou faux, vide. Une formule ne lit que les colonnes de sa ligne que l'agent peut voir ; les calculs
 * sur toutes les lignes restent dans le bandeau de synthèse. Interprète écrit à la main (aucune évaluation de code :
 * la politique de sécurité de l'application l'interdit) ; erreurs explicites, affichées « ⚠ » dans la case.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).formules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JOUR = /^\d{4}-\d{2}-\d{2}$/;
  function ErreurFormule(message, position) { var e = new Error(message); e.formule = true; e.position = position; return e; }

  // ------------------------------------------------------------ Lecture (jetons)
  function jetons(t) {
    var res = [], i = 0, n = t.length;
    while (i < n) {
      var c = t[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '[') { var f = t.indexOf(']', i); if (f < 0) throw ErreurFormule('Crochet « ] » manquant après « ' + t.slice(i, i + 20) + ' ».', i); res.push({ t: 'col', v: t.slice(i + 1, f).trim(), p: i }); i = f + 1; continue; }
      if (c === '"' || c === '«' || c === '“') {
        var fin = c === '"' ? '"' : c === '«' ? '»' : '”', j = i + 1, s = '';
        while (j < n && t[j] !== fin) { s += t[j]; j++; }
        if (j >= n) throw ErreurFormule('Guillemet fermant manquant.', i);
        res.push({ t: 'txt', v: s.trim() === s ? s : s.replace(/^\s|\s$/g, ''), p: i }); i = j + 1; continue;
      }
      var m = /^\d+(?:[.,]\d+)?/.exec(t.slice(i));
      if (m) { res.push({ t: 'num', v: +m[0].replace(',', '.'), p: i }); i += m[0].length; continue; }
      m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*/.exec(t.slice(i));
      if (m) { res.push({ t: 'id', v: m[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), brut: m[0], p: i }); i += m[0].length; continue; }
      m = /^(<=|>=|<>|!=|[-+*\/&=<>();])/.exec(t.slice(i));
      if (m) { res.push({ t: 'op', v: m[0] === '!=' ? '<>' : m[0], p: i }); i += m[0].length; continue; }
      throw ErreurFormule('Caractère inattendu « ' + c + ' ».', i);
    }
    return res;
  }

  // ------------------------------------------------------------ Analyse (arbre)
  /** Arbre d'une formule ; lève une erreur explicite (position). */
  function analyser(texte) {
    var js = jetons(String(texte || '')), k = 0;
    if (!js.length) throw ErreurFormule('Formule vide.', 0);
    function voir() { return js[k]; }
    function prendre(v) { var x = js[k]; if (!x || x.v !== v) throw ErreurFormule('« ' + v + ' » attendu' + (x ? ' avant « ' + (x.brut || x.v) + ' »' : ' en fin de formule') + '.', x ? x.p : texte.length); k++; return x; }
    function comparaison() {
      var g = concat(), x = voir();
      if (x && x.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(x.v) >= 0) { k++; return { op: x.v, g: g, d: concat() }; }
      return g;
    }
    function concat() { var g = addition(); while (voir() && voir().v === '&') { k++; g = { op: '&', g: g, d: addition() }; } return g; }
    function addition() { var g = mult(); while (voir() && (voir().v === '+' || voir().v === '-')) { var o = js[k++].v; g = { op: o, g: g, d: mult() }; } return g; }
    function mult() { var g = unaire(); while (voir() && (voir().v === '*' || voir().v === '/')) { var o = js[k++].v; g = { op: o, g: g, d: unaire() }; } return g; }
    function unaire() { if (voir() && voir().v === '-') { k++; return { op: 'neg', g: unaire() }; } if (voir() && voir().v === '+') { k++; return unaire(); } return primaire(); }
    function primaire() {
      var x = voir();
      if (!x) throw ErreurFormule('Formule incomplète.', texte.length);
      k++;
      if (x.t === 'num') return { n: x.v };
      if (x.t === 'txt') return { s: x.v };
      if (x.t === 'col') { if (!x.v) throw ErreurFormule('Nom de colonne vide entre crochets.', x.p); return { col: x.v }; }
      if (x.v === '(') { var e = comparaison(); prendre(')'); return e; }
      if (x.t === 'id') {
        if (x.v === 'VRAI') return { b: true };
        if (x.v === 'FAUX') return { b: false };
        if (!FONCTIONS[x.v]) throw ErreurFormule('Fonction inconnue « ' + x.brut + ' ».' + (FONCTIONS[x.v + 'S'] ? ' Vouliez-vous ' + x.v + 'S ?' : ''), x.p);
        prendre('(');
        var args = [];
        if (voir() && voir().v !== ')') { args.push(comparaison()); while (voir() && voir().v === ';') { k++; args.push(comparaison()); } }
        prendre(')');
        var f = FONCTIONS[x.v];
        if (args.length < f.min || (f.max !== undefined && args.length > f.max)) throw ErreurFormule(x.v + ' : ' + (f.min === f.max ? f.min : f.min + (f.max === undefined ? ' ou plus' : ' à ' + f.max)) + ' argument(s) attendu(s), ' + args.length + ' donné(s).', x.p);
        return { f: x.v, args: args };
      }
      throw ErreurFormule('« ' + x.v + ' » inattendu.', x.p);
    }
    var arbre = comparaison();
    if (k < js.length) throw ErreurFormule('« ' + (js[k].brut || js[k].v) + ' » inattendu.', js[k].p);
    return arbre;
  }
  /** Noms des colonnes citées par une formule (analysée ou texte). */
  function references(a) {
    if (typeof a === 'string') a = analyser(a);
    var res = [];
    (function voir(n) { if (!n) return; if (n.col && res.indexOf(n.col) < 0) res.push(n.col); voir(n.g); voir(n.d); (n.args || []).forEach(voir); })(a);
    return res;
  }

  // ------------------------------------------------------------ Valeurs
  function vide(v) { return v === null || v === undefined || v === ''; }
  function estDate(v) { return typeof v === 'string' && JOUR.test(v); }
  function nombre(v, f) {
    if (v === true) return 1; if (v === false) return 0;
    if (vide(v)) return 0;
    if (typeof v === 'number') return v;
    var n = +String(v).replace(',', '.');
    if (!isFinite(n)) throw ErreurFormule((f ? f + ' : ' : '') + 'nombre attendu, « ' + v + ' » reçu.');
    return n;
  }
  function texte(v) {
    if (vide(v)) return '';
    if (v === true) return 'VRAI'; if (v === false) return 'FAUX';
    if (estDate(v)) return v.split('-').reverse().join('/');
    if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6).replace('.', ',');
    return String(v);
  }
  function booleen(v) { if (typeof v === 'boolean') return v; if (vide(v)) return false; if (typeof v === 'number') return v !== 0; return String(v).toUpperCase() !== 'FAUX' && String(v) !== '0'; }
  function jourEn(v, f) {
    if (estDate(v)) { var m = JOUR.exec(v); return Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)); }
    throw ErreurFormule((f ? f + ' : ' : '') + 'date attendue' + (vide(v) ? ' (case vide)' : ', « ' + v + ' » reçu') + '.');
  }
  function jourISO(utc) { var d = new Date(utc); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function aujourdhui(ctx) { var d = new Date(ctx.maintenant || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function egal(a, b) {
    if (typeof a === 'number' || typeof b === 'number') { try { return nombre(a) === nombre(b); } catch (e) { return false; } }
    return texte(a).toLowerCase() === texte(b).toLowerCase();
  }
  function comparer(a, b) {
    if (estDate(a) && estDate(b)) return a < b ? -1 : a > b ? 1 : 0;
    if ((typeof a === 'number' || typeof b === 'number') && !vide(a) && !vide(b)) { var x = nombre(a), y = nombre(b); return x < y ? -1 : x > y ? 1 : 0; }
    return texte(a).localeCompare(texte(b), 'fr');
  }

  /** Fonctions : { min, max, aide, exemple, f(args évalués, ctx) } ; `paresseux` : arguments évalués à la demande (SI). */
  var FONCTIONS = {
    SI: { min: 2, max: 3, paresseux: true, aide: 'Si la condition est vraie, première valeur, sinon seconde (vide si absente).', exemple: 'SI([Mode]="SDT"; "Tiers"; "")',
      f: function (a, ctx, ev) { return booleen(ev(a[0])) ? ev(a[1]) : (a.length > 2 ? ev(a[2]) : ''); } },
    SIERREUR: { min: 2, max: 2, paresseux: true, aide: 'Valeur, ou la seconde si le calcul échoue (case vide, texte au lieu d’un nombre…).', exemple: 'SIERREUR(JOURS([Sortie prévisionnelle]); "")',
      f: function (a, ctx, ev) { try { return ev(a[0]); } catch (e) { if (!e.formule) throw e; return ev(a[1]); } } },
    ET: { min: 1, aide: 'Vrai si toutes les conditions sont vraies.', exemple: 'ET([Sorties libres]; [Âge] >= 18)', f: function (a) { return a.every(booleen); } },
    OU: { min: 1, aide: 'Vrai si au moins une condition est vraie.', exemple: 'OU([Mode]="SDT"; [Mode]="SDTU")', f: function (a) { return a.some(booleen); } },
    NON: { min: 1, max: 1, aide: 'Inverse une condition.', exemple: 'NON([Sorties libres])', f: function (a) { return !booleen(a[0]); } },
    ESTVIDE: { min: 1, max: 1, aide: 'Vrai si la case est vide.', exemple: 'ESTVIDE([Médecin de 1re ligne])', f: function (a) { return vide(a[0]); } },
    AUJOURDHUI: { min: 0, max: 0, aide: 'Date du jour.', exemple: 'AUJOURDHUI()', f: function (a, ctx) { return aujourdhui(ctx); } },
    JOURS: { min: 1, max: 2, aide: 'Nombre de jours entre une date et aujourd’hui (ou une seconde date) : positif pour une date passée.', exemple: 'JOURS([Date d’entrée])',
      f: function (a, ctx) { var d1 = jourEn(a[0], 'JOURS'), d2 = a.length > 1 ? jourEn(a[1], 'JOURS') : jourEn(aujourdhui(ctx)); return Math.round((d2 - d1) / 864e5); } },
    AJOUTER_JOURS: { min: 2, max: 2, aide: 'Date décalée de n jours.', exemple: 'AJOUTER_JOURS([Date d’entrée]; 30)', f: function (a) { return jourISO(jourEn(a[0], 'AJOUTER_JOURS') + Math.round(nombre(a[1], 'AJOUTER_JOURS')) * 864e5); } },
    AGE: { min: 1, max: 1, aide: 'Âge en années révolues à partir d’une date de naissance.', exemple: 'AGE([Date de naissance])',
      f: function (a, ctx) { jourEn(a[0], 'AGE'); var n = a[0], t = aujourdhui(ctx), x = +t.slice(0, 4) - +n.slice(0, 4); if (t.slice(5) < n.slice(5)) x--; return x; } },
    DATE: { min: 3, max: 3, aide: 'Date à partir de l’année, du mois et du jour.', exemple: 'DATE(2026; 12; 31)', f: function (a) { return jourISO(Date.UTC(nombre(a[0]), nombre(a[1]) - 1, nombre(a[2]))); } },
    ANNEE: { min: 1, max: 1, aide: 'Année d’une date.', exemple: 'ANNEE([Date d’entrée])', f: function (a) { jourEn(a[0], 'ANNEE'); return +a[0].slice(0, 4); } },
    MOIS: { min: 1, max: 1, aide: 'Mois d’une date (1 à 12).', exemple: 'MOIS([Date d’entrée])', f: function (a) { jourEn(a[0], 'MOIS'); return +a[0].slice(5, 7); } },
    JOUR: { min: 1, max: 1, aide: 'Jour d’une date (1 à 31).', exemple: 'JOUR([Date d’entrée])', f: function (a) { jourEn(a[0], 'JOUR'); return +a[0].slice(8, 10); } },
    ARRONDI: { min: 1, max: 2, aide: 'Arrondi à n décimales (0 par défaut).', exemple: 'ARRONDI([Avancement] * 100)', f: function (a) { var p = Math.pow(10, a.length > 1 ? Math.round(nombre(a[1])) : 0); return Math.round(nombre(a[0], 'ARRONDI') * p) / p; } },
    MIN: { min: 1, aide: 'Plus petite valeur (cases vides ignorées).', exemple: 'MIN([Délai 1]; [Délai 2])', f: function (a) { var l = a.filter(function (x) { return !vide(x); }); return l.length ? l.reduce(function (m, x) { return comparer(x, m) < 0 ? x : m; }) : ''; } },
    MAX: { min: 1, aide: 'Plus grande valeur (cases vides ignorées).', exemple: 'MAX([Dernier entretien]; [Contrat de soins])', f: function (a) { var l = a.filter(function (x) { return !vide(x); }); return l.length ? l.reduce(function (m, x) { return comparer(x, m) > 0 ? x : m; }) : ''; } },
    SOMME: { min: 1, aide: 'Somme des nombres (cases vides comptées 0).', exemple: 'SOMME([Lits]; [Lits réservés])', f: function (a) { return a.reduce(function (s, x) { return s + nombre(x, 'SOMME'); }, 0); } },
    MOYENNE: { min: 1, aide: 'Moyenne des cases renseignées.', exemple: 'MOYENNE([Note 1]; [Note 2])', f: function (a) { var l = a.filter(function (x) { return !vide(x); }); return l.length ? l.reduce(function (s, x) { return s + nombre(x, 'MOYENNE'); }, 0) / l.length : ''; } },
    NB: { min: 1, aide: 'Nombre de cases renseignées parmi celles citées.', exemple: 'NB([Psychologue référent]; [Assistant(e) social(e)])', f: function (a) { return a.filter(function (x) { return !vide(x) && x !== false; }).length; } },
    CONCAT: { min: 1, aide: 'Textes mis bout à bout (comme « & »).', exemple: 'CONCAT([Chambre]; " — "; [Mode])', f: function (a) { return a.map(texte).join(''); } },
    MAJUSCULE: { min: 1, max: 1, aide: 'Texte en majuscules.', exemple: 'MAJUSCULE([Patient])', f: function (a) { return texte(a[0]).toUpperCase(); } },
    MINUSCULE: { min: 1, max: 1, aide: 'Texte en minuscules.', exemple: 'MINUSCULE([Mode])', f: function (a) { return texte(a[0]).toLowerCase(); } },
    GAUCHE: { min: 2, max: 2, aide: 'Premiers caractères d’un texte.', exemple: 'GAUCHE([Patient]; 3)', f: function (a) { return texte(a[0]).slice(0, Math.max(0, Math.round(nombre(a[1])))); } },
    LONGUEUR: { min: 1, max: 1, aide: 'Nombre de caractères d’un texte.', exemple: 'LONGUEUR([Commentaire])', f: function (a) { return texte(a[0]).length; } },
    CONTIENT: { min: 2, max: 2, aide: 'Vrai si le texte contient le mot cherché (sans tenir compte des majuscules).', exemple: 'CONTIENT([Activités]; "Piscine")', f: function (a) { return texte(a[0]).toLowerCase().indexOf(texte(a[1]).toLowerCase()) >= 0; } },
    TEXTE: { min: 1, max: 1, aide: 'Valeur écrite en texte (date au format JJ/MM/AAAA).', exemple: 'TEXTE([Date d’entrée])', f: function (a) { return texte(a[0]); } }
  };

  /**
   * Évalue une formule (texte ou arbre). ctx : { valeur(nom de colonne) → valeur brute (lève une erreur si la colonne
   * est inconnue ou invisible), maintenant }. Rend la valeur ; lève une erreur explicite (`formule: true`).
   */
  function evaluer(a, ctx) {
    if (typeof a === 'string') a = analyser(a);
    ctx = ctx || {};
    var profondeur = 0;
    function ev(n) {
      if (++profondeur > 2000) throw ErreurFormule('Formule trop longue.');
      if (n.n !== undefined) return n.n;
      if (n.s !== undefined) return n.s;
      if (n.b !== undefined) return n.b;
      if (n.col !== undefined) {
        if (typeof ctx.valeur !== 'function') throw ErreurFormule('Colonne « ' + n.col + ' » non disponible.');
        var v = ctx.valeur(n.col);
        return v === undefined ? null : v;
      }
      if (n.f) { var f = FONCTIONS[n.f]; return f.paresseux ? f.f(n.args, ctx, ev) : f.f(n.args.map(ev), ctx, ev); }
      var g = ev(n.g);
      if (n.op === 'neg') return -nombre(g);
      var d = ev(n.d);
      switch (n.op) {
        case '&': return texte(g) + texte(d);
        case '+':
          if (estDate(g) && !estDate(d)) return jourISO(jourEn(g) + Math.round(nombre(d)) * 864e5);
          return nombre(g, '+') + nombre(d, '+');
        case '-':
          if (estDate(g) && estDate(d)) return Math.round((jourEn(g) - jourEn(d)) / 864e5);
          if (estDate(g)) return jourISO(jourEn(g) - Math.round(nombre(d)) * 864e5);
          return nombre(g, '-') - nombre(d, '-');
        case '*': return nombre(g, '*') * nombre(d, '*');
        case '/': var y = nombre(d, '/'); if (y === 0) throw ErreurFormule('Division par zéro.'); return nombre(g, '/') / y;
        case '=': return egal(g, d);
        case '<>': return !egal(g, d);
        case '<': return comparer(g, d) < 0;
        case '>': return comparer(g, d) > 0;
        case '<=': return comparer(g, d) <= 0;
        case '>=': return comparer(g, d) >= 0;
      }
      throw ErreurFormule('Opération inconnue.');
    }
    return ev(a);
  }
  /** Contrôle d'une formule à l'enregistrement : syntaxe, et colonnes citées parmi `colonnes` (noms) si fourni. */
  function verifier(texteFormule, colonnes) {
    var a = analyser(texteFormule);
    if (colonnes) references(a).forEach(function (c) { if (!colonnes.some(function (x) { return x.toLowerCase() === c.toLowerCase(); })) throw ErreurFormule('Colonne inconnue « ' + c + ' ».'); });
    return a;
  }

  /**
   * Formules prêtes (décision 31) : on choisit les champs à calculer, la formule s'écrit d'elle-même.
   * champs : [{ nom, libelle, types (types de valeur acceptés) }] ; modele : texte où {nom} est remplacé par [Colonne].
   */
  var PRETES = [
    { id: 'jours-depuis', libelle: 'Jours écoulés depuis une date', champs: [{ nom: 'date', libelle: 'Date', types: ['date', 'dateFenetre'] }], modele: 'JOURS({date})' },
    { id: 'jours-avant', libelle: 'Jours restants avant une date', champs: [{ nom: 'date', libelle: 'Date', types: ['date', 'dateFenetre'] }], modele: '-JOURS({date})' },
    { id: 'jour-hospitalisation', libelle: 'Jour d’hospitalisation (J n)', champs: [{ nom: 'entree', libelle: 'Date d’entrée', types: ['date'] }], modele: '"J" & JOURS({entree})' },
    { id: 'age', libelle: 'Âge', champs: [{ nom: 'naissance', libelle: 'Date de naissance', types: ['date'] }], modele: 'AGE({naissance})' },
    { id: 'echeance', libelle: 'Date d’échéance (date + n jours)', champs: [{ nom: 'date', libelle: 'Date de départ', types: ['date'] }, { nom: 'n', libelle: 'Nombre de jours', nombre: true }], modele: 'AJOUTER_JOURS({date}; {n})' },
    { id: 'ecart', libelle: 'Écart en jours entre deux dates', champs: [{ nom: 'd1', libelle: 'Première date', types: ['date', 'dateFenetre'] }, { nom: 'd2', libelle: 'Seconde date', types: ['date', 'dateFenetre'] }], modele: 'JOURS({d1}; {d2})' },
    { id: 'avancement', libelle: 'Avancement d’une check-list (%)', champs: [{ nom: 'liste', libelle: 'Check-list', types: ['checklist'] }], modele: 'ARRONDI({liste} * 100)' },
    { id: 'renseignees', libelle: 'Nombre de cases renseignées', champs: [{ nom: 'a', libelle: 'Première donnée', types: [] }, { nom: 'b', libelle: 'Deuxième donnée', types: [] }, { nom: 'c', libelle: 'Troisième donnée (facultatif)', types: [], facultatif: true }], modele: 'NB({a}; {b}; {c})' },
    { id: 'si-vide', libelle: 'Mention si une donnée est vide', champs: [{ nom: 'a', libelle: 'Donnée', types: [] }, { nom: 'texte', libelle: 'Mention', texte: true }], modele: 'SI(ESTVIDE({a}); {texte}; "")' },
    { id: 'somme', libelle: 'Somme de deux nombres', champs: [{ nom: 'a', libelle: 'Premier nombre', types: ['nombre', 'formule'] }, { nom: 'b', libelle: 'Second nombre', types: ['nombre', 'formule'] }], modele: '{a} + {b}' }
  ];
  /** Formule écrite à partir d'une formule prête et des choix : { nom: 'Libellé de colonne' | nombre | texte }. */
  function depuisPrete(id, choix) {
    var p = PRETES.filter(function (x) { return x.id === id; })[0];
    if (!p) throw ErreurFormule('Formule prête inconnue.');
    var t = p.modele;
    p.champs.forEach(function (c) {
      var v = (choix || {})[c.nom];
      var r = c.nombre ? String(nombre(v)) : c.texte ? '"' + String(v || '').replace(/"/g, '') + '"' : (vide(v) ? (c.facultatif ? '' : null) : '[' + v + ']');
      if (r === null) throw ErreurFormule('Choisissez « ' + c.libelle + ' ».');
      t = t.split('{' + c.nom + '}').join(r);
    });
    return t.replace(/;\s*\)/g, ')').replace(/;\s*;/g, ';');
  }

  return { analyser: analyser, evaluer: evaluer, references: references, verifier: verifier, FONCTIONS: FONCTIONS, PRETES: PRETES, depuisPrete: depuisPrete, texte: texte };
});
