// SPDX-License-Identifier: EUPL-1.2
/*
 * Socle — registre des modules (étape 2 du plan d'architecture, docs/architecture.md § 3).
 * Chaque module déclare son contrat ; le socle (session, coquille, rôles, réglages, formation) ne lit que ce contrat.
 *
 * Contrat d'un module :
 *   identité     id, libelle, version, icone
 *   acces        accès cochables pour les rôles : [{ code, libelle, types }]
 *   droits       fonctions des droits liées aux données du module (droits.js, `creer`)
 *   saisies      { types: [...], champ(e) : champ logique modifié (conflits), reduire(evts) : état reconstitué }
 *   reglages     { defaut, groupes (export des réglages), exclus (jamais exportés) }
 *   vues         { onglets: [{ code, libelle, masquable }] } ; affichage fourni par l'interface du module
 *   migrations   [{ numero, libelle, appliquer }] numérotées, idempotentes
 *   formation    { generer(config) } : saisies fictives du jeu de formation (facultatif)
 *   fournitures  [{ nom, version, champs, acces, publication }] : données lues par d'autres modules
 *   besoins      [{ fourniture, version, obligatoire }] : fournitures attendues d'autres modules
 *   interface    ajoutée par le fichier d'interface du module (navigateur) : { vues, journal, admin }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).modules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MOTIF_ID = /^[a-z][a-z0-9-]{1,30}$/;
  var MOTIF_FOURNITURE = /^[a-z][a-z0-9-]{1,30}\.[A-Za-z][A-Za-z0-9]{1,40}$/;

  function erreur(id, texte) { return new Error('Module « ' + (id || '?') + ' » : ' + texte); }

  /** Contrôle d'un contrat ; renvoie une copie figée de ses éléments obligatoires, complétée des valeurs par défaut. */
  function valider(c) {
    if (!c || typeof c !== 'object') throw erreur(null, 'contrat absent.');
    var id = c.id;
    if (!MOTIF_ID.test(String(id || ''))) throw erreur(id, 'identifiant invalide (minuscules, chiffres, tirets).');
    if (!String(c.libelle || '').trim()) throw erreur(id, 'libellé obligatoire.');
    if (!/^\d+\.\d+\.\d+$/.test(String(c.version || ''))) throw erreur(id, 'version attendue au format 1.2.3.');
    if (!Array.isArray(c.acces)) throw erreur(id, 'liste des accès obligatoire (vide si aucun).');
    var codes = {};
    c.acces.forEach(function (a) {
      if (!a || !a.code || !a.libelle || !Array.isArray(a.types)) throw erreur(id, 'accès incomplet (code, libellé, types).');
      if (codes[a.code]) throw erreur(id, 'accès en double : ' + a.code + '.');
      codes[a.code] = 1;
    });
    if (!c.droits || typeof c.droits.peut !== 'function' || typeof c.droits.rolesConfig !== 'function') throw erreur(id, 'droits absents (droits.js, creer).');
    if (!c.saisies || typeof c.saisies.reduire !== 'function' || !Array.isArray(c.saisies.types)) throw erreur(id, 'saisies : types et reduire obligatoires.');
    if (!c.reglages || !c.reglages.defaut || typeof c.reglages.defaut !== 'object') throw erreur(id, 'réglages par défaut obligatoires.');
    if (!c.vues || !Array.isArray(c.vues.onglets) || !c.vues.onglets.length) throw erreur(id, 'au moins un onglet.');
    var onglets = {};
    c.vues.onglets.forEach(function (o) {
      if (!o || !o.code || !o.libelle) throw erreur(id, 'onglet incomplet (code, libellé).');
      if (onglets[o.code] || o.code === 'journal' || o.code === 'admin') throw erreur(id, 'onglet en double ou réservé au socle : ' + o.code + '.');
      onglets[o.code] = 1;
    });
    var numeros = {};
    (c.migrations || []).forEach(function (m, i) {
      if (!m || m.numero !== i + 1 || typeof m.appliquer !== 'function') throw erreur(id, 'migrations numérotées 1, 2, 3… avec une fonction appliquer.');
      numeros[m.numero] = 1;
    });
    if (c.formation && typeof c.formation.generer !== 'function') throw erreur(id, 'formation : fonction generer attendue.');
    (c.fournitures || []).forEach(function (f) {
      if (!f || !MOTIF_FOURNITURE.test(String(f.nom || '')) || f.nom.split('.')[0] !== id) throw erreur(id, 'fourniture mal nommée (« ' + id + '.nom »).');
      if (!(f.version >= 1) || !Array.isArray(f.champs)) throw erreur(id, 'fourniture ' + f.nom + ' : version et champs obligatoires.');
      if (f.publication) throw erreur(id, 'fourniture ' + f.nom + ' : la publication est désactivée (lecture à la volée seulement).');
    });
    (c.besoins || []).forEach(function (b) {
      if (!b || !MOTIF_FOURNITURE.test(String(b.fourniture || '')) || !(b.version >= 1)) throw erreur(id, 'besoin mal décrit (fourniture, version).');
      if (b.fourniture.split('.')[0] === id) throw erreur(id, 'un module ne dépend pas de lui-même.');
    });
    return c;
  }

  /** Registre (une instance par page ; `nouveau()` pour les tests). */
  function nouveau() {
    var liste = [];
    var reg = {
      /** Déclare un module ; refuse un contrat incomplet ou un identifiant déjà pris. */
      declarer: function (contrat) {
        var c = valider(contrat);
        if (liste.some(function (x) { return x.id === c.id; })) throw erreur(c.id, 'déjà déclaré.');
        c.migrations = c.migrations || []; c.fournitures = c.fournitures || []; c.besoins = c.besoins || [];
        liste.push(c);
        return c;
      },
      /** Ajoute au contrat les éléments d'interface (navigateur) : { vues, journal, admin }. */
      completerInterface: function (id, interfaceModule) {
        var c = reg.obtenir(id);
        if (!c) throw erreur(id, 'non déclaré : déclarer le module avant son interface.');
        c.interface = Object.assign(c.interface || {}, interfaceModule);
        return c;
      },
      obtenir: function (id) { return liste.filter(function (x) { return x.id === id; })[0] || null; },
      liste: function () { return liste.slice(); },
      /**
       * Module affiché. Un seul module est déclaré tant que le module Patients et l'Agenda n'existent pas
       * (étapes 5 et 6) ; l'écran d'accueil des modules viendra avec eux.
       */
      actif: function () { return liste[0] || null; },
      /** Besoins non satisfaits : [{ module, fourniture, version, obligatoire }]. */
      besoinsManquants: function () {
        var dispo = {};
        liste.forEach(function (m) { m.fournitures.forEach(function (f) { dispo[f.nom] = Math.max(dispo[f.nom] || 0, f.version); }); });
        var res = [];
        liste.forEach(function (m) {
          m.besoins.forEach(function (b) { if (!(dispo[b.fourniture] >= b.version)) res.push({ module: m.id, fourniture: b.fourniture, version: b.version, obligatoire: !!b.obligatoire }); });
        });
        return res;
      },
      /** Migrations restant à appliquer pour un module, d'après le dernier numéro déjà appliqué. */
      migrationsAFaire: function (id, dernierFait) {
        var c = reg.obtenir(id);
        return c ? c.migrations.filter(function (m) { return m.numero > (dernierFait || 0); }) : [];
      }
    };
    return reg;
  }

  var registre = nouveau();
  registre.nouveau = nouveau;
  registre.valider = valider;
  return registre;
});
