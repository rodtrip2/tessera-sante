// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — page d'accueil de l'administration (0.26.1, lot A, décisions du porteur du 11 novembre 2026).
 *
 * Premier onglet de la fenêtre Administration (administrateur) : une carte par module (icône, nom, services où il est
 * activé, nombre de saisies, informations en attente), activation par service depuis la carte (confirmation avant de
 * désactiver un module qui a des données : rien n'est effacé, le module est masqué), un clic ouvre les réglages du
 * module ; état de la plateforme (copies de sauvegarde, coffre, intégrité, comptes à activer ou à échéance).
 * Mise en marche et arrêt d'un module (0.43.0, demande du porteur du 12 novembre 2026) : bouton « alimentation » de la
 * carte ; un module arrêté est masqué pour tous et n'apparaît plus dans les autres modules, ses données et réglages sont
 * gardés ; les modules indispensables (Patients, Équipe) ne s'arrêtent pas.
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h;
  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  var J = 864e5;

  /** Saisies du module (journal reconstitué, lots dépliés), hors annulations et réglages. */
  function saisiesDe(m) {
    var e = null;
    try { e = s().detientCle && s().detientCle(m.id) ? s().etatModule(m.id) : null; } catch (err) { e = null; }
    var par = (e && e.parId) || {};
    return Object.keys(par).filter(function (k) { var y = SIC.modules.moduleDuType(par[k].type); return y && y.id === m.id && !(e.annules && e.annules[k]); }).length;
  }
  function servicesActifs(m) { return U.tousServices().filter(function (sv) { return m.droits.serviceActif(cfg(), sv.code); }); }
  function arrete(m) { return !!(m.droits && m.droits.arrete && m.droits.arrete(cfg())); }
  var NS = 'http://www.w3.org/2000/svg';
  function iconeAlimentation() {
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icone-alimentation'); svg.setAttribute('aria-hidden', 'true');
    ['M12 3v9', 'M18.4 6.6a9 9 0 1 1-12.8 0'].forEach(function (d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    return svg;
  }
  /** Ce que l'arrêt d'un module retire aux autres (fournitures lues par d'autres modules). */
  function effetsArret(m) {
    return SIC.modules.dependants(m.id).filter(function (x) { return x.id !== m.id; }).map(function (x) {
      var b = x.besoins.filter(function (y) { return y.fourniture.split('.')[0] === m.id; });
      return x.libelle + (b.some(function (y) { return y.obligatoire; }) ? ' (besoin obligatoire)' : '');
    });
  }
  async function basculer(m) {
    var ar = arrete(m), valeur = JSON.parse(JSON.stringify(cfg().modulesServices || {}));
    if (!ar) {
      if (SIC.modules.indispensable(m.id)) return U.toast('« ' + m.libelle + ' » est indispensable : il ne s’arrête pas.');
      var dep = effetsArret(m), nb = saisiesDe(m);
      if (!confirm('Arrêter le module « ' + m.libelle + ' » ?\n\n' +
        '— Sa fenêtre est masquée pour tous les agents, et ses informations n’apparaissent plus dans les autres modules' + (dep.length ? ' (' + dep.join(', ') + ')' : '') + '.\n' +
        '— Rien n’est effacé : ' + (nb ? 'ses ' + nb + ' saisies et ' : '') + 'ses réglages sont gardés, ainsi que les sauvegardes ; ses données restent dans l’export du droit d’accès d’un patient.\n' +
        '— Les agents gardent la clé du module (rien à redistribuer à la remise en marche).\n\nLa remise en marche rétablit tout comme avant.')) return;
    }
    SIC.modules.ecrireArret(valeur, m.id, !ar);
    try { await U.enregistrerConfig([['modulesServices', valeur]]); U.rendreContenu(); U.toast(ar ? '« ' + m.libelle + ' » remis en marche.' : '« ' + m.libelle + ' » arrêté.'); }
    catch (e) { U.toast(e.message); }
  }
  function boutonAlimentation(m) {
    var ind = SIC.modules.indispensable(m.id), ar = arrete(m);
    return h('button', { type: 'button', class: 'alimentation' + (ar ? ' arrete' : ' marche') + (ind ? ' fixe' : ''), 'aria-pressed': ar ? 'false' : 'true',
      'aria-label': ind ? m.libelle + ' : module indispensable, toujours en marche' : (ar ? 'Remettre en marche « ' + m.libelle + ' »' : 'Arrêter « ' + m.libelle + ' »'),
      title: ind ? 'Module indispensable : toujours en marche' : ar ? 'Module arrêté : cliquer pour le remettre en marche' : 'Module en marche : cliquer pour l’arrêter',
      disabled: ind || !!s().apercu, onclick: function () { basculer(m); } }, iconeAlimentation());
  }
  /** Onglet des réglages du module dans la fenêtre Administration, s'il en a un. */
  function ongletReglages(m) { var o = 'admin-' + m.id; return U.ongletsAdmin && U.ongletsAdmin().some(function (x) { return x[0] === o; }) ? o : null; }

  function modaleActivation(m) {
    var svs = U.tousServices(), cases = svs.map(function (sv) { return { sv: sv, cb: h('input', { type: 'checkbox', checked: m.droits.serviceChoisi(cfg(), sv.code) }) }; });
    var tous = h('input', { type: 'checkbox', checked: cases.every(function (c) { return c.cb.checked; }), onchange: function () { cases.forEach(function (c) { c.cb.checked = tous.checked; }); } });
    U.modale(m.libelle + ' : services où le module est activé', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Un agent voit le module dans un service si le module y est activé, s’il est affecté au service et s’il a un rôle dans le module.' }),
      h('label', { class: 'case' }, tous, h('b', { text: 'Tous les services' })),
      h('div', { class: 'grille-2' }, cases.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.sv.libelle + ' (' + c.sv.code + ')' })); }))),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var desactives = cases.filter(function (c) { return !c.cb.checked && m.droits.serviceChoisi(cfg(), c.sv.code); });
      if (desactives.length === cases.length && SIC.modules.indispensable(m.id)) throw new Error('« ' + m.libelle + ' » est indispensable : laissez-le activé pour au moins un service.');
      if (desactives.length && saisiesDe(m) && !confirm('Désactiver « ' + m.libelle + ' » pour ' + desactives.map(function (c) { return c.sv.libelle; }).join(', ') + ' ?\n\nRien n’est effacé : le module est seulement masqué. Ses données sont conservées ; plus aucune saisie n’est possible dans ces services, et seuls l’encadrement et l’administrateur les consultent.')) return false;
      var valeur = JSON.parse(JSON.stringify(cfg().modulesServices || {})), actifs = cases.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.sv.code; });
      SIC.modules.ecrireActivation(valeur, m.id, actifs, actifs.length === cases.length);
      await U.enregistrerConfig([['modulesServices', valeur]]);
      U.toast('Activation enregistrée.');
    } }]);
  }

  function carte(m) {
    if (m.reference) return carteReference(m);
    var actifs = servicesActifs(m), total = U.tousServices().length, n = 0, nb = saisiesDe(m), reg = ongletReglages(m), ar = arrete(m);
    try { n = ar ? 0 : m.interface && m.interface.pastille ? m.interface.pastille() || 0 : 0; } catch (e) { n = 0; }
    var choisis = U.tousServices().filter(function (sv) { return m.droits.serviceChoisi(cfg(), sv.code); });
    var etat = ar ? 'Arrêté : masqué pour tous, données et réglages conservés' : !actifs.length ? 'Désactivé' : actifs.length === total ? 'Activé pour tous les services' : 'Activé pour ' + actifs.map(function (x) { return x.libelle; }).join(', ');
    return h('article', { class: 'carte-module' + (actifs.length ? '' : ' desactive') + (ar ? ' arrete' : '') },
      h('div', { class: 'carte-module-haut' },
        h('button', { type: 'button', class: 'carte-module-tete', title: reg ? 'Ouvrir les réglages du module' : 'Ouvrir le module', onclick: function () {
          if (reg) { U.App.onglet = reg; U.rendreContenu(); } else if (!ar) U.ouvrirFenetre(m.id);
        } }, U.icone ? U.icone(m.id) : null, h('b', { text: m.libelle }), n ? h('span', { class: 'pastille', text: String(n) }) : null),
        boutonAlimentation(m)),
      h('div', { class: 'carte-module-etat ' + (actifs.length ? 'ok' : 'muted'), text: etat }),
      ar && choisis.length && choisis.length < total ? h('small', { class: 'muted', text: 'À la remise en marche : ' + choisis.map(function (x) { return x.libelle; }).join(', ') }) : null,
      h('small', { class: 'muted', text: nb + ' saisie' + (nb > 1 ? 's' : '') + (n ? ' · ' + n + ' information' + (n > 1 ? 's' : '') + ' en attente' : '') }),
      h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleActivation(m); } }, actifs.length || ar ? 'Services…' : 'Activer…'),
        reg ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.App.onglet = reg; U.rendreContenu(); } }, 'Réglages') : null,
        actifs.length ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.ouvrirFenetre(m.id); } }, 'Ouvrir') : null));
  }

  /** Module de référence (Patients) : sans activation propre, il suit les modules qui en dépendent. */
  function carteReference(m) {
    var nb = saisiesDe(m), reg = ongletReglages(m);
    return h('article', { class: 'carte-module' },
      h('div', { class: 'carte-module-haut' },
        h('button', { type: 'button', class: 'carte-module-tete', title: 'Ouvrir les réglages du module', onclick: function () { if (reg) { U.App.onglet = reg; U.rendreContenu(); } else U.ouvrirFenetre(m.id); } }, U.icone ? U.icone(m.id) : null, h('b', { text: m.libelle })),
        boutonAlimentation(m)),
      h('div', { class: 'carte-module-etat ok', text: 'Module de référence, indispensable : suit les modules qui en dépendent' }),
      h('small', { class: 'muted', text: nb + ' saisie' + (nb > 1 ? 's' : '') }),
      h('div', { class: 'actions gauche' }, reg ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.App.onglet = reg; U.rendreContenu(); } }, 'Réglages') : null,
        h('button', { class: 'btn petit', type: 'button', onclick: function () { U.ouvrirFenetre(m.id); } }, 'Ouvrir')));
  }

  /** Points d'état de la plateforme : [{ niveau: 'ok' | 'warn' | 'bad', texte, voir: sous-onglet }]. */
  function etatPlateforme() {
    var x = s(), res = [], demo = U.App.dossier && U.App.dossier.mode === 'demo';
    try {
      var der = x.derniereCopie && x.derniereCopie();
      res.push({ niveau: der && Date.now() - der < 30 * J ? 'ok' : 'warn', texte: 'Copie de sauvegarde complète : ' + (der ? 'la dernière le ' + U.date(der).slice(0, 10) : 'aucune téléchargée') + (demo ? ' (démonstration)' : ''), voir: 'sauvegardes' });
    } catch (e) { /* sans copie */ }
    try {
      var sc = x.etatScelle && x.etatScelle();
      res.push({ niveau: sc && sc.aJour ? 'ok' : 'warn', texte: 'Copie du coffre sous scellé : ' + (!sc ? 'jamais faite' : sc.aJour ? 'à jour (' + U.date(Date.parse(sc.creeLe)).slice(0, 10) + ')' : 'à refaire, le code de secours ou une clé maîtresse a changé'), voir: 'sauvegardes' });
    } catch (e) { /* sans scellé */ }
    try {
      var at = x.etatAttestation && x.etatAttestation(), bl = at ? at.anomalies.filter(function (a) { return a.bloquante; }) : [];
      if (at) res.push({ niveau: bl.length ? 'bad' : 'ok', texte: bl.length ? 'Intégrité du coffre : ' + bl.length + ' anomalie' + (bl.length > 1 ? 's' : '') + ' (clés à renouveler ou à remettre)' : 'Intégrité du coffre : attesté, aucune anomalie', voir: 'securite' });
    } catch (e) { /* sans attestation */ }
    try {
      var pbs = U.sauvegarde && U.sauvegarde.texteIntegrite ? U.sauvegarde.texteIntegrite(x.integrite) || [] : [];
      res.push({ niveau: pbs.length ? 'bad' : 'ok', texte: pbs.length ? 'Intégrité des données : ' + pbs.join(' ; ') : 'Intégrité des données : aucune anomalie', voir: 'sauvegardes' });
    } catch (e) { /* sans contrôle */ }
    var comptes = (x.comptes || []).filter(function (c) { return c.actif; });
    var prov = comptes.filter(function (c) { return c.mdpProvisoire; });
    res.push({ niveau: prov.length ? 'warn' : 'ok', texte: prov.length ? prov.length + ' compte' + (prov.length > 1 ? 's' : '') + ' jamais activé' + (prov.length > 1 ? 's' : '') + ' (mot de passe provisoire) : ' + prov.slice(0, 6).map(function (c) { return c.nom; }).join(', ') + (prov.length > 6 ? '…' : '') : 'Tous les comptes ont été activés', voir: 'comptes' });
    var bientot = comptes.filter(function (c) { var f = Date.parse(c.finValidite || ''); return f && f - Date.now() < 15 * J; });
    if (bientot.length) res.push({ niveau: 'warn', texte: bientot.length + ' compte' + (bientot.length > 1 ? 's' : '') + ' à échéance dans moins de 15 jours : ' + bientot.slice(0, 6).map(function (c) { return c.nom + ' (' + String(c.finValidite).split('-').reverse().join('/') + ')'; }).join(', '), voir: 'comptes' });
    return res;
  }

  function vueAccueilAdmin() {
    var mods = SIC.modules.liste().filter(function (m) { return m.reference; }).concat(SIC.modules.affiches()), etat = etatPlateforme();
    var actifs = mods.filter(function (m) { return m.reference || servicesActifs(m).length; }).length, arretes = mods.filter(arrete).length;
    return h('div', { class: 'pile' },
      h('section', { class: 'panneau' }, h('h2', { text: 'Modules' }),
        h('p', { class: 'muted', text: actifs + ' module' + (actifs > 1 ? 's' : '') + ' activé' + (actifs > 1 ? 's' : '') + ' sur ' + mods.length + (arretes ? ', ' + arretes + ' arrêté' + (arretes > 1 ? 's' : '') : '') + '. Un clic sur l’icône ouvre les réglages du module ; « Services… » choisit les services où il est activé ; le bouton ⏻ arrête un module ou le remet en marche (les modules indispensables restent toujours en marche).' }),
        h('div', { class: 'cartes-modules' }, mods.map(carte))),
      h('section', { class: 'panneau' }, h('h2', { text: 'État de la plateforme' }),
        h('ul', { class: 'etat-plateforme' }, etat.map(function (x) {
          return h('li', { class: 'etat-' + x.niveau }, h('span', { class: 'etat-pastille', 'aria-hidden': 'true' }), h('span', { text: x.texte }),
            x.voir ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.App.onglet = 'admin'; U.App.sousOngletAdmin = x.voir; U.rendreContenu(); } }, 'Voir') : null);
        }))));
  }

  U.vueAccueilAdmin = vueAccueilAdmin;
  U.accueilAdmin = { etatPlateforme: etatPlateforme, saisiesDe: saisiesDe };
})();
