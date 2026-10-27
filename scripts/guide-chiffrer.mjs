// Fabrique _site/core/guide.html : page protégée par mot de passe.
// Le texte en clair (secret GUIDE_HTML) et le mot de passe (secret GUIDE_PASSWORD) ne sont jamais dans le dépôt.
// Chiffrement : PBKDF2-SHA256 (600 000 itérations) + AES-256-GCM ; le déchiffrement se fait dans le navigateur.
// Sans secrets (pull request, fork, secrets pas encore créés) : une page « non configurée » est générée.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { RACINE } from './lib/rapport.mjs';

const ITERATIONS = 600000;
const CIBLE = path.join(RACINE, '_site', 'core', 'guide.html');

const TETE = (titre) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="description" content="Page privée à accès protégé.">
<title>${titre}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 20vh auto 0; padding: 0 1.5rem; color: #000; }
  h1 { font-size: 1.2rem; font-weight: 600; }
  input, button { font: inherit; padding: .5rem .7rem; }
  input { width: 100%; box-sizing: border-box; margin: .5rem 0; }
  #erreur { color: #b00020; min-height: 1.5em; }
</style>
</head>
<body>`;

function pageNonConfiguree() {
  return `${TETE('Page non disponible')}
<h1>Page non disponible</h1>
<p>Cette page privée n'est pas disponible.</p>
</body>
</html>
`;
}

async function chiffrer(texte, motDePasse) {
  const enc = new TextEncoder();
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  const cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(texte)));
  const b64 = (u8) => Buffer.from(u8).toString('base64');
  return JSON.stringify({ s: b64(sel), i: b64(iv), c: b64(chiffre), n: ITERATIONS });
}

const SCRIPT = `
const donnees = JSON.parse(document.getElementById('donnees').textContent);
const octets = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
document.getElementById('formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erreur = document.getElementById('erreur');
  erreur.textContent = 'Vérification…';
  try {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(document.getElementById('mdp').value), 'PBKDF2', false, ['deriveKey']);
    const cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: octets(donnees.s), iterations: donnees.n, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: octets(donnees.i) }, cle, octets(donnees.c));
    const html = new TextDecoder().decode(clair);
    document.open(); document.write(html); document.close();
  } catch {
    erreur.textContent = 'Mot de passe incorrect.';
  }
});
`;

function pageProtegee(blob) {
  return `${TETE('Accès protégé')}
<h1>Accès protégé</h1>
<form id="formulaire">
  <label for="mdp">Mot de passe</label>
  <input id="mdp" type="password" autocomplete="current-password" required autofocus>
  <button type="submit">Ouvrir</button>
  <p id="erreur" role="alert"></p>
</form>
<noscript><p>JavaScript est nécessaire pour ouvrir cette page.</p></noscript>
<script id="donnees" type="application/json">${blob}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const motDePasse = process.env.GUIDE_PASSWORD || '';
const texte = process.env.GUIDE_HTML || '';
fs.mkdirSync(path.dirname(CIBLE), { recursive: true });

if (!motDePasse || !texte.trim()) {
  fs.writeFileSync(CIBLE, pageNonConfiguree());
  console.log('  ⚠ guide privé : secrets GUIDE_PASSWORD / GUIDE_HTML absents, page « non disponible » générée.');
} else {
  if (motDePasse.length < 12) console.log('  ⚠ guide privé : GUIDE_PASSWORD fait moins de 12 caractères, choisissez une phrase de passe plus longue.');
  fs.writeFileSync(CIBLE, pageProtegee(await chiffrer(texte, motDePasse)));
  console.log('  guide privé : page chiffrée générée (core/guide.html).');
}
