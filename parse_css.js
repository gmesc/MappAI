const fs = require('fs');

const cssText = fs.readFileSync('public/css/style.css', 'utf8');
const regex = /([^{}]+)\s*\{/g;
let match;
let selectors = new Set();
['h1', 'h2', 'h3', 'p', 'span', 'button', 'input', 'label', 'textarea', '.node-text', '.node-desc-text', '.link-label'].forEach(t => selectors.add(t));

while ((match = regex.exec(cssText)) !== null) {
    let selStr = match[1].trim();
    if (selStr.startsWith('@') || selStr.startsWith('/*') || selStr.includes('keyframes')) continue;
    selStr.split(',').forEach(s => {
        s = s.trim();
        let clean = s.split(':')[0].trim();
        if (clean && !clean.includes('%') && clean.length < 50) {
            selectors.add(clean);
        }
    });
}

const sorted = Array.from(selectors).sort();
const selectorsJson = JSON.stringify(sorted);

function updateFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(
        /const response = await fetch\('css\/style\.css'\);[\s\S]*?if \(sorted\.length > 0\) \{/g,
        `const sorted = ${selectorsJson};\n                        sorted.forEach(sel => {\n                            const opt = document.createElement('option');\n                            opt.value = sel;\n                            opt.innerText = sel;\n                            elTarget.appendChild(opt);\n                        });\n                        if (sorted.length > 0) {`
    );
    fs.writeFileSync(file, content);
}

updateFile('public/index_font_style_config.html');
updateFile('public/map_font_config.html');
console.log("Updated both files with inline selectors array.");
