# Implementation Plan - Complete Autonomous Project Renaming to "MappAI"

This plan details the step-by-step methodology to fully rename the project from its current temporary and Swiss-specific naming conventions (`Mapp_AI_Infomaniak`, `MappAI Swiss`, `mapp-ai-swiss`, `Mapp_AI_v2`, etc.) to a unified, completely autonomous product name: **MappAI**.

This includes updating file contents, Electron configuration, localized strings, storage keys to guarantee database/configuration isolation from older versions, and finally renaming the root workspace directory from `Mapp_AI_Infomaniak` to `MappAI`.

---

## User Review Required

> [!IMPORTANT]
> - **Autonomy & Local Storage Isolation**: To ensure complete autonomy from previous versions (avoiding profile clashes or settings overrides), we are renaming all `localStorage` keys from `mapp_*` and `mapp_ai_*` to `mappai_*` (e.g. `mappai_user_profile`, `mappai_all_profiles`, `mappai_language`).
> - **Workspace Directory Rename**: Renaming the active folder `/Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak` to `/Users/giacomomeschini/Antigravity/MappAI` is a high-level system operation. We will perform the file changes first, then perform the folder renaming command. After the rename is complete, the workspace path will be updated.
> - **App Distribution Name**: The built Electron application DMG and app bundle will now be named purely **MappAI** instead of **MappAI Swiss**, aligning perfectly with the new product identity.

---

## Proposed Changes

### 1. Build and Package Manifest

#### [MODIFY] [package.json](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/package.json)
* Update `name` from `"mapp-ai-swiss"` to `"mappai"`.
* Update `productName` from `"MappAI Swiss"` to `"MappAI"`.
* Update `description` to `"MappAI - AI-Powered Mind Mapping and Knowledge Graph Tool"`.

#### [MODIFY] [package-lock.json](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/package-lock.json)
* Update all matches of `"name": "mapp-ai-swiss"` to `"name": "mappai"`.

---

### 2. Electron Main Process

#### [MODIFY] [main.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/main.js)
* Update window `title` configuration from `"MappAI Swiss"` to `"MappAI"`.
* Update auto-save folder names from `"Salvataggi MappAI"` and `"Salvataggi MappAI"` to `"Salvataggi MappAI"` to keep paths clean and unified.

---

### 3. User Interface & Branding

#### [MODIFY] [public/index.html](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/index.html)
* Update `<title>` from `"MappAI — Generatore AI di mappe e grafici di conoscenza"` to `"MappAI"` or keep the descriptive suffix but ensure no Swiss-specific terms are present.
* Update any text references or header logos to brand purely as **MappAI**.

#### [MODIFY] [public/traduzioni/it_translations.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/traduzioni/it_translations.js) & [en_translations.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/traduzioni/en_translations.js)
* Standardize all translated interface strings to use "MappAI" instead of "MappAI Swiss".

---

### 4. JavaScript Core & Local Storage Keys

#### [MODIFY] [public/js/app.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/js/app.js)
* Replace all legacy `localStorage` keys to ensure total settings separation:
  * `mapp_user_profile` $\rightarrow$ `mappai_user_profile`
  * `mapp_all_profiles` $\rightarrow$ `mappai_all_profiles`
  * `mapp_language` $\rightarrow$ `mappai_language`
  * `mapp_ai_language` $\rightarrow$ `mappai_language`
  * `mapp_bar_collapsed` $\rightarrow$ `mappai_bar_collapsed`
* Update branding texts inside D3 charts and user interface strings generated dynamically.

---

### 5. Workspace Folder Relocation

#### [RENAME] Directory `Mapp_AI_Infomaniak` $\rightarrow$ `MappAI`
* We will run a macOS terminal command to rename the root directory from `/Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak` to `/Users/giacomomeschini/Antigravity/MappAI`.
* Since this shifts the workspace folder, we will run the `mv` command cleanly and guide the user on the workspace reload.

---

## Verification Plan

### Automated Verification
* Run `npm run dist` from the new `MappAI` directory to ensure that the Electron builder correctly compiles a standalone DMG named `MappAI-1.0.0-arm64.dmg` containing the application `MappAI.app` (Exit Code 0).

### Manual Verification
* Run the built package, open **AI Settings**, and verify that the window header shows purely **MappAI**.
* Create a test Student Profile and verify it is saved under the new autonomous storage keys (`mappai_all_profiles`).
