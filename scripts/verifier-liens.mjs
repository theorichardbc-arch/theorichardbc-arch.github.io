// Vérifie que tous les liens et images internes du site généré (_site/) pointent vers un fichier existant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SORTIE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
if (!fs.existsSync(SORTIE)) {
  console.error('Le dossier _site/ est absent : lancez d\'abord "npm run build".');
  process.exit(1);
}

function pages(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? pages(p) : p.endsWith('.html') ? [p] : [];
  });
}

const cassés = [];
let total = 0;
for (const page of pages(SORTIE)) {
  const html = fs.readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of html.matchAll(/\b(?:href|src|data-fullsrc)="([^"]*)"/g)) {
    const lien = m[1].replace(/&amp;/g, '&').trim();
    if (!lien || /^(https?:|mailto:|tel:|javascript:|data:|#|\/\/)/.test(lien)) continue;
    total += 1;
    const [chemin] = lien.split(/[?#]/);
    let cible = chemin.startsWith('/') ? path.join(SORTIE, chemin) : path.resolve(path.dirname(page), chemin);
    if (chemin.endsWith('/') || (fs.existsSync(cible) && fs.statSync(cible).isDirectory())) cible = path.join(cible, 'index.html');
    if (!fs.existsSync(cible)) cassés.push(`${path.relative(SORTIE, page).replace(/\\/g, '/')} → ${lien}`);
  }
}

if (cassés.length) {
  console.error(`❌ ${cassés.length} lien(s) interne(s) cassé(s) :`);
  for (const c of cassés) console.error(`  - ${c}`);
  process.exit(1);
}
console.log(`✅ ${total} liens internes vérifiés, aucun lien cassé.`);
