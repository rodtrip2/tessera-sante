// SPDX-License-Identifier: EUPL-1.2
/*
 * Lecteur minimal de classeurs Excel (.xlsx / .xlsm), sans bibliothèque :
 * archive ZIP lue à la main, décompression par DecompressionStream
 * (navigateur et Node ≥ 18), XML lu par expressions régulières.
 * Renvoie les valeurs brutes des cellules (texte, nombre, booléen) ;
 * les dates Excel restent des nombres de série, convertis par serieVersDate().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).xlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var dec = new TextDecoder();

  // Plafonds de décompression (0.77.0, constat S10 de l'audit) : une archive piégée (« bombe de décompression ») qui
  // gonflerait à plusieurs gigaoctets est refusée avant d'épuiser la mémoire du poste
  var PLAFOND_FICHIER = 256 * 1024 * 1024, PLAFOND_TOTAL = 512 * 1024 * 1024, RAPPORT_MAX = 1000;
  async function inflate(octets, attendu) {
    var plafond = Math.min(PLAFOND_FICHIER, Math.max(1024 * 1024, octets.length * RAPPORT_MAX));
    if (attendu > plafond) throw new Error('Classeur refusé : une partie se décompresserait en plus de ' + Math.round(plafond / 1048576) + ' Mo.');
    var lecteur = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), morceaux = [], total = 0;
    for (;;) {
      var r = await lecteur.read();
      if (r.done) break;
      total += r.value.length;
      if (total > plafond) { try { await lecteur.cancel(); } catch (e) { /* flux déjà fermé */ } throw new Error('Classeur refusé : une partie se décompresse en plus de ' + Math.round(plafond / 1048576) + ' Mo (archive anormale).'); }
      morceaux.push(r.value);
    }
    var res = new Uint8Array(total), p = 0;
    morceaux.forEach(function (m) { res.set(m, p); p += m.length; });
    return res;
  }

  /** Table des fichiers d'une archive ZIP : { nom: fonction async → Uint8Array }. */
  function lireZip(buf) {
    var u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var fin = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx ou .xlsm).");
    var n = v.getUint16(fin + 10, true), p = v.getUint32(fin + 16, true), fichiers = Object.create(null), annonce = 0;
    for (var k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Archive endommagée.');
      var methode = v.getUint16(p + 10, true), taille = v.getUint32(p + 20, true), tailleBrute = v.getUint32(p + 24, true);
      annonce += tailleBrute;
      if (annonce > PLAFOND_TOTAL) throw new Error('Classeur refusé : son contenu décompressé dépasserait ' + Math.round(PLAFOND_TOTAL / 1048576) + ' Mo.');
      var ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
      var local = v.getUint32(p + 42, true);
      var nom = dec.decode(u.subarray(p + 46, p + 46 + ln));
      (function (methode, taille, local, tailleBrute) {
        fichiers[nom] = async function () {
          var debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
          var brut = u.subarray(debut, debut + taille);
          if (methode === 0) return brut;
          if (methode === 8) return inflate(brut, tailleBrute);
          throw new Error('Compression non prise en charge (' + methode + ').');
        };
      })(methode, taille, local, tailleBrute);
      p += 46 + ln + le + lc;
    }
    return fichiers;
  }

  function entites(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
      .replace(/&amp;/g, '&');
  }

  function attr(balise, nom) {
    var m = new RegExp('\\s' + nom + '="([^"]*)"').exec(balise);
    return m ? entites(m[1]) : null;
  }

  function texteDe(xml) {
    var t = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, m;
    while ((m = re.exec(xml))) t += m[1] ? entites(m[1]) : '';
    return t;
  }

  function colonne(ref) {
    var m = /^[A-Z]+/.exec(ref); if (!m) return -1;
    var c = 0, lettres = m[0];
    for (var i = 0; i < lettres.length; i++) c = c * 26 + lettres.charCodeAt(i) - 64;
    return c - 1;
  }

  function lireFeuille(xml, partages) {
    var lignes = [], reL = /<row\b([^>]*)>([\s\S]*?)<\/row>/g, mL;
    while ((mL = reL.exec(xml))) {
      var r = +attr(mL[1], 'r') - 1, ligne = [];
      if (!(r >= 0 && r < 1048576)) continue;   // numéro de ligne hors des limites d'Excel : ignoré
      var reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, mC;
      while ((mC = reC.exec(mL[2]))) {
        var ref = attr(mC[1], 'r'), t = attr(mC[1], 't'), corps = mC[2] || '', val = null;
        var mv = /<v>([\s\S]*?)<\/v>/.exec(corps);
        if (t === 's') val = mv ? partages[+mv[1]] : null;
        else if (t === 'inlineStr') val = texteDe(corps);
        else if (t === 'str' || t === 'e') val = mv ? entites(mv[1]) : null;
        else if (t === 'b') val = mv ? mv[1] === '1' : null;
        else val = mv ? +mv[1] : null;
        var col = ref ? colonne(ref) : ligne.length;
        if (val !== null && val !== '' && col >= 0 && col < 16384) ligne[col] = val;   // 16 384 colonnes au plus (limite d'Excel)
      }
      lignes[r] = ligne;
    }
    for (var i = 0; i < lignes.length; i++) if (!lignes[i]) lignes[i] = [];
    return lignes;
  }

  /** Lit un classeur : { feuilles: { nom: [[valeurs]] } }. */
  async function lire(buf) {
    var z = lireZip(buf);
    var lireTexte = async function (n) { return z[n] ? dec.decode(await z[n]()) : ''; };
    var classeur = await lireTexte('xl/workbook.xml');
    if (!classeur) throw new Error('Classeur Excel non reconnu.');
    var liens = {}, rels = await lireTexte('xl/_rels/workbook.xml.rels'), m;
    var reR = /<Relationship\b([^>]*)\/?>/g;
    while ((m = reR.exec(rels))) {
      var cible = attr(m[1], 'Target');
      liens[attr(m[1], 'Id')] = cible.charAt(0) === '/' ? cible.slice(1) : 'xl/' + cible.replace(/^\.\//, '');
    }
    var partages = [], ss = await lireTexte('xl/sharedStrings.xml'), reS = /<si>([\s\S]*?)<\/si>/g;
    while ((m = reS.exec(ss))) partages.push(texteDe(m[1]));
    var feuilles = {}, reF = /<sheet\b([^>]*)\/?>/g;
    while ((m = reF.exec(classeur))) {
      var nom = attr(m[1], 'name'), cheminF = liens[attr(m[1], 'r:id')];
      if (cheminF && z[cheminF]) feuilles[nom] = lireFeuille(await lireTexte(cheminF), partages);
    }
    return { feuilles: feuilles };
  }

  /** Nombre de série Excel (système 1900) → horodatage, en heure locale. */
  function serieVersDate(x) {
    if (typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
    var jours = Math.floor(x), ms = Math.round((x - jours) * 86400000);
    return new Date(1899, 11, 30 + jours, 0, 0, 0, ms).getTime();
  }

  /** Date Excel ou texte « JJ/MM/AAAA [HH:MM] » → horodatage local (ou null). */
  function valeurDate(v) {
    if (typeof v === 'number') return serieVersDate(v);
    if (typeof v !== 'string') return null;
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?\s*$/.exec(v);
    if (!m) return null;
    var an = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(an, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }

  /** Transforme une feuille en objets à partir de sa ligne d'en-tête. */
  function enObjets(lignes, ligneEntete) {
    ligneEntete = ligneEntete || 0;
    var entetes = (lignes[ligneEntete] || []).map(function (x) { return x == null ? '' : String(x).trim(); });
    var res = [];
    for (var i = ligneEntete + 1; i < lignes.length; i++) {
      var l = lignes[i], o = {}, vide = true;
      entetes.forEach(function (e, j) { if (e) { o[e] = l[j]; if (l[j] != null && l[j] !== '') vide = false; } });
      if (!vide) { o._ligne = i + 1; res.push(o); }
    }
    return res;
  }

  /** Lecture d'un CSV (séparateur « ; », « , » ou tabulation, guillemets, BOM) en tableau de lignes. */
  function lireCSV(texte) {
    texte = String(texte || '').replace(/^﻿/, '');
    var premiere = texte.split(/\r?\n/)[0] || '';
    var sep = [';', '\t', ','].map(function (s) { return [s, premiere.split(s).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var lignes = [], ligne = [], champ = '', guillemets = false;
    for (var i = 0; i < texte.length; i++) {
      var c = texte[i];
      if (guillemets) {
        if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
        else if (c === '"') guillemets = false;
        else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ); champ = '';
        if (ligne.some(function (x) { return x.trim() !== ''; })) lignes.push(ligne);
        ligne = [];
      } else champ += c;
    }
    ligne.push(champ);
    if (ligne.some(function (x) { return x.trim() !== ''; })) lignes.push(ligne);
    return lignes;
  }

  return { lire: lire, lireZip: lireZip, serieVersDate: serieVersDate, valeurDate: valeurDate, enObjets: enObjets, lireCSV: lireCSV };
});
