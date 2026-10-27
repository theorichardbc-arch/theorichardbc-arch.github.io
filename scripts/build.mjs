// Génère le site final dans le dossier _site/ à partir de :
//   - portfolio.json, articles.json, tarifs.json (contenus)
//   - photos/originaux/ (images déposées)
//   - src/ (pages gabarits contenant des marqueurs <!-- @auto:nom -->)
// Usage : npm ci && npm run build
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { RACINE, erreur, avertir, erreurs, afficher, reinitialiserRapport, sauverRapport } from './lib/rapport.mjs';
import { lireJson, ligneDe } from './lib/json.mjs';

const SORTIE = path.join(RACINE, '_site');
const DOSSIER_ORIGINAUX = path.join(RACINE, 'photos', 'originaux');
const EXTENSIONS_IMAGES = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Éléments du dépôt qui ne doivent pas être publiés sur le site.
const EXCLUS = new Set([
  '.git', '.github', '.gitignore', '.gitattributes', '.controles', 'node_modules', '_site', 'src', 'scripts',
  'package.json', 'package-lock.json', 'README.md', 'portfolio.json', 'articles.json', 'tarifs.json', 'projets.json', 'site.json',
  path.join('photos', 'originaux'),
]);

function echapper(texte, attribut = false) {
  let t = String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (attribut) t = t.replace(/"/g, '&quot;');
  return t;
}

// Un "lieu" désigne un bloc d'un fichier JSON : { fichier, chemin: ['2'] ou ['sections','1'], libelle: 'photo n°3' }.
const lieu = (fichier, chemin, libelle) => ({ fichier, chemin, libelle });

function signaler(l, message, { action, champ, avertissement = false } = {}) {
  const info = { fichier: l.fichier, ligne: ligneDe(l.fichier, ...l.chemin, ...(champ ? [champ] : [])), action };
  (avertissement ? avertir : erreur)(`${l.libelle} : ${message}`, info);
}

function texteObligatoire(valeur, l, champ, exemple) {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    signaler(l, `le champ "${champ}" est manquant ou vide.`, { champ, action: `ajoutez "${champ}": "${exemple || '...'}" dans ce bloc (entre guillemets, avec une virgule entre deux champs).` });
    return false;
  }
  return true;
}

function champsInconnus(objet, autorises, l) {
  for (const cle of Object.keys(objet)) {
    if (!autorises.includes(cle)) {
      signaler(l, `champ inconnu "${cle}" (il sera ignoré).`, { champ: cle, avertissement: true, action: `vérifiez l'orthographe. Champs attendus : ${autorises.join(', ')}.` });
    }
  }
}

function detecterDoublons(elements, cle, nom, fichier, action) {
  const vus = new Map();
  elements.forEach(({ valeur, i, libelle }) => {
    const k = String(valeur).trim().toLowerCase();
    if (vus.has(k)) {
      const l = lieu(fichier, [String(i)], libelle);
      signaler(l, `${nom} « ${valeur} » déjà utilisé par ${vus.get(k).libelle} (ligne ${ligneDe(fichier, String(vus.get(k).i)) || '?'}).`, { champ: cle, action });
    } else vus.set(k, { i, libelle });
  });
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
    erreur('le fichier doit être une liste [ ... ] de photos.', { fichier: 'portfolio.json', ligne: 1, action: 'le fichier doit commencer par [ et se terminer par ].' });
    return null;
  }

  const dejaVus = new Map();
  const valides = [];
  const titres = [];
  photos.forEach((p, i) => {
    const l = lieu('portfolio.json', [String(i)], `photo n°${i + 1}${p && p.nom_fichier ? ` (${p.nom_fichier})` : ''}`);
    if (typeof p !== 'object' || p === null) return signaler(l, 'bloc { ... } attendu.', { action: 'chaque photo doit être un bloc { "nom_fichier": "...", "titre": "...", "info": "..." }.' });
    champsInconnus(p, ['nom_fichier', 'titre', 'info'], l);
    const ok = texteObligatoire(p.nom_fichier, l, 'nom_fichier', 'ma-photo.webp') & texteObligatoire(p.titre, l, 'titre', 'Titre de la photo');
    if (!ok) return;
    if (p.info !== undefined && typeof p.info !== 'string') return signaler(l, '"info" doit être un texte entre guillemets.', { champ: 'info', action: 'écrivez "info": "votre texte" (ou supprimez la ligne).' });
    const base = path.parse(p.nom_fichier).name;
    const ext = path.extname(p.nom_fichier).toLowerCase();
    if (!EXTENSIONS_IMAGES.includes(ext)) return signaler(l, `"${p.nom_fichier}" n'a pas une extension d'image reconnue.`, { champ: 'nom_fichier', action: `utilisez une image ${EXTENSIONS_IMAGES.join(', ')}.` });
    titres.push({ valeur: p.titre, i, libelle: l.libelle });
    if (dejaVus.has(base)) return signaler(l, `le nom "${p.nom_fichier}" est identique (hors extension) à "${dejaVus.get(base)}".`, { champ: 'nom_fichier', action: 'renommez l\'une des deux images (dans photos/originaux/ et dans le JSON).' });
    dejaVus.set(base, p.nom_fichier);
    if (!fs.existsSync(path.join(DOSSIER_ORIGINAUX, p.nom_fichier))) {
      return signaler(l, `l'image "${p.nom_fichier}" est introuvable dans photos/originaux/.`, { champ: 'nom_fichier', action: 'vérifiez l\'orthographe exacte (majuscules, extension) ou déposez l\'image dans photos/originaux/.' });
    }
    valides.push({ ...p, base, info: p.info || '' });
  });
  detecterDoublons(titres, 'titre', 'le titre', 'portfolio.json', 'donnez un titre différent à chaque photo (par exemple en ajoutant un détail ou un numéro).');

  if (fs.existsSync(DOSSIER_ORIGINAUX)) {
    const listees = new Set(photos.map((p) => p && p.nom_fichier));
    const bases = new Map();
    for (const f of fs.readdirSync(DOSSIER_ORIGINAUX)) {
      if (!EXTENSIONS_IMAGES.includes(path.extname(f).toLowerCase())) continue;
      const base = path.parse(f).name.toLowerCase();
      if (bases.has(base)) {
        erreur(`photos/originaux/${f} et photos/originaux/${bases.get(base)} ont le même nom (hors extension) : l'une écraserait l'autre sur le site.`, { fichier: `photos/originaux/${f}`, action: 'renommez ou supprimez l\'une des deux images.' });
      }
      bases.set(base, f);
      if (!listees.has(f)) {
        avertir(`l'image n'est pas utilisée : elle n'est pas dans portfolio.json et ne sera donc pas publiée.`, { fichier: `photos/originaux/${f}`, action: 'ajoutez-la à portfolio.json (nom_fichier, titre, info), ou supprimez-la si elle est inutile.' });
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
      erreur(`image illisible ou corrompue (${e.message}).`, { fichier: `photos/originaux/${p.nom_fichier}`, action: 'ré-exportez l\'image depuis votre logiciel photo puis redéposez-la.' });
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
    erreur('le fichier doit être une liste [ ... ] d\'articles.', { fichier: 'articles.json', ligne: 1, action: 'le fichier doit commencer par [ et se terminer par ].' });
    return null;
  }
  const valides = [];
  const titres = [];
  articles.forEach((a, i) => {
    const l = lieu('articles.json', [String(i)], `article n°${i + 1}${a && a.titre ? ` (« ${a.titre} »)` : ''}`);
    if (typeof a !== 'object' || a === null) return signaler(l, 'bloc { ... } attendu.', { action: 'chaque article doit être un bloc { "titre": "...", "lien": "https://...", "date": "AAAA-MM" }.' });
    champsInconnus(a, ['titre', 'sousTitre', 'lien', 'date'], l);
    const exemples = { titre: 'Titre de l\'article', lien: 'https://...', date: '2026-05' };
    const ok = ['titre', 'lien', 'date'].map((c) => texteObligatoire(a[c], l, c, exemples[c])).every(Boolean);
    if (!ok) return;
    titres.push({ valeur: a.titre, i, libelle: l.libelle });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(a.date)) return signaler(l, `date "${a.date}" invalide.`, { champ: 'date', action: 'format attendu : AAAA-MM, par exemple "2026-05".' });
    if (!/^https?:\/\//.test(a.lien)) return signaler(l, 'le lien est invalide.', { champ: 'lien', action: 'le lien doit commencer par https://' });
    valides.push(a);
  });
  detecterDoublons(titres, 'titre', 'le titre', 'articles.json', 'chaque article doit avoir un titre différent.');
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

// ---------- PROJETS ----------
function htmlProjets() {
  const projets = lireJson('projets.json');
  if (!projets) return null;
  if (!Array.isArray(projets)) {
    erreur('le fichier doit être une liste [ ... ] de projets.', { fichier: 'projets.json', ligne: 1, action: 'le fichier doit commencer par [ et se terminer par ].' });
    return null;
  }
  const valides = [];
  const titres = [];
  projets.forEach((p, i) => {
    const l = lieu('projets.json', [String(i)], `projet n°${i + 1}${p && p.titre ? ` (« ${p.titre} »)` : ''}`);
    if (typeof p !== 'object' || p === null) return signaler(l, 'bloc { ... } attendu.', { action: 'chaque projet est un bloc { "titre": "...", "description": "...", "lien": "..." }.' });
    champsInconnus(p, ['titre', 'description', 'lien'], l);
    const exemples = { titre: 'Titre du projet', description: 'Une ou deux phrases', lien: 'projets/ma-page.html ou https://...' };
    const ok = ['titre', 'description', 'lien'].map((c) => texteObligatoire(p[c], l, c, exemples[c])).every(Boolean);
    if (!ok) return;
    titres.push({ valeur: p.titre, i, libelle: l.libelle });
    valides.push(p);
  });
  detecterDoublons(titres, 'titre', 'le titre', 'projets.json', 'chaque projet doit avoir un titre différent.');
  if (erreurs.length) return null;
  return valides.map((p) => {
    const externe = /^https?:\/\//.test(p.lien);
    // Les liens internes s'écrivent depuis la racine du site (projets/alpes.html) ; la page est dans projets/.
    const href = externe ? p.lien : path.posix.relative('projets', p.lien.replace(/^\//, ''));
    return `  <a class="texte-item lien-carte" href="${echapper(href, true)}"${externe ? ' target="_blank" rel="noopener"' : ''}>
    <span class="texte-titre">${echapper(p.titre)}</span>
    <span class="texte-intro">${echapper(p.description)}</span>
  </a>`;
  }).join('\n\n');
}

// ---------- TARIFS ----------
function chargerTarifs() {
  const t = lireJson('tarifs.json');
  if (!t) return null;
  if (!t || typeof t !== 'object' || !Array.isArray(t.sections) || !Array.isArray(t.introduction)) {
    erreur('les blocs "introduction" (liste de paragraphes) et "sections" (liste) sont obligatoires.', { fichier: 'tarifs.json', ligne: 1, action: 'restaurez la structure { "introduction": [...], "avertissement": "...", "sections": [...] }.' });
    return null;
  }
  texteObligatoire(t.avertissement, lieu('tarifs.json', [], 'tarifs.json'), 'avertissement', 'Tarifs 2026, TTC.');
  const ids = new Set();
  t.sections.forEach((s, i) => {
    const l = lieu('tarifs.json', ['sections', String(i)], `section n°${i + 1}${s && s.titre ? ` (« ${s.titre} »)` : ''}`);
    if (typeof s !== 'object' || s === null) return signaler(l, 'bloc { ... } attendu.', { action: 'chaque section est un bloc { "id": "...", "titre": "...", ... }.' });
    texteObligatoire(s.id, l, 'id', 'labo');
    texteObligatoire(s.titre, l, 'titre', 'Titre de la section');
    if (ids.has(s.id)) signaler(l, `l'id "${s.id}" est utilisé deux fois.`, { champ: 'id', action: 'donnez un id différent à chaque section.' });
    ids.add(s.id);
    if (s.lignes !== undefined) {
      if (!Array.isArray(s.colonnes) || s.colonnes.length !== 3) signaler(l, '"colonnes" doit contenir exactement 3 titres.', { champ: 'colonnes', action: 'par exemple "colonnes": ["Prestation", "Détail", "Tarif"].' });
      if (!Array.isArray(s.lignes)) signaler(l, '"lignes" doit être une liste.', { champ: 'lignes', action: 'écrivez "lignes": [ { ... }, { ... } ].' });
      else s.lignes.forEach((ligne, j) => {
        const lj = lieu('tarifs.json', ['sections', String(i), 'lignes', String(j)], `${l.libelle}, ligne n°${j + 1}${ligne && ligne.nom ? ` (« ${ligne.nom} »)` : ''}`);
        if (typeof ligne !== 'object' || ligne === null) return signaler(lj, 'bloc { ... } attendu.', { action: 'chaque ligne est un bloc { "nom": "...", "prix": "..." }.' });
        texteObligatoire(ligne.nom, lj, 'nom', 'Nom de la prestation');
        texteObligatoire(ligne.prix, lj, 'prix', '25 €');
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
    erreur(`la section "${id}" (avec des lignes) est nécessaire pour alimenter les pages de prestations.`, { fichier: 'tarifs.json', ligne: 1, action: `rétablissez une section { "id": "${id}", "lignes": [...] }.` });
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
    erreur('aucun prix exploitable dans la section "labo".', { fichier: 'tarifs.json', ligne: ligneDe('tarifs.json', 'sections') || 1, action: 'les prix doivent contenir un nombre, par exemple "25 €".' });
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
    erreur('l\'en-tête de la page est absent.', { fichier: `src/${posix(rel)}`, ligne: 1, action: 'le fichier doit commencer par une ligne ---, puis "titre: ...", puis une ligne ---.' });
    return { reglages: {}, contenu: texte };
  }
  const reglages = {};
  m[1].split('\n').forEach((ligne, i) => {
    if (!ligne.trim()) return;
    const kv = ligne.match(/^([a-z-]+):[ \t]*(.*)$/);
    if (!kv) return erreur(`réglage illisible "${ligne}".`, { fichier: `src/${posix(rel)}`, ligne: i + 2, action: 'écrivez nom: valeur (par exemple titre: Mon titre).' });
    reglages[kv[1]] = kv[2].trim();
  });
  return { reglages, contenu: texte.slice(m[0].length) };
}

function chargerSite() {
  const s = lireJson('site.json');
  if (!s) return null;
  const ls = lieu('site.json', [], 'site.json');
  for (const c of ['adresse', 'auteur', 'imagePartage']) texteObligatoire(s[c], ls, c, '...');
  for (const liste of ['menu', 'menuMobileSecondaire', 'pied']) {
    if (!Array.isArray(s[liste])) { erreur(`"${liste}" doit être une liste [ ... ].`, { fichier: 'site.json', ligne: ligneDe('site.json', liste) || 1, action: `écrivez "${liste}": [ { "titre": "...", "page": "..." } ].` }); continue; }
    s[liste].forEach((e, i) => {
      const ou = lieu('site.json', [liste, String(i)], `"${liste}", entrée n°${i + 1}`);
      texteObligatoire(e && e.titre, ou, 'titre', 'Mon titre');
      texteObligatoire(e && e.page, ou, 'page', 'dossier/page.html');
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
      if (!(nom in valeurs)) { erreur(`marqueur inconnu @auto:${nom}.`, { fichier: `src/${posix(rel)}`, action: 'utilisez un marqueur existant (menu-accueil, photos, articles, tarifs, prix-depart-labo, formats-labo, formats-seances).' }); return tout; }
      return valeurs[nom];
    };
    // Marqueur seul sur sa ligne : le bloc généré porte sa propre indentation.
    let contenu = corps.replace(/^[ \t]*<!-- @auto:([a-z-]+) -->[ \t]*$/gm, (tout, nom) => remplacer(tout, nom));
    contenu = contenu.replace(/<!-- @auto:([a-z-]+) -->/g, remplacer);
    let html;
    if (reglages['mise-en-page'] === 'nue') {
      html = contenu.trim() + '\n';
    } else {
      if (!texteObligatoire(reglages.titre, lieu(`src/${posix(rel)}`, [], `src/${posix(rel)} (en-tête)`), 'titre', 'Mon titre')) continue;
      html = assembler(site, rel, reglages, contenu);
    }
    const cible = path.join(SORTIE, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, html);
    console.log(`  page générée : ${posix(rel)}`);
    if (reglages.sitemap !== 'non') {
      const donnees = [...new Set([...corps.matchAll(/@auto:([a-z-]+)/g)].map((m) => DONNEES_DES_MARQUEURS[m[1]]).filter(Boolean))];
      pagesPubliques.push({ rel: posix(rel), sources: [path.join('src', rel), ...donnees] });
    }
  }
}

// ---------- SITEMAP ET ROBOTS ----------
const pagesPubliques = [];
const DONNEES_DES_MARQUEURS = {
  'menu-accueil': 'site.json', photos: 'portfolio.json', articles: 'articles.json', projets: 'projets.json',
  tarifs: 'tarifs.json', 'prix-depart-labo': 'tarifs.json', 'formats-labo': 'tarifs.json', 'formats-seances': 'tarifs.json',
};

// Date du dernier changement (git) des fichiers dont dépend la page ; date du jour si git ne sait pas.
function dateModification(sources) {
  let derniere = '';
  for (const s of sources) {
    try {
      const d = execFileSync('git', ['log', '-1', '--format=%cI', '--', s], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().slice(0, 10);
      if (d > derniere) derniere = d;
    } catch { /* git indisponible */ }
  }
  return derniere || new Date().toISOString().slice(0, 10);
}

function ecrireSitemap(site) {
  const pages = [...pagesPubliques].sort((a, b) => (a.rel === 'index.html' ? -1 : b.rel === 'index.html' ? 1 : a.rel.localeCompare(b.rel)));
  const lignes = pages.map((p) => {
    const url = p.rel === 'index.html' ? `${site.adresse}/` : `${site.adresse}/${p.rel}`;
    return `  <url>\n    <loc>${echapper(url)}</loc>\n    <lastmod>${dateModification(p.sources)}</lastmod>\n  </url>`;
  });
  fs.writeFileSync(path.join(SORTIE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lignes.join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(SORTIE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.adresse}/sitemap.xml\n`);
  console.log(`  sitemap.xml (${pages.length} pages) et robots.txt générés.`);
}

async function main() {
  reinitialiserRapport();
  console.log('Construction du site…');
  fs.rmSync(SORTIE, { recursive: true, force: true });
  copierArbre(RACINE, SORTIE);

  const photos = await traiterPortfolio();
  const articles = htmlArticles();
  const projets = htmlProjets();
  const tarifs = chargerTarifs();
  const site = chargerSite();
  if (erreurs.length) return;

  const valeurs = {
    'menu-accueil': htmlMenuAccueil(site),
    photos: htmlPhotos(photos),
    articles,
    projets,
    tarifs: htmlTarifs(tarifs),
    'prix-depart-labo': prixDepartLabo(tarifs),
    'formats-labo': htmlFormats(tarifs, 'labo', '        '),
    'formats-seances': htmlFormats(tarifs, 'seances', '    '),
  };
  if (erreurs.length) return;
  rendreGabarits(valeurs, site);
  ecrireSitemap(site);
  console.log(`  ${photos.length} photos : miniatures et versions HD créées.`);
}

try {
  await main();
} catch (e) {
  erreur(`Erreur inattendue : ${e.stack || e.message}`, { action: 'signalez ce message à la personne qui maintient le site.' });
}

afficher();
sauverRapport(false);
if (erreurs.length) {
  console.error(`\nLe site n'a pas été construit : ${erreurs.length} erreur(s) à corriger ci-dessus.`);
  process.exit(1);
}
console.log('✅ Site construit dans _site/');
