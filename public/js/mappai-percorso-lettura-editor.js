/* Packet 0070: configurazione CREA ed editor della fonte, senza AI o storage.
 * Etichette e salvataggi dal chiamante; i Banchi decidono gli stati di revisione.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./mappai-percorso-lettura'), require('./mappai-doc-head'), require('./mappai-percorso-lettura-core'));
  else root.MappAIPercorsoLetturaEditor = factory(root.MappAIPercorsoLettura, root.MappAIDocHead, root.MappAIPercorsoLetturaCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Generation, Head, Core) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  function inheritTheme(root, host) {
    const theme = host.closest?.('[data-theme]')?.getAttribute('data-theme') || (host.closest?.('.mm-box') ? 'light' : null);
    if (root.classList.contains('ui') && ['light', 'dark'].includes(theme)) root.dataset.theme = theme;
  }
  const row = (activityType, format, difficulty, support) => ({ activityType, count: 1, format, difficulty, support });
  const PRESETS = [
    { id: 'capire-articolo', purpose: 'informativo', genre: 'articolo', rows: [
      row('trovare-informazioni', 'mc', 'base', 'leggero'), row('collegare-indizi', 'open', 'intermedia', 'guidato'),
      row('formulare-domanda', 'open', 'base', 'guidato'), row('spiegare-legami', 'open', 'intermedia', 'leggero'),
      row('scegliere-parole-chiave', 'open', 'base', 'guidato') ] },
    { id: 'controllare-lettura', rows: [
      row('verificare-domanda', 'open', 'base', 'guidato'), row('diagnosticare-lettura', 'mc', 'intermedia', 'guidato'),
      row('rileggere-passaggio', 'open', 'intermedia', 'leggero'), row('verificare-interpretazione', 'open', 'intermedia', 'leggero'),
      row('annotare-dubbio', 'open', 'base', 'leggero') ] },
    { id: 'interpretare-racconto', purpose: 'letterario', genre: 'racconto', rows: [
      row('trovare-informazioni', 'mc', 'base', 'autonomo'), row('riconoscere-funzione', 'mc', 'intermedia', 'leggero'),
      row('collegare-indizi', 'open', 'intermedia', 'leggero'), row('formulare-domanda', 'open', 'intermedia', 'autonomo'),
      row('spiegare-interpretazione', 'open', 'avanzata', 'guidato'), row('verificare-interpretazione', 'open', 'intermedia', 'autonomo') ] }
  ];
  function check(ok, path) {
    if (ok) return;
    const e = new Error('invalid_reading_planner: ' + path); e.code = 'invalid_reading_planner'; e.path = path; throw e;
  }
  function presets() { return copy(PRESETS); }
  function planForPreset(id, context) {
    const p = PRESETS.find(p => p.id === id); check(p, 'preset');
    const plan = { purpose: context.purpose, genre: context.genre, rows: copy(p.rows) };
    Generation.selectionFromPlan(plan, { idPrefix: 'check' });
    // Lo scopo/genere del testo confermato prevale sul contesto suggerito dal preset.
    return plan;
  }
  function emptyPlan(context) {
    return { purpose: context.purpose, genre: context.genre, rows: Generation.catalog().activityTypes.map(t =>
      ({ ...row(t.id, t.formats[0], 'intermedia', 'leggero'), count: 0 })) };
  }
  function validateEditable(plan, prefix) {
    const probe = copy(plan);
    // Un piano vuoto è uno stato lecito dell'editor, non una richiesta generabile.
    if (probe.rows.length && probe.rows.every(r => r.count === 0)) probe.rows[0].count = 1;
    Generation.selectionFromPlan(probe, { idPrefix: prefix });
  }
  function labelsNeeded() {
    const c = Generation.catalog();
    return ['title', 'custom', 'ready', 'apply', 'presetNotice', 'count', 'format', 'difficulty', 'support',
      'variant', 'removeVariant', 'total', 'prepare', 'preparing', 'empty', 'invalid', 'limit', 'failed', 'prepared', 'planChanged', 'purpose', 'genre',
      ...['letterario', 'informativo', 'racconto', 'articolo', 'saggio', 'altro', 'open', 'mc', 'base', 'intermedia', 'avanzata',
        'guidato', 'leggero', 'autonomo'].map(x => 'value.' + x),
      ...c.goals.map(g => 'goal.' + g.id), ...c.activityTypes.flatMap(t => ['type.' + t.id, 'hint.' + t.id]),
      ...PRESETS.flatMap(p => ['preset.' + p.id, 'presetHint.' + p.id])];
  }
  function mountPlanner(host, options) {
    const o = options || {}, labels = o.labels || {}, c = Generation.catalog(), esc = Head.esc;
    check(host && host.ownerDocument, 'host'); check(typeof o.onPrepare === 'function', 'onPrepare');
    labelsNeeded().forEach(k => check(typeof labels[k] === 'string' && labels[k].trim(), 'labels.' + k));
    const types = new Map(c.activityTypes.map(t => [t.id, t]));
    let plan = copy(o.plan || emptyPlan(o)), mode = 'custom', pending = false, destroyed = false;
    validateEditable(plan, o.idPrefix);
    // CREA ospita già setup-form: il box non deve annidare form né inviarlo.
    const inConsole = o.layout === 'console';
    const bento = o.layout === 'bento' || inConsole;
    const doc = host.ownerDocument, root = doc.createElement(bento ? 'section' : 'form');
    root.className = (bento || (host.closest && host.closest('.ui')) ? '' : 'ui ') + 'lettura-planner' + (bento ? ' lettura-planner--bento' : '') + (inConsole ? ' lettura-planner--console' : '');
    inheritTheme(root, host);
    const text = k => esc(labels[k]);
    const buttonClass = inConsole ? 'mm-btn mm-btn--secondario' : bento ? 'mn-btn' : 'ui-btn';
    const fieldClass = inConsole ? ' class="mm-campo"' : bento ? ' class="mn-sel"' : '';
    const choices = (values, selected) => values.map(v => '<option value="' + esc(v) + '"' +
      (v === selected ? ' selected' : '') + '>' + text('value.' + v) + '</option>').join('');
    function completeRows() {
      const present = new Set(plan.rows.map(r => r.activityType));
      emptyPlan(plan).rows.forEach(r => { if (!present.has(r.activityType)) plan.rows.push(r); });
    }
    function render() {
      const opened = new Set(Array.from(root.querySelectorAll('details[open][data-goal]'), el => el.dataset.goal));
      completeRows();
      const field = (name, values, selected, attrs) => '<label>' + text(name) + '<select' + fieldClass + ' data-field="' + name + '" ' +
        ((o.readOnlyContext && (name === 'purpose' || name === 'genre')) ? 'disabled' : (attrs || '')) + '>' + choices(values, selected) + '</select></label>';
      root.innerHTML = '<h2>' + text('title') + '</h2><div class="lettura-plan-context">' +
        field('purpose', ['letterario', 'informativo'], plan.purpose) + field('genre', ['racconto', 'articolo', 'saggio', 'altro'], plan.genre) +
        '</div><div class="ui-segmenti lettura-plan-modes"' + (bento ? ' hidden' : '') + '>' + ['custom', 'ready'].map(m => '<button class="' + buttonClass + '" type="button" data-mode="' + m +
          '" aria-pressed="' + (m === mode) + '">' + text(m) + '</button>').join('') + '</div>' +
        '<section class="lettura-plan-presets"' + (!bento && mode !== 'ready' ? ' hidden' : '') + '>' +
        PRESETS.map(p => '<div class="' + (inConsole ? 'mm-sez' : bento ? 'mn-lettura-preset' : 'ui-pannello') + '"><h3>' + text('preset.' + p.id) + '</h3><p>' + text('presetHint.' + p.id) +
          '</p><button class="' + buttonClass + '" type="button" data-preset="' + p.id + '">' + text('apply') + '</button></div>').join('') +
        '<p>' + text('presetNotice') + '</p></section><div class="lettura-plan-groups">' + c.goals.map((goal, gi) =>
          '<details data-goal="' + goal.id + '"' + (opened.has(goal.id) || (!bento && (gi === 0 || plan.rows.some(r => r.count > 0 && types.get(r.activityType).goal === goal.id))) ? ' open' : '') +
          '><summary>' + text('goal.' + goal.id) + ' <span data-goal-count="' + goal.id + '"></span></summary>' +
          plan.rows.map((r, i) => {
            const t = types.get(r.activityType); if (t.goal !== goal.id) return '';
            return '<div class="lettura-plan-row" data-row="' + i + '"><div class="lettura-plan-type"><strong>' +
              text('type.' + t.id) + '</strong><p>' + text('hint.' + t.id) + '</p></div><label>' + text('count') +
              '<input' + (inConsole ? fieldClass : bento ? ' class="mn-num"' : '') + ' data-field="count" type="number" min="0" max="20" step="1" required value="' + r.count + '"></label>' +
              field('format', t.formats, r.format, t.formats.length === 1 ? 'disabled' : '') +
              field('difficulty', ['base', 'intermedia', 'avanzata'], r.difficulty) +
              field('support', ['guidato', 'leggero', 'autonomo'], r.support) +
              '<div class="lettura-plan-row-actions"><button class="' + buttonClass + '" type="button" data-variant="' + i + '">' + text('variant') + '</button>' +
              (plan.rows.findIndex(row => row.activityType === r.activityType) !== i ? '<button class="' + buttonClass + '" type="button" data-remove-variant="' + i + '">' + text('removeVariant') + '</button>' : '') + '</div></div>';
          }).join('') + '</details>').join('') + '</div><footer><p class="lettura-plan-total" aria-live="polite"></p>' +
          '<p class="lettura-plan-limit">' + neretti(text('limit')) + '</p><p role="status" class="lettura-plan-status" data-stato=""></p>' +
          '<button class="' + buttonClass + '" data-prepare' + (o.externalAction ? ' hidden' : '') + ' type="' + (bento ? 'button' : 'submit') + '">' + text('prepare') + '</button></footer>';
      refresh();
    }
    // Il piede (0087, lotto 10-lettura, Giacomo 12/10: «in BOLD solo i numeri, ed eventualmente un alert se le
    // soglie non sono bilanciate»): i numeri stanno in <strong>, il resto a peso normale; lo stato porta
    // data-stato (vuoto · limite · errore · '') e il foglio del bento lo veste da avviso.
    const neretti = s => s.replace(/\d+/g, '<strong>$&</strong>');
    function setStatus(msg, stato) { const p = root.querySelector('.lettura-plan-status'); p.textContent = msg; p.setAttribute('data-stato', stato); }
    function refresh() {
      const total = plan.rows.reduce((sum, r) => sum + (Number.isSafeInteger(r.count) ? r.count : 0), 0);
      root.querySelector('.lettura-plan-total').innerHTML = text('total') + ': <strong>' + total + '</strong>';
      for (const g of c.goals) root.querySelector('[data-goal-count="' + g.id + '"]').textContent = String(plan.rows
        .filter(r => types.get(r.activityType).goal === g.id).reduce((sum, r) => sum + (Number.isSafeInteger(r.count) ? r.count : 0), 0));
      let valid = true;
      try { Generation.selectionFromPlan(plan, { idPrefix: o.idPrefix }); } catch (_) { valid = false; }
      root.querySelector('[data-prepare]').disabled = !valid || pending;
      setStatus(valid ? '' : total === 0 ? labels.empty : labels.invalid, valid ? '' : total === 0 ? 'vuoto' : 'limite');
      o.onChange?.({ total, valid, pending });
    }
    function read(event) {
      const target = event.target, field = target.dataset.field; if (!field || pending) return;
      const container = target.closest('[data-row]');
      if (container) plan.rows[Number(container.dataset.row)][field] = field === 'count' ? target.valueAsNumber : target.value;
      else if (!o.readOnlyContext && (field === 'purpose' || field === 'genre')) plan[field] = target.value;
      refresh();
    }
    root.addEventListener('input', read); root.addEventListener('change', read);
    root.addEventListener('click', event => {
      const b = event.target.closest('button'); if (!b || !root.contains(b) || pending) return;
      if (b.dataset.mode) { mode = b.dataset.mode; root.querySelector('.lettura-plan-presets').hidden = mode !== 'ready';
        root.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.mode === mode))); }
      if (b.dataset.preset) { plan = planForPreset(b.dataset.preset, plan); render();
        setStatus(labels.planChanged, ''); }
      if (b.hasAttribute('data-remove-variant')) {
        const index = Number(b.dataset.removeVariant), row = plan.rows[index];
        if (row && plan.rows.findIndex(r => r.activityType === row.activityType) !== index) {
          const previous = plan.rows.findIndex(r => r.activityType === row.activityType);
          plan.rows.splice(index, 1); render();
          root.querySelector('[data-variant="' + previous + '"]')?.focus({ preventScroll: true });
        }
        return;
      }
      if (b.hasAttribute('data-variant')) {
        const previous = plan.rows[Number(b.dataset.variant)];
        const variants = ['base', 'intermedia', 'avanzata'].flatMap(difficulty => ['guidato', 'leggero', 'autonomo']
          .map(support => ({ ...previous, count: 0, difficulty, support })));
        const variant = variants.find(v => !plan.rows.some(r => ['activityType', 'format', 'difficulty', 'support'].every(k => r[k] === v[k])));
        if (variant) { plan.rows.push(variant); render();
          const last = root.querySelector('[data-row="' + (plan.rows.length - 1) + '"]'); last.closest('details').open = true;
          last.querySelector('input').focus({ preventScroll: true }); }
      }
    });
    async function prepare(event) {
      event.preventDefault(); event.stopPropagation(); if (pending || destroyed) return;
      let selected; try { selected = Generation.selectionFromPlan(plan, { idPrefix: o.idPrefix }); }
      catch (_) { refresh(); return; }
      pending = true; refresh(); root.setAttribute('aria-busy', 'true');
      const locked = Array.from(root.querySelectorAll('button,select,input')).map(el => [el, el.disabled]);
      locked.forEach(([el]) => { el.disabled = true; });
      setStatus(labels.preparing, '');
      try { await o.onPrepare(copy(selected), copy(plan));
        if (!destroyed) setStatus(labels.prepared, '');
      } catch (error) { if (!destroyed) setStatus(error.message || labels.failed, 'errore'); }
      finally { pending = false; if (!destroyed) { root.removeAttribute('aria-busy');
        locked.forEach(([el, disabled]) => { el.disabled = disabled; });
        refresh(); } }
    }
    if (bento) {
      root.addEventListener('click', event => {
        if (event.target.closest('[data-prepare]')) prepare(event);
      });
      // Invio nella quantità non avvia il generatore di mappe del form esterno.
      root.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing && event.target.matches('input')) event.preventDefault();
      });
    } else root.addEventListener('submit', prepare);
    render(); host.appendChild(root);
    return { element: root, prepare: () => prepare({ preventDefault() {}, stopPropagation() {} }), getPlan: () => copy(plan), getSelection: () => Generation.selectionFromPlan(plan, { idPrefix: o.idPrefix }),
      setPlan: value => { check(!pending && !destroyed, 'busy'); validateEditable(value, o.idPrefix); plan = copy(value); render(); },
      destroy: () => { destroyed = true; root.remove(); } };
  }
  function plannerLabels() {
    const t = (key, fallback) => typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(key, fallback) : fallback;
    return {
      "title": t("pl_plan_title", "Leggere e lavorare sul testo"),
      "custom": t("pl_plan_custom", "Scelgo le abilità"),
      "ready": t("pl_plan_ready", "Parto da un percorso pronto"),
      "apply": t("pl_plan_apply", "Usa questo percorso"),
      "presetNotice": t("pl_plan_presetNotice", "Ogni percorso compila le opzioni qui sotto. Puoi modificarle. Il testo deve offrire gli indizi necessari; classe e genere non determinano da soli la difficoltà."),
      "count": t("pl_plan_count", "Quantità"),
      "format": t("pl_plan_format", "Risposta"),
      "difficulty": t("pl_plan_difficulty", "Difficoltà"),
      "support": t("pl_plan_support", "Aiuto"),
      "removeVariant": t("pl_plan_remove_variant", "Rimuovi variante"),
      "variant": t("pl_plan_variant", "Differenzia questa attività"),
      "total": t("pl_plan_total", "Attività richieste"),
      "prepare": t("pl_plan_prepare", "Prepara il percorso"),
      "preparing": t("pl_plan_preparing", "Preparazione del percorso…"),
      "empty": t("pl_plan_empty", "Scegli almeno un’attività aumentando la quantità."),
      "invalid": t("pl_plan_invalid", "Controlla quantità e varianti: non ripetere la stessa combinazione e rispetta i limiti indicati."),
      "limit": t("pl_plan_limit", "Fino a 20 attività per riga e 40 in totale."),
      "failed": t("pl_plan_failed", "Non è stato possibile preparare il percorso. Le scelte sono conservate."),
      "prepared": t("pl_plan_prepared", "Percorso preparato. Prosegui con il controllo del testo."),
      "planChanged": t("pl_plan_planChanged", "Percorso applicato. Tutte le opzioni sono modificabili."),
      "purpose": t("pl_plan_purpose", "Scopo di lettura"),
      "genre": t("pl_plan_genre", "Tipo di testo"),
      "value.letterario": t("pl_plan_value_letterario", "Esperienza letteraria"),
      "value.informativo": t("pl_plan_value_informativo", "Acquisire e usare informazioni"),
      "value.racconto": t("pl_plan_value_racconto", "Racconto"),
      "value.articolo": t("pl_plan_value_articolo", "Articolo"),
      "value.saggio": t("pl_plan_value_saggio", "Estratto di saggio"),
      "value.altro": t("pl_plan_value_altro", "Altro testo"),
      "value.open": t("pl_plan_value_open", "Aperta"),
      "value.mc": t("pl_plan_value_mc", "Scelta multipla"),
      "value.base": t("pl_plan_value_base", "Base"),
      "value.intermedia": t("pl_plan_value_intermedia", "Intermedia"),
      "value.avanzata": t("pl_plan_value_avanzata", "Avanzata"),
      "value.guidato": t("pl_plan_value_guidato", "Guidato"),
      "value.leggero": t("pl_plan_value_leggero", "Leggero"),
      "value.autonomo": t("pl_plan_value_autonomo", "Autonomo"),
      "goal.comprendere": t("pl_plan_goal_comprendere", "Comprendere il testo"),
      "goal.controllare-comprensione": t("pl_plan_goal_controllare_comprensione", "Controllare la comprensione"),
      "goal.costruire-domande": t("pl_plan_goal_costruire_domande", "Costruire domande"),
      "goal.spiegare": t("pl_plan_goal_spiegare", "Spiegare con indizi"),
      "goal.tracce-personali": t("pl_plan_goal_tracce_personali", "Tracce personali per ricontrollarsi"),
      "type.trovare-informazioni": t("pl_plan_type_trovare_informazioni", "Ritrovare informazioni"),
      "hint.trovare-informazioni": t("pl_plan_hint_trovare_informazioni", "Cercare un dato pertinente distinguendolo da informazioni vicine."),
      "type.collegare-indizi": t("pl_plan_type_collegare_indizi", "Collegare indizi"),
      "hint.collegare-indizi": t("pl_plan_hint_collegare_indizi", "Ricavare una conclusione e spiegare che cosa la sostiene."),
      "type.riconoscere-funzione": t("pl_plan_type_riconoscere_funzione", "Capire la funzione di un passaggio"),
      "hint.riconoscere-funzione": t("pl_plan_hint_riconoscere_funzione", "Spiegare il contributo di una parte al significato del testo."),
      "type.diagnosticare-lettura": t("pl_plan_type_diagnosticare_lettura", "Controllare gli indizi"),
      "hint.diagnosticare-lettura": t("pl_plan_hint_diagnosticare_lettura", "Verificare un’interpretazione collegando gli indizi del testo."),
      "type.rileggere-passaggio": t("pl_plan_type_rileggere_passaggio", "Rileggere con uno scopo"),
      "hint.rileggere-passaggio": t("pl_plan_hint_rileggere_passaggio", "Individuare dove tornare e come controllare un dubbio."),
      "type.verificare-interpretazione": t("pl_plan_type_verificare_interpretazione", "Verificare un’interpretazione"),
      "hint.verificare-interpretazione": t("pl_plan_hint_verificare_interpretazione", "Confermare, correggere o lasciare aperta una lettura con motivi testuali."),
      "type.formulare-domanda": t("pl_plan_type_formulare_domanda", "Formulare una domanda"),
      "hint.formulare-domanda": t("pl_plan_hint_formulare_domanda", "Scrivere una domanda utile e indicare dove cercare la risposta."),
      "type.verificare-domanda": t("pl_plan_type_verificare_domanda", "Precisare una domanda"),
      "hint.verificare-domanda": t("pl_plan_hint_verificare_domanda", "Controllare se una domanda è risolvibile e migliorarla se serve."),
      "type.spiegare-legami": t("pl_plan_type_spiegare_legami", "Spiegare un legame"),
      "hint.spiegare-legami": t("pl_plan_hint_spiegare_legami", "Rendere comprensibile una relazione conservando condizioni e referenti."),
      "type.spiegare-interpretazione": t("pl_plan_type_spiegare_interpretazione", "Spiegare un’interpretazione"),
      "hint.spiegare-interpretazione": t("pl_plan_hint_spiegare_interpretazione", "Costruire una lettura motivata senza limitarsi a un riassunto."),
      "type.scegliere-parole-chiave": t("pl_plan_type_scegliere_parole_chiave", "Scegliere parole chiave e collegarle"),
      "hint.scegliere-parole-chiave": t("pl_plan_hint_scegliere_parole_chiave", "Creare una traccia personale che aiuti a ricostruire il significato."),
      "type.annotare-dubbio": t("pl_plan_type_annotare_dubbio", "Annotare un dubbio e un controllo"),
      "hint.annotare-dubbio": t("pl_plan_hint_annotare_dubbio", "Tenere traccia di che cosa verificare e del passaggio utile."),
      "preset.capire-articolo": t("pl_plan_preset_capire_articolo", "Capire e spiegare un articolo"),
      "presetHint.capire-articolo": t("pl_plan_presetHint_capire_articolo", "5 attività · Punto di partenza per la prima media. Dalla ricerca di informazioni a domande e spiegazioni personali."),
      "preset.controllare-lettura": t("pl_plan_preset_controllare_lettura", "Controllare la lettura"),
      "presetHint.controllare-lettura": t("pl_plan_presetHint_controllare_lettura", "5 attività · Prima e seconda media. Esaminare domande, verificare indizi e annotare un controllo."),
      "preset.interpretare-racconto": t("pl_plan_preset_interpretare_racconto", "Interpretare un racconto"),
      "presetHint.interpretare-racconto": t("pl_plan_presetHint_interpretare_racconto", "6 attività · Punto di partenza per la seconda media. Funzione dei passaggi, interpretazioni e spiegazioni."),
    };
  }
  function sourceLabels() {
    const t = (key, fallback) => typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(key, fallback) : fallback;
    return {
      "title": t("pl_source_title", "Controlla il testo"),
      "original": t("pl_source_original", "Testo acquisito dalla fonte"),
      "originalFallback": t("pl_source_originalFallback", "Qui è mostrata una copia del testo all’apertura. Confrontala con il documento originale per verificare l’estrazione."),
      "edited": t("pl_source_edited", "Testo ricomposto"),
      "provenance": t("pl_source_provenance", "Fonte"),
      "block": t("pl_source_block", "Blocco"),
      "blockType": t("pl_source_blockType", "Tipo di blocco"),
      "blockText": t("pl_source_blockText", "Testo del blocco"),
      "save": t("pl_source_save", "Salva le correzioni"),
      "review": t("pl_source_review", "Salva e verifica il testo"),
      "saving": t("pl_source_saving", "Salvataggio…"),
      "reviewing": t("pl_source_reviewing", "Apertura del controllo del testo…"),
      "saved": t("pl_source_saved", "Correzioni salvate."),
      "reviewOpened": t("pl_source_reviewOpened", "Consulta nel Banco lo stato della revisione del testo."),
      "failed": t("pl_source_failed", "Il salvataggio non è riuscito. Le correzioni restano aperte."),
      "invalid": t("pl_source_invalid", "Controlla i blocchi: il testo non può essere vuoto e tutti i rimandi devono restare validi."),
      "readOnly": t("pl_source_readOnly", "Testo consultabile. La modifica del percorso non è attiva."),
      "emphasisNotice": t("pl_source_emphasisNotice", "L’estrazione acquisisce il testo, ma non recupera grassetti e corsivi. Controlla struttura ed enfasi confrontandole con il documento originale."),
      "emphasisPresent": t("pl_source_emphasisPresent", "Enfasi già presenti nel blocco"),
      "removeEmphasis": t("pl_source_removeEmphasis", "Rimuovi enfasi"),
      "boldSelection": t("pl_source_boldSelection", "Grassetto alla selezione"),
      "italicSelection": t("pl_source_italicSelection", "Corsivo alla selezione"),
      "emphasisInvalid": t("pl_source_emphasisInvalid", "Seleziona una parte di testo non vuota, senza dividere un carattere."),
      "emphasisChanged": t("pl_source_emphasisChanged", "Il testo modificato contiene enfasi: ripristina le parole oppure usa «Rimuovi enfasi» prima di salvarlo."),
      "mergeNext": t("pl_source_mergeNext", "Unisci al blocco seguente"),
      "split": t("pl_source_split", "Dividi nel punto del cursore"),
      "splitHint": t("pl_source_splitHint", "Per dividere un blocco, posiziona il cursore nel testo. Per unire un paragrafo spezzato tra pagine, usa «Unisci al blocco seguente»."),
      "splitInvalid": t("pl_source_splitInvalid", "Posiziona il cursore tra due parti di testo non vuote, senza dividere un carattere."),
      "structureLocked": t("pl_source_structureLocked", "Sono già presenti attività: la divisione e l’unione dei blocchi sono disattivate per conservare i rimandi."),
      "idFailed": t("pl_source_idFailed", "Non è stato possibile creare un nuovo blocco. Il testo non è stato diviso."),
      "type.paragraph": t("pl_source_type_paragraph", "Paragrafo"),
      "type.heading": t("pl_source_type_heading", "Titolo"),
      "type.dialogue": t("pl_source_type_dialogue", "Dialogo"),
      "type.list-item": t("pl_source_type_list_item", "Voce di elenco"),
    };
  }
  function sourceLabelsNeeded() {
    return ['title', 'original', 'originalFallback', 'edited', 'provenance', 'block', 'blockType', 'blockText',
      'save', 'review', 'saving', 'reviewing', 'saved', 'reviewOpened', 'failed', 'invalid', 'readOnly',
      'emphasisNotice', 'emphasisPresent', 'removeEmphasis', 'boldSelection', 'italicSelection', 'emphasisInvalid', 'emphasisChanged', 'mergeNext', 'split',
      'splitHint', 'splitInvalid', 'structureLocked', 'idFailed',
      ...['paragraph', 'heading', 'dialogue', 'list-item'].map(x => 'type.' + x)];
  }
  let sourceInstance = 0;
  function mountSource(host, options) {
    const o = options || {}, labels = o.labels || {}, esc = Head.esc, readOnly = !!o.readOnly;
    check(host && host.ownerDocument, 'host'); Core.validateDraft(o.draft);
    sourceLabelsNeeded().forEach(k => check(typeof labels[k] === 'string' && labels[k].trim(), 'labels.' + k));
    if (!readOnly) {
      check(typeof o.onSave === 'function', 'onSave'); check(typeof o.onReview === 'function', 'onReview');
    }
    const doc = host.ownerDocument, root = doc.createElement('section'), prefix = 'lettura-source-' + (++sourceInstance);
    const inConsole = !!host.closest?.('.mm-box');
    const buttonClass = inConsole ? 'mm-btn mm-btn--secondario' : 'ui-btn';
    root.className = (inConsole ? '' : 'ui ') + 'lettura-source-editor' + (inConsole ? ' lettura-source-editor--console' : '');
    inheritTheme(root, host);
    let draft = copy(o.draft), pending = false, destroyed = false;
    let emphasisTexts = new Map(draft.source.paragraphs.map(p => [p.id, p.text]));
    const provenance = draft.source.provenance;
    const original = typeof o.originalText === 'string' ? o.originalText
      : typeof provenance.originalText === 'string' ? provenance.originalText : null;
    const originalText = original === null ? draft.source.paragraphs.map(p => p.text).join('\n\n') : original;
    const sourceName = [provenance.name, provenance.kind, provenance.originalPath || provenance.vaultRel].filter(Boolean).join(' · ');
    const text = k => esc(labels[k]);
    const fail = key => { const e = new Error(labels[key]); e.sourceEditor = true; throw e; };
    root.innerHTML = '<h2>' + text('title') + '</h2><p class="lettura-source-provenance">' + text('provenance') + ': ' + esc(sourceName) + '</p>' +
      '<p class="lettura-source-notice">' + text('emphasisNotice') + '</p>' +
      (readOnly ? '<p class="lettura-source-notice">' + text('readOnly') + '</p>' : '') +
      '<div class="lettura-source-columns"><section class="lettura-source-original" aria-labelledby="' + prefix + '-original"><h3 id="' + prefix + '-original">' +
      text('original') + '</h3>' + (original === null ? '<p>' + text('originalFallback') + '</p>' : '') + '<pre>' + esc(originalText) + '</pre></section>' +
      '<section class="lettura-source-blocks" aria-labelledby="' + prefix + '-edited"><h3 id="' + prefix + '-edited">' + text('edited') + '</h3><div data-source-blocks></div></section></div>' +
      '<footer><p class="lettura-source-status" role="status" aria-live="polite" tabindex="-1"></p>' + (readOnly ? '' :
        '<div class="lettura-source-actions"><button type="button" class="' + buttonClass + '" data-source-save>' + text('save') + '</button>' +
        '<button type="button" class="' + buttonClass + '" data-source-review>' + text('review') + '</button></div>') + '</footer>';
    const blocks = root.querySelector('[data-source-blocks]'), status = root.querySelector('.lettura-source-status');
    function say(message, error) { status.setAttribute('role', error ? 'alert' : 'status'); status.textContent = message; }
    function errorMessage(error) {
      say(error && error.sourceEditor ? error.message
        : error && error.code === 'invalid_reading_path' ? labels.invalid : (error && error.message) || labels.failed, true);
    }
    function renderBlocks() {
      blocks.innerHTML = draft.source.paragraphs.map((p, i) => '<fieldset class="lettura-source-block" data-source-block="' + esc(p.id) + '"><legend>' +
        text('block') + ' ' + (i + 1) + '</legend><label>' + text('blockType') + '<select class="' + (inConsole ? 'mm-campo' : '') + '" data-source-type' + (readOnly ? ' disabled' : '') + '>' +
        ['paragraph', 'heading', 'dialogue', 'list-item'].map(type => '<option value="' + type + '"' + (type === p.type ? ' selected' : '') + '>' + text('type.' + type) + '</option>').join('') +
        '</select></label><label>' + text('blockText') + '<textarea class="' + (inConsole ? 'mm-campo mm-campo--cresce' : '') + '" data-source-text rows="3"' + (readOnly ? ' readonly' : '') + '>' + esc(p.text) + '</textarea></label>' +
        (p.emphasis.length ? '<p class="lettura-source-notice">' + text('emphasisPresent') + ' (' + p.emphasis.length + ')</p><ul>' + p.emphasis.map(e => '<li><' + e.kind + '>' + esc(p.text.slice(e.start, e.end)) + '</' + e.kind + '></li>').join('') + '</ul>' +
          (readOnly ? '' : '<div class="lettura-source-actions"><button type="button" class="' + buttonClass + '" data-source-clear-emphasis>' + text('removeEmphasis') + '</button></div>') : '') +
        (readOnly ? '' : '<div class="lettura-source-actions"><button type="button" class="' + buttonClass + '" data-source-emphasis="strong">' + text('boldSelection') + '</button><button type="button" class="' + buttonClass + '" data-source-emphasis="em">' + text('italicSelection') + '</button></div><p class="lettura-source-notice">' + text(draft.activities.length ? 'structureLocked' : 'splitHint') + '</p><div class="lettura-source-actions">' +
          '<button type="button" class="' + buttonClass + '" data-source-split' + (draft.activities.length ? ' disabled' : '') + '>' + text('split') + '</button>' +
          '<button type="button" class="' + buttonClass + '" data-source-merge' + (draft.activities.length || i === draft.source.paragraphs.length - 1 ? ' disabled' : '') + '>' + text('mergeNext') + '</button></div>') + '</fieldset>').join('');
    }
    function collect(validate) {
      const candidate = copy(draft);
      blocks.querySelectorAll('[data-source-block]').forEach(el => {
        const p = candidate.source.paragraphs.find(p => p.id === el.dataset.sourceBlock);
        p.text = el.querySelector('[data-source-text]').value;
        p.type = el.querySelector('[data-source-type]').value;
      });
      if (validate) {
        if (candidate.source.paragraphs.some(p => p.emphasis.length && p.text !== emphasisTexts.get(p.id))) fail('emphasisChanged');
        Core.validateDraft(candidate);
      }
      return candidate;
    }
    function id() {
      const crypto = (doc.defaultView && doc.defaultView.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
      const value = typeof o.getId === 'function' ? o.getId() : crypto && typeof crypto.randomUUID === 'function' ? 'p-' + crypto.randomUUID() : '';
      if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) || draft.source.paragraphs.some(p => p.id === value)) fail('idFailed');
      return value;
    }
    function addEmphasis(kind, block) {
      const candidate = collect(true), p = candidate.source.paragraphs.find(p => p.id === block.dataset.sourceBlock);
      const field = block.querySelector('[data-source-text]'), start = field.selectionStart, end = field.selectionEnd;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > p.text.length || !p.text.slice(start, end).trim() ||
        [start, end].some(n => n > 0 && n < p.text.length && /[\uD800-\uDBFF]/.test(p.text[n - 1]) && /[\uDC00-\uDFFF]/.test(p.text[n]))) fail('emphasisInvalid');
      if (!p.emphasis.some(e => e.start === start && e.end === end && e.kind === kind)) p.emphasis.push({ start, end, kind });
      Core.validateDraft(candidate); draft = candidate; emphasisTexts.set(p.id, p.text); renderBlocks(); say('', false);
      const next = Array.from(blocks.querySelectorAll('[data-source-block]')).find(el => el.dataset.sourceBlock === p.id).querySelector('[data-source-text]');
      next.focus(); next.setSelectionRange(start, end);
    }
    function changeStructure(action, block) {
      if (draft.activities.length) fail('structureLocked');
      const candidate = collect(true), at = candidate.source.paragraphs.findIndex(p => p.id === block.dataset.sourceBlock);
      const p = candidate.source.paragraphs[at];
      if (action === 'split') {
        const offset = block.querySelector('[data-source-text]').selectionStart;
        if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= p.text.length || !p.text.slice(0, offset).trim() || !p.text.slice(offset).trim() ||
          (/[\uD800-\uDBFF]/.test(p.text[offset - 1]) && /[\uDC00-\uDFFF]/.test(p.text[offset]))) fail('splitInvalid');
        const nextId = id();
        const left = { ...p, text: p.text.slice(0, offset), emphasis: p.emphasis.filter(e => e.start < offset).map(e => ({ ...e, end: Math.min(e.end, offset) })) };
        const right = { ...p, id: nextId, text: p.text.slice(offset), emphasis: p.emphasis.filter(e => e.end > offset).map(e =>
          ({ ...e, start: Math.max(0, e.start - offset), end: e.end - offset })) };
        candidate.source.paragraphs.splice(at, 1, left, right);
        const seq = candidate.sequence.findIndex(b => b.kind === 'paragraph' && b.paragraphId === p.id);
        candidate.sequence.splice(seq + 1, 0, { kind: 'paragraph', paragraphId: nextId });
      } else {
        const next = candidate.source.paragraphs[at + 1]; if (!next) return;
        const separator = /\s$/.test(p.text) || /^\s/.test(next.text) ? '' : ' ', offset = p.text.length + separator.length;
        candidate.source.paragraphs.splice(at, 2, { ...p, text: p.text + separator + next.text,
          emphasis: p.emphasis.concat(next.emphasis.map(e => ({ ...e, start: e.start + offset, end: e.end + offset }))) });
        candidate.sequence = candidate.sequence.filter(b => b.kind !== 'paragraph' || b.paragraphId !== next.id);
      }
      Core.validateDraft(candidate); draft = candidate;
      emphasisTexts = new Map(draft.source.paragraphs.map(p => [p.id, p.text])); renderBlocks(); say('', false);
    }
    async function persist(review) {
      if (pending || destroyed || readOnly) return;
      let candidate; try { candidate = collect(true); } catch (error) { errorMessage(error); return; }
      pending = true; root.setAttribute('aria-busy', 'true'); say(labels[review ? 'reviewing' : 'saving'], false);
      const controls = Array.from(root.querySelectorAll('button,select,textarea')).map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      try {
        const saved = await (review ? o.onReview : o.onSave)(copy(candidate));
        if (saved === false || (saved && saved.ok === false)) fail('failed');
        const next = saved && saved.kind === 'percorso-lettura' ? saved : candidate;
        Core.validateDraft(next);
        if (!destroyed) { draft = copy(next); emphasisTexts = new Map(draft.source.paragraphs.map(p => [p.id, p.text]));
          renderBlocks(); say(labels[review ? 'reviewOpened' : 'saved'], false); }
      } catch (error) { if (!destroyed) errorMessage(error); }
      finally { pending = false; if (!destroyed) { root.removeAttribute('aria-busy'); controls.forEach(([el, disabled]) => { el.disabled = disabled; }); } }
    }
    function onClick(event) {
      if (destroyed || pending || readOnly) return;
      const button = event.target.closest('button'); if (!button || !root.contains(button) || button.disabled) return;
      if (button.hasAttribute('data-source-save')) { persist(false); return; }
      if (button.hasAttribute('data-source-review')) { persist(true); return; }
      const block = button.closest('[data-source-block]'); if (!block) return;
      try {
        if (button.hasAttribute('data-source-clear-emphasis')) {
          draft = collect(false); draft.source.paragraphs.find(p => p.id === block.dataset.sourceBlock).emphasis = [];
          emphasisTexts.delete(block.dataset.sourceBlock); renderBlocks(); say('', false);
        } else if (button.hasAttribute('data-source-emphasis')) addEmphasis(button.dataset.sourceEmphasis, block);
        else if (button.hasAttribute('data-source-split')) changeStructure('split', block);
        else if (button.hasAttribute('data-source-merge')) changeStructure('merge', block);
      } catch (error) { errorMessage(error); }
    }
    function onKeyDown(event) { if (event.key === 'Enter' && !event.isComposing && event.target.matches('input,select')) event.preventDefault(); }
    root.addEventListener('click', onClick); root.addEventListener('keydown', onKeyDown);
    renderBlocks(); host.appendChild(root);
    return { element: root, getDraft: () => { check(!destroyed, 'destroyed'); return collect(true); },
      destroy: () => { destroyed = true; root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKeyDown); root.remove(); } };
  }
  // Invio in contenteditable produce div/p; il sanitizer inline scarta quei
  // contenitori. Traduci prima i confini di riga, conservando enfasi e righe vuote.
  function editableHtml(element) {
    const parts = []; let previousBlock = false;
    for (const node of element.childNodes) {
      const block = node.nodeType === 1 && /^(DIV|P)$/.test(node.tagName);
      if (parts.length && (block || previousBlock)) parts.push('<br>');
      const html = block ? (node.childNodes.length === 1 && node.firstChild.nodeName === 'BR' ? '' : editableHtml(node)) :
        node.nodeType === 3 ? Head.esc(node.textContent).replace(/&#39;/g, "'").replace(/\r?\n/g, '<br>') : node.outerHTML || '';
      parts.push(html); previousBlock = block;
    }
    return parts.join('');
  }
  function editActivity(draft, activityId, options) {
    Core.validateDraft(draft);
    const original = draft.activities.find(a => a.id === activityId); check(original, 'activityId');
    check(typeof window !== 'undefined' && window.MappAIModal?.open, 'modal');
    const o = options || {}; check(o.onSave === undefined || typeof o.onSave === 'function', 'onSave');
    const labels = materialsLabels(), activity = copy(original), snapshot = copy(draft);
    let pending = false;
    let accepted = null, liveBox = null, baseline = '', nextEvidence = 0;
    const inlineValues = copy(activity.inline || {});
    const teachingKeys = ['objective', 'reasoning', 'difficultyReason', 'strategy', 'modeling', 'strategyCheck', 'reflection', 'fadingCriterion', 'acceptedAlternatives'];
    const values = { question: activity.question, help: activity.help || '', includeHelp: activity.includeHelp !== false,
      answer: activity.teacher.answer, criteria: activity.teacher.criteria.join('\n'),
      operation: activity.operation, difficulty: activity.difficulty, scope: activity.reference.scope, lines: activity.lines,
      correct: activity.teacher.correctOptionId };
    teachingKeys.forEach(key => { values['teaching-' + key] = activity.teacher.teaching?.[key] || ''; });
    snapshot.source.paragraphs.forEach((p, i) => { values['passage-' + i] = activity.reference.paragraphIds.includes(p.id); });
    (activity.options || []).forEach((option, i) => {
      values['option-' + i] = option.text;
      values['reason-' + i] = activity.teacher.distractors.find(d => d.optionId === option.id)?.reason || '';
    });
    let evidenceRows = activity.teacher.evidence.map(e => {
      const id = nextEvidence++; values['evidence-p-' + id] = e.paragraphId; values['evidence-q-' + id] = e.quote; return id;
    });
    function currentValues() {
      const out = {};
      liveBox?.querySelectorAll('[data-campo]').forEach(el => {
        const key = el.dataset.campo;
        if (el.hasAttribute('data-rich')) {
          const html = Core.sanitizeInline(editableHtml(el));
          if (/<(?:b|i|u|span|sup|br)[ >]/.test(html)) inlineValues[key] = html; else delete inlineValues[key];
          out[key] = Core.richPlain(html);
        } else out[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
      });
      return out;
    }
    const field = (id, tipo, etichetta, extra) => ({ id, tipo, etichetta, valore: values[id], ...(extra || {}) });
    const choices = (items, labelFor) => items.map(id => ({ valore: id, etichetta: labelFor(id) }));
    const paragraphChoices = [{ valore: '', etichetta: labels.choosePassage }].concat(snapshot.source.paragraphs.map((p, i) =>
      ({ valore: p.id, etichetta: labels.paragraph + ' ' + (i + 1) + ': ' + p.text.slice(0, 100) })));
    function decorate(box) {
      liveBox = box; box.classList.add('lettura-activity-modal');
      if (!baseline) baseline = JSON.stringify({ values: currentValues(), evidenceRows, inline: inlineValues });
      const note = box.ownerDocument.createElement('p'); note.className = 'lettura-activity-status'; note.setAttribute('role', 'alert'); note.setAttribute('aria-live', 'polite'); note.tabIndex = -1;
      box.querySelector('.mm-foot,.lettura-inline-status')?.prepend(note);
    }
    function build() {
      const sections = [
        { titolo: labels.edit, testo: labels.editNotice, campi: [field('question', 'area', labels.question, { obbligatorio: true }),
          field('operation', 'scelta', labels.operation, { opzioni: choices(Core.OPERATIONS, op => labels['operation.' + op]) }),
          field('difficulty', 'scelta', labels.difficulty, { opzioni: choices(Core.DIFFICULTIES, v => labels[v]) }),
          ...(activity.format === 'open' ? [field('lines', 'numero', labels.lines, { min: 1, max: 100 })] : [])] },
        ...(activity.format === 'mc' ? [{ titolo: labels.mc, testo: labels.optionsHint, campi: activity.options.map((option, i) =>
          field('option-' + i, 'area', labels.option + ' ' + String.fromCharCode(65 + i), { obbligatorio: true })).concat([
          field('correct', 'scelta', labels.correct, { opzioni: activity.options.map((option, i) => ({ valore: option.id, etichetta: labels.option + ' ' + String.fromCharCode(65 + i) })) })]) }] : []),
        { titolo: labels.help, campi: [field('help', 'area', labels.help, { aiuto: labels.helpNotice }),
          field('includeHelp', 'spunta', labels.includeHelp)] },
        { titolo: labels.details, campi: [field('answer', 'area', labels.answer, { obbligatorio: true }),
          field('criteria', 'area', labels.criteria, { aiuto: labels.criteriaHint, obbligatorio: true }),
          ...teachingKeys.map(key => field('teaching-' + key, 'area', labels[key]))] },
        { titolo: labels.passages, testo: labels.passagesHint, campi: [field('scope', 'scelta', labels.referenceScope, {
          opzioni: [{ valore: 'whole', etichetta: labels.whole }, { valore: 'passages', etichetta: labels.passages }]
        }), ...snapshot.source.paragraphs.map((p, i) => field('passage-' + i, 'spunta', labels.paragraph + ' ' + (i + 1), { aiuto: p.text }))] },
        { titolo: labels.evidence, testo: labels.evidenceHint, azioni: [{ id: 'add-evidence', etichetta: labels.addEvidence, chiude: false }] }
      ];
      evidenceRows.forEach((id, i) => sections.push({ titolo: labels.evidence + ' ' + (i + 1), campi: [
        field('evidence-p-' + id, 'scelta', labels.choosePassage, { opzioni: paragraphChoices }),
        field('evidence-q-' + id, 'area', labels.quote)
      ], azioni: [{ id: 'remove-evidence-' + id, etichetta: labels.removeEvidence, chiude: false }] }));
      if (activity.format === 'mc') sections.push({ titolo: labels.distractors, testo: labels.distractorsHint,
        campi: activity.options.map((option, i) => field('reason-' + i, 'area', labels.option + ' ' + String.fromCharCode(65 + i))) });
      return { titolo: labels.edit, icona: 'pencil', taglia: 'l', sezioni: sections, veloChiude: false,
        sporco: () => !accepted && JSON.stringify({ values: currentValues(), evidenceRows, inline: inlineValues }) !== baseline,
        azioni: [{ id: '__chiudi', etichetta: labels.cancel }, { id: 'save-activity', etichetta: labels.saveActivity, ruolo: 'primario', chiude: false }],
        suApertura: decorate
      };
    }
    function candidate() {
      const changed = copy(activity);
      changed.question = String(values.question || '').trim(); changed.operation = values.operation; changed.difficulty = values.difficulty;
      changed.help = String(values.help || '').trim(); changed.includeHelp = values.includeHelp === true;
      changed.teacher.answer = String(values.answer || '').trim(); changed.teacher.criteria = String(values.criteria || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (activity.teacher.teaching || teachingKeys.some(key => String(values['teaching-' + key] || '').trim()))
        changed.teacher.teaching = { ...changed.teacher.teaching, ...Object.fromEntries(teachingKeys.map(key => [key, String(values['teaching-' + key] || '').trim()])) };
      changed.reference = { scope: values.scope, paragraphIds: values.scope === 'whole' ? [] : snapshot.source.paragraphs.filter((p, i) => values['passage-' + i]).map(p => p.id) };
      changed.teacher.evidence = evidenceRows.map(id => ({ paragraphId: values['evidence-p-' + id], quote: String(values['evidence-q-' + id] || '') }));
      if (!changed.teacher.criteria.length) throw new Error(labels.criteriaHint);
      if (!changed.teacher.evidence.length || changed.teacher.evidence.some(e => !e.quote.trim() || !snapshot.source.paragraphs.some(p => p.id === e.paragraphId && p.text.includes(e.quote)))) throw new Error(labels.evidenceMismatch);
      if (changed.format === 'open') changed.lines = values.lines;
      else {
        changed.options = activity.options.map((option, i) => ({ ...option, text: String(values['option-' + i] || '').trim() }));
        changed.teacher.correctOptionId = values.correct;
        changed.teacher.distractors = activity.options.flatMap((option, i) => option.id === values.correct ? [] : [{ optionId: option.id, reason: String(values['reason-' + i] || '').trim() }]);
      }
      const formatted = Object.entries(inlineValues).filter(([k, html]) =>
        typeof values[k] === 'string' && Core.richPlain(html).replace(/\s+/g, ' ').trim() === values[k].replace(/\s+/g, ' ').trim());
      if (formatted.length) changed.inline = Object.fromEntries(formatted); else delete changed.inline;
      const validated = copy(snapshot); validated.activities[validated.activities.findIndex(a => a.id === activityId)] = changed;
      Core.validateDraft(validated); return changed;
    }
    function showError(box, error) {
      const note = box.querySelector('.lettura-activity-status');
      if (note) { note.textContent = error.code === 'invalid_reading_path' ? labels.invalidActivity : labels.invalidActivity + ' ' + error.message; note.focus(); }
    }
    async function apply(box) {
      let changed; try { changed = candidate(); } catch (error) { showError(box, error); return; }
    const controls = Array.from(box.querySelectorAll('input,select,textarea,button')).map(el => [el, el.disabled]);
      pending = true; box.setAttribute('aria-busy', 'true'); controls.forEach(([el]) => { el.disabled = true; });
      const note = box.querySelector('.lettura-activity-status'); if (note) note.textContent = labels.working;
        try {
          const result = o.onSave ? await o.onSave(copy(changed)) : undefined;
          if (result === false || result?.ok === false) throw new Error(labels.failed);
          accepted = copy(result?.draft?.activities?.find(a => a.id === activityId) || changed);
          if (o.host) {
            Object.assign(activity, accepted); snapshot.activities[snapshot.activities.findIndex(a => a.id === activityId)] = copy(accepted);
            baseline = JSON.stringify({ values: currentValues(), evidenceRows, inline: inlineValues });
            if (note) note.textContent = labels.done;
          }
        } catch (error) { showError(box, error); }
        finally { pending = false; box.removeAttribute('aria-busy'); controls.forEach(([el, wasDisabled]) => { el.disabled = wasDisabled; }); }
        if (accepted && !o.host) box.querySelector('[data-azione="__chiudi"]').click();
        return !!accepted;
    }
    const schema = build();
    schema.suAzione = (event, box, redraw) => {
      if (pending) return false;
      liveBox = box; Object.assign(values, event.valori || {});
      if (event.azione === 'add-evidence') {
        const id = nextEvidence++; evidenceRows.push(id); values['evidence-p-' + id] = ''; values['evidence-q-' + id] = ''; const next = redraw(build()); if (!o.host) decorate(next);
      } else if (event.azione.startsWith('remove-evidence-')) {
        evidenceRows = evidenceRows.filter(id => String(id) !== event.azione.slice('remove-evidence-'.length)); const next = redraw(build()); if (!o.host) decorate(next);
      } else if (event.azione === 'save-activity') apply(box);
    };
    if (o.host) {
      const esc = Head.esc, root = o.host.ownerDocument.createElement('div'); root.className = 'lettura-inline-fields' + (o.teacherMode ? ' lettura-teacher-fields' : '');
      let destroyed = false;
      function renderInline(next) {
        const opened = new Set(Array.from(root.querySelectorAll('details[open][data-edit-fold]'), el => el.dataset.editFold));
        const fieldHtml = f => {
          const explanation = ['answer', 'criteria'].includes(f.id);
          const attrs = ' class="mm-campo' + (explanation ? ' de-expl' : '') + '" data-campo="' + esc(f.id) + '"' + (f.obbligatorio ? ' required' : '');
          const rich = o.richText && f.tipo === 'area' && /^(question|help|answer|option-\d+|reason-\d+|teaching-\w+)$/.test(f.id);
          const control = rich ? '<div' + attrs + ' data-rich contenteditable="true" role="textbox" aria-multiline="true" aria-label="' + esc(f.etichetta) + '">' + Core.inlineHtml({ inline: inlineValues }, f.id, f.valore ?? '').replace(/\r?\n/g, '<br>') + '</div>' :
            f.tipo === 'area' ? '<textarea' + attrs + ' rows="1">' + esc(f.valore ?? '') + '</textarea>' :
            f.tipo === 'scelta' ? '<select' + attrs + '>' + f.opzioni.map(p => '<option value="' + esc(p.valore) + '"' + (p.valore === f.valore ? ' selected' : '') + '>' + esc(p.etichetta) + '</option>').join('') + '</select>' :
            f.tipo === 'spunta' ? '<input type="checkbox" data-campo="' + esc(f.id) + '"' + (f.valore ? ' checked' : '') + '>' :
            '<input type="number"' + attrs + ' value="' + esc(f.valore ?? '') + '" min="' + f.min + '" max="' + f.max + '">';
          return '<label class="lettura-inline-field' + (f.tipo === 'spunta' ? ' lettura-inline-check' : '') + (explanation ? ' de-expl-row' : '') + '"><span' + (explanation ? ' class="de-lbl"' : '') + '>' + esc(f.etichetta) + '</span>' + control +
            (f.aiuto ? '<small>' + esc(f.aiuto) + '</small>' : '') + '</label>';
        };
        const sectionHtml = s => '<section class="lettura-inline-section">' + (!s.titolo || s === next.sezioni[0] || s.titolo === labels.help ? '' : '<h4>' + esc(s.titolo) + '</h4>') +
          (s.testo && s !== next.sezioni[0] ? '<details class="lettura-inline-hint"><summary>' + esc(labels.instructions) + '</summary><p>' + esc(s.testo) + '</p></details>' : '') + (s.campi || []).map(fieldHtml).join('') +
          (s.azioni?.length ? '<div class="lettura-materials-actions">' + s.azioni.map(b => '<button type="button" class="mm-btn mm-btn--secondario" data-inline-action="' + esc(b.id) + '">' + esc(b.etichetta) + '</button>').join('') + '</div>' : '') + '</section>';
        const guideIndex = next.sezioni.findIndex(s => s.titolo === labels.details);
        root.innerHTML = next.sezioni.slice(0, guideIndex).map(s => s.titolo === labels.help ?
          '<details class="lettura-inline-help" data-edit-fold="help" data-material-fold="help:' + esc(activityId) + '"' +
          (opened.has('help') || (!liveBox && (o.helpOpen ?? !!values.help)) ? ' open' : '') + '><summary>' + esc(labels.help) + '</summary>' + sectionHtml(s) + '</details>' : sectionHtml(s)).join('') +
          '<details class="lettura-materials-guide" data-edit-fold="guide" data-material-fold="guide:' + esc(activityId) + '"' + (opened.has('guide') || (!liveBox && o.guideOpen) ? ' open' : '') + '><summary>' + esc(labels.details) + '</summary>' +
          sectionHtml({ ...next.sezioni[guideIndex], titolo: '', campi: next.sezioni[guideIndex].campi.slice(0, 2) }) +
          '<details class="lettura-inline-hint" data-edit-fold="teaching"' + (opened.has('teaching') ? ' open' : '') + '><summary>' + esc(labels.teaching) + '</summary>' +
          sectionHtml({ campi: next.sezioni[guideIndex].campi.slice(2) }) + '</details>' +
          '<details class="lettura-inline-hint" data-edit-fold="evidence"' + (opened.has('evidence') ? ' open' : '') + '><summary>' + esc(labels.passages + ' · ' + labels.evidence) + '</summary>' +
          next.sezioni.slice(guideIndex + 1).map(sectionHtml).join('') + '</details></details><div class="lettura-inline-status"></div>';
        root.querySelectorAll('[data-rich]').forEach(el => { Object.defineProperty(el, 'value', { configurable: true,
          get: () => Core.richPlain(editableHtml(el)), set: value => { el.innerHTML = esc(value).replace(/\r?\n/g, '<br>'); } }); });
        decorate(root); return root;
      }
      const click = event => {
        const b = event.target.closest('[data-inline-action]'); if (!b || pending || destroyed) return;
        schema.suAzione({ azione: b.dataset.inlineAction, valori: currentValues() }, root, renderInline);
      };
      o.host.appendChild(root); renderInline(build()); root.addEventListener('click', click);
      return { element: root, hasUnsaved: () => !destroyed && JSON.stringify({ values: currentValues(), evidenceRows, inline: inlineValues }) !== baseline,
        isBusy: () => pending,
        async save() { if (destroyed || pending) return false; accepted = null; Object.assign(values, currentValues()); return apply(root); },
        destroy() { destroyed = true; root.removeEventListener('click', click); root.remove(); } };
    }
    return window.MappAIModal.open(schema).then(() => accepted ? copy(accepted) : null);
  }
  function materialsLabels() {
    const t = (key, fallback) => typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(key, fallback) : fallback;
    return {
      edit: t('pl_activity_edit', 'Modifica attività'),
      instructions: t('pl_editor_instructions', 'Indicazioni di compilazione'),
      help: t('pl_activity_help', 'Aiuto all’allievo'), includeHelp: t('pl_activity_include_help', 'Includi questo aiuto nella scheda'),
      helpNotice: t('pl_activity_help_notice', 'Separa qui gli aiuti dalla consegna. I testi già generati non vengono divisi automaticamente. Non inserire la soluzione.'),
      editNotice: t('pl_activity_editNotice', 'Le modifiche richiedono un nuovo controllo G2 e una nuova conferma del docente. Le indicazioni didattiche già presenti restano conservate.'),
      question: t('pl_activity_question', 'Domanda o consegna'), lines: t('pl_activity_lines', 'Righe per la risposta'),
      option: t('pl_activity_option', 'Opzione'), optionsHint: t('pl_activity_optionsHint', 'Ogni opzione deve terminare con un segno di punteggiatura. La lettera identifica la risposta anche quando cambi le parole.'),
      criteriaHint: t('pl_activity_criteriaHint', 'Scrivi almeno un criterio osservabile, uno per riga.'),
      referenceScope: t('pl_activity_referenceScope', 'Estensione del rimando'), passagesHint: t('pl_activity_passagesHint', 'Le spunte valgono soltanto quando scegli i passaggi di riferimento. Il testo originale resta invariato.'),
      evidenceHint: t('pl_activity_evidenceHint', 'Collega ogni citazione esatta al suo passaggio. Queste prove sono riservate al docente.'),
      choosePassage: t('pl_activity_choosePassage', 'Scegli il passaggio'), quote: t('pl_activity_quote', 'Citazione esatta'),
      addEvidence: t('pl_activity_addEvidence', 'Aggiungi una prova'), removeEvidence: t('pl_activity_removeEvidence', 'Rimuovi questa prova'),
      evidenceMismatch: t('pl_activity_evidenceMismatch', 'Serve almeno una citazione esatta presente nel passaggio indicato. Controlla tutte le prove.'),
      distractorsHint: t('pl_activity_distractorsHint', 'Spiega il problema di ogni opzione errata. La motivazione dell’opzione scelta come corretta non viene usata; se cambi la chiave, completa la motivazione della precedente risposta corretta.'),
      saveActivity: t('pl_activity_save', 'Applica le modifiche'), cancel: t('mm_annulla', 'Annulla'),
      invalidActivity: t('pl_activity_invalid', 'Controlla i campi prima di applicare le modifiche.'),
      operation: t('pl_materials_operation', 'Operazione sul testo'),
      'operation.lessico': t('pl_operation_lessico', 'Lessico'), 'operation.coesione': t('pl_operation_coesione', 'Coesione'),
      'operation.informazioni-esplicite': t('pl_operation_informazioni', 'Informazioni esplicite'), 'operation.sequenze-cause': t('pl_operation_sequenze', 'Sequenze e cause'),
      'operation.inferenze': t('pl_operation_inferenze', 'Inferenze'), 'operation.senso-funzione': t('pl_operation_senso', 'Senso e funzione'),
      'operation.reinserimento': t('pl_operation_reinserimento', 'Reinserimento'), 'operation.presenza-assenza': t('pl_operation_presenza', 'Presenza e assenza di informazioni'),
      shortage: t('pl_materials_shortage', 'Richieste {requested} attività: aggiunte {added}. Mancano {missing} attività confermate corrispondenti ai filtri e non già selezionate.'),
      added: t('pl_materials_added', 'Aggiunte {added} attività alla selezione.'),
      summary: t('pl_materials_summary', 'Composizione della selezione'),
      title: t('pl_materials_title', 'Prepara il percorso e le verifiche'),
      order: t('pl_materials_order', 'Paragrafi e attività si spostano indipendentemente. Il testo di riferimento conserva il suo ordine originale.'),
      paragraph: t('pl_materials_paragraph', 'Testo'), activity: t('pl_materials_activity', 'Attività'),
      up: t('pl_materials_up', 'Sposta sopra'), down: t('pl_materials_down', 'Sposta sotto'),
      details: t('pl_materials_details', 'Guida per il docente'), answer: t('pl_materials_answer', 'Risposta attesa'),
      criteria: t('pl_materials_criteria', 'Criteri osservabili'), evidence: t('pl_materials_evidence', 'Indizi nel testo'),
      distractors: t('pl_materials_distractors', 'Perché le altre risposte non funzionano'), teaching: t('pl_materials_teaching', 'Intenzione didattica'),
      correct: t('pl_materials_correct', 'Risposta corretta'), whole: t('pl_materials_whole', 'Intero testo'), passages: t('pl_materials_passages', 'Passaggi di riferimento'),
      objective: t('pl_guide_objective', 'Obiettivo di lettura'), reasoning: t('pl_guide_reasoning', 'Indizi e ragionamento'),
      difficultyReason: t('pl_guide_difficulty', 'Motivo della difficoltà'), strategy: t('pl_guide_strategy', 'Strategia'),
      modeling: t('pl_guide_modeling', 'Modellamento del docente'), strategyCheck: t('pl_guide_check', 'Controllo della strategia'),
      reflection: t('pl_guide_reflection', 'Riflessione'), fadingCriterion: t('pl_guide_fading', 'Quando ridurre gli aiuti'),
      acceptedAlternatives: t('pl_guide_alternatives', 'Letture ammissibili'),
      confirm: t('pl_materials_confirm', 'Confermo di aver rivisto questa attività'),
      'state.da-rivedere': t('pl_materials_state_pending', 'Da rivedere'), 'state.rivisto': t('pl_materials_state_reviewed', 'Rivisto'),
      'state.approvato': t('pl_materials_state_approved', 'Approvato'), stale: t('pl_materials_stale', 'Conferma da rinnovare'),
      select: t('pl_materials_select', 'Includi nella verifica'), selection: t('pl_materials_selection', 'Componi una verifica'),
      selectionHint: t('pl_materials_selectionHint', 'Scegli tra le attività già riviste; qui non si generano nuove domande. Usa filtri e quantità per bilanciare la verifica.'),
      format: t('pl_materials_format', 'Formato'), difficulty: t('pl_materials_difficulty', 'Difficoltà'), all: t('pl_materials_all', 'Tutti'),
      open: t('pl_materials_open', 'Domanda aperta'), mc: t('pl_materials_mc', 'Scelta multipla'),
      base: t('pl_materials_base', 'Base'), intermedia: t('pl_materials_intermedia', 'Intermedia'), avanzata: t('pl_materials_avanzata', 'Avanzata'),
      quantity: t('pl_materials_quantity', 'Da creare'), add: t('pl_materials_add', 'Aggiungi {count} attività alla verifica'),
      available: t('pl_materials_available', 'Disponibili con questi filtri: {count}'),
      clear: t('pl_materials_clear', 'Svuota la selezione'), selected: t('pl_materials_selected', 'Attività selezionate'),
      testTitle: t('pl_materials_testTitle', 'Nome della verifica'), export: t('pl_materials_export', 'Prepara esportazione'),
      review: t('pl_materials_review', 'Apri il Banco dei materiali'), working: t('pl_materials_working', 'Operazione in corso…'),
      done: t('pl_materials_done', 'Operazione completata.'), failed: t('pl_materials_failed', 'Operazione non riuscita. Le scelte sono conservate.'),
      invalid: t('pl_materials_invalid', 'La risposta non contiene una versione valida del percorso.'),
      titleRequired: t('pl_materials_titleRequired', 'Indica il nome della verifica e seleziona almeno un’attività confermata.'),
      none: t('pl_materials_none', 'Nessuna attività corrisponde ai filtri.'), readOnly: t('pl_materials_readOnly', 'Percorso consultabile. Le modifiche non sono attive.')
    };
  }
  function materialsLabelsNeeded() { return Object.keys(materialsLabels()); }
  function mountMaterials(host, options) {
    const o = options || {}, labels = o.labels || {}, esc = Head.esc, readOnly = !!o.readOnly;
    check(host && host.ownerDocument, 'host'); Core.validateDraft(o.draft);
    materialsLabelsNeeded().forEach(k => check(typeof labels[k] === 'string' && labels[k].trim(), 'labels.' + k));
    if (!readOnly) ['onMove', 'onConfirm', 'onReview', 'onExport', 'onEdit'].forEach(k => check(typeof o[k] === 'function', k));
    const doc = host.ownerDocument, root = doc.createElement('section');
    const inConsole = !!host.closest?.('.mm-box');
    const buttonClass = inConsole ? 'mm-btn mm-btn--secondario' : 'ui-btn';
    const fieldClass = inConsole ? ' class="mm-campo"' : '';
    root.className = (inConsole || host.closest?.('.ui') ? '' : 'ui ') + 'lettura-materials-editor' + (inConsole ? ' lettura-materials-editor--console' : '');
    inheritTheme(root, host);
    let draft = copy(o.draft), states = copy(o.states || {}), pending = false, destroyed = false;
    const compose = o.mode === 'compose', review = o.mode === 'review';
    const inline = !!o.inlineEdit && !readOnly, editors = new Map();
    if (inline) { check(typeof o.onSaveActivity === 'function', 'onSaveActivity'); root.classList.add('lettura-materials-editor--inline'); }
    const chosen = new Set(o.initialSelection || []), folds = new Map(), text = key => esc(labels[key]);
    const icon = name => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
    function validateStates(value) {
      check(value && typeof value === 'object' && !Array.isArray(value), 'states');
      Object.keys(value).forEach(id => { const s = value[id]; check(s && ['da-rivedere', 'rivisto', 'approvato'].includes(s.state) && typeof s.current === 'boolean', 'states.' + id); });
    }
    validateStates(states);
    const stateFor = id => Object.prototype.hasOwnProperty.call(states, id) ? states[id] : { state: 'da-rivedere', current: false };
    const eligible = id => stateFor(id).current === true && ['rivisto', 'approvato'].includes(stateFor(id).state);
    const label = key => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : key;
    function details(value) {
      if (value === null || value === undefined) return '';
      if (Array.isArray(value)) return '<ul>' + value.map(x => '<li>' + details(x) + '</li>').join('') + '</ul>';
      if (typeof value === 'object') return '<dl>' + Object.entries(value).map(([k, v]) => '<dt>' + esc(label(k)) + '</dt><dd>' + details(v) + '</dd>').join('') + '</dl>';
      return '<span class="lettura-materials-text">' + esc(value) + '</span>';
    }
    root.innerHTML = '<h2>' + text('title') + '</h2>' + (compose ? '' : '<p>' + text(inline ? 'editNotice' : 'order') + '</p>') + (readOnly ? '<p>' + text('readOnly') + '</p>' : review ? '' :
      '<details class="lettura-materials-select"' + (compose ? ' open' : '') + '><summary>' + text('selection') + '</summary><div class="lettura-materials-content"><p>' + text('selectionHint') + '</p><div class="lettura-materials-filters">' +
      '<label>' + text('format') + '<select' + fieldClass + ' data-material-format><option value="">' + text('all') + '</option>' + ['open', 'mc'].map(x => '<option value="' + x + '">' + text(x) + '</option>').join('') + '</select></label>' +
      '<label>' + text('difficulty') + '<select' + fieldClass + ' data-material-difficulty><option value="">' + text('all') + '</option>' + ['base', 'intermedia', 'avanzata'].map(x => '<option value="' + x + '">' + text(x) + '</option>').join('') + '</select></label>' +
      '<label>' + text('operation') + '<select' + fieldClass + ' data-material-operation><option value="">' + text('all') + '</option>' + Core.OPERATIONS.map(x => '<option value="' + x + '">' + text('operation.' + x) + '</option>').join('') + '</select></label>' +
      '<label>' + text('quantity') + '<input' + fieldClass + ' data-material-quantity type="number" min="1" step="1" value="1"></label>' +
      '</div><p data-material-available aria-live="polite"></p><div class="lettura-materials-actions"><button class="' + buttonClass + '" type="button" data-material-add>' + text('add') + '</button><button class="' + buttonClass + '" type="button" data-material-clear>' + text('clear') + '</button></div>' +
      '<label class="lettura-materials-title">' + text('testTitle') + '<input' + fieldClass + ' data-material-title value="' + esc(draft.title) + '"></label><p data-material-count aria-live="polite"></p><div data-material-summary></div></div></details>') +
      '<div data-material-sequence></div><p data-material-empty hidden>' + text('none') + '</p><footer><p class="lettura-materials-status" role="status" aria-live="polite" tabindex="-1"></p>' +
      (readOnly ? '' : '<div class="lettura-materials-actions">' + (compose ? '' : '<button class="' + buttonClass + '" type="button" data-material-review>' + text('review') + '</button>') + (review || (compose && o.externalExport) ? '' : '<button class="' + buttonClass + '" type="button" data-material-export>' + text('export') + '</button>') + '</div>') + '</footer>';
    const sequence = root.querySelector('[data-material-sequence]'), status = root.querySelector('.lettura-materials-status');
    const filter = () => ({ format: root.querySelector('[data-material-format]')?.value || '', difficulty: root.querySelector('[data-material-difficulty]')?.value || '', operation: root.querySelector('[data-material-operation]')?.value || '' });
    const included = a => !o.activityIds || o.activityIds.includes(a.id);
    const matches = a => { const f = filter(); return included(a) && (!f.format || a.format === f.format) && (!f.difficulty || a.difficulty === f.difficulty) && (!f.operation || a.operation === f.operation); };
    function syncSelection() {
      for (const id of chosen) if (!eligible(id) || !draft.activities.some(a => a.id === id)) chosen.delete(id);
      root.querySelectorAll('[data-material-pick]').forEach(el => { el.checked = chosen.has(el.dataset.materialPick); el.disabled = pending || !eligible(el.dataset.materialPick); });
      const count = root.querySelector('[data-material-count]'); if (count) count.textContent = labels.selected + ': ' + chosen.size;
      const summary = root.querySelector('[data-material-summary]');
      if (summary) {
        const selected = draft.activities.filter(a => chosen.has(a.id));
        summary.innerHTML = selected.length ? '<p><b>' + text('summary') + '</b></p><dl>' + [['format', Core.FORMATS], ['difficulty', Core.DIFFICULTIES], ['operation', Core.OPERATIONS]].map(([axis, choices]) =>
          '<div><dt>' + text(axis) + '</dt><dd>' + choices.map(value => ({ value, count: selected.filter(a => a[axis] === value).length })).filter(row => row.count).map(row => text((axis === 'operation' ? 'operation.' : '') + row.value) + ': ' + row.count).join(' · ') + '</dd></div>').join('') + '</dl>' : '';
      }
      const available = draft.activities.filter(a => eligible(a.id) && matches(a) && !chosen.has(a.id)).length;
      const availability = root.querySelector('[data-material-available]');
      if (availability) availability.textContent = labels.available.replace('{count}', available);
      const add = root.querySelector('[data-material-add]'), quantity = Number(root.querySelector('[data-material-quantity]')?.value);
      if (add) { add.textContent = labels.add.replace('{count}', Number.isSafeInteger(quantity) && quantity > 0 ? Math.min(quantity, available) : 0); add.disabled = pending || !available; }
      const button = root.querySelector('[data-material-export]'); if (button) button.disabled = pending || !chosen.size;
    }
    function render() {
      // Lo stato della piegatura segue l'ID, anche quando filtri e riordino
      // sostituiscono i blocchi. Ripristinare lo scroll evita salti durante il render.
      root.querySelectorAll('[data-material-fold]').forEach(el => folds.set(el.dataset.materialFold, el.open));
      const scroll = [];
      for (let el = root; el; el = el.parentElement) scroll.push([el, el.scrollTop, el.scrollLeft]);
      editors.forEach(editor => editor.destroy()); editors.clear();
      const positions = draft.sequence.flatMap((b, i) => b.kind === 'activity' && (!o.activityIds || o.activityIds.includes(b.activityId)) ? [i] : []);
      sequence.innerHTML = draft.sequence.map((block, index) => {
        if ((compose || o.showSource === false) && block.kind === 'paragraph') return '';
        const paragraph = block.kind === 'paragraph', a = paragraph ? draft.source.paragraphs.find(p => p.id === block.paragraphId) : draft.activities.find(a => a.id === block.activityId);
        if (!paragraph && !included(a)) return '';
        const key = a.id, st = stateFor(key);
        const heading = paragraph ? labels.paragraph + ' ' + (draft.source.paragraphs.indexOf(a) + 1) : labels.activity + ' ' + (positions.indexOf(index) + 1);
        const first = o.activityIds ? index === positions[0] : !index, last = o.activityIds ? index === positions.at(-1) : index === draft.sequence.length - 1;
        const moveClass = buttonClass + (inConsole ? ' mm-btn--icona' : '');
        const move = readOnly || compose ? '' : '<span class="lettura-materials-move"><button type="button" class="' + moveClass + '" data-material-move="-1" data-index="' + index + '" title="' + esc(labels.up) + '" aria-label="' + esc(labels.up + ': ' + heading) + '"' + (first ? ' disabled' : '') + '>' + icon('chevron-up') + '</button>' +
          '<button type="button" class="' + moveClass + '" data-material-move="1" data-index="' + index + '" title="' + esc(labels.down) + '" aria-label="' + esc(labels.down + ': ' + heading) + '"' + (last ? ' disabled' : '') + '>' + icon('chevron-down') + '</button></span>';
        const variant = !paragraph && a.teacher?.design?.case;
        const variantIndex = variant?.variantOf ? draft.activities.findIndex(item => item.id === variant.variantOf) : -1;
        const variantNote = variantIndex < 0 ? '' : '<span class="lettura-materials-meta">' + esc(t('pl_variant_alternative', 'Variante alternativa dell’attività {number}: {reason}').replace('{number}', variantIndex + 1).replace('{reason}', variant.variantReason)) + '</span>';
        const meta = paragraph ? '' : '<span class="lettura-materials-meta">' + text(a.format) + ' · ' + text(a.difficulty) + ' · ' + text('operation.' + a.operation) + ' · <span data-material-state>' + text('state.' + st.state) + '</span>' + (st.state !== 'da-rivedere' && !st.current ? ' · ' + text('stale') : '') + '</span>';
        let body;
        if (paragraph) body = '<p class="lettura-materials-text">' + esc(a.text) + '</p>';
        else if (inline) {
          body = '<div data-inline-activity="' + esc(a.id) + '"></div><div class="lettura-materials-actions"><button type="button" class="' + buttonClass + '" data-material-confirm="' + esc(a.id) + '"' + (eligible(a.id) ? ' disabled' : '') + '>' + text('confirm') + '</button></div>';
        } else {
          const pn = id => labels.paragraph + ' ' + (draft.source.paragraphs.findIndex(p => p.id === id) + 1);
          const options = a.options ? '<ol type="A">' + a.options.map(v => '<li>' + esc(v.text) + '</li>').join('') + '</ol>' : '';
          const evidence = a.teacher.evidence.map(e => '<li><b>' + esc(pn(e.paragraphId)) + '</b>: <q>' + esc(e.quote) + '</q></li>').join('');
          const distractors = (a.teacher.distractors || []).map(d => '<li><b>' + esc(a.options.find(v => v.id === d.optionId)?.text || d.optionId) + '</b>: ' + esc(d.reason) + '</li>').join('');
          body = options + '<p>' + (a.reference.scope === 'whole' ? text('whole') : text('passages') + ': ' + a.reference.paragraphIds.map(id => esc(pn(id))).join(', ')) + '</p>' +
            '<details class="lettura-materials-guide" data-material-fold="guide:' + esc(key) + '"' + (folds.get('guide:' + key) ? ' open' : '') + '><summary>' + text('details') + '</summary><h4>' + text('answer') + '</h4>' + details(a.teacher.answer) + (a.format === 'mc' ? '<p><b>' + text('correct') + '</b>: ' + esc(a.options.find(v => v.id === a.teacher.correctOptionId).text) + '</p>' : '') +
            '<h4>' + text('criteria') + '</h4>' + details(a.teacher.criteria) + '<h4>' + text('evidence') + '</h4><ul>' + evidence + '</ul>' +
            (distractors ? '<h4>' + text('distractors') + '</h4><ul>' + distractors + '</ul>' : '') + '<h4>' + text('teaching') + '</h4>' + details(a.teacher.teaching) + '</details>' +
            (readOnly ? '' : '<div class="lettura-materials-actions">' + (compose ? '' : '<button type="button" class="' + buttonClass + '" data-material-edit="' + esc(a.id) + '">' + text('edit') + '</button><button type="button" class="' + buttonClass + '" data-material-confirm="' + esc(a.id) + '"' + (eligible(a.id) ? ' disabled' : '') + '>' + text('confirm') + '</button>') +
              (review ? '' : '<label class="lettura-materials-pick"><input type="checkbox" data-material-pick="' + esc(a.id) + '">' + text('select') + '</label>') + '</div>');
        }
        const opened = folds.has('block:' + key) ? folds.get('block:' + key) : !paragraph;
        return '<details class="lettura-materials-block' + (inline && !paragraph ? ' de-item' : '') + '" data-material-block="' + esc(key) + '" data-material-fold="block:' + esc(key) + '"' + (opened ? ' open' : '') + (!paragraph ? ' data-material-activity' + (!matches(a) ? ' hidden' : '') : '') +
          '><summary class="lettura-materials-heading">' + icon('chevron-right') + '<span class="lettura-materials-summary-copy"><strong>' + esc(heading) + '</strong>' + meta + variantNote +
          (paragraph ? '' : '<span class="lettura-materials-text">' + esc(a.question) + '</span>') + '</span>' + move + '</summary><div class="lettura-materials-content">' + body + '</div></details>';
      }).join('');
      if (inline) sequence.querySelectorAll('[data-inline-activity]').forEach(host => {
        const id = host.dataset.inlineActivity;
        editors.set(id, editActivity(draft, id, { host, richText: o.richText, teacherMode: o.teacherMode, helpOpen: folds.get('help:' + id), guideOpen: folds.get('guide:' + id) ?? o.teacherMode, onSave: async item => {
          const result = await o.onSaveActivity(item);
          if (result === false || result?.ok === false) return result;
          Core.validateDraft(result.draft); validateStates(result.states);
          if (!destroyed) { draft = copy(result.draft); states = copy(result.states); }
          return result;
        } }));
      });
      root.querySelector('[data-material-empty]').hidden = draft.activities.some(matches);
      syncSelection();
      doc.defaultView?.safeCreateIcons?.();
      scroll.forEach(([el, top, left]) => { el.scrollTop = top; el.scrollLeft = left; });
    }
    function say(message, error) { if (!destroyed) { status.textContent = message; status.setAttribute('role', error ? 'alert' : 'status'); } }
    async function save() {
      if (destroyed || pending) return false;
      const controls = Array.from(root.querySelectorAll('button,input,select,textarea')).map(el => [el, el.disabled]);
      pending = true; root.setAttribute('aria-busy', 'true'); say(labels.working, false);
      controls.forEach(([el]) => { el.disabled = true; });
      try {
        for (const editor of editors.values()) if (editor.hasUnsaved() && !await editor.save()) { say(labels.failed, true); return false; }
        if (!destroyed) { render(); say(labels.done, false); }
        return !destroyed;
      } catch (error) { say(labels.failed + ' ' + error.message, true); return false; }
      finally { pending = false; root.removeAttribute('aria-busy'); controls.forEach(([el, disabled]) => { el.disabled = disabled; }); syncSelection(); }
    }
    async function run(work, restoreFocus) {
      pending = true; root.setAttribute('aria-busy', 'true'); root.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; }); say(labels.working, false);
      try { const result = await work(); if (result === false || result?.ok === false) throw new Error(labels.failed); if (!destroyed) { render(); say(labels.done, false); } }
      catch (error) { say(labels.failed + (error?.message ? ' ' + error.message : ''), true); }
      finally { if (!destroyed) { pending = false; root.removeAttribute('aria-busy'); root.querySelectorAll('.lettura-materials-select :is(button,input,select),[data-material-review]').forEach(el => { el.disabled = false; }); render(); if (restoreFocus) restoreFocus(); } }
    }
    async function onClick(event) {
      const button = event.target.closest('button'); if (destroyed || pending || readOnly || !button || !root.contains(button) || button.disabled) return;
      if (inline && button.matches('[data-material-move],[data-material-review],[data-material-confirm]') && Array.from(editors.values()).some(editor => editor.hasUnsaved())) {
        if (!await save()) return;
      }
      if (button.hasAttribute('data-material-move')) {
        const index = Number(button.dataset.index), direction = Number(button.dataset.materialMove), expected = (o.moveDraft || Core.moveBlock)(draft, index, direction), moved = button.closest('[data-material-block]').dataset.materialBlock;
        return run(async () => { const updated = await o.onMove(index, direction); if (updated === false || updated?.ok === false) return updated;
          Core.validateDraft(updated); check(JSON.stringify(updated.source) === JSON.stringify(draft.source) && JSON.stringify(updated.activities) === JSON.stringify(draft.activities) && JSON.stringify(updated.sequence) === JSON.stringify(expected.sequence), 'move.content');
          if (!destroyed) draft = copy(updated); }, () => root.querySelector('[data-material-block="' + moved + '"] [data-material-move="' + direction + '"]:not(:disabled)')?.focus({ preventScroll: true }));
      }
      if (button.hasAttribute('data-material-edit')) return run(async () => {
        const result = await o.onEdit(button.dataset.materialEdit); if (result == null) return;
        if (result === false || result?.ok === false) return result;
        Core.validateDraft(result.draft); validateStates(result.states);
        if (!destroyed) { draft = copy(result.draft); states = copy(result.states); }
      });
      if (button.hasAttribute('data-material-confirm')) return run(async () => {
        const next = await o.onConfirm(button.dataset.materialConfirm); if (next === false || next?.ok === false) return next;
        validateStates(next); if (!destroyed) states = copy(next);
      });
      if (button.hasAttribute('data-material-review')) return run(async () => {
        const result = await o.onReview(); if (result === false || result?.ok === false) return result;
        if (result?.draft) { Core.validateDraft(result.draft); validateStates(result.states || {}); if (!destroyed) { draft = copy(result.draft); states = copy(result.states || {}); } }
      });
      if (button.hasAttribute('data-material-add')) {
        const quantity = Number(root.querySelector('[data-material-quantity]').value);
        if (!Number.isSafeInteger(quantity) || quantity < 1) { say(labels.titleRequired, true); return; }
        const added = draft.sequence.filter(b => b.kind === 'activity').map(b => draft.activities.find(a => a.id === b.activityId)).filter(a => eligible(a.id) && matches(a) && !chosen.has(a.id)).slice(0, quantity);
        added.forEach(a => chosen.add(a.id)); syncSelection();
        say((added.length < quantity ? labels.shortage : labels.added).replace('{requested}', quantity).replace('{added}', added.length).replace('{missing}', quantity - added.length), false); return;
      }
      if (button.hasAttribute('data-material-clear')) { chosen.clear(); syncSelection(); return; }
      if (button.hasAttribute('data-material-export')) return exportSelection();
    }
    function exportSelection() {
      if (destroyed || pending || readOnly || review) return;
      syncSelection(); const title = root.querySelector('[data-material-title]').value.trim();
      if (!title || !chosen.size) { say(labels.titleRequired, true); return; }
      const activityIds = draft.sequence.filter(b => b.kind === 'activity' && chosen.has(b.activityId)).map(b => b.activityId);
      return run(() => o.onExport({ title, activityIds }));
    }
    function onChange(event) {
      if (destroyed || pending || readOnly) return;
      const el = event.target;
      if (el.matches('[data-material-format],[data-material-difficulty],[data-material-operation]')) render();
      if (el.matches('[data-material-quantity]')) syncSelection();
      if (el.matches('[data-material-pick]')) { if (el.checked && eligible(el.dataset.materialPick)) chosen.add(el.dataset.materialPick); else chosen.delete(el.dataset.materialPick); syncSelection(); }
    }
    root.addEventListener('click', onClick); root.addEventListener('change', onChange);
    const onInput = event => { if (event.target.matches('[data-material-quantity]')) onChange(event); };
    root.addEventListener('input', onInput); host.appendChild(root); render();
    return { element: root, isBusy: () => pending || Array.from(editors.values()).some(editor => editor.isBusy()),
      hasUnsaved: () => Array.from(editors.values()).some(editor => editor.hasUnsaved()), save,
      refresh(result) { if (destroyed) return; Core.validateDraft(result.draft); validateStates(result.states); draft = copy(result.draft); states = copy(result.states); render(); },
      exportSelection, getDraft: () => copy(draft), getSelection: () => draft.sequence.filter(b => b.kind === 'activity' && chosen.has(b.activityId)).map(b => b.activityId),
      destroy() { destroyed = true; editors.forEach(editor => editor.destroy()); editors.clear(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); root.remove(); } };
  }
  return Object.freeze({ presets, planForPreset, emptyPlan, labelsNeeded, mountPlanner, plannerLabels, sourceLabelsNeeded, sourceLabels, mountSource, materialsLabelsNeeded, materialsLabels, mountMaterials, editActivity });
}));
