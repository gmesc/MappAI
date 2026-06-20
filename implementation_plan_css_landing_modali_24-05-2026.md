# Analisi Semantica e Piano di Refactoring (Scope Ristretto)

Come richiesto, ho scartato il piano generale e ho analizzato **esclusivamente** le 4 aree specifiche da te indicate. Ecco il raggruppamento semantico dei testi e degli elementi grafici di queste sezioni, con le proposte per accorparli in classi unificate.

## 1. Testi degli Step (Le 4 sezioni numerate)

**Elementi analizzati:** 
- Le etichette dei 4 step: `"Carica le tue Fonti"`, `"Cosa desideri generare?"`, `"Rami Principali (Livello 1)"`, `"Densità Diramazioni / Numero Concetti"`.
- I testi di aiuto: `"Definisci i rami principali..."`, `"Fornisci contesto opzionale..."`.
- I badge numerici: `"1"`, `"2"`, `"3"`, `"4"`.

**Proposta di Accorpamento (Nuove Classi / Classi Esistenti):**
- **`.step_container`**: Raggruppa l'impalcatura del titolo dello step (`@apply flex items-center gap-2 text-slate-700 font-bold mb-2;`). Attualmente inline.
- **`.step_badge_X`**: (Già creata) Gestisce i pallini colorati con i numeri.
- **`.step_helper_text`**: (Rinominiamo `.form_helper_text` in `.step_helper_text` per maggiore chiarezza). Gestirà tutti i corsivi grigi di spiegazione sotto agli step (`@apply text-xs text-slate-500 italic mb-2;`).

---

## 2. Bottoni e Toggle (Form Landing Page)

**Elementi analizzati:**
- Selettori Sorgente: `"Sintesi da PDF"`, `"Video / Audio"`, `"Sito Web / Link"`, `"Testo Libero"`.
- Selettori Modalità: `"Mappa Mentale"`, `"Mappa Concettuale"`, `"Assistente / Tutor"`.
- Toggle Funzionalità: `"Generazione HD (Multi-Pass)"`.
- Bottoni di Esempio: `"Esempio: La Carta (Quiz)"`, `"Esempio: Rete Elettrica"`.
- Bottoni Azione: `"Genera Nuova Mappa"`, `"Pulisci Form"`, `"Importa JSON"`.

**Proposta di Accorpamento:**
- **`.btn_source` e `.btn_mode`**: (Precedentemente nominati `.source_type_btn` e `.mode_btn`). Questi sono già stati unificati, basta mantenerli.
- **`.toggle_label`**: (Rinominato da `.input_label_sm` o `.feature_toggle_title`). Per accorpare i testi dei toggle come "Generazione HD" (`@apply text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1;`).
- **`.btn_demo_preset`**: NUOVA classe per accorpare i bottoncini gialli/blu degli esempi in fondo alla landing (`@apply text-[11px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 transition-colors;`).

---

## 3. Contenuti dei Modali (I 4 bottoni nella Head)

**Elementi analizzati:**
- **Modale AI**: `"Configura AI"`, `"Lingua:"`, `"Come ottenere la chiave?"`, Input delle chiavi API.
- **Modale Accessibilità**: `"Strumenti Visivi"`, `"Inverti Colori"`, `"Interlinea Testo"`, `"Font OpenDyslexic"`.
- **Modale Tutorial**: `"Metodo di Studio Attivo"`, ecc.
- **Modale Profilo Studente**: `"Profilo Studente"`, `"Nome o Nickname"`, `"Scuola"`.

**Proposta di Accorpamento (Modali Head):**
- **`.modal_header_title`**: Per uniformare tutti i titoloni dei modali (Configura AI, Profilo Studente) (`@apply text-xl font-bold text-slate-800 mb-2;`). Attualmente sparsi.
- **`.modal_section_title`**: Per i titoletti divisori come "Strumenti Visivi", "Lingua:" (`@apply text-xs font-bold text-slate-500 uppercase tracking-widest mt-4 mb-2;`).
- **`.modal_input_label`**: Per i campi come "Nome o Nickname" o "Scuola" (riutilizza le specifiche di `.input_label_sm`).
- **`.btn_a11y_tool`**: Spostiamo la classe CSS statica `a11y-btn` nel blocco Tailwind `@apply` per farti controllare uniformemente tutti i bottoni del pannello accessibilità.

---

## 4. Contenuti del Drawer "insegnai.ch"

**Elementi analizzati:**
- Titoli: `"MappAI - Info & Feedback"`, `"Feedback & Bug"`, `"Supporto Tecnico"`.
- Testi: `"Ciao, mi chiamo Giacomo e sono lo sviluppatore..."`.
- Link/Bottoni: `"Manuale d'uso"`, `"Discord"`, `"giacomo@insegnai.ch"`, `"Segnalazione Invia feedback o bug"`.

**Proposta di Accorpamento (Drawer):**
- **`.drawer_title` e `.drawer_text`**: (Già identificati) Uniformano rispettivamente il titolo principale e i paragrafi discorsivi.
- **`.drawer_section_title`**: Per "Feedback & Bug" e "Supporto Tecnico" (`@apply text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1;`).
- **`.btn_feedback_action`**: NUOVA classe per accorpare i pulsanti rettangolari come "Segnalazione", "Invia feedback o bug", "Discord" e "Manuale d'Uso" (`@apply flex items-center gap-3 text-left p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm w-full;`). Attualmente hanno classi chilometriche.

---
> [!IMPORTANT]
> **Revisione Richiesta**
> Ho limitato l'analisi esatta agli elementi da te indicati (Landing Step, Landing Form, Modali Head, Drawer). Questo raggruppamento ti permette di ripulire totalmente queste 4 sezioni nevralgiche. 
> Sei d'accordo con i raggruppamenti proposti? Se sì, scrivo lo script per iniettare queste classi in `index_refactored.html`.
