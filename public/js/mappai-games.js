/* ============================================================================
 * mappai-games.js — MEMORY DUNGEON (gioco di studio)
 * Design completo: docs/game-design/MEMORY_DUNGEON_DESIGN.md
 * ----------------------------------------------------------------------------
 * Loop: piani=livelli nodi → stanze con device → SBLOCCO (WM/calcolo) →
 *   estrai memory unit → CATTURA (diario) → DOOR KEEPER → BOSS → heatmap → reveal.
 *
 * STATO IMPLEMENTAZIONE (build incrementale, "fresco su rot.js"):
 *   [SLICE 1 — QUESTO FILE] Sblocco device: sequenza simboli + calcolo mentale,
 *       difficoltà adattiva, fail→cambio modalità, doppio-fail→cooldown, misuratore WM.
 *   [SLICE 2 TODO] Esplorazione rot.js (piani=livelli, fog, device) + cattura/diario.
 *   [SLICE 3 TODO] Door keeper.   [SLICE 4 TODO] Boss + heatmap + reveal + telemetria.
 *
 * Reversibile: gated da flag 'mappai_games_enabled' (console funziona comunque).
 * Prova lo sblocco:  MappAIGames.testUnlock()
 * ==========================================================================*/
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─────────────────────────── helper condivisi ──────────────────────────────
  function _getAppState() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function _desc(n) { return _clean((n && (n.desc || n.content)) || ''); }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t); else console.log('[memory-dungeon]', m); }
  function _M() { return window.MappAIMastery || null; }
  function _mnode(id) { try { return _M() ? _M().node(id) : null; } catch (e) { return null; } }
  function _level(id) { var m = _M(); return (m && m.masteryLevel) ? m.masteryLevel(_mnode(id)) : 'nuovo'; }
  function _mastered(id) { var l = _level(id); return l === 'acquisito' || l === 'fluente'; }

  // sprite sheet loader (asset 8-bit in public/assets/rogue8x8). char/item: cella 8 + gap 1; tileset: 16×16.
  var _SHEETS = {};
  function _sheet(n) { if (!_SHEETS[n]) { var i = new Image(); i.src = 'assets/' + n; _SHEETS[n] = i; } return _SHEETS[n]; }
  function _ready(img) { return img && img.complete && img.naturalWidth > 0; }

  // ─────────────────────────── persistenza skill + WM ────────────────────────
  var SKILL_KEY = 'mappai_dungeon_skill';   // { seq, calc }  livelli adattivi 1..7
  var WM_KEY = 'mappai_dungeon_wm';          // 0..100 misuratore memoria di lavoro
  function _skill() {
    try { return Object.assign({ seq: 1, calc: 1 }, JSON.parse(localStorage.getItem(SKILL_KEY) || '{}')); }
    catch (e) { return { seq: 1, calc: 1 }; }
  }
  function _saveSkill(s) { try { localStorage.setItem(SKILL_KEY, JSON.stringify(s)); } catch (e) {} }
  function _wm() { var v = parseFloat(localStorage.getItem(WM_KEY)); return isNaN(v) ? 0 : v; }
  function _saveWm(v) { try { localStorage.setItem(WM_KEY, String(Math.round(v))); } catch (e) {} }
  function _bumpLevel(kind, up) {
    var s = _skill();
    s[kind] = Math.max(1, Math.min(7, (s[kind] || 1) + (up ? 1 : -1)));
    _saveSkill(s); return s[kind];
  }

  // ─────────────────────────── tabelle difficoltà ────────────────────────────
  var SEQ = { 1:[3,1500], 2:[3,1300], 3:[4,1300], 4:[4,1100], 5:[5,1000], 6:[5,900], 7:[6,800] }; // [span, esposizione ms]
  var CALC = {
    1:{ max:5,  terms:2, ops:'+',  timer:30 }, 2:{ max:9,  terms:2, ops:'+',  timer:28 }, 3:{ max:9,  terms:2, ops:'+-', timer:26 },
    4:{ max:20, terms:2, ops:'+-', timer:24 }, 5:{ max:20, terms:3, ops:'+-', timer:22 }, 6:{ max:50, terms:2, ops:'+-', timer:22 }
  };
  function _calcCfg(lv) { return CALC[Math.min(lv, 6)] || CALC[1]; }

  // ─────────────────────────── simboli (forme colorate) ──────────────────────
  // Distinguibili PER FORMA (non solo colore) → safe dislessia/color-blind.
  var SHAPES = ['circle', 'triangle', 'square', 'diamond', 'star', 'hexagon'];
  var COLORS = ['#2f6fdb', '#e8821c', '#3fae5a', '#d24b8f']; // blu, arancio, verde, rosa
  function _shapeSVG(shape, color, size) {
    var s = size || 54, c = s / 2, r = s * 0.40, p;
    function poly(n, rot) {
      var pts = [];
      for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; pts.push((c + r * Math.cos(a)).toFixed(1) + ',' + (c + r * Math.sin(a)).toFixed(1)); }
      return pts.join(' ');
    }
    if (shape === 'circle') p = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="' + color + '"/>';
    else if (shape === 'square') p = '<rect x="' + (c - r) + '" y="' + (c - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="3" fill="' + color + '"/>';
    else if (shape === 'triangle') p = '<polygon points="' + poly(3, -Math.PI / 2) + '" fill="' + color + '"/>';
    else if (shape === 'diamond') p = '<polygon points="' + poly(4, -Math.PI / 2) + '" fill="' + color + '"/>';
    else if (shape === 'hexagon') p = '<polygon points="' + poly(6, -Math.PI / 2) + '" fill="' + color + '"/>';
    else { // star
      var pts = [];
      for (var i = 0; i < 10; i++) { var rr = (i % 2 === 0) ? r : r * 0.45; var a = -Math.PI / 2 + i * Math.PI / 5; pts.push((c + rr * Math.cos(a)).toFixed(1) + ',' + (c + rr * Math.sin(a)).toFixed(1)); }
      p = '<polygon points="' + pts.join(' ') + '" fill="' + color + '"/>';
    }
    return '<svg viewBox="0 0 ' + s + ' ' + s + '" width="' + s + '" height="' + s + '" aria-hidden="true">' + p + '</svg>';
  }
  function _tokenId(t) { return t.shape + '|' + t.color; }
  function _randToken() { return { shape: SHAPES[Math.floor(Math.random() * SHAPES.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)] }; }

  // ─────────────────────────── overlay generico ──────────────────────────────
  function _overlay() {
    var root = document.createElement('div');
    root.className = 'mdg-ov';
    root.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(7,10,20,.82);font-family:system-ui,sans-serif';
    var card = document.createElement('div');
    card.style.cssText = 'width:min(440px,92vw);background:#0d1426;border:0.5px solid rgba(120,160,220,.45);border-radius:14px;padding:22px;color:#eaf2ff;box-shadow:0 12px 40px rgba(0,0,0,.5)';
    root.appendChild(card);
    document.body.appendChild(root);
    return { root: root, card: card, close: function () { root.remove(); } };
  }
  function _esc(fn) { function h(e) { if (e.key === 'Escape') { window.removeEventListener('keydown', h); fn(); } } window.addEventListener('keydown', h); return function () { window.removeEventListener('keydown', h); }; }

  // ─────────────────────────── SFIDA: sequenza simboli ───────────────────────
  function _runSequence(lv, done) {
    var cfg = SEQ[Math.min(lv, 7)] || SEQ[1], span = cfg[0];
    var wm = _wm();
    // velocità adattiva allo score WM: parte LENTA, accelera poco alla volta
    var expo = Math.max(600, cfg[1] - Math.round(wm * 3));
    // il COLORE entra solo con lo score: 1 colore all'inizio, poi 2, 3, 4
    var colorCount = Math.max(1, Math.min(COLORS.length, 1 + Math.floor(wm / 30)));
    var palette = COLORS.slice(0, colorCount);
    // pool di token DISTINTI (forma×colore attivo): la soluzione mostra solo questi
    var pool = [];
    SHAPES.forEach(function (sh) { palette.forEach(function (co) { pool.push({ shape: sh, color: co }); }); });
    pool.sort(function () { return Math.random() - 0.5; });
    var seq = []; for (var i = 0; i < span; i++) seq.push(pool[i % pool.length]);
    var t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { ov.close(); done({ success: false, aborted: true }); });
    function finish(res) { unEsc(); ov.close(); res.durationMs = Date.now() - t0; done(res); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Accesso memoria · sequenza · livello ' + lv + '</div>' +
      '<h3 style="margin:0 0 14px;font-size:17px;font-weight:500">Memorizza l\'ordine dei simboli</h3>' +
      '<div id="mdg-disp" style="height:90px;display:flex;align-items:center;justify-content:center"></div>' +
      '<div id="mdg-sub" style="font-size:12px;color:#8fa4c4;text-align:center;min-height:18px"></div>' +
      '<div id="mdg-board" style="display:none;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px"></div>' +
      '<div id="mdg-fb" style="text-align:center;font-size:14px;min-height:22px;margin-top:10px"></div>';
    var disp = ov.card.querySelector('#mdg-disp'), sub = ov.card.querySelector('#mdg-sub'),
        board = ov.card.querySelector('#mdg-board'), fb = ov.card.querySelector('#mdg-fb');

    // fase mostra
    var idx = 0;
    function showNext() {
      if (idx >= seq.length) { disp.innerHTML = ''; sub.textContent = ''; return inputPhase(); }
      sub.textContent = (idx + 1) + ' / ' + seq.length;
      disp.innerHTML = _shapeSVG(seq[idx].shape, seq[idx].color, 72);
      idx++;
      setTimeout(function () { disp.innerHTML = ''; setTimeout(showNext, RM ? 120 : 200); }, expo);
    }
    // fase input
    function inputPhase() {
      sub.textContent = 'Ricomponi la sequenza';
      board.style.display = 'flex';
      // opzioni = ESATTAMENTE i token della sequenza (nessun intruso esterno)
      var tokens = seq.slice();
      tokens.sort(function () { return Math.random() - 0.5; });
      var pos = 0;
      tokens.forEach(function (t, n) {
        var b = document.createElement('button');
        b.style.cssText = 'background:#16203a;border:0.5px solid rgba(120,160,220,.35);border-radius:10px;padding:6px;cursor:pointer;line-height:0';
        b.innerHTML = _shapeSVG(t.shape, t.color, 46);
        b.setAttribute('aria-label', t.color + ' ' + t.shape);
        b.onclick = function () { pick(t, b); };
        b.dataset.k = (n + 1);
        board.appendChild(b);
      });
      function pick(t, b) {
        if (_tokenId(t) === _tokenId(seq[pos])) {
          b.style.borderColor = '#3fae5a'; pos++;
          fb.textContent = pos + ' / ' + seq.length;
          if (pos >= seq.length) { fb.innerHTML = '<span style="color:#3fae5a">✓ Accesso sbloccato</span>'; lock(); setTimeout(function () { finish({ success: true }); }, 650); }
        } else {
          b.style.borderColor = '#c0432c'; fb.innerHTML = '<span style="color:#e88">✗ Sequenza errata</span>'; lock();
          setTimeout(function () { finish({ success: false }); }, 800);
        }
      }
      function lock() { Array.prototype.forEach.call(board.querySelectorAll('button'), function (x) { x.disabled = true; x.style.cursor = 'default'; }); }
      // tastiera 1-9
      function key(e) { var n = parseInt(e.key, 10); if (n >= 1 && n <= tokens.length) { var btn = board.querySelector('[data-k="' + n + '"]'); if (btn && !btn.disabled) btn.click(); } }
      window.addEventListener('keydown', key);
      var oldFinish = finish; finish = function (r) { window.removeEventListener('keydown', key); oldFinish(r); };
    }
    setTimeout(showNext, 500);
  }

  // ─────────────────────────── SFIDA: calcolo mentale ────────────────────────
  function _runCalc(lv, done) {
    lv = Math.min(lv, 6);          // cap: mai oltre la complessità testata nella demo
    var cfg = _calcCfg(lv);
    var terms = cfg.terms, expr = '', acc = 0;
    var allowMinus = cfg.ops && cfg.ops.indexOf('-') >= 0;   // livelli iniziali = sola addizione
    for (var i = 0; i < terms; i++) {
      var n = 1 + Math.floor(Math.random() * cfg.max);
      if (i === 0) { acc = n; expr = String(n); }
      else { var minus = allowMinus && Math.random() < 0.5; if (minus && acc - n < 0) minus = false; acc = minus ? acc - n : acc + n; expr += (minus ? ' − ' : ' + ') + n; }
    }
    var answer = acc, t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { stop(); ov.close(); done({ success: false, aborted: true }); });
    var timer = null, raf = 0;
    function stop() { if (timer) clearTimeout(timer); if (raf) cancelAnimationFrame(raf); unEsc(); }
    function finish(res) { stop(); ov.close(); res.durationMs = Date.now() - t0; done(res); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Accesso memoria · calcolo · livello ' + lv + '</div>' +
      '<h3 style="margin:0 0 14px;font-size:17px;font-weight:500">Risolvi entro il tempo</h3>' +
      '<div style="font-size:34px;text-align:center;letter-spacing:1px;margin:8px 0 14px">' + expr + ' = ?</div>' +
      '<input id="mdg-ans" type="number" inputmode="numeric" autocomplete="off" style="width:100%;font-size:20px;text-align:center;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.4);background:#16203a;color:#eaf2ff;box-sizing:border-box">' +
      '<div style="height:6px;background:#16203a;border-radius:4px;margin-top:14px;overflow:hidden"><div id="mdg-bar" style="height:100%;width:100%;background:#3aa0c9"></div></div>' +
      '<div id="mdg-fb" style="text-align:center;font-size:14px;min-height:22px;margin-top:10px"></div>';
    var inp = ov.card.querySelector('#mdg-ans'), bar = ov.card.querySelector('#mdg-bar'), fb = ov.card.querySelector('#mdg-fb');
    setTimeout(function () { inp.focus(); }, 50);

    var total = cfg.timer * 1000, start = Date.now();
    function tick() {
      var left = total - (Date.now() - start), frac = Math.max(0, left / total);
      bar.style.width = (frac * 100) + '%';
      bar.style.background = frac > 0.4 ? '#3aa0c9' : (frac > 0.15 ? '#e8821c' : '#c0432c');
      if (left <= 0) { fb.innerHTML = '<span style="color:#e8a">⏱ Tempo scaduto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false, timeout: true }); }, 800); return; }
      raf = requestAnimationFrame(tick);
    }
    if (!RM) tick(); else { /* reduced motion: solo timeout, no barra animata */ timer = setTimeout(function () { fb.innerHTML = '<span style="color:#e8a">⏱ Tempo scaduto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false, timeout: true }); }, 800); }, total); }

    function submit() {
      var v = parseInt(inp.value, 10);
      if (isNaN(v)) { inp.focus(); return; }
      if (v === answer) { fb.innerHTML = '<span style="color:#3fae5a">✓ Accesso sbloccato</span>'; inp.disabled = true; setTimeout(function () { finish({ success: true }); }, 600); }
      else { fb.innerHTML = '<span style="color:#e88">✗ ' + v + ' non corretto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false }); }, 800); }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ─────────────────────────── SFIDA: stop/go (inibizione, droidi) ───────────
  // Tasti F/J. Blu→F, Arancio→J (GO), Rosso→NON premere (NO-GO). Sblocco se score≥60%.
  function _runStopGo(opts, done) {
    opts = opts || {};
    var N = opts.trials || 12, stimMs = opts.stimMs || 1100, isiMs = 550;
    var GO_F = '#2f6fdb', GO_J = '#e8821c', STOP = '#c0432c';
    var trials = [];
    for (var i = 0; i < N; i++) {
      if (Math.random() < 0.30) trials.push('stop');           // ~30% no-go (prepotenza GO)
      else trials.push(Math.random() < 0.5 ? 'F' : 'J');
    }
    var idx = 0, correct = 0, responded = false, raf = 0, timer = null, t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { cleanup(); ov.close(); done({ success: false, aborted: true }); });
    function cleanup() { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer); window.removeEventListener('keydown', onKey); unEsc(); }
    function finish() { cleanup(); ov.close(); var score = correct / N; _updateWMraw(score); done({ success: score >= 0.6, score: score, modality: 'stopgo', durationMs: Date.now() - t0 }); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Cattura droide · inibizione (stop/go)</div>' +
      '<h3 style="margin:0 0 6px;font-size:17px;font-weight:500">Reagisci in fretta… ma trattieniti sul rosso</h3>' +
      '<div style="font-size:12px;color:#8fa4c4;margin-bottom:12px">Blu → <b>F</b> &nbsp;·&nbsp; Arancio → <b>J</b> &nbsp;·&nbsp; <span style="color:#e88">Rosso → non premere</span></div>' +
      '<div id="sg-stim" style="height:120px;display:flex;align-items:center;justify-content:center"></div>' +
      '<div id="sg-prog" style="font-size:12px;color:#8fa4c4;text-align:center;min-height:18px"></div>';
    var stim = ov.card.querySelector('#sg-stim'), prog = ov.card.querySelector('#sg-prog');

    function onKey(e) {
      var k = e.key.toLowerCase(); if (k !== 'f' && k !== 'j') return;
      if (responded || !stim.firstChild) return;
      responded = true;
      var tr = trials[idx];
      if (tr === 'stop') flash('#c0432c');                        // premuto sul NO-GO = errore d'inibizione
      else if ((tr === 'F' && k === 'f') || (tr === 'J' && k === 'j')) { correct++; flash('#3fae5a'); }
      else flash('#c0432c');                                       // tasto sbagliato
    }
    function flash(c) { stim.style.outline = '3px solid ' + c; setTimeout(function () { stim.style.outline = 'none'; }, 200); }
    function showTrial() {
      if (idx >= N) return finish();
      responded = false;
      var tr = trials[idx];
      var col = tr === 'stop' ? STOP : (tr === 'F' ? GO_F : GO_J);
      var shape = tr === 'stop' ? 'circle' : (tr === 'F' ? 'triangle' : 'square');
      stim.innerHTML = _shapeSVG(shape, col, 96);
      prog.textContent = (idx + 1) + ' / ' + N;
      var start = Date.now();
      (function tick() { if (Date.now() - start >= stimMs) return endTrial(); raf = requestAnimationFrame(tick); })();
    }
    function endTrial() {
      if (!responded && trials[idx] === 'stop') correct++;         // trattenuto correttamente
      idx++; stim.innerHTML = '';
      timer = setTimeout(showTrial, isiMs);
    }
    window.addEventListener('keydown', onKey);
    setTimeout(showTrial, 700);
  }

  // ─────────────────────────── orchestratore sblocco ─────────────────────────
  // 1° tentativo modalità casuale; fail → 2° tentativo cambia modalità;
  // doppio fail → cooldown + difficoltà−1 di quella modalità. Aggiorna WM + skill.
  function startUnlock(opts, cb) {
    opts = opts || {}; cb = cb || function () {};
    if (opts.deviceType === 'droid') { _runStopGo(opts, cb); return; }  // droidi = stop/go (ripetibile ≥60%)
    var first = (typeof opts.modality === 'string') ? opts.modality : (Math.random() < 0.5 ? 'seq' : 'calc');
    var meta = { attempts: 0, switched: false, modalities: [], doubleFail: false };

    function attempt(modality) {
      meta.attempts++; meta.modalities.push(modality);
      var lv = _skill()[modality];
      var run = modality === 'seq' ? _runSequence : _runCalc;
      run(lv, function (res) {
        if (res.aborted) { cb({ success: false, aborted: true, meta: meta }); return; }
        _updateWM(res.success, res.durationMs, lv);
        if (res.success) {
          _bumpStreak(modality, true);
          cb({ success: true, modality: modality, level: lv, meta: meta, durationMs: res.durationMs });
        } else {
          _bumpStreak(modality, false); // azzera streak + −1 livello
          if (meta.attempts === 1) {
            meta.switched = true;
            var other = modality === 'seq' ? 'calc' : 'seq';
            setTimeout(function () { attempt(other); }, 400);
          } else {
            meta.doubleFail = true;
            cb({ success: false, modality: modality, level: lv, meta: meta, cooldown: true });
          }
        }
      });
    }
    attempt(first);
  }

  // streak adattivo: +1 livello dopo 2 successi consecutivi, −1 dopo un fallimento
  var _streak = { seq: 0, calc: 0 };
  function _bumpStreak(kind, ok) {
    // salita LENTA: serve una serie di 3 successi consecutivi per +1 livello
    if (ok) { _streak[kind]++; if (_streak[kind] >= 3) { _streak[kind] = 0; _bumpLevel(kind, true); } }
    else { _streak[kind] = 0; _bumpLevel(kind, false); }
  }
  // WM meter: EWMA di una performance 0..1 = successo pesato per velocità e livello
  function _updateWM(ok, durationMs, lv) {
    var speed = ok ? Math.max(0, Math.min(1, 1 - (durationMs / 1000) / (8 + lv * 2))) : 0;
    var perf = ok ? (0.6 + 0.25 * speed + 0.15 * (lv / 7)) : 0.0;
    perf = Math.max(0, Math.min(1, perf));
    var cur = _wm(); var next = cur + 0.3 * (perf * 100 - cur); // EWMA alpha 0.3
    _saveWm(next); return next;
  }
  function _updateWMraw(perf) { perf = Math.max(0, Math.min(1, perf)); var cur = _wm(); var next = cur + 0.3 * (perf * 100 - cur); _saveWm(next); return next; }

  // ─────────────────────────── harness di test (game feel) ───────────────────
  function testUnlock() {
    // il test riparte SEMPRE dal livello facile (azzera skill/WM/streak della sessione)
    _saveSkill({ seq: 1, calc: 1 }); _saveWm(0); _streak = { seq: 0, calc: 0 };
    function round() {
      startUnlock({}, function (r) {
        if (r.aborted) return;
        var s = _skill(), wm = Math.round(_wm());
        var ov = _overlay();
        var un = _esc(ov.close);
        var line = r.success
          ? '<span style="color:#3fae5a">✓ Sbloccato</span> (' + r.modality + ', lv ' + r.level + (r.meta.switched ? ', dopo cambio modalità' : '') + ')'
          : (r.cooldown ? '<span style="color:#e88">✗ Doppio fallimento → cooldown + difficoltà −1</span>'
                        : '<span style="color:#e88">✗ Fallito</span>');
        ov.card.innerHTML =
          '<h3 style="margin:0 0 10px;font-size:17px;font-weight:500">Esito sblocco</h3>' +
          '<div style="font-size:14px;margin-bottom:12px">' + line + '</div>' +
          '<div style="font-size:13px;color:#8fa4c4;margin-bottom:16px">Skill: sequenza lv ' + s.seq + ' · calcolo lv ' + s.calc + ' &nbsp;|&nbsp; Memoria di lavoro: <b style="color:#eaf2ff">' + wm + '/100</b></div>' +
          '<div style="display:flex;gap:8px"><button id="mdg-again" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">Ancora ↻</button>' +
          '<button id="mdg-stop" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">Basta</button></div>';
        ov.card.querySelector('#mdg-again').onclick = function () { un(); ov.close(); round(); };
        ov.card.querySelector('#mdg-stop').onclick = function () { un(); ov.close(); };
      });
    }
    round();
  }

  function testStopGo() {
    function round() {
      _runStopGo({}, function (r) {
        if (r.aborted) return;
        var ov = _overlay(); var un = _esc(ov.close); var pct = Math.round(r.score * 100);
        var line = r.success
          ? '<span style="color:#3fae5a">✓ Droide catturato</span> — score ' + pct + '% (≥ 60%)'
          : '<span style="color:#e88">✗ Score ' + pct + '%</span> — serve 60%. Riprova (nessun malus).';
        ov.card.innerHTML =
          '<h3 style="margin:0 0 10px;font-size:17px;font-weight:500">Stop/Go — esito</h3>' +
          '<div style="font-size:14px;margin-bottom:16px">' + line + '</div>' +
          '<div style="display:flex;gap:8px"><button id="sg-a" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">' + (r.success ? 'Ancora ↻' : 'Ripeti ↻') + '</button>' +
          '<button id="sg-s" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">Basta</button></div>';
        ov.card.querySelector('#sg-a').onclick = function () { un(); ov.close(); round(); };
        ov.card.querySelector('#sg-s').onclick = function () { un(); ov.close(); };
      });
    }
    round();
  }

  // ════════════════════════ DUNGEON (slice 2a) ═══════════════════════════════
  // Stanze per livello, esplorazione POINT&CLICK (mouse), nebbia (rot.js FOV).
  // Sorgenti memoria: 📖 libro→sequenza · 📜 scroll→calcolo · 🧟 zombi→stop/go.
  // [SLICE 2b TODO] sprite PNG animate (public/assets/rogue8x8) + nemici/duello + diario ricco.
  var SRC = { libro: { ico: '📖', first: 'seq' }, scroll: { ico: '📜', first: 'calc' }, zombi: { ico: '🧟', droid: true } };
  var DUN = null;

  function _levelsFromState() {
    var st = _getAppState(); var nodes = (st && st.db && st.db.nodes) || [];
    if (!nodes.length) return null;
    var byL = {};
    nodes.forEach(function (n) { var l = (n.level != null) ? n.level : 1; (byL[l] = byL[l] || []).push(n); });
    return Object.keys(byL).map(Number).sort(function (a, b) { return a - b; }).map(function (l) { return { level: l, nodes: byL[l] }; });
  }

  function _ensureRot(cb) {
    if (typeof ROT !== 'undefined' && ROT && ROT.Map) return cb(true);
    if (window.ROT && window.ROT.Map) return cb(true);
    var s = document.createElement('script');
    s.src = 'js/vendor/rot.min.js?ts=' + Date.now();   // cache-bust: bypassa cache Electron
    s.onload = function () { cb((typeof ROT !== 'undefined' && ROT && ROT.Map) || (window.ROT && window.ROT.Map)); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function _startDungeon() {
    _ensureRot(function (ok) {
      if (!ok) { _toast('Impossibile caricare rot.js (js/vendor/rot.min.js) — controlla il path', 'error'); return; }
      _startDungeonReal();
    });
  }
  function _startDungeonReal() {
    var floors = _levelsFromState();
    if (!floors) { _toast('Genera prima una mappa', 'warning'); return; }
    if (DUN) return;
    var root = document.createElement('div');
    root.id = 'mdg-dun';
    root.style.cssText = 'position:fixed;inset:0;z-index:99997;background:#05070d;overflow:hidden';
    root.innerHTML =
      '<canvas id="mdg-cv" style="display:block"></canvas>' +
      '<div id="mdg-hud" style="position:absolute;top:8px;left:12px;right:54px;display:flex;justify-content:space-between;align-items:center;font:14px system-ui,sans-serif;color:#eaf2ff;text-shadow:0 1px 3px #000;pointer-events:none"></div>' +
      '<button id="mdg-dx" type="button" style="position:absolute;top:8px;right:12px;width:34px;height:34px;border-radius:8px;border:0.5px solid rgba(150,180,220,.4);background:rgba(10,15,26,.85);color:#eaf2ff;cursor:pointer">✕</button>' +
      '<div id="mdg-tip" style="position:absolute;bottom:10px;left:0;right:0;text-align:center;font:12px system-ui;color:#8fa4c4;pointer-events:none">clic per muoverti · <b>B</b> diario · <b>Esc</b> esci</div>';
    document.body.appendChild(root);
    var cv = root.querySelector('#mdg-cv'), ctx = cv.getContext('2d');
    DUN = { root: root, cv: cv, ctx: ctx, floors: floors, fi: -1, TS: 40, hp: 5, maxhp: 5, path: null, raf: 0, hpTimer: Date.now(), diary: [] };
    DUN.sheet = _sheet('roguedb32/spiderdave.png');   // RogueDB32 (CC0) — foglio unico tile+sprite, 8×8
    DUN.skin = { cell: 8, gap: 0, floor: [0, 17], wall: [1, 17], player: [1, 9] }; // coord 8px assolute (tarabili via tune)
    function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; ctx.imageSmoothingEnabled = false; }
    resize(); window.addEventListener('resize', resize);
    function onKey(e) { if (e.key === 'Escape') _closeDungeon(); else if (e.key.toLowerCase() === 'b') _openDiary(); }
    window.addEventListener('keydown', onKey); DUN._onKey = onKey; DUN._resize = resize;
    root.querySelector('#mdg-dx').onclick = _closeDungeon;
    cv.addEventListener('click', _onDunClick);
    _loadFloor(0);
    (function loop() { DUN.raf = requestAnimationFrame(loop); _dunTick(); _dunRender(); })();
  }
  function _closeDungeon() {
    if (!DUN) return;
    cancelAnimationFrame(DUN.raf);
    window.removeEventListener('keydown', DUN._onKey); window.removeEventListener('resize', DUN._resize);
    DUN.root.remove(); DUN = null;
  }

  function _loadFloor(i) {
    var f = DUN.floors[i]; DUN.fi = i;
    var n = f.nodes.length;
    var w = Math.max(34, Math.min(72, 12 + n * 3)), h = Math.max(24, Math.min(48, 10 + n * 2));
    var dig = new ROT.Map.Digger(w, h), map = {};
    dig.create(function (x, y, v) { map[x + ',' + y] = v; });
    DUN.map = map; DUN.w = w; DUN.h = h;
    var open = []; for (var k in map) { if (map[k] === 0) open.push(k); }
    open.sort(function () { return Math.random() - 0.5; });
    var st = open.pop().split(',').map(Number); DUN.px = st[0]; DUN.py = st[1];
    DUN.sources = {};
    var types = ['libro', 'scroll', 'zombi'];
    f.nodes.forEach(function (nd, idx) {
      if (!open.length) return;
      var key = open.pop();
      DUN.sources[key] = { node: nd, type: types[idx % 3], extracted: !!_mastered(nd.id) };
    });
    DUN.sx = DUN.sy = -1;
    if (i < DUN.floors.length - 1 && open.length) { var s = open.pop().split(',').map(Number); DUN.sx = s[0]; DUN.sy = s[1]; }
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    _computeFOV();
  }
  function _computeFOV() {
    DUN.visible = {};
    var fov = new ROT.FOV.PreciseShadowcasting(function (x, y) { return DUN.map[x + ',' + y] === 0; });
    fov.compute(DUN.px, DUN.py, 7, function (x, y, r, vis) { if (vis) { DUN.visible[x + ',' + y] = true; DUN.explored[x + ',' + y] = true; } });
    DUN.explored[DUN.px + ',' + DUN.py] = true;
  }

  function _onDunClick(e) {
    if (!DUN || DUN.path) return;
    var TS = DUN.TS, rect = DUN.cv.getBoundingClientRect();
    var camX = DUN.px * TS - DUN.cv.width / 2 + TS / 2, camY = DUN.py * TS - DUN.cv.height / 2 + TS / 2;
    var tx = Math.floor((e.clientX - rect.left + camX) / TS), ty = Math.floor((e.clientY - rect.top + camY) / TS);
    if (DUN.map[tx + ',' + ty] !== 0 || !DUN.explored[tx + ',' + ty]) return;
    var path = [];
    var astar = new ROT.Path.AStar(tx, ty, function (x, y) { return DUN.map[x + ',' + y] === 0; }, { topology: 4 });
    astar.compute(DUN.px, DUN.py, function (x, y) { path.push([x, y]); });
    if (path.length < 2) { _arrive(tx, ty); return; }
    path.shift();
    DUN.path = { steps: path, last: Date.now() };
  }
  function _dunTick() {
    if (!DUN) return;
    if (DUN.hp < DUN.maxhp && Date.now() - DUN.hpTimer >= 10000) { DUN.hp++; DUN.hpTimer = Date.now(); }
    if (DUN.path && Date.now() - DUN.path.last >= 110) {
      var s = DUN.path.steps.shift(); DUN.px = s[0]; DUN.py = s[1]; DUN.path.last = Date.now(); _computeFOV();
      if (!DUN.path.steps.length) { var fx = DUN.px, fy = DUN.py; DUN.path = null; _arrive(fx, fy); }
    }
  }
  function _arrive(x, y) {
    if (x === DUN.sx && y === DUN.sy) { _descend(); return; }
    var src = DUN.sources[x + ',' + y];
    if (src && !src.extracted) _interactSource(src);
  }
  function _interactSource(src) {
    var t = SRC[src.type];
    var opts = t.droid ? { deviceType: 'droid' } : { modality: t.first };
    startUnlock(opts, function (res) {
      if (res && res.success) {
        src.extracted = true;
        DUN.diary.push({ id: src.node.id, label: _clean(src.node.label), desc: _desc(src.node) });
        if (window.MappAIMastery) window.MappAIMastery.record(src.node.id, src.node.label, 'dungeon', { score: 1 });
        _showMemory(src.node);
      } else if (res && res.cooldown) { _toast('Accesso fallito — riprova più tardi', 'warning'); }
      else if (res && res.score != null && !res.success) { _toast('Score ' + Math.round(res.score * 100) + '% (<60%) — riprova', 'info'); }
    });
  }
  function _showMemory(node) {
    var st = _getAppState(); var cites = (st && st.db && st.db.sourcesDict && st.db.sourcesDict[node.id]) || [];
    var ov = _overlay(); var un = _esc(ov.close);
    var cite = cites.length ? '<div style="margin-top:10px;padding:8px;border-left:2px solid #3aa0c9;background:#0b1426;font-size:12px;color:#b8c8e0">“' + _clean(cites[0].text).slice(0, 240) + '”</div>' : '';
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">Memory unit estratta</div>' +
      '<h3 style="margin:4px 0 8px;font-size:18px;font-weight:500">' + _clean(node.label) + '</h3>' +
      '<p style="font-size:13px;line-height:1.55;color:#c3d2ea;margin:0">' + (_desc(node) || '(nessuna descrizione)') + '</p>' + cite +
      '<button id="mm-ok" style="margin-top:14px;width:100%;padding:10px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">Aggiungi al diario</button>';
    ov.card.querySelector('#mm-ok').onclick = function () { un(); ov.close(); };
  }
  function _descend() {
    if (DUN.fi < DUN.floors.length - 1) { _loadFloor(DUN.fi + 1); _toast('Sceso al piano ' + (DUN.fi + 1), 'info'); }
    else _toast('Ultimo piano — boss in costruzione', 'info');
  }
  function _openDiary() {
    var ov = _overlay(); var un = _esc(ov.close);
    var items = DUN.diary.length
      ? DUN.diary.map(function (d) { return '<div style="padding:8px 0;border-bottom:0.5px solid rgba(120,160,220,.2)"><b style="color:#eaf2ff">' + d.label + '</b><div style="font-size:12px;color:#9fb0cc;margin-top:2px">' + (d.desc || '').slice(0, 160) + '</div></div>'; }).join('')
      : '<div style="color:#8fa4c4;font-size:13px">Diario vuoto — estrai memory unit dai libri/scroll/zombi.</div>';
    ov.card.innerHTML = '<h3 style="margin:0 0 10px;font-size:18px;font-weight:500">📖 Diario</h3><div style="max-height:50vh;overflow:auto">' + items + '</div>' +
      '<button id="di-x" style="margin-top:12px;width:100%;padding:9px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">chiudi</button>';
    ov.card.querySelector('#di-x').onclick = function () { un(); ov.close(); };
  }

  function _dunRender() {
    if (!DUN) return;
    var ctx = DUN.ctx, TS = DUN.TS, W = DUN.cv.width, H = DUN.cv.height;
    var camX = DUN.px * TS - W / 2 + TS / 2, camY = DUN.py * TS - H / 2 + TS / 2;
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H);
    var x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1;
    var x1 = x0 + Math.ceil(W / TS) + 2, y1 = y0 + Math.ceil(H / TS) + 2;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var key = x + ',' + y, v = DUN.map[key];
      if (v === undefined || !DUN.explored[key]) continue;
      var sx = Math.round(x * TS - camX), sy = Math.round(y * TS - camY);
      var vis = DUN.visible[key];
      var cell = (v === 1) ? DUN.skin.wall : DUN.skin.floor, U = DUN.skin.cell + DUN.skin.gap, C = DUN.skin.cell;
      if (_ready(DUN.sheet)) ctx.drawImage(DUN.sheet, cell[0] * U, cell[1] * U, C, C, sx, sy, TS, TS);
      else { ctx.fillStyle = (v === 1) ? '#3a3550' : '#16203a'; ctx.fillRect(sx, sy, TS, TS); }
      if (!vis) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx, sy, TS, TS); }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = Math.round(TS * 0.7) + 'px system-ui';
    if (DUN.sx >= 0 && DUN.explored[DUN.sx + ',' + DUN.sy]) ctx.fillText('🔽', Math.round(DUN.sx * TS - camX + TS / 2), Math.round(DUN.sy * TS - camY + TS / 2));
    for (var k in DUN.sources) {
      if (!DUN.explored[k]) continue;
      var s = DUN.sources[k], p = k.split(',').map(Number);
      var px = Math.round(p[0] * TS - camX + TS / 2), py = Math.round(p[1] * TS - camY + TS / 2);
      ctx.globalAlpha = s.extracted ? 0.35 : (DUN.visible[k] ? 1 : 0.5);
      ctx.fillText(s.extracted ? '✅' : SRC[s.type].ico, px, py);
      ctx.globalAlpha = 1;
    }
    var hx = Math.round(DUN.px * TS - camX), hy = Math.round(DUN.py * TS - camY);
    if (_ready(DUN.sheet)) { var U2 = DUN.skin.cell + DUN.skin.gap, C2 = DUN.skin.cell, pl = DUN.skin.player; ctx.drawImage(DUN.sheet, pl[0] * U2, pl[1] * U2, C2, C2, hx, hy, TS, TS); }
    else ctx.fillText('🧙', hx + TS / 2, hy + TS / 2);
    var hud = DUN.root.querySelector('#mdg-hud');
    var hearts = '❤️'.repeat(DUN.hp) + '🤍'.repeat(Math.max(0, DUN.maxhp - DUN.hp));
    var mem = 0, tot = 0; for (var kk in DUN.sources) { tot++; if (DUN.sources[kk].extracted) mem++; }
    hud.innerHTML = '<span>' + hearts + '</span><span>Piano ' + (DUN.fi + 1) + '/' + DUN.floors.length + ' · L' + DUN.floors[DUN.fi].level + ' &nbsp; 📖 ' + mem + '/' + tot + '</span>';
  }

  // ─────────────────────────── launcher in-app (gated da flag) ───────────────
  function openChooser() {
    var ov = _overlay(); var un = _esc(ov.close);
    function go(fn) { un(); ov.close(); fn(); }
    ov.card.innerHTML =
      '<h3 style="margin:0 0 4px;font-size:17px;font-weight:500">Memory Dungeon — prova minigiochi</h3>' +
      '<div style="font-size:12px;color:#8fa4c4;margin-bottom:14px">Slice 1: sblocco device. Esplorazione/cattura/door keeper/boss in costruzione.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button id="c-dun" style="padding:11px;border-radius:10px;border:0.5px solid #3fae5a;background:#15301f;color:#eaf2ff;cursor:pointer;text-align:left">🏰 Entra nel dungeon — esplora (point&amp;click)</button>' +
      '<button id="c-seq" style="padding:11px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;text-align:left">▶ Sblocco libro/scroll — forme &amp; calcolo</button>' +
      '<button id="c-sg"  style="padding:11px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;text-align:left">▶ Cattura zombi — stop/go (F/J)</button>' +
      '<button id="c-rst" style="padding:9px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">↺ Reset skill &amp; WM</button>' +
      '<button id="c-cls" style="padding:9px;border-radius:10px;border:none;background:transparent;color:#8fa4c4;cursor:pointer">chiudi</button>' +
      '</div>';
    ov.card.querySelector('#c-dun').onclick = function () { go(_startDungeon); };
    ov.card.querySelector('#c-seq').onclick = function () { go(testUnlock); };
    ov.card.querySelector('#c-sg').onclick = function () { go(testStopGo); };
    ov.card.querySelector('#c-rst').onclick = function () { window.MappAIGames.resetSkill(); ov.card.querySelector('#c-rst').textContent = '✓ azzerati'; };
    ov.card.querySelector('#c-cls').onclick = function () { un(); ov.close(); };
  }
  function _injectLauncher() {
    if (document.getElementById('mdg-launch') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'mdg-launch'; b.type = 'button'; b.textContent = '🎮 Giochi';
    b.title = 'Memory Dungeon (prova minigiochi)';
    b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99990;padding:9px 14px;border-radius:10px;border:0.5px solid #3aa0c9;background:#0d1426;color:#eaf2ff;cursor:pointer;font:14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4)';
    b.onclick = openChooser;
    document.body.appendChild(b);
  }

  // ─────────────────────────── stile minimo ──────────────────────────────────
  var st = document.createElement('style');
  st.textContent = '.mdg-ov button:hover{filter:brightness(1.15)} .mdg-ov button:active{transform:scale(.97)} .mdg-ov svg{display:block}';
  document.head.appendChild(st);

  // ─────────────────────────── API pubblica ──────────────────────────────────
  window.MappAIGames = {
    // SLICE 1 — disponibile ora:
    startUnlock: startUnlock,        // startUnlock(opts, cb) — usato dai device (slice 2)
    testUnlock: testUnlock,          // prova il game feel dello sblocco (forme/calcolo)
    testStopGo: testStopGo,          // prova lo stop/go dei droidi (inibizione, F/J)
    skill: _skill, wm: _wm,
    resetSkill: function () { localStorage.removeItem(SKILL_KEY); localStorage.removeItem(WM_KEY); console.log('[memory-dungeon] skill+WM azzerati'); },
    launcher: _injectLauncher,       // mostra il bottone flottante "🎮 Giochi" in-app
    openChooser: openChooser,        // menu minigiochi + entra nel dungeon
    startDungeon: _startDungeon,     // esplorazione dungeon (slice 2a)
    tune: function (o) { if (DUN && o) { ['floor', 'wall', 'player'].forEach(function (k) { if (o[k]) DUN.skin[k] = o[k]; }); if (o.cell) DUN.skin.cell = o.cell; if (o.gap != null) DUN.skin.gap = o.gap; if (o.TS) DUN.TS = o.TS; } }, // es. MappAIGames.tune({floor:[0,17],wall:[1,17],player:[1,9]})
    // SLICE 2a:
    openDungeon: function () { var st = _getAppState(); if (st && st.db && st.db.nodes && st.db.nodes.length) _startDungeon(); else openChooser(); },
    enabled: function () { return localStorage.getItem('mappai_games_enabled') === '1'; },
    enable: function () { localStorage.setItem('mappai_games_enabled', '1'); _injectLauncher(); console.log('%c[memory-dungeon] abilitato — bottone 🎮 in basso a sinistra', 'color:#3aa0c9'); },
    disable: function () { localStorage.removeItem('mappai_games_enabled'); var b = document.getElementById('mdg-launch'); if (b) b.remove(); }
  };

  // auto-mostra il launcher se il flag è attivo
  if (window.MappAIGames.enabled()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _injectLauncher);
    else _injectLauncher();
  }
})();
