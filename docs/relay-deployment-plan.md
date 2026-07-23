# Implementation plan — Deploy del relay «variante WEB» (modalità Internet delle attività QR)

> Stato: **DA FARE** — piano da riprendere in una sessione dedicata.
> Autore piano: Claude Code · Data: 23 luglio 2026 · Contatto progetto: giacomo@insegnai.ch
> Priorità: media (la modalità WiFi aula funziona già; questo abilita la modalità Internet).

---

## 0. TL;DR

La «modalità Internet» delle attività QR (Lavagna, Studio attivo live, Tutor, Timeline,
Materiali) **non funziona** perché l'app punta di default al relay `wss://live.insegnai.ch`,
**sottodominio che NON esiste in DNS**. Il codice del relay (`relay/`) è già scritto, testato
e supporta tutte le attività (inclusa la Lavagna). Manca solo **deployarlo su un host pubblico
sempre acceso** e far risolvere il dominio. Nessuna modifica al codice dell'app è necessaria
(salvo, eventualmente, cambiare l'URL del relay se non si usa `live.insegnai.ch`).

**Azione minima:** deploy di `relay/server.js` su un host pubblico + record DNS + verifica del
passaggio WebSocket (Upgrade). Poi la modalità Internet funziona per tutte e 5 le attività.

---

## 1. Diagnosi (evidenza raccolta il 23/7/26)

Modalità Internet = «variante WEB»: la sessione locale viene pubblicata su un **relay** (ponte
HTTPS↔WSS su hosting pubblico). Il docente apre una connessione **WSS in uscita** verso il relay
(funziona dietro NAT/firewall d'aula); gli studenti aprono un URL pubblico `https://<relay>/j/<code>`
e il relay inoltra le loro richieste HTTP sulla WSS fino al server locale del docente su `127.0.0.1`.

Root cause verificata via probe DNS da questa macchina:

```
insegnai.ch        → OK 185.125.27.224   (hosting Infomaniak esistente)
www.insegnai.ch    → OK 185.125.27.224
google.com         → OK 74.125.29.139
live.insegnai.ch   → FAIL ENOTFOUND      ← il sottodominio del relay NON esiste
```

Probe WSS a `wss://live.insegnai.ch/agent` (register `live` e `collab`): **ENOTFOUND** per
entrambi → non è un bug specifico della Lavagna, è il relay **irraggiungibile**.

Conseguenza runtime: `maybeRelay()` in [main.js](../main.js) fallisce l'apertura sessione, va in
**fallback LAN silenzioso** (`relayFallback:true`) → il QR mostrato è un URL di rete locale che
un telefono su rete dati/altro WiFi non può raggiungere → «non funziona». (Il wizard mostra un
toast di fallback via `MappAINetMode.checkFallback`, facile da non notare.)

Il relay è già pronto e completo (verificato nel sorgente):
- `relay/relay-core.js` `ACTIVITIES` include `collab`; `ALLOW` ha le rotte collab
  (`/api/session`, `/api/board`, `/api/join`, `/api/nodes`, statici `/public/collab/`,
  `/public/js/mappai-collab-core.js`); `entryPathFor('collab', token)` →
  `/public/collab/student.html?s=<token>` (il token viaggia, ok).
- `relay-client.js` (nel main Electron) apre la WSS, riconnessione con backoff, ping keepalive.

**Nessun difetto di codice noto nel relay per la Lavagna.** Il problema è il deploy/DNS.

---

## 2. Come è cablato oggi (mappa del codice)

| Pezzo | File / punto | Nota |
|---|---|---|
| URL relay usato dall'app | [main.js](../main.js) `relayUrlSetting()` (~L.182-192) | Precedenza: `env MAPPAI_RELAY_URL` → `<userData>/mappai-settings.json {"relayUrl"}` → **default `wss://live.insegnai.ch`** |
| Apertura sessione web | [main.js](../main.js) `maybeRelay(kind, info, opts, activity, mode)` (~L.1732) | Attiva solo se `opts.netMode === 'web'`; fallback LAN su errore |
| Client relay (main) | [relay-client.js](../relay-client.js) `openSession()` | WSS out → `<relayUrl>/agent`; inoltra req al server locale `127.0.0.1:<port>` |
| Server relay (da deployare) | [relay/server.js](../relay/server.js) `createRelay()` | Env: `PORT`, `PUBLIC_ORIGIN`, `RELAY_SECRET` (opz.) |
| Logica pura relay | [relay/relay-core.js](../relay/relay-core.js) | `ACTIVITIES`, `ALLOW` (allowlist rotte per attività), `entryPathFor`, `publicUrlFor`, `extractToken` |
| Toggle UI WiFi/Internet | [public/js/mappai-net-mode.js](../public/js/mappai-net-mode.js) | `netMode` `'lan'|'web'`; kill-switch `mappai_web_mode='0'` |
| Test | `tests/relay-core.test.js`, `tests/relay-server.test.js` | Passano; coprono allowlist, token, entry |

**Config env del relay server** (da `relay/server.js`, avvio diretto):
- `PORT` — porta di ascolto (default 8790). Su hosting gestito la fissa il pannello.
- `PUBLIC_ORIGIN` — origin pubblico, es. `https://live.insegnai.ch` (serve a costruire l'URL `/j/<code>`).
- `RELAY_SECRET` — opzionale, segreto condiviso per limitare chi può registrare sessioni.

**Config lato app** (per puntare a un relay diverso da `live.insegnai.ch`, senza toccare il codice):
- `MAPPAI_RELAY_URL=wss://<host>` come variabile d'ambiente, **oppure**
- `<userData>/mappai-settings.json` → `{"relayUrl": "wss://<host>"}` (userData = cartella dati Electron dell'app).

---

## 3. Opzioni di hosting (con trade-off)

### A) Infomaniak — CONSIGLIATA (coerente con lo stack esistente)
`insegnai.ch` è già su Infomaniak. Il relay `relay/` è un server Node http+ws standard;
`relay/package.json` cita esplicitamente «hosting Infomaniak».
- **Pro:** svizzero/GDPR (coerente col posizionamento educativo, dati Tutor = personali),
  endpoint **condiviso** tra tutti i docenti, costo dentro l'hosting esistente. Skill
  `deploy-infomaniak` disponibile per automatizzare.
- **Contro / punto delicato:** il proxy gestito deve **passare l'Upgrade WebSocket (WSS)** e non
  chiudere le connessioni lunghe (idle). Il relay già manda un ping applicativo ogni 25s per
  contrastare l'idle-timeout del proxy Infomaniak, ma va **verificato in test** che l'Upgrade
  arrivi fino a Node (alcuni hosting «Node.js» gestiti proxano solo HTTP).
- **Complessità: media** — una sessione dedicata (~mezza giornata con i test).

### B) Fly.io — miglior opzione gratuita persistente
- **Pro:** free allowance, **WSS persistente** (non dorme), dominio custom con cert (CNAME
  `live.insegnai.ch` → app Fly). Deploy in ~30 min. Node `ws` funziona nativamente.
- **Contro:** un provider in più da gestire; per i dati Tutor valutare la region (scegliere EU,
  es. `cdg`/`ams`, per restare vicini al GDPR — non svizzero puro come Infomaniak).
- **Complessità: bassa-media.**

### C) Tunnel pronti (ngrok / cloudflared / tailscale funnel) — SOLO demo
- **Pro:** gratis, velocissimi.
- **Contro (bloccanti per il prodotto):** espongono il **PC del singolo docente**, non un endpoint
  condiviso → ogni docente dovrebbe avviare il proprio tunnel; **non parlano il protocollo del
  relay** (`/j/<code>` + registrazione WSS) → servirebbe modifica al codice per usare l'URL del
  tunnel al posto dell'handshake. Buoni solo per una demo da un singolo PC.
- **Non adatti** all'architettura multi-docente già progettata. Scartare per la produzione.

**Raccomandazione:** **A (Infomaniak)** per il prodotto; **B (Fly.io)** se si vuole zero costo/attrito
subito. Entrambe = mezza giornata scarsa. Evitare C se non per una demo estemporanea.

---

## 4. Passi operativi

### Percorso A — Infomaniak
1. **DNS:** nel gestore DNS di `insegnai.ch`, creare il record per `live.insegnai.ch`
   (A verso l'IP del sito Node, o CNAME secondo quanto richiede l'hosting Node di Infomaniak).
2. **Sito Node.js** nel pannello Infomaniak: nuovo sito «Node.js», dominio `live.insegnai.ch`,
   entry point `server.js`, `PORT` = quella assegnata dal pannello (letta da env), start `node server.js`.
3. **Deploy** di `relay/` (git deploy o SFTP). `relay/package.json` ha già `start: node server.js`
   e dipendenza `ws`. Eseguire `npm install` lato server.
4. **Env** sul sito: `PUBLIC_ORIGIN=https://live.insegnai.ch` (obbligatorio per l'URL `/j/<code>`),
   `PORT` (dal pannello), opz. `RELAY_SECRET=<segreto>` (se attivato, va passato anche dall'app —
   vedi §5, `opts.secret` in `relay-client.js`).
5. **WSS/Upgrade:** verificare nel pannello/proxy che l'Upgrade WebSocket su `/agent` arrivi a Node
   e che non ci sia un idle-timeout < 30s. Questo è il punto che più spesso rompe il deploy.
6. **HTTPS:** assicurarsi che `live.insegnai.ch` abbia certificato valido (Let's Encrypt del pannello).
7. Usare la skill **`deploy-infomaniak`** per i dettagli operativi (login/sessione, .env, static, «server non parte»).

### Percorso B — Fly.io
1. `fly launch` dentro `relay/` (genera `fly.toml`; NON deployare subito).
2. In `fly.toml`: esporre la porta interna del relay, `[[services]]` con `internal_port` = `PORT`,
   handlers `["tls","http"]`, e assicurarsi che i WebSocket passino (Fly proxy li supporta di default).
   Impostare `PUBLIC_ORIGIN=https://live.insegnai.ch` (o il dominio Fly) come env/secret.
3. `fly deploy`.
4. **Dominio custom:** `fly certs add live.insegnai.ch` + CNAME `live.insegnai.ch` → `<app>.fly.dev`
   nel DNS di `insegnai.ch`. Attendere il cert.
5. Region EU (es. `cdg`) per i dati Tutor.

### Comune ai due percorsi — puntare l'app al relay
- Se il dominio è `live.insegnai.ch`, **nessuna modifica**: è già il default (`main.js:191`).
- Altrimenti, senza ricompilare: `MAPPAI_RELAY_URL=wss://<host>` o
  `<userData>/mappai-settings.json → {"relayUrl":"wss://<host>"}`.
- (Opzionale) aggiornare il default in `main.js` `relayUrlSetting()` se si cambia dominio stabilmente.

---

## 5. Verifica (checklist da spuntare a deploy fatto)

1. **DNS:** `node -e "require('dns').lookup('live.insegnai.ch',(e,a)=>console.log(e?e.code:a))"` → IP, non `ENOTFOUND`.
2. **Health:** `curl https://live.insegnai.ch/healthz` → `{"ok":true,...}`.
3. **WSS register (probe):** connettersi a `wss://live.insegnai.ch/agent`, inviare
   `{t:'register',v:1,activity:'collab',token:'probeTok1234'}` → attesa `{t:'registered', code, publicUrl}`.
   (Script di probe usato in diagnosi: `ws` + `relay/relay-core.js` `encodeFrame`/`decodeFrame`.)
4. **Flusso studente end-to-end su Internet vero** (telefono su rete dati, PC su internet):
   avviare una Lavagna in modalità Internet → QR `https://live.insegnai.ch/j/<code>` →
   il telefono carica la pagina studente, sceglie le 3 emoji, entra, aggiunge nodi, «Fatto».
5. **Tutte e 5 le attività:** Lavagna, Studio attivo live, Tutor, Timeline, Materiali — ognuna in
   modalità Internet. (Il Tutor invia testi personali → confermare che l'host scelto è accettabile GDPR.)
6. **Idle:** sessione lasciata ferma > 60s poi ripresa → la WSS regge (ping keepalive) e il QR resta valido.
7. **Fallback:** spegnere il relay → l'app deve tornare a LAN con toast (nessun crash).
8. **Riconnessione:** killare la WSS a metà sessione → `relay-client` riconnette con `wantCode` e
   lo stesso `/j/<code>` resta valido (QR proiettato non cambia).

---

## 6. Sicurezza (già nel codice — da confermare in prod)

- **Allowlist rotte** per attività (`relay/relay-core.js` `ALLOW`): il relay inoltra SOLO le rotte
  studente previste; mai `main.js`, vault, chiavi. Verificare che resti così dopo il deploy.
- **Token** sessione nel QR/cookie; `adminToken` mai esposto agli studenti (le operazioni docente
  girano in locale, non passano dal relay).
- **TTL/stale/rate-limit:** `relay-core.js` `LIMITS` (sessionTtlMs, staleMs, regPerMinPerIp, body cap).
  Confermare valori adatti alla classe reale.
- **`RELAY_SECRET`** (opzionale): se impostato lato server, impostarlo anche lato app
  (`relay-client.js` `opts.secret` → frame `register.secret`) per impedire registrazioni non autorizzate.
- **Dati Tutor = personali** → preferire host **svizzero/UE** (Infomaniak ideale).

---

## 7. Decisioni aperte (da fissare quando si riprende)

- [ ] Host: Infomaniak (A) o Fly.io (B)?
- [ ] Dominio: confermare `live.insegnai.ch` (o altro)?
- [ ] `RELAY_SECRET`: attivarlo? (consigliato in prod) → allora aggiornare anche il payload lato app.
- [ ] Aggiornare il default `main.js:191` se il dominio cambia, o gestirlo via `mappai-settings.json`?
- [ ] Region/giurisdizione per i dati Tutor.

## 8. Riferimenti
- Codice relay: `relay/server.js`, `relay/relay-core.js`, `relay/package.json`, `relay-client.js`.
- Aggancio app: `main.js` (`relayUrlSetting`, `maybeRelay`), `public/js/mappai-net-mode.js`.
- Skill deploy: `deploy-infomaniak` (hosting Node Infomaniak, login/sessione, .env, static).
- Test: `tests/relay-core.test.js`, `tests/relay-server.test.js`.
