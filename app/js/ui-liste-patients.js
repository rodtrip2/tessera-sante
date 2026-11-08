// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Patients — fenêtre « Liste des patients » (décisions du porteur du 7 novembre 2026) : affichage réglable par
 * l'agent (périmètre, par chambre, tri, recherche, colonnes, couleur selon le mode d'hospitalisation, filtres),
 * affichages enregistrés (les siens, et ceux réglés par l'administrateur pour un service et un métier), réglages dans
 * Administration → Patients. Logique : liste-patients.js. L'onglet « Patients » d'Isocont (statistiques d'isolement et de
 * contention par patient) reste dans la fenêtre d'Isocont.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, L = SIC.listePatients, P = SIC.patients, C = SIC.crypto;
  var CLE_POSTE = 'sic-patients-liste';
  var etat = { vue: null, reglage: null, recherche: '' };
  try { var memo = JSON.parse(localStorage.getItem(CLE_POSTE) || 'null'); if (memo) { etat.vue = memo.vue || null; etat.reglage = memo.reglage ? L.reglage(memo.reglage) : null; } } catch (e) { /* stockage indisponible */ }
  function retenir() { try { localStorage.setItem(CLE_POSTE, JSON.stringify({ vue: etat.vue, reglage: etat.reglage })); } catch (e) { /* */ } }

  function session() { return U.App.session; }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function mesServices() { return session().mesServices(); }
  function opts() { return L.options(U.config()); }
  function vuesDefaut() { return L.vuesPour(U.config(), mesServices(), session().roles()); }
  function vuesPerso() { var p = session().preferences || {}; return Array.isArray(p.vuesPatients) ? p.vuesPatients.filter(function (v) { return v && v.id && v.nom; }) : []; }
  function toutesVues() { return vuesDefaut().map(function (v) { return Object.assign({ perso: false }, v); }).concat(vuesPerso().map(function (v) { return { id: v.id, nom: v.nom, reglage: L.reglage(v.reglage), perso: true }; })); }
  function reglageCourant() {
    if (etat.reglage) return etat.reglage;
    var v = toutesVues().filter(function (x) { return x.id === etat.vue; })[0] || toutesVues()[0];
    etat.vue = v ? v.id : null;
    etat.reglage = v ? L.reglage(v.reglage) : L.reglage(L.REGLAGE_DEFAUT);
    return etat.reglage;
  }
  function changer(f) { var r = JSON.parse(JSON.stringify(reglageCourant())); f(r); etat.reglage = L.reglage(r); retenir(); U.rendreContenu(); }
  /** Colonnes du module Suivi médical : lues à la volée (fourniture suivi.patient) si l'agent en détient la clé. */
  /** Nom actuel d'un médecin (un ancien nom saisi dans la fiche suit le médecin). */
  function nomMed(n, id) { return (n || id) && SIC.medecins ? SIC.medecins.resoudre(U.config(), n, id) : (n || ''); }
  function suiviLisible() { var s = session(); return !!(s.detientCle && s.detientCle('suivi')) && !!s.etatModule('suivi'); }
  function isocontLisible() { var s = session(); return !!(s.detientCle && s.detientCle('isocont')) && !!U.st() && !!U.st().mesures; }
  /** Données complémentaires de la fiche visibles par l'agent (tous ses services), en colonnes « c:<id> ». */
  function colonnesComplements() {
    var roles = session().roles();
    return P.champsComplementaires(U.config()).filter(function (c) { return P.peutVoirChamp(c, roles); }).map(function (c) { return { code: 'c:' + c.id, libelle: c.libelle, champ: c }; });
  }
  function toutesColonnes() { return L.COLONNES.concat(colonnesComplements()); }
  function colonnesVisibles(r) { var iso = isocontLisible(); var sm = suiviLisible(); return toutesColonnes().filter(function (c) { return r.colonnes.indexOf(c.code) >= 0 && (!c.isocont || iso) && (!c.suivi || sm); }).sort(function (a, b) { return r.colonnes.indexOf(a.code) - r.colonnes.indexOf(b.code); }); }
  function libColonne(code, service) {
    if (code === 'medecin1' || code === 'medecin2') return P.optionsFiche(U.config(), service || (U.App.service !== '*' ? U.App.service : (mesServices()[0] || '')))[code];
    return (toutesColonnes().filter(function (c) { return c.code === code; })[0] || {}).libelle || code;
  }
  function dateFr(iso) { return iso ? String(iso).split('-').reverse().join('/') : '—'; }
  function teinter(el, c) { if (c) el.style.setProperty('--c', c); return el; }

  // ------------------------------------------------------------ Cellules
  function cellule(code, l, maintenant) {
    var p = l.p, M = SIC.model;
    if (/^c:/.test(code)) { var cc = colonnesComplements().filter(function (c) { return c.code === code; })[0]; var v = (p.complements || {})[code.slice(2)]; return h('td', { text: cc && v !== undefined ? P.libValeurChamp(cc.champ, v) || '—' : '—' }); }
    switch (code) {
      case 'patient': return h('td', { class: 'patient' }, h('b', { text: ((p.nom || '?') + ' ' + (p.prenom || '')).trim() }),
        l.situation === 'recent' ? h('span', { class: 'badge', text: 'sorti(e) le ' + dateFr(l.sortie) }) : (l.situation === 'sorti' ? h('span', { class: 'badge', text: 'sorti(e)' }) : null));
      case 'ipp': return h('td', { class: 'nowrap', text: p.ipp || '—' });
      case 'naissance': return h('td', { class: 'nowrap', text: p.naissance ? dateFr(p.naissance) + (l.age !== null ? ' (' + l.age + ' ans)' : '') : '—' });
      case 'sexe': return h('td', { text: P.SEXES[p.sexe] || '—' });
      case 'service': return h('td', { text: l.service ? U.libService(l.service) : '—' });
      case 'chambre': return h('td', { class: 'nowrap', text: l.chambre ? l.chambre + (l.lit ? ' ' + l.lit : '') : '—' });
      case 'entree': return h('td', { class: 'nowrap', text: dateFr(l.entree) });
      case 'sortie': return h('td', { class: 'nowrap', text: dateFr(l.sortie) });
      case 'mode': return h('td', {}, l.mode ? teinter(h('span', { class: 'badge mode-hospi', text: l.mode }), opts().couleursModes[l.mode]) : '—');
      case 'medecin1': return h('td', { text: nomMed(p.medecin1, p.medecin1Id) || '—' });
      case 'medecin2': return h('td', { text: nomMed(p.medecin2, p.medecin2Id) || '—' });
      case 'referents': return h('td', { text: (p.referents || []).map(function (r) { return r.nom; }).join(', ') || '—' });
      case 'psychologue': return h('td', { text: p.psychologue || '—' });
      case 'suiviAS': var a = p.suiviAS; return h('td', { text: !a ? '—' : (a.suivi ? 'Oui' + (a.nom ? ' (' + a.nom + ')' : '') : 'Non') });
      case 'protection': return h('td', { text: p.protection || '—' });
      case 'detenu': return h('td', { text: p.detenu ? 'Oui' : '—' });
      case 'mesuresEnCours':
        var ms = M.listeMesures(U.st()).filter(function (m) { return m.patientId === p.id && typeof m.fin !== 'number'; });
        return h('td', {}, ms.length ? ms.map(function (m) { return h('span', { class: 'badge bad', text: m.type + ' depuis ' + U.duree((maintenant - m.debut) / 36e5) }); }) : '—');
      case 'cumuls':
        var c = M.cumulsPatient(U.st(), p.id, maintenant);
        return h('td', { class: 'nowrap' }, h('small', { text: 'Isolement ' + U.duree(c.iso15) }), h('br'), h('small', { text: 'Contention ' + U.duree(c.cont15) }));
      case 'dernierEntretien':
      case 'contratReevalue':
        var sp = SIC.modules.lire('suivi.patient', session().etatModule('suivi'), { patient: p, config: U.config(), maintenant: maintenant });
        var x = sp && (code === 'dernierEntretien' ? sp.entretien : sp.contrat);
        if (!x || l.situation !== 'hospitalise') return h('td', { text: '—' });
        return h('td', { class: 'nowrap' }, x.date ? dateFr(x.date) + ' ' : '', h('span', { class: 'badge ' + (x.retard ? 'bad' : 'ok'), text: x.date ? (x.jours === 0 ? 'aujourd’hui' : x.jours + ' j') : (x.retard ? 'à faire' : 'pas encore') }));
      case 'vigilance':
        var v = M.cumulsPatient(U.st(), p.id, maintenant).niveau;
        return h('td', {}, h('span', { class: 'badge ' + ({ rouge: 'bad', jaune: 'warn', vert: 'ok' })[v], text: v }));
    }
    return h('td', { text: '' });
  }

  // ------------------------------------------------------------ Vue
  function vueListe(maintenant) {
    var r = reglageCourant(), o = opts(), s = session(), peutFiche = s.peut('PATIENT');
    var cols = colonnesVisibles(r);
    var ls = L.lignes(U.st().patients, r, { maintenant: maintenant, services: servicesAffiches(), joursRecents: o.joursRecents, recherche: etat.recherche, nomMedecin: nomMed });
    // Choix de l'affichage enregistré
    var vues = toutesVues();
    var selVue = h('select', { 'aria-label': 'Affichage enregistré', onchange: function () {
      var v = vues.filter(function (x) { return x.id === selVue.value; })[0];
      if (!v) return;
      etat.vue = v.id; etat.reglage = L.reglage(v.reglage); retenir(); U.rendreContenu();
    } }, vues.map(function (v) { return h('option', { value: v.id, text: (v.perso ? 'Mon affichage : ' : '') + v.nom, selected: v.id === etat.vue }); }));
    var modifie = (function () { var v = vues.filter(function (x) { return x.id === etat.vue; })[0]; return !v || JSON.stringify(L.reglage(v.reglage)) !== JSON.stringify(r); })();
    var champ = h('input', { type: 'search', placeholder: 'Rechercher (nom, IPP, chambre)', value: etat.recherche, class: 'champ-moyen', 'aria-label': 'Rechercher un patient' });
    champ.addEventListener('input', function () { etat.recherche = champ.value; var pos = champ.selectionStart; U.rendreContenu(); var c = document.querySelector('main input[type=search]'); if (c) { c.focus(); c.setSelectionRange(pos, pos); } });
    function sel(lib, valeurs, actuel, f) {
      var x = h('select', { 'aria-label': lib, onchange: function () { f(x.value); } }, Object.keys(valeurs).map(function (k) { return h('option', { value: k, text: valeurs[k], selected: String(actuel) === k }); }));
      return h('label', { class: 'en-ligne nowrap' }, lib, x);
    }
    var tris = {}; L.TRIS.forEach(function (k) { tris[k] = libColonne(k); });
    // Filtres : modes, médecin, référent (soignant ou psychologue)
    var tousPat = Object.keys(U.st().patients).map(function (k) { return U.st().patients[k]; });
    var medecins = {}, referents = {};
    tousPat.forEach(function (p) { [p.medecin1, p.medecin2].forEach(function (m) { if (m) medecins[nomMed(m)] = nomMed(m); }); (p.referents || []).forEach(function (x) { referents[x.nom] = x.nom; }); if (p.psychologue) referents[p.psychologue] = p.psychologue + ' (psychologue)'; });
    var modes = (U.config().modesHospitalisation || []).map(function (m) { return m.code; });
    var casesModes = h('div', { class: 'actions gauche' }, modes.map(function (m) {
      var cb = h('input', { type: 'checkbox', checked: r.filtres.modes.indexOf(m) >= 0, onchange: function () { changer(function (x) { x.filtres.modes = cb.checked ? x.filtres.modes.concat([m]) : x.filtres.modes.filter(function (y) { return y !== m; }); }); } });
      return h('label', { class: 'case' }, cb, teinter(h('span', { class: 'badge mode-hospi', text: m }), o.couleursModes[m]));
    }));
    var filtresC = colonnesComplements().filter(function (c) { return c.champ.type === 'ouiNon' || c.champ.type === 'liste'; }).map(function (c) {
      var vals = { '': 'Tous' };
      if (c.champ.type === 'ouiNon') { vals.oui = 'Oui'; vals.non = 'Non'; } else c.champ.choix.forEach(function (x) { vals[x] = x; });
      vals['(vide)'] = 'Non renseigné';
      return sel(c.libelle, vals, r.filtres.complements[c.champ.id] || '', function (v) { changer(function (x) { if (v) x.filtres.complements[c.champ.id] = v; else delete x.filtres.complements[c.champ.id]; }); });
    });
    var nbFiltres = r.filtres.modes.length + (r.filtres.medecin ? 1 : 0) + (r.filtres.referent ? 1 : 0) + Object.keys(r.filtres.complements).length;
    var filtres = h('details', { class: 'filtres-patients', open: nbFiltres ? true : null }, h('summary', { text: 'Filtres' + (nbFiltres ? ' (' + nbFiltres + ')' : '') }),
      h('div', { class: 'pile' }, h('div', {}, h('small', { class: 'muted', text: 'Mode d’hospitalisation (aucune case : tous)' }), casesModes),
        h('div', { class: 'actions gauche' },
          sel('Médecin', Object.assign({ '': 'Tous' }, medecins), r.filtres.medecin, function (v) { changer(function (x) { x.filtres.medecin = v; }); }),
          sel('Référent', Object.assign({ '': 'Tous' }, referents), r.filtres.referent, function (v) { changer(function (x) { x.filtres.referent = v; }); }),
          filtresC,
          nbFiltres ? h('button', { class: 'btn petit', type: 'button', onclick: function () { changer(function (x) { x.filtres = { modes: [], medecin: '', referent: '', complements: {} }; }); } }, 'Retirer les filtres') : null)));
    // Tableau
    var classeCouleur = r.coloration === 'ligne' ? 'colore-ligne' : (r.coloration === 'texte' ? 'colore-texte' : '');
    function ligne(l) {
      var tr = h('tr', { class: (classeCouleur && l.mode ? classeCouleur : '') + (l.situation !== 'hospitalise' ? ' sorti' : '') },
        cols.map(function (c) { return cellule(c.code, l, maintenant); }),
        h('td', { class: 'actions-ligne' },
          h('button', { class: 'btn petit', title: peutFiche ? 'Voir et corriger la fiche, ses séjours' : 'Voir la fiche (lecture seule)', onclick: function () { U.fichePatient.modale(l.p); } }, 'Fiche'), ' ',
          s.peut('MODE_HOSPI') && U.fichePatient.psychiatrie(l.p.service) ? h('button', { class: 'btn petit', onclick: function () { U.fichePatient.mode(l.p); } }, 'Mode') : null));
      return classeCouleur && l.mode ? teinter(tr, o.couleursModes[l.mode]) : tr;
    }
    var corps;
    if (r.regroupement === 'chambre') corps = L.parChambre(ls).map(function (g) {
      return [h('tr', { class: 'groupe-chambre' }, h('th', { colspan: cols.length + 1, text: g.chambre ? 'Chambre ' + g.chambre : 'Sans chambre indiquée' }))].concat(g.lignes.map(ligne));
    });
    else corps = ls.map(ligne);
    function entete(c) {
      var triable = L.TRIS.indexOf(c.code) >= 0 && r.regroupement !== 'chambre', actif = r.tri === c.code;
      return h('th', { 'aria-sort': actif && triable ? (r.sens === 1 ? 'ascending' : 'descending') : null },
        triable ? h('button', { class: 'btn lien tri', type: 'button', title: 'Trier', onclick: function () { changer(function (x) { if (x.tri === c.code) x.sens = -x.sens; else { x.tri = c.code; x.sens = 1; } }); } }, libColonne(c.code) + (actif ? (r.sens === 1 ? ' ▲' : ' ▼') : '')) : libColonne(c.code));
    }
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Liste des patients' }),
        peutFiche ? h('button', { class: 'btn primaire', onclick: function () { U.fichePatient.modale(null); } }, '+ Nouvelle fiche') : null,
        peutFiche && U.importPatients ? h('button', { class: 'btn', onclick: function () { U.importPatients.ouvrir(); } }, 'Importer la liste du DPI…') : null,
        h('div', { class: 'espace' }), h('label', { class: 'en-ligne nowrap' }, 'Affichage', selVue), champ),
      h('div', { class: 'barre reglages-liste' },
        sel('Patients', L.PERIMETRES, r.perimetre, function (v) { changer(function (x) { x.perimetre = v; }); }),
        sel('Présentation', L.REGROUPEMENTS, r.regroupement, function (v) { changer(function (x) { x.regroupement = v; }); }),
        r.regroupement === 'chambre' ? null : h('span', { class: 'en-ligne nowrap' }, sel('Tri', tris, r.tri, function (v) { changer(function (x) { x.tri = v; }); }),
          h('button', { class: 'btn petit', type: 'button', 'aria-label': r.sens === 1 ? 'Ordre croissant (inverser)' : 'Ordre décroissant (inverser)', onclick: function () { changer(function (x) { x.sens = -x.sens; }); } }, r.sens === 1 ? '▲' : '▼')),
        sel('Couleur selon le mode', L.COLORATIONS, r.coloration, function (v) { changer(function (x) { x.coloration = v; }); }),
        h('button', { class: 'btn petit', type: 'button', onclick: modaleColonnes }, 'Colonnes…'),
        h('button', { class: 'btn petit', type: 'button', title: 'Garder ce réglage dans « Mes affichages »', onclick: modaleEnregistrer }, modifie ? 'Enregistrer cet affichage…' : 'Mes affichages…')),
      filtres,
      ls.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'liste-patients entetes-souples' },
        h('thead', {}, h('tr', {}, cols.map(entete), h('th'))),
        h('tbody', {}, corps))) : h('div', { class: 'panneau vide', text: etat.recherche || nbFiltres ? 'Aucun patient ne correspond à la recherche ou aux filtres.' : 'Aucun patient.' }),
      h('p', { class: 'muted' }, h('small', { text: ls.length + ' patient(s). ' + (r.perimetre === 'recents' ? 'Sorties récentes : ' + o.joursRecents + ' derniers jours (réglage de l’établissement). ' : '') + 'Une fiche sans séjour connu compte comme hospitalisée. Les statistiques d’isolement et de contention par patient restent dans l’onglet « Patients » du module Isolement et contention.' })));
  }

  // ------------------------------------------------------------ Colonnes et affichages enregistrés
  function modaleColonnes() {
    var r = reglageCourant(), iso = isocontLisible();
    var ordre = r.colonnes.slice().concat(toutesColonnes().map(function (c) { return c.code; }).filter(function (c) { return r.colonnes.indexOf(c) < 0; }));
    var coches = {}; r.colonnes.forEach(function (c) { coches[c] = true; });
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      ordre.forEach(function (code, i) {
        var c = toutesColonnes().filter(function (x) { return x.code === code; })[0];
        if (!c || (c.isocont && !iso) || (c.suivi && !suiviLisible())) return;
        var cb = h('input', { type: 'checkbox', checked: !!coches[code], disabled: !!c.toujours, onchange: function () { coches[code] = cb.checked; } });
        zone.appendChild(h('div', { class: 'agenda-point' }, h('label', { class: 'case' }, cb, h('span', { text: libColonne(code) + (c.isocont ? ' (module Isolement et contention)' : '') + (c.suivi ? ' (module Suivi médical)' : '') })),
          h('button', { class: 'btn petit', type: 'button', disabled: i === 0, title: 'Monter', 'aria-label': 'Monter ' + c.libelle, onclick: function () { ordre.splice(i - 1, 0, ordre.splice(i, 1)[0]); dessiner(); } }, '▲'),
          h('button', { class: 'btn petit', type: 'button', disabled: i === ordre.length - 1, title: 'Descendre', 'aria-label': 'Descendre ' + c.libelle, onclick: function () { ordre.splice(i + 1, 0, ordre.splice(i, 1)[0]); dessiner(); } }, '▼')));
      });
    }
    dessiner();
    U.modale('Colonnes affichées', h('div', { class: 'pile' }, h('p', { class: 'muted', text: 'Cochez les colonnes à afficher et réglez leur ordre. Le réglage s’applique à l’affichage en cours ; enregistrez-le pour le retrouver.' }), zone), [
      { texte: 'Annuler' },
      { texte: 'Appliquer', classe: 'primaire', action: function () { changer(function (x) { x.colonnes = ordre.filter(function (c) { return coches[c]; }); }); } }]);
  }
  function modaleEnregistrer() {
    var s = session(), perso = vuesPerso().slice(), actuelle = perso.filter(function (v) { return v.id === etat.vue; })[0];
    var nom = h('input', { type: 'text', maxlength: 60, value: actuelle ? actuelle.nom : '', placeholder: 'ex. Mes patients, chambres du 2e étage' });
    var liste = h('ul', { class: 'liste-simple' });
    function dessiner() {
      U.vider(liste);
      if (!perso.length) liste.appendChild(h('li', { class: 'muted', text: 'Aucun affichage enregistré.' }));
      perso.forEach(function (v, i) { liste.appendChild(h('li', {}, h('span', { text: v.nom + ' ' }), h('button', { class: 'btn petit danger', type: 'button', onclick: function () { perso.splice(i, 1); dessiner(); } }, 'Retirer'))); });
    }
    dessiner();
    U.modale('Mes affichages', h('div', { class: 'pile' },
      h('label', {}, 'Enregistrer l’affichage en cours sous le nom', nom),
      h('small', { class: 'muted', text: 'Un nom déjà utilisé remplace l’affichage existant. Vos affichages suivent votre compte sur tous les postes ; les affichages par défaut de votre service et de votre métier sont réglés par l’administrateur.' }),
      h('b', { text: 'Mes affichages enregistrés' }), liste), [
      { texte: 'Fermer' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var n = nom.value.trim();
        if (n) {
          var ex = perso.filter(function (v) { return v.nom.toLowerCase() === n.toLowerCase(); })[0];
          var id = ex ? ex.id : 'm' + C.hex(C.aleatoire(4));
          perso = perso.filter(function (v) { return v.id !== id; }).concat([{ id: id, nom: n, reglage: reglageCourant() }]);
          etat.vue = id;
        }
        await s.enregistrerPreference('vuesPatients', perso);
        retenir();
        U.toast('Affichages enregistrés.');
      } }]);
  }

  // ------------------------------------------------------------ Administration → Patients
  function panneauReglages() {
    var o = opts(), cfg = U.config();
    var jours = h('input', { type: 'number', min: 1, max: 90, step: 1, value: o.joursRecents, class: 'champ-court' });
    var modes = (cfg.modesHospitalisation || []).map(function (m) { return m.code; });
    var champsCouleurs = modes.map(function (m) { return { m: m, c: h('input', { type: 'color', value: o.couleursModes[m] || '#545c57', 'aria-label': 'Couleur du mode ' + m }) }; });
    var vues = JSON.parse(JSON.stringify(o.vues));
    var roles = SIC.modules.obtenir('isocont').droits.rolesConfig(cfg).filter(function (r) { return !r.admin; });
    var zone = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(zone);
      vues.forEach(function (v, i) {
        var nom = h('input', { type: 'text', maxlength: 60, value: v.nom, 'aria-label': 'Nom de l’affichage', oninput: function () { v.nom = nom.value; } });
        var cs = U.tousServices().map(function (sv) { var cb = h('input', { type: 'checkbox', checked: v.services.indexOf(sv.code) >= 0, onchange: function () { v.services = cb.checked ? v.services.concat([sv.code]) : v.services.filter(function (x) { return x !== sv.code; }); } }); return h('label', { class: 'case' }, cb, h('span', { text: sv.libelle })); });
        var cr = roles.map(function (r) { var cb = h('input', { type: 'checkbox', checked: v.roles.indexOf(r.code) >= 0, onchange: function () { v.roles = cb.checked ? v.roles.concat([r.code]) : v.roles.filter(function (x) { return x !== r.code; }); } }); return h('label', { class: 'case' }, cb, h('span', { text: r.libelle })); });
        // Réglage de l'affichage modifiable directement (décision du porteur du 8 novembre 2026) : périmètre, présentation,
        // tri, couleur, colonnes cochées et ordonnées ; ou repris de l'affichage en cours
        var rg = v.reglage = L.reglage(v.reglage);
        function choix(lib, valeurs, cle) {
          var x = h('select', { 'aria-label': lib, onchange: function () { rg[cle] = cle === 'sens' ? +x.value : x.value; } }, Object.keys(valeurs).map(function (k) { return h('option', { value: k, text: valeurs[k], selected: String(rg[cle]) === k }); }));
          return h('label', { class: 'en-ligne nowrap' }, lib, x);
        }
        var tris = {}; L.TRIS.forEach(function (k) { tris[k] = libColonne(k); });
        // Toutes les données complémentaires (l'affichage peut servir à d'autres rôles que l'administrateur)
        var colsAdmin = L.COLONNES.concat(P.champsComplementaires(U.config()).map(function (c) { return { code: 'c:' + c.id, libelle: c.libelle + ' (donnée complémentaire)' }; }));
        var ordre = rg.colonnes.filter(function (c) { return colsAdmin.some(function (y) { return y.code === c; }); }).concat(colsAdmin.map(function (c) { return c.code; }).filter(function (c) { return rg.colonnes.indexOf(c) < 0; }));
        var zoneCols = h('div', { class: 'colonnes-affichage' });
        function dessinerCols() {
          U.vider(zoneCols);
          ordre.forEach(function (code, k) {
            var c = colsAdmin.filter(function (y) { return y.code === code; })[0];
            var cb = h('input', { type: 'checkbox', checked: rg.colonnes.indexOf(code) >= 0, disabled: !!c.toujours, onchange: function () { rg.colonnes = ordre.filter(function (y) { return y === code ? cb.checked : rg.colonnes.indexOf(y) >= 0; }); } });
            zoneCols.appendChild(h('div', { class: 'agenda-point' }, h('label', { class: 'case' }, cb, h('span', { text: (/^c:/.test(code) ? c.libelle : libColonne(code)) + (c.isocont ? ' (Isolement et contention)' : '') + (c.suivi ? ' (Suivi médical)' : '') })),
              h('button', { class: 'btn petit', type: 'button', disabled: k === 0, 'aria-label': 'Monter ' + c.libelle, onclick: function () { ordre.splice(k - 1, 0, ordre.splice(k, 1)[0]); rg.colonnes = ordre.filter(function (y) { return rg.colonnes.indexOf(y) >= 0; }); dessinerCols(); } }, '▲'),
              h('button', { class: 'btn petit', type: 'button', disabled: k === ordre.length - 1, 'aria-label': 'Descendre ' + c.libelle, onclick: function () { ordre.splice(k + 1, 0, ordre.splice(k, 1)[0]); rg.colonnes = ordre.filter(function (y) { return rg.colonnes.indexOf(y) >= 0; }); dessinerCols(); } }, '▼')));
          });
        }
        dessinerCols();
        zone.appendChild(h('fieldset', { class: 'role' }, h('legend', { text: (i + 1) + '. ' + (v.nom || 'Nouvel affichage') }),
          h('label', {}, 'Nom', nom),
          h('div', {}, h('small', { class: 'muted', text: 'Services (aucun : tous)' }), h('div', { class: 'actions gauche' }, cs)),
          h('div', {}, h('small', { class: 'muted', text: 'Métiers (aucun : tous)' }), h('div', { class: 'actions gauche' }, cr)),
          h('div', { class: 'actions gauche' }, choix('Patients', L.PERIMETRES, 'perimetre'), choix('Présentation', L.REGROUPEMENTS, 'regroupement'), choix('Tri', tris, 'tri'),
            choix('Ordre', { 1: 'croissant', '-1': 'décroissant' }, 'sens'), choix('Couleur selon le mode', L.COLORATIONS, 'coloration')),
          h('details', {}, h('summary', { text: 'Colonnes affichées (' + rg.colonnes.length + ')' }), zoneCols),
          h('div', { class: 'actions gauche' },
            h('button', { class: 'btn petit', type: 'button', title: 'Remplacer le réglage par l’affichage en cours dans la liste des patients', onclick: function () { v.reglage = reglageCourant(); dessiner(); } }, 'Reprendre l’affichage en cours'),
            h('button', { class: 'btn petit', type: 'button', disabled: i === 0, onclick: function () { vues.splice(i - 1, 0, vues.splice(i, 1)[0]); dessiner(); } }, '▲ Monter'),
            h('button', { class: 'btn petit danger', type: 'button', onclick: function () { vues.splice(i, 1); dessiner(); } }, 'Retirer'))));
      });
      zone.appendChild(h('div', { class: 'actions gauche' },
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vues.push({ id: 'v' + Date.now().toString(36), nom: 'Nouvel affichage', services: [], roles: [], reglage: reglageCourant() }); dessiner(); } }, '+ Ajouter (à partir de l’affichage en cours)'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { vues = JSON.parse(JSON.stringify(L.VUES_FOURNIES)); dessiner(); } }, 'Revenir aux affichages proposés')));
    }
    dessiner();
    return h('section', { class: 'panneau' }, h('h2', { text: 'Liste des patients' }),
      h('label', { class: 'en-ligne' }, 'Sorties récentes : patients sortis depuis', jours, h('span', { text: 'jours' })),
      h('h3', { text: 'Couleur de chaque mode d’hospitalisation' }),
      h('p', { class: 'muted', text: 'Utilisée quand l’agent choisit de colorer la ligne ou le texte selon le mode (et pour le badge du mode).' }),
      h('div', { class: 'ag-couleurs' }, champsCouleurs.map(function (x) { return h('label', { class: 'en-ligne' }, x.c, h('span', { text: x.m })); })),
      h('h3', { text: 'Affichages par défaut, par service et par métier' }),
      h('p', { class: 'muted', text: 'Proposés dans la liste « Affichage » aux agents du service et du métier indiqués, dans cet ordre : le premier est ouvert par défaut. Réglez la liste des patients comme souhaité, puis « Reprendre l’affichage en cours ». Chaque agent peut aussi enregistrer ses propres affichages.' }),
      zone,
      U.boutonEnregistrer(async function () {
        var valeur = {}, n = Math.round(+jours.value || 7);
        if (n < 1 || n > 90) throw new Error('Sorties récentes : entre 1 et 90 jours.');
        if (n !== 7) valeur.joursRecents = n;
        var cs = {}; champsCouleurs.forEach(function (x) { if (x.c.value.toLowerCase() !== (L.COULEURS_MODES_DEFAUT[x.m] || '#545c57')) cs[x.m] = x.c.value.toLowerCase(); });
        if (Object.keys(cs).length) valeur.couleursModes = cs;
        var vs = vues.map(function (v) { return { id: v.id, nom: String(v.nom || '').trim(), services: v.services, roles: v.roles, reglage: L.reglage(v.reglage) }; }).filter(function (v) { return v.nom; });
        if (!vs.length) throw new Error('Gardez au moins un affichage par défaut.');
        if (JSON.stringify(vs) !== JSON.stringify(L.options({}).vues)) valeur.vues = vs;
        await U.enregistrerConfig([['patientsListe', valeur]]);
      }));
  }

  // ------------------------------------------------------------ Administration → Patients → Données complémentaires
  /**
   * Tableau des données ajoutées à la fiche (décision du porteur du 8 novembre 2026) : une ligne par donnée, son type de
   * valeur, ses services, les rôles qui la saisissent et ceux qui la voient. Une donnée retirée est masquée, jamais effacée.
   */
  function panneauChamps() {
    var cfg = U.config(), champs = JSON.parse(JSON.stringify(P.champsComplementaires(cfg, { tous: true })));
    var roles = SIC.modules.obtenir('isocont').droits.rolesConfig(cfg).filter(function (r) { return !r.admin; });
    var corps = h('tbody');
    function multi(liste, options, vide, aria) {
      var resume = h('span', {}), d = h('details', { class: 'multi' }, h('summary', { 'aria-label': aria }, resume));
      function maj() { resume.textContent = liste.length ? options.filter(function (o) { return liste.indexOf(o.code) >= 0; }).map(function (o) { return o.libelle; }).join(', ') : vide; }
      options.forEach(function (o) {
        var cb = h('input', { type: 'checkbox', checked: liste.indexOf(o.code) >= 0, onchange: function () { var i = liste.indexOf(o.code); if (cb.checked && i < 0) liste.push(o.code); if (!cb.checked && i >= 0) liste.splice(i, 1); maj(); } });
        d.appendChild(h('label', { class: 'case' }, cb, h('span', { text: o.libelle })));
      });
      maj();
      return d;
    }
    function dessiner() {
      U.vider(corps);
      champs.forEach(function (c, i) {
        var lib = h('input', { type: 'text', maxlength: 60, value: c.libelle, 'aria-label': 'Nom de la donnée', oninput: function () { c.libelle = lib.value; } });
        var typ = h('select', { 'aria-label': 'Type de valeur', disabled: !!c.existant, title: c.existant ? 'Type fixé une fois la donnée enregistrée (les valeurs déjà saisies resteraient lisibles)' : null, onchange: function () { c.type = typ.value; dessiner(); } }, Object.keys(P.TYPES_CHAMP).map(function (k) { return h('option', { value: k, text: P.TYPES_CHAMP[k], selected: c.type === k }); }));
        var choix = c.type === 'liste' ? h('input', { type: 'text', value: (c.choix || []).join(' ; '), placeholder: 'Choix séparés par « ; »', 'aria-label': 'Choix proposés', oninput: function () { c.choix = choix.value.split(';').map(function (x) { return x.trim(); }).filter(Boolean); } }) : h('small', { class: 'muted', text: '—' });
        var actif = h('input', { type: 'checkbox', checked: c.actif !== false, 'aria-label': 'Proposée', onchange: function () { c.actif = actif.checked; } });
        corps.appendChild(h('tr', { class: c.actif === false ? 'ancienne' : '' },
          h('td', {}, lib), h('td', {}, typ), h('td', {}, choix),
          h('td', {}, multi(c.services, U.tousServices().map(function (v) { return { code: v.code, libelle: v.libelle }; }), 'Tous les services', 'Services')),
          h('td', {}, multi(c.saisie, roles.map(function (r) { return { code: r.code, libelle: r.libelle }; }), 'Accès aux fiches patient', 'Saisie par')),
          h('td', {}, multi(c.lecture, roles.map(function (r) { return { code: r.code, libelle: r.libelle }; }), 'Tous', 'Visible par')),
          h('td', {}, actif),
          h('td', { class: 'actions-ligne' },
            h('button', { class: 'btn petit', type: 'button', disabled: i === 0, 'aria-label': 'Monter', onclick: function () { champs.splice(i - 1, 0, champs.splice(i, 1)[0]); dessiner(); } }, '▲'),
            c.existant ? null : h('button', { class: 'btn petit danger', type: 'button', onclick: function () { champs.splice(i, 1); dessiner(); } }, 'Retirer'))));
      });
      if (!champs.length) corps.appendChild(h('tr', {}, h('td', { colspan: 8, class: 'muted', text: 'Aucune donnée complémentaire.' })));
    }
    champs.forEach(function (c) { c.existant = true; });
    dessiner();
    var nomNouv = h('input', { type: 'text', maxlength: 60, placeholder: 'ex. Sorties libres, éducateur référent, repas favori' });
    var typeNouv = h('select', { 'aria-label': 'Type de valeur' }, Object.keys(P.TYPES_CHAMP).map(function (k) { return h('option', { value: k, text: P.TYPES_CHAMP[k] }); }));
    return h('section', { class: 'panneau' }, h('h2', { text: 'Données complémentaires de la fiche patient' }),
      h('p', { class: 'muted', text: 'Données propres à l’établissement ou à certains services, ajoutées à la fiche patient. Chacune devient une colonne et, pour « Oui ou non » et « Liste de choix », un filtre de la liste des patients. Saisie : par défaut, les rôles qui ont l’accès aux fiches patient ; on peut l’ouvrir à d’autres rôles (ex. aides-soignants pour les sorties libres). Visibilité : par défaut, tous. Une donnée retirée après usage est masquée (décochez « Proposée ») : ses valeurs restent au journal.' }),
      h('div', { class: 'alerte', text: 'Aucune donnée clinique : ni traitement, ni diagnostic, ni symptôme, ni antécédent. Ces informations relèvent du dossier patient informatisé. Chaque donnée ajoutée est à inscrire à la fiche du registre des traitements (délégué à la protection des données).' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table-champs' },
        h('thead', {}, h('tr', {}, ['Donnée', 'Type de valeur', 'Choix', 'Services', 'Saisie par', 'Visible par', 'Proposée', ''].map(function (t) { return h('th', { text: t }); }))), corps)),
      h('div', { class: 'actions gauche ag-ajouter' }, h('span', { class: 'muted', text: 'Ajouter :' }), nomNouv, typeNouv,
        h('button', { class: 'btn petit', type: 'button', onclick: function () {
          var n = nomNouv.value.trim(); if (!n) return nomNouv.focus();
          var mots = P.libelleClinique(n);
          if (mots.length && !confirm('« ' + n + ' » évoque une donnée clinique (' + mots.join(', ') + '), qui relève du dossier patient informatisé. Ajouter quand même ?')) return;
          var code = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'donnee';
          if (!/^[a-z]/.test(code)) code = 'd-' + code;
          while (champs.some(function (c) { return c.id === code; })) code = code.slice(0, 26) + '-' + C.hex(C.aleatoire(1));
          champs.push({ id: code, libelle: n, type: typeNouv.value, choix: [], services: [], saisie: [], lecture: [], actif: true });
          nomNouv.value = ''; dessiner();
        } }, 'Ajouter')),
      U.boutonEnregistrer(async function () {
        var v = champs.map(function (c) {
          if (!String(c.libelle || '').trim()) throw new Error('Chaque donnée doit avoir un nom.');
          if (c.type === 'liste' && !(c.choix || []).length) throw new Error('« ' + c.libelle + ' » : indiquez les choix proposés.');
          var o = { id: c.id, libelle: c.libelle.trim(), type: c.type, services: c.services, saisie: c.saisie, lecture: c.lecture };
          if (c.type === 'liste') o.choix = c.choix;
          if (c.actif === false) o.actif = false;
          return o;
        });
        await U.enregistrerConfig([['patientsChamps', v]]);
      }));
  }

  SIC.modules.completerInterface('patients', {
    vues: { fiches: vueListe },
    admin: { onglets: function () { return [['patients-champs', 'Données complémentaires', [panneauChamps()]], ['patients', 'Liste des patients', [panneauReglages()]]]; } }
  });
})();
