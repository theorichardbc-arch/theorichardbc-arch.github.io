// Lecture d'un fichier JSON avec numéros de ligne : permet de dire "ligne 12" dans les messages d'erreur.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, erreur } from './rapport.mjs';

const lignesParFichier = new Map();

// Parcourt le JSON déjà valide et note la ligne de chaque valeur (chemin "0.titre", "sections.2.lignes.1"…).
function cartographier(texte) {
  const lignes = new Map();
  let i = 0;
  let ligne = 1;
  const avancer = () => { if (texte[i] === '\n') ligne += 1; i += 1; };
  const blancs = () => { while (i < texte.length && /\s/.test(texte[i])) avancer(); };
  function chaine() {
    avancer();
    let s = '';
    while (texte[i] !== '"') {
      if (texte[i] === '\\') { s += texte[i]; avancer(); }
      s += texte[i];
      avancer();
    }
    avancer();
    return JSON.parse(`"${s}"`);
  }
  function valeur(chemin) {
    blancs();
    lignes.set(chemin.join('.'), ligne);
    if (texte[i] === '{') {
      avancer(); blancs();
      while (texte[i] !== '}') {
        blancs();
        const cle = chaine();
        blancs(); avancer(); // :
        valeur([...chemin, cle]);
        blancs();
        if (texte[i] === ',') avancer();
        blancs();
      }
      avancer();
    } else if (texte[i] === '[') {
      avancer(); blancs();
      let n = 0;
      while (texte[i] !== ']') {
        valeur([...chemin, String(n)]);
        n += 1;
        blancs();
        if (texte[i] === ',') avancer();
        blancs();
      }
      avancer();
    } else if (texte[i] === '"') {
      chaine();
    } else {
      while (i < texte.length && !/[,\]}\s]/.test(texte[i])) avancer();
    }
  }
  valeur([]);
  return lignes;
}

export function lireJson(fichier) {
  const chemin = path.join(RACINE, fichier);
  if (!fs.existsSync(chemin)) {
    erreur('fichier introuvable.', { fichier, action: `recréez le fichier ${fichier} à la racine du dépôt (ou restaurez-le depuis l'historique GitHub).` });
    return null;
  }
  const texte = fs.readFileSync(chemin, 'utf8').replace(/^\uFEFF/, '');
  try {
    const donnees = JSON.parse(texte);
    lignesParFichier.set(fichier, cartographier(texte));
    return donnees;
  } catch (e) {
    let ligne;
    const l = e.message.match(/line (\d+)/);
    const p = e.message.match(/position (\d+)/);
    if (l) ligne = Number(l[1]);
    else if (p) ligne = texte.slice(0, Number(p[1])).split('\n').length;
    erreur(`le fichier n'est pas un JSON valide (${e.message}).`, {
      fichier,
      ligne,
      action: 'vérifiez à cet endroit (ou juste avant) les guillemets "...", les deux-points, et surtout la virgule entre deux blocs { } (pas de virgule après le dernier).',
    });
    return null;
  }
}

// Ligne du chemin demandé, ou du plus proche parent connu.
export function ligneDe(fichier, ...chemin) {
  const lignes = lignesParFichier.get(fichier);
  if (!lignes) return undefined;
  const c = chemin.map(String);
  for (;;) {
    const l = lignes.get(c.join('.'));
    if (l) return l;
    if (!c.length) return undefined;
    c.pop();
  }
}
