// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Patients — écran d'import de la liste des patients exportée du DPI (logique : import-patients.js).
 * Fichier lu dans le navigateur, jamais copié sur le partage ; saisies enregistrées en un lot annulable (journal du
 * module Patients) ; modèle d'import mémorisé sans aucune donnée de patient.
 */
(function () {
  'use strict';
  var SIC = self.SIC, U = SIC.ui, h = U.h, IP = SIC.importPatients;
  var NON_FOURNI = '';

  function jj(d) { return d ? d.split('-').reverse().join('/') : ''; }
  function libFiche(f) { return (f.nom || '?') + ' ' + (f.prenom || '') + (f.naissance ? ' (né(e) le ' + jj(f.naissance) + ')' : '') + (f.ipp ? ' — IPP ' + f.ipp : ''); }

  function ouvrir() {
    var lignes = null, modele = null, analyse = null;
    var cfg = U.config(), memorises = (cfg.importPatients && cfg.importPatients.modeles) || {};
    var fichier = h('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xlsm' });
    var svDefaut = h('select', {}, U.services().map(function (s) { return h('option', { value: s.code, text: s.libelle, selected: s.code === U.App.service }); }));
    var selModele = h('select', {}, [h('option', { value: '*', text: 'Modèle de l’établissement' })].concat(U.services().map(function (s) { return h('option', { value: s.code, text: 'Modèle du service ' + s.libelle }); })));
    var memoriser = h('input', { type: 'checkbox', checked: true });
    var zoneColonnes = h('div', { class: 'pile' }), zoneApercu = h('div', { class: 'pile' });
    var decisions = { doublons: {}, noms: {}, sorties: {} };

    async function lire() {
      var f = fichier.files[0];
      U.vider(zoneColonnes); U.vider(zoneApercu); analyse = null;
      if (!f) return;
      try {
        if (/\.(csv|txt)$/i.test(f.name)) {
          var octets = new Uint8Array(await f.arrayBuffer()), texte;
          try { texte = new TextDecoder('utf-8', { fatal: true }).decode(octets); } catch (e) { texte = new TextDecoder('windows-1252').decode(octets); }
          lignes = IP.lireCSV(texte);
        } else {
          var cl = await SIC.xlsx.lire(await f.arrayBuffer());
          lignes = cl.feuilles[Object.keys(cl.feuilles)[0]] || [];
        }
      } catch (e) { zoneColonnes.appendChild(h('div', { class: 'erreur', text: 'Fichier illisible : ' + e.message })); return; }
      var m = memorises[selModele.value] || memorises['*'];
      modele = IP.appliquerModele(lignes, m);
      dessinerColonnes();
    }

    function dessinerColonnes() {
      U.vider(zoneColonnes); U.vider(zoneApercu); analyse = null;
      var entetes = (lignes[modele.entete] || []).map(function (x) { return x == null ? '' : String(x).trim(); });
      var exemple = lignes[modele.entete + 1] || [];
      function selCol(cle) {
        var sel = h('select', { 'aria-label': 'Colonne pour ' + cle, onchange: function () { modele.colonnes[cle] = sel.value || null; dessinerColonnes(); } },
          [h('option', { value: NON_FOURNI, text: 'Non fourni par l’export : à renseigner dans Tessera' })].concat(entetes.filter(Boolean).map(function (e) { return h('option', { value: e, text: e, selected: e === modele.colonnes[cle] }); })));
        return sel;
      }
      zoneColonnes.appendChild(h('h3', { text: 'Colonnes (en-tête trouvée ligne ' + (modele.entete + 1) + ', ' + (lignes.length - modele.entete - 1) + ' ligne(s))' }));
      zoneColonnes.appendChild(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Champ de la fiche', 'Colonne de l’export', 'Exemple (1re ligne)'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, IP.CHAMPS.map(function (c) {
          var i = entetes.indexOf(modele.colonnes[c.cle]);
          return h('tr', {}, h('td', { text: c.libelle }), h('td', {}, selCol(c.cle)), h('td', {}, h('small', { class: 'muted', text: i >= 0 ? String(exemple[i] == null ? '' : exemple[i]) : '—' })));
        })))));
      zoneColonnes.appendChild(h('small', { class: 'muted', text: 'Une même colonne peut servir à plusieurs champs. Le médecin responsable et les commentaires de l’export ne sont jamais importés (risque de données cliniques). Un champ « à renseigner dans Tessera » n’est jamais modifié par l’import.' }));
      // Unités du DPI → services
      var unites = IP.valeursDistinctes(lignes, modele, 'unite');
      if (unites.length) {
        zoneColonnes.appendChild(h('h3', { text: 'Unités de l’export → services' }));
        zoneColonnes.appendChild(h('div', { class: 'grille-2' }, unites.map(function (u) {
          var cur = modele.unites[u.valeur];
          var sel = h('select', { onchange: function () { modele.unites[u.valeur] = sel.value === '?' ? undefined : sel.value; } },
            [h('option', { value: '?', text: 'À choisir', selected: cur === undefined }), h('option', { value: '', text: 'Écarter de l’import', selected: cur === '' })]
              .concat(U.tousServices().map(function (s) { return h('option', { value: s.code, text: s.libelle, selected: cur === s.code }); })));
          return h('label', {}, u.valeur + ' (' + u.lignes + ' ligne(s))', sel);
        })));
      }
      // Valeurs de sexe non reconnues
      var sexes = IP.valeursDistinctes(lignes, modele, 'sexe').filter(function (x) { return IP.lireSexe(x.valeur) === null; });
      if (sexes.length) {
        zoneColonnes.appendChild(h('h3', { text: 'Valeurs du sexe à faire correspondre' }));
        zoneColonnes.appendChild(h('div', { class: 'grille-2' }, sexes.map(function (x) {
          var cur = modele.sexes[x.valeur];
          var sel = h('select', { onchange: function () { modele.sexes[x.valeur] = sel.value; } }, [['', 'Non renseigné'], ['F', 'Féminin'], ['M', 'Masculin'], ['I', 'Indéterminé']].map(function (o) { return h('option', { value: o[0], text: o[1], selected: (cur || '') === o[0] }); }));
          if (cur === undefined) modele.sexes[x.valeur] = '';
          return h('label', {}, '« ' + x.valeur + ' »', sel);
        })));
      }
      zoneColonnes.appendChild(h('div', { class: 'actions gauche' }, h('button', { class: 'btn primaire', type: 'button', onclick: apercu }, 'Voir l’aperçu')));
    }

    function apercu() {
      if (!modele.colonnes.nom && !modele.colonnes.nomComplet) { alert('Attribuez au moins la colonne du nom.'); return; }
      decisions = { doublons: {}, noms: {}, sorties: {} };
      analyse = IP.analyser(lignes, modele, U.st().patients, { aujourdhui: new Date().toISOString().slice(0, 10), service: modele.colonnes.unite ? null : svDefaut.value });
      U.vider(zoneApercu);
      var c = analyse.compte;
      zoneApercu.appendChild(h('h3', { text: 'Aperçu' }));
      zoneApercu.appendChild(h('p', { text: [(c.nouveau || 0) + ' nouveau(x) patient(s)', (c.modifie || 0) + ' fiche(s) ou séjour(s) mis à jour', (c.identique || 0) + ' sans changement', (c.doublon || 0) + ' doublon(s) possible(s) à confirmer', (c.erreur || 0) + ' ligne(s) en erreur', (c.ignoree || 0) + ' ligne(s) écartée(s)', analyse.absents.length + ' patient(s) absent(s) de la liste'].join(' · ') }));
      function section(titre, items, rendu) { if (items.length) zoneApercu.appendChild(h('details', { open: true }, h('summary', { text: titre + ' (' + items.length + ')' }), h('ul', {}, items.map(rendu)))); }
      var L = analyse.lignes;
      section('Nouveaux patients', L.filter(function (r) { return r.statut === 'nouveau'; }), function (r) { return h('li', { text: 'Ligne ' + r.n + ' : ' + libFiche(r.valeurs) + (r.valeurs.chambre ? ', chambre ' + r.valeurs.chambre + (r.valeurs.lit ? ' lit ' + r.valeurs.lit : '') : '') }); });
      section('Fiches ou séjours mis à jour', L.filter(function (r) { return r.statut === 'modifie'; }), function (r) {
        var ch = r.changements.concat(r.sejour ? r.sejour.changements : []);
        return h('li', { text: libFiche(r.fiche) + ' : ' + ch.map(function (x) { return x.libelle + ' ' + (x.avant || '—') + ' → ' + x.apres; }).join(', ') });
      });
      section('Valeurs corrigées dans Tessera, gardées (écart avec l’export)', L.filter(function (r) { return r.ecarts && r.ecarts.length; }), function (r) {
        return h('li', { text: libFiche(r.fiche) + ' : ' + r.ecarts.map(function (x) { return x.libelle + ' ' + x.avant + ' dans Tessera, ' + x.apres + ' dans l’export'; }).join(', ') });
      });
      section('Doublons possibles : à confirmer', L.filter(function (r) { return r.statut === 'doublon'; }), function (r) {
        var sel = h('select', { onchange: function () { decisions.doublons[r.n] = sel.value; } },
          [h('option', { value: '', text: 'À choisir (ligne non importée)' })].concat(r.candidats.map(function (f) { return h('option', { value: f.id, text: 'Même patient que ' + libFiche(f) }); }),
            [h('option', { value: 'nouveau', text: 'Autre patient : nouvelle fiche' }), h('option', { value: 'ignorer', text: 'Ne pas importer cette ligne' })]));
        return h('li', {}, h('div', { text: 'Ligne ' + r.n + ' : ' + libFiche(r.valeurs) + (r.valeurs.iep ? ', séjour ' + r.valeurs.iep : '') }), sel);
      });
      section('Découpages du nom à vérifier', L.filter(function (r) { return r.decoupage && r.decoupage.ambigu && r.statut !== 'erreur' && r.statut !== 'ignoree'; }), function (r) {
        var n = h('input', { type: 'text', value: r.valeurs.nom }), p = h('input', { type: 'text', value: r.valeurs.prenom }), nn = h('input', { type: 'text', value: r.valeurs.nomNaissance || '' });
        function maj() { decisions.noms[r.n] = { nom: n.value, prenom: p.value, nomNaissance: nn.value }; }
        [n, p, nn].forEach(function (x) { x.addEventListener('input', maj); });
        return h('li', {}, h('div', { text: 'Ligne ' + r.n + ' : « ' + r.decoupage.brut + ' »' }),
          h('div', { class: 'grille-3' }, h('label', {}, 'Nom', n), h('label', {}, 'Prénom', p), h('label', {}, 'Nom de naissance', nn)));
      });
      section('Lignes en erreur (non importées)', L.filter(function (r) { return r.statut === 'erreur' || (r.erreurs.length && r.statut !== 'ignoree'); }), function (r) { return h('li', { text: 'Ligne ' + r.n + ' : ' + r.erreurs.join(' ; ') }); });
      section('Absents de la liste : sortie proposée', analyse.absents, function (a) {
        var cb = h('input', { type: 'checkbox', onchange: function () { if (cb.checked) decisions.sorties[a.fiche.id] = date.value; else delete decisions.sorties[a.fiche.id]; } });
        var date = h('input', { type: 'date', value: a.sortie, onchange: function () { if (cb.checked) decisions.sorties[a.fiche.id] = date.value; } });
        return h('li', {}, h('label', { class: 'case' }, cb, h('span', { text: libFiche(a.fiche) + ' — séjour depuis le ' + jj(a.sejours[0] && a.sejours[0].entree) + ' : enregistrer la sortie le ' })), date);
      });
      zoneApercu.appendChild(h('label', { class: 'case' }, memoriser, h('span', {}, 'Mémoriser les colonnes et les correspondances (sans aucune donnée de patient) : ', selModele)));
    }

    U.modale('Importer la liste des patients (DPI)', h('div', { class: 'pile' },
      h('p', { class: 'muted', text: 'Export de la liste des patients fait depuis le dossier patient informatisé (CSV ou Excel). Le fichier est lu sur ce poste et n’est jamais copié sur le partage.' }),
      h('div', { class: 'grille-2' }, h('label', {}, 'Fichier (.csv, .xlsx)', fichier), h('label', {}, 'Service (si l’export n’a pas de colonne d’unité)', svDefaut)),
      zoneColonnes, zoneApercu), [
      { texte: 'Fermer' },
      { texte: 'Importer', classe: 'primaire', action: async function () {
        if (!analyse) throw new Error('Choisissez le fichier puis affichez l’aperçu.');
        var r = IP.saisies(analyse, decisions);
        var att = r.resume.attente ? '\n' + r.resume.attente + ' doublon(s) possible(s) sans décision ne seront pas importés.' : '';
        if (!r.evenements.length && !memoriser.checked) throw new Error('Rien à importer.' + att);
        if (r.evenements.length && !confirm('Enregistrer : ' + r.resume.creees + ' nouvelle(s) fiche(s), ' + r.resume.modifiees + ' fiche(s) mise(s) à jour, ' + r.resume.sejours + ' séjour(s), ' + r.resume.sorties + ' sortie(s) ?' + att + '\n\nL’import est annulable depuis le journal.')) return false;
        if (r.evenements.length) await U.App.session.enregistrerLot(r.evenements, { libelle: 'Import de la liste des patients (DPI)' });
        if (memoriser.checked) {
          var modeles = JSON.parse(JSON.stringify(memorises));
          modeles[selModele.value] = IP.modeleAMemoriser(modele);
          await U.App.session.enregistrer('CONFIG', { cle: 'importPatients', valeur: { modeles: modeles } });
        }
        U.toast(r.evenements.length ? 'Liste importée.' : 'Modèle mémorisé.');
      } }], { large: true });
    fichier.addEventListener('change', lire);
    selModele.addEventListener('change', function () { if (lignes) { var m = memorises[selModele.value]; if (m) { modele = IP.appliquerModele(lignes, m); dessinerColonnes(); } } });
  }

  U.importPatients = { ouvrir: ouvrir };
})();
