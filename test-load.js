const fs = require('fs');
const path = require('path');

function testLoad(folderPath) {
    let mapData = {
        nodes: [],
        links: [],
        extractionMode: 'mindmap',
        rootNodeLabel: ''
    };
    
    const indexPath = path.join(folderPath, 'index.yaml');
    if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        indexContent.split('\n').forEach(line => {
            if (line.startsWith('extractionMode:')) mapData.extractionMode = line.split(':')[1].trim();
            if (line.startsWith('rootNodeLabel:')) mapData.rootNodeLabel = line.split(':')[1].trim();
        });
    }

    const linksPath = path.join(folderPath, 'links.json');
    if (fs.existsSync(linksPath)) {
        mapData.links = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
    }

    const nodesDir = path.join(folderPath, 'Nodi');
    if (fs.existsSync(nodesDir)) {
        const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.md'));
        files.forEach(file => {
            const content = fs.readFileSync(path.join(nodesDir, file), 'utf-8');
            const parts = content.split('---');
            if (parts.length >= 3) {
                const fmLines = parts[1].trim().split('\n');
                const node = { chunks: [] };
                fmLines.forEach(l => {
                    const colonIdx = l.indexOf(':');
                    if (colonIdx === -1) return;
                    const k = l.substring(0, colonIdx).trim();
                    const v = l.substring(colonIdx + 1).trim();
                    const cleanV = v.replace(/^"(.*)"$/, '$1');
                    if (k === 'id') node.id = cleanV;
                    if (k === 'label') node.label = cleanV;
                    if (k === 'level') node.level = parseInt(cleanV);
                    if (k === 'group') node.group = parseInt(cleanV);
                    if (k === 'parent') node.parent = cleanV;
                    if (k === 'images') {
                        try { node.images = JSON.parse(v); } catch(e) { console.error("Image parse error", file); }
                    }
                });

                let body = parts.slice(2).join('---').trim();
                body = body.replace(/!\[\[.*?\]\]\n\n/g, '');
                
                const fontiPart = body.split('## Fonti');
                if (fontiPart.length > 1) {
                    node.desc = fontiPart[0].replace(/^# .*\n\n/, '').trim();
                } else {
                    node.desc = body.replace(/^# .*\n\n/, '').trim();
                }
                mapData.nodes.push(node);
            } else {
                console.log("Failed parts split", file);
            }
        });
    }
    console.log("Loaded nodes:", mapData.nodes.length);
    console.log("Loaded links:", mapData.links.length);
}

testLoad("/Users/giacomomeschini/Documents/Salvataggi MappAI/Vault Rete di distribuzione elettrica");
