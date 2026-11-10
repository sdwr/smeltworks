/* Packs the game into one self-contained HTML file: node build-single.cjs  →  dist/smeltworks.html
   (handy for sharing; the game itself needs no build). Pass --fragment to leave out the document shell. */
const fs = require('node:fs'), path = require('node:path');
const dir = __dirname, read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src='));
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const fragment = process.argv.includes('--fragment');
const out = (fragment ? '' : '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n') +
  '<title>Smeltworks</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n' + read('css/game.css') + '</style>\n' + (fragment ? '' : '</head>\n<body>\n') +
  body.trim() + '\n' + scripts.map(s => '<script>\n' + read(s).replace(/<\/script/g, '<\\/script') + '</script>').join('\n') + (fragment ? '\n' : '\n</body>\n</html>\n');
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
const file = path.join(dir, 'dist', fragment ? 'smeltworks.fragment.html' : 'smeltworks.html');
fs.writeFileSync(file, out);
console.log('wrote', path.relative(process.cwd(), file), Math.round(out.length / 1024) + ' KB');
