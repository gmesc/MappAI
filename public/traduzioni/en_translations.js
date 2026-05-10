const en_translations = {
    // General
    landing_subtitle: "Knowledge Visualizer",
    btn_setup: "Setup",
    btn_app_guide: "App Guide",
    btn_active_study: "Active Study",
    recent_projects: "Recent Projects",
    new_map_btn: "Generate New Map",
    btn_blank_canvas_label: "Create Blank Canvas (Manual)",
    save_folder: "Save Folder",
    import_json: "Import JSON",
    ext_ai_guide: "External AI Guide",
    sidebar_subtitle: "Knowledge Visualizer",
    tab_structure: "Structure",
    tab_notes: "Notes",
    tab_study: "Study",

    // Setup Steps
    step1: "Upload your Sources",
    step1_desc: "Load your material from different sources:",
    step2: "Topic of Study",
    step2_mindmap: "Mind Map",
    step2_kg: "Knowledge Graph",
    step2_root_label: "Topic of Study (Central Node):",
    step3: "Guide the AI (Focus)",
    step3_l1_title: "Main Branches (Level 1)",
    step3_l1_desc: "Define the main branches to organize your study:",
    step3_add_l1: "Add L1 Node",
    step3_auto_l1: "Automatically generate more L1 nodes",
    step3_focus_label: "Specific Focus (Optional):",
    step3_focus_placeholder: "What should Gemini focus on?",
    step4: "Model and Language",
    step5: "Visualization Style",
    step_density_title: "Branch Density (L4 and L5)",
    step_density_desc: "L1-L2-L3 branches will always be generated. Choose how many branches to generate in deeper levels (0 = stops at L3).",

    // Placeholders
    placeholder_root: "Example: Dante Alighieri, Quantum Physics...",
    placeholder_focus: "Focus on life, works, or a specific concept...",
    placeholder_keywords: "Enter keywords separated by comma...",

    // Loading
    loading_processing: "MappAI is processing...",
    loading_sources: "Interpreting sources with Gemini",

    // Modals - AI Config
    modal_config_title: "AI Configuration",
    btn_save_config: "Save Settings",
    api_key_label: "API Key (Google AI Studio)",
    api_key_desc: "The key will be saved locally.",
    api_key_how: "How to get it?",
    ai_model_label: "AI Model",
    refresh_models: "Refresh Models",
    pricing_free: "<strong>🆓 Free:</strong> Up to 15 req/min and 1,500/day. Great for starting out.",
    pricing_paid: "<strong>💰 Paid:</strong> No limits. Typical cost per map/KG: <strong>5–10 cents €/CHF</strong>.",
    pricing_note: "Enter your API Key and click 'Refresh Models' to see all available models with costs and supported formats.",

    // Modals - App Guide
    modal_guide_title: "How to use MappAI",
    guide_step1_title: "📌 Step 1 — Configure your API Key",
    guide_step1_desc: "Click the 'AI Settings' button at the top right. Enter your Google AI Studio API Key (it's free!). Choose the AI model: Flash models are free and fast, Pro models are more precise but may have costs.",
    guide_step2_title: "📂 Step 2 — Upload your Sources",
    guide_step2_desc: "You can upload material from different sources: PDF, Web URL, YouTube, or Free Text.",
    guide_step3_title: "🎯 Step 3 — Choose Structure",
    guide_step3_desc: "Mind Map: Hierarchical structure (L0→L5) perfect for studying. Knowledge Graph: Network of relationships between concepts, ideal for connecting different themes.",
    guide_step4_title: "✍️ Step 4 — Customize and Guide AI",
    guide_step4_desc: "Enter the Central Node name. You can suggest L1 branches, enable auto-generation, define specific focus and adjust branch density.",
    guide_step5_title: "🗺️ Step 5 — Interact with the Map",
    guide_step5_desc: "Double click a node to read/edit notes. Scroll to zoom. Drag to move. Right click for context menu (quiz, expand, flashcards). Use 'Pin' to lock positions.",
    guide_step6_title: "💾 Step 6 — Save and Resume",
    guide_step6_desc: "Maps are automatically saved in the 'Mapp.AI Saves' folder in your Documents. You can import/export JSON files. Recent projects appear on the landing page bar.",
    guide_notes_title: "📓 Notes Collector",
    guide_notes_desc: "In the sidebar you'll find the Notes Collector: view all notes and images added to nodes. It's your digital notebook connected to the map!",
    guide_footer: "Mapp.AI saves everything locally on your Mac. Your data never leaves your device.",

    // Modals - Active Study (Tutorial)
    modal_study_title: "Active Study Method",
    study_intro: "Mapp.AI is not just a diagram generator: it's an **active learning environment**. The AI-generated map is your starting point — real study begins when you customize it.",
    study_sr_title: "🔁 Spaced Repetition",
    study_sr_desc: "Don't repeat everything in one day. Review flashcards at increasing intervals (1d → 3d → 7d → 14d). Mapp.AI integrates a spaced repetition system: right-click nodes to generate and review flashcards!",
    study_ar_title: "🧠 Active Recall",
    study_ar_desc: "Don't read passively: **close your notes** and try to write what you remember. Double click a map node, empty the content and rewrite in your own words. Retrieving from memory is 2-3x more effective than re-reading.",
    study_feynman_title: "👨‍🏫 Feynman Technique",
    study_feynman_desc: "Explain every concept **as if you were teaching it to a 10-year-old**. If you can't do it smoothly, you've found your weak point. Use map nodes to rewrite explanations until they are clear and linear.",
    study_interleaving_title: "🔀 Interleaving (Alternated Study)",
    study_interleaving_desc: "Alternate different topics in the same study session instead of focusing on just one. The brain learns to **distinguish and connect** concepts. Use the Knowledge Graph to visualize cross-links between themes!",
    study_elaboration_title: "❓ Elaborative Interrogation",
    study_elaboration_desc: "For each map node ask yourself: **'Why does it work like this?'** and **'How does it connect to the rest?'**. This level of self-questioning transforms passive reading into deep understanding.",
    study_local_files_title: "📂 Local File Linking",
    study_local_files_desc: "Have more details on your computer? Drag files or click a node to link local documents (PDFs, images, text files). Nodes with linked files show the database icon for instant access to your offline resources.",
    study_footer: "Modified nodes get special icons: (text), (images), (links) and (local files). The more you customize, the more effective your study becomes!",

    // Map View UI
    back_to_home: "Back to Home",
    floating_actions: "Quick Actions",
    a11y_tools: "Compensatory Tools",
    a11y_invert: "Invert Colors",
    a11y_low_contrast: "Reduce Contrast",
    a11y_high_contrast: "High Contrast",
    a11y_grayscale: "Grayscale",

    // Floating Toolbar
    toolbar_center: "Center View",
    toolbar_reorder: "Reorder",
    toolbar_layout: "Layout",
    toolbar_pin: "Pin",
    toolbar_attraction: "Attr.",
    toolbar_dist: "Dist.",
    toolbar_text: "Text",
    toolbar_path: "Path",
    toolbar_photo: "Photo",

    // Sidebar Panels
    sidebar_no_node: "No node selected",
    sidebar_no_node_desc: "Use Left click to study, Right click to manage learning state and content.",
    sidebar_macro_areas: "Macro-Areas",
    sidebar_generate_hint: "Generate a map to view the structure.",
    sidebar_empty_notes: "No notes collected yet. Start studying!",

    // Context Menu
    ctx_edit: "Edit Content",
    ctx_add_child: "Add Child Node",
    ctx_expand: "Expand with AI",
    ctx_quiz: "Start Quiz",
    ctx_flashcard: "View Flashcard",
    ctx_delete: "Delete Node",
    ctx_connect: "Connect to...",

    // Projects Bar
    show_projects: "Show Projects",
    hide_projects: "Hide Projects",
    empty_projects_msg: "No saved projects. Create a new map to start.",

    // Toasts & Alerts
    toast_lang_it: "Language: Italian",
    toast_lang_en: "Language: English",
    alert_error_title: "Error",
    alert_ok_btn: "I understand",
    confirm_title: "Confirm",
    confirm_proceed: "Proceed",
    confirm_cancel: "Cancel",

    // Merge Modal
    merge_title: "Merge Map",
    merge_subtitle: "You are about to add a new map to the current view.",
    merge_ai_correlations: "🤖 AI Correlations",
    merge_ai_desc: "AI will look for possible correlations between the nodes of the two maps and create dashed links that you can validate or remove.",
    merge_auto_save: "The current map will be **automatically saved** before the operation."
};
