// SPDX-License-Identifier: EUPL-1.2
/*
 * Vue d'ensemble — tableau de transmissions (0.30.0, demande du porteur du 12 novembre 2026).
 *
 * Tableau imprimé pour les transmissions orales : une vue de la Vue d'ensemble de type « transmissions ». Chaque case
 * (colonne) réunit une ou plusieurs données, mises en forme une à une (taille, gras, italique, souligné, majuscules,
 * à la ligne, libellé) ; une case peut rester vide pour les notes. Hauteur des lignes commune (ou selon le contenu),
 * ligne de titre réglée à part, texte réduit pour tenir dans la case. Impression ajustée sur un nombre de faces (4 par
 * défaut : deux feuilles recto verso), portrait par défaut, marges étroites ; en-tête et pied de page avec champs
 * (date, service, poste, agent…) ; tâches du poste (Agenda) à la suite ou sur une page à part.
 * Modèle réglé par le cadre ; chaque agent peut en garder une copie personnelle (préférences). Logique sans interface.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).transmissions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHAMPS = { date: 'Date', heure: 'Heure', service: 'Service', poste: 'Poste', agent: 'Imprimé par', etablissement: 'Établissement', titre: 'Titre du tableau' };
  var TACHES = { aucune: 'Ne pas ajouter', suite: 'À la suite du tableau', page: 'Sur une page à part' };
  var ORIENTATIONS = { portrait: 'Portrait', paysage: 'Paysage' };
  /** Formats d'une date (12 novembre 2026, demande du porteur) ; '' : format de la donnée (date et jours écoulés). */
  var FORMATS_DATE = { '': 'Celui de la donnée', date: '03/10/2026', courte: '03/10/26', jourMois: '03/10', jours: 'Jours écoulés (40 j)', jourMoisJours: '03/10 (40 j)', longue: '3 oct. 2026' };
  /** Marges étroites (mm) ; le bas laisse la place au numéro de page. */
  var MARGES = { haut: 6, bas: 6, gauche: 6, droite: 6, basNumero: 9 };
  var PAGE = { portrait: { l: 210, h: 297 }, paysage: { l: 297, h: 210 } };

  function texte(v, n) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 80); }
  function entier(v, min, max, d) { var n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : d; }
  function id(v, i) { return /^[a-z0-9][a-z0-9-]{0,29}$/.test(v || '') ? v : 'k' + i; }

  function element(e, i) {
    if (!e || !texte(e.code, 60)) return null;
    return {
      code: texte(e.code, 60),
      taille: entier(e.taille, 0, 24, 0),          // points ; 0 : taille du tableau
      gras: e.gras === true, italique: e.italique === true, souligne: e.souligne === true, majuscules: e.majuscules === true,
      ligne: e.ligne === undefined ? i > 0 : e.ligne === true,   // à la ligne (sauf le premier, par défaut)
      etiquette: e.etiquette === true,              // libellé de la donnée devant la valeur (« Sorties libres : Oui »)
      libelle: texte(e.libelle, 40),                 // libellé court choisi (vide : nom de la donnée)
      format: FORMATS_DATE[e.format] ? e.format : '',   // dates : format choisi (vide : celui de la donnée)
      masquerVide: e.masquerVide !== false         // rien d'affiché si la donnée est vide
    };
  }
  function cas(c, i) {
    if (!c) return null;
    var els = (Array.isArray(c.elements) ? c.elements : []).map(element).filter(Boolean).slice(0, 12);
    return { id: id(c.id, i), titre: texte(c.titre, 60), largeur: entier(c.largeur, 30, 900, 0), notes: c.notes === true && !els.length, elements: els };
  }
  function zones(z) { z = z || {}; return { gauche: texte(z.gauche, 160), centre: texte(z.centre, 160), droite: texte(z.droite, 160) }; }

  /** Modèle proposé (demande du porteur) : chambre et patient, consignes, prochains événements, notes. */
  function modele(o) {
    o = o || {};
    var c1 = [{ code: 'chambre', gras: true, taille: 11 }, { code: 'patient', gras: true, majuscules: false, ligne: true }, { code: 'entree', format: 'jourMoisJours', etiquette: true, libelle: 'Entrée' }, { code: 'mode', etiquette: false },
      { code: 'medecin1', etiquette: true }, { code: 'medecin2', etiquette: true }, { code: 'psychologue', etiquette: true, libelle: 'Psychologue' },
      { code: 'referents', etiquette: true, libelle: 'Référents' }, { code: 'suiviASOuiNon', etiquette: true, libelle: 'Assistant(e) social(e)', masquerVide: false },
      { code: 'protectionOuiNon', etiquette: true, libelle: 'Mesure de protection' }, { code: 'contrat', etiquette: true, libelle: 'Contrat' }, { code: 'dernierEntretien', etiquette: true, libelle: 'Entretien médical' }];
    return {
      cases: [
        { id: 'patient', titre: 'Chambre — patient', largeur: 230, elements: c1 },
        { id: 'consignes', titre: 'Consignes', largeur: 170, elements: (o.consignes || []).map(function (c) { return { code: c, etiquette: /sorties/.test(c) }; }) },
        { id: 'evenements', titre: 'Prochains événements', largeur: 160, elements: [{ code: 'evenements' }] },
        { id: 'notes', titre: 'Notes', largeur: 260, notes: true, elements: [] }
      ],
      police: 8, hauteurLigne: 0, hauteurTitre: 0, ajuster: true, evenementsJours: 3,
      impression: { faces: 4, orientation: 'portrait', numero: true, taches: 'suite',
        entete: { gauche: '{etablissement} — {service}', centre: '{titre}', droite: '{date} — poste : {poste}' },
        pied: { gauche: 'Imprimé par {agent} le {date} à {heure}', centre: 'Document confidentiel — à détruire après usage', droite: '' } }
    };
  }
  /** Mise en page validée à la lecture (valeurs par défaut du modèle pour ce qui manque). */
  function normaliser(t) {
    var d = modele(), x = t && typeof t === 'object' ? t : {}, imp = x.impression || {};
    var cs = Array.isArray(x.cases) ? x.cases.map(cas).filter(Boolean).slice(0, 20) : d.cases.map(cas);
    var vus = {}; cs.forEach(function (c, i) { if (vus[c.id]) c.id = c.id + '-' + i; vus[c.id] = 1; });
    return {
      cases: cs.length ? cs : d.cases.map(cas),
      police: entier(x.police, 6, 14, d.police),
      hauteurLigne: entier(x.hauteurLigne, 0, 120, 0),     // mm ; 0 : selon le contenu
      hauteurTitre: entier(x.hauteurTitre, 0, 40, 0),
      ajuster: x.ajuster !== false,
      evenementsJours: entier(x.evenementsJours, 1, 14, d.evenementsJours),
      impression: {
        faces: entier(imp.faces, 1, 20, 4), orientation: ORIENTATIONS[imp.orientation] ? imp.orientation : 'portrait', numero: imp.numero !== false,
        taches: TACHES[imp.taches] ? imp.taches : 'suite',
        entete: imp.entete ? zones(imp.entete) : zones(d.impression.entete), pied: imp.pied ? zones(imp.pied) : zones(d.impression.pied)
      }
    };
  }
  /** Données citées par le tableau (lecture, droits, tri). */
  function codes(t) { var r = []; normaliser(t).cases.forEach(function (c) { c.elements.forEach(function (e) { if (r.indexOf(e.code) < 0) r.push(e.code); }); }); return r; }
  /** Texte d'en-tête ou de pied : champs {date}, {heure}, {service}, {poste}, {agent}, {etablissement}, {titre}. */
  function remplir(modeleTexte, valeurs) {
    return String(modeleTexte || '').replace(/\{([a-z]+)\}/g, function (m, k) { return CHAMPS[k] ? String((valeurs || {})[k] || '') : m; }).replace(/\s+—\s*$/, '').replace(/^\s*—\s+/, '').trim();
  }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /**
   * Date AAAA-MM-JJ dans le format choisi ; `jours` : jours écoulés (calculés si absents), `j` : écrit « J60 » (date
   * d'entrée) plutôt que « 60 j ». null si la valeur n'est pas une date (le texte de la donnée est alors gardé).
   */
  function formaterDate(iso, format, o) {
    o = o || {};
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === 'string' ? iso : '');
    if (!format || !m) return null;
    var jours = typeof o.jours === 'number' ? o.jours : Math.floor((new Date((o.maintenant || Date.now())).setHours(0, 0, 0, 0) - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 864e5);
    var nj = o.j ? 'J' + jours : jours + ' j';
    switch (format) {
      case 'date': return m[3] + '/' + m[2] + '/' + m[1];
      case 'courte': return m[3] + '/' + m[2] + '/' + m[1].slice(2);
      case 'jourMois': return m[3] + '/' + m[2];
      case 'jours': return nj;
      case 'jourMoisJours': return m[3] + '/' + m[2] + ' (' + nj + ')';
      case 'longue': return (+m[3]) + ' ' + MOIS[+m[2] - 1] + ' ' + m[1];
    }
    return null;
  }

  // ------------------------------------------------------------ Impression : ajustement au nombre de faces
  /** Dimensions utiles d'une page (mm) : largeur et hauteur hors marges. */
  function zoneUtile(imp) {
    var p = PAGE[imp.orientation] || PAGE.portrait;
    return { l: p.l - MARGES.gauche - MARGES.droite, h: p.h - MARGES.haut - (imp.numero ? MARGES.basNumero : MARGES.bas) };
  }
  /**
   * Nombre de pages d'un tableau dont on connaît les hauteurs (mêmes unités) : `repete` (en-tête, titres et pied
   * répétés sur chaque page), `lignes` (une ligne ne se coupe pas), `apres` ({ hauteur, nouvellePage } : tâches).
   */
  function paginer(hauteurPage, repete, lignes, apres) {
    var utile = hauteurPage - repete, pages = 1, h = 0;
    if (utile <= 0) return Infinity;
    (lignes || []).forEach(function (x) {
      if (h > 0 && h + x > utile) { pages++; h = 0; }
      h += Math.min(x, utile);
    });
    if (apres && apres.hauteur > 0) {
      if (apres.nouvellePage) { pages += Math.max(1, Math.ceil(apres.hauteur / hauteurPage)); }
      else { var reste = hauteurPage - (repete + h); if (apres.hauteur > reste) pages += Math.ceil((apres.hauteur - Math.max(0, reste)) / hauteurPage); }
    }
    return pages;
  }
  /**
   * Plus grande échelle (0,3 à 1) pour laquelle le tableau tient sur `faces` pages : `mesurer(echelle)` renvoie
   * { repete, lignes, apres } aux dimensions de cette échelle. Recherche par dichotomie.
   */
  function echelle(faces, hauteurPage, mesurer) {
    var m = mesurer(1);
    if (paginer(hauteurPage, m.repete, m.lignes, m.apres) <= faces) return 1;
    var bas = 0.3, haut = 1;
    for (var i = 0; i < 9; i++) {
      var mi = (bas + haut) / 2, x = mesurer(mi);
      if (paginer(hauteurPage, x.repete, x.lignes, x.apres) <= faces) bas = mi; else haut = mi;
    }
    return Math.floor(bas * 100) / 100;
  }

  // ------------------------------------------------------------ Tâches du poste
  function minutes(hm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; }
  /**
   * Tâches du poste choisi (Agenda) : [{ jour, heure, titre, fait, affecte }] pour le jour `jour` (AAAA-MM-JJ) et le poste
   * { debut, fin } (poste de nuit : jusqu'au lendemain). Les tâches sans heure sont gardées (à faire dans la journée)
   * sauf pour la nuit. `dues` : tâches dues du jour et du lendemain (tachesDues de l'Agenda).
   */
  function tachesDuPoste(dues, jour, poste, lendemain) {
    var d = minutes(poste && poste.debut), f = minutes(poste && poste.fin), nuit = d !== null && f !== null && f <= d;
    return (dues || []).filter(function (x) {
      var m = minutes(x.tache && x.tache.heure);
      if (d === null || f === null) return x.occurrence === jour;
      if (m === null) return !nuit && x.occurrence === jour;
      if (!nuit) return x.occurrence === jour && m >= d && m < f;
      return (x.occurrence === jour && m >= d) || (x.occurrence === lendemain && m < f);
    }).map(function (x) { return { jour: x.occurrence, heure: (x.tache && x.tache.heure) || '', titre: (x.tache && x.tache.titre) || '', fait: !!x.fait, affecte: x.affecte || null, service: x.tache && x.tache.service }; })
      .sort(function (a, b) { return a.jour.localeCompare(b.jour) || (a.heure || '99').localeCompare(b.heure || '99'); });
  }
  /** Poste en cours à l'heure `t` parmi les périodes du service (Matin, Après-midi, Nuit…). */
  function posteDe(periodes, t) {
    var dt = new Date(t), m = dt.getHours() * 60 + dt.getMinutes();
    return (periodes || []).filter(function (p) {
      var d = minutes(p.debut), f = minutes(p.fin);
      if (d === null || f === null) return false;
      return f > d ? m >= d && m < f : m >= d || m < f;
    })[0] || (periodes || [])[0] || null;
  }

  return { FORMATS_DATE: FORMATS_DATE, formaterDate: formaterDate, CHAMPS: CHAMPS, TACHES: TACHES, ORIENTATIONS: ORIENTATIONS, MARGES: MARGES, PAGE: PAGE, modele: modele, normaliser: normaliser, codes: codes, remplir: remplir,
    zoneUtile: zoneUtile, paginer: paginer, echelle: echelle, tachesDuPoste: tachesDuPoste, posteDe: posteDe, element: element };
});
