// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — barre des modules : favoris épinglés et menu des autres modules (lot A, phase 2 du plan d'action, demande du
 * porteur du 13 novembre 2026).
 *
 * Option de l'établissement, désactivée par défaut (la barre actuelle, avec tous les modules, reste). Activée : chaque
 * agent épingle ses modules favoris dans la barre, dans l'ordre qu'il choisit (préférence personnelle) ; les autres
 * sont dans le menu « Modules » ; la fenêtre ouverte d'un module non épinglé apparaît dans la barre tant qu'elle est
 * ouverte ; la pastille du bouton « Modules » totalise celles des modules non épinglés. L'établissement propose des
 * favoris par défaut selon le rôle ; un rôle sans favoris proposés garde tous ses modules dans la barre.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).barreModules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MOTIF = /^[a-z][a-z0-9-]{1,30}$/;
  // Favoris proposés (demande du porteur du 13 novembre 2026) ; l'établissement les remplace rôle par rôle
  var DEFAUTS = {
    IDE: ['aujourdhui', 'patients', 'agenda', 'isocont', 'messagerie'],
    AS: ['aujourdhui', 'patients', 'agenda', 'isocont', 'messagerie'],
    SECRETAIRE: ['aujourdhui', 'agenda', 'suivi', 'messagerie']
  };
  function liste(v) { var vus = {}; return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string' && MOTIF.test(x) && !vus[x] && (vus[x] = 1); }); }

  /** Réglage de l'établissement (`config.barreModules`) : { active, defauts: { ROLE: [modules] } }. */
  function options(config) {
    var v = (config && config.barreModules) || {}, d = {};
    var src = v.defauts && typeof v.defauts === 'object' ? v.defauts : DEFAUTS;
    Object.keys(src).forEach(function (r) { if (/^[A-Z][A-Z0-9_]{1,30}$/.test(r)) d[r] = liste(src[r]); });
    return { active: v.active === true, defauts: d };
  }
  /**
   * Modules épinglés, dans l'ordre : le choix de l'agent (`perso`, liste) s'il existe, sinon les favoris proposés pour
   * ses rôles ; limités aux fenêtres `disponibles` (identifiants). Sans favoris pour ses rôles : toutes ses fenêtres.
   */
  function epingles(config, perso, roles, disponibles) {
    var dispo = liste(disponibles), choix = null;
    if (Array.isArray(perso)) choix = liste(perso);
    else {
      var o = options(config), union = [];
      (roles || []).forEach(function (r) { (o.defauts[r] || []).forEach(function (x) { if (union.indexOf(x) < 0) union.push(x); }); });
      choix = union.length ? union : null;
    }
    if (!choix) return dispo.slice();
    return choix.filter(function (x) { return dispo.indexOf(x) >= 0; });
  }
  /** Boutons de la barre : les épinglés, puis la fenêtre ouverte si elle n'est pas épinglée (`temporaire`). */
  function boutons(epingle, ouverte) {
    var res = epingle.map(function (id) { return { id: id, temporaire: false }; });
    if (ouverte && epingle.indexOf(ouverte) < 0) res.push({ id: ouverte, temporaire: true });
    return res;
  }
  /** Nouvelle liste après épinglage, désépinglage ou déplacement (`sens` : -1 vers la gauche, +1 vers la droite). */
  function epingler(liste0, id, oui) { var l = liste(liste0).filter(function (x) { return x !== id; }); if (oui) l.push(id); return l; }
  function deplacer(liste0, id, sens) {
    var l = liste(liste0), i = l.indexOf(id), j = i + sens;
    if (i < 0 || j < 0 || j >= l.length) return l;
    l.splice(i, 1); l.splice(j, 0, id);
    return l;
  }
  /** Pastille du bouton « Modules » : somme des pastilles des fenêtres non épinglées. */
  function pastilleMenu(epingle, pastilles) {
    return Object.keys(pastilles || {}).reduce(function (s, id) { return s + (epingle.indexOf(id) < 0 ? (+pastilles[id] || 0) : 0); }, 0);
  }
  return { DEFAUTS: DEFAUTS, options: options, epingles: epingles, boutons: boutons, epingler: epingler, deplacer: deplacer, pastilleMenu: pastilleMenu };
});
