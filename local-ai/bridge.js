'use strict';
// One process, bounded JSONL requests, no shell and no renderer-selected executable.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const MAX_BYTES = 32 * 1024 * 1024;
class LocalAI {
  constructor({ root, worker, timeout = 180000, spawnProcess = spawn }) {
    Object.assign(this, { root, worker, timeout, spawnProcess });
    this.pending = new Map(); this.sessions = new Map(); this.authorized = new Map(); this.failures = 0;
  }
  authorize(sender, vault) {
    try {
      const real = fs.realpathSync(vault);
      if (!this.authorized.has(sender)) this.authorized.set(sender, new Set());
      this.authorized.get(sender).add(real);
    } catch (_) { /* Missing vault: only archived text is available. */ }
  }
  start() {
    if (this.child) return;
    if (this.failures >= 2) throw new Error('worker_failed: restart the app after checking setup');
    const configPath = path.join(this.root, 'config.json');
    if (!fs.existsSync(configPath)) throw new Error('setup_required');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!path.isAbsolute(config.python) || !fs.existsSync(config.python)) throw new Error('runtime_missing');
    const child = this.spawnProcess(config.python, ['-u', this.worker, '--root', path.join(this.root, 'indexes'), '--config', configPath], {
      shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' }
    });
    this.child = child;
    let buffer = '';
    const failed = error => {
      if (this.child !== child) return;
      this.child = null; this.failures++;
      child.kill();
      for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
      this.pending.clear();
    };
    child.on('error', error => failed(error));
    child.on('exit', () => failed(new Error('worker_exited')));
    child.stdin.on('error', error => failed(error));
    child.stderr.on('data', () => {}); // Libraries can print document-derived errors: do not log texts.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (Buffer.byteLength(buffer) > MAX_BYTES) return failed(new Error('worker_message_too_large'));
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let msg;
        try { msg = JSON.parse(line); } catch (_) { return failed(new Error('worker_malformed_json')); }
        const task = this.pending.get(msg.id);
        if (!task) continue;
        if (msg.progress) { task.progress?.(msg.progress); continue; }
        clearTimeout(task.timer); this.pending.delete(msg.id);
        msg.error ? task.reject(new Error(msg.error)) : task.resolve(msg.result);
      }
    });
  }
  request(data, progress) {
    this.start();
    if (this.pending.size >= 12) return Promise.reject(new Error('worker_busy'));
    const id = crypto.randomUUID();
    const line = JSON.stringify({ ...data, id }) + '\n';
    if (Buffer.byteLength(line) > MAX_BYTES) return Promise.reject(new Error('request_too_large'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel(id); this.pending.delete(id); reject(new Error('worker_timeout'));
        // A hung native model call cannot observe cooperative cancellation.
        this.stop();
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer, progress, projectId: data.projectId });
      this.child.stdin.write(line);
    });
  }
  cancel(id) { this.child?.stdin.write(JSON.stringify({ id: crypto.randomUUID(), method: 'cancel', target: id }) + '\n'); }
  cancelSender(sender) {
    const session = this.sessions.get(sender);
    if (session) for (const [id, task] of this.pending) if (task.projectId === session.projectId) this.cancel(id);
  }
  async handle(sender, data, progress) {
    if (!data || typeof data !== 'object' || !['sync', 'search', 'status', 'cancel'].includes(data.method)) throw new Error('invalid_method');
    if (data.method === 'status') return this.request({ method: 'status' });
    if (data.method === 'cancel') { this.cancelSender(sender); return { status: 'cancelled', results: [] }; }
    if (typeof data.scope !== 'string' || !data.scope || data.scope.length > 2048 || typeof data.revision !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.revision)) throw new Error('invalid_scope');
    const projectId = hash(data.scope);
    let session = this.sessions.get(sender);
    if (data.method === 'sync') {
      if (!Array.isArray(data.records) || data.records.length > 20000 || Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error('invalid_records');
      const ids = new Set();
      for (const r of data.records) {
        if (!r || typeof r.recordId !== 'string' || r.recordId.length > 1024 || ids.has(r.recordId) || typeof r.text !== 'string' || r.text.length > 500000 || !['original', 'reference', 'generated', 'teacher'].includes(r.origin)) throw new Error('invalid_record');
        ids.add(r.recordId);
      }
      if (session && (session.projectId !== projectId || session.revision !== data.revision)) this.cancelSender(sender);
      const previous = session;
      session = { projectId, revision: data.revision, scope: data.scope, records: data.records };
      this.sessions.set(sender, session);
      const restore = () => { if (this.sessions.get(sender) === session) previous ? this.sessions.set(sender, previous) : this.sessions.delete(sender); };
      try {
        const result = await this.request({ method: 'sync', projectId, revision: data.revision, records: data.records, diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics.slice(0, 1000) : [] }, progress);
        if (this.sessions.get(sender) !== session) return { status: 'stale', results: [] };
        if (['cancelled', 'unavailable'].includes(result.status)) restore();
        return result;
      } catch (error) { restore(); throw error; }
    }
    if (!session || session.projectId !== projectId || session.revision !== data.revision) return { status: 'stale', results: [] };
    if (typeof data.query !== 'string' || !data.query.trim() || data.query.length > 4000 || !['evidence', 'occurrences'].includes(data.mode) || (data.origins && (!Array.isArray(data.origins) || data.origins.some(x => !(data.mode === 'evidence' ? ['original', 'reference'] : ['generated', 'teacher']).includes(x))))) throw new Error('invalid_query');
    const result = await this.request({ method: 'search', projectId, revision: data.revision, query: data.query, mode: data.mode, origins: data.origins, limit: 20 }, progress);
    return this.sessions.get(sender) === session ? result : { status: 'stale', results: [] };
  }
  original(sender, recordId) {
    const session = this.sessions.get(sender);
    const record = session?.records.find(r => recordId === r.recordId || recordId.startsWith(r.recordId + ':'));
    if (!record || record.origin !== 'original') return null;
    let vault;
    try { vault = fs.realpathSync(session.scope); } catch (_) { return null; }
    if (!this.authorized.get(sender)?.has(vault)) return null;
    const title = record.title;
    if (typeof title !== 'string' || path.basename(title) !== title || !/\.pdf$/i.test(title)) return null;
    const folder = path.join(vault, 'Allegati');
    const file = path.join(folder, title);
    try {
      const real = fs.realpathSync(file);
      if (!real.startsWith(fs.realpathSync(folder) + path.sep)) return null;
      if (record.pdfHash && crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex') !== record.pdfHash) return null;
      return real;
    } catch (_) { return null; }
  }
  stop() {
    const child = this.child; this.child = null;
    child?.stdin.end(); child?.kill();
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('worker_stopped')); }
    this.pending.clear();
  }
}
module.exports = { LocalAI, hash };
