/* tools/guida-docenti/telefono.js — il TELEFONO dell'allievo per l'appendice QR (23/8/26).
 *
 * Il telefono è un Chrome HEADLESS (quello installato sul Mac) con la sua porta CDP: una
 * seconda finestra di Electron (window.open) non produce fotogrammi quando è coperta e la
 * cattura si blocca. Headless non è mai coperto. Si emula 375×812 @2× e si pilota la pagina
 * dello studente: login con emoji+numero → argomenti → lettura e scelta → risposte → consegna.
 *
 *   node tools/guida-docenti/telefono.js corsa      # UNA connessione: login → scrive lab/tel-entrato → aspetta lab/tel-vai
 *                                                 #   (lo scrive la campagna dopo «Avvia domande») → risposte → consegna → lab/tel-fine
 *   (una seconda connessione CDP alla stessa pagina headless resta appesa: per questo un processo solo)
 * L'URL sta in lab/sessione.json (lo scrive campagna.js). Le foto escono in IMG come 13-tel-NN-*.png.
 */
process.env.MAPPAI_PORTA = process.env.TEL_PORTA || '9444';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const lab = require('./lab.js');

const LAB = path.join(process.env.HOME, 'Claude', 'MappAI - guida docenti', 'lab');
const SESSIONE = path.join(LAB, 'sessione.json');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILO = path.join(LAB, 'chrome-telefono');
const EMOJI = '🐼', NUMERO = '08';                    // il primo allievo della 4R copiata (emojiKey panda, num 08)
const modo = process.argv[2] || 'entra';
const T = { formato: 'png' };

async function foto(nome) { await lab.pausa(400); await lab.scatta(nome, Object.assign({ clip: { x: 0, y: 0, width: 375, height: 812 } }, T)); }
async function testoVisibile(t) { return lab.val(`(()=>{const els=[...document.querySelectorAll('button,a,label,div,span,h1,h2,h3,p')].filter(e=>e.getBoundingClientRect().width>0&&(e.textContent||'').includes(${JSON.stringify(t)})); return els.length>0;})()`); }
async function cliccaTesto(t, tag) { const sel = await lab.perTesto(t, 'body', tag || 'button, a, label, [role=button]'); await lab.clicca(sel); await lab.pausa(600); }
const ok = (m) => console.log('  ✅ ' + m), ko = (m) => console.log('  ❌ ' + m);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function chromePronto() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:' + process.env.MAPPAI_PORTA + '/json/list'); if (r.ok) return true; } catch (e) { /* non ancora */ } await pausa(250); }
  return false;
}

(async () => {
  const info = JSON.parse(fs.readFileSync(SESSIONE, 'utf8'));
  const SEM = { entrato: path.join(LAB, 'tel-entrato'), vai: path.join(LAB, 'tel-vai'), fine: path.join(LAB, 'tel-fine') };
  if (modo === 'corsa') { for (const f of Object.values(SEM)) fs.rmSync(f, { force: true }); }
  if (modo === 'entra' || modo === 'corsa') {
    fs.rmSync(PROFILO, { recursive: true, force: true });
    const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + process.env.MAPPAI_PORTA, '--user-data-dir=' + PROFILO, '--no-first-run', '--no-default-browser-check', '--window-size=375,812', '--hide-scrollbars', 'about:blank'], { detached: true, stdio: 'ignore' });
    ch.unref();
    if (!(await chromePronto())) throw new Error('Chrome headless non risponde su :' + process.env.MAPPAI_PORTA);
    fs.writeFileSync(SESSIONE, JSON.stringify(Object.assign(info, { chromePid: ch.pid }), null, 2));
  }
  if (modo === 'report') {
    const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + process.env.MAPPAI_PORTA, '--user-data-dir=' + PROFILO + '-report', '--no-first-run', '--window-size=1100,900', '--hide-scrollbars', 'about:blank'], { detached: true, stdio: 'ignore' }); ch.unref();
    if (!(await chromePronto())) throw new Error('Chrome headless non risponde');
    await lab.collega(/.*/);
    await lab.invia('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 2, mobile: false });
    await lab.invia('Page.navigate', { url: 'file://' + path.join(info.dir, 'report-scelta.html') }); await lab.pausa(2500);
    await lab.scatta('13-qr-report', { formato: 'jpeg', qualita: 88 });
    const h = await lab.val('document.documentElement.scrollHeight'); if (h > 900) { await lab.invia('Emulation.setDeviceMetricsOverride', { width: 1100, height: Math.min(h, 2600), deviceScaleFactor: 2, mobile: false }); await lab.pausa(600); await lab.scatta('13-qr-report-intero', { formato: 'jpeg', qualita: 85 }); }
    lab.chiudi(); try { process.kill(ch.pid); } catch (e) { /* */ } return;
  }
  await lab.collega(/.*/);
  await lab.invia('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await lab.invia('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (modo === 'entra' || modo === 'corsa') {
    await lab.invia('Page.navigate', { url: info.url }); await lab.pausa(2500);
    await lab.finoA('document.readyState==="complete"', 10000); await lab.pausa(800);
    console.log('  pagina:', await lab.val('location.href'), '| titolo:', await lab.val('document.title'));
    await foto('13-tel-01-login');
    const e = await lab.val(`(()=>{const b=[...document.querySelectorAll('#login button, #login [role=button], #login label, #login div')].find(x=>x.textContent.trim()===${JSON.stringify(EMOJI)}); if(!b) return null; b.click(); return 1;})()`);
    if (!e) ko('emoji ' + EMOJI + ' non trovata nella griglia'); else ok('emoji scelta');
    const inp = await lab.val(`(()=>{const i=[...document.querySelectorAll('#login input')].find(x=>x.type!=='hidden'&&x.getBoundingClientRect().width>0); if(!i) return null; i.focus(); return 1;})()`);
    if (inp) { await lab.scrivi(NUMERO); } else ko('campo «Il tuo numero» non trovato');
    await lab.pausa(300); await foto('13-tel-02-login-compilato');
    await cliccaTesto('Entra', 'button'); await lab.pausa(2500);
    const err = await lab.val('(()=>{const e=document.querySelector("#login-err"); return e&&e.getBoundingClientRect().height>0?e.textContent.trim():"";})()');
    if (err) ko('login: ' + err); else ok('login riuscito (fase attesa)');
    await foto('13-tel-03-entrato');
    if (modo === 'corsa') { fs.writeFileSync(SEM.entrato, '1'); console.log('  attendo «Avvia domande» (tel-vai)…'); for (let i = 0; i < 600 && !fs.existsSync(SEM.vai); i++) await pausa(500); }
  }
  if (modo === 'rispondi' || modo === 'corsa') {
    await lab.pausa(1500);
    await lab.val('window.confirm = () => true; window.alert = () => {}; 1');   // le conferme native bloccherebbero la pagina
    await foto('13-tel-04-argomenti');
    const aree = await lab.val(`(()=>{const c=[...document.querySelectorAll('input[type=checkbox], [role=checkbox], button.sc-area, .sc-area')].filter(x=>x.getBoundingClientRect().width>0); c.slice(0,2).forEach(x=>x.click()); return c.length;})()`);
    console.log('  aree cliccabili:', aree); await lab.pausa(500); await foto('13-tel-05-argomenti-scelti');
    try { await cliccaTesto('Vai alle domande', 'button'); } catch (e) { ko('«Vai alle domande»: ' + e.message); }
    await lab.pausa(800);
    await lab.val(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/avanti lo stesso|Vai avanti|Sì|Continua/i.test(x.textContent)&&x.getBoundingClientRect().width>0); if(b) b.click(); return !!b;})()`);
    await lab.pausa(800); await foto('13-tel-06-leggi-e-scegli');
    const prese = await lab.val(`(()=>{let n=0;
      const vis=e=>e.getBoundingClientRect().width>0;
      const chips=[...document.querySelectorAll('button, [role=button], label')].filter(b=>/mi viene in mente subito|so da dove partire|mi dice qualcosa/i.test(b.textContent)&&vis(b));
      chips.slice(0,3).forEach((c)=>{c.click();});
      const prendi=[...document.querySelectorAll('button')].filter(b=>/Rispondo a questa/.test(b.textContent)&&vis(b));
      prendi.slice(0,3).forEach(b=>{b.click(); n++;});
      if(!n){ const caselle=[...document.querySelectorAll('input[type=checkbox], [role=checkbox], .sc-check, .sc-q input')].filter(vis); caselle.slice(0,3).forEach(c=>{c.click(); n++;}); }
      if(!n){ const schede=[...document.querySelectorAll('.sc-q, .sc-card, li, article')].filter(e=>vis(e)&&e.querySelector('input,button')); schede.slice(0,3).forEach(e=>{(e.querySelector('input,button')||e).click(); n++;}); }
      return n;})()`);
    console.log('  domande prese:', prese); await lab.pausa(700);
    await lab.val('window.scrollTo(0,0)'); await foto('13-tel-07-scelte');
    try { await cliccaTesto('Comincia a rispondere', 'button'); } catch (e) { ko('«Comincia a rispondere»: ' + e.message); }
    await lab.pausa(800);
    await lab.val(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/avanti lo stesso|Vai avanti/i.test(x.textContent)&&x.getBoundingClientRect().width>0); if(b) b.click(); return !!b;})()`);
    await lab.pausa(800); await foto('13-tel-08-rispondi');
    for (let i = 0; i < 3; i++) {
      await lab.val(`(()=>{const o=[...document.querySelectorAll('.sc-opt, button.sc-opt')].filter(x=>x.getBoundingClientRect().width>0); if(o.length){o[0].click(); return 'mc';} const t=[...document.querySelectorAll('textarea')].find(x=>x.getBoundingClientRect().width>0); if(t){t.focus(); t.value='La corrente è il flusso di cariche in un circuito chiuso.'; t.dispatchEvent(new Event('input',{bubbles:true})); return 'open';} return 'niente';})()`);
      await lab.pausa(500);
      if (i === 0) await foto('13-tel-09-risposta');
      const avanti = await lab.val(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Domanda successiva/.test(x.textContent)&&x.getBoundingClientRect().width>0&&!x.disabled); if(b){b.click(); return 1;} return 0;})()`);
      if (!avanti) break; await lab.pausa(600);
    }
    await foto('13-tel-10-ultima');
    try { await cliccaTesto('Consegna', 'button'); } catch (e) { ko('«Consegna»: ' + e.message); }
    await lab.pausa(800);
    await lab.val(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Consegni lo stesso|Consegna/i.test(x.textContent)&&x.getBoundingClientRect().width>0); if(b) b.click(); return !!b;})()`);
    await lab.pausa(1500); await foto('13-tel-11-consegnato');
    const fine = await testoVisibile('Consegnato');
    if (fine) ok('consegna riuscita: schermata «Consegnato»'); else ko('schermata «Consegnato» non vista');
    fs.writeFileSync(SESSIONE, JSON.stringify(Object.assign(info, { consegnato: fine }), null, 2));
    try { process.kill(JSON.parse(fs.readFileSync(SESSIONE, 'utf8')).chromePid); } catch (e) { /* già chiuso */ }
    fs.writeFileSync(SEM.fine, '1');
  }
  lab.chiudi();
})().catch((e) => { console.error('KO telefono:', e.message); try { const i = JSON.parse(fs.readFileSync(SESSIONE, 'utf8')); if (i.chromePid) process.kill(i.chromePid); } catch (_) { /* niente */ } process.exit(0); });
