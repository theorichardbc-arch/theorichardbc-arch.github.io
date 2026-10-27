# Site de Théo Richard — theo-richard.fr

Le site se met à jour **tout seul** : il suffit de déposer une image ou de modifier un petit fichier texte (JSON) sur GitHub. Quelques minutes après l'enregistrement, le site est reconstruit et publié automatiquement. Aucun logiciel à installer.

## Les 3 gestes du quotidien

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

> ⚠️ Le PDF `documents/tarifs2026.pdf` n'est **pas** mis à jour automatiquement : remplacez-le à la main si besoin.

## Si quelque chose ne s'affiche pas

Dans GitHub, onglet **Actions**, ouvrez la dernière exécution. Si elle est rouge ❌, le message en français indique la ligne à corriger (fichier introuvable, virgule oubliée, date mal écrite…). Tant qu'elle est rouge, **l'ancien site reste en ligne** : rien n'est cassé. Un avertissement ⚠️ signale par exemple une image déposée mais absente de `portfolio.json`.

## Comment ça marche (pour information)

| Dossier / fichier | Rôle |
|---|---|
| `portfolio.json`, `articles.json`, `tarifs.json` | Les contenus à modifier |
| `photos/originaux/` | Les images déposées (source unique) |
| `src/` | Pages « modèles » : le texte habituel + des emplacements `<!-- @auto:… -->` remplis par le script |
| `scripts/build.mjs` | Génère les pages, les miniatures (JPEG, 1600 px) et les versions HD (WebP) dans `_site/` |
| `scripts/verifier-liens.mjs` | Contrôle qu'aucun lien interne n'est cassé |
| `.github/workflows/deploy.yml` | Lance le tout à chaque enregistrement, puis publie sur GitHub Pages |

Les autres pages (accueil, à propos, contact, projets…) restent de simples fichiers HTML dans leurs dossiers (`core/`, `projets/`, `photos/archives.html`…) et sont copiées telles quelles, avec `assets/css/style.css`, `documents/` et `photos/images/` (images fixes comme `mg-0170.jpg`). **Pour modifier le texte** de `portfolio.html`, `ecriture.html`, `prestations.html`, `tarifs.html`, `ateliers-labo.html` ou `seances-photo.html`, éditez la version dans `src/` (et non un fichier généré).

Les pages publiques gardent les mêmes adresses (`/photos/portfolio.html`, `/textes/ecriture.html`, `/prestations/tarifs.html`…). `CNAME` est conservé, et `404.html` redirige les anciennes URLs racine (ex. `/contact.html`) vers les nouveaux dossiers : à mettre à jour si une page change de dossier.

### Lancer le site en local (facultatif)

Nécessite [Node.js](https://nodejs.org) 20 ou plus :

```
npm ci
npm run build
```

Le site complet est alors dans `_site/`.

### Réglage GitHub Pages (une seule fois)

Dans **Settings → Pages → Build and deployment → Source**, choisir **GitHub Actions** (au lieu de « Deploy from a branch »).
