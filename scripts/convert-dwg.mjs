import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const globeTemplateFile = [
  "C:\\WINDOWS\\system32\\Stencil Template.dwg",
  "C:\\WINDOWS\\system32\\Stencil Template.dws",
  "C:\\Windows\\System32\\Stencil Template.dxf",
  join(workspaceRoot, "public", "Stencil Template.dwg"),
  join(workspaceRoot, "public", "Stencil Template.dws"),
  join(workspaceRoot, "public", "Stencil Template.dxf"),
  join(workspaceRoot, "dist", "Stencil Template.dwg"),
  join(workspaceRoot, "dist", "Stencil Template.dws"),
  join(workspaceRoot, "dist", "Stencil Template.dxf"),
].find(existsSync) || "C:\\WINDOWS\\system32\\Stencil Template.dws";

const pldtTemplateFile = [
  "C:\\Users\\My Pc\\OneDrive\\Documents\\PLDT Stencil template.dwg",
  "C:\\Users\\My Pc\\OneDrive\\Documents\\PLDT Stencil template.dxf",
  join(workspaceRoot, "public", "PLDT Stencil template.dwg"),
  join(workspaceRoot, "public", "PLDT Stencil template.dxf"),
  join(workspaceRoot, "dist", "PLDT Stencil template.dwg"),
  join(workspaceRoot, "dist", "PLDT Stencil template.dxf"),
].find(existsSync) || join(workspaceRoot, "public", "PLDT Stencil template.dxf");

const stencilTemplateFile = globeTemplateFile;
export function findAutoCadConsoles() {
  const candidates = [];
  if (process.env.AUTOCAD_CONSOLE) candidates.push(process.env.AUTOCAD_CONSOLE);
  if (process.platform !== "win32") return candidates.filter(existsSync);

  try {
    candidates.push(...execFileSync("where.exe", ["accoreconsole.exe"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/));
  } catch {
    // PATH lookup is optional; continue with registry and drive discovery.
  }
  try {
    const registry = execFileSync("reg.exe", ["query", "HKLM\\SOFTWARE\\Autodesk", "/s", "/f", "accoreconsole.exe", "/d"], { encoding: "utf8" });
    candidates.push(...registry.match(/[A-Z]:\\[^\r\n]*accoreconsole\.exe/gi) || []);
  } catch {
    // Registry lookup is optional on machines without Autodesk registry keys.
  }

  const scan = (folder, depth) => {
    if (depth < 0 || !existsSync(folder)) return;
    try {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const fullPath = `${folder}\\${entry.name}`;
        if (entry.isFile() && entry.name.toLowerCase() === "accoreconsole.exe") candidates.push(fullPath);
        else if (entry.isDirectory()) scan(fullPath, depth - 1);
      }
    } catch {
      // Ignore inaccessible folders.
    }
  };

  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:`;
    for (const parent of ["Program Files\\Autodesk", "Program Files (x86)\\Autodesk", "Autodesk"]) {
      const folder = `${drive}\\${parent}`;
      if (!existsSync(folder)) continue;
      try {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          if (!entry.isDirectory() || !/autocad/i.test(entry.name)) continue;
          scan(`${folder}\\${entry.name}`, 5);
        }
      } catch {
        // Ignore inaccessible drives and continue searching other locations.
      }
    }
    try {
      for (const entry of readdirSync(`${drive}\\`, { withFileTypes: true })) {
        if (entry.isDirectory() && /^autocad(?:\s|_|$)/i.test(entry.name)) scan(`${drive}\\${entry.name}`, 2);
      }
    } catch {
      // Ignore inaccessible drive roots.
    }
  }

  const found = candidates.map((candidate) => String(candidate).trim()).filter(existsSync);
  found.sort((left, right) => {
    const year = (value) => Number(value.match(/autocad[_ ](20\d{2})/i)?.[1] || 0);
    return year(right) - year(left);
  });
  return [...new Set(found)];
}

export function findAutoCadConsole() {
  return findAutoCadConsoles()[0] || "";
}

function safeFileBase(value) {
  return (value || "ftth-template").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "ftth-template";
}

function consoleText(value) {
  return String(value || "").replace(/\0/g, "");
}

/** Prefer a path AutoCAD scripts won't split on spaces. */
function autocadSafePath(longPath) {
  if (process.platform !== "win32" || !/\s/.test(longPath)) return longPath.replaceAll("\\", "/");
  try {
    const short = execFileSync(
      "cmd.exe",
      ["/d", "/s", "/c", `for %I in ("${longPath.replaceAll('"', "")}") do @echo %~sI`],
      { encoding: "utf8" },
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop();
    if (short && !/\s/.test(short)) return short.replaceAll("\\", "/");
  } catch {
    // Fall through to quoted long path.
  }
  return longPath.replaceAll("\\", "/");
}

function runAutoCadConsole(autoCadConsole, inputDxf, scriptPath) {
  return new Promise((resolveRun, rejectRun) => {
    execFile(autoCadConsole, ["/i", inputDxf, "/s", scriptPath], { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        rejectRun(new Error(`${error.message}\n${stdout}\n${stderr}`));
        return;
      }
      resolveRun({ stdout, stderr });
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000_000) {
        rejectBody(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}

export function isConvertDwgRequest(req) {
  const url = req.url || "";
  const path = url.split("?")[0];
  return req.method === "POST" && (path === "/api/convert-dwg" || path === "/api/convert-dwg/");
}

export async function convertDxfToDwg(payload) {
  // The requested workflow targets the user's AutoCAD 2027 installation.
  // Do not silently switch to an older AutoCAD when 2027's profile is broken.
  const autoCadConsoles = findAutoCadConsoles().slice(0, 1);
  if (!autoCadConsoles.length) {
    const err = new Error("AutoCAD console was not found on this computer.");
    err.statusCode = 501;
    throw err;
  }

  const dxf = String(payload?.dxf || "");
  if (!dxf.includes("EOF")) throw new Error("No valid DXF content was received.");

  // Keep temporary conversion files outside the packaged application.
  const outDir = process.env.FTTH_EXPORT_DIR
    ? resolve(process.env.FTTH_EXPORT_DIR)
    : join(tmpdir(), "ftth-kmz-to-cad-exports");
  mkdirSync(outDir, { recursive: true });

  const base = `${Date.now()}-${safeFileBase(payload?.fileName)}`;
  const inputDxf = join(outDir, `${base}.dxf`);
  const outputDwg = join(outDir, `${base}.dwg`);
  const scriptPath = join(outDir, `${base}.scr`);
  const safeOutput = autocadSafePath(outputDwg);
  const quotedOutput = /\s/.test(safeOutput) ? `"${safeOutput}"` : safeOutput;

  writeFileSync(inputDxf, dxf, "utf8");
  // Clean native rewrite so COPYCLIP/PASTECLIP into other drawings does not return "Invalid".
  const scriptLines = [
      "FILEDIA",
      "0",
      "CMDDIA",
      "0",
      "AUDIT",
      "Y",
      "-PURGE",
      "A",
      "*",
      "N",
      "-PURGE",
      "A",
      "*",
      "N",
  ];

  if (payload?.stencilTemplate || payload?.electricStencil) {
    if (!existsSync(stencilTemplateFile)) {
      throw new Error("The provided Stencil Template (Stencil Template.dws / .dwg) is missing from the application files.");
    }
  }

  scriptLines.push("SAVEAS", "2018", quotedOutput, "QUIT", "Y", "");
  writeFileSync(scriptPath, scriptLines.join("\r\n"), "utf8");

  let autoCadResult = { stdout: "", stderr: "" };
  const autoCadFailures = [];
  for (const autoCadConsole of autoCadConsoles) {
    try {
      autoCadResult = await runAutoCadConsole(autoCadConsole, inputDxf, scriptPath);
    } catch (error) {
      autoCadResult = {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
    autoCadFailures.push({ autoCadConsole, ...autoCadResult });
    if (existsSync(outputDwg)) break;
  }

  if (!existsSync(outputDwg)) {
    const profileFailure = autoCadFailures.some(({ stdout, stderr }) => /current profile|setting up profile/i.test(`${consoleText(stdout)}\n${consoleText(stderr)}`));
    if (profileFailure) {
      throw new Error(
        "AutoCAD was found, but its current profile could not be initialized. Open AutoCAD 2027 once with this Windows account, finish its first-run setup, close it, then retry the DWG export.",
      );
    }
    throw new Error(
      `AutoCAD finished but did not create a DWG file.\n${autoCadResult.stdout}\n${autoCadResult.stderr}`,
    );
  }

  return {
    buffer: readFileSync(outputDwg),
    fileName: `${safeFileBase(payload?.fileName)}.dwg`,
  };
}

const LICENSE_EXPIRY_TIMESTAMP = new Date("2027-09-02T23:59:59Z").getTime();

export async function handleConvertDwg(req, res) {
  try {
    if (Date.now() > LICENSE_EXPIRY_TIMESTAMP) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "Software license expired on September 2, 2027. Please contact Caesar Ian Samulde for renewal." }));
      return;
    }
    const raw = await readJsonBody(req);
    const payload = JSON.parse(raw);
    const { buffer, fileName } = await convertDxfToDwg(payload);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/acad");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "DWG conversion failed." }));
  }
}
