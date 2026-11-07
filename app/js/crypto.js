// SPDX-License-Identifier: EUPL-1.2
/*
 * Chiffrement — Web Crypto API uniquement (aucune bibliothèque externe).
 *  - Clé de données : AES-GCM 256 bits, tirée au hasard à l'initialisation.
 *  - Chaque fichier : en-tête "SIC1" + IV aléatoire 96 bits + texte chiffré authentifié.
 *  - La clé de données est « emballée » par plusieurs moyens de déblocage :
 *      mot de passe (PBKDF2-SHA256), clé de sécurité (WebAuthn PRF), code de secours.
 * Utilisable dans le navigateur (window.SIC.crypto) et dans Node ≥ 20 (globalThis.crypto).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIC = root.SIC || {}).crypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var subtle = globalThis.crypto.subtle;
  var enc = new TextEncoder(), dec = new TextDecoder();
  var MAGIC = enc.encode('SIC1');
  // En-tête version 2 (étape 4) : « SIC2 » + numéro de génération de la clé (4 octets, gros-boutiste).
  // Un fichier « SIC1 » est lu comme génération 1 : aucun fichier existant n'est rechiffré.
  var MAGIC2 = enc.encode('SIC2');
  var ITERATIONS_MDP = 600000;     // recommandation OWASP pour PBKDF2-SHA256
  var ITERATIONS_SECOURS = 100000; // code de secours : 100 bits d'aléa, moins d'itérations suffisent

  function aleatoire(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }

  function b64(u8) {
    var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function deb64(s) {
    var b = atob(s), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function hex(u8) { return Array.prototype.map.call(u8, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }

  async function nouvelleCleDonnees() {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  /**
   * Chiffre des octets. Sans `generation` : en-tête « SIC1 » (format d'origine). Avec `generation` (entier ≥ 1) :
   * en-tête « SIC2 » portant ce numéro, lié au contenu par les données authentifiées (un numéro altéré est refusé).
   */
  /** Jeu de clés (trousseau.js) : { courante, cle(g) } ; écrit avec la génération courante (null : format d'origine). */
  function estJeu(c) { return !!c && typeof c === 'object' && typeof c.cle === 'function'; }

  async function chiffrerOctets(cle, octets, aad, generation) {
    if (estJeu(cle)) { generation = cle.courante; cle = await cle.cle(cle.courante || 1); if (!cle) throw new Error('Clé de la génération courante absente du trousseau.'); }
    var iv = aleatoire(12), v2 = generation !== undefined && generation !== null;
    if (v2 && !(Number.isInteger(generation) && generation >= 1 && generation < 4294967296)) throw new Error('Numéro de génération invalide.');
    var ad = enc.encode((aad || '') + (v2 ? '|g' + generation : ''));
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: ad }, cle, octets));
    var tete = v2 ? 8 : 4, out = new Uint8Array(tete + 12 + ct.length);
    if (v2) { out.set(MAGIC2, 0); new DataView(out.buffer).setUint32(4, generation, false); } else out.set(MAGIC, 0);
    out.set(iv, tete); out.set(ct, tete + 12);
    return out;
  }

  /** Génération de la clé qui a chiffré un fichier : 1 pour l'en-tête d'origine, le numéro porté pour « SIC2 ». */
  function generationFichier(donnees) {
    var u = new Uint8Array(donnees), i;
    for (i = 0; i < 4 && u[i] === MAGIC[i]; i++);
    if (i === 4) return 1;
    for (i = 0; i < 4 && u[i] === MAGIC2[i]; i++);
    if (i === 4 && u.length >= 8) return new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(4, false);
    throw new Error('Fichier non reconnu');
  }

  /**
   * Déchiffre des octets (les deux en-têtes). `cle` : une clé AES-GCM, ou une fonction qui rend la clé d'une
   * génération (trousseau) ; elle peut renvoyer une promesse.
   */
  async function dechiffrerOctets(cle, donnees, aad) {
    var u = new Uint8Array(donnees), g = generationFichier(u), v2 = u[3] === MAGIC2[3];
    var tete = v2 ? 8 : 4;
    var k = estJeu(cle) ? await cle.cle(g) : typeof cle === 'function' ? await cle(g) : cle;
    if (!k) throw new Error('Clé de la génération ' + g + ' absente du trousseau.');
    var ad = enc.encode((aad || '') + (v2 ? '|g' + g : ''));
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: u.slice(tete, tete + 12), additionalData: ad }, k, u.slice(tete + 12)));
  }

  /** Clé brute en base 64 (pour la ranger chiffrée dans le coffre) et inverse. */
  async function exporterCle(cle) { return b64(new Uint8Array(await subtle.exportKey('raw', cle))); }
  async function importerCle(texte) { return subtle.importKey('raw', deb64(texte), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }

  async function chiffrerJSON(cle, objet, aad, generation) { return chiffrerOctets(cle, enc.encode(JSON.stringify(objet)), aad, generation); }
  async function dechiffrerJSON(cle, donnees, aad) { return JSON.parse(dec.decode(await dechiffrerOctets(cle, donnees, aad))); }

  // ----------------------------------------------------------- Emballage
  async function cleDepuisSecret(secretOctets, sel, iterations) {
    var base = await subtle.importKey('raw', secretOctets, 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: iterations, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function cleDepuisPRF(prfOctets, sel) {
    var base = await subtle.importKey('raw', prfOctets, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: sel, info: enc.encode('SIC cle de securite') }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** Emballe une clé AES-GCM, ou des octets bruts (ex. la partie privée d'une clé personnelle, étape 4). */
  async function emballer(cleDonnees, cleEmballage) {
    var brut = cleDonnees instanceof Uint8Array ? cleDonnees : new Uint8Array(await subtle.exportKey('raw', cleDonnees));
    return b64(await chiffrerOctets(cleEmballage, brut, 'emballage'));
  }

  /** Inverse d'`emballer` : clé AES-GCM, ou octets bruts si `brut`. */
  async function deballer(emballee, cleEmballage, brut) {
    var octets = await dechiffrerOctets(cleEmballage, deb64(emballee), 'emballage');
    return brut ? octets : subtle.importKey('raw', octets, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  /** Emballage par mot de passe → objet stockable dans le coffre. */
  /** `iterations` réduit est réservé aux mots de passe provisoires tirés au hasard (80 bits d'aléa). */
  async function emballerMotDePasse(cleDonnees, motDePasse, iterations) {
    var sel = aleatoire(16), it = iterations || ITERATIONS_MDP;
    var k = await cleDepuisSecret(enc.encode(motDePasse.normalize('NFC')), sel, it);
    return { methode: 'mdp', sel: b64(sel), iterations: it, cle: await emballer(cleDonnees, k) };
  }

  async function deballerMotDePasse(emb, motDePasse, brut) {
    var k = await cleDepuisSecret(enc.encode(motDePasse.normalize('NFC')), deb64(emb.sel), emb.iterations);
    return deballer(emb.cle, k, brut);
  }

  // Code de secours : 20 caractères (alphabet sans ambiguïté), 100 bits d'aléa.
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function nouveauCodeSecours() {
    var a = aleatoire(20), s = '';
    for (var i = 0; i < 20; i++) s += ALPHABET[a[i] % 32];
    return s.match(/.{4}/g).join('-');
  }
  /** Mot de passe provisoire : 16 caractères sans ambiguïté (80 bits), ex. « k7mp-2qxa-9fht-w3cd ». */
  var ALPHABET_MDP = 'abcdefghjkmnpqrstuvwxyz23456789';
  function nouveauMotDePasseProvisoire() {
    var a = aleatoire(16), s = '';
    for (var i = 0; i < 16; i++) s += ALPHABET_MDP[a[i] % 31];
    return s.match(/.{4}/g).join('-');
  }
  function normaliserCode(code) { return code.toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  async function emballerCodeSecours(cleDonnees, code) {
    var sel = aleatoire(16);
    var k = await cleDepuisSecret(enc.encode(normaliserCode(code)), sel, ITERATIONS_SECOURS);
    return { methode: 'secours', sel: b64(sel), iterations: ITERATIONS_SECOURS, cle: await emballer(cleDonnees, k) };
  }

  async function deballerCodeSecours(emb, code, brut) {
    var k = await cleDepuisSecret(enc.encode(normaliserCode(code)), deb64(emb.sel), emb.iterations);
    return deballer(emb.cle, k, brut);
  }

  // ------------------------------------------------ Clé de sécurité (PRF)
  function webauthnDisponible() {
    return typeof window !== 'undefined' && window.isSecureContext && !!window.PublicKeyCredential &&
      location.protocol !== 'file:';
  }

  /** Enregistre une clé de sécurité et emballe la clé de données avec son secret PRF. */
  async function emballerCleSecurite(cleDonnees, identifiant, libelle) {
    if (!webauthnDisponible()) throw new Error('Les clés de sécurité nécessitent une page servie en HTTPS (GitHub Pages ou intranet).');
    var selPRF = aleatoire(32);
    var cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Suivi mesures iso/cont', id: location.hostname },
        user: { id: aleatoire(16), name: identifiant, displayName: libelle || identifiant },
        challenge: aleatoire(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'cross-platform', userVerification: 'discouraged', residentKey: 'discouraged' },
        extensions: { prf: {} }
      }
    });
    var ext = cred.getClientExtensionResults();
    if (!ext.prf || ext.prf.enabled === false) throw new Error("Cette clé ou ce navigateur ne prend pas en charge l'extension PRF (YubiKey 5, firmware 5.2 ou plus, Chrome ou Edge récents).");
    var idCred = new Uint8Array(cred.rawId);
    var prf = await evaluerPRF([idCred], selPRF);
    var sel = aleatoire(16);
    var k = await cleDepuisPRF(prf.secret, sel);
    return { methode: 'cle', idCredential: b64(idCred), selPRF: b64(selPRF), sel: b64(sel), libelle: libelle || 'Clé de sécurité', rpId: location.hostname, cle: await emballer(cleDonnees, k) };
  }

  async function evaluerPRF(idsCredentials, selPRF, parCredential) {
    var opts = {
      challenge: aleatoire(32),
      rpId: location.hostname,
      allowCredentials: idsCredentials.map(function (id) { return { type: 'public-key', id: id }; }),
      userVerification: 'discouraged',
      extensions: { prf: parCredential ? { evalByCredential: parCredential } : { eval: { first: selPRF } } }
    };
    var a = await navigator.credentials.get({ publicKey: opts });
    var r = a.getClientExtensionResults();
    if (!r.prf || !r.prf.results || !r.prf.results.first) throw new Error("La clé n'a pas renvoyé de secret PRF.");
    return { idCredential: new Uint8Array(a.rawId), secret: new Uint8Array(r.prf.results.first) };
  }

  /** Déverrouille avec l'une des clés de sécurité enregistrées (liste d'emballages 'cle'). */
  async function deballerCleSecurite(emballages, brut) {
    if (!webauthnDisponible()) throw new Error('Les clés de sécurité nécessitent une page servie en HTTPS.');
    var utilisables = emballages.filter(function (e) { return e.rpId === location.hostname; });
    if (!utilisables.length) throw new Error("Aucune clé de sécurité n'est enregistrée pour cette adresse (" + location.hostname + ').');
    var parCred = {};
    utilisables.forEach(function (e) { parCred[e.idCredential.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')] = { first: deb64(e.selPRF) }; });
    var res = await evaluerPRF(utilisables.map(function (e) { return deb64(e.idCredential); }), null, parCred);
    var idB64 = b64(res.idCredential);
    var emb = utilisables.filter(function (e) { return e.idCredential === idB64; })[0];
    if (!emb) throw new Error('Clé non reconnue.');
    var k = await cleDepuisPRF(res.secret, deb64(emb.sel));
    return { cle: await deballer(emb.cle, k, brut), emballage: emb };
  }

  // ------------------------------------------------ Trousseau (étape 4 du plan d'architecture)
  // Briques standard de Web Crypto uniquement : ECDH P-256, HKDF-SHA-256, AES-GCM 256.
  var ECDH = { name: 'ECDH', namedCurve: 'P-256' };

  /** Clé personnelle d'un agent (ou clé de secours) : paire ECDH P-256. */
  async function nouvellePaire() { return subtle.generateKey(ECDH, true, ['deriveBits']); }
  async function exporterPublique(cle) { return b64(new Uint8Array(await subtle.exportKey('raw', cle))); }
  async function importerPublique(texte) { return subtle.importKey('raw', deb64(texte), ECDH, true, []); }
  /** Partie privée en octets (PKCS #8), pour l'emballer par un moyen de connexion ; à effacer après usage. */
  async function exporterPrivee(cle) { return new Uint8Array(await subtle.exportKey('pkcs8', cle)); }
  /** Partie privée importée non exportable : une fois ouverte, elle ne peut plus être recopiée depuis le navigateur. */
  async function importerPrivee(octets) { return subtle.importKey('pkcs8', octets, ECDH, false, ['deriveBits']); }

  async function cleHKDF(secret, sel, info) {
    var base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: sel, info: enc.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /**
   * Enveloppe : chiffre des octets (une clé de droit) pour le détenteur d'une partie publique, sans connaître son
   * secret. Échange ECDH avec une paire éphémère, HKDF-SHA-256, AES-GCM. `contexte` (ex. « isocont:3:u1a2b ») est
   * lié à l'enveloppe : une enveloppe déplacée vers un autre contexte est refusée.
   */
  async function envelopper(octets, publique, contexte) {
    var eph = await nouvellePaire();
    var partage = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: publique }, eph.privateKey, 256));
    var sel = aleatoire(16);
    var k = await cleHKDF(partage, sel, 'Tessera enveloppe ' + contexte);
    partage.fill(0);
    return { eph: await exporterPublique(eph.publicKey), sel: b64(sel), ct: b64(await chiffrerOctets(k, octets, 'enveloppe:' + contexte)) };
  }
  async function ouvrirEnveloppe(env, privee, contexte) {
    var partage = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: await importerPublique(env.eph) }, privee, 256));
    var k = await cleHKDF(partage, deb64(env.sel), 'Tessera enveloppe ' + contexte);
    partage.fill(0);
    return dechiffrerOctets(k, deb64(env.ct), 'enveloppe:' + contexte);
  }

  /** Clé maîtresse d'une clé de droit (256 bits) : détenue par l'administrateur et la clé de secours seulement. */
  function nouvelleMaitresse() { return aleatoire(32); }
  /**
   * Octets de la génération `n` d'une clé de droit (`nom` : « plateforme », « isocont »…), tirés de sa clé maîtresse
   * (HKDF-SHA-256) : toutes les générations, passées et futures, s'en déduisent ; aucune ne permet de remonter aux autres.
   */
  async function octetsGeneration(maitresse, nom, n) {
    if (!(Number.isInteger(n) && n >= 1)) throw new Error('Numéro de génération invalide.');
    var base = await subtle.importKey('raw', maitresse, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('Tessera generation'), info: enc.encode(nom + ':' + n) }, base, 256));
  }
  /** Clé AES-GCM depuis ses octets ; non exportable sauf demande (l'administrateur doit pouvoir la remettre). */
  async function importerCleOctets(octets, exportable) {
    // Garde-fou : une clé entièrement nulle trahit des octets effacés par erreur ; jamais utilisée pour chiffrer
    if (!octets || octets.length !== 32 || octets.every(function (x) { return x === 0; })) throw new Error('Clé invalide (octets absents ou effacés).');
    return subtle.importKey('raw', octets, { name: 'AES-GCM' }, !!exportable, ['encrypt', 'decrypt']);
  }

  // ------------------------------------------------ Attestation du coffre (0.5.0)
  var ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: 'SHA-256' };
  async function sha256(octets) { return new Uint8Array(await subtle.digest('SHA-256', octets)); }
  function concat() { var n = 0, i; for (i = 0; i < arguments.length; i++) n += arguments[i].length; var o = new Uint8Array(n), k = 0; for (i = 0; i < arguments.length; i++) { o.set(arguments[i], k); k += arguments[i].length; } return o; }
  /** Paire de signature ECDSA P-256 de l'attestation : { publique (texte), prive8 (PKCS #8, à effacer) }. */
  async function nouvellePaireSignature() {
    var p = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    return { publique: b64(new Uint8Array(await subtle.exportKey('raw', p.publicKey))), prive8: new Uint8Array(await subtle.exportKey('pkcs8', p.privateKey)) };
  }
  async function signer(prive8, texte) {
    var k = await subtle.importKey('pkcs8', prive8, ECDSA, false, ['sign']);
    return b64(new Uint8Array(await subtle.sign(SIGN, k, enc.encode(texte))));
  }
  async function verifierSignature(publique, texte, signature) {
    try { var k = await subtle.importKey('raw', deb64(publique), ECDSA, false, ['verify']); return await subtle.verify(SIGN, k, deb64(signature), enc.encode(texte)); }
    catch (e) { return false; }
  }
  /** 32 octets dérivés d'un secret (HKDF-SHA-256), pour un usage nommé par `info`. */
  async function deriverOctets(secret, info) {
    var base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('Tessera attestation'), info: enc.encode(info) }, base, 256));
  }
  async function hmac(cle8, texte) {
    var k = await subtle.importKey('raw', cle8, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(new Uint8Array(await subtle.sign('HMAC', k, enc.encode(texte))));
  }
  /** Secret ECDH (32 octets) entre une partie privée (PKCS #8) et une partie publique (texte). */
  async function secretPartage(prive8, publique) {
    var k = await subtle.importKey('pkcs8', prive8, ECDH, false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: await importerPublique(publique) }, k, 256));
  }
  /** Partie publique (texte, format brut) d'une partie privée P-256 : 'ECDSA' ou 'ECDH'. */
  async function publiqueDePrivee(prive8, algo) {
    var k = await subtle.importKey('pkcs8', prive8, algo === 'ECDSA' ? ECDSA : ECDH, true, algo === 'ECDSA' ? ['sign'] : ['deriveBits']);
    var j = await subtle.exportKey('jwk', k), x = deb64(j.x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - j.x.length % 4) % 4)), y = deb64(j.y.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - j.y.length % 4) % 4));
    return b64(concat(new Uint8Array([4]), x, y));
  }
  /** Ancre : empreinte de la clé publique d'attestation, gardée dans chaque emballage (protégée par le mot de passe). */
  async function ancreDe(publique) { return hex(await sha256(deb64(publique))); }
  var MAGIC_ANCRE = enc.encode('ANC1');
  /** Partie privée et ancre réunies avant emballage ; `ancre` absente : partie privée seule (format 0.4). */
  function paquet(prive8, ancre) {
    if (!ancre) return prive8;
    var a = new Uint8Array(ancre.match(/../g).map(function (x) { return parseInt(x, 16); }));
    return concat(MAGIC_ANCRE, a, prive8);
  }
  function ouvrirPaquet(octets) {
    var marque = octets.length > 36 && MAGIC_ANCRE.every(function (x, i) { return octets[i] === x; });
    if (!marque) return { prive8: octets, ancre: null };
    var r = { prive8: octets.slice(36), ancre: hex(octets.subarray(4, 36)) };
    octets.fill(0);
    return r;
  }

  async function empreinte(texte) {
    return hex(new Uint8Array(await subtle.digest('SHA-256', enc.encode(texte))));
  }

  return {
    aleatoire: aleatoire, hex: hex, b64: b64, deb64: deb64,
    nouvelleCleDonnees: nouvelleCleDonnees, exporterCle: exporterCle, importerCle: importerCle,
    chiffrerJSON: chiffrerJSON, dechiffrerJSON: dechiffrerJSON,
    emballerMotDePasse: emballerMotDePasse, deballerMotDePasse: deballerMotDePasse,
    nouveauCodeSecours: nouveauCodeSecours, nouveauMotDePasseProvisoire: nouveauMotDePasseProvisoire, ITERATIONS_PROVISOIRE: ITERATIONS_SECOURS, emballerCodeSecours: emballerCodeSecours, deballerCodeSecours: deballerCodeSecours,
    webauthnDisponible: webauthnDisponible, emballerCleSecurite: emballerCleSecurite, deballerCleSecurite: deballerCleSecurite,
    empreinte: empreinte, ITERATIONS_MDP: ITERATIONS_MDP,
    chiffrerOctets: chiffrerOctets, dechiffrerOctets: dechiffrerOctets, generationFichier: generationFichier,
    nouvellePaire: nouvellePaire, exporterPublique: exporterPublique, importerPublique: importerPublique,
    exporterPrivee: exporterPrivee, importerPrivee: importerPrivee, envelopper: envelopper, ouvrirEnveloppe: ouvrirEnveloppe,
    nouvelleMaitresse: nouvelleMaitresse, octetsGeneration: octetsGeneration, importerCleOctets: importerCleOctets,
    sha256: sha256, concat: concat, nouvellePaireSignature: nouvellePaireSignature, signer: signer, verifierSignature: verifierSignature,
    deriverOctets: deriverOctets, hmac: hmac, secretPartage: secretPartage, ancreDe: ancreDe, publiqueDePrivee: publiqueDePrivee, paquet: paquet, ouvrirPaquet: ouvrirPaquet
  };
});
