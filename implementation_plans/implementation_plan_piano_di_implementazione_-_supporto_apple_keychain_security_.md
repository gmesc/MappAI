# Piano di Implementazione - Supporto Apple Keychain (Security by Design)

Questo piano descrive come migrare la memorizzazione delle API Key di Google Studio e Infomaniak dal `localStorage` del browser (WebView) al **Keychain nativo di Apple** su iOS/iPad, garantendo la crittografia hardware dei segreti a riposo e prevenendo cancellazioni accidentali da parte del sistema operativo in situazioni di memoria ridotta.

## User Review Required

> [!IMPORTANT]
> Le modifiche includono l'aggiunta di codice nativo Swift e Objective-C nel progetto Xcode (`ios/App/App`). 
> Al termine della scrittura dei file, occorrerà eseguire una compilazione dell'applicazione nativa tramite Xcode per registrare il nuovo plugin.

## Proposed Changes

### Componente Nativo iOS (Swift & Objective-C Bridge)

Abiliteremo un plugin Capacitor personalizzato e leggerissimo direttamente all'interno dell'app iOS, senza installare pacchetti Node/NPM esterni.

---

#### [NEW] [KeychainPlugin.swift](file:///Users/giacomomeschini/Antigravity/MappAI_iPad/ios/App/App/KeychainPlugin.swift)
* Implementare la classe nativa `KeychainPlugin` che estende `CAPPlugin`.
* Aggiungere i metodi nativi:
  * `setSecret(_ call: CAPPluginCall)`: salva o sovrascrive un segreto cifrato nel Keychain.
  * `getSecret(_ call: CAPPluginCall)`: legge un segreto dal Keychain (ritorna stringa vuota se non presente).
  * `deleteSecret(_ call: CAPPluginCall)`: rimuove un segreto dal Keychain.
* Utilizzare le API native di iOS `Security.KeychainServices` con l'attributo di accessibilità `kSecAttrAccessibleAfterFirstUnlock` (massimo livello di protezione standard a riposo).

#### [NEW] [KeychainPlugin.m](file:///Users/giacomomeschini/Antigravity/MappAI_iPad/ios/App/App/KeychainPlugin.m)
* Registrare il plugin nativo e i suoi metodi in Objective-C per esporli a Capacitor tramite la macro `CAP_PLUGIN`.

---

### Componente Web / Frontend (In-Memory Cache & Fallback)

Poiché l'app si aspetta di leggere le API Key in modo sincrono durante le chiamate di rete (tramite `window.getSystemKey()`), implementeremo una cache in-memory caricata asincronamente all'avvio dell'applicazione. In questo modo non dovremo stravolgere centinaia di chiamate sincrone nel codice di `app.js`.

---

#### [MODIFY] [storageAdapter.js](file:///Users/giacomomeschini/Antigravity/MappAI_iPad/public/js/storageAdapter.js)
* Definire l'oggetto globale `window.secureKeys` per contenere le chiavi caricate in memoria.
* Definire `window.initSecureKeys()`: una funzione asincrona che, all'avvio dell'app su iOS, interroga il `KeychainPlugin` nativo per riempire la cache `window.secureKeys` con le chiavi salvate nel Keychain.
* Definire `window.saveSecureKey(key, value)`: una funzione che aggiorna sia la cache in memoria sia la destinazione permanente (Keychain su iOS, `localStorage` su browser desktop/Electron).
* Aggiornare i metodi di caricamento modelli e generazione per leggere le chiavi da `window.secureKeys` o, in alternativa, da `localStorage`.

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI_iPad/public/js/app.js)
* Aggiornare `window.getSystemKey()` per leggere prima da `window.secureKeys[storageKey]` e, come fallback, da `localStorage`.
* Nelle funzioni di salvataggio delle API Key (ad esempio durante l'inserimento nel Setup AI o alla chiusura del pannello), invocare `window.saveSecureKey` asincrono per scrivere la chiave in modo sicuro.
* Chiamare `await window.initSecureKeys()` all'inizializzazione dell'app prima di caricare la configurazione AI.

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/MappAI_iPad/public/index.html)
* Aggiornare gli eventi di `onblur` o di input dei campi chiave API nel Setup AI in modo che utilizzino `window.saveSecureKey` al posto del semplice `localStorage.setItem`.
* Chiamare `window.initSecureKeys()` durante l'avvio della pagina (es. subito prima o subito dopo il caricamento di `app.js`).

---

## Verification Plan

### Test Nativo
1. Avviare l'applicazione su iPad tramite Xcode.
2. Inserire le API Key di Gemini e Infomaniak nel pannello Setup AI.
3. Chiudere l'applicazione (terminarla dallo switch delle app di iOS).
4. Riaprire l'applicazione: verificare che le chiavi siano ancora presenti e che i modelli vengano caricati correttamente, dimostrando che la cache in memoria si popola correttamente dal Keychain nativo all'avvio.
5. Rimuovere una chiave e verificare che venga eliminata anche dal Keychain.
