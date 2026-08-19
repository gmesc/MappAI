/* I due percorsi falliscono allo stesso modo su un glifo che il font non ha?
   A) jsPDF (grafi, dossier, foglio nodi)  B) Chromium printToPDF (quiz, sintesi) */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const TESTO = 'ohm 12 Ω · spunta ✓ · freccia → · fine';
app.on('ready', async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  await w.loadFile('/Users/giacomomeschini/Claude/MappAI re/public/index.html');
  await new Promise(r => setTimeout(r, 2500));
  for (const font of ['space-mono', 'testme-sans', 'atkinson']) {
    // A) jsPDF
    const a = await w.webContents.executeJavaScript(`
      (async () => {
        window.MappAIFont.imposta(${JSON.stringify(font)});
        const { jsPDF } = window.jspdf;
        const d = new jsPDF({ unit:'mm', format:'a4' });
        const n = await window.MappAIFont.registraIn(d);
        d.setFont(n || 'helvetica','normal'); d.setFontSize(14);
        d.text(${JSON.stringify(TESTO)}, 15, 30);
        const u = new Uint8Array(d.output('arraybuffer'));
        let s=''; for (let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
        return btoa(s);
      })()`);
    fs.writeFileSync('/tmp/g-jspdf-' + font + '.pdf', Buffer.from(a, 'base64'));
    // B) Chromium
    const html = await w.webContents.executeJavaScript(`
      (async () => { await window.MappAIFont.precaricaIncorporabile();
        const F = window.MappAIFont.cssDocumento('');
        return '<!doctype html><meta charset="utf-8"><style>' + window.MappAIFont.styleDocumento('') +
          'body{font-family:var(--doc-font);font-size:14pt}</style><body>' + ${JSON.stringify(TESTO)}; })()`);
    const p = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await p.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await p.webContents.executeJavaScript('document.fonts.ready.then(()=>1)');
    fs.writeFileSync('/tmp/g-chromium-' + font + '.pdf', await p.webContents.printToPDF({ pageSize:'A4' }));
    p.destroy();
  }
  console.log('fatto');
  app.quit();
});
