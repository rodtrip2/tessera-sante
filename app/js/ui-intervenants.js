// SPDX-License-Identifier: EUPL-1.2
/*
 * Patients — professionnels ou structures participant à la prise en charge (0.21.0) : rubrique de la fiche patient,
 * répertoire commun, réglage des types et des champs ajoutés. Modèle : intervenants.js ; saisies du module Patients.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, K = SIC.intervenants, C = SIC.crypto;
  function etat() { var s = U.App.session; try { return (s && s.etatModule('patients')) || {}; } catch (e) { return {}; } }
  function peut() { try { return U.App.session.peut('PRISE_EN_CHARGE') && !U.App.session.apercu; } catch (e) { return false; } }
  function resume(i) { return i.nom + (i.contact ? ' — ' + i.contact : ''); }

  /** Fenêtre d'une fiche du répertoire (création ou modification) ; `puis(fiche)` après l'enregistrement. */
  function modaleIntervenant(i, puis) {
    var g = K.reglages(U.config()), x = i || { type: g.types[0].code, champs: {} };
    var type = h('select', { 'aria-label': 'Type' }, g.types.map(function (t) { return h('option', { value: t.code, text: t.libelle, selected: x.type === t.code }); }));
    var nom = h('input', { type: 'text', maxlength: 120, value: x.nom || '', placeholder: 'ex. Cabinet infirmier du Centre (fictif)' });
    var contact = h('input', { type: 'text', maxlength: 120, value: x.contact || '', placeholder: 'Téléphone, adresse de messagerie professionnelle' });
    var com = h('textarea', { rows: 2, maxlength: 300, placeholder: 'ex. Passages matin et soir ; prévenir 48 h avant une sortie' }, x.commentaire || '');
    var champs = g.champs.map(function (c) { var inp = h('input', { type: 'text', maxlength: 200, value: (x.champs || {})[c.code] || '' }); return { code: c.code, noeud: h('label', {}, c.libelle, inp), lire: function () { return inp.value; } }; });
    U.modale(i ? 'Modifier : ' + i.nom : 'Nouveau professionnel ou nouvelle structure', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Type', type), h('label', {}, 'Nom', nom)),
      h('label', {}, 'Contact', contact), champs.map(function (c) { return c.noeud; }), h('label', {}, 'Commentaire (commun à tous les patients)', com),
      h('small', { class: 'muted', text: 'Coordonnées professionnelles seulement, aucune donnée clinique. Cette fiche est commune : elle sert pour tous les patients suivis par ce professionnel ou cette structure.' })), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var ch = {}; champs.forEach(function (c) { ch[c.code] = c.lire(); });
        var d = K.normaliser({ id: x.id || 'IV' + C.hex(C.aleatoire(5)), type: type.value, nom: nom.value, contact: contact.value, commentaire: com.value, champs: ch }, U.config());
        await U.App.session.enregistrer('INTERVENANT', d);
        U.toast('Enregistré.');
        if (puis) setTimeout(function () { puis(d); }, 0);
      } }]);
  }

  /** Rubrique de la fiche patient. `rouvrir` : rouvre la fiche après une fenêtre intermédiaire. */
  function section(fiche, rouvrir) {
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      var f = (etat().fiches || {})[fiche.id] || fiche, liens = K.dePatient(etat(), f), ok = peut();
      zone.appendChild(liens.length ? h('ul', { class: 'liste-simple' }, liens.map(function (l) {
        var i = l.intervenant;
        return h('li', { class: 'agenda-point' }, h('span', {}, h('span', { class: 'badge', text: K.libType(U.config(), i.type) }), ' ', h('b', { text: i.nom }), i.contact ? ' — ' + i.contact : '',
          K.reglages(U.config()).champs.filter(function (c) { return (i.champs || {})[c.code]; }).map(function (c) { return h('small', { class: 'muted', text: ' · ' + c.libelle + ' : ' + i.champs[c.code] }); }),
          i.commentaire ? h('small', { class: 'muted', text: ' · ' + i.commentaire }) : null, l.commentaire ? h('div', {}, h('small', { text: 'Pour ce patient : ' + l.commentaire })) : null,
          l.tiers ? h('span', { class: 'badge', title: 'Information d’un tiers : exclue du droit d’accès du patient', text: 'tiers' }) : null),
          ok ? h('span', { class: 'actions' },
            h('button', { class: 'btn petit', type: 'button', title: 'Information d’un tiers : exclue du droit d’accès du patient', onclick: function () { ecrire({ patientId: fiche.id, lien: l.lien, intervenant: i.id, commentaire: l.commentaire || '', tiers: !l.tiers }, l.tiers ? 'N’est plus marqué « tiers ».' : 'Marqué « information d’un tiers ».'); } }, l.tiers ? 'Pas un tiers' : 'Tiers'),
            h('button', { class: 'btn petit', type: 'button', onclick: function () { var c = prompt('Commentaire pour ce patient (court, sans donnée clinique) :', l.commentaire || ''); if (c !== null) ecrire({ patientId: fiche.id, lien: l.lien, intervenant: i.id, commentaire: c.trim().slice(0, 300), tiers: !!l.tiers }, 'Commentaire enregistré.'); } }, 'Commentaire…'),
            h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleIntervenant(i, rouvrir); } }, 'Modifier la fiche…'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { if (confirm('Retirer « ' + i.nom + ' » de la prise en charge de ce patient ? Sa fiche reste dans le répertoire.')) ecrire({ patientId: fiche.id, lien: l.lien, retire: true }, 'Retiré de la fiche.'); } }, 'Retirer')) : null);
      })) : h('p', { class: 'muted', text: 'Aucun professionnel ni structure indiqué.' }));
      if (!ok) return;
      var deja = liens.map(function (l) { return l.intervenant.id; }), rep = K.repertoire(etat()).filter(function (i) { return deja.indexOf(i.id) < 0; });
      var sel = h('select', { 'aria-label': 'Ajouter depuis le répertoire' }, [h('option', { value: '', text: rep.length ? 'Choisir dans le répertoire…' : 'Répertoire vide' })].concat(rep.map(function (i) { return h('option', { value: i.id, text: resume(i) + ' (' + K.libType(U.config(), i.type) + ')' }); })));
      function lier(id) { return ecrire({ patientId: fiche.id, lien: 'L' + C.hex(C.aleatoire(4)), intervenant: id, commentaire: '' }, 'Ajouté à la fiche.'); }
      zone.appendChild(h('div', { class: 'actions gauche' }, sel, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (sel.value) lier(sel.value); } }, 'Ajouter'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleIntervenant(null, function (d) { lier(d.id).then(function () { if (rouvrir) rouvrir(); }); }); } }, '+ Nouveau professionnel ou nouvelle structure…')));
    }
    async function ecrire(d, msg) { try { await U.App.session.enregistrer('PRISE_EN_CHARGE', d); U.toast(msg); dessiner(); } catch (e) { alert(e.message); } }
    dessiner();
    return h('div', { class: 'pile' }, h('b', { text: 'Professionnels ou structures participant à la prise en charge' }), zone);
  }

  /** Administration (administrateur, cadre) : types proposés, champs ajoutés, répertoire. */
  function panneau() {
    var g = K.reglages(U.config()), types = g.types.map(function (t) { return Object.assign({}, t); }), champs = g.champs.map(function (t) { return Object.assign({}, t); });
    var zT = h('div', { class: 'pile' }), zC = h('div', { class: 'pile' });
    function code(lib) { return (String(lib).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 24) || 'x') + '-' + Date.now().toString(36).slice(-3); }
    function editeur(zone, liste, exemple, vide) {
      U.vider(zone);
      liste.forEach(function (t, i) {
        var inp = h('input', { type: 'text', maxlength: 80, value: t.libelle, 'aria-label': 'Libellé', oninput: function () { t.libelle = inp.value; } });
        zone.appendChild(h('div', { class: 'actions gauche' }, inp, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { liste.splice(i, 1); editeur(zone, liste, exemple, vide); } }, 'Retirer')));
      });
      if (!liste.length && vide) zone.appendChild(h('p', { class: 'muted', text: vide }));
      var nv = h('input', { type: 'text', maxlength: 80, placeholder: exemple });
      zone.appendChild(h('div', { class: 'actions gauche' }, nv, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (nv.value.trim()) { liste.push({ code: code(nv.value), libelle: nv.value.trim() }); editeur(zone, liste, exemple, vide); } } }, 'Ajouter')));
    }
    editeur(zT, types, 'ex. Service d’aide à domicile'); editeur(zC, champs, 'ex. Jours de passage, référent de la structure', 'Aucun champ ajouté : type, nom, contact et commentaire.');
    var rep = K.repertoire(etat());
    return h('section', { class: 'panneau' }, h('h2', { text: 'Professionnels ou structures participant à la prise en charge' }),
      h('p', { class: 'muted', text: 'Rubrique de la fiche patient : infirmier libéral à domicile, foyer, hôpital de jour… Chaque professionnel ou structure est saisi une fois dans un répertoire commun, puis rattaché aux patients qu’il suit. Coordonnées professionnelles seulement, aucune donnée clinique. Ces types servent aussi aux tâches suggérées de l’agenda (ex. « Appeler l’infirmier libéral » avant une sortie).' }),
      h('div', { class: 'grille-2' }, h('div', { class: 'pile' }, h('b', { text: 'Types proposés' }), zT), h('div', { class: 'pile' }, h('b', { text: 'Champs ajoutés à chaque fiche' }), zC)),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try { await U.enregistrerConfig([['intervenants', { types: types.filter(function (t) { return t.libelle.trim(); }), champs: champs.filter(function (t) { return t.libelle.trim(); }) }]]); U.toast('Réglages enregistrés.'); } catch (e) { alert(e.message); }
      } }, 'Enregistrer')),
      h('h2', { text: 'Répertoire (' + rep.length + ')' }),
      rep.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Type' }), h('th', { text: 'Nom' }), h('th', { text: 'Contact' }), h('th', { text: 'Commentaire' }), h('th'))),
        h('tbody', {}, rep.map(function (i) {
          return h('tr', {}, h('td', { text: K.libType(U.config(), i.type) }), h('td', { text: i.nom }), h('td', { text: i.contact || '' }), h('td', { text: i.commentaire || '' }),
            h('td', {}, peut() ? [h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleIntervenant(i, function () { U.rendreContenu(); }); } }, 'Modifier'), ' ',
              h('button', { class: 'btn petit danger', type: 'button', onclick: async function () { if (!confirm('Retirer « ' + i.nom + ' » du répertoire ? Il disparaît des fiches des patients ; les saisies restent au journal.')) return; try { await U.App.session.enregistrer('INTERVENANT', { id: i.id, supprime: true }); U.toast('Retiré du répertoire.'); } catch (e) { alert(e.message); } } }, 'Retirer')] : null));
        })))) : h('p', { class: 'muted', text: 'Répertoire vide : il se remplit depuis les fiches des patients.' }),
      peut() ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleIntervenant(null, function () { U.rendreContenu(); }); } }, '+ Ajouter au répertoire…')) : null);
  }

  U.intervenants = { section: section, panneau: panneau, modaleIntervenant: modaleIntervenant };
})();
