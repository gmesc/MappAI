import re

with open('public/index_classi_nuove_modifiche_manual.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    'class="text-[40px] leading-none font-black text-slate-800 tracking-tight"': 'class="hero_title"',
    'class="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1"': 'class="hero_subtitle"',
    'class="px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm': 'class="nav_util_btn ', # might have bg-white etc
    'class="block font-black text-indigo-900 text-sm"': 'class="quick_action_title"',
    'class="block font-black text-indigo-900 text-sm truncate"': 'class="quick_action_title truncate"',
    'class="step-badge bg-blue-500"': 'class="step_badge step_badge_blue"',
    'class="step-badge bg-green-500"': 'class="step_badge step_badge_green"',
    'class="step-badge bg-orange-500"': 'class="step_badge step_badge_orange"',
    'class="step-badge bg-yellow-500"': 'class="step_badge step_badge_yellow"',
    'class="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"': 'class="form_input"',
    'class="w-full bg-white border border-indigo-200 rounded-xl px-10 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition"': 'class="form_input !pl-10"', # token inputs with icons
    'class="landing-input min-h-[60px]"': 'class="form_input min-h-[60px]"',
    'class="w-full py-4 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold rounded-2xl transition-colors hover:bg-indigo-700"': 'class="btn_generate"',
    'class="w-full py-3 bg-white border border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer"': 'class="btn_secondary_action"',
    'class="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md border-none cursor-pointer"': 'class="btn_primary"',
    'class="text-xs font-bold text-indigo-500 cursor-pointer hover:underline"': 'class="link_primary"',
    'class="text-xl font-black text-indigo-900 mb-4 flex items-center gap-2"': 'class="drawer_title"',
    'class="text-[15px] text-slate-600 leading-relaxed space-y-3"': 'class="drawer_text"',
    'class="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"': 'class="error_title"',
    'class="text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto"': 'class="error_body_text"',
}

# Apply replacements
for old, new in replacements.items():
    html = html.replace(old, new)

# Special cases where the old class string has extra tailwind classes like bg-white or hover stuff
html = html.replace('class="px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"', 'class="nav_util_btn bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"')
html = html.replace('class="px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100"', 'class="nav_util_btn bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100"')

# Quick action title edge case
html = html.replace('class="block font-black text-indigo-900 text-sm" data-i18n=', 'class="quick_action_title" data-i18n=')

# Also the inputs in the modale for focus input
html = html.replace('class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[120px] resize-none"', 'class="form_input min-h-[120px] resize-none"')

with open('public/index_classi_nuove_modifiche_manual.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated classes in body!")
