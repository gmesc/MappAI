/* Campionario modali — PROPOSTE SCRITTE A MANO
 *
 * Per la maggior parte dei campioni la proposta viene generata dal DOM
 * dell'originale (titolo → mm-head, riquadri → mm-sez, campi → mm-campo,
 * bottoni → mm-btn). Qui stanno solo quelli che meritano un ridisegno vero,
 * dove cioè cambia l'IMPAGINAZIONE e non soltanto la vernice.
 *
 * Le classi sono quelle di `public/css/mappai-modal-tokens.css`; la pelle
 * `.prop-skin` che avvolge la proposta porta le variabili della versione
 * proposta da Giacomo il 29/7 (raggio 24, padding 28, icone 24, bottoni
 * maiuscoli con spaziatura .2em).
 *
 * chiave = id della sezione nel campionario (es. 'dyn-pipeline')
 */
'use strict';

const chk = (label, on, desc) =>
    `<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;padding:3px 0">
        <input type="checkbox" ${on ? 'checked' : ''} style="accent-color:var(--mm-accent);width:16px;height:16px;margin-top:2px;flex:0 0 auto">
        <span><span style="font-size:12.5px;font-weight:700;color:var(--mm-testo-2)">${label}</span>
        ${desc ? `<span style="display:block;font-size:11px;color:var(--mm-testo-3);line-height:1.5">${desc}</span>` : ''}</span></label>`;

const radio = (nome, label, desc, on) =>
    `<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;padding:3px 0">
        <input type="radio" name="${nome}" ${on ? 'checked' : ''} style="accent-color:var(--mm-accent);margin-top:3px;flex:0 0 auto">
        <span><span style="font-size:12.5px;font-weight:700;color:var(--mm-testo-2)">${label}</span>
        <span style="display:block;font-size:11px;color:var(--mm-testo-3);line-height:1.5">${desc}</span></span></label>`;

const campo = (etichetta, inner) =>
    `<label style="display:block;margin-bottom:10px"><span class="mm-label">${etichetta}</span>${inner}</label>`;

const sel = (aria, ...opzioni) =>
    `<select class="mm-campo" aria-label="${aria}">${opzioni.map(o => `<option>${o}</option>`).join('')}</select>`;

const num = (aria, v) =>
    `<input class="mm-campo" type="number" value="${v}" aria-label="${aria}" style="max-width:92px">`;

module.exports = {

    /* ══════════════════════════════════════════════════════════════════════
       Genera materiali — da modale a colonna (600px, 5 riquadri impilati,
       si scorre) a CRUSCOTTO (1160px): a sinistra il CONTESTO che non cambia
       mai (dove va la roba, con quale preset, quanto costa), a destra i tre
       materiali affiancati, che sono la scelta vera.
       Perché: nella versione a colonna la stima delle chiamate AI sta in fondo,
       fuori dallo schermo mentre spunti le opzioni — cioè il numero che dovrebbe
       guidare la scelta non lo vedi mentre scegli.
       ══════════════════════════════════════════════════════════════════════ */
    'dyn-pipeline': `
<div class="mm-box mm-box--xl" role="dialog" aria-modal="true" aria-labelledby="pp-t">
  <div class="mm-head">
    <div class="mm-head__ico"><i data-lucide="package"></i></div>
    <div style="flex:1">
      <div class="mm-title" id="pp-t">Genera materiali</div>
      <div class="mm-subtitle">Mappa + quiz + fogli nodi + sintesi, archiviati nel vault</div>
    </div>
    <button type="button" class="mm-close" aria-label="Chiudi">×</button>
  </div>

  <div class="mm-body mm-body--dash">
    <aside class="mm-body__side">
      <div class="mm-sez" style="margin-bottom:10px">
        <span class="mm-sez__t">Destinazione</span>
        ${campo('Classe', sel('Classe destinataria', '4R', '1B', '2A'))}
        ${campo('Disciplina', sel('Disciplina', 'Storia', 'Scienze'))}
        <div style="font-size:11px;color:var(--mm-testo-3);line-height:1.55;margin-top:2px">
          I file finiscono in<br><code style="font-size:10.5px">Mappe / 4R / Storia /</code></div>
      </div>

      <div class="mm-sez" style="margin-bottom:10px">
        <span class="mm-sez__t">Preset</span>
        ${sel('Preset', 'full ++', 'essenziale', 'solo quiz')}
        <div style="display:flex;gap:6px;margin-top:9px">
          <button type="button" class="mm-btn mm-btn--secondary" data-role="secondary" style="flex:1;padding:7px 8px">Applica</button>
          <button type="button" class="mm-btn mm-btn--secondary" data-role="secondary" style="flex:1;padding:7px 8px">Salva</button>
        </div>
      </div>

      <div class="mm-sez" style="background:var(--mm-accent-soft);border-color:#c7d2fe">
        <span class="mm-sez__t" style="color:var(--mm-accent)">Costo stimato</span>
        <div style="font-size:26px;font-weight:800;color:var(--mm-accent);line-height:1.1">~20</div>
        <div style="font-size:11px;color:var(--mm-testo-2);margin-bottom:8px">chiamate all'AI</div>
        <div style="font-size:11px;color:var(--mm-testo-3);line-height:1.7">
          <div style="display:flex;justify-content:space-between"><span>A · mappa</span><b>5</b></div>
          <div style="display:flex;justify-content:space-between"><span>B · quiz</span><b>9</b></div>
          <div style="display:flex;justify-content:space-between"><span>C · fogli</span><b>2</b></div>
          <div style="display:flex;justify-content:space-between"><span>D · sintesi</span><b>4</b></div>
        </div>
      </div>
    </aside>

    <main class="mm-body__main">
      <div class="mm-sez">
        <span class="mm-sez__t">Quiz e flashcard</span>
        ${chk('Scelta multipla', true)}
        ${chk('Vero / Falso', true)}
        ${chk('Flashcard', true)}
        <div style="display:flex;gap:8px;margin-top:10px">
          <label style="flex:0 0 92px"><span class="mm-label">Per ramo</span>${num('Domande per ramo', 6)}</label>
          <label style="flex:1"><span class="mm-label">Angolo</span>${sel('Angolo delle domande', 'Automatico (misto)', 'Definizioni', 'Cause ed effetti')}</label>
        </div>
      </div>

      <div class="mm-sez">
        <span class="mm-sez__t">Fogli dei nodi</span>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <label style="flex:1"><span class="mm-label">Livello</span>${sel('Livello dei nodi', 'Tutti i livelli', 'Solo L1', 'Fino a L2')}</label>
          <label style="flex:0 0 84px"><span class="mm-label">Formato</span>${sel('Formato del foglio', '2×2', '3×4', '2×1')}</label>
        </div>
        ${chk('Titolo', true)}
        ${chk('Parole chiave', true)}
        ${chk('Da completare', false)}
        ${chk('Scheda', true)}
      </div>

      <div class="mm-sez">
        <span class="mm-sez__t">Sintesi</span>
        ${chk('Sintesi della mappa', true, 'Un testo unico che ricuce i rami')}
        ${chk('Voce naturale (MP3)', false, 'Costa una chiamata in più e qualche minuto')}
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--mm-bordo);font-size:11px;color:var(--mm-testo-3);line-height:1.6">
          Se la voce naturale non riesce, la pipeline prosegue: il materiale resta,
          l'audio si rigenera dopo.</div>
      </div>

      <div class="mm-sez" style="grid-column:1 / -1">
        <span class="mm-sez__t">Adatta alla classe 4R</span>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          ${radio('pp-ad', 'Solo la mappa', 'profondità e complessità dei contenuti sul grado', false)}
          ${radio('pp-ad', 'Solo i materiali', 'registro e note su quiz, fogli e sintesi', false)}
          ${radio('pp-ad', 'Entrambi', 'mappa sul grado + materiali', true)}
        </div>
      </div>
    </main>
  </div>

  <div class="mm-foot mm-foot--split">
    <div style="display:flex;align-items:center;gap:9px;font-size:11.5px;color:var(--mm-testo-3)">
      <i data-lucide="info" style="width:16px;height:16px;flex:0 0 auto"></i>
      La pipeline riprende da dove si è fermata, se qualcosa va storto.</div>
    <div style="display:flex;gap:8px">
      <button type="button" class="mm-btn mm-btn--secondary" data-role="secondary">Annulla</button>
      <button type="button" class="mm-btn mm-btn--primary" data-role="primary"><i data-lucide="play"></i>Avvia</button>
    </div>
  </div>
</div>`
};
