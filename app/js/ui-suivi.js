// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Suivi médical — interface (maquettes validées par le porteur le 8 novembre 2026). Logique : module-suivi.js.
 * Onglets : Présences médicales (par service ou par médecin), Entretiens et contrats de soins (saisie en une fois des
 * patients vus), Patients par médecin (1re et 2e ligne, non attribués, ajout depuis une case), Médecins (liste commune).
 * Impression : mise en page dédiée (A4 paysage, en-tête, mention de confidentialité, noms en gras, dates dépassées
 * soulignées avec ⚠ en gras).
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, S = SIC.suivi, MED = SIC.medecins, C = SIC.crypto;
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var vue = { lundi: null, lieu: null, affichage: 'service', medecin: null, weekend: false, enRetard: true, filtreMedecin: '', serviceTableau: '' };

  function st() { return (U.App.session && U.App.session.etatModule('suivi')) || { presences: {}, suivis: {} }; }
  function cfg() { return U.config(); }
  function opts() { return S.options(cfg()); }
  function peut(t) { return U.App.session.peut(t) && !U.App.session.apercu; }
  function fiches() { return (U.st() && U.st().patients) || {}; }
  function lundiDe(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return S.jourISO(d.getTime()); }
  function jourFr(iso) { var d = new Date(S.depuisISO(iso)); return JOURS[d.getDay()] + ' ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function dateFr(iso) { return iso ? iso.split('-').reverse().slice(0, 2).join('/') : ''; }
  function servicesAffiches() { return U.App.service === '*' ? U.services().map(function (x) { return x.code; }) : [U.App.service]; }
  function lieux() { return U.services().map(function (s) { return { code: s.code, libelle: s.libelle }; }).concat(opts().lieux.map(function (l) { return { code: l.code, libelle: l.libelle + ' (lieu de présence)' }; })); }
  function libLieu(c) { var l = opts().lieux.filter(function (x) { return x.code === c; })[0]; return l ? l.libelle : U.libService(c); }
  function modeDe(p) { return p && p.modes && p.modes.length ? p.modes[p.modes.length - 1].mode : ''; }
  function identite(p) { return S.identite(p, Date.now()); }
  /** Nom en gras suivi de « (ch. 12, J24) » : forme imposée par le porteur partout dans le module. */
  function nomPatient(p) {
    var t = identite(p), i = t.lastIndexOf(' (');
    return h('span', {}, h('b', { text: i > 0 ? t.slice(0, i) : t }), i > 0 ? h('span', { text: t.slice(i) }) : null);
  }
  /** Nom actuel d'un médecin (identifiant, nom actuel ou ancien : les anciennes saisies suivent). */
  function nomMed(n, id) { return n || id ? MED.resoudre(cfg(), n, id) : ''; }
  function idMed(n) { var m = MED.parNom(cfg(), n); return m ? m.id : null; }
  function serviceCourant() { return U.App.service !== '*' ? U.App.service : (servicesAffiches()[0] || ''); }
  function bouton(texte, f, classe) { return h('button', { class: 'btn' + (classe ? ' ' + classe : ''), type: 'button', onclick: f }, texte); }

  // ------------------------------------------------------------ Impression (mise en page dédiée)
  function documentImprime(titre, sousTitre, corps, legende) {
    var s = U.App.session, d = new Date();
    return h('article', { class: 'doc-suivi' },
      h('header', {}, h('div', {}, h('h1', { text: titre }), h('p', { text: sousTitre + (U.etablissement() ? ' — ' + U.etablissement() : '') })),
        h('p', { class: 'droite', text: 'Imprimé le ' + d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '\npar ' + s.compteEffectif().nom })),
      h('p', { class: 'confidentiel', text: 'DOCUMENT CONFIDENTIEL — données personnelles de santé. Ne pas laisser sans surveillance ; détruire après usage.' }),
      corps,
      h('footer', {}, h('span', {}, legende || ''), h('span', { text: 'Tessera Santé — Suivi médical' })));
  }
  /** Date imprimée : soulignée, avec ⚠ en gras, quand le délai est dépassé. */
  function dateImprimee(libelle, x) {
    if (!x.date) return h('span', {}, libelle + ' ', x.retard ? h('u', { text: 'à faire' }) : h('span', { text: '—' }), x.retard ? h('b', { text: ' ⚠' }) : null);
    return h('span', {}, libelle + ' ', x.retard ? h('u', { text: dateFr(x.date) }) : h('span', { text: dateFr(x.date) }), x.retard ? h('b', { text: ' ⚠' }) : null);
  }
  function legendeRetard() { return h('span', {}, h('b', { text: '⚠' }), ' date ', h('u', { text: 'soulignée' }), ' : délai dépassé (délais selon la durée d’hospitalisation).'); }

  // ------------------------------------------------------------ Présences médicales
  var ETATS = { present: ['Présent', 'ok'], ponctuel: ['Ponctuel', 'done'], absent: ['Absent', 'bad'], garde: ['Garde', 'late'] };
  function joursAffiches(g) { return vue.weekend ? g.jours : g.jours.slice(0, 5); }
  function vuePresences(maintenant) {
    if (!vue.lundi) vue.lundi = lundiDe(maintenant);
    var ls = lieux();
    if (!vue.lieu || !ls.some(function (l) { return l.code === vue.lieu; })) vue.lieu = serviceCourant() || (ls[0] || {}).code;
    var meds = MED.proposes(cfg(), {});
    if (!vue.medecin || !meds.some(function (m) { return m.nom === vue.medecin; })) vue.medecin = (meds[0] || {}).nom || null;
    var selAff = h('select', { class: 'select-barre', 'aria-label': 'Affichage', onchange: function () { vue.affichage = selAff.value; U.rendreContenu(); } },
      [['service', 'Par service'], ['medecin', 'Par médecin']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: vue.affichage === x[0] }); }));
    var selLieu = vue.affichage === 'service' ? h('select', { class: 'select-barre', 'aria-label': 'Service ou lieu', onchange: function () { vue.lieu = selLieu.value; U.rendreContenu(); } }, ls.map(function (l) { return h('option', { value: l.code, text: l.libelle, selected: l.code === vue.lieu }); }))
      : h('select', { class: 'select-barre', 'aria-label': 'Médecin', onchange: function () { vue.medecin = selLieu.value; U.rendreContenu(); } }, meds.map(function (m) { return h('option', { value: m.nom, text: m.nom, selected: m.nom === vue.medecin }); }));
    var we = h('input', { type: 'checkbox', checked: vue.weekend, onchange: function () { vue.weekend = we.checked; U.rendreContenu(); } });
    var nav = function (n) { vue.lundi = S.jourISO(S.plusJours(S.depuisISO(vue.lundi), n)); U.rendreContenu(); };
    var corps = vue.affichage === 'service' ? grilleService(maintenant) : grilleMedecin(maintenant);
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Présences médicales — ' + (vue.affichage === 'service' ? libLieu(vue.lieu) : (vue.medecin || 'aucun médecin')) }), h('div', { class: 'espace' }),
        selAff, selLieu, h('label', { class: 'case' }, we, h('span', { text: 'Week-end' })),
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Semaine précédente', onclick: function () { nav(-7); } }, '◀'),
        bouton('Cette semaine', function () { vue.lundi = lundiDe(Date.now()); U.rendreContenu(); }, 'petit'),
        h('button', { class: 'btn petit', type: 'button', 'aria-label': 'Semaine suivante', onclick: function () { nav(7); } }, '▶'),
        bouton('Imprimer', function () { imprimerPresences(); }),
        peut('PRESENCE') ? bouton('+ Présence, absence, garde', function () { modalePresence(null, { lieu: vue.lieu, medecin: vue.affichage === 'medecin' ? vue.medecin : '' }); }, 'primaire') : null),
      corps);
  }
  function grilleService(maintenant) {
    var g = S.grilleLieu(st(), cfg(), vue.lieu, vue.lundi), js = joursAffiches(g), n = js.length;
    var auj = S.jourISO(maintenant), alertes = g.couverture.filter(function (c) { return c.alerte && js.indexOf(c.jour) >= 0; });
    var presentsAuj = g.lignes.filter(function (l) { return l.cases.some(function (c) { return c.jour === auj && /present|ponctuel|garde/.test(c.etat); }); }).map(function (l) { return l.medecin.nom; });
    var tete1 = h('tr', {}, h('th', { rowspan: 2, text: 'Médecin' }), js.map(function (j) { return h('th', { colspan: 2, class: j === auj ? 'aujourdhui' : '', text: jourFr(j) }); }));
    var tete2 = h('tr', {}, js.map(function () { return [h('th', { class: 'sous', text: 'Matin' }), h('th', { class: 'sous', text: 'Après-midi' })]; }));
    var lignes = g.lignes.map(function (l) {
      return h('tr', {}, h('th', { class: 'medecin' }, h('b', { text: l.medecin.nom }), h('br'), h('small', { class: 'muted', text: MED.FONCTIONS[l.medecin.fonction] + (l.medecin.statut !== 'titulaire' ? ' — ' + MED.STATUTS[l.medecin.statut].toLowerCase() : '') })),
        l.cases.filter(function (c) { return js.indexOf(c.jour) >= 0; }).map(function (c) {
          var e = ETATS[c.etat];
          return h('td', { class: 'case-presence' + (c.jour === auj ? ' aujourdhui' : ''), onclick: peut('PRESENCE') ? function () { modaleCase(l.medecin.nom, c); } : null, title: peut('PRESENCE') ? 'Voir ou modifier' : '' },
            e ? h('span', { class: 'badge ' + e[1], text: c.etat === 'absent' && c.remplacant ? 'Remplacé' : e[0] }) : null,
            c.remplacant ? h('div', {}, h('small', { text: 'par ' + c.remplacant })) : null,
            c.precision ? h('div', {}, h('small', { class: 'muted', text: c.precision })) : null,
            // Jour modifié ou retiré dans une série (0.20.0) : astérisque, détail au survol
            c.modifie ? h('span', { class: 'jour-modifie', title: libModifs(c.modifications), 'aria-label': 'Jour modifié dans une série', text: '*' }) : null);
        }));
    });
    var gardes = h('tr', { class: 'ligne-gardes' }, h('th', { text: 'Gardes et astreintes' }), g.gardes.filter(function (x) { return js.indexOf(x.jour) >= 0; }).map(function (x) {
      return h('td', { colspan: 2 }, x.items.map(function (it) { return h('div', {}, h('small', { text: it.libelle + ' : ' + it.medecin + (it.lieu ? ' (' + libLieu(it.lieu) + ')' : '') })); }));
    }));
    var couv = h('tr', { class: 'ligne-couverture' }, h('th', { text: 'Psychiatres présents' }), g.couverture.filter(function (c) { return js.indexOf(c.jour) >= 0; }).map(function (c) { return h('td', { class: c.alerte ? 'alerte-couverture' : '', text: String(c.psychiatres) }); }));
    var soma = h('tr', { class: 'ligne-couverture' }, h('th', { text: 'Somaticien présent' }), g.couverture.filter(function (c) { return js.indexOf(c.jour) >= 0; }).map(function (c) { return h('td', { text: c.somaticien ? 'oui' : '—' }); }));
    return h('div', { class: 'pile' },
      alertes.length ? h('div', { class: 'alerte' }, '⚠ Aucun psychiatre présent : ' + alertes.map(function (c) { return jourFr(c.jour) + ' ' + S.MOMENTS[c.moment].toLowerCase(); }).join(', ')) : null,
      presentsAuj.length && g.jours.indexOf(auj) >= 0 ? h('div', { class: 'info' }, 'Aujourd’hui : ' + presentsAuj.join(', ')) : null,
      g.lignes.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grille-presences' }, h('thead', {}, tete1, tete2), h('tbody', {}, lignes, gardes, couv, soma)))
        : h('div', { class: 'panneau vide', text: 'Aucun médecin pour ce service cette semaine. Ajoutez des présences, ou affectez des médecins au service dans l’onglet Médecins.' }),
      h('p', { class: 'muted' }, h('small', { text: 'Présent : présence habituelle (répétée) ; Ponctuel : pour une date ; Absent ou Remplacé : congé, formation… ; Garde : garde rattachée à ce lieu (ex. garde de jour aux urgences). Le somaticien est compté à part ; l’alerte porte sur les psychiatres, les jours ouvrés. Cliquez une case pour voir ou modifier.' })));
  }
  function grilleMedecin(maintenant) {
    if (!vue.medecin) return h('div', { class: 'panneau vide', text: 'Aucun médecin dans la liste commune (onglet Médecins).' });
    var sm = S.semaineMedecin(st(), cfg(), vue.medecin, vue.lundi), js = vue.weekend ? sm.jours : sm.jours.slice(0, 5), auj = S.jourISO(maintenant);
    var idx = function (j) { return sm.jours.indexOf(j); };
    var txt = function (cas) {
      var mods = cas.moments.filter(function (m) { return m.s.modifie; });
      var base = txt0(cas);
      return mods.length ? h('span', {}, base, h('span', { class: 'jour-modifie', title: mods.map(function (m) { return libModifs(m.s.modifications); }).join('\n'), 'aria-label': 'Jour modifié dans une série', text: '*' })) : base;
    };
    var txt0 = function (cas) {
      var ab = cas.moments.filter(function (m) { return m.s.etat === 'absent'; }), pr = cas.moments.filter(function (m) { return /present|ponctuel|garde/.test(m.s.etat); });
      if (ab.length) return h('span', { class: 'badge bad', text: 'Absent' + (ab.length === 1 ? ' ' + S.MOMENTS[ab[0].moment].toLowerCase() : '') });
      if (!pr.length) return h('span', { class: 'muted', text: '—' });
      return h('span', { class: 'badge ok', text: pr.length === 2 ? 'Matin et après-midi' : S.MOMENTS[pr[0].moment] });
    };
    return h('div', { class: 'pile' },
      h('div', { class: 'table-wrap' }, h('table', { class: 'grille-presences' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Service ou lieu' }), js.map(function (j) { return h('th', { class: j === auj ? 'aujourdhui' : '', text: jourFr(j) }); }))),
        h('tbody', {},
          sm.lignes.length ? sm.lignes.map(function (l) { return h('tr', {}, h('th', { text: libLieu(l.lieu) }), js.map(function (j) { return h('td', {}, txt(l.cases[idx(j)])); })); })
            : h('tr', {}, h('td', { colspan: js.length + 1, class: 'muted', text: 'Aucune présence cette semaine.' })),
          h('tr', { class: 'ligne-gardes' }, h('th', { text: 'Absences' }), js.map(function (j) { return h('td', {}, sm.absences[idx(j)].items.map(function (a) { return h('div', {}, h('small', { text: (a.precision || 'Absent') + (a.remplacant ? ' — remplacé par ' + nomMed(a.remplacant, a.remplacantId) : '') })); })); })),
          h('tr', { class: 'ligne-gardes' }, h('th', { text: 'Gardes et astreintes' }), js.map(function (j) { return h('td', {}, sm.gardes[idx(j)].items.map(function (g) { return h('div', {}, h('small', { text: g.libelle + (g.lieu ? ' (' + libLieu(g.lieu) + ')' : '') })); })); }))))),
      h('h2', { text: 'Présences, absences et gardes enregistrées' }),
      sm.presences.length ? h('div', { class: 'pile' }, sm.presences.sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); }).map(lignePresence))
        : h('p', { class: 'muted', text: 'Aucune.' }));
  }
  function libPresence(p) {
    var g = p.nature === 'garde' ? opts().gardes.filter(function (x) { return x.code === p.garde; })[0] : null;
    var quand = p.repetition === 'date' ? 'le ' + dateFr(p.debut) : S.REPETITIONS[p.repetition].toLowerCase() + ' le ' + (p.jours || []).map(function (j) { return JOURS[j]; }).join(', ') + ' depuis le ' + dateFr(p.debut) + (p.fin ? ' jusqu’au ' + dateFr(p.fin) : '');
    var moms = p.nature === 'garde' ? '' : ' (' + (p.moments && p.moments.length === 1 ? S.MOMENTS[p.moments[0]].toLowerCase() : 'matin et après-midi') + ')';
    return (p.nature === 'presence' ? 'Présence — ' + libLieu(p.service) : p.nature === 'absence' ? 'Absence' + (p.remplacant ? ', remplacé par ' + nomMed(p.remplacant, p.remplacantId) : '') : (g ? S.libGarde(g) : 'Garde')) + ' — ' + quand + moms + (p.precision ? ' — ' + p.precision : '');
  }
  function lignePresence(p) {
    return h('div', { class: 'agenda-point' }, h('span', { text: S.medecinDe(cfg(), p) + ' : ' + libPresence(p) }),
      peut('PRESENCE') ? bouton('Modifier', function () { modalePresence(p); }, 'petit') : null);
  }
  function libModifs(l) {
    return (l || []).map(function (m) { return 'Série « ' + libPresence(m.serie) + ' » ' + (m.remplacement ? 'remplacée ce jour par : ' + libPresence(m.remplacement) : 'retirée ce jour'); }).join('\n');
  }
  /** Écarte un jour d'une série (modifié ou retiré ce jour seulement) ; `rendre` : le rétablir. */
  function ecarter(p, jour, rendre) {
    var sauf = (p.sauf || []).filter(function (x) { return x !== jour; });
    if (!rendre) sauf.push(jour);
    return U.App.session.enregistrer('PRESENCE', { id: p.id, sauf: sauf.sort(), service: p.service || serviceCourant() });
  }
  /**
   * Case de la grille (décision du porteur du 9 novembre 2026) : pour une série, « Modifier ce jour seulement », « Retirer
   * ce jour seulement », « Modifier toute la série », « Arrêter la série à partir de ce jour » ; pour une saisie d'un jour,
   * « Modifier » et « Retirer » ; jours déjà écartés d'une série, à rétablir ; « Ajouter autre chose ce jour ».
   */
  function modaleCase(medecin, c) {
    var tout = Object.keys(st().presences).map(function (k) { return st().presences[k]; });
    var ps = tout.filter(function (p) {
      return !p.supprime && S.medecinDe(cfg(), p) === medecin && S.couvre(p, c.jour) && (p.nature === 'garde' || !p.moments || !p.moments.length || p.moments.indexOf(c.moment) >= 0);
    });
    var ecartees = S.modifications(st(), cfg(), medecin, c.jour, c.moment);
    var titre = medecin + ' — ' + jourFr(c.jour) + ' ' + S.MOMENTS[c.moment].toLowerCase();
    var dlg;
    function fermer() { if (dlg) { dlg.close(); dlg.remove(); } U.rendreContenu(); }
    async function agir(f, msg) { try { await f(); U.toast(msg); fermer(); } catch (e) { alert(e.message); } }
    function ligne(p) {
      var serie = p.repetition !== 'date', btns;
      if (serie) btns = [
        bouton('Modifier ce jour seulement', function () { fermer(); setTimeout(function () { modalePresence(null, { jourSeul: { serie: p, jour: c.jour } }); }, 0); }, 'petit primaire'),
        bouton('Retirer ce jour seulement', function () { if (confirm('Retirer le ' + jourFr(c.jour) + ' de la série ? Les autres jours ne changent pas.')) agir(function () { return ecarter(p, c.jour); }, 'Jour retiré de la série.'); }, 'petit'),
        bouton('Modifier toute la série', function () { fermer(); setTimeout(function () { modalePresence(p); }, 0); }, 'petit'),
        bouton('Arrêter la série à partir de ce jour', function () {
          if (!confirm('Arrêter la série à partir du ' + jourFr(c.jour) + ' ? Les jours précédents sont gardés.')) return;
          var veille = S.jourISO(S.plusJours(S.depuisISO(c.jour), -1));
          agir(function () { return veille < p.debut ? U.App.session.enregistrer('PRESENCE', { id: p.id, supprime: true, service: p.service || serviceCourant() }) : U.App.session.enregistrer('PRESENCE', { id: p.id, fin: veille, service: p.service || serviceCourant() }); }, 'Série arrêtée.');
        }, 'petit danger')];
      else btns = [
        bouton('Modifier', function () { fermer(); setTimeout(function () { modalePresence(p); }, 0); }, 'petit'),
        bouton('Retirer', function () { if (confirm('Retirer : ' + libPresence(p) + ' ?')) agir(function () { return U.App.session.enregistrer('PRESENCE', { id: p.id, supprime: true, service: p.service || serviceCourant() }); }, 'Retiré.'); }, 'petit danger')];
      return h('div', { class: 'agenda-point pile' }, h('span', {}, h('b', { text: serie ? 'Série : ' : 'Ce jour : ' }), libPresence(p) + (p.remplace ? ' (remplace un jour d’une série)' : '')), h('div', { class: 'actions gauche' }, btns));
    }
    var corps = h('div', { class: 'pile' },
      ps.length ? ps.map(ligne) : h('p', { class: 'muted', text: 'Rien d’enregistré pour ce moment.' }),
      ecartees.length ? h('div', { class: 'pile' }, h('b', { text: 'Jour écarté d’une série' }), ecartees.map(function (m) {
        return h('div', { class: 'agenda-point' }, h('span', { text: libPresence(m.serie) + (m.remplacement ? ' — remplacée ce jour' : ' — retirée ce jour') }),
          bouton('Rétablir ce jour', function () { agir(function () { return ecarter(m.serie, c.jour, true).then(function () { return m.remplacement ? U.App.session.enregistrer('PRESENCE', { id: m.remplacement.id, supprime: true, service: m.remplacement.service || serviceCourant() }) : null; }); }, 'Jour rétabli dans la série.'); }, 'petit'));
      })) : null,
      h('small', { class: 'muted', text: 'Une série se répète chaque semaine ou toutes les deux semaines. « Modifier ce jour seulement » ne change que ce jour (marqué * dans la grille) ; « Modifier toute la série » change tous les jours de la série.' }));
    dlg = h('dialog', { class: 'large', 'aria-label': titre });
    dlg.appendChild(h('div', { class: 'tete' }, h('h2', { text: titre })));
    dlg.appendChild(h('div', { class: 'corps' }, corps));
    dlg.appendChild(h('div', { class: 'pied' }, bouton('Fermer', fermer), bouton('Ajouter autre chose ce jour', function () { fermer(); setTimeout(function () { modalePresence(null, { lieu: vue.lieu, medecin: medecin, jour: c.jour, moment: c.moment }); }, 0); }, 'primaire')));
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); fermer(); });
    document.body.appendChild(dlg); dlg.showModal();
  }
  function modalePresence(p, init) {
    var ini = init || {}, o = opts();
    // « Modifier ce jour seulement » : saisie d'un jour reprise de la série, qui écarte ce jour de la série à l'enregistrement
    var seul = ini.jourSeul || null;
    var x = seul ? Object.assign({}, seul.serie, { id: null, repetition: 'date', debut: seul.jour, fin: '', jours: [], sauf: undefined }) : (p || {});
    var nature = x.nature || 'presence';
    var radios = h('div', { class: 'actions gauche' }), zone = h('div', { class: 'pile' });
    var selMed = h('select', { 'aria-label': 'Médecin' });
    function remplirMed(choix) {
      U.vider(selMed);
      var l = MED.proposes(cfg(), {});
      if (choix && !l.some(function (m) { return m.nom === choix; })) l.push({ nom: choix, fonction: 'autre', statut: 'titulaire' });
      selMed.appendChild(h('option', { value: '', text: '— Choisir le médecin —' }));
      l.forEach(function (m) { selMed.appendChild(h('option', { value: m.nom, text: m.nom + (m.statut === 'interimaire' ? ' — intérimaire' : ''), selected: m.nom === choix })); });
    }
    remplirMed(x.medecin ? S.medecinDe(cfg(), x) : (ini.medecin || ''));
    var selLieu = h('select', { 'aria-label': 'Service ou lieu' }, lieux().map(function (l) { return h('option', { value: l.code, text: l.libelle, selected: l.code === (x.service || ini.lieu) }); }));
    var selGarde = h('select', { 'aria-label': 'Type de garde' }, o.gardes.map(function (g) { return h('option', { value: g.code, text: S.libGarde(g) + (g.lieu ? ' — ' + libLieu(g.lieu) : ''), selected: g.code === x.garde }); }));
    var joursChoisis = (x.jours || (ini.jour ? [new Date(S.depuisISO(ini.jour)).getDay()] : [1, 2, 3, 4, 5])).slice();
    var casesJours = [1, 2, 3, 4, 5, 6, 0].map(function (d) {
      var cb = h('input', { type: 'checkbox', checked: joursChoisis.indexOf(d) >= 0, onchange: function () { joursChoisis = cb.checked ? joursChoisis.concat([d]) : joursChoisis.filter(function (y) { return y !== d; }); } });
      return h('label', { class: 'case' }, cb, h('span', { text: JOURS[d] }));
    });
    var momChoisis = (x.moments || (ini.moment ? [ini.moment] : ['matin', 'apresmidi'])).slice();
    var casesMom = Object.keys(S.MOMENTS).map(function (m) {
      var cb = h('input', { type: 'checkbox', checked: momChoisis.indexOf(m) >= 0, onchange: function () { momChoisis = cb.checked ? momChoisis.concat([m]) : momChoisis.filter(function (y) { return y !== m; }); } });
      return h('label', { class: 'case' }, cb, h('span', { text: S.MOMENTS[m] }));
    });
    var rep = h('select', { 'aria-label': 'Répétition' }, Object.keys(S.REPETITIONS).map(function (k) { return h('option', { value: k, text: S.REPETITIONS[k], selected: (x.repetition || (ini.jour ? 'date' : 'semaine')) === k }); }));
    var debut = h('input', { type: 'date', value: x.debut || ini.jour || S.jourISO(Date.now()) }), fin = h('input', { type: 'date', value: x.fin || '' });
    var precision = h('input', { type: 'text', maxlength: 100, value: x.precision || '', placeholder: 'ex. staff, consultations, congé, formation' });
    var selRemp = h('select', { 'aria-label': 'Remplaçant' }, [h('option', { value: '', text: '— Pas de remplaçant —' })].concat(MED.proposes(cfg(), {}).map(function (m) { return h('option', { value: m.nom, text: m.nom, selected: x.remplacant && m.nom === nomMed(x.remplacant, x.remplacantId) }); })));
    var zoneJours = h('div', {}, h('b', { text: 'Jours' }), h('div', { class: 'actions gauche' }, casesJours));
    // Salle occupée par la présence (module Salles et bureaux, 0.25.0), heures des demi-journées réglées dans Salles
    var selSalle = U.salles && U.App.session.detientCle('salles') ? U.salles.selecteur({ service: function () { return selLieu.value; }, valeur: x.salle || '', exclure: x.id ? 'suivi|' + x.id : null,
      periode: function () { var SA = SIC.salles, oS = SA.options(cfg(), selLieu.value), m = momChoisis.indexOf('matin') >= 0 ? oS.matin : oS.apresmidi; return debut.value ? [SA.instant(debut.value, m[0]), SA.instant(debut.value, momChoisis.indexOf('apresmidi') >= 0 ? oS.apresmidi[1] : m[1])] : null; } }) : null;
    if (selSalle) { selLieu.addEventListener('change', function () { selSalle.remplir(); }); debut.addEventListener('change', function () { selSalle.maj(); }); }
    function dessiner() {
      U.vider(radios);
      Object.keys(S.NATURES).forEach(function (k) {
        var r = h('input', { type: 'radio', name: 'nat-presence', checked: nature === k, onchange: function () { nature = k; dessiner(); } });
        radios.appendChild(h('label', { class: 'case choix-nature' + (nature === k ? ' choisi' : '') }, r, h('span', { text: S.NATURES[k] })));
      });
      U.vider(zone);
      var gerer = U.medecins && U.medecins.peutGerer();
      zone.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Médecin', h('span', { class: 'en-ligne' }, selMed,
        gerer ? bouton('+ Intérimaire', function () { U.medecins.modaleMedecin(null, function () { var n = MED.liste(cfg()); remplirMed(n.length ? n[n.length - 1].nom : ''); }); }, 'petit') : null)),
        nature === 'presence' ? h('label', {}, 'Service ou lieu', selLieu) : nature === 'garde' ? h('label', {}, 'Type de garde', selGarde) : h('label', {}, 'Remplacé par (facultatif)', selRemp)));
      zone.appendChild(h('div', { class: 'grille-2' }, h('label', {}, 'Répétition', rep), nature === 'garde' ? h('small', { class: 'muted', text: 'Horaires et lieu : ceux du type de garde (réglages du module).' }) : h('div', {}, h('b', { text: 'Moment' }), h('div', { class: 'actions gauche' }, casesMom))));
      zoneJours.hidden = rep.value === 'date';
      zone.appendChild(zoneJours);
      zone.appendChild(h('div', { class: 'grille-2' }, h('label', {}, rep.value === 'date' ? 'Date' : 'À partir du', debut), rep.value === 'date' ? h('span') : h('label', {}, 'Jusqu’au (facultatif)', fin)));
      zone.appendChild(h('label', {}, 'Précision (facultatif)', precision));
      if (selSalle && nature === 'presence') zone.appendChild(h('label', {}, 'Salle occupée (facultatif)', selSalle.noeud));
    }
    rep.addEventListener('change', dessiner);
    dessiner();
    var boutons = [{ texte: 'Annuler' }];
    if (p) boutons.push({ texte: 'Supprimer', classe: 'danger', action: async function () {
      if (!confirm('Supprimer : ' + S.medecinDe(cfg(), p) + ' — ' + libPresence(p) + ' ?')) return false;
      await U.App.session.enregistrer('PRESENCE', { id: p.id, supprime: true, service: p.service || serviceCourant() });
      U.toast('Supprimé.');
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: async function () {
      var d = { id: x.id || 'PM' + C.hex(C.aleatoire(5)), medecin: selMed.value, nature: nature, repetition: rep.value, debut: debut.value, fin: rep.value === 'date' ? '' : fin.value,
        jours: rep.value === 'date' ? [] : joursChoisis.slice().sort(), moments: nature === 'garde' ? [] : momChoisis, precision: precision.value.trim(),
        service: nature === 'presence' ? selLieu.value : serviceCourant(), garde: nature === 'garde' ? selGarde.value : '', remplacant: nature === 'absence' ? selRemp.value : '',
        medecinId: idMed(selMed.value), remplacantId: nature === 'absence' && selRemp.value ? idMed(selRemp.value) : null };
      if (nature !== 'garde' && !d.moments.length) throw new Error('Choisissez le matin, l’après-midi ou les deux.');
      d.salle = selSalle && nature === 'presence' ? selSalle.valeur() : '';
      var demandesSalle = [];
      if (d.salle) {
        // Dates des 8 prochaines semaines : conflits ou salle à valider (demande au gestionnaire de la salle)
        var SA = SIC.salles, oS = SA.options(cfg(), d.service), per = [], jj = d.debut;
        for (var n = 0; n < 56 && per.length < 60; n++, jj = SA.plusJours(jj, 1)) {
          if (!S.couvre(Object.assign({}, d, { id: d.id }), jj) || jj < S.jourISO(Date.now() - 864e5)) continue;
          d.moments.forEach(function (mo) { var hh = mo === 'matin' ? oS.matin : oS.apresmidi; per.push({ ref: 'suivi|' + d.id + '|' + jj + '|' + mo, debut: SA.instant(jj, hh[0]), fin: SA.instant(jj, hh[1]) }); });
        }
        demandesSalle = U.salles.verifier({ salle: d.salle, service: d.service, titre: selMed.value, genre: 'medical', periodes: per, exclure: 'suivi|' + d.id });
      }
      if (seul) {
        d.repetition = 'date'; d.jours = []; d.fin = ''; d.remplace = seul.serie.id;
        await ecarter(seul.serie, seul.jour);
      }
      await U.App.session.enregistrer('PRESENCE', d);
      if (demandesSalle.length) await U.salles.envoyer(demandesSalle);
      U.toast(seul ? 'Ce jour est modifié ; la série ne change pas les autres jours.' : 'Enregistré.');
    } });
    U.modale(seul ? 'Modifier ce jour seulement (' + jourFr(seul.jour) + ')' : p ? 'Modifier toute la série' : 'Présence, absence ou garde', h('div', { class: 'pile' }, radios, zone), boutons, { large: true });
  }
  function imprimerPresences() {
    var corps;
    if (vue.affichage === 'service') {
      var g = S.grilleLieu(st(), cfg(), vue.lieu, vue.lundi), js = joursAffiches(g);
      corps = h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Médecin' }), js.map(function (j) { return h('th', { text: jourFr(j) }); }))),
        h('tbody', {}, g.lignes.map(function (l) {
          return h('tr', {}, h('th', { text: l.medecin.nom }), js.map(function (j) {
            var cs = l.cases.filter(function (c) { return c.jour === j; });
            return h('td', {}, cs.map(function (c) { var e = ETATS[c.etat]; return e ? h('div', { text: S.MOMENTS[c.moment] + ' : ' + (c.etat === 'absent' && c.remplacant ? 'remplacé par ' + c.remplacant : e[0].toLowerCase()) }) : null; }));
          }));
        }), h('tr', {}, h('th', { text: 'Gardes et astreintes' }), js.map(function (j) { var x = g.gardes.filter(function (y) { return y.jour === j; })[0]; return h('td', {}, (x ? x.items : []).map(function (it) { return h('div', { text: it.libelle + ' : ' + it.medecin }); })); })),
        h('tr', {}, h('th', { text: 'Psychiatres présents' }), js.map(function (j) { var cs = g.couverture.filter(function (c) { return c.jour === j; }); return h('td', {}, cs.map(function (c) { return h('div', {}, S.MOMENTS[c.moment] + ' : ', c.alerte ? h('b', { text: '0 ⚠' }) : h('span', { text: String(c.psychiatres) })); })); }))));
      U.imprimer(documentImprime('Présences médicales — ' + libLieu(vue.lieu), 'Semaine du ' + jourFr(vue.lundi), corps, h('span', {}, h('b', { text: '⚠' }), ' aucun psychiatre présent.')));
    } else {
      var sm = S.semaineMedecin(st(), cfg(), vue.medecin, vue.lundi), js2 = vue.weekend ? sm.jours : sm.jours.slice(0, 5);
      corps = h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Service ou lieu' }), js2.map(function (j) { return h('th', { text: jourFr(j) }); }))),
        h('tbody', {}, sm.lignes.map(function (l) { return h('tr', {}, h('th', { text: libLieu(l.lieu) }), js2.map(function (j) { var c = l.cases[sm.jours.indexOf(j)]; return h('td', { text: c.moments.filter(function (m) { return m.s.etat && m.s.etat !== 'absent'; }).map(function (m) { return S.MOMENTS[m.moment]; }).join(', ') || (c.moments.some(function (m) { return m.s.etat === 'absent'; }) ? 'absent' : '—') }); })); })));
      U.imprimer(documentImprime('Présences médicales — ' + vue.medecin, 'Semaine du ' + jourFr(vue.lundi), corps, ''));
    }
  }

  // ------------------------------------------------------------ Entretiens et contrats de soins
  function badgeDate(x) {
    if (!x.date) return h('span', { class: 'badge ' + (x.retard ? 'bad' : 'warn'), text: x.retard ? 'à faire' : 'pas encore' });
    return h('span', {}, h('span', { text: dateFr(x.date) + ' ' }), h('span', { class: 'badge ' + (x.retard ? 'bad' : 'ok'), title: 'délai : ' + x.delai + ' jours', text: x.jours === 0 ? 'aujourd’hui' : x.jours + ' j' }));
  }
  function suivisAffiches(maintenant) {
    var ls = S.suivis(st(), cfg(), fiches(), servicesAffiches(), maintenant);
    if (vue.filtreMedecin) ls = ls.filter(function (x) { return nomMed(x.patient.medecin1, x.patient.medecin1Id) === vue.filtreMedecin || nomMed(x.patient.medecin2, x.patient.medecin2Id) === vue.filtreMedecin; });
    if (vue.enRetard) ls.sort(function (a, b) { return ((b.entretien.retard ? 2 : 0) + (b.contrat.retard ? 1 : 0)) - ((a.entretien.retard ? 2 : 0) + (a.contrat.retard ? 1 : 0)); });
    return ls;
  }
  function vueEntretiens(maintenant) {
    var ls = suivisAffiches(maintenant), toutes = S.suivis(st(), cfg(), fiches(), servicesAffiches(), maintenant);
    var nE = toutes.filter(function (x) { return x.entretien.retard; }).length, nC = toutes.filter(function (x) { return x.contrat.retard; }).length;
    var meds = {}; toutes.forEach(function (x) { [x.patient.medecin1, x.patient.medecin2].forEach(function (m) { if (m) meds[nomMed(m)] = true; }); });
    var selMed = h('select', { class: 'select-barre', 'aria-label': 'Médecin', onchange: function () { vue.filtreMedecin = selMed.value; U.rendreContenu(); } }, [h('option', { value: '', text: 'Tous les médecins' })].concat(Object.keys(meds).sort().map(function (m) { return h('option', { value: m, text: m, selected: m === vue.filtreMedecin }); })));
    var cbR = h('input', { type: 'checkbox', checked: vue.enRetard, onchange: function () { vue.enRetard = cbR.checked; U.rendreContenu(); } });
    var tr = opts().tranches;
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Entretiens médicaux et contrats de soins' }), h('div', { class: 'espace' }),
        bouton('Imprimer', function () { imprimerEntretiens(maintenant); }),
        peut('SUIVI') ? bouton('Cocher les patients vus…', function () { modaleCocher(); }, 'primaire') : null),
      h('div', { class: 'actions gauche' },
        nE ? h('span', { class: 'badge bad', text: nE + (nE > 1 ? ' patients sans entretien médical dans le délai' : ' patient sans entretien médical dans le délai') }) : h('span', { class: 'badge ok', text: 'Entretiens à jour' }),
        nC ? h('span', { class: 'badge warn', text: nC + (nC > 1 ? ' contrats de soins à réévaluer' : ' contrat de soins à réévaluer') }) : h('span', { class: 'badge ok', text: 'Contrats à jour' }),
        h('small', { class: 'muted', text: 'Délais : ' + tr.map(function (t, i) { return (t.jusqua === null ? 'au-delà de J' + (tr[i - 1] ? tr[i - 1].jusqua : 0) : 'jusqu’à J' + t.jusqua) + ' → entretien ' + t.entretien + ' j, contrat ' + t.contrat + ' j'; }).join(' · ') })),
      h('div', { class: 'actions gauche' }, selMed, h('label', { class: 'case' }, cbR, h('span', { text: 'En retard d’abord' }))),
      ls.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Patient', 'Mode', 'Médecins (1re / 2e ligne)', 'Délais', 'Dernier entretien médical', 'Contrat de soins réévalué le', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', {}, ls.map(function (x) {
          var p = x.patient;
          return h('tr', {}, h('td', {}, nomPatient(p), servicesAffiches().length > 1 ? h('div', {}, h('small', { class: 'muted', text: U.libService(S.serviceDe(p)) })) : null),
            h('td', {}, modeDe(p) ? h('span', { class: 'badge', text: modeDe(p) }) : '—'),
            h('td', { text: (nomMed(p.medecin1, p.medecin1Id) || 'non attribué') + ' / ' + (nomMed(p.medecin2, p.medecin2Id) || 'non attribué') }),
            h('td', {}, h('small', { text: x.delais.entretien + ' j / ' + x.delais.contrat + ' j' })),
            h('td', {}, badgeDate(x.entretien), x.entretien.medecin ? h('div', {}, h('small', { class: 'muted', text: x.entretien.medecin })) : null),
            h('td', {}, badgeDate(x.contrat)),
            h('td', { class: 'actions-ligne' }, bouton('Historique', function () { modaleHistorique(p); }, 'petit')));
        })))) : h('div', { class: 'panneau vide', text: 'Aucun patient hospitalisé.' }),
      h('p', { class: 'muted' }, h('small', { text: 'Seules les dates sont gardées (qui, quand) : aucun contenu d’entretien ni de contrat. Le délai dépend du nombre de jours depuis l’entrée (réglages du module).' })));
  }
  function modaleHistorique(p) {
    var l = S.suivisDe(st(), p.id);
    U.modale('Historique — ' + identite(p), h('div', { class: 'pile' }, l.length ? l.map(function (x) {
      return h('div', { class: 'agenda-point' }, h('span', { text: dateFr(x.date) + ' ' + x.date.slice(0, 4) + ' — ' + S.QUOI[x.quoi] + (x.medecin ? ' — ' + x.medecin : '') }),
        h('small', { class: 'muted', text: 'saisi par ' + U.App.session.nomAuteur(x.par) }),
        peut('SUIVI') ? bouton('Annuler', async function () {
          if (!confirm('Annuler cette saisie ?')) return;
          try { await U.App.session.enregistrer('SUIVI', { id: x.id, annule: true, service: x.service }); U.toast('Saisie annulée.'); var d = document.querySelector('dialog[open]'); if (d) d.dispatchEvent(new Event('cancel')); } catch (e) { alert(e.message); }
        }, 'petit danger') : null);
    }) : h('p', { class: 'muted', text: 'Aucune saisie.' })), [{ texte: 'Fermer' }], { large: true });
  }
  /**
   * Cocher en une fois les patients vus (décision du porteur) : rien n'est coché d'office ; les patients dont le médecin
   * choisi est responsable sont mis en évidence, en bleu pour la 1re ligne et en orangé pour la 2e.
   */
  function modaleCocher() {
    var sv = serviceCourant(), patients = S.hospitalises(fiches(), servicesAffiches()), coches = {};
    var date = h('input', { type: 'date', value: S.jourISO(Date.now()), max: S.jourISO(Date.now()) });
    var champMed = U.medecins.champ({ service: U.App.service !== '*' ? sv : '', vide: '— Choisir le médecin —' }), selMed = champMed.select;
    var quoi = h('select', { 'aria-label': 'Ce qui a été fait' }, Object.keys(S.QUOI).map(function (k) { return h('option', { value: k, text: S.QUOI[k] }); }));
    var recherche = h('input', { type: 'search', placeholder: 'Rechercher un patient', 'aria-label': 'Rechercher un patient' });
    var grille = h('div', { class: 'grille-2' }), compte = h('span', { class: 'muted' });
    function niveau(p) { return selMed.value && nomMed(p.medecin1, p.medecin1Id) === selMed.value ? 1 : selMed.value && nomMed(p.medecin2, p.medecin2Id) === selMed.value ? 2 : 0; }
    function dessiner() {
      U.vider(grille);
      var q = recherche.value.trim().toLowerCase();
      patients.filter(function (p) { return !q || identite(p).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return (niveau(a) || 9) - (niveau(b) || 9); }).forEach(function (p) {
        var n = niveau(p), d = S.derniers(st(), p.id).entretien;
        var cb = h('input', { type: 'checkbox', checked: !!coches[p.id], onchange: function () { coches[p.id] = cb.checked; dessiner(); } });
        grille.appendChild(h('label', { class: 'case case-patient' + (n === 1 ? ' ligne1' : n === 2 ? ' ligne2' : '') + (coches[p.id] ? ' coche' : '') }, cb,
          h('span', { class: 'espace' }, nomPatient(p), h('br'), h('small', { class: 'muted', text: (nomMed(p.medecin1, p.medecin1Id) || 'non attribué') + (d ? ' · vu le ' + dateFr(d.date) : ' · pas d’entretien') })),
          n ? h('span', { class: 'badge ' + (n === 1 ? 'ligne1' : 'ligne2'), text: n === 1 ? '1re ligne' : '2e ligne' }) : null));
      });
      var nb = Object.keys(coches).filter(function (k) { return coches[k]; }).length;
      compte.textContent = nb + (nb > 1 ? ' patients cochés' : ' patient coché');
    }
    selMed.addEventListener('change', dessiner);
    recherche.addEventListener('input', dessiner);
    dessiner();
    U.modale('Cocher les patients vus', h('div', { class: 'pile' },
      h('div', { class: 'grille-3' }, h('label', {}, 'Date', date), h('label', {}, 'Médecin', champMed), h('label', {}, 'Ce qui a été fait', quoi)),
      h('div', { class: 'actions gauche' },
        bouton('Tout cocher', function () { patients.forEach(function (p) { coches[p.id] = true; }); dessiner(); }, 'petit'),
        bouton('Cocher ses patients', function () { patients.forEach(function (p) { if (niveau(p)) coches[p.id] = true; }); dessiner(); }, 'petit'),
        bouton('Tout décocher', function () { coches = {}; dessiner(); }, 'petit'), recherche),
      grille,
      h('div', { class: 'actions gauche' }, h('span', { class: 'legende ligne1', text: 'Patient du médecin en 1re ligne' }), h('span', { class: 'legende ligne2', text: 'Patient du médecin en 2e ligne' }), compte),
      h('small', { class: 'muted', text: 'Rien n’est coché d’office : les patients du médecin choisi sont mis en évidence. Une saisie par patient est inscrite au journal (date, médecin, auteur) ; une erreur se corrige depuis « Historique ».' })), [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var ids = Object.keys(coches).filter(function (k) { return coches[k]; });
        if (!ids.length) throw new Error('Cochez au moins un patient.');
        if (!champMed.nom()) throw new Error('Choisissez le médecin.');
        for (var i = 0; i < ids.length; i++) {
          var p = fiches()[ids[i]];
          await U.App.session.enregistrer('SUIVI', { id: 'SV' + C.hex(C.aleatoire(5)), patient: ids[i], service: S.serviceDe(p), date: date.value, medecin: champMed.nom(), medecinId: champMed.medecinId(), quoi: quoi.value });
        }
        U.toast(ids.length + (ids.length > 1 ? ' patients enregistrés.' : ' patient enregistré.'));
      } }], { large: true });
  }
  function imprimerEntretiens(maintenant) {
    var ls = suivisAffiches(maintenant);
    var corps = h('table', {}, h('thead', {}, h('tr', {}, ['Patient', 'Mode', 'Médecins (1re / 2e ligne)', 'Dernier entretien médical', 'Contrat de soins réévalué le'].map(function (x) { return h('th', { text: x }); }))),
      h('tbody', {}, ls.map(function (x) {
        var p = x.patient;
        return h('tr', {}, h('td', {}, nomPatient(p)), h('td', { text: modeDe(p) || '—' }), h('td', { text: (nomMed(p.medecin1, p.medecin1Id) || 'non attribué') + ' / ' + (nomMed(p.medecin2, p.medecin2Id) || 'non attribué') }),
          h('td', {}, dateImprimee('', x.entretien), x.entretien.medecin ? ' (' + x.entretien.medecin + ')' : ''), h('td', {}, dateImprimee('', x.contrat)));
      })));
    U.imprimer(documentImprime('Entretiens médicaux et contrats de soins', servicesAffiches().map(U.libService).join(', '), corps, legendeRetard()));
  }

  // ------------------------------------------------------------ Patients par médecin
  function blocPatient(x) {
    return h('div', { class: 'patient-medecin' }, nomPatient(x.patient),
      h('div', { class: 'actions gauche' },
        h('span', { class: 'badge ' + (x.entretien.retard ? 'bad' : 'ok'), title: 'Dernier entretien médical', text: 'entretien ' + (x.entretien.date ? dateFr(x.entretien.date) : '—') }),
        h('span', { class: 'badge ' + (x.contrat.retard ? 'bad' : 'ok'), title: 'Dernière réévaluation du contrat de soins', text: 'contrat ' + (x.contrat.date ? dateFr(x.contrat.date) : '—') })));
  }
  function vueParMedecin(maintenant) {
    var svs = servicesAffiches();
    if (U.App.service !== '*') vue.serviceTableau = U.App.service;
    else if (svs.indexOf(vue.serviceTableau) < 0) vue.serviceTableau = svs[0] || '';
    var sv = vue.serviceTableau, t = S.parMedecin(st(), cfg(), fiches(), sv, maintenant), ajout = U.App.session.peut('PATIENT') && !U.App.session.apercu;
    var g = S.grilleLieu(st(), cfg(), sv, lundiDe(maintenant)), auj = S.jourISO(maintenant);
    function presence(nom) {
      var l = g.lignes.filter(function (x) { return x.medecin.nom === nom; })[0];
      if (!l) return '';
      var c = l.cases.filter(function (x) { return x.jour === auj; }), pr = c.filter(function (x) { return /present|ponctuel|garde/.test(x.etat); });
      if (c.some(function (x) { return x.etat === 'absent'; })) return 'Absent aujourd’hui';
      return pr.length === 2 ? 'Présent aujourd’hui' : pr.length ? 'Présent ' + (pr[0].moment === 'matin' ? 'ce matin' : 'cet après-midi') : '';
    }
    function cellule(liste, nom, niveau, alerte) {
      return h('td', { class: alerte && liste.length ? 'non-attribue' : '' }, liste.map(blocPatient),
        ajout && nom ? h('button', { class: 'btn lien petit ajout-case', type: 'button', onclick: function () { modaleAjout(nom, niveau, sv); } }, '+ Ajouter un patient') : null);
    }
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', { text: 'Patients suivis par médecin — ' + U.libService(sv) }), h('div', { class: 'espace' }),
        svs.length > 1 ? (function () { var sel = h('select', { class: 'select-barre', 'aria-label': 'Service', onchange: function () { vue.serviceTableau = sel.value; U.rendreContenu(); } }, svs.map(function (c) { return h('option', { value: c, text: U.libService(c), selected: c === sv }); })); return sel; })() : null,
        bouton('Imprimer', function () { imprimerParMedecin(t, sv); })),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tableau-medecins' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Médecin' }), h('th', { text: 'Responsabilité de 1re ligne' }), h('th', { text: 'Responsabilité de 2e ligne' }))),
        h('tbody', {},
          h('tr', { class: 'ligne-non-attribues' }, h('th', {}, h('b', { text: '⚠ Non attribués' }), h('br'), h('small', { text: 'patients sans médecin à ce niveau' })),
            cellule(t.nonAttribues.l1, '', 1, true), cellule(t.nonAttribues.l2, '', 2, true)),
          t.lignes.map(function (l) {
            return h('tr', {}, h('th', {}, h('b', { text: l.medecin.nom }), h('br'), h('small', { class: 'muted', text: l.horsListe ? 'absent de la liste commune' : MED.FONCTIONS[l.medecin.fonction] + (l.medecin.statut !== 'titulaire' ? ' — ' + MED.STATUTS[l.medecin.statut].toLowerCase() : '') }),
              presence(l.medecin.nom) ? h('div', {}, h('small', { class: 'muted', text: presence(l.medecin.nom) })) : null),
              cellule(l.l1, l.medecin.nom, 1), cellule(l.l2, l.medecin.nom, 2));
          })))),
      h('p', { class: 'muted' }, h('small', { text: 'Chaque patient affiche son dernier entretien médical et sa dernière réévaluation du contrat de soins (en rouge si le délai, qui dépend de la durée d’hospitalisation, est dépassé). « + Ajouter un patient » dans une case lui attribue ce médecin à ce niveau, dans la fiche patient.' })));
  }
  /** Ajout depuis une case : patients sans médecin à ce niveau d'abord ; changement de responsabilité confirmé. */
  function modaleAjout(nom, niveau, sv) {
    var champ = niveau === 1 ? 'medecin1' : 'medecin2', lib = niveau === 1 ? '1re ligne' : '2e ligne';
    var patients = S.hospitalises(fiches(), [sv]).filter(function (p) { return nomMed(p[champ], p[champ + 'Id']) !== nom; }).sort(function (a, b) { return (a[champ] ? 1 : 0) - (b[champ] ? 1 : 0); });
    var choix = null, recherche = h('input', { type: 'search', placeholder: 'Rechercher un patient du service', 'aria-label': 'Rechercher un patient' }), liste = h('div', { class: 'pile' });
    function dessiner() {
      U.vider(liste);
      var q = recherche.value.trim().toLowerCase();
      patients.filter(function (p) { return !q || identite(p).toLowerCase().indexOf(q) >= 0; }).forEach(function (p) {
        var r = h('input', { type: 'radio', name: 'ajout-patient', checked: choix === p.id, onchange: function () { choix = p.id; } });
        liste.appendChild(h('label', { class: 'case case-patient' }, r, h('span', {}, nomPatient(p), h('br'), h('small', { class: 'muted', text: '1re ligne : ' + (nomMed(p.medecin1, p.medecin1Id) || 'non attribué') + ' · 2e ligne : ' + (nomMed(p.medecin2, p.medecin2Id) || 'non attribué') }))));
      });
      if (!liste.childNodes.length) liste.appendChild(h('p', { class: 'muted', text: 'Aucun patient.' }));
    }
    recherche.addEventListener('input', dessiner);
    dessiner();
    U.modale('Ajouter un patient — ' + nom + ', ' + lib, h('div', { class: 'pile' }, recherche, liste, h('small', { class: 'muted', text: 'Les patients sans médecin à ce niveau sont proposés en premier.' })), [
      { texte: 'Annuler' },
      { texte: 'Ajouter', classe: 'primaire', action: async function () {
        if (!choix) throw new Error('Choisissez un patient.');
        var p = fiches()[choix];
        if (p[champ] && nomMed(p[champ], p[champ + 'Id']) !== nom && !confirm('Changer de responsabilité de ' + lib + ' ?\n\n' + identite(p) + ' a déjà ' + nomMed(p[champ], p[champ + 'Id']) + ' comme médecin de ' + lib + '.\nLe remplacer par ' + nom + ' ?\n\n(Le changement est daté et inscrit au journal ; il apparaît dans la fiche patient.)')) return false;
        var d = { patientId: p.id }; d[champ] = nom; d[champ + 'Id'] = idMed(nom) || '';
        await U.App.session.enregistrer('PATIENT', d);
        U.toast(nom + ' : médecin de ' + lib + ' de ' + identite(p) + '.');
      } }], { large: true });
  }
  function imprimerParMedecin(t, sv) {
    var cel = function (l) { return h('td', {}, l.map(function (x) { return h('div', {}, nomPatient(x.patient), ' · ', dateImprimee('entretien', x.entretien), ' · ', dateImprimee('contrat', x.contrat)); })); };
    var corps = h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Médecin' }), h('th', { text: '1re ligne' }), h('th', { text: '2e ligne' }))),
      h('tbody', {}, h('tr', {}, h('th', { text: 'Non attribués' }), h('td', {}, t.nonAttribues.l1.map(function (x) { return h('div', {}, nomPatient(x.patient)); })), h('td', {}, t.nonAttribues.l2.map(function (x) { return h('div', {}, nomPatient(x.patient)); }))),
        t.lignes.map(function (l) { return h('tr', {}, h('th', { text: l.medecin.nom }), cel(l.l1), cel(l.l2)); })));
    U.imprimer(documentImprime('Patients suivis par médecin', U.libService(sv), corps, legendeRetard()));
  }

  // ------------------------------------------------------------ Administration → Suivi médical
  function panneauReglages() {
    var o = opts(), tranches = o.tranches.map(function (t) { return Object.assign({}, t); }), gardes = o.gardes.map(function (g) { return Object.assign({}, g); }), lx = o.lieux.map(function (l) { return Object.assign({}, l); });
    var premier = h('input', { type: 'number', min: 0, max: 30, value: o.premierEntretien, class: 'champ-court' }), na = h('input', { type: 'number', min: 0, max: 30, value: o.nonAttribueApres, class: 'champ-court' });
    var couv = h('input', { type: 'checkbox', checked: o.alerteCouverture });
    var zT = h('tbody'), zG = h('tbody'), zL = h('div', { class: 'pile' });
    var num = function (obj, k, min, max) { var c = h('input', { type: 'number', min: min, max: max, value: obj[k] === null ? '' : obj[k], class: 'champ-court', oninput: function () { obj[k] = c.value === '' ? null : +c.value; } }); return c; };
    function dT() {
      U.vider(zT);
      tranches.forEach(function (t, i) {
        var der = i === tranches.length - 1;
        zT.appendChild(h('tr', {}, h('td', {}, der ? 'au-delà' : ['jusqu’au jour ', num(t, 'jusqua', 0, 3650)]), h('td', {}, num(t, 'entretien', 1, 365), ' jours'), h('td', {}, num(t, 'contrat', 1, 365), ' jours'),
          h('td', {}, der || tranches.length < 2 ? null : bouton('Retirer', function () { tranches.splice(i, 1); dT(); }, 'petit danger'))));
      });
    }
    var lieuxChoix = function () { return [{ code: '', libelle: 'Établissement (aucun service)' }].concat(U.tousServices().map(function (s) { return { code: s.code, libelle: s.libelle }; }), lx.filter(function (l) { return l.code; }).map(function (l) { return { code: l.code, libelle: l.libelle + ' (lieu)' }; })); };
    function dG() {
      U.vider(zG);
      gardes.forEach(function (g, i) {
        var lib = h('input', { type: 'text', maxlength: 60, value: g.libelle, 'aria-label': 'Type de garde', oninput: function () { g.libelle = lib.value; } });
        var d = h('input', { type: 'time', value: g.debut, oninput: function () { g.debut = d.value; } }), f = h('input', { type: 'time', value: g.fin, oninput: function () { g.fin = f.value; } });
        var l = h('select', { 'aria-label': 'Lieu', onchange: function () { g.lieu = l.value; } }, lieuxChoix().map(function (x) { return h('option', { value: x.code, text: x.libelle, selected: x.code === g.lieu }); }));
        zG.appendChild(h('tr', {}, h('td', {}, lib), h('td', {}, 'de ', d, ' à ', f, g.fin < g.debut ? h('small', { class: 'muted', text: ' (lendemain)' }) : null), h('td', {}, l), h('td', {}, bouton('Retirer', function () { gardes.splice(i, 1); dG(); }, 'petit danger'))));
      });
    }
    function dL() {
      U.vider(zL);
      lx.forEach(function (l, i) {
        var c = h('input', { type: 'text', maxlength: 20, value: l.code, placeholder: 'Code (ex. UMP)', class: 'champ-court', oninput: function () { l.code = c.value.trim(); } });
        var n = h('input', { type: 'text', maxlength: 80, value: l.libelle, placeholder: 'Libellé (ex. Urgences médico-psychologiques)', oninput: function () { l.libelle = n.value; } });
        zL.appendChild(h('div', { class: 'agenda-point' }, c, n, bouton('Retirer', function () { lx.splice(i, 1); dL(); dG(); }, 'petit danger')));
      });
    }
    dT(); dG(); dL();
    // Gestion de la liste des médecins (administrateur)
    var D = SIC.modules.obtenir('suivi').droits, gestion = MED.gestion(cfg());
    var casesG = D.rolesConfig(cfg()).filter(function (r) { return !r.admin; }).map(function (r) { return { code: r.code, cb: h('input', { type: 'checkbox', checked: gestion.indexOf(r.code) >= 0 }), libelle: r.libelle }; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Suivi médical' }),
      h('h3', { text: 'Délais d’alerte selon la durée d’hospitalisation' }),
      h('p', { class: 'muted', text: 'Le délai appliqué à un patient dépend du nombre de jours depuis son entrée (J0 = jour d’entrée). Une alerte est levée quand le dernier entretien ou la dernière réévaluation du contrat est plus ancien que le délai.' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Durée d’hospitalisation', 'Entretien médical tous les', 'Contrat de soins réévalué tous les', ''].map(function (x) { return h('th', { text: x }); }))), zT)),
      h('div', { class: 'actions gauche' }, bouton('+ Ajouter une tranche', function () { var a = tranches[tranches.length - 2]; tranches.splice(tranches.length - 1, 0, { jusqua: a ? a.jusqua + 7 : 7, entretien: 7, contrat: 15 }); dT(); }, 'petit')),
      h('label', { class: 'en-ligne' }, 'Premier entretien attendu dans les', premier, 'jours suivant l’entrée'),
      h('label', { class: 'en-ligne' }, 'Patient non attribué (1re et 2e ligne) : alerte après', na, 'jour(s) d’hospitalisation'),
      h('h3', { text: 'Gardes et astreintes' }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Type', 'Horaires', 'Lieu (compte comme présence dans ce service ou lieu)', ''].map(function (x) { return h('th', { text: x }); }))), zG)),
      h('div', { class: 'actions gauche' }, bouton('+ Type de garde', function () { gardes.push({ code: 'g' + Date.now().toString(36), libelle: '', debut: '08:30', fin: '17:30', lieu: '' }); dG(); }, 'petit')),
      h('h3', { text: 'Lieux de présence sans patient' }),
      h('p', { class: 'muted', text: 'Lieux où les médecins sont présents sans que Tessera y suive de patients (ex. urgences médico-psychologiques) : proposés dans les présences et pour les gardes.' }),
      zL, h('div', { class: 'actions gauche' }, bouton('+ Lieu', function () { lx.push({ code: '', libelle: '' }); dL(); }, 'petit')),
      h('label', { class: 'case' }, couv, h('span', { text: 'Alerter quand aucun psychiatre n’est présent sur une demi-journée ouvrée (somaticien compté à part)' })),
      h('h3', { text: 'Liste commune des médecins' }),
      h('p', { class: 'muted', text: 'Rôles qui ajoutent et modifient les médecins, dont les intérimaires (en plus de l’administrateur) :' }),
      h('div', { class: 'actions gauche' }, casesG.map(function (c) { return h('label', { class: 'case' }, c.cb, h('span', { text: c.libelle })); }), bouton('Voir la liste…', function () { U.medecins.modaleListe(); }, 'petit')),
      U.boutonEnregistrer(async function () {
        if (tranches.some(function (t, i) { return i < tranches.length - 1 && (t.jusqua === null || (i && t.jusqua <= tranches[i - 1].jusqua)); })) throw new Error('Les tranches doivent aller en croissant (jusqu’au jour…).');
        var lieuxOk = lx.filter(function (l) { return l.code || l.libelle; });
        lieuxOk.forEach(function (l) { if (!/^[A-Za-z0-9_-]{1,20}$/.test(l.code) || !String(l.libelle).trim()) throw new Error('Lieu : code (lettres, chiffres) et libellé requis.'); if (U.tousServices().some(function (s) { return s.code === l.code; })) throw new Error('Le code ' + l.code + ' est déjà celui d’un service.'); });
        if (gardes.some(function (g) { return !String(g.libelle).trim(); })) throw new Error('Chaque type de garde doit avoir un nom.');
        var v = { tranches: tranches, premierEntretien: +premier.value, nonAttribueApres: +na.value, gardes: gardes, lieux: lieuxOk, alerteCouverture: couv.checked };
        var g2 = casesG.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.code; });
        var brut = cfg().medecins && !Array.isArray(cfg().medecins) ? cfg().medecins : { liste: [] };
        var changements = [['suiviMedical', v]];
        if (JSON.stringify(g2) !== JSON.stringify(gestion)) changements.push(['medecins', Object.assign({}, brut, { liste: brut.liste || [], gestion: g2 })]);
        await U.enregistrerConfig(changements);
      }));
  }

  // ------------------------------------------------------------ Journal, pastille
  var LIB = { PRESENCE: 'Suivi médical : présence, absence ou garde', SUIVI: 'Suivi médical : entretien ou contrat de soins', PRESENCE_PSY: 'Psychologues : présence ou absence', ENTRETIEN_PREVU: 'Psychologues : entretien prévu' };
  function resume(e) {
    var d = e.data || {};
    if (e.type === 'PRESENCE') { var p = st().presences[d.id] || d; return d.supprime ? 'Supprimé : ' + nomMed(p.medecin, p.medecinId) + ' — ' + (p.nature ? libPresence(p) : '') : nomMed(d.medecin || p.medecin, d.medecinId || p.medecinId) + ' — ' + libPresence(Object.assign({}, p, d)); }
    if (e.type === 'SUIVI') { var s = st().suivis[d.id] || d, pt = fiches()[s.patient]; return (d.annule ? 'Annulé : ' : '') + (S.QUOI[s.quoi] || 'Saisie') + ' le ' + (s.date ? s.date.split('-').reverse().join('/') : '') + ' — ' + (pt ? identite(pt) : 'patient') + (s.medecin ? ' — ' + nomMed(s.medecin, s.medecinId) : ''); }
    if (e.type === 'PRESENCE_PSY') { var q = st().presencesPsy[d.id] || d; return (d.supprime ? 'Supprimé : ' : '') + (q.psychologue || d.psychologue || 'Psychologue') + ' — ' + ((q.nature || d.nature) === 'absence' ? 'absence' : 'présence') + (q.debut ? ' à partir du ' + q.debut.split('-').reverse().join('/') : ''); }
    if (e.type === 'ENTRETIEN_PREVU') { var en = st().entretiensPrevus[d.id] || d, pe = fiches()[en.patient]; return (d.annule ? 'Annulé : ' : '') + 'entretien prévu le ' + String(en.jour || '').split('-').reverse().join('/') + ' ' + (en.de || '') + ' — ' + (pe ? identite(pe) : 'patient') + ' — ' + (en.psychologue || ''); }
    return e.type;
  }
  function pastille() {
    try { return S.alertes(st(), cfg(), fiches(), U.services().map(function (x) { return x.code; }), Date.now()).length; } catch (e) { return 0; }
  }
  SIC.modules.completerInterface('suivi', {
    vues: { presences: vuePresences, entretiens: vueEntretiens, medecins: vueParMedecin, liste: function () { return U.medecins.vue(); }, psychologues: function () { return U.psychologues.vue(); } },
    journal: { resume: resume, action: function (e) { return LIB[e.type] || e.type; }, libelleType: function (t) { return LIB[t] || t; }, effetAnnulation: function () { return 'La saisie revient à son état précédent.'; } },
    admin: { onglets: function () { return [['suivi', 'Suivi médical', [panneauReglages()]]]; } },
    pastille: pastille,
    // Onglet Informations de la messagerie (0.23.0, réglage de l'établissement) : alertes du module, par service et par type
    informations: function () {
      try {
        var par = {}, auj = S.jourISO(Date.now());
        S.alertes(st(), cfg(), fiches(), U.services().map(function (x) { return x.code; }), Date.now()).forEach(function (a) { var k = a.service + '|' + a.type; par[k] = (par[k] || 0) + 1; });
        var LIBS = { entretien: 'sans entretien médical dans le délai', contrat: 'sans réévaluation du contrat de soins dans le délai', nonAttribue: 'sans médecin attribué' };
        return Object.keys(par).map(function (k) {
          var p = k.split('|'), n = par[k];
          return { id: 'su-' + k + '-' + auj + '-' + n, niveau: 'warn', titre: n + ' patient' + (n > 1 ? 's ' : ' ') + LIBS[p[1]] + ' — ' + U.libService(p[0]),
            detail: 'Liste et dates dans le module Suivi médical.', ouvrir: function () { U.ouvrirFenetre('suivi'); } };
        });
      } catch (e) { return []; }
    }
  });
  U.suivi = { modaleCocher: modaleCocher, nomPatient: nomPatient };
})();
