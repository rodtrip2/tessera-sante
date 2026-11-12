// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — tableur, interface (0.35.0, étape 2). Logique : tableur.js ; fenêtre du document (barre,
 * enregistrement, partage, versions, validation) : ui-documents.js, qui reçoit d'ici la « surface » du classeur.
 *
 * Grille : sélection à la souris ou au clavier (Maj + flèches), saisie directe ou dans la barre de formule (F2, double
 * clic), clic sur une case pendant la saisie d'une formule pour y insérer sa référence, copier-coller avec un tableur
 * courant (texte à tabulations) ou dans le classeur (formules recopiées), annuler et rétablir, mise en forme par classes
 * CSS (jamais d'attribut style), largeurs et hauteurs réglées à la souris, fusion, volets figés, feuilles, tri,
 * somme automatique, totaux de la sélection, impression ajustée à la largeur de la page.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, T = SIC.tableur;
  var LARGEUR = 100, HAUTEUR = 22;
  var FONCTIONS_AIDE = { SOMME: 'SOMME(A1:A10)', MOYENNE: 'MOYENNE(A1:A10)', MIN: 'MIN(A1:A10)', MAX: 'MAX(A1:A10)', NB: 'NB(A1:A10) — nombres', NBVAL: 'NBVAL(A1:A10) — cases non vides',
    'NB.SI': 'NB.SI(A1:A10;">5")', 'SOMME.SI': 'SOMME.SI(A1:A10;"x";B1:B10)', SI: 'SI(A1>5;"oui";"non")', SIERREUR: 'SIERREUR(A1/B1;0)', ET: 'ET(A1>0;B1>0)', OU: 'OU(A1>0;B1>0)',
    ARRONDI: 'ARRONDI(A1;2)', AUJOURDHUI: 'AUJOURDHUI()', JOURS: 'JOURS(fin;début)', DATE: 'DATE(2026;12;31)', CONCATENER: 'CONCATENER(A1;" ";B1)', RECHERCHEV: 'RECHERCHEV(valeur;A1:C10;2;FAUX)' };

  function classesCase(s, v) {
    s = s || {};
    var c = [];
    if (s.g) c.push('tb-g'); if (s.i) c.push('tb-i'); if (s.s) c.push('tb-s'); if (s.b) c.push('tb-b'); if (s.r) c.push('tb-r'); if (s.bd) c.push('tb-bd');
    if (s.p) c.push('fp-' + s.p); if (s.z) c.push('ft-' + s.z); if (s.c) c.push('fc-' + s.c); if (s.f) c.push('ff-' + s.f);
    c.push('tb-al-' + T.alignement(v, s));
    if (T.estErr(v)) c.push('tb-err');
    return c.join(' ');
  }
  function fusionDe(f, l, c) { return f.fusions.filter(function (u) { return l >= u.l && l < u.l + u.nl && c >= u.c && c < u.c + u.nc; })[0] || null; }

  /**
   * Surface d'édition d'un classeur. `o` : { modifiable, changer() (modification à enregistrer) }.
   * Retourne { outils, zone, lire(), page, redessiner(), focus(), detruire() }.
   */
  function surface(contenu, o) {
    var C = T.contenu(contenu), fi = 0, modifiable = !!o.modifiable;
    var sel = { l1: 0, c1: 0, l2: 0, c2: 0, l: 0, c: 0 }, ancre = { l: 0, c: 0 }, bout = null, edition = null, glisse = null, presse = null;
    var annuler = [], retablir = [], calc = null, vue = { l: 0, c: 0 }, interne = null;
    function F() { return C.feuilles[fi]; }
    function recalculer() { calc = T.calculer(C, { maintenant: Date.now() }); }
    recalculer();
    function memoriser() { annuler.push(JSON.stringify({ C: C, fi: fi })); if (annuler.length > 100) annuler.shift(); retablir = []; }
    function modifie(redessin) { recalculer(); if (redessin !== false) dessiner(); o.changer(); }
    function caseDe(l, c) { return F().cellules[T.nom(l, c)]; }
    function ecrireCase(l, c, x) { var k = T.nom(l, c), y = T.caseValide(x); if (y) F().cellules[k] = y; else delete F().cellules[k]; }

    // -------------------------------------------------------- Éléments
    var nomCase = h('input', { type: 'text', class: 'tb-nom', 'aria-label': 'Case', spellcheck: 'false' });
    var fx = h('input', { type: 'text', class: 'tb-fx', 'aria-label': 'Contenu de la case (valeur ou formule)', spellcheck: 'false', readonly: !modifiable });
    var aideFx = h('span', { class: 'tb-aide muted', 'aria-live': 'polite' });
    var grille = h('div', { class: 'tb-grille', tabindex: '0', role: 'grid', 'aria-label': 'Feuille de calcul' });
    var tableau = h('table', { class: 'tb-table' }), cols = h('colgroup'), thead = h('thead'), tbody = h('tbody');
    tableau.appendChild(cols); tableau.appendChild(thead); tableau.appendChild(tbody); grille.appendChild(tableau);
    var onglets = h('div', { class: 'tb-onglets', role: 'tablist', 'aria-label': 'Feuilles' }), etat = h('div', { class: 'tb-etat muted', 'aria-live': 'polite' });
    var zone = h('div', { class: 'tb-zone' }, grille, h('div', { class: 'tb-bas' }, onglets, etat));

    // -------------------------------------------------------- Dessin
    function dimensions() { var e = T.etendue(F()); return { l: Math.min(T.MAX_LIGNES, Math.max(e.l + 20, 60, sel.l2 + 10, vue.l)), c: Math.min(T.MAX_COLONNES, Math.max(e.c + 4, 16, sel.c2 + 3, vue.c)) }; }
    var dim = dimensions();
    function dessiner() {
      var f = F(); dim = dimensions();
      U.vider(cols); U.vider(thead); U.vider(tbody);
      grille.classList.toggle('tb-fige-l', !!f.figer.l); grille.classList.toggle('tb-fige-c', !!f.figer.c);
      var c0 = h('col', { class: 'tb-col-num' }); cols.appendChild(c0);
      for (var c = 0; c < dim.c; c++) { var col = h('col'); col.style.width = (f.largeurs[c] || LARGEUR) + 'px'; cols.appendChild(col); }
      var tr = h('tr', {}, h('th', { class: 'tb-coin', title: 'Tout sélectionner', onmousedown: function (ev) { ev.preventDefault(); choisir(0, 0, dim.l - 1, dim.c - 1); } }));
      for (c = 0; c < dim.c; c++) tr.appendChild(enteteColonne(c));
      thead.appendChild(tr);
      var couverts = {};
      f.fusions.forEach(function (u) { for (var i = u.l; i < u.l + u.nl; i++) for (var j = u.c; j < u.c + u.nc; j++) if (i !== u.l || j !== u.c) couverts[i + ':' + j] = 1; });
      for (var l = 0; l < dim.l; l++) {
        var ligne = h('tr', {}, enteteLigne(l));
        if (f.hauteurs[l]) ligne.style.height = f.hauteurs[l] + 'px';
        for (c = 0; c < dim.c; c++) {
          if (couverts[l + ':' + c]) continue;
          var x = f.cellules[T.nom(l, c)], v = calc.valeur(fi, l, c), u = fusionDe(f, l, c);
          var td = h('td', { class: classesCase(x && x.s, v), 'data-l': l, 'data-c': c, rowspan: u ? u.nl : null, colspan: u ? u.nc : null, title: T.estErr(v) ? messageErreur(v, l, c) : null }, T.afficher(v, x && x.s));
          if (l === 0 && f.figer.l) td.classList.add('tb-fixe-l');
          if (c === 0 && f.figer.c) td.classList.add('tb-fixe-c');
          ligne.appendChild(td);
        }
        tbody.appendChild(ligne);
      }
      dessinerOnglets(); montrerSelection();
    }
    function messageErreur(v, l, c) {
      var p = calc.probleme(fi, T.nom(l, c));
      return p || { '#DIV/0!': 'Division par zéro', '#REF!': 'Référence à une case, une ligne ou une feuille supprimée', '#NOM?': 'Fonction ou nom inconnu', '#VALEUR!': 'Valeur du mauvais type (texte au lieu d’un nombre…)', '#CYCLE!': 'Référence circulaire : la formule dépend d’elle-même', '#N/A': 'Valeur non trouvée' }[v.err] || v.err;
    }
    function enteteColonne(c) {
      var poignee = h('span', { class: 'tb-poignee-c', title: 'Glisser pour changer la largeur ; double clic : largeur par défaut' });
      poignee.addEventListener('mousedown', function (ev) { if (!modifiable) return; ev.preventDefault(); ev.stopPropagation(); redimensionner('c', c, ev); });
      poignee.addEventListener('dblclick', function (ev) { if (!modifiable) return; ev.stopPropagation(); memoriser(); delete F().largeurs[c]; modifie(); });
      return h('th', { class: 'tb-entete-c', onmousedown: function (ev) { if (ev.target === poignee) return; ev.preventDefault(); if (ev.shiftKey) choisir(sel.l1, Math.min(ancre.c, c), dim.l - 1, Math.max(ancre.c, c), true); else { ancre = { l: 0, c: c }; choisir(0, c, dim.l - 1, c); } } }, T.lettres(c), poignee);
    }
    function enteteLigne(l) {
      var poignee = h('span', { class: 'tb-poignee-l', title: 'Glisser pour changer la hauteur ; double clic : hauteur par défaut' });
      poignee.addEventListener('mousedown', function (ev) { if (!modifiable) return; ev.preventDefault(); ev.stopPropagation(); redimensionner('l', l, ev); });
      poignee.addEventListener('dblclick', function (ev) { if (!modifiable) return; ev.stopPropagation(); memoriser(); delete F().hauteurs[l]; modifie(); });
      return h('th', { class: 'tb-entete-l', onmousedown: function (ev) { if (ev.target === poignee) return; ev.preventDefault(); if (ev.shiftKey) choisir(Math.min(ancre.l, l), 0, Math.max(ancre.l, l), dim.c - 1, true); else { ancre = { l: l, c: 0 }; choisir(l, 0, l, dim.c - 1); } } }, String(l + 1), poignee);
    }
    function redimensionner(axe, i, ev) {
      var depart = axe === 'c' ? ev.clientX : ev.clientY, f = F(), init = axe === 'c' ? (f.largeurs[i] || LARGEUR) : (f.hauteurs[i] || HAUTEUR), valeur = init;
      var cible = axe === 'c' ? cols.children[i + 1] : tbody.children[i];
      function bouge(e) { valeur = Math.max(axe === 'c' ? 24 : 16, Math.min(axe === 'c' ? 800 : 400, init + (axe === 'c' ? e.clientX : e.clientY) - depart)); if (axe === 'c') cible.style.width = valeur + 'px'; else cible.style.height = valeur + 'px'; }
      function fin() {
        document.removeEventListener('mousemove', bouge); document.removeEventListener('mouseup', fin);
        if (valeur === init) return;
        memoriser();
        // Plusieurs colonnes (ou lignes) sélectionnées entières : même taille pour toutes
        var plusieurs = axe === 'c' ? (sel.l1 === 0 && sel.l2 === dim.l - 1 && i >= sel.c1 && i <= sel.c2) : (sel.c1 === 0 && sel.c2 === dim.c - 1 && i >= sel.l1 && i <= sel.l2);
        var de = plusieurs ? (axe === 'c' ? sel.c1 : sel.l1) : i, a = plusieurs ? (axe === 'c' ? sel.c2 : sel.l2) : i;
        for (var k = de; k <= a; k++) (axe === 'c' ? f.largeurs : f.hauteurs)[k] = Math.round(valeur);
        modifie();
      }
      document.addEventListener('mousemove', bouge); document.addEventListener('mouseup', fin);
    }
    function dessinerOnglets() {
      U.vider(onglets);
      C.feuilles.forEach(function (f, i) {
        onglets.appendChild(h('button', { type: 'button', class: 'tb-onglet' + (i === fi ? ' actif' : ''), role: 'tab', 'aria-selected': i === fi ? 'true' : 'false',
          onclick: function () { if (i !== fi) { finirEdition(true); fi = i; sel = { l1: 0, c1: 0, l2: 0, c2: 0, l: 0, c: 0 }; ancre = { l: 0, c: 0 }; vue = { l: 0, c: 0 }; dessiner(); grille.focus(); } },
          ondblclick: function () { if (modifiable) renommer(i); } }, f.nom));
      });
      if (modifiable) {
        onglets.appendChild(h('button', { type: 'button', class: 'btn petit', title: 'Ajouter une feuille', 'aria-label': 'Ajouter une feuille', onclick: ajouterFeuille }, '+'));
        var menu = h('select', { class: 'doc-choix', 'aria-label': 'Feuille' }, [['', 'Feuille…'], ['renommer', 'Renommer'], ['dupliquer', 'Dupliquer'], ['gauche', 'Déplacer à gauche'], ['droite', 'Déplacer à droite'], ['supprimer', 'Supprimer']].map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
        menu.addEventListener('change', function () { var v = menu.value; menu.value = ''; actionFeuille(v); });
        onglets.appendChild(menu);
      }
    }
    function ajouterFeuille() {
      if (C.feuilles.length >= T.MAX_FEUILLES) return U.toast('Au plus ' + T.MAX_FEUILLES + ' feuilles.');
      memoriser(); var n = 1; while (C.feuilles.some(function (f) { return f.nom.toLowerCase() === ('feuille' + n); })) n++;
      C.feuilles.push(T.feuille({ nom: 'Feuille' + n }, C.feuilles.length)); fi = C.feuilles.length - 1; sel = { l1: 0, c1: 0, l2: 0, c2: 0, l: 0, c: 0 }; modifie();
    }
    function renommer(i) {
      var champ = h('input', { type: 'text', maxlength: 31, value: C.feuilles[i].nom, 'aria-label': 'Nom de la feuille' });
      U.modale('Renommer la feuille', h('label', {}, 'Nom', champ), [{ texte: 'Annuler' }, { texte: 'Renommer', classe: 'primaire', action: function () { var c2 = T.renommerFeuille(C, i, champ.value); memoriser(); C = c2; modifie(); } }]);
      setTimeout(function () { champ.select(); }, 50);
    }
    function actionFeuille(v) {
      if (v === 'renommer') return renommer(fi);
      if (v === 'dupliquer') { if (C.feuilles.length >= T.MAX_FEUILLES) return U.toast('Au plus ' + T.MAX_FEUILLES + ' feuilles.'); memoriser(); var copie = JSON.parse(JSON.stringify(F())); copie.nom = F().nom.slice(0, 24) + ' (copie)'; C.feuilles.splice(fi + 1, 0, copie); C = T.contenu(C); fi++; return modifie(); }
      if (v === 'gauche' && fi > 0) { memoriser(); C.feuilles.splice(fi - 1, 0, C.feuilles.splice(fi, 1)[0]); fi--; return modifie(); }
      if (v === 'droite' && fi < C.feuilles.length - 1) { memoriser(); C.feuilles.splice(fi + 1, 0, C.feuilles.splice(fi, 1)[0]); fi++; return modifie(); }
      if (v === 'supprimer') {
        if (C.feuilles.length <= 1) return U.toast('Un classeur garde au moins une feuille.');
        if (!confirm('Supprimer la feuille « ' + F().nom + ' » ? Les formules des autres feuilles qui la citent afficheront #REF!.')) return;
        memoriser(); C = T.supprimerFeuille(C, fi); fi = Math.max(0, fi - 1); modifie();
      }
    }

    // -------------------------------------------------------- Sélection
    function etendreFusions(s) {
      var f = F(), change = true;
      while (change) { change = false; f.fusions.forEach(function (u) { if (T.chevauche(u, { l: s.l1, c: s.c1, nl: s.l2 - s.l1 + 1, nc: s.c2 - s.c1 + 1 })) { var a = Math.min(s.l1, u.l), b = Math.min(s.c1, u.c), cc = Math.max(s.l2, u.l + u.nl - 1), d = Math.max(s.c2, u.c + u.nc - 1); if (a !== s.l1 || b !== s.c1 || cc !== s.l2 || d !== s.c2) { s.l1 = a; s.c1 = b; s.l2 = cc; s.c2 = d; change = true; } } }); }
      return s;
    }
    function choisir(l1, c1, l2, c2, garderCurseur) {
      finirEdition(true);
      var s = etendreFusions({ l1: Math.min(l1, l2), c1: Math.min(c1, c2), l2: Math.max(l1, l2), c2: Math.max(c1, c2) });
      sel = Object.assign(s, garderCurseur ? { l: sel.l, c: sel.c } : { l: l1, c: c1 });
      if (sel.l2 >= dim.l - 2 || sel.c2 >= dim.c - 1) { vue = { l: Math.max(vue.l, sel.l2 + 10), c: Math.max(vue.c, sel.c2 + 3) }; dessiner(); } else montrerSelection();
    }
    function montrerSelection() {
      Array.prototype.forEach.call(tbody.querySelectorAll('td.tb-sel, td.tb-cur'), function (td) { td.classList.remove('tb-sel', 'tb-cur'); });
      Array.prototype.forEach.call(thead.querySelectorAll('.tb-actif'), function (x) { x.classList.remove('tb-actif'); });
      Array.prototype.forEach.call(tbody.querySelectorAll('th.tb-actif'), function (x) { x.classList.remove('tb-actif'); });
      Array.prototype.forEach.call(tbody.querySelectorAll('td'), function (td) {
        var l = +td.getAttribute('data-l'), c = +td.getAttribute('data-c');
        if (l >= sel.l1 && l <= sel.l2 && c >= sel.c1 && c <= sel.c2 && (sel.l1 !== sel.l2 || sel.c1 !== sel.c2 || fusionDe(F(), l, c))) td.classList.add('tb-sel');
        if (l === sel.l && c === sel.c) td.classList.add('tb-cur');
      });
      for (var c = sel.c1; c <= sel.c2 && thead.firstChild; c++) if (thead.firstChild.children[c + 1]) thead.firstChild.children[c + 1].classList.add('tb-actif');
      for (var l = sel.l1; l <= sel.l2; l++) if (tbody.children[l]) tbody.children[l].firstChild.classList.add('tb-actif');
      var x = caseDe(sel.l, sel.c);
      nomCase.value = sel.l1 !== sel.l2 || sel.c1 !== sel.c2 ? T.nom(sel.l1, sel.c1) + ':' + T.nom(sel.l2, sel.c2) : T.nom(sel.l, sel.c);
      if (!edition) fx.value = T.texteSaisie(x);
      var cur = tbody.querySelector('td.tb-cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      totaux(); signalerOutils();
    }
    function totaux() {
      if (sel.l1 === sel.l2 && sel.c1 === sel.c2) { var v = calc.valeur(fi, sel.l, sel.c); U.vider(etat).appendChild(document.createTextNode(T.estErr(v) ? messageErreur(v, sel.l, sel.c) : '')); return; }
      var n = 0, s = 0, nb = 0;
      for (var l = sel.l1; l <= sel.l2; l++) for (var c = sel.c1; c <= sel.c2; c++) { var x = calc.valeur(fi, l, c); if (x !== null && x !== '') nb++; if (typeof x === 'number') { n++; s += x; } }
      etat.textContent = 'Cases non vides : ' + nb + (n ? ' — Somme : ' + T.afficher(s, {}) + ' — Moyenne : ' + T.afficher(+(s / n).toPrecision(12), {}) : '');
    }
    var signal = function () {};
    function signalerOutils() { signal(caseDe(sel.l, sel.c)); }
    function deplacer(dl, dc, etendre) {
      if (etendre) {
        // Maj + flèche : l'autre bout de la sélection bouge, la case active reste à l'ancre
        bout = bout || { l: ancre.l, c: ancre.c };
        bout = { l: Math.max(0, Math.min(T.MAX_LIGNES - 1, bout.l + dl)), c: Math.max(0, Math.min(T.MAX_COLONNES - 1, bout.c + dc)) };
        choisir(ancre.l, ancre.c, bout.l, bout.c);
        return;
      }
      bout = null;
      var u = fusionDe(F(), sel.l, sel.c), l = sel.l, c = sel.c;
      if (u) { if (dl > 0) l = u.l + u.nl - 1; if (dc > 0) c = u.c + u.nc - 1; if (dl < 0) l = u.l; if (dc < 0) c = u.c; }
      l = Math.max(0, Math.min(T.MAX_LIGNES - 1, l + dl)); c = Math.max(0, Math.min(T.MAX_COLONNES - 1, c + dc));
      var v = fusionDe(F(), l, c); if (v) { l = v.l; c = v.c; }
      ancre = { l: l, c: c }; choisir(l, c, l, c);
    }

    // -------------------------------------------------------- Saisie
    function tdDe(l, c) { return tbody.querySelector('td[data-l="' + l + '"][data-c="' + c + '"]'); }
    function commencerEdition(initial) {
      if (!modifiable || edition) return;
      var td = tdDe(sel.l, sel.c); if (!td) return;
      var x = caseDe(sel.l, sel.c), entree = h('input', { type: 'text', class: 'tb-saisie', spellcheck: 'false', 'aria-label': 'Saisie de la case ' + T.nom(sel.l, sel.c) });
      entree.value = initial !== undefined ? initial : T.texteSaisie(x);
      edition = { l: sel.l, c: sel.c, input: entree, td: td, ancien: td.textContent };
      td.textContent = ''; td.appendChild(entree); td.classList.add('tb-en-saisie');
      entree.addEventListener('input', function () { fx.value = entree.value; aide(entree.value); });
      entree.addEventListener('keydown', toucheSaisie);
      fx.value = entree.value; aide(entree.value);
      entree.focus(); entree.setSelectionRange(entree.value.length, entree.value.length);
    }
    function aide(t) {
      if (!t || t.charAt(0) !== '=') { aideFx.textContent = ''; return; }
      var m = /([A-Za-zÀ-ÿ.]+)\($/.exec(t) || /([A-Za-zÀ-ÿ.]+)\([^()]*$/.exec(t), n = m && m[1].toUpperCase();
      aideFx.textContent = n && FONCTIONS_AIDE[n] ? '=' + FONCTIONS_AIDE[n] : '';
    }
    function toucheSaisie(ev) {
      if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === 'Escape') ev.stopPropagation();   // la grille ne la traite pas une 2e fois
      if (ev.key === 'Enter') { ev.preventDefault(); if (finirEdition(true)) deplacer(ev.shiftKey ? -1 : 1, 0); grille.focus(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); if (finirEdition(true)) deplacer(0, ev.shiftKey ? -1 : 1); grille.focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finirEdition(false); grille.focus(); }
    }
    /** Fin de saisie : `valider` écrit la case. Retourne false si la formule est refusée (la saisie continue). */
    function finirEdition(valider) {
      if (!edition) return true;
      var e = edition, t = e.input.value;
      if (valider && t !== T.texteSaisie(caseDe(e.l, e.c))) {
        var r = T.saisir(t);
        if (r.f) { var p = T.verifier(r.f); if (p) { U.toast('Formule : ' + p); e.input.focus(); return false; } }
        memoriser();
        var x = caseDe(e.l, e.c), s = x && x.s ? JSON.parse(JSON.stringify(x.s)) : {};
        if (r.fmt && (!s.fmt || s.fmt === 'texte')) s.fmt = r.fmt;
        ecrireCase(e.l, e.c, r.vide ? { s: s } : r.f ? { f: r.f, s: s } : { v: s.fmt === 'texte' && typeof r.v === 'number' ? t : r.v, s: s });
        edition = null;
        modifie();
        return true;
      }
      edition = null;
      e.td.classList.remove('tb-en-saisie'); e.td.textContent = e.ancien;
      fx.value = T.texteSaisie(caseDe(e.l, e.c)); aideFx.textContent = '';
      return true;
    }
    // Barre de formule : saisie de la case courante
    fx.addEventListener('focus', function () { if (!modifiable) return; if (!edition) { commencerEdition(); if (edition) { fx.focus(); edition.parFx = true; } } });
    fx.addEventListener('input', function () { if (edition) { edition.input.value = fx.value; aide(fx.value); } });
    fx.addEventListener('keydown', function (ev) { if (edition) toucheSaisie(ev); });
    nomCase.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return; ev.preventDefault();
      var p = nomCase.value.toUpperCase().split(':'), a = T.lire(p[0]), b = p[1] ? T.lire(p[1]) : a;
      if (!a || !b) { U.toast('Case inconnue : écrivez par exemple B12 ou A1:C5.'); return; }
      ancre = a; choisir(a.l, a.c, b.l, b.c); grille.focus();
    });

    // -------------------------------------------------------- Souris
    grille.addEventListener('mousedown', function (ev) {
      var td = ev.target.closest && ev.target.closest('td'); if (!td || !grille.contains(td) || ev.button !== 0) return;
      if (td.classList.contains('tb-en-saisie')) return;
      var l = +td.getAttribute('data-l'), c = +td.getAttribute('data-c');
      // Saisie d'une formule en cours : le clic insère la référence de la case (glisser : une plage)
      if (edition && /^=/.test(edition.input.value) && /[=(;:+\-*\/^&<>]\s*$/.test(edition.input.value.slice(0, edition.input.selectionStart == null ? edition.input.value.length : edition.input.selectionStart))) {
        ev.preventDefault();
        var inp = edition.input, pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart, debut = inp.value.slice(0, pos), fin = inp.value.slice(pos), ref = T.nom(l, c);
        inp.value = debut + ref + fin; presse = { formule: true, debut: debut, fin: fin, l: l, c: c };
        fx.value = inp.value; setTimeout(function () { inp.focus(); inp.setSelectionRange(debut.length + ref.length, debut.length + ref.length); }, 0);
        return;
      }
      ev.preventDefault();
      if (ev.shiftKey) { bout = { l: l, c: c }; choisir(ancre.l, ancre.c, l, c); }
      else { ancre = { l: l, c: c }; bout = null; choisir(l, c, l, c); }
      presse = { l: ancre.l, c: ancre.c };
      grille.focus();
    });
    grille.addEventListener('mouseover', function (ev) {
      if (!presse) return;
      var td = ev.target.closest && ev.target.closest('td'); if (!td || !grille.contains(td)) return;
      var l = +td.getAttribute('data-l'), c = +td.getAttribute('data-c');
      if (presse.formule) { if (!edition) return; var ref = (presse.l === l && presse.c === c) ? T.nom(l, c) : T.nom(Math.min(presse.l, l), Math.min(presse.c, c)) + ':' + T.nom(Math.max(presse.l, l), Math.max(presse.c, c)); edition.input.value = presse.debut + ref + presse.fin; fx.value = edition.input.value; return; }
      bout = { l: l, c: c }; choisir(presse.l, presse.c, l, c);
    });
    document.addEventListener('mouseup', finPresse);
    function finPresse() { presse = null; }
    grille.addEventListener('dblclick', function (ev) { var td = ev.target.closest && ev.target.closest('td'); if (td && !td.classList.contains('tb-en-saisie')) commencerEdition(); });

    // -------------------------------------------------------- Clavier
    grille.addEventListener('keydown', function (ev) {
      if (edition && ev.target === edition.input) return;
      var ctrl = ev.ctrlKey || ev.metaKey, k = ev.key;
      if (ctrl && k.toLowerCase() === 'z') { ev.preventDefault(); defaire(); return; }
      if (ctrl && (k.toLowerCase() === 'y' || (ev.shiftKey && k.toLowerCase() === 'z'))) { ev.preventDefault(); refaire(); return; }
      if (ctrl && k.toLowerCase() === 'b') { ev.preventDefault(); basculer('g'); return; }
      if (ctrl && k.toLowerCase() === 'i') { ev.preventDefault(); basculer('i'); return; }
      if (ctrl && k.toLowerCase() === 'u') { ev.preventDefault(); basculer('s'); return; }
      if (ctrl && k.toLowerCase() === 'd') { ev.preventDefault(); recopierBas(); return; }
      if (ctrl && k.toLowerCase() === 'a') { ev.preventDefault(); choisir(0, 0, dim.l - 1, dim.c - 1); return; }
      if (ctrl && k === 'Home') { ev.preventDefault(); ancre = { l: 0, c: 0 }; choisir(0, 0, 0, 0); return; }
      var dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (dirs[k]) { ev.preventDefault(); deplacer(dirs[k][0], dirs[k][1], ev.shiftKey); return; }
      if (k === 'Enter') { ev.preventDefault(); deplacer(ev.shiftKey ? -1 : 1, 0); return; }
      if (k === 'Tab') { ev.preventDefault(); deplacer(0, ev.shiftKey ? -1 : 1); return; }
      if (k === 'PageDown' || k === 'PageUp') { ev.preventDefault(); deplacer(k === 'PageDown' ? 20 : -20, 0, ev.shiftKey); return; }
      if (k === 'F2') { ev.preventDefault(); commencerEdition(); return; }
      if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); effacerValeurs(); return; }
      if (!ctrl && !ev.altKey && k.length === 1 && modifiable) { ev.preventDefault(); commencerEdition(k); }
    });
    function defaire() { if (!annuler.length) return; finirEdition(false); retablir.push(JSON.stringify({ C: C, fi: fi })); var e = JSON.parse(annuler.pop()); C = e.C; fi = Math.min(e.fi, C.feuilles.length - 1); modifie(); }
    function refaire() { if (!retablir.length) return; finirEdition(false); annuler.push(JSON.stringify({ C: C, fi: fi })); var e = JSON.parse(retablir.pop()); C = e.C; fi = Math.min(e.fi, C.feuilles.length - 1); modifie(); }
    function pourSelection(f) { for (var l = sel.l1; l <= sel.l2; l++) for (var c = sel.c1; c <= sel.c2; c++) f(l, c); }
    function effacerValeurs() {
      if (!modifiable) return;
      memoriser();
      pourSelection(function (l, c) { var x = caseDe(l, c); if (x) ecrireCase(l, c, { s: x.s }); });
      modifie();
    }
    function recopierBas() {
      if (!modifiable || sel.l1 === sel.l2) return;
      memoriser();
      for (var c = sel.c1; c <= sel.c2; c++) { var x = caseDe(sel.l1, c); for (var l = sel.l1 + 1; l <= sel.l2; l++) { var y = x ? JSON.parse(JSON.stringify(x)) : null; if (y && y.f) y.f = T.decaler(y.f, l - sel.l1, 0); ecrireCase(l, c, y); } }
      modifie();
    }

    // -------------------------------------------------------- Copier, couper, coller
    function texteSelection() {
      var lignes = [];
      for (var l = sel.l1; l <= sel.l2; l++) { var ligne = []; for (var c = sel.c1; c <= sel.c2; c++) { var x = caseDe(l, c), v = calc.valeur(fi, l, c); ligne.push(T.estErr(v) ? v.err : T.afficher(v, x && x.s)); } lignes.push(ligne); }
      return T.ecrireTSV(lignes);
    }
    function copier(ev, couper) {
      if (edition || !grille.contains(document.activeElement) && document.activeElement !== grille) return;
      ev.preventDefault();
      var t = texteSelection(), cases = [];
      for (var l = sel.l1; l <= sel.l2; l++) { var ligne = []; for (var c = sel.c1; c <= sel.c2; c++) ligne.push(caseDe(l, c) ? JSON.parse(JSON.stringify(caseDe(l, c))) : null); cases.push(ligne); }
      interne = { texte: t, cases: cases, l: sel.l1, c: sel.c1 };
      ev.clipboardData.setData('text/plain', t);
      if (couper && modifiable) { memoriser(); pourSelection(function (l, c) { ecrireCase(l, c, null); }); modifie(); }
    }
    function coller(ev) {
      if (edition || !modifiable || (!grille.contains(document.activeElement) && document.activeElement !== grille)) return;
      ev.preventDefault();
      var t = ev.clipboardData.getData('text/plain');
      if (!t) return;
      memoriser();
      if (interne && interne.texte === t) {
        // Copie dans le classeur : formules recopiées (références relatives décalées), mise en forme comprise
        var dl = sel.l1 - interne.l, dc = sel.c1 - interne.c;
        interne.cases.forEach(function (ligne, i) { ligne.forEach(function (x, j) { var y = x ? JSON.parse(JSON.stringify(x)) : null; if (y && y.f) y.f = T.decaler(y.f, dl, dc); if (sel.l1 + i < T.MAX_LIGNES && sel.c1 + j < T.MAX_COLONNES) ecrireCase(sel.l1 + i, sel.c1 + j, y); }); });
        choisir(sel.l1, sel.c1, sel.l1 + interne.cases.length - 1, sel.c1 + interne.cases[0].length - 1);
      } else {
        var lignes = T.lireTSV(t);
        lignes.forEach(function (ligne, i) { ligne.forEach(function (v, j) {
          var l = sel.l1 + i, c = sel.c1 + j; if (l >= T.MAX_LIGNES || c >= T.MAX_COLONNES) return;
          var r = T.saisir(v), x = caseDe(l, c), s = x && x.s ? JSON.parse(JSON.stringify(x.s)) : {};
          if (r.fmt && !s.fmt) s.fmt = r.fmt;
          ecrireCase(l, c, r.vide ? { s: s } : r.f ? (T.verifier(r.f) ? { v: v, s: s } : { f: r.f, s: s }) : { v: r.v, s: s });
        }); });
        choisir(sel.l1, sel.c1, sel.l1 + lignes.length - 1, sel.c1 + Math.max.apply(null, lignes.map(function (x) { return x.length; })) - 1);
      }
      modifie();
    }
    function surCopie(ev) { copier(ev, false); } function surCoupe(ev) { copier(ev, true); } function surColle(ev) { coller(ev); }
    document.addEventListener('copy', surCopie); document.addEventListener('cut', surCoupe); document.addEventListener('paste', surColle);

    // -------------------------------------------------------- Mise en forme
    function changerStyle(f) {
      if (!modifiable) return;
      finirEdition(true); memoriser();
      pourSelection(function (l, c) { var x = caseDe(l, c) || {}, s = Object.assign({}, x.s || {}); f(s, l, c); ecrireCase(l, c, Object.assign({}, x, { s: s })); });
      modifie(); grille.focus();
    }
    function basculer(k) { var x = caseDe(sel.l, sel.c), oui = !(x && x.s && x.s[k]); changerStyle(function (s) { if (oui) s[k] = true; else delete s[k]; }); }
    function valeurStyle(k, v) { changerStyle(function (s) { if (v === '' || v === undefined) delete s[k]; else s[k] = k === 'z' || k === 'dec' ? +v : v; }); }
    function decimalesPas(sens) {
      var x = caseDe(sel.l, sel.c), s = (x && x.s) || {}, dflt = s.fmt === 'eur' || s.fmt === 'nombre' ? 2 : s.fmt === 'pct' ? 0 : 1;
      var d = Math.max(0, Math.min(6, (s.dec !== undefined ? s.dec : (sens > 0 ? dflt - 1 : dflt)) + sens));
      changerStyle(function (y) { y.dec = d; if (!y.fmt) y.fmt = 'nombre'; });
    }
    function fusionner() {
      if (!modifiable) return;
      var f = F();
      var existante = f.fusions.filter(function (u) { return u.l === sel.l1 && u.c === sel.c1 && u.nl === sel.l2 - sel.l1 + 1 && u.nc === sel.c2 - sel.c1 + 1; })[0];
      memoriser();
      if (existante) { f.fusions.splice(f.fusions.indexOf(existante), 1); return modifie(); }
      if (sel.l1 === sel.l2 && sel.c1 === sel.c2) return U.toast('Sélectionnez plusieurs cases à fusionner.');
      var autres = 0; pourSelection(function (l, c) { var x = caseDe(l, c); if ((l !== sel.l1 || c !== sel.c1) && x && (x.v !== undefined || x.f !== undefined)) autres++; });
      if (autres && !confirm('La fusion ne garde que le contenu de la case en haut à gauche. Continuer ?')) { annuler.pop(); return; }
      pourSelection(function (l, c) { if (l !== sel.l1 || c !== sel.c1) { var x = caseDe(l, c); ecrireCase(l, c, x && x.s ? { s: x.s } : null); } });
      f.fusions = f.fusions.filter(function (u) { return !T.chevauche(u, { l: sel.l1, c: sel.c1, nl: sel.l2 - sel.l1 + 1, nc: sel.c2 - sel.c1 + 1 }); });
      f.fusions.push({ l: sel.l1, c: sel.c1, nl: sel.l2 - sel.l1 + 1, nc: sel.c2 - sel.c1 + 1 });
      modifie();
    }
    function lignesColonnes(op) {
      if (!modifiable) return;
      finirEdition(true);
      var nL = sel.l2 - sel.l1 + 1, nC = sel.c2 - sel.c1 + 1, c2;
      if (op === 'l-avant') c2 = T.inserer(C, fi, 'l', sel.l1, nL);
      if (op === 'l-apres') c2 = T.inserer(C, fi, 'l', sel.l2 + 1, nL);
      if (op === 'l-suppr') { if (!confirm('Supprimer ' + (nL > 1 ? 'les lignes ' + (sel.l1 + 1) + ' à ' + (sel.l2 + 1) : 'la ligne ' + (sel.l1 + 1)) + ' ?')) return; c2 = T.inserer(C, fi, 'l', sel.l1, -nL); }
      if (op === 'c-avant') c2 = T.inserer(C, fi, 'c', sel.c1, nC);
      if (op === 'c-apres') c2 = T.inserer(C, fi, 'c', sel.c2 + 1, nC);
      if (op === 'c-suppr') { if (!confirm('Supprimer ' + (nC > 1 ? 'les colonnes ' + T.lettres(sel.c1) + ' à ' + T.lettres(sel.c2) : 'la colonne ' + T.lettres(sel.c1)) + ' ?')) return; c2 = T.inserer(C, fi, 'c', sel.c1, -nC); }
      if (!c2) return;
      memoriser(); C = c2; modifie();
    }
    function trier(dec) {
      if (!modifiable) return;
      var e = T.etendue(F()), p = sel.l1 === sel.l2 && sel.c1 === sel.c2 ? { l1: 0, l2: e.l - 1, c1: 0, c2: e.c - 1 } : { l1: sel.l1, l2: Math.min(sel.l2, e.l - 1), c1: sel.c1, c2: Math.min(sel.c2, e.c - 1) };
      if (p.l2 <= p.l1) return U.toast('Rien à trier.');
      if (F().fusions.some(function (u) { return T.chevauche(u, { l: p.l1, c: p.c1, nl: p.l2 - p.l1 + 1, nc: p.c2 - p.c1 + 1 }); })) return U.toast('Tri impossible sur des cases fusionnées.');
      var entete = p.l1 === 0 && sel.l1 === sel.l2 && confirm('La première ligne est-elle une ligne de titres (gardée en haut) ?');
      if (entete) p.l1 = 1;
      memoriser(); C = T.trier(C, fi, p, Math.max(p.c1, Math.min(sel.c, p.c2)), dec, { maintenant: Date.now() }); modifie();
    }
    function sommeAuto() {
      if (!modifiable) return;
      finirEdition(true);
      var l = sel.l2 + (sel.l1 !== sel.l2 ? 1 : 0), c = sel.c, d = sel.l1 !== sel.l2 ? sel.l1 : null, fin = sel.l1 !== sel.l2 ? sel.l2 : sel.l - 1;
      if (d === null) { d = fin; while (d >= 0 && typeof calc.valeur(fi, d, c) === 'number') d--; d++; }
      if (fin < 0 || d > fin) { ancre = { l: sel.l, c: c }; choisir(sel.l, c, sel.l, c); commencerEdition('=SOMME('); return; }
      memoriser(); var x = caseDe(l, c) || {};
      ecrireCase(l, c, { f: '=SOMME(' + T.nom(d, c) + ':' + T.nom(fin, c) + ')', s: x.s });
      ancre = { l: l, c: c }; sel = { l1: l, c1: c, l2: l, c2: c, l: l, c: c }; modifie();
    }
    function figer(v) { if (!modifiable) return; memoriser(); var f = F(); if (v === 'l') f.figer.l = f.figer.l ? 0 : 1; if (v === 'c') f.figer.c = f.figer.c ? 0 : 1; if (v === 'aucun') f.figer = { l: 0, c: 0 }; modifie(); }

    // Barre d'outils
    function bouton(lib, aria, f) { return h('button', { class: 'btn petit', type: 'button', title: aria, 'aria-label': aria, onmousedown: function (ev) { ev.preventDefault(); }, onclick: f }, lib); }
    function choix(aria, options, f) {
      var s = h('select', { 'aria-label': aria, class: 'doc-choix' }, [h('option', { value: '__', text: aria })].concat(Object.keys(options).map(function (k) { return h('option', { value: k, text: options[k] }); })));
      s.addEventListener('change', function () { var v = s.value; s.value = '__'; if (v !== '__') f(v); });
      return s;
    }
    var D = SIC.documents, tailles = {}; T.TAILLES.forEach(function (t) { tailles[t] = t + ' pt'; });
    var bG = bouton(h('b', { text: 'G' }), 'Gras (Ctrl+B)', function () { basculer('g'); }), bI = bouton(h('i', { text: 'I' }), 'Italique (Ctrl+I)', function () { basculer('i'); }), bS = bouton(h('u', { text: 'S' }), 'Souligné (Ctrl+U)', function () { basculer('s'); });
    var fonds = Object.assign({}, D.FONDS, { orange: 'Fond orange', violet: 'Fond violet' });
    var outils = modifiable ? h('div', { class: 'doc-outils', role: 'toolbar', 'aria-label': 'Mise en forme des cases' },
      choix('Police', Object.keys(D.POLICES).reduce(function (x, k) { x[k] = k ? D.POLICES[k] : 'Police par défaut'; return x; }, {}), function (v) { valeurStyle('p', v); }),
      choix('Taille', Object.assign({ '': 'Taille par défaut' }, tailles), function (v) { valeurStyle('z', v); }),
      bG, bI, bS, bouton(h('s', { text: 'ab' }), 'Barré', function () { basculer('b'); }),
      choix('Couleur', D.COULEURS, function (v) { valeurStyle('c', v); }), choix('Fond', Object.keys(fonds).reduce(function (x, k) { x[k] = k ? String(fonds[k]).replace('Surligné', 'Fond') : 'Aucun fond'; return x; }, {}), function (v) { valeurStyle('f', v); }),
      h('span', { class: 'doc-sep' }),
      bouton('⯇', 'Aligner à gauche', function () { valeurStyle('al', 'g'); }), bouton('≡', 'Centrer', function () { valeurStyle('al', 'c'); }), bouton('⯈', 'Aligner à droite', function () { valeurStyle('al', 'd'); }),
      bouton('↵', 'Renvoyer à la ligne', function () { basculer('r'); }), bouton('▦', 'Bordures (oui / non)', function () { basculer('bd'); }), bouton('⊞', 'Fusionner les cases (ou annuler la fusion)', fusionner),
      h('span', { class: 'doc-sep' }),
      choix('Format', T.FORMATS, function (v) { changerStyle(function (s) { if (v === 'std') { delete s.fmt; delete s.dec; } else s.fmt = v; }); }),
      bouton(',0', 'Une décimale de moins', function () { decimalesPas(-1); }), bouton(',00', 'Une décimale de plus', function () { decimalesPas(1); }), bouton('1 000', 'Séparateur des milliers (oui / non)', function () { basculer('mil'); }),
      h('span', { class: 'doc-sep' }),
      choix('Lignes et colonnes', { 'l-avant': 'Insérer des lignes au-dessus', 'l-apres': 'Insérer des lignes au-dessous', 'l-suppr': 'Supprimer les lignes', 'c-avant': 'Insérer des colonnes à gauche', 'c-apres': 'Insérer des colonnes à droite', 'c-suppr': 'Supprimer les colonnes' }, lignesColonnes),
      bouton('A→Z', 'Trier par ordre croissant (colonne de la case active)', function () { trier(false); }), bouton('Z→A', 'Trier par ordre décroissant', function () { trier(true); }),
      choix('Figer', { l: 'Figer la 1re ligne (oui / non)', c: 'Figer la 1re colonne (oui / non)', aucun: 'Libérer les volets' }, figer),
      bouton('Σ', 'Somme automatique', sommeAuto),
      choix('Fonction', Object.keys(FONCTIONS_AIDE).reduce(function (x, k) { x[k] = FONCTIONS_AIDE[k]; return x; }, {}), function (v) { if (!edition) commencerEdition('=' + v + '('); else { edition.input.value += v + '('; fx.value = edition.input.value; edition.input.focus(); } aide('=' + v + '('); }),
      bouton('⌫', 'Effacer la mise en forme', function () { changerStyle(function (s) { Object.keys(s).forEach(function (k) { delete s[k]; }); }); }),
      bouton('↶', 'Annuler (Ctrl+Z)', defaire), bouton('↷', 'Rétablir (Ctrl+Y)', refaire)) : null;
    signal = function (x) { var s = (x && x.s) || {}; [[bG, 'g'], [bI, 'i'], [bS, 's']].forEach(function (b) { b[0].classList.toggle('actif', !!s[b[1]]); b[0].setAttribute('aria-pressed', s[b[1]] ? 'true' : 'false'); }); };
    var barreFormule = h('div', { class: 'tb-barre-formule' }, nomCase, h('span', { class: 'tb-fx-lib', text: 'fx' }), fx, aideFx);

    dessiner();
    return {
      outils: h('div', {}, outils, barreFormule),
      zone: zone,
      page: C.page,
      lire: function () { finirEdition(true); return JSON.parse(JSON.stringify(C)); },
      appliquerPage: function (p) { C.page = T.page(p); this.page = C.page; },
      redessiner: dessiner,
      feuille: function () { return fi; },
      focus: function () { grille.focus(); },
      detruire: function () { document.removeEventListener('copy', surCopie); document.removeEventListener('cut', surCoupe); document.removeEventListener('paste', surColle); document.removeEventListener('mouseup', finPresse); }
    };
  }

  // ------------------------------------------------------------ Lecture seule et impression
  /** Tableau d'une feuille (étendue utilisée), pour l'aperçu d'une version et l'impression. */
  function tableFeuille(C, fi, options) {
    var o = options || {}, f = C.feuilles[fi], e = T.etendue(f), calc = T.calculer(C, { maintenant: Date.now() }), t = h('table', { class: 'tb-table tb-imprime' + (o.quadrillage !== false ? ' tb-quadrille' : '') });
    if (!e.l || !e.c) return h('p', { class: 'muted', text: 'Feuille vide.' });
    var cg = h('colgroup'), total = 0;
    for (var c = 0; c < e.c; c++) { var col = h('col'); col.style.width = (f.largeurs[c] || LARGEUR) + 'px'; total += f.largeurs[c] || LARGEUR; cg.appendChild(col); }
    t.appendChild(cg);
    var couverts = {}; f.fusions.forEach(function (u) { for (var i = u.l; i < u.l + u.nl; i++) for (var j = u.c; j < u.c + u.nc; j++) if (i !== u.l || j !== u.c) couverts[i + ':' + j] = 1; });
    var thead = o.repeter ? h('thead') : null, tbody = h('tbody');
    for (var l = 0; l < e.l; l++) {
      var tr = h('tr'); if (f.hauteurs[l]) tr.style.height = f.hauteurs[l] + 'px';
      for (c = 0; c < e.c; c++) {
        if (couverts[l + ':' + c]) continue;
        var x = f.cellules[T.nom(l, c)], v = calc.valeur(fi, l, c), u = fusionDe(f, l, c);
        tr.appendChild(h('td', { class: classesCase(x && x.s, v), rowspan: u ? u.nl : null, colspan: u ? u.nc : null }, T.afficher(v, x && x.s)));
      }
      (l === 0 && thead ? thead : tbody).appendChild(tr);
    }
    if (thead) t.appendChild(thead);
    t.appendChild(tbody);
    t.largeurTotale = total;
    return t;
  }
  function apercu(contenu) {
    var C = T.contenu(contenu);
    return h('div', { class: 'pile' }, C.feuilles.map(function (f, i) { return h('div', { class: 'pile' }, C.feuilles.length > 1 ? h('h4', { text: f.nom }) : null, h('div', { class: 'tb-apercu' }, tableFeuille(C, i, {}))); }));
  }
  var regle = null;
  /** Impression : feuille active ou toutes, ajustée à la largeur de la page (zoom), quadrillage, 1re ligne répétée. */
  function imprimer(contenu, zonesPage, valeurs, toutes, fiActive) {
    var C = T.contenu(contenu), p = C.page, mm = p.orientation === 'portrait' ? [210, 297] : [297, 210];
    var zonePage = ['gauche', 'centre', 'droite'].filter(function (k) { return /\{page\}/.test(p.pied[k]); })[0];
    var css = Array.prototype.filter.call(document.styleSheets, function (x) { try { return !!x.cssRules; } catch (e) { return false; } })[0];
    if (css) {
      if (regle !== null) { try { css.deleteRule(regle); } catch (e) { /* */ } regle = null; }
      var boite = zonePage ? ' @bottom-' + { gauche: 'left', centre: 'center', droite: 'right' }[zonePage] + ' { content: "Page " counter(page) " sur " counter(pages); font-size: 8pt; }' : '';
      try { regle = css.insertRule('@page doc-tableur { size: ' + mm[0] + 'mm ' + mm[1] + 'mm; margin: ' + p.marges.h + 'mm ' + p.marges.d + 'mm ' + p.marges.b + 'mm ' + p.marges.g + 'mm;' + boite + ' }', css.cssRules.length); } catch (e) { regle = null; }
    }
    var pied = { gauche: p.pied.gauche, centre: p.pied.centre, droite: p.pied.droite }; if (zonePage) pied[zonePage] = '';
    var largeurPx = (mm[0] - p.marges.g - p.marges.d) * 96 / 25.4;
    var feuilles = toutes ? C.feuilles.map(function (f, i) { return i; }) : [fiActive || 0];
    var article = h('article', { class: 'doc-imprime tb-doc' });
    feuilles.forEach(function (i, n) {
      var t = tableFeuille(C, i, { quadrillage: p.quadrillage, repeter: p.repeter });
      if (p.ajuster && t.largeurTotale && t.largeurTotale > largeurPx) t.style.zoom = String(Math.max(0.2, largeurPx / t.largeurTotale));
      var v = Object.assign({}, valeurs, { feuille: C.feuilles[i].nom });
      article.appendChild(h('section', { class: 'tb-page' + (n ? ' tb-saut' : '') }, zonesPage(p.entete, v, 'doc-entete'), feuilles.length > 1 ? h('h3', { class: 'tb-titre-feuille', text: C.feuilles[i].nom }) : null, t, zonesPage(pied, v, 'doc-pied')));
    });
    U.imprimer(article);
  }

  U.tableur = { surface: surface, apercu: apercu, imprimer: imprimer };
})();
