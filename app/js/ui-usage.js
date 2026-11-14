// SPDX-License-Identifier: EUPL-1.2
/*
 * Interface — mesure d'usage anonyme (lot O, 14 novembre 2026). Logique : usage.js.
 * Onglet « Mesure d'usage » de la fenêtre Administration : l'administrateur (tous les services) et le cadre (ses
 * services), quand la fonction est activée dans l'onglet « Validations » (désactivée par défaut).
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h, G = SIC.usage, V = SIC.validations;
  function s() { return U.App.session; }
  function roles() { try { return s().roles(); } catch (e) { return []; } }
  function admin() { return roles().indexOf('ADMIN') >= 0; }
  function active() { return V.actif(U.config(), 'mesure-usage'); }
  /** Onglet affiché : l'administrateur toujours (pour l'activer), le cadre quand la fonction est activée. */
  function consultable() { return admin() || (roles().indexOf('CADRE') >= 0 && active()); }

  /** Saisies lisibles par l'agent, rangées par module ; pour le cadre, seulement celles de ses services. */
  function saisies() {
    var res = [], mods = [], sv = U.services().map(function (x) { return x.code; }), tous = admin();
    SIC.modules.liste().filter(function (m) { return m.reference; }).concat(SIC.modules.affiches()).forEach(function (m) {
      var e = null;
      try { e = s().detientCle && s().detientCle(m.id) ? s().etatModule(m.id) : null; } catch (err) { e = null; }
      if (!e || !e.parId) return;
      mods.push({ id: m.id, libelle: m.libelle });
      Object.keys(e.parId).forEach(function (k) {
        var x = e.parId[k], y = SIC.modules.moduleDuType(x.type);
        if (!y || y.id !== m.id || (e.annules && e.annules[k])) return;
        if (!tous && m.saisies.cibles) { var c = []; try { c = m.saisies.cibles(e, x) || []; } catch (err) { c = []; } if (c.length && !c.some(function (z) { return sv.indexOf(z) >= 0; })) return; }
        res.push({ module: m.id, at: x.at, by: x.by });
      });
    });
    return { saisies: res, modules: mods };
  }

  function vue() {
    if (!consultable()) return h('p', { class: 'muted', text: 'Mesure d’usage non activée.' });
    if (!active()) return h('div', { class: 'pile' }, h('h1', { text: 'Mesure d’usage' }),
      h('section', { class: 'panneau' }, h('p', { text: 'La mesure d’usage anonyme est désactivée. Elle compte les saisies par module et par semaine, et le nombre d’agents ayant saisi, jamais leur identité, à partir du journal existant.' }),
        h('p', { class: 'muted', text: 'Avant de l’activer : information des agents et des représentants du personnel, avis du délégué à la protection des données. Activation dans l’onglet « Validations ».' }),
        h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: function () { U.validations.ouvrir(); } }, 'Ouvrir les validations'))));
    var d = saisies(), m = G.mesurer(d.saisies, d.modules, Date.now(), { semaines: 12 });
    var max = Math.max.apply(null, [1].concat(m.modules.map(function (l) { return Math.max.apply(null, l.comptes); })));
    function cellule(n) {
      var barre = h('span', { class: 'usage-barre', 'aria-hidden': 'true' });
      barre.style.setProperty('--part', String(Math.round(100 * n / max)) + '%');   // CSSOM (pas d'attribut style)
      return h('td', { class: 'nombre' }, h('span', { text: String(n) }), barre);
    }
    var lignes = m.modules.filter(function (l) { return l.total; });
    return h('div', { class: 'pile' },
      h('div', { class: 'barre' }, h('h1', { text: 'Mesure d’usage' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { exporter(m); } }, 'Exporter (tableur)')),
      h('p', { class: 'muted', text: 'Saisies des 12 dernières semaines, par module' + (admin() ? '' : ', dans vos services') + ', calculées à partir du journal. Le nombre d’agents ayant saisi n’est affiché qu’à partir de ' + m.seuil + ' agents ; aucune donnée ne permet de suivre un agent.' }),
      lignes.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'usage-table' },
        h('thead', {}, h('tr', {}, [h('th', { text: 'Module' })].concat(m.semaines.map(function (x) { return h('th', { text: x.libelle }); }), [h('th', { text: 'Total' })]))),
        h('tbody', {}, lignes.map(function (l) { return h('tr', {}, [h('td', { text: l.libelle })].concat(l.comptes.map(cellule), [h('td', { class: 'nombre' }, h('b', { text: String(l.total) }))])); })
          .concat([h('tr', { class: 'usage-agents' }, [h('td', {}, h('b', { text: 'Agents ayant saisi' }))].concat(m.agents.map(function (a) { return h('td', { class: 'nombre', text: a === null ? '< ' + m.seuil : String(a) }); }), [h('td')]))])))) : h('p', { class: 'muted', text: 'Aucune saisie sur la période.' }));
  }
  function exporter(m) {
    var csv = '﻿' + G.lignesExport(m).map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var d = new Date();
    U.exporter('usage', 'mesure_usage_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.csv', csv, 'text/csv;charset=utf-8', {});
  }
  U.usage = { vue: vue, consultable: consultable };
})();
