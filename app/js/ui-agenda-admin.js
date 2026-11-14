// SPDX-License-Identifier: EUPL-1.2
/*
 * Agenda du service — réglages et catégories d’événements (administration).
 * Suite de ui-agenda.js (découpage de la 0.21.0, sans changement de comportement) : les aides communes viennent de
 * `SIC.ui.agendaInt`, les fonctions de ce fichier y sont ajoutées.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, A = SIC.agenda, C = SIC.crypto, I = U.agendaInt;
  var opts = I.opts;
  var peut = I.peut;
  var couleurs = I.couleurs;
  var teinter = I.teinter;
  var grille = I.grille;
  function selectDelai() { return I.selectDelai.apply(null, arguments); }

  function panneauReglages() {
    var o = opts(), copie = function (l) { return l.map(function (t) { return { code: t.code, libelle: t.libelle }; }); };
    // Listes de types d'alertes : celle de l'établissement, et celles propres à certains services (décision du porteur)
    var listes = { '*': copie(o.typesAlertesEtablissement) }, propres = {};
    U.tousServices().forEach(function (s) { propres[s.code] = !!o.typesAlertesServices[s.code]; listes[s.code] = copie(o.typesAlertesServices[s.code] || o.typesAlertesEtablissement); });
    var portee = '*', types = listes['*'];
    var selId = h('select', {}, Object.keys(A.IDENTITES).map(function (k) { return h('option', { value: k, text: A.IDENTITES[k], selected: o.identite === k }); }));
    var cbModif = h('input', { type: 'checkbox', checked: o.modifAutresServices });
    var selPortee = h('select', { 'aria-label': 'Liste des types d’alertes', onchange: function () { portee = selPortee.value; types = listes[portee]; dessiner(); } },
      [h('option', { value: '*', text: 'Liste de l’établissement' })].concat(U.tousServices().map(function (s) { return h('option', { value: s.code, text: 'Service ' + s.libelle }); })));
    // Modèles de check-lists proposés sur les événements (ex. sortie d'un patient)
    var modelesCL = A.checklists(U.config()).map(function (c) { return { code: c.code, libelle: c.libelle, items: c.items.map(function (it) { return { libelle: it.libelle, delai: it.delai }; }) }; });
    var ot = A.optionsTaches(U.config());
    var casesAj = Object.keys(A.AJUSTABLES).map(function (k) { return { k: k, cb: h('input', { type: 'checkbox', checked: ot.ajustables.indexOf(k) >= 0 }) }; });
    var cbEqRec = h('input', { type: 'checkbox', checked: ot.equipeRecurrentes });
    // Couleurs par type (décision du porteur du 7 novembre 2026 : personnalisables)
    var LIB_COULEURS = { tache: 'Tâche', alerte: 'Alerte' };
    var champsCouleurs = Object.keys(LIB_COULEURS).map(function (k) { return { k: k, c: h('input', { type: 'color', value: o.couleurs[k], 'aria-label': 'Couleur : ' + LIB_COULEURS[k] }) }; });
    // Délais de validation médicale des permissions, par mode d'hospitalisation
    var modes = (U.config().modesHospitalisation || []).map(function (m) { return m.code; });
    Object.keys(o.delaisPermission).forEach(function (k) { if (modes.indexOf(k) < 0) modes.push(k); });
    var champsDelais = modes.map(function (m) { return { m: m, c: h('input', { type: 'number', min: 0, max: 168, step: 1, class: 'champ-court', value: A.delaiPermission(U.config(), m), 'aria-label': 'Délai de validation : ' + m }) }; });
    // Types affichés en transparence tant qu'aucun patient n'est prévu (audience JLD par défaut)
    var attente = A.typesEnAttente(U.config());
    var casesAttente = Object.keys(A.NATURES).filter(function (k) { return k !== 'reunion'; }).map(function (k) { return { k: k, cb: h('input', { type: 'checkbox', checked: attente.indexOf(k) >= 0 }) }; });
    var zoneCL = h('div', { class: 'pile' });
    function dessinerCL() {
      U.vider(zoneCL);
      modelesCL.forEach(function (c, i) {
        var lib = h('input', { type: 'text', maxlength: 80, value: c.libelle, 'aria-label': 'Nom du modèle de check-list', oninput: function () { c.libelle = lib.value; } });
        var lignes = c.items.map(function (it, k) {
          var champ = h('input', { type: 'text', maxlength: 120, value: it.libelle, 'aria-label': 'Point à réaliser', oninput: function () { it.libelle = champ.value; } });
          return h('div', { class: 'agenda-point' }, champ, selectDelai(it.delai, function (v) { it.delai = v; }),
            h('button', { class: 'btn petit', type: 'button', disabled: k === 0, title: 'Monter', onclick: function () { c.items.splice(k - 1, 0, c.items.splice(k, 1)[0]); dessinerCL(); } }, '▲'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { c.items.splice(k, 1); dessinerCL(); } }, 'Retirer'));
        });
        zoneCL.appendChild(h('fieldset', { class: 'role' }, h('legend', { text: c.libelle || 'Nouveau modèle' }), h('label', {}, 'Nom', lib),
          h('div', { class: 'pile' }, h('b', { text: 'Points à réaliser et alerte si non fait' }), lignes),
          h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { c.items.push({ libelle: '', delai: null }); dessinerCL(); } }, '+ Ajouter un point'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { modelesCL.splice(i, 1); dessinerCL(); } }, 'Retirer ce modèle'))));
      });
      zoneCL.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { modelesCL.push({ code: 'c' + Date.now().toString(36), libelle: '', items: [{ libelle: '', delai: null }] }); dessinerCL(); } }, '+ Ajouter un modèle de check-list')));
    }
    dessinerCL();
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      types = listes[portee];
      if (portee !== '*') {
        var cbPropre = h('input', { type: 'checkbox', checked: propres[portee], onchange: function () { propres[portee] = cbPropre.checked; if (cbPropre.checked && !listes[portee].length) listes[portee] = copie(listes['*']); dessiner(); } });
        zone.appendChild(h('label', { class: 'case' }, cbPropre, h('span', { text: 'Liste propre à ce service (sinon : liste de l’établissement)' })));
        if (!propres[portee]) { zone.appendChild(h('p', { class: 'muted', text: listes['*'].map(function (t) { return t.libelle; }).join(' · ') })); return; }
      }
      types.forEach(function (t, i) {
        var champ = h('input', { type: 'text', maxlength: 80, value: t.libelle, 'aria-label': 'Libellé du type d’alerte', oninput: function () { t.libelle = champ.value; } });
        zone.appendChild(h('div', { class: 'agenda-point' }, champ,
          h('button', { class: 'btn petit', type: 'button', disabled: i === 0, title: 'Monter', onclick: function () { types.splice(i - 1, 0, types.splice(i, 1)[0]); dessiner(); } }, '▲'),
          h('button', { class: 'btn petit danger', type: 'button', onclick: function () { types.splice(i, 1); dessiner(); } }, 'Retirer')));
      });
      zone.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { types.push({ code: 't' + Date.now().toString(36), libelle: '' }); dessiner(); } }, '+ Ajouter un type d’alerte')));
    }
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Agenda du service' }),
      h('label', {}, 'Patient désigné dans l’agenda par', selId),
      h('small', { class: 'muted', text: 'Initiales par défaut. Le nom complet est le plus exposant : à réserver aux services qui en ont besoin (écran visible de l’équipe).' }),
      h('label', { class: 'case' }, cbModif, h('span', { text: 'Permettre de modifier un élément d’un autre service qui concerne un patient du service (sinon : consultation et commentaires seulement)' })),
      h('h3', { text: 'Couleurs des tâches et des alertes' }),
      h('p', { class: 'muted', text: 'La couleur de chaque catégorie d’événement se règle dans « Catégories d’événements ».' }),
      h('div', { class: 'ag-couleurs' }, champsCouleurs.map(function (x) { return h('label', { class: 'en-ligne' }, x.c, h('span', { text: LIB_COULEURS[x.k] })); })),
      h('button', { class: 'btn petit', type: 'button', onclick: function () { champsCouleurs.forEach(function (x) { x.c.value = A.COULEURS_DEFAUT[x.k]; }); } }, 'Couleurs proposées'),
      h('h3', { text: 'Permissions de sortie : validation médicale' }),
      h('p', { class: 'muted', text: 'Délai, en heures avant le début de la permission, avant lequel la validation (signature du médecin) est attendue, selon le mode d’hospitalisation du patient. Une alerte s’affiche dans l’agenda jusqu’à la validation ; 0 : jusqu’au dernier moment.' }),
      h('div', { class: 'ag-couleurs' }, champsDelais.map(function (x) { return h('label', { class: 'en-ligne' }, h('span', { text: x.m }), x.c, h('span', { text: 'h' })); })),
      h('h3', { text: 'Tâches' }),
      h('p', { class: 'muted', text: 'Les tâches du service, réglées par les rôles qui en ont l’accès, ne sont supprimées que par eux. Les rôles qui ont l’accès « Ajuster les tâches du service » peuvent changer :' }),
      h('div', { class: 'pile' }, casesAj.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: A.AJUSTABLES[c.k] })); })),
      h('label', { class: 'case' }, cbEqRec, h('span', { text: 'Permettre à l’équipe de créer des tâches récurrentes (sinon : ponctuelles seulement, les récurrentes étant réglées par les rôles qui règlent les tâches)' })),
      h('h3', { text: 'Modèles de check-lists' }),
      h('p', { class: 'muted', text: 'Pour chaque point, le moment où il devient en retard s’il n’est pas coché (ex. infirmier libéral prévenu 2 jours avant la sortie, transport commandé la veille, ordonnance le jour même).' }), zoneCL,
      h('h3', { text: 'Types d’alertes' }),
      h('p', { class: 'muted', text: 'Liste proposée à la création d’une alerte, dans cet ordre ; « Autre » (libellé libre) est toujours proposé en dernier. Un service peut avoir sa propre liste. Retirer un type n’efface pas les alertes déjà créées.' }),
      selPortee, zone,
      U.boutonEnregistrer(async function () {
        function nettoyer(l) { return l.map(function (t) { return { code: t.code, libelle: String(t.libelle || '').trim() }; }).filter(function (t) { return t.libelle; }); }
        var etab = nettoyer(listes['*']);
        if (!etab.length) throw new Error('Gardez au moins un type d’alerte dans la liste de l’établissement.');
        var valeur = {};
        if (selId.value !== 'initiales') valeur.identite = selId.value;
        if (JSON.stringify(etab) !== JSON.stringify(A.TYPES_ALERTE_DEFAUT)) valeur.typesAlertes = etab;
        Object.keys(propres).forEach(function (k) {
          if (!propres[k]) return;
          var l = nettoyer(listes[k]);
          if (!l.length) throw new Error('La liste propre au service ' + U.libService(k) + ' est vide : décochez « Liste propre » ou ajoutez un type.');
          (valeur.typesAlertesServices = valeur.typesAlertesServices || {})[k] = l;
        });
        if (cbModif.checked) valeur.modifAutresServices = true;
        var cl = modelesCL.map(function (c) { return { code: c.code, libelle: String(c.libelle || '').trim(), items: c.items.map(function (it) { return { libelle: String(it.libelle || '').trim(), delai: it.delai === undefined ? null : it.delai }; }).filter(function (it) { return it.libelle; }) }; }).filter(function (c) { return c.libelle && c.items.length; });
        if (JSON.stringify(cl) !== JSON.stringify(A.CHECKLISTS_DEFAUT)) valeur.checklists = cl;
        var ajs = casesAj.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.k; });
        if (JSON.stringify(ajs) !== JSON.stringify(['affectation']) || cbEqRec.checked) valeur.taches = { ajustables: ajs, equipeRecurrentes: cbEqRec.checked };
        var cs = {}; champsCouleurs.forEach(function (x) { if (x.c.value.toLowerCase() !== A.COULEURS_DEFAUT[x.k]) cs[x.k] = x.c.value.toLowerCase(); });
        if (Object.keys(cs).length) valeur.couleurs = cs;
        var ds = {}; champsDelais.forEach(function (x) { var v = Math.max(0, Math.min(168, Math.round(+x.c.value || 0))); if (v !== A.DELAIS_PERMISSION_DEFAUT[x.m] && !(A.DELAIS_PERMISSION_DEFAUT[x.m] === undefined && v === A.delaiPermission({ modesHospitalisation: U.config().modesHospitalisation }, x.m))) ds[x.m] = v; });
        if (Object.keys(ds).length) valeur.delaisPermission = ds;
        // Catégories (onglet voisin) et anciens réglages qu'elles reprennent : conservés tels quels
        var ancien = U.config().agenda || {};
        if (ancien.categories) valeur.categories = ancien.categories;
        if (ancien.attenteSansPatient) valeur.attenteSansPatient = ancien.attenteSansPatient;
        Object.keys(ancien.couleurs || {}).forEach(function (k) { if (A.NATURES[k]) (valeur.couleurs = valeur.couleurs || {})[k] = ancien.couleurs[k]; });
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Catégories d'événements (Administration → Agenda)
  /**
   * Catégories et préréglages (décision du porteur du 8 novembre 2026) : types fournis et catégories ajoutées, pour
   * l'établissement ou pour un service (un service hérite de l'établissement et peut s'en écarter, masquer une catégorie
   * ou en ajouter). Seuls les écarts avec le niveau au-dessus sont enregistrés (`config.agenda.categories[niveau]`).
   */
  var niveauCategories = '*';
  function panneauCategories() {
    var cfg = U.config(), ag = cfg.agenda || {};
    var selNiveau = h('select', { 'aria-label': 'Niveau des réglages', onchange: function () { niveauCategories = selNiveau.value; U.rendreContenu(); } },
      [h('option', { value: '*', text: 'Établissement (tous les services)', selected: niveauCategories === '*' })].concat(U.tousServices().map(function (v) { return h('option', { value: v.code, text: 'Service ' + v.libelle, selected: niveauCategories === v.code }); })));
    // Niveau au-dessus : types fournis pour l'établissement, réglages de l'établissement pour un service
    var cfgParent = niveauCategories === '*' ? { agenda: { couleurs: {} } } : { agenda: Object.assign({}, ag, { categories: { '*': (ag.categories || {})['*'] || {} } }) };
    var parent = A.categories(cfgParent, niveauCategories === '*' ? null : niveauCategories);
    var liste = JSON.parse(JSON.stringify(A.categories(cfg, niveauCategories === '*' ? null : niveauCategories)));
    var modeles = A.checklists(cfg);
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      liste.forEach(function (c, i) {
        var pr = c.prereglages;
        var lib = h('input', { type: 'text', maxlength: 60, value: c.libelle, 'aria-label': 'Nom de la catégorie', oninput: function () { c.libelle = lib.value; } });
        var coul = h('input', { type: 'color', value: c.couleur, 'aria-label': 'Couleur', oninput: function () { c.couleur = coul.value; } });
        var actif = h('input', { type: 'checkbox', checked: c.actif, onchange: function () { c.actif = actif.checked; } });
        function nombre(k, max, aria) { var n = h('input', { type: 'number', min: 0, max: max, class: 'champ-court', value: pr[k] || '', 'aria-label': aria, oninput: function () { pr[k] = n.value === '' ? undefined : Math.max(0, Math.min(max, Math.round(+n.value))); } }); return n; }
        function texte(k, ph) { var t = h('input', { type: 'text', maxlength: 120, value: pr[k] || '', placeholder: ph, oninput: function () { pr[k] = t.value; } }); return t; }
        function coche(k, lib2) { var cb = h('input', { type: 'checkbox', checked: !!pr[k], onchange: function () { pr[k] = cb.checked; } }); return h('label', { class: 'case' }, cb, h('span', { text: lib2 })); }
        var duree = h('input', { type: 'number', min: 0, max: 20160, step: 5, class: 'champ-court', value: pr.duree || '', 'aria-label': 'Durée en minutes', oninput: function () { pr.duree = +duree.value || undefined; } });
        var heure = h('input', { type: 'time', value: pr.heure || '', 'aria-label': 'Heure de début proposée', oninput: function () { pr.heure = heure.value || undefined; } });
        var selCL = h('select', { 'aria-label': 'Check-list proposée', onchange: function () { pr.checklist = selCL.value || undefined; } }, [h('option', { value: '', text: 'Aucune' })].concat(modeles.map(function (m) { return h('option', { value: m.code, text: m.libelle, selected: pr.checklist === m.code }); })));
        var zTr = h('div', { class: 'actions gauche' });
        function dessinerTr() {
          U.vider(zTr);
          (pr.transports = pr.transports || []).forEach(function (t, k) {
            var st0 = h('select', { 'aria-label': 'Transport', onchange: function () { t.type = st0.value; } }, Object.keys(A.TRANSPORTS).map(function (x) { return h('option', { value: x, text: A.TRANSPORTS[x], selected: t.type === x }); }));
            var nb = h('input', { type: 'number', min: 1, max: 9, value: t.nombre || 1, class: 'champ-court', 'aria-label': 'Nombre', oninput: function () { t.nombre = +nb.value || 1; } });
            zTr.appendChild(h('span', { class: 'en-ligne' }, st0, nb, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer le transport', onclick: function () { pr.transports.splice(k, 1); dessinerTr(); } }, '×')));
          });
          zTr.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { pr.transports.push({ type: 'vsl', nombre: 1 }); dessinerTr(); } }, '+ Transport'));
        }
        dessinerTr();
        var zVal = h('div', { class: 'actions gauche' });
        function dessinerVal() {
          U.vider(zVal);
          (pr.validations = pr.validations || []).forEach(function (v, k) {
            var sv0 = h('select', { 'aria-label': 'Validation', onchange: function () { v.type = sv0.value; dessinerVal(); } }, Object.keys(A.TYPES_VALIDATION).map(function (x) { return h('option', { value: x, text: A.TYPES_VALIDATION[x], selected: v.type === x }); }));
            var lv = h('input', { type: 'text', maxlength: 80, value: v.libelle || '', placeholder: 'Intitulé', 'aria-label': 'Intitulé de la validation', oninput: function () { v.libelle = lv.value; } });
            var dv = v.type === 'permission' ? null : h('input', { type: 'number', min: 0, max: 336, value: v.delai === undefined ? 24 : v.delai, class: 'champ-court', 'aria-label': 'Délai en heures', oninput: function () { v.delai = +dv.value; } });
            zVal.appendChild(h('span', { class: 'en-ligne' }, sv0, lv, dv, dv ? h('small', { text: 'h avant' }) : null, h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Retirer la validation', onclick: function () { pr.validations.splice(k, 1); dessinerVal(); } }, '×')));
          });
          zVal.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { pr.validations.push({ type: 'medicale', libelle: '', delai: 24 }); dessinerVal(); } }, '+ Validation'));
        }
        dessinerVal();
        // Places et inscriptions proposées (0.21.0) : nombre exact ou minimum, inscription libre, à confirmer ou aucune
        var pp = pr.participation || {};
        function majPart() { pr.participation = { mode: selModePart.value, nombre: +pr.accompagnateurs || 0, libre: selInsPart.value === 'libre', aConfirmer: selInsPart.value === 'confirmer' }; }
        var selModePart = h('select', { 'aria-label': 'Nombre exact ou minimum', onchange: majPart }, [['exact', 'exactement'], ['min', 'au moins']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (pp.mode || 'exact') === o[0] }); }));
        var selInsPart = h('select', { 'aria-label': 'Inscription des agents', onchange: majPart }, [['libre', 'inscription libre'], ['confirmer', 'inscription à confirmer'], ['', 'pas d’inscription']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (pr.participation ? (pp.aConfirmer ? 'confirmer' : pp.libre ? 'libre' : '') : 'libre') === o[0] }); }));
        var cbFixe = h('input', { type: 'checkbox', checked: !!pr.inscriptionFixe, onchange: function () { pr.inscriptionFixe = cbFixe.checked; majPart(); } });
        var selBase = c.fournie ? null : h('select', { 'aria-label': 'Comportement repris', onchange: function () { c.base = selBase.value; } }, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: A.NATURES[k], selected: c.base === k }); }));
        zone.appendChild(teinter(h('details', { class: 'ag-categorie' + (c.actif ? '' : ' inactive') },
          h('summary', {}, h('span', { class: 'ag-cle' }, h('i'), c.libelle || 'Nouvelle catégorie'), c.fournie ? h('small', { class: 'muted', text: ' (fournie)' }) : h('small', { class: 'muted', text: ' (ajoutée, comme « ' + A.NATURES[c.base] + ' »)' }), c.actif ? null : h('span', { class: 'badge', text: 'masquée' })),
          h('div', { class: 'pile' },
            h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Nom', lib), h('label', { class: 'en-ligne' }, 'Couleur', coul), h('label', { class: 'case' }, actif, h('span', { text: 'Proposée' })),
              selBase ? h('label', { class: 'en-ligne' }, 'Comportement de', selBase) : null),
            h('b', { text: 'Préréglages à la création' }),
            h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Durée', duree, h('small', { text: 'min' })), h('label', { class: 'en-ligne' }, 'Début proposé', heure),
              h('label', { class: 'en-ligne' }, 'Durée maximale', nombre('dureeMax', 720, 'Durée maximale en heures'), h('small', { text: 'h (alerte au-delà)' }))),
            h('div', { class: 'grille-2' }, h('label', {}, 'Lieu', texte('lieu', 'ex. Salle d’audience')), h('label', {}, 'Intitulé', texte('titre', 'ex. Audience du mercredi'))),
            h('div', { class: 'actions gauche' }, coche('patients', 'Section Patients affichée'), h('label', { class: 'en-ligne' }, 'Professionnels demandés', nombre('accompagnateurs', 20, 'Professionnels demandés')), selModePart, selInsPart, h('label', { class: 'case' }, cbFixe, h('span', { text: 'Façon de s’inscrire fixée (non modifiable sur l’événement)' })),
              coche('attente', 'Transparente sans patient prévu'), coche('psychiatrie', 'Services de psychiatrie seulement')),
            h('div', {}, h('small', { class: 'muted', text: 'Transports' }), zTr),
            h('div', {}, h('small', { class: 'muted', text: 'Permission et validations' }), zVal),
            h('label', { class: 'en-ligne' }, 'Check-list', selCL),
            h('div', { class: 'actions gauche' },
              h('button', { class: 'btn petit', type: 'button', disabled: i === 0, onclick: function () { liste.splice(i - 1, 0, liste.splice(i, 1)[0]); dessiner(); } }, '▲ Monter'),
              c.fournie || parent.some(function (p) { return p.code === c.code; }) ? h('button', { class: 'btn petit', type: 'button', onclick: function () {
                var p = parent.filter(function (y) { return y.code === c.code; })[0]; if (p) { liste[i] = JSON.parse(JSON.stringify(p)); dessiner(); }
              } }, niveauCategories === '*' ? 'Préréglages fournis' : 'Reprendre les réglages de l’établissement') :
                h('button', { class: 'btn petit danger', type: 'button', onclick: function () { if (confirm('Retirer la catégorie « ' + c.libelle + ' » ? Les éléments déjà créés gardent leur catégorie (affichés comme « autre événement »). Pour seulement ne plus la proposer, décochez « Proposée ».')) { liste.splice(i, 1); dessiner(); } } }, 'Retirer')))), c.couleur));
      });
    }
    dessiner();
    var nomNouv = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Consultation dentaire, atelier jardin' });
    var baseNouv = h('select', { 'aria-label': 'Comportement repris' }, Object.keys(A.NATURES).map(function (k) { return h('option', { value: k, text: 'comme « ' + A.NATURES[k] + ' »', selected: k === 'autre' }); }));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Catégories d’événements' }),
      h('p', { class: 'muted', text: 'Catégories proposées par « + Nouveau » dans l’agenda, leur couleur et leurs préréglages (appliqués à la création, modifiables ensuite sur l’élément). Réglez d’abord l’établissement ; un service hérite de ces réglages et peut s’en écarter, masquer une catégorie ou en ajouter une.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', selNiveau),
      zone,
      h('div', { class: 'actions gauche ag-ajouter' }, h('span', { class: 'muted', text: 'Ajouter une catégorie :' }), nomNouv, baseNouv,
        h('button', { class: 'btn petit', type: 'button', onclick: function () {
          var n = nomNouv.value.trim(); if (!n) return nomNouv.focus();
          var code = (n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'categorie');
          if (!/^[a-z]/.test(code)) code = 'c-' + code;
          while (liste.some(function (c) { return c.code === code; }) || A.NATURES[code]) code = code.slice(0, 26) + '-' + C.hex(C.aleatoire(1));
          var p0 = JSON.parse(JSON.stringify(A.PREREGLAGES_DEFAUT[baseNouv.value] || {}));
          liste.push({ code: code, libelle: n, base: baseNouv.value, couleur: A.COULEURS_DEFAUT[baseNouv.value], prereglages: p0, fournie: false, actif: true });
          nomNouv.value = ''; dessiner();
        } }, 'Ajouter')),
      U.boutonEnregistrer(async function () {
        // Écarts avec le niveau au-dessus seulement
        var ecarts = {};
        liste.forEach(function (c) {
          if (!String(c.libelle || '').trim()) throw new Error('Chaque catégorie doit avoir un nom.');
          var p = parent.filter(function (y) { return y.code === c.code; })[0], e = {}, pr = A.nettoyerPrereglages(c.prereglages);
          if (!p) { e = { libelle: c.libelle.trim(), base: c.base, couleur: c.couleur, actif: c.actif, prereglages: pr }; }
          else {
            if (c.libelle.trim() !== p.libelle) e.libelle = c.libelle.trim();
            if (c.couleur !== p.couleur) e.couleur = c.couleur;
            if (c.actif !== p.actif) e.actif = c.actif;
            var pp = A.nettoyerPrereglages(p.prereglages), diff = {};
            Object.keys(pr).concat(Object.keys(pp)).forEach(function (k) { if (JSON.stringify(pr[k]) !== JSON.stringify(pp[k])) diff[k] = pr[k] === undefined ? (Array.isArray(pp[k]) ? [] : (typeof pp[k] === 'boolean' ? false : (typeof pp[k] === 'number' ? 0 : ''))) : pr[k]; });
            if (Object.keys(diff).length) e.prereglages = diff;
          }
          if (Object.keys(e).length) ecarts[c.code] = e;
        });
        var valeur = JSON.parse(JSON.stringify(ag)), cats = valeur.categories || {};
        if (Object.keys(ecarts).length) cats[niveauCategories] = ecarts; else delete cats[niveauCategories];
        valeur.categories = cats;
        if (Object.keys(cats).length === 0) delete valeur.categories;
        // Couleurs et transparence par type des versions précédentes : désormais portées par les catégories
        if (niveauCategories === '*') { delete valeur.attenteSansPatient; Object.keys(valeur.couleurs || {}).forEach(function (k) { if (A.NATURES[k]) delete valeur.couleurs[k]; }); }
        await U.enregistrerConfig([['agenda', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Journal

  // ------------------------------------------------------------ Réglages par service, ouverts au cadre (0.21.0)
  /*
   * Principe du porteur (11 novembre 2026) : les réglages sont modifiables par le cadre dans l'administration quand c'est
   * possible. `config.agendaReglages` = { '*': établissement, <service>: ce que le service remplace } ; l'administrateur
   * règle l'établissement et chaque service, le cadre ses services. Chaque rubrique (`RUBRIQUES`) dessine ses champs à
   * partir des réglages du niveau et rend ce qu'elle veut enregistrer ; les étapes suivantes y ajoutent les leurs.
   */
  var niveauService = null, RUBRIQUES = [];
  function ajouterRubrique(f) { RUBRIQUES.push(f); }
  function niveauxPermis() {
    var s = U.App.session, admin = s.roles().indexOf('ADMIN') >= 0, c = s.compteEffectif();
    var svs = U.tousServices().filter(function (v) { return admin || (c.services || []).indexOf(v.code) >= 0 || !(c.services || []).length; });
    return (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(svs.map(function (v) { return { code: v.code, libelle: 'Service ' + v.libelle }; }));
  }
  function panneauReglagesService() {
    var niveaux = niveauxPermis();
    if (!niveaux.length) return h('section', { class: 'panneau' }, h('p', { class: 'muted', text: 'Aucun service à régler.' }));
    if (!niveauService || !niveaux.some(function (n) { return n.code === niveauService; })) niveauService = niveaux[0].code;
    var tout = JSON.parse(JSON.stringify(U.config().agendaReglages || {})), propre = tout[niveauService] || {};
    var herite = niveauService === '*' ? {} : (tout['*'] || {});
    var sel = h('select', { 'aria-label': 'Niveau des réglages', onchange: function () { niveauService = sel.value; U.rendreContenu(); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle, selected: n.code === niveauService }); }));
    var lecteurs = [], autres = [];   // `autres` : rubriques qui écrivent aussi un autre réglage commun (ex. couleurs d'une donnée)
    var corps = RUBRIQUES.map(function (f) { var r = f({ niveau: niveauService, propre: propre, herite: herite, effectif: Object.assign({}, herite, propre) }); lecteurs.push(r.lire); if (r.config) autres.push(r.config); return h('div', { class: 'pile ag-section' }, h('b', { text: r.titre }), r.noeud); });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Organisation par service' }),
      h('p', { class: 'muted', text: 'Réglages de l’établissement, que chaque service peut remplacer : l’administrateur règle l’établissement et les services, le cadre règle ses services. Un réglage laissé « comme l’établissement » suit l’établissement.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', sel), corps,
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          var v = {};
          lecteurs.forEach(function (l) { var x = l(); Object.keys(x).forEach(function (k) { if (x[k] !== undefined) v[k] = x[k]; }); });
          if (Object.keys(v).length) tout[niveauService] = v; else delete tout[niveauService];
          var plus = []; autres.forEach(function (f) { plus = plus.concat(f() || []); });
          await U.enregistrerConfig([['agendaReglages', tout]].concat(plus));
          U.toast('Réglages enregistrés.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }
  /** Cases de rôles, avec « comme l'établissement » pour un service. `defaut` : rôles par défaut. */
  function choixRoles(ctx, cle, defaut, exclus) {
    var suit = ctx.niveau !== '*' && !Array.isArray(ctx.propre[cle]);
    var val = Array.isArray(ctx.effectif[cle]) && ctx.effectif[cle].length ? ctx.effectif[cle].slice() : defaut.slice();
    var cbSuit = ctx.niveau === '*' ? null : h('input', { type: 'checkbox', checked: suit, onchange: function () { suit = cbSuit.checked; zone.hidden = suit; } });
    var roles = SIC.model.rolesConfig(U.config()).filter(function (r) { return r.code !== 'ADMIN' && (exclus || []).indexOf(r.code) < 0; });
    var zone = h('div', { class: 'actions gauche', hidden: suit }, roles.map(function (r) {
      var cb = h('input', { type: 'checkbox', checked: val.indexOf(r.code) >= 0, onchange: function () { val = cb.checked ? val.concat([r.code]) : val.filter(function (y) { return y !== r.code; }); } });
      return h('label', { class: 'case' }, cb, h('span', { text: r.libelle || r.code }));
    }));
    return { noeud: h('div', { class: 'pile' }, cbSuit ? h('label', { class: 'case' }, cbSuit, h('span', { text: 'Comme l’établissement' })) : null, zone), lire: function () { return suit ? undefined : val.slice(); } };
  }
  ajouterRubrique(function (ctx) {
    var r = choixRoles(ctx, 'rolesConfirmation', SIC.agendaParticipants.ROLES_CONFIRMATION_DEFAUT);
    return { titre: 'Inscriptions à confirmer : qui confirme, en plus de l’auteur de l’événement et de ses organisateurs', noeud: r.noeud, lire: function () { return { rolesConfirmation: r.lire() }; } };
  });
  ajouterRubrique(function (ctx) {
    var suit = ctx.niveau !== '*' && ctx.propre.partageDefaut === undefined, v = ctx.effectif.partageDefaut === 'co' ? 'co' : 'invites';
    var sel = h('select', { 'aria-label': 'Place proposée pour les autres services' }, (ctx.niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement', selected: suit })]).concat(Object.keys(A.PARTAGES).map(function (k) { return h('option', { value: k, text: A.PARTAGES[k], selected: !suit && v === k }); })));
    return { titre: 'Événements de plusieurs services : choix proposé à la création', noeud: sel, lire: function () { return { partageDefaut: sel.value || undefined }; } };
  });
  // Échanges avec la messagerie par fichier .ics (lot A, 14 novembre 2026)
  ajouterRubrique(function (ctx) {
    function choix(cle, defaut, libelle) {
      var suit = ctx.niveau !== '*' && ctx.propre[cle] === undefined, v = ctx.effectif[cle] === undefined ? defaut : ctx.effectif[cle] === true;
      var sel = h('select', { 'aria-label': libelle }, (ctx.niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement (' + (v ? 'oui' : 'non') + ')', selected: suit })])
        .concat([h('option', { value: 'oui', text: 'Oui', selected: !suit && v }), h('option', { value: 'non', text: 'Non', selected: !suit && !v })]));
      return { noeud: h('label', {}, libelle, sel), lire: function () { return sel.value === '' ? undefined : sel.value === 'oui'; } };
    }
    var ex = choix('icsExport', true, 'Export de « Mon agenda » vers la messagerie (sans identité de patient)'),
      im = choix('icsImport', true, 'Import de l’agenda de la messagerie dans « Mon agenda » (lecture seule)'),
      ga = choix('icsGarder', false, 'Agenda importé gardé d’une connexion à l’autre (chiffré avec la clé de l’agent)');
    return { titre: 'Échanges avec Outlook, Zimbra et les autres messageries (fichier .ics)', noeud: h('div', { class: 'grille-3' }, ex.noeud, im.noeud, ga.noeud),
      lire: function () { return { icsExport: ex.lire(), icsImport: im.lire(), icsGarder: ga.lire() }; } };
  });
  // Permissions : processus de validation par mode d'hospitalisation (étapes, couleurs, délais, tâches, rôles)
  ajouterRubrique(function (ctx) {
    var PM = SIC.agendaPermissions, propres = JSON.parse(JSON.stringify(ctx.propre.processPermissions || {})), zone = h('div', { class: 'pile' });
    var roles = SIC.model.rolesConfig(U.config()).filter(function (r) { return r.code !== 'ADMIN'; });
    function dessiner() {
      U.vider(zone);
      Object.keys(PM.FAMILLES).forEach(function (f) {
        var herite = (ctx.herite.processPermissions || {})[f], base = (herite && PM.etapes(herite.etapes)) || PM.DEFAUT[f];
        var regle = !!propres[f], es = regle ? propres[f].etapes : base;
        var cb = h('input', { type: 'checkbox', checked: regle, onchange: function () { if (cb.checked) propres[f] = { etapes: JSON.parse(JSON.stringify(base)) }; else delete propres[f]; dessiner(); } });
        var lignes = es.map(function (e, i) {
          if (!regle) return h('li', {}, teinter(h('span', { class: 'ag-etape faite', text: e.libelle }), e.couleur), h('small', { class: 'muted', text: (e.tache ? ' ' + e.tache : '') + (e.delai !== undefined ? ' — ' + (e.delai ? e.delai + ' h avant le début' : 'au plus tard au début') : '') + (e.retour ? ' — attend une réponse (accord, refus, demande)' : '') }));
          var lib = h('input', { type: 'text', maxlength: 80, value: e.libelle, 'aria-label': 'Nom de l’étape', oninput: function () { e.libelle = lib.value; } });
          var coul = h('input', { type: 'color', value: e.couleur || '#6b7280', 'aria-label': 'Couleur de l’étape', oninput: function () { e.couleur = coul.value; } });
          var del = h('input', { type: 'number', min: 0, max: 720, value: e.delai === undefined ? '' : e.delai, class: 'champ-court', placeholder: 'sans', 'aria-label': 'Délai minimum en heures avant le début', oninput: function () { if (del.value === '') delete e.delai; else e.delai = Math.max(0, Math.round(+del.value || 0)); } });
          var tache = h('input', { type: 'text', maxlength: 120, value: e.tache || '', placeholder: 'Tâche associée (ex. Certificat à envoyer)', 'aria-label': 'Tâche associée', oninput: function () { e.tache = tache.value; } });
          var ret = h('input', { type: 'checkbox', checked: !!e.retour, onchange: function () { e.retour = ret.checked; } });
          var rs = e.roles && e.roles.length ? e.roles : PM.ROLES_DEFAUT.slice();
          return h('li', { class: 'pile ag-validation' },
            h('div', { class: 'actions gauche' }, h('b', { text: (i + 1) + '.' }), lib, coul, h('label', { class: 'en-ligne nowrap' }, 'Délai', del, h('small', { text: 'h avant' })),
              i > 0 ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Monter l’étape', onclick: function () { es.splice(i - 1, 0, es.splice(i, 1)[0]); dessiner(); } }, '↑') : null,
              es.length > 2 ? h('button', { class: 'btn petit danger', type: 'button', onclick: function () { es.splice(i, 1); dessiner(); } }, 'Retirer') : null),
            i > 0 ? h('div', { class: 'actions gauche' }, tache, h('label', { class: 'case' }, ret, h('span', { text: 'Attend une réponse extérieure (accord, refus, demande)' }))) : null,
            i > 0 ? h('div', { class: 'actions gauche' }, h('small', { class: 'muted', text: 'Enregistrée par :' }), roles.map(function (r) {
              var c = h('input', { type: 'checkbox', checked: rs.indexOf(r.code) >= 0, onchange: function () { rs = c.checked ? rs.concat([r.code]) : rs.filter(function (y) { return y !== r.code; }); e.roles = rs.slice(); } });
              return h('label', { class: 'case' }, c, h('span', { text: r.libelle || r.code }));
            })) : null);
        });
        zone.appendChild(h('div', { class: 'pile' }, h('div', { class: 'actions gauche' }, h('b', { text: PM.FAMILLES[f] }), h('label', { class: 'case' }, cb, h('span', { text: 'Processus propre à ' + (ctx.niveau === '*' ? 'l’établissement' : 'ce service') }))),
          h('ol', { class: 'liste-simple' }, lignes),
          regle ? h('div', { class: 'actions gauche' }, h('button', { class: 'btn petit', type: 'button', onclick: function () { es.push({ code: 'e' + Date.now().toString(36).slice(-6), libelle: 'Nouvelle étape', couleur: '#6b7280' }); dessiner(); } }, '+ Étape'),
            h('small', { class: 'muted', text: 'La dernière étape vaut validation de la permission.' })) : null));
      });
    }
    dessiner();
    var suit = ctx.niveau !== '*' && ctx.propre.tachesPermission === undefined, tv = ctx.effectif.tachesPermission === 'office' ? 'office' : 'suggerees';
    var selT = h('select', { 'aria-label': 'Tâches des étapes' }, (ctx.niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement', selected: suit })]).concat([['suggerees', 'Tâches suggérées sur la permission (à ajouter à la check-list)'], ['office', 'Tâches ajoutées d’office à la check-list à la création']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: !suit && tv === o[0] }); })));
    return { titre: 'Permissions de sortie : étapes de validation selon le mode d’hospitalisation', noeud: h('div', { class: 'pile' },
      h('small', { class: 'muted', text: 'Processus fournis à faire relire par l’établissement (médecins, secrétariat). Les couleurs des étapes sont reprises dans l’agenda. Délai : nombre d’heures avant le début de la permission où l’étape doit être atteinte.' }), zone, h('label', {}, 'Tâches associées aux étapes', selT)),
      lire: function () {
        Object.keys(propres).forEach(function (k) { var v = PM.etapes(propres[k].etapes); if (!v) throw new Error('Un processus de permission a au moins deux étapes nommées.'); propres[k] = { etapes: v }; });
        return { processPermissions: Object.keys(propres).length ? propres : undefined, tachesPermission: selT.value || undefined };
      } };
  });
  // Tâches suggérées selon la prise en charge (type de professionnel ou de structure → tâche, délai, obligatoire)
  ajouterRubrique(function (ctx) {
    var suit = ctx.niveau !== '*' && !Array.isArray(ctx.propre.suggestions);
    var regles = JSON.parse(JSON.stringify(Array.isArray(ctx.effectif.suggestions) ? ctx.effectif.suggestions : A.SUGGESTIONS_DEFAUT));
    var types = SIC.intervenants.reglages(U.config()).types, zone = h('div', { class: 'pile' });
    var cbSuit = ctx.niveau === '*' ? null : h('input', { type: 'checkbox', checked: suit, onchange: function () { suit = cbSuit.checked; dessiner(); } });
    function dessiner() {
      U.vider(zone);
      if (suit) return;
      regles.forEach(function (rg, i) {
        var selT = h('select', { 'aria-label': 'Type de professionnel ou de structure', onchange: function () { rg.type = selT.value; } }, types.map(function (t) { return h('option', { value: t.code, text: t.libelle, selected: rg.type === t.code }); }));
        var tache = h('input', { type: 'text', maxlength: 100, value: rg.tache || '', placeholder: 'ex. Appeler l’infirmier libéral', 'aria-label': 'Tâche suggérée', oninput: function () { rg.tache = tache.value; } });
        var obl = h('input', { type: 'checkbox', checked: !!rg.obligatoire, onchange: function () { rg.obligatoire = obl.checked; } });
        zone.appendChild(h('div', { class: 'pile ag-validation' }, h('div', { class: 'actions gauche' }, selT, tache, selectDelai(rg.delai === undefined ? null : rg.delai, function (v) { rg.delai = v; }),
          h('button', { class: 'btn petit danger', type: 'button', onclick: function () { regles.splice(i, 1); dessiner(); } }, 'Retirer')),
          h('div', { class: 'actions gauche' }, h('small', { class: 'muted', text: 'Pour :' }), Object.keys(A.EVENEMENTS_SUGGESTION).map(function (k) {
            var c = h('input', { type: 'checkbox', checked: (rg.pour || []).indexOf(k) >= 0, onchange: function () { rg.pour = c.checked ? (rg.pour || []).concat([k]) : (rg.pour || []).filter(function (y) { return y !== k; }); } });
            return h('label', { class: 'case' }, c, h('span', { text: A.EVENEMENTS_SUGGESTION[k] }));
          }), h('label', { class: 'case' }, obl, h('span', { text: 'Obligatoire (ajoutée d’office, retirée par le cadre seul)' })))));
      });
      zone.appendChild(h('button', { class: 'btn petit', type: 'button', onclick: function () { regles.push({ type: types[0].code, tache: '', delai: 2, pour: ['sortie'] }); dessiner(); } }, '+ Règle'));
    }
    dessiner();
    var bSuit = ctx.niveau !== '*' && ctx.propre.tachesObligatoiresBloquent === undefined;
    var selB = h('select', { 'aria-label': 'Tâches obligatoires non faites' }, (ctx.niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement', selected: bSuit })]).concat([['non', 'Alerte seulement (pas de blocage)'], ['oui', 'La dernière étape d’une permission attend les tâches obligatoires']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: !bSuit && (ctx.effectif.tachesObligatoiresBloquent ? 'oui' : 'non') === o[0] }); })));
    return { titre: 'Tâches suggérées selon la prise en charge du patient (infirmier libéral, foyer, hôpital de jour…)', noeud: h('div', { class: 'pile' },
      h('small', { class: 'muted', text: 'Quand un patient d’une sortie ou d’une permission a un professionnel ou une structure de ce type dans sa fiche, la tâche est proposée pour la check-list, avec son délai d’anticipation.' }),
      cbSuit ? h('label', { class: 'case' }, cbSuit, h('span', { text: 'Comme l’établissement' })) : null, zone, h('label', {}, 'Tâches obligatoires non faites', selB)),
      lire: function () { return { suggestions: suit ? undefined : regles.filter(function (rg) { return String(rg.tache || '').trim(); }), tachesObligatoiresBloquent: selB.value === '' ? undefined : selB.value === 'oui' }; } };
  });
  ajouterRubrique(function (ctx) {
    var suit = ctx.niveau !== '*' && ctx.propre.sortieEvenement === undefined;
    var sel = h('select', { 'aria-label': 'Événement de sortie' }, (ctx.niveau === '*' ? [] : [h('option', { value: '', text: 'Comme l’établissement', selected: suit })]).concat([['suggere', 'Proposé : l’agent choisit de créer l’événement de sortie et sa check-list'], ['office', 'Créé d’office avec sa check-list']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: !suit && (ctx.effectif.sortieEvenement === 'office' ? 'office' : 'suggere') === o[0] }); })));
    // Couleurs dédiées (décision du porteur du 11 novembre 2026) : envisagée, actée, date passée ; écrites dans les
    // réglages de la donnée « patients.sortiePrevue », donc reprises dans la Vue d'ensemble, sa légende et l'agenda
    var CO = SIC.couleurs, SO = SIC.sorties, CODE = 'patients.sortiePrevue';
    var tousRD = JSON.parse(JSON.stringify(U.config().reglagesDonnees || {})), donnee = tousRD[CODE] || {}, blocN = donnee[ctx.niveau];
    var enVigueur = CO.reglages(U.config(), CODE, ctx.niveau === '*' ? null : ctx.niveau, { regles: SO.REGLES_DEFAUT });
    var cs = SO.couleursDe(enVigueur.regles), suitC = ctx.niveau !== '*' && !blocN;
    function choix(g) {
      var s0 = h('select', { 'aria-label': SO.LIBELLES[g], onchange: function () { cs[g] = s0.value; } }, [h('option', { value: '', text: 'Sans couleur', selected: !cs[g] })].concat(CO.PALETTE.map(function (p) { return h('option', { value: p.code, text: p.symbole + ' ' + p.libelle, selected: cs[g] === p.code }); })));
      return h('label', {}, SO.LIBELLES[g], s0);
    }
    var zoneC = h('div', { class: 'grille-3', hidden: suitC }, choix('envisagee'), choix('actee'), choix('passee'));
    var cbC = ctx.niveau === '*' ? null : h('input', { type: 'checkbox', checked: suitC, onchange: function () { suitC = cbC.checked; zoneC.hidden = suitC; } });
    return { titre: 'Sorties envisagées et actées', noeud: h('div', { class: 'pile' },
      h('b', { class: 'ag-sous-titre', text: 'Couleurs (Vue d’ensemble et agenda)' }), cbC ? h('label', { class: 'case' }, cbC, h('span', { text: 'Comme l’établissement' })) : null, zoneC,
      h('small', { class: 'muted', text: 'En noir et blanc, chaque couleur garde son symbole, repris dans la légende.' }),
      h('label', {}, 'Sortie actée : événement de l’agenda', sel)),
      lire: function () { return { sortieEvenement: sel.value || undefined }; },
      config: function () {
        if (suitC) { if (!blocN) return []; delete donnee[ctx.niveau]; }
        else donnee[ctx.niveau] = { regles: SO.reglesAvec(enVigueur.regles, cs), delai: (blocN && blocN.delai) || enVigueur.delai || null };
        if (Object.keys(donnee).length) tousRD[CODE] = donnee; else delete tousRD[CODE];
        return [['reglagesDonnees', tousRD]];
      } };
  });

  I.panneauReglages = panneauReglages;
  I.panneauReglagesService = panneauReglagesService; I.ajouterRubrique = ajouterRubrique; I.choixRoles = choixRoles;
  I.panneauCategories = panneauCategories;
})();
