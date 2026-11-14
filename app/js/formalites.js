// SPDX-License-Identifier: EUPL-1.2
/*
 * Tessera Santé — formalités d'admission et de sortie (lot P, phase 4, 14 novembre 2026).
 *
 * Check-list administrative par séjour, dans la fiche patient (décision du porteur du 14 novembre 2026) : à l'admission
 * (livret d'accueil, information sur les droits et les voies de recours, personne à prévenir, personne de confiance,
 * inventaire des effets) et à la sortie (effets restitués, documents de sortie remis). Liste réglable par
 * l'établissement et par le cadre pour ses services, selon le mode d'hospitalisation ; chaque formalité est faite ou
 * « sans objet », datée et signée ; alerte quand elle reste à faire 48 heures (réglable) après l'entrée ou la sortie.
 * Aucune donnée clinique : seulement fait / sans objet / à faire, la date et l'agent. Option **désactivée par défaut**,
 * activée par l'établissement ou par service. Saisies `FORMALITE` du journal du module Patients.
 * Aucune dépendance au navigateur : testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).formalites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MOMENTS = { admission: 'À l’admission', sortie: 'À la sortie' };
  var DEFAUT = [
    { id: 'livret', libelle: 'Livret d’accueil remis', moment: 'admission' },
    { id: 'droits', libelle: 'Information sur les droits et les voies de recours donnée', moment: 'admission' },
    { id: 'prevenir', libelle: 'Personne à prévenir renseignée', moment: 'admission' },
    { id: 'confiance', libelle: 'Personne de confiance proposée', moment: 'admission' },
    { id: 'inventaire', libelle: 'Inventaire des effets fait', moment: 'admission' },
    { id: 'restitution', libelle: 'Effets restitués', moment: 'sortie' },
    { id: 'documents', libelle: 'Documents de sortie remis', moment: 'sortie' }
  ];
  var DELAI_DEFAUT = 48;
  var ETATS = { fait: 'Fait', sansObjet: 'Sans objet' };

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function formalite(x) {
    if (!x || typeof x !== 'object' || !MOMENTS[x.moment]) return null;
    var lib = texte(x.libelle, 120); if (!lib) return null;
    var d = Math.round(+x.delai);
    return { id: texte(x.id, 30).replace(/[^A-Za-z0-9_-]/g, '') || lib.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30), libelle: lib, moment: x.moment,
      modes: Array.isArray(x.modes) ? x.modes.filter(function (m) { return typeof m === 'string' && m; }).slice(0, 20) : [], delai: d >= 1 && d <= 720 ? d : DELAI_DEFAUT };
  }
  /**
   * Réglages d'un service (`config.formalites` = { '*': { active, liste }, <service>: { active, liste } }) : le service
   * remplace l'établissement réglage par réglage. Désactivé par défaut ; liste par défaut si aucune n'est réglée.
   */
  function options(config, service) {
    var c = (config && config.formalites) || {}, e = c['*'] || {}, s = (service && c[service]) || {};
    var active = s.active !== undefined ? s.active === true : e.active === true;
    var brute = Array.isArray(s.liste) ? s.liste : Array.isArray(e.liste) ? e.liste : DEFAUT;
    var vus = {}, liste = brute.map(formalite).filter(function (f) { if (!f || vus[f.id]) return false; vus[f.id] = 1; return true; }).slice(0, 40);
    return { active: active, liste: liste.length ? liste : DEFAUT.map(formalite) };
  }
  function msJour(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : null; }
  /** Mode d'hospitalisation en vigueur à une date (ms). */
  function modeAu(fiche, t) { var m = ''; ((fiche && fiche.modes) || []).forEach(function (x) { if (x.date <= t || !m) m = x.mode; }); return m; }

  /**
   * État des formalités d'un séjour : [{ f, statut: 'fait'|'sansObjet'|'aFaire'|'retard'|'avenir', le, par, nom, echeance }].
   * Formalités de sortie attendues seulement quand la sortie est enregistrée ; formalité limitée à certains modes :
   * retenue si le mode à l'entrée (ou à la sortie) en fait partie.
   */
  function etatSejour(fiche, sejour, config, maintenant) {
    if (!fiche || !sejour) return [];
    var sv = sejour.service || fiche.service, o = options(config, sv), now = maintenant || Date.now(), faits = ((fiche.formalites || {})[sejour.id]) || {};
    var tE = msJour(sejour.entree), tS = msJour(sejour.sortie);
    return o.liste.map(function (f) {
      var base = f.moment === 'sortie' ? tS : tE, mode = modeAu(fiche, base || now);
      if (f.modes.length && mode && f.modes.indexOf(mode) < 0) return null;
      var x = faits[f.id], ech = base !== null ? base + f.delai * 3600000 : null;
      var statut = x && ETATS[x.etat] ? x.etat : (base === null ? 'avenir' : ech <= now ? 'retard' : 'aFaire');
      return { f: f, statut: statut, le: x ? x.le : '', par: x ? x.par : '', nom: x ? x.nom : '', echeance: ech };
    }).filter(Boolean);
  }
  /** Séjour concerné : séjour en cours, sinon le dernier (formalités de sortie). */
  function sejourCourant(fiche) {
    var s = (fiche && fiche.sejours) || [], r = null;
    s.forEach(function (x) { if (!x.sortie) r = x; });
    return r || s[s.length - 1] || null;
  }
  /**
   * Formalités en retard des services donnés (option active) : [{ fiche, sejour, f, echeance }], séjours en cours et
   * sorties des 30 derniers jours.
   */
  function retards(fiches, config, services, maintenant) {
    var now = maintenant || Date.now(), res = [];
    Object.keys(fiches || {}).forEach(function (k) {
      var p = fiches[k]; if (!p || p.fusionneDans) return;
      (p.sejours || []).forEach(function (sj) {
        var sv = sj.service || p.service;
        if (services && services.indexOf(sv) < 0) return;
        if (!options(config, sv).active) return;
        if (sj.sortie && now - msJour(sj.sortie) > 30 * 86400000) return;
        etatSejour(p, sj, config, now).forEach(function (x) { if (x.statut === 'retard') res.push({ fiche: p, sejour: sj, f: x.f, echeance: x.echeance }); });
      });
    });
    return res.sort(function (a, b) { return a.echeance - b.echeance; });
  }
  /** Résumé pour la Vue d'ensemble : « 3/5 » faites (ou sans objet) parmi les formalités attendues du séjour en cours. */
  function resume(fiche, config, maintenant) {
    var sj = sejourCourant(fiche); if (!sj) return null;
    var l = etatSejour(fiche, sj, config, maintenant).filter(function (x) { return x.statut !== 'avenir'; });
    if (!l.length) return null;
    var ok = l.filter(function (x) { return x.statut === 'fait' || x.statut === 'sansObjet'; }).length;
    return { faites: ok, total: l.length, retard: l.some(function (x) { return x.statut === 'retard'; }) };
  }

  // ------------------------------------------------------------ Saisie FORMALITE (journal du module Patients)
  /** Réduction : fiche.formalites[sejour][formalité] = { etat, le, par, nom } ; etat null : remise « à faire ». */
  function appliquer(fiche, e) {
    var d = e.data || {};
    if (!fiche || !d.sejourId || !d.formalite) return;
    fiche.formalites = fiche.formalites || {};
    var s = fiche.formalites[d.sejourId] = fiche.formalites[d.sejourId] || {};
    if (d.etat && ETATS[d.etat]) s[d.formalite] = { etat: d.etat, le: e.at, par: e.by, nom: texte(d.nom, 80) };
    else delete s[d.formalite];
  }
  function controler(d, fiche) {
    if (!d || !d.patientId || !d.sejourId || !d.formalite) throw new Error('Formalité incomplète.');
    if (d.etat !== null && d.etat !== undefined && !ETATS[d.etat]) throw new Error('État inconnu.');
    if (fiche && !(fiche.sejours || []).some(function (s) { return s.id === d.sejourId; })) throw new Error('Séjour introuvable.');
  }
  /** Contrôle d'un changement par le cadre : seulement les réglages de ses services. */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  return { MOMENTS: MOMENTS, DEFAUT: DEFAUT, ETATS: ETATS, DELAI_DEFAUT: DELAI_DEFAUT, options: options, formalite: formalite, etatSejour: etatSejour, sejourCourant: sejourCourant,
    retards: retards, resume: resume, appliquer: appliquer, controler: controler, controlerCadre: controlerCadre, modeAu: modeAu };
});
