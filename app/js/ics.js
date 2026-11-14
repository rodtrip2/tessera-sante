/*
 * Tessera Santé — échanges d'agenda par fichier .ics (lot A, 14 novembre 2026).
 *
 * Format d'agenda standard (RFC 5545), lu par Outlook, Zimbra, Thunderbird, Google Agenda… Tessera ne fait aucune
 * connexion sortante : l'agent exporte un fichier et l'importe lui-même dans sa messagerie, ou fait l'inverse.
 * - `ecrire` : fichier d'export ; identifiant stable par événement (`UID`) pour qu'un nouvel export mette à jour les
 *   rendez-vous déjà importés, `SEQUENCE` croissante, événements retirés depuis le dernier export marqués annulés.
 *   L'appelant ne fournit jamais d'identité de patient : seuls le libellé, le lieu et l'horaire sont écrits.
 * - `lire` : fichier importé (lu dans le navigateur, jamais copié sur le partage) ; seuls l'horaire, l'objet et le lieu
 *   sont repris ; répétitions simples (quotidienne, hebdomadaire, mensuelle, annuelle ; INTERVAL, COUNT, UNTIL, BYDAY,
 *   EXDATE) développées sur la période demandée ; heures avec fuseau (`TZID`) lues comme heures locales du poste.
 * Aucune dépendance au navigateur : testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).ics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JOUR = 86400000;
  function deux(n) { return String(n).padStart(2, '0'); }
  /** Texte d'une propriété : antislash, point-virgule, virgule et retours à la ligne échappés. */
  function echapper(t) { return String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function desechapper(t) { return String(t || '').replace(/\\([\\;,nN])/g, function (m, c) { return c === 'n' || c === 'N' ? '\n' : c; }); }
  /** Lignes repliées à 75 octets environ (on compte les caractères, prudemment à 73). */
  function replier(l) {
    var res = [], s = l;
    while (s.length > 73) { res.push(s.slice(0, 73)); s = ' ' + s.slice(73); }
    res.push(s);
    return res.join('\r\n');
  }
  function utc(t) { var d = new Date(t); return d.getUTCFullYear() + deux(d.getUTCMonth() + 1) + deux(d.getUTCDate()) + 'T' + deux(d.getUTCHours()) + deux(d.getUTCMinutes()) + deux(d.getUTCSeconds()) + 'Z'; }
  function dateSeule(t) { var d = new Date(t); return d.getFullYear() + deux(d.getMonth() + 1) + deux(d.getDate()); }
  /** Identifiant d'événement utilisable dans un UID (lettres, chiffres, tiret, point). */
  function propre(x) { return String(x || '').replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'x'; }
  function uid(cle) { return 'tessera-' + propre(cle) + '@tessera-sante'; }

  /**
   * Fichier .ics d'export. `evenements` : [{ cle (stable), debut, fin, titre, lieu, journee }] ; `options` :
   * { nom (du calendrier), maintenant, annules: [{ cle, debut, fin, titre }] }. Rend le texte du fichier.
   */
  function ecrire(evenements, options) {
    var o = options || {}, maintenant = o.maintenant || Date.now(), seq = Math.max(0, Math.floor((maintenant - Date.UTC(2026, 0, 1)) / 60000));
    var l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tessera Santé//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (o.nom) l.push('X-WR-CALNAME:' + echapper(o.nom));
    function evt(e, annule) {
      l.push('BEGIN:VEVENT', 'UID:' + uid(e.cle), 'DTSTAMP:' + utc(maintenant), 'SEQUENCE:' + seq);
      if (e.journee) {
        var f = e.fin && e.fin > e.debut ? e.fin : e.debut + JOUR;
        l.push('DTSTART;VALUE=DATE:' + dateSeule(e.debut), 'DTEND;VALUE=DATE:' + dateSeule(f));
      } else {
        l.push('DTSTART:' + utc(e.debut), 'DTEND:' + utc(e.fin && e.fin > e.debut ? e.fin : e.debut + 3600000));
      }
      l.push('SUMMARY:' + echapper((annule ? 'Annulé : ' : '') + (e.titre || 'Rendez-vous')));
      if (e.lieu) l.push('LOCATION:' + echapper(e.lieu));
      l.push('STATUS:' + (annule ? 'CANCELLED' : 'CONFIRMED'), 'TRANSP:OPAQUE', 'END:VEVENT');
    }
    (evenements || []).forEach(function (e) { evt(e, false); });
    (o.annules || []).forEach(function (e) { evt(e, true); });
    l.push('END:VCALENDAR');
    return l.map(replier).join('\r\n') + '\r\n';
  }

  /**
   * Événements annulés depuis le dernier export : ceux de `precedents` ({ cle: { debut, fin, titre, journee } }) qui
   * tombent dans la période et ne figurent plus parmi `actuels`. Rend aussi la mémoire à garder pour le prochain export.
   */
  function comparer(precedents, actuels, debut, fin) {
    var p = precedents && typeof precedents === 'object' ? precedents : {}, cles = {}, annules = [], memoire = {};
    (actuels || []).forEach(function (e) { cles[e.cle] = 1; memoire[e.cle] = { debut: e.debut, fin: e.fin, titre: e.titre, journee: !!e.journee }; });
    Object.keys(p).forEach(function (k) {
      var x = p[k] || {};
      if (cles[k] || !isFinite(x.debut)) return;
      if (x.debut >= debut && x.debut < fin) annules.push({ cle: k, debut: x.debut, fin: x.fin, titre: x.titre, journee: x.journee });
      else if (x.debut >= fin || x.debut >= Date.now() - 90 * JOUR) memoire[k] = x;   // hors période : gardé pour un prochain export
    });
    return { annules: annules, memoire: memoire };
  }

  // ------------------------------------------------------------ Lecture
  function deplier(texte) {
    return String(texte || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }
  function ligne(l) {
    var i = -1, guill = false;
    for (var k = 0; k < l.length; k++) { var c = l[k]; if (c === '"') guill = !guill; else if (c === ':' && !guill) { i = k; break; } }
    if (i < 0) return null;
    var tete = l.slice(0, i).split(';'), params = {};
    tete.slice(1).forEach(function (p) { var j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); });
    return { nom: tete[0].toUpperCase(), params: params, valeur: l.slice(i + 1) };
  }
  /** Date d'une propriété : { t, journee } ; heure UTC (Z) ou heure locale du poste (avec ou sans TZID). */
  function lireDate(v, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    if (!m[4] || (params && params.VALUE === 'DATE')) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), journee: true };
    if (m[7]) return { t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), journee: false };
    return { t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime(), journee: false };
  }
  function duree(v) {
    var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    var ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * JOUR + ((+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  }
  var JOURS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function regle(v) {
    var r = {};
    String(v || '').split(';').forEach(function (p) { var j = p.indexOf('='); if (j > 0) r[p.slice(0, j).toUpperCase()] = p.slice(j + 1); });
    return r;
  }
  /** Débuts des occurrences d'une répétition simple, dans [debut, fin[ (500 au plus). */
  function occurrences(t0, rr, exclues, debut, fin) {
    var r = regle(rr), freq = r.FREQ, pas = Math.max(1, +r.INTERVAL || 1), max = r.COUNT ? +r.COUNT : Infinity;
    var jusque = r.UNTIL ? (lireDate(r.UNTIL) || {}).t : null, res = [], n = 0, d0 = new Date(t0);
    var jours = r.BYDAY ? r.BYDAY.split(',').map(function (x) { return JOURS[x.replace(/^[+-]?\d+/, '').toUpperCase()]; }).filter(function (x) { return x !== undefined; }) : null;
    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(freq) < 0) return t0 >= debut && t0 < fin ? [t0] : [];
    function garder(t) {
      if (t < t0) return true;
      if (jusque !== null && t > jusque) return false;
      if (n >= max) return false;
      n++;
      if (t >= debut && t < fin && !exclues[t]) res.push(t);
      return res.length < 500 && t < fin;
    }
    var i, d;
    for (i = 0; i < 5000; i++) {
      if (freq === 'DAILY') { d = new Date(d0); d.setDate(d0.getDate() + i * pas); if (!garder(d.getTime())) break; }
      else if (freq === 'WEEKLY') {
        var lun = new Date(d0); lun.setDate(d0.getDate() - ((d0.getDay() + 6) % 7) + i * 7 * pas);
        var js = jours && jours.length ? jours.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }) : [d0.getDay()], stop = false;
        for (var k = 0; k < js.length && !stop; k++) { d = new Date(lun); d.setDate(lun.getDate() + ((js[k] + 6) % 7)); if (!garder(d.getTime())) stop = true; }
        if (stop) break;
      } else if (freq === 'MONTHLY') { d = new Date(d0); d.setDate(1); d.setMonth(d0.getMonth() + i * pas); if (d0.getDate() > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) continue; d.setDate(d0.getDate()); if (!garder(d.getTime())) break; }
      else { d = new Date(d0); d.setFullYear(d0.getFullYear() + i * pas); if (!garder(d.getTime())) break; }
    }
    return res;
  }

  /**
   * Événements d'un fichier .ics dans [debut, fin[ : [{ id, debut, fin, objet, lieu, journee }], triés. Les événements
   * annulés et les modifications d'une occurrence (RECURRENCE-ID) remplacent l'occurrence d'origine. Rien d'autre
   * n'est repris (ni description, ni participants, ni pièces jointes).
   */
  function lire(texte, debut, fin) {
    var ls = deplier(texte), evts = [], cur = null, profondeur = 0;
    ls.forEach(function (brut) {
      if (!brut) return;
      var p = ligne(brut);
      if (!p) return;
      if (p.nom === 'BEGIN') { if (p.valeur.toUpperCase() === 'VEVENT') { cur = { ex: {} }; profondeur = 0; } else if (cur) profondeur++; return; }
      if (p.nom === 'END') { if (p.valeur.toUpperCase() === 'VEVENT' && cur) { evts.push(cur); cur = null; } else if (cur) profondeur--; return; }
      if (!cur || profondeur > 0) return;
      if (p.nom === 'UID') cur.uid = p.valeur;
      else if (p.nom === 'SUMMARY') cur.objet = desechapper(p.valeur).slice(0, 200);
      else if (p.nom === 'LOCATION') cur.lieu = desechapper(p.valeur).slice(0, 200);
      else if (p.nom === 'DTSTART') cur.debut = lireDate(p.valeur, p.params);
      else if (p.nom === 'DTEND') cur.fin = lireDate(p.valeur, p.params);
      else if (p.nom === 'DURATION') cur.duree = duree(p.valeur);
      else if (p.nom === 'RRULE') cur.rrule = p.valeur;
      else if (p.nom === 'STATUS') cur.statut = p.valeur.toUpperCase();
      else if (p.nom === 'RECURRENCE-ID') cur.recurrence = lireDate(p.valeur, p.params);
      else if (p.nom === 'EXDATE') p.valeur.split(',').forEach(function (v) { var x = lireDate(v, p.params); if (x) cur.ex[x.t] = 1; });
    });
    var remplaces = {};
    evts.forEach(function (e) { if (e.recurrence && e.uid) remplaces[e.uid + '|' + e.recurrence.t] = 1; });
    var res = [];
    evts.forEach(function (e, i) {
      if (!e.debut || e.statut === 'CANCELLED') return;
      var journee = e.debut.journee, long = e.fin ? e.fin.t - e.debut.t : (e.duree !== null && e.duree !== undefined ? e.duree : (journee ? JOUR : 0));
      if (long < 0) long = 0;
      var debuts = e.rrule && !e.recurrence ? occurrences(e.debut.t, e.rrule, e.ex, debut - Math.max(long, JOUR), fin) : [e.debut.t];
      debuts.forEach(function (t) {
        if (e.rrule && !e.recurrence && e.uid && remplaces[e.uid + '|' + t]) return;
        var f = t + long;
        if (!(t < fin && (f > debut || (f === t && t >= debut)))) return;
        res.push({ id: (e.uid || 'evt-' + i) + '|' + t, debut: t, fin: f, objet: e.objet || '(sans objet)', lieu: e.lieu || '', journee: journee });
      });
    });
    return res.sort(function (a, b) { return a.debut - b.debut || a.fin - b.fin; });
  }

  return { ecrire: ecrire, lire: lire, comparer: comparer, uid: uid, echapper: echapper, occurrences: occurrences };
});
