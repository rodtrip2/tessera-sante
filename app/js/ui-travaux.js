// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Demandes de travaux — interface (0.22.0). Logique : module-travaux.js.
 * Onglets : Demandes (en cours et traitées récemment, en grisé), Historique (toutes) ; Administration → Demandes de
 * travaux (l'administrateur pour l'établissement et les services, le cadre pour ses services).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, T = SIC.travaux, C = SIC.crypto;
  var filtre = { type: '', lieu: '', etat: '' }, recherche = '';

  function st() { return (U.App.session && U.App.session.etatModule('travaux')) || { demandes: {}, avis: [] }; }
  function opts(service) { return T.options(U.config(), service || serviceParDefaut()); }
  function peut(t) { return U.App.session.peut(t); }
  function moi() { return U.App.session.compteEffectif(); }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function serviceParDefaut() { return U.App.service !== '*' ? U.App.service : (U.services()[0] || {}).code; }
  function dateFr(iso) { return iso ? new Date(Date.parse(iso)).toLocaleDateString('fr-FR') : ''; }
  function jourFr(j) { return String(j || '').split('-').reverse().join('/'); }
  function numero(t) { return 'DT-' + String(t.id).slice(-6).toUpperCase(); }
  function libType(t) { return T.lib(opts(t.service).types, t.type) || 'Travaux'; }
  function libGravite(t) { return T.lib(opts(t.service).gravites, t.gravite); }
  function urgenceDe(t) { return opts(t.service).urgences.filter(function (u) { return u.code === t.urgence; })[0] || null; }
  function classeEtat(t) { return t.etat === 'realisee' ? 'ok' : T.TRAITEES.indexOf(t.etat) >= 0 ? '' : t.etat === 'rouverte' ? 'bad' : 'warn'; }
  function numeroST() { return T.options(U.config(), null).telephone; }

  // ------------------------------------------------------------ Informations de l'auteur et urgences
  function avisVus() { var p = U.App.session.preferences || {}; return Array.isArray(p.avisTravauxVus) ? p.avisTravauxVus : []; }
  function mesAvis() { try { return T.avisPour(st(), moi().id, avisVus()); } catch (e) { return []; } }
  async function marquerVus(ids) { try { await U.App.session.enregistrerPreference('avisTravauxVus', avisVus().concat(ids).slice(-300)); U.rendreContenu(); } catch (e) { alert(e.message); } }
  var GENRES = { realisee: 'a marqué réalisée', confirmee: 'a confirmé la réalisation de', rouverte: 'a rouvert' };
  function bandeauAvis() {
    var av = mesAvis();
    if (!av.length) return null;
    return h('section', { class: 'panneau ag-avis', role: 'status' },
      h('div', { class: 'barre' }, h('h2', { text: av.length > 1 ? av.length + ' informations sur vos demandes' : 'Une information sur votre demande' }), h('div', { class: 'espace' }),
        av.length > 1 ? h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus(av.map(function (a) { return a.id; })); } }, 'Tout marquer vu') : null),
      h('ul', { class: 'liste-simple' }, av.map(function (a) {
        var t = st().demandes[a.demande];
        return h('li', {}, h('span', { text: U.App.session.nomAuteur(a.par) + ' ' + GENRES[a.genre] + ' votre demande ' }),
          h('button', { class: 'btn lien', type: 'button', onclick: function () { modaleDemande(t); } }, libType(t) + ' — ' + T.libLieu(t, U.config())),
          h('span', { text: ' (' + dateFr(a.le) + ')' + (a.motif ? ' : ' + a.motif : '') + ' ' }),
          h('button', { class: 'btn petit', type: 'button', onclick: function () { marquerVus([a.id]); } }, 'Vu'));
      })));
  }
  function bandeauUrgences() {
    var u = T.urgentes(st(), U.config(), servicesAffiches()), tel = numeroST();
    if (!u.length) return null;
    return h('section', { class: 'panneau travaux-urgence', role: 'alert' },
      h('b', { text: u.length > 1 ? u.length + ' demandes urgentes en cours' : 'Une demande urgente en cours' }),
      h('span', { text: tel ? ' — services techniques : ' + tel : ' — appelez les services techniques (numéro à régler dans l’administration)' }));
  }

  // ------------------------------------------------------------ Liste
  function badges(t) {
    var u = urgenceDe(t), g = libGravite(t);
    return h('div', { class: 'ag-badges' },
      h('span', { class: 'badge ' + classeEtat(t), text: T.ETAPES[t.etat] + (t.etat === 'programmee' && t.datePrevue ? ' le ' + jourFr(t.datePrevue) : '') }),
      u ? h('span', { class: 'badge ' + (u.appel && !t.traitee ? 'bad' : ''), text: u.libelle }) : null,
      g ? h('span', { class: 'badge' + (t.gravite === 'danger' ? ' bad' : ''), text: g }) : null,
      t.chambreIndisponible && opts(t.service).chambreIndisponible ? h('span', { class: 'badge warn', text: 'Chambre indisponible' }) : null,
      t.reference ? h('span', { class: 'badge', text: 'Bon ' + t.reference }) : null,
      t.commentaires.length ? h('span', { class: 'badge', text: t.commentaires.length + ' commentaire' + (t.commentaires.length > 1 ? 's' : '') }) : null);
  }
  function carte(t) {
    return h('article', { class: 'travaux-carte' + (t.traitee ? ' traitee' : '') + (t.urgente ? ' urgente' : ''), tabindex: 0, role: 'button',
      'aria-label': libType(t) + ' ' + T.libLieu(t, U.config()), onclick: function () { modaleDemande(t); }, onkeydown: function (ev) { if (ev.key === 'Enter') modaleDemande(t); } },
      h('div', { class: 'barre' }, h('b', { text: libType(t) + ' — ' + T.libLieu(t, U.config()) }), h('div', { class: 'espace' }),
        h('small', { class: 'muted', text: numero(t) + ' · ' + dateFr(t.cree) + (U.App.service === '*' ? ' · ' + U.libService(t.service) : '') })),
      h('p', { class: 'travaux-description', text: t.description || '' }),
      badges(t),
      t.traitee ? h('small', { class: 'muted', text: 'Traitée le ' + dateFr(t.traiteeLe) + ' : reste affichée ' + opts(t.service).delaiAffichage + ' jours, puis passe dans l’historique.' }) : null);
  }
  function selFiltre(cle, libelle, choix) {
    var s = h('select', { 'aria-label': libelle, onchange: function () { filtre[cle] = s.value; U.rendreContenu(); } },
      [h('option', { value: '', text: libelle + ' : tous' })].concat(choix.map(function (c) { return h('option', { value: c.code, text: c.libelle, selected: filtre[cle] === c.code }); })));
    return s;
  }
  function vueDemandes(maintenant) {
    var o = opts(), ls = T.demandes(st(), U.config(), servicesAffiches(), maintenant || Date.now(), { filtre: filtre });
    var etats = [{ code: 'ouvertes', libelle: 'En cours' }, { code: 'traitees', libelle: 'Traitées' }].concat(Object.keys(T.ETAPES).map(function (k) { return { code: k, libelle: T.ETAPES[k] }; }));
    return h('div', {}, bandeauUrgences(), bandeauAvis(),
      h('div', { class: 'barre' }, h('h1', { text: 'Demandes de travaux' }), h('div', { class: 'espace' }),
        peut('TRAVAUX') && !U.App.session.apercu ? h('button', { class: 'btn primaire', type: 'button', onclick: function () { modaleDemande(null); } }, '+ Nouvelle demande') : null),
      h('div', { class: 'actions gauche travaux-filtres' }, selFiltre('type', 'Type', o.types), selFiltre('lieu', 'Lieu', o.lieux.concat([{ code: 'chambre', libelle: 'Chambre' }, { code: 'autre', libelle: 'Autre lieu' }])),
        selFiltre('etat', 'État', etats), h('div', { class: 'espace' }),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { imprimerListe(ls); } }, 'Imprimer la liste'),
        h('button', { class: 'btn petit', type: 'button', onclick: function () { exporterListe(ls); } }, 'Exporter (tableur)')),
      ls.length ? h('div', { class: 'pile travaux-liste' }, ls.map(carte)) : h('p', { class: 'muted', text: 'Aucune demande' + (filtre.type || filtre.lieu || filtre.etat ? ' pour ces filtres.' : '.') }),
      h('small', { class: 'muted', text: 'De la plus récente à la plus ancienne. Une demande réalisée reste en cours jusqu’à la confirmation du cadre ; une demande traitée reste affichée en grisé pendant le délai réglé, puis passe dans l’historique. Aucune donnée sur un patient.' }));
  }
  function vueHistorique(maintenant) {
    var q = recherche.trim().toLowerCase();
    var ls = T.demandes(st(), U.config(), servicesAffiches(), maintenant || Date.now(), { historique: true })
      .filter(function (t) { return !q || [numero(t), libType(t), T.libLieu(t, U.config()), t.description, t.reference].join(' ').toLowerCase().indexOf(q) >= 0; });
    var champ = h('input', { type: 'search', value: recherche, placeholder: 'Rechercher (numéro, type, lieu, description, bon)', oninput: function () { recherche = champ.value; U.rendreContenu(); var c = document.querySelector('.travaux-recherche'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, class: 'travaux-recherche' });
    return h('div', {}, h('div', { class: 'barre' }, h('h1', { text: 'Historique des demandes de travaux' })), champ,
      ls.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Numéro', 'Demandée le', 'Type', 'Lieu', 'Urgence', 'État', 'Traitée le'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, ls.map(function (t) {
          return h('tr', { class: 'cliquable' + (t.traitee ? ' traitee' : ''), onclick: function () { modaleDemande(t); } }, h('td', { text: numero(t) }), h('td', { text: dateFr(t.cree) }), h('td', { text: libType(t) }),
            h('td', { text: T.libLieu(t, U.config()) }), h('td', { text: (urgenceDe(t) || {}).libelle || '' }), h('td', { text: T.ETAPES[t.etat] }), h('td', { text: t.traiteeLe ? dateFr(t.traiteeLe) : '' }));
        })))) : h('p', { class: 'muted', text: 'Aucune demande.' }));
  }

  // ------------------------------------------------------------ Demande : saisie et suivi
  function chambresConnues(service) {
    var f = (U.st() && U.st().patients) || {}, vus = {};
    Object.keys(f).forEach(function (k) { (f[k].sejours || []).forEach(function (s) { if (s.chambre && (s.service || f[k].service) === service) vus[String(s.chambre)] = 1; }); });
    return Object.keys(vus).sort(function (a, b) { return a.localeCompare(b, 'fr', { numeric: true }); });
  }
  function modaleDemande(t, init) {
    var s = U.App.session, x = t ? st().demandes[t.id] || t : Object.assign({ service: serviceParDefaut(), urgence: '', lits: 1 }, init || {});
    var nouveau = !t, traitee = !nouveau && T.TRAITEES.indexOf(x.etat) >= 0;
    var modifiable = peut('TRAVAUX') && !s.apercu && !traitee;
    var dis = modifiable ? {} : { disabled: true }, o = opts(x.service);
    var sv = h('select', Object.assign({ 'aria-label': 'Service' }, nouveau ? {} : { disabled: true }), U.services().map(function (v) { return h('option', { value: v.code, text: v.libelle, selected: v.code === x.service }); }));
    function options(l, val, vide) { return (vide ? [h('option', { value: '', text: vide })] : []).concat(l.map(function (c) { return h('option', { value: c.code, text: c.libelle, selected: c.code === val }); })); }
    var type = h('select', Object.assign({ 'aria-label': 'Type de travaux' }, dis), options(o.types, x.type, '— Choisir —'));
    var lieu = h('select', Object.assign({ 'aria-label': 'Lieu' }, dis), options(o.lieux.concat([{ code: 'chambre', libelle: 'Chambre…' }, { code: 'autre', libelle: 'Autre lieu' }]), x.lieu, '— Choisir —'));
    var idListe = 'chambres-' + C.hex(C.aleatoire(3));
    var chambre = h('input', Object.assign({ type: 'text', maxlength: 20, value: x.chambre || '', list: idListe, placeholder: 'n°', 'aria-label': 'Numéro de chambre', class: 'champ-court' }, dis));
    var datalist = h('datalist', { id: idListe }, chambresConnues(x.service).map(function (c) { return h('option', { value: c }); }));
    var precision = h('input', Object.assign({ type: 'text', maxlength: 120, value: x.precisionLieu || '', placeholder: 'Précision (ex. lavabo, fenêtre côté jardin)' }, dis));
    var gravite = h('select', Object.assign({ 'aria-label': 'Gravité' }, dis), options(o.gravites, x.gravite, '— Choisir —'));
    var urgence = h('select', Object.assign({ 'aria-label': 'Urgence' }, dis), options(o.urgences, x.urgence, '— Choisir —'));
    var description = h('textarea', Object.assign({ rows: 4, maxlength: 2000, placeholder: 'Ce qui ne va pas, depuis quand, ce qui a déjà été fait. Aucune donnée sur un patient.' }, dis), x.description || '');
    var cbIndispo = h('input', Object.assign({ type: 'checkbox', checked: !!x.chambreIndisponible }, dis));
    var lits = h('input', Object.assign({ type: 'number', min: 1, max: 6, value: x.lits || 1, class: 'champ-court', 'aria-label': 'Lits indisponibles' }, dis));
    var zoneChambre = h('div', { class: 'actions gauche' }, h('label', { class: 'en-ligne' }, 'Chambre n°', chambre), datalist,
      o.chambreIndisponible ? h('label', { class: 'case' }, cbIndispo, h('span', { text: 'Chambre indisponible pendant les travaux' })) : null,
      o.chambreIndisponible ? h('label', { class: 'en-ligne' }, 'lits', lits) : null);
    var appel = h('div', { class: 'travaux-urgence', role: 'alert' });
    function maj() {
      zoneChambre.hidden = lieu.value !== 'chambre';
      var u = o.urgences.filter(function (y) { return y.code === urgence.value; })[0];
      U.vider(appel); appel.hidden = !(u && u.appel && !traitee);
      if (!appel.hidden) appel.appendChild(h('span', { text: 'Urgence immédiate : appelez les services techniques' + (numeroST() ? ' au ' + numeroST() : '') + ', puis enregistrez la demande pour en garder la trace.' }));
    }
    lieu.addEventListener('change', maj); urgence.addEventListener('change', maj);
    sv.addEventListener('change', function () { modaleFermer(); setTimeout(function () { modaleDemande(null, { service: sv.value }); }, 0); });
    maj();

    var formulaire = h('div', { class: 'pile' },
      h('div', { class: 'grille-2' }, h('label', {}, 'Service', sv), h('label', {}, 'Type de travaux', type)),
      h('div', { class: 'grille-2' }, h('label', {}, 'Lieu', lieu), h('label', {}, 'Précision', precision)), zoneChambre,
      h('div', { class: 'grille-2' }, h('label', {}, 'Gravité', gravite), h('label', {}, 'Urgence', urgence)), appel,
      h('label', {}, 'Description', description));

    var suivi = nouveau ? null : zoneSuivi(x);
    var dlg;
    function modaleFermer() { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); }
    U.modale(nouveau ? 'Nouvelle demande de travaux' : numero(x) + ' — ' + libType(x), h('div', { class: 'pile' },
      nouveau ? null : h('small', { class: 'muted', text: 'Demandée le ' + dateFr(x.cree) + ' par ' + s.nomAuteur(x.par) + ' — ' + U.libService(x.service) }),
      nouveau ? null : badges(x), formulaire, suivi), [
      { texte: modifiable ? 'Annuler' : 'Fermer' },
      nouveau ? null : { texte: 'Bon de travaux…', action: function () { imprimerBon(x); return false; } },
      modifiable ? { texte: nouveau ? 'Enregistrer la demande' : 'Enregistrer les modifications', classe: 'primaire', action: async function () {
        var d = { id: x.id || 'TR' + C.hex(C.aleatoire(6)), service: sv.value, type: type.value, lieu: lieu.value, chambre: lieu.value === 'chambre' ? chambre.value.trim() : '',
          precisionLieu: precision.value.trim(), gravite: gravite.value, urgence: urgence.value, description: description.value.trim(),
          chambreIndisponible: lieu.value === 'chambre' && o.chambreIndisponible && cbIndispo.checked, lits: Math.max(1, Math.min(6, Math.round(+lits.value || 1))) };
        if (nouveau) d.nom = moi().nom;
        else Object.keys(d).forEach(function (k) { if (k !== 'id' && k !== 'service' && JSON.stringify(d[k]) === JSON.stringify(x[k] === undefined ? (typeof d[k] === 'boolean' ? false : '') : x[k])) delete d[k]; });
        if (!nouveau && Object.keys(d).length <= 2) return true;
        await s.enregistrer('TRAVAUX', d);
        var u = o.urgences.filter(function (y) { return y.code === d.urgence; })[0];
        U.toast(nouveau ? 'Demande enregistrée.' : 'Demande modifiée.');
        if (nouveau && u && u.appel) setTimeout(function () { alert('Urgence immédiate : appelez maintenant les services techniques' + (numeroST() ? ' au ' + numeroST() : '') + '.'); }, 50);
      } } : null].filter(Boolean), { large: true });
    dlg = document.querySelector('dialog[open]');
    return dlg;
  }

  /** Étapes, actions selon l'état et les droits, commentaires. */
  function zoneSuivi(x) {
    var s = U.App.session, zone = h('div', { class: 'pile' }), apercu = s.apercu;
    var suivre = peut('TRAVAUX_ETAPE') && !apercu, confirmer = peut('TRAVAUX_CONFIRMATION') && !apercu, auteur = x.par === moi().id && !apercu;
    async function etape(d, msg) { try { await s.enregistrer('TRAVAUX_ETAPE', Object.assign({ demande: x.id, service: x.service }, d)); U.toast(msg); fermerEtRouvrir(); } catch (e) { alert(e.message); } }
    async function confirmation(d, msg) { try { await s.enregistrer('TRAVAUX_CONFIRMATION', Object.assign({ demande: x.id, service: x.service }, d)); U.toast(msg); fermerEtRouvrir(); } catch (e) { alert(e.message); } }
    function fermerEtRouvrir() { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(function () { modaleDemande(st().demandes[x.id]); }, 0); }
    function peutDepuis(et) { return T.DEPUIS[et].indexOf(x.etat) >= 0; }
    var actions = [];
    if (suivre && peutDepuis('transmise')) actions.push(['Transmise aux services techniques…', function () { var r = prompt('Référence du bon des services techniques (facultative) :', x.reference || ''); if (r !== null) etape({ etape: 'transmise', reference: r.trim() }, 'Demande transmise.'); }]);
    if (suivre && peutDepuis('programmee')) actions.push(['Intervention programmée…', function () { modaleDate(x, function (j) { etape({ etape: 'programmee', date: j }, 'Intervention programmée le ' + jourFr(j) + '.'); }); }]);
    if (suivre && peutDepuis('realisee')) actions.push(['Réalisée', function () { etape({ etape: 'realisee' }, 'Demande réalisée : le cadre confirmera.'); }, 'primaire']);
    if (confirmer && x.etat === 'realisee') actions.push(['Confirmer la réalisation', function () { confirmation({}, 'Réalisation confirmée.'); }, 'primaire']);
    if (confirmer && ['realisee', 'confirmee', 'refusee'].indexOf(x.etat) >= 0) actions.push(['Rouvrir…', function () { var m = prompt('Pourquoi rouvrir la demande (intervention insuffisante, problème revenu…) ?'); if (m && m.trim()) confirmation({ rouvrir: true, motif: m.trim() }, 'Demande rouverte.'); }]);
    if (suivre && peutDepuis('refusee')) actions.push(['Refusée par les services techniques…', function () { var m = prompt('Motif du refus :'); if (m && m.trim()) etape({ etape: 'refusee', motif: m.trim() }, 'Refus enregistré.'); }]);
    if (suivre && peutDepuis('doublon')) actions.push(['Doublon de…', function () { modaleDoublon(x, function (id) { etape({ etape: 'doublon', doublonDe: id }, 'Demande rattachée à la première.'); }); }]);
    if ((suivre || auteur) && peutDepuis('annulee')) actions.push(['Annuler la demande…', function () { var m = prompt('Motif de l’annulation :'); if (m && m.trim()) etape({ etape: 'annulee', motif: m.trim() }, 'Demande annulée.'); }, 'danger']);
    zone.appendChild(h('b', { text: 'Suivi' }));
    if (x.doublonDe && st().demandes[x.doublonDe]) zone.appendChild(h('p', {}, 'Doublon de ', h('button', { class: 'btn lien', type: 'button', onclick: function () { fermerEtOuvrir(st().demandes[x.doublonDe]); } }, numero(st().demandes[x.doublonDe]))));
    zone.appendChild(h('ul', { class: 'liste-simple' }, [h('li', {}, h('small', { class: 'muted', text: dateFr(x.cree) + ' — ' + s.nomAuteur(x.par) + ' : ' }), 'demande enregistrée')].concat(x.etapes.map(function (e) {
      return h('li', {}, h('small', { class: 'muted', text: dateFr(e.le) + ' — ' + s.nomAuteur(e.par) + ' : ' }), T.ETAPES[e.etape] + (e.reference ? ' (bon ' + e.reference + ')' : '') + (e.date ? ' le ' + jourFr(e.date) : '') + (e.motif ? ' — ' + e.motif : ''));
    }))));
    if (actions.length) zone.appendChild(h('div', { class: 'actions gauche' }, actions.map(function (a) { return h('button', { class: 'btn petit' + (a[2] ? ' ' + a[2] : ''), type: 'button', onclick: a[1] }, a[0]); })));
    else if (!T.ouverte(x)) zone.appendChild(h('small', { class: 'muted', text: 'Demande traitée.' }));
    else if (x.etat === 'realisee') zone.appendChild(h('small', { class: 'muted', text: 'Réalisée : en attente de la confirmation du cadre.' }));
    // Commentaires (tout agent qui peut faire une demande)
    zone.appendChild(h('b', { text: 'Commentaires' }));
    zone.appendChild(x.commentaires.length ? h('ul', { class: 'liste-simple' }, x.commentaires.map(function (c) { return h('li', {}, h('small', { class: 'muted', text: dateFr(c.le) + ' — ' + s.nomAuteur(c.par) + ' : ' }), c.texte); })) : h('small', { class: 'muted', text: 'Aucun commentaire.' }));
    if (peut('TRAVAUX_COMMENTAIRE') && !apercu) {
      var com = h('input', { type: 'text', maxlength: 1000, placeholder: 'Ajouter un commentaire (sans donnée sur un patient)' });
      zone.appendChild(h('div', { class: 'barre' }, com, h('button', { class: 'btn petit', type: 'button', onclick: async function () {
        if (!com.value.trim()) return;
        try { await s.enregistrer('TRAVAUX_COMMENTAIRE', { demande: x.id, id: 'K' + C.hex(C.aleatoire(4)), texte: com.value.trim(), service: x.service }); U.toast('Commentaire ajouté.'); fermerEtRouvrir(); } catch (e) { alert(e.message); }
      } }, 'Ajouter')));
    }
    return zone;
  }
  function fermerEtOuvrir(t) { var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); setTimeout(function () { modaleDemande(t); }, 0); }
  function modaleDate(x, puis) {
    var date = h('input', { type: 'date', value: x.datePrevue || T.jourISO(Date.now() + 864e5) });
    setTimeout(function () {
      U.modale('Intervention programmée', h('label', {}, 'Date de l’intervention', date), [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () { if (!date.value) throw new Error('Indiquez la date.'); puis(date.value); } }]);
    }, 0);
  }
  function modaleDoublon(x, puis) {
    var autres = T.demandes(st(), U.config(), [x.service], Date.now(), { historique: true }).filter(function (y) { return y.id !== x.id; });
    var sel = h('select', { 'aria-label': 'Demande d’origine' }, [h('option', { value: '', text: '— Choisir la première demande —' })].concat(autres.map(function (y) { return h('option', { value: y.id, text: numero(y) + ' — ' + libType(y) + ' — ' + T.libLieu(y, U.config()) + ' (' + dateFr(y.cree) + ')' }); })));
    setTimeout(function () {
      U.modale('Doublon de…', h('div', { class: 'pile' }, sel, h('small', { class: 'muted', text: 'La demande est rattachée à la première, qui garde le suivi.' })), [{ texte: 'Annuler' }, { texte: 'Rattacher', classe: 'primaire', action: function () { if (!sel.value) throw new Error('Choisissez la demande.'); puis(sel.value); } }]);
    }, 0);
  }

  // ------------------------------------------------------------ Bon de travaux, liste imprimée, export
  function documentTravaux(titre, sousTitre, corps) {
    var d = new Date();
    return h('article', { class: 'doc-suivi doc-travaux' },
      h('header', {}, h('div', {}, h('h1', { text: titre }), h('p', { text: sousTitre + (U.etablissement() ? ' — ' + U.etablissement() : '') })),
        h('p', { class: 'droite', text: 'Imprimé le ' + d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) })),
      corps, h('footer', {}, h('span', { text: 'Aucune donnée concernant un patient.' }), h('span', { text: 'Tessera Santé — Demandes de travaux' })));
  }
  function imprimerBon(x) {
    var o = opts(x.service), u = urgenceDe(x), ligne = function (l, v) { return v ? h('tr', {}, h('th', { text: l }), h('td', { text: v })) : null; };
    U.imprimer(documentTravaux('Bon de demande de travaux ' + numero(x), U.libService(x.service), h('div', { class: 'pile' },
      h('table', { class: 'travaux-bon' }, h('tbody', {},
        ligne('Demandée le', dateFr(x.cree)), o.auteurSurBon ? ligne('Par', x.nom || U.App.session.nomAuteur(x.par)) : null,
        ligne('Type de travaux', libType(x)), ligne('Lieu', T.libLieu(x, U.config())), ligne('Gravité', libGravite(x)), ligne('Urgence', u ? u.libelle : ''),
        x.chambreIndisponible && o.chambreIndisponible ? ligne('Chambre', 'indisponible pendant les travaux') : null,
        ligne('État', T.ETAPES[x.etat] + (x.datePrevue && x.etat === 'programmee' ? ' le ' + jourFr(x.datePrevue) : '')), ligne('Bon des services techniques', x.reference || ''))),
      h('h2', { text: 'Description' }), h('p', { class: 'travaux-description', text: x.description || '' }),
      x.commentaires.length ? h('div', {}, h('h2', { text: 'Commentaires' }), h('ul', {}, x.commentaires.map(function (c) { return h('li', { text: dateFr(c.le) + ' : ' + c.texte }); }))) : null,
      h('p', { class: 'muted', text: 'Contact : ' + U.libService(x.service) + '.' }))));
  }
  function imprimerListe(ls) {
    U.imprimer(documentTravaux('Demandes de travaux', servicesAffiches().map(U.libService).join(', '), h('table', {}, h('thead', {}, h('tr', {}, ['Numéro', 'Demandée le', 'Type', 'Lieu', 'Gravité', 'Urgence', 'État', 'Description'].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', {}, ls.map(function (t) { return h('tr', {}, [numero(t), dateFr(t.cree), libType(t), T.libLieu(t, U.config()), libGravite(t), (urgenceDe(t) || {}).libelle || '', T.ETAPES[t.etat] + (t.datePrevue && t.etat === 'programmee' ? ' le ' + jourFr(t.datePrevue) : ''), t.description || ''].map(function (v) { return h('td', { text: v }); })); })))));
  }
  function exporterListe(ls) {
    var lignes = [['Numéro', 'Service', 'Demandée le', 'Type', 'Lieu', 'Gravité', 'Urgence', 'État', 'Intervention prévue', 'Bon des services techniques', 'Description']].concat(ls.map(function (t) {
      return [numero(t), U.libService(t.service), dateFr(t.cree), libType(t), T.libLieu(t, U.config()), libGravite(t), (urgenceDe(t) || {}).libelle || '', T.ETAPES[t.etat], jourFr(t.datePrevue), t.reference || '', t.description || ''];
    }));
    var csv = '﻿' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    U.exporter('travaux', 'demandes_travaux_' + T.jourISO(Date.now()) + '.csv', csv, 'text/csv;charset=utf-8', { service: U.App.service !== '*' ? U.App.service : null });
  }

  // ------------------------------------------------------------ Administration (administrateur ; cadre pour ses services)
  var niveau = null;
  function niveaux() {
    var s = U.App.session, admin = s.roles().indexOf('ADMIN') >= 0, c = s.compteEffectif();
    return (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (v) { return admin || (c.services || []).indexOf(v.code) >= 0; }).map(function (v) { return { code: v.code, libelle: 'Service ' + v.libelle }; }));
  }
  function panneauReglages() {
    var ns = niveaux();
    if (!ns.length) return h('section', { class: 'panneau' }, h('p', { class: 'muted', text: 'Aucun service à régler.' }));
    if (!niveau || !ns.some(function (n) { return n.code === niveau; })) niveau = ns[0].code;
    var tout = JSON.parse(JSON.stringify(U.config().travaux || {})), propre = tout[niveau] || {}, etab = niveau === '*';
    var effectif = T.options(U.config(), etab ? null : niveau), herite = etab ? null : T.options({ travaux: { '*': tout['*'] || {} } }, null);
    var sel = h('select', { 'aria-label': 'Niveau des réglages', onchange: function () { niveau = sel.value; U.rendreContenu(); } }, ns.map(function (n) { return h('option', { value: n.code, text: n.libelle, selected: n.code === niveau }); }));
    var lecteurs = [];
    function editeurListe(cle, titre, exemple, avecAppel) {
      var suit = !etab && propre[cle] === undefined, l = JSON.parse(JSON.stringify(effectif[cle])), zone = h('div', { class: 'pile' });
      var cb = etab ? null : h('input', { type: 'checkbox', checked: suit, onchange: function () { suit = cb.checked; dessiner(); } });
      function code(libelle) { return (String(libelle).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'x') + '-' + Date.now().toString(36).slice(-3); }
      function dessiner() {
        U.vider(zone);
        if (suit) { zone.appendChild(h('small', { class: 'muted', text: herite[cle].map(function (c) { return c.libelle + (c.appel ? ' (appel immédiat)' : ''); }).join(', ') })); return; }
        l.forEach(function (c, i) {
          var inp = h('input', { type: 'text', maxlength: 80, value: c.libelle, 'aria-label': 'Libellé', oninput: function () { c.libelle = inp.value; } });
          var ap = avecAppel ? h('input', { type: 'checkbox', checked: !!c.appel, onchange: function () { c.appel = ap.checked; } }) : null;
          zone.appendChild(h('div', { class: 'actions gauche' }, inp, ap ? h('label', { class: 'case' }, ap, h('span', { text: 'Appel immédiat aux services techniques' })) : null,
            i > 0 ? h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Monter', onclick: function () { l.splice(i - 1, 0, l.splice(i, 1)[0]); dessiner(); } }, '↑') : null,
            l.length > 1 ? h('button', { class: 'btn petit danger', type: 'button', onclick: function () { l.splice(i, 1); dessiner(); } }, 'Retirer') : null));
        });
        var nv = h('input', { type: 'text', maxlength: 80, placeholder: exemple });
        zone.appendChild(h('div', { class: 'actions gauche' }, nv, h('button', { class: 'btn petit', type: 'button', onclick: function () { if (nv.value.trim()) { l.push({ code: code(nv.value), libelle: nv.value.trim() }); dessiner(); } } }, 'Ajouter')));
      }
      dessiner();
      lecteurs.push(function (v) { if (!suit) v[cle] = l.filter(function (c) { return String(c.libelle || '').trim(); }).map(function (c) { var x = { code: c.code, libelle: c.libelle.trim() }; if (c.appel) x.appel = true; return x; }); });
      return h('div', { class: 'pile ag-section' }, h('b', { text: titre }), cb ? h('label', { class: 'case' }, cb, h('span', { text: 'Comme l’établissement' })) : null, zone);
    }
    function choix(cle, titre, valeurs) {
      var suit = !etab && propre[cle] === undefined, s0 = h('select', { 'aria-label': titre }, (etab ? [] : [h('option', { value: '', text: 'Comme l’établissement', selected: suit })])
        .concat(valeurs.map(function (v) { return h('option', { value: String(v[0]), text: v[1], selected: !suit && String(effectif[cle]) === String(v[0]) }); })));
      lecteurs.push(function (v) { if (s0.value !== '') v[cle] = s0.value === 'true' ? true : s0.value === 'false' ? false : +s0.value; });
      return h('label', {}, titre, s0);
    }
    var tel = etab ? h('input', { type: 'tel', maxlength: 40, value: (tout['*'] || {}).telephone || '', placeholder: 'ex. 1234 ou 02 00 00 00 00' }) : null;
    if (tel) lecteurs.push(function (v) { if (tel.value.trim()) v.telephone = tel.value.trim(); });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Demandes de travaux' }),
      h('p', { class: 'muted', text: 'Réglages de l’établissement, que chaque service peut remplacer : l’administrateur règle l’établissement et les services, le cadre règle ses services.' }),
      h('label', { class: 'en-ligne' }, 'Réglages pour', sel),
      tel ? h('label', {}, 'Numéro des services techniques (urgence immédiate), pour tout l’établissement', tel) : h('p', { class: 'muted', text: 'Numéro des services techniques : ' + (numeroST() || 'non réglé') + ' (réglé par l’administrateur pour l’établissement).' }),
      editeurListe('types', 'Types de travaux', 'ex. Ascenseur'), editeurListe('lieux', 'Lieux du service (en plus de « Chambre » et « Autre lieu »)', 'ex. Salle d’activités'),
      editeurListe('gravites', 'Gravité', 'ex. Risque de chute'), editeurListe('urgences', 'Urgence', 'ex. Dans la semaine', true),
      h('div', { class: 'grille-3' },
        choix('delaiAffichage', 'Demandes traitées affichées pendant', [[7, '7 jours'], [15, '15 jours'], [30, '30 jours'], [60, '60 jours'], [90, '90 jours']]),
        choix('chambreIndisponible', 'Case « chambre indisponible pendant les travaux »', [[false, 'Non proposée'], [true, 'Proposée (retirée des places disponibles)']]),
        choix('auteurSurBon', 'Nom de l’auteur sur le bon imprimé', [[false, 'Non'], [true, 'Oui']])),
      h('div', { class: 'actions' }, h('button', { class: 'btn primaire', type: 'button', onclick: async function () {
        try {
          var v = {}; lecteurs.forEach(function (f) { f(v); });
          if (Object.keys(v).length) tout[niveau] = v; else delete tout[niveau];
          await U.enregistrerConfig([['travaux', tout]]); U.toast('Réglages enregistrés.');
        } catch (e) { alert(e.message); }
      } }, 'Enregistrer')));
  }

  // ------------------------------------------------------------ Journal
  var LIB = { TRAVAUX: 'Travaux : demande', TRAVAUX_ETAPE: 'Travaux : suivi', TRAVAUX_CONFIRMATION: 'Travaux : confirmation', TRAVAUX_COMMENTAIRE: 'Travaux : commentaire' };
  function resume(e) {
    var d = e.data || {}, t = st().demandes[d.id || d.demande], nom = t ? numero(t) + ' (' + libType(t) + ' — ' + T.libLieu(t, U.config()) + ')' : 'demande';
    switch (e.type) {
      case 'TRAVAUX': return (t && t.evts[0] === e.id ? 'Nouvelle demande ' : 'Demande modifiée ') + nom + (d.description ? ' : ' + d.description : '');
      case 'TRAVAUX_ETAPE': return nom + ' : ' + T.ETAPES[d.etape] + (d.reference ? ' (bon ' + d.reference + ')' : '') + (d.date ? ' le ' + jourFr(d.date) : '') + (d.motif ? ' — ' + d.motif : '');
      case 'TRAVAUX_CONFIRMATION': return nom + (d.rouvrir ? ' : rouverte — ' + (d.motif || '') : ' : réalisation confirmée');
      case 'TRAVAUX_COMMENTAIRE': return 'Commentaire sur ' + nom + ' : ' + (d.texte || '');
    }
    return e.type;
  }

  SIC.modules.completerInterface('travaux', {
    vues: { demandes: vueDemandes, historique: vueHistorique },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La demande revient à son état précédent.'; } },
    admin: { onglets: function () { return [['travaux', 'Demandes de travaux', [panneauReglages()]]]; }, cadre: function () { return [panneauReglages()]; } },
    // Pastille : demandes urgentes en cours et informations non vues
    pastille: function () { try { return T.urgentes(st(), U.config(), U.services().map(function (x) { return x.code; })).length + mesAvis().length; } catch (e) { return 0; } }
  });
  U.travaux = { modaleDemande: modaleDemande };
})();
