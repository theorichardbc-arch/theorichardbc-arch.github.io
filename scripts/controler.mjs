// Contrôles du site généré (_site/) : liens, images, titres, alt, doublons.
// Usage : node scripts/controler.mjs [--sans-externes]
// Les erreurs bloquent le déploiement ; les avertissements sont seulement signalés.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, erreur, avertir, erreurs, avertissements, afficher, sauverRapport } from './lib/rapport.mjs';

const SORTIE = path.join(RACINE, '_site');
const SANS_EXTERNES = process.argv.includes('--sans-externes');
const posix = (p) => p.split(path.sep).join('/');

if (!fs.existsSync(SORTIE)) {
  console.error('❌ Le dossier _site/ est absent : lancez d\'abord "npm run build".');
  process.exit(1);
}

function lister(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? lister(p) : [p];
  });
}

const tous = lister(SORTIE);
const pages = tous.filter((p) => p.endsWith('.html'));
const feuilles = tous.filter((p) => p.endsWith('.css'));
const relSortie = (p) => posix(path.relative(SORTIE, p));

// Remplace commentaires et scripts par des sauts de ligne équivalents : les numéros de ligne restent exacts.
const masquer = (html) => html.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<link\b[^>]*rel="(?:preconnect|dns-prefetch)"[^>]*>/g, (m) => m.replace(/[^\n]/g, ' '));
const ligneDe = (texte, index) => texte.slice(0, index).split('\n').length;

const lecture = new Map();
const lire = (p) => {
  if (!lecture.has(p)) lecture.set(p, fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
  return lecture.get(p);
};

// Retrouve où le texte a été écrit : d'abord dans la page source, puis dans le gabarit commun, puis site.json.
function localiser(rel, extraits) {
  const cherche = (fichier) => {
    if (!fs.existsSync(fichier)) return 0;
    const texte = lire(fichier);
    for (const x of extraits) {
      const i = texte.indexOf(x);
      if (i >= 0) return ligneDe(texte, i);
    }
    return 0;
  };
  const candidats = [`src/${rel}`, 'src/partials/entete.html', 'src/partials/pied.html', 'src/partials/scripts.html', 'site.json'];
  for (const c of candidats) {
    const l = cherche(path.join(RACINE, c));
    if (l) return { fichier: c, ligne: l };
  }
  return { fichier: `_site/${rel}`, ligne: 0, genere: true };
}

const sansDebut = (v) => v.replace(/^(\.\.\/|\.\/)+/, '');

function resoudre(depuis, lien) {
  const [chemin] = lien.split(/[?#]/);
  let cible = chemin.startsWith('/') ? path.join(SORTIE, chemin) : path.resolve(path.dirname(depuis), chemin);
  if (chemin === '') cible = depuis;
  if (chemin.endsWith('/') || (fs.existsSync(cible) && fs.statSync(cible).isDirectory())) cible = path.join(cible, 'index.html');
  return cible;
}

// Vérifie la casse exacte (GitHub Pages distingue Photo.jpg de photo.jpg).
function existeExactement(cible) {
  if (!cible.startsWith(SORTIE) || !fs.existsSync(cible)) return false;
  let courant = SORTIE;
  for (const morceau of path.relative(SORTIE, cible).split(path.sep)) {
    if (!fs.readdirSync(courant).includes(morceau)) return false;
    courant = path.join(courant, morceau);
  }
  return true;
}

const idsCache = new Map();
function idsDe(page) {
  if (!idsCache.has(page)) {
    const ids = new Set();
    for (const m of masquer(lire(page)).matchAll(/\b(?:id|name)="([^"]+)"/g)) ids.add(m[1]);
    idsCache.set(page, ids);
  }
  return idsCache.get(page);
}

const externes = new Map(); // url → [{ rel, extraits }]
const dejaSignale = new Set();
let nbInternes = 0;
let nbImages = 0;

function lienInterne(page, rel, lien, brut, ligneGeneree) {
  nbInternes += 1;
  const cible = resoudre(page, lien);
  const emplacement = localiser(rel, [brut, sansDebut(brut), lien]);
  const lieuErreur = emplacement.genere ? { fichier: `${emplacement.fichier} (page générée)`, ligne: ligneGeneree } : emplacement;
  if (!existeExactement(cible)) {
    const cle = `${rel}|${lien}`;
    if (dejaSignale.has(cle)) return;
    dejaSignale.add(cle);
    erreur(`lien cassé : « ${lien} » ne mène à aucun fichier (page ${rel}).`, {
      ...lieuErreur,
      action: 'corrigez le chemin (attention aux majuscules et aux accents), ou ajoutez le fichier manquant. Pour un lien du menu, corrigez la ligne dans site.json.',
    });
    return;
  }
  const fragment = lien.includes('#') ? lien.split('#')[1] : '';
  if (fragment && !['top'].includes(fragment) && !/^photo-\d+$/.test(fragment) && cible.endsWith('.html') && !idsDe(cible).has(fragment)) {
    erreur(`ancre cassée : « #${fragment} » n'existe pas dans ${relSortie(cible)}.`, {
      ...lieuErreur,
      action: `ajoutez id="${fragment}" sur l'élément visé, ou corrigez le nom après le # dans le lien.`,
    });
  }
}

// ---------- Pages HTML ----------
const titres = new Map();
for (const page of pages) {
  const rel = relSortie(page);
  const html = masquer(lire(page));

  const titre = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (titre === undefined || titre.trim() === '') {
    const l = localiser(rel, ['titre:', '<title']);
    erreur(`la page ${rel} n'a pas de <title>.`, { ...l, ligne: l.ligne || 1, action: 'ajoutez "titre: Mon titre" dans l\'en-tête --- de la page source (ou <title>...</title> pour une page nue).' });
  } else {
    const t = titre.trim().toLowerCase();
    if (titres.has(t)) {
      const l = localiser(rel, [`titre: ${titre.trim().replace(/&amp;/g, '&')}`]);
      erreur(`le titre « ${titre.trim()} » est déjà utilisé par ${titres.get(t)}.`, { ...l, action: 'donnez un titre différent à chaque page (il apparaît dans les onglets et sur Google).' });
    } else titres.set(t, rel);
  }

  const sourcePage = path.join(RACINE, 'src', rel);
  const pageNue = fs.existsSync(sourcePage) && /^mise-en-page:\s*nue\s*$/m.test(lire(sourcePage));
  if (!pageNue && !/<meta\s+name="description"\s+content="[^"]+"/.test(html)) {
    avertir(`la page ${rel} n'a pas de description (texte affiché sous le titre dans Google).`, { ...localiser(rel, ['titre:']), action: 'ajoutez "description: Une phrase de présentation" dans l\'en-tête de la page source.' });
  }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    nbImages += 1;
    const balise = m[0];
    const src = (balise.match(/\bsrc="([^"]*)"/) || [])[1] || '(sans src)';
    const alt = balise.match(/\balt="([^"]*)"/);
    const l = localiser(rel, [balise, src]);
    const info = l.genere ? { fichier: `${l.fichier} (page générée)`, ligne: ligneDe(html, m.index) } : l;
    if (!alt) {
      erreur(`image sans texte alternatif (alt) : ${src} (page ${rel}).`, { ...info, action: 'ajoutez alt="description de l\'image" dans la balise <img>. Pour une photo du portfolio, renseignez son "titre" dans portfolio.json.' });
    } else if (alt[1].trim() === '') {
      avertir(`image avec un alt vide : ${src} (page ${rel}).`, { ...info, action: 'décrivez l\'image dans alt="...", sauf si elle est purement décorative.' });
    }
  }

  for (const m of html.matchAll(/\b(href|src|data-fullsrc)="([^"]*)"/g)) {
    const brut = m[2];
    const lien = brut.replace(/&amp;/g, '&').trim();
    const ligne = ligneDe(html, m.index);
    if (!lien || /^(mailto:|tel:|javascript:|data:)/.test(lien)) continue;
    if (/^(https?:)?\/\//.test(lien)) {
      const url = lien.startsWith('//') ? `https:${lien}` : lien;
      if (!externes.has(url)) externes.set(url, []);
      externes.get(url).push({ rel, extraits: [brut, url], ligne });
      continue;
    }
    if (lien === '#') continue;
    lienInterne(page, rel, lien, brut, ligne);
  }

  // Images de partage : fichier local obligatoire ; URL en ligne contrôlée comme un lien externe.
  const adresse = (lire(path.join(RACINE, 'site.json')).match(/"adresse"\s*:\s*"([^"]+)"/) || [])[1];
  for (const m of html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/g)) {
    const url = m[1];
    if (adresse && url.startsWith(adresse)) {
      const local = path.join(SORTIE, url.slice(adresse.length).replace(/^\//, ''));
      if (!existeExactement(local)) {
        erreur(`l'image de partage ${url} n'existe pas dans le site (page ${rel}).`, { ...localiser(rel, ['og-image:', 'imagePartage']), action: 'corrigez "og-image" dans l\'en-tête de la page, ou "imagePartage" dans site.json.' });
      } else {
        if (!externes.has(url)) externes.set(url, []);
        externes.get(url).push({ rel, extraits: ['og-image', 'imagePartage'], ligne: ligneDe(html, m.index), partage: true });
      }
    }
  }
}

// ---------- Feuilles de style : url(...) ----------
for (const css of feuilles) {
  const texte = lire(css);
  for (const m of texte.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const lien = m[1].trim();
    if (/^(https?:|data:|#|\/\/)/.test(lien)) continue;
    nbInternes += 1;
    if (!existeExactement(resoudre(css, lien))) {
      erreur(`fichier introuvable dans la feuille de style : url(${lien}).`, { fichier: relSortie(css), ligne: ligneDe(texte, m.index), action: 'corrigez le chemin ou ajoutez le fichier manquant.' });
    }
  }
}

// ---------- Doublons de noms de fichiers (casse ignorée) ----------
const parNom = new Map();
for (const f of tous) {
  const cle = relSortie(f).toLowerCase();
  if (parNom.has(cle)) {
    erreur(`deux fichiers ne diffèrent que par la casse : ${relSortie(f)} et ${parNom.get(cle)}.`, { fichier: relSortie(f), action: 'renommez l\'un des deux : sur le site en ligne, ils risquent de se confondre.' });
  } else parNom.set(cle, relSortie(f));
}

// ---------- Liens externes (avertissements seulement) ----------
async function testerUrl(url) {
  const essayer = async (methode) => {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 15000);
    try {
      return await fetch(url, { method: methode, redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (controle-liens theo-richard.fr)' } });
    } finally {
      clearTimeout(minuteur);
    }
  };
  try {
    let r = await essayer('HEAD');
    if (r.status >= 400) r = await essayer('GET');
    return r.status;
  } catch (e) {
    return `injoignable (${e.cause?.code || e.name})`;
  }
}

let nbExternes = 0;
if (!SANS_EXTERNES) {
  const liste = [...externes.entries()];
  nbExternes = liste.length;
  let suivant = 0;
  const travailleur = async () => {
    while (suivant < liste.length) {
      const [url, usages] = liste[suivant++];
      const statut = await testerUrl(url);
      const ok = typeof statut === 'number' && (statut < 400 || [401, 403, 405, 429, 999].includes(statut));
      if (ok) continue;
      const u = usages[0];
      const l = localiser(u.rel, u.extraits);
      const info = l.genere ? { fichier: `${l.fichier} (page générée)`, ligne: u.ligne } : l;
      const diagnostic = typeof statut === 'number' ? `répond « erreur ${statut} »` : statut;
      avertir(`lien externe qui ne répond pas : ${url} ${diagnostic}${usages.length > 1 ? ` (utilisé dans ${usages.length} pages)` : ''}.`, {
        ...info,
        action: u.partage
          ? 'normal avant la première publication de cette image ; sinon vérifiez que le fichier est bien publié.'
          : 'ouvrez le lien dans votre navigateur : s\'il est réellement mort, mettez à jour le lien ; sinon ignorez (le site tiers est peut-être lent). Cet avertissement ne bloque pas la publication.',
      });
    }
  };
  await Promise.all(Array.from({ length: 6 }, travailleur));
}

afficher();
sauverRapport({ pages: pages.length, liensInternes: nbInternes, images: nbImages, liensExternes: nbExternes, externesVerifies: !SANS_EXTERNES });
const rapport = { erreurs: erreurs.length, avertissements: avertissements.length };
console.log(`\nContrôles : ${pages.length} pages, ${nbInternes} liens internes, ${nbImages} images${SANS_EXTERNES ? '' : `, ${nbExternes} liens externes`}.`);
if (rapport.erreurs) {
  console.error(`❌ ${rapport.erreurs} erreur(s) bloquante(s) (${rapport.avertissements} avertissement(s)). Corrigez-les : le site ne sera pas publié.`);
  process.exit(1);
}
console.log(`✅ Aucune erreur bloquante (${rapport.avertissements} avertissement(s)).`);
