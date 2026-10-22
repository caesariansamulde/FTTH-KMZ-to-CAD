import fs from 'fs';
import os from 'os';

const dir = os.tmpdir() + '/ftth-kmz-to-cad-exports';
const files = fs.readdirSync(dir).filter(f => f.includes('MIN1227_DALIAO') && f.endsWith('.dxf'));
console.log('Survey DXF files:', files);

if (files.length) {
  const latest = files[0];
  const content = fs.readFileSync(dir + '/' + latest, 'utf8');
  console.log(`Content length of ${latest}: ${content.length}`);
  
  // Find polylines
  const polylines = [...content.matchAll(/0\r?\nPOLYLINE[\s\S]*?0\r?\nSEQEND/g)].map(m => m[0]);
  console.log('Total polylines in survey DXF:', polylines.length);
  for (const pl of polylines.slice(0, 5)) {
    const layer = pl.match(/8\r?\n(.*)/)?.[1];
    const vertices = [...pl.matchAll(/0\r?\nVERTEX[\s\S]*?10\r?\n([^\r\n]+)[\s\S]*?20\r?\n([^\r\n]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    console.log(`  Polyline on "${layer}" (${vertices.length} vertices):`);
    vertices.forEach((v, vi) => console.log(`     v${vi}: [${v[0].toFixed(2)}, ${v[1].toFixed(2)}]`));
  }
}
