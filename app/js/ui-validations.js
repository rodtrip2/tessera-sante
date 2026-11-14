// SPDX-License-Identifier: EUPL-1.2
/*
 * Interface — onglet « Validations » de l'administration (décision du porteur du 13 novembre 2026, CLAUDE.md § 2).
 *
 * Fonctions soumises à avis, rangées par interlocuteur (une fonction figure chez chacun de ses interlocuteurs, avec
 * le même état partout) ; l'administrateur change leur état (date, auteur, référence ; information du délégué à la
 * protection des données pour les données cliniques et du personnel activées sur accord hiérarchique) ; le cadre et
 * la direction consultent. Rappel des fonctions activées sur accord hiérarchique seulement : page « Aujourd'hui » et
 * accueil de l'administration, pour le cadre et la direction, jamais pour les autres agents.
 */
(function () {
  'use strict';
  var U = SIC.ui, h = U.h, V = SIC.validations;
  function s() { return U.App.session; }
  function cfg() { return U.config(); }
  function roles() { try { return s().roles(); } catch (e) { return []; } }
  function estAdmin() { return roles().indexOf('ADMIN') >= 0; }
  function jourFr(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
  function aujourdhui() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var CLASSE = { desactive: '', accord: 'warn', avis: 'ok' };

  /** Peut-on consulter l'onglet ? L'administrateur, le cadre et la direction. */
  function consultable() { return V.voitRappel(roles()); }

  function detailEtat(f, e) {
    if (e.defaut) return f.existante ? 'Fonction existante, activée par défaut : aucun accord ni avis enregistré' : 'Livrée désactivée';
    var t = [];
    if (e.etat === 'desactive') t.push('Désactivée' + (e.date ? ' le ' + jourFr(e.date) : ''));
    else t.push((e.etat === 'avis' ? 'Avis du ' : 'Accord du ') + jourFr(e.date) + (e.auteur ? ', ' + e.auteur : ''));
    if (e.dpoInforme) t.push('délégué à la protection des données informé le ' + jourFr(e.dpoInforme));
    return t.join(' ; ');
  }

  function ligne(f, e) {
    return h('tr', {},
      h('td', {}, h('b', { text: f.libelle }), h('div', {}, h('small', { class: 'muted', text: f.description })), f.ou ? h('div', {}, h('small', { class: 'muted', text: 'Réglages : ' + f.ou })) : null),
      h('td', {}, h('span', { class: 'badge ' + CLASSE[e.etat], text: V.ETATS[e.etat] })),
      h('td', {}, h('small', { text: detailEtat(f, e) }), e.reference ? h('div', {}, h('small', { class: 'muted', text: 'Référence : ' + e.reference })) : null),
      estAdmin() ? h('td', {}, h('button', { class: 'btn petit', type: 'button', onclick: function () { modaleEtat(f); } }, 'Modifier')) : null);
  }

  /** Vue de l'onglet. */
  function vue() {
    if (!consultable()) return h('p', { class: 'muted', text: 'Onglet réservé à l’administrateur, au cadre et à la direction.' });
    var c = cfg(), rappel = V.aRappeler(c), groupes = V.parInterlocuteur(c);
    var entetes = ['Fonction', 'État', 'Décision'].concat(estAdmin() ? [''] : []);
    return h('div', { class: 'pile' },
      h('h1', { text: 'Validations' }),
      h('section', { class: 'panneau' },
        h('p', { text: 'Fonctions dont l’usage demande un avis, rangées par interlocuteur. Une fonction figure chez chacun de ses interlocuteurs ; son état est le même partout. Une fonction désactivée est masquée : ses données sont conservées, jamais supprimées, et restent reprises dans l’export du droit d’accès.' }),
        h('p', { class: 'muted', text: 'Pendant le pilote, une fonction peut être activée sur accord hiérarchique. Pour les données cliniques et les données du personnel, le délégué à la protection des données doit au minimum avoir été informé. ' + (estAdmin() ? 'Seul l’administrateur change ces états ; chaque changement est inscrit au journal.' : 'Seul l’administrateur change ces états.') }),
        rappel.length ? h('p', { class: 'alerte', text: rappel.length + ' fonction' + (rappel.length > 1 ? 's' : '') + ' activée' + (rappel.length > 1 ? 's' : '') + ' sans avis (accord hiérarchique ou fonction existante) : ' + rappel.map(function (f) { return f.libelle; }).join(' ; ') + '.' }) : h('p', { class: 'info', text: 'Aucune fonction ne tourne sur accord hiérarchique seulement.' })),
      groupes.map(function (g) {
        return h('section', { class: 'panneau' }, h('h2', { text: g.interlocuteur.libelle }),
          h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {}, entetes.map(function (t) { return h('th', { text: t }); }))),
            h('tbody', {}, g.fonctions.map(function (x) { return ligne(x.fonction, x.etat); })))));
      }));
  }

  /** Changement d'état d'une fonction (administrateur). */
  function modaleEtat(f) {
    var e = V.etat(cfg(), f.code), nom = 'etat-' + f.code;
    var radios = Object.keys(V.ETATS).map(function (k) {
      return { k: k, el: h('input', { type: 'radio', name: nom, value: k, checked: e.etat === k, onchange: maj }) };
    });
    var date = h('input', { type: 'date', value: e.defaut ? aujourdhui() : (e.date || aujourdhui()) });
    var auteur = h('input', { type: 'text', maxlength: 120, value: e.auteur, placeholder: 'Ex. : directeur des soins, cadre supérieur de santé, délégué à la protection des données' });
    var reference = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Ex. : courriel du 12 novembre, compte rendu de réunion, numéro d’inscription au registre des traitements' });
    reference.value = e.reference;
    var sensible = f.categorie === 'clinique' || f.categorie === 'personnel';
    var dpo = h('input', { type: 'date', value: e.dpoInforme || '' });
    var libDate = h('span'), libAuteur = h('span');
    var zDate = h('label', {}, libDate, date), zAuteur = h('label', {}, libAuteur, auteur);
    var zDpo = sensible ? h('label', {}, 'Date à laquelle le délégué à la protection des données a été informé', dpo) : null;
    var aide = h('p', { class: 'muted' });
    function choisi() { var r = radios.filter(function (x) { return x.el.checked; })[0]; return r ? r.k : ''; }
    function maj() {
      var k = choisi();
      zDate.hidden = zAuteur.hidden = k === 'desactive' || !k;
      libDate.textContent = k === 'avis' ? 'Date de l’avis' : 'Date de l’accord hiérarchique';
      libAuteur.textContent = k === 'avis' ? 'Avis rendu par' : 'Accord donné par';
      if (zDpo) zDpo.hidden = k === 'desactive' || !k;
      aide.textContent = k === 'desactive' ? 'La fonction sera masquée pour tous. Les données déjà saisies sont conservées et restent reprises dans l’export du droit d’accès.'
        : k === 'accord' ? 'Activation pendant le pilote, en attendant l’avis. Un rappel reste affiché au cadre et à la direction (jamais aux autres agents).' + (sensible ? ' Données ' + (f.categorie === 'clinique' ? 'cliniques' : 'du personnel') + ' : indiquez quand le délégué à la protection des données a été informé.' : '')
        : k === 'avis' ? 'Activation après l’avis de : ' + f.interlocuteurs.map(function (i) { return V.interlocuteur(i).libelle; }).join(', ') + '.' : '';
    }
    maj();
    var contenu = h('div', { class: 'pile' },
      h('p', {}, h('b', { text: f.libelle })), h('p', { class: 'muted', text: f.description }),
      h('fieldset', {}, h('legend', { text: 'État dans l’établissement' }), radios.map(function (x) { return h('label', { class: 'case' }, x.el, ' ' + V.ETATS[x.k]); })),
      zDate, zAuteur, zDpo, h('label', {}, 'Référence (facultatif)', reference), aide);
    return U.modale('Validations — ' + f.libelle, contenu, [
      { texte: 'Annuler' },
      { texte: 'Enregistrer', classe: 'primaire', action: async function () {
        var k = choisi();
        var valeur = V.changer(cfg(), f.code, { etat: k, date: date.value, auteur: auteur.value, reference: reference.value, dpoInforme: dpo.value });
        if (k === 'desactive' && e.etat !== 'desactive' && !confirm('Désactiver « ' + f.libelle + ' » ?\n\nSes écrans seront masqués pour tous. Les données déjà saisies sont conservées, jamais supprimées.')) return false;
        if (JSON.stringify(valeur) === JSON.stringify(V.normaliser(cfg().validations))) { U.toast('Aucune modification.'); return; }
        await s().enregistrer('CONFIG', { cle: 'validations', valeur: valeur });
        U.toast('État enregistré : ' + V.ETATS[k].toLowerCase() + '.');
      } }
    ]);
  }

  /** Bloc de rappel (page « Aujourd'hui ») : cadre et direction seulement ; null sinon. */
  function blocRappel() {
    if (!consultable()) return null;
    var l = V.aRappeler(cfg());
    if (!l.length) return null;
    var peutOuvrir = U.App.session && (estAdmin() || roles().indexOf('CADRE') >= 0);
    return h('section', { class: 'panneau aj-bloc aj-large' }, h('div', { class: 'barre' }, h('h2', { text: 'Fonctions activées sans avis' }), h('div', { class: 'espace' }),
      peutOuvrir ? h('button', { class: 'btn petit', type: 'button', onclick: ouvrir }, 'Validations') : null),
      h('p', { class: 'alerte', text: l.length + ' fonction' + (l.length > 1 ? 's tournent' : ' tourne') + ' sur accord hiérarchique ou comme fonction existante, sans avis enregistré : ' + l.map(function (f) { return f.libelle; }).join(' ; ') + '.' }),
      h('small', { class: 'muted', text: 'Ce rappel n’est visible que du cadre et de la direction.' }));
  }
  /** Ligne de l'état de la plateforme (accueil de l'administration). */
  function etatPlateforme() {
    var l = V.aRappeler(cfg());
    return { niveau: l.length ? 'warn' : 'ok', texte: l.length ? 'Validations : ' + l.length + ' fonction' + (l.length > 1 ? 's' : '') + ' activée' + (l.length > 1 ? 's' : '') + ' sans avis enregistré' : 'Validations : toutes les fonctions activées ont un avis enregistré' };
  }
  function ouvrir() { U.ouvrirFenetre('admin'); U.App.onglet = 'validations'; U.rendreContenu(); }

  U.validations = { vue: vue, consultable: consultable, blocRappel: blocRappel, etatPlateforme: etatPlateforme, ouvrir: ouvrir };
})();
