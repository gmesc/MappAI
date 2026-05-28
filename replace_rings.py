import re

with open("public/index.html", "r") as f:
    content = f.read()

# Add focus_ring_standard class definition in the style block
style_block_end = "        .error_body_text"
focus_ring_css = """        .error_body_text { @apply text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto; } /* Testo descrittivo con l'errore di sistema o eccezione */

        /* ==========================================================================
           10. CLASSI UTILITY (FOCUS RINGS)
           ========================================================================== */
        .focus_ring_standard { @apply outline-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow; }"""

content = content.replace("        .error_body_text { @apply text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto; } /* Testo descrittivo con l'errore di sistema o eccezione */", focus_ring_css)

# Regex to replace all combinations of focus:ring-X, focus:ring-color-Y, outline-none, focus:outline-none, focus:border-color-Z
# and consolidate them into `focus_ring_standard`

# A simple approach is to find elements having class="... focus:ring... " and replace the tailwind focus classes with focus_ring_standard
# The tailwind classes to remove are:
classes_to_remove = [
    r"focus:ring-1", r"focus:ring-2", r"focus:ring-4", r"focus:ring-0",
    r"focus:ring-indigo-\d+(/\d+)?", r"focus:ring-emerald-\d+", r"focus:ring-amber-\d+",
    r"focus:border-indigo-\d+", r"focus:border-amber-\d+", r"focus:border-emerald-\d+",
    r"outline-none", r"focus:outline-none"
]

def replace_classes(match):
    class_string = match.group(1)
    
    # We only want to apply this to inputs, textareas, etc. But doing it globally in class attributes is fine
    # since these classes are exclusively used for input focus styling.
    
    # Don't change checkboxes which only have focus:ring-indigo-500 and no outline-none/focus:ring-2, unless they have it.
    # Actually, the user said "applica il loro stile a tutti i focus ring". 
    # Let's remove the old classes and add focus_ring_standard.
    
    has_focus_ring = bool(re.search(r"focus:ring-(?!0)", class_string))
    if not has_focus_ring:
        return f'class="{class_string}"'
        
    for cls in classes_to_remove:
        class_string = re.sub(r'\b' + cls + r'\b', '', class_string)
    
    # clean up multiple spaces
    class_string = re.sub(r'\s+', ' ', class_string).strip()
    
    return f'class="{class_string} focus_ring_standard"'

content = re.sub(r'class="([^"]+)"', replace_classes, content)

# But there is also one in style tag:
# .form_input { @apply w-full px-4 py-3 text-[12px] border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500; }
# Let's handle .form_input manually:
content = content.replace(
    ".form_input { @apply w-full px-4 py-3 text-[12px] border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500; }",
    ".form_input { @apply w-full px-4 py-3 text-[12px] border border-slate-200 rounded-xl bg-white text-slate-800 transition-all focus_ring_standard; }"
)

with open("public/index.html", "w") as f:
    f.write(content)

print("Done")
