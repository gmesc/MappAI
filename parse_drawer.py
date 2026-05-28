import re

with open('public/index_classi_nuove.html', 'r', encoding='utf-8') as f:
    html = f.read()

drawer = re.search(r'<div id="insegnai-drawer".*?<!-- Fine Insegnai\.ch Drawer -->', html, re.DOTALL)
if drawer:
    print(drawer.group(0))
