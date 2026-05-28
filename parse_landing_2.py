import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Drawer
drawer_content = re.search(r'<div id="insegnai-drawer".*?>(.*?)</div>\s*<!--', html, re.DOTALL)
if drawer_content:
    print("--- DRAWER ---")
    texts = re.findall(r'>([^<]{3,})<', drawer_content.group(1))
    for t in texts:
        clean = t.strip()
        if clean: print(clean)

# Modals
modals = [
    'config-ai-modal',
    'a11y-panel',
    'app-tutorial-modal',
    'user-profile-modal'
]
for m in modals:
    print(f"\n--- MODAL: {m} ---")
    match = re.search(f'<div id="{m}".*?>(.*?)</div', html, re.DOTALL)
    if match:
        texts = re.findall(r'>([^<]{3,})<', match.group(1))
        for t in set(texts):
            clean = t.strip()
            if clean: print(clean)

