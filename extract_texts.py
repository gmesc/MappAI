import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

classes_to_check = [
    'hero_title', 'hero_subtitle', 'quick_action_title', 'input_label_sm', 
    'feature_toggle_title', 'form_helper_text', 'drawer_title', 
    'drawer_section_title', 'drawer_text', 'error_title', 'error_body_text',
    'form_input', 'btn_generate', 'btn_primary', 'btn_secondary_action',
    'source_type_btn', 'source_btn_text', 'mode_btn', 'nav_util_btn', 'link_primary', 'step_badge'
]

# Simple regex to find elements with specific class and extract text
# Handles inner tags loosely
def get_texts(cls):
    # Match class="... cls ..."
    pattern = re.compile(rf'<[^>]+class="[^"]*\b{cls}\b[^"]*"[^>]*>(.*?)</[^>]+>', re.DOTALL)
    matches = pattern.findall(html)
    
    # Also look for placeholder if input
    input_pattern = re.compile(rf'<input[^>]+class="[^"]*\b{cls}\b[^"]*"[^>]*placeholder="([^"]*)"', re.DOTALL)
    input_matches = input_pattern.findall(html)
    
    # Also look for textarea
    textarea_pattern = re.compile(rf'<textarea[^>]+class="[^"]*\b{cls}\b[^"]*"[^>]*placeholder="([^"]*)"', re.DOTALL)
    textarea_matches = textarea_pattern.findall(html)

    all_texts = []
    for m in matches + input_matches + textarea_matches:
        # Strip internal tags
        clean = re.sub(r'<[^>]+>', '', m)
        clean = re.sub(r'\s+', ' ', clean).strip()
        if clean and clean not in all_texts:
            if len(clean) > 50:
                clean = clean[:47] + '...'
            all_texts.append(clean)
    return all_texts

for cls in classes_to_check:
    print(f"--- {cls} ---")
    for t in get_texts(cls):
        print(f'"{t}"')
