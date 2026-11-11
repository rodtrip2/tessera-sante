// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Informations du service — interface (0.26.2, lot A, décisions du porteur du 11 novembre 2026). Logique :
 * module-infos.js. Onglets : Informations (page de l'établissement puis page du service, rubriques), Contacts (tous
 * les contacts des pages, à trier et filtrer). Le cadre tient la page de ses services ; l'administrateur, celle de
 * l'établissement et les réglages (pièces jointes).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, I = SIC.infos, C = SIC.crypto;
  var vue = { service: null };

  function s() { return U.App.session; }
  function st() { return (s() && s().etatModule('infos')) || I.reduire([]); }
  function moi() { return s().compteEffectif(); }
  function compte() { return Object.assign({}, moi(), { roles: s().roles() }); }
  function peut() { return s().peut('INFO_RUBRIQUE') && !s().apercu; }
  function gere(sv) { return peut() && I.gere(compte(), sv); }
  function opts() { return I.options(U.config()); }
  function service() {
    var mes = U.services().map(function (x) { return x.code; });
    if (U.App.service !== '*' && mes.indexOf(U.App.service) >= 0) return U.App.service;
    if (vue.service && mes.indexOf(vue.service) >= 0) return vue.service;
    return mes[0] || null;
  }
  function taille(o) { return o < 1024 ? o + ' o' : o < 1048576 ? Math.round(o / 1024) + ' Ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }
  function agents() { return ((s() && s().comptes) || []).filter(function (c) { return c.actif && c.id !== 'secours'; }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr'); }); }
  function nomAgent(id) { var c = agents().filter(function (x) { return x.id === id; })[0]; return c ? c.nom : ''; }

  // ------------------------------------------------------------ Contacts : copier le numéro, écrire un message
  function copier(t) {
    var fin = function () { U.toast('Copié : ' + t); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(fin, function () { prompt('Copiez :', t); }); return; } } catch (e) { /* presse-papiers indisponible */ }
    prompt('Copiez :', t);
  }
  function boutonMessage(c) {
    if (!c.agent || !U.messagerie || !U.messagerie.peutEnvoyer || !U.messagerie.peutEnvoyer()) return null;
    return h('button', { class: 'btn petit', type: 'button', title: 'Écrire un message à ' + (c.nom || nomAgent(c.agent)), onclick: function () { U.messagerie.nouveau({ destinataires: ['agent|' + c.agent] }); } }, 'Écrire');
  }
  function tableContacts(liste, avecRubrique) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'is-contacts' },
      h('thead', {}, h('tr', {}, (avecRubrique ? ['Rubrique'] : []).concat(['Nom', 'Fonction', 'Numéro', 'Courriel', '']).map(function (t) { return h('th', { text: t }); }))),
      h('tbody', {}, liste.map(function (c) {
        return h('tr', {}, avecRubrique ? h('td', { text: c.rubrique || '' }) : null, h('td', {}, c.agent && U.equipe ? U.equipe.lien(c.agent, c.nom) : h('span', { text: c.nom || '' })), h('td', { text: c.fonction || '' }),
          h('td', { class: 'nowrap' }, c.numero ? h('button', { class: 'btn lien is-numero', type: 'button', title: 'Copier le numéro', onclick: function () { copier(c.numero); } }, c.numero) : null),
          h('td', {}, c.courriel ? h('button', { class: 'btn lien', type: 'button', title: 'Copier l’adresse', onclick: function () { copier(c.courriel); } }, c.courriel) : null),
          h('td', { class: 'actions-ligne' }, boutonMessage(c)));
      }))));
  }

  // ------------------------------------------------------------ Pièces jointes
  function affichable(nom) { var e = String(nom).split('.').pop().toLowerCase(); return e === 'pdf' ? 'application/pdf' : /^(png|jpe?g|gif|webp)$/.test(e) ? 'image/' + (e === 'jpg' ? 'jpeg' : e) : null; }
  async function ouvrirPiece(p) {
    var type = affichable(p.nom), w = null;
    if (!type && !confirm('« ' + p.nom + ' » ne peut pas être affiché dans l’application : il va être téléchargé sur ce poste et sortira du coffre chiffré. Continuer ?')) return;
    if (type === 'application/pdf') w = window.open('', '_blank');
    try {
      var o = await s().lirePiece('infos', p.id);
      if (!o) throw new Error('Fichier introuvable (pas encore copié depuis un autre poste ?).');
      if (!type) { U.telechargerOctets(p.nom, o, 'application/octet-stream'); return; }
      if (type === 'application/pdf') { var url = URL.createObjectURL(new Blob([o], { type: type })); if (w) w.location = url; else U.telechargerOctets(p.nom, o, type); return; }
      var b = ''; for (var i = 0; i < o.length; i += 32768) b += String.fromCharCode.apply(null, o.subarray(i, i + 32768));
      U.modale(p.nom, h('img', { class: 'ms-image', src: 'data:' + type + ';base64,' + btoa(b), alt: p.nom }), [{ texte: 'Fermer' }], { large: true });
    } catch (e) { if (w) w.close(); alert(e.message); }
  }
  function listePieces(pieces) {
    return pieces.length ? h('div', { class: 'is-pieces' }, pieces.map(function (p) {
      return h('button', { class: 'btn petit', type: 'button', title: 'Ouvrir', onclick: function () { ouvrirPiece(p); } }, '📄 ' + p.nom + ' (' + taille(p.taille) + ')');
    })) : null;
  }

  // ------------------------------------------------------------ Rubriques
  function rubrique(r, liste) {
    var g = gere(r.service), i = liste.indexOf(r);
    async function bouger(dir) {
      var autre = liste[i + dir];
      if (!autre) return;
      await s().enregistrer('INFO_RUBRIQUE', { id: r.id, ordre: autre.ordre });
      await s().enregistrer('INFO_RUBRIQUE', { id: autre.id, ordre: r.ordre === autre.ordre ? r.ordre + dir * -1 : r.ordre });
    }
    return h('section', { class: 'panneau is-rubrique' + (r.masquee ? ' is-masquee' : '') },
      h('div', { class: 'is-tete' }, h('h2', { text: r.titre }), r.masquee ? h('span', { class: 'badge', text: 'Masquée aux agents' }) : null,
        g ? h('div', { class: 'actions gauche is-gestion' },
          h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Monter', title: 'Monter', disabled: i <= 0, onclick: function () { bouger(-1).catch(function (e) { alert(e.message); }); } }, '↑'),
          h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Descendre', title: 'Descendre', disabled: i >= liste.length - 1, onclick: function () { bouger(1).catch(function (e) { alert(e.message); }); } }, '↓'),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { s().enregistrer('INFO_RUBRIQUE', { id: r.id, masquee: !r.masquee }).catch(function (e) { alert(e.message); }); } }, r.masquee ? 'Afficher' : 'Masquer'),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleRubrique(r, r.service); } }, 'Modifier')) : null),
      r.texte ? h('div', { class: 'is-texte', text: r.texte }) : null,
      r.contacts.length ? tableContacts(r.contacts) : null,
      listePieces(r.pieces),
      !r.texte && !r.contacts.length && !r.pieces.length ? h('p', { class: 'muted', text: g ? 'Rubrique vide : « Modifier » pour la remplir.' : 'Rien pour l’instant.' }) : null,
      h('small', { class: 'muted', text: 'Mise à jour le ' + U.date(Date.parse(r.modifie || r.cree)).slice(0, 10) + (r.modifiePar ? ' par ' + s().nomAuteur(r.modifiePar) : '') }));
  }
  function page(sv, titre) {
    var g = gere(sv), liste = I.rubriques(st(), sv, g), prop = g ? I.proposees(st(), sv) : [];
    if (!liste.length && !g) return sv === I.ETABLISSEMENT ? null : h('section', { class: 'panneau' }, h('h2', { text: titre }), h('p', { class: 'muted', text: 'Le cadre n’a pas encore rempli la page de ce service.' }));
    return h('div', { class: 'pile' },
      h('div', { class: 'is-titre-page' }, h('h1', { text: titre }),
        g ? h('div', { class: 'actions gauche' },
          prop.length ? h('select', { 'aria-label': 'Ajouter une rubrique proposée', onchange: function (ev) { var v = ev.target.value; ev.target.value = ''; if (v) ajouter(sv, prop.filter(function (x) { return x.code === v; })[0].titre); } },
            [h('option', { value: '', text: '+ Rubrique proposée…' })].concat(prop.map(function (x) { return h('option', { value: x.code, text: x.titre }); }))) : null,
          h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleRubrique(null, sv); } }, '+ Nouvelle rubrique')) : null),
      liste.length ? liste.map(function (r) { return rubrique(r, liste); }) : h('p', { class: 'muted', text: sv === I.ETABLISSEMENT ? 'Page de l’établissement vide : elle n’est pas affichée aux agents.' : 'Page vide : ajoutez une rubrique proposée ou une nouvelle rubrique.' }));
  }
  async function ajouter(sv, titre) {
    try { await s().enregistrer('INFO_RUBRIQUE', { id: 'IR' + C.hex(C.aleatoire(5)), service: sv, titre: titre, ordre: I.ordreSuivant(st(), sv), texte: '', contacts: [], pieces: [] }); U.toast('Rubrique ajoutée.'); }
    catch (e) { alert(e.message); }
  }

  function modaleRubrique(r, sv) {
    var o = opts(), nouveau = !r;
    r = r || { titre: '', texte: '', contacts: [], pieces: [] };
    var titre = h('input', { type: 'text', maxlength: I.MAX.titre, value: r.titre, 'aria-label': 'Titre' });
    var texte = h('textarea', { rows: 6, maxlength: I.MAX.texte, 'aria-label': 'Texte' }); texte.value = r.texte || '';
    var lignes = r.contacts.map(function (c) { return Object.assign({}, c); }), zoneC = h('div', { class: 'pile' });
    var pieces = r.pieces.slice(), nouvelles = [], zoneP = h('div', { class: 'pile' });
    function majContacts() {
      U.vider(zoneC);
      lignes.forEach(function (c, i) {
        function champ(cle, lib, n) { var x = h('input', { type: 'text', maxlength: n, value: c[cle] || '', placeholder: lib, 'aria-label': lib + ' (contact ' + (i + 1) + ')' }); x.addEventListener('input', function () { c[cle] = x.value; }); return x; }
        var ag = h('select', { 'aria-label': 'Compte de l’agent (contact ' + (i + 1) + ')', title: 'Compte Tessera du contact, pour lui écrire un message' }, [h('option', { value: '', text: '— Sans compte —' })].concat(agents().map(function (a) { return h('option', { value: a.id, text: a.nom, selected: a.id === c.agent }); })));
        ag.addEventListener('change', function () { c.agent = ag.value; if (ag.value && !c.nom) { c.nom = nomAgent(ag.value); majContacts(); } });
        zoneC.appendChild(h('div', { class: 'is-ligne-contact' }, champ('nom', 'Nom', I.MAX.nom), champ('fonction', 'Fonction', I.MAX.fonction), champ('numero', 'Numéro', I.MAX.numero), champ('courriel', 'Courriel', I.MAX.courriel), ag,
          h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le contact ' + (i + 1), onclick: function () { lignes.splice(i, 1); majContacts(); } }, '✕')));
      });
      zoneC.appendChild(h('div', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { lignes.push({ nom: '', fonction: '', numero: '', courriel: '', agent: '' }); majContacts(); } }, '+ Contact')));
    }
    function majPieces() {
      U.vider(zoneP);
      pieces.concat(nouvelles).forEach(function (p) {
        zoneP.appendChild(h('div', { class: 'actions gauche' }, h('span', { text: '📄 ' + p.nom + ' (' + taille(p.taille) + ')' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { var k = pieces.indexOf(p); if (k >= 0) pieces.splice(k, 1); else nouvelles.splice(nouvelles.indexOf(p), 1); majPieces(); } }, 'Retirer')));
      });
      if (o.piecesJointes) {
        var f = h('input', { type: 'file', multiple: true, 'aria-label': 'Ajouter des pièces jointes' });
        f.addEventListener('change', function () {
          Array.prototype.forEach.call(f.files, function (x) {
            if (x.size > o.tailleMaxMo * 1048576) { alert('« ' + x.name + ' » dépasse ' + o.tailleMaxMo + ' Mo.'); return; }
            nouvelles.push({ fichier: x, nom: x.name, taille: x.size });
          });
          majPieces();
        });
        zoneP.appendChild(h('label', {}, 'Ajouter des pièces jointes (' + o.tailleMaxMo + ' Mo au plus par fichier ; procédures en PDF, par exemple)', f));
      } else if (!pieces.length) zoneP.appendChild(h('small', { class: 'muted', text: 'Pièces jointes non autorisées (réglage de l’administrateur).' }));
    }
    majContacts(); majPieces();
    U.modale(nouveau ? 'Nouvelle rubrique' : 'Modifier « ' + r.titre + ' »', h('div', { class: 'pile' },
      h('label', {}, 'Titre', titre), h('label', {}, 'Texte (retours à la ligne gardés ; aucune donnée de patient)', texte),
      h('h3', { text: 'Contacts' }), h('small', { class: 'muted', text: 'Un numéro se copie d’un clic ; un contact relié à un compte reçoit un message d’un clic.' }), zoneC,
      h('h3', { text: 'Pièces jointes' }), zoneP),
    [{ texte: 'Annuler' }, nouveau ? null : { texte: 'Retirer la rubrique', classe: 'danger', action: async function () {
      if (!confirm('Retirer la rubrique « ' + r.titre + ' » ? Elle reste au journal.')) return false;
      await s().enregistrer('INFO_RUBRIQUE', { id: r.id, supprime: true }); U.toast('Rubrique retirée.');
    } }, { texte: 'Enregistrer', classe: 'primaire', action: async function () {
      if (!titre.value.trim()) { titre.focus(); throw new Error('Indiquez le titre de la rubrique.'); }
      var ps = pieces.slice();
      for (var k = 0; k < nouvelles.length; k++) {
        var oct = new Uint8Array(await nouvelles[k].fichier.arrayBuffer());
        ps.push({ id: await s().enregistrerPiece('infos', oct), nom: nouvelles[k].nom, taille: nouvelles[k].taille });
      }
      var d = { id: r.id || 'IR' + C.hex(C.aleatoire(5)), titre: titre.value.trim(), texte: texte.value, contacts: lignes.filter(function (c) { return (c.nom || '').trim() || (c.numero || '').trim(); }), pieces: ps };
      if (nouveau) { d.service = sv; d.ordre = I.ordreSuivant(st(), sv); }
      await s().enregistrer('INFO_RUBRIQUE', d);
      U.toast('Rubrique enregistrée.');
    } }].filter(Boolean), { large: true, focus: nouveau ? titre : null });
  }

  // ------------------------------------------------------------ Vues
  function choixService() {
    var mes = U.services();
    if (U.App.service !== '*' || mes.length < 2) return null;
    var sel = h('select', { 'aria-label': 'Service', class: 'champ-moyen', onchange: function () { vue.service = sel.value; U.rendreContenu(); } }, mes.map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === service() }); }));
    return h('label', { class: 'en-ligne' }, 'Service', sel);
  }
  function vuePage() {
    var sv = service();
    var etab = page(I.ETABLISSEMENT, 'Établissement — ' + (U.etablissement ? U.etablissement() : ''));
    return h('div', { class: 'pile' }, choixService(), etab,
      sv ? page(sv, 'Service ' + U.libService(sv)) : h('p', { class: 'muted', text: 'Aucun service ne vous est affecté.' }));
  }
  function vueAnnuaire() {
    var sv = service(), liste = I.contacts(st(), I.ETABLISSEMENT).map(function (c) { return Object.assign({}, c, { rubrique: 'Établissement — ' + c.rubrique }); }).concat(sv ? I.contacts(st(), sv) : []);
    return h('div', { class: 'pile' }, choixService(), h('section', { class: 'panneau' }, h('h2', { text: 'Contacts' + (sv ? ' — ' + U.libService(sv) : '') }),
      h('p', { class: 'muted', text: 'Tous les contacts des pages de l’établissement et du service. Un clic sur un numéro ou une adresse le copie.' }),
      liste.length ? tableContacts(liste, true) : h('p', { class: 'muted', text: 'Aucun contact pour l’instant.' })));
  }

  // ------------------------------------------------------------ Administration
  function panneauReglages() {
    var o = opts(), v = JSON.parse(JSON.stringify(U.config().infos || {}));
    var pj = h('input', { type: 'checkbox', checked: o.piecesJointes }), tm = h('input', { type: 'number', min: 1, max: 20, value: o.tailleMaxMo, 'aria-label': 'Taille maximale (Mo)', class: 'champ-court' });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Informations du service' }),
      h('p', { class: 'muted', text: 'Le cadre tient la page de ses services ; l’administrateur tient celle de l’établissement (fenêtre « Informations du service »).' }),
      h('label', { class: 'case' }, pj, h('span', { text: 'Autoriser les pièces jointes (procédures en PDF…) — désactivé par défaut ; aucun contrôle antivirus par l’application' })),
      h('label', { class: 'en-ligne' }, 'Taille maximale d’un fichier (Mo)', tm),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try { v.piecesJointes = pj.checked; v.tailleMaxMo = Math.max(1, Math.min(20, Math.round(+tm.value) || 5)); await U.enregistrerConfig([['infos', v]]); U.toast('Réglages enregistrés.'); } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }

  // ------------------------------------------------------------ Journal
  function resume(e) {
    var d = e.data || {}, r = st().rubriques[d.id], t = d.titre || (r && r.titre) || 'rubrique', sv = (r && r.service) || d.service;
    var ou = sv === I.ETABLISSEMENT ? ' (établissement)' : sv ? ' (' + U.libService(sv) + ')' : '';
    if (d.supprime) return 'Rubrique retirée : ' + t + ou;
    if (d.masquee !== undefined && Object.keys(d).length <= 2) return (d.masquee ? 'Rubrique masquée : ' : 'Rubrique affichée : ') + t + ou;
    if (d.ordre !== undefined && Object.keys(d).length <= 2) return 'Rubrique déplacée : ' + t + ou;
    return 'Rubrique : ' + t + ou + (Array.isArray(d.contacts) && d.contacts.length ? ' — ' + d.contacts.length + ' contact(s)' : '') + (Array.isArray(d.pieces) && d.pieces.length ? ', ' + d.pieces.length + ' pièce(s) jointe(s)' : '');
  }

  SIC.modules.completerInterface('infos', {
    vues: { page: vuePage, annuaire: vueAnnuaire },
    journal: { resume: resume, action: function () { return 'Informations : rubrique'; }, libelleType: function () { return 'Informations : rubrique'; }, effetAnnulation: function () { return 'La rubrique revient à son état précédent.'; } },
    admin: { onglets: function () { return [['infos', 'Informations du service', [panneauReglages()]]]; } }
  });
  U.infos = { contacts: function (sv) { try { return I.contacts(st(), sv); } catch (e) { return []; } } };
})();
