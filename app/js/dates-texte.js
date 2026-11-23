// SPDX-License-Identifier: EUPL-1.2
/*
 * Date et heure lues dans un texte en français (23 novembre 2026, demande du porteur) : un passage d'un document lié à
 * un nouvel événement de l'agenda propose sa date et son heure, et le reste du texte devient le titre.
 *
 * Reconnus : « 12/11/2026 », « 12/11/26 », « 12/11 », « 12.11.2026 », « 2026-11-12 », « 12 novembre 2026 »,
 * « 12 nov. », « mardi 12 novembre », « 1er décembre », « aujourd'hui », « demain », « après-demain » ; heures « 14h »,
 * « 14 h 30 », « 14h30 », « 14:30 » ; plage « de 14h à 15h30 », « 14h-15h ». Sans année : la prochaine date à venir.
 * Logique seule, testable sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).datesTexte = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MOIS = { janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, mar: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, sep: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
  var JOURS = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
  function sansAccents(t) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function valide(a, m, j) { var d = new Date(a, m - 1, j); return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j; }
  function minuit(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function annee4(a) { a = +a; return a < 100 ? 2000 + a : a; }

  /**
   * { debut (ms, heure locale), fin (ms ou null), heure (true si une heure est donnée), titre (le reste du texte) } ou
   * null sans date reconnue. `maintenant` : instant de référence (défaut : maintenant).
   */
  function extraire(texte, maintenant) {
    var t0 = String(texte || '').replace(/\s+/g, ' ').trim(), t = sansAccents(t0).toLowerCase(), now = maintenant || Date.now(), auj = new Date(now);
    if (!t) return null;
    var date = null, morceaux = [];
    function retenir(m, a, mo, j, avecAnnee) {
      if (date || !m || !valide(a, mo, j)) return false;
      if (!avecAnnee && new Date(a, mo - 1, j).getTime() < minuit(now)) a++;
      date = { a: a, m: mo, j: j }; morceaux.push([m.index, m.index + m[0].length]); return true;
    }
    var m, re;
    // AAAA-MM-JJ
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/; m = re.exec(t); if (m) retenir(m, +m[1], +m[2], +m[3], true);
    // JJ/MM/AAAA, JJ/MM/AA, JJ/MM, JJ.MM.AAAA (précédé éventuellement d'un jour de la semaine)
    if (!date) { re = new RegExp('(?:\\b' + JOURS + '\\s+)?\\b(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2}|\\d{4}))?\\b'); m = re.exec(t); if (m) retenir(m, m[3] ? annee4(m[3]) : auj.getFullYear(), +m[2], +m[1], !!m[3]); }
    // 12 novembre 2026, 1er déc., mardi 12 novembre
    if (!date) {
      re = new RegExp('(?:\\b' + JOURS + '\\s+)?\\b(\\d{1,2})(?:er)?\\s+(' + Object.keys(MOIS).sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\.?(?:\\s+(\\d{4}))?(?![a-z])');
      m = re.exec(t); if (m) retenir(m, m[3] ? +m[3] : auj.getFullYear(), MOIS[m[2]], +m[1], !!m[3]);
    }
    // Aujourd'hui, demain, après-demain
    if (!date) {
      m = /\b(apres-demain|apres demain|aujourd'hui|aujourd’hui|demain)\b/.exec(t);
      if (m) { var dec = /^apres/.test(m[1]) ? 2 : m[1] === 'demain' ? 1 : 0, d = new Date(minuit(now) + dec * 864e5 + 12 * 36e5); date = { a: d.getFullYear(), m: d.getMonth() + 1, j: d.getDate() }; morceaux.push([m.index, m.index + m[0].length]); }
    }
    if (!date) return null;
    // Heures : plage « de 14h à 15h30 », « 14h-15h », puis heure seule
    var h1 = null, h2 = null;
    var H = '(\\d{1,2})\\s?(?:h|:)\\s?(\\d{2})?';
    re = new RegExp('(?:\\bde\\s+)?\\b' + H + '\\s*(?:a|-|–|jusqu\'a)\\s*' + H + '(?![\\d])');
    m = re.exec(t);
    if (m && +m[1] < 24 && +m[3] < 24) { h1 = [+m[1], +(m[2] || 0)]; h2 = [+m[3], +(m[4] || 0)]; morceaux.push([m.index, m.index + m[0].length]); }
    else {
      re = new RegExp('(?:\\ba\\s+)?\\b' + H + '(?![\\d])'); m = re.exec(t);
      if (m && +m[1] < 24 && +(m[2] || 0) < 60) { h1 = [+m[1], +(m[2] || 0)]; morceaux.push([m.index, m.index + m[0].length]); }
    }
    var debut = new Date(date.a, date.m - 1, date.j, h1 ? h1[0] : 10, h1 ? h1[1] : 0).getTime();
    var fin = h2 ? new Date(date.a, date.m - 1, date.j, h2[0], h2[1]).getTime() : null;
    if (fin !== null && fin <= debut) fin = null;
    // Titre : le texte sans la date ni l'heure, ni les mots qui les introduisaient
    // Mots qui introduisent la date ou l'heure retirés avec elles (« le 3/12 à 14h » au milieu d'une phrase)
    morceaux.forEach(function (p) { var m0 = /(\s+(le|la|du|au|de|a|des|pour|avant|apres|jusqu'au|jusqu’au|prevu|prevue|prevus|prevues))+\s*$/.exec(t.slice(0, p[0])); if (m0) p[0] = m0.index; });
    var reste = t0.split(''); morceaux.forEach(function (p) { for (var i = p[0]; i < p[1]; i++) reste[i] = ' '; });
    var titre = reste.join('').replace(/\s+/g, ' ').replace(/^\s*(\d{1,2}|[a-z])[.)]\s+/i, '').replace(/^\s*[-–•*]\s+/, '')
      .replace(/(^|\s)(le|la|du|au|de|à|a|pour|prévu|prévue|prévus|prévues|prévu le)(?=\s*$)/gi, ' ')
      .replace(/^(\s*(le|la|du|au|de|à|a|,|:|-|–|—)\s+)+/i, '')
      .replace(/(\s+(le|du|au|de|à|a|avant|après|apres|dès|jusqu'au|jusqu’au|pour))+\s*([,;:.!?–—-]*)\s*$/i, '$3')
      .replace(/\s+([,;:.!?])/g, '$1').replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '').replace(/\s+/g, ' ').trim();
    return { debut: debut, fin: fin, heure: !!h1, titre: titre ? titre.charAt(0).toUpperCase() + titre.slice(1) : '' };
  }

  return { extraire: extraire };
});
