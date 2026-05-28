import re

with open('public/css/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Selectors to remove (exact words or parts)
# We will match blocks like "selector { ... }"
selectors_to_remove = [
    r'\.step-badge',
    r'\.landing-input',
    r'\.mode-btn',
    r'\.source-type-btn',
    r'\.btn-landing-secondary',
    r'#landing-view \.glass-card #setup-form\s*>[^\{]*'
]

def remove_blocks(css_text, selectors):
    # This is a basic parser for CSS to remove blocks
    # It finds the selector, then finds the matching {} block and removes both
    for sel in selectors:
        pattern = re.compile(r'[^}]*?' + sel + r'[^\{]*?\{', re.MULTILINE | re.DOTALL)
        
        while True:
            match = pattern.search(css_text)
            if not match:
                break
            
            start_idx = match.start()
            # find the end of the block
            brace_count = 1
            end_idx = match.end()
            
            # Simple brace matcher
            while end_idx < len(css_text) and brace_count > 0:
                if css_text[end_idx] == '{':
                    brace_count += 1
                elif css_text[end_idx] == '}':
                    brace_count -= 1
                end_idx += 1
                
            # If we matched a rule, delete it
            css_text = css_text[:start_idx] + css_text[end_idx:]
            
    return css_text

# Also remove inside media queries if they become empty? Not strictly necessary, but good
cleaned_css = remove_blocks(css, selectors_to_remove)

with open('public/css/style.css', 'w', encoding='utf-8') as f:
    f.write(cleaned_css)

print("Removed old unused landing page CSS rules.")
