// SPDX-License-Identifier: EUPL-1.2
/*
 * Agenda du service — étapes de validation d'une permission de sortie (0.21.0, décisions du porteur du 11 novembre 2026).
 *
 * Le processus dépend du mode d'hospitalisation et se règle (établissement, puis service par le cadre) :
 * `agendaReglages[niveau].processPermissions` = { libre | contrainte | sdre | 'mode:<code>': { etapes: [...] } }.
 * Une étape : { code, libelle, couleur, delai (heures avant le début où l'étape doit être atteinte ; absent : pas de
 * délai), tache (ce qu'il faut faire pour l'atteindre), roles (qui l'enregistre), retour (étape qui attend une réponse
 * extérieure : accord, refus, demande d'éléments complémentaires ou de 2e avis) }. La dernière étape vaut validation.
 *
 * Processus fournis (à faire relire par l'établissement) :
 * - soins libres : demandée → validation orale → bon de permission signé ;
 * - soins sans consentement hors SDRE (SDT, SDTU, SPI) : demandée → validation orale → certificat signé par le médecin →
 *   signé par le directeur (le certificat fait office de bon de sortie) ;
 * - SDRE : demandée → validation orale → certificat en attente de signature → envoyé à l'ARS → retour de l'ARS.
 * Aucune donnée clinique : la mention d'une demande de l'ARS est une précision courte d'organisation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).agendaPermissions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROLES_DEFAUT = ['IDE', 'SECRETAIRE', 'CADRE'];
  var FAMILLES = { libre: 'Soins libres', contrainte: 'Soins sans consentement (hors SDRE)', sdre: 'SDRE (décision du représentant de l’État)' };
  var RETOURS = { accord: 'Accord', refus: 'Refus', complement: 'Demande d’éléments complémentaires', avis: 'Demande d’un 2e avis' };
  var DEFAUT = {
    libre: [
      { code: 'demandee', libelle: 'Demandée', couleur: '#b97a00' },
      { code: 'orale', libelle: 'Validation orale', couleur: '#c9a227', tache: 'Demander l’accord du médecin' },
      { code: 'signe', libelle: 'Bon de permission signé', couleur: '#2e7d4f', tache: 'Bon de permission à faire signer', delai: 0 }],
    contrainte: [
      { code: 'demandee', libelle: 'Demandée', couleur: '#b97a00' },
      { code: 'orale', libelle: 'Validation orale', couleur: '#c9a227', tache: 'Demander l’accord du médecin' },
      { code: 'medecin', libelle: 'Certificat signé par le médecin', couleur: '#2c5c9b', tache: 'Certificat à faire signer par le médecin', delai: 24 },
      { code: 'directeur', libelle: 'Certificat signé par le directeur', couleur: '#2e7d4f', tache: 'Certificat à faire signer par le directeur', delai: 0 }],
    sdre: [
      { code: 'demandee', libelle: 'Demandée', couleur: '#b97a00' },
      { code: 'orale', libelle: 'Validation orale', couleur: '#c9a227', tache: 'Demander l’accord du médecin' },
      { code: 'asigner', libelle: 'Certificat en attente de signature', couleur: '#b0457a', tache: 'Certificat à rédiger et à faire signer' },
      { code: 'envoye', libelle: 'Certificat envoyé à l’ARS', couleur: '#2c5c9b', tache: 'Certificat à envoyer à l’ARS', delai: 48 },
      { code: 'retour', libelle: 'Accord de l’ARS', couleur: '#2e7d4f', tache: 'Retour de l’ARS à recevoir', delai: 0, retour: true }]
  };
  var COULEUR_REFUS = '#a12b2b';

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 80); }
  /** Étapes validées : au moins deux, codes uniques ; sinon null (le processus fourni s'applique). */
  function etapes(l) {
    if (!Array.isArray(l)) return null;
    var vus = {}, r = l.filter(function (e) { return e && /^[a-z][a-z0-9-]{1,20}$/.test(e.code || '') && texte(e.libelle) && !vus[e.code] && (vus[e.code] = 1); }).slice(0, 12).map(function (e) {
      var o = { code: e.code, libelle: texte(e.libelle), couleur: /^#[0-9a-fA-F]{6}$/.test(e.couleur || '') ? e.couleur : '#6b7280' };
      if (e.delai !== undefined && e.delai !== null && e.delai !== '' && isFinite(+e.delai)) o.delai = Math.max(0, Math.min(720, Math.round(+e.delai)));
      if (texte(e.tache, 120)) o.tache = texte(e.tache, 120);
      if (Array.isArray(e.roles) && e.roles.length) o.roles = e.roles.filter(function (x) { return typeof x === 'string'; }).slice(0, 20);
      if (e.retour) o.retour = true;
      return o;
    });
    return r.length >= 2 ? r : null;
  }
  /** Famille d'un mode d'hospitalisation : sdre, contrainte (autres soins sans consentement) ou libre. */
  function famille(config, mode) {
    if (/^SDRE/i.test(String(mode || ''))) return 'sdre';
    var def = ((config && config.modesHospitalisation) || []).filter(function (x) { return x.code === mode; })[0];
    return def && def.contrainte ? 'contrainte' : 'libre';
  }
  /** Processus d'un mode : réglage propre au mode, sinon celui de sa famille, sinon le processus fourni. `reglages` : du service. */
  function processus(config, reglages, mode) {
    var pr = (reglages && reglages.processPermissions) || {}, f = famille(config, mode);
    var propre = mode && pr['mode:' + mode] && etapes(pr['mode:' + mode].etapes), fam = pr[f] && etapes(pr[f].etapes);
    return { famille: f, cle: propre ? 'mode:' + mode : f, etapes: propre || fam || DEFAUT[f].map(function (e) { return Object.assign({}, e); }), regle: !!(propre || fam) };
  }
  /** Le processus le plus exigeant parmi les modes des patients d'une permission : SDRE, puis contrainte, puis libre. */
  function processusPour(config, reglages, modes) {
    var ordre = { sdre: 2, contrainte: 1, libre: 0 }, choisi = null;
    (modes && modes.length ? modes : ['']).forEach(function (m) { var p = processus(config, reglages, m); p.mode = m; if (!choisi || ordre[p.famille] > ordre[choisi.famille]) choisi = p; });
    return choisi;
  }
  function rolesEtape(e) { return e && e.roles && e.roles.length ? e.roles : ROLES_DEFAUT; }

  /**
   * État d'une permission pour une date. `suivi` : { etape, mention, historique } enregistré (absent : demandée) ;
   * `fait` : validation ou refus enregistrés ({ statut }). Renvoie l'étape atteinte, la suivante avec son échéance (début
   * moins son délai) et son niveau d'alerte, les tâches restantes, et ce qui est terminé ou refusé.
   */
  function etat(pr, suivi, fait, debut, maintenant) {
    var es = pr.etapes, refusee = !!fait && fait.statut === 'refusee';
    var i = suivi && suivi.etape ? Math.max(0, es.map(function (e) { return e.code; }).indexOf(suivi.etape)) : 0;
    if (fait && fait.statut === 'validee') i = es.length - 1;   // validée directement (saisies d'avant la 0.21.0)
    var terminee = !refusee && i === es.length - 1, suivante = terminee || refusee ? null : es[i + 1];
    var ech = suivante && suivante.delai !== undefined ? debut - suivante.delai * 36e5 : null;
    // Échéance la plus proche parmi les étapes restantes qui ont un délai (ex. envoi à l'ARS 48 h avant)
    var restantes = terminee || refusee ? [] : es.slice(i + 1), prochaineEch = null;
    restantes.forEach(function (e) { if (e.delai !== undefined) { var t = debut - e.delai * 36e5; if (prochaineEch === null || t < prochaineEch.quand) prochaineEch = { etape: e, quand: t }; } });
    var niveau = refusee ? 'refusee' : terminee ? 'validee' : (maintenant === undefined || !prochaineEch ? 'attente' : maintenant > prochaineEch.quand ? 'retard' : prochaineEch.quand - maintenant < 864e5 ? 'proche' : 'attente');
    return {
      processus: pr, index: i, etape: es[i], suivante: suivante, echeanceSuivante: ech, prochaineEcheance: prochaineEch, niveau: niveau, terminee: terminee, refusee: refusee,
      couleur: refusee ? COULEUR_REFUS : es[i].couleur, libelle: refusee ? 'Refusée' : es[i].libelle, mention: (suivi && suivi.mention) || '', historique: (suivi && suivi.historique) || [],
      taches: restantes.filter(function (e) { return e.tache; }).map(function (e) { return { etape: e.code, libelle: e.tache, echeance: e.delai !== undefined ? debut - e.delai * 36e5 : null, delaiJours: e.delai !== undefined ? Math.ceil(e.delai / 24) : 0 }; })
    };
  }

  /**
   * Contrôle d'un changement d'étape : étape du processus, rôle permis, retour demandé seulement à une étape « retour ».
   * `d` : { etape, retourARS (accord | refus | complement | avis), mention }.
   */
  function controler(pr, d, roles) {
    var e = pr.etapes.filter(function (x) { return x.code === d.etape; })[0];
    if (!e) throw new Error('Étape inconnue pour ce processus de permission.');
    if (!rolesEtape(e).some(function (r) { return (roles || []).indexOf(r) >= 0; })) throw new Error('Votre rôle n’enregistre pas l’étape « ' + e.libelle + ' ».');
    if (d.retourARS && !RETOURS[d.retourARS]) throw new Error('Retour inconnu.');
    if ((d.retourARS === 'complement' || d.retourARS === 'avis') && !texte(d.mention, 200)) throw new Error('Précisez la demande (court, sans donnée de santé).');
  }
  /** Applique un changement d'étape au suivi d'une date ; renvoie le nouveau suivi. */
  function appliquer(suivi, d, e) {
    var s = { etape: d.etape, mention: texte(d.mention, 200), historique: ((suivi && suivi.historique) || []).slice(-30) };
    s.historique.push({ etape: d.etape, par: e.by, le: e.at, nom: texte(d.nom), retour: RETOURS[d.retourARS] ? d.retourARS : undefined, mention: s.mention || undefined });
    return s;
  }
  /** Étape où revenir après une demande d'éléments complémentaires ou de 2e avis : la dernière avant l'envoi, sinon la 2e. */
  function etapeApresDemande(pr) {
    var es = pr.etapes, i = es.map(function (e) { return !!e.retour; }).indexOf(true);
    return es[Math.max(1, i - 2)] || es[0];
  }

  return { ROLES_DEFAUT: ROLES_DEFAUT, FAMILLES: FAMILLES, RETOURS: RETOURS, DEFAUT: DEFAUT, COULEUR_REFUS: COULEUR_REFUS, etapes: etapes, famille: famille, processus: processus,
    processusPour: processusPour, rolesEtape: rolesEtape, etat: etat, controler: controler, appliquer: appliquer, etapeApresDemande: etapeApresDemande };
});
