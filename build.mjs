// Egyetlen, önállóan megnyitható feladatnaplo.html összeállítása a src/ forrásból.
//   npm run build          – egyszeri build
//   npm run build -- --watch – újraépít, ha a src/ változik
import { build } from 'esbuild';
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const OUT = join(root, 'feladatnaplo.html');

async function run() {
  const js = (await build({
    entryPoints: [join(root, 'src/app.js')],
    bundle: true, write: false, format: 'iife', target: 'es2022',
    banner: { js: "'use strict';" },
    define: { __VERSION__: JSON.stringify(pkg.version) },
    legalComments: 'none', logLevel: 'warning',
  })).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const tpl = readFileSync(join(root, 'src/index.template.html'), 'utf8');
  const html = tpl
    .replace('@@STYLE@@', () => '<style>\n' + css.trimEnd() + '\n</style>')
    .replace('@@SCRIPT@@', () => '<script>\n' + js.trimEnd() + '\n</script>');
  writeFileSync(OUT, html);
  console.log(`feladatnaplo.html kész (v${pkg.version}, ${(html.length / 1024).toFixed(0)} KB)`);
}

await run();
if (process.argv.includes('--watch')) {
  let t = 0;
  watch(join(root, 'src'), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => run().catch(e => console.error(e.message)), 80); });
  console.log('Figyelem a src/ mappát… (Ctrl+C a kilépéshez)');
}
