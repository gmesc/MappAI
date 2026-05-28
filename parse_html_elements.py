import re

with open('public/index_classi_nuove.html', 'r', encoding='utf-8') as f:
    html = f.read()

def find_context(text_snippets):
    for snippet in text_snippets:
        # find the snippet and print 100 chars before and 50 after
        match = re.search(r'(.{0,150})' + re.escape(snippet) + r'(.{0,100})', html, re.DOTALL | re.IGNORECASE)
        if match:
            print(f"\n--- Context for '{snippet}' ---")
            print(match.group(0))

snippets = [
    "Mappa Mentale", "Knowledge Graph",
    "URL  Web", "Youtube", "Audio", "PDF", "testo", "video",
    "Nuovo Progetto", "Apri Vault", "Importa JSON", "Pulisci Form",
    "Esempio: La Carta", "Esempio: Rete Elettrica",
    "Configura AI", "Strumenti Visivi", "Inverti Colori", "Interlinea Testo", "Font OpenDyslexic",
    "Profilo Studente", "FEEDBACK & BUG", "insegnai.ch"
]

find_context(snippets)
