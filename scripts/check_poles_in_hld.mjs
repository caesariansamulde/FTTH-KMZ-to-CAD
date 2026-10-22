import fs from 'fs';
import JSZip from 'jszip';

async function checkSite(p) {
  const buf = fs.readFileSync(p);
  const zip = await JSZip.loadAsync(buf);
  const kmlName = Object.keys(zip.files).find(f => f.endsWith('.kml'));
  const kml = await zip.file(kmlName).async('string');
  const poleMatches = kml.match(/<name>(?:Pl_\d+|PT[_\-\s]*\d+|P\d+|POLE[_\-\s]*\d+|DLPC\s*\d+)<\/name>/gi) || [];
  const napMatches = kml.match(/<name>[^<]*(?:NAP|LINES)[^<]*<\/name>/gi) || [];
  console.log(`${p}: Poles=${poleMatches.length}, NAPs=${napMatches.length}`);
}

await checkSite('D:/KASBEL/HORIs/LLDs/MIN4026/MIN4026_HLD.kmz');
await checkSite('D:/KASBEL/HORIs/LLDs/MIN851/MIN851_HLD.v3.kmz');
await checkSite('D:/KASBEL/HORIs/LLDs/MIN1601/MIN1601_HLD.kmz');
