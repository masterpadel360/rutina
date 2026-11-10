// Arma demo/rutina-demo.html: un solo archivo con todo adentro (sin service worker ni scripts externos)
// y datos de ejemplo. Uso: node tools/build-demo.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(root, p), 'utf8');

const css = leer('css/app.css');
const js = ['js/logic.js', 'js/agregar.js', 'js/calendario.js', 'js/store.js', 'js/main.js']
  .map((p) => `// ---- ${p} ----\n` + leer(p)
    .replace(/^import[\s\S]*?from\s+'[^']+';[ \t]*\r?\n/gm, '')
    .replace(/^export\s+/gm, ''))
  .join('\n');
const nombre = (leer('js/store.js').match(/name:\s*'([^']+)'/) || [])[1] || 'Rutina';
const icono = 'data:image/svg+xml,' + encodeURIComponent(leer('icons/icono.svg').trim());

const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${nombre}</title>
<meta name="description" content="Demo de ${nombre}: hábitos, agenda del día y rachas con perdón">
<link rel="icon" href="${icono}">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
window.RUTINA_DEMO = true;
(function () {
'use strict';
${js}
})();
</script>
</body>
</html>
`;
mkdirSync(join(root, 'demo'), { recursive: true });
writeFileSync(join(root, 'demo', 'rutina-demo.html'), html);
console.log('demo lista:', (html.length / 1024).toFixed(1), 'KB');
