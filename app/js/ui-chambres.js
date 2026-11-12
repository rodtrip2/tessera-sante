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
    try { var e = s().ouvert('patients') ? s().etatModule('patients') : null; if (e && e.fiches) return e.fiches; } catch (err) { /* état affiché */ }
    return (U.st() && U.st().patients) || {};
  }
  /** Nom affiché d'un patient : celui de l'état affiché d'abord (identité réduite selon le rôle : initiales…). */
  function nom(id) { var f = (U.st() && U.st().patients || {})[id] || fiches()[id] || {}; return ((f.nom || '?') + ' ' + (f.prenom || '')).trim(); }

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

  // ------------------------------------------------------------ Plan du service (0.29.1)
  var LIB_COULEURS = { '': 'Sans couleur', bleu: 'Bleu', vert: 'Vert', jaune: 'Jaune', orange: 'Orange', rouge: 'Rouge', violet: 'Violet', gris: 'Gris' };
  var vuePlanEtat = { service: null, edition: null };
  function peutRegler(sv) { var r = s().roles(); return !s().apercu && (r.indexOf('ADMIN') >= 0 || (r.indexOf('CADRE') >= 0 && U.services().some(function (x) { return x.code === sv; }))); }
  /** Mesures en cours du service, lues dans Isocont si l'agent en détient la clé (sinon le plan s'en passe). */
  function mesures(sv) {
    try { var e = s().ouvert('isocont') ? s().etatModule('isocont') : null; return e ? SIC.modules.lire('isocont.enCours', e, { services: [sv] }) || [] : []; } catch (err) { return []; }
  }
  function ouvrirFiche(id) {
    var full = ((U.st() && U.st().patients) || {})[id] || fiches()[id];
    if (full && U.fichePatient) U.fichePatient.modale(full);
  }
  function placer(sv, patient, piece) {
    var f = fiches()[patient], sj = f && K.sejourEnCours(f, sv);
    if (!sj) return U.toast('Aucun séjour en cours pour ce patient dans ce service.');
    return s().enregistrer('SEJOUR', { patientId: patient, sejourId: sj.id, placement: piece ? { piece: piece } : null }).then(function () { U.toast(piece ? nom(patient) + ' : ' + piece + ' (chambre gardée).' : nom(patient) + ' : retour en chambre.'); U.rendreContenu(); }, function (e) { U.toast(e.message); });
  }
  /** Placement temporaire dans une pièce (chambre gardée) : choix du patient. */
  function modalePlacer(sv, p) {
    var o = K.occupation(fiches(), sv), ids = [];
    // Patients sur un lit du service, hors mesure en cours (déjà en CSI) et hors ceux déjà dans la pièce
    var enMesure = mesures(sv).map(function (m) { return m.patientId; }), dedans = (p.presents || []).map(function (y) { return y.patient; });
    Object.keys(o).forEach(function (k) { o[k].forEach(function (y) { if (ids.indexOf(y.patient) < 0 && enMesure.indexOf(y.patient) < 0 && dedans.indexOf(y.patient) < 0) ids.push(y.patient); }); });
    ids.sort(function (a, b) { return nom(a).localeCompare(nom(b)); });
    if (!ids.length) return U.toast('Aucun patient à placer (patients sur un lit du service, hors mesure en cours).');
    var sel = h('select', { 'aria-label': 'Patient à placer' }, ids.map(function (id) { return h('option', { value: id, text: nom(id) }); }));
    var occupe = p.type === 'csi' ? K.csiOccupee(cfg(), fiches(), sv, p.nom, null) : null;
    U.modale('Placer un patient : ' + p.nom, h('div', { class: 'pile' },
      h('p', { class: 'muted', text: p.type === 'csi' ? 'CSI en chambre ouverte (en fin de mesure, en attendant de regagner sa chambre…). Le patient garde sa chambre, estompée sur le plan.' : 'Le patient garde sa chambre, estompée sur le plan, tant qu’il est dans cette pièce.' }),
      occupe ? h('p', { class: 'alerte', text: 'Cette CSI est déjà occupée par ' + nom(occupe.patient) + '.' }) : null,
      h('label', {}, 'Patient', sel)),
      [{ texte: 'Annuler' }, { texte: 'Placer', classe: 'primaire', action: function () { placer(sv, sel.value, p.nom); } }]);
  }
  var LIB_ETAT = { present: '', ailleurs: 'chambre gardée', mesure: '', chambreOuverte: 'chambre ouverte', usage: '' };
  function bPatient(sv, y, peutPlacer) {
    var suffixe = y.etat === 'ailleurs' ? ' → ' + y.ou : (y.etat === 'mesure' ? ' — ' + (y.type || 'mesure') : (y.etat === 'chambreOuverte' ? ' — chambre ouverte' : ''));
    var b = h('button', { class: 'btn lien ch-patient etat-' + y.etat, type: 'button', title: 'Ouvrir la fiche du patient' + (LIB_ETAT[y.etat] ? ' (' + LIB_ETAT[y.etat] + ')' : ''), text: nom(y.patient) + suffixe, onclick: function () { ouvrirFiche(y.patient); } });
    var retour = peutPlacer && (y.etat === 'usage' || (y.etat === 'chambreOuverte' && y.du)) ? h('button', { class: 'btn petit', type: 'button', title: 'Retour en chambre', 'aria-label': 'Retour en chambre : ' + nom(y.patient), onclick: function () { placer(sv, y.patient, null); } }, '↩') : null;
    return h('div', { class: 'ch-occupant' }, b, retour);
  }
  function caseGrille(el, x, y, w, hh) { el.style.gridColumn = (x + 1) + ' / span ' + w; el.style.gridRow = (y + 1) + ' / span ' + hh; return el; }
  /** Plan d'un service (fenêtres Patients, Vue d'ensemble, Isolement et contention) : clic sur un patient → sa fiche. */
  function vuePlan() { return h('div', { class: 'pile' }, contenuPlan()); }
  function contenuPlan() {
    var svs = U.services();
    if (!svs.length) return [h('section', { class: 'panneau' }, h('p', { class: 'muted', text: 'Aucun service.' }))];
    var sv = U.App.service && U.App.service !== '*' && svs.some(function (x) { return x.code === U.App.service; }) ? U.App.service : (vuePlanEtat.service && svs.some(function (x) { return x.code === vuePlanEtat.service; }) ? vuePlanEtat.service : svs[0].code);
    var selSv = svs.length > 1 && (!U.App.service || U.App.service === '*') ? h('select', { 'aria-label': 'Service du plan', class: 'champ-moyen', onchange: function () { vuePlanEtat.service = selSv.value; vuePlanEtat.edition = null; U.rendreContenu(); } }, svs.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === sv }); })) : null;
    var l = K.liste(cfg(), sv), regle = peutRegler(sv);
    var barre = h('div', { class: 'barre' }, h('h1', { text: 'Plan du service' + (selSv ? '' : ' — ' + U.libService(sv)) }), selSv, h('div', { class: 'espace' }),
      l && regle && !vuePlanEtat.edition ? h('button', { class: 'btn', type: 'button', onclick: function () { vuePlanEtat.edition = { service: sv, pieces: K.disposer(l).map(function (p) { return Object.assign({}, p); }), colonnes: l.colonnes }; U.rendreContenu(); } }, 'Modifier le plan') : null);
    if (!l) return [barre, h('section', { class: 'panneau' }, h('p', { class: 'muted', text: 'La liste des chambres de ce service n’est pas encore réglée' + (regle ? ' : Administration → Patients → Chambres et lits.' : ' (réglage du cadre).') }))];
    if (vuePlanEtat.edition && vuePlanEtat.edition.service === sv) return [barre, editeurPlan(sv)];
    var pl = K.plan(cfg(), fiches(), sv, { mesures: mesures(sv) }), peutPlacer = !s().apercu && s().peut('SEJOUR');
    var grille = h('div', { class: 'ch-plan', role: 'list', 'aria-label': 'Plan du service' });
    grille.style.gridTemplateColumns = 'repeat(' + pl.colonnes + ', minmax(8.5rem, 1fr))';
    pl.pieces.forEach(function (p) {
      var corps = [];
      p.lits.forEach(function (x) {
        corps.push(h('div', { class: 'ch-lit' + (x.occupants.length > 1 ? ' conflit' : '') }, x.nom ? h('span', { class: 'ch-nom-lit', text: x.nom }) : null,
          x.occupants.length ? x.occupants.map(function (y) { return bPatient(sv, y, peutPlacer); }) : (p.presents.length && !x.nom ? null : h('span', { class: 'muted', text: 'libre' }))));
      });
      p.presents.forEach(function (y) { corps.push(bPatient(sv, y, peutPlacer)); });
      var simple = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9à-ÿ]/g, ''); };
      var placable = peutPlacer && (p.type === 'csi' || (p.type === 'piece' && p.usage));
      var titre = p.type === 'csi' ? U.lieu('CSI') : (p.type === 'piece' ? K.NATURES[p.nature] || '' : (p.lits.length > 1 ? p.lits.length + ' lits' : ''));
      grille.appendChild(caseGrille(h('div', { class: 'ch-piece type-' + p.type + (p.couleur ? ' couleur-' + p.couleur : '') + (p.presents.some(function (y) { return y.etat === 'mesure'; }) ? ' en-mesure' : ''), role: 'listitem' },
        h('div', { class: 'ch-tete' }, h('b', { text: p.nom }), titre && simple(p.nom).indexOf(simple(titre)) < 0 ? h('small', { class: 'muted', text: titre }) : null, placable ? h('button', { class: 'btn petit', type: 'button', title: 'Placer un patient ici (chambre gardée)', 'aria-label': 'Placer un patient : ' + p.nom, onclick: function () { modalePlacer(sv, p); } }, '+') : null),
        corps), p.x, p.y, p.w, p.h));
    });
    var alertes = pl.alertes.map(function (a) { return h('p', { class: 'alerte', text: a.texte + (a.patients ? ' (' + a.patients.map(nom).join(', ') + ')' : '') }); });
    var hors = pl.horsPlan.length ? h('p', { class: 'muted', text: 'Hors du plan : ' + pl.horsPlan.map(function (y) { return nom(y.patient) + ' (' + (y.etat === 'mesure' ? (y.type || 'mesure') + ', ' : '') + (y.lieu || 'lieu non précisé') + ')'; }).join(' ; ') }) : null;
    var legende = h('p', { class: 'ch-legende muted' }, h('span', { class: 'ch-patient etat-present', text: 'Patient dans sa chambre' }), ' ', h('span', { class: 'ch-patient etat-ailleurs', text: 'Chambre gardée (patient ailleurs)' }), ' ', h('span', { class: 'ch-patient etat-mesure', text: 'Mesure en cours' }), ' ', h('span', { class: 'ch-patient etat-chambreOuverte', text: 'CSI en chambre ouverte' }));
    return [barre, alertes.length ? h('div', { class: 'pile' }, alertes) : null, h('section', { class: 'panneau ch-plan-cadre' }, grille), hors, legende,
      s().ouvert('isocont') ? null : h('p', { class: 'muted', text: 'Mesures d’isolement et de contention non affichées : réservées aux agents qui ont accès au module.' })].filter(Boolean);
  }
  /** Éditeur du plan (cadre et administrateur) : glisser-déposer ou boutons, taille, couleur. */
  function editeurPlan(sv) {
    var ed = vuePlanEtat.edition;
    var grille = h('div', { class: 'ch-plan edition' });
    function bas() { return ed.pieces.reduce(function (m, p) { return Math.max(m, p.y + p.h); }, 0) + 2; }
    function chevauche(p, x, y, w, hh) { return x < 0 || y < 0 || x + w > ed.colonnes || ed.pieces.some(function (q) { return q !== p && x < q.x + q.w && q.x < x + w && y < q.y + q.h && q.y < y + hh; }); }
    function bouger(p, x, y, w, hh) { if (chevauche(p, x, y, w, hh)) return U.toast('Place déjà prise ou hors du plan.'); p.x = x; p.y = y; p.w = w; p.h = hh; ed.choisie = p.id; dessiner(); }
    var outils = h('div', { class: 'ch-barre-outils' });
    function dessinerOutils() {
      U.vider(outils);
      var p = ed.pieces.filter(function (q) { return q.id === ed.choisie; })[0];
      if (!p) { outils.appendChild(h('span', { class: 'muted', text: 'Cliquez une pièce pour la déplacer pas à pas, changer sa taille ou sa couleur.' })); return; }
          var mini = function (lib, aria, f) { return h('button', { class: 'btn petit', type: 'button', 'aria-label': aria + ' : ' + p.nom, onclick: function (ev) { ev.stopPropagation(); f(); } }, lib); };
          var coul = h('select', { 'aria-label': 'Couleur : ' + p.nom, onclick: function (ev) { ev.stopPropagation(); }, onchange: function () { p.couleur = coul.value; dessiner(); } }, Object.keys(LIB_COULEURS).map(function (k) { return h('option', { value: k, text: LIB_COULEURS[k], selected: (p.couleur || '') === k }); }));
          outils.appendChild(h('div', { class: 'ch-outils' }, h('b', { text: p.nom }),
            mini('←', 'Vers la gauche', function () { bouger(p, p.x - 1, p.y, p.w, p.h); }), mini('→', 'Vers la droite', function () { bouger(p, p.x + 1, p.y, p.w, p.h); }),
            mini('↑', 'Vers le haut', function () { bouger(p, p.x, p.y - 1, p.w, p.h); }), mini('↓', 'Vers le bas', function () { bouger(p, p.x, p.y + 1, p.w, p.h); }),
            mini('Largeur +', 'Plus large', function () { if (p.w < 4) bouger(p, p.x, p.y, p.w + 1, p.h); }), mini('Largeur −', 'Moins large', function () { if (p.w > 1) bouger(p, p.x, p.y, p.w - 1, p.h); }),
            mini('Hauteur +', 'Plus haute', function () { if (p.h < 4) bouger(p, p.x, p.y, p.w, p.h + 1); }), mini('Hauteur −', 'Moins haute', function () { if (p.h > 1) bouger(p, p.x, p.y, p.w, p.h - 1); }), coul));
    }
    function dessiner() {
      U.vider(grille); dessinerOutils();
      grille.style.gridTemplateColumns = 'repeat(' + ed.colonnes + ', minmax(7rem, 1fr))';
      var n = bas();
      for (var y = 0; y < n; y++) for (var x = 0; x < ed.colonnes; x++) (function (x, y) {
        var c = caseGrille(h('div', { class: 'ch-case' }), x, y, 1, 1);
        c.addEventListener('dragover', function (ev) { ev.preventDefault(); });
        c.addEventListener('drop', function (ev) { ev.preventDefault(); var p = ed.pieces.filter(function (q) { return q.id === ev.dataTransfer.getData('text/plain'); })[0]; if (p) bouger(p, x, y, p.w, p.h); });
        grille.appendChild(c);
      })(x, y);
      ed.pieces.forEach(function (p) {
        var el = caseGrille(h('div', { class: 'ch-piece type-' + p.type + (p.couleur ? ' couleur-' + p.couleur : '') + (ed.choisie === p.id ? ' choisie' : ''), draggable: 'true', tabindex: '0', 'aria-label': 'Pièce ' + p.nom }), p.x, p.y, p.w, p.h);
        el.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/plain', p.id); });
        el.addEventListener('click', function () { ed.choisie = p.id; dessiner(); });
        el.appendChild(h('div', { class: 'ch-tete' }, h('b', { text: p.nom })));
        grille.appendChild(el);
      });
    }
    dessiner();
    var cols = h('input', { type: 'number', min: 4, max: 24, value: ed.colonnes, class: 'champ-court', 'aria-label': 'Colonnes du plan', onchange: function () { var v = Math.max(4, Math.min(24, Math.round(+cols.value) || 8)); if (ed.pieces.some(function (p) { return p.x + p.w > v; })) { cols.value = ed.colonnes; return U.toast('Des pièces dépassent : déplacez-les d’abord.'); } ed.colonnes = v; dessiner(); } });
    return h('section', { class: 'panneau' },
      h('p', { class: 'muted', text: 'Glissez une pièce sur une case libre, ou cliquez-la pour la déplacer avec les flèches, changer sa taille et sa couleur. Les pièces se règlent dans Administration → Patients → Chambres et lits.' }),
      h('label', { class: 'en-ligne' }, 'Colonnes', cols),
      outils, h('div', { class: 'ch-plan-cadre' }, grille),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: function () { vuePlanEtat.edition = null; U.rendreContenu(); } }, 'Annuler'),
        h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
          try {
            var v = JSON.parse(JSON.stringify(cfg().chambres || {})), r = v[sv] || { pieces: [] }, pos = {};
            ed.pieces.forEach(function (p) { pos[p.id] = p; });
            r.colonnes = ed.colonnes;
            r.pieces = (r.pieces || []).map(function (q, i) { var k = K.piece(q, i), p = k && pos[k.id]; if (p) { q.x = p.x; q.y = p.y; q.w = p.w; q.h = p.h; if (p.couleur) q.couleur = p.couleur; else delete q.couleur; } return q; });
            v[sv] = r;
            await U.enregistrerConfig([['chambres', v]]);
            vuePlanEtat.edition = null; U.toast('Plan enregistré.'); U.rendreContenu();
          } catch (e) { U.toast(e.message); }
        } }, 'Enregistrer le plan')));
  }

  U.chambres = { vuePlan: vuePlan, mesures: mesures, panneau: panneau, selecteurLit: selecteurLit, cascade: cascade, enregistrerSejour: enregistrerSejour, fiches: fiches, nom: nom };
  // Onglet « Plan du service » des fenêtres Patients et Isolement et contention (la Vue d'ensemble l'ajoute dans ui-vue.js)
  ['patients', 'isocont'].forEach(function (id) {
    var m = SIC.modules.obtenir(id);
    // Ajout à l'objet des vues existant (d'autres fichiers y ajoutent les leurs après celui-ci)
    if (m && m.interface && m.interface.vues) m.interface.vues.plan = vuePlan;
    else if (m) SIC.modules.completerInterface(id, { vues: { plan: vuePlan } });
  });
})();
