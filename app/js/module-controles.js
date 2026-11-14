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
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).controles = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE'];
  // Liste provisoire : le porteur fournira la sienne (14 novembre 2026) ; modifiable par l'établissement et le cadre.
  var LISTE_PROVISOIRE = ['Matelas et literie en place', 'Aucun objet dangereux dans la chambre', 'Éclairage fonctionnel', 'Appel malade fonctionnel',
    'Sanitaires propres et fonctionnels', 'Visibilité par l’oculus', 'Matériel de contention complet et vérifié', 'Horloge visible depuis le lit'];
  var MODELES = {
    csiLibre: { libelle: 'Contrôle de la CSI libre', court: 'CSI libre', liste: true, deuxAgents: true },
    surveillance: { libelle: 'Passage de surveillance de la CSI', court: 'Surveillance', liste: false, deuxAgents: false },
    // Contrôle à la libération (décision du porteur du 14 novembre 2026) : même check-list, quand une mesure se termine dans la CSI
    liberation: { libelle: 'Contrôle de la CSI à sa libération', court: 'Libération', liste: true, deuxAgents: true }
  };
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
        st.controles[d.id] = { id: d.id, modele: d.modele, service: d.service || '', lieu: texte(d.lieu, 60), date: String(d.date || '').slice(0, 10), poste: texte(d.poste, 20),
          libellePoste: texte(d.libellePoste, 40), items: Array.isArray(d.items) ? d.items.slice(0, 40).map(function (x) { return { libelle: texte(x && x.libelle, 120), ok: !!(x && x.ok) }; }) : [],
          ecart: texte(d.ecart, MAX_TEXTE), deuxAgents: !!d.deuxAgents, par: e.by, nom: texte(d.nom, 80), le: e.at, confirmePar: '', nomConfirme: '', confirmeLe: '', annule: null };
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
  function reduire(evts) { return N.reduire(evts, { cle: 'controles', etat: function () { return { controles: {} }; }, appliquer: appliquer }); }

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
  function lignesExport(liste, libService) {
    var ls = libService || function (x) { return x; };
    return [['Date du poste', 'Poste', 'Service', 'Lieu', 'Contrôle', 'Fait par', 'Fait le', 'Confirmé par', 'Confirmé le', 'Conforme', 'Points non conformes', 'Écart', 'Annulé']].concat(liste.map(function (c) {
      return [c.date, c.libellePoste || c.poste, ls(c.service), c.lieu, MODELES[c.modele].libelle, c.nom, String(c.le).replace('T', ' ').slice(0, 16), c.nomConfirme, String(c.confirmeLe || '').replace('T', ' ').slice(0, 16),
        MODELES[c.modele].liste ? (nonConforme(c) ? 'non' : 'oui') : '', c.items.filter(function (x) { return !x.ok; }).map(function (x) { return x.libelle; }).join(' ; '), c.ecart,
        c.annule ? 'oui (' + c.annule.motif + ')' : ''];
    }));
  }

  // ------------------------------------------------------------ Contrôles des saisies
  function controler(type, d, ctx) {
    var st = (ctx && ctx.etat) || { controles: {} }, moi = ctx && ctx.compte && ctx.compte.id;
    if (type === 'CONTROLE') {
      if (!d.id || st.controles[d.id]) throw new Error('Contrôle déjà enregistré : il ne se modifie pas (l’annuler puis le refaire).');
      if (!MODELES[d.modele]) throw new Error('Contrôle inconnu.');
      if (!d.service || !d.lieu || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) || !d.poste) throw new Error('Indiquez le service, la chambre et le poste.');
      if (valides(st).some(function (c) { return c.service === d.service && c.date === d.date && c.poste === d.poste && c.lieu === d.lieu && c.modele === d.modele; })) throw new Error('Ce contrôle est déjà fait pour ce poste.');
      if (MODELES[d.modele].liste) {
        if (!Array.isArray(d.items) || !d.items.length) throw new Error('Cochez chaque point de la liste.');
        if (d.items.some(function (x) { return !x || typeof x.ok !== 'boolean'; })) throw new Error('Indiquez pour chaque point : conforme ou non conforme.');
        if (d.items.some(function (x) { return !x.ok; }) && !texte(d.ecart, MAX_TEXTE)) throw new Error('Décrivez l’écart constaté (point non conforme).');
      }
      if (String(d.ecart || '').length > MAX_TEXTE) throw new Error('Commentaire trop long (1 000 caractères au plus).');
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
    { code: 'controles.faire', libelle: 'Faire les contrôles et noter les passages de surveillance, confirmer en second agent, annuler les siens', types: ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE'] },
    { code: 'controles.encadrer', libelle: 'Annuler tout contrôle du service, suivre les retards et les écarts, exporter le registre', types: ['CONTROLE_ANNULE_TOUS'] }
  ];
  var FAIRE = ['CONTROLE', 'CONTROLE_CONFIRME', 'CONTROLE_ANNULE'], DROITS = { IDE: FAIRE.slice(), AS: FAIRE.slice(), CADRE: FAIRE.concat(['CONTROLE_ANNULE_TOUS']), CADRE_SUP: ['CONTROLE_ANNULE_TOUS'], DIRECTEUR_SOINS: [] };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: TYPES.concat(['CONTROLE_ANNULE_TOUS']), rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'controles', rolesEncadrement: ['CADRE', 'CADRE_SUP'], inactifParDefaut: true,
    lireAcces: function (r) { return r.accesModules ? r.accesModules.controles : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) {
    var d = e.data || {}, c = e.type === 'CONTROLE' ? null : st && st.controles && st.controles[d.controle];
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
    vues: { onglets: [{ code: 'poste', libelle: 'Poste en cours' }, { code: 'registre', libelle: 'Registre' }] },
    migrations: [],
    fournitures: [],
    besoins: [{ fourniture: 'isocont.occupationsCSI', version: 1, obligatoire: false }]
  };

  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, droits: D, ACCES: ACCES, TYPES: TYPES, MODELES: MODELES, LISTE_PROVISOIRE: LISTE_PROVISOIRE,
    options: options, csiDu: csiDu, echeances: echeances, aFaire: aFaire, retards: retards, registre: registreDe, lignesExport: lignesExport,
    complet: complet, nonConforme: nonConforme, horsConservation: horsConservation, controler: controler, controlerCadre: controlerCadre };
});
