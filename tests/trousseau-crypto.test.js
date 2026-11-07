// SPDX-License-Identifier: EUPL-1.2
// Briques du trousseau (étape 4, version 0.4.1) : clés personnelles, enveloppes, générations, en-tête de fichier : npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/js/crypto.js');

const enc = new TextEncoder(), dec = new TextDecoder();

test('En-tête de fichier : version 2 porteuse de la génération, version 1 toujours lue, altération refusée', async () => {
  const cle = await C.nouvelleCleDonnees();
  const v1 = await C.chiffrerJSON(cle, { a: 1 }, 'evt:x');
  assert.equal(C.generationFichier(v1), 1);
  assert.deepEqual(await C.dechiffrerJSON(cle, v1, 'evt:x'), { a: 1 });
  const v2 = await C.chiffrerJSON(cle, { a: 2 }, 'evt:x', 7);
  assert.equal(dec.decode(v2.slice(0, 4)), 'SIC2');
  assert.equal(C.generationFichier(v2), 7);
  assert.deepEqual(await C.dechiffrerJSON(cle, v2, 'evt:x'), { a: 2 });
  // Trousseau : la clé est choisie d'après la génération portée par le fichier
  const vues = [];
  const trousseau = (g) => { vues.push(g); return g === 7 ? cle : null; };
  assert.deepEqual(await C.dechiffrerJSON(trousseau, v2, 'evt:x'), { a: 2 });
  await assert.rejects(C.dechiffrerJSON(trousseau, v1, 'evt:x'), /génération 1 absente/);
  assert.deepEqual(vues, [7, 1]);
  // Numéro de génération altéré : refusé (lié au contenu), même avec la bonne clé
  const altere = v2.slice(); new DataView(altere.buffer).setUint32(4, 8, false);
  await assert.rejects(C.dechiffrerJSON(() => cle, altere, 'evt:x'));
  // Données authentifiées différentes (fichier renommé) : refusé
  await assert.rejects(C.dechiffrerJSON(cle, v2, 'evt:y'));
  assert.throws(() => C.generationFichier(enc.encode('XXXX0000')), /non reconnu/);
  await assert.rejects(C.chiffrerJSON(cle, {}, 'x', 0), /génération invalide/);
});

test('Clé personnelle : partie privée emballée par mot de passe ou code de secours, rouverte non exportable', async () => {
  const paire = await C.nouvellePaire();
  const privee = await C.exporterPrivee(paire.privateKey);
  const emb = await C.emballerMotDePasse(privee, 'mot de passe solide', 1000);
  const rouverte = await C.deballerMotDePasse(emb, 'mot de passe solide', true);
  assert.deepEqual(rouverte, privee);
  await assert.rejects(C.deballerMotDePasse(emb, 'autre mot de passe', true));
  const code = C.nouveauCodeSecours();
  const embS = await C.emballerCodeSecours(privee, code);
  assert.deepEqual(await C.deballerCodeSecours(embS, code.toLowerCase(), true), privee);
  const importee = await C.importerPrivee(rouverte);
  assert.equal(importee.extractable, false);
  // Les emballages d'une clé de données (format d'origine) restent inchangés
  const cle = await C.nouvelleCleDonnees();
  const embCle = await C.emballerMotDePasse(cle, 'mot de passe solide', 1000);
  assert.equal(await C.exporterCle(await C.deballerMotDePasse(embCle, 'mot de passe solide')), await C.exporterCle(cle));
});

test('Enveloppe : ouverte par le seul destinataire, liée à son contexte', async () => {
  const agent = await C.nouvellePaire(), autre = await C.nouvellePaire();
  const secret = C.aleatoire(32);
  const env = await C.envelopper(secret, agent.publicKey, 'isocont:2:u1');
  assert.deepEqual(await C.ouvrirEnveloppe(env, agent.privateKey, 'isocont:2:u1'), secret);
  await assert.rejects(C.ouvrirEnveloppe(env, autre.privateKey, 'isocont:2:u1'));      // autre agent
  await assert.rejects(C.ouvrirEnveloppe(env, agent.privateKey, 'isocont:3:u1'));      // autre génération
  await assert.rejects(C.ouvrirEnveloppe(env, agent.privateKey, 'plateforme:2:u1'));   // autre clé
  // Partie publique transportée en texte (coffre) ; partie privée rouverte non exportable
  const pub = await C.importerPublique(await C.exporterPublique(agent.publicKey));
  const env2 = await C.envelopper(secret, pub, 'plateforme:1:u1');
  const priv = await C.importerPrivee(await C.exporterPrivee(agent.privateKey));
  assert.deepEqual(await C.ouvrirEnveloppe(env2, priv, 'plateforme:1:u1'), secret);
  // Deux enveloppes du même secret ne se ressemblent pas (paire éphémère et sel propres)
  const env3 = await C.envelopper(secret, agent.publicKey, 'isocont:2:u1');
  assert.notEqual(env3.ct, env.ct);
  assert.notEqual(env3.eph, env.eph);
});

test('Générations : déduites de la clé maîtresse, distinctes entre elles et entre clés de droit', async () => {
  const m = C.nouvelleMaitresse();
  const g1 = await C.octetsGeneration(m, 'isocont', 1), g1b = await C.octetsGeneration(m, 'isocont', 1);
  const g2 = await C.octetsGeneration(m, 'isocont', 2), p1 = await C.octetsGeneration(m, 'plateforme', 1);
  assert.equal(g1.length, 32);
  assert.deepEqual(g1, g1b);                       // reproductible : le secours retrouve toute génération
  assert.notDeepEqual(g1, g2);
  assert.notDeepEqual(g1, p1);
  assert.notDeepEqual(await C.octetsGeneration(C.nouvelleMaitresse(), 'isocont', 1), g1);
  await assert.rejects(C.octetsGeneration(m, 'isocont', 0), /génération invalide/);
  // Une génération chiffre et déchiffre ; une autre génération ne lit pas ses fichiers
  const k2 = await C.importerCleOctets(g2), k1 = await C.importerCleOctets(g1);
  assert.equal(k2.extractable, false);
  const f = await C.chiffrerJSON(k2, { s: 'saisie (fictive)' }, 'evt:a', 2);
  assert.deepEqual(await C.dechiffrerJSON((g) => (g === 2 ? k2 : k1), f, 'evt:a'), { s: 'saisie (fictive)' });
  await assert.rejects(C.dechiffrerJSON(() => k1, f, 'evt:a'));
  // Chaîne complète : maîtresse → génération → enveloppe pour un agent → lecture d'une saisie
  const agent = await C.nouvellePaire();
  const env = await C.envelopper(g2, agent.publicKey, 'isocont:2:u1');
  const recue = await C.importerCleOctets(await C.ouvrirEnveloppe(env, agent.privateKey, 'isocont:2:u1'));
  assert.deepEqual(await C.dechiffrerJSON(() => recue, f, 'evt:a'), { s: 'saisie (fictive)' });
});
