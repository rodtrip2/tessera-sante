/*
 * Tessera Santé — messageries du service, sans connexion (lot A, option 1 des messageries Zimbra, 14 novembre 2026).
 *
 * Annuaire des boîtes aux lettres du service (`config.boitesMail` = { '*': établissement, <service>: [...] }), réglé par
 * l'administrateur et par le cadre pour ses services : quelle boîte pour qui (rôles), adresse, lien du webmail.
 * Tessera n'envoie rien et ne lit aucun courriel : « Écrire à… » ouvre la messagerie du poste avec le destinataire et
 * l'objet préremplis (lien `mailto:`), le raccourci ouvre le webmail dans un nouvel onglet. Aucun contenu clinique
 * n'est préparé : l'objet ne reprend jamais l'identité d'un patient.
 * Aucune dépendance au navigateur : testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).messageries = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RE_ADRESSE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
  function adresseValide(a) { return RE_ADRESSE.test(String(a || '').trim()); }
  /** Lien du webmail : http ou https seulement (jamais javascript: ni data:). */
  function webmailValide(u) { return /^https?:\/\/[^\s<>"]+$/i.test(String(u || '').trim()); }

  function boite(x) {
    if (!x || typeof x !== 'object') return null;
    var adresse = String(x.adresse || '').trim().toLowerCase();
    if (!adresseValide(adresse)) return null;
    return { libelle: String(x.libelle || adresse).trim().slice(0, 60), adresse: adresse,
      roles: Array.isArray(x.roles) ? x.roles.filter(function (r) { return typeof r === 'string' && r; }).map(function (r) { return r.toUpperCase(); }) : [],
      webmail: webmailValide(x.webmail) ? String(x.webmail).trim() : '' };
  }
  function normaliser(v) {
    var res = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return res;
    Object.keys(v).forEach(function (k) { var l = (Array.isArray(v[k]) ? v[k] : []).map(boite).filter(Boolean); if (l.length) res[k] = l; });
    return res;
  }
  /**
   * Boîtes proposées pour des services : celles de l'établissement puis celles des services, sans doublon d'adresse,
   * avec le service d'origine (`service`, '*' pour l'établissement).
   */
  function boites(config, services) {
    var v = normaliser(config && config.boitesMail), res = [], vues = {};
    ['*'].concat(services || []).forEach(function (k) {
      (v[k] || []).forEach(function (b) { if (!vues[b.adresse]) { vues[b.adresse] = 1; res.push(Object.assign({ service: k }, b)); } });
    });
    return res;
  }
  /** Boîtes d'un agent : celles réservées à l'un de ses rôles, ou sans rôle désigné (boîte de tous). */
  function boitesPour(config, services, roles) {
    var r = roles || [];
    return boites(config, services).filter(function (b) { return !b.roles.length || b.roles.some(function (x) { return r.indexOf(x) >= 0; }); });
  }
  /** Lien `mailto:` (destinataires valides seulement ; objet et texte encodés). Rend '' sans destinataire valide. */
  function mailto(adresses, objet, corps) {
    var l = (Array.isArray(adresses) ? adresses : [adresses]).map(function (a) { return String(a || '').trim(); }).filter(adresseValide);
    if (!l.length) return '';
    var q = [];
    if (objet) q.push('subject=' + encodeURIComponent(String(objet).slice(0, 200)));
    if (corps) q.push('body=' + encodeURIComponent(String(corps).slice(0, 1500)));
    return 'mailto:' + l.map(encodeURIComponent).join(',').replace(/%40/g, '@') + (q.length ? '?' + q.join('&') : '');
  }
  /** Lignes du réglage « Libellé | adresse | rôles (codes, virgules) | webmail » ↔ boîtes. */
  function depuisTexte(texte) {
    return String(texte || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return boite({ libelle: p[0], adresse: p[1], roles: (p[2] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean), webmail: p[3] });
    }).filter(Boolean);
  }
  function versTexte(liste) {
    return (liste || []).map(function (b) { return [b.libelle, b.adresse, (b.roles || []).join(', '), b.webmail || ''].join(' | ').replace(/( \| )+$/, ''); }).join('\n');
  }
  /** Contrôle d'un changement par le cadre : seulement les listes de ses services (l'établissement reste à l'administrateur). */
  function controler(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  return { adresseValide: adresseValide, webmailValide: webmailValide, normaliser: normaliser, boites: boites, boitesPour: boitesPour, mailto: mailto, depuisTexte: depuisTexte, versTexte: versTexte, controler: controler };
});
