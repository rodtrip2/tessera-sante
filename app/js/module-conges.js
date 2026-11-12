// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Congés — contrat déclaré au registre des modules (0.44.0, demandes du porteur du 12 novembre 2026).
 *
 * Chaque agent planifie ses congés : souhaits (désactivables), demandes envoyées au validateur, qui change selon le rôle
 * de l'agent (cadre de santé pour les IDE, AS et secrétaires ; cadre supérieur pour les cadres ; médecin chef pour les
 * médecins…, réglable). Validation ou refus motivé, annulation. Tableaux du service à l'année, à la semaine et/ou à la
 * journée, réglés par les validateurs : périodes colorées (vacances scolaires, à éviter, information), périodes bloquées
 * par le validateur, hors délai de demande, règles « agents en congé en même temps » (non bloquantes par défaut) qui
 * mettent en évidence les jours où elles ne sont pas respectées, totaux en bas du tableau, couleurs par statut.
 * Décompte simple : types de congés réglés par l'établissement (ajoutables), droits de l'année proratisés selon la
 * quotité de travail (qui peut changer en cours d'année) et ses jours non travaillés, corrigés à la main par le cadre ;
 * jours fériés comptés dans les droits : posés d'office (service fermé ou rôle qui ne travaille pas ces jours-là) ou
 * travaillés et à récupérer, selon le service et le rôle ; fériés locaux ajoutables. Un congé validé est une absence
 * lue par l'Agenda (lecture à la volée). Le logiciel de gestion du temps de l'établissement reste la référence : message
 * d'avertissement activable par l'administrateur. Journal `modules\conges\`, clé propre, activation par service.
 * Aucune donnée de santé : ni motif médical, ni arrêt de travail.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).conges = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['CONGE', 'CONGE_DECISION', 'CONGE_ANNULATION', 'TABLEAU_CONGES', 'PERIODE_CONGES', 'DROITS_CONGES', 'QUOTITE'];
  var JOUR = /^\d{4}-\d{2}-\d{2}$/;
  var J = 864e5;
  var STATUTS = { souhait: 'Souhait', demande: 'Demandé, à valider', valide: 'Validé', refuse: 'Refusé', annule: 'Annulé' };
  var EFFETS = { info: 'Information', eviter: 'À éviter (signalé à la demande)', bloquee: 'Bloquée (aucune demande possible)', limite: 'Dépôt avant une date limite (après : demande non prioritaire)' };
  var MODES_FERIES = { office: 'Posé d’office', recuperer: 'Travaillé → à récupérer', planning: 'Selon le planning (droits saisis par le cadre)' };
  var UNITES = { ouvres: 'jours ouvrés (lundi au vendredi)', ouvrables: 'jours ouvrables (lundi au samedi)', calendaires: 'jours calendaires' };
  var TYPES_DEFAUT = [
    { code: 'CA', libelle: 'Congés annuels', abrev: 'CA', unite: 'ouvres', droit: 25, actif: true },
    { code: 'RTT', libelle: 'RTT', abrev: 'RTT', unite: 'ouvres', droit: 15, actif: true },
    { code: 'JF', libelle: 'Jours fériés', abrev: 'JF', unite: 'ouvres', droit: null, actif: true, ferie: true }
  ];
  // Validateur selon le rôle de l'agent (proposition, réglable par l'administrateur)
  var VALIDATEURS_DEFAUT = { IDE: 'CADRE', AS: 'CADRE', SECRETAIRE: 'CADRE', CADRE: 'CADRE_SUP', CADRE_SUP: 'DIRECTEUR_SOINS', MEDECIN: 'MEDECIN_CHEF_SERVICE', MEDECIN_CHEF_SERVICE: 'MEDECIN_CHEF_POLE', '*': 'CADRE' };
  // Ordre de préséance des rôles : le rôle « principal » d'un agent qui en cumule plusieurs (validateur, fériés)
  var PRESEANCE = ['DIRECTEUR_SOINS', 'MEDECIN_CHEF_POLE', 'MEDECIN_CHEF_SERVICE', 'MEDECIN', 'CADRE_SUP', 'CADRE', 'SECRETAIRE', 'IDE', 'AS'];
  // Ordre des groupes dans un tableau : soignants d'abord
  var ORDRE = ['IDE', 'AS', 'SECRETAIRE', 'CADRE', 'CADRE_SUP', 'MEDECIN', 'MEDECIN_CHEF_SERVICE', 'MEDECIN_CHEF_POLE', 'DIRECTEUR_SOINS'];
  var COULEURS_DEFAUT = { souhait: '#c9cec7', demande: '#f4b860', valide: '#2e7d4f', refuse: '#f3c6c2', annule: '#e4e6e2', ferie: '#cfdbe9' };
  var ALERTE_DEFAUT = 'Les droits et les soldes calculés dans Tessera ne sont qu’une indication : seul le logiciel de gestion du temps de travail de l’établissement fait foi.';

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function couleur(v, d) { return /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d; }
  function nombre(v, min, max, d) { var n = +v; return v !== null && v !== '' && isFinite(n) && n >= min && n <= max ? n : d; }

  // ------------------------------------------------------------ Dates (jours ISO, calculs en UTC : sans heure d'été)
  function versJour(iso) { var m = JOUR.exec(iso || '') ? iso.split('-') : null; return m ? Date.UTC(+m[0], +m[1] - 1, +m[2]) / J : null; }
  function versISO(n) { var d = new Date(n * J); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function jourSemaine(iso) { var n = versJour(iso); return n === null ? null : new Date(n * J).getUTCDay(); }
  function plusJours(iso, k) { return versISO(versJour(iso) + k); }
  function jours(debut, fin) { var a = versJour(debut), b = versJour(fin), r = []; if (a === null || b === null) return r; for (var n = a; n <= b && r.length < 800; n++) r.push(versISO(n)); return r; }
  function jourLocal(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  /** Lundi de Pâques et fêtes mobiles (algorithme de Meeus). */
  function paques(an) {
    var a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return an + '-' + String(mois).padStart(2, '0') + '-' + String(jour).padStart(2, '0');
  }
  /** Jours fériés d'une année : les 11 fériés nationaux, puis les fériés locaux réglés (« MM-JJ » chaque année, ou une date). */
  function feries(an, config) {
    var p = paques(an), l = [
      [an + '-01-01', 'Jour de l’an'], [plusJours(p, 1), 'Lundi de Pâques'], [an + '-05-01', 'Fête du travail'], [an + '-05-08', 'Victoire 1945'],
      [plusJours(p, 39), 'Ascension'], [plusJours(p, 50), 'Lundi de Pentecôte'], [an + '-07-14', 'Fête nationale'], [an + '-08-15', 'Assomption'],
      [an + '-11-01', 'Toussaint'], [an + '-11-11', 'Armistice 1918'], [an + '-12-25', 'Noël']];
    options(config).feries.locaux.forEach(function (x) {
      var d = /^\d{2}-\d{2}$/.test(x.date) ? an + '-' + x.date : x.date;
      if (d.slice(0, 4) === String(an) && versJour(d) !== null && !l.some(function (y) { return y[0] === d; })) l.push([d, x.libelle || 'Férié local']);
    });
    return l.map(function (x) { return { date: x[0], libelle: x[1] }; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function estFerie(iso, config, cache) {
    var an = +iso.slice(0, 4);
    if (cache) { if (!cache[an]) { cache[an] = {}; feries(an, config).forEach(function (f) { cache[an][f.date] = f.libelle; }); } return cache[an][iso] || null; }
    var f = feries(an, config).filter(function (x) { return x.date === iso; })[0];
    return f ? f.libelle : null;
  }

  // ------------------------------------------------------------ Réglages (`config.conges`, administrateur ; le cadre règle les fériés de ses services)
  function options(config) {
    var v = (config && config.conges) || {}, vus = {};
    var types = (Array.isArray(v.types) && v.types.length ? v.types : TYPES_DEFAUT).filter(function (t) { return t && /^[A-Z0-9_]{1,12}$/.test(t.code || '') && !vus[t.code] && (vus[t.code] = 1); }).map(function (t) {
      var def = TYPES_DEFAUT.filter(function (x) { return x.code === t.code; })[0] || {};
      return { code: t.code, libelle: texte(t.libelle, 60) || def.libelle || t.code, abrev: texte(t.abrev, 6) || t.code, unite: UNITES[t.unite] ? t.unite : 'ouvres',
        droit: t.ferie || def.ferie ? null : nombre(t.droit, 0, 400, null), actif: t.actif !== false, ferie: !!(t.ferie || def.ferie) };
    });
    if (!types.some(function (t) { return t.ferie; })) types.push(Object.assign({}, TYPES_DEFAUT[2]));
    var val = Object.assign({}, VALIDATEURS_DEFAUT);
    Object.keys(v.validateurs || {}).forEach(function (k) { if (/^[A-Z0-9_*]{1,30}$/.test(k) && /^[A-Z0-9_]{1,30}$/.test(v.validateurs[k] || '')) val[k] = v.validateurs[k]; });
    var f = v.feries || {}, rf = {};
    Object.keys(v.regleFeries || {}).forEach(function (sv) { var x = v.regleFeries[sv] || {}, o = {}; Object.keys(x).forEach(function (r) { if (MODES_FERIES[x[r]]) o[r] = x[r]; }); rf[sv] = o; });
    var c = v.couleurs || {}, a = v.alerte || {};
    return {
      types: types, validateurs: val,
      delaiMois: nombre(v.delaiMois, 0, 12, 1),
      souhaits: v.souhaits !== false,
      // Quotité et repos du temps partiel dans les tableaux (décision du porteur du 12 novembre 2026 : masqués par défaut)
      afficherTempsPartiel: v.afficherTempsPartiel === true,
      arrondi: [0.5, 1].indexOf(+v.arrondi) >= 0 ? +v.arrondi : 0.5,
      feries: { afficher: f.afficher !== false, locaux: (Array.isArray(f.locaux) ? f.locaux : []).filter(function (x) { return x && (/^\d{2}-\d{2}$/.test(x.date || '') || JOUR.test(x.date || '')); }).slice(0, 30).map(function (x) { return { date: x.date, libelle: texte(x.libelle, 60) }; }) },
      regleFeries: rf,
      couleurs: Object.keys(COULEURS_DEFAUT).reduce(function (o, k) { o[k] = couleur(c[k], COULEURS_DEFAUT[k]); return o; }, {}),
      alerte: { active: a.active === true, texte: texte(a.texte, 600) || ALERTE_DEFAUT }
    };
  }
  function type(config, code) { return options(config).types.filter(function (t) { return t.code === code; })[0] || null; }
  /** Rôle principal d'un agent (préséance), sinon son premier rôle. */
  function rolePrincipal(roles) { roles = roles || []; return PRESEANCE.filter(function (r) { return roles.indexOf(r) >= 0; })[0] || roles.filter(function (r) { return r !== 'ADMIN'; })[0] || ''; }
  /** Jours fériés d'un agent : règle de son service pour son rôle, sinon de l'établissement, sinon posés d'office. */
  function modeFeries(config, service, roles) {
    var rf = options(config).regleFeries, r = rolePrincipal(roles), sv = rf[service] || {}, et = rf['*'] || {};
    return sv[r] || et[r] || 'office';
  }
  /** Changement des réglages par un cadre : seulement les règles des fériés de ses services ; le reste à l'administrateur. */
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || typeof nouveau !== 'object') return false;
    var a = ancien || {};
    var autres = Object.keys(Object.assign({}, a, nouveau)).filter(function (k) { return k !== 'regleFeries'; });
    if (autres.some(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(nouveau[k]); })) return false;
    var ra = a.regleFeries || {}, rn = nouveau.regleFeries || {};
    return Object.keys(Object.assign({}, ra, rn)).every(function (k) { return JSON.stringify(ra[k]) === JSON.stringify(rn[k]) || (k !== '*' && sv.indexOf(k) >= 0); });
  }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, c;
    switch (e.type) {
      case 'CONGE':
        if (!d.id) break;
        c = st.conges[d.id];
        if (!c) c = st.conges[d.id] = { id: d.id, cree: e.at, par: e.by, statut: 'souhait', historique: [] };
        ['agent', 'nom', 'roles', 'service', 'type', 'debut', 'fin', 'demiDebut', 'demiFin', 'commentaire'].forEach(function (k) { if (d[k] !== undefined) c[k] = d[k]; });
        if (d.statut === 'demande' && c.statut !== 'demande') { c.demandeLe = e.at; c.historique.push({ quoi: 'demande', par: e.by, le: e.at }); var lt = limiteDepassee(st, c, e.at); c.tardive = lt ? { periode: lt.id, libelle: lt.libelle, limite: lt.limite } : null; }
        else c.historique.push({ quoi: c.statut === 'souhait' && d.statut !== 'demande' ? 'souhait' : 'modification', par: e.by, le: e.at });
        if (d.statut === 'demande' || d.statut === 'souhait') c.statut = d.statut;
        c.modifie = e.at;
        break;
      case 'CONGE_DECISION':
        c = st.conges[d.conge];
        if (!c || (d.decision !== 'valide' && d.decision !== 'refuse')) break;
        c.statut = d.decision; c.decision = { par: e.by, nom: d.nom || '', le: e.at, motif: d.motif || '' };
        c.historique.push({ quoi: d.decision, par: e.by, le: e.at, motif: d.motif || '' });
        if (c.agent && c.agent !== e.by) st.avis.push({ id: e.id, agent: c.agent, conge: c.id, genre: d.decision, par: e.by, le: e.at });
        break;
      case 'CONGE_ANNULATION':
        c = st.conges[d.conge];
        if (!c) break;
        var etaitValide = c.statut === 'valide';
        c.statut = 'annule'; c.annulation = { par: e.by, le: e.at, motif: d.motif || '' };
        c.historique.push({ quoi: 'annule', par: e.by, le: e.at, motif: d.motif || '' });
        if (etaitValide && c.agent && c.agent !== e.by) st.avis.push({ id: e.id, agent: c.agent, conge: c.id, genre: 'annule', par: e.by, le: e.at });
        break;
      case 'TABLEAU_CONGES':
        if (!d.id) break;
        c = st.tableaux[d.id] || (st.tableaux[d.id] = { id: d.id, cree: e.at, par: e.by });
        ['service', 'nom', 'debut', 'fin', 'resolution', 'roles', 'agents', 'visible', 'souhaits', 'totaux', 'regles', 'supprime'].forEach(function (k) { if (d[k] !== undefined) c[k] = d[k]; });
        c.modifie = e.at;
        break;
      case 'PERIODE_CONGES':
        if (!d.id) break;
        c = st.periodes[d.id] || (st.periodes[d.id] = { id: d.id, cree: e.at, par: e.by });
        ['service', 'libelle', 'debut', 'fin', 'effet', 'couleur', 'roles', 'limite', 'supprime'].forEach(function (k) { if (d[k] !== undefined) c[k] = d[k]; });
        c.modifie = e.at;
        break;
      case 'DROITS_CONGES':
        if (!d.agent || !d.annee) break;
        var da = (st.droits[d.agent] = st.droits[d.agent] || {}), an = (da[d.annee] = da[d.annee] || {});
        Object.keys(d.droits || {}).forEach(function (k) { if (d.droits[k] === null) delete an[k]; else an[k] = d.droits[k]; });
        break;
      case 'QUOTITE':
        if (!d.agent || !JOUR.test(d.depuis || '')) break;
        var q = (st.quotites[d.agent] = (st.quotites[d.agent] || []).filter(function (x) { return x.depuis !== d.depuis; }));
        if (!d.supprime) q.push({ depuis: d.depuis, quotite: d.quotite, nonTravailles: d.nonTravailles || [], par: e.by, le: e.at });
        q.sort(function (a, b) { return a.depuis.localeCompare(b.depuis); });
        break;
    }
  }
  /**
   * Période de dépôt (« congés d'été à poser avant le 31 mars ») dont la date limite est passée au jour `quand` pour ce
   * congé (même service ou établissement, dates qui se chevauchent) : la demande est alors non prioritaire.
   */
  function limiteDepassee(st, c, quand) {
    var j = String(quand || '').slice(0, 10);
    return periodes(st, c.service, c.debut, c.fin).filter(function (p) { return p.effet === 'limite' && JOUR.test(p.limite || '') && j > p.limite; })[0] || null;
  }
  function reduire(evts) { return N.reduire(evts, { cle: 'conges', etat: function () { return { conges: {}, tableaux: {}, periodes: {}, droits: {}, quotites: {}, avis: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Quotité de travail (peut changer en cours d'année)
  /** Quotité en vigueur un jour : { quotite (50 à 100), nonTravailles: jours de la semaine (0 dimanche … 6 samedi) }. */
  function quotiteLe(st, agent, iso) {
    var l = (st && st.quotites && st.quotites[agent]) || [], r = null;
    l.forEach(function (x) { if (x.depuis <= iso) r = x; });
    return r ? { quotite: nombre(r.quotite, 10, 100, 100), nonTravailles: (r.nonTravailles || []).map(Number).filter(function (n) { return n >= 0 && n <= 6; }), depuis: r.depuis } : { quotite: 100, nonTravailles: [], depuis: '' };
  }
  function historiqueQuotite(st, agent) { return ((st && st.quotites && st.quotites[agent]) || []).slice(); }
  /** Quotité moyenne d'une année (pondérée par les jours de chaque période), pour le calcul des droits. */
  function quotiteMoyenne(st, agent, an) {
    var js = jours(an + '-01-01', an + '-12-31'), s = 0;
    js.forEach(function (j) { s += quotiteLe(st, agent, j).quotite; });
    return js.length ? s / js.length : 100;
  }
  /** Jour de travail de l'agent selon l'unité du type (sans les fériés) : ni repos de la semaine, ni jour non travaillé. */
  function jourCompte(st, agent, iso, unite) {
    var dj = jourSemaine(iso);
    if (unite !== 'calendaires' && dj === 0) return false;
    if (unite === 'ouvres' && dj === 6) return false;
    return quotiteLe(st, agent, iso).nonTravailles.indexOf(dj) < 0;
  }
  /**
   * Jours décomptés d'un congé : jours de travail de l'agent entre les deux dates, sans les jours fériés (ils suivent
   * leur propre règle) ni les jours non travaillés du temps partiel ; demi-journée au début (après-midi) ou à la fin (matin).
   */
  function decompte(st, config, c, cache) {
    var t = type(config, c.type) || { unite: 'ouvres' }, l = jours(c.debut, c.fin), n = 0, fc = cache || {};
    l.forEach(function (iso, i) {
      if (!jourCompte(st, c.agent, iso, t.unite) || estFerie(iso, config, fc)) return;
      var v = 1;
      if (i === 0 && c.demiDebut) v -= 0.5;
      if (i === l.length - 1 && c.demiFin) v -= 0.5;
      if (l.length === 1 && c.demiDebut && c.demiFin) v = 0.5;
      n += Math.max(0, v);
    });
    return n;
  }

  // ------------------------------------------------------------ Droits et soldes (décompte simple)
  function arrondir(x, pas) { return Math.ceil(x / pas - 1e-9) * pas; }
  /**
   * Fériés de l'année pour un agent : selon le mode (service, rôle). Posé d'office : les fériés qui tombent un jour où
   * il aurait travaillé sont posés d'office (droit = pris). À récupérer : chaque férié sur un jour de travail ouvre un
   * jour à poser (acquis une fois passé). Selon le planning : droit saisi par le cadre.
   */
  function feriesAgent(st, config, agent, an, service, roles, aujourdhui) {
    var mode = modeFeries(config, service, roles), fc = {};
    var l = feries(an, config).filter(function (f) { return jourCompte(st, agent, f.date, 'ouvres'); });
    return { mode: mode, liste: l, nombre: l.length, acquis: l.filter(function (f) { return !aujourdhui || f.date <= aujourdhui; }).length, cache: fc };
  }
  /**
   * Droits d'un agent pour une année, par type actif : { code: { droit, calcule, saisi (valeur du cadre), base,
   * quotite } }. Droit calculé = droit à temps plein × quotité moyenne de l'année, arrondi (demi-journée par défaut) ;
   * fériés : nombre de fériés sur ses jours de travail. Le cadre remplace un droit à la main (« saisi »).
   */
  function droits(st, config, agent, an, info) {
    var o = options(config), q = quotiteMoyenne(st, agent, an), saisis = ((st && st.droits && st.droits[agent]) || {})[an] || {}, res = {};
    o.types.filter(function (t) { return t.actif; }).forEach(function (t) {
      var calc;
      if (t.ferie) { var f = feriesAgent(st, config, agent, an, info && info.service, info && info.roles, info && info.aujourdhui); calc = f.mode === 'planning' ? 0 : f.nombre; }
      else calc = t.droit === null ? 0 : arrondir(t.droit * q / 100, o.arrondi);
      var s = typeof saisis[t.code] === 'number' ? saisis[t.code] : null;
      res[t.code] = { droit: s !== null ? s : calc, calcule: calc, saisi: s, base: t.droit, quotite: Math.round(q * 10) / 10 };
    });
    return res;
  }
  /** Congés d'un agent (hors annulés et refusés si `actifs`), triés par date. */
  function congesDe(st, agent, o) {
    o = o || {};
    return Object.keys((st && st.conges) || {}).map(function (k) { return st.conges[k]; })
      .filter(function (c) { return c.agent === agent && (!o.actifs || (c.statut !== 'annule' && c.statut !== 'refuse')) && (!o.annee || String(c.debut || '').slice(0, 4) === String(o.annee)); })
      .sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
  }
  /**
   * Soldes d'une année par type : { code: { droit, valide, demande, souhait, reste, office (fériés posés d'office) } }.
   * `info` : { service, roles, aujourdhui }. Un congé compte dans l'année de sa date de début.
   */
  function soldes(st, config, agent, an, info) {
    var dr = droits(st, config, agent, an, info), res = {}, fc = {};
    Object.keys(dr).forEach(function (k) { res[k] = { droit: dr[k].droit, calcule: dr[k].calcule, saisi: dr[k].saisi, quotite: dr[k].quotite, valide: 0, demande: 0, souhait: 0, office: 0, reste: dr[k].droit }; });
    var tf = options(config).types.filter(function (t) { return t.ferie; })[0];
    if (tf && res[tf.code]) {
      var f = feriesAgent(st, config, agent, an, info && info.service, info && info.roles, info && info.aujourdhui);
      res[tf.code].mode = f.mode; res[tf.code].acquis = f.mode === 'recuperer' ? f.acquis : f.nombre;
      if (f.mode === 'office') { res[tf.code].office = f.nombre; res[tf.code].valide = f.nombre; }
    }
    congesDe(st, agent, { annee: an, actifs: true }).forEach(function (c) {
      var r = res[c.type]; if (!r) return;
      r[c.statut === 'valide' ? 'valide' : c.statut === 'demande' ? 'demande' : 'souhait'] += decompte(st, config, c, fc);
    });
    Object.keys(res).forEach(function (k) { var r = res[k]; r.reste = Math.round((r.droit - r.valide - r.demande) * 10) / 10; });
    return res;
  }

  // ------------------------------------------------------------ Périodes, tableaux, règles
  function periodes(st, service, debut, fin) {
    return Object.keys((st && st.periodes) || {}).map(function (k) { return st.periodes[k]; })
      .filter(function (p) { return !p.supprime && (p.service === '*' || p.service === service || !service) && (!debut || p.fin >= debut) && (!fin || p.debut <= fin); })
      .sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
  }
  /** Périodes qui touchent un jour pour un rôle : bloquées, à éviter, information. */
  function periodesDuJour(liste, iso, roles) {
    return liste.filter(function (p) { return p.debut <= iso && p.fin >= iso && (!(p.roles || []).length || (roles || []).some(function (r) { return p.roles.indexOf(r) >= 0; })); });
  }
  /** Le jour est hors du délai préalable de demande (à partir d'aujourd'hui). */
  function horsDelai(config, iso, aujourdhui) {
    var m = options(config).delaiMois; if (!m || !aujourdhui || iso < aujourdhui) return false;
    var d = new Date(versJour(aujourdhui) * J); d.setUTCMonth(d.getUTCMonth() + m);
    return versJour(iso) < d.getTime() / J;
  }
  /** Règles d'un tableau : [{ pour ('*' ou un rôle), max, bloquante }]. */
  function regles(t) { return ((t && t.regles) || []).filter(function (r) { return r && r.max >= 0; }).map(function (r) { return { pour: r.pour || '*', max: Math.round(+r.max), bloquante: r.bloquante === true }; }); }
  /** Agents d'un tableau parmi les comptes : du service, des rôles choisis (aucun : tous), ou nommés. */
  function agentsDuTableau(t, comptes) {
    return (comptes || []).filter(function (c) {
      if (c.actif === false || c.id === 'secours' || (c.roles || []).every(function (r) { return r === 'ADMIN' || r === 'INTERVENANT'; })) return false;
      if ((t.agents || []).length) return t.agents.indexOf(c.id) >= 0;
      if ((c.services || []).indexOf(t.service) < 0) return false;
      return !(t.roles || []).length || (c.roles || []).some(function (r) { return t.roles.indexOf(r) >= 0; });
    }).sort(function (a, b) {
      var ra = ORDRE.indexOf(rolePrincipal(a.roles)), rb = ORDRE.indexOf(rolePrincipal(b.roles));
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || String(a.nom).localeCompare(String(b.nom));
    });
  }
  /**
   * Grille d'un tableau sur [debut, fin] : pour chaque jour et chaque agent, le congé qui le couvre (sauf jours non
   * travaillés et fériés), et les comptes par rôle (congés demandés et validés ; souhaits à part), avec les règles non
   * respectées. { jours: [{ iso, ferie, periodes, horsDelai }], agents: [{ compte, cases: [{ conge, statut, ferie, nonTravaille }] }],
   * comptes: { '*': [n…], <rôle>: [n…], souhaits: [n…] }, depassements: [{ regle, jours: [iso…] }] }.
   */
  function grille(st, config, t, comptes, debut, fin, aujourdhui) {
    var js = jours(debut, fin), fc = {}, ags = agentsDuTableau(t, comptes), pers = periodes(st, t.service, debut, fin);
    var cg = Object.keys((st && st.conges) || {}).map(function (k) { return st.conges[k]; }).filter(function (c) { return c.statut !== 'annule' && c.debut <= fin && c.fin >= debut; });
    var o = options(config), cpt = { '*': [], souhaits: [], tardives: [] }, rs = regles(t);
    rs.forEach(function (r) { if (r.pour !== '*') cpt[r.pour] = []; });
    js.forEach(function () { Object.keys(cpt).forEach(function (k) { cpt[k].push(0); }); });
    var lignes = ags.map(function (a) {
      var mode = modeFeries(config, t.service, a.roles), sesConges = cg.filter(function (c) { return c.agent === a.id; });
      return { compte: a, role: rolePrincipal(a.roles), cases: js.map(function (iso, i) {
        var nt = !jourCompte(st, a.id, iso, 'calendaires'), fe = estFerie(iso, config, fc);
        var c = sesConges.filter(function (x) { return x.debut <= iso && x.fin >= iso; }).sort(function (x, y) { return (x.statut === 'refuse') - (y.statut === 'refuse'); })[0] || null;
        var cell = { conge: c, statut: c ? c.statut : null, ferie: fe, ferieOffice: !!fe && mode === 'office' && jourCompte(st, a.id, iso, 'ouvres'), nonTravaille: nt };
        var tard = c && c.statut === 'demande' && c.tardive;
        var absent = (c && (c.statut === 'valide' || (c.statut === 'demande' && !tard)) && !nt) || cell.ferieOffice;
        if (tard && !nt) cpt.tardives[i]++;
        if (absent) { cpt['*'][i]++; (a.roles || []).forEach(function (r) { if (cpt[r] && r !== '*' && r !== 'souhaits' && r !== 'tardives') cpt[r][i]++; }); }
        if (c && c.statut === 'souhait' && !nt && !fe) cpt.souhaits[i]++;
        cell.absent = !!absent;
        return cell;
      }) };
    });
    var dep = rs.map(function (r) { var l = cpt[r.pour === '*' ? '*' : r.pour] || []; return { regle: r, jours: js.filter(function (iso, i) { return l[i] > r.max; }) }; }).filter(function (x) { return x.jours.length; });
    return { jours: js.map(function (iso) { return { iso: iso, ferie: estFerie(iso, config, fc), periodes: periodesDuJour(pers, iso, null), horsDelai: horsDelai(config, iso, aujourdhui), semaine: jourSemaine(iso) }; }),
      agents: lignes, comptes: cpt, depassements: dep, regles: rs, afficherFeries: o.feries.afficher };
  }

  // ------------------------------------------------------------ Validateurs
  /** Rôle validateur d'un agent selon son rôle principal (réglage, sinon proposition). */
  function roleValidateur(config, roles) { var v = options(config).validateurs, r = rolePrincipal(roles); return v[r] || v['*'] || 'CADRE'; }
  var TOUS_SERVICES = ['DIRECTEUR_SOINS', 'ADMIN'];
  /** Le compte `v` valide-t-il les congés de l'agent `a` : rôle validateur, service commun (ou tous services), jamais lui-même. */
  function valide(config, v, a) {
    if (!v || !a || v.id === a.id) return false;
    var r = roleValidateur(config, a.roles), rv = v.roles || [];
    if (rv.indexOf(r) < 0) return false;
    if (TOUS_SERVICES.indexOf(r) >= 0) return true;
    return (v.services || []).some(function (s) { return (a.services || []).indexOf(s) >= 0; });
  }
  function validateurs(config, comptes, a) { return (comptes || []).filter(function (c) { return c.actif !== false && valide(config, c, a); }); }

  // ------------------------------------------------------------ Vérification d'une demande (avertissements et blocages)
  /**
   * Points d'attention d'un congé (demande ou souhait) : jours décomptés, solde après, jours bloqués, à éviter, hors
   * délai, règles d'un tableau du service non respectées si le congé est ajouté. ctx : { comptes, aujourdhui, info }.
   */
  function verifier(st, config, c, ctx) {
    ctx = ctx || {};
    var a = (ctx.comptes || []).filter(function (x) { return x.id === c.agent; })[0] || { id: c.agent, roles: [], services: [c.service] };
    var js = jours(c.debut, c.fin), pers = periodes(st, c.service, c.debut, c.fin), res = { jours: decompte(st, config, c), bloquees: [], eviter: [], horsDelai: false, regles: [] };
    js.forEach(function (iso) {
      periodesDuJour(pers, iso, a.roles).forEach(function (p) { var l = p.effet === 'bloquee' ? res.bloquees : p.effet === 'eviter' ? res.eviter : null; if (l && l.indexOf(p) < 0) l.push(p); });
    });
    res.horsDelai = !!(js[0] && horsDelai(config, js[0], ctx.aujourdhui));
    // Date limite de dépôt passée (demande non prioritaire), ou à venir (rappel)
    var lim = limiteDepassee(st, c, ctx.aujourdhui || ''), avant = pers.filter(function (p) { return p.effet === 'limite' && JOUR.test(p.limite || '') && !(lim && lim.id === p.id); });
    res.tardive = lim ? { id: lim.id, libelle: lim.libelle, limite: lim.limite } : null;
    res.limites = avant.map(function (p) { return { id: p.id, libelle: p.libelle, limite: p.limite }; });
    var an = String(c.debut || '').slice(0, 4), so = an ? soldes(st, config, c.agent, +an, ctx.info || { service: c.service, roles: a.roles, aujourdhui: ctx.aujourdhui }) : {};
    var deja = st.conges && st.conges[c.id] && st.conges[c.id].statut !== 'annule' && st.conges[c.id].statut !== 'refuse' ? decompte(st, config, st.conges[c.id]) : 0;
    if (so[c.type]) res.soldeApres = Math.round((so[c.type].reste + (st.conges && st.conges[c.id] && st.conges[c.id].statut !== 'souhait' ? deja : 0) - res.jours) * 10) / 10;
    // Règles des tableaux du service sur ces dates, avec ce congé compté
    Object.keys((st && st.tableaux) || {}).map(function (k) { return st.tableaux[k]; })
      .filter(function (t) { return !t.supprime && t.service === c.service && t.debut <= c.fin && t.fin >= c.debut && regles(t).length; })
      .forEach(function (t) {
        var simule = Object.assign({}, st, { conges: Object.assign({}, st.conges) });
        simule.conges[c.id] = Object.assign({}, simule.conges[c.id] || {}, c, { statut: 'demande' });
        var d0 = c.debut > t.debut ? c.debut : t.debut, f0 = c.fin < t.fin ? c.fin : t.fin, g = grille(simule, config, t, ctx.comptes || [a], d0, f0, ctx.aujourdhui);
        g.depassements.forEach(function (x) { if ((x.regle.pour === '*' || (a.roles || []).indexOf(x.regle.pour) >= 0)) res.regles.push({ tableau: t.id, nom: t.nom, regle: x.regle, jours: x.jours, max: Math.max.apply(null, x.jours.map(function (iso) { var i = g.jours.map(function (j) { return j.iso; }).indexOf(iso); return (g.comptes[x.regle.pour === '*' ? '*' : x.regle.pour] || [])[i] || 0; })) }); });
      });
    return res;
  }

  // ------------------------------------------------------------ Contrôles
  function controler(type0, d, ctx) {
    var st = (ctx && ctx.etat) || reduire([]), cfg = (ctx && ctx.config) || {}, cpt = (ctx && ctx.compte) || null, comptes = (ctx && ctx.comptes) || [], auj = (ctx && ctx.aujourdhui) || jourLocal(Date.now());
    var roles = (cpt && cpt.roles) || [], admin = roles.indexOf('ADMIN') >= 0;
    function agent(id) { return comptes.filter(function (x) { return x.id === id; })[0] || (cpt && cpt.id === id ? cpt : null); }
    function validateurDe(a) { return admin || (cpt && valide(cfg, cpt, a)); }
    if (type0 === 'CONGE') {
      var c = st.conges[d.id], o = options(cfg);
      var a = agent(d.agent || (c && c.agent));
      if (!c && !d.agent) throw new Error('Agent manquant.');
      if (c && c.statut !== 'souhait' && c.statut !== 'demande') throw new Error('Ce congé est ' + STATUTS[c.statut].toLowerCase() + ' : il ne se modifie plus (annulez-le, puis faites une nouvelle demande).');
      var x = Object.assign({}, c || {}, d);
      if (!JOUR.test(x.debut || '') || !JOUR.test(x.fin || '')) throw new Error('Indiquez les dates du congé.');
      if (x.fin < x.debut) throw new Error('La date de fin est avant la date de début.');
      if (versJour(x.fin) - versJour(x.debut) > 366) throw new Error('Un congé dure au plus un an.');
      var t = type(cfg, x.type);
      if (!t || !t.actif) throw new Error('Choisissez un type de congé.');
      if (d.statut === 'souhait' && !o.souhaits) throw new Error('Les souhaits ne sont pas activés : envoyez une demande.');
      if (d.statut && d.statut !== 'souhait' && d.statut !== 'demande') throw new Error('Statut inconnu.');
      if (x.commentaire && String(x.commentaire).length > 300) throw new Error('Commentaire trop long (300 caractères au plus).');
      var soi = cpt && x.agent === cpt.id;
      if (!soi && !validateurDe(a || { id: x.agent, roles: [], services: [x.service] })) throw new Error('Vous ne validez pas les congés de cet agent : il saisit lui-même sa demande.');
      if (decompte(st, cfg, x) <= 0) throw new Error('Aucun jour décompté sur ces dates (repos, jours non travaillés ou fériés).');
      var v = verifier(st, cfg, x, { comptes: comptes.length ? comptes : (a ? [a] : []), aujourdhui: auj });
      if (v.bloquees.length && soi && !validateurDe(a)) throw new Error('Période bloquée par le validateur : ' + v.bloquees.map(function (p) { return p.libelle + ' (du ' + p.debut.split('-').reverse().join('/') + ' au ' + p.fin.split('-').reverse().join('/') + ')'; }).join(', ') + '.');
      var bl = v.regles.filter(function (r) { return r.regle.bloquante; });
      if (bl.length && (x.statut || 'souhait') === 'demande' && !validateurDe(a)) throw new Error('Règle bloquante non respectée : ' + bl.map(function (r) { return (r.regle.pour === '*' ? 'agents' : r.regle.pour) + ' en congé en même temps, ' + r.regle.max + ' au plus'; }).join(' ; ') + '.');
      return;
    }
    if (type0 === 'CONGE_DECISION') {
      var cd = st.conges[d.conge];
      if (!cd) throw new Error('Congé introuvable.');
      if (cd.statut !== 'demande' && !(cd.statut === 'souhait' && admin)) throw new Error('Seule une demande envoyée se valide ou se refuse.');
      if (d.decision !== 'valide' && d.decision !== 'refuse') throw new Error('Décision inconnue.');
      if (d.decision === 'refuse' && !texte(d.motif, 300)) throw new Error('Indiquez le motif du refus (vu par l’agent, sans donnée de santé).');
      if (cpt && cd.agent === cpt.id) throw new Error('Vous ne validez pas vos propres congés.');
      if (!validateurDe(agent(cd.agent) || { id: cd.agent, roles: [], services: [cd.service] })) throw new Error('Vous n’êtes pas le validateur de cet agent.');
      return;
    }
    if (type0 === 'CONGE_ANNULATION') {
      var ca = st.conges[d.conge];
      if (!ca) throw new Error('Congé introuvable.');
      if (ca.statut === 'annule' || ca.statut === 'refuse') throw new Error('Ce congé est déjà ' + STATUTS[ca.statut].toLowerCase() + '.');
      var lui = cpt && ca.agent === cpt.id;
      if (ca.statut === 'valide' && !validateurDe(agent(ca.agent) || { id: ca.agent, roles: [], services: [ca.service] })) throw new Error('Un congé validé s’annule avec le validateur : demandez-lui.');
      if (!lui && ca.statut !== 'valide' && !validateurDe(agent(ca.agent) || { id: ca.agent, roles: [], services: [ca.service] })) throw new Error('Seul l’agent ou son validateur annule ce congé.');
      if (ca.statut === 'valide' && !texte(d.motif, 300)) throw new Error('Indiquez le motif de l’annulation.');
      return;
    }
    if (type0 === 'TABLEAU_CONGES' || type0 === 'PERIODE_CONGES') {
      var ex = type0 === 'TABLEAU_CONGES' ? st.tableaux[d.id] : st.periodes[d.id], y = Object.assign({}, ex || {}, d);
      if (y.service === '*' ? !admin : !(admin || (cpt && (cpt.services || []).indexOf(y.service) >= 0))) throw new Error(y.service === '*' ? 'Les périodes de l’établissement sont réglées par l’administrateur.' : 'Service hors des vôtres.');
      if (d.supprime) return;
      if (!texte(type0 === 'TABLEAU_CONGES' ? y.nom : y.libelle, 80)) throw new Error('Donnez un nom.');
      if (!JOUR.test(y.debut || '') || !JOUR.test(y.fin || '') || y.fin < y.debut) throw new Error('Dates invalides.');
      if (type0 === 'TABLEAU_CONGES' && versJour(y.fin) - versJour(y.debut) > 400) throw new Error('Un tableau couvre au plus une année (un peu plus de 12 mois).');
      if (type0 === 'PERIODE_CONGES' && !EFFETS[y.effet]) throw new Error('Effet inconnu.');
      if (type0 === 'PERIODE_CONGES' && y.effet === 'limite' && (!JOUR.test(y.limite || '') || y.limite > y.debut)) throw new Error('Indiquez la date limite de dépôt, avant le début de la période.');
      if (type0 === 'TABLEAU_CONGES' && (y.regles || []).some(function (r) { return !(r.max >= 0 && r.max <= 200); })) throw new Error('Règle : maximum entre 0 et 200.');
      return;
    }
    if (type0 === 'DROITS_CONGES' || type0 === 'QUOTITE') {
      var ag = agent(d.agent);
      if (!d.agent) throw new Error('Agent manquant.');
      if (!admin && !(cpt && ag && (cpt.services || []).some(function (s) { return (ag.services || []).indexOf(s) >= 0; }) && cpt.id !== ag.id)) throw new Error('Le cadre des services de l’agent ou l’administrateur règle ses droits et sa quotité.');
      if (type0 === 'QUOTITE' && !d.supprime) {
        if (!JOUR.test(d.depuis || '')) throw new Error('Indiquez la date du changement.');
        if (!(+d.quotite >= 10 && +d.quotite <= 100)) throw new Error('Quotité entre 10 et 100 %.');
        if ((d.nonTravailles || []).some(function (n) { return !(n >= 0 && n <= 6); })) throw new Error('Jours non travaillés invalides.');
      }
      if (type0 === 'DROITS_CONGES') {
        if (!/^\d{4}$/.test(String(d.annee))) throw new Error('Année invalide.');
        Object.keys(d.droits || {}).forEach(function (k) { var n = d.droits[k]; if (n !== null && !(typeof n === 'number' && n >= 0 && n <= 400)) throw new Error('Droit invalide : ' + k + '.'); });
      }
    }
  }
  /** Saisies permises sans accès particulier : sa propre annulation d'un souhait ou d'une demande. */
  function permisPourSoi(t, data, compte, ctx) {
    if (t !== 'CONGE_ANNULATION' || !compte || !ctx || !ctx.etat) return false;
    var c = ctx.etat.conges && ctx.etat.conges[data.conge];
    return !!c && c.agent === compte.id && (c.statut === 'souhait' || c.statut === 'demande');
  }
  /** Informations reçues par l'agent (validé, refusé, annulé par le validateur), pas encore vues. */
  function avisPour(st, agent, vus) { var v = vus || []; return ((st && st.avis) || []).filter(function (a) { return a.agent === agent && v.indexOf(a.id) < 0 && st.conges[a.conge]; }); }
  /** Demandes à valider par un compte, de la plus ancienne date de début à la plus récente. */
  function aValider(st, config, comptes, v) {
    return Object.keys((st && st.conges) || {}).map(function (k) { return st.conges[k]; }).filter(function (c) {
      if (c.statut !== 'demande') return false;
      var a = (comptes || []).filter(function (x) { return x.id === c.agent; })[0] || { id: c.agent, roles: [], services: [c.service] };
      return valide(config, v, a);
    }).sort(function (a, b) { return (a.tardive ? 1 : 0) - (b.tardive ? 1 : 0) || String(a.debut).localeCompare(String(b.debut)); });
  }
  /** Absences lues par l'Agenda (lecture à la volée) : congés validés qui touchent [debut, fin[ (millisecondes, heure locale). */
  function absences(st, debut, fin) {
    return Object.keys((st && st.conges) || {}).map(function (k) { return st.conges[k]; }).filter(function (c) { return c.statut === 'valide' && JOUR.test(c.debut || '') && JOUR.test(c.fin || ''); }).map(function (c) {
      var p = c.debut.split('-'), q = c.fin.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]).getTime(), f = new Date(+q[0], +q[1] - 1, +q[2] + 1).getTime() - 1;
      return { id: 'cg-' + c.id, agent: c.agent, nom: c.nom || '', debut: d, fin: f, categorie: 'conge', service: c.service, source: 'conges' };
    }).filter(function (a) { return a.debut < fin && a.fin >= debut; });
  }

  // ------------------------------------------------------------ Droits du module et contrat
  var ACCES = [
    { code: 'conges.demander', libelle: 'Planifier ses congés : souhaits, demandes, annulation de ses demandes', types: ['CONGE', 'CONGE_ANNULATION'] },
    { code: 'conges.valider', libelle: 'Valider ou refuser les demandes des agents dont on est le validateur ; régler les tableaux, périodes et blocages de ses services', types: ['CONGE_DECISION', 'TABLEAU_CONGES', 'PERIODE_CONGES'] },
    { code: 'conges.droits', libelle: 'Régler les droits de l’année et la quotité de travail des agents de ses services', types: ['DROITS_CONGES', 'QUOTITE'] }
  ];
  var DEMANDER = ['CONGE', 'CONGE_ANNULATION'];
  var DROITS = {
    IDE: DEMANDER, AS: DEMANDER, SECRETAIRE: DEMANDER, MEDECIN: DEMANDER,
    CADRE: TYPES.slice(), CADRE_SUP: TYPES.slice(),
    MEDECIN_CHEF_SERVICE: DEMANDER.concat(['CONGE_DECISION', 'TABLEAU_CONGES', 'PERIODE_CONGES']), MEDECIN_CHEF_POLE: DEMANDER.concat(['CONGE_DECISION', 'TABLEAU_CONGES', 'PERIODE_CONGES']),
    DIRECTEUR_SOINS: DEMANDER.concat(['CONGE_DECISION', 'TABLEAU_CONGES', 'PERIODE_CONGES'])
  };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'conges', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.conges : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, c = d.conge && st && st.conges ? st.conges[d.conge] : null, ex = d.id && st ? ((st.conges || {})[d.id] || (st.tableaux || {})[d.id] || (st.periodes || {})[d.id]) : null;
    var sv = d.service || (c && c.service) || (ex && ex.service);
    return sv && sv !== '*' ? [sv] : [];
  }

  var contrat = {
    id: 'conges',
    libelle: 'Congés',
    version: '0.1.0',
    icone: 'CG',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi, services: cibles },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { conges: controlerCadre } },
    vues: { onglets: [{ code: 'mes-conges', libelle: 'Mes congés' }, { code: 'tableau', libelle: 'Tableau du service' }, { code: 'a-valider', libelle: 'À valider', droit: 'CONGE_DECISION' }, { code: 'reglages', libelle: 'Tableaux et périodes', droit: ['TABLEAU_CONGES', 'DROITS_CONGES'] }] },
    migrations: [],
    fournitures: [
      // Lue par l'Agenda (décision du porteur du 12 novembre 2026) : un congé validé est une absence de l'agent
      { nom: 'conges.absences', version: 1, acces: 'lecture', champs: ['agent', 'nom', 'debut', 'fin', 'service'], lire: function (st, o) { return absences(st, o.debut, o.fin); } }
    ],
    besoins: []
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, STATUTS: STATUTS, EFFETS: EFFETS, MODES_FERIES: MODES_FERIES, UNITES: UNITES,
    TYPES_DEFAUT: TYPES_DEFAUT, VALIDATEURS_DEFAUT: VALIDATEURS_DEFAUT, COULEURS_DEFAUT: COULEURS_DEFAUT, ALERTE_DEFAUT: ALERTE_DEFAUT, PRESEANCE: PRESEANCE,
    options: options, type: type, feries: feries, estFerie: estFerie, paques: paques, modeFeries: modeFeries, rolePrincipal: rolePrincipal, controlerCadre: controlerCadre,
    quotiteLe: quotiteLe, quotiteMoyenne: quotiteMoyenne, historiqueQuotite: historiqueQuotite, jourCompte: jourCompte, decompte: decompte, droitsAnnee: droits, soldes: soldes, congesDe: congesDe,
    periodes: periodes, periodesDuJour: periodesDuJour, horsDelai: horsDelai, regles: regles, agentsDuTableau: agentsDuTableau, grille: grille,
    roleValidateur: roleValidateur, valide: valide, validateurs: validateurs, verifier: verifier, controler: controler, permisPourSoi: permisPourSoi,
    avisPour: avisPour, aValider: aValider, limiteDepassee: limiteDepassee, absences: absences, jours: jours, plusJours: plusJours, jourSemaine: jourSemaine, jourLocal: jourLocal, versJour: versJour, versISO: versISO };
});
