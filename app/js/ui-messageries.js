/*
 * Tessera Santé — interface des messageries du service, sans connexion (lot A, 14 novembre 2026).
 * Annuaire des boîtes dans l'Équipe, réglage par l'administrateur et le cadre, « Écrire à… » (lien mailto, objet sans
 * identité de patient) et raccourci vers le webmail. Tessera n'envoie ni ne lit aucun courriel.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, Mx = SIC.messageries;

  function s() { return U.App.session; }
  function mesServices() { return s().mesServices().map(function (x) { return x.code || x; }); }
  function lienMail(adresse, objet, texte, classe) {
    var href = Mx.mailto(adresse, objet);
    return href ? h('a', { class: classe || 'btn petit', href: href, title: 'Ouvre votre messagerie avec le destinataire' + (objet ? ' et l’objet' : '') + ' préremplis' }, texte || 'Écrire') : null;
  }
  function lienWebmail(b, texte) {
    return b.webmail ? h('a', { class: 'btn petit', href: b.webmail, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvre le webmail dans un nouvel onglet' }, texte || 'Webmail') : null;
  }

  /** Courriel professionnel d'un agent (fiche de l'Équipe), '' s'il n'est pas lisible. */
  function mailAgent(id) { try { return s().ouvert('equipe') && SIC.equipe ? SIC.equipe.fiche(s().etatModule('equipe'), id).mailPro || '' : ''; } catch (e) { return ''; } }
  /** Boîtes du service, pour l'annuaire de l'Équipe et pour « Écrire à… ». */
  function boites(services) { return Mx.boites(U.config(), services || mesServices()); }

  /**
   * Fenêtre « Écrire à… » : boîtes des services (et adresses en plus, ex. l'agent concerné), objet prérempli. `objet`
   * est préparé par l'appelant, sans identité de patient ni contenu clinique.
   */
  function ecrireA(objet, options) {
    var o = options || {}, l = boites(o.services), plus = (o.adresses || []).filter(function (x) { return x && Mx.adresseValide(x.adresse); });
    var lignes = plus.map(function (x) { return { libelle: x.libelle, adresse: x.adresse }; }).concat(l);
    U.modale('Écrire à…', h('div', { class: 'pile' },
      h('p', {}, h('b', { text: 'Objet : ' }), objet || '(aucun)'),
      lignes.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, lignes.map(function (b) {
        return h('tr', {}, h('td', {}, h('b', { text: b.libelle })), h('td', { text: b.adresse }), h('td', { class: 'actions-ligne' }, lienMail(b.adresse, objet, 'Écrire', 'btn petit primaire')));
      })))) : h('p', { class: 'muted', text: 'Aucune boîte aux lettres réglée pour vos services (Administration → Équipe).' }),
      h('small', { class: 'muted', text: 'Votre messagerie s’ouvre avec le destinataire et l’objet préremplis : Tessera n’envoie rien. N’ajoutez aucune information clinique ni l’identité d’un patient si le courriel sort de l’établissement.' })),
      [{ texte: 'Fermer' }]);
  }
  /** Bouton « Écrire à… » à poser dans une fiche (demande de travaux, permission, congé, réservation…). */
  function bouton(objet, options) {
    if (!boites((options || {}).services).length && !((options || {}).adresses || []).some(function (x) { return x && Mx.adresseValide(x.adresse); })) return null;
    return h('button', { class: 'btn petit', type: 'button', onclick: function () { ecrireA(typeof objet === 'function' ? objet() : objet, options); } }, 'Écrire à…');
  }

  /** Même chose pour la liste des boutons d'une fenêtre (`U.modale`) : la fiche reste ouverte. */
  function boutonModale(objet, options) {
    if (!bouton(objet, options)) return null;
    return { texte: 'Écrire à…', action: function () { setTimeout(function () { ecrireA(typeof objet === 'function' ? objet() : objet, options); }, 0); return false; } };
  }
  /** Section de l'annuaire de l'Équipe : boîtes du service, écrire, webmail ; « Ma boîte » pour celles de son rôle. */
  function sectionAnnuaire(service) {
    var svs = service && service !== '*' ? [service] : mesServices(), l = boites(svs);
    if (!l.length) return null;
    var miennes = Mx.boitesPour(U.config(), svs, s().roles()).map(function (b) { return b.adresse; });
    return h('section', { class: 'panneau' }, h('h2', { text: 'Messageries du service' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'eq-boites' },
        h('thead', {}, h('tr', {}, ['Boîte', 'Adresse', 'Pour', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, l.map(function (b) {
          var roles = b.roles.length ? b.roles.map(function (r) { var x = SIC.model.rolesConfig(U.config()).filter(function (y) { return y.code === r; })[0]; return x ? x.libelle : r; }).join(', ') : 'Toute l’équipe';
          return h('tr', {}, h('td', {}, h('b', { text: b.libelle }), miennes.indexOf(b.adresse) >= 0 && b.roles.length ? h('span', { class: 'badge ok', text: 'Ma boîte' }) : null),
            h('td', { text: b.adresse }), h('td', { text: roles + (b.service !== '*' ? ' (' + U.libService(b.service) + ')' : '') }),
            h('td', { class: 'actions-ligne' }, lienMail(b.adresse, '', 'Écrire'), lienWebmail(b)));
        })))),
      h('small', { class: 'muted', text: 'Tessera ne lit ni n’envoie aucun courriel : « Écrire » ouvre votre messagerie, « Webmail » ouvre la boîte dans un nouvel onglet (connexion avec vos identifiants habituels).' }));
  }

  /** Réglage des boîtes (administrateur : établissement et services ; cadre : ses services). */
  function panneauReglage() {
    var admin = s().roles().indexOf('ADMIN') >= 0, c = s().compteEffectif() || {};
    var niveaux = (admin ? [{ code: '*', libelle: 'Établissement (tous les services)' }] : []).concat(U.tousServices().filter(function (x) { return admin || (c.services || []).indexOf(x.code) >= 0; }).map(function (x) { return { code: x.code, libelle: 'Service ' + x.libelle }; }));
    if (!niveaux.length) return null;
    var v = Mx.normaliser(U.config().boitesMail), niveau = niveaux[0].code;
    var zone = h('textarea', { rows: 6, 'aria-label': 'Boîtes aux lettres, une par ligne', placeholder: 'Paramédicaux | ide.service@hopital.example | IDE, AS | https://webmail.hopital.example\nSecrétariat | secretariat.service@hopital.example | SECRETAIRE' });
    zone.value = Mx.versTexte(v[niveau]);
    var sel = h('select', { 'aria-label': 'Niveau', onchange: function () { v[niveau] = Mx.depuisTexte(zone.value); niveau = sel.value; zone.value = Mx.versTexte(v[niveau]); } }, niveaux.map(function (n) { return h('option', { value: n.code, text: n.libelle }); }));
    var codes = SIC.model.rolesConfig(U.config()).filter(function (r) { return r.code !== 'ADMIN'; }).map(function (r) { return r.code + ' (' + r.libelle + ')'; }).join(', ');
    return h('section', { class: 'panneau' }, h('h2', { text: 'Messageries du service (sans connexion)' }),
      h('p', { class: 'muted', text: 'Boîtes aux lettres affichées dans l’annuaire de l’Équipe et proposées par « Écrire à… » (demandes de travaux, permissions, congés, réservations). Une ligne par boîte : « Libellé | adresse | rôles (codes séparés par des virgules ; vide = toute l’équipe) | lien du webmail (facultatif) ». Codes des rôles : ' + codes + '. Tessera n’envoie ni ne lit aucun courriel : aucune connexion à la messagerie.' }),
      h('label', {}, 'Niveau', sel), zone,
      U.boutonEnregistrer(async function () {
        var l = Mx.depuisTexte(zone.value), lues = zone.value.split('\n').filter(function (x) { return x.trim(); }).length;
        if (l.length < lues) throw new Error('Ligne illisible : vérifiez l’adresse de chaque boîte (et que le lien du webmail commence par https://).');
        v[niveau] = l;
        Object.keys(v).forEach(function (k) { if (!v[k].length) delete v[k]; });
        await U.enregistrerConfig([['boitesMail', v]]);
      }));
  }

  U.messageries = { ecrireA: ecrireA, bouton: bouton, boutonModale: boutonModale, sectionAnnuaire: sectionAnnuaire, panneauReglage: panneauReglage, lienMail: lienMail, boites: boites, mailAgent: mailAgent };
})();
