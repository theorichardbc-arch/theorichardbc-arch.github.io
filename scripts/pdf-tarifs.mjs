// Fabrique documents/tarifs2026.pdf à partir de la page prestations/tarifs.html du site généré (_site/),
// avec la feuille d'impression @media print, puis contrôle le résultat (pages, polices, accents, débordement).
// Usage : node scripts/pdf-tarifs.mjs   (après "node scripts/build.mjs")
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { RACINE, erreur, avertir, erreurs, afficher, sauverRapport } from './lib/rapport.mjs';

const PAGE = path.join(RACINE, '_site', 'prestations', 'tarifs.html');
const PDF = path.join(RACINE, '_site', 'documents', 'tarifs2026.pdf');
const PAGES_MAX = 4;
const LARGEUR_A4_PX = 794;

const fichierPdf = 'documents/tarifs2026.pdf';
const aide = 'vérifiez prestations/tarifs.html (dans src/) et tarifs.json, puis relancez le workflow ; si le problème persiste, signalez-le à la personne qui maintient le site.';

async function lancerNavigateur() {
  const options = { args: ['--no-sandbox'] };
  const essais = process.env.CHROME_PATH
    ? [{ executablePath: process.env.CHROME_PATH }]
    : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  let derniere;
  for (const e of essais) {
    try { return await chromium.launch({ ...options, ...e }); } catch (err) { derniere = err; }
  }
  throw new Error(`aucun navigateur Chrome/Chromium disponible (${String(derniere && derniere.message).split('\n')[0]})`);
}

function outil(nom, args) {
  try {
    return execFileSync(nom, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

async function main() {
  if (!fs.existsSync(PAGE)) {
    erreur('la page _site/prestations/tarifs.html est absente.', { fichier: 'src/prestations/tarifs.html', action: 'lancez d\'abord "node scripts/build.mjs".' });
    return {};
  }
  const tarifs = JSON.parse(fs.readFileSync(path.join(RACINE, 'tarifs.json'), 'utf8'));
  fs.mkdirSync(path.dirname(PDF), { recursive: true });

  const navigateur = await lancerNavigateur();
  const resume = {};
  try {
    const page = await navigateur.newPage({ viewport: { width: LARGEUR_A4_PX, height: 1123 } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(PAGE).href, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);

    const debordement = await page.evaluate(() => {
      const large = document.documentElement.clientWidth;
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > large + 1 && getComputedStyle(el).position !== 'fixed')
        .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`);
    });
    if (debordement.length) {
      erreur(`le PDF des tarifs déborde de la page à droite (éléments : ${debordement.join(', ')}).`, { fichier: 'assets/css/style.css', action: 'corrigez la feuille d\'impression (@media print) : un tableau ou un bloc est trop large pour une page A4.' });
    }

    await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await navigateur.close();
  }

  const taille = fs.statSync(PDF).size;
  const pdf = fs.readFileSync(PDF).toString('latin1');
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  resume.pdfPages = pages;
  resume.pdfOctets = taille;
  if (taille < 5000) erreur(`le PDF généré est anormalement petit (${taille} octets).`, { fichier: fichierPdf, action: aide });
  if (pages < 1 || pages > PAGES_MAX) {
    erreur(`le PDF des tarifs fait ${pages} page(s) ; entre 1 et ${PAGES_MAX} attendues.`, { fichier: fichierPdf, action: 'raccourcissez les textes de tarifs.json ou ajustez la feuille d\'impression (@media print) dans assets/css/style.css.' });
  }

  const texte = outil('pdftotext', ['-enc', 'UTF-8', PDF, '-']);
  if (texte === null) {
    avertir('pdftotext est absent : le contenu et les accents du PDF n\'ont pas pu être relus.', { fichier: fichierPdf, action: 'sans conséquence pour le site ; ce contrôle tourne normalement dans GitHub Actions.' });
  } else {
    const normaliser = (t) => t.normalize('NFC').replace(/[-\u00ad]\s*/g, '').replace(/[\s\u00a0\u202f]+/g, ' ');
    const plat = normaliser(texte);
    resume.pdfTexteVerifie = true;
    if (/\uFFFD/.test(texte)) erreur('le PDF contient des caractères illisibles : problème de police ou d\'accents.', { fichier: fichierPdf, action: aide });
    const attendus = (tarifs.sections || []).flatMap((s) => [s.titre, ...(s.lignes || []).flatMap((l) => [l.nom, l.prix])]).filter(Boolean);
    const manquants = attendus.filter((t) => !plat.includes(normaliser(t)));
    if (manquants.length) {
      erreur(`le PDF ne contient pas ces textes de tarifs.json : ${manquants.slice(0, 5).map((m) => `« ${m} »`).join(', ')}${manquants.length > 5 ? '…' : ''}.`, { fichier: fichierPdf, action: `des accents ou des lignes sont perdus dans le PDF : ${aide}` });
    }
    if (!/[éèàç]/.test(plat)) erreur('aucun caractère accentué trouvé dans le PDF.', { fichier: fichierPdf, action: aide });
  }

  const polices = outil('pdffonts', [PDF]);
  if (polices !== null) {
    const lignes = polices.split('\n').slice(2).filter((l) => l.trim());
    const nonIntegrees = lignes.filter((l) => !/\byes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(l));
    resume.pdfPolices = lignes.length;
    if (!lignes.length) avertir('le PDF ne contient aucune police.', { fichier: fichierPdf, action: aide });
    if (nonIntegrees.length) avertir(`certaines polices ne sont pas intégrées au PDF : ${nonIntegrees.map((l) => l.split(/\s+/)[0]).join(', ')}.`, { fichier: fichierPdf, action: 'le rendu peut varier selon l\'ordinateur de lecture.' });
  }

  // Aperçu PNG (si pdftoppm est disponible) pour relecture dans les artefacts de l'Action.
  const apercu = path.join(RACINE, '.controles', 'apercu-tarifs');
  fs.mkdirSync(apercu, { recursive: true });
  outil('pdftoppm', ['-png', '-r', '60', PDF, path.join(apercu, 'page')]);

  console.log(`PDF des tarifs : ${pages} page(s), ${(taille / 1024).toFixed(0)} Ko.`);
  return resume;
}

let resume = {};
try {
  resume = await main();
} catch (e) {
  erreur(`le PDF des tarifs n'a pas pu être fabriqué : ${e.message}`, { fichier: fichierPdf, action: `consultez le journal de l'étape pour le détail ; ${aide}` });
}
afficher();
sauverRapport(resume);
if (erreurs.length) {
  console.error(`❌ PDF des tarifs : ${erreurs.length} erreur(s).`);
  process.exit(1);
}
console.log('✅ PDF des tarifs généré et vérifié.');
