// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Vue d'ensemble (0.19, plan relu par le porteur le 9 novembre 2026, architecture § 7 quinquies).
 *
 * Tableaux partagés, un onglet par vue : lignes de patients, de médecins ou d'agents ; colonnes natives (fiche patient,
 * Suivi médical, Isolement et contention, liste des médecins, comptes et Agenda), données ajoutées et colonnes calculées ;
 * groupes de lignes ; bandeau de synthèse ; couleurs selon les réglages des données et les règles propres à la vue ;
 * instantanés (feuille du staff) préparés, complétés puis clos. Le module n'a pas de données propres en dehors des
 * instantanés : chaque case modifiée l'est dans le module propriétaire de la donnée, par l'interface.
 *
 * Réglage `vuesEnsemble` (journal du socle) : { vues: [vue] } ; sans réglage, vues proposées. Vue : { id, nom, lignes
 * (patients | medecins | agents), services ([] : établissement, réservée à l'administrateur), roles ([] : tous), perimetre,
 * tri { colonne, sens }, colonnes [{ code, roles, affichage (nom | initiales), regles, largeur (pixels ; 0 : automatique) }], groupes [{ id, titre, conditions
 * [{ colonne, op, valeur, n }], combinaison (toutes | une) }], autres { titre, masque }, synthese [éléments], instantane
 * { roles } (rôles qui closent : cadre par défaut, réglable par le cadre), par }.
 *
 * Instantané (décision 18) : une saisie `INSTANTANE` (en-tête, journal du module) et des parts `INSTANTANE_PART`, une par
 * journal des colonnes (Patients, Suivi médical, clé propre d'une donnée…) : chacun ne revoit que les colonnes qu'il
 * avait le droit de voir. Jamais modifié ; annotations datées (`INSTANTANE_NOTE`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'),
    require('./champs.js'), require('./couleurs.js'), require('./formules.js'), require('./medecins.js'), require('./liste-patients.js'), require('./capacites.js'));
  else (root.SIC = root.SIC || {}).vue = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules, root.SIC.champs, root.SIC.couleurs, root.SIC.formules, root.SIC.medecins, root.SIC.listePatients, root.SIC.capacites, root.SIC.sorties);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre, CH, CO, F, MED, L, K, SO) {
  SO = SO || require('./sorties.js');
  'use strict';

  var TYPES = ['INSTANTANE', 'INSTANTANE_PART', 'INSTANTANE_NOTE'];
  var LIGNES = { patients: 'Patients', medecins: 'Médecins', agents: 'Agents' };
  var PERIMETRES = { hospitalises: 'Patients hospitalisés', recents: 'Hospitalisés et sorties récentes', tous: 'Tous les patients' };
  var SYNTHESE = { effectif: 'Nombre de patients', places: 'Places disponibles', sorties: 'Sorties prévues (aujourd’hui, 7 jours)', parMode: 'Patients par mode d’hospitalisation', parMedecin: 'Patients par médecin de 1re ligne', ageMoyen: 'Âge moyen' };
  var MOTIF_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

  function texte(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 80); }
  function liste(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : []; }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function jourFr(j) { return j ? String(j).split('-').reverse().join('/') : ''; }
  function joursDepuis(j, maintenant) { return CO.ecartJours(j, maintenant); }

  // ------------------------------------------------------------ Vues
  var COLS_MEDICALE = ['patient', 'chambre', 'entree', 'mode', 'medecin1', 'psychologue', 'suiviAS', 'dernierEntretien', 'contrat', 'sortiePrevue'];
  /** Vues proposées tant que l'établissement n'a rien réglé (modifiables par l'administrateur). */
  function vuesProposees() {
    return [
      { id: 'medicale', nom: 'Vue médicale', lignes: 'patients', services: [], roles: [], perimetre: 'hospitalises', tri: { colonne: 'chambre', sens: 1 },
        colonnes: COLS_MEDICALE.map(function (c) { return { code: c, affichage: c === 'medecin1' ? 'initiales' : 'nom' }; }), groupes: [], synthese: ['effectif', 'places', 'sorties'] },
      { id: 'staff', nom: 'Staff', lignes: 'patients', services: [], roles: [], perimetre: 'hospitalises', tri: { colonne: 'entree', sens: -1 },
        colonnes: ['patient', 'chambre', 'entree', 'mode', 'medecin1', 'medecin2', 'referents', 'sortiePrevue'].map(function (c) { return { code: c }; }),
        groupes: [{ id: 'entrants', titre: 'Entrés depuis 7 jours', combinaison: 'toutes', conditions: [{ colonne: 'entree', op: 'depuisMoinsDe', n: 7 }] },
          { id: 'longs', titre: 'Présents depuis plus de 90 jours', combinaison: 'toutes', conditions: [{ colonne: 'entree', op: 'depuisPlusDe', n: 90 }] }],
        autres: { titre: 'Autres patients' }, synthese: ['effectif', 'places', 'sorties', 'parMode', 'parMedecin', 'ageMoyen'], instantane: { roles: ['CADRE'] } },
      { id: 'medecins', nom: 'Médecins', lignes: 'medecins', services: [], roles: [], colonnes: ['nom', 'initiales', 'fonction', 'statut', 'presence', 'patients1', 'patients2', 'retards'].map(function (c) { return { code: c }; }), groupes: [], synthese: [] },
      { id: 'equipe', nom: 'Équipe', lignes: 'agents', services: [], roles: ['CADRE'], colonnes: ['nom', 'roles', 'groupes', 'referent', 'absence', 'taches'].map(function (c) { return { code: c }; }), groupes: [], synthese: [] }
    ];
  }
  /** Largeur d'une colonne en pixels (40 à 800) ; 0 : automatique (ajustée au contenu). */
  function largeur(v) { var n = Math.round(+v); return isFinite(n) && n >= 40 && n <= 800 ? n : 0; }
  function condition(c) {
    if (!c || !texte(c.colonne) || !(CO.CONDITIONS[c.op] || c.op === 'apresLe' || c.op === 'avantLe')) return null;
    var x = { colonne: texte(c.colonne, 60), op: c.op };
    if (c.valeur !== undefined) x.valeur = typeof c.valeur === 'object' ? JSON.parse(JSON.stringify(c.valeur)) : texte(c.valeur, 80);
    if (c.n !== undefined) x.n = Math.round(+c.n) || 0;
    return x;
  }
  /** Vue validée à la lecture ; null si inutilisable. */
  function normaliser(v) {
    if (!v || !MOTIF_ID.test(v.id || '') || !texte(v.nom)) return null;
    var lignes = LIGNES[v.lignes] ? v.lignes : 'patients';
    var cols = (Array.isArray(v.colonnes) ? v.colonnes : []).map(function (c) { return typeof c === 'string' ? { code: c } : c; }).filter(function (c) { return c && texte(c.code); })
      .map(function (c) { return { code: texte(c.code, 60), roles: liste(c.roles), affichage: c.affichage === 'initiales' ? 'initiales' : 'nom', regles: CO.regles(c.regles), libelle: texte(c.libelle, 60), largeur: largeur(c.largeur) }; });
    if (!cols.length) cols = [{ code: lignes === 'patients' ? 'patient' : 'nom', roles: [], affichage: 'nom', regles: [], libelle: '', largeur: 0 }];
    return {
      id: v.id, nom: texte(v.nom, 60), lignes: lignes, services: liste(v.services), roles: liste(v.roles),
      perimetre: PERIMETRES[v.perimetre] ? v.perimetre : 'hospitalises',
      tri: { colonne: texte(v.tri && v.tri.colonne, 60) || cols[0].code, sens: v.tri && v.tri.sens === -1 ? -1 : 1 },
      colonnes: cols,
      groupes: (Array.isArray(v.groupes) ? v.groupes : []).filter(function (g) { return g && texte(g.titre); }).map(function (g, i) {
        return { id: MOTIF_ID.test(g.id || '') ? g.id : 'g' + i, titre: texte(g.titre, 80), combinaison: g.combinaison === 'une' ? 'une' : 'toutes', conditions: (Array.isArray(g.conditions) ? g.conditions : []).map(condition).filter(Boolean) };
      }),
      autres: { titre: texte(v.autres && v.autres.titre, 80) || 'Autres', masque: !!(v.autres && v.autres.masque) },
      synthese: liste(v.synthese).filter(function (s) { return SYNTHESE[s]; }),
      instantane: { roles: v.instantane && Array.isArray(v.instantane.roles) ? liste(v.instantane.roles) : ['CADRE'] },
      par: v.par && typeof v.par === 'object' ? { role: v.par.role === 'CADRE' ? 'CADRE' : 'ADMIN', services: liste(v.par.services) } : null
    };
  }
  function vues(config) {
    var x = (config && config.vuesEnsemble) || {}, src = Array.isArray(x.vues) ? x.vues : vuesProposees(), vus = {};
    return src.map(normaliser).filter(function (v) { if (!v || vus[v.id]) return false; vus[v.id] = true; return true; });
  }
  /** Vues proposées à un agent : rôles de la vue (vide : tous) et services de la vue (vide : tous) ; l'administrateur les voit toutes. */
  function vuesPour(config, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return vues(config);
    return vues(config).filter(function (v) {
      return (!v.roles.length || v.roles.some(function (r) { return roles.indexOf(r) >= 0; })) && (!v.services.length || v.services.some(function (s) { return sv.indexOf(s) >= 0; }));
    });
  }
  /** Durée de conservation des instantanés (mois ; 0 : sans limite), réglée par l'établissement (décision 20). */
  function conservationMois(config) { var n = Math.round(+(((config && config.vuesEnsemble) || {}).conservationMois)); return isFinite(n) && n > 0 && n <= 600 ? n : 0; }
  /** Instantané au-delà de la durée de conservation (à retirer selon la procédure de l'établissement). */
  function auDelaConservation(config, i, maintenant) {
    var m = conservationMois(config); if (!m || !i || !i.entete) return false;
    var d = new Date(maintenant || Date.now()); d.setMonth(d.getMonth() - m);
    return Date.parse(i.entete.le) < d.getTime();
  }
  function vueDe(config, id) { return vues(config).filter(function (v) { return v.id === id; })[0] || null; }
  /** Le cadre règle les vues de ses services (services non vides, tous à lui) ; l'administrateur, toutes. */
  function peutRegler(v, compte) {
    var roles = (compte && compte.roles) || [], sv = (compte && compte.services) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    return roles.indexOf('CADRE') >= 0 && !!v && v.services.length > 0 && v.services.every(function (s) { return sv.indexOf(s) >= 0; });
  }
  function controlerCadre(ancien, nouveau, compte) {
    var roles = (compte && compte.roles) || [];
    if (roles.indexOf('ADMIN') >= 0) return true;
    if (roles.indexOf('CADRE') < 0 || !nouveau || !Array.isArray(nouveau.vues)) return false;
    var avant = {}, apres = {};
    (ancien && Array.isArray(ancien.vues) ? ancien.vues : vuesProposees()).forEach(function (v) { if (v && v.id) avant[v.id] = v; });
    nouveau.vues.forEach(function (v) { if (v && v.id) apres[v.id] = v; });
    var ok = true;
    Object.keys(avant).forEach(function (id) { if (JSON.stringify(avant[id]) !== JSON.stringify(apres[id]) && !peutRegler(normaliser(avant[id]), compte)) ok = false; });
    Object.keys(apres).forEach(function (id) { if (JSON.stringify(avant[id]) !== JSON.stringify(apres[id]) && !peutRegler(normaliser(apres[id]), compte)) ok = false; });
    return ok;
  }
  /** Rôles qui closent un instantané de la vue (cadre par défaut, réglable par le cadre). */
  function peutClore(v, compte) {
    var roles = (compte && compte.roles) || [];
    return roles.indexOf('ADMIN') >= 0 || (!!v && v.instantane.roles.some(function (r) { return roles.indexOf(r) >= 0; }));
  }

  // ------------------------------------------------------------ Colonnes
  function sejourEnCours(p) { var r = null; ((p && p.sejours) || []).forEach(function (x) { if (!x.sortie) r = x; }); return r; }
  function dernierSejour(p) { var s = (p && p.sejours) || []; return s.length ? s[s.length - 1] : null; }
  function nomMedecin(ctx, n, id) { return n || id ? MED.resoudre(ctx.config, n, id) : ''; }
  function idMedecin(ctx, n, id) { if (id) return id; var m = n ? MED.parNom(ctx.config, n) : null; return m ? m.id : (n || ''); }
  function reglesMode() {
    return [{ si: { op: 'egal', valeur: 'SDRE' }, couleur: 'rouge', rendu: 'pastille', libelle: 'SDRE' }, { si: { op: 'egal', valeur: 'SDT' }, couleur: 'orange', rendu: 'pastille', libelle: 'SDT' },
      { si: { op: 'egal', valeur: 'SDTU' }, couleur: 'brun', rendu: 'pastille', libelle: 'SDTU' }, { si: { op: 'egal', valeur: 'SPI' }, couleur: 'violet', rendu: 'pastille', libelle: 'SPI' },
      { si: { op: 'contient', valeur: 'SL' }, couleur: 'vert', rendu: 'pastille', libelle: 'Soins libres' }];
  }
  /** Lecture d'une donnée du Suivi médical (entretien ou contrat) : valeur et contexte d'échéance (délais du Suivi médical). */
  function suiviDe(ctx, p, quoi) {
    if (!ctx.suivi || !ctx.suiviModule) return null;
    var s = ctx.suiviModule.suiviPatient(ctx.suivi, ctx.config, p, ctx.maintenant)[quoi];
    var restants = s.date ? s.delai - s.jours : (s.retard ? -1 : null);
    return { v: s.date || null, lib: s.date ? jourFr(s.date) + ' (' + s.jours + ' j)' : (s.retard ? 'à faire' : '—'), brute: s.date || null, ctx: { jours: s.jours, restants: restants, delai: s.delai } };
  }
  /**
   * Catalogue des colonnes d'un type de lignes. ctx : { config, maintenant, roles, fiches, suivi, suiviModule, agenda,
   * agendaModule, valeurs, lisible(champ), comptes, mesuresEnCours(patientId), libService(code), libRole(code), service }.
   * Colonne : { code, libelle, type (type de valeur, conditions et couleurs), journal (journal qui la porte), reglage (code
   * des réglages de la donnée), defaut ({ regles, delai }), lire(ligne) → { v, lib, brute, cle, ctx }, edition }.
   */
  function catalogue(entite, ctx) {
    var cols = [];
    function col(c) { cols.push(c); }
    if (entite === 'patients') {
      var lib1 = 'Médecin de 1re ligne', lib2 = 'Médecin de 2e ligne';
      col({ code: 'patient', libelle: 'Patient', type: 'texte', journal: 'patients', lire: function (l) { var n = ((l.p.nom || '?') + ' ' + (l.p.prenom || '')).trim(); return { v: n, lib: n, brute: n }; } });
      col({ code: 'chambre', libelle: 'Chambre', type: 'texte', journal: 'patients', edition: { type: 'sejour', cle: 'chambre' }, lire: function (l) { var t = (l.chambre + (l.lit ? ' ' + l.lit : '')).trim(); return { v: t, lib: t || '—', brute: t }; } });
      col({ code: 'service', libelle: 'Unité', type: 'texte', journal: 'patients', lire: function (l) { var t = ctx.libService ? ctx.libService(l.service) : l.service; return { v: t, lib: t || '—', brute: t, cle: l.service }; } });
      col({ code: 'entree', libelle: 'Date d’entrée', type: 'date', journal: 'patients', lire: function (l) { var j = joursDepuis(l.entree, ctx.maintenant); return { v: l.entree || null, lib: l.entree ? jourFr(l.entree) + (j !== null ? ' (J' + j + ')' : '') : '—', brute: l.entree || null }; } });
      col({ code: 'jours', libelle: 'Jours d’hospitalisation', type: 'nombre', journal: 'patients', lire: function (l) { var j = joursDepuis(l.entree, ctx.maintenant); return { v: j, lib: j === null ? '—' : 'J' + j, brute: j }; } });
      col({ code: 'naissance', libelle: 'Date de naissance', type: 'date', journal: 'patients', lire: function (l) { return { v: l.p.naissance || null, lib: jourFr(l.p.naissance) || '—', brute: l.p.naissance || null }; } });
      col({ code: 'age', libelle: 'Âge', type: 'nombre', journal: 'patients', lire: function (l) { return { v: l.age, lib: l.age === null ? '—' : l.age + ' ans', brute: l.age }; } });
      col({ code: 'mode', libelle: 'Mode d’hospitalisation', type: 'liste', journal: 'patients', reglage: 'patients.mode', defaut: { regles: reglesMode() }, edition: { type: 'mode' }, lire: function (l) { return { v: l.mode || null, lib: l.mode || '—', brute: l.mode || null, cle: l.mode }; } });
      [['medecin1', lib1], ['medecin2', lib2]].forEach(function (x) {
        col({ code: x[0], libelle: x[1], type: 'liste', journal: 'patients', reglage: 'patients.' + x[0], edition: { type: 'medecin', cle: x[0] }, medecin: true, lire: function (l, c) {
          var n = nomMedecin(ctx, l.p[x[0]], l.p[x[0] + 'Id']), id = idMedecin(ctx, l.p[x[0]], l.p[x[0] + 'Id']);
          var aff = c && c.affichage === 'initiales' && n ? MED.initiales(ctx.config, n, l.p[x[0] + 'Id']) : n;
          return { v: n || null, lib: aff || '—', brute: n || null, cle: id, titre: n };
        } });
      });
      col({ code: 'referents', libelle: 'Référents soignants', type: 'texte', journal: 'patients', lire: function (l) { var t = (l.p.referents || []).map(function (r) { return r.nom; }).join(', '); return { v: t || null, lib: t || '—', brute: t || null }; } });
      // Psychologue référent : liste commune des psychologues (0.20.0), nom ou initiales comme les médecins
      col({ code: 'psychologue', libelle: 'Psychologue référent', type: 'liste', journal: 'patients', reglage: 'patients.psychologue', edition: { type: 'psychologue' }, medecin: true, psychologue: true, lire: function (l, c) {
        var PS = MED.psychologues, n = l.p.psychologue || l.p.psychologueId ? PS.resoudre(ctx.config, l.p.psychologue, l.p.psychologueId) : '';
        var m = PS.parId(ctx.config, l.p.psychologueId) || PS.parNom(ctx.config, n);
        var aff = c && c.affichage === 'initiales' && n ? PS.initiales(ctx.config, n, l.p.psychologueId) : n;
        return { v: n || null, lib: aff || '—', brute: n || null, cle: m ? m.id : (n || ''), titre: n };
      } });
      col({ code: 'suiviAS', libelle: 'Suivi assistant(e) social(e)', type: 'ouiNon', journal: 'patients', edition: { type: 'suiviAS' }, lire: function (l) {
        var a = l.p.suiviAS; return { v: a ? !!a.suivi : null, lib: !a ? '—' : (a.suivi ? 'Oui' + (a.nom ? ' (' + a.nom + ')' : '') : 'Non'), brute: a ? (a.suivi ? 1 : 0) : null };
      } });
      col({ code: 'protection', libelle: 'Mesure de protection', type: 'texte', journal: 'patients', lire: function (l) { return { v: l.p.protection || null, lib: l.p.protection || '—', brute: l.p.protection || null }; } });
      col({ code: 'sortiePrevue', libelle: 'Sortie envisagée ou actée', alias: ['sortie prévisionnelle'], type: 'dateFenetre', journal: 'patients', reglage: 'patients.sortiePrevue', defaut: { regles: SO.REGLES_DEFAUT }, edition: { type: 'sortiePrevue' }, lire: function (l) {
        // Une seule donnée, deux états (0.21.0) : la couleur suit l'état (règles « est égal à actee / envisagee », réglables)
        var s = sejourEnCours(l.p), v = s && s.sortiePrevue;
        return { v: v || null, lib: v ? SO.libelle(v) : '—', brute: v && v.debut ? v.debut : null, cle: v ? SO.etat(v) : undefined };
      } });
      if (ctx.suivi) {
        col({ code: 'dernierEntretien', libelle: 'Dernier entretien médical', type: 'date', journal: 'suivi', reglage: 'suivi.entretien', defaut: { regles: CO.reglesEcheance() }, delaiSuivi: true, edition: { type: 'suivi', quoi: 'entretien' }, lire: function (l) { return suiviDe(ctx, l.p, 'entretien') || { v: null, lib: '—', brute: null }; } });
        col({ code: 'contrat', libelle: 'Contrat de soins réévalué le', type: 'date', journal: 'suivi', reglage: 'suivi.contrat', defaut: { regles: CO.reglesEcheance() }, delaiSuivi: true, edition: { type: 'suivi', quoi: 'contrat' }, lire: function (l) { return suiviDe(ctx, l.p, 'contrat') || { v: null, lib: '—', brute: null }; } });
      }
      if (ctx.mesuresEnCours) col({ code: 'mesuresEnCours', libelle: 'Isolement / contention en cours', type: 'texte', journal: 'isocont', lire: function (l) { var t = ctx.mesuresEnCours(l.p.id) || ''; return { v: t || null, lib: t || '—', brute: t || null }; } });
    }
    if (entite === 'medecins') {
      col({ code: 'nom', libelle: 'Médecin', type: 'texte', journal: 'socle', lire: function (l) { return { v: l.m.nom, lib: l.m.nom, brute: l.m.nom, cle: l.m.id }; } });
      col({ code: 'initiales', libelle: 'Initiales', type: 'texte', journal: 'socle', edition: { type: 'initiales' }, lire: function (l) { var i = l.m.initiales || MED.proposerInitiales(l.m.nom); return { v: i, lib: i || '—', brute: i }; } });
      col({ code: 'fonction', libelle: 'Fonction', type: 'liste', journal: 'socle', lire: function (l) { var t = MED.FONCTIONS[l.m.fonction] || ''; return { v: t, lib: t, brute: t, cle: l.m.fonction }; } });
      col({ code: 'statut', libelle: 'Statut', type: 'liste', journal: 'socle', lire: function (l) { var t = MED.STATUTS[l.m.statut] || ''; return { v: t, lib: t + (l.m.statut === 'interimaire' && l.m.fin ? ' jusqu’au ' + jourFr(l.m.fin) : ''), brute: t, cle: l.m.statut }; } });
      col({ code: 'services', libelle: 'Services', type: 'texte', journal: 'socle', lire: function (l) { var t = l.m.services.map(function (s) { return ctx.libService ? ctx.libService(s) : s; }).join(', ') || 'Tous'; return { v: t, lib: t, brute: t }; } });
      if (ctx.suivi && ctx.suiviModule) {
        col({ code: 'presence', libelle: 'Présence aujourd’hui', type: 'texte', journal: 'suivi', lire: function (l) {
          var j = jourISO(ctx.maintenant), lieux = l.m.services.length ? l.m.services : (ctx.services || []), etats = [];
          ['matin', 'apresmidi'].forEach(function (mo) {
            var e = '';
            lieux.forEach(function (lieu) { var s = ctx.suiviModule.situation(ctx.suivi, ctx.config, l.m.nom, lieu, j, mo); if (s.etat && (!e || s.etat === 'absent')) e = s.etat; });
            etats.push(e);
          });
          var lib = { present: 'présent', ponctuel: 'présent', absent: 'absent', garde: 'de garde', '': '—' };
          var t = etats[0] === etats[1] ? lib[etats[0]] + (etats[0] ? ' toute la journée' : '') : 'matin : ' + lib[etats[0]] + ', après-midi : ' + lib[etats[1]];
          return { v: t, lib: t, brute: etats.indexOf('absent') >= 0 ? 'absent' : etats.some(Boolean) ? 'present' : '', cle: etats.indexOf('absent') >= 0 ? 'absent' : etats.some(Boolean) ? 'present' : '' };
        } });
        [['patients1', 'Patients en 1re ligne', 'medecin1'], ['patients2', 'Patients en 2e ligne', 'medecin2']].forEach(function (x) {
          col({ code: x[0], libelle: x[1], type: 'nombre', journal: 'patients', lire: function (l) { var n = (ctx.hospitalises || []).filter(function (p) { return nomMedecin(ctx, p[x[2]], p[x[2] + 'Id']) === l.m.nom; }).length; return { v: n, lib: String(n), brute: n }; } });
        });
        col({ code: 'retards', libelle: 'Entretiens ou contrats en retard (1re ligne)', type: 'nombre', journal: 'suivi', reglage: 'medecins.retards', defaut: { regles: [{ si: { op: 'superieur', n: 0 }, couleur: 'rouge', rendu: 'texte', libelle: 'Retard' }] }, lire: function (l) {
          var n = (ctx.hospitalises || []).filter(function (p) { if (nomMedecin(ctx, p.medecin1, p.medecin1Id) !== l.m.nom) return false; var s = ctx.suiviModule.suiviPatient(ctx.suivi, ctx.config, p, ctx.maintenant); return s.entretien.retard || s.contrat.retard; }).length;
          return { v: n, lib: String(n), brute: n };
        } });
      }
    }
    if (entite === 'agents') {
      col({ code: 'nom', libelle: 'Agent', type: 'texte', journal: 'socle', lire: function (l) { return { v: l.a.nom, lib: l.a.nom, brute: l.a.nom, cle: l.a.id }; } });
      col({ code: 'roles', libelle: 'Rôles', type: 'texte', journal: 'socle', lire: function (l) { var t = (l.a.roles || []).map(function (r) { return ctx.libRole ? ctx.libRole(r) : r; }).join(', '); return { v: t, lib: t, brute: t }; } });
      col({ code: 'groupes', libelle: 'Groupes d’agents', type: 'texte', journal: 'socle', lire: function (l) {
        var t = (((ctx.config && ctx.config.groupes) || []).filter(function (g) { return g && g.actif !== false && (g.membres || []).some(function (m) { return m.id === l.a.id; }); }).map(function (g) { return g.libelle; })).join(', ');
        return { v: t || null, lib: t || '—', brute: t || null };
      } });
      col({ code: 'referent', libelle: 'Patients en référence', type: 'nombre', journal: 'patients', lire: function (l) {
        var ps = (ctx.hospitalises || []).filter(function (p) { return (p.referents || []).some(function (r) { return r.id === l.a.id || r.nom === l.a.nom; }); });
        return { v: ps.length, lib: ps.length ? ps.length + ' — ' + ps.map(function (p) { return p.nom; }).join(', ') : '0', brute: ps.length };
      } });
      if (ctx.agenda && ctx.agendaModule) {
        col({ code: 'absence', libelle: 'Absence aujourd’hui', type: 'texte', journal: 'agenda', reglage: 'agents.absence', defaut: { regles: [{ si: { op: 'rempli' }, couleur: 'orange', rendu: 'fond', libelle: 'Absent(e)' }] }, lire: function (l) {
          var d = new Date(ctx.maintenant); d.setHours(0, 0, 0, 0);
          var a = ctx.agendaModule.absences(ctx.agenda, d.getTime(), d.getTime() + 864e5).filter(function (x) { return x.agent === l.a.id; })[0];
          var t = a ? (ctx.agendaModule.CATEGORIES_ABSENCE[a.categorie] || 'Absent(e)') : '';
          return { v: t || null, lib: t || '—', brute: t || null };
        } });
        col({ code: 'taches', libelle: 'Tâches du jour affectées', type: 'nombre', journal: 'agenda', lire: function (l) {
          var d = new Date(ctx.maintenant); d.setHours(0, 0, 0, 0);
          var n = ctx.agendaModule.tachesDues(ctx.agenda, l.a.services || [], d.getTime(), d.getTime() + 864e5).filter(function (x) { return x.affecte && x.affecte.agent === l.a.id && !x.fait; }).length;
          return { v: n, lib: String(n), brute: n };
        } });
      }
    }
    // Données ajoutées (patients, médecins) et colonnes calculées
    var ent = entite === 'patients' ? 'patient' : entite === 'medecins' ? 'medecin' : entite === 'agents' ? 'agent' : null;
    if (ent) CH.definitions(ctx.config, { entite: ent }).forEach(function (c) {
      if (ctx.lisible && !ctx.lisible(c)) return;
      col({ code: 'c:' + c.id, libelle: c.libelle, type: c.type, champ: c, journal: c.type === 'formule' ? null : CH.journalDe(c), reglage: 'c:' + c.id, edition: c.type === 'formule' ? null : { type: 'champ' },
        lire: function (l) {
          if (c.type === 'formule') return { v: null, lib: '', brute: null, formule: true };
          var id = ent === 'patient' ? l.p.id : ent === 'medecin' ? l.m.id : l.a.id;
          var v = CH.typeSaisie(c) === 'COMPLEMENT' ? ((l.p && l.p.complements) || {})[c.id] : (((ctx.valeurs || {})[ent] || {})[id] || {})[c.id];
          var k = c.type === 'checklist' ? CH.checklist(c, v) : null;
          // Check-list : avancement affiché même sans case cochée (0/4), d'après le modèle
          return { v: v === undefined ? null : v, lib: k && k.total ? k.faits + '/' + k.total : (v === undefined || v === null ? '—' : (CH.lib(c, v) || '—')), brute: CH.brute(c, v), cle: v && v.id ? v.id : undefined,
            ctx: { avancement: k ? (k.total ? k.faits / k.total : null) : undefined, importance: c.type === 'notes' ? CH.importanceMax(v) : undefined } };
        } });
    });
    return cols;
  }
  function colonneDe(cat, code) { return cat.filter(function (c) { return c.code === code; })[0] || null; }

  // ------------------------------------------------------------ Lignes
  /** Lignes d'une vue : patients (périmètre, services), médecins (services) ou agents (services, comptes actifs). */
  function lignes(v, ctx) {
    var svs = v.services.length ? v.services : (ctx.services || []);
    if (v.lignes === 'medecins') return MED.liste(ctx.config).filter(function (m) { return m.actif && MED.enActivite(m, ctx.maintenant) && !m.aConfirmer && (!m.services.length || m.services.some(function (s) { return svs.indexOf(s) >= 0; })); }).map(function (m) { return { id: m.id, m: m }; });
    if (v.lignes === 'agents') {
      // Comptes des services de la vue, puis membres des groupes d'agents de ces services qui n'ont pas (encore) de compte
      var res = (ctx.comptes || []).filter(function (a) { return a && a.actif !== false && a.id !== 'secours' && (a.roles || []).indexOf('ADMIN') < 0 && (a.services || []).some(function (s) { return svs.indexOf(s) >= 0; }); })
        .map(function (a) { return { id: a.id, a: a }; });
      ((ctx.config && ctx.config.groupes) || []).forEach(function (g) {
        if (!g || g.actif === false || (g.services && g.services.length && !g.services.some(function (s) { return svs.indexOf(s) >= 0; }))) return;
        (g.membres || []).forEach(function (m) { if (m && m.id && !res.some(function (x) { return x.id === m.id; }) && !(ctx.comptes || []).some(function (c) { return c.id === m.id; })) res.push({ id: m.id, a: { id: m.id, nom: m.nom || m.id, roles: [], services: (g.services || []).slice() } }); });
      });
      return res.sort(function (x, y) { return String(x.a.nom).localeCompare(String(y.a.nom), 'fr'); });
    }
    return L.lignes(ctx.fiches || {}, { perimetre: v.perimetre, tri: 'patient' }, { maintenant: ctx.maintenant, services: svs, joursRecents: ctx.joursRecents || 7, nomMedecin: function (n) { return n ? MED.resoudre(ctx.config, n) : ''; } })
      .map(function (l) { l.id = l.p.id; return l; });
  }

  /**
   * Cellule : lecture de la colonne, calcul d'une formule (colonnes de la ligne que l'agent voit), couleur (règles de la
   * vue puis réglages de la donnée pour le service de la ligne). `cols` : colonnes visibles (pour les formules).
   */
  function cellule(col, l, ctx, vcol, cols) {
    var r = col.lire(l, vcol) || { v: null, lib: '—', brute: null };
    if (col.champ && col.champ.type === 'formule') {
      try {
        var res = F.evaluer(col.champ.formule, { maintenant: ctx.maintenant, valeur: function (nom) {
          var c = (cols || []).filter(function (x) { return x.libelle.toLowerCase() === nom.toLowerCase() || x.code === nom || (x.alias || []).indexOf(nom.toLowerCase()) >= 0; })[0];
          if (!c || c === col) { var e = new Error('Colonne « ' + nom + ' » inconnue ou non visible.'); e.formule = true; throw e; }
          if (c.champ && c.champ.type === 'formule') { var e2 = new Error('Une formule ne cite pas une autre formule (« ' + nom + ' »).'); e2.formule = true; throw e2; }
          return (c.lire(l) || {}).brute;
        } });
        r = { v: res, lib: res === null || res === undefined || res === '' ? '—' : F.texte(res), brute: typeof res === 'boolean' ? (res ? 1 : 0) : res };
      } catch (e) { if (!e.formule) throw e; r = { v: null, lib: '⚠', brute: null, erreur: e.message }; }
    }
    var code = col.reglage || ('vue.' + col.code), service = l.service || (l.m && l.m.services[0]) || ctx.service || null;
    var reg = CO.reglages(ctx.config, code, service, col.defaut);
    var cx = Object.assign({ valeur: r.brute !== undefined ? r.brute : r.v, cle: r.cle, maintenant: ctx.maintenant }, r.ctx || {});
    if ((col.type === 'date' || col.type === 'dateFenetre') && !col.delaiSuivi) {
      var jh = l.entree ? joursDepuis(l.entree, ctx.maintenant) : null, dc = CO.contexteDate(r.brute, reg.delai, jh, ctx.maintenant);
      cx.jours = dc.jours; if (reg.delai) cx.restants = dc.restants;
    }
    r.couleur = CO.evaluer(reg.regles, cx, vcol && vcol.regles);
    r.reglages = reg;
    return r;
  }

  // ------------------------------------------------------------ Groupes et tri
  function comparer(a, b) {
    if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
    if (b === null || b === undefined || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
  }
  function conditionVraie(cond, col, l, ctx) {
    if (!col) return false;
    var r = col.lire(l) || {}, val = r.brute !== undefined ? r.brute : r.v;
    if (cond.op === 'apresLe' || cond.op === 'avantLe') {
      // Seuil à la date et à l'heure près (décision 21) : une date sans heure vaut minuit
      var t = typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val) ? Date.parse(val.length === 10 ? val + 'T00:00' : val) : null, s = Date.parse(String(cond.valeur || ''));
      if (t === null || !isFinite(s)) return false;
      return cond.op === 'apresLe' ? t >= s : t < s;
    }
    var cx = Object.assign({ valeur: val, cle: r.cle, maintenant: ctx.maintenant }, r.ctx || {});
    return CO.vraie({ op: cond.op, valeur: cond.valeur, n: cond.n }, cx);
  }
  /**
   * Lignes rangées en groupes (décision 21, 33) : une ligne va dans le premier groupe dont les conditions sont vraies
   * (toutes, ou au moins une) ; les autres dans « Autres » (masquable). Tri de la vue gardé dans chaque groupe.
   * Rend [{ id, titre, lignes, autres }].
   */
  function ranger(v, ls, cat, ctx, cols) {
    var tri = colonneDe(cat, v.tri.colonne);
    var triees = ls.slice().sort(function (a, b) {
      var x = tri ? cellule(tri, a, ctx, null, cols).brute : null, y = tri ? cellule(tri, b, ctx, null, cols).brute : null;
      return v.tri.sens * comparer(x, y) || comparer(a.id, b.id);
    });
    if (!v.groupes.length) return [{ id: 'tous', titre: '', lignes: triees, autres: true }];
    var gs = v.groupes.map(function (g) { return { id: g.id, titre: g.titre, lignes: [], def: g }; }), autres = { id: 'autres', titre: v.autres.titre, lignes: [], autres: true };
    triees.forEach(function (l) {
      var g = gs.filter(function (x) {
        var cs = x.def.conditions; if (!cs.length) return false;
        var r = cs.map(function (c) { return conditionVraie(c, colonneDe(cat, c.colonne), l, ctx); });
        return x.def.combinaison === 'une' ? r.some(Boolean) : r.every(Boolean);
      })[0];
      (g || autres).lignes.push(l);
    });
    var res = gs.map(function (g) { return { id: g.id, titre: g.titre, lignes: g.lignes }; });
    if (!v.autres.masque) res.push(autres);
    return res;
  }

  // ------------------------------------------------------------ Synthèse
  /** Bandeau de synthèse (décision 27) : éléments choisis pour la vue, calculés sur les lignes affichées. */
  function synthese(v, ls, ctx) {
    if (v.lignes !== 'patients' || !v.synthese.length) return [];
    var svs = v.services.length ? v.services : (ctx.services || []), res = [];
    var presents = ls.filter(function (l) { return l.situation === 'hospitalise'; });
    v.synthese.forEach(function (k) {
      if (k === 'effectif') res.push({ code: k, libelle: 'Patients', valeur: String(presents.length) });
      if (k === 'places') { var s = K.situation(ctx.config, svs, ctx.maintenant, presents.length); res.push({ code: k, libelle: 'Places disponibles', valeur: s ? String(s.places) : 'capacité non renseignée', detail: s ? s.ouverts + ' lit(s) ouvert(s)' + (s.fermes ? ', ' + s.fermes + ' fermé(s)' : '') + (s.reserves ? ', ' + s.reserves + ' réservé(s)' : '') : '', alerte: !!s && s.places < 0 }); }
      if (k === 'sorties') {
        var auj = jourISO(ctx.maintenant), j7 = jourISO(ctx.maintenant + 7 * 864e5), n0 = 0, n7 = 0;
        presents.forEach(function (l) { var sp = (sejourEnCours(l.p) || {}).sortiePrevue; if (sp && sp.debut) { if (sp.debut <= auj) n0++; if (sp.debut <= j7) n7++; } });
        res.push({ code: k, libelle: 'Sorties prévues', valeur: n0 + ' aujourd’hui', detail: n7 + ' dans les 7 jours' });
      }
      if (k === 'parMode') { var m = {}; presents.forEach(function (l) { var x = l.mode || 'non renseigné'; m[x] = (m[x] || 0) + 1; }); res.push({ code: k, libelle: 'Par mode', valeur: Object.keys(m).sort().map(function (x) { return x + ' : ' + m[x]; }).join(', ') || '—' }); }
      if (k === 'parMedecin') { var d = {}; presents.forEach(function (l) { var x = nomMedecin(ctx, l.p.medecin1, l.p.medecin1Id) || 'sans médecin'; d[x] = (d[x] || 0) + 1; }); res.push({ code: k, libelle: 'Par médecin de 1re ligne', valeur: Object.keys(d).sort().map(function (x) { return x + ' : ' + d[x]; }).join(', ') || '—' }); }
      if (k === 'ageMoyen') { var ages = presents.map(function (l) { return l.age; }).filter(function (a) { return a !== null; }); res.push({ code: k, libelle: 'Âge moyen', valeur: ages.length ? (Math.round(ages.reduce(function (s, a) { return s + a; }, 0) / ages.length * 10) / 10).toString().replace('.', ',') + ' ans' : '—' }); }
    });
    return res;
  }

  // ------------------------------------------------------------ Instantanés
  /**
   * Prépare la clôture d'une vue : en-tête (journal du module) et parts par journal des colonnes, avec les valeurs
   * affichées et leur couleur. `colonnes` : [{ col, vcol }] lisibles par l'auteur ; `groupes` : sortie de `ranger`.
   * Rend { entete, parts: [{ journal, data }] } ; l'identité des patients et la synthèse vont dans la part du module Patients.
   */
  function preparerInstantane(v, groupes, colonnes, ctx, id) {
    var at = new Date(ctx.maintenant).toISOString(), parts = {};
    function part(j) { return parts[j] = parts[j] || { instantane: id, vue: v.id, journal: j, colonnes: [], valeurs: {} }; }
    var cols = colonnes.map(function (x) { return x.col; });
    colonnes.forEach(function (x) {
      var j = x.col.journal || (x.col.champ && x.col.champ.type === 'formule' ? journalFormule(x.col, cols) : 'patients');
      if (j === 'socle') j = 'vue';
      part(j).colonnes.push({ code: x.col.code, libelle: x.vcol.libelle || x.col.libelle });
      groupes.forEach(function (g) { g.lignes.forEach(function (l) {
        var c = cellule(x.col, l, ctx, x.vcol, cols), p = part(j);
        (p.valeurs[l.id] = p.valeurs[l.id] || {})[x.col.code] = c.couleur ? { lib: c.lib, couleur: c.couleur.couleur, rendu: c.couleur.rendu } : { lib: c.lib };
      }); });
    });
    var identites = {};
    groupes.forEach(function (g) { g.lignes.forEach(function (l) { identites[l.id] = l.p ? ((l.p.nom || '?') + ' ' + (l.p.prenom || '')).trim() : (l.m ? l.m.nom : l.a ? l.a.nom : l.id); }); });
    var jId = v.lignes === 'patients' ? 'patients' : 'vue';
    part(jId).identites = identites;
    if (v.lignes === 'patients') part('patients').synthese = synthese(v, [].concat.apply([], groupes.map(function (g) { return g.lignes; })), ctx);
    var entete = { id: id, vue: v.id, nom: v.nom, lignes: v.lignes, services: v.services.length ? v.services : (ctx.services || []), le: at, ordre: colonnes.map(function (x) { return x.col.code; }),
      largeurs: colonnes.reduce(function (m, x) { if (x.vcol.largeur) m[x.col.code] = x.vcol.largeur; return m; }, {}),
      groupes: groupes.map(function (g) { return { id: g.id, titre: g.titre, lignes: g.lignes.map(function (l) { return l.id; }) }; }), journaux: Object.keys(parts) };
    return { entete: entete, parts: Object.keys(parts).map(function (j) { return { journal: j, data: parts[j] }; }) };
  }
  /** Journal d'une colonne calculée : celui de la colonne citée la plus protégée (clé propre), sinon Patients. */
  function journalFormule(col, cols) {
    var refs = []; try { refs = F.references(col.champ.formule); } catch (e) { /* formule invalide : Patients */ }
    var j = 'patients';
    refs.forEach(function (n) { var c = cols.filter(function (x) { return x.libelle.toLowerCase() === n.toLowerCase(); })[0]; if (c && /^d-/.test(c.journal || '')) j = c.journal; });
    return j;
  }
  function appliquer(st, e) {
    var d = e.data || {};
    if (e.type === 'INSTANTANE' && d.id) st.instantanes[d.id] = Object.assign({ parts: {}, notes: [] }, st.instantanes[d.id] || {}, { entete: d, par: e.by, le: e.at, evt: e.id });
    if (e.type === 'INSTANTANE_PART' && d.instantane) { var i = st.instantanes[d.instantane] = st.instantanes[d.instantane] || { parts: {}, notes: [] }; i.parts[d.journal] = d; }
    if (e.type === 'INSTANTANE_NOTE' && d.instantane) { var n = st.instantanes[d.instantane] = st.instantanes[d.instantane] || { parts: {}, notes: [] }; n.notes.push({ texte: d.texte, par: e.by, le: e.at, evt: e.id }); }
  }
  function reduire(evts) { return N.reduire(evts, { etat: function () { return { instantanes: {} }; }, appliquer: appliquer }); }
  /** Instantanés d'une vue, du plus récent au plus ancien (en-tête lisible seulement). */
  function instantanes(st, idVue) {
    return Object.keys((st && st.instantanes) || {}).map(function (k) { return st.instantanes[k]; }).filter(function (i) { return i.entete && (!idVue || i.entete.vue === idVue); })
      .sort(function (a, b) { return String(b.entete.le).localeCompare(String(a.entete.le)); });
  }

  // ------------------------------------------------------------ Contrat
  var ACCES = [
    { code: 'vue.consulter', libelle: 'Consulter les vues d’ensemble et leurs instantanés', types: [] },
    { code: 'vue.annoter', libelle: 'Annoter un instantané clos (annotation datée)', types: ['INSTANTANE_NOTE'] }
  ];
  var DROITS = { IDE: [], AS: [], SECRETAIRE: [], CADRE: ['INSTANTANE_NOTE'] };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: [], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'vue', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.vue : undefined; },
    appartenance: 'acces'
  });
  /** Clôture d'un instantané : rôles réglés pour la vue (cadre par défaut) ; contrôlé par le module. */
  function permisPourSoi(type, data, compte, ctx) {
    if ((type !== 'INSTANTANE' && type !== 'INSTANTANE_PART') || !data || !compte) return false;
    return peutClore(vueDe(ctx.config, data.vue), compte);
  }
  function controler(type, d) {
    if (type === 'INSTANTANE' && (!d || !d.id || !d.vue || !Array.isArray(d.groupes))) throw new Error('Instantané incomplet.');
    if (type === 'INSTANTANE_PART' && (!d || !d.instantane || !d.journal)) throw new Error('Part d’instantané incomplète.');
    if (type === 'INSTANTANE_NOTE' && (!d || !d.instantane || !texte(d.texte))) throw new Error('Annotation vide.');
  }
  var contrat = {
    id: 'vue',
    libelle: 'Vue d’ensemble',
    version: '0.1.0',
    icone: 'VE',
    acces: ACCES,
    droits: D,
    saisies: { types: TYPES, champ: function () { return null; }, cibles: function () { return []; }, reduire: reduire, controler: controler, permisPourSoi: permisPourSoi },
    reglages: { defaut: {}, groupes: [], exclus: [], cadre: { vuesEnsemble: controlerCadre } },
    // Un onglet par vue (décision du porteur) : liste remplie par l'interface selon les vues de l'agent (ui-vue.js)
    vues: { onglets: [{ code: 'vues', libelle: 'Vues' }] },
    migrations: [],
    fournitures: [],
    besoins: [{ fourniture: 'patients.fiches', version: 1, obligatoire: true }]
  };
  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, LIGNES: LIGNES, PERIMETRES: PERIMETRES, SYNTHESE: SYNTHESE, vuesProposees: vuesProposees, normaliser: normaliser, vues: vues, vuesPour: vuesPour, vueDe: vueDe,
    peutRegler: peutRegler, peutClore: peutClore, controlerCadre: controlerCadre, catalogue: catalogue, colonneDe: colonneDe, lignes: lignes, cellule: cellule, ranger: ranger, synthese: synthese,
    preparerInstantane: preparerInstantane, instantanes: instantanes, largeur: largeur, conservationMois: conservationMois, auDelaConservation: auDelaConservation, jourISO: jourISO };
});
