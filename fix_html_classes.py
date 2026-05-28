import re

with open('public/index_classi_nuove_modifiche_manual.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('class="mode-btn active"', 'class="mode_btn active"')
html = html.replace('class="mode-btn"', 'class="mode_btn"')

html = html.replace('class="source-type-btn"', 'class="source_type_btn"')

html = html.replace('landing-input', 'form_input')

with open('public/index_classi_nuove_modifiche_manual.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Fixed remaining html classes")
