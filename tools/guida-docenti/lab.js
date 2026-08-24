/* tools/guida-docenti/lab.js — laboratorio screenshot per la GUIDA DOCENTI (22/8/26).
 *
 * Pilota l'app VIVA via CDP e scatta screenshot interi o ritagliati, con puntatore,
 * cornici e numeri cerchiati disegnati in pagina. Derivato dal lab della skill
 * `guida-app-screenshot` (StudIA), riscritto per MappAI.
 *
 * Istanza di prova isolata (MAI i dati veri):
 *   L="$HOME/Claude/MappAI - guida docenti/lab"
 *   ./node_modules/.bin/electron . --remote-debugging-port=9333 --user-data-dir="$L/userData" \
 *     --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows
 *   → userData in <L>/userData/dev, cartella madre in <L>/casa (mappai-settings.json).
 *   ⚠️ I tre flag finali non sono cosmesi: con la finestra coperta da altre finestre Chromium ferma
 *   requestAnimationFrame (document.visibilityState = hidden), la fisica D3 non fa un tick e la
 *   mappa libera si fotografa con tutti i cerchi ammucchiati sotto la radice. Misurato il 23/8:
 *   0 fotogrammi in 500 ms senza i flag. È la trappola 2 della GUIDA-ARCHITETTO, sull'app vera.
 *
 * Variabili: MAPPAI_PORTA (9333) · IMG_DIR (…/MappAI - guida docenti/img).
 * ⚠️ Trappole pagate (memoria electron-debug-remoto): niente replMode; electronAPI è
 * congelato (non si stubba); se la porta è occupata da un'istanza vecchia si parla con
 * quella — `lsof -ti :9333` prima di dare la colpa al codice.
 */
const path = require('path');
const fs = require('fs');
const WS = require('ws');

const PORTA = process.env.MAPPAI_PORTA || '9333';
const IMG = process.env.IMG_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - guida docenti', 'img');
let ws, id = 0, attesi = new Map();
const ascolti = new Map();          /* metodo CDP → [callback]: vedi `suEvento` */
const erroriConsole = [];

/** si collega alla pagina dell'app (index.html) o, con `filtro` (RegExp sull'URL), a un'altra finestra — es. quella
 *  aperta con window.open('about:blank') che fa da TELEFONO dell'allievo (Target.createTarget non c'è in Electron) */
async function collega(filtro) {
  const r = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
  const pagine = (await r.json()).filter((x) => x.type === 'page');
  const t = filtro ? pagine.find((x) => filtro.test(x.url)) : (pagine.find((x) => /index\.html/.test(x.url)) || pagine[0]);
  if (!t) throw new Error('nessuna pagina su :' + PORTA);
  ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((ok, ko) => { ws.on('open', ok); ws.on('error', ko); });
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && attesi.has(m.id)) { attesi.get(m.id)(m); attesi.delete(m.id); }
    /* gli EVENTI (non le risposte): `Page.screencastFrame` per il video. Chi ascolta si
       registra con `suEvento`; senza questo giro servirebbe una SECONDA connessione CDP
       alla stessa pagina, che è il modo noto per appendere tutto (LEGGIMI, trappola 5). */
    if (m.method && ascolti.has(m.method)) ascolti.get(m.method).forEach((f) => { try { f(m.params); } catch (e) { /* un ascoltatore rotto non ferma la corsa */ } });
    if (m.method === 'Runtime.exceptionThrown') erroriConsole.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erroriConsole.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
  });
  await invia('Runtime.enable');
  await invia('Page.enable');
  fs.mkdirSync(IMG, { recursive: true });
  return t;
}
function chiudi() { try { ws.close(); } catch (e) { /* già chiuso */ } }
/** ascolta un EVENTO CDP (es. 'Page.screencastFrame'); torna la funzione che lo stacca */
function suEvento(metodo, fn) {
  if (!ascolti.has(metodo)) ascolti.set(metodo, []);
  ascolti.get(metodo).push(fn);
  return () => { const a = ascolti.get(metodo) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
}
function invia(method, params) {
  const n = ++id;
  return new Promise((ok) => { attesi.set(n, ok); ws.send(JSON.stringify({ id: n, method, params: params || {} })); });
}
async function val(expr) {
  const r = await invia('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) {
    const ex = r.result.exceptionDetails;
    throw new Error('CDP: ' + ((ex.exception && ex.exception.description) || ex.text));
  }
  return r.result && r.result.result ? r.result.result.value : undefined;
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── localStorage e ricarica ─────────────────────────────────────────── */
async function ls(chiave, valore) {
  if (valore === undefined) return val(`localStorage.getItem(${JSON.stringify(chiave)})`);
  if (valore === null) return val(`(localStorage.removeItem(${JSON.stringify(chiave)}), 1)`);
  return val(`(localStorage.setItem(${JSON.stringify(chiave)}, ${JSON.stringify(String(valore))}), 1)`);
}
async function ricarica(attesa) {
  await invia('Page.reload', { ignoreCache: true });
  await pausa(attesa || 2500);
  await finoA('document.readyState==="complete" && !!window.safeCreateIcons', 15000);
}
/** viewport del lettore: 1470×956 logici @2× (MacBook Air 13") */
async function metrica(w, h, dsf) {
  await invia('Emulation.setDeviceMetricsOverride', { width: w || 1470, height: h || 956, deviceScaleFactor: dsf || 2, mobile: false });
  await pausa(300);
}

/* ── geometria e input ───────────────────────────────────────────────── */
async function centro(sel) {
  const p = await val(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
    if(!e) return null; const r=e.getBoundingClientRect();
    if(!r.width||!r.height) return null;
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), r:{x:r.left,y:r.top,w:r.width,h:r.height}};})()`);
  if (!p) throw new Error('non trovato/visibile: ' + sel);
  return p;
}
async function rect(sel) {
  const p = await val(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
    if(!e) return null; const r=e.getBoundingClientRect();
    return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
  if (!p) throw new Error('non trovato: ' + sel);
  return p;
}
/** primo elemento il cui testo visibile contiene `testo` (opz. dentro `dentro`) → selettore univoco temporaneo */
async function perTesto(testo, dentro, tag) {
  const sel = await val(`(()=>{
    const root=${dentro ? 'document.querySelector(' + JSON.stringify(dentro) + ')' : 'document'}; if(!root) return null;
    const els=[...root.querySelectorAll(${JSON.stringify(tag || 'button, a, [role=button], label, summary, li, h1, h2, h3, span, div')})]
      .filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;})
      .filter(e=>(e.textContent||'').replace(/\\s+/g,' ').trim().includes(${JSON.stringify(testo)}));
    if(!els.length) return null;
    const e=els.sort((a,b)=>a.textContent.length-b.textContent.length)[0];
    window.__labN=(window.__labN||0)+1; const k='x'+window.__labN;
    e.setAttribute('data-lab', k); return '[data-lab="'+k+'"]'; })()`);
  if (!sel) throw new Error('testo non trovato: ' + testo);
  return sel;
}
async function muovi(x, y) { await invia('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
async function clicca(sel, opt) {
  const p = typeof sel === 'string' ? await centro(sel) : sel;
  await muovi(p.x, p.y);
  const button = (opt && opt.button) || 'left';
  for (const type of ['mousePressed', 'mouseReleased']) {
    await invia('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button, clickCount: 1 });
  }
  await val(`(()=>{document.querySelectorAll('[data-lab]').forEach(e=>e.removeAttribute('data-lab'));return 1})()`);
  return p;
}
async function tastoDestro(sel) {
  const p = typeof sel === 'string' ? await centro(sel) : sel;
  await muovi(p.x, p.y);
  await invia('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', clickCount: 1 });
  await invia('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', clickCount: 1 });
  return p;
}
async function scrivi(testo) { await invia('Input.insertText', { text: testo }); }
async function tasto(key, opt) {
  const o = Object.assign({ key }, opt || {});
  const mods = (o.meta ? 4 : 0) | (o.shift ? 8 : 0) | (o.ctrl ? 2 : 0) | (o.alt ? 1 : 0);
  const codes = { Enter: { code: 'Enter', windowsVirtualKeyCode: 13 }, Escape: { code: 'Escape', windowsVirtualKeyCode: 27 }, Tab: { code: 'Tab', windowsVirtualKeyCode: 9 } };
  const extra = codes[key] || {};
  await invia('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', key, modifiers: mods, text: key.length === 1 ? key : undefined }, extra));
  await invia('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp', key, modifiers: mods }, extra));
}
async function rotella(sel, dy) {
  const p = typeof sel === 'string' ? await centro(sel) : sel;
  await invia('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: dy || 300 });
}

/* ── evidenziazioni in pagina ─────────────────────────────────────── */
const OVERLAY_ID = '__labOverlay';
const H = `let h=document.getElementById('${OVERLAY_ID}'); if(!h){ h=document.createElement('div'); h.id='${OVERLAY_ID}';
      h.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;'; document.documentElement.appendChild(h); }`;
const GIALLO = '#f2b705';
async function overlayPulisci() {
  await val(`(()=>{ document.querySelectorAll('#${OVERLAY_ID}').forEach(e=>e.remove()); return 1; })()`);
}
/** puntatore + anello attorno al punto (x,y) in coordinate viewport */
async function puntatore(x, y, opt) {
  const o = Object.assign({ colore: GIALLO, raggio: 22 }, opt || {});
  await val(`(()=>{ ${H}
    const x=${x}, y=${y}, r=${o.raggio};
    h.innerHTML += '<div style="position:absolute;left:'+(x-r)+'px;top:'+(y-r)+'px;width:'+(2*r)+'px;height:'+(2*r)+'px;border:3px solid ${o.colore};border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.85);background:rgba(242,183,5,.18)"></div>'
      + '<svg style="position:absolute;left:'+(x-2)+'px;top:'+(y-2)+'px" width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18 L12 27 L16 25 L12 16 L20 16 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    return 1; })()`);
}
/** cornice attorno a un elemento (o rettangolo {x,y,w,h}) */
async function cornice(sel, opt) {
  const o = Object.assign({ colore: GIALLO, margine: 4, etichetta: '' }, opt || {});
  const r = typeof sel === 'string' ? await rect(sel) : sel;
  await val(`(()=>{ ${H}
    const m=${o.margine};
    const d=document.createElement('div');
    d.style.cssText='position:absolute;left:'+(${r.x}-m)+'px;top:'+(${r.y}-m)+'px;width:'+(${r.w}+2*m)+'px;height:'+(${r.h}+2*m)+'px;border:3px solid ${o.colore};border-radius:8px;box-shadow:0 0 0 3px rgba(255,255,255,.85);';
    ${o.etichetta ? `const e=document.createElement('div'); e.textContent=${JSON.stringify(o.etichetta)}; e.style.cssText='position:absolute;left:-3px;top:-28px;background:${o.colore};color:#111;font:700 13px/1 -apple-system,Helvetica,Arial,sans-serif;padding:6px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)'; d.appendChild(e);` : ''}
    h.appendChild(d); return 1; })()`);
  return r;
}
/** una banda opaca (per appoggiarci i numeri) sotto/sopra un rettangolo */
async function banda(r, opt) {
  const o = Object.assign({ altezza: 34, sotto: true, colore: '#ffffff' }, opt || {});
  const y = o.sotto ? r.y + r.h : r.y - o.altezza;
  await val(`(()=>{ ${H}
    const d=document.createElement('div');
    d.style.cssText='position:absolute;left:${r.x}px;top:${y}px;width:${r.w}px;height:${o.altezza}px;background:${o.colore};';
    h.appendChild(d); return 1; })()`);
}
/** numeri cerchiati su più elementi: [{sel|rect, n, dove, dx, dy}] */
async function numeri(voci, opt) {
  const o = Object.assign({ colore: GIALLO, dove: 'tl' }, opt || {});
  for (const v of voci) {
    const r = typeof v.sel === 'string' ? await rect(v.sel) : v.rect;
    const dove = v.dove || o.dove;
    let x = r.x - 12, y = r.y - 12;
    if (dove === 'tr') { x = r.x + r.w - 12; y = r.y - 12; }
    if (dove === 'bl') { x = r.x - 12; y = r.y + r.h - 12; }
    if (dove === 'br') { x = r.x + r.w - 12; y = r.y + r.h - 12; }
    if (dove === 'c') { x = r.x + r.w / 2 - 12; y = r.y + r.h / 2 - 12; }
    if (dove === 'l') { x = r.x - 30; y = r.y + r.h / 2 - 12; }
    if (dove === 'r') { x = r.x + r.w + 6; y = r.y + r.h / 2 - 12; }
    if (dove === 'b') { x = r.x + r.w / 2 - 12; y = r.y + r.h + 2; }
    if (dove === 't') { x = r.x + r.w / 2 - 12; y = r.y - 26; }
    if (v.dx) x += v.dx; if (v.dy) y += v.dy;
    await val(`(()=>{ ${H}
      const d=document.createElement('div'); d.textContent=${JSON.stringify(String(v.n))};
      d.style.cssText='position:absolute;left:${x}px;top:${y}px;width:24px;height:24px;border-radius:50%;background:${o.colore};color:#111;font:700 14px/24px -apple-system,Helvetica,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.4)';
      h.appendChild(d); return 1; })()`);
  }
}
/** un finto menu a tendina aperto sotto un <select> (i select nativi non si fotografano) */
async function tendinaFinta(sel, opt) {
  const o = Object.assign({ largh: 220, allinea: 'centro' }, opt || {});
  const r = await rect(sel);
  const sx = o.allinea === 'sinistra' ? r.x : r.x + r.w / 2 - o.largh / 2;
  await val(`(()=>{
    const s=document.querySelector(${JSON.stringify(sel)}); if(!s) return 0;
    ${H}
    const box=document.createElement('div');
    box.style.cssText='position:absolute;left:${sx}px;top:${r.y + r.h + 4}px;width:${o.largh}px;background:#fff;border:1px solid #c8c8c8;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:4px 0;font:13px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#111';
    let html='';
    for(const el of s.children){
      if(el.tagName==='OPTGROUP'){ html+='<div style="padding:5px 12px 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#777">'+el.label+'</div>';
        for(const op of el.children){ html+='<div style="padding:5px 12px 5px 22px;'+(op.selected?'background:#2f6df6;color:#fff;':'')+(op.disabled?'color:#999;':'')+'">'+op.textContent+'</div>'; } }
      else { html+='<div style="padding:5px 12px;'+(el.selected?'background:#2f6df6;color:#fff;':'')+(el.disabled?'color:#999;':'')+'">'+el.textContent+'</div>'; }
    }
    box.innerHTML=html; h.appendChild(box); return 1; })()`);
  return r;
}
/** un finto dialogo di sistema (macOS-like) col testo vero: i confirm() nativi non si fotografano via CDP */
async function dialogoFinto(testo, opt) {
  const o = Object.assign({ ok: 'OK', annulla: 'Annulla', titolo: 'MappAI' }, opt || {});
  await val(`(()=>{ ${H}
    const velo=document.createElement('div'); velo.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.18)'; h.appendChild(velo);
    const d=document.createElement('div');
    d.style.cssText='position:absolute;left:50%;top:22%;transform:translateX(-50%);width:420px;background:#ececec;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.15);padding:22px 20px 18px;font:13px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#111;text-align:center';
    d.innerHTML='<div style="font-weight:700;font-size:13px;margin-bottom:8px">'+${JSON.stringify(o.titolo)}+'</div>'
      + '<div style="white-space:pre-wrap;text-align:left;font-size:12px;color:#222">'+${JSON.stringify(testo)}.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'
      + '<div style="display:flex;gap:10px;margin-top:16px"><div style="flex:1;background:#fff;border:1px solid #c9c9c9;border-radius:6px;padding:5px 0;font-size:13px">'+${JSON.stringify(o.annulla)}+'</div><div style="flex:1;background:#2f6df6;color:#fff;border-radius:6px;padding:5px 0;font-size:13px;font-weight:600">'+${JSON.stringify(o.ok)}+'</div></div>';
    h.appendChild(d); return 1; })()`);
}

/* ── screenshot ───────────────────────────────────────────────────── */
async function scatta(nome, opt) {
  const o = Object.assign({ scala: 2, formato: 'png', margine: 12 }, opt || {});
  const params = { format: o.formato, fromSurface: true, captureBeyondViewport: false };
  if (o.formato === 'jpeg' || o.formato === 'webp') params.quality = o.qualita || 90;
  let clip = null;
  if (o.sel) { const r = await rect(o.sel); clip = { x: r.x - o.margine, y: r.y - o.margine, width: r.w + 2 * o.margine, height: r.h + 2 * o.margine }; }
  if (o.clip) clip = o.clip;
  if (clip) {
    const vw = await val('innerWidth'), vh = await val('innerHeight');
    clip.x = Math.max(0, clip.x); clip.y = Math.max(0, clip.y);
    clip.width = Math.min(clip.width, vw - clip.x); clip.height = Math.min(clip.height, vh - clip.y);
    params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: o.scala };
  }
  const r = await invia('Page.captureScreenshot', params);
  if (!r.result || !r.result.data) throw new Error('screenshot fallito: ' + JSON.stringify(r));
  const f = path.join(IMG, nome + '.' + (o.formato === 'jpeg' ? 'jpg' : o.formato));
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
  const kb = Math.round(fs.statSync(f).size / 1024);
  console.log('  📷 ' + path.basename(f) + ' (' + kb + ' KB)' + (clip ? ' clip ' + Math.round(clip.width) + '×' + Math.round(clip.height) : ''));
  return f;
}
async function finoA(expr, quanto) {
  const fine = Date.now() + (quanto || 12000);
  for (;;) {
    const v = await val(expr);
    if (v) return v;
    if (Date.now() > fine) return null;
    await pausa(200);
  }
}
/** via overlay, selezioni, tooltip, toast e menu contestuale: prima di ogni scatto */
async function pulito() {
  await val(`(()=>{
    try{ getSelection().removeAllRanges(); }catch(e){}
    try{ document.querySelectorAll('[data-lab]').forEach(e=>e.removeAttribute('data-lab')); }catch(e){}
    try{ document.querySelectorAll('#toast-container .toast, .mappai-toast').forEach(e=>e.remove()); }catch(e){}
    try{ const cm=document.getElementById('node-context-menu'); if(cm) cm.classList.add('hidden'); }catch(e){}
    return 1; })()`);
  await overlayPulisci();
  await muovi(2, 2);
  await pausa(150);
}
/** Simula il rilascio di file veri sulla finestra (DOM.setFileInputFiles + DragEvent sul window) */
async function rilascia(percorsi, bersaglio) {
  await val(`(()=>{ let i=document.getElementById('__labFile'); if(!i){ i=document.createElement('input'); i.type='file'; i.multiple=true; i.id='__labFile'; i.style.cssText='position:fixed;left:-9999px;top:0'; document.body.appendChild(i);} i.value=''; return 1; })()`);
  const doc = await invia('DOM.getDocument', { depth: 1 });
  const q = await invia('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#__labFile' });
  const r = await invia('DOM.setFileInputFiles', { files: percorsi, nodeId: q.result.nodeId });
  if (r.error) throw new Error('setFileInputFiles: ' + JSON.stringify(r.error));
  const esito = await val(`(()=>{ const i=document.getElementById('__labFile'); const dt=new DataTransfer();
    for(const f of i.files) dt.items.add(f);
    const ev=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt});
    (${bersaglio ? 'document.querySelector(' + JSON.stringify(bersaglio) + ')' : 'window'}).dispatchEvent(ev); return {n:i.files.length, types:[...dt.types]}; })()`);
  return esito;
}
/** mette file VERI in un <input type=file> dell'app e scatena `change` (il dialogo nativo non si pilota) */
async function fileIn(sel, percorsi) {
  const doc = await invia('DOM.getDocument', { depth: 1 });
  const q = await invia('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel });
  if (!q.result || !q.result.nodeId) throw new Error('input non trovato: ' + sel);
  const r = await invia('DOM.setFileInputFiles', { files: percorsi, nodeId: q.result.nodeId });
  if (r.error) throw new Error('setFileInputFiles: ' + JSON.stringify(r.error));
  return r;
}

module.exports = { collega, chiudi, invia, suEvento, val, ls, ricarica, metrica, centro, rect, perTesto, muovi, clicca, tastoDestro, scrivi, tasto, rotella,
  puntatore, cornice, banda, numeri, tendinaFinta, dialogoFinto, overlayPulisci, scatta, finoA, pulito, rilascia, fileIn, pausa, IMG, PORTA, erroriConsole };
