#!/usr/bin/env node
/* PATTERNA build — inlines the four sources into one standalone HTML file.
   Usage:  node build.js            → writes patterna.html
           node build.js out.html   → writes to a chosen path                */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const shell  = read('shell.html');
const engine = read('engine.js').replace(
  "if (typeof module !== 'undefined') module.exports = KYP;", ''
);
const app = read('app.js');
const ui  = read('ui.js');

for (const [token, name] of [['/*__ENGINE__*/','engine'],['/*__APP__*/','app'],['/*__UI__*/','ui']]) {
  if (!shell.includes(token)) {
    console.error(`shell.html is missing the ${name} placeholder ${token}`);
    process.exit(1);
  }
}

const out = shell
  .replace('/*__ENGINE__*/', engine)
  .replace('/*__APP__*/', app)
  .replace('/*__UI__*/', ui);

const target = process.argv[2] || 'patterna.html';
fs.writeFileSync(path.join(dir, target), out);

const kb = n => Math.round(n / 1024) + ' KB';
console.log(`built ${target} — ${kb(out.length)}`);
console.log(`  engine ${kb(engine.length)} · app ${kb(app.length)} · ui ${kb(ui.length)} · shell+assets ${kb(shell.length)}`);
console.log('\nnext: node engine.test.js && node app.test.js');
