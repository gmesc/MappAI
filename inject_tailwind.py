import re

with open('public/index_refactored.html', 'r', encoding='utf-8') as f:
    html = f.read()

tailwind_block = """
    <!-- REFACTORED CUSTOM CLASSES (Tailwind UI) -->
    <style type="text/tailwindcss">
      @layer components {
        .hero_title { @apply text-[40px] leading-none font-black text-slate-800 tracking-tight; }
        .hero_subtitle { @apply text-slate-500 text-xs font-bold uppercase tracking-widest mt-1; }
        .nav_util_btn { @apply px-4 py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm; }
        .quick_action_title { @apply block font-black text-indigo-900 text-sm; }
        
        .step_badge { @apply inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-sm font-bold shrink-0; }
        .step_badge_blue { @apply bg-blue-500; }
        .step_badge_green { @apply bg-green-500; }
        .step_badge_orange { @apply bg-orange-500; }
        .step_badge_yellow { @apply bg-yellow-500; }
        
        .source_btn_text { @apply text-sm font-bold; }
        .source_type_btn { @apply flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg cursor-pointer bg-white transition-all text-slate-600 hover:bg-slate-50 hover:border-slate-300; }
        .mode_btn { @apply flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-2xl cursor-pointer bg-white transition-all text-slate-600 min-w-[120px]; }
        .mode_btn.active { @apply border-indigo-600 bg-indigo-50 text-indigo-600; }
        
        .input_label_sm { @apply text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1; }
        .feature_toggle_title { @apply text-xs font-bold text-slate-700 flex items-center gap-1.5; }
        .form_helper_text { @apply text-xs text-slate-500 italic mb-2; }
        
        .form_input { @apply w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500; }
        textarea.form_input { @apply min-h-[60px]; }
        
        .btn_generate { @apply w-full py-4 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold rounded-2xl transition-colors hover:bg-indigo-700; }
        .btn_secondary_action { @apply w-full py-3 bg-white border border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer; }
        .btn_primary { @apply px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md border-none cursor-pointer; }
        .link_primary { @apply text-xs font-bold text-indigo-500 cursor-pointer hover:underline; }

        .drawer_title { @apply text-xl font-black text-indigo-900 mb-4 flex items-center gap-2; }
        .drawer_text { @apply text-[15px] text-slate-600 leading-relaxed space-y-3; }
        .drawer_link { @apply flex items-center gap-3 text-slate-500 hover:text-indigo-600 font-bold transition-colors cursor-pointer; }
        .drawer_section_title { @apply text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1; }

        .error_title { @apply text-lg font-bold text-slate-800 mb-2 flex items-center gap-2; }
        .error_body_text { @apply text-sm text-slate-600 mb-6 leading-relaxed max-h-[40vh] overflow-y-auto; }
      }
    </style>
</head>"""

if 'type="text/tailwindcss"' in html:
    print("Already injected")
else:
    html = html.replace('</head>', tailwind_block)
    with open('public/index_refactored.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Injected tailwindcss block")
