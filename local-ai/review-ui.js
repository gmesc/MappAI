'use strict';
const $ = id => document.getElementById(id);
const tokenKey = 'mappai-review-session';
const token = location.hash.slice(1) || sessionStorage.getItem(tokenKey);
if (token) sessionStorage.setItem(tokenKey, token);
if (!window.reviewBank) history.replaceState(null, '', location.pathname);
window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) && location.hash.slice(1) !== token) {
    sessionStorage.setItem(tokenKey, location.hash.slice(1)); location.reload();
  }
});
let data, caseId, candidateIndex = 0, currentPage, pendingTimer, serial = Promise.resolve(), reportData;
let changed = 0, saved = 0, pageRequest = 0;
const pdfs = new Map();
const test = () => data.cases.find(c => c.id === caseId);
const annotation = () => data.annotations[caseId];
const candidate = () => test().candidates[candidateIndex];
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'bank-error' : 'bank-muted'; }
async function api(route, body) {
  if (window.reviewBank) {
    const result = await window.reviewBank.request(route, body);
    if (result.error) throw Error(result.error);
    return result.value;
  }
  const response = await fetch('/api/' + route, { headers: { 'X-Review-Token': token || '', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw Error(value.error); return value;
}
function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value, null, 2)], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function batch() { return data.cases.filter(c => $('batch').value === 'all' || c.critical); }
function updateProgress() {
  const list = batch(), completed = list.filter(c => data.annotations[c.id]?.status === 'reviewed').length;
  $('completed').textContent = completed + ' / ' + list.length;
  $('bank-progress').max = list.length; $('bank-progress').value = completed;
  const uncertain = list.filter(c => data.annotations[c.id]?.status === 'uncertain').length;
  $('uncertain').textContent = uncertain; $('uncertain-summary').hidden = uncertain === 0;
  $('case-select').replaceChildren(...list.map(c => { const o = document.createElement('option'); o.value = c.id; const state = data.annotations[c.id]?.status; o.textContent = c.id + ' · ' + ({ reviewed: 'Completato', draft: 'Bozza', uncertain: 'Da chiarire' }[state] || 'Da rivedere') + ' · ' + c.query; return o; }));
  $('case-select').value = caseId;
}
function dirty() {
  annotation().status = 'draft'; changed++; message('Modifiche in attesa di salvataggio…');
  clearTimeout(pendingTimer); pendingTimer = setTimeout(() => save().catch(e => message(e.message, true)), 700);
}
function save(status) {
  clearTimeout(pendingTimer);
  const id = caseId, revision = changed;
  const value = structuredClone(annotation()); value.reviewer = $('reviewer').value;
  if (status) value.status = status;
  // ponytail: one writer queue for this local window; disk revisions arbitrate other windows.
  serial = serial.catch(() => {}).then(async () => {
    const result = await api('annotation', { caseId: id, version: data.version, annotation: value });
    data.version = result.version;
    if (id === caseId && revision === changed) { data.annotations[id] = result.annotation; saved = changed; }
    updateProgress(); message(({ reviewed: 'Revisione completata', uncertain: 'Caso lasciato da chiarire', draft: 'Bozza salvata' }[value.status]) + ' · revisione ' + data.version);
  });
  return serial;
}
async function flush() { clearTimeout(pendingTimer); await serial.catch(() => {}); if (changed !== saved) await save(); }
async function selectCase(id) {
  if (caseId) await flush();
  caseId = id; candidateIndex = 0; changed = saved = 0;
  if (!data.annotations[id]) data.annotations[id] = { status: 'draft', reviewer: $('reviewer').value, judgments: {}, additions: [], sourceChecked: false, noEvidence: false, notes: '' };
  const a = annotation(); if (a.reviewer) $('reviewer').value = a.reviewer;
  $('question').textContent = test().query; $('project').textContent = test().project;
  $('source-checked').checked = a.sourceChecked; $('no-evidence').checked = a.noEvidence; $('notes').value = a.notes || '';
  $('manual-text').value = a.manualDraft?.text || ''; $('manual-details').open = !!a.manualDraft?.text;
  const groups = new Map();
  for (const p of data.pages.filter(p => p.project === test().project)) {
    if (!groups.has(p.pdfId)) { const group = document.createElement('optgroup'); group.label = p.title; groups.set(p.pdfId, group); }
    const option = document.createElement('option'); option.value = p.id; option.textContent = 'Pag. ' + p.page; groups.get(p.pdfId).append(option);
  }
  $('page-select').replaceChildren(...groups.values());
  updateProgress(); renderCandidate(); renderAdditions(); await showPage(a.manualDraft?.pageId || candidate().pageId);
  message(({ reviewed: 'Caso già completato. Una modifica lo riapre come bozza.', uncertain: 'Caso da chiarire.', draft: 'Bozza pronta.' })[a.status]);
  sessionStorage.setItem('review-case-' + data.packetId, id);
}
function renderCandidate() {
  const item = candidate(), a = annotation(), page = data.pages.find(p => p.id === item.pageId), j = a.judgments[item.id] || {};
  $('candidate-count').textContent = (candidateIndex + 1) + '/' + test().candidates.length;
  $('candidate-count').setAttribute('aria-label', 'Passaggio ' + (candidateIndex + 1) + ' di ' + test().candidates.length);
  $('candidate-source').textContent = page.title + ' · pagina ' + page.page;
  $('candidate-text').textContent = item.text;
  document.querySelectorAll('[data-grade]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.grade === j.grade)));
  $('quote-label').hidden = !['relevant', 'partial'].includes(j.grade); $('quote').value = j.quote || ''; $('passage-note').value = j.note || '';
  $('prev-passage').disabled = candidateIndex === 0; $('next-passage').disabled = candidateIndex === test().candidates.length - 1;
  $('judged-count').textContent = Object.values(a.judgments).filter(j => j.grade).length + ' di ' + test().candidates.length + ' passaggi valutati in questo caso.';
}
async function pdfDocument(id) {
  if (!pdfs.has(id)) pdfs.set(id, (async () => {
    let bytes;
    if (window.reviewBank) bytes = new Uint8Array(await api('pdf/' + id));
    else {
      const response = await fetch('/api/pdf/' + id, { headers: { 'X-Review-Token': token } });
      if (!response.ok) throw Error((await response.json()).error);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    const document = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    return { document, bytes };
  })());
  try { return await pdfs.get(id); } catch (error) { pdfs.delete(id); throw error; }
}
async function showPage(id) {
  currentPage = data.pages.find(p => p.id === id); $('page-select').value = id;
  $('manual-text').value = annotation().manualDraft?.pageId === id ? annotation().manualDraft.text : '';
  $('source-text').textContent = currentPage.text; const request = ++pageRequest;
  window.MappAIReviewPdf.loading();
  try {
    const pageInfo = currentPage, { document } = await pdfDocument(pageInfo.pdfId);
    const page = await document.getPage(pageInfo.page); if (request !== pageRequest) return;
    await window.MappAIReviewPdf.show(page);
    if (request !== pageRequest) return;
    $('page-select').title = pageInfo.title + ' · pagina ' + pageInfo.page + ' di ' + document.numPages + ' · copia verificata all’apertura';
  } catch (error) { if (request === pageRequest) { window.MappAIReviewPdf.failed(error); message('PDF non disponibile: la revisione del contesto resta da svolgere.', true); } }
}
function renderAdditions() {
  $('additions').replaceChildren(...annotation().additions.map((item, i) => {
    const box = document.createElement('div'), text = document.createElement('p'); text.className = 'bank-text';
    const page = data.pages.find(p => p.id === item.pageId); text.textContent = 'Pagina ' + page.page + ' · ' + (item.grade === 'partial' ? 'Parziale' : 'Pertinente') + '\n' + item.text;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'pm-btn-cancel'; button.textContent = 'Ritira dalla revisione';
    button.onclick = () => { annotation().additions.splice(i, 1); dirty(); renderAdditions(); }; box.append(text, button); return box;
  }));
}
function on(id, event, callback) { $(id).addEventListener(event, () => Promise.resolve().then(callback).catch(error => message(error.message, true))); }
on('case-select', 'change', () => selectCase($('case-select').value));
on('batch', 'change', async () => { await flush(); await selectCase(batch().some(c => c.id === caseId) ? caseId : batch()[0].id); });
on('next-case', 'click', async () => { await flush(); const list = batch(); const after = list.findIndex(c => c.id === caseId) + 1; const next = [...list.slice(after), ...list.slice(0, after)].find(c => c.id !== caseId && data.annotations[c.id]?.status !== 'reviewed'); if (next) await selectCase(next.id); else message('Tutti i casi del lotto sono completati.'); });
on('prev-passage', 'click', () => { candidateIndex--; renderCandidate(); }); on('next-passage', 'click', () => { candidateIndex++; renderCandidate(); });
on('show-context', 'click', () => showPage(candidate().pageId)); on('page-select', 'change', () => showPage($('page-select').value));
document.querySelectorAll('[data-grade]').forEach(button => button.onclick = () => { const item = candidate(); const j = annotation().judgments[item.id] ||= {}; j.grade = button.dataset.grade; if (j.grade !== 'irrelevant' && !j.quote) j.quote = item.text; dirty(); renderCandidate(); });
on('quote', 'input', () => { annotation().judgments[candidate().id].quote = $('quote').value; dirty(); });
on('passage-note', 'input', () => { (annotation().judgments[candidate().id] ||= {}).note = $('passage-note').value; dirty(); });
for (const [id, field] of [['source-checked', 'sourceChecked'], ['no-evidence', 'noEvidence']]) on(id, 'change', () => { annotation()[field] = $(id).checked; dirty(); });
on('notes', 'input', () => { annotation().notes = $('notes').value; dirty(); }); on('reviewer', 'input', () => { if (caseId) { annotation().reviewer = $('reviewer').value; dirty(); } });
on('save', 'click', () => save('draft')); on('mark-uncertain', 'click', () => save('uncertain')); on('complete', 'click', () => save('reviewed'));
on('add-passage', 'click', async () => {
  const text = $('manual-text').value.trim();
  if (!text || !currentPage.text.includes(text)) throw Error('Copia un passaggio esatto dal testo archiviato della pagina selezionata.');
  if (currentPage.text.indexOf(text) !== currentPage.text.lastIndexOf(text)) throw Error('Il testo compare più volte: includi più contesto.');
  annotation().additions.push({ pageId: currentPage.id, text, grade: $('manual-grade').value }); annotation().manualDraft = null; dirty(); await save(); $('manual-text').value = ''; renderAdditions();
});
on('manual-text', 'input', () => { annotation().manualDraft = { pageId: currentPage.id, text: $('manual-text').value }; dirty(); });
on('download-pdf', 'click', async () => {
  const page = currentPage, { bytes } = await pdfDocument(page.pdfId); download(page.title, bytes, 'application/pdf');
});
on('backup', 'click', () => download('annotazioni-copia.json', { packetId: data.packetId, version: data.version, annotations: data.annotations }));
on('export', 'click', async () => { await flush(); const bank = await api('export'); if (!bank.cases.length) throw Error('Completa almeno un caso prima di esportare i riferimenti revisionati.'); download('bank-reviewed-r' + bank.annotationRevision + '.json', bank); message(bank.cases.length + ' casi revisionati esportati; ' + bank.excluded.length + ' esclusi.'); });
on('metrics', 'click', async () => {
  await flush(); reportData = await api('report'); $('report-note').textContent = reportData.reviewed + ' casi completati su ' + reportData.total + '. ' + reportData.note;
  const container = $('report-body'); container.replaceChildren();
  for (const [split, methods] of Object.entries(reportData.summary)) {
    if (!Object.keys(methods).length) continue;
    const heading = document.createElement('h3'); heading.textContent = split === 'development' ? 'Taratura' : 'Verifica'; container.append(heading);
    const table = document.createElement('table'); const header = document.createElement('tr');
    for (const label of ['Metodo', 'Casi con prova', 'Hit@5', 'Hit@20', 'MRR@20', 'Assenza con risultati']) { const th = document.createElement('th'); th.textContent = label; header.append(th); } table.append(header);
    for (const [name, metrics] of Object.entries(methods)) { const row = document.createElement('tr'); for (const value of [name, metrics.n, ...['hit5', 'hit20'].map(k => metrics[k] === null ? '—' : (100 * metrics[k]).toFixed(1) + '%'), metrics.mrr20?.toFixed(3) ?? '—', metrics.noEvidenceWithResults.join(', ') || '—']) { const td = document.createElement('td'); td.textContent = value; row.append(td); } table.append(row); } container.append(table);
  }
  $('report').showModal();
});
on('close-report', 'click', () => $('report').close()); on('download-report', 'click', () => download('confronto-revisionato-r' + reportData.annotationRevision + '.json', reportData));
let textSizeIndex = 0;
on('text-size', 'click', () => {
  const scales = [1, 1.5, 2], labels = ['1', '1,5', '2']; textSizeIndex = (textSizeIndex + 1) % scales.length;
  $('bank-review-pane').style.setProperty('--bank-text-scale', scales[textSizeIndex]);
  $('text-size').textContent = 'Aa x' + labels[textSizeIndex];
  $('text-size').setAttribute('aria-label', 'Testo x' + labels[textSizeIndex] + '. Passa a x' + labels[(textSizeIndex + 1) % scales.length]);
});
on('toggle-sidebar', 'click', () => {
  const sidebar = $('bank-sidebar'); sidebar.hidden = !sidebar.hidden;
  $('toggle-sidebar').setAttribute('aria-expanded', String(!sidebar.hidden));
  $('toggle-sidebar').textContent = sidebar.hidden ? 'Mostra sidebar' : 'Nascondi sidebar';
});
window.addEventListener('beforeunload', event => { if (changed !== saved) { event.preventDefault(); event.returnValue = ''; } });
let closing = false;
async function closeBank() {
  if (closing) return;
  closing = true;
  try { if (caseId) await flush(); window.reviewBank.close(); }
  catch (error) {
    message(error.message + ' Puoi conservare una copia delle annotazioni.', true);
    await window.reviewBank.closeFailed();
  } finally { closing = false; }
}
if (window.reviewBank) {
  $('close-bank').hidden = false;
  on('close-bank', 'click', closeBank);
  window.reviewBank.onClosing(closeBank);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('report').open) { event.preventDefault(); closeBank(); }
  });
}
(async () => {
  window.safeCreateIcons ||= () => window.lucide?.createIcons(); window.safeCreateIcons();
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../public/js/pdf.worker.min.js', location.href).href; data = await api('state'); $('workspace').hidden = false;
  const remembered = sessionStorage.getItem('review-case-' + data.packetId); if (remembered && data.cases.find(c => c.id === remembered && !c.critical)) $('batch').value = 'all';
  await selectCase(data.cases.some(c => c.id === remembered) ? remembered : batch().find(c => data.annotations[c.id]?.status !== 'reviewed')?.id || batch()[0].id);
})().catch(error => message(error.message, true));
