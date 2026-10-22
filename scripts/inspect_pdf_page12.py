import pymupdf

doc = pymupdf.open('C:/Users/My Pc/Downloads/LLD_MIN1227_DVO_067_GPONA_01_AFI.pdf')
# Check page 12 (or any plan page)
page = doc[11] # page 12
drawings = page.get_drawings()
print(f'Page 12 has {len(drawings)} drawing paths')
# Count strokes by color
colors = {}
for d in drawings:
    c = str(d.get('color'))
    colors[c] = colors.get(c, 0) + 1
print('Stroke colors:', colors)

# Let's check text on page 12
text = page.get_text()
for line in text.split('\n'):
    if any(k in line.upper() for k in ['NAP', '12F', 'FOC', 'POLE', 'DVO']):
        print('  ', line.strip())
