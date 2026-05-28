import re

with open('public/index_classi_nuove_modifiche_manual.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace exactly "text-[11px] text-slate-500 font-bold uppercase tracking-wider"
# whether it has "block mb-1" or not.
html = re.sub(r'class="text-\[11px\] text-slate-500 font-bold uppercase tracking-wider(?: block mb-1)?"', 'class="input_label_sm"', html)

with open('public/index_classi_nuove_modifiche_manual.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Applied input_label_sm class successfully.")
