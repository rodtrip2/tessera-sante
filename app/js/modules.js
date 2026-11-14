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
 *   indispensable vrai pour un module que l'administrateur ne peut pas arrêter (0.43.0 : Équipe, prêts de droits) ;
 *                un module de référence (Patients) est toujours indispensable
 *   reference    vrai pour un module de référence partagé par d'autres (Patients, étape 5) : sans onglet ni droits
 *                propres tant qu'il n'a pas son écran ; ses saisies sont permises par les modules qui en dépendent,
 *                et sa clé est remise à qui a droit à l'un d'eux
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
    if (!c.reference && (!c.droits || typeof c.droits.peut !== 'function' || typeof c.droits.rolesConfig !== 'function')) throw erreur(id, 'droits absents (droits.js, creer).');
    if (!c.saisies || typeof c.saisies.reduire !== 'function' || !Array.isArray(c.saisies.types)) throw erreur(id, 'saisies : types et reduire obligatoires.');
    if (!c.reglages || !c.reglages.defaut || typeof c.reglages.defaut !== 'object') throw erreur(id, 'réglages par défaut obligatoires.');
    if (!c.vues || !Array.isArray(c.vues.onglets) || (!c.reference && !c.vues.onglets.length)) throw erreur(id, 'au moins un onglet.');
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
        var types = {};
        liste.forEach(function (m) { m.saisies.types.forEach(function (t) { types[t] = m.id; }); });
        c.saisies.types.forEach(function (t) { if (types[t]) throw erreur(c.id, 'type de saisie « ' + t + ' » déjà déclaré par « ' + types[t] + ' ».'); });
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
      actif: function () { return liste.filter(function (m) { return !m.reference; })[0] || null; },
      /**
       * Onglets de la fenêtre d'un module (décision du porteur du 7 novembre 2026 : une fenêtre par module, avec ses
       * propres onglets) ; sans identifiant, ceux du module principal.
       */
      onglets: function (idModule) {
        var a = (idModule && reg.obtenir(idModule)) || reg.actif();
        return a ? a.vues.onglets.slice() : [];
      },
      /** Module indispensable (0.43.0) : ni arrêt depuis l'accueil de l'administration, ni désactivation complète. */
      indispensable: function (id) { var m = reg.obtenir(id); return !!(m && (m.reference || m.indispensable)); },
      /**
       * Réglage d'activation d'un module (`modulesServices`) avec les services choisis : l'arrêt éventuel est gardé ;
       * `tous` : tous les services cochés (réglage d'origine). Modifie et renvoie `valeur`.
       */
      ecrireActivation: function (valeur, id, actifs, tous) {
        var arret = !!(valeur[id] && valeur[id].arret);
        if (tous) { if (arret) valeur[id] = { arret: true }; else delete valeur[id]; }
        else valeur[id] = arret ? { tous: false, services: actifs, arret: true } : { tous: false, services: actifs };
        return valeur;
      },
      /** Arrêt ou remise en marche d'un module (0.43.0), réglage par service gardé. Modifie et renvoie `valeur`. */
      ecrireArret: function (valeur, id, arret) {
        var v = Object.assign({}, valeur[id] || {});
        if (arret) v.arret = true; else delete v.arret;
        if (v.tous === false || v.arret) valeur[id] = v; else delete valeur[id];
        return valeur;
      },
      /** Module en service (0.43.0) : déclaré et pas arrêté par l'administrateur (les données d'un module arrêté restent lisibles). */
      enService: function (id, config) { var m = reg.obtenir(id); if (!m) return false; var V = typeof self !== 'undefined' && self.SIC && self.SIC.validations; if (V && !V.moduleAutorise(id, config)) return false; if (m.reference || m.indispensable || !m.droits || !m.droits.arrete) return true; return !m.droits.arrete(config); },
      /** Modules affichés (hors modules de référence). */
      affiches: function () { return liste.filter(function (m) { return !m.reference; }); },
      /**
       * Modules dans l'ordre de chargement : un module fournisseur avant ceux qui en ont besoin (le socle charge
       * Patients d'abord). Une dépendance circulaire est refusée.
       */
      ordre: function () {
        var res = [], vus = {}, enCours = {};
        function fournisseur(nom) { return liste.filter(function (m) { return m.fournitures.some(function (f) { return f.nom === nom; }); })[0]; }
        function visiter(m) {
          if (vus[m.id]) return;
          if (enCours[m.id]) throw erreur(m.id, 'dépendance circulaire.');
          enCours[m.id] = 1;
          m.besoins.forEach(function (b) { var f = fournisseur(b.fourniture); if (f) visiter(f); });
          vus[m.id] = 1; res.push(m);
        }
        liste.forEach(visiter);
        return res;
      },
      /**
       * Lecture à la volée d'une fourniture (architecture § 6) : le module fournisseur calcule, sur le poste, à partir
       * des saisies qu'on lui passe ; rien n'est écrit. null si aucun module ne la fournit.
       */
      fournir: function (nom, evts) {
        for (var i = 0; i < liste.length; i++) {
          var f = liste[i].fournitures.filter(function (x) { return x.nom === nom && typeof x.calculer === 'function'; })[0];
          if (f) return f.calculer(evts);
        }
        return null;
      },
      /**
       * Lecture à la volée d'une fourniture à partir de l'état déjà reconstitué du module fournisseur (évite de tout
       * recalculer à chaque affichage) : `lire(etat, options)` du fournisseur. null si aucun module ne la fournit.
       */
      lire: function (nom, etat, options) {
        for (var i = 0; i < liste.length; i++) {
          var f = liste[i].fournitures.filter(function (x) { return x.nom === nom && typeof x.lire === 'function'; })[0];
          if (f) return etat ? f.lire(etat, options || {}) : [];
        }
        return null;
      },
      /** Module qui déclare un type de saisie (null : saisie du socle ou inconnue). */
      moduleDuType: function (type) { return liste.filter(function (m) { return m.saisies.types.indexOf(type) >= 0; })[0] || null; },
      /** Modules qui ont besoin d'une fourniture du module `id`. */
      dependants: function (id) { return liste.filter(function (m) { return m.besoins.some(function (b) { return b.fourniture.split('.')[0] === id; }); }); },
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
