// Résumé des contrôles pour GitHub Actions : tableau dans $GITHUB_STEP_SUMMARY + annotations sur les fichiers.
// Usage : node scripts/resume.mjs (après le build et les contrôles, même en cas d'échec).
import fs from 'node:fs';
import { chargerRapportExistant, formaterLieu } from './lib/rapport.mjs';

const r = chargerRapportExistant();
const v = r.verifie || {};
const echapperCellule = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const nettoyer = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

for (const [niveau, liste] of [['error', r.erreurs], ['warning', r.avertissements]]) {
  for (const e of liste) {
    const fichier = e.fichier ? String(e.fichier).replace(/ \(page générée\)$/, '') : '';
    const attrs = fichier ? `file=${fichier}${e.ligne ? `,line=${e.ligne}` : ''},` : '';
    console.log(`::${niveau} ${attrs}title=${niveau === 'error' ? 'À corriger' : 'À vérifier'}::${nettoyer(e.message + (e.action ? ` À faire : ${e.action}` : ''))}`);
  }
}

const lignes = [];
lignes.push(r.erreurs.length ? '## ❌ Le site ne sera pas publié : il y a des erreurs à corriger' : '## ✅ Contrôles réussis : le site peut être publié');
lignes.push('');
lignes.push('| Contrôle | Résultat |', '|---|---|');
lignes.push(`| Erreurs bloquantes | **${r.erreurs.length}** |`);
lignes.push(`| Avertissements (non bloquants) | **${r.avertissements.length}** |`);
if (v.pages !== undefined) {
  lignes.push(`| Pages vérifiées | ${v.pages} |`, `| Liens internes vérifiés | ${v.liensInternes} |`, `| Images vérifiées | ${v.images} |`);
  lignes.push(`| Liens externes vérifiés | ${v.externesVerifies ? v.liensExternes : 'non vérifiés'} |`);
}
if (v.pdfPages !== undefined) lignes.push(`| PDF des tarifs | ${v.pdfPages} page(s), ${Math.round(v.pdfOctets / 1024)} Ko${v.pdfTexteVerifie ? ', texte et accents relus' : ''} |`);
lignes.push('');

const tableau = (titre, liste, icone) => {
  if (!liste.length) return;
  lignes.push(`### ${icone} ${titre}`, '', '| Où | Problème | À faire |', '|---|---|---|');
  for (const e of liste) lignes.push(`| ${echapperCellule(formaterLieu(e) || '—')} | ${echapperCellule(e.message)} | ${echapperCellule(e.action || '—')} |`);
  lignes.push('');
};
tableau('Erreurs à corriger (elles bloquent la publication)', r.erreurs, '❌');
tableau('Avertissements (la publication continue)', r.avertissements, '⚠️');
if (!r.erreurs.length && !r.avertissements.length) lignes.push('Aucun problème détecté. 🎉', '');
if (r.erreurs.length) lignes.push('> Après correction, enregistrez (commit) : les contrôles se relanceront automatiquement.', '');

const texte = lignes.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texte + '\n');
else console.log('\n' + texte);
