#!/usr/bin/env node
/*
 * IL CONTABILE — il motore della contabilità del Done (ADR 0005).
 *
 * Legge il §7 «Criterio Done» di un task packet, classifica ogni casella per FORMA e dice
 * quali sono IRRISOLTE. Misura da sé due cose sole: il codice di uscita della suite (dalla
 * cache di `stop-test.sh`) e i file cambiati contro §2/§3. Tutto il resto lo consegna a chi
 * ha fatto il lavoro, con il comando da lanciare.
 *
 * ⚠ NON esegue MAI un comando letto dal markdown. Un packet è un file di testo fuori da git
 *   (`.gitignore` è una whitelist che parte da `*`): eseguire da lì sarebbe la superficie di
 *   iniezione più larga dell'harness. Un comando scritto in una casella si stampa, non si lancia.
 * ⚠ Le caselle di Giacomo (gate 3) non si spuntano mai da qui: `--chiudi` ci mette `⏳ aspetta
 *   Giacomo`, e solo `--gate3` le chiude, citando lui e dichiarando che la prova è RIFERITA.
 * ⚠ Il controllo è di FORMA (spunta + prova), non di verità: un `sed -i` scrive spunte che
 *   questo motore accetta. Lo dice l'ADR 0005, e non si chiude con un hook.
 *
 * Comandi:
 *   --rapporto                      i lavori aperti, i packet sul disco con caselle aperte, i registri gemelli
 *   --referto <packet>              le caselle di UN packet, numerate, con specie e stato
 *   --chiudi <packet>               spunta con la prova SOLO suite e diff; marca ⏳ le caselle di Giacomo
 *   --gate3 <packet> "<prova>" [--riga N]   chiude la casella di Giacomo citando lui
 *   --marca <packet> <N> <cieca|rossa|corso> "<motivo>"
 *   --stato <packet> "<riga 3 nuova>"       riscrive la riga «Stato» (rifiuta «chiuso» con caselle aperte)
 *   --hook apri|controlla|gesto     per `.claude/hooks/contabilita.js`, non per le mani
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const REGISTRO = P('.claude', 'lavori-aperti.json');
const INTERRUTTORE = P('.claude', 'task-packet.json');
const CACHE_TEST = P('.claude', 'hooks', '.ultimo-test.json');
const PERIMETRO = P('.claude', 'hooks', 'perimetro.js');
const TETTO_BLOCCHI = 3;   // dopo tre avvisi sulla stessa impronta non blocca più: nessuna sessione in trappola

const leggiJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const leggi = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const due = (n) => String(n).padStart(2, '0');
const oggi = () => { const d = new Date(); return `${due(d.getDate())}/${due(d.getMonth() + 1)}`; };
const quando = (ms) => { const d = new Date(ms); return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`; };

// ─── lettura del packet ──────────────────────────────────────────────────────────────────
// Stesso taglio di `.claude/hooks/perimetro.js`: split su `^(?=## )`, sezione che inizia per `## N.`.
const sezione = (md, n) => (md.split(/^(?=## )/m).find(s => s.startsWith(`## ${n}.`)) || '');
const RE_CASELLA = /^(\s*[-*] )\[([ xX])\]\s?(.*)$/;

function caselle(md) {
  const righe = md.split('\n'); let dentro = false; const out = [];
  righe.forEach((l, i) => {
    if (/^## /.test(l)) dentro = /^## 7\./.test(l);
    if (!dentro) return;
    const m = l.match(RE_CASELLA);
    if (m) out.push({ n: out.length + 1, i, prefisso: m[1], spuntata: m[2].toLowerCase() === 'x', testo: m[3] });
  });
  return out.map(c => ({ ...c, specie: specie(c.testo), stato: statoCasella(c) }));
}

// Specie, riconosciuta per FORMA e non per senso. Nel dubbio si degrada a C (comando) o ad A
// (asserzione), cioè al secchio che resta all'agente: è il posto giusto dove sbagliare.
function specie(t) {
  if (/giacomo|electron/i.test(t)) return 'U';                       // vince su tutto: è il gate 3
  if (/git\s+(diff|show)\s+--name-only/i.test(t)) return 'D';
  if (/npm test|suite a 0 fail/i.test(t)) return mista(t) ? 'C' : 'S';
  if (/`[^`]*\b(node|npm|grep|file|git|bash|python3|cat|wc)\b[^`]*`/.test(t)) return 'C';
  return 'A';
}
// Una riga che chiede la suite E altro («…a 0 fail; i due banchi a 0 KO») non si chiude con la
// sola suite: la spunta direbbe più di quanto la macchina ha visto.
const mista = (t) => /;|\bbanch|\bKO\b|compres|marcatore|`(?!npm test`)[^`]*\b(node|grep|file|bash|python3)\b/.test(t.replace(/`npm test`/g, ''));

const prova = (t) => { const i = t.lastIndexOf(' — '); return i < 0 ? '' : t.slice(i + 3).trim(); };
// Anti-schema già sul disco: `- [x] **dichiarato nel rapporto, non eseguito**` (0005:72, 0006:52).
// Una spunta che nel testo confessa di non essere stata eseguita non è una casella chiusa.
// ⚠️ «non rieseguita dall'agente» NON è qui: è la formula onesta di una prova RIFERITA da
// Giacomo (0006:51), e vale. Qui sta solo chi dichiara che il gesto non è stato fatto da nessuno.
const ANTI = /non eseguit|da verificare|dichiarato nel rapporto|non provat/i;

function statoCasella(c) {
  const t = c.testo;
  if (c.spuntata) {
    if (ANTI.test(t)) return 'sospetta';
    return prova(t).length >= 12 ? 'chiusa' : 'nuda';
  }
  if (/⏳|aspetta Giacomo/i.test(t)) return 'attesa';
  if (/non verificabile/i.test(t)) return 'dichiarata';
  if (/non passa/i.test(t)) return 'rossa';
  if (/in corso/i.test(t)) {
    const m = t.match(/in corso[^(]*\((?:dal\s*)?(\d{1,2})\/(\d{1,2})/i);
    return (m && `${due(+m[1])}/${due(+m[2])}` === oggi()) ? 'corso' : 'scaduta';
  }
  return 'irrisolta';
}
// Bloccano la fine del turno: una casella muta e una scorciatoia scaduta. NON bloccano una
// casella onesta — `non passa` dichiara un rosso e tiene il lavoro aperto, non lo nasconde.
const BLOCCA = new Set(['irrisolta', 'nuda', 'scaduta']);
const RISOLTA = new Set(['chiusa', 'dichiarata', 'sospetta']);
const NOME = { U: 'Giacomo', S: 'suite', D: 'diff', C: 'comando', A: 'asserzione' };

// ─── glob di §2/§3 (stessa traduzione di perimetro.js) ───────────────────────────────────
const lista = (md, n) => sezione(md, n).split('\n').filter(l => /^\s*[-*] /.test(l))
  .map(l => (l.match(/`([^`]+)`/) || [])[1]).filter(Boolean);
const re = (g) => new RegExp('^' + g.replace(/\/$/, '/**').replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\//g, '%D%').replace(/\*\*/g, '%A%').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  .replace(/%D%/g, '(?:.*/)?').replace(/%A%/g, '.*') + '$');

// Col perimetro ACCESO il giudizio lo dà il hook vero, non una seconda copia dei glob
// (invariante 6). ⚠️ Senza `.claude/task-packet.json` `perimetro.js:10` esce 0 SEMPRE: sarebbe
// un verde falso, quindi lì si ricade sui glob letti dal §2 di QUESTO packet.
function dentroPerimetro(packet, md, file) {
  const j = leggiJson(INTERRUTTORE, null);
  if (j && j.packet === packet && fs.existsSync(PERIMETRO)) {
    const r = spawnSync(process.execPath, [PERIMETRO], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: 'utf8',
    });
    if (r.status === 0 || r.status === 2) return { dentro: r.status === 0, come: 'hook' };
  }
  const cons = lista(md, 2), viet = lista(md, 3);
  if (file === packet) return { dentro: true, come: 'glob' };
  const d = cons.some(g => re(g).test(file)) && !viet.some(g => re(g).test(file));
  return { dentro: d, come: 'glob' };
}

// ─── misure ──────────────────────────────────────────────────────────────────────────────
const statoGit = () => git('status', '--porcelain') || '';                 // la FIRMA: la stessa che scrive stop-test.sh
// ⚠️ Per l'ELENCO dei file serve `-uall`: senza, una cartella non tracciata si presenta
// collassata («?? .claude/») e il confronto coi §2 giudicherebbe una cartella, non i file.
const statoGitFile = () => git('status', '--porcelain', '-uall') || '';
const testaGit = () => (git('rev-parse', 'HEAD') || '').trim();
const spoglia = (p) => p.replace(/^"|"$/g, '');
function cambiati(base) {
  const st = statoGitFile().split('\n').filter(Boolean).map(l => {
    const p = l.slice(3); const i = p.indexOf(' -> '); return spoglia(i < 0 ? p : p.slice(i + 4));
  });
  let commessi = [];
  if (base) {
    const d = git('diff', '--name-only', `${base}..HEAD`);
    if (d === null) return { errore: `la base \`${base}\` non è raggiungibile (rebase o amend?)` };
    commessi = d.split('\n').filter(Boolean);
  }
  return { file: [...new Set([...st, ...commessi])] };
}

const riepilogo = (out) => (out.split('\n').filter(l => /^(#|ℹ) (tests|pass|fail|skipped) /.test(l)).slice(0, 4)
  .map(l => l.replace(/^(#|ℹ)\s*/, '').trim()).join(', '));

// Il verdetto della suite è il CODICE DI USCITA, mai una riga del riepilogo (lezione del 20/9:
// a suite rossa `node --test` stampa il dettaglio DOPO il conteggio). Qui non si rilancia alla
// cieca: se l'albero è sporco la suite la sta girando `stop-test.sh` nello stesso Stop.
function verdettoSuite({ misura = false } = {}) {
  const head = testaGit(), st = statoGit();
  const c = leggiJson(CACHE_TEST, null);
  if (c && c.head === head && c.status === sha(st)) return { ok: c.esito === 0, prova: c.riepilogo, fonte: 'misurata a fine turno' };
  if (!misura) return { ok: null, motivo: 'nessuna misura in cache per questo HEAD: la suite non è stata girata in questo turno' };
  if (st.trim()) return { ok: null, motivo: 'albero sporco: la suite la sta girando `stop-test.sh`, non la rilancio in parallelo' };
  const r = spawnSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const v = { esito: r.status === null ? 1 : r.status, riepilogo: riepilogo(out) || 'nessun riepilogo', head, status: sha(st), quando: new Date().toISOString() };
  try { fs.mkdirSync(path.dirname(CACHE_TEST), { recursive: true }); fs.writeFileSync(CACHE_TEST, JSON.stringify(v) + '\n'); } catch (e) { /* la cache è un lusso */ }
  return { ok: v.esito === 0, prova: v.riepilogo, fonte: 'misurata adesso' };
}

// Il conteggio scritto nella casella invecchia a ogni test aggiunto da un altro lavoro: non si
// confronta. Si guarda una cosa sola — se è SCESO, un test è sparito, e non è un successo.
function testiSpariti(testo, prv) {
  const a = (testo.match(/(\d{3,5})\s*test/i) || [])[1], b = (prv.match(/(\d{3,5})\s*test/i) || [])[1];
  return (a && b && +b < +a) ? `⚠ i test sono SCESI da ${a} a ${b}: uno è sparito` : null;
}

// ─── registro dei lavori ─────────────────────────────────────────────────────────────────
// `.claude/task-packet.json` è un interruttore e sparisce a lavoro finito (template:4): il
// registro è la MEMORIA che gli sopravvive. Dice solo QUALE lavoro è in volo; che cosa sia
// fatto lo dice il markdown, che resta la verità sola (invariante 6).
const registro = () => leggiJson(REGISTRO, { lavori: [] });
function salva(r) { fs.mkdirSync(path.dirname(REGISTRO), { recursive: true }); fs.writeFileSync(REGISTRO, JSON.stringify(r, null, 2) + '\n'); }
const impronta = (packet) => { const md = leggi(P(packet)); return md ? sha(sezione(md, 7)) : ''; };

function apri() {
  const j = leggiJson(INTERRUTTORE, null);
  if (!j || !j.packet || !fs.existsSync(P(j.packet))) return;
  const r = registro();
  if (r.lavori.some(l => l.packet === j.packet && l.stato === 'aperto')) return;
  r.lavori.unshift({
    packet: j.packet, aperto: new Date().toISOString(), base: testaGit().slice(0, 7),
    visto: Date.now(), blocchi: 0, impronta: impronta(j.packet), stato: 'aperto',
  });
  salva(r);
}

// Tre condizioni, in OR. Se nessuna combacia: silenzio totale. Un turno che non c'entra non
// incontra nemmeno il parser, e i packet chiusi prima dell'installazione non entrano mai qui.
function pertinenza(l, md) {
  const j = leggiJson(INTERRUTTORE, null);
  if (j && j.packet === l.packet) return 'il perimetro punta a questo packet';
  const f = P(l.packet);
  if (fs.existsSync(f) && fs.statSync(f).mtimeMs > (l.visto || 0)) return 'il packet è stato riscritto dopo l\'ultima occhiata';
  const c = cambiati(l.base);
  if (c.errore) return null;
  const cons = lista(md, 2);
  const tocca = c.file.filter(x => x !== l.packet && cons.some(g => re(g).test(x)));
  if (tocca.length) return `i file cambiati toccano i §2 del packet (${tocca.slice(0, 3).join(', ')}${tocca.length > 3 ? '…' : ''})`;
  return null;
}

// ─── scrittura: una riga per volta, con la rete ──────────────────────────────────────────
// `docs/tasks/` è fuori da git: non c'è `git checkout` da cui tornare, e uno script di pulizia
// ha già perso sei righe di `docs/INTAKE.md` il 21/9 (INTAKE.md:30). Quindi: copia prima della
// PRIMA scrittura del giro, e dopo la scrittura si rilegge e si confronta byte per byte.
function scrivi(packet, muta, inserisci) {
  const f = P(packet), vecchio = leggi(f);
  if (vecchio === null) throw new Error(`packet illeggibile: ${packet}`);
  const righe = vecchio.split('\n'), copia = righe.slice();
  const toccate = muta(righe);                       // fase 1: sostituisce SOLO gli indici che dichiara
  if (righe.length !== copia.length) throw new Error('la sostituzione ha cambiato il numero di righe: scrittura annullata');
  for (let i = 0; i < copia.length; i++) {
    if (!toccate.has(i) && righe[i] !== copia[i]) throw new Error(`riga ${i + 1} cambiata senza essere dichiarata: scrittura annullata`);
  }
  if (inserisci) inserisci(righe);                   // fase 2: la sola inserzione ammessa (la riga di firma)
  const nuovo = righe.join('\n');
  if (nuovo === vecchio) return { bak: null, toccate: 0 };
  const d = new Date();
  const bak = `${f}.bak-${d.getFullYear()}${due(d.getMonth() + 1)}${due(d.getDate())}-${due(d.getHours())}${due(d.getMinutes())}`;
  if (!fs.existsSync(bak)) fs.copyFileSync(f, bak);
  fs.writeFileSync(f, nuovo);
  if (leggi(f) !== nuovo) { fs.copyFileSync(bak, f); throw new Error('il file riletto non combacia: ripristinato dal .bak'); }
  return { bak, toccate: toccate.size };
}

const marca = (c, coda) => `${c.prefisso}[ ] ${c.testo} — ${coda}`;
const spunta = (c, prv) => `${c.prefisso}[x] ${c.testo} — ${prv}`;

// La sola traccia di chi ha chiuso che cosa e quando: fuori da git non esistono autore, data
// né `git blame`, e l'mtime cambia per qualunque ritocco.
function firmaSezione(righe) {
  let fine = -1, dentro = false;
  righe.forEach((l, i) => {
    if (/^## /.test(l)) dentro = /^## 7\./.test(l);
    if (dentro && RE_CASELLA.test(l)) fine = i;
  });
  if (fine < 0) return;
  const c = caselle(righe.join('\n'));
  const q = { chiuse: c.filter(x => x.stato === 'chiusa').length, attesa: c.filter(x => x.stato === 'attesa').length, cieche: c.filter(x => x.stato === 'dichiarata').length };
  const testo = `> Contabilità chiusa da «contabile» il ${oggi()}/${new Date().getFullYear()}: ${q.chiuse} con prova · ${q.attesa} aspettano Giacomo · ${q.cieche} non verificabili.`;
  const gia = righe.findIndex((l, i) => i > fine && /^> Contabilità chiusa/.test(l));
  if (gia > -1) { righe[gia] = testo; return; }
  righe.splice(fine + 1, 0, '', testo);
}

// ─── comandi ─────────────────────────────────────────────────────────────────────────────
function risolviPacket(arg) {
  if (!arg) throw new Error('manca il percorso del packet');
  if (path.isAbsolute(arg)) arg = path.relative(ROOT, arg);
  if (fs.existsSync(P(arg))) return arg.replace(/^\.\//, '').split(path.sep).join('/');
  const n = String(arg).match(/^(\d{4})$/);
  if (n) {
    const cand = fs.readdirSync(P('docs', 'tasks')).filter(f => f.startsWith(n[1] + '-')).map(f => `docs/tasks/${f}`);
    if (cand.length === 1) return cand[0];
    if (cand.length > 1) throw new Error(`il numero ${n[1]} non è un identificatore: ${cand.join(' e ')}. Dammi il percorso completo.`);
  }
  throw new Error(`packet non trovato: ${arg}`);
}

function referto(packet, { misura = false } = {}) {
  const md = leggi(P(packet));
  if (md === null) throw new Error(`packet illeggibile: ${packet}`);
  const cs = caselle(md);
  if (!cs.length) throw new Error(`nessuna casella nel §7 di ${packet}: il §7 manca o è fuori grammatica`);
  const st = (md.split('\n').slice(0, 10).find(l => /\*\*Stato\*\*:/.test(l)) || '').match(/\*\*Stato\*\*:\s*(.*)$/);
  return {
    packet, md, caselle: cs, stato: st ? st[1].trim() : '(riga «Stato» non trovata)',
    mtime: quando(fs.statSync(P(packet)).mtimeMs), impronta: sha(sezione(md, 7)),
    suite: cs.some(c => c.specie === 'S' && !RISOLTA.has(c.stato)) ? verdettoSuite({ misura }) : null,
  };
}

const rigaCasella = (c) => `  riga ${c.n} (${NOME[c.specie]}) ${c.stato.toUpperCase()}: ${c.testo.slice(0, 110)}`;

function stampaReferto(r) {
  console.log(`${r.packet} — letto adesso, mtime ${r.mtime}, impronta §7 ${r.impronta}`);
  console.log(`  Stato (riga 3): ${r.stato}`);
  r.caselle.forEach(c => console.log(rigaCasella(c)));
  if (r.suite) console.log(`  suite: ${r.suite.ok === null ? `verifica non disponibile — ${r.suite.motivo}` : `${r.suite.ok ? 'verde' : 'ROSSA'} — ${r.suite.prova} (${r.suite.fonte})`}`);
  // La riga da mettere accanto a una rivendicazione: se un agente dice di aver chiuso, il conto
  // è questo, all'ora che c'è scritta. La parola non chiude niente: chiude il disco.
  const q = (st) => r.caselle.filter(c => c.stato === st).length;
  console.log(`  sul disco ADESSO (${r.mtime}): ${q('chiusa')} chiuse con prova · ${q('attesa')} aspettano Giacomo · ${q('dichiarata')} dichiarate · ${q('rossa')} rosse · ${r.caselle.filter(c => BLOCCA.has(c.stato)).length} mute`);
  const s = r.caselle.filter(c => c.stato === 'sospetta' || c.stato === 'nuda');
  if (s.length) console.log(`  ⚠ ${s.length} spunta/e senza prova o che dichiarano di non essere state eseguite (righe ${s.map(c => c.n).join(', ')}): le segnalo, non le tolgo — togliere la spunta di un altro non è compito della guardia.`);
}

function chiudi(packet) {
  const r = referto(packet, { misura: true });
  const relazione = [];
  const esito = scrivi(packet, (righe) => {
    const toccate = new Set();
    for (const c of r.caselle) {
      if (RISOLTA.has(c.stato) || c.stato === 'attesa' || c.stato === 'rossa') { continue; }
      if (c.specie === 'U') {
        righe[c.i] = marca(c, `⏳ **aspetta Giacomo** (gate 3, dal ${oggi()})`);
        toccate.add(c.i); relazione.push(`riga ${c.n}: aspetta Giacomo — non la spunta la guardia. Quando lui conferma: --gate3 «${packet}» "<i numeri veri>"`);
        continue;
      }
      if (c.specie === 'S') {
        const v = r.suite || verdettoSuite({ misura: true });
        if (v.ok === true) {
          const sceso = testiSpariti(c.testo, v.prova);
          if (sceso) { relazione.push(`riga ${c.n}: suite verde ma ${sceso} — non la spunto`); continue; }
          righe[c.i] = spunta(c, `${v.prova} (${v.fonte})`); toccate.add(c.i);
          relazione.push(`riga ${c.n}: spuntata — ${v.prova}`);
        } else if (v.ok === false) {
          relazione.push(`riga ${c.n}: **suite ROSSA** (${v.prova}) — non spunto niente, prima il verde`);
        } else {
          relazione.push(`riga ${c.n}: verifica non disponibile — ${v.motivo}`);
        }
        continue;
      }
      if (c.specie === 'D') {
        const cam = cambiati(registro().lavori.find(l => l.packet === packet && l.stato === 'aperto')?.base);
        if (cam.errore) { relazione.push(`riga ${c.n}: verifica non disponibile — ${cam.errore}`); continue; }
        const fuori = cam.file.filter(f => !dentroPerimetro(packet, r.md, f).dentro);
        const come = cam.file.length ? dentroPerimetro(packet, r.md, cam.file[0]).come : 'glob';
        if (fuori.length) { relazione.push(`riga ${c.n}: **${fuori.length} file FUORI dai consentiti** (${fuori.slice(0, 5).join(', ')}) — non la spunto`); continue; }
        righe[c.i] = spunta(c, `${cam.file.length} file, tutti dentro §2 (verificati uno per uno col ${come === 'hook' ? 'hook `perimetro.js`' : 'glob del §2'})`);
        toccate.add(c.i); relazione.push(`riga ${c.n}: spuntata — ${cam.file.length} file, tutti dentro §2`);
        continue;
      }
      relazione.push(`riga ${c.n} (${NOME[c.specie]}): la chiudi TU. Lancia il comando scritto nella casella e incolla l'uscita vera dopo « — ». Non la eseguo io: non si lanciano comandi letti da un markdown. Se non si può: --marca «${packet}» ${c.n} cieca "<motivo>"`);
    }
    return toccate;
  }, firmaSezione);
  stampaReferto(referto(packet));
  relazione.forEach(l => console.log(`  · ${l}`));
  if (esito.bak) console.log(`  copia di sicurezza: ${path.basename(esito.bak)}`);
  proponiStato(packet);
  registriGemelli(packet);
  aggiornaRegistro(packet);
}

function proponiStato(packet) {
  const r = referto(packet);
  const aperte = r.caselle.filter(c => !RISOLTA.has(c.stato));
  const gate = r.caselle.filter(c => c.specie === 'U');
  if (/chiuso/i.test(r.stato) && aperte.length) console.log(`  ⚠ la riga 3 dice «chiuso» ma ${aperte.length} casella/e non è/sono chiusa/e (righe ${aperte.map(c => c.n).join(', ')}): mai «chiuso» finché una casella è aperta.`);
  if (!aperte.length) console.log(`  riga 3 proposta: **Stato**: chiuso — gate 3 confermato il ${oggi()}, commit \`<hash>\``);
  else if (gate.every(c => c.stato === 'attesa' || c.stato === 'chiusa') && aperte.every(c => c.specie === 'U')) console.log(`  riga 3 proposta: **Stato**: eseguito — verde, aspetta il gate 3 (casella ${aperte.map(c => c.n).join(', ')})`);
  console.log('  (la riga 3 non la riscrivo da me: --stato «<packet>» "<testo>")');
}

// Chiudere il §7 SPOSTA il buco di file: la stessa verità sta anche in HANDOFF e nella tabella
// «Presi in carico» di INTAKE (quattro copie a mano, contro l'invariante 6). Qui si NOMINANO,
// non si toccano: riscriverli a macchina è come si sono perse sei righe di INTAKE il 21/9.
function registriGemelli(packet) {
  const num = (path.basename(packet).match(/^(\d{4})/) || [])[1];
  if (!num) return;
  const righe = [];
  for (const f of ['docs/INTAKE.md', 'docs/HANDOFF.md']) {
    const md = leggi(P(f)); if (!md) continue;
    md.split('\n').forEach((l, i) => { if (l.includes(path.basename(packet)) || (num && l.includes(`packet ${num}`))) righe.push(`${f}:${i + 1} — ${l.trim().slice(0, 100)}`); });
  }
  if (righe.length) { console.log('  Registri gemelli da guardare a mano (non li tocco):'); righe.slice(0, 6).forEach(l => console.log(`    ${l}`)); }
}

function aggiornaRegistro(packet) {
  const r = registro(); const l = r.lavori.find(x => x.packet === packet && x.stato === 'aperto');
  if (!l) return;
  const cs = caselle(leggi(P(packet)) || '');
  l.visto = Date.now(); l.impronta = impronta(packet);
  if (cs.length && cs.every(c => RISOLTA.has(c.stato))) { l.stato = 'chiuso'; l.chiuso = new Date().toISOString(); }
  salva(r);
}

function gate3(packet, testo, riga) {
  if (!testo || testo.trim().length < 12) throw new Error('la prova del gate 3 non può essere vuota: servono i numeri veri, il progetto e la data. Senza, la casella resta aperta.');
  const r = referto(packet);
  let u = r.caselle.filter(c => c.specie === 'U' && c.stato !== 'chiusa');
  if (riga) u = u.filter(c => c.n === +riga);
  if (!u.length) throw new Error('nessuna casella di Giacomo da chiudere (o è già chiusa)');
  if (u.length > 1) throw new Error(`${u.length} caselle di Giacomo (righe ${u.map(c => c.n).join(', ')}): dimmi quale con --riga N`);
  const c = u[0];
  const esito = scrivi(packet, (righe) => {
    const pulito = c.testo.replace(/\s*—\s*⏳.*$/, '');
    righe[c.i] = `${c.prefisso}[x] ${pulito} — **fatto il ${oggi()}** (prova riferita da Giacomo, non rieseguita dall'agente): ${testo.trim()}`;
    return new Set([c.i]);
  }, firmaSezione);
  console.log(`riga ${c.n} chiusa citando Giacomo. ${esito.bak ? `Copia: ${path.basename(esito.bak)}` : ''}`);
  stampaReferto(referto(packet)); proponiStato(packet); aggiornaRegistro(packet);
}

const CODE = {
  cieca: (m) => `⚠️ **non verificabile da qui**: ${m}`,
  rossa: (m) => `**non passa**: ${m}`,
  corso: (m) => `**in corso** (dal ${oggi()})${m ? `: ${m}` : ''}`,
};
function marcaRiga(packet, n, tipo, motivo) {
  if (!CODE[tipo]) throw new Error(`marcatore sconosciuto: ${tipo}. Sono tre: cieca | rossa | corso.`);
  if (tipo !== 'corso' && (!motivo || motivo.trim().length < 6)) throw new Error('serve il motivo, o l\'uscita vera del comando');
  const r = referto(packet);
  const c = r.caselle.find(x => x.n === +n);
  if (!c) throw new Error(`nel §7 non c'è una riga ${n}`);
  if (c.specie === 'U' && tipo !== 'corso') throw new Error('la casella di Giacomo non si dichiara cieca: o `--chiudi` ci mette ⏳, o `--gate3` la chiude citando lui');
  const esito = scrivi(packet, (righe) => { righe[c.i] = marca(c, CODE[tipo](motivo || '')); return new Set([c.i]); }, firmaSezione);
  console.log(`riga ${c.n} marcata «${tipo}». ${esito.bak ? `Copia: ${path.basename(esito.bak)}` : ''}`);
  if (tipo === 'corso') console.log('  ⚠ «in corso» vale SOLO oggi: da domani il contabile la conta di nuovo fra le irrisolte. Un marcatore che zittisce per sempre è una macchina per dimenticare.');
  aggiornaRegistro(packet);
}

function riscriviStato(packet, testo) {
  if (!testo || !testo.trim()) throw new Error('la riga «Stato» non si svuota');
  const r = referto(packet);
  const aperte = r.caselle.filter(c => !RISOLTA.has(c.stato));
  if (/chiuso/i.test(testo) && aperte.length) throw new Error(`«chiuso» con ${aperte.length} casella/e aperta/e (righe ${aperte.map(c => c.n).join(', ')}): rifiutato. Al massimo «eseguito — verde, aspetta il gate 3».`);
  const esito = scrivi(packet, (righe) => {
    const i = righe.findIndex(l => /\*\*Stato\*\*:/.test(l));
    if (i < 0) throw new Error('riga «Stato» non trovata');
    righe[i] = righe[i].replace(/(\*\*Stato\*\*:\s*).*$/, `$1${testo.trim()}`);
    return new Set([i]);
  });
  console.log(`riga «Stato» riscritta. ${esito.bak ? `Copia: ${path.basename(esito.bak)}` : ''}`);
}

// ─── rapporto: i lavori aperti, e i packet che si contraddicono da soli ──────────────────
function rapporto() {
  const r = registro().lavori;
  const aperti = r.filter(l => l.stato === 'aperto');
  console.log(`Lavori aperti nel registro: ${aperti.length}`);
  for (const l of aperti) {
    console.log(`· ${l.packet} — aperto il ${quando(Date.parse(l.aperto))}, base ${l.base}, avvisi ${l.blocchi}${l.irrisolto ? `, IRRISOLTO: ${l.irrisolto}` : ''}`);
    try { referto(l.packet).caselle.filter(c => !RISOLTA.has(c.stato)).forEach(c => console.log(rigaCasella(c))); } catch (e) { console.log(`  ⚠ ${e.message}`); }
    const giorni = (Date.now() - Date.parse(l.aperto)) / 864e5;
    if (giorni > 1) console.log(`  ⚠ aperto da ${Math.floor(giorni)} giorni.`);
  }
  console.log('\nPacket sul disco con caselle aperte (Stato diverso da «bozza»):');
  let n = 0;
  for (const f of fs.readdirSync(P('docs', 'tasks')).filter(f => /^\d{4}-.*\.md$/.test(f)).sort()) {
    const packet = `docs/tasks/${f}`;
    let rr; try { rr = referto(packet); } catch (e) { continue; }
    if (/^(bozza|proposto)/i.test(rr.stato)) continue;   // non è ancora partito: non c'è niente da chiudere
    // Solo le caselle davvero aperte. Le spunte senza prova dei packet anteriori al 21/9 si
    // contano in una riga e non si toccano: erano un'altra convenzione, non un lavoro dimenticato.
    const aperte = rr.caselle.filter(c => ['irrisolta', 'scaduta', 'attesa'].includes(c.stato));
    const nude = rr.caselle.filter(c => c.stato === 'nuda' || c.stato === 'sospetta');
    if (!aperte.length) continue;
    n++;
    console.log(`· ${packet} — Stato: ${rr.stato.slice(0, 90)}`);
    aperte.forEach(c => console.log(rigaCasella(c)));
    if (nude.length) console.log(`  · ${nude.length} spunta/e senza prova dopo « — » (righe ${nude.map(c => c.n).join(', ')}): segnalate, non toccate.`);
    if (/provato in electron|gate 3 passato|chiuso/i.test(rr.stato) && aperte.some(c => c.specie === 'U'))
      console.log('  ⚠ la riga 3 dichiara il gate 3 passato e la casella del gate 3 è vuota: o si chiude citando Giacomo (--gate3), o si dichiara.');
  }
  if (!n) console.log('· nessuno.');
  console.log('\n⚠ Contare le spunte misura la compilazione, non la verifica: una prova che non hai eseguito TU in questo turno non è una prova, è una citazione.');
}

// ─── il verdetto per lo Stop hook ────────────────────────────────────────────────────────
function controlla() {
  const r = registro(); let blocco = null, avviso = null, cambiato = false;
  for (const l of r.lavori.filter(x => x.stato === 'aperto')) {
    let rr; try { rr = referto(l.packet); } catch (e) { continue; }
    const mute = rr.caselle.filter(c => BLOCCA.has(c.stato));
    if (!mute.length) {
      if (rr.caselle.every(c => RISOLTA.has(c.stato))) { l.stato = 'chiuso'; l.chiuso = new Date().toISOString(); }
      l.visto = Date.now(); l.impronta = rr.impronta; cambiato = true; continue;
    }
    const perche = pertinenza(l, rr.md);
    if (!perche) continue;
    if (l.impronta !== rr.impronta) { l.blocchi = 0; l.impronta = rr.impronta; }   // il §7 è cambiato: si riparte
    l.visto = Date.now(); cambiato = true;
    if (l.blocchi >= TETTO_BLOCCHI) {
      l.irrisolto = `${mute.length} casella/e non chiuse dopo ${TETTO_BLOCCHI} avvisi (${quando(Date.now())})`;
      avviso = `Contabilità: ${l.packet} ha ancora ${mute.length} casella/e muta/e nel §7 e non blocco più (terzo avviso). Resta scritto in \`.claude/lavori-aperti.json\` e lo ripete \`npm run contabilita\`.`;
      continue;
    }
    l.blocchi++;
    blocco = motivo(l, rr, mute, perche);
    break;
  }
  if (cambiato) salva(r);
  return { blocco, avviso };
}

function motivo(l, rr, mute, perche) {
  const v = rr.suite || { ok: null, motivo: 'non misurata in questo turno' };
  const righe = [
    `Il §7 di ${l.packet} ha ${mute.length} casella/e non chiusa/e, e questo turno lo riguarda (${perche}).`,
    `Letto adesso dal disco: mtime ${rr.mtime}, impronta §7 ${rr.impronta}. Riga 3: ${rr.stato.slice(0, 90)}`,
    '',
  ];
  mute.forEach(c => righe.push(rigaCasella(c)));
  righe.push('');
  if (v.ok === true) righe.push(`Prova già misurata, pronta da incollare — suite: ${v.prova}`);
  else if (v.ok === false) righe.push(`⚠ La suite è ROSSA (${v.prova}): prima il verde, poi le spunte.`);
  else righe.push(`Suite: ${v.motivo}.`);
  const s = rr.caselle.filter(c => c.stato === 'sospetta');
  if (s.length) righe.push(`⚠ Righe ${s.map(c => c.n).join(', ')}: spuntate ma il testo dichiara che non sono state eseguite. Le segnalo, non le tolgo.`);
  righe.push('',
    `Chiudi la contabilità così:  node tools/contabilita/packet.js --chiudi "${l.packet}"`,
    'Spunta con la prova SOLO suite e diff (le due che ha misurato), mette ⏳ sulle caselle di Giacomo e ti lascia le altre, col comando da lanciare.',
    'Se una casella non si può chiudere:  --marca "<packet>" <N> cieca "<motivo>"  ·  rossa "<uscita vera>"  ·  corso  (vale solo oggi).',
    'Se Giacomo ha già provato in Electron:  --gate3 "<packet>" "<i numeri veri, il progetto, la data>".',
    'Una casella di Giacomo NON si spunta da soli, e una spunta nuda non vale: la prova va dopo « — ».');
  return righe.join('\n');
}

// ─── il verdetto per i due gesti di chiusura (PreToolUse su Bash) ────────────────────────
function gesto(comando) {
  const j = leggiJson(INTERRUTTORE, null);
  if (!j || !j.packet) return null;                                  // senza interruttore non c'è niente da chiudere
  // ⚠️ Solo in POSIZIONE DI COMANDO (inizio, o dopo ; && || |), mai dentro una stringa: appena
  // acceso, il 21/9, questo hook ha rifiutato un `echo '…"command":"…"…' | node …` che NOMINAVA il
  // gesto senza farlo. Una guardia che scatta sul testo insegna solo ad aggirarla.
  const gesti = new RegExp(`(?:^|[;&|]\\s*|\\n\\s*)(?:git(?:\\s+-C\\s+\\S+)?\\s+commit\\b|rm\\s+[^;&|]*task-packet\\.json)`);
  if (!gesti.test(comando || '')) return null;
  let rr; try { rr = referto(j.packet); } catch (e) { return null; }
  const mute = rr.caselle.filter(c => BLOCCA.has(c.stato));
  if (!mute.length) return null;
  return `Contabilità del packet «${j.packet}»: ${mute.length} casella/e del §7 non è/sono né chiusa/e né dichiarata/e.\n` +
    mute.map(rigaCasella).join('\n') + '\n' +
    `Prima di committare o di togliere il perimetro: node tools/contabilita/packet.js --chiudi "${j.packet}".\n` +
    'Un commit intermedio voluto si dichiara: --marca "<packet>" <N> corso (vale solo oggi). Non aggirare dalla shell.';
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────────────
function principale(argv) {
  const a = argv.slice(2);
  const val = (f) => { const i = a.indexOf(f); return i > -1 ? a[i + 1] : null; };
  if (a[0] === '--hook') {
    if (a[1] === 'apri') { apri(); return 0; }
    if (a[1] === 'controlla') {
      const { blocco, avviso } = controlla();
      if (blocco) process.stdout.write(JSON.stringify({ decision: 'block', reason: blocco }) + '\n');
      else if (avviso) process.stdout.write(JSON.stringify({ systemMessage: avviso }) + '\n');
      return 0;
    }
    if (a[1] === 'gesto') {
      const m = gesto(a.slice(2).join(' '));
      if (m) { console.error(m); return 2; }
      return 0;
    }
    return 0;
  }
  if (a[0] === '--elenco') { rapporto(); return 0; }
  if (a[0] === '--referto') { stampaReferto(referto(risolviPacket(a[1]), { misura: false })); return 0; }
  if (a[0] === '--chiudi') { chiudi(risolviPacket(a[1])); return 0; }
  if (a[0] === '--gate3') { gate3(risolviPacket(a[1]), a[2], val('--riga')); return 0; }
  if (a[0] === '--marca') { marcaRiga(risolviPacket(a[1]), a[2], a[3], a.slice(4).filter(x => x !== '--riga').join(' ')); return 0; }
  if (a[0] === '--stato') { riscriviStato(risolviPacket(a[1]), a.slice(2).join(' ')); return 0; }
  rapporto(); return 0;
}

if (require.main === module) {
  try { process.exit(principale(process.argv)); }
  catch (e) { console.error(`Contabilità: ${e.message}`); process.exit(1); }
}

module.exports = { caselle, specie, statoCasella, prova, referto, controlla, gesto, apri, rapporto, risolviPacket, scrivi, sezione, lista, re };
