// Gera frag.html: empacota src/main.js (three.js + PeerJS + qrcode + jogo) e injeta no template.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const out = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
let js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const head = '/* three.js r169 (MIT) · PeerJS 1.5.4 (MIT) · qrcode-generator (MIT) · codigo-fonte legivel em src/ */\n';
const html = readFileSync('src/template.html', 'utf8').replace('/*__BUNDLE__*/', () => head + js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/frag.html', html);
console.log('dist/frag.html', (html.length / 1024).toFixed(0) + ' KB');
