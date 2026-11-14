// SPDX-License-Identifier: EUPL-1.2
/*
 * Interface — classement personnel des messages et des documents (lot I, 14 novembre 2026). Logique : classement.js.
 * Étoile, étiquettes en couleur, dossiers ; barre de filtre ; fenêtre « Classer » ; gestion des étiquettes et dossiers ;
 * étiquettes communes réglées par l'administrateur (établissement) et le cadre (ses services). Le classement est gardé
 * dans les préférences de l'agent (chiffrées avec sa clé personnelle).
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h, K = SIC.classement;
  function s() { return U.App.session; }
  function lire() { return K.normaliser((s() && s().preferences && s().preferences.classement) || {}); }
  function services() { try { return (s().compteEffectif().services || []).slice(); } catch (e) { return []; } }
  function toutes() { return K.etiquettes(lire(), U.config(), services()); }
  async function ecrire(c) { await s().enregistrerPreference('classement', K.normaliser(c)); U.rendreContenu(); }
  function disponible() { try { return !!s() && !s().apercu && !!s().cle; } catch (e) { return false; } }

  /** Puce d'une étiquette. */
  function puce(e) { return h('span', { class: 'etq etq-' + e.couleur, title: e.commune ? 'Étiquette commune' : 'Étiquette personnelle', text: e.libelle }); }
  /** Marques d'un élément (étoile, étiquettes) en lecture, pour une ligne de liste. */
  function marques(module, id) {
    var e = K.element(lire(), module, id), tout = toutes();
    var et = e.etiquettes.map(function (x) { return tout.filter(function (y) { return y.id === x; })[0]; }).filter(Boolean);
    if (!e.favori && !et.length) return null;
    return h('span', { class: 'classement-marques' }, e.favori ? h('span', { class: 'etoile-fixe', title: 'Favori', 'aria-label': 'Favori', text: '★' }) : null, et.map(puce));
  }
  /** Bouton étoile (ajouter ou retirer des favoris). */
  function etoile(module, id) {
    var f = K.element(lire(), module, id).favori;
    return h('button', { class: 'btn petit etoile' + (f ? ' active' : ''), type: 'button', 'aria-pressed': f ? 'true' : 'false', title: f ? 'Retirer des favoris' : 'Ajouter aux favoris', disabled: !disponible(),
      onclick: async function (ev) { ev.stopPropagation(); try { await ecrire(K.marquer(lire(), module, id, { favori: !f })); } catch (e) { alert(e.message); } } }, f ? '★' : '☆');
  }
  function optionsDossiers(module, valeur, avecTous, libRacine) {
    var l = lire().dossiers[module], opts = [];
    if (avecTous) opts.push(h('option', { value: '', text: avecTous, selected: valeur === '' }));
    opts.push(h('option', { value: avecTous ? '-' : '', text: libRacine, selected: valeur === (avecTous ? '-' : '') }));
    l.filter(function (d) { return !d.parent; }).forEach(function (d) {
      opts.push(h('option', { value: d.id, text: d.libelle, selected: valeur === d.id }));
      l.filter(function (x) { return x.parent === d.id; }).forEach(function (x) { opts.push(h('option', { value: x.id, text: '— ' + x.libelle, selected: valeur === x.id })); });
    });
    return opts;
  }

  /** Fenêtre « Classer » : favori, étiquettes (avec création), dossier (avec création). */
  function modaleClasser(module, id, titre) {
    if (!disponible()) return;
    var e = K.element(lire(), module, id), choix = e.etiquettes.slice(), dossier = e.dossier;
    var cbFav = h('input', { type: 'checkbox', checked: e.favori });
    var zoneEt = h('div', { class: 'classement-etiquettes' }), zoneDo = h('div');
    function dessinerEt() {
      U.vider(zoneEt);
      var l = toutes();
      if (!l.length) zoneEt.appendChild(h('p', { class: 'muted', text: 'Aucune étiquette pour l’instant : créez la première ci-dessous.' }));
      l.forEach(function (x) {
        var cb = h('input', { type: 'checkbox', checked: choix.indexOf(x.id) >= 0, onchange: function () { choix = cb.checked ? choix.concat([x.id]) : choix.filter(function (y) { return y !== x.id; }); } });
        zoneEt.appendChild(h('label', { class: 'case' }, cb, puce(x)));
      });
    }
    var nomEt = h('input', { type: 'text', maxlength: 30, placeholder: 'Nouvelle étiquette', 'aria-label': 'Nom de la nouvelle étiquette' });
    var couleur = h('select', { 'aria-label': 'Couleur' }, Object.keys(K.COULEURS).map(function (k) { return h('option', { value: k, text: K.COULEURS[k] }); }));
    var btEt = h('button', { class: 'btn petit', type: 'button', onclick: async function () {
      try { var r = K.creerEtiquette(lire(), nomEt.value, couleur.value); await s().enregistrerPreference('classement', r.classement); choix.push(r.id); nomEt.value = ''; dessinerEt(); } catch (err) { alert(err.message); }
    } }, 'Créer');
    function dessinerDo() {
      U.vider(zoneDo);
      var sel = h('select', { 'aria-label': 'Dossier', onchange: function () { dossier = sel.value; } }, optionsDossiers(module, dossier, '', module === 'messagerie' ? 'Aucun (boîte de réception)' : 'Aucun dossier'));
      zoneDo.appendChild(sel);
    }
    var nomDo = h('input', { type: 'text', maxlength: 40, placeholder: 'Nouveau dossier', 'aria-label': 'Nom du nouveau dossier' });
    var btDo = h('button', { class: 'btn petit', type: 'button', onclick: async function () {
      try { var r = K.creerDossier(lire(), module, nomDo.value, ''); await s().enregistrerPreference('classement', r.classement); dossier = r.id; nomDo.value = ''; dessinerDo(); } catch (err) { alert(err.message); }
    } }, 'Créer');
    dessinerEt(); dessinerDo();
    var contenu = h('div', { class: 'pile' }, titre ? h('p', {}, h('b', { text: titre })) : null,
      h('label', { class: 'case' }, cbFav, ' Favori'),
      h('fieldset', {}, h('legend', { text: 'Étiquettes' }), zoneEt, h('div', { class: 'actions gauche' }, nomEt, couleur, btEt)),
      h('fieldset', {}, h('legend', { text: 'Dossier' }), zoneDo, h('div', { class: 'actions gauche' }, nomDo, btDo),
        module === 'messagerie' ? h('small', { class: 'muted', text: 'Un message rangé dans un dossier quitte la boîte de réception, sans être supprimé.' }) : h('small', { class: 'muted', text: 'Ranger un document ne change pas qui peut le lire.' })),
      h('small', { class: 'muted', text: 'Votre classement n’est visible que de vous. N’y mettez aucune donnée clinique (noms de dossiers et d’étiquettes).' }));
    return U.modale('Classer', contenu, [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      await ecrire(K.marquer(lire(), module, id, { favori: cbFav.checked, etiquettes: choix, dossier: dossier }));
      U.toast('Classement enregistré.');
    } }]);
  }

  /** Gestion des étiquettes personnelles et des dossiers d'un module. */
  function modaleGerer(module) {
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      var c = lire();
      zone.appendChild(h('h3', { text: 'Mes étiquettes' }));
      if (!c.etiquettes.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucune étiquette personnelle.' }));
      c.etiquettes.forEach(function (e) {
        zone.appendChild(h('div', { class: 'barre' }, puce(e), h('div', { class: 'espace' }),
          h('button', { class: 'btn petit', type: 'button', onclick: async function () { var n = prompt('Nouveau nom de l’étiquette :', e.libelle); if (n === null) return; try { await s().enregistrerPreference('classement', K.modifierEtiquette(lire(), e.id, n)); dessiner(); } catch (err) { alert(err.message); } } }, 'Renommer'),
          h('button', { class: 'btn petit danger', type: 'button', onclick: async function () { if (!confirm('Supprimer l’étiquette « ' + e.libelle + ' » ? Elle est retirée des messages et documents (qui ne sont pas supprimés).')) return; await s().enregistrerPreference('classement', K.supprimerEtiquette(lire(), e.id)); dessiner(); } }, 'Supprimer')));
      });
      var com = K.communes(U.config(), services());
      if (com.length) zone.appendChild(h('p', { class: 'muted' }, 'Étiquettes communes (réglées par le cadre ou l’administrateur) : ', com.map(puce)));
      zone.appendChild(h('h3', { text: 'Mes dossiers — ' + K.MODULES[module] }));
      if (!c.dossiers[module].length) zone.appendChild(h('p', { class: 'muted', text: 'Aucun dossier.' }));
      c.dossiers[module].forEach(function (d) {
        var n = K.contenu(c, module, d.id);
        zone.appendChild(h('div', { class: 'barre' }, h('span', { text: (d.parent ? '— ' : '') + d.libelle + ' (' + n + ')' }), h('div', { class: 'espace' }),
          !d.parent ? h('button', { class: 'btn petit', type: 'button', onclick: async function () { var x = prompt('Nom du sous-dossier de « ' + d.libelle + ' » :', ''); if (!x) return; try { await s().enregistrerPreference('classement', K.creerDossier(lire(), module, x, d.id).classement); dessiner(); } catch (err) { alert(err.message); } } }, '+ Sous-dossier') : null,
          h('button', { class: 'btn petit', type: 'button', onclick: async function () { var x = prompt('Nouveau nom du dossier :', d.libelle); if (x === null) return; try { await s().enregistrerPreference('classement', K.renommerDossier(lire(), module, d.id, x)); dessiner(); } catch (err) { alert(err.message); } } }, 'Renommer'),
          h('button', { class: 'btn petit danger', type: 'button', onclick: async function () {
            if (n && !confirm('Le dossier « ' + d.libelle + ' » contient ' + n + ' élément(s). Le supprimer ? Son contenu revient à la racine ; rien n’est supprimé.')) return;
            await s().enregistrerPreference('classement', K.supprimerDossier(lire(), module, d.id)); dessiner();
          } }, 'Supprimer')));
      });
      zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: async function () { var x = prompt('Nom du nouveau dossier :', ''); if (!x) return; try { await s().enregistrerPreference('classement', K.creerDossier(lire(), module, x, '').classement); dessiner(); } catch (err) { alert(err.message); } } }, '+ Dossier')));
    }
    dessiner();
    return U.modale('Étiquettes et dossiers', zone, [{ texte: 'Fermer' }]);
  }

  /**
   * Barre de filtre : favoris, étiquette, dossier. `etat` : { favoris, etiquette, dossier } (modifié sur place) ;
   * `dossierDefaut` : '-' pour la boîte de réception (messages hors dossier), '' pour tout.
   */
  function barre(module, etat, libRacine) {
    var tout = toutes();
    var selEt = h('select', { 'aria-label': 'Étiquette', onchange: function () { etat.etiquette = selEt.value; U.rendreContenu(); } },
      [h('option', { value: '', text: 'Toutes les étiquettes' })].concat(tout.map(function (e) { return h('option', { value: e.id, text: e.libelle, selected: etat.etiquette === e.id }); })));
    var selDo = h('select', { 'aria-label': 'Dossier', onchange: function () { etat.dossier = selDo.value; U.rendreContenu(); } }, optionsDossiers(module, etat.dossier, 'Tous les dossiers', libRacine));
    return h('div', { class: 'actions gauche classement-barre', role: 'group', 'aria-label': 'Classement' },
      h('button', { type: 'button', class: 'btn petit' + (etat.favoris ? ' primaire' : ''), 'aria-pressed': etat.favoris ? 'true' : 'false', onclick: function () { etat.favoris = !etat.favoris; U.rendreContenu(); } }, '★ Favoris'),
      tout.length ? selEt : null, selDo,
      disponible() ? h('button', { type: 'button', class: 'btn petit', onclick: function () { modaleGerer(module); } }, 'Étiquettes et dossiers…') : null);
  }
  /** Éléments gardés par le filtre ; `idDe(x)` donne l'identifiant. */
  function filtrer(module, items, idDe, etat) {
    var garde = K.filtrer(lire(), module, items.map(idDe), { favoris: etat.favoris, etiquette: etat.etiquette, dossier: etat.dossier, avecSous: true });
    return items.filter(function (x) { return garde.indexOf(idDe(x)) >= 0; });
  }

  // ------------------------------------------------------------ Étiquettes communes (administrateur, cadre)
  function panneauCommunes() {
    var s0 = s(), admin = s0.roles().indexOf('ADMIN') >= 0;
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement' }] : []).concat(U.services().filter(function (x) { return admin || services().indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: x.libelle }; }));
    if (!niveaux.length) return null;
    var niveau = niveaux[0].code, v = JSON.parse(JSON.stringify(U.config().etiquettesCommunes || {}));
    var zone = h('textarea', { rows: 6, 'aria-label': 'Étiquettes communes, une par ligne', placeholder: 'Qualité | vert\nPharmacie | bleu\nFormation | orange' });
    function lignes(code) { return (v[code] || []).map(function (e) { return e.libelle + ' | ' + e.couleur; }).join('\n'); }
    zone.value = lignes(niveau);
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { v[niveau] = lire2(); niveau = sel.value; zone.value = lignes(niveau); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    function lire2() {
      return zone.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
        var p = l.split('|'), lib = p[0].trim().slice(0, 30), coul = (p[1] || '').trim().toLowerCase();
        if (!K.COULEURS[coul]) coul = 'gris';
        return { code: lib.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'etiquette', libelle: lib, couleur: coul };
      });
    }
    return h('section', { class: 'panneau' }, h('h2', { text: 'Étiquettes communes (messages et documents)' }),
      h('p', { class: 'muted', text: 'Proposées à tous les agents ' + (admin ? 'de l’établissement (niveau « Établissement ») ou d’un service' : 'de vos services') + ', en plus de leurs étiquettes personnelles. Chaque agent les pose pour lui seul : personne ne voit le classement des autres. Une ligne par étiquette : « Libellé | couleur » (couleurs : ' + Object.keys(K.COULEURS).join(', ') + '). Aucune donnée clinique.' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () { v[niveau] = lire2(); Object.keys(v).forEach(function (k) { if (!v[k].length) delete v[k]; }); await U.enregistrerConfig([['etiquettesCommunes', v]]); }));
  }

  U.classement = { lire: lire, marques: marques, etoile: etoile, modaleClasser: modaleClasser, modaleGerer: modaleGerer, barre: barre, filtrer: filtrer, panneauCommunes: panneauCommunes, disponible: disponible };
})();
