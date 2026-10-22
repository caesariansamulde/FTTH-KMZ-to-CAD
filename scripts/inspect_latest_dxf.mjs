import fs from 'fs';
import JSZip from 'jszip';

// Load app main logic or run a simulation of createHldNapDxf
async function inspectDxf() {
  // Let's check temp directory where DWG converter converted the DXF!
  const tempDir = process.env.TEMP || 'C:/Users/My Pc/AppData/Local/Temp';
  const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.dxf'));
  console.log('DXF files in TEMP:', files);
  
  // Find the latest dxf in TEMP
  let latestDxf = null;
  let latestMtime = 0;
  for (const f of files) {
    const stat = fs.statSync(tempDir + '/' + f);
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs;
      latestDxf = tempDir + '/' + f;
    }
  }
  if (latestDxf) {
    console.log('Latest DXF:', latestDxf, new Date(latestMtime));
    const content = fs.readFileSync(latestDxf, 'utf8');
    // Find all POLYLINE or LWPOLYLINE
    const polylines = [...content.matchAll(/0\r?\n(?:LWPOLYLINE|POLYLINE)[\s\S]*?(?=0\r?\n(?:LWPOLYLINE|POLYLINE|ENDSEC|TEXT|INSERT|CIRCLE))/g)].map(m => m[0]);
    console.log('Total polylines in latest DXF:', polylines.length);
    for (const pl of polylines.slice(0, 10)) {
      const layer = pl.match(/8\r?\n(.*)/)?.[1];
      const count = (pl.match(/10\r?\n/g) || []).length;
      console.log(`  Polyline on layer "${layer}" with ${count} vertices`);
    }
  }
}
inspectDxf();
