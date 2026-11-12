// SPDX-License-Identifier: EUPL-1.2
// Agenda : « Quel(s) professionnel(s) ? » et « Quel(s) patient(s) ? » (0.21.0). Données fictives.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/js/module-agenda.js');
const P = require('../app/js/agenda-participants.js');

const OCC = '2026-11-20';
let n = 0;
const ev = (by, type, data) => ({ id: 'e' + (++n), at: new Date(Date.UTC(2026, 10, 12, 8, n)).toISOString(), by, type, data });
const rdv = (participation, plus) => ev('auteur', 'RDV', Object.assign({ id: 'R1', nature: 'accompagnement', titre: 'Sortie au marché (fictif)', debut: Date.UTC(2026, 10, 20, 9), fin: Date.UTC(2026, 10, 20, 11), service: 'U1', patients: [], professionnels: [{ id: 'ide1', nom: 'IDE 1 (fictif)' }], participation }, plus || {}));
const insc = (by, agent, plus) => ev(by, 'INSCRIPTION', Object.assign({ rdv: 'R1', occurrence: OCC, agent, nom: agent + ' (fictif)' }, plus || {}));
const pros = st => A.accompagnateurs(st.rdv.R1, OCC);
const ids = l => l.map(x => x.agent);

test('Ancien réglage : le nombre d’accompagnateurs reste un nombre exact, inscription libre', () => {
  const st = A.reduire([rdv(undefined, { accompagnateurs: 2 }), insc('as1', 'as1')]);
  const p = pros(st);
  assert.deepEqual([p.requis, p.mode, p.prevus, p.total, p.manque, p.complet], [2, 'exact', 1, 2, 0, true]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, []);   // complet : plus d'inscription (comme avant)
});

test('Nombre exact : au-delà, liste d’attente ; le premier prend la place en cas de désistement', () => {
  const evts = [rdv({ mode: 'exact', nombre: 3, libre: true }), insc('as1', 'as1'), insc('as2', 'as2'), insc('as3', 'as3'), insc('as4', 'as4')];
  let p = pros(A.reduire(evts));
  assert.deepEqual([ids(p.inscrits), ids(p.attente), p.total, p.manque], [['as1', 'as2'], ['as3', 'as4'], 3, 0]);
  assert.deepEqual(P.situation(A.reduire(evts).rdv.R1, OCC, { id: 'as4' }), { etat: 'attente', rang: 2, actions: ['retirer'] });
  p = pros(A.reduire(evts.concat([insc('as1', 'as1', { retrait: true })])));
  assert.deepEqual([ids(p.inscrits), ids(p.attente)], [['as2', 'as3'], ['as4']]);
  // Le cadre fait passer un agent en tête
  p = pros(A.reduire(evts.concat([insc('cadre', 'as4', { etat: 'inscrit', prioritaire: true })])));
  assert.deepEqual([ids(p.inscrits), ids(p.attente)], [['as4', 'as1'], ['as2', 'as3']]);
});

test('Minimum et maximum : il manque du monde sous le minimum, attente au-delà du maximum', () => {
  const g = { mode: 'min', nombre: 3, max: 4, libre: true };
  let p = pros(A.reduire([rdv(g), insc('as1', 'as1')]));
  assert.deepEqual([p.manque, p.complet, P.libellePlaces(p)], [1, false, '2/3 à 4']);
  p = pros(A.reduire([rdv(g), insc('as1', 'as1'), insc('as2', 'as2'), insc('as3', 'as3'), insc('as4', 'as4')]));
  assert.deepEqual([p.total, p.complet, ids(p.attente)], [4, true, ['as4']]);
  p = pros(A.reduire([rdv({ mode: 'min', nombre: 1, libre: true }), insc('as1', 'as1'), insc('as2', 'as2')]));
  assert.deepEqual([p.total, p.attente.length, p.complet], [3, 0, false]);   // sans maximum : pas de limite
});

test('Inscrit par un collègue : proposé, il confirme ou refuse avec motif ; celui qui l’a proposé est informé', () => {
  const base = [rdv({ mode: 'exact', nombre: 2, libre: true }), insc('ide2', 'as1', { etat: 'propose' })];
  let st = A.reduire(base);
  assert.deepEqual([pros(st).total, ids(pros(st).proposes)], [1, ['as1']]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as1' }).actions, ['accepter', 'refuser']);
  assert.equal(st.avis.length, 0);   // une proposition attend une réponse, ce n'est pas un avis
  st = A.reduire(base.concat([insc('as1', 'as1', { etat: 'inscrit' })]));
  assert.deepEqual([pros(st).total, st.avis[0].agent, st.avis[0].genre], [2, 'ide2', 'propositionAcceptee']);
  st = A.reduire(base.concat([insc('as1', 'as1', { etat: 'refuse', motif: 'En formation ce jour-là' })]));
  assert.deepEqual([pros(st).total, pros(st).refus[0].motif, st.avis[0].genre, st.avis[0].motif], [1, 'En formation ce jour-là', 'propositionRefusee', 'En formation ce jour-là']);
});

test('Inscription à confirmer : demande, confirmée ou refusée par l’auteur, un organisateur, le cadre ou un rôle réglé', () => {
  const g = { mode: 'min', nombre: 2, aConfirmer: true, organisateurs: ['ide9'] };
  const base = [rdv(g), insc('as1', 'as1', { etat: 'demande' })];
  let st = A.reduire(base);
  assert.deepEqual([pros(st).total, ids(pros(st).demandes)], [1, ['as1']]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, ['demander']);
  const r = st.rdv.R1;
  assert.ok(P.peutConfirmer(r, { id: 'auteur', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'ide9', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'c', roles: ['CADRE'] }));
  assert.ok(!P.peutConfirmer(r, { id: 'x', roles: ['IDE'] }) && P.peutConfirmer(r, { id: 'x', roles: ['SECRETAIRE'] }, ['SECRETAIRE']));
  assert.deepEqual(A.rolesConfirmation({ agendaReglages: { '*': { rolesConfirmation: ['CADRE'] }, U1: { rolesConfirmation: ['CADRE', 'SECRETAIRE'] } } }, 'U1'), ['CADRE', 'SECRETAIRE']);
  assert.deepEqual(A.rolesConfirmation({}, 'U1'), ['CADRE']);
  // Réglages par service : le cadre n'écrit que pour ses services
  const cadre = { roles: ['CADRE'], services: ['U1'] };
  assert.equal(A.controlerCadreReglages({ '*': { a: 1 } }, { '*': { a: 1 }, U1: { rolesConfirmation: ['CADRE', 'IDE'] } }, cadre), true);
  assert.equal(A.controlerCadreReglages({ '*': { a: 1 } }, { '*': { a: 2 } }, cadre), false);
  assert.equal(A.controlerCadreReglages({}, { U2: { a: 1 } }, cadre), false);
  assert.equal(A.controlerCadreReglages({}, { '*': { a: 1 } }, { roles: ['ADMIN'] }), true);
  st = A.reduire(base.concat([insc('auteur', 'as1', { etat: 'inscrit' })]));
  assert.deepEqual([pros(st).total, st.avis[0].genre], [2, 'confirmation']);
  st = A.reduire(base.concat([insc('auteur', 'as1', { etat: 'refuse', motif: 'Effectif du service' })]));
  assert.deepEqual([pros(st).total, st.avis[0].genre, st.avis[0].motif], [1, 'refus', 'Effectif du service']);
});

test('Invitation : agent, groupe ou rôle ; accepter ou refuser ; mélange avec l’inscription libre', () => {
  const g = P.reglage({ participation: { mode: 'exact', nombre: 2, invites: [{ t: 'agent', id: 'as1' }, { t: 'groupe', id: 'nuit' }, { t: 'role', id: 'AS' }, { t: 'x', id: 'y' }] } });
  assert.equal(g.invites.length, 3);
  assert.ok(P.invite(g, { id: 'as1' }) && P.invite(g, { id: 'z', groupes: ['nuit'] }) && P.invite(g, { id: 'z', roles: ['AS'] }) && !P.invite(g, { id: 'z', roles: ['IDE'] }));
  const st = A.reduire([rdv({ mode: 'exact', nombre: 2, invites: [{ t: 'agent', id: 'as1' }] })]);
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as1' }), { etat: 'invite', motif: undefined, actions: ['accepter', 'refuser'] });
  assert.deepEqual(P.situation(st.rdv.R1, OCC, { id: 'as2' }).actions, []);   // sur invitation seulement
  const st2 = A.reduire([rdv({ mode: 'exact', nombre: 2, libre: true, invites: [{ t: 'agent', id: 'as1' }] })]);
  assert.deepEqual(P.situation(st2.rdv.R1, OCC, { id: 'as2' }).actions, ['inscrire']);   // invitation et inscription libre
});

test('Contrôle avant enregistrement', () => {
  const ctl = (g, f, d, compte, peutInscrire) => () => P.controler(A.reduire([rdv(g)].concat(f())).rdv.R1, OCC, Object.assign({ rdv: 'R1', occurrence: OCC }, d), { compte, peutInscrire });
  const libre = { mode: 'exact', nombre: 2, libre: true }, conf = { mode: 'min', nombre: 2, aConfirmer: true }, ferme = { mode: 'exact', nombre: 2 };
  assert.doesNotThrow(ctl(libre, () => [], { agent: 'as1' }, { id: 'as1' }));
  assert.throws(ctl(ferme, () => [], { agent: 'as1' }, { id: 'as1' }), /pas ouvertes/);
  assert.throws(ctl(conf, () => [], { agent: 'as1', etat: 'inscrit' }, { id: 'as1' }), /confirmée par un organisateur/);
  assert.doesNotThrow(ctl(conf, () => [], { agent: 'as1', etat: 'demande' }, { id: 'as1' }));
  assert.throws(ctl(libre, () => [], { agent: 'as1', etat: 'inscrit' }, { id: 'ide2', roles: ['IDE'] }, true), /confirme lui-même/);
  assert.doesNotThrow(ctl(libre, () => [], { agent: 'as1', etat: 'propose' }, { id: 'ide2', roles: ['IDE'] }, true));
  assert.throws(ctl(libre, () => [], { agent: 'as1', etat: 'propose' }, { id: 'ash', roles: ['ASH'] }, false), /inscrire un collègue/);
  const dem = () => [insc('as1', 'as1', { etat: 'demande' })];
  assert.throws(ctl(conf, dem, { agent: 'as1', etat: 'inscrit' }, { id: 'ide2', roles: ['IDE'] }, true), /auteur, un organisateur ou le cadre/);
  assert.doesNotThrow(ctl(conf, dem, { agent: 'as1', etat: 'inscrit' }, { id: 'auteur', roles: ['IDE'] }, true));
  assert.throws(ctl(conf, dem, { agent: 'as1', etat: 'refuse' }, { id: 'c', roles: ['CADRE'] }, true), /motif/);
  assert.throws(ctl(libre, () => [insc('as1', 'as1')], { agent: 'as1', etat: 'inscrit', prioritaire: true }, { id: 'ide2', roles: ['IDE'] }, true), /Seul le cadre/);
  assert.doesNotThrow(ctl(libre, () => [insc('as1', 'as1')], { agent: 'as1', etat: 'inscrit', prioritaire: true }, { id: 'c', roles: ['CADRE'] }, true));
});

test('Patients : maximum de places et liste d’attente, minimum et alerte ; réglage propre à une date', () => {
  const st = A.reduire([rdv({ mode: 'exact', nombre: 1, patientsMin: 2, patientsMax: 3 }, { patients: ['P1', 'P2', 'P3', 'P4'] })]);
  let pp = A.placesPatients(st.rdv.R1, OCC);
  assert.deepEqual([pp.inscrits, pp.attente, pp.manque, pp.complet], [['P1', 'P2', 'P3'], ['P4'], 0, true]);
  const st2 = A.reduire([rdv({ mode: 'exact', nombre: 1, patientsMin: 2 }, { patients: ['P1'] }), ev('auteur', 'OCCURRENCE', { rdv: 'R1', occurrence: OCC, participation: { mode: 'exact', nombre: 1, patientsMin: 3 } })]);
  pp = A.placesPatients(st2.rdv.R1, OCC);
  assert.deepEqual([pp.min, pp.manque], [3, 2]);
  const fiches = { P1: { id: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1' } };
  assert.equal(A.patientsManquants(st2, fiches, ['U1'], Date.UTC(2026, 10, 18), 7).length, 1);
});

test('À répondre et à confirmer', () => {
  const st = A.reduire([rdv({ mode: 'min', nombre: 2, aConfirmer: true, invites: [{ t: 'role', id: 'AS' }] }), insc('ide2', 'ide3', { etat: 'propose' }), insc('ide4', 'ide4', { etat: 'demande' })]);
  const t0 = Date.UTC(2026, 10, 15);
  assert.equal(A.aRepondre(st, {}, { id: 'ide3', roles: ['IDE'] }, ['U1'], t0)[0].situation.etat, 'propose');
  assert.equal(A.aRepondre(st, {}, { id: 'as7', roles: ['AS'] }, ['U1'], t0)[0].situation.etat, 'invite');
  assert.equal(A.aRepondre(st, {}, { id: 'ide8', roles: ['IDE'] }, ['U1'], t0).length, 0);
  assert.deepEqual(A.aConfirmer(st, {}, {}, { id: 'auteur', roles: ['IDE'] }, ['U1'], t0).map(x => x.demande.agent), ['ide4']);
  assert.equal(A.aConfirmer(st, {}, {}, { id: 'ide8', roles: ['IDE'] }, ['U1'], t0).length, 0);
});

test('Événement de plusieurs services : co-organisateur ou invité', () => {
  const fiches = { P1: { id: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1' }, P9: { id: 'P9', nom: 'INDIA', prenom: 'Neuf (fictif)', service: 'U2' } };
  const t0 = Date.UTC(2026, 10, 18), fin = Date.UTC(2026, 10, 25);
  const base = partage => A.reduire([rdv({ mode: 'min', nombre: 2, libre: true }, { patients: ['P1', 'P9'], services: ['U2'], partage })]);
  let x = A.elements(base('invites'), fiches, ['U2'], t0, fin)[0];
  assert.deepEqual([x.externe, x.partage, x.patients], [false, 'invites', ['P9']]);   // l'invité ne voit nommément que ses patients
  x = A.elements(base('co'), fiches, ['U2'], t0, fin)[0];
  assert.deepEqual([x.partage, x.patients], ['co', ['P1', 'P9']]);
  assert.equal(A.elements(base('co'), fiches, ['U1'], t0, fin)[0].partage, null);   // l'organisateur
  assert.equal(A.elements(base('co'), fiches, ['U3'], t0, fin).length, 0);
  // Contrôle : l'invité ne modifie pas, le co-organisateur oui ; personne d'autre ne change le service
  const ctl = (st, type, d, services) => () => A.contrat.saisies.controler(type, d, { etat: st, config: {}, peut: () => true, compte: { id: 'z', roles: ['IDE'], services } });
  assert.throws(ctl(base('invites'), 'RDV', { id: 'R1', titre: 'Autre' }, ['U2']), /invité/);
  assert.doesNotThrow(ctl(base('co'), 'RDV', { id: 'R1', titre: 'Autre' }, ['U2']));
  assert.throws(ctl(base('co'), 'RDV', { id: 'R1', service: 'U2' }, ['U2']), /service organisateur/);
  assert.throws(ctl(base('co'), 'OCCURRENCE', { rdv: 'R1', occurrence: OCC, lieu: 'x' }, ['U3']), /autre service/);
  assert.doesNotThrow(ctl(base('invites'), 'PATIENT_INSCRIT', { rdv: 'R1', patient: 'P9' }, ['U2']));
  assert.throws(ctl(base('invites'), 'PATIENT_INSCRIT', { rdv: 'R1', patient: 'P9' }, ['U3']), /ne participe pas/);
  // Le service invité inscrit puis retire un patient
  const evts = [rdv({ mode: 'min', nombre: 1 }, { patients: ['P1'], services: ['U2'], partage: 'invites' }), ev('ide-u2', 'PATIENT_INSCRIT', { rdv: 'R1', patient: 'P9', service: 'U1' })];
  assert.deepEqual(A.reduire(evts).rdv.R1.patients, ['P1', 'P9']);
  assert.deepEqual(A.reduire(evts.concat([ev('ide-u2', 'PATIENT_INSCRIT', { rdv: 'R1', patient: 'P9', retrait: true, service: 'U1' })])).rdv.R1.patients, ['P1']);
  assert.equal(A.partageDefaut({ agendaReglages: { U1: { partageDefaut: 'co' } } }, 'U1'), 'co');
  assert.equal(A.partageDefaut({}, 'U1'), 'invites');
});

test('Permissions : processus par mode d’hospitalisation, étapes, délais, retour de l’ARS', () => {
  const Pm = A.permissions;
  const config = { modesHospitalisation: [{ code: 'SL', contrainte: false }, { code: 'SDT', contrainte: true }, { code: 'SDRE', contrainte: true }] };
  assert.deepEqual(['SL', 'SDT', 'SDRE', ''].map(m => Pm.famille(config, m)), ['libre', 'contrainte', 'sdre', 'libre']);
  assert.equal(Pm.processusPour(config, {}, ['SL', 'SDRE', 'SDT']).famille, 'sdre');   // le plus exigeant
  assert.deepEqual(Pm.processus(config, {}, 'SDT').etapes.map(e => e.code), ['demandee', 'orale', 'medecin', 'directeur']);
  // Réglage du service : processus propre à la famille, ou à un mode
  const rg = { processPermissions: { contrainte: { etapes: [{ code: 'demandee', libelle: 'Demandée' }, { code: 'envoi', libelle: 'Certificat envoyé', delai: 72 }, { code: 'ok', libelle: 'Accord' }] }, 'mode:SL': { etapes: [{ code: 'a', libelle: 'x' }] } } };
  assert.deepEqual(Pm.processus(config, rg, 'SDT').etapes.map(e => e.code), ['demandee', 'envoi', 'ok']);
  assert.equal(Pm.processus(config, rg, 'SL').cle, 'libre');   // processus mal formé (une seule étape) : écarté
  // Événement : permission d'un patient en SDRE
  const fiches = { P1: { id: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1', modes: [{ mode: 'SDRE', date: 0 }] } };
  const debut = Date.UTC(2026, 10, 20, 9);
  const perm = ev('auteur', 'RDV', { id: 'R1', nature: 'permission', debut, fin: debut + 4 * 36e5, service: 'U1', patients: ['P1'], validations: [{ id: 'pv', type: 'permission' }] });
  const val = d => ev('ide1', 'VALIDATION', Object.assign({ rdv: 'R1', validation: 'pv', occurrence: OCC, processus: 'sdre', service: 'U1' }, d));
  const etat = (evts, maintenant) => A.etatValidations(A.reduire(evts).rdv.R1, OCC, debut, fiches, config, maintenant)[0];
  let e = etat([perm], debut - 72 * 36e5);
  assert.deepEqual([e.permission.etape.code, e.permission.suivante.code, e.niveau, e.echeance, e.delai], ['demandee', 'orale', 'attente', debut - 48 * 36e5, 48]);
  assert.equal(etat([perm], debut - 40 * 36e5).niveau, 'retard');   // moins de 48 h : le certificat n'est pas parti
  assert.deepEqual(e.permission.taches.map(t => t.libelle), ['Demander l’accord du médecin', 'Certificat à rédiger et à faire signer', 'Certificat à envoyer à l’ARS', 'Retour de l’ARS à recevoir']);
  e = etat([perm, val({ statut: 'etape', etape: 'orale' }), val({ statut: 'etape', etape: 'asigner' }), val({ statut: 'etape', etape: 'envoye' })], debut - 40 * 36e5);
  assert.deepEqual([e.permission.etape.code, e.permission.suivante.retour, e.niveau, A.statutPermission(A.reduire([perm]).rdv.R1, OCC)], ['envoye', true, 'attente', 'demande']);
  // Demande de 2e avis : retour au certificat à signer, avec la mention
  const ret = Pm.etapeApresDemande(e.permission.processus);
  assert.equal(ret.code, 'asigner');
  const suite = [perm, val({ statut: 'etape', etape: 'envoye' }), val({ statut: 'etape', etape: 'asigner', retourARS: 'avis', mention: 'Demande d’un 2e avis : second psychiatre' })];
  e = etat(suite, debut - 40 * 36e5);
  assert.deepEqual([e.permission.etape.code, e.permission.mention, e.permission.historique.length], ['asigner', 'Demande d’un 2e avis : second psychiatre', 2]);
  // Accord : dernière étape, la permission est validée ; refus : refusée
  let st = A.reduire(suite.concat([val({ statut: 'etape', etape: 'retour', finale: true, retourARS: 'accord' })]));
  assert.equal(A.statutPermission(st.rdv.R1, OCC), 'validee');
  assert.equal(A.etatValidations(st.rdv.R1, OCC, debut, fiches, config, debut)[0].permission.terminee, true);
  st = A.reduire(suite.concat([val({ statut: 'refusee', nom: 'ARS' })]));
  assert.deepEqual([A.statutPermission(st.rdv.R1, OCC), A.etatValidations(st.rdv.R1, OCC, debut, fiches, config, debut)[0].permission.libelle], ['refusee', 'Refusée']);
  // Remise en attente : retour au début
  st = A.reduire(suite.concat([val({ statut: 'attente' })]));
  assert.equal(A.etatValidations(st.rdv.R1, OCC, debut, fiches, config, debut)[0].permission.etape.code, 'demandee');
  // Contrôle : étape du processus, rôle permis, précision de la demande
  const ctl = (d, roles) => () => A.contrat.saisies.controler('VALIDATION', Object.assign({ rdv: 'R1', validation: 'pv', occurrence: OCC, statut: 'etape', processus: 'sdre' }, d), { etat: A.reduire([perm]), config, peut: () => true, compte: { id: 'z', roles, services: ['U1'] } });
  assert.doesNotThrow(ctl({ etape: 'orale' }, ['IDE']));
  assert.throws(ctl({ etape: 'medecin' }, ['IDE']), /Étape inconnue/);
  assert.throws(ctl({ etape: 'orale' }, ['AS']), /Votre rôle/);
  assert.throws(ctl({ etape: 'asigner', retourARS: 'complement' }, ['IDE']), /Précisez la demande/);
  // Ancien réglage du délai par mode gardé tant que le processus fourni n'est pas remplacé
  assert.equal(A.processusPermission({ modesHospitalisation: config.modesHospitalisation, agenda: { delaisPermission: { SDRE: 72 } } }, 'U1', ['SDRE']).etapes.filter(x => x.code === 'envoye')[0].delai, 72);
  assert.equal(A.tachesPermission({ agendaReglages: { U1: { tachesPermission: 'office' } } }, 'U1'), 'office');
});

test('Prise en charge : répertoire, fiche patient, tâches suggérées de l’agenda', () => {
  const Pt = require('../app/js/module-patients.js'), K = require('../app/js/intervenants.js');
  const e2 = (type, data) => ({ id: 'p' + (++n), at: new Date(Date.UTC(2026, 10, 1, 8, n)).toISOString(), by: 'ide1', type, data });
  const evts = [e2('PATIENT', { patientId: 'P1', nom: 'ALPHA', prenom: 'Un (fictif)', service: 'U1' }),
    e2('INTERVENANT', { id: 'IV1', type: 'idel', nom: 'Cabinet infirmier (fictif)', contact: '02 00 00 00 01' }),
    e2('INTERVENANT', { id: 'IV2', type: 'hdj', nom: 'Hôpital de jour (fictif)' }),
    e2('PRISE_EN_CHARGE', { patientId: 'P1', lien: 'L1', intervenant: 'IV1', commentaire: 'Matin et soir' }),
    e2('PRISE_EN_CHARGE', { patientId: 'P1', lien: 'L2', intervenant: 'IV2' })];
  let st = Pt.reduire(evts);
  assert.deepEqual(K.dePatient(st, st.fiches.P1).map(l => [l.intervenant.nom, l.commentaire]), [['Cabinet infirmier (fictif)', 'Matin et soir'], ['Hôpital de jour (fictif)', '']]);
  st = Pt.reduire(evts.concat([e2('PRISE_EN_CHARGE', { patientId: 'P1', lien: 'L2', retire: true }), e2('INTERVENANT', { id: 'IV1', contact: '02 00 00 00 09' })]));
  assert.deepEqual(K.dePatient(st, st.fiches.P1).map(l => l.intervenant.contact), ['02 00 00 00 09']);   // fiche commune corrigée une fois
  assert.equal(K.repertoire(Pt.reduire(evts.concat([e2('INTERVENANT', { id: 'IV2', supprime: true })]))).length, 1);
  assert.throws(() => K.normaliser({ id: 'x', nom: ' ' }, {}), /nom/);
  // Export du droit d'accès : type et nom seulement (ni contact ni commentaire)
  assert.deepEqual(K.pourExport(Pt.reduire(evts), Pt.reduire(evts).fiches.P1, {}), [['Infirmier libéral à domicile (IDEL)', 'Cabinet infirmier (fictif)', false], ['Hôpital de jour (HDJ)', 'Hôpital de jour (fictif)', false]]);
  assert.equal(K.reglages({ intervenants: { types: [{ code: 'aide', libelle: 'Aide à domicile' }], champs: [{ code: 'jours', libelle: 'Jours de passage' }] } }).types.length, 1);
  assert.equal(K.reglages({}).types[0].code, 'idel');
  assert.ok(K.controlerCadre({}, { types: [] }, { roles: ['CADRE'] }) && !K.controlerCadre({}, { types: [] }, { roles: ['IDE'] }));
  // Tâches suggérées : selon le type, l'événement et le réglage du service
  const entrees = [{ type: 'idel', nom: 'Cabinet infirmier (fictif)', contact: '02 00 00 00 01' }, { type: 'hdj', nom: 'Hôpital de jour (fictif)' }];
  assert.deepEqual(A.tachesSuggerees({}, 'U1', 'sortie', entrees).map(t => [t.libelle, t.delai, t.obligatoire]),
    [['Appeler l’infirmier libéral : Cabinet infirmier (fictif) (02 00 00 00 01)', 2, undefined], ['Prévenir l’hôpital de jour : Hôpital de jour (fictif)', 1, undefined]]);
  assert.equal(A.tachesSuggerees({}, 'U1', 'permission', entrees).length, 1);   // l'hôpital de jour : sorties seulement
  assert.equal(A.tachesSuggerees({}, 'U1', 'activite', entrees).length, 0);
  const cfg = { agendaReglages: { U1: { suggestions: [{ type: 'idel', tache: 'Prévenir le cabinet', delai: 3, pour: ['permission'], obligatoire: true }], tachesObligatoiresBloquent: true } } };
  assert.deepEqual(A.tachesSuggerees(cfg, 'U1', 'permission', entrees), [{ libelle: 'Prévenir le cabinet : Cabinet infirmier (fictif) (02 00 00 00 01)', delai: 3, obligatoire: true }]);
  assert.equal(A.tachesSuggerees(cfg, 'U2', 'sortie', entrees).length, 2);   // autre service : règles de l'établissement
  // Tâche obligatoire bloquante (réglage) : la dernière étape de la permission attend qu'elle soit faite
  const debut = Date.UTC(2026, 10, 20, 9);
  const perm = ev('auteur', 'RDV', { id: 'R1', nature: 'permission', debut, service: 'U1', patients: ['P1'], validations: [{ id: 'pv', type: 'permission' }], checklist: [{ id: 'i1', libelle: 'Prévenir le cabinet', delai: 3, obligatoire: true }] });
  const fin = st0 => () => A.contrat.saisies.controler('VALIDATION', { rdv: 'R1', validation: 'pv', occurrence: OCC, statut: 'etape', etape: 'signe', finale: true, processus: 'libre' }, { etat: st0, config: cfg, peut: () => true, compte: { id: 'z', roles: ['IDE'], services: ['U1'] } });
  assert.throws(fin(A.reduire([perm])), /Tâche obligatoire/);
  assert.doesNotThrow(fin(A.reduire([perm, ev('ide1', 'CHECK', { rdv: 'R1', item: 'i1', occurrence: OCC, fait: true })])));
  assert.equal(A.etatChecklist(A.reduire([perm]).rdv.R1, OCC).items[0].obligatoire, true);
});
