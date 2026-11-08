// SPDX-License-Identifier: EUPL-1.2
/*
 * Liste commune des médecins — interface (décision du porteur du 8 novembre 2026). Logique : medecins.js.
 * Affichée dans la fenêtre Suivi médical (onglet Médecins) et ouverte depuis Administration → Réglages généraux.
 * Gestion : administrateur et rôles désignés (cadre et secrétaire par défaut), notamment pour les médecins intérimaires.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, MED = SIC.medecins;

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
      h('thead', {}, h('tr', {}, ['Nom', 'Fonction', 'Services', 'Statut', 'Compte Tessera', ''].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', {}, liste.map(function (m) {
        var termine = !MED.enActivite(m, Date.now()), c = m.compte ? comptes.filter(function (y) { return y.id === m.compte; })[0] : null;
        return h('tr', { class: termine ? 'ancienne' : '' }, h('td', {}, h('b', { text: m.nom }), m.anciensNoms.length ? h('div', {}, h('small', { class: 'muted', text: 'Anciens noms : ' + m.anciensNoms.join(', ') })) : null),
          h('td', { text: MED.FONCTIONS[m.fonction] }), h('td', { text: libServices(m) }),
          h('td', {}, h('span', { class: 'badge' + (m.statut === 'interimaire' ? ' warn' : ''), text: MED.STATUTS[m.statut] + (termine ? (m.actif ? ' — hors période' : ' — retiré') : '') }), libPeriode(m) ? h('div', {}, h('small', { class: 'muted', text: libPeriode(m) })) : null),
          h('td', { text: c ? c.nom : '—' }),
          h('td', { class: 'actions-ligne' }, gerer ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleMedecin(m, apres); } }, 'Modifier') : null));
      }))));
  }
  /** Vue de la liste (onglet Médecins de la fenêtre Suivi médical). */
  function vue() {
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Médecins' }),
        peutGerer() ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleMedecin(null); } }, '+ Nouveau médecin') : null),
      h('p', { class: 'muted', text: 'Liste commune à Tessera : médecins de 1re et 2e ligne de la fiche patient, psychiatre décisionnaire d’Isocont, présences et entretiens du Suivi médical. Les médecins n’ont pas besoin de compte ; leur nom pourra être rattaché plus tard à leur compte. Un intérimaire sort des listes de choix après sa période ; son nom reste dans l’historique.' }),
      tableau());
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
    if (m && !m.repris) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
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
      var nouveau = Object.assign(base, { id: (m && m.id) || MED.slug(n), fonction: fonction.value, services: choisis, statut: statut.value, debut: debut.value, fin: fin.value, compte: compte.value || null, actif: actif.checked });
      var i = m ? liste.map(function (y) { return y.id; }).indexOf(m.id) : -1;
      if (i >= 0) liste[i] = nouveau; else liste.push(nouveau);
      await enregistrerListe(liste);
      if (apres) apres();
    } });
    U.modale(m ? 'Modifier le médecin' : 'Nouveau médecin', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Nom', nom), h('label', {}, 'Fonction', fonction), h('label', {}, 'Statut', statut)),
      h('div', {}, h('b', { text: 'Services' }), h('div', { class: 'actions gauche' }, cases), h('small', { class: 'muted', text: 'Aucun coché : proposé dans tous les services.' })),
      h('div', { class: 'grille-2' }, h('label', {}, 'Présent du (intérimaire, vacation)', debut), h('label', {}, 'au (facultatif)', fin)),
      h('label', {}, 'Compte Tessera rattaché' + (admin ? '' : ' (administrateur)'), compte),
      h('small', { class: 'muted', text: 'Changer le nom ou rattacher un compte ne coupe aucun lien : les saisies déjà faites (fiches patients, présences, entretiens, Isocont) suivent le médecin. Les anciens noms restent reconnus.' + (m && m.anciensNoms.length ? ' Anciens noms : ' + m.anciensNoms.join(', ') + '.' : '') }),
      h('label', { class: 'case' }, actif, h('span', { text: 'En activité (proposé dans les listes de choix)' }))), boutons, { large: true });
  }

  U.medecins = { vue: vue, modaleListe: modaleListe, modaleMedecin: modaleMedecin, enregistrerListe: enregistrerListe, peutGerer: peutGerer };
})();
