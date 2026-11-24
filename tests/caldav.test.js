// SPDX-License-Identifier: EUPL-1.2
// Synchronisation CalDAV (Zimbra, DAVx5) de Mes tâches et de Mon agenda (24 novembre 2026). Serveur simulé, données fictives : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../app/js/caldav.js');

const MAINTENANT = new Date(2026, 10, 24, 9, 0).getTime();

/** Liste de tâches locale en mémoire, comme Mes tâches (identifiants TP…). */
function listeLocale(initiales) {
  let n = 0;
  const t = {};
  (initiales || []).forEach((x) => { t[x.id] = Object.assign({ le: new Date(MAINTENANT - 3600e3).toISOString() }, x); });
  return {
    t,
    api: {
      lister: async () => Object.values(t).map((x) => Object.assign({}, x)),
      enregistrer: async (id, c) => { t[id] = Object.assign({}, c, { id, le: new Date().toISOString() }); },
      creer: async (c) => { const id = 'TPnouv' + (++n); t[id] = Object.assign({}, c, { id, le: new Date().toISOString() }); return id; },
      retirer: async (id) => { delete t[id]; }
    }
  };
}

test('CalDAV : lecture d’un multistatus (préfixes variés, entités, CDATA)', () => {
  const xml = '<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/dav/a/Tasks/x.ics</D:href>'
    + '<D:propstat><D:prop><D:getetag>"12"</D:getetag><cal:calendar-data>BEGIN:VCALENDAR&#13;\nSUMMARY:A &amp; B&lt;</cal:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>'
    + '<D:propstat><D:prop><D:displayname/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response>'
    + '<D:response><D:href>/dav/a/Calendar/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><cal:calendar/></D:resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set><D:displayname><![CDATA[Calendrier <perso>]]></D:displayname></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>';
  const r = D.reponses(xml);
  assert.equal(r.length, 2);
  assert.equal(r[0].href, '/dav/a/Tasks/x.ics');
  assert.equal(r[0].props.getetag, '"12"');
  assert.match(r[0].props.calendarData, /SUMMARY:A & B</);
  assert.equal(r[0].props.displayname, undefined);
  assert.deepEqual([r[1].props.calendrier, r[1].props.composants, r[1].props.displayname], [true, ['VEVENT'], 'Calendrier <perso>']);
});

test('CalDAV : tâche ↔ VTODO (échéance avec ou sans heure, rappel, note, faite) sans perte des champs synchronisés', () => {
  const t = { id: 'TPabc123', titre: 'Appeler l’infirmier libéral, puis le foyer ; noter (fictif)', echeance: '2026-11-27', heure: '14:30', rappel: '1', note: 'Ligne 1\nLigne 2', fait: false };
  const ics = D.ecrireTache(t, { maintenant: MAINTENANT });
  assert.match(ics, /UID:tessera-tache-TPabc123@tessera-sante/);
  assert.match(ics, /DUE:20261127T143000/);
  assert.match(ics, /TRIGGER;RELATED=END:-P1D/);
  assert.ok(!/BEGIN:VEVENT/.test(ics));
  const l = D.lireTache(ics);
  assert.equal(D.empreinte(l), D.empreinte(t));
  assert.equal(D.idDeUid(l.uid), 'TPabc123');
  const f = D.lireTache(D.ecrireTache({ id: 'TP1', titre: 'Faite', echeance: '2026-11-20', fait: true, faitLe: '2026-11-21T08:00:00.000Z', rappel: '0' }));
  assert.deepEqual([f.fait, f.faitLe, f.heure, f.rappel], [true, '2026-11-21T08:00:00.000Z', '', '0']);
  // Variantes écrites par d'autres logiciels : heure UTC, fuseau, alarme une heure avant (rappel le jour même), sans échéance
  const z = D.lireTache('BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:abc@telephone\r\nSUMMARY:Courses\\, pharmacie\r\nDUE;TZID=Europe/Paris:20261130T090000\r\nBEGIN:VALARM\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nSTATUS:NEEDS-ACTION\r\nEND:VTODO\r\nEND:VCALENDAR');
  assert.deepEqual([z.titre, z.echeance, z.heure, z.rappel, z.fait], ['Courses, pharmacie', '2026-11-30', '09:00', '0', false]);
  assert.equal(D.lireTache('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR'), null);
});

test('CalDAV : adresses autorisées lues dans la règle connect-src', () => {
  assert.deepEqual(D.origines("default-src 'none'; connect-src 'none'; img-src data:"), []);
  assert.deepEqual(D.origines("default-src 'none'; connect-src https://zimbra.chu.fictif https://mail.chu.fictif:8443/ http://non.fictif; img-src data:"), ['https://zimbra.chu.fictif', 'https://mail.chu.fictif:8443']);
  assert.equal(D.adresseZimbra('https://zimbra.chu.fictif', 'p.martin@chu.fictif'), 'https://zimbra.chu.fictif/dav/p.martin@chu.fictif/');
  assert.equal(D.autorisee('https://zimbra.chu.fictif/dav/x/', ['https://zimbra.chu.fictif']), true);
  assert.equal(D.autorisee('https://autre.fictif/dav/x/', ['https://zimbra.chu.fictif']), false);
  assert.throws(() => D.Client({ adresse: 'http://zimbra.chu.fictif/dav/x/' }), /https/);
});

test('CalDAV : découverte, création des agendas « Tessera », mot de passe refusé', async () => {
  const srv = D.serveurSimule({ agents: [{ identifiant: 'agent@chu.fictif', motDePasse: 'secret' }] });
  const c = D.Client({ adresse: D.adresseZimbra(srv.origine, 'agent@chu.fictif'), identifiant: 'agent@chu.fictif', motDePasse: 'secret', fetch: srv.fetch });
  const maison = await c.maison();
  assert.equal(maison, srv.origine + '/dav/agent@chu.fictif/');
  assert.deepEqual((await c.agendas(maison)).map((a) => a.nom).sort(), ['Calendrier', 'Tâches']);
  const href = await c.creerAgenda(maison, 'tessera-taches', 'Tessera — tâches', 'VTODO');
  assert.equal(await c.creerAgenda(maison, 'tessera-taches', 'Tessera — tâches', 'VTODO'), href);   // déjà là : sans erreur
  assert.ok((await c.agendas(maison)).some((a) => a.nom === 'Tessera — tâches' && a.composants[0] === 'VTODO'));
  const mauvais = D.Client({ adresse: maison, identifiant: 'agent@chu.fictif', motDePasse: 'ancien', fetch: srv.fetch });
  await assert.rejects(mauvais.maison(), (e) => e.code === 'auth');
  const ailleurs = D.Client({ adresse: 'https://non-autorise.fictif/dav/x/', identifiant: 'a', motDePasse: 'b', fetch: srv.fetch });
  await assert.rejects(ailleurs.maison(), (e) => e.code === 'reseau');
});

test('CalDAV : tâches dans les deux sens (envoi, téléphone : modification, création, suppression ; Tessera : retrait)', async () => {
  const srv = D.serveurSimule({ agents: [{ identifiant: 'agent', motDePasse: 'secret' }] });
  const c = D.Client({ adresse: D.adresseZimbra(srv.origine, 'agent'), identifiant: 'agent', motDePasse: 'secret', fetch: srv.fetch });
  const L = listeLocale([
    { id: 'TPa1', titre: 'Commander les badges (fictif)', echeance: '2026-11-26', heure: '', rappel: '1', note: '', fait: false, elements: [{ module: 'documents', id: 'd1' }] },
    { id: 'TSb2', titre: 'Préparer la réunion de pôle (fictif)', echeance: '', heure: '', rappel: '', note: 'Ordre du jour', fait: false, partagee: true, participants: ['u1', 'u2'] }]);
  let cfg = { taches: true };
  let r = await D.synchroniser({ client: c, config: cfg, taches: L.api, nomAgent: 'Agent (fictif)', maintenant: MAINTENANT });
  cfg = r.config;
  assert.equal(r.resume.taches.envoyees, 2);
  assert.ok(cfg.agendas.taches.endsWith('/tessera-taches/'));
  const elts = () => Object.keys(srv.elements).filter((k) => k.includes('/tessera-taches/'));
  assert.equal(elts().length, 2);

  // Rien n'a changé : aucun échange d'écriture
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  assert.deepEqual(r.resume.taches, { envoyees: 0, recues: 0, creees: 0, retireesIci: 0, retireesLa: 0, reportees: 0 });
  cfg = r.config;

  // Sur le téléphone : la tâche partagée est cochée faite ; une tâche est ajoutée
  const hrefB = srv.origine + elts().find((k) => k.includes('TSb2'));
  srv.modifier(hrefB, (ics) => ics.replace('STATUS:NEEDS-ACTION', 'STATUS:COMPLETED\r\nCOMPLETED:20261124T100000Z').replace(/LAST-MODIFIED:[^\r]+/, 'LAST-MODIFIED:20261124T100000Z'));
  srv.ajouter('/dav/agent/tessera-taches/telephone-1.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:telephone-1\r\nSUMMARY:Rappeler la pharmacie (fictif)\r\nDUE;VALUE=DATE:20261128\r\nEND:VTODO\r\nEND:VCALENDAR\r\n');
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, nomAgent: 'Agent (fictif)', maintenant: MAINTENANT });
  cfg = r.config;
  assert.equal(r.resume.taches.recues, 1);
  assert.equal(r.resume.taches.creees, 1);
  assert.equal(L.t.TSb2.fait, true);
  assert.equal(L.t.TSb2.faitPar, 'Agent (fictif)');
  assert.deepEqual(L.t.TSb2.participants, ['u1', 'u2']);   // partage gardé
  const nouv = Object.values(L.t).find((x) => x.titre === 'Rappeler la pharmacie (fictif)');
  assert.equal(nouv.echeance, '2026-11-28');
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  assert.equal(r.resume.taches.envoyees + r.resume.taches.recues + r.resume.taches.creees, 0, 'stable après la reprise');
  cfg = r.config;

  // Modifiée dans Tessera : renvoyée ; éléments liés gardés localement
  await L.api.enregistrer('TPa1', Object.assign({}, L.t.TPa1, { titre: 'Commander les badges et les clés (fictif)' }));
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  cfg = r.config;
  assert.equal(r.resume.taches.envoyees, 1);
  assert.match(srv.elements[elts().find((k) => k.includes('TPa1'))].ics, /les clés/);

  // Retirée dans Tessera : retirée du téléphone ; supprimée sur le téléphone : retirée de Tessera
  await L.api.retirer('TPa1');
  srv.modifier(srv.origine + '/dav/agent/tessera-taches/telephone-1.ics', () => null);
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  cfg = r.config;
  assert.equal(r.resume.taches.retireesLa, 1);
  assert.equal(r.resume.taches.retireesIci, 1);
  assert.ok(!Object.values(L.t).some((x) => x.titre === 'Rappeler la pharmacie (fictif)'));
  assert.equal(elts().length, 1);
});

test('CalDAV : conflit (modifiée des deux côtés) : la plus récente l’emporte ; serveur sans ETag ; agenda supprimé : recréé', async () => {
  const srv = D.serveurSimule({ agents: [{ identifiant: 'agent', motDePasse: 'secret' }], sansEtag: true });
  const c = D.Client({ adresse: D.adresseZimbra(srv.origine, 'agent'), identifiant: 'agent', motDePasse: 'secret', fetch: srv.fetch });
  const L = listeLocale([{ id: 'TPc3', titre: 'Inventaire (fictif)', echeance: '', heure: '', rappel: '', note: '', fait: false }]);
  let cfg = (await D.synchroniser({ client: c, config: { taches: true }, taches: L.api, maintenant: MAINTENANT })).config;
  assert.equal(cfg.memTaches.TPc3.etag, null);
  let r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  assert.equal(r.resume.taches.envoyees + r.resume.taches.recues, 0, 'sans ETag : comparaison du contenu');
  cfg = r.config;
  const k = Object.keys(srv.elements).find((x) => x.includes('TPc3'));
  // Téléphone plus récent que Tessera
  L.t.TPc3 = Object.assign({}, L.t.TPc3, { titre: 'Inventaire Tessera (fictif)', le: new Date(MAINTENANT - 60e3).toISOString() });
  srv.modifier(srv.origine + k, (ics) => ics.replace(/SUMMARY:[^\r]+/, 'SUMMARY:Inventaire téléphone (fictif)').replace(/LAST-MODIFIED:[^\r]+/, 'LAST-MODIFIED:' + new Date(MAINTENANT).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')));
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  assert.equal(L.t.TPc3.titre, 'Inventaire téléphone (fictif)');
  cfg = r.config;
  // L'agent supprime la liste « Tessera — tâches » dans la messagerie : recréée, rien n'est retiré de Tessera
  Object.keys(srv.elements).forEach((x) => { if (x.includes('/tessera-taches/')) delete srv.elements[x]; });
  delete srv.agendas['/dav/agent/tessera-taches/'];
  r = await D.synchroniser({ client: c, config: cfg, taches: L.api, maintenant: MAINTENANT });
  assert.equal(r.resume.taches.retireesIci, 0);
  assert.equal(r.resume.taches.envoyees, 1);
  assert.ok(L.t.TPc3);
});

test('CalDAV : Mon agenda copié en lecture seule (sans patient), remis à l’identique, retiré ; agenda de la messagerie lu', async () => {
  const srv = D.serveurSimule({ agents: [{ identifiant: 'agent', motDePasse: 'secret' }] });
  const c = D.Client({ adresse: D.adresseZimbra(srv.origine, 'agent'), identifiant: 'agent', motDePasse: 'secret', fetch: srv.fetch });
  const j = (n, h) => new Date(2026, 10, 24 + n, h).getTime();
  let evts = [
    { cle: 'agenda-R1-2026-11-25', debut: j(1, 10), fin: j(1, 11), titre: 'Réunion d’équipe', lieu: 'Salle 2' },
    { cle: 'absence-A1', debut: j(3, 0), fin: j(4, 0), journee: true, titre: 'Absence' }];
  const ev = async () => evts;
  srv.ajouter('/dav/agent/Calendar/perso.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:perso\r\nDTSTART:20261126T120000Z\r\nDTEND:20261126T130000Z\r\nSUMMARY:Déjeuner formation (fictif)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
  let r = await D.synchroniser({ client: c, config: { agenda: true, afficher: srv.origine + '/dav/agent/Calendar/' }, evenements: ev, maintenant: MAINTENANT });
  let cfg = r.config;
  assert.equal(r.resume.evenements.envoyes, 2);
  assert.deepEqual(r.resume.affiches.map((e) => e.objet), ['Déjeuner formation (fictif)']);
  const k = Object.keys(srv.elements).filter((x) => x.includes('/tessera-agenda/'));
  assert.equal(k.length, 2);
  assert.ok(k.every((x) => !/METHOD:/.test(srv.elements[x].ics)));
  // Modifié sur le téléphone : remis à l'identique ; rien d'autre à envoyer
  srv.modifier(srv.origine + k.find((x) => x.includes('R1')), (ics) => ics.replace('Réunion d’équipe', 'Changé'));
  r = await D.synchroniser({ client: c, config: cfg, evenements: ev, maintenant: MAINTENANT });
  cfg = r.config;
  assert.equal(r.resume.evenements.envoyes, 1);
  assert.match(srv.elements[k.find((x) => x.includes('R1'))].ics, /Réunion d’équipe/);
  // Retiré de Tessera : retiré de la messagerie ; un événement créé par l'agent dans cet agenda n'est jamais touché
  srv.ajouter('/dav/agent/tessera-agenda/a-moi.ics', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a-moi\r\nDTSTART:20261126T120000Z\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
  evts = evts.slice(1);
  r = await D.synchroniser({ client: c, config: cfg, evenements: ev, maintenant: MAINTENANT });
  assert.equal(r.resume.evenements.retires, 1);
  assert.ok(srv.elements['/dav/agent/tessera-agenda/a-moi.ics']);
  assert.equal(Object.keys(srv.elements).filter((x) => x.includes('/tessera-agenda/')).length, 2);
});
