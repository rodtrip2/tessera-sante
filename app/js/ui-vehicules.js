// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Véhicules — interface (décision du porteur du 8 novembre 2026). Logique : module-vehicules.js.
 * Onglets : Véhicules (parc, caractéristiques, signalements, prêts), Réservations (semaine par véhicule), Signalements ;
 * Administration → Véhicules : types de véhicules, types de signalements, données ajoutées aux véhicules.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, V = SIC.vehicules, C = SIC.crypto;
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var vue = { ref: minuit(Date.now()), faitsVisibles: false };

  function st() { return (U.App.session && U.App.session.etatModule('vehicules')) || { vehicules: {}, prets: {}, reservations: {}, signalements: {} }; }
  function opts() { return V.options(U.config()); }
  function peut(t) { return U.App.session.peut(t); }
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function plusJours(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function libJour(t) { var d = new Date(t); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function quand(r) { return libJour(r.debut) + ' ' + hm(r.debut) + ' → ' + (V.jourISO(r.debut) === V.jourISO(r.fin) ? '' : libJour(r.fin) + ' ') + hm(r.fin); }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function libType(code) { var t = opts().types.filter(function (x) { return x.code === code; })[0]; return t ? t.libelle : (code || 'Véhicule'); }
  function libSignalement(code) { var t = opts().signalements.filter(function (x) { return x.code === code; })[0]; return t ? t.libelle : (code || 'Signalement'); }
  function moi() { return U.App.session.compteEffectif(); }

  // ------------------------------------------------------------ Informations : pré-réservations remplacées
  function avisVus() { var p = U.App.session.preferences || {}; return Array.isArray(p.avisVehiculesVus) ? p.avisVehiculesVus : []; }
  /** L'agent tel que le voit l'information : rôles, groupes d'agents, services (destinataires réglés par le cadre). */
  function qui() {
    var s = U.App.session, c = moi(), cfg = U.config();
    return { agent: c.id, roles: (s.roles && s.roles()) || [], groupes: SIC.groupes ? SIC.groupes.de(cfg, c.id) : [], services: U.services().map(function (x) { return x.code; }) };
  }
  function mesAvis() { try { return V.avisPour(st(), qui(), avisVus(), Date.now(), U.config()); } catch (e) { return []; } }
  function regleInformation() { var r = (U.App.session.roles && U.App.session.roles()) || []; return r.indexOf('CADRE') >= 0 || r.indexOf('ADMIN') >= 0; }
  /**
   * Destinataires de l'information d'une pré-réservation remplacée, par service (décision du porteur du 8 novembre 2026) :
   * réglés par le cadre pour ses services (l'administrateur pour tous) ; l'auteur de la pré-réservation est toujours informé.
   */
  function modaleInformation() {
    var s = U.App.session, c = s.utilisateur, admin = (c.roles || []).indexOf('ADMIN') >= 0;
    var svs = admin ? U.tousServices() : U.tousServices().filter(function (x) { return (c.services || []).indexOf(x.code) >= 0; });
    if (!svs.length) return alert('Aucun service à régler.');
    var tout = JSON.parse(JSON.stringify(U.config().vehiculesInformation || {}));
    var sel = h('select', { 'aria-label': 'Service' }, svs.map(function (x) { return h('option', { value: x.code, text: x.libelle }); }));
    var zone = h('div', { class: 'pile' }), courant = null;
    var D = SIC.modules.obtenir('vehicules').droits;
    function lire() {
      if (!courant) return;
      tout[courant.service] = { roles: courant.roles.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.code; }),
        groupes: courant.groupes.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.code; }),
        agents: courant.agents.filter(function (x) { return x.cb.checked; }).map(function (x) { return { id: x.id, nom: x.nom }; }) };
    }
    function dessiner() {
      lire();
      var sv = sel.value, inf = V.information({ vehiculesInformation: tout }, sv);
      var cases = function (l, coche) { return l.map(function (x) { return Object.assign({ cb: h('input', { type: 'checkbox', checked: coche(x) }) }, x); }); };
      courant = {
        service: sv,
        roles: cases(D.rolesConfig(U.config()).filter(function (x) { return !x.admin; }).map(function (x) { return { code: x.code, libelle: x.libelle }; }), function (x) { return inf.roles.indexOf(x.code) >= 0; }),
        groupes: cases((SIC.groupes ? SIC.groupes.pourService(U.config(), sv) : []).map(function (g) { return { code: g.code, libelle: g.libelle }; }), function (x) { return inf.groupes.indexOf(x.code) >= 0; }),
        agents: cases((s.comptes || []).filter(function (a) { return a.actif !== false && a.id !== 'secours' && (!(a.services || []).length || (a.services || []).indexOf(sv) >= 0); })
          .sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || ''); }).map(function (a) { return { id: a.id, nom: a.nom || a.id }; })
          .concat(inf.agents.filter(function (a) { return !(s.comptes || []).some(function (y) { return y.id === a.id; }); })), function (x) { return inf.agents.some(function (a) { return a.id === x.id; }); })
      };
      U.vider(zone);
      var bloc = function (titre, l, lib) { return h('div', {}, h('b', { text: titre }), l.length ? h('div', { class: 'actions gauche' }, l.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: lib(x) })); })) : h('p', { class: 'muted', text: 'Aucun.' })); };
      zone.appendChild(h('p', { class: 'info', text: 'L’auteur de la pré-réservation est toujours informé.' }));
      zone.appendChild(bloc('Rôles (agents de ce service)', courant.roles, function (x) { return x.libelle; }));
      zone.appendChild(bloc('Groupes d’agents', courant.groupes, function (x) { return 'Groupe : ' + x.libelle; }));
      zone.appendChild(bloc('Agents nommés', courant.agents, function (x) { return x.nom; }));
    }
    sel.addEventListener('change', dessiner);
    dessiner();
    U.modale('Information des pré-réservations remplacées', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Quand une réservation est forcée sur une pré-réservation, qui est informé, en plus de son auteur ? Par défaut : le cadre et la secrétaire du service. Réglage par service, fait par le cadre du service.' }),
      h('label', {}, 'Service de la pré-réservation', sel), zone), [
      { texte: 'Annuler' },
      { texte: 'Revenir au réglage par défaut', action: async function () { lire(); delete tout[sel.value]; await U.enregistrerConfig([['vehiculesInformation', tout]]); } },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () { lire(); await U.enregistrerConfig([['vehiculesInformation', tout]]); } }], { large: true });
  }
  async function marquerVus(ids) { try { await U.App.session.enregistrerPreference('avisVehiculesVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }
  function bandeauAvis() {
    var av = mesAvis();
    if (!av.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' pré-réservations remplacées' : 'Une pré-réservation remplacée' }), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Tout marquer vu')),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        var p = a.preReservation, f = a.reservationForcee || {}, mien = p.agent === moi().id || p.par === moi().id;
        return h('li', {}, h('span', { text: (mien ? 'Votre pré-réservation' : 'La pré-réservation de ' + (p.nom || 'un agent')) + ' — ' + V.libelleVehicule(st().vehicules[p.vehicule]) + ', ' + quand(p) + (p.motif ? ' (' + p.motif + ')' : '') +
          ' — a été remplacée par la réservation de ' + (f.nom || U.App.session.nomAuteur(a.par)) + ' (' + U.libService(f.service) + ')' + (f.debut ? ', ' + quand(f) : '') + ', le ' + U.date(Date.parse(a.le)) + '. ' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus([a.id]); } }, 'Vu'));
      })));
  }

  // ------------------------------------------------------------ Parc
  function vueParc(maintenant) {
    var svs = servicesAffiches(), vs = V.vehiculesPour(st(), svs);
    return h('div', {}, bandeauAvis(),
      h('div', { class: 'barre' }, h('h1', { text: 'Véhicules' }),
        peut('VEHICULE') ? h('button', { class: 'btn primaire', onclick: function () { modaleVehicule(null); } }, '+ Nouveau véhicule') : null,
        peut('RESERVATION') ? h('button', { class: 'btn', onclick: function () { modaleReservation(null, {}); } }, 'Réserver un véhicule') : null,
        regleInformation() ? h('button', { class: 'btn', onclick: modaleInformation }, 'Information des pré-réservations…') : null),
      vs.length ? h('div', { class: 'grille-vehicules' }, vs.map(function (v) { return carteVehicule(v, maintenant, svs); }))
        : h('div', { class: 'panneau vide', text: peut('VEHICULE') ? 'Aucun véhicule : ajoutez les véhicules du service (+ Nouveau véhicule).' : 'Aucun véhicule pour vos services.' }),
      h('p', { class: 'muted' }, h('small', { text: 'Un véhicule appartient à son service d’affectation ; il peut être prêté à un autre service (réservé à celui-ci pendant la période) ou mis à disposition (réservable aussi par d’autres services). Les réservations faites depuis un événement de l’agenda y sont liées.' })));
  }
  function carteVehicule(v, maintenant, svs) {
    var o = opts(), sigs = V.signalementsOuverts(st(), v.id);
    var prochaines = V.reservationsActives(st(), v.id, maintenant, plusJours(maintenant, 30)).slice(0, 3);
    var prets = V.pretsDe(st(), v.id, minuit(maintenant), Infinity).sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
    var autre = svs.indexOf(v.service) < 0;
    return h('section', { class: 'panneau carte-vehicule' + (v.actif === false ? ' hors-service' : '') },
      h('div', { class: 'barre' }, h('h2', { text: v.nom || 'Véhicule' }), h('span', { class: 'badge', text: libType(v.type) }), v.actif === false ? h('span', { class: 'badge bad', text: 'Hors service' }) : null,
        autre ? h('span', { class: 'badge warn', text: 'de ' + U.libService(v.service) }) : null),
      h('div', { class: 'recap' },
        h('div', { text: 'Immatriculation : ' + (v.immatriculation || '—') }),
        h('div', { text: 'Places : ' + (v.places || '—') + ' · Parking : ' + (v.parking || '—') }),
        h('div', { text: 'Service d’affectation : ' + U.libService(v.service) }),
        o.champs.filter(function (c) { return c.actif && (v.complements || {})[c.id] !== undefined; }).map(function (c) { return h('div', { text: c.libelle + ' : ' + V.libValeur(c, v.complements[c.id]) }); }),
        v.precision ? h('div', { class: 'muted', text: v.precision }) : null),
      sigs.length ? h('div', { class: 'pile' }, sigs.map(function (sg) { return ligneSignalement(sg, false); })) : null,
      prets.length ? h('div', {}, h('small', { class: 'muted', text: 'Prêts et mises à disposition : ' }), prets.map(function (p) {
        return h('span', { class: 'badge', title: p.motif || '', text: (p.mode === 'pret' ? 'Prêté à ' + (p.services || []).map(U.libService).join(', ') : 'À disposition de ' + ((p.services || []).length ? p.services.map(U.libService).join(', ') : 'tous les services')) + ' ' + V.libPeriode(p) });
      })) : null,
      h('div', {}, h('small', { class: 'muted', text: prochaines.length ? 'Prochaines réservations : ' : 'Aucune réservation dans les 30 jours.' }),
        prochaines.map(function (r) { return h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleReservation(r, {}); } }, (r.statut === 'pre' ? 'Pré-réservé ' : '') + quand(r) + ' (' + U.libService(r.service) + (r.statut === 'pre' && r.nom ? ', ' + r.nom : '') + ')'); })),
      h('div', { class: 'actions gauche' },
        peut('RESERVATION') && v.actif !== false ? h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { modaleReservation(null, { vehicule: v.id }); } }, 'Réserver') : null,
        peut('SIGNALEMENT') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleSignalement(v); } }, 'Signaler…') : null,
        peut('PRET') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modalePret(v, null); } }, 'Prêter ou mettre à disposition…') : null,
        peut('VEHICULE') ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleVehicule(v); } }, 'Modifier') : null));
  }

  function modaleVehicule(v) {
    var x = v || {}, o = opts();
    var nom = h('input', { type: 'text', maxlength: 60, value: x.nom || '', placeholder: 'ex. Clio blanche, minibus 9 places' });
    var type = h('select', {}, o.types.map(function (t) { return h('option', { value: t.code, text: t.libelle, selected: x.type === t.code }); }));
    var immat = h('input', { type: 'text', maxlength: 20, value: x.immatriculation || '', placeholder: 'AA-123-AA' });
    var places = h('input', { type: 'number', min: 1, max: 60, value: x.places || '', class: 'champ-court' });
    var parking = h('input', { type: 'text', maxlength: 80, value: x.parking || '', placeholder: 'ex. Parking P2, place 14' });
    var sv = h('select', {}, U.services().map(function (s) { return h('option', { value: s.code, text: s.libelle, selected: (x.service || (U.App.service !== '*' ? U.App.service : '')) === s.code }); }));
    var precision = h('input', { type: 'text', maxlength: 160, value: x.precision || '', placeholder: 'Précision (où sont les clés, carte carburant…)' });
    var actif = h('input', { type: 'checkbox', checked: x.actif !== false });
    var champs = o.champs.filter(function (c) { return c.actif; }).map(function (c) {
      var val = (x.complements || {})[c.id], el, lire;
      if (c.type === 'ouiNon') { el = h('select', {}, [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (y) { return h('option', { value: y[0], text: y[1], selected: (val === true ? 'oui' : val === false ? 'non' : '') === y[0] }); })); lire = function () { return el.value; }; }
      else if (c.type === 'liste') { el = h('select', {}, [h('option', { value: '', text: '—' })].concat(c.choix.map(function (y) { return h('option', { value: y, text: y, selected: val === y }); }))); lire = function () { return el.value; }; }
      else { el = h('input', { type: c.type === 'date' ? 'date' : c.type === 'nombre' ? 'number' : 'text', value: val === undefined || val === null ? '' : val }); lire = function () { return el.value; }; }
      return { c: c, el: el, lire: lire };
    });
    var boutons = [{ texte: 'Annuler' }];
    if (v) boutons.push({ texte: 'Retirer du parc', classe: 'danger', action: async function () {
      if (!confirm('Retirer « ' + V.libelleVehicule(v) + ' » du parc ? Son historique (réservations, signalements) reste au journal. Pour une indisponibilité passagère, décochez plutôt « En service ».')) return false;
      await U.App.session.enregistrer('VEHICULE', { id: v.id, supprime: true, service: v.service });
      U.toast('Véhicule retiré du parc.');
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!nom.value.trim()) throw new Error('Indiquez le nom du véhicule.');
      var comp = {};
      champs.forEach(function (f) { var val = V.valeurChamp(f.c, f.lire()); if (val !== null) comp[f.c.id] = val; });
      var d = { id: x.id || 'VH' + C.hex(C.aleatoire(4)), nom: nom.value.trim(), type: type.value, immatriculation: immat.value.trim().toUpperCase(), places: +places.value || null,
        parking: parking.value.trim(), service: sv.value, precision: precision.value.trim(), actif: actif.checked, complements: comp };
      await U.App.session.enregistrer('VEHICULE', d);
      U.toast(v ? 'Véhicule modifié.' : 'Véhicule ajouté.');
    } });
    U.modale(v ? 'Modifier le véhicule' : 'Nouveau véhicule', h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Nom', nom), h('label', {}, 'Type', type)),
      h('div', { class: 'grille-3' }, h('label', {}, 'Immatriculation', immat), h('label', {}, 'Nombre de places', places), h('label', {}, 'Service d’affectation', sv)),
      h('label', {}, 'Lieu de stationnement (parking)', parking),
      champs.length ? h('div', { class: 'grille-2' }, champs.map(function (f) { return h('label', {}, f.c.libelle, f.el); })) : null,
      h('label', {}, 'Précision', precision),
      h('label', { class: 'case' }, actif, h('span', { text: 'En service (décochez pendant une immobilisation : plus de réservation possible)' }))), boutons, { large: true });
  }

  function modalePret(v, p) {
    var x = p || {};
    var mode = h('select', {}, Object.keys(V.MODES_PRET).map(function (k) { return h('option', { value: k, text: V.MODES_PRET[k], selected: (x.mode || 'pret') === k }); }));
    var choisis = (x.services || []).slice();
    var cases = U.tousServices().filter(function (s) { return s.code !== v.service; }).map(function (s) {
      var cb = h('input', { type: 'checkbox', checked: choisis.indexOf(s.code) >= 0, onchange: function () { choisis = cb.checked ? choisis.concat([s.code]) : choisis.filter(function (c) { return c !== s.code; }); } });
      return h('label', { class: 'case' }, cb, h('span', { text: s.libelle }));
    });
    var debut = h('input', { type: 'date', value: x.debut || V.jourISO(Date.now()) }), fin = h('input', { type: 'date', value: x.fin || '' });
    var motif = h('input', { type: 'text', maxlength: 120, value: x.motif || '', placeholder: 'Précision (facultatif)' });
    var liste = V.pretsDe(st(), v.id, minuit(Date.now()), Infinity);
    var boutons = [{ texte: 'Fermer' }];
    // « Envoyer par message » (messagerie, 0.23.0) : nouveau message avec la réservation rattachée
    if (r && U.messagerie && U.messagerie.peutEnvoyer()) boutons.push(U.messagerie.boutonModale('vehicules', 'reservation', r.id, r.service));
    if (p) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () { await U.App.session.enregistrer('PRET', { id: p.id, vehicule: v.id, supprime: true }); U.toast('Prêt supprimé.'); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!debut.value) throw new Error('Indiquez le premier jour.');
      if (fin.value && fin.value < debut.value) throw new Error('Le dernier jour précède le premier.');
      if (mode.value === 'pret' && !choisis.length) throw new Error('Choisissez le service emprunteur.');
      await U.App.session.enregistrer('PRET', { id: x.id || 'PR' + C.hex(C.aleatoire(4)), vehicule: v.id, mode: mode.value, services: choisis, debut: debut.value, fin: fin.value, motif: motif.value.trim() });
      U.toast('Enregistré.');
    } });
    U.modale('Prêt ou mise à disposition — ' + V.libelleVehicule(v), h('div', { class: 'pile' },
      liste.length && !p ? h('div', {}, h('b', { text: 'En cours ou à venir' }), h('ul', { class: 'liste-simple' }, liste.map(function (q) {
        return h('li', {}, h('button', { class: 'btn lien', type: 'button', onclick: function () { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(function () { modalePret(v, q); }, 0); } },
          (q.mode === 'pret' ? 'Prêt à ' : 'Mise à disposition de ') + ((q.services || []).length ? q.services.map(U.libService).join(', ') : 'tous les services') + ' ' + V.libPeriode(q)));
      }))) : null,
      h('label', {}, 'Nature', mode),
      h('div', {}, h('small', { class: 'muted', text: 'Services (prêt : le ou les services emprunteurs ; mise à disposition : aucun coché = tous les services)' }), h('div', { class: 'actions gauche' }, cases)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Premier jour', debut), h('label', {}, 'Dernier jour (vide : sans fin)', fin)),
      h('label', {}, 'Précision', motif),
      h('small', { class: 'muted', text: 'Pendant un prêt, seul le service emprunteur réserve le véhicule ; pendant une mise à disposition, le service d’affectation le garde et les services désignés peuvent aussi le réserver. Les réservations déjà faites ne sont pas modifiées.' })), boutons, { large: true });
  }

  // ------------------------------------------------------------ Réservation
  /** Réservation directe (r nul) ou existante. `init` : { vehicule, debut }. Disponibilité vérifiée à chaque changement. */
  function modaleReservation(r, init) {
    var x = r || {}, ini = init || {}, s = U.App.session, m = moi();
    var svs = U.services(), serviceInit = x.service || (U.App.service !== '*' ? U.App.service : (svs[0] || {}).code);
    var sv = h('select', { disabled: !!r }, svs.map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === serviceInit }); }));
    var base = x.debut || ini.debut || (minuit(Date.now()) + 9 * 36e5);
    var dateD = h('input', { type: 'date', value: V.jourISO(base) }), hD = h('input', { type: 'time', value: hm(base) });
    var dateF = h('input', { type: 'date', value: V.jourISO(x.fin || base + 2 * 36e5) }), hF = h('input', { type: 'time', value: hm(x.fin || base + 2 * 36e5) });
    var selV = h('select', {}), etat = h('div', { class: 'pile' }), info = null;
    // Réservation ou pré-réservation (décision du porteur du 8 novembre 2026) : la pré-réservation dit qui et pourquoi,
    // sans empêcher une réservation forcée après avertissement (l'auteur, le cadre et la secrétaire sont informés)
    var statut = h('select', { 'aria-label': 'Nature' }, Object.keys(V.STATUTS).map(function (k) { return h('option', { value: k, text: V.STATUTS[k], selected: (x.statut || ini.statut || 'ferme') === k }); }));
    var motif = h('input', { type: 'text', maxlength: 120, value: x.motif || '', placeholder: 'Motif obligatoire (ex. rendez-vous extérieur, sortie thérapeutique ; pas de donnée clinique)' });
    function periode() { return [new Date(dateD.value + 'T' + hD.value).getTime(), new Date(dateF.value + 'T' + hF.value).getTime()]; }
    function majVehicules() {
      var p = periode(), choix = selV.value || x.vehicule || ini.vehicule;
      U.vider(selV);
      var liste = SIC.modules.lire('vehicules.disponibles', st(), { service: sv.value, debut: p[0], fin: p[1], exclure: x.id, libService: U.libService }) || [];
      if (x.vehicule && !liste.some(function (y) { return y.id === x.vehicule; })) { var vv = st().vehicules[x.vehicule]; if (vv) liste.push({ id: vv.id, libelle: V.libelleVehicule(vv), ok: false, raison: 'hors de vos véhicules' }); }
      liste.forEach(function (y) { selV.appendChild(h('option', { value: y.id, text: y.libelle + (y.places ? ' — ' + y.places + ' places' : '') + (y.ok ? '' : ' — indisponible'), selected: y.id === choix })); });
      U.vider(etat);
      var y = liste.filter(function (z) { return z.id === selV.value; })[0];
      info = y || null;
      if (!liste.length) etat.appendChild(h('div', { class: 'alerte', text: 'Aucun véhicule pour ce service.' }));
      else if (y && y.ok && y.avertissement) etat.appendChild(h('div', { class: 'alerte avertissement', text: 'Attention, véhicule ' + y.avertissement + '. ' + (statut.value === 'pre' ? 'Vous pouvez pré-réserver aussi.' : 'Vous pouvez forcer la réservation : l’auteur de la pré-réservation et les personnes désignées pour son service (par défaut le cadre et la secrétaire) en seront informés.') }));
      else if (y) etat.appendChild(h('div', { class: y.ok ? 'info' : 'alerte', text: y.ok ? 'Disponible.' + (y.signalements ? ' ' + y.signalements + ' signalement(s) en cours : voir l’onglet Véhicules.' : '') : 'Indisponible : ' + y.raison + '.' }));
    }
    [sv, dateD, hD, dateF, hF, selV, statut].forEach(function (c) { c.addEventListener('change', majVehicules); });
    dateD.addEventListener('change', function () { if (dateF.value < dateD.value) dateF.value = dateD.value; });
    majVehicules();
    var boutons = [{ texte: 'Fermer' }];
    var moiOuDroit = r && (peut('RESERVATION') || r.agent === m.id || r.par === m.id);
    if (r && moiOuDroit) boutons.push({ texte: 'Annuler la réservation', classe: 'danger', action: async function () {
      var mo = prompt('Annuler la réservation ' + quand(r) + ' ? Motif (facultatif) :', '');
      if (mo === null) return false;
      await s.enregistrer('RESERVATION', { id: r.id, annulee: true, motifAnnulation: mo.trim(), service: r.service });
      U.toast('Réservation annulée.');
    } });
    async function enregistrer(st0) {
      var p = periode();
      if (!selV.value) throw new Error('Choisissez un véhicule.');
      if (!(p[1] > p[0])) throw new Error('La fin doit suivre le début.');
      if (r && r.lien) throw new Error('Réservation liée à un événement de l’agenda : modifiez l’événement.');
      if (!motif.value.trim()) throw new Error('Indiquez le motif' + (st0 === 'pre' ? ' de la pré-réservation.' : ' de la réservation.'));
      var d = { id: x.id || 'RV' + C.hex(C.aleatoire(5)), vehicule: selV.value, debut: p[0], fin: p[1], service: sv.value, agent: x.agent || m.id, nom: x.nom || m.nom, motif: motif.value.trim(), statut: st0 };
      if (info && info.pre && info.pre.length) {
        if (!confirm('Véhicule ' + info.avertissement + '.\n\n' + (st0 === 'pre' ? 'Pré-réserver quand même ?' : 'Forcer la réservation ? L’auteur de la pré-réservation et les personnes désignées pour son service (par défaut le cadre et la secrétaire) en seront informés.'))) return false;
        if (st0 !== 'pre') d.supplante = info.pre.slice();
      }
      await s.enregistrer('RESERVATION', d);
      U.toast(st0 === 'pre' ? (r ? 'Pré-réservation modifiée.' : 'Véhicule pré-réservé.') : (r && r.statut === 'pre' ? 'Réservation confirmée.' : r ? 'Réservation modifiée.' : 'Véhicule réservé.'));
    }
    if (r && r.statut === 'pre' && peut('RESERVATION')) boutons.push({ texte: 'Confirmer la réservation', action: function () { return enregistrer('ferme'); } });
    if (!r || peut('RESERVATION')) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: function () { return enregistrer(statut.value); } });
    U.modale(r ? (r.statut === 'pre' ? 'Pré-réservation' : 'Réservation') : 'Réserver un véhicule', h('div', { class: 'pile' },
      r && r.lien ? h('p', { class: 'muted', text: 'Réservée depuis un événement de l’agenda : elle suit l’événement (modification, annulation de la date, suppression).' }) : null,
      h('div', { class: 'grille-3' }, h('label', {}, 'Nature', statut), h('label', {}, 'Service', sv), h('label', {}, 'Véhicule', selV)),
      h('div', { class: 'grille-4' }, h('label', {}, 'Jour de départ', dateD), h('label', {}, 'Heure', hD), h('label', {}, 'Jour de retour', dateF), h('label', {}, 'Heure', hF)),
      etat, h('label', {}, 'Motif', motif),
      h('small', { class: 'muted', text: 'Pré-réservation : le véhicule reste réservable ; la personne qui réserve est avertie de votre pré-réservation et de son motif, et vous en êtes informé(e), ainsi que les personnes désignées par le cadre pour le service (par défaut le cadre et la secrétaire).' }),
      r ? h('small', { class: 'muted', text: (r.statut === 'pre' ? 'Pré-réservée par ' : 'Réservée par ') + (r.nom || s.nomAuteur(r.par)) + ', ' + U.date(Date.parse(r.cree)) + '.' }) : null), boutons, { large: true });
  }

  // ------------------------------------------------------------ Planning (semaine par véhicule)
  function vuePlanning(maintenant) {
    var debut = minuit(vue.ref), fin = plusJours(debut, 7), svs = servicesAffiches(), vs = V.vehiculesPour(st(), svs, debut, fin), rs = V.reservations(st(), svs, debut, fin);
    var tete = h('tr', {}, h('th', { text: 'Véhicule' }), [0, 1, 2, 3, 4, 5, 6].map(function (i) { var j = plusJours(debut, i); return h('th', { class: j === minuit(maintenant) ? 'aujourdhui' : '', text: libJour(j) }); }));
    var lignes = vs.map(function (v) {
      var sigs = V.signalementsOuverts(st(), v.id).length;
      return h('tr', { class: v.actif === false ? 'ancienne' : '' }, h('th', { class: 'vehicule' }, h('b', { text: v.nom || 'Véhicule' }), h('br'), h('small', { class: 'muted', text: (v.immatriculation || '') + (v.places ? ' · ' + v.places + ' pl.' : '') + (svs.indexOf(v.service) < 0 ? ' · ' + U.libService(v.service) : '') }),
        sigs ? h('div', {}, h('span', { class: 'badge warn', text: sigs + ' signalement(s)' })) : null, v.actif === false ? h('div', {}, h('span', { class: 'badge bad', text: 'Hors service' })) : null),
        [0, 1, 2, 3, 4, 5, 6].map(function (i) {
          var j0 = plusJours(debut, i), j1 = plusJours(debut, i + 1);
          var duJour = rs.filter(function (r) { return r.vehicule === v.id && r.debut < j1 && r.fin > j0; });
          var prets = V.pretsDe(st(), v.id, j0, j1);
          return h('td', { class: 'cellule-vehicule' + (j0 === minuit(maintenant) ? ' aujourdhui' : '') },
            prets.map(function (p) { return h('div', { class: 'pret-vehicule', title: p.motif || '', text: p.mode === 'pret' ? 'Prêté : ' + (p.services || []).map(U.libService).join(', ') : 'À disposition' }); }),
            duJour.map(function (r) {
              return h('button', { class: 'resa-vehicule' + (r.lien ? ' liee' : '') + (r.statut === 'pre' ? ' pre' : ''), type: 'button', title: (r.statut === 'pre' ? 'Pré-réservation — ' : '') + (r.motif || '') + ' — ' + (r.nom || ''), onclick: function () { modaleReservation(r, {}); } },
                (r.statut === 'pre' ? 'Pré-réservé ' : '') + (r.debut < j0 ? '…' : hm(r.debut)) + '–' + (r.fin > j1 ? '…' : hm(r.fin)) + ' ' + U.libService(r.service) + (r.statut === 'pre' && r.nom ? ' · ' + r.nom : '') + (r.motif ? ' · ' + r.motif : ''));
            }),
            peut('RESERVATION') && v.actif !== false ? h('button', { class: 'btn lien petit', type: 'button', 'aria-label': 'Réserver ' + (v.nom || '') + ' le ' + libJour(j0), onclick: function () { modaleReservation(null, { vehicule: v.id, debut: j0 + 9 * 36e5 }); } }, '+') : null);
        }));
    });
    return h('div', {}, bandeauAvis(),
      h('div', { class: 'barre' }, h('h1', { text: 'Réservations des véhicules' }), peut('RESERVATION') ? h('button', { class: 'btn primaire', onclick: function () { modaleReservation(null, {}); } }, 'Réserver un véhicule') : null),
      h('div', { class: 'barre' },
        h('button', { class: 'btn petit', type: 'button', 'aria-label': '7 jours précédents', onclick: function () { vue.ref = plusJours(vue.ref, -7); U.rendreContenu(); } }, '◀'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vue.ref = minuit(Date.now()); U.rendreContenu(); } }, 'Aujourd’hui'),
        h('button', { class: 'btn petit', type: 'button', 'aria-label': '7 jours suivants', onclick: function () { vue.ref = plusJours(vue.ref, 7); U.rendreContenu(); } }, '▶'),
        h('b', { text: 'Du ' + libJour(debut) + ' au ' + libJour(plusJours(debut, 6)) })),
      vs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'planning-vehicules' }, h('thead', {}, tete), h('tbody', {}, lignes))) : h('div', { class: 'panneau vide', text: 'Aucun véhicule pour vos services.' }),
      h('p', { class: 'muted' }, h('small', { text: 'Réservation en pointillé : faite depuis un événement de l’agenda ; hachurée : pré-réservation (qui, pourquoi), qui n’empêche pas de réserver après avertissement. « + » réserve le véhicule ce jour-là.' })));
  }

  // ------------------------------------------------------------ Signalements
  function ligneSignalement(sg, avecVehicule) {
    var v = st().vehicules[sg.vehicule];
    return h('div', { class: 'agenda-point signalement' + (sg.fait ? ' fait' : '') },
      h('span', { class: 'badge ' + (sg.fait ? 'ok' : (sg.type === 'voyant' || sg.type === 'degat' ? 'bad' : 'warn')), text: libSignalement(sg.type) }),
      avecVehicule ? h('b', { text: V.libelleVehicule(v) }) : null,
      sg.texte ? h('span', { text: sg.texte }) : null,
      h('small', { class: 'muted', text: U.App.session.nomAuteur(sg.par) + ', ' + U.date(Date.parse(sg.cree)) + (sg.fait ? ' — fait par ' + U.App.session.nomAuteur(sg.fait.par) + ', ' + U.date(Date.parse(sg.fait.le)) : '') }),
      peut('SIGNALEMENT_FAIT') ? h('button', { class: 'btn petit' + (sg.fait ? '' : ' primaire'), type: 'button', onclick: async function () {
        try { await U.App.session.enregistrer('SIGNALEMENT_FAIT', { signalement: sg.id, annule: sg.fait ? true : undefined }); U.rendreContenu(); } catch (e) { alert(e.message); }
      } }, sg.fait ? 'Remettre à faire' : 'Fait') : null);
  }
  function vueSignalements() {
    var svs = servicesAffiches(), ids = V.vehiculesPour(st(), svs).map(function (v) { return v.id; });
    var tous = Object.keys(st().signalements).map(function (k) { return st().signalements[k]; }).filter(function (sg) { return !sg.supprime && ids.indexOf(sg.vehicule) >= 0; });
    var ouverts = tous.filter(function (sg) { return !sg.fait; }).sort(function (a, b) { return String(b.cree).localeCompare(String(a.cree)); });
    var faits = tous.filter(function (sg) { return sg.fait && Date.parse(sg.fait.le) > Date.now() - 30 * 864e5; }).sort(function (a, b) { return String(b.fait.le).localeCompare(String(a.fait.le)); });
    var cb = h('input', { type: 'checkbox', checked: vue.faitsVisibles, onchange: function () { vue.faitsVisibles = cb.checked; U.rendreContenu(); } });
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Signalements' }), peut('SIGNALEMENT') ? h('button', { class: 'btn primaire', onclick: function () { modaleSignalement(null); } }, '+ Signaler') : null,
        h('div', { class: 'espace' }), h('label', { class: 'case' }, cb, h('span', { text: 'Montrer les signalements faits (30 jours)' }))),
      ouverts.length ? h('section', { class: 'panneau pile' }, ouverts.map(function (sg) { return ligneSignalement(sg, true); })) : h('div', { class: 'panneau vide', text: 'Aucun signalement en cours.' }),
      vue.faitsVisibles && faits.length ? h('section', { class: 'panneau pile' }, h('h2', { text: 'Faits' }), faits.map(function (sg) { return ligneSignalement(sg, true); })) : null,
      h('p', { class: 'muted' }, h('small', { text: 'Tâches et informations liées aux véhicules : faire le plein, voyant allumé, à nettoyer… Types réglables dans Administration → Véhicules.' })));
  }
  function modaleSignalement(v) {
    var svs = servicesAffiches(), vs = V.vehiculesPour(st(), svs);
    var selV = h('select', {}, vs.map(function (y) { return h('option', { value: y.id, text: V.libelleVehicule(y), selected: v && v.id === y.id }); }));
    var type = h('select', {}, opts().signalements.map(function (t) { return h('option', { value: t.code, text: t.libelle }); }));
    var texte = h('input', { type: 'text', maxlength: 160, placeholder: 'Précision (ex. voyant orange, reste un quart du réservoir)' });
    U.modale('Signaler', h('div', { class: 'pile' }, h('div', { class: 'grille-2' }, h('label', {}, 'Véhicule', selV), h('label', {}, 'Type', type)), h('label', {}, 'Précision', texte)), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        if (!selV.value) throw new Error('Choisissez le véhicule.');
        await U.App.session.enregistrer('SIGNALEMENT', { id: 'SG' + C.hex(C.aleatoire(5)), vehicule: selV.value, type: type.value, texte: texte.value.trim() });
        U.toast('Signalement enregistré.');
      } }]);
  }

  // ------------------------------------------------------------ Administration → Véhicules
  function panneauReglages() {
    var o = opts();
    var types = o.types.map(function (t) { return Object.assign({}, t); }), sigs = o.signalements.map(function (t) { return Object.assign({}, t); });
    var champs = JSON.parse(JSON.stringify(o.champs));
    function editeurListe(l, quoi) {
      var z = h('div', { class: 'pile' });
      function d() {
        U.vider(z);
        l.forEach(function (t, i) {
          var c = h('input', { type: 'text', maxlength: 80, value: t.libelle, 'aria-label': quoi, oninput: function () { t.libelle = c.value; } });
          z.appendChild(h('div', { class: 'agenda-point' }, c, h('button', { class: 'btn petit', type: 'button', disabled: i === 0, onclick: function () { l.splice(i - 1, 0, l.splice(i, 1)[0]); d(); } }, '▲'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { l.splice(i, 1); d(); } }, 'Retirer')));
        });
        z.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { l.push({ code: 'x' + Date.now().toString(36), libelle: '' }); d(); } }, '+ Ajouter')));
      }
      d();
      return z;
    }
    var corps = h('tbody');
    function dessinerChamps() {
      U.vider(corps);
      champs.forEach(function (c, i) {
        var lib = h('input', { type: 'text', maxlength: 60, value: c.libelle, 'aria-label': 'Nom de la donnée', oninput: function () { c.libelle = lib.value; } });
        var typ = h('select', { 'aria-label': 'Type de valeur', disabled: !!c.existant, onchange: function () { c.type = typ.value; dessinerChamps(); } }, Object.keys(V.TYPES_CHAMP).map(function (k) { return h('option', { value: k, text: V.TYPES_CHAMP[k], selected: c.type === k }); }));
        var choix = c.type === 'liste' ? h('input', { type: 'text', value: (c.choix || []).join(' ; '), placeholder: 'Choix séparés par « ; »', oninput: function () { c.choix = choix.value.split(';').map(function (y) { return y.trim(); }).filter(Boolean); } }) : h('small', { class: 'muted', text: '—' });
        var actif = h('input', { type: 'checkbox', checked: c.actif !== false, 'aria-label': 'Proposée', onchange: function () { c.actif = actif.checked; } });
        corps.appendChild(h('tr', {}, h('td', {}, lib), h('td', {}, typ), h('td', {}, choix), h('td', {}, actif),
          h('td', {}, c.existant ? null : h('button', { class: 'btn petit danger', type: 'button', onclick: function () { champs.splice(i, 1); dessinerChamps(); } }, 'Retirer'))));
      });
      if (!champs.length) corps.appendChild(h('tr', {}, h('td', { colspan: 5, class: 'muted', text: 'Aucune donnée ajoutée.' })));
    }
    champs.forEach(function (c) { c.existant = true; });
    dessinerChamps();
    var nomNouv = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Carte carburant à bord, prochaine révision, siège enfant' });
    var typeNouv = h('select', { 'aria-label': 'Type de valeur' }, Object.keys(V.TYPES_CHAMP).map(function (k) { return h('option', { value: k, text: V.TYPES_CHAMP[k] }); }));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Véhicules de l’établissement' }),
      h('h3', { text: 'Types de véhicules' }), editeurListe(types, 'Type de véhicule'),
      h('h3', { text: 'Données ajoutées aux véhicules' }),
      h('p', { class: 'muted', text: 'En plus du nom, du type, de l’immatriculation, du nombre de places et du parking : données propres à l’établissement, chacune avec son type de valeur.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Donnée', 'Type de valeur', 'Choix', 'Proposée', ''].map(function (t) { return h('th', { text: t }); }))), corps)),
      h('div', { class: 'actions gauche ag-ajouter' }, h('span', { class: 'muted', text: 'Ajouter :' }), nomNouv, typeNouv, h('button', { class: 'btn petit', type: 'button', onclick: function () {
        var n = nomNouv.value.trim(); if (!n) return nomNouv.focus();
        var code = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'donnee';
        if (!/^[a-z]/.test(code)) code = 'd-' + code;
        while (champs.some(function (c) { return c.id === code; })) code = code.slice(0, 26) + '-' + C.hex(C.aleatoire(1));
        champs.push({ id: code, libelle: n, type: typeNouv.value, choix: [], actif: true }); nomNouv.value = ''; dessinerChamps();
      } }, 'Ajouter')),
      h('h3', { text: 'Types de signalements' }), editeurListe(sigs, 'Type de signalement'),
      U.boutonEnregistrer(async function () {
        function nettoyer(l) { return l.map(function (t) { return { code: t.code, libelle: String(t.libelle || '').trim() }; }).filter(function (t) { return t.libelle; }); }
        var valeur = {}, tv = nettoyer(types), ts = nettoyer(sigs);
        if (JSON.stringify(tv) !== JSON.stringify(V.TYPES_VEHICULE_DEFAUT)) valeur.types = tv;
        if (JSON.stringify(ts) !== JSON.stringify(V.TYPES_SIGNALEMENT_DEFAUT)) valeur.signalements = ts;
        var cs = champs.map(function (c) {
          if (!String(c.libelle || '').trim()) throw new Error('Chaque donnée doit avoir un nom.');
          if (c.type === 'liste' && !(c.choix || []).length) throw new Error('« ' + c.libelle + ' » : indiquez les choix proposés.');
          var x = { id: c.id, libelle: c.libelle.trim(), type: c.type }; if (c.type === 'liste') x.choix = c.choix; if (c.actif === false) x.actif = false; return x;
        });
        if (cs.length) valeur.champs = cs;
        await U.enregistrerConfig([['vehicules', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { VEHICULE: 'Véhicules : véhicule', PRET: 'Véhicules : prêt ou mise à disposition', RESERVATION: 'Véhicules : réservation', SIGNALEMENT: 'Véhicules : signalement', SIGNALEMENT_FAIT: 'Véhicules : signalement fait' };
  function resume(e) {
    var d = e.data || {}, vh = function (id) { return V.libelleVehicule(st().vehicules[id]); };
    switch (e.type) {
      case 'VEHICULE': return d.supprime ? 'Véhicule retiré du parc : ' + vh(d.id) : 'Véhicule ' + (d.nom ? '« ' + d.nom + ' »' : vh(d.id)) + (d.service ? ' — ' + U.libService(d.service) : '') + (d.actif === false ? ' (hors service)' : '');
      case 'PRET': return d.supprime ? 'Prêt supprimé (' + vh(d.vehicule) + ')' : (d.mode === 'pret' ? 'Prêt de ' : 'Mise à disposition de ') + vh(d.vehicule) + ' à ' + ((d.services || []).length ? d.services.map(U.libService).join(', ') : 'tous les services') + ' ' + V.libPeriode(d);
      case 'RESERVATION': var r = st().reservations[d.id] || d;
        var nat = d.statut === 'pre' ? 'Pré-réservation' : 'Réservation';
        return d.annulee ? nat + ' annulée : ' + vh(r.vehicule) + (r.debut ? ' ' + quand(r) : '') + (d.motifAnnulation ? ' (' + d.motifAnnulation + ')' : '') : nat + ' de ' + vh(d.vehicule || r.vehicule) + (d.debut ? ' ' + quand(d) : '') + (d.service ? ' — ' + U.libService(d.service) : '') + (d.lien ? ' (depuis l’agenda)' : '') + (d.motif ? ' : ' + d.motif : '') +
          ((d.supplante || []).length ? ' — forcée sur ' + d.supplante.length + ' pré-réservation(s)' : '');
      case 'SIGNALEMENT': return 'Signalement « ' + libSignalement(d.type) + ' » — ' + vh(d.vehicule) + (d.texte ? ' : ' + d.texte : '');
      case 'SIGNALEMENT_FAIT': var sg = st().signalements[d.signalement]; return (d.annule ? 'Signalement remis à faire' : 'Signalement fait') + (sg ? ' : « ' + libSignalement(sg.type) + ' » — ' + vh(sg.vehicule) : '');
    }
    return e.type;
  }

  SIC.modules.completerInterface('vehicules', {
    vues: { parc: vueParc, planning: vuePlanning, signalements: vueSignalements },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le véhicule ou la réservation revient à son état précédent.'; } },
    admin: { onglets: function () { return [['vehicules', 'Véhicules', [panneauReglages()]]]; } },
    // Onglet Informations de la messagerie (0.23.0, réglage de l'établissement) : pré-réservations remplacées
    informations: function () {
      try {
        return mesAvis().map(function (a) {
          var p = a.preReservation, f = a.reservationForcee, v = p && st().vehicules[p.vehicule];
          return { id: 've-' + a.id, niveau: 'warn', titre: 'Pré-réservation remplacée : ' + (v ? v.nom : 'véhicule') + (p && p.motif ? ' — ' + p.motif : ''),
            detail: p ? 'Prévue le ' + new Date(p.debut).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '', ouvrir: f ? function () { modaleReservation(f); } : null, vu: function () { return marquerVus([a.id]); } };
        });
      } catch (e) { return []; }
    },
    pastille: function () { try { return mesAvis().length + V.signalementsOuverts(st()).filter(function (sg) { return V.vehiculesPour(st(), U.services().map(function (x) { return x.code; })).some(function (v) { return v.id === sg.vehicule; }); }).length; } catch (e) { return 0; } }
  });
  U.vehicules = { modaleReservation: modaleReservation, mesAvis: mesAvis };
})();
