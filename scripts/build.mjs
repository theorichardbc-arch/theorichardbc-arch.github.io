// Génère le site final dans le dossier _site/ à partir de :
//   - portfolio.json, articles.json, tarifs.json (contenus)
//   - photos/originaux/ (images déposées)
//   - src/ (pages gabarits contenant des marqueurs <!-- @auto:nom -->)
// Usage : npm ci && npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, '_site');
const DOSSIER_ORIGINAUX = path.join(RACINE, 'photos', 'originaux');
const EXTENSIONS_IMAGES = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Éléments du dépôt qui ne doivent pas être publiés sur le site.
const EXCLUS = new Set([
  '.git', '.github', '.gitignore', '.gitattributes', 'node_modules', '_site', 'src', 'scripts',
  'package.json', 'package-lock.json', 'README.md', 'portfolio.json', 'articles.json', 'tarifs.json', 'site.json',
  path.join('photos', 'originaux'),
]);

const erreurs = [];
const avertissements = [];
const erreur = (msg) => { erreurs.push(msg); };
const avertir = (msg) => { avertissements.push(msg); };

function echapper(texte, attribut = false) {
  let t = String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (attribut) t = t.replace(/"/g, '&quot;');
  return t;
}

function lireJson(fichier) {
  const chemin = path.join(RACINE, fichier);
  if (!fs.existsSync(chemin)) {
    erreur(`${fichier} : fichier introuvable.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(chemin, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    erreur(`${fichier} : le fichier n'est pas un JSON valide (${e.message}). Vérifiez les guillemets "..." et les virgules entre les blocs { }.`);
    return null;
  }
}

function texteObligatoire(valeur, ou, champ) {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    erreur(`${ou} : le champ "${champ}" est manquant ou vide.`);
    return false;
  }
  return true;
}

function champsInconnus(objet, autorises, ou) {
  for (const cle of Object.keys(objet)) {
    if (!autorises.includes(cle)) avertir(`${ou} : champ inconnu "${cle}" (ignoré). Champs attendus : ${autorises.join(', ')}.`);
  }
}

function copierArbre(source, cible, relatif = '') {
  fs.mkdirSync(cible, { recursive: true });
  for (const entree of fs.readdirSync(source, { withFileTypes: true })) {
    const rel = path.join(relatif, entree.name);
    if (EXCLUS.has(rel)) continue;
    const s = path.join(source, entree.name);
    const c = path.join(cible, entree.name);
    if (entree.isDirectory()) copierArbre(s, c, rel);
    else fs.copyFileSync(s, c);
  }
}

// ---------- PORTFOLIO ----------
async function traiterPortfolio() {
  const photos = lireJson('portfolio.json');
  if (!photos) return null;
  if (!Array.isArray(photos)) {
    erreur('portfolio.json : le fichier doit être une liste [ ... ] de photos.');
    return null;
  }

  const dejaVus = new Map();
  const valides = [];
  photos.forEach((p, i) => {
    const ou = `portfolio.json, photo n°${i + 1}`;
    if (typeof p !== 'object' || p === null) return erreur(`${ou} : bloc { ... } attendu.`);
    champsInconnus(p, ['nom_fichier', 'titre', 'info'], ou);
    const ok = texteObligatoire(p.nom_fichier, ou, 'nom_fichier') && texteObligatoire(p.titre, `${ou} (${p.nom_fichier})`, 'titre');
    if (!ok) return;
    if (p.info !== undefined && typeof p.info !== 'string') return erreur(`${ou} (${p.nom_fichier}) : "info" doit être un texte entre guillemets.`);
    const base = path.parse(p.nom_fichier).name;
    const ext = path.extname(p.nom_fichier).toLowerCase();
    if (!EXTENSIONS_IMAGES.includes(ext)) return erreur(`${ou} : "${p.nom_fichier}" n'a pas une extension d'image reconnue (${EXTENSIONS_IMAGES.join(', ')}).`);
    if (dejaVus.has(base)) return erreur(`${ou} : "${p.nom_fichier}" porte le même nom (hors extension) que "${dejaVus.get(base)}". Renommez l'une des deux images.`);
    dejaVus.set(base, p.nom_fichier);
    if (!fs.existsSync(path.join(DOSSIER_ORIGINAUX, p.nom_fichier))) {
      return erreur(`${ou} : l'image "${p.nom_fichier}" est introuvable dans photos/originaux/. Vérifiez l'orthographe (majuscules, extension) ou déposez l'image.`);
    }
    valides.push({ ...p, base, info: p.info || '' });
  });

  if (fs.existsSync(DOSSIER_ORIGINAUX)) {
    const listees = new Set(photos.map((p) => p && p.nom_fichier));
    for (const f of fs.readdirSync(DOSSIER_ORIGINAUX)) {
      if (EXTENSIONS_IMAGES.includes(path.extname(f).toLowerCase()) && !listees.has(f)) {
        avertir(`photos/originaux/${f} n'est pas dans portfolio.json : elle ne sera pas publiée. Ajoutez-la au JSON (nom_fichier, titre, info).`);
      }
    }
  }
  if (erreurs.length) return null;

  const dossierImages = path.join(SORTIE, 'photos', 'images');
  const dossierMini = path.join(dossierImages, 'thumbs');
  fs.mkdirSync(dossierMini, { recursive: true });

  for (const p of valides) {
    const source = path.join(DOSSIER_ORIGINAUX, p.nom_fichier);
    try {
      const meta = await sharp(source).metadata();
      const tourne = meta.orientation && meta.orientation >= 5;
      p.largeur = tourne ? meta.height : meta.width;
      p.hauteur = tourne ? meta.width : meta.height;
      const hd = path.join(dossierImages, `${p.base}.webp`);
      if (path.extname(p.nom_fichier).toLowerCase() === '.webp') fs.copyFileSync(source, hd);
      else await sharp(source).rotate().webp({ quality: 90 }).toFile(hd);
      await sharp(source)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(path.join(dossierMini, `${p.base}.jpg`));
    } catch (e) {
      erreur(`photos/originaux/${p.nom_fichier} : image illisible ou corrompue (${e.message}).`);
    }
  }
  return valides;
}

function htmlPhotos(photos) {
  return photos.map((p, i) => {
    const chargement = i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `<div class="photo-item">
  <img src="images/thumbs/${echapper(p.base, true)}.jpg" data-fullsrc="images/${echapper(p.base, true)}.webp" alt="${echapper(p.titre, true)}" width="${p.largeur}" height="${p.hauteur}" ${chargement} decoding="async"
       data-titre="${echapper(p.titre, true)}"
       data-info="${echapper(p.info, true)}">
</div>`;
  }).join('\n\n');
}

// ---------- ARTICLES ----------
function htmlArticles() {
  const articles = lireJson('articles.json');
  if (!articles) return null;
  if (!Array.isArray(articles)) {
    erreur('articles.json : le fichier doit être une liste [ ... ] d\'articles.');
    return null;
  }
  const valides = [];
  articles.forEach((a, i) => {
    const ou = `articles.json, article n°${i + 1}`;
    if (typeof a !== 'object' || a === null) return erreur(`${ou} : bloc { ... } attendu.`);
    champsInconnus(a, ['titre', 'sousTitre', 'lien', 'date'], ou);
    const ok = ['titre', 'lien', 'date'].map((c) => texteObligatoire(a[c], `${ou} (${a.titre || '?'})`, c)).every(Boolean);
    if (!ok) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(a.date)) return erreur(`${ou} (${a.titre}) : date "${a.date}" invalide. Format attendu : AAAA-MM, par exemple 2026-05.`);
    if (!/^https?:\/\//.test(a.lien)) return erreur(`${ou} (${a.titre}) : le lien doit commencer par https://`);
    valides.push(a);
  });
  if (erreurs.length) return null;
  const tries = valides.map((a, i) => ({ a, i })).sort((x, y) => y.a.date.localeCompare(x.a.date) || x.i - y.i).map((x) => x.a);
  return tries.map((a) => {
    const [annee, mois] = a.date.split('-');
    return `    <a href="${echapper(a.lien, true)}" class="service-item writing-item" target="_blank" rel="noopener">
      <div class="service-gauche">
        <span class="service-nom">${echapper(a.titre)}</span>
        <span class="service-prix">${MOIS[Number(mois) - 1]} ${annee}</span>
      </div>
      <p class="service-desc">${echapper(a.sousTitre || '')}</p>
    </a>`;
  }).join('\n\n');
}

// ---------- TARIFS ----------
function chargerTarifs() {
  const t = lireJson('tarifs.json');
  if (!t) return null;
  if (!Array.isArray(t.sections) || !Array.isArray(t.introduction)) {
    erreur('tarifs.json : les blocs "introduction" (liste) et "sections" (liste) sont obligatoires.');
    return null;
  }
  texteObligatoire(t.avertissement, 'tarifs.json', 'avertissement');
  const ids = new Set();
  t.sections.forEach((s, i) => {
    const ou = `tarifs.json, section n°${i + 1} (${s.titre || '?'})`;
    texteObligatoire(s.id, ou, 'id');
    texteObligatoire(s.titre, ou, 'titre');
    if (ids.has(s.id)) erreur(`${ou} : l'id "${s.id}" est utilisé deux fois.`);
    ids.add(s.id);
    if (s.lignes !== undefined) {
      if (!Array.isArray(s.colonnes) || s.colonnes.length !== 3) erreur(`${ou} : "colonnes" doit contenir exactement 3 titres.`);
      if (!Array.isArray(s.lignes)) erreur(`${ou} : "lignes" doit être une liste.`);
      else s.lignes.forEach((l, j) => {
        texteObligatoire(l.nom, `${ou}, ligne n°${j + 1}`, 'nom');
        texteObligatoire(l.prix, `${ou}, ligne n°${j + 1} (${l.nom})`, 'prix');
      });
    }
  });
  return erreurs.length ? null : t;
}

function htmlTarifs(t) {
  const blocs = [`    <section class="tarifs-intro">
${t.introduction.map((p) => `      <p>${echapper(p)}</p>`).join('\n')}
      <p class="tarifs-note">${echapper(t.avertissement)}</p>
    </section>`];
  for (const s of t.sections) {
    const id = `tarifs-${s.id}`;
    let html = `    <section class="tarifs-section" aria-labelledby="${echapper(id, true)}">
      <h2 id="${echapper(id, true)}">${echapper(s.titre)}</h2>
`;
    if (s.note) html += `      <p class="tarifs-note">${echapper(s.note)}</p>\n`;
    if (s.lignes) {
      html += `      <table class="tarifs-table">
        <thead><tr>${s.colonnes.map((c) => `<th scope="col">${echapper(c)}</th>`).join('')}</tr></thead>
        <tbody>
${s.lignes.map((l) => `          <tr>
            <th scope="row">${echapper(l.nom)}${l.duree ? ` <small>${echapper(l.duree)}</small>` : ''}</th>
            <td>${echapper(l.description || '')}</td>
            <td class="tarifs-price">${echapper(l.prix)}${l.prixDetail ? `<span>${echapper(l.prixDetail)}</span>` : ''}</td>
          </tr>`).join('\n')}
        </tbody>
      </table>
`;
    }
    if (s.texte || s.liste) {
      html += '      <div class="tarifs-text">\n';
      if (s.texte) html += `        <p>${echapper(s.texte)}</p>\n`;
      if (s.liste) html += `        <ul>\n${s.liste.map((li) => `          <li>${echapper(li)}</li>`).join('\n')}\n        </ul>\n`;
      html += '      </div>\n';
    }
    if (s.noteFinale) {
      const lienContact = s.texte ? ' <a href="../core/contact.html">Contact</a>.' : '';
      html += `      <p class="tarifs-note">${echapper(s.noteFinale)}${lienContact}</p>\n`;
    }
    html += '    </section>';
    blocs.push(html);
  }
  return blocs.join('\n\n');
}

function sectionTarifs(t, id) {
  const s = t.sections.find((x) => x.id === id);
  if (!s || !s.lignes) {
    erreur(`tarifs.json : la section "${id}" (avec des lignes) est nécessaire pour alimenter les pages de prestations.`);
    return null;
  }
  return s;
}

function prixDepartLabo(t) {
  const s = sectionTarifs(t, 'labo');
  if (!s) return '';
  const montants = s.lignes
    .filter((l) => !l.prix.trim().startsWith('+'))
    .map((l) => ({ l, n: parseFloat(((l.prix.match(/\d+(?:[.,]\d+)?/) || [])[0] || '').replace(',', '.')) }))
    .filter((x) => !Number.isNaN(x.n));
  if (!montants.length) {
    erreur('tarifs.json : aucun prix exploitable dans la section "labo".');
    return '';
  }
  const min = montants.reduce((a, b) => (b.n < a.n ? b : a));
  return echapper(min.l.prix.match(/^[^/]*/)[0].trim());
}

function htmlFormats(t, id, indentation) {
  const s = sectionTarifs(t, id);
  if (!s) return '';
  return s.lignes.map((l) => {
    const prix = `${l.prix}${l.prixDetail ? ` (${l.prixDetail})` : ''}`;
    return `${indentation}<p>${echapper(l.nom)}${l.duree ? ` — ${echapper(l.duree)}` : ''} : ${echapper(l.description || '')} Tarif : ${echapper(prix)}.</p>`;
  }).join('\n');
}

// ---------- GABARITS ----------
const dossierSrc = path.join(RACINE, 'src');
const dossierPartiels = path.join(dossierSrc, 'partials');
const posix = (p) => p.split(path.sep).join('/');

function lirePartiel(nom) {
  return fs.readFileSync(path.join(dossierPartiels, nom), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function listerGabarits(dossier, relatif = '') {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(relatif, e.name);
    if (rel === 'partials') return [];
    return e.isDirectory() ? listerGabarits(path.join(dossier, e.name), rel) : [rel];
  });
}

// Lit l'en-tête "---" (réglages de la page) puis le contenu HTML.
function separerReglages(texte, rel) {
  const m = texte.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) {
    erreur(`src/${posix(rel)} : l'en-tête de la page est absent. Le fichier doit commencer par une ligne --- puis "titre: ..." puis une ligne ---.`);
    return { reglages: {}, contenu: texte };
  }
  const reglages = {};
  m[1].split('\n').forEach((ligne, i) => {
    if (!ligne.trim()) return;
    const kv = ligne.match(/^([a-z-]+):[ \t]*(.*)$/);
    if (!kv) return erreur(`src/${posix(rel)}, ligne ${i + 2} : réglage illisible "${ligne}". Format attendu : nom: valeur.`);
    reglages[kv[1]] = kv[2].trim();
  });
  return { reglages, contenu: texte.slice(m[0].length) };
}

function chargerSite() {
  const s = lireJson('site.json');
  if (!s) return null;
  for (const c of ['adresse', 'auteur', 'imagePartage']) texteObligatoire(s[c], 'site.json', c);
  for (const liste of ['menu', 'menuMobileSecondaire', 'pied']) {
    if (!Array.isArray(s[liste])) { erreur(`site.json : "${liste}" doit être une liste [ ... ].`); continue; }
    s[liste].forEach((e, i) => {
      const ou = `site.json, "${liste}", entrée n°${i + 1}`;
      texteObligatoire(e && e.titre, ou, 'titre');
      texteObligatoire(e && e.page, ou, 'page');
    });
  }
  return erreurs.length ? null : s;
}

function lienMenu(entree, racine, actif, indentation) {
  return `${indentation}<a href="${echapper(racine + entree.page, true)}"${actif ? ' aria-current="page"' : ''}>${echapper(entree.titre)}</a>`;
}

function htmlMenuAccueil(site) {
  return site.menu.map((e) => `    <a class="home-section-link" href="${echapper(e.page, true)}">
      <span class="home-section-copy">
        <span class="home-section-name">${echapper(e.titre)}</span>
      </span>
    </a>`).join('\n');
}

function htmlMetaPage(site, rel, r) {
  const url = rel === 'index.html' ? `${site.adresse}/` : `${site.adresse}/${posix(rel)}`;
  const titre = r.titre;
  const lignes = [`<title>${echapper(titre)}</title>`];
  const meta = (attr, nom, valeur) => { if (valeur) lignes.push(`<meta ${attr}="${nom}" content="${echapper(valeur, true)}">`); };
  meta('name', 'description', r.description);
  meta('name', 'keywords', r['mots-cles']);
  meta('name', 'author', site.auteur);
  meta('property', 'og:title', r['og-titre'] || titre);
  meta('property', 'og:description', r['og-description'] || r.description);
  meta('property', 'og:type', r['og-type'] || 'website');
  meta('property', 'og:url', url);
  meta('property', 'og:image', `${site.adresse}/${r['og-image'] || site.imagePartage}`);
  return lignes.join('\n');
}

function assembler(site, rel, r, contenu) {
  const profondeur = posix(rel).split('/').length - 1;
  const racine = '../'.repeat(profondeur);
  const actuelle = r.menu || posix(rel);
  const menu = site.menu.map((e) => lienMenu(e, racine, e.page === actuelle, '    ')).join('\n');
  const menuMobile = site.menu.map((e) => lienMenu(e, racine, e.page === actuelle, '  ')).join('\n');
  const secondaire = site.menuMobileSecondaire.map((e) => lienMenu(e, racine, false, '    ')).join('\n');
  const piedLiens = site.pied.map((e) => lienMenu(e, racine, false, '    ')).join('\n');
  const remplacer = (modele, valeurs) => modele.replace(/\{\{([a-z-]+)\}\}/g, (tout, nom) => (nom in valeurs ? valeurs[nom] : tout));

  const entete = remplacer(lirePartiel('entete.html'), { racine, menu: '{{menu}}', 'menu-secondaire': secondaire })
    .replace('{{menu}}', menu).replace('{{menu}}', menuMobile);
  const pied = remplacer(lirePartiel('pied.html'), { 'pied-liens': piedLiens });
  return remplacer(lirePartiel('page.html'), {
    meta: htmlMetaPage(site, rel, r),
    racine,
    'classe-body': r['classe-body'] ? ` class="${echapper(r['classe-body'], true)}"` : '',
    entete,
    contenu: contenu.trim(),
    pied,
    scripts: lirePartiel('scripts.html'),
  });
}

function rendreGabarits(valeurs, site) {
  for (const rel of listerGabarits(dossierSrc)) {
    const brut = fs.readFileSync(path.join(dossierSrc, rel), 'utf8').replace(/\r\n/g, '\n');
    const { reglages, contenu: corps } = separerReglages(brut, rel);
    const remplacer = (tout, nom) => {
      if (!(nom in valeurs)) { erreur(`src/${posix(rel)} : marqueur inconnu @auto:${nom}.`); return tout; }
      return valeurs[nom];
    };
    // Marqueur seul sur sa ligne : le bloc généré porte sa propre indentation.
    let contenu = corps.replace(/^[ \t]*<!-- @auto:([a-z-]+) -->[ \t]*$/gm, (tout, nom) => remplacer(tout, nom));
    contenu = contenu.replace(/<!-- @auto:([a-z-]+) -->/g, remplacer);
    let html;
    if (reglages['mise-en-page'] === 'nue') {
      html = contenu.trim() + '\n';
    } else {
      if (!texteObligatoire(reglages.titre, `src/${posix(rel)} (en-tête)`, 'titre')) continue;
      html = assembler(site, rel, reglages, contenu);
    }
    const cible = path.join(SORTIE, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, html);
    console.log(`  page générée : ${posix(rel)}`);
  }
}

async function main() {
  console.log('Construction du site…');
  fs.rmSync(SORTIE, { recursive: true, force: true });
  copierArbre(RACINE, SORTIE);

  const photos = await traiterPortfolio();
  const articles = htmlArticles();
  const tarifs = chargerTarifs();
  const site = chargerSite();
  if (erreurs.length) return;

  const valeurs = {
    'menu-accueil': htmlMenuAccueil(site),
    photos: htmlPhotos(photos),
    articles,
    tarifs: htmlTarifs(tarifs),
    'prix-depart-labo': prixDepartLabo(tarifs),
    'formats-labo': htmlFormats(tarifs, 'labo', '        '),
    'formats-seances': htmlFormats(tarifs, 'seances', '    '),
  };
  if (erreurs.length) return;
  rendreGabarits(valeurs, site);
  console.log(`  ${photos.length} photos : miniatures et versions HD créées.`);
}

try {
  await main();
} catch (e) {
  erreur(`Erreur inattendue : ${e.stack || e.message}`);
}

for (const a of avertissements) console.warn(`⚠️  AVERTISSEMENT — ${a}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`❌ ERREUR — ${e}`);
  console.error(`\nLe site n'a pas été construit : ${erreurs.length} erreur(s) à corriger ci-dessus.`);
  process.exit(1);
}
console.log('✅ Site construit dans _site/');
