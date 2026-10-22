with open('public/Stencil Template.dxf', 'r', errors='ignore') as f:
    text = f.read()

import re
layers = re.findall(r'0\r?\nLAYER\r?\n2\r?\n([^\r\n]+)', text)
print('Layers in Stencil Template.dxf:', sorted(layers))
