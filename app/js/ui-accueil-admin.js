// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — page d'accueil de l'administration (0.26.1, lot A, décisions du porteur du 11 novembre 2026).
 *
 * Premier onglet de la fenêtre Administration (administrateur) : une carte par module (icône, nom, services où il est
 * activé, nombre de saisies, informations en attente), activation par service depuis la carte (confirmation avant de
 * désactiver un module qui a des données : rien n'est effacé, le module est masqué), un clic ouvre les réglages du
 * module ; état de la plateforme (copies de sauvegarde, coffre, intégrité, comptes à activer ou à échéance).
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
  /** Onglet des réglages du module dans la fenêtre Administration, s'il en a un. */
  function ongletReglages(m) { var o = 'admin-' + m.id; return U.ongletsAdmin && U.ongletsAdmin().some(function (x) { return x[0] === o; }) ? o : null; }

  function modaleActivation(m) {
    var svs = U.tousServices(), cases = svs.map(function (sv) { return { sv: sv, cb: h('input', { type: 'checkbox', checked: m.droits.serviceActif(cfg(), sv.code) }) }; });
    var tous = h('input', { type: 'checkbox', checked: cases.every(function (c) { return c.cb.checked; }), onchange: function () { cases.forEach(function (c) { c.cb.checked = tous.checked; }); } });
    U.modale(m.libelle + ' : services où le module est activé', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Un agent voit le module dans un service si le module y est activé, s’il est affecté au service et s’il a un rôle dans le module.' }),
      h('label', { class: 'case' }, tous, h('b', { text: 'Tous les services' })),
      h('div', { class: 'grille-2' }, cases.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.sv.libelle + ' (' + c.sv.code + ')' })); }))),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var desactives = cases.filter(function (c) { return !c.cb.checked && m.droits.serviceActif(cfg(), c.sv.code); });
      if (desactives.length && saisiesDe(m) && !confirm('Désactiver « ' + m.libelle + ' » pour ' + desactives.map(function (c) { return c.sv.libelle; }).join(', ') + ' ?\n\nRien n’est effacé : le module est seulement masqué. Ses données sont conservées ; plus aucune saisie n’est possible dans ces services, et seuls l’encadrement et l’administrateur les consultent.')) return false;
      var valeur = JSON.parse(JSON.stringify(cfg().modulesServices || {})), actifs = cases.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.sv.code; });
      if (actifs.length === cases.length) delete valeur[m.id]; else valeur[m.id] = { tous: false, services: actifs };
      await U.enregistrerConfig([['modulesServices', valeur]]);
      U.toast('Activation enregistrée.');
    } }]);
  }

  function carte(m) {
    if (m.reference) return carteReference(m);
    var actifs = servicesActifs(m), total = U.tousServices().length, n = 0, nb = saisiesDe(m), reg = ongletReglages(m);
    try { n = m.interface && m.interface.pastille ? m.interface.pastille() || 0 : 0; } catch (e) { n = 0; }
    var etat = !actifs.length ? 'Désactivé' : actifs.length === total ? 'Activé pour tous les services' : 'Activé pour ' + actifs.map(function (x) { return x.libelle; }).join(', ');
    return h('article', { class: 'carte-module' + (actifs.length ? '' : ' desactive') },
      h('button', { type: 'button', class: 'carte-module-tete', title: reg ? 'Ouvrir les réglages du module' : 'Ouvrir le module', onclick: function () {
        if (reg) { U.App.onglet = reg; U.rendreContenu(); } else U.ouvrirFenetre(m.id);
      } }, U.icone ? U.icone(m.id) : null, h('b', { text: m.libelle }), n ? h('span', { class: 'pastille', text: String(n) }) : null),
      h('div', { class: 'carte-module-etat ' + (actifs.length ? 'ok' : 'muted'), text: etat }),
      h('small', { class: 'muted', text: nb + ' saisie' + (nb > 1 ? 's' : '') + (n ? ' · ' + n + ' information' + (n > 1 ? 's' : '') + ' en attente' : '') }),
      h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleActivation(m); } }, actifs.length ? 'Services…' : 'Activer…'),
        reg ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.App.onglet = reg; U.rendreContenu(); } }, 'Réglages') : null,
        actifs.length ? h('button', { class: 'btn petit', type: 'button', onclick: function () { U.ouvrirFenetre(m.id); } }, 'Ouvrir') : null));
  }

  /** Module de référence (Patients) : sans activation propre, il suit les modules qui en dépendent. */
  function carteReference(m) {
    var nb = saisiesDe(m), reg = ongletReglages(m);
    return h('article', { class: 'carte-module' },
      h('button', { type: 'button', class: 'carte-module-tete', title: 'Ouvrir les réglages du module', onclick: function () { if (reg) { U.App.onglet = reg; U.rendreContenu(); } else U.ouvrirFenetre(m.id); } }, U.icone ? U.icone(m.id) : null, h('b', { text: m.libelle })),
      h('div', { class: 'carte-module-etat ok', text: 'Module de référence : suit les modules qui en dépendent' }),
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
      if (at) res.push({ niveau: bl.length ? 'bad' : 'ok', texte: bl.length ? 'Intégrité du coffre : ' + bl.length + ' anomalie' + (bl.length > 1 ? 's' : '') + ' (clés à renouveler ou à remettre)' : 'Intégrité du coffre : attesté, aucune anomalie', voir: 'comptes' });
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
    var actifs = mods.filter(function (m) { return m.reference || servicesActifs(m).length; }).length;
    return h('div', { class: 'pile' },
      h('section', { class: 'panneau' }, h('h2', { text: 'Modules' }),
        h('p', { class: 'muted', text: actifs + ' module' + (actifs > 1 ? 's' : '') + ' activé' + (actifs > 1 ? 's' : '') + ' sur ' + mods.length + '. Un clic sur l’icône ouvre les réglages du module ; « Services… » choisit les services où il est activé.' }),
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
