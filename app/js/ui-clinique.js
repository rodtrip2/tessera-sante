// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Données cliniques du séjour — interface (phase 5, lot G, 15 novembre 2026). Logique : module-clinique.js.
 * Feuille de staff clinique (patients hospitalisés : codes CIM, motif, projet thérapeutique, dépendance AVQ), fenêtre
 * d'un séjour (feuille de staff, rappel du séjour précédent, notes cliniques), bouton dans la fiche patient. Limites
 * d'accès communes (patients présents, bris de glace : acces-clinique.js).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, K = SIC.clinique, AC = SIC.accesClinique, C = SIC.crypto;

  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function st() { try { return (s().ouvert('clinique') || s().detientCle('clinique')) && s().etatModule('clinique') || K.reduire([]); } catch (e) { return K.reduire([]); } }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function fiches() { return (s().etat && s().etat.patients) || {}; }
  function fr(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function nomP(f) { return [f.nom, f.prenom].filter(Boolean).join(' '); }
  function sejourEnCours(f) { var r = null; ((f && f.sejours) || []).forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  function dernierSejour(f) { var l = ((f && f.sejours) || []).slice().sort(function (a, b) { return String(a.entree || '').localeCompare(String(b.entree || '')); }); return sejourEnCours(f) || l[l.length - 1] || null; }
  function rolesDans(sv) { var RS = SIC.rolesServices, u = s().utilisateur; return RS && u && RS.aDesRoles(cfg(), u) ? RS.rolesDans(Object.assign({}, u, { services: (s().compteEffectif() || u).services }), cfg(), sv) : s().roles(); }
  function present(f) { var c = s().compteEffectif() || {}; return !!sejourEnCours(f) && ((c.services || []).indexOf(f.service) >= 0 || (c.roles || []).indexOf('ADMIN') >= 0); }
  /** Accès de l'agent aux données cliniques du patient : { ok, raison } (rôle lecteur réglé, patients présents, bris de glace). */
  function acces(f) {
    var roles = rolesDans(f.service), lect = SIC.modules.obtenir('clinique').droits.peut(roles, K.LECTURE, cfg());
    var bris = {}; try { bris = (s().etatModule('patients') || {}).bris || {}; } catch (e) { bris = {}; }
    return AC.acces({ config: cfg(), roles: roles, lecteur: lect, present: present(f), service: f.service, bris: bris, agent: s().utilisateur.id, patientId: f.id, maintenant: Date.now() });
  }
  function disponible() { return !!SIC.modules.obtenir('clinique') && K.fonctionActive(cfg()) && s().detientCle('clinique'); }
  function libCim(l) { return (l || []).map(function (x) { return x.code + (x.libelle ? ' ' + x.libelle : ''); }).join(' ; '); }
  function libDep(avq) { var n = K.score(avq); return n === null ? (Object.keys(avq || {}).length ? 'incomplète' : '') : n + ' / 24'; }

  // ------------------------------------------------------------ Fenêtre d'un séjour
  function modaleSejour(f, sejourId) {
    var a = acces(f);
    if (!a.ok) { U.toast('Données cliniques : accès restreint.'); return; }
    var sjs = (f.sejours || []).slice().sort(function (x, y) { return String(y.entree || '').localeCompare(String(x.entree || '')); });
    var sj = sjs.filter(function (x) { return x.id === sejourId; })[0] || dernierSejour(f);
    if (!sj) { U.toast('Aucun séjour pour ce patient.'); return; }
    var x = K.sejour(st(), f.id, sj.id), sf = x.staff || { cim: [], motif: '', projet: '', avq: {} }, prec = K.precedent(st(), f, sj.id);
    var ecrit = a.raison !== 'bris' && peut('CLINIQUE_STAFF') && !s().apercu, note = a.raison !== 'bris' && peut('CLINIQUE_NOTE') && !s().apercu;
    // Codes CIM : lignes code + libellé, saisie libre
    var zoneCim = h('div', { class: 'pile' }), lignes = [];
    function ligneCim(v) {
      var code = h('input', { type: 'text', maxlength: 12, class: 'champ-court', 'aria-label': 'Code CIM', value: v ? v.code : '', disabled: !ecrit, placeholder: 'F20.0' });
      var lib = h('input', { type: 'text', maxlength: 120, 'aria-label': 'Libellé', value: v ? v.libelle : '', disabled: !ecrit, placeholder: 'Libellé (facultatif)' });
      var l = { code: code, lib: lib }, el = h('div', { class: 'cl-cim' }, code, lib, ecrit ? h('button', { class: 'btn petit', type: 'button', title: 'Retirer', onclick: function () { lignes.splice(lignes.indexOf(l), 1); el.remove(); } }, '×') : null);
      lignes.push(l); zoneCim.appendChild(el);
    }
    (sf.cim.length ? sf.cim : (ecrit ? [null] : [])).forEach(ligneCim);
    var motif = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Motif d’hospitalisation', disabled: !ecrit }); motif.value = sf.motif || '';
    var projet = h('textarea', { rows: 4, maxlength: 4000, 'aria-label': 'Projet thérapeutique', disabled: !ecrit }); projet.value = sf.projet || '';
    var total = h('b'), sels = K.AVQ.map(function (v) {
      var sel = h('select', { 'aria-label': v.libelle, disabled: !ecrit }, [h('option', { value: '', text: '—' })].concat([1, 2, 3, 4].map(function (n) { return h('option', { value: String(n), text: n + ' — ' + K.COTES[n], selected: sf.avq[v.code] === n }); })));
      sel.addEventListener('change', majTotal);
      return { v: v, sel: sel };
    });
    function lireAvq() { var r = {}; sels.forEach(function (x) { if (x.sel.value) r[x.v.code] = +x.sel.value; }); return r; }
    function majTotal() { total.textContent = 'Score : ' + (libDep(lireAvq()) || '—'); }
    majTotal();
    var zoneNotes = h('div', { class: 'pile' });
    function dessinerNotes() {
      U.vider(zoneNotes);
      var nv = K.notesVisibles(K.sejour(st(), f.id, sj.id));
      if (!nv.length) zoneNotes.appendChild(h('p', { class: 'muted', text: 'Aucune note clinique pour ce séjour.' }));
      nv.forEach(function (n) {
        zoneNotes.appendChild(h('div', { class: 'cl-note' }, h('small', { class: 'muted', text: new Date(n.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' — ' + (n.nom || s().nomAuteur(n.par)) }), h('p', { class: 'en-texte', text: n.texte }),
          note && (n.par === s().utilisateur.id || s().roles().indexOf('CADRE') >= 0) ? h('button', { class: 'btn petit', type: 'button', onclick: async function () {
            var m = prompt('Motif du retrait (la note est masquée, jamais effacée) :');
            if (!m) return;
            try { await s().enregistrer('CLINIQUE_NOTE_RETRAIT', { patientId: f.id, sejour: sj.id, service: f.service, id: n.id, motif: m }); dessinerNotes(); } catch (e) { U.toast(e.message); }
          } }, 'Retirer') : null));
      });
    }
    dessinerNotes();
    var nouvelle = h('textarea', { rows: 3, maxlength: 4000, 'aria-label': 'Nouvelle note clinique' });
    U.modale('Données cliniques — ' + nomP(f), h('div', { class: 'pile' },
      a.raison === 'bris' ? h('p', { class: 'hs-paie', text: 'Lecture par bris de glace (tracée) : lecture seule.' }) : null,
      sjs.length > 1 ? h('label', { class: 'en-ligne' }, 'Séjour', h('select', { 'aria-label': 'Séjour', onchange: function (e) { var dl = e.target.closest('dialog'), v = e.target.value; if (dl) dl.close(); setTimeout(function () { modaleSejour(f, v); }, 50); } },
        sjs.map(function (y) { return h('option', { value: y.id, text: 'Entrée le ' + fr(y.entree) + (y.sortie ? ', sortie le ' + fr(y.sortie) : ' (en cours)') + (y.service ? ' — ' + U.libService(y.service) : ''), selected: y.id === sj.id }); }))) : h('p', { class: 'muted', text: 'Séjour : entrée le ' + fr(sj.entree) + (sj.sortie ? ', sortie le ' + fr(sj.sortie) : ' (en cours)') }),
      prec ? h('div', { class: 'cl-precedent', role: 'note' }, h('b', { text: 'Séjour précédent (entrée le ' + fr(prec.sejour.entree) + ') — pour référence' }),
        h('p', { text: 'Codes CIM : ' + (libCim(prec.staff.cim) || '—') }), h('p', { text: 'Dépendance : ' + (libDep(prec.staff.avq) || '—') + (Object.keys(prec.staff.avq || {}).length ? ' (' + K.AVQ.map(function (v) { return v.libelle + ' ' + (prec.staff.avq[v.code] || '—'); }).join(', ') + ')' : '') })) : null,
      h('h3', { text: 'Feuille de staff' }),
      h('div', {}, h('b', { text: 'Codes CIM (saisie libre)' }), zoneCim, ecrit ? h('button', { class: 'btn petit', type: 'button', onclick: function () { ligneCim(null); } }, '+ Code') : null),
      h('label', {}, 'Motif d’hospitalisation', motif),
      h('label', {}, 'Projet thérapeutique', projet),
      h('fieldset', { class: 'hs-horaire' }, h('legend', { text: 'Dépendance — activités de la vie quotidienne (RIM-P)' }), h('div', { class: 'grille-2' }, sels.map(function (x) { return h('label', {}, x.v.libelle, x.sel); })), total),
      x.staff ? h('small', { class: 'muted', text: 'Dernière mise à jour le ' + new Date(x.staff.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' par ' + s().nomAuteur(x.staff.par) + (x.historique.length ? ' (' + x.historique.length + ' version(s) précédente(s) gardée(s))' : '') + '.' }) : null,
      ecrit ? h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          await s().enregistrer('CLINIQUE_STAFF', { patientId: f.id, sejour: sj.id, service: f.service || sj.service || '', cim: lignes.map(function (l) { return { code: l.code.value, libelle: l.lib.value }; }).filter(function (c) { return c.code.trim() || c.libelle.trim(); }), motif: motif.value, projet: projet.value, avq: lireAvq() });
          U.toast('Feuille de staff enregistrée.');
        } catch (e) { U.toast(e.message); }
      } }, 'Enregistrer la feuille de staff')) : null,
      h('h3', { text: 'Notes cliniques' }), zoneNotes,
      note ? h('div', { class: 'pile' }, nouvelle, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: async function () {
        try { await s().enregistrer('CLINIQUE_NOTE', { patientId: f.id, sejour: sj.id, service: f.service || '', id: 'CN-' + C.hex(C.aleatoire(6)), texte: nouvelle.value, nom: (s().compteEffectif() || {}).nom || '' }); nouvelle.value = ''; dessinerNotes(); } catch (e) { U.toast(e.message); }
      } }, 'Ajouter la note'))) : null,
      h('small', { class: 'muted', text: 'Le dossier patient informatisé (DPI) reste la référence clinique.' })),
      [{ texte: 'Fermer' }]);
  }

  // ------------------------------------------------------------ Feuille de staff clinique
  function vueStaff() {
    var mes = U.App.service !== '*' ? [U.App.service] : s().mesServices();
    var l = Object.keys(fiches()).map(function (k) { return fiches()[k]; }).filter(function (f) { return f && !f.fusionneDans && sejourEnCours(f) && mes.indexOf(f.service) >= 0; })
      .sort(function (a, b) { return nomP(a).localeCompare(nomP(b), 'fr'); });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Feuille de staff clinique' + (U.App.service !== '*' ? ' — ' + U.libService(U.App.service) : '') })),
      !K.fonctionActive(cfg()) ? h('p', { class: 'muted', text: 'Fonction désactivée par l’établissement (onglet « Validations »).' }) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'cl-staff' }, h('thead', {}, h('tr', {}, ['Patient', 'Entrée', 'Codes CIM', 'Motif d’hospitalisation', 'Projet thérapeutique', 'Dépendance', 'Notes', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (f) {
          var sj = sejourEnCours(f), a = acces(f), x = K.sejour(st(), f.id, sj.id), sf = x.staff;
          if (!a.ok) return h('tr', {}, h('td', { text: nomP(f) }), h('td', { text: fr(sj.entree) }), h('td', { colspan: 5, class: 'muted', text: 'Accès restreint' }), h('td'));
          return h('tr', {}, h('td', { text: nomP(f) }), h('td', { text: fr(sj.entree) }), h('td', { text: sf ? libCim(sf.cim) : '' }), h('td', { class: 'cl-court', text: sf ? sf.motif : '' }), h('td', { class: 'cl-court', text: sf ? sf.projet : '' }),
            h('td', { text: sf ? libDep(sf.avq) : '' }), h('td', { text: String(K.notesVisibles(x).length || '') }),
            h('td', { class: 'actions-ligne' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleSejour(f, sj.id); } }, 'Ouvrir')));
        })))),
      l.length ? null : h('p', { class: 'muted', text: 'Aucun patient hospitalisé dans ces services.' }),
      h('small', { class: 'muted', text: 'Données de santé : à n’utiliser qu’après les avis prévus. Le dossier patient informatisé (DPI) reste la référence clinique.' }));
  }

  // ------------------------------------------------------------ Fiche patient
  /** Bouton ou mention pour la fiche patient (onglet « Données ajoutées »). */
  function blocFiche(f, apres, options) {
    if (!f || !f.id || !disponible() || !(f.sejours || []).length) return null;
    var a = acces(f);
    if (a.ok) return h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: function () { modaleSejour(f, null); } }, 'Données cliniques du séjour…'), a.raison === 'bris' ? h('small', { class: 'muted', text: 'Bris de glace en cours (lecture seule).' }) : null);
    if (options && options.sansRestreint) return null;   // accès restreint déjà signalé (données ajoutées cliniques), un seul bris de glace
    var peutB = AC.peutBriser(cfg(), rolesDans(f.service), f.service) && !s().apercu && U.accesClinique && U.accesClinique.modaleBris;
    return h('div', { class: 'ac-restreint', role: 'note' }, h('b', { text: 'Données cliniques du séjour : accès restreint' }), h('span', { text: a.raison === 'absent' ? ' (patient non présent dans vos services). ' : ' (votre rôle n’y a pas accès). ' }),
      peutB ? h('button', { class: 'btn petit danger', type: 'button', onclick: function () { U.accesClinique.modaleBris(f, apres); } }, 'Bris de glace…') : null);
  }

  SIC.modules.completerInterface('clinique', {
    vues: { staff: vueStaff },
    // Export du droit d'accès du patient : feuilles de staff et notes cliniques de ses séjours (notes retirées comprises)
    droitAcces: function (etat, p) {
      var res = [];
      Object.keys((etat && etat.sejours) || {}).map(function (k) { return etat.sejours[k]; }).filter(function (x) { return x.patientId === p.id; }).forEach(function (x) {
        var sj = (p.sejours || []).filter(function (y) { return y.id === x.sejour; })[0], ent = sj ? fr(sj.entree) : x.sejour;
        if (x.staff) res.push({ libelle: 'Feuille de staff du séjour du ' + ent, cellules: [ent, libCim(x.staff.cim), x.staff.motif, x.staff.projet, libDep(x.staff.avq)], entete: ['Séjour', 'Codes CIM', 'Motif', 'Projet thérapeutique', 'Dépendance'] });
        x.notes.forEach(function (n) { res.push({ libelle: 'Note clinique du ' + fr(n.le), cellules: [ent, fr(n.le), n.texte + (n.retiree ? ' (retirée : ' + n.retiree.motif + ')' : '')], entete: ['Séjour', 'Date', 'Note'] }); });
      });
      return res;
    },
    journal: { resume: function (e) { var d = e.data || {}, f = fiches()[d.patientId]; return (f ? nomP(f) : d.patientId) + ' — ' + ({ CLINIQUE_STAFF: 'feuille de staff', CLINIQUE_NOTE: 'note clinique', CLINIQUE_NOTE_RETRAIT: 'note retirée : ' + (d.motif || '') }[e.type] || e.type); },
      action: function (e) { return { CLINIQUE_STAFF: 'Feuille de staff clinique', CLINIQUE_NOTE: 'Note clinique', CLINIQUE_NOTE_RETRAIT: 'Note clinique retirée' }[e.type] || e.type; },
      libelleType: function (t) { return { CLINIQUE_STAFF: 'Feuille de staff clinique', CLINIQUE_NOTE: 'Note clinique', CLINIQUE_NOTE_RETRAIT: 'Note clinique retirée' }[t] || t; }, effetAnnulation: function () { return 'La saisie est retirée.'; } }
  });
  U.clinique = { modaleSejour: modaleSejour, blocFiche: blocFiche, acces: acces };
})();
