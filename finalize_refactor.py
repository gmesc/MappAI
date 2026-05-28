import re

with open('public/index_classi_nuove.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Modes: keep only "Mappa Mentale" and "Knowledge Graph"
# We need to delete any mode button that is NOT these two.
# Let's just find the `mod-concettuale` and `mod-tutor` blocks and delete them.
html = re.sub(r'<div class="mode-btn"[^>]+onclick="window\.setMode\(\'(concept_map|tutor)\'\)".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="mode-btn"[^>]+id="mode-concept".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="mode-btn"[^>]+id="mode-tutor".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)

# 2. Drawer Links
# Replacing the tailwind classes with .drawer_link
drawer_link_classes = [
    'class="flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors"',
    'class="flex items-center gap-3 text-slate-500 hover:text-pink-600 font-bold transition-colors"',
    'class="flex items-center gap-3 text-slate-500 hover:text-blue-600 font-bold transition-colors"'
]
for cls in drawer_link_classes:
    html = html.replace(cls, 'class="drawer_link"')

# 3. Source types: "URL Web", "YouTube", "Audio", "PDF", "Testo"
# Ensure the text is exactly these.
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_pdf">.*?</span>', '<span class="source_btn_text" data-i18n="src_pdf">PDF</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_web">.*?</span>', '<span class="source_btn_text" data-i18n="src_web">URL Web</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_yt">.*?</span>', '<span class="source_btn_text" data-i18n="src_yt">YouTube</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_audio">.*?</span>', '<span class="source_btn_text" data-i18n="src_audio">Audio</span>', html)
html = re.sub(r'<span class="text-sm font-bold" data-i18n="src_text">.*?</span>', '<span class="source_btn_text" data-i18n="src_text">Testo</span>', html)

# 4. Action buttons names
# Ensure we have "Nuovo Progetto", "Apri Vault", "Importa JSON"
html = html.replace('Nuova Mappa', 'Nuovo Progetto')
# Just in case "Genera Nuova Mappa" was replaced, let's revert it back if it's the big button
html = html.replace('Genera Nuovo Progetto', 'Genera Nuova Mappa')
html = html.replace('Apri Cartella', 'Apri Vault')
html = html.replace('Apri Vault (Second Brain)', 'Apri Vault')

# 5. Add .drawer_link to the CSS
css_to_add = """
        .drawer_link { @apply flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors; }
"""
if ".drawer_link" not in html:
    html = html.replace(".btn_feedback_action {", css_to_add + "\n        .btn_feedback_action {")

# 6. Apply feedback button class
feedback_btn_old = 'class="flex items-center gap-3 text-left p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm w-full"'
html = html.replace(feedback_btn_old, 'class="btn_feedback_action"')
# Add amber styling specifically to the tailwind class, or wait, .btn_feedback_action in the plan was slate-50.
# The user said "La sezione FEEDBACK & BUG andrà mappata con una classe specifica".
# We'll just define .btn_feedback_action with amber colors in CSS.
feedback_css = ".btn_feedback_action { @apply flex items-center gap-3 text-left p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm w-full; }"
html = re.sub(r'\.btn_feedback_action \{ @apply.*?\}', feedback_css, html)

with open('public/index_classi_nuove.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Finalize refactoring done.")
