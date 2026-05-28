import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    # 1. Landing
    r'class="text-\[40px\] leading-none font-black text-slate-800 tracking-tight"': 'class="hero_title"',
    r'class="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1"': 'class="hero_subtitle"',
    r'btn-landing-secondary px-4 py-2 text-\[11px\] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm': 'btn-landing-secondary nav_util_btn',
    r'block font-black text-indigo-900 text-sm truncate': 'quick_action_title truncate',
    r'block font-black text-indigo-900 text-sm': 'quick_action_title',
    
    # 2. Form Setup
    r'step-badge bg-blue-500': 'step_badge step_badge_blue',
    r'step-badge bg-green-500': 'step_badge step_badge_green',
    r'step-badge bg-orange-500': 'step_badge step_badge_orange',
    r'step-badge bg-yellow-500': 'step_badge step_badge_yellow',
    
    r'class="text-sm font-bold"': 'class="source_btn_text"',
    r'class="source-type-btn"': 'class="source_type_btn"',
    r'class="mode-btn active"': 'class="mode_btn active"',
    r'class="mode-btn"': 'class="mode_btn"',
    
    r'class="text-\[11px\] text-slate-500 font-bold uppercase tracking-wider"': 'class="input_label_sm"',
    r'class="text-xs font-bold text-slate-700 flex items-center gap-1\.5"': 'class="feature_toggle_title flex items-center gap-1.5"',
    
    r'class="text-xs text-slate-500 italic mb-2"': 'class="form_helper_text"',
    
    # 3. Actions
    r'class="generate-btn w-full"': 'class="btn_generate w-full"',
    r'class="w-full py-3 bg-white border border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 shadow-sm"': 'class="btn_secondary_action"',
    r'class="text-xs font-bold text-indigo-500 cursor-pointer hover:underline"': 'class="link_primary"',
    
    # 4. Drawer
    r'class="text-xl font-black text-indigo-900 mb-4 flex items-center gap-2"': 'class="drawer_title"',
    r'class="text-\[15px\] text-slate-600 leading-relaxed space-y-3"': 'class="drawer_text"',
    r'class="flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors"': 'class="drawer_link"',
    r'class="text-\[11px\] font-black uppercase tracking-widest text-amber-500 mb-1"': 'class="drawer_section_title"',
    
    # 5. Modal Alerts
    r'class="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"': 'class="error_title"',
    r'class="text-sm text-slate-600 mb-6 leading-relaxed max-h-\[40vh\] overflow-y-auto"': 'class="error_body_text"',
    r'class="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"': 'class="btn_primary"'
}

for old, new_class in replacements.items():
    html = re.sub(old, new_class, html)

# Handle .form_input replacements via regex
# Find things like class="landing-input w-full max-w-sm"
html = re.sub(r'class="landing-input ([^"]*)"', r'class="form_input \1"', html)

# Find config inputs (which were text-sm w-full border etc)
# To avoid breaking random divs, we will just search and replace known input class strings
config_input_regex = r'class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"'
html = html.replace(config_input_regex, 'class="form_input w-full"')

config_textarea_regex = r'class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"'
html = html.replace(config_textarea_regex, 'class="form_input w-full"')

beta_input_regex = r'class="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4 text-center font-mono text-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-300"'
html = html.replace(beta_input_regex, 'class="form_input text-center font-mono text-lg mb-4"')

profile_input_regex = r'class="w-full px-4 py-2 border border-indigo-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"'
html = html.replace(profile_input_regex, 'class="form_input w-full"')

# Write HTML back
with open('public/index_refactored.html', 'w', encoding='utf-8') as f:
    f.write(html)

css = """
/* ==========================================
   REFACTORED CUSTOM CLASSES (Semantic UI)
   ========================================== */

/* Typography */
.hero_title { font-size: 40px; line-height: 1; font-weight: 900; color: #1e293b; letter-spacing: -0.025em; }
.hero_subtitle { color: #64748b; font-size: 0.75rem; line-height: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.25rem; }

/* Buttons & Links */
.nav_util_btn { padding: 0.5rem 1rem; font-size: 11px; font-weight: 700; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 150ms ease; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
.quick_action_title { display: block; font-weight: 900; color: #312e81; font-size: 0.875rem; line-height: 1.25rem; }
.btn_generate { width: 100%; display: flex; align-items: center; justify-content: center; background-color: #4f46e5; color: white; font-weight: 700; border-radius: 0.75rem; padding: 1rem; gap: 0.5rem; transition: background-color 150ms; }
.btn_generate:hover { background-color: #4338ca; }
.btn_secondary_action { width: 100%; padding: 0.75rem; background-color: #ffffff; border: 1px solid #e0e7ff; color: #4f46e5; font-weight: 700; border-radius: 0.75rem; display: flex; justify-content: center; align-items: center; gap: 0.5rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); transition: background-color 150ms; cursor: pointer; }
.btn_secondary_action:hover { background-color: #eef2ff; }
.btn_primary { padding: 0.5rem 1.25rem; background-color: #4f46e5; color: white; font-weight: 700; border-radius: 0.5rem; transition: background-color 150ms; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: none; cursor: pointer; }
.btn_primary:hover { background-color: #4338ca; }
.link_primary { font-size: 0.75rem; line-height: 1rem; font-weight: 700; color: #6366f1; cursor: pointer; }
.link_primary:hover { text-decoration: underline; }

/* Modals */
.error_title { font-size: 1.125rem; line-height: 1.75rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
.error_body_text { font-size: 0.875rem; line-height: 1.625; color: #475569; margin-bottom: 1.5rem; max-height: 40vh; overflow-y: auto; }

/* Drawer */
.drawer_title { font-size: 1.25rem; line-height: 1.75rem; font-weight: 900; color: #312e81; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
.drawer_text { font-size: 15px; color: #475569; line-height: 1.625; }
.drawer_text p { margin-bottom: 0.75rem; }
.drawer_link { display: flex; align-items: center; gap: 0.75rem; color: #64748b; font-weight: 700; transition: color 150ms; text-decoration: none; cursor: pointer; }
.drawer_link:hover { color: #4f46e5; }
.drawer_section_title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #f59e0b; margin-bottom: 0.25rem; }

/* Form Setup */
.step_badge { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 9999px; color: white; font-size: 0.875rem; font-weight: 700; flex-shrink: 0; }
.step_badge_blue { background-color: #3b82f6; }
.step_badge_green { background-color: #22c55e; }
.step_badge_orange { background-color: #f97316; }
.step_badge_yellow { background-color: #eab308; }
.step_title { font-weight: 700; color: #334155; }
.source_btn_text { font-size: 0.875rem; line-height: 1.25rem; font-weight: 700; }
.source_type_btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; cursor: pointer; background: white; transition: all 0.2s; color: #475569; }
.source_type_btn:hover { background: #f8fafc; border-color: #cbd5e1; }
.mode_btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; border: 2px solid #e2e8f0; border-radius: 1rem; cursor: pointer; background: white; transition: all 0.2s; color: #475569; min-width: 120px; }
.mode_btn.active { border-color: #4f46e5; background: #eef2ff; color: #4f46e5; }
.input_label_sm { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; display: block; }
.feature_toggle_title { font-size: 0.75rem; line-height: 1rem; font-weight: 700; color: #334155; }
.form_helper_text { font-size: 0.75rem; line-height: 1rem; color: #64748b; font-style: italic; margin-bottom: 0.5rem; }
.form_input { width: 100%; padding: 0.5rem 1rem; font-size: 0.875rem; line-height: 1.25rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; background-color: white; color: #1e293b; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.form_input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
textarea.form_input { min-height: 60px; resize: vertical; }

"""
with open('public/css/style_refactored.css', 'a', encoding='utf-8') as f:
    f.write(css)

print("Refactoring done.")
