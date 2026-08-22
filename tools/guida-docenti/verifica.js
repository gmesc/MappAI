/* tools/guida-docenti/verifica.js — la guida si VERIFICA, non si guarda (23/8/26).
 *
 *   node tools/guida-docenti/verifica.js
 * 1. ogni `img/…` citata in index.html esiste su disco, e nessun file in img/ resta orfano;
 * 2. in Chrome headless: nessuna <img> rotta (naturalWidth > 0), l'indice ha una voce per
 *    capitolo, la lightbox si apre e si chiude, la pagina non scorre in orizzontale a 1280 e
 *    a 390 px, nessun errore in console;
 * 3. le frasi della guida contro le etichette: ogni «…» del testo è cercata nei fatti/*.md
 *    (un'etichetta che nessun lettore ha trascritto è da ricontrollare a mano).
 * Esce con 1 se c'è un difetto. */
process.env.MAPPAI_PORTA = '9455';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const lab = require('./lab.js');

const GUIDA = path.join(process.env.HOME, 'Claude', 'MappAI - guida docenti');
const HTML = path.join(GUIDA, 'index.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FATTI = path.join(__dirname, 'fatti');
let difetti = 0;
const ko = (m) => { difetti++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(HTML, 'utf8');
  /* 1. immagini su disco */
  console.log('1. immagini');
  const citate = [...new Set([...html.matchAll(/img\/[^"' )]+/g)].map((m) => m[0]))];
  const suDisco = fs.readdirSync(path.join(GUIDA, 'img')).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_provini'));
  for (const c of citate) if (!fs.existsSync(path.join(GUIDA, c))) ko('manca su disco: ' + c);
  const orfane = suDisco.filter((f) => !citate.includes('img/' + f));
  ok(`${citate.length} citate, ${suDisco.length} su disco, ${orfane.length} non usate${orfane.length ? ': ' + orfane.join(', ') : ''}`);
  const mb = suDisco.reduce((s, f) => s + fs.statSync(path.join(GUIDA, 'img', f)).size, 0) / 1048576;
  ok(`peso delle immagini: ${mb.toFixed(1)} MB`);

  /* 2. resa in Chrome headless */
  console.log('2. resa');
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + process.env.MAPPAI_PORTA, '--user-data-dir=' + path.join(GUIDA, 'lab', 'chrome-verifica'), '--no-first-run', '--window-size=1280,900', '--hide-scrollbars', 'about:blank'], { detached: true, stdio: 'ignore' }); ch.unref();
  let pronto = false; for (let i = 0; i < 40 && !pronto; i++) { try { pronto = (await fetch('http://127.0.0.1:' + process.env.MAPPAI_PORTA + '/json/list')).ok; } catch (e) { await pausa(250); } }
  if (!pronto) { ko('Chrome headless non risponde'); process.exit(1); }
  await lab.collega(/.*/);
  await lab.invia('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await lab.invia('Page.navigate', { url: 'file://' + HTML }); await lab.pausa(2500);
  await lab.finoA('document.readyState==="complete"', 10000);
  // le <img loading="lazy"> non si caricano finché non entrano in vista: si forzano, o l'attesa non finisce mai
  await lab.val('[...document.images].forEach(i=>{i.loading="eager"; const s=i.getAttribute("src"); i.src=s;}); 1');
  await lab.val('Promise.race([Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=r;i.onerror=r;}))), new Promise(r=>setTimeout(r,60000))])'); await lab.pausa(500);
  // la <img> della lightbox nasce con src vuoto: non è rotta, è in attesa
  const rotte = await lab.val('[...document.images].filter(i=>i.getAttribute("src")&&!i.naturalWidth).map(i=>i.getAttribute("src"))');
  if (rotte.length) ko('immagini rotte: ' + rotte.join(', ')); else ok(`${await lab.val('document.images.length')} immagini rese`);
  const cap = await lab.val('document.querySelectorAll("section.cap").length'), toc = await lab.val('document.querySelectorAll("#toc > li").length');
  if (cap !== toc) ko(`capitoli ${cap} ≠ voci dell'indice ${toc}`); else ok(`indice: ${toc} voci per ${cap} capitoli`);
  const sx = await lab.val('document.documentElement.scrollWidth > innerWidth + 1');
  if (sx) ko('la pagina scorre in orizzontale a 1280'); else ok('niente scorrimento orizzontale a 1280');
  await lab.val('document.querySelector("figure img").click(); 1'); await lab.pausa(300);
  const aperta = await lab.val('document.getElementById("lb").classList.contains("aperto") && !!document.querySelector("#lb img").getAttribute("src")');
  if (!aperta) ko('la lightbox non si apre'); else ok('lightbox aperta');
  await lab.tasto('Escape'); await lab.pausa(300);
  if (await lab.val('document.getElementById("lb").classList.contains("aperto")')) ko('la lightbox non si chiude con ESC'); else ok('lightbox chiusa con ESC');
  const contrasti = await lab.val(`(()=>{function lum(c){const m=c.match(/\\d+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2]);}
    function fondo(e){while(e){const b=getComputedStyle(e).backgroundColor;if(b&&!/rgba\\(0, 0, 0, 0\\)|transparent/.test(b))return b;e=e.parentElement;}return 'rgb(255,255,255)';}
    const out=[];for(const sel of ['article p','.toc a','figcaption','.callout .ch','th','.kicker']){const e=document.querySelector(sel);if(!e)continue;const a=lum(getComputedStyle(e).color),b=lum(fondo(e));const r=((Math.max(a,b)+.05)/(Math.min(a,b)+.05));out.push(sel+' '+r.toFixed(2));}return out;})()`);
  const bassi = contrasti.filter((c) => parseFloat(c.split(' ').pop()) < 4.5);
  if (bassi.length) ko('contrasto sotto 4,5:1 → ' + bassi.join(' · ')); else ok('contrasti ≥ 4,5:1 (' + contrasti.join(' · ') + ')');
  await lab.invia('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await lab.pausa(600);
  const sx2 = await lab.val('document.documentElement.scrollWidth > innerWidth + 1');
  if (sx2) ko('la pagina scorre in orizzontale a 390'); else ok('niente scorrimento orizzontale a 390');
  if (lab.erroriConsole.length) ko('errori in console: ' + lab.erroriConsole.slice(0, 3).join(' | ')); else ok('nessun errore in console');
  lab.chiudi(); try { process.kill(ch.pid); } catch (e) { /* */ }

  /* 3. etichette contro i fatti */
  console.log('3. etichette «…» contro fatti/*.md');
  const corpo = fs.readdirSync(FATTI).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(FATTI, f), 'utf8')).join('\n');
  const testo = html.replace(/<[^>]+>/g, ' ');
  const etichette = [...new Set([...testo.matchAll(/«([^»]{2,60})»/g)].map((m) => m[1]))];
  const norm = (s) => s.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  const corpoN = norm(corpo);
  const nonTrovate = etichette.filter((e) => !corpoN.includes(norm(e)));
  ok(`${etichette.length} etichette nel testo, ${etichette.length - nonTrovate.length} ritrovate nei fatti`);
  if (nonTrovate.length) console.log('  ⚠ da ricontrollare a mano (non trascritte dai lettori, non per forza sbagliate):\n    ' + nonTrovate.map((e) => '«' + e + '»').join('\n    '));
  console.log(difetti ? `\n— ${difetti} difetti` : '\n— nessun difetto');
  process.exit(difetti ? 1 : 0);
})().catch((e) => { console.error('KO', e.message); process.exit(2); });
