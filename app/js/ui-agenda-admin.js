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
            h('div', { class: 'actions gauche' }, coche('patients', 'Section Patients affichée'), h('label', { class: 'en-ligne' }, 'Accompagnateurs à trouver', nombre('accompagnateurs', 20, 'Accompagnateurs')),
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

  I.panneauReglages = panneauReglages;
  I.panneauCategories = panneauCategories;
})();
