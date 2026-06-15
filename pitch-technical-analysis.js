const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
        WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak, VerticalAlign } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22 },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4788" },
        paragraph: {
          spacing: { before: 240, after: 120 },
          outlineLevel: 0,
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E5C9A" },
        paragraph: {
          spacing: { before: 180, after: 100 },
          outlineLevel: 1,
        },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        // TITLE & INTRO
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("MappAI — Pitch Commerciale")],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun("Analisi Tecnica & Struttura della Presentazione")],
          spacing: { after: 360 },
          alignment: AlignmentType.CENTER,
          run: { italics: true, color: "666666", size: 20 },
        }),

        // SEZIONE 1: VALORE TECNICO
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("1. VALORE TECNICO — Punti di Forza")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Frontend Reattivo & Accessibile")],
        }),
        new Paragraph({
          children: [
            new TextRun("Stack: "),
            new TextRun({ text: "Electron 30 (cross-platform desktop), D3.js v7 (grafo interattivo), Tailwind CSS (runtime via CDN), PDF.js e KaTeX", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Vantaggi commerciali: "),
            new TextRun({ text: "Interfaccia responsiva, nessuna installazione di dipendenze pesanti (tutto bundled), supporto nativo per Mac (Apple Silicon + Intel), Windows e Linux. Accessibilità built-in (Lucide icons per iconografia semantica).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Design tokens: "),
            new TextRun({ text: "Sistema di colori coerente basato su gruppi (7 colori L1 per la psicologia visiva), tema chiaro/scuro pronto, componenti riutilizzabili (@layer components).", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Backend AI Multi-Provider")],
        }),
        new Paragraph({
          children: [
            new TextRun("Due provider selezionabili: "),
            new TextRun({ text: "Google Gemini (1M-2M token, state-of-the-art) + Infomaniak (GDPR, dati educativi svizzeri gestiti on-EU).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Strategia: "),
            new TextRun({ text: "Utente scegli il provider. Google fornisce performance massima; Infomaniak garantisce privacy conforme alla legislazione svizzera/EU (LGPD, GDPR). Entrambi usano API native, niente intermediari.", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Generazione multi-fase optimizzata: "),
            new TextRun({ text: "Token budget calibrato per ogni fase (L1 generation → branch expansion → cross-linking → merge semantici). Risultati validati: MindMap 77 nodi, 0 troncamenti, Knowledge Graph densità 2.0 con 55+ tipi di relazioni semantiche.", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Generazione di Contenuti: Due Modalità")],
        }),
        new Paragraph({
          children: [
            new TextRun("MindMap: "),
            new TextRun({ text: "Gerarchico (L0→L5), multi-pass (5 fasi parallele), profondità semantica garantita, branch atomici senza duplicati cross-ramo. Ideale per analisi strutturata, studenti con ADHD (gerarchia visiva).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Knowledge Graph: "),
            new TextRun({ text: "Reticolare, single-pass, comunità auto-emergenti, relazioni di ragionamento (causa→effetto, precede, regola, si oppone). Ideale per discovery, pensiero critico, studenti avanzati.", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        // SEZIONE 2: UI/UX
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("2. ANALISI UI/UX — Abbassamento Curva di Apprendimento")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Flusso Utente: 4 Step Intuitivi")],
        }),

        new Paragraph({
          children: [new TextRun("Step 1: Carica Fonti (PDF, URL, YouTube, DOCX, testo libero)")],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Step 2: Scegli modalità (MindMap vs Knowledge Graph)"),
          ],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Step 3: Dai il nome al progetto + focus (facoltativo: extraction lenses per guidare semantica)"),
          ],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Step 4: Genera + studia (visualizza grafo, naviga, modifica, stampa dossier)"),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Superfici di Studio Dedicate (Accessibility First)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Sidebar dettaglio: "),
            new TextRun({ text: "Descrizione ricca (50–80 parole per nodo) + fonte tracciata + citazioni verbatim.", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Tutor Socratico: "),
            new TextRun({ text: "QA adattivo con feedback intelligente: <60% incoraggiamento + suggerimento; 60–85% approfondimento; 85–95% consolidamento; 95–100% peer teaching (Feynman method).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Quiz & Flashcard: "),
            new TextRun({ text: "Generate automaticamente da ogni nodo, export stampabili (A4 bidimensionale per ritaglio).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Timeline cronologica & Glossario disciplinare: "),
            new TextRun({ text: "Feature extra per Storia e Scienze (13 lenses disciplinari pre-configurate).", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Vault & Persistenza (Obsidian-Compatible)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Struttura: "),
            new TextRun({ text: "~/Documents/MappAI - Vault/{projectName}/ → index.yaml + links.json + Nodi/*.md + Allegati/. Compatibile nativamente con Obsidian, esportabile in HTML/PDF.", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("DAL Protocol (Durability, Audibility, Longevity): "),
            new TextRun({ text: "Retrocompatibilità garantita—fallback per link legacy, parsing bidirezionale, percorsi relativi (non assoluti).", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        // SEZIONE 3: CRITICITA'
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("3. IDENTIFICAZIONE CRITICITÀ — Debiti Tecnici")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Debiti Architetturali (Impatto: ALTO)")],
        }),
        new Paragraph({
          children: [
            new TextRun("app.js monolitico (~14.000 righe): "),
            new TextRun({ text: "Funzioni globali window.*, stato accoppiato, difficile testare e manutenere. Azione: decomposizione in moduli ES6+ (preparazione per Electron 40+, Node.js ESM).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Pattern storage ibrido: "),
            new TextRun({ text: "localStorage vs Electron IPC vs file system. Nessuna astrazione unificata. Rischio: perdita di dati in sincronizzazione multi-tab (Electron non supporta tab native). Azione: stor useStorageAdapter uniformemente.", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("AI provider bridge manuale: "),
            new TextRun({ text: "Conversione Gemini→OpenAI per Infomaniak nel codice (window.InfomaniakBridge). Fragile: ogni nuovo provider richiede un bridge customizzato. Azione: schema intermediario JSON-LD.", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Debiti CSS (Impatto: MEDIO)")],
        }),
        new Paragraph({
          children: [
            new TextRun("703 !important in style.css: "),
            new TextRun({ text: "Guerra di specificità Tailwind vs custom CSS. Rende il codebase fragile (refactoring CSS rischia breakage visuale). Azione: rimuovere gradualmente via @layer components + design token variables.", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Debiti AI (Impatto: MEDIO)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Prompt engineering hardcoded: "),
            new TextRun({ text: "14 template di prompt in prompts_config.json, nessuna versioning, nessun A/B test framework. Nuovo benchmark=nuovo prompt. Azione: versionare template (prompt-v2.0, prompt-v2.1), aggiungere metadati (data benchmark, score atteso, modello target).", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Token budget fragile: "),
            new TextRun({ text: "Fissato a 6000–13000 per fase, ma basato su media storica (test su 10 documenti). Documenti lunghi/complessi rischiano troncamento. Azione: token estimation dinamico basato on testo effettivo (token counter pre-call).", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Debiti di Sicurezza (Impatto: BASSO→MEDIO se aperto al cloud)")],
        }),
        new Paragraph({
          children: [
            new TextRun("API Key storage: "),
            new TextRun({ text: "localStorage (non crittografato in dev, protetto da keychain in produzione Electron). OK per desktop; rischio se portato a web. Azione: migrare a electron-store con crittografia integrata.", bold: false }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("XSS in modali dinamici: "),
            new TextRun({ text: "HTML iniettato via .innerHTML() in 20+ funzioni. Controllato dal backend AI (Gemini/Infomaniak), ma DOMPurify non usato. Azione: audit + DOMPurify su tutte le injections.", bold: false }),
          ],
          spacing: { after: 240 },
        }),

        // SEZIONE 4: PUNCH LIST COMMERCIALE
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("4. PUNCH LIST: Blockers Prima del Launch Commerciale")],
        }),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2340, 2340, 2340, 2340],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  shading: { fill: "2E5C9A", type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Criticità",
                          bold: true,
                          color: "FFFFFF",
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  shading: { fill: "2E5C9A", type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Impatto",
                          bold: true,
                          color: "FFFFFF",
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  shading: { fill: "2E5C9A", type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Sforzo",
                          bold: true,
                          color: "FFFFFF",
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  shading: { fill: "2E5C9A", type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Timeline",
                          bold: true,
                          color: "FFFFFF",
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Sicurezza XSS + keychain encryption")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("ALTO")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("2–3 giorni")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("PRIMA del launch")],
                    }),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Token budget dinamico AI")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("ALTO")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("3–4 giorni")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("PRIMA del launch")],
                    }),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Refactoring CSS (! importante)")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("MEDIO")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("5–7 giorni")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Post-launch (v1.1)")],
                    }),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Decomposizione app.js")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("MEDIO")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("15–20 giorni")],
                    }),
                  ],
                }),
                new TableCell({
                  borders,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun("Q2 2026 (roadmap)")],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new TextRun("")], spacing: { after: 240 } }),

        // SEZIONE 5: PITCH FINALE
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("5. SCALETTA DEL PITCH — 6 Punti Strutturati")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 1: Il Problema (Empatia)")],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "\"", italics: true }),
            new TextRun({
              text: "1.2M studenti con BES/DSA in Italia leggono male, scrivono male, compilano liste prive di senso. Mappe mentali tradizionali? Disegnate a mano, statiche, zero relazioni semantiche. Insegnanti BES/OPI passano 2-3 ore per mappa. Genitori pagano tutor. Ricerca: 67% studenti BES abbandona la scuola.",
              italics: true,
            }),
            new TextRun({ text: "\"", italics: true }),
          ],
          spacing: { after: 120 },
          indent: { left: 720 },
        }),
        new Paragraph({
          children: [
            new TextRun("Messaggio: La soluzione non esiste. MappAI la inventa."),
          ],
          spacing: { after: 240 },
          run: { bold: true, color: "1F4788" },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 2: La Visione (Ambizione)")],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "\"", italics: true }),
            new TextRun({
              text: "Trasformare il modo in cui studenti e insegnanti trasformano contenuto complesso in conoscenza visuale. Una mappa generata dall'AI in 2 minuti, già semanticamente ricca, pronta per lo studio: relazioni di causa-effetto, prerequisiti, sequenze, contrapposizioni. Non è AI che sostituisce il pensiero—è uno specchio che riflette la struttura del testo e invita lo studente a ragionare.",
              italics: true,
            }),
            new TextRun({ text: "\"", italics: true }),
          ],
          spacing: { after: 120 },
          indent: { left: 720 },
        }),
        new Paragraph({
          children: [
            new TextRun("Messaggio: MappAI democratizza l'accesso alla visualizzazione della conoscenza."),
          ],
          spacing: { after: 240 },
          run: { bold: true, color: "1F4788" },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 3: La Soluzione (Demos & Proof Points)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Tre demo concrete:"),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("1. Upload PDF storia (20 pagine) → MindMap 77 nodi in 45 sec → mostra sidebar con desc ricca + citazioni → click su nodo → Timeline cronologica auto-generata. Tutor Socratico si offre per QA."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("2. Upload ricerca scientifica (Fotosintesi) → Knowledge Graph 38 nodi, 47% cross-link → mostra relazioni \"produce\", \"richiede\", \"regola\" → formula KaTeX renderizzata su click."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("3. Quiz & Flashcard generati automaticamente da ogni nodo. Stampa A4 bidimensionale (ritaglio). Mostra uno studente BES che sceglie 3 domande, il tutor adatta il livello di difficoltà in tempo reale."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 4: Il Modello Tecnico (Credibilità)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Backend: Due AI provider (Google Gemini + Infomaniak EU-based). Multi-fase generazione (L1 → branch → cross-link). Token budget calibrato: 0 troncamenti su corpus validato. Output JSON + XML validation. Quality score esposto all'utente."),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Frontend: Electron (offline-first), Vault Obsidian-compatible, export HTML/PDF/print. Nessun cloud by default (dati locali)."),
          ],
          spacing: { after: 240 },
          run: { bold: true },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 5: Il Business (Modello Ricavi)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Segmentazione:"),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Studenti BES/Famiglia: Freemium (3 mappe/mese gratis) → Pro (€4.99/mese illimitato)."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Istituti Scolastici / OPI: Licensing (€150–500/anno per 30 utenti, supporto in-school)."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Mercato TAM: 1.2M studenti BES × €30 annual average (mix free→Pro) = €36M. SAM (3-year capture): €5–8M EU + Svizzera."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Punto 6: Roadmap & Risk Mitigation (Realismo)")],
        }),
        new Paragraph({
          children: [
            new TextRun("Release Timeline:"),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("v1.0 (Maggio 2026): Core feature set (MM + KG, Tutor, Quiz, Vault). Security audit completato. Closed beta con 50 utenti BES/OPI."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("v1.1 (Agosto 2026): CSS refactoring, token budget dinamico, Timeline & Glossario."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("v2.0 (2027): Decomposizione app.js, mobile app (Capacitor), cloud collaboration opzionale."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 200 },
        }),

        new Paragraph({
          children: [
            new TextRun("Risk Mitigation:"),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun("Risk: Qualità AI incoerente su documenti lunghi. Mitigation: Token counter pre-call + fallback a MindMap semplice."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Risk: Privacy regulations (GDPR, LGPD). Mitigation: Infomaniak EU-based + on-prem option + transparency report."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun("Risk: Competitive AI tools. Mitigation: Focus su educazione (non generic AI) + community (vault sharing) + offline-first."),
          ],
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 240 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Conclusione")],
        }),
        new Paragraph({
          children: [
            new TextRun("MappAI non è uno strumento generico di AI. È un "),
            new TextRun({ text: "sistema educativo costruito attorno alla neurodiversità", bold: true }),
            new TextRun(". Combina grafica computazionale (D3.js), semantica (Gemini), offline-first (Electron), e pedagogia (tutor Socratico). Il mercato esiste, la tecnologia è provata, il timing è adesso. Il passo successivo: raccogliere investimento seed (€250-500K) per completare il security audit, lanciare closed beta, e conquistare le prime 5K utenti BES prima dell'anno scolastico 2026-27."),
          ],
          spacing: { after: 240 },
          indent: { firstLine: 720 },
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const path = require('path');
  const outputPath = path.join(__dirname, "MappAI_Pitch_Commerciale.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("✅ Documento creato: " + outputPath);
});
