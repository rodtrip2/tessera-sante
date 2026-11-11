// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Vue d'ensemble — interface (0.19, plan relu par le porteur le 9 novembre 2026). Logique : module-vue.js.
 * Un onglet par vue de l'agent, puis « Instantanés ». Chaque case modifiable s'édite sur place : clic, saisie, Entrée
 * (ou une petite fenêtre pour les notes, check-lists, périodes, entretiens). L'enregistrement se fait dans le module
 * propriétaire de la donnée (fiche patient, Suivi médical, données ajoutées), avec ses droits.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, V = SIC.vue, CH = SIC.champs, CO = SIC.couleurs, F = SIC.formules, MED = SIC.medecins, C = SIC.crypto;
  var contrat = SIC.modules.obtenir('vue');

  function session() { return U.App.session; }
  function cfg() { return U.config(); }
  function compte() { return session().compteEffectif(); }
  function roles() { return session().roles(); }
  function estAdmin() { return roles().indexOf('ADMIN') >= 0; }
  function peut(t) { return session().peut(t) && !session().apercu; }
  function servicesAffiches() { return U.App.service && U.App.service !== '*' ? [U.App.service] : U.services().map(function (x) { return x.code; }); }
  function idCourt(p) { return (p || 'v') + C.hex(C.aleatoire(4)); }

  // ------------------------------------------------------------ Onglets : un par vue (décision du porteur)
  function mesVues() { try { return session() && session().etat ? V.vuesPour(cfg(), compte()) : []; } catch (e) { return []; } }
  Object.defineProperty(contrat.vues, 'onglets', { configurable: true, get: function () {
    var l = mesVues().map(function (v) { return { code: 'v:' + v.id, libelle: v.nom }; });
    l.push({ code: 'plan', libelle: 'Plan du service' });   // chambres et lits (0.29.1)
    l.push({ code: 'instantanes', libelle: 'Instantanés' });
    return l;
  } });

  // ------------------------------------------------------------ Contexte de lecture
  function contexte() {
    var s = session(), etat = s.etat || {}, st = s.etatModule('suivi'), ag = s.etatModule('agenda');
    var fiches = etat.patients || {}, maintenant = Date.now();
    var isocont = s.detientCle && s.detientCle('isocont') && SIC.model && SIC.model.listeMesures;
    var hosp = Object.keys(fiches).map(function (k) { return fiches[k]; }).filter(function (p) { var r = null; (p.sejours || []).forEach(function (x) { if (!x.sortie) r = x; }); return !!r; });
    return { config: cfg(), maintenant: maintenant, roles: roles(), fiches: fiches, suivi: st || null, suiviModule: SIC.suivi, agenda: ag || null, agendaModule: SIC.agenda,
      valeurs: s.valeurs(), chambresTravaux: U.chambresTravaux ? U.chambresTravaux(U.services().map(function (v) { return v.code; })) : [], lisible: U.champs.lisible, comptes: s.comptes || [], libService: U.libService, services: servicesAffiches(), hospitalises: hosp,
      libRole: function (r) { return SIC.modules.obtenir('isocont').droits.libRole(cfg(), r); },
      joursRecents: SIC.listePatients ? SIC.listePatients.options(cfg()).joursRecents : 7,
      mesuresEnCours: isocont ? function (pid) {
        return SIC.model.listeMesures(U.st()).filter(function (m) { return m.patientId === pid && typeof m.fin !== 'number'; }).map(function (m) { return m.type + ' depuis ' + U.duree((maintenant - m.debut) / 36e5); }).join(', ');
      } : null };
  }
  /** Colonnes de la vue que l'agent peut voir : rôles de la colonne et clés détenues ; [{ col, vcol }]. */
  function colonnesVisibles(v, cat) {
    var rs = roles();
    return v.colonnes.map(function (vc) { return { col: V.colonneDe(cat, vc.code), vcol: vc }; }).filter(function (x) {
      return x.col && (estAdmin() || !x.vcol.roles.length || x.vcol.roles.some(function (r) { return rs.indexOf(r) >= 0; }));
    });
  }

  // ------------------------------------------------------------ Modification sur place
  function sejourEnCours(p) { var r = null; ((p && p.sejours) || []).forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  /** La case est-elle modifiable par l'agent ? (droits du module propriétaire) */
  function modifiable(col, l) {
    var e = col.edition; if (!e || session().apercu) return false;
    switch (e.type) {
      case 'champ': return U.champs.modifiable(col.champ);
      case 'medecin': case 'psychologue': case 'texte': case 'suiviAS': return peut('PATIENT');
      case 'sejour': case 'sortiePrevue': return peut('SEJOUR') && !!sejourEnCours(l.p);
      case 'mode': return peut('MODE_HOSPI') && !!(U.fichePatient && U.fichePatient.mode);
      case 'suivi': return peut('SUIVI');
      case 'initiales': return MED.peutGerer ? MED.peutGerer(cfg(), roles()) : estAdmin();
    }
    return false;
  }
  async function apresSaisie(msg) { U.toast(msg || 'Enregistré.'); }
  /** Édition sur place d'une valeur simple : champ dans la case, Entrée pour enregistrer, Échap pour annuler. */
  function editerDansCase(td, col, l, valeur, enregistrer) {
    U.vider(td);
    var w;
    if (col.edition.type === 'psychologue') {
      w = U.psychologues.champ({ valeur: l.p.psychologue, id: l.p.psychologueId, service: l.service, libelle: col.libelle, vide: '— Aucun —' });
      w = { el: w.select, lire: function () { return { nom: this.b.nom(), id: this.b.medecinId() }; }, b: w };
    } else if (col.edition.type === 'medecin') {
      w = U.medecins.champ({ valeur: l.p[col.edition.cle], id: l.p[col.edition.cle + 'Id'], service: l.service, libelle: col.libelle });
      w = { el: w.select, lire: function () { return { nom: this.b.nom(), id: this.b.medecinId() }; }, b: w };
    } else if (col.champ) w = U.champs.saisie(col.champ, valeur);
    else w = { el: h('input', { type: 'text', maxlength: 80, value: valeur || '' }), lire: function () { return w.el.value.trim(); } };
    var ok = h('button', { class: 'btn petit primaire', type: 'button', title: 'Enregistrer (Entrée)' }, '✓');
    var non = h('button', { class: 'btn petit', type: 'button', title: 'Annuler (Échap)' }, '✕');
    var zone = h('div', { class: 'edition-case' }, w.el, ok, non);
    td.appendChild(zone);
    var champ = w.el.querySelector ? (w.el.matches && w.el.matches('input, select') ? w.el : w.el.querySelector('input, select')) : w.el;
    if (champ && champ.focus) setTimeout(function () { champ.focus(); }, 20);
    async function valider() {
      ok.disabled = true;
      try { await enregistrer(w.lire()); await apresSaisie(); } catch (e) { alert(e.message); ok.disabled = false; return; }
      U.rendreContenu();
    }
    ok.addEventListener('click', valider);
    non.addEventListener('click', function () { U.rendreContenu(); });
    zone.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); valider(); } if (ev.key === 'Escape') { ev.preventDefault(); U.rendreContenu(); } });
  }
  /** Ouvre l'édition de la case selon le type de donnée. */
  function editer(td, col, l, cell) {
    var e = col.edition, s = session(), p = l.p;
    if (e.type === 'champ') {
      var c = col.champ, ent = c.entite, id = ent === 'patient' ? p.id : ent === 'medecin' ? l.m.id : l.a.id;
      if (CH.CUMULATIFS[c.type] || c.type === 'dateFenetre' || c.type === 'choixMultiple') return modaleChamp(c, ent, id, titreLigne(l));
      return editerDansCase(td, col, l, cell.v, function (v) { return U.champs.enregistrer(c, ent, id, { valeur: v }); });
    }
    if (e.type === 'medecin') return editerDansCase(td, col, l, null, async function (v) {
      var avant = MED.resoudre(cfg(), p[e.cle], p[e.cle + 'Id']);
      if (avant && v.nom && avant !== v.nom && !confirm(titreLigne(l) + ' a déjà un ' + col.libelle.toLowerCase() + ' (' + avant + '). Le remplacer par ' + v.nom + ' ?')) throw new Error('Changement abandonné.');
      var d = { patientId: p.id }; d[e.cle] = v.nom || ''; d[e.cle + 'Id'] = v.id || null;
      return s.enregistrer('PATIENT', d);
    });
    if (e.type === 'psychologue') return editerDansCase(td, col, l, null, async function (v) {
      var avant = l.p.psychologue || l.p.psychologueId ? SIC.psychologues.resoudre(cfg(), l.p.psychologue, l.p.psychologueId) : '';
      if (avant && v.nom && avant !== v.nom && !confirm(titreLigne(l) + ' a déjà un psychologue référent (' + avant + '). Le remplacer par ' + v.nom + ' ?')) throw new Error('Changement abandonné.');
      return s.enregistrer('PATIENT', { patientId: p.id, psychologue: v.nom || '', psychologueId: v.id || '' });
    });
    if (e.type === 'texte') return editerDansCase(td, col, l, p[e.cle], function (v) { var d = { patientId: p.id }; d[e.cle] = v; return s.enregistrer('PATIENT', d); });
    if (e.type === 'sejour') { var sj = sejourEnCours(p); return editerDansCase(td, col, l, sj[e.cle], function (v) { var d = { patientId: p.id, sejourId: sj.id }; d[e.cle] = v; return s.enregistrer('SEJOUR', d); }); }
    if (e.type === 'mode') return U.fichePatient.mode(p);
    if (e.type === 'suiviAS') return modaleSuiviAS(l);
    if (e.type === 'sortiePrevue') return modaleSortie(l);
    if (e.type === 'suivi') return modaleSuivi(l, e.quoi);
    if (e.type === 'initiales') return editerDansCase(td, col, l, l.m.initiales || '', async function (v) {
      var brut = cfg().medecins && !Array.isArray(cfg().medecins) ? cfg().medecins : { liste: [] };
      var listeM = MED.liste(cfg()).map(function (m) { return m.id === l.m.id ? Object.assign({}, m, { initiales: v }) : m; });
      return U.enregistrerConfig([['medecins', Object.assign({}, brut, { liste: listeM })]]);
    });
  }
  function titreLigne(l) { return l.p ? ((l.p.nom || '?') + ' ' + (l.p.prenom || '')).trim() : l.m ? l.m.nom : l.a ? l.a.nom : ''; }
  function modaleChamp(c, ent, id, titre) {
    function corps() {
      var v = U.champs.valeurDe(c, ent, id), ok = U.champs.modifiable(c);
      var opts = { peut: ok, enregistrerOp: function (op) { return U.champs.enregistrer(c, ent, id, { op: op }); }, apres: function () { U.vider(zone).appendChild(corps()); } };
      if (c.type === 'notes') return U.champs.notes(c, v, opts);
      if (c.type === 'checklist') return U.champs.checklist(c, v, opts);
      var w = U.champs.saisie(c, v, { disabled: !ok }); lire = w.lire; return w.el;
    }
    var lire = null, zone = h('div', { class: 'pile' });
    zone.appendChild(corps());
    var cumul = CH.CUMULATIFS[c.type];
    U.modale(c.libelle + ' — ' + titre, zone, cumul ? [{ texte: 'Fermer' }] : [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () { await U.champs.enregistrer(c, ent, id, { valeur: lire() }); U.toast('Enregistré.'); } }]);
  }
  function modaleSuiviAS(l) {
    var a = l.p.suiviAS || {}, sel = h('select', {}, [['', 'Non renseigné'], ['oui', 'Oui'], ['non', 'Non']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (a.suivi === true ? 'oui' : a.suivi === false ? 'non' : '') === x[0] }); }));
    var nom = h('input', { type: 'text', maxlength: 80, value: a.nom || '', placeholder: 'Nom (facultatif)' });
    U.modale('Suivi par l’assistant(e) social(e) — ' + titreLigne(l), h('div', { class: 'grille-2' }, h('label', {}, 'Suivi', sel), h('label', {}, 'Assistant(e) social(e)', nom)), [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      await session().enregistrer('PATIENT', { patientId: l.p.id, suiviAS: sel.value ? { suivi: sel.value === 'oui', nom: nom.value.trim() } : null }); U.toast('Enregistré.');
    } }]);
  }
  function modaleSortie(l) { U.sorties.modale(l.p, function () { U.rendreContenu(); }); }
  function modaleSuivi(l, quoi) {
    var S = SIC.suivi, date = h('input', { type: 'date', value: S.jourISO(Date.now()), max: S.jourISO(Date.now()) });
    var m = U.medecins.champ({ valeur: l.p.medecin1, id: l.p.medecin1Id, service: l.service, libelle: 'médecin', vide: '— Choisir —' });
    var qs = h('select', {}, Object.keys(S.QUOI).map(function (k) { return h('option', { value: k, text: S.QUOI[k], selected: k === quoi }); }));
    U.modale((quoi === 'contrat' ? 'Réévaluation du contrat de soins' : 'Entretien médical') + ' — ' + titreLigne(l), h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'Médecin', m.select), h('label', {}, 'Saisie', qs)),
      h('small', { class: 'muted', text: 'Seule la date est gardée (aucun contenu), comme dans le module Suivi médical.' })), [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!m.nom()) throw new Error('Choisissez le médecin.');
      await session().enregistrer('SUIVI', { id: 'SV' + C.hex(C.aleatoire(5)), patient: l.p.id, service: S.serviceDe(l.p), date: date.value, medecin: m.nom(), medecinId: m.medecinId(), quoi: qs.value });
      U.toast('Enregistré.');
    } }]);
  }

  // ------------------------------------------------------------ Tableau d'une vue
  /** Largeur réglée d'une colonne (décision du porteur du 9 novembre 2026) : appliquée à l'en-tête et aux cases. */
  function appliquerLargeur(el, px) {
    if (!px) return el;
    el.style.width = px + 'px'; el.style.minWidth = px + 'px'; el.style.maxWidth = px + 'px';
    el.classList.add('largeur-reglee');
    return el;
  }
  /**
   * Poignée de redimensionnement dans l'en-tête (cadre et administrateur qui règlent la vue) : glisser pour régler la
   * largeur, double-clic pour revenir à la largeur automatique ; enregistrée avec la vue.
   */
  function poignee(th, v, vc) {
    var p = h('span', { class: 'poignee-largeur', title: 'Glisser pour régler la largeur ; double-clic : largeur automatique', 'aria-hidden': 'true' });
    var x0 = 0, l0 = 0, actif = false;
    function bouger(ev) { if (!actif) return; appliquerLargeur(th, Math.max(40, Math.min(800, Math.round(l0 + ev.clientX - x0)))); }
    async function finir() {
      if (!actif) return; actif = false;
      document.removeEventListener('pointermove', bouger); document.removeEventListener('pointerup', finir);
      document.body.classList.remove('redimension');
      await enregistrerLargeur(v, vc.code, Math.round(th.getBoundingClientRect().width));
    }
    p.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ev.stopPropagation(); actif = true; x0 = ev.clientX; l0 = th.getBoundingClientRect().width; document.body.classList.add('redimension'); document.addEventListener('pointermove', bouger); document.addEventListener('pointerup', finir); });
    p.addEventListener('click', function (ev) { ev.stopPropagation(); });
    p.addEventListener('dblclick', function (ev) { ev.stopPropagation(); enregistrerLargeur(v, vc.code, 0); });
    return p;
  }
  async function enregistrerLargeur(v, code, px) {
    var l = vuesBrutes(), x = l.filter(function (y) { return y.id === v.id; })[0];
    if (!x) return;
    x.colonnes = (x.colonnes || []).map(function (c) { c = typeof c === 'string' ? { code: c } : c; if (c.code === code) { if (px) c.largeur = V.largeur(px); else delete c.largeur; } return c; });
    try { await U.enregistrerConfig([['vuesEnsemble', Object.assign({}, cfg().vuesEnsemble || {}, { vues: l })]]); } catch (e) { alert(e.message); }
    U.rendreContenu();
  }
  function caseCouleur(td, coul) {
    var cls = U.champs.classeCouleur(coul);
    if (cls) cls.split(' ').forEach(function (k) { td.classList.add(k); });
    if (coul) { td.setAttribute('data-couleur', coul.couleur); if (coul.libelle) td.title = (td.title ? td.title + ' — ' : '') + coul.libelle; }
  }
  function contenuCase(cell, col) {
    var marque = cell.couleur ? h('span', { class: 'marque-couleur' + (cell.couleur.rendu === 'pastille' ? ' pastille-couleur cpv-' + cell.couleur.couleur : ''), 'data-symbole': cell.couleur.symbole, 'aria-hidden': 'true' }) : null;
    if (col.champ && col.champ.type === 'notes' && Array.isArray(cell.v)) {
      var ns = CH.notes(col.champ, cell.v);
      return h('span', {}, marque, ns.length ? h('span', { class: 'notes-case' }, ns.slice(0, 2).map(function (n) { return h('span', { class: 'note-case imp-' + n.importance, text: n.texte }); }), ns.length > 2 ? h('small', { class: 'muted', text: ' +' + (ns.length - 2) }) : null) : h('span', { class: 'muted', text: '—' }));
    }
    return h('span', {}, marque, h('span', { text: cell.lib }));
  }
  function legendeVue(cols) {
    var items = [], vus = {};
    cols.forEach(function (x) {
      var reg = CO.reglages(cfg(), x.col.reglage || ('vue.' + x.col.code), servicesAffiches().length === 1 ? servicesAffiches()[0] : null, x.col.defaut);
      CO.legende(reg.regles, x.vcol.regles).forEach(function (l) { var k = l.couleur + l.libelle; if (!vus[k]) { vus[k] = 1; items.push({ couleur: l.couleur, symbole: l.symbole, libelle: x.col.libelle + ' : ' + l.libelle }); } });
    });
    return U.champs.legende(items);
  }
  function tableau(v, groupes, cols, ctx, options) {
    var o = options || {}, cat = cols.map(function (x) { return x.col; }), reglable = !o.impression && (estAdmin() || roles().indexOf('CADRE') >= 0);
    var largeurs = !o.impression && V.peutRegler(v, compte());
    var thead = h('thead', {}, h('tr', {}, cols.map(function (x) {
      var lib = x.vcol.libelle || x.col.libelle;
      var th = h('th', { class: largeurs ? 'redimensionnable' : null }, lib, reglable && !o.impression ? h('button', { class: 'btn lien reglage-donnee', type: 'button', title: 'Couleurs et délai de la donnée « ' + lib + ' »', 'aria-label': 'Réglages de la donnée ' + lib, onclick: function () { reglerDonnee(x.col); } }, '⚙') : null);
      appliquerLargeur(th, x.vcol.largeur);
      if (largeurs) th.appendChild(poignee(th, v, x.vcol));
      return th;
    })));
    var corps = [];
    groupes.forEach(function (g) {
      var tb = h('tbody', { class: 'groupe-vue' });
      if (g.titre || groupes.length > 1) tb.appendChild(h('tr', { class: 'titre-groupe' }, h('th', { colspan: cols.length }, (g.titre || 'Lignes') + ' (' + g.lignes.length + ')')));
      g.lignes.forEach(function (l) {
        var tr = h('tr');
        cols.forEach(function (x) {
          var cell = V.cellule(x.col, l, ctx, x.vcol, cat), td = appliquerLargeur(h('td', { class: 'case-vue' + (x.col.code === 'patient' || x.col.code === 'nom' ? ' patient' : '') }), x.vcol.largeur);
          if (cell.erreur) td.title = cell.erreur;
          if (cell.titre && cell.titre !== cell.lib) td.title = cell.titre;
          td.appendChild(contenuCase(cell, x.col));
          // Nom d'un agent ou d'un médecin : ouvre sa fiche (données ajoutées), sans changer de fenêtre
          if (!o.impression && x.col.code === 'nom' && (l.a || l.m)) {
            var lien = h('button', { class: 'btn lien', type: 'button', title: 'Ouvrir la fiche', text: cell.lib });
            lien.addEventListener('click', function (ev) { ev.stopPropagation(); if (l.a) U.champs.ficheAgent(l.a); else U.champs.ficheMedecin(l.m); });
            U.vider(td).appendChild(lien);
          }
          // Nom d'un patient : ouvre sa fiche (Patients, avec ses séjours), sans quitter la Vue d'ensemble (0.28.0)
          if (!o.impression && x.col.code === 'patient' && l.p && U.fichePatient && !modifiable(x.col, l)) {
            var lienP = h('button', { class: 'btn lien', type: 'button', title: 'Ouvrir la fiche du patient', text: cell.lib });
            lienP.addEventListener('click', function (ev) {
              ev.stopPropagation();
              var s0 = U.App.session, ep = null;
              try { ep = s0.detientCle('patients') ? s0.etatModule('patients') : null; } catch (e) { ep = null; }
              var full = ((U.st() && U.st().patients) || {})[l.p.id] || ((ep && ep.patients) || {})[l.p.id] || l.p;
              U.fichePatient.modale(full);
            });
            U.vider(td).appendChild(lienP);
          }
          caseCouleur(td, cell.couleur);
          if (!o.impression && modifiable(x.col, l)) {
            td.classList.add('modifiable'); td.tabIndex = 0;
            td.title = (td.title ? td.title + ' — ' : '') + 'Cliquer pour modifier';
            var ouvrir = function (ev) { if (td.querySelector('.edition-case') || (ev.target.closest && ev.target.closest('button, input, select'))) return; editer(td, x.col, l, cell); };
            td.addEventListener('click', ouvrir);
            td.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target === td) { ev.preventDefault(); ouvrir(ev); } });
          }
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      if (!g.lignes.length) tb.appendChild(h('tr', {}, h('td', { colspan: cols.length, class: 'muted', text: 'Aucune ligne.' })));
      corps.push(tb);
    });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table-vue' }, thead, corps));
  }
  function bandeauSynthese(items) {
    if (!items.length) return null;
    return h('div', { class: 'synthese-vue' }, items.map(function (s) { return h('div', { class: 'indicateur' + (s.alerte ? ' bad' : '') }, h('small', { class: 'muted', text: s.libelle }), h('b', { text: s.valeur }), s.detail ? h('small', { class: 'muted', text: s.detail }) : null); }));
  }
  /** Préparation de la feuille (décision 20) : retenue sur le poste pour la vue, jusqu'à la clôture. */
  function cleePrep(v) { return 'sic-vue-prep:' + v.id; }
  function preparation(v) { try { return localStorage.getItem(cleePrep(v)) || ''; } catch (e) { return ''; } }
  function vueTableau(id) {
    var v = V.vueDe(cfg(), id);
    if (!v || !mesVues().some(function (x) { return x.id === id; })) return h('div', { class: 'panneau vide', text: 'Cette vue n’existe plus ou ne vous est pas ouverte.' });
    var ctx = contexte(), cat = V.catalogue(v.lignes, ctx), cols = colonnesVisibles(v, cat), ls = V.lignes(v, ctx), groupes = V.ranger(v, ls, cat, ctx, cols.map(function (x) { return x.col; }));
    var prep = preparation(v), c = compte();
    var barre = h('div', { class: 'actions gauche barre-vue' },
      h('h2', { text: v.nom }), h('span', { class: 'muted', text: (v.services.length ? v.services.map(U.libService).join(', ') : 'Établissement') + ' — ' + V.LIGNES[v.lignes].toLowerCase() + ' : ' + ls.length }),
      h('span', { class: 'espace' }),
      V.peutClore(v, c) && !prep ? h('button', { class: 'btn', type: 'button', title: 'Préparer la feuille du jour : la compléter (pendant le staff), puis la clore', onclick: function () { try { localStorage.setItem(cleePrep(v), V.jourISO(Date.now())); } catch (e) { /* */ } U.rendreContenu(); } }, 'Préparer la feuille') : null,
      V.peutClore(v, c) ? h('button', { class: 'btn' + (prep ? ' primaire' : ''), type: 'button', onclick: function () { clore(v); } }, 'Clore (instantané)') : null,
      h('button', { class: 'btn', type: 'button', onclick: function () { imprimerVue(v); } }, 'Imprimer'),
      h('button', { class: 'btn', type: 'button', onclick: function () { exporterVue(v); } }, 'Exporter'),
      V.peutRegler(v, c) ? h('button', { class: 'btn', type: 'button', onclick: function () { modaleVue(v); } }, 'Régler la vue') : null,
      estAdmin() || c.roles.indexOf('CADRE') >= 0 ? h('button', { class: 'btn', type: 'button', title: 'Nouvelle vue pour vos services', onclick: function () { modaleVue(null); } }, '+ Vue') : null);
    return h('div', { class: 'pile vue-ensemble' }, barre,
      prep ? h('div', { class: 'alerte', text: 'Feuille du ' + U.fmtJour(prep) + ' en préparation : complétez les cases (elles sont enregistrées aussitôt dans Tessera), puis « Clore (instantané) » pour la garder telle quelle.' }) : null,
      bandeauSynthese(V.synthese(v, ls, ctx)), tableau(v, groupes, cols, ctx), legendeVue(cols),
      h('small', { class: 'muted', text: 'Cases modifiables : cliquez (ou Entrée), puis Entrée pour enregistrer, Échap pour annuler. Chaque modification est enregistrée dans le module de la donnée, avec son auteur et sa date.' }));
  }

  // ------------------------------------------------------------ Impression, export
  function documentVue(titre, sousTitre, contenu) {
    var d = new Date();
    return h('article', { class: 'doc-suivi doc-vue' },
      h('header', {}, h('div', {}, h('h1', { text: titre }), h('p', { text: sousTitre + (U.etablissement() ? ' — ' + U.etablissement() : '') })),
        h('p', { class: 'droite', text: 'Imprimé le ' + d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '\npar ' + compte().nom })),
      h('p', { class: 'confidentiel', text: 'DOCUMENT CONFIDENTIEL — données personnelles de santé. Ne pas laisser sans surveillance ; détruire après usage.' }),
      contenu, h('footer', {}, h('span', { text: 'Tessera Santé — Vue d’ensemble' })));
  }
  function imprimerVue(v) {
    var ctx = contexte(), cat = V.catalogue(v.lignes, ctx), cols = colonnesVisibles(v, cat), ls = V.lignes(v, ctx), groupes = V.ranger(v, ls, cat, ctx, cols.map(function (x) { return x.col; }));
    U.imprimer(documentVue(v.nom, v.services.length ? v.services.map(U.libService).join(', ') : servicesAffiches().map(U.libService).join(', '),
      h('div', {}, bandeauSynthese(V.synthese(v, ls, ctx)), tableau(v, groupes, cols, ctx, { impression: true }), legendeVue(cols))));
  }
  function exporterVue(v) {
    var ctx = contexte(), cat = V.catalogue(v.lignes, ctx), cols = colonnesVisibles(v, cat), ls = V.lignes(v, ctx), groupes = V.ranger(v, ls, cat, ctx, cols.map(function (x) { return x.col; }));
    var lignes = [[v.nom + ' — ' + U.date(Date.now())], [], ['Groupe'].concat(cols.map(function (x) { return x.vcol.libelle || x.col.libelle; }))];
    groupes.forEach(function (g) { g.lignes.forEach(function (l) { lignes.push([g.titre || ''].concat(cols.map(function (x) { var c = V.cellule(x.col, l, ctx, x.vcol, cols.map(function (y) { return y.col; })); return c.lib === '—' ? '' : c.lib; }))); }); });
    // CSV pour un tableur (séparateur « ; », guillemets doublés, marque d'ordre des octets pour les accents)
    var csv = '\ufeff' + lignes.map(function (l) { return l.map(function (x) { var t = String(x === undefined || x === null ? '' : x); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(';'); }).join('\r\n');
    U.exporter('vue-ensemble', 'vue-' + v.id + '-' + V.jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: servicesAffiches().length === 1 ? servicesAffiches()[0] : undefined });
  }

  // ------------------------------------------------------------ Instantanés
  async function clore(v) {
    var ctx = contexte(), cat = V.catalogue(v.lignes, ctx), cols = colonnesVisibles(v, cat), ls = V.lignes(v, ctx), groupes = V.ranger(v, ls, cat, ctx, cols.map(function (x) { return x.col; }));
    var id = 'I' + C.hex(C.aleatoire(6)), prep = V.preparerInstantane(v, groupes, cols, ctx, id);
    var detenus = prep.parts.filter(function (p) { return p.journal === 'vue' || p.journal === 'patients' || (session().detientCle && session().detientCle(p.journal)) || p.journal.indexOf('d-') === 0; });
    if (!confirm('Clore la feuille « ' + v.nom + ' » du ' + U.date(Date.now()) + ' ?\n\nL’instantané garde les ' + ls.length + ' ligne(s) et les ' + cols.length + ' colonne(s) telles qu’elles sont maintenant. Il ne sera plus modifiable (des annotations datées restent possibles).')) return;
    try {
      for (var i = 0; i < detenus.length; i++) await session().enregistrer('INSTANTANE_PART', detenus[i].data);
      await session().enregistrer('INSTANTANE', prep.entete);
      try { localStorage.removeItem(cleePrep(v)); } catch (e) { /* */ }
      U.toast('Instantané enregistré (onglet « Instantanés »).');
    } catch (e) { alert(e.message); }
    U.rendreContenu();
  }
  function tableauInstantane(i) {
    var e = i.entete, valeurs = {}, colonnes = {}, identites = {}, synth = null;
    Object.keys(i.parts).forEach(function (j) { var p = i.parts[j]; (p.colonnes || []).forEach(function (c) { colonnes[c.code] = c.libelle; }); Object.keys(p.valeurs || {}).forEach(function (l) { valeurs[l] = Object.assign(valeurs[l] || {}, p.valeurs[l]); }); if (p.identites) Object.assign(identites, p.identites); if (p.synthese) synth = p.synthese; });
    var ordre = e.ordre.filter(function (c) { return colonnes[c]; }), masquees = e.ordre.length - ordre.length;
    var lg = e.largeurs || {};
    var thead = h('thead', {}, h('tr', {}, ordre.map(function (c) { return appliquerLargeur(h('th', { text: colonnes[c] }), lg[c]); })));
    var corps = e.groupes.map(function (g) {
      var tb = h('tbody', {});
      if (g.titre || e.groupes.length > 1) tb.appendChild(h('tr', { class: 'titre-groupe' }, h('th', { colspan: ordre.length || 1 }, (g.titre || 'Lignes') + ' (' + g.lignes.length + ')')));
      g.lignes.forEach(function (l) {
        tb.appendChild(h('tr', {}, ordre.map(function (c) {
          var x = (valeurs[l] || {})[c], td = appliquerLargeur(h('td', {}), lg[c]);
          if (!x) { td.appendChild(h('span', { class: 'muted', text: c === 'patient' || c === 'nom' ? (identites[l] || '—') : '—' })); return td; }
          var coul = x.couleur ? Object.assign({ couleur: x.couleur, rendu: x.rendu }, CO.CODES[x.couleur]) : null;
          td.appendChild(h('span', {}, coul ? h('span', { class: 'marque-couleur' + (coul.rendu === 'pastille' ? ' pastille-couleur cpv-' + coul.couleur : ''), 'data-symbole': coul.symbole }) : null, h('span', { text: x.lib })));
          caseCouleur(td, coul);
          return td;
        })));
      });
      return tb;
    });
    return h('div', {}, synth ? bandeauSynthese(synth) : null, h('div', { class: 'table-wrap' }, h('table', { class: 'table-vue' }, thead, corps)),
      masquees ? h('small', { class: 'muted', text: masquees + ' colonne(s) non lisible(s) avec vos droits.' }) : null);
  }
  function modaleInstantane(i) {
    var e = i.entete, notes = h('ul', { class: 'notes-liste' }, i.notes.length ? i.notes.map(function (n) { return h('li', { class: 'note' }, h('span', { class: 'note-texte', text: n.texte }), h('small', { class: 'muted', text: ' — ' + session().nomAuteur(n.par) + ', ' + U.court(Date.parse(n.le)) })); }) : [h('li', { class: 'muted', text: 'Aucune annotation.' })]);
    var t = h('input', { type: 'text', maxlength: 300, placeholder: 'Annotation datée (l’instantané lui-même ne change pas)' });
    U.modale(e.nom + ' — clos le ' + U.date(Date.parse(e.le)), h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Clos par ' + session().nomAuteur(i.par) + ' ; ' + (e.services || []).map(U.libService).join(', ') + '. Instantané jamais modifié.' }),
      tableauInstantane(i), h('b', { text: 'Annotations' }), notes,
      peut('INSTANTANE_NOTE') ? h('div', { class: 'actions gauche' }, t, h('button', { class: 'btn petit', type: 'button', onclick: async function () {
        if (!t.value.trim()) return t.focus();
        try { await session().enregistrer('INSTANTANE_NOTE', { instantane: e.id, texte: t.value.trim() }); U.toast('Annotation ajoutée.'); notes.appendChild(h('li', { class: 'note' }, h('span', { class: 'note-texte', text: t.value.trim() }), h('small', { class: 'muted', text: ' — ' + compte().nom + ', à l’instant' }))); t.value = ''; } catch (er) { alert(er.message); }
      } }, 'Annoter')) : null), [
      { texte: 'Imprimer', action: function () { U.imprimer(documentVue(e.nom, 'Instantané clos le ' + U.date(Date.parse(e.le)) + ' par ' + session().nomAuteur(i.par), tableauInstantane(i))); return false; } },
      { texte: 'Fermer' }], { large: true });
  }
  function vueInstantanes() {
    var st = session().etatModule('vue') || { instantanes: {} }, ouvertes = mesVues().map(function (v) { return v.id; });
    var l = V.instantanes(st).filter(function (i) { return estAdmin() || ouvertes.indexOf(i.entete.vue) >= 0; });
    var mois = V.conservationMois(cfg()), anciens = l.filter(function (i) { return V.auDelaConservation(cfg(), i, Date.now()); }).length;
    var reglage = null;
    if (estAdmin()) {
      var n = h('input', { type: 'number', min: 0, max: 600, value: mois, class: 'court', 'aria-label': 'Durée de conservation (mois)' });
      reglage = h('div', { class: 'actions gauche' }, h('span', { text: 'Durée de conservation des instantanés :' }), n, h('span', { text: 'mois (0 : sans limite)' }),
        h('button', { class: 'btn petit', type: 'button', onclick: async function () { var x = JSON.parse(JSON.stringify(cfg().vuesEnsemble || {})); if (!Array.isArray(x.vues)) x.vues = V.vuesProposees(); x.conservationMois = Math.max(0, Math.round(+n.value) || 0); await U.enregistrerConfig([['vuesEnsemble', x]]); } }, 'Enregistrer'));
    }
    return h('section', { class: 'pile' }, h('h2', { text: 'Instantanés' }), reglage,
      anciens ? h('div', { class: 'alerte', text: anciens + ' instantané(s) au-delà de la durée de conservation (' + mois + ' mois) : à retirer selon la procédure de l’établissement (copie de sauvegarde, puis purge par le service informatique).' }) : null,
      h('p', { class: 'muted', text: 'Feuilles closes, gardées telles qu’elles étaient au moment de la clôture. Chacun n’en revoit que les colonnes qu’il pouvait voir (les valeurs sont rangées dans le journal de chaque donnée).' }),
      l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Vue', 'Clos le', 'Par', 'Lignes', 'Annotations', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, l.map(function (i) {
          return h('tr', { class: V.auDelaConservation(cfg(), i, Date.now()) ? 'ancienne' : '' }, h('td', { text: i.entete.nom }), h('td', { text: U.date(Date.parse(i.entete.le)) }), h('td', { text: session().nomAuteur(i.par) }),
            h('td', { text: String(i.entete.groupes.reduce(function (s, g) { return s + g.lignes.length; }, 0)) }), h('td', { text: String(i.notes.length) }),
            h('td', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleInstantane(i); } }, 'Ouvrir')));
        })))) : h('div', { class: 'panneau vide', text: 'Aucun instantané : préparez puis closez une feuille depuis une vue.' }));
  }

  // ------------------------------------------------------------ Réglage d'une donnée depuis l'en-tête de colonne
  function reglerDonnee(col) {
    var choix = null;
    if (col.psychologue) choix = SIC.psychologues.liste(cfg()).map(function (m) { return { valeur: m.id, libelle: m.nom }; });
    else if (col.medecin) choix = MED.liste(cfg()).map(function (m) { return { valeur: m.id, libelle: m.nom }; });
    else if (col.champ && (col.champ.type === 'liste' || col.champ.type === 'choixMultiple')) choix = col.champ.choix.map(function (c) { return { valeur: c, libelle: c }; });
    else if (col.code === 'mode') choix = (cfg().modesHospitalisation || []).map(function (m) { return { valeur: m.code, libelle: m.code + ' — ' + m.libelle }; });
    U.champs.modaleReglages({ code: col.reglage || ('vue.' + col.code), libelle: col.libelle, type: col.type, choix: choix, defaut: col.defaut,
      delai: (col.type === 'date' || col.type === 'dateFenetre') && !col.delaiSuivi });
  }

  // ------------------------------------------------------------ Réglage d'une vue (cadre, administrateur)
  var OPS_GROUPES = { apresLe: 'Date à partir du (date et heure)', avantLe: 'Date avant le (date et heure)' };
  function vuesBrutes() { var x = cfg().vuesEnsemble || {}; return JSON.parse(JSON.stringify(Array.isArray(x.vues) ? x.vues : V.vuesProposees())); }
  function modaleVue(v0) {
    var admin = estAdmin(), mes = compte().services || [], nouveau = !v0;
    var v = nouveau ? V.normaliser({ id: 'n' + C.hex(C.aleatoire(3)), nom: 'Nouvelle vue', lignes: 'patients', services: admin ? [] : mes.slice(), colonnes: ['patient', 'chambre', 'mode', 'medecin1'], synthese: ['effectif'] }) : JSON.parse(JSON.stringify(v0));
    var rs = SIC.modules.obtenir('isocont').droits.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { code: r.code, libelle: r.libelle }; });
    var nom = h('input', { type: 'text', maxlength: 60, value: v.nom });
    var lignes = h('select', { disabled: !nouveau }, Object.keys(V.LIGNES).map(function (k) { return h('option', { value: k, text: V.LIGNES[k], selected: v.lignes === k }); }));
    var perim = h('select', {}, Object.keys(V.PERIMETRES).map(function (k) { return h('option', { value: k, text: V.PERIMETRES[k], selected: v.perimetre === k }); }));
    var svOpts = U.tousServices().filter(function (s) { return admin || mes.indexOf(s.code) >= 0; }).map(function (s) { return { code: s.code, libelle: s.libelle }; });
    var zoneCols = h('div', { class: 'pile' }), zoneGroupes = h('div', { class: 'pile' }), selTri = h('select', {}), sensTri = h('select', {}, [['1', 'croissant'], ['-1', 'décroissant']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: String(v.tri.sens) === x[0] }); }));
    var ctx = contexte();
    function cat() { return V.catalogue(lignes.value, ctx); }
    function dessinerCols() {
      U.vider(zoneCols); U.vider(selTri);
      var c = cat(), choisis = v.colonnes.filter(function (x) { return V.colonneDe(c, x.code); });
      v.colonnes = choisis;
      var tb = h('tbody');
      choisis.forEach(function (vc, i) {
        var col = V.colonneDe(c, vc.code);
        var aff = col.medecin ? h('select', { 'aria-label': 'Affichage' }, [['nom', 'Nom'], ['initiales', 'Initiales']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: vc.affichage === x[0] }); })) : null;
        if (aff) aff.addEventListener('change', function () { vc.affichage = aff.value; });
        var lib = h('input', { type: 'text', maxlength: 60, value: vc.libelle || '', placeholder: col.libelle, 'aria-label': 'Titre de la colonne' });
        lib.addEventListener('input', function () { vc.libelle = lib.value.trim(); });
        var lg = h('input', { type: 'number', min: 40, max: 800, step: 10, value: vc.largeur || '', placeholder: 'auto', class: 'court', 'aria-label': 'Largeur (pixels)', title: 'Largeur en pixels (40 à 800) ; vide : automatique' });
        lg.addEventListener('input', function () { vc.largeur = V.largeur(lg.value); });
        tb.appendChild(h('tr', {}, h('td', {}, lib), h('td', {}, U.champs.multi(vc.roles, rs, 'Tous', 'Visible par')), h('td', {}, aff), h('td', {}, lg),
          h('td', {}, h('button', { class: 'btn petit', type: 'button', title: 'Couleurs propres à cette vue (évaluées avant celles de la donnée)', onclick: function () { modaleReglesVue(col, vc); } }, 'Règles' + (vc.regles && vc.regles.length ? ' (' + vc.regles.length + ')' : ''))),
          h('td', { class: 'actions-ligne' },
            h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { v.colonnes.splice(i - 1, 0, v.colonnes.splice(i, 1)[0]); dessinerCols(); } }, '▲'),
            h('button', { class: 'btn petit danger', type: 'button', 'aria-label': 'Retirer', onclick: function () { v.colonnes.splice(i, 1); dessinerCols(); } }, '✕'))));
      });
      var dispo = c.filter(function (x) { return !choisis.some(function (y) { return y.code === x.code; }); });
      // Données ajoutées non proposées : affichées en grisé avec leur raison (rôle, clé propre pas encore créée…)
      var ent = lignes.value === 'patients' ? 'patient' : lignes.value === 'medecins' ? 'medecin' : 'agent';
      var indispo = CH.definitions(cfg(), { tous: true, entite: ent }).map(function (d) { return { d: d, r: U.champs.raisonIndisponible(d) }; }).filter(function (x) { return x.r; });
      var ajout = h('select', { 'aria-label': 'Ajouter une colonne' }, [h('option', { value: '', text: '+ Ajouter une colonne…' })].concat(dispo.map(function (x) { return h('option', { value: x.code, text: x.libelle + (x.champ ? ' (donnée ajoutée' + (x.champ.type === 'formule' ? ', calcul' : '') + ')' : '') }); }))
        .concat(indispo.length ? [h('optgroup', { label: 'Non disponibles' }, indispo.map(function (x) { return h('option', { value: '', disabled: true, text: x.d.libelle + ' — ' + x.r }); }))] : []));
      ajout.addEventListener('change', function () { if (ajout.value) { v.colonnes.push({ code: ajout.value, roles: [], affichage: 'nom', regles: [] }); dessinerCols(); dessinerGroupes(); } });
      zoneCols.appendChild(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Colonne', 'Visible par', 'Affichage', 'Largeur (px)', 'Couleurs', ''].map(function (t) { return h('th', { text: t }); }))), tb)));
      zoneCols.appendChild(h('div', { class: 'actions gauche' }, ajout,
        h('button', { class: 'btn petit', type: 'button', onclick: function () { U.champs.modaleDefinitions({ entite: lignes.value === 'patients' ? 'patient' : lignes.value === 'medecins' ? 'medecin' : 'agent' }); } }, 'Données ajoutées…'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleCalcul(lignes.value, function (code) { v.colonnes.push({ code: code, roles: [], affichage: 'nom', regles: [] }); }); } }, '+ Colonne calculée…')));
      c.forEach(function (x) { selTri.appendChild(h('option', { value: x.code, text: x.libelle, selected: v.tri.colonne === x.code })); });
    }
    function dessinerGroupes() {
      U.vider(zoneGroupes);
      var c = cat();
      v.groupes.forEach(function (g, i) {
        var titre = h('input', { type: 'text', maxlength: 80, value: g.titre, 'aria-label': 'Titre du groupe' }); titre.addEventListener('input', function () { g.titre = titre.value; });
        var comb = h('select', {}, [['toutes', 'toutes les conditions'], ['une', 'au moins une condition']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: g.combinaison === x[0] }); }));
        comb.addEventListener('change', function () { g.combinaison = comb.value; });
        var conds = h('div', { class: 'pile' });
        function dessinerConds() {
          U.vider(conds);
          g.conditions.forEach(function (cd, k) {
            var sc = h('select', { 'aria-label': 'Colonne' }, c.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: cd.colonne === x.code }); }));
            var ops = Object.keys(CO.CONDITIONS).filter(function (o) { return o !== 'toujours'; }).map(function (o) { return [o, CO.CONDITIONS[o].libelle]; }).concat(Object.keys(OPS_GROUPES).map(function (o) { return [o, OPS_GROUPES[o]]; }));
            var so = h('select', { 'aria-label': 'Condition' }, ops.map(function (o) { return h('option', { value: o[0], text: o[1], selected: cd.op === o[0] }); }));
            var val = h('input', { type: 'text', value: cd.valeur || '', placeholder: 'valeur', 'aria-label': 'Valeur' });
            var n = h('input', { type: 'number', value: cd.n === undefined ? '' : cd.n, class: 'court', 'aria-label': 'Nombre' });
            var dt = h('input', { type: 'datetime-local', value: /T/.test(cd.valeur || '') ? cd.valeur : '', 'aria-label': 'Date et heure' });
            function maj() {
              cd.colonne = sc.value; cd.op = so.value;
              var def = CO.CONDITIONS[so.value], date = !!OPS_GROUPES[so.value];
              val.hidden = !(def && def.valeur); n.hidden = !(def && def.n); dt.hidden = !date;
              delete cd.valeur; delete cd.n;
              if (date) cd.valeur = dt.value; else { if (def && def.valeur) cd.valeur = val.value; if (def && def.n) cd.n = +n.value || 0; }
            }
            [sc, so, val, n, dt].forEach(function (x) { x.addEventListener('change', maj); x.addEventListener('input', maj); });
            maj();
            conds.appendChild(h('div', { class: 'actions gauche' }, sc, so, val, n, dt, h('button', { class: 'btn petit danger', type: 'button', 'aria-label': 'Retirer la condition', onclick: function () { g.conditions.splice(k, 1); dessinerConds(); } }, '✕')));
          });
          conds.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { g.conditions.push({ colonne: lignes.value === 'patients' ? 'entree' : (c[0] || {}).code, op: 'depuisMoinsDe', n: 7 }); dessinerConds(); } }, '+ Condition'));
        }
        dessinerConds();
        zoneGroupes.appendChild(h('div', { class: 'panneau' }, h('div', { class: 'actions gauche' }, h('b', { text: 'Groupe ' + (i + 1) }), titre, h('span', { text: 'si' }), comb,
          h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { v.groupes.splice(i - 1, 0, v.groupes.splice(i, 1)[0]); dessinerGroupes(); } }, '▲'),
          h('button', { class: 'btn petit danger', type: 'button', onclick: function () { v.groupes.splice(i, 1); dessinerGroupes(); } }, 'Retirer')), conds));
      });
      zoneGroupes.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { v.groupes.push({ id: 'g' + C.hex(C.aleatoire(2)), titre: 'Nouveau groupe', combinaison: 'toutes', conditions: [] }); dessinerGroupes(); } }, '+ Groupe'));
    }
    lignes.addEventListener('change', function () { v.lignes = lignes.value; v.colonnes = [{ code: lignes.value === 'patients' ? 'patient' : 'nom', roles: [], affichage: 'nom', regles: [] }]; v.groupes = []; dessinerCols(); dessinerGroupes(); });
    dessinerCols(); dessinerGroupes();
    var autresTitre = h('input', { type: 'text', maxlength: 80, value: v.autres.titre }), autresMasque = h('input', { type: 'checkbox', checked: v.autres.masque });
    var synth = Object.keys(V.SYNTHESE).map(function (k) { return { k: k, cb: h('input', { type: 'checkbox', checked: v.synthese.indexOf(k) >= 0 }) }; });
    var corps = h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Nom de la vue (onglet)', nom), h('label', {}, 'Une ligne par', lignes), h('label', {}, 'Patients affichés', perim)),
      h('div', { class: 'grille-3' },
        h('label', {}, 'Services', U.champs.multi(v.services, svOpts, admin ? 'Établissement (tous)' : 'Choisir', 'Services')),
        h('label', {}, 'Vue ouverte aux rôles', U.champs.multi(v.roles, rs, 'Tous', 'Rôles')),
        h('label', {}, 'Clôture des instantanés par', U.champs.multi(v.instantane.roles, rs, 'Administrateur seul', 'Clôture'))),
      h('div', { class: 'actions gauche' }, h('span', { text: 'Trier par' }), selTri, sensTri),
      h('h3', { text: 'Colonnes' }), zoneCols,
      h('h3', { text: 'Groupes de lignes' }), h('small', { class: 'muted', text: 'Une ligne va dans le premier groupe dont les conditions sont vraies ; le tri est gardé dans chaque groupe. Ex. « Entrés depuis le… » (date et heure), « Présents depuis plus de 90 jours ».' }), zoneGroupes,
      h('div', { class: 'actions gauche' }, h('span', { text: 'Lignes hors groupes :' }), autresTitre, h('label', { class: 'case' }, autresMasque, h('span', { text: 'masquer' }))),
      lignes.value === 'patients' ? h('div', {}, h('h3', { text: 'Bandeau de synthèse' }), h('div', { class: 'actions gauche' }, synth.map(function (s) { return h('label', { class: 'case' }, s.cb, h('span', { text: V.SYNTHESE[s.k] })); })),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { U.modale('Capacité d’accueil', U.champs.panneauCapacites(), [{ texte: 'Fermer' }], { large: true }); } }, 'Capacité d’accueil…')) : null);
    var boutons = [{ texte: 'Annuler' }];
    if (!nouveau) boutons.push({ texte: 'Supprimer la vue', classe: 'danger', action: async function () {
      if (!confirm('Supprimer la vue « ' + v0.nom + ' » ? Ses instantanés clos restent consultables.')) return false;
      await U.enregistrerConfig([['vuesEnsemble', { vues: vuesBrutes().filter(function (x) { return x.id !== v0.id; }) }]]);
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!nom.value.trim()) throw new Error('Indiquez le nom de la vue.');
      if (!admin && !v.services.length) throw new Error('Choisissez un ou plusieurs de vos services.');
      v.nom = nom.value.trim(); v.lignes = lignes.value; v.perimetre = perim.value; v.tri = { colonne: selTri.value, sens: +sensTri.value };
      v.autres = { titre: autresTitre.value.trim() || 'Autres', masque: autresMasque.checked };
      v.synthese = synth.filter(function (s) { return s.cb.checked; }).map(function (s) { return s.k; });
      if (!v.par) v.par = { role: admin ? 'ADMIN' : 'CADRE', services: admin ? [] : v.services.slice() };
      if (v.groupes.some(function (g) { return !String(g.titre || '').trim(); })) throw new Error('Chaque groupe doit avoir un titre.');
      var l = vuesBrutes(), i = l.map(function (x) { return x.id; }).indexOf(v.id);
      if (i >= 0) l[i] = v; else l.push(v);
      await U.enregistrerConfig([['vuesEnsemble', { vues: l }]]);
      U.App.onglet = 'v:' + v.id;
    } });
    U.modale(nouveau ? 'Nouvelle vue' : 'Régler la vue « ' + v0.nom + ' »', corps, boutons, { large: true });
  }
  /** Règles de couleur propres à une colonne de la vue (évaluées avant celles de la donnée). */
  function modaleReglesVue(col, vc) {
    vc.regles = vc.regles || [];
    var zone = h('div', { class: 'pile' });
    var conds = Object.keys(CO.CONDITIONS).filter(function (k) { var c = CO.CONDITIONS[k]; return !c.pour.length || c.pour.indexOf(col.type) >= 0; });
    function dessiner() {
      U.vider(zone);
      vc.regles.forEach(function (r, i) {
        var op = h('select', {}, conds.map(function (k) { return h('option', { value: k, text: CO.CONDITIONS[k].libelle, selected: r.si.op === k }); }));
        var val = h('input', { type: 'text', value: r.si.valeur || '', placeholder: 'valeur' }), n = h('input', { type: 'number', value: r.si.n || '', class: 'court' });
        var coul = h('select', {}, CO.PALETTE.map(function (c) { return h('option', { value: c.code, text: c.symbole + ' ' + c.libelle, selected: r.couleur === c.code }); }));
        var rendu = h('select', {}, Object.keys(CO.RENDUS).map(function (k) { return h('option', { value: k, text: CO.RENDUS[k], selected: r.rendu === k }); }));
        var lib = h('input', { type: 'text', maxlength: 60, value: r.libelle || '', placeholder: 'Légende' });
        function maj() { var c = CO.CONDITIONS[op.value]; r.si = { op: op.value }; if (c.valeur) r.si.valeur = val.value; if (c.n) r.si.n = +n.value || 0; r.couleur = coul.value; r.rendu = rendu.value; r.libelle = lib.value; val.hidden = !c.valeur; n.hidden = !c.n; }
        [op, val, n, coul, rendu, lib].forEach(function (x) { x.addEventListener('change', maj); x.addEventListener('input', maj); });
        maj();
        zone.appendChild(h('div', { class: 'actions gauche' }, op, val, n, coul, rendu, lib, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { vc.regles.splice(i, 1); dessiner(); } }, '✕')));
      });
      zone.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { vc.regles.push({ si: { op: conds[0] }, couleur: 'bleu', rendu: 'fond', libelle: '' }); dessiner(); } }, '+ Règle'));
    }
    dessiner();
    var d = h('dialog', { class: 'large', 'aria-label': 'Règles propres à la vue' });
    d.appendChild(h('div', { class: 'tete' }, h('h2', { text: 'Couleurs propres à la vue — ' + col.libelle })));
    d.appendChild(h('div', { class: 'corps' }, h('p', { class: 'muted', text: 'Évaluées avant les réglages de la donnée (communs aux autres modules) ; la première règle vraie l’emporte.' }), zone));
    d.appendChild(h('div', { class: 'pied' }, h('button', { class: 'btn primaire', type: 'button', onclick: function () { d.close(); d.remove(); } }, 'Valider')));
    document.body.appendChild(d); d.showModal();
  }
  // ------------------------------------------------------------ Colonne calculée : formules prêtes, aide à la rédaction
  /** Aide : fonctions (explication, exemple), colonnes de la ligne insérées au clic, aperçu du résultat. */
  function aide(zoneTexte, entite) {
    var ent = entite === 'medecin' ? 'medecins' : 'patients';
    var ctx = contexte(), cat = V.catalogue(ent, ctx).filter(function (c) { return !(c.champ && c.champ.type === 'formule'); });
    function inserer(t) { var a = zoneTexte.selectionStart || zoneTexte.value.length, b = zoneTexte.selectionEnd || a; zoneTexte.value = zoneTexte.value.slice(0, a) + t + zoneTexte.value.slice(b); zoneTexte.focus(); zoneTexte.dispatchEvent(new Event('input')); }
    var apercu = h('div', { class: 'apercu-formule muted' });
    function majApercu() {
      try {
        F.analyser(zoneTexte.value);
        var ls = V.lignes({ lignes: ent, services: [], perimetre: 'hospitalises' }, ctx).slice(0, 3);
        apercu.textContent = 'Formule correcte.' + (ls.length ? ' Aperçu : ' + ls.map(function (l) {
          try { var r = F.evaluer(zoneTexte.value, { maintenant: ctx.maintenant, valeur: function (n) { var c = cat.filter(function (x) { return x.libelle.toLowerCase() === n.toLowerCase() || (x.alias || []).indexOf(n.toLowerCase()) >= 0; })[0]; if (!c) { var e = new Error('Colonne inconnue « ' + n + ' ».'); e.formule = true; throw e; } return c.lire(l).brute; } }); return titreLigne(l) + ' → ' + (F.texte(r) || 'vide'); }
          catch (e) { return titreLigne(l) + ' → ⚠ ' + e.message; }
        }).join(' ; ') : '');
        apercu.className = 'apercu-formule';
      } catch (e) { apercu.textContent = '⚠ ' + e.message; apercu.className = 'apercu-formule erreur'; }
    }
    zoneTexte.addEventListener('input', majApercu);
    setTimeout(majApercu, 0);
    return h('div', { class: 'aide-formule pile' },
      h('details', {}, h('summary', { text: 'Colonnes (cliquer pour insérer)' }), h('div', { class: 'actions gauche' }, cat.map(function (c) { return h('button', { class: 'btn petit', type: 'button', onclick: function () { inserer('[' + c.libelle + ']'); } }, c.libelle); }))),
      h('details', {}, h('summary', { text: 'Fonctions' }), h('ul', { class: 'liste-fonctions' }, Object.keys(F.FONCTIONS).map(function (k) { var f = F.FONCTIONS[k]; return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { inserer(k + '('); } }, k), ' — ' + f.aide + ' ', h('code', { text: f.exemple })); }))),
      h('small', { class: 'muted', text: 'Arguments séparés par « ; », textes entre guillemets, colonnes entre crochets. Une formule ne lit que les colonnes de sa ligne que l’agent voit, et ne cite pas une autre formule.' }),
      apercu);
  }
  /** Nouvelle colonne calculée : formule prête (choix des champs) ou saisie libre avec aide ; crée la donnée « Calcul ». */
  function modaleCalcul(lignes, apres) {
    var ent = lignes === 'medecins' ? 'medecin' : 'patient', ctx = contexte();
    var cat = V.catalogue(lignes === 'medecins' ? 'medecins' : 'patients', ctx).filter(function (c) { return !(c.champ && c.champ.type === 'formule'); });
    var nom = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Jours avant la sortie' });
    var formule = h('textarea', { rows: 3, class: 'mono', placeholder: 'ex. -JOURS([Sortie prévisionnelle])' });
    var selPrete = h('select', {}, [h('option', { value: '', text: '— Saisie libre —' })].concat(F.PRETES.map(function (p) { return h('option', { value: p.id, text: p.libelle }); })));
    var zoneChoix = h('div', { class: 'actions gauche' }), choix = {};
    function dessinerChoix() {
      U.vider(zoneChoix); choix = {};
      var p = F.PRETES.filter(function (x) { return x.id === selPrete.value; })[0]; if (!p) return;
      p.champs.forEach(function (c) {
        var el;
        if (c.nombre) el = h('input', { type: 'number', value: 7, class: 'court' });
        else if (c.texte) el = h('input', { type: 'text', maxlength: 40, placeholder: 'texte' });
        else el = h('select', {}, [h('option', { value: '', text: c.facultatif ? '— aucune —' : '— choisir —' })].concat(cat.filter(function (x) { return !c.types.length || c.types.indexOf(x.type) >= 0; }).map(function (x) { return h('option', { value: x.libelle, text: x.libelle }); })));
        choix[c.nom] = el;
        el.addEventListener('change', ecrire); el.addEventListener('input', ecrire);
        zoneChoix.appendChild(h('label', {}, c.libelle + ' ', el));
      });
      ecrire();
      if (!nom.value) nom.value = p.libelle;
    }
    function ecrire() {
      var x = {}; Object.keys(choix).forEach(function (k) { x[k] = choix[k].value; });
      try { formule.value = F.depuisPrete(selPrete.value, x); formule.dispatchEvent(new Event('input')); } catch (e) { /* choix incomplets */ }
    }
    selPrete.addEventListener('change', dessinerChoix);
    var svs = estAdmin() ? [] : (compte().services || []).slice(), rs = SIC.modules.obtenir('isocont').droits.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { code: r.code, libelle: r.libelle }; }), lecture = [];
    U.modale('Nouvelle colonne calculée', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom de la colonne', nom), h('label', {}, 'Formule prête', selPrete)), zoneChoix,
      h('label', {}, 'Formule', formule), aide(formule, ent),
      h('label', {}, 'Visible par', U.champs.multi(lecture, rs, 'Tous', 'Visible par'))), [{ texte: 'Annuler' }, { texte: 'Créer la colonne', classe: 'primaire', action: async function () {
      if (!nom.value.trim()) throw new Error('Indiquez le nom de la colonne.');
      F.verifier(formule.value, cat.map(function (c) { return c.libelle; }));
      var l = U.champs.definitionsBrutes(), id = CH.identifiant(nom.value, l.map(function (c) { return c.id; }));
      l.push({ id: id, libelle: nom.value.trim(), type: 'formule', formule: formule.value.trim(), entite: ent, module: ent === 'medecin' ? 'suivi' : 'patients', services: svs, saisie: [], lecture: lecture, par: { role: estAdmin() ? 'ADMIN' : 'CADRE', services: svs } });
      CH.controlerListe(Array.isArray(cfg().champsAjoutes) ? cfg().champsAjoutes : [], l);
      await U.enregistrerConfig([['champsAjoutes', l]]);
      if (apres) apres('c:' + id);
    } }], { large: true });
  }
  U.formules = { aide: aide, verifier: function (t) { return F.verifier(t); } };

  // ------------------------------------------------------------ Journal, interface du module
  var LIB = { INSTANTANE: 'Vue d’ensemble : instantané clos', INSTANTANE_PART: 'Vue d’ensemble : valeurs d’un instantané', INSTANTANE_NOTE: 'Vue d’ensemble : annotation d’un instantané' };
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'INSTANTANE') return (d.nom || 'Vue') + ' — ' + (d.groupes || []).reduce(function (s, g) { return s + g.lignes.length; }, 0) + ' ligne(s)';
    if (e.type === 'INSTANTANE_PART') return 'Colonnes : ' + (d.colonnes || []).map(function (c) { return c.libelle; }).join(', ');
    if (e.type === 'INSTANTANE_NOTE') return d.texte || '';
    return e.type;
  }
  var vuesProxy = new Proxy({}, { get: function (t, code) {
    if (code === 'instantanes') return vueInstantanes;
    if (code === 'plan') return U.chambres.vuePlan;
    if (typeof code === 'string' && code.indexOf('v:') === 0) return function () { return vueTableau(code.slice(2)); };
    if (code === 'vues') return function () { var l = mesVues(); return l.length ? vueTableau(l[0].id) : h('div', { class: 'panneau vide', text: 'Aucune vue ne vous est ouverte.' }); };
    return undefined;
  } });
  SIC.modules.completerInterface('vue', {
    vues: vuesProxy,
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'L’instantané n’apparaît plus dans la liste.'; } }
  });
})();
