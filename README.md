# Site de Théo Richard — theo-richard.fr

Le site se met à jour **tout seul** : il suffit de déposer une image ou de modifier un petit fichier texte (JSON) sur GitHub. Quelques minutes après l'enregistrement, le site est reconstruit et publié automatiquement. Aucun logiciel à installer.

## Les gestes du quotidien

> Tous se font depuis le site github.com, directement dans le navigateur (bouton **Add file → Upload files** pour une image, icône ✏️ « crayon » pour modifier un fichier, puis **Commit changes**).

### 1. Ajouter une photo au portfolio

1. Déposez l'image (JPG, PNG ou WebP, en pleine qualité) dans le dossier **`photos/originaux/`**. Une seule image suffit : la miniature et la version web sont créées automatiquement.
2. Ouvrez **`portfolio.json`** et ajoutez ces lignes (ordre = ordre d'affichage ; n'oubliez pas la virgule entre deux blocs) :

```json
{
  "nom_fichier": "couple-thermes.jpg",
  "titre": "Couple dans les thermes de Vichy",
  "info": "Vichy, 2026 - Foma 100"
}
```

- `nom_fichier` doit être **exactement** le nom de l'image déposée (majuscules et extension comprises).
- `info` peut rester vide : `"info": ""`.
- Pour supprimer une photo : retirez son bloc du JSON (et l'image du dossier).

### 2. Ajouter un article

Ouvrez **`articles.json`** et ajoutez un bloc. Peu importe où : la page les trie du plus récent au plus ancien.

```json
{
  "titre": "Titre de l'article",
  "sousTitre": "Une phrase qui donne envie de lire.",
  "lien": "https://rtheo.substack.com/p/mon-article",
  "date": "2026-05"
}
```

La date s'écrit `AAAA-MM` (ici : mai 2026, affiché « mai 2026 »).

### 3. Modifier un tarif

Ouvrez **`tarifs.json`**, repérez la ligne de la prestation et changez le texte après `"prix"` :

```json
{
  "nom": "Séance numérique",
  "prix": "120 €"
}
```

Une même modification met à jour la page *Tarifs* et les pages *Prestations*, *Ateliers labo* et *Séances photo*. Pour ajouter une prestation, copiez un bloc `{ ... }` d'une ligne existante dans la même section.

> Le PDF téléchargeable (`documents/tarifs2026.pdf`) est **fabriqué automatiquement** à chaque mise à jour à partir de la page *Tarifs* : il est toujours à jour, ne le déposez plus à la main.

### 4. Ajouter ou copier un projet

Ouvrez **`projets.json`** : un bloc `{ ... }` = une ligne de la page *Projets*. Pour un nouveau projet, copiez un bloc existant, collez-le à la suite (avec une virgule entre deux blocs) et changez les textes :

```json
{
  "titre": "Titre du projet",
  "description": "Une ou deux phrases de présentation.",
  "lien": "projets/alpes.html"
}
```

- `lien` : soit une page du site (`projets/ma-page.html`), soit une adresse complète commençant par `https://` (elle s'ouvre alors dans un nouvel onglet).
- La page est simplement une liste de liens : rien d'autre à modifier.

### 5. Ajouter une page au menu

Ouvrez **`site.json`**, repérez la liste `"menu"` et ajoutez **une ligne** :

```json
{ "titre": "Ma page", "page": "dossier/ma-page.html" }
```

Le menu du haut, le menu mobile et l'accueil se mettent à jour partout. Pour créer la page elle-même, copiez un fichier de **`src/`** (par exemple `src/core/contact.html`) : seul l'en-tête entre les deux lignes `---` (titre, description) et le contenu changent ; l'en-tête, le menu et le pied de page sont ajoutés automatiquement.

## Si quelque chose ne s'affiche pas

## Lire les contrôles automatiques

À chaque enregistrement (et à chaque proposition de modification), GitHub vérifie le site. Dans l'onglet **Actions**, ouvrez la dernière exécution : le **résumé** en bas de page liste ce qui ne va pas. Chaque ligne indique **où** (fichier et numéro de ligne), **quoi**, et **ce qu'il faut faire**.

- ❌ **Erreur** : le site n'est **pas publié** et l'ancien site reste en ligne (rien n'est cassé). Corrigez, enregistrez : tout est revérifié.
- ⚠️ **Avertissement** : le site est publié quand même, mais cela mérite un coup d'œil.

Exemple de message :

```text
❌ portfolio.json, ligne 12 : photo n°3 (banc.webp) : l'image "banc.webp" est introuvable dans photos/originaux/.
   → À faire : vérifiez l'orthographe exacte (majuscules, extension) ou déposez l'image dans photos/originaux/.
```

| Contrôle | Gravité |
|---|---|
| JSON mal écrit (virgule, guillemet oubliés), champ obligatoire manquant | ❌ |
| Image citée dans un JSON introuvable | ❌ |
| Lien interne cassé (page, image, ancre `#`) | ❌ |
| Image sans texte alternatif (`alt`), page sans titre | ❌ |
| Deux photos, articles, projets ou pages avec le même titre ou le même nom de fichier | ❌ |
| Image déposée dans `photos/originaux/` mais absente de `portfolio.json` | ⚠️ |
| Lien vers un autre site qui ne répond pas (site tiers parfois lent) | ⚠️ |
| `alt` vide, description manquante, PDF des tarifs anormal | ⚠️ / ❌ |

Le PDF des tarifs est aussi relu automatiquement (nombre de pages, accents, polices, débordement) ; un aperçu des pages est disponible dans l'exécution (section *Artifacts*, `apercu-pdf-tarifs`).

## Sitemap et robots.txt

`sitemap.xml` (liste des pages pour Google) et `robots.txt` sont **générés automatiquement** : rien à faire. Les pages `404` et `bientot` en sont exclues (réglage `sitemap: non` dans leur en-tête).

## Comment ça marche (pour information)

| Dossier / fichier | Rôle |
|---|---|
| `portfolio.json`, `articles.json`, `tarifs.json`, `projets.json` | Les contenus à modifier |
| `site.json` | Le menu (une ligne par page), l'adresse du site, le pied de page |
| `src/partials/` | L'en-tête, le menu mobile et le pied de page communs à toutes les pages |
| `photos/originaux/` | Les images déposées (source unique) |
| `src/` | Pages « modèles » : le texte habituel + des emplacements `<!-- @auto:… -->` remplis par le script |
| `scripts/build.mjs` | Génère les pages, les miniatures (JPEG, 1600 px), les versions HD (WebP), `sitemap.xml` et `robots.txt` dans `_site/` |
| `scripts/pdf-tarifs.mjs` | Fabrique le PDF des tarifs avec Chrome et le vérifie |
| `scripts/controler.mjs`, `scripts/resume.mjs` | Contrôles (liens, images, titres…) et résumé affiché dans GitHub Actions |
| `.github/workflows/deploy.yml` | Lance le tout à chaque enregistrement, puis publie sur GitHub Pages |

**Toutes les pages** (accueil, à propos, contact, projets, 404…) sont des fichiers dans `src/` : **pour modifier un texte, éditez la version dans `src/`** (et non un fichier généré dans `_site/`). `bientot.html` et `404.html` sont des pages entières à part, sans en-tête ni pied de page communs.

Les pages publiques gardent les mêmes adresses (`/photos/portfolio.html`, `/textes/ecriture.html`, `/prestations/tarifs.html`…). `CNAME` est conservé, et `404.html` redirige les anciennes URLs racine vers les nouveaux dossiers. Les CV PDF de `documents/` sont copiés tels quels.

### Styles : où modifier quoi

Tout le style est dans **un seul fichier** : `assets/css/style.css` (jamais dans `_site/`).

| Je veux changer… | Classe(s) à chercher dans `style.css` |
|---|---|
| La mise en page d'une page de liens : **Liens utiles**, **Projets**, page d'un projet (ex. Alpes) | `.page-liste` (page), `.liste-liens` (colonne), `.lien-carte` (un lien : titre + phrase), `.liste-retour` (lien « Retour ») |
| Le titre de la page (grand « H1 ») | `.section-page-heading` |
| La liste des articles (Textes) et les lignes de tarifs | `.service-item`, `.service-nom`, `.service-desc`, `.writing-item` |
| Le menu et le pied de page | `.site-header`, `.site-footer` |
| Les couleurs, polices et le mode nuit | variables en haut du fichier (`:root`) et blocs `[data-theme="dark"]` |

Pour créer une nouvelle page « liste de liens » (comme *Liens utiles*), copiez `src/core/liens.html` : `<main class="page-wrapper page-liste">` puis `<div class="liste-liens">` contenant des `<a class="texte-item lien-carte">` avec un `<span class="texte-titre">` et un `<span class="texte-intro">`. Aucun CSS à ajouter. Les blocs placés en fin de fichier (« refonte éditoriale », « harmonisation ») l'emportent sur ceux du début : modifiez de préférence la règle la plus basse qui concerne l'élément.

### Lancer le site en local (facultatif)

Nécessite [Node.js](https://nodejs.org) 20 ou plus :

```
npm ci
npm run build        # construit le site, génère le PDF (nécessite Chrome ou Edge) et contrôle les liens
```

Le site complet est alors dans `_site/`.

### Réglage GitHub Pages (une seule fois)

Dans **Settings → Pages → Build and deployment → Source**, choisir **GitHub Actions** (au lieu de « Deploy from a branch »).

