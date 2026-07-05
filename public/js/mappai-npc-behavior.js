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
 *   mkBehavior(type, x, y, radius) → stato behavior iniziale
 *   stepNpc(beh, opts)      → muta beh (state/x/y/nextT/faceLeft), ritorna true se mosso
 *     opts: { now, rng, walkable(x,y), playerDist, triggerRadius=2 }
 *   pickEmoteTerm(label, desc, rng) → termine-chiave per l'emote-bubble (priming passivo)
 *
 * Regole stepNpc:
 *   - type 'static'                → resta IDLE, mai si muove.
 *   - playerDist ≤ triggerRadius   → state 'TURN' (si volta verso il player), mai si muove.
 *   - cadenza: nessuna decisione prima di beh.nextT (passi lenti, pause vere).
 *   - 'wander': ~metà delle decisioni = pausa IDLE (1.2–2.6s); altrimenti 1 passo verso una
 *     cella walkable adiacente entro `radius` (Manhattan) dalla home. Nessuna cella → IDLE.
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

  function mkBehavior(type, x, y, radius) {
    return {
      type: type === 'static' ? 'static' : 'wander',
      x: x, y: y, home: [x, y],
      radius: (radius > 0) ? radius : 2,
      state: 'IDLE', nextT: 0, faceLeft: false,
      emoteUntil: 0, nextEmoteT: 0, emoteTerm: ''
    };
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
    if (rng() < 0.5) { beh.state = 'IDLE'; beh.nextT = now + 1200 + Math.floor(rng() * 1400); return false; }
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
    beh.state = 'WALK'; beh.nextT = now + 700 + Math.floor(rng() * 400);
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
    mkBehavior: mkBehavior,
    stepNpc: stepNpc,
    pickEmoteTerm: pickEmoteTerm
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined') return;
  window.MappAINpcBehavior = API;
  console.log('[MappAINpcBehavior] behaviors NPC giardino caricati');
})();
