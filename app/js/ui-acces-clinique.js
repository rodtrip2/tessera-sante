// SPDX-License-Identifier: EUPL-1.2
/*
 * Accès aux données cliniques et bris de glace — interface (phase 5, lot G, décisions du porteur du 15 novembre 2026).
 * Logique : acces-clinique.js ; saisies BRIS_GLACE, BRIS_GLACE_FIN, BRIS_GLACE_RELU du module Patients.
 * - valeurs cliniques masquées hors accès (rôle limité aux patients présents, patient absent) ;
 * - fiche patient : bloc « Données cliniques : accès restreint » et bouton « Bris de glace… » (justification) ;
 * - onglet « Bris de glace » de la fenêtre Patients : mes bris de glace ; pour le cadre, relecture mensuelle et export ;
 * - informations : cadre du service du patient (à relire), administrateur de garde (dernières 24 heures).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, AC = SIC.accesClinique, CH = SIC.champs, C = SIC.crypto;
  var mois = SIC.model.dateLocaleISO(Date.now()).slice(0, 7);

  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function stP() { try { return s().etatModule('patients') || { bris: {} }; } catch (e) { return { bris: {} }; } }
  function bris() { return stP().bris || {}; }
  function fr(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function heure(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function fiche(id, f) { return f || (s().etat && s().etat.patients && s().etat.patients[id]) || null; }
  function rolesDans(service) {
    var RS = SIC.rolesServices, u = s().utilisateur;
    return RS && u && RS.aDesRoles(cfg(), u) ? RS.rolesDans(s().compteEffectif() ? Object.assign({}, u, { services: s().compteEffectif().services }) : u, cfg(), service) : s().roles();
  }
  function present(f) {
    if (!f) return false;
    var sej = null; (f.sejours || []).forEach(function (x) { if (!x.sortie) sej = x; });
    var sv = f.service, c = s().compteEffectif() || {};
    return !!sej && ((c.services || []).indexOf(sv) >= 0 || (c.roles || []).indexOf('ADMIN') >= 0);
  }
  /** Accès de l'agent aux données cliniques de ce patient pour cette donnée : { ok, raison }. */
  function acces(champ, id, f0) {
    var f = fiche(id, f0), sv = f && f.service, roles = rolesDans(sv);
    return AC.acces({ config: cfg(), roles: roles, lecteur: CH.peutVoir(champ, roles), present: present(f), service: sv, bris: bris(), agent: s().utilisateur.id, patientId: id, maintenant: Date.now() });
  }
  function ok(champ, id, f) { return !champ.clinique || acces(champ, id, f).ok; }
  function tientCle(champ) { var t = s().trousseau; if (!t) return true; var j = t[CH.cleDe(champ) || champ.module]; return !!j && (j.v1 || !!j.maitresse || Object.keys(j.octets || {}).length > 0); }
  /** Donnée clinique lisible grâce à un bris de glace en cours (l'agent n'est pas lecteur habituel). */
  function lisibleParBris(champ, id) { return !!champ.clinique && tientCle(champ) && !!AC.brisEnCours(bris(), s().utilisateur.id, id, Date.now()); }

  // ------------------------------------------------------------ Fiche patient
  /** Bloc de la fiche : accès restreint, bris de glace en cours, ou rien. */
  function blocFiche(f, apres) {
    if (!f || !f.id) return null;
    var champs = CH.definitions(cfg(), { entite: 'patient', service: f.service }).filter(function (c) { return c.clinique; });
    if (!champs.length) return null;
    var enCours = AC.brisEnCours(bris(), s().utilisateur.id, f.id, Date.now());
    if (enCours) return h('div', { class: 'hs-paie ac-bris', role: 'status' }, h('b', { text: 'Bris de glace en cours' }), ' : données cliniques lisibles jusqu’à ' + heure(enCours.fin) + ' (tracé, relu par le cadre). ',
      h('button', { class: 'btn petit', type: 'button', onclick: async function () { try { await s().enregistrer('BRIS_GLACE_FIN', { bris: enCours.id, patientId: f.id }); U.toast('Bris de glace terminé.'); if (apres) apres(); } catch (e) { U.toast(e.message); } } }, 'Terminer maintenant'));
    var restreints = champs.filter(function (c) { var a = acces(c, f.id, f); return !a.ok; });
    if (!restreints.length) return null;
    var peut = AC.peutBriser(cfg(), rolesDans(f.service), f.service) && !s().apercu;
    var absents = restreints.some(function (c) { return acces(c, f.id, f).raison === 'absent'; });
    return h('div', { class: 'ac-restreint', role: 'note' }, h('b', { text: 'Données cliniques : accès restreint' }),
      h('span', { text: absents ? ' (votre rôle ne les voit que pour les patients présents dans vos services). ' : ' (votre rôle n’y a pas accès). ' }),
      peut ? h('button', { class: 'btn petit danger', type: 'button', onclick: function () { modaleBris(f, apres); } }, 'Bris de glace…') : null);
  }
  function modaleBris(f, apres) {
    var o = AC.options(cfg(), f.service), just = h('textarea', { rows: 3, maxlength: 500, 'aria-label': 'Justification' });
    var postes = SIC.model.periodesDe(cfg(), f.service), debut = Date.now(), fin = AC.fin(debut, o.bris.duree, postes);
    U.modale('Bris de glace — ' + [f.nom, f.prenom].filter(Boolean).join(' '), h('div', { class: 'pile' },
      h('p', { text: 'Vous allez lire les données cliniques de ce patient sans y avoir accès habituellement, jusqu’à ' + heure(new Date(fin).toISOString()) + (o.bris.duree === 'poste' ? ' (fin du poste)' : '') + '.' }),
      h('p', { class: 'hs-paie', text: 'Ce bris de glace est tracé au journal. Le cadre du service du patient et l’administrateur de garde en sont informés ; le cadre relit chaque mois la liste des bris de glace, qui peut être remise au délégué à la protection des données.' }),
      h('label', {}, 'Justification (obligatoire : situation, urgence)', just)),
      [{ texte: 'Annuler' }, { texte: 'Confirmer le bris de glace', classe: 'danger', action: async function () {
        var c = s().compteEffectif() || {};
        await s().enregistrer('BRIS_GLACE', { id: 'BG-' + C.hex(C.aleatoire(6)), patientId: f.id, service: f.service || '', justification: just.value.trim(), debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(), nom: c.nom || '', roles: rolesDans(f.service) });
        U.toast('Bris de glace enregistré : données cliniques lisibles jusqu’à ' + heure(new Date(fin).toISOString()) + '.');
        if (apres) apres();
      } }]);
  }

  // ------------------------------------------------------------ Onglet « Bris de glace » (fenêtre Patients)
  function nomPatient(id) { var f = fiche(id); return f ? [f.nom, f.prenom].filter(Boolean).join(' ') : id; }
  function relecteur(b) { var c = s().compteEffectif() || {}, r = rolesDans(b.service); return r.indexOf('ADMIN') >= 0 || (r.indexOf('CADRE') >= 0 && (c.services || []).indexOf(b.service) >= 0); }
  function modaleRelire(b) {
    var com = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Commentaire' });
    U.modale('Relire le bris de glace', h('div', { class: 'pile' }, h('p', { text: (b.nom || s().nomAuteur(b.agent)) + ' — ' + nomPatient(b.patientId) + ' — ' + fr(b.debut) + ' à ' + heure(b.fin) }),
      h('p', { text: 'Justification : ' + b.justification }), h('label', {}, 'Commentaire (facultatif)', com)),
      [{ texte: 'Annuler' }, { texte: 'Marquer relu', classe: 'primaire', action: async function () { await s().enregistrer('BRIS_GLACE_RELU', { bris: b.id, patientId: b.patientId, commentaire: com.value.trim() }); U.toast('Bris de glace relu.'); } }]);
  }
  function servicesCadre() { var c = s().compteEffectif() || {}; return (c.roles || []).indexOf('ADMIN') >= 0 ? null : (c.services || []).filter(function (sv) { return rolesDans(sv).indexOf('CADRE') >= 0; }); }
  function exporter(l) {
    var lignes = [['Date', 'Fin', 'Agent', 'Rôles', 'Patient', 'Service', 'Justification', 'Relu le', 'Relu par', 'Commentaire']].concat(l.map(function (b) {
      return [fr(b.debut), fr(b.fin), b.nom || s().nomAuteur(b.agent), (b.roles || []).join(', '), nomPatient(b.patientId), U.libService(b.service), b.justification, b.relu ? fr(b.relu.le) : '', b.relu ? s().nomAuteur(b.relu.par) : '', b.relu ? b.relu.commentaire : ''];
    }));
    var csv = '﻿' + lignes.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('registres', 'bris_de_glace_' + mois + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }
  function vue() {
    var me = s().utilisateur.id, sc = servicesCadre(), estCadre = sc === null || sc.length > 0;
    var miens = Object.keys(bris()).map(function (k) { return bris()[k]; }).filter(function (b) { return b.agent === me; }).sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); }).slice(0, 20);
    var l = estCadre ? AC.duMois(bris(), mois, sc) : [];
    function tab(lst, avecActions) {
      return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Date', 'Jusqu’à', avecActions ? 'Agent' : null, 'Patient', 'Service', 'Justification', 'Relu', ''].filter(function (x) { return x !== null; }).map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, lst.map(function (b) {
          return h('tr', {}, h('td', { text: fr(b.debut) }), h('td', { text: heure(b.clos || b.fin) + (b.clos ? ' (terminé)' : '') }), avecActions ? h('td', { text: (b.nom || s().nomAuteur(b.agent)) + ((b.roles || []).length ? ' (' + b.roles.join(', ') + ')' : '') }) : null,
            h('td', { text: nomPatient(b.patientId) }), h('td', { text: U.libService(b.service) }), h('td', { text: b.justification }),
            h('td', {}, b.relu ? h('span', { class: 'badge ok', title: b.relu.commentaire || '', text: 'relu le ' + fr(b.relu.le).slice(0, 10) }) : h('span', { class: 'badge warn', text: 'à relire' })),
            h('td', { class: 'actions-ligne' }, avecActions && !b.relu && relecteur(b) && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleRelire(b); } }, 'Relire') : null));
        }))));
    }
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Bris de glace' })),
      !AC.brisActive(cfg()) ? h('p', { class: 'muted', text: 'Fonction désactivée par l’établissement (onglet « Validations »). Les bris de glace déjà faits restent listés.' }) : null,
      estCadre ? h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Relecture du mois (' + l.length + ')' }), h('div', { class: 'espace' }),
          h('input', { type: 'month', value: mois, 'aria-label': 'Mois', onchange: function (e) { mois = e.target.value || mois; U.rendreContenu(); } }),
          h('button', { class: 'btn', type: 'button', onclick: function () { exporter(l); } }, 'Exporter (CSV)')),
        l.length ? tab(l, true) : h('p', { class: 'muted', text: 'Aucun bris de glace ce mois-ci.' }),
        h('small', { class: 'muted', text: 'Relisez chaque bris de glace (justification, contexte). L’export peut être remis au délégué à la protection des données.' })) : null,
      h('section', { class: 'panneau' }, h('h2', { text: 'Mes bris de glace' }), miens.length ? tab(miens, false) : h('p', { class: 'muted', text: 'Aucun.' })));
  }

  // ------------------------------------------------------------ Réglages (administrateur)
  function panneau() {
    var cle = U.App.service && U.App.service !== '*' ? U.App.service : '*', o = AC.options(cfg(), cle === '*' ? null : cle);
    var roles = SIC.model.rolesConfig(cfg()).filter(function (r) { return !r.admin; });
    var pres = roles.map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: o.presents.indexOf(r.code) >= 0 }) }; });
    var br = roles.map(function (r) { return { r: r, cb: h('input', { type: 'checkbox', checked: o.bris.roles.indexOf(r.code) >= 0 }) }; });
    var duree = h('select', { 'aria-label': 'Durée du bris de glace' }, [['poste', 'Jusqu’à la fin du poste']].concat([[60, '1 heure'], [120, '2 heures'], [240, '4 heures'], [720, '12 heures']]).map(function (x) { return h('option', { value: String(x[0]), text: x[1], selected: String(o.bris.duree) === String(x[0]) }); }));
    var cases = function (l) { return h('div', { class: 'actions gauche' }, l.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: x.r.libelle })); })); };
    return h('section', { class: 'panneau' }, h('h2', { text: 'Données cliniques : accès et bris de glace — ' + (cle === '*' ? 'établissement' : U.libService(cle)) }),
      h('p', { class: 'muted', text: 'Les données cliniques sont les données ajoutées marquées « donnée clinique » (fonction de l’onglet Validations). Les rôles qui les voient sont réglés donnée par donnée ; ici, des limites communes. Choisissez un service en haut de l’écran pour régler ce service seulement.' }),
      h('p', { text: 'Rôles qui ne voient les données cliniques que des patients présents (séjour en cours dans un de leurs services) :' }), cases(pres),
      h('p', { text: 'Rôles qui peuvent recourir au bris de glace' + (AC.brisActive(cfg()) ? '' : ' (fonction désactivée dans l’onglet Validations)') + ' :' }), cases(br),
      h('label', { class: 'en-ligne' }, 'Durée d’un bris de glace', duree),
      h('small', { class: 'muted', text: 'La clé des données cliniques est remise aux rôles qui peuvent recourir au bris de glace : l’accès est garanti par l’application et la traçabilité (justification, journal, information du cadre et de l’administrateur de garde, relecture mensuelle).' }),
      U.boutonEnregistrer(async function () {
        var v = JSON.parse(JSON.stringify(cfg().accesClinique || {}));
        v[cle] = { presents: pres.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r.code; }), bris: { roles: br.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.r.code; }), duree: duree.value === 'poste' ? 'poste' : +duree.value } };
        await U.enregistrerConfig([['accesClinique', v]]);
      }));
  }

  // ------------------------------------------------------------ Informations
  function informations() {
    var res = [];
    try {
      var sc = servicesCadre();
      if (sc === null || sc.length) {
        var ar = AC.aRelire(bris(), sc);
        if (ar.length) res.push({ id: 'bg-r-' + ar.length, niveau: 'warn', titre: 'Bris de glace à relire : ' + ar.length, ouvrir: function () { U.App.ongletsFenetres.patients = 'bris'; U.ouvrirFenetre('patients'); } });
      }
      if ((s().roles() || []).indexOf('ADMIN_GARDE') >= 0) {
        var t = Date.now() - 24 * 3600e3, rec = Object.keys(bris()).map(function (k) { return bris()[k]; }).filter(function (b) { return Date.parse(b.le) > t; });
        if (rec.length) res.push({ id: 'bg-g-' + rec.map(function (b) { return b.id; }).join(','), niveau: 'warn', titre: 'Bris de glace des dernières 24 heures : ' + rec.length, detail: rec.map(function (b) { return (b.nom || '') + ' — ' + U.libService(b.service) + ' — ' + heure(b.debut); }).join(' ; ') });
      }
    } catch (e) { /* module illisible */ }
    return res;
  }
  var ct = SIC.modules.obtenir('patients'), itf = ct.interface || {}, inf0 = itf.informations, p0 = itf.pastille;
  itf.vues = Object.assign({}, itf.vues, { bris: vue });
  itf.informations = function () { return (inf0 ? inf0() : []).concat(informations()); };
  itf.pastille = function () { var n = 0; try { n = informations().length; } catch (e) { n = 0; } return (p0 ? p0() : 0) + n; };
  var adm0 = itf.admin || {}, ong0 = adm0.onglets;
  itf.admin = Object.assign({}, adm0, { onglets: function (f) { return (ong0 ? ong0(f) : []).concat([['acces-clinique', 'Données cliniques', [panneau()]]]); } });
  ct.interface = itf;
  if (!ct.vues.onglets.some(function (o) { return o.code === 'bris'; })) ct.vues.onglets.push({ code: 'bris', libelle: 'Bris de glace', visible: function (config) { return AC.brisActive(config) || Object.keys(bris()).length > 0; } });
  U.accesClinique = { acces: acces, ok: ok, lisibleParBris: lisibleParBris, blocFiche: blocFiche, modaleBris: modaleBris, vue: vue, panneau: panneau };
})();
