/*
 * mappai-tutor-core.js — logica PURA di "Chatta e Scrivi" (007, testabile in Node)
 * --------------------------------------------------------------------------------
 * Nessun accesso a DOM/rete/disco: funzioni deterministiche condivise tra
 * tutor-server.js (main process), pagina studente e lato docente.
 *
 *  - LIMITS                → cap e limiti fissi (messaggi, token risposta)
 *  - canSpend              → lo studente ha ancora scambi disponibili?
 *  - validateMessage       → messaggio studente accettabile PRIMA di ogni chiamata AI
 *  - publicState           → vista sessione per i telefoni (WHITELIST: mai chiavi/istruzioni)
 *  - buildChatPayload      → payload provider-specifico (google | infomaniak) da
 *                            systemInstruction + transcript neutro + nuovo turno
 *  - extractText           → testo della risposta dal formato del provider
 *  - buildTranscript       → copia normalizzata dei turni per report/salvataggio
 *  - computeTutorResults   → modello dati del report (testo + trascrizione per studente)
 *
 * Modulo UMD (pattern di mappai-live-core.js): module.exports per `node --test`,
 * window.MappAITutorCore per il browser.
 */
(function () {
  'use strict';

  // ── Limiti fissi (i cap del docente passano come argomento) ───────────────
  var LIMITS = {
    msgMax: 600,        // caratteri max per messaggio studente
    draftMax: 8000,     // caratteri max del testo consegnato
    maxTokens: 400,     // token max per risposta tutor (risposte brevi)
    capDefault: 10,     // scambi default
    capMin: 1,
    capMax: 30
  };

  // ── Cap scambi ─────────────────────────────────────────────────────────────
  function canSpend(student, cap) {
    var used = (student && Number(student.used)) || 0;
    var c = Number(cap);
    if (!isFinite(c) || c <= 0) c = LIMITS.capDefault;
    return used < c;
  }

  // ── Validazione messaggio (PRIMA di ogni chiamata AI) ─────────────────────
  function validateMessage(text, maxLen) {
    var max = Number(maxLen) || LIMITS.msgMax;
    if (typeof text !== 'string') return { ok: false, reason: 'empty' };
    var t = text.trim();
    if (!t) return { ok: false, reason: 'empty' };
    if (t.length > max) return { ok: false, reason: 'too-long', max: max };
    return { ok: true, clean: t };
  }

  // ── Vista pubblica della sessione (telefoni) ──────────────────────────────
  // WHITELIST esplicita: qualunque campo nuovo resta privato finché non viene
  // aggiunto qui. adminToken/provider/apiKey/systemInstruction NON passano mai.
  function publicState(session) {
    var s = session || {};
    return {
      name: s.name || '',
      className: s.className || '',
      topic: s.topic ? { kind: s.topic.kind, label: s.topic.label } : null,
      mode: s.mode || 'socratic',
      cap: Number(s.cap) || LIMITS.capDefault,
      writingBrief: s.writingBrief || '',
      phase: s.phase || 'running',
      msgMax: LIMITS.msgMax,
      draftMax: LIMITS.draftMax
    };
  }

  // ── Payload provider-specifico ─────────────────────────────────────────────
  // transcript neutro: [{ role: 'user'|'tutor', text }]. Il nuovo turno utente
  // viene aggiunto in coda. Regole Costituzione IV: su Infomaniak niente
  // responseMimeType/responseSchema; formato OpenAI messages.
  function buildChatPayload(opts) {
    var o = opts || {};
    var maxTok = Number(o.maxTokens) || LIMITS.maxTokens;
    var transcript = Array.isArray(o.transcript) ? o.transcript : [];
    if (o.provider === 'infomaniak') {
      var messages = [{ role: 'system', content: String(o.systemInstruction || '') }];
      transcript.forEach(function (t) {
        if (!t || !t.text) return;
        messages.push({ role: t.role === 'tutor' ? 'assistant' : 'user', content: String(t.text) });
      });
      messages.push({ role: 'user', content: String(o.userText || '') });
      return {
        model: o.model || '',
        messages: messages,
        max_tokens: maxTok,
        temperature: 0.3
      };
    }
    // google (default)
    var contents = transcript.map(function (t) {
      return { role: t.role === 'tutor' ? 'model' : 'user', parts: [{ text: String(t.text || '') }] };
    });
    contents.push({ role: 'user', parts: [{ text: String(o.userText || '') }] });
    return {
      systemInstruction: { parts: [{ text: String(o.systemInstruction || '') }] },
      contents: contents,
      generationConfig: { maxOutputTokens: maxTok, temperature: 0.4 }
    };
  }

  function extractText(provider, resp) {
    try {
      if (provider === 'infomaniak') {
        return (resp && resp.choices && resp.choices[0] && resp.choices[0].message &&
          resp.choices[0].message.content) || '';
      }
      return (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
        resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] &&
        resp.candidates[0].content.parts[0].text) || '';
    } catch (e) { return ''; }
  }

  // ── Trascrizione normalizzata ──────────────────────────────────────────────
  function buildTranscript(student) {
    var arr = (student && Array.isArray(student.transcript)) ? student.transcript : [];
    return arr.map(function (t) {
      return {
        role: t.role === 'tutor' ? 'tutor' : 'user',
        text: String(t.text || ''),
        at: t.at || null
      };
    });
  }

  // ── Report: modello dati (processo + prodotto) ────────────────────────────
  function computeTutorResults(session, students) {
    var s = session || {};
    var list = Array.isArray(students) ? students : [];
    var results = list.map(function (st) {
      // due shape ammesse: {identity:{emojiKey,num}} oppure {emojiKey,num} top-level (server)
      var ident = st.identity || { emojiKey: st.emojiKey, num: st.num };
      return {
        id: st.id || (ident.emojiKey ? ident.emojiKey + '-' + ident.num : 'anon'),
        identity: { emojiKey: ident.emojiKey || '', num: ident.num || '' },
        name: st.name || '',
        phase: st.phase || 'chat',
        used: Number(st.used) || 0,
        cap: Number(s.cap) || LIMITS.capDefault,
        neverChatted: (Number(st.used) || 0) === 0,           // consegna senza chat: segnalata
        submitted: !!(st.submission && st.submission.text),
        submissionText: (st.submission && st.submission.text) || '',
        submittedAt: (st.submission && st.submission.at) || null,
        transcript: buildTranscript(st)
      };
    });
    // ordinati per identità (emoji, poi numero) — stabile per il report
    results.sort(function (a, b) {
      var ka = a.identity.emojiKey + '-' + a.identity.num;
      var kb = b.identity.emojiKey + '-' + b.identity.num;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return {
      session: {
        name: s.name || '', className: s.className || '',
        topic: s.topic ? s.topic.label : '', mode: s.mode || 'socratic',
        cap: Number(s.cap) || LIMITS.capDefault,
        writingBrief: s.writingBrief || '',
        startedAt: s.startedAt || null, closedAt: new Date().toISOString()
      },
      students: results
    };
  }

  var CORE = {
    LIMITS: LIMITS,
    canSpend: canSpend,
    validateMessage: validateMessage,
    publicState: publicState,
    buildChatPayload: buildChatPayload,
    extractText: extractText,
    buildTranscript: buildTranscript,
    computeTutorResults: computeTutorResults
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAITutorCore = CORE;
  console.log('[MappAITutorCore] logica pura Chatta-e-Scrivi caricata');
})();
