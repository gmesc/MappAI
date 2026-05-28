import re

with open('public/index_classi_nuove.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's extract the header modals
modals = re.findall(r'(<div id="(?:config-ai-modal|a11y-panel|app-tutorial-modal|user-profile-modal|insegnai-drawer)".*?</form>\s*</div>\s*</div>)', html, re.DOTALL)
if not modals:
    # maybe no form inside?
    modals = re.findall(r'(<div id="(?:config-ai-modal|a11y-panel|app-tutorial-modal|user-profile-modal|insegnai-drawer)".*?<!-- (?:Fine|End) .*?-->)', html, re.DOTALL)

for m in modals:
    print("--- MODAL SECTION ---")
    print(m[:300]) # just print the start to know it found it

