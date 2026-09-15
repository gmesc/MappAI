#!/usr/bin/env node
/* ══ BANCO DEI TOKEN — genera public/dev/banco-token.html ═══════════════════
   Prende il template (banco-template.html) e ci copia dentro il blocco
   `@layer components` di index.html, così i pezzi Tailwind (.teach-qs-btn,
   .pm-btn-*, .btn_header_setting) si disegnano col CSS VERO e non con una
   trascrizione che invecchia. Gli altri quattro fogli il banco li linka.

       node tools/stile/banco.js

   Va rilanciato quando cambia il blocco @layer di index.html (il resto è
   linkato, quindi si aggiorna da sé). Si apre servendo public/ su 8145:
   http://localhost:8145/dev/banco-token.html */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const m = html.match(/<style type="text\/tailwindcss">([\s\S]*?)<\/style>/);
if (!m) { console.error('blocco <style type="text/tailwindcss"> non trovato in index.html'); process.exit(1); }

const tpl = fs.readFileSync(path.join(__dirname, 'banco-template.html'), 'utf8');
const out = path.join(ROOT, 'public/dev/banco-token.html');
/* marcatore di cache sui quattro fogli: senza, il browser serve il CSS di ieri e il banco
   misura valori che nel repo non esistono più (GUIDA-ARCHITETTO §8.4 — ci sono cascato). */
const v = ['style', 'mappai-modal-tokens', 'mappai-stile-manifesto', 'mappai-console-manifesto']
    .map(n => fs.statSync(path.join(ROOT, 'public/css/' + n + '.css')).mtimeMs).join('-');
const marcatore = require('crypto').createHash('md5').update(v).digest('hex').slice(0, 8);
fs.writeFileSync(out, tpl.replace('{{LAYER}}', m[1]).split('{{V}}').join(marcatore));
console.log('scritto ' + path.relative(ROOT, out) + ' (' + (m[1].split('\n').length) + ' righe di @layer copiate, cache ' + marcatore + ')');
