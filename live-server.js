'use strict';
/*
 * MappAI — server LAN di MappAI Live
 * Copyright (C) 2026 Giacomo Meschini <giacomo@insegnai.ch>
 *
 * Questo programma è software libero: puoi ridistribuirlo e/o modificarlo
 * secondo i termini della GNU General Public License come pubblicata dalla
 * Free Software Foundation, nella versione 3 della Licenza o (a tua scelta)
 * in una versione successiva.
 *
 * Questo programma è distribuito nella speranza che sia utile, ma SENZA
 * ALCUNA GARANZIA; senza neppure la garanzia implicita di COMMERCIABILITÀ o
 * IDONEITÀ A UNO SCOPO PARTICOLARE. Vedi la GNU General Public License per
 * maggiori dettagli.
 *
 * Dovresti aver ricevuto una copia della GNU General Public License insieme a
 * questo programma. In caso contrario, vedi <https://www.gnu.org/licenses/>.
 *
 * I componenti di terze parti inclusi (font, librerie) restano sotto le loro
 * licenze: vedi THIRD-PARTY-NOTICES.md.
 */
/*
 * live-server.js — server LAN di MappAI Live (Studio attivo + Materiali)
 * ----------------------------------------------------------------------
 * Fratello di garden-server.js / collab-server.js (stessi pattern): server
 * HTTP Node puro avviato dal main process via IPC. Serve la pagina studente
 * sulla rete di classe, raccoglie le risposte al quiz e le archivia in cartelle
 * locali crash-safe. A chiusura genera i due report (heatmap domande + schede).
 *
 *   <dir>/session.json              — meta sessione + roster + fase
 *   <dir>/questions.json            — set COMPLETO con soluzioni (mai servito)
 *   <dir>/students/<id>.json        — risposte di un allievo (scritte a ogni POST)
 *   <dir>/results.json              — modello dati graduato (a chiusura)
 *   <dir>/report-domande.html       — Report A
 *   <dir>/report-studenti.html      — Report B
 *
 * Sicurezza (rete di classe): token di sessione nel QR per gli studenti;
 * adminToken (mai nel QR) per le operazioni docente; static con allowlist
 * rigida e path traversal rifiutato; body cap 1 MB; input sanitizzati dal core.
 *
 * Logica pura condivisa: public/js/mappai-live-core.js + mappai-live-reports.js.
 * Testabile senza Electron: tests/live-server.test.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LC = require(path.join(__dirname, 'public', 'js', 'mappai-live-core.js'));
const LR = require(path.join(__dirname, 'public', 'js', 'mappai-live-reports.js'));
const TC = require(path.join(__dirname, 'public', 'js', 'mappai-timeline-core.js'));   // Timeline Live (008)
const SC = require(path.join(__dirname, 'public', 'js', 'mappai-scelta-core.js'));      // «Domande a scelta»
const FC = require(path.join(__dirname, 'public', 'js', 'mappai-files-core.js'));       // scambio con MappAI studente (7/9)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
};
const STATIC_ALLOW = [
  '/public/live/',
  '/public/js/mappai-live-core.js',
  // «Domande a scelta»: la pagina studente carica il core e la view — senza
  // questi due la superficie non esiste al telefono.
  '/public/js/mappai-scelta-core.js',
  '/public/js/mappai-scelta-view.js',   // ⚠️ confronto ESATTO più sotto: un `.bak` accanto non si serve
  '/public/js/vendor/'
];
const BODY_CAP = 1024 * 1024;   // 1 MB

function token(n) { return crypto.randomBytes(n).toString('base64url').slice(0, n); }

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb, cap) {
  const tetto = cap || BODY_CAP;
  let size = 0; const chunks = [];
  req.on('data', d => { size += d.length; if (size > tetto) { req.destroy(); return; } chunks.push(d); });
  req.on('end', () => { try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { cb(e); } });
  req.on('error', e => cb(e));
}

function makeServeStatic(repoRoot) {
  return function serveStatic(urlPath, res) {
    const clean = path.posix.normalize(urlPath);
    // solo le CARTELLE valgono come prefisso; un file elencato si serve per il
    // suo nome esatto (altrimenti un `…-core.js.bak` lasciato lì uscirebbe)
    if (clean.includes('..') || !STATIC_ALLOW.some(p => p.endsWith('/') ? clean.startsWith(p) : clean === p)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const file = path.join(repoRoot, clean.replace(/^\//, '').split('/').join(path.sep));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      if (ext === '.html') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(data);
    });
  };
}

// ═══════════════════════════ SERVER QUIZ ═══════════════════════════════════
function createLiveServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const studentsDir = path.join(dir, 'students');
  fs.mkdirSync(studentsDir, { recursive: true });
  const serveStatic = makeServeStatic(repoRoot);

  const sessionFile = path.join(dir, 'session.json');
  const questionsFile = path.join(dir, 'questions.json');

  let session;
  let roster = [];              // [{emojiKey,emoji,num,name}]
  let questions = [];           // set COMPLETO con soluzioni
  let students = {};            // identityKey → { emojiKey,num,name,deviceId,joinedAt,finishedAt,answers }
  let closeTimer = null;

  // ── Stato: nuovo o RIPRESA da disco (riavvio a metà lezione = zero perdite) ──
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session = s.session;
    roster = s.roster || [];
    try { questions = JSON.parse(fs.readFileSync(questionsFile, 'utf8')); } catch (e) { questions = []; }
    // In «a scelta» il pool È l'attività: riprenderla senza è irrecuperabile, e
    // proseguire consumerebbe le risposte già raccolte. Meglio non partire.
    if (session.mode === 'scelta' && !questions.length) {
      throw new Error('sessione «a scelta» irrecuperabile: questions.json mancante o vuoto in ' + dir);
    }
    for (const f of fs.readdirSync(studentsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const st = JSON.parse(fs.readFileSync(path.join(studentsDir, f), 'utf8'));
        if (st && st.emojiKey) students[LC.identityKey(st.emojiKey, st.num)] = st;
      } catch (e) { console.warn('[live-server] studente illeggibile', f); }
    }
    console.log('[live-server] sessione RIPRESA:', session.name, '·', Object.keys(students).length, 'allievi · fase', session.phase);
  } else {
    const cfg = opts.session || {};
    session = {
      schema: 'mappai-live-session@1',
      name: cfg.name || 'Quiz',
      activity: cfg.activity || 'Quiz',
      className: cfg.className || '',
      scope: cfg.scope || '',   // 010: ramo L1 coperto ('' = tutta la mappa)
      durationMin: Number(cfg.durationMin) || 0,
      // Timeline Live (008): modalità attività, schema di login, indizi.
      // Default = comportamento storico (quiz / login individuale / indizi su richiesta).
      mode: (cfg.mode === 'build' || cfg.mode === 'scelta') ? cfg.mode : 'quiz',
      // «Domande a scelta»: la config dell'attività, normalizzata dal core
      // (le leve del docente: minimo, aree minime, reveal, perché no…).
      scelta: cfg.mode === 'scelta' ? SC.normalizzaCfg(cfg.scelta) : null,
      loginMode: cfg.loginMode === 'group' ? 'group' : 'individual',
      hintMode: (['always', 'onrequest', 'never'].indexOf(cfg.hintMode) >= 0) ? cfg.hintMode : 'onrequest',
      // Report profilo studente: mostra le soluzioni (giuste/sbagliate + spiegazione) a
      // fine sessione. Default ON. Le soluzioni NON viaggiano durante il gioco.
      revealAnswers: cfg.revealAnswers !== false,
      // «Correggi subito» (20/8): il VERDETTO su ciò che lo studente ha già
      // mandato torna con la risposta, insieme alla spiegazione. Le soluzioni
      // continuano a NON viaggiare: `publicQuestions` le strippa comunque, e chi
      // non ha risposto non riceve niente. Default SPENTO — con la correzione
      // immediata si smette di ragionare e si tira a indovinare finché non
      // diventa verde, e in classe è una scelta del docente, non dell'app.
      feedbackImmediato: cfg.feedbackImmediato === true,
      build: (cfg.mode === 'build' && cfg.build) ? {
        gaps: Array.isArray(cfg.build.gaps) ? cfg.build.gaps : [],
        freeAllowed: cfg.build.freeAllowed !== false,
        maxProposals: Number(cfg.build.maxProposals) > 0 ? Number(cfg.build.maxProposals) : 3,
        sourceYears: Array.isArray(cfg.build.sourceYears) ? cfg.build.sourceYears : [],
        poolKeys: Array.isArray(cfg.build.poolKeys) ? cfg.build.poolKeys : []   // dedup lato server
      } : null,
      token: token(10),
      adminToken: token(16),
      phase: 'lobby',            // lobby → running → closed
      startedAt: new Date().toISOString(),
      runningAt: null, endsAt: null, closedAt: null
    };
    roster = Array.isArray(opts.roster) ? opts.roster : [];
    // valida/normalizza le domande in ingresso; assegna idx stabile
    // ⚠️ In modalità «scelta» le `questions` NON sono domande di quiz: sono il
    // POOL del core (`poolDaFogli`), con angolo e soluzione. Passano intatte —
    // `validateQuestion` le sfigurerebbe — e non vengono MAI servite così: al
    // telefono va il sottoinsieme campionato, ripulito da `SC.pubblico`.
    questions = (Array.isArray(opts.questions) ? opts.questions : []).map((q, i) => {
      if (session.mode === 'scelta') return q;
      const v = LC.validateQuestion(q);
      const base = v.ok ? v.clean : q;
      return Object.assign({}, base, { idx: i });
    });
    fs.writeFileSync(questionsFile, JSON.stringify(questions, null, 2));
    persist();
  }

  function persist() {
    fs.writeFileSync(sessionFile, JSON.stringify({
      schema: 'mappai-live-session@1', session, roster,
      questionCount: questions.length,
      students: Object.keys(students)
    }, null, 2));
  }

  function persistStudent(id) {
    fs.writeFileSync(path.join(studentsDir, id + '.json'), JSON.stringify(students[id], null, 2));
  }

  function rosterEntry(emojiKey, num) {
    const key = LC.identityKey(emojiKey, num);
    return roster.find(r => LC.identityKey(r.emojiKey, r.num) === key) || null;
  }

  // Timeline Live (008): identità dello studente secondo lo schema di login.
  // Individuale → emoji+numero (roster); a gruppi → slug del nickname.
  function pid(body) {
    return session.loginMode === 'group'
      ? LC.slugify(String(body.nick || ''))
      : LC.identityKey(body.emojiKey, body.num);
  }
  // ── «Domande a scelta»: il pool di UNO studente ─────────────────────────
  // Il campionamento (una domanda per coppia area × angolo) è del SERVER e per
  // studente: servire 175 domande per mostrarne 14 vorrebbe dire mandare al
  // telefono proprio quello che l'attività ha deciso di non fare, angolo
  // compreso. ⚠️ Si PERSISTE la scelta (gli id): al rientro deve ritrovare le
  // SUE domande, e il seme da solo non basta — un foglio in più nel vault
  // sposterebbe tutto.
  function poolDi(id, st) {
    if (st.poolIds && st.poolIds.length) {
      const per = {};
      questions.forEach(v => { per[v.id] = v; });
      const out = st.poolIds.map(i => per[i]).filter(Boolean);
      if (out.length) return out;
    }
    const scelto = SC.unaPerAngolo(questions, id);
    // ⚠️ MAI riscrivere a vuoto: se le domande non si sono rilette (file perso,
    // scrittura a metà), un `poolIds` azzerato farebbe scartare a
    // `normalizzaStato` tutte le risposte già su disco al primo salvataggio.
    if (scelto.length) st.poolIds = scelto.map(v => v.id);
    return scelto;
  }
  // ⚠️ `fase` vuota: da dove si parte lo decide la superficie (col percorso a
  // tre passi si atterra sulle AREE), non un ripiego scritto qui.
  /* Il verdetto su UNA risposta appena arrivata. Vive qui perché è l'unico
     posto che ha le soluzioni (inv. 6): al telefono va l'esito di ciò che ha
     già mandato, mai la chiave per indovinare. Con la leva spenta torna null e
     non cambia niente rispetto a prima. */
  function verdettoSu(q, a) {
    if (!session.feedbackImmediato || !q || !a) return null;
    const g = LC.gradeAnswer(q, a);
    // ⚠️ `manual` è «la corregge il docente» (una domanda aperta senza soluzione
    // attesa): dirgli «sbagliato» sarebbe una bugia, e bloccargli la risposta
    // gliela toglierebbe di mano. Niente verdetto, come per una domanda vuota.
    if (!g || g.outcome === 'blank' || g.outcome === 'manual') return null;
    const out = { esito: g.outcome, punteggio: g.score };
    if (g.outcome !== 'right') out.giusta = LC.correctText(q);
    if (q.explanation) out.spiegazione = q.explanation;
    return out;
  }

  function statoDi(st) { return st.stato || { aree: [], fase: '', letture: {}, risposte: {}, bozze: {}, note: '' }; }

  // Tutte le proposte (modalità Costruisci), con autore.
  function allProposals() {
    const out = [];
    Object.keys(students).forEach(id => {
      (students[id].proposals || []).forEach(pr => out.push(Object.assign({ author: id }, pr)));
    });
    return out;
  }

  // guardia lazy: se il timer è scaduto (o è stato perso), chiudi ora
  function checkExpiry() {
    if (session.phase === 'running' && session.endsAt && Date.now() >= new Date(session.endsAt).getTime()) {
      closeSession();
    }
  }

  function armTimer() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (session.phase !== 'running' || !session.endsAt) return;
    const ms = new Date(session.endsAt).getTime() - Date.now();
    if (ms <= 0) { closeSession(); return; }
    closeTimer = setTimeout(closeSession, ms);
    if (closeTimer.unref) closeTimer.unref();   // non tiene vivo il processo nei test
  }

  function meta() {
    let dur = '';
    if (session.runningAt && session.closedAt) {
      const mins = Math.round((new Date(session.closedAt) - new Date(session.runningAt)) / 60000);
      dur = 'Durata ' + mins + ' min';
    } else if (session.durationMin) dur = 'Timer ' + session.durationMin + ' min';
    const d = new Date(session.startedAt);
    function p(n) { return String(n).padStart(2, '0'); }
    return {
      mapTitle: session.name, activity: session.activity, className: session.className,
      dateStr: p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(),
      durationStr: dur
    };
  }

  function closeSession() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (session.phase === 'closed') return;   // idempotente
    session.phase = 'closed';
    session.closedAt = new Date().toISOString();
    if (session.mode === 'build') {
      // Timeline Costruisci: report proposte per allievo + timeline finale.
      const proposals = allProposals();
      const byAuthor = {};
      Object.keys(students).forEach(id => {
        const st = students[id];
        byAuthor[id] = {
          displayName: LC.displayName(st) || id,
          proposals: (st.proposals || []).slice()
        };
      });
      const approved = proposals.filter(p => p.status === 'approved');
      const results = {
        mode: 'build', joined: Object.keys(students).length,
        proposals, byAuthor, approved,
        counts: {
          total: proposals.length,
          approved: approved.length,
          rejected: proposals.filter(p => p.status === 'rejected').length,
          pending: proposals.filter(p => p.status === 'pending').length
        }
      };
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(dir, 'report-costruzione.html'), LR.buildTimelineWorkshopReportHtml(meta(), results));
    } else if (session.mode === 'scelta') {
      // Un allievo alla volta, ognuno col SUO pool campionato: il profilo di
      // due studenti non è confrontabile domanda per domanda, e va bene così —
      // quello che si confronta sono i tagli e le aree.
      const perAllievo = Object.keys(students).map(id => {
        const st = students[id];
        const mio = poolDi(id, st);
        return {
          id, displayName: LC.displayName(st) || id,
          consegnato: !!st.finishedAt,
          aree: ((st.stato && st.stato.aree) || []).slice(),
          note: (st.stato && st.stato.note) || '',
          // la riga del «perché no?»: si raccoglieva e si perdeva. Nel report
          // va il TESTO della domanda, non il suo id: un id non dice niente a
          // chi legge.
          evitata: (function (e) {
            if (!e) return null;
            const q = mio.find(v => v.id === e.id);
            return { testo: q ? q.testo : '', angle: q ? (q.angle || '') : '', why: e.why || '' };
          }((st.stato && st.stato.evitata) || null)),
          profilo: SC.profilo(mio, statoDi(st)),
          // le risposte col loro angolo e il giudizio di richiamo: è il report
          risposte: mio.filter(v => statoDi(st).risposte[v.id]).map(v => {
            const r = statoDi(st).risposte[v.id] || {};
            const l = (statoDi(st).letture || {})[v.id] || {};
            return {
              testo: v.testo, angle: v.angle || '', ramo: v.ramo || '',
              risposta: (v.tipo === 'mc' && r.scelta != null) ? ((v.opzioni || [])[r.scelta] || '') : (r.testo || ''),
              giusta: (v.tipo === 'mc' && v.giusta >= 0) ? ((v.opzioni || [])[v.giusta] || '') : '',
              corretta: (v.tipo === 'mc' && v.giusta >= 0) ? (r.scelta === v.giusta) : null,
              chip: l.chip || '', nota: l.nota || '', auto: r.auto || 0
            };
          }),
          // i richiami che ha letto e non l'hanno acceso: il dato per cui
          // l'attività esiste, e si perde se si guardano solo le risposte
          spenti: mio.filter(v => {
            const l = (statoDi(st).letture || {})[v.id];
            return l && l.chip && !SC.accende(l.chip);
          }).map(v => ({ testo: v.testo, angle: v.angle || '', chip: (statoDi(st).letture[v.id] || {}).chip }))
        };
      });
      const stati = Object.keys(students).map(id => statoDi(students[id]));
      // il calore si calcola sul pool INTERO: le aree e gli angoli sono gli
      // stessi per tutti, sono le domande a essere campionate
      const results = {
        mode: 'scelta', joined: Object.keys(students).length,
        consegnato: perAllievo.filter(a => a.consegnato).length,
        byStudent: perAllievo,
        angoli: SC.calorClasse(questions, stati),
        aree: SC.calorAree(questions, stati)
      };
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(dir, 'report-scelta.html'), LR.buildSceltaReportHtml(meta(), results));
    } else {
      const results = LC.computeResults(questions, Object.values(students), roster);
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(dir, 'report-domande.html'), LR.buildQuestionsReportHtml(meta(), results));
      fs.writeFileSync(path.join(dir, 'report-studenti.html'), LR.buildStudentsReportHtml(meta(), results));
    }
    persist();
    console.log('[live-server] sessione CHIUSA:', session.name, '· report generati');
  }

  // riprendi il timer dopo una RIPRESA da disco
  armTimer();

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    checkExpiry();

    if (p === '/') {
      // ogni modalità ha la sua pagina: il QR punta alla radice e il server sa
      // dove mandare (una sola cosa da tenere allineata, non due URL)
      const pagina = session.mode === 'scelta' ? 'scelta.html'
        : session.mode === 'build' ? 'timeline-build.html' : 'student.html';
      res.writeHead(302, { Location: '/public/live/' + pagina + '?s=' + session.token });
      res.end(); return;
    }

    if (p.startsWith('/api/')) {
      const isAdmin = (t) => t && t === session.adminToken;
      const okToken = (t) => t === session.token || isAdmin(t);

      if (p === '/api/session' && req.method === 'GET') {
        if (!okToken(u.searchParams.get('s'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          schema: 'mappai-live-session@1',
          name: session.name, activity: session.activity, className: session.className,
          phase: session.phase, questionCount: questions.length,
          endsAt: session.endsAt, emojiSet: LC.EMOJI_SET,
          // Timeline Live (008): mode/login/hint per il player; build SENZA sourceYears
          // (mai esposti: servono solo al server per il flag yearNotInSources).
          mode: session.mode, loginMode: session.loginMode, hintMode: session.hintMode,
          scelta: session.scelta || null,
          feedbackImmediato: !!session.feedbackImmediato,
          build: session.build ? {
            gaps: session.build.gaps, freeAllowed: session.build.freeAllowed,
            maxProposals: session.build.maxProposals
          } : null
        });
      }

      if (p === '/api/status' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) return json(res, 403, { error: 'token' });
        const now = Date.now();
        return json(res, 200, {
          session: {
            name: session.name, activity: session.activity, className: session.className,
            phase: session.phase, startedAt: session.startedAt, endsAt: session.endsAt,
            durationMin: session.durationMin
          },
          msLeft: session.endsAt ? Math.max(0, new Date(session.endsAt).getTime() - now) : null,
          roster: roster.map(r => {
            const st = students[LC.identityKey(r.emojiKey, r.num)];
            const answered = st
              ? (session.mode === 'scelta'
                  // scritte, non «prese»: una domanda presa e lasciata vuota
                  // non è una risposta, e la colonna dice «risposte»
                  ? SC.conteggio(poolDi(LC.identityKey(r.emojiKey, r.num), st), st.stato).scritte
                  : Object.keys(st.answers || {}).length)
              : 0;
            return {
              emojiKey: r.emojiKey, emoji: (LC.emojiByKey(r.emojiKey) || {}).emoji || '?',
              num: r.num, name: r.name || '',
              joined: !!(st && st.deviceId), answered,
              finished: !!(st && st.finishedAt), present: !!st
            };
          }),
          joined: Object.keys(students).length,
          // Timeline Costruisci: proposte per la dashboard di revisione + proiezione LIM
          proposals: session.mode === 'build' ? allProposals() : undefined
        });
      }

      // Risultato del SOLO studente richiedente (dashboard a fine sessione / reload).
      // Gated: token sessione + identità + deviceId corrispondente. Soluzioni solo se
      // revealAnswers e lo studente ha consegnato (o la sessione è chiusa).
      if (p === '/api/my-result' && req.method === 'GET') {
        if (u.searchParams.get('s') !== session.token) return json(res, 403, { error: 'token' });
        // in «a scelta» non esistono risposte da graduare: `computeStudentResult`
        // qui produrrebbe 200 con dati finti, che è peggio di un no
        if (session.mode === 'scelta') return json(res, 404, { error: 'not-quiz' });
        const id = pid({ nick: u.searchParams.get('nick'), emojiKey: u.searchParams.get('emojiKey'), num: u.searchParams.get('num') });
        const st = students[id];
        if (!st) return json(res, 404, { error: 'not-joined' });
        if (st.deviceId !== u.searchParams.get('deviceId')) return json(res, 403, { error: 'not-your-identity' });
        const submitted = !!st.finishedAt || session.phase === 'closed';
        const reveal = !!session.revealAnswers && submitted;   // niente soluzioni prima della consegna
        return json(res, 200, { revealAnswers: !!session.revealAnswers, submitted, phase: session.phase,
          result: LC.computeStudentResult(questions, st, { reveal }) });
      }

      if (p === '/api/report' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) { res.writeHead(403); res.end('forbidden'); return; }
        const w = u.searchParams.get('which');
        const which = w === 'students' ? 'report-studenti.html'
          : w === 'workshop' ? 'report-costruzione.html'
          : w === 'scelta' ? 'report-scelta.html'
          : 'report-domande.html';
        const f = path.join(dir, which);
        if (!fs.existsSync(f)) { res.writeHead(404); res.end('report non ancora generato'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(f)); return;
      }

      if (req.method === 'POST') {
        return readBody(req, (err, body) => {
          if (err) return json(res, 400, { error: 'bad-json' });

          // ── studente: entra nella sessione ──
          if (p === '/api/join') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            if (!body.deviceId || typeof body.deviceId !== 'string') return json(res, 400, { error: 'bad-device' });
            let id, st;
            if (session.loginMode === 'group') {
              // Timeline Live (008): login a gruppi (nickname condiviso, come Lavagna).
              const nick = LC.sanitizeText(body.nick, LC.LIMITS.nameMax);
              if (!nick) return json(res, 400, { error: 'bad-nick' });
              id = LC.slugify(nick);
              st = students[id];
              if (st && st.deviceId && st.deviceId !== body.deviceId) return json(res, 409, { error: 'identity-taken' });
              if (!st) st = students[id] = { group: true, name: nick, deviceId: body.deviceId, joinedAt: new Date().toISOString(), finishedAt: null, answers: {} };
              else st.deviceId = body.deviceId;
            } else {
              const rEntry = rosterEntry(body.emojiKey, body.num);
              if (!rEntry) return json(res, 404, { error: 'not-in-roster' });
              id = LC.identityKey(body.emojiKey, body.num);
              st = students[id];
              if (st && st.deviceId && st.deviceId !== body.deviceId) {
                return json(res, 409, { error: 'identity-taken' });   // stessa identità, ALTRO device
              }
              if (!st) {
                st = students[id] = {
                  emojiKey: rEntry.emojiKey, num: rEntry.num, name: rEntry.name || '',
                  deviceId: body.deviceId, joinedAt: new Date().toISOString(),
                  finishedAt: null, answers: {}
                };
              } else {
                st.deviceId = body.deviceId;   // adozione dopo release, o rientro stesso device
              }
            }
            if (session.mode === 'scelta') {
              const mio = poolDi(id, st);
              persistStudent(id); persist();
              return json(res, 200, {
                ok: true, displayName: LC.displayName(st), phase: session.phase,
                // il pool campionato e SENZA angolo né soluzioni: `pubblico` è
                // l'unica porta, come `publicQuestions` per il quiz
                pool: SC.pubblico(mio), stato: statoDi(st), cfg: session.scelta,
                // ⚠️ i verdetti stanno sul SERVER: al rientro tornano di qui,
                // altrimenti un ricaricamento sbloccherebbe le domande già
                // corrette (e il contatore ripartirebbe da zero)
                verdetti: st.verdetti || {}
              });
            }
            persistStudent(id); persist();
            return json(res, 200, {
              ok: true, displayName: LC.displayName(st), phase: session.phase,
              questions: LC.publicQuestions(questions), answers: st.answers || {},
              proposals: st.proposals || []   // Timeline Costruisci: ripresa proposte
            });
          }

          // ── studente (Costruisci): invia una proposta di data ──
          if (p === '/api/propose') {
            if (session.mode !== 'build') return json(res, 404, { error: 'not-build' });
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = pid(body);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const v = TC.validateProposal(body);
            if (!v.ok) return json(res, 422, { error: 'bad-proposal', details: v.errors });
            st.proposals = st.proposals || [];
            if (TC.countActive(st.proposals, id) >= (session.build ? session.build.maxProposals : 3)) {
              return json(res, 429, { error: 'proposal-cap' });
            }
            const bld = session.build || {};
            const flags = {};
            const key = TC.eventKey(v.clean);
            const dupPool = (bld.poolKeys || []).indexOf(key) >= 0;
            const dupProp = allProposals().some(pr => pr.status !== 'rejected' && TC.eventKey(pr) === key);
            if (dupPool || dupProp) flags.duplicate = true;
            if (Array.isArray(bld.sourceYears) && bld.sourceYears.indexOf(v.clean.anno) < 0) flags.yearNotInSources = true;
            const proposal = {
              id: 'pr_' + token(8), author: id, anno: v.clean.anno, evento: v.clean.evento,
              contesto: v.clean.contesto, gapYear: v.clean.gapYear,
              status: 'pending', flags: flags, ts: Date.now()
            };
            st.proposals.push(proposal);
            persistStudent(id);
            return json(res, 200, { ok: true, proposal: proposal });
          }

          // ── docente (Costruisci): approva/boccia una proposta ──
          if (p === '/api/review') {
            if (session.mode !== 'build') return json(res, 404, { error: 'not-build' });
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            const action = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : null;
            if (!action) return json(res, 400, { error: 'bad-action' });
            let found = null, ownerId = null;
            Object.keys(students).forEach(sid => {
              (students[sid].proposals || []).forEach(pr => { if (pr.id === body.proposalId) { found = pr; ownerId = sid; } });
            });
            if (!found) return json(res, 404, { error: 'no-proposal' });
            if (found.status !== 'pending' && found.status !== action) return json(res, 409, { error: 'already-reviewed' });
            found.status = action;
            persistStudent(ownerId);
            return json(res, 200, { ok: true, proposal: Object.assign({ author: ownerId }, found) });
          }

          // ── studente («a scelta»): salva lo STATO intero ──
          // Non passa da /api/answer, ed è la ragione: qui non si salva «una
          // risposta» ma un percorso — le aree dichiarate, a che punto è, che
          // cosa gli ha acceso ogni domanda LETTA (anche quelle che non ha
          // preso) e le risposte. La view consegna già lo stato intero a ogni
          // salvataggio; spezzarlo in chiamate per-domanda vorrebbe dire
          // inventare una `answer` senza `qIdx`.
          // ⚠️ Ciò che arriva è del telefono: si tiene solo quello che il core
          // riconosce, e SOLO sul pool campionato di quello studente.
          if (p === '/api/stato') {
            if (session.mode !== 'scelta') return json(res, 404, { error: 'not-scelta' });
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = pid(body);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const poolMio = poolDi(id, st);
            const nuovo = SC.normalizzaStato(poolMio, body.stato);
            /* ⚠️ Le risposte già corrette non si riscrivono: il verdetto le ha
               chiuse. Si rimettono quelle vecchie sopra quelle in arrivo, invece
               di rifiutare tutto lo stato — qui il corpo è il PERCORSO intero, e
               rifiutarlo butterebbe anche le letture e le aree. */
            st.verdetti = st.verdetti || {};
            Object.keys(st.verdetti).forEach(function (k) {
              const prima = (st.stato && st.stato.risposte) ? st.stato.risposte[k] : null;
              if (prima) nuovo.risposte[k] = prima;
            });
            st.stato = nuovo;
            st.stato.updatedAt = Date.now();
            // ⚠️ `dopoConsegna` = quello che si scrive NELLA schermata di esito
            // (il «perché no?»). Senza questo distinguo la consegna si annullava
            // a ogni tasto premuto, e la dashboard perdeva la spunta.
            if (!body.dopoConsegna) st.finishedAt = null;   // ha ripreso a lavorare
            persistStudent(id);
            const mioPool = poolDi(id, st);
            const n = SC.conteggio(mioPool, st.stato);
            /* Il verdetto della SOLA domanda che il client dichiara di aver
               appena risposto (`id`), e solo se è a scelta multipla: su una
               domanda aperta non c'è niente da correggere qui. */
            let verdetto = null;
            if (session.feedbackImmediato && body.id) {
              const idQ = String(body.id);
              if (st.verdetti[idQ]) verdetto = st.verdetti[idQ];   // già corretta: si ridà quello
              else {
                const v = mioPool.find(x => x.id === idQ);
                const ok = SC.corretta(v, (st.stato.risposte || {})[idQ]);
                if (ok !== null) {
                  verdetto = { esito: ok ? 'right' : 'wrong', punteggio: ok ? 1 : 0 };
                  if (!ok) verdetto.giusta = (v.opzioni || [])[v.giusta] || '';
                  if (v.spiegazione) verdetto.spiegazione = v.spiegazione;
                  st.verdetti[idQ] = verdetto;
                }
              }
              persistStudent(id);
            }
            return json(res, 200, { ok: true, conteggio: n, verdetto: verdetto });
          }

          // ── studente: salva una risposta (autosave, sovrascrivibile) ──
          if (p === '/api/answer') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = pid(body);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            if (session.phase === 'lobby') return json(res, 409, { error: 'not-running' });
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const qIdx = Number(body.qIdx);
            const q = questions.find(x => x.idx === qIdx);
            if (!q) return json(res, 400, { error: 'bad-question' });
            const a = LC.cleanAnswer(q, body);
            if (!a) return json(res, 400, { error: 'bad-answer' });
            st.answers = st.answers || {};
            /* ⚠️ Una risposta GIÀ CORRETTA è definitiva, e la regola vive QUI —
               non nel telefono. Col verdetto in mano si poteva tirare a caso,
               leggere la soluzione e riscrivere: il report del docente dava
               100%. Il blocco lato client resta (è l'interfaccia), ma non è lui
               a difendere il dato. Vale anche per «Salta», che cancellava una
               risposta giusta. */
            const vecchia = st.answers[qIdx];
            if (session.feedbackImmediato && vecchia && vecchia.verdetto) {
              return json(res, 409, { error: 'already-graded', verdetto: vecchia.verdetto });
            }
            a.updatedAt = Date.now();
            const v = verdettoSu(q, a);
            if (v) a.verdetto = v;             // viaggia col rientro: il join riconsegna `answers`
            st.answers[qIdx] = a;              // Indietro = sovrascrittura (finché non è corretta)
            st.finishedAt = null;              // ha ripreso a rispondere
            persistStudent(id);
            return json(res, 200, { ok: true, saved: qIdx, answered: Object.keys(st.answers).length,
              verdetto: v });
          }

          // ── studente: consegna (può ancora riaprire fino a chiusura) ──
          if (p === '/api/finish') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = pid(body);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            st.finishedAt = new Date().toISOString();
            if (session.mode === 'scelta') {
              // l'ultimo stato viaggia con la consegna (l'ultimo autosave può
              // non essere partito: 600ms di debounce contro un tocco)
              if (body.stato) st.stato = SC.normalizzaStato(poolDi(id, st), body.stato);
              persistStudent(id);
              const mio = poolDi(id, st);
              const cfg = session.scelta || SC.normalizzaCfg({});
              // il profilo dice gli ANGOLI: esce solo ora, e solo se il docente
              // ha lasciato acceso il reveal — prima della consegna l'angolo
              // resta sul server come le soluzioni del quiz
              const rivela = !!cfg.reveal;
              return json(res, 200, {
                ok: true, reveal: rivela,
                profilo: rivela ? SC.profilo(mio, statoDi(st)) : null,
                // ⚠️ anche l'evitata esce da `SC.pubblico`: è la domanda che lo
                // studente sta per RIAPRIRE col secondo giro, e mandargliela
                // grezza vorrebbe dire mandargli la soluzione. L'angolo sì: a
                // consegna fatta è il senso del reveal.
                evitata: (rivela && (cfg.perche_no || cfg.secondo_giro)) ? (function (v) {
                  return v ? Object.assign(SC.pubblico([v])[0], { angle: v.angle || '' }) : null;
                }(SC.evitata(mio, statoDi(st), id))) : null
              });
            }
            persistStudent(id);
            // Feedback immediato: il risultato dello studente (solo il SUO), con soluzioni
            // se il docente ha attivato revealAnswers. Le soluzioni non erano mai state
            // inviate durante il gioco (publicQuestions le strippa).
            const result = LC.computeStudentResult(questions, st, { reveal: session.revealAnswers });
            return json(res, 200, { ok: true, revealAnswers: !!session.revealAnswers, result });
          }

          // ── docente: cambia fase (avvia le domande) ──
          if (p === '/api/phase') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            if (body.phase === 'running' && session.phase === 'lobby') {
              session.phase = 'running';
              session.runningAt = new Date().toISOString();
              if (session.durationMin > 0) session.endsAt = new Date(Date.now() + session.durationMin * 60000).toISOString();
              persist(); armTimer();
              return json(res, 200, { ok: true, phase: session.phase, endsAt: session.endsAt });
            }
            return json(res, 400, { error: 'bad-phase' });
          }

          // ── docente: sblocca un'identità (device staccato) ──
          if (p === '/api/release') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            const id = LC.identityKey(body.emojiKey, body.num);
            if (students[id]) { students[id].deviceId = null; persistStudent(id); persist(); }
            return json(res, 200, { ok: true });
          }

          // ── docente: chiudi la sessione (genera i report) ──
          if (p === '/api/close') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            closeSession();
            return json(res, 200, { ok: true, phase: session.phase });
          }

          return json(res, 404, { error: 'no-such-api' });
        });
      }
      return json(res, 404, { error: 'no-such-api' });
    }

    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    serveStatic(p, res);
  });

  return {
    listen(port, host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host || '0.0.0.0', () => resolve(server.address().port));
      });
    },
    stop() { if (closeTimer) clearTimeout(closeTimer); return new Promise(r => server.close(r)); },
    closeSession,   // esposto per test/uso diretto
    state() {
      return {
        session: {
          name: session.name, activity: session.activity, className: session.className,
          token: session.token, adminToken: session.adminToken,
          phase: session.phase, startedAt: session.startedAt, endsAt: session.endsAt
        },
        questionCount: questions.length,
        joined: Object.keys(students).length,
        roster: roster.length
      };
    }
  };
}

// ═══════════════════════════ SERVER MATERIALI ══════════════════════════════
// Nessun login: il token nel QR è l'unico gate. Serve solo i file in <dir>/materials.
function createMaterialsServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const filesDir = path.join(dir, 'materials');
  fs.mkdirSync(filesDir, { recursive: true });
  const serveStatic = makeServeStatic(repoRoot);
  const sessionFile = path.join(dir, 'session.json');
  /* ── Lo scambio con MappAI studente (7/9) ─────────────────────────────────
     Un VAULT esposto per sessione (manifest in memoria e in <dir>/vault.json,
     crash-safe come session.json): l'app studente legge `/api/vault` e scarica
     i file uno a uno da `/vault/<rel>` — solo i rel ELENCATI, mai un cammino
     libero. E `POST /api/consegna`: l'allievo manda il PDF delle risposte, che
     finisce nel vault del docente in Consegne/<studente>/. `opts.scambio:false`
     spegne tutto (kill-switch dal renderer). */
  const scambio = opts.scambio !== false;
  const vaultFile = path.join(dir, 'vault.json');
  const CONSEGNA_CAP = 20 * 1024 * 1024;
  let vault = null;                 // { nome, dir, classe, materia, rootNodeLabel, files:[{rel,size,sha1}] }
  let vaultSet = new Set();
  if (scambio && fs.existsSync(vaultFile) && !opts.fresh) {
    try { vault = JSON.parse(fs.readFileSync(vaultFile, 'utf8')); vaultSet = new Set((vault.files || []).map(f => f.rel)); } catch (e) { vault = null; }
  }
  function esponiVault(v) {
    if (!scambio || !v || !v.dir || !fs.existsSync(v.dir)) return null;
    const files = [];
    (function walk(abs, rel) {
      let ents = []; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
      ents.forEach(ent => {
        const r = rel ? rel + '/' + ent.name : ent.name;
        if (ent.isDirectory()) { if (ent.name.charAt(0) !== '.') walk(path.join(abs, ent.name), r); return; }
        if (!ent.isFile()) return;
        const ok = FC.relVaultStudente(r); if (!ok) return;
        try {
          const buf = fs.readFileSync(path.join(abs, ent.name));
          files.push({ rel: ok, size: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex') });
        } catch (e) { /* illeggibile: non si elenca */ }
      });
    })(v.dir, '');
    files.sort((a, b) => a.rel.localeCompare(b.rel));
    vault = {
      schema: 'mappai-vault-manifest@1', nome: String(v.nome || path.basename(v.dir)), dir: v.dir,
      classe: v.classe || null, materia: v.materia || null, rootNodeLabel: v.rootNodeLabel || '',
      totale: files.reduce((n, f) => n + f.size, 0), files
    };
    vaultSet = new Set(files.map(f => f.rel));
    try { fs.writeFileSync(vaultFile, JSON.stringify(vault, null, 2)); } catch (e) { /* solo memoria */ }
    return manifestPubblico();
  }
  function manifestPubblico() {
    if (!vault) return null;
    const { dir: _d, ...pub } = vault;   // la cartella del Mac non viaggia
    return pub;
  }
  /* la consegna: nome sicuro, mai sovrascrivere */
  function scriviConsegna(b) {
    const ident = FC.identitaStudente(b.numero != null ? b.numero : (b.studente && b.studente.numero), b.classe != null ? b.classe : (b.studente && b.studente.classe));
    if (!ident) return { code: 400, body: { error: 'studente' } };
    const nome = path.basename(String(b.nome || '')).replace(/^\.+/, '');
    if (!nome || !/^[^\/\\]+$/.test(nome) || FC.safeName(nome, '') !== nome) return { code: 400, body: { error: 'nome' } };
    if (typeof b.base64 !== 'string' || !b.base64) return { code: 400, body: { error: 'contenuto' } };
    const vaultDir = opts.vaultDir ? opts.vaultDir(String(b.vault || '')) : null;
    if (!vaultDir || !fs.existsSync(vaultDir)) return { code: 404, body: { error: 'vault' } };
    let buf; try { buf = Buffer.from(b.base64, 'base64'); } catch (e) { return { code: 400, body: { error: 'contenuto' } }; }
    const cart = path.join(vaultDir, FC.CONSEGNE, ident.id);
    fs.mkdirSync(cart, { recursive: true });
    const sess = FC.safeName(String(b.sessione || ''), '');
    const base = (sess ? sess + ' - ' : '') + nome;
    const ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
    let fin = base, n = 2;
    while (fs.existsSync(path.join(cart, fin))) { fin = stem + ' (' + n + ')' + ext; n++; }
    fs.writeFileSync(path.join(cart, fin), buf);
    const rel = FC.CONSEGNE + '/' + ident.id + '/' + fin;
    const info = { ok: true, rel, size: buf.length, studente: ident.id, vault: String(b.vault || ''), vaultDir };
    if (opts.onConsegna) { try { opts.onConsegna(info); } catch (e) { /* il renderer non c'è */ } }
    return { code: 200, body: { ok: true, rel, size: buf.length, studente: ident.id } };
  }

  let session;
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    session = JSON.parse(fs.readFileSync(sessionFile, 'utf8')).session;
  } else {
    session = {
      schema: 'mappai-live-materials@1',
      name: (opts.session && opts.session.name) || 'Materiali',
      token: token(10), adminToken: token(16),
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(sessionFile, JSON.stringify({ schema: 'mappai-live-materials@1', session }, null, 2));
  }

  function listFiles() {
    return fs.readdirSync(filesDir).filter(f => !f.startsWith('.')).map(f => {
      const st = fs.statSync(path.join(filesDir, f));
      return { file: f, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    /* CORS: l'app studente chiama da `capacitor://localhost`, un'origine che
       non si può prevedere per IP; il gate resta il token. */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const tokenOk = u.searchParams.get('s') === session.token || u.searchParams.get('s') === session.adminToken;

    if (p === '/') {
      res.writeHead(302, { Location: '/public/live/materials.html?s=' + session.token });
      res.end(); return;
    }

    if (p === '/api/vault' && req.method === 'GET') {
      if (!tokenOk) return json(res, 403, { error: 'token' });
      if (!scambio || !vault) return json(res, 404, { error: 'nessun-vault' });
      return json(res, 200, manifestPubblico());
    }
    if (p.startsWith('/vault/') && req.method === 'GET') {
      if (!tokenOk) { res.writeHead(403); res.end('forbidden'); return; }
      let rel = ''; try { rel = decodeURIComponent(p.slice('/vault/'.length)); } catch (e) { rel = ''; }
      if (!scambio || !vault || !vaultSet.has(rel)) { res.writeHead(404); res.end('not found'); return; }
      const file = path.join(vault.dir, ...rel.split('/'));
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(file)); return;
    }
    if (p === '/api/consegna' && req.method === 'POST') {
      if (!tokenOk) return json(res, 403, { error: 'token' });
      if (!scambio) return json(res, 404, { error: 'scambio-spento' });
      let chiuso = false;
      req.on('close', () => { if (!chiuso && req.destroyed && !res.headersSent) { try { json(res, 413, { error: 'troppo-grande' }); } catch (e) { } } });
      return readBody(req, (err, b) => {
        chiuso = true;
        if (err) return json(res, 400, { error: 'json' });
        const r = scriviConsegna(b || {});
        return json(res, r.code, r.body);
      }, CONSEGNA_CAP);
    }

    if (p === '/api/materials' && req.method === 'GET') {
      if (u.searchParams.get('s') !== session.token && u.searchParams.get('s') !== session.adminToken) {
        return json(res, 403, { error: 'token' });
      }
      return json(res, 200, { name: session.name, files: listFiles() });
    }

    // download: solo basename dentro filesDir (traversal impossibile per costruzione)
    if (p.startsWith('/files/') && req.method === 'GET') {
      if (u.searchParams.get('s') !== session.token && u.searchParams.get('s') !== session.adminToken) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const name = path.basename(decodeURIComponent(p.slice('/files/'.length)));
      const file = path.join(filesDir, name);
      if (!file.startsWith(filesDir) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      // ?inline=1 → anteprima nel browser (pagina file.html); default = download
      const inline = u.searchParams.get('inline') === '1';
      if (ext !== '.html' && !inline) headers['Content-Disposition'] = 'attachment; filename="' + name.replace(/"/g, '') + '"';
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file)); return;
    }

    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    serveStatic(p, res);
  });

  return {
    listen(port, host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host || '0.0.0.0', () => resolve(server.address().port));
      });
    },
    stop() { return new Promise(r => server.close(r)); },
    filesDir,
    esponiVault,
    state() {
      return {
        session: { name: session.name, token: session.token, adminToken: session.adminToken, startedAt: session.startedAt },
        files: listFiles(),
        vault: vault ? { nome: vault.nome, rootNodeLabel: vault.rootNodeLabel, n: vault.files.length, totale: vault.totale } : null
      };
    }
  };
}

module.exports = { createLiveServer, createMaterialsServer };
