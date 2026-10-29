import React, { useState, useRef } from "react";
import JSZip from "jszip";
import {
  UploadCloud,
  FileSpreadsheet,
  FolderArchive,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  Clock,
  Sparkles,
  FolderOpen
} from "lucide-react";

const CATEGORY_COLS: Record<string, number> = {
  Photo: 24,
  "Pole tag photo": 25,
  "Pole top photo": 26,
  "Pole bottom photo": 27,
  "Element photo": 28
};

const CATEGORY_ORDER = ["Photo", "Pole tag photo", "Pole top photo", "Pole bottom photo", "Element photo"];

function computeImageLayout(count: number) {
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

interface PackageMeta {
  file: Blob | File;
  name: string;
  excelFile: string;
  poleCount: number | string;
  photoCount: number | string;
}

interface ConversionResult {
  blob: Blob;
  filename: string;
  matchedPoles: number;
  totalImages: number;
  totalCells: number;
  fileSizeMb: string;
  elapsedSeconds: number;
  missingPoles: string[];
}

export function ExcelPicConverter() {
  const [dragOver, setDragOver] = useState(false);
  const [pkg, setPkg] = useState<PackageMeta | null>(null);
  const [converting, setConverting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressStage, setProgressStage] = useState(1);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleZipSelected = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      let xlsxName = "";
      let photoCount = 0;
      const poleFolders = new Set<string>();

      for (const p of Object.keys(zip.files)) {
        const lower = p.toLowerCase();
        const base = p.split("/").pop() || "";
        if (lower.endsWith(".xlsx") && !base.startsWith("~$") && !lower.includes("__macosx")) {
          if (!xlsxName || lower.includes("excel(excel and attachment)")) {
            xlsxName = base;
          }
        }
        if ([".jpg", ".jpeg", ".png"].some((ext) => lower.endsWith(ext)) && !lower.includes("__macosx")) {
          photoCount++;
          const parts = p.split("/");
          const picIdx = parts.findIndex((part) => part.toLowerCase() === "picture" || part.toLowerCase() === "pictures");
          if (picIdx !== -1 && picIdx + 1 < parts.length) {
            poleFolders.add(parts[picIdx + 1]);
          }
        }
      }

      setPkg({
        file,
        name: file.name,
        excelFile: xlsxName || "Survey Excel Ready",
        poleCount: poleFolders.size || "~",
        photoCount: photoCount || "~"
      });
      setResult(null);
    } catch (err: any) {
      alert("Error reading ZIP package: " + err.message);
    }
  };

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const zip = new JSZip();
      let xlsxName = "";
      let photoCount = 0;
      const poleFolders = new Set<string>();
      const folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "Survey_Batch";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath || file.name;
        const lower = relPath.toLowerCase();

        if (lower.endsWith(".xlsx") && !file.name.startsWith("~$") && !lower.includes("__macosx")) {
          if (!xlsxName || lower.includes("excel(excel and attachment)")) {
            xlsxName = file.name;
          }
        }
        if ([".jpg", ".jpeg", ".png"].some((ext) => lower.endsWith(ext))) {
          photoCount++;
          const parts = relPath.split("/");
          const picIdx = parts.findIndex((p) => p.toLowerCase() === "picture" || p.toLowerCase() === "pictures");
          if (picIdx !== -1 && picIdx + 1 < parts.length) {
            poleFolders.add(parts[picIdx + 1]);
          }
        }
        zip.file(relPath, file);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      setPkg({
        file: zipBlob,
        name: folderName,
        excelFile: xlsxName || "Survey Excel Ready",
        poleCount: poleFolders.size || "~",
        photoCount: photoCount || "~"
      });
      setResult(null);
    } catch (err: any) {
      alert("Error reading folder: " + err.message);
    }
  };

  const runConversion = async () => {
    if (!pkg) return;
    setConverting(true);
    setProgressPct(5);
    setProgressMsg("Scanning ZIP archive contents...");
    setProgressStage(1);
    setResult(null);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startTime) / 1000));
    }, 500);

    try {
      const rootZip = await JSZip.loadAsync(pkg.file);
      let excelEntryPath = "";
      const allFiles = Object.keys(rootZip.files);
      for (const p of allFiles) {
        const lower = p.toLowerCase();
        const base = p.split("/").pop() || "";
        if (lower.endsWith(".xlsx") && !base.startsWith("~$") && !lower.includes("__macosx")) {
          if (!excelEntryPath || lower.includes("excel(excel and attachment)")) {
            excelEntryPath = p;
          }
        }
      }

      if (!excelEntryPath) {
        throw new Error("No survey Excel (.xlsx) file found inside the package.");
      }

      const excelFilename = excelEntryPath.split("/").pop() || "survey.xlsx";
      setProgressPct(15);
      setProgressMsg(`Found survey Excel: ${excelFilename}`);

      // Index photos
      const photoIndex: Record<string, Record<string, { path: string; file: any }[]>> = {};
      const photoExts = [".jpg", ".jpeg", ".png"];
      for (const p of allFiles) {
        const lower = p.toLowerCase();
        if (photoExts.some((ext) => lower.endsWith(ext)) && !lower.includes("__macosx")) {
          const parts = p.split("/");
          const picIdx = parts.findIndex((part) => part.toLowerCase() === "picture" || part.toLowerCase() === "pictures");
          if (picIdx !== -1 && picIdx + 2 < parts.length) {
            const poleFolder = parts[picIdx + 1];
            const category = parts[picIdx + 2];
            const fileName = parts.slice(picIdx + 3).join("/");
            if (CATEGORY_COLS[category] !== undefined && fileName) {
              if (!photoIndex[poleFolder]) photoIndex[poleFolder] = {};
              if (!photoIndex[poleFolder][category]) photoIndex[poleFolder][category] = [];
              photoIndex[poleFolder][category].push({ path: p, file: rootZip.file(p) });
            }
          }
        }
      }

      setProgressPct(25);
      setProgressMsg("Reading pole records from Excel and mapping photo directories...");
      setProgressStage(2);

      const excelData = await rootZip.file(excelEntryPath)!.async("uint8array");
      const xlsxZip = await JSZip.loadAsync(excelData);

      let sheet2Xml = await xlsxZip.file("xl/worksheets/sheet2.xml")!.async("text");
      let contentTypesXml = await xlsxZip.file("[Content_Types].xml")!.async("text");

      if (!sheet2Xml.includes("xmlns:r=")) {
        sheet2Xml = sheet2Xml.replace(
          "<worksheet ",
          '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        );
      }

      // Column widths (cols 25..29 = 62.5)
      const colsMatch = sheet2Xml.match(/<cols>[\s\S]*?<\/cols>/);
      if (colsMatch) {
        let colsXml = colsMatch[0];
        for (let cIdx = 25; cIdx <= 29; cIdx++) {
          const colPat = new RegExp(`<col min="${cIdx}" max="${cIdx}"[^>]*/>`);
          const newTag = `<col min="${cIdx}" max="${cIdx}" width="62.5" customWidth="true"/>`;
          if (colPat.test(colsXml)) {
            colsXml = colsXml.replace(colPat, newTag);
          } else {
            colsXml = colsXml.replace("</cols>", `${newTag}</cols>`);
          }
        }
        sheet2Xml = sheet2Xml.replace(colsMatch[0], colsXml);
      }

      // Row heights to 150.0 for data rows >= 7
      sheet2Xml = sheet2Xml.replace(/<row r="(\d+)"([^>]*)>/g, (match, rNum, rest) => {
        const rowInt = parseInt(rNum, 10);
        if (rowInt >= 7) {
          const cleanRest = rest.replace(/\s+ht="[^"]*"/g, "").replace(/\s+customHeight="[^"]*"/g, "");
          return `<row r="${rNum}"${cleanRest} customHeight="1" ht="150.0">`;
        }
        return match;
      });

      // Clear cells Y, Z, AA, AB, AC for rows >= 7
      sheet2Xml = sheet2Xml.replace(
        /<c r="([A-Z]+)(\d+)"([^>]*)>[\s\S]*?<\/c>|<c r="([A-Z]+)(\d+)"([^>]*)\/>/g,
        (match, col1, r1, rest1, col2, r2, rest2) => {
          const colLetters = col1 || col2;
          const rNum = parseInt(r1 || r2, 10);
          const rest = rest1 || rest2 || "";
          if (["Y", "Z", "AA", "AB", "AC"].includes(colLetters) && rNum >= 7) {
            const sMatch = rest.match(/s="(\d+)"/);
            const sAttr = sMatch ? ` s="${sMatch[1]}"` : "";
            return `<c r="${colLetters}${rNum}"${sAttr}></c>`;
          }
          return match;
        }
      );

      // Add drawing element
      if (!sheet2Xml.includes('<drawing r:id="rId1"/>')) {
        const pmMatch = sheet2Xml.match(/<pageMargins[^>]*\/>/);
        if (pmMatch) {
          const idx = pmMatch.index! + pmMatch[0].length;
          sheet2Xml = sheet2Xml.slice(0, idx) + '<drawing r:id="rId1"/>' + sheet2Xml.slice(idx);
        } else {
          sheet2Xml = sheet2Xml.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
        }
      }

      // Map rows to photos
      const rowRegex = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
      let rowMatch: RegExpExecArray | null;
      const cellImages: Record<string, { path: string; file: any }[]> = {};
      const poleFoldersList = Object.keys(photoIndex).sort();
      let matchedPoles = 0;
      const missingPoles: string[] = [];

      while ((rowMatch = rowRegex.exec(sheet2Xml)) !== null) {
        const r1 = parseInt(rowMatch[1], 10);
        if (r1 < 7) continue;
        const r0 = r1 - 1;
        const rowContent = rowMatch[2];

        let folderMatch: string | undefined = undefined;
        const fMatch = rowContent.match(/Picture\/([^/]+)\/Photo\//i);
        if (fMatch && photoIndex[fMatch[1]]) {
          folderMatch = fMatch[1];
        } else {
          const dMatch = rowContent.match(/<c r="D\d+"[^>]*>[\s\S]*?<t>([^<]+)<\/t>/);
          const fColMatch = rowContent.match(/<c r="F\d+"[^>]*>[\s\S]*?<t>([^<]+)<\/t>/);
          const pid = dMatch ? dMatch[1].trim() : "";
          const pname = fColMatch ? fColMatch[1].trim() : "";
          if (pid && pname) {
            const prefix = `${pid}_${pname}_`;
            folderMatch = poleFoldersList.find((f) => f.startsWith(prefix));
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
      for (const k in cellImages) totalImages += cellImages[k].length;

      setProgressPct(45);
      setProgressMsg(`Mapped ${matchedPoles} poles (${totalImages} photos to embed)...`);
      setProgressStage(3);

      // Build drawing1.xml and drawing1.xml.rels
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
        const [rA, cA] = a.split(",").map(Number);
        const [rB, cB] = b.split(",").map(Number);
        return rA !== rB ? rA - rB : cA - cB;
      });

      for (let kIdx = 0; kIdx < sortedKeys.length; kIdx++) {
        const k = sortedKeys[kIdx];
        const [r0, col0] = k.split(",").map(Number);
        const imgs = cellImages[k];
        const layouts = computeImageLayout(imgs.length);

        for (let imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
          imageCounter++;
          const rId = `rId${imageCounter}`;
          const imgRelPath = `../media/image${imageCounter}.jpeg`;

          const imgBytes = await imgs[imgIdx].file.async("uint8array");
          xlsxZip.file(`xl/media/image${imageCounter}.jpeg`, imgBytes);

          relsXmlParts.push(
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${imgRelPath}"/>`
          );

          const lay = layouts[imgIdx];
          const colOff = lay.colOff;
          const rowOff = lay.rowOff;
          const cx = lay.cx;
          const cy = lay.cy;

          drawingXmlParts.push(
            `<xdr:twoCellAnchor editAs="oneCell">` +
              `<xdr:from><xdr:col>${col0}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>` +
              `<xdr:to><xdr:col>${col0}</xdr:col><xdr:colOff>${colOff + cx}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${rowOff + cy}</xdr:rowOff></xdr:to>` +
              `<xdr:pic>` +
              `<xdr:nvPicPr><xdr:cNvPr id="${imageCounter}" name="Picture ${imageCounter}" descr="Picture"/><xdr:cNvPicPr><a:picLocks noChangeAspect="true"/></xdr:cNvPicPr></xdr:nvPicPr>` +
              `<xdr:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
              `<xdr:spPr><a:xfrm><a:off x="${colOff}" y="${rowOff}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
              `</xdr:pic>` +
              `<xdr:clientData/>` +
              `</xdr:twoCellAnchor>`
          );
        }

        if (kIdx % 20 === 0) {
          const pct = 45 + Math.floor((kIdx / sortedKeys.length) * 40);
          setProgressPct(pct);
          setProgressMsg(`Embedding pictures into cells (${imageCounter}/${totalImages})...`);
        }
      }

      drawingXmlParts.push("</xdr:wsDr>");
      relsXmlParts.push("</Relationships>");

      xlsxZip.file("xl/worksheets/sheet2.xml", sheet2Xml);
      xlsxZip.file("xl/drawings/drawing1.xml", drawingXmlParts.join(""));
      xlsxZip.file("xl/drawings/_rels/drawing1.xml.rels", relsXmlParts.join(""));

      const sheet2Rels =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>' +
        "</Relationships>";
      xlsxZip.file("xl/worksheets/_rels/sheet2.xml.rels", sheet2Rels);

      if (!contentTypesXml.includes('Extension="jpeg"')) {
        contentTypesXml = contentTypesXml.replace("<Types", '<Types><Default ContentType="image/jpeg" Extension="jpeg"/>');
      }
      if (!contentTypesXml.includes("drawing1.xml")) {
        contentTypesXml = contentTypesXml.replace(
          "</Types>",
          '<Override ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" PartName="/xl/drawings/drawing1.xml"/></Types>'
        );
      }
      xlsxZip.file("[Content_Types].xml", contentTypesXml);

      setProgressPct(90);
      setProgressMsg("Compiling final Excel workbook with embedded pictures...");
      setProgressStage(4);

      const outBlob = await xlsxZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      clearInterval(timer);

      let outFilename = excelFilename;
      if (outFilename.includes("excel(excel and attachment)")) {
        outFilename = outFilename.replace("excel(excel and attachment)", "excel(excelPic)");
      } else {
        outFilename = outFilename.replace(/\.xlsx$/i, "_excelPic.xlsx");
      }

      const res: ConversionResult = {
        blob: outBlob,
        filename: outFilename,
        matchedPoles,
        totalImages,
        totalCells: Object.keys(cellImages).length,
        fileSizeMb: (outBlob.size / (1024 * 1024)).toFixed(1),
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        missingPoles
      };

      setResult(res);
      setConverting(false);

      // Trigger auto download
      triggerDownload(outBlob, outFilename);
    } catch (err: any) {
      clearInterval(timer);
      setConverting(false);
      alert("Conversion Failed: " + err.message);
    }
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Hero Drop Zone (When not converting & no result) */}
      {!converting && !result && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                if (files[0].name.toLowerCase().endsWith(".zip")) {
                  handleZipSelected(files[0]);
                } else {
                  alert("To convert a folder, please click 'Browse Folder...'");
                }
              }
            }}
            style={{
              border: `2px dashed ${dragOver ? "#38bdf8" : "#334155"}`,
              borderRadius: "14px",
              padding: "44px 24px",
              textAlign: "center",
              background: dragOver ? "rgba(56, 189, 248, 0.08)" : "#131a2a",
              transition: "all 0.2s ease",
              marginBottom: "20px"
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px"
              }}
            >
              <UploadCloud size={32} />
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc", marginBottom: "6px" }}>
              Select or Drag & Drop Survey Package
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#94a3b8", marginBottom: "22px" }}>
              Upload your survey batch <strong>.ZIP archive</strong> or unzipped folder containing <code>.xlsx</code> and{" "}
              <code>Picture/</code>
            </p>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btnPrimary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: "8px"
                }}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen size={18} />
                Browse Folder...
              </button>

              <button
                type="button"
                className="btnSecondary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: "8px",
                  background: "#1e293b",
                  color: "#f8fafc",
                  border: "1px solid #334155"
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderArchive size={18} />
                Select .ZIP Archive...
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".zip"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleZipSelected(e.target.files[0]);
                }
              }}
            />
            <input
              type="file"
              ref={(el) => {
                if (el) {
                  el.setAttribute("webkitdirectory", "");
                  el.setAttribute("directory", "");
                }
                (folderInputRef as any).current = el;
              }}
              multiple
              style={{ display: "none" }}
              onChange={handleFolderSelected}
            />
          </div>

          {/* Package Preview Card */}
          {pkg && (
            <div
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "24px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "8px",
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f8fafc" }}>{pkg.name}</div>
                    <div style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{pkg.excelFile}</div>
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                  onClick={() => setPkg(null)}
                >
                  Change
                </button>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    fontWeight: 600
                  }}
                >
                  <CheckCircle2 size={14} />
                  Survey Excel Ready
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    fontWeight: 600
                  }}
                >
                  <CheckCircle2 size={14} />
                  {pkg.poleCount} Poles with Photos
                </span>
              </div>

              <button
                type="button"
                className="btnPrimary"
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  fontSize: "1rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
                onClick={runConversion}
              >
                <Sparkles size={18} />
                Convert to Excel with Pictures
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conversion Progress Stepper */}
      {converting && (
        <div
          style={{
            background: "#131a2a",
            border: "1px solid #334155",
            borderRadius: "14px",
            padding: "36px 24px",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "#38bdf8", fontFamily: "monospace", marginBottom: "4px" }}>
            {progressPct}%
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#f8fafc", marginBottom: "24px" }}>{progressMsg}</div>

          {/* 4-Step Stepper Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              marginBottom: "24px",
              textAlign: "left"
            }}
          >
            {[
              { num: 1, label: "Package Locate" },
              { num: 2, label: "Map Pole Records" },
              { num: 3, label: "Embed Pictures" },
              { num: 4, label: "Compile Output" }
            ].map((step) => {
              const isDone = progressStage > step.num;
              const isActive = progressStage === step.num;
              return (
                <div
                  key={step.num}
                  style={{
                    background: isActive ? "rgba(56, 189, 248, 0.12)" : "#1e293b",
                    border: `1px solid ${isActive ? "#38bdf8" : isDone ? "#10b981" : "#334155"}`,
                    borderRadius: "8px",
                    padding: "10px",
                    opacity: isDone || isActive ? 1 : 0.45
                  }}
                >
                  <div style={{ fontSize: "0.72rem", color: isDone ? "#34d399" : isActive ? "#38bdf8" : "#94a3b8", fontWeight: 700 }}>
                    Step {step.num} {isDone ? "✓" : ""}
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "#1e293b",
              borderRadius: "9999px",
              overflow: "hidden",
              marginBottom: "16px"
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                borderRadius: "9999px",
                transition: "width 0.3s ease"
              }}
            />
          </div>

          <div style={{ fontSize: "0.82rem", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Clock size={14} /> Elapsed: {elapsedSec}s
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {result && (
        <div
          style={{
            background: "#131a2a",
            border: "1px solid #334155",
            borderRadius: "14px",
            padding: "32px 24px"
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#10b981",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)"
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f8fafc", marginBottom: "4px" }}>
              Excel File Successfully Generated!
            </h3>
            <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontFamily: "monospace" }}>{result.filename}</div>
          </div>

          {/* Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "10px",
              marginBottom: "24px"
            }}
          >
            {[
              { val: result.matchedPoles, label: "Poles Matched" },
              { val: result.totalImages.toLocaleString(), label: "Images Embedded" },
              { val: result.totalCells.toLocaleString(), label: "Cells Populated" },
              { val: `${result.fileSizeMb} MB`, label: "Output Size" },
              { val: `${result.elapsedSeconds}s`, label: "Time Elapsed" }
            ].map((m, idx) => (
              <div
                key={idx}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  padding: "14px 8px",
                  textAlign: "center"
                }}
              >
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>{m.val}</div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Missing photos notice */}
          {result.missingPoles.length > 0 && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "24px",
                fontSize: "0.88rem"
              }}
            >
              <div style={{ color: "#fbbf24", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={16} />
                Quality Notice: {result.missingPoles.length} pole rows had no matching photos
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btnPrimary"
              style={{
                padding: "12px 24px",
                fontSize: "0.95rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "8px",
                cursor: "pointer"
              }}
              onClick={() => triggerDownload(result.blob, result.filename)}
            >
              <Download size={18} />
              Download Excel File
            </button>
            <button
              type="button"
              className="btnSecondary"
              style={{
                padding: "12px 20px",
                fontSize: "0.95rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "8px",
                cursor: "pointer",
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155"
              }}
              onClick={() => {
                setResult(null);
                setPkg(null);
              }}
            >
              <RefreshCw size={16} />
              Convert Another Package
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
