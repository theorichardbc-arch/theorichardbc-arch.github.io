// Rapport partagé par le build et les contrôles : erreurs (bloquantes) et avertissements.
// Le rapport est écrit dans .controles/rapport.json puis résumé par scripts/resume.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER = path.join(RACINE, '.controles');
const FICHIER = path.join(DOSSIER, 'rapport.json');

export const erreurs = [];
export const avertissements = [];

// info : { fichier, ligne, action } — tous facultatifs.
export const erreur = (message, info = {}) => { erreurs.push({ message, ...info }); };
export const avertir = (message, info = {}) => { avertissements.push({ message, ...info }); };

export function reinitialiserRapport() {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
}

export function chargerRapportExistant() {
  if (!fs.existsSync(FICHIER)) return { erreurs: [], avertissements: [], verifie: {} };
  return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
}

export function sauverRapport(verifie = {}) {
  const existant = chargerRapportExistant();
  fs.mkdirSync(DOSSIER, { recursive: true });
  fs.writeFileSync(FICHIER, JSON.stringify({
    erreurs: [...existant.erreurs, ...erreurs],
    avertissements: [...existant.avertissements, ...avertissements],
    verifie: { ...existant.verifie, ...verifie },
  }, null, 2));
}

export function formaterLieu(e) {
  if (!e.fichier) return '';
  return e.ligne ? `${e.fichier}, ligne ${e.ligne}` : e.fichier;
}

export function afficher() {
  const ligne = (e) => `${formaterLieu(e) ? `${formaterLieu(e)} : ` : ''}${e.message}${e.action ? `\n      → À faire : ${e.action}` : ''}`;
  for (const a of avertissements) console.warn(`⚠️  AVERTISSEMENT — ${ligne(a)}`);
  for (const e of erreurs) console.error(`❌ ERREUR — ${ligne(e)}`);
}
