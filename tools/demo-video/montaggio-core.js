/* tools/demo-video/montaggio-core.js — l'aritmetica del montaggio (23/8/26).
 *
 * Logica PURA, UMD, provata in Node (inv. 4): durate, lista `concat` di ffmpeg, budget di
 * parole, e il copione da leggere. Niente CDP, niente ffmpeg, niente disco: qui si contano
 * secondi, e un secondo sbagliato è l'unico modo di consegnare un video che non dura 4 minuti.
 */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MappAIMontaggio = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TETTO = 240;               /* quattro minuti: il vincolo del braindump */

    /** somma delle durate, in secondi */
    function durata(scene) { return scene.reduce((t, s) => t + s.secondi, 0); }

    /** valida il copione: torna la lista dei difetti (vuota = si può montare) */
    function valida(scene, sfoglio) {
        const difetti = [];
        if (!scene.length) difetti.push('nessuna scena');
        const tot = durata(scene);
        if (tot !== TETTO) difetti.push(`la somma delle scene fa ${tot} s, non ${TETTO}`);
        scene.forEach((s, i) => {
            if (!s.id) difetti.push(`scena ${i}: manca l'id`);
            if (!(s.secondi > 0)) difetti.push(`${s.id}: durata non positiva`);
            if (s.secondi > 60) difetti.push(`${s.id}: ${s.secondi} s in una scena sola — si spezza`);
            if (s.tipo === 'app' && !s.gesto && !(s.parti || []).length) difetti.push(`${s.id}: scena d'app senza gesto`);
            if (s.parti) {
                const somma = s.parti.reduce((t, p) => t + p.secondi, 0);
                if (somma !== s.secondi) difetti.push(`${s.id}: le sue parti fanno ${somma} s, la scena ${s.secondi} s`);
                /* il gesto serve solo alle parti che si REGISTRANO nell'app: una parte con un
                   tipo suo (studio, carta…) nasce da altro */
                s.parti.forEach((p) => { if ((p.tipo || s.tipo) === 'app' && !p.gesto) difetti.push(`${s.id}/${p.id}: parte senza gesto`); });
            }
            if (!s.narrazione) difetti.push(`${s.id}: manca la narrazione`);
        });
        const ids = scene.map((s) => s.id);
        if (new Set(ids).size !== ids.length) difetti.push('due scene con lo stesso id');
        /* lo sfoglio dei PDF deve durare quanto la sua scena, o il montaggio allunga l'ultimo
           fermo e il video sfora senza dirlo */
        if (sfoglio) {
            const sc = scene.find((s) => s.tipo === 'sfoglio');
            const somma = sfoglio.reduce((t, f) => t + f.secondi, 0);
            if (sc && somma !== sc.secondi) difetti.push(`lo sfoglio dura ${somma} s, la sua scena ${sc.secondi} s`);
            sfoglio.forEach((f) => { if (!f.pagine || !f.pagine.length) difetti.push(`${f.file}: nessuna pagina`); });
        }
        return difetti;
    }

    /** quante parole stanno in una scena, al ritmo dato */
    function budgetParole(secondi, paroleAlSecondo) { return Math.round(secondi * (paroleAlSecondo || 2.5)); }

    function contaParole(testo) { return (String(testo || '').trim().match(/\S+/g) || []).length; }

    /** la lista per il demuxer `concat` di ffmpeg: una riga file + una riga durata per clip.
     *  ⚠️ Il demuxer ignora la durata dell'ULTIMO elemento se non si ripete il file: si ripete. */
    function listaConcat(clip) {
        const righe = [];
        clip.forEach((c) => {
            righe.push(`file '${String(c.file).replace(/'/g, "'\\''")}'`);
            if (c.secondi != null) righe.push(`duration ${Number(c.secondi).toFixed(3)}`);
        });
        const ultimo = clip[clip.length - 1];
        if (ultimo) righe.push(`file '${String(ultimo.file).replace(/'/g, "'\\''")}'`);
        return righe.join('\n') + '\n';
    }

    /** il fattore di velocità per far entrare `grezzi` secondi di registrazione in `secondi` di
     *  scena: >1 accelera (il time-lapse della generazione), 1 lascia com'è.
     *  Sotto la soglia non si rallenta MAI: un video rallentato sembra rotto, si tiene l'ultimo
     *  fotogramma fermo (lo fa `monta.js` con `tpad`). */
    function velocita(grezzi, secondi) {
        if (!(grezzi > 0) || !(secondi > 0)) return 1;
        const v = grezzi / secondi;
        return v > 1 ? Number(v.toFixed(4)) : 1;
    }

    /** il copione da leggere: una sezione per scena, col budget e il conto attuale */
    function copioneMd(scene, paroleAlSecondo, meta) {
        const pas = paroleAlSecondo || 2.5;
        const tot = durata(scene);
        const parole = scene.reduce((t, s) => t + contaParole(s.narrazione), 0);
        const out = [];
        out.push('# Demo MappAI — copione da leggere');
        out.push('');
        out.push(`> Generato da \`montaggio-core.js\`: non si scrive a mano, si cambia in \`copione.js\`.`);
        out.push(`> Durata del montaggio: **${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}** · `
            + `parole scritte: **${parole}** su un budget di **${budgetParole(tot, pas)}** (${pas} parole al secondo).`);
        if (meta && meta.file) out.push(`> Video muto: \`${meta.file}\``);
        out.push('');
        out.push('Leggi guardando il video muto: ogni sezione comincia al minuto indicato. Se una frase');
        out.push('non ci sta, taglia le parole — non accelerare: il montaggio è già a tempo.');
        out.push('');
        let t = 0;
        scene.forEach((s) => {
            const mm = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
            const n = contaParole(s.narrazione);
            const b = budgetParole(s.secondi, pas);
            const segno = n > b ? ` ⚠️ ${n - b} parole di troppo` : ` (${b - n} parole di margine)`;
            out.push(`## ${mm} · ${s.titolo} — ${s.secondi} s`);
            out.push('');
            out.push(`*${n} parole su ${b}${segno}*`);
            out.push('');
            out.push(s.narrazione);
            out.push('');
            t += s.secondi;
        });
        return out.join('\n');
    }

    /** le CLIP di una scena: le sue parti, o la scena stessa */
    function clipDi(scena) {
        if (scena.parti && scena.parti.length) return scena.parti.map((p) => ({ id: p.id, gesto: p.gesto, secondi: p.secondi, tipo: p.tipo || scena.tipo }));
        return [{ id: scena.id, gesto: scena.gesto, secondi: scena.secondi, tipo: scena.tipo }];
    }

    return { TETTO, durata, valida, budgetParole, contaParole, listaConcat, velocita, copioneMd, clipDi };
}));
