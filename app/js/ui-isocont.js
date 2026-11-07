// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Isocont — vues et fenêtres de saisie (étape 1 du plan d'architecture, premier bloc d'écran sorti de ui.js) :
 * tableau de bord, mesures, JLD, surveillance, registre ; nouvelle mesure, fin, pause, reprise, tiers, JLD, détail,
 * lieu, correction, proposition, professionnels. Les outils d'affichage et la coquille (en-tête, onglets, fenêtres)
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
  var toast = U.toast, modale = U.modale, fmtJour = U.fmtJour, rendreContenu = U.rendreContenu;
  var App = U.App, st = U.st, config = U.config, services = U.services, libService = U.libService, etablissement = U.etablissement, lieu = U.lieu;
  var patient = U.patient, nomPatient = U.nomPatient, modeActuel = U.modeActuel, dansService = U.dansService, idMesure = U.idMesure;
  var LIB_TIERS = U.LIB_TIERS, LIB_STATUT = U.LIB_STATUT, LIB_NATURE = U.LIB_NATURE, LIB_CHAMPS = U.LIB_CHAMPS, resumeEvt = U.resumeEvt, valeurChamp = U.valeurChamp;

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
      : h('span', { class: 'badge pause', title: 'Pause depuis ' + date(p.debut) + (p.motif ? ' — ' + p.motif : '') + ' (' + (p.psychiatre || '?') + ')', text: 'Pause → ' + heure(p.reprisePrevue) });
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
        h('button', { class: 'btn', onclick: function () { window.print(); } }, 'Imprimer')),
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


  function selectPsychiatre(valeur) {
    var liste = config().psychiatres || [];
    var sel = h('select', {}, h('option', { value: '', text: '— Choisir —' }), liste.map(function (p) { return h('option', { value: p, text: p, selected: p === valeur }); }), h('option', { value: '__autre', text: 'Autre…' }));
    var autre = h('input', { type: 'text', placeholder: 'Nom du psychiatre', hidden: true });
    sel.addEventListener('change', function () { autre.hidden = sel.value !== '__autre'; if (!autre.hidden) autre.focus(); });
    var bloc = h('div', { class: 'pile' }, sel, autre);
    bloc.valeur = function () { var v = sel.value === '__autre' ? autre.value.trim() : sel.value; if (!v) throw new Error('Indiquez le psychiatre décisionnaire.'); return v; };
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

    function patientChoisi() { return selPatient.value === '__nouveau' ? null : patient(selPatient.value); }
    function naissanceRequise() { var p = patientChoisi(); return !p || !p.naissance; }

    function remplirPatients() {
      vider(selPatient);
      var pts = Object.keys(st().patients).map(function (k) { return st().patients[k]; })
        .filter(function (p) { return !p.service || p.service === selSv.value; })
        .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      selPatient.appendChild(h('option', { value: '__nouveau', text: '+ Nouveau patient' }));
      pts.forEach(function (p) { selPatient.appendChild(h('option', { value: p.id, text: (p.nom || '') + ' ' + (p.prenom || '') + (p.ipp ? ' — IPP ' + p.ipp : '') })); });
      if (pts.length) selPatient.value = pts[0].id;
      majPatient();
    }
    function majPatient() {
      var p = patientChoisi();
      blocNouveau.hidden = !!p;
      zoneNaissance.hidden = !naissanceRequise();
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
        var commun = { patientId: patientId, service: selSv.value, debut: tDebut, debutInitial: tInitial == null ? undefined : tInitial, lieuInitial: tInitial == null ? undefined : lieuInitial.value.trim(), lieu: hors ? 'Chambre ' + chambre.value.trim() : selLieu.value, csi: !hors, psychiatre: psyNom, modeHospi: selMode.value, motifRecours: motifRecours && motifRecours.valeur() ? motifRecours.valeur() : undefined };
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
    var psy = selectPsychiatre(m.psychiatreDebut);
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
        await App.session.enregistrer('MESURE_FIN', { mesureId: m.id, fin: t, psychiatre: psy.valeur(), motif: motif.value + (precision.value.trim() ? ' (' + precision.value.trim() + ')' : '') }, base);
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
    var psy = selectPsychiatre(m.psychiatreDebut);
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
          await App.session.enregistrer('MESURE_FIN', { mesureId: conts[k].id, fin: b.t0, psychiatre: nomPsy, motif: 'Fin lors de la levée temporaire de l’isolement' }, conts[k].version);
        }
        for (var i = 0; i < cibles.length; i++) {
          await App.session.enregistrer('PAUSE', { mesureId: cibles[i].id, debut: Math.max(b.t0, cibles[i].debut), reprisePrevue: b.t1, psychiatre: nomPsy, motif: texteMotif }, cibles[i].version);
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
      h('div', { class: 'recap' }, h('div', { text: 'En pause depuis le ' + date(p.debut) + (p.motif ? ' — ' + p.motif : '') + ' (' + (p.psychiatre || '?') + ')' }), h('div', { text: 'Reprise prévue le ' + date(p.reprisePrevue) })),
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
    var psy = selectPsychiatre(m.psychiatreDebut);
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
        m.fin ? h('div', { text: 'Fin : ' + date(m.fin) + ' (' + (m.psychiatreFin || '?') + ')' }) : null),
      (m.pauses || []).length ? h('div', { class: 'recap' },
        h('b', { text: 'Levées temporaires (' + m.pauses.length + ', total ' + duree(M.dureePausesHeures(m, maintenant, config())) + (M.optionsPauses(config()).retrancher ? ', déduites du cumul, échéances reportées d’autant' : ', comptées dans le cumul') + ')' }),
        m.pauses.map(function (p) {
          var effective = p.reprise != null ? 'reprise le ' + date(p.reprise)
            : M.repriseAutomatique(m, p, maintenant, config()) ? 'reprise automatique le ' + date(p.reprisePrevue)
            : (typeof m.fin === 'number' ? 'fin de mesure pendant la pause' : (maintenant > p.reprisePrevue ? 'reprise non confirmée' : 'en cours'));
          return h('div', { text: date(p.debut) + ' → reprise prévue ' + date(p.reprisePrevue) + ' — ' + effective + (p.motif ? ' — ' + p.motif : '') + ' (' + (p.psychiatre || '?') + ')' });
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
    var psy = selectPsychiatre(m.psychiatreDebut);
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
        await App.session.enregistrer('MESURE_FIN', { mesureId: m.id, fin: t, psychiatre: nomPsy, motif: 'Changement de lieu' }, base);
        await App.session.enregistrer('MESURE_DEBUT', { mesureId: idMesure(), patientId: m.patientId, service: m.service, typeMesure: m.type, debut: t, lieu: hors ? 'Chambre ' + chambre.value.trim() : selLieu.value, csi: !hors, psychiatre: nomPsy, exception: false, modeHospi: m.modeHospi, suiteDe: m.id });
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


  // ================================================================ Déclaration auprès de la coquille
  U.vues.tableau = vueTableau; U.vues.mesures = vueMesures; U.vues.jld = vueJLD; U.vues.surveillance = vueSurveillance; U.vues.registre = vueRegistre;
  Object.assign(U, {
    mesuresVisibles: mesuresVisibles, badgeType: badgeType, badgePause: badgePause, alerteChamp: alerteChamp, tiersBadge: tiersBadge,
    detailMesure: function (m) { modaleDetail(m); }, cellEcheance: cellEcheance, selectPsychiatre: selectPsychiatre, recapMesure: recapMesure,
    extraitLoiTiers: extraitLoiTiers
  });
})();
