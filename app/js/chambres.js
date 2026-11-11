// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — chambres et lits d'un service (0.29.0, décisions du porteur du 11 novembre 2026).
 *
 * Liste tenue par le cadre pour chaque service (`config.chambres[service].pieces`) : chambres (un ou plusieurs lits :
 * « 417 P », « 417 F »), chambres de soins intensifs (CSI, marquées dans la liste), autres pièces (bureau, espace
 * d'apaisement…, sans lit). La chambre et le lit d'un séjour se choisissent dans la liste ; un lit ne reçoit qu'un
 * patient : un changement de lit qui en déloge un autre propose de le déplacer (en cascade). Les CSI de la liste
 * remplacent les lieux d'isolement réglés auparavant (`config.lieuxCSI`), repris tant que la liste n'est pas réglée.
 * Logique sans interface, testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).chambres = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = { chambre: 'Chambre', csi: 'Chambre de soins intensifs (CSI)', piece: 'Autre pièce' };
  var NATURES = { bureau: 'Bureau', apaisement: 'Espace d’apaisement', activites: 'Salle d’activités', repas: 'Salle à manger', bain: 'Salle de bain', office: 'Office', poste: 'Poste de soins', autre: 'Autre' };
  var MAX_PIECES = 200, MAX_LITS = 8;

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 40); }
  function cle(chambre, lit) { return texte(chambre) + '|' + texte(lit); }
  function libelle(chambre, lit) { return texte(lit) ? texte(chambre) + ' ' + texte(lit) : texte(chambre); }

  function piece(p, i) {
    if (!p || !texte(p.nom)) return null;
    var type = TYPES[p.type] ? p.type : 'chambre', vus = {};
    var lits = type === 'piece' ? [] : (Array.isArray(p.lits) ? p.lits : []).map(function (l) { return texte(l && typeof l === 'object' ? l.nom : l, 12); })
      .filter(function (l) { if (!l || vus[l]) return false; vus[l] = 1; return true; }).slice(0, MAX_LITS);
    var entier = function (v, min, max, d) { v = Math.round(+v); return isFinite(v) && v >= min && v <= max ? v : d; };
    return {
      id: texte(p.id, 40) || 'p' + i, nom: texte(p.nom), type: type, lits: type === 'piece' ? [] : (lits.length ? lits : ['']),
      nature: type === 'piece' ? (NATURES[p.nature] ? p.nature : 'autre') : '', usage: type === 'piece' && p.usage === true,
      // Plan du service (0.29.1) : position et taille dans la grille, couleur
      x: entier(p.x, 0, 40, null), y: entier(p.y, 0, 40, null), w: entier(p.w, 1, 4, 1), h: entier(p.h, 1, 4, 1), couleur: COULEURS.indexOf(p.couleur || '') >= 0 ? p.couleur || '' : ''
    };
  }
  /** Liste réglée d'un service, validée (noms uniques), ou null si le cadre ne l'a pas encore réglée. */
  function liste(config, service) {
    var r = config && config.chambres && config.chambres[service];
    if (!r || !Array.isArray(r.pieces)) return null;
    var vus = {}, res = [];
    r.pieces.slice(0, MAX_PIECES).forEach(function (p, i) { var x = piece(p, i); if (x && !vus[x.nom.toLowerCase()]) { vus[x.nom.toLowerCase()] = 1; res.push(x); } });
    return { pieces: res, colonnes: Math.max(4, Math.min(24, Math.round(+r.colonnes) || 8)) };
  }
  /** Lits d'un service (chambres et CSI) : [{ cle, chambre, lit, libelle, csi, piece }]. */
  function lits(config, service) {
    var l = liste(config, service), res = [];
    if (!l) return res;
    l.pieces.forEach(function (p) { p.lits.forEach(function (n) { res.push({ cle: cle(p.nom, n), chambre: p.nom, lit: n, libelle: libelle(p.nom, n), csi: p.type === 'csi', piece: p.id }); }); });
    return res;
  }
  /** Lieux d'isolement (CSI) d'un service : ceux de la liste, sinon les lieux réglés auparavant. */
  function lieuxCSI(config, service) {
    var l = liste(config, service);
    if (l) return l.pieces.filter(function (p) { return p.type === 'csi'; }).map(function (p) { return p.nom; });
    return ((config && config.lieuxCSI) || {})[service] || [];
  }
  /** Liste de départ proposée au cadre : les CSI déjà réglées comme lieux d'isolement (reprise sans perte). */
  function listeDepart(config, service) { return { colonnes: 8, pieces: (((config && config.lieuxCSI) || {})[service] || []).map(function (n, i) { return { id: 'csi' + i, nom: n, type: 'csi', lits: [] }; }) }; }

  function norme(t) { return String(t == null ? '' : t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, ''); }
  /**
   * Lit de la liste qui correspond à une chambre et un lit venus d'ailleurs (import du DPI) : « 417 P », « 417P »,
   * « 417-P », chambre « 417 » et lit « P », chambre seule pour une chambre à un lit. Renvoie le lit ou null.
   */
  function trouver(config, service, chambre, lit) {
    var ls = lits(config, service);
    if (!ls.length) return null;
    var c = norme(chambre), l = norme(lit);
    var exact = ls.filter(function (x) { return norme(x.chambre) === c && norme(x.lit) === l; })[0];
    if (exact) return exact;
    var colle = ls.filter(function (x) { return norme(x.chambre + x.lit) === c + l; });
    if (colle.length === 1) return colle[0];
    if (!l) { var seuls = ls.filter(function (x) { return norme(x.chambre) === c; }); if (seuls.length === 1) return seuls[0]; }
    return null;
  }

  // ------------------------------------------------------------ Occupation
  function sejourEnCours(f, service, jour) {
    var r = null;
    (f && f.sejours || []).forEach(function (s) {
      if (service && s.service !== service) return;
      if (s.entree && jour && s.entree > jour) return;
      if (s.sortie && (!jour || s.sortie <= jour)) return;
      r = s;
    });
    return r;
  }
  /**
   * Occupation des lits d'un service (séjours en cours, ou au jour `jour` AAAA-MM-JJ) : { <cle>: [{ patient, sejour }] }
   * (plusieurs patients sur un même lit : conflit à régler).
   */
  function occupation(fiches, service, jour) {
    var res = {};
    Object.keys(fiches || {}).forEach(function (id) {
      var f = fiches[id];
      if (!f || f.fusionneDans) return;
      var s = sejourEnCours(f, service, jour);
      if (!s || !texte(s.chambre)) return;
      (res[cle(s.chambre, s.lit)] = res[cle(s.chambre, s.lit)] || []).push({ patient: id, sejour: s.id });
    });
    return res;
  }
  /** Lits occupés par plus d'un patient : [{ cle, patients }]. */
  function conflits(fiches, service, jour) {
    var o = occupation(fiches, service, jour);
    return Object.keys(o).filter(function (k) { return o[k].length > 1; }).map(function (k) { return { cle: k, patients: o[k].map(function (x) { return x.patient; }) }; });
  }
  /** Patient (autre que `sauf`) qui occupe le lit, ou null. */
  function occupant(fiches, service, chambre, lit, sauf) {
    var o = occupation(fiches, service)[cle(chambre, lit)] || [];
    var x = o.filter(function (y) { return y.patient !== sauf; })[0];
    return x || null;
  }
  /** Lits libres d'un service (en écartant ceux que libèrent les patients de `liberes`). */
  function libres(config, fiches, service, liberes) {
    var o = occupation(fiches, service), lib = liberes || [];
    return lits(config, service).filter(function (l) { return !(o[l.cle] || []).some(function (x) { return lib.indexOf(x.patient) < 0; }); });
  }
  /**
   * Ordre d'écriture d'une suite de déplacements [{ patient, chambre, lit }] (le premier déloge le suivant…) : du dernier
   * au premier, pour que chacun arrive sur un lit déjà libéré (une permutation passe par un état intermédiaire).
   */
  function ordreEcriture(mouvements) { return (mouvements || []).slice().reverse(); }
  /** Historique des lits d'un séjour : [{ du, chambre, lit }] (premier lit, puis chaque changement). */
  function historique(sejour) { return (sejour && sejour.mouvements) || []; }

  // ------------------------------------------------------------ Plan du service (0.29.1)
  var COULEURS = ['', 'bleu', 'vert', 'jaune', 'orange', 'rouge', 'violet', 'gris'];
  /**
   * Positions dans la grille : celles réglées par le cadre, puis les pièces non placées rangées à la suite, ligne
   * après ligne, sans chevauchement. Renvoie de nouvelles pièces (x, y toujours renseignés).
   */
  function disposer(l) {
    if (!l) return [];
    var col = l.colonnes, pris = {}, res = l.pieces.map(function (p) { return Object.assign({}, p, { w: Math.min(p.w, col) }); });
    function libre(x, y, w, hh) { if (x + w > col) return false; for (var i = 0; i < w; i++) for (var j = 0; j < hh; j++) if (pris[(x + i) + ',' + (y + j)]) return false; return true; }
    function prendre(p) { for (var i = 0; i < p.w; i++) for (var j = 0; j < p.h; j++) pris[(p.x + i) + ',' + (p.y + j)] = 1; }
    res.forEach(function (p) { if (p.x != null && p.y != null && p.x + p.w <= col) prendre(p); else { p.x = null; p.y = null; } });
    res.forEach(function (p) {
      if (p.x != null) return;
      for (var y = 0; y < 200; y++) for (var x = 0; x < col; x++) if (libre(x, y, p.w, p.h)) { p.x = x; p.y = y; prendre(p); return; }
    });
    return res;
  }
  function pieceDuLieu(pieces, lieu) { var n = norme(lieu); return n ? pieces.filter(function (p) { return norme(p.nom) === n; })[0] || null : null; }
  /**
   * Plan d'un service : pièces disposées, chacune avec ses lits et ses occupants, et points à régler.
   * options.mesures : mesures d'isolement ou de contention en cours [{ patientId, lieu, type }] (lues dans Isocont par
   * qui en détient la clé). Un patient en mesure apparaît dans la CSI et reste visible, estompé, dans sa chambre
   * hôtelière ; un patient placé temporairement dans une pièce (CSI en chambre ouverte, espace d'apaisement…) aussi.
   * État d'un occupant : 'present', 'ailleurs' (chambre gardée), 'mesure', 'chambreOuverte' (CSI hors mesure), 'usage'.
   */
  function plan(config, fiches, service, options) {
    var l = liste(config, service);
    if (!l) return null;
    var o = options || {}, pieces = disposer(l), alertes = [], horsPlan = [];
    pieces.forEach(function (p) { p.lits = p.lits.map(function (n) { return { nom: n, cle: cle(p.nom, n), occupants: [] }; }); p.presents = []; });
    var parId = {}; pieces.forEach(function (p) { parId[p.id] = p; });
    var occ = occupation(fiches, service), litsParCle = {};
    pieces.forEach(function (p) { p.lits.forEach(function (x) { litsParCle[x.cle] = { piece: p, lit: x }; }); });
    var ailleurs = {};   // patient → où il se trouve hors de sa chambre
    // Isolement et contention d'un même patient : une seule présence, types réunis
    var parPatient = {};
    (o.mesures || []).forEach(function (m) { var x = parPatient[m.patientId]; if (x) { if (x.type.toLowerCase().split(' et ').indexOf(String(m.type || '').toLowerCase()) < 0) x.type += ' et ' + String(m.type || '').toLowerCase(); } else parPatient[m.patientId] = { patientId: m.patientId, lieu: m.lieu, type: m.type || '' }; });
    Object.keys(parPatient).map(function (k) { return parPatient[k]; }).forEach(function (m) {
      var p = pieceDuLieu(pieces, m.lieu);
      if (!p) { horsPlan.push({ patient: m.patientId, etat: 'mesure', type: m.type, lieu: m.lieu || '' }); ailleurs[m.patientId] = m.lieu || 'hors du plan'; return; }
      p.presents.push({ patient: m.patientId, etat: 'mesure', type: m.type });
      ailleurs[m.patientId] = p.nom;
    });
    Object.keys(fiches || {}).forEach(function (id) {
      var f = fiches[id]; if (!f || f.fusionneDans || ailleurs[id]) return;
      var sj = sejourEnCours(f, service);
      var pl = sj && sj.placement && sj.placement.piece;
      if (!pl) return;
      var p = pieceDuLieu(pieces, pl);
      if (!p) return;
      p.presents.push({ patient: id, etat: p.type === 'csi' ? 'chambreOuverte' : 'usage', du: sj.placement.du });
      ailleurs[id] = p.nom;
    });
    Object.keys(occ).forEach(function (k) {
      var x = litsParCle[k];
      occ[k].forEach(function (y) {
        if (!x) { horsPlan.push({ patient: y.patient, etat: 'lit', lieu: k.replace('|', ' ').trim() }); return; }
        var etat = ailleurs[y.patient] && ailleurs[y.patient] !== x.piece.nom ? 'ailleurs' : (x.piece.type === 'csi' ? (ailleurs[y.patient] ? 'mesure' : 'chambreOuverte') : 'present');
        if (etat === 'mesure') return;   // déjà compté dans la CSI
        x.lit.occupants.push({ patient: y.patient, etat: etat, ou: etat === 'ailleurs' ? ailleurs[y.patient] : '' });
      });
      if (x && occ[k].length > 1) alertes.push({ genre: 'lit', piece: x.piece.nom, lit: x.lit.nom, patients: occ[k].map(function (y) { return y.patient; }), texte: 'Deux patients sur le lit ' + libelle(x.piece.nom, x.lit.nom) });
    });
    pieces.forEach(function (p) {
      if (p.type !== 'csi') return;
      var mes = p.presents.filter(function (y) { return y.etat === 'mesure'; });
      var ouverts = p.presents.filter(function (y) { return y.etat === 'chambreOuverte'; }).concat([].concat.apply([], p.lits.map(function (x) { return x.occupants.filter(function (y) { return y.etat === 'chambreOuverte'; }); })));
      if (mes.length && ouverts.length) alertes.push({ genre: 'csi', piece: p.nom, patients: ouverts.map(function (y) { return y.patient; }), texte: p.nom + ' : mesure en cours alors que la CSI est occupée en chambre ouverte' });
      if (mes.length > 1) alertes.push({ genre: 'csi', piece: p.nom, patients: mes.map(function (y) { return y.patient; }), texte: p.nom + ' : plusieurs mesures en cours dans la même CSI' });
    });
    var bas = pieces.reduce(function (m, p) { return Math.max(m, p.y + p.h); }, 0);
    return { colonnes: l.colonnes, lignes: Math.max(1, bas), pieces: pieces, alertes: alertes, horsPlan: horsPlan };
  }
  /** CSI d'un service occupée (chambre ouverte, surcapacité) par un autre patient que `patient` : le premier occupant, ou null. */
  function csiOccupee(config, fiches, service, lieu, patient) {
    var pl = plan(config, fiches, service, {});
    var p = pl && pieceDuLieu(pl.pieces, lieu);
    if (!p || p.type !== 'csi') return null;
    var tous = p.presents.concat([].concat.apply([], p.lits.map(function (x) { return x.occupants; })));
    return tous.filter(function (y) { return y.patient !== patient && y.etat !== 'ailleurs'; })[0] || null;
  }
  /** Pièces où un patient peut être placé temporairement (chambre gardée) : CSI (chambre ouverte) et pièces utilisées par les patients. */
  function piecesPlacement(config, service) { var l = liste(config, service); return l ? l.pieces.filter(function (p) { return p.type === 'csi' || (p.type === 'piece' && p.usage); }) : []; }

  return { COULEURS: COULEURS, disposer: disposer, plan: plan, csiOccupee: csiOccupee, piecesPlacement: piecesPlacement, TYPES: TYPES, NATURES: NATURES, cle: cle, libelle: libelle, liste: liste, lits: lits, lieuxCSI: lieuxCSI, listeDepart: listeDepart, trouver: trouver,
    sejourEnCours: sejourEnCours, occupation: occupation, conflits: conflits, occupant: occupant, libres: libres, ordreEcriture: ordreEcriture, historique: historique, piece: piece };
});
