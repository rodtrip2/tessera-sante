// SPDX-License-Identifier: EUPL-1.2
// Recalcul incrémental des modules (0.21.2) : même état que le recalcul complet, quel que soit l'ordre d'arrivée
// des saisies (à la fin, en retard, annulations, lots, saisies de la fiche patient). Données fictives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TZ = 'Europe/Paris';
globalThis.self = globalThis;
globalThis.SIC = { rules: require('../app/js/rules.js'), crypto: require('../app/js/crypto.js') };
SIC.model = require('../app/js/model.js');
SIC.modules = require('../app/js/modules.js');
SIC.champs = require('../app/js/champs.js');
SIC.couleurs = require('../app/js/couleurs.js');
SIC.patients = require('../app/js/module-patients.js');
require('../app/js/module-isocont.js');
SIC.medecins = require('../app/js/medecins.js');
SIC.agendaParticipants = require('../app/js/agenda-participants.js');
SIC.agendaPermissions = require('../app/js/agenda-permissions.js');
SIC.agenda = require('../app/js/module-agenda.js');
SIC.suivi = require('../app/js/module-suivi.js');
require('../app/js/module-vehicules.js');
require('../app/js/module-vue.js');
const N = require('../app/js/noyau-journal.js');

// Générateur pseudo-aléatoire reproductible
function alea(graine) { let x = graine >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function genererSaisies(r, n) {
  const res = [], t0 = Date.UTC(2026, 0, 1, 8);
  let k = 0, t = 0;
  const ev = (type, data, decalage) => {
    k++; t += 1 + Math.floor(r() * 3);
    const at = new Date(t0 + (t - (decalage || 0)) * 6e4).toISOString();
    return { v: 1, id: at.replace(/[-:]/g, '').replace(/\.\d+/, '') + '_a' + (k % 3) + '_' + String(k).padStart(6, '0'), at, by: 'a' + (k % 3), type, data };
  };
  for (let i = 0; i < n; i++) {
    const p = 'P' + (1 + Math.floor(r() * 6)), R = 'R' + (1 + Math.floor(r() * 5)), occ = '2026-01-0' + (2 + Math.floor(r() * 5));
    const x = r(), retard = r() < 0.08 ? 30 + Math.floor(r() * 500) : 0;   // saisie arrivée en retard (autre poste)
    let e;
    if (x < 0.10) e = ev('PATIENT', { patientId: p, nom: 'NOM' + p + ' (fictif)', prenom: 'X', service: 'U1', referents: [{ id: null, nom: 'IDE ' + i }] }, retard);
    else if (x < 0.15) e = ev('MODE_HOSPI', { patientId: p, mode: r() < 0.5 ? 'SDT' : 'SL', date: t0 + i * 6e4 }, retard);
    else if (x < 0.20) e = ev('SEJOUR', { patientId: p, sejourId: 'S' + p, entree: '2026-01-01', service: 'U1', sortiePrevue: r() < 0.5 ? { etat: 'envisagee', debut: '2026-02-01' } : undefined }, retard);
    else if (x < 0.27) e = ev('MESURE_DEBUT', { mesureId: 'M' + i, patientId: p, service: 'U1', typeMesure: 'Isolement', debut: t0 + i * 6e4, lieu: 'CSI 1', csi: true, psychiatre: 'Dr A (fictif)', modeHospi: '' }, retard);
    else if (x < 0.32) { const m = res.filter(z => z.type === 'MESURE_DEBUT').pop(); if (!m) continue; e = ev('MESURE_FIN', { mesureId: m.data.mesureId, fin: t0 + (i + 30) * 6e4, psychiatre: 'Dr A (fictif)' }, retard); }
    else if (x < 0.42) e = ev('RDV', { id: R, nature: 'accompagnement', titre: 'Sortie ' + i + ' (fictif)', debut: t0 + 864e5 * 3, fin: t0 + 864e5 * 3 + 36e5, service: 'U1', patients: [p], professionnels: [], participation: { mode: 'exact', nombre: 2, libre: true } }, retard);
    else if (x < 0.52) e = ev('INSCRIPTION', { rdv: R, occurrence: occ, agent: 'a' + (i % 4), nom: 'Agent (fictif)', etat: 'inscrit', retrait: r() < 0.2 ? true : undefined }, retard);
    else if (x < 0.60) e = ev('TACHE_FAITE', { tache: 'T1', occurrence: occ }, retard);
    else if (x < 0.66) e = ev('SUIVI', { id: 'E' + i, patient: p, service: 'U1', date: '2026-01-0' + (1 + i % 9), medecin: 'Dr A (fictif)', quoi: 'entretien' }, retard);
    else if (x < 0.72) e = ev('CHECK', { rdv: R, item: 'c1', occurrence: occ, fait: r() < 0.7 }, retard);
    else if (x < 0.78) e = ev('VALIDATION', { rdv: R, validation: 'pv', occurrence: occ, statut: 'etape', etape: 'orale', processus: 'libre' }, retard);
    else if (x < 0.86 && res.length) { const c = res[Math.floor(r() * res.length)]; e = ev('ANNULATION', { cible: c.id, motif: 'Erreur (fictif)' }, retard); }
    else if (x < 0.90) e = ev('LOT', { libelle: 'Import (fictif)', evenements: [{ type: 'PATIENT', data: { patientId: p, nom: 'LOT' + i + ' (fictif)', service: 'U1' } }, { type: 'TACHE_FAITE', data: { tache: 'T1', occurrence: occ } }] }, retard);
    else if (x < 0.95) e = ev('TACHE', { id: 'T1', niveau: 'service', titre: 'Tâche (fictif)', service: 'U1', regularite: { type: 'jour' }, debut: '2026-01-01' }, retard);
    else e = ev('PRESENCE', { id: 'PM' + (i % 3), medecin: 'Dr A (fictif)', service: 'U1', nature: 'presence', jours: [1], moments: ['matin'], repetition: 'semaine', debut: '2026-01-05' }, retard);
    if (r() < 0.5 && res.length) e.prec = res[res.length - 1].id;   // chaînage, parfois vers une saisie absente
    res.push(e);
  }
  return res;
}

const MODULES = SIC.modules.liste();
const etats = evts => { const o = {}; MODULES.forEach(m => { o[m.id] = JSON.stringify(m.saisies.reduire(evts)); }); return o; };

test('Recalcul incrémental : état identique au recalcul complet après chaque arrivée de saisies', () => {
  for (let graine = 1; graine <= 12; graine++) {
    const r = alea(graine * 7919), toutes = genererSaisies(r, 220);
    N.oublierEtats();
    const journal = N.suivre([]);   // journal de la session : saisies ajoutées par paquets (synchronisation) ou une à une (poste)
    let i = 0, controles = 0;
    while (i < toutes.length) {
      const paquet = 1 + Math.floor(r() * 4);
      if (r() < 0.5) toutes.slice(i, i + paquet).forEach(e => journal.push(e));
      else { const nouveau = N.suivre(journal.concat(toutes.slice(i, i + paquet))); journal.length = 0; nouveau.forEach(e => journal.push(e)); }
      i += paquet;
      const inc = etats(journal), complet = etats(journal.slice());   // tableau non suivi : recalcul complet
      MODULES.forEach(m => assert.equal(inc[m.id], complet[m.id], 'graine ' + graine + ', ' + i + ' saisies, module ' + m.id));
      controles++;
      if (r() < 0.05) N.oublierEtats();   // lecture complète des journaux
    }
    assert.ok(controles > 40);
  }
});

test('Recalcul incrémental : seul le journal suivi en profite ; un état rendu a une nouvelle identité', () => {
  const r = alea(42), s = genererSaisies(r, 60).filter(e => e.type !== 'ANNULATION');
  N.oublierEtats();
  const journal = N.suivre(s.slice(0, 40)), A = SIC.agenda;
  const e1 = A.reduire(journal), e2 = A.reduire(journal);
  assert.notEqual(e1, e2);
  assert.equal(JSON.stringify(e1), JSON.stringify(e2));
  // Simulation sur une copie prolongée (ex. « et si… ») : l'état de la session n'est pas touché
  const avant = JSON.stringify(A.reduire(journal));
  A.reduire(journal.concat([{ v: 1, id: '20270101T000000Z_a1_ffffffff', at: '2027-01-01T00:00:00.000Z', by: 'a1', type: 'TACHE_FAITE', data: { tache: 'T1', occurrence: '2027-01-01' } }]));
  assert.equal(JSON.stringify(A.reduire(journal)), avant);
});
