// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Contrôles — interface (lot B, 14 novembre 2026). Logique : module-controles.js.
 * « Poste en cours » : une carte par CSI (contrôle de la CSI libre à deux agents, ou passage de surveillance de la CSI
 * occupée) ; postes précédents non faits pour l'encadrement. « Registre » : historique filtré, exportable.
 * Réglages (Administration → Contrôles, cadre pour ses services) : modèles actifs, check-list, second agent.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, K = SIC.controles, C = SIC.crypto;
  var filtre = { modele: '', du: '', au: '', lieu: '' };

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('controles') && s().etatModule('controles')) || { controles: {} }; }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return s().compteEffectif(); }
  function cfg() { return U.config(); }
  function services() { var l = U.services().map(function (x) { return x.code; }).filter(function (sv) { return K.droits.serviceActif(cfg(), sv); }); return U.App.service && U.App.service !== '*' && l.indexOf(U.App.service) >= 0 ? [U.App.service] : l; }
  function encadre() { return peut('CONTROLE_ANNULE_TOUS') || s().roles().indexOf('ADMIN') >= 0; }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dateFr(iso) { var j = String(iso).split('-'); return j.length === 3 ? j[2] + '/' + j[1] : iso; }
  function jourISO(t) { return SIC.model.dateLocaleISO(t); }
  /** Occupation des CSI lue à la volée dans Isocont (null : Isocont illisible pour cet agent). */
  function occupations(sv) {
    try {
      if (!s().ouvert('isocont')) return null;
      return SIC.modules.lire('isocont.occupationsCSI', s().etatModule('isocont'), { services: [sv], depuis: Date.now() - 4 * 86400000 }) || [];
    } catch (e) { return null; }
  }
  function echeancesDe(sv, maintenant) { return K.echeances(st(), cfg(), { service: sv, occupations: occupations(sv) || [], maintenant: maintenant || Date.now(), jours: 2 }); }
  var LIB_ETAT = { fait: 'Fait', aConfirmer: 'À confirmer par un second agent', aFaire: 'À faire', retard: 'Non fait' };
  var CLASSE = { fait: 'ok', aConfirmer: 'warn', aFaire: 'warn', retard: 'bad' };

  // ------------------------------------------------------------ Saisies
  function modaleControle(x, sv) {
    var o = K.options(cfg(), sv), modele = K.MODELES[x.modele], lignes = [];
    var ecart = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Écart constaté', placeholder: 'Point non conforme : ce qui manque ou ne fonctionne pas, ce qui a été fait (aucune donnée de patient).' });
    var contenu;
    if (x.modele === 'csiLibre') {
      lignes = o.csiLibre.liste.map(function (l, i) {
        var nom = 'pt-' + i, oui = h('input', { type: 'radio', name: nom, value: 'oui' }), non = h('input', { type: 'radio', name: nom, value: 'non' });
        return { libelle: l, oui: oui, non: non, noeud: h('tr', {}, h('td', { text: l }), h('td', {}, h('label', { class: 'case' }, oui, h('span', { text: 'Conforme' }))), h('td', {}, h('label', { class: 'case' }, non, h('span', { text: 'Non conforme' })))) };
      });
      var tout = h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.forEach(function (l) { l.oui.checked = true; }); } }, 'Tout conforme');
      contenu = h('div', { class: 'pile' },
        h('p', {}, h('b', { text: x.lieu }), ' — ' + x.libellePoste + ' du ' + dateFr(x.date) + (o.csiLibre.deuxAgents ? ' · contrôle à deux agents : un collègue confirmera avec son propre compte' : '')),
        o.csiLibre.provisoire ? h('small', { class: 'muted', text: 'Liste provisoire, à remplacer par celle du service (Administration → Contrôles).' }) : null,
        h('div', { class: 'table-wrap' }, h('table', { class: 'controle-liste' }, h('tbody', {}, lignes.map(function (l) { return l.noeud; })))),
        h('div', { class: 'actions gauche' }, tout),
        h('label', {}, 'Écart constaté (obligatoire si un point n’est pas conforme)', ecart));
    } else {
      contenu = h('div', { class: 'pile' },
        h('p', {}, h('b', { text: x.lieu }), ' — ' + x.libellePoste + ' du ' + dateFr(x.date)),
        h('p', { text: 'Vous notez votre passage de surveillance dans la CSI occupée, avec l’heure. Le contenu de la surveillance reste dans le dossier patient informatisé (DPI).' }),
        h('label', {}, 'Remarque sur la chambre (facultatif, aucune donnée de patient)', ecart));
    }
    U.modale(modele.libelle, contenu, [{ texte: 'Annuler' }, { texte: x.modele === 'csiLibre' ? 'Enregistrer le contrôle' : 'Noter mon passage', classe: 'primaire', action: async function () {
      var items = lignes.map(function (l) { return { libelle: l.libelle, ok: l.oui.checked ? true : (l.non.checked ? false : null) }; });
      if (items.some(function (i) { return i.ok === null; })) throw new Error('Indiquez pour chaque point : conforme ou non conforme.');
      var d = { id: 'CT-' + C.hex(C.aleatoire(8)), modele: x.modele, service: sv, lieu: x.lieu, date: x.date, poste: x.poste, libellePoste: x.libellePoste, items: items, ecart: ecart.value.trim(),
        deuxAgents: x.modele === 'csiLibre' && o.csiLibre.deuxAgents, nom: moi().nom || '' };
      await s().enregistrer('CONTROLE', d);
      var nc = items.some(function (i) { return !i.ok; });
      U.toast(x.modele === 'surveillance' ? 'Passage noté à ' + hm(Date.now()) + '.' : (nc ? 'Contrôle enregistré : écart signalé au cadre.' : 'Contrôle enregistré.') + (d.deuxAgents ? ' Un second agent doit le confirmer.' : ''));
    } }], { large: x.modele === 'csiLibre' });
  }
  function modaleConfirmer(c) {
    U.modale('Confirmer le contrôle (second agent)', h('div', { class: 'pile' },
      h('p', {}, h('b', { text: c.lieu }), ' — ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) + ', fait par ' + (c.nom || s().nomAuteur(c.par)) + ' à ' + hm(Date.parse(c.le))),
      h('ul', { class: 'liste-simple' }, c.items.map(function (i) { return h('li', { class: i.ok ? '' : 'texte-alerte', text: (i.ok ? '✓ ' : '✗ ') + i.libelle }); })),
      c.ecart ? h('p', {}, h('b', { text: 'Écart : ' }), c.ecart) : null,
      h('small', { class: 'muted', text: 'En confirmant, vous attestez avoir vérifié la chambre avec votre collègue. Confirmation enregistrée à votre nom.' })),
      [{ texte: 'Annuler' }, { texte: 'Je confirme', classe: 'primaire', action: async function () { await s().enregistrer('CONTROLE_CONFIRME', { controle: c.id, service: c.service, nom: moi().nom || '' }); U.toast('Contrôle confirmé.'); } }]);
  }
  function modaleAnnuler(c) {
    var motif = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Motif' });
    U.modale('Annuler ce contrôle', h('div', { class: 'pile' }, h('p', { text: c.lieu + ' — ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) + ' (' + K.MODELES[c.modele].court + ')' }), h('label', {}, 'Motif (le contrôle reste au registre, marqué annulé)', motif)),
      [{ texte: 'Fermer' }, { texte: 'Annuler le contrôle', classe: 'danger', action: async function () { await s().enregistrer('CONTROLE_ANNULE', { controle: c.id, service: c.service, motif: motif.value.trim(), nom: moi().nom || '' }); U.toast('Contrôle annulé : il peut être refait.'); } }]);
  }

  // ------------------------------------------------------------ Vues
  function carte(x, sv) {
    var c = x.controle, m = K.MODELES[x.modele], actions = [];
    var lecture = s().apercu || !peut('CONTROLE');
    if (!c && !lecture && x.etat !== 'retard') actions.push(h('button', { class: 'btn primaire petit', type: 'button', onclick: function () { modaleControle(x, sv); } }, x.modele === 'csiLibre' ? 'Faire le contrôle' : 'Noter mon passage'));
    if (!c && !lecture && x.etat === 'retard') actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleControle(x, sv); } }, 'Faire en retard'));
    if (c && c.deuxAgents && !c.confirmePar && !lecture && c.par !== moi().id) actions.push(h('button', { class: 'btn primaire petit', type: 'button', onclick: function () { modaleConfirmer(c); } }, 'Confirmer (second agent)'));
    if (c && !lecture && (c.par === moi().id || encadre())) actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleAnnuler(c); } }, 'Annuler'));
    return h('article', { class: 'controle-carte etat-' + x.etat },
      h('div', { class: 'barre' }, h('b', { text: x.lieu }), h('span', { class: 'badge', text: m.court }), h('div', { class: 'espace' }), h('span', { class: 'badge ' + CLASSE[x.etat], text: LIB_ETAT[x.etat] })),
      c ? h('small', { class: 'muted', text: (x.modele === 'surveillance' ? 'Passage de ' : 'Fait par ') + (c.nom || s().nomAuteur(c.par)) + ' à ' + hm(Date.parse(c.le)) + (c.confirmePar ? ', confirmé par ' + (c.nomConfirme || s().nomAuteur(c.confirmePar)) + ' à ' + hm(Date.parse(c.confirmeLe)) : '') }) : null,
      c && K.nonConforme(c) ? h('p', { class: 'texte-alerte', text: 'Écart : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', ') + (c.ecart ? ' — ' + c.ecart : '') }) : (c && c.ecart ? h('p', { class: 'muted', text: c.ecart }) : null),
      actions.length ? h('div', { class: 'actions gauche' }, actions) : null);
  }
  function vuePoste() {
    var maintenant = Date.now(), blocs = services().map(function (sv) {
      var ech = echeancesDe(sv, maintenant), lieux = K.csiDu(cfg(), sv), occ = occupations(sv);
      var courant = ech.filter(function (x) { return x.debut <= maintenant && x.fin > maintenant; }), ret = K.retards(ech);
      return h('section', { class: 'panneau' }, h('h2', { text: U.libService(sv) + (courant[0] ? ' — ' + courant[0].libellePoste + ' (' + hm(courant[0].debut) + ' – ' + hm(courant[0].fin) + ')' : '') }),
        !lieux.length ? h('p', { class: 'muted', text: 'Aucune chambre de soins intensifs déclarée pour ce service (Administration → Réglages généraux → Établissement et services → lieux d’isolement).' }) : null,
        occ === null && lieux.length ? h('p', { class: 'muted', text: 'Occupation des CSI inconnue (Isocont non ouvert pour vous) : chaque CSI est présentée comme libre.' }) : null,
        courant.length ? h('div', { class: 'controles-grille' }, courant.map(function (x) { return carte(x, sv); })) : (lieux.length ? h('p', { class: 'muted', text: 'Aucun contrôle pour le poste en cours.' }) : null),
        encadre() && ret.length ? h('div', { class: 'pile' }, h('h3', { text: 'Postes précédents : contrôles non faits ou non confirmés (' + ret.length + ')' }),
          h('div', { class: 'controles-grille' }, ret.map(function (x) { var n = carte(x, sv); n.insertBefore(h('small', { class: 'muted', text: x.libellePoste + ' du ' + dateFr(x.date) }), n.firstChild); return n; }))) : null);
    });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Contrôles du poste en cours' })),
      h('p', { class: 'muted', text: 'Chaque poste : contrôle de chaque CSI libre (à deux agents) et passage de surveillance dans chaque CSI occupée. L’occupation est lue dans Isocont. Aucune donnée clinique : le contenu de la surveillance reste dans le DPI.' }),
      blocs);
  }
  function vueRegistre() {
    var svs = services(), ls = K.registre(st(), { services: svs, modele: filtre.modele, du: filtre.du, au: filtre.au });
    function champ(cle, type, libelle) { return h('label', {}, libelle, h('input', { type: type, value: filtre[cle], onchange: function (ev) { filtre[cle] = ev.target.value; U.rendreContenu(); } })); }
    var nc = ls.filter(function (c) { return !c.annule && K.nonConforme(c); }).length;
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Registre des contrôles' }), h('div', { class: 'espace' }),
        encadre() ? h('button', { class: 'btn', type: 'button', onclick: function () { exporter(ls); } }, 'Exporter (CSV)') : null),
      h('div', { class: 'filtres' },
        h('label', {}, 'Contrôle', h('select', { onchange: function (ev) { filtre.modele = ev.target.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous' })].concat(Object.keys(K.MODELES).map(function (k) { return h('option', { value: k, text: K.MODELES[k].libelle, selected: filtre.modele === k }); })))),
        champ('du', 'date', 'Du'), champ('au', 'date', 'Au')),
      h('p', { class: 'muted', text: ls.length + ' contrôle(s)' + (nc ? ', dont ' + nc + ' avec un écart' : '') + '.' }),
      ls.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Poste', 'Service', 'Lieu', 'Contrôle', 'Fait par', 'Second agent', 'Résultat', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, ls.slice(0, 500).map(function (c) {
          var res = c.annule ? 'Annulé : ' + c.annule.motif : (c.modele === 'surveillance' ? 'Passage noté' + (c.ecart ? ' — ' + c.ecart : '') : (K.nonConforme(c) ? 'Écart : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', ') + (c.ecart ? ' — ' + c.ecart : '') : 'Conforme'));
          return h('tr', { class: c.annule ? 'ligne-annulee' : '' }, h('td', { text: dateFr(c.date) + ' ' + (c.libellePoste || c.poste) }), h('td', { text: U.libService(c.service) }), h('td', { text: c.lieu }), h('td', { text: K.MODELES[c.modele].court }),
            h('td', { text: (c.nom || s().nomAuteur(c.par)) + ' ' + hm(Date.parse(c.le)) }), h('td', { text: c.deuxAgents ? (c.confirmePar ? (c.nomConfirme || s().nomAuteur(c.confirmePar)) + ' ' + hm(Date.parse(c.confirmeLe)) : 'non confirmé') : '—' }),
            h('td', { class: !c.annule && K.nonConforme(c) ? 'texte-alerte' : '', text: res }),
            h('td', {}, !c.annule && !s().apercu && (c.par === moi().id || encadre()) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleAnnuler(c); } }, 'Annuler') : null));
        })))) : h('p', { class: 'muted', text: 'Aucun contrôle sur cette période.' }));
  }
  function exporter(ls) {
    var lignes = K.lignesExport(ls, U.libService);
    var csv = '﻿' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('registres', 'registre_controles_' + jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }

  // ------------------------------------------------------------ Réglages (administrateur, cadre pour ses services)
  function panneauReglages() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: 'Service ' + x.libelle }; }));
    if (!niveaux.length) return null;
    var v = JSON.parse(JSON.stringify(cfg().controles || {})), niveau = niveaux[0].code, zone = h('div', { class: 'pile' }), lire = function () {};
    function dessiner() {
      U.vider(zone);
      var propre = v[niveau] || {}, eff = K.options(cfg(), niveau === '*' ? null : niveau), l = propre.csiLibre || {}, sv = propre.surveillance || {};
      function tri(valeur, defaut, libelle) {
        var suit = niveau !== '*' && valeur === undefined;
        var sel = h('select', { 'aria-label': libelle }, (niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement (' + (defaut ? 'oui' : 'non') + ')', selected: suit })])
          .concat([h('option', { value: 'oui', text: 'Oui', selected: !suit && (valeur === undefined ? defaut : valeur) }), h('option', { value: 'non', text: 'Non', selected: !suit && !(valeur === undefined ? defaut : valeur) })]));
        return { noeud: h('label', {}, libelle, sel), lire: function () { return sel.value === '' ? undefined : sel.value === 'oui'; } };
      }
      var e = niveau === '*' ? K.options({}, null) : K.options(cfg(), null);
      var aL = tri(l.actif, e.csiLibre.actif, 'Contrôle des CSI libres à chaque poste'), dA = tri(l.deuxAgents, e.csiLibre.deuxAgents, 'Second agent qui confirme'), aS = tri(sv.actif, e.surveillance.actif, 'Passage de surveillance des CSI occupées à chaque poste');
      var liste = h('textarea', { rows: 9, 'aria-label': 'Check-list des CSI libres, un point par ligne' });
      liste.value = Array.isArray(l.liste) ? l.liste.join('\n') : '';
      zone.appendChild(h('div', { class: 'pile' }, h('div', { class: 'grille-3' }, aL.noeud, dA.noeud, aS.noeud),
        h('label', {}, 'Check-list des CSI libres, un point par ligne (vide : ' + (niveau === '*' ? 'liste provisoire' : 'celle de l’établissement') + ')', liste),
        h('small', { class: 'muted', text: 'Liste appliquée : ' + eff.csiLibre.liste.join(' · ') + (eff.csiLibre.provisoire ? ' (liste provisoire, à remplacer)' : '') })));
      lire = function () {
        var pts = liste.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var n = { csiLibre: {}, surveillance: {} };
        if (aL.lire() !== undefined) n.csiLibre.actif = aL.lire();
        if (dA.lire() !== undefined) n.csiLibre.deuxAgents = dA.lire();
        if (pts.length) n.csiLibre.liste = pts.slice(0, 40);
        if (aS.lire() !== undefined) n.surveillance.actif = aS.lire();
        if (!Object.keys(n.csiLibre).length) delete n.csiLibre;
        if (!Object.keys(n.surveillance).length) delete n.surveillance;
        if (Object.keys(n).length) v[niveau] = n; else delete v[niveau];
      };
    }
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { lire(); niveau = sel.value; dessiner(); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Contrôles des chambres de soins intensifs' }),
      h('p', { class: 'muted', text: 'À chaque poste (postes de surveillance d’Isocont) : contrôle de chaque CSI libre, à deux agents, avec la check-list ; passage de surveillance dans chaque CSI occupée. Rappel à l’équipe pendant le poste, alerte au cadre une fois le poste terminé. Le module s’active service par service (Réglages généraux → Modules activés par service).' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () { lire(); await U.enregistrerConfig([['controles', v]]); }));
  }

  // ------------------------------------------------------------ Informations (Aujourd'hui) et pastille
  function informations() {
    var res = [], maintenant = Date.now();
    try {
      if (!peut('CONTROLE') && !encadre()) return res;
      services().forEach(function (sv) {
        var ech = echeancesDe(sv, maintenant);
        if (peut('CONTROLE')) {
          var af = K.aFaire(ech).filter(function (x) { return x.debut <= maintenant && (x.etat === 'aFaire' || x.controle.par !== moi().id); });
          if (af.length) res.push({ id: 'ct-p-' + sv + '-' + af[0].date + af[0].poste, niveau: 'warn', titre: 'Contrôles du poste à faire (' + U.libService(sv) + ') : ' + af.length, detail: af.map(function (x) { return x.lieu + ' (' + LIB_ETAT[x.etat].toLowerCase() + ')'; }).join(', '), ouvrir: function () { U.App.ongletsFenetres.controles = 'poste'; U.ouvrirFenetre('controles'); } });
        }
        if (encadre()) {
          var r = K.retards(ech);
          if (r.length) res.push({ id: 'ct-r-' + sv + '-' + r.map(function (x) { return x.cle; }).join(','), niveau: 'bad', titre: 'Contrôles des CSI non faits (' + U.libService(sv) + ') : ' + r.length, detail: r.slice(0, 6).map(function (x) { return x.lieu + ', ' + x.libellePoste + ' du ' + dateFr(x.date); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'poste'; U.ouvrirFenetre('controles'); } });
          var depuis = jourISO(maintenant - 2 * 86400000), ec = K.registre(st(), { services: [sv], du: depuis }).filter(function (c) { return !c.annule && K.nonConforme(c); });
          if (ec.length) res.push({ id: 'ct-e-' + ec.map(function (c) { return c.id; }).join(','), niveau: 'warn', titre: 'Écart au contrôle d’une CSI (' + U.libService(sv) + ')', detail: ec.map(function (c) { return c.lieu + ' : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', '); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'registre'; U.ouvrirFenetre('controles'); } });
        }
      });
    } catch (e) { /* module illisible : rien à afficher */ }
    return res;
  }

  var LIB = { CONTROLE: 'Contrôle', CONTROLE_CONFIRME: 'Contrôle confirmé', CONTROLE_ANNULE: 'Contrôle annulé' };
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'CONTROLE') return (K.MODELES[d.modele] ? K.MODELES[d.modele].libelle : 'Contrôle') + ' — ' + d.lieu + ', ' + (d.libellePoste || d.poste) + ' du ' + dateFr(d.date) + (Array.isArray(d.items) && d.items.some(function (i) { return !i.ok; }) ? ' — écart' : '');
    var c = st().controles[d.controle];
    return (c ? c.lieu + ', ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) : d.controle) + (d.motif ? ' — ' + d.motif : '');
  }
  SIC.modules.completerInterface('controles', {
    vues: { poste: vuePoste, registre: vueRegistre },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le contrôle redevient à faire.'; } },
    admin: { onglets: function () { return [['controles', 'Contrôles', [panneauReglages()].filter(Boolean)]]; }, cadre: function () { return [panneauReglages()].filter(Boolean); } },
    informations: informations,
    pastille: function () { try { return informations().length; } catch (e) { return 0; } }
  });
  U.controles = { informations: informations };
})();
