// MappAI — Stile icone UI: Lucide SVG (default) oppure Android (emoji).
// Toggle nel Setup AI. Sostituisce OGNI icona Lucide (`<i data-lucide>` → `<svg.lucide>`)
// con l'emoji corrispondente (o viceversa), in TUTTE le pagine/sezioni/modali.
// Le icone senza emoji sensata restano SVG (fallback: mai un glifo mancante).
// Caricato SUBITO dopo app.js (usa/estende window.safeCreateIcons).
(function () {
    // Mappa nome-lucide → emoji. Solo le icone con un equivalente chiaro.
    var ICON_EMOJI = {
        'alert-circle': '⚠️', 'alert-triangle': '⚠️', 'anchor': '⚓', 'archive': '🗄️',
        'arrow-left': '⬅️', 'arrow-left-right': '↔️', 'arrow-right': '➡️', 'bar-chart-3': '📊',
        'book-open': '📖', 'bot': '🤖', 'brain': '🧠', 'brain-circuit': '🧠', 'calendar-clock': '📅',
        'check': '✔️', 'check-circle': '✅', 'check-circle-2': '✅', 'chevron-down': '🔽',
        'chevron-right': '▶️', 'circle': '⚪', 'circle-check': '✅', 'circle-dashed': '⭕',
        'circle-dot': '🔘', 'clipboard-check': '📋', 'clipboard-pen': '📋', 'coins': '🪙',
        'compass': '🧭', 'copy': '📋', 'cpu': '🖥️', 'crosshair': '🎯', 'database': '🗄️',
        'door-open': '🚪', 'download': '⬇️', 'edit-3': '✏️', 'external-link': '🔗', 'eye': '👁️',
        'file-down': '📥', 'file-spreadsheet': '📊', 'file-text': '📄', 'files': '🗂️', 'flame': '🔥',
        'flask-conical': '🧪', 'folder': '📁', 'folder-cog': '📁', 'folder-open': '📂',
        'folder-plus': '📁', 'git-branch': '🌿', 'git-branch-plus': '🌿', 'git-merge': '🔀',
        'graduation-cap': '🎓', 'headphones': '🎧', 'help-circle': '❓', 'history': '🕐',
        'id-card': '🪪', 'image': '🖼️', 'info': 'ℹ️', 'key': '🔑', 'landmark': '🏛️',
        'languages': '🌐', 'layers': '📚', 'layout-dashboard': '🗂️', 'library': '📚',
        'lightbulb': '💡', 'line-chart': '📈', 'link': '🔗', 'link-2': '🔗', 'loader-2': '⏳',
        'lock': '🔒', 'log-out': '🚪', 'magnet': '🧲', 'map': '🗺️', 'maximize-2': '↔️',
        'merge': '🔀', 'mic': '🎤', 'minus': '➖', 'move-vertical': '↕️', 'network': '🕸️',
        'package': '📦', 'palette': '🎨', 'pause': '⏸️', 'pencil': '✏️', 'pencil-line': '✏️',
        'pencil-ruler': '📐', 'pie-chart': '🥧', 'pin': '📌', 'pipette': '💧', 'play': '▶️',
        'play-circle': '▶️', 'plus': '➕', 'plus-circle': '➕', 'presentation': '📊',
        'printer': '🖨️', 'puzzle': '🧩', 'qr-code': '🔳', 'radio': '📻', 'refresh-cw': '🔄',
        'rotate-ccw': '🔄', 'rotate-cw': '🔄', 'route': '🛣️', 'save': '💾', 'scan-search': '🔍',
        'scissors': '✂️', 'search': '🔍', 'send': '📤', 'shield-check': '🛡️', 'sparkles': '✨',
        'sprout': '🌱', 'square': '⬜', 'stethoscope': '🩺', 'sticky-note': '📝', 'sun': '☀️',
        'sun-moon': '🌗', 'tag': '🏷️', 'target': '🎯', 'terminal': '💻', 'timer': '⏲️',
        'trash': '🗑️', 'trash-2': '🗑️', 'trending-up': '📈', 'trophy': '🏆', 'type': '🔤',
        'unlock': '🔓', 'upload': '⬆️', 'user': '👤', 'user-circle': '👤', 'users': '👥',
        'video': '🎬', 'volume-2': '🔊', 'wand-2': '🪄', 'wrench': '🔧', 'x': '❌',
        'x-circle': '❌', 'youtube': '📺', 'zap': '⚡', 'zoom-in': '🔍'
    };

    // Dimensione emoji (px) dalla classe Tailwind w-* dell'icona; fallback alla
    // larghezza renderizzata o 20px.
    var WPX = {
        'w-3': 12, 'w-3.5': 14, 'w-4': 16, 'w-5': 20, 'w-6': 24, 'w-7': 28, 'w-8': 32,
        'w-9': 36, 'w-10': 40, 'w-11': 44, 'w-12': 48, 'w-14': 56, 'w-16': 64, 'w-20': 80,
        'w-24': 96, 'w-32': 128
    };
    function _sizeFromClasses(el) {
        for (var i = 0; i < el.classList.length; i++) {
            var c = el.classList[i];
            if (WPX[c] !== undefined) return WPX[c];
        }
        return null;
    }

    // SVG Lucide → emoji (solo icone mappate; le altre restano SVG).
    window._emojifyIcons = function (root) {
        root = root || document;
        var svgs = root.querySelectorAll('svg.lucide');
        for (var i = 0; i < svgs.length; i++) {
            var svg = svgs[i], name = null;
            svg.classList.forEach(function (c) { if (c !== 'lucide' && c.indexOf('lucide-') === 0) name = c.slice(7); });
            var emo = name && ICON_EMOJI[name];
            if (!emo) continue;
            var span = document.createElement('span');
            span.className = 'lucide-emoji';
            span.setAttribute('data-icon', name);
            // conserva le classi di layout (margini, w/h) per non spostare la UI
            svg.classList.forEach(function (c) { if (c !== 'lucide' && c.indexOf('lucide-') !== 0) span.classList.add(c); });
            span.textContent = emo;
            var px = _sizeFromClasses(svg);
            if (!px) { try { px = Math.round(svg.getBoundingClientRect().width); } catch (e) { } }
            if (!px) px = 20;
            span.style.cssText = 'font-family:var(--emoji-font);font-size:' + px + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle';
            svg.replaceWith(span);
        }
    };

    // emoji → `<i data-lucide>` e ri-render SVG.
    window._lucifyIcons = function (root) {
        root = root || document;
        var spans = root.querySelectorAll('span.lucide-emoji[data-icon]');
        for (var i = 0; i < spans.length; i++) {
            var sp = spans[i];
            var el = document.createElement('i');
            el.setAttribute('data-lucide', sp.getAttribute('data-icon'));
            sp.classList.forEach(function (c) { if (c !== 'lucide-emoji') el.classList.add(c); });
            sp.replaceWith(el);
        }
        if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
    };

    // Applica la modalità a TUTTA la pagina.
    window.applyIconStyle = function (mode) {
        if (mode === 'android') {
            if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
            window._emojifyIcons(document);
        } else {
            window._lucifyIcons(document);
        }
    };

    window.getIconStyle = function () {
        try { return localStorage.getItem('mappai_icon_style') === 'android' ? 'android' : 'lucide'; }
        catch (e) { return 'lucide'; }
    };
    window.setIconStyle = function (mode, silent) {
        var android = mode === 'android';
        try { localStorage.setItem('mappai_icon_style', android ? 'android' : 'lucide'); } catch (e) { }
        window.applyIconStyle(android ? 'android' : 'lucide');
        var l = document.getElementById('icon-lucide-btn'), a = document.getElementById('icon-android-btn');
        var on = 'flex-1 text-[12px] font-bold rounded-full transition-all bg-white shadow-sm text-slate-700';
        var off = 'flex-1 text-[12px] font-bold rounded-full transition-all text-slate-500 hover:text-slate-700';
        if (l) l.className = android ? off : on;
        if (a) a.className = android ? on : off;
        if (!silent && typeof window.showToast === 'function') {
            window.showToast(android ? (window.t ? window.t('tst_icons_android', 'Icone: Android (emoji)') : 'Icone: Android (emoji)')
                : (window.t ? window.t('tst_icons_lucide', 'Icone: Lucide (SVG)') : 'Icone: Lucide (SVG)'), 'info');
        }
    };
})();
