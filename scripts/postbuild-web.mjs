// Ajusta o dist/ para funcionar em qualquer subpasta (GitHub Pages, Netlify, artifact):
// caminhos relativos, idioma e fonte de títulos.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');
html = html
  .replace('<html lang="en">', '<html lang="pt-BR">')
  .replace('src="/_expo/', 'src="./_expo/')
  .replace('<link rel="icon" href="/favicon.ico"/>', '')
  .replace(
    '</head>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&display=swap"></head>',
  );
writeFileSync(file, html);
console.log('dist/index.html ajustado');
