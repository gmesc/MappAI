import json, sys, re, collections
S='/private/tmp/claude-501/-Users-giacomomeschini-Claude-MappAI-re/7cbb4350-d695-4405-8913-dd856309ad4a/scratchpad'
sys.path.insert(0,S)
from moduli import M

MAPPE = [
 ("01","Architettura","mappai.architecture.html","Renderer, preload, main, provider AI, vault, server LAN."),
 ("02","Una chiamata al LLM","chiamata-llm.sequence.html","Da fetchModelAPI al POST e ritorno, col salvataggio del JSON."),
 ("03","Dal PDF al JSON","pdf-a-json.workflow.html","Triage, Fase 1, Fase 3, deepening, àncora, copertura, vault."),
 ("04","Dal JSON alla domanda aperta","json-a-domanda.workflow.html","Ramo L1 → materiale con fonti → una chiamata → foglio PDF."),
 ("05","Vita di un nodo","nodo.lifecycle.html","Generato, ancorato, giudicato, nel vault, studiato."),
 ("06","Quiz via QR","quiz-qr.sequence.html","Telefono → live-server → correzione → verdetto; i report."),
 ("07","Dove vanno i token","costi.workflow.html","Le 4 929 chiamate vere e dove finiscono i soldi."),
 ("08","Prima / dopo","confronto-infomaniak.compare.html","L'architettura con e senza Infomaniak."),
 ("09","Fragilità","fragilita.workflow.html","Dieci punti deboli con file e riga."),
 ("10","Lineage del vault","vault.dataflow.html","Chi scrive e chi legge index.yaml, Nodi/*.md, materiali."),
]
FASI = {'avvio':"All'avvio",'generazione':"Generazione",'revisione':"Revisione",'materiali':"Materiali",
        'studio':"Studio",'classe':"Classe e live",'sempre':"Sempre attivo",'dev':"Sviluppo"}
FLAGS = {'ai':"chiama l'AI",'dom':"tocca lo schermo",'io':"legge o scrive",'stampa':"stampa o PDF",
         'rete':"rete",'d3':"disegno della mappa",'modale':"apre un modale"}

desc={}
for l in open(S+'/desc.tsv'):
    if '\t' not in l: continue
    k,v=l.rstrip('\n').split('\t',1)
    desc[k]=v

funcs=json.load(open(S+'/funcs4.json'))

# preload: descrizione automatica dal canale IPC
pre=open('public/js/preload.js',encoding='utf-8').read().split('\n')
for f in funcs:
    if 'preload.js' in f['file'] and f['api'].startswith('electronAPI.'):
        line=pre[f['line']-1]
        m=re.search(r"ipcRenderer\.(invoke|send|on)\(\s*'([^']+)'", line)
        if m:
            verbo = {'invoke':'chiede al processo principale','send':'manda al processo principale','on':'ascolta dal processo principale'}[m.group(1)]
            f['_auto'] = f"Dalla pagina {verbo} il canale «{m.group(2)}»."
        elif 'webUtils' in line:
            f['_auto'] = "Dà il percorso su disco di un file trascinato nella pagina."

ESP = lambda a: ('canale IPC' if a.startswith('ipc:') else
                 'electronAPI' if a.startswith('electronAPI.') else
                 'globale' if a.startswith('window.') else
                 'namespace' if a else 'interna')

rows=[]; moduli={}
for f in funcs:
    b=f['file'].split('/')[-1]
    area, mappe, fase, mdesc = M[b]
    moduli[b]=dict(area=area, mappe=mappe, fase=fase, desc=mdesc, file=f['file'])
    k=f"{f['file']}:{f['line']}"
    if k in desc: d, fonte = desc[k], 'curata'
    elif f.get('_auto'): d, fonte = f['_auto'], 'auto'
    elif len(f['doc'])>=30: d, fonte = f['doc'], 'codice'
    elif f['doc']: d, fonte = f['doc'], 'codice'
    else: d, fonte = '', ''
    nome = f['api'].split(':')[-1] if f['api'].startswith('ipc:') else (f['api'] or f['name'])
    rows.append([
        nome,                      #0 nome pubblico
        f['name'],                 #1 nome interno
        b,                         #2 modulo
        f['line'],                 #3 riga
        f['args'],                 #4 argomenti
        d,                         #5 descrizione
        fonte,                     #6 fonte della descrizione
        ESP(f['api']),             #7 esposizione
        f['flags'],                #8 che cosa fa
        f['righe'],                #9 lunghezza
        f['peek'] if fonte!='codice' and f['doc'] else f['doc'],  #10 nota dal codice
    ])
rows.sort(key=lambda r:(r[2], r[3]))
dati=dict(rows=rows, moduli=moduli, mappe=MAPPE, fasi=FASI, flags=FLAGS)
out=S+'/funzioni-dati.js'
open(out,'w').write('window.MAPPAI_FUNZIONI=' + json.dumps(dati, ensure_ascii=False, separators=(',',':')) + ';')
import os
print('righe', len(rows), '| moduli', len(moduli), '| kB', os.path.getsize(out)//1024)
print('descrizioni: curate', sum(1 for r in rows if r[6]=='curata'),
      'auto', sum(1 for r in rows if r[6]=='auto'),
      'dal codice', sum(1 for r in rows if r[6]=='codice'),
      'senza', sum(1 for r in rows if not r[6]))
print('api con descrizione:', sum(1 for r in rows if r[7]!='interna' and r[5]), '/', sum(1 for r in rows if r[7]!='interna'))
