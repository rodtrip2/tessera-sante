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
      var nom = 'au-' + i, l = { k: k, radios: {} };
      var choix = h('div', { class: 'en-ligne au-choix' }, Object.keys(A.REPONSES).map(function (r) {
        l.radios[r] = h('input', { type: 'radio', name: nom, value: r });
        return h('label', { class: 'case' }, l.radios[r], h('span', { text: A.REPONSES[r] }));
      }));
      l.com = h('input', { type: 'text', maxlength: 300, class: 'au-com', 'aria-label': 'Commentaire : ' + k.libelle, placeholder: 'Commentaire (facultatif)' });
      corps.push(h('tr', {}, h('td', {}, h('span', { text: k.libelle }), k.aide ? h('small', { class: 'muted bloc', text: k.aide }) : null), h('td', {}, choix, l.com)));
      lignes.push(l);
    });
    var tout = h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.forEach(function (l) { if (!l.radios.non.checked && !l.radios.na.checked) l.radios.oui.checked = true; }); } }, 'Autres critères : conformes');
    U.modale(g.libelle, h('div', { class: 'pile' },
      h('p', { class: 'muted', text: U.libService(sv) + (g.theme ? ' · ' + g.theme : '') + ' · ' + g.criteres.length + ' critère(s). Taux de conformité : conformes / (conformes + non conformes).' }),
      g.modele !== 'libre' ? h('small', { class: 'muted', text: 'Grille proposée par Tessera, à adapter à la procédure de l’établissement (Administration → Audits internes).' }) : null,
      h('div', { class: 'grille-2' }, h('label', {}, 'Date de l’audit', date), ref ? h('label', {}, g.reference, ref) : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'au-grille' }, h('tbody', {}, corps))),
      h('div', { class: 'actions gauche' }, tout),
      h('label', {}, 'Commentaire de l’audit (facultatif)', com)),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer l’audit', classe: 'primaire', action: async function () {
      var items = lignes.map(function (l) { var r = Object.keys(l.radios).filter(function (x) { return l.radios[x].checked; })[0] || ''; return { libelle: l.k.libelle, rubrique: l.k.rubrique, reponse: r, commentaire: l.com.value.trim() }; });
      var manque = items.filter(function (i) { return !i.reponse; }).length;
      if (manque) throw new Error(manque + ' critère(s) sans réponse : conforme, non conforme ou non concerné.');
      var d = { id: 'AU-' + C.hex(C.aleatoire(8)), service: sv, grille: g.id, libelle: g.libelle, theme: g.theme, date: date.value, reference: ref ? ref.value.trim() : '', items: items, commentaire: com.value.trim(), nom: moi().nom || '' };
      await s().enregistrer('AUDIT', d);
      var t = A.taux(items);
      U.toast('Audit enregistré : ' + libTaux(t.taux) + ' de conformité' + (t.non ? ', ' + t.non + ' écart(s)' : '') + '.');
      if (t.non && U.mesTaches && U.mesTaches.disponible && U.mesTaches.disponible()) setTimeout(function () { proposerTaches(Object.assign({}, d, { par: moi().id })); }, 0);
    } }], { large: true });
  }
  function texteEcarts(a) { return A.ecarts(a).map(function (i) { return '• ' + i.libelle + (i.commentaire ? ' : ' + i.commentaire : ''); }).join('\n'); }
  function ajouterTache(a) {
    U.mesTaches.nouvelle({ titre: 'Écarts de l’audit « ' + a.libelle + ' » du ' + dateFr(a.date), note: texteEcarts(a).slice(0, 1000), element: { module: 'audits', genre: 'audit', id: a.id, service: a.service } });
  }
  function proposerTaches(a) {
    U.modale('Écarts de l’audit', h('div', { class: 'pile' }, h('p', { text: 'Ajouter les écarts à votre liste (« Mes tâches ») pour en suivre la correction ?' }), h('pre', { class: 'au-ecarts', text: texteEcarts(a) })),
      [{ texte: 'Non' }, { texte: 'Ajouter à ma liste', classe: 'primaire', action: function () { setTimeout(function () { ajouterTache(a); }, 0); } }]);
  }

  // ------------------------------------------------------------ Détail d'un audit
  function detail(a) {
    var t = A.taux(a.items), rub = null, lignes = [];
    a.items.forEach(function (i) {
      if (i.rubrique && i.rubrique !== rub) { rub = i.rubrique; lignes.push(h('tr', { class: 'au-rubrique' }, h('th', { colspan: 3, text: i.rubrique }))); }
      lignes.push(h('tr', { class: i.reponse === 'non' ? 'texte-alerte' : '' }, h('td', { text: i.libelle }), h('td', { text: A.REPONSES[i.reponse] }), h('td', { text: i.commentaire || '' })));
    });
    return h('div', { class: 'pile au-detail' },
      h('p', {}, h('b', { text: a.libelle }), ' — ' + U.libService(a.service) + ', ' + dateFr(a.date) + (a.reference ? ', ' + a.reference : '') + ', par ' + (a.nom || s().nomAuteur(a.par))),
      a.annule ? h('p', { class: 'texte-alerte', text: 'Annulé le ' + new Date(a.annule.le).toLocaleDateString('fr-FR') + ' : ' + a.annule.motif }) : null,
      h('p', {}, h('b', { text: 'Conformité : ' + libTaux(t.taux) }), ' (' + t.oui + ' conforme(s), ' + t.non + ' non conforme(s), ' + t.na + ' non concerné(s))'),
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
      h('td', { text: dateFr(a.date) }), h('td', { text: U.libService(a.service) }), h('td', {}, a.libelle, a.reference ? h('small', { class: 'muted bloc', text: a.reference }) : null),
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
      return h('section', { class: 'panneau' }, h('h2', { text: U.libService(sv) }),
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
      h('p', {}, h('b', { text: 'Conformité globale : ' + libTaux(r.global.taux) }), ' — ' + r.audits + ' audit(s), ' + r.global.oui + ' réponse(s) conforme(s), ' + r.global.non + ' non conforme(s), ' + r.global.na + ' non concernée(s).'),
      h('h3', { text: 'Par période' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Période', 'Audits', 'Conformité', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, r.periodes.map(function (p) { return h('tr', {}, h('td', { text: p.libelle }), h('td', { text: String(p.audits) }), h('td', { class: classeTaux(p.taux), text: libTaux(p.taux) }), h('td', {}, barre(p.taux))); })))),
      h('h3', { text: 'Par critère (du moins conforme au plus conforme)' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Rubrique', 'Critère', 'Conformes', 'Non conformes', 'Non concernés', 'Conformité', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, r.criteres.map(function (c) { return h('tr', {}, h('td', { text: c.rubrique || '' }), h('td', { text: c.libelle }), h('td', { text: String(c.oui) }), h('td', { class: c.non ? 'texte-alerte' : '', text: String(c.non) }), h('td', { text: String(c.na) }), h('td', { class: classeTaux(c.taux), text: libTaux(c.taux) }), h('td', {}, barre(c.taux))); })))));
  }
  function vueResultats() {
    var svs = svsFiltres(), gs = choixGrille(services());
    if (!filtre.grille && gs.length) filtre.grille = gs[0].id;
    var g = gs.filter(function (x) { return x.id === filtre.grille; })[0];
    var r = A.resultats(st(), { services: svs, grille: filtre.grille, du: filtre.du, au: filtre.au, par: filtre.par });
    var titre = (g ? g.libelle : 'Audits') + ' — ' + (svs.length === 1 ? U.libService(svs[0]) : 'tous les services') + (filtre.du || filtre.au ? ' (' + (filtre.du ? 'du ' + dateFr(filtre.du) : '') + (filtre.au ? ' au ' + dateFr(filtre.au) : '') + ')' : '');
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Résultats des audits' }), h('div', { class: 'espace' }),
        r.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { U.imprimer(blocResultats(r, titre)); } }, 'Imprimer') : null,
        encadre() && r.audits ? h('button', { class: 'btn', type: 'button', onclick: function () { exporter(A.liste(st(), { services: svs, grille: filtre.grille, du: filtre.du, au: filtre.au })); } }, 'Exporter (CSV)') : null),
      filtres(services(), true),
      !gs.length ? h('p', { class: 'muted', text: 'Aucune grille d’audit.' }) : r.audits ? blocResultats(r, titre) : h('p', { class: 'muted', text: 'Aucun audit pour ces critères.' }));
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
        h('thead', {}, h('tr', {}, ['Rubrique', 'Critère', 'Aide (facultatif)', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, cr.map(function (k, i) {
          function maj(cle) { return function (ev) { k[cle] = ev.target.value; }; }
          return h('tr', {},
            h('td', {}, h('input', { type: 'text', maxlength: 60, value: k.rubrique || '', class: 'champ-moyen', 'aria-label': 'Rubrique', oninput: maj('rubrique') })),
            h('td', {}, h('input', { type: 'text', maxlength: 160, value: k.libelle, 'aria-label': 'Critère', oninput: maj('libelle') })),
            h('td', {}, h('input', { type: 'text', maxlength: 200, value: k.aide || '', 'aria-label': 'Aide', oninput: maj('aide') })),
            h('td', {}, h('div', { class: 'en-ligne' },
              h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { cr.splice(i - 1, 0, cr.splice(i, 1)[0]); dessinerC(); } }, '↑'),
              h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le critère', onclick: function () { cr.splice(i, 1); dessinerC(); } }, '✕'))));
        })))));
      zoneC.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (cr.length < 80) { var last = cr[cr.length - 1]; cr.push({ libelle: '', rubrique: last ? last.rubrique : '', aide: '' }); dessinerC(); } } }, 'Ajouter un critère')));
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
