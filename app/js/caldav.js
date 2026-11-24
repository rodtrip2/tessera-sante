// SPDX-License-Identifier: EUPL-1.2
/*
 * Tessera Santé — synchronisation avec un agenda CalDAV (Zimbra…), puis le téléphone par DAVx5 (24 novembre 2026).
 *
 * Fonction soumise à avis « synchro-caldav » (délégué à la protection des données, responsable de la sécurité
 * informatique), livrée désactivée. Tessera ne se connecte à aucune adresse : l'adresse du serveur d'agenda de
 * l'établissement est autorisée sur place par le script de mise à jour (`mettre-a-jour-outil.ps1 -Zimbra …`), qui
 * l'ajoute à la règle `connect-src` de la page. Le navigateur de l'agent échange directement avec ce serveur,
 * dans le réseau de l'hôpital ; rien ne passe par un service extérieur.
 *
 * Ce fichier ne dépend pas du navigateur (testable sous Node) :
 * - lecture des réponses du protocole (XML « multistatus ») ;
 * - client : découverte des agendas, création des deux agendas « Tessera », lecture, écriture, suppression ;
 * - tâches au format VTODO (titre, échéance, heure, rappel, note, faite) et retour ;
 * - plan de synchronisation, dans les deux sens (en cas de conflit, la modification la plus récente l'emporte), des
 *   tâches et des événements : rendez-vous personnels et partagés, éléments de Mon agenda ;
 * - serveur simulé en mémoire, pour les tests et le mode démonstration.
 * Jamais d'identité de patient : les éléments de l'Agenda envoyés sont ceux de l'export .ics (type, lieu, horaire) ; seul
 * leur horaire revient du téléphone, si l'agent peut le modifier.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ics.js'));
  else (root.SIC = root.SIC || {}).caldav = factory(root.SIC.ics);
})(typeof self !== 'undefined' ? self : this, function (ICS) {
  'use strict';

  var JOUR = 86400000;
  function deux(n) { return String(n).padStart(2, '0'); }

  // ------------------------------------------------------------ XML (réponses du serveur)
  function entites(t) {
    return String(t).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      var n = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(n) ? String.fromCodePoint(n) : m;
    });
  }
  function echXml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /** Arbre simple : { nom (sans préfixe d'espace de noms), attrs, enfants, texte }. */
  function lireXml(texte) {
    var racine = { nom: '#', attrs: {}, enfants: [], texte: '' }, pile = [racine], re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s>\/]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(String(texte || '')))) {
      var cur = pile[pile.length - 1];
      if (m[1] !== undefined) { cur.texte += m[1]; continue; }
      if (m[6] !== undefined) { cur.texte += entites(m[6]); continue; }
      if (!m[3]) continue;
      var nom = m[3].replace(/^[^:]*:/, '').toLowerCase();
      if (m[2] === '/') { if (pile.length > 1) pile.pop(); continue; }
      var attrs = {}, ra = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g, a;
      while ((a = ra.exec(m[4] || ''))) attrs[a[1].replace(/^[^:]*:/, '').toLowerCase()] = entites(a[3] !== undefined ? a[3] : a[4]);
      var n = { nom: nom, attrs: attrs, enfants: [], texte: '' };
      cur.enfants.push(n);
      if (!m[5]) pile.push(n);
    }
    return racine;
  }
  function enfant(n, nom) { return n ? n.enfants.filter(function (x) { return x.nom === nom; })[0] || null : null; }
  function tous(n, nom, res) { res = res || []; if (!n) return res; n.enfants.forEach(function (x) { if (x.nom === nom) res.push(x); tous(x, nom, res); }); return res; }
  function texteDe(n) { return n ? (n.texte + n.enfants.map(texteDe).join('')).trim() : ''; }
  /**
   * Réponses d'un « multistatus » : [{ href, statut, props: { getetag, calendarData, displayname, collection, calendrier,
   * composants, principal, maison } }] ; seules les propriétés trouvées (statut 2xx) sont reprises.
   */
  function reponses(texte) {
    return tous(lireXml(texte), 'response').map(function (r) {
      var props = {}, st = enfant(r, 'status');
      enfant(r, 'propstat') && r.enfants.filter(function (x) { return x.nom === 'propstat'; }).forEach(function (ps) {
        var s = texteDe(enfant(ps, 'status'));
        if (s && !/\s2\d\d(\s|$)/.test(s)) return;
        var p = enfant(ps, 'prop');
        if (!p) return;
        p.enfants.forEach(function (x) {
          if (x.nom === 'getetag') props.getetag = texteDe(x);
          else if (x.nom === 'calendar-data') props.calendarData = texteDe(x);
          else if (x.nom === 'displayname') props.displayname = texteDe(x);
          else if (x.nom === 'getctag') props.ctag = texteDe(x);
          else if (x.nom === 'resourcetype') { props.collection = !!enfant(x, 'collection'); props.calendrier = !!enfant(x, 'calendar'); }
          else if (x.nom === 'supported-calendar-component-set') props.composants = tous(x, 'comp').map(function (c) { return String(c.attrs.name || '').toUpperCase(); }).filter(Boolean);
          else if (x.nom === 'current-user-principal') props.principal = texteDe(enfant(x, 'href'));
          else if (x.nom === 'calendar-home-set') props.maison = texteDe(enfant(x, 'href'));
        });
      });
      return { href: texteDe(enfant(r, 'href')), statut: texteDe(st), props: props };
    });
  }

  // ------------------------------------------------------------ Requêtes
  var NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"';
  var CORPS = {
    principal: '<?xml version="1.0" encoding="utf-8"?><d:propfind ' + NS + '><d:prop><d:current-user-principal/><c:calendar-home-set/></d:prop></d:propfind>',
    maison: '<?xml version="1.0" encoding="utf-8"?><d:propfind ' + NS + '><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    agendas: '<?xml version="1.0" encoding="utf-8"?><d:propfind ' + NS + '><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><cs:getctag/></d:prop></d:propfind>'
  };
  function horodatage(t) { var d = new Date(t); return d.getUTCFullYear() + deux(d.getUTCMonth() + 1) + deux(d.getUTCDate()) + 'T' + deux(d.getUTCHours()) + deux(d.getUTCMinutes()) + deux(d.getUTCSeconds()) + 'Z'; }
  function corpsListe(composant, debut, fin) {
    var plage = isFinite(debut) && isFinite(fin) ? '<c:time-range start="' + horodatage(debut) + '" end="' + horodatage(fin) + '"/>' : '';
    return '<?xml version="1.0" encoding="utf-8"?><c:calendar-query ' + NS + '><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="' + composant + '">' + plage + '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>';
  }
  function corpsCreation(nom, composant) {
    return '<?xml version="1.0" encoding="utf-8"?><c:mkcalendar ' + NS + '><d:set><d:prop><d:displayname>' + echXml(nom) + '</d:displayname><c:supported-calendar-component-set><c:comp name="' + composant + '"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>';
  }
  function base64(t) {
    var octets = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(t) : Buffer.from(t, 'utf8');
    if (typeof btoa === 'function') { var s = ''; for (var i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]); return btoa(s); }
    return Buffer.from(octets).toString('base64');
  }

  /** Erreur du protocole : `code` = 'reseau' (serveur injoignable, adresse non autorisée), 'auth' (401, 403), 'conflit' (412), 'http'. */
  function ErreurCaldav(code, message, statut) { var e = new Error(message); e.code = code; e.statut = statut || 0; e.name = 'ErreurCaldav'; return e; }

  /**
   * Client : { adresse (dossier de l'agent sur le serveur, ex. https://zimbra…/dav/<identifiant>/), identifiant,
   * motDePasse, fetch }. Authentification simple (« Basic ») sur une liaison chiffrée (https) ; jamais de cookie.
   */
  function Client(o) {
    if (!(this instanceof Client)) return new Client(o);
    if (!o || !/^https:\/\//i.test(String(o.adresse || '')) && !o.permettreHttp) throw ErreurCaldav('http', 'L’adresse du serveur d’agenda doit commencer par https://.');
    this.adresse = String(o.adresse).replace(/\/?$/, '/');
    this.auth = 'Basic ' + base64(String(o.identifiant || '') + ':' + String(o.motDePasse || ''));
    this.f = o.fetch;
  }
  Client.prototype.url = function (href) { return new URL(href, this.adresse).toString(); };
  Client.prototype.requete = async function (methode, href, o) {
    o = o || {};
    var entetes = { Authorization: this.auth };
    if (o.corps) entetes['Content-Type'] = o.type || 'application/xml; charset=utf-8';
    if (o.profondeur !== undefined) entetes.Depth = String(o.profondeur);
    Object.keys(o.entetes || {}).forEach(function (k) { entetes[k] = o.entetes[k]; });
    var r;
    try { r = await this.f(this.url(href), { method: methode, headers: entetes, body: o.corps || undefined, credentials: 'omit', cache: 'no-store', redirect: 'follow' }); }
    catch (e) { throw ErreurCaldav('reseau', 'Serveur d’agenda injoignable : adresse non autorisée sur ce poste, serveur arrêté, ou serveur qui n’accepte pas les échanges avec Tessera (voir le guide d’installation).'); }
    var statut = r.status, texte = await r.text();
    if (statut === 401 || statut === 403) throw ErreurCaldav('auth', 'Identifiant ou mot de passe refusé par le serveur d’agenda.', statut);
    if (statut === 412) throw ErreurCaldav('conflit', 'Élément modifié entre-temps sur le serveur d’agenda.', statut);
    if (statut >= 400 && !(o.accepter || []).some(function (s) { return s === statut; })) throw ErreurCaldav('http', 'Le serveur d’agenda a répondu « ' + statut + ' » (' + methode + ').', statut);
    return { statut: statut, texte: texte, etag: r.headers && r.headers.get ? r.headers.get('ETag') : null };
  };
  /** Dossier des agendas de l'agent (calendar-home-set), à défaut l'adresse donnée. */
  Client.prototype.maison = async function () {
    var r = reponses((await this.requete('PROPFIND', this.adresse, { corps: CORPS.principal, profondeur: 0, accepter: [404] })).texte)[0];
    var p = r && r.props || {};
    if (p.maison) return this.url(p.maison);
    if (p.principal) {
      var r2 = reponses((await this.requete('PROPFIND', p.principal, { corps: CORPS.maison, profondeur: 0, accepter: [404] })).texte)[0];
      if (r2 && r2.props.maison) return this.url(r2.props.maison);
    }
    return this.adresse;
  };
  /** Agendas du dossier : [{ href, nom, composants }] (sans composant déclaré : VEVENT et VTODO supposés). */
  Client.prototype.agendas = async function (maison) {
    var self = this, base = maison || await this.maison();
    return reponses((await this.requete('PROPFIND', base, { corps: CORPS.agendas, profondeur: 1 })).texte)
      .filter(function (r) { return r.props.calendrier; })
      .map(function (r) { return { href: self.url(r.href), nom: r.props.displayname || decodeURIComponent(r.href.replace(/\/$/, '').split('/').pop()), composants: r.props.composants && r.props.composants.length ? r.props.composants : ['VEVENT', 'VTODO'] }; });
  };
  Client.prototype.creerAgenda = async function (maison, segment, nom, composant) {
    var href = this.url(maison.replace(/\/?$/, '/') + encodeURIComponent(segment) + '/');
    await this.requete('MKCALENDAR', href, { corps: corpsCreation(nom, composant), accepter: [405] });   // 405 : il existe déjà
    return href;
  };
  /** Éléments d'un agenda : [{ href, etag, ics }] ; `debut`, `fin` facultatifs (plage des événements). */
  Client.prototype.lister = async function (agenda, composant, debut, fin) {
    var self = this;
    return reponses((await this.requete('REPORT', agenda, { corps: corpsListe(composant, debut, fin), profondeur: 1 })).texte)
      .filter(function (r) { return r.props.calendarData; })
      .map(function (r) { return { href: self.url(r.href), etag: r.props.getetag || null, ics: r.props.calendarData }; });
  };
  /** Écrit un élément : `etag` (modification si inchangé sur le serveur) ou `nouveau` (création seulement). Rend l'ETag ou null. */
  Client.prototype.ecrire = async function (href, ics, o) {
    o = o || {};
    var e = {};
    if (o.etag) e['If-Match'] = o.etag; else if (o.nouveau) e['If-None-Match'] = '*';
    return (await this.requete('PUT', href, { corps: ics, type: 'text/calendar; charset=utf-8', entetes: e })).etag || null;
  };
  Client.prototype.supprimer = async function (href, etag) {
    await this.requete('DELETE', href, { entetes: etag ? { 'If-Match': etag } : {}, accepter: [404, 410] });
  };

  // ------------------------------------------------------------ Tâches (VTODO)
  var CHAMPS = ['titre', 'echeance', 'heure', 'fait', 'note', 'rappel'];
  /** Empreinte des champs synchronisés d'une tâche (repère des changements). */
  function empreinte(t) { t = t || {}; return JSON.stringify([String(t.titre || ''), String(t.echeance || ''), String(t.heure || ''), !!t.fait, String(t.note || ''), String(t.rappel == null ? '' : t.rappel)]); }
  function uidTache(id) { return 'tessera-tache-' + String(id).replace(/[^A-Za-z0-9-]/g, '') + '@tessera-sante'; }
  function idDeUid(uid) { var m = /^tessera-tache-([A-Za-z0-9-]+)@tessera-sante$/.exec(String(uid || '')); return m ? m[1] : null; }
  function replier(l) { var res = [], s = l; while (s.length > 73) { res.push(s.slice(0, 73)); s = ' ' + s.slice(73); } res.push(s); return res.join('\r\n'); }
  function dateIcs(j) { return String(j).replace(/-/g, ''); }
  /** Tâche au format iCalendar (VTODO) : titre, échéance (jour, ou jour et heure locale), rappel, note, faite. */
  function ecrireTache(t, o) {
    o = o || {};
    var maintenant = o.maintenant || Date.now(), uid = o.uid || uidTache(t.id), l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tessera Santé//Mes tâches//FR', 'BEGIN:VTODO',
      'UID:' + uid, 'DTSTAMP:' + horodatage(maintenant), 'LAST-MODIFIED:' + horodatage(isFinite(o.modifie) ? o.modifie : maintenant), 'SUMMARY:' + ICS.echapper(t.titre || 'Tâche')];
    if (/^\d{4}-\d{2}-\d{2}$/.test(t.echeance || '')) {
      if (/^\d{2}:\d{2}$/.test(t.heure || '')) l.push('DUE:' + dateIcs(t.echeance) + 'T' + t.heure.replace(':', '') + '00');
      else l.push('DUE;VALUE=DATE:' + dateIcs(t.echeance));
    }
    if (t.note) l.push('DESCRIPTION:' + ICS.echapper(t.note));
    if (t.fait) { l.push('STATUS:COMPLETED', 'PERCENT-COMPLETE:100'); var fl = Date.parse(t.faitLe || ''); l.push('COMPLETED:' + horodatage(isFinite(fl) ? fl : maintenant)); }
    else l.push('STATUS:NEEDS-ACTION');
    if (t.echeance && /^\d+$/.test(String(t.rappel == null ? '' : t.rappel))) l.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + ICS.echapper(t.titre || 'Tâche'), 'TRIGGER;RELATED=END:' + (+t.rappel ? '-P' + (+t.rappel) + 'D' : 'PT0S'), 'END:VALARM');
    l.push('END:VTODO', 'END:VCALENDAR');
    return l.map(replier).join('\r\n') + '\r\n';
  }
  function desechapper(t) { return String(t || '').replace(/\\([\\;,nN])/g, function (m, c) { return c === 'n' || c === 'N' ? '\n' : c; }); }
  function horodatageVers(v) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    if (!m[4]) return { jour: m[1] + '-' + m[2] + '-' + m[3], heure: '', t: new Date(+m[1], +m[2] - 1, +m[3]).getTime() };
    var t = m[7] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime(), d = new Date(t);
    return { jour: d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()), heure: deux(d.getHours()) + ':' + deux(d.getMinutes()), t: t };
  }
  /** Tâche lue d'un élément VTODO : { uid, titre, echeance, heure, fait, faitLe, note, rappel, modifie } ou null. */
  function lireTache(ics) {
    var ls = String(ics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n'), dans = false, alarme = false, t = null;
    ls.forEach(function (brut) {
      var i = brut.indexOf(':');
      if (i < 0) return;
      var tete = brut.slice(0, i).split(';'), nom = tete[0].toUpperCase(), v = brut.slice(i + 1), params = tete.slice(1).join(';').toUpperCase();
      if (nom === 'BEGIN' && v.toUpperCase() === 'VTODO' && !t) { dans = true; t = { uid: '', titre: '', echeance: '', heure: '', fait: false, faitLe: '', note: '', rappel: '', modifie: null }; return; }
      if (!dans) return;
      if (nom === 'END' && v.toUpperCase() === 'VTODO') { dans = false; return; }
      if (nom === 'BEGIN' && v.toUpperCase() === 'VALARM') { alarme = true; return; }
      if (nom === 'END' && v.toUpperCase() === 'VALARM') { alarme = false; return; }
      if (alarme) {
        if (nom === 'TRIGGER' && t.rappel === '' && params.indexOf('VALUE=DATE-TIME') < 0) {
          var m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
          if (m) { var jours = (+m[1] || 0) * 7 + (+m[2] || 0), reste = (+m[3] || 0) + (+m[4] || 0) + (+m[5] || 0); if ([0, 1, 2, 7].indexOf(jours) >= 0 && (!reste || jours === 0 && reste < 24 * 60)) t.rappel = String(jours); }
        }
        return;
      }
      if (nom === 'UID') t.uid = v.trim();
      else if (nom === 'SUMMARY') t.titre = desechapper(v).replace(/\s+/g, ' ').trim().slice(0, 150);
      else if (nom === 'DESCRIPTION') t.note = desechapper(v).trim().slice(0, 1000);
      else if (nom === 'DUE' || (nom === 'DTSTART' && !t.echeance)) { var d = horodatageVers(v); if (d) { t.echeance = d.jour; t.heure = params.indexOf('VALUE=DATE') >= 0 && params.indexOf('DATE-TIME') < 0 ? '' : d.heure; if (nom === 'DUE') t._due = true; } }
      else if (nom === 'STATUS') t.fait = v.trim().toUpperCase() === 'COMPLETED';
      else if (nom === 'COMPLETED') { var c = horodatageVers(v); if (c) t.faitLe = new Date(c.t).toISOString(); }
      else if (nom === 'LAST-MODIFIED') { var lm = horodatageVers(v); if (lm) t.modifie = lm.t; }
    });
    if (!t) return null;
    delete t._due;
    if (t.faitLe && !t.fait) t.faitLe = '';
    if (!t.echeance) t.rappel = '';
    return t;
  }

  /**
   * Plan de synchronisation des tâches. `locales` : [{ id, le (ISO), titre, echeance, … }] ; `distantes` :
   * [{ href, etag, tache (lireTache) }] ; `memoire` : { id: { href, etag, emp } } (dernier état synchronisé) ;
   * `agenda` : adresse de l'agenda des tâches. Rend { envoyer: [{ id, href, etag|null, nouveau }], recevoir: [{ id,
   * href, etag, tache }], creerLocal: [{ href, etag, tache }], supprimerLocal: [id], supprimerDistant: [{ href, etag }] }.
   * Règles : une modification d'un seul côté passe de l'autre ; modifiée des deux côtés : la plus récente l'emporte ;
   * supprimée d'un côté et inchangée de l'autre : supprimée des deux ; tâche créée sur le téléphone : ajoutée à Tessera.
   */
  function planTaches(locales, distantes, memoire, agenda) {
    var mem = memoire || {}, parHref = {}, parUid = {}, vus = {}, plan = { envoyer: [], recevoir: [], creerLocal: [], supprimerLocal: [], supprimerDistant: [] };
    (distantes || []).forEach(function (r) { if (!r.tache) return; parHref[r.href] = r; if (r.tache.uid) parUid[r.tache.uid] = r; });
    var ids = {};
    (locales || []).forEach(function (l) {
      ids[l.id] = 1;
      var m = mem[l.id], r = (m && m.href && parHref[m.href]) || parUid[uidTache(l.id)] || null, el = empreinte(l);
      if (r) {
        vus[r.href] = 1;
        var er = empreinte(r.tache);
        if (!m) { if (el !== er) plan.envoyer.push({ id: l.id, href: r.href, etag: r.etag, uid: r.tache.uid }); else plan.recevoir.push({ id: l.id, href: r.href, etag: r.etag, tache: r.tache, sansChangement: true }); return; }
        var chL = m.emp !== el, chR = m.etag ? m.etag !== r.etag : er !== m.emp;
        if (chL && chR && el !== er) {
          var tl = Date.parse(l.le || ''), tr = r.tache.modifie;
          if (typeof tr === 'number' && (!isFinite(tl) || tr > tl)) plan.recevoir.push({ id: l.id, href: r.href, etag: r.etag, tache: r.tache });
          else plan.envoyer.push({ id: l.id, href: r.href, etag: r.etag, uid: r.tache.uid });
        } else if (chL && el !== er) plan.envoyer.push({ id: l.id, href: r.href, etag: r.etag, uid: r.tache.uid });
        else if (chR) plan.recevoir.push({ id: l.id, href: r.href, etag: r.etag, tache: r.tache, sansChangement: el === er });
      } else if (m && m.href) {
        // Supprimée sur le téléphone : supprimée dans Tessera, sauf si elle a changé entre-temps dans Tessera
        if (m.emp !== el) plan.envoyer.push({ id: l.id, href: agenda.replace(/\/?$/, '/') + encodeURIComponent(uidTache(l.id).split('@')[0]) + '.ics', etag: null, nouveau: true });
        else plan.supprimerLocal.push(l.id);
      } else plan.envoyer.push({ id: l.id, href: agenda.replace(/\/?$/, '/') + encodeURIComponent(uidTache(l.id).split('@')[0]) + '.ics', etag: null, nouveau: true });
    });
    var hrefsMem = {};
    Object.keys(mem).forEach(function (k) { if (mem[k] && mem[k].href) hrefsMem[mem[k].href] = k; });
    (distantes || []).forEach(function (r) {
      if (!r.tache || vus[r.href]) return;
      var id = idDeUid(r.tache.uid), k = hrefsMem[r.href];
      if ((id && !ids[id]) || (k && !ids[k])) plan.supprimerDistant.push({ href: r.href, etag: r.etag });   // retirée dans Tessera
      else if (!id && !k && r.tache.titre) plan.creerLocal.push({ href: r.href, etag: r.etag, tache: r.tache });
    });
    return plan;
  }
  /** Contenu local mis à jour depuis le téléphone : seuls les champs synchronisés changent (éléments liés, partage gardes). */
  function fusionner(local, distante, nomAgent) {
    var c = Object.assign({}, local);
    CHAMPS.forEach(function (k) { c[k] = distante[k]; });
    if (!c.echeance) c.rappel = '';
    if (c.fait && !local.fait) { c.faitLe = distante.faitLe || new Date().toISOString(); c.faitPar = nomAgent || ''; }
    if (!c.fait) { c.faitLe = ''; c.faitPar = ''; }
    return c;
  }

  // ------------------------------------------------------------ Événements (VEVENT), dans les deux sens
  /**
   * Événement de Tessera : { cle, genre ('perso' : rendez-vous personnel ou partagé ; 'service' : élément de l'Agenda,
   * absence, salle), debut, fin, journee, titre, lieu, note, le (ISO), modifiable (horaire modifiable par l'agent) }.
   */
  function empreinteEvt(e) { e = e || {}; return JSON.stringify([e.debut, e.fin, String(e.titre || ''), String(e.lieu || ''), !!e.journee, String(e.note || '')]); }
  function hrefEvt(agenda, cle) { return agenda.replace(/\/?$/, '/') + encodeURIComponent(ICS.uid(cle).split('@')[0]) + '.ics'; }
  function cleDeUid(uid) { var m = /^tessera-(.+)@tessera-sante$/.exec(String(uid || '')); return m && !/^tache-/.test(m[1]) ? m[1] : null; }
  function dateSeule(t) { var d = new Date(t); return d.getFullYear() + deux(d.getMonth() + 1) + deux(d.getDate()); }
  /** Événement au format iCalendar (VEVENT), sans méthode (objet CalDAV) ; `o.uid` garde l'identifiant donné par le téléphone. */
  function ecrireEvenement(e, o) {
    o = typeof o === 'number' ? { maintenant: o } : (o || {});
    var maintenant = o.maintenant || Date.now(), l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tessera Santé//Agenda//FR', 'BEGIN:VEVENT',
      'UID:' + (o.uid || ICS.uid(e.cle)), 'DTSTAMP:' + horodatage(maintenant), 'LAST-MODIFIED:' + horodatage(Date.parse(e.le || '') || maintenant)];
    if (e.journee) l.push('DTSTART;VALUE=DATE:' + dateSeule(e.debut), 'DTEND;VALUE=DATE:' + dateSeule(e.fin && e.fin > e.debut ? e.fin : e.debut + JOUR));
    else l.push('DTSTART:' + horodatage(e.debut), 'DTEND:' + horodatage(e.fin && e.fin > e.debut ? e.fin : e.debut + 3600000));
    l.push('SUMMARY:' + ICS.echapper(e.titre || 'Rendez-vous'));
    if (e.lieu) l.push('LOCATION:' + ICS.echapper(e.lieu));
    if (e.note) l.push('DESCRIPTION:' + ICS.echapper(e.note));
    l.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');
    return l.map(replier).join('\r\n') + '\r\n';
  }
  /** Premier événement d'un élément VEVENT : { uid, debut, fin, journee, titre, lieu, note, modifie, repete } ou null. */
  function lireEvenement(ics) {
    var ls = String(ics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n'), dans = false, prof = 0, e = null, duree = null;
    ls.forEach(function (brut) {
      var i = brut.indexOf(':');
      if (i < 0) return;
      var tete = brut.slice(0, i).split(';'), nom = tete[0].toUpperCase(), v = brut.slice(i + 1), params = tete.slice(1).join(';').toUpperCase();
      if (nom === 'BEGIN') { if (v.toUpperCase() === 'VEVENT' && !e) { dans = true; e = { uid: '', titre: '', lieu: '', note: '', debut: null, fin: null, journee: false, modifie: null, repete: false }; } else if (dans) prof++; return; }
      if (nom === 'END') { if (dans && prof) prof--; else if (dans && v.toUpperCase() === 'VEVENT') dans = false; return; }
      if (!dans || prof) return;
      if (nom === 'UID') e.uid = v.trim();
      else if (nom === 'SUMMARY') e.titre = desechapper(v).replace(/\s+/g, ' ').trim().slice(0, 150);
      else if (nom === 'LOCATION') e.lieu = desechapper(v).replace(/\s+/g, ' ').trim().slice(0, 150);
      else if (nom === 'DESCRIPTION') e.note = desechapper(v).trim().slice(0, 1000);
      else if (nom === 'DTSTART') { var d = horodatageVers(v); if (d) { e.debut = d.t; e.journee = params.indexOf('VALUE=DATE') >= 0 && params.indexOf('DATE-TIME') < 0 || !/T/.test(v); } }
      else if (nom === 'DTEND') { var f = horodatageVers(v); if (f) e.fin = f.t; }
      else if (nom === 'DURATION') { var m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(v.trim()); if (m) duree = ((+m[1] || 0) * 7 + (+m[2] || 0)) * JOUR + ((+m[3] || 0) * 60 + (+m[4] || 0)) * 60000; }
      else if (nom === 'RRULE') e.repete = true;
      else if (nom === 'LAST-MODIFIED') { var lm = horodatageVers(v); if (lm) e.modifie = lm.t; }
    });
    if (!e || typeof e.debut !== 'number') return null;
    if (typeof e.fin !== 'number') e.fin = duree !== null ? e.debut + duree : e.debut + (e.journee ? JOUR : 3600000);
    return e;
  }
  /**
   * Plan des événements, dans les deux sens. `locales` : événements de Tessera de la période (rendez-vous personnels et
   * partagés : tous ceux qui ne sont pas finis) ; `distants` : [{ href, etag, evt (lireEvenement) }] de l'agenda
   * « Tessera — agenda » ; `memoire` : { cle: { href, etag, emp, debut, uid } }. Rend { envoyer, recevoir, creerLocal,
   * supprimerLocal, supprimerDistant, garder } :
   * - modifié d'un seul côté : passe de l'autre ; des deux côtés : le plus récent l'emporte ;
   * - rendez-vous personnel supprimé sur le téléphone (inchangé dans Tessera) : retiré de Tessera ; élément de l'Agenda
   *   supprimé sur le téléphone : remis (il appartient au service) ;
   * - événement créé sur le téléphone dans cet agenda : nouveau rendez-vous personnel ;
   * - retiré de Tessera : retiré du téléphone ; événements passés (avant `debut`) laissés en place.
   */
  function planEvenements(locales, distants, memoire, agenda, debut) {
    var mem = memoire || {}, parHref = {}, parUid = {}, vus = {}, cles = {}, hrefsMem = {};
    var plan = { envoyer: [], recevoir: [], creerLocal: [], supprimerLocal: [], supprimerDistant: [], garder: {} };
    (distants || []).forEach(function (r) { if (!r.evt) return; parHref[r.href] = r; if (r.evt.uid) parUid[r.evt.uid] = r; });
    Object.keys(mem).forEach(function (k) { if (mem[k] && mem[k].href) hrefsMem[mem[k].href] = k; });
    function nouveau(l) { return { cle: l.cle, href: hrefEvt(agenda, l.cle), etag: null, nouveau: true, uid: ICS.uid(l.cle) }; }
    (locales || []).forEach(function (l) {
      cles[l.cle] = 1;
      var m = mem[l.cle], r = (m && m.href && parHref[m.href]) || parUid[ICS.uid(l.cle)] || null, el = empreinteEvt(l);
      if (r) {
        vus[r.href] = 1;
        var er = empreinteEvt(r.evt), uid = r.evt.uid || (m && m.uid) || ICS.uid(l.cle);
        if (!m) { if (el !== er) plan.envoyer.push({ cle: l.cle, href: r.href, etag: r.etag, uid: uid }); else plan.recevoir.push({ cle: l.cle, href: r.href, etag: r.etag, evt: r.evt, sansChangement: true }); return; }
        var chL = m.emp !== el, chR = m.etag ? m.etag !== r.etag : er !== m.emp;
        if (chL && chR && el !== er) {
          var tl = Date.parse(l.le || ''), tr = r.evt.modifie;
          if (typeof tr === 'number' && (!isFinite(tl) || tr > tl)) plan.recevoir.push({ cle: l.cle, href: r.href, etag: r.etag, evt: r.evt });
          else plan.envoyer.push({ cle: l.cle, href: r.href, etag: r.etag, uid: uid });
        } else if (chL && el !== er) plan.envoyer.push({ cle: l.cle, href: r.href, etag: r.etag, uid: uid });
        else if (chR) plan.recevoir.push({ cle: l.cle, href: r.href, etag: r.etag, evt: r.evt, sansChangement: el === er });
      } else if (m && m.href) {
        if (l.genre === 'perso' && m.emp === el) plan.supprimerLocal.push(l.cle);   // supprimé sur le téléphone
        else plan.envoyer.push(nouveau(l));   // élément de l'Agenda, ou rendez-vous modifié entre-temps : remis
      } else plan.envoyer.push(nouveau(l));
    });
    function passe(m, evt) { var d = m && isFinite(m.debut) ? m.debut : evt && evt.debut; return isFinite(d) && d < debut; }
    (distants || []).forEach(function (r) {
      if (!r.evt || vus[r.href]) return;
      var k = hrefsMem[r.href] || (cleDeUid(r.evt.uid) && mem[cleDeUid(r.evt.uid)] ? cleDeUid(r.evt.uid) : null), m = k ? mem[k] : null;
      if (k && cles[k]) return;
      if (passe(m, r.evt)) { if (k) plan.garder[k] = m; return; }   // passé : laissé sur le serveur
      if (m || cleDeUid(r.evt.uid)) plan.supprimerDistant.push({ href: r.href, etag: r.etag });   // retiré de Tessera
      else if (r.evt.titre || r.evt.debut) plan.creerLocal.push({ href: r.href, etag: r.etag, evt: r.evt });   // créé sur le téléphone
    });
    Object.keys(mem).forEach(function (k) { if (!cles[k] && !plan.garder[k] && passe(mem[k]) && mem[k].debut >= debut - 90 * JOUR) plan.garder[k] = mem[k]; });
    return plan;
  }
  function uidDe(ics) { var m = /\nUID[^:\n]*:([^\r\n]+)/.exec('\n' + String(ics || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')); return m ? m[1].trim() : ''; }

  // ------------------------------------------------------------ Synchronisation complète
  var NOMS = { taches: ['tessera-taches', 'Tessera — tâches', 'VTODO'], evenements: ['tessera-agenda', 'Tessera — agenda', 'VEVENT'] };
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  /**
   * Une synchronisation. `o` : { client, config (réglages de l'agent : taches, agenda, afficher, agendas, memTaches,
   * memEvts), taches: { lister() → [{ id, le, … }], enregistrer(id, contenu), creer(contenu) → id, retirer(id) },
   * evenements(debut, fin) → [{ cle, debut, fin, titre, lieu, journee }], nomAgent, maintenant }.
   * Rend { config (mise à jour : agendas créés, mémoires), resume }. Une erreur d'identification est levée (code 'auth')
   * pour que l'agent ressaisisse son mot de passe ; un élément modifié entre-temps est repris à la synchronisation suivante.
   */
  async function synchroniser(o) {
    var c = o.client, cfg = Object.assign({}, o.config || {}), maintenant = o.maintenant || Date.now(), maison = null;
    var res = { taches: { envoyees: 0, recues: 0, creees: 0, retireesIci: 0, retireesLa: 0, reportees: 0 }, evenements: { envoyes: 0, recus: 0, crees: 0, retiresIci: 0, retires: 0, remis: 0, reportes: 0 }, affiches: null };
    cfg.agendas = Object.assign({}, cfg.agendas || {});
    async function agenda(cle, refaire) {
      if (cfg.agendas[cle] && !refaire) return cfg.agendas[cle];
      maison = maison || await c.maison();
      var n = NOMS[cle], deja = (await c.agendas(maison)).filter(function (a) { return a.nom === n[1] && a.composants.indexOf(n[2]) >= 0; })[0];
      cfg.agendas[cle] = deja ? deja.href : await c.creerAgenda(maison, n[0], n[1], n[2]);
      return cfg.agendas[cle];
    }
    async function lister(cle, composant, debut, fin) {
      var href = await agenda(cle);
      try { return { href: href, items: await c.lister(href, composant, debut, fin) }; }
      catch (e) {
        if (e.code !== 'http' || (e.statut !== 404 && e.statut !== 410)) throw e;
        href = await agenda(cle, true);   // agenda supprimé dans la messagerie : recréé
        if (cle === 'taches') cfg.memTaches = {}; else cfg.memEvts = {};
        return { href: href, items: await c.lister(href, composant, debut, fin) };
      }
    }
    if (cfg.taches) {
      var lt = await lister('taches', 'VTODO'), dist = lt.items.map(function (r) { return { href: r.href, etag: r.etag, tache: lireTache(r.ics) }; });
      var loc = await o.taches.lister(), parId = {}, ancienne = cfg.memTaches || {}, mem = {};
      loc.forEach(function (l) { parId[l.id] = l; if (ancienne[l.id]) mem[l.id] = ancienne[l.id]; });
      var plan = planTaches(loc, dist, ancienne, lt.href);
      for (var i = 0; i < plan.envoyer.length; i++) {
        var x = plan.envoyer[i], l = parId[x.id];
        try {
          var et = await c.ecrire(x.href, ecrireTache(l, { modifie: Date.parse(l.le || '') || maintenant, maintenant: maintenant, uid: x.uid || undefined }), { etag: x.etag, nouveau: x.nouveau });
          mem[x.id] = { href: x.href, etag: et, emp: empreinte(l) }; res.taches.envoyees++;
        } catch (e) { if (e.code === 'conflit') res.taches.reportees++; else throw e; }
      }
      for (i = 0; i < plan.recevoir.length; i++) {
        var y = plan.recevoir[i], lc = parId[y.id], f = y.sansChangement ? lc : fusionner(lc, y.tache, o.nomAgent);
        if (!y.sansChangement) { await o.taches.enregistrer(y.id, f); res.taches.recues++; }
        mem[y.id] = { href: y.href, etag: y.etag, emp: empreinte(f) };
      }
      for (i = 0; i < plan.creerLocal.length; i++) {
        var z = plan.creerLocal[i], contenu = fusionner({ titre: '', echeance: '', heure: '', rappel: '', note: '', elements: [], fait: false }, z.tache, o.nomAgent);
        var nid = await o.taches.creer(contenu);
        mem[nid] = { href: z.href, etag: z.etag, emp: empreinte(contenu) }; res.taches.creees++;
      }
      for (i = 0; i < plan.supprimerLocal.length; i++) { await o.taches.retirer(plan.supprimerLocal[i]); delete mem[plan.supprimerLocal[i]]; res.taches.retireesIci++; }
      for (i = 0; i < plan.supprimerDistant.length; i++) {
        try { await c.supprimer(plan.supprimerDistant[i].href, plan.supprimerDistant[i].etag); res.taches.retireesLa++; }
        catch (e) { if (e.code === 'conflit') res.taches.reportees++; else throw e; }
      }
      cfg.memTaches = mem;
    }
    if (cfg.agenda && o.agenda) {
      var debut = minuit(maintenant) - 7 * JOUR, fin = minuit(maintenant) + 61 * JOUR;
      var le = await lister('evenements', 'VEVENT'), dE = le.items.map(function (r) { return { href: r.href, etag: r.etag, evt: lireEvenement(r.ics) }; });
      var locE = (await o.agenda.lister(debut, fin)) || [], parCle = {}, memE = {}, ancE = cfg.memEvts || {};
      locE.forEach(function (e) { parCle[e.cle] = e; if (ancE[e.cle]) memE[e.cle] = ancE[e.cle]; });
      var pe = planEvenements(locE, dE, ancE, le.href, debut);
      Object.keys(pe.garder).forEach(function (k) { memE[k] = pe.garder[k]; });
      var envoyerE = async function (cle, href, etag, uid, nouv, ev) {
        try {
          var et2 = await c.ecrire(href, ecrireEvenement(ev, { maintenant: maintenant, uid: uid }), { etag: etag, nouveau: nouv });
          memE[cle] = { href: href, etag: et2, emp: empreinteEvt(ev), debut: ev.debut, uid: uid };
          return true;
        } catch (e) { if (e.code === 'conflit') { res.evenements.reportes++; return false; } throw e; }
      };
      for (i = 0; i < pe.envoyer.length; i++) { var xe = pe.envoyer[i]; if (await envoyerE(xe.cle, xe.href, xe.etag, xe.uid, xe.nouveau, parCle[xe.cle])) res.evenements.envoyes++; }
      for (i = 0; i < pe.recevoir.length; i++) {
        var ye = pe.recevoir[i], loc = parCle[ye.cle], uidE = ye.evt.uid || ICS.uid(ye.cle);
        if (ye.sansChangement) { memE[ye.cle] = { href: ye.href, etag: ye.etag, emp: empreinteEvt(loc), debut: loc.debut, uid: uidE }; continue; }
        var apres = loc;
        if (loc.genre === 'perso') {
          apres = Object.assign({}, loc, { debut: ye.evt.debut, fin: ye.evt.fin, journee: ye.evt.journee, titre: ye.evt.titre || loc.titre, lieu: ye.evt.lieu, note: ye.evt.note });
          await o.agenda.enregistrer(ye.cle, apres, loc); res.evenements.recus++;
        } else if (ye.evt.debut !== loc.debut || ye.evt.fin !== loc.fin) {
          // Élément de l'Agenda : seul l'horaire revient, s'il est permis à l'agent ; le reste est remis comme dans Tessera
          var ok = false;
          if (loc.modifiable) { try { await o.agenda.enregistrer(ye.cle, { debut: ye.evt.debut, fin: ye.evt.fin }, loc); ok = true; res.evenements.recus++; } catch (e) { ok = false; } }
          if (ok) apres = Object.assign({}, loc, { debut: ye.evt.debut, fin: ye.evt.fin });
          else res.evenements.remis++;
        }
        if (empreinteEvt(apres) !== empreinteEvt(ye.evt)) { if (loc.genre !== 'perso' && apres === loc) res.evenements.remis++; await envoyerE(ye.cle, ye.href, ye.etag, uidE, false, apres); }
        else memE[ye.cle] = { href: ye.href, etag: ye.etag, emp: empreinteEvt(apres), debut: apres.debut, uid: uidE };
      }
      for (i = 0; i < pe.creerLocal.length; i++) {
        var ze = pe.creerLocal[i], nouvE = { genre: 'perso', debut: ze.evt.debut, fin: ze.evt.fin, journee: ze.evt.journee, titre: ze.evt.titre || 'Rendez-vous', lieu: ze.evt.lieu, note: ze.evt.note };
        var ncle = await o.agenda.creer(nouvE);
        memE[ncle] = { href: ze.href, etag: ze.etag, emp: empreinteEvt(nouvE), debut: nouvE.debut, uid: ze.evt.uid };
        res.evenements.crees++;
      }
      for (i = 0; i < pe.supprimerLocal.length; i++) { await o.agenda.retirer(pe.supprimerLocal[i]); delete memE[pe.supprimerLocal[i]]; res.evenements.retiresIci++; }
      for (i = 0; i < pe.supprimerDistant.length; i++) {
        try { await c.supprimer(pe.supprimerDistant[i].href, pe.supprimerDistant[i].etag); res.evenements.retires++; }
        catch (e) { if (e.code === 'conflit') res.evenements.reportes++; else throw e; }
      }
      cfg.memEvts = memE;
    }
    if (cfg.afficher) {
      var d0 = minuit(maintenant) - 14 * JOUR, d1 = minuit(maintenant) + 120 * JOUR;
      res.affiches = ICS.lire((await c.lister(cfg.afficher, 'VEVENT', d0, d1)).map(function (r) { return r.ics; }).join('\r\n'), d0, d1).slice(0, 3000);
    }
    return { config: cfg, resume: res };
  }

  // ------------------------------------------------------------ Adresses autorisées
  /** Origines https autorisées par la règle connect-src d'une page (texte de la règle de sécurité du contenu). */
  function origines(csp) {
    var m = /(?:^|;)\s*connect-src\s+([^;]*)/i.exec(String(csp || ''));
    if (!m) return [];
    return m[1].trim().split(/\s+/).filter(function (x) { return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(x); }).map(function (x) { return x.replace(/\/$/, ''); });
  }
  /** Adresse proposée pour Zimbra : <origine>/dav/<identifiant>/. */
  function adresseZimbra(origine, identifiant) { return String(origine || '').replace(/\/$/, '') + '/dav/' + encodeURIComponent(String(identifiant || '').trim()).replace(/%40/g, '@') + '/'; }
  function autorisee(adresse, liste) { try { var o = new URL(adresse).origin; return (liste || []).some(function (x) { return new URL(x).origin === o; }); } catch (e) { return false; } }

  // ------------------------------------------------------------ Serveur simulé (tests, démonstration)
  /**
   * Serveur CalDAV en mémoire : { fetch, agents, elements, changerMotDePasse(id, mdp), modifier(href, f) }. Un agent :
   * identifiant, mot de passe ; dossier /dav/<identifiant>/ avec un agenda « Calendrier » (VEVENT) et « Tâches » (VTODO).
   */
  function serveurSimule(o) {
    o = o || {};
    var origine = o.origine || 'https://zimbra.exemple.fictif', agents = {}, cols = {}, elts = {}, n = 0;
    (o.agents || [{ identifiant: 'agent', motDePasse: 'secret' }]).forEach(function (a) {
      agents[a.identifiant] = a.motDePasse;
      var m = '/dav/' + a.identifiant + '/';
      cols[m + 'Calendar/'] = { nom: 'Calendrier', comp: ['VEVENT'] };
      cols[m + 'Tasks/'] = { nom: 'Tâches', comp: ['VTODO'] };
    });
    function rep(status, texte, etag) { return { status: status, text: function () { return Promise.resolve(texte || ''); }, headers: { get: function (k) { return /^etag$/i.test(k) ? etag || null : null; } } }; }
    function ms(items) { return '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' + items.join('') + '</d:multistatus>'; }
    function propstat(href, props) { return '<d:response><d:href>' + echXml(href) + '</d:href><d:propstat><d:prop>' + props + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'; }
    function proprietaire(chemin) { var m = /^\/dav\/([^/]+)\//.exec(chemin); return m ? m[1] : null; }
    async function fetch(url, init) {
      var u = new URL(url), chemin = decodeURIComponent(u.pathname), meth = (init && init.method) || 'GET', h = (init && init.headers) || {}, corps = (init && init.body) || '';
      if (u.origin !== origine) throw new TypeError('Failed to fetch');
      var a = /^Basic (.+)$/.exec(h.Authorization || ''), dec = a ? (typeof atob === 'function' ? decodeURIComponent(escape(atob(a[1]))) : Buffer.from(a[1], 'base64').toString('utf8')) : '', i = dec.indexOf(':');
      var id = i >= 0 ? dec.slice(0, i) : '', mdp = i >= 0 ? dec.slice(i + 1) : '';
      if (!id || agents[id] === undefined || agents[id] !== mdp) return rep(401, 'Unauthorized');
      var pr = proprietaire(chemin);
      if (pr !== null && pr !== id) return rep(403, 'Forbidden');
      var maison = '/dav/' + id + '/';
      if (meth === 'PROPFIND') {
        if (h.Depth === '0') return rep(207, ms([propstat(chemin, '<d:current-user-principal><d:href>' + maison + '</d:href></d:current-user-principal><C:calendar-home-set><d:href>' + maison + '</d:href></C:calendar-home-set>')]));
        return rep(207, ms(Object.keys(cols).filter(function (c) { return c.indexOf(maison) === 0; }).map(function (c) {
          return propstat(c, '<d:displayname>' + echXml(cols[c].nom) + '</d:displayname><d:resourcetype><d:collection/><C:calendar/></d:resourcetype><C:supported-calendar-component-set>' + cols[c].comp.map(function (x) { return '<C:comp name="' + x + '"/>'; }).join('') + '</C:supported-calendar-component-set>');
        })));
      }
      if (meth === 'MKCALENDAR') {
        if (cols[chemin]) return rep(405, 'exists');
        var nom = (/<d:displayname>([\s\S]*?)<\/d:displayname>/.exec(corps) || [])[1] || 'Agenda', comp = (/comp name="([A-Z]+)"/.exec(corps) || [])[1] || 'VEVENT';
        cols[chemin] = { nom: entites(nom), comp: [comp] };
        return rep(201, '');
      }
      if (meth === 'REPORT') {
        var cf = /comp-filter name="VCALENDAR"><c:comp-filter name="([A-Z]+)"/.exec(corps), voulu = cf ? cf[1] : 'VEVENT';
        if (!cols[chemin]) return rep(404, '');
        return rep(207, ms(Object.keys(elts).filter(function (k) { return k.indexOf(chemin) === 0 && k.slice(chemin.length).indexOf('/') < 0 && elts[k].ics.indexOf('BEGIN:' + voulu) >= 0; }).map(function (k) {
          return propstat(k, '<d:getetag>' + echXml(elts[k].etag) + '</d:getetag><C:calendar-data>' + echXml(elts[k].ics) + '</C:calendar-data>');
        })));
      }
      if (meth === 'PUT') {
        var col = chemin.replace(/[^/]+$/, '');
        if (!cols[col]) return rep(409, 'no collection');
        if (h['If-None-Match'] === '*' && elts[chemin]) return rep(412, '');
        if (h['If-Match'] && (!elts[chemin] || elts[chemin].etag !== h['If-Match'])) return rep(412, '');
        var etag = '"' + (++n) + '"';
        elts[chemin] = { ics: String(corps), etag: etag };
        return rep(elts[chemin] ? 204 : 201, '', o.sansEtag ? null : etag);
      }
      if (meth === 'DELETE') {
        if (!elts[chemin]) return rep(404, '');
        if (h['If-Match'] && elts[chemin].etag !== h['If-Match']) return rep(412, '');
        delete elts[chemin];
        return rep(204, '');
      }
      return rep(405, '');
    }
    return {
      origine: origine, fetch: fetch, elements: elts, agendas: cols,
      changerMotDePasse: function (id, mdp) { agents[id] = mdp; },
      /** Simule une modification faite sur le téléphone : f(ics) → nouveau texte (null : suppression). */
      modifier: function (href, f) { var k = decodeURIComponent(new URL(href, origine).pathname); if (!elts[k]) return false; var t = f(elts[k].ics); if (t === null) delete elts[k]; else elts[k] = { ics: t, etag: '"' + (++n) + '"' }; return true; },
      ajouter: function (chemin, ics) { elts[chemin] = { ics: ics, etag: '"' + (++n) + '"' }; }
    };
  }

  return {
    lireXml: lireXml, reponses: reponses, Client: Client, ErreurCaldav: ErreurCaldav,
    ecrireTache: ecrireTache, lireTache: lireTache, empreinte: empreinte, uidTache: uidTache, idDeUid: idDeUid, planTaches: planTaches, fusionner: fusionner,
    ecrireEvenement: ecrireEvenement, lireEvenement: lireEvenement, planEvenements: planEvenements, cleDeUid: cleDeUid, empreinteEvt: empreinteEvt, hrefEvt: hrefEvt, uidDe: uidDe,
    synchroniser: synchroniser, NOMS: NOMS, origines: origines, adresseZimbra: adresseZimbra, autorisee: autorisee, serveurSimule: serveurSimule, CHAMPS: CHAMPS
  };
});
