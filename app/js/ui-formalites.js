// SPDX-License-Identifier: EUPL-1.2
/*
 * Formalités d'admission et de sortie — interface (lot P, 14 novembre 2026). Logique : formalites.js.
 * Onglet « Formalités » de la fiche patient (séjour en cours ou dernier séjour), alertes dans « Aujourd'hui »,
 * réglages (Administration → Patients → Formalités, cadre pour ses services).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, FO = SIC.formalites;

  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function fiches() { return (U.st() && U.st().patients) || {}; }
  function peutSaisir() { try { return !s().apercu && (s().peut('MODE_HOSPI') || s().peut('SEJOUR')); } catch (e) { return false; } }
  function jourFr(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function quand(t) { var d = new Date(t); return d.toLocaleDateString('fr-FR') + ' ' + String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0'); }
  var LIB = { fait: 'Fait', sansObjet: 'Sans objet', aFaire: 'À faire', retard: 'En retard', avenir: 'À la sortie' };
  var CLASSE = { fait: 'ok', sansObjet: '', aFaire: 'warn', retard: 'bad', avenir: '' };

  /** L'option est-elle active pour le service de la fiche ? */
  function active(f) { var sj = FO.sejourCourant(f); return FO.options(cfg(), (sj && sj.service) || f.service).active; }

  /** Onglet de la fiche patient : formalités du séjour en cours (ou du dernier séjour). */
  function section(f0) {
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      var f = fiches()[f0.id] || f0, sj = FO.sejourCourant(f);
      if (!sj) { zone.appendChild(h('p', { class: 'muted', text: 'Aucun séjour enregistré : les formalités se rattachent à un séjour (onglet « Séjours et sorties »).' })); return; }
      var l = FO.etatSejour(f, sj, cfg(), Date.now()), peut = peutSaisir();
      zone.appendChild(h('p', { class: 'muted', text: 'Séjour du ' + jourFr(sj.entree) + (sj.sortie ? ' au ' + jourFr(sj.sortie) : ' (en cours)') + '. Seulement fait ou sans objet, la date et l’agent : aucune donnée clinique.' }));
      Object.keys(FO.MOMENTS).forEach(function (mo) {
        var lm = l.filter(function (x) { return x.f.moment === mo; });
        if (!lm.length) return;
        zone.appendChild(h('h3', { text: FO.MOMENTS[mo] }));
        zone.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'formalites' }, h('tbody', {}, lm.map(function (x) {
          var actions = [];
          function poser(etat) {
            return async function () {
              try {
                await s().enregistrer('FORMALITE', { patientId: f.id, sejourId: sj.id, formalite: x.f.id, etat: etat, nom: (s().compteEffectif() || {}).nom || '' });
                dessiner();
              } catch (e) { U.toast(e.message); }
            };
          }
          if (peut && x.statut !== 'fait' && x.statut !== 'avenir') actions.push(h('button', { class: 'btn petit primaire', type: 'button', onclick: poser('fait') }, 'Fait'));
          if (peut && x.statut !== 'sansObjet' && x.statut !== 'avenir') actions.push(h('button', { class: 'btn petit', type: 'button', onclick: poser('sansObjet') }, 'Sans objet'));
          if (peut && (x.statut === 'fait' || x.statut === 'sansObjet')) actions.push(h('button', { class: 'btn petit', type: 'button', onclick: poser(null) }, 'Remettre à faire'));
          return h('tr', {}, h('td', { text: x.f.libelle }), h('td', {}, h('span', { class: 'badge ' + CLASSE[x.statut], text: LIB[x.statut] })),
            h('td', { class: 'muted', text: x.le ? (x.nom || s().nomAuteur(x.par)) + ', ' + quand(Date.parse(x.le)) : (x.echeance && x.statut !== 'avenir' ? 'attendu avant le ' + quand(x.echeance) : '') }),
            h('td', { class: 'actions-ligne' }, actions));
        })))));
      });
    }
    dessiner();
    return zone;
  }

  /** Alertes : formalités en retard des services de l'agent (agents qui les saisissent, encadrement). */
  function informations() {
    var res = [];
    try {
      var enc = s().roles().some(function (r) { return r === 'CADRE' || r === 'CADRE_SUP' || r === 'ADMIN'; });
      if (!peutSaisir() && !enc) return res;
      var svs = U.services().map(function (x) { return x.code; });
      var l = FO.retards(fiches(), cfg(), svs, Date.now()), parPatient = {};
      l.forEach(function (x) { (parPatient[x.fiche.id] = parPatient[x.fiche.id] || { fiche: x.fiche, f: [] }).f.push(x.f.libelle); });
      Object.keys(parPatient).forEach(function (k) {
        var x = parPatient[k];
        res.push({ id: 'fo-' + k + '-' + x.f.length, niveau: 'warn', titre: 'Formalités à faire : ' + ((x.fiche.nom || '') + ' ' + (x.fiche.prenom || '')).trim(), detail: x.f.join(', '),
          ouvrir: function () { if (U.fichePatient) U.fichePatient.modale(fiches()[k] || x.fiche); } });
      });
    } catch (e) { /* patients illisibles */ }
    return res;
  }

  /** Réglages : activation et liste (une formalité par ligne : moment | libellé | délai en heures | modes). */
  function panneau() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: 'Service ' + x.libelle }; }));
    if (!niveaux.length) return null;
    var v = JSON.parse(JSON.stringify(cfg().formalites || {})), niveau = niveaux[0].code, zone = h('div', { class: 'pile' }), lire = function () {};
    function versTexte(l) { return l.map(function (f) { return [f.moment === 'sortie' ? 'sortie' : 'admission', f.libelle, f.delai, f.modes.join(', ')].join(' | ').replace(/ \| $/, ''); }).join('\n'); }
    function depuisTexte(t) {
      return t.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (ligne, i) {
        var p = ligne.split('|').map(function (y) { return y.trim(); }), mo = /^sort/i.test(p[0]) ? 'sortie' : 'admission';
        var f = FO.formalite({ id: 'f' + i + '-' + p[1].toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 20), libelle: p[1], moment: mo, delai: p[2] ? +p[2] : FO.DELAI_DEFAUT, modes: (p[3] || '').split(',').map(function (y) { return y.trim(); }).filter(Boolean) });
        if (!f) throw new Error('Ligne ' + (i + 1) + ' illisible : « admission | libellé | délai en heures | modes ».');
        return f;
      });
    }
    function dessiner() {
      U.vider(zone);
      var propre = v[niveau] || {}, eff = FO.options(cfg(), niveau === '*' ? null : niveau);
      var act = h('select', { 'aria-label': 'Formalités activées' }, (niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement (' + (FO.options(cfg(), null).active ? 'activées' : 'désactivées') + ')', selected: propre.active === undefined })])
        .concat([h('option', { value: 'oui', text: 'Activées', selected: propre.active === true || (niveau === '*' && eff.active) }), h('option', { value: 'non', text: 'Désactivées', selected: propre.active === false || (niveau === '*' && !eff.active) })]));
      var liste = h('textarea', { rows: 9, 'aria-label': 'Formalités, une par ligne' });
      liste.value = Array.isArray(propre.liste) ? versTexte(propre.liste.map(FO.formalite).filter(Boolean)) : '';
      var modes = (cfg().modesHospitalisation || []).map(function (m) { return m.code; }).join(', ');
      zone.appendChild(h('div', { class: 'pile' }, h('label', {}, 'Formalités', act),
        h('label', {}, 'Liste, une formalité par ligne : « admission ou sortie | libellé | délai d’alerte en heures | modes d’hospitalisation concernés (vide : tous) » ; vide : ' + (niveau === '*' ? 'liste par défaut' : 'celle de l’établissement'), liste),
        h('small', { class: 'muted', text: 'Liste appliquée : ' + versTexte(eff.liste).split('\n').join(' · ') + (modes ? '. Modes : ' + modes + '.' : '') })));
      lire = function () {
        var n = {};
        if (act.value === 'oui') n.active = true; else if (act.value === 'non') n.active = false;
        if (liste.value.trim()) n.liste = depuisTexte(liste.value);
        if (Object.keys(n).length) v[niveau] = n; else delete v[niveau];
      };
    }
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { try { lire(); } catch (e) { U.toast(e.message); } niveau = sel.value; dessiner(); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Formalités d’admission et de sortie' }),
      h('p', { class: 'muted', text: 'Check-list administrative de chaque séjour, dans la fiche patient : faite ou sans objet, datée et signée ; alerte quand une formalité reste à faire après le délai suivant l’entrée ou la sortie. Désactivées par défaut. Aucune donnée clinique.' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () { lire(); await U.enregistrerConfig([['formalites', v]]); }));
  }

  U.formalites = { section: section, active: active, informations: informations, panneau: panneau };
  SIC.modules.completerInterface('patients', { informations: informations, pastille: function () { try { return informations().length; } catch (e) { return 0; } } });
})();
