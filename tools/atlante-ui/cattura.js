/* Atlante UI — CATTURA delle superfici vere
 *
 *   node tools/atlante-ui/cattura.js   →   tools/atlante-ui/superfici-app.json
 *
 * Apre `public/dev/atlante-cattura.html` in una finestra Electron nascosta: là
 * dentro i moduli VERI dell'app (mappai-landing-teach.js, mappai-cabina.js)
 * costruiscono i loro schemi con dati finti al posto del disco, e li si legge
 * dai due hook che i moduli espongono.
 *
 * Perché non leggere gli schemi dal sorgente: nascono da dati e da stato interno
 * del modulo — l'unico modo di averli veri è farli costruire a chi li costruisce.
 * Perché Electron e non un DOM finto: è lo stesso motore in cui gira l'app, ed è
 * già una dipendenza del progetto (niente jsdom da aggiungere).
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGINA = path.join(ROOT, 'public/dev/atlante-cattura.html');
const USCITA = path.join(__dirname, 'superfici-app.json');
const MAIN = path.join(__dirname, '.cattura-main.js');

fs.writeFileSync(MAIN, `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.disableHardwareAcceleration();
app.on('ready', async () => {
  const w = new BrowserWindow({ show: false, width: 1440, height: 900,
    webPreferences: { contextIsolation: true, offscreen: true } });
  await w.loadFile(${JSON.stringify(PAGINA)});
  let dati = null;
  for (let i = 0; i < 40 && !dati; i++) {                 // la cattura è asincrona
    await new Promise(r => setTimeout(r, 250));
    dati = await w.webContents.executeJavaScript('window.__CATTURATE || null').catch(() => null);
  }
  const log = await w.webContents.executeJavaScript("document.getElementById('log').innerText").catch(() => '');
  fs.writeFileSync(${JSON.stringify(USCITA)}, JSON.stringify(dati || [], null, 1));
  process.stdout.write(log + '\\n');
  app.exit(dati && dati.length ? 0 : 1);
});
`, 'utf8');

const el = require('electron');
const p = spawn(el, [MAIN], { stdio: 'inherit', env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
p.on('exit', code => {
    try { fs.unlinkSync(MAIN); } catch (e) { }
    if (code !== 0) { console.error('\ncattura fallita.'); process.exit(code || 1); }
    const n = JSON.parse(fs.readFileSync(USCITA, 'utf8')).length;
    console.log('\n' + n + ' superfici scritte in ' + path.relative(ROOT, USCITA));
    console.log('ora: node tools/atlante-ui/build.js');
});
