// SPDX-License-Identifier: EUPL-1.2
/*
 * Liste des codes CIM importée par l'établissement (0.82.0, demande du porteur du 16 novembre 2026).
 *
 * Tessera ne fournit pas la liste : la CIM-10 (classification internationale des maladies, droits de l'Organisation
 * mondiale de la santé) dans sa version française à usage PMSI (programme de médicalisation des systèmes
 * d'information) est publiée par l'ATIH (Agence technique de l'information sur l'hospitalisation) et diffusée par
 * l'Agence du numérique en santé sous ses propres conditions de licence. L'établissement télécharge le fichier officiel
 * et l'importe ; il reste dans son dossier, chiffré par la clé du module Données cliniques.
 *
 * Formats lus :
 *   - fichier de nomenclature de l'ATIH (code sans point sur 6 caractères | type | libellé court | libellé complet),
 *     encodé en Windows-1252 ou en UTF-8 ;
 *   - ressource « CodeSystem » au format JSON (FHIR) du serveur multi-terminologies de l'Agence du numérique en santé
 *     (concepts imbriqués : code, display) ;
 *   - tableau à deux colonnes (code ; libellé), séparateur point-virgule, tabulation ou virgule.
 * Aucun appel réseau : le fichier est lu dans le navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).cim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CODES = 60000, MAX_OCTETS = 40 * 1024 * 1024;
  var RE_CODE = /^[A-Z][0-9]{2}(?:\.[0-9A-Z+]{1,4})?[+*†]?$/;

  /** Code normalisé : majuscules, sans espace, point après le 3e caractère (« F200 » → « F20.0 », « f20.0 » → « F20.0 »). */
  function normaliser(code) {
    var c = String(code == null ? '' : code).toUpperCase().replace(/\s+/g, '');
    var m = /^([A-Z][0-9]{2})\.?([0-9A-Z+]{0,4})([*†]?)$/.exec(c);
    if (!m) return c;
    return m[1] + (m[2] ? '.' + m[2] : '') + m[3];
  }
  /** Clé de comparaison : sans point ni signe (« F20.0 », « F200 », « F20.0+ » → « F200 »). */
  function cleCode(code) { return normaliser(code).replace(/[.+*†]/g, ''); }
  function sansAccents(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /** Texte d'un fichier : UTF-8 si valide, sinon Windows-1252 (fichiers de l'ATIH). */
  function texteDe(octets) {
    if (typeof octets === 'string') return octets;
    var o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    if (o.length > MAX_OCTETS) throw new Error('Fichier trop volumineux pour une liste de codes CIM.');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(o).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(o); }
  }
  function nettoyer(t, n) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, n || 300); }

  function lireFhir(obj) {
    var codes = [], rejetes = 0;
    (function parcourir(liste) {
      (Array.isArray(liste) ? liste : []).forEach(function (c) {
        if (!c || typeof c !== 'object' || codes.length >= MAX_CODES) return;
        var code = normaliser(c.code), lib = nettoyer(c.display || (Array.isArray(c.designation) && c.designation[0] && c.designation[0].value));
        if (RE_CODE.test(code) && lib) codes.push([code, lib, '']); else if (c.code) rejetes++;
        parcourir(c.concept);
      });
    })(obj.concept);
    return { codes: codes, rejetes: rejetes, format: 'CodeSystem (JSON)', version: nettoyer(obj.version, 40), editeur: nettoyer(obj.publisher, 120), titre: nettoyer(obj.title || obj.name, 200) };
  }
  function lireLignes(texte) {
    var lignes = texte.split(/\r?\n/), codes = [], rejetes = 0, atih = 0;
    for (var i = 0; i < lignes.length && codes.length < MAX_CODES; i++) {
      var l = lignes[i];
      if (!l.trim()) continue;
      var champs, code, lib, type = '';
      if (l.indexOf('|') >= 0) {
        champs = l.split('|');
        code = normaliser(champs[0]); type = nettoyer(champs[1], 2);
        lib = nettoyer(champs.length > 3 ? champs[3] : champs[champs.length - 1]) || nettoyer(champs[2]);
        if (champs.length >= 3) atih++;
      } else {
        var sep = l.indexOf(';') >= 0 ? ';' : l.indexOf('\t') >= 0 ? '\t' : ',';
        champs = l.split(sep);
        code = normaliser(champs[0].replace(/^"|"$/g, ''));
        lib = nettoyer(champs.slice(1).join(sep === ',' ? ', ' : ' ').replace(/^"|"$/g, '').replace(/""/g, '"'));
      }
      if (RE_CODE.test(code) && lib) codes.push([code, lib, /^[0-3]$/.test(type) ? type : '']);
      else if (i > 0 || RE_CODE.test(normaliser(champs[0]))) rejetes++;   // la première ligne peut être un en-tête
    }
    return { codes: codes, rejetes: rejetes, format: atih > codes.length / 2 ? 'nomenclature de l’ATIH' : 'tableau code ; libellé', version: '' };
  }
  /**
   * Lecture d'un fichier importé : { codes: [[code, libellé, type]], nombre, rejetes, format, version, doublons }.
   * Erreur si aucun code n'est reconnu.
   */
  function lire(octets) {
    var t = texteDe(octets), r;
    var debut = t.replace(/^\s+/, '').charAt(0);
    if (debut === '{') {
      var obj;
      try { obj = JSON.parse(t); } catch (e) { throw new Error('Fichier JSON illisible.'); }
      if (!obj || obj.resourceType !== 'CodeSystem') throw new Error('Ce fichier JSON n’est pas une terminologie (« CodeSystem » attendu).');
      r = lireFhir(obj);
    } else r = lireLignes(t);
    var vus = Object.create(null), codes = [], doublons = 0;
    r.codes.forEach(function (c) { var k = cleCode(c[0]); if (vus[k]) { doublons++; return; } vus[k] = 1; codes.push(c); });
    codes.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    if (!codes.length) throw new Error('Aucun code CIM reconnu dans ce fichier.');
    return { codes: codes, nombre: codes.length, rejetes: r.rejetes, doublons: doublons, format: r.format, version: r.version || '', editeur: r.editeur || '', titre: r.titre || '' };
  }

  /** Index de recherche d'une liste : { liste, parCle, mots }. */
  function indexer(codes) {
    var parCle = Object.create(null), mots = [];
    (codes || []).forEach(function (c, i) { parCle[cleCode(c[0])] = i; mots[i] = sansAccents(c[1]); });
    return { liste: codes || [], parCle: parCle, mots: mots };
  }
  /** Entrée d'un code exact (« F200 », « f20.0 ») : { code, libelle, type } ou null. */
  function trouver(idx, code) {
    if (!idx) return null;
    var i = idx.parCle[cleCode(code)];
    return i === undefined ? null : { code: idx.liste[i][0], libelle: idx.liste[i][1], type: idx.liste[i][2] || '' };
  }
  /**
   * Suggestions pour une saisie : codes commençant par la saisie (« F20 » → F20, F20.0…), puis libellés contenant tous
   * les mots saisis (sans accents ni majuscules). `max` suggestions (10 par défaut).
   */
  function chercher(idx, saisie, max) {
    max = max || 10;
    var s = String(saisie || '').trim(), res = [];
    if (!idx || !s) return res;
    var k = cleCode(s);
    if (/^[A-Za-z][0-9]/.test(s)) {
      for (var i = 0; i < idx.liste.length && res.length < max; i++) if (cleCode(idx.liste[i][0]).indexOf(k) === 0) res.push(i);
    }
    var mots = sansAccents(s).split(/[^a-z0-9]+/).filter(function (m) { return m.length >= 2; });
    if (mots.length && res.length < max) {
      for (var j = 0; j < idx.liste.length && res.length < max; j++) {
        if (res.indexOf(j) >= 0) continue;
        var m = idx.mots[j], ok = true;
        for (var n = 0; n < mots.length; n++) if (m.indexOf(mots[n]) < 0) { ok = false; break; }
        if (ok) res.push(j);
      }
    }
    return res.map(function (x) { return { code: idx.liste[x][0], libelle: idx.liste[x][1], type: idx.liste[x][2] || '' }; });
  }
  var TYPES = { 0: '', 1: 'imprécis : à éviter en diagnostic principal', 2: 'cause externe : pas en diagnostic principal', 3: 'catégorie : préférer un code plus précis' };

  return { lire: lire, indexer: indexer, trouver: trouver, chercher: chercher, normaliser: normaliser, cleCode: cleCode, TYPES: TYPES, RE_CODE: RE_CODE };
});
