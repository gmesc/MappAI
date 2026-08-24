/* tools/guida-docenti/campagna.js — la CAMPAGNA di screenshot della guida docenti (22/8/26).
 *
 * Una sola campagna, in ordine di guida, con `passo(nome, fn)` che cattura l'errore e
 * continua. Si rilancia da zero quando cambia la misura della finestra: è più sicuro che
 * rifotografare a pezzi.
 *
 *   node tools/guida-docenti/campagna.js               # tutti i passi, stato corrente
 *   node tools/guida-docenti/campagna.js --da-zero     # azzera casa/ + localStorage + reload, poi tutti
 *   node tools/guida-docenti/campagna.js --solo 05     # solo i passi il cui nome comincia con «05»
 *   node tools/guida-docenti/campagna.js --elenco      # stampa i nomi dei passi e basta
 *
 * Prerequisiti: l'istanza di prova viva su :9333 (vedi lab.js) e i due vault d'origine
 * (4R/Storia/grind this heels · 4R/Scienze/Elettricità - MM) nel disco vero, che
 * `--da-zero` RICOPIA (mai in-place). Gli esiti delle feature mai provate in Electron
 * finiscono in fatti/esiti-electron.md.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const lab = require('./lab.js');

const GUIDA = path.join(process.env.HOME, 'Claude', 'MappAI - guida docenti');
const LAB = path.join(GUIDA, 'lab');
const CASA = path.join(LAB, 'casa', 'MappAI - file');
const VERI = path.join(process.env.HOME, 'Documents', 'MappAI - file', 'Mappe', '4R');
const ESITI = path.join(__dirname, 'fatti', 'esiti-electron.md');
const VAULT_MM = 'Elettricità - MM';
const VAULT_DOSSIER = 'grind this heels';

const argv = process.argv.slice(2);
const opz = { daZero: argv.includes('--da-zero'), elenco: argv.includes('--elenco'), solo: (argv[argv.indexOf('--solo') + 1] || '') };
if (!argv.includes('--solo')) opz.solo = '';

const passi = [];
function passo(nome, fn) { passi.push({ nome, fn }); }
const esiti = [];
function esito(feature, ok, nota) { esiti.push({ feature, ok, nota }); console.log((ok ? '  ✅ ' : '  ❌ ') + feature + (nota ? ' — ' + nota : '')); }

/* ── azzeramento dell'istanza di prova ──────────────────────────────── */
function ricopiaVault() {
  for (const [materia, nome] of [['Scienze', VAULT_MM], ['Storia', VAULT_DOSSIER]]) {
    const dst = path.join(CASA, 'Mappe', '4R', materia);
    fs.rmSync(path.join(dst, nome), { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    execSync(`cp -R "${path.join(VERI, materia, nome)}" "${dst}/"`);
    // lo stato di una generazione vecchia (pipeline.json) farebbe comparire «Riprendi» a ogni apertura
    fs.rmSync(path.join(dst, nome, 'pipeline.json'), { force: true });
    // il dossier copiato dice `dossier: false` (salvato dopo una riapertura, vedi fatti/f §8.1): senza, niente «Proietta»
    if (nome === VAULT_DOSSIER) { const iy = path.join(dst, nome, 'index.yaml'); fs.writeFileSync(iy, fs.readFileSync(iy, 'utf8').replace(/^dossier: false/m, 'dossier: true')); }
  }
  // le cartelle che l'app rigenera da sé; la classe 4R (classi.json) resta
  for (const d of ['Attività di studio', 'Diagnostica', 'Registro consumi AI', 'Allievi']) fs.rmSync(path.join(CASA, d), { recursive: true, force: true });
}
async function daZero() {
  console.log('— da zero: ricopio i vault, svuoto localStorage (tranne la chiave AI), ricarico');
  ricopiaVault();
  await lab.val(`(()=>{ const tieni={}; for (const k of ['gemini_api_key','infomaniak_api_key','infomaniak_product_id','mappai_ai_provider','mappai_beta_access_granted']) { const v=localStorage.getItem(k); if(v!==null) tieni[k]=v; }
    localStorage.clear(); for (const k in tieni) localStorage.setItem(k, tieni[k]); localStorage.setItem('mappai_beta_access_granted','true'); return Object.keys(tieni); })()`);
  await lab.ricarica(3500);
}

/* ── la VISTA RIDOTTA è la configurazione dei tester (23/8) ─────────────
   I docenti-tester useranno COSTRUISCI in forma ridotta: la strada breve
   (fonte · genere · tema · Chi/Cosa · genera) senza i riquadri a fondo scuro,
   che `html.mappai-ridotta #mn-bento .mn-card--extra` spegne
   (`mappai-stile-manifesto.css:1261`). La guida fotografa quello che vedranno,
   quindi il flag si accende PRIMA di ogni campagna — anche senza `--da-zero`,
   che lo azzererebbe insieme al resto di localStorage.
   ⚠️ La classe `mappai-ridotta` la mette il boot inline di `index.html` (:74-90)
   leggendo localStorage: scritto il flag, ci vuole una RICARICA. */
async function vistaRidotta() {
  /* il velo di blocco beta: senza il flag copre tutto (z-index 10000) e ogni clic
     finisce su di lui — «menu della briciola non visibile» era questo */
  const gia = await lab.val("document.documentElement.classList.contains('mappai-ridotta') && localStorage.getItem('mappai_beta_access_granted')==='true' && !document.querySelector('#beta-lock-screen')");
  if (gia) return;
  await lab.val("(()=>{localStorage.setItem('mappai_vista_ridotta','1'); localStorage.setItem('mappai_beta_access_granted','true'); return 1})()");
  await lab.ricarica(3500);
  const ok = await lab.val("document.documentElement.classList.contains('mappai-ridotta')");
  if (!ok) throw new Error('vista ridotta non attiva dopo la ricarica');
  console.log('— vista ridotta ACCESA (la configurazione dei tester)');
}

/* ── aiuti comuni ───────────────────────────────────────────────────── */
/* i gesti di navigazione vivono in gesti.js: li usa anche il demo video (inv. 6) */
const gesti = require('./gesti.js')(lab);
const { nascondiDev, menuCosa } = gesti;
async function vocePer(testo, dentro, tag) { return lab.perTesto(testo, dentro, tag); }
function fotoDi(nomeMateria, nomeVault, f) { return path.join(CASA, 'Mappe', '4R', nomeMateria, nomeVault, f); }

/* ════════════════════════════════════════════════════════════════════
   I PASSI — in ordine di guida. Nome = «NN-capitolo-soggetto».
   (si riempiono dopo la mappa dei fatti: fatti/*.md)
   ════════════════════════════════════════════════════════════════════ */
require('./passi.js')({ passo, esito, lab, menuCosa, vocePer, nascondiDev, fotoDi, CASA, LAB, VAULT_MM, VAULT_DOSSIER });

/* ── esecuzione ─────────────────────────────────────────────────────── */
(async () => {
  if (opz.elenco) { passi.forEach((p, i) => console.log(String(i + 1).padStart(3), p.nome)); return; }
  await lab.collega();
  await lab.metrica(1470, 956, 2);
  if (opz.daZero) await daZero();
  await vistaRidotta();
  await nascondiDev();
  const daFare = passi.filter((p) => !opz.solo || p.nome.startsWith(opz.solo));
  const ko = [];
  const t0 = Date.now();
  for (const p of daFare) {
    console.log('\n▶ ' + p.nome);
    try { await lab.pulito(); await p.fn(); }
    catch (e) { ko.push({ nome: p.nome, err: e.message }); console.log('  ✗ ' + e.message.split('\n')[0]); }
  }
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n— ${daFare.length - ko.length}/${daFare.length} passi ok in ${sec}s`);
  ko.forEach((k) => console.log('  ✗ ' + k.nome + ': ' + k.err.split('\n')[0]));
  if (lab.erroriConsole.length) { console.log('\n— errori di console durante la campagna:'); lab.erroriConsole.slice(0, 20).forEach((e) => console.log('  · ' + String(e).slice(0, 200))); }
  if (esiti.length) {
    const righe = ['# Esiti in Electron — campagna della guida docenti', '', `Scritto dalla campagna (${new Date().toISOString().slice(0, 16).replace('T', ' ')}). Ogni riga è una feature mai provata nell'app vera prima d'ora (HANDOFF §5), fatta girare dalla campagna di screenshot.`, '', '| feature | esito | nota |', '|---|---|---|', ...esiti.map((e) => `| ${e.feature} | ${e.ok ? '✅' : '❌'} | ${e.nota || ''} |`), ''];
    fs.writeFileSync(ESITI, righe.join('\n'));
    console.log('— esiti scritti in ' + path.relative(process.cwd(), ESITI));
  }
  lab.chiudi();
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error('KO', e); process.exit(2); });
