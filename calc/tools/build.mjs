// Baut den Rechner als je eine HTML-Datei:
//   dist/uav-budget.html  – Einzelseite ohne Team-Speicher (für claude.ai-Artefakt oder lokal im Browser)
//   public/index.html     – Seite für den Cloudflare-Worker mit Team-Varianten
// Aufruf: node calc/tools/build.mjs   (keine Abhängigkeiten außer Node.js)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'calc', 'src'), DATA = join(ROOT, 'calc', 'data');
const read = (...p) => readFileSync(join(...p), 'utf8');
const jsJson = o => JSON.stringify(o).replace(/<\//g, '<\\/');

// Reihenfolge der Quelldateien (gemeinsam mit calc/tests/load.cjs)
const { model: MODEL, ui: UI } = JSON.parse(read(ROOT, 'calc', 'tools', 'modules.json'));

function build(team) {
  let css = read(SRC, 'ui.css'), html = read(SRC, 'ui.html');
  const model = MODEL.map(f => read(SRC, f)).join('\n');
  let ui = UI.map(f => read(SRC, f)).join('\n');
  if (team) {
    css += '\n' + read(SRC, 'team.css');
    html = html.replace('<!--TEAM-NAV-->', '<a href="#team" data-v="team">Team</a>').replace('<!--TEAM-VIEW-->', read(SRC, 'team.html'));
    if (!ui.includes('init();\n')) throw new Error('init(); fehlt in den Oberflächen-Dateien');
    ui = ui.replace('init();\n', '') + '\n' + read(SRC, 'team.js') + '\ninit();\nteamInit();\n';
  }
  const head = '<title>Waldbrand-UAV Energiebudget</title>\n'
    + '<meta name="claude:viewport-fit-sides" content="cover">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">\n'
    + `<style>\n${css}\n</style>\n`;
  const data = `<script type="application/json" id="d-airfoils">${jsJson(JSON.parse(read(DATA, 'airfoils.json')))}</script>\n`
    + `<script type="application/json" id="d-weather">${jsJson(JSON.parse(read(DATA, 'weather.json')))}</script>\n`
    + `<script type="application/json" id="d-info">${jsJson(JSON.parse(read(DATA, 'comp_info.json')))}</script>\n`;
  const script = `<script>\n'use strict';\n(function () {\n${model}\n${ui}\n})();\n</script>\n`;
  if (!team) return head + html + '\n' + data + script;
  return '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '').replace('<style>\n', '<style>\nhtml { -webkit-text-size-adjust: 100%; }\n')
    + '</head>\n<body>\n' + html + '\n' + data + script + '</body>\n</html>\n';
}

for (const d of ['dist', 'public']) mkdirSync(join(ROOT, d), { recursive: true });
const a = build(false); writeFileSync(join(ROOT, 'dist', 'uav-budget.html'), a);
console.log(`dist/uav-budget.html   ${(a.length / 1024).toFixed(0)} KB`);
if (existsSync(join(SRC, 'team.js'))) {
  const w = build(true); writeFileSync(join(ROOT, 'public', 'index.html'), w);
  console.log(`public/index.html      ${(w.length / 1024).toFixed(0)} KB`);
}
