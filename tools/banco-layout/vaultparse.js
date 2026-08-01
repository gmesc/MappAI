/* =========================================================================
   LETTURA DEI VAULT — modulo puro, condiviso da extract.js (Node) e dalla
   pagina (browser). Una sola implementazione: se il parser cambia, cambia per
   entrambi, e i dati precotti in data.json restano confrontabili con quelli
   caricati a mano.
   Non tocca il filesystem: riceve gia' il TESTO dei file.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.VaultParse = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // frontmatter YAML minimale: chiave: valore, con virgolette opzionali.
    // Basta per i campi che servono (id, label, level, group, parent) e non
    // trascina una dipendenza nel browser.
    function parseFrontmatter(txt) {
        const m = String(txt).match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!m) return null;
        const fm = {};
        m[1].split(/\r?\n/).forEach(line => {
            const kv = line.match(/^(\w+):\s*(.*)$/);
            if (!kv) return;
            let v = kv[2].trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            fm[kv[1]] = v;
        });
        return { fm, end: m[0].length };
    }

    // un file Nodi/*.md -> nodo, oppure null se non ha frontmatter valido
    function nodeFromMd(txt) {
        const p = parseFrontmatter(txt);
        if (!p || !p.fm.id) return null;
        const body = String(txt).slice(p.end).replace(/^\s*#[^\n]*\n/, '').trim();
        return {
            id: p.fm.id,
            label: p.fm.label || p.fm.id,
            level: p.fm.level !== undefined ? Number(p.fm.level) : null,
            group: p.fm.group !== undefined ? Number(p.fm.group) : null,
            parent: p.fm.parent || null,
            desc: body.split(/\n\s*\n/)[0].slice(0, 220)
        };
    }

    function readRoot(indexYaml) {
        const m = String(indexYaml || '').match(/rootNodeLabel:\s*(.*)/);
        return m ? m[1].trim().replace(/^"|"$/g, '') : '';
    }
    function readMode(indexYaml) {
        const m = String(indexYaml || '').match(/extractionMode:\s*(.*)/);
        return m ? m[1].trim() : '';
    }
    /* customColors del vault: quando il docente ha ricolorato una macro-area,
       quel colore vince sulla palette di serie — come nell'app. Supporta la
       forma in linea `{...}` di js-yaml e quella a blocco indentato. */
    function readCustomColors(indexYaml) {
        const txt = String(indexYaml || '');
        const out = {};
        const flow = txt.match(/customColors:\s*\{([^}]*)\}/);
        const src = flow ? flow[1]
            : (txt.match(/customColors:\s*\n((?:[ \t]+\S.*\n?)*)/) || [, ''])[1];
        String(src).replace(/["']?(\d+)["']?\s*:\s*["']?(#[0-9a-fA-F]{3,8})["']?/g,
            (_, k, v) => { out[+k] = v; return ''; });
        return out;
    }

    function normLinks(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(l => ({
            source: typeof l.source === 'object' && l.source ? l.source.id : l.source,
            target: typeof l.target === 'object' && l.target ? l.target.id : l.target,
            rel: l.rel || '',
            // vault legacy senza `rel`: default "include" (DAL Protocol)
            isCross: !!l.isCross
        })).filter(l => l.source && l.target);
    }

    /* Nome della cartella del grafo, dedotto dai percorsi: e' il segmento che
       PRECEDE `Nodi/`. Se i file arrivano gia' relativi al vault (es. da
       extract.js, che passa 'Nodi/x.md') non c'e' nulla da dedurre e vale
       l'indizio esplicito. */
    function folderOf(files, hint) {
        if (hint) return hint;
        for (const f of files) {
            const p = String(f.path || f.name || '').replace(/\\/g, '/');
            const m = p.match(/^(.*?)\/Nodi\//);
            if (m && m[1]) return m[1].split('/').pop();
        }
        const first = files.find(f => /\//.test(String(f.path || '')));
        return first ? String(first.path).split('/')[0] : '';
    }

    /* Da una cartella vault. `files` = [{name, path, text}] — `path` puo'
       essere il percorso relativo dato dal selettore di cartella. */
    function fromVaultFiles(files, folderHint) {
        const nodes = [], warn = [];
        let links = [], indexYaml = '';
        files.forEach(f => {
            const p = String(f.path || f.name || '');
            const base = p.split(/[\\/]/).pop();
            if (/^links\.json$/i.test(base)) {
                try { links = normLinks(JSON.parse(f.text)); }
                catch (e) { warn.push('links.json illeggibile: ' + e.message); }
                return;
            }
            if (/^index\.yaml$/i.test(base)) { indexYaml = f.text; return; }
            if (!/\.md$/i.test(base)) return;
            // solo i file dentro Nodi/ (o, se la cartella e' stata aperta
            // direttamente, tutti i .md della radice)
            if (/(^|[\\/])Nodi[\\/]/.test(p) || !/[\\/]/.test(p)) {
                const n = nodeFromMd(f.text);
                if (n) nodes.push(n); else warn.push('senza frontmatter: ' + base);
            }
        });
        const d = finalize(nodes, links, readRoot(indexYaml), readMode(indexYaml), warn,
            folderOf(files, folderHint));
        d.customColors = readCustomColors(indexYaml);
        return d;
    }

    /* Da un JSON: sia il formato di esportazione MappAI ({nodes, links, ...})
       sia il data.json del banco ({mm:{...}, kg:{...}}) — in quel caso ritorna
       la PRIMA mappa e l'elenco delle altre chiavi. */
    function fromJson(obj, folderHint) {
        if (obj && !obj.nodes && !obj.links) {
            const keys = Object.keys(obj).filter(k => obj[k] && obj[k].nodes);
            if (keys.length) {
                const first = fromJson(obj[keys[0]]);
                first.altre = keys.slice(1);
                return first;
            }
        }
        const raw = (obj && obj.nodes) || [];
        const nodes = raw.map(n => ({
            id: n.id, label: n.label || n.id,
            level: n.level == null ? null : Number(n.level),
            group: n.group == null ? null : Number(n.group),
            parent: n.parent || null,
            desc: String(n.desc || n.content || '').slice(0, 220)
        })).filter(n => n.id);
        const d = finalize(nodes, normLinks((obj && obj.links) || []),
            (obj && obj.rootNodeLabel) || '', (obj && obj.extractionMode) || '', [],
            folderHint || (obj && obj.folder) || '');
        d.customColors = (obj && obj.customColors) || {};
        return d;
    }

    /* Scarta i link che puntano a nodi inesistenti e lo DICHIARA: un arco
       orfano non e' un dettaglio, sposta livelli e conteggi. */
    function finalize(nodes, links, root, mode, warn, folder) {
        const ids = new Set(nodes.map(n => n.id));
        const orfani = [];
        const ok = links.filter(l => {
            const good = ids.has(l.source) && ids.has(l.target);
            if (!good) orfani.push(l.source + ' -> ' + l.target);
            return good;
        });
        return {
            nodes, links: ok, root, mode, folder: folder || '',
            avvisi: warn.concat(orfani.length ? [orfani.length + ' archi scartati (nodo mancante): ' + orfani.slice(0, 3).join(' · ') + (orfani.length > 3 ? ' …' : '')] : [])
        };
    }

    /* Quali insiemi di archi ha senso proporre per QUESTA mappa. */
    function edgeSets(d) {
        const hasComm = d.nodes.some(n => /^COMM_/.test(n.id));
        const hasCross = d.links.some(l => l.isCross);
        if (hasComm) return [{ v: 'sem', label: 'Solo relazioni' }, { v: 'all', label: '+ comunità' }];
        if (hasCross) return [{ v: 'all', label: 'Gerarchia + cross' }, { v: 'hier', label: 'Solo gerarchia' }];
        return [{ v: 'all', label: 'Tutti gli archi' }];
    }

    /* Applica la scelta dell'interruttore «archi usati». */
    function slice(d, set) {
        if (set === 'hier') return { nodes: d.nodes, links: d.links.filter(l => !l.isCross) };
        if (set === 'sem') return {
            nodes: d.nodes.filter(n => !/^COMM_/.test(n.id)),
            links: d.links.filter(l => l.isCross)
        };
        return { nodes: d.nodes, links: d.links };
    }

    return { parseFrontmatter, nodeFromMd, normLinks, folderOf, readCustomColors, fromVaultFiles, fromJson, edgeSets, slice };
}));
