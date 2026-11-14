// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Salles et bureaux — interface (0.25.0, maquette validée le 11 novembre 2026). Logique : module-salles.js.
 * Onglets : Journée (grille des salles d'un service), Par salle (semaine), Mes réservations, À arbitrer (gestionnaire),
 * Salles du service. Aides partagées avec l'Agenda et le Suivi médical (U.salles) : choix d'une salle avec sa
 * disponibilité, vérification avant l'enregistrement, demandes en conflit.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, S = SIC.salles, C = SIC.crypto;
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var vue = { jour: S.jourISO(Date.now()), salle: null, lundi: null, de: '14:00', a: '15:00', libres: null };

  function s() { return U.App.session; }
  function st() { return (s() && s().etatModule('salles')) || S.reduire([]); }
  function moi() { return s().compteEffectif(); }
  function compte() { return Object.assign({}, moi(), { services: s().roles().indexOf('ADMIN') >= 0 && !(moi().services || []).length ? U.tousServices().map(function (x) { return x.code; }) : moi().services || [] }); }
  function peut(t) { return s().peut(t) && !s().apercu; }
  function service() { return U.App.service !== '*' ? U.App.service : (U.services()[0] || {}).code; }
  function opts(sv) { return S.options(U.config(), sv || service()); }
  function jourFr(j) { var d = new Date(S.depuisISO(j)); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function jourLong(j) { return new Date(S.depuisISO(j)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function lundiDe(j) { var d = new Date(S.depuisISO(j)); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return S.jourISO(d.getTime()); }
  function nomSalle(id) { var x = st().salles[id]; return x ? x.nom : 'Salle'; }
  function minutes(hm) { var p = String(hm).split(':'); return +p[0] * 60 + +p[1]; }

  // ------------------------------------------------------------ Occupations venues des autres plannings
  /** Occupations d'un autre module sur [debut, fin[, lues à la volée (l'agent a la clé du module), ou null. */
  function sourcesDe(m, debut, fin) {
    var o = opts(), res = [];
    try {
      if (!s().ouvert(m)) return null;
      var e = s().etatModule(m);
      if (!e) return null;
      if (m === 'agenda') return SIC.modules.lire('agenda.occupations', e, { debut: debut, fin: fin }) || [];
      if (m === 'suivi') return SIC.modules.lire('suivi.occupations', e, { config: U.config(), debut: debut, fin: fin, horaires: { matin: o.matin, apresmidi: o.apresmidi } }) || [];
      // Salles fermées pendant des travaux (Demandes de travaux, case cochée) : journées entières, jusqu'à la fin des travaux ou au jour indiqué
      (SIC.modules.lire('travaux.salles', e, { config: U.config() }) || []).forEach(function (x) {
        for (var j = S.jourISO(Math.max(debut, Date.parse(x.depuis) || debut)), n = 0; S.instant(j, '00:00') < fin && n < 400 && (!x.jusquau || j <= x.jusquau); j = S.plusJours(j, 1), n++) {
          res.push({ ref: 'travaux|' + x.demande + '|' + j, salle: x.salle, debut: S.instant(j, '00:00'), fin: S.instant(S.plusJours(j, 1), '00:00'), titre: 'Travaux : ' + x.titre, genre: 'ferme', service: x.service, par: '' });
        }
      });
      return res;
    } catch (err) { return null; }   // module absent
  }
  /**
   * Occupations sur [debut, fin[ : salles, et autres plannings lus à la volée quand l'agent en a la clé ; sinon, le
   * dernier relevé « occupé » (salle et horaires seulement, nom de l'auteur si le réglage le prévoit).
   */
  function occupations(debut, fin) {
    var sources = [], nom = opts().nomOccupe;
    S.REFLETS.forEach(function (m) {
      var x = sourcesDe(m, debut, fin);
      if (x) { sources = sources.concat(x); return; }
      sources = sources.concat(S.reflet(st(), m, debut, fin).map(function (y) { return Object.assign(y, { nom: nom && y.par ? s().nomAuteur(y.par) : '' }); }));
    });
    return S.occupations(st(), sources, debut, fin);
  }
  /**
   * Relevé des plannings dont l'agent a la clé (aujourd'hui − 1 jour à + 8 semaines), enregistré seulement s'il a changé :
   * les agents sans la clé y voient la salle « occupée ». Après une saisie dans l'Agenda, le Suivi médical, les Demandes
   * de travaux (`force`), ou à l'ouverture des plannings (une fois par minute au plus).
   */
  var dernierReleve = {}, releveEnCours = false;
  async function synchroniser(force) {
    if (releveEnCours) return;
    try {
      if (!SIC.salles || s().apercu || !s().ouvert('salles') || !s().peut('SALLE_REFLET')) return;
      releveEnCours = true;
      var auj = S.jourISO(Date.now()), du = S.plusJours(auj, -1), au = S.plusJours(auj, 56), debut = S.instant(du, '00:00'), fin = S.instant(au, '00:00');
      for (var i = 0; i < S.REFLETS.length; i++) {
        var m = S.REFLETS[i];
        if (!force && Date.now() - (dernierReleve[m] || 0) < 6e4) continue;
        var x = sourcesDe(m, debut, fin);
        if (!x) continue;
        dernierReleve[m] = Date.now();
        if (S.refletChange(st(), m, x, debut)) await s().enregistrer('SALLE_REFLET', { module: m, du: du, au: au, occupations: S.contenuReflet(x) });
      }
    } catch (e) { console.warn('Relevé des salles :', e.message); }
    finally { releveEnCours = false; }
  }
  function journee(j) { return [S.instant(j, '00:00'), S.instant(S.plusJours(j, 1), '00:00')]; }

  // ------------------------------------------------------------ Aides partagées (Agenda, Suivi médical)
  /**
   * Liste « Salle » d'un formulaire d'un autre module : salles du service, disponibilité affichée sous la liste.
   * `o` : { service: () => code, valeur, periode: () => [debut, fin] | null, exclure, lecture }.
   */
  function selecteur(o) {
    var sel = h('select', { 'aria-label': 'Salle réservée', disabled: !!o.lecture }), etat = h('small', { class: 'muted sb-etat' });
    function remplir() {
      var v = sel.value || o.valeur || '';
      U.vider(sel);
      sel.appendChild(h('option', { value: '', text: '— Aucune salle —' }));
      S.sallesDuService(st(), o.service()).forEach(function (x) { sel.appendChild(h('option', { value: x.id, text: x.nom + (x.capacite ? ' (' + x.capacite + ' places)' : '') + (x.validation ? ' — à valider' : ''), selected: x.id === v })); });
      if (v && !st().salles[v]) sel.appendChild(h('option', { value: v, text: 'Salle retirée', selected: true }));
      maj();
    }
    function maj() {
      etat.textContent = '';
      etat.className = 'muted sb-etat';
      var p = o.periode && o.periode();
      if (!sel.value || !p) return;
      var occ = occupations(p[0], p[1]), d = S.disponibilite(st(), occ, sel.value, o.service(), p[0], p[1], o.exclure, U.libService);
      if (d.ok) { etat.textContent = d.validation ? 'Salle libre, soumise à la validation du cadre.' : 'Salle libre.'; etat.className = 'sb-etat ok'; }
      else { etat.textContent = 'Salle ' + d.raison + '.'; etat.className = 'sb-etat bad'; }
    }
    sel.addEventListener('change', maj);
    remplir();
    return { noeud: h('div', { class: 'pile' }, sel, etat), valeur: function () { return sel.value; }, maj: maj, remplir: remplir };
  }
  /**
   * Avant d'enregistrer une occupation (événement, présence, entretien) : dates en conflit, salle à valider. Demande à
   * l'agent d'arbitrer ou d'abandonner. `o` : { salle, service, titre, genre, periodes: [{ ref, debut, fin }], exclure }.
   * Retourne les demandes à enregistrer après la saisie (`envoyer`), ou lève une erreur si l'agent renonce.
   */
  function verifier(o) {
    if (!o.salle || !o.periodes.length) return [];
    var x = st().salles[o.salle], gestion = S.gere(x, compte()), demandes = [], conflitsTxt = [];
    var debut = Math.min.apply(null, o.periodes.map(function (p) { return p.debut; })), fin = Math.max.apply(null, o.periodes.map(function (p) { return p.fin; }));
    var occ = occupations(debut, fin);
    o.periodes.forEach(function (p) {
      var d = S.disponibilite(st(), occ, o.salle, o.service, p.debut, p.fin, o.exclure, U.libService);
      if (d.acces === false || d.fermee) throw new Error(nomSalle(o.salle) + ' : ' + d.raison + ' (' + jourFr(S.jourISO(p.debut)) + ').');
      if (!d.ok) { conflitsTxt.push(jourFr(S.jourISO(p.debut)) + ' : ' + d.raison); demandes.push({ ref: p.ref, debut: p.debut, fin: p.fin, conflits: d.conflits.map(function (c) { return { ref: c.ref, par: c.par || '', titre: c.titre }; }) }); }
      else if (d.validation && !gestion) demandes.push({ ref: p.ref, debut: p.debut, fin: p.fin, conflits: [], validation: true });
    });
    if (!demandes.length) return [];
    var motif = '';
    if (conflitsTxt.length) {
      var lib = S.libres(st(), occ, o.service, o.periodes[0].debut, o.periodes[0].fin, null, o.exclure).map(function (y) { return y.nom; });
      motif = prompt(nomSalle(o.salle) + ' est déjà occupée :\n' + conflitsTxt.slice(0, 6).join('\n') + (conflitsTxt.length > 6 ? '\n…' : '') +
        (lib.length ? '\n\nSalles libres : ' + lib.join(', ') + '.' : '') + '\n\nPour demander la salle malgré le conflit (le gestionnaire de la salle arbitrera), indiquez le motif. Sinon, annulez et choisissez une autre salle.');
      if (motif === null || !motif.trim()) throw new Error('Choisissez une autre salle, ou indiquez le motif de la demande.');
    }
    return demandes.map(function (d) { return Object.assign(d, { id: 'SD' + C.hex(C.aleatoire(5)), salle: o.salle, titre: o.titre, genre: o.genre, service: o.service, motif: d.validation ? '' : motif.trim(), nom: moi().nom }); });
  }
  async function envoyer(demandes) {
    setTimeout(function () { synchroniser(true); }, 0);
    for (var i = 0; i < (demandes || []).length; i++) await s().enregistrer('SALLE_DEMANDE', demandes[i]);
    if ((demandes || []).length) U.toast(demandes.some(function (d) { return !d.validation; }) ? 'Demande en conflit envoyée au gestionnaire de la salle.' : 'Réservation soumise à la validation du cadre.');
  }
  /** Libellé de la salle d'une occupation d'un autre module, après arbitrage (« » si aucune). */
  function libelle(ref, salle) {
    var a = S.salleDe(st(), ref), dm = S.demandeDe(st(), ref);
    if (a === null) return 'Salle retirée (arbitrage)';
    if (a) return nomSalle(a) + (a !== salle ? ' (attribuée par arbitrage)' : '');
    if (dm && dm.statut === 'ouverte') return nomSalle(dm.salle) + (dm.validation ? ' (à valider)' : ' (demande en conflit)');
    if (dm && dm.statut === 'refusee') return 'Sans salle : demande refusée';
    return salle ? nomSalle(salle) : '';
  }

  // ------------------------------------------------------------ Grilles
  var CLASSE = { agenda: 'sb-agenda', medical: 'sb-medical', psy: 'sb-psy', entretien: 'sb-psy', simple: 'sb-simple', ferme: 'sb-ferme', occupe: 'sb-occupe' };
  function bloc(o, base, pxH, plage, extra) {
    var d0 = Math.max(o.debut, base + minutes(plage[0]) * 6e4), d1 = Math.min(o.fin, base + minutes(plage[1]) * 6e4);
    if (d1 <= d0) return null;
    var el = h('button', { type: 'button', class: 'sb-bloc ' + (extra || CLASSE[o.genre] || 'sb-simple'), title: o.titre, onclick: function () { detail(o, extra); } },
      h('b', { text: S.hm(o.debut) + '–' + S.hm(o.fin) + ' ' + o.titre }),
      h('span', { text: (extra === 'sb-conflit' ? 'Demande en conflit' : extra === 'sb-attente' ? 'À valider' : S.GENRES[o.genre] || '') + (o.deplacee ? ' · déplacé depuis ' + nomSalle(o.deplacee) : '') + (o.nom ? ' · ' + o.nom : '') }));
    el.style.top = ((d0 - base) / 36e5 - minutes(plage[0]) / 60) * pxH + 'px';
    el.style.height = Math.max(18, (d1 - d0) / 36e5 * pxH - 2) + 'px';
    return el;
  }
  function colonneHeures(plage, pxH) {
    var c = h('div', { class: 'sb-heures' }), h0 = Math.floor(minutes(plage[0]) / 60), h1 = Math.ceil(minutes(plage[1]) / 60);
    c.style.height = (h1 - h0) * pxH + 'px';
    for (var k = h0; k < h1; k++) { var t = h('span', { text: k + ' h' }); t.style.top = (k - h0) * pxH + 'px'; c.appendChild(t); }
    return c;
  }
  function colonne(items, base, plage, pxH) {
    var c = h('div', { class: 'sb-col' }), h0 = Math.floor(minutes(plage[0]) / 60), h1 = Math.ceil(minutes(plage[1]) / 60);
    c.style.height = (h1 - h0) * pxH + 'px';
    c.style.backgroundSize = '100% ' + pxH + 'px';
    var p = [String(h0).padStart(2, '0') + ':00', String(h1).padStart(2, '0') + ':00'];
    // Occupations qui se chevauchent (conflit en attente, double réservation) : côte à côte
    var tries = items.slice().sort(function (x, y) { return x.o.debut - y.o.debut; }), voies = [], groupe = [], finGroupe = -Infinity;
    function fermer() { var n = Math.max.apply(null, groupe.map(function (g) { return g.voie; }).concat([0])) + 1; groupe.forEach(function (g) { g.n = n; }); groupe = []; voies = []; }
    tries.forEach(function (x) {
      if (x.o.debut >= finGroupe) { fermer(); finGroupe = -Infinity; }
      var v = 0; while (voies[v] !== undefined && voies[v] > x.o.debut) v++;
      voies[v] = x.o.fin; x.voie = v; groupe.push(x); finGroupe = Math.max(finGroupe, x.o.fin);
    });
    fermer();
    tries.forEach(function (x) {
      var b = bloc(x.o, base, pxH, p, x.classe);
      if (!b) return;
      if (x.n > 1) { b.style.left = 'calc(' + (100 * x.voie / x.n) + '% + 2px)'; b.style.right = 'auto'; b.style.width = 'calc(' + (100 / x.n) + '% - 4px)'; }
      c.appendChild(b);
    });
    return c;
  }
  function itemsDe(occ, salle) {
    return occ.occupations.filter(function (o) { return o.salle === salle; }).map(function (o) { return { o: o }; })
      .concat(occ.enAttente.filter(function (o) { return o.salle === salle; }).map(function (o) { var d = st().demandes[o.demande]; return { o: o, classe: d && d.validation ? 'sb-attente' : 'sb-conflit' }; }));
  }
  function detail(o, extra) {
    var dm = o.demande ? st().demandes[o.demande] : null, r = o.ref.indexOf('salles|') === 0 ? st().reservations[o.ref.split('|')[1]] : null, c = moi();
    var actions = [{ texte: 'Fermer' }];
    if (dm && dm.par === c.id && !s().apercu) actions.push({ texte: 'Retirer ma demande', classe: 'danger', action: async function () { await s().enregistrer('SALLE_DECISION', { demande: dm.id, retirer: true }); U.toast('Demande retirée.'); } });
    if (dm && S.gere(st().salles[dm.salle], compte()) && peut('SALLE_DECISION')) actions.push({ texte: 'Arbitrer…', classe: 'primaire', action: function () { setTimeout(function () { modaleArbitrage(dm); }, 0); } });
    if (r && (r.par === c.id || S.gere(st().salles[r.salle], compte())) && !s().apercu) {
      var j = o.ref.split('|')[2], serie = S.repetition(r.repetition).type !== 'aucune';
      if (serie) actions.push({ texte: 'Retirer ce jour seulement', action: async function () { await s().enregistrer('SALLE_RESERVATION', { id: r.id, salle: r.salle, sauf: (r.sauf || []).concat([j]) }); U.toast('Date retirée de la série.'); } });
      actions.push({ texte: serie ? 'Annuler toute la série' : 'Annuler la réservation', classe: 'danger', action: async function () { var m = prompt('Motif de l’annulation (facultatif) :', ''); if (m === null) return false; await s().enregistrer('SALLE_RESERVATION', { id: r.id, salle: r.salle, annulee: true, motifAnnulation: m.trim() }); U.toast('Réservation annulée.'); } });
    }
    U.modale(o.titre, h('div', { class: 'pile' },
      h('p', {}, h('b', { text: nomSalle(o.salle) }), ' — ' + jourLong(S.jourISO(o.debut)) + ', ' + S.hm(o.debut) + ' – ' + S.hm(o.fin)),
      h('p', { class: 'muted', text: (extra === 'sb-conflit' ? 'Demande en conflit, en attente d’arbitrage' : extra === 'sb-attente' ? 'Réservation à valider par le cadre' : S.GENRES[o.genre] || '') + (o.service ? ' · ' + U.libService(o.service) : '') }),
      // Contact d'un clic (lot A) : auteur de la réservation ou de la demande, quand le réglage montre son nom
      (r || dm) && o.nom && o.genre !== 'occupe' ? h('p', {}, (dm ? 'Demandée par ' : 'Réservée par '), U.equipe && U.equipe.lien ? U.equipe.lien((r || dm).par, o.nom) : o.nom) : null,
      dm && dm.motif ? h('p', { text: 'Motif : ' + dm.motif }) : null,
      o.deplacee ? h('p', { class: 'info', text: 'Déplacé par arbitrage depuis ' + nomSalle(o.deplacee) + '.' }) : null,
      o.genre === 'occupe' ? h('small', { class: 'muted', text: 'Occupation venue d’un planning auquel vous n’avez pas accès' + (o.nom ? ' : réservée par ' + o.nom : '') + '. Pour l’obtenir, faites une demande : le gestionnaire de la salle arbitrera.' }) : null,
      o.genre === 'agenda' || o.genre === 'medical' || o.genre === 'psy' || o.genre === 'entretien' ? h('small', { class: 'muted', text: 'Le détail et les modifications se font dans son module (' + (o.genre === 'agenda' ? 'Agenda du service' : 'Suivi médical') + ').' }) : null), actions);
  }
  function barreJour(titre, moins, plus) {
    return h('div', { class: 'actions gauche sb-barre' }, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Précédent', onclick: moins }, '◀'), h('b', { text: titre }),
      h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Suivant', onclick: plus }, '▶'));
  }
  function legende() {
    return h('div', { class: 'sb-legende' }, [['sb-agenda', 'Événement de l’agenda'], ['sb-medical', 'Présence médicale'], ['sb-psy', 'Psychologue'], ['sb-simple', 'Réservation simple'], ['sb-occupe', 'Occupé (autre planning)'], ['sb-attente', 'À valider'], ['sb-conflit', 'Demande en conflit'], ['sb-ferme', 'Indisponible']]
      .map(function (x) { return h('span', {}, h('i', { class: x[0] }), x[1]); }));
  }
  function bandeauAvis() {
    var av = S.avisPour(st(), moi().id, avisVus());
    if (!av.length) return null;
    var LIB = { acceptee: 'a accepté votre demande', refusee: 'a refusé votre demande', retiree: 'a attribué à une autre réservation la salle de', deplacee: 'a déplacé, dans une autre salle,' };
    return h('section', { class: 'panneau ag-avis', role: 'status' }, h('h2', { text: av.length > 1 ? av.length + ' informations sur vos salles' : 'Une information sur vos salles' }),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        return h('li', {}, h('span', { text: s().nomAuteur(a.par) + ' ' + LIB[a.genre] + ' « ' + a.titre + ' »' + (a.proposition ? ' → ' + nomSalle(a.proposition) : '') + (a.message ? ' : ' + a.message : '') + ' ' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus([a.id]); } }, 'Vu'));
      })));
  }
  function avisVus() { var p = s().preferences || {}; return Array.isArray(p.avisSallesVus) ? p.avisSallesVus : []; }
  async function marquerVus(ids) { try { await s().enregistrerPreference('avisSallesVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }

  // ------------------------------------------------------------ Onglet Journée
  function vueJournee() {
    setTimeout(function () { synchroniser(false); }, 0);
    var sv = service(), salles = S.sallesDuService(st(), sv), o = opts(sv), j = vue.jour, b = journee(j), occ = occupations(b[0], b[1]), pxH = 44;
    var deI = h('input', { type: 'time', step: 900, value: vue.de, 'aria-label': 'Libre de' }), aI = h('input', { type: 'time', step: 900, value: vue.a, 'aria-label': 'Libre jusqu’à' });
    var grille = h('div', { class: 'sb-grille' });
    grille.style.gridTemplateColumns = '56px repeat(' + Math.max(1, salles.length) + ', minmax(150px, 1fr))';
    grille.appendChild(h('div'));
    salles.forEach(function (x) { grille.appendChild(h('div', { class: 'sb-tete' }, h('b', { text: x.nom }), h('small', { class: 'muted', text: [x.capacite ? x.capacite + ' places' : '', x.accessible ? 'accessible' : '', S.commune(x) ? 'commune' : x.service !== sv ? 'prêtée' : '', x.validation ? 'à valider' : ''].filter(Boolean).join(' · ') }))); });
    grille.appendChild(colonneHeures([o.debut, o.fin], pxH));
    salles.forEach(function (x) { grille.appendChild(colonne(itemsDe(occ, x.id), b[0], [o.debut, o.fin], pxH)); });
    return h('div', { class: 'pile' }, bandeauAvis(),
      h('div', { class: 'barre' }, barreJour(jourLong(j), function () { vue.jour = S.plusJours(j, -1); vue.libres = null; U.rendreContenu(); }, function () { vue.jour = S.plusJours(j, 1); vue.libres = null; U.rendreContenu(); }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.jour = S.jourISO(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('div', { class: 'espace' }),
        h('label', { class: 'en-ligne' }, 'Salles libres de', deI, 'à', aI),
        h('button', { class: 'btn petit', type: 'button', onclick: function () {
          vue.de = deI.value; vue.a = aI.value;
          vue.libres = S.libres(st(), occ, sv, S.instant(j, vue.de), S.instant(j, vue.a)).map(function (x) { return x.nom; });
          U.rendreContenu();
        } }, 'Chercher'),
        peut('SALLE_RESERVATION') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleReserver({ jour: j }); } }, '+ Réserver') : null),
      vue.libres ? h('p', { class: 'info', text: vue.libres.length ? 'Salles libres de ' + vue.de + ' à ' + vue.a + ' : ' + vue.libres.join(', ') + '.' : 'Aucune salle libre de ' + vue.de + ' à ' + vue.a + '.' }) : null,
      legende(),
      salles.length ? h('div', { class: 'sb-defile' }, grille) : h('p', { class: 'muted', text: 'Aucune salle pour ce service : le cadre les ajoute dans l’onglet « Salles du service ».' }),
      h('small', { class: 'muted', text: 'Présences médicales et des psychologues, événements de l’agenda et réservations simples occupent la salle choisie. Plage affichée ' + o.debut + ' – ' + o.fin + ' (réglée par le cadre).' }));
  }

  // ------------------------------------------------------------ Onglet Par salle (semaine)
  function vueSalle() {
    setTimeout(function () { synchroniser(false); }, 0);
    var sv = service(), salles = S.sallesDuService(st(), sv);
    if (!salles.length) return h('p', { class: 'muted', text: 'Aucune salle pour ce service.' });
    if (!vue.salle || !salles.some(function (x) { return x.id === vue.salle; })) vue.salle = salles[0].id;
    var lundi = vue.lundi || lundiDe(S.jourISO(Date.now())), o = opts(sv), pxH = 40, x = st().salles[vue.salle];
    var jours = []; for (var i = 0; i < 7; i++) jours.push(S.plusJours(lundi, i));
    var occ = occupations(S.instant(lundi, '00:00'), S.instant(S.plusJours(lundi, 7), '00:00'));
    var sel = h('select', { 'aria-label': 'Salle', onchange: function () { vue.salle = sel.value; U.rendreContenu(); } }, salles.map(function (y) { return h('option', { value: y.id, text: y.nom + (y.service && y.service !== sv ? ' (' + U.libService(y.service) + ')' : S.commune(y) ? ' (commune)' : ''), selected: y.id === vue.salle }); }));
    var grille = h('div', { class: 'sb-grille' });
    grille.style.gridTemplateColumns = '56px repeat(7, minmax(120px, 1fr))';
    grille.appendChild(h('div'));
    jours.forEach(function (j) { var p = S.pretDuJour(st(), x.id, j); grille.appendChild(h('div', { class: 'sb-tete' }, h('b', { text: jourFr(j) }), p ? h('small', { class: 'sb-pret', text: 'Prêtée à ' + (p.services || []).map(U.libService).join(', ') }) : null)); });
    grille.appendChild(colonneHeures([o.debut, o.fin], pxH));
    jours.forEach(function (j) { grille.appendChild(colonne(itemsDe(occ, x.id).filter(function (it) { return S.jourISO(it.o.debut) === j; }), S.instant(j, '00:00'), [o.debut, o.fin], pxH)); });
    var gestion = S.gere(x, compte()) && peut('SALLE_FERMETURE');
    return h('div', { class: 'pile' }, bandeauAvis(),
      h('div', { class: 'barre' }, sel, barreJour('Semaine du ' + jourFr(lundi), function () { vue.lundi = S.plusJours(lundi, -7); U.rendreContenu(); }, function () { vue.lundi = S.plusJours(lundi, 7); U.rendreContenu(); }),
        h('div', { class: 'espace' }),
        gestion ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleFermeture(x); } }, 'Fermeture…') : null,
        gestion ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modalePret(x); } }, 'Prêter à un service…') : null,
        peut('SALLE_RESERVATION') ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleReserver({ salle: x.id, jour: lundi }); } }, '+ Réserver') : null),
      legende(), h('div', { class: 'sb-defile' }, grille),
      h('small', { class: 'muted', text: [x.capacite ? x.capacite + ' places' : '', x.equipement || '', x.accessible ? 'accessible aux personnes à mobilité réduite' : '', x.validation ? 'réservation soumise à validation' : ''].filter(Boolean).join(' · ') }));
  }

  // ------------------------------------------------------------ Onglet Mes réservations
  function vueMes() {
    var c = moi(), m = st(), auj = S.jourISO(Date.now());
    var res = Object.keys(m.reservations).map(function (k) { return m.reservations[k]; }).filter(function (r) { return r.par === c.id && !r.annulee && (S.repetition(r.repetition).type !== 'aucune' || r.jour >= auj); });
    var dem = Object.keys(m.demandes).map(function (k) { return m.demandes[k]; }).filter(function (d) { return d.par === c.id && d.fin >= Date.now() - 864e5; }).sort(function (a, b) { return a.debut - b.debut; });
    var STATUT = { ouverte: ['warn', 'En attente'], acceptee: ['ok', 'Acceptée'], refusee: ['bad', 'Refusée'], retiree: ['', 'Retirée'] };
    return h('div', { class: 'pile' }, bandeauAvis(),
      h('section', { class: 'panneau' }, h('h2', { text: 'Mes réservations simples' }),
        res.length ? h('ul', { class: 'liste-simple' }, res.map(function (r) {
          var rp = S.repetition(r.repetition);
          return h('li', {}, h('b', { text: nomSalle(r.salle) }), ' — ' + r.titre + ' — ' + (rp.type === 'aucune' ? jourFr(r.jour) : 'chaque ' + rp.jours.map(function (d) { return JOURS[d]; }).join(', ') + ' depuis le ' + jourFr(r.jour)) + ', ' + r.de + '–' + r.a + ' ',
            h('button', { class: 'btn petit danger', type: 'button', onclick: async function () { if (!confirm('Annuler cette réservation ?')) return; try { await s().enregistrer('SALLE_RESERVATION', { id: r.id, salle: r.salle, annulee: true }); U.toast('Réservation annulée.'); } catch (e) { alert(e.message); } } }, 'Annuler'));
        })) : h('p', { class: 'muted', text: 'Aucune réservation simple. Les salles de vos événements de l’agenda se réservent depuis l’événement.' })),
      h('section', { class: 'panneau' }, h('h2', { text: 'Mes demandes' }),
        dem.length ? h('ul', { class: 'liste-simple' }, dem.map(function (d) {
          var t = STATUT[d.statut] || ['', d.statut];
          return h('li', {}, h('span', { class: 'badge ' + t[0], text: t[1] }), ' ', h('b', { text: nomSalle(d.salle) }), ' — ' + d.titre + ' — ' + jourFr(S.jourISO(d.debut)) + ' ' + S.hm(d.debut) + '–' + S.hm(d.fin) + (d.decision && d.decision.message ? ' — ' + d.decision.message : '') + ' ',
            d.statut === 'ouverte' && !s().apercu ? h('button', { class: 'btn petit', type: 'button', onclick: async function () { try { await s().enregistrer('SALLE_DECISION', { demande: d.id, retirer: true }); U.toast('Demande retirée.'); } catch (e) { alert(e.message); } } }, 'Retirer') : null);
        })) : h('p', { class: 'muted', text: 'Aucune demande en cours.' })));
  }

  // ------------------------------------------------------------ Onglet À arbitrer
  function vueArbitrer() {
    var l = S.aArbitrer(st(), compte());
    return h('section', { class: 'panneau' }, h('h2', { text: 'À arbitrer' }),
      h('p', { class: 'muted', text: 'Demandes sur les salles que vous gérez : conflits et réservations soumises à validation. Aucune priorité automatique : vous choisissez ; les auteurs sont informés.' }),
      l.length ? h('ul', { class: 'liste-simple' }, l.map(function (d) {
        return h('li', {}, h('span', { class: 'badge ' + (d.validation ? 'warn' : 'bad'), text: d.validation ? 'À valider' : 'Conflit' }), ' ', h('b', { text: nomSalle(d.salle) }),
          ' — ' + jourFr(S.jourISO(d.debut)) + ' ' + S.hm(d.debut) + '–' + S.hm(d.fin) + ' — ' + d.titre + ' (' + (d.nom || s().nomAuteur(d.par)) + ') ',
          h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { modaleArbitrage(d); } }, 'Arbitrer…'));
      })) : h('p', { class: 'muted', text: 'Rien à arbitrer.' }));
  }
  function modaleArbitrage(d) {
    var occ = occupations(d.debut, d.fin), choix = h('input', { type: 'radio', name: 'arb', checked: true }), garder = h('input', { type: 'radio', name: 'arb' });
    var lib = S.libres(st(), occ, d.service, d.debut, d.fin, null, d.conflits.map(function (c) { return c.ref; }).concat([d.ref])).filter(function (x) { return x.id !== d.salle; });
    var prop = h('select', { 'aria-label': 'Salle proposée' }, [h('option', { value: '', text: 'Aucune proposition' })].concat(lib.map(function (x) { return h('option', { value: x.id, text: x.nom + (x.capacite ? ' (' + x.capacite + ' places)' : '') + ' — libre' }); })));
    var msg = h('textarea', { rows: 3, maxlength: 500, 'aria-label': 'Message aux auteurs' });
    U.modale('Arbitrer : ' + nomSalle(d.salle) + ', ' + jourLong(S.jourISO(d.debut)) + ', ' + S.hm(d.debut) + ' – ' + S.hm(d.fin), h('div', { class: 'pile' },
      h('div', { class: 'grille-2' },
        d.conflits.length ? h('label', { class: 'sb-choix' }, h('span', {}, garder, h('b', { text: ' Garder l’occupation en place' })), d.conflits.map(function (c) { return h('small', { text: c.titre + (c.par ? ' — ' + s().nomAuteur(c.par) : '') }); }))
          : h('label', { class: 'sb-choix' }, h('span', {}, garder, h('b', { text: ' Refuser la réservation' }))),
        h('label', { class: 'sb-choix demande' }, h('span', {}, choix, h('b', { text: d.validation ? ' Valider la réservation' : ' Attribuer à la demande' })), h('small', { text: d.titre + ' — ' + (d.nom || s().nomAuteur(d.par)) + (d.motif ? ' — motif : « ' + d.motif + ' »' : '') }))),
      d.conflits.length ? h('label', {}, 'Proposer à l’autre une salle libre sur ce créneau (elle y est déplacée si vous attribuez la salle à la demande ; proposée seulement si vous refusez)', prop) : null,
      h('label', {}, 'Message aux auteurs (facultatif)', msg),
      h('p', { class: 'info', text: 'Les auteurs sont informés ; l’arbitrage est inscrit au journal.' })),
    [{ texte: 'Plus tard' }, { texte: 'Enregistrer la décision', classe: 'primaire', action: async function () {
      await s().enregistrer('SALLE_DECISION', { demande: d.id, accepte: choix.checked, proposition: d.conflits.length ? prop.value : '', message: msg.value.trim() });
      U.toast(choix.checked ? 'Salle attribuée.' : 'Demande refusée.');
    } }]);
  }

  // ------------------------------------------------------------ Réserver (réservation simple, ou événement de l'agenda)
  function champRepetition(rp) {
    var type = h('select', { 'aria-label': 'Répétition' }, [h('option', { value: 'aucune', text: 'Une seule fois' }), h('option', { value: 'semaine', text: 'Chaque semaine, certains jours' })]);
    type.value = rp ? rp.type : 'aucune';
    var cases = [1, 2, 3, 4, 5, 6, 0].map(function (j) { var cb = h('input', { type: 'checkbox', value: String(j), checked: !!rp && rp.jours.indexOf(j) >= 0 }); return { j: j, cb: cb, el: h('label', { class: 'case' }, cb, h('span', { text: JOURS[j] })) }; });
    var jusqua = h('input', { type: 'date', value: rp ? rp.jusqua : '', 'aria-label': 'Jusqu’au (facultatif)' });
    var zone = h('div', { class: 'actions gauche', hidden: type.value !== 'semaine' }, cases.map(function (c) { return c.el; }), h('label', { class: 'en-ligne' }, 'jusqu’au', jusqua));
    type.addEventListener('change', function () { zone.hidden = type.value !== 'semaine'; });
    return { noeud: h('div', { class: 'pile' }, h('label', {}, 'Répétition', type), zone),
      valeur: function () { return { type: type.value, jours: cases.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.j; }), jusqua: jusqua.value }; } };
  }
  function modaleReserver(init) {
    init = init || {};
    var sv = service(), salles = S.sallesDuService(st(), sv);
    if (!salles.length) { alert('Aucune salle pour ce service.'); return; }
    var agenda = h('input', { type: 'radio', name: 'sb-type', checked: !!(U.agenda && s().ouvert('agenda') && s().peut('RDV')), disabled: !(U.agenda && s().ouvert('agenda') && s().peut('RDV')) });
    var simple = h('input', { type: 'radio', name: 'sb-type', checked: !agenda.checked });
    var sel = h('select', { 'aria-label': 'Salle' }, salles.map(function (x) { return h('option', { value: x.id, text: x.nom + (x.capacite ? ' (' + x.capacite + ' places)' : ''), selected: x.id === init.salle }); }));
    var jour = h('input', { type: 'date', value: init.jour || S.jourISO(Date.now()), 'aria-label': 'Jour' }), de = h('input', { type: 'time', step: 900, value: init.de || '10:00', 'aria-label': 'De' }), a = h('input', { type: 'time', step: 900, value: init.a || '11:00', 'aria-label': 'À' });
    var titre = h('input', { type: 'text', maxlength: 120, placeholder: 'ex. Inventaire de la pharmacie', 'aria-label': 'Objet' }), rep = champRepetition(null), etat = h('p', { class: 'muted' });
    function maj() {
      if (!sel.value || !jour.value || !de.value || !a.value) return;
      var d0 = S.instant(jour.value, de.value), d1 = S.instant(jour.value, a.value), occ = occupations(d0, d1), dd = S.disponibilite(st(), occ, sel.value, sv, d0, d1, null, U.libService);
      etat.className = dd.ok ? 'info' : 'alerte';
      etat.textContent = dd.ok ? (dd.validation ? 'Salle libre, soumise à la validation du cadre.' : 'Salle libre.') : 'Salle ' + dd.raison + '. Salles libres : ' + (S.libres(st(), occ, sv, d0, d1).map(function (x) { return x.nom; }).join(', ') || 'aucune') + '.';
    }
    [sel, jour, de, a].forEach(function (x) { x.addEventListener('change', maj); });
    if (U.dernierChoix) U.dernierChoix('salles.salle.' + sv, sel, !init.salle);
    maj();
    U.modale('Réserver une salle', h('div', { class: 'pile' },
      h('div', { class: 'grille-2', role: 'radiogroup', 'aria-label': 'Type de réservation' },
        h('label', { class: 'sb-choix' }, h('span', {}, agenda, h('b', { text: ' Événement de l’agenda' })), h('small', { text: 'entretien, réunion, activité : professionnels et patients demandés comme dans l’agenda' })),
        h('label', { class: 'sb-choix' }, h('span', {}, simple, h('b', { text: ' Réservation simple' })), h('small', { text: 'salle bloquée, sans participants (rangement, inventaire…)' }))),
      h('div', { class: 'grille-2' }, h('label', {}, 'Salle', sel), h('label', {}, 'Jour', jour), h('label', {}, 'De', de), h('label', {}, 'À', a)),
      h('label', {}, 'Objet (réservation simple)', titre), U.plusOptions ? U.plusOptions(false, rep.noeud) : rep.noeud, etat),
    [{ texte: 'Annuler' }, { texte: 'Continuer', classe: 'primaire', action: async function () {
      var d0 = S.instant(jour.value, de.value), d1 = S.instant(jour.value, a.value);
      if (agenda.checked) {
        // Formulaire de l'agenda, salle remplie : les participants se demandent comme dans l'agenda
        setTimeout(function () { U.agenda.modaleAjout(S.depuisISO(jour.value), { service: sv, salle: sel.value, debut: d0, fin: d1 }); }, 0);
        return true;
      }
      var id = 'SR' + C.hex(C.aleatoire(5)), rp = rep.valeur();
      if (rp.type === 'semaine' && !rp.jours.length) rp.jours = [new Date(S.depuisISO(jour.value)).getDay()];
      var d = { id: id, salle: sel.value, jour: jour.value, de: de.value, a: a.value, titre: titre.value.trim(), service: sv, nom: moi().nom, repetition: rp };
      if (!d.titre) throw new Error('Indiquez l’objet de la réservation.');
      // Dates des 8 prochaines semaines d'une série : conflits vérifiés date par date
      var periodes = [], j = jour.value;
      for (var n = 0; n < 60 && periodes.length < 40; n++, j = S.plusJours(j, 1)) { if (S.couvre(d, j)) periodes.push({ ref: 'salles|' + id + '|' + j, debut: S.instant(j, d.de), fin: S.instant(j, d.a) }); if (rp.type === 'aucune') break; }
      var x = st().salles[d.salle], dem = verifier({ salle: d.salle, service: sv, titre: d.titre, genre: 'simple', periodes: periodes });
      if (x.validation && !S.gere(x, compte())) { await envoyer(dem); return true; }   // salle à valider : la demande tient lieu de réservation
      var conflitsSeuls = dem.filter(function (y) { return !y.validation; });
      if (conflitsSeuls.length && rp.type === 'aucune') { await envoyer(conflitsSeuls); return true; }
      await s().enregistrer('SALLE_RESERVATION', d);
      await envoyer(conflitsSeuls);
      U.toast('Salle réservée.');
    } }]);
  }
  function modaleFermeture(x) {
    var jour = h('input', { type: 'date', value: S.jourISO(Date.now()), 'aria-label': 'Du' }), jusquau = h('input', { type: 'date', 'aria-label': 'Au (facultatif)' });
    var de = h('input', { type: 'time', step: 900, 'aria-label': 'De (facultatif)' }), a = h('input', { type: 'time', step: 900, 'aria-label': 'À (facultatif)' }), motif = h('input', { type: 'text', maxlength: 120, placeholder: 'ex. Repas, travaux, ménage', 'aria-label': 'Motif' });
    var rep = champRepetition(null);
    U.modale('Fermer ' + x.nom, h('div', { class: 'pile' }, h('div', { class: 'grille-2' }, h('label', {}, 'Du', jour), h('label', {}, 'Au (facultatif, période continue)', jusquau), h('label', {}, 'De (facultatif)', de), h('label', {}, 'À (facultatif)', a)),
      rep.noeud, h('label', {}, 'Motif', motif), h('small', { class: 'muted', text: 'Sans heures : toute la journée. Répétée : par exemple chaque jour de 12 h à 13 h 30 pendant les repas.' })),
    [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var rp = rep.valeur(), d = { id: 'SF' + C.hex(C.aleatoire(5)), salle: x.id, jour: jour.value, jusquau: rp.type === 'aucune' ? jusquau.value : '', de: de.value, a: a.value, repetition: rp, motif: motif.value.trim() || 'Indisponible' };
      if (!!d.de !== !!d.a) throw new Error('Indiquez les deux heures, ou aucune.');
      await s().enregistrer('SALLE_FERMETURE', d); U.toast('Fermeture enregistrée.');
    } }]);
  }
  function modalePret(x) {
    var svs = U.tousServices().filter(function (v) { return v.code !== x.service; });
    var sel = h('select', { 'aria-label': 'Service emprunteur' }, svs.map(function (v) { return h('option', { value: v.code, text: v.libelle }); }));
    var jour = h('input', { type: 'date', value: S.jourISO(Date.now()), 'aria-label': 'Du' }), jusquau = h('input', { type: 'date', 'aria-label': 'Au' }), motif = h('input', { type: 'text', maxlength: 120, 'aria-label': 'Motif' }), rep = champRepetition(null);
    U.modale('Prêter ' + x.nom, h('div', { class: 'pile' }, h('label', {}, 'Service emprunteur', sel), h('div', { class: 'grille-2' }, h('label', {}, 'Du', jour), h('label', {}, 'Au (période continue)', jusquau)), rep.noeud, h('label', {}, 'Motif', motif),
      h('small', { class: 'muted', text: 'Pendant le prêt, seul le service emprunteur occupe la salle (toute la journée).' })),
    [{ texte: 'Annuler' }, { texte: 'Prêter', classe: 'primaire', action: async function () {
      var rp = rep.valeur();
      await s().enregistrer('SALLE_PRET', { id: 'SP' + C.hex(C.aleatoire(5)), salle: x.id, services: [sel.value], jour: jour.value, jusquau: rp.type === 'aucune' ? (jusquau.value || jour.value) : '', repetition: rp, motif: motif.value.trim() });
      U.toast('Prêt enregistré.');
    } }]);
  }

  // ------------------------------------------------------------ Onglet Salles du service
  function vueListe() {
    var sv = service(), c = compte(), toutes = S.sallesActives(st()).filter(function (x) { return x.service === sv || (S.commune(x) && (!(x.services || []).length || x.services.indexOf(sv) >= 0)); });
    var peutCreer = peut('SALLE') && (S.gere({ service: sv }, c) || s().roles().indexOf('ADMIN') >= 0);
    return h('section', { class: 'panneau' }, h('div', { class: 'barre' }, h('h2', { text: 'Salles et bureaux — ' + U.libService(sv) }), h('div', { class: 'espace' }),
      peutCreer ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleSalle(null, sv); } }, '+ Nouvelle salle') : null),
      toutes.length ? h('table', { class: 'sans-largeurs' }, h('thead', {}, h('tr', {}, ['Salle', 'Type', 'Places', 'Équipement', 'Accessible', 'Réservation', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, toutes.map(function (x) {
          return h('tr', { class: x.actif === false ? 'grise' : null }, h('td', {}, h('b', { text: x.nom }), S.commune(x) ? h('small', { class: 'muted', text: ' (commune)' }) : null), h('td', { text: S.libType(U.config(), x.type) }), h('td', { text: x.capacite || '' }),
            h('td', { text: x.equipement || '' }), h('td', { text: x.accessible ? 'Oui' : '' }), h('td', { text: x.actif === false ? 'Hors service' : x.validation ? 'À valider par le cadre' : 'Directe' }),
            h('td', {}, S.gere(x, c) && peut('SALLE') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleSalle(x, sv); } }, 'Modifier') : null));
        }))) : h('p', { class: 'muted', text: 'Aucune salle.' }));
  }
  function modaleSalle(x, sv) {
    var adm = s().roles().indexOf('ADMIN') >= 0, nouveau = !x;
    x = x || { service: sv };
    var nom = h('input', { type: 'text', maxlength: 80, value: x.nom || '', 'aria-label': 'Nom' });
    var type = h('select', { 'aria-label': 'Type' }, S.options(U.config()).types.map(function (t) { return h('option', { value: t.code, text: t.libelle, selected: t.code === x.type }); }));
    var cap = h('input', { type: 'number', min: 0, max: 500, value: x.capacite || '', 'aria-label': 'Places' }), eq = h('input', { type: 'text', maxlength: 120, value: x.equipement || '', 'aria-label': 'Équipement' });
    var acc = h('input', { type: 'checkbox', checked: !!x.accessible }), val = h('input', { type: 'checkbox', checked: !!x.validation }), actif = h('input', { type: 'checkbox', checked: x.actif !== false });
    var proprio = h('select', { 'aria-label': 'Propriétaire', disabled: !adm }, [h('option', { value: '', text: 'Commune (tout l’établissement)' })].concat(U.tousServices().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === x.service }); })));
    if (!x.service) proprio.value = '';
    U.modale(nouveau ? 'Nouvelle salle' : x.nom, h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nom), h('label', {}, 'Type', type), h('label', {}, 'Places', cap), h('label', {}, 'Service propriétaire', proprio)),
      h('label', {}, 'Équipement', eq), h('label', { class: 'case' }, acc, h('span', { text: 'Accessible aux personnes à mobilité réduite' })),
      h('label', { class: 'case' }, val, h('span', { text: 'Réservation soumise à la validation du cadre' })), h('label', { class: 'case' }, actif, h('span', { text: 'En service' })),
      !nouveau && U.documents ? U.documents.section('salles', 'salle', x.id, 'Salle ou bureau : ' + x.nom, x.service) : null),
    [{ texte: 'Annuler' }, nouveau ? null : { texte: 'Retirer la salle', classe: 'danger', action: async function () { if (!confirm('Retirer cette salle ? Ses réservations passées restent au journal.')) return false; await s().enregistrer('SALLE', { id: x.id, supprime: true }); } },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        await s().enregistrer('SALLE', { id: x.id || 'SA' + C.hex(C.aleatoire(5)), nom: nom.value.trim(), type: type.value, capacite: cap.value ? +cap.value : '', equipement: eq.value.trim(), accessible: acc.checked, validation: val.checked, actif: actif.checked, service: proprio.value, services: [] });
        U.toast('Salle enregistrée.');
      } }].filter(Boolean));
  }

  // ------------------------------------------------------------ Administration (plage affichée, horaires des présences)
  function panneauReglages() {
    var adm = s().roles().indexOf('ADMIN') >= 0, c = moi();
    var ns = (adm ? [{ code: '*', libelle: 'Établissement' }] : []).concat(U.tousServices().filter(function (v) { return adm || (c.services || []).indexOf(v.code) >= 0; }).map(function (v) { return { code: v.code, libelle: 'Service ' + v.libelle }; }));
    if (!ns.length) return h('p', { class: 'muted', text: 'Aucun service à régler.' });
    if (!vue.niveau || !ns.some(function (n) { return n.code === vue.niveau; })) vue.niveau = ns[0].code;
    var tout = JSON.parse(JSON.stringify(U.config().salles || {})), propre = tout[vue.niveau] || {}, eff = S.options(U.config(), vue.niveau === '*' ? null : vue.niveau);
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { vue.niveau = sel.value; U.rendreContenu(); } }, ns.map(function (n) { return h('option', { value: n.code, text: n.libelle, selected: n.code === vue.niveau }); }));
    function heure(cle, lib, v) { var i = h('input', { type: 'time', step: 900, value: propre[cle] || '', placeholder: v, 'aria-label': lib }); return { cle: cle, i: i, el: h('label', {}, lib + ' (' + v + ' par défaut)', i) }; }
    var champs = [heure('debut', 'Début de la plage affichée', eff.debut), heure('fin', 'Fin de la plage affichée', eff.fin), heure('matinDebut', 'Présences du matin : début', eff.matin[0]), heure('matinFin', 'Présences du matin : fin', eff.matin[1]),
      heure('apresmidiDebut', 'Présences de l’après-midi : début', eff.apresmidi[0]), heure('apresmidiFin', 'Présences de l’après-midi : fin', eff.apresmidi[1])];
    var nomOcc = h('select', { 'aria-label': 'Nom sur les occupations des autres plannings' }, [['', 'Réglage de l’établissement'], ['non', 'Non : « Occupé » seulement'], ['oui', 'Oui : nom de la personne qui a réservé']]
      .filter(function (x) { return x[0] || vue.niveau !== '*'; }).map(function (x) { return h('option', { value: x[0], text: x[1], selected: (propre.nomOccupe === true ? 'oui' : propre.nomOccupe === false ? 'non' : '') === x[0] }); }));
    if (vue.niveau === '*' && !nomOcc.value) nomOcc.value = 'non';
    return h('section', { class: 'panneau' }, h('h2', { text: 'Salles et bureaux' }),
      h('p', { class: 'muted', text: 'Plage affichée des plannings, horaires des demi-journées des présences médicales (salles occupées). Vide : réglage de l’établissement. Le cadre règle ses services.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', sel), h('div', { class: 'grille-2' }, champs.map(function (x) { return x.el; })),
      h('label', {}, 'Salle occupée par un planning que l’agent ne peut pas consulter : afficher le nom de la personne qui a réservé (désactivé par défaut)', nomOcc),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try { var v = {}; champs.forEach(function (x) { if (x.i.value) v[x.cle] = x.i.value; }); if (nomOcc.value === 'oui') v.nomOccupe = true; else if (nomOcc.value === 'non' && vue.niveau !== '*') v.nomOccupe = false; if (Object.keys(v).length) tout[vue.niveau] = v; else delete tout[vue.niveau]; await U.enregistrerConfig([['salles', tout]]); U.toast('Réglages enregistrés.'); } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { SALLE: 'Salles : salle', SALLE_PRET: 'Salles : prêt', SALLE_FERMETURE: 'Salles : fermeture', SALLE_RESERVATION: 'Salles : réservation', SALLE_DEMANDE: 'Salles : demande', SALLE_DECISION: 'Salles : arbitrage', SALLE_REFLET: 'Salles : relevé des autres plannings' };
  function resume(e) {
    var d = e.data || {}, m = st();
    switch (e.type) {
      case 'SALLE': return (d.supprime ? 'Salle retirée : ' : 'Salle : ') + (d.nom || nomSalle(d.id));
      case 'SALLE_PRET': return 'Prêt de ' + nomSalle(d.salle) + ' à ' + (d.services || []).map(U.libService).join(', ');
      case 'SALLE_FERMETURE': return 'Fermeture de ' + nomSalle(d.salle) + (d.motif ? ' : ' + d.motif : '');
      case 'SALLE_RESERVATION': return (d.annulee ? 'Réservation annulée : ' : 'Réservation de ') + nomSalle(d.salle || (m.reservations[d.id] || {}).salle) + (d.titre ? ' — ' + d.titre : '');
      case 'SALLE_DEMANDE': return (d.validation ? 'Réservation à valider : ' : 'Demande en conflit : ') + nomSalle(d.salle) + ' — ' + (d.titre || '') + (d.motif ? ' (motif : ' + d.motif + ')' : '');
      case 'SALLE_REFLET': return 'Relevé des salles occupées — ' + ({ agenda: 'Agenda du service', suivi: 'Suivi médical', travaux: 'Demandes de travaux' })[d.module] + ' : ' + (d.occupations || []).length + ' occupation' + ((d.occupations || []).length > 1 ? 's' : '');
      case 'SALLE_DECISION': var dm = m.demandes[d.demande]; return d.retirer ? 'Demande retirée' : (d.accepte ? 'Salle attribuée à la demande' : 'Demande refusée') + (dm ? ' : ' + nomSalle(dm.salle) + ' — ' + dm.titre : '') + (d.proposition ? ' ; autre salle : ' + nomSalle(d.proposition) : '');
    }
    return e.type;
  }

  SIC.modules.completerInterface('salles', {
    vues: { journee: vueJournee, salle: vueSalle, mes: vueMes, arbitrer: vueArbitrer, liste: vueListe },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La salle ou la réservation revient à son état précédent.'; } },
    admin: { onglets: function () { return [['salles', 'Salles et bureaux', [panneauReglages()]]]; }, cadre: function () { return [panneauReglages()]; } },
    pastille: function () { try { return S.aArbitrer(st(), compte()).length + S.avisPour(st(), moi().id, avisVus()).length; } catch (e) { return 0; } },
    // Onglet Informations de la messagerie : décisions sur ses demandes, demandes à arbitrer
    informations: function () {
      try {
        var res = S.avisPour(st(), moi().id, avisVus()).map(function (a) {
          return { id: 'sb-' + a.id, niveau: a.genre === 'acceptee' ? '' : 'warn', titre: ({ acceptee: 'Demande de salle acceptée', refusee: 'Demande de salle refusée', retiree: 'Salle retirée par arbitrage', deplacee: 'Déplacé dans une autre salle' })[a.genre] + ' : ' + a.titre,
            detail: a.message || '', ouvrir: function () { U.ouvrirFenetre('salles'); }, vu: function () { return marquerVus([a.id]); } };
        });
        S.aArbitrer(st(), compte()).forEach(function (d) { res.push({ id: 'sb-d-' + d.id, niveau: 'warn', titre: (d.validation ? 'Réservation à valider : ' : 'Conflit à arbitrer : ') + nomSalle(d.salle) + ' — ' + d.titre, detail: jourFr(S.jourISO(d.debut)) + ' ' + S.hm(d.debut) + '–' + S.hm(d.fin), ouvrir: function () { modaleArbitrage(d); } }); });
        return res;
      } catch (e) { return []; }
    }
  });
  /** Pour « Mon agenda » : réservations simples et demandes de l'agent sur [debut, fin[, triées. */
  function miennes(debut, fin) {
    var c = moi(), o = occupations(debut, fin);
    return o.occupations.filter(function (x) { return x.par === c.id && x.genre === 'simple'; }).map(function (x) { return Object.assign({ etat: '' }, x); })
      .concat(o.enAttente.filter(function (x) { return x.par === c.id; }).map(function (x) { var d = st().demandes[x.demande]; return Object.assign({ etat: d && d.validation ? 'à valider' : 'demande en conflit' }, x); }))
      .concat(o.refusees.filter(function (x) { return x.par === c.id; }).map(function (x) { return Object.assign({ etat: 'demande refusée' }, x); }))
      .sort(function (a, b) { return a.debut - b.debut; });
  }
  U.salles = { synchroniser: synchroniser, miennes: miennes, nomSalle: nomSalle, selecteur: selecteur, verifier: verifier, envoyer: envoyer, libelle: libelle, occupations: occupations, modaleReserver: modaleReserver };
})();
