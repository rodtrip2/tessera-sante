// SPDX-License-Identifier: EUPL-1.2
/*
 * Module Données cliniques du séjour — contrat déclaré au registre des modules (phase 5, lot G, décisions du porteur
 * du 15 novembre 2026).
 *
 * Feuille de staff clinique et notes cliniques, rattachées au séjour du patient :
 *   - codes CIM (classification internationale des maladies), saisie libre (code et libellé ; liste importée par
 *     l’établissement depuis 0.82.0 : app/js/cim.js), motif d’hospitalisation, projet thérapeutique ;
 *   - dépendance : les 6 variables des activités de la vie quotidienne (AVQ) du recueil d'informations médicalisé en
 *     psychiatrie (RIM-P), cotées de 1 (autonomie) à 4 (assistance totale) ;
 *   - rappel, pour un patient déjà hospitalisé, des codes CIM et de la dépendance du séjour précédent (référence) ;
 *   - notes cliniques datées, retirées (masquées) mais jamais effacées.
 * Qui écrit et qui lit : IDE, cadre et médecins par défaut, selon les réglages de l'établissement (Rôles et accès).
 * Limites d'accès communes : patients présents, bris de glace (acces-clinique.js). Données cliniques : fonction
 * « dossier-clinique » de l'onglet Validations, livrée désactivée ; le dossier patient informatisé (DPI) reste la
 * référence clinique. Journal `modules\clinique\`, clé propre (remise aussi aux rôles du bris de glace).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./noyau-journal.js'), require('./droits.js'), require('./model.js'), require('./modules.js'));
  else (root.SIC = root.SIC || {}).clinique = factory(root.SIC.noyauJournal, root.SIC.droits, root.SIC.model, root.SIC.modules);
})(typeof self !== 'undefined' ? self : this, function (N, Droits, M, registre) {
  'use strict';

  var TYPES = ['CLINIQUE_STAFF', 'CLINIQUE_NOTE', 'CLINIQUE_NOTE_RETRAIT', 'CLINIQUE_REFERENTIEL'];
  // Liste des codes CIM importée par l'établissement (0.82.0) : réservée à l'administrateur
  var TYPES_SEJOUR = ['CLINIQUE_STAFF', 'CLINIQUE_NOTE', 'CLINIQUE_NOTE_RETRAIT'];
  // Repère de lecture (jamais écrit) : accès « Consulter les données cliniques » réglé rôle par rôle
  var LECTURE = 'CLINIQUE_LECTURE';
  /** Variables AVQ du RIM-P et cotation. */
  var AVQ = [{ code: 'habillage', libelle: 'Habillage' }, { code: 'deplacement', libelle: 'Déplacements et locomotion' }, { code: 'alimentation', libelle: 'Alimentation' },
    { code: 'continence', libelle: 'Continence' }, { code: 'comportement', libelle: 'Comportement' }, { code: 'communication', libelle: 'Relation et communication' }];
  var COTES = { 1: 'Autonomie complète', 2: 'Supervision ou stimulation', 3: 'Assistance partielle', 4: 'Assistance totale' };

  function texte(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200); }
  function long(v, n) { return String(v == null ? '' : v).slice(0, n || 4000).trim(); }
  function cle(patientId, sejourId) { return patientId + '|' + sejourId; }
  function lireCim(l) { return (Array.isArray(l) ? l : []).map(function (x) { return x && texte(x.code, 12) ? { code: texte(x.code, 12).toUpperCase(), libelle: texte(x.libelle, 120) } : null; }).filter(Boolean).slice(0, 20); }
  function lireAvq(a) { var r = {}; AVQ.forEach(function (v) { var n = Math.round(+(a || {})[v.code]); if (n >= 1 && n <= 4) r[v.code] = n; }); return r; }
  /** Score de dépendance : somme des 6 variables cotées (6 à 24), null si incomplet. */
  function score(avq) { var a = avq || {}, s = 0; for (var i = 0; i < AVQ.length; i++) { if (!a[AVQ[i].code]) return null; s += a[AVQ[i].code]; } return s; }

  // ------------------------------------------------------------ Reconstitution de l'état
  function appliquer(st, e) {
    var d = e.data || {}, k, x;
    if (e.type === 'CLINIQUE_REFERENTIEL') {
      // Une liste remplace la précédente ; « retirer » revient à la saisie libre. Historique gardé (journal).
      if (st.referentiel) st.referentielsPrecedents.push(st.referentiel);
      st.referentiel = d.retirer ? null : { piece: texte(d.piece, 60), version: texte(d.version, 40), nombre: Math.max(0, Math.round(+d.nombre) || 0), format: texte(d.format, 60),
        nomFichier: texte(d.nomFichier, 160), source: texte(d.source, 200), empreinte: texte(d.empreinte, 80), le: e.at, par: e.by };
      return;
    }
    if (!d.patientId || !d.sejour) return;
    k = cle(d.patientId, d.sejour);
    x = st.sejours[k] || (st.sejours[k] = { patientId: d.patientId, sejour: d.sejour, service: d.service || '', staff: null, historique: [], notes: [] });
    if (d.service) x.service = d.service;
    if (e.type === 'CLINIQUE_STAFF') {
      var avant = x.staff || { cim: [], motif: '', projet: '', avq: {} };
      var s = { cim: d.cim !== undefined ? lireCim(d.cim) : avant.cim, motif: d.motif !== undefined ? long(d.motif, 1000) : avant.motif, projet: d.projet !== undefined ? long(d.projet, 4000) : avant.projet,
        avq: d.avq !== undefined ? lireAvq(d.avq) : avant.avq, le: e.at, par: e.by };
      if (x.staff) x.historique.push(x.staff);
      x.staff = s;
    }
    if (e.type === 'CLINIQUE_NOTE' && d.id && !x.notes.some(function (n) { return n.id === d.id; })) x.notes.push({ id: d.id, texte: long(d.texte, 4000), le: e.at, par: e.by, nom: texte(d.nom, 80), retiree: null });
    if (e.type === 'CLINIQUE_NOTE_RETRAIT') { var n = x.notes.filter(function (y) { return y.id === d.id; })[0]; if (n && !n.retiree) n.retiree = { le: e.at, par: e.by, motif: texte(d.motif, 200) }; }
  }
  /**
   * Plusieurs codes CIM saisis dans un seul champ (0.78.0, demande du porteur du 16 novembre 2026) : chaque code
   * (une lettre, deux chiffres, puis un point et jusqu'à trois caractères, ou une suite collée : F200, F20.0, F10.24,
   * U07.1, avec + * † éventuels) ouvre une ligne ; le texte qui le suit, jusqu'au code suivant, en est le libellé.
   * Séparateurs : point-virgule, virgule, retour à la ligne, tiret, barre ; un code qui suit un mot du libellé sans
   * séparateur (« carence en vitamine B12 ») reste dans le libellé. Codes en double ignorés.
   * Exemple : « F20.0 Schizophrénie paranoïde ; F10.2, Z59.0 Sans abri » → trois lignes.
   */
  var RE_CIM = /(^|[^A-Za-z0-9])([A-Za-z][0-9]{2}(?:\.[0-9A-Za-z]{1,3}|[0-9][0-9A-Za-z]{0,2})?[+*†]?)(?![0-9A-Za-z])/g;
  function separerCim(saisie) {
    var s = String(saisie == null ? '' : saisie).slice(0, 4000), trouves = [], m;
    RE_CIM.lastIndex = 0;
    while ((m = RE_CIM.exec(s)) && trouves.length < 50) {
      var debut = m.index + m[1].length, avant = s.slice(trouves.length ? trouves[trouves.length - 1].fin : 0, debut);
      // Un code au milieu d'un libellé (« carence en vitamine B12 ») n'en est pas un : il doit suivre le début, un
      // séparateur ou directement un autre code
      if (trouves.length && avant.trim() && !/[;,|/\n\r–—-]\s*$/.test(avant)) continue;
      trouves.push({ code: m[2], debut: debut, fin: m.index + m[0].length });
    }
    var vus = {}, res = [];
    trouves.forEach(function (t, i) {
      var code = t.code.toUpperCase(), cle = code.replace(/[.+*†]/g, '');
      var lib = s.slice(t.fin, i + 1 < trouves.length ? trouves[i + 1].debut : s.length).replace(/^[\s;,:|/–—\-–]+|[\s;,:|/–—\-]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (/^(et|ou)$/i.test(lib)) lib = '';
      if (vus[cle]) { if (lib && !vus[cle].libelle) vus[cle].libelle = lib; return; }
      vus[cle] = { code: code.slice(0, 12), libelle: lib };
      res.push(vus[cle]);
    });
    return res;
  }

  function reduire(evts) { return N.reduire(evts, { cle: 'clinique', etat: function () { return { sejours: {}, referentiel: null, referentielsPrecedents: [] }; }, appliquer: appliquer }); }

  // ------------------------------------------------------------ Lecture
  function sejour(st, patientId, sejourId) { return (st && st.sejours && st.sejours[cle(patientId, sejourId)]) || { patientId: patientId, sejour: sejourId, staff: null, historique: [], notes: [] }; }
  /**
   * Séjour précédent renseigné d'un patient (référence : codes CIM et dépendance) : parmi ses séjours (fiche du module
   * Patients, triés par date d'entrée), le plus récent avant `sejourId` qui a une feuille de staff. null sinon.
   */
  function precedent(st, fiche, sejourId) {
    var sj = ((fiche && fiche.sejours) || []).slice().sort(function (a, b) { return String(a.entree || '').localeCompare(String(b.entree || '')); });
    var i = sj.map(function (x) { return x.id; }).indexOf(sejourId), res = null;
    for (var j = (i < 0 ? sj.length : i) - 1; j >= 0; j--) { var x = sejour(st, fiche.id, sj[j].id); if (x.staff) { res = { sejour: sj[j], staff: x.staff }; break; } }
    return res;
  }
  function notesVisibles(x) { return ((x && x.notes) || []).filter(function (n) { return !n.retiree; }).sort(function (a, b) { return String(b.le).localeCompare(String(a.le)); }); }
  function fonctionActive(config) { var V = (typeof self !== 'undefined' && self.SIC && self.SIC.validations) || null; return !V || !config || V.actif(config, 'dossier-clinique'); }

  // ------------------------------------------------------------ Contrôles
  function controler(type, d, ctx) {
    var cfg = (ctx && ctx.config) || null, c = ctx && ctx.compte, st = (ctx && ctx.etat) || { sejours: {} };
    if (type === 'CLINIQUE_REFERENTIEL') {
      // Préparée même si la fonction est encore désactivée (l'établissement importe la liste avant de l'activer)
      if (d.retirer) { if (!st.referentiel) throw new Error('Aucune liste de codes CIM à retirer.'); return; }
      if (!texte(d.piece) || !(+d.nombre > 0)) throw new Error('Liste de codes CIM vide ou fichier manquant.');
      return;
    }
    if (cfg && !fonctionActive(cfg)) throw new Error('Données cliniques du séjour : fonction désactivée par l’établissement (onglet « Validations »).');
    if (!d.patientId || !d.sejour) throw new Error('Patient ou séjour manquant.');
    if (type === 'CLINIQUE_STAFF') {
      (Array.isArray(d.cim) ? d.cim : []).forEach(function (x) { if (x && texte(x.libelle) && !texte(x.code)) throw new Error('Code CIM manquant pour « ' + texte(x.libelle, 40) + ' ».'); });
      Object.keys(d.avq || {}).forEach(function (k) { var n = (d.avq || {})[k]; if (!AVQ.some(function (v) { return v.code === k; })) throw new Error('Variable de dépendance inconnue.'); if (n !== null && n !== '' && !(Math.round(+n) >= 1 && Math.round(+n) <= 4)) throw new Error('Cotation de la dépendance : de 1 à 4.'); });
      return;
    }
    if (type === 'CLINIQUE_NOTE') { if (!d.id || !long(d.texte)) throw new Error('Écrivez la note.'); return; }
    if (type === 'CLINIQUE_NOTE_RETRAIT') {
      var n = sejour(st, d.patientId, d.sejour).notes.filter(function (y) { return y.id === d.id; })[0];
      if (!n) throw new Error('Note introuvable.');
      if (n.retiree) throw new Error('Note déjà retirée.');
      if (c && n.par !== c.id && (c.roles || []).indexOf('CADRE') < 0) throw new Error('Seul l’auteur (ou le cadre) retire une note.');
      if (!texte(d.motif)) throw new Error('Indiquez le motif du retrait (la note est masquée, jamais effacée).');
    }
  }

  // ------------------------------------------------------------ Droits et contrat
  var ACCES = [
    { code: 'clinique.consulter', libelle: 'Consulter les données cliniques du séjour (feuille de staff, notes)', types: [LECTURE] },
    { code: 'clinique.staff', libelle: 'Renseigner la feuille de staff clinique (codes CIM, motif, projet thérapeutique, dépendance)', types: [LECTURE, 'CLINIQUE_STAFF'] },
    { code: 'clinique.notes', libelle: 'Écrire et retirer ses notes cliniques', types: [LECTURE, 'CLINIQUE_NOTE', 'CLINIQUE_NOTE_RETRAIT'] }
  ];
  var TOUT = [LECTURE].concat(TYPES_SEJOUR);
  var DROITS = { IDE: TOUT, CADRE: TOUT, MEDECIN: TOUT, MEDECIN_CHEF_SERVICE: TOUT, MEDECIN_CHEF_POLE: TOUT };
  var D = Droits.creer({
    roles: M.ROLES, rolesDeService: M.ROLES_DE_SERVICE, droits: DROITS, acces: ACCES, typesAdmin: ['CLINIQUE_REFERENTIEL'], rolesFournis: M.ROLES_FOURNIS,
    ongletsMasquables: [], rolesJournalComplet: ['CADRE'], module: 'clinique', rolesEncadrement: ['CADRE'],
    lireAcces: function (r) { return r.accesModules ? r.accesModules.clinique : undefined; },
    appartenance: 'acces'
  });
  function cibles(st, e) { var d = (e && e.data) || {}, x = st && st.sejours ? st.sejours[cle(d.patientId, d.sejour)] : null; var sv = d.service || (x && x.service); return sv ? [sv] : []; }
  var contrat = {
    id: 'clinique',
    libelle: 'Données cliniques',
    version: '0.1.0',
    icone: 'CL',
    acces: ACCES,
    droits: D,
    clesBrisDeGlace: true,   // clé remise aussi aux rôles qui peuvent recourir au bris de glace (acces-clinique.js)
    saisies: { types: TYPES, champ: function () { return null; }, cibles: cibles, reduire: reduire, controler: controler, services: cibles },
    reglages: { defaut: {}, groupes: [], exclus: [] },
    vues: { onglets: [{ code: 'staff', libelle: 'Feuille de staff clinique' }] },
    migrations: [],
    fournitures: [{ nom: 'clinique.staff', version: 1, acces: 'lecture', champs: ['cim', 'motif', 'projet', 'avq', 'score'], lire: function (st, o) { var x = sejour(st, o.patientId, o.sejour); return x.staff ? Object.assign({}, x.staff, { score: score(x.staff.avq) }) : null; } }],
    besoins: []
  };
  registre.declarer(contrat);
  return { contrat: contrat, reduire: reduire, separerCim: separerCim, droits: D, ACCES: ACCES, TYPES: TYPES, LECTURE: LECTURE, AVQ: AVQ, COTES: COTES, score: score, sejour: sejour, precedent: precedent, notesVisibles: notesVisibles,
    fonctionActive: fonctionActive, controler: controler, cle: cle, TYPES_SEJOUR: TYPES_SEJOUR };
});
