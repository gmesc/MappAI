/*
 * mappai-dev-selftest.js — Pannello DEV: verifica gli agganci a runtime
 * --------------------------------------------------------------------
 * Gli moduli studio/PT dipendono da globali di app.js (renderGraph, cleanLabel,
 * d3, appState, simulateNodeClick/zoomToNode, #map-svg, circle.node-circle) e dai
 * propri namespace. Questo pannello li controlla in app e produce un REPORT
 * COPIABILE: se un nome/selettore reale differisce, lo vedi (e lo sonda anche tra
 * gli alternativi) → si capisce subito cosa correggere.
 *
 * Bottone 🩺 in basso a sinistra. Auto-log in console all'avvio.
 * Caricare per ULTIMO (dopo tutti i moduli studio).
 */
(function () {
  'use strict';

  function AS() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function hasGlobal(name) { try { return typeof window[name] !== 'undefined' && window[name] != null; } catch (e) { return false; } }
  function isFn(name) { return typeof window[name] === 'function'; }
  function bareDefined(name) { try { return eval('typeof ' + name) !== 'undefined'; } catch (e) { return false; } }
  function qcount(sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } }

  // [nome, tipo, critico, chi lo usa, test()]
  function checks() {
    const st = AS();
    return [
      ['appState', 'global', true, 'tutti', () => !!st],
      ['appState.db.nodes', 'dati', true, 'tutti', () => (st && st.db && Array.isArray(st.db.nodes)) ? st.db.nodes.length : false],
      ['d3', 'global', true, 'mastery-view', () => bareDefined('d3')],
      ['renderGraph', 'funzione', true, 'mastery-view', () => isFn('renderGraph')],
      ['#map-svg', 'dom', true, 'mastery-view', () => qcount('#map-svg') > 0],
      ['circle.node-circle', 'dom', true, 'mastery-view (tinta nodi)', () => qcount('circle.node-circle')],
      ['cleanLabel', 'funzione', false, 'cloze/study-path/mastery', () => isFn('cleanLabel')],
      ['simulateNodeClick | zoomToNode', 'funzione', false, 'study-path (focus)', () => isFn('simulateNodeClick') || isFn('zoomToNode')],
      ['showToast', 'funzione', false, 'avvisi', () => isFn('showToast')],
      ['MappAIMastery', 'namespace', true, 'keystone', () => hasGlobal('MappAIMastery')],
      ['MappAIMasteryView', 'namespace', true, '🎯', () => hasGlobal('MappAIMasteryView')],
      ['MappAICloze', 'namespace', true, '📝', () => hasGlobal('MappAICloze')],
      ['MappAICeleration', 'namespace', true, '📈', () => hasGlobal('MappAICeleration')],
      ['MappAIStudyPath', 'namespace', true, '🧭', () => hasGlobal('MappAIStudyPath')],
      ['MappAIPalace', 'namespace', true, '🏛️', () => hasGlobal('MappAIPalace')],
      ['ActiveStudy', 'namespace', true, '7 modi', () => hasGlobal('ActiveStudy')]
    ];
  }

  // Sonde DOM: se i selettori attesi sono 0, cosa C'È davvero nel grafo?
  function probes() {
    return {
      'circle': qcount('circle'),
      'circle.node-circle': qcount('circle.node-circle'),
      'circle.node-hitbox': qcount('circle.node-hitbox'),
      'text.node-text': qcount('text.node-text'),
      'g.node': qcount('g.node'),
      '[class*="node"]': qcount('[class*="node"]'),
      'path.link': qcount('path.link'),
      '.link': qcount('.link'),
      'svg#map-svg': qcount('svg#map-svg'),
      'svg': qcount('svg')
    };
  }

  function run() {
    return checks().map(([name, kind, crit, need, test]) => {
      let val; try { val = test(); } catch (e) { val = false; }
      const ok = !!val;
      return { name, kind, crit, need, ok, val: (typeof val === 'number') ? val : (ok ? '✓' : '—') };
    });
  }

  function buildReport(rows, pr) {
    const st = AS();
    const lines = [];
    lines.push('=== MappAI DEV SELF-TEST ===');
    lines.push('mappa aperta: ' + ((st && st.db && st.db.nodes) ? st.db.nodes.length + ' nodi' : 'NO') + ' · extractionMode: ' + ((st && st.extractionMode) || '?'));
    lines.push('');
    rows.forEach(r => {
      const mark = r.ok ? 'OK ' : (r.crit ? 'XX ' : '.. ');
      lines.push(mark + r.name + '  [' + r.kind + (r.crit ? ', critico' : '') + ']  ' + (typeof r.val === 'number' ? '(' + r.val + ')' : '') + '  → ' + r.need);
    });
    const missingCrit = rows.filter(r => r.crit && !r.ok).map(r => r.name);
    lines.push('');
    lines.push('CRITICI MANCANTI: ' + (missingCrit.length ? missingCrit.join(', ') : 'nessuno ✓'));
    lines.push('');
    lines.push('--- sonde DOM (cosa c\'è nel grafo) ---');
    Object.keys(pr).forEach(k => lines.push('  ' + k + ' = ' + pr[k]));
    return lines.join('\n');
  }

  function openPanel() {
    const rows = run();
    const pr = probes();
    const report = buildReport(rows, pr);

    document.getElementById('dst-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'dst-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';

    const rowsHtml = rows.map(r => {
      const color = r.ok ? '#16a34a' : (r.crit ? '#dc2626' : '#d97706');
      const mark = r.ok ? '✓' : (r.crit ? '✗' : '○');
      const cnt = (typeof r.val === 'number') ? ` <b>(${r.val})</b>` : '';
      return `<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;font-size:13px">
          <span style="color:${color};font-weight:700;width:14px">${mark}</span>
          <code style="color:#0f172a">${r.name}</code>${cnt}
          <span style="margin-left:auto;color:#94a3b8;font-size:11px">${r.need}</span></div>`;
    }).join('');
    const missingCrit = rows.filter(r => r.crit && !r.ok);

    modal.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:20px">🩺</span><b style="color:#0f172a;font-size:16px">Dev self-test</b>
          <button id="dst-x" style="margin-left:auto;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:22px">×</button></div>
        <div style="padding:8px 10px;border-radius:10px;margin-bottom:10px;font-size:13px;font-weight:600;background:${missingCrit.length ? '#fef2f2' : '#f0fdf4'};color:${missingCrit.length ? '#b91c1c' : '#15803d'}">
          ${missingCrit.length ? '✗ ' + missingCrit.length + ' critici mancanti: ' + missingCrit.map(r => r.name).join(', ') : '✓ Tutti i critici presenti'}</div>
        ${rowsHtml}
        <div style="margin-top:10px;font-size:11px;color:#94a3b8">Apri una mappa e premi <b>Ricontrolla</b>: <code>#map-svg</code>/<code>circle.node-circle</code> esistono solo a grafo renderizzato.</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button id="dst-recheck" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600">Ricontrolla</button>
          <button id="dst-copy" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600">Copia report</button>
        </div>
        <textarea id="dst-report" readonly style="width:100%;height:120px;margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-family:monospace;font-size:11px;color:#334155">${report}</textarea>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#dst-x').onclick = () => modal.remove();
    modal.querySelector('#dst-recheck').onclick = () => { modal.remove(); openPanel(); };
    modal.querySelector('#dst-copy').onclick = () => {
      const ta = modal.querySelector('#dst-report');
      try { navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand && document.execCommand('copy'); }
      const btn = modal.querySelector('#dst-copy'); btn.textContent = 'Copiato ✓';
    };
  }

  function injectBtn() {
    if (document.getElementById('dst-btn')) return;
    const b = document.createElement('button');
    b.id = 'dst-btn';
    b.title = 'Dev self-test (agganci runtime)';
    b.textContent = '🩺';
    b.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:9996;width:44px;height:44px;border-radius:50%;border:1.5px solid #64748b;background:#fff;color:#334155;font-size:18px;cursor:pointer;box-shadow:0 6px 18px -6px rgba(15,23,42,.4)';
    b.onclick = () => openPanel();
    document.body.appendChild(b);
  }

  function autolog() {
    const rows = run();
    const miss = rows.filter(r => r.crit && !r.ok).map(r => r.name);
    if (miss.length) console.warn('[DevSelfTest] CRITICI mancanti:', miss.join(', '), '— premi 🩺 per il report');
    else console.log('[DevSelfTest] tutti i critici presenti ✓ (premi 🩺 per il report)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { injectBtn(); autolog(); });
  else { injectBtn(); autolog(); }
})();
