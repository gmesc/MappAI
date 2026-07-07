/*
 * mappai-npc-behavior.js — behaviors PURI degli NPC del giardino (testabile in Node)
 * ------------------------------------------------------------------------------------
 * NPC System SDS §6: state machine IDLE ⇄ WALK → TURN_TO_PLAYER (il TALK lo gestisce il
 * gioco: DUN.busy pausa il tick). Deterministico: seededRng dal nome mappa → stessa
 * coreografia per tutta la classe. Zero DOM/localStorage/appState.
 *
 * API:
 *   strSeed(str)            → intero (hash imul, stesso schema di _mapSig)
 *   mulberry32(seed)        → rng() in [0,1) riproducibile
 *   PERSONALITIES           → catalogo archetipi Sapiente (tono + cadenza motoria)
 *   pickPersonality(seed)   → archetipo deterministico da un seed (nodo+mappa)
 *   mkBehavior(type, x, y, radius, persona?) → stato behavior iniziale
 *   stepNpc(beh, opts)      → muta beh (state/x/y/nextT/faceLeft), ritorna true se mosso
 *     opts: { now, rng, walkable(x,y), playerDist, triggerRadius=2 }
 *   pickEmoteTerm(label, desc, rng) → termine-chiave per l'emote-bubble (priming passivo)
 *
 * PERSONALITÀ (runtime, MAI un campo del contratto mappe): ogni Sapiente eredita da
 * `persona` la cadenza dei passi (pauseProb/stepMs/idleMs), il raggio di gironzolìo e
 * il `tone` con cui parla (usato dal prompt NPC nel gioco). Derivata deterministicamente
 * dal nodo+mappa → lo stesso Sapiente ha lo stesso carattere per tutta la classe.
 *
 * Regole stepNpc:
 *   - type 'static'                → resta IDLE, mai si muove.
 *   - playerDist ≤ triggerRadius   → state 'TURN' (si volta verso il player), mai si muove.
 *   - cadenza: nessuna decisione prima di beh.nextT (passi lenti, pause vere).
 *   - 'wander': con prob. `beh.pauseProb` (default 0.5) pausa IDLE (idleMs), altrimenti 1
 *     passo verso una cella walkable adiacente entro `radius` (Manhattan) dalla home
 *     (stepMs). Nessuna cella → IDLE. Senza persona i tempi sono quelli storici.
 *
 * Modulo UMD (pattern dungeon-core): module.exports per node --test,
 * window.MappAINpcBehavior per il browser. Caricare PRIMA di mappai-games.js.
 */
(function () {
  'use strict';

  function strSeed(s) {
    s = String(s || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Catalogo archetipi del Sapiente. Ogni voce è puro DATO runtime (niente contratto):
  //  tone      → voce nel prompt NPC (come parla)
  //  radius    → ampiezza del gironzolìo attorno alla home
  //  pauseProb → quanto spesso sta fermo invece di fare un passo
  //  stepMs/idleMs/emoteMs → [base, jitter] delle cadenze (passo / pausa / bolla)
  var PERSONALITIES = [
    { key: 'contemplativo', tone: 'riflessivo e pacato',     radius: 1, pauseProb: 0.72, stepMs: [900, 500],  idleMs: [2000, 2600], emoteMs: [11000, 9000] },
    { key: 'curioso',       tone: 'entusiasta e curioso',    radius: 3, pauseProb: 0.32, stepMs: [520, 300],  idleMs: [900, 1000],  emoteMs: [6000, 6000] },
    { key: 'arguto',        tone: 'arguto e ironico',        radius: 2, pauseProb: 0.40, stepMs: [500, 260],  idleMs: [1000, 1200], emoteMs: [5000, 5000] },
    { key: 'severo',        tone: 'severo ma incoraggiante', radius: 2, pauseProb: 0.55, stepMs: [760, 360],  idleMs: [1500, 1600], emoteMs: [12000, 8000] },
    { key: 'sognatore',     tone: 'poetico e sognante',      radius: 3, pauseProb: 0.60, stepMs: [1000, 600], idleMs: [2200, 2800], emoteMs: [9000, 9000] }
  ];
  // Archetipo deterministico: stesso seed (nodo+mappa) → stesso carattere per la classe.
  function pickPersonality(seed) {
    var s = (typeof seed === 'number') ? (seed >>> 0) : strSeed(seed);
    return PERSONALITIES[s % PERSONALITIES.length];
  }

  function mkBehavior(type, x, y, radius, persona) {
    var beh = {
      type: type === 'static' ? 'static' : 'wander',
      x: x, y: y, home: [x, y],
      radius: (radius > 0) ? radius : 2,
      state: 'IDLE', nextT: 0, faceLeft: false,
      emoteUntil: 0, nextEmoteT: 0, emoteTerm: ''
    };
    if (persona) {                       // cadenza/raggio dal carattere (default se assenti)
      beh.persona = persona.key || '';
      if (persona.radius > 0) beh.radius = persona.radius;
      if (persona.pauseProb != null) beh.pauseProb = persona.pauseProb;
      if (persona.stepMs) beh.stepMs = persona.stepMs;
      if (persona.idleMs) beh.idleMs = persona.idleMs;
      if (persona.emoteMs) beh.emoteMs = persona.emoteMs;
    }
    return beh;
  }

  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function stepNpc(beh, opts) {
    if (!beh || !opts) return false;
    var now = opts.now || 0, rng = opts.rng, walkable = opts.walkable;
    var trig = (opts.triggerRadius != null) ? opts.triggerRadius : 2;
    if (opts.playerDist != null && opts.playerDist <= trig) { beh.state = 'TURN'; return false; }
    if (beh.type === 'static') { beh.state = 'IDLE'; return false; }
    if (beh.state === 'TURN') beh.state = 'IDLE';   // player allontanato → riprende la sua vita
    if (now < beh.nextT) return false;
    var pauseProb = (beh.pauseProb != null) ? beh.pauseProb : 0.5;
    if (rng() < pauseProb) {
      var im = beh.idleMs || [1200, 1400];   // default = cadenza storica
      beh.state = 'IDLE'; beh.nextT = now + im[0] + Math.floor(rng() * im[1]); return false;
    }
    // 1 passo: celle adiacenti walkable entro radius (Manhattan) dalla home, in ordine seeded
    var cand = [];
    for (var d = 0; d < 4; d++) {
      var nx = beh.x + DIRS[d][0], ny = beh.y + DIRS[d][1];
      if (Math.abs(nx - beh.home[0]) + Math.abs(ny - beh.home[1]) > beh.radius) continue;
      if (walkable && !walkable(nx, ny)) continue;
      cand.push([nx, ny]);
    }
    if (!cand.length) { beh.state = 'IDLE'; beh.nextT = now + 1500; return false; }
    var c = cand[Math.floor(rng() * cand.length)];
    if (c[0] < beh.x) beh.faceLeft = true; else if (c[0] > beh.x) beh.faceLeft = false;
    beh.x = c[0]; beh.y = c[1];
    var sm = beh.stepMs || [700, 400];       // default = cadenza storica
    beh.state = 'WALK'; beh.nextT = now + sm[0] + Math.floor(rng() * sm[1]);
    return true;
  }

  // termine-chiave per l'emote-bubble: parola "piena" (>4 lettere) da label o desc
  function pickEmoteTerm(label, desc, rng) {
    var words = (String(label || '') + ' ' + String(desc || ''))
      .replace(/[^\wÀ-ÿ' -]/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 4; });
    if (!words.length) return '';
    var w = words[Math.floor((rng ? rng() : Math.random()) * words.length)];
    return w.length > 12 ? w.slice(0, 11) + '…' : w;
  }

  var API = {
    strSeed: strSeed,
    mulberry32: mulberry32,
    PERSONALITIES: PERSONALITIES,
    pickPersonality: pickPersonality,
    mkBehavior: mkBehavior,
    stepNpc: stepNpc,
    pickEmoteTerm: pickEmoteTerm
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined') return;
  window.MappAINpcBehavior = API;
  console.log('[MappAINpcBehavior] behaviors NPC giardino caricati');
})();
