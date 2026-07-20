/*
 * mappai-teach-core.js — logica PURA della landing "Insegna" (testabile in Node)
 * ------------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/rete: funzioni deterministiche usate dalla
 * UI (mappai-landing-teach.js) e verificate in tests/teach-core.test.js. La UI
 * fa l'I/O (legge/scrive localStorage, MappAIClasses, appState) e passa dati.
 *
 *  - normGrade         → normalizza un grade per confronto ("1ª Media" ≡ "1a media")
 *  - registryAdd       → registro sessioni: inserisce in testa, cap FIFO, immutabile
 *  - classesForMap     → classi attive su una mappa (chip dei progetti)
 *  - rankMapsForClass  → ordinamento quick-start in 3 fasce {started, sameGrade, others}
 *  - buildSetsIndex    → indice leggero quiz/flashcard per un progetto
 *  - filterByClass     → filtro "Solo classe attiva" per le sezioni Insegna
 *
 * Modulo UMD (pattern di mappai-live-core.js): module.exports per `node --test`,
 * window.MappAITeachCore per il browser.
 */
(function () {
  'use strict';

  var REGISTRY_CAP = 400;

  // ── normGrade ─────────────────────────────────────────────────────────────
  // NFKD → toglie diacritici, ordinali ª/° → 'a', minuscole, spazi collassati.
  // Confronto SEMPRE via questa funzione: "1ª  Media" ≡ "1a media", "2°A" ≡ "2a a".
  function normGrade(s) {
    if (s == null) return '';
    var str = String(s);
    // ̀-ͯ = diacritici combinanti (escape espliciti: niente char letterali fragili nel sorgente)
    try { str = str.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* ambienti senza NFKD */ }
    return str
      .replace(/[ªº°]/g, 'a')          // ordinali → 'a' (1ª → 1a)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')     // punteggiatura/simboli → spazio
      .trim()
      .replace(/\s+/g, ' ');
  }

  function _sameGrade(a, b) {
    var na = normGrade(a), nb = normGrade(b);
    return !!na && na === nb;
  }

  // ── registryAdd ───────────────────────────────────────────────────────────
  // Registro sessioni: nuova voce in testa, cap FIFO. NON muta l'input.
  // entry = {map, projectId?, cls?, activity, date?}. date mancante → 0 (il
  // chiamante passa Date.now(); manteniamo la funzione pura/deterministica).
  function registryAdd(registry, entry, cap) {
    var arr = Array.isArray(registry) ? registry.slice() : [];
    var e = {
      map: entry && entry.map != null ? String(entry.map) : '',
      projectId: entry && entry.projectId != null ? entry.projectId : null,
      cls: entry && entry.cls != null ? entry.cls : null,
      activity: entry && entry.activity != null ? String(entry.activity) : '',
      date: entry && entry.date != null ? entry.date : 0
    };
    arr.unshift(e);
    var limit = cap != null ? cap : REGISTRY_CAP;
    if (arr.length > limit) arr.length = limit;
    return arr;
  }

  // Match fra una voce di registro e un progetto: per projectId se presente su
  // ENTRAMBI, altrimenti per nome mappa. Serve a chip e filtri.
  function _regMatchesProject(regEntry, ref) {
    if (!regEntry || !ref) return false;
    if (regEntry.projectId != null && ref.projectId != null) {
      return regEntry.projectId === ref.projectId;
    }
    var rm = regEntry.map != null ? String(regEntry.map) : '';
    var pm = ref.map != null ? String(ref.map) : '';
    return !!rm && rm === pm;
  }

  // ── classesForMap ─────────────────────────────────────────────────────────
  // Nomi-classe distinti che hanno avviato sessioni su una mappa/progetto.
  // Ignora le voci cls:null. Ordine: prima apparizione (registro già ordinato
  // dal più recente dal chiamante → le classi recenti vengono per prime).
  function classesForMap(registry, ref) {
    if (!Array.isArray(registry) || !ref) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      if (!r || r.cls == null || r.cls === '') continue;
      if (!_regMatchesProject(r, ref)) continue;
      var key = String(r.cls);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(r.cls);
    }
    return out;
  }

  // ── rankMapsForClass ──────────────────────────────────────────────────────
  // Ordina i progetti in 3 fasce per una classe (FR-020). Il totale contiene
  // SEMPRE tutti i progetti (il docente non è mai bloccato). cls = {name, grade}.
  //   started   = già avviati su questa classe (registro, per projectId o map)
  //   sameGrade = non-started con grade == grade della classe (normGrade)
  //   others    = tutti gli altri (incl. progetti senza grade)
  function rankMapsForClass(projects, registry, cls) {
    var list = Array.isArray(projects) ? projects.slice() : [];
    var reg = Array.isArray(registry) ? registry : [];
    var clsName = cls && cls.name != null ? String(cls.name) : null;
    var clsGrade = cls && cls.grade != null ? cls.grade : null;

    var startedIds = Object.create(null);
    if (clsName != null) {
      for (var i = 0; i < reg.length; i++) {
        var r = reg[i];
        if (!r || r.cls == null || String(r.cls) !== clsName) continue;
        // marca i progetti avviati: chiave per id se c'è, altrimenti per nome
        if (r.projectId != null) startedIds['id:' + r.projectId] = true;
        if (r.map != null) startedIds['map:' + String(r.map)] = true;
      }
    }

    function isStarted(p) {
      if (!p) return false;
      if (p.id != null && startedIds['id:' + p.id]) return true;
      if (p.name != null && startedIds['map:' + String(p.name)]) return true;
      return false;
    }

    var started = [], sameGrade = [], others = [];
    for (var j = 0; j < list.length; j++) {
      var p = list[j];
      if (isStarted(p)) started.push(p);
      else if (clsGrade != null && _sameGrade(p && p.grade, clsGrade)) sameGrade.push(p);
      else others.push(p);
    }
    return { started: started, sameGrade: sameGrade, others: others };
  }

  // ── buildSetsIndex ────────────────────────────────────────────────────────
  // Indice leggero quiz/flashcard: sostituisce le voci del projectId corrente,
  // preserva quelle di altri progetti. studySets = appState.db.studySets.
  // Non muta prevIndex.
  function buildSetsIndex(prevIndex, projectId, mapName, cls, studySets) {
    var prev = Array.isArray(prevIndex) ? prevIndex : [];
    var kept = prev.filter(function (e) { return !e || e.projectId !== projectId; });
    var fresh = [];
    var sets = Array.isArray(studySets) ? studySets : [];
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i];
      if (!s) continue;
      var type = s.type === 'flashcards' || s.type === 'flashcard' ? 'flashcards'
        : (s.type === 'quiz' ? 'quiz' : (s.cards ? 'flashcards' : 'quiz'));
      fresh.push({
        projectId: projectId != null ? projectId : null,
        mapName: mapName != null ? String(mapName) : '',
        setId: s.id != null ? s.id : ('set_' + i),
        name: s.name || s.title || s.topic || ('Set ' + (i + 1)),
        type: type,
        cls: cls != null ? cls : null,
        date: s.date != null ? s.date : (s.created != null ? s.created : 0)
      });
    }
    return kept.concat(fresh);
  }

  // ── filterByClass ─────────────────────────────────────────────────────────
  // Filtro "Solo classe attiva" per le sezioni Insegna. Un item resta se:
  //   - item.cls === nome classe attiva, OPPURE
  //   - il progetto riferito è nel registro per quella classe, OPPURE
  //   - normGrade(item.grade) == normGrade(grade classe attiva)
  // activeCls null / senza nome / "Generico" (per convenzione: passare null) →
  // items invariati (nessun filtro).
  function filterByClass(items, activeCls, registry, projects) {
    var list = Array.isArray(items) ? items : [];
    if (!activeCls || activeCls.name == null || activeCls.name === '') return list.slice();
    var name = String(activeCls.name);
    var grade = activeCls.grade != null ? activeCls.grade : null;
    var reg = Array.isArray(registry) ? registry : [];

    // progetti (id + nome) avviati su questa classe → per il match via registro
    var startedIds = Object.create(null), startedMaps = Object.create(null);
    for (var i = 0; i < reg.length; i++) {
      var r = reg[i];
      if (!r || r.cls == null || String(r.cls) !== name) continue;
      if (r.projectId != null) startedIds[r.projectId] = true;
      if (r.map != null) startedMaps[String(r.map)] = true;
    }

    return list.filter(function (it) {
      if (!it) return false;
      if (it.cls != null && String(it.cls) === name) return true;
      if (it.projectId != null && startedIds[it.projectId]) return true;
      var mapRef = it.mapName != null ? it.mapName : it.map;
      if (mapRef != null && startedMaps[String(mapRef)]) return true;
      if (grade != null && _sameGrade(it.grade, grade)) return true;
      return false;
    });
  }

  // ── matchesSelectedProject (011/US5) ──────────────────────────────────────
  // Filtro per la mappa SELEZIONATA in Insegna (click sulla riga progetto).
  // sel = { id, name } | null. null → tutto passa (nessuna selezione).
  // Un item resta se: item.projectId === sel.id, OPPURE (mapName|map) === sel.name.
  // I materiali/condivisi/attività legacy senza projectId né mapRef → esclusi
  // quando c'è una selezione (compaiono solo in vista non-selezionata).
  function matchesSelectedProject(item, sel) {
    if (!sel || (sel.id == null && sel.name == null)) return true;
    if (!item) return false;
    if (item.projectId != null && sel.id != null && String(item.projectId) === String(sel.id)) return true;
    var mapRef = item.mapName != null ? item.mapName : item.map;
    if (mapRef != null && sel.name != null && String(mapRef) === String(sel.name)) return true;
    return false;
  }

  var CORE = {
    normGrade: normGrade,
    registryAdd: registryAdd,
    classesForMap: classesForMap,
    rankMapsForClass: rankMapsForClass,
    buildSetsIndex: buildSetsIndex,
    filterByClass: filterByClass,
    matchesSelectedProject: matchesSelectedProject,
    REGISTRY_CAP: REGISTRY_CAP
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAITeachCore = CORE;
  console.log('[MappAITeachCore] logica pura landing Insegna caricata');
})();
