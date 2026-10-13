/* Packet 0070: HTML di stampa dalla sorgente, senza I/O o archivio legacy.
 * renderStudent/Guide sono anteprime. preparePdf aspetta i font incorporati
 * prima di consegnare l'HTML all'IPC esistente (aggancio nel controller).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./mappai-percorso-lettura-core'), require('./mappai-percorso-lettura-view'),
    require('./mappai-doc-head'), require('./mappai-font-core'));
  else root.MappAIPercorsoLetturaPrint = factory(root.MappAIPercorsoLetturaCore, root.MappAIPercorsoLetturaView,
    root.MappAIDocHead, root.MappAIFontCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, View, Head, Fonts) {
  'use strict';
  function _tSafe(k, f) { return typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(k, f) : f; }
  function requireValue(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
  // Default della Sintesi, mappai-branch-synthesis.js @media print (09/10/26).
  // 10px fra paragrafi / (13pt × 4/3 px/pt) = 15/26 em.
  function defaults(fontId) {
    return { mode: 'text-and-questions', font: fontId || Fonts.DEFAULT, size: 13, line: 1.7,
      gap: 15 / 26, spacing: 0, marginTop: 20, marginRight: 20, marginBottom: 25, marginLeft: 20,
      includeHelp: true, includeGuide: true };
  }
  function preferences(values, fontId) {
    const v = { ...defaults(fontId), ...(values || {}) };
    requireValue(['text-and-questions', 'questions-only'].includes(v.mode), 'print_mode_required');
    const style = View.typography({ fontId: v.font, fontSize: Number(v.size), lineHeight: Number(v.line),
      paragraphGap: Number(v.gap), letterSpacing: Number(v.spacing) });
    const out = { mode: v.mode, font: style.fontId, size: style.fontSize, line: style.lineHeight,
      gap: style.paragraphGap, spacing: style.letterSpacing };
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const n = Number(values?.margin ?? values?.['margin' + side] ?? v['margin' + side]);
      requireValue(Number.isFinite(n) && n >= 10 && n <= 35, 'invalid_print_margin'); out['margin' + side] = n;
    }
    for (const key of ['includeHelp', 'includeGuide']) {
      requireValue(typeof v[key] === 'boolean', 'invalid_print_preference'); out[key] = v[key];
    }
    return out;
  }
  function presets(list) {
    requireValue(Array.isArray(list) && list.length <= 50, 'invalid_print_presets');
    const seen = new Set();
    return list.map(p => {
      requireValue(p && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(p.id) && !seen.has(p.id) &&
        typeof p.name === 'string' && p.name.trim() && p.name.length <= 80, 'invalid_print_presets');
      seen.add(p.id); return { id: p.id, name: p.name.trim(), values: preferences(p.values) };
    });
  }
  function documentSettings(options) {
    const o = options || {}, d = defaults(), style = View.typography(Object.assign({ fontSize: d.size,
      lineHeight: d.line, paragraphGap: d.gap, letterSpacing: d.spacing }, o.typography));
    const margin = o.margin === undefined ? d.marginTop : o.margin;
    requireValue(typeof margin === 'number' && Number.isFinite(margin) && margin >= 10 && margin <= 35, 'invalid_print_margin');
    const margins = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => {
      const n = o.margins?.[side] ?? (o.margin === undefined ? d['margin' + side[0].toUpperCase() + side.slice(1)] : margin);
      requireValue(typeof n === 'number' && Number.isFinite(n) && n >= 10 && n <= 35, 'invalid_print_margin'); return [side, n];
    }));
    ['title', 'language'].forEach(k => requireValue(typeof o[k] === 'string' && o[k].trim(), 'missing_print_' + k));
    return { typography: style, margin, margins, title: o.title, language: o.language };
  }
  function settings(options) {
    const o = options || {};
    requireValue(['text-and-questions', 'questions-only'].includes(o.mode), 'print_mode_required');
    const base = documentSettings(o);
    ['verificaId', 'versioneId'].forEach(k => requireValue(typeof o[k] === 'string' && o[k].trim(), 'missing_print_' + k));
    for (const key of ['includeHelp', 'includeGuide']) requireValue(o[key] === undefined || typeof o[key] === 'boolean', 'invalid_print_preference');
    return { mode: o.mode, ...base, includeHelp: o.includeHelp !== false, includeGuide: o.includeGuide !== false,
      verificaId: o.verificaId, versioneId: o.versioneId };
  }
  function questionHtml(a, number, guide) {
    const esc = Head.esc;
    const options = a.format === 'mc' ? '<ol type="A" class="lettura-options">' + a.options.map(option =>
      '<li data-option-id="' + esc(option.id) + '">' + Core.inlineHtml(a, 'option-' + a.options.indexOf(option), option.text) + '</li>').join('') + '</ol>' :
      guide ? '' : '<div class="lettura-answer-lines" aria-label="' + esc(_tSafe('sp_answer', 'La tua risposta')) + '">' +
      Array.from({ length: a.lines }, () => '<div class="lettura-answer-line">&#160;</div>').join('') + '</div>';
    return '<section class="lettura-print-question" data-activity-id="' + esc(a.id) + '"><h2 class="lettura-prompt">' +
      number + '. ' + Core.inlineHtml(a, 'question', a.question) + '</h2>' + options +
      (a.help ? '<p class="lettura-help">' + Core.inlineHtml(a, 'help', a.help) + '</p>' : '') + '</section>';
  }
  function documentShell(body, o, guide, fontCss) {
    const style = o.typography, esc = Head.esc;
    const type = guide ? _tSafe('qp_guides', 'Indicazioni per la correzione') : o.verificaId ? _tSafe('qp_questions', 'Domande') : _tSafe('pl_materials_section', 'Attività e verifiche');
    const identity = o.verificaId ? '<p class="lettura-print-identity" data-verifica-id="' + esc(o.verificaId) + '" data-versione-id="' + esc(o.versioneId) +
      '">' + esc(o.verificaId) + ' · ' + esc(o.versioneId) + '</p>' : '';
    return '<!doctype html><html lang="' + esc(o.language) + '"><head><meta charset="utf-8"><meta name="viewport" ' +
      'content="width=device-width, initial-scale=1"><title>' + esc(o.title) + '</title><style>' +
      (fontCss || ':root{--doc-font:' + Fonts.stackDi(style.fontId) + ';}') +
      Head.stile({ pagina: { size: 'A4', margine: (new Set(Object.values(o.margins)).size === 1 ? o.margins.top + 'mm' :
        ['top', 'right', 'bottom', 'left'].map(k => o.margins[k] + 'mm').join(' ')) } }) +
      'body{font-family:var(--doc-font);font-size:' + style.fontSize + 'pt;line-height:' + style.lineHeight +
      ';letter-spacing:' + style.letterSpacing + 'em;color:#172033;background:#fff;margin:0;}' +
      'main{max-width:100%;}h2{font-size:1.15em;}h2,h3,.lettura-heading{break-after:avoid;page-break-after:avoid;}' +
      '.lettura-paragraph,.lettura-help,.lettura-guide p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 ' + style.paragraphGap + 'em;orphans:3;widows:3;}' +
      '.lettura-list{padding-inline-start:1.5em;}.lettura-prompt,.lettura-options li,.lettura-guide{white-space:pre-wrap;overflow-wrap:anywhere;}' +
      '.lettura-print-question{break-inside:avoid;page-break-inside:avoid;margin:1.3em 0;}' +
      '.lettura-prompt{font-size:1em;font-weight:600;margin:0 0 .5em;}.lettura-options li{padding:.25em 0;break-inside:avoid;}' +
      '.lettura-answer-line{border-bottom:1px solid #94a3b8;min-height:1.8em;}' +
      '.lettura-print-identity{font-size:9pt;color:#475569;overflow-wrap:anywhere;}.lettura-guide{margin:.75em 0;}' +
      '.lettura-guide-field{break-inside:avoid;page-break-inside:avoid;}' +
      '@media screen{body{max-width:180mm;margin:20px auto;padding:16px;}}' +
      '</style></head><body>' + Head.testata({ titolo: o.title, tipo: type, data: false }) +
      identity + '<main>' + body + '</main></body></html>';
  }
  function shell(body, options, guide, fontCss) { return documentShell(body, settings(options), guide, fontCss); }
  function contentBody(content, includeText) {
    Core.validatePublicContent(content);
    const paragraphs = new Map(content.source.paragraphs.map(p => [p.id, p]));
    const activities = new Map(content.activities.map(a => [a.id, a]));
    let number = 0;
    return content.sequence.map(b => b.kind === 'paragraph' ?
      (includeText ? View.paragraphHtml(paragraphs.get(b.paragraphId)) : '') :
      questionHtml(activities.get(b.activityId), ++number)).join('');
  }
  function studentBody(content, options) {
    const o = settings(options), clean = JSON.parse(JSON.stringify(content));
    if (!o.includeHelp) clean.activities.forEach(a => { delete a.help; if (a.inline) delete a.inline.help; });
    return contentBody(clean, o.mode === 'text-and-questions');
  }
  function renderStudent(content, options) { return shell(studentBody(content, options), options, false); }
  function guideBody(draft, activityIds, options) {
    Core.validateDraft(draft);
    const content = Core.projectPublicContent(draft, activityIds, options);
    const privateRows = new Map(draft.activities.map(a => [a.id, a]));
    const esc = Head.esc;
    return content.sequence.filter(b => b.kind === 'activity').map((b, i) => {
      const a = content.activities.find(item => item.id === b.activityId);
      const privateItem = privateRows.get(a.id), teacher = privateItem.teacher;
      const key = a.format === 'mc' ? '<p>' + esc(_tSafe('rv_correct', 'Risposta corretta')) + ': ' +
        esc(a.options.find(option => option.id === teacher.correctOptionId).text) + '</p>' : '';
      const criteria = teacher.criteria.map(c => '<li>' + esc(c) + '</li>').join('');
      const evidence = teacher.evidence.map(e => '<li><span>' + esc(_tSafe('pl_print_passage', 'Passaggio') + ' ' + (draft.source.paragraphs.findIndex(p => p.id === e.paragraphId) + 1)) + '</span>: <q>' + esc(e.quote) + '</q></li>').join('');
      const distractors = a.format === 'mc' ? '<ul>' + teacher.distractors.map(d => '<li>' +
        esc(a.options.find(option => option.id === d.optionId).text) + ' — ' + Core.inlineHtml(privateItem, 'reason-' + a.options.findIndex(o => o.id === d.optionId), d.reason) + '</li>').join('') + '</ul>' : '';
      const teachingLabels = {
        objective: _tSafe('pl_guide_objective', 'Obiettivo di lettura'),
        reasoning: _tSafe('pl_guide_reasoning', 'Indizi e ragionamento'),
        difficultyReason: _tSafe('pl_guide_difficulty', 'Motivo della difficoltà'),
        strategy: _tSafe('pl_guide_strategy', 'Strategia'),
        modeling: _tSafe('pl_guide_modeling', 'Modellamento del docente'),
        strategyCheck: _tSafe('pl_guide_check', 'Controllo della strategia'),
        reflection: _tSafe('pl_guide_reflection', 'Riflessione'),
        fadingCriterion: _tSafe('pl_guide_fading', 'Quando ridurre gli aiuti'),
        acceptedAlternatives: _tSafe('pl_guide_alternatives', 'Letture ammissibili')
      };
      const teaching = Object.keys(teachingLabels).filter(k => typeof teacher.teaching?.[k] === 'string' && teacher.teaching[k].trim())
        .map(k => '<section class="lettura-guide-field"><h3>' + esc(teachingLabels[k]) + '</h3><p>' + Core.inlineHtml(privateItem, 'teaching-' + k, teacher.teaching[k]) + '</p></section>').join('');
      return questionHtml(a, i + 1, true) + '<div class="lettura-guide">' + key + '<p>' + Core.inlineHtml(privateItem, 'answer', teacher.answer) + '</p>' +
        '<h3>' + esc(_tSafe('rv_criteria', 'Criteri di correzione')) + '</h3><ul>' + criteria + '</ul><ul>' + evidence +
        '</ul>' + distractors + teaching + '</div>';
    }).join('');
  }
  function renderGuide(draft, activityIds, options) {
    return shell(guideBody(draft, activityIds, options), Object.assign({}, options, { mode: 'questions-only' }), true);
  }
  async function embeddedFonts(o, fontRuntime) {
    requireValue(fontRuntime && typeof fontRuntime.precaricaIncorporabile === 'function' &&
      typeof fontRuntime.styleDocumento === 'function', 'font_runtime_missing');
    requireValue(await fontRuntime.precaricaIncorporabile(o.typography.fontId), 'font_not_embedded');
    return fontRuntime.styleDocumento(o.typography.fontId);
  }
  async function withFonts(body, o, guide, fontRuntime) {
    return shell(body, o, guide, await embeddedFonts(o, fontRuntime));
  }
  async function prepareWorkingDocument(content, options, fontRuntime) {
    // Derivato privato della bozza: nessuna identità assegnata o sessione allievo.
    // Testo e opzioni sono fotografati prima dell'attesa; la barra vive in ELABORA.
    const o = documentSettings(options), body = contentBody(content, true);
    return documentShell(body, o, false, await embeddedFonts(o, fontRuntime));
  }
  async function prepareWorkingPrint(draft, options, fontRuntime) {
    Core.validateDraft(draft); const snapshot = JSON.parse(JSON.stringify(draft)), o = documentSettings(options);
    const ids = snapshot.activities.map(a => a.id), content = Core.projectPublicContent(snapshot, ids, options);
    const body = contentBody(content, true) + (options.includeGuide !== false ?
      '<section class="lettura-teacher-pages" style="break-before:page">' + guideBody(snapshot, ids, options) + '</section>' : '');
    return documentShell(body, o, false, await embeddedFonts(o, fontRuntime));
  }
  async function prepareWorkingGuide(draft, activityIds, options, fontRuntime) {
    Core.validateDraft(draft);
    const o = documentSettings(options), body = guideBody(draft, activityIds, options);
    return documentShell(body, o, true, await embeddedFonts(o, fontRuntime));
  }
  async function preparePdf(content, options, fontRuntime) {
    // Fotografia PRIMA dell'attesa dei font: il documento deve corrispondere
    // alla versione richiesta anche se nel frattempo cambia la bozza a schermo.
    const o = settings(options);
    return withFonts(studentBody(content, o), o, false, fontRuntime);
  }
  async function prepareGuidePdf(draft, activityIds, options, fontRuntime) {
    const o = settings(Object.assign({}, options, { mode: 'questions-only' }));
    return withFonts(guideBody(draft, activityIds, o), o, true, fontRuntime);
  }
  // Runs only in the exported file. The application never uses this storage.
  function workbookRuntime() {
    'use strict';
    const packet = JSON.parse(document.getElementById('wb-data').textContent), labels = packet.labels;
    const byId = new Map(packet.content.activities.map(a => [a.id, a]));
    const get = id => document.getElementById(id), fields = Array.from(document.querySelectorAll('[data-answer]'));
    const identity = JSON.stringify(packet.identity), key = 'mappai-lettura@1:' + JSON.stringify(packet.identity.ids);
    const sessions = new Map(), baselines = new Map(), dirty = new Set();
    let active = null, blocked = '';
    const status = message => { get('wb-status').textContent = message; };
    const valid = row => row && Object.keys(row).every(k => ['sessioneId', 'student', 'writeId', 'updatedAt', 'answers'].includes(k)) &&
      typeof row.sessioneId === 'string' && row.sessioneId.length > 0 &&
      typeof row.student === 'string' && row.student.trim() && typeof row.writeId === 'string' &&
      typeof row.updatedAt === 'string' && row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers) &&
      Object.entries(row.answers).every(([id, value]) => byId.has(id) && typeof value === 'string' &&
        (byId.get(id).format === 'open' || value === '' || byId.get(id).options.some(o => o.id === value)));
    function read() {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return { identity: packet.identity, sessions: [] };
      let box;
      try { box = JSON.parse(raw); } catch (_) { blocked = labels.invalidSession; throw new Error(blocked); }
      if (!box || JSON.stringify(box.identity) !== identity) { blocked = labels.conflict; throw new Error(blocked); }
      if (Object.keys(box).some(k => !['identity', 'sessions'].includes(k)) || !Array.isArray(box.sessions) || !box.sessions.every(valid) ||
          new Set(box.sessions.map(r => r.sessioneId)).size !== box.sessions.length) {
        blocked = labels.invalidSession; throw new Error(blocked);
      }
      return box;
    }
    // Native random IDs distinguish two attempts by learners with the same name.
    const newId = () => Array.from(window.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    function choose() {
      const select = get('wb-session'); select.replaceChildren();
      const add = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; select.appendChild(o); };
      add('', labels.newSession);
      for (const row of sessions.values()) if (row.student === get('wb-student').value.trim())
        add(row.sessioneId, row.updatedAt + ' · ' + row.sessioneId.slice(-8));
    }
    const answerFor = id => active && Object.prototype.hasOwnProperty.call(active.answers, id) ? active.answers[id] : '';
    function display() {
      for (const field of fields) {
        const value = answerFor(field.dataset.answer);
        if (field.type === 'radio') field.checked = value === field.value; else field.value = value;
      }
      for (const node of document.querySelectorAll('[data-response]')) {
        const a = byId.get(node.dataset.response), value = answerFor(a.id);
        node.textContent = value ? (a.format === 'mc' ? a.options.find(o => o.id === value).text : value) : labels.emptyAnswer;
      }
      get('wb-person').textContent = active ? active.student + ' · ' + active.sessioneId : '';
      get('wb-work').hidden = !active;
      get('wb-copy').disabled = !active;
    }
    async function persist() {
      const target = active, report = message => { if (active === target) status(message); };
      dirty.add(target.sessioneId); report(blocked || labels.unsaved);
      if (blocked) return;
      try {
        if (!window.navigator || !window.navigator.locks || typeof window.navigator.locks.request !== 'function') throw new Error('storage_lock_unavailable');
        // One native lock covers the entire document box across tabs, including different sessions.
        await window.navigator.locks.request(key, () => {
          if (blocked) { report(blocked); return; }
          const box = read(), previous = box.sessions.find(r => r.sessioneId === target.sessioneId);
          if (JSON.stringify(previous || null) !== baselines.get(target.sessioneId)) {
            blocked = labels.conflict; report(blocked); return;
          }
          const snapshot = { sessioneId: target.sessioneId, student: target.student, answers: { ...target.answers },
            updatedAt: new Date().toISOString(), writeId: newId() };
          box.sessions = box.sessions.filter(r => r.sessioneId !== target.sessioneId).concat(snapshot);
          window.localStorage.setItem(key, JSON.stringify(box));
          target.updatedAt = snapshot.updatedAt; target.writeId = snapshot.writeId;
          baselines.set(target.sessioneId, JSON.stringify(snapshot)); dirty.delete(target.sessioneId); report(labels.saved);
        });
      } catch (_) { report(blocked || labels.unsaved); }
    }
    try {
      for (const row of read().sessions) { sessions.set(row.sessioneId, row); baselines.set(row.sessioneId, JSON.stringify(row)); }
    } catch (_) { status(blocked || labels.unsaved); }
    if (packet.backup && valid(packet.backup)) {
      // A portable backup is a separate attempt: never silently replace a newer local attempt.
      const row = packet.backup;
      if (sessions.has(row.sessioneId) && JSON.stringify(sessions.get(row.sessioneId)) !== JSON.stringify(row)) row.sessioneId = newId();
      if (!sessions.has(row.sessioneId)) { sessions.set(row.sessioneId, row); baselines.set(row.sessioneId, 'null'); }
    }
    get('wb-student').addEventListener('input', () => { active = null; display(); choose(); });
    get('wb-session').addEventListener('change', () => { active = null; display(); });
    get('wb-form').addEventListener('submit', event => {
      event.preventDefault(); const student = get('wb-student').value.trim();
      if (!student) { status(labels.invalidSession); return; }
      const id = get('wb-session').value;
      active = id ? sessions.get(id) : { sessioneId: newId(), student, answers: {}, updatedAt: new Date().toISOString(), writeId: '' };
      if (!active || active.student !== student) { active = null; display(); status(labels.invalidSession); return; }
      if (!id) { sessions.set(active.sessioneId, active); baselines.set(active.sessioneId, 'null'); }
      display(); persist(); choose(); get('wb-session').value = active.sessioneId;
    });
    for (const field of fields) field.addEventListener('input', () => {
      if (!active) return;
      active.answers[field.dataset.answer] = field.value; display(); persist();
    });
    for (const link of document.querySelectorAll('[data-go]')) link.addEventListener('click', () => {
      const node = Array.from(document.querySelectorAll('[data-paragraph-id]')).find(p => p.dataset.paragraphId === link.dataset.go);
      if (node) { node.scrollIntoView({ block: 'start' }); node.focus({ preventScroll: true }); }
    });
    get('wb-print').addEventListener('click', () => { display(); window.print(); });
    window.addEventListener('beforeprint', display);
    window.addEventListener('storage', event => {
      if (event.key !== key && event.key !== null) return;
      try {
        const box = read(), row = active && box.sessions.find(r => r.sessioneId === active.sessioneId);
        if (active && JSON.stringify(row || null) !== baselines.get(active.sessioneId)) {
          blocked = labels.conflict; dirty.add(active.sessioneId); status(blocked);
        }
      } catch (_) { if (active) dirty.add(active.sessioneId); status(blocked || labels.unsaved); }
    });
    get('wb-copy').addEventListener('click', () => {
      if (!active) return;
      display(); const copy = document.documentElement.cloneNode(true);
      copy.querySelector('#wb-data').textContent = JSON.stringify({ ...packet, backup: active }).replace(/</g, '\\u003c');
      copy.querySelector('#wb-student').removeAttribute('value');
      copy.querySelector('#wb-person').textContent = ''; copy.querySelector('#wb-status').textContent = '';
      copy.querySelector('#wb-work').hidden = true;
      copy.querySelectorAll('[data-answer]').forEach(f => { f.removeAttribute('checked'); if (f.tagName === 'TEXTAREA') f.textContent = ''; });
      copy.querySelectorAll('[data-response]').forEach(n => { n.textContent = labels.emptyAnswer; });
      copy.querySelector('#wb-session').replaceChildren();
      const url = URL.createObjectURL(new Blob(['<!doctype html>' + copy.outerHTML], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = packet.identity.ids.versioneId + '-risposte.html';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    window.addEventListener('beforeunload', event => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } });
    choose(); display();
  }
  async function prepareWorkbook(content, options) {
    Core.validatePublicContent(content);
    const c = JSON.parse(JSON.stringify(content)), o = settings({ ...options, mode: 'text-and-questions' });
    const labelNames = ['student', 'session', 'newSession', 'start', 'answer', 'goToText', 'print', 'saveCopy',
      'saved', 'unsaved', 'conflict', 'invalidSession', 'emptyAnswer', 'localNotice', 'systemFont'];
    const labels = Object.fromEntries(labelNames.map(k => {
      requireValue(options.labels && typeof options.labels[k] === 'string' && options.labels[k].trim(), 'missing_label_' + k);
      return [k, options.labels[k]];
    }));
    const ids = Object.fromEntries(['projectId', 'percorsoId', 'verificaId', 'versioneId'].map(k => {
      requireValue(typeof options[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(options[k]), 'invalid_workbook_' + k);
      return [k, options[k]];
    }));
    // Embed the actual common stylesheet supplied by the exporter.
    // No fetch from a portable file and no second registry of UI tokens.
    const uiCss = options.uiCss, theme = options.theme || 'dark';
    requireValue(typeof uiCss === 'string' && uiCss.trim() && !/<\/style/i.test(uiCss), 'workbook_ui_css_required');
    requireValue(['dark', 'light'].includes(theme), 'invalid_workbook_theme');
    const fontRuntime = options.fontRuntime;
    const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ?
      Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
    const bytes = new TextEncoder().encode(JSON.stringify(canonical({ content: c, title: o.title, language: o.language })));
    requireValue(globalThis.crypto && globalThis.crypto.subtle, 'fingerprint_crypto_missing');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const identity = { schemaVersion: 1, ids, fingerprint: 'sha256-' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') };
    const esc = Head.esc, rows = new Map(c.activities.map(a => [a.id, a]));
    const activities = c.sequence.filter(b => b.kind === 'activity').map((b, i) => {
      const a = rows.get(b.activityId), targets = a.reference.scope === 'whole' ? [c.source.paragraphs[0].id] : a.reference.paragraphIds;
      const links = targets.map(id => '<button class="ui-btn" type="button" data-go="' + esc(id) + '">' + esc(labels.goToText) +
        (targets.length > 1 ? ' · ' + (c.source.paragraphs.findIndex(p => p.id === id) + 1) : '') + '</button>').join('');
      const fields = a.format === 'mc' ? a.options.map(option => '<label class="wb-option"><input type="radio" name="' + esc(a.id) +
        '" data-answer="' + esc(a.id) + '" value="' + esc(option.id) + '"> ' + Core.inlineHtml(a, 'option-' + a.options.indexOf(option), option.text) + '</label>').join('') :
        '<textarea data-answer="' + esc(a.id) + '" rows="' + a.lines + '" aria-label="' + esc(labels.answer) + '"></textarea>';
      return '<fieldset class="ui-pannello wb-question' + (a.format === 'mc' ? ' wb-mc' : '') + '"><legend>' + (i + 1) + '. ' + Core.inlineHtml(a, 'question', a.question) + '</legend><small>' + esc(a.id) +
        '</small><div class="wb-navigation">' + links + '</div>' + fields + '<div class="wb-response" data-response="' + esc(a.id) + '"></div></fieldset>';
    }).join('');
    const body = '<nav class="ui-azioni wb-toolbar"><button class="ui-btn" id="wb-print" type="button">' + esc(labels.print) + '</button> <button class="ui-btn" id="wb-copy" type="button">' +
      esc(labels.saveCopy) + '</button></nav><p class="wb-notice">' + esc(labels.localNotice) + '</p>' +
      (!fontRuntime ? '<p class="wb-notice">' + esc(labels.systemFont) + '</p>' : '') +
      '<form id="wb-form"><label>' + esc(labels.student) + ' <input id="wb-student" required autocomplete="off"></label><label>' +
      esc(labels.session) + ' <select id="wb-session"></select></label><button class="ui-btn" type="submit">' + esc(labels.start) + '</button></form>' +
      '<p id="wb-status" role="status" aria-live="polite"></p><p class="lettura-print-identity">' + esc(ids.projectId) + ' · ' + esc(ids.percorsoId) +
      '</p><p id="wb-person"></p><div id="wb-work" hidden><article class="ui-pannello">' + View.sourceHtml(c) + '</article><section>' + activities + '</section></div>';
    let html = fontRuntime ? await withFonts(body, o, false, fontRuntime) : shell(body, o, false, ':root{--doc-font:system-ui,Arial,sans-serif;}');
    const css = `html.ui{--app-font:var(--doc-font)}
input,select,button,textarea{font:inherit}
.wb-header{display:none}
.wb-option{display:block;margin:.5em 0}
legend,.wb-option{white-space:pre-wrap;overflow-wrap:anywhere}
.wb-response{display:none;white-space:pre-wrap;overflow-wrap:anywhere;height:auto;max-height:none;overflow:visible}
@media screen{
  html.ui body{box-sizing:border-box;max-width:var(--ui-tetto);margin:auto;padding:var(--ui-pad);background:var(--ui-fondo);color:var(--ui-testo);font-family:var(--ui-font)}
  body>.mm-dh,body>.lettura-print-identity,main>.lettura-print-identity,#wb-person,.wb-question>small{display:none}
  .wb-header{display:block;margin:0 0 calc(var(--ui-gap) * 2);padding:var(--ui-gap) 0 calc(var(--ui-gap) * 2)}
  .wb-header h1{max-width:none;overflow-wrap:anywhere}
  .wb-toolbar{flex-wrap:wrap;margin:var(--ui-gap) 0}
  .wb-notice,#wb-status{font-size:var(--ui-fs-corpo);line-height:var(--ui-lh-corpo);color:var(--ui-testo-2);max-width:65ch;margin:var(--ui-gap) 0}
  #wb-status:empty{display:none}
  #wb-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:var(--ui-gap);align-items:end;margin:calc(var(--ui-gap) * 2) 0;padding:var(--ui-pad);border:1px solid var(--ui-bordo);border-radius:var(--ui-r-riquadro);background:var(--ui-pannello)}
  #wb-form label{display:flex;flex-direction:column;gap:calc(var(--ui-gap) / 2);font-size:var(--ui-fs-corpo);color:var(--ui-testo-2);min-width:0}
  .ui :is(button,input,select){min-height:calc(var(--ui-gap) * 4)}
  .ui :is(input:not([type=radio]),select,textarea){box-sizing:border-box;width:100%;min-width:0;padding:var(--ui-gap);border:1px solid var(--ui-bordo);border-radius:var(--ui-r);color:var(--ui-testo);background:var(--ui-fondo)}
  #wb-form :is(input,select){font-size:var(--ui-fs-btn)}
  .ui :is(input,select,textarea):focus-visible{outline:2px solid var(--ui-accento);outline-offset:2px}
  .ui textarea{display:block;min-height:6em;line-height:inherit;resize:vertical}
  #wb-work>article,.wb-question{box-sizing:border-box;min-width:0;max-width:65ch;margin:calc(var(--ui-gap) * 2) auto;padding:var(--ui-pad);overflow:visible}
  .wb-question legend{font-weight:700;padding:0 calc(var(--ui-gap) / 2);max-width:100%;box-sizing:border-box}
  .wb-navigation{display:flex;flex-wrap:wrap;gap:var(--ui-gap);margin-bottom:var(--ui-gap)}
  .wb-option{display:flex;align-items:baseline;gap:var(--ui-gap);padding:var(--ui-gap);border-radius:var(--ui-r);background:var(--ui-fondo);cursor:pointer}
  .wb-option input{flex:none;min-height:0;margin:0}
  .wb-option:has(input:checked){background:var(--ui-pannello-attivo)}
}
@media screen and (max-width:760px){#wb-form{grid-template-columns:minmax(0,1fr)}.wb-toolbar{flex-direction:column}.wb-header h1{font-size:var(--ui-fs-chip)}}
@media print{
  html.ui{color-scheme:light;background:Canvas;color:CanvasText}
  #wb-work{display:block!important}
  .wb-header,.wb-toolbar,.wb-notice,#wb-form,#wb-status,.wb-navigation,textarea{display:none!important}
  .wb-response{display:block}
  #wb-work>article,.wb-question{box-sizing:border-box;min-width:0;max-width:none;background:none;color:inherit;border-radius:0;overflow:visible}
  #wb-work>article{border:0;margin:0;padding:0}
  .wb-question{break-inside:auto;page-break-inside:auto;border:1px solid GrayText;margin:1em 0;padding:1em}
  .wb-mc{break-inside:avoid;page-break-inside:avoid}
  .wb-option{break-inside:avoid}legend{break-after:avoid}body{max-width:none;padding:0}
}`;
    html = html.replace('<html lang=', '<html class="ui" data-theme="' + theme + '" lang=')
      .replace('</style>', () => '</style><style data-mappai-ui>' + uiCss + '</style><style>' + css + '</style>')
      .replace('<body>', () => '<body><header class="ui-testata wb-header"><h1 class="ui-titolo">' + esc(o.title) + '</h1></header>');
    const data = JSON.stringify({ identity, content: c, labels }).replace(/</g, '\\u003c');
    return html.replace('</body>', () => '<script type="application/json" id="wb-data">' + data + '</script><script>(' + workbookRuntime.toString() + ')();</script></body>');
  }
  function workbookLabels() {
    return {
      student: _tSafe('pl_wb_student', 'Nome dell’allievo'), session: _tSafe('pl_wb_session', 'Sessione'),
      newSession: _tSafe('pl_wb_new', 'Nuova sessione'), start: _tSafe('pl_wb_start', 'Apri le attività'),
      answer: _tSafe('sp_answer', 'La tua risposta'), goToText: _tSafe('pl_wb_text', 'Vai al testo'),
      print: _tSafe('pl_wb_print', 'Stampa il report delle risposte'), saveCopy: _tSafe('pl_wb_copy', 'Salva una copia con le risposte'),
      saved: _tSafe('pl_wb_saved', 'Risposte salvate su questo dispositivo.'),
      unsaved: _tSafe('pl_wb_unsaved', 'Le risposte non sono salvate. Stampa il report o salva una copia.'),
      conflict: _tSafe('pl_wb_conflict', 'La sessione è cambiata in un’altra finestra. Salva una copia delle tue risposte.'),
      invalidSession: _tSafe('pl_wb_invalid', 'Sessione non disponibile. Indica il nome e apri una nuova sessione.'),
      emptyAnswer: _tSafe('pl_wb_empty', 'Nessuna risposta'),
      localNotice: _tSafe('pl_wb_local', 'Le risposte restano su questo dispositivo. Per consegnarle al docente, stampa il report o salva una copia.'),
      systemFont: _tSafe('pl_wb_font', 'Questa copia usa il carattere di sistema.')
    };
  }
  return { defaults, preferences, presets, settings, renderStudent, renderGuide, preparePdf, prepareGuidePdf, prepareWorkingDocument, prepareWorkingPrint, prepareWorkingGuide, prepareWorkbook, workbookLabels };
}));
