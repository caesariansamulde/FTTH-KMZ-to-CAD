import os

# Check Stencil Template.dxf or Stencil Template.dwg in public/ or dist/
for p in ['public/Stencil Template.dxf', 'dist/Stencil Template.dxf']:
    if os.path.exists(p):
        print('Found', p)
        with open(p, 'r', errors='ignore') as f:
            content = f.read()
        # Find P-AERIAL_FOC layer in dxf
        import re
        m = re.search(r'0\r?\nLAYER[\s\S]*?2\r?\nP-AERIAL_FOC[\s\S]*?0\r?\n', content)
        if m:
            print('P-AERIAL_FOC in template:')
            print(m.group(0))
