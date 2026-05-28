import re

with open('public/index_classi_nuove.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. ADD NEW CLASSES TO TAILWIND BLOCK
# We find:   .form_helper_text { @apply text-xs text-slate-500 italic mb-2; }
# And we'll add our new ones.
new_classes = """
        .step_container { @apply flex items-center gap-2 text-slate-700 font-bold mb-2; }
        .step_helper_text { @apply text-xs text-slate-500 italic mb-2; }
        .toggle_label { @apply text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1; }
        .modal_header_title { @apply text-xl font-bold text-slate-800 mb-2; }
        .modal_section_title { @apply text-[10px] uppercase font-bold text-slate-400 mb-1; }
        .btn_a11y_tool { @apply w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm; }
        .btn_feedback_action { @apply flex items-center gap-3 text-left p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm w-full text-sm font-bold text-slate-700; }
"""
html = html.replace(".form_helper_text { @apply text-xs text-slate-500 italic mb-2; }", 
                    ".form_helper_text { @apply text-xs text-slate-500 italic mb-2; }\n" + new_classes)

# 2. DELETE VIDEO SOURCE BTN
html = re.sub(r'<div id="btn-src-video" class="source-type-btn".*?</div>', '', html, flags=re.DOTALL)

# 3. DELETE DEMO BUTTONS
html = re.sub(r'<button[^>]+onclick="window\.loadDemoGraph[^>]+>.*?</button>', '', html, flags=re.DOTALL)
# also remove the div container that might be left empty
html = re.sub(r'<div class="flex flex-col gap-2 mt-4">\s*</div>', '', html, flags=re.DOTALL)

# 4. REPLACE CLASSES IN HTML
# Replace step labels
html = html.replace('class="flex items-center gap-2 text-slate-700 font-bold mb-2"', 'class="step_container"')

# Replace helper texts (since we renamed form_helper_text to step_helper_text for the steps)
# Actually, if we just use step_helper_text instead of form_helper_text
html = html.replace('class="text-xs text-slate-500 italic mb-2"', 'class="step_helper_text"')
html = html.replace('class="form_helper_text"', 'class="step_helper_text"')

# Replace input_label_sm on the specific toggles like HD generation
# The HTML might be `<span class="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1">`
html = html.replace('class="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1"', 'class="toggle_label"')
# also replace `input_label_sm` if it was used for toggles, wait, let's keep it simple.

# Replace modal_header_title
html = html.replace('class="text-xl font-bold text-slate-800 mb-2"', 'class="modal_header_title"')

# Replace modal_section_title
html = html.replace('class="text-[10px] uppercase font-bold text-slate-400 mb-1"', 'class="modal_section_title"')
html = html.replace('class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2"', 'class="modal_section_title mt-2"')

# Replace a11y-btn
html = html.replace('class="a11y-btn"', 'class="btn_a11y_tool"')
html = html.replace('a11y-btn active', 'btn_a11y_tool active') # if there's active

# Replace feedback actions
feedback_class_old = 'class="flex items-center gap-3 text-left p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm w-full group"'
html = html.replace(feedback_class_old, 'class="btn_feedback_action group"')

with open('public/index_classi_nuove.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Refactoring done.")
