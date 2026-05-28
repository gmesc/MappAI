import re

with open('public/index_classi_nuove_modifiche_manual.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add .step_title to the tailwind classes
css_to_add = "        .step_title { @apply text-slate-700 font-bold; } /* Utilizzato in: Titoli testuali dei vari step (es. \"Carica le tue Fonti\") */"
if ".step_title {" not in html:
    html = html.replace('.step_badge_yellow { @apply bg-yellow-500; } /* Utilizzato in: Colore badge Step 4 (Densità Diramazioni) */', 
                        '.step_badge_yellow { @apply bg-yellow-500; } /* Utilizzato in: Colore badge Step 4 (Densità Diramazioni) */\n' + css_to_add)

# 2. Modify .step_container to remove the text-slate-700 font-bold if we want to be strict, 
# but it's safer to just let it be and explicitly add class="step_title" to the spans to satisfy the user request.
# Actually, let's modify the step_container in CSS:
# Before: class="step_container" in python script was replaced, but wait, I didn't add .step_container to the head CSS block! 
# Let me check if .step_container is in the head. It's not! 
# The user's block didn't have .step_container. Let's add .step_container too.
css_container = "        .step_container { @apply flex items-center gap-2 mb-2; } /* Contenitore dei titoli numerati degli step */"
if ".step_container {" not in html:
    html = html.replace('/* -- Moduli Step Form (Badge colorati) -- */', '/* -- Moduli Step Form (Badge colorati) -- */\n' + css_container)

# 3. Add class="step_title" to the 5 lines
html = html.replace('<span id="label-step1" data-i18n="step1">Carica le tue Fonti</span>', '<span id="label-step1" class="step_title" data-i18n="step1">Carica le tue Fonti</span>')
html = html.replace('<span id="label-step2">Cosa desideri generare?</span>', '<span id="label-step2" class="step_title">Cosa desideri generare?</span>')
html = html.replace('<span id="step-l1-title">Rami Principali (Livello 1)</span>', '<span id="step-l1-title" class="step_title">Rami Principali (Livello 1)</span>')
html = html.replace('<span id="label-step4">Densità Diramazioni (L4 e L5)</span>', '<span id="label-step4" class="step_title">Densità Diramazioni (L4 e L5)</span>')
html = html.replace('<span id="label-step4-kg">Numero di Concetti/Entità (Livello 2)</span>', '<span id="label-step4-kg" class="step_title">Numero di Concetti/Entità (Livello 2)</span>')

with open('public/index_classi_nuove_modifiche_manual.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Added step_title successfully.")
