import fs from 'fs';
import os from 'os';

const dxfPath = os.tmpdir() + '/ftth-kmz-to-cad-exports/1792479910790-MIN1227_HLD-v2-kmz.dxf';
const text = fs.readFileSync(dxfPath, 'utf8');

// Parse DXF VERTEX entities inside POLYLINE
const lines = text.split(/\r?\n/);
let currentPl = null;
const polylines = [];
let inEntities = false;

for (let i = 0; i < lines.length - 1; i += 2) {
  const code = lines[i].trim();
  const val = lines[i+1].trim();

  if (code === '0' && val === 'SECTION') {
    if (lines[i+3]?.trim() === 'ENTITIES') inEntities = true;
  }
  if (code === '0' && val === 'ENDSEC' && inEntities) inEntities = false;

  if (inEntities && code === '0') {
    if (val === 'POLYLINE') {
      currentPl = { layer: '', vertices: [] };
      polylines.push(currentPl);
    } else if (val === 'VERTEX' && currentPl) {
      currentPl.vertices.push({ x: 0, y: 0 });
    } else if (val === 'SEQEND') {
      currentPl = null;
    }
  }
  if (currentPl && code === '8') {
    currentPl.layer = val;
  }
  if (currentPl && currentPl.vertices.length) {
    const lastV = currentPl.vertices[currentPl.vertices.length - 1];
    if (code === '10') lastV.x = Number(val);
    if (code === '20') lastV.y = Number(val);
  }
}

console.log('Total polylines found:', polylines.length);
polylines.forEach((pl, idx) => {
  console.log(`\nPolyline ${idx+1} on Layer "${pl.layer}" (${pl.vertices.length} vertices):`);
  pl.vertices.forEach((v, vi) => {
    console.log(`   v${vi}: [${v.x.toFixed(2)}, ${v.y.toFixed(2)}]`);
  });
});
