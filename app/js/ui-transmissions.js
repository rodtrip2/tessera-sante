// SPDX-License-Identifier: EUPL-1.2
/*
 * Vue d'ensemble — tableau de transmissions, interface (0.30.0, demande du porteur du 12 novembre 2026).
 * Logique : transmissions.js. Écran : le tableau tel qu'il sera imprimé, colonnes redimensionnables ; « Mise en page »
 * (cases, données et leur mise en forme, lignes, impression, en-tête et pied de page) ; impression ajustée au nombre de
 * faces choisi, avec les tâches du poste. Modèle du cadre ; copie personnelle de chaque agent (préférences).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, T = SIC.transmissions, V = SIC.vue;
  function session() { return U.App.session; }
  function cfg() { return U.config(); }
  function compte() { return session().compteEffectif(); }
  function VE() { return U.vueEnsemble; }
  var PX_MM = 96 / 25.4;

  // ------------------------------------------------------------ Modèle ou copie personnelle
  function copies() { var p = session().preferences || {}; return p.transmissionsPerso && typeof p.transmissionsPerso === 'object' ? p.transmissionsPerso : {}; }
  function copie(v) { var c = copies()[v.id]; return c ? T.normaliser(c) : null; }
  function miseEnPage(v) { return copie(v) || v.transmissions; }
  function peutModele(v) { return !session().apercu && V.peutRegler(v, compte()); }
  async function enregistrerCopie(v, t) {
    var c = Object.assign({}, copies());
    if (t) c[v.id] = t; else delete c[v.id];
    await session().enregistrerPreference('transmissionsPerso', c);
  }
  async function enregistrerModele(v, t) {
    var l = VE().vuesBrutes(), x = l.filter(function (y) { return y.id === v.id; })[0];
    if (!x) { x = JSON.parse(JSON.stringify(v)); l.push(x); }
    x.type = 'transmissions'; x.transmissions = t;
    await U.enregistrerConfig([['vuesEnsemble', Object.assign({}, cfg().vuesEnsemble || {}, { vues: l })]]);
  }
  /** Enregistre la mise en page : dans la copie de l'agent s'il en a une (ou s'il ne règle pas le modèle), sinon dans le modèle. */
  async function enregistrer(v, t, versModele) {
    if (versModele && peutModele(v)) await enregistrerModele(v, t);
    else { if (!copie(v) && !versModele) U.toast('Copie personnelle créée : le modèle du service n’est pas modifié.'); await enregistrerCopie(v, t); }
    U.rendreContenu();
  }
  function versModeleParDefaut(v) { return !copie(v) && peutModele(v); }

  // ------------------------------------------------------------ Contenu des cases
  function catalogueVisible(v, ctx) {
    var cat = V.catalogue('patients', ctx), vis = VE().colonnesVisibles(v, cat);
    return { cat: cat, cols: vis, col: function (code) { var x = vis.filter(function (y) { return y.col.code === code; })[0]; return x || null; } };
  }
  /**
   * Une donnée de la case. o : { l (ligne), col, ecran, maintenant } — à l'écran, le nom du patient ouvre sa fiche (fenêtre
   * par-dessus, sans quitter la Vue d'ensemble) et une donnée modifiable (consignes…) se modifie d'un clic.
   */
  function element(e, c, police, o) {
    o = o || {};
    var vide = !c || c.lib === '—' || c.lib === '' || c.lib === null;
    if (vide && e.masquerVide && !(o.ecran && o.editable)) return null;
    var cls = 'tr-el' + (e.gras ? ' tr-gras' : '') + (e.italique ? ' tr-italique' : '') + (e.souligne ? ' tr-souligne' : '') + (e.majuscules ? ' tr-maj' : '') + (e.ligne ? ' tr-alaligne' : '');
    var coul = c && c.couleur ? U.champs.classeCouleur(c.couleur) : '';
    var el = h(e.ligne ? 'div' : 'span', { class: cls + (coul ? ' ' + coul : '') });
    if (e.taille) el.style.fontSize = (e.taille / police) + 'em';
    if (c && c.couleur && c.couleur.libelle) el.title = c.couleur.libelle;
    if (e.etiquette && c) el.appendChild(h('span', { class: 'tr-etiquette', text: (e.libelle || c.libelleCol) + ' : ' }));
    var lib = vide ? '—' : c.lib;
    // Format de date choisi (12 novembre 2026) : date d'entrée en « J60 », autres dates en « 40 j »
    if (!vide && e.format && o.col && (o.col.type === 'date')) lib = T.formaterDate(c.brute, e.format, { j: o.col.code === 'entree', maintenant: o.maintenant }) || lib;
    if (c && c.liste && c.liste.length) c.liste.forEach(function (x) { el.appendChild(h('div', { class: 'tr-evt', text: x.quand + ' ' + x.titre })); });
    else if (o.ecran && o.col && o.col.code === 'patient' && U.fichePatient) {
      el.appendChild(h('button', { class: 'btn lien tr-lien', type: 'button', title: 'Ouvrir la fiche du patient', text: lib, onclick: function (ev) { ev.stopPropagation(); U.fichePatient.modale(((U.st() && U.st().patients) || {})[o.l.p.id] || o.l.p); } }));
    } else el.appendChild(h('span', { text: vide && o.editable ? (e.etiquette ? '—' : (e.libelle || c.libelleCol) + ' : —') : lib }));
    if (vide && o.ecran && o.editable && e.masquerVide) el.classList.add('tr-vide');   // à l'écran seulement, pour la remplir
    if (o.ecran && o.editable) {
      el.classList.add('tr-modifiable'); el.tabIndex = 0; el.title = 'Modifier : ' + c.libelleCol;
      var ouvrir = function (ev) {
        ev.stopPropagation();
        var cont = el.closest('.tr-contenu'); if (cont) { cont.classList.remove('fixe'); cont.style.height = ''; cont.style.fontSize = ''; }
        VE().editer(el, o.col, o.l, c);
      };
      el.addEventListener('click', function (ev) { if (!el.querySelector('.edition-case')) ouvrir(ev); });
      el.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && !el.querySelector('.edition-case')) { ev.preventDefault(); ouvrir(ev); } });
    }
    if (!e.ligne) el.insertBefore(document.createTextNode(' '), el.firstChild);
    return el;
  }
  function contenuCase(k, l, ctx, cv, police, ecran) {
    if (k.notes) return [];
    var colsTous = cv.cols.map(function (x) { return x.col; });
    return k.elements.map(function (e) {
      var x = cv.col(e.code);
      if (!x) return null;
      var c = V.cellule(x.col, l, ctx, x.vcol, colsTous);
      c.libelleCol = x.col.libelle;
      // Médecins : libellé du service de la ligne (« Psychiatre de 1re ligne » en psychiatrie, réglage de la fiche patient)
      if ((x.col.code === 'medecin1' || x.col.code === 'medecin2') && SIC.patients && SIC.patients.optionsFiche) c.libelleCol = SIC.patients.optionsFiche(cfg(), l.service)[x.col.code];
      if (x.col.code === 'evenements') { var r = x.col.lire(l); c.liste = r.liste; }
      var editable = !!ecran && x.col.code !== 'patient' && VE().modifiable(x.col, l);
      return element(e, c, police, { l: l, col: x.col, ecran: ecran, editable: editable, maintenant: ctx.maintenant });
    }).filter(Boolean);
  }

  // ------------------------------------------------------------ Tableau (écran et impression)
  /**
   * Tableau de transmissions. o : { echelle (1), impression (largeurs en %), entete, pied (textes remplis), redim (v, t) }.
   * Renvoie { table, ajuster() }.
   */
  function tableau(v, t, ctx, o) {
    o = o || {};
    var k = o.echelle || 1, cv = catalogueVisible(v, ctx), cat = cv.cat;
    var ls = V.lignes(v, ctx), groupes = V.ranger(v, ls, cat, ctx, cv.cols.map(function (x) { return x.col; }));
    var n = t.cases.length, total = t.cases.reduce(function (s, c) { return s + (c.largeur || 120); }, 0);
    var table = h('table', { class: 'tr-tableau sans-tri sans-largeurs' + (o.impression ? ' tr-imprime' : '') });
    table.style.fontSize = (t.police * k) + 'pt';
    if (!o.impression) table.style.width = total + 'px';
    var cg = h('colgroup');
    t.cases.forEach(function (c) { var col = h('col'); col.style.width = o.impression ? ((c.largeur || 120) / total * 100) + '%' : (c.largeur || 120) + 'px'; cg.appendChild(col); });
    table.appendChild(cg);
    var thead = h('thead');
    if (o.entete) thead.appendChild(h('tr', { class: 'tr-entete' }, h('td', { colspan: n }, o.entete)));
    var trT = h('tr', { class: 'tr-titres' });
    t.cases.forEach(function (c, i) {
      var th = h('th', { scope: 'col' }, h('span', { text: c.titre || (c.notes ? 'Notes' : '') }));
      if (t.hauteurTitre) th.style.height = (t.hauteurTitre * k) + 'mm';
      if (o.redim) th.appendChild(poignee(th, v, t, i));
      trT.appendChild(th);
    });
    thead.appendChild(trT);
    table.appendChild(thead);
    if (o.pied) table.appendChild(h('tfoot', {}, h('tr', { class: 'tr-pied' }, h('td', { colspan: n }, o.pied))));
    var tbody = h('tbody');
    groupes.forEach(function (g) {
      if (g.titre && g.lignes.length) tbody.appendChild(h('tr', { class: 'tr-groupe' }, h('td', { colspan: n, text: g.titre + ' (' + g.lignes.length + ')' })));
      g.lignes.forEach(function (l) {
        var tr = h('tr', { class: 'tr-ligne' });
        t.cases.forEach(function (c) {
          var div = h('div', { class: 'tr-contenu' + (t.hauteurLigne ? ' fixe' : '') + (c.notes ? ' tr-notes' : '') }, contenuCase(c, l, ctx, cv, t.police, !o.impression));
          if (t.hauteurLigne) div.style.height = (t.hauteurLigne * k) + 'mm';
          var td = h('td', {}, div);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    });
    if (!ls.length) tbody.appendChild(h('tr', {}, h('td', { colspan: n, class: 'muted', text: 'Aucun patient.' })));
    table.appendChild(tbody);
    /** Texte réduit pour tenir dans les cases de hauteur fixe (une fois le tableau affiché). */
    function ajuster() {
      if (!t.ajuster || !t.hauteurLigne) return;
      Array.prototype.forEach.call(table.querySelectorAll('.tr-contenu.fixe'), function (d) {
        var f = 1;
        d.style.fontSize = '';
        while (d.scrollHeight > d.clientHeight + 1 && f > 0.5) { f = Math.round((f - 0.06) * 100) / 100; d.style.fontSize = f + 'em'; }
      });
    }
    return { table: table, ajuster: ajuster, lignes: ls.length };
  }
  /** Poignée de largeur d'une case (glisser ; double-clic : largeur par défaut). */
  function poignee(th, v, t, i) {
    var p = h('span', { class: 'poignee-largeur', title: 'Glisser pour régler la largeur ; double-clic : largeur par défaut', 'aria-hidden': 'true' });
    var x0 = 0, l0 = 0, actif = false, table = null;
    function bouger(ev) { if (!actif) return; var w = Math.max(30, Math.min(900, Math.round(l0 + ev.clientX - x0))); var col = table.querySelectorAll('col')[i]; col.style.width = w + 'px'; table.style.width = Array.prototype.reduce.call(table.querySelectorAll('col'), function (s, c) { return s + parseFloat(c.style.width || 120); }, 0) + 'px'; }
    async function finir() {
      if (!actif) return; actif = false;
      document.removeEventListener('pointermove', bouger); document.removeEventListener('pointerup', finir); document.body.classList.remove('redimension');
      var nt = JSON.parse(JSON.stringify(t)); nt.cases[i].largeur = Math.round(parseFloat(table.querySelectorAll('col')[i].style.width));
      try { await enregistrer(v, T.normaliser(nt), versModeleParDefaut(v)); } catch (e) { U.toast(e.message); }
    }
    p.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ev.stopPropagation(); table = th.closest('table'); actif = true; x0 = ev.clientX; l0 = th.getBoundingClientRect().width; document.body.classList.add('redimension'); document.addEventListener('pointermove', bouger); document.addEventListener('pointerup', finir); });
    p.addEventListener('dblclick', function (ev) { ev.stopPropagation(); var nt = JSON.parse(JSON.stringify(t)); nt.cases[i].largeur = 0; enregistrer(v, T.normaliser(nt), versModeleParDefaut(v)).catch(function (e) { U.toast(e.message); }); });
    return p;
  }

  // ------------------------------------------------------------ Écran
  function vue(v) {
    var t = miseEnPage(v), ctx = VE().contexte({ jours: t.evenementsJours }), perso = !!copie(v), modele = peutModele(v);
    var r = tableau(v, t, ctx, { redim: true });
    var barre = h('div', { class: 'actions gauche barre-vue' },
      h('h2', { text: v.nom }), h('span', { class: 'muted', text: (v.services.length ? v.services.map(U.libService).join(', ') : 'Établissement') + ' — patients : ' + r.lignes + (perso ? ' — votre copie personnelle' : '') }),
      h('span', { class: 'espace' }),
      h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleImprimer(v); } }, 'Imprimer'),
      h('button', { class: 'btn', type: 'button', title: perso ? 'Régler votre copie personnelle' : (modele ? 'Régler le modèle du service' : 'Régler votre copie personnelle (le modèle du service n’est pas modifié)'), onclick: function () { modaleMiseEnPage(v); } }, 'Mise en page'),
      perso ? h('button', { class: 'btn', type: 'button', title: 'Supprimer votre copie et reprendre le modèle du service', onclick: function () { if (confirm('Supprimer votre copie personnelle et reprendre le modèle du service ?')) enregistrerCopie(v, null).then(function () { U.rendreContenu(); }); } }, 'Reprendre le modèle')
        : h('button', { class: 'btn', type: 'button', title: 'Garder votre propre mise en page de ce tableau', onclick: function () { enregistrerCopie(v, JSON.parse(JSON.stringify(t))).then(function () { U.toast('Copie personnelle créée.'); U.rendreContenu(); }); } }, 'Faire ma copie'),
      modele ? h('button', { class: 'btn', type: 'button', onclick: function () { VE().modaleVue(v); } }, 'Régler la vue') : null,
      modele || U.App.session.roles().indexOf('CADRE') >= 0 ? h('button', { class: 'btn', type: 'button', title: 'Nouveau tableau de transmissions pour vos services', onclick: nouveau }, '+ Tableau') : null);
    var cadre = h('div', { class: 'tr-cadre' }, r.table);
    setTimeout(r.ajuster, 0);
    return h('div', { class: 'pile vue-ensemble' }, barre, cadre,
      h('small', { class: 'muted', text: 'Le tableau tel qu’il sera imprimé. Clic sur le nom d’un patient : sa fiche, par-dessus le tableau. Clic sur une donnée soulignée en pointillés (consignes…) : la modifier sur place, Entrée pour enregistrer. Glissez le bord d’un titre pour régler une colonne ; « Mise en page » pour les données, leur mise en forme et le format des dates.' }));
  }
  async function nouveau() {
    var admin = session().roles().indexOf('ADMIN') >= 0, mes = compte().services || [];
    var nom = prompt('Nom du nouveau tableau de transmissions :', 'Transmissions');
    if (!nom || !nom.trim()) return;
    var id = 'tr' + SIC.crypto.hex(SIC.crypto.aleatoire(3)), l = VE().vuesBrutes();
    l.push({ id: id, nom: nom.trim().slice(0, 60), type: 'transmissions', lignes: 'patients', services: admin ? [] : mes.slice(), roles: [], perimetre: 'hospitalises', tri: { colonne: 'chambre', sens: 1 }, transmissions: T.modele(), groupes: [], synthese: [], par: { role: admin ? 'ADMIN' : 'CADRE', services: admin ? [] : mes.slice() } });
    try { await U.enregistrerConfig([['vuesEnsemble', Object.assign({}, cfg().vuesEnsemble || {}, { vues: l })]]); U.App.onglet = 'v:' + id; U.rendreContenu(); } catch (e) { U.toast(e.message); }
  }

  // ------------------------------------------------------------ Mise en page
  var TAILLES = [0, 6, 7, 8, 9, 10, 11, 12, 14, 16];
  function modaleMiseEnPage(v) {
    var t = JSON.parse(JSON.stringify(miseEnPage(v))), ctx = VE().contexte({}), cv = catalogueVisible(v, Object.assign({}, ctx));
    // Toutes les données des patients que l'agent peut lire (catalogue complet, pas seulement celles de la vue)
    var cat = V.catalogue('patients', ctx).filter(function (c) { return !c.champ || c.champ.type !== 'formule'; });
    var zone = h('div', { class: 'pile' }), dernier = null;
    function champTexte(val, aria, f) { var i = h('input', { type: 'text', maxlength: 160, value: val || '', 'aria-label': aria }); i.addEventListener('input', function () { f(i.value); }); i.addEventListener('focus', function () { dernier = { el: i, f: f }; }); return i; }
    function dessiner() {
      U.vider(zone);
      t.cases.forEach(function (c, i) {
        var titre = h('input', { type: 'text', maxlength: 60, value: c.titre || '', 'aria-label': 'Titre de la case ' + (i + 1) }); titre.addEventListener('input', function () { c.titre = titre.value; });
        var larg = h('input', { type: 'number', min: 30, max: 900, value: c.largeur || 120, class: 'champ-court', 'aria-label': 'Largeur de la case ' + (i + 1) + ' (pixels)' }); larg.addEventListener('change', function () { c.largeur = +larg.value || 0; });
        var notes = h('input', { type: 'checkbox', checked: !!c.notes, 'aria-label': 'Case vide pour les notes (case ' + (i + 1) + ')' }); notes.addEventListener('change', function () { c.notes = notes.checked; if (c.notes) c.elements = []; dessiner(); });
        var tb = h('tbody');
        (c.elements || []).forEach(function (e, j) {
          var sel = h('select', { 'aria-label': 'Donnée ' + (j + 1) + ' (case ' + (i + 1) + ')' }, cat.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === e.code }); }));
          if (!cat.some(function (x) { return x.code === e.code; })) sel.insertBefore(h('option', { value: e.code, text: e.code + ' (non disponible)', selected: true }), sel.firstChild);
          sel.addEventListener('change', function () { e.code = sel.value; dessiner(); });
          var colE = cat.filter(function (x) { return x.code === e.code; })[0];
          var format = colE && colE.type === 'date' ? h('select', { 'aria-label': 'Format de date (donnée ' + (j + 1) + ', case ' + (i + 1) + ')' }, Object.keys(T.FORMATS_DATE).map(function (k) { return h('option', { value: k, text: T.FORMATS_DATE[k], selected: (e.format || '') === k }); })) : h('span', { class: 'muted', text: '—' });
          if (format.tagName === 'SELECT') format.addEventListener('change', function () { e.format = format.value; });
          var taille = h('select', { 'aria-label': 'Taille (donnée ' + (j + 1) + ', case ' + (i + 1) + ')' }, TAILLES.map(function (n) { return h('option', { value: n, text: n ? n + ' pt' : 'Normale', selected: (e.taille || 0) === n }); }));
          taille.addEventListener('change', function () { e.taille = +taille.value; });
          function cb(k, lib) { var x = h('input', { type: 'checkbox', checked: !!e[k], 'aria-label': lib + ' (donnée ' + (j + 1) + ', case ' + (i + 1) + ')' }); x.addEventListener('change', function () { e[k] = x.checked; }); return h('td', { class: 'centre' }, x); }
          var libE = h('input', { type: 'text', maxlength: 40, value: e.libelle || '', placeholder: 'par défaut', class: 'champ-court', 'aria-label': 'Libellé (donnée ' + (j + 1) + ', case ' + (i + 1) + ')' }); libE.addEventListener('input', function () { e.libelle = libE.value; });
          tb.appendChild(h('tr', {}, h('td', {}, sel), h('td', {}, format), h('td', {}, taille), cb('gras', 'Gras'), cb('italique', 'Italique'), cb('souligne', 'Souligné'), cb('majuscules', 'Majuscules'), cb('ligne', 'À la ligne'), cb('etiquette', 'Afficher le libellé'), h('td', {}, libE),
            h('td', { class: 'actions-ligne' },
              h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Monter la donnée ' + (j + 1), disabled: j === 0, onclick: function () { c.elements.splice(j - 1, 0, c.elements.splice(j, 1)[0]); dessiner(); } }, '↑'),
              h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la donnée ' + (j + 1) + ' (case ' + (i + 1) + ')', onclick: function () { c.elements.splice(j, 1); dessiner(); } }, '✕'))));
        });
        zone.appendChild(h('fieldset', { class: 'tr-reglage-case' },
          h('legend', { text: 'Case ' + (i + 1) + (c.titre ? ' — ' + c.titre : '') }),
          h('div', { class: 'actions gauche' }, h('label', {}, 'Titre', titre), h('label', {}, 'Largeur (pixels)', larg), h('label', { class: 'case' }, notes, h('span', { text: 'Case vide pour les notes' })), h('span', { class: 'espace' }),
            h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Case ' + (i + 1) + ' vers la gauche', disabled: i === 0, onclick: function () { t.cases.splice(i - 1, 0, t.cases.splice(i, 1)[0]); dessiner(); } }, '←'),
            h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Case ' + (i + 1) + ' vers la droite', disabled: i === t.cases.length - 1, onclick: function () { t.cases.splice(i + 1, 0, t.cases.splice(i, 1)[0]); dessiner(); } }, '→'),
            h('button', { class: 'btn petit danger', type: 'button', 'aria-label': 'Retirer la case ' + (i + 1), disabled: t.cases.length < 2, onclick: function () { t.cases.splice(i, 1); dessiner(); } }, 'Retirer')),
          c.notes ? h('p', { class: 'muted', text: 'Case laissée vide pour prendre des notes.' }) : h('div', { class: 'table-wrap' }, h('table', { class: 'sans-tri tr-reglage-elements' },
            h('thead', {}, h('tr', {}, ['Donnée', 'Format de date', 'Taille', 'Gras', 'Italique', 'Souligné', 'Majuscules', 'À la ligne', 'Libellé', 'Libellé affiché', ''].map(function (x) { return h('th', { text: x }); }))), tb)),
          c.notes ? null : h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { c.elements.push({ code: cat[0].code, ligne: c.elements.length > 0 }); dessiner(); } }, '+ Donnée'))));
      });
      zone.appendChild(h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { t.cases.push({ id: 'c' + SIC.crypto.hex(SIC.crypto.aleatoire(2)), titre: 'Nouvelle case', largeur: 140, elements: [] }); dessiner(); } }, '+ Case'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { t.cases.push({ id: 'n' + SIC.crypto.hex(SIC.crypto.aleatoire(2)), titre: 'Notes', largeur: 200, notes: true, elements: [] }); dessiner(); } }, '+ Case pour les notes')));
    }
    dessiner();
    function nombre(val, min, max, aria, f) { var i = h('input', { type: 'number', min: min, max: max, value: val, class: 'champ-court', 'aria-label': aria }); i.addEventListener('change', function () { f(+i.value || 0); }); return i; }
    var imp = t.impression;
    var ajuster = h('input', { type: 'checkbox', checked: t.ajuster !== false }); ajuster.addEventListener('change', function () { t.ajuster = ajuster.checked; });
    var orient = h('select', { 'aria-label': 'Orientation' }, Object.keys(T.ORIENTATIONS).map(function (k) { return h('option', { value: k, text: T.ORIENTATIONS[k], selected: imp.orientation === k }); })); orient.addEventListener('change', function () { imp.orientation = orient.value; });
    var taches = h('select', { 'aria-label': 'Tâches du poste' }, Object.keys(T.TACHES).map(function (k) { return h('option', { value: k, text: T.TACHES[k], selected: imp.taches === k }); })); taches.addEventListener('change', function () { imp.taches = taches.value; });
    var num = h('input', { type: 'checkbox', checked: imp.numero !== false }); num.addEventListener('change', function () { imp.numero = num.checked; });
    function zonesTextes(nomZ, obj) {
      return h('div', { class: 'grille-3' }, ['gauche', 'centre', 'droite'].map(function (k) { return h('label', {}, nomZ + ' — ' + { gauche: 'à gauche', centre: 'au centre', droite: 'à droite' }[k], champTexte(obj[k], nomZ + ' ' + k, function (x) { obj[k] = x; })); }));
    }
    var champs = h('div', { class: 'actions gauche' }, h('span', { class: 'muted', text: 'Insérer un champ (dans la zone choisie) :' }), Object.keys(T.CHAMPS).map(function (k) {
      return h('button', { class: 'btn petit', type: 'button', onmousedown: function (ev) { ev.preventDefault(); }, onclick: function () {
        if (!dernier) return U.toast('Cliquez d’abord dans une zone de l’en-tête ou du pied de page.');
        var el = dernier.el, p = el.selectionStart == null ? el.value.length : el.selectionStart, ins = '{' + k + '}';
        el.value = el.value.slice(0, p) + ins + el.value.slice(el.selectionEnd == null ? p : el.selectionEnd); dernier.f(el.value); el.focus(); el.setSelectionRange(p + ins.length, p + ins.length);
      } }, T.CHAMPS[k]);
    }));
    var versModele = versModeleParDefaut(v);
    var corps = h('div', { class: 'pile' },
      copie(v) ? h('p', { class: 'info', text: 'Vous réglez votre copie personnelle : le modèle du service n’est pas modifié.' }) : (peutModele(v) ? h('p', { class: 'info', text: 'Vous réglez le modèle du service : chaque agent qui n’a pas de copie personnelle le retrouve.' }) : h('p', { class: 'info', text: 'Vos réglages seront gardés dans votre copie personnelle ; le modèle du service n’est pas modifié.' })),
      h('h3', { text: 'Cases (colonnes) et données' }), h('small', { class: 'muted', text: 'Plusieurs données par case, chacune avec sa mise en forme. « À la ligne » : la donnée commence une nouvelle ligne ; « Libellé » : son nom devant la valeur (ex. « Sorties libres : Oui »). Les dates trop anciennes (dernier entretien, contrat) gardent leurs couleurs, réglées dans les réglages des données.' }), zone,
      h('h3', { text: 'Lignes' }),
      h('div', { class: 'actions gauche' }, h('label', {}, 'Taille du texte (pt)', nombre(t.police, 6, 14, 'Taille du texte', function (n) { t.police = n; })),
        h('label', {}, 'Hauteur des lignes (mm, 0 : selon le contenu)', nombre(t.hauteurLigne, 0, 120, 'Hauteur des lignes', function (n) { t.hauteurLigne = n; })),
        h('label', {}, 'Hauteur de la ligne de titre (mm, 0 : automatique)', nombre(t.hauteurTitre, 0, 40, 'Hauteur de la ligne de titre', function (n) { t.hauteurTitre = n; })),
        h('label', { class: 'case' }, ajuster, h('span', { text: 'Réduire le texte pour qu’il tienne dans la case' }))),
      h('label', { class: 'en-ligne' }, 'Prochains événements : sur', nombre(t.evenementsJours, 1, 14, 'Jours des prochains événements', function (n) { t.evenementsJours = n; }), h('span', { text: 'jours' })),
      h('h3', { text: 'Impression' }),
      h('div', { class: 'actions gauche' }, h('label', {}, 'Nombre de faces', nombre(imp.faces, 1, 20, 'Nombre de faces', function (n) { imp.faces = n; })), h('label', {}, 'Orientation', orient),
        h('label', { class: 'case' }, num, h('span', { text: 'Numéro de page (« page X sur Y »)' })), h('label', {}, 'Tâches du poste', taches)),
      h('small', { class: 'muted', text: 'Le tableau est réduit pour tenir sur ce nombre de faces (4 : deux feuilles recto verso), marges étroites. Choisissez le recto verso dans la fenêtre d’impression du navigateur.' }),
      zonesTextes('En-tête', imp.entete), zonesTextes('Pied de page', imp.pied), champs);
    U.modale('Mise en page — ' + v.nom, corps, [{ texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        if (t.cases.some(function (c) { return !c.notes && !c.elements.length && !String(c.titre || '').trim(); })) throw new Error('Une case sans donnée doit avoir un titre (ou être une case pour les notes).');
        await enregistrer(v, T.normaliser(t), versModele);
      } }], { large: true });
  }

  // ------------------------------------------------------------ Impression
  function periodes() { var sv = (VE().contexte({}).services || [])[0]; try { return SIC.model.periodesDe(cfg(), sv); } catch (e) { return cfg().periodes || []; } }
  function jourISO(t) { return V.jourISO(t); }
  /** Tâches du poste (Agenda, si l'agent en détient la clé). */
  function tachesPoste(v, ctx, poste, jour) {
    if (!ctx.agenda || !ctx.agendaModule || !poste) return null;
    var d = new Date(jour + 'T00:00').getTime(), svs = v.services.length ? v.services : ctx.services;
    var dues = ctx.agendaModule.tachesDues(ctx.agenda, svs, d, d + 2 * 864e5);
    return T.tachesDuPoste(dues, jour, poste, jourISO(d + 864e5 + 3 * 36e5));
  }
  function blocTaches(liste, poste, jour, nouvellePage) {
    var nomAgent = function (a) { var c = (session().comptes || []).filter(function (x) { return x.id === (a && a.agent); })[0]; return c ? c.nom : (a && a.nom) || ''; };
    return h('section', { class: 'tr-taches' + (nouvellePage ? ' nouvelle-page' : '') },
      h('h2', { text: 'Tâches du poste — ' + (poste ? poste.libelle : '') + ' du ' + jour.split('-').reverse().join('/') }),
      liste && liste.length ? h('table', { class: 'sans-tri sans-largeurs' }, h('tbody', {}, liste.map(function (x) {
        return h('tr', {}, h('td', { class: 'tr-coche', text: x.fait ? '☑' : '☐' }), h('td', { class: 'nowrap', text: (x.jour !== jour ? 'lendemain ' : '') + (x.heure || 'dans la journée') }), h('td', { text: x.titre }), h('td', { class: 'muted', text: nomAgent(x.affecte) }));
      }))) : h('p', { class: 'muted', text: liste ? 'Aucune tâche prévue pour ce poste.' : 'Tâches non disponibles (accès à l’Agenda du service).' }));
  }
  function zonesRemplies(z, valeurs) {
    return h('div', { class: 'tr-zones' }, ['gauche', 'centre', 'droite'].map(function (k) { return h('span', { class: 'tr-zone-' + k, text: T.remplir(z[k], valeurs) }); }));
  }
  /** Document imprimé à l'échelle k, dans le conteneur de mesure ou la zone d'impression. */
  function documentImprime(v, t, ctx, k, valeurs, taches, poste, jour) {
    var imp = t.impression;
    var r = tableau(v, t, ctx, { echelle: k, impression: true, entete: zonesRemplies(imp.entete, valeurs), pied: zonesRemplies(imp.pied, valeurs) });
    var art = h('article', { class: 'tr-doc page-tr-' + imp.orientation + (imp.numero ? '-num' : '') }, r.table,
      imp.taches !== 'aucune' ? blocTaches(taches, poste, jour, imp.taches === 'page') : null);
    art.style.fontSize = (t.police * k) + 'pt';
    return { art: art, r: r };
  }
  function mesurer(art) {
    var tab = art.querySelector('table.tr-tableau'), th = tab.tHead.getBoundingClientRect().height, tf = tab.tFoot ? tab.tFoot.getBoundingClientRect().height : 0;
    var lignes = Array.prototype.map.call(tab.tBodies[0].rows, function (tr) { return tr.getBoundingClientRect().height; });
    var ta = art.querySelector('.tr-taches');
    return { repete: th + tf, lignes: lignes, apres: ta ? { hauteur: ta.getBoundingClientRect().height, nouvellePage: ta.classList.contains('nouvelle-page') } : null };
  }
  /** Prépare le document ajusté au nombre de faces : { art, echelle }. */
  function preparer(v, t, valeurs, poste, jour, faces) {
    var ctx = VE().contexte({ jours: t.evenementsJours }), taches = t.impression.taches === 'aucune' ? null : tachesPoste(v, ctx, poste, jour);
    var z = T.zoneUtile(t.impression), boite = h('div', { class: 'tr-mesure' });
    boite.style.width = z.l + 'mm';
    document.body.appendChild(boite);
    var hauteurPage = z.h * PX_MM;
    function rendre(k) { U.vider(boite); var d = documentImprime(v, t, ctx, k, valeurs, taches, poste, jour); boite.appendChild(d.art); d.r.ajuster(); return d.art; }
    try {
      var e = T.echelle(faces, hauteurPage, function (k) { return mesurer(rendre(k)); });
      var art = rendre(e), m = mesurer(art), pages = T.paginer(hauteurPage, m.repete, m.lignes, m.apres);
      boite.removeChild(art);
      return { art: art, echelle: e, pages: pages };
    } finally { boite.remove(); }
  }
  function modaleImprimer(v) {
    var t = miseEnPage(v), ps = periodes(), p0 = T.posteDe(ps, Date.now());
    var selPoste = h('select', { 'aria-label': 'Poste' }, ps.map(function (p) { return h('option', { value: p.code, text: p.libelle + ' (' + p.debut + ' – ' + p.fin + ')', selected: p0 && p.code === p0.code }); }));
    var jour = h('input', { type: 'date', value: jourISO(Date.now()), 'aria-label': 'Jour' });
    var faces = h('input', { type: 'number', min: 1, max: 20, value: t.impression.faces, class: 'champ-court', 'aria-label': 'Nombre de faces' });
    U.modale('Imprimer — ' + v.nom, h('div', { class: 'pile' },
      h('div', { class: 'actions gauche' }, h('label', {}, 'Poste', selPoste), h('label', {}, 'Jour', jour), h('label', {}, 'Nombre de faces', faces)),
      h('small', { class: 'muted', text: 'Le tableau est réduit si besoin pour tenir sur ce nombre de faces (4 : deux feuilles recto verso). Dans la fenêtre d’impression, choisissez le recto verso et gardez l’échelle à 100 %.' })),
      [{ texte: 'Annuler' }, { texte: 'Imprimer', classe: 'primaire', action: function () {
        var poste = ps.filter(function (p) { return p.code === selPoste.value; })[0] || null, j = jour.value || jourISO(Date.now()), d = new Date();
        var svs = v.services.length ? v.services : VE().contexte({}).services;
        var valeurs = { date: d.toLocaleDateString('fr-FR'), heure: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), service: svs.map(U.libService).join(', '), poste: poste ? poste.libelle : '', agent: compte().nom, etablissement: U.etablissement() || '', titre: v.nom };
        var res = preparer(v, t, valeurs, poste, j, Math.max(1, Math.min(20, +faces.value || t.impression.faces)));
        U.App.dernierImpressionTransmissions = { echelle: res.echelle, pages: res.pages };   // vérification à l'écran (parcours)
        setTimeout(function () {
          U.toast('Tableau ajusté à ' + Math.round(res.echelle * 100) + ' % : ' + res.pages + ' face' + (res.pages > 1 ? 's' : '') + ' prévue' + (res.pages > 1 ? 's' : '') + '.');
          U.imprimer(res.art);
        }, 0);
      } }]);
  }

  U.transmissions = { vue: vue, preparer: preparer, miseEnPage: miseEnPage, modaleMiseEnPage: modaleMiseEnPage, modaleImprimer: modaleImprimer, nouveau: nouveau };
})();
