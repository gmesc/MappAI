import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

# We want to add comments to the tailwind classes in index_refactored.html
# We'll just replace the entire <style type="text/tailwindcss"> block since it's short.

old_style_block = """    <style type="text/tailwindcss">
        @layer components {
        .hero_title { @apply text-[40px] leading-none font-black text-slate-800 tracking-tight; }
        .hero_subtitle { @apply text-slate-500 text-xs font-bold uppercase tracking-widest mt-1; }
        .nav_util_btn { @apply px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm; }
        .quick_action_title { @apply block font-black text-indigo-900 text-sm; }
        
        .step_badge { @apply inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-sm font-bold shrink-0; }
        .step_badge_blue { @apply bg-blue-500; }
        .step_badge_green { @apply bg-green-500; }
        .step_badge_orange { @apply bg-orange-500; }
        .step_badge_yellow { @apply bg-yellow-500; }
        
        .source_btn_text { @apply text-sm font-bold; }
        .source_type_btn { @apply flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg cursor-pointer bg-white transition-all text-slate-600 hover:bg-slate-50 hover:border-slate-300; }
        .mode_btn { @apply flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-2xl cursor-pointer bg-white transition-all text-slate-600 min-w-[120px]; }
        .mode_btn.active { @apply border-indigo-600 bg-indigo-50 text-indigo-600; }
        
        .input_label_sm { @apply text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1; }
        .feature_toggle_title { @apply text-xs font-bold text-slate-700 flex items-center gap-1.5; }
        .form_helper_text { @apply text-xs text-slate-500 italic mb-2; }
        
        .form_input { @apply w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500; }
        textarea.form_input { @apply min-h-[60px]; }
        
        .btn_generate { @apply w-full py-4 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold rounded-2xl transition-colors hover:bg-indigo-700; }
        .btn_secondary_action { @apply w-full py-3 bg-white border border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer; }
        .btn_primary { @apply px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md border-none cursor-pointer; }
        .link_primary { @apply text-xs font-bold text-indigo-500 cursor-pointer hover:underline; }

        .drawer_title { @apply text-xl font-black text-indigo-900 mb-4 flex items-center gap-2; }
        .drawer_text { @apply text-[15px] text-slate-600 leading-relaxed space-y-3; }
        .drawer_link { @apply flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors cursor-pointer; }
        .drawer_section_title { @apply text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1; }

        .error_title { @apply text-lg font-bold text-slate-800 mb-2 flex items-center gap-2; }
        .error_body_text { @apply text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto; }
      }
    </style>"""

new_style_block = """    <style type="text/tailwindcss">
        @layer components {
        /* -- Header e Landing -- */
        .hero_title { @apply text-[40px] leading-none font-black text-slate-800 tracking-tight; } /* Utilizzato in: Titolo "MappAI" in alto a sx */
        .hero_subtitle { @apply text-slate-500 text-xs font-bold uppercase tracking-widest mt-1; } /* Utilizzato in: Sottotitolo "Visualizzatore di conoscenza" in alto a sx */
        .nav_util_btn { @apply px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm; } /* Utilizzato in: Bottoni della navbar ("Tuo Profilo", "Configura AI") */
        .quick_action_title { @apply block font-black text-indigo-900 text-sm; } /* Utilizzato in: Testi dei bottoni rettangolari ("Nuovo Progetto", "Apri Vault", "Importa JSON") */
        
        /* -- Moduli Step Form (Badge colorati) -- */
        .step_badge { @apply inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-sm font-bold shrink-0; } /* Utilizzato in: Tondini numerati (1,2,3,4) */
        .step_badge_blue { @apply bg-blue-500; } /* Utilizzato in: Colore badge Step 1 (Carica Fonti) */
        .step_badge_green { @apply bg-green-500; } /* Utilizzato in: Colore badge Step 2 (Modalità) */
        .step_badge_orange { @apply bg-orange-500; } /* Utilizzato in: Colore badge Step 3 (Rami Principali) */
        .step_badge_yellow { @apply bg-yellow-500; } /* Utilizzato in: Colore badge Step 4 (Densità Diramazioni) */
        
        /* -- Pulsanti Scelta Sorgente e Modalità di estrazione -- */
        .source_btn_text { @apply text-sm font-bold; } /* Utilizzato in: Etichette ("URL Web", "PDF", ecc.) sotto le icone delle fonti nello Step 1 */
        .source_type_btn { @apply flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg cursor-pointer bg-white transition-all text-slate-600 hover:bg-slate-50 hover:border-slate-300; } /* Utilizzato in: Pulsanti delle fonti nello Step 1 (URL Web, YouTube, Audio, PDF, Testo) */
        .mode_btn { @apply flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-2xl cursor-pointer bg-white transition-all text-slate-600 min-w-[120px]; } /* Utilizzato in: Bottoni modalità ("Mappa Mentale" e "Knowledge Graph") nello Step 2 */
        .mode_btn.active { @apply border-indigo-600 bg-indigo-50 text-indigo-600; } /* Utilizzato in: Stato selezionato dei bottoni modalità */
        
        /* -- Etichette Input e Helper Text nel Form -- */
        .input_label_sm { @apply text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1; } /* Utilizzato in: Etichette in maiuscoletto sopra i campi di input (es. "Focus specifico (Opzionale)") */
        .feature_toggle_title { @apply text-xs font-bold text-slate-700 flex items-center gap-1.5; } /* Utilizzato in: Testi vicino agli switch (toggle) come "Generazione HD" e "Forza Livello Root" */
        .form_helper_text { @apply text-xs text-slate-500 italic mb-2; } /* Utilizzato in: Testini di aiuto in corsivo, es. "Definisci i rami principali per organizzare lo studio:" */
        
        /* -- Input, Textarea e Modali -- */
        .form_input { @apply w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500; } /* Utilizzato in: Tutti gli input testuali e password (es. URL video, Token API, Focus Specifico) */
        textarea.form_input { @apply min-h-[60px]; } /* Utilizzato in: Variante per le textarea (Focus Specifico, Descrizione Segnalazione) */
        
        /* -- Bottoni d'Azione Primari e Secondari -- */
        .btn_generate { @apply w-full py-4 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold rounded-2xl transition-colors hover:bg-indigo-700; } /* Utilizzato in: Bottone gigante "Genera Nuova Mappa" a fine form */
        .btn_secondary_action { @apply w-full py-3 bg-white border border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer; } /* Utilizzato in: Bottone "Pulisci Form" */
        .btn_primary { @apply px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md border-none cursor-pointer; } /* Utilizzato in: Bottoni di conferma generici nei modali (Es. "Salva le impostazioni", "Conferma" o "Ho capito") */
        .link_primary { @apply text-xs font-bold text-indigo-500 cursor-pointer hover:underline; } /* Utilizzato in: Piccoli link azzurri nei modali (Es. "Ottieni chiave qui") */

        /* -- Drawer Laterale (insegnai.ch) -- */
        .drawer_title { @apply text-xl font-black text-indigo-900 mb-4 flex items-center gap-2; } /* Utilizzato in: Titolo "Chi ha creato MappAI?" all'interno del drawer laterale */
        .drawer_text { @apply text-[15px] text-slate-600 leading-relaxed space-y-3; } /* Utilizzato in: Paragrafi di testo standard del drawer ("Ciao, mi chiamo Giacomo...") */
        .drawer_link { @apply flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors cursor-pointer; } /* Utilizzato in: Link ai social (Instagram, Facebook), alla mail e al sito web */
        .drawer_section_title { @apply text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1; } /* Utilizzato in: Titolo piccolo in giallo, es. "FEEDBACK & BUG" nel drawer */

        /* -- Modali d'Errore Nativo -- */
        .error_title { @apply text-lg font-bold text-slate-800 mb-2 flex items-center gap-2; } /* Utilizzato in: Titolo "Attenzione" nel modale d'errore nativo */
        .error_body_text { @apply text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto; } /* Utilizzato in: Corpo del messaggio di errore nel modale nativo */
      }
    </style>"""

html = html.replace(old_style_block, new_style_block)

with open('public/index_refactored.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated successfully!")
