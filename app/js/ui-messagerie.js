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
  function st() { return (s() && s().etatModule('messagerie')) || { messages: {} }; }
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
      m.important ? h('span', { class: 'badge bad', text: 'Important' }) : null,
      m.accuse === 'confirmer' ? h('span', { class: 'badge', text: si.aConfirmer ? 'Lecture à confirmer' : 'Accusé de lecture demandé' }) : null,
      si.relance ? h('span', { class: 'badge warn', text: 'Relancé' }) : null,
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
        ecrire('MESSAGE_REPONSE', d, d.a ? 'Réponse envoyée à ' + (d.nomA || 'l’agent') + ' seulement.' : 'Réponse envoyée.');
      } }, 'Envoyer')));
    }
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
      m.retire ? h('p', { class: 'alerte', text: 'Message retiré le ' + dateHeure(m.retire.le) + (m.retire.motif ? ' : ' + m.retire.motif : '') + '.' }) : null,
      h('div', { class: 'ms-texte', text: m.texte }),
      m.rattaches.length ? h('section', { class: 'pile ms-section', 'aria-label': 'Éléments rattachés' }, h('b', { text: 'Éléments rattachés (' + m.rattaches.length + ')' }), m.rattaches.map(function (r) { return ligneRattache(r); })) : null,
      m.pieces.length ? h('section', { class: 'pile ms-section', 'aria-label': 'Pièces jointes' }, h('b', { text: 'Pièces jointes (' + m.pieces.length + ')' }),
        h('div', { class: 'ms-pieces' }, m.pieces.map(function (p) { return puce(p, null, m); })),
        h('small', { class: 'muted', text: 'Images et PDF s’affichent sans être enregistrés sur le poste. Les autres fichiers sont téléchargés après avertissement : ils sortent alors du coffre chiffré.' })) : null,
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
            h('div', { class: 'actions gauche', role: 'group', 'aria-label': 'Filtrer' }, bf('tous', 'Tous'), bf('nonlus', 'Non lus'), bf('importants', 'Importants'))),
          l.length ? h('div', { class: 'ms-lignes' }, l.map(function (m) { return ligneListe(m, onglet); }))
            : h('p', { class: 'muted', text: recherche || filtre !== 'tous' ? 'Aucun message pour cette recherche.' : onglet === 'envoyes' ? 'Aucun message envoyé.' : onglet === 'archives' ? 'Aucun message archivé.' : 'Aucun message reçu.' })),
        h('div', { class: 'ms-lecture' }, choisi ? lecteurMessage(choisi, onglet) : h('p', { class: 'muted', text: 'Choisissez un message.' }))));
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
      h('p', { class: 'alerte', text: 'Information d’organisation : pas de message personnel ni de donnée clinique' + (entree ? ', y compris dans les pièces jointes.' : '.') }),
      h('div', { class: 'grille-2' },
        h('label', { class: 'case' }, important, h('span', {}, h('b', { text: 'Message important' }), h('br'), h('small', { class: 'muted', text: 'reste en tête jusqu’à la lecture' }))),
        h('label', {}, 'Accusé de lecture', accuse), h('label', {}, 'Réponses', reponses), h('label', {}, 'Affiché jusqu’au', jusquau))),
    [{ texte: 'Annuler' }, { texte: libelleEnvoi(), classe: 'primaire ms-envoyer', action: async function () {
      var d = { id: 'MS' + SIC.crypto.hex(SIC.crypto.aleatoire(6)), objet: objet.value.trim(), texte: texte.value.trim(), nom: moi().nom, destinataires: dest,
        services: MS.servicesDe(dest, U.config()), important: important.checked, accuse: accuse.value, reponses: reponses.value, jusquau: jusquau.value, rattaches: rattaches, pieces: [] };
      // Contrôle avant d'écrire les fichiers (aucun fichier orphelin si le message est refusé)
      MS.controler('MESSAGE', Object.assign({}, d, { pieces: fichiers.map(function (f) { return { id: 'PJ0000000000000000', nom: f.name, taille: f.size }; }) }), { etat: st(), compte: c, config: U.config() });
      if (fichiers.length && !confirm('Les pièces jointes ne doivent contenir aucune donnée clinique ni nominative sur un patient. Envoyer ?')) return false;
      for (var i = 0; i < fichiers.length; i++) {
        var oct = new Uint8Array(await fichiers[i].arrayBuffer());
        d.pieces.push({ id: await s().enregistrerPiece('messagerie', oct), nom: fichiers[i].name, taille: fichiers[i].size });
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
      var cons = h('select', { 'aria-label': 'Conservation' }, [6, 12, 24, 36].map(function (n) { return h('option', { value: String(n), text: n + ' mois', selected: eff.conservationMois === n }); }));
      corps.push(
        h('div', { class: 'pile ag-section' }, h('b', { text: 'Onglet Informations' }), h('small', { class: 'muted', text: 'Les rappels des modules cochés s’affichent aussi dans la messagerie ; ils restent toujours dans chaque module.' }),
          cbs.map(function (x) { return h('label', { class: 'case' }, x.cb, h('span', { text: MS.INFORMATIONS[x.k] })); })),
        h('div', { class: 'pile ag-section' }, h('b', { text: 'Pièces jointes' }),
          h('label', { class: 'case' }, pj, h('span', { text: 'Autoriser les pièces jointes (désactivé par défaut ; à faire valider par le délégué à la protection des données et le responsable de la sécurité informatique)' })),
          h('div', { class: 'grille-2' }, h('label', {}, 'Taille maximale par fichier', tMax), h('label', {}, 'Types autorisés (extensions séparées par des virgules)', types)),
          h('small', { class: 'muted', text: 'Fichiers chiffrés par la clé de la messagerie, rangés avec les données. Images et PDF affichés dans l’application ; les autres fichiers téléchargés après avertissement.' })),
        h('label', {}, 'Conservation des messages', cons));
      lecteurs.push(function (v) {
        v.informations = {}; cbs.forEach(function (x) { if (x.cb.checked) v.informations[x.k] = true; });
        if (pj.checked) v.piecesJointes = true;
        v.tailleMaxMo = +tMax.value;
        var t = types.value.split(/[,\s;]+/).map(function (x) { return x.toLowerCase().replace(/^\./, ''); }).filter(function (x) { return /^[a-z0-9]{1,8}$/.test(x); });
        if (t.length && t.join(',') !== MS.TYPES_PIECES_DEFAUT.join(',')) v.typesPieces = t;
        if (+cons.value !== 12) v.conservationMois = +cons.value;
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
  var LIB = { MESSAGE: 'Messagerie : message', MESSAGE_REPONSE: 'Messagerie : réponse', MESSAGE_LU: 'Messagerie : lecture', MESSAGE_RETRAIT: 'Messagerie : retrait', MESSAGE_ARCHIVE: 'Messagerie : archive', MESSAGE_RELANCE: 'Messagerie : relance' };
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

  SIC.modules.completerInterface('messagerie', {
    vues: { recus: function () { return vueListe('recus'); }, envoyes: function () { return vueListe('envoyes'); }, archives: function () { return vueListe('archives'); }, informations: vueInformations },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'Le message revient à son état précédent.'; } },
    admin: { onglets: function () { return [['messagerie', 'Messagerie', [panneauReglages()]]]; }, cadre: function () { return [panneauReglages()]; } },
    // Pastille : messages qui vous attendent et informations non vues
    pastille: function () { try { var c = compte(); return MS.enAttente(st(), c, c.groupes, U.config(), Date.now()) + informationsNonVues().length; } catch (e) { return 0; } }
  });
  U.messagerie = { nouveau: modaleNouveau, bouton: bouton, boutonModale: boutonModale, peutEnvoyer: peutEnvoyer, envoyer: envoyer, informations: informations };
})();
