// SPDX-License-Identifier: EUPL-1.2
/*
 * Tessera Santé — modèles remplis automatiquement (lot D, phase 3, 14 novembre 2026).
 *
 * Un modèle du module Documents peut contenir des champs écrits entre doubles accolades, par exemple {{Nom}},
 * {{Date d'entrée}} ou {{Établissement}}. À la création d'un document d'après ce modèle, les champs sont remplacés par
 * les valeurs du patient auquel le document est rattaché (fiche commune : identité, séjour en cours, mode
 * d'hospitalisation, médecins), de la mesure d'isolement ou de contention en cours (si Isocont est lisible), du
 * service, de l'établissement, de l'agent et du jour. Aucune donnée clinique : seulement ce que la fiche commune et le
 * registre contiennent déjà. Un champ sans valeur (document non rattaché à un patient, valeur inconnue) reste écrit
 * tel quel, pour être complété à la main. Aucune dépendance au navigateur : testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).remplissage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Champs proposés, dans l'ordre du menu « Champ » de l'éditeur des modèles. */
  var CHAMPS = [
    { nom: 'Nom', groupe: 'Patient' }, { nom: 'Prénom', groupe: 'Patient' }, { nom: 'Nom de naissance', groupe: 'Patient' }, { nom: 'Sexe', groupe: 'Patient' },
    { nom: 'Date de naissance', groupe: 'Patient' }, { nom: 'Âge', groupe: 'Patient' }, { nom: 'IPP', groupe: 'Patient' }, { nom: 'IEP', groupe: 'Patient' },
    { nom: 'Mesure de protection', groupe: 'Patient' }, { nom: 'Chambre', groupe: 'Séjour' }, { nom: 'Date d’entrée', groupe: 'Séjour' },
    { nom: 'Mode d’hospitalisation', groupe: 'Séjour' }, { nom: 'Médecin de 1re ligne', groupe: 'Séjour' }, { nom: 'Médecin de 2e ligne', groupe: 'Séjour' },
    { nom: 'Référents', groupe: 'Séjour' }, { nom: 'Mesure en cours', groupe: 'Isolement et contention' }, { nom: 'Début de la mesure', groupe: 'Isolement et contention' },
    { nom: 'Lieu de la mesure', groupe: 'Isolement et contention' }, { nom: 'Service', groupe: 'Général' }, { nom: 'Établissement', groupe: 'Général' },
    { nom: 'Date du jour', groupe: 'Général' }, { nom: 'Heure', groupe: 'Général' }, { nom: 'Agent', groupe: 'Général' }
  ];
  var RE = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g;
  /** Clé de comparaison : minuscules, sans accents, apostrophes et espaces unifiés (« date d'entree » = « Date d’entrée »). */
  function cle(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, '\'').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function deux(n) { return String(n).padStart(2, '0'); }
  function dateFr(v) {
    if (v === null || v === undefined || v === '') return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(typeof v === 'number' ? v : Date.parse(v));
    return isNaN(d) ? String(v) : deux(d.getDate()) + '/' + deux(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function heureFr(t) { var d = new Date(t); return deux(d.getHours()) + ' h ' + deux(d.getMinutes()); }
  function age(naissance, maintenant) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(naissance || ''));
    if (!m) return '';
    var d = new Date(maintenant), a = d.getFullYear() - +m[1];
    if (d.getMonth() + 1 < +m[2] || (d.getMonth() + 1 === +m[2] && d.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a + ' ans' : '';
  }
  var SEXES = { F: 'Femme', M: 'Homme', I: 'Indéterminé' };

  /**
   * Valeurs des champs : `ctx` = { patient (fiche commune), mesure ({ type, debut, lieu }), service (libellé),
   * etablissement, agent (nom), maintenant, libMode (code → libellé), libMedecin (nom, id → nom) }.
   * Rend { <clé>: valeur } ; un champ inconnu ou vide n'y figure pas.
   */
  function valeurs(ctx) {
    var c = ctx || {}, p = c.patient, maintenant = c.maintenant || Date.now(), v = {};
    function mettre(nom, val) { if (val !== undefined && val !== null && String(val).trim() !== '') v[cle(nom)] = String(val); }
    mettre('Service', c.service); mettre('Établissement', c.etablissement); mettre('Agent', c.agent);
    mettre('Date du jour', dateFr(maintenant)); mettre('Heure', heureFr(maintenant));
    if (p) {
      var sj = null;
      (p.sejours || []).forEach(function (x) { if (!x.sortie) sj = x; });
      var mode = p.modes && p.modes.length ? p.modes[p.modes.length - 1].mode : '';
      var med = function (nom, id) { return c.libMedecin ? c.libMedecin(nom, id) : nom; };
      mettre('Nom', p.nom); mettre('Prénom', p.prenom); mettre('Nom de naissance', p.nomNaissance); mettre('Sexe', SEXES[p.sexe] || p.sexe);
      mettre('Date de naissance', dateFr(p.naissance)); mettre('Âge', age(p.naissance, maintenant)); mettre('IPP', p.ipp);
      mettre('Mesure de protection', p.protection);
      if (sj) { mettre('IEP', sj.iep); mettre('Chambre', [sj.chambre, sj.lit].filter(Boolean).join(' ')); mettre('Date d’entrée', dateFr(sj.entree)); }
      mettre('Mode d’hospitalisation', mode ? (c.libMode ? c.libMode(mode) : mode) : '');
      mettre('Médecin de 1re ligne', med(p.medecin1, p.medecin1Id)); mettre('Médecin de 2e ligne', med(p.medecin2, p.medecin2Id));
      mettre('Référents', Array.isArray(p.referents) ? p.referents.filter(Boolean).join(', ') : p.referents);
    }
    if (c.mesure) { mettre('Mesure en cours', c.mesure.type); mettre('Début de la mesure', c.mesure.debut ? dateFr(c.mesure.debut) + ' à ' + heureFr(c.mesure.debut) : ''); mettre('Lieu de la mesure', c.mesure.lieu); }
    return v;
  }

  function remplacer(texte, v, restants) {
    return String(texte).replace(RE, function (m, nom) {
      var k = cle(nom);
      if (Object.prototype.hasOwnProperty.call(v, k)) return v[k];
      if (restants.indexOf(nom.trim()) < 0) restants.push(nom.trim());
      return m;
    });
  }
  /**
   * Contenu d'un document (texte : onglets, paragraphes, tableaux ; tableur : cases en texte, jamais les formules) avec
   * les champs remplacés. Rend { contenu (copie), remplis (nombre), restants: [champs non remplis] }.
   */
  function remplir(contenu, v) {
    var c = JSON.parse(JSON.stringify(contenu || {})), restants = [], n = 0;
    function runs(rs) { (rs || []).forEach(function (r) { if (r && typeof r.x === 'string' && r.x.indexOf('{{') >= 0) { var av = r.x; r.x = remplacer(r.x, v, restants); if (r.x !== av) n++; } }); }
    function blocs(bs) { (bs || []).forEach(function (b) { if (!b) return; runs(b.runs); (b.lignes || []).forEach(function (l) { (l || []).forEach(function (x) { runs(x && x.runs); }); }); }); }
    if (c.genre === 'tableur') {
      (c.feuilles || []).forEach(function (f) { Object.keys((f && f.cellules) || {}).forEach(function (k) { var x = f.cellules[k]; if (x && typeof x.v === 'string' && x.f === undefined && x.v.indexOf('{{') >= 0) { var av = x.v; x.v = remplacer(x.v, v, restants); if (x.v !== av) n++; } }); });
    } else {
      blocs(c.blocs);
      (c.onglets || []).forEach(function (o) { blocs(o && o.blocs); });
    }
    return { contenu: c, remplis: n, restants: restants };
  }
  /** Champs écrits dans un contenu (pour savoir si un modèle en contient). */
  function champsDe(contenu) {
    var l = [], txt = JSON.stringify(contenu || {}), m;
    RE.lastIndex = 0;
    while ((m = RE.exec(txt)) !== null) if (l.indexOf(m[1].trim()) < 0) l.push(m[1].trim());
    return l;
  }

  return { CHAMPS: CHAMPS, valeurs: valeurs, remplir: remplir, champsDe: champsDe, cle: cle };
});
