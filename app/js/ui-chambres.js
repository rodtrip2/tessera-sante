// SPDX-License-Identifier: EUPL-1.2
/*
 * Chambres et lits — interface (0.29.0, décisions du porteur du 11 novembre 2026). Logique : chambres.js.
 * Liste des pièces d'un service (Administration → Patients → Chambres et lits, cadre et administrateur) ; choix du lit
 * dans une liste (séjour du patient) ; un lit déjà occupé : Tessera propose de déplacer l'autre patient, en cascade, puis
 * enregistre les déplacements du dernier au premier.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, K = SIC.chambres;
  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  /** Fiches avec leurs séjours (module Patients si la clé est détenue, sinon celles de l'état affiché). */
  function fiches() {
    try { var e = s().detientCle('patients') ? s().etatModule('patients') : null; if (e && e.fiches) return e.fiches; } catch (err) { /* état affiché */ }
    return (U.st() && U.st().patients) || {};
  }
  function nom(id) { var f = fiches()[id] || (U.st() && U.st().patients || {})[id] || {}; return ((f.nom || '?') + ' ' + (f.prenom || '')).trim(); }

  // ------------------------------------------------------------ Administration : liste des pièces d'un service
  var vueAdmin = { service: null };
  function panneau() {
    var svs = (s().roles().indexOf('ADMIN') >= 0 ? U.tousServices() : U.services());
    if (!svs.length) return h('section', { class: 'panneau' }, h('h2', { text: 'Chambres et lits' }), h('p', { class: 'muted', text: 'Aucun service.' }));
    var sv = vueAdmin.service && svs.some(function (x) { return x.code === vueAdmin.service; }) ? vueAdmin.service : svs[0].code;
    var l = K.liste(cfg(), sv), depart = !l, travail = JSON.parse(JSON.stringify(l || K.listeDepart(cfg(), sv)));
    travail.pieces = travail.pieces.map(function (p, i) { return K.piece(p, i); }).filter(Boolean);
    var sel = h('select', { 'aria-label': 'Service', class: 'champ-moyen', onchange: function () { vueAdmin.service = sel.value; U.rendreContenu(); } }, svs.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === sv }); }));
    var corps = h('tbody');
    function dessiner() {
      U.vider(corps);
      travail.pieces.forEach(function (p, i) {
        var nomI = h('input', { type: 'text', maxlength: 40, value: p.nom, 'aria-label': 'Nom (ligne ' + (i + 1) + ')', oninput: function () { p.nom = nomI.value; } });
        var typ = h('select', { 'aria-label': 'Type (ligne ' + (i + 1) + ')', onchange: function () { p.type = typ.value; dessiner(); } }, Object.keys(K.TYPES).map(function (k) { return h('option', { value: k, text: K.TYPES[k], selected: p.type === k }); }));
        var lits = h('input', { type: 'text', maxlength: 60, value: p.type === 'piece' ? '' : p.lits.filter(Boolean).join(', '), placeholder: 'vide : un lit', disabled: p.type === 'piece', 'aria-label': 'Lits (ligne ' + (i + 1) + ')', oninput: function () { p.lits = lits.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); } });
        var nat = p.type === 'piece' ? h('select', { 'aria-label': 'Nature (ligne ' + (i + 1) + ')', onchange: function () { p.nature = nat.value; } }, Object.keys(K.NATURES).map(function (k) { return h('option', { value: k, text: K.NATURES[k], selected: p.nature === k }); })) : h('span', { class: 'muted', text: '—' });
        var usage = p.type === 'piece' ? h('input', { type: 'checkbox', checked: !!p.usage, 'aria-label': 'Utilisée par les patients (ligne ' + (i + 1) + ')', onchange: function () { p.usage = usage.checked; } }) : null;
        corps.appendChild(h('tr', {}, h('td', {}, nomI), h('td', {}, typ), h('td', {}, lits), h('td', {}, nat), h('td', {}, usage),
          h('td', { class: 'actions-ligne' },
            h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Monter', disabled: i === 0, onclick: function () { travail.pieces.splice(i - 1, 0, travail.pieces.splice(i, 1)[0]); dessiner(); } }, '↑'),
            h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la ligne ' + (i + 1), onclick: function () { travail.pieces.splice(i, 1); dessiner(); } }, '✕'))));
      });
    }
    dessiner();
    function ajouter(type) { travail.pieces.push({ id: 'p' + SIC.crypto.hex(SIC.crypto.aleatoire(3)), nom: '', type: type, lits: type === 'piece' ? [] : [''], nature: type === 'piece' ? 'bureau' : '', usage: false, w: 1, h: 1 }); dessiner(); }
    return h('section', { class: 'panneau' }, h('h2', { text: 'Chambres et lits' }),
      h('p', { class: 'muted', text: 'Une ligne par pièce. Chambre : ses lits séparés par des virgules (ex. « P, F » pour 417 P et 417 F ; vide pour une chambre à un lit). Les chambres de soins intensifs (CSI) de cette liste deviennent les lieux d’isolement du service. Les autres pièces n’ont pas de lit ; cochez « Utilisée par les patients » pour y montrer un patient sur le plan.' }),
      h('label', { class: 'en-ligne' }, 'Service', sel),
      depart ? h('p', { class: 'info', text: 'Liste pas encore réglée pour ce service : les lieux d’isolement déjà réglés sont repris comme CSI. Complétez puis enregistrez.' }) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'sans-tri ch-liste' }, h('thead', {}, h('tr', {}, ['Nom', 'Type', 'Lits', 'Nature (autre pièce)', 'Utilisée par les patients', ''].map(function (t) { return h('th', { text: t }); }))), corps)),
      h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { ajouter('chambre'); } }, '+ Chambre'), h('button', { class: 'btn petit', type: 'button', onclick: function () { ajouter('csi'); } }, '+ CSI'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { ajouter('piece'); } }, '+ Autre pièce')),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          var vus = {};
          travail.pieces.forEach(function (p) { var n = (p.nom || '').trim(); if (!n) throw new Error('Chaque ligne a un nom.'); if (vus[n.toLowerCase()]) throw new Error('Deux pièces s’appellent « ' + n + ' ».'); vus[n.toLowerCase()] = 1; });
          // Lit retiré alors qu'un patient l'occupe : avertir
          var gardes = K.occupation(fiches(), sv), nouv = { chambres: {} }; nouv.chambres[sv] = { colonnes: travail.colonnes || 8, pieces: travail.pieces };
          var perdus = Object.keys(gardes).filter(function (k) { return !K.lits(nouv, sv).some(function (x) { return x.cle === k; }); });
          if (perdus.length && !confirm('Des patients occupent des lits retirés ou renommés (' + perdus.map(function (k) { return k.replace('|', ' '); }).join(', ') + ') : leur lit restera affiché tel quel jusqu’à un changement. Enregistrer ?')) return;
          var v = JSON.parse(JSON.stringify(cfg().chambres || {}));
          v[sv] = { colonnes: travail.colonnes || 8, pieces: travail.pieces.map(function (p) { var x = { id: p.id, nom: p.nom.trim(), type: p.type }; if (p.type !== 'piece') x.lits = (p.lits || []).filter(Boolean); else { x.nature = p.nature; if (p.usage) x.usage = true; } ['x', 'y', 'w', 'h', 'couleur'].forEach(function (k) { if (p[k] != null && p[k] !== '') x[k] = p[k]; }); return x; }) };
          await U.enregistrerConfig([['chambres', v]]);
          U.toast('Chambres et lits enregistrés.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }

  // ------------------------------------------------------------ Choix du lit (séjour)
  /**
   * Champ « Lit » d'un séjour : liste des lits du service (occupation affichée) si la liste est réglée, sinon chambre et
   * lit en texte libre. Renvoie { noeud, valeur(): { chambre, lit }, service(sv) }.
   */
  function selecteurLit(service, chambre, lit, patient) {
    var zone = h('div', { class: 'grille-2' }), courant = { chambre: chambre || '', lit: lit || '' }, lire = function () { return courant; };
    function dessiner(sv) {
      U.vider(zone);
      var ls = K.lits(cfg(), sv);
      if (!ls.length) {
        var c = h('input', { type: 'text', value: courant.chambre, placeholder: 'ex. 412', 'aria-label': 'Chambre' }), l = h('input', { type: 'text', value: courant.lit, placeholder: 'ex. U, P, F', 'aria-label': 'Lit' });
        zone.appendChild(h('label', {}, 'Chambre', c)); zone.appendChild(h('label', {}, 'Lit', l));
        lire = function () { return { chambre: c.value.trim(), lit: l.value.trim().toUpperCase() }; };
        return;
      }
      var occ = K.occupation(fiches(), sv), k0 = K.cle(courant.chambre, courant.lit), connu = ls.some(function (x) { return x.cle === k0; });
      var sel = h('select', { 'aria-label': 'Chambre et lit' }, [h('option', { value: '', text: '— Aucun lit —' })]
        .concat(!connu && courant.chambre ? [h('option', { value: k0, text: K.libelle(courant.chambre, courant.lit) + ' (hors de la liste)', selected: true })] : [])
        .concat(ls.map(function (x) {
          var o = (occ[x.cle] || []).filter(function (y) { return y.patient !== patient; });
          return h('option', { value: x.cle, text: x.libelle + (x.csi ? ' (CSI)' : '') + (o.length ? ' — occupé : ' + o.map(function (y) { return nom(y.patient); }).join(', ') : ' — libre'), selected: x.cle === k0 });
        })));
      zone.appendChild(h('label', {}, 'Chambre et lit', sel));
      zone.appendChild(h('small', { class: 'muted', text: 'Un lit occupé : Tessera proposera de déplacer l’autre patient.' }));
      lire = function () { var v = sel.value.split('|'); return { chambre: v[0] || '', lit: v[1] || '' }; };
    }
    dessiner(service);
    return { noeud: zone, valeur: function () { return lire(); }, service: function (sv) { courant = lire(); dessiner(sv); } };
  }

  /** Choix d'un lit pour un patient délogé : Promise du lit choisi { chambre, lit }, 'laisser', ou null (abandon). */
  function demanderLit(sv, deloge, litPris, liberes, deplaces) {
    return new Promise(function (resoudre) {
      var fini = false, occ = K.occupation(fiches(), sv);
      var libres = K.libres(cfg(), fiches(), sv, liberes).filter(function (l) { return !deplaces.some(function (m) { return K.cle(m.chambre, m.lit) === l.cle; }); });
      var occupes = K.lits(cfg(), sv).filter(function (l) { return !libres.some(function (x) { return x.cle === l.cle; }) && l.cle !== litPris && !deplaces.some(function (m) { return K.cle(m.chambre, m.lit) === l.cle; }); });
      var sel = h('select', { 'aria-label': 'Nouveau lit' },
        [h('optgroup', { label: 'Lits libres' }, libres.map(function (l) { return h('option', { value: l.cle, text: l.libelle + (l.csi ? ' (CSI, chambre ouverte)' : '') + ((occ[l.cle] || []).length ? ' — libéré par ' + occ[l.cle].map(function (y) { return nom(y.patient); }).join(', ') : '') }); }))]
          .concat(occupes.length ? [h('optgroup', { label: 'Lits occupés (déplacement en cascade)' }, occupes.map(function (l) { return h('option', { value: l.cle, text: l.libelle + ' — ' + (occ[l.cle] || []).map(function (y) { return nom(y.patient); }).join(', ') }); }))] : [])
          .concat([h('option', { value: '__laisser', text: 'Le laisser sur ce lit (deux patients : à régler)' })]));
      U.modale('Lit occupé', h('div', { class: 'pile' }, h('p', { text: 'Le lit ' + litPris.replace('|', ' ').trim() + ' est occupé par ' + nom(deloge) + '. Où le placer ?' }), h('label', {}, 'Nouveau lit de ' + nom(deloge), sel)),
        [{ texte: 'Annuler tout' }, { texte: 'Continuer', classe: 'primaire', action: function () { fini = true; if (sel.value === '__laisser') resoudre('laisser'); else { var v = sel.value.split('|'); resoudre({ chambre: v[0], lit: v[1] || '' }); } } }])
        .then(function () { if (!fini) resoudre(null); });
    });
  }
  /**
   * Déplacements nécessaires pour mettre `patient` sur le lit (chambre, lit) du service : [{ patient, sejour, chambre, lit }],
   * en demandant où placer chaque patient délogé (en cascade), ou null si l'agent abandonne.
   */
  async function cascade(sv, patient, chambre, lit) {
    var moves = [{ patient: patient, chambre: chambre, lit: lit }], liberes = [patient], cible = { chambre: chambre, lit: lit };
    for (var n = 0; n < 20 && cible.chambre; n++) {
      var occ = (K.occupation(fiches(), sv)[K.cle(cible.chambre, cible.lit)] || []).filter(function (y) { return !moves.some(function (m) { return m.patient === y.patient; }); })[0];
      if (!occ) break;
      var choix = await demanderLit(sv, occ.patient, K.cle(cible.chambre, cible.lit), liberes, moves);
      if (choix === null) return null;
      if (choix === 'laisser') break;
      moves.push({ patient: occ.patient, sejour: occ.sejour, chambre: choix.chambre, lit: choix.lit });
      liberes.push(occ.patient); cible = choix;
    }
    return moves;
  }
  /** Enregistre un séjour et les déplacements qu'il entraîne (du dernier au premier). */
  async function enregistrerSejour(d, sv) {
    var moves = d.chambre !== undefined || d.lit !== undefined ? await cascade(sv, d.patientId, d.chambre !== undefined ? d.chambre : '', d.lit !== undefined ? d.lit : '') : [{ patient: d.patientId }];
    if (!moves) return false;
    var autres = moves.slice(1);
    if (autres.length && !confirm('Déplacements à enregistrer :\n' + moves.map(function (m) { return '• ' + nom(m.patient) + ' → ' + (K.libelle(m.chambre, m.lit) || 'aucun lit'); }).join('\n') + '\n\nConfirmer ?')) return false;
    var ordre = K.ordreEcriture(autres);
    for (var i = 0; i < ordre.length; i++) await s().enregistrer('SEJOUR', { patientId: ordre[i].patient, sejourId: ordre[i].sejour, chambre: ordre[i].chambre, lit: ordre[i].lit });
    await s().enregistrer('SEJOUR', d);
    return moves.length;
  }

  U.chambres = { panneau: panneau, selecteurLit: selecteurLit, cascade: cascade, enregistrerSejour: enregistrerSejour, fiches: fiches, nom: nom };
})();
