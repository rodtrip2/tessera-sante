// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Patients — liste des patients (décisions du porteur du 7 novembre 2026) : périmètre (hospitalisés, avec les
 * sorties récentes, tous), affichage par chambre, tri, recherche, colonnes choisies, couleur de la ligne ou du texte
 * selon le mode d'hospitalisation, filtres ; affichages enregistrés par l'agent et affichages par défaut réglés par
 * l'administrateur pour un service et un métier. Logique sans interface (testée sous Node) ; écran : ui-liste-patients.js.
 * Réglages : `config.patientsListe` = { joursRecents, couleursModes: { SDT: '#…' }, vues: [{ id, nom, services, roles, reglage }] }.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).listePatients = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PERIMETRES = { hospitalises: 'Patients hospitalisés', recents: 'Hospitalisés et sorties récentes', tous: 'Tous les patients' };
  var REGROUPEMENTS = { aucun: 'Liste', chambre: 'Par chambre' };
  var COLORATIONS = { aucune: 'Sans couleur', ligne: 'Couleur de la ligne', texte: 'Couleur du texte' };
  // Colonnes proposées ; `isocont` : colonne fournie par le module Isolement et contention (lecture à la volée), affichée
  // seulement à qui en détient la clé
  var COLONNES = [
    { code: 'patient', libelle: 'Patient', toujours: true },
    { code: 'ipp', libelle: 'IPP' },
    { code: 'naissance', libelle: 'Date de naissance (âge)' },
    { code: 'sexe', libelle: 'Sexe' },
    { code: 'service', libelle: 'Unité' },
    { code: 'chambre', libelle: 'Chambre et lit' },
    { code: 'entree', libelle: 'Entrée' },
    { code: 'sortie', libelle: 'Sortie' },
    { code: 'mode', libelle: 'Mode d’hospitalisation' },
    { code: 'medecin1', libelle: 'Médecin de 1re ligne' },
    { code: 'medecin2', libelle: 'Médecin de 2e ligne' },
    { code: 'referents', libelle: 'Référents soignants' },
    { code: 'psychologue', libelle: 'Psychologue référent' },
    { code: 'suiviAS', libelle: 'Suivi par l’assistant(e) social(e)' },
    { code: 'protection', libelle: 'Mesure de protection' },
    { code: 'detenu', libelle: 'Patient détenu' },
    { code: 'mesuresEnCours', libelle: 'Isolement / contention en cours', isocont: true },
    { code: 'cumuls', libelle: 'Cumuls isolement et contention sur 15 jours', isocont: true },
    { code: 'vigilance', libelle: 'Vigilance (isolement et contention)', isocont: true }
  ];
  var CODES = COLONNES.map(function (c) { return c.code; });
  var TRIS = ['patient', 'ipp', 'naissance', 'service', 'chambre', 'entree', 'sortie', 'mode', 'medecin1', 'psychologue'];
  // Couleurs proposées par mode (contrainte : teintes chaudes ; soins libres : vert ; réglables)
  var COULEURS_MODES_DEFAUT = { SDRE: '#b3261e', SDT: '#c25e00', SDTU: '#a14a00', SPI: '#8a4baf', SL: '#2e7d4f', 'SL mineur': '#1f7a6d' };
  var REGLAGE_DEFAUT = { perimetre: 'hospitalises', regroupement: 'aucun', tri: 'patient', sens: 1, coloration: 'aucune',
    colonnes: ['patient', 'ipp', 'service', 'chambre', 'mode', 'medecin1', 'referents'], filtres: { modes: [], medecin: '', referent: '' } };
  // Affichages fournis par défaut (modifiables par l'administrateur) ; « Isolement et contention » reprend les colonnes
  // utiles au suivi des mesures
  var VUES_FOURNIES = [
    { id: 'standard', nom: 'Patients hospitalisés', services: [], roles: [], reglage: REGLAGE_DEFAUT },
    { id: 'chambres', nom: 'Par chambre', services: [], roles: [], reglage: { perimetre: 'hospitalises', regroupement: 'chambre', tri: 'chambre', sens: 1, coloration: 'ligne', colonnes: ['patient', 'chambre', 'mode', 'medecin1', 'referents', 'psychologue'], filtres: {} } },
    { id: 'isocont', nom: 'Isolement et contention', services: [], roles: [], reglage: { perimetre: 'recents', regroupement: 'aucun', tri: 'mode', sens: 1, coloration: 'texte', colonnes: ['patient', 'ipp', 'service', 'mode', 'mesuresEnCours', 'cumuls', 'vigilance'], filtres: {} } }
  ];

  function hex(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? String(c).toLowerCase() : null; }
  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }

  /** Réglage d'un affichage, validé (valeurs inconnues remplacées par celles par défaut). */
  function reglage(r) {
    r = r || {};
    var f = r.filtres || {};
    var cols = Array.isArray(r.colonnes) ? r.colonnes.filter(function (c, i, t) { return CODES.indexOf(c) >= 0 && t.indexOf(c) === i; }) : REGLAGE_DEFAUT.colonnes.slice();
    if (cols.indexOf('patient') < 0) cols.unshift('patient');
    return {
      perimetre: PERIMETRES[r.perimetre] ? r.perimetre : 'hospitalises',
      regroupement: REGROUPEMENTS[r.regroupement] ? r.regroupement : 'aucun',
      tri: TRIS.indexOf(r.tri) >= 0 ? r.tri : 'patient', sens: r.sens === -1 ? -1 : 1,
      coloration: COLORATIONS[r.coloration] ? r.coloration : 'aucune',
      colonnes: cols,
      filtres: { modes: Array.isArray(f.modes) ? f.modes.map(function (m) { return texte(m, 20); }).filter(Boolean) : [], medecin: texte(f.medecin), referent: texte(f.referent) }
    };
  }

  /** Réglages de la liste (`config.patientsListe`), validés à la lecture. */
  function options(config) {
    var o = (config && config.patientsListe) || {}, couleurs = {};
    Object.keys(COULEURS_MODES_DEFAUT).concat(Object.keys(o.couleursModes || {})).forEach(function (k) { couleurs[k] = hex((o.couleursModes || {})[k]) || COULEURS_MODES_DEFAUT[k] || '#545c57'; });
    var vues = Array.isArray(o.vues) && o.vues.length ? o.vues : VUES_FOURNIES;
    return {
      joursRecents: o.joursRecents >= 1 && o.joursRecents <= 90 ? Math.round(o.joursRecents) : 7,
      couleursModes: couleurs,
      vues: vues.filter(function (v) { return v && v.id && texte(v.nom); }).map(function (v) {
        return { id: texte(v.id, 40), nom: texte(v.nom), services: Array.isArray(v.services) ? v.services.slice() : [], roles: Array.isArray(v.roles) ? v.roles.slice() : [], reglage: reglage(v.reglage) };
      })
    };
  }

  /**
   * Affichages par défaut proposés à un agent : ceux réglés pour l'un de ses services (ou tous) et l'un de ses métiers
   * (ou tous), dans l'ordre de l'administrateur. Le premier est ouvert par défaut.
   */
  function vuesPour(config, services, roles) {
    return options(config).vues.filter(function (v) {
      var okS = !v.services.length || v.services.some(function (s) { return (services || []).indexOf(s) >= 0; });
      var okR = !v.roles.length || v.roles.some(function (r) { return (roles || []).indexOf(r) >= 0; });
      return okS && okR;
    });
  }

  // ------------------------------------------------------------ Lignes
  function jour(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dernierSejour(p) { var s = (p && p.sejours) || []; return s.length ? s[s.length - 1] : null; }
  function sejourEnCours(p) { var s = (p && p.sejours) || [], r = null; s.forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  function modeActuel(p) { return p && p.modes && p.modes.length ? p.modes[p.modes.length - 1].mode : ''; }
  function age(naissance, maintenant) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance || '');
    if (!m) return null;
    var d = new Date(maintenant), a = d.getFullYear() - +m[1];
    if (d.getMonth() + 1 < +m[2] || (d.getMonth() + 1 === +m[2] && d.getDate() < +m[3])) a--;
    return a;
  }
  /**
   * Situation d'un patient : 'hospitalise' (séjour en cours, ou fiche sans séjour connu), 'recent' (sorti depuis moins de
   * `jours` jours), 'sorti'. Une fiche sans séjour (saisie avant l'import de la liste du DPI) compte comme hospitalisée.
   */
  function situation(p, maintenant, jours) {
    if (sejourEnCours(p)) return 'hospitalise';
    var d = dernierSejour(p);
    if (!d) return 'hospitalise';
    return d.sortie && d.sortie >= jour(maintenant - jours * 864e5) ? 'recent' : 'sorti';
  }
  function serviceDe(p) { var s = sejourEnCours(p) || dernierSejour(p); return (s && s.service) || p.service || ''; }
  function chambreDe(p) { var s = sejourEnCours(p) || dernierSejour(p); return s ? { chambre: s.chambre || '', lit: s.lit || '' } : { chambre: '', lit: '' }; }
  function nomComplet(p) { return ((p.nom || '') + ' ' + (p.prenom || '')).trim(); }
  /** Comparaison « naturelle » des chambres (2 avant 10, 12A après 12). */
  function compNaturel(a, b) {
    var x = String(a || ''), y = String(b || '');
    if (!x && y) return 1; if (x && !y) return -1;
    return x.localeCompare(y, 'fr', { numeric: true, sensitivity: 'base' });
  }

  /**
   * Lignes de la liste : fiches des `services` (unité du séjour en cours ou du dernier séjour, sinon service de la fiche),
   * selon le réglage (périmètre, recherche, filtres), triées. Chaque ligne : { p, situation, service, chambre, lit,
   * entree, sortie, mode, age }.
   */
  function lignes(patients, r, contexte) {
    var reg = reglage(r), c = contexte || {}, maintenant = c.maintenant || Date.now(), jours = c.joursRecents || 7, svs = c.services || null;
    var q = String(c.recherche || '').trim().toLowerCase(), f = reg.filtres;
    var res = Object.keys(patients || {}).map(function (k) { return patients[k]; }).map(function (p) {
      var sc = sejourEnCours(p) || dernierSejour(p), ch = chambreDe(p);
      return { p: p, situation: situation(p, maintenant, jours), service: serviceDe(p), chambre: ch.chambre, lit: ch.lit, entree: (sc && sc.entree) || '', sortie: (sc && sc.sortie) || '', mode: modeActuel(p), age: age(p.naissance, maintenant) };
    }).filter(function (l) {
      if (svs && svs.indexOf(l.service) < 0) return false;
      if (reg.perimetre === 'hospitalises' && l.situation !== 'hospitalise') return false;
      if (reg.perimetre === 'recents' && l.situation === 'sorti') return false;
      if (f.modes.length && f.modes.indexOf(l.mode) < 0) return false;
      if (f.medecin && [l.p.medecin1, l.p.medecin2].indexOf(f.medecin) < 0) return false;
      if (f.referent && !(l.p.referents || []).some(function (x) { return x.nom === f.referent; }) && l.p.psychologue !== f.referent) return false;
      if (q && (nomComplet(l.p) + ' ' + (l.p.nomNaissance || '') + ' ' + (l.p.ipp || '') + ' ' + l.chambre).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var cle = {
      patient: function (l) { return nomComplet(l.p); }, ipp: function (l) { return l.p.ipp || ''; }, naissance: function (l) { return l.p.naissance || ''; },
      service: function (l) { return l.service; }, chambre: function (l) { return (l.chambre + ' ' + l.lit).trim(); }, entree: function (l) { return l.entree; },
      sortie: function (l) { return l.sortie; }, mode: function (l) { return l.mode; }, medecin1: function (l) { return l.p.medecin1 || ''; }, psychologue: function (l) { return l.p.psychologue || ''; }
    }[reg.regroupement === 'chambre' ? 'chambre' : reg.tri];
    res.sort(function (a, b) {
      var s = (reg.regroupement === 'chambre' ? 1 : reg.sens) * compNaturel(cle(a), cle(b));
      return s || compNaturel(nomComplet(a.p), nomComplet(b.p));
    });
    return res;
  }

  /** Lignes groupées par chambre (affichage par chambre) : [{ chambre, lignes }], chambres sans numéro en dernier. */
  function parChambre(ls) {
    var g = [], index = {};
    ls.forEach(function (l) { var k = l.chambre || ''; if (!index.hasOwnProperty(k)) { index[k] = g.length; g.push({ chambre: k, lignes: [] }); } g[index[k]].lignes.push(l); });
    return g;
  }

  return { PERIMETRES: PERIMETRES, REGROUPEMENTS: REGROUPEMENTS, COLORATIONS: COLORATIONS, COLONNES: COLONNES, TRIS: TRIS,
    COULEURS_MODES_DEFAUT: COULEURS_MODES_DEFAUT, REGLAGE_DEFAUT: REGLAGE_DEFAUT, VUES_FOURNIES: VUES_FOURNIES,
    reglage: reglage, options: options, vuesPour: vuesPour, lignes: lignes, parChambre: parChambre, situation: situation, age: age, compNaturel: compNaturel };
});
