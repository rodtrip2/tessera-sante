// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Isocont — vues et fenêtres de saisie (étape 1 du plan d'architecture, premier bloc d'écran sorti de ui.js) :
 * tableau de bord, mesures, JLD, surveillance, registre ; nouvelle mesure, fin, pause, reprise, tiers, JLD, détail,
 * lieu, correction, proposition, professionnels ; libellés du journal ; panneaux d'administration. Ces éléments
 * s'ajoutent au contrat du module (SIC.modules.completerInterface), que la coquille lit. Les outils d'affichage et la coquille (en-tête, onglets, fenêtres)
 * viennent de ui.js (SIC.ui) ; les vues sont déclarées dans SIC.ui.vues, que la coquille affiche.
 * Doit être chargé juste après ui.js (les autres fichiers d'interface lisent les aides déclarées ici).
 * Construction du DOM sans innerHTML : aucune donnée saisie n'est jamais interprétée comme du HTML.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, M = SIC.model, R = SIC.rules, C = SIC.crypto;
  var H = R.H, J = R.J;
  // Outils et état de la coquille (ui.js)
  var h = U.h, vider = U.vider, date = U.date, court = U.court, duree = U.duree, relatif = U.relatif, versSaisie = U.versSaisie, depuisSaisie = U.depuisSaisie;
  var toast = U.toast, modale = U.modale, fmtJour = U.fmtJour, rendreContenu = U.rendreContenu, exporter = U.exporter;
  var App = U.App, st = U.st, config = U.config, services = U.services, libService = U.libService, etablissement = U.etablissement, lieu = U.lieu;
  var patient = U.patient, nomPatient = U.nomPatient, modeActuel = U.modeActuel, dansService = U.dansService, idMesure = U.idMesure;
  var boutonEnregistrer = U.boutonEnregistrer, enregistrerConfig = U.enregistrerConfig, lignesDe = U.lignesDe, zoneTexte = U.zoneTexte, periodeDepuis = U.periodeDepuis;

  // ================================================================ Libellés
  var LIB_TIERS = { INFORME: 'Tiers informé', TENTATIVE: 'Tentative sans succès', PAS_DE_TIERS: 'Pas de tiers identifié', REFUS_PATIENT: 'Refus du patient', AUTRE: 'Non informé — autre motif' };
  var LIB_NATURE = { INFO: 'Information du JLD', SAISINE: 'Saisine du JLD', DECISION: 'Décision reçue du JLD' };
  var LIB_EVT = {
    CONFIG: 'Paramétrage', PATIENT: 'Patient', SEJOUR: 'Séjour du patient', INTERVENANT: 'Prise en charge : répertoire', PRISE_EN_CHARGE: 'Fiche patient : prise en charge', COMPLEMENT: 'Fiche patient : donnée complémentaire', MODE_HOSPI: "Mode d'hospitalisation", MESURE_DEBUT: 'Début de mesure',
    MESURE_FIN: 'Fin de mesure', PAUSE: 'Pause de mesure', REPRISE: 'Reprise de mesure', TIERS: 'Information du tiers', INFORMATION: 'Information (alerte de l’établissement)', FUSION: 'Fusion de fiches patient', PROPOSITION: 'Correction proposée', REFUS_PROPOSITION: 'Correction proposée refusée', TRANSFERT: 'Transfert entre services', SOMATIQUE: 'Soins somatiques ou urgences', SOMATIQUE_RETOUR: 'Retour dans le service', RECOURS: 'Recours ou appel (JLD)', ENTRETIEN: 'Entretien après la mesure', INTEGRITE: 'Intégrité des données', JLD: 'JLD', PROFESSIONNEL: 'Professionnel en CSI',
    CORRECTION: 'Correction', ANNULATION: 'Annulation', COMPTE: 'Comptes et clés', LOT: 'Lot de saisies', STATS: 'Statistiques'
  };
  var LIB_COMPTE = { EDITION_CADA: 'registre édité pour communication (CADA)', EXPORT_PATIENT: 'données d’un patient exportées (droit d’accès)', ARCHIVE: 'archive annuelle téléchargée', SCELLE: 'copie du coffre sous scellé téléchargée', SAUVEGARDE: 'copie de sauvegarde complète téléchargée', EXPORT: 'fichier exporté', EXPORT_SUPPRIME: 'fichier exporté supprimé', PURGE_EXPORTS: 'purge des anciens exports', REPARATION: 'réparation depuis une copie de sauvegarde', QUARANTAINE: 'mise en quarantaine', FORMATION_CREEE: 'jeu de formation créé ou régénéré', CREATION_LOT: 'comptes créés en lot', CREATION: 'compte créé', ROLES: 'rôles modifiés', MDP_CHANGE: 'mot de passe changé', MDP_REINIT: 'mot de passe réinitialisé', CLE_AJOUT: 'clé de sécurité enregistrée', CLE_RETRAIT: 'clé de sécurité retirée', CODE_SECOURS: 'nouveau code de secours généré', MIROIR: 'synchronisation avec le dossier de secours', MIROIR_REPRISE: 'saisies reprises du dossier de secours', MIROIR_LIEN: 'dossier de secours relié', DEPLACEMENT: 'données déplacées vers un nouveau dossier', HORS_RESEAU: 'travail hors réseau sur un poste', REGLAGES_EXPORT: 'réglages téléchargés', REGISTRE_ANONYME: 'registre anonymisé imprimé ou exporté', GENERATION: 'nouvelle génération de clé', MIGRATION_TROUSSEAU: 'passage au trousseau de clés', ATTESTATION: 'attestation du coffre', RENOUVELLEMENT: 'clés renouvelées', REMISE_ATTESTEE: 'dernière version attestée du coffre remise en place', COMPROMISSION: 'tout renouvelé (compromission)', CLE_MODULE: 'clé de module créée' };
  var LIB_STATUT = { ok: 'dans les temps', proche: 'échéance proche', depasse: 'dépassée', fait: 'fait à temps', 'fait-retard': 'fait hors délai', na: 'sans objet' };

  // ---------------------------------------------------------------- Aides d'affichage
  function badgeType(type) { return h('span', { class: 'badge ' + (type === 'Isolement' ? 'iso' : 'cont'), text: type }); }

  function cellEcheance(x) {
    if (!x) return '—';
    return h('span', { class: 'ech ' + x.statut, title: LIB_STATUT[x.statut] + (x.effective ? ' — fait le ' + date(x.effective) : '') },
      court(x.echeance), x.effective ? h('small', { text: 'fait ' + court(x.effective) }) : null);
  }

  function prochaineEcheance(j) {
    var liste = [['INFO', j.info], ['SAISINE', j.saisine], ['DECISION', j.decision]].filter(function (x) { return !x[1].effective && x[1].statut !== 'na'; });
    return liste.length ? { nature: liste[0][0], ech: liste[0][1] } : null;
  }

  function tiersBadge(m) {
    var t = M.tiersCycle(m);
    if (!t) return h('span', { class: 'badge warn', text: 'À renseigner' });
    var cls = t.statut === 'INFORME' ? 'ok' : '';
    return h('span', { class: 'badge ' + cls, title: (t.personne ? t.personne + ' — ' : '') + 'par ' + M.libInformateur(config(), t), text: LIB_TIERS[t.statut] || t.statut });
  }

  /** Badge de pause d'une mesure en cours (ou null). */
  function badgePause(m, maintenant) {
    var p = M.pauseEnCours(m, maintenant, config());
    if (!p) return null;
    var heure = function (ms) { return Math.abs(ms - maintenant) < 20 * H ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : court(ms); };
    return p.depassee
      ? h('span', { class: 'badge bad', title: 'Pause depuis ' + date(p.debut) + (p.motif ? ' — ' + p.motif : ''), text: 'Reprise ' + heure(p.reprisePrevue) + ' à confirmer' })
      : h('span', { class: 'badge pause', title: 'Pause depuis ' + date(p.debut) + (p.motif ? ' — ' + p.motif : '') + ' (' + (nomMed(p.psychiatre, p.psychiatreId) || '?') + ')', text: 'Pause → ' + heure(p.reprisePrevue) });
  }

  function legendeEcheances() {
    return h('div', { class: 'legende' }, 'Échéances :',
      ['ok', 'proche', 'depasse', 'fait', 'fait-retard', 'na'].map(function (k) { return h('span', { class: 'ech ' + k, text: LIB_STATUT[k] }); }));
  }

  function mesuresVisibles() { return M.listeMesures(st()).filter(dansService); }

  // ---------------------------------------------------------------- Tableau de bord
  function vueTableau(maintenant) {
    var ms = mesuresVisibles();
    var enCours = ms.filter(function (m) { return typeof m.fin !== 'number'; });
    var depassees = 0, proches = 0, aVenir = [];
    enCours.forEach(function (m) {
      var j = M.suiviJLD(st(), m, maintenant);
      [['INFO', j.info], ['SAISINE', j.saisine], ['DECISION', j.decision]].forEach(function (x) {
        if (x[1].statut === 'depasse') depassees++;
        if (x[1].statut === 'proche') proches++;
      });
      var p = prochaineEcheance(j);
      if (p) aVenir.push({ m: m, j: j, p: p });
    });
    aVenir.sort(function (a, b) { return a.p.ech.echeance - b.p.ech.echeance; });
    var tiersARenseigner = enCours.filter(function (m) { return !M.tiersCycle(m); }).length;
    var libres = enCours.filter(function (m) { return !M.estContrainte(config(), M.modeA(st(), m.patientId, maintenant) || m.modeHospi); });
    var mineurs = enCours.filter(function (m) { return M.estMineur(st(), m.patientId, maintenant); });
    var vigilance = [];
    SIC.ui.sauvegarde.vigilance().forEach(function (li) { vigilance.push(li); });
    SIC.ui.miroir.vigilance().forEach(function (li) { vigilance.push(li); });
    var aTracer = SIC.ui.alertes.aTracer();
    SIC.ui.qualite.entretiensARenseigner(maintenant).slice(0, 6).forEach(function (m) {
      vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — ' + m.type.toLowerCase() + ' terminé' + (m.type === 'Contention' ? 'e' : '') + ' le ' + court(m.fin) + ' : ' + M.optionsQualite(config()).nomEntretien.toLowerCase() + ' à renseigner. ',
        App.session.peut('ENTRETIEN') ? h('button', { class: 'btn petit', onclick: function () { SIC.ui.qualite.modaleEntretien(m); } }, 'Renseigner') : null));
    });
    var propositions = M.propositionsEnAttente(st(), dansService);
    propositions.forEach(function (p) {
      var m = st().mesures[p.mesureId];
      vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — correction proposée par ' + App.session.nomAuteur(p.by) + ' sur ' + m.type.toLowerCase() + ' du ' + court(m.debut) + ' : ' + Object.keys(p.champs).map(function (k) { return LIB_CHAMPS[k] || k; }).join(', ') + '. ',
        App.session.peut('CORRECTION') ? h('button', { class: 'btn petit', onclick: function () { modaleProposition(p); } }, 'Examiner') : h('small', { class: 'muted', text: 'En attente du cadre.' })));
    });
    enCours.forEach(function (m) {
      var j = M.suiviJLD(st(), m, maintenant);
      if (j.apresMainlevee && !j.info.effective) vigilance.push(h('li', { class: 'urgent' }, h('b', { text: nomPatient(m.patientId) }), ' — ' + m.type.toLowerCase() + ' décidé' + (m.type === 'Contention' ? 'e' : '') + ' moins de 48 h après la mainlevée ordonnée par le JLD le ' + court(j.apresMainlevee.date) + ' : informer le JLD sans délai (éléments nouveaux décrits dans le certificat du psychiatre).'));
    });
    aTracer.forEach(function (x) {
      vigilance.push(h('li', { class: x.retard ? 'urgent' : '' }, h('b', { text: nomPatient(x.mesure.patientId) }), ' — ' + x.regle.libelle.toLowerCase() + ' : informer ' + x.regle.destinataires + ' ' + SIC.ui.alertes.delaiTexte(x.regle.delaiMinutes) +
        ' (' + x.mesure.type.toLowerCase() + ' du ' + court(x.mesure.debut) + ')' + (x.retard && x.regle.delaiMinutes ? ', délai dépassé' : '') + ' : information non tracée. ',
        App.session.peut('INFORMATION') ? h('button', { class: 'btn petit', onclick: function () {
          SIC.ui.alertes.modaleInformations(aTracer.filter(function (y) { return y.regle.id === x.regle.id && y.mesure.patientId === x.mesure.patientId; }));
        } }, 'Tracer l’information') : null));
    });
    libres.forEach(function (m) {
      var depuis = (maintenant - m.debut) / H;
      vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — ', m.type.toLowerCase() + ' en cours depuis ' + duree(depuis) + ' alors que le patient est en ' + (M.modeA(st(), m.patientId, maintenant) || m.modeHospi) + ' (soins libres) : régulariser le mode d’hospitalisation ou mettre fin à la mesure' + (depuis > 12 ? ' (12 h au maximum selon les recommandations de la HAS).' : '.')));
    });
    mineurs.forEach(function (m) { vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — patient mineur : vigilance renforcée.')); });
    var enPause = enCours.filter(function (m) { return M.pauseEnCours(m, maintenant, config()); });
    enPause.forEach(function (m) {
      var p = M.pauseEnCours(m, maintenant, config());
      if (p.depassee) vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — ' + m.type.toLowerCase() + ' en pause : la reprise était prévue le ' + date(p.reprisePrevue) + '. Confirmez la reprise ou saisissez la fin de la mesure.'));
      if (m.type === 'Isolement') enCours.forEach(function (c) {
        if (c.type === 'Contention' && c.patientId === m.patientId && !M.pauseEnCours(c, maintenant, config())) vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — contention en cours alors que l’isolement est en pause : mettez aussi la contention en pause ou saisissez sa fin.'));
      });
    });
    var vusRouge = {};
    enCours.forEach(function (m) {
      if (vusRouge[m.patientId]) return; vusRouge[m.patientId] = 1;
      var c = M.cumulsPatient(st(), m.patientId, maintenant);
      if (c.niveau === 'rouge') vigilance.push(h('li', {}, h('b', { text: nomPatient(m.patientId) }), ' — cumul élevé sur 15 jours : isolement ' + duree(c.iso15) + ', contention ' + duree(c.cont15) + '.'));
    });
    var postesIncomplets = [];
    services().forEach(function (sv) {
      if (App.service !== '*' && sv.code !== App.service) return;
      M.postesSurveillance(st(), sv.code, maintenant, 2).forEach(function (p) {
        if (!p.complet) postesIncomplets.push({ sv: sv, p: p });
      });
    });
    postesIncomplets.sort(function (a, b) { return b.p.debut - a.p.debut; });

    function ind(valeur, libelle, niveau) { return h('div', { class: 'indicateur ' + (niveau || '') }, h('div', { class: 'valeur', text: valeur }), h('div', { class: 'libelle', text: libelle })); }
    var nIso = enCours.filter(function (m) { return m.type === 'Isolement'; }).length;

    var tableEch = aVenir.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Patient', 'Mesure', 'Prochaine étape', 'Échéance', ''].map(function (t) { return h('th', { text: t }); }))),
      h('tbody', {}, aVenir.slice(0, 12).map(function (x) {
        return h('tr', {},
          h('td', {}, nomPatient(x.m.patientId), h('br'), h('small', { text: libService(x.m.service) })),
          h('td', {}, badgeType(x.m.type), ' ', h('small', { text: 'cycle ' + x.j.cycle })),
          h('td', { text: LIB_NATURE[x.p.nature] }),
          h('td', {}, cellEcheance(x.p.ech), h('br'), h('small', { text: relatif(x.p.ech.echeance, maintenant) })),
          h('td', { class: 'actions-ligne' }, App.session.peut('JLD') ? h('button', { class: 'btn petit', onclick: function () { modaleJLD(x.m); } }, 'Saisir') : null));
      })))) : h('div', { class: 'vide', text: 'Aucune échéance JLD en cours.' });

    var voitSurveillance = M.ongletVisible(App.session.roles(), config(), 'surveillance'), voitJLD = M.ongletVisible(App.session.roles(), config(), 'jld');
    var listePostes = postesIncomplets.length ? h('div', { class: 'postes' }, postesIncomplets.slice(0, 8).map(function (x) {
      return h('div', { class: 'poste incomplet' }, h('div', {}, h('b', { text: x.p.libelle }), h('br'), h('small', { text: fmtJour.format(x.p.debut) })),
        h('div', {}, h('small', { text: libService(x.sv.code) + ' — ' + x.p.professionnels.length + ' / 2 professionnels' })),
        App.session.peut('PROFESSIONNEL') ? h('button', { class: 'btn petit', onclick: function () { modaleProfessionnel(x.sv.code, x.p.date, x.p.periode); } }, 'Compléter') : null);
    })) : h('div', { class: 'vide', text: 'Tous les postes des dernières 48 h sont complets.' });

    return h('div', {},
      h('div', { class: 'indicateurs' },
        ind(enCours.length, 'Mesures en cours (' + nIso + ' isolement, ' + (enCours.length - nIso) + ' contention)'),
        voitJLD ? ind(depassees, 'Échéances JLD dépassées', depassees ? 'bad' : 'ok') : null,
        !voitJLD ? null : ind(proches, (function () {
          var sj = ['Isolement', 'Contention'].map(function (t) { return SIC.rules.params(t, config().parametres).seuilJaune || 12; });
          return sj[0] === sj[1] ? 'Échéances JLD dans les ' + sj[0] + ' h' : 'Échéances JLD proches (' + sj[0] + ' h isolement, ' + sj[1] + ' h contention)';
        })(), proches ? 'warn' : 'ok'),
        !M.optionsPauses(config()).active && !enPause.length ? null : ind(enPause.length, 'Mesures en pause (levée temporaire)', enPause.some(function (m) { return M.pauseEnCours(m, maintenant, config()).depassee; }) ? 'bad' : ''),
        ind(tiersARenseigner, 'Tiers à renseigner (cycle en cours)', tiersARenseigner ? 'warn' : 'ok'),
        voitSurveillance ? ind(postesIncomplets.length, lieu('Postes CSI incomplets (48 h)'), postesIncomplets.length ? 'warn' : 'ok') : null,
        (function () {
          // Conflits portant sur les mesures des services de l'agent (tous pour un journal complet)
          var mesSv = App.session.mesServices(), tous = M.niveauJournal(App.session.roles(), config()) === 'complet';
          var n = st().conflits.filter(function (c) { return tous || M.servicesSaisie(st(), { type: 'X', data: { mesureId: c.mesureId } }).some(function (x) { return mesSv.indexOf(x) >= 0; }); }).length;
          return ind(n, 'Saisies en conflit', n ? 'bad' : 'ok');
        })(),
        ind(libres.length, 'Mesures chez un patient en soins libres', libres.length ? 'bad' : 'ok'),
        aTracer.length || M.alertesConfig(config()).some(function (r) { return r.active && r.nature === 'information'; }) ? ind(aTracer.length, 'Informations à tracer (alertes de l’établissement)', aTracer.some(function (x) { return x.retard; }) ? 'bad' : aTracer.length ? 'warn' : 'ok') : null),
      vigilance.length ? h('section', { class: 'panneau' }, h('h2', { text: 'Points de vigilance' }), h('ul', { class: 'vigilance' }, vigilance)) : null,
      (function () {
        var panneaux = [voitJLD ? h('section', { class: 'panneau' }, h('h2', { text: 'Prochaines échéances JLD' }), tableEch) : null,
          voitSurveillance ? h('section', { class: 'panneau' }, h('h2', { text: lieu('Surveillance en CSI à compléter') }), listePostes) : null].filter(Boolean);
        return panneaux.length === 2 ? h('div', { class: 'deux-colonnes' }, panneaux) : panneaux[0] || null;
      })());
  }

  // ---------------------------------------------------------------- Mesures
  var afficherAnciennes = false;
  function vueMesures(maintenant) {
    var joursTerm = M.optionsAffichage(config()).mesuresTermineesJours;
    var ms = mesuresVisibles().filter(function (m) { return afficherAnciennes || R.etatAffichage(m, maintenant, joursTerm) !== 'ancienne'; });
    ms.sort(function (a, b) {
      var ea = typeof a.fin === 'number' ? 1 : 0, eb = typeof b.fin === 'number' ? 1 : 0;
      return ea - eb || b.debut - a.debut;
    });
    var cb = h('input', { type: 'checkbox', checked: afficherAnciennes, onchange: function () { afficherAnciennes = cb.checked; rendreContenu(); } });
    var barre = h('div', { class: 'barre' },
      h('h1', { text: 'Mesures' }), h('div', { class: 'espace' }),
      h('label', { class: 'case' }, cb, h('span', { text: 'Afficher les mesures terminées depuis plus de ' + joursTerm + ' jour' + (joursTerm > 1 ? 's' : '') })),
      App.session.peut('MESURE_DEBUT') ? h('button', { class: 'btn primaire', onclick: modaleNouvelleMesure }, '+ Nouvelle mesure') : null);
    if (!ms.length) return h('div', {}, barre, h('div', { class: 'panneau vide', text: 'Aucune mesure à afficher.' }));

    var tbody = h('tbody');
    ms.forEach(function (m) {
      var etat = R.etatAffichage(m, maintenant, joursTerm);
      var j = M.suiviJLD(st(), m, maintenant);
      var enCours = etat === 'en-cours';
      var pause = enCours ? M.pauseEnCours(m, maintenant, config()) : null;
      var hPauses = M.dureePausesHeures(m, maintenant, config());
      var infos = M.informationsATracer(st(), maintenant, function (x) { return x.id === m.id; });
      tbody.appendChild(h('tr', { class: etat + (pause ? ' en-pause' : '') },
        h('td', { class: 'patient' }, h('b', { text: nomPatient(m.patientId) }), h('br'), h('small', { text: 'IPP ' + (patient(m.patientId).ipp || '—') + ' · ' + libService(m.service) })),
        h('td', {}, badgeType(m.type), M.propositionsEnAttente(st(), function (x) { return x.id === m.id; }).length ? h('div', {}, h('span', { class: 'badge warn', title: 'Correction proposée, en attente de validation par le cadre', text: 'Correction proposée' })) : null, m.somatique ? h('div', {}, SIC.ui.parcours.badge(m)) : null, infos.length ? h('div', {}, h('span', { class: 'badge bad', title: infos.map(function (x) { return x.regle.libelle + ' : informer ' + x.regle.destinataires; }).join(' ; '), text: 'Information à tracer' })) : null, m.leveeJLD ? h('div', {}, h('span', { class: 'badge bad', text: 'Levée JLD' })) : null, pause ? h('div', {}, badgePause(m, maintenant)) : null),
        h('td', {}, m.lieu || lieu(m.csi ? 'CSI' : 'Hors CSI'), m.debutInitial ? h('div', {}, h('small', { class: 'muted', title: 'Mesure débutée avant l’arrivée dans le service : les délais JLD partent de la décision initiale', text: 'débutée le ' + court(m.debutInitial) + (m.lieuInitial ? ' — ' + m.lieuInitial : '') })) : null),
        h('td', { class: 'nowrap', text: court(m.debut) }),
        h('td', { class: 'nowrap' }, duree(M.dureeHeures(m, maintenant, config())), m.debutInitial ? h('div', {}, h('small', { class: 'muted', title: 'Depuis la décision initiale, avant l’arrivée dans le service', text: duree(((typeof m.fin === 'number' ? m.fin : maintenant) - m.debutInitial) / H) + ' au total' })) : null, enCours ? null : h('br'), enCours ? null : h('small', { text: 'fin ' + court(m.fin) }),
          hPauses >= 1 / 60 ? h('div', {}, h('small', { class: 'muted', title: M.optionsPauses(config()).retrancher ? 'Levées temporaires, déduites de la durée' : 'Levées temporaires, comptées dans la durée', text: (M.optionsPauses(config()).retrancher ? 'pauses déduites ' : 'dont pauses comptées ') + duree(hPauses) })) : null),
        h('td', { text: String(j.cycle) }),
        h('td', {}, cellEcheance(j.info)), h('td', {}, cellEcheance(j.saisine)), h('td', {}, cellEcheance(j.decision)),
        h('td', {}, tiersBadge(m)),
        h('td', { class: 'actions-ligne' },
          infos.length && App.session.peut('INFORMATION') ? h('button', { class: 'btn petit danger', title: 'Informer ' + infos[0].regle.destinataires + ' (' + infos[0].regle.libelle + ')', onclick: function () { SIC.ui.alertes.modaleInformations(infos); } }, 'Informer') : null, ' ',
          enCours && App.session.peut('JLD') ? h('button', { class: 'btn petit', onclick: function () { modaleJLD(m); } }, 'JLD') : null, ' ',
          App.session.peut('TIERS') ? h('button', { class: 'btn petit', onclick: function () { modaleTiers(m); } }, 'Tiers') : null, ' ',
          enCours && !pause && App.session.peut('PAUSE') && M.optionsPauses(config()).active ? h('button', { class: 'btn petit', title: 'Levée temporaire décidée par le psychiatre', onclick: function () { modalePause(m); } }, 'Pause') : null,
          pause && App.session.peut('REPRISE') ? h('button', { class: 'btn petit primaire', onclick: function () { modaleReprise(m); } }, 'Reprise') : null, ' ',
          enCours && m.somatique && App.session.peut('SOMATIQUE_RETOUR') ? h('button', { class: 'btn petit primaire', title: 'Retour dans le service après les soins somatiques', onclick: function () { SIC.ui.parcours.modaleRetour(m); } }, 'Retour') : null, ' ',
          enCours && App.session.peut('MESURE_FIN') ? h('button', { class: 'btn petit danger', onclick: function () { modaleFin(m); } }, 'Fin') : null, ' ',
          SIC.ui.actions.decompte && App.session.peut('JLD') ? h('button', { class: 'btn petit', onclick: function () { SIC.ui.actions.decompte(m); } }, 'Décompte') : null, ' ',
          h('button', { class: 'btn petit', onclick: function () { modaleDetail(m); } }, 'Détail'))));
    });
    return h('div', {}, barre,
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Patient', 'Type', 'Lieu', 'Début', 'Durée', 'Cycle', 'Info avant', 'Saisine avant', 'Décision avant', 'Tiers', ''].map(function (t) { return h('th', { text: t }); }))),
        tbody)),
      legendeEcheances(),
      h('p', { class: 'muted' }, h('small', { text: 'Les échéances sont calculées depuis le début de la mesure et le cumul des 15 jours précédents (même patient, même type), jamais depuis la date des décisions du juge.' })));
  }

  // ---------------------------------------------------------------- JLD
  var TITRE_TIERS_JLD = 'Le médecin informe du renouvellement au moins un membre de la famille ou un proche, et de son droit de saisir le juge ; pour un majeur protégé, informer aussi le tuteur ou le curateur.';
  function vueJLD(maintenant) {
    var enCours = mesuresVisibles().filter(function (m) { return typeof m.fin !== 'number'; }).map(function (m) {
      var j = M.suiviJLD(st(), m, maintenant); return { m: m, j: j, p: prochaineEcheance(j) };
    }).sort(function (a, b) { return (a.p ? a.p.ech.echeance : Infinity) - (b.p ? b.p.ech.echeance : Infinity); });
    var tbody = h('tbody');
    enCours.forEach(function (x) {
      var t = M.tiersCycle(x.m);
      tbody.appendChild(h('tr', { class: 'en-cours' },
        h('td', {}, h('b', { text: nomPatient(x.m.patientId) }), h('br'), h('small', { text: libService(x.m.service) })),
        h('td', {}, badgeType(x.m.type), h('br'), h('small', { text: 'depuis ' + duree(M.dureeHeures(x.m, maintenant, config())) }), badgePause(x.m, maintenant) ? h('div', {}, badgePause(x.m, maintenant)) : null),
        h('td', {}, String(x.j.cycle), x.j.rythmeLong ? h('div', {}, h('small', { text: 'rythme long' })) : null),
        h('td', { class: 'nowrap', text: duree(x.j.cumulAvant) }),
        h('td', {}, cellEcheance(x.j.info)), h('td', {}, cellEcheance(x.j.saisine)), h('td', {}, cellEcheance(x.j.decision)),
        h('td', {}, tiersBadge(x.m), t ? null : h('div', {}, h('small', { class: 'aide-survol', title: TITRE_TIERS_JLD, text: x.j.info && x.j.info.statut !== 'na' && x.j.info.echeance ? 'Proche à informer avant le ' + court(x.j.info.echeance) + ', comme le juge' : 'Proche à informer, comme le juge' }))),
        h('td', { class: 'actions-ligne' }, App.session.peut('JLD') ? h('button', { class: 'btn petit primaire', onclick: function () { modaleJLD(x.m); } }, 'Saisir un envoi ou une décision') : null)));
    });
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Suivi JLD' }), h('div', { class: 'espace' }),
        String(config().organisationJLD || '').trim() ? h('small', { class: 'muted', text: String(config().organisationJLD).trim() }) : null),
      enCours.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Patient', 'Mesure', 'Cycle', 'Cumul 15 j avant', 'Information avant', 'Saisine avant', 'Décision avant', 'Tiers', ''].map(function (t) { return h('th', { text: t }); }))),
        tbody)) : h('div', { class: 'panneau vide', text: 'Aucune mesure en cours.' }),
      legendeEcheances());
  }

  // ---------------------------------------------------------------- Surveillance CSI
  function vueSurveillance(maintenant) {
    var svs = services().filter(function (s) { return App.service === '*' || s.code === App.service; });
    var bloc = h('div');
    svs.forEach(function (sv) {
      var postes = M.postesSurveillance(st(), sv.code, maintenant, 7);
      bloc.appendChild(h('section', { class: 'panneau' },
        h('h2', {}, libService(sv.code), h('span', { class: 'badge', text: postes.length + ' postes sur 7 jours' })),
        postes.length ? h('div', { class: 'postes' }, postes.map(function (p) {
          var n = p.professionnels.length;
          var creneaux = p.professionnels.map(function (x) { return h('span', { class: 'creneau', title: x.lieux && x.lieux.length ? 'Lieux surveillés : ' + x.lieux.join(', ') : lieu('Tous les lieux du service (CSI)'), text: x.nom + (x.fonction ? ' (' + x.fonction + ')' : '') + (x.lieux && x.lieux.length ? ' — ' + x.lieux.join(', ') : '') }); });
          for (var i = n; i < p.min; i++) creneaux.push(h('span', { class: 'creneau libre', text: 'À renseigner' }));
          return h('div', { class: 'poste ' + (p.complet ? 'complet' : 'incomplet') },
            h('div', {}, h('b', { text: p.libelle }), h('br'), h('small', { text: fmtJour.format(p.debut) }), p.lieux.length ? h('div', {}, h('small', { class: 'muted', text: 'Lieux occupés : ' + p.lieux.join(', ') })) : null),
            h('div', { class: 'creneaux' }, creneaux),
            App.session.peut('PROFESSIONNEL') ? h('div', { class: 'actions-poste' },
              p.professionnels.some(function (x) { return x.nom.toLowerCase() === App.session.utilisateur.nom.toLowerCase(); }) ? null
                : h('button', { class: 'btn petit' + (p.complet ? '' : ' primaire'), title: 'Vous enregistrer pour ce poste (tous les lieux du service)', onclick: function () { ajouterMoi(sv.code, p).catch(function (e) { toast(e.message); }); } }, 'M’ajouter'),
              h('button', { class: 'btn petit', onclick: function () { modaleProfessionnel(sv.code, p.date, p.periode); } }, 'Ajouter')) : null);
        })) : h('div', { class: 'vide', text: lieu('Aucune mesure en CSI sur les 7 derniers jours.') })));
    });
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: lieu('Professionnels chargés de la surveillance en CSI') }), h('div', { class: 'espace' }),
        App.session.peut('PROFESSIONNEL') ? h('button', { class: 'btn', onclick: function () { modaleProfessionnel(App.service === '*' ? (services()[0] || {}).code : App.service); } }, 'Saisie libre') : null),
      h('p', { class: 'muted', text: lieu((function (n) { return n === 1 ? 'Au moins un professionnel attendu' : 'Au moins ' + n + ' professionnels attendus'; })(M.optionsSurveillance(config()).minParPoste) + ' par poste couvert par une mesure en CSI (réglage de l’établissement). Sans précision, un professionnel est compté pour tous les lieux du service ; s’il précise les lieux surveillés, il n’apparaît au registre que pour les mesures de ces lieux. Ces informations alimentent la colonne « professionnels chargés de la surveillance » du registre anonymisé.') }),
      bloc);
  }

  // ---------------------------------------------------------------- Registre
  var anneeRegistre = new Date().getFullYear();
  function vueRegistre(maintenant) {
    var svCode = App.service === '*' ? (services()[0] || {}).code : App.service;
    var selAn = h('input', { type: 'number', value: anneeRegistre, min: 2020, max: 2100, onchange: function () { anneeRegistre = +selAn.value; rendreContenu(); } });
    var entrees = svCode ? M.registre(st(), svCode, anneeRegistre, maintenant) : [];
    var synthese = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    entrees.forEach(function (e) { synthese[e.categorie]++; });
    var LIB_CAT = {}; Object.keys(M.LIB_CATEGORIES).forEach(function (k) { LIB_CAT[k] = lieu(M.LIB_CATEGORIES[k]); });
    var op = M.optionsPauses(config());
    var colPauses = op.colonneRegistre && (op.active || entrees.some(function (e) { return e.pauses.length; }));
    var libDuree = op.deduireRegistre ? 'Durée hors pauses' : 'Durée';
    function heuresPauses(e) { return e.pauses.reduce(function (s, p) { return s + (p[1] - p[0]); }, 0) / H; }
    function textePauses(e) { return e.pauses.length ? e.pauses.length + ' — ' + duree(heuresPauses(e)) : '—'; }
    var notePauses = !op.active && !entrees.some(function (e) { return e.pauses.length; }) ? null
      : op.deduireRegistre ? 'Durées hors levées temporaires : la durée des pauses décidées par le psychiatre est déduite (règle de l’établissement)' + (colPauses ? ' et indiquée dans la colonne « Levées temporaires ».' : '.')
      : 'Durées réelles, de la décision de début à la décision de fin : les levées temporaires sont comprises' + (op.retrancher ? ' (elles ne sont déduites que pour les délais JLD)' : '') + (colPauses ? ' et indiquées dans la colonne « Levées temporaires ».' : '.');

    function exporterCSV() {
      var lignes = [['Numéro', 'Catégorie', 'Identifiant patient (IPP)', 'Âge', 'Début', 'Fin', libDuree + ' (h)'].concat(colPauses ? ['Levées temporaires (nombre)', 'Levées temporaires (h)'] : [], ["Mode d'hospitalisation", 'Lieu', 'Psychiatre', 'Professionnels chargés de la surveillance'])];
      entrees.forEach(function (e) {
        lignes.push([e.numero || 'en cours', LIB_CAT[e.categorie], e.ipp || '', e.age == null ? '' : e.age, date(e.debut), e.fin ? date(e.fin) : 'en cours', e.dureeHeures.toFixed(2).replace('.', ',')].concat(colPauses ? [e.pauses.length, heuresPauses(e).toFixed(2).replace('.', ',')] : [], [e.modeHospi, e.lieu, e.psychiatre, e.professionnels.join(', ')]));
      });
      if (notePauses) { lignes.push([]); lignes.push([notePauses]); }
      var csv = '\ufeff' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
      exporter('registres', 'registre_' + svCode + '_' + anneeRegistre + '.csv', csv, 'text/csv;charset=utf-8', { service: svCode });
    }

    /** Registre en PDF, avec le papier à en-tête et les réglages du masque du décompte du service. */
    function exporterPDF() {
      var P = SIC.ui.pdfEtab.creer(svCode, 'Registre des mesures d’isolement et de contention — ' + anneeRegistre, {
        confidentiel: true, sousTitre: 'Registre prévu par l’article L. 3222-5-1 du code de la santé publique, à présenter à la commission départementale des soins psychiatriques, au contrôleur général des lieux de privation de liberté et aux parlementaires. Patient désigné par son identifiant (IPP).' });
      var doc = P.doc;
      if (notePauses) doc.paragraphe(notePauses, { taille: 8, rgb: [0.25, 0.25, 0.25], apres: 4 });
      SIC.ui.pdfEtab.section(doc, 'Synthèse par catégorie', ['Catégorie', 'Entrées'], Object.keys(synthese).map(function (k) { return [k + ' — ' + LIB_CAT[k], synthese[k]]; }), [80, 20], 8);
      var entetes = ['N°', 'Cat.', 'IPP', 'Âge', 'Début', 'Fin', libDuree].concat(colPauses ? ['Levées temp.'] : [], ['Mode', 'Lieu', 'Psychiatre', 'Professionnels chargés de la surveillance']);
      var poids = [5, 4, 8, 4, 10, 10, 7].concat(colPauses ? [7] : [], [6, 7, 9, 18]);
      SIC.ui.pdfEtab.section(doc, 'Entrées du registre', entetes, entrees.map(function (e) {
        return [e.numero || 'en cours', e.categorie, e.ipp || '—', e.age == null ? '—' : e.age, date(e.debut), e.fin ? date(e.fin) : 'en cours', duree(e.dureeHeures)]
          .concat(colPauses ? [textePauses(e)] : [], [e.modeHospi || '—', e.lieu || '—', e.psychiatre || '—', e.professionnels.length ? e.professionnels.join(', ') : (e.categorie === 'A' || e.categorie === 'C' ? 'non renseigné' : '—')]);
      }), poids, 6.5);
      var octets = P.finir({ mentions: ['Catégories : ' + Object.keys(LIB_CAT).map(function (k) { return k + ' = ' + LIB_CAT[k]; }).join(' ; ') + '.'] });
      exporter('registres', 'registre_' + svCode + '_' + anneeRegistre + '.pdf', octets, 'application/pdf', { service: svCode });
    }

    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Registre des mesures' }), h('div', { class: 'espace' }),
        h('label', {}, 'Année', selAn),
        h('button', { class: 'btn', disabled: !entrees.length, title: 'Avec le papier à en-tête du service (masque du décompte JLD)', onclick: function () { try { exporterPDF(); } catch (e) { toast(e.message); } } }, 'Enregistrer en PDF'),
        h('button', { class: 'btn', disabled: !entrees.length, onclick: exporterCSV }, 'Exporter (CSV)'),
        SIC.ui.actions.registreCADA && (App.session.peut('EDITION_CADA') || App.session.peut('CONFIG')) ? h('button', { class: 'btn', disabled: !entrees.length, title: 'Registre occulté, pour une demande de communication d’un tiers (CADA)', onclick: function () { SIC.ui.actions.registreCADA(svCode, anneeRegistre); } }, 'Version pour communication (CADA)…') : null,
        h('button', { class: 'btn', onclick: function () { U.imprimerPage(); } }, 'Imprimer')),
      h('div', { class: 'seulement-impression' }, h('h2', { text: (etablissement() ? etablissement() + ' — ' : '') + 'Registre des mesures d’isolement et de contention — ' + libService(svCode) + ' — ' + anneeRegistre }), h('p', { text: 'Article L. 3222-5-1 du code de la santé publique. Édité le ' + date(Date.now()) + '.' })),
      svCode ? h('p', { class: 'muted', text: libService(svCode) + ' — registre prévu par l’article L. 3222-5-1 du CSP, à présenter à la commission départementale des soins psychiatriques, au Contrôleur général des lieux de privation de liberté et aux parlementaires. Le patient y est désigné par son IPP. Pour toute autre demande (CADA), utilisez la version pour communication.' + (App.service === '*' ? ' Choisissez un service en haut de page pour changer de service.' : '') }) : null,
      notePauses ? h('p', { class: 'note-registre', text: notePauses }) : null,
      entrees.some(function (e) { return e.fige; }) ? h('p', { class: 'note-registre', text: 'Les entrées marquées « n° d’origine » sont des mesures importées qui gardent la catégorie et le numéro de leur document d’origine (classeur Excel ou registre importé) ; la numérotation de l’outil saute ces numéros.' }) : null,
      h('div', { class: 'indicateurs' }, Object.keys(synthese).map(function (k) {
        return h('div', { class: 'indicateur' }, h('div', { class: 'valeur', text: synthese[k] }), h('div', { class: 'libelle', text: k + ' — ' + LIB_CAT[k] }));
      })),
      entrees.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['N°', 'IPP', 'Âge', 'Début', 'Fin', libDuree].concat(colPauses ? ['Levées temporaires'] : [], ["Mode d'hosp.", 'Lieu', 'Psychiatre', 'Professionnels chargés de la surveillance']).map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, entrees.map(function (e) {
          return h('tr', { class: e.fin ? '' : 'en-cours' },
            h('td', {}, e.numero ? h('b', { text: e.numero }) : h('small', { text: 'en cours' }), e.fige ? h('div', {}, h('small', { class: 'badge', title: 'Mesure importée : catégorie et numéro d’origine conservés (classeur ou registre importé)', text: 'n° d’origine' })) : null),
            h('td', { text: e.ipp || '—' }),
            h('td', { class: 'nowrap', text: e.age == null ? '—' : e.age + ' ans' }),
            h('td', { class: 'nowrap', text: date(e.debut) }),
            h('td', { class: 'nowrap', text: e.fin ? date(e.fin) : 'en cours' }),
            h('td', { class: 'nowrap', text: duree(e.dureeHeures) }),
            colPauses ? h('td', { class: 'nowrap', title: e.pauses.map(function (p) { return date(p[0]) + ' → ' + date(p[1]); }).join('\n'), text: textePauses(e) }) : null,
            h('td', {}, e.modeHospi || '—', e.basculeMode ? h('span', { class: 'badge', title: 'Mode modifié dans les ' + (config().delaiModeHospiHeures == null ? 12 : config().delaiModeHospiHeures) + ' h suivant le début : le nouveau mode est retenu.', text: '*' }) : null),
            h('td', { text: e.lieu || '—' }),
            h('td', { text: e.psychiatre || '—' }),
            h('td', {}, e.professionnels.length ? e.professionnels.join(', ') : (e.categorie === 'A' || e.categorie === 'C' ? h('span', { class: 'badge warn', text: 'non renseigné' }) : '—')));
        })))) : h('div', { class: 'panneau vide', text: 'Aucune entrée pour cette année.' }));
  }


  /** Nom actuel d'un psychiatre (liste commune des médecins : un ancien nom suit le médecin). */
  function nomMed(n, id) { return (n || id) && SIC.medecins ? SIC.medecins.resoudre(config(), n, id) : n; }
  /**
   * Psychiatre décisionnaire : liste commune des médecins (psychiatres du service, puis autres), avec « + Médecin non
   * répertorié… » dont la fiche est à confirmer par le cadre ou la secrétaire (décision du porteur du 8 novembre 2026).
   * Rend un bloc avec valeur() (nom, obligatoire) et medecinId().
   */
  function selectPsychiatre(valeur, service) {
    if (SIC.ui.medecins && SIC.ui.medecins.champ) {
      var c = SIC.ui.medecins.champ({ valeur: valeur, service: service || (App.service !== '*' ? App.service : ''), fonction: 'psychiatre', libelle: 'psychiatre' });
      c.valeur = function () { var v = c.nom(); if (!v) throw new Error('Indiquez le psychiatre décisionnaire.'); return v; };
      return c;
    }
    var liste = (config().psychiatres || []).slice();
    if (valeur && liste.indexOf(valeur) < 0) liste = liste.concat([valeur]);
    var sel = h('select', {}, h('option', { value: '', text: '— Choisir —' }), liste.map(function (p) { return h('option', { value: p, text: p, selected: p === valeur }); }));
    var bloc = h('div', { class: 'pile' }, sel);
    bloc.valeur = function () { if (!sel.value) throw new Error('Indiquez le psychiatre décisionnaire.'); return sel.value; };
    bloc.medecinId = function () { return null; };
    return bloc;
  }

  function recapMesure(m, maintenant) {
    return h('div', { class: 'recap' },
      h('div', {}, h('b', { text: nomPatient(m.patientId) }), ' — ', m.type, ' — ', m.lieu || ''),
      h('div', { text: 'Début ' + date(m.debut) + ' (' + (m.psychiatreDebut || '?') + ') · durée ' + duree(M.dureeHeures(m, maintenant || Date.now(), config())) }));
  }

  // ---------------------------------------------------------------- Nouvelle mesure
  /** Message d'alerte rouge placé sous un champ ; `afficher(textes)` le met à jour. */
  function alerteChamp() {
    var zone = h('div', { class: 'alerte-champ', role: 'alert', hidden: true });
    zone.afficher = function (textes) {
      textes = (textes || []).filter(Boolean);
      vider(zone);
      textes.forEach(function (t) { zone.appendChild(h('div', { text: t })); });
      zone.hidden = !textes.length;
    };
    return zone;
  }

  function ageA(naissanceISO, date) {
    if (!naissanceISO) return null;
    var n = new Date(naissanceISO + 'T00:00:00'), d = new Date(date);
    if (isNaN(n.getTime())) return null;
    return d.getFullYear() - n.getFullYear() - ((d.getMonth() < n.getMonth() || (d.getMonth() === n.getMonth() && d.getDate() < n.getDate())) ? 1 : 0);
  }

  function modaleNouvelleMesure() {
    var s = App.session, maintenant = Date.now();
    var svDefaut = App.service !== '*' ? App.service : (services()[0] || {}).code;
    var selSv = h('select', {}, services().map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === svDefaut }); }));
    var selPatient = h('select');
    var blocNouveau = h('div', { class: 'pile' });
    var ipp = h('input', { type: 'text', placeholder: 'IPP' }), nom = h('input', { type: 'text', placeholder: 'NOM' }), prenom = h('input', { type: 'text', placeholder: 'Prénom' });
    var naissance = h('input', { type: 'date', max: M.dateLocaleISO(maintenant), required: true });
    var protection = h('select', {}, ['Aucune', 'Tutelle', 'Curatelle', 'Sauvegarde de justice', 'Habilitation familiale'].map(function (x) { return h('option', { value: x === 'Aucune' ? '' : x, text: x }); }));
    var detenu = h('input', { type: 'checkbox' });
    var selMode = h('select', {}, (config().modesHospitalisation || []).map(function (x) { return h('option', { value: x.code, text: x.code + ' — ' + x.libelle }); }));
    var infoMode = h('small', { class: 'muted' });
    var type = h('select', {}, h('option', { value: 'Isolement', text: 'Isolement' }), h('option', { value: 'Contention', text: 'Contention' }));
    var debut = h('input', { type: 'datetime-local', value: versSaisie(maintenant) });
    var ailleurs = h('input', { type: 'checkbox' });
    var debutInitial = h('input', { type: 'datetime-local' });
    var lieuInitial = h('input', { type: 'text', placeholder: 'Ex. : urgences, CHU (fictif), UMD…' });
    var blocAilleurs = h('div', { class: 'pile', hidden: true },
      h('div', { class: 'grille-2' }, h('label', {}, 'Date et heure de la décision initiale', debutInitial), h('label', {}, 'Lieu ou établissement d’origine', lieuInitial)),
      h('small', { class: 'muted', text: 'Les délais JLD et les cumuls partent de la décision initiale ; le registre du service, de l’arrivée. Saisissez ensuite les étapes JLD déjà faites (bouton JLD), à leur date.' }));
    var caseAilleurs = h('label', { class: 'case', hidden: !M.optionsCas(config()).debutAilleurs }, ailleurs, h('span', { text: 'La mesure a débuté avant l’arrivée dans le service (urgences, autre établissement…)' }));
    var labelDebut = h('span', { text: 'Date et heure de la décision de début' });
    var psy = selectPsychiatre();
    var motifRecours = SIC.ui.qualite.champMotif();
    var selLieu = h('select');
    var chambre = h('input', { type: 'text', placeholder: 'N° de chambre', hidden: true });
    var exception = h('input', { type: 'checkbox' });
    var blocException = h('label', { class: 'case', hidden: true }, exception, h('span', { text: 'Contention hors espace d’isolement — exception prévue (catégorie E du registre)' }));
    var avecIso = h('input', { type: 'checkbox', checked: true });
    var blocIso = h('label', { class: 'case', hidden: true }, avecIso, h('span', { text: 'Créer aussi la mesure d’isolement qui accompagne cette contention (même début, même lieu)' }));

    // Alertes sous les champs
    var aPatient = alerteChamp(), aIpp = alerteChamp(), aNaissance = alerteChamp(), aMode = alerteChamp(), aType = alerteChamp(), aDebut = alerteChamp(), aLieu = alerteChamp();
    var aEtab = h('div', { class: 'pile' });
    var aNom = alerteChamp();   // alertes de l'établissement (rappels, personnes à informer)
    var labelNaissance = h('label', {}, 'Date de naissance (obligatoire)', naissance, aNaissance);

    blocNouveau.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'IPP', ipp, aIpp), h('label', {}, 'Protection juridique', protection)));
    blocNouveau.appendChild(h('label', { class: 'case' }, detenu, h('span', { text: 'Patient détenu' })));
    blocNouveau.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nom), h('label', {}, 'Prénom', prenom)));
    blocNouveau.appendChild(aNom);
    var zoneNaissance = h('div', { class: 'grille-2' }, labelNaissance, h('div'));

    var peutFiche = App.session.peut('PATIENT');
    function patientChoisi() { return selPatient.value === '__nouveau' || !selPatient.value ? null : patient(selPatient.value); }
    function naissanceRequise() { var p = patientChoisi(); return !p || !p.naissance; }

    function remplirPatients() {
      vider(selPatient);
      var pts = Object.keys(st().patients).map(function (k) { return st().patients[k]; })
        .filter(function (p) { return !p.service || p.service === selSv.value; })
        .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      // Créer une fiche : droit du module Patients (IDE, secrétaire, cadre par défaut ; pas l'AS)
      if (peutFiche) selPatient.appendChild(h('option', { value: '__nouveau', text: '+ Nouveau patient' }));
      else if (!pts.length) selPatient.appendChild(h('option', { value: '', text: 'Aucune fiche dans ce service : à créer par un IDE, la secrétaire ou le cadre' }));
      pts.forEach(function (p) { selPatient.appendChild(h('option', { value: p.id, text: (p.nom || '') + ' ' + (p.prenom || '') + (p.ipp ? ' — IPP ' + p.ipp : '') })); });
      if (pts.length) selPatient.value = pts[0].id;
      majPatient();
    }
    function majPatient() {
      var p = patientChoisi();
      blocNouveau.hidden = !!p || !peutFiche;
      zoneNaissance.hidden = !naissanceRequise() || !peutFiche;
      labelNaissance.firstChild.textContent = p ? 'Date de naissance (absente de la fiche, obligatoire)' : 'Date de naissance (obligatoire)';
      naissance.value = '';
      if (p) { var mode = modeActuel(p); if (mode) selMode.value = mode; infoMode.textContent = mode ? 'Mode actuel : ' + mode + '. Modifiez-le si le statut a changé.' : ''; }
      else infoMode.textContent = '';
      majLieu();
    }
    function majLieu() {
      var lieux = (config().lieuxCSI || {})[selSv.value] || [];
      var avant = selLieu.value;
      vider(selLieu);
      lieux.forEach(function (l) { selLieu.appendChild(h('option', { value: l, text: l })); });
      selLieu.appendChild(h('option', { value: '__hors', text: lieu('Hors CSI (chambre)') }));
      if (avant && Array.prototype.some.call(selLieu.options, function (o) { return o.value === avant; })) selLieu.value = avant;
      var hors = selLieu.value === '__hors';
      chambre.hidden = !hors;
      blocException.hidden = !(hors && type.value === 'Contention');
      var isoEnCours = selPatient.value !== '__nouveau' && M.listeMesures(st()).some(function (m) { return m.patientId === selPatient.value && m.type === 'Isolement' && typeof m.fin !== 'number'; });
      blocIso.hidden = !(type.value === 'Contention' && !hors && !isoEnCours);
      alertes();
    }

    /** Recalcule toutes les alertes à chaque modification. */
    function alertes() {
      var p = patientChoisi(), tDebut = new Date(debut.value).getTime();
      if (!isFinite(tDebut)) tDebut = Date.now();
      var dn = (p && p.naissance) || naissance.value || '';
      var age = ageA(dn, tDebut);
      var libre = !M.estContrainte(config(), selMode.value);

      // Date de naissance
      var an = [];
      if (naissanceRequise() && naissance.value) {
        if (naissance.value > M.dateLocaleISO(Date.now())) an.push('Date de naissance dans le futur.');
        else if (age !== null && age > 110) an.push('Date de naissance invraisemblable (' + age + ' ans) : vérifiez la saisie.');
      }
      if (age !== null && age >= 0 && age < 18) an.push('Patient mineur (' + age + ' ans) : vigilance renforcée ; informer les titulaires de l’autorité parentale.');
      aNaissance.afficher(naissanceRequise() ? an : []);

      // Patient existant
      var ap = [];
      if (p) {
        if (age !== null && age >= 0 && age < 18) ap.push('Patient mineur (' + age + ' ans) : vigilance renforcée ; informer les titulaires de l’autorité parentale.');
        var c = M.cumulsPatient(st(), p.id, tDebut);
        if (c.niveau === 'rouge') ap.push('Cumul élevé sur 15 jours : isolement ' + duree(c.iso15) + ', contention ' + duree(c.cont15) + '. Les échéances JLD seront avancées.');
        if (p.protection) ap.push('Mesure de protection juridique : ' + p.protection + '. Penser à informer le représentant légal.');
      }
      aPatient.afficher(ap);

      // IPP déjà utilisé (nouveau patient)
      var dup = !p && ipp.value.trim() && Object.keys(st().patients).map(function (k) { return st().patients[k]; }).filter(function (x) { return x.ipp === ipp.value.trim(); })[0];
      aIpp.afficher(dup ? ['IPP déjà attribué à ' + (dup.nom || '') + ' ' + (dup.prenom || '') + ' : sa fiche sera proposée à l’enregistrement.'] : []);
      aNom.afficher(p || dup ? [] : SIC.ui.cas.alerteDoublons({ nom: nom.value.trim(), prenom: prenom.value.trim(), naissance: naissance.value }));

      // Mode d'hospitalisation
      var am = [];
      if (libre) am.push('Patient en soins libres : l’isolement et la contention sont réservés aux patients en soins sans consentement. Faire régulariser le mode d’hospitalisation sans délai.');
      if (selMode.value === 'SL mineur' && age !== null && age >= 18) am.push('Mode « SL mineur » alors que le patient est majeur (' + age + ' ans) : vérifiez le mode ou la date de naissance.');
      if (selMode.value !== 'SL mineur' && libre && age !== null && age < 18) am.push('Patient mineur en soins libres : utilisez le mode « SL mineur ».');
      aMode.afficher(am);

      // Type : mesure du même type déjà en cours
      var at = [];
      if (p) {
        M.listeMesures(st()).forEach(function (m) {
          if (m.patientId === p.id && typeof m.fin !== 'number' && (m.type === type.value || (!blocIso.hidden && avecIso.checked && m.type === 'Isolement')))
            at.push(m.type + ' déjà en cours pour ce patient depuis le ' + date(m.debut) + ' (' + (m.lieu || '') + ') : vérifiez qu’il ne s’agit pas d’un doublon.');
        });
      }
      var tRef = ailleurs.checked && debutInitial.value ? new Date(debutInitial.value).getTime() : tDebut;
      var aml = p && SIC.ui.cas.alerteMainlevee(p.id, type.value, tRef);
      if (aml) at.push(aml);
      aType.afficher(at);

      // Début
      var ad = [];
      if (ailleurs.checked) {
        var tIni = new Date(debutInitial.value).getTime();
        if (!debutInitial.value) ad.push('Indiquez la date et l’heure de la décision initiale.');
        else if (tIni >= tDebut) ad.push('La décision initiale doit précéder l’arrivée dans le service.');
        else if (tDebut - tIni > 15 * 24 * H) ad.push('Décision initiale il y a plus de 15 jours : vérifiez la saisie.');
      }
      if (tDebut > Date.now() + 10 * 60000) ad.push('Date de début dans le futur.');
      else if (Date.now() - tDebut > 24 * H) ad.push('Saisie tardive : début il y a ' + duree((Date.now() - tDebut) / H) + '. Les échéances JLD sont calculées depuis ce début et peuvent être proches ou dépassées.');
      aDebut.afficher(ad);

      // Lieu
      var al = [];
      if (selLieu.value === '__hors' && type.value === 'Contention' && !exception.checked) al.push('Contention hors espace d’isolement (catégorie D du registre) : à n’utiliser qu’à titre exceptionnel.');
      if (!((config().lieuxCSI || {})[selSv.value] || []).length) al.push(lieu('Aucun lieu de type « chambre de soins intensifs » n’est paramétré pour ce service.'));
      aLieu.afficher(al);

      // Alertes de l'établissement (Administration → Alertes)
      vider(aEtab);
      var faits = { type: type.value, csi: selLieu.value !== '__hors', service: selSv.value, libre: libre,
        mineur: (age !== null && age >= 0 && age < 18) || selMode.value === 'SL mineur', protection: p ? !!p.protection : !!protection.value, detenu: p ? !!p.detenu : detenu.checked };
      SIC.ui.alertes.encadres(faits).forEach(function (el) { aEtab.appendChild(el); });
      if (!blocIso.hidden && avecIso.checked && type.value === 'Contention') {
        // L'isolement créé avec la contention peut déclencher d'autres alertes
        var vus = {}; Array.prototype.forEach.call(aEtab.children, function (c) { vus[c.textContent] = 1; });
        SIC.ui.alertes.encadres(Object.assign({}, faits, { type: 'Isolement' })).forEach(function (el) { if (!vus[el.textContent]) aEtab.appendChild(el); });
      }
    }

    selSv.addEventListener('change', remplirPatients);
    selPatient.addEventListener('change', majPatient);
    type.addEventListener('change', majLieu);
    selLieu.addEventListener('change', majLieu);
    [naissance, ipp, debut, chambre, nom, prenom, debutInitial].forEach(function (x) { x.addEventListener('input', alertes); });
    ailleurs.addEventListener('change', function () { blocAilleurs.hidden = !ailleurs.checked; labelDebut.textContent = ailleurs.checked ? 'Date et heure de l’arrivée dans le service (sous la mesure)' : 'Date et heure de la décision de début'; alertes(); });
    [selMode, exception, avecIso, protection, detenu].forEach(function (x) { x.addEventListener('change', alertes); });
    remplirPatients();

    var corps = h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Service', selSv), h('label', {}, 'Patient', selPatient, aPatient)),
      blocNouveau, zoneNaissance,
      h('label', {}, "Mode d'hospitalisation", selMode, infoMode, aMode),
      h('div', { class: 'grille-2' }, h('label', {}, 'Type de mesure', type, aType), h('label', {}, labelDebut, debut, aDebut)),
      caseAilleurs, blocAilleurs,
      h('label', {}, 'Psychiatre décisionnaire', psy), motifRecours,
      h('label', {}, 'Lieu', selLieu, chambre, aLieu), blocException, blocIso, aEtab,
      h('p', { class: 'muted' }, h('small', { text: 'Vous reportez la décision médicale prise par le psychiatre ; la prescription reste dans le DPI.' })));

    modale('Nouvelle mesure — report de la décision médicale', corps, [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var tDebut = depuisSaisie(debut.value);
        if (tDebut > Date.now() + 10 * 60000) throw new Error('La date de début ne peut pas être dans le futur.');
        if (!peutFiche && !patientChoisi()) throw new Error('Choisissez la fiche du patient : la création d’une fiche est faite par un IDE, la secrétaire ou le cadre (onglet Patients).');
        if (!peutFiche && naissanceRequise()) throw new Error('La date de naissance manque sur la fiche de ce patient : demandez à un IDE, à la secrétaire ou au cadre de la compléter (onglet Patients).');
        if (naissanceRequise()) {
          if (!naissance.value) { naissance.focus(); throw new Error('Indiquez la date de naissance du patient.'); }
          if (naissance.value > M.dateLocaleISO(Date.now())) throw new Error('La date de naissance ne peut pas être dans le futur.');
          if (ageA(naissance.value, Date.now()) > 120) throw new Error('Date de naissance invraisemblable : vérifiez la saisie.');
        }
        var psyNom = psy.valeur();
        var hors = selLieu.value === '__hors';
        if (hors && !chambre.value.trim()) throw new Error('Indiquez la chambre.');
        if (!hors && !selLieu.value) throw new Error(lieu('Aucun lieu de type « chambre de soins intensifs » n’est paramétré pour ce service.'));
        var patientId = selPatient.value;
        var existant = patientId === '__nouveau' && ipp.value.trim() && Object.keys(st().patients).map(function (k) { return st().patients[k]; }).filter(function (p) { return p.ipp === ipp.value.trim(); })[0];
        if (existant) {
          if (!confirm('Un patient porte déjà l’IPP ' + existant.ipp + ' : ' + (existant.nom || '') + ' ' + (existant.prenom || '') + '. Utiliser sa fiche ?')) return false;
          patientId = existant.id;
          var maj = { patientId: patientId };
          if (existant.service !== selSv.value) maj.service = selSv.value;
          if (!existant.naissance && naissance.value) maj.naissance = naissance.value;
          if (Object.keys(maj).length > 1) await s.enregistrer('PATIENT', maj);
          if (modeActuel(existant) !== selMode.value) await s.enregistrer('MODE_HOSPI', { patientId: patientId, mode: selMode.value, date: tDebut });
        } else if (patientId === '__nouveau') {
          if (!nom.value.trim()) throw new Error('Indiquez le nom du patient.');
          patientId = 'P' + C.hex(C.aleatoire(5));
          await s.enregistrer('PATIENT', { patientId: patientId, ipp: ipp.value.trim(), nom: nom.value.trim().toUpperCase(), prenom: prenom.value.trim(), naissance: naissance.value, protection: protection.value, detenu: detenu.checked || undefined, service: selSv.value });
          await s.enregistrer('MODE_HOSPI', { patientId: patientId, mode: selMode.value, date: tDebut });
        } else {
          if (naissanceRequise()) await s.enregistrer('PATIENT', { patientId: patientId, naissance: naissance.value });
          if (modeActuel(patient(patientId)) !== selMode.value) await s.enregistrer('MODE_HOSPI', { patientId: patientId, mode: selMode.value, date: tDebut });
        }
        var crees = [];
        var tInitial = null;
        if (ailleurs.checked) {
          tInitial = depuisSaisie(debutInitial.value);
          if (!debutInitial.value || !isFinite(tInitial)) throw new Error('Indiquez la date et l’heure de la décision initiale.');
          if (tInitial >= tDebut) throw new Error('La décision initiale doit précéder l’arrivée dans le service.');
        }
        var commun = { patientId: patientId, service: selSv.value, debut: tDebut, debutInitial: tInitial == null ? undefined : tInitial, lieuInitial: tInitial == null ? undefined : lieuInitial.value.trim(), lieu: hors ? 'Chambre ' + chambre.value.trim() : selLieu.value, csi: !hors, psychiatre: psyNom, psychiatreId: psy.medecinId(), modeHospi: selMode.value, motifRecours: motifRecours && motifRecours.valeur() ? motifRecours.valeur() : undefined };
        if (!blocIso.hidden && avecIso.checked) { crees.push(idMesure()); await s.enregistrer('MESURE_DEBUT', Object.assign({ mesureId: crees[crees.length - 1], typeMesure: 'Isolement' }, commun)); }
        crees.push(idMesure());
        await s.enregistrer('MESURE_DEBUT', Object.assign({ mesureId: crees[crees.length - 1], typeMesure: type.value, exception: hors && type.value === 'Contention' && exception.checked }, commun));
        toast('Mesure enregistrée.');
        // Personnes à informer (alertes de l'établissement) : traçabilité demandée aussitôt
        setTimeout(function () { var l = SIC.ui.alertes.aTracer(crees); if (l.length && App.session.peut('INFORMATION')) SIC.ui.alertes.modaleInformations(l); }, 60);
      } }
    ]);
  }

  // ---------------------------------------------------------------- Fin
  function modaleFin(m) {
    var base = m.version;
    var pause = M.pauseEnCours(m, Date.now(), config());
    var fin = h('input', { type: 'datetime-local', value: versSaisie(pause ? pause.debut : Date.now()) });
    var psy = selectPsychiatre(nomMed(m.psychiatreDebut, m.psychiatreDebutId), m.service);
    var lies = M.listeMesures(st()).filter(function (x) { return x.patientId === m.patientId && x.id !== m.id && typeof x.fin !== 'number'; });
    var motif = h('select', {}, M.listesConfig(config()).motifsFin.map(function (x) { return h('option', { value: x, text: x, selected: m.leveeJLD ? x === 'Suite à la mainlevée du JLD' : false }); }));
    var precision = h('input', { type: 'text', placeholder: 'Précision (facultatif)' });
    var lblPrecision = h('label', {}, 'Précision', precision);
    var infoMotif = h('div', { class: 'alerte-etab information', hidden: true });
    function majMotif() {
      vider(infoMotif);
      var autre = motif.value === 'Autre';
      lblPrecision.firstChild.textContent = autre ? 'Motif (à préciser, obligatoire)' : 'Précision';
      precision.placeholder = autre ? 'Précisez le motif de fin' : 'Précision (facultatif)';
      var txt = motif.value === 'Décès' ? 'Décès pendant une mesure d’isolement ou de contention : s’il est inattendu au regard de l’état de santé du patient, c’est un événement indésirable grave associé à des soins, à déclarer sans délai à l’agence régionale de santé sur le portail de signalement (art. L. 1413-14 et R. 1413-67 et suivants du code de la santé publique), selon la procédure de l’établissement. Prévenir la direction et le cadre.'
        : motif.value === 'Fugue' ? 'Fugue : suivre la procédure de l’établissement (information de la direction, et du représentant de l’État pour un patient en SDRE).'
        : motif.value === 'Passage en soins somatiques ou aux urgences' ? 'Si la mesure doit se poursuivre pendant les soins somatiques, utilisez plutôt « Soins somatiques ou urgences… » dans le détail de la mesure.' : '';
      infoMotif.hidden = !txt; if (txt) infoMotif.appendChild(h('b', { text: txt }));
    }
    motif.addEventListener('change', majMotif); majMotif();
    modale('Fin de mesure — report de la décision médicale', h('div', { class: 'pile' }, recapMesure(m),
      pause ? h('div', { class: 'info', text: 'Mesure en pause depuis le ' + date(pause.debut) + '. Si elle n’a pas repris (le psychiatre décide de ne pas la reprendre), la fin correspond en principe au début de la pause : la date est préremplie ainsi. Modifiez-la si la décision est autre.' }) : null,
      h('label', {}, 'Date et heure de la décision de fin', fin), h('label', {}, 'Psychiatre décisionnaire', psy),
      h('div', { class: 'grille-2' }, h('label', {}, 'Motif de fin', motif), lblPrecision), infoMotif,
      lies.length ? h('div', { class: 'info', text: 'Autre mesure en cours pour ce patient : ' + lies.map(function (x) { return x.type + ' depuis ' + court(x.debut); }).join(', ') + '. Elle reste en cours.' }) : null,
      m.leveeJLD ? h('div', { class: 'info', text: 'Le JLD a ordonné la levée : à compter de cette fin, le cumul des 15 jours repartira de zéro pour ce patient et ce type de mesure.' }) : null), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer la fin', classe: 'primaire', action: async function () {
        var t = depuisSaisie(fin.value);
        if (t < m.debut) throw new Error('La fin ne peut pas précéder le début (' + date(m.debut) + ').');
        if (t > Date.now() + 10 * 60000) throw new Error('La date de fin ne peut pas être dans le futur.');
        if (motif.value === 'Autre' && !precision.value.trim()) throw new Error('Précisez le motif de fin.');
        await App.session.enregistrer('MESURE_FIN', { mesureId: m.id, fin: t, psychiatre: psy.valeur(), psychiatreId: psy.medecinId(), motif: motif.value + (precision.value.trim() ? ' (' + precision.value.trim() + ')' : '') }, base);
        toast('Fin de mesure enregistrée.');
      } }]);
  }

  // ---------------------------------------------------------------- Pause (levée temporaire)
  /** Mesures en cours de l'autre type pour le même patient (contentions d'un isolement, isolements d'une contention), en pause ou non. */
  function mesuresLiees(m, maintenant, enPause) {
    var autre = m.type === 'Isolement' ? 'Contention' : 'Isolement';
    return M.listeMesures(st()).filter(function (c) {
      return c.type === autre && c.patientId === m.patientId && c.id !== m.id && typeof c.fin !== 'number' && !!M.pauseEnCours(c, maintenant, config()) === enPause;
    });
  }
  function contentionsLiees(m, maintenant, enPause) { return m.type === 'Isolement' ? mesuresLiees(m, maintenant, enPause) : []; }

  function modalePause(m) {
    var maintenant = Date.now(), op = M.optionsPauses(config());
    if (!op.active) { toast('La levée temporaire est désactivée par l’administrateur.'); return; }
    var debut = h('input', { type: 'datetime-local', value: versSaisie(maintenant) });
    var mode = h('select', {}, h('option', { value: 'duree', text: 'Pour une durée' }), h('option', { value: 'heure', text: 'Jusqu’à une heure de reprise' }));
    var dH = h('input', { type: 'number', min: 0, max: 47, step: 1, value: 1, 'aria-label': 'Heures' });
    var dM = h('select', { 'aria-label': 'Minutes' }, [0, 15, 30, 45].map(function (x) { return h('option', { value: x, text: String(x).padStart(2, '0') + ' min' }); }));
    var dMinutes = [0, 15, 30, 45];
    var raccourcis = h('div', { class: 'raccourcis' }, M.listesConfig(config()).raccourcisPause.map(function (min) {
      return h('button', { type: 'button', class: 'btn petit', onclick: function () {
        dH.value = Math.floor(min / 60); var mm = min % 60;
        if (dMinutes.indexOf(mm) < 0) { dMinutes.push(mm); dM.appendChild(h('option', { value: mm, text: String(mm).padStart(2, '0') + ' min' })); }
        dM.value = mm; maj(); } }, M.libRaccourci(min));
    }));
    var blocDuree = h('label', {}, 'Durée de la pause', h('div', { class: 'en-ligne' }, dH, h('span', { text: 'h' }), dM), raccourcis);
    var reprise = h('input', { type: 'datetime-local', value: versSaisie(maintenant + H) });
    var blocHeure = h('label', { hidden: true }, 'Date et heure de reprise prévue', reprise);
    var resume = h('div', { class: 'info' });
    var psy = selectPsychiatre(nomMed(m.psychiatreDebut, m.psychiatreDebutId), m.service);
    var motif = h('select', {}, M.listesConfig(config()).motifsPause.map(function (x) { return h('option', { value: x, text: x }); }));
    var precision = h('input', { type: 'text', placeholder: 'Précision (facultatif)' });
    var conts = contentionsLiees(m, maintenant, false);
    var avecCont = h('input', { type: 'checkbox', checked: true });
    // Option « verrou » : la contention en cours doit être mise en pause aussi, ou terminée dans la même saisie.
    var choixCont = function (v, texte, coche) { return h('label', { class: 'case' }, h('input', { type: 'radio', name: 'sort-contention', value: v, checked: coche, onchange: function () { maj(); } }), h('span', { text: texte })); };
    var blocCont = !conts.length ? null : op.verrouContention
      ? h('fieldset', { class: 'choix-portee' }, h('legend', { text: 'Contention en cours (elle ne peut pas se poursuivre hors isolement)' }),
          choixCont('pause', 'Mettre aussi la contention en pause (même début, même reprise prévue)', true),
          choixCont('fin', 'Mettre fin à la contention au début de la pause (décision du même psychiatre)', false))
      : h('label', { class: 'case' }, avecCont, h('span', { text: 'Mettre aussi en pause la contention en cours (même début, même reprise prévue)' }));
    function sortContention() {
      if (!conts.length) return null;
      if (op.verrouContention) { var r = blocCont.querySelector('input:checked'); return r ? r.value : 'pause'; }
      return avecCont.checked ? 'pause' : 'continue';
    }
    // Pause d'une contention pendant un isolement : l'agent indique si la pause concerne aussi l'isolement.
    var isos = m.type === 'Contention' ? mesuresLiees(m, maintenant, false) : [];
    var choixPortee = function (v, texte) { return h('label', { class: 'case' }, h('input', { type: 'radio', name: 'portee-pause', value: v, onchange: function () { maj(); } }), h('span', { text: texte })); };
    var blocPortee = isos.length ? h('fieldset', { class: 'choix-portee' }, h('legend', { text: 'La pause concerne (à confirmer)' }),
      choixPortee('contention', 'La contention seulement : le patient reste à l’isolement'),
      choixPortee('les-deux', 'La contention et l’isolement : le patient sort de l’isolement pendant la pause')) : null;
    function portee() { var r = blocPortee && blocPortee.querySelector('input:checked'); return r ? r.value : null; }
    var aDebut = alerteChamp(), aReprise = alerteChamp(), aCont = alerteChamp();

    function bornes() {
      var t0 = depuisSaisie(debut.value), t1;
      if (mode.value === 'duree') {
        var minutes = (+dH.value || 0) * 60 + (+dM.value || 0);
        t1 = t0 + minutes * 60000;
      } else t1 = depuisSaisie(reprise.value);
      return { t0: t0, t1: t1, heures: (t1 - t0) / H };
    }
    function maj() {
      blocDuree.hidden = mode.value !== 'duree'; blocHeure.hidden = mode.value !== 'heure';
      var b; try { b = bornes(); } catch (e) { aDebut.afficher(['Date invalide.']); resume.textContent = ''; return; }
      aDebut.afficher([
        b.t0 < m.debut ? 'La pause ne peut pas commencer avant le début de la mesure (' + date(m.debut) + ').' : null,
        b.t0 > Date.now() + 10 * 60000 ? 'Le début de la pause ne peut pas être dans le futur : saisissez-la au moment où elle commence.' : null
      ]);
      aReprise.afficher([
        b.t1 <= b.t0 ? 'La reprise doit être postérieure au début de la pause.' : null,
        b.heures >= op.refusHeures ? 'À partir de ' + op.refusHeures + ' h, la pause n’est pas acceptée : saisissez la fin de la mesure.' : null,
        op.alerteHeures && b.heures > op.alerteHeures && b.heures < op.refusHeures ? 'Pause de plus de ' + op.alerteHeures + ' h : vérifiez auprès du psychiatre qu’il ne s’agit pas d’une fin de mesure.' : null
      ]);
      aCont.afficher([sortContention() === 'continue' ? 'Une contention ne peut pas se poursuivre hors isolement : mettez-la aussi en pause ou saisissez sa fin.' : null,
        sortContention() === 'fin' ? 'La fin de la contention sera enregistrée à l’heure du début de la pause (' + (function () { try { return date(bornes().t0); } catch (e) { return '—'; } })() + ').' : null,
        blocPortee && !portee() ? 'Indiquez si la pause concerne la contention seulement ou aussi l’isolement.' : null]);
      resume.textContent = b.t1 > b.t0 ? 'Reprise prévue le ' + date(b.t1) + ' (pause de ' + duree(b.heures) + ').' : '';
    }
    [debut, dH, dM, reprise, mode, avecCont].forEach(function (x) { x.addEventListener('input', maj); x.addEventListener('change', maj); });
    maj();

    modale('Pause — levée temporaire de la mesure', h('div', { class: 'pile' }, recapMesure(m, maintenant),
      h('p', { class: 'muted' }, h('small', { text: 'Report de la décision du psychiatre (repas, hygiène, visite…). La pause ne met pas fin à la mesure. ' +
        (op.retrancher ? 'Selon le paramétrage de l’établissement, sa durée est déduite du cumul et les échéances JLD sont reportées d’autant (jusqu’à l’heure de reprise prévue au plus). ' : 'Sa durée et les échéances JLD continuent de courir. ') +
        (op.repriseAuto ? 'La mesure reprendra automatiquement à l’heure prévue ; saisissez une reprise seulement si elle a lieu plus tôt. ' : 'Saisissez la reprise au retour du patient. ') +
        'Si le patient ne réintègre pas la mesure, saisissez la fin de mesure.' })),
      h('div', { class: 'grille-2' }, h('label', {}, 'Début de la pause', debut, aDebut), h('label', {}, 'Reprise', mode)),
      blocDuree, blocHeure, aReprise, resume,
      h('div', { class: 'grille-2' }, h('label', {}, 'Motif', motif), h('label', {}, 'Précision', precision)),
      h('label', {}, 'Psychiatre décisionnaire', psy),
      blocCont, blocPortee, aCont), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer la pause', classe: 'primaire', action: async function () {
        var b = bornes();
        if (b.t0 < m.debut) throw new Error('La pause ne peut pas commencer avant le début de la mesure.');
        if (b.t0 > Date.now() + 10 * 60000) throw new Error('Le début de la pause ne peut pas être dans le futur.');
        if (b.t1 <= b.t0) throw new Error('Indiquez une durée ou une heure de reprise postérieure au début de la pause.');
        if (b.heures >= op.refusHeures) throw new Error('Une pause de ' + op.refusHeures + ' h ou plus n’est pas acceptée : saisissez la fin de la mesure.');
        var nomPsy = psy.valeur();
        var texteMotif = motif.value + (precision.value.trim() ? ' — ' + precision.value.trim() : '');
        if (blocPortee && !portee()) throw new Error('Indiquez si la pause concerne la contention seulement ou aussi l’isolement.');
        var sort = sortContention();
        if (sort === 'fin') conts.forEach(function (c) { if (b.t0 < c.debut) throw new Error('La contention a commencé après le début de la pause : elle ne peut pas y prendre fin.'); });
        var cibles = [m].concat(sort === 'pause' ? conts : [], portee() === 'les-deux' ? isos : []);
        if (sort === 'fin') for (var k = 0; k < conts.length; k++) {
          await App.session.enregistrer('MESURE_FIN', { mesureId: conts[k].id, fin: b.t0, psychiatre: nomPsy, psychiatreId: psy.medecinId(), motif: 'Fin lors de la levée temporaire de l’isolement' }, conts[k].version);
        }
        for (var i = 0; i < cibles.length; i++) {
          await App.session.enregistrer('PAUSE', { mesureId: cibles[i].id, debut: Math.max(b.t0, cibles[i].debut), reprisePrevue: b.t1, psychiatre: nomPsy, psychiatreId: psy.medecinId(), motif: texteMotif }, cibles[i].version);
        }
        toast(sort === 'fin' ? 'Pause de l’isolement et fin de la contention enregistrées.' : cibles.length > 1 ? 'Pause enregistrée (isolement et contention).' : m.type === 'Contention' && isos.length ? 'Pause de la contention enregistrée ; l’isolement continue.' : 'Pause enregistrée.');
      } }]);
  }

  function modaleReprise(m) {
    var maintenant = Date.now();
    var p = M.pauseEnCours(m, maintenant, config());
    if (!p) return;
    var quand = h('input', { type: 'datetime-local', value: versSaisie(Math.min(maintenant, Math.max(p.reprisePrevue, p.debut))) });
    var conts = mesuresLiees(m, maintenant, true);
    var avecCont = h('input', { type: 'checkbox', checked: true });
    var aQuand = alerteChamp();
    function maj() {
      var t; try { t = depuisSaisie(quand.value); } catch (e) { aQuand.afficher(['Date invalide.']); return; }
      aQuand.afficher([
        t < p.debut ? 'La reprise ne peut pas précéder le début de la pause (' + date(p.debut) + ').' : null,
        t > Date.now() + 10 * 60000 ? 'La reprise ne peut pas être dans le futur.' : null,
        t > p.reprisePrevue + 15 * 60000 ? 'Reprise après l’heure prévue (' + date(p.reprisePrevue) + ') : vérifiez que la décision du psychiatre couvre ce délai.' : null
      ]);
    }
    quand.addEventListener('input', maj); quand.addEventListener('change', maj); maj();
    modale('Reprise de la mesure', h('div', { class: 'pile' }, recapMesure(m, maintenant),
      h('div', { class: 'recap' }, h('div', { text: 'En pause depuis le ' + date(p.debut) + (p.motif ? ' — ' + p.motif : '') + ' (' + (nomMed(p.psychiatre, p.psychiatreId) || '?') + ')' }), h('div', { text: 'Reprise prévue le ' + date(p.reprisePrevue) })),
      h('label', {}, 'Date et heure de la reprise effective', quand, aQuand),
      conts.length ? h('label', { class: 'case' }, avecCont, h('span', { text: m.type === 'Isolement' ? 'Reprendre aussi la contention en pause' : 'Reprendre aussi l’isolement en pause' })) : null,
      h('p', { class: 'muted' }, h('small', { text: 'Si le psychiatre décide de ne pas reprendre la mesure, fermez cette fenêtre et utilisez « Fin ».' }))), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer la reprise', classe: 'primaire', action: async function () {
        var t = depuisSaisie(quand.value);
        if (t < p.debut) throw new Error('La reprise ne peut pas précéder le début de la pause.');
        if (t > Date.now() + 10 * 60000) throw new Error('La reprise ne peut pas être dans le futur.');
        await App.session.enregistrer('REPRISE', { mesureId: m.id, pause: p.evt, date: t }, m.version);
        if (conts.length && avecCont.checked) for (var i = 0; i < conts.length; i++) {
          var pc = M.pauseEnCours(conts[i], Date.now(), config());
          if (pc) await App.session.enregistrer('REPRISE', { mesureId: conts[i].id, pause: pc.evt, date: Math.max(t, pc.debut) }, conts[i].version);
        }
        toast('Reprise enregistrée.');
      } }]);
  }

  // ---------------------------------------------------------------- Tiers
  /** Extrait de l'article L. 3222-5-1 (II) sur l'information de l'entourage, avec la décision QPC qui le concerne. */
  function extraitLoiTiers(ouvert) {
    return h('details', { class: 'extrait-loi', open: !!ouvert },
      h('summary', { text: 'Texte de loi : article L. 3222-5-1, II du code de la santé publique' }),
      h('blockquote', {},
        h('p', { text: '« Le médecin informe du renouvellement de ces mesures au moins un membre de la famille du patient, en priorité son conjoint, le partenaire lié à lui par un pacte civil de solidarité ou son concubin, ou une personne susceptible d’agir dans son intérêt dès lors qu’une telle personne est identifiée, dans le respect de la volonté du patient et du secret médical. »' }),
        h('p', { text: '« Le médecin réitère l’information susmentionnée lors de chaque saisine du juge des libertés et de la détention. »' })),
      h('small', { class: 'muted', text: 'Version en vigueur depuis le 1er septembre 2024.' }),
      h('div', { class: 'note-qpc' },
        h('b', { text: 'À savoir : décision du Conseil constitutionnel n° 2024-1127 QPC (question prioritaire de constitutionnalité) du 5 mars 2025' }),
        h('ul', {},
          h('li', {}, h('b', { text: 'Situation visée : ' }), 'le renouvellement d’un isolement ou d’une contention chez un patient majeur protégé (tutelle, curatelle…).'),
          h('li', {}, h('b', { text: 'Ce qui a été jugé : ' }), 'la loi n’obligeait pas à informer la personne chargée de la mesure de protection. Or un majeur protégé peut ne pas être en état de défendre seul ses droits, notamment de demander au juge la levée de la mesure. Le Conseil y a vu une atteinte au droit à un recours effectif devant un juge.'),
          h('li', {}, h('b', { text: 'Effet sur le texte : ' }), 'les mots « ou une personne susceptible d’agir dans son intérêt dès lors qu’une telle personne est identifiée » ont été déclarés contraires à la Constitution et ne sont plus applicables. Les mesures prises avant la décision ne peuvent pas être contestées pour ce motif.'),
          h('li', {}, h('b', { text: 'En pratique : ' }), 'informer la famille comme prévu ci-dessus et, pour un patient majeur protégé, informer aussi son tuteur ou son curateur à chaque renouvellement.'),
          h('li', {}, h('b', { text: 'Point à faire confirmer : ' }), 'la décision a été rendue sur la rédaction de l’article issue de la loi du 22 janvier 2022 ; Légifrance la signale sur la version actuelle, qui reprend les mêmes mots. Sa portée exacte est à valider par la direction des affaires juridiques de l’établissement.'))));
  }

  function modaleTiers(m) {
    var base = m.version;
    var statut = h('select', {}, Object.keys(LIB_TIERS).map(function (k) { return h('option', { value: k, text: LIB_TIERS[k] }); }));
    var personne = h('input', { type: 'text', placeholder: 'ex. Mère, personne de confiance, curateur' });
    var motif = h('input', { type: 'text', placeholder: 'Précision (facultatif)' });
    var fonctions = M.informateursTiers(config());
    var informateur = h('select', {}, fonctions.map(function (f) { return h('option', { value: f.code, text: f.psychiatre ? 'Le psychiatre' : f.libelle }); }));
    var psy = selectPsychiatre(nomMed(m.psychiatreDebut, m.psychiatreDebutId), m.service);
    var blocPsy = h('label', {}, 'Psychiatre ayant informé', psy);
    var nomAutre = h('input', { type: 'text', placeholder: 'Facultatif' });
    var blocNom = h('label', { hidden: true }, 'Nom de la personne ayant informé', nomAutre);
    informateur.addEventListener('change', function () { blocPsy.hidden = informateur.value !== 'PSYCHIATRE'; blocNom.hidden = !blocPsy.hidden; });
    var quand = h('input', { type: 'datetime-local', value: versSaisie(Date.now()) });
    var historique = m.tiers.length ? h('div', { class: 'recap' }, h('b', { text: 'Déjà saisi' }), m.tiers.map(function (t) {
      return h('div', { text: 'Cycle ' + t.cycle + ' — ' + (LIB_TIERS[t.statut] || t.statut) + (t.personne ? ' (' + t.personne + ')' : '') + ' le ' + date(t.date) + ', par ' + M.libInformateur(config(), t) });
    })) : null;
    modale('Information du tiers — cycle ' + m.cycle, h('div', { class: 'pile' }, recapMesure(m), historique,
      h('p', { class: 'muted' }, h('small', { text: 'L’article L. 3222-5-1 confie cette information au médecin ; l’établissement précise qui la réalise selon son organisation. Elle doit être renouvelée à chaque cycle, en même temps que l’information ou la saisine du juge.' })),
      patient(m.patientId).protection ? h('div', { class: 'alerte-etab information' }, h('b', { text: 'Patient sous ' + patient(m.patientId).protection.toLowerCase() + ' : à chaque renouvellement, informer aussi la personne chargée de la mesure de protection (tuteur, curateur…), en plus de la famille. Voir « À savoir » sous le texte de loi.' })) : null,
      extraitLoiTiers(false),
      h('div', { class: 'grille-2' }, h('label', {}, 'Résultat', statut), h('label', {}, 'Tiers (qualité)', personne)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Information faite par', informateur), h('label', {}, 'Date et heure', quand)),
      blocPsy, blocNom, h('label', {}, 'Précision', motif)), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var parPsy = informateur.value === 'PSYCHIATRE';
        await App.session.enregistrer('TIERS', { mesureId: m.id, cycle: m.cycle, statut: statut.value, personne: personne.value.trim(), informateur: informateur.value, nomInformateur: parPsy ? psy.valeur() : nomAutre.value.trim(), date: depuisSaisie(quand.value), motif: motif.value.trim() }, base);
        toast('Information du tiers enregistrée.');
      } }]);
  }

  // ---------------------------------------------------------------- JLD
  function modaleJLD(m) {
    var base = m.version, maintenant = Date.now();
    var j = M.suiviJLD(st(), m, maintenant);
    var p = prochaineEcheance(j);
    var nature = h('select', {}, Object.keys(LIB_NATURE).map(function (k) { return h('option', { value: k, text: LIB_NATURE[k], selected: p && p.nature === k }); }));
    var quand = h('input', { type: 'datetime-local', value: versSaisie(maintenant) });
    var decision = h('select', {}, h('option', { value: 'MAINTIEN', text: 'Maintien de la mesure' }), h('option', { value: 'LEVEE', text: 'Levée de la mesure' }));
    var blocDecision = h('label', {}, 'Décision du juge', decision);
    var infoLevee = h('div', { class: 'info', hidden: true, text: 'La levée est un indicateur légal : la mesure reste en cours jusqu’au report de la décision médicale de fin. Aucune nouvelle mesure ne pourra être prise pendant 48 h, sauf éléments nouveaux (le JLD est alors informé sans délai).' });
    function maj() { blocDecision.hidden = nature.value !== 'DECISION'; infoLevee.hidden = blocDecision.hidden || decision.value !== 'LEVEE'; }
    nature.addEventListener('change', maj); decision.addEventListener('change', maj); maj();
    var tiers = M.tiersCycle(m);
    modale('Envoi au JLD ou décision reçue — cycle ' + j.cycle, h('div', { class: 'pile' }, recapMesure(m, maintenant),
      h('div', { class: 'recap' },
        h('div', {}, 'Information avant : ', cellEcheance(j.info)),
        h('div', {}, 'Saisine avant : ', cellEcheance(j.saisine)),
        h('div', {}, 'Décision avant : ', cellEcheance(j.decision))),
      tiers ? null : h('div', { class: 'alerte', text: 'Rappel : le tiers n’a pas encore été renseigné pour ce cycle. L’envoi peut néanmoins se poursuivre.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Nature', nature), h('label', {}, 'Date et heure', quand)),
      blocDecision, infoLevee), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var n = nature.value, t = depuisSaisie(quand.value);
        if (m.jld[j.cycle] && m.jld[j.cycle][n] && !confirm(LIB_NATURE[n] + ' déjà saisie pour ce cycle (' + date(m.jld[j.cycle][n].date) + '). Enregistrer une nouvelle saisie ?')) return false;
        await App.session.enregistrer('JLD', { mesureId: m.id, cycle: j.cycle, nature: n, date: t, decision: n === 'DECISION' ? decision.value : null }, base);
        var ech = n === 'INFO' ? j.info.echeance : n === 'SAISINE' ? j.saisine.echeance : j.decision.echeance;
        if (n === 'DECISION' && decision.value === 'MAINTIEN') toast('Maintien enregistré : cycle ' + (j.cycle + 1) + ' ouvert. Le tiers doit être informé de ce renouvellement.');
        else toast(t > ech ? 'Enregistré — hors délai (échéance ' + date(ech) + ').' : 'Enregistré.');
      } }]);
  }

  // ---------------------------------------------------------------- Détail
  function modaleDetail(m) {
    var maintenant = Date.now(), j = M.suiviJLD(st(), m, maintenant);
    var evts = Object.keys(st().parId).map(function (k) { return st().parId[k]; }).filter(function (e) { return e.data && e.data.mesureId === m.id; })
      .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id < b.id ? -1 : 1); });
    var peutCorriger = App.session.peut('CORRECTION');
    var corps = h('div', { class: 'pile' }, recapMesure(m, maintenant),
      h('div', { class: 'recap' },
        h('div', { text: 'Cycle JLD en cours : ' + j.cycle + (j.rythmeLong ? ' (rythme des mesures longues)' : '') + ' · cumul des 15 jours avant la mesure : ' + duree(j.cumulAvant) }),
        h('div', { text: 'Mode d’hospitalisation retenu : ' + (M.modeRetenu(st(), m).mode || '—') }),
        m.debutInitial ? h('div', { text: 'Mesure débutée le ' + date(m.debutInitial) + (m.lieuInitial ? ' (' + m.lieuInitial + ')' : '') + ', arrivée dans le service le ' + date(m.debut) + ' : délais JLD et cumuls depuis la décision initiale, registre depuis l’arrivée.' }) : null,
        j.apresMainlevee ? h('div', { class: 'texte-bad', text: 'Mesure décidée moins de 48 h après la mainlevée ordonnée par le JLD le ' + date(j.apresMainlevee.date) + (M.optionsCas(config()).mainleveeInfoSansDelai ? ' : information du JLD due sans délai.' : '.') }) : null,
        m.fin ? h('div', { text: 'Fin : ' + date(m.fin) + ' (' + (nomMed(m.psychiatreFin, m.psychiatreFinId) || '?') + ')' }) : null),
      (m.pauses || []).length ? h('div', { class: 'recap' },
        h('b', { text: 'Levées temporaires (' + m.pauses.length + ', total ' + duree(M.dureePausesHeures(m, maintenant, config())) + (M.optionsPauses(config()).retrancher ? ', déduites du cumul, échéances reportées d’autant' : ', comptées dans le cumul') + ')' }),
        m.pauses.map(function (p) {
          var effective = p.reprise != null ? 'reprise le ' + date(p.reprise)
            : M.repriseAutomatique(m, p, maintenant, config()) ? 'reprise automatique le ' + date(p.reprisePrevue)
            : (typeof m.fin === 'number' ? 'fin de mesure pendant la pause' : (maintenant > p.reprisePrevue ? 'reprise non confirmée' : 'en cours'));
          return h('div', { text: date(p.debut) + ' → reprise prévue ' + date(p.reprisePrevue) + ' — ' + effective + (p.motif ? ' — ' + p.motif : '') + ' (' + (nomMed(p.psychiatre, p.psychiatreId) || '?') + ')' });
        })) : null,
      SIC.ui.alertes.detailMesure(m),
      SIC.ui.parcours.detailMesure(m),
      SIC.ui.qualite.detailMesure(m),
      (function () {
        var props = M.propositionsEnAttente(st(), function (x) { return x.id === m.id; });
        if (!props.length) return null;
        return h('div', { class: 'recap' }, h('b', { text: 'Correction proposée, en attente du cadre' }), props.map(function (p) {
          return h('div', {}, Object.keys(p.champs).map(function (k) { return (lieu(LIB_CHAMPS[k]) || k) + ' → ' + valeurChamp(k, p.champs[k]); }).join(' ; ') + ' (' + App.session.nomAuteur(p.by) + ', ' + (p.motif || '') + ') ',
            peutCorriger ? h('button', { class: 'btn petit', onclick: function () { var dlg = document.querySelector('dialog'); if (dlg) dlg.dispatchEvent(new Event('cancel')); setTimeout(function () { modaleProposition(p); }, 30); } }, 'Examiner') : null);
        }));
      })(),
      m.motifFin ? h('div', { class: 'recap', text: 'Motif de fin : ' + m.motifFin }) : null,
      h('h3', { text: 'Historique' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, evts.map(function (e) {
        var annule = st().annules[e.id];
        return h('tr', { class: annule ? 'ancienne' : '' },
          h('td', { class: 'nowrap', text: date(Date.parse(e.at)) }),
          h('td', { text: App.session.nomAuteur(e.by) }),
          h('td', {}, resumeEvt(e), annule ? h('span', { class: 'badge', text: ' annulée' }) : null),
          h('td', { class: 'actions-ligne' }, App.session.peut('ANNULATION') && !annule ? h('button', { class: 'btn petit', onclick: async function () {
            var motif = prompt(e.type === 'MESURE_DEBUT' ? 'Annuler le début annule toute la mesure (doublon, mauvais patient…). Motif :' : 'Motif de l’annulation de cette saisie :');
            if (!motif) return;
            await App.session.enregistrer('ANNULATION', { cible: e.id, motif: motif });
            toast('Saisie annulée.');
            var dlg = document.querySelector('dialog'); if (dlg) dlg.dispatchEvent(new Event('cancel'));
          } }, 'Annuler') : null));
      })))));
    var boutons = [{ texte: 'Fermer' }];
    if (typeof m.fin === 'number' && M.optionsQualite(config()).entretien && App.session.peut('ENTRETIEN')) boutons.unshift({ texte: M.optionsQualite(config()).nomEntretien + '…', action: function () { setTimeout(function () { SIC.ui.qualite.modaleEntretien(m); }, 0); return true; } });
    if (App.session.peut('RECOURS')) boutons.unshift({ texte: 'Recours ou appel…', action: function () { setTimeout(function () { SIC.ui.parcours.modaleRecours(m); }, 0); return true; } });
    if (typeof m.fin !== 'number' && !m.somatique && App.session.peut('SOMATIQUE')) boutons.unshift({ texte: 'Soins somatiques ou urgences…', action: function () { setTimeout(function () { SIC.ui.parcours.modaleSomatique(m); }, 0); return true; } });
    if (typeof m.fin !== 'number' && App.session.peut('TRANSFERT')) boutons.unshift({ texte: 'Transfert vers un autre service…', action: function () { setTimeout(function () { SIC.ui.parcours.modaleTransfert(m); }, 0); return true; } });
    if (typeof m.fin !== 'number' && App.session.peut('MESURE_FIN') && App.session.peut('MESURE_DEBUT')) boutons.unshift({ texte: 'Changer de lieu…', action: function () { setTimeout(function () { modaleLieu(m); }, 0); return true; } });
    if (peutCorriger) boutons.unshift({ texte: 'Corriger…', action: function () { setTimeout(function () { modaleCorrection(m); }, 0); return true; } });
    else if (App.session.peut('PROPOSITION')) boutons.unshift({ texte: 'Proposer une correction…', action: function () { setTimeout(function () { modaleCorrection(m, true); }, 0); return true; } });
    modale('Détail de la mesure', corps, boutons);
  }

  /** Changement réel de lieu : la mesure en cours prend fin et une mesure du même type commence au nouveau lieu (comme en V1.3). */
  function modaleLieu(m) {
    var base = m.version;
    var quand = h('input', { type: 'datetime-local', value: versSaisie(Date.now()) });
    var lieux = (config().lieuxCSI || {})[m.service] || [];
    var selLieu = h('select', {}, lieux.filter(function (l) { return l !== m.lieu; }).map(function (l) { return h('option', { value: l, text: l }); }), h('option', { value: '__hors', text: lieu('Hors CSI (chambre)') }));
    var chambre = h('input', { type: 'text', placeholder: 'N° de chambre', hidden: selLieu.value !== '__hors' });
    selLieu.addEventListener('change', function () { chambre.hidden = selLieu.value !== '__hors'; });
    var psy = selectPsychiatre(nomMed(m.psychiatreDebut, m.psychiatreDebutId), m.service);
    modale('Changement de lieu', h('div', { class: 'pile' }, recapMesure(m),
      h('div', { class: 'info', text: 'Pour une erreur de saisie, utilisez « Corriger » (cadre de santé). Un changement réel de lieu termine la mesure en cours et en ouvre une nouvelle du même type au nouveau lieu, à la même heure. Les échéances JLD de la nouvelle mesure tiennent compte du cumul des 15 derniers jours.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Date et heure du changement', quand), h('label', {}, 'Nouveau lieu', selLieu, chambre)),
      h('label', {}, 'Psychiatre décisionnaire', psy)), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer le changement', classe: 'primaire', action: async function () {
        var t = depuisSaisie(quand.value), hors = selLieu.value === '__hors';
        if (t <= m.debut) throw new Error('Le changement doit être postérieur au début de la mesure.');
        if (t > Date.now() + 10 * 60000) throw new Error('La date ne peut pas être dans le futur.');
        if (hors && !chambre.value.trim()) throw new Error('Indiquez la chambre.');
        var nomPsy = psy.valeur();
        await App.session.enregistrer('MESURE_FIN', { mesureId: m.id, fin: t, psychiatre: nomPsy, psychiatreId: psy.medecinId(), motif: 'Changement de lieu' }, base);
        await App.session.enregistrer('MESURE_DEBUT', { mesureId: idMesure(), patientId: m.patientId, service: m.service, typeMesure: m.type, debut: t, lieu: hors ? 'Chambre ' + chambre.value.trim() : selLieu.value, csi: !hors, psychiatre: nomPsy, psychiatreId: psy.medecinId(), exception: false, modeHospi: m.modeHospi, suiteDe: m.id });
        toast('Changement de lieu enregistré.');
      } }]);
  }

  function modaleCorrection(m, proposer) {
    var base = m.version;
    var debut = h('input', { type: 'datetime-local', value: versSaisie(m.debut) });
    var fin = h('input', { type: 'datetime-local', value: m.fin ? versSaisie(m.fin) : '' });
    var lieu = h('input', { type: 'text', value: m.lieu });
    var motif = h('input', { type: 'text', placeholder: 'Motif obligatoire' });
    modale(proposer ? 'Proposer une correction (validée ensuite par le cadre)' : 'Correction (cadre de santé)', h('div', { class: 'pile' }, recapMesure(m),
      h('p', { class: 'muted', text: proposer ? 'La correction n’est appliquée qu’après validation par le cadre de santé ; d’ici là, la mesure garde ses valeurs et un signalement « Correction proposée » s’affiche. Tout est tracé au journal.' : 'La saisie d’origine est conservée ; la correction est tracée avec son motif.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Début', debut), h('label', {}, 'Fin', fin)),
      h('label', {}, 'Lieu', lieu), h('label', {}, 'Motif', motif)), [
      { texte: 'Annuler' },
      { texte: proposer ? 'Proposer la correction' : 'Enregistrer la correction', classe: 'primaire', action: async function () {
        if (!motif.value.trim()) throw new Error('Le motif est obligatoire.');
        var ch = {};
        var d = depuisSaisie(debut.value); if (d !== m.debut) ch.debut = d;
        if (fin.value) { var f = depuisSaisie(fin.value); if (f !== m.fin) ch.fin = f; if (f < d) throw new Error('La fin précède le début.'); }
        if (lieu.value.trim() !== m.lieu) ch.lieu = lieu.value.trim();
        if (!Object.keys(ch).length) throw new Error('Aucune modification.');
        if (proposer) { await App.session.enregistrer('PROPOSITION', { mesureId: m.id, champs: ch, motif: motif.value.trim() }, base); toast('Correction proposée : elle sera validée par le cadre.'); return; }
        await App.session.enregistrer('CORRECTION', { mesureId: m.id, champs: ch, motif: motif.value.trim() }, base);
        toast('Correction enregistrée.');
      } }]);
  }

  /** Examen par le cadre d'une correction proposée par un IDE ou un AS. */
  function modaleProposition(p) {
    var m = st().mesures[p.mesureId];
    var motifRefus = h('input', { type: 'text', placeholder: 'Obligatoire pour refuser' });
    modale('Correction proposée', h('div', { class: 'pile' }, recapMesure(m),
      h('div', { class: 'recap' },
        h('div', { text: 'Proposée par ' + App.session.nomAuteur(p.by) + ' le ' + date(Date.parse(p.at)) + '. Motif : ' + (p.motif || 'non précisé') + '.' }),
        Object.keys(p.champs).map(function (k) { return h('div', {}, h('b', { text: (lieu(LIB_CHAMPS[k]) || k) + ' : ' }), valeurChamp(k, m[k]) + ' → ' + valeurChamp(k, p.champs[k])); })),
      h('label', {}, 'Motif du refus', motifRefus)), [
      { texte: 'Fermer' },
      { texte: 'Refuser', classe: 'danger', action: async function () {
        if (!motifRefus.value.trim()) { motifRefus.focus(); throw new Error('Indiquez le motif du refus.'); }
        await App.session.enregistrer('REFUS_PROPOSITION', { mesureId: m.id, proposition: p.id, motif: motifRefus.value.trim() }, m.version);
        toast('Correction refusée.');
      } },
      { texte: 'Valider la correction', classe: 'primaire', action: async function () {
        if (p.champs.fin != null && p.champs.fin < (p.champs.debut != null ? p.champs.debut : m.debut)) throw new Error('La fin proposée précède le début.');
        await App.session.enregistrer('CORRECTION', { mesureId: m.id, champs: p.champs, motif: 'Correction proposée par ' + App.session.nomAuteur(p.by) + ' : ' + (p.motif || 'non précisé'), proposition: p.id }, m.version);
        toast('Correction validée.');
      } }]);
  }

  // ---------------------------------------------------------------- Professionnel
  /** Fonction de l'agent connecté dans la liste des fonctions de surveillance (d'après le code ou le libellé de ses rôles). */
  function fonctionDe(u) {
    var liste = M.listesConfig(config()).fonctionsSurveillance, norm = function (t) { return String(t).toLowerCase(); };
    var cands = [];
    (u.roles || []).forEach(function (r) { if (r !== 'ADMIN') cands.push(r, M.libRole(config(), r)); });
    if (cands.map(norm).indexOf('cadre') >= 0) cands.push('Cadre de santé');
    for (var i = 0; i < cands.length; i++) { var t = liste.filter(function (f) { return norm(f) === norm(cands[i]); })[0]; if (t) return t; }
    return '';
  }
  /** « M'ajouter » : l'agent connecté est enregistré pour ce poste (tous les lieux), en un clic. */
  async function ajouterMoi(service, p) {
    var u = App.session.utilisateur;
    var data = { service: service, date: p.date, periode: p.periode, nom: u.nom, fonction: fonctionDe(u) || '' };
    await App.session.enregistrer('PROFESSIONNEL', data);
    toast(u.nom + ' enregistré(e) pour le poste « ' + p.libelle + ' ». Pour préciser les lieux, utilisez « Ajouter ».');
  }

  function modaleProfessionnel(service, dateISO, periode) {
    var selSv = h('select', {}, services().map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === service }); }));
    var jour = h('input', { type: 'date', value: dateISO || M.dateLocaleISO(Date.now()) });
    var selP = h('select', {}, (config().periodes || []).map(function (p) { return h('option', { value: p.code, text: p.libelle + ' (' + p.debut + '–' + p.fin + ')', selected: p.code === periode }); }));
    function norm(t) { return String(t || '').trim().toLowerCase(); }

    // Agents de l'équipe : comptes portant un rôle choisi par l'établissement (IDE et AS par défaut), cochés en un clic
    var zoneAgents = h('div', { class: 'liste-agents' }), filtre = h('input', { type: 'search', placeholder: 'Rechercher un nom…', 'aria-label': 'Rechercher un agent' });
    var cases = [];
    function inscrits() {
      return st().professionnels.filter(function (x) { return x.service === selSv.value && x.date === jour.value && x.periode === selP.value; }).map(function (x) { return norm(x.nom); });
    }
    function majAgents() {
      vider(zoneAgents); cases = [];
      var deja = inscrits(), moiId = App.session.utilisateur.id;
      var agents = M.agentsSurveillance(App.session.comptes, config(), selSv.value, jour.value);
      if (!agents.length) zoneAgents.appendChild(h('small', { class: 'muted', text: 'Aucun compte proposé pour ce service (réglage : Administration → Établissement et services → Postes de surveillance). Utilisez « Autre personne ».' }));
      agents.forEach(function (c) {
        var inscrit = deja.indexOf(norm(c.nom)) >= 0, f = fonctionDe(c) || M.libRole(config(), (c.roles || [])[0]);
        var cb = h('input', { type: 'checkbox', checked: inscrit, disabled: inscrit });
        var lbl = h('label', { class: 'case agent' + (inscrit ? ' inscrit' : '') }, cb,
          h('span', { text: c.nom + (c.id === moiId ? ' (vous)' : '') }), h('small', { class: 'muted', text: ' ' + f + (inscrit ? ' — déjà inscrit(e)' : '') }));
        cases.push({ compte: c, cb: cb, lbl: lbl, fonction: f, inscrit: inscrit });
        zoneAgents.appendChild(lbl);
      });
      filtre.hidden = agents.length < 8;
      appliquerFiltre();
      moi.hidden = agents.some(function (c) { return c.id === moiId; });
    }
    function appliquerFiltre() { var q = norm(filtre.value); cases.forEach(function (x) { x.lbl.hidden = !!q && norm(x.compte.nom).indexOf(q) < 0; }); }
    filtre.addEventListener('input', appliquerFiltre);

    // Autre personne, non listée (intérimaire, renfort, étudiant…) : noms déjà saisis dans ce service proposés
    var nom = h('input', { type: 'text', placeholder: 'Prénom NOM', list: 'noms-surveillance', autocomplete: 'off' });
    var fonction = h('select', {}, M.listesConfig(config()).fonctionsSurveillance.map(function (x) { return h('option', { value: x, text: x }); }));
    var listeNoms = h('datalist', { id: 'noms-surveillance' });
    var moi = h('button', { type: 'button', class: 'btn petit', onclick: function () {
      var u = App.session.utilisateur; nom.value = u.nom; var f = fonctionDe(u); if (f) fonction.value = f;
    } }, 'Moi-même');
    function majNoms() {
      vider(listeNoms);
      var comptes = (App.session.comptes || []).map(function (c) { return norm(c.nom); }), vus = {}, limite = Date.now() - 90 * 86400000;
      st().professionnels.filter(function (x) { return x.service === selSv.value && Date.parse(x.date) >= limite; }).slice().reverse().forEach(function (x) {
        var k = norm(x.nom); if (!k || vus[k] || comptes.indexOf(k) >= 0) return; vus[k] = 1;
        listeNoms.appendChild(h('option', { value: x.nom }));
        if (x.fonction) nomsFonctions[k] = x.fonction;
      });
    }
    var nomsFonctions = {};
    nom.addEventListener('change', function () { var f = nomsFonctions[norm(nom.value)]; if (f && Array.prototype.some.call(fonction.options, function (o) { return o.value === f; })) fonction.value = f; });

    var ajoutes = h('div', { class: 'recap', hidden: true });
    // Lieux surveillés : tous par défaut ; l'agent peut préciser (s'applique à toutes les personnes de la saisie)
    var tous = h('input', { type: 'checkbox', checked: true }), zoneLieux = h('div', { class: 'cases-ligne', hidden: true }), casesLieux = {};
    var blocLieux = h('fieldset', {}, h('legend', { text: lieu('Lieux surveillés') }),
      h('label', { class: 'case' }, tous, h('span', { text: lieu('Tous les lieux (CSI) du service') })), zoneLieux);
    function majLieux() {
      vider(zoneLieux); casesLieux = {};
      var lieux = (config().lieuxCSI || {})[selSv.value] || [];
      blocLieux.hidden = !lieux.length;
      lieux.forEach(function (l) { casesLieux[l] = h('input', { type: 'checkbox' }); zoneLieux.appendChild(h('label', { class: 'case' }, casesLieux[l], h('span', { text: l }))); });
      zoneLieux.hidden = tous.checked;
    }
    tous.addEventListener('change', function () { zoneLieux.hidden = tous.checked; });
    function majTout() { majLieux(); majAgents(); majNoms(); }
    selSv.addEventListener('change', majTout);
    [jour, selP].forEach(function (x) { x.addEventListener('change', majAgents); });
    majTout();
    function lieuxChoisis() {
      if (tous.checked || blocLieux.hidden) return [];
      var l = Object.keys(casesLieux).filter(function (k) { return casesLieux[k].checked; });
      if (!l.length) throw new Error('Cochez au moins un lieu, ou « Tous les lieux ».');
      return l;
    }
    /** Enregistre les agents cochés et la personne saisie ; retourne les libellés enregistrés. */
    async function enregistrer() {
      if (!jour.value) throw new Error('Indiquez la date.');
      var personnes = cases.filter(function (x) { return x.cb.checked && !x.inscrit; }).map(function (x) { return { nom: x.compte.nom, fonction: x.fonction }; });
      var autre = nom.value.trim();
      if (autre) {
        if (personnes.some(function (p) { return norm(p.nom) === norm(autre); }) || inscrits().indexOf(norm(autre)) >= 0) throw new Error(autre + ' est déjà inscrit(e) pour ce poste.');
        personnes.push({ nom: autre, fonction: fonction.value });
      }
      if (!personnes.length) throw new Error('Cochez au moins un agent, ou indiquez le nom d’une autre personne.');
      var l = lieuxChoisis(), faits = [];
      for (var i = 0; i < personnes.length; i++) {
        var data = { service: selSv.value, date: jour.value, periode: selP.value, nom: personnes[i].nom, fonction: personnes[i].fonction };
        if (l.length) data.lieux = l;
        await App.session.enregistrer('PROFESSIONNEL', data);
        faits.push(personnes[i].nom + ' (' + personnes[i].fonction + ')' + (l.length ? ' — ' + l.join(', ') : ''));
      }
      return faits;
    }
    modale('Professionnels chargés de la surveillance', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Service', selSv), h('label', {}, 'Date', jour)),
      h('label', {}, 'Période', selP),
      h('fieldset', {}, h('legend', { text: 'Agents de l’équipe (cochez les présents)' }), filtre, zoneAgents),
      h('fieldset', {}, h('legend', { text: 'Autre personne, non listée (intérim, renfort, étudiant…)' }),
        h('div', { class: 'grille-2' }, h('label', {}, 'Nom', h('div', { class: 'en-ligne' }, nom, moi)), h('label', {}, 'Fonction', fonction)), listeNoms),
      blocLieux, ajoutes), [
      { texte: 'Fermer' },
      { texte: 'Enregistrer et continuer', action: async function () {
        var faits = await enregistrer();
        ajoutes.hidden = false; faits.forEach(function (t) { ajoutes.appendChild(h('div', { text: '✓ ' + t })); });
        nom.value = ''; majAgents(); majNoms();
        return false;
      } },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () { var faits = await enregistrer(); toast(faits.length > 1 ? faits.length + ' professionnels enregistrés.' : 'Professionnel enregistré.'); } }
    ]);
  }


  // ================================================================ Journal : libellés lisibles
  var LIB_ONGLET_MASQUABLE = { tableau: 'Tableau de bord', mesures: 'Mesures', patients: 'Patients', jld: 'JLD', surveillance: 'Surveillance CSI', registre: 'Registre', stats: 'Statistiques' };
  var LIB_CONFIG = {
    agendaReglages: 'Agenda : réglages par service', travaux: 'Demandes de travaux : réglages', messagerie: 'Messagerie : réglages', intervenants: 'Prise en charge : types et champs',
    etablissement: 'Nom de l’établissement', services: 'Services', modulesServices: 'Modules activés par service', fichePatient: 'Fiche patient par service (psychiatrie, libellés des médecins)', importPatients: 'Modèles d’import de la liste des patients (DPI)', patientsListe: 'Liste des patients : sorties récentes, couleurs des modes, affichages par défaut', patientsChamps: 'Fiche patient : données complémentaires (par service et par rôle)', champsAjoutes: 'Données ajoutées (patients, médecins ; types, droits, protection)', reglagesDonnees: 'Réglages des données (couleurs, délais)', capacites: 'Capacité d’accueil des services', vuesEnsemble: 'Vue d’ensemble : vues, colonnes, groupes, synthèse', psychologues: 'Liste commune des psychologues', largeursColonnes: 'Largeur des colonnes (tableaux d’Isocont)', vehicules: 'Véhicules : types de véhicules et de signalements, données ajoutées', groupes: 'Groupes d’agents', medecins: 'Liste commune des médecins', suiviMedical: 'Suivi médical : délais d’alerte, gardes et astreintes, lieux de présence', vehiculesInformation: 'Véhicules : destinataires de l’information d’une pré-réservation remplacée', agenda: 'Agenda : identité du patient, types d’alertes, tâches, check-lists, couleurs, validation des permissions', exports: 'Dossier des exports', surveillance: 'Surveillance : professionnels attendus par poste', roles: 'Rôles et accès', organisationJLD: 'Organisation des envois au JLD', verificationVersion: 'Vérification de la version (page GitHub)', listes: 'Listes de saisie (fonctions, motifs, raccourcis)', miroir: 'Dossier de secours', verrouDossier: 'Choix du dossier bloqué sur les postes', vigilance: 'Seuils des points de vigilance', affichage: 'Affichage (mesures terminées, connexion, logo)', lieuIsolement: 'Appellation des lieux dédiés à l’isolement', lieuxCSI: 'Chambres de soins intensifs', psychiatres: 'Liste des psychiatres',
    periodes: 'Postes de surveillance par défaut', periodesService: 'Postes de surveillance propres aux services', modesHospitalisation: 'Modes d’hospitalisation',
    parametres: 'Règles légales (seuils et cycles JLD)', delaiModeHospiHeures: 'Délai de bascule du mode d’hospitalisation (registre)',
    compteursRegistre: 'Numérotation du registre antérieur', decompte: 'Masques du décompte JLD', imagesDecompte: 'Papier à en-tête du décompte',
    inactiviteMinutes: 'Verrouillage après inactivité', pauses: 'Pauses (levées temporaires)', alertes: 'Alertes de l’établissement', casParticuliers: 'Cas particuliers', qualite: 'Qualité, conservation et archivage', statsMethode: 'Méthode des statistiques', sauvegarde: 'Rappel des copies de sauvegarde', informateursTiers: 'Fonctions pouvant informer le tiers', rapportsAnnuels: 'Textes du rapport annuel', colonnesPatients: 'Statistiques annuelles de l’onglet Patients', derniersClasseur: 'Derniers numéros du document importé', registreFige: 'Années gardant la numérotation du classeur', registreFigeMesures: 'Numérotation décidée mesure par mesure'
  };
  var LIB_CHAMPS = { debut: 'début', fin: 'fin', lieu: 'lieu', csi: 'en CSI', psychiatreDebut: 'psychiatre (début)', psychiatreFin: 'psychiatre (fin)', modeHospi: 'mode d’hospitalisation', exception: 'exception (contention hors espace d’isolement)', debutInitial: 'début de la décision initiale (avant l’arrivée)', lieuInitial: 'lieu d’origine', type: 'type de mesure' };

  var indexJournal = { etat: null, debuts: {}, patients: {} };
  /** Index des débuts de mesure et des fiches patient (y compris annulés), pour décrire une saisie hors de son contexte. */
  function index() {
    var etat = st();
    if (indexJournal.etat === etat) return indexJournal;
    indexJournal = { etat: etat, debuts: {}, patients: {} };
    Object.keys(etat.parId).forEach(function (k) {
      var e = etat.parId[k], d = e.data || {};
      if (e.type === 'MESURE_DEBUT') indexJournal.debuts[d.mesureId] = d;
      if (e.type === 'PATIENT') (indexJournal.patients[d.patientId] = indexJournal.patients[d.patientId] || []).push(e);
    });
    return indexJournal;
  }
  /** « NOM Prénom — isolement du 28/10/2026 17:00 » pour une mesure, même annulée. */
  function libMesure(mesureId) {
    var m = st().mesures[mesureId], d = index().debuts[mesureId];
    var patientId = m ? m.patientId : d && d.patientId, type = m ? m.type : d && d.typeMesure, debut = m ? m.debut : d && d.debut;
    if (!patientId) return 'mesure inconnue';
    return nomPatient(patientId).trim() + ' — ' + (type || 'mesure').toLowerCase() + ' du ' + date(debut);
  }
  function valeurChamp(k, v) {
    if (k === 'debut' || k === 'fin') return v == null ? 'aucune (mesure en cours)' : date(v);
    if (k === 'debutInitial') return v == null ? 'aucun (mesure débutée dans le service)' : date(v);
    if (k === 'csi' || k === 'exception') return v ? 'oui' : 'non';
    return v === '' || v == null ? '—' : String(v);
  }
  function resumePauses(v) {
    var o = M.optionsPauses({ pauses: v });
    return (o.active ? 'levée temporaire active' : 'levée temporaire désactivée') +
      (o.retrancher ? ', pauses déduites ' + (o.portee === 'partout' ? 'partout' : 'pour les délais JLD seulement') : ', pauses comptées') +
      (o.repriseAuto ? ', reprise automatique' : '') + ', alerte ' + (o.alerteHeures ? 'au-delà de ' + o.alerteHeures + ' h' : 'désactivée') + ', refus à ' + o.refusHeures + ' h' +
      (o.colonneRegistre ? ', colonne au registre' : '');
  }
  /** Changements des réglages des pauses, un par un (« reprise automatique : non → oui »). */
  function diffPauses(avant, apres) {
    var a = M.optionsPauses({ pauses: avant }), b = M.optionsPauses({ pauses: apres });
    var ouiNon = function (x) { return x ? 'oui' : 'non'; };
    var champs = [
      ['active', 'levée temporaire active', ouiNon], ['retrancher', 'pauses déduites', ouiNon],
      ['portee', 'déduction', function (x) { return x === 'partout' ? 'partout' : 'délais JLD seulement'; }],
      ['contentionSeule', 'pause de la contention seule au registre', function (x) { return x === 'contention' ? 'dans l’entrée C' : 'en isolement seul (A)'; }],
      ['verrouContention', 'pause de l’isolement seul interdite pendant une contention', ouiNon],
      ['colonneRegistre', 'colonne au registre', ouiNon], ['repriseAuto', 'reprise automatique', ouiNon],
      ['alerteHeures', 'alerte', function (x) { return x ? 'au-delà de ' + x + ' h' : 'aucune'; }], ['refusHeures', 'refus', function (x) { return 'à ' + x + ' h'; }]
    ];
    var diff = champs.filter(function (c) { return a[c[0]] !== b[c[0]] && !(c[0] === 'portee' && !b.retrancher && !a.retrancher); })
      .map(function (c) { return c[1] + ' : ' + c[2](a[c[0]]) + ' → ' + c[2](b[c[0]]); });
    return diff.length ? diff.join(' ; ') : 'aucun changement';
  }

  function resumeConfig(cle, v) {
    switch (cle) {
      case 'etablissement': return '« ' + (v || '') + ' »';
      case 'inactiviteMinutes': return v + ' min';
      case 'delaiModeHospiHeures': return v + ' h';
      case 'psychiatres': return (v || []).length + ' psychiatre(s)';
      case 'services': return (v || []).map(function (x) { return x.libelle + ' (' + x.code + ')'; }).join(', ');
      case 'modulesServices': return Object.keys(v || {}).map(function (id) {
        var m = SIC.modules.obtenir(id), lib = m ? m.libelle : id, x = v[id] || {};
        return lib + ' : ' + (x.tous === false ? ((x.services || []).length ? (x.services || []).map(libService).join(', ') : 'aucun service') : 'tous les services');
      }).join(' ; ') || 'tous les modules dans tous les services';
      case 'agenda': var oa = SIC.agenda.optionsAgenda({ agenda: v }); return 'identité : ' + SIC.agenda.IDENTITES[oa.identite].toLowerCase() + ' ; ' + oa.typesAlertes.length + ' type(s) d’alertes';
      case 'vehiculesInformation': return Object.keys(v || {}).map(function (c) { var x = v[c] || {}; return c + ' : ' + ((x.roles || []).concat((x.groupes || []).map(function (g) { return 'groupe ' + g; }), (x.agents || []).map(function (a) { return a.nom || a.id; })).join(', ') || 'auteur seulement'); }).join(' ; ') || 'cadre et secrétaire (par défaut)';
      case 'medecins': var lm = (v && v.liste) || []; return lm.length + ' médecin(s)' + (lm.some(function (m) { return m.statut === 'interimaire'; }) ? ', dont intérimaires' : '') + (v && v.gestion ? ' ; gérée par : ' + v.gestion.join(', ') : '');
      case 'suiviMedical': return ((v && v.tranches) ? v.tranches.length + ' tranche(s) de délais' : 'délais par défaut') + ' ; ' + ((v && v.gardes) ? v.gardes.map(function (g) { return g.libelle + ' ' + g.debut + '–' + g.fin; }).join(', ') : 'gardes par défaut') + ((v && v.lieux && v.lieux.length) ? ' ; lieux : ' + v.lieux.map(function (l) { return l.libelle; }).join(', ') : '');
      case 'groupes': return (Array.isArray(v) ? v : []).map(function (g) { return g.libelle + ' (' + (g.membres || []).length + ' membre(s))' + (g.actif === false ? ' — inactif' : ''); }).join(', ') || 'aucun';
      case 'vehicules': return [(v && v.types ? v.types.length + ' type(s) de véhicules' : 'types par défaut'), (v && v.signalements ? v.signalements.length + ' type(s) de signalements' : 'signalements par défaut'), (v && v.champs ? v.champs.map(function (c) { return c.libelle; }).join(', ') : 'aucune donnée ajoutée')].join(' ; ');
      case 'champsAjoutes': return (Array.isArray(v) ? v : []).map(function (c) { return c.libelle + (c.actif === false ? ' (masquée)' : '') + (c.protection === 'cle' ? ' (clé propre)' : ''); }).join(', ') || 'aucune';
      case 'reglagesDonnees': return Object.keys(v || {}).length + ' donnée(s) réglée(s)';
      case 'capacites': return Object.keys((v && v.services) || {}).map(function (k) { return U.libService(k) + ' : ' + ((v.services[k] || {}).lits || 0) + ' lits'; }).join(', ') || 'non renseignée';
      case 'psychologues': return ((v && v.liste) || []).map(function (m) { return m.nom + (m.aConfirmer ? ' (à confirmer)' : ''); }).join(', ') || 'aucun';
      case 'agendaReglages': return 'réglages de ' + Object.keys(v || {}).map(function (k) { return k === '*' ? 'l’établissement' : k; }).join(', ');
      case 'largeursColonnes': return Object.keys(v || {}).length + ' tableau(x) réglé(s)';
      case 'vuesEnsemble': return ((v && v.vues) || []).map(function (x) { return x.nom; }).join(', ') || 'vues proposées';
      case 'patientsChamps': return (Array.isArray(v) ? v : []).map(function (c) { return c.libelle + (c.actif === false ? ' (masquée)' : ''); }).join(', ') || 'aucune';
      case 'patientsListe': var ol = SIC.listePatients.options({ patientsListe: v }); return 'sorties récentes : ' + ol.joursRecents + ' jours ; ' + ol.vues.length + ' affichage(s) par défaut (' + ol.vues.map(function (x) { return x.nom; }).join(', ') + ')';
      case 'importPatients': return Object.keys((v && v.modeles) || {}).map(function (k) { return k === '*' ? 'modèle de l’établissement' : 'modèle du service ' + libService(k); }).join(', ') || 'aucun modèle';
      case 'fichePatient': return Object.keys((v && v.services) || {}).map(function (c) { var o = SIC.patients.optionsFiche({ fichePatient: v }, c); return libService(c) + ' : ' + (o.psychiatrie ? 'psychiatrie' : 'autre discipline') + ' (' + o.medecin1 + ', ' + o.medecin2 + ')'; }).join(' ; ') || 'tous les services en psychiatrie, libellés par défaut';
      case 'lieuxCSI': return Object.keys(v || {}).map(function (k) { return k + ' : ' + (v[k] || []).join(', '); }).join(' ; ');
      case 'pauses': return resumePauses(v);
      case 'casParticuliers': return SIC.ui.cas.resumeConfig(v);
      case 'qualite': var oq = M.optionsQualite({ qualite: v }); return 'motif du recours ' + (oq.motifRecours ? 'proposé (' + oq.motifsRecours.length + ' motifs)' : 'non proposé') + ', ' + oq.nomEntretien.toLowerCase() + ' ' + (oq.entretien ? 'tracé' : 'non tracé') + lieu(', surveillance hors CSI ') + (oq.surveillanceHorsCSI ? 'tracée' : 'non tracée') + ', conservation ' + (oq.conservationAns ? oq.conservationAns + ' ans' : 'non fixée');
      case 'statsMethode': return SIC.ui.methode.resumeConfig(v);
      case 'informateursTiers': return ['psychiatre'].concat((v || []).map(function (x) { return x.libelle; })).join(', ');
      case 'roles': return M.rolesConfig({ roles: v }).filter(function (r) { return !r.admin; }).map(function (r) { return r.registreSeul ? r.libelle + (r.services ? '' : ' (tous les services)') + ' : registre seulement' : r.libelle + (r.services ? '' : ' (tous les services)') + ' : ' + SIC.ui.roles.resumeAcces(r.acces) + (r.ongletsMasques.length ? ' ; onglets masqués : ' + r.ongletsMasques.map(function (o) { return lieu(LIB_ONGLET_MASQUABLE[o]); }).join(', ') : '') + ' ; journal ' + ({ complet: 'complet', services: 'de ses services', siennes: 'de ses saisies', aucun: 'masqué' })[r.journal]; }).join(' ; ');
      case 'exports': var oe = M.optionsExports({ exports: v }); return '« ' + oe.dossier + ' », ' + (oe.conservationJours ? 'conservation ' + oe.conservationJours + ' jours' : 'sans purge automatique') + (oe.cheminReseau ? ', chemin réseau ' + oe.cheminReseau : '');
      case 'surveillance': return (function (o) { return o.minParPoste + ' par poste ; agents proposés : ' + (o.rolesListe.map(function (r) { return M.libRole(config(), r); }).join(', ') || 'aucun'); })(M.optionsSurveillance(Object.assign({}, config(), { surveillance: v })));
      case 'verrouDossier': return v === true ? 'activé' : 'désactivé';
      case 'miroir': return v && v.attendu ? '« ' + v.nom + ' »' : 'aucun';
      case 'listes': return (v && v.fonctionsSurveillance ? v.fonctionsSurveillance.length : 0) + ' fonction(s), ' + (v && v.motifsPause ? v.motifsPause.length : 0) + ' motif(s) de pause, ' + (v && v.motifsFin ? v.motifsFin.length : 0) + ' motif(s) de fin propres, raccourcis ' + ((v && v.raccourcisPause) || []).map(M.libRaccourci).join(', ');
      case 'vigilance': return v ? 'rouge ' + v.isolementRouge + ' h / ' + v.contentionRouge + ' h, orange ' + v.isolementJaune + ' h / ' + v.contentionJaune + ' h (isolement / contention)' : '—';
      case 'affichage': return v ? 'mesures terminées visibles ' + v.mesuresTermineesJours + ' j' + (v.contact ? ', contact renseigné' : '') + (v.consigne ? ', consigne renseignée' : '') + (v.logo ? ', logo' : ', sans logo') : '—';
      case 'verificationVersion': return v === false ? 'désactivée' : 'activée';
      case 'organisationJLD': return String(v || '').trim() ? '« ' + String(v).trim() + ' »' : 'aucun texte';
      case 'lieuIsolement': var ll = M.libLieu({ lieuIsolement: v }); return ll.long + ' (' + ll.court + ')';
      case 'sauvegarde': return v && v.rappelJours ? 'tous les ' + v.rappelJours + ' jours' : 'aucun rappel';
      case 'rapportsAnnuels': return Object.keys(v || {}).join(', ') || 'aucun';
      case 'alertes': return M.alertesConfig({ alertes: v }).map(function (r) {
        return '« ' + r.libelle + ' » ' + (r.active ? 'active' : 'inactive') + ' (' + lieu(M.DECLENCHEURS_ALERTE[r.declencheur]).toLowerCase() + ', ' +
          (r.nature === 'information' ? 'informer ' + r.destinataires + ' ' + SIC.ui.alertes.delaiTexte(r.delaiMinutes) : 'rappel à la saisie') + ', ' + SIC.ui.alertes.servicesTexte(r) + ')';
      }).join(' ; ') || 'aucune alerte';
      case 'compteursRegistre': case 'derniersClasseur': return Object.keys(v || {}).map(function (k) { return libService(k) + ' : ' + Object.keys(v[k]).map(function (an) { return an + ' → ' + v[k][an]; }).join(', '); }).join(' ; ') || 'aucun';
      case 'registreFigeMesures': var vals = Object.keys(v || {}).map(function (k) { return v[k]; }); return vals.filter(Boolean).length + ' mesure(s) gardant leur n° d’origine, ' + vals.filter(function (x) { return x === false; }).length + ' recalculée(s)';
      case 'registreFige': return Object.keys(v || {}).map(function (k) { return libService(k) + ' : ' + Object.keys(v[k]).join(', '); }).join(' ; ') || 'aucune année (tout est recalculé)';
      case 'colonnesPatients': return (v || []).map(function (c) { return c.libelle + ' (' + (c.categories || []).join(', ') + ')'; }).join(', ');
      case 'decompte': return Object.keys(v || {}).map(function (k) { return k === '*' ? 'établissement' : libService(k); }).join(', ') || 'aucun masque';
      case 'imagesDecompte': return Object.keys(v || {}).map(function (k) { return v[k].nom; }).join(', ') || 'aucune image';
      default: return '';
    }
  }
  /** Valeur d'un paramètre juste avant la saisie `e` (null s'il n'avait jamais été modifié). */
  function configAvant(e) {
    var etat = st(), avant = null;
    etat.journal.forEach(function (x) {
      if (x.type === 'CONFIG' && x.data.cle === e.data.cle && x.id < e.id && !etat.annules[x.id]) avant = x.data.valeur;
      if (x.type === 'LOT' && x.id < e.id && !etat.annules[x.id]) (x.data.evenements || []).forEach(function (s) { if (s.type === 'CONFIG' && s.data.cle === e.data.cle) avant = s.data.valeur; });
    });
    return avant;
  }

  /** Valeurs d'une mesure juste avant la saisie `e` (début, fin, lieu…), pour montrer ce qu'une correction a changé. */
  function mesureAvant(mesureId, e) {
    var etat = st(), dd = index().debuts[mesureId];
    if (!dd) return {};
    var v = { debut: dd.debut, fin: null, lieu: dd.lieu || '', csi: !!dd.csi, psychiatreDebut: dd.psychiatre || '', psychiatreFin: '', modeHospi: dd.modeHospi || '', exception: !!dd.exception, type: dd.typeMesure };
    Object.keys(etat.parId).sort().forEach(function (k) {
      var x = etat.parId[k];
      if (k >= e.id || !x.data || x.data.mesureId !== mesureId || etat.annules[k] || (x.lot && etat.annules[x.lot])) return;
      if (x.type === 'MESURE_FIN') { v.fin = x.data.fin; v.psychiatreFin = x.data.psychiatre || ''; }
      if (x.type === 'CORRECTION') Object.keys(x.data.champs || {}).forEach(function (c) { v[c] = x.data.champs[c]; });
    });
    return v;
  }

  /** Description lisible d'une saisie du journal. */
  function resumeEvt(e) {
    var d = e.data || {};
    var sur = d.mesureId ? libMesure(d.mesureId) + ' : ' : '';
    switch (e.type) {
      case 'MESURE_DEBUT':
        var fem = d.typeMesure === 'Contention' ? 'e' : '';
        if (typeof d.debutInitial === 'number') return nomPatient(d.patientId).trim() + ' — ' + (d.typeMesure || '').toLowerCase() + ' débuté' + fem + ' le ' + date(d.debutInitial) + ' (' + (d.lieuInitial || 'hors du service') + '), arrivée dans le service le ' + date(d.debut) + ', décidé' + fem + ' par ' + (d.psychiatre || '?') + ', ' + (d.lieu || 'lieu non précisé');
        return nomPatient(d.patientId).trim() + ' — ' + (d.typeMesure || '').toLowerCase() + ' débuté' + fem + ' le ' + date(d.debut) + ', décidé' + fem + ' par ' + (d.psychiatre || '?') + ', ' + (d.lieu || 'lieu non précisé') + (d.suiteDe ? ' (suite d’un changement de lieu)' : '') + (d.origine ? ' — ' + d.origine + (d.numeroOrigine ? ', n° ' + d.numeroOrigine : '') : '') + (d.correctionImport ? ' — ' + d.correctionImport : '');
      case 'MESURE_FIN': return sur + 'fin le ' + date(d.fin) + ', décidée par ' + (d.psychiatre || '?') + (d.motif ? ' (' + d.motif.toLowerCase() + ')' : '');
      case 'PAUSE': return sur + 'pause à partir du ' + date(d.debut) + ', reprise prévue le ' + date(d.reprisePrevue) + (d.motif ? ' — motif : ' + d.motif : '') + (d.psychiatre ? ' — décidée par ' + d.psychiatre : '');
      case 'REPRISE': return sur + 'reprise après pause le ' + date(d.date);
      case 'TRANSFERT': return sur + 'transfert le ' + date(d.date) + ' vers ' + libService(d.service) + ' (' + (d.lieu || 'lieu non précisé') + ')';
      case 'SOMATIQUE': return sur + 'départ en soins somatiques ou aux urgences le ' + date(d.date) + ' (' + (d.lieu || '') + ') — ' + (SIC.ui.cas.LIB_SOMA[d.mode] || d.mode) + (d.mode === 'poursuite-registre' ? ' (' + libService(d.serviceRegistre) + ')' : '');
      case 'SOMATIQUE_RETOUR': return sur + 'retour dans le service le ' + date(d.date) + (d.lieu ? ' (' + d.lieu + ')' : '');
      case 'RECOURS': return sur + SIC.ui.parcours.libRecours(d);
      case 'ENTRETIEN': return sur + M.optionsQualite(config()).nomEntretien.toLowerCase() + ' — ' + (d.realise === false ? 'non réalisé (' + (d.motif || '') + ')' : 'réalisé le ' + date(d.date)) + (d.commentaire ? ' — ' + d.commentaire : '');
      case 'INTEGRITE': return 'Prise d’acte d’anomalies d’intégrité irrécupérables (' + [(d.manquants || []).length ? (d.manquants || []).length + ' saisie(s) perdue(s)' : '', (d.fichiers || []).length ? (d.fichiers || []).length + ' fichier(s) illisible(s)' : '', (d.reperes || []).length ? (d.reperes || []).length + ' repère(s) d’agent' : ''].filter(Boolean).join(', ') + '). Motif : ' + (d.motif || '') + '.';
      case 'FUSION':
        var fg = st().patients[M.ciblePatient(st(), d.garde)] || {}, fa = ((fg.fusionnes || []).filter(function (x) { return x.id === d.absorbe; })[0]) || {};
        return 'Fiches fusionnées : ' + ((fa.nom || '?') + ' ' + (fa.prenom || '')).trim() + (fa.ipp ? ' (IPP ' + fa.ipp + ')' : '') + ' rattachée à ' + nomPatient(d.garde).trim() + (fg.ipp ? ' (IPP ' + fg.ipp + ')' : '') + '. Motif : ' + (d.motif || 'non précisé') + '.';
      case 'INFORMATION': return sur + 'information tracée (' + (d.libelle || d.regle) + ') — ' + d.personne + ' informé(e) le ' + date(d.date) + ' (' + String(d.moyen || '').toLowerCase() + ')' + (d.commentaire ? ' — ' + d.commentaire : '');
      case 'TIERS': return sur + 'information du tiers (cycle ' + d.cycle + ') le ' + date(d.date) + ' — ' + (LIB_TIERS[d.statut] || d.statut).toLowerCase() + (d.personne ? ' (' + d.personne + ')' : '') + ', par ' + M.libInformateur(config(), d) + (d.motif ? ' — ' + d.motif : '');
      case 'JLD': return sur + LIB_NATURE[d.nature].toLowerCase() + ' — cycle ' + d.cycle + ' — le ' + date(d.date) + (d.decision ? ' — décision : ' + (d.decision === 'LEVEE' ? 'mainlevée' : 'maintien') : '');
      case 'PROFESSIONNEL':
        var per = M.periodesDe(config(), d.service).filter(function (q) { return q.code === d.periode; })[0];
        return lieu('Surveillance en CSI — ') + libService(d.service) + ', ' + (d.date ? d.date.split('-').reverse().join('/') : '') + ', ' + (per ? per.libelle.toLowerCase() : d.periode) + ' : ' + d.nom + (d.fonction ? ' (' + d.fonction + ')' : '') + (d.lieux && d.lieux.length ? ' — lieux : ' + d.lieux.join(', ') : '');
      case 'PATIENT':
        var fiches = index().patients[d.patientId] || [], premiere = !fiches.length || fiches[0].id === e.id;
        return 'Fiche patient ' + (premiere ? 'créée' : 'modifiée') + ' : ' + [((d.nom || '') + ' ' + (d.prenom || '')).trim(), d.ipp ? 'IPP ' + d.ipp : '', d.naissance ? 'né(e) le ' + d.naissance.split('-').reverse().join('/') : '', d.protection ? 'protection : ' + d.protection.toLowerCase() : '', d.service ? 'service : ' + libService(d.service) : '', d.detenu === true ? 'patient détenu' : d.detenu === false ? 'n’est plus détenu' : '',
          d.nomNaissance ? 'né(e) ' + d.nomNaissance : '', d.sexe ? 'sexe : ' + ((SIC.patients && SIC.patients.SEXES[d.sexe]) || d.sexe).toLowerCase() : '',
          d.medecin1 !== undefined ? 'médecin de 1re ligne : ' + (d.medecin1 || 'aucun') : '', d.medecin2 !== undefined ? 'médecin de 2e ligne : ' + (d.medecin2 || 'aucun') : '',
          d.referents !== undefined ? 'référents : ' + ((d.referents || []).map(function (r) { return r.nom; }).join(', ') || 'aucun') : ''].filter(Boolean).join(', ') + (premiere ? '' : ' (' + nomPatient(d.patientId).trim() + ')');
      case 'COMPLEMENT':
      case 'VALEUR':
        // Données ajoutées (0.13.0, 0.18.0) : valeur, ou opération sur une note ou une check-list
        var cc = SIC.champs.definition(config(), d.champ);
        var qui = e.type === 'COMPLEMENT' || d.entite === 'patient' ? nomPatient(d.patientId || d.id).trim() : (SIC.medecins ? SIC.medecins.nomActuel(config(), d.id) || d.id : d.id);
        var quoi = d.op ? (d.op.ajout ? (d.op.ajout.texte !== undefined ? 'note ajoutée : « ' + d.op.ajout.texte + ' »' : 'élément ajouté : « ' + d.op.ajout.libelle + ' »') : d.op.retrait ? 'élément retiré' : d.op.cocher ? (d.op.cocher.fait ? 'coché' : 'décoché') + ' : ' + d.op.cocher.element : 'modifiée')
          : (d.valeur === null || d.valeur === undefined ? 'retirée' : (cc ? SIC.champs.lib(cc, d.valeur) : String(d.valeur)));
        return (cc ? cc.libelle : d.champ) + ' — ' + qui + ' : ' + quoi;
      case 'INTERVENANT':
        return (d.supprime ? 'Retiré du répertoire : ' : 'Répertoire de la prise en charge : ') + (d.nom || d.id) + (d.contact ? ' (' + d.contact + ')' : '');
      case 'PRISE_EN_CHARGE':
        var ivj = (function () { try { return (App.session.etatModule('patients').intervenants || {})[d.intervenant]; } catch (err) { return null; } })();
        return 'Prise en charge de ' + nomPatient(d.patientId).trim() + ' : ' + (d.retire ? 'un professionnel ou une structure retiré' : (ivj ? ivj.nom : 'professionnel ou structure') + (d.commentaire ? ' — ' + d.commentaire : ''));
      case 'SEJOUR':
        return 'Séjour de ' + nomPatient(d.patientId).trim() + ' : ' + [d.iep ? 'n° ' + d.iep : '', d.entree ? 'entrée le ' + d.entree.split('-').reverse().join('/') : '', d.sortie ? 'sortie le ' + d.sortie.split('-').reverse().join('/') : '', d.service ? 'unité : ' + libService(d.service) : '', d.chambre ? 'chambre ' + d.chambre + (d.lit ? ', lit ' + d.lit : '') : ''].filter(Boolean).join(', ');
      case 'MODE_HOSPI':
        var def = (config().modesHospitalisation || []).filter(function (x) { return x.code === d.mode; })[0];
        return nomPatient(d.patientId).trim() + ' — mode d’hospitalisation : ' + d.mode + (def ? ' (' + def.libelle.toLowerCase() + ')' : '') + ' à partir du ' + date(d.date);
      case 'CONFIG':
        var lib = lieu(LIB_CONFIG[d.cle]) || d.cle, apres = resumeConfig(d.cle, d.valeur);
        if (!apres) return lib + ' : modifié';
        var av = configAvant(e); if (av == null) av = M.CONFIG_DEFAUT[d.cle];
        if (d.cle === 'pauses') return lib + ' : ' + diffPauses(av, d.valeur);
        var avant = av == null ? '' : resumeConfig(d.cle, av);
        return lib + ' : ' + (avant && avant !== apres ? avant + ' → ' : '') + apres;
      case 'ANNULATION':
        var cible = st().parId[d.cible];
        if (!cible) return 'Annulation d’une saisie introuvable (' + (d.cible || '?') + ')' + (d.motif ? ' — motif : ' + d.motif : '');
        if (cible.type === 'ANNULATION') {
          var origine = st().parId[cible.data && cible.data.cible];
          return 'Rétablissement' + (origine ? ' de la saisie « ' + (lieu(LIB_EVT[origine.type]) || origine.type) + ' » du ' + date(Date.parse(origine.at)) + ' (' + resumeEvt(origine) + ')' : '') + ' : son annulation du ' + date(Date.parse(cible.at)) + ' est annulée. Motif : ' + (d.motif || 'non précisé') + '.';
        }
        var libCible = cible.type === 'COMPTE' ? 'Comptes et clés' : (lieu(LIB_EVT[cible.type]) || cible.type);
        return 'Annulation de la saisie « ' + libCible + ' » faite le ' + date(Date.parse(cible.at)) + ' par ' + App.session.nomAuteur(cible.by) + ' : ' + resumeEvt(cible) +
          (cible.type === 'MESURE_DEBUT' ? ' (toute la mesure est annulée)' : cible.type === 'LOT' ? ' (toutes les saisies du lot sont annulées)' : '') +
          '. Motif : ' + (d.motif || 'non précisé') + '.';
      case 'COMPTE': if (Array.isArray(d.comptes)) return LIB_COMPTE[d.action] + ' : ' + d.comptes.length + ' — ' + d.comptes.map(function (x) { return x.login; }).join(', ');
        return (LIB_COMPTE[d.action] || d.action) + (d.login ? ' — ' + d.login : '') + (d.roles ? ' (' + d.roles.map(function (r) { return M.libRole(config(), r); }).join(', ') + ')' : '') + (d.libelle ? ' — ' + d.libelle : '') + (d.finValidite ? ' — accès jusqu’au ' + d.finValidite.split('-').reverse().join('/') : '');
      case 'PROPOSITION':
        return sur + 'correction proposée (à valider par le cadre) — ' + Object.keys(d.champs || {}).map(function (k) { return (lieu(LIB_CHAMPS[k]) || k) + ' : ' + valeurChamp(k, d.champs[k]); }).join(' ; ') + '. Motif : ' + (d.motif || 'non précisé') + '.';
      case 'REFUS_PROPOSITION':
        var prRef = st().parId[d.proposition];
        return sur + 'correction proposée' + (prRef ? ' par ' + App.session.nomAuteur(prRef.by) : '') + ' refusée. Motif : ' + (d.motif || 'non précisé') + '.';
      case 'CORRECTION':
        var ch = d.champs || {}, avantCorr = mesureAvant(d.mesureId, e);
        var prVal = d.proposition && st().parId[d.proposition];
        if (prVal) sur += '(correction proposée par ' + App.session.nomAuteur(prVal.by) + ', validée) ';
        return sur + 'correction — ' + Object.keys(ch).map(function (k) {
          var av2 = avantCorr[k] !== undefined && valeurChamp(k, avantCorr[k]) !== valeurChamp(k, ch[k]) ? valeurChamp(k, avantCorr[k]) + ' → ' : '';
          return (lieu(LIB_CHAMPS[k]) || k) + ' : ' + av2 + valeurChamp(k, ch[k]);
        }).join(' ; ') + '. Motif : ' + (d.motif || 'non précisé') + '.';
      case 'LOT': return (d.libelle || 'Lot de saisies') + (d.journal === 'patients' ? ' (fiches patient)' : '') + ' — ' + (d.evenements || []).length + ' saisies enregistrées en une fois' + (d.lien ? ' ; lié aux autres lots du même enregistrement (annulés ensemble)' : '');
      case 'STATS': return 'Statistiques ' + libService(d.service) + ' ' + d.annee + ' : patients en hospitalisation complète ' + (d.hc == null ? '—' : d.hc) + ', sous contrainte ' + (d.ssc == null ? '—' : d.ssc);
      default: return e.type;
    }
  }


  var EFFET_ANNULATION = {
    MESURE_DEBUT: 'Toute la mesure est annulée (doublon, mauvais patient…), avec les saisies qui la concernent.',
    LOT: 'Toutes les saisies de ce lot (import ou données de démonstration) sont annulées.',
    CONFIG: 'Le réglage reprend la valeur qu’il avait avant cette saisie.',
    FUSION: 'Les deux fiches patient sont de nouveau séparées.',
    INTEGRITE: 'Les anomalies dont il avait été pris acte seront de nouveau signalées.',
    PATIENT: 'La fiche du patient reprend les valeurs précédentes.'
  };

  // ================================================================ Libellés du journal (lus par la coquille)
  /** Nature d'une saisie dans la colonne « Action » du journal. */
  function actionJournal(e) {
    return e.type === 'COMPTE' && e.data && (e.data.action === 'EDITION_CADA' || e.data.action === 'REGISTRE_ANONYME') ? 'Communication du registre' : e.type === 'COMPTE' && e.data && e.data.action === 'EXPORT_PATIENT' ? 'Droit d’accès' : e.type === 'COMPTE' && e.data && e.data.action === 'ARCHIVE' ? 'Archivage' : e.type === 'COMPTE' && e.data && (e.data.action === 'SCELLE' || e.data.action === 'SAUVEGARDE' || e.data.action === 'REPARATION' || e.data.action === 'QUARANTAINE' || /^(MIROIR|DEPLACEMENT|HORS_RESEAU)/.test(e.data.action)) ? 'Sauvegarde' : e.type === 'COMPTE' && e.data && (e.data.action === 'EXPORT' || e.data.action === 'REGLAGES_EXPORT' || e.data.action === 'EXPORT_SUPPRIME' || e.data.action === 'PURGE_EXPORTS') ? 'Export' : (lieu(LIB_EVT[e.type]) || e.type);
  }
  var journal = {
    preparer: index,
    resume: resumeEvt,
    action: actionJournal,
    libelleType: function (type) { return lieu(LIB_EVT[type]) || type; },
    effetAnnulation: function (e) { return EFFET_ANNULATION[e.type] || null; }
  };

  // ================================================================ Administration : panneaux d'Isocont
  /**
   * Panneaux d'administration du module, lus par la coquille (contrat, interface.admin) : contributions aux onglets communs
   * (« Établissement et services », « Sauvegardes et exports ») et onglets propres au module, dans l'ordre d'affichage.
   * `formation` : jeu de formation ouvert (paramétrage du seul jeu de formation, sans import ni archive).
   */
  function panneauxAdmin(formation) {
    var cfg = config();
    var tOrgJLD = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Ex. : envois assurés par la secrétaire en semaine, par l’IDE le week-end et en son absence.' }, String(cfg.organisationJLD || ''));
    var pOrgJLD = h('section', { class: 'panneau' }, h('h2', { text: 'Organisation des envois au JLD' }),
      h('p', { class: 'muted', text: 'Rappel affiché en tête de l’onglet JLD : qui fait les envois au juge, selon la politique de l’établissement. Laissez vide pour ne rien afficher. Les droits de saisie des envois se règlent par les rôles des comptes.' }),
      h('label', {}, 'Texte affiché', tOrgJLD),
      boutonEnregistrer(async function () { await enregistrerConfig([['organisationJLD', tOrgJLD.value.trim()]]); }));

    // -- Appellation des lieux dédiés à l'isolement
    var lieuAct = M.libLieu(cfg), lieuxProp = M.LIEUX_ISOLEMENT;
    var iCourt = h('input', { type: 'text', maxlength: 12, value: lieuAct.court }), iLong = h('input', { type: 'text', maxlength: 60, value: lieuAct.long }), iLongs = h('input', { type: 'text', maxlength: 60, value: lieuAct.longs });
    var indexAct = lieuxProp.map(function (x) { return x.court + '|' + x.long; }).indexOf(lieuAct.court + '|' + lieuAct.long);
    var selLieuNom = h('select', { onchange: function () { var x = lieuxProp[+selLieuNom.value]; if (x) { iCourt.value = x.court; iLong.value = x.long; iLongs.value = x.longs; } majApercuLieu(); } },
      lieuxProp.map(function (x, i) { return h('option', { value: i, text: x.long + ' (' + x.court + ')', selected: i === indexAct }); }),
      h('option', { value: 'autre', text: 'Autre appellation…', selected: indexAct < 0 }));
    var apercuLieu = h('small', { class: 'muted' });
    function majApercuLieu() {
      var v = { lieuIsolement: { court: iCourt.value, long: iLong.value, longs: iLongs.value } };
      apercuLieu.textContent = 'Aperçu : ' + M.txtLieu(v, '« Surveillance CSI » · « Contention hors CSI » · « Chambres de soins intensifs du service »');
    }
    [iCourt, iLong, iLongs].forEach(function (i) { i.addEventListener('input', function () { selLieuNom.value = 'autre'; majApercuLieu(); }); });
    majApercuLieu();
    var pLieuNom = h('section', { class: 'panneau' }, h('h2', { text: 'Appellation des lieux dédiés à l’isolement' }),
      h('p', { class: 'muted', text: 'Nom utilisé dans les textes de l’outil (onglets, alertes, registre, statistiques, décompte) : « chambre de soins intensifs (CSI) » par défaut. Les noms des lieux saisis ci-dessus (ex. « CSI 1 ») ne sont pas modifiés. Les règles de calcul et le registre restent identiques.' }),
      h('label', {}, 'Appellation', selLieuNom),
      h('div', { class: 'grille-3' }, h('label', {}, 'Sigle (court, pour les onglets et colonnes)', iCourt), h('label', {}, 'Libellé au singulier', iLong), h('label', {}, 'Libellé au pluriel', iLongs)),
      apercuLieu,
      boutonEnregistrer(async function () {
        if (!iCourt.value.trim() || !iLong.value.trim()) throw new Error('Le sigle et le libellé sont obligatoires.');
        await enregistrerConfig([['lieuIsolement', { court: iCourt.value.trim(), long: iLong.value.trim(), longs: iLongs.value.trim() || iLong.value.trim() }]]);
      }));

    // -- Surveillance
    var tPer = zoneTexte((cfg.periodes || []).map(function (p) { return p.code + ' ; ' + p.libelle + ' ; ' + p.debut + ' ; ' + p.fin; }).join('\n'), 3);
    // -- Information du tiers : fonctions proposées (le psychiatre est toujours en tête)
    var infoTiers = M.informateursTiers(cfg).filter(function (f) { return !f.psychiatre; });
    var tTiers = h('textarea', { rows: 4 }, infoTiers.map(function (f) { return f.libelle; }).join('\n'));
    var pTiers = h('section', { class: 'panneau' }, h('h2', { text: 'Information du tiers : qui peut la réaliser' }),
      h('p', { class: 'muted', text: 'L’article L. 3222-5-1 confie l’information de la famille ou du proche au médecin. « Le psychiatre » est donc toujours proposé en premier ; ajoutez ici les autres fonctions qui peuvent la réaliser dans votre établissement (une par ligne), par exemple : IDE, cadre de santé, médecin de garde, assistant de service social. Le nom de la personne peut être précisé à chaque saisie.' }),
      SIC.ui.extraitLoiTiers(true),
      h('label', {}, 'Autres fonctions proposées (une par ligne)', tTiers),
      boutonEnregistrer(async function () {
        var vus = {}, v = [];
        lignesDe(tTiers).forEach(function (l) {
          var cle = l.toLowerCase();
          if (vus[cle] || /^(le )?psychiatre$/i.test(l)) return; vus[cle] = 1;
          var ancien = infoTiers.filter(function (f) { return f.libelle.toLowerCase() === cle; })[0];
          v.push({ code: ancien ? ancien.code : 'F:' + l, libelle: l });
        });
        await enregistrerConfig([['informateursTiers', v]]);
      }));

    var lignesPS = [];
    Object.keys(cfg.periodesService || {}).forEach(function (sv) { (cfg.periodesService[sv] || []).forEach(function (p) { lignesPS.push(sv + ' ; ' + p.code + ' ; ' + p.libelle + ' ; ' + p.debut + ' ; ' + p.fin); }); });
    var tPerSv = zoneTexte(lignesPS.join('\n'), 3);
    var rolesSurv = M.optionsSurveillance(cfg).rolesListe, cbRolesSurv = {};
    var casesRolesSurv = h('div', { class: 'cases-ligne' }, M.rolesConfig(cfg).filter(function (r) { return !r.admin; }).map(function (r) {
      cbRolesSurv[r.code] = h('input', { type: 'checkbox', checked: rolesSurv.indexOf(r.code) >= 0 });
      return h('label', { class: 'case' }, cbRolesSurv[r.code], h('span', { text: r.libelle }));
    }));
    var minPoste = h('select', {}, [1, 2, 3, 4, 5, 6].map(function (n) { return h('option', { value: n, text: String(n), selected: n === M.optionsSurveillance(cfg).minParPoste }); }));
    var pSurv = h('section', { class: 'panneau' }, h('h2', { text: lieu('Postes de surveillance en CSI') }),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Postes par défaut (code ; libellé ; début ; fin)', tPer),
        h('label', {}, 'Postes propres à un service (service ; code ; libellé ; début ; fin)', tPerSv)),
      h('small', { class: 'muted', text: 'Un service qui a ses propres postes n’utilise pas les postes par défaut. Ne changez pas le code d’un poste déjà utilisé.' }),
      h('label', { class: 'en-ligne' }, 'Professionnels attendus par poste (minimum)', minPoste),
      h('fieldset', {}, h('legend', { text: 'Agents proposés dans la liste de la fenêtre « Ajouter » (comptes portant ces rôles, affectés au service)' }), casesRolesSurv),
      h('small', { class: 'muted', text: lieu('En dessous de ce nombre, le poste est signalé « à renseigner » (onglet Surveillance CSI et tableau de bord).') }),
      boutonEnregistrer(async function () {
        var pers = lignesDe(tPer).map(function (l) { return periodeDepuis(l.split(';').map(function (v) { return v.trim(); }), l); });
        var parSv = {};
        lignesDe(tPerSv).forEach(function (l) { var x = l.split(';').map(function (v) { return v.trim(); }); if (x.length !== 5) throw new Error('Poste mal formé : ' + l); (parSv[x[0]] = parSv[x[0]] || []).push(periodeDepuis(x.slice(1), l)); });
        await enregistrerConfig([['periodes', pers], ['periodesService', parSv], ['surveillance', { minParPoste: +minPoste.value, rolesListe: Object.keys(cbRolesSurv).filter(function (k) { return cbRolesSurv[k].checked; }) }]]);
      }));

    // -- Règles légales
    var champs = [['seuilInfo15j', 'Information du JLD : seuil de cumul sur 15 jours (h)'], ['seuilSaisine15j', 'Saisine du JLD : seuil de cumul sur 15 jours (h)'], ['seuilDecision15j', 'Décision du JLD : seuil de cumul sur 15 jours (h)'],
      ['intervalleCycle', 'Intervalle entre deux cycles (h)'], ['rythmeLongCycle', 'Rythme des mesures longues à partir du cycle (0 = désactivé)'], ['rythmeLongInfoSaisine', 'Rythme long : information et saisine (h)'], ['rythmeLongDecision', 'Rythme long : décision (h)'], ['seuilJaune', 'Alerte « échéance proche » (h avant)']];
    var entrees = {};
    var tbody = h('tbody', {}, champs.map(function (c) {
      return h('tr', {}, h('td', { text: c[1] }), ['Isolement', 'Contention'].map(function (t) {
        var p = R.params(t, cfg.parametres);
        var inp = h('input', { type: 'number', min: 0, step: 1, value: p[c[0]], class: 'champ-court' });
        entrees[t + c[0]] = inp;
        return h('td', {}, inp, p[c[0]] !== R.PARAMETRES_DEFAUT[t][c[0]] ? h('small', { class: 'muted', text: ' (défaut ' + R.PARAMETRES_DEFAUT[t][c[0]] + ')' }) : null);
      }));
    }));
    var delaiMode = h('input', { type: 'number', min: 0, max: 72, value: cfg.delaiModeHospiHeures == null ? 12 : cfg.delaiModeHospiHeures });
    var inact = h('input', { type: 'number', min: 2, max: 60, value: cfg.inactiviteMinutes || 10 });
    var pRegles = h('section', { class: 'panneau' }, h('h2', { text: 'Règles légales et sécurité' }),
      h('div', { class: 'alerte', text: 'Les valeurs par défaut traduisent l’article L. 3222-5-1 du code de la santé publique et la circulaire du 25 mars 2022. Ne les modifiez qu’en cas d’évolution des textes, après avis de la direction.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Paramètre' }), h('th', { text: 'Isolement' }), h('th', { text: 'Contention' }))), tbody)),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Registre : passage des soins libres à une hospitalisation sous contrainte retenu s’il survient dans les … heures suivant le début', delaiMode),
        h('label', {}, 'Verrouillage automatique après inactivité (minutes)', inact)),
      boutonEnregistrer(async function () {
        var par = {};
        ['Isolement', 'Contention'].forEach(function (t) {
          champs.forEach(function (c) {
            var v = +entrees[t + c[0]].value;
            if (!isFinite(v) || v < 0) throw new Error('Valeur invalide : ' + c[1] + ' (' + t + ')');
            if (v !== R.PARAMETRES_DEFAUT[t][c[0]]) { par[t] = par[t] || {}; par[t][c[0]] = v; }
          });
        });
        await enregistrerConfig([['parametres', par], ['delaiModeHospiHeures', Math.max(0, +delaiMode.value || 0)], ['inactiviteMinutes', Math.max(2, Math.min(60, +inact.value || 10))]]);
      }));

    // -- Pauses (levées temporaires)
    var op = M.optionsPauses(cfg);
    var cbActive = h('input', { type: 'checkbox', checked: op.active });
    var cbRetr = h('input', { type: 'checkbox', checked: op.retrancher });
    var radPortee = function (v, texte) { var r = h('input', { type: 'radio', name: 'portee-pauses', value: v, checked: op.portee === v }); return h('label', { class: 'case' }, r, h('span', { text: texte })); };
    var blocPortee = h('div', { class: 'pile retrait' },
      h('b', { text: 'Où déduire les pauses ?' }),
      radPortee('jld', 'Pour les délais JLD seulement (échéances, cumuls sur 15 jours, décompte) : le registre et les statistiques gardent la durée réelle, levées temporaires comprises'),
      radPortee('partout', 'Partout : délais JLD, et aussi registre anonymisé et statistiques (durées hors pauses)'));
    var radCS = function (v, texte) { return h('label', { class: 'case' }, h('input', { type: 'radio', name: 'contention-seule', value: v, checked: op.contentionSeule === v }), h('span', { text: texte })); };
    var blocCS = h('div', { class: 'pile retrait' },
      h('b', { text: 'Registre : pause de la contention seule (le patient reste à l’isolement)' }),
      radCS('isolement', 'Compter ce temps en isolement seul : il forme une entrée A supplémentaire (durée de l’isolement exacte, une entrée de plus)'),
      radCS('contention', 'Le laisser dans l’entrée de contention (C), sans le déduire (pas d’entrée supplémentaire)'),
      h('small', { class: 'muted', text: lieu('Une pause commune à la contention et à l’isolement (le patient quitte le lieu d’isolement) est toujours déduite.') }));
    blocPortee.appendChild(blocCS);
    function majCS() { blocCS.hidden = ((blocPortee.querySelector('input[name=portee-pauses]:checked') || {}).value) !== 'partout'; }
    blocPortee.addEventListener('change', majCS); majCS();
    var cbCol = h('input', { type: 'checkbox', checked: op.colonneRegistre });
    var cbVerrou = h('input', { type: 'checkbox', checked: op.verrouContention });
    var cbAuto = h('input', { type: 'checkbox', checked: op.repriseAuto });
    var nAlerte = h('input', { type: 'number', min: 0, max: M.PAUSE_MAX_HEURES, step: 0.5, value: op.alerteHeures, class: 'champ-court' });
    var nRefus = h('input', { type: 'number', min: 1, max: M.PAUSE_MAX_HEURES, step: 0.5, value: op.refusHeures, class: 'champ-court' });
    var avertRetr = h('div', { class: 'alerte', text: 'Déduire les pauses reporte les échéances JLD de la durée des pauses. Ce choix relève d’une lecture des textes à valider par la direction (et, si possible, avec le JLD) : la loi prévoit qu’une mesure reprise moins de 48 h après la fin de la précédente s’y ajoute, ce qui plaide pour laisser courir la durée. Le réglage s’applique à toutes les mesures, y compris passées, et il est tracé dans le journal.' });
    var reglagesPause = h('div', { class: 'pile' },
      h('label', { class: 'case' }, cbRetr, h('span', { text: 'Déduire la durée des pauses du cumul' })),
      h('div', { class: 'pile retrait' }, avertRetr, blocPortee, h('small', { class: 'muted', text: 'Une pause sans reprise saisie n’est déduite que jusqu’à son heure de reprise prévue.' })),
      h('label', { class: 'case' }, cbVerrou, h('span', { text: 'Interdire la pause de l’isolement seul quand une contention est en cours : la contention doit être mise en pause elle aussi, ou terminée dans la même saisie' })),
      h('label', { class: 'case' }, cbCol, h('span', { text: 'Afficher les levées temporaires dans le registre anonymisé (colonne : nombre et durée), et dans son export' })),
      h('label', { class: 'case' }, cbAuto, h('span', { text: 'Reprise automatique à l’heure prévue (sans saisie de la reprise)' })),
      h('small', { class: 'muted', text: 'Sans reprise automatique, une reprise prévue dépassée et non saisie est signalée en rouge. Avec elle, la mesure reprend d’elle-même ; une reprise plus tôt que prévu se saisit avec le bouton Reprise, et un patient qui ne réintègre pas la mesure doit faire l’objet d’une fin de mesure.' }),
      h('div', { class: 'grille-2' },
        h('label', {}, 'Alerte : pause de plus de … heures (0 = aucune alerte)', nAlerte),
        h('label', {}, 'Refus : pause de … heures ou plus (' + M.PAUSE_MAX_HEURES + ' h au maximum)', nRefus)),
      h('small', { class: 'muted', text: 'Le refus ne peut pas dépasser ' + M.PAUSE_MAX_HEURES + ' h : une interruption de 48 h ou plus n’est pas une levée temporaire, c’est une fin de mesure.' }));
    var infoInactive = h('div', { class: 'info', text: 'La levée temporaire est désactivée : le bouton « Pause » n’apparaît plus dans la page des mesures. Les pauses déjà saisies restent visibles dans l’historique et comptées dans la durée des mesures ; une pause en cours peut encore être reprise.' });
    function majPauses() {
      if (cbRetr.checked) cbActive.checked = true;
      cbActive.disabled = cbRetr.checked;
      reglagesPause.hidden = !cbActive.checked; infoInactive.hidden = cbActive.checked;
      avertRetr.parentNode.hidden = !cbRetr.checked;
    }
    cbActive.addEventListener('change', majPauses); cbRetr.addEventListener('change', majPauses);
    var pPauses = h('section', { class: 'panneau' }, h('h2', { text: 'Pauses (levées temporaires)' }),
      h('label', { class: 'case' }, cbActive, h('span', { text: 'Activer la levée temporaire (bouton « Pause » dans la page des mesures)' })),
      h('small', { class: 'muted', text: 'Ne peut être désactivée que si les pauses ne sont pas déduites.' }),
      infoInactive, reglagesPause,
      boutonEnregistrer(async function () {
        var a = +nAlerte.value, r = +nRefus.value;
        if (!isFinite(r) || r <= 0 || r > M.PAUSE_MAX_HEURES) throw new Error('Le seuil de refus doit être compris entre 0 et ' + M.PAUSE_MAX_HEURES + ' h.');
        if (!isFinite(a) || a < 0 || (a && a >= r)) throw new Error('Le seuil d’alerte doit être inférieur au seuil de refus (0 pour aucune alerte).');
        var portee = (blocPortee.querySelector('input[name=portee-pauses]:checked') || {}).value || 'jld';
        var contentionSeule = (blocCS.querySelector('input:checked') || {}).value || 'isolement';
        var avant = M.optionsPauses(cfg);
        var msgs = [];
        if (cbRetr.checked !== avant.retrancher) msgs.push(cbRetr.checked ? 'Déduire les pauses va reporter les échéances JLD de toutes les mesures concernées.' : 'Ne plus déduire les pauses va avancer les échéances JLD des mesures concernées.');
        if (cbRetr.checked && portee !== avant.portee) msgs.push(portee === 'partout' ? 'Les durées du registre et des statistiques seront désormais hors pauses.' : 'Le registre et les statistiques reprendront les durées réelles.');
        if (cbRetr.checked && portee === 'partout' && contentionSeule !== avant.contentionSeule) msgs.push(contentionSeule === 'isolement' ? 'Les pauses de contention seule formeront des entrées A au registre.' : 'Les pauses de contention seule resteront dans l’entrée C du registre.');
        if (cbActive.checked !== avant.active) msgs.push(cbActive.checked ? 'Le bouton « Pause » sera disponible dans la page des mesures.' : 'Le bouton « Pause » disparaîtra de la page des mesures.');
        if (msgs.length && !confirm(msgs.join('\n') + '\nConfirmer ?')) return false;
        await enregistrerConfig([['pauses', { active: cbActive.checked, retrancher: cbRetr.checked, portee: portee, contentionSeule: contentionSeule, verrouContention: cbVerrou.checked, colonneRegistre: cbCol.checked, repriseAuto: cbAuto.checked, alerteHeures: a, refusHeures: r }]]);
      }));
    majPauses();

    if (!App.sousOngletAdmin) { try { App.sousOngletAdmin = localStorage.getItem('sic-admin') || ''; } catch (e) { App.sousOngletAdmin = ''; } }
    var pMasques = SIC.ui.actions.panneauMasquesDecompte && App.sousOngletAdmin === 'decompte' ? SIC.ui.actions.panneauMasquesDecompte() : null;

    // -- Colonnes annuelles de l'onglet Patients
    var colsP = M.colonnesPatients(cfg).map(function (c) { return { libelle: c.libelle, categories: c.categories.slice(), alerte: c.alerte }; });
    var corpsCols = h('tbody');
    function dessinerColsP() {
      vider(corpsCols);
      colsP.forEach(function (c, i) {
        var lib = h('input', { type: 'text', value: c.libelle, oninput: function () { c.libelle = lib.value; } });
        corpsCols.appendChild(h('tr', {},
          h('td', {}, lib),
          ['A', 'B', 'C', 'D', 'E'].map(function (k) {
            var cb = h('input', { type: 'checkbox', checked: c.categories.indexOf(k) >= 0, 'aria-label': 'Catégorie ' + k, title: lieu(M.LIB_CATEGORIES[k]), onchange: function () { c.categories = ['A', 'B', 'C', 'D', 'E'].filter(function (x) { return x === k ? cb.checked : c.categories.indexOf(x) >= 0; }); } });
            return h('td', { class: 'centre' }, cb);
          }),
          h('td', { class: 'centre' }, h('input', { type: 'checkbox', checked: c.alerte, 'aria-label': 'Alerte si différent de 0', onchange: function (ev) { c.alerte = ev.target.checked; } })),
          h('td', {}, h('button', { class: 'btn petit', onclick: function () { colsP.splice(i, 1); dessinerColsP(); } }, 'Retirer'))));
      });
    }
    dessinerColsP();
    var pColsP = h('section', { class: 'panneau' }, h('h2', { text: 'Onglet Patients : statistiques annuelles' }),
      h('p', { class: 'muted', text: lieu('Chaque colonne regroupe des catégories du registre et affiche, pour l’année choisie, le nombre d’entrées et leur durée cumulée. Rappel : une contention en CSI et l’isolement qui l’accompagne forment une seule entrée en catégorie C, alors que le juge compte une mesure d’isolement et une mesure de contention (colonne « Mesures (JLD) », toujours affichée).') }),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { text: 'Libellé de la colonne' }), ['A', 'B', 'C', 'D', 'E'].map(function (k) { return h('th', { class: 'centre', title: lieu(M.LIB_CATEGORIES[k]), text: k }); }), h('th', { class: 'centre', text: 'Devrait rester à 0' }), h('th'))),
        corpsCols)),
      h('small', { class: 'muted', text: Object.keys(M.LIB_CATEGORIES).map(function (k) { return k + ' : ' + lieu(M.LIB_CATEGORIES[k]); }).join(' · ') }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { colsP.push({ libelle: '', categories: [], alerte: false }); dessinerColsP(); } }, '+ Ajouter une colonne'),
        h('button', { class: 'btn', onclick: function () { colsP = M.CONFIG_DEFAUT.colonnesPatients.map(function (c) { return { libelle: c.libelle, categories: c.categories.slice(), alerte: c.alerte }; }); dessinerColsP(); } }, 'Colonnes par défaut')),
      boutonEnregistrer(async function () {
        var v = colsP.map(function (c) { return { libelle: String(c.libelle || '').trim(), categories: c.categories, alerte: !!c.alerte }; });
        v.forEach(function (c, i) {
          if (!c.libelle) throw new Error('Colonne ' + (i + 1) + ' : indiquez un libellé.');
          if (!c.categories.length) throw new Error('Colonne « ' + c.libelle + ' » : cochez au moins une catégorie.');
        });
        await enregistrerConfig([['colonnesPatients', v]]);
      }));

    // -- Registre
    var lignesC = [];
    Object.keys(cfg.compteursRegistre || {}).forEach(function (sv) { Object.keys(cfg.compteursRegistre[sv]).forEach(function (an) { lignesC.push(sv + ' ; ' + an + ' ; ' + cfg.compteursRegistre[sv][an]); }); });
    var tComp = zoneTexte(lignesC.join('\n'), 3);
    var pDocs = h('section', { class: 'panneau' }, h('h2', { text: 'Registre' }),
      h('label', {}, 'Dernier numéro utilisé dans le registre antérieur à l’outil (service ; année ; numéro)', tComp),
      boutonEnregistrer(async function () {
        var comp = {};
        lignesDe(tComp).forEach(function (l) { var x = l.split(';').map(function (v) { return v.trim(); }); if (x.length !== 3 || !/^\d{4}$/.test(x[1]) || !/^\d+$/.test(x[2])) throw new Error('Ligne mal formée : ' + l); comp[x[0]] = comp[x[0]] || {}; comp[x[0]][x[1]] = +x[2]; });
        await enregistrerConfig([['compteursRegistre', comp]]);
      }),
      blocNumerotationImportee());

    /** Années contenant des mesures importées déjà numérotées dans le classeur : numérotation conservée ou recalculée. */
    function blocNumerotationImportee() {
      var groupes = {};
      M.listeMesures(st()).forEach(function (m) {
        if (!m.numeroOrigine) return;
        var an = new Date(m.debut).getFullYear(), k = m.service + '|' + an;
        groupes[k] = groupes[k] || { service: m.service, annee: an, n: 0 }; groupes[k].n++;
      });
      var liste = Object.keys(groupes).sort().map(function (k) { return groupes[k]; });
      if (!liste.length) return null;
      var fige = cfg.registreFige || {}, anneeCourante = new Date().getFullYear();
      async function basculer(g, figer) {
        var passee = g.annee < anneeCourante;
        var msg = figer ? 'Revenir à la numérotation d’origine pour ' + libService(g.service) + ' ' + g.annee + ' ? Les numéros attribués par l’outil à ces mesures seront remplacés par ceux de leur document d’origine.'
          : 'Recalculer selon les règles de l’outil les entrées de ' + libService(g.service) + ' ' + g.annee + ' ?' + (passee ? '\n\nATTENTION : année passée. Les numéros, les catégories et le nombre d’entrées du registre peuvent changer, et avec eux les statistiques et rapports déjà produits pour cette année.' : '');
        var cpt = M.compteurPour(st(), g.service, g.annee, figer, Date.now());
        if (cpt != null) msg += '\n\nLe compteur du registre de cette année passera à ' + cpt + (figer ? ' (dernier numéro du document importé).' : ' (dernier numéro du document importé moins les entrées que l’outil numérotera lui-même).');
        if (!confirm(msg)) return;
        var v = JSON.parse(JSON.stringify(fige));
        if (figer) { v[g.service] = v[g.service] || {}; v[g.service][g.annee] = true; }
        else if (v[g.service]) { delete v[g.service][g.annee]; if (!Object.keys(v[g.service]).length) delete v[g.service]; }
        await App.session.enregistrer('CONFIG', { cle: 'registreFige', valeur: v });
        if (cpt != null) {
          var comp = JSON.parse(JSON.stringify(cfg.compteursRegistre || {}));
          comp[g.service] = comp[g.service] || {}; comp[g.service][g.annee] = cpt;
          await App.session.enregistrer('CONFIG', { cle: 'compteursRegistre', valeur: comp });
        }
        toast(figer ? 'Numérotation d’origine rétablie.' : 'Entrées recalculées selon les règles de l’outil.');
      }
      return h('div', { class: 'pile' },
        h('h3', { text: 'Mesures importées déjà numérotées (classeur ou registre d’origine)' }),
        h('p', { class: 'muted' }, h('small', { text: lieu('« D’origine » : chaque mesure importée garde la catégorie et le numéro de son document d’origine (classeur : une entrée par mesure ; registre : ses lignes à l’identique), et l’outil numérote les autres mesures en sautant ces numéros. « Outil » : les entrées sont recalculées selon les règles de l’outil (catégories A à E, une contention en CSI et son isolement formant une entrée C). Recalculer une année passée peut modifier les statistiques déjà produites.') })),
        h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Service', 'Année', 'Mesures importées numérotées', 'Numérotation', ''].map(function (t) { return h('th', { text: t }); }))),
          h('tbody', {}, liste.map(function (g) {
            var estFige = !!(fige[g.service] && fige[g.service][g.annee]);
            return h('tr', {},
              h('td', { text: libService(g.service) }), h('td', { text: String(g.annee) }), h('td', { text: String(g.n) }),
              h('td', {}, h('span', { class: 'badge ' + (estFige ? '' : 'ok'), text: estFige ? 'D’origine (conservée)' : 'Outil (recalculée)' })),
              h('td', { class: 'actions-ligne' }, h('button', { class: 'btn petit' + (!estFige && false ? '' : ''), onclick: function () { basculer(g, !estFige); } }, estFige ? 'Recalculer selon les règles de l’outil' : 'Revenir à la numérotation d’origine')));
          })))));
    }

    var pImport = SIC.ui.actions.importer ? h('section', { class: 'panneau' }, h('h2', { text: 'Reprise des données existantes' }),
      h('h3', { text: 'À partir du registre du service (tout outil)' }),
      h('p', { class: 'muted', text: 'Le registre est le seul document obligatoirement tenu sous forme numérique : exportez-le de votre outil actuel (CSV ou Excel), puis indiquez la correspondance des colonnes. Les mesures sont reconstituées à partir des entrées ; les cycles JLD et l’information des tiers ne figurant pas au registre, ils ne sont pas repris.' }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { SIC.ui.actions.importerRegistre(); } }, 'Importer un registre…'),
        h('button', { class: 'btn', onclick: function () {
          var a = h('a', { href: URL.createObjectURL(new Blob([SIC.importRegistre.modeleCSV()], { type: 'text/csv;charset=utf-8' })), download: 'modele-registre-import.csv' });
          document.body.appendChild(a); a.click(); a.remove();
        } }, 'Télécharger le modèle de registre (CSV)')),
      h('details', {}, h('summary', { text: 'Cas particulier : classeur Excel « Suivi_Isolement_Contention » (V1.3)' }),
        h('p', { class: 'muted', text: 'Uniquement pour les établissements qui utilisaient ce classeur, outil Excel dont est issu le projet. Il reprend en plus les cycles JLD, l’information des tiers, la surveillance poste par poste et le paramétrage. Un import relancé ne crée pas de doublon.' }),
        h('button', { class: 'btn', onclick: function () { SIC.ui.actions.importer('v13'); } }, 'Importer un classeur V1.3…'))) : null;

    // Administration rangée par module (décision du porteur du 8 novembre 2026) : réglages propres à Isocont dans son onglet,
    // `services` ne garde que les réglages partagés par la plateforme (modes d'hospitalisation, accueil)
    if (formation) return {
      services: [],
      sauvegardes: [],
      onglets: [
        ['organisation', 'Organisation du module', [pLieuNom, pSurv, pTiers, pOrgJLD]],
        ['regles', 'Règles et pauses', [pRegles, pPauses]],
        ['alertes', 'Alertes', [SIC.ui.alertes.panneauAdmin()]],
        ['cas', 'Cas particuliers', [SIC.ui.cas.panneauAdmin()]],
        ['registre', 'Registre et statistiques', [pDocs, pColsP, SIC.ui.methode.panneauAdmin(), SIC.ui.qualite.panneauAdmin()]],
        ['decompte', 'Décompte JLD', [pMasques]]
      ]
    };
    return {
      services: [SIC.ui.listes.panneauModes(), SIC.ui.listes.panneauAccueil()],
      sauvegardes: [],
      onglets: [
        ['organisation', 'Organisation du module', [pLieuNom, pSurv, SIC.ui.listes.panneauListes(), pTiers, pOrgJLD, SIC.ui.listes.panneauVigilance()]],
        ['regles', 'Règles et pauses', [pRegles, pPauses]],
        ['alertes', 'Alertes', [SIC.ui.alertes.panneauAdmin()]],
        ['cas', 'Cas particuliers', [SIC.ui.cas.panneauAdmin()]],
        ['registre', 'Registre et statistiques', [pDocs, pColsP, SIC.ui.methode.panneauAdmin(), SIC.ui.qualite.panneauAdmin(), SIC.ui.qualite.panneauArchive()]],
        ['decompte', 'Décompte JLD', [pMasques]],
        ['reprise', 'Reprise des données', [pImport]]
      ]
    };
  }

  // ================================================================ Déclaration auprès de la coquille
  U.vues.tableau = vueTableau; U.vues.mesures = vueMesures; U.vues.jld = vueJLD; U.vues.surveillance = vueSurveillance; U.vues.registre = vueRegistre;
  // Interface ajoutée au contrat du module (module-isocont.js) ; Patients et Statistiques s'ajoutent à U.vues depuis leurs fichiers
  SIC.modules.completerInterface('isocont', { vues: U.vues, journal: journal, admin: { panneaux: panneauxAdmin } });
  Object.assign(U, {
    mesuresVisibles: mesuresVisibles, badgeType: badgeType, badgePause: badgePause, alerteChamp: alerteChamp, tiersBadge: tiersBadge,
    detailMesure: function (m) { modaleDetail(m); }, cellEcheance: cellEcheance, selectPsychiatre: selectPsychiatre, recapMesure: recapMesure,
    extraitLoiTiers: extraitLoiTiers,
    LIB_TIERS: LIB_TIERS, LIB_STATUT: LIB_STATUT, LIB_NATURE: LIB_NATURE, LIB_CHAMPS: LIB_CHAMPS, resumeEvt: resumeEvt, valeurChamp: valeurChamp,
    libConfig: function (cle) { return lieu(LIB_CONFIG[cle]) || cle; }
  });
})();
