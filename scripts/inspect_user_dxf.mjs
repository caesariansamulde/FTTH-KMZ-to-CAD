import fs from 'fs';
import os from 'os';

const dxfPath = os.tmpdir() + '/ftth-kmz-to-cad-exports/1792479910790-MIN1227_HLD-v2-kmz.dxf';
const text = fs.readFileSync(dxfPath, 'utf8');

// Find all entities
const lines = text.split(/\r?\n/);
let currentEntity = null;
const entities = [];
let inEntities = false;

for (let i = 0; i < lines.length - 1; i += 2) {
  const code = lines[i].trim();
  const val = lines[i+1].trim();

  if (code === '0' && val === 'SECTION') {
    if (lines[i+3]?.trim() === 'ENTITIES') inEntities = true;
  }
  if (code === '0' && val === 'ENDSEC' && inEntities) {
    inEntities = false;
  }

  if (inEntities && code === '0') {
    currentEntity = { type: val, layer: '', name: '', text: '', coords: [] };
    entities.push(currentEntity);
  }
  if (currentEntity) {
    if (code === '8') currentEntity.layer = val;
    if (code === '2') currentEntity.name = val;
    if (code === '1') currentEntity.text = val;
    if (code === '10') currentEntity.coords.push({ x: Number(val) });
    if (code === '20' && currentEntity.coords.length) {
      currentEntity.coords[currentEntity.coords.length - 1].y = Number(val);
    }
  }
}

console.log(`Total entities in DXF: ${entities.length}`);
const typeCounts = {};
for (const e of entities) {
  typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
}
console.log('Type counts:', typeCounts);

// Look at all polylines
const polylines = entities.filter(e => e.type === 'POLYLINE' || e.type === 'LWPOLYLINE');
console.log(`\nPolylines count: ${polylines.length}`);
for (const pl of polylines) {
  console.log(`  Polyline on Layer: "${pl.layer}", vertices: ${pl.coords.length}`);
  if (pl.coords.length > 0) {
    console.log(`    Start: [${pl.coords[0].x}, ${pl.coords[0].y}]`);
    console.log(`    End:   [${pl.coords[pl.coords.length-1].x}, ${pl.coords[pl.coords.length-1].y}]`);
  }
}

// Look at all INSERTS (NAPs)
const inserts = entities.filter(e => e.type === 'INSERT');
console.log(`\nInserts count: ${inserts.length}`);
for (const ins of inserts) {
  console.log(`  Insert Block: "${ins.name}", Layer: "${ins.layer}" at [${ins.coords[0]?.x}, ${ins.coords[0]?.y}]`);
}

// Look at all TEXT/MTEXT
const texts = entities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT');
console.log(`\nTexts count: ${texts.length}`);
for (const t of texts) {
  console.log(`  Text on Layer: "${t.layer}": "${t.text}" at [${t.coords[0]?.x}, ${t.coords[0]?.y}]`);
}
