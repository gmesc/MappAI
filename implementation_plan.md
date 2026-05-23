# Implementazione Scambio Vault tramite kDrive & QR Code

Questo piano descrive i dettagli tecnici per aggiungere la funzionalità di condivisione e importazione rapida dei Vault di studio tra dispositivi (Desktop e iPadOS) sfruttando l'archiviazione di **Infomaniak kDrive** e i **QR Code**.

## User Review Required

> [!IMPORTANT]
> * **Requisito Fotocamera su iPadOS**: Per consentire all'iPad di inquadrare i QR code tramite fotocamera, aggiungeremo la stringa `NSCameraUsageDescription` nel file `Info.plist` del pacchetto nativo iOS.
> * **Sicurezza e Credenziali**: Le credenziali kDrive (API Token e Drive ID) verranno salvate localmente all'interno di `localStorage` (o tramite Keychain su iOS se configurato).
> * **Formato di Scambio Consolidato**: Il Vault verrà esportato e caricato come file JSON consolidato. Per garantire lo scambio completo delle risorse collegate, tutte le immagini locali contenute nella cartella `Allegati` verranno convertite in stringhe Base64 durante il processo di esportazione.

## Proposed Changes

### 1. Traduzioni e Localizzazione

#### [MODIFY] [it_translations.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/traduzioni/it_translations.js)
Aggiungere le chiavi per la configurazione kDrive, la scansione e i messaggi di stato:
```javascript
    kdrive_section_title: "Condivisione kDrive & Scambio QR",
    kdrive_api_token_label: "kDrive API Token",
    kdrive_drive_id_label: "kDrive Drive ID",
    kdrive_token_placeholder: "Inserisci token API kDrive...",
    kdrive_drive_placeholder: "Inserisci ID del Drive (es. 123456)...",
    kdrive_api_how: "Come configurare la condivisione?",
    btn_import_qr: "Importa da QR",
    btn_share_qr_title: "Condividi Vault via QR",
    scan_qr_title: "Inquadra il QR Code",
    scan_qr_desc: "Posiziona il QR code del Vault davanti alla fotocamera per importarlo.",
    kdrive_error_credentials: "Per favore, configura prima il Token e il Drive ID nelle impostazioni Setup.",
    kdrive_uploading: "Esportazione e caricamento su kDrive in corso...",
    kdrive_success: "Vault condiviso con successo! Mostro il QR code.",
    kdrive_importing: "Download e importazione del Vault in corso...",
    kdrive_import_success: "Vault importato con successo nel tuo Second Brain!",
    kdrive_error_upload: "Errore durante il caricamento su kDrive.",
    kdrive_error_download: "Errore durante il download del Vault.",
```

#### [MODIFY] [en_translations.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/traduzioni/en_translations.js)
Aggiungere le medesime chiavi tradotte in lingua inglese.

---

### 2. Interfaccia Setup & Modali QR

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/MappAI/public/index.html)
* **Setup Modal (`config-ai-modal`)**: Aggiungere una sezione **kDrive Sharing Settings** in fondo alla lista delle impostazioni per consentire l'inserimento di:
  * Campo password per `kdrive-api-token`.
  * Campo testo per `kdrive-drive-id`.
* **Vault Manager (`vault-manager-modal`)**:
  * Aggiungere l'icona e il bottone per attivare la condivisione QR accanto a ciascun vault nella lista generata dinamicamente.
  * Aggiungere un pulsante **"Importa da QR"** nel footer accanto a "Sfoglia altre cartelle".
* **Nuovi Modali**:
  * **`share-qr-modal`**: Mostra il QR code generato tramite l'API di `qrserver.com` e il pulsante per copiare il link di download diretto.
  * **`scanner-qr-modal`**: Mostra la schermata con lo stream della fotocamera e un mirino grafico animato per inquadrare il codice.
* **Script Esterni**: Inserire il tag script per caricare `jsQR.js` tramite jsdelivr CDN per la decodifica dei codici QR.

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)
* Definire gli stili del mirino grafico dello scanner e l'animazione della barra di scansione:
  ```css
  .scanner-viewport {
      position: relative;
      overflow: hidden;
  }
  .scanner-laser {
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      background: #6366f1;
      box-shadow: 0 0 8px #6366f1;
      animation: scan-line 2.5s infinite linear;
  }
  @keyframes scan-line {
      0%, 100% { top: 0%; }
      50% { top: 100%; }
  }
  ```

---

### 3. Logica Client e Gestione kDrive API

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
* **Caricamento e Salvataggio Impostazioni**:
  * Caricare all'avvio `kdrive_api_token` e `kdrive_drive_id` da `localStorage` / `Keychain`.
  * Associare eventi `onblur` o `onchange` per memorizzare istantaneamente i valori modificati.
* **Rendering Pulsante QR**: Aggiornare la funzione `loadVaultList()` per inserire un bottone con icona QR su ogni card.
* **Esportazione e QR (`window.shareVaultViaQR`)**:
  * Recuperare i parametri kDrive.
  * Richiedere il JSON consolidato via `window.electronAPI.getConsolidatedVault(folderPath)`.
  * Eseguire l'upload del file su kDrive (`POST https://api.infomaniak.com/3/drive/{drive_id}/upload`) salvandolo nella cartella `/MappAI_Shared/` come `vault_[nome_vault].json`.
  * Generare il link di condivisione (`POST https://api.infomaniak.com/2/drive/{drive_id}/files/{file_id}/link`) impostando `"right": "public"`.
  * Trasformare il link pubblico in download diretto (appendendo `/download` alla fine del link).
  * Aprire il modale `share-qr-modal` disegnando il QR code con l'immagine di `qrserver.com`.
* **Scanner Fotocamera (`window.startQRScanner` / `window.stopQRScanner`)**:
  * Attivare la webcam del dispositivo con `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`.
  * Renderizzare lo stream video nel tag `<video>` del modale.
  * Utilizzare un ciclo basato su `requestAnimationFrame` per prelevare frame dal video, disegnarli in un canvas invisibile e analizzarli con la libreria `jsQR`.
  * Alla decodifica di un link kDrive valido:
    * Interrompere lo stream e chiudere lo scanner.
    * Scaricare il JSON consolidato dal link diretto.
    * Salvare il Vault in locale tramite `window.electronAPI.saveVault({ folderPath, mapData })` e ricaricare la lista dei vault.

#### [MODIFY] [storageAdapter.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/storageAdapter.js)
* Estendere la compatibilità su iPadOS per caricare le chiavi secure da Keychain o `localStorage`.
* Simulare o implementare le funzioni di upload e download kDrive per l'iPad utilizando la libreria CapacitorHttp o fetch integrato (poiché non sono soggetti a CORS restrittivi nell'ambiente nativo iOS).

---

### 4. Integrazione Backend Electron & Permessi Nativi

#### [MODIFY] [preload.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/preload.js)
* Esporre la nuova chiamata IPC `getConsolidatedVault: (folderPath) => ipcRenderer.invoke('get-consolidated-vault', folderPath)`.

#### [MODIFY] [main.js](file:///Users/giacomomeschini/Antigravity/MappAI/main.js)
* Implementare il gestore IPC `get-consolidated-vault`:
  * Caricare l'intero vault utilizzando la logica nativa di parsing (index.yaml, links.json, Nodi/*.md, chat_state, ecc.).
  * Per ciascun nodo, analizzare l'array `images`. Qualora contenga percorsi relativi della cartella `Allegati`, leggere l'immagine dal disco, convertirla in Base64 (data URI) e sovrascrivere il percorso relativo nel JSON restituito.
* Aggiungere un proxy o abilitare la chiamata Axios nel backend se necessario, ma i client moderni possono richiamare direttamente le API di Infomaniak se non ci sono problemi CORS o qualora delegato interamente per semplicità al renderer (essendo Electron privo di limitazioni CORS strict se configurato con privileges appropriati o aggirabile tramite proxy).

#### [MODIFY] [Info.plist](file:///Users/giacomomeschini/Antigravity/MappAI/ios/App/App/Info.plist)
* Aggiungere le autorizzazioni per l'utilizzo della fotocamera:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>MappAI necessita dell'accesso alla fotocamera per consentire la scansione dei QR code e l'importazione rapida dei Vault.</string>
  ```

## Verification Plan

### Automated Tests
* Nessuno.

### Manual Verification
1. Configurare un account kDrive con API Token e Drive ID reali nel pannello Setup.
2. Cliccare sull'icona QR di un Vault esistente per caricarlo e generare il QR code.
3. Verificare che venga mostrato il QR code e che il link contenga il suffisso `/download`.
4. Avviare lo Scanner QR (su iPadOS o simulando webcam su desktop).
5. Inquadrare il QR code generato.
6. Verificare che il Vault venga scaricato, salvato nel file system locale e mostrato nella lista dei Vault.
7. Caricare il Vault appena importato e verificare che tutti i nodi e le immagini Base64 vengano caricati correttamente.
