// ==========================================
// EDIT MODAL LOGIC — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// EDIT MODAL LOGIC
// ==========================================
let editTarget = null;
let editLinks = [];
let editImages = [];

window.openEditModal = function (nodeData) {
    editTarget = nodeData;
    document.getElementById('edit-n-label').value = cleanLabel(nodeData.label) || "";
    document.getElementById('edit-n-content').value = cleanLabel(nodeData.desc || nodeData.content) || "";

    // Migration to arrays
    editLinks = nodeData.urls ? [...nodeData.urls] : (nodeData.url ? [nodeData.url] : []);
    editImages = nodeData.images ? [...nodeData.images] : (nodeData.image ? [nodeData.image] : []);

    // Initialization of aiDesc if missing (retro-compatibility)
    if (!nodeData.aiDesc && !nodeData.hasCustomText) {
        nodeData.aiDesc = nodeData.desc;
    }

    // Show/hide Revert AI button
    const revertBtn = document.getElementById('revert-ai-btn');
    if (revertBtn) revertBtn.classList.toggle('hidden', !nodeData.hasCustomText || !nodeData.aiDesc);

    // Icon Visibility settings
    const vis = nodeData.iconVisibility || { text: true, image: true, link: true, file: true };
    document.getElementById('edit-vis-text').checked = vis.text !== false;
    document.getElementById('edit-vis-image').checked = vis.image !== false;
    document.getElementById('edit-vis-link').checked = vis.link !== false;
    document.getElementById('edit-vis-file').checked = vis.file !== false;

    // Clear inputs
    const urlInput = document.getElementById('edit-n-url-input');
    const imgUrlInput = document.getElementById('edit-n-image-url-input');
    const fileInput = document.getElementById('edit-n-image-file-input');
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        const groupKey = (editTarget.level === 0) ? 0 : editTarget.group;
        let currentBaseColor = (appState.db.customColors && appState.db.customColors[groupKey] !== undefined)
            ? appState.db.customColors[groupKey]
            : (colorScale[groupKey] || colorScale[1]);
        colorInput.value = currentBaseColor;
    }

    if (urlInput) urlInput.value = "";

    window.renderEditLinksList();
    window.renderEditImagesList();

    const modal = document.getElementById('edit-node-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const box = document.getElementById('edit-node-box');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        window.safeCreateIcons();
    }, 10);
}

window.setEditColor = function (color) {
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        colorInput.value = color;
    }
};

window.renderEditLinksList = function () {
    const container = document.getElementById('edit-n-urls-list');
    if (!container) return;
    container.innerHTML = editLinks.map((link, idx) => `
                <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2 group transition-colors hover:bg-slate-100">
                    <span class="text-xs text-slate-600 truncate flex-grow mr-2"><i data-lucide="${link.startsWith('file://') ? 'database' : 'link'}" class="w-3 h-3 inline mr-1"></i> ${link}</span>
                    <button onclick="window.removeLinkFromEdit(${idx})" class="text-red-500 hover:text-red-700 p-1 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            `).join('');
    window.safeCreateIcons({ root: container });
}

window.renderEditImagesList = function () {
    const container = document.getElementById('edit-n-images-list');
    if (!container) return;
    container.innerHTML = editImages.map((img, idx) => `
                <div class="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 group transition-all hover:border-indigo-300">
                    <img src="${img}" class="w-full h-full object-cover">
                    <button onclick="window.removeImageFromEdit(${idx})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 transition-opacity shadow-sm hover:bg-red-600"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>
            `).join('');
    window.safeCreateIcons({ root: container });
}

window.addLinkToNode = function () {
    const input = document.getElementById('edit-n-url-input');
    const val = input.value.trim();
    if (val) {
        editLinks.push(val);
        input.value = "";
        window.renderEditLinksList();
    }
}

window.removeLinkFromEdit = function (idx) {
    editLinks.splice(idx, 1);
    window.renderEditLinksList();
}

window.addImageToNode = function () {
    const input = document.getElementById('edit-n-image-url-input');
    const val = input.value.trim();
    if (val) {
        editImages.push(val);
        input.value = "";
        window.renderEditImagesList();
    }
}

window.removeImageFromEdit = function (idx) {
    editImages.splice(idx, 1);
    window.renderEditImagesList();
}

window.handlePickLocalFileForEdit = async function () {
    if (window.electronAPI && window.electronAPI.pickFile) {
        const result = await window.electronAPI.pickFile();
        if (!result.canceled && result.filePath) {
            const input = document.getElementById('edit-n-url-input');
            input.value = 'file://' + result.filePath;
        }
    }
};

window.handleImageUploadForEdit = function (input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            editImages.push(e.target.result);
            input.value = "";
            window.renderEditImagesList();
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.revertToAIContent = function () {
    if (!editTarget || !editTarget.aiDesc) return;
    document.getElementById('edit-n-content').value = editTarget.aiDesc;
    editTarget.hasCustomText = false;
    document.getElementById('revert-ai-btn').classList.add('hidden');
    window.showToast("Testo ripristinato alla versione AI.", "info");
}

window.closeEditModal = function () {
    const modal = document.getElementById('edit-node-modal');
    const box = document.getElementById('edit-node-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    editTarget = null;
}

window.saveEditNode = function () {
    if (!editTarget) return;
    if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(editTarget, 'modifica')) return;
    editTarget.label = document.getElementById('edit-n-label').value.trim();
    const newContent = document.getElementById('edit-n-content').value.trim();
    const oldContent = (editTarget.desc || "").trim();

    if (newContent !== oldContent && newContent !== "") {
        editTarget.hasCustomText = true;
    }

    editTarget.desc = newContent;
    editTarget.content = editTarget.desc;

    editTarget.urls = [...editLinks];
    editTarget.images = [...editImages];

    editTarget.iconVisibility = {
        text: document.getElementById('edit-vis-text').checked,
        image: document.getElementById('edit-vis-image').checked,
        link: document.getElementById('edit-vis-link').checked,
        file: document.getElementById('edit-vis-file').checked
    };

    // Handle Macroarea Color
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        const groupKey = (editTarget.level === 0) ? 0 : editTarget.group;
        if (groupKey !== undefined) {
            if (!appState.db.customColors) appState.db.customColors = {};
            appState.db.customColors[groupKey] = colorInput.value;
        }
    }

    // Sync legacy fields for backward compatibility
    editTarget.url = editTarget.urls[0] || "";
    editTarget.image = editTarget.images[0] || "";
    editTarget.hasCustomImage = editTarget.images.length > 0;

    window.closeEditModal();
    renderGraph();
    window.renderTreeView();
    window.updateUserNotesSidebar();
    StorageManager.saveCurrentProject();
    if (currentNode && currentNode.id === editTarget.id) window.handleNodeClick({ stopPropagation: () => { } }, currentNode);
}

window.updateUserNotesSidebar = function () {
    const container = document.getElementById('user-notes-container');
    const hint = document.getElementById('empty-notes-hint');
    if (!container) return;

    const customNodes = appState.db.nodes.filter(n => n.hasCustomText || n.hasCustomImage || (n.urls && n.urls.length > 0) || n.url);
    if (customNodes.length === 0) {
        if (hint) hint.style.display = 'block';
        Array.from(container.children).forEach(c => { if (c.id !== 'empty-notes-hint') c.remove(); });
        return;
    }
    if (hint) hint.style.display = 'none';

    let html = '';
    customNodes.forEach(n => {
        html += `<div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 cursor-pointer hover:bg-indigo-100 transition shadow-sm" onclick="window.zoomToNode('${n.id.replace(/'/g, "\\'")}')">`;
        html += `<h4 class="font-bold text-sm text-indigo-700 flex items-center gap-1.5"><i data-lucide="tag" class="w-3.5 h-3.5"></i> ${n.label}</h4>`;
        if (n.hasCustomText) {
            if (n.aiDesc && n.aiDesc !== n.desc) {
                html += `<p class="text-[10px] text-slate-400 mt-1 line-clamp-2 italic border-l-2 border-slate-200 pl-2 mb-1">${n.aiDesc}</p>`;
            }
            html += `<p class="text-xs text-slate-800 mt-1 line-clamp-3 font-medium">${n.desc}</p>`;
        }
        if (n.image) {
            html += `<img src="${n.image}" class="w-full h-20 object-cover rounded mt-2 border border-indigo-200">`;
        }
        const nodeUrls = n.urls || (n.url ? [n.url] : []);
        if (nodeUrls.length > 0) {
            html += `<div class="mt-2 space-y-1">`;
            nodeUrls.forEach(u => {
                const isLocal = u.startsWith('file://');
                let displayUrl;
                if (isLocal) {
                    try {
                        displayUrl = decodeURIComponent(u.split('/').pop());
                    } catch (e) {
                        displayUrl = u.split('/').pop();
                    }
                } else {
                    displayUrl = u.length > 30 ? u.substring(0, 30) + "..." : u;
                }

                html += `
                    <span class="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-indigo-600 font-bold shadow-sm" onclick="event.stopPropagation(); window.openCustomLink('${u.replace(/'/g, "\\'")}')">
                        <i data-lucide="${isLocal ? 'database' : 'link'}" class="w-3 h-3"></i> ${isLocal ? 'File' : 'Link'}: <span class="font-normal underline">${displayUrl}</span>
                    </span>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    Array.from(container.children).forEach(c => { if (c.id !== 'empty-notes-hint') c.remove(); });
    while (tmp.firstChild) {
        container.appendChild(tmp.firstChild);
    }
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
}
