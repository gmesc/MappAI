/* Packet 0070: resa del contenuto PUBBLICO, comune a docente e reader.
 * Non legge appState/localStorage, non corregge risposte, non monta la mappa.
 * Le etichette specifiche arrivano tradotte dal chiamante: i dizionari e gli
 * ingressi dell'app restano ai lavori di integrazione coordinati con ADMIN.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./mappai-percorso-lettura-core'), require('./mappai-doc-head'), require('./mappai-font-core'));
  else root.MappAIPercorsoLetturaView = factory(root.MappAIPercorsoLetturaCore, root.MappAIDocHead, root.MappAIFontCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Head, Fonts) {
  'use strict';
  let nextInstance = 0;
  const clone = x => JSON.parse(JSON.stringify(x));
  function _tSafe(k, f) { return typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(k, f) : f; }
  function requireValue(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
  function bounded(value, low, high, fallback) {
    if (value === undefined) return fallback;
    requireValue(typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high, 'invalid_typography');
    return value;
  }
  function typography(options) {
    const o = options || {}, fontId = o.fontId === undefined ? Fonts.DEFAULT : o.fontId;
    requireValue(Fonts.valido(fontId), 'invalid_font');
    return { fontId, fontSize: bounded(o.fontSize, 12, 40, 18), lineHeight: bounded(o.lineHeight, 1.2, 2.5, 1.65),
      letterSpacing: bounded(o.letterSpacing, 0, 0.2, 0), paragraphGap: bounded(o.paragraphGap, 0.3, 2.5, 1) };
  }
  function typographyCss(options) {
    const o = typography(options);
    return '--lettura-font:' + Fonts.stackDi(o.fontId) + ';--lettura-size:' + o.fontSize + 'px;' +
      '--lettura-line:' + o.lineHeight + ';--lettura-spacing:' + o.letterSpacing + 'em;--lettura-gap:' + o.paragraphGap + 'em;';
  }
  function markedText(paragraph) {
    // Segmenti disgiunti: anche enfasi sovrapposte non duplicano il testo né
    // producono tag incrociati. Ogni carattere originale appare una volta.
    const ranges = paragraph.emphasis, cuts = Array.from(new Set([0, paragraph.text.length]
      .concat(ranges.flatMap(e => [e.start, e.end])))).sort((a, b) => a - b);
    return cuts.slice(0, -1).map((start, i) => {
      const end = cuts[i + 1], active = ranges.filter(e => e.start <= start && e.end >= end);
      let html = Head.esc(paragraph.text.slice(start, end));
      if (active.some(e => e.kind === 'em')) html = '<em>' + html + '</em>';
      if (active.some(e => e.kind === 'strong')) html = '<strong>' + html + '</strong>';
      return html;
    }).join('');
  }
  function paragraphHtml(paragraph) {
    // API pubblica: validare anche quando la chiama direttamente la stampa.
    Core.validatePublicContent({ source: { sourceId: 'render', sourceRevision: 1, paragraphs: [paragraph] }, activities: [],
      sequence: [{ kind: 'paragraph', paragraphId: paragraph.id }] });
    const tag = paragraph.type === 'heading' ? 'h2' : paragraph.type === 'list-item' ? 'li' : 'p';
    const html = '<' + tag + ' tabindex="-1" class="lettura-paragraph lettura-' + paragraph.type +
      '" data-paragraph-id="' + Head.esc(paragraph.id) + '">' + markedText(paragraph) + '</' + tag + '>';
    return tag === 'li' ? '<ul class="lettura-list">' + html + '</ul>' : html;
  }
  function sourceHtml(content) {
    Core.validatePublicContent(content);
    return content.source.paragraphs.map(paragraphHtml).join('');
  }
  function answersFor(content, answers) {
    Core.validatePublicContent(content);
    requireValue(answers && typeof answers === 'object' && !Array.isArray(answers), 'invalid_answers');
    const rows = new Map(content.activities.map(a => [a.id, a]));
    return Object.fromEntries(Object.entries(answers).map(([id, value]) => {
      const a = rows.get(id);
      requireValue(a && typeof value === 'string' && (a.format === 'open' || value === '' ||
        a.options.some(o => o.id === value)), 'invalid_answer');
      return [id, value];
    }));
  }
  function mount(host, content, options) {
    Core.validatePublicContent(content);
    const data = clone(content), o = options || {}, labels = o.labels || {}, doc = host.ownerDocument;
    ['goToText', 'resize', 'expandText', 'expandQuestions', 'restore'].forEach(k =>
      requireValue(typeof labels[k] === 'string' && labels[k].trim(), 'missing_label_' + k));
    const initialStyle = typographyCss(o.typography), answers = answersFor(data, o.answers || {});
    const instance = 'lettura-' + (++nextInstance), esc = Head.esc;
    const rows = new Map(data.activities.map(a => [a.id, a]));
    const order = data.sequence.filter(b => b.kind === 'activity').map(b => rows.get(b.activityId));
    const paragraphIndex = new Map(data.source.paragraphs.map((p, i) => [p.id, i + 1]));
    const questions = order.map((a, i) => {
      const targets = a.reference.scope === 'whole' ? [data.source.paragraphs[0].id] : a.reference.paragraphIds;
      const links = targets.map(id => '<button type="button" data-passage="' + esc(id) + '">' + esc(labels.goToText) +
        (targets.length > 1 ? ' · ' + paragraphIndex.get(id) : '') + '</button>').join('');
      const inputs = a.format === 'mc' ? a.options.map(option => '<label class="lettura-option"><input type="radio" name="' +
        instance + '-' + a.id + '" data-answer="' + a.id + '" value="' + esc(option.id) + '"><span>' + Core.inlineHtml(a, 'option-' + a.options.indexOf(option), option.text) +
        '</span></label>').join('') : '<textarea data-answer="' + a.id + '" rows="' + a.lines + '" aria-label="' +
        esc(_tSafe('sp_answer', 'La tua risposta')) + '" spellcheck="true"></textarea>';
      return '<fieldset class="lettura-question" data-activity-id="' + a.id + '"><legend>' + (i + 1) + '. ' +
        Core.inlineHtml(a, 'question', a.question) + '</legend><div class="lettura-links">' + links + '</div>' + inputs +
        (a.help ? '<p class="lettura-paragraph lettura-help">' + Core.inlineHtml(a, 'help', a.help) + '</p>' : '') + '</fieldset>';
    }).join('');
    const root = doc.createElement('section'); root.className = 'lettura-layout';
    root.style.cssText = initialStyle;
    if (o.language) root.lang = String(o.language);
    root.innerHTML = '<div class="lettura-actions"><button type="button" data-expand="source">' + esc(labels.expandText) +
      '</button><button type="button" data-expand="questions">' + esc(labels.expandQuestions) +
      '</button><button type="button" data-expand="" hidden>' + esc(labels.restore) + '</button></div>' +
      '<div class="lettura-split"><section class="lettura-source-pane" aria-label="' + esc(_tSafe('rv_source', 'Fonte')) +
      '"><div class="lettura-tools"></div><article id="' + instance + '-source" class="lettura-source">' + sourceHtml(data) +
      '</article></section><div class="lettura-separator" tabindex="0" role="separator" aria-label="' + esc(labels.resize) +
      '" aria-controls="' + instance + '-source" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"></div>' +
      '<section class="lettura-questions" aria-label="' + esc(_tSafe('qp_questions', 'Domande')) + '">' + questions + '</section></div>';
    const source = root.querySelector('.lettura-source'), sourcePane = root.querySelector('.lettura-source-pane');
    const questionsPane = root.querySelector('.lettura-questions'), separator = root.querySelector('.lettura-separator');
    const split = root.querySelector('.lettura-split');
    const media = doc.defaultView.matchMedia('(orientation: portrait), (max-width: 700px)');
    const orient = () => separator.setAttribute('aria-orientation', media.matches ? 'horizontal' : 'vertical');
    const resize = n => { const v = Math.max(25, Math.min(75, n)); root.style.setProperty('--lettura-split', v + '%');
      separator.setAttribute('aria-valuenow', String(Math.round(v))); };
    let destroyed = false;
    function expand(panel) {
      requireValue(['source', 'questions', ''].includes(panel), 'invalid_panel');
      sourcePane.hidden = panel === 'questions'; questionsPane.hidden = panel === 'source'; separator.hidden = !!panel;
      root.dataset.expanded = panel;
      root.querySelectorAll('[data-expand]').forEach(b => { b.hidden = panel ? b.dataset.expand !== '' : b.dataset.expand === ''; });
    }
    function goToText(id) {
      const paragraph = Array.from(source.querySelectorAll('[data-paragraph-id]')).find(el => el.dataset.paragraphId === id);
      requireValue(!!paragraph, 'unknown_paragraph');
      expand('');
      paragraph.focus({ preventScroll: true });
      // Scorre solo il pannello fonte, non il documento o le domande.
      const offset = paragraph.getBoundingClientRect().top - sourcePane.getBoundingClientRect().top;
      sourcePane.scrollTo({ top: Math.max(0, sourcePane.scrollTop + offset - 16), behavior: 'auto' });
    }
    root.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
      if (button.hasAttribute('data-passage')) goToText(button.dataset.passage);
      if (button.hasAttribute('data-expand')) expand(button.dataset.expand);
    });
    root.addEventListener('input', event => {
      const input = event.target, id = input.dataset.answer;
      if (!id || !rows.has(id)) return;
      answersFor(data, { [id]: input.value }); answers[id] = input.value;
      if (typeof o.onAnswer === 'function') o.onAnswer({ activityId: id, value: input.value });
    });
    root.querySelectorAll('[data-answer]').forEach(input => {
      if (input.type === 'radio') input.checked = answers[input.dataset.answer] === input.value;
      else input.value = answers[input.dataset.answer] || '';
    });
    separator.addEventListener('keydown', event => {
      const delta = { ArrowLeft: -5, ArrowUp: -5, ArrowRight: 5, ArrowDown: 5 }[event.key];
      if (delta !== undefined || event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); resize(event.key === 'Home' ? 25 : event.key === 'End' ? 75 :
          Number(separator.getAttribute('aria-valuenow')) + delta);
      }
    });
    separator.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); separator.setPointerCapture(e.pointerId); } });
    separator.addEventListener('pointermove', e => {
      if (!separator.hasPointerCapture(e.pointerId)) return;
      const r = split.getBoundingClientRect(), size = media.matches ? r.height : r.width;
      if (size > 0) resize(100 * (media.matches ? e.clientY - r.top : e.clientX - r.left) / size);
    });
    const release = e => { if (separator.hasPointerCapture(e.pointerId)) separator.releasePointerCapture(e.pointerId); };
    separator.addEventListener('pointerup', release); separator.addEventListener('pointercancel', release);
    media.addEventListener('change', orient); orient(); host.appendChild(root);
    return { element: root, sourceElement: source, toolsElement: root.querySelector('.lettura-tools'),
      goToText, expand, getAnswers: () => clone(answers),
      setTypography: settings => { const css = typographyCss(settings), ratio = separator.getAttribute('aria-valuenow');
        root.style.cssText = css; resize(Number(ratio)); },
      destroy: () => { if (destroyed) return; destroyed = true; media.removeEventListener('change', orient); root.remove(); } };
  }
  return { typography, typographyCss, paragraphHtml, sourceHtml, answersFor, mount };
}));
