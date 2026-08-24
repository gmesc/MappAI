/* tools/demo-video/monta.js — il MONTAGGIO: fotogrammi + PDF + cartelli → un MP4 (23/8/26).
 *
 *   node tools/demo-video/monta.js                  # il video muto, 2560×1440, 240 s
 *   node tools/demo-video/monta.js --traccia        # + la traccia guida sintetica (say)
 *   node tools/demo-video/monta.js --voce voce.m4a  # la voce VERA di Giacomo, rimuxata
 *   node tools/demo-video/monta.js --secco          # prova l'aritmetica con clip finte
 *
 * Ogni clip esce dalla sua sorgente e viene portato alla durata ESATTA della scena:
 *  · scene d'app → i fotogrammi con le loro durate vere (concat), accelerati se sono di più;
 *  · cartelli e slide → PNG fermi;
 *  · sfoglio → le pagine dei PDF veri, rese con pdftoppm.
 * L'audio: la scena 8 porta la voce VERA dentro il file HTML della sintesi (si estrae il
 * base64), la traccia guida è `say`, e la voce di Giacomo la sostituisce quando arriva.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const M = require('./montaggio-core.js');
const { SCENE, SFOGLIO, STUDIO, MAPPA, CLASSE, PAROLE_AL_SECONDO } = require('./copione.js');

const FUORI = process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo');
const GREZZI = path.join(FUORI, 'grezzi');
const CARTE = path.join(FUORI, 'carte');
const CLIP = path.join(FUORI, 'clip');
const TMP = path.join(FUORI, 'tmp');
const CASA = path.join(process.env.HOME, 'Documents', 'MappAI - file');
const STUDIO_DIR = path.join(CASA, 'Mappe', CLASSE, MAPPA.materia, MAPPA.vault, 'Materiale Studio');
const USCITA = path.join(FUORI, 'demo-mappai-4min.mp4');
const L = 2560, A = 1440, FPS = 30;

const argv = process.argv.slice(2);
const opz = {
    secco: argv.includes('--secco'),
    traccia: argv.includes('--traccia'),
    voce: (argv.indexOf('--voce') >= 0 ? argv[argv.indexOf('--voce') + 1] : ''),
};

function ff(args, etichetta) {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y'].concat(args), { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) throw new Error('ffmpeg ha fallito' + (etichetta ? ' (' + etichetta + ')' : ''));
}
function durataDi(file) {
    const r = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    return Number(String(r).trim());
}
/* FULL BLEED (scelta di Giacomo, 24/8): niente cornice grigia attorno alle schermate —
   i fotogrammi dell'app riempiono la tela. Erano già 2560×1440; lo scale è la garanzia. */
const CORNICE = `scale=${L}:${A}`;

/* ── un clip da una cartella di fotogrammi ──────────────────────────────── */
function clipDaFrames(id, secondi) {
    const dir = path.join(GREZZI, id);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
    const frames = fs.readdirSync(dir).filter((n) => n.endsWith('.jpg')).sort();
    if (!frames.length) throw new Error(id + ': nessun fotogramma');
    /* durata di ogni fotogramma dai timestamp veri; l'ultimo tiene 0,4 s */
    const t = meta.meta.map((m) => m.t);
    const righe = frames.map((n, i) => ({
        file: path.join(dir, n),
        secondi: i < t.length - 1 ? Math.max(0.03, Math.min(3, t[i + 1] - t[i])) : 0.4,
    }));
    const lista = path.join(TMP, id + '.txt');
    fs.writeFileSync(lista, M.listaConcat(righe));
    const grezzi = righe.reduce((s, r) => s + r.secondi, 0);
    const v = M.velocita(grezzi, secondi);
    const uscita = path.join(CLIP, id + '.mp4');
    /* setpts accelera; tpad tiene fermo l'ultimo fotogramma se la registrazione è più corta
       della scena (rallentare un video lo fa sembrare rotto) */
    ff(['-f', 'concat', '-safe', '0', '-i', lista,
        '-vf', `fps=${FPS},setpts=PTS/${v},${CORNICE},tpad=stop_mode=clone:stop_duration=${secondi}`,
        '-t', String(secondi), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', uscita], id);
    console.log(`  · ${id}: ${frames.length} fotogrammi, ${grezzi.toFixed(1)}s → ${secondi}s (×${v})`);
    return uscita;
}

/* ── un clip da un PNG fermo (cartelli, slide) ──────────────────────────── */
function clipDaFermo(nome, png, secondi, zoom) {
    const uscita = path.join(CLIP, nome + '.mp4');
    /* un lentissimo zoom in avanti: senza, un fermo di sedici secondi sembra un'immagine
       appesa invece di un video */
    const filtro = zoom === false ? `scale=${L}:${A}` :
        `scale=${L * 2}:${A * 2},zoompan=z='min(zoom+0.00035,1.06)':d=${Math.round(secondi * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${A}:fps=${FPS}`;
    ff(['-loop', '1', '-i', png, '-vf', filtro, '-t', String(secondi),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', uscita], nome);
    return uscita;
}

/* ── le VISTE della mappa (scena 04a): i PDF della Vista studio, coi movimenti ──
   I PDF sono A4 orizzontali col fondo bianco: la tela bianca È il full bleed.
   `pan` scala a larghezza > tela e fa scorrere il ritaglio da sinistra a destra;
   `zoomout` parte vicino e si ritira finché la mappa non si vede intera. */
function clipStudio() {
    return STUDIO.map((v, i) => {
        const pdf = path.join(STUDIO_DIR, v.file);
        if (!fs.existsSync(pdf)) throw new Error('vista mancante: ' + v.file);
        const base = path.join(TMP, 'studio-' + String(i).padStart(2, '0'));
        execFileSync('pdftoppm', ['-png', '-r', '250', '-f', '1', '-l', '1', pdf, base]);
        const png = fs.readdirSync(TMP).filter((n) => n.startsWith('studio-' + String(i).padStart(2, '0') + '-')).map((n) => path.join(TMP, n))[0];
        if (!png) throw new Error('resa fallita: ' + v.file);
        /* i PDF della Vista studio hanno margini bianchi enormi: senza il ritaglio il
           contenuto esce minuscolo (misurato su td-01). PIL toglie il bianco, con un
           bordo del 4% perché la mappa non tocchi i bordi del video. */
        const rt = spawnSync('python3', ['-c', [
            'import sys',
            'from PIL import Image, ImageChops',
            'im = Image.open(sys.argv[1]).convert("RGB")',
            'bb = ImageChops.difference(im, Image.new("RGB", im.size, "white")).getbbox()',
            'im2 = im.crop(bb) if bb else im',
            'bx, by = max(8, int(im2.width * .04)), max(8, int(im2.height * .04))',
            'Image.new("RGB", (im2.width + 2 * bx, im2.height + 2 * by), "white").paste(im2, (bx, by)) or None',
            'tela = Image.new("RGB", (im2.width + 2 * bx, im2.height + 2 * by), "white")',
            'tela.paste(im2, (bx, by))',
            'tela.save(sys.argv[1])',
        ].join('\n'), png]);
        if (rt.status !== 0) throw new Error('ritaglio fallito: ' + v.file);
        const nome = 'studio-' + String(i).padStart(2, '0');
        const uscita = path.join(CLIP, nome + '.mp4');
        let filtro;
        if (v.effetto === 'pan') {
            /* larghezza 1.28× la tela: il ritaglio percorre il 28% del foglio in orizzontale,
               centrato in verticale — abbastanza lento da leggere, abbastanza da muoversi */
            const W = Math.round(L * 1.28);
            filtro = `scale=${W}:-2,crop=${L}:${A}:x='(iw-${L})*t/${v.secondi}':y='(ih-${A})/2'`;
        } else if (v.effetto === 'zoomout') {
            filtro = `scale=${L * 2}:${A * 2}:force_original_aspect_ratio=decrease,pad=${L * 2}:${A * 2}:(ow-iw)/2:(oh-ih)/2:color=white,`
                + `zoompan=z='max(1.28-0.28*on/${Math.round(v.secondi * FPS)},1)':d=${Math.round(v.secondi * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${A}:fps=${FPS}`;
        } else {
            filtro = `scale=${L}:${A}:force_original_aspect_ratio=decrease,pad=${L}:${A}:(ow-iw)/2:(oh-ih)/2:color=white`;
        }
        ff(['-loop', '1', '-i', png, '-vf', filtro, '-t', String(v.secondi),
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', uscita], nome);
        return { file: uscita, secondi: v.secondi };
    });
}

/* ── lo sfoglio dei materiali: le pagine dei PDF veri ───────────────────── */
function clipSfoglio(secondiScena) {
    const fermi = [];
    SFOGLIO.forEach((f, i) => {
        const pdf = path.join(STUDIO_DIR, f.file);
        if (!fs.existsSync(pdf)) throw new Error('materiale mancante: ' + f.file);
        const base = path.join(TMP, 'sfoglio-' + i);
        /* -r 150: una pagina A4 esce ~1240×1750, abbastanza per una tela 2K in verticale */
        execFileSync('pdftoppm', ['-png', '-r', '150', '-f', String(Math.min.apply(null, f.pagine)),
            '-l', String(Math.max.apply(null, f.pagine)), pdf, base]);
        const png = fs.readdirSync(TMP).filter((n) => n.startsWith('sfoglio-' + i + '-')).sort().map((n) => path.join(TMP, n));
        const perPagina = f.secondi / png.length;
        png.forEach((p) => fermi.push({ png: p, secondi: perPagina, et: f.et }));
    });
    /* ogni pagina: foglio al centro della tela chiara con la sua etichetta. La composizione
       la fa PIL, non ffmpeg: l'ffmpeg di Homebrew è senza `drawtext` (niente libfreetype) —
       misurato, «No such filter» — e l'etichetta è tipografia, non montaggio. */
    const componi = path.join(TMP, 'componi.py');
    fs.writeFileSync(componi, [
        'import sys, json',
        'from PIL import Image, ImageDraw, ImageFont',
        'L, A = ' + L + ', ' + A,
        'font = ImageFont.truetype(' + JSON.stringify(path.join(__dirname, '..', '..', 'public', 'fonts', 'SpaceMono-Bold.ttf')) + ', 34)',
        'for riga in sys.stdin:',
        '    j = json.loads(riga)',
        '    tela = Image.new("RGB", (L, A), "#f1f4f8")',
        '    pag = Image.open(j["png"]); pag.thumbnail((L, int(A * 0.86)))',
        '    x = (L - pag.width) // 2; y = (int(A * 0.92) - pag.height) // 2',
        '    d = ImageDraw.Draw(tela)',
        '    d.rectangle([x + 8, y + 10, x + pag.width + 8, y + pag.height + 10], fill="#d9dee5")',
        '    tela.paste(pag, (x, y))',
        '    w = d.textlength(j["et"], font=font)',
        '    d.text(((L - w) / 2, A - 84), j["et"], fill="#404040", font=font)',
        '    tela.save(j["fuori"])',
    ].join('\n'));
    const righeJson = fermi.map((f, i) => JSON.stringify({ png: f.png, et: f.et, fuori: path.join(TMP, 'pagina-' + String(i).padStart(2, '0') + '.png') })).join('\n');
    const rp = spawnSync('python3', [componi], { input: righeJson, encoding: 'utf8' });
    if (rp.status !== 0) throw new Error('composizione pagine fallita: ' + (rp.stderr || '').slice(0, 300));
    const clip = fermi.map((f, i) => {
        const png = path.join(TMP, 'pagina-' + String(i).padStart(2, '0') + '.png');
        return { file: clipDaFermo('sfoglio-' + String(i).padStart(2, '0'), png, f.secondi, false), secondi: f.secondi };
    });
    console.log(`  · sfoglio: ${clip.length} pagine in ${secondiScena}s`);
    return clip;
}

/* ── l'audio della sintesi, estratto dal file HTML del vault ────────────── */
function audioSintesi(da, secondi) {
    const html = fs.readdirSync(STUDIO_DIR).filter((n) => /^Sintesi-.*\.html$/i.test(n))
        .map((n) => ({ n, s: fs.statSync(path.join(STUDIO_DIR, n)).size })).sort((a, b) => b.s - a.s)[0];
    if (!html) return null;
    const testo = fs.readFileSync(path.join(STUDIO_DIR, html.n), 'utf8');
    const m = testo.match(/data:audio\/(mpeg|mp3|wav);base64,([A-Za-z0-9+/=]+)/);
    if (!m) return null;
    const grezzo = path.join(TMP, 'sintesi-voce.mp3');
    fs.writeFileSync(grezzo, Buffer.from(m[2], 'base64'));
    const tagliato = path.join(TMP, 'sintesi-voce-taglio.m4a');
    ff(['-ss', String(da), '-i', grezzo, '-t', String(secondi), '-af', 'afade=t=in:d=0.4,afade=t=out:st=' + (secondi - 0.6) + ':d=0.6',
        '-c:a', 'aac', '-b:a', '160k', tagliato], 'audio sintesi');
    return tagliato;
}

/* ── la traccia guida sintetica (say): serve a Giacomo per provare i tempi ── */
function tracciaGuida() {
    const pezzi = [];
    let t = 0;
    SCENE.forEach((s) => {
        const aiff = path.join(TMP, 'voce-' + s.id + '.aiff');
        const r = spawnSync('say', ['-v', process.env.VOCE || 'Federica', '-r', '170', '-o', aiff, s.narrazione]);
        if (r.status === 0 && fs.existsSync(aiff)) pezzi.push({ file: aiff, da: t });
        t += s.secondi;
    });
    if (!pezzi.length) return null;
    const args = [];
    pezzi.forEach((p) => args.push('-i', p.file));
    const filtri = pezzi.map((p, i) => `[${i}:a]adelay=${Math.round(p.da * 1000)}|${Math.round(p.da * 1000)}[a${i}]`).join(';');
    const mix = pezzi.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${pezzi.length}:normalize=0,alimiter=limit=0.9[out]`;
    const uscita = path.join(TMP, 'traccia-guida.m4a');
    ff(args.concat(['-filter_complex', filtri + ';' + mix, '-map', '[out]', '-t', String(M.TETTO), '-c:a', 'aac', '-b:a', '160k', uscita]), 'traccia guida');
    return uscita;
}

/* ── il montaggio ───────────────────────────────────────────────────────── */
function monta() {
    [CLIP, TMP].forEach((d) => { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); });
    const difetti = M.valida(SCENE, SFOGLIO);
    if (difetti.length) throw new Error('copione con difetti: ' + difetti.join(' · '));

    const pezzi = [];
    let tSintesi = 0, tCorrente = 0;
    for (const s of SCENE) {
        if (s.tipo === 'carta') {
            const png = path.join(CARTE, s.id + '.png');
            if (!fs.existsSync(png)) throw new Error('cartello mancante: ' + png + ' — lancia carte.js');
            pezzi.push({ file: clipDaFermo(s.id, png, s.secondi), secondi: s.secondi });
        } else if (s.tipo === 'slide') {
            const slide = fs.readdirSync(CARTE).filter((n) => /^slide-angoli-\d+\.png$/.test(n)).sort();
            if (!slide.length) throw new Error('slide mancanti — lancia carte.js');
            const per = s.secondi / slide.length;
            slide.forEach((n, i) => pezzi.push({ file: clipDaFermo('slide-' + i, path.join(CARTE, n), per, false), secondi: per }));
        } else if (s.tipo === 'sfoglio') {
            clipSfoglio(s.secondi).forEach((c) => pezzi.push(c));
        } else {
            for (const c of M.clipDi(s)) {
                if (c.tipo === 'studio') { clipStudio().forEach((x) => pezzi.push(x)); continue; }
                if (opz.secco) { pezzi.push({ file: clipDaFermo(c.id, path.join(CARTE, '01-gancio.png'), c.secondi, false), secondi: c.secondi }); continue; }
                pezzi.push({ file: clipDaFrames(c.id, c.secondi), secondi: c.secondi });
            }
        }
        if (s.id === '08-sintesi') tSintesi = tCorrente;
        tCorrente += s.secondi;
    }

    /* concat col FILTRO, non col demuxer: il demuxer si fida della durata scritta nel
       contenitore, e su questi clip mente — misurato due volte: col `-c copy` il totale
       era 230 s, col re-encode il totale tornava ma lo sfoglio usciva schiacciato a 6 s
       e le slide allungate. Il filtro decodifica gli stream e li cuce sui fotogrammi. */
    const muto = path.join(TMP, 'muto.mp4');
    const argsC = [];
    pezzi.forEach((p) => argsC.push('-i', p.file));
    /* `setsar=1`: i clip dell'app portano un SAR spurio (22016:22005) e il concat rifiuta
       di cucire stream con SAR diversi — «do not match the corresponding output link» */
    const catene = pezzi.map((_, i) => `[${i}:v]fps=${FPS},setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`).join(';');
    const cat = pezzi.map((_, i) => `[v${i}]`).join('') + `concat=n=${pezzi.length}:v=1:a=0[out]`;
    ff(argsC.concat(['-filter_complex', catene + ';' + cat, '-map', '[out]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', muto]), 'concat');

    /* audio: la voce vera della sintesi sotto la scena 8, e (se chiesta) la traccia guida */
    const tracce = [];
    const voceSintesi = opz.secco ? null : audioSintesi(6, SCENE.find((s) => s.id === '08-sintesi').secondi);
    if (voceSintesi) tracce.push({ file: voceSintesi, da: tSintesi, vol: 1 });
    if (opz.traccia) { const g = tracciaGuida(); if (g) tracce.push({ file: g, da: 0, vol: 0.9 }); }
    if (opz.voce) tracce.push({ file: path.resolve(opz.voce), da: 0, vol: 1 });

    if (!tracce.length) {
        fs.copyFileSync(muto, USCITA);
    } else {
        const args = ['-i', muto];
        tracce.forEach((t) => args.push('-i', t.file));
        const filtri = tracce.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.da * 1000)}|${Math.round(t.da * 1000)},volume=${t.vol}[b${i}]`).join(';');
        const mix = tracce.map((_, i) => `[b${i}]`).join('') + `amix=inputs=${tracce.length}:normalize=0,alimiter=limit=0.95[out]`;
        /* qui il video è UNO stream già chiuso: il copy è sicuro */
        ff(args.concat(['-filter_complex', filtri + ';' + mix, '-map', '0:v', '-map', '[out]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', USCITA]), 'mux');
    }

    fs.writeFileSync(path.join(FUORI, 'copione-da-leggere.md'), M.copioneMd(SCENE, PAROLE_AL_SECONDO, { file: path.basename(USCITA) }));
    const d = durataDi(USCITA);
    const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', USCITA], { encoding: 'utf8' }).trim();
    console.log(`\n— ${path.relative(process.env.HOME, USCITA)} · ${d.toFixed(1)} s · ${dim} · ${(fs.statSync(USCITA).size / 1e6).toFixed(1)} MB`);
    if (Math.abs(d - M.TETTO) > 1.5) throw new Error(`il video dura ${d.toFixed(1)} s invece di ${M.TETTO}`);
    return USCITA;
}

if (require.main === module) { try { monta(); } catch (e) { console.error('KO', e.message); process.exit(1); } }
module.exports = { monta, audioSintesi, tracciaGuida, USCITA };
