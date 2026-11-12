// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Documents — interface (0.34.0, étape 1 : documents texte). Logique : module-documents.js ; clés : session.
 *
 * Liste (mes documents, partagés avec moi, modèles, à valider, corbeille) ; éditeur de texte mis en forme : la page est
 * une zone modifiable dont le contenu est relu en blocs (texte, titres, listes, tableaux, sauts de page) et morceaux de
 * texte mis en forme, jamais en HTML enregistré. Les mises en forme sont des classes CSS (polices, tailles, couleurs),
 * jamais des attributs `style`. Enregistrement automatique (chaque enregistrement est une version chiffrée), partage,
 * rattachement, historique et comparaison, validation, mise en page, impression.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, DM = SIC.documents;
  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function moi() { return s().compteEffectif(); }
  function st() { try { return s().etatModule('documents') || DM.reduire([]); } catch (e) { return DM.reduire([]); } }
  function doc(id) { return st().docs[id] || null; }
  function nomAgent(id, d) { var n = s().nomAuteur ? s().nomAuteur(id) : id; return n === id && d && d.noms && d.noms[id] ? d.noms[id] : n; }
  function hex(n) { return SIC.crypto.hex(SIC.crypto.aleatoire(n)); }
  function dateCourte(iso) { return iso ? U.court(Date.parse(iso)) : ''; }
  function jourFr(iso) { return iso ? new Date(Date.parse(iso)).toLocaleDateString('fr-FR') : ''; }
  function plusJours(n) { return DM.jourISO(Date.now() + n * 864e5); }
  function jc() { return DM.joursCorbeille(cfg()); }
  var SAUVEGARDE_MS = 15000;

  // ------------------------------------------------------------ Contenus déchiffrés (mémoire de la session)
  var cache = {};   // identifiant de version → { meta, contenu } (null : illisible)
  async function lireVersion(d, v) {
    if (!v) return null;
    if (cache[v.id] !== undefined) return cache[v.id];
    var o = await s().dechiffrerDocument(d.id, v.g, v.ct);
    cache[v.id] = o ? { meta: DM.meta(o.meta), contenu: DM.contenu(o.contenu) } : null;
    return cache[v.id];
  }
  function metaConnue(d) { var v = DM.derniere(d); return v && cache[v.id] ? cache[v.id].meta : null; }
  /** Titres des documents de la liste, déchiffrés à la volée ; `apres` redessine. */
  function chargerTitres(ds, apres) {
    var aFaire = ds.filter(function (d) { var v = DM.derniere(d); return v && cache[v.id] === undefined; });
    if (!aFaire.length) return;
    Promise.all(aFaire.map(function (d) { return lireVersion(d, DM.derniere(d)).catch(function () { return null; }); })).then(apres);
  }

  // ------------------------------------------------------------ Mise en forme : blocs et morceaux ↔ page modifiable
  var CL = { p: 'fp-', z: 'ft-', c: 'fc-', f: 'ff-' };
  function classesRun(r) { var c = []; if (r.p) c.push('fp-' + r.p); if (r.z) c.push('ft-' + r.z); if (r.c) c.push('fc-' + r.c); if (r.f) c.push('ff-' + r.f); return c.join(' '); }
  function noeudsRun(r) {
    var parts = r.x.split('\n'), frag = [];
    parts.forEach(function (t, i) { if (i) frag.push(h('br')); if (t) frag.push(document.createTextNode(t)); });
    var n = frag;
    if (r.b) n = [h('s', {}, n)]; if (r.s) n = [h('u', {}, n)]; if (r.i) n = [h('i', {}, n)]; if (r.g) n = [h('b', {}, n)];
    var cl = classesRun(r);
    return cl ? [h('span', { class: cl }, n)] : n;
  }
  function noeudsRuns(runs) { var res = []; (runs || []).forEach(function (r) { res = res.concat(noeudsRun(r)); }); if (!res.length) res.push(h('br')); return res; }
  function classesBloc(b) { var c = []; if (b.al && b.al !== 'g') c.push('al-' + b.al); if (b.r) c.push('r-' + b.r); return c.join(' ') || null; }
  /** Rendu des blocs (page modifiable, lecture, impression). */
  function rendreBlocs(blocs) {
    var res = [], pile = [];
    function fermer(n) { while (pile.length > n) pile.pop(); }
    blocs.forEach(function (b) {
      if (b.t !== 'li') fermer(0);
      if (b.t === 'li') {
        var niv = b.n || 0;
        fermer(niv + 1);
        if (pile.length === niv + 1 && pile[niv].tagName.toLowerCase() !== b.liste) fermer(niv);
        while (pile.length <= niv) {
          var l = h(b.liste);
          if (!pile.length) res.push(l);
          else { var dernier = pile[pile.length - 1].lastElementChild || pile[pile.length - 1].appendChild(h('li')); dernier.appendChild(l); }
          pile.push(l);
        }
        pile[niv].appendChild(h('li', { class: classesBloc(b) }, noeudsRuns(b.runs)));
        return;
      }
      if (b.t === 'saut') { res.push(h('div', { class: 'doc-saut', contenteditable: 'false', title: 'Saut de page' })); return; }
      if (b.t === 'table') {
        var t = h('table', { class: 'doc-table' });
        if (b.largeurs) { var cg = h('colgroup'); b.largeurs.forEach(function (w) { var c = h('col'); c.style.width = w + '%'; cg.appendChild(c); }); t.appendChild(cg); }
        var tb = h('tbody');
        b.lignes.forEach(function (l, i) { tb.appendChild(h('tr', {}, l.map(function (c) { return h(b.entete && i === 0 ? 'th' : 'td', { class: c.al !== 'g' ? 'al-' + c.al : null }, noeudsRuns(c.runs)); }))); });
        t.appendChild(tb);
        res.push(t);
        return;
      }
      res.push(h(b.t, { class: classesBloc(b) }, noeudsRuns(b.runs)));
    });
    return res;
  }

  // Lecture de la page modifiable (ou d'un collage) : blocs et morceaux, sans aucun HTML gardé
  var TAILLES_FONT = [8, 10, 12, 14, 18, 24, 36];
  function policeDe(nom) {
    var n = String(nom || '').toLowerCase().replace(/["']/g, '');
    var k = Object.keys(DM.POLICES).filter(function (x) { return x && n.indexOf(DM.POLICES[x].toLowerCase()) >= 0; })[0];
    return k || (/times/.test(n) ? 'times' : /courier|mono/.test(n) ? 'courier' : '');
  }
  function tailleDe(v) {
    var m = /([\d.]+)\s*(pt|px)?/.exec(String(v || '')); if (!m) return 0;
    var pt = m[2] === 'px' ? +m[1] * 0.75 : +m[1];
    return DM.TAILLES.reduce(function (b, t) { return Math.abs(t - pt) < Math.abs(b - pt) ? t : b; }, DM.TAILLES[0]);
  }
  /** Mise en forme portée par un élément (balises, classes, attributs d'un collage). */
  function marques(el, m) {
    var x = Object.assign({}, m), tag = el.tagName;
    if (tag === 'B' || tag === 'STRONG') x.g = true;
    if (tag === 'I' || tag === 'EM') x.i = true;
    if (tag === 'U' || tag === 'INS') x.s = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') x.b = true;
    (el.classList ? Array.prototype.slice.call(el.classList) : []).forEach(function (c) {
      Object.keys(CL).forEach(function (k) { if (c.indexOf(CL[k]) === 0) { var v = c.slice(CL[k].length); x[k] = k === 'z' ? +v : v; } });
    });
    if (tag === 'FONT') { if (el.getAttribute('face')) x.p = policeDe(el.getAttribute('face')); if (el.getAttribute('size')) x.z = TAILLES_FONT[Math.max(0, Math.min(6, +el.getAttribute('size') - 1))]; }
    // Collage (traitement de texte, page web) : quelques propriétés lues dans l'attribut, jamais recopiées
    var st = el.getAttribute && el.getAttribute('style');
    if (st) {
      st.split(';').forEach(function (d) {
        var p = d.split(':'), k = (p[0] || '').trim().toLowerCase(), v = (p.slice(1).join(':') || '').trim().toLowerCase();
        if (k === 'font-weight' && (v === 'bold' || +v >= 600)) x.g = true;
        if (k === 'font-style' && v === 'italic') x.i = true;
        if (k === 'text-decoration' || k === 'text-decoration-line') { if (/underline/.test(v)) x.s = true; if (/line-through/.test(v)) x.b = true; }
        if (k === 'font-size') { var t = tailleDe(v); if (t) x.z = t; }
        if (k === 'font-family') { var pf = policeDe(v); if (pf) x.p = pf; }
      });
    }
    return x;
  }
  var BLOC = /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|ADDRESS|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|LI|TABLE|HR|FIGURE)$/;
  function alignDe(el) {
    var c = el.classList ? Array.prototype.slice.call(el.classList).filter(function (x) { return /^al-[gcdj]$/.test(x); })[0] : null;
    if (c) return c.slice(3);
    var a = String((el.getAttribute && (el.getAttribute('align') || '')) || '').toLowerCase(), stl = String((el.getAttribute && el.getAttribute('style')) || '').toLowerCase();
    var m = /text-align\s*:\s*(\w+)/.exec(stl); if (m) a = m[1];
    return { center: 'c', right: 'd', justify: 'j' }[a] || 'g';
  }
  function retraitDe(el) { var c = el.classList ? Array.prototype.slice.call(el.classList).filter(function (x) { return /^r-\d$/.test(x); })[0] : null; return c ? +c.slice(2) : 0; }
  function runsDe(el, m, runs) {
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 3) { var t = n.nodeValue.replace(/[ ]/g, ' ').replace(/[\r\n\t]+/g, ' '); if (t) runs.push(Object.assign({ x: t }, m)); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push(Object.assign({ x: '\n' }, m)); return; }
      if (/^(SCRIPT|STYLE|META|TITLE|HEAD|IMG|SVG|OBJECT|IFRAME|INPUT|BUTTON|SELECT|TEXTAREA)$/.test(n.tagName)) return;
      if (BLOC.test(n.tagName) && runs.length && runs[runs.length - 1].x.slice(-1) !== '\n') runs.push(Object.assign({ x: '\n' }, m));
      runsDe(n, marques(n, m), runs);
    });
    return runs;
  }
  function finSansSaut(runs) { while (runs.length && /^\n+$/.test(runs[runs.length - 1].x)) runs.pop(); if (runs.length) runs[runs.length - 1].x = runs[runs.length - 1].x.replace(/\n+$/, ''); return runs; }
  /** Blocs d'un élément (page modifiable ou corps d'un document collé). */
  function lireBlocs(racine, retraitBase) {
    var blocs = [], enCours = null;
    function vider() { if (enCours) { blocs.push({ t: 'p', runs: finSansSaut(enCours), al: 'g' }); enCours = null; } }
    function liste(el, niv) {
      Array.prototype.forEach.call(el.children, function (li) {
        if (li.tagName === 'UL' || li.tagName === 'OL') { liste(li, niv + 1); return; }
        if (li.tagName !== 'LI') return;
        var copie = li.cloneNode(true), sous = [];
        Array.prototype.slice.call(copie.children).forEach(function (c) { if (c.tagName === 'UL' || c.tagName === 'OL') { sous.push(c); copie.removeChild(c); } });
        blocs.push({ t: 'li', liste: el.tagName === 'OL' ? 'ol' : 'ul', n: Math.min(6, niv), runs: finSansSaut(runsDe(copie, marques(li, {}), [])), al: alignDe(li) });
        Array.prototype.forEach.call(li.children, function (c) { if (c.tagName === 'UL' || c.tagName === 'OL') liste(c, niv + 1); });
      });
    }
    Array.prototype.forEach.call(racine.childNodes, function (n) {
      if (n.nodeType === 3) { var t = n.nodeValue.replace(/[ ]/g, ' ').replace(/[\r\n\t]+/g, ' '); if (t.trim() || enCours) (enCours = enCours || []).push({ x: t }); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (/^(SCRIPT|STYLE|META|TITLE|HEAD|LINK)$/.test(tag)) return;
      if (tag === 'BR') { if (enCours) vider(); else blocs.push({ t: 'p', runs: [], al: 'g' }); return; }
      if (!BLOC.test(tag)) { runsDe({ childNodes: [n] }, {}, (enCours = enCours || [])); return; }
      vider();
      if (tag === 'HR' || (n.classList && n.classList.contains('doc-saut'))) { blocs.push({ t: 'saut' }); return; }
      if (tag === 'UL' || tag === 'OL') { liste(n, 0); return; }
      if (tag === 'TABLE') {
        var lignes = [], entete = false;
        Array.prototype.forEach.call(n.querySelectorAll('tr'), function (tr, i) {
          var cs = Array.prototype.filter.call(tr.children, function (c) { return c.tagName === 'TD' || c.tagName === 'TH'; });
          if (i === 0 && cs.length && cs.every(function (c) { return c.tagName === 'TH'; })) entete = true;
          lignes.push(cs.map(function (c) { return { runs: finSansSaut(runsDe(c, marques(c, {}), [])), al: alignDe(c) }; }));
        });
        var cols = n.querySelectorAll('col'), larg = cols.length ? Array.prototype.map.call(cols, function (c) { return parseFloat(c.style.width) || 0; }) : null;
        if (lignes.length) blocs.push({ t: 'table', lignes: lignes, entete: entete, largeurs: larg && larg.every(Boolean) ? larg : null });
        return;
      }
      // Conteneur qui porte d'autres blocs (collage, div imbriquée) : ses blocs, avec le retrait d'une citation
      if (Array.prototype.some.call(n.children, function (c) { return BLOC.test(c.tagName) && c.tagName !== 'LI'; })) {
        var r = (retraitBase || 0) + (tag === 'BLOCKQUOTE' ? 1 : 0);
        lireBlocs(n, r).forEach(function (b) { if (r && b.t !== 'table' && b.t !== 'saut') b.r = Math.min(8, (b.r || 0) + (tag === 'BLOCKQUOTE' ? 1 : 0)); blocs.push(b); });
        return;
      }
      var t2 = /^H[1-6]$/.test(tag) ? 'h' + Math.min(3, +tag[1]) : 'p';
      blocs.push({ t: t2, runs: finSansSaut(runsDe(n, marques(n, {}), [])), al: alignDe(n), r: Math.min(8, retraitDe(n) + (tag === 'BLOCKQUOTE' ? 1 : 0) + (retraitBase || 0)) || undefined });
    });
    vider();
    return blocs;
  }

  // ------------------------------------------------------------ Éditeur
  var PAGE_MM = { portrait: [210, 297], paysage: [297, 210] };
  function remplir(modele, v) { return String(modele || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }); }
  function valeursPage(d, meta, page) {
    var ev = DM.enVigueur(d), statut = DM.statut(d);
    return { titre: meta.titre, date: new Date().toLocaleDateString('fr-FR'), page: page || '1', service: (moi().services || []).map(U.libService).join(', '),
      auteur: nomAgent(d.auteur, d), version: statut.le && /^(valide|modifie|a-reviser)$/.test(statut.statut) ? 'Version validée le ' + jourFr(statut.le) : (ev ? 'Version du ' + jourFr(ev.le) : '') };
  }
  function zonesPage(z, v, cls) { return h('div', { class: 'doc-zones ' + cls }, ['gauche', 'centre', 'droite'].map(function (k) { return h('span', { class: 'z-' + k, text: remplir(z[k], v) }); })); }
  function appliquerPage(feuille, corps, page) {
    var mm = PAGE_MM[page.orientation];
    feuille.style.width = mm[0] + 'mm'; feuille.style.minHeight = mm[1] + 'mm';
    feuille.style.paddingTop = page.marges.h + 'mm'; feuille.style.paddingBottom = page.marges.b + 'mm'; feuille.style.paddingLeft = page.marges.g + 'mm'; feuille.style.paddingRight = page.marges.d + 'mm';
    corps.className = 'doc-corps fp-' + page.police + ' ft-' + page.taille + ' lh-' + String(page.interligne).replace('.', '');
  }

  function ouvrirEditeur(id) {
    var d = doc(id);
    if (!d) return U.toast('Document introuvable.');
    var v0 = DM.derniere(d);
    lireVersion(d, v0).then(function (lu) {
      if (v0 && !lu) return U.toast('Vous n’avez pas la clé de ce document.');
      editeur(d, lu || { meta: DM.meta({}), contenu: DM.contenu({}) }, v0 ? v0.id : null);
    }, function (e) { U.toast(e.message); });
  }

  function editeur(d0, lu, base) {
    var id = d0.id, meta = JSON.parse(JSON.stringify(lu.meta)), page = JSON.parse(JSON.stringify(lu.contenu.page));
    var droit = DM.droitDe(d0, moi(), cfg()), modifiable = !s().apercu && !d0.corbeille && DM.DROITS_DOC[droit] >= 2;
    var sale = false, minuteur = null, enregistrement = null, rangeGarde = null, ferme = false;
    var dlg = h('dialog', { class: 'doc-editeur', 'aria-label': 'Document : ' + meta.titre });
    var titre = h('input', { type: 'text', class: 'doc-titre', maxlength: 160, value: meta.titre === 'Sans titre' && !base ? '' : meta.titre, placeholder: 'Titre du document', 'aria-label': 'Titre du document', readonly: !modifiable });
    var etat = h('span', { class: 'doc-etat muted', 'aria-live': 'polite' });
    var corps = h('div', { class: 'doc-corps', contenteditable: modifiable ? 'true' : 'false', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Texte du document' });
    rendreBlocs(lu.contenu.blocs || []).forEach(function (n) { corps.appendChild(n); });
    var entete = h('div'), pied = h('div'), feuille = h('div', { class: 'doc-feuille' }, entete, corps, pied);
    // Tableur (0.35.0) : surface du classeur à la place de la page de texte ; la fenêtre, l'enregistrement et le reste sont communs
    var tab = lu.contenu.genre === 'tableur' ? U.tableur.surface(lu.contenu, { modifiable: modifiable, changer: function () { marquer(); } }) : null;
    if (tab) page = tab.page;
    function lireContenu() { return tab ? DM.contenu(tab.lire()) : DM.contenu({ blocs: lireBlocs(corps), page: page }); }
    function dessinerZones() {
      var v = valeursPage(doc(id) || d0, { titre: titre.value || 'Sans titre' });
      U.vider(entete).appendChild(zonesPage(page.entete, v, 'doc-entete'));
      U.vider(pied).appendChild(zonesPage(page.pied, v, 'doc-pied'));
      appliquerPage(feuille, corps, page);
    }
    dessinerZones();

    function marquer() { if (!modifiable) return; sale = true; etat.textContent = 'Modifications non enregistrées'; clearTimeout(minuteur); minuteur = setTimeout(function () { enregistrer(false); }, SAUVEGARDE_MS); }
    async function enregistrer(fermer) {
      clearTimeout(minuteur);
      if (!modifiable || (!sale && !fermer)) return true;
      if (enregistrement) { await enregistrement; if (!sale) return true; }
      enregistrement = (async function () {
        try {
          if (!tab) normaliserPage();
          meta.titre = titre.value.trim() || 'Sans titre';
          var contenu = lireContenu();
          var dd = doc(id), der = DM.derniere(dd);
          if (der && base && der.id !== base && der.par !== moi().id) U.toast(nomAgent(der.par, dd) + ' a enregistré une version pendant votre travail : la vôtre vient après (la sienne reste dans l’historique).');
          var c = await s().chiffrerDocument(id, { meta: meta, contenu: contenu });
          var e = await s().enregistrer('DOC_VERSION', { doc: id, g: c.g, ct: c.ct, nom: moi().nom });
          cache[e.id] = { meta: DM.meta(meta), contenu: contenu };
          base = e.id; sale = false;
          etat.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          dessinerBarre();
          return true;
        } catch (err) { etat.textContent = 'Échec de l’enregistrement : ' + err.message; U.toast(err.message); return false; }
        finally { enregistrement = null; }
      })();
      return enregistrement;
    }
    corps.addEventListener('input', marquer);
    titre.addEventListener('input', function () { marquer(); dessinerZones(); dlg.setAttribute('aria-label', 'Document : ' + (titre.value || 'Sans titre')); });

    // Sélection gardée : les listes de la barre d'outils prennent le focus
    document.addEventListener('selectionchange', garderSelection);
    function garderSelection() { var sel = window.getSelection(); if (sel.rangeCount && corps.contains(sel.getRangeAt(0).commonAncestorContainer)) rangeGarde = sel.getRangeAt(0).cloneRange(); }
    function remettreSelection() {
      corps.focus();
      if (rangeGarde) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rangeGarde); }
    }
    function cmd(nom, val) { remettreSelection(); try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* */ } document.execCommand(nom, false, val === undefined ? null : val); normaliserPage(); marquer(); garderSelection(); }
    /** Police, taille, couleur, surlignage : commande du navigateur avec une valeur repère, aussitôt remplacée par une classe. */
    function marque(genre, valeur) {
      remettreSelection();
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* */ }
      // Surlignage : repère de police aussi (le surlignage du navigateur passe par un attribut style, refusé par la politique de sécurité)
      var repere = { p: ['fontName', 'TesseraRepere'], z: ['fontSize', '7'], c: ['foreColor', '#010203'], f: ['fontName', 'TesseraFond'] }[genre];
      document.execCommand(repere[0], false, repere[1]);
      var trouves = genre === 'p' ? corps.querySelectorAll('font[face="TesseraRepere"]') : genre === 'z' ? corps.querySelectorAll('font[size="7"]') : genre === 'c' ? corps.querySelectorAll('font[color="#010203"]')
        : corps.querySelectorAll('font[face="TesseraFond"]');
      var nouveaux = [];
      Array.prototype.forEach.call(trouves, function (el) {
        Array.prototype.forEach.call(el.querySelectorAll('span'), function (x) { Array.prototype.slice.call(x.classList).forEach(function (c) { if (c.indexOf(CL[genre]) === 0) x.classList.remove(c); }); });
        var sp = h('span', { class: valeur ? CL[genre] + valeur : null });
        while (el.firstChild) sp.appendChild(el.firstChild);
        el.parentNode.replaceChild(sp, el);
        nouveaux.push(sp);
      });
      // La sélection est remise sur le texte mis en forme (les balises remplacées l'ont défaite)
      normaliserPage();
      var vivants = nouveaux.filter(function (x) { return x.isConnected; });
      if (vivants.length) { var r = document.createRange(); r.setStartBefore(vivants[0]); r.setEndAfter(vivants[vivants.length - 1]); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      marquer(); garderSelection();
    }
    /** Nettoyage : attributs `style`, balises <font> et <span> sans classe retirés (rien n'est gardé hors des classes connues). */
    function normaliserPage() {
      Array.prototype.forEach.call(corps.querySelectorAll('[style]'), function (x) { if (x.tagName !== 'COL') x.removeAttribute('style'); });
      Array.prototype.forEach.call(corps.querySelectorAll('font'), function (x) { var sp = h('span', { class: classesRun(marques(x, {})) || null }); while (x.firstChild) sp.appendChild(x.firstChild); x.parentNode.replaceChild(sp, x); });
      Array.prototype.forEach.call(corps.querySelectorAll('span:not([class]), span[class=""]'), function (x) { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.parentNode.removeChild(x); });
    }
    function blocsSelection() {
      remettreSelection();
      var sel = window.getSelection(); if (!sel.rangeCount) return [];
      var r = sel.getRangeAt(0), res = [];
      function blocDe(n) { while (n && n !== corps) { if (n.nodeType === 1 && /^(P|H1|H2|H3|LI|DIV|TD|TH)$/.test(n.tagName) && !n.classList.contains('doc-saut')) return n; n = n.parentNode; } return null; }
      var a = blocDe(r.startContainer), b = blocDe(r.endContainer);
      Array.prototype.forEach.call(corps.querySelectorAll('p, h1, h2, h3, li, td, th, div:not(.doc-saut)'), function (x) { if (x === a || x === b || r.intersectsNode(x)) { if (!Array.prototype.some.call(x.querySelectorAll('p, h1, h2, h3, li'), function () { return true; }) || x === a) res.push(x); } });
      if (!res.length && a) res.push(a);
      return res;
    }
    function aligner(al) { blocsSelection().forEach(function (x) { ['g', 'c', 'd', 'j'].forEach(function (k) { x.classList.remove('al-' + k); }); if (al !== 'g') x.classList.add('al-' + al); }); marquer(); }
    function retrait(sens) {
      var bs = blocsSelection();
      if (bs.some(function (x) { return x.tagName === 'LI'; })) { cmd(sens > 0 ? 'indent' : 'outdent'); return; }
      bs.forEach(function (x) { var r = retraitDe(x), n = Math.max(0, Math.min(8, r + sens)); if (r) x.classList.remove('r-' + r); if (n) x.classList.add('r-' + n); });
      marquer();
    }
    function blocCourant() {
      remettreSelection();
      var sel = window.getSelection(), n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      while (n && n.parentNode !== corps) n = n.parentNode;
      return n && n !== corps ? n : null;
    }
    function insererApres(nouveaux) {
      var b = blocCourant(), ref = b ? b.nextSibling : null;
      nouveaux.forEach(function (n) { corps.insertBefore(n, ref); });
      var p = h('p', {}, h('br')); corps.insertBefore(p, ref);
      // Curseur : première case d'un tableau inséré, sinon le paragraphe qui suit
      var cible = (nouveaux[0] && nouveaux[0].querySelector && nouveaux[0].querySelector('td, th')) || p;
      var r = document.createRange(); r.setStart(cible, 0); r.collapse(true); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      marquer(); garderSelection();
    }
    function insererTableau() {
      var nl = h('input', { type: 'number', min: 1, max: 100, value: 3, class: 'champ-court', 'aria-label': 'Nombre de lignes' }), nc = h('input', { type: 'number', min: 1, max: 12, value: 3, class: 'champ-court', 'aria-label': 'Nombre de colonnes' });
      var et = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Première ligne de titre' });
      U.modale('Insérer un tableau', h('div', { class: 'pile' }, h('div', { class: 'actions gauche' }, h('label', {}, 'Lignes', nl), h('label', {}, 'Colonnes', nc)), h('label', { class: 'case' }, et, h('span', { text: 'Première ligne de titre' }))),
        [{ texte: 'Annuler' }, { texte: 'Insérer', classe: 'primaire', action: function () {
          var l = Math.round(+nl.value), c = Math.round(+nc.value);
          if (!(l >= 1 && l <= 100 && c >= 1 && c <= 12)) { U.toast('De 1 à 100 lignes, de 1 à 12 colonnes.'); return false; }
          var lignes = []; for (var i = 0; i < l; i++) { var r = []; for (var j = 0; j < c; j++) r.push({ runs: [] }); lignes.push(r); }
          setTimeout(function () { insererApres(rendreBlocs([DM.bloc({ t: 'table', lignes: lignes, entete: et.checked })])); }, 0);
        } }]);
    }
    function caseCourante() { remettreSelection(); var sel = window.getSelection(), n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null; while (n && n !== corps) { if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n; n = n.parentNode; } return null; }
    function tableau(op) {
      var td = caseCourante();
      if (!td) return U.toast('Placez le curseur dans une case du tableau.');
      var tr = td.parentNode, table = tr.closest('table'), idx = Array.prototype.indexOf.call(tr.children, td), rows = table.querySelectorAll('tr');
      if (op === 'ligne') { var n = h('tr', {}, Array.prototype.map.call(tr.children, function () { return h('td', {}, h('br')); })); tr.parentNode.insertBefore(n, tr.nextSibling); }
      if (op === 'colonne') { Array.prototype.forEach.call(rows, function (r) { var ref = r.children[idx]; var c = h(ref && ref.tagName === 'TH' ? 'th' : 'td', {}, h('br')); r.insertBefore(c, ref ? ref.nextSibling : null); }); Array.prototype.forEach.call(table.querySelectorAll('col'), function (c) { c.remove(); }); }
      if (op === '-ligne') { if (rows.length > 1) tr.remove(); else table.remove(); }
      if (op === '-colonne') { if (tr.children.length > 1) { Array.prototype.forEach.call(rows, function (r) { if (r.children[idx]) r.children[idx].remove(); }); Array.prototype.forEach.call(table.querySelectorAll('col'), function (c) { c.remove(); }); } else table.remove(); }
      if (op === 'entete') { var prem = rows[0], th = prem.children[0] && prem.children[0].tagName === 'TH'; Array.prototype.slice.call(prem.children).forEach(function (c) { var n2 = h(th ? 'td' : 'th'); while (c.firstChild) n2.appendChild(c.firstChild); prem.replaceChild(n2, c); }); }
      marquer();
    }
    function effacerForme() {
      cmd('removeFormat');
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var r = sel.getRangeAt(0);
      Array.prototype.forEach.call(corps.querySelectorAll('span'), function (x) { if (r.intersectsNode(x)) { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove(); } });
      marquer();
    }
    // Collage : relu en blocs (aucun HTML recopié), inséré à la place de la sélection
    corps.addEventListener('paste', function (ev) {
      if (!modifiable) return;
      ev.preventDefault();
      var html = ev.clipboardData.getData('text/html'), txt = ev.clipboardData.getData('text/plain');
      var blocs = html ? lireBlocs(new DOMParser().parseFromString(html, 'text/html').body) : String(txt || '').split(/\r?\n/).map(function (l) { return { t: 'p', runs: l ? [{ x: l }] : [] }; });
      blocs = blocs.map(DM.bloc).filter(Boolean);
      if (!blocs.length) return;
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var r = sel.getRangeAt(0); r.deleteContents();
      if (blocs.length === 1 && (blocs[0].t === 'p' || blocs[0].t === 'li')) {
        var frag = document.createDocumentFragment(); noeudsRuns(blocs[0].runs).forEach(function (n) { if (n.tagName !== 'BR' || blocs[0].runs.length) frag.appendChild(n); });
        var dernier = frag.lastChild; r.insertNode(frag); if (dernier) { r.setStartAfter(dernier); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
      } else {
        // Plusieurs blocs : le bloc courant est coupé au curseur, les blocs collés vont entre les deux parties
        var b = blocCourant();
        if (b) { var fin = document.createRange(); fin.setStart(r.startContainer, r.startOffset); fin.setEndAfter(b.lastChild || b); var reste = fin.extractContents(); var apres = b.cloneNode(false); apres.appendChild(reste); corps.insertBefore(apres, b.nextSibling); }
        var ref = b ? b.nextSibling : null;
        rendreBlocs(blocs).forEach(function (n) { corps.insertBefore(n, ref); });
      }
      marquer();
    });
    corps.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); sale = true; enregistrer(false); }
    });

    // Barre d'outils
    function bouton(lib, aria, f, cls) { return h('button', { class: 'btn petit ' + (cls || ''), type: 'button', title: aria, 'aria-label': aria, onmousedown: function (ev) { ev.preventDefault(); }, onclick: f }, lib); }
    function choix(aria, options, f) {
      var sel = h('select', { 'aria-label': aria, class: 'doc-choix' }, [h('option', { value: '__', text: aria })].concat(Object.keys(options).map(function (k) { return h('option', { value: k, text: options[k] }); })));
      sel.addEventListener('change', function () { var v = sel.value; sel.value = '__'; if (v !== '__') f(v); });
      return sel;
    }
    var tailles = {}; DM.TAILLES.forEach(function (t) { tailles[t] = t + ' pt'; });
    var outils = modifiable ? h('div', { class: 'doc-outils', role: 'toolbar', 'aria-label': 'Mise en forme' },
      choix('Style', DM.BLOCS, function (v) { cmd('formatBlock', v); }),
      choix('Police', Object.keys(DM.POLICES).reduce(function (o, k) { if (k) o[k] = DM.POLICES[k]; return o; }, {}), function (v) { marque('p', v); }),
      choix('Taille', tailles, function (v) { marque('z', v); }),
      bouton(h('b', { text: 'G' }), 'Gras (Ctrl+B)', function () { cmd('bold'); }), bouton(h('i', { text: 'I' }), 'Italique (Ctrl+I)', function () { cmd('italic'); }),
      bouton(h('u', { text: 'S' }), 'Souligné (Ctrl+U)', function () { cmd('underline'); }), bouton(h('s', { text: 'ab' }), 'Barré', function () { cmd('strikeThrough'); }),
      choix('Couleur', DM.COULEURS, function (v) { marque('c', v); }), choix('Surligner', DM.FONDS, function (v) { marque('f', v); }),
      h('span', { class: 'doc-sep' }),
      bouton('⯇', 'Aligner à gauche', function () { aligner('g'); }), bouton('≡', 'Centrer', function () { aligner('c'); }), bouton('⯈', 'Aligner à droite', function () { aligner('d'); }), bouton('☰', 'Justifier', function () { aligner('j'); }),
      bouton('• —', 'Liste à puces', function () { cmd('insertUnorderedList'); }), bouton('1. —', 'Liste numérotée', function () { cmd('insertOrderedList'); }),
      bouton('⇤', 'Diminuer le retrait', function () { retrait(-1); }), bouton('⇥', 'Augmenter le retrait', function () { retrait(1); }),
      h('span', { class: 'doc-sep' }),
      bouton('▦', 'Insérer un tableau', insererTableau),
      choix('Tableau', { ligne: 'Ajouter une ligne', colonne: 'Ajouter une colonne', '-ligne': 'Supprimer la ligne', '-colonne': 'Supprimer la colonne', entete: 'Ligne de titre (oui / non)' }, tableau),
      bouton('⤓', 'Saut de page', function () { insererApres([h('div', { class: 'doc-saut', contenteditable: 'false', title: 'Saut de page' })]); }),
      bouton('⌫', 'Effacer la mise en forme', effacerForme),
      bouton('↶', 'Annuler (Ctrl+Z)', function () { cmd('undo'); }), bouton('↷', 'Rétablir (Ctrl+Y)', function () { cmd('redo'); })) : h('p', { class: 'info', text: d0.corbeille ? 'Document dans la corbeille : lecture seule.' : 'Lecture seule : ce document vous est partagé en lecture.' });

    var barre = h('div', { class: 'doc-barre' });
    function dessinerBarre() {
      var dd = doc(id) || d0, stt = DM.statut(dd), gere = DM.peut(dd, moi(), cfg(), 'gerer'), valideur = !s().apercu && DM.peutValider(dd, moi(), cfg());
      U.vider(barre).appendChild(h('div', { class: 'doc-barre-ligne' }, titre,
        h('span', { class: 'badge statut-' + stt.statut, text: DM.STATUTS[stt.statut] + (stt.revision ? ' — révision le ' + stt.revision.split('-').reverse().join('/') : '') }),
        dd.modele ? h('span', { class: 'badge', text: 'Modèle' }) : null, etat, h('span', { class: 'espace' }),
        modifiable ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { sale = true; enregistrer(false); } }, 'Enregistrer') : null,
        gere && !s().apercu ? h('button', { class: 'btn', type: 'button', onclick: function () { modalePartage(id); } }, 'Partager') : null,
        modifiable ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleRattacher(meta, function () { marquer(); enregistrer(false); }); } }, 'Rattacher' + (meta.rattaches.length ? ' (' + meta.rattaches.length + ')' : '')) : null,
        h('button', { class: 'btn', type: 'button', onclick: function () { enregistrer(false).then(function () { modaleHistorique(id); }); } }, 'Historique'),
        modifiable && (stt.statut === 'brouillon' || stt.statut === 'modifie' || stt.statut === 'a-reviser') ? h('button', { class: 'btn', type: 'button', onclick: function () { enregistrer(false).then(function () { demanderValidation(id, dessinerBarre); }); } }, 'Demander la validation') : null,
        valideur ? h('button', { class: 'btn', type: 'button', onclick: function () { enregistrer(false).then(function () { modaleValidation(id, dessinerBarre); }); } }, 'Valider…') : null,
        modifiable ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleMiseEnPage(tab ? tab.page : page, function (p) { if (tab) { tab.appliquerPage(p); page = tab.page; } dessinerZones(); marquer(); }, !!tab); } }, 'Mise en page') : null,
        h('button', { class: 'btn', type: 'button', onclick: function () { enregistrer(false).then(function () { var luI = { meta: { titre: titre.value || 'Sans titre', rattaches: meta.rattaches }, contenu: lireContenu() };
          if (tab) { var toutes = luI.contenu.feuilles.length > 1 && confirm('Imprimer toutes les feuilles ? (Annuler : la feuille affichée seulement)'); U.tableur.imprimer(luI.contenu, zonesPage, valeursPage(doc(id) || d0, luI.meta), toutes, tab.feuille()); }
          else imprimer(id, luI); }); } }, 'Imprimer'),
        gere && !dd.corbeille && !s().apercu ? h('button', { class: 'btn danger', type: 'button', onclick: function () { mettreACorbeille(id); } }, 'Corbeille') : null,
        h('button', { class: 'btn', type: 'button', onclick: fermer }, 'Fermer')));
      if (dd.corbeille) barre.appendChild(h('p', { class: 'alerte', text: 'Dans la corbeille depuis le ' + dateCourte(dd.corbeille.le) + ' : effacé définitivement dans ' + DM.joursAvantEffacement(dd, Date.now(), jc()) + ' jour(s).' }));
      if (stt.statut === 'a-valider' && stt.attendu) barre.appendChild(h('p', { class: 'info', text: 'Validation supplémentaire demandée à ' + nomAgent(stt.attendu, dd) + ' par ' + nomAgent(stt.demandePar, dd) + ' le ' + dateCourte(stt.demandeLe) + (stt.message ? ' : ' + stt.message : '') + '.' }));
      else if (stt.statut === 'a-valider' && stt.message) barre.appendChild(h('p', { class: 'info', text: 'Demande de validation : ' + stt.message }));
      if (/^(valide|modifie|a-reviser)$/.test(stt.statut) && stt.etapes && stt.etapes.length > 1) barre.appendChild(h('p', { class: 'info', text: 'Validé par ' + stt.etapes.map(function (x) { return nomAgent(x.par, dd) + ' (' + jourFr(x.le) + ')'; }).join(', puis ') + '.' }));
      if (dd.transfert) barre.appendChild(h('p', { class: 'muted', text: 'Compte de l’auteur retiré : gestion transférée le ' + jourFr(dd.transfert.le) + ' à ' + dd.transfert.vers.map(function (x) { return nomAgent(x, dd); }).join(', ') + '.' }));
      if (stt.statut === 'brouillon' && stt.message) barre.appendChild(h('p', { class: 'info', text: 'Renvoyé en brouillon : ' + stt.message }));
      if (stt.statut === 'modifie') barre.appendChild(h('p', { class: 'info', text: 'Modifié depuis la validation du ' + dateCourte(stt.le) + ' : la version validée reste en vigueur (Historique) jusqu’à une nouvelle validation.' }));
    }
    dessinerBarre();
    async function fermer() {
      if (ferme) return;
      if (sale && !(await enregistrer(true)) && !confirm('L’enregistrement a échoué. Fermer quand même (les dernières modifications seront perdues) ?')) return;
      ferme = true; clearTimeout(minuteur);
      document.removeEventListener('selectionchange', garderSelection);
      if (tab) tab.detruire();
      dlg.close(); dlg.remove(); U.rendreContenu();
    }
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); fermer(); });
    dlg.appendChild(h('div', { class: 'doc-cadre' + (tab ? ' doc-tableur' : '') }, barre, tab ? tab.outils : outils, tab ? tab.zone : h('div', { class: 'doc-fond' }, feuille),
      h('p', { class: 'muted doc-rappel' }, h('small', { text: 'Document chiffré, partagé seulement avec les personnes choisies ; enregistré automatiquement, chaque enregistrement est une version. Aucune donnée clinique (le dossier du patient reste dans le DPI).' }))));
    document.body.appendChild(dlg);
    dlg.showModal();
    if (modifiable) setTimeout(function () { if (!titre.value) titre.focus(); else if (tab) tab.focus(); else corps.focus(); }, 50);
    U.App.documentOuvert = { id: id, editeur: { enregistrer: enregistrer, fermer: fermer, corps: corps, tableur: tab, lire: lireContenu } };
  }

  // ------------------------------------------------------------ Création
  async function creer(options) {
    var o = options || {}, id = 'DC' + hex(8), me = moi();
    var p = DM.partage(o.partage || []);
    var noms = DM.clesDocument(me.id, p), manq = s().clesDocumentManquantes(noms);
    if (manq.indexOf('k-a.' + me.id) >= 0) throw new Error('Votre clé de documents n’est pas encore créée : elle le sera à la prochaine connexion d’un administrateur.');
    await s().creerCleDocument(id, noms);
    await s().enregistrer('DOC', { id: id, nom: me.nom, genre: o.contenu && o.contenu.genre === 'tableur' ? 'tableur' : 'texte', modele: !!o.modele, partage: p, services: o.services || [], depuis: o.depuis || '' });
    var c = await s().chiffrerDocument(id, { meta: DM.meta(o.meta || { titre: 'Sans titre' }), contenu: DM.contenu(o.contenu || {}) });
    var e = await s().enregistrer('DOC_VERSION', { doc: id, g: c.g, ct: c.ct, nom: me.nom });
    cache[e.id] = { meta: DM.meta(o.meta || {}), contenu: DM.contenu(o.contenu || {}) };
    if (manq.length) U.toast('Certaines clés de partage ne sont pas encore créées : le document leur sera partagé après la prochaine connexion d’un administrateur.');
    return id;
  }
  /** « Nouveau document » : vide ou d'après un modèle, éventuellement rattaché (fiche patient, salle, agent). */
  function modaleNouveau(o) {
    o = o || {};
    var modeles = DM.visibles(st(), moi(), cfg(), { modeles: true });
    // Genre (0.35.0) : document texte ou tableur ; un modèle fixe le genre
    var lib = function (d, m) { return (m ? m.titre : 'Modèle…') + (d.genre === 'tableur' ? ' (tableur)' : ''); };
    var sel = h('select', { 'aria-label': 'Modèle' }, [h('option', { value: '', text: 'Vide' })].concat(modeles.map(function (d) { return h('option', { value: d.id, text: lib(d, metaConnue(d)) }); })));
    chargerTitres(modeles, function () { Array.prototype.forEach.call(sel.options, function (op) { var d = doc(op.value), m = d && metaConnue(d); if (m) op.textContent = lib(d, m); }); });
    var genre = h('select', { 'aria-label': 'Genre du document' }, Object.keys(DM.GENRES).map(function (k) { return h('option', { value: k, text: DM.GENRES[k], selected: k === (o.genre || 'texte') }); }));
    sel.addEventListener('change', function () { var d = doc(sel.value); genre.disabled = !!d; if (d) genre.value = d.genre; });
    var titre = h('input', { type: 'text', maxlength: 160, placeholder: 'Titre', 'aria-label': 'Titre du nouveau document' });
    var admin = s().roles().indexOf('ADMIN') >= 0, cadre = s().roles().indexOf('CADRE') >= 0 || s().roles().indexOf('CADRE_SUP') >= 0;
    var cbModele = o.modele || (!o.rattache && (cadre || admin)) ? h('input', { type: 'checkbox', checked: !!o.modele, 'aria-label': 'Créer un modèle' }) : null;
    U.modale(o.modele ? 'Nouveau modèle' : 'Nouveau document', h('div', { class: 'pile' },
      h('label', {}, 'Titre', titre), h('div', { class: 'grille-2' }, h('label', {}, 'Genre', genre), h('label', {}, 'À partir d’un modèle', sel)),
      o.rattache ? h('p', { class: 'info', text: 'Rattaché à : ' + o.rattache.libelle }) : null,
      cbModele ? h('label', { class: 'case' }, cbModele, h('span', { text: 'C’est un modèle, partagé en lecture avec ' + (admin && !cadre ? 'tout l’établissement' : 'vos services') })) : null,
      h('p', { class: 'muted', text: 'Le document est privé : vous seul le voyez jusqu’à ce que vous le partagiez.' })),
      [{ texte: 'Annuler' }, { texte: 'Créer', classe: 'primaire', action: async function () {
        var base = sel.value ? doc(sel.value) : null, lu = base ? await lireVersion(base, DM.enVigueur(base)) : null;
        var estModele = cbModele && cbModele.checked, svs = estModele ? (admin && !cadre ? (cfg().services || []).map(function (x) { return x.code; }) : (moi().services || [])) : [];
        var id = await creer({ modele: estModele, services: estModele ? svs : [], partage: estModele ? svs.map(function (x) { return { genre: 'service', code: x, droit: 'lire' }; }) : [], depuis: base ? base.id : '',
          meta: { titre: titre.value.trim() || (lu ? lu.meta.titre : 'Sans titre'), rattaches: o.rattache ? [o.rattache] : [] }, contenu: lu ? lu.contenu : genre.value === 'tableur' ? { genre: 'tableur' } : {} });
        setTimeout(function () { ouvrirEditeur(id); }, 0);
      } }]);
  }

  // ------------------------------------------------------------ Partage
  function libEntree(p) {
    if (p.genre === 'agent') return nomAgent(p.code);
    if (p.genre === 'service') return 'Service : ' + U.libService(p.code);
    if (p.genre === 'role') return libRole(p.code) + ' — ' + U.libService(p.service);
    return 'Groupe : ' + (SIC.groupes ? SIC.groupes.libelle(cfg(), p.code) : p.code);
  }
  function libRole(r) { try { return SIC.modules.obtenir('documents').droits.libRole(cfg(), r); } catch (e) { return r; } }
  function modalePartage(id) {
    var d = doc(id), l = JSON.parse(JSON.stringify(d.partage || [])), zone = h('div', { class: 'pile' });
    var genre = h('select', { 'aria-label': 'Partager avec' }, [['agent', 'Un agent'], ['service', 'Un service'], ['role', 'Un rôle d’un service'], ['groupe', 'Un groupe d’agents']].map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
    var code = h('select', { 'aria-label': 'Qui' }), svRole = h('select', { 'aria-label': 'Service du rôle' }), droit = h('select', { 'aria-label': 'Droit' }, Object.keys(DM.LIB_DROITS).map(function (k) { return h('option', { value: k, text: DM.LIB_DROITS[k] }); }));
    function options() {
      U.vider(code); U.vider(svRole); svRole.hidden = genre.value !== 'role';
      var items = genre.value === 'agent' ? (s().comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours' && c.id !== d.auteur && (c.roles || []).indexOf('INTERVENANT') < 0; }).sort(function (a, b) { return a.nom.localeCompare(b.nom); }).map(function (c) { return [c.id, c.nom]; })
        : genre.value === 'service' ? U.tousServices().map(function (x) { return [x.code, x.libelle]; })
        : genre.value === 'role' ? SIC.model.ROLES_DE_SERVICE.filter(function (r) { return r !== 'INTERVENANT'; }).map(function (r) { return [r, libRole(r)]; })
        : (SIC.groupes ? SIC.groupes.liste(cfg()) : []).map(function (g) { return [g.code, g.libelle]; });
      items.forEach(function (x) { code.appendChild(h('option', { value: x[0], text: x[1] })); });
      U.tousServices().forEach(function (x) { svRole.appendChild(h('option', { value: x.code, text: x.libelle })); });
      Array.prototype.forEach.call(droit.options, function (o) { o.disabled = o.value === 'gerer' && genre.value !== 'agent'; });
      if (droit.value === 'gerer' && genre.value !== 'agent') droit.value = 'modifier';
    }
    genre.addEventListener('change', options); options();
    function dessiner() {
      U.vider(zone);
      zone.appendChild(h('p', {}, h('b', { text: nomAgent(d.auteur, d) }), ' — auteur, gère le document'));
      if (!l.length) zone.appendChild(h('p', { class: 'muted', text: 'Document privé : personne d’autre ne le voit.' }));
      l.forEach(function (p, i) {
        var sel = h('select', { 'aria-label': 'Droit : ' + libEntree(p) }, Object.keys(DM.LIB_DROITS).filter(function (k) { return k !== 'gerer' || p.genre === 'agent'; }).map(function (k) { return h('option', { value: k, text: DM.LIB_DROITS[k], selected: p.droit === k }); }));
        sel.addEventListener('change', function () { p.droit = sel.value; });
        zone.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: libEntree(p) }), sel, h('button', { class: 'btn petit danger', type: 'button', 'aria-label': 'Retirer : ' + libEntree(p), onclick: function () { l.splice(i, 1); dessiner(); } }, 'Retirer')));
      });
    }
    dessiner();
    U.modale('Partager le document', h('div', { class: 'pile' }, zone,
      h('fieldset', {}, h('legend', { text: 'Ajouter' }), h('div', { class: 'actions gauche' }, genre, code, svRole, droit,
        h('button', { class: 'btn', type: 'button', onclick: function () { var p = DM.entree({ genre: genre.value, code: code.value, service: svRole.value, droit: droit.value }); if (p) { l.push(p); l = DM.partage(l); dessiner(); } } }, 'Ajouter'))),
      h('p', { class: 'muted', text: 'Seules les personnes choisies reçoivent la clé du document. Un retrait crée une nouvelle clé pour la suite et retire l’accès aux versions précédentes.' })),
      [{ texte: 'Annuler' }, { texte: 'Enregistrer le partage', classe: 'primaire', action: async function () {
        var p = DM.partage(l), retrait = DM.retraitDe(d.partage, p);
        var r = await s().partagerCleDocument(id, DM.clesDocument(d.auteur, p), retrait);
        await s().enregistrer('DOC_PARTAGE', { doc: id, partage: p });
        U.toast(r.absentes.length ? 'Partage enregistré ; certaines clés ne sont pas encore créées (prochaine connexion d’un administrateur).' : 'Partage enregistré.');
      } }]);
  }

  // ------------------------------------------------------------ Rattachement
  var GENRES_RATTACHE = { patient: ['patients', 'fiche', 'Patient'], agent: ['equipe', 'agent', 'Agent'], salle: ['salles', 'salle', 'Salle ou bureau'] };
  function itemsRattache(genre) {
    if (genre === 'patient') return Object.keys((U.st() && U.st().patients) || {}).map(function (k) { var p = U.st().patients[k]; return [p.id, ((p.nom || '') + ' ' + (p.prenom || '')).trim(), p.service || '']; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
    if (genre === 'agent') return (s().comptes || []).filter(function (c) { return c.id !== 'secours'; }).map(function (c) { return [c.id, c.nom, '']; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
    var sa = null; try { sa = s().etatModule('salles'); } catch (e) { sa = null; }
    return Object.keys((sa && sa.salles) || {}).map(function (k) { var x = sa.salles[k]; return x.supprime ? null : [x.id, x.nom + (x.service ? ' (' + U.libService(x.service) + ')' : ''), x.service || '']; }).filter(Boolean);
  }
  function modaleRattacher(meta, apres) {
    var zone = h('div', { class: 'pile' }), genre = h('select', { 'aria-label': 'Rattacher à' }, Object.keys(GENRES_RATTACHE).map(function (k) { return h('option', { value: k, text: GENRES_RATTACHE[k][2] }); })), item = h('select', { 'aria-label': 'Élément' });
    function remplirItems() { U.vider(item); itemsRattache(genre.value).forEach(function (x) { item.appendChild(h('option', { value: x[0], text: x[1] })); }); }
    genre.addEventListener('change', remplirItems); remplirItems();
    function dessiner() {
      U.vider(zone);
      if (!meta.rattaches.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucun rattachement.' }));
      meta.rattaches.forEach(function (r, i) { zone.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: r.libelle || r.id }), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { meta.rattaches.splice(i, 1); dessiner(); } }, 'Retirer'))); });
    }
    dessiner();
    U.modale('Rattacher le document', h('div', { class: 'pile' }, zone, h('div', { class: 'actions gauche' }, genre, item, h('button', { class: 'btn', type: 'button', onclick: function () {
      var g = GENRES_RATTACHE[genre.value], x = itemsRattache(genre.value).filter(function (y) { return y[0] === item.value; })[0];
      if (!x || meta.rattaches.some(function (r) { return r.module === g[0] && r.id === x[0]; })) return;
      meta.rattaches.push({ module: g[0], genre: g[1], id: x[0], libelle: g[2] + ' : ' + x[1], service: x[2] }); dessiner();
    } }, 'Ajouter')),
      h('p', { class: 'alerte', text: 'Document d’organisation : aucune donnée clinique, même rattaché à un patient.' })),
      [{ texte: 'Fermer', classe: 'primaire', action: function () { apres(); } }]);
  }

  // ------------------------------------------------------------ Historique, comparaison
  function modaleHistorique(id) {
    var d = doc(id), vs = d.versions.slice().reverse(), stt = d.statut || {}, zone = h('div', { class: 'pile' });
    var liste = h('ol', { class: 'doc-versions', reversed: true }, vs.map(function (v, i) {
      var prec = vs[i + 1];
      return h('li', {}, h('b', { text: dateCourte(v.le) }), ' — ' + nomAgent(v.par, d) + (v.restauree ? ' (retour à une version)' : ''),
        stt.version === v.id ? h('span', { class: 'badge statut-valide', text: 'version validée' + (d.statut.statut === 'valide' ? '' : ' (en vigueur)') }) : null, ' ',
        h('button', { class: 'btn petit', type: 'button', onclick: function () { voir(d, v, zone); } }, 'Voir'),
        prec ? h('button', { class: 'btn petit', type: 'button', onclick: function () { comparerVersions(d, prec, v, zone); } }, 'Comparer avec la précédente') : null,
        i > 0 && DM.peut(d, moi(), cfg(), 'modifier') && !d.corbeille && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: function () { restaurer(d, v); } }, 'Revenir à cette version') : null);
    }));
    U.modale('Historique du document', h('div', { class: 'doc-historique' }, liste, zone), [{ texte: 'Fermer', classe: 'primaire' }], { large: true });
  }
  async function voir(d, v, zone) {
    var lu = await lireVersion(d, v);
    U.vider(zone).appendChild(lu ? h('div', { class: 'doc-apercu' }, h('h3', { text: lu.meta.titre + ' — version du ' + dateCourte(v.le) }), lu.contenu.genre === 'tableur' ? U.tableur.apercu(lu.contenu) : h('div', { class: 'doc-corps fp-' + lu.contenu.page.police + ' ft-' + lu.contenu.page.taille }, rendreBlocs(lu.contenu.blocs))) : h('p', { class: 'alerte', text: 'Version illisible (clé retirée ou effacée).' }));
  }
  async function comparerVersions(d, a, b, zone) {
    var la = await lireVersion(d, a), lb = await lireVersion(d, b);
    if (!la || !lb) return U.vider(zone).appendChild(h('p', { class: 'alerte', text: 'Version illisible.' }));
    var diff = DM.comparer(la.contenu, lb.contenu), n = diff.filter(function (x) { return x.etat !== 'egal'; }).length;
    U.vider(zone).appendChild(h('div', { class: 'doc-apercu' }, h('h3', { text: 'Modifications du ' + dateCourte(b.le) + ' (' + nomAgent(b.par, d) + ') — ' + n + (la.contenu.genre === 'tableur' ? ' modification(s)' : ' paragraphe(s)') }),
      la.meta.titre !== lb.meta.titre ? h('p', { class: 'diff-ajout', text: 'Titre : « ' + la.meta.titre + ' » → « ' + lb.meta.titre + ' »' }) : null,
      h('div', { class: 'doc-diff' }, diff.map(function (x) { return h('p', { class: 'diff-' + x.etat, text: x.texte || ' ' }); }))));
  }
  async function restaurer(d, v) {
    if (!confirm('Revenir à la version du ' + dateCourte(v.le) + ' ? Elle devient la version actuelle ; les autres restent dans l’historique.')) return;
    var lu = await lireVersion(d, v);
    if (!lu) return U.toast('Version illisible.');
    var c = await s().chiffrerDocument(d.id, { meta: lu.meta, contenu: lu.contenu });
    var e = await s().enregistrer('DOC_VERSION', { doc: d.id, g: c.g, ct: c.ct, restauree: v.id, nom: moi().nom });
    cache[e.id] = lu;
    var ouvert = U.App.documentOuvert;
    if (ouvert && ouvert.id === d.id) { await ouvert.editeur.fermer(); }
    U.toast('Version rétablie.');
    setTimeout(function () { ouvrirEditeur(d.id); }, 0);
  }

  // ------------------------------------------------------------ Validation
  function demanderValidation(id, apres) {
    var msg = h('input', { type: 'text', maxlength: 300, placeholder: 'Message pour le cadre (facultatif)', 'aria-label': 'Message de la demande' });
    var d = doc(id), valideurs = (d.partage || []).length;
    U.modale('Demander la validation', h('div', { class: 'pile' }, h('label', {}, 'Message', msg),
      valideurs ? null : h('p', { class: 'alerte', text: 'Le document n’est partagé avec personne : partagez-le avec le cadre (au moins en lecture) pour qu’il puisse le valider.' })),
      [{ texte: 'Annuler' }, { texte: 'Demander', classe: 'primaire', action: async function () { await s().enregistrer('DOC_STATUT', { doc: id, statut: 'a-valider', message: msg.value.trim(), nom: moi().nom }); U.toast('Validation demandée.'); if (apres) apres(); } }]);
  }
  function modaleValidation(id, apres) {
    var d = doc(id), v = DM.derniere(d), stt = DM.statut(d), premiere = !stt.attendu;
    var revision = h('input', { type: 'date', value: stt.revision || plusJours(365), min: plusJours(1), 'aria-label': 'Date de révision' });
    var msg = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Message' });
    // Validation supplémentaire (décision du porteur du 12 novembre 2026) : le valideur la demande à un agent nommé
    var sup = h('select', { 'aria-label': 'Validation supplémentaire demandée à' }, [h('option', { value: '', text: 'Aucune : validation définitive' })].concat((s().comptes || [])
      .filter(function (c) { return c.actif !== false && c.id !== 'secours' && c.id !== moi().id && (c.roles || []).indexOf('INTERVENANT') < 0 && (stt.etapes || []).every(function (x) { return x.par !== c.id; }); })
      .sort(function (a, b) { return a.nom.localeCompare(b.nom); }).map(function (c) { return h('option', { value: c.id, text: c.nom }); })));
    var bouton = { texte: 'Valider', classe: 'primaire', action: async function () {
      if (sup.value) {
        // La personne choisie reçoit le document en lecture (clé de son agent ajoutée au document)
        var r = await s().partagerCleDocument(id, DM.clesDocument(d.auteur, d.partage).concat(['k-a.' + sup.value]), false);
        if (r.absentes.indexOf('k-a.' + sup.value) >= 0) throw new Error('La clé de documents de cet agent n’est pas encore créée (prochaine connexion d’un administrateur).');
      }
      await s().enregistrer('DOC_VALIDATION', { doc: id, version: v.id, revision: revision.value, message: msg.value.trim(), supplementaire: sup.value, nom: moi().nom });
      U.toast(sup.value ? 'Validé ; validation supplémentaire demandée.' : 'Document validé.'); if (apres) apres();
    } };
    sup.addEventListener('change', function () { var b = Array.prototype.filter.call(document.querySelectorAll('dialog[open] .pied button'), function (x) { return /^Valider/.test(x.textContent); })[0]; if (b) b.textContent = sup.value ? 'Valider et transmettre' : 'Valider'; });
    U.modale(premiere ? 'Validation du document' : 'Validation supplémentaire', h('div', { class: 'pile' },
      h('p', { text: 'Version du ' + dateCourte(v.le) + ' (' + nomAgent(v.par, d) + ').' }),
      stt.etapes && stt.etapes.length ? h('p', { class: 'info', text: 'Déjà validé par ' + stt.etapes.map(function (x) { return nomAgent(x.par, d) + ' le ' + jourFr(x.le); }).join(', ') + '.' }) : null,
      h('label', {}, 'À réviser le (facultatif)', revision), h('label', {}, 'Message (facultatif)', msg),
      h('label', {}, 'Validation supplémentaire demandée à (facultatif)', sup),
      h('small', { class: 'muted', text: 'Par exemple le cadre supérieur, le directeur des soins ou le médecin chef : la personne choisie reçoit le document en lecture et le valide à son tour ; il reste « à valider » jusqu’à la dernière validation.' })),
      [{ texte: 'Annuler' },
        { texte: 'Renvoyer en brouillon', action: async function () { await s().enregistrer('DOC_STATUT', { doc: id, statut: 'brouillon', message: msg.value.trim() || 'à reprendre', nom: moi().nom }); if (apres) apres(); } },
        bouton]);
  }

  // ------------------------------------------------------------ Mise en page
  function modaleMiseEnPage(page, apres, tableur) {
    var p = JSON.parse(JSON.stringify(page)), dernier = null;
    function nombre(k, aria) { var i = h('input', { type: 'number', min: 5, max: 50, value: p.marges[k], class: 'champ-court', 'aria-label': aria }); i.addEventListener('change', function () { p.marges[k] = +i.value; }); return h('label', {}, aria, i); }
    function sel(k, opts, aria) { var x = h('select', { 'aria-label': aria }, Object.keys(opts).filter(Boolean).map(function (o) { return h('option', { value: o, text: opts[o], selected: String(p[k]) === o }); })); x.addEventListener('change', function () { p[k] = isNaN(+x.value) ? x.value : +x.value; }); return h('label', {}, aria, x); }
    function zonesE(nom, obj) { return h('div', { class: 'grille-3' }, ['gauche', 'centre', 'droite'].map(function (k) { var i = h('input', { type: 'text', maxlength: 160, value: obj[k], 'aria-label': nom + ' ' + k }); i.addEventListener('input', function () { obj[k] = i.value; }); i.addEventListener('focus', function () { dernier = { el: i, obj: obj, k: k }; }); return h('label', {}, nom + ' — ' + { gauche: 'à gauche', centre: 'au centre', droite: 'à droite' }[k], i); })); }
    var tailles = {}; DM.TAILLES.forEach(function (t) { tailles[t] = t + ' pt'; });
    function caseP(k, lib) { var x = h('input', { type: 'checkbox', checked: !!p[k], 'aria-label': lib }); x.addEventListener('change', function () { p[k] = x.checked; }); return h('label', { class: 'case' }, x, h('span', { text: lib })); }
    var champs = Object.assign({}, DM.CHAMPS_PAGE); if (tableur) champs.feuille = 'Nom de la feuille';
    U.modale('Mise en page', h('div', { class: 'pile' },
      tableur ? h('div', { class: 'actions gauche' }, sel('orientation', { portrait: 'Portrait', paysage: 'Paysage' }, 'Orientation'), caseP('ajuster', 'Ajuster à la largeur de la page'), caseP('quadrillage', 'Imprimer le quadrillage'), caseP('repeter', 'Répéter la 1re ligne sur chaque page'))
        : h('div', { class: 'actions gauche' }, sel('orientation', { portrait: 'Portrait', paysage: 'Paysage' }, 'Orientation'), sel('police', DM.POLICES, 'Police du document'), sel('taille', tailles, 'Taille du texte'), sel('interligne', { 1: 'Simple', 1.15: '1,15', 1.5: '1,5', 2: 'Double' }, 'Interligne')),
      h('fieldset', {}, h('legend', { text: 'Marges (mm)' }), h('div', { class: 'actions gauche' }, nombre('h', 'Haut'), nombre('b', 'Bas'), nombre('g', 'Gauche'), nombre('d', 'Droite'))),
      zonesE('En-tête', p.entete), zonesE('Pied de page', p.pied),
      h('div', { class: 'actions gauche' }, h('span', { class: 'muted', text: 'Insérer :' }), Object.keys(champs).map(function (k) {
        return h('button', { class: 'btn petit', type: 'button', onmousedown: function (ev) { ev.preventDefault(); }, onclick: function () { if (!dernier) return U.toast('Cliquez d’abord dans une zone de l’en-tête ou du pied de page.'); var el = dernier.el, pos = el.selectionStart || el.value.length; el.value = el.value.slice(0, pos) + '{' + k + '}' + el.value.slice(pos); dernier.obj[dernier.k] = el.value; } }, champs[k]);
      }))),
      [{ texte: 'Annuler' }, { texte: 'Appliquer', classe: 'primaire', action: function () { if (tableur) apres(p); else { Object.assign(page, DM.page(p)); apres(p); } } }]);
  }

  // ------------------------------------------------------------ Impression
  var regleImpression = null;
  function imprimer(id, lu) {
    var d = doc(id), p = lu.contenu.page, mm = PAGE_MM[p.orientation];
    // Page : taille, marges et numéro (« {page} » du pied de page, placé dans la marge du bas) par une règle CSSOM
    var zonePage = ['gauche', 'centre', 'droite'].filter(function (k) { return /\{page\}/.test(p.pied[k]); })[0];
    var feuilleCss = Array.prototype.filter.call(document.styleSheets, function (x) { try { return !!x.cssRules; } catch (e) { return false; } })[0];
    if (feuilleCss) {
      if (regleImpression !== null) { try { feuilleCss.deleteRule(regleImpression); } catch (e) { /* */ } }
      var boite = zonePage ? ' @bottom-' + { gauche: 'left', centre: 'center', droite: 'right' }[zonePage] + ' { content: "Page " counter(page) " sur " counter(pages); font-size: 8pt; }' : '';
      try { regleImpression = feuilleCss.insertRule('@page doc-texte { size: ' + mm[0] + 'mm ' + mm[1] + 'mm; margin: ' + p.marges.h + 'mm ' + p.marges.d + 'mm ' + p.marges.b + 'mm ' + p.marges.g + 'mm;' + boite + ' }', feuilleCss.cssRules.length); } catch (e) { regleImpression = null; }
    }
    var v = valeursPage(d, lu.meta, '');
    // La zone qui porte « {page} » est remplacée par le numéro « Page n sur N » de la marge du bas
    var pied = { gauche: p.pied.gauche, centre: p.pied.centre, droite: p.pied.droite }; if (zonePage) pied[zonePage] = '';
    var corps = h('div', { class: 'doc-corps fp-' + p.police + ' ft-' + p.taille + ' lh-' + String(p.interligne).replace('.', '') }, rendreBlocs(lu.contenu.blocs));
    var t = h('table', { class: 'doc-imprime-table' },
      h('thead', {}, h('tr', {}, h('td', {}, zonesPage(p.entete, v, 'doc-entete')))),
      h('tfoot', {}, h('tr', {}, h('td', {}, zonesPage(pied, v, 'doc-pied')))),
      h('tbody', {}, h('tr', {}, h('td', {}, corps))));
    U.imprimer(h('article', { class: 'doc-imprime' }, t));
  }

  // ------------------------------------------------------------ Vues de la fenêtre
  var filtre = { texte: '' };
  function ligne(d, apres) {
    var m = metaConnue(d), stt = DM.statut(d), der = DM.derniere(d), droit = DM.droitDe(d, moi(), cfg());
    return h('tr', { class: 'doc-ligne' },
      h('td', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirEditeur(d.id); } }, m ? m.titre : '…'), d.genre === 'tableur' ? h('span', { class: 'badge', text: 'Tableur' }) : null,
        m && m.rattaches.length ? h('div', {}, h('small', { class: 'muted', text: m.rattaches.map(function (r) { return r.libelle; }).join(' · ') })) : null),
      h('td', {}, h('span', { class: 'badge statut-' + stt.statut, text: DM.STATUTS[stt.statut] })),
      h('td', { text: d.auteur === moi().id ? 'Vous' : nomAgent(d.auteur, d) }),
      h('td', { text: (d.partage || []).length ? d.partage.map(libEntree).join(', ') : 'Privé' }),
      h('td', { text: der ? dateCourte(der.le) + ' — ' + nomAgent(der.par, d) : '' }),
      h('td', { text: DM.LIB_DROITS[droit] || '' }));
  }
  function table(ds, vide) {
    if (!ds.length) return h('p', { class: 'muted', text: vide });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table-documents' }, h('thead', {}, h('tr', {}, ['Titre', 'Statut', 'Auteur', 'Partagé avec', 'Dernière version', 'Votre droit'].map(function (t) { return h('th', { text: t }); }))), h('tbody', {}, ds.map(function (d) { return ligne(d); }))));
  }
  function filtrer(ds) {
    var q = filtre.texte.trim().toLowerCase();
    return q ? ds.filter(function (d) { var m = metaConnue(d); return m && (m.titre.toLowerCase().indexOf(q) >= 0 || m.rattaches.some(function (r) { return (r.libelle || '').toLowerCase().indexOf(q) >= 0; })); }) : ds;
  }
  function recherche() {
    var i = h('input', { type: 'search', placeholder: 'Rechercher un titre, un rattachement', 'aria-label': 'Rechercher un document', value: filtre.texte });
    i.addEventListener('input', function () { filtre.texte = i.value; clearTimeout(recherche.t); recherche.t = setTimeout(function () { U.rendreContenu(); setTimeout(function () { var x = document.querySelector('input[aria-label="Rechercher un document"]'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); }, 300); });
    return i;
  }
  function vueDocuments() {
    var tous = DM.visibles(st(), moi(), cfg(), { modeles: false });
    chargerTitres(tous, function () { U.rendreContenu(); });
    var mes = filtrer(tous.filter(function (d) { return d.auteur === moi().id; })), partages = filtrer(tous.filter(function (d) { return d.auteur !== moi().id; }));
    var aReviser = tous.filter(function (d) { return DM.statut(d).statut === 'a-reviser' && DM.peut(d, moi(), cfg(), 'modifier'); });
    var cle = s().clesDocumentManquantes(['k-a.' + moi().id]).length === 0, demandes = DM.validationsDemandees(st(), moi(), cfg());
    return h('div', { class: 'pile' },
      h('div', { class: 'barre' }, h('h1', { text: 'Documents' }), recherche(), h('div', { class: 'espace' }),
        !s().apercu ? h('button', { class: 'btn primaire', type: 'button', disabled: !cle, onclick: function () { modaleNouveau(); } }, '+ Nouveau document') : null,
        !s().apercu ? h('button', { class: 'btn', type: 'button', disabled: !cle, onclick: function () { modaleNouveau({ genre: 'tableur' }); } }, '+ Nouveau tableur') : null),
      cle ? null : h('p', { class: 'alerte', text: 'Votre clé de documents n’est pas encore créée : elle le sera à la prochaine connexion d’un administrateur.' }),
      demandes.length ? h('div', { class: 'alerte' }, h('b', { text: 'Validation qui vous est demandée : ' }), demandes.map(function (d, i) { var m = metaConnue(d); return [i ? ', ' : '', h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirEditeur(d.id); } }, m ? m.titre : '…')]; })) : null,
      aReviser.length ? h('p', { class: 'alerte', text: aReviser.length + ' document(s) à réviser : ' + aReviser.map(function (d) { var m = metaConnue(d); return m ? m.titre : '…'; }).join(', ') + '.' }) : null,
      h('h2', { text: 'Mes documents (' + mes.length + ')' }), table(mes, 'Aucun document.'),
      h('h2', { text: 'Partagés avec moi (' + partages.length + ')' }), table(partages, 'Aucun document partagé avec vous.'),
      h('p', { class: 'muted' }, h('small', { text: 'Chaque document est chiffré par sa propre clé, remise aux seules personnes avec qui il est partagé. Aucune donnée clinique.' })));
  }
  function vueModeles() {
    var ds = filtrer(DM.visibles(st(), moi(), cfg(), { modeles: true })), r = s().roles(), peutModele = !s().apercu && (r.indexOf('ADMIN') >= 0 || r.indexOf('CADRE') >= 0 || r.indexOf('CADRE_SUP') >= 0);
    chargerTitres(ds, function () { U.rendreContenu(); });
    return h('div', { class: 'pile' }, h('div', { class: 'barre' }, h('h1', { text: 'Modèles' }), recherche(), h('div', { class: 'espace' }), peutModele ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleNouveau({ modele: true }); } }, '+ Nouveau modèle') : null),
      h('p', { class: 'muted', text: 'Modèles du cadre pour ses services, de l’administrateur pour l’établissement : « + Nouveau document » en part.' }), table(ds, 'Aucun modèle.'));
  }
  function vueAValider() {
    var ds = DM.aValider(st(), moi(), cfg());
    chargerTitres(ds, function () { U.rendreContenu(); });
    return h('div', { class: 'pile' }, h('h1', { text: 'Documents à valider' }), table(ds, 'Aucune demande de validation.'));
  }
  function vueCorbeille() {
    var ds = DM.visibles(st(), moi(), cfg(), { corbeille: true });
    chargerTitres(ds, function () { U.rendreContenu(); });
    return h('div', { class: 'pile' }, h('h1', { text: 'Corbeille' }),
      h('p', { class: 'muted', text: 'Un document reste ' + jc() + ' jours dans la corbeille, puis il est effacé définitivement : sa clé est détruite, ses versions deviennent illisibles.' }),
      !ds.length ? h('p', { class: 'muted', text: 'Corbeille vide.' }) : h('ul', { class: 'liste-simple' }, ds.map(function (d) {
        var m = metaConnue(d), gere = DM.peut(d, moi(), cfg(), 'gerer') && !s().apercu;
        return h('li', {}, h('b', { text: m ? m.titre : '…' }), ' — effacé dans ' + DM.joursAvantEffacement(d, Date.now(), jc()) + ' jour(s) ',
          gere ? h('button', { class: 'btn petit', type: 'button', onclick: function () { s().enregistrer('DOC_CORBEILLE', { doc: d.id, corbeille: false }).then(function () { U.toast('Document restauré.'); U.rendreContenu(); }, function (e) { U.toast(e.message); }); } }, 'Restaurer') : null,
          gere ? h('button', { class: 'btn petit danger', type: 'button', onclick: function () { if (confirm('Effacer définitivement ce document ? Sa clé sera détruite : il ne pourra plus être lu, même depuis le journal.')) effacer(d.id).then(function () { U.rendreContenu(); }, function (e) { U.toast(e.message); }); } }, 'Effacer définitivement') : null);
      })));
  }
  async function effacer(id) { await s().enregistrer('DOC_EFFACE', { doc: id }); await s().effacerCleDocument(id); }
  /** Effacement des documents restés 30 jours dans la corbeille (à la connexion, une fois par jour et par poste). */
  async function effacementAutomatique() {
    var ds = DM.aEffacer(st(), Date.now(), jc());
    for (var i = 0; i < ds.length; i++) { try { await effacer(ds[i].id); } catch (e) { /* nouvelle tentative plus tard */ } }
    return ds.length;
  }
  function mettreACorbeille(id) {
    if (!confirm('Mettre ce document à la corbeille ? Il y reste ' + jc() + ' jours, puis il est effacé définitivement.')) return;
    s().enregistrer('DOC_CORBEILLE', { doc: id, corbeille: true }).then(function () { var o = U.App.documentOuvert; if (o && o.id === id) o.editeur.fermer(); U.toast('Document mis à la corbeille.'); U.rendreContenu(); }, function (e) { U.toast(e.message); });
  }

  /** Documents rattachés à un élément (fiche patient, salle, agent) : section remplie à la volée, avec « + Document ». */
  function section(module, genre, idEl, libelle, service) {
    var zone = h('div', { class: 'pile doc-section' }, h('b', { text: 'Documents' }));
    if (!SIC.modules.obtenir('documents') || !s().detientCle || !s().detientCle('documents')) return null;
    var ds = DM.visibles(st(), moi(), cfg(), {});
    Promise.all(ds.map(function (d) { return lireVersion(d, DM.derniere(d)).catch(function () { return null; }); })).then(function () {
      var l = ds.filter(function (d) { var m = metaConnue(d); return m && m.rattaches.some(function (r) { return r.module === module && r.id === idEl; }); });
      zone.appendChild(l.length ? h('ul', { class: 'liste-simple' }, l.map(function (d) { return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { ouvrirEditeur(d.id); } }, metaConnue(d).titre), ' ', h('span', { class: 'badge statut-' + DM.statut(d).statut, text: DM.STATUTS[DM.statut(d).statut] })); })) : h('p', { class: 'muted', text: 'Aucun document rattaché.' }));
      if (!s().apercu && s().clesDocumentManquantes(['k-a.' + moi().id]).length === 0) zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleNouveau({ rattache: { module: module, genre: genre, id: idEl, libelle: libelle, service: service || '' } }); } }, '+ Document rattaché')));
    });
    return zone;
  }

  // ------------------------------------------------------------ Comptes retirés : gestion transférée au cadre (0.34.1)
  /** Session de l'administrateur : documents dont l'auteur n'a plus de compte actif, transférés au cadre de ses services. */
  async function transfertsAutomatiques() {
    if (s().roles().indexOf('ADMIN') < 0 || s().apercu) return 0;
    var l = DM.aTransferer(st(), s().comptes || [], cfg()), n = 0;
    for (var i = 0; i < l.length; i++) {
      try {
        var r = await s().transfererCleDocument(l[i].doc, l[i].vers.map(function (x) { return 'k-a.' + x; }));
        var vers = l[i].vers.filter(function (x) { return r.cles.indexOf('k-a.' + x) >= 0; });
        if (vers.length) { await s().enregistrer('DOC_TRANSFERT', { doc: l[i].doc, vers: vers }); n++; }
      } catch (e) { /* nouvelle tentative à la prochaine connexion */ }
    }
    return n;
  }

  // ------------------------------------------------------------ Administration, journal
  function panneauReglages() {
    var o = DM.options(cfg()), adm = s().roles().indexOf('ADMIN') >= 0 && !s().apercu;
    var j = h('input', { type: 'number', min: 7, max: 365, value: o.corbeilleJours, class: 'champ-court', 'aria-label': 'Durée de la corbeille (jours)', disabled: !adm });
    var tp = h('input', { type: 'checkbox', checked: o.transfertPrives, disabled: !adm, 'aria-label': 'Transférer aussi les documents privés' });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Documents' }),
      h('label', {}, 'Durée de la corbeille, en jours (7 à 365 ; 30 par défaut)', j),
      h('p', { class: 'muted', text: 'Passé ce délai, un document de la corbeille est effacé définitivement à la connexion d’un agent du module : sa clé est détruite. Les sauvegardes faites avant gardent la clé jusqu’à leur propre expiration.' }),
      h('label', { class: 'case' }, tp, h('span', { text: 'Compte d’un auteur retiré : transférer aussi au cadre ses documents privés, partagés avec personne (désactivé par défaut ; sinon ils restent illisibles, seul leur auteur les ouvrait)' })),
      h('p', { class: 'muted', text: 'Validation : rôle avec l’accès « Valider les documents » (cadre par défaut, Rôles et accès) ; il peut demander une validation supplémentaire à un agent nommé. Compte d’un auteur retiré : la gestion de ses documents partagés passe au cadre de ses services, à la connexion de l’administrateur.' }),
      adm ? h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try { var v = Math.round(+j.value); if (!(v >= 7 && v <= 365)) throw new Error('De 7 à 365 jours.'); var val = {}; if (v !== 30) val.corbeilleJours = v; if (tp.checked) val.transfertPrives = true; await U.enregistrerConfig([['documents', val]]); U.toast('Réglages enregistrés.'); } catch (e) { alert(e.message); }
      } }, 'Enregistrer')) : null);
  }
  var LIB = { DOC: 'Documents : création', DOC_VERSION: 'Documents : version', DOC_PARTAGE: 'Documents : partage', DOC_STATUT: 'Documents : demande de validation ou retour en brouillon', DOC_VALIDATION: 'Documents : validation',
    DOC_CORBEILLE: 'Documents : corbeille', DOC_EFFACE: 'Documents : effacement définitif', DOC_TRANSFERT: 'Documents : transfert de la gestion (compte retiré)' };
  function resume(e) {
    var d = e.data || {}, x = doc(d.id || d.doc), m = x && metaConnue(x), nom = m ? '« ' + m.titre + ' »' : 'un document';
    switch (e.type) {
      case 'DOC': return (d.modele ? 'Modèle ' : 'Document ') + nom + ' créé';
      case 'DOC_VERSION': return 'Version de ' + nom + (d.restauree ? ' (retour à une version)' : '');
      case 'DOC_PARTAGE': return 'Partage de ' + nom + ' : ' + ((d.partage || []).length ? d.partage.map(libEntree).join(', ') : 'privé');
      case 'DOC_STATUT': return (d.statut === 'a-valider' ? 'Validation demandée : ' : 'Renvoyé en brouillon : ') + nom;
      case 'DOC_VALIDATION': return 'Validation de ' + nom + (d.supplementaire ? ', validation supplémentaire demandée à ' + nomAgent(d.supplementaire, x) : '') + (d.revision ? ' ; révision le ' + d.revision.split('-').reverse().join('/') : '');
      case 'DOC_CORBEILLE': return (d.corbeille ? 'Mis à la corbeille : ' : 'Restauré : ') + nom;
      case 'DOC_EFFACE': return 'Effacé définitivement : ' + nom + ' (clé détruite)';
      case 'DOC_TRANSFERT': return 'Gestion de ' + nom + ' transférée à ' + (d.vers || []).map(function (y) { return nomAgent(y, x); }).join(', ');
    }
    return LIB[e.type] || e.type;
  }

  SIC.modules.completerInterface('documents', {
    vues: { documents: vueDocuments, modeles: vueModeles, 'a-valider': vueAValider, corbeille: vueCorbeille },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le document revient à son état précédent (les fichiers de clés ne changent pas).'; } },
    admin: { onglets: function () { return [['documents', 'Documents', [panneauReglages()]]]; } }
  });
  U.documents = { transfertsAutomatiques: transfertsAutomatiques, ouvrir: ouvrirEditeur, creer: creer, nouveau: modaleNouveau, section: section, effacementAutomatique: effacementAutomatique, lireBlocs: lireBlocs, rendreBlocs: rendreBlocs, imprimer: imprimer, lireVersion: lireVersion };
})();
