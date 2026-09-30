/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Génère dist/sw.js avec la liste de tous les fichiers à mettre en cache pour le hors-ligne. */
function serviceWorker(): Plugin {
  return {
    name: 'blackjack-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles('public').map((f) => relative('public', f).split('\\').join('/'));
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles])].filter((f) => !f.endsWith('.map') && !f.endsWith('.woff') && f !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const f of files) {
        const item = bundle[f];
        if (item) hash.update(f + (item.type === 'chunk' ? item.code : String(item.source)));
        else if (publicFiles.includes(f)) hash.update(f + readFileSync(join('public', f)).toString('base64'));
        else hash.update(f);
      }
      const source = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__ASSETS__', JSON.stringify(['./', ...files.map((f) => './' + f)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le site marche à la racine d'un domaine comme dans un sous-dossier (GitHub Pages).
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
