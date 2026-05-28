import re

with open('public/index_classi_nuove_modifiche_manual.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Modes: keep only "Mappa Mentale" and "Knowledge Graph"
html = re.sub(r'<div class="mode-btn"[^>]+onclick="window\.setMode\(\'(concept_map|tutor)\'\)".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="mode-btn"[^>]+id="mode-concept".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="mode-btn"[^>]+id="mode-tutor".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)

# 2. Drawer Links
drawer_link_classes = [
    'class="flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors"',
    'class="flex items-center gap-3 text-slate-500 hover:text-pink-600 font-bold transition-colors"',
    'class="flex items-center gap-3 text-slate-500 hover:text-blue-600 font-bold transition-colors"'
]
for cls in drawer_link_classes:
    html = html.replace(cls, 'class="drawer_link"')

# 3. Source types texts
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_pdf">.*?</span>', '<span class="source_btn_text" data-i18n="src_pdf">PDF</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_web">.*?</span>', '<span class="source_btn_text" data-i18n="src_web">URL Web</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_yt">.*?</span>', '<span class="source_btn_text" data-i18n="src_yt">YouTube</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_audio">.*?</span>', '<span class="source_btn_text" data-i18n="src_audio">Audio</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_text">.*?</span>', '<span class="source_btn_text" data-i18n="src_text">Testo</span>', html)
html = re.sub(r'<div id="btn-src-video" class="source-type-btn".*?</div>', '', html, flags=re.DOTALL)


# 4. Action buttons names
html = html.replace('Nuova Mappa', 'Nuovo Progetto')
html = html.replace('Genera Nuovo Progetto', 'Genera Nuova Mappa')
html = html.replace('Apri Cartella', 'Apri Vault')
html = html.replace('Apri Vault (Second Brain)', 'Apri Vault')

# 5. Feedback button class
feedback_btn_old = 'class="flex items-center gap-3 text-left p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm w-full"'
html = html.replace(feedback_btn_old, 'class="btn_feedback_action"')
feedback_css = ".btn_feedback_action { @apply flex items-center gap-3 text-left p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm w-full font-bold text-sm; }"
if ".btn_feedback_action {" not in html:
    html = html.replace(".drawer_section_title {", feedback_css + "\\n        .drawer_section_title {")


# 6. DELETE DEMO BUTTONS
html = re.sub(r'<button[^>]+onclick="window\.loadDemoGraph[^>]+>.*?</button>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="flex flex-col gap-2 mt-4">\s*</div>', '', html, flags=re.DOTALL)

# 7. REPLACE CLASSES IN HTML
html = html.replace('class="flex items-center gap-2 text-slate-700 font-bold mb-2"', 'class="step_container"')
html = html.replace('class="text-xs text-slate-500 italic mb-2"', 'class="step_helper_text"')
html = html.replace('class="form_helper_text"', 'class="step_helper_text"')
html = html.replace('class="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1"', 'class="toggle_label"')
html = html.replace('class="text-xl font-bold text-slate-800 mb-2"', 'class="modal_header_title"')
html = html.replace('class="text-[10px] uppercase font-bold text-slate-400 mb-1"', 'class="modal_section_title"')
html = html.replace('class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2"', 'class="modal_section_title mt-2"')
html = html.replace('class="a11y-btn"', 'class="btn_a11y_tool"')
html = html.replace('a11y-btn active', 'btn_a11y_tool active')

with open('public/index_classi_nuove_modifiche_manual.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated manual file.")
