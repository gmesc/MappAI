import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Define classes we ALREADY cleaned up
clean_classes = [
    'hero_title', 'hero_subtitle', 'quick_action_title', 'input_label_sm', 
    'feature_toggle_title', 'form_helper_text', 'drawer_title', 
    'drawer_section_title', 'drawer_text', 'error_title', 'error_body_text',
    'form_input', 'btn_generate', 'btn_primary', 'btn_secondary_action',
    'source_type_btn', 'source_btn_text', 'mode_btn', 'nav_util_btn', 'link_primary', 'step_badge'
]

# Find all tags with a class attribute
pattern = re.compile(r'<([a-zA-Z0-9]+)[^>]*class="([^"]+)"[^>]*>(.*?)</\1>', re.DOTALL)
matches = pattern.findall(html)

unclassed_texts = []
for tag, classes, inner in matches:
    # Check if this tag has any of the clean classes
    has_clean = any(c in classes.split() for c in clean_classes)
    if not has_clean:
        # Strip internal tags to get pure text
        text = re.sub(r'<[^>]+>', '', inner)
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) > 2 and len(text) < 150: # Only meaningful texts
            unclassed_texts.append((tag, classes, text))

# Deduplicate
unique_unclassed = {}
for tag, classes, text in unclassed_texts:
    if text not in unique_unclassed:
        unique_unclassed[text] = classes

print("UNCLASSED OR RAW TAILWIND TEXTS:")
for text, cls in list(unique_unclassed.items())[:50]: # Print top 50
    print(f"[{text}] -> class: {cls}")

