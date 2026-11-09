// SPDX-License-Identifier: EUPL-1.2
/*
 * Interface commune des champs ajoutés et des réglages des données (0.18.0, plan « Vue d'ensemble ») : saisie d'une
 * valeur selon son type, notes et check-lists, rendu des couleurs, éditeur des définitions (administrateur, cadre),
 * éditeur des réglages d'une donnée (couleurs, délai). Utilisée par la fiche patient, l'administration et la Vue
 * d'ensemble. Logique : champs.js, couleurs.js (sous Node).
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h, CH = SIC.champs, CO = SIC.couleurs, C = SIC.crypto;

  function idCourt(p) { return (p || 'n') + C.hex(C.aleatoire(4)); }
  function session() { return U.App.session; }
  function roles() { return session().roles(); }
  function rolesConfig() { return SIC.modules.obtenir('isocont').droits.rolesConfig(U.config()).filter(function (r) { return !r.admin; }); }

  // ------------------------------------------------------------ Lecture et enregistrement d'une valeur
  /** Valeur d'une donnée pour une entité : fiche patient (COMPLEMENT) ou valeurs ajoutées (VALEUR). */
  function valeurDe(champ, entite, id, fiche) {
    if (CH.typeSaisie(champ) === 'COMPLEMENT') {
      var f = fiche || (entite === 'patient' && session().etat && session().etat.patients && session().etat.patients[id]);
      return ((f && f.complements) || {})[champ.id];
    }
    var v = session().valeurs()[entite] || {};
    return (v[id] || {})[champ.id];
  }
  /** Peut-on lire la donnée (rôles réglés, clé propre détenue) ? */
  function lisible(champ) {
    if (!CH.peutVoir(champ, roles())) return false;
    var cle = CH.cleDe(champ) || champ.module, t = session().trousseau;
    if (!t) return true;
    var j = t[cle];
    return !!j && (j.v1 || !!j.maitresse || Object.keys(j.octets || {}).length > 0);
  }
  /**
   * Raison pour laquelle une donnée n'est pas proposée à l'agent ('' si elle l'est) : masquée, rôle qui ne la voit pas,
   * clé propre pas encore créée (connexion suivante d'un administrateur), clé non détenue.
   */
  function raisonIndisponible(champ) {
    if (!champ.actif) return 'masquée';
    if (!CH.peutVoir(champ, roles())) return 'votre rôle ne la voit pas';
    var cle = CH.cleDe(champ), s = session();
    if (cle && !(s.coffre && s.coffre.cles && s.coffre.cles[cle])) return 'clé propre pas encore créée : elle le sera à la prochaine connexion d’un administrateur';
    if (!lisible(champ)) return cle ? 'vous n’avez pas sa clé propre' : 'vous n’avez pas la clé du module « ' + (((SIC.modules.obtenir(champ.module) || {}).libelle) || champ.module) + ' »';
    return '';
  }
  function modifiable(champ) { return lisible(champ) && !session().apercu && CH.peutSaisir(champ, roles(), session().ecritDans(champ.module)); }
  /** Enregistre une valeur (`valeur`) ou une opération (`op`) pour une entité. */
  async function enregistrer(champ, entite, id, contenu) {
    var t = CH.typeSaisie(champ), d;
    if (t === 'COMPLEMENT') d = Object.assign({ patientId: id, champ: champ.id }, contenu);
    else d = Object.assign({ entite: entite, id: id, champ: champ.id }, contenu);
    if (d.valeur !== undefined) d.valeur = CH.valeur(champ, d.valeur);
    if (d.op) d.op = CH.operation(champ, d.op);
    return session().enregistrer(t, d);
  }

  // ------------------------------------------------------------ Saisie selon le type
  function listeAgents() {
    var id = 'ag-' + C.hex(C.aleatoire(3));
    return { id: id, el: h('datalist', { id: id }, (session().comptes || []).filter(function (c) { return c.actif !== false && c.id !== 'secours'; }).map(function (c) { return h('option', { value: c.nom }); })) };
  }
  /**
   * Champ de saisie d'une valeur simple : { el, lire() } (notes et check-lists : voir `notes` et `checklist`).
   * options : { disabled }.
   */
  function saisie(champ, v, options) {
    var o = options || {}, d0 = o.disabled ? { disabled: true } : {}, el, lire;
    switch (champ.type) {
      case 'ouiNon':
        el = h('select', d0, [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (v === true ? 'oui' : v === false ? 'non' : '') === x[0] }); }));
        lire = function () { return el.value; }; break;
      case 'liste':
        el = h('select', d0, [h('option', { value: '', text: '—' })].concat(champ.choix.map(function (x) { return h('option', { value: x, text: x, selected: v === x }); })));
        lire = function () { return el.value; }; break;
      case 'choixMultiple':
        var cases = champ.choix.map(function (x) { return h('input', Object.assign({ type: 'checkbox', value: x, checked: Array.isArray(v) && v.indexOf(x) >= 0 }, d0)); });
        el = h('div', { class: 'actions gauche choix-multiple' }, cases.map(function (cb) { return h('label', { class: 'case' }, cb, h('span', { text: cb.value })); }));
        lire = function () { return cases.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }); }; break;
      case 'date':
        el = h('input', Object.assign({ type: 'date', value: v || '' }, d0)); lire = function () { return el.value; }; break;
      case 'dateFenetre':
        var x = v || {}, deb = h('input', Object.assign({ type: 'date', value: x.debut || '', 'aria-label': 'Date ou début' }, d0)), fin = h('input', Object.assign({ type: 'date', value: x.fin || '', 'aria-label': 'Fin (facultatif)' }, d0));
        var pr = h('input', Object.assign({ type: 'text', maxlength: 80, value: x.precision || '', placeholder: 'Précision (ex. après la synthèse)', 'aria-label': 'Précision' }, d0));
        el = h('div', { class: 'date-fenetre' }, deb, h('span', { class: 'muted', text: 'au' }), fin, pr);
        lire = function () { return deb.value || pr.value.trim() ? { debut: deb.value, fin: fin.value, precision: pr.value } : ''; }; break;
      case 'nombre':
        el = h('input', Object.assign({ type: 'number', value: v === undefined || v === null ? '' : v }, d0)); lire = function () { return el.value === '' ? '' : +el.value; }; break;
      case 'telephone':
        el = h('input', Object.assign({ type: 'tel', maxlength: 30, value: v || '', placeholder: 'ex. 01 23 45 67 89' }, d0)); lire = function () { return el.value.trim(); }; break;
      case 'professionnel':
        var la = listeAgents();
        el = h('span', {}, h('input', Object.assign({ type: 'text', maxlength: 80, list: la.id, value: (v && v.nom) || '', placeholder: 'Nom du professionnel' }, d0)), la.el);
        lire = function () { var n = el.firstChild.value.trim(); if (!n) return ''; var a = (session().comptes || []).filter(function (y) { return y.nom === n; })[0]; return { id: a ? a.id : null, nom: n }; }; break;
      default:
        el = h('input', Object.assign({ type: 'text', maxlength: 200, value: v || '' }, d0)); lire = function () { return el.value.trim(); };
    }
    return { el: el, lire: lire };
  }

  // ------------------------------------------------------------ Notes et check-lists (enregistrées aussitôt)
  /** Liste de notes : ajout (texte, importance), retrait par l'auteur et le cadre. options : { peut, enregistrerOp(op), apres() }. */
  function notes(champ, v, options) {
    var o = options || {}, moi = session().utilisateur && session().utilisateur.id, cadre = roles().some(function (r) { return r === 'CADRE' || r === 'ADMIN'; });
    var l = CH.notes(champ, v);
    var liste = h('ul', { class: 'notes-liste' }, l.length ? l.map(function (n) {
      var peutRetirer = o.peut && (n.par === moi || cadre);
      return h('li', { class: 'note imp-' + n.importance },
        h('span', { class: 'note-texte', text: n.texte }),
        h('small', { class: 'muted', text: ' — ' + session().nomAuteur(n.par) + ', ' + U.court(Date.parse(n.le)) + (n.importance !== 'info' ? ' — ' + CH.IMPORTANCES[n.importance] : '') }),
        peutRetirer ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la note', title: 'Retirer (la note reste dans l’historique)', onclick: async function () {
          if (!confirm('Retirer cette note ? Elle reste dans l’historique.')) return;
          try { await o.enregistrerOp({ retrait: n.id }); if (o.apres) o.apres(); } catch (e) { alert(e.message); }
        } }, '✕') : null);
    }) : [h('li', { class: 'muted', text: 'Aucune note.' })]);
    if (!o.peut) return h('div', { class: 'notes' }, liste);
    var t = h('input', { type: 'text', maxlength: 300, placeholder: 'Note courte et organisationnelle', 'aria-label': 'Nouvelle note' });
    var imp = h('select', { 'aria-label': 'Importance' }, Object.keys(CH.IMPORTANCES).map(function (k) { return h('option', { value: k, text: CH.IMPORTANCES[k] }); }));
    var ajouter = async function () {
      if (!t.value.trim()) return t.focus();
      try { await o.enregistrerOp({ ajout: { id: idCourt('n'), texte: t.value, importance: imp.value } }); t.value = ''; if (o.apres) o.apres(); } catch (e) { alert(e.message); }
    };
    t.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ajouter(); } });
    return h('div', { class: 'notes' }, liste, h('div', { class: 'actions gauche' }, t, imp, h('button', { class: 'btn petit', type: 'button', onclick: ajouter }, 'Ajouter')),
      h('small', { class: 'muted', text: 'Aucune donnée clinique : les notes relèvent de l’organisation (démarches, rendez-vous, points à voir).' }));
  }
  /** Check-list : éléments du modèle et éléments libres (si la donnée le permet), cochés aussitôt et datés. */
  function checklist(champ, v, options) {
    var o = options || {}, k = CH.checklist(champ, v);
    var corps = h('ul', { class: 'checklist' }, k.elements.length ? k.elements.map(function (e) {
      var cb = h('input', { type: 'checkbox', checked: e.fait, disabled: !o.peut, onchange: async function () {
        try { await o.enregistrerOp({ cocher: { element: e.id, fait: cb.checked } }); if (o.apres) o.apres(); } catch (err) { alert(err.message); cb.checked = !cb.checked; }
      } });
      return h('li', {}, h('label', { class: 'case' }, cb, h('span', { text: e.libelle })),
        e.cocheLe ? h('small', { class: 'muted', text: ' ' + (e.fait ? 'fait' : 'décoché') + ' le ' + U.court(Date.parse(e.cocheLe)) + ' (' + session().nomAuteur(e.cochePar) + ')' }) : null,
        e.libre && o.peut ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer l’élément', onclick: async function () {
          if (!confirm('Retirer « ' + e.libelle + ' » ? Il reste dans l’historique.')) return;
          try { await o.enregistrerOp({ retrait: e.id }); if (o.apres) o.apres(); } catch (err) { alert(err.message); }
        } }, '✕') : null);
    }) : [h('li', { class: 'muted', text: 'Aucun élément.' })]);
    var pied = null;
    if (o.peut && champ.libre) {
      var t = h('input', { type: 'text', maxlength: 80, placeholder: 'Élément propre à ce patient', 'aria-label': 'Nouvel élément' });
      pied = h('div', { class: 'actions gauche' }, t, h('button', { class: 'btn petit', type: 'button', onclick: async function () {
        if (!t.value.trim()) return t.focus();
        try { await o.enregistrerOp({ ajout: { id: idCourt('e'), libelle: t.value } }); t.value = ''; if (o.apres) o.apres(); } catch (e) { alert(e.message); }
      } }, 'Ajouter'));
    }
    return h('div', { class: 'checklist-bloc' }, h('small', { class: 'muted', text: k.total ? k.faits + ' fait(s) sur ' + k.total : '' }), corps, pied);
  }

  // ------------------------------------------------------------ Rendu des couleurs
  /** Classe CSS d'une couleur (fond, texte ou pastille) ; '' sans couleur. */
  function classeCouleur(r) { return !r || r.rendu === 'pastille' ? '' : (r.rendu === 'texte' ? 'ct-' : 'cf-') + r.couleur; }
  /** Pastille ou symbole (noir et blanc) précédant le contenu d'une case colorée. */
  function marque(r) { return r ? h('span', { class: 'marque-couleur' + (r.rendu === 'pastille' ? ' pastille-couleur cpv-' + r.couleur : ''), 'aria-hidden': 'true', 'data-symbole': r.symbole }, r.rendu === 'pastille' ? '' : '') : null; }
  /** Légende : [{ couleur, symbole, libelle }]. */
  function legende(items) {
    if (!items || !items.length) return null;
    return h('div', { class: 'legende-couleurs' }, items.map(function (l) { return h('span', { class: 'legende-item' }, h('span', { class: 'echantillon cf-' + l.couleur, 'data-symbole': l.symbole }), h('span', { text: l.libelle })); }));
  }

  // ------------------------------------------------------------ Choix multiple de services ou de rôles
  function multi(liste, options, vide, aria, disabled) {
    var resume = h('span', {}), d = h('details', { class: 'multi' }, h('summary', { 'aria-label': aria }, resume));
    function maj() { resume.textContent = liste.length ? options.filter(function (o) { return liste.indexOf(o.code) >= 0; }).map(function (o) { return o.libelle; }).join(', ') : vide; }
    options.forEach(function (o) {
      var cb = h('input', { type: 'checkbox', checked: liste.indexOf(o.code) >= 0, disabled: !!disabled, onchange: function () { var i = liste.indexOf(o.code); if (cb.checked && i < 0) liste.push(o.code); if (!cb.checked && i >= 0) liste.splice(i, 1); maj(); } });
      d.appendChild(h('label', { class: 'case' }, cb, h('span', { text: o.libelle })));
    });
    maj();
    return d;
  }

  // ------------------------------------------------------------ Éditeur des définitions (administrateur, cadre)
  /** Liste brute enregistrée (`champsAjoutes`, à défaut reprise des données complémentaires de la fiche). */
  function definitionsBrutes() {
    var cfg = U.config();
    if (Array.isArray(cfg.champsAjoutes)) return JSON.parse(JSON.stringify(cfg.champsAjoutes));
    return CH.definitions(cfg, { tous: true }).map(function (c) { var o = JSON.parse(JSON.stringify(c)); delete o.par; return o; });
  }
  function modulesRattachables(entite) {
    return SIC.modules.liste().filter(function (m) {
      if (entite === 'patient' && m.id === 'vehicules') return false;
      return m.id !== 'vue';
    }).map(function (m) { return { code: m.id, libelle: m.libelle }; });
  }
  /**
   * Fenêtre d'une définition (création ou modification). `c` : définition brute ; `cadre` : réglée par le cadre (ses
   * services seulement, pas d'option « donnée clinique »). Rend la définition modifiée ou null.
   */
  function modaleDefinition(c, existant, cadre) {
    return new Promise(function (resoudre) {
      var x = JSON.parse(JSON.stringify(c)), admin = roles().indexOf('ADMIN') >= 0, rs = rolesConfig();
      x.services = x.services || []; x.saisie = x.saisie || []; x.lecture = x.lecture || [];
      var mesServices = cadre ? (session().utilisateur.services || []) : null;
      var lib = h('input', { type: 'text', maxlength: 60, value: x.libelle || '' });
      var typ = h('select', { disabled: !!existant }, Object.keys(CH.TYPES).map(function (k) { return h('option', { value: k, text: CH.TYPES[k], selected: x.type === k }); }));
      var ent = h('select', { disabled: !!existant }, Object.keys(CH.ENTITES).map(function (k) { return h('option', { value: k, text: CH.ENTITES[k], selected: (x.entite || 'patient') === k }); }));
      var mod = h('select', { disabled: !!existant });
      function remplirModules() { U.vider(mod); if (ent.value === 'agent') { mod.appendChild(h('option', { value: 'vue', text: 'Données du personnel (clé propre)' })); return; } modulesRattachables(ent.value).forEach(function (m) { mod.appendChild(h('option', { value: m.code, text: m.libelle, selected: (x.module || (ent.value === 'medecin' ? 'suivi' : 'patients')) === m.code })); }); }
      // Donnée d'un agent (0.20.0) : clé propre obligatoire, cadre seul par défaut, avertissement « données du personnel »
      var avertAgent = h('div', { class: 'alerte', text: CH.AVERTISSEMENT_AGENT });
      function selonEntite() {
        var ag = ent.value === 'agent';
        avertAgent.hidden = !ag; mod.disabled = !!existant || ag;
        if (ligneTiers) ligneTiers.hidden = ag;
        if (ligneClin) ligneClin.hidden = ag;
        if (ag) { prot.value = 'cle'; prot.disabled = true; if (!x.lecture.length) x.lecture.push('CADRE'); if (!x.saisie.length) x.saisie.push('CADRE'); }
        else if (!existant && !clin.checked) prot.disabled = false;
      }
      ent.addEventListener('change', function () { remplirModules(); selonEntite(); }); remplirModules();
      var prot = h('select', { disabled: !!existant || x.clinique }, Object.keys(CH.PROTECTIONS).map(function (k) { return h('option', { value: k, text: CH.PROTECTIONS[k], selected: (x.protection || 'interface') === k }); }));
      var tiers = h('input', { type: 'checkbox', checked: !!x.tiers });
      var clin = h('input', { type: 'checkbox', checked: !!x.clinique, disabled: !admin || (existant && x.clinique) });
      clin.addEventListener('change', function () {
        if (clin.checked && !confirm('Option « donnée clinique ».\n\nTessera ne doit contenir aucune donnée clinique : elle relève du dossier patient informatisé. Activer cette option engage l’établissement : avis du délégué à la protection des données (DPO, référent RGPD), inscription au registre des traitements, durée de conservation. La donnée aura une clé propre, remise aux seuls rôles réglés, et l’activation est tracée au journal.\n\nActiver ?')) { clin.checked = false; return; }
        if (clin.checked) { prot.value = 'cle'; prot.disabled = true; } else if (!existant) prot.disabled = false;
      });
      var ligneTiers = h('label', { class: 'case' }, tiers, h('span', { text: 'Information concernant un tiers : exclue des exports remis au patient (droit d’accès)' }));
      var ligneClin = admin ? h('label', { class: 'case' }, clin, h('span', { text: 'Donnée clinique (option réservée à l’administrateur, après avertissement)' })) : null;
      selonEntite();
      var zoneType = h('div', { class: 'pile' });
      var choix, modele, libre, tri, formule;
      function dessinerType() {
        U.vider(zoneType); choix = modele = libre = tri = formule = null;
        if (typ.value === 'liste' || typ.value === 'choixMultiple') { choix = h('input', { type: 'text', value: (x.choix || []).join(' ; '), placeholder: 'Choix séparés par « ; »' }); zoneType.appendChild(h('label', {}, 'Choix proposés', choix)); }
        if (typ.value === 'checklist') {
          modele = h('textarea', { rows: 4, placeholder: 'Un élément par ligne (modèle commun à tous)' }, (x.modele || []).filter(function (e) { return e.actif !== false; }).map(function (e) { return e.libelle; }).join('\n'));
          libre = h('input', { type: 'checkbox', checked: x.libre === true || !(x.modele || []).length });
          zoneType.appendChild(h('label', {}, 'Éléments du modèle', modele));
          zoneType.appendChild(h('label', { class: 'case' }, libre, h('span', { text: 'Permettre d’ajouter des éléments propres à chaque patient' })));
        }
        if (typ.value === 'notes') { tri = h('select', {}, [['desc', 'Plus récentes en premier'], ['asc', 'Plus anciennes en premier']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (x.tri || 'desc') === o[0] }); })); zoneType.appendChild(h('label', {}, 'Ordre des notes', tri)); }
        if (typ.value === 'formule') {
          formule = h('textarea', { rows: 3, class: 'mono', placeholder: 'ex. JOURS([Date d’entrée])' }, x.formule || '');
          zoneType.appendChild(h('label', {}, 'Formule', formule));
          if (U.formules && U.formules.aide) zoneType.appendChild(U.formules.aide(formule, ent.value));
        }
      }
      typ.addEventListener('change', dessinerType); dessinerType();
      var svOptions = U.tousServices().filter(function (s) { return !mesServices || mesServices.indexOf(s.code) >= 0; }).map(function (s) { return { code: s.code, libelle: s.libelle }; });
      if (cadre && !x.services.length) x.services = mesServices.slice();
      var corps = h('div', { class: 'pile' }, avertAgent,
        h('div', { class: 'grille-2' }, h('label', {}, 'Nom de la donnée', lib), h('label', {}, 'Type de valeur', typ)),
        h('div', { class: 'grille-2' }, h('label', {}, 'Donnée d’un', ent), h('label', {}, 'Rattachée au module (ses valeurs y sont rangées, chiffrées par sa clé)', mod)),
        zoneType,
        h('div', { class: 'grille-3' },
          h('label', {}, 'Services', multi(x.services, svOptions, cadre ? 'Choisir' : 'Tous les services', 'Services')),
          h('label', {}, 'Modifiée par', multi(x.saisie, rs.map(function (r) { return { code: r.code, libelle: r.libelle }; }), 'Rôles qui écrivent dans le module', 'Modifiée par')),
          h('label', {}, 'Visible par', multi(x.lecture, rs.map(function (r) { return { code: r.code, libelle: r.libelle }; }), 'Tous', 'Visible par'))),
        h('label', {}, 'Protection', prot),
        h('small', { class: 'muted', text: 'Clé propre : seuls les rôles cochés (« Visible par », « Modifiée par ») reçoivent la clé qui déchiffre la donnée ; indiquez-les. La protection ne change plus une fois la donnée enregistrée.' }),
        ligneTiers, ligneClin,
        h('div', { class: 'alerte', text: 'Aucune donnée clinique par défaut : ni traitement, ni diagnostic, ni symptôme, ni antécédent. Chaque donnée ajoutée est à inscrire au registre des traitements (délégué à la protection des données).' }));
      U.modale(existant ? 'Modifier la donnée' : 'Nouvelle donnée', corps, [{ texte: 'Annuler' }, { texte: 'Valider', classe: 'primaire', action: async function () {
        var n = lib.value.trim();
        if (!n) throw new Error('Indiquez le nom de la donnée.');
        if (ent.value === 'agent' && !existant && !confirm('Donnée d’un agent.\n\n' + CH.AVERTISSEMENT_AGENT + '\n\nCréer cette donnée ?')) return false;
        var mots = CH.libelleClinique(n);
        if (mots.length && !clin.checked && !confirm('« ' + n + ' » évoque une donnée clinique (' + mots.join(', ') + '), qui relève du dossier patient informatisé. Continuer ?')) return false;
        var o = { id: x.id, libelle: n, type: typ.value, entite: ent.value, module: mod.value, services: x.services, saisie: x.saisie, lecture: x.lecture };
        if (choix) { o.choix = choix.value.split(';').map(function (y) { return y.trim(); }).filter(Boolean); if (!o.choix.length) throw new Error('Indiquez les choix proposés.'); }
        if (modele) {
          var anciens = x.modele || [], lignes = modele.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
          o.modele = lignes.map(function (l) { var a = anciens.filter(function (e) { return e.libelle === l; })[0]; return { id: a ? a.id : CH.identifiant(l, anciens.map(function (e) { return e.id; })), libelle: l }; });
          // Élément retiré du modèle : masqué, son historique est gardé
          anciens.forEach(function (e) { if (!o.modele.some(function (m) { return m.id === e.id; })) o.modele.push({ id: e.id, libelle: e.libelle, actif: false }); });
          if (libre.checked) o.libre = true;
        }
        if (tri) o.tri = tri.value;
        if (formule) { o.formule = formule.value.trim(); if (!o.formule) throw new Error('Indiquez la formule.'); if (U.formules && U.formules.verifier) U.formules.verifier(o.formule); }
        if (prot.value === 'cle' || clin.checked) o.protection = 'cle';
        if (o.protection === 'cle' && !o.lecture.length && !o.saisie.length) throw new Error('Donnée à clé propre : cochez les rôles qui la voient ou la modifient.');
        if (tiers.checked) o.tiers = true;
        if (clin.checked) o.clinique = true;
        if (x.actif === false) o.actif = false;
        o.par = x.par || { role: cadre ? 'CADRE' : 'ADMIN', services: cadre ? x.services.slice() : [] };
        if (cadre && !o.services.length) throw new Error('Choisissez un ou plusieurs de vos services.');
        resoudre(o);
      } }], { large: true }).then(function (r) { if (r === null) resoudre(null); });
    });
  }
  /**
   * Panneau des données ajoutées : une ligne par donnée (nom, type, entité, module, services, droits, protection),
   * ajout et modification par fenêtre. options : { cadre (réglage du cadre : ses services), entite (filtre), titre, apres }.
   */
  function panneauDefinitions(options) {
    var o = options || {}, corps = h('tbody');
    var mesServices = o.cadre ? (session().utilisateur.services || []) : null;
    function siens(c) { return !o.cadre || ((c.services || []).length > 0 && c.services.every(function (s) { return mesServices.indexOf(s) >= 0; })); }
    // Chaque changement est enregistré aussitôt (la fenêtre de la donnée se ferme sur l'enregistrement)
    async function enregistrerListe(liste) {
      var v = liste.map(function (c) { return JSON.parse(JSON.stringify(c)); });
      CH.controlerListe(Array.isArray(U.config().champsAjoutes) ? U.config().champsAjoutes : [], v);
      await U.enregistrerConfig([['champsAjoutes', v]]);
      if (o.apres) o.apres();
    }
    async function modifier(c) {
      var liste = definitionsBrutes(), i = liste.map(function (x) { return x.id; }).indexOf(c ? c.id : null);
      var r = await modaleDefinition(c || { id: '', libelle: '', type: 'texte', entite: o.entite || 'patient', services: [], saisie: [], lecture: [] }, !!c, o.cadre);
      if (!r) return;
      if (i >= 0) liste[i] = r; else { r.id = CH.identifiant(r.libelle, liste.map(function (x) { return x.id; })); liste.push(r); }
      try { await enregistrerListe(liste); } catch (e) { alert(e.message); }
    }
    var libR = {}; rolesConfig().forEach(function (r) { libR[r.code] = r.libelle; });
    function libRoles(l) { return l.map(function (c) { return libR[c] || c; }).join(', '); }
    var liste = definitionsBrutes();
    var vus = liste.filter(function (c) { return !o.entite || (c.entite || 'patient') === o.entite; });
    vus.forEach(function (c) {
      var n = CH.normaliser(c) || c, peut = siens(c);
      var actif = h('input', { type: 'checkbox', checked: c.actif !== false, disabled: !peut, 'aria-label': 'Proposée', title: 'Décochée : donnée masquée (ses valeurs restent au journal)', onchange: async function () {
        var l = definitionsBrutes(), x = l.filter(function (y) { return y.id === c.id; })[0];
        if (actif.checked) delete x.actif; else x.actif = false;
        try { await enregistrerListe(l); U.rendreContenu(); } catch (e) { alert(e.message); actif.checked = !actif.checked; }
      } });
      corps.appendChild(h('tr', { class: c.actif === false ? 'ancienne' : '' },
        h('td', {}, h('b', { text: c.libelle }), n.clinique ? h('span', { class: 'badge bad', text: 'clinique' }) : null, n.tiers ? h('span', { class: 'badge', text: 'tiers' }) : null),
        h('td', { text: CH.TYPES[c.type] || c.type }), h('td', { text: CH.ENTITES[n.entite] || '' }),
        h('td', { text: ((SIC.modules.obtenir(n.module) || {}).libelle) || n.module }),
        h('td', { text: (n.services || []).length ? n.services.map(U.libService).join(', ') : 'Tous' }),
        h('td', { text: (n.lecture || []).length ? libRoles(n.lecture) : 'Tous' }),
        h('td', { text: (n.saisie || []).length ? libRoles(n.saisie) : 'Rôles du module' }),
        h('td', { text: n.protection === 'cle' ? 'Clé propre' : 'Écran' }),
        h('td', {}, actif),
        h('td', { class: 'actions-ligne' }, peut ? h('button', { class: 'btn petit', type: 'button', onclick: function () { modifier(c); } }, 'Modifier') : h('small', { class: 'muted', text: 'Administrateur' }))));
    });
    if (!vus.length) corps.appendChild(h('tr', {}, h('td', { colspan: 10, class: 'muted', text: 'Aucune donnée ajoutée.' })));
    return h('section', { class: 'panneau' }, h('h2', { text: o.titre || 'Données ajoutées' }),
      h('p', { class: 'muted', text: 'Données propres à l’établissement ou à un service, pour les patients ou les médecins. Chacune devient une colonne de la liste des patients et de la Vue d’ensemble, et une ligne de la fiche. Ses valeurs sont rangées dans le module de rattachement (ou sous une clé propre). Une donnée retirée après usage est masquée (décochez « Proposée ») : ses valeurs restent au journal. Chaque changement est enregistré aussitôt.' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table-champs' },
        h('thead', {}, h('tr', {}, ['Donnée', 'Type', 'Donnée d’un', 'Module', 'Services', 'Visible par', 'Modifiée par', 'Protection', 'Proposée', ''].map(function (t) { return h('th', { text: t }); }))), corps)),
      h('div', { class: 'actions gauche' }, h('button', { class: 'btn', type: 'button', onclick: function () { modifier(null); } }, '+ Nouvelle donnée')));
  }

  // ------------------------------------------------------------ Éditeur des réglages d'une donnée (couleurs, délai)
  /**
   * Réglages d'une donnée (décision du porteur du 9 novembre 2026) : règles de couleur dans l'ordre, délai (jours ou
   * tranches selon la durée d'hospitalisation). options : { code, libelle, type (type de valeur pour les conditions),
   * choix ([{ valeur, libelle }] pour « est égal à »), defaut ({ regles, delai }), delai (proposer un délai) }.
   * L'administrateur règle l'établissement ou un service ; le cadre, ses services.
   */
  function modaleReglages(options) {
    var o = options || {}, cfg = U.config(), admin = roles().indexOf('ADMIN') >= 0;
    var portees = (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (s) { return admin || (session().utilisateur.services || []).indexOf(s.code) >= 0; }).map(function (s) { return { code: s.code, libelle: s.libelle }; }));
    if (!portees.length) return alert('Réglage réservé au cadre et à l’administrateur.');
    var tous = JSON.parse(JSON.stringify(cfg.reglagesDonnees || {})), selPortee = h('select', {}, portees.map(function (p) { return h('option', { value: p.code, text: p.libelle }); }));
    if (!admin && U.App.service && U.App.service !== '*') selPortee.value = U.App.service;
    var zone = h('div', { class: 'pile' }), courant;
    function blocDe(p) { var b = (tous[o.code] || {})[p]; return b ? JSON.parse(JSON.stringify(b)) : null; }
    function conditionsPour() { return Object.keys(CO.CONDITIONS).filter(function (k) { var c = CO.CONDITIONS[k]; return !c.pour.length || c.pour.indexOf(o.type) >= 0 || (o.delai && (k === 'echeanceDepassee' || k === 'echeanceDans')); }); }
    function dessiner() {
      U.vider(zone);
      var p = selPortee.value, b = blocDe(p), herite = !b;
      var effectif = CO.reglages(Object.assign({}, cfg, { reglagesDonnees: tous }), o.code, p === '*' ? null : p, o.defaut);
      courant = b || { regles: JSON.parse(JSON.stringify(effectif.regles)), delai: effectif.delai };
      courant.regles = courant.regles || [];
      if (herite) zone.appendChild(h('p', { class: 'muted', text: 'Aucun réglage propre : ' + (effectif.source === 'etablissement' ? 'réglage de l’établissement appliqué.' : 'réglage proposé par la donnée appliqué.') + ' Modifiez ci-dessous pour créer un réglage propre.' }));
      var tb = h('tbody');
      courant.regles.forEach(function (r, i) {
        var op = h('select', { 'aria-label': 'Condition' }, conditionsPour().map(function (k) { return h('option', { value: k, text: CO.CONDITIONS[k].libelle, selected: r.si.op === k }); }));
        var val = o.choix && o.choix.length ? h('select', { 'aria-label': 'Valeur' }, [h('option', { value: '', text: '—' })].concat(o.choix.map(function (c) { return h('option', { value: c.valeur, text: c.libelle, selected: String(r.si.valeur) === String(c.valeur) }); })))
          : h('input', { type: 'text', value: r.si.valeur === undefined ? '' : r.si.valeur, 'aria-label': 'Valeur', placeholder: 'valeur' });
        var n = h('input', { type: 'number', value: r.si.n === undefined ? '' : r.si.n, 'aria-label': 'Nombre', class: 'court' });
        var coul = h('select', { 'aria-label': 'Couleur' }, CO.PALETTE.map(function (c) { return h('option', { value: c.code, text: c.symbole + ' ' + c.libelle, selected: r.couleur === c.code }); }));
        var rendu = h('select', { 'aria-label': 'Rendu' }, Object.keys(CO.RENDUS).map(function (k) { return h('option', { value: k, text: CO.RENDUS[k], selected: r.rendu === k }); }));
        var libl = h('input', { type: 'text', maxlength: 60, value: r.libelle || '', placeholder: 'Légende', 'aria-label': 'Légende' });
        function maj(initial) { var c = CO.CONDITIONS[op.value]; r.si = { op: op.value }; if (c.valeur) r.si.valeur = val.value; if (c.n) r.si.n = +n.value || 0; r.couleur = coul.value; r.rendu = rendu.value; r.libelle = libl.value; val.hidden = !c.valeur; n.hidden = !c.n; if (initial !== true) garder(); }
        [op, val, n, coul, rendu, libl].forEach(function (x) { x.addEventListener('change', maj); x.addEventListener('input', maj); });
        maj(true);
        tb.appendChild(h('tr', {}, h('td', {}, op), h('td', {}, val, n), h('td', {}, coul), h('td', {}, rendu), h('td', {}, libl),
          h('td', { class: 'actions-ligne' },
            h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { courant.regles.splice(i - 1, 0, courant.regles.splice(i, 1)[0]); garder(); dessinerRegles(); } }, '▲'),
            h('button', { class: 'btn petit danger', type: 'button', 'aria-label': 'Retirer', onclick: function () { courant.regles.splice(i, 1); garder(); dessinerRegles(); } }, '✕'))));
      });
      zone.appendChild(h('b', { text: 'Couleurs (la première règle vraie l’emporte)' }));
      zone.appendChild(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Condition', 'Valeur', 'Couleur', 'Rendu', 'Légende', ''].map(function (t) { return h('th', { text: t }); }))), tb)));
      zone.appendChild(h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { courant.regles.push({ si: { op: conditionsPour()[1] || 'toujours' }, couleur: 'vert', rendu: 'fond', libelle: '' }); garder(); dessinerRegles(); } }, '+ Règle'),
        o.delai ? h('button', { class: 'btn petit', type: 'button', onclick: function () { courant.regles = CO.reglesEcheance(); garder(); dessinerRegles(); } }, 'Règles d’échéance proposées') : null,
        b ? h('button', { class: 'btn petit', type: 'button', onclick: function () { if (tous[o.code]) delete tous[o.code][p]; dessiner(); } }, p === '*' ? 'Revenir au réglage proposé' : 'Revenir au réglage de l’établissement') : null));
      if (o.delai) {
        var d = courant.delai || {}, mode = h('select', {}, [['', 'Aucun délai'], ['jours', 'Délai fixe'], ['tranches', 'Selon la durée d’hospitalisation']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (d.tranches ? 'tranches' : d.jours !== undefined ? 'jours' : '') === x[0] }); }));
        var jours = h('input', { type: 'number', min: 0, value: d.jours !== undefined ? d.jours : 7, class: 'court' });
        var tranches = h('input', { type: 'text', value: (d.tranches || [{ jusqua: 7, jours: 2 }, { jusqua: 30, jours: 7 }, { jusqua: null, jours: 14 }]).map(function (t) { return (t.jusqua === null ? '+' : t.jusqua) + ':' + t.jours; }).join(' ; '), placeholder: '7:2 ; 30:7 ; +:14' });
        var majD = function () {
          if (mode.value === 'jours') courant.delai = { jours: +jours.value || 0 };
          else if (mode.value === 'tranches') courant.delai = { tranches: tranches.value.split(';').map(function (x) { var y = x.split(':'); return { jusqua: y[0].trim() === '+' ? null : +y[0], jours: +y[1] }; }).filter(function (t) { return isFinite(t.jours); }) };
          else courant.delai = null;
          garder();
        };
        [mode, jours, tranches].forEach(function (x) { x.addEventListener('change', majD); });
        zone.appendChild(h('b', { text: 'Délai de la donnée' }));
        zone.appendChild(h('div', { class: 'actions gauche' }, mode, jours, h('span', { class: 'muted', text: 'jours ; tranches « jour d’hospitalisation:délai » :' }), tranches));
        zone.appendChild(h('small', { class: 'muted', text: 'Les conditions « Délai de la donnée dépassé » et « atteint dans n jours » s’appuient sur ce délai, partout où la donnée apparaît.' }));
      }
      function dessinerRegles() { dessiner(); }
    }
    function garder() { var p = selPortee.value; tous[o.code] = tous[o.code] || {}; tous[o.code][p] = { regles: courant.regles, delai: courant.delai || null }; }
    selPortee.addEventListener('change', dessiner);
    dessiner();
    return U.modale('Réglages de la donnée « ' + o.libelle + ' »', h('div', { class: 'pile' }, h('label', {}, 'Réglage pour', selPortee), zone,
      h('small', { class: 'muted', text: 'Ces réglages s’appliquent partout où la donnée apparaît (Vue d’ensemble, listes). Chaque couleur a un équivalent en noir et blanc pour l’impression (symbole).' })), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        Object.keys(tous).forEach(function (k) { if (!Object.keys(tous[k]).length) delete tous[k]; });
        await U.enregistrerConfig([['reglagesDonnees', tous]]);
      } }], { large: true });
  }


  // ------------------------------------------------------------ Capacité d'accueil des services (0.18.2)
  /**
   * Capacité d'accueil : lits, chambres seules et doubles, fermetures temporaires datées (motif court), lits réservés
   * (ex. patient en permission longue). L'administrateur règle tous les services, le cadre les siens. options : { cadre }.
   */
  function panneauCapacites(options) {
    var o = options || {}, cfg = U.config(), K = SIC.capacites, admin = roles().indexOf('ADMIN') >= 0;
    var tous = JSON.parse(JSON.stringify(cfg.capacites || {})); tous.services = tous.services || {};
    var mes = admin ? null : (session().utilisateur.services || []);
    var svs = U.tousServices().filter(function (s) { return !mes || mes.indexOf(s.code) >= 0; });
    var zone = h('div', { class: 'pile' });
    function nb(v, aria, maj) { var i = h('input', { type: 'number', min: 0, max: 999, value: v || 0, class: 'court', 'aria-label': aria }); i.addEventListener('input', function () { maj(+i.value || 0); }); return i; }
    function periodes(x, cle, titre) {
      var corps = h('tbody');
      function dessiner() {
        U.vider(corps);
        (x[cle] || []).forEach(function (p, i) {
          var deb = h('input', { type: 'date', value: p.debut || '', 'aria-label': 'Du' }), fin = h('input', { type: 'date', value: p.fin || '', 'aria-label': 'Au' });
          var l = h('input', { type: 'number', min: 1, value: p.lits || 1, class: 'court', 'aria-label': 'Lits' }), m = h('input', { type: 'text', maxlength: 80, value: p.motif || '', placeholder: 'Motif court', 'aria-label': 'Motif' });
          [deb, fin, l, m].forEach(function (e) { e.addEventListener('input', function () { p.debut = deb.value; p.fin = fin.value; p.lits = +l.value || 1; p.motif = m.value; }); });
          corps.appendChild(h('tr', {}, h('td', {}, deb), h('td', {}, fin), h('td', {}, l), h('td', {}, m), h('td', {}, h('button', { class: 'btn petit danger', type: 'button', onclick: function () { x[cle].splice(i, 1); dessiner(); } }, 'Retirer'))));
        });
        if (!(x[cle] || []).length) corps.appendChild(h('tr', {}, h('td', { colspan: 5, class: 'muted', text: 'Aucune.' })));
      }
      dessiner();
      return h('div', {}, h('b', { text: titre }), h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Du', 'Au (facultatif)', 'Lits', 'Motif', ''].map(function (t) { return h('th', { text: t }); }))), corps)),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { (x[cle] = x[cle] || []).push({ id: 'p' + C.hex(C.aleatoire(3)), debut: K.jourISO(Date.now()), fin: '', lits: 1, motif: '' }); dessiner(); } }, '+ Ajouter'));
    }
    svs.forEach(function (sv) {
      var x = tous.services[sv.code] = tous.services[sv.code] || { lits: 0, chambresSeules: 0, chambresDoubles: 0, fermetures: [], reserves: [] };
      var sit = K.situation(Object.assign({}, cfg, { capacites: tous }), [sv.code], Date.now(), 0);
      zone.appendChild(h('details', { class: 'panneau', open: svs.length === 1 ? true : null }, h('summary', {}, h('b', { text: sv.libelle }), ' — ', h('span', { class: 'muted', text: sit && sit.lits ? sit.ouverts + ' lit(s) ouvert(s) aujourd’hui sur ' + sit.lits : 'capacité non renseignée' })),
        h('div', { class: 'actions gauche' }, h('label', {}, 'Lits ', nb(x.lits, 'Lits', function (v) { x.lits = v; })), h('label', {}, 'Chambres seules ', nb(x.chambresSeules, 'Chambres seules', function (v) { x.chambresSeules = v; })), h('label', {}, 'Chambres doubles ', nb(x.chambresDoubles, 'Chambres doubles', function (v) { x.chambresDoubles = v; }))),
        periodes(x, 'fermetures', 'Fermetures temporaires de lits'), periodes(x, 'reserves', 'Lits réservés (ex. patient en permission longue)')));
    });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Capacité d’accueil' }),
      h('p', { class: 'muted', text: 'Nombre de lits de chaque service (la chambre de soins intensifs n’est pas comptée comme un lit), fermetures temporaires et lits réservés. Places disponibles = lits ouverts − lits réservés − patients présents ; affichées dans le bandeau de synthèse de la Vue d’ensemble. Les sorties prévues se lisent dans la sortie prévisionnelle des séjours.' }),
      svs.length ? zone : h('p', { class: 'muted', text: 'Aucun service.' }),
      U.boutonEnregistrer(async function () {
        Object.keys(tous.services).forEach(function (c) { var x = tous.services[c]; ['fermetures', 'reserves'].forEach(function (k) { (x[k] || []).forEach(function (p) { if (!p.debut) throw new Error('Indiquez le premier jour de chaque période.'); if (p.fin && p.fin < p.debut) throw new Error('Une période finit avant de commencer.'); }); }); });
        await U.enregistrerConfig([['capacites', tous]]);
      }));
  }

  // ------------------------------------------------------------ Données ajoutées depuis les fiches (0.20.0)
  function peutRegler() { var r = roles(); return !session().apercu && (r.indexOf('ADMIN') >= 0 || r.indexOf('CADRE') >= 0); }
  /** Fenêtre superposée qui garde la fenêtre d'origine ouverte (fiche, réglage d'une vue). */
  function fenetre(titre, contenu, apres) {
    var d = h('dialog', { class: 'large', 'aria-label': titre });
    function fermer() { d.close(); d.remove(); if (apres) apres(); }
    d.appendChild(h('div', { class: 'tete' }, h('h2', { text: titre }), h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Fermer', onclick: fermer }, '×')));
    d.appendChild(h('div', { class: 'corps' }, contenu));
    d.appendChild(h('div', { class: 'pied' }, h('button', { class: 'btn primaire', type: 'button', onclick: fermer }, 'Fermer')));
    d.addEventListener('cancel', function (ev) { ev.preventDefault(); fermer(); });
    document.body.appendChild(d); d.showModal();
    return d;
  }
  /** Gérer les données ajoutées d'une entité (patient, médecin, agent) : cadre pour ses services, administrateur. */
  function modaleDefinitions(o) {
    o = o || {};
    var zc = h('div', {});
    function dessiner() { U.vider(zc).appendChild(panneauDefinitions({ cadre: roles().indexOf('ADMIN') < 0, entite: o.entite, titre: 'Données ajoutées — ' + (CH.ENTITES[o.entite] || 'toutes') + 's', apres: function () { setTimeout(dessiner, 50); } })); }
    dessiner();
    return fenetre('Données ajoutées', zc, o.apres);
  }
  function boutonGerer(entite, apres) {
    return peutRegler() ? h('button', { class: 'btn petit', type: 'button', title: 'Ajouter, modifier ou masquer les données ajoutées', onclick: function () { modaleDefinitions({ entite: entite, apres: apres }); } }, 'Gérer les données ajoutées…') : null;
  }
  /**
   * Valeurs des données ajoutées d'une entité (médecin, agent ; la fiche patient a les siennes) : valeurs simples
   * enregistrées par « Enregistrer les données », notes et check-lists aussitôt. options : { service }.
   */
  function blocValeurs(entite, id, options) {
    var o = options || {}, zone = h('div', { class: 'pile bloc-valeurs' });
    function dessiner() {
      U.vider(zone);
      var defs = CH.definitions(U.config(), { entite: entite, service: o.service }).filter(function (c) { return c.type !== 'formule' && lisible(c); });
      zone.appendChild(h('div', { class: 'actions gauche' }, h('b', { text: 'Données ajoutées' }), boutonGerer(entite, dessiner)));
      if (entite === 'agent') zone.appendChild(h('small', { class: 'muted', text: 'Données du personnel, protégées par une clé propre : ni donnée de santé, ni évaluation.' }));
      if (!defs.length) { zone.appendChild(h('p', { class: 'muted', text: 'Aucune donnée ajoutée' + (peutRegler() ? ' : « Gérer les données ajoutées… » pour en créer.' : '.') })); return; }
      var grille = h('div', { class: 'grille-3' }), cumul = h('div', { class: 'pile' }), saisies = [];
      defs.forEach(function (c) {
        var v = valeurDe(c, entite, id), ok = modifiable(c);
        if (CH.CUMULATIFS[c.type]) {
          var opts = { peut: ok, enregistrerOp: function (op) { return enregistrer(c, entite, id, { op: op }); }, apres: dessiner };
          cumul.appendChild(h('div', { class: 'pile' }, h('b', { text: c.libelle }), c.type === 'notes' ? notes(c, v, opts) : checklist(c, v, opts)));
          return;
        }
        var w = saisie(c, v, { disabled: !ok });
        if (ok) saisies.push({ c: c, w: w, avant: v });
        grille.appendChild(h('label', { title: ok ? null : 'Votre rôle ne modifie pas cette donnée' }, c.libelle, w.el));
      });
      zone.appendChild(grille); zone.appendChild(cumul);
      if (saisies.length) zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit primaire', type: 'button', onclick: async function () {
        try {
          var n = 0;
          for (var i = 0; i < saisies.length; i++) {
            var x = saisies[i], val = x.w.lire(), norm = val === '' || val === null || (Array.isArray(val) && !val.length) ? null : CH.valeur(x.c, val);
            if (JSON.stringify(norm === null ? undefined : norm) !== JSON.stringify(x.avant)) { await enregistrer(x.c, entite, id, { valeur: norm }); n++; }
          }
          U.toast(n ? n + ' donnée(s) enregistrée(s).' : 'Aucun changement.'); dessiner();
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer les données')));
    }
    dessiner();
    return zone;
  }
  /** Fiche d'un agent (0.20.0) : identité, rôles, services, groupes, et données ajoutées (cadre seul par défaut). */
  function ficheAgent(a) {
    var cfg = U.config(), libR = {};
    rolesConfig().forEach(function (r) { libR[r.code] = r.libelle; });
    var gs = (cfg.groupes || []).filter(function (g) { return g && g.actif !== false && (g.membres || []).some(function (m) { return m.id === a.id; }); }).map(function (g) { return g.libelle; });
    var compte = (session().comptes || []).filter(function (c) { return c.id === a.id; })[0];
    return fenetre('Fiche de ' + a.nom, h('div', { class: 'pile' },
      h('div', { class: 'grille-3' },
        h('div', {}, h('small', { class: 'muted', text: 'Rôles' }), h('div', { text: (a.roles || []).map(function (r) { return libR[r] || r; }).join(', ') || '—' })),
        h('div', {}, h('small', { class: 'muted', text: 'Services' }), h('div', { text: (a.services || []).map(U.libService).join(', ') || '—' })),
        h('div', {}, h('small', { class: 'muted', text: 'Groupes d’agents' }), h('div', { text: gs.join(', ') || '—' }))),
      compte ? null : h('small', { class: 'muted', text: 'Membre d’un groupe d’agents sans compte Tessera : ses données le suivront quand son compte sera créé avec le même identifiant.' }),
      blocValeurs('agent', a.id)));
  }
  /** Fiche d'un médecin depuis la Vue d'ensemble : fiche de la liste (gestionnaires) et données ajoutées. */
  function ficheMedecin(m) {
    var MED = SIC.medecins;
    return fenetre(m.nom, h('div', { class: 'pile' },
      h('div', { class: 'grille-3' },
        h('div', {}, h('small', { class: 'muted', text: 'Fonction' }), h('div', { text: MED.FONCTIONS[m.fonction] || '' })),
        h('div', {}, h('small', { class: 'muted', text: 'Statut' }), h('div', { text: MED.STATUTS[m.statut] || '' })),
        h('div', {}, h('small', { class: 'muted', text: 'Services' }), h('div', { text: m.services.length ? m.services.map(U.libService).join(', ') : 'Tous' }))),
      U.medecins && U.medecins.peutGerer() ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { U.medecins.modaleMedecin(m); } }, 'Modifier la fiche du médecin…')) : null,
      blocValeurs('medecin', m.id)));
  }

  U.champs = { valeurDe: valeurDe, lisible: lisible, raisonIndisponible: raisonIndisponible, modifiable: modifiable, enregistrer: enregistrer, saisie: saisie, notes: notes, checklist: checklist,
    classeCouleur: classeCouleur, marque: marque, legende: legende, multi: multi, panneauDefinitions: panneauDefinitions, modaleDefinition: modaleDefinition, modaleReglages: modaleReglages, definitionsBrutes: definitionsBrutes, panneauCapacites: panneauCapacites,
    modaleDefinitions: modaleDefinitions, boutonGerer: boutonGerer, blocValeurs: blocValeurs, ficheAgent: ficheAgent, ficheMedecin: ficheMedecin, fenetre: fenetre };
})();
