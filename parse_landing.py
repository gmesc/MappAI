import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

# I want to find the HTML structure for the landing page steps.
# The step sections usually start with `<span class="step_badge...`
# Let's extract the step titles and descriptions.

sections = re.findall(r'<label class="flex items-center gap-2 text-slate-700 font-bold mb-2">(.*?)</label>', html, re.DOTALL)
for s in sections:
    print("STEP LABEL:", re.sub(r'<[^>]+>', ' ', s).strip())

