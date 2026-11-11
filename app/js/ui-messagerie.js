// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Messagerie — interface (0.23.0, maquette validée le 11 novembre 2026). Logique : module-messagerie.js.
 * Onglets : Reçus, Envoyés, Informations (rappels des autres modules, activés par l'établissement), Archives, Journal.
 * Liste à gauche, message ouvert à droite ; nouveau message dans une fenêtre ; éléments rattachés des autres modules
 * (lus à la volée, détail réservé aux agents qui ont accès au module) ; pièces jointes (option de l'établissement).
 * « Envoyer par message » depuis un élément d'un autre module : U.messagerie.bouton(module, genre, id, service).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, MS = SIC.messagerie, G = SIC.groupes;
  var selection = { recus: null, envoyes: null, archives: null }, filtre = 'tous', recherche = '', luEnCours = {};

  function s() { return U.App.session; }
  function brut() { return (s() && s().etatModule('messagerie')) || { messages: {} }; }
  // Messages chiffrés pour leurs seuls destinataires (0.24.0) : contenu ouvert par la session (clés de l'agent), gardé
  // en mémoire le temps de la session ; `false` : aucune clé de l'agent n'ouvre le message
  var ouverts = {}, reps = {}, cacheDe = null, ouvertureEnCours = false;
  function viderCache() { ouverts = {}; reps = {}; }
  async function dechiffrer() {
    if (ouvertureEnCours) return;
    ouvertureEnCours = true;
    var change = false;
    try {
      var b = brut(), ids = Object.keys(b.messages).filter(function (k) { return b.messages[k].chiffre; });
      for (var i = 0; i < ids.length; i++) {
        var m = b.messages[ids[i]];
        if (ouverts[m.id] === undefined) { var p = null; try { p = await s().ouvrirMessage(m.id, m.chiffre); } catch (e) { p = null; } ouverts[m.id] = p || false; change = true; }
        if (!ouverts[m.id]) continue;
        for (var j = 0; j < m.reponsesListe.length; j++) {
          var r = m.reponsesListe[j], cle = m.id + '|' + r.id;
          if (!r.chiffre || reps[cle] !== undefined) continue;
          var t = null; try { t = await s().dechiffrerPourMessage(m.id, r.chiffre, 'r:' + r.id); } catch (e) { t = null; }
          reps[cle] = t ? t.texte || '' : false; change = true;
        }
      }
    } finally { ouvertureEnCours = false; }
    if (change) U.rendreContenu();
  }
  /** Fusionne un contenu ouvert dans un message (objet, texte, éléments, pièces, libellés du sondage). */
  function fusionner(m, p) {
    var x = Object.assign({}, m, { chiffreLisible: !!p });
    if (p) {
      x.objet = p.objet || ''; x.texte = p.texte || ''; x.rattaches = p.rattaches || []; x.pieces = p.pieces || [];
      if (m.sondage && p.sondage) x.sondage = Object.assign({}, m.sondage, { question: p.sondage.question || '', options: m.sondage.options.map(function (o) { return Object.assign({}, o, (p.sondage.options || []).filter(function (y) { return y.id === o.id; })[0] || {}); }) });
    } else { x.objet = p === false ? 'Message chiffré' : 'Message chiffré (ouverture…)'; x.texte = ''; x.illisible = p === false; }
    x.reponsesListe = m.reponsesListe.map(function (r) {
      if (!r.chiffre) return r;
      var t = reps[m.id + '|' + r.id];
      return Object.assign({}, r, { texte: typeof t === 'string' ? t : t === false ? '(réponse chiffrée illisible)' : '…' });
    });
    return x;
  }
  /** État du module avec le contenu des messages chiffrés que l'agent peut ouvrir. */
  function st() {
    var b = brut(), res = { messages: {} }, manque = false, qui = s() && s().utilisateur ? s().utilisateur.id : null;
    if (qui !== cacheDe) { viderCache(); cacheDe = qui; }
    Object.keys(b.messages).forEach(function (k) {
      var m = b.messages[k];
      if (!m.chiffre) { res.messages[k] = m; return; }
      if (ouverts[k] === undefined || (ouverts[k] && m.reponsesListe.some(function (r) { return r.chiffre && reps[k + '|' + r.id] === undefined; }))) manque = true;
      res.messages[k] = fusionner(m, ouverts[k]);
    });
    if (manque) setTimeout(dechiffrer, 0);
    return res;
  }
  function moi() { return s().compteEffectif(); }
  function mesGroupes() { try { return G.de(U.config(), moi().id); } catch (e) { return []; } }
  function compte() { return Object.assign({ groupes: mesGroupes() }, MS.normaliser(moi(), U.config())); }
  function comptes() { return (s().comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours'; }); }
  function opts(service) { return MS.options(U.config(), service); }
  function encadrement() { var r = s().roles(); return r.indexOf('CADRE') >= 0 || r.indexOf('ADMIN') >= 0; }
  function admin() { return s().roles().indexOf('ADMIN') >= 0; }
  /** Suivi des lectures : l'auteur, et le cadre (ou l'administrateur) d'un service concerné par le message. */
  function cadreDuMessage(m) { var c = compte(); return encadrement() && (m.services || []).some(function (x) { return (c.services || []).indexOf(x) >= 0; }); }
  function peutEcrire() { return s().peut('MESSAGE') && !s().apercu; }
  function dateHeure(iso) { var d = new Date(Date.parse(iso)); return d.toLocaleDateString('fr-FR') + ' à ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function jourFr(j) { return String(j || '').split('-').reverse().join('/'); }
  function court(iso) {
    var d = new Date(Date.parse(iso)), auj = new Date();
    return d.toDateString() === auj.toDateString() ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function taille(o) { return o < 1024 ? o + ' o' : o < 1048576 ? Math.round(o / 1024) + ' Ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }
  function libRole(r) { try { return SIC.modules.obtenir('messagerie').droits.libRole(U.config(), r); } catch (e) { return r; } }
  function libDest(d) {
    switch (d.genre) {
      case 'agent': return d.nom || s().nomAuteur(d.code);
      case 'groupe': return 'Groupe : ' + G.libelle(U.config(), d.code);
      case 'role': return 'Rôle : ' + libRole(d.code) + ' (' + U.libService(d.service) + ')';
      case 'service': return 'Service : ' + U.libService(d.code);
      case 'etablissement': return 'Tout l’établissement';
    }
    return '';
  }
  function libDestinataires(m) { return m.destinataires.map(libDest).join(', '); }

  // ------------------------------------------------------------ Éléments rattachés (adaptateurs par module)
  function mesServicesModule(id) {
    try { var m = SIC.modules.obtenir(id); return admin() ? U.tousServices().map(function (x) { return x.code; }) : m.droits.servicesDe(moi(), U.config()); } catch (e) { return []; }
  }
  /** L'agent a-t-il accès à l'élément (clé du module, service de l'élément parmi les siens) ? */
  function accesElement(r) {
    if (!r || !s().detientCle || !s().detientCle(r.module)) return false;
    return !r.service || mesServicesModule(r.module).indexOf(r.service) >= 0;
  }
  function etat(id) { try { return s().etatModule(id) || null; } catch (e) { return null; } }
  function patients() { return (U.st() && U.st().patients) || {}; }
  var ADAPT = {
    salles: {
      lister: function () {
        var e = etat('salles'), auj = SIC.salles ? SIC.salles.jourISO(Date.now()) : '';
        if (!e) return [];
        return Object.keys(e.reservations).map(function (k) { return e.reservations[k]; }).filter(function (r) { return !r.annulee && (r.jour >= auj || (r.repetition && r.repetition.type === 'semaine')); })
          .map(function (r) { var x = e.salles[r.salle]; return { genre: 'reservation', id: r.id, service: (x && x.service) || r.service, quand: Date.parse(r.jour) || 0 }; });
      },
      resoudre: function (r) {
        var e = etat('salles'), x = e && e.reservations[r.id]; if (!x || x.annulee) return null;
        var sa = e.salles[x.salle];
        return { titre: 'Salle : ' + (sa ? sa.nom : 'salle') + ' — ' + (x.titre || ''), detail: jourFr(x.jour) + ' ' + x.de + '–' + x.a + (x.repetition && x.repetition.type === 'semaine' ? ' (répétée)' : '') };
      },
      ouvrir: function () { U.ouvrirFenetre('salles'); }
    },
    agenda: {
      lister: function () {
        var e = etat('agenda'), now = Date.now(), res = [];
        if (!e) return res;
        Object.keys(e.rdv).forEach(function (k) { var r = e.rdv[k]; if (!r.supprime && (r.regularite && r.regularite.type && r.regularite.type !== 'aucune' || r.fin >= now - 7 * 864e5)) res.push({ genre: 'evenement', id: r.id, service: r.service, quand: r.debut }); });
        Object.keys(e.taches).forEach(function (k) { var t = e.taches[k]; if (!t.supprime) res.push({ genre: 'tache', id: t.id, service: t.service, quand: Date.parse(t.debut) || 0 }); });
        return res.sort(function (a, b) { return b.quand - a.quand; });
      },
      resoudre: function (r) {
        var e = etat('agenda'); if (!e) return null;
        if (r.genre === 'tache') { var t = e.taches[r.id]; return t && !t.supprime ? { titre: 'Tâche : ' + (t.titre || ''), detail: (t.debut ? 'à partir du ' + jourFr(t.debut) : '') + (t.heure ? ' à ' + t.heure : '') + (t.consigne ? ' — ' + t.consigne : '') } : null; }
        var x = e.rdv[r.id], I = U.agendaInt;
        return x && !x.supprime ? { titre: (I ? I.libelleElement(x) : x.titre || 'Événement'), detail: (x.debut ? dateHeure(new Date(x.debut).toISOString()) : '') + (x.lieu ? ' — ' + x.lieu : '') } : null;
      },
      ouvrir: function (r) {
        var e = etat('agenda');
        if (r.genre === 'evenement' && e && e.rdv[r.id] && U.agenda) U.agenda.modaleElement(e.rdv[r.id], null, !s().peut('RDV'), null, false);
        else U.ouvrirFenetre('agenda');
      }
    },
    vehicules: {
      lister: function () {
        var e = etat('vehicules'), now = Date.now();
        if (!e) return [];
        return Object.keys(e.reservations).map(function (k) { return e.reservations[k]; }).filter(function (r) { return !r.annulee && !r.supplantee && r.fin >= now - 7 * 864e5; })
          .map(function (r) { var v = e.vehicules[r.vehicule]; return { genre: 'reservation', id: r.id, service: r.service || (v && v.service), quand: r.debut }; }).sort(function (a, b) { return a.quand - b.quand; });
      },
      resoudre: function (r) {
        var e = etat('vehicules'), x = e && e.reservations[r.id]; if (!x || x.annulee) return null;
        var v = e.vehicules[x.vehicule];
        return { titre: 'Réservation : ' + (v ? v.nom : 'véhicule') + (x.motif ? ' — ' + x.motif : ''), detail: new Date(x.debut).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' – ' + new Date(x.fin).toLocaleTimeString('fr-FR', { timeStyle: 'short' }) };
      },
      ouvrir: function (r) { var e = etat('vehicules'); if (e && e.reservations[r.id] && U.vehicules) U.vehicules.modaleReservation(e.reservations[r.id]); else U.ouvrirFenetre('vehicules'); }
    },
    travaux: {
      lister: function () {
        var e = etat('travaux'); if (!e) return [];
        return SIC.travaux.demandes(e, U.config(), mesServicesModule('travaux'), Date.now(), {}).map(function (t) { return { genre: 'demande', id: t.id, service: t.service, quand: Date.parse(t.cree) }; });
      },
      resoudre: function (r) {
        var e = etat('travaux'), t = e && e.demandes[r.id], T = SIC.travaux; if (!t) return null;
        return { titre: 'Demande de travaux : ' + T.lib(T.options(U.config(), t.service).types, t.type) + ' — ' + T.libLieu(t, U.config()), detail: T.ETAPES[t.etat] + ' — demandée le ' + new Date(Date.parse(t.cree)).toLocaleDateString('fr-FR') };
      },
      ouvrir: function (r) { var e = etat('travaux'); if (e && e.demandes[r.id] && U.travaux) U.travaux.modaleDemande(e.demandes[r.id]); else U.ouvrirFenetre('travaux'); }
    },
    suivi: {
      lister: function () {
        var e = etat('suivi'); if (!e) return [];
        return Object.keys(e.suivis).map(function (k) { return e.suivis[k]; }).filter(function (x) { return !x.supprime; }).map(function (x) { return { genre: 'suivi', id: x.id, service: x.service, quand: Date.parse(x.date) || 0 }; })
          .sort(function (a, b) { return b.quand - a.quand; }).slice(0, 60);
      },
      resoudre: function (r) {
        var e = etat('suivi'), x = e && e.suivis[r.id]; if (!x || x.supprime) return null;
        var quoi = { entretien: 'Entretien médical', contrat: 'Réévaluation du contrat de soins', lesdeux: 'Entretien et réévaluation du contrat' }[x.quoi] || 'Suivi médical';
        var p = patients()[x.patient];
        return { titre: quoi + ' du ' + jourFr(x.date), detail: (x.medecin || '') + (p ? ' — ' + SIC.suivi.identite(p, Date.now()) : '') };
      },
      ouvrir: function () { U.ouvrirFenetre('suivi'); }
    },
    patients: {
      lister: function () {
        var f = patients();
        return Object.keys(f).map(function (k) { return f[k]; }).filter(function (p) { return p && !p.supprime && !p.fusionneDans; }).map(function (p) { return { genre: 'fiche', id: p.id, service: p.service, quand: 0, nom: SIC.suivi.identite(p, Date.now()) }; })
          .sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
      },
      resoudre: function (r) { var p = patients()[r.id]; return p ? { titre: 'Fiche patient : ' + SIC.suivi.identite(p, Date.now()), detail: U.libService(p.service || r.service) } : null; },
      ouvrir: function (r) { var p = patients()[r.id]; if (p && U.fichePatient) U.fichePatient.modale(p); else U.ouvrirFenetre('patients'); }
    }
  };
  /** Ligne d'un élément rattaché : détail et « Ouvrir » si l'agent y a accès, sinon « (accès réservé) » sans aucun détail. */
  function ligneRattache(r, retirer) {
    var lib = MS.RATTACHABLES[r.module] || r.module, acces = accesElement(r), x = null;
    if (acces) { try { x = ADAPT[r.module].resoudre(r); } catch (e) { x = null; } }
    return h('div', { class: 'ms-rattache' + (acces ? '' : ' reserve') },
      h('span', { class: 'ms-module ms-module-' + r.module, text: lib }),
      acces ? (x ? h('span', { class: 'ms-rattache-texte' }, h('b', { text: x.titre }), x.detail ? h('small', { class: 'muted', text: x.detail }) : null)
        : h('span', { class: 'muted', text: 'Élément supprimé ou introuvable' }))
        : h('span', { class: 'muted', text: 'Élément de ' + lib + ' (accès réservé)' }),
      acces && x && !retirer ? h('button', { class: 'btn petit', type: 'button', onclick: function () { ADAPT[r.module].ouvrir(r); } }, 'Ouvrir') : null,
      retirer ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer', onclick: retirer }, '✕') : null);
  }
  /** Choix d'un élément à rattacher : module, puis élément (seulement ceux auxquels l'agent a accès). */
  function modaleRattacher(puis) {
    var mods = Object.keys(MS.RATTACHABLES).filter(function (k) { return s().detientCle && s().detientCle(k); });
    if (!mods.length) { alert('Vous n’avez accès à aucun module dont on peut rattacher un élément.'); return; }
    var selM = h('select', { 'aria-label': 'Module' }, mods.map(function (k) { return h('option', { value: k, text: MS.RATTACHABLES[k] }); }));
    var zone = h('div', { class: 'pile ms-choix-elements' }), choisi = null, filtreTxt = h('input', { type: 'search', placeholder: 'Filtrer', 'aria-label': 'Filtrer les éléments' });
    function dessiner() {
      U.vider(zone); choisi = null;
      var l = [];
      try { l = ADAPT[selM.value].lister().map(function (x) { return Object.assign({ module: selM.value }, x); }).filter(accesElement); } catch (e) { l = []; }
      var q = filtreTxt.value.toLowerCase().trim();
      var items = l.map(function (x) { var r = ADAPT[x.module].resoudre(x); return r ? { x: x, r: r } : null; }).filter(Boolean)
        .filter(function (y) { return !q || (y.r.titre + ' ' + (y.r.detail || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 80);
      if (!items.length) { zone.appendChild(h('p', { class: 'muted', text: 'Aucun élément.' })); return; }
      items.forEach(function (y) {
        var rb = h('input', { type: 'radio', name: 'ms-element', onchange: function () { choisi = y.x; } });
        zone.appendChild(h('label', { class: 'case' }, rb, h('span', {}, h('b', { text: y.r.titre }), y.r.detail ? h('small', { class: 'muted', text: ' — ' + y.r.detail }) : null)));
      });
    }
    selM.addEventListener('change', dessiner); filtreTxt.addEventListener('input', dessiner);
    dessiner();
    setTimeout(function () {
      U.modale('Rattacher un élément', h('div', { class: 'pile' }, h('label', {}, 'Module', selM), filtreTxt, zone,
        h('small', { class: 'muted', text: 'Seul un lien est enregistré : les destinataires qui n’ont pas accès au module voient « accès réservé », sans aucun détail.' })),
      [{ texte: 'Annuler' }, { texte: 'Rattacher', classe: 'primaire', action: function () { if (!choisi) throw new Error('Choisissez un élément.'); puis({ module: choisi.module, genre: choisi.genre, id: choisi.id, service: choisi.service || '' }); } }]);
    }, 0);
  }

  // ------------------------------------------------------------ Pièces jointes
  async function ouvrirPiece(m, p) {
    var w = null, affiche = MS.affichable(p);
    if (!affiche && !confirm('« ' + p.nom + ' » ne peut pas être affiché dans l’application : il va être téléchargé sur ce poste et sortira du coffre chiffré. Ne le gardez pas au-delà du nécessaire. Continuer ?')) return;
    if (affiche === 'application/pdf') w = window.open('', '_blank');
    try {
      var o = await s().lirePiece('messagerie', p.id);
      if (!o) throw new Error('Fichier introuvable (supprimé après la durée de conservation, ou pas encore copié depuis un autre poste).');
      if (m.chiffre) { o = await s().dechiffrerPourMessage(m.id, o, 'pj:' + p.n); if (!o) throw new Error('Pièce jointe chiffrée : ouvrez d’abord le message.'); }
      if (!affiche) { U.telechargerOctets(p.nom, o, 'application/octet-stream'); return; }
      if (affiche === 'application/pdf') { var url = URL.createObjectURL(new Blob([o], { type: affiche })); if (w) w.location = url; else U.telechargerOctets(p.nom, o, affiche); return; }
      // Image : affichée dans une fenêtre de l'application (adresse data:, permise par la politique de sécurité)
      var b = ''; for (var i = 0; i < o.length; i += 32768) b += String.fromCharCode.apply(null, o.subarray(i, i + 32768));
      U.modale(p.nom, h('img', { class: 'ms-image', src: 'data:' + affiche + ';base64,' + btoa(b), alt: p.nom }), [{ texte: 'Fermer' }], { large: true });
    } catch (e) { if (w) w.close(); alert(e.message); }
  }
  function puce(p, retirer, m) {
    var e = MS.ext(p.nom).toUpperCase();
    return h('span', { class: 'ms-piece' }, h('b', { text: e || 'FICHIER' }), h('span', { text: p.nom }), h('small', { class: 'muted', text: taille(+p.taille || 0) }),
      m ? h('button', { class: 'btn petit', type: 'button', onclick: function () { ouvrirPiece(m, p); } }, MS.affichable(p) ? 'Afficher' : 'Télécharger…') : null,
      retirer ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer', onclick: retirer }, '✕') : null);
  }

  // ------------------------------------------------------------ Liste et lecture
  function lecture(m) {
    // Ouverture : lecture enregistrée (une fois, puis à nouveau seulement s'il y a des réponses nouvelles)
    if (s().apercu || m.retire || luEnCours[m.id]) return;
    var c = moi(), l = m.lectures[c.id], auteur = m.par === c.id;
    if (auteur && !m.situation.nouvellesReponses) return;
    if (!auteur && l && !m.situation.nouvellesReponses) return;
    luEnCours[m.id] = true;
    s().enregistrer('MESSAGE_LU', { message: m.id }).catch(function () { /* lecture non enregistrée : sans conséquence */ }).then(function () { setTimeout(function () { delete luEnCours[m.id]; U.rendreContenu(); }, 0); });
  }
  async function ecrire(type, data, msg) { try { await s().enregistrer(type, data); if (msg) U.toast(msg); U.rendreContenu(); } catch (e) { alert(e.message); } }
  function badges(m) {
    var si = m.situation;
    return h('div', { class: 'ms-badges' },
      m.retire ? h('span', { class: 'badge bad', text: 'Retiré' }) : null,
      m.chiffre ? h('span', { class: 'badge iso', text: 'Chiffré pour les destinataires' }) : null,
      m.important ? h('span', { class: 'badge bad', text: 'Important' }) : null,
      m.accuse === 'confirmer' ? h('span', { class: 'badge', text: si.aConfirmer ? 'Lecture à confirmer' : 'Accusé de lecture demandé' }) : null,
      si.relance ? h('span', { class: 'badge warn', text: 'Relancé' }) : null,
      m.sondage ? h('span', { class: 'badge' + (si.aVoter ? ' warn' : ''), text: si.aVoter ? 'Sondage à remplir' : MS.sondageOuvert(m, Date.now()) ? 'Sondage ouvert' : 'Sondage clos' }) : null,
      h('span', { class: 'badge', text: 'Réponses : ' + MS.REPONSES[m.reponses].toLowerCase() }),
      m.jusquau ? h('span', { class: 'badge', text: 'Affiché jusqu’au ' + jourFr(m.jusquau) }) : null);
  }
  function ligneListe(m, onglet) {
    var si = m.situation, actif = selection[onglet] === m.id;
    return h('button', { type: 'button', class: 'ms-ligne' + (actif ? ' actif' : '') + (si.nonLu || si.aConfirmer ? ' non-lu' : '') + (m.important ? ' important' : '') + (m.retire ? ' retire' : ''),
      'aria-current': actif ? 'true' : null, onclick: function () { selection[onglet] = m.id; U.rendreContenu(); } },
      h('span', { class: 'ms-ligne-tete' }, h('b', { text: onglet === 'envoyes' ? 'À : ' + libDestinataires(m) : (m.nom || s().nomAuteur(m.par)) }), h('small', { class: 'muted', text: court(m.cree) })),
      h('span', { class: 'ms-ligne-objet', text: (m.important ? '! ' : '') + m.objet }),
      h('small', { class: 'muted ms-ligne-apercu', text: m.texte.slice(0, 90) }),
      h('span', { class: 'ms-ligne-marques' },
        si.aConfirmer ? h('span', { class: 'badge bad', text: 'À confirmer' }) : null,
        si.relance ? h('span', { class: 'badge warn', text: 'Relancé' }) : null,
        si.aVoter ? h('span', { class: 'badge warn', text: 'Sondage à remplir' }) : m.sondage ? h('span', { class: 'badge', text: 'Sondage' }) : null,
        si.nouvellesReponses ? h('span', { class: 'badge', text: si.nouvellesReponses + ' réponse' + (si.nouvellesReponses > 1 ? 's' : '') + ' nouvelle' + (si.nouvellesReponses > 1 ? 's' : '') }) : null,
        m.pieces.length ? h('span', { class: 'badge', text: m.pieces.length + ' PJ' }) : null,
        m.rattaches.length ? h('span', { class: 'badge', text: m.rattaches.length + ' élément' + (m.rattaches.length > 1 ? 's' : '') }) : null));
  }
  function sectionSuivi(m) {
    var r = MS.suiviLectures(m, comptes(), U.config()), attendus = r.confirmes.length + r.ouverts.length + r.nonOuverts.length;
    var conf = m.accuse === 'confirmer';
    function liste(titre, l, classe) {
      return l.length ? h('details', { class: 'ms-suivi-groupe' }, h('summary', {}, h('span', { class: 'badge ' + (classe || ''), text: l.length }), ' ' + titre),
        h('p', { class: 'muted', text: l.map(function (c) { return c.nom || c.id; }).join(', ') })) : null;
    }
    var aRelancer = r.nonOuverts.length + r.ouverts.length;
    return h('section', { class: 'ms-suivi', 'aria-label': 'Suivi des lectures' },
      h('div', { class: 'barre' }, h('b', { text: 'Suivi des lectures' }), h('small', { class: 'muted', text: ' visible par l’auteur et le cadre' }), h('div', { class: 'espace' }),
        h('small', { text: (attendus ? Math.round(100 * r.confirmes.length / attendus) : 0) + ' % ' + (conf ? 'confirmé' : 'lu') })),
      liste(conf ? 'ont confirmé la lecture' : 'ont lu', r.confirmes, 'ok'),
      conf ? liste('ont ouvert sans confirmer', r.ouverts, 'warn') : null,
      liste('n’ont pas ouvert', r.nonOuverts, 'bad'),
      r.sansCompte.length ? h('p', { class: 'muted' }, h('small', { text: r.sansCompte.length + ' membre(s) de groupe sans compte, non joignable(s) : ' + r.sansCompte.map(function (x) { return x.nom || x.id; }).join(', ') })) : null,
      aRelancer && !m.retire && !s().apercu ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { ecrire('MESSAGE_RELANCE', { message: m.id }, 'Relance envoyée à ' + aRelancer + ' agent(s).'); } },
        aRelancer > 1 ? 'Relancer les ' + aRelancer + ' agents' : 'Relancer l’agent')) : null,
      m.relances.length ? h('small', { class: 'muted', text: 'Relancé ' + m.relances.map(function (x) { return 'le ' + dateHeure(x.le); }).join(', ') }) : null);
  }
  function envoyerReponse(d) { ecrire('MESSAGE_REPONSE', d, d.a ? 'Réponse envoyée à ' + (d.nomA || 'l’agent') + ' seulement.' : 'Réponse envoyée.'); }
  function sectionReponses(m) {
    var c = moi(), auteur = m.par === c.id, rs = MS.reponsesVisibles(m, c), z = h('section', { class: 'pile ms-reponses', 'aria-label': 'Réponses' });
    if (m.reponses === 'aucune') return rs.length ? z : null;
    z.appendChild(h('b', {}, 'Réponses (' + rs.length + ') ', h('small', { class: 'muted', text: '— ' + (m.reponses === 'tous' ? 'visibles par tous les destinataires' : 'chaque réponse n’est visible que par l’auteur') + ' ; l’auteur répond au groupe ou à un seul agent' })));
    // Auteur : « À tous les destinataires » ou à l'un des agents qui ont répondu
    var dest = null, t = null;
    rs.forEach(function (r) {
      var lib = (r.nom || s().nomAuteur(r.par)) + (r.a ? ' → ' + (r.a === c.id ? 'vous seulement' : (r.nomA || s().nomAuteur(r.a)) + ' seulement') : '') + ' — ' + dateHeure(r.le);
      z.appendChild(h('div', { class: 'ms-reponse' + (r.par === c.id ? ' mienne' : '') + (r.a ? ' individuelle' : '') }, h('small', { class: 'muted', text: lib }), h('p', { class: 'ms-texte', text: r.texte })));
    });
    if (!m.retire && !s().apercu && s().peut('MESSAGE_REPONSE')) {
      var vus = {}, repondants = rs.filter(function (r) { return r.par !== c.id && !vus[r.par] && (vus[r.par] = 1); });
      dest = auteur ? h('select', { 'aria-label': 'Destinataire de la réponse' }, [h('option', { value: '', text: 'À tous les destinataires' })]
        .concat(repondants.map(function (r) { return h('option', { value: r.par, text: 'À ' + (r.nom || s().nomAuteur(r.par)) + ' seulement' }); }))) : null;
      t = h('textarea', { rows: 2, maxlength: 2000, placeholder: auteur ? 'Votre réponse' : m.reponses === 'tous' ? 'Répondre à tous' : 'Répondre à l’auteur', 'aria-label': 'Votre réponse' });
      // Boutons « Répondre à … seulement » : ajoutés maintenant que le choix existe
      if (auteur) Array.prototype.forEach.call(z.querySelectorAll('.ms-reponse'), function (el, i) {
        var r = rs[i]; if (r.par === c.id) return;
        el.appendChild(h('button', { class: 'btn lien', type: 'button', onclick: function () { dest.value = r.par; t.focus(); } }, 'Répondre à ' + (r.nom || s().nomAuteur(r.par)) + ' seulement'));
      });
      z.appendChild(h('div', { class: 'ms-repondre' }, dest ? h('div', { class: 'pile ms-repondre-champ' }, dest, t) : t, h('button', { class: 'btn primaire', type: 'button', onclick: function () {
        if (!t.value.trim()) return;
        var d = { message: m.id, id: 'R' + SIC.crypto.hex(SIC.crypto.aleatoire(5)), texte: t.value.trim(), nom: moi().nom };
        if (dest && dest.value) { d.a = dest.value; var r0 = repondants.filter(function (r) { return r.par === dest.value; })[0]; d.nomA = r0 ? r0.nom || '' : ''; }
        // Message chiffré : la réponse l'est avec la clé du message (ouverte par l'agent)
        if (m.chiffre) { var clair = d.texte; d.texte = ''; reps[m.id + '|' + d.id] = clair; s().chiffrerPourMessage(m.id, { texte: clair }, 'r:' + d.id).then(function (c0) { d.chiffre = c0; envoyerReponse(d); }).catch(function (e) { alert(e.message); }); return; }
        envoyerReponse(d);
      } }, 'Envoyer')));
    }
    return z;
  }
  var JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function libOption(o, sd) {
    if (sd.genre !== 'dates') return o.libelle;
    var p = String(o.jour || '').split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return JOURS_C[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0') + (o.heure ? ' ' + o.heure.replace(/^0?(\d+):(\d\d)$/, function (x, hh, mm) { return hh + ' h' + (mm === '00' ? '' : ' ' + mm); }) : '') + (o.libelle ? ' — ' + o.libelle : '');
  }
  /** Sondage : vote (ou modification du vote) tant qu'il est ouvert, résultats selon leur visibilité, participation, clôture. */
  function sectionSondage(m) {
    var sd = m.sondage, c = compte(), r = MS.resultats(m, c, Date.now()), auteur = m.par === c.id, z = h('section', { class: 'ms-sondage pile', 'aria-label': 'Sondage' });
    z.appendChild(h('div', { class: 'barre' }, h('b', { text: 'Sondage' + (sd.question ? ' : ' + sd.question : '') }), h('div', { class: 'espace' }),
      h('small', { class: 'muted', text: [MS.GENRES_SONDAGE[sd.genre].replace(/ \(.*/, ''), sd.resultats === 'public' ? 'résultats publics' : 'résultats visibles par l’auteur seulement', sd.anonyme ? 'noms masqués' : '',
        r.ouvert ? (sd.cloture ? 'clos le ' + jourFr(sd.cloture) + ' au soir' : 'ouvert') : 'clos' + (sd.close ? ' le ' + dateHeure(sd.close.le) : '')].filter(Boolean).join(' · ') })));
    var peutVoter = r.ouvert && !s().apercu && s().peut('VOTE') && MS.concerne(m, c, c.groupes);
    if (peutVoter && (!auteur || sd.genre === 'dates')) {
      var choix = (r.monVote && r.monVote.choix) || [], multiple = sd.genre !== 'unique', entrees = [];
      var cases = sd.options.map(function (o) {
        var inp = h('input', { type: multiple ? 'checkbox' : 'radio', name: 'vote-' + m.id, value: o.id, checked: choix.indexOf(o.id) >= 0 });
        entrees.push(inp);
        return h('label', { class: 'case' }, inp, h('span', { text: libOption(o, sd) }));
      });
      var autre = sd.autre ? h('input', { type: 'text', maxlength: 200, value: (r.monVote && r.monVote.autre) || '', placeholder: 'Autre (précisez)', 'aria-label': 'Autre réponse' }) : null;
      z.appendChild(h('div', { class: 'pile ms-vote' }, cases, autre,
        h('div', { class: 'actions gauche' }, h('button', { class: 'btn primaire', type: 'button', onclick: function () {
          var ch = entrees.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
          ecrire('VOTE', { message: m.id, choix: ch, autre: autre ? autre.value.trim() : '', nom: moi().nom }, r.monVote ? 'Vote modifié.' : 'Vote enregistré.');
        } }, r.monVote ? 'Modifier mon vote' : 'Voter'),
          r.monVote ? h('small', { class: 'muted', text: 'Vous avez voté le ' + dateHeure(r.monVote.le) + ' ; vous pouvez changer jusqu’à la clôture.' }) : null),
        sd.anonyme ? h('small', { class: 'muted', text: 'Noms masqués à l’écran, y compris pour l’auteur. Chaque vote reste au journal au nom de son auteur, comme toute saisie.' }) : null));
    } else if (r.monVote) z.appendChild(h('small', { class: 'muted', text: 'Votre vote : ' + sd.options.filter(function (o) { return r.monVote.choix.indexOf(o.id) >= 0; }).map(function (o) { return libOption(o, sd); }).concat(r.monVote.autre ? ['Autre : ' + r.monVote.autre] : []).join(', ') }));
    if (r.visibles) {
      z.appendChild(h('div', { class: 'ms-resultats' }, r.options.map(function (o) {
        var pct = r.votants ? Math.round(100 * o.n / r.votants) : 0, barre = h('span', { class: 'ms-barre' + (o.n && o.n === r.max ? ' tete' : '') });
        barre.style.width = pct + '%';
        return h('div', { class: 'ms-resultat' }, h('span', { class: 'ms-resultat-lib', text: libOption(o, sd) }), h('span', { class: 'ms-barre-fond' }, barre),
          h('span', { class: 'ms-resultat-n', text: o.n + (r.votants ? ' (' + pct + ' %)' : '') }),
          o.noms.length ? h('small', { class: 'muted ms-resultat-noms', text: o.noms.join(', ') }) : null);
      })));
      if (r.autres.length) z.appendChild(h('div', {}, h('small', { class: 'muted', text: 'Autres réponses : ' + r.autres.map(function (a) { return a.texte + (a.nom ? ' (' + a.nom + ')' : ''); }).join(' ; ') })));
      z.appendChild(h('small', { class: 'muted', text: r.votants + ' vote' + (r.votants > 1 ? 's' : '') + (sd.genre !== 'unique' ? ' (plusieurs réponses possibles)' : '') }));
    } else z.appendChild(h('small', { class: 'muted', text: sd.resultats === 'public' ? 'Résultats visibles après votre vote, ou à la clôture.' : 'Résultats visibles par l’auteur seulement.' }));
    if (auteur || cadreDuMessage(m)) {
      var p = MS.participation(m, comptes(), U.config());
      z.appendChild(h('small', { class: 'muted', text: p.ont.length + ' ont voté' + (p.nont.length ? ' ; n’ont pas encore voté : ' + p.nont.map(function (x) { return x.nom || x.id; }).join(', ') : '') + '.' }));
    }
    if ((auteur || admin()) && r.ouvert && !s().apercu) z.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () {
      if (confirm('Clore le sondage maintenant ? Plus personne ne pourra voter.')) ecrire('SONDAGE_CLOTURE', { message: m.id }, 'Sondage clos.');
    } }, 'Clore le sondage')));
    return z;
  }
  function lecteurMessage(m, onglet) {
    var c = moi(), si = m.situation, auteur = m.par === c.id;
    lecture(m);
    var actions = [];
    if (!s().apercu) {
      if (!auteur && !m.retire) actions.push(si.archive ? ['Remettre dans les reçus', function () { ecrire('MESSAGE_ARCHIVE', { message: m.id, archive: false }, 'Message remis dans les reçus.'); }]
        : ['Archiver', function () { selection[onglet] = null; ecrire('MESSAGE_ARCHIVE', { message: m.id }, 'Message archivé.'); }]);
      if (peutEcrire()) actions.push(['Transférer…', function () { modaleNouveau({ objet: 'Tr : ' + m.objet, texte: '\n\n— Message de ' + (m.nom || s().nomAuteur(m.par)) + ' du ' + dateHeure(m.cree) + ' —\n' + m.texte, rattaches: m.rattaches.slice() }); }]);
      if ((auteur || admin()) && !m.retire) actions.push(['Retirer le message…', function () {
        var mo = prompt('Le message disparaîtra des reçus de tous les destinataires (il reste au journal). Motif (facultatif) :', '');
        if (mo !== null) ecrire('MESSAGE_RETRAIT', { message: m.id, motif: mo.trim() }, 'Message retiré.');
      }, 'danger']);
    }
    return h('article', { class: 'ms-lecteur', 'aria-label': 'Message' },
      badges(m),
      h('h2', { class: 'ms-objet', text: m.objet }),
      h('dl', { class: 'ms-entete' }, h('dt', { text: 'De' }), h('dd', { text: m.nom || s().nomAuteur(m.par) }), h('dt', { text: 'À' }), h('dd', { text: libDestinataires(m) }),
        h('dt', { text: 'Envoyé' }), h('dd', { text: 'le ' + dateHeure(m.cree) + (m.jusquau ? ' · affiché jusqu’au ' + jourFr(m.jusquau) : '') })),
      m.illisible ? h('p', { class: 'alerte', text: 'Message chiffré pour ses seuls destinataires : votre clé n’ouvre pas ce message, ou elle ne vous a pas encore été remise (à la prochaine connexion d’un administrateur après votre arrivée dans le groupe ou le service).' }) : null,
      (m.consultations || []).filter(function (x) { return x.informer; }).map(function (x) {
        return h('p', { class: 'info', text: 'Message consulté par ' + (x.nom || s().nomAuteur(x.par)) + ' le ' + dateHeure(x.le) + ' — motif : ' + x.motif + (x.precision ? ' (' + x.precision + ')' : '') + '.' });
      }),
      m.retire ? h('p', { class: 'alerte', text: 'Message retiré le ' + dateHeure(m.retire.le) + (m.retire.motif ? ' : ' + m.retire.motif : '') + '.' }) : null,
      h('div', { class: 'ms-texte', text: m.texte }),
      m.rattaches.length ? h('section', { class: 'pile ms-section', 'aria-label': 'Éléments rattachés' }, h('b', { text: 'Éléments rattachés (' + m.rattaches.length + ')' }), m.rattaches.map(function (r) { return ligneRattache(r); })) : null,
      m.pieces.length ? h('section', { class: 'pile ms-section', 'aria-label': 'Pièces jointes' }, h('b', { text: 'Pièces jointes (' + m.pieces.length + ')' }),
        h('div', { class: 'ms-pieces' }, m.pieces.map(function (p) { return puce(p, null, m); })),
        h('small', { class: 'muted', text: 'Images et PDF s’affichent sans être enregistrés sur le poste. Les autres fichiers sont téléchargés après avertissement : ils sortent alors du coffre chiffré.' })) : null,
      m.sondage ? sectionSondage(m) : null,
      si.aConfirmer && !s().apercu && !m.retire ? h('div', { class: 'ms-confirmer' }, h('span', { text: m.important ? 'Ce message reste en tête de vos messages tant que vous n’avez pas confirmé l’avoir lu.' : 'L’auteur demande une confirmation de lecture.' }),
        h('button', { class: 'btn primaire', type: 'button', onclick: function () { ecrire('MESSAGE_LU', { message: m.id, confirme: true }, 'Lecture confirmée.'); } }, 'J’ai lu')) : null,
      actions.length ? h('div', { class: 'actions gauche' }, actions.map(function (a) { return h('button', { class: 'btn petit' + (a[2] ? ' ' + a[2] : ''), type: 'button', onclick: a[1] }, a[0]); })) : null,
      auteur || cadreDuMessage(m) ? sectionSuivi(m) : null,
      sectionReponses(m),
      h('p', { class: 'muted ms-pied' }, h('small', { text: 'Information d’organisation : pas de donnée clinique. Conservé ' + opts().conservationMois + ' mois.' })));
  }
  function vueListe(onglet) {
    var c = compte(), maintenant = Date.now();
    var l = MS.liste(st(), c, c.groupes, U.config(), maintenant, onglet, { filtre: filtre, recherche: recherche });
    var tete = onglet === 'recus' ? MS.liste(st(), c, c.groupes, U.config(), maintenant, 'recus').filter(function (m) { return m.situation.enTete; }) : [];
    if (selection[onglet] && !l.some(function (m) { return m.id === selection[onglet]; })) selection[onglet] = null;
    if (!selection[onglet] && l.length) selection[onglet] = (tete[0] || l[0]).id;
    var choisi = l.filter(function (m) { return m.id === selection[onglet]; })[0];
    var champ = h('input', { type: 'search', value: recherche, placeholder: 'Rechercher dans vos messages', 'aria-label': 'Rechercher', oninput: function () { recherche = champ.value; U.rendreContenu(); setTimeout(function () { var x = document.querySelector('.ms-recherche'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); } });
    champ.classList.add('ms-recherche');
    function bf(code, lib) { return h('button', { type: 'button', class: 'btn petit' + (filtre === code ? ' primaire' : ''), 'aria-pressed': filtre === code ? 'true' : 'false', onclick: function () { filtre = code; U.rendreContenu(); } }, lib); }
    return h('div', { class: 'pile' },
      tete.length ? h('div', { class: 'ms-bandeau', role: 'status' }, h('b', { text: tete.length > 1 ? tete.length + ' messages à lire en priorité' : 'Message à lire en priorité' }),
        h('span', { text: ' : ' + tete.map(function (m) { return m.objet; }).join(' · ') })) : null,
      h('div', { class: 'ms-cadre' },
        h('div', { class: 'ms-liste' },
          h('div', { class: 'ms-outils' }, peutEcrire() ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleNouveau(); } }, '+ Nouveau message') : null, champ,
            h('div', { class: 'actions gauche', role: 'group', 'aria-label': 'Filtrer' }, bf('tous', 'Tous'), bf('nonlus', 'Non lus'), bf('importants', 'Importants'), bf('sondages', 'Sondages'))),
          l.length ? h('div', { class: 'ms-lignes' }, l.map(function (m) { return ligneListe(m, onglet); }))
            : h('p', { class: 'muted', text: recherche || filtre !== 'tous' ? 'Aucun message pour cette recherche.' : onglet === 'envoyes' ? 'Aucun message envoyé.' : onglet === 'archives' ? 'Aucun message archivé.' : 'Aucun message reçu.' })),
        h('div', { class: 'ms-lecture' }, choisi ? lecteurMessage(choisi, onglet) : h('p', { class: 'muted', text: 'Choisissez un message.' }))));
  }

  // ------------------------------------------------------------ Consultation tracée d'un message chiffré (cadre, auditeur)
  /** Messages chiffrés qui ne sont pas adressés à l'agent et dont il tient la clé de consultation d'un service. */
  function consultables() {
    var c = compte(), b = brut();
    return Object.keys(b.messages).map(function (k) { return b.messages[k]; }).filter(function (m) {
      return m.chiffre && !MS.concerne(m, c, c.groupes) && Object.keys(m.chiffre.cles).some(function (n) { return /^m-c\./.test(n) && (c.services || []).indexOf(n.slice(4)) >= 0; });
    }).sort(function (a, b) { return String(b.cree).localeCompare(String(a.cree)); });
  }
  function vueConsultation() {
    var o = opts();
    if (o.chiffrement === 'desactive') return h('section', { class: 'panneau' }, h('h2', { text: 'Consultation' }), h('p', { class: 'muted', text: 'Le chiffrement réservé aux destinataires n’est pas activé dans cet établissement : les messages sont lisibles par leurs destinataires, sans consultation.' }));
    if (!o.consultation) return h('section', { class: 'panneau' }, h('h2', { text: 'Consultation' }), h('p', { class: 'muted', text: 'La consultation par le cadre est désactivée dans cet établissement.' }));
    var l = consultables();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Consulter un message chiffré qui ne vous est pas adressé' }),
      h('p', { class: 'muted', text: 'Réservé aux cas qui le justifient (signalement, enquête, demande d’un agent concerné). Chaque consultation est inscrite au journal avec son motif ; vous choisissez d’en informer ou non l’auteur et les destinataires.' }),
      l.length ? h('table', { class: 'sans-largeurs' }, h('thead', {}, h('tr', {}, ['Envoyé le', 'De', 'À', 'Consultations', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (m) {
          return h('tr', {}, h('td', { text: dateHeure(m.cree) }), h('td', { text: m.nom || s().nomAuteur(m.par) }), h('td', { text: libDestinataires(m) }),
            h('td', { text: m.consultations.length ? m.consultations.map(function (x) { return (x.nom || s().nomAuteur(x.par)) + ' le ' + dateHeure(x.le); }).join(' ; ') : '—' }),
            h('td', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleConsultation(m); } }, 'Consulter…')));
        }))) : h('p', { class: 'muted', text: 'Aucun message chiffré de vos services.' }));
  }
  function modaleConsultation(m) {
    var motif = h('select', { 'aria-label': 'Motif' }, MS.MOTIFS_CONSULTATION.map(function (x) { return h('option', { value: x, text: x }); }));
    var precision = h('textarea', { rows: 3, maxlength: 500, 'aria-label': 'Précision du motif' }), informer = h('input', { type: 'checkbox' });
    U.modale('Consulter un message qui ne vous est pas adressé', h('div', { class: 'pile' },
      h('p', { class: 'info', text: 'Message chiffré du ' + dateHeure(m.cree) + ' — de ' + (m.nom || s().nomAuteur(m.par)) + ' à ' + libDestinataires(m) + '. Objet et texte masqués jusqu’à la consultation.' }),
      h('label', {}, 'Motif (obligatoire)', motif), h('label', {}, 'Précision (obligatoire)', precision),
      h('label', { class: 'case' }, informer, h('span', {}, h('b', { text: 'Informer l’auteur et les destinataires' }), h('br'), h('small', { class: 'muted', text: 'Facultatif. Ne pas cocher si cela pourrait gêner une enquête.' }))),
      h('p', { class: 'alerte', text: 'La consultation est toujours inscrite au journal (qui, quand, quel message, motif, information donnée ou non).' })),
    [{ texte: 'Annuler' }, { texte: 'Consulter et tracer', classe: 'primaire', action: async function () {
      if (!precision.value.trim()) throw new Error('Précisez le motif.');
      await s().enregistrer('CONSULTATION', { message: m.id, motif: motif.value, precision: precision.value.trim(), informer: informer.checked, nom: moi().nom });
      var p = await s().ouvrirMessage(m.id, m.chiffre, { consultation: true });
      if (!p) throw new Error('Consultation inscrite au journal, mais votre clé de consultation n’ouvre pas ce message (clé pas encore remise).');
      ouverts[m.id] = p;
      setTimeout(function () { afficherConsulte(m.id); }, 0);
    } }]);
  }
  async function afficherConsulte(id) {
    await dechiffrer();
    var m = st().messages[id];
    if (!m) return;
    U.modale('Message consulté', h('div', { class: 'pile' },
      h('dl', { class: 'ms-entete' }, h('dt', { text: 'De' }), h('dd', { text: m.nom || s().nomAuteur(m.par) }), h('dt', { text: 'À' }), h('dd', { text: libDestinataires(m) }), h('dt', { text: 'Envoyé' }), h('dd', { text: 'le ' + dateHeure(m.cree) })),
      h('h3', { text: m.objet }), h('div', { class: 'ms-texte', text: m.texte }),
      m.reponsesListe.length ? h('div', { class: 'pile' }, h('b', { text: 'Réponses (' + m.reponsesListe.length + ')' }), m.reponsesListe.map(function (r) { return h('div', { class: 'ms-reponse' }, h('small', { class: 'muted', text: (r.nom || s().nomAuteur(r.par)) + (r.a ? ' → ' + (r.nomA || s().nomAuteur(r.a)) : '') + ' — ' + dateHeure(r.le) }), h('p', { class: 'ms-texte', text: r.texte })); })) : null,
      m.pieces.length ? h('div', { class: 'ms-pieces' }, m.pieces.map(function (p) { return puce(p, null, m); })) : null,
      h('small', { class: 'muted', text: 'Consultation inscrite au journal. Ce contenu n’est plus affiché quand vous fermez cette fenêtre.' })), [{ texte: 'Fermer', action: function () { delete ouverts[id]; } }], { large: true });
  }

  // ------------------------------------------------------------ Onglet Informations
  function infosVues() { var p = s().preferences || {}; return Array.isArray(p.informationsVues) ? p.informationsVues : []; }
  async function marquerVue(i) {
    try {
      if (i.vu) await i.vu();
      else await s().enregistrerPreference('informationsVues', infosVues().concat([i.id]).slice(-500));
      U.rendreContenu();
    } catch (e) { alert(e.message); }
  }
  var toutesInfos = false;
  function informations() {
    var o = opts(), res = [];
    Object.keys(MS.INFORMATIONS).forEach(function (k) {
      if (!o.informations[k] || !s().detientCle || !s().detientCle(k)) return;
      var m = SIC.modules.obtenir(k), f = m && m.interface && m.interface.informations;
      if (typeof f !== 'function') return;
      (f() || []).forEach(function (i) { res.push(Object.assign({ module: k }, i)); });
    });
    return res;
  }
  function informationsNonVues() { var v = infosVues(); return informations().filter(function (i) { return v.indexOf(i.id) < 0; }); }
  function vueInformations() {
    var o = opts(), actifs = Object.keys(MS.INFORMATIONS).filter(function (k) { return o.informations[k]; });
    var v = infosVues(), tout = informations(), l = toutesInfos ? tout : tout.filter(function (i) { return v.indexOf(i.id) < 0; });
    var nv = tout.filter(function (i) { return v.indexOf(i.id) < 0; }).length;
    function bf(val, lib) { return h('button', { type: 'button', class: 'btn petit' + (toutesInfos === val ? ' primaire' : ''), 'aria-pressed': toutesInfos === val ? 'true' : 'false', onclick: function () { toutesInfos = val; U.rendreContenu(); } }, lib); }
    if (!actifs.length) return h('section', { class: 'panneau' }, h('h2', { text: 'Informations' }),
      h('p', { class: 'muted', text: 'Aucun module n’affiche ses informations ici : l’administrateur choisit lesquels dans Administration → Messagerie. Les informations restent toujours visibles dans chaque module.' }));
    return h('section', { class: 'panneau' },
      h('div', { class: 'barre' }, h('h2', { text: 'Informations' }), h('div', { class: 'espace' }), h('div', { class: 'actions gauche', role: 'group', 'aria-label': 'Filtrer' }, bf(false, 'Non vues (' + nv + ')'), bf(true, 'Toutes'))),
      h('p', { class: 'muted', text: 'Rappels des modules ' + actifs.map(function (k) { return MS.RATTACHABLES[k]; }).join(', ') + '. Ils ne remplacent pas le module : le détail et l’action restent là-bas.' }),
      l.length ? h('div', { class: 'ms-infos', role: 'list' }, l.map(function (i) {
        var vue = v.indexOf(i.id) >= 0;
        return h('div', { class: 'ms-info ' + (i.niveau || '') + (vue ? ' vue' : ''), role: 'listitem' },
          h('span', { class: 'ms-module ms-module-' + i.module, text: MS.RATTACHABLES[i.module] }),
          h('div', {}, h('b', { text: i.titre }), i.detail ? h('small', { class: 'muted', text: i.detail }) : null),
          h('div', { class: 'actions gauche' }, i.ouvrir ? h('button', { class: 'btn petit primaire', type: 'button', onclick: function () { i.ouvrir(); } }, 'Voir dans le module') : null,
            vue ? null : h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVue(i); } }, 'Vu')));
      })) : h('p', { class: 'muted', text: toutesInfos ? 'Aucune information.' : 'Aucune information non vue.' }),
      h('small', { class: 'muted', text: 'Une information disparaît d’elle-même quand la situation est réglée dans le module. « Vu » la range dans « Toutes ».' }));
  }

  // ------------------------------------------------------------ Nouveau message
  function choixDestinataires(c) {
    var cfg = U.config(), enc = encadrement(), svs = enc ? U.tousServices() : U.services().filter(function (x) { return (c.services || []).indexOf(x.code) >= 0; });
    if (!svs.length) svs = U.services();
    var grs = G.liste(cfg).filter(function (g) { return g.actif && (enc || c.groupes.indexOf(g.code) >= 0 || (g.services.length && g.services.every(function (x) { return (c.services || []).indexOf(x) >= 0; }))); });
    var roles = SIC.model.ROLES_DE_SERVICE;
    var opt = [];
    if (enc) opt.push(h('optgroup', { label: 'Établissement' }, h('option', { value: 'etablissement|', text: 'Tout l’établissement' })));
    opt.push(h('optgroup', { label: 'Services' }, svs.map(function (x) { return h('option', { value: 'service|' + x.code, text: x.libelle }); })));
    if (grs.length) opt.push(h('optgroup', { label: 'Groupes' }, grs.map(function (g) { return h('option', { value: 'groupe|' + g.code, text: g.libelle + (g.services.length ? ' (' + g.services.map(U.libService).join(', ') + ')' : ' (établissement)') }); })));
    opt.push(h('optgroup', { label: 'Rôles' }, [].concat.apply([], svs.map(function (x) { return roles.map(function (r) { return h('option', { value: 'role|' + r + '|' + x.code, text: libRole(r) + ' — ' + x.libelle }); }); }))));
    var ags = comptes().filter(function (a) { return a.id !== c.id; }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
    if (ags.length) opt.push(h('optgroup', { label: 'Agents' }, ags.map(function (a) { return h('option', { value: 'agent|' + a.id, text: a.nom || a.id }); })));
    return opt;
  }
  /**
   * Fenêtre « Nouveau message ». `init` : { objet, texte, rattaches: [{ module, genre, id, service }], destinataires }.
   */
  function modaleNouveau(init) {
    init = init || {};
    var c = compte(), o = opts(), svDefaut = U.App.service !== '*' ? U.App.service : (c.services || [])[0];
    var dest = (init.destinataires || []).slice(), rattaches = (init.rattaches || []).slice(), fichiers = [];
    var chips = h('div', { class: 'ms-chips' }), compteur = h('small', { class: 'muted' });
    var sel = h('select', { 'aria-label': 'Ajouter un destinataire' }, [h('option', { value: '', text: '+ Ajouter un destinataire…' })].concat(choixDestinataires(c)));
    var objet = h('input', { type: 'text', maxlength: 150, value: init.objet || '', 'aria-label': 'Objet' });
    var texte = h('textarea', { rows: 6, maxlength: 5000, 'aria-label': 'Message' }); texte.value = init.texte || '';
    var important = h('input', { type: 'checkbox' });
    var accuse = h('select', { 'aria-label': 'Accusé de lecture' }, Object.keys(MS.ACCUSES).map(function (k) { return h('option', { value: k, text: MS.ACCUSES[k] }); }));
    var reponses = h('select', { 'aria-label': 'Réponses' }, Object.keys(MS.REPONSES).map(function (k) { return h('option', { value: k, text: MS.REPONSES[k] }); }));
    var jusquau = h('input', { type: 'date', value: MS.plusJours(MS.jourISO(Date.now()), opts(svDefaut).affichageJours), 'aria-label': 'Affiché jusqu’au' });
    var zoneR = h('div', { class: 'pile' }), zoneP = h('div', { class: 'ms-pieces' });
    // Chiffrement réservé aux destinataires (0.24.0) : selon le réglage de l'établissement
    var chiffrable = o.chiffrement !== 'desactive' && !s().formation, impose = o.chiffrement === 'impose';
    var cbChiffre = h('input', { type: 'checkbox', checked: impose || o.chiffrement === 'choixCoche', disabled: impose });
    // Sondage (rôles autorisés : cadre et administrateur par défaut)
    var peutSondage = s().peut('SONDAGE_CLOTURE'), avecSondage = h('input', { type: 'checkbox' }), zoneS = h('div', { class: 'pile ms-sondage-saisie', hidden: true });
    var sGenre = h('select', { 'aria-label': 'Type de sondage' }, Object.keys(MS.GENRES_SONDAGE).map(function (k) { return h('option', { value: k, text: MS.GENRES_SONDAGE[k] }); }));
    var sQuestion = h('input', { type: 'text', maxlength: 200, placeholder: 'ex. Quel jour pour la réunion ?', 'aria-label': 'Question du sondage' });
    var sRes = h('select', { 'aria-label': 'Résultats' }, [h('option', { value: 'public', text: 'Publics : les destinataires voient les chiffres après avoir voté' }), h('option', { value: 'prive', text: 'Privés : vous seul voyez les résultats' })]);
    var sAnonyme = h('input', { type: 'checkbox' }), sAutre = h('input', { type: 'checkbox' }), sCloture = h('input', { type: 'date', 'aria-label': 'Clôture du sondage' });
    var sOptions = [{ libelle: '', jour: '', heure: '' }, { libelle: '', jour: '', heure: '' }], zoneO = h('div', { class: 'pile' });
    function dessinerO() {
      U.vider(zoneO);
      var dates = sGenre.value === 'dates';
      sOptions.forEach(function (o, i) {
        var champs = dates ? [h('input', { type: 'date', value: o.jour, 'aria-label': 'Date proposée ' + (i + 1), onchange: function (e) { o.jour = e.target.value; } }),
          h('input', { type: 'time', value: o.heure, 'aria-label': 'Heure (facultative) ' + (i + 1), onchange: function (e) { o.heure = e.target.value; } }),
          h('input', { type: 'text', maxlength: 120, value: o.libelle, placeholder: 'Précision (facultative)', 'aria-label': 'Précision ' + (i + 1), oninput: function (e) { o.libelle = e.target.value; } })]
          : [h('input', { type: 'text', maxlength: 120, value: o.libelle, placeholder: 'Réponse ' + (i + 1), 'aria-label': 'Réponse ' + (i + 1), oninput: function (e) { o.libelle = e.target.value; } })];
        zoneO.appendChild(h('div', { class: 'actions gauche ms-option' }, champs, sOptions.length > 2 ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la réponse ' + (i + 1), onclick: function () { sOptions.splice(i, 1); dessinerO(); } }, '✕') : null));
      });
      if (sOptions.length < MS.MAX_OPTIONS) zoneO.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { sOptions.push({ libelle: '', jour: '', heure: '' }); dessinerO(); } }, dates ? '+ Ajouter une date' : '+ Ajouter une réponse')));
      sAutre.closest && sAutre.parentNode && (sAutre.parentNode.hidden = dates);
    }
    sGenre.addEventListener('change', dessinerO);
    avecSondage.addEventListener('change', function () { zoneS.hidden = !avecSondage.checked; });
    zoneS.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Type', sGenre), h('label', {}, 'Question (facultative si l’objet suffit)', sQuestion)));
    zoneS.appendChild(zoneO);
    zoneS.appendChild(h('label', { class: 'case' }, sAutre, h('span', { text: 'Ajouter une réponse « Autre », libre' })));
    zoneS.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Résultats', sRes), h('label', {}, 'Clôture (facultative : sinon vous le clôturez vous-même)', sCloture)));
    zoneS.appendChild(h('label', { class: 'case' }, sAnonyme, h('span', {}, 'Masquer les noms des votants (même pour vous)', h('br'), h('small', { class: 'muted', text: 'Chaque vote reste au journal au nom de son auteur, comme toute saisie : l’anonymat n’est que d’affichage.' }))));
    dessinerO();
    function libelleEnvoi() {
      var m = { par: c.id, destinataires: dest }, n = MS.destinatairesResolus(m, comptes(), U.config()).agents.length;
      return dest.length ? 'Envoyer à ' + n + ' agent' + (n > 1 ? 's' : '') : 'Envoyer';
    }
    function dessinerDest() {
      U.vider(chips);
      dest.forEach(function (d, i) { chips.appendChild(h('span', { class: 'ms-chip ms-chip-' + d.genre }, libDest(d), h('button', { type: 'button', class: 'btn lien', 'aria-label': 'Retirer ' + libDest(d), onclick: function () { dest.splice(i, 1); dessinerDest(); } }, '✕'))); });
      if (!dest.length) chips.appendChild(h('span', { class: 'muted', text: 'Aucun destinataire' }));
      compteur.textContent = dest.length ? libelleEnvoi().replace('Envoyer à', 'Sera reçu par') + ' ayant un compte.' : '';
      var b = document.querySelector('dialog[open] .ms-envoyer'); if (b) b.textContent = libelleEnvoi();
    }
    sel.addEventListener('change', function () {
      var v = sel.value.split('|'); sel.value = '';
      if (!v[0]) return;
      var d = v[0] === 'role' ? { genre: 'role', code: v[1], service: v[2] } : v[0] === 'etablissement' ? { genre: 'etablissement', code: '*' } : { genre: v[0], code: v[1] };
      if (d.genre === 'agent') { var a = comptes().filter(function (x) { return x.id === d.code; })[0]; d.nom = a ? a.nom : ''; }
      if (!dest.some(function (x) { return x.genre === d.genre && x.code === d.code && x.service === d.service; })) dest.push(d);
      dessinerDest();
    });
    function dessinerR() {
      U.vider(zoneR);
      rattaches.forEach(function (r, i) { zoneR.appendChild(ligneRattache(r, function () { rattaches.splice(i, 1); dessinerR(); })); });
    }
    function dessinerP() {
      U.vider(zoneP);
      fichiers.forEach(function (f, i) { zoneP.appendChild(puce({ nom: f.name, taille: f.size }, function () { fichiers.splice(i, 1); dessinerP(); })); });
    }
    var entree = o.piecesJointes ? h('input', { type: 'file', multiple: true, class: 'ms-fichier', 'aria-label': 'Joindre un fichier', accept: o.typesPieces.map(function (x) { return '.' + x; }).join(',') }) : null;
    if (entree) entree.addEventListener('change', function () {
      Array.prototype.forEach.call(entree.files, function (f) {
        if (fichiers.length >= MS.MAX_PIECES) return;
        if (o.typesPieces.indexOf(MS.ext(f.name)) < 0) { alert('Type de fichier non autorisé : ' + f.name); return; }
        if (f.size > o.tailleMaxMo * 1048576) { alert('Fichier trop volumineux : ' + f.name + ' (' + o.tailleMaxMo + ' Mo au plus).'); return; }
        fichiers.push(f);
      });
      entree.value = ''; dessinerP();
    });
    dessinerDest(); dessinerR(); dessinerP();
    U.modale('Nouveau message', h('div', { class: 'pile ms-nouveau' },
      h('div', { class: 'pile' }, h('b', { text: 'À' }), chips, sel, compteur,
        h('small', { class: 'muted', text: encadrement() ? 'Services, groupes, rôles, agents nommés ou tout l’établissement.' : 'Vos services, vos groupes, un rôle de vos services ou des agents nommés (un seul service à la fois). Plusieurs services ou tout l’établissement : cadre et administrateur.' })),
      h('label', {}, 'Objet', objet), h('label', {}, 'Message', texte),
      h('div', { class: 'pile' }, zoneR, zoneP,
        h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (rattaches.length >= MS.MAX_RATTACHES) return alert('Dix éléments au plus.'); modaleRattacher(function (r) { if (!rattaches.some(function (x) { return x.module === r.module && x.id === r.id; })) rattaches.push(r); dessinerR(); }); } }, 'Rattacher un élément…'),
          entree ? h('label', { class: 'btn petit ms-joindre' }, 'Joindre un fichier…', entree) : null),
        entree ? h('small', { class: 'muted', text: 'Fichiers : ' + o.typesPieces.join(', ') + ' ; ' + o.tailleMaxMo + ' Mo au plus chacun. Ils sont chiffrés et conservés avec le message.' }) : null),
      peutSondage ? h('div', { class: 'pile' }, h('label', { class: 'case' }, avecSondage, h('b', { text: 'Ajouter un sondage' })), zoneS) : null,
      chiffrable ? h('label', { class: 'case ms-chiffrer' }, cbChiffre, h('span', {}, h('b', { text: 'Chiffrer pour les seuls destinataires' }), h('br'),
        h('small', { text: 'Seuls vous et les destinataires lisent l’objet, le texte, les réponses, les éléments rattachés et les pièces jointes. ' + (o.consultation ? 'Le cadre du service ou un auditeur peut le consulter en cas de besoin, avec un motif inscrit au journal. ' : '') + 'Réglage de l’établissement : ' + MS.CHIFFREMENTS[o.chiffrement].toLowerCase() + '.' }))) : null,
      h('p', { class: 'alerte', text: 'Information d’organisation : pas de message personnel ni de donnée clinique' + (entree ? ', y compris dans les pièces jointes.' : '.') }),
      h('div', { class: 'grille-2' },
        h('label', { class: 'case' }, important, h('span', {}, h('b', { text: 'Message important' }), h('br'), h('small', { class: 'muted', text: 'reste en tête jusqu’à la lecture' }))),
        h('label', {}, 'Accusé de lecture', accuse), h('label', {}, 'Réponses', reponses), h('label', {}, 'Affiché jusqu’au', jusquau))),
    [{ texte: 'Annuler' }, { texte: libelleEnvoi(), classe: 'primaire ms-envoyer', action: async function () {
      var d = { id: 'MS' + SIC.crypto.hex(SIC.crypto.aleatoire(6)), objet: objet.value.trim(), texte: texte.value.trim(), nom: moi().nom, destinataires: dest,
        services: MS.servicesDe(dest, U.config()), important: important.checked, accuse: accuse.value, reponses: reponses.value, jusquau: jusquau.value, rattaches: rattaches, pieces: [] };
      if (peutSondage && avecSondage.checked) {
        var dates = sGenre.value === 'dates';
        d.sondage = { question: sQuestion.value.trim(), genre: sGenre.value, resultats: sRes.value, anonyme: sAnonyme.checked, autre: !dates && sAutre.checked, cloture: sCloture.value,
          options: sOptions.filter(function (o) { return dates ? o.jour : o.libelle.trim(); }).map(function (o, i) { var x = { id: 'o' + (i + 1), libelle: o.libelle.trim() }; if (dates) { x.jour = o.jour; x.heure = o.heure; } return x; }) };
      }
      // Contrôle avant d'écrire les fichiers (aucun fichier orphelin si le message est refusé)
      MS.controler('MESSAGE', Object.assign({}, d, { pieces: fichiers.map(function (f) { return { id: 'PJ0000000000000000', nom: f.name, taille: f.size }; }) }), { etat: st(), compte: c, config: U.config(), peut: function (t) { return s().peut(t); } });
      if (fichiers.length && !confirm('Les pièces jointes ne doivent contenir aucune donnée clinique ni nominative sur un patient. Envoyer ?')) return false;
      var chiffrer = chiffrable && cbChiffre.checked;
      if (chiffrer) {
        var noms = MS.clesPourMessage(dest, c, U.config(), comptes()), manquantes = s().clesMessagerieManquantes(noms);
        if (manquantes.length) throw new Error('Chiffrement impossible pour l’instant : les clés de certains destinataires ne sont pas encore créées (elles le sont à la prochaine connexion d’un administrateur). ' + (impose ? '' : 'Décochez « Chiffrer » pour envoyer en clair.'));
        d.chiffre = await s().chiffrerMessage(d.id, noms);
      }
      for (var i = 0; i < fichiers.length; i++) {
        var oct = new Uint8Array(await fichiers[i].arrayBuffer());
        if (chiffrer) oct = await s().chiffrerPourMessage(d.id, oct, 'pj:' + i);
        d.pieces.push({ id: await s().enregistrerPiece('messagerie', oct), nom: fichiers[i].name, taille: fichiers[i].size, n: i });
      }
      if (chiffrer) {
        // Contenu, éléments, pièces et libellés du sondage dans la partie chiffrée ; restent en clair : destinataires,
        // dates, réglages de lecture et de réponse, identifiants des réponses du sondage (pour compter les votes)
        var contenu = { objet: d.objet, texte: d.texte, rattaches: d.rattaches, pieces: d.pieces };
        if (d.sondage) {
          contenu.sondage = { question: d.sondage.question, options: d.sondage.options };
          d.sondage = Object.assign({}, d.sondage, { question: '', options: d.sondage.options.map(function (x) { return { id: x.id, libelle: '' }; }) });
        }
        d.chiffre.ct = await s().contenuMessage(d.id, contenu);
        ouverts[d.id] = contenu;
        d.objet = ''; d.texte = ''; d.rattaches = []; d.pieces = [];
      }
      var e = await s().enregistrer('MESSAGE', d);
      U.toast('Message envoyé.');
      if (e) selection.envoyes = d.id;
    } }], { large: true });
  }

  // ------------------------------------------------------------ Administration (administrateur ; cadre pour ses services)
  var niveau = null;
  function niveaux() {
    var c = moi(), adm = admin();
    return (adm ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (v) { return adm || (c.services || []).indexOf(v.code) >= 0; }).map(function (v) { return { code: v.code, libelle: 'Service ' + v.libelle }; }));
  }
  function panneauReglages() {
    var ns = niveaux();
    if (!ns.length) return h('section', { class: 'panneau' }, h('p', { class: 'muted', text: 'Aucun service à régler.' }));
    if (!niveau || !ns.some(function (n) { return n.code === niveau; })) niveau = ns[0].code;
    var tout = JSON.parse(JSON.stringify(U.config().messagerie || {})), etab = niveau === '*', propre = tout[niveau] || {}, eff = opts(etab ? null : niveau);
    var sel = h('select', { 'aria-label': 'Niveau des réglages', onchange: function () { niveau = sel.value; U.rendreContenu(); } }, ns.map(function (n) { return h('option', { value: n.code, text: n.libelle, selected: n.code === niveau }); }));
    var aff = h('select', { 'aria-label': 'Durée d’affichage proposée' }, (etab ? [] : [h('option', { value: '', text: 'Comme l’établissement (' + opts().affichageJours + ' jours)', selected: propre.affichageJours === undefined })])
      .concat([7, 15, 30, 60, 90].map(function (n) { return h('option', { value: String(n), text: n + ' jours', selected: propre.affichageJours !== undefined || etab ? eff.affichageJours === n : false }); })));
    var corps = [h('label', {}, 'Durée d’affichage proposée pour un nouveau message (l’auteur peut la changer)', aff)];
    var lecteurs = [function (v) { if (aff.value) v.affichageJours = +aff.value; }];
    if (etab) {
      var cbs = Object.keys(MS.INFORMATIONS).map(function (k) { var cb = h('input', { type: 'checkbox', checked: eff.informations[k] }); return { k: k, cb: cb }; });
      var pj = h('input', { type: 'checkbox', checked: eff.piecesJointes });
      var tMax = h('select', { 'aria-label': 'Taille maximale' }, [1, 2, 5, 10, 20].map(function (n) { return h('option', { value: String(n), text: n + ' Mo', selected: eff.tailleMaxMo === n }); }));
      var types = h('input', { type: 'text', value: eff.typesPieces.join(', '), 'aria-label': 'Types de fichiers autorisés' });
      var chif = h('select', { 'aria-label': 'Chiffrement réservé aux destinataires' }, Object.keys(MS.CHIFFREMENTS).map(function (k) { return h('option', { value: k, text: MS.CHIFFREMENTS[k], selected: eff.chiffrement === k }); }));
      var consult = h('input', { type: 'checkbox', checked: eff.consultation });
      var cons = h('select', { 'aria-label': 'Conservation' }, [6, 12, 24, 36].map(function (n) { return h('option', { value: String(n), text: n + ' mois', selected: eff.conservationMois === n }); }));
      corps.push(
        h('div', { class: 'pile ag-section' }, h('b', { text: 'Onglet Informations' }), h('small', { class: 'muted', text: 'Les rappels des modules cochés s’affichent aussi dans la messagerie ; ils restent toujours dans chaque module.' }),
          cbs.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: MS.INFORMATIONS[x.k] })); })),
        h('div', { class: 'pile ag-section' }, h('b', { text: 'Pièces jointes' }),
          h('label', { class: 'case' }, pj, h('span', { text: 'Autoriser les pièces jointes (désactivé par défaut ; à faire valider par le délégué à la protection des données et le responsable de la sécurité informatique)' })),
          h('div', { class: 'grille-2' }, h('label', {}, 'Taille maximale par fichier', tMax), h('label', {}, 'Types autorisés (extensions séparées par des virgules)', types)),
          h('small', { class: 'muted', text: 'Fichiers chiffrés par la clé de la messagerie, rangés avec les données. Images et PDF affichés dans l’application ; les autres fichiers téléchargés après avertissement.' })),
        h('label', {}, 'Conservation des messages', cons),
        h('div', { class: 'pile ag-section' }, h('b', { text: 'Chiffrement réservé aux destinataires' }),
          h('label', {}, 'Réglage de l’établissement', chif),
          h('label', { class: 'case' }, consult, h('span', { text: 'Consultation par le cadre du service ou un auditeur, avec motif inscrit au journal (activée par défaut)' })),
          h('small', { class: 'muted', text: 'Les clés des services, rôles, groupes et agents sont créées et remises par la session de l’administrateur ; un nouvel agent ou un nouveau membre de groupe reçoit les siennes à la prochaine connexion d’un administrateur. Pour un auditeur : créer un rôle dans Rôles et accès avec l’accès « Consulter un message chiffré » de la messagerie. Limite : l’administrateur détient techniquement toutes les clés, comme pour chaque module ; l’application ne lui ouvre que ce qui lui est adressé ou une consultation tracée.' })));
      lecteurs.push(function (v) {
        v.informations = {}; cbs.forEach(function (x) { if (x.cb.checked) v.informations[x.k] = true; });
        if (pj.checked) v.piecesJointes = true;
        v.tailleMaxMo = +tMax.value;
        var t = types.value.split(/[,\s;]+/).map(function (x) { return x.toLowerCase().replace(/^\./, ''); }).filter(function (x) { return /^[a-z0-9]{1,8}$/.test(x); });
        if (t.length && t.join(',') !== MS.TYPES_PIECES_DEFAUT.join(',')) v.typesPieces = t;
        if (+cons.value !== 12) v.conservationMois = +cons.value;
        if (chif.value !== 'desactive') v.chiffrement = chif.value;
        if (!consult.checked) v.consultation = false;
      });
    }
    return h('section', { class: 'panneau' }, h('h2', { text: 'Messagerie' }),
      h('p', { class: 'muted', text: 'L’administrateur règle l’établissement et les services ; le cadre règle la durée d’affichage de ses services. Chiffrement réservé aux destinataires : prochaine version.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', sel), corps,
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          var v = {}; lecteurs.forEach(function (f) { f(v); });
          if (Object.keys(v).length) tout[niveau] = v; else delete tout[niveau];
          await U.enregistrerConfig([['messagerie', tout]]); U.toast('Réglages enregistrés.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }

  // ------------------------------------------------------------ Journal (sans le contenu des messages)
  var LIB = { MESSAGE: 'Messagerie : message', MESSAGE_REPONSE: 'Messagerie : réponse', MESSAGE_LU: 'Messagerie : lecture', MESSAGE_RETRAIT: 'Messagerie : retrait', MESSAGE_ARCHIVE: 'Messagerie : archive', MESSAGE_RELANCE: 'Messagerie : relance', VOTE: 'Messagerie : vote', SONDAGE_CLOTURE: 'Messagerie : clôture d’un sondage', CONSULTATION: 'Messagerie : consultation tracée' };
  function resume(e) {
    var d = e.data || {}, m = st().messages[d.id || d.message], c = compte(), lisible = m && MS.concerne(m, c, c.groupes);
    var nom = lisible ? '« ' + m.objet + ' »' : 'un message';
    switch (e.type) {
      case 'MESSAGE': return 'Message ' + nom + (m ? ' à ' + libDestinataires(m) : '') + (d.pieces && d.pieces.length ? ' (' + d.pieces.length + ' pièce(s) jointe(s))' : '');
      case 'MESSAGE_REPONSE': return 'Réponse à ' + nom;
      case 'MESSAGE_LU': return (d.confirme ? 'Lecture confirmée : ' : 'Lecture : ') + nom;
      case 'MESSAGE_RETRAIT': return 'Retrait de ' + nom + (d.motif ? ' : ' + d.motif : '');
      case 'MESSAGE_ARCHIVE': return (d.archive === false ? 'Remis dans les reçus : ' : 'Archivé : ') + nom;
      case 'MESSAGE_RELANCE': return 'Relance de ' + nom;
      case 'VOTE': return 'Vote au sondage de ' + nom;
      case 'SONDAGE_CLOTURE': return 'Clôture du sondage de ' + nom;
      case 'CONSULTATION': return 'Consultation de ' + (m ? 'un message chiffré de ' + (m.nom || s().nomAuteur(m.par)) + ' à ' + libDestinataires(m) : 'un message chiffré') + ' — motif : ' + (d.motif || '') + (d.precision ? ' (' + d.precision + ')' : '') + (d.informer ? ' ; auteur et destinataires informés' : ' ; sans information de l’auteur et des destinataires');
    }
    return e.type;
  }

  // ------------------------------------------------------------ « Envoyer par message » depuis un autre module
  /** L'agent peut-il écrire un message (clé de la messagerie, droit d'écrire, pas d'aperçu) ? */
  function peutEnvoyer() {
    try { return !!s() && s().detientCle('messagerie') && SIC.modules.obtenir('messagerie').droits.peut(s().roles(), 'MESSAGE', U.config()) && !s().apercu; } catch (e) { return false; }
  }
  /** Ferme la fenêtre ouverte et ouvre un nouveau message avec l'élément déjà rattaché. */
  function envoyer(module, genre, id, service) {
    var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel'));
    setTimeout(function () { modaleNouveau({ rattaches: [{ module: module, genre: genre, id: id, service: service || '' }] }); }, 0);
  }
  /** Bouton « Envoyer par message » pour un élément d'un autre module ; null si l'agent ne peut pas écrire. */
  function bouton(module, genre, id, service) {
    return peutEnvoyer() ? h('button', { class: 'btn petit', type: 'button', onclick: function () { envoyer(module, genre, id, service); } }, 'Envoyer par message') : null;
  }
  /** Bouton de pied de fenêtre (U.modale) « Envoyer par message », ou null. */
  function boutonModale(module, genre, id, service) {
    return peutEnvoyer() ? { texte: 'Envoyer par message', action: function () { envoyer(module, genre, id, service); return false; } } : null;
  }

  // ------------------------------------------------------------ Recherche générale (0.26.4)
  /** Éléments des modules auxquels l'agent a accès (mêmes que pour un rattachement) : [{ module, titre, detail, ouvrir }]. */
  function elements() {
    var res = [];
    Object.keys(ADAPT).forEach(function (k) {
      if (!s().detientCle || !s().detientCle(k)) return;
      var l = [];
      try { l = ADAPT[k].lister() || []; } catch (e) { l = []; }
      l.forEach(function (x) {
        var r = Object.assign({ module: k }, x), y = null;
        if (!accesElement(r)) return;
        try { y = ADAPT[k].resoudre(r); } catch (e) { y = null; }
        if (y) res.push({ module: k, libModule: MS.RATTACHABLES[k] || k, titre: y.titre, detail: y.detail || '', ouvrir: function () { ADAPT[k].ouvrir(r); } });
      });
    });
    return res;
  }
  /** Messages reçus et envoyés qui contiennent la recherche (objet, texte, auteur) : [{ titre, detail, ouvrir }]. */
  function chercher(q) {
    if (!q || !s().detientCle || !s().detientCle('messagerie')) return [];
    var c = compte(), vus = {}, res = [];
    ['recus', 'envoyes'].forEach(function (onglet) {
      var l = [];
      try { l = MS.liste(st(), c, c.groupes, U.config(), Date.now(), onglet, { filtre: 'tous', recherche: q }); } catch (e) { l = []; }
      l.forEach(function (m) {
        if (vus[m.id]) return; vus[m.id] = 1;
        res.push({ module: 'messagerie', libModule: 'Messagerie', titre: m.objet || '(sans objet)', detail: (onglet === 'envoyes' ? 'Envoyé' : 'De ' + (m.nom || '')) + ' — ' + U.date(Date.parse(m.le || m.cree || '')).slice(0, 10),
          ouvrir: function () { selection[onglet] = m.id; recherche = ''; U.ouvrirFenetre('messagerie'); U.App.onglet = onglet; U.rendreContenu(); } });
      });
    });
    return res;
  }

  SIC.modules.completerInterface('messagerie', {
    vues: { recus: function () { return vueListe('recus'); }, envoyes: function () { return vueListe('envoyes'); }, archives: function () { return vueListe('archives'); }, informations: vueInformations, consultation: vueConsultation },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le message revient à son état précédent.'; } },
    admin: { onglets: function () { return [['messagerie', 'Messagerie', [panneauReglages()]]]; }, cadre: function () { return [panneauReglages()]; } },
    // Pastille : messages qui vous attendent et informations non vues
    pastille: function () { try { var c = compte(); return MS.enAttente(st(), c, c.groupes, U.config(), Date.now()) + informationsNonVues().length; } catch (e) { return 0; } }
  });
  U.messagerie = { elements: elements, chercher: chercher, ligneRattache: ligneRattache, modaleRattacher: modaleRattacher, nouveau: modaleNouveau, bouton: bouton, boutonModale: boutonModale, peutEnvoyer: peutEnvoyer, envoyer: envoyer, informations: informations };
})();
