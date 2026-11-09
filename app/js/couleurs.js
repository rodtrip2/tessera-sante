// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — réglages attachés à une donnée : délais et couleurs (0.18.0, décisions du porteur du 9 novembre 2026).
 *
 * Une donnée (champ de la fiche, donnée d'un module, donnée ajoutée) peut porter des réglages appliqués partout où elle
 * apparaît : un délai (en jours, éventuellement selon la durée d'hospitalisation) et des règles de couleur évaluées
 * dans l'ordre ; la première règle vraie l'emporte. Réglage commun `reglagesDonnees` (journal du socle) :
 *   { <code de la donnée>: { '*': { regles, delai }, <service>: { regles, delai } } }
 * L'établissement règle '*', chaque service peut le remplacer pour lui-même (le cadre pour ses services). Sans réglage,
 * les règles proposées par la donnée elle-même s'appliquent (ex. délais du Suivi médical). Une vue peut ajouter des
 * règles propres, évaluées avant celles de la donnée.
 *
 * Règle : { si: { op, valeur, n }, couleur (code de la palette), rendu ('fond' | 'texte' | 'pastille'), libelle (légende) }.
 * Chaque couleur a un équivalent en noir et blanc (nuance de gris et symbole) pour l'impression.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).couleurs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PALETTE = [
    { code: 'vert', libelle: 'Vert', symbole: '●', gris: 85 },
    { code: 'jaune', libelle: 'Jaune', symbole: '▲', gris: 92 },
    { code: 'orange', libelle: 'Orange', symbole: '◆', gris: 70 },
    { code: 'rouge', libelle: 'Rouge', symbole: '■', gris: 45 },
    { code: 'bleu', libelle: 'Bleu', symbole: '★', gris: 60 },
    { code: 'violet', libelle: 'Violet', symbole: '✚', gris: 55 },
    { code: 'rose', libelle: 'Rose', symbole: '♥', gris: 80 },
    { code: 'turquoise', libelle: 'Turquoise', symbole: '▼', gris: 75 },
    { code: 'brun', libelle: 'Brun', symbole: '◐', gris: 50 },
    { code: 'gris', libelle: 'Gris', symbole: '○', gris: 88 }
  ];
  var CODES = {};
  PALETTE.forEach(function (c) { CODES[c.code] = c; });
  var RENDUS = { fond: 'Fond de la case', texte: 'Couleur du texte', pastille: 'Pastille' };

  /** Conditions proposées ; `pour` : types de données concernés (vide : tous). */
  var CONDITIONS = {
    toujours: { libelle: 'Toujours (couleur par défaut)', pour: [] },
    egal: { libelle: 'Est égal à', valeur: true, pour: [] },
    different: { libelle: 'Est différent de', valeur: true, pour: [] },
    contient: { libelle: 'Contient', valeur: true, pour: ['texte', 'choixMultiple', 'notes', 'liste'] },
    vide: { libelle: 'N’est pas renseigné', pour: [] },
    rempli: { libelle: 'Est renseigné', pour: [] },
    coche: { libelle: 'Est coché (oui)', pour: ['ouiNon'] },
    nonCoche: { libelle: 'N’est pas coché (non)', pour: ['ouiNon'] },
    depuisPlusDe: { libelle: 'Date passée depuis plus de n jours', n: true, pour: ['date', 'dateFenetre'] },
    depuisMoinsDe: { libelle: 'Date passée depuis n jours ou moins', n: true, pour: ['date', 'dateFenetre'] },
    dansMoinsDe: { libelle: 'Date à venir dans n jours ou moins', n: true, pour: ['date', 'dateFenetre'] },
    echeanceDepassee: { libelle: 'Délai de la donnée dépassé', pour: ['date', 'dateFenetre'] },
    echeanceDans: { libelle: 'Délai de la donnée atteint dans n jours ou moins', n: true, pour: ['date', 'dateFenetre'] },
    superieur: { libelle: 'Supérieur à', n: true, pour: ['nombre', 'formule'] },
    inferieur: { libelle: 'Inférieur à', n: true, pour: ['nombre', 'formule'] },
    avancementMoins: { libelle: 'Check-list : moins de n % fait', n: true, pour: ['checklist'] },
    complete: { libelle: 'Check-list complète', pour: ['checklist'] },
    importance: { libelle: 'Note la plus importante', valeur: true, pour: ['notes'] }
  };

  function entier(v, min, max, d) { var n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : d; }
  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }

  function regle(r) {
    if (!r || !r.si || !CONDITIONS[r.si.op] || !CODES[r.couleur]) return null;
    var c = CONDITIONS[r.si.op], si = { op: r.si.op };
    if (c.valeur) si.valeur = r.si.valeur === undefined || r.si.valeur === null ? '' : (typeof r.si.valeur === 'object' ? JSON.parse(JSON.stringify(r.si.valeur)) : r.si.valeur);
    if (c.n) si.n = entier(r.si.n, -3650, 3650, 0);
    return { si: si, couleur: r.couleur, rendu: RENDUS[r.rendu] ? r.rendu : 'fond', libelle: texte(r.libelle, 60) };
  }
  function regles(l) { return (Array.isArray(l) ? l : []).map(regle).filter(Boolean); }
  /** Délai : { jours } ou { tranches: [{ jusqua (jour d'hospitalisation, null : au-delà), jours }] } ; null sans délai. */
  function delai(d) {
    if (!d || typeof d !== 'object') return null;
    if (Array.isArray(d.tranches) && d.tranches.length) {
      var tr = d.tranches.map(function (t) { return { jusqua: t && t.jusqua !== null && t.jusqua !== undefined && t.jusqua !== '' ? entier(t.jusqua, 0, 3650, null) : null, jours: entier(t && t.jours, 0, 3650, 7) }; })
        .filter(function (t, i, l) { return t.jusqua !== null || i === l.length - 1; });
      tr.sort(function (a, b) { return (a.jusqua === null ? 1e9 : a.jusqua) - (b.jusqua === null ? 1e9 : b.jusqua); });
      return tr.length ? { tranches: tr } : null;
    }
    var j = entier(d.jours, 0, 3650, null);
    return j === null ? null : { jours: j };
  }
  function bloc(b) { return b && typeof b === 'object' ? { regles: regles(b.regles), delai: delai(b.delai) } : null; }

  /**
   * Réglages en vigueur d'une donnée pour un service : celui du service s'il existe, sinon celui de l'établissement,
   * sinon ceux que la donnée propose (`defaut` : { regles, delai }). { regles, delai, source: 'service' | 'etablissement' | 'defaut' }.
   */
  function reglages(config, code, service, defaut) {
    var r = ((config && config.reglagesDonnees) || {})[code] || {};
    var sv = service && bloc(r[service]), et = bloc(r['*']), df = bloc(defaut) || { regles: [], delai: null };
    if (sv) return Object.assign(sv, { source: 'service' });
    if (et) return Object.assign(et, { source: 'etablissement' });
    return Object.assign(df, { source: 'defaut' });
  }
  /** Délai applicable (jours) selon le jour d'hospitalisation ; null sans délai. */
  function delaiPour(d, jourHospitalisation) {
    if (!d) return null;
    if (d.jours !== undefined) return d.jours;
    var j = jourHospitalisation === null || jourHospitalisation === undefined ? 0 : jourHospitalisation;
    var t = d.tranches.filter(function (x) { return x.jusqua === null || j <= x.jusqua; })[0] || d.tranches[d.tranches.length - 1];
    return t.jours;
  }

  function jourDe(v) {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if (typeof v === 'object' && v.debut) return v.debut;
    return null;
  }
  function ecartJours(jour, maintenant) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour || ''); if (!m) return null;
    var d = new Date(maintenant || Date.now()), a = Date.UTC(+m[1], +m[2] - 1, +m[3]), b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((b - a) / 864e5);   // > 0 : date passée
  }
  function egal(a, b) {
    if (a && typeof a === 'object' && a.nom !== undefined) a = a.nom;
    if (Array.isArray(a)) return a.map(String).indexOf(String(b)) >= 0;
    return String(a === null || a === undefined ? '' : a).toLowerCase() === String(b === null || b === undefined ? '' : b).toLowerCase();
  }
  function vide(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length); }

  /**
   * Une condition est-elle vraie ? ctx : { valeur (valeur affichée ou brute : texte, nombre, date ISO, booléen, liste),
   * jours (jours écoulés depuis la date, calculé sinon), restants (jours avant l'échéance du délai), avancement (0 à 1),
   * importance ('' | info | important | urgent), cle (identifiant comparé avant le libellé : ex. identifiant du médecin) }.
   */
  function vraie(si, ctx) {
    var v = ctx.valeur, j = ctx.jours !== undefined ? ctx.jours : ecartJours(jourDe(v), ctx.maintenant);
    switch (si.op) {
      case 'toujours': return true;
      case 'egal': return (ctx.cle !== undefined && egal(ctx.cle, si.valeur)) || egal(v, si.valeur);
      case 'different': return !((ctx.cle !== undefined && egal(ctx.cle, si.valeur)) || egal(v, si.valeur));
      case 'contient': return !vide(v) && (Array.isArray(v) ? v.join(' ') : String(v && v.nom !== undefined ? v.nom : v)).toLowerCase().indexOf(String(si.valeur).toLowerCase()) >= 0;
      case 'vide': return vide(v);
      case 'rempli': return !vide(v);
      case 'coche': return v === true || v === 1;
      case 'nonCoche': return v === false || v === 0;
      case 'depuisPlusDe': return j !== null && j > si.n;
      case 'depuisMoinsDe': return j !== null && j >= 0 && j <= si.n;
      case 'dansMoinsDe': return j !== null && j <= 0 && -j <= si.n;
      case 'echeanceDepassee': return ctx.restants !== null && ctx.restants !== undefined && ctx.restants < 0;
      case 'echeanceDans': return ctx.restants !== null && ctx.restants !== undefined && ctx.restants >= 0 && ctx.restants <= si.n;
      case 'superieur': return !vide(v) && isFinite(+v) && +v > si.n;
      case 'inferieur': return !vide(v) && isFinite(+v) && +v < si.n;
      case 'avancementMoins': return ctx.avancement !== null && ctx.avancement !== undefined && ctx.avancement * 100 < si.n;
      case 'complete': return ctx.avancement === 1;
      case 'importance': return !!ctx.importance && ctx.importance === si.valeur;
    }
    return false;
  }
  /**
   * Couleur d'une case : première règle vraie parmi `reglesVue` (règles propres à une vue) puis `reglesDonnee`.
   * { couleur, rendu, libelle, symbole, gris } ou null.
   */
  function evaluer(reglesDonnee, ctx, reglesVue) {
    var l = regles(reglesVue).concat(regles(reglesDonnee));
    for (var i = 0; i < l.length; i++) {
      if (vraie(l[i].si, ctx || {})) { var p = CODES[l[i].couleur]; return { couleur: p.code, rendu: l[i].rendu, libelle: l[i].libelle, symbole: p.symbole, gris: p.gris }; }
    }
    return null;
  }
  /** Contexte d'une date avec délai : jours écoulés et jours restants avant l'échéance. */
  function contexteDate(valeur, d, jourHospitalisation, maintenant) {
    var j = ecartJours(jourDe(valeur), maintenant), dl = delaiPour(d, jourHospitalisation);
    return { valeur: valeur, jours: j, delai: dl, restants: dl === null ? null : (j === null ? (jourHospitalisation !== null && jourHospitalisation !== undefined ? dl - jourHospitalisation : null) : dl - j), maintenant: maintenant };
  }
  /** Règles proposées pour une date soumise à un délai : vert, jaune (≤ 3 jours), orange (≤ 1 jour), rouge (dépassé). */
  function reglesEcheance() {
    return [
      { si: { op: 'echeanceDepassee' }, couleur: 'rouge', rendu: 'fond', libelle: 'Délai dépassé' },
      { si: { op: 'echeanceDans', n: 1 }, couleur: 'orange', rendu: 'fond', libelle: 'Échéance dans 1 jour ou moins' },
      { si: { op: 'echeanceDans', n: 3 }, couleur: 'jaune', rendu: 'fond', libelle: 'Échéance dans 3 jours ou moins' },
      { si: { op: 'rempli' }, couleur: 'vert', rendu: 'fond', libelle: 'À jour' }
    ];
  }
  /** Légende des règles d'une donnée (et d'une vue) : [{ couleur, symbole, libelle }]. */
  function legende(reglesDonnee, reglesVue) {
    var vus = {};
    return regles(reglesVue).concat(regles(reglesDonnee)).map(function (r) {
      var p = CODES[r.couleur], l = r.libelle || libelleRegle(r);
      var k = r.couleur + '|' + l; if (vus[k]) return null; vus[k] = true;
      return { couleur: r.couleur, symbole: p.symbole, gris: p.gris, libelle: l, rendu: r.rendu };
    }).filter(Boolean);
  }
  function libelleRegle(r) {
    var c = CONDITIONS[r.si.op];
    return c.libelle.replace(' n ', ' ' + (r.si.n === undefined ? 'n' : r.si.n) + ' ') + (c.valeur ? ' « ' + (r.si.valeur && r.si.valeur.nom !== undefined ? r.si.valeur.nom : r.si.valeur) + ' »' : '');
  }
  /**
   * Réglages d'une donnée écrits par le cadre : seulement pour ses services (l'établissement reste à l'administrateur).
   * Renvoie true ou false.
   */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object') return false;
    var a = ancien || {}, codes = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { codes[k] = 1; });
    return Object.keys(codes).every(function (code) {
      var x = a[code] || {}, y = nouveau[code] || {}, cles = {};
      Object.keys(x).concat(Object.keys(y)).forEach(function (k) { cles[k] = 1; });
      return Object.keys(cles).every(function (k) { return JSON.stringify(x[k]) === JSON.stringify(y[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
    });
  }

  return { PALETTE: PALETTE, CODES: CODES, RENDUS: RENDUS, CONDITIONS: CONDITIONS, regle: regle, regles: regles, delai: delai, reglages: reglages, delaiPour: delaiPour,
    vraie: vraie, evaluer: evaluer, contexteDate: contexteDate, ecartJours: ecartJours, reglesEcheance: reglesEcheance, legende: legende, libelleRegle: libelleRegle, controlerCadre: controlerCadre };
});
