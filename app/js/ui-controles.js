// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Contrôles — interface (lot B, 14 novembre 2026). Logique : module-controles.js.
 * « Poste en cours » : une carte par CSI (contrôle de la CSI libre à deux agents, ou passage de surveillance de la CSI
 * occupée) ; postes précédents non faits pour l'encadrement. « Registre » : historique filtré, exportable.
 * Réglages (Administration → Contrôles, cadre pour ses services) : modèles actifs, check-list, second agent.
 * « Contrôles périodiques » (lot K, 17 novembre 2026) : contrôles réglés par le cadre (chariot d'urgence,
 * réfrigérateur à médicaments, sac d'urgence…), échéances, utilisations signalées, péremptions ; réglage par service.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, K = SIC.controles, C = SIC.crypto;
  var filtre = { modele: '', du: '', au: '', lieu: '' };
  var JOUR = 86400000, COURT_RYTHME = { jour: 'Quotidien', semaine: 'Hebdomadaire', mois: 'Mensuel' };
  function libOccurrence(x) { return x.utilisation ? 'Après utilisation' : (COURT_RYTHME[x.def && x.def.rythme] || x.libellePoste); }

  function s() { return U.App.session; }
  function st() { return (s() && s().ouvert && s().ouvert('controles') && s().etatModule('controles')) || { controles: {} }; }
  function peut(t) { try { return s().peut(t); } catch (e) { return false; } }
  function moi() { return s().compteEffectif(); }
  function cfg() { return U.config(); }
  function services() { var l = U.services().map(function (x) { return x.code; }).filter(function (sv) { return K.droits.serviceActif(cfg(), sv); }); return U.App.service && U.App.service !== '*' && l.indexOf(U.App.service) >= 0 ? [U.App.service] : l; }
  function encadre() { return peut('CONTROLE_ANNULE_TOUS') || s().roles().indexOf('ADMIN') >= 0; }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dateFr(iso) { var j = String(iso).split('-'); return j.length === 3 ? j[2] + '/' + j[1] : iso; }
  function jourISO(t) { return SIC.model.dateLocaleISO(t); }
  /** Occupation des CSI lue à la volée dans Isocont (null : Isocont illisible pour cet agent). */
  function occupations(sv) {
    try {
      if (!s().ouvert('isocont')) return null;
      return SIC.modules.lire('isocont.occupationsCSI', s().etatModule('isocont'), { services: [sv], depuis: Date.now() - 4 * 86400000 }) || [];
    } catch (e) { return null; }
  }
  function echeancesDe(sv, maintenant) { return K.echeances(st(), cfg(), { service: sv, occupations: occupations(sv) || [], maintenant: maintenant || Date.now(), jours: 2 }); }
  var LIB_ETAT = { fait: 'Fait', aConfirmer: 'À confirmer par un second agent', aFaire: 'À faire', retard: 'Non fait' };
  var CLASSE = { fait: 'ok', aConfirmer: 'warn', aFaire: 'warn', retard: 'bad' };

  // ------------------------------------------------------------ Saisies
  // ------------------------------------------------------------ Contrôles périodiques (17 novembre 2026)
  function echeancesPerDe(sv, maintenant) { return K.echeancesPeriodiques(st(), cfg(), { service: sv, maintenant: maintenant || Date.now(), jours: 2 }); }
  function dateLongue(iso) { return String(iso || '').split('-').reverse().join('/'); }
  /** Saisie d'un contrôle périodique : une ligne par point, selon son type (case, valeur, péremption, texte). */
  function modalePeriodique(x, sv) {
    var d = x.def, jour = jourISO(Date.now());
    var ecart = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Écart constaté', placeholder: 'Ce qui ne va pas, ce qui a été fait, qui a été prévenu (aucune donnée de patient).' });
    var lignes = d.points.map(function (p, i) {
      var nom = 'pp-' + i, l = { p: p, etat: h('small', { class: 'muted' }) }, champ;
      if (p.type === 'case') {
        l.oui = h('input', { type: 'radio', name: nom, value: 'oui' }); l.non = h('input', { type: 'radio', name: nom, value: 'non' });
        champ = h('div', { class: 'en-ligne' }, h('label', { class: 'case' }, l.oui, h('span', { text: 'Conforme' })), h('label', { class: 'case' }, l.non, h('span', { text: 'Non conforme' })));
      } else if (p.type === 'valeur') {
        l.champ = h('input', { type: 'number', step: 'any', class: 'champ-court', 'aria-label': p.libelle });
        var seuil = (p.min !== null ? 'mini ' + p.min : '') + (p.min !== null && p.max !== null ? ', ' : '') + (p.max !== null ? 'maxi ' + p.max : '');
        champ = h('div', { class: 'en-ligne' }, l.champ, h('span', { text: p.unite || '' }), seuil ? h('small', { class: 'muted', text: '(' + seuil + (p.unite ? ' ' + p.unite : '') + ')' }) : null, l.etat);
        l.champ.addEventListener('input', function () { l.etat.textContent = K.etatPoint({ type: 'valeur', valeur: l.champ.value, min: p.min, max: p.max }, jour) === 'horsSeuil' ? 'Hors des seuils : écart' : ''; l.etat.className = l.etat.textContent ? 'texte-alerte' : 'muted'; });
      } else if (p.type === 'peremption') {
        l.champ = h('input', { type: 'date', 'aria-label': p.libelle });
        champ = h('div', { class: 'en-ligne' }, l.champ, l.etat);
        l.champ.addEventListener('input', function () {
          var e2 = K.etatPoint({ type: 'peremption', peremption: l.champ.value }, jour, d.alerteJours);
          l.etat.textContent = e2 === 'depassee' ? 'Date dépassée : écart' : e2 === 'proche' ? 'Moins de ' + d.alerteJours + ' jours : à remplacer bientôt' : '';
          l.etat.className = e2 === 'depassee' ? 'texte-alerte' : e2 === 'proche' ? 'texte-attention' : 'muted';
        });
      } else {
        l.champ = h('input', { type: 'text', maxlength: 60, 'aria-label': p.libelle });
        champ = l.champ;
      }
      l.noeud = h('tr', {}, h('td', { text: p.libelle }), h('td', {}, champ));
      return l;
    });
    var tout = h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.forEach(function (l) { if (l.oui) l.oui.checked = true; }); } }, 'Cases : tout conforme');
    var contenu = h('div', { class: 'pile' },
      h('p', {}, h('b', { text: d.libelle }), d.lieu ? ' (' + d.lieu + ')' : '', ' — ' + (x.utilisation ? 'après l’utilisation signalée à ' + hm(x.utilisation.t) + ' par ' + (x.utilisation.nom || s().nomAuteur(x.utilisation.par)) : (COURT_RYTHME[d.rythme] ? 'contrôle du ' : x.libellePoste + ' du ') + dateFr(x.date))
        + (d.deuxAgents ? ' · contrôle à deux agents : un collègue confirmera avec son propre compte' : '')),
      d.modele !== 'libre' ? h('small', { class: 'muted', text: 'Liste proposée par Tessera, à adapter par l’établissement ou le cadre (Administration → Contrôles).' }) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'controle-liste' }, h('tbody', {}, lignes.map(function (l) { return l.noeud; })))),
      lignes.some(function (l) { return l.oui; }) ? h('div', { class: 'actions gauche' }, tout) : null,
      h('label', {}, 'Écart constaté (obligatoire si un point n’est pas conforme, une valeur hors des seuils ou une date dépassée)', ecart));
    U.modale(d.libelle, contenu, [{ texte: 'Annuler' }, { texte: 'Enregistrer le contrôle', classe: 'primaire', action: async function () {
      var items = lignes.map(function (l) {
        var p = l.p, it = { libelle: p.libelle, type: p.type };
        if (p.type === 'case') { it.ok = l.oui.checked ? true : (l.non.checked ? false : null); delete it.type; return it; }
        if (p.type === 'valeur') { it.valeur = l.champ.value === '' ? null : +l.champ.value; it.unite = p.unite; it.min = p.min; it.max = p.max; it.ok = K.etatPoint(it, x.date) !== 'horsSeuil'; }
        if (p.type === 'peremption') { it.peremption = l.champ.value; it.ok = !(it.peremption && it.peremption < x.date); }
        if (p.type === 'texte') { it.texte = l.champ.value.trim(); it.ok = true; }
        return it;
      });
      if (items.some(function (i) { return i.ok === null; })) throw new Error('Indiquez pour chaque case : conforme ou non conforme.');
      var dd = { id: 'CT-' + C.hex(C.aleatoire(8)), modele: 'periodique', def: d.id, service: sv, lieu: d.libelle, date: x.date, poste: x.poste, libellePoste: x.libellePoste,
        utilisation: x.utilisation ? x.utilisation.id : undefined, items: items, ecart: ecart.value.trim(), deuxAgents: d.deuxAgents, nom: moi().nom || '' };
      await s().enregistrer('CONTROLE', dd);
      var nc = items.some(function (i) { return !i.ok; });
      U.toast((nc ? 'Contrôle enregistré : écart signalé au cadre.' : 'Contrôle enregistré.') + (dd.deuxAgents ? ' Un second agent doit le confirmer.' : ''));
    } }], { large: true });
  }
  function modaleUtilisation(d, sv) {
    var com = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Commentaire', placeholder: 'Facultatif : ce qui a été utilisé, ce qui manque (aucune donnée de patient)' });
    U.modale('Signaler une utilisation', h('div', { class: 'pile' },
      h('p', { text: d.libelle + (d.lieu ? ' (' + d.lieu + ')' : '') + ' : un contrôle sera demandé dans les ' + d.delaiUtilisation + ' heures.' }), h('label', {}, 'Commentaire', com)),
      [{ texte: 'Annuler' }, { texte: 'Signaler', classe: 'primaire', action: async function () {
        await s().enregistrer('CONTROLE_UTILISATION', { id: 'UT-' + C.hex(C.aleatoire(8)), service: sv, def: d.id, libelle: d.libelle, commentaire: com.value.trim(), nom: moi().nom || '' });
        U.toast('Utilisation signalée : contrôle à faire dans les ' + d.delaiUtilisation + ' h.');
      } }]);
  }

  function modaleControle(x, sv) {
    if (x.modele === 'periodique') return modalePeriodique(x, sv);
    var o = K.options(cfg(), sv), modele = K.MODELES[x.modele], lignes = [];
    var ecart = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Écart constaté', placeholder: 'Point non conforme : ce qui manque ou ne fonctionne pas, ce qui a été fait (aucune donnée de patient).' });
    var contenu;
    var avecListe = K.MODELES[x.modele].liste;
    if (avecListe) {
      lignes = o.csiLibre.liste.map(function (l, i) {
        var nom = 'pt-' + i, oui = h('input', { type: 'radio', name: nom, value: 'oui' }), non = h('input', { type: 'radio', name: nom, value: 'non' });
        return { libelle: l, oui: oui, non: non, noeud: h('tr', {}, h('td', { text: l }), h('td', {}, h('label', { class: 'case' }, oui, h('span', { text: 'Conforme' }))), h('td', {}, h('label', { class: 'case' }, non, h('span', { text: 'Non conforme' })))) };
      });
      var tout = h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.forEach(function (l) { l.oui.checked = true; }); } }, 'Tout conforme');
      contenu = h('div', { class: 'pile' },
        h('p', {}, h('b', { text: x.lieu }), ' — ' + x.libellePoste + ' du ' + dateFr(x.date) + (o.csiLibre.deuxAgents ? ' · contrôle à deux agents : un collègue confirmera avec son propre compte' : '')),
        o.csiLibre.provisoire ? h('small', { class: 'muted', text: 'Liste provisoire, à remplacer par celle du service (Administration → Contrôles).' }) : null,
        h('div', { class: 'table-wrap' }, h('table', { class: 'controle-liste' }, h('tbody', {}, lignes.map(function (l) { return l.noeud; })))),
        h('div', { class: 'actions gauche' }, tout),
        h('label', {}, 'Écart constaté (obligatoire si un point n’est pas conforme)', ecart));
    } else {
      contenu = h('div', { class: 'pile' },
        h('p', {}, h('b', { text: x.lieu }), ' — ' + x.libellePoste + ' du ' + dateFr(x.date)),
        h('p', { text: 'Vous notez votre passage de surveillance dans la CSI occupée, avec l’heure. Le contenu de la surveillance reste dans le dossier patient informatisé (DPI).' }),
        h('label', {}, 'Remarque sur la chambre (facultatif, aucune donnée de patient)', ecart));
    }
    U.modale(modele.libelle, contenu, [{ texte: 'Annuler' }, { texte: avecListe ? 'Enregistrer le contrôle' : 'Noter mon passage', classe: 'primaire', action: async function () {
      var items = lignes.map(function (l) { return { libelle: l.libelle, ok: l.oui.checked ? true : (l.non.checked ? false : null) }; });
      if (items.some(function (i) { return i.ok === null; })) throw new Error('Indiquez pour chaque point : conforme ou non conforme.');
      var d = { id: 'CT-' + C.hex(C.aleatoire(8)), modele: x.modele, service: sv, lieu: x.lieu, date: x.date, poste: x.poste, libellePoste: x.libellePoste, items: items, ecart: ecart.value.trim(),
        deuxAgents: avecListe && o.csiLibre.deuxAgents, nom: moi().nom || '' };
      await s().enregistrer('CONTROLE', d);
      var nc = items.some(function (i) { return !i.ok; });
      if (nc) setTimeout(function () { proposerTravaux(Object.assign({}, d, { par: moi().id })); }, 0);
      U.toast(x.modele === 'surveillance' ? 'Passage noté à ' + hm(Date.now()) + '.' : (nc ? 'Contrôle enregistré : écart signalé au cadre.' : 'Contrôle enregistré.') + (d.deuxAgents ? ' Un second agent doit le confirmer.' : ''));
    } }], { large: avecListe });
  }
  /** Écart constaté : demande de travaux préremplie (chambre, points non conformes, commentaire), si le module est ouvert. */
  function peutTravaux() { try { return !!(U.travaux && s().ouvert('travaux') && s().peut('TRAVAUX') && !s().apercu); } catch (e) { return false; } }
  function demandeTravaux(c) {
    U.travaux.modaleDemande(null, { service: c.service, lieu: 'chambre', chambre: String(c.lieu).slice(0, 20),
      description: 'Écart au contrôle ' + (c.modele === 'periodique' ? '« ' + c.lieu + ' »' : 'de la ' + c.lieu) + ' (' + (c.modele === 'periodique' && c.utilisation ? 'après utilisation' : (c.libellePoste || c.poste)) + ' du ' + dateFr(c.date) + ') : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', ') + (c.ecart ? '. ' + c.ecart : '') });
  }
  function proposerTravaux(c) {
    if (!peutTravaux()) return;
    U.modale('Écart constaté', h('p', { text: 'Faut-il une intervention des services techniques ? La demande de travaux sera préremplie avec la chambre et les points non conformes.' }),
      [{ texte: 'Non' }, { texte: 'Faire une demande de travaux', classe: 'primaire', action: function () { setTimeout(function () { demandeTravaux(c); }, 0); } }]);
  }
  function modaleConfirmer(c) {
    U.modale('Confirmer le contrôle (second agent)', h('div', { class: 'pile' },
      h('p', {}, h('b', { text: c.lieu }), ' — ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) + ', fait par ' + (c.nom || s().nomAuteur(c.par)) + ' à ' + hm(Date.parse(c.le))),
      h('ul', { class: 'liste-simple' }, c.items.map(function (i) { return h('li', { class: i.ok ? '' : 'texte-alerte', text: (i.ok ? '✓ ' : '✗ ') + i.libelle }); })),
      c.ecart ? h('p', {}, h('b', { text: 'Écart : ' }), c.ecart) : null,
      K.releves(c) ? h('p', { class: 'muted', text: 'Relevés : ' + K.releves(c) }) : null,
      h('small', { class: 'muted', text: 'En confirmant, vous attestez avoir vérifié ' + (c.modele === 'periodique' ? 'le contrôle' : 'la chambre') + ' avec votre collègue. Confirmation enregistrée à votre nom.' })),
      [{ texte: 'Annuler' }, { texte: 'Je confirme', classe: 'primaire', action: async function () { await s().enregistrer('CONTROLE_CONFIRME', { controle: c.id, service: c.service, nom: moi().nom || '' }); U.toast('Contrôle confirmé.'); } }]);
  }
  function modaleAnnuler(c) {
    var motif = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Motif' });
    U.modale('Annuler ce contrôle', h('div', { class: 'pile' }, h('p', { text: c.lieu + ' — ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) + ' (' + K.MODELES[c.modele].court + ')' }), h('label', {}, 'Motif (le contrôle reste au registre, marqué annulé)', motif)),
      [{ texte: 'Fermer' }, { texte: 'Annuler le contrôle', classe: 'danger', action: async function () { await s().enregistrer('CONTROLE_ANNULE', { controle: c.id, service: c.service, motif: motif.value.trim(), nom: moi().nom || '' }); U.toast('Contrôle annulé : il peut être refait.'); } }]);
  }

  // ------------------------------------------------------------ Vues
  function carte(x, sv) {
    var c = x.controle, m = K.MODELES[x.modele], actions = [];
    var lecture = s().apercu || !peut('CONTROLE');
    if (!c && !lecture && x.etat !== 'retard') actions.push(h('button', { class: 'btn primaire petit', type: 'button', onclick: function () { modaleControle(x, sv); } }, m.liste ? 'Faire le contrôle' : 'Noter mon passage'));
    if (!c && !lecture && x.etat === 'retard') actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleControle(x, sv); } }, 'Faire en retard'));
    if (c && c.deuxAgents && !c.confirmePar && !lecture && c.par !== moi().id) actions.push(h('button', { class: 'btn primaire petit', type: 'button', onclick: function () { modaleConfirmer(c); } }, 'Confirmer (second agent)'));
    if (c && K.nonConforme(c) && peutTravaux()) actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { demandeTravaux(c); } }, 'Demande de travaux…'));
    if (c && !lecture && (c.par === moi().id || encadre())) actions.push(h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleAnnuler(c); } }, 'Annuler'));
    return h('article', { class: 'controle-carte etat-' + x.etat },
      h('div', { class: 'barre' }, h('b', { text: x.lieu }), h('span', { class: 'badge', text: x.modele === 'periodique' ? libOccurrence(x) : m.court }), h('div', { class: 'espace' }), h('span', { class: 'badge ' + CLASSE[x.etat], text: LIB_ETAT[x.etat] })),
      c ? h('small', { class: 'muted', text: (x.modele === 'surveillance' ? 'Passage de ' : 'Fait par ') + (c.nom || s().nomAuteur(c.par)) + ' à ' + hm(Date.parse(c.le)) + (c.confirmePar ? ', confirmé par ' + (c.nomConfirme || s().nomAuteur(c.confirmePar)) + ' à ' + hm(Date.parse(c.confirmeLe)) : '') }) : null,
      c && K.nonConforme(c) ? h('p', { class: 'texte-alerte', text: 'Écart : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', ') + (c.ecart ? ' — ' + c.ecart : '') }) : (c && c.ecart ? h('p', { class: 'muted', text: c.ecart }) : null),
      x.modele === 'liberation' ? h('small', { class: 'muted', text: 'CSI libérée à ' + hm(x.debut) + ' : contrôle avant une nouvelle mesure.' }) : null,
      x.modele === 'periodique' ? h('small', { class: 'muted', text: x.utilisation ? 'Après l’utilisation signalée à ' + hm(x.utilisation.t) + ', attendu avant ' + hm(x.fin) : (x.def.lieu ? x.def.lieu + ' · ' : '') + K.libelleRythme(x.def) }) : null,
      c && c.modele === 'periodique' && K.releves(c) ? h('small', { class: 'muted', text: K.releves(c) }) : null,
      actions.length ? h('div', { class: 'actions gauche' }, actions) : null);
  }
  function vuePoste() {
    var maintenant = Date.now(), blocs = services().map(function (sv) {
      var ech = echeancesDe(sv, maintenant), lieux = K.csiDu(cfg(), sv), occ = occupations(sv);
      var courant = ech.filter(function (x) { return x.debut <= maintenant && x.fin > maintenant; }), ret = K.retards(ech);
      return h('section', { class: 'panneau' }, h('h2', { text: U.libService(sv) + (courant[0] ? ' — ' + courant[0].libellePoste + ' (' + hm(courant[0].debut) + ' – ' + hm(courant[0].fin) + ')' : '') }),
        !lieux.length ? h('p', { class: 'muted', text: 'Aucune chambre de soins intensifs déclarée pour ce service (Administration → Réglages généraux → Établissement et services → lieux d’isolement).' }) : null,
        occ === null && lieux.length ? h('p', { class: 'muted', text: 'Occupation des CSI inconnue (Isocont non ouvert pour vous) : chaque CSI est présentée comme libre.' }) : null,
        courant.length ? h('div', { class: 'controles-grille' }, courant.map(function (x) { return carte(x, sv); })) : (lieux.length ? h('p', { class: 'muted', text: 'Aucun contrôle pour le poste en cours.' }) : null),
        encadre() && ret.length ? h('div', { class: 'pile' }, h('h3', { text: 'Postes précédents : contrôles non faits ou non confirmés (' + ret.length + ')' }),
          h('div', { class: 'controles-grille' }, ret.map(function (x) { var n = carte(x, sv); n.insertBefore(h('small', { class: 'muted', text: x.libellePoste + ' du ' + dateFr(x.date) }), n.firstChild); return n; }))) : null);
    });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Contrôles du poste en cours' })),
      h('p', { class: 'muted', text: 'Chaque poste : contrôle de chaque CSI libre (à deux agents) et passage de surveillance dans chaque CSI occupée. L’occupation est lue dans Isocont. Aucune donnée clinique : le contenu de la surveillance reste dans le DPI.' }),
      blocs);
  }
  /** Onglet « Contrôles périodiques » : par service, chaque contrôle réglé, son échéance, les utilisations et péremptions. */
  function vuePeriodiques() {
    var maintenant = Date.now(), auj = jourISO(maintenant), lecture = s().apercu || !peut('CONTROLE');
    var blocs = services().map(function (sv) {
      var defs = K.periodiques(cfg(), sv).filter(function (d) { return d.actif; });
      var ech = echeancesPerDe(sv, maintenant), per = K.peremptions(st(), cfg(), sv, maintenant);
      var enCours = ech.filter(function (x) { return x.fin > maintenant || x.etat === 'aConfirmer' || (x.etat === 'fait' && x.date === auj); });
      var ret = ech.filter(function (x) { return x.etat === 'retard'; });
      var fiches = defs.map(function (d) {
        var prochaines = K.occurrences(cfg(), sv, d, auj, jourISO(maintenant + 40 * JOUR)).filter(function (o) { return o.debut > maintenant; });
        var derniers = K.registre(st(), { services: [sv], modele: 'periodique' }).filter(function (c) { return c.def === d.id && !c.annule; });
        return h('div', { class: 'controle-carte' },
          h('div', { class: 'barre' }, h('b', { text: d.libelle }), d.lieu ? h('span', { class: 'muted', text: d.lieu }) : null, h('div', { class: 'espace' }),
            d.deuxAgents ? h('span', { class: 'badge', text: 'À deux agents' }) : null),
          h('small', { class: 'muted', text: K.libelleRythme(d) + ' · ' + d.points.length + ' point(s)' }),
          h('small', { class: 'muted', text: 'Dernier contrôle : ' + (derniers[0] ? dateFr(derniers[0].date) + ' par ' + (derniers[0].nom || s().nomAuteur(derniers[0].par)) + (K.nonConforme(derniers[0]) ? ' (écart)' : '') : 'aucun')
            + (prochaines[0] && d.rythme !== 'poste' ? ' · prochain : ' + dateFr(prochaines[0].date) : '') }),
          !lecture && d.apresUtilisation ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleUtilisation(d, sv); } }, 'Signaler une utilisation')) : null);
      });
      return h('section', { class: 'panneau' }, h('h2', { text: U.libService(sv) }),
        !defs.length ? h('p', { class: 'muted', text: 'Aucun contrôle périodique réglé pour ce service' + (encadre() ? ' (Administration → Contrôles → Contrôles périodiques, ou réglages du cadre).' : ' : le cadre les règle.') }) : null,
        enCours.length ? h('div', { class: 'pile controles-bloc' }, h('h3', { text: 'À faire maintenant' }), h('div', { class: 'controles-grille' }, enCours.map(function (x) { return carte(x, sv); }))) : (defs.length ? h('p', { class: 'muted', text: 'Aucun contrôle périodique à faire en ce moment.' }) : null),
        ret.length ? h('div', { class: 'pile controles-bloc' }, h('h3', { text: 'En retard (' + ret.length + ')' }), h('div', { class: 'controles-grille' }, ret.map(function (x) { var n = carte(x, sv); n.insertBefore(h('small', { class: 'muted', text: libOccurrence(x) + ' du ' + dateFr(x.date) }), n.firstChild); return n; }))) : null,
        per.length ? h('div', { class: 'pile controles-bloc' }, h('h3', { text: 'Péremptions relevées au dernier contrôle' }),
          h('ul', { class: 'liste-simple' }, per.map(function (p) { return h('li', { class: p.etat === 'depassee' ? 'texte-alerte' : 'texte-attention', text: p.def.libelle + ' — ' + p.point + ' : ' + dateLongue(p.peremption) + (p.etat === 'depassee' ? ' (dépassée)' : ' (dans moins de ' + p.def.alerteJours + ' jours)') }); }))) : null,
        defs.length ? h('div', { class: 'pile controles-bloc' }, h('h3', { text: 'Contrôles réglés' }), h('div', { class: 'controles-grille' }, fiches)) : null);
    });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Contrôles périodiques' })),
      h('p', { class: 'muted', text: 'Chariot d’urgence, réfrigérateur à médicaments, sac d’urgence… : contrôles réglés par le cadre, à leur rythme et après chaque utilisation signalée. Une valeur hors des seuils ou une date dépassée est un écart, signalé au cadre ; une péremption proche est rappelée à l’avance. Aucune donnée de patient.' }),
      blocs);
  }
  function vueRegistre() {
    var svs = services(), ls = K.registre(st(), { services: svs, modele: filtre.modele, du: filtre.du, au: filtre.au });
    function champ(cle, type, libelle) { return h('label', {}, libelle, h('input', { type: type, value: filtre[cle], onchange: function (ev) { filtre[cle] = ev.target.value; U.rendreContenu(); } })); }
    var nc = ls.filter(function (c) { return !c.annule && K.nonConforme(c); }).length;
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Registre des contrôles' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn', type: 'button', onclick: function () { var t = document.querySelector('.registre-controles'); if (t) U.imprimer(t); } }, 'Imprimer'),
        encadre() ? h('button', { class: 'btn', type: 'button', onclick: function () { exporter(ls); } }, 'Exporter (CSV)') : null),
      h('div', { class: 'filtres' },
        h('label', {}, 'Contrôle', h('select', { onchange: function (ev) { filtre.modele = ev.target.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous' })].concat(Object.keys(K.MODELES).map(function (k) { return h('option', { value: k, text: K.MODELES[k].libelle, selected: filtre.modele === k }); })))),
        champ('du', 'date', 'Du'), champ('au', 'date', 'Au')),
      h('p', { class: 'muted', text: ls.length + ' contrôle(s)' + (nc ? ', dont ' + nc + ' avec un écart' : '') + '.' }),
      (function () { var hc = encadre() ? K.horsConservation(st(), cfg(), Date.now()).filter(function (c) { return svs.indexOf(c.service) >= 0; }) : [], mois = K.options(cfg(), null).conservationMois;
        return hc.length ? h('p', { class: 'alerte-ligne', text: hc.length + ' contrôle(s) dépassent la durée de conservation fixée par l’établissement (' + mois + ' mois) : à traiter selon sa procédure (rien n’est supprimé automatiquement).' }) : null; })(),
      ls.length ? h('div', { class: 'table-wrap registre-controles' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Poste', 'Service', 'Lieu', 'Contrôle', 'Fait par', 'Second agent', 'Résultat', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, ls.slice(0, 500).map(function (c) {
          var res = c.annule ? 'Annulé : ' + c.annule.motif : (c.modele === 'surveillance' ? 'Passage noté' + (c.ecart ? ' — ' + c.ecart : '') : (K.nonConforme(c) ? 'Écart : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', ') + (c.ecart ? ' — ' + c.ecart : '') : 'Conforme'));
          return h('tr', { class: c.annule ? 'ligne-annulee' : '' }, h('td', { text: dateFr(c.date) + ' ' + (c.libellePoste || c.poste) + (c.modele === 'periodique' ? ' ' + hm(Date.parse(c.le)) : '') }), h('td', { text: U.libService(c.service) }), h('td', {}, c.lieu, c.modele === 'periodique' && K.releves(c) ? h('small', { class: 'muted bloc', text: K.releves(c) }) : null), h('td', { text: c.modele === 'periodique' ? (c.utilisation ? 'Après utilisation' : 'Périodique') : K.MODELES[c.modele].court }),
            h('td', { text: (c.nom || s().nomAuteur(c.par)) + ' ' + hm(Date.parse(c.le)) }), h('td', { text: c.deuxAgents ? (c.confirmePar ? (c.nomConfirme || s().nomAuteur(c.confirmePar)) + ' ' + hm(Date.parse(c.confirmeLe)) : 'non confirmé') : '—' }),
            h('td', { class: !c.annule && K.nonConforme(c) ? 'texte-alerte' : '', text: res }),
            h('td', {}, !c.annule && !s().apercu && (c.par === moi().id || encadre()) ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleAnnuler(c); } }, 'Annuler') : null));
        })))) : h('p', { class: 'muted', text: 'Aucun contrôle sur cette période.' }));
  }
  function exporter(ls) {
    var lignes = K.lignesExport(ls, U.libService);
    var csv = '﻿' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('registres', 'registre_controles_' + jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }

  // ------------------------------------------------------------ Réglages (administrateur, cadre pour ses services)
  function panneauReglages() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: 'Service ' + x.libelle }; }));
    if (!niveaux.length) return null;
    var v = JSON.parse(JSON.stringify(cfg().controles || {})), niveau = niveaux[0].code, zone = h('div', { class: 'pile' }), lire = function () {};
    function dessiner() {
      U.vider(zone);
      var propre = v[niveau] || {}, eff = K.options(cfg(), niveau === '*' ? null : niveau), l = propre.csiLibre || {}, sv = propre.surveillance || {}, lb = propre.liberation || {};
      function tri(valeur, defaut, libelle) {
        var suit = niveau !== '*' && valeur === undefined;
        var sel = h('select', { 'aria-label': libelle }, (niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement (' + (defaut ? 'oui' : 'non') + ')', selected: suit })])
          .concat([h('option', { value: 'oui', text: 'Oui', selected: !suit && (valeur === undefined ? defaut : valeur) }), h('option', { value: 'non', text: 'Non', selected: !suit && !(valeur === undefined ? defaut : valeur) })]));
        return { noeud: h('label', {}, libelle, sel), lire: function () { return sel.value === '' ? undefined : sel.value === 'oui'; } };
      }
      var e = niveau === '*' ? K.options({}, null) : K.options(cfg(), null);
      var aL = tri(l.actif, e.csiLibre.actif, 'Contrôle des CSI libres à chaque poste'), dA = tri(l.deuxAgents, e.csiLibre.deuxAgents, 'Second agent qui confirme'), aS = tri(sv.actif, e.surveillance.actif, 'Passage de surveillance des CSI occupées à chaque poste'), aB = tri(lb.actif, e.liberation.actif, 'Contrôle de la CSI à sa libération (fin de mesure)');
      var cons = niveau === '*' ? h('input', { type: 'number', min: 1, max: 600, value: (propre.conservationMois || ''), class: 'champ-court', 'aria-label': 'Durée de conservation du registre (mois)' }) : null;
      var liste = h('textarea', { rows: 9, 'aria-label': 'Check-list des CSI libres, un point par ligne' });
      liste.value = Array.isArray(l.liste) ? l.liste.join('\n') : '';
      zone.appendChild(h('div', { class: 'pile' }, h('div', { class: 'grille-3' }, aL.noeud, dA.noeud, aS.noeud, aB.noeud),
        cons ? h('label', { class: 'en-ligne' }, 'Durée de conservation du registre :', cons, 'mois', h('small', { class: 'muted', text: 'fixée par l’établissement ; vide : non fixée. Les contrôles plus anciens sont signalés dans le registre, jamais supprimés automatiquement.' })) : null,
        h('label', {}, 'Check-list des CSI libres, un point par ligne (vide : ' + (niveau === '*' ? 'liste provisoire' : 'celle de l’établissement') + ')', liste),
        h('small', { class: 'muted', text: 'Liste appliquée : ' + eff.csiLibre.liste.join(' · ') + (eff.csiLibre.provisoire ? ' (liste provisoire, à remplacer)' : '') })));
      lire = function () {
        var pts = liste.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var n = { csiLibre: {}, surveillance: {}, liberation: {} };
        if (aB.lire() !== undefined) n.liberation.actif = aB.lire();
        if (!Object.keys(n.liberation).length) delete n.liberation;
        if (cons && cons.value) n.conservationMois = Math.max(1, Math.min(600, Math.round(+cons.value)));
        if (aL.lire() !== undefined) n.csiLibre.actif = aL.lire();
        if (dA.lire() !== undefined) n.csiLibre.deuxAgents = dA.lire();
        if (pts.length) n.csiLibre.liste = pts.slice(0, 40);
        if (aS.lire() !== undefined) n.surveillance.actif = aS.lire();
        if (!Object.keys(n.csiLibre).length) delete n.csiLibre;
        if (!Object.keys(n.surveillance).length) delete n.surveillance;
        if (Object.keys(n).length) v[niveau] = n; else delete v[niveau];
      };
    }
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { lire(); niveau = sel.value; dessiner(); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Contrôles des chambres de soins intensifs' }),
      h('p', { class: 'muted', text: 'À chaque poste (postes de surveillance d’Isocont) : contrôle de chaque CSI libre, à deux agents, avec la check-list ; passage de surveillance dans chaque CSI occupée ; contrôle de la CSI à sa libération, avec la même check-list. Rappel à l’équipe pendant le poste, alerte au cadre une fois le poste terminé. Le module s’active service par service (Réglages généraux → Modules activés par service).' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () {
        lire();
        // Les contrôles périodiques se règlent dans leur propre rubrique : on garde ceux enregistrés entre-temps.
        var actuel = cfg().controles || {};
        Object.keys(actuel).forEach(function (k) { if (actuel[k] && actuel[k].periodiques) { v[k] = v[k] || {}; v[k].periodiques = actuel[k].periodiques; } });
        Object.keys(v).forEach(function (k) { if (v[k] && !(actuel[k] && actuel[k].periodiques)) delete v[k].periodiques; });
        await U.enregistrerConfig([['controles', v]]);
      }));
  }

  /** Réglage des contrôles périodiques d'un service (administrateur, cadre pour ses services). */
  function panneauPeriodiques() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var svs = U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; });
    if (!svs.length) return null;
    var sv = svs.filter(function (x) { return x.code === U.App.service; })[0] ? U.App.service : svs[0].code, liste = [], zone = h('div', { class: 'pile' });
    function charger() { liste = K.periodiques(cfg(), sv).map(function (d) { return JSON.parse(JSON.stringify(d)); }); }
    function nouvelId() { var id; do { id = 'cp-' + C.hex(C.aleatoire(5)); } while (liste.some(function (d) { return d.id === id; })); return id; }
    function dessiner() {
      U.vider(zone);
      zone.appendChild(liste.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Contrôle', 'Rythme', 'Points', 'Actif', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, liste.map(function (d, i) {
          var actif = h('input', { type: 'checkbox', checked: d.actif, 'aria-label': 'Actif : ' + d.libelle, onchange: function (ev) { d.actif = ev.target.checked; } });
          return h('tr', { class: d.actif ? '' : 'ligne-annulee' }, h('td', {}, h('b', { text: d.libelle }), d.lieu ? h('small', { class: 'muted bloc', text: d.lieu }) : null),
            h('td', { text: K.libelleRythme(d) + (d.deuxAgents ? ' · à deux agents' : '') }), h('td', { text: String(d.points.length) }), h('td', {}, actif),
            h('td', {}, h('div', { class: 'en-ligne' },
              h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleDefinition(d, function (n) { liste[i] = n; dessiner(); }); } }, 'Modifier'),
              h('button', { class: 'btn petit danger', type: 'button', onclick: async function () {
                if (!(await SIC.ui.confirmer('Retirer « ' + d.libelle + ' » des contrôles du service ? Les contrôles déjà faits restent au registre. Pour une pause, décochez plutôt « Actif ».'))) return;
                liste.splice(i, 1); dessiner();
              } }, 'Retirer'))));
        })))) : h('p', { class: 'muted', text: 'Aucun contrôle périodique pour ce service.' }));
      var choix = h('select', { 'aria-label': 'Modèle' }, Object.keys(K.MODELES_PERIODIQUES).map(function (k) { return h('option', { value: k, text: K.MODELES_PERIODIQUES[k].libelle }); }).concat([h('option', { value: 'libre', text: 'Contrôle vide (à composer)' })]));
      zone.appendChild(h('div', { class: 'en-ligne' }, h('label', { class: 'en-ligne' }, h('span', { class: 'sans-coupure', text: 'Ajouter :' }), choix),
        h('button', { class: 'btn', type: 'button', onclick: function () {
          if (liste.length >= 60) return SIC.ui.alerte('60 contrôles périodiques au plus par service.');
          var n = K.depuisModele(choix.value, nouvelId());
          modaleDefinition(n, function (r) { liste.push(r); dessiner(); });
        } }, 'Ajouter…')));
    }
    var selSv = h('select', { 'aria-label': 'Service', onchange: function () { sv = selSv.value; charger(); dessiner(); } }, svs.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === sv }); }));
    charger(); dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Contrôles périodiques' }),
      h('p', { class: 'muted', text: 'Contrôles du matériel du service, à leur rythme (à chaque poste, chaque jour, chaque semaine, chaque mois) et, si besoin, après chaque utilisation signalée. Les modèles proposés (chariot d’urgence, réfrigérateur à médicaments, sac d’urgence) sont à adapter à la procédure de l’établissement. Rappel à l’équipe le jour venu (Aujourd’hui et Agenda), alerte au cadre en cas de retard, d’écart ou de péremption.' }),
      h('label', {}, 'Service', selSv), zone,
      U.boutonEnregistrer(async function () {
        var v = JSON.parse(JSON.stringify(cfg().controles || {}));
        v[sv] = v[sv] || {};
        if (liste.length) v[sv].periodiques = liste; else delete v[sv].periodiques;
        if (!Object.keys(v[sv]).length) delete v[sv];
        await U.enregistrerConfig([['controles', v]]);
      }));
  }
  /** Fenêtre de réglage d'un contrôle périodique : identité, rythme, options, points. */
  function modaleDefinition(d0, fini) {
    var d = JSON.parse(JSON.stringify(d0)), pts = d.points.map(function (p) { return Object.assign({}, p); }), zonePts = h('div', { class: 'pile' });
    var lib = h('input', { type: 'text', maxlength: 80, value: d.libelle, 'aria-label': 'Nom du contrôle' }), lieu = h('input', { type: 'text', maxlength: 60, value: d.lieu || '', 'aria-label': 'Lieu' });
    var rythme = h('select', { 'aria-label': 'Rythme' }, Object.keys(K.RYTHMES).map(function (k) { return h('option', { value: k, text: K.RYTHMES[k], selected: d.rythme === k }); }));
    var jourS = h('select', { 'aria-label': 'Jour de la semaine' }, [1, 2, 3, 4, 5, 6, 7].map(function (j) { return h('option', { value: j, text: K.JOURS_SEMAINE[j], selected: d.jourSemaine === j }); }));
    var jourM = h('input', { type: 'number', min: 1, max: 28, value: d.jourMois, class: 'champ-court', 'aria-label': 'Jour du mois' });
    var apres = h('input', { type: 'checkbox', checked: d.apresUtilisation }), delai = h('input', { type: 'number', min: 1, max: 72, value: d.delaiUtilisation, class: 'champ-court', 'aria-label': 'Délai après utilisation (heures)' });
    var deux = h('input', { type: 'checkbox', checked: d.deuxAgents }), alerte = h('input', { type: 'number', min: 1, max: 365, value: d.alerteJours, class: 'champ-court', 'aria-label': 'Alerte avant péremption (jours)' });
    var lJS = h('label', { class: 'en-ligne' }, 'Le', jourS), lJM = h('label', { class: 'en-ligne' }, 'Le', jourM, 'du mois (1 à 28)');
    function majRythme() { lJS.hidden = rythme.value !== 'semaine'; lJM.hidden = rythme.value !== 'mois'; }
    rythme.addEventListener('change', majRythme); majRythme();
    function dessinerPts() {
      U.vider(zonePts);
      zonePts.appendChild(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Point à vérifier', 'Type', 'Unité', 'Mini', 'Maxi', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, pts.map(function (p, i) {
          var val = p.type === 'valeur';
          function maj(cle) { return function (ev) { p[cle] = ev.target.value; }; }
          var type = h('select', { 'aria-label': 'Type du point', onchange: function (ev) { p.type = ev.target.value; dessinerPts(); } }, Object.keys(K.TYPES_POINT).map(function (k) { return h('option', { value: k, text: K.TYPES_POINT[k], selected: p.type === k }); }));
          return h('tr', {}, h('td', {}, h('input', { type: 'text', maxlength: 120, value: p.libelle, 'aria-label': 'Point à vérifier', oninput: maj('libelle') })), h('td', {}, type),
            h('td', {}, val ? h('input', { type: 'text', maxlength: 12, value: p.unite || '', class: 'champ-court', 'aria-label': 'Unité', oninput: maj('unite') }) : null),
            h('td', {}, val ? h('input', { type: 'number', step: 'any', value: p.min === null || p.min === undefined ? '' : p.min, class: 'champ-court', 'aria-label': 'Seuil mini', oninput: maj('min') }) : null),
            h('td', {}, val ? h('input', { type: 'number', step: 'any', value: p.max === null || p.max === undefined ? '' : p.max, class: 'champ-court', 'aria-label': 'Seuil maxi', oninput: maj('max') }) : null),
            h('td', {}, h('div', { class: 'en-ligne' },
              h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { pts.splice(i - 1, 0, pts.splice(i, 1)[0]); dessinerPts(); } }, '↑'),
              h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le point', onclick: function () { pts.splice(i, 1); dessinerPts(); } }, '✕'))));
        })))));
      zonePts.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (pts.length < 40) { pts.push({ libelle: '', type: 'case' }); dessinerPts(); } } }, 'Ajouter un point')));
    }
    dessinerPts();
    U.modale(d.libelle || 'Contrôle périodique', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Nom du contrôle', lib), h('label', {}, 'Lieu (facultatif)', lieu), h('label', {}, 'Rythme', rythme)),
      h('div', { class: 'en-ligne' }, lJS, lJM),
      h('label', { class: 'case' }, apres, h('span', {}, 'Contrôle aussi après chaque utilisation signalée, dans les ', delai, ' heures')),
      h('label', { class: 'case' }, deux, h('span', { text: 'Contrôle à deux agents (un collègue confirme avec son propre compte)' })),
      h('label', { class: 'en-ligne' }, 'Alerte avant une date de péremption :', alerte, 'jours'),
      h('h3', { text: 'Points à vérifier (40 au plus)' }), zonePts,
      h('small', { class: 'muted', text: 'Valeur relevée : écart si elle sort des seuils. Date de péremption : écart si elle est dépassée, rappel quand elle approche. Texte court : numéro de scellé, de lot…' })),
      [{ texte: 'Annuler' }, { texte: 'Valider', classe: 'primaire', action: function () {
        var n = K.definition({ id: d.id, modele: d.modele, actif: d.actif, libelle: lib.value.trim(), lieu: lieu.value.trim(), rythme: rythme.value, jourSemaine: +jourS.value, jourMois: +jourM.value,
          apresUtilisation: apres.checked, delaiUtilisation: +delai.value, deuxAgents: deux.checked, alerteJours: +alerte.value,
          points: pts.filter(function (p) { return String(p.libelle || '').trim(); }) });
        if (!lib.value.trim()) throw new Error('Donnez un nom au contrôle.');
        if (!pts.some(function (p) { return String(p.libelle || '').trim(); })) throw new Error('Ajoutez au moins un point à vérifier.');
        if (n.points.some(function (p) { return p.type === 'valeur' && p.min !== null && p.max !== null && p.min > p.max; })) throw new Error('Un seuil mini est supérieur au seuil maxi.');
        fini(n);
        U.toast('Pensez à enregistrer les réglages.');
      } }], { large: true });
  }

  // ------------------------------------------------------------ Informations (Aujourd'hui) et pastille
  function informations() {
    var res = [], maintenant = Date.now();
    try {
      if (!peut('CONTROLE') && !encadre()) return res;
      services().forEach(function (sv) {
        var ech = echeancesDe(sv, maintenant);
        if (peut('CONTROLE')) {
          var af = K.aFaire(ech).filter(function (x) { return x.debut <= maintenant && (x.etat === 'aFaire' || x.controle.par !== moi().id); });
          var ap = echeancesPerDe(sv, maintenant).filter(function (x) { return x.fin > maintenant && (x.etat === 'aFaire' || (x.etat === 'aConfirmer' && x.controle.par !== moi().id)); });
          if (ap.length) res.push({ id: 'ct-pp-' + sv + '-' + ap.map(function (x) { return x.cle; }).join(','), niveau: 'warn', titre: 'Contrôles périodiques à faire (' + U.libService(sv) + ') : ' + ap.length, detail: ap.map(function (x) { return x.lieu + (x.utilisation ? ' (après utilisation, avant ' + hm(x.fin) + ')' : x.etat === 'aConfirmer' ? ' (à confirmer)' : ''); }).join(', '), ouvrir: function () { U.App.ongletsFenetres.controles = 'periodiques'; U.ouvrirFenetre('controles'); } });
          if (af.length) res.push({ id: 'ct-p-' + sv + '-' + af[0].date + af[0].poste, niveau: 'warn', titre: 'Contrôles du poste à faire (' + U.libService(sv) + ') : ' + af.length, detail: af.map(function (x) { return x.lieu + ' (' + LIB_ETAT[x.etat].toLowerCase() + ')'; }).join(', '), ouvrir: function () { U.App.ongletsFenetres.controles = 'poste'; U.ouvrirFenetre('controles'); } });
        }
        if (encadre()) {
          var r = K.retards(ech);
          if (r.length) res.push({ id: 'ct-r-' + sv + '-' + r.map(function (x) { return x.cle; }).join(','), niveau: 'bad', titre: 'Contrôles des CSI non faits (' + U.libService(sv) + ') : ' + r.length, detail: r.slice(0, 6).map(function (x) { return x.lieu + ', ' + x.libellePoste + ' du ' + dateFr(x.date); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'poste'; U.ouvrirFenetre('controles'); } });
          var depuis = jourISO(maintenant - 2 * 86400000), ec = K.registre(st(), { services: [sv], du: depuis }).filter(function (c) { return !c.annule && K.nonConforme(c); });
          var ecCsi = ec.filter(function (c) { return c.modele !== 'periodique'; });
          if (ec.length > ecCsi.length) res.push({ id: 'ct-ep-' + ec.filter(function (c) { return c.modele === 'periodique'; }).map(function (c) { return c.id; }).join(','), niveau: 'warn', titre: 'Écart à un contrôle périodique (' + U.libService(sv) + ')', detail: ec.filter(function (c) { return c.modele === 'periodique'; }).map(function (c) { return c.lieu + ' : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle + (i.type === 'valeur' && i.valeur !== null ? ' (' + String(i.valeur).replace('.', ',') + (i.unite ? ' ' + i.unite : '') + ')' : ''); }).join(', '); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'registre'; U.ouvrirFenetre('controles'); } });
          var rp = echeancesPerDe(sv, maintenant).filter(function (x) { return x.etat === 'retard'; });
          if (rp.length) res.push({ id: 'ct-rp-' + sv + '-' + rp.map(function (x) { return x.cle; }).join(','), niveau: 'bad', titre: 'Contrôles périodiques non faits (' + U.libService(sv) + ') : ' + rp.length, detail: rp.slice(0, 6).map(function (x) { return x.lieu + ', ' + (x.utilisation ? 'après utilisation' : x.libellePoste) + ' du ' + dateFr(x.date); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'periodiques'; U.ouvrirFenetre('controles'); } });
          var pe = K.peremptions(st(), cfg(), sv, maintenant);
          if (pe.length) res.push({ id: 'ct-pe-' + sv + '-' + pe.map(function (p) { return p.def.id + p.peremption + p.etat; }).join(','), niveau: pe.some(function (p) { return p.etat === 'depassee'; }) ? 'bad' : 'warn', titre: 'Péremptions à surveiller (' + U.libService(sv) + ') : ' + pe.length, detail: pe.slice(0, 6).map(function (p) { return p.def.libelle + ' — ' + p.point + ' : ' + dateLongue(p.peremption); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'periodiques'; U.ouvrirFenetre('controles'); } });
          ec = ecCsi;
          if (ec.length) res.push({ id: 'ct-e-' + ec.map(function (c) { return c.id; }).join(','), niveau: 'warn', titre: 'Écart au contrôle d’une CSI (' + U.libService(sv) + ')', detail: ec.map(function (c) { return c.lieu + ' : ' + c.items.filter(function (i) { return !i.ok; }).map(function (i) { return i.libelle; }).join(', '); }).join(' ; '), ouvrir: function () { U.App.ongletsFenetres.controles = 'registre'; U.ouvrirFenetre('controles'); } });
        }
      });
    } catch (e) { /* module illisible : rien à afficher */ }
    return res;
  }

  var LIB = { CONTROLE: 'Contrôle', CONTROLE_CONFIRME: 'Contrôle confirmé', CONTROLE_ANNULE: 'Contrôle annulé', CONTROLE_UTILISATION: 'Utilisation signalée' };
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'CONTROLE_UTILISATION') return (d.libelle || d.def) + ' utilisé' + (d.commentaire ? ' — ' + d.commentaire : '') + ' : contrôle demandé';
    if (e.type === 'CONTROLE' && d.modele === 'periodique') return d.lieu + ', ' + (d.utilisation ? 'après utilisation' : (d.libellePoste || d.poste)) + ' du ' + dateFr(d.date) + (Array.isArray(d.items) && d.items.some(function (i) { return !i.ok; }) ? ' — écart' : '');
    if (e.type === 'CONTROLE') return (K.MODELES[d.modele] ? K.MODELES[d.modele].libelle : 'Contrôle') + ' — ' + d.lieu + ', ' + (d.libellePoste || d.poste) + ' du ' + dateFr(d.date) + (Array.isArray(d.items) && d.items.some(function (i) { return !i.ok; }) ? ' — écart' : '');
    var c = st().controles[d.controle];
    return (c ? c.lieu + ', ' + (c.libellePoste || c.poste) + ' du ' + dateFr(c.date) : d.controle) + (d.motif ? ' — ' + d.motif : '');
  }
  SIC.modules.completerInterface('controles', {
    vues: { poste: vuePoste, periodiques: vuePeriodiques, registre: vueRegistre },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le contrôle redevient à faire.'; } },
    admin: { onglets: function () { return [['controles', 'Contrôles', [panneauReglages(), panneauPeriodiques()].filter(Boolean)]]; }, cadre: function () { return [panneauReglages(), panneauPeriodiques()].filter(Boolean); } },
    informations: informations,
    pastille: function () { try { return informations().length; } catch (e) { return 0; } }
  });
  U.controles = { informations: informations, pourAgenda: function (o) { return K.pourAgenda(st(), cfg(), o); } };
})();
