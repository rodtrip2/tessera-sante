// SPDX-License-Identifier: EUPL-1.2
/*
 * Mes rendez-vous — agenda personnel de l'agent dans « Mon agenda » (24 novembre 2026, demande du porteur : agenda
 * personnel et événements partagés, synchronisés dans les deux sens avec l'agenda de la messagerie).
 *
 * Rendez-vous personnel (`RDV_PERSO`) : contenu chiffré par la clé de liste de l'agent (session.chiffrerPersonnel),
 * comme ses tâches : personne d'autre ne le lit, administrateur compris. Rendez-vous partagé (`RDV_PARTAGE`) : chiffré
 * pour ses seuls participants (enveloppe pour la clé de liste de chacun), modifié par eux, quitté par chacun.
 * Contenu : titre, début, fin, journée entière, lieu, note (aucune donnée clinique).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto;
  var J = 864e5, USAGE = 'rdv';
  var cache = {}, cacheP = {}, enCours = false;

  function s() { return U.App.session; }
  function st() { try { return s().etatModule('agenda'); } catch (e) { return null; } }
  function moi() { return s().compteEffectif(); }
  function disponible() { try { return !!s() && s().ouvert && s().ouvert('agenda') && s().aClePersonnelle && s().aClePersonnelle() && !s().apercu && !!A.rdvPerso; } catch (e) { return false; } }
  function deux(n) { return String(n).padStart(2, '0'); }
  function jourISO(t) { var d = new Date(t); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function hm(t) { var d = new Date(t); return deux(d.getHours()) + ':' + deux(d.getMinutes()); }
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function versT(j, heure) { var p = String(j || '').split('-'); if (p.length !== 3) return NaN; var q = String(heure || '00:00').split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +q[0] || 0, +q[1] || 0).getTime(); }

  // ------------------------------------------------------------ Lecture (déchiffrement en mémoire)
  function ouvrir(t) { return s().dechiffrerPersonnel(USAGE, t.chiffre).then(function (c) { cache[t.evt] = c || { illisible: true }; }, function () { cache[t.evt] = { illisible: true }; }); }
  function ouvrirP(t) { return s().ouvrirEnveloppe('rdv:' + t.id, t.env).then(function (c) { cacheP[t.evt] = c || { illisible: true }; }, function () { cacheP[t.evt] = { illisible: true }; }); }
  function assembler() {
    var e = st(), id = moi().id;
    return A.rdvPerso(e, id).filter(function (t) { return cache[t.evt]; }).map(function (t) { return Object.assign({ id: t.id, le: t.le }, cache[t.evt]); })
      .concat(A.rdvPartages(e, id).filter(function (t) { return cacheP[t.evt]; }).map(function (t) { return Object.assign({ id: t.id, le: t.le, partagee: true, participants: t.participants.slice(), auteur: t.auteur }, cacheP[t.evt]); }))
      .filter(function (r) { return !r.illisible && typeof r.debut === 'number'; });
  }
  /** Rendez-vous de l'agent déchiffrés (personnels et partagés) ; déchiffre en arrière-plan ce qui manque. */
  function liste() {
    var e = st();
    if (!e || !disponible()) return [];
    var id = moi().id, mq = A.rdvPerso(e, id).filter(function (t) { return !cache[t.evt]; }), mp = A.rdvPartages(e, id).filter(function (t) { return !cacheP[t.evt]; });
    if ((mq.length || mp.length) && !enCours) {
      enCours = true;
      Promise.all(mq.map(ouvrir).concat(mp.map(ouvrirP))).then(function () { enCours = false; U.rendreContenu(); }, function () { enCours = false; });
    }
    return assembler();
  }
  async function chargees() {
    var e = st();
    if (!e || !disponible()) return [];
    var id = moi().id;
    await Promise.all(A.rdvPerso(e, id).filter(function (t) { return !cache[t.evt]; }).map(ouvrir).concat(A.rdvPartages(e, id).filter(function (t) { return !cacheP[t.evt]; }).map(ouvrirP)));
    return assembler();
  }

  // ------------------------------------------------------------ Écriture
  function nettoyer(c) {
    return { titre: String(c.titre || '').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Rendez-vous', debut: c.debut, fin: typeof c.fin === 'number' && c.fin > c.debut ? c.fin : c.debut + (c.journee ? J : 36e5),
      journee: !!c.journee, lieu: String(c.lieu || '').trim().slice(0, 150), note: String(c.note || '').trim().slice(0, 1000) };
  }
  async function enregistrer(id, contenu, participants) {
    var c = nettoyer(contenu);
    if (/^RS/.test(id) || (participants && participants.length)) {
      var ps = [moi().id].concat((participants || []).filter(function (x) { return x !== moi().id; })).filter(function (x, i, l) { return l.indexOf(x) === i; });
      var idS = /^RS/.test(id) ? id : 'RS' + C.hex(C.aleatoire(6));
      await s().enregistrer('RDV_PARTAGE', { id: idS, participants: ps, env: await s().chiffrerEnveloppe('rdv:' + idS, ps.map(function (x) { return 't-a.' + x; }), c) });
      if (id && /^RP/.test(id)) await s().enregistrer('RDV_PERSO', { id: id, agent: moi().id, supprime: true });
      return idS;
    }
    await s().enregistrer('RDV_PERSO', { id: id, agent: moi().id, chiffre: await s().chiffrerPersonnel(USAGE, c) });
    return id;
  }
  async function retirer(r) {
    if (r.partagee) {
      var reste = r.participants.filter(function (x) { return x !== moi().id; });
      if (reste.length >= 2) await s().enregistrer('RDV_PARTAGE', { id: r.id, participants: reste, env: await s().chiffrerEnveloppe('rdv:' + r.id, reste.map(function (x) { return 't-a.' + x; }), nettoyer(r)) });
      else await s().enregistrer('RDV_PARTAGE', { id: r.id, participants: r.participants, supprime: true });
      return;
    }
    await s().enregistrer('RDV_PERSO', { id: r.id, agent: moi().id, supprime: true });
  }

  // ------------------------------------------------------------ Fenêtre
  function nomCompte(id) { return U.mesTaches && U.mesTaches.nomCompte ? U.mesTaches.nomCompte(id) : id; }
  function modale(r, init) {
    var nouveau = !r, j0 = (init && init.debut) || (function () { var d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.getTime(); })();
    r = r || Object.assign({ titre: '', debut: j0, fin: j0 + 36e5, journee: false, lieu: '', note: '', participants: [] }, init || {});
    var titre = h('input', { type: 'text', maxlength: 150, value: r.titre || '', 'aria-label': 'Rendez-vous' });
    var dj = h('input', { type: 'date', value: jourISO(r.debut), 'aria-label': 'Date de début' }), dh = h('input', { type: 'time', step: 300, value: hm(r.debut), 'aria-label': 'Heure de début' });
    var fj = h('input', { type: 'date', value: jourISO(r.journee ? r.fin - 1 : r.fin), 'aria-label': 'Date de fin' }), fh = h('input', { type: 'time', step: 300, value: hm(r.fin), 'aria-label': 'Heure de fin' });
    var journee = h('input', { type: 'checkbox', checked: !!r.journee });
    function majJ() { dh.disabled = fh.disabled = journee.checked; }
    journee.addEventListener('change', majJ); majJ();
    dj.addEventListener('change', function () { if (!fj.value || fj.value < dj.value) fj.value = dj.value; });
    var lieu = h('input', { type: 'text', maxlength: 150, value: r.lieu || '', 'aria-label': 'Lieu' });
    var note = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Note' }); note.value = r.note || '';
    var participants = (r.participants || []).filter(function (x) { return x !== moi().id; }), zoneP = h('div', { class: 'pile' }), selP = h('select', { 'aria-label': 'Partager avec' });
    function majP() {
      U.vider(zoneP);
      if (participants.length) zoneP.appendChild(h('div', { class: 'actions gauche' }, participants.map(function (x, i) { return h('span', { class: 'ms-dest' }, nomCompte(x), h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer ' + nomCompte(x), onclick: function () { participants.splice(i, 1); majP(); } }, '✕')); })));
      U.vider(selP).appendChild(h('option', { value: '', text: 'Ajouter un participant…' }));
      (U.mesTaches && U.mesTaches.partageables ? U.mesTaches.partageables() : []).filter(function (c) { return participants.indexOf(c.id) < 0; }).forEach(function (c) { selP.appendChild(h('option', { value: c.id, text: c.nom })); });
      zoneP.appendChild(selP);
    }
    selP.addEventListener('change', function () { if (selP.value) { participants.push(selP.value); majP(); } });
    majP();
    return U.modale(nouveau ? 'Nouveau rendez-vous' : 'Modifier le rendez-vous', h('div', { class: 'pile' },
      h('label', {}, 'Rendez-vous', titre),
      h('label', { class: 'case' }, journee, h('span', { text: 'Journée entière' })),
      h('div', { class: 'grille-2' }, h('label', {}, 'Début', dj), h('label', {}, 'Heure', dh), h('label', {}, 'Fin', fj), h('label', {}, 'Heure', fh)),
      h('label', {}, 'Lieu (facultatif)', lieu),
      h('label', {}, 'Note (facultatif ; aucune donnée clinique)', note),
      h('fieldset', { class: 'pile' }, h('legend', { text: 'Partager le rendez-vous' }), zoneP,
        h('small', { class: 'muted', text: 'Partagé, le rendez-vous est chiffré pour vous et les participants seuls : chacun le voit dans Mon agenda et peut le modifier. Les autres agents de l’Agenda savent seulement qu’un rendez-vous réunit ces personnes.' })),
      h('small', { class: 'muted', text: 'Votre agenda personnel est chiffré par votre clé de liste, remise à vous seul : personne d’autre ne le lit, administrateur compris.' })),
    [{ texte: 'Annuler' }, nouveau ? null : { texte: r.partagee ? 'Quitter' : 'Supprimer', classe: 'danger', action: async function () {
      if (!await SIC.ui.confirmer(r.partagee ? 'Quitter ce rendez-vous partagé ? Il reste aux autres participants.' : 'Supprimer ce rendez-vous ?')) return false;
      await retirer(r); U.toast(r.partagee ? 'Vous avez quitté le rendez-vous.' : 'Rendez-vous supprimé.');
    } },
    { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim()) { titre.focus(); throw new Error('Indiquez le rendez-vous.'); }
      var d = journee.checked ? versT(dj.value) : versT(dj.value, dh.value), f = journee.checked ? versT(fj.value || dj.value) + J : versT(fj.value || dj.value, fh.value);
      if (!isFinite(d) || !isFinite(f)) throw new Error('Indiquez la date.');
      if (f <= d) throw new Error('La fin doit suivre le début.');
      var c = { titre: titre.value, debut: d, fin: f, journee: journee.checked, lieu: lieu.value, note: note.value };
      if (r.partagee && !participants.length) {
        await enregistrer('RP' + C.hex(C.aleatoire(6)), c);
        await s().enregistrer('RDV_PARTAGE', { id: r.id, participants: r.participants, supprime: true });
      } else await enregistrer(r.id || 'RP' + C.hex(C.aleatoire(6)), c, participants);
      U.toast(participants.length ? 'Rendez-vous partagé avec ' + participants.map(nomCompte).join(', ') + '.' : 'Rendez-vous enregistré.');
    } }].filter(Boolean), { focus: nouveau ? titre : null });
  }

  /** Carte d'un rendez-vous dans une colonne de Mon agenda (jour commençant à j0). */
  function carte(r, j0) {
    var j1 = j0 + J, plage = r.journee ? 'Journée' : (r.debut < j0 ? '…' : hm(r.debut)) + ' – ' + (r.fin >= j1 ? '…' : hm(r.fin));
    return h('article', { class: 'agenda-element agenda-perso', title: r.partagee ? 'Rendez-vous partagé' : 'Rendez-vous personnel' },
      h('div', { class: 'agenda-plage', text: plage }),
      h('button', { class: 'btn lien', type: 'button', onclick: function () { modale(r); } }, r.titre || 'Rendez-vous'),
      r.lieu ? h('div', {}, h('small', { text: r.lieu })) : null,
      r.partagee ? h('div', {}, h('small', { class: 'mt-partagee', text: 'Avec ' + r.participants.filter(function (x) { return x !== moi().id; }).map(nomCompte).join(', ') })) : null);
  }
  function duJour(j0) { var j1 = j0 + J; return liste().filter(function (r) { return r.debut < j1 && r.fin > j0; }).sort(function (a, b) { return a.debut - b.debut; }); }

  // ------------------------------------------------------------ Synchronisation (agenda de la messagerie)
  var pourSynchro = {
    lister: async function (debut) {
      return (await chargees()).filter(function (r) { return r.fin >= debut; }).map(function (r) {
        return { cle: 'perso-' + r.id, genre: 'perso', debut: r.debut, fin: r.fin, journee: !!r.journee, titre: r.titre || '', lieu: r.lieu || '', note: r.note || '', le: r.le };
      });
    },
    enregistrer: async function (cle, x) {
      var id = cle.replace(/^perso-/, ''), r = assembler().filter(function (y) { return y.id === id; })[0];
      if (!r) return;
      await enregistrer(id, Object.assign({}, r, { titre: x.titre, debut: x.debut, fin: x.fin, journee: x.journee, lieu: x.lieu, note: x.note }), r.partagee ? r.participants : null);
    },
    creer: async function (x) { return 'perso-' + await enregistrer('RP' + C.hex(C.aleatoire(6)), x); },
    retirer: async function (cle) { var id = cle.replace(/^perso-/, ''), r = assembler().filter(function (y) { return y.id === id; })[0]; if (r) await retirer(r); }
  };

  U.mesRdv = { disponible: disponible, liste: liste, chargees: chargees, duJour: duJour, carte: carte, modale: modale, nouveau: function (init) { return modale(null, init); }, pourSynchro: pourSynchro, minuit: minuit };
})();
