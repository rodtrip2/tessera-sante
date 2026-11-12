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
    if (cl) n = [h('span', { class: cl }, n)];
    // Suivi des modifications (0.37.0)
    if (r.fmt) n = [h('span', { class: 'suivi-fmt', 'data-p': r.fmt.p, 'data-n': r.fmt.n, 'data-le': r.fmt.le, 'data-id': r.fmt.id, 'data-avant': JSON.stringify(r.fmt.avant || {}), title: 'Mise en forme modifiée par ' + (r.fmt.n || r.fmt.p) + ' le ' + jourFr(r.fmt.le) }, n)];
    if (r.ins) n = [h('ins', { class: 'suivi-ins', 'data-p': r.ins.p, 'data-n': r.ins.n, 'data-le': r.ins.le, title: 'Ajouté par ' + (r.ins.n || r.ins.p) + ' le ' + jourFr(r.ins.le) }, n)];
    if (r.del) n = [h('del', { class: 'suivi-del', 'data-p': r.del.p, 'data-n': r.del.n, 'data-le': r.del.le, title: 'Supprimé par ' + (r.del.n || r.del.p) + ' le ' + jourFr(r.del.le) }, n)];
    return n;
  }
  function noeudsRuns(runs) { var res = []; (runs || []).forEach(function (r) { res = res.concat(noeudsRun(r)); }); if (!res.length) res.push(h('br')); return res; }
  function classesBloc(b) { var c = []; if (b.al && b.al !== 'g') c.push('al-' + b.al); if (b.r) c.push('r-' + b.r); return c.join(' ') || null; }
  /** Rendu des blocs (page modifiable, lecture, impression). */
  /** Attributs d'un paragraphe ou d'un élément suivi (0.38.0). */
  function attrsSuivi(b, base) {
    var a = Object.assign({}, base || {}), m = b && b.suivi;
    if (!m) return a;
    a['data-suivi'] = m.op; a['data-p'] = m.p; a['data-n'] = m.n; a['data-le'] = m.le; a['data-id'] = m.id;
    a.title = DM.OPS_BLOC[m.op] + ' par ' + (m.n || m.p) + ' le ' + jourFr(m.le);
    return a;
  }
  function suiviDe(el) { return el && el.getAttribute && el.getAttribute('data-suivi') ? { op: el.getAttribute('data-suivi'), p: el.getAttribute('data-p') || '', n: el.getAttribute('data-n') || '', le: el.getAttribute('data-le') || '', id: el.getAttribute('data-id') || '' } : undefined; }
  /** Rendu d'un contenu texte : avec onglets, chacun précédé de son titre et séparé par un saut de page (lecture, impression). */
  function rendreContenuTexte(c, impression) {
    var os = DM.ongletsDe(c);
    if (os.length === 1 && !os[0].id) return rendreBlocs(os[0].blocs);
    var res = [];
    os.forEach(function (o, i) {
      if (i) res.push(h('div', { class: 'doc-saut' + (impression ? '' : ' doc-saut-onglet') }));
      res.push(h('div', { class: 'doc-titre-onglet', text: o.titre }));
      res = res.concat(rendreBlocs(o.blocs));
    });
    return res;
  }
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
        pile[niv].appendChild(h('li', attrsSuivi(b, { class: classesBloc(b) }), noeudsRuns(b.runs)));
        return;
      }
      if (b.t === 'saut') { res.push(h('div', attrsSuivi(b, { class: 'doc-saut', contenteditable: 'false', title: 'Saut de page' }))); return; }
      if (b.t === 'table') {
        var t = h('table', attrsSuivi(b, { class: 'doc-table' }));
        if (b.largeurs) { var cg = h('colgroup'); b.largeurs.forEach(function (w) { var c = h('col'); c.style.width = w + '%'; cg.appendChild(c); }); t.appendChild(cg); }
        var tb = h('tbody');
        b.lignes.forEach(function (l, i) { tb.appendChild(h('tr', {}, l.map(function (c) { return h(b.entete && i === 0 ? 'th' : 'td', { class: c.al !== 'g' ? 'al-' + c.al : null }, noeudsRuns(c.runs)); }))); });
        t.appendChild(tb);
        res.push(t);
        return;
      }
      res.push(h(b.t, attrsSuivi(b, { class: classesBloc(b) }), noeudsRuns(b.runs)));
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
    var suivi = el.getAttribute && el.getAttribute('data-p') && (tag === 'INS' || tag === 'DEL');
    if (tag === 'SPAN' && el.classList.contains('suivi-fmt')) { var av = {}; try { av = JSON.parse(el.getAttribute('data-avant') || '{}'); } catch (e) { av = {}; } x.fmt = { p: el.getAttribute('data-p') || '', n: el.getAttribute('data-n') || '', le: el.getAttribute('data-le') || '', id: el.getAttribute('data-id') || '', avant: av }; }
    if (suivi) x[tag === 'INS' ? 'ins' : 'del'] = { p: el.getAttribute('data-p'), n: el.getAttribute('data-n') || '', le: el.getAttribute('data-le') || '' };
    if (tag === 'U' || (tag === 'INS' && !suivi)) x.s = true;
    if (tag === 'S' || tag === 'STRIKE' || (tag === 'DEL' && !suivi)) x.b = true;
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
        blocs.push({ t: 'li', liste: el.tagName === 'OL' ? 'ol' : 'ul', n: Math.min(6, niv), runs: finSansSaut(runsDe(copie, marques(li, {}), [])), al: alignDe(li), suivi: suiviDe(li) });
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
      if (tag === 'HR' || (n.classList && n.classList.contains('doc-saut'))) { blocs.push({ t: 'saut', suivi: suiviDe(n) }); return; }
      if (tag === 'UL' || tag === 'OL') { liste(n, 0); return; }
      if (tag === 'TABLE') {
        var lignes = [], entete = false;
        Array.prototype.forEach.call(n.querySelectorAll('tr'), function (tr, i) {
          var cs = Array.prototype.filter.call(tr.children, function (c) { return c.tagName === 'TD' || c.tagName === 'TH'; });
          if (i === 0 && cs.length && cs.every(function (c) { return c.tagName === 'TH'; })) entete = true;
          lignes.push(cs.map(function (c) { return { runs: finSansSaut(runsDe(c, marques(c, {}), [])), al: alignDe(c) }; }));
        });
        var cols = n.querySelectorAll('col'), larg = cols.length ? Array.prototype.map.call(cols, function (c) { return parseFloat(c.style.width) || 0; }) : null;
        if (lignes.length) blocs.push({ t: 'table', lignes: lignes, entete: entete, largeurs: larg && larg.every(Boolean) ? larg : null, suivi: suiviDe(n) });
        return;
      }
      // Conteneur qui porte d'autres blocs (collage, div imbriquée) : ses blocs, avec le retrait d'une citation
      if (Array.prototype.some.call(n.children, function (c) { return BLOC.test(c.tagName) && c.tagName !== 'LI'; })) {
        var r = (retraitBase || 0) + (tag === 'BLOCKQUOTE' ? 1 : 0);
        lireBlocs(n, r).forEach(function (b) { if (r && b.t !== 'table' && b.t !== 'saut') b.r = Math.min(8, (b.r || 0) + (tag === 'BLOCKQUOTE' ? 1 : 0)); blocs.push(b); });
        return;
      }
      var t2 = /^H[1-6]$/.test(tag) ? 'h' + Math.min(3, +tag[1]) : 'p';
      blocs.push({ t: t2, runs: finSansSaut(runsDe(n, marques(n, {}), [])), al: alignDe(n), r: Math.min(8, retraitDe(n) + (tag === 'BLOCKQUOTE' ? 1 : 0) + (retraitBase || 0)) || undefined, suivi: suiviDe(n) });
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
    var sale = false, minuteur = null, enregistrement = null, rangeGarde = null, ferme = false, minuteurDirect = null, autres = [], marquesVisibles = true;
    function opts() { return ((doc(id) || d0).options) || { simultane: false, suivi: false }; }
    function suiviActif() { return modifiable && opts().suivi; }
    var dlg = h('dialog', { class: 'doc-editeur', 'aria-label': 'Document : ' + meta.titre });
    var titre = h('input', { type: 'text', class: 'doc-titre', maxlength: 160, value: meta.titre === 'Sans titre' && !base ? '' : meta.titre, placeholder: 'Titre du document', 'aria-label': 'Titre du document', readonly: !modifiable });
    var etat = h('span', { class: 'doc-etat muted', 'aria-live': 'polite' });
    var corps = h('div', { class: 'doc-corps', contenteditable: modifiable ? 'true' : 'false', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Texte du document' });
    // Onglets (0.39.0) : un seul contenu affiché à la fois, les autres gardés ici
    var onglets = lu.contenu.genre === 'tableur' ? [] : JSON.parse(JSON.stringify(DM.ongletsDe(lu.contenu))), actif = 0;
    if (onglets.length) rendreBlocs(onglets[0].blocs || []).forEach(function (n) { corps.appendChild(n); });
    var barreOnglets = h('div', { class: 'doc-onglets', role: 'tablist', 'aria-label': 'Onglets du document' });
    var entete = h('div'), pied = h('div'), feuille = h('div', { class: 'doc-feuille' }, entete, corps, pied);
    // Tableur (0.35.0) : surface du classeur à la place de la page de texte ; la fenêtre, l'enregistrement et le reste sont communs
    var tab = lu.contenu.genre === 'tableur' ? U.tableur.surface(lu.contenu, { modifiable: modifiable, changer: function () { marquer(); }, suivi: suiviActif, agent: { id: moi().id, nom: moi().nom }, nomAgent: function (x) { return nomAgent(x, doc(id) || d0); } }) : null;
    if (tab) page = tab.page;
    function garderOnglet() { if (onglets[actif]) onglets[actif].blocs = lireBlocs(corps); }
    function lireContenu() { if (tab) return DM.contenu(tab.lire()); garderOnglet(); return DM.avecOnglets(JSON.parse(JSON.stringify(onglets)), page); }
    function montrerOnglet(i) {
      if (i === actif || !onglets[i]) return;
      normaliserPage(); garderOnglet(); actif = i;
      U.vider(corps); rendreBlocs(onglets[i].blocs).forEach(function (n) { corps.appendChild(n); });
      dessinerOnglets(); dessinerBarre(); corps.focus();
    }
    function dessinerOnglets() {
      U.vider(barreOnglets);
      var avec = onglets.length > 1 || (onglets[0] && onglets[0].id);
      if (avec) onglets.forEach(function (o, i) {
        barreOnglets.appendChild(h('button', { type: 'button', class: 'doc-onglet' + (i === actif ? ' actif' : ''), role: 'tab', 'aria-selected': i === actif ? 'true' : 'false', onclick: function () { montrerOnglet(i); }, ondblclick: function () { if (modifiable) renommerOnglet(i); } }, o.titre));
      });
      if (modifiable) {
        barreOnglets.appendChild(h('button', { type: 'button', class: 'btn petit', title: 'Ajouter un onglet', 'aria-label': 'Ajouter un onglet', onclick: ajouterOnglet }, avec ? '+' : '+ Onglet'));
        if (avec) {
          var menu = h('select', { class: 'doc-choix', 'aria-label': 'Onglet' }, [['', 'Onglet…'], ['renommer', 'Renommer'], ['gauche', 'Déplacer à gauche'], ['droite', 'Déplacer à droite'], ['supprimer', 'Supprimer']].map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
          menu.addEventListener('change', function () { var v = menu.value; menu.value = ''; actionOnglet(v); });
          barreOnglets.appendChild(menu);
        }
      }
      barreOnglets.hidden = !avec && !modifiable;
    }
    function nouvelId() { return 'o' + hex(5); }
    function ajouterOnglet() {
      if (onglets.length >= DM.MAX_ONGLETS) return U.toast('Au plus ' + DM.MAX_ONGLETS + ' onglets.');
      normaliserPage(); garderOnglet();
      if (!onglets[0].id) { onglets[0].id = nouvelId(); onglets[0].titre = 'Onglet 1'; }
      onglets.push({ id: nouvelId(), titre: 'Onglet ' + (onglets.length + 1), blocs: [{ t: 'p', runs: [], al: 'g' }] });
      marquer(); actif = -1; montrerOnglet(onglets.length - 1); renommerOnglet(onglets.length - 1);
    }
    function renommerOnglet(i) {
      var champ = h('input', { type: 'text', maxlength: 60, value: onglets[i].titre, 'aria-label': 'Nom de l’onglet' });
      U.modale('Renommer l’onglet', h('label', {}, 'Nom', champ), [{ texte: 'Annuler' }, { texte: 'Renommer', classe: 'primaire', action: function () { onglets[i].titre = champ.value.trim().slice(0, 60) || onglets[i].titre; marquer(); dessinerOnglets(); } }]);
      setTimeout(function () { champ.select(); }, 50);
    }
    function actionOnglet(v) {
      if (v === 'renommer') return renommerOnglet(actif);
      garderOnglet();
      if (v === 'gauche' && actif > 0) { onglets.splice(actif - 1, 0, onglets.splice(actif, 1)[0]); actif--; }
      else if (v === 'droite' && actif < onglets.length - 1) { onglets.splice(actif + 1, 0, onglets.splice(actif, 1)[0]); actif++; }
      else if (v === 'supprimer') {
        if (!confirm('Supprimer l’onglet « ' + onglets[actif].titre + ' » et son contenu ? (Il reste dans l’historique des versions.)')) return;
        onglets.splice(actif, 1); actif = Math.max(0, actif - 1);
        if (onglets.length === 1) { onglets[0].id = ''; onglets[0].titre = ''; }   // plus qu'un : document sans onglets
        U.vider(corps); rendreBlocs(onglets[actif].blocs).forEach(function (n) { corps.appendChild(n); });
      } else return;
      marquer(); dessinerOnglets(); dessinerBarre();
    }
    function dessinerZones() {
      var v = valeursPage(doc(id) || d0, { titre: titre.value || 'Sans titre' });
      U.vider(entete).appendChild(zonesPage(page.entete, v, 'doc-entete'));
      U.vider(pied).appendChild(zonesPage(page.pied, v, 'doc-pied'));
      appliquerPage(feuille, corps, page);
    }
    dessinerZones();

    // Édition simultanée en direct (0.37.0) : enregistrement 3 s après la dernière frappe, sinon 15 s
    var tours = 0;   // compteur des modifications : une frappe pendant un enregistrement n'est jamais perdue
    function marquer() { if (!modifiable) return; sale = true; tours++; etat.textContent = 'Modifications non enregistrées'; clearTimeout(minuteur); minuteur = setTimeout(function () { enregistrer(false); }, opts().simultane ? 3000 : SAUVEGARDE_MS); }
    /** Contenu affiché remplacé (version d'un autre agent ou fusion), position du curseur gardée autant que possible. */
    function appliquerContenu(x) {
      if (document.activeElement !== titre && x.meta.titre !== (titre.value.trim() || 'Sans titre')) titre.value = x.meta.titre;
      meta.rattaches = x.meta.rattaches;
      if (tab) { tab.remplacer(x.contenu); return; }
      var pos = positionCurseur(), courant = onglets[actif] && onglets[actif].id;
      onglets = JSON.parse(JSON.stringify(DM.ongletsDe(x.contenu)));
      actif = Math.max(0, onglets.map(function (o) { return o.id; }).indexOf(courant));
      U.vider(corps); rendreBlocs(onglets[actif].blocs || []).forEach(function (n) { corps.appendChild(n); });
      Object.assign(page, x.contenu.page); dessinerZones(); remettreCurseur(pos); dessinerOnglets();
    }
    function positionCurseur() {
      var sel = window.getSelection(); if (!sel.rangeCount || !corps.contains(sel.anchorNode)) return null;
      var n = sel.anchorNode; while (n && n.parentNode !== corps) n = n.parentNode;
      if (!n) return null;
      var i = Array.prototype.indexOf.call(corps.childNodes, n), r = document.createRange(); r.setStart(n, 0); r.setEnd(sel.anchorNode, sel.anchorOffset);
      return { i: i, off: r.toString().length };
    }
    function remettreCurseur(pos) {
      if (!pos) return;
      var n = corps.childNodes[Math.min(pos.i, corps.childNodes.length - 1)]; if (!n) return;
      var w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT), reste = pos.off, t = w.nextNode(), dernier = null;
      while (t) { if (t.nodeValue.length >= reste) break; reste -= t.nodeValue.length; dernier = t; t = w.nextNode(); }
      var r = document.createRange();
      if (t) r.setStart(t, reste); else if (dernier) r.setStart(dernier, dernier.nodeValue.length); else r.setStart(n, 0);
      r.collapse(true); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    /**
     * Version enregistrée par un autre agent depuis la sienne : fusion à trois (base = version de départ) ; ce que chacun a
     * changé est gardé ; un même passage changé des deux côtés : les deux sont gardés (conflit signalé).
     */
    var toursDepart = 0;
    async function integrerAutres(contenuMien) {
      var dd = doc(id), der = DM.derniere(dd);
      if (!der || !base || der.id === base) return null;
      // Ancêtre commun : la version de départ de la dernière version (enregistrée en même temps que la sienne), sinon la sienne
      var ancetre = der.base && der.base !== base ? der.base : base, va = dd.versions.filter(function (v) { return v.id === ancetre; })[0];
      var autre = await lireVersion(dd, der), depart = cache[ancetre] || (va ? await lireVersion(dd, va) : null) || cache[base];
      if (!autre) return null;
      if (!depart) { base = der.id; return null; }
      // Frappe pendant la lecture : la fusion part du contenu affiché à cet instant (rien n'est perdu)
      if (tours !== toursDepart) contenuMien = lireContenu();
      var f = DM.fusionnerVersions(depart, { meta: { titre: titre.value.trim() || 'Sans titre', rattaches: meta.rattaches }, contenu: contenuMien }, autre);
      base = der.id;
      appliquerContenu(f);
      var qui = nomAgent(der.par, dd);
      U.toast('Modifications de ' + qui + ' intégrées' + (f.conflits ? ' ; ' + f.conflits + ' passage(s) modifié(s) des deux côtés : les deux versions sont gardées, à relire.' : '.'));
      return f;
    }
    async function enregistrer(fermer) {
      clearTimeout(minuteur);
      if (!modifiable || (!sale && !fermer)) return true;
      if (enregistrement) { await enregistrement; if (!sale) return true; }
      enregistrement = (async function () {
        try {
          if (!tab) normaliserPage();
          var contenu = lireContenu(); toursDepart = tours;
          // Version d'un autre agent enregistrée entre-temps : fusion avant d'enregistrer la sienne (0.37.0)
          try { await s().synchroniser(); } catch (e) { /* lecture des dernières saisies impossible : fusion à la prochaine */ }
          var fu = await integrerAutres(contenu);
          if (fu) { contenu = fu.contenu; meta.rattaches = fu.meta.rattaches; }
          else if (tours !== toursDepart) { if (!tab) normaliserPage(); contenu = lireContenu(); }
          var toursEnregistres = tours;
          meta.titre = titre.value.trim() || 'Sans titre';
          var c = await s().chiffrerDocument(id, { meta: meta, contenu: contenu });
          var e = await s().enregistrer('DOC_VERSION', { doc: id, g: c.g, ct: c.ct, nom: moi().nom, base: base || '' });
          cache[e.id] = { meta: DM.meta(meta), contenu: contenu };
          base = e.id; sale = tours !== toursEnregistres;   // frappe pendant l'écriture : un nouvel enregistrement suivra
          if (sale) marquer();
          etat.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          dessinerBarre();
          return true;
        } catch (err) { etat.textContent = 'Échec de l’enregistrement : ' + err.message; U.toast(err.message); return false; }
        finally { enregistrement = null; }
      })();
      return enregistrement;
    }
    corps.addEventListener('input', function (ev) {
      // Nouveau paragraphe (Entrée) avec suivi : marqué « nouveau paragraphe » (refus : rejoint le précédent)
      if (suiviActif() && ev.inputType === 'insertParagraph') { var b = blocDuCurseur(); if (b && b.tagName !== 'TABLE') marquerBloc(b, 'ins'); }
      marquer();
    });
    // Suivi des modifications (0.37.0) : texte ajouté et supprimé marqué (auteur, date) au lieu d'être écrit ou effacé
    corps.addEventListener('beforeinput', function (ev) {
      if (!suiviActif()) return;
      var t2 = ev.inputType;
      if (t2 === 'insertText' || t2 === 'insertReplacementText' || t2 === 'insertCompositionText') {
        if (t2 === 'insertCompositionText') return;
        ev.preventDefault(); insererSuivi(ev.data || (ev.dataTransfer && ev.dataTransfer.getData('text/plain')) || ''); marquer();
      } else if (/^delete/.test(t2)) { ev.preventDefault(); supprimerSuivi(t2); marquer(); }
    });
    function marqueSuivi(tag) {
      var me = moi(), le = new Date().toISOString();
      return h(tag, { class: 'suivi-' + tag, 'data-p': me.id, 'data-n': me.nom, 'data-le': le, title: (tag === 'ins' ? 'Ajouté' : 'Supprimé') + ' par ' + me.nom + ' le ' + jourFr(le) });
    }
    function monIns(n) { var x = n && (n.nodeType === 1 ? n : n.parentNode); x = x && x.closest ? x.closest('ins.suivi-ins') : null; return x && corps.contains(x) && x.getAttribute('data-p') === moi().id ? x : null; }
    function dansDel(n) { var x = n && (n.nodeType === 1 ? n : n.parentNode); x = x && x.closest ? x.closest('del.suivi-del') : null; return x && corps.contains(x) ? x : null; }
    function insererSuivi(texte) {
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var r = sel.getRangeAt(0);
      if (!r.collapsed) { supprimerPlage(r, false); r = window.getSelection().getRangeAt(0); }
      if (!texte) return;
      var d = dansDel(r.startContainer); if (d) { r.setStartAfter(d); r.collapse(true); }
      var noeud = document.createTextNode(texte), ins = monIns(r.startContainer);
      if (ins) r.insertNode(noeud);
      else { var el = marqueSuivi('ins'); el.appendChild(noeud); r.insertNode(el); }
      r.setStartAfter(noeud); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    }
    function supprimerSuivi(type) {
      var sel = window.getSelection(); if (!sel.rangeCount) return;
      var arriere = /Backward/.test(type);
      if (sel.getRangeAt(0).collapsed && limiteBloc(arriere)) return;   // début ou fin de paragraphe : fusion suivie
      if (sel.getRangeAt(0).collapsed) { try { sel.modify('extend', arriere ? 'backward' : 'forward', /Word/.test(type) ? 'word' : /Line/.test(type) ? 'lineboundary' : 'character'); } catch (e) { return; } }
      var r = sel.getRangeAt(0); if (r.collapsed) return;
      supprimerPlage(r, arriere);
    }
    // ---- Paragraphes et mise en forme suivis (0.38.0)
    function marquerBloc(el, op) {
      var me = moi(), le = new Date().toISOString();
      el.setAttribute('data-suivi', op); el.setAttribute('data-p', me.id); el.setAttribute('data-n', me.nom); el.setAttribute('data-le', le); el.setAttribute('data-id', 'b' + hex(5));
      el.setAttribute('title', DM.OPS_BLOC[op] + ' par ' + me.nom + ' le ' + jourFr(le));
    }
    function demarquerBloc(el) { ['data-suivi', 'data-p', 'data-n', 'data-le', 'data-id', 'title'].forEach(function (a) { el.removeAttribute(a); }); if (el.classList.contains('doc-saut')) el.setAttribute('title', 'Saut de page'); }
    function blocDuCurseur() {
      var sel = window.getSelection(), n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      while (n && n !== corps) { if (n.nodeType === 1 && (n.parentNode === corps || n.tagName === 'LI') && !/^(UL|OL)$/.test(n.tagName)) return n; n = n.parentNode; }
      return null;
    }
    function frere(b, sens) { var x = sens < 0 ? b.previousElementSibling : b.nextElementSibling; if (!x && b.tagName === 'LI') { var l = b.parentNode; x = sens < 0 ? l.previousElementSibling : l.nextElementSibling; if (x && /^(UL|OL)$/.test(x.tagName)) x = sens < 0 ? x.lastElementChild : x.firstElementChild; } else if (x && /^(UL|OL)$/.test(x.tagName)) x = sens < 0 ? x.lastElementChild : x.firstElementChild; return x; }
    function aLaLimite(b, debut) {
      var sel = window.getSelection(), r = sel.getRangeAt(0), x = document.createRange();
      x.selectNodeContents(b); if (debut) x.setEnd(r.startContainer, r.startOffset); else x.setStart(r.startContainer, r.startOffset);
      return x.toString().replace(/\u200b/g, '') === '';
    }
    function joindre(prec, b) { while (b.firstChild) prec.appendChild(b.firstChild); b.parentNode.removeChild(b); }
    function curseurFin(el) { var r = document.createRange(); r.selectNodeContents(el); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    /**
     * Retour arrière au début d'un paragraphe (ou Suppr à la fin) : la fusion des deux paragraphes est marquée (à
     * accepter) ; un saut de page ou un tableau voisin est marqué supprimé ; son propre paragraphe ajouté est joint.
     */
    function limiteBloc(arriere) {
      var b = blocDuCurseur(); if (!b || !aLaLimite(b, arriere)) return false;
      var cible = arriere ? b : frere(b, 1), voisin = arriere ? frere(b, -1) : b;
      if (!cible || !voisin || cible === voisin) return true;
      var autre = arriere ? voisin : cible;
      if (autre.classList && (autre.classList.contains('doc-saut') || autre.tagName === 'TABLE')) {
        if (autre.getAttribute('data-suivi') === 'ajout' && autre.getAttribute('data-p') === moi().id) autre.parentNode.removeChild(autre); else if (autre.getAttribute('data-suivi') !== 'del') marquerBloc(autre, 'del');
        return true;
      }
      if (cible.getAttribute('data-suivi') === 'ins' && cible.getAttribute('data-p') === moi().id) { var p0 = voisin; joindre(voisin, cible); curseurFin(p0); return true; }
      if (cible.getAttribute('data-suivi') !== 'fusion') marquerBloc(cible, 'fusion');
      if (arriere) curseurFin(voisin);
      return true;
    }
    /** Mise en forme suivie : le texte sélectionné garde sa mise en forme d'avant (si elle n'est pas déjà suivie). */
    function formeDe(n) { var chaine = []; for (var x = n.parentNode; x && x !== corps; x = x.parentNode) chaine.unshift(x); var m = {}; chaine.forEach(function (el) { m = marques(el, m); }); var r = {}; ['g', 'i', 's', 'b', 'p', 'z', 'c', 'f'].forEach(function (k) { if (m[k]) r[k] = m[k]; }); return r; }
    function preparerFormeSuivie() {
      var sel = window.getSelection(); if (!sel.rangeCount || sel.getRangeAt(0).collapsed) return;
      var r = sel.getRangeAt(0), textes = [], w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) if (r.intersectsNode(n) && corps.contains(n)) textes.push(n);
      var premier = null, dernier = null, me = moi(), le = new Date().toISOString(), idf = 'f' + hex(5);
      textes.forEach(function (tn) {
        var a = tn === r.startContainer ? r.startOffset : 0, b = tn === r.endContainer ? r.endOffset : tn.nodeValue.length;
        if (b <= a) return;
        var m = tn; if (a > 0) m = tn.splitText(a); if (b - a < m.nodeValue.length) m.splitText(b - a);
        var deja = m.parentNode.closest && m.parentNode.closest('span.suivi-fmt');
        if (deja && corps.contains(deja)) { premier = premier || m; dernier = m; return; }
        var sp = h('span', { class: 'suivi-fmt', 'data-p': me.id, 'data-n': me.nom, 'data-le': le, 'data-id': idf, 'data-avant': JSON.stringify(formeDe(m)), title: 'Mise en forme modifiée par ' + me.nom + ' le ' + jourFr(le) });
        m.parentNode.insertBefore(sp, m); sp.appendChild(m);
        premier = premier || sp; dernier = sp;
      });
      if (premier) { var x = document.createRange(); x.setStartBefore(premier); x.setEndAfter(dernier); sel.removeAllRanges(); sel.addRange(x); rangeGarde = x.cloneRange(); }
    }
    /** Plage supprimée avec suivi : son propre texte ajouté disparaît, le reste est marqué « supprimé ». */
    function supprimerPlage(r, arriere) {
      var textes = [], w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) if (r.intersectsNode(n) && corps.contains(n)) textes.push(n);
      var premier = null, dernier = null;
      textes.forEach(function (tn) {
        var a = tn === r.startContainer ? r.startOffset : 0, b = tn === r.endContainer ? r.endOffset : tn.nodeValue.length;
        if (b <= a) return;
        if (dansDel(tn)) { premier = premier || tn; dernier = tn; return; }
        var milieu = tn; if (a > 0) milieu = tn.splitText(a); if (b - a < milieu.nodeValue.length) milieu.splitText(b - a);
        if (monIns(milieu)) { var p0 = milieu.parentNode; p0.removeChild(milieu); if (!p0.textContent) { var ancre = h('span'); p0.parentNode.insertBefore(ancre, p0); p0.parentNode.removeChild(p0); premier = premier || ancre; dernier = ancre; } return; }
        var del = marqueSuivi('del'); milieu.parentNode.insertBefore(del, milieu); del.appendChild(milieu);
        premier = premier || del; dernier = del;
      });
      var sel = window.getSelection(), c = document.createRange();
      if (premier && premier.isConnected) { if (arriere) c.setStartBefore(premier); else c.setStartAfter(dernier && dernier.isConnected ? dernier : premier); } else { c.setStart(r.startContainer, Math.min(r.startOffset, (r.startContainer.nodeValue || r.startContainer.childNodes || '').length)); }
      c.collapse(true); sel.removeAllRanges(); sel.addRange(c);
      Array.prototype.forEach.call(corps.querySelectorAll('span:not([class])'), function (x) { if (!x.textContent) { var r2 = document.createRange(); if (sel.rangeCount && x.contains(sel.anchorNode)) { r2.setStartBefore(x); r2.collapse(true); } x.parentNode.removeChild(x); if (r2.startContainer !== document) { sel.removeAllRanges(); sel.addRange(r2); } } });
    }
    titre.addEventListener('input', function () { marquer(); dessinerZones(); dlg.setAttribute('aria-label', 'Document : ' + (titre.value || 'Sans titre')); });

    // Sélection gardée : les listes de la barre d'outils prennent le focus
    document.addEventListener('selectionchange', garderSelection);
    function garderSelection() { var sel = window.getSelection(); if (sel.rangeCount && corps.contains(sel.getRangeAt(0).commonAncestorContainer)) rangeGarde = sel.getRangeAt(0).cloneRange(); }
    function remettreSelection() {
      corps.focus();
      if (rangeGarde) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rangeGarde); }
    }
    function cmd(nom, val) { remettreSelection(); if (suiviActif() && /^(bold|italic|underline|strikeThrough|removeFormat)$/.test(nom)) preparerFormeSuivie(); try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* */ } document.execCommand(nom, false, val === undefined ? null : val); normaliserPage(); marquer(); garderSelection(); }
    /** Police, taille, couleur, surlignage : commande du navigateur avec une valeur repère, aussitôt remplacée par une classe. */
    function marque(genre, valeur) {
      remettreSelection();
      if (suiviActif()) preparerFormeSuivie();
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
      if (suiviActif()) nouveaux.forEach(function (n) { marquerBloc(n, 'ajout'); });   // tableau, saut de page ajoutés : suivis
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
      Array.prototype.forEach.call(corps.querySelectorAll('span'), function (x) {
        if (!r.intersectsNode(x)) return;
        if (x.classList.contains('suivi-fmt')) { Array.prototype.slice.call(x.classList).forEach(function (c) { if (c !== 'suivi-fmt') x.classList.remove(c); }); return; }   // marque du suivi gardée
        while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove();
      });
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
      var r = sel.getRangeAt(0);
      if (suiviActif()) {
        // Suivi : la sélection remplacée est marquée supprimée, le texte collé marqué ajouté
        if (!r.collapsed) { supprimerPlage(r, false); r = window.getSelection().getRangeAt(0); }
        var mq = { p: moi().id, n: moi().nom, le: new Date().toISOString() };
        blocs.forEach(function (b) { (b.t === 'table' ? [].concat.apply([], b.lignes.map(function (l) { return l.map(function (c) { return c.runs; }); })) : [b.runs || []]).forEach(function (rs) { rs.forEach(function (x) { x.ins = mq; }); }); });
        var dz = dansDel(r.startContainer); if (dz) { r.setStartAfter(dz); r.collapse(true); }
      } else r.deleteContents();
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
          else { if (!marquesVisibles) luI.contenu = DM.resoudreSuivi(luI.contenu, true); imprimer(id, luI); } }); } }, 'Imprimer'),
        DM.peutExporter(dd, moi(), cfg()) && !s().apercu && SIC.documentsExport ? h('button', { class: 'btn', type: 'button', onclick: function () { enregistrer(false).then(function () { modaleExport(); }); } }, 'Exporter…') : null,
        gere && !dd.corbeille && !s().apercu ? h('button', { class: 'btn danger', type: 'button', onclick: function () { mettreACorbeille(id); } }, 'Corbeille') : null,
        h('button', { class: 'btn', type: 'button', onclick: fermer }, 'Fermer')));
      barre.appendChild(ligneTravail(dd));
      if (dd.corbeille) barre.appendChild(h('p', { class: 'alerte', text: 'Dans la corbeille depuis le ' + dateCourte(dd.corbeille.le) + ' : effacé définitivement dans ' + DM.joursAvantEffacement(dd, Date.now(), jc()) + ' jour(s).' }));
      if (stt.statut === 'a-valider' && stt.attendu) barre.appendChild(h('p', { class: 'info', text: 'Validation supplémentaire demandée à ' + nomAgent(stt.attendu, dd) + ' par ' + nomAgent(stt.demandePar, dd) + ' le ' + dateCourte(stt.demandeLe) + (stt.message ? ' : ' + stt.message : '') + '.' }));
      else if (stt.statut === 'a-valider' && stt.message) barre.appendChild(h('p', { class: 'info', text: 'Demande de validation : ' + stt.message }));
      if (/^(valide|modifie|a-reviser)$/.test(stt.statut) && stt.etapes && stt.etapes.length > 1) barre.appendChild(h('p', { class: 'info', text: 'Validé par ' + stt.etapes.map(function (x) { return nomAgent(x.par, dd) + ' (' + jourFr(x.le) + ')'; }).join(', puis ') + '.' }));
      if (dd.transfert) barre.appendChild(h('p', { class: 'muted', text: 'Compte de l’auteur retiré : gestion transférée le ' + jourFr(dd.transfert.le) + ' à ' + dd.transfert.vers.map(function (x) { return nomAgent(x, dd); }).join(', ') + '.' }));
      if (stt.statut === 'brouillon' && stt.message) barre.appendChild(h('p', { class: 'info', text: 'Renvoyé en brouillon : ' + stt.message }));
      if (stt.statut === 'modifie') barre.appendChild(h('p', { class: 'info', text: 'Modifié depuis la validation du ' + dateCourte(stt.le) + ' : la version validée reste en vigueur (Historique) jusqu’à une nouvelle validation.' }));
    }
    // ---- Travail à plusieurs (0.37.0) : présence, édition simultanée, suivi des modifications
    var zonePresence = h('span', { class: 'doc-presence', 'aria-live': 'polite' });
    var MARQUES = 'ins.suivi-ins, del.suivi-del, span.suivi-fmt, [data-suivi]';
    function nombreMarques() { if (tab) return tab.modifsSuivies().length; if (onglets.length > 1) return DM.modificationsSuivies(lireContenu()).length; var ids = {}; Array.prototype.forEach.call(corps.querySelectorAll(MARQUES), function (el, i) { ids[el.getAttribute('data-id') || 'n' + i] = 1; }); return Object.keys(ids).length; }
    function ligneTravail(dd) {
      var o = opts(), n = nombreMarques();
      function option(k, v) { return async function () { try { await s().enregistrer('DOC_OPTIONS', Object.assign({ doc: id, simultane: o.simultane, suivi: o.suivi, export: o.export, nom: moi().nom }, (function () { var x = {}; x[k] = v; return x; })())); dessinerBarre(); U.toast(k === 'suivi' ? (v ? 'Suivi des modifications activé : vos ajouts et suppressions sont marqués.' : 'Suivi des modifications désactivé.') : (v ? 'Édition simultanée activée : les modifications des autres s’affichent en direct.' : 'Édition simultanée désactivée.')); } catch (e) { U.toast(e.message); } }; }
      var cbMarques = h('input', { type: 'checkbox', checked: marquesVisibles, 'aria-label': 'Afficher les marques' });
      cbMarques.addEventListener('change', function () { marquesVisibles = cbMarques.checked; corps.classList.toggle('suivi-masque', !marquesVisibles); if (tab) tab.marques(marquesVisibles); });
      return h('div', { class: 'doc-barre-ligne doc-travail' },
        modifiable ? h('button', { class: 'btn petit' + (o.suivi ? ' actif' : ''), type: 'button', 'aria-pressed': o.suivi ? 'true' : 'false', onclick: option('suivi', !o.suivi) }, o.suivi ? '✎ Suivi des modifications : activé' : '✎ Suivi des modifications : désactivé') : (o.suivi ? h('span', { class: 'badge', text: 'Suivi des modifications activé' }) : null),
        o.suivi || n ? h('label', { class: 'case' }, cbMarques, h('span', { text: 'Afficher les marques' })) : null,
        n ? h('button', { class: 'btn petit', type: 'button', onclick: modaleSuivi }, 'Modifications suivies (' + n + ')…') : null,
        modifiable ? h('button', { class: 'btn petit' + (o.simultane ? ' actif' : ''), type: 'button', 'aria-pressed': o.simultane ? 'true' : 'false', onclick: option('simultane', !o.simultane), title: 'Activée : enregistrement toutes les 3 secondes et modifications des autres affichées en direct. Désactivée : les modifications de chacun sont fusionnées à l’enregistrement.' }, o.simultane ? '⇄ Édition simultanée : activée' : '⇄ Édition simultanée : désactivée') : null,
        zonePresence);
    }
    function dessinerPresence() {
      U.vider(zonePresence);
      if (!autres.length) return;
      zonePresence.appendChild(h('span', { class: 'muted', text: 'Aussi ouvert par : ' }));
      autres.forEach(function (x, i) { zonePresence.appendChild(h('span', { class: 'doc-avatar' + (x.modifie ? ' modifie' : ''), title: x.modifie ? 'Peut modifier le document' : 'En lecture', text: (i ? ' ' : '') + x.nom + (x.modifie ? ' (modifie)' : '') })); });
      if (!opts().simultane && modifiable && autres.some(function (x) { return x.modifie; })) zonePresence.appendChild(h('span', { class: 'muted', text: ' — vos enregistrements seront fusionnés avec les leurs.' }));
    }
    /** Export (0.40.0) : PDF, Word, RTF pour le texte ; Excel, CSV, PDF pour le tableur ; inscrit au journal. */
    function modaleExport() {
      var X = SIC.documentsExport, luE = { meta: { titre: titre.value.trim() || 'Sans titre', rattaches: meta.rattaches }, contenu: lireContenu() }, genre = luE.contenu.genre === 'tableur' ? 'tableur' : 'texte';
      var fmt = h('select', { 'aria-label': 'Format' }, X.FORMATS[genre].map(function (f) { return h('option', { value: f.code, text: f.libelle }); }));
      var marques = (genre === 'tableur' ? SIC.tableur.modificationsSuivies(luE.contenu) : DM.modificationsSuivies(luE.contenu)).length;
      var suivi = h('select', { 'aria-label': 'Modifications suivies' }, [['final', 'Version finale (modifications acceptées)'], ['marques', 'Avec les modifications suivies (révisions de Word)']].map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
      var zSuivi = h('label', {}, 'Modifications suivies (' + marques + ')', suivi), feuille = tab ? tab.feuille() : 0;
      function formes() { zSuivi.hidden = !(genre === 'texte' && marques && fmt.value === 'docx'); }
      fmt.addEventListener('change', formes); formes();
      U.modale('Exporter le document', h('div', { class: 'pile' }, h('label', {}, 'Format', fmt), zSuivi,
        genre === 'tableur' ? h('small', { class: 'muted', text: 'CSV : feuille affichée (« ' + luE.contenu.feuilles[feuille].nom + ' »), séparateur « ; », pour un tableur en français. Excel : formules écrites en anglais avec leurs résultats ; les modifications suivies ne sont pas reprises.' }) : h('small', { class: 'muted', text: 'PDF : polices remplacées par Helvetica (police standard des PDF). RTF et PDF : modifications suivies acceptées.' }),
        h('p', { class: 'alerte', text: 'Le fichier exporté n’est plus chiffré par Tessera : rangez-le sur le réseau de l’établissement, jamais sur un support personnel. Aucune donnée clinique.' })),
        [{ texte: 'Annuler' }, { texte: 'Exporter', classe: 'primaire', action: async function () {
          var der = DM.derniere(doc(id)), f = X.exporter(luE, { format: fmt.value, suivi: suivi.value, valeurs: valeursPage(doc(id) || d0, luE.meta), feuille: feuille, auteur: moi().nom });
          await s().enregistrer('DOC_EXPORT', { doc: id, format: fmt.value, version: der ? der.id : '', nom: moi().nom });
          await U.exporter('documents', f.nom, f.octets, f.type);
        } }]);
    }
    /** Marques du suivi : chacune acceptée ou refusée, ou toutes. */
    function modaleSuivi() {
      var zone = h('div', { class: 'pile' });
      function liste() {
        U.vider(zone);
        if (tab) {
          var ms = tab.modifsSuivies();
          if (!ms.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucune modification suivie.' }));
          ms.forEach(function (m) {
            zone.appendChild(h('div', { class: 'doc-suivi-ligne' }, h('b', { text: m.feuille + ' — ' }), h('span', { class: m.op === 'del' ? 'diff-retrait' : m.op === 'ins' ? 'diff-ajout' : '', text: m.libelle }), h('small', { class: 'muted', text: ' — ' + (m.n || nomAgent(m.p, doc(id))) + ', ' + jourFr(m.le) }),
              modifiable ? h('span', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { tab.resoudre(true, { fi: m.fi, cle: m.cle }); liste(); dessinerBarre(); } }, 'Accepter'), h('button', { class: 'btn petit', type: 'button', onclick: function () { tab.resoudre(false, { fi: m.fi, cle: m.cle }); liste(); dessinerBarre(); } }, 'Refuser')) : null));
          });
          return;
        }
        var vus = {}, els = Array.prototype.slice.call(corps.querySelectorAll(MARQUES)).filter(function (el) { var k = el.getAttribute('data-id'); if (!k) return true; if (vus[k]) return false; vus[k] = 1; return true; });
        if (!els.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucune modification suivie' + (onglets.length > 1 ? ' dans cet onglet.' : '.') }));
        if (onglets.length > 1) { var ailleurs = DM.modificationsSuivies(lireContenu()).filter(function (m) { return m.onglet !== onglets[actif].id; }).length; if (ailleurs) zone.appendChild(h('p', { class: 'info', text: 'Onglet « ' + onglets[actif].titre + ' » affiché ; ' + ailleurs + ' autre(s) modification(s) dans les autres onglets (« Tout accepter » et « Tout refuser » valent pour tous les onglets).' })); }
        els.forEach(function (el) {
          var ajout = el.tagName === 'INS', op = el.getAttribute('data-suivi'), fmt = el.classList.contains('suivi-fmt');
          var texteFmt = fmt ? Array.prototype.map.call(corps.querySelectorAll('span.suivi-fmt[data-id="' + el.getAttribute('data-id') + '"]'), function (x) { return x.textContent; }).join('').slice(0, 120) : '';
          var lib = op ? DM.OPS_BLOC[op] + (el.tagName === 'TABLE' ? ' (tableau)' : el.classList.contains('doc-saut') ? ' (saut de page)' : ' : ' + el.textContent.slice(0, 120))
            : fmt ? 'Mise en forme modifiée : ' + texteFmt : (ajout ? 'Ajout : ' : 'Suppression : ') + el.textContent.slice(0, 160);
          zone.appendChild(h('div', { class: 'doc-suivi-ligne' }, h('span', { class: ajout || op === 'ins' || op === 'ajout' ? 'diff-ajout' : op || !fmt ? 'diff-retrait' : 'diff-modifie', text: lib }),
            h('small', { class: 'muted', text: ' — ' + (el.getAttribute('data-n') || nomAgent(el.getAttribute('data-p'), doc(id))) + ', ' + jourFr(el.getAttribute('data-le')) }),
            h('button', { class: 'btn petit lien', type: 'button', onclick: function () { el.scrollIntoView({ block: 'center' }); el.classList.add('suivi-vu'); setTimeout(function () { el.classList.remove('suivi-vu'); }, 1500); } }, 'Voir'),
            modifiable ? h('span', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { resoudreMarque(el, true); liste(); } }, 'Accepter'), h('button', { class: 'btn petit', type: 'button', onclick: function () { resoudreMarque(el, false); liste(); } }, 'Refuser')) : null));
        });
      }
      liste();
      U.modale('Modifications suivies', h('div', { class: 'pile' }, zone, h('small', { class: 'muted', text: 'Accepter un ajout le garde ; accepter une suppression retire le texte. Refuser fait l’inverse. Chaque choix est enregistré comme une nouvelle version.' })),
        [{ texte: 'Fermer' },
          modifiable ? { texte: 'Tout refuser', action: function () { toutResoudre(false); } } : null,
          modifiable ? { texte: 'Tout accepter', classe: 'primaire', action: function () { toutResoudre(true); } } : null], { large: true });
    }
    function resoudreMarque(el, accepter) {
      // Mise en forme, paragraphes : sur le contenu (Tessera retrouve la marque par son identifiant)
      if (el.classList.contains('suivi-fmt') || el.getAttribute('data-suivi')) {
        appliquerContenu({ meta: { titre: titre.value.trim() || 'Sans titre', rattaches: meta.rattaches }, contenu: DM.resoudreSuivi(lireContenu(), accepter, el.getAttribute('data-id')) });
        marquer(); dessinerBarre(); return;
      }
      var garder = (el.tagName === 'INS') === accepter;
      if (garder) { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); }
      el.parentNode.removeChild(el);
      marquer(); dessinerBarre();
    }
    function toutResoudre(accepter) {
      if (tab) tab.resoudre(accepter);
      else appliquerContenu({ meta: { titre: titre.value.trim() || 'Sans titre', rattaches: meta.rattaches }, contenu: DM.resoudreSuivi(lireContenu(), accepter) });
      marquer(); dessinerBarre();
    }
    // Présence toutes les 10 s ; édition simultanée : versions des autres reprises toutes les 4 s
    async function battement() {
      if (ferme) return;
      try { await s().signalerPresence(id, { modifie: modifiable }); autres = await s().presencesDocument(id); dessinerPresence(); } catch (e) { /* présence indisponible */ }
    }
    async function direct() {
      if (ferme || !opts().simultane || enregistrement) return;
      var der = DM.derniere(doc(id));
      if (!der || !base || der.id === base) return;
      if (sale && modifiable) { enregistrer(false); return; }   // la fusion se fait à l'enregistrement
      var t0 = tours, lu2 = await lireVersion(doc(id), der); if (!lu2 || ferme || sale || tours !== t0) return;
      // Version enregistrée en même temps que la sienne (départ différent) : fusion, puis enregistrement du résultat
      if (der.base && der.base !== base && modifiable) {
        var actuel = { meta: { titre: titre.value.trim() || 'Sans titre', rattaches: meta.rattaches }, contenu: lireContenu() };
        if (JSON.stringify(DM.contenu(actuel.contenu)) !== JSON.stringify(lu2.contenu)) { sale = true; tours++; enregistrer(false); return; }
      }
      base = der.id; appliquerContenu(lu2); etat.textContent = 'Mis à jour : modifications de ' + nomAgent(der.par, doc(id)) + ' (' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ')';
      dessinerBarre();
    }
    var minuteurPresence = setInterval(battement, 10000); setTimeout(battement, 500);
    minuteurDirect = setInterval(function () { direct().catch(function () {}); }, 4000);
    dessinerBarre();
    async function fermer() {
      if (ferme) return;
      if (sale && !(await enregistrer(true)) && !confirm('L’enregistrement a échoué. Fermer quand même (les dernières modifications seront perdues) ?')) return;
      ferme = true; clearTimeout(minuteur); clearInterval(minuteurPresence); clearInterval(minuteurDirect);
      s().retirerPresence(id).catch(function () {});
      document.removeEventListener('selectionchange', garderSelection);
      if (tab) tab.detruire();
      dlg.close(); dlg.remove(); U.rendreContenu();
    }
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); if (tab && tab.occupe()) { tab.annulerEdition(); return; } fermer(); });
    dlg.appendChild(h('div', { class: 'doc-cadre' + (tab ? ' doc-tableur' : '') }, barre, tab ? tab.outils : outils, tab ? tab.zone : h('div', { class: 'doc-fond' }, barreOnglets, feuille),
      h('p', { class: 'muted doc-rappel' }, h('small', { text: 'Document chiffré, partagé seulement avec les personnes choisies ; enregistré automatiquement, chaque enregistrement est une version. Aucune donnée clinique (le dossier du patient reste dans le DPI).' }))));
    if (!tab) dessinerOnglets();
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

  // ------------------------------------------------------------ Import Word, Excel, CSV (0.41.0)
  /** Fichier lu dans le navigateur (jamais copié sur le partage) : un nouveau document Tessera chiffré est créé. */
  function choisirImport(o) {
    var champ = h('input', { type: 'file', accept: '.docx,.xlsx,.xlsm,.csv', 'aria-label': 'Fichier à importer', class: 'cache-fichier' });
    champ.addEventListener('change', async function () {
      var f = champ.files && champ.files[0]; champ.remove(); if (!f) return;
      try {
        var r = await SIC.documentsImport.importer(f.name, new Uint8Array(await f.arrayBuffer()));
        modaleImport(r, f.name, o || {});
      } catch (e) { U.toast('Import impossible : ' + e.message); }
    });
    document.body.appendChild(champ); champ.click();
  }
  function modaleImport(r, nomFichier, o) {
    var tableur = r.contenu.genre === 'tableur', titre = h('input', { type: 'text', maxlength: 160, value: r.titre || nomFichier.replace(/\.[^.]+$/, ''), 'aria-label': 'Titre du document importé' });
    var resume = tableur ? r.contenu.feuilles.length + ' feuille(s), ' + r.contenu.feuilles.reduce(function (s, x) { return s + Object.keys(x.cellules).length; }, 0) + ' case(s) remplie(s)' : DM.ongletsDe(r.contenu).reduce(function (s, x) { return s + x.blocs.length; }, 0) + ' paragraphe(s) ou élément(s)';
    var marques = (tableur ? SIC.tableur.modificationsSuivies(r.contenu) : DM.modificationsSuivies(r.contenu)).length;
    U.modale('Importer « ' + nomFichier + ' »', h('div', { class: 'pile' },
      h('label', {}, 'Titre', titre),
      h('p', { text: (tableur ? 'Tableur' : 'Document texte') + ' : ' + resume + '.' + (marques ? ' ' + marques + ' modification(s) suivie(s) reprise(s) de Word, à accepter ou refuser.' : '') }),
      r.alertes.length ? h('ul', { class: 'alerte' }, r.alertes.map(function (a) { return h('li', { text: a }); })) : null,
      h('p', { class: 'muted', text: 'Le fichier est lu sur ce poste et n’est pas copié : seul le document Tessera créé est gardé, chiffré, privé jusqu’à son partage. Aucune donnée clinique.' })),
      [{ texte: 'Annuler' }, { texte: 'Créer le document', classe: 'primaire', action: async function () {
        var id = await creer({ meta: { titre: titre.value.trim() || 'Document importé', rattaches: o.rattache ? [o.rattache] : [] }, contenu: r.contenu });
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
    var o0 = d.options || {}, exp = h('select', { 'aria-label': 'Qui peut exporter' }, [['lire', 'Toute personne qui peut le lire'], ['modifier', 'Qui peut le modifier (par défaut)'], ['gerer', 'Qui le gère seulement']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (o0.export || 'modifier') === x[0] }); }));
    U.modale('Partager le document', h('div', { class: 'pile' }, zone,
      h('label', {}, 'Qui peut exporter le document (PDF, Word, Excel, RTF, CSV) ?', exp),
      h('small', { class: 'muted', text: 'Un fichier exporté n’est plus chiffré par Tessera : il est rangé dans le dossier des exports et chaque export est inscrit au journal.' }),
      h('fieldset', {}, h('legend', { text: 'Ajouter' }), h('div', { class: 'actions gauche' }, genre, code, svRole, droit,
        h('button', { class: 'btn', type: 'button', onclick: function () { var p = DM.entree({ genre: genre.value, code: code.value, service: svRole.value, droit: droit.value }); if (p) { l.push(p); l = DM.partage(l); dessiner(); } } }, 'Ajouter'))),
      h('p', { class: 'muted', text: 'Seules les personnes choisies reçoivent la clé du document. Un retrait crée une nouvelle clé pour la suite et retire l’accès aux versions précédentes.' })),
      [{ texte: 'Annuler' }, { texte: 'Enregistrer le partage', classe: 'primaire', action: async function () {
        var p = DM.partage(l), retrait = DM.retraitDe(d.partage, p);
        var r = await s().partagerCleDocument(id, DM.clesDocument(d.auteur, p), retrait);
        await s().enregistrer('DOC_PARTAGE', { doc: id, partage: p });
        if (exp.value !== (o0.export || 'modifier')) await s().enregistrer('DOC_OPTIONS', { doc: id, simultane: !!o0.simultane, suivi: !!o0.suivi, export: exp.value, nom: moi().nom });
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
    U.vider(zone).appendChild(lu ? h('div', { class: 'doc-apercu' }, h('h3', { text: lu.meta.titre + ' — version du ' + dateCourte(v.le) }), lu.contenu.genre === 'tableur' ? U.tableur.apercu(lu.contenu) : h('div', { class: 'doc-corps fp-' + lu.contenu.page.police + ' ft-' + lu.contenu.page.taille }, rendreContenuTexte(lu.contenu))) : h('p', { class: 'alerte', text: 'Version illisible (clé retirée ou effacée).' }));
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
    var luV = cache[v.id], marques = luV ? (luV.contenu.genre === 'tableur' ? SIC.tableur.modificationsSuivies(luV.contenu) : DM.modificationsSuivies(luV.contenu)).length : 0;
    U.modale(premiere ? 'Validation du document' : 'Validation supplémentaire', h('div', { class: 'pile' },
      h('p', { text: 'Version du ' + dateCourte(v.le) + ' (' + nomAgent(v.par, d) + ').' }),
      marques ? h('p', { class: 'alerte', text: marques + ' modification(s) suivie(s) pas encore acceptée(s) ni refusée(s) : la version validée les garde telles quelles (marques comprises).' }) : null,
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
    var corps = h('div', { class: 'doc-corps fp-' + p.police + ' ft-' + p.taille + ' lh-' + String(p.interligne).replace('.', '') }, rendreContenuTexte(lu.contenu, true));
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
        !s().apercu ? h('button', { class: 'btn', type: 'button', disabled: !cle, onclick: function () { modaleNouveau({ genre: 'tableur' }); } }, '+ Nouveau tableur') : null,
        !s().apercu && SIC.documentsImport ? h('button', { class: 'btn', type: 'button', disabled: !cle, onclick: function () { choisirImport(); } }, 'Importer un fichier…') : null),
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
    DOC_CORBEILLE: 'Documents : corbeille', DOC_EFFACE: 'Documents : effacement définitif', DOC_TRANSFERT: 'Documents : transfert de la gestion (compte retiré)', DOC_OPTIONS: 'Documents : options (suivi, édition simultanée, export)', DOC_EXPORT: 'Documents : export' };
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
      case 'DOC_OPTIONS': return 'Options de ' + nom + ' : suivi des modifications ' + (d.suivi ? 'activé' : 'désactivé') + ', édition simultanée ' + (d.simultane ? 'activée' : 'désactivée') + (d.export ? ', export : ' + { lire: 'lecteurs', modifier: 'qui peut modifier', gerer: 'qui gère' }[d.export] : '');
      case 'DOC_EXPORT': return 'Export de ' + nom + ' (' + String(d.format || '').toUpperCase() + ')';
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
