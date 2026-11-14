// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — mesure d'usage anonyme (lot O, phase 1 du plan d'action du porteur, 14 novembre 2026).
 *
 * Pour évaluer le pilote : nombre de saisies par module et par semaine, calculé à partir du journal existant (aucune
 * donnée nouvelle n'est enregistrée), et nombre d'agents ayant saisi chaque semaine, jamais leur identité. Une
 * semaine où moins de `seuil` agents ont saisi n'affiche pas ce nombre (pour qu'on ne reconnaisse personne).
 * Fonction soumise à avis (onglet « Validations » : représentants du personnel, délégué à la protection des données),
 * livrée désactivée. Aucun suivi individuel de l'activité des agents.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).usage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var JOUR = 864e5, SEUIL = 3;

  /** Lundi (minuit, heure locale) de la semaine d'un instant. */
  function lundi(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  /** Numéro de semaine ISO 8601 d'un instant. */
  function numeroSemaine(t) {
    var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var s1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - s1.getTime()) / JOUR - 3 + ((s1.getDay() + 6) % 7)) / 7);
  }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /**
   * Mesure. `saisies` : [{ module, at (ISO), by }] ; `modules` : [{ id, libelle }] dans l'ordre d'affichage.
   * Renvoie { semaines: [{ debut, libelle }], modules: [{ id, libelle, comptes, total }], agents: [nombre | null], seuil }.
   */
  function mesurer(saisies, modules, maintenant, o) {
    o = o || {};
    var n = Math.max(1, Math.min(52, Math.round(o.semaines || 12))), seuil = o.seuil || SEUIL;
    var fin = lundi(maintenant), semaines = [];
    for (var i = n - 1; i >= 0; i--) { var d = new Date(fin); d.setDate(d.getDate() - 7 * i); semaines.push({ debut: d.getTime() }); }
    semaines.forEach(function (s) { s.libelle = 'S' + numeroSemaine(s.debut) + ' (' + jourISO(s.debut).slice(5).split('-').reverse().join('/') + ')'; });
    var index = {}, lignes = (modules || []).map(function (m) { var l = { id: m.id, libelle: m.libelle, comptes: semaines.map(function () { return 0; }), total: 0 }; index[m.id] = l; return l; });
    var agents = semaines.map(function () { return {}; });
    var debut = semaines[0].debut, limite = fin + 7 * JOUR;
    (saisies || []).forEach(function (e) {
      var t = Date.parse(e.at);
      if (!(t >= debut && t < limite)) return;
      var k = semaines.length - 1;
      while (k > 0 && t < semaines[k].debut) k--;
      var l = index[e.module];
      if (!l) return;
      l.comptes[k]++; l.total++;
      if (e.by) agents[k][e.by] = 1;
    });
    return { semaines: semaines, modules: lignes, agents: agents.map(function (a) { var c = Object.keys(a).length; return c >= seuil ? c : null; }), seuil: seuil };
  }

  /** Lignes de l'export (CSV). */
  function lignesExport(m) {
    return [['Module'].concat(m.semaines.map(function (s) { return s.libelle; }), ['Total'])]
      .concat(m.modules.map(function (l) { return [l.libelle].concat(l.comptes, [l.total]); }))
      .concat([['Agents ayant saisi'].concat(m.agents.map(function (a) { return a === null ? 'moins de ' + m.seuil : a; }), [''])]);
  }

  return { mesurer: mesurer, lignesExport: lignesExport, numeroSemaine: numeroSemaine, lundi: lundi, SEUIL: SEUIL };
});
