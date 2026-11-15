// SPDX-License-Identifier: EUPL-1.2
/*
 * Rôles selon le service — interface (phase 5, décisions du porteur du 15 novembre 2026). Logique : roles-services.js.
 * Fenêtre « Rôles par service » d'un compte, ouverte depuis la fiche du compte (administrateur) ou depuis l'annuaire de
 * l'Équipe (cadre, pour les agents de ses services, rôles IDE, aide-soignant, secrétaire et intervenant seulement).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, RS = SIC.rolesServices, M = SIC.model;

  function s() { return U.App.session; }
  function auteur() { return Object.assign({}, s().utilisateur, { roles: s().utilisateur.roles || [] }); }
  function libRole(r) { try { var x = M.rolesConfig(U.config()).filter(function (y) { return y.code === r; })[0]; return x ? x.libelle : r; } catch (e) { return r; } }
  function libRoles(l) { return (l || []).map(libRole).join(', ') || '—'; }

  /** Un réglage est-il possible pour ce compte (plusieurs services, et l'auteur règle au moins l'un d'eux) ? */
  function proposable(compte) { return !!compte && (compte.services || []).length > 1 && RS.peutRegler(auteur(), compte) && !s().apercu; }

  function modale(compte) {
    var cfg = U.config(), a = auteur(), actuel = RS.reglage(cfg, compte.id), lignes = [];
    var habituels = (compte.roles || []).filter(function (r) { return M.ROLES_DE_SERVICE.indexOf(r) >= 0; });
    var corps = h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Rôles habituels de ' + compte.nom + ' : ' + libRoles(compte.roles) + '. Pour un service où il ou elle exerce autrement, choisissez ses rôles propres à ce service : ils remplacent ses rôles habituels dans ce service seulement (les droits de chaque saisie suivent le service concerné).' }));
    (compte.services || []).forEach(function (sv) {
      var ok = RS.attribuables(a, sv), propre = actuel[sv] || null;
      var radioH = h('input', { type: 'radio', name: 'rs-' + sv, checked: !propre, disabled: !ok.length }), radioP = h('input', { type: 'radio', name: 'rs-' + sv, checked: !!propre, disabled: !ok.length });
      var cases = ok.map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: !!propre && propre.indexOf(r) >= 0 }) }; });
      // Rôles déjà réglés par l'administrateur que le cadre n'attribue pas : affichés, non modifiables
      var horsChoix = (propre || []).filter(function (r) { return ok.indexOf(r) < 0; });
      var zone = h('div', { class: 'actions gauche' }, cases.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: libRole(x.r) })); }));
      function maj() { cases.forEach(function (x) { x.cb.disabled = !radioP.checked || horsChoix.length > 0; }); }
      radioH.addEventListener('change', maj); radioP.addEventListener('change', maj); maj();
      lignes.push({ sv: sv, ok: ok, radioP: radioP, cases: cases, horsChoix: horsChoix, propre: propre });
      corps.appendChild(h('fieldset', { class: 'hs-horaire' }, h('legend', { text: U.libService(sv) }),
        !ok.length ? h('p', { class: 'muted', text: propre ? 'Rôles propres : ' + libRoles(propre) + ' (réglés par l’administrateur ou le cadre du service).' : 'Rôles habituels (' + libRoles(habituels) + ').' }) : null,
        ok.length ? h('label', { class: 'case' }, radioH, h('span', { text: 'Rôles habituels (' + libRoles(habituels) + ')' })) : null,
        ok.length ? h('label', { class: 'case' }, radioP, h('span', { text: 'Rôles propres à ce service :' })) : null,
        ok.length ? zone : null,
        horsChoix.length ? h('small', { class: 'muted', text: 'Comprend un rôle attribué par l’administrateur seulement (' + libRoles(horsChoix) + ') : modification réservée à l’administrateur.' }) : null));
    });
    // Information du cadre (0.72.0) : clés en attente de l'administrateur, ou refusées, pour ce compte
    var attente = [];
    try { attente = (s().remisesEnAttenteDe ? s().remisesEnAttenteDe(compte.id) : []).filter(function (r) { return r.motif === 'roleService'; }); } catch (e) { attente = []; }
    var enAtt = attente.filter(function (r) { return !r.refus; }), ref = attente.filter(function (r) { return r.refus; });
    if (enAtt.length) corps.appendChild(h('p', { class: 'info', text: 'Clés en attente de la confirmation de l’administrateur : ' + enAtt.map(function (r) { return r.libelle; }).join(', ') + '. Les rôles sont enregistrés ; l’accès à ces données sera ouvert après sa confirmation.' }));
    if (ref.length) corps.appendChild(h('p', { class: 'alerte', text: 'Remise refusée par l’administrateur : ' + ref.map(function (r) { return r.libelle + (r.refus.raison ? ' (' + r.refus.raison + ')' : ''); }).join(', ') + '.' }));
    corps.appendChild(h('small', { class: 'muted', text: (a.roles.indexOf('ADMIN') >= 0 ? '' : 'En tant que cadre, vous attribuez dans vos services les rôles IDE, aide-soignant, secrétaire et intervenant ; les autres rôles sont attribués par l’administrateur. ') + 'Les clés suivent l’ensemble des rôles du compte ; elles sont remises par un administrateur, qui confirme le changement à sa prochaine connexion (aussitôt s’il l’enregistre lui-même).' }));
    U.modale('Rôles par service — ' + compte.nom, corps, [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var v = { rolesServices: RS.normaliser(U.config().rolesServices) };
      lignes.forEach(function (l) {
        if (!l.ok.length || l.horsChoix.length) return;
        var roles = l.radioP.checked ? l.cases.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r; }) : null;
        if (l.radioP.checked && !roles.length) throw new Error(U.libService(l.sv) + ' : cochez au moins un rôle, ou gardez les rôles habituels.');
        v.rolesServices = RS.avec(v, compte.id, l.sv, roles);
      });
      RS.controler(U.config().rolesServices, v.rolesServices, a, s().comptes || []);
      await U.enregistrerConfig([['rolesServices', v.rolesServices]]);
      U.toast('Rôles par service enregistrés.' + (a.roles.indexOf('ADMIN') >= 0 ? '' : ' Les accès nouveaux aux données seront ouverts après confirmation par l’administrateur.'));
    } }]);
  }
  /** Rôles propres d'un compte, en clair (ex. « Unité 2 : Cadre de santé »), ou chaîne vide. */
  function resume(compte) {
    var x = RS.reglage(U.config(), compte.id);
    return Object.keys(x).filter(function (sv) { return (compte.services || []).indexOf(sv) >= 0; }).map(function (sv) { return U.libService(sv) + ' : ' + libRoles(x[sv]); }).join(' ; ');
  }
  U.rolesServices = { modale: modale, proposable: proposable, resume: resume };
})();
