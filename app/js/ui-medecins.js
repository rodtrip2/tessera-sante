// SPDX-License-Identifier: EUPL-1.2
/*
 * Liste commune des médecins — interface (décision du porteur du 8 novembre 2026). Logique : medecins.js.
 * Affichée dans la fenêtre Suivi médical (onglet Médecins) et ouverte depuis Administration → Réglages généraux.
 * Gestion : administrateur et rôles désignés (cadre et secrétaire par défaut), notamment pour les médecins intérimaires.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, MED = SIC.medecins, C = SIC.crypto;

  function peutGerer() { var s = U.App.session; return !s.apercu && MED.peutGerer(U.config(), s.utilisateur); }
  function libServices(m) { return m.services.length ? m.services.map(U.libService).join(', ') : 'tous les services'; }
  function dateFr(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
  function libPeriode(m) { return m.debut || m.fin ? (m.debut ? 'du ' + dateFr(m.debut) : '') + (m.fin ? ' au ' + dateFr(m.fin) : '') : ''; }

  /** Enregistre la liste (et tient à jour l'ancienne liste des psychiatres, encore lue par certains écrans). */
  async function enregistrerListe(liste, gestion) {
    var cfg = U.config(), brut = cfg.medecins && !Array.isArray(cfg.medecins) ? cfg.medecins : {};
    var v = { liste: liste.map(function (m) { var x = MED.normaliser(m); delete x.repris; return x; }) };
    var g = gestion !== undefined ? gestion : brut.gestion;
    if (g) v.gestion = g;
    await U.enregistrerConfig([['medecins', v], ['psychiatres', MED.psychiatres(v.liste)]]);
  }

  function tableau(apres) {
    var cfg = U.config(), liste = MED.liste(cfg), gerer = peutGerer(), comptes = U.App.session.comptes || [];
    if (!liste.length) return h('div', { class: 'panneau vide', text: gerer ? 'Aucun médecin : ajoutez les médecins de l’établissement (+ Nouveau médecin).' : 'Aucun médecin dans la liste.' });
    return h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Nom', 'Initiales', 'Fonction', 'Services', 'Statut', 'Compte Tessera', ''].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', {}, liste.map(function (m) {
        var termine = !MED.enActivite(m, Date.now()), c = m.compte ? comptes.filter(function (y) { return y.id === m.compte; })[0] : null;
        return h('tr', { class: termine ? 'ancienne' : '' }, h('td', {}, h('b', { text: m.nom }), m.anciensNoms.length ? h('div', {}, h('small', { class: 'muted', text: 'Anciens noms : ' + m.anciensNoms.join(', ') })) : null),
          h('td', { text: m.initiales || MED.proposerInitiales(m.nom), class: m.initiales ? '' : 'muted' }),
          h('td', { text: MED.FONCTIONS[m.fonction] }), h('td', { text: libServices(m) }),
          h('td', {}, h('span', { class: 'badge' + (m.aConfirmer ? ' bad' : m.statut === 'interimaire' ? ' warn' : ''), text: m.aConfirmer ? 'À confirmer' : MED.STATUTS[m.statut] + (termine ? (m.actif ? ' — hors période' : ' — retiré') : '') }), libPeriode(m) ? h('div', {}, h('small', { class: 'muted', text: libPeriode(m) })) : null),
          h('td', { text: c ? c.nom : '—' }),
          h('td', { class: 'actions-ligne' }, gerer ? (m.aConfirmer ? actionsAConfirmer(m, apres || U.rendreContenu) : h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleMedecin(m, apres); } }, 'Modifier')) : null));
      }))));
  }
  /** Vue de la liste (onglet Médecins de la fenêtre Suivi médical). */
  function vue() {
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Médecins' }),
        peutGerer() ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleMedecin(null); } }, '+ Nouveau médecin') : null),
      h('p', { class: 'muted', text: 'Liste commune à Tessera : médecins de 1re et 2e ligne de la fiche patient, psychiatre décisionnaire d’Isocont, présences et entretiens du Suivi médical. Les médecins n’ont pas besoin de compte ; leur nom pourra être rattaché plus tard à leur compte. Un intérimaire sort des listes de choix après sa période ; son nom reste dans l’historique.' }),
      tableau(), sectionRattacher());
  }
  /** Liste ouverte dans une fenêtre (Administration → Réglages généraux). */
  function modaleListe() {
    var zone = h('div', { class: 'pile' });
    function dessiner() { U.vider(zone); zone.appendChild(tableau(dessiner)); if (peutGerer()) zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: function () { modaleMedecin(null, dessiner); } }, '+ Nouveau médecin'))); }
    dessiner();
    U.modale('Liste commune des médecins', zone, [{ texte: 'Fermer' }], { large: true });
  }

  function modaleMedecin(m, apres) {
    var x = m || { nom: '', fonction: 'psychiatre', services: U.App.service !== '*' ? [U.App.service] : [], statut: 'titulaire', debut: '', fin: '', compte: null, actif: true };
    var admin = U.App.session.roles().indexOf('ADMIN') >= 0;
    var nom = h('input', { type: 'text', maxlength: 60, value: x.nom, placeholder: 'ex. Dr NOM' });
    var fonction = h('select', {}, Object.keys(MED.FONCTIONS).map(function (k) { return h('option', { value: k, text: MED.FONCTIONS[k], selected: x.fonction === k }); }));
    var statut = h('select', {}, Object.keys(MED.STATUTS).map(function (k) { return h('option', { value: k, text: MED.STATUTS[k], selected: x.statut === k }); }));
    // Initiales (0.18.0) : proposées d'après le nom, modifiables ; affichées dans les colonnes réglées « initiales »
    var initiales = h('input', { type: 'text', maxlength: 8, value: x.initiales || '', placeholder: MED.proposerInitiales(x.nom) || 'ex. JD' });
    nom.addEventListener('input', function () { initiales.placeholder = MED.proposerInitiales(nom.value) || 'ex. JD'; });
    var choisis = x.services.slice();
    var cases = U.tousServices().map(function (s) {
      var cb = h('input', { type: 'checkbox', checked: choisis.indexOf(s.code) >= 0, onchange: function () { choisis = cb.checked ? choisis.concat([s.code]) : choisis.filter(function (c) { return c !== s.code; }); } });
      return h('label', { class: 'case' }, cb, h('span', { text: s.libelle }));
    });
    var debut = h('input', { type: 'date', value: x.debut }), fin = h('input', { type: 'date', value: x.fin });
    var actif = h('input', { type: 'checkbox', checked: x.actif !== false });
    var compte = h('select', { disabled: !admin }, [h('option', { value: '', text: '— Aucun (le médecin n’utilise pas Tessera)' })].concat((U.App.session.comptes || []).filter(function (c) { return c.id !== 'secours'; })
      .map(function (c) { return h('option', { value: c.id, text: c.nom, selected: x.compte === c.id }); })));
    var boutons = [{ texte: 'Annuler' }];
    var confirmation = m && m.aConfirmer, creation = m && m.nouveau;
    if (creation) m = null;
    if (m && !confirmation) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer « ' + m.nom + ' » de la liste ? Les fiches qui le citent gardent son nom. Pour un médecin qui part, décochez plutôt « En activité » (il reste dans l’historique).')) return false;
      await enregistrerListe(MED.liste(U.config()).filter(function (y) { return y.id !== m.id; }));
      if (apres) apres();
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var n = nom.value.trim();
      if (!n) throw new Error('Indiquez le nom du médecin.');
      if (statut.value === 'interimaire' && !debut.value) throw new Error('Indiquez le premier jour de l’intérimaire.');
      if (fin.value && debut.value && fin.value < debut.value) throw new Error('Le dernier jour précède le premier.');
      var liste = MED.liste(U.config());
      var autre = liste.filter(function (y) { return (!m || y.id !== m.id) && (y.nom.toLowerCase() === n.toLowerCase() || y.anciensNoms.some(function (a) { return a.toLowerCase() === n.toLowerCase(); })); })[0];
      if (autre) throw new Error(autre.nom.toLowerCase() === n.toLowerCase() ? 'Ce nom figure déjà dans la liste.' : 'Ce nom est un ancien nom de ' + autre.nom + ' : ses saisies le suivent déjà.');
      if (compte.value && liste.some(function (y) { return y.compte === compte.value && (!m || y.id !== m.id); })) throw new Error('Ce compte est déjà rattaché à un autre médecin.');
      // Renommage : l'ancien nom est gardé, les saisies faites sous ce nom suivent le médecin (décision du porteur)
      var base = m ? MED.renommer(m, n) : MED.normaliser({ nom: n });
      var nouveau = Object.assign(base, { id: (m && m.id) || MED.slug(n), fonction: fonction.value, services: choisis, statut: statut.value, debut: debut.value, fin: fin.value, compte: compte.value || null, actif: actif.checked, aConfirmer: false, propose: null, initiales: initiales.value.trim() });
      // Confirmation d'une fiche corrigée : le nom saisi au départ reste reconnu (les saisies faites sous ce nom suivent)
      if (confirmation && n !== x.nom && nouveau.anciensNoms.indexOf(x.nom) < 0) nouveau.anciensNoms.push(x.nom);
      var i = m ? liste.map(function (y) { return y.id; }).indexOf(m.id) : -1;
      if (i >= 0) liste[i] = nouveau; else liste.push(nouveau);
      await enregistrerListe(liste);
      if (apres) apres();
    } });
    U.modale(confirmation ? 'Confirmer le médecin' : m ? 'Modifier le médecin' : 'Nouveau médecin', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Nom', nom), h('label', {}, 'Fonction', fonction), h('label', {}, 'Statut', statut)),
      h('div', { class: 'grille-3' }, h('label', {}, 'Initiales', initiales), h('small', { class: 'muted', text: 'Vides : proposées d’après le nom (indiquées en gris). Affichées dans les colonnes réglées pour montrer les initiales.' })),
      h('div', {}, h('b', { text: 'Services' }), h('div', { class: 'actions gauche' }, cases), h('small', { class: 'muted', text: 'Aucun coché : proposé dans tous les services.' })),
      h('div', { class: 'grille-2' }, h('label', {}, 'Présent du (intérimaire, vacation)', debut), h('label', {}, 'au (facultatif)', fin)),
      h('label', {}, 'Compte Tessera rattaché' + (admin ? '' : ' (administrateur)'), compte),
      h('small', { class: 'muted', text: 'Changer le nom ou rattacher un compte ne coupe aucun lien : les saisies déjà faites (fiches patients, présences, entretiens, Isocont) suivent le médecin. Les anciens noms restent reconnus.' + (m && m.anciensNoms.length ? ' Anciens noms : ' + m.anciensNoms.join(', ') + '.' : '') }),
      h('label', { class: 'case' }, actif, h('span', { text: 'En activité (proposé dans les listes de choix)' }))), boutons, { large: true });
  }

  // ------------------------------------------------------------ Champ « médecin » commun (fiche patient, Isocont, Suivi médical)
  function moi() { return U.App.session.compteEffectif(); }
  /**
   * Liste déroulante liée à la liste commune : médecins du service, puis autres médecins, puis « + Médecin non répertorié… »
   * (fiche à confirmer par les gestionnaires). Un nom saisi avant, hors liste, reste proposé tel quel. Options : { valeur,
   * id, service, fonction (filtre, ex. psychiatre), libelle, vide (texte de l'option vide) }. Rend un bloc avec nom(),
   * medecinId() et l'élément select (`select`).
   */
  function champ(o) {
    o = o || {};
    var sel = h('select', { 'aria-label': 'Médecin' + (o.libelle ? ' (' + o.libelle + ')' : '') }), courant = o.valeur ? MED.resoudre(U.config(), o.valeur, o.id) : '';
    function remplir() {
      U.vider(sel);
      var cfg = U.config(), tous = MED.proposes(cfg, { fonction: o.fonction || '' });
      var duService = tous.filter(function (m) { return o.service && m.services.indexOf(o.service) >= 0; }), autres = tous.filter(function (m) { return duService.indexOf(m) < 0; });
      var opt = function (m) { return h('option', { value: m.nom, 'data-id': m.id, text: m.nom + (m.aConfirmer ? ' — à confirmer' : m.statut === 'interimaire' ? ' — intérimaire' : ''), selected: m.nom === courant }); };
      sel.appendChild(h('option', { value: '', text: o.vide || '— Non attribué —' }));
      if (duService.length) sel.appendChild(h('optgroup', { label: 'Médecins du service' }, duService.map(opt)));
      if (autres.length) sel.appendChild(h('optgroup', { label: duService.length ? 'Autres médecins' : 'Médecins' }, autres.map(opt)));
      if (courant && !tous.some(function (m) { return m.nom === courant; })) {
        var m0 = MED.parNom(cfg, courant);
        sel.appendChild(h('option', { value: courant, 'data-id': m0 ? m0.id : '', text: courant + (m0 ? (m0.actif ? '' : ' — hors période') : ' (hors liste)'), selected: true }));
      }
      sel.appendChild(h('option', { value: '__nouveau', text: '+ Médecin non répertorié…' }));
    }
    remplir();
    sel.addEventListener('change', function () {
      if (sel.value !== '__nouveau') { courant = sel.value; return; }
      sel.value = courant;
      modalePropose({ service: o.service, fonction: o.fonction }, function (nom) { courant = nom; remplir(); });
    });
    var bloc = h('div', { class: 'champ-medecin' }, sel);
    bloc.select = sel;
    bloc.nom = function () { return sel.value === '__nouveau' ? '' : sel.value; };
    bloc.medecinId = function () { var x = sel.selectedOptions && sel.selectedOptions[0]; return (x && x.getAttribute('data-id')) || null; };
    return bloc;
  }
  /** Ajout d'un médecin non répertorié : utilisable aussitôt, à confirmer par le cadre ou la secrétaire. */
  function modalePropose(o, apres) {
    var nom = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Dr NOM' });
    var fonction = h('select', {}, Object.keys(MED.FONCTIONS).map(function (k) { return h('option', { value: k, text: MED.FONCTIONS[k], selected: k === (o.fonction || 'psychiatre') }); }));
    var gere = peutGerer();
    U.modale('Médecin non répertorié', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nom), h('label', {}, 'Fonction', fonction)),
      h('small', { class: 'muted', text: gere ? 'Le médecin est ajouté à la liste commune.' : 'Le médecin est utilisable tout de suite, marqué « à confirmer » : le cadre ou la secrétaire confirmera sa fiche, la corrigera ou la réunira avec un médecin déjà connu.' })), [
      { texte: 'Annuler' },
      { texte: 'Ajouter', classe: 'primaire', action: async function () {
        var n = nom.value.trim(), cfg = U.config();
        if (!n) throw new Error('Indiquez le nom du médecin.');
        var deja = MED.parNom(cfg, n);
        if (deja) { if (apres) apres(deja.nom); U.toast(deja.nom + ' figure déjà dans la liste.'); return; }
        var brut = cfg.medecins && !Array.isArray(cfg.medecins) ? cfg.medecins : {};
        var l = MED.liste(cfg), m = { id: MED.slug(n) + '-' + C.hex(C.aleatoire(2)), nom: n, fonction: fonction.value, services: o.service ? [o.service] : [], statut: 'titulaire', actif: true };
        if (!gere) Object.assign(m, { aConfirmer: true, propose: { par: moi().id, nom: moi().nom, le: new Date().toISOString(), service: o.service || '' } });
        l.push(m);
        var v = Object.assign({}, brut, { liste: l.map(function (x) { return MED.normaliser(x); }) });
        await U.enregistrerConfig(gere ? [['medecins', v], ['psychiatres', MED.psychiatres(v.liste)]] : [['medecins', v]]);
        if (apres) apres(n);
        U.toast(gere ? n + ' ajouté à la liste des médecins.' : n + ' ajouté, à confirmer par le cadre ou la secrétaire.');
      } }]);
  }

  // ------------------------------------------------------------ Fiches à confirmer, noms à rattacher (gestionnaires)
  async function enregistrerBrut(changer) {
    var cfg = U.config(), brut = cfg.medecins && !Array.isArray(cfg.medecins) ? cfg.medecins : {};
    var v = changer({ liste: MED.liste(cfg), gestion: brut.gestion, refuses: MED.refuses(cfg) });
    var x = { liste: v.liste.map(function (m) { return MED.normaliser(m); }) };
    if (v.gestion) x.gestion = v.gestion;
    if (v.refuses && v.refuses.length) x.refuses = v.refuses;
    await U.enregistrerConfig([['medecins', x], ['psychiatres', MED.psychiatres(x.liste)]]);
  }
  function refuser(nom) {
    return enregistrerBrut(function (v) { v.liste = v.liste.filter(function (m) { return !(m.aConfirmer && m.nom === nom); }); if (!MED.estRefuse(U.config(), nom)) v.refuses.push(nom); return v; });
  }
  /** Réunir un nom (fiche à confirmer ou nom hors liste) avec un médecin existant : les saisies le suivent. */
  function modaleReunir(nom, apres) {
    var cibles = MED.liste(U.config()).filter(function (m) { return !m.aConfirmer && m.nom !== nom; });
    var sel = h('select', { 'aria-label': 'Médecin' }, [h('option', { value: '', text: '— Choisir le médecin —' })].concat(cibles.map(function (m) { return h('option', { value: m.id, text: m.nom }); })));
    U.modale('Réunir « ' + nom + ' » avec un médecin de la liste', h('div', { class: 'pile' }, h('label', {}, 'C’est le même médecin que', sel),
      h('small', { class: 'muted', text: '« ' + nom + ' » devient un ancien nom de ce médecin : les saisies faites sous ce nom (fiches patients, Isocont, Suivi médical) le suivent.' })), [
      { texte: 'Annuler' },
      { texte: 'Réunir', classe: 'primaire', action: async function () {
        if (!sel.value) throw new Error('Choisissez le médecin.');
        await enregistrerBrut(function (v) { v.liste = MED.reunir(v.liste, nom, sel.value); v.refuses = v.refuses.filter(function (x) { return x.toLowerCase() !== nom.toLowerCase(); }); return v; });
        U.toast('Réuni.'); if (apres) apres();
      } }]);
  }
  function actionsAConfirmer(m, apres) {
    return h('span', { class: 'actions gauche' },
      h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { modaleMedecin(m, apres); } }, 'Confirmer…'),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleReunir(m.nom, apres); } }, 'Réunir avec…'),
      h('button', { class: 'btn petit danger', type: 'button', onclick: async function () {
        if (!confirm('Refuser la fiche « ' + m.nom + ' » ? Le nom reste écrit dans les saisies déjà faites, marqué « hors liste ».')) return;
        try { await refuser(m.nom); U.toast('Fiche refusée.'); if (apres) apres(); } catch (e) { alert(e.message); }
      } }, 'Refuser'));
  }
  /** Bandeau affiché dans toutes les fenêtres des gestionnaires de la liste tant que des fiches sont à confirmer. */
  function bandeauAConfirmer() {
    if (!peutGerer()) return null;
    var l = MED.aConfirmer(U.config());
    if (!l.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('h2', { text: l.length > 1 ? l.length + ' médecins non répertoriés à confirmer' : 'Un médecin non répertorié à confirmer' }),
      h('ul', { class: 'liste-simple' }, l.map(function (m) {
        return h('li', {}, h('b', { text: m.nom }), h('span', { text: ' — ' + MED.FONCTIONS[m.fonction] + (m.propose ? ', ajouté par ' + (m.propose.nom || U.App.session.nomAuteur(m.propose.par)) + (m.propose.le ? ' le ' + U.date(Date.parse(m.propose.le)) : '') + (m.propose.service ? ' (' + U.libService(m.propose.service) + ')' : '') : '') + ' ' }),
          actionsAConfirmer(m, U.rendreContenu));
      })));
  }
  /** Noms saisis hors liste dans les fiches patients, Isocont et le Suivi médical. */
  function nomsSaisis() {
    var res = [], st = U.st() || {}, push = function (n, src) { if (n) res.push({ nom: n, source: src }); };
    Object.keys(st.patients || {}).forEach(function (k) { var p = st.patients[k]; if (p.medecin1 && !p.medecin1Id) push(p.medecin1, 'fiches patients'); if (p.medecin2 && !p.medecin2Id) push(p.medecin2, 'fiches patients'); });
    Object.keys(st.mesures || {}).forEach(function (k) { var m = st.mesures[k]; push(m.psychiatreDebut, 'isolement et contention'); push(m.psychiatreFin, 'isolement et contention'); (m.pauses || []).forEach(function (x) { push(x.psychiatre, 'isolement et contention'); }); });
    var sm = U.App.session.etatModule && U.App.session.etatModule('suivi');
    if (sm) { Object.keys(sm.presences || {}).forEach(function (k) { push(sm.presences[k].medecin, 'présences'); push(sm.presences[k].remplacant, 'présences'); }); Object.keys(sm.suivis || {}).forEach(function (k) { push(sm.suivis[k].medecin, 'entretiens'); }); }
    return res;
  }
  function sectionRattacher() {
    if (!peutGerer()) return null;
    var l = MED.nonRattaches(U.config(), nomsSaisis());
    return h('section', { class: 'panneau' }, h('h2', { text: 'Noms à rattacher' }),
      h('p', { class: 'muted', text: 'Noms de médecins écrits dans les saisies, absents de la liste commune : créez leur fiche, rattachez-les à un médecin déjà connu (le nom devient un ancien nom : les saisies le suivent), ou laissez-les tels quels (« hors liste »).' }),
      l.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nom saisi', 'Où', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, l.map(function (x) {
          return h('tr', {}, h('td', {}, h('b', { text: x.nom })), h('td', { text: Object.keys(x.sources).map(function (k) { return k + ' (' + x.sources[k] + ')'; }).join(', ') }),
            h('td', { class: 'actions-ligne' },
              h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleMedecin({ nouveau: true, nom: x.nom, fonction: 'psychiatre', services: [], statut: 'titulaire', debut: '', fin: '', compte: null, actif: true, anciensNoms: [] }); } }, 'Créer la fiche'),
              h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleReunir(x.nom, U.rendreContenu); } }, 'Rattacher à…'),
              h('button', { class: 'btn petit', type: 'button', onclick: async function () { try { await enregistrerBrut(function (v) { v.refuses.push(x.nom); return v; }); U.toast('Laissé hors liste.'); } catch (e) { alert(e.message); } } }, 'Laisser tel quel')));
        })))) : h('p', { class: 'muted', text: 'Tous les noms saisis sont dans la liste.' }));
  }

  U.medecins = { vue: vue, champ: champ, modalePropose: modalePropose, bandeauAConfirmer: bandeauAConfirmer, modaleListe: modaleListe, modaleMedecin: modaleMedecin, enregistrerListe: enregistrerListe, peutGerer: peutGerer };
})();
