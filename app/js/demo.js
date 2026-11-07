// SPDX-License-Identifier: EUPL-1.2
/*
 * Données fictives de démonstration. Aucun nom réel : patients, soignants et
 * psychiatres sont inventés et marqués comme tels.
 */
(function (root) {
  'use strict';
  var SIC = root.SIC = root.SIC || {};
  var H = 3600 * 1000, J = 24 * H;

  /**
   * Saisies fictives, relatives à l'instant présent.
   * options.config : paramétrage réel à reprendre (jeu de formation) ; sinon, paramétrage de démonstration.
   */
  SIC.donneesFictives = function (options) {
    options = options || {};
    var reel = options.config || null;
    var now = Date.now();
    var arrondi = function (ms) { return Math.round(ms / (15 * 60000)) * 15 * 60000; };
    var t = function (h) { return arrondi(now + h * H); };
    var seq = 0;
    var file = [];
    function ajouter(at, type, data) { file.push({ at: at, type: type, data: data, n: seq++ }); }

    var cfg = function (cle, valeur) { ajouter(t(-24 * 300), 'CONFIG', { cle: cle, valeur: valeur }); };
    var U1 = 'U1', U2 = 'U2', CSI1 = 'CSI 1', CSI2 = 'CSI 2', CSIA = 'CSI A';
    var periodes = [['M', 7], ['AM', 14], ['N', 21]];
    if (reel) {
      // Jeu de formation : mêmes services, CSI et postes que les données réelles, contenu fictif.
      ['services', 'modulesServices', 'fichePatient', 'importPatients', 'patientsListe', 'agenda', 'lieuxCSI', 'periodes', 'periodesService', 'modesHospitalisation', 'parametres', 'delaiModeHospiHeures', 'decompte', 'inactiviteMinutes', 'pauses', 'imagesDecompte', 'colonnesPatients', 'casParticuliers', 'qualite', 'statsMethode', 'informateursTiers', 'lieuIsolement', 'organisationJLD', 'verificationVersion', 'listes', 'vigilance', 'affichage', 'roles', 'surveillance', 'exports'].forEach(function (k) {
        if (reel[k] !== undefined) cfg(k, reel[k]);
      });
      // Alertes : seules les mesures saisies pendant la formation les déclenchent.
      if (reel.alertes !== undefined) cfg('alertes', reel.alertes.map(function (r) { return Object.assign({}, r, { depuis: r.active ? now : 0 }); }));
      cfg('etablissement', ((reel.etablissement || '') + ' — FORMATION').replace(/^ — /, ''));
      var svs = (reel.services || []).map(function (x) { return x.code; });
      if (!svs.length) { svs = ['U1']; cfg('services', [{ code: 'U1', libelle: 'Unité 1 (fictive)' }]); }
      U1 = svs[0]; U2 = svs[1] || svs[0];
      var l1 = ((reel.lieuxCSI || {})[U1] || []), l2 = ((reel.lieuxCSI || {})[U2] || []);
      CSI1 = l1[0] || 'CSI 1'; CSI2 = l1[1] || l1[0] || 'CSI 2'; CSIA = l2[0] || 'CSI A';
      var lieux = JSON.parse(JSON.stringify(reel.lieuxCSI || {}));
      [[U1, CSI1], [U1, CSI2], [U2, CSIA]].forEach(function (x) { lieux[x[0]] = lieux[x[0]] || []; if (lieux[x[0]].indexOf(x[1]) < 0) lieux[x[0]].push(x[1]); });
      cfg('lieuxCSI', lieux);
      periodes = SIC.model.periodesDe(reel, U1).map(function (p) { return [p.code, +p.debut.split(':')[0]]; });
    } else {
      cfg('services', [{ code: 'U1', libelle: 'Unité 1 (fictive)' }, { code: 'U2', libelle: 'Unité 2 (fictive)' }]);
      cfg('etablissement', 'Établissement fictif de démonstration');
      cfg('lieuxCSI', { U1: ['CSI 1', 'CSI 2'], U2: ['CSI A'] });
      // Démonstration : information du cadre ou de l'administrateur de garde pour un patient en soins libres (Unité 1)
      cfg('alertes', SIC.model.CONFIG_DEFAUT.alertes.map(function (r) {
        return r.declencheur === 'soins-libres' ? Object.assign({}, r, { active: true, services: ['U1'], depuis: now }) : Object.assign({}, r, { depuis: r.active ? now : 0 });
      }));
    }
    cfg('psychiatres', ['Dr Arnaud (fictif)', 'Dr Benoît (fictif)', 'Dr Chen (fictif)', 'Dr Diallo (fictif)']);

    var patients = [
      ['P01', '900101', 'ALPHA', 'Camille', 'SDT', U1, 41],
      ['P02', '900102', 'BRAVO', 'Dominique', 'SPI', U1, 33],
      ['P03', '900103', 'CHARLIE', 'Sacha', 'SL', U1, 48],
      ['P04', '900104', 'DELTA', 'Alix', 'SDRE', U2, 66],
      ['P05', '900105', 'ECHO', 'Noa', 'SDTU', U1, 16],
      ['P06', '900106', 'FOXTROT', 'Eden', 'SDT', U2, 27]
    ];
    patients.forEach(function (p, i) {
      var dn = new Date(now); dn.setFullYear(dn.getFullYear() - p[6]); dn.setMonth((i * 5) % 12, 3 + i * 4);
      if (dn.getTime() > now - p[6] * 365.25 * J) dn.setFullYear(dn.getFullYear() - 1);   // âge révolu = p[6]
      ajouter(t(-24 * 280 + i), 'PATIENT', { patientId: p[0], ipp: p[1], nom: p[2] + ' (fictif)', prenom: p[3], naissance: SIC.model.dateLocaleISO(dn.getTime()), protection: i === 3 ? 'Curatelle' : '', service: p[5] });
      ajouter(t(-24 * 280 + i), 'MODE_HOSPI', { patientId: p[0], mode: p[4], date: t(-24 * 400) });
    });

    // Fiche commune enrichie (0.10.0) : séjours avec chambre et lit, psychologue référent, suivi par l'assistant(e) social(e),
    // référents ; deux patients sortis (récemment, et il y a trois semaines) pour la liste des patients
    var jISO = function (h) { return SIC.model.dateLocaleISO(t(h)); };
    var complements = {
      P01: { chambre: '12', lit: 'P', entree: -24 * 40, psychologue: 'Mme Psy (fictif)', suiviAS: { suivi: true, nom: 'M. Social (fictif)' }, referents: [{ id: null, nom: 'Agent A (fictif)' }], medecin1: 'Dr Arnaud (fictif)' },
      P02: { chambre: '14', lit: '', entree: -24 * 35, psychologue: 'Mme Psy (fictif)', referents: [{ id: null, nom: 'Agent C (fictif)' }], medecin1: 'Dr Benoît (fictif)' },
      P03: { chambre: '8', lit: 'F', entree: -24 * 60, suiviAS: { suivi: false, nom: '' }, medecin1: 'Dr Chen (fictif)' },
      P04: { chambre: 'A3', lit: '', entree: -24 * 20, psychologue: 'M. Psy (fictif)', suiviAS: { suivi: true, nom: '' }, medecin1: 'Dr Diallo (fictif)' },
      P05: { chambre: '10', lit: 'P', entree: -24 * 8, referents: [{ id: null, nom: 'Agent E (fictif)' }], medecin1: 'Dr Chen (fictif)' },
      P06: { chambre: 'A5', lit: '', entree: -24 * 12, medecin1: 'Dr Diallo (fictif)' }
    };
    patients.forEach(function (p) {
      var c = complements[p[0]];
      ajouter(t(-24 * 279), 'PATIENT', { patientId: p[0], medecin1: c.medecin1, referents: c.referents || [], psychologue: c.psychologue || '', suiviAS: c.suiviAS || null });
      ajouter(t(c.entree), 'SEJOUR', { patientId: p[0], sejourId: 'S' + p[0], iep: '7' + p[1], entree: jISO(c.entree), service: p[5], chambre: c.chambre, lit: c.lit });
    });
    [['P07', '900107', 'GOLF', 'Ilan', 'SL', U1, 52, -24 * 15, -24 * 3, '6'], ['P08', '900108', 'HOTEL', 'Maé', 'SDT', U1, 29, -24 * 50, -24 * 21, '3']].forEach(function (p) {
      ajouter(t(p[7]), 'PATIENT', { patientId: p[0], ipp: p[1], nom: p[2] + ' (fictif)', prenom: p[3], naissance: SIC.model.dateLocaleISO(now - p[6] * 365.25 * J - 40 * J), service: p[5], medecin1: 'Dr Arnaud (fictif)' });
      ajouter(t(p[7]), 'MODE_HOSPI', { patientId: p[0], mode: p[4], date: t(p[7]) });
      ajouter(t(p[8]), 'SEJOUR', { patientId: p[0], sejourId: 'S' + p[0], iep: '7' + p[1], entree: jISO(p[7]), sortie: jISO(p[8]), service: p[5], chambre: p[9] });
    });
    // Rappel : P01 soins sans consentement (SDT), P03 soins libres, P04 SDRE (Unité 2)

    var nMes = 0;
    function mesure(patientId, service, type, debutH, finH, lieu, psy, opts) {
      opts = opts || {};
      var id = 'M' + String(++nMes).padStart(3, '0');
      var csi = lieu.indexOf('Chambre ') !== 0;   // les lieux hors CSI sont écrits « Chambre n »
      ajouter(t(debutH), 'MESURE_DEBUT', { mesureId: id, patientId: patientId, service: service, typeMesure: type, debut: t(debutH), lieu: csi ? lieu : 'Chambre ' + lieu.replace(/^Chambre /, ''), csi: csi, psychiatre: psy, exception: !!opts.exception, modeHospi: '' });
      if (opts.tiers) ajouter(t(debutH + 1), 'TIERS', { mesureId: id, cycle: 1, statut: opts.tiers, personne: opts.personne || '', informateur: opts.informateur || 'PSYCHIATRE', nomInformateur: opts.informateur === 'IDE' ? '' : psy, date: t(debutH + 1) });
      (opts.jld || []).forEach(function (j) { ajouter(t(j[2]), 'JLD', { mesureId: id, cycle: j[0], nature: j[1], date: t(j[2]), decision: j[3] || null }); });
      (opts.pauses || []).forEach(function (pz) {
        ajouter(t(pz[0]), 'PAUSE', { mesureId: id, debut: t(pz[0]), reprisePrevue: t(pz[1]), psychiatre: psy, motif: pz[3] || '' });
        if (pz[2] !== null) ajouter(t(pz[2]), 'REPRISE', { mesureId: id, date: t(pz[2]) });
      });
      if (finH !== null) ajouter(t(finH), 'MESURE_FIN', { mesureId: id, fin: t(finH), psychiatre: psy });
      return id;
    }

    // Historique de l'année (registre) — Unité 1
    var debutAnnee = (new Date(new Date(now).getFullYear(), 0, 1).getTime() - now) / H;
    var hist = Math.min(-24 * 20, debutAnnee + 24 * 20);
    mesure('P03', U1, 'Isolement', hist, hist + 18, CSI1, 'Dr Arnaud (fictif)', { tiers: 'INFORME', personne: 'Mère' });
    mesure('P02', U1, 'Isolement', hist + 24 * 30, hist + 24 * 31 + 6, CSI2, 'Dr Benoît (fictif)', { tiers: 'TENTATIVE', informateur: 'IDE' });
    mesure('P02', U1, 'Contention', hist + 24 * 30 + 4, hist + 24 * 30 + 10, CSI2, 'Dr Benoît (fictif)', { tiers: 'INFORME', personne: 'Frère' });
    mesure('P05', U1, 'Contention', hist + 24 * 60, hist + 24 * 60 + 3, 'Chambre 12', 'Dr Chen (fictif)', { exception: true, tiers: 'PAS_DE_TIERS' });
    mesure('P01', U1, 'Isolement', hist + 24 * 90, hist + 24 * 90 + 9, 'Chambre 8', 'Dr Arnaud (fictif)', { tiers: 'REFUS_PATIENT' });

    // Mesures récentes
    // ALPHA : isolement terminé il y a 10 jours (20 h), puis isolement en cours depuis 60 h
    mesure('P01', U1, 'Isolement', -24 * 10 - 20, -24 * 10, CSI1, 'Dr Arnaud (fictif)', { tiers: 'INFORME', personne: 'Sœur' });
    mesure('P01', U1, 'Isolement', -60, null, CSI1, 'Dr Arnaud (fictif)', {
      tiers: 'INFORME', personne: 'Sœur',
      jld: [[1, 'INFO', -33], [1, 'SAISINE', -10]],
      pauses: [[-28, -27, -27, 'Repas'], [-8, -7.5, -7.25, 'Hygiène, douche']]
    });
    // BRAVO : isolement depuis 26 h, contention en CSI depuis 20 h
    mesure('P02', U1, 'Isolement', -26, null, CSI2, 'Dr Benoît (fictif)', { tiers: 'INFORME', personne: 'Frère' });
    mesure('P02', U1, 'Contention', -20, null, CSI2, 'Dr Benoît (fictif)');
    // CHARLIE : isolement hors CSI terminé il y a 3 jours
    mesure('P03', U1, 'Isolement', -24 * 3 - 10, -24 * 3, 'Chambre 14', 'Dr Chen (fictif)', { tiers: 'PAS_DE_TIERS' });
    // DELTA (Unité 2) : isolement long, maintien du JLD au cycle 1
    mesure('P04', U2, 'Isolement', -110, null, CSIA, 'Dr Diallo (fictif)', {
      tiers: 'INFORME', personne: 'Curateur',
      jld: [[1, 'INFO', -64], [1, 'SAISINE', -40], [1, 'DECISION', -16, 'MAINTIEN']],
      pauses: [[-0.75, 1.25, null, 'Visite']]
    });

    // Professionnels en CSI — Unité 1, derniers postes (certains incomplets)
    var noms = [['Agent A (fictif)', 'IDE'], ['Agent B (fictif)', 'AS'], ['Agent C (fictif)', 'IDE'], ['Agent D (fictif)', 'AS'], ['Agent E (fictif)', 'IDE']];
    for (var jour = 2; jour >= 0; jour--) {
      var d = new Date(now - jour * J);
      var dateISO = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      periodes.forEach(function (p, i) {
        var debutPoste = new Date(d.getFullYear(), d.getMonth(), d.getDate(), p[1]).getTime();
        if (debutPoste > now - 2 * H) return;
        var nb = (jour === 0 && i > 0) ? 1 : 2;
        for (var k = 0; k < nb; k++) {
          var a = noms[(jour * 3 + i + k) % noms.length];
          ajouter(debutPoste + H + k * 60000, 'PROFESSIONNEL', { service: U1, date: dateISO, periode: p[0], nom: a[0], fonction: a[1] });
        }
      });
    }

    // ------------------------------------------------------------ Agenda (0.10.0) : un exemple de chaque cas de figure
    var minuitAuj = new Date(now); minuitAuj.setHours(0, 0, 0, 0);
    var jour = function (n, heure, minute) { var d = new Date(minuitAuj.getTime()); d.setDate(d.getDate() + n); d.setHours(heure || 0, minute || 0, 0, 0); return d.getTime(); };
    var lundi = (function () { var d = new Date(minuitAuj.getTime()); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; })();
    var lundiDe = function (n, heure, minute) { var d = new Date(lundi.getTime()); d.setDate(d.getDate() + n); d.setHours(heure || 0, minute || 0, 0, 0); return d.getTime(); };
    var avant = t(-24 * 3), nR = 0;
    function rdv(d) { d.id = 'RD' + String(++nR).padStart(3, '0'); ajouter(avant, 'RDV', d); return d.id; }
    var profA = { id: null, nom: 'Agent A (fictif)' }, profC = { id: null, nom: 'Agent C (fictif)' };
    // Réunions répétées : chaque jour ouvré, chaque lundi, le 1er mardi du mois
    rdv({ nature: 'reunion', titre: 'Transmissions', debut: lundiDe(-14, 9), fin: lundiDe(-14, 9, 30), lieu: 'Salle de soins', service: U1, regularite: { type: 'semaine', jours: [1, 2, 3, 4, 5] } });
    rdv({ nature: 'reunion', titre: 'Synthèse clinique', debut: lundiDe(-14, 14), fin: lundiDe(-14, 15), lieu: 'Salle de réunion', service: U1, regularite: { type: 'semaine', jours: [1] } });
    rdv({ nature: 'reunion', titre: 'Réunion institutionnelle', debut: lundiDe(-35, 14), fin: lundiDe(-35, 15, 30), lieu: 'Salle de réunion', service: U1, regularite: { type: 'rangPeriode', rang: 1, jour: 2, periode: 'mois' } });
    rdv({ nature: 'reunion', titre: 'Réunion de pôle', debut: lundiDe(-100, 10), fin: lundiDe(-100, 12), lieu: 'Salle du pôle (fictive)', service: U1, regularite: { type: 'rangPeriode', rang: 1, jour: 4, periode: 'trimestre' } });
    // Accompagnement avec un accompagnateur à trouver (bouton « S'inscrire »)
    rdv({ nature: 'accompagnement', titre: 'Consultation extérieure', debut: jour(1, 10), fin: jour(1, 12), lieu: 'Hôpital général (fictif)', service: U1, patients: ['P03'], accompagnateurs: 1 });
    // Activité répétée mardi et vendredi, deux accompagnateurs, un agent déjà inscrit cette semaine
    var piscine = rdv({ nature: 'activite', titre: 'Piscine', debut: lundiDe(-6, 14), fin: lundiDe(-6, 16), lieu: 'Piscine municipale (fictive)', service: U1, patients: ['P01', 'P05'], accompagnateurs: 2, regularite: { type: 'semaine', jours: [2, 5] } });
    ajouter(avant, 'INSCRIPTION', { rdv: piscine, occurrence: SIC.model.dateLocaleISO(lundiDe(1, 12)), agent: 'demo-b', nom: 'Agent B (fictif)', service: U1 });
    rdv({ nature: 'activite', titre: 'Atelier terre', debut: lundiDe(2, 10, 30), fin: lundiDe(2, 11, 30), lieu: 'Salle d’activités', service: U1, patients: ['P01', 'P02', 'P05'], professionnels: [profC], regularite: { type: 'semaine', jours: [3], intervalle: 2 } });
    // Entretiens : médical avec la famille (deux professionnels), infirmier individuel
    rdv({ nature: 'entretien', entretien: { type: 'medical', avec: 'famille' }, titre: '', debut: jour(1, 11), fin: jour(1, 12), lieu: 'Bureau médical', service: U1, patients: ['P01'], professionnels: [{ id: null, nom: 'Dr Arnaud (fictif)' }, profA] });
    rdv({ nature: 'entretien', entretien: { type: 'infirmier', avec: 'individuel' }, titre: '', debut: jour(0, 15), fin: jour(0, 15, 45), lieu: 'Bureau infirmier', service: U1, patients: ['P05'], professionnels: [profC] });
    // Permissions : demande d'un patient en SDRE (validation 48 h avant), demande en SDT, permission de week-end validée
    rdv({ nature: 'permission', titre: '', debut: jour(2, 14), fin: jour(2, 18), service: U2, patients: ['P04'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    rdv({ nature: 'permission', titre: 'Permission en famille', debut: jour(4, 10), fin: jour(4, 17), service: U1, patients: ['P01'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    var samedi = (6 - new Date(now).getDay() + 7) % 7 || 7;
    var permWe = rdv({ nature: 'permission', titre: 'Permission de week-end', debut: jour(samedi, 10), fin: jour(samedi + 1, 18), service: U2, patients: ['P06'], validations: [{ id: 'pv', type: 'permission', libelle: '' }] });
    ajouter(avant, 'VALIDATION', { rdv: permWe, validation: 'pv', occurrence: SIC.model.dateLocaleISO(jour(samedi)), statut: 'validee', nom: 'Dr Diallo (fictif)', service: U2 });
    // Examen (VSL à réserver, patient accompagné) ; audience JLD (deux patients, deux VSL réservés, soignants à prévoir)
    rdv({ nature: 'examen', examen: { type: 'Scanner' }, titre: '', debut: jour(2, 9, 30), fin: jour(2, 11), lieu: 'Hôpital général (fictif), imagerie', service: U1, patients: ['P02'], accompagnateurs: 1, transports: [{ id: 'tv', type: 'vsl', nombre: 1, precision: 'Aller-retour' }] });
    // Audience JLD chaque mercredi 9 h 30 - 12 h (réglages propres à chaque date : patients, VSL, accompagnateurs ; une date
    // décalée, une date annulée faute de patient convoqué ; sans patient prévu, la date s'affiche en transparence)
    var mercredi = function (n) { return lundiDe(2 + 7 * n); };
    var audience = rdv({ nature: 'audience', titre: '', debut: lundiDe(-12, 9, 30), fin: lundiDe(-12, 12), lieu: 'Salle d’audience de l’hôpital (fictive)', service: U1, patients: [], accompagnateurs: 1, transports: [], regularite: { type: 'semaine', jours: [3] } });
    var occ1 = SIC.model.dateLocaleISO(mercredi(1)), occ2 = SIC.model.dateLocaleISO(mercredi(2)), occ3 = SIC.model.dateLocaleISO(mercredi(3));
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ1, patients: ['P01', 'P02'], accompagnateurs: 2, professionnels: [profA], transports: [{ id: 'ta', type: 'vsl', nombre: 2, precision: 'Départ 9 h' }], service: U1 });
    ajouter(avant, 'TRANSPORT', { rdv: audience, transport: 'ta', occurrence: occ1, statut: 'reserve', precision: 'Ambulances du centre (fictif), n° 1234', service: U1 });
    if (options.moi && options.moi.id) ajouter(avant, 'INSCRIPTION', { rdv: audience, occurrence: occ1, agent: options.moi.id, nom: options.moi.nom || '', service: U1 });
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ2, annulee: true, motifAnnulation: 'Aucun patient convoqué', service: U1 });
    ajouter(avant, 'OCCURRENCE', { rdv: audience, occurrence: occ3, debut: mercredi(3) + 864e5 + 14 * 36e5, fin: mercredi(3) + 864e5 + 16 * 36e5, patients: ['P04'], transports: [{ id: 'tb', type: 'vsl', nombre: 1 }], service: U1 });
    // Sortie du patient avec sa check-list (un point déjà fait)
    var sortie = rdv({ nature: 'sortie', titre: 'Sortie', debut: jour(3, 11), fin: jour(3, 11, 30), service: U1, patients: ['P03'], validations: [{ id: 'va', type: 'medicale', libelle: 'Avis du psychiatre pour la sortie', delai: 48 }],
      checklist: SIC.agenda && SIC.agenda.CHECKLISTS_DEFAUT ? SIC.agenda.CHECKLISTS_DEFAUT[0].items.map(function (it, i) { return { id: 'c' + i, libelle: it.libelle, delai: it.delai }; }) : [] });
    ajouter(avant, 'CHECK', { rdv: sortie, item: 'c0', occurrence: SIC.model.dateLocaleISO(jour(3)), fait: true, service: U1 });
    // Tâches du service (récurrentes) et de l'équipe (ponctuelle)
    var nT = 0;
    function tache(type, d) { d.id = 'TA' + String(++nT).padStart(3, '0'); d.pour = d.pour || { roles: [], agents: [] }; ajouter(avant, type, d); }
    tache('TACHE', { titre: 'Vérification du réfrigérateur à pharmacie', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '08:00', regularite: { type: 'jour' } });
    tache('TACHE', { titre: 'Commande de pharmacie', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '', regularite: { type: 'semaine', jours: [1] }, consigne: 'Avant midi' });
    tache('TACHE', { titre: 'Piluliers de la semaine', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-14)), heure: '16:00', regularite: { type: 'semaine', jours: [2, 5] }, pour: { roles: ['IDE'], agents: [] } });
    tache('TACHE', { titre: 'Contrôle du chariot d’urgence', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-35)), heure: '10:00', regularite: { type: 'rangPeriode', rang: -1, jour: 5, periode: 'mois' } });
    tache('TACHE', { titre: 'Inventaire du linge', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-35)), heure: '', regularite: { type: 'rangPeriode', rang: -1, jour: 'weekend', periode: 'mois' } });
    tache('TACHE', { titre: 'Audit des dossiers de soins', service: U1, debut: SIC.model.dateLocaleISO(lundiDe(-100)), heure: '', regularite: { type: 'rangPeriode', rang: 1, jour: 1, periode: 'trimestre' } });
    tache('TACHE_EQUIPE', { titre: 'Ranger la réserve', service: U1, debut: SIC.model.dateLocaleISO(now), heure: '', regularite: { type: 'aucune' } });
    // Absence, alertes (dont une en retard)
    ajouter(avant, 'ABSENCE', { id: 'AB001', agent: 'demo-d', nom: 'Agent D (fictif)', debut: jour(1), fin: jour(3), categorie: 'conge', service: U1 });
    ajouter(avant, 'ALERTE', { id: 'AL001', type: 'medecin', libelle: '', patientId: 'P02', service: U1, avant: SIC.model.dateLocaleISO(jour(1)), heure: '12:00', pour: null, precision: '' });
    ajouter(avant, 'ALERTE', { id: 'AL002', type: 'transmission', libelle: '', patientId: 'P01', service: U1, avant: SIC.model.dateLocaleISO(jour(-1)), heure: '', pour: null, precision: 'Famille à rappeler (fictif)' });
    ajouter(avant, 'ALERTE', { id: 'AL003', type: 'rdv', libelle: '', patientId: 'P04', service: U2, avant: '', heure: '', pour: null, precision: '' });

    file.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
    return file.map(function (x, i) { return { at: new Date(Math.min(x.at, now) + i).toISOString(), by: 'demo', type: x.type, data: x.data }; });
  };

  SIC.chargerDemo = async function (session) {
    // L'agent qui crée la démonstration est inscrit par les « données fictives » à une audience : information reçue
    var u = session.utilisateur || {};
    await session.enregistrerLot(SIC.donneesFictives({ moi: { id: u.id, nom: u.nom } }), { libelle: 'Données fictives de démonstration', by: 'demo', sansControle: true });
  };
})(typeof self !== 'undefined' ? self : this);
