/**
 * Telecom Survey Excel Picture Embedder - Client-Side Engine
 * Runs 100% in the browser or Node.js via JSZip.
 * Replicates the exact OpenXML and Apache POI specification of convert_to_excel_pic.py.
 */

const CATEGORY_COLS = {
  'Photo': 24,
  'Pole tag photo': 25,
  'Pole top photo': 26,
  'Pole bottom photo': 27,
  'Element photo': 28
};

const CATEGORY_ORDER = ['Photo', 'Pole tag photo', 'Pole top photo', 'Pole bottom photo', 'Element photo'];

function computeImageLayout(count) {
  if (count === 1) {
    return [{ colOff: 1000000, rowOff: 0, cx: 2162425, cy: 1605000 }];
  } else if (count === 2) {
    return [
      { colOff: 500000, rowOff: 0, cx: 662425, cy: 1605000 },
      { colOff: 3000000, rowOff: 0, cx: 662425, cy: 1605000 }
    ];
  } else if (count === 3) {
    return [
      { colOff: 1500000, rowOff: 0, cx: 1162425, cy: 805000 },
      { colOff: 500000, rowOff: 900000, cx: 1162425, cy: 705000 },
      { colOff: 2500000, rowOff: 900000, cx: 1162425, cy: 705000 }
    ];
  } else if (count === 4) {
    return [
      { colOff: 500000, rowOff: 0, cx: 1162425, cy: 750000 },
      { colOff: 2500000, rowOff: 0, cx: 1162425, cy: 750000 },
      { colOff: 500000, rowOff: 850000, cx: 1162425, cy: 750000 },
      { colOff: 2500000, rowOff: 850000, cx: 1162425, cy: 750000 }
    ];
  } else {
    const ncols = Math.floor((count + 1) / 2);
    const colWidthEmu = Math.floor(4000000 / ncols);
    const cx = Math.floor(colWidthEmu * 0.85);
    const cy = 750000;
    const layouts = [];
    for (let i = 0; i < count; i++) {
      const rIdx = Math.floor(i / ncols);
      const cIdx = i % ncols;
      const cOff = 300000 + cIdx * colWidthEmu;
      const rOff = rIdx === 0 ? 0 : 850000;
      layouts.push({ colOff: cOff, rowOff: rOff, cx, cy });
    }
    return layouts;
  }
}

/**
 * Converts a survey package zip or files directly in browser / node
 * @param {Blob|Uint8Array|Buffer} zipInput
 * @param {Function} onProgress (percent, message, { stage })
 */
async function processSurveyZip(zipInput, onProgress = () => {}) {
  const startTime = Date.now();
  onProgress(5, "Scanning ZIP archive contents...", { stage: 1 });

  const rootZip = await JSZip.loadAsync(zipInput);
  
  // 1. Locate primary .xlsx file
  let excelEntryPath = null;
  const allFiles = Object.keys(rootZip.files);
  for (const p of allFiles) {
    const lower = p.toLowerCase();
    const base = p.split('/').pop();
    if (lower.endsWith('.xlsx') && !base.startsWith('~$') && !lower.includes('__macosx')) {
      // Prefer file with excel(excel and attachment) or shortest path
      if (!excelEntryPath || lower.includes('excel(excel and attachment)')) {
        excelEntryPath = p;
      }
    }
  }

  if (!excelEntryPath) {
    throw new Error("No survey Excel (.xlsx) file found inside the package.");
  }

  const excelFilename = excelEntryPath.split('/').pop();
  onProgress(15, `Found survey Excel: ${excelFilename}`, { stage: 1 });

  // 2. Index all photos in Picture/
  // Structure: { [folderName]: { [category]: [ { path, file } ] } }
  const photoIndex = {};
  const photoExts = ['.jpg', '.jpeg', '.png'];
  
  for (const p of allFiles) {
    const lower = p.toLowerCase();
    if (photoExts.some(ext => lower.endsWith(ext)) && !lower.includes('__macosx')) {
      // Find where 'picture/' or 'pictures/' or 'photo/' appears
      const parts = p.split('/');
      const picIdx = parts.findIndex(part => {
        const l = part.toLowerCase();
        return l === 'picture' || l === 'pictures';
      });

      if (picIdx !== -1 && picIdx + 2 < parts.length) {
        const poleFolder = parts[picIdx + 1];
        const category = parts[picIdx + 2];
        const fileName = parts.slice(picIdx + 3).join('/');

        if (CATEGORY_COLS[category] !== undefined && fileName) {
          if (!photoIndex[poleFolder]) photoIndex[poleFolder] = {};
          if (!photoIndex[poleFolder][category]) photoIndex[poleFolder][category] = [];
          photoIndex[poleFolder][category].push({
            path: p,
            file: rootZip.file(p)
          });
        }
      }
    }
  }

  onProgress(25, "Opening Excel workbook and mapping pole records...", { stage: 2 });
  
  // 3. Load Excel workbook zip
  const excelData = await rootZip.file(excelEntryPath).async('uint8array');
  const xlsxZip = await JSZip.loadAsync(excelData);

  let sheet2Xml = await xlsxZip.file('xl/worksheets/sheet2.xml').async('text');
  let contentTypesXml = await xlsxZip.file('[Content_Types].xml').async('text');

  // Check if sheet2.xml has xmlns:r
  if (!sheet2Xml.includes('xmlns:r=')) {
    sheet2Xml = sheet2Xml.replace(
      '<worksheet ',
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    );
  }

  // 4. Update column widths in sheet2.xml (cols 25 to 29 = 62.5)
  const colsMatch = sheet2Xml.match(/<cols>[\s\S]*?<\/cols>/);
  if (colsMatch) {
    let colsXml = colsMatch[0];
    for (let cIdx = 25; cIdx <= 29; cIdx++) {
      const colPat = new RegExp(`<col min="${cIdx}" max="${cIdx}"[^>]*/>`);
      const newTag = `<col min="${cIdx}" max="${cIdx}" width="62.5" customWidth="true"/>`;
      if (colPat.test(colsXml)) {
        colsXml = colsXml.replace(colPat, newTag);
      } else {
        colsXml = colsXml.replace('</cols>', `${newTag}</cols>`);
      }
    }
    sheet2Xml = sheet2Xml.replace(colsMatch[0], colsXml);
  }

  // 5. Update row heights for rows >= 7 to 150.0
  sheet2Xml = sheet2Xml.replace(/<row r="(\d+)"([^>]*)>/g, (match, rNum, rest) => {
    const rowInt = parseInt(rNum, 10);
    if (rowInt >= 7) {
      let cleanRest = rest.replace(/\s+ht="[^"]*"/g, '').replace(/\s+customHeight="[^"]*"/g, '');
      return `<row r="${rNum}"${cleanRest} customHeight="1" ht="150.0">`;
    }
    return match;
  });

  // 6. Clear cell contents in columns Y, Z, AA, AB, AC for rows >= 7
  sheet2Xml = sheet2Xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*)>[\s\S]*?<\/c>|<c r="([A-Z]+)(\d+)"([^>]*)\/>/g, (match, col1, r1, rest1, col2, r2, rest2) => {
    const colLetters = col1 || col2;
    const rNum = parseInt(r1 || r2, 10);
    const rest = rest1 || rest2 || '';
    if (['Y', 'Z', 'AA', 'AB', 'AC'].includes(colLetters) && rNum >= 7) {
      const sMatch = rest.match(/s="(\d+)"/);
      const sAttr = sMatch ? ` s="${sMatch[1]}"` : '';
      return `<c r="${colLetters}${rNum}"${sAttr}></c>`;
    }
    return match;
  });

  // 7. Add <drawing r:id="rId1"/> to sheet2
  if (!sheet2Xml.includes('<drawing r:id="rId1"/>')) {
    const pmMatch = sheet2Xml.match(/<pageMargins[^>]*\/>/);
    if (pmMatch) {
      const idx = pmMatch.index + pmMatch[0].length;
      sheet2Xml = sheet2Xml.slice(0, idx) + '<drawing r:id="rId1"/>' + sheet2Xml.slice(idx);
    } else {
      sheet2Xml = sheet2Xml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
    }
  }

  // 8. Map rows in sheet2 to photos
  const rowRegex = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  const cellImages = {}; // key: "r0,c0" => array of { path, file }
  const poleFoldersList = Object.keys(photoIndex).sort();
  let matchedPoles = 0;
  let totalDataRows = 0;
  const missingPoles = [];

  while ((rowMatch = rowRegex.exec(sheet2Xml)) !== null) {
    const r1 = parseInt(rowMatch[1], 10);
    if (r1 < 7) continue;
    totalDataRows++;
    const r0 = r1 - 1;
    const rowContent = rowMatch[2];

    // Try finding exact folder in HYPERLINK formula
    let folderMatch = null;
    const fMatch = rowContent.match(/Picture\/([^/]+)\/Photo\//i);
    if (fMatch && photoIndex[fMatch[1]]) {
      folderMatch = fMatch[1];
    } else {
      // Try finding Pole ID (col D) and Pole Name (col F)
      const dMatch = rowContent.match(/<c r="D\d+"[^>]*>[\s\S]*?<t>([^<]+)<\/t>/);
      const fColMatch = rowContent.match(/<c r="F\d+"[^>]*>[\s\S]*?<t>([^<]+)<\/t>/);
      const pid = dMatch ? dMatch[1].trim() : '';
      const pname = fColMatch ? fColMatch[1].trim() : '';

      if (pid && pname) {
        const prefix = `${pid}_${pname}_`;
        folderMatch = poleFoldersList.find(f => f.startsWith(prefix));
      }
    }

    if (!folderMatch || !photoIndex[folderMatch]) {
      missingPoles.push(`Row ${r1}`);
      continue;
    }

    matchedPoles++;
    for (const cat of CATEGORY_ORDER) {
      const col0 = CATEGORY_COLS[cat];
      const items = photoIndex[folderMatch][cat];
      if (items && items.length > 0) {
        items.sort((a, b) => a.path.localeCompare(b.path));
        cellImages[`${r0},${col0}`] = items;
      }
    }
  }

  let totalImages = 0;
  for (const k in cellImages) {
    totalImages += cellImages[k].length;
  }

  onProgress(45, `Mapped ${matchedPoles} poles (${totalImages} photos to embed)...`, { stage: 3 });

  // 9. Build drawing1.xml & drawing1.xml.rels
  const drawingXmlParts = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  ];
  const relsXmlParts = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  ];

  let imageCounter = 0;
  const sortedKeys = Object.keys(cellImages).sort((a, b) => {
    const [rA, cA] = a.split(',').map(Number);
    const [rB, cB] = b.split(',').map(Number);
    return rA !== rB ? rA - rB : cA - cB;
  });

  for (let kIdx = 0; kIdx < sortedKeys.length; kIdx++) {
    const k = sortedKeys[kIdx];
    const [r0, col0] = k.split(',').map(Number);
    const imgs = cellImages[k];
    const layouts = computeImageLayout(imgs.length);

    for (let imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
      imageCounter++;
      const rId = `rId${imageCounter}`;
      const imgRelPath = `../media/image${imageCounter}.jpeg`;

      // Read image bytes and write to xl/media/
      const imgBytes = await imgs[imgIdx].file.async('uint8array');
      xlsxZip.file(`xl/media/image${imageCounter}.jpeg`, imgBytes);

      relsXmlParts.push(
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${imgRelPath}"/>`
      );

      const lay = layouts[imgIdx];
      const colOff = lay.colOff;
      const rowOff = lay.rowOff;
      const cx = lay.cx;
      const cy = lay.cy;
      const toColOff = colOff + cx;
      const toRowOff = rowOff + cy;

      const anchorXml = (
        `<xdr:twoCellAnchor editAs="oneCell">` +
        `<xdr:from><xdr:col>${col0}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${col0}</xdr:col><xdr:colOff>${toColOff}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${toRowOff}</xdr:rowOff></xdr:to>` +
        `<xdr:pic>` +
        `<xdr:nvPicPr><xdr:cNvPr id="${imageCounter}" name="Picture ${imageCounter}" descr="Picture"/><xdr:cNvPicPr><a:picLocks noChangeAspect="true"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="${colOff}" y="${rowOff}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
        `</xdr:pic>` +
        `<xdr:clientData/>` +
        `</xdr:twoCellAnchor>`
      );
      drawingXmlParts.push(anchorXml);
    }

    if (kIdx % 20 === 0) {
      const pct = 45 + Math.floor((kIdx / sortedKeys.length) * 40);
      onProgress(pct, `Embedding pictures into cells (${imageCounter}/${totalImages})...`, { stage: 3 });
    }
  }

  drawingXmlParts.push('</xdr:wsDr>');
  relsXmlParts.push('</Relationships>');

  // 10. Update files in Excel package
  xlsxZip.file('xl/worksheets/sheet2.xml', sheet2Xml);
  xlsxZip.file('xl/drawings/drawing1.xml', drawingXmlParts.join(''));
  xlsxZip.file('xl/drawings/_rels/drawing1.xml.rels', relsXmlParts.join(''));

  const sheet2RelsContent = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>' +
    '</Relationships>'
  );
  xlsxZip.file('xl/worksheets/_rels/sheet2.xml.rels', sheet2RelsContent);

  if (!contentTypesXml.includes('Extension="jpeg"')) {
    contentTypesXml = contentTypesXml.replace('<Types', '<Types><Default ContentType="image/jpeg" Extension="jpeg"/>');
  }
  if (!contentTypesXml.includes('drawing1.xml')) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Override ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" PartName="/xl/drawings/drawing1.xml"/></Types>'
    );
  }
  xlsxZip.file('[Content_Types].xml', contentTypesXml);

  onProgress(90, "Compiling final Excel workbook with embedded pictures...", { stage: 4 });

  // 11. Generate final .xlsx Blob or Buffer
  const outData = await xlsxZip.generateAsync({
    type: (typeof window !== 'undefined' ? 'blob' : 'nodebuffer'),
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const sizeBytes = outData.size || outData.length || 0;
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);

  let outFilename = excelFilename;
  if (outFilename.includes('excel(excel and attachment)')) {
    outFilename = outFilename.replace('excel(excel and attachment)', 'excel(excelPic)');
  } else {
    outFilename = outFilename.replace(/\.xlsx$/i, '_excelPic.xlsx');
  }

  onProgress(100, "Conversion complete! Ready to download.", { stage: 4 });

  return {
    data: outData,
    filename: outFilename,
    matched_poles: matchedPoles,
    total_images: totalImages,
    total_cells: Object.keys(cellImages).length,
    file_size_mb: sizeMb,
    elapsed_seconds: elapsedSec,
    missing_poles: missingPoles
  };
}

// Node.js export compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    processSurveyZip,
    computeImageLayout,
    CATEGORY_COLS,
    CATEGORY_ORDER
  };
}
