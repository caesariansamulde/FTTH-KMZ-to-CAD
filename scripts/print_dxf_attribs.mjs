import fs from 'fs';
import os from 'os';

const dxfPath = os.tmpdir() + '/ftth-kmz-to-cad-exports/1792479910790-MIN1227_HLD-v2-kmz.dxf';
const text = fs.readFileSync(dxfPath, 'utf8');

// Print all ATTRIB entities
const lines = text.split(/\r?\n/);
let currentAttrib = null;
const attribs = [];
let inEntities = false;

for (let i = 0; i < lines.length - 1; i += 2) {
  const code = lines[i].trim();
  const val = lines[i+1].trim();

  if (code === '0' && val === 'SECTION') {
    if (lines[i+3]?.trim() === 'ENTITIES') inEntities = true;
  }
  if (code === '0' && val === 'ENDSEC' && inEntities) inEntities = false;

  if (inEntities && code === '0') {
    if (val === 'ATTRIB') {
      currentAttrib = { tag: '', text: '', layer: '' };
      attribs.push(currentAttrib);
    } else {
      currentAttrib = null;
    }
  }
  if (currentAttrib) {
    if (code === '2') currentAttrib.tag = val;
    if (code === '1') currentAttrib.text = val;
    if (code === '8') currentAttrib.layer = val;
  }
}

console.log('Total ATTRIBs:', attribs.length);
attribs.forEach((a, i) => {
  console.log(`  [${i}] Tag: "${a.tag}" -> Text: "${a.text}" on Layer: "${a.layer}"`);
});
