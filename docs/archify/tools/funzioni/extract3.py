import re, json, sys, collections
S='/private/tmp/claude-501/-Users-giacomomeschini-Claude-MappAI-re/7cbb4350-d695-4405-8913-dd856309ad4a/scratchpad'
KW={'if','for','while','switch','catch','function','return','typeof','new','do','else','with','constructor'}

FUNC   = re.compile(r'^(?P<ind>\s*)(?:(?P<exp>window\.)(?P<wname>[A-Za-z_$][\w$]*)\s*=\s*)?(?:async\s+)?function\s*(?P<name>[A-Za-z_$][\w$]*)?\s*\((?P<args>[^)]*)\)')
CONSTFN= re.compile(r'^(?P<ind>\s*)(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\((?P<args>[^)]*)\)\s*=>')
PROPFN = re.compile(r'^(?P<ind>\s*)(?P<name>[A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\((?P<args>[^)]*)\)\s*=>')
METHFN = re.compile(r'^(?P<ind>\s*)(?:async\s+)?(?P<name>[A-Za-z_$][\w$]*)\s*\((?P<args>[^)]*)\)\s*\{\s*$')
IPC    = re.compile(r"ipcMain\.(handle|on)\(\s*['\"]([^'\"]+)['\"]")

def comment_above(lines, i):
    out=[]; j=i-1
    while j>=0:
        s=lines[j].strip()
        if s.startswith('//'): out.insert(0, s.lstrip('/').strip()); j-=1
        elif s.startswith('*') or s.startswith('/*') or s.endswith('*/'):
            t=s.strip('/').strip('*').strip()
            if t and not set(t) <= set('═─=-* '): out.insert(0, t)
            j-=1
        else: break
        if len(out)>8: break
    return ' '.join(out)[:300].strip()

PAT = {
 'ai':   re.compile(r'fetchModelAPI|generateGemini|generateInfomaniak'),
 'dom':  re.compile(r'document\.|innerHTML|querySelector|addEventListener|createElement'),
 'io':   re.compile(r'electronAPI\.|localStorage|fs\.|ipcMain|ipcRenderer|writeFile|readFile'),
 'stampa':re.compile(r'jsPDF|window\.print|printWindow|\.save\(|@media print'),
 'rete': re.compile(r'http\.|express|res\.json|fetch\(|WebSocket|req\.'),
 'd3':   re.compile(r'\bd3\.|simulation|svg\.'),
 'modale':re.compile(r'MappAIModal|showModal|openModal|showToast|showConfirm|showAlert|showPrompt'),
}

def scan(path):
    src=open(path, encoding='utf-8', errors='replace').read()
    lines=src.split('\n')
    exposed={}
    for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*[;,\n]', src):
        exposed[m.group(2)] = m.group(1)
    for m in re.finditer(r'(?:window\.|module\.exports\s*=\s*)([A-Za-z_$][\w$]*)?\s*=?\s*\{', src):
        pass
    for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=\s*\{', src):
        name=m.group(1); start=m.end()-1; depth=0; body=None
        for k in range(start, min(start+12000, len(src))):
            if src[k]=='{': depth+=1
            elif src[k]=='}':
                depth-=1
                if depth==0: body=src[start+1:k]; break
        if body is None: continue
        for mm in re.finditer(r'(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*(?=[,}\n])', body):
            pub=mm.group(1); impl=mm.group(2) or mm.group(1)
            exposed.setdefault(impl, name+'.'+pub)
    # contextBridge (preload)
    bridge = 'exposeInMainWorld' in src
    res=[]
    for i,l in enumerate(lines):
        kind='funzione'; win=False
        m=FUNC.match(l)
        if m and (m.group('name') or m.group('wname')):
            name=m.group('wname') or m.group('name'); args=m.group('args'); ind=len(m.group('ind')); win=bool(m.group('exp'))
        else:
            m=CONSTFN.match(l)
            if m: name=m.group('name'); args=m.group('args'); ind=len(m.group('ind'))
            else:
                m=PROPFN.match(l)
                if m and m.group('name') not in KW:
                    name=m.group('name'); args=m.group('args'); ind=len(m.group('ind')); kind='metodo'
                else:
                    m=METHFN.match(l)
                    if m and m.group('name') not in KW:
                        name=m.group('name'); args=m.group('args'); ind=len(m.group('ind')); kind='metodo'
                    else: continue
        api = 'window.'+name if win else exposed.get(name,'')
        if bridge and kind=='metodo' and not api: api='electronAPI.'+name
        res.append(dict(name=name, kind=kind, file=path, line=i+1,
                        args=re.sub(r'\s+',' ',args).strip()[:140], indent=ind, api=api,
                        doc=comment_above(lines,i)))
    # canali IPC
    for i,l in enumerate(lines):
        m=IPC.search(l)
        if m:
            res.append(dict(name=m.group(2), kind='canale IPC', file=path, line=i+1, args='(event, args)',
                            indent=0, api='ipc:'+m.group(2), doc=comment_above(lines,i)))
    res.sort(key=lambda x:x['line'])
    for i,fn in enumerate(res):
        start=fn['line']-1
        end = res[i+1]['line']-1 if i+1<len(res) else len(lines)
        end = min(max(end,start+2), start+140)
        body='\n'.join(lines[start:end])
        fn['righe']=end-start
        fn['flags']=[k for k,p in PAT.items() if p.search(body)]
        sig=[]
        for l2 in lines[start+1:end]:
            s=l2.strip()
            if not s or s.startswith('//') or s in ('{','}'): continue
            sig.append(s[:110])
            if len(sig)>=3: break
        fn['peek']=' ⏎ '.join(sig)[:250]
    return res

out=[]
for f in sys.argv[1:]: out += scan(f)
json.dump(out, open(S+'/funcs4.json','w'), ensure_ascii=False)
print('tot', len(out), '| api', sum(1 for x in out if x['api']), '| ipc', sum(1 for x in out if x['kind']=='canale IPC'))
