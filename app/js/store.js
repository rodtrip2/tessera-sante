// SPDX-License-Identifier: EUPL-1.2
/*
 * Stockage — dossier réseau (API File System Access) ou stockage privé du
 * navigateur (mode démonstration, même API via navigator.storage.getDirectory).
 *
 *   coffre.json                       copies emballées de la clé + comptes chiffrés
 *   evenements/AAAA/MM/JJ/<nom>.enc   une saisie = un fichier chiffré, jamais modifié (dossier du jour depuis la
 *                                     0.33.0 ; les saisies plus anciennes restent dans evenements/AAAA/MM/)
 *   instantanes/AAAA-MM.enc           copie consolidée des saisies d'un mois clos
 *   coffre-historique/rev-N.json      versions du coffre, la dernière comprise (les 30 dernières)
 *   reperes/<agent>.enc               repère d'intégrité : nombre et dernière saisie de chaque agent
 *
 * Instantanés : les saisies sont rangées par mois de saisie. Un mois clos
 * (antérieur au mois précédent) ne reçoit plus de fichiers ; ses saisies sont
 * regroupées dans un instantané, lu en une seule fois au lieu de centaines de
 * petits fichiers. Les fichiers d'origine ne sont jamais supprimés : si un
 * instantané ne couvre pas tous les fichiers du mois, il est complété.
 *
 * Écriture atomique : createWritable() écrit dans un fichier temporaire et ne
 * remplace la cible qu'à la fermeture ; un fichier interrompu n'apparaît jamais.
 */
(function (root) {
  'use strict';
  var SIC = root.SIC = root.SIC || {};
  var C = SIC.crypto;
  // Version bêta ou de développement (canal.js) : réglages du navigateur et stockage de démonstration séparés
  function suffixe() { return SIC.suffixeCanal || ''; }

  // --------------------------------------------- Mémorisation du dossier
  function idb() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('sic-reglages' + suffixe(), 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  async function memoriser(cle, valeur) {
    try {
      var db = await idb();
      await new Promise(function (ok, ko) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(valeur, cle); t.oncomplete = ok; t.onerror = function () { ko(t.error); }; });
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }
  async function relire(cle) {
    try {
      var db = await idb();
      return await new Promise(function (ok) { var r = db.transaction('kv').objectStore('kv').get(cle); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ok(undefined); }; });
    } catch (e) { return undefined; }
  }

  // ---------------------------------------------------------- Le dossier
  function Dossier(handle, mode) {
    this.handle = handle;
    this.mode = mode; // 'reseau' | 'demo'
    this.nom = mode === 'demo' ? 'Stockage de démonstration du navigateur' : handle.name;
  }

  Dossier.choisirReseau = async function () {
    if (!window.showDirectoryPicker) throw new Error("Ce navigateur ne permet pas d'ouvrir un dossier réseau. Utilisez Edge ou Chrome à jour.");
    var h = await window.showDirectoryPicker({ id: 'sic-dossier' + suffixe(), mode: 'readwrite' });
    await Dossier.verifierEssai(h);
    await memoriser('dossier', h);
    await memoriser('mode', 'reseau');
    return new Dossier(h, 'reseau');
  };

  Dossier.demo = async function () {
    if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('Le stockage de démonstration n\'est pas disponible dans ce navigateur.');
    var racine = await navigator.storage.getDirectory();
    var h = await racine.getDirectoryHandle('SuiviIsoCont-demo' + suffixe(), { create: true });
    await memoriser('mode', 'demo');
    return new Dossier(h, 'demo');
  };

  /** Dossier utilisé lors de la dernière session (permission redemandée si nécessaire). */
  Dossier.precedent = async function () {
    var mode = await relire('mode');
    if (mode === 'demo') return { mode: 'demo', nom: 'Stockage de démonstration du navigateur' };
    var h = await relire('dossier');
    if (mode === 'reseau' && h) return { mode: 'reseau', nom: h.name, handle: h };
    return null;
  };

  Dossier.rouvrir = async function (prec) {
    if (prec.mode === 'demo') return Dossier.demo();
    var opts = { mode: 'readwrite' };
    if ((await prec.handle.queryPermission(opts)) !== 'granted' && (await prec.handle.requestPermission(opts)) !== 'granted') {
      throw new Error("L'accès au dossier a été refusé.");
    }
    await Dossier.verifierEssai(prec.handle);
    return new Dossier(prec.handle, 'reseau');
  };

  /**
   * Version bêta ou de développement (13 novembre 2026) : un dossier réseau n'est ouvert que s'il est marqué comme
   * dossier d'essai (fichier ESSAI-LISEZMOI.txt). Un dossier vide est marqué à son premier choix ; un dossier qui
   * contient déjà des données sans ce fichier est refusé : une version d'essai n'écrit jamais dans les données du service.
   * Sans effet sur la version stable.
   */
  Dossier.verifierEssai = async function (handle, canal) {
    canal = canal || SIC.CANAL || 'stable';
    if (canal === 'stable') return 'stable';
    try { await handle.getFileHandle('ESSAI-LISEZMOI.txt'); return 'essai'; } catch (e) { /* absent */ }
    var vide = true;
    for await (var k of handle.keys()) { vide = false; break; }   // eslint-disable-line no-unused-vars
    var lib = canal === 'beta' ? 'version bêta' : 'version de développement';
    if (!vide) throw new Error('Cette ' + lib + ' sert aux essais : elle n’ouvre qu’un dossier d’essai. Ce dossier contient déjà des données et n’est pas marqué comme dossier d’essai : ouvrez-le avec la version stable, ou choisissez un dossier vide (il sera marqué comme dossier d’essai).');
    var f = await handle.getFileHandle('ESSAI-LISEZMOI.txt', { create: true }), w = await f.createWritable();
    await w.write(new TextEncoder().encode('Dossier d’essai de Tessera Santé, créé par la ' + lib + ' le ' + new Date().toISOString().slice(0, 10) + '.\r\nNe pas y mettre de données réelles. La version stable peut l’ouvrir ; les versions bêta et de développement n’ouvrent que les dossiers marqués ainsi.\r\n'));
    await w.close();
    return 'marque';
  };

  /**
   * Verrou du choix du dossier sur ce poste (demande du porteur) : { nom, le, par } ou null. Posé à la connexion quand
   * l'établissement l'a activé ; seul un administrateur (mot de passe ou code de secours vérifiés sur le coffre du
   * dossier verrouillé) peut le lever. Réglage du navigateur : contrainte d'organisation, pas une barrière technique.
   */
  Dossier.lireVerrou = function () { return relire('verrou'); };
  Dossier.ecrireVerrou = function (v) { return memoriser('verrou', v || null); };

  /** Réglages propres à ce poste de travail (navigateur), hors données. */
  Dossier.lireReglage = relire;
  Dossier.ecrireReglage = memoriser;

  /** Signale un dossier sans coffre qui contient pourtant des saisies (jeu de formation, coffre perdu ou illisible). */
  Dossier.prototype.anomalie = async function () {
    try { await this.handle.getFileHandle('FORMATION-LISEZMOI.txt'); return 'formation'; } catch (e) { /* absent */ }
    if (this.coffreIllisible) return 'coffre-illisible';
    for (var i = 0; i < DOSSIERS_JOURNAUX.length; i++) {
      try { await this.handle.getDirectoryHandle(DOSSIERS_JOURNAUX[i]); return 'sans-coffre'; } catch (e) { /* absent */ }
    }
    return null;
  };

  Dossier.oublier = async function () { await memoriser('mode', null); await memoriser('dossier', null); };

  Dossier.prototype.sousDossier = async function (chemin, creer) {
    var h = this.handle;
    for (var i = 0; i < chemin.length; i++) h = await h.getDirectoryHandle(chemin[i], { create: !!creer });
    return h;
  };

  // ------------------------------------------------------------ Journaux (étape 3 du plan d'architecture)
  // Chaque journal est un sous-dossier complet (saisies, repères, instantanés, quarantaine) : socle\ pour le socle,
  // modules\<module>\ pour chaque module. « evenements » à la racine : rangement d'Isocont, repris dans modules\isocont.
  var DOSSIERS_JOURNAUX = ['socle', 'modules', 'evenements'];
  /** Chemin d'un journal depuis la racine des données : ['socle'] ou ['modules', id]. */
  function cheminJournal(nom) { return nom === 'socle' ? ['socle'] : ['modules', nom]; }
  Dossier.cheminJournal = cheminJournal;
  /** Journal `nom` de ce dossier, comme un dossier à part entière ; null s'il n'existe pas encore (`creer` faux). */
  Dossier.prototype.journal = async function (nom, creer) {
    var h;
    try { h = await this.sousDossier(cheminJournal(nom), creer); } catch (e) { if (creer) throw e; return null; }
    var d = new Dossier(h, this.mode === 'reseau' ? 'reseau' : this.mode);
    d.nom = this.nom; d.journalNom = nom; d.prefixe = cheminJournal(nom).join('/') + '/';
    return d;
  };
  /** Journaux présents dans ce dossier : [{ nom, prefixe: 'socle/' | 'modules/<id>/' }]. */
  Dossier.prototype.journauxPresents = async function () {
    var res = [];
    try { await this.handle.getDirectoryHandle('socle'); res.push({ nom: 'socle', prefixe: ['socle'] }); } catch (e) { /* absent */ }
    try {
      var m = await this.handle.getDirectoryHandle('modules');
      for await (var x of m.values()) if (x.kind === 'directory') res.push({ nom: x.name, prefixe: ['modules', x.name] });
    } catch (e) { /* absent */ }
    return res;
  };

  Dossier.prototype.lireFichier = async function (dirHandle, nom) {
    try { var f = await (await dirHandle.getFileHandle(nom)).getFile(); return new Uint8Array(await f.arrayBuffer()); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  };

  Dossier.prototype.ecrireFichier = async function (dirHandle, nom, octets, exclusif) {
    if (exclusif) {
      var existe = true;
      try { await dirHandle.getFileHandle(nom); } catch (e) { existe = false; }
      if (existe) throw new Error('Un fichier de ce nom existe déjà : ' + nom);
    }
    var fh = await dirHandle.getFileHandle(nom, { create: true });
    var w = await fh.createWritable();
    await w.write(octets);
    await w.close();
  };

  // ------------------------------------------------------------- Coffre
  /** Vrai si l'objet a la forme d'un coffre utilisable (au moins un moyen de déblocage et les comptes). */
  function coffreValide(c) {
    return !!(c && c.format === 'SIC-coffre' && Array.isArray(c.emballages) && c.emballages.length && typeof c.comptes === 'string');
  }

  /** Lit le coffre ; un coffre abîmé est signalé (coffreIllisible) et vaut absence de coffre. */
  Dossier.prototype.lireCoffre = async function () {
    var o = await this.lireFichier(this.handle, 'coffre.json');
    this.coffreIllisible = false;
    if (!o) return null;
    try {
      var c = JSON.parse(new TextDecoder().decode(o));
      if (!coffreValide(c)) throw new Error('forme inattendue');
      return c;
    } catch (e) { this.coffreIllisible = true; return null; }
  };

  var HISTORIQUE_COFFRE = 30;

  /**
   * Écrit le coffre si personne ne l'a modifié depuis la lecture (contrôle de révision). La version
   * remplacée est d'abord copiée dans coffre-historique ; le nouveau coffre est vérifié avant et
   * relu après l'écriture, et l'ancienne version est remise en place si la relecture échoue.
   */
  Dossier.prototype.ecrireCoffre = async function (coffre, revAttendue) {
    var actuel = await this.lireCoffre();
    if (this.coffreIllisible) throw new Error('Le coffre actuel est illisible : restaurez une version précédente avant toute modification.');
    if (actuel && actuel.rev !== revAttendue) throw new Error('Le coffre a été modifié sur un autre poste. Rechargez puis recommencez.');
    coffre.rev = (revAttendue || 0) + 1;
    if (!coffreValide(coffre)) throw new Error('Coffre incomplet : écriture refusée.');
    var octets = new TextEncoder().encode(JSON.stringify(coffre, null, 1));
    if (actuel) await this.archiverCoffre(actuel);
    await this.ecrireFichier(this.handle, 'coffre.json', octets);
    var relu = await this.lireCoffre();
    if (!relu || relu.rev !== coffre.rev) {
      if (actuel) await this.ecrireFichier(this.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(actuel, null, 1)));
      throw new Error('L’écriture du coffre n’a pas pu être vérifiée : la version précédente a été remise en place.');
    }
    // La version qui vient d'être écrite est aussi copiée : l'historique contient toujours la dernière version valide.
    try { await this.archiverCoffre(coffre); } catch (e) { /* sans conséquence sur l'écriture */ }
    return coffre;
  };

  /** Copie une version du coffre dans coffre-historique (les plus anciennes au-delà de 30 sont retirées). */
  Dossier.prototype.archiverCoffre = async function (coffre) {
    var dir = await this.sousDossier(['coffre-historique'], true);
    var nom = 'rev-' + String(coffre.rev || 0).padStart(6, '0') + '.json';
    await this.ecrireFichier(dir, nom, new TextEncoder().encode(JSON.stringify(Object.assign({}, coffre, { archiveLe: new Date().toISOString() }), null, 1)));
    var noms = [];
    for await (var f of dir.values()) if (f.kind === 'file' && /^rev-\d+\.json$/.test(f.name)) noms.push(f.name);
    noms.sort();
    for (var i = 0; i < noms.length - HISTORIQUE_COFFRE; i++) { try { await dir.removeEntry(noms[i]); } catch (e) { /* sans conséquence */ } }
  };

  /** Versions précédentes du coffre : [{ nom, rev, archiveLe, valide }], la plus récente d'abord. */
  Dossier.prototype.versionsCoffre = async function () {
    var res = [], dir;
    try { dir = await this.sousDossier(['coffre-historique'], false); } catch (e) { return res; }
    for await (var f of dir.values()) {
      if (f.kind !== 'file' || !/^rev-\d+\.json$/.test(f.name)) continue;
      var c = null;
      try { c = JSON.parse(new TextDecoder().decode(await this.lireFichier(dir, f.name))); } catch (e) { c = null; }
      res.push({ nom: f.name, rev: c ? c.rev : null, archiveLe: c ? c.archiveLe : null, valide: coffreValide(c), coffre: c });
    }
    return res.sort(function (a, b) { return a.nom < b.nom ? 1 : -1; });
  };

  /**
   * Remet en place un coffre (version de l'historique ou copie sous scellé), sans contrôle de révision :
   * réservé au cas où le coffre actuel est absent ou illisible. La révision repart au-dessus de toutes
   * les versions connues.
   */
  Dossier.prototype.restaurerCoffre = async function (coffre) {
    if (!coffreValide(coffre)) throw new Error('Ce fichier n’est pas un coffre utilisable.');
    var actuel = await this.lireCoffre();
    if (actuel) throw new Error('Le dossier contient déjà un coffre lisible : restauration inutile.');
    var versions = await this.versionsCoffre();
    var max = versions.reduce(function (m, v) { return Math.max(m, v.rev || 0); }, coffre.rev || 0);
    var c = Object.assign({}, coffre, { rev: max + 1, restaureLe: new Date().toISOString() });
    delete c.archiveLe;
    await this.ecrireFichier(this.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(c, null, 1)));
    var relu = await this.lireCoffre();
    if (!relu) throw new Error('La restauration du coffre a échoué.');
    return relu;
  };

  // ------------------------------------------------- Copie de sauvegarde complète
  /** Fichiers d'un sous-dossier, récursivement : [{ chemin, octets }]. */
  async function fichiers(dir, prefixe, res) {
    for await (var x of dir.values()) {
      if (x.kind === 'directory') await fichiers(x, prefixe + x.name + '/', res);
      else res.push({ chemin: prefixe + x.name, octets: new Uint8Array(await (await x.getFile()).arrayBuffer()) });
    }
    return res;
  }

  /**
   * Copie de sauvegarde complète : coffre et fichiers de saisie de chaque journal (socle, modules), toujours chiffrés,
   * copiés tels quels. Les instantanés (reconstruits automatiquement) et le jeu de formation (fictif) n'y figurent pas.
   */
  Dossier.prototype.copieComplete = async function () {
    var coffre = await this.lireCoffre();
    if (!coffre) throw new Error('Coffre absent ou illisible : copie impossible.');
    var liste = [], journaux = await this.journauxPresents();
    for (var j = 0; j < journaux.length; j++) {
      var pref = journaux[j].prefixe.concat(['evenements']);
      try { await fichiers(await this.sousDossier(pref, false), pref.join('/') + '/', liste); } catch (e) { /* aucun */ }
    }
    // Fichiers de clés des documents (0.34.0) et marques d'effacement : sans eux, les documents seraient illisibles après une restauration
    var docs = [];
    try { await fichiers(await this.sousDossier(['documents-cles'], false), '', docs); } catch (e) { /* aucun document */ }
    return { format: 'SIC-sauvegarde', version: 1, creeLe: new Date().toISOString(), coffre: coffre,
      fichiers: liste.map(function (f) { return { chemin: f.chemin, contenu: C.b64(f.octets) }; }),
      documents: docs.filter(function (f) { return NOM_CLES_DOC.test(f.chemin); }).map(function (f) { return { nom: f.chemin, contenu: C.b64(f.octets) }; }) };
  };

  /** Restaure une copie complète dans un dossier vide. */
  Dossier.prototype.restaurerCopie = async function (copie) {
    if (!copie || copie.format !== 'SIC-sauvegarde' || !coffreValide(copie.coffre) || !Array.isArray(copie.fichiers)) throw new Error('Ce fichier n’est pas une copie de sauvegarde de l’outil.');
    for await (var k of this.handle.keys()) { if (k) throw new Error('Le dossier n’est pas vide : choisissez un dossier vide pour restaurer la copie.'); }
    for (var i = 0; i < copie.fichiers.length; i++) {
      var f = copie.fichiers[i], c = cheminSur(f.chemin);
      if (!c) continue;
      var dir = await this.sousDossier(c.journal.concat(c.parties.slice(0, -1)), true);
      await this.ecrireFichier(dir, c.parties[c.parties.length - 1], C.deb64(f.contenu));
    }
    if (Array.isArray(copie.documents) && copie.documents.length) {
      var dd = await this.sousDossier(['documents-cles'], true);
      for (var k2 = 0; k2 < copie.documents.length; k2++) { var x2 = copie.documents[k2]; if (NOM_CLES_DOC.test(x2.nom || '')) await this.ecrireFichier(dd, x2.nom, C.deb64(x2.contenu)); }
    }
    // Coffre restauré : l'administrateur renouvellera les clés avant toute saisie (trousseau, 0.5.0)
    var coffre = copie.coffre.version === 2 ? Object.assign({}, copie.coffre, { restaureLe: new Date().toISOString() }) : copie.coffre;
    await this.ecrireFichier(this.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(coffre, null, 1)));
    return copie.fichiers.length;
  };

  /**
   * Chemin sûr d'un fichier de saisie : [journal]/evenements/AAAA/MM/nom.enc, où journal est « socle »,
   * « modules/<id> », ou absent (chemin relatif au dossier d'un journal ; dans une copie de sauvegarde : ancien
   * rangement d'Isocont, repris dans modules/isocont). Retourne { journal: [...], parties: [evenements, AAAA, MM, nom] } ou null.
   */
  function cheminSur(chemin, relatif) {
    var p = String(chemin || '').split('/');
    if (p.some(function (x) { return !x || x === '..' || x === '.'; })) return null;
    var journal = p[0] === 'socle' ? p.slice(0, 1) : p[0] === 'modules' && /^[a-z][a-z0-9-]{1,30}$/.test(p[1] || '') ? p.slice(0, 2) : [];
    var parties = p.slice(journal.length);
    // Dossier du mois (avant la 0.33.0) ou du jour : evenements/AAAA/MM[/JJ]/nom.enc
    var jour = parties.length === 5;
    if (!((parties.length === 4 || jour) && parties[0] === 'evenements' && /^\d{4}$/.test(parties[1]) && /^\d{2}$/.test(parties[2]) && (!jour || /^\d{2}$/.test(parties[3])) && /\.enc$/.test(parties[parties.length - 1]))) return null;
    if (!journal.length && !relatif) journal = ['modules', 'isocont'];
    return { journal: journal, parties: parties };
  }

  /**
   * Met un fichier de saisie à l'écart dans quarantaine/AAAA/MM (copie relue, puis retrait du dossier
   * en service). Rien n'est supprimé : le service informatique peut l'examiner ou le restaurer.
   */
  Dossier.prototype.mettreEnQuarantaine = async function (chemin) {
    var c = cheminSur(chemin, true);
    if (!c) throw new Error('Chemin de fichier inattendu : ' + chemin);
    var parties = c.parties, j = c.journal;   // quarantaine du journal concerné
    var source = await this.sousDossier(j.concat(parties.slice(0, -1)), false), nom = parties[parties.length - 1];
    var octets = await this.lireFichier(source, nom);
    if (!octets) throw new Error('Fichier introuvable : ' + chemin);
    var sous = ['quarantaine'].concat(parties.slice(1, -1));
    var dest = await this.sousDossier(j.concat(sous), true);
    await this.ecrireFichier(dest, nom, octets);
    var relu = await this.lireFichier(dest, nom);
    if (!relu || relu.length !== octets.length) throw new Error('La copie en quarantaine n’a pas pu être vérifiée : le fichier est laissé en place.');
    await source.removeEntry(nom);
    return j.concat(sous, [nom]).join('/');
  };

  /**
   * Réparation depuis une copie de sauvegarde complète : ne remet que les fichiers de saisie absents du
   * dossier en service ou illisibles (`illisibles` : Set de noms), jamais un fichier présent et lisible.
   * `verifier(nom, octets)` doit confirmer que le fichier de la copie s'ouvre avec la clé actuelle.
   * Un fichier illisible remplacé est d'abord mis en quarantaine.
   * Retourne { remis: [chemin], invalides: [chemin], dejaPresents: n }.
   */
  Dossier.prototype.reparerDepuisCopie = async function (copie, illisibles, verifier) {
    if (!copie || copie.format !== 'SIC-sauvegarde' || !Array.isArray(copie.fichiers)) throw new Error('Ce fichier n’est pas une copie de sauvegarde de l’outil.');
    var res = { remis: [], invalides: [], dejaPresents: 0 }, presents = new Set();
    var journaux = await this.journauxPresents();
    for (var k = 0; k < journaux.length; k++) {
      var dj = await this.journal(journaux[k].nom, false);
      if (dj) (await dj.nomsEvenements()).forEach(function (n) { presents.add(n); });
    }
    illisibles = illisibles || new Set();
    for (var i = 0; i < copie.fichiers.length; i++) {
      var f = copie.fichiers[i], c = cheminSur(f.chemin);
      if (!c) continue;
      var parties = c.parties, nom = parties[parties.length - 1], chemin = c.journal.concat(parties).join('/');
      if (presents.has(nom) && !illisibles.has(nom)) { res.dejaPresents++; continue; }
      var octets;
      try { octets = C.deb64(f.contenu); if (!(await verifier(nom, octets))) throw new Error('contenu inattendu'); }
      catch (e) { res.invalides.push(f.chemin); continue; }
      if (presents.has(nom)) { try { await this.mettreEnQuarantaine(chemin); } catch (e) { res.invalides.push(f.chemin); continue; } }
      var dir = await this.sousDossier(c.journal.concat(parties.slice(0, -1)), true);
      await this.ecrireFichier(dir, nom, octets);
      res.remis.push(chemin);
    }
    return res;
  };

  /** Noms des fichiers de saisie présents sur le partage. */
  Dossier.prototype.nomsEvenements = async function () {
    var noms = new Set(), racine;
    try { racine = await this.sousDossier(['evenements'], false); } catch (e) { return noms; }
    for await (var an of racine.values()) {
      if (an.kind !== 'directory') continue;
      for await (var mois of an.values()) {
        if (mois.kind !== 'directory') continue;
        for await (var f of mois.values()) {
          if (f.kind === 'file' && /\.enc$/.test(f.name)) noms.add(f.name);
          else if (f.kind === 'directory' && /^\d{2}$/.test(f.name)) for await (var g of f.values()) if (g.kind === 'file' && /\.enc$/.test(g.name)) noms.add(g.name);
        }
      }
    }
    return noms;
  };

  // ------------------------------------------------------ Repères d'intégrité
  /** Repère d'un agent : nombre de ses saisies et identifiant de la dernière (chiffré). */
  Dossier.prototype.ecrireRepere = async function (cle, agent, repere) {
    var dir = await this.sousDossier(['reperes'], true), nom = agent.replace(/[^a-zA-Z0-9_-]/g, '_') + '.enc';
    await this.ecrireFichier(dir, nom, await C.chiffrerJSON(cle, Object.assign({ agent: agent }, repere), 'repere:' + nom));
  };

  /** Repère d'un agent, ou null (absent ou illisible). */
  Dossier.prototype.lireRepere = async function (cle, agent) {
    try {
      var dir = await this.sousDossier(['reperes'], false), nom = agent.replace(/[^a-zA-Z0-9_-]/g, '_') + '.enc';
      var o = await this.lireFichier(dir, nom);
      return o ? await C.dechiffrerJSON(cle, o, 'repere:' + nom) : null;
    } catch (e) { return null; }
  };

  // ------------------------------------------------------ Dossier des exports
  /** Chemin relatif sûr (« exports », « exports/2026 »…) : segments simples, jamais « .. ». */
  function cheminExport(chemin) {
    var parties = String(chemin || '').replace(/\\/g, '/').split('/').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parties.length || parties.some(function (x) { return x === '.' || x === '..' || !/^[\p{L}\p{N}_ .()'-]{1,60}$/u.test(x); })) return null;
    return parties;
  }
  var RESERVES = ['evenements', 'instantanes', 'coffre-historique', 'reperes', 'quarantaine', 'preferences', 'formation', 'socle', 'modules', 'documents-cles', 'documents-presence'];

  /**
   * Enregistre un fichier exporté (PDF, CSV…) dans le dossier des exports, sous-dossier `categorie`.
   * Un fichier de même nom n'est jamais écrasé (suffixe -2, -3…). Retourne le chemin relatif écrit.
   */
  Dossier.prototype.ecrireExport = async function (dossierExports, categorie, nom, octets) {
    var base = cheminExport(dossierExports);
    if (!base) throw new Error('Dossier des exports mal défini : « ' + dossierExports + ' ».');
    if (RESERVES.indexOf(base[0].toLowerCase()) >= 0) throw new Error('Le dossier des exports ne peut pas être un dossier réservé de l’outil (« ' + base[0] + ' »).');
    var sous = Array.isArray(categorie) ? categorie : (categorie ? [categorie] : []);
    if (sous.some(function (x) { return !cheminExport(x) || cheminExport(x).length !== 1; })) throw new Error('Sous-dossier d’export inattendu.');
    var chemin = base.concat(sous);
    var dir = await this.sousDossier(chemin, true);
    var propre = String(nom).replace(/[\\/:*?"<>|]+/g, '_');
    var point = propre.lastIndexOf('.'), racine = point > 0 ? propre.slice(0, point) : propre, ext = point > 0 ? propre.slice(point) : '';
    var final = propre, k = 2;
    while (await this.lireFichier(dir, final)) final = racine + '-' + k++ + ext;
    await this.ecrireFichier(dir, final, octets, true);
    return chemin.concat([final]).join('/');
  };

  /** Fichiers du dossier des exports : [{ chemin, nom, categorie, taille, modifieLe }], les plus récents d'abord. */
  Dossier.prototype.listerExports = async function (dossierExports) {
    var base = cheminExport(dossierExports), res = [];
    if (!base) return res;
    var racine;
    try { racine = await this.sousDossier(base, false); } catch (e) { return res; }
    async function parcourir(dir, prefixe) {
      for await (var x of dir.values()) {
        if (x.kind === 'directory') await parcourir(x, prefixe.concat([x.name]));
        else { var f = await x.getFile(); res.push({ chemin: base.concat(prefixe, [x.name]).join('/'), nom: x.name, categorie: prefixe.join('/'), taille: f.size, modifieLe: f.lastModified }); }
      }
    }
    await parcourir(racine, []);
    return res.sort(function (a, b) { return b.modifieLe - a.modifieLe; });
  };

  async function fichierExport(d, chemin) {
    var parties = cheminExport(chemin);
    if (!parties || parties.length < 2) throw new Error('Chemin inattendu : ' + chemin);
    return { dir: await d.sousDossier(parties.slice(0, -1), false), nom: parties[parties.length - 1] };
  }
  Dossier.prototype.lireExport = async function (chemin) {
    var x = await fichierExport(this, chemin);
    var o = await this.lireFichier(x.dir, x.nom);
    if (!o) throw new Error('Fichier introuvable : ' + chemin);
    return o;
  };
  Dossier.prototype.supprimerExport = async function (chemin) {
    var x = await fichierExport(this, chemin);
    await x.dir.removeEntry(x.nom);
  };
  SIC.cheminExport = cheminExport;

  // ------------------------------------------------------ Pièces jointes (Messagerie, 0.23.0)
  /**
   * Fichier joint, chiffré par la clé du journal, rangé à part des saisies : pieces/<id>.enc (jamais modifié). Le nom,
   * le type et la taille restent dans la saisie qui le cite ; le fichier n'est lu qu'à l'ouverture.
   */
  function nomPiece(id) { if (!/^PJ[0-9a-f]{8,32}$/.test(id || '')) throw new Error('Identifiant de pièce jointe invalide.'); return id + '.enc'; }
  Dossier.prototype.ecrirePiece = async function (cle, id, octets) {
    var dir = await this.sousDossier(['pieces'], true), nom = nomPiece(id);
    await this.ecrireFichier(dir, nom, await C.chiffrerOctets(cle, octets, 'piece:' + nom), true);
  };
  Dossier.prototype.lirePiece = async function (cle, id) {
    var nom = nomPiece(id), dir;
    try { dir = await this.sousDossier(['pieces'], false); } catch (e) { return null; }
    var o = await this.lireFichier(dir, nom);
    return o ? C.dechiffrerOctets(cle, o, 'piece:' + nom) : null;
  };

  // ------------------------------------------------------ Préférences d'un agent
  /** Préférences d'affichage d'un agent (thème…), chiffrées, une par agent : preferences/<agent>.enc. */
  Dossier.prototype.ecrirePreferences = async function (cle, agent, prefs) {
    var dir = await this.sousDossier(['preferences'], true), nom = agent.replace(/[^a-zA-Z0-9_-]/g, '_') + '.enc';
    await this.ecrireFichier(dir, nom, await C.chiffrerJSON(cle, Object.assign({}, prefs, { agent: agent }), 'pref:' + nom));
  };

  Dossier.prototype.lirePreferences = async function (cle, agent) {
    try {
      var dir = await this.sousDossier(['preferences'], false), nom = agent.replace(/[^a-zA-Z0-9_-]/g, '_') + '.enc';
      var o = await this.lireFichier(dir, nom);
      var p = o ? await C.dechiffrerJSON(cle, o, 'pref:' + nom) : null;
      return p && p.agent === agent ? p : {};
    } catch (e) { return {}; }
  };

  Dossier.prototype.lireReperes = async function (cle) {
    var res = [], dir;
    try { dir = await this.sousDossier(['reperes'], false); } catch (e) { return res; }
    for await (var f of dir.values()) {
      if (f.kind !== 'file' || !/\.enc$/.test(f.name)) continue;
      try { res.push(await C.dechiffrerJSON(cle, await this.lireFichier(dir, f.name), 'repere:' + f.name)); }
      catch (e) { res.push({ agent: f.name.replace(/\.enc$/, ''), illisible: true }); }
    }
    return res;
  };

  // ---------------------------------------------------------- Clés des documents (0.34.0)
  /*
   * Un fichier par document : la clé du document (une par génération) emballée pour chaque clé de partage, avec les
   * parties publiques attestées. Effacement (corbeille échue) : le fichier est supprimé et une marque « .efface » le
   * remplace, pour que le dossier de secours ne le recopie pas ; les versions du journal deviennent illisibles.
   */
  var NOM_CLES_DOC = /^DC[0-9a-f]{8,32}\.(json|efface)$/;
  function nomClesDoc(id, ext) { var n = id + '.' + (ext || 'json'); if (!NOM_CLES_DOC.test(n)) throw new Error('Identifiant de document invalide.'); return n; }
  Dossier.prototype.ecrireClesDocument = async function (id, objet) {
    var dir = await this.sousDossier(['documents-cles'], true);
    if (await this.lireFichier(dir, nomClesDoc(id, 'efface'))) throw new Error('Document effacé.');
    await this.ecrireFichier(dir, nomClesDoc(id), new TextEncoder().encode(JSON.stringify(objet)));
  };
  Dossier.prototype.lireClesDocument = async function (id) {
    var dir; try { dir = await this.sousDossier(['documents-cles'], false); } catch (e) { return null; }
    var o = await this.lireFichier(dir, nomClesDoc(id));
    try { return o ? JSON.parse(new TextDecoder().decode(o)) : null; } catch (e) { return null; }
  };
  Dossier.prototype.effacerClesDocument = async function (id) {
    var dir = await this.sousDossier(['documents-cles'], true);
    await this.ecrireFichier(dir, nomClesDoc(id, 'efface'), new TextEncoder().encode(JSON.stringify({ efface: new Date().toISOString() })));
    try { await dir.removeEntry(nomClesDoc(id)); } catch (e) { /* déjà absent */ }
  };

  /**
   * Présence sur un document (0.37.0) : `documents-presence/<document>.<agent>.json`, réécrit toutes les quelques secondes
   * par le poste qui a le document ouvert et retiré à la fermeture ; contenu chiffré par la clé du document. Ni copié par
   * le miroir, ni gardé dans les sauvegardes (information de l'instant).
   */
  var NOM_PRESENCE = /^(DC[0-9a-f]{8,32})\.([A-Za-z0-9_-]{1,60})\.json$/;
  Dossier.prototype.ecrirePresence = async function (id, agent, objet) {
    var n = id + '.' + agent + '.json'; if (!NOM_PRESENCE.test(n)) throw new Error('Présence : nom invalide.');
    await this.ecrireFichier(await this.sousDossier(['documents-presence'], true), n, new TextEncoder().encode(JSON.stringify(objet)));
  };
  Dossier.prototype.lirePresences = async function (id) {
    var dir; try { dir = await this.sousDossier(['documents-presence'], false); } catch (e) { return []; }
    var res = [];
    for await (var h of dir.values()) {
      var m = h.kind === 'file' && NOM_PRESENCE.exec(h.name);
      if (!m || m[1] !== id) continue;
      try { var f = await h.getFile(), o = JSON.parse(new TextDecoder().decode(new Uint8Array(await f.arrayBuffer()))); res.push({ agent: m[2], modifie: f.lastModified, objet: o }); } catch (e) { /* fichier en cours d'écriture */ }
    }
    return res;
  };
  Dossier.prototype.retirerPresence = async function (id, agent) {
    try { var dir = await this.sousDossier(['documents-presence'], false); await dir.removeEntry(id + '.' + agent + '.json'); } catch (e) { /* déjà absent */ }
  };

  // ---------------------------------------------------------- Événements
  function horodatageCompact(iso) { return iso.replace(/[-:]/g, '').replace(/\.\d+/, ''); }

  /**
   * Rangement par jour (0.33.0, décision du porteur du 12 novembre 2026, bascule automatique) : evenements/AAAA/MM/JJ/
   * d'après l'horodatage de la saisie (UTC). Les saisies déjà écrites ne sont jamais déplacées (journal en ajout seul) :
   * la lecture prend les deux rangements.
   */
  Dossier.prototype.ecrireEvenement = async function (cle, evt) {
    var mois = evt.at.slice(0, 10).split('-');
    var dir = await this.sousDossier(['evenements', mois[0], mois[1], mois[2]], true);
    var nom = evt.id + '.enc';
    var octets = await C.chiffrerJSON(cle, evt, 'evt:' + nom);
    await this.ecrireFichier(dir, nom, octets, true);
    return nom;
  };

  function moisClos(cle, maintenant) {
    var d = new Date(maintenant); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    return cle < d.toISOString().slice(0, 7);
  }

  /** Raison lisible d'un échec de lecture d'une saisie (diagnostic d'intégrité). */
  function diagnosticLecture(err, taille) {
    if (taille === 0) return 'fichier vide (0 octet) : écriture interrompue, ou fichier remplacé par un service de synchronisation (OneDrive, Google Drive…)';
    if (taille != null && taille < 40) return 'fichier tronqué (' + taille + ' octets)';
    var m = (err && (err.name + ' ' + err.message)) || String(err);
    if (/nom incohérent/.test(m)) return 'contenu d’une autre saisie (fichier renommé ou copié sous un autre nom)';
    if (/OperationError|decrypt|déchiffr/i.test(m)) return 'déchiffrement impossible (' + taille + ' octets) : fichier modifié, chiffré avec une autre clé, ou contenu remplacé';
    if (/NotReadable|NotAllowed|Security/i.test(m)) return 'lecture refusée par le système (' + m.trim() + ') : fichier verrouillé, hors ligne ou en cours de synchronisation';
    return m.trim() + (taille != null ? ' (' + taille + ' octets)' : '');
  }

  async function lireEvenement(cle, fichier) {
    var octets = new Uint8Array(await (await fichier.getFile()).arrayBuffer());
    var e = await C.dechiffrerJSON(cle, octets, 'evt:' + fichier.name);
    if (e.id + '.enc' !== fichier.name) throw new Error('nom incohérent');
    return e;
  }

  /**
   * Lit les saisies absentes de `connus` (noms de fichiers déjà chargés) :
   * instantané du mois s'il existe, puis fichiers individuels restants.
   * Écrit les instantanés manquants ou incomplets des mois clos.
   * `options.recents` (0.21.1, test de charge) : seuls le mois en cours et le mois précédent sont parcourus ; les mois
   * clos, dont la liste des fichiers ne change plus en temps normal, sont parcourus par la lecture complète (connexion,
   * puis à intervalle régulier), qui rattrape une saisie arrivée tard (poste hors réseau, dossier de secours).
   */
  Dossier.prototype.lireNouveaux = async function (cle, connus, options) {
    var res = { evenements: [], rejetes: [], instantanes: 0 };
    var racine;
    try { racine = await this.sousDossier(['evenements'], false); } catch (e) { return res; }
    var maintenant = Date.now();
    // Lecture rapide : jours d'avant-hier à aujourd'hui (UTC) ; une saisie arrivée plus tard (poste hors réseau) est
    // rattrapée par la lecture complète, comme pour les mois clos
    var limiteJours = new Date(maintenant - 2 * 864e5).toISOString().slice(0, 10);
    // Parcours interrompu (dossier modifié pendant la lecture par une saisie d'un autre poste, partage momentanément
    // indisponible) : les saisies déjà lues sont rendues avec `interrompu`, jamais perdues (elles sont déjà dans
    // `connus`) ; le reste est lu à la synchronisation suivante.
    try { await parcourirMois(this); } catch (e) { res.interrompu = (e && (e.name + ' ' + e.message)) || String(e); }
    return res;
    async function parcourirMois(dossier) {
    for await (var an of racine.values()) {
      if (an.kind !== 'directory') continue;
      for await (var mois of an.values()) {
        if (mois.kind !== 'directory') continue;
        var cleMois = an.name + '-' + mois.name;
        if (options && options.recents && moisClos(cleMois, maintenant)) continue;
        // Fichiers du mois (ancien rangement) et des dossiers du jour ; lecture rapide : jours récents seulement
        var fichiers = [], chemins = {}, base = 'evenements/' + an.name + '/' + mois.name + '/';
        for await (var f of mois.values()) {
          if (f.kind === 'file' && /\.enc$/.test(f.name)) { fichiers.push(f); chemins[f.name] = base + f.name; }
          else if (f.kind === 'directory' && /^\d{2}$/.test(f.name)) {
            if (options && options.recents && cleMois + '-' + f.name < limiteJours) continue;
            for await (var g of f.values()) if (g.kind === 'file' && /\.enc$/.test(g.name)) { fichiers.push(g); chemins[g.name] = base + f.name + '/' + g.name; }
          }
        }
        var nouveaux = fichiers.filter(function (x) { return !connus.has(x.name); });
        if (!nouveaux.length) continue;
        var clos = moisClos(cleMois, maintenant) && !(options && options.sansInstantanes);
        var duMois = {}, rejetsMois = 0;
        if (clos) {
          var snap = await dossier.lireInstantane(cle, cleMois);
          if (snap) snap.evenements.forEach(function (e) { duMois[e.id + '.enc'] = e; });
        }
        for (var i = 0; i < fichiers.length; i++) {
          var nom = fichiers[i].name;
          if (duMois[nom] || connus.has(nom)) continue; // déjà lu (instantané ou session en cours)
          try { duMois[nom] = await lireEvenement(cle, fichiers[i]); }
          catch (err) {
            rejetsMois++;
            var taille = null; try { taille = (await fichiers[i].getFile()).size; } catch (e2) { /* taille inconnue */ }
            res.rejetes.push({ nom: nom, chemin: chemins[nom], raison: diagnosticLecture(err, taille), taille: taille });
          }
        }
        // Un fichier illisible n'est pas marqué comme connu : il est relu à la synchronisation suivante
        // (un échec passager — réseau, fichier en cours de synchronisation — ne doit pas masquer une saisie).
        nouveaux.forEach(function (x) {
          if (!duMois[x.name]) return;
          connus.add(x.name);
          res.evenements.push(duMois[x.name]);
        });
        // Instantané : seulement si tous les fichiers du mois sont lisibles et en main.
        if (clos && !rejetsMois && fichiers.every(function (x) { return duMois[x.name]; })) {
          var evts = fichiers.map(function (x) { return duMois[x.name]; });
          if (!snap || snap.evenements.length !== evts.length) {
            try { await dossier.ecrireInstantane(cle, cleMois, evts); res.instantanes++; } catch (err) { /* sans conséquence */ }
          }
        }
      }
    }
    }
  };

  Dossier.prototype.lireInstantane = async function (cle, cleMois) {
    try {
      var dir = await this.sousDossier(['instantanes'], false);
      var o = await this.lireFichier(dir, cleMois + '.enc');
      if (!o) return null;
      var snap = await C.dechiffrerJSON(cle, o, 'snap:' + cleMois);
      return snap && snap.mois === cleMois && Array.isArray(snap.evenements) ? snap : null;
    } catch (e) { return null; }
  };

  Dossier.prototype.ecrireInstantane = async function (cle, cleMois, evts) {
    var dir = await this.sousDossier(['instantanes'], true);
    var octets = await C.chiffrerJSON(cle, { mois: cleMois, creeLe: new Date().toISOString(), evenements: evts }, 'snap:' + cleMois);
    await this.ecrireFichier(dir, cleMois + '.enc', octets);
  };

  Dossier.prototype.vider = async function () {
    for await (var k of this.handle.keys()) await this.handle.removeEntry(k, { recursive: true });
  };

  // ---------------------------------------- Dossier de secours (miroir) et déplacement des données
  // Demande du porteur : un second dossier, sur un autre serveur, tenu à jour par les postes qui y sont reliés ;
  // déplacement des données vers un nouveau dossier. Les saisies (fichiers jamais modifiés) sont réunies dans les
  // deux sens ; le coffre retenu est celui de plus haute révision ; les autres fichiers, le plus récent.
  var INSTANTANES = ['instantanes', 'socle/instantanes', 'modules/*/instantanes'];
  var EXCLUS_MIROIR = INSTANTANES.concat(['formation', 'modules/*/formation', 'exports', 'documents-presence']);
  function exclu(chemin, exclus) {
    var p = chemin.split('/');
    return exclus.some(function (e) { var q = e.split('/'); return q.length === p.length && q.every(function (x, i) { return x === '*' || x === p[i]; }); });
  }
  var FICHIERS_RACINE = ['coffre.json'];

  /** Inventaire d'un dossier : { chemin: { fichier (handle), parent (handle dossier), nom } }. */
  async function inventaire(racine, exclus, fichiersRacine) {
    var res = {};
    async function parcourir(dir, prefixe, niveau) {
      for await (var x of dir.values()) {
        if (x.kind === 'directory') {
          if (exclu(prefixe + x.name, exclus)) continue;
          await parcourir(x, prefixe + x.name + '/', niveau + 1);
        } else if (niveau > 0 || !fichiersRacine || fichiersRacine.indexOf(x.name) >= 0) {
          res[prefixe + x.name] = { fichier: x, parent: dir, nom: x.name };
        }
      }
    }
    await parcourir(racine, '', 0);
    return res;
  }
  async function dossierDe(racine, chemin) {
    var parties = chemin.split('/').slice(0, -1), h = racine;
    for (var i = 0; i < parties.length; i++) h = await h.getDirectoryHandle(parties[i], { create: true });
    return h;
  }
  function memesOctets(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  async function copier(entree, cibleRacine, chemin) {
    var octets = new Uint8Array(await (await entree.fichier.getFile()).arrayBuffer());
    var dir = await dossierDe(cibleRacine, chemin), nom = chemin.split('/').pop();
    var w = await (await dir.getFileHandle(nom, { create: true })).createWritable();
    await w.write(octets); await w.close();
    return octets.length;
  }

  /** Rôle d'un dossier dans le couple principal / secours, ou dossier abandonné après un déplacement. */
  Dossier.prototype.lireEtatMiroir = async function () {
    var o = await this.lireFichier(this.handle, 'miroir-etat.json');
    try { return o ? JSON.parse(new TextDecoder().decode(o)) : null; } catch (e) { return null; }
  };
  Dossier.prototype.ecrireEtatMiroir = function (etat) {
    return this.ecrireFichier(this.handle, 'miroir-etat.json', new TextEncoder().encode(JSON.stringify(etat, null, 1)));
  };
  Dossier.prototype.lireDeplacement = async function () {
    var o = await this.lireFichier(this.handle, 'deplace.json');
    try { return o ? JSON.parse(new TextDecoder().decode(o)) : null; } catch (e) { return { vers: '?', le: null }; }
  };

  /**
   * Synchronise ce dossier (principal) avec `autre` (secours), dans les deux sens.
   * Retourne { versAutre, depuisAutre, octets, coffre: 'egal'|'vers'|'depuis'|'conflit'|null }.
   */
  Dossier.prototype.synchroniserAvec = async function (autre, options) {
    options = options || {};
    var a = await inventaire(this.handle, EXCLUS_MIROIR, FICHIERS_RACINE), b = await inventaire(autre.handle, EXCLUS_MIROIR, FICHIERS_RACINE);
    var res = { versAutre: 0, depuisAutre: 0, octets: 0, coffre: null };
    var chemins = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !a[k]; }));
    for (var i = 0; i < chemins.length; i++) {
      var c = chemins[i], x = a[c], y = b[c];
      if (c === 'coffre.json') continue;
      // Clés d'un document effacé (0.34.0) : supprimées des deux côtés, jamais recopiées depuis l'autre dossier
      var ke = /^documents-cles\/(DC[0-9a-f]{8,32})\.json$/.exec(c);
      if (ke && (a['documents-cles/' + ke[1] + '.efface'] || b['documents-cles/' + ke[1] + '.efface'])) {
        if (x) await x.parent.removeEntry(x.nom); if (y) await y.parent.removeEntry(y.nom);
        continue;
      }
      if (x && !y) { res.octets += await copier(x, autre.handle, c); res.versAutre++; continue; }
      if (y && !x) { res.octets += await copier(y, this.handle, c); res.depuisAutre++; continue; }
      if (/(^|\/)evenements\//.test(c)) continue;                  // saisies : jamais modifiées
      var fx = await x.fichier.getFile(), fy = await y.fichier.getFile();
      if (fx.size === fy.size && memesOctets(new Uint8Array(await fx.arrayBuffer()), new Uint8Array(await fy.arrayBuffer()))) continue;
      if (fx.lastModified >= fy.lastModified) { res.octets += await copier(x, autre.handle, c); res.versAutre++; }
      else { res.octets += await copier(y, this.handle, c); res.depuisAutre++; }
    }
    // Coffre : la plus haute révision l'emporte ; la version remplacée est gardée dans l'historique.
    var ca = await this.lireCoffre(), cb = await autre.lireCoffre();
    if (ca && !cb && !autre.coffreIllisible) { await autre.ecrireFichier(autre.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(ca, null, 1))); res.coffre = 'vers'; }
    else if (cb && !ca && !this.coffreIllisible) { await this.ecrireFichier(this.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(cb, null, 1))); res.coffre = 'depuis'; }
    else if (ca && cb) {
      var ja = JSON.stringify(ca), jb = JSON.stringify(cb);
      if (ja === jb) res.coffre = 'egal';
      else if ((cb.rev || 0) > (ca.rev || 0)) { await this.archiverCoffre(ca); await this.ecrireFichier(this.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(cb, null, 1))); res.coffre = 'depuis'; }
      else {
        res.coffre = (cb.rev || 0) === (ca.rev || 0) ? 'conflit' : 'vers';   // même révision, contenus différents : le principal l'emporte
        await autre.archiverCoffre(cb); await autre.ecrireFichier(autre.handle, 'coffre.json', new TextEncoder().encode(JSON.stringify(ca, null, 1)));
      }
    }
    var maintenant = new Date().toISOString();
    var etat = { derniere: maintenant, poste: options.poste || '', versAutre: res.versAutre, depuisAutre: res.depuisAutre };
    // Plusieurs dossiers de secours possibles (serveur, copie locale de chaque poste désigné, copie robocopy) :
    // chacun porte un identifiant, et le dossier principal garde l'état de chacun.
    var ea = await autre.lireEtatMiroir(), id = (ea && ea.id) || ('m' + C.hex(C.aleatoire(6)));
    var type = options.type || (ea && ea.type) || 'serveur';
    await autre.ecrireEtatMiroir(Object.assign({ role: 'secours', id: id, type: type, autre: this.nom }, etat));
    var ep = (await this.lireEtatMiroir()) || {}, miroirs = (ep.miroirs && typeof ep.miroirs === 'object') ? ep.miroirs : {};
    miroirs[id] = { nom: autre.nom, type: type, derniere: maintenant, poste: options.poste || '', outil: 'outil' };
    await this.ecrireEtatMiroir(Object.assign({ role: 'principal', autre: autre.nom, miroirs: miroirs }, etat));
    return res;
  };

  /**
   * Copie toutes les données de ce dossier dans `cible` (vide), vérifie chaque fichier relu, puis marque ce dossier
   * comme déplacé (deplace.json) : il ne s'ouvre plus. Les instantanés, reconstruits automatiquement, ne sont pas copiés.
   */
  Dossier.prototype.deplacerVers = async function (cible, options) {
    options = options || {};
    for await (var k of cible.handle.keys()) { if (k) throw new Error('Le nouveau dossier n’est pas vide : choisissez un dossier vide.'); }
    if (await this.lireDeplacement()) throw new Error('Ce dossier a déjà été déplacé.');
    var src = await inventaire(this.handle, INSTANTANES, null), chemins = Object.keys(src).filter(function (c) { return c !== 'miroir-etat.json'; });
    var n = 0;
    for (var i = 0; i < chemins.length; i++) {
      var c = chemins[i], octets = new Uint8Array(await (await src[c].fichier.getFile()).arrayBuffer());
      var dir = await dossierDe(cible.handle, c), nom = c.split('/').pop();
      var w = await (await dir.getFileHandle(nom, { create: true })).createWritable();
      await w.write(octets); await w.close();
      var relu = new Uint8Array(await (await (await dir.getFileHandle(nom)).getFile()).arrayBuffer());
      if (!memesOctets(octets, relu)) throw new Error('Copie non vérifiée : ' + c + '. Le dossier d’origine reste utilisé ; videz le nouveau dossier avant de recommencer.');
      n++;
      if (options.progres) options.progres(n, chemins.length);
    }
    if (!(await cible.lireCoffre())) throw new Error('Le coffre copié est illisible : déplacement interrompu, le dossier d’origine reste utilisé.');
    await this.ecrireFichier(this.handle, 'deplace.json', new TextEncoder().encode(JSON.stringify({ vers: cible.nom, le: new Date().toISOString(), par: options.par || '' }, null, 1)));
    await this.ecrireFichier(this.handle, 'DONNEES-DEPLACEES-LISEZMOI.txt', new TextEncoder().encode(
      'Les données de l\'outil de suivi des mesures d\'isolement et de contention ont été déplacées le ' + new Date().toLocaleString('fr-FR') +
      ' vers le dossier « ' + cible.nom + ' ».\r\nCe dossier n\'est plus utilisé : ouvrez le nouveau dossier depuis l\'outil (« Changer de dossier »).\r\nNe le supprimez qu\'après vérification du nouveau dossier et de ses sauvegardes.\r\n'));
    return n;
  };

  /** Dossier choisi par l'utilisateur, sans le retenir comme dossier de travail (secours, nouveau dossier). */
  Dossier.choisirAutre = async function (id) {
    if (!window.showDirectoryPicker) throw new Error("Ce navigateur ne permet pas d'ouvrir un dossier réseau. Utilisez Edge ou Chrome à jour.");
    return new Dossier(await window.showDirectoryPicker({ id: id || 'sic-autre', mode: 'readwrite' }), 'reseau');
  };
  /** Dossier de secours relié à ce poste (mémorisé dans le navigateur). */
  // Deux liens par poste : le dossier de secours du service ('serveur', clé « miroir ») et la copie locale ('local').
  function cleMiroir(type) { return type === 'local' ? 'miroirLocal' : 'miroir'; }
  Dossier.miroirPoste = async function (type) { var h = await relire(cleMiroir(type)); return h ? new Dossier(h, 'reseau') : null; };
  Dossier.relierMiroir = function (d, type) { return memoriser(cleMiroir(type), d ? d.handle : null); };
  /** Ouvre la copie locale de ce poste (panne réseau) sans changer le dossier de travail retenu. */
  Dossier.ouvrirLocal = async function () {
    var d = await Dossier.miroirPoste('local');
    if (!d) throw new Error('Aucune copie locale des données sur ce poste.');
    if (!(await d.autorise(true))) throw new Error('L’accès à la copie locale a été refusé.');
    return d;
  };
  /** Retire du dossier principal l'état d'un dossier de secours qui n'existe plus (poste retiré, serveur arrêté). */
  Dossier.prototype.oublierMiroir = async function (id) {
    var ep = await this.lireEtatMiroir();
    if (!ep || !ep.miroirs || !ep.miroirs[id]) return;
    delete ep.miroirs[id];
    await this.ecrireEtatMiroir(ep);
  };
  Dossier.prototype.autorise = async function (demander) {
    if (this.mode !== 'reseau' || !this.handle.queryPermission) return true;
    var o = { mode: 'readwrite' };
    if ((await this.handle.queryPermission(o)) === 'granted') return true;
    return demander ? (await this.handle.requestPermission(o)) === 'granted' : false;
  };
  Dossier.prototype.memeQue = function (autre) { return !!(autre && this.handle.isSameEntry) ? this.handle.isSameEntry(autre.handle) : Promise.resolve(false); };
  /** Retient ce dossier comme dossier de travail de ce poste (après un déplacement). */
  Dossier.prototype.retenir = async function () { await memoriser('dossier', this.handle); await memoriser('mode', 'reseau'); };

  SIC.Dossier = Dossier;
  SIC.horodatageCompact = horodatageCompact;
})(typeof self !== 'undefined' ? self : this);
