# Merge ScribaData into ScriverAiData

The goal is to consolidate the project's data into a single directory, `ScriverAiData`, ensuring all existing data and configuration from `ScribaData` are preserved.

## Proposed Changes

### Data Consolidation

The following steps will be taken to merge the contents:

1.  **Merge `registro_verbali.csv`**:
    -   Append the data rows from `ScribaData/registro_verbali.csv` (excluding the header) to `ScriverAiData/registro_verbali.csv`.
2.  **Merge `settings/config.json`**:
    -   Combine the values from both files, prioritizing non-empty values from `ScribaData` (especially `hf_token` and `custom_keywords`).
3.  **Move Subdirectories**:
    -   Move `ScribaData/bin/ollama` to `ScriverAiData/bin/`.
    -   Move `ScribaData/cache/` (if it contains data) to `ScriverAiData/cache/`.
    -   Move all files from `ScribaData/verbali/` to `ScriverAiData/verbali/`.
    -   Move all files from `ScribaData/trascrizioni_grezze/` to `ScriverAiData/trascrizioni_grezze/`.
    -   Move all files from `ScribaData/temp_state/` to `ScriverAiData/temp_state/`.
    -   Move all files from `ScribaData/registry/` to `ScriverAiData/registry/`.
    -   Move all files from `ScribaData/mappings/` to `ScriverAiData/mappings/`.
4.  **Cleanup**:
    -   Delete the `ScribaData` directory.

## Verification Plan

### Manual Verification
-   Check that `ScriverAiData/registro_verbali.csv` contains the merged list of entries.
-   Verify that `ScriverAiData/settings/config.json` contains the correct `hf_token` and `custom_keywords`.
-   Ensure all files from `ScribaData/verbali` are now present in `ScriverAiData/verbali`.
-   Verify the project still points to `ScriverAiData` (confirmed in `backend/main.py`).
