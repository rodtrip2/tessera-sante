// SPDX-License-Identifier: EUPL-1.2
/*
 * Groupes d'agents (décision du porteur du 8 novembre 2026) : en plus de leur affectation à un ou plusieurs services,
 * les agents peuvent être réunis dans des groupes créés par le cadre (groupes de travail, équipe de nuit, équipe de
 * jour…). Réglage commun `groupes` (journal du socle) : [{ code, libelle, services: [codes], membres: [{ id, nom }],
 * actif }]. Un groupe sans service vaut pour tout l'établissement (créé par l'administrateur seulement).
 * Le cadre modifie les groupes de ses services : tout groupe qu'il crée, change ou retire n'a que des services qui lui
 * sont affectés. Utilisés par l'Agenda (tâches et alertes pour un groupe) ; prévus pour la messagerie.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).groupes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function code(x) { return typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(x) ? x : null; }
  /** Groupes du réglage, validés à la lecture (entrées mal formées ignorées). */
  function liste(config) {
    var g = config && Array.isArray(config.groupes) ? config.groupes : [], vus = {};
    return g.filter(function (x) { return x && code(x.code) && String(x.libelle || '').trim() && !vus[x.code] && (vus[x.code] = true); }).map(function (x) {
      return {
        code: x.code, libelle: String(x.libelle).trim().slice(0, 60),
        services: Array.isArray(x.services) ? x.services.filter(function (s) { return typeof s === 'string'; }) : [],
        membres: Array.isArray(x.membres) ? x.membres.filter(function (m) { return m && typeof m.id === 'string'; }).map(function (m) { return { id: m.id, nom: String(m.nom || '') }; }) : [],
        actif: x.actif !== false
      };
    });
  }
  /** Codes des groupes actifs dont l'agent est membre. */
  function de(config, compteId) {
    return liste(config).filter(function (g) { return g.actif && g.membres.some(function (m) { return m.id === compteId; }); }).map(function (g) { return g.code; });
  }
  /** Groupes actifs utilisables dans un service (groupes de ce service et groupes de l'établissement). */
  function pourService(config, service) {
    return liste(config).filter(function (g) { return g.actif && (!g.services.length || g.services.indexOf(service) >= 0); });
  }
  function libelle(config, c) { var g = liste(config).filter(function (x) { return x.code === c; })[0]; return g ? g.libelle : c; }
  /** Le compte peut-il modifier ce groupe ? Administrateur : tous ; cadre : groupe de ses services seulement. */
  function modifiable(g, compte) {
    var roles = (compte && compte.roles) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0) return false;
    var sv = (compte && compte.services) || [];
    return !!g && g.services.length > 0 && g.services.every(function (s) { return sv.indexOf(s) >= 0; });
  }
  /**
   * Contrôle d'un nouveau réglage `groupes` écrit par un compte : chaque groupe créé, modifié ou retiré doit lui être
   * modifiable (avant et après). Lève une erreur sinon.
   */
  function controler(ancien, nouveau, compte) {
    var a = liste({ groupes: ancien }), n = liste({ groupes: nouveau });
    if (Array.isArray(nouveau) && n.length !== nouveau.length) throw new Error('Groupe mal formé (nom et code requis, codes distincts).');
    var parCode = function (l) { var o = {}; l.forEach(function (g) { o[g.code] = g; }); return o; };
    var A = parCode(a), N = parCode(n);
    Object.keys(A).concat(Object.keys(N).filter(function (c) { return !A[c]; })).forEach(function (c) {
      if (JSON.stringify(A[c]) === JSON.stringify(N[c])) return;
      if ((A[c] && !modifiable(A[c], compte)) || (N[c] && !modifiable(N[c], compte)))
        throw new Error('Le groupe « ' + (N[c] || A[c]).libelle + ' » ne peut être modifié que par l’administrateur ou le cadre de ses services.');
    });
    return true;
  }

  return { liste: liste, de: de, pourService: pourService, libelle: libelle, modifiable: modifiable, controler: controler };
});
