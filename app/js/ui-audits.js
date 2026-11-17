// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Audits internes — interface (lot P, 17 novembre 2026). Logique : module-audits.js.
 *
 * Onglets : « Audits » (grilles du service, réaliser un audit, derniers audits), « Résultats » (taux de conformité par
 * période et par critère, impression, export), « Registre » (tous les audits, détail, annulation).
 * Réglages (Administration → Audits internes, cadre pour ses services) : grilles (modèles ou vides) et auditeurs.
 * Écarts d'un audit : ajoutés à « Mes tâches » sur demande (élément rattaché : l'audit).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.audits, C = SIC.crypto;
  var filtre = { service: '', grille: '', grilleR: '', du: '', au: '', par: 'mois' };

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('audits') && s().etatModule('audits')) || { audits: {} }; }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return s().compteEffectif(); }
  function cfg() { return U.config(); }
  function services() { var l = U.services().map(function (x) { return x.code; }).filter(function (sv) { return A.droits.serviceActif(cfg(), sv); }); return U.App.service && U.App.service !== '*' && l.indexOf(U.App.service) >= 0 ? [U.App.service] : l; }
  function encadre() { return peut('AUDIT_ANNULE_TOUS') || s().roles().indexOf('ADMIN') >= 0; }
  function auditeur(sv) { return !s().apercu && peut('AUDIT') && A.peutAuditer(cfg(), sv, moi()); }
  function jourISO(t) { return SIC.model.dateLocaleISO(t); }
  function dateFr(iso) { return String(iso || '').split('-').reverse().join('/'); }
  function libTaux(t) { return t === null || t === undefined ? '—' : t + ' %'; }
  function classeTaux(t) { return t === null || t === undefined ? '' : t >= 90 ? 'au-bon' : t >= 70 ? 'au-moyen' : 'au-faible'; }
  function barre(t) {
    var b = h('span', { class: 'au-barre ' + classeTaux(t), 'aria-hidden': 'true' }, h('span', { class: 'au-barre-plein' }));
    if (t !== null && t !== undefined) b.firstChild.style.width = t + '%';
    return b;
  }

  // ------------------------------------------------------------ Réaliser un audit
  function modaleAudit(g, sv) {
    var date = h('input', { type: 'date', value: jourISO(Date.now()), max: jourISO(Date.now()), 'aria-label': 'Date de l’audit' });
    var ref = g.reference ? h('input', { type: 'text', maxlength: 60, 'aria-label': g.reference, placeholder: g.dossier ? 'ex. numéro de séjour — jamais le nom du patient' : '' }) : null;
    var com = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Commentaire de l’audit', placeholder: 'Synthèse, points forts, pistes d’amélioration' + (g.dossier || g.reference ? ' (aucun nom de patient)' : '') });
    var lignes = [], corps = [], rub = null;
    g.criteres.forEach(function (k, i) {
      if (k.rubrique && k.rubrique !== rub) { rub = k.rubrique; corps.push(h('tr', { class: 'au-rubrique' }, h('th', { colspan: 2, text: k.rubrique }))); }
      var nom = 'au-' + i, l = { k: k, radios: {} }, choix;
      if (k.mode === 'ratio') {
        l.conformes = h('input', { type: 'number', min: 0, step: 1, class: 'champ-court', 'aria-label': 'Conformes : ' + k.libelle });
        l.evalues = h('input', { type: 'number', min: 0, step: 1, class: 'champ-court', 'aria-label': 'Vérifiés : ' + k.libelle });
        l.etat = h('small', { class: 'muted' });
        var maj = function () { var c = l.conformes.value, n = l.evalues.value; l.etat.textContent = c !== '' && n > 0 ? Math.round(100 * c / n) + ' %' : ''; };
        l.conformes.addEventListener('input', maj); l.evalues.addEventListener('input', maj);
        choix = h('div', { class: 'en-ligne au-choix' }, l.conformes, h('span', { text: 'conforme(s) sur' }), l.evalues, h('span', { text: 'vérifié(s)' }), l.etat);
      } else if (k.mode === 'indicateur') {
        l.valeur = h('input', { type: 'number', min: 0, step: 'any', class: 'champ-court', 'aria-label': k.libelle });
        choix = h('div', { class: 'en-ligne au-choix' }, l.valeur, h('small', { class: 'muted', text: 'indicateur, hors du taux de conformité' }));
      } else choix = h('div', { class: 'en-ligne au-choix' }, Object.keys(A.REPONSES).map(function (r) {
        l.radios[r] = h('input', { type: 'radio', name: nom, value: r });
        return h('label', { class: 'case' }, l.radios[r], h('span', { text: A.REPONSES[r] }));
      }));
      l.com = h('input', { type: 'text', maxlength: 300, class: 'au-com', 'aria-label': 'Commentaire : ' + k.libelle, placeholder: 'Commentaire (facultatif)' });
      corps.push(h('tr', {}, h('td', {}, h('span', { text: k.libelle }), k.aide ? h('small', { class: 'muted bloc', text: k.aide }) : null), h('td', {}, choix, l.com)));
      lignes.push(l);
    });
    var tout = lignes.some(function (l) { return l.radios.oui; }) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.forEach(function (l) { if (l.radios.oui && !l.radios.non.checked && !l.radios.na.checked) l.radios.oui.checked = true; }); } }, 'Autres critères : conformes') : null;
    U.modale(g.libelle, h('div', { class: 'pile' },
      h('p', { class: 'muted', text: U.libService(sv) + (g.theme ? ' · ' + g.theme : '') + ' · ' + g.criteres.length + ' critère(s). Taux de conformité : moyenne des critères évalués (conforme 100 %, non conforme 0 %, proportion X sur N) ; un critère laissé vide n’est pas évalué.' }),
      g.modele !== 'libre' ? h('small', { class: 'muted', text: 'Grille proposée par Tessera, à adapter à la procédure de l’établissement (Administration → Audits internes).' }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Date de l’audit', date), ref ? h('label', {}, g.reference, ref) : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'au-grille' }, h('tbody', {}, corps))),
      tout ? h('div', { class: 'actions gauche' }, tout) : null,
      h('label', {}, 'Commentaire de l’audit (facultatif)', com)),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer l’audit', classe: 'primaire', action: async function () {
      var items = lignes.map(function (l) {
        var it = { libelle: l.k.libelle, rubrique: l.k.rubrique, mode: l.k.mode, commentaire: l.com.value.trim() };
        if (l.k.mode === 'ratio') { it.conformes = l.conformes.value === '' ? null : +l.conformes.value; it.evalues = l.evalues.value === '' ? null : +l.evalues.value; it.reponse = 'na'; }
        else if (l.k.mode === 'indicateur') { it.valeur = l.valeur.value === '' ? null : +l.valeur.value; it.reponse = 'na'; }
        else it.reponse = Object.keys(l.radios).filter(function (x) { return l.radios[x].checked; })[0] || '';
        return it;
      });
      var manque = items.filter(function (i) { return !i.reponse; }).length;
      if (manque) throw new Error(manque + ' critère(s) sans réponse : conforme, non conforme ou non concerné.');
      var d = { id: 'AU-' + C.hex(C.aleatoire(8)), service: sv, grille: g.id, libelle: g.libelle, theme: g.theme, date: date.value, reference: ref ? ref.value.trim() : '', items: items, commentaire: com.value.trim(), nom: moi().nom || '' };
      await s().enregistrer('AUDIT', d);
      var t = A.taux(items);
      U.toast('Audit enregistré : ' + libTaux(t.taux) + ' de conformité' + (t.non ? ', ' + t.non + ' écart(s)' : '') + '.');
      if (t.non && U.mesTaches && U.mesTaches.disponible && U.mesTaches.disponible()) setTimeout(function () { proposerTaches(Object.assign({}, d, { par: moi().id })); }, 0);
    } }], { large: true });
  }
  function texteEcarts(a) { return A.ecarts(a).map(function (i) { return '• ' + i.libelle + (i.mode === 'ratio' ? ' (' + A.libelleReponse(i) + ')' : '') + (i.commentaire ? ' : ' + i.commentaire : ''); }).join('\n'); }
  function ajouterTache(a) {
    U.mesTaches.nouvelle({ titre: 'Écarts de l’audit « ' + a.libelle + ' » du ' + dateFr(a.date), note: texteEcarts(a).slice(0, 1000), element: { module: 'audits', genre: 'audit', id: a.id, service: a.service } });
  }
  function proposerTaches(a) {
    U.modale('Écarts de l’audit', h('div', { class: 'pile' }, h('p', { text: 'Ajouter les écarts à votre liste (« Mes tâches ») pour en suivre la correction ?' }), h('pre', { class: 'au-ecarts', text: texteEcarts(a) })),
      [{ texte: 'Non' }, { texte: 'Ajouter à ma liste', classe: 'primaire', action: function () { setTimeout(function () { ajouterTache(a); }, 0); } }]);
  }

  // ------------------------------------------------------------ Import d'un classeur de synthèse (0.88.0)
  /*
   * Classeur tenu par le service (une ligne par mois, une colonne par critère) : lu dans le navigateur, jamais copié sur
   * le partage ; un audit est enregistré par mois rempli, dans une grille existante ou créée d'après les colonnes.
   */
  var LIB_TYPES = { ratio: 'Proportion (pourcentage ou X sur N)', reponse: 'Conforme / non conforme (OK, KO)', indicateur: 'Nombre (indicateur)', commentaire: 'Commentaire de l’audit', ignorer: 'Ignorer' };
  function modaleImport(sv) {
    var zone = h('div', { class: 'pile' }), etat = { classeur: null, feuille: '', synthese: null, fichier: '' };
    var fichier = h('input', { type: 'file', accept: '.xlsx,.xlsm', 'aria-label': 'Classeur à importer' });
    fichier.addEventListener('change', async function () {
      var f = fichier.files && fichier.files[0]; if (!f) return;
      try {
        etat.classeur = await SIC.xlsx.lire(await f.arrayBuffer()); etat.fichier = f.name;
        var noms = Object.keys(etat.classeur.feuilles), lisibles = noms.filter(function (n) { try { A.lireSynthese(etat.classeur.feuilles[n]); return true; } catch (e) { return false; } });
        if (!lisibles.length) throw new Error('Aucune feuille ne contient un tableau mensuel (les mois en première colonne, une ligne par mois).');
        etat.feuille = lisibles.filter(function (n) { return /synth/i.test(n); })[0] || lisibles[0];
        etat.lisibles = lisibles;
        lire(); dessiner();
      } catch (e) { U.vider(zone); zone.appendChild(h('p', { class: 'texte-alerte', text: e.message })); }
    });
    var o = { grille: '', annee: '', nom: 'Audit mensuel', types: {}, corr: {}, jour: 1 };
    function lire() {
      etat.synthese = A.lireSynthese(etat.classeur.feuilles[etat.feuille]);
      var m = /(20\d\d)/.exec(etat.feuille) || /(20\d\d)/.exec(etat.fichier);
      o.annee = m ? m[1] : String(new Date().getFullYear());
      o.types = {}; etat.synthese.colonnes.forEach(function (k) { o.types[k.col] = k.type; });
      var gs = A.grillesActives(cfg(), sv).filter(function (g) { return !g.dossier; });
      var proche = gs.map(function (g) { var c = A.correspondance(etat.synthese, g); return { g: g, n: Object.keys(c).filter(function (k) { return c[k] >= 0; }).length }; }).sort(function (p, q) { return q.n - p.n; })[0];
      o.grille = proche && proche.n >= 2 ? proche.g.id : '';
      o.corr = proche && proche.n >= 2 ? A.correspondance(etat.synthese, proche.g) : {};
    }
    function grilleCible() {
      if (o.grille) return A.grilleDe(cfg(), sv, o.grille);
      return A.grilleDepuisSynthese(etat.synthese, o.types, 'ga-import', o.nom);
    }
    function correspondances(g) {
      if (o.grille) return o.corr;
      var r = {}, i = 0;
      etat.synthese.colonnes.forEach(function (k) { var t = o.types[k.col]; r[k.col] = t === 'ratio' || t === 'reponse' || t === 'indicateur' ? i++ : -1; });
      return r;
    }
    function apercu() {
      var g = grilleCible();
      return A.preparerImport(st(), etat.synthese, { annee: +o.annee, service: sv, grille: g, correspondances: correspondances(g), types: o.types, fichier: etat.fichier, jour: o.jour });
    }
    function dessiner() {
      U.vider(zone);
      var syn = etat.synthese, gs = A.grillesActives(cfg(), sv).filter(function (g) { return !g.dossier; }), g = o.grille ? A.grilleDe(cfg(), sv, o.grille) : null;
      if (etat.lisibles.length > 1) zone.appendChild(h('label', {}, 'Feuille', h('select', { onchange: function (ev) { etat.feuille = ev.target.value; lire(); dessiner(); } }, etat.lisibles.map(function (n) { return h('option', { value: n, text: n, selected: n === etat.feuille }); }))));
      zone.appendChild(h('div', { class: 'grille-3' },
        h('label', {}, 'Année du tableau', h('input', { type: 'number', min: 2000, max: 2100, value: o.annee, class: 'champ-court', onchange: function (ev) { o.annee = ev.target.value; dessiner(); } })),
        h('label', {}, 'Grille', h('select', { onchange: function (ev) { o.grille = ev.target.value; o.corr = o.grille ? A.correspondance(syn, A.grilleDe(cfg(), sv, o.grille)) : {}; dessiner(); } },
          [h('option', { value: '', text: 'Nouvelle grille d’après les colonnes' })].concat(gs.map(function (x) { return h('option', { value: x.id, text: x.libelle, selected: o.grille === x.id }); })))),
        !o.grille ? h('label', {}, 'Nom de la nouvelle grille', h('input', { type: 'text', maxlength: 80, value: o.nom, onchange: function (ev) { o.nom = ev.target.value.trim() || 'Audit mensuel'; } })) : null));
      zone.appendChild(h('p', { class: 'muted', text: 'Lignes « … n-1 » : année précédente. Chaque mois rempli devient un audit daté du 1er du mois ; les cases vides ou en erreur (#DIV/0!…) ne sont pas évaluées.' }));
      zone.appendChild(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Colonne du classeur', 'Exemple', o.grille ? 'Critère de la grille' : 'Lue comme'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, syn.colonnes.map(function (k) {
          var ex = syn.mois.map(function (x) { return x.valeurs[k.col]; }).filter(function (v) { return v !== undefined; }).slice(0, 3).map(function (v) { return typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : String(v).slice(0, 30); }).join(' · ');
          var choix;
          if (o.grille) {
            var val = o.types[k.col] === 'commentaire' ? 'com' : String(o.corr[k.col] >= 0 ? o.corr[k.col] : -1);
            choix = h('select', { 'aria-label': 'Critère pour ' + k.libelle, onchange: function (ev) { if (ev.target.value === 'com') { o.types[k.col] = 'commentaire'; o.corr[k.col] = -1; } else { if (o.types[k.col] === 'commentaire') o.types[k.col] = 'ratio'; o.corr[k.col] = +ev.target.value; } } },
              [h('option', { value: '-1', text: 'Ignorer', selected: val === '-1' }), h('option', { value: 'com', text: 'Commentaire de l’audit', selected: val === 'com' })].concat(g.criteres.map(function (c, i) { return h('option', { value: String(i), text: c.libelle.slice(0, 70) + ' — ' + { reponse: 'conforme ou non', ratio: 'X sur N', indicateur: 'nombre' }[c.mode], selected: val === String(i) }); })));
          } else choix = h('select', { 'aria-label': 'Lecture de ' + k.libelle, onchange: function (ev) { o.types[k.col] = ev.target.value; } }, Object.keys(LIB_TYPES).map(function (t) { return h('option', { value: t, text: LIB_TYPES[t], selected: o.types[k.col] === t }); }));
          return h('tr', {}, h('td', { text: k.libelle || '(sans titre)' }), h('td', { class: 'muted', text: ex || '—' }), h('td', {}, choix));
        })))));
      zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: function () {
        try { var p = apercu(); SIC.ui.alerte('Mois à importer : ' + (p.audits.map(function (a) { return a.mois + ' (' + libTaux(A.taux(a.items).taux) + ')'; }).join(', ') || 'aucun') + (p.ignores.length ? '\nÉcartés : ' + p.ignores.map(function (x) { return x.mois + ' — ' + x.raison; }).join(' ; ') : '')); } catch (e) { SIC.ui.alerte(e.message); }
      } }, 'Vérifier avant d’importer')));
    }
    U.modale('Importer un tableau d’audit', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Classeur Excel tenu par le service : une feuille avec les mois en première colonne (Janvier, Février…) et un critère par colonne (pourcentage, X sur N, OK / KO, nombre). Le fichier est lu sur ce poste et n’est pas copié ; seules les valeurs deviennent des audits, un par mois. Aucun nom de patient.' }),
      h('label', {}, 'Classeur (.xlsx)', fichier), zone),
    [{ texte: 'Annuler' }, { texte: 'Importer', classe: 'primaire', action: async function () {
      if (!etat.synthese) throw new Error('Choisissez un classeur.');
      if (!(+o.annee >= 2000 && +o.annee <= 2100)) throw new Error('Année du tableau invalide.');
      var g = grilleCible(), nouvelle = !o.grille;
      if (!g || !g.criteres.length) throw new Error('Aucune colonne retenue comme critère.');
      var corr = correspondances(g);
      if (nouvelle) { var id; do { id = 'ga-' + C.hex(C.aleatoire(5)); } while (A.grilles(cfg(), sv).some(function (x) { return x.id === id; })); g = A.grille(Object.assign({}, g, { id: id })); }
      var p = A.preparerImport(st(), etat.synthese, { annee: +o.annee, service: sv, grille: g, correspondances: corr, types: o.types, fichier: etat.fichier, jour: o.jour });
      if (!p.audits.length) throw new Error('Aucun mois à importer.' + (p.ignores.length ? ' ' + p.ignores.map(function (x) { return x.mois + ' : ' + x.raison; }).join(' ; ') : ''));
      if (nouvelle) {
        var v = JSON.parse(JSON.stringify(cfg().audits || {})); v[sv] = v[sv] || {};
        v[sv].grilles = (v[sv].grilles || []).concat([g]);
        await U.enregistrerConfig([['audits', v]]);
        o.grille = g.id; o.corr = corr;
      }
      for (var i = 0; i < p.audits.length; i++) {
        var d = Object.assign({ id: 'AU-' + C.hex(C.aleatoire(8)), nom: moi().nom || '' }, p.audits[i]); delete d.mois;
        await s().enregistrer('AUDIT', d);
      }
      filtre.grille = g.id; filtre.annee = String(o.annee); filtre.vue = 'annee';
      U.toast(p.audits.length + ' mois importé(s)' + (p.ignores.length ? ', ' + p.ignores.length + ' écarté(s)' : '') + '.');
      if (p.ignores.length) setTimeout(function () { SIC.ui.alerte('Mois écartés : ' + p.ignores.map(function (x) { return x.mois + ' — ' + x.raison; }).join(' ; ')); }, 0);
    } }], { large: true });
  }

  // ------------------------------------------------------------ Détail d'un audit
  function detail(a) {
    var t = A.taux(a.items), rub = null, lignes = [];
    a.items.forEach(function (i) {
      if (i.rubrique && i.rubrique !== rub) { rub = i.rubrique; lignes.push(h('tr', { class: 'au-rubrique' }, h('th', { colspan: 3, text: i.rubrique }))); }
      var ti = A.tauxItem(i);
      lignes.push(h('tr', { class: ti !== null && ti < 100 ? 'texte-alerte' : '' }, h('td', { text: i.libelle }), h('td', { text: A.libelleReponse(i) }), h('td', { text: i.commentaire || '' })));
    });
    return h('div', { class: 'pile au-detail' },
      h('p', {}, h('b', { text: a.libelle }), ' — ' + U.libService(a.service) + ', ' + (a.origine === 'import' ? A.MOIS[+a.date.slice(5, 7) - 1] + ' ' + a.date.slice(0, 4) + ', importé du classeur « ' + a.fichier + ' » par ' : dateFr(a.date) + (a.reference ? ', ' + a.reference : '') + ', par ') + (a.nom || s().nomAuteur(a.par))),
      a.annule ? h('p', { class: 'texte-alerte', text: 'Annulé le ' + new Date(a.annule.le).toLocaleDateString('fr-FR') + ' : ' + a.annule.motif }) : null,
      h('p', {}, h('b', { text: 'Conformité : ' + libTaux(t.taux) }), ' (' + t.oui + ' critère(s) à 100 %, ' + t.non + ' en dessous, ' + t.na + ' non évalué(s))'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'au-grille' }, h('thead', {}, h('tr', {}, ['Critère', 'Réponse', 'Commentaire'].map(function (x) { return h('th', { text: x }); }))), h('tbody', {}, lignes))),
      a.commentaire ? h('p', {}, h('b', { text: 'Commentaire : ' }), a.commentaire) : null,
      U.mesTaches && U.mesTaches.rappelElement ? U.mesTaches.rappelElement('audits', a.id) : null);
  }
  function ouvrirAudit(a) {
    var noeud = detail(a), bt = [{ texte: 'Fermer' }, { texte: 'Imprimer', action: function () { U.imprimer(detail(a)); return false; } }];
    if (!a.annule && A.ecarts(a).length && U.mesTaches && U.mesTaches.disponible && U.mesTaches.disponible()) bt.push({ texte: 'Écarts dans ma liste', action: function () { setTimeout(function () { ajouterTache(a); }, 0); } });
    if (!a.annule && !s().apercu && (a.par === moi().id || encadre())) bt.push({ texte: 'Annuler l’audit…', classe: 'danger', action: function () { setTimeout(function () { modaleAnnuler(a); }, 0); } });
    U.modale('Audit', noeud, bt, { large: true });
  }
  function modaleAnnuler(a) {
    var motif = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Motif' });
    U.modale('Annuler l’audit', h('div', { class: 'pile' }, h('p', { text: a.libelle + ' du ' + dateFr(a.date) + ' : l’audit reste au registre, barré, et sort des résultats.' }), h('label', {}, 'Motif', motif)),
      [{ texte: 'Fermer' }, { texte: 'Annuler l’audit', classe: 'danger', action: async function () { await s().enregistrer('AUDIT_ANNULE', { audit: a.id, service: a.service, motif: motif.value.trim(), nom: moi().nom || '' }); U.toast('Audit annulé.'); } }]);
  }

  // ------------------------------------------------------------ Onglet « Audits »
  function ligneAudit(a) {
    var t = A.taux(a.items);
    return h('tr', { class: a.annule ? 'ligne-annulee' : '' },
      h('td', { text: a.origine === 'import' ? A.MOIS[+a.date.slice(5, 7) - 1] + ' ' + a.date.slice(0, 4) : dateFr(a.date) }), h('td', { text: U.libService(a.service) }), h('td', {}, a.libelle, a.reference ? h('small', { class: 'muted bloc', text: a.reference }) : null, a.origine === 'import' ? h('small', { class: 'muted bloc', text: 'Importé (' + a.fichier + ')' }) : null),
      h('td', { text: a.nom || s().nomAuteur(a.par) }), h('td', {}, h('div', { class: 'en-ligne' }, barre(a.annule ? null : t.taux), h('span', { class: classeTaux(t.taux), text: a.annule ? 'annulé' : libTaux(t.taux) }))),
      h('td', { class: t.non && !a.annule ? 'texte-alerte' : '', text: a.annule ? '' : t.non ? t.non + ' écart(s)' : 'aucun écart' }),
      h('td', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { ouvrirAudit(a); } }, 'Voir')));
  }
  function tableAudits(ls) {
    return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Date', 'Service', 'Audit', 'Auditeur', 'Conformité', 'Écarts', ''].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', {}, ls.map(ligneAudit))));
  }
  function vueAudits() {
    var blocs = services().map(function (sv) {
      var gs = A.grillesActives(cfg(), sv), peutA = auditeur(sv), bloquees = A.grilles(cfg(), sv).filter(function (g) { return g.actif && g.dossier && !A.dossierAutorise(cfg()); });
      var faits = A.liste(st(), { services: [sv] });
      return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: U.libService(sv) }), h('div', { class: 'espace' }),
          peutA && encadre() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleImport(sv); } }, 'Importer un tableau d’audit…') : null),
        !gs.length ? h('p', { class: 'muted', text: 'Aucune grille d’audit pour ce service' + (encadre() ? ' (Administration → Audits internes).' : ' : le cadre les règle.') }) : null,
        gs.length ? h('div', { class: 'controles-grille' }, gs.map(function (g) {
          var der = faits.filter(function (a) { return a.grille === g.id; })[0], t = der ? A.taux(der.items).taux : null;
          return h('div', { class: 'controle-carte' },
            h('div', { class: 'barre' }, h('b', { text: g.libelle }), h('div', { class: 'espace' }), g.theme ? h('span', { class: 'badge', text: g.theme }) : null),
            h('small', { class: 'muted', text: g.criteres.length + ' critère(s)' + (g.niveau === 'etablissement' ? ' · grille de l’établissement' : '') }),
            h('small', { class: 'muted', text: der ? 'Dernier audit : ' + dateFr(der.date) + ' — ' + libTaux(t) : 'Aucun audit fait' }),
            peutA ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn primaire petit', type: 'button', onclick: function () { modaleAudit(g, sv); } }, 'Réaliser un audit')) : null);
        })) : null,
        !peutA && gs.length && !s().apercu ? h('p', { class: 'muted', text: 'Les audits sont réalisés par le cadre et les agents qu’il désigne comme auditeurs.' }) : null,
        encadre() && bloquees.length ? h('p', { class: 'muted', text: 'Grille « ' + bloquees.map(function (g) { return g.libelle; }).join(', ') + ' » masquée : l’audit de la tenue du dossier est une fonction soumise à avis, désactivée (Administration → Validations).' }) : null,
        faits.length ? h('div', { class: 'pile controles-bloc' }, h('h3', { text: 'Derniers audits' }), tableAudits(faits.slice(0, 10))) : null);
    });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Audits internes' })),
      h('p', { class: 'muted', text: 'Une grille remplie une fois par audit : chaque critère conforme, non conforme ou non concerné. Taux de conformité par audit, par période et par critère (onglet « Résultats ») ; les écarts peuvent être ajoutés à « Mes tâches ». Aucun nom de patient.' }),
      blocs);
  }

  // ------------------------------------------------------------ Onglet « Résultats »
  function choixGrille(svs) {
    var vus = {}, l = [];
    svs.forEach(function (sv) { A.grilles(cfg(), sv).forEach(function (g) { if (!vus[g.id]) { vus[g.id] = 1; l.push(g); } }); });
    A.liste(st(), { services: svs }).forEach(function (a) { if (!vus[a.grille]) { vus[a.grille] = 1; l.push({ id: a.grille, libelle: a.libelle + ' (grille retirée)' }); } });
    return l;
  }
  function filtres(svs, avecPar) {
    function champ(cle, libelle) { return h('label', {}, libelle, h('input', { type: 'date', value: filtre[cle], onchange: function (ev) { filtre[cle] = ev.target.value; U.rendreContenu(); } })); }
    var gs = choixGrille(svs), cle = avecPar ? 'grille' : 'grilleR';
    return h('div', { class: 'filtres' },
      svs.length > 1 ? h('label', {}, 'Service', h('select', { onchange: function (ev) { filtre.service = ev.target.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous' })].concat(svs.map(function (sv) { return h('option', { value: sv, text: U.libService(sv), selected: filtre.service === sv }); })))) : null,
      h('label', {}, 'Grille', h('select', { onchange: function (ev) { filtre[cle] = ev.target.value; U.rendreContenu(); } }, (avecPar ? [] : [h('option', { value: '', text: 'Toutes' })]).concat(gs.map(function (g) { return h('option', { value: g.id, text: g.libelle, selected: filtre[cle] === g.id }); })))),
      champ('du', 'Du'), champ('au', 'Au'),
      avecPar ? h('label', {}, 'Par', h('select', { onchange: function (ev) { filtre.par = ev.target.value; U.rendreContenu(); } }, [['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: filtre.par === x[0] }); }))) : null);
  }
  function svsFiltres() { var svs = services(); return filtre.service && svs.indexOf(filtre.service) >= 0 ? [filtre.service] : svs; }
  function blocResultats(r, titre) {
    return h('div', { class: 'pile au-resultats' },
      h('h2', { text: titre }),
      h('p', {}, h('b', { text: 'Conformité globale : ' + libTaux(r.global.taux) }), ' — ' + r.audits + ' audit(s) ; moyenne des critères évalués (' + r.global.oui + ' à 100 %, ' + r.global.non + ' en dessous, ' + r.global.na + ' non évalué(s)).'),
      h('h3', { text: 'Par période' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Période', 'Audits', 'Conformité', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, r.periodes.map(function (p) { return h('tr', {}, h('td', { text: p.libelle }), h('td', { text: String(p.audits) }), h('td', { class: classeTaux(p.taux), text: libTaux(p.taux) }), h('td', {}, barre(p.taux))); })))),
      h('h3', { text: 'Par critère (du moins conforme au plus conforme)' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Rubrique', 'Critère', 'À 100 %', 'En dessous', 'Non évalués', 'Conformité', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, r.criteres.map(function (c) { return h('tr', {}, h('td', { text: c.rubrique || '' }), h('td', {}, c.libelle, c.evalues ? h('small', { class: 'muted bloc', text: c.conformes + ' conforme(s) sur ' + c.evalues + ' vérifié(s)' }) : null), h('td', { text: String(c.oui) }), h('td', { class: c.non ? 'texte-alerte' : '', text: String(c.non) }), h('td', { text: String(c.na) }), h('td', { class: classeTaux(c.taux), text: libTaux(c.taux) }), h('td', {}, barre(c.taux))); })))),
      r.indicateurs.length ? h('h3', { text: 'Indicateurs chiffrés (total par période)' }) : null,
      r.indicateurs.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Indicateur'].concat(r.periodes.map(function (p) { return p.court || p.libelle; })).map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, r.indicateurs.map(function (c) { return h('tr', {}, [h('td', { text: c.libelle })].concat(r.periodes.map(function (p) { var v = c.parPeriode[p.code]; return h('td', { text: v === undefined ? '—' : String(v).replace('.', ',') }); }))); })))) : null);
  }
  // ------------------------------------------------------------ Évolution sur l'année (0.88.0) : graphiques, impression, PDF
  var COULEUR_SEUIL = { bon: '#2e7d32', moyen: '#b26a00', faible: '#c62828' };
  function figure(d, opts, legende) {
    var g = Object.assign({ type: 'barres', largeur: 360, hauteur: 190, etiquettes: true }, opts);
    var dessin = SIC.tableur.dessinGraphique(d, g);
    if (opts.couleurs) { var k = 0; dessin.elements.forEach(function (x) { if (x.e === 'rect') x.couleur = opts.couleurs[k++] || x.couleur; }); }
    return h('figure', { class: 'tb-graphique au-figure' }, U.tableur.svgGraphique(dessin, g.titre), legende ? h('figcaption', { class: 'muted', text: legende }) : null);
  }
  function couleurTaux(v) { return v >= 90 ? COULEUR_SEUIL.bon : v >= 70 ? COULEUR_SEUIL.moyen : COULEUR_SEUIL.faible; }
  function graphiquesAnnee(r, annee) {
    var cats = r.periodes.map(function (p) { return p.court; });
    function serieTaux(vals) { return { categories: cats, series: [{ nom: 'Conformité (%)', valeurs: vals }] }; }
    var figs = [];
    var glob = r.periodes.map(function (p) { return p.taux; });
    figs.push(figure(serieTaux(glob), { titre: 'Conformité globale ' + annee + ' (%)', largeur: 740, hauteur: 230, yMax: 100, couleurs: glob.filter(function (v) { return v !== null; }).map(couleurTaux) }, 'Moyenne des critères évalués chaque mois ; mois sans audit laissés vides.'));
    r.criteres.slice().sort(function (p, q) { return p.libelle.localeCompare(q.libelle); }).forEach(function (c) {
      var vals = r.periodes.map(function (p) { var v = c.parPeriode[p.code]; return v === undefined ? null : v; });
      figs.push(figure(serieTaux(vals), { titre: c.libelle.slice(0, 52) + (c.libelle.length > 52 ? '…' : ''), yMax: 100, couleurs: vals.filter(function (v) { return v !== null; }).map(couleurTaux) }, c.libelle + ' — ' + libTaux(c.taux) + ' sur l’année'));
    });
    r.indicateurs.forEach(function (c) {
      var vals = r.periodes.map(function (p) { var v = c.parPeriode[p.code]; return v === undefined ? null : v; });
      figs.push(figure({ categories: cats, series: [{ nom: c.libelle, valeurs: vals }] }, { titre: c.libelle.slice(0, 52) + ' (nombre)' }, c.libelle + ' — indicateur chiffré, hors du taux de conformité'));
    });
    return figs;
  }
  function blocAnnee(r, annee, titre) {
    return h('div', { class: 'pile au-annee' }, h('h2', { text: titre }),
      h('p', { class: 'muted', text: 'Barres vertes : 90 % et plus ; orange : de 70 à 89 % ; rouges : moins de 70 %.' }),
      h('div', { class: 'au-figures' }, graphiquesAnnee(r, annee)));
  }
  function pdfAnnee(r, annee, titre, sv) {
    var P = U.pdfEtab.creer(sv || null, titre, { sousTitre: 'Évolution des audits sur l’année ' + annee });
    var bloc = blocAnnee(r, annee, titre), porteur = h('div', { class: 'hors-ecran', 'aria-hidden': 'true' }, bloc);
    document.body.appendChild(porteur);
    try { Array.prototype.forEach.call(bloc.querySelectorAll('figure'), function (f, i) { U.graphiquePdf.ajouterAuPdf(P.doc, f, { hauteurMax: i ? 200 : 260 }); }); }
    finally { porteur.remove(); }
    var nom = ('audits_' + annee + '_' + titre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
    return U.exporter('graphiques', nom + '.pdf', P.finir({ signature: false }), 'application/pdf', { service: sv || null });
  }
  function vueResultats() {
    var svs = svsFiltres(), gs = choixGrille(services());
    if (!filtre.grille && gs.length) filtre.grille = gs[0].id;
    var g = gs.filter(function (x) { return x.id === filtre.grille; })[0];
    var annees = {}; A.liste(st(), { services: svs, grille: filtre.grille }).forEach(function (a) { annees[a.date.slice(0, 4)] = 1; });
    var la = Object.keys(annees).sort().reverse();
    if (!filtre.annee || la.indexOf(filtre.annee) < 0) filtre.annee = la[0] || String(new Date().getFullYear());
    var nomSv = svs.length === 1 ? U.libService(svs[0]) : 'tous les services';
    if (filtre.vue !== 'tableaux') {
      var ra = A.resultats(st(), { services: svs, grille: filtre.grille, annee: filtre.annee }), titreA = (g ? g.libelle : 'Audits') + ' — ' + nomSv + ' — ' + filtre.annee;
      return h('div', {},
        h('div', { class: 'barre' }, h('h1', { text: 'Résultats des audits' }), h('div', { class: 'espace' }),
          ra.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { U.imprimer(h('div', {}, blocAnnee(ra, filtre.annee, titreA), blocResultats(ra, 'Détail ' + filtre.annee))); } }, 'Imprimer') : null,
          ra.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { pdfAnnee(ra, filtre.annee, titreA, svs.length === 1 ? svs[0] : null); } }, 'Exporter en PDF') : null),
        choixVue(),
        h('div', { class: 'filtres' },
          services().length > 1 ? h('label', {}, 'Service', h('select', { onchange: function (ev) { filtre.service = ev.target.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous' })].concat(services().map(function (sv) { return h('option', { value: sv, text: U.libService(sv), selected: filtre.service === sv }); })))) : null,
          h('label', {}, 'Grille', h('select', { onchange: function (ev) { filtre.grille = ev.target.value; U.rendreContenu(); } }, gs.map(function (x) { return h('option', { value: x.id, text: x.libelle, selected: filtre.grille === x.id }); }))),
          h('label', {}, 'Année', h('select', { onchange: function (ev) { filtre.annee = ev.target.value; U.rendreContenu(); } }, (la.length ? la : [filtre.annee]).map(function (x) { return h('option', { value: x, text: x, selected: filtre.annee === x }); })))),
        !gs.length ? h('p', { class: 'muted', text: 'Aucune grille d’audit.' }) : ra.audits ? h('div', { class: 'pile' }, blocAnnee(ra, filtre.annee, titreA), blocResultats(ra, 'Détail de l’année ' + filtre.annee)) : h('p', { class: 'muted', text: 'Aucun audit pour cette grille et cette année.' }));
    }
    var r = A.resultats(st(), { services: svs, grille: filtre.grille, du: filtre.du, au: filtre.au, par: filtre.par });
    var titre = (g ? g.libelle : 'Audits') + ' — ' + nomSv + (filtre.du || filtre.au ? ' (' + (filtre.du ? 'du ' + dateFr(filtre.du) : '') + (filtre.au ? ' au ' + dateFr(filtre.au) : '') + ')' : '');
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Résultats des audits' }), h('div', { class: 'espace' }),
        r.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { U.imprimer(blocResultats(r, titre)); } }, 'Imprimer') : null,
        encadre() && r.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { exporter(A.liste(st(), { services: svs, grille: filtre.grille, du: filtre.du, au: filtre.au })); } }, 'Exporter (CSV)') : null),
      choixVue(),
      filtres(services(), true),
      !gs.length ? h('p', { class: 'muted', text: 'Aucune grille d’audit.' }) : r.audits ? blocResultats(r, titre) : h('p', { class: 'muted', text: 'Aucun audit pour ces critères.' }));
  }
  function choixVue() {
    return h('div', { class: 'en-ligne', role: 'group', 'aria-label': 'Affichage' }, [['annee', 'Évolution sur l’année (graphiques)'], ['tableaux', 'Tableaux par période']].map(function (x) {
      var actif = (filtre.vue || 'annee') === x[0];
      return h('button', { class: 'btn petit' + (actif ? ' primaire' : ''), type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { filtre.vue = x[0]; U.rendreContenu(); } }, x[1]);
    }));
  }
  function exporter(ls) {
    var csv = '﻿' + A.lignesExport(ls, U.libService).map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('registres', 'audits_' + jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }

  // ------------------------------------------------------------ Onglet « Registre »
  function vueRegistre() {
    var svs = svsFiltres(), ls = A.liste(st(), { services: svs, grille: filtre.grilleR, du: filtre.du, au: filtre.au, annules: true });
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Registre des audits' }), h('div', { class: 'espace' }),
        encadre() && ls.length ? h('button', { class: 'btn', type: 'button', onclick: function () { exporter(ls); } }, 'Exporter (CSV)') : null),
      filtres(services(), false),
      h('p', { class: 'muted', text: ls.length + ' audit(s).' }),
      ls.length ? tableAudits(ls.slice(0, 500)) : h('p', { class: 'muted', text: 'Aucun audit.' }));
  }

  // ------------------------------------------------------------ Réglages : grilles et auditeurs
  function panneauReglages() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement (grilles communes à tous les services)' }] : []).concat(U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: 'Service ' + x.libelle }; }));
    if (!niveaux.length) return null;
    var niv = niveaux[0].code, liste = [], aud = [], zone = h('div', { class: 'pile' });
    function charger() {
      var p = ((cfg().audits || {})[niv]) || {};
      liste = (Array.isArray(p.grilles) ? p.grilles : []).map(A.grille).filter(Boolean);
      aud = Array.isArray(p.auditeurs) ? p.auditeurs.slice() : [];
    }
    function nouvelId() { var id, tous = A.grilles(cfg(), niv === '*' ? null : niv).concat(liste); do { id = 'ga-' + C.hex(C.aleatoire(5)); } while (tous.some(function (g) { return g.id === id; })); return id; }
    function dessiner() {
      U.vider(zone);
      if (niv !== '*') {
        var communes = A.grilles(cfg(), niv).filter(function (g) { return g.niveau === 'etablissement'; });
        if (communes.length) zone.appendChild(h('p', { class: 'muted', text: 'Grilles de l’établissement, utilisées aussi dans ce service : ' + communes.map(function (g) { return g.libelle + (g.actif ? '' : ' (inactive)'); }).join(', ') + '.' }));
      }
      zone.appendChild(liste.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Grille', 'Critères', 'Active', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, liste.map(function (g, i) {
          return h('tr', { class: g.actif ? '' : 'ligne-annulee' },
            h('td', {}, h('b', { text: g.libelle }), h('small', { class: 'muted bloc', text: (g.theme || '') + (g.dossier ? (g.theme ? ' · ' : '') + 'dossier du patient : fonction soumise à avis' + (A.dossierAutorise(cfg()) ? '' : ' (désactivée)') : '') })),
            h('td', { text: String(g.criteres.length) }),
            h('td', {}, h('input', { type: 'checkbox', checked: g.actif, 'aria-label': 'Active : ' + g.libelle, onchange: function (ev) { g.actif = ev.target.checked; } })),
            h('td', {}, h('div', { class: 'en-ligne' },
              h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleGrille(g, function (n) { liste[i] = n; dessiner(); }); } }, 'Modifier'),
              h('button', { class: 'btn petit danger', type: 'button', onclick: async function () {
                if (!(await SIC.ui.confirmer('Retirer la grille « ' + g.libelle + ' » ? Les audits déjà faits restent au registre et dans les résultats. Pour une pause, décochez plutôt « Active ».'))) return;
                liste.splice(i, 1); dessiner();
              } }, 'Retirer'))));
        })))) : h('p', { class: 'muted', text: 'Aucune grille propre à ce niveau.' }));
      var choix = h('select', { 'aria-label': 'Modèle' }, Object.keys(A.MODELES).map(function (k) { return h('option', { value: k, text: A.MODELES[k].libelle + (A.MODELES[k].dossier ? ' (soumise à avis)' : '') }); }).concat([h('option', { value: 'libre', text: 'Grille vide (à composer)' })]));
      zone.appendChild(h('div', { class: 'en-ligne' }, h('label', { class: 'en-ligne' }, h('span', { class: 'sans-coupure', text: 'Ajouter :' }), choix),
        h('button', { class: 'btn', type: 'button', onclick: function () {
          if (liste.length >= 60) return SIC.ui.alerte('60 grilles au plus.');
          modaleGrille(A.depuisModele(choix.value, nouvelId()), function (n) { liste.push(n); dessiner(); });
        } }, 'Ajouter…')));
      if (niv !== '*') {
        var agents = (s().comptes || []).filter(function (x) { return x.actif !== false && x.id !== 'secours' && (x.services || []).indexOf(niv) >= 0 && !(x.roles || []).some(function (r) { return ['ADMIN', 'CADRE', 'CADRE_SUP'].indexOf(r) >= 0; }); })
          .sort(function (p, q) { return String(p.nom || '').localeCompare(String(q.nom || '')); });
        zone.appendChild(h('h3', { text: 'Auditeurs désignés' }));
        zone.appendChild(h('p', { class: 'muted', text: 'Le cadre réalise les audits de son service ; il désigne ici les agents qui en réalisent aussi (référents qualité, hygiène, médicament…).' }));
        zone.appendChild(agents.length ? h('div', { class: 'grille-3' }, agents.map(function (x) {
          return h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: aud.indexOf(x.id) >= 0, onchange: function (ev) { aud = aud.filter(function (y) { return y !== x.id; }); if (ev.target.checked) aud.push(x.id); } }), h('span', { text: x.nom || x.login }));
        })) : h('p', { class: 'muted', text: 'Aucun agent affecté à ce service.' }));
      }
    }
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { niv = sel.value; charger(); dessiner(); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    charger(); dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Grilles d’audit et auditeurs' }),
      h('p', { class: 'muted', text: 'Grilles proposées : circuit du médicament, tenue du dossier du patient (fonction soumise à avis, désactivée tant que l’établissement ne l’active pas dans l’onglet « Validations »), isolement et contention. À adapter à la procédure de l’établissement. Les grilles de l’établissement s’ajoutent à celles de chaque service.' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () {
        var v = JSON.parse(JSON.stringify(cfg().audits || {}));
        v[niv] = v[niv] || {};
        if (liste.length) v[niv].grilles = liste.map(function (g) { var x = Object.assign({}, g); delete x.niveau; return x; }); else delete v[niv].grilles;
        if (niv !== '*' && aud.length) v[niv].auditeurs = aud; else delete v[niv].auditeurs;
        if (!Object.keys(v[niv]).length) delete v[niv];
        await U.enregistrerConfig([['audits', v]]);
      }));
  }
  function modaleGrille(g0, fini) {
    var g = JSON.parse(JSON.stringify(g0)), cr = g.criteres.map(function (k) { return Object.assign({}, k); }), zoneC = h('div', { class: 'pile' });
    var lib = h('input', { type: 'text', maxlength: 80, value: g.libelle, 'aria-label': 'Nom de la grille' }), theme = h('input', { type: 'text', maxlength: 60, value: g.theme || '', 'aria-label': 'Thème' });
    var ref = h('input', { type: 'text', maxlength: 60, value: g.reference || '', 'aria-label': 'Référence demandée', placeholder: 'ex. numéro de la mesure au registre ; vide : aucune' });
    function dessinerC() {
      U.vider(zoneC);
      zoneC.appendChild(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Rubrique', 'Critère', 'Réponse attendue', 'Aide (facultatif)', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, cr.map(function (k, i) {
          function maj(cle) { return function (ev) { k[cle] = ev.target.value; }; }
          return h('tr', {},
            h('td', {}, h('input', { type: 'text', maxlength: 60, value: k.rubrique || '', class: 'champ-moyen', 'aria-label': 'Rubrique', oninput: maj('rubrique') })),
            h('td', {}, h('input', { type: 'text', maxlength: 160, value: k.libelle, 'aria-label': 'Critère', oninput: maj('libelle') })),
            h('td', {}, h('select', { 'aria-label': 'Réponse attendue', onchange: maj('mode') }, Object.keys(A.MODES).map(function (m) { return h('option', { value: m, text: { reponse: 'Conforme ou non', ratio: 'X sur N', indicateur: 'Nombre (indicateur)' }[m], title: A.MODES[m], selected: (k.mode || 'reponse') === m }); }))),
            h('td', {}, h('input', { type: 'text', maxlength: 200, value: k.aide || '', 'aria-label': 'Aide', oninput: maj('aide') })),
            h('td', {}, h('div', { class: 'en-ligne' },
              h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { cr.splice(i - 1, 0, cr.splice(i, 1)[0]); dessinerC(); } }, '↑'),
              h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le critère', onclick: function () { cr.splice(i, 1); dessinerC(); } }, '✕'))));
        })))));
      zoneC.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (cr.length < 80) { var last = cr[cr.length - 1]; cr.push({ libelle: '', rubrique: last ? last.rubrique : '', aide: '', mode: last ? last.mode : 'reponse' }); dessinerC(); } } }, 'Ajouter un critère')));
    }
    dessinerC();
    U.modale(g.libelle || 'Grille d’audit', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Nom de la grille', lib), h('label', {}, 'Thème (facultatif)', theme), h('label', {}, 'Référence demandée à chaque audit (facultatif)', ref)),
      g.dossier ? h('p', { class: 'muted', text: 'Grille portant sur le dossier d’un patient : fonction soumise à avis (« Validations »). La référence ne doit jamais être le nom du patient.' }) : null,
      h('h3', { text: 'Critères (80 au plus)' }), zoneC),
      [{ texte: 'Annuler' }, { texte: 'Valider', classe: 'primaire', action: function () {
        if (!lib.value.trim()) throw new Error('Donnez un nom à la grille.');
        var ks = cr.filter(function (k) { return String(k.libelle || '').trim(); });
        if (!ks.length) throw new Error('Ajoutez au moins un critère.');
        if (g.dossier && !ref.value.trim()) throw new Error('Une grille sur le dossier du patient demande une référence (numéro de séjour).');
        fini(A.grille({ id: g.id, modele: g.modele, actif: g.actif, dossier: g.dossier, libelle: lib.value.trim(), theme: theme.value.trim(), reference: ref.value.trim(), criteres: ks }));
        U.toast('Pensez à enregistrer les réglages.');
      } }], { large: true });
  }

  // ------------------------------------------------------------ Informations (Aujourd'hui) et pastille
  function informations() {
    var res = [];
    try {
      if (!encadre()) return res;
      var depuis = jourISO(Date.now() - 7 * 864e5);
      services().forEach(function (sv) {
        var ls = A.liste(st(), { services: [sv], du: depuis }).filter(function (a) { return A.ecarts(a).length; });
        if (ls.length) res.push({ id: 'au-e-' + ls.map(function (a) { return a.id; }).join(','), niveau: 'warn', titre: 'Audits avec des écarts (' + U.libService(sv) + ') : ' + ls.length,
          detail: ls.slice(0, 4).map(function (a) { var t = A.taux(a.items); return a.libelle + ' du ' + dateFr(a.date) + ' : ' + libTaux(t.taux) + ', ' + t.non + ' écart(s)'; }).join(' ; '),
          ouvrir: function () { U.App.ongletsFenetres.audits = 'audits'; U.ouvrirFenetre('audits'); } });
      });
    } catch (e) { /* module illisible : rien à afficher */ }
    return res;
  }

  var LIB = { AUDIT: 'Audit', AUDIT_ANNULE: 'Audit annulé' };
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'AUDIT') { var t = A.taux(d.items); return (d.libelle || 'Audit') + ' du ' + dateFr(d.date) + (d.reference ? ' (' + d.reference + ')' : '') + ' — ' + libTaux(t.taux) + (t.non ? ', ' + t.non + ' écart(s)' : ''); }
    var a = st().audits[d.audit];
    return (a ? a.libelle + ' du ' + dateFr(a.date) : d.audit) + (d.motif ? ' — ' + d.motif : '');
  }
  SIC.modules.completerInterface('audits', {
    vues: { audits: vueAudits, resultats: vueResultats, registre: vueRegistre },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’audit sort des résultats.'; } },
    admin: { onglets: function () { return [['audits', 'Audits internes', [panneauReglages()].filter(Boolean)]]; }, cadre: function () { return [panneauReglages()].filter(Boolean); } },
    informations: informations,
    pastille: function () { try { return informations().length; } catch (e) { return 0; } }
  });
  U.audits = { informations: informations, ouvrirAudit: ouvrirAudit };
})();
