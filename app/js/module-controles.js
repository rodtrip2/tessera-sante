// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Contrôles — contrat déclaré au registre des modules (lot B, phase 3 du plan d'action du porteur,
 * 14 novembre 2026 ; mécanisme commun prévu pour les contrôles périodiques du lot K).
 *
 * Un contrôle = un modèle (check-list, nombre d'agents) appliqué à un lieu, à chaque poste. Deux modèles pour
 * commencer, sur les chambres de soins intensifs (CSI) déclarées dans Isocont (`lieuxCSI`) :
 * - **CSI libre** : une fois par poste, à deux agents (le second confirme avec son propre compte), la CSI inoccupée
 *   est vérifiée point par point ; un point non conforme demande un commentaire (écart signalé au cadre) ;
 * - **Surveillance de la CSI** : une fois par poste, un agent note son passage dans la CSI occupée (heure, agent).
 *   Aucune donnée clinique : le contenu de la surveillance reste dans le dossier patient informatisé (DPI).
 * L'occupation des CSI est lue à la volée dans Isocont (fourniture `isocont.occupationsCSI`), sans copie. Retard :
 * rappel à l'équipe pendant le poste, alerte au cadre une fois le poste terminé (décision du porteur du 14 novembre
 * 2026). Registre exportable (preuve pour la certification ou le Contrôleur général des lieux de privation de liberté).
 * Journal `modules\controles\`, clé propre ; module **désactivé par défaut**, activé service par service.
 *
 * Contrôles périodiques (lot K, demande du porteur du 17 novembre 2026) : le cadre règle pour son service des contrôles
 * à check-list (objet ou lieu, rythme : chaque poste, jour, semaine ou mois, et après chaque utilisation ; un ou deux
 * agents) ; un point peut être une case, une valeur relevée avec ses seuils (température), une date de péremption
 * (alerte avant l'échéance) ou un court texte (numéro de scellé). Valeur hors seuil ou date dépassée : écart signalé au
 * cadre (décisions du porteur : pas de nouveau relevé imposé ; péremptions suivies avec alerte 30 jours avant). Modèles
 * proposés : chariot d'urgence, réfrigérateur à médicaments, sac d'urgence, à adapter par l'établissement. Contrôles à
 * faire lus à la volée par l'Agenda (fourniture `controles.periodiques`) et la page « Aujourd'hui ».
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).controles = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE', 'CONTROLE_UTILISATION'];
  // Liste provisoire : le porteur fournira la sienne (14 novembre 2026) ; modifiable par l'établissement et le cadre.
  var LISTE_PROVISOIRE = ['Matelas et literie en place', 'Aucun objet dangereux dans la chambre', 'Éclairage fonctionnel', 'Appel malade fonctionnel',
    'Sanitaires propres et fonctionnels', 'Visibilité par l’oculus', 'Matériel de contention complet et vérifié', 'Horloge visible depuis le lit'];
  var MODELES = {
    csiLibre: { libelle: 'Contrôle de la CSI libre', court: 'CSI libre', liste: true, deuxAgents: true },
    surveillance: { libelle: 'Passage de surveillance de la CSI', court: 'Surveillance', liste: false, deuxAgents: false },
    // Contrôle à la libération (décision du porteur du 14 novembre 2026) : même check-list, quand une mesure se termine dans la CSI
    liberation: { libelle: 'Contrôle de la CSI à sa libération', court: 'Libération', liste: true, deuxAgents: true },
    // Contrôles périodiques réglés par le cadre (17 novembre 2026) : check-list et second agent propres à chaque contrôle
    periodique: { libelle: 'Contrôle périodique', court: 'Périodique', liste: true, deuxAgents: false }
  };

  // ------------------------------------------------------------ Contrôles périodiques : modèles et réglages
  var RYTHMES = { poste: 'À chaque poste', jour: 'Chaque jour', semaine: 'Chaque semaine', mois: 'Chaque mois' };
  var TYPES_POINT = { case: 'Conforme ou non', valeur: 'Valeur relevée', peremption: 'Date de péremption', texte: 'Texte court' };
  var JOURS_SEMAINE = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  // Modèles proposés (décision du porteur du 17 novembre 2026), à adapter par l'établissement ou le cadre
  var MODELES_PERIODIQUES = {
    chariot: { libelle: 'Chariot d’urgence', lieu: 'Salle de soins', rythme: 'semaine', jourSemaine: 1, apresUtilisation: true, delaiUtilisation: 4, deuxAgents: true, alerteJours: 30,
      points: [{ libelle: 'Numéro du scellé', type: 'texte' }, { libelle: 'Scellé intact', type: 'case' }, { libelle: 'Fiche de composition présente et à jour', type: 'case' },
        { libelle: 'Médicaments d’urgence complets', type: 'case' }, { libelle: 'Médicaments : première date de péremption', type: 'peremption' },
        { libelle: 'Solutés et matériel de perfusion : première date de péremption', type: 'peremption' }, { libelle: 'Matériel de ventilation et d’intubation complet', type: 'case' },
        { libelle: 'Aspiration fonctionnelle', type: 'case' }, { libelle: 'Bouteille d’oxygène pleine, manodétendeur en place', type: 'case' },
        { libelle: 'Défibrillateur : voyant de contrôle correct', type: 'case' }, { libelle: 'Électrodes du défibrillateur : date de péremption', type: 'peremption' }] },
    refrigerateur: { libelle: 'Réfrigérateur à médicaments', lieu: 'Salle de soins', rythme: 'jour', apresUtilisation: false, delaiUtilisation: 4, deuxAgents: false, alerteJours: 30,
      points: [{ libelle: 'Température relevée', type: 'valeur', unite: '°C', min: 2, max: 8 }, { libelle: 'Température minimale (thermomètre mini-maxi)', type: 'valeur', unite: '°C', min: 2, max: 8 },
        { libelle: 'Température maximale (thermomètre mini-maxi)', type: 'valeur', unite: '°C', min: 2, max: 8 }, { libelle: 'Thermomètre remis à zéro', type: 'case' },
        { libelle: 'Porte fermée, joint en bon état', type: 'case' }, { libelle: 'Aucun aliment ni produit non médicamenteux', type: 'case' }] },
    trousse: { libelle: 'Sac d’urgence', lieu: 'Poste de soins', rythme: 'mois', jourMois: 1, apresUtilisation: true, delaiUtilisation: 4, deuxAgents: false, alerteJours: 30,
      points: [{ libelle: 'Numéro du scellé', type: 'texte' }, { libelle: 'Scellé intact', type: 'case' }, { libelle: 'Contenu complet selon la liste', type: 'case' },
        { libelle: 'Médicaments : première date de péremption', type: 'peremption' }, { libelle: 'Matériel à usage unique : première date de péremption', type: 'peremption' },
        { libelle: 'Bouteille d’oxygène portable pleine', type: 'case' }] }
  };
  function nombre(v) { return v === '' || v === null || v === undefined || !isFinite(+v) ? null : +v; }
  function entier(v, min, max, defaut) { var n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : defaut; }
  /** Point de check-list validé à la lecture. */
  function point(x) {
    var t = x && TYPES_POINT[x.type] ? x.type : 'case', r = { libelle: texte(x && x.libelle, 120), type: t };
    if (t === 'valeur') { r.unite = texte(x.unite, 12); r.min = nombre(x.min); r.max = nombre(x.max); }
    return r;
  }
  /** Contrôle périodique réglé (validé à la lecture ; `id` de la forme « cp-… »). */
  function definition(x) {
    if (!x || typeof x !== 'object' || !/^cp-[a-z0-9-]{1,24}$/.test(String(x.id || ''))) return null;
    var pts = (Array.isArray(x.points) ? x.points : []).map(point).filter(function (p) { return p.libelle; }).slice(0, 40);
    return { id: x.id, libelle: texte(x.libelle, 80) || 'Contrôle', lieu: texte(x.lieu, 60), actif: x.actif !== false, modele: MODELES_PERIODIQUES[x.modele] ? x.modele : 'libre',
      rythme: RYTHMES[x.rythme] ? x.rythme : 'semaine', jourSemaine: entier(x.jourSemaine, 1, 7, 1), jourMois: entier(x.jourMois, 1, 28, 1),
      apresUtilisation: !!x.apresUtilisation, delaiUtilisation: entier(x.delaiUtilisation, 1, 72, 4), deuxAgents: !!x.deuxAgents, alerteJours: entier(x.alerteJours, 1, 365, 30),
      points: pts.length ? pts : [{ libelle: 'Contrôle fait', type: 'case' }] };
  }
  /** Contrôles périodiques d'un service (`config.controles[service].periodiques`), inactifs compris. */
  function periodiques(config, service) {
    var c = (config && config.controles && service && config.controles[service]) || {};
    return (Array.isArray(c.periodiques) ? c.periodiques : []).map(definition).filter(Boolean).slice(0, 60);
  }
  /** Nouveau contrôle périodique depuis un modèle (ou vide : « libre »). */
  function depuisModele(code, id) {
    var m = MODELES_PERIODIQUES[code];
    return definition(Object.assign({ id: id, modele: m ? code : 'libre', actif: true }, m ? JSON.parse(JSON.stringify(m)) : { libelle: 'Nouveau contrôle', rythme: 'semaine', points: [{ libelle: 'Point à vérifier', type: 'case' }] }));
  }
  /** Libellé du rythme (« Chaque semaine, le lundi ; et après chaque utilisation »). */
  function libelleRythme(d) {
    var r = RYTHMES[d.rythme] + (d.rythme === 'semaine' ? ', le ' + JOURS_SEMAINE[d.jourSemaine] : d.rythme === 'mois' ? ', le ' + d.jourMois : '');
    return r + (d.apresUtilisation ? ' ; et après chaque utilisation (dans les ' + d.delaiUtilisation + ' h)' : '');
  }
  /** État d'un point relevé : hors seuil, péremption dépassée (écart) ou proche (alerte). `jour` : AAAA-MM-JJ. */
  function etatPoint(p, jour, alerteJours) {
    if (!p) return '';
    if (p.type === 'valeur') {
      var v = nombre(p.valeur);
      if (v === null) return '';
      return (p.min !== null && p.min !== undefined && v < p.min) || (p.max !== null && p.max !== undefined && v > p.max) ? 'horsSeuil' : '';
    }
    if (p.type === 'peremption' && /^\d{4}-\d{2}-\d{2}$/.test(String(p.peremption || ''))) {
      if (p.peremption < jour) return 'depassee';
      var d = new Date(jour + 'T12:00:00'); d.setDate(d.getDate() + (alerteJours || 30));
      return p.peremption <= dateLocale(d.getTime()) ? 'proche' : '';
    }
    return '';
  }
  function dateLocale(t) { return M.dateLocaleISO(t); }
  function minuit(iso) { var d = new Date(iso + 'T00:00:00'); return d.getTime(); }
  function plusJours(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return dateLocale(d.getTime()); }
  var DELAI_LIBERATION = 2 * 3600000;   // contrôle attendu au plus tard à la fin du poste, et au moins deux heures après la libération
  var MAX_TEXTE = 1000;
  function texte(v, n) { return String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, n || 200); }

  // ------------------------------------------------------------ Réglages
  /**
   * Réglages d'un service (`config.controles` = { '*': établissement, <service>: ... }) : { csiLibre: { actif, liste,
   * deuxAgents }, surveillance: { actif } } ; le service remplace l'établissement modèle par modèle.
   */
  function options(config, service) {
    var c = (config && config.controles) || {}, e = c['*'] || {}, s = (service && c[service]) || {};
    function m(k) { return Object.assign({}, e[k] || {}, s[k] || {}); }
    var l = m('csiLibre'), sv = m('surveillance'), lb = m('liberation');
    var liste = (Array.isArray(l.liste) ? l.liste : LISTE_PROVISOIRE).map(function (x) { return texte(x, 120); }).filter(Boolean).slice(0, 40);
    return { csiLibre: { actif: l.actif !== false, liste: liste.length ? liste : LISTE_PROVISOIRE.slice(), deuxAgents: l.deuxAgents !== false, provisoire: !Array.isArray(l.liste) },
      surveillance: { actif: sv.actif !== false }, liberation: { actif: lb.actif !== false },
      // Durée de conservation du registre, fixée par l'établissement (mois ; null : non fixée) : signalement seulement
      conservationMois: isFinite(+e.conservationMois) && +e.conservationMois > 0 ? Math.min(600, Math.round(+e.conservationMois)) : null };
  }
  /** CSI d'un service : lieux d'isolement déclarés dans Isocont (`lieuxCSI`). */
  function csiDu(config, service) {
    var l = (config && config.lieuxCSI && config.lieuxCSI[service]) || [];
    return (Array.isArray(l) ? l : []).map(function (x) { return texte(x, 60); }).filter(Boolean);
  }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, c;
    switch (e.type) {
      case 'CONTROLE':
        if (!d.id || st.controles[d.id] || !MODELES[d.modele]) break;
        st.controles[d.id] = { id: d.id, modele: d.modele, service: d.service || '', lieu: texte(d.lieu, 60), date: String(d.date || '').slice(0, 10), poste: texte(d.poste, 40),
          libellePoste: texte(d.libellePoste, 40), items: Array.isArray(d.items) ? d.items.slice(0, 40).map(function (x) {
            var it = { libelle: texte(x && x.libelle, 120), ok: !!(x && x.ok) };
            if (x && TYPES_POINT[x.type] && x.type !== 'case') {   // contrôle périodique : valeur, péremption ou texte relevés
              it.type = x.type;
              if (x.type === 'valeur') { it.valeur = nombre(x.valeur); it.unite = texte(x.unite, 12); it.min = nombre(x.min); it.max = nombre(x.max); }
              if (x.type === 'peremption') it.peremption = /^\d{4}-\d{2}-\d{2}$/.test(String(x.peremption || '')) ? x.peremption : '';
              if (x.type === 'texte') it.texte = texte(x.texte, 60);
            }
            return it;
          }) : [],
          ecart: texte(d.ecart, MAX_TEXTE), deuxAgents: !!d.deuxAgents, par: e.by, nom: texte(d.nom, 80), le: e.at, confirmePar: '', nomConfirme: '', confirmeLe: '', annule: null,
          def: d.modele === 'periodique' ? texte(d.def, 30) : '', utilisation: texte(d.utilisation, 40) };
        break;
      case 'CONTROLE_UTILISATION':
        if (!d.id || st.utilisations[d.id] || !d.def) break;
        st.utilisations[d.id] = { id: d.id, service: d.service || '', def: texte(d.def, 30), libelle: texte(d.libelle, 80), commentaire: texte(d.commentaire, 300), par: e.by, nom: texte(d.nom, 80), le: e.at, t: Date.parse(e.at) || 0 };
        break;
      case 'CONTROLE_CONFIRME':
        c = st.controles[d.controle];
        if (!c || c.annule || c.confirmePar || e.by === c.par) break;
        c.confirmePar = e.by; c.nomConfirme = texte(d.nom, 80); c.confirmeLe = e.at;
        break;
      case 'CONTROLE_ANNULE':
        c = st.controles[d.controle];
        if (!c || c.annule) break;
        c.annule = { par: e.by, nom: texte(d.nom, 80), le: e.at, motif: texte(d.motif, MAX_TEXTE) };
        break;
    }
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'controles', etat: function () { return { controles: {}, utilisations: {} }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function valides(st) { return Object.keys((st && st.controles) || {}).map(function (k) { return st.controles[k]; }).filter(function (c) { return !c.annule; }); }
  /** Contrôle complet : fait, et confirmé par un second agent quand le modèle le demande. */
  function complet(c) { return !!c && (!c.deuxAgents || !!c.confirmePar); }
  function nonConforme(c) { return !!c && c.items.some(function (x) { return !x.ok; }); }
  /**
   * Échéances d'un service sur les postes commencés depuis `jours` jours (poste en cours compris) : une par CSI et par
   * poste. CSI occupée à un moment du poste → surveillance ; sinon → contrôle de la CSI libre. `entree` : { service,
   * occupations: [{ lieu, debut, fin|null }], maintenant, jours (2 par défaut) }.
   * Rend [{ cle, date, poste, libellePoste, debut, fin, lieu, modele, etat: 'fait'|'aConfirmer'|'aFaire'|'retard', controle }].
   */
  function echeances(st, config, entree) {
    var e = entree || {}, sv = e.service, maintenant = e.maintenant || Date.now(), jours = e.jours || 2, o = options(config, sv), lieux = csiDu(config, sv);
    if (!lieux.length) return [];
    var periodes = M.periodesDe(config || {}, sv), occ = (e.occupations || []).filter(function (x) { return x && x.lieu; }), faits = {};
    valides(st).filter(function (c) { return c.service === sv; }).forEach(function (c) { faits[c.date + '|' + c.poste + '|' + c.lieu + '|' + c.modele] = c; });
    var res = [], d = new Date(maintenant - (jours + 1) * 86400000); d.setHours(12, 0, 0, 0);
    for (; d.getTime() <= maintenant + 86400000; d.setDate(d.getDate() + 1)) {
      var iso = M.dateLocaleISO(d.getTime());
      periodes.forEach(function (p) {
        var b = M.bornesPeriode(iso, p);
        if (b[0] > maintenant || b[1] < maintenant - jours * 86400000) return;
        lieux.forEach(function (lieu) {
          var occupee = occ.some(function (x) { var f = typeof x.fin === 'number' ? x.fin : maintenant; return x.lieu === lieu && x.debut < Math.min(b[1], maintenant) && f > b[0]; });
          var modele = occupee ? 'surveillance' : 'csiLibre';
          if (!o[modele].actif) return;
          var c = faits[iso + '|' + p.code + '|' + lieu + '|' + modele], fini = b[1] <= maintenant;
          var etat = c ? (complet(c) ? 'fait' : (fini ? 'retard' : 'aConfirmer')) : (fini ? 'retard' : 'aFaire');
          res.push({ cle: iso + '|' + p.code + '|' + lieu + '|' + modele, date: iso, poste: p.code, libellePoste: p.libelle || p.code, debut: b[0], fin: b[1], lieu: lieu, modele: modele, etat: etat, controle: c || null });
          // Libération pendant le poste : contrôle de la CSI libérée, attendu jusqu'à la fin du poste (deux heures au moins)
          var lib = o.liberation.actif && occ.filter(function (x) { return x.lieu === lieu && typeof x.fin === 'number' && x.fin >= b[0] && x.fin < b[1] && x.fin <= maintenant; })
            .filter(function (x) { return !occ.some(function (y) { return y !== x && y.lieu === lieu && y.debut <= x.fin && (typeof y.fin !== 'number' || y.fin > x.fin); }); })   // pas reprise aussitôt
            .sort(function (a2, b2) { return b2.fin - a2.fin; })[0];
          if (lib) {
            var cl = faits[iso + '|' + p.code + '|' + lieu + '|liberation'], limite = Math.max(b[1], lib.fin + DELAI_LIBERATION), finie = limite <= maintenant;
            res.push({ cle: iso + '|' + p.code + '|' + lieu + '|liberation', date: iso, poste: p.code, libellePoste: p.libelle || p.code, debut: lib.fin, fin: limite, lieu: lieu, modele: 'liberation',
              etat: cl ? (complet(cl) ? 'fait' : (finie ? 'retard' : 'aConfirmer')) : (finie ? 'retard' : 'aFaire'), controle: cl || null });
          }
        });
      });
    }
    return res.sort(function (a, b) { return a.debut - b.debut || a.lieu.localeCompare(b.lieu); });
  }
  /** Poste en cours : échéances à faire ou à confirmer (rappel à l'équipe). */
  function aFaire(ech) { return (ech || []).filter(function (x) { return x.etat === 'aFaire' || x.etat === 'aConfirmer'; }); }
  /** Postes terminés : contrôles non faits ou non confirmés (alerte au cadre). */
  function retards(ech) { return (ech || []).filter(function (x) { return x.etat === 'retard'; }); }
  /**
   * Occurrences d'un contrôle périodique dont le début tombe entre `du` et `au` (AAAA-MM-JJ, inclus) : { date, poste,
   * libellePoste, debut, fin } ; `fin` : fin du jour (ou du poste) où le contrôle est attendu, après quoi il est en retard.
   */
  function occurrences(config, service, def, du, au) {
    var res = [];
    for (var iso = du; iso <= au; iso = plusJours(iso, 1)) {
      var j = new Date(iso + 'T12:00:00'), jourSem = ((j.getDay() + 6) % 7) + 1;
      if (def.rythme === 'poste') {
        M.periodesDe(config || {}, service).forEach(function (p) {
          var b = M.bornesPeriode(iso, p);
          res.push({ date: iso, poste: p.code, libellePoste: p.libelle || p.code, debut: b[0], fin: b[1] });
        });
        continue;
      }
      if (def.rythme === 'semaine' && jourSem !== def.jourSemaine) continue;
      if (def.rythme === 'mois' && j.getDate() !== def.jourMois) continue;
      var lib = def.rythme === 'jour' ? 'Jour' : def.rythme === 'semaine' ? 'Semaine' : 'Mois';
      res.push({ date: iso, poste: def.rythme, libellePoste: lib, debut: minuit(iso), fin: minuit(plusJours(iso, 1)) });
    }
    return res;
  }
  function etatDe(c, fin, maintenant) { return c ? (complet(c) ? 'fait' : (fin <= maintenant ? 'retard' : 'aConfirmer')) : (fin <= maintenant ? 'retard' : 'aFaire'); }
  /**
   * Échéances des contrôles périodiques actifs d'un service : occurrences commencées (une période en arrière pour les
   * retards, `jours` au moins), puis contrôles demandés par une utilisation déclarée. Même forme que `echeances`, plus
   * `def` (le contrôle réglé) et `utilisation`.
   */
  function echeancesPeriodiques(st, config, entree) {
    var e = entree || {}, sv = e.service, maintenant = e.maintenant || Date.now(), jours = e.jours || 2, res = [], faits = {}, parUtil = {};
    valides(st).filter(function (c) { return c.service === sv && c.modele === 'periodique'; }).forEach(function (c) {
      faits[c.def + '|' + c.date + '|' + c.poste] = c;
      if (c.utilisation) parUtil[c.utilisation] = c;
    });
    var auj = dateLocale(maintenant);
    periodiques(config, sv).filter(function (d) { return d.actif; }).forEach(function (d) {
      var recul = Math.max(jours, d.rythme === 'semaine' ? 7 : d.rythme === 'mois' ? 31 : 1);
      occurrences(config, sv, d, plusJours(auj, -recul), auj).forEach(function (o) {
        if (o.debut > maintenant) return;
        if (d.rythme === 'poste' && o.fin < maintenant - jours * 86400000) return;
        var c = faits[d.id + '|' + o.date + '|' + o.poste] || null;
        res.push({ cle: d.id + '|' + o.date + '|' + o.poste, date: o.date, poste: o.poste, libellePoste: o.libellePoste, debut: o.debut, fin: o.fin, lieu: d.libelle,
          modele: 'periodique', def: d, etat: etatDe(c, o.fin, maintenant), controle: c, utilisation: null });
      });
      if (!d.apresUtilisation) return;
      Object.keys((st && st.utilisations) || {}).map(function (k) { return st.utilisations[k]; })
        .filter(function (u) { return u.service === sv && u.def === d.id && u.t <= maintenant && u.t > maintenant - Math.max(recul, 2) * 86400000; }).forEach(function (u) {
          var c = parUtil[u.id] || null, fin = u.t + d.delaiUtilisation * 3600000;
          res.push({ cle: d.id + '|util|' + u.id, date: dateLocale(u.t), poste: 'util-' + u.id, libellePoste: 'Après utilisation', debut: u.t, fin: fin, lieu: d.libelle,
            modele: 'periodique', def: d, etat: etatDe(c, fin, maintenant), controle: c, utilisation: u });
        });
    });
    return res.sort(function (a, b) { return a.debut - b.debut || a.lieu.localeCompare(b.lieu); });
  }
  /**
   * Péremptions relevées au dernier contrôle de chaque contrôle périodique actif : dates dépassées ou proches (délai
   * d'alerte du contrôle). Rend [{ def, point, peremption, etat: 'depassee'|'proche', controle }].
   */
  function peremptions(st, config, service, maintenant) {
    var auj = dateLocale(maintenant || Date.now()), res = [], derniers = {};
    valides(st).filter(function (c) { return c.service === service && c.modele === 'periodique' && c.def; }).forEach(function (c) {
      if (!derniers[c.def] || String(c.le) > String(derniers[c.def].le)) derniers[c.def] = c;
    });
    periodiques(config, service).filter(function (d) { return d.actif; }).forEach(function (d) {
      var c = derniers[d.id];
      if (!c) return;
      c.items.forEach(function (it) {
        var et = it.type === 'peremption' ? etatPoint(it, auj, d.alerteJours) : '';
        if (et) res.push({ def: d, point: it.libelle, peremption: it.peremption, etat: et, controle: c });
      });
    });
    return res.sort(function (a, b) { return a.peremption < b.peremption ? -1 : 1; });
  }
  /** Contrôles à faire d'un service entre deux jours, pour l'Agenda : une ligne par occurrence (poste : une par jour). */
  function pourAgenda(st, config, o) {
    var res = [], maintenant = (o && o.maintenant) || Date.now();
    ((o && o.services) || []).forEach(function (sv) {
      var faits = {};
      valides(st).filter(function (c) { return c.service === sv && c.modele === 'periodique'; }).forEach(function (c) { faits[c.def + '|' + c.date + '|' + c.poste] = c; });
      periodiques(config, sv).filter(function (d) { return d.actif; }).forEach(function (d) {
        var parJour = {};
        occurrences(config, sv, d, o.debut, o.fin).forEach(function (x) {
          var c = faits[d.id + '|' + x.date + '|' + x.poste] || null, et = x.debut > maintenant ? 'prevu' : etatDe(c, x.fin, maintenant);
          if (d.rythme === 'poste') { var p = parJour[x.date] = parJour[x.date] || { faits: 0, total: 0, retard: false }; p.total++; if (et === 'fait') p.faits++; if (et === 'retard') p.retard = true; return; }
          res.push({ service: sv, jour: x.date, def: d.id, libelle: d.libelle, lieu: d.lieu, etat: et, rythme: d.rythme });
        });
        Object.keys(parJour).forEach(function (j) { var p = parJour[j]; res.push({ service: sv, jour: j, def: d.id, libelle: d.libelle + ' (à chaque poste : ' + p.faits + '/' + p.total + ')', lieu: d.lieu, etat: p.faits === p.total ? 'fait' : p.retard ? 'retard' : 'prevu', rythme: 'poste' }); });
      });
    });
    return res;
  }

  /** Registre : contrôles (annulés compris, signalés), du plus récent au plus ancien ; `f` : { services, modele, du, au, lieu }. */
  /** Contrôles plus anciens que la durée de conservation fixée par l'établissement (signalement, aucune suppression). */
  function horsConservation(st, config, maintenant) {
    var mois = options(config, null).conservationMois;
    if (!mois) return [];
    var d = new Date(maintenant || Date.now()); d.setMonth(d.getMonth() - mois);
    var limite = M.dateLocaleISO(d.getTime());
    return Object.keys((st && st.controles) || {}).map(function (k) { return st.controles[k]; }).filter(function (c) { return c.date < limite; });
  }
  function registreDe(st, f) {
    f = f || {};
    return Object.keys((st && st.controles) || {}).map(function (k) { return st.controles[k]; }).filter(function (c) {
      if (f.services && f.services.indexOf(c.service) < 0) return false;
      if (f.modele && c.modele !== f.modele) return false;
      if (f.lieu && c.lieu !== f.lieu) return false;
      if (f.du && c.date < f.du) return false;
      if (f.au && c.date > f.au) return false;
      return true;
    }).sort(function (a, b) { return String(b.le).localeCompare(String(a.le)); });
  }
  /** Valeurs, péremptions et textes relevés d'un contrôle périodique, en une ligne (« Température relevée : 5 °C ; … »). */
  function releves(c) {
    return (c.items || []).filter(function (x) { return x.type; }).map(function (x) {
      var v = x.type === 'valeur' ? (x.valeur === null ? '—' : String(x.valeur).replace('.', ',') + (x.unite ? ' ' + x.unite : ''))
        : x.type === 'peremption' ? (x.peremption ? x.peremption.split('-').reverse().join('/') : '—') : (x.texte || '—');
      return x.libelle + ' : ' + v;
    }).join(' ; ');
  }
  function lignesExport(liste, libService) {
    var ls = libService || function (x) { return x; };
    return [['Date du poste', 'Poste', 'Service', 'Lieu', 'Contrôle', 'Fait par', 'Fait le', 'Confirmé par', 'Confirmé le', 'Conforme', 'Points non conformes', 'Écart', 'Annulé', 'Relevés']].concat(liste.map(function (c) {
      return [c.date, c.libellePoste || c.poste, ls(c.service), c.lieu, MODELES[c.modele].libelle, c.nom, String(c.le).replace('T', ' ').slice(0, 16), c.nomConfirme, String(c.confirmeLe || '').replace('T', ' ').slice(0, 16),
        MODELES[c.modele].liste ? (nonConforme(c) ? 'non' : 'oui') : '', c.items.filter(function (x) { return !x.ok; }).map(function (x) { return x.libelle; }).join(' ; '), c.ecart,
        c.annule ? 'oui (' + c.annule.motif + ')' : '', releves(c)];
    }));
  }

  // ------------------------------------------------------------ Contrôles des saisies
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { controles: {}, utilisations: {} }, moi = ctx && ctx.compte && ctx.compte.id;
    if (type === 'CONTROLE') {
      if (!d.id || st.controles[d.id]) throw new Error('Contrôle déjà enregistré : il ne se modifie pas (l’annuler puis le refaire).');
      if (!MODELES[d.modele]) throw new Error('Contrôle inconnu.');
      if (!d.service || !d.lieu || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) || !d.poste) throw new Error('Indiquez le service, la chambre et le poste.');
      if (d.modele === 'periodique') {
        var def = periodiques((ctx && ctx.config) || {}, d.service).filter(function (x) { return x.id === d.def; })[0];
        if (ctx && ctx.config && !def) throw new Error('Contrôle périodique inconnu pour ce service (réglages du cadre).');
        if (valides(st).some(function (c) { return c.service === d.service && c.modele === 'periodique' && c.def === d.def && c.date === d.date && c.poste === d.poste; })) throw new Error('Ce contrôle est déjà fait pour cette échéance.');
        (Array.isArray(d.items) ? d.items : []).forEach(function (x) {
          if (!x || !x.type || x.type === 'case') return;
          if (x.type === 'valeur') {
            if (nombre(x.valeur) === null) throw new Error('Indiquez la valeur relevée : ' + texte(x.libelle, 120) + '.');
            if (etatPoint(x, d.date) === 'horsSeuil' && x.ok) throw new Error('Valeur hors des seuils : le point « ' + texte(x.libelle, 120) + ' » est non conforme.');
          }
          if (x.type === 'peremption') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.peremption || ''))) throw new Error('Indiquez la date de péremption : ' + texte(x.libelle, 120) + '.');
            if (x.peremption < d.date && x.ok) throw new Error('Date de péremption dépassée : le point « ' + texte(x.libelle, 120) + ' » est non conforme.');
          }
          if (x.type === 'texte' && !texte(x.texte, 60)) throw new Error('Complétez : ' + texte(x.libelle, 120) + '.');
        });
      } else if (valides(st).some(function (c) { return c.service === d.service && c.date === d.date && c.poste === d.poste && c.lieu === d.lieu && c.modele === d.modele; })) throw new Error('Ce contrôle est déjà fait pour ce poste.');
      if (MODELES[d.modele].liste) {
        if (!Array.isArray(d.items) || !d.items.length) throw new Error('Cochez chaque point de la liste.');
        if (d.items.some(function (x) { return !x || typeof x.ok !== 'boolean'; })) throw new Error('Indiquez pour chaque point : conforme ou non conforme.');
        if (d.items.some(function (x) { return !x.ok; }) && !texte(d.ecart, MAX_TEXTE)) throw new Error('Décrivez l’écart constaté (point non conforme).');
      }
      if (String(d.ecart || '').length > MAX_TEXTE) throw new Error('Commentaire trop long (1 000 caractères au plus).');
      return;
    }
    if (type === 'CONTROLE_UTILISATION') {
      if (!d.id || (st.utilisations && st.utilisations[d.id])) throw new Error('Utilisation déjà signalée.');
      if (!d.service || !d.def) throw new Error('Indiquez le contrôle concerné.');
      var du = periodiques((ctx && ctx.config) || {}, d.service).filter(function (x) { return x.id === d.def; })[0];
      if (ctx && ctx.config && (!du || !du.apresUtilisation)) throw new Error('Ce contrôle ne se fait pas après utilisation.');
      if (String(d.commentaire || '').length > 300) throw new Error('Commentaire trop long (300 caractères au plus).');
      return;
    }
    var c = st.controles[d.controle];
    if (!c) throw new Error('Contrôle introuvable.');
    if (c.annule) throw new Error('Ce contrôle est annulé.');
    if (type === 'CONTROLE_CONFIRME') {
      if (!c.deuxAgents) throw new Error('Ce contrôle ne demande pas de second agent.');
      if (c.confirmePar) throw new Error('Ce contrôle est déjà confirmé.');
      if (moi && moi === c.par) throw new Error('Le second agent confirme avec son propre compte : demandez à un collègue de se connecter.');
      return;
    }
    if (type === 'CONTROLE_ANNULE') {
      if (!texte(d.motif, MAX_TEXTE)) throw new Error('Indiquez le motif de l’annulation.');
      var encadre = ctx && typeof ctx.peut === 'function' && ctx.peut('CONTROLE_ANNULE_TOUS');
      if (!encadre && moi && moi !== c.par) throw new Error('Seul l’agent qui a fait le contrôle, ou le cadre, peut l’annuler.');
    }
  }

  /** Réglages par le cadre : seulement ses services (l'établissement reste à l'administrateur). */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object' || Array.isArray(nouveau)) return false;
    var a = ancien || {}, cles = {};
    Object.keys(a).concat(Object.keys(nouveau)).forEach(function (k) { cles[k] = 1; });
    return Object.keys(cles).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(nouveau[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'controles.faire', libelle: 'Faire les contrôles et noter les passages de surveillance, confirmer en second agent, annuler les siens, signaler une utilisation', types: ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE', 'CONTROLE_UTILISATION'] },
    { code: 'controles.encadrer', libelle: 'Annuler tout contrôle du service, suivre les retards et les écarts, exporter le registre', types: ['CONTROLE_ANNULE_TOUS'] }
  ];
  var FAIRE = ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE', 'CONTROLE_UTILISATION'], DROITS = { IDE: FAIRE.slice(), AS: FAIRE.slice(), CADRE: FAIRE.concat(['CONTROLE_ANNULE_TOUS']), CADRE_SUP: ['CONTROLE_ANNULE_TOUS'], DIRECTEUR_SOINS: [] };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: TYPES.concat(['CONTROLE_ANNULE_TOUS']), rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'controles', rolesEncadrement: ['CADRE', 'CADRE_SUP'], inactifParDefaut: true,
    lireAcces: function (r) { return r.accesModules ? r.accesModules.controles : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, c = e.type === 'CONTROLE' || e.type === 'CONTROLE_UTILISATION' ? null : st && st.controles && st.controles[d.controle];
    var sv = d.service || (c && c.service);
    return sv ? [sv] : [];
  }

  var contrat = {
    id: 'controles',
    libelle: 'Contrôles',
    version: '0.1.0',
    icone: 'CT',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: function (st, e) { return cibles(st, e); } },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { controles: controlerCadre } },
    vues: { onglets: [{ code: 'poste', libelle: 'Poste en cours' }, { code: 'periodiques', libelle: 'Contrôles périodiques' }, { code: 'registre', libelle: 'Registre' }] },
    migrations: [],
    fournitures: [
      // Lue par l'Agenda (17 novembre 2026) : contrôles périodiques attendus, faits ou en retard, jour par jour
      { nom: 'controles.periodiques', version: 1, acces: 'lecture', champs: ['service', 'jour', 'def', 'libelle', 'lieu', 'etat', 'rythme'],
        lire: function (st, o) { return pourAgenda(st, o && o.config, o || {}); } }
    ],
    besoins: [{ fourniture: 'isocont.occupationsCSI', version: 1, obligatoire: false }]
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, MODELES: MODELES, LISTE_PROVISOIRE: LISTE_PROVISOIRE,
    options: options, csiDu: csiDu, echeances: echeances, aFaire: aFaire, retards: retards, registre: registreDe, lignesExport: lignesExport,
    complet: complet, nonConforme: nonConforme, horsConservation: horsConservation, controler: controler, controlerCadre: controlerCadre,
    MODELES_PERIODIQUES: MODELES_PERIODIQUES, RYTHMES: RYTHMES, TYPES_POINT: TYPES_POINT, JOURS_SEMAINE: JOURS_SEMAINE, periodiques: periodiques, definition: definition,
    depuisModele: depuisModele, libelleRythme: libelleRythme, etatPoint: etatPoint, occurrences: occurrences, echeancesPeriodiques: echeancesPeriodiques,
    peremptions: peremptions, pourAgenda: pourAgenda, releves: releves };
});
